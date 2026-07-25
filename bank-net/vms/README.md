# VM tier — real Windows workstations + the Docker host VM

This is the **VM side** of the single-machine testbed. Everything below runs on
the **banking device** under **VMware Workstation/Player**. Three VMs, all on a
**bridged** adapter so each is a first-class device on the LAN:

| VM            | Guest OS       | Role                        | Static IP        |
|---------------|----------------|-----------------------------|------------------|
| `support-ws`  | Windows 10/11  | real **TeamViewer / AnyDesk** | `192.168.1.244` |
| `employee-ws` | Windows 10/11  | real **Dropbox / ChatGPT / personal mail** | `192.168.1.243` |
| `docker-host` | Ubuntu Server  | the macvlan **containers** (`teller-01/02`, `exfil-01`, `rogue-pi`) | its own DHCP/static IP |

> Adjust the subnet (`192.168.1.0/24`) and IPs to your LAN. Keep every static IP
> **outside the router's DHCP pool**. The container IPs are configured in
> `../.env` (see `../README.md`); the two Windows VM IPs are set **inside the
> guest OS**.

The **detector runs on the banking-device HOST** (not in a VM) and captures the
host NIC in promiscuous mode — it sees all three VMs' egress. There is **no SPAN,
no managed switch, no second PC**.

---

## 0. Networking model (read first)

All three VMs use VMware **Bridged** networking so their frames go out the host's
physical NIC onto the LAN — which is exactly what lets the host-side detector
capture them.

**⚠️ macvlan-in-VM gotcha (docker-host VM only).** The Ubuntu VM runs Docker
**macvlan**, which puts several distinct MAC addresses (one per container) behind
that VM's single vNIC. VMware drops "foreign" source MACs unless the vNIC is told
to allow them. Enable **both** promiscuous mode and MAC changes for the
`docker-host` VM:

- **GUI:** it is simplest to edit the `.vmx`. Power off the VM, open
  `docker-host.vmx`, and ensure:
  ```
  ethernet0.noPromisc = "FALSE"
  ethernet0.downWhenAddrMismatch = "FALSE"
  ```
- **VMware on Linux host:** the bridged vmnet must also permit it — run VMware as
  a user allowed to open the bridge in promiscuous mode, or set the vmnet perms.
- **VMware on Windows host:** the `.vmx` keys above are usually sufficient.

The two **Windows** VMs do **not** need this — they each have a single MAC.

To confirm later: inside the Ubuntu VM, `docker compose up -d` then from the
**host** ping/curl-nothing needed — just check the detector's Live Scan sees
`192.168.1.241/.242/.245/.246` as **distinct** source IPs. If they all show up as
the Ubuntu VM's single IP, the promiscuous/MAC setting didn't take.

---

## 1. `support-ws` (Windows) — remote-access Shadow IT

1. Create a Windows 10/11 VM in VMware (2 vCPU, 3–4 GB RAM, ~40 GB disk).
2. **Network:** Bridged; inside Windows set a **static IP** `192.168.1.244`
   (mask `255.255.255.0`, gateway `192.168.1.1`, DNS `192.168.1.1` or `1.1.1.1`).
3. Install the **real** apps (they beacon to their vendors on their own — that is
   the Shadow-IT signal the catalog catches):
   - TeamViewer — https://www.teamviewer.com/en/download/windows/
   - AnyDesk — https://anydesk.com/en/downloads/windows
4. Launch each once and leave it running (signed-in idle is enough — the client
   keep-alives to `*.teamviewer.com` / `*.anydesk.com` are captured).
5. (Optional) Install the hands-free driver: copy `activity/support-ws-activity.ps1`
   into the VM and register it as a Scheduled Task (see the script header).

## 2. `employee-ws` (Windows) — unsanctioned SaaS Shadow IT

1. Create a second Windows VM (same specs).
2. **Network:** Bridged; static IP `192.168.1.243`.
3. Install the **real** Dropbox desktop client — https://www.dropbox.com/install
   and sign into any account (its sync keep-alives hit `*.dropbox.com`).
4. In the browser, keep tabs/bookmarks to the unsanctioned web apps so activity
   generates real SNI: `chatgpt.com`, `mail.google.com` (personal Gmail),
   `drive.google.com`.
5. (Optional) Install `activity/employee-ws-activity.ps1` as a Scheduled Task for
   hands-free browsing to those hosts.

## 3. `docker-host` (Ubuntu Server) — the container tier

1. Create an Ubuntu Server 22.04/24.04 VM (2 vCPU, 2 GB RAM, ~12 GB disk),
   **Bridged**, with the **promiscuous/MAC** `.vmx` settings from §0.
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
   ip -4 addr                     # note the bridged NIC name (e.g. ens33) + subnet
   nano .env                      # set PARENT_NIC, SUBNET, GATEWAY, IP_RANGE, IP_*
   ```
4. Bring the containers up:
   ```bash
   docker compose up -d --build
   docker compose logs -f         # each line = one behaviour (browse/upload/beacon)
   ```

That is the full container tier: `teller-01/02` (sanctioned baseline + occasional
slip), `rogue-pi` (Raspberry-Pi OUI MAC → unauthorised device), `exfil-01` (bulk
upload → anomaly + `transfer.sh` catalog hit).

---

## 4. Concurrent-session demo (optional)

To trigger the concurrent-session detection, have **two** hosts log into the
framework with the **same** account. Easiest from two containers:
```bash
docker compose exec -e DASHBOARD_URL=http://<HOST-IP>:5000 teller-01 \
  python /app/generator/traffic_gen.py     # Ctrl-C after a login or two
docker compose exec -e DASHBOARD_URL=http://<HOST-IP>:5000 teller-02 \
  python /app/generator/traffic_gen.py
```
`<HOST-IP>` = the banking device host's LAN IP (where the backend listens). Set
`CONCURRENT_SESSION_MAX_IPS=1` in the detector's `.env` so two IPs trip it (the
default `2` won't fire for a two-host demo).

---

## 5. Wazuh (roadmap #3, later)

The two Windows VMs are the endpoints the future **Wazuh** software-inventory
agent will run on — that is the whole reason they are real VMs and not
containers. Nothing to do now; noted so the topology already supports it.

---

## Teardown

- Ubuntu VM: `docker compose down`.
- Windows VMs: close/uninstall the apps, or just power the VMs off.
- Restore the detector's swapped config (see `../README.md` §Teardown).
