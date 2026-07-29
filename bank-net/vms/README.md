# VM tier — real Windows workstations + the Docker host VM

This is the **VM side** of the single-machine testbed. Everything below runs on
the **banking device** under **VMware Workstation/Player**. Three VMs, all on the
same **VMware host-only network `192.168.137.0/24`** (the Windows host sits on it
at `.1` and shares its internet to it via **WinNAT/ICS**, so the VMs reach real
services while all their traffic still passes through the host):

| VM            | Guest OS       | Role                        | Static IP        |
|---------------|----------------|-----------------------------|------------------|
| `support-ws`  | Windows 10/11  | real **TeamViewer / AnyDesk** (+ Wazuh agent) | `192.168.137.244` |
| `employee-ws` | Windows 10/11  | real **Dropbox / ChatGPT / personal mail** (+ Wazuh agent) | `192.168.137.243` |
| `docker-host` | Ubuntu Server  | Wazuh **manager** + FreeRADIUS + the macvlan **containers** (`teller-01/02`, `rogue-pi`, `exfil-01`) | `192.168.137.40` |

> Adjust the subnet (`192.168.137.0/24`) and IPs to yours if you rebuild. The
> container IPs are configured in `../.env` (see `../README.md`); the two Windows
> VM IPs are set **inside the guest OS**.

The **detector runs on the banking-device HOST** (not in a VM). Because the host
is the NAT gateway (`.1`), every VM/container flow transits it, and the collector
captures the host's **`192.168.137.1` adapter** in promiscuous mode — it sees all
three VMs' egress with real SNI. There is **no SPAN, no managed switch, no second
PC**.

---

## 0. Networking model (read first)

All three VMs attach to the **VMware host-only network (VMnet1) `192.168.137.0/24`**.
A bare host-only network has no internet, so the host **shares its connection to it
(WinNAT / Internet Connection Sharing)** — that makes the host the gateway at `.1`
*and* the single capture point for the detector. The VMs reach real Dropbox /
TeamViewer / etc., and the collector sees every flow before NAT.

**⚠️ macvlan-in-VM gotcha (docker-host VM only).** The Ubuntu VM runs Docker
**macvlan**, which puts several distinct MAC addresses (one per container) behind
that VM's single vNIC. VMware drops "foreign" source MACs unless the vNIC is told
to allow them. Enable **both** promiscuous mode and MAC changes for the
`docker-host` VM — power it off, open `docker-host.vmx`, and ensure:
```
ethernet0.noPromisc              = "FALSE"
ethernet0.downWhenAddrMismatch   = "FALSE"
```
(On a Windows host these `.vmx` keys are usually sufficient; on a Linux host the
vmnet must also permit promiscuous.) The two **Windows** VMs don't need this — each
has a single MAC.

To confirm later: after `docker compose up -d` in the Ubuntu VM, check the
detector's Live Scan sees `192.168.137.241/.242/.245/.246` as **distinct** source
IPs. If they all collapse to the Ubuntu VM's single IP, the promiscuous/MAC setting
didn't take.

---

## 1. `support-ws` (Windows) — remote-access Shadow IT

1. Create a Windows 10/11 VM in VMware (2 vCPU, 3–4 GB RAM, ~40 GB disk).
2. **Network:** host-only (VMnet1); inside Windows set a **static IP**
   `192.168.137.244` (mask `255.255.255.0`, gateway `192.168.137.1`, DNS `1.1.1.1`).
3. Install the **real** apps (they beacon to their vendors on their own — that is
   the Shadow-IT signal the catalog catches):
   - TeamViewer — https://www.teamviewer.com/en/download/windows/
   - AnyDesk — https://anydesk.com/en/downloads/windows
4. Launch each once and leave it running (signed-in idle is enough — the client
   keep-alives to `*.teamviewer.com` / `*.anydesk.com` are captured).
5. (Optional) Install the hands-free driver: copy `activity/support-ws-activity.ps1`
   into the VM and register it as a Scheduled Task (see the script header).
6. **Wazuh agent:** install `wazuh-agent-4.9.2` pointing at `WAZUH_MANAGER=192.168.137.40`
   (auto-enrollment) — see `../../CLAUDE.md` "Wazuh Software-Inventory Integration".

## 2. `employee-ws` (Windows) — unsanctioned SaaS Shadow IT

1. Create a second Windows VM (same specs).
2. **Network:** host-only (VMnet1); static IP `192.168.137.243`
   (gateway `192.168.137.1`, DNS `1.1.1.1`).
3. Install the **real** Dropbox desktop client — https://www.dropbox.com/install
   and sign into any account (its sync keep-alives hit `*.dropbox.com`).
4. In the browser, keep tabs/bookmarks to the unsanctioned web apps so activity
   generates real SNI: `chatgpt.com`, `mail.google.com` (personal Gmail),
   `drive.google.com`.
5. (Optional) Install `activity/employee-ws-activity.ps1` as a Scheduled Task for
   hands-free browsing to those hosts.
6. **Wazuh agent:** same as support-ws, pointing at `192.168.137.40`.

## 3. `docker-host` (Ubuntu Server) — the container tier (+ Wazuh manager + FreeRADIUS)

1. Create an Ubuntu Server 22.04/24.04 VM (2 vCPU, 2 GB RAM, ~12 GB disk),
   **host-only (VMnet1)** at `192.168.137.40`, with the **promiscuous/MAC** `.vmx`
   settings from §0.
2. Install Docker + compose:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git
   sudo usermod -aG docker "$USER" && newgrp docker
   ```
3. Get the repo and configure the container network:
   ```bash
   git clone <your-repo-url> shadow-it-detection
   cd shadow-it-detection/bank-net
   cp .env.example .env
   ip -4 addr                     # note the host-only NIC name (e.g. ens33)
   nano .env                      # PARENT_NIC=<that NIC>, SUBNET=192.168.137.0/24,
                                  # GATEWAY=192.168.137.1, IP_RANGE + the IP_* values
   ```
4. Bring the containers up:
   ```bash
   docker compose up -d --build
   docker compose logs -f         # each line = one behaviour (browse/upload/beacon)
   ```

That is the container tier: `teller-01/02` (sanctioned baseline + occasional slip),
`rogue-pi` (Raspberry-Pi OUI MAC → unauthorised device), `exfil-01` (bulk upload →
anomaly + `transfer.sh` catalog hit). The **Wazuh manager** and the **FreeRADIUS**
container (`192.168.137.43`, on the same macvlan) also run on this VM — see
`../../CLAUDE.md` for their setup.

---

## 4. Concurrent-session demo (optional)

To trigger the app-layer concurrent-session detection, have **two** hosts log into
the framework with the **same** account. Easiest from two containers:
```bash
docker compose exec -e DASHBOARD_URL=http://192.168.137.1:5000 teller-01 \
  python /app/generator/traffic_gen.py     # Ctrl-C after a login or two
docker compose exec -e DASHBOARD_URL=http://192.168.137.1:5000 teller-02 \
  python /app/generator/traffic_gen.py
```
`192.168.137.1` = the banking-device host (where the backend listens). Set
`CONCURRENT_SESSION_MAX_IPS=1` in the detector's `.env` so two IPs trip it (the
default `2` won't fire for a two-host demo). *(This is separate from the RADIUS
concurrent-session path, which is driven from the FreeRADIUS container — see
`../../CLAUDE.md`.)*

---

## 5. Wazuh + RADIUS (deployed)

The two Windows VMs are the endpoints the **Wazuh** software-inventory agents run
on (manager on `docker-host` `.40`), and **FreeRADIUS** (`.43`) provides the
network-auth concurrent-session signal. Both are implemented — full setup,
config gotchas, and verification are documented in `../../CLAUDE.md`
("Wazuh Software-Inventory Integration" and "RADIUS/AAA Concurrent-Session
Integration").

> **Segmentation:** the per-host inbound firewall lockdown (ufw on `docker-host`,
> Windows Firewall on the two VMs via `vmrun`) is described in `../README.md`
> "Network Segmentation Policy" — it lives in host/VM config, not the repo, so
> reapply it if a VM is rebuilt.

---

## Teardown

- Ubuntu VM: `docker compose down`.
- Windows VMs: close/uninstall the apps, or just power the VMs off.
- Restore the detector's swapped config (see `../README.md` §Teardown).
