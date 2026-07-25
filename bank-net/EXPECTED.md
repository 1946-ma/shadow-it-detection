# EXPECTED.md — verification matrix

What each bank host (Windows VM or container) should produce once the demo is
running with the config swaps applied (demo allowlist in place, catalog additions
appended, `CONCURRENT_SESSION_MAX_IPS=1`). Kept in sync with
`generator/profiles.py` and `vms/README.md`.

Legend
- **detection_source**: `catalog` (unsanctioned host in `ml/saas_catalog.csv`) ·
  `anomaly` (hybrid IF+RF flag) · `active-scan` (Network Discovery) ·
  `concurrent-session`.
- **Suppressed** = matched the demo sanctioned allowlist → correctly *not* a
  detection.

## Per-host expectations

Hosts are **Windows VMs** (`support-ws`, `employee-ws`) or **containers**
(`teller-01/02`, `rogue-pi`, `exfil-01`). To the detector they are all just
distinct source IPs on the LAN.

| Host         | Behaviour                        | Example dst_domain                | detection_source | risk        | Suppressed? |
|--------------|----------------------------------|-----------------------------------|------------------|-------------|-------------|
| teller-01/02 (container) | sanctioned baseline   | `onlinebanking.demo-bank.test`, `login.microsoftonline.com`, `outlook.office365.com`, `sharepoint.com` | — | — | **Yes** (sanctioned) |
| teller-01/02 (container) | occasional unsanctioned | `dropbox.com`, `mail.google.com` | catalog        | high / medium | No |
| **employee-ws** (VM) | real Dropbox client + browse | `dropbox.com`, `wetransfer.com`, `chatgpt.com`, `mail.google.com`, `drive.google.com` | catalog | high / medium | No |
| **support-ws** (VM)  | real TeamViewer / AnyDesk    | `teamviewer.com`, `anydesk.com`, `ngrok.com` | catalog | high | No |
| rogue-pi (container) | device identity (MAC `b8:27:eb:*`)| device shows **Raspberry Pi Foundation** in Devices / Network Discovery | active-scan (discovery) / anomaly | — | No |
| rogue-pi (container) | unsanctioned browse          | `telegram.org`, `dropbox.com`     | catalog          | medium/high | No |
| **exfil-01** (container) | **bulk upload**          | `transfer.sh` (or `EXFIL_SINK`)   | **catalog** (guaranteed) **+ anomaly** *(model-dependent)* | high | No |
| exfil-01 / rogue-pi  | crypto beacon                | `pool.example-mine.test` (`DemoPool`) | catalog *(best-effort — see caveat)* | high | No |
| any (x2)     | dashboard_login, same account    | `Concurrent session: admin (2 locations)` | concurrent-session | high | No |

## Notes on the non-deterministic rows

- **exfil-01 bulk upload.** `transfer.sh` is a real file-sharing service and is in
  the demo catalog additions, so the upload is a **guaranteed catalog hit** (real
  TLS SNI). It *also* usually flags on the **anomaly** path from the large forward
  byte volume; if the model doesn't flag it, raise `EXFIL_MB` (bank-net `.env`)
  and/or lower `TICK_MIN/TICK_MAX` for a larger/more-sustained upload. Either way
  exfil-01 always yields at least the catalog detection.
- **crypto beacon (BEST-EFFORT).** `pool.example-mine.test` is a non-resolvable
  `.test` name and the beacon is a raw TCP connect (no TLS SNI), so there is **no
  DNS answer and no SNI for the collector to name** — on a stock setup it produces
  **no catalog detection**. It is kept as a *safe placeholder* (never a real
  mining pool). To make it fire, point the beacon at a **resolvable** host (add a
  local DNS record or change `CRYPTO_BEACON_HOST` in `generator/profiles.py`) so
  the DNS query is observable and passive-DNS/catalog can name the flow. The
  guaranteed exfil detection above does not depend on this.
- **rogue-pi device label.** The Raspberry-Pi OUI is recognised by
  `ml/oui.py` (`B827EB` → "Raspberry Pi Foundation", curated — no download).
  It appears as a device once (a) it is caught in an active **Network Discovery**
  ARP sweep, or (b) any of its flows is flagged (catalog/anomaly) and
  `detect()` stamps `device_type` from the MAC. The beacon guarantees (b).

## Quick checks on the dashboard / assistant

- **Applications** page → unsanctioned SaaS named (Dropbox, ChatGPT, TeamViewer…).
- **Devices** page → distinct source IPs per container; `rogue-pi` labelled
  Raspberry Pi.
- **Alerts** → a `Concurrent session: admin (…)` high-risk row after the two logins.
- **AI Assistant** (admin):
  - "top destinations" → the unsanctioned SaaS hosts, by count.
  - "top unsanctioned SaaS" / filter source `catalog` → catalog hits only.
  - "unresolved high-risk" → the high-risk detections still open.
- **Sanctioned suppression** is visible in the backend log line from `detect()`:
  `… (N unsanctioned SaaS, M sanctioned suppressed)`.
