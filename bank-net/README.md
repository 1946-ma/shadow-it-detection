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

```
BANKING DEVICE (Windows host)
 ├─ VMware Workstation (all VMs BRIDGED, static IPs on the LAN /24)
 │    ├─ support-ws  (Windows)   real TeamViewer / AnyDesk          .244
 │    ├─ employee-ws (Windows)   real Dropbox / ChatGPT / mail      .243
 │    └─ docker-host (Ubuntu) ─ macvlan ─┬ teller-01  .241
 │                                       ├ teller-02  .242
 │                                       ├ rogue-pi   .245  (b8:27:eb:* MAC)
 │                                       └ exfil-01   .246
 └─ DETECTOR on the HOST: Flask+collector (Npcap, admin) · PostgreSQL · Next.js · ML
        captures the host NIC in PROMISCUOUS mode → sees every VM/container egress
```

**Why hybrid:** the two rich endpoints are **real Windows VMs** (they run the
actual TeamViewer/Dropbox clients and are the future Wazuh agent targets); the
bulk "many devices" are lightweight **macvlan containers**. To the detector — which
only sees the network — each is just a distinct MAC+IP making real TLS
connections.

**Prerequisites (banking device):** VMware Workstation/Player · Npcap · the
detector's own deps (`CLAUDE.md`) · **~20 GB RAM** · **~70 GB disk**.

---

## Setup order

### 1. Stand up the VMs
Follow **[`vms/README.md`](./vms/README.md)** to create the two Windows VMs and
the Ubuntu docker-host VM (all **bridged**, static IPs, and the **promiscuous +
MAC-change** `.vmx` setting on the Ubuntu VM so macvlan works). Bring the
containers up inside the Ubuntu VM (`docker compose up -d --build`), and start the
real apps / optional activity scripts on the Windows VMs.

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
- **Live Scan → interface:** pick the **host's physical LAN adapter** — the one
  the bridged VMs egress through. Scapy enables promiscuous mode by default, so
  the host sees the bridged VM + container frames.
- **If VM traffic doesn't appear** (some Windows + VMware bridged combos hide it
  from the host's own capture), use the **NAT / VMnet8 fallback**: switch the VMs
  to VMware **NAT**, and in Live Scan select the **"VMware Network Adapter
  VMnet8"** interface — it sits directly on the VM subnet and reliably shows every
  VM's traffic (real source IPs + SNI) before NAT.
- **Network Discovery:** set `iface_ip` to the host's LAN IP (the adapter that can
  send the ARP sweep) to enumerate the bank hosts actively.

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
