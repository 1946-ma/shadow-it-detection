"""
Firewall-rule suggestion + execution — closes the detect-to-respond loop.

Generates a draft enforcement command from a detection (never auto-applied)
and, on admin approval, actually runs it against the real target: SSH to
`docker-host` (ufw / `docker stop`) or `vmrun` guest-ops to the two Windows
VMs (native Windows Firewall) — the exact mechanisms proven by hand during
the bank-net network-segmentation work (see bank-net/README.md's "Network
Segmentation Policy" section for the gotchas this module encodes).

Deliberately honest about what's actually enforceable: macvlan container
traffic (teller-01/02, rogue-pi, exfil-01) bypasses docker-host's own
netfilter entirely (a Linux macvlan property, confirmed empirically this
session), so a selective egress block there would be a no-op. The only real
action for those hosts is `docker stop` (full quarantine) — offered instead
of a misleading command. Hosts with no known enforcement point stay
advisory-only.
"""
import ipaddress
import os
import shlex
import subprocess

# ── Known network topology (bank-net testbed) ──────────────────────────────
# Static for now — a natural home for a future asset/CMDB table rather than a
# hardcoded map, but that's out of scope here.
KNOWN_HOSTS = {
    "192.168.137.40": {"kind": "linux-ufw-host", "label": "docker-host"},
    "192.168.137.244": {
        "kind": "windows-vm", "label": "support-ws",
        "vmx_env": "FIREWALL_SUPPORT_WS_VMX",
        "user_env": "FIREWALL_SUPPORT_WS_USER",
        "pass_env": "FIREWALL_SUPPORT_WS_PASS",
    },
    "192.168.137.243": {
        "kind": "windows-vm", "label": "employee-ws",
        "vmx_env": "FIREWALL_EMPLOYEE_WS_VMX",
        "user_env": "FIREWALL_EMPLOYEE_WS_USER",
        "pass_env": "FIREWALL_EMPLOYEE_WS_PASS",
    },
    "192.168.137.41": {"kind": "macvlan-container", "label": "teller-01", "container_name": "bank-net-teller-01-1"},
    "192.168.137.42": {"kind": "macvlan-container", "label": "teller-02", "container_name": "bank-net-teller-02-1"},
    "192.168.137.45": {"kind": "macvlan-container", "label": "rogue-pi",  "container_name": "bank-net-rogue-pi-1"},
    "192.168.137.46": {"kind": "macvlan-container", "label": "exfil-01",  "container_name": "bank-net-exfil-01-1"},
}


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except (ValueError, TypeError):
        return False


def generate_rule_suggestion(detection: dict) -> dict:
    """
    Pure function: detection row (dict, as read from the `detections` table)
    -> a dict shaped for INSERT INTO firewall_rules. Does no DB access and
    executes nothing — see apply_rule() for that.
    """
    target_ip = detection["src_ip"]
    dst_domain = detection.get("dst_domain")
    risk = detection.get("risk_level", "unknown")
    host = KNOWN_HOSTS.get(target_ip)

    base_action = "quarantine" if detection.get("shadow_it_type") == "hardware" else "block-egress"

    if host is None:
        return {
            "target_ip": target_ip,
            "target_label": target_ip,
            "enforcement_kind": "unknown",
            "rule_action": base_action,
            "dst_domain": dst_domain,
            "rationale": (
                f"No known enforcement point for {target_ip} ({risk}-risk detection "
                f"to {dst_domain or 'unknown destination'}). Advisory only — block "
                f"egress to this destination at your perimeter firewall/router or "
                f"add a DNS sinkhole entry."
            ),
            "command_text": (
                f"# No managed host matches {target_ip}.\n"
                f"# Recommended: block egress to {dst_domain or '<destination>'} "
                f"at the perimeter firewall / DNS sinkhole."
            ),
        }

    kind, label = host["kind"], host["label"]

    if kind == "macvlan-container":
        # Selective egress block is a no-op here — docker-host's own ufw/iptables
        # cannot see macvlan container traffic at all (proven this session: the
        # container's virtual NIC hands packets straight to the physical
        # interface driver, bypassing the host namespace's netfilter). The only
        # honest, actually-effective action is stopping the container outright.
        return {
            "target_ip": target_ip,
            "target_label": label,
            "enforcement_kind": kind,
            "rule_action": "quarantine",
            "dst_domain": dst_domain,
            "rationale": (
                f"{label} is a macvlan container — docker-host's firewall cannot "
                f"filter its traffic (macvlan bypasses host netfilter entirely), "
                f"so a selective block of {dst_domain or 'this destination'} would "
                f"be a no-op. Full quarantine (stop the container) is the only "
                f"real enforcement available."
            ),
            "command_text": f"docker stop {host['container_name']}",
        }

    if kind == "linux-ufw-host":
        if base_action == "quarantine":
            command = f"sudo ufw deny out from {target_ip}\nsudo ufw deny in from {target_ip}"
            rationale = f"Rogue/unauthorized device at {target_ip} ({label}) — full quarantine, both directions."
        else:
            scope = f" to {dst_domain}" if _is_ip(dst_domain) else " to any"
            note = "" if _is_ip(dst_domain) else f" (dst_domain '{dst_domain}' is a hostname, not an IP — scope manually if you can resolve it)"
            command = f"sudo ufw deny out from {target_ip}{scope}"
            rationale = f"{risk}-risk detection from {label} ({target_ip}) to {dst_domain or 'unknown'}{note}."
        return {
            "target_ip": target_ip, "target_label": label, "enforcement_kind": kind,
            "rule_action": base_action, "dst_domain": dst_domain,
            "rationale": rationale, "command_text": command,
        }

    if kind == "windows-vm":
        rule_name = f"ShadowIT-{detection['id']}"
        if base_action == "quarantine":
            command = (f'netsh advfirewall firewall add rule name={rule_name} '
                       f'dir=out action=block')
            rationale = f"Rogue/unauthorized activity on {label} ({target_ip}) — full outbound quarantine."
        elif _is_ip(dst_domain):
            command = (f'netsh advfirewall firewall add rule name={rule_name} '
                       f'dir=out action=block remoteip={dst_domain}')
            rationale = f"{risk}-risk detection from {label} ({target_ip}) to {dst_domain}."
        else:
            command = (f'netsh advfirewall firewall add rule name={rule_name} '
                       f'dir=out action=block')
            rationale = (f"{risk}-risk detection from {label} ({target_ip}) to "
                        f"{dst_domain or 'unknown'} — dst is a hostname, not an IP, so "
                        f"netsh can't scope by remoteip; this blocks ALL outbound "
                        f"from {label} instead. Review before approving.")
        return {
            "target_ip": target_ip, "target_label": label, "enforcement_kind": kind,
            "rule_action": base_action, "dst_domain": dst_domain,
            "rationale": rationale, "command_text": command,
        }

    raise ValueError(f"unhandled enforcement_kind: {kind}")  # pragma: no cover — registry is exhaustive


# ── Execution ────────────────────────────────────────────────────────────
SSH_USER = os.environ.get("FIREWALL_SSH_USER", "server")
DOCKER_HOST_IP = os.environ.get("FIREWALL_DOCKER_HOST_IP", "192.168.137.40")
SSH_SUDO_PASSWORD = os.environ.get("FIREWALL_SSH_SUDO_PASSWORD", "")
VMRUN_PATH = os.environ.get(
    "VMRUN_PATH", r"C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe"
)


def apply_via_ssh(command: str) -> tuple[bool, str]:
    """Run `command` on docker-host over SSH using the host's own already-
    trusted key (no stored credential for this path). A leading `sudo `
    is executed via a piped password so the displayed command_text never
    contains the sudo password itself."""
    if command.lstrip().startswith("sudo "):
        rest = command.lstrip()[len("sudo "):]
        remote_cmd = f"echo '{SSH_SUDO_PASSWORD}' | sudo -S -p '' {rest}"
    else:
        remote_cmd = command
    try:
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
             f"{SSH_USER}@{DOCKER_HOST_IP}", remote_cmd],
            capture_output=True, text=True, timeout=30,
        )
        output = ((result.stdout or "") + (result.stderr or "")).strip()
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "SSH command timed out after 30s"
    except Exception as exc:
        return False, f"SSH execution error: {exc}"


# Bare command names -> full guest path. Routing through `cmd.exe /c "<string>"`
# was tried first and reliably failed netsh's "add rule" specifically (exit 1,
# no captured output) even with no quotes in the string at all — cmd.exe's own
# command-line reparsing breaks something in how the arguments reach netsh.
# Invoking the target executable directly, one argv token per element (no
# shell involved), is what actually worked by hand this session — confirmed
# by isolating the failure: `cmd.exe /c netsh ...` failed, plain `netsh.exe`
# with the same arguments as separate tokens succeeded.
_GUEST_EXE_PATHS = {
    "netsh": r"C:\Windows\System32\netsh.exe",
}


def apply_via_vmrun(vmx_path: str, user: str, password: str, command: str) -> tuple[bool, str]:
    """Run `command` inside a Windows VM guest via VMware Tools guest-ops.
    `command` is the same string shown to the admin as command_text; it's
    tokenized here and the target exe invoked directly (see module note)."""
    try:
        tokens = shlex.split(command, posix=False)
    except ValueError as exc:
        return False, f"Could not parse command for execution: {exc}"
    if not tokens:
        return False, "Empty command"

    exe = _GUEST_EXE_PATHS.get(tokens[0].lower(), tokens[0])
    args = tokens[1:]
    try:
        result = subprocess.run(
            [VMRUN_PATH, "-gu", user, "-gp", password, "runProgramInGuest", vmx_path, exe, *args],
            capture_output=True, text=True, timeout=45,
        )
        output = ((result.stdout or "") + (result.stderr or "")).strip()
        if not output:
            output = "Command completed with no output captured (vmrun rarely returns guest stdout/stderr)." if result.returncode == 0 else "Guest command failed (vmrun did not capture further detail)."
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "vmrun command timed out after 45s"
    except Exception as exc:
        return False, f"vmrun execution error: {exc}"


def apply_rule(rule: dict) -> tuple[bool, str]:
    """Dispatch a firewall_rules row to the right executor based on its
    target's enforcement_kind. Never raises — always returns (success, output)
    so the route can record the outcome either way."""
    host = KNOWN_HOSTS.get(rule["target_ip"])
    kind = rule.get("enforcement_kind")

    if kind in ("linux-ufw-host", "macvlan-container"):
        return apply_via_ssh(rule["command_text"])

    if kind == "windows-vm" and host:
        vmx = os.environ.get(host["vmx_env"])
        user = os.environ.get(host["user_env"])
        password = os.environ.get(host["pass_env"])
        if not (vmx and user and password):
            return False, (
                f"Missing {host['vmx_env']}/{host['user_env']}/{host['pass_env']} "
                f"in .env — cannot execute against {host['label']}."
            )
        return apply_via_vmrun(vmx, user, password, rule["command_text"])

    # unknown / no enforcement point — advisory only, nothing to run.
    return True, "No enforcement point known for this host — marked applied as advisory only, no command executed."
