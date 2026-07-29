# Virtual Bank Network — single-machine testbed for the Shadow IT detector

A realistic **bank network** that generates both authorised and Shadow-IT egress,
so the detection framework can be demonstrated end-to-end on a live wire — for a
supervisor or defense panel. **Everything runs on ONE machine** (the "banking
device"): the bank hosts *and* the detector. No SPAN, no managed switch, no
second PC.

**Nothing here changes the framework.** All demo-specific config is *swapped or
appended at demo time* and restored afterward.

```
bank-net/
├── docker-compose.yml            # macvlan network + 4 container roles
├── Dockerfile                    # python:3.12-slim + requests
├── .env.example                  # macvlan params (copy to .env, edit for your LAN)
├── generator/
│   ├── traffic_gen.py            # role-driven real-traffic generator
│   └── profiles.py               # per-ROLE destinations + behaviour weights
├── config/
│   ├── sanctioned_services.demo.txt   # the bank's allowlist (omits dropbox.com)
│   └── saas_catalog.additions.csv     # transfer.sh + crypto-beacon host
├── vms/
│   ├── README.md                 # the 2 Windows VMs + Ubuntu docker-host VM
│   └── activity/*.ps1            # optional hands-free Windows traffic
├── README.md                     # this runbook
└── EXPECTED.md                   # verification matrix
```

## Architecture — hybrid on one box

All VMs sit on a single VMware **host-only / internal network `192.168.137.0/24`**.
The Windows host is on that network at **`.1`** and **NATs it to the internet
(WinNAT)** — so the VMs reach real services, and the detector, capturing the host's
`.137.1` adapter in promiscuous mode, sees **every** VM/container flow at that one
choke point (real TLS SNI, before NAT).

```
                          INTERNET  (real Dropbox / TeamViewer / ChatGPT / transfer.sh)
                                  ▲  WinNAT
 BANKING DEVICE (Windows host) · 192.168.137.1  (gateway + capture point)
   DETECTOR runs natively: Flask + collector (Npcap, admin) · PostgreSQL · Next.js · ML
   captures the .137.1 adapter in PROMISCUOUS mode → all VM/container egress (real SNI)
        │  VMware host-only network  192.168.137.0/24
        ├─ support-ws  (Windows) .244   real TeamViewer / AnyDesk    + Wazuh agent
        ├─ employee-ws (Windows) .243   real Dropbox / ChatGPT / mail + Wazuh agent
        └─ docker-host (Ubuntu)  .40
             ├─ Wazuh MANAGER          (.40 : 1514/1515/55000)
             ├─ FreeRADIUS container    .43   (on the macvlan)
             └─ Docker MACVLAN (parent = the VM's .137 NIC):
                  teller-01 .241   teller-02 .242
                  rogue-pi  .245 (b8:27:eb:* MAC)   exfil-01 .246
```

**Three detection data-planes converge on the host:** network-flow egress
(captured at `.137.1`), **Wazuh** software inventory (REST pull from the manager at
`.40:55000`), and **RADIUS** identity/concurrent-session (FreeRADIUS at `.43` writes
`radacct` into the host PostgreSQL, which the backend reads).

**Why hybrid:** the two rich endpoints are **real Windows VMs** (they run the actual
TeamViewer/Dropbox clients and are the **Wazuh agent hosts**); the bulk "many
devices" are lightweight **macvlan containers**, each a distinct MAC+IP so the
detector counts them as separate devices (rogue-pi shows as a Raspberry Pi).

**Prerequisites (banking device):** VMware Workstation/Player · Npcap · the
detector's own deps (`CLAUDE.md`) · **~20 GB RAM** · **~70 GB disk**.

---

## Setup order

### 1. Stand up the VMs
Follow **[`vms/README.md`](./vms/README.md)** to create the two Windows VMs and the
Ubuntu docker-host VM — all on the **host-only `192.168.137.0/24`** VM network (the
host at `.1` NATs it to the internet), with static IPs and the **promiscuous +
MAC-change** `.vmx` setting on the Ubuntu VM so macvlan works. Bring the containers
up inside the Ubuntu VM (`docker compose up -d --build`), and start the real apps /
optional activity scripts on the Windows VMs.

### 2. Deploy the detector on the banking-device HOST
Follow `CLAUDE.md` "Environment Setup": clone the repo, `pip install -r
requirements.txt`, apply `db/schema.sql` + `db/immutability.sql` + `db/seed.py`
(or `docker compose up -d db frontend`), place/train `ml/artifacts/`, and run
Flask **as Administrator** (Npcap needs it). Dashboard on `:3005`, API on `:5000`.

### 3. Swap in the demo config (non-destructive)
On the host, from the repo root:
```powershell
# back up the committed files first
copy ml\sanctioned_services.txt ml\sanctioned_services.txt.bak
copy ml\saas_catalog.csv        ml\saas_catalog.csv.bak

# the bank's allowlist (so Dropbox/TeamViewer read as UNSANCTIONED)
copy /Y bank-net\config\sanctioned_services.demo.txt ml\sanctioned_services.txt

# append the demo catalog rows (transfer.sh + crypto beacon host)
Get-Content bank-net\config\saas_catalog.additions.csv | Add-Content ml\saas_catalog.csv
```
In `.env` set `CONCURRENT_SESSION_MAX_IPS=1` (so a two-host login demo trips it),
then restart the backend.

### 4. Point the collector at the right NIC
- **Live Scan → interface:** pick the **host adapter on the VM network**
  (`192.168.137.1`). Because the host is the NAT gateway, every VM/container flow
  transits it — Scapy enables promiscuous mode by default, so the host sees all VM +
  container frames with real SNI before NAT.
- **Network Discovery:** set `iface_ip` to `192.168.137.1` (the host's address on
  the VM network) to actively ARP-sweep and enumerate the bank hosts.

---

## Run & watch

- Dashboard (`:3005`, admin) → **Applications** (named unsanctioned SaaS),
  **Devices** (distinct IPs; `rogue-pi` = Raspberry Pi), **Alerts** (high-risk +
  the concurrent-session row).
- **AI Assistant** (admin): *"top destinations"*, *"top unsanctioned SaaS"*,
  *"unresolved high-risk"*, *"which source IP is the biggest offender"*.
- Check each behaviour against **[`EXPECTED.md`](./EXPECTED.md)**.
- Sanctioned suppression shows in the backend log:
  `detect(): … (N unsanctioned SaaS, M sanctioned suppressed)`.

---

## Network Segmentation Policy (added 2026-07-27)

Structural lockdown of the bank network's attack surface — deliberately scoped
to **not** touch any outbound app traffic, since that traffic (Dropbox slips,
exfil uploads, the crypto beacon, teller browsing) is exactly what the
detector is meant to catch. Blocking it at the network layer would starve the
demo of the very detections it exists to show. So enforcement here is
inbound-only, structural (who can reach management/file-sharing ports), never
app-layer.

| Host | Rule | Why |
|---|---|---|
| `docker-host` (.40) | SSH (22) + Wazuh API (55000) reachable only from the banking-device host (.1). Wazuh agent ports (1514/1515) reachable only from `support-ws`/`employee-ws` | Only the detector should administer the manager or the Docker host |
| `support-ws` (.244) | Inbound RDP (3389) / SMB (445) / NetBIOS (139) blocked from everyone except the banking-device host (.1) | No lateral movement from tellers/rogue-pi/exfil-01 into this endpoint |
| `employee-ws` (.243) | Same as above | Same reasoning |
| `teller-01/02`, `rogue-pi`, `exfil-01` | Unrestricted | Their traffic *is* the Shadow-IT signal — nothing here is blocked |

**Enforcement mechanism, per host:**
- `docker-host`: `ufw` (default-deny incoming, explicit allow rules per above). Note the containers' own macvlan traffic is invisible to this — see the gotcha below — so this only protects the VM's own listening ports, not container-to-container/external traffic.
- `support-ws` / `employee-ws`: native Windows Firewall, driven remotely via `vmrun -gu <user> -gp <pass> runProgramInGuest` (VMware Tools guest-RPC — no WinRM/RDP needed). Each host got its own explicit **block** rule (all sources except the banking host) *plus* an explicit **allow** rule (banking host only) — Windows Firewall's default-inbound-block only kicks in once the firewall is actually turned on, and a bare "block everyone but X" rule is not enough by itself if the firewall was previously off (see gotcha below).

**Gotchas hit building this (all resolved, worth knowing before touching it again):**
1. **WinNAT can't be filtered by the banking-device host's own Windows Firewall.** Firewall rules there only apply to traffic terminating at the host's own stack — traffic merely routed/NAT'd from VMnet1 out to the internet sails through untouched. Verified empirically (added a block rule for a specific IP, raw TCP connect from a container still succeeded in 0.03s). This is why segmentation had to happen at each endpoint (`docker-host`, the two VMs) instead of centrally at the NAT gateway.
2. **Docker macvlan traffic bypasses the docker-host's own netfilter entirely** — a deliberate Linux macvlan property (the container's virtual NIC hands packets straight to the physical/parent interface's driver without transiting the host namespace's own IP stack). `iptables`/`ufw` on `docker-host` cannot see or filter `teller-01/02`/`rogue-pi`/`exfil-01`'s own traffic at all — which conveniently is exactly what we want left alone anyway.
3. **Windows Firewall was simply off** on both `support-ws` and `employee-ws` (common lab-VM default). Adding block rules against an inactive firewall is a no-op — always confirm with `netsh advfirewall set allprofiles state on` first, then re-verify functionally afterward (a `Test-NetConnection`/raw-socket check, not just re-reading the rule list back, since guest command output redirection over `vmrun` is unreliable — see next point).
4. **Once the firewall is genuinely on, its default-inbound-block policy applies to everything**, so a "block all except X" rule alone will also block X unless there's *also* an explicit "allow X" rule — the default-allow you get with the firewall off disappears the moment you turn it on.
5. **`vmrun runProgramInGuest` output can't be reliably captured.** Redirecting guest command output to a file and copying it back (`copyFileFromGuestToHost`) frequently timed out even for small outputs, especially through nested quoting (`cmd.exe /c "... \"...\" ..."` breaks easily — keep guest commands quote-free where possible, e.g. avoid spaces in firewall rule names). Functional testing (actually attempting the connection from an allowed/disallowed source) proved far more reliable than trying to read guest state back.
6. **Every `runProgramInGuest` call without a session to attach to leaves a stray process behind** (we accumulated 11 idle `cmd.exe` windows on `support-ws` from repeated attempts) — clean these up with individual `killProcessInGuest` calls per PID; bulk-killing in a loop trips safety tooling that flags mass remote process termination.
7. Both Windows VMs kept spontaneously powering off mid-session (see the pre-existing gotcha in `DEPLOYMENT-HANDOFF.md`) — re-verify `vmrun list` shows all three VMs before assuming any guest-side state persisted.

This policy lives entirely in host/VM configuration (ufw rules, Windows Firewall rules) — **nothing here is in the git repo**, so it needs to be reapplied if `docker-host`/`support-ws`/`employee-ws` are rebuilt from scratch.

---

## Teardown & restore

```bash
# inside the Ubuntu VM
docker compose down
```
```powershell
# on the host — restore the committed config + .env, then restart the backend
copy /Y ml\sanctioned_services.txt.bak ml\sanctioned_services.txt
copy /Y ml\saas_catalog.csv.bak        ml\saas_catalog.csv
# revert CONCURRENT_SESSION_MAX_IPS in .env
```
Power off / remove the VMs as desired (`vms/README.md`).

---

## Notes

- Destinations are **real services** so the captured TLS ClientHello carries a
  genuine SNI the collector extracts (that is what names a flow `dropbox.com`
  instead of a bare IP).
- Exfil uses a benign, configurable sink (`transfer.sh` by default). The crypto
  beacon uses a non-resolvable `.test` host — never a real mining pool — and is
  **best-effort** (see the caveat in `EXPECTED.md`).
- The detector sees **egress**, which is where Shadow IT lives. Purely internal
  bank traffic is out of scope.
