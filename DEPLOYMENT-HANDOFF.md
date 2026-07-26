# Deployment Handoff — Banking Device (single-machine testbed)

> Context for continuing the Shadow IT detector deployment + virtual bank
> testbed on the **banking device**. Read this alongside `CLAUDE.md` (the full
> project reference), `bank-net/README.md` (testbed runbook), and
> `bank-net/vms/README.md` (VM setup). Last updated **2026-07-26**.

---

## 1. What this project is (30-second version)
An AI-driven Shadow IT Detection Framework: Flask + PostgreSQL + Next.js, a
hybrid IsolationForest+RandomForest ML detector, live Scapy packet capture with
TLS-SNI/DNS naming, tamper-proof audit logs, and an LLM "AI Assistant" over the
detections DB. Full detail in `CLAUDE.md`.

## 2. What was built this work-arc (all committed + pushed to origin/master)
- **Destination-IP enrichment** (`ml/ipinfo.py`, wired into `ml/model.py detect()`)
  — labels raw IPs (gateway / LAN device / mDNS / …), suppresses multicast /
  broadcast / link-local noise, reverse-DNS for public IPs.
- **Concurrent-session detection** (Feature 1) — flags one account logged in from
  more than `CONCURRENT_SESSION_MAX_IPS` IPs; enforced via `active_sessions`.
- **AI Assistant** (Feature 2) — admin-only chat over the detections DB
  (Anthropic `claude-sonnet-5`); read-only DB tools + live-scan control; needs
  `ANTHROPIC_API_KEY`. Returns 503 if the key is unset (rest of app works fine).
- **`bank-net/` virtual bank testbed** — this deployment's target (below).
- **Roadmap next feature:** #3 **Wazuh** software-inventory ingest (the two
  Windows VMs are its future agent endpoints).

## 3. Target architecture — SINGLE MACHINE (this banking device, Windows)
Everything runs on **one box**. No SPAN, no managed switch, no second PC. The
detector sniffs the host NIC in **promiscuous mode** and sees the VM/container
egress directly.

```
BANKING DEVICE (Windows host)
 ├─ VMware Workstation (all VMs BRIDGED, static IPs on the LAN /24)
 │    ├─ support-ws  (Windows)   real TeamViewer / AnyDesk          .244
 │    ├─ employee-ws (Windows)   real Dropbox / ChatGPT / mail      .243
 │    └─ docker-host (Ubuntu) ─ macvlan ─┬ teller-01 .241  teller-02 .242
 │                                       ├ rogue-pi  .245  (b8:27:eb:* MAC)
 │                                       └ exfil-01  .246
 └─ DETECTOR on the HOST: Flask+collector (Npcap, admin) · PostgreSQL · Next.js · ML
        captures the host NIC in PROMISCUOUS mode → sees every VM/container egress
```
**Why hybrid:** the two rich endpoints are real Windows VMs (real installed apps
+ future Wazuh targets); the bulk "many devices" are lightweight macvlan
containers. To the detector — which only sees the network — each is a distinct
MAC+IP making real TLS connections.

## 4. Deployment progress (update this list as you go)
**Done**
- [x] Repo cloned on the banking device
- [x] Backend deployed and running — **AI Assistant answers**, so DB + auth +
      backend are all working
- [x] Npcap installed

**Pending**
- [ ] `ml/artifacts/` in place — transfer `ml-artifacts.zip` (from the dev PC's
      Downloads) and extract the 4 `.pkl` files into `ml/artifacts/`
- [ ] Verify the model loads: `python -c "from ml.model import detect; print('model OK')"`
- [ ] **Live Scan smoke test** — Live Scan on the device's own adapter → browse →
      Analyze Now → detections appear (proves Npcap + model + collector + DB)
- [ ] Build the 3 VMs per `bank-net/vms/README.md` (bridged, static IPs,
      promiscuous+MAC on the Ubuntu VM)
- [ ] Ubuntu VM: `cd bank-net && cp .env.example .env` (edit) → `docker compose up -d --build`
- [ ] Install real apps on the Windows VMs (TeamViewer/AnyDesk; Dropbox/ChatGPT)
- [ ] Demo config swap + `CONCURRENT_SESSION_MAX_IPS=1`, restart backend
- [ ] Select the capture NIC in Live Scan; verify results against `bank-net/EXPECTED.md`

## 5. Prerequisites a fresh clone is MISSING (all gitignored)
- **`ml/artifacts/`** — the trained model (`isolation_forest.pkl` ~352 MB,
  `random_forest.pkl`, `scaler.pkl`, `encoders.pkl`). Blocker — copy, don't retrain.
- **`.env`** — `cp .env.example .env`; set DB creds, `JWT_SECRET`, and
  `ANTHROPIC_API_KEY` (+ `ASSISTANT_MODEL=claude-sonnet-5`) for the assistant.
- **`frontend/.env.local`** — `NEXT_PUBLIC_API_URL`.
- **`data/`** — CICIDS CSVs; only needed to train or run CICIDS "Run Detection".

## 6. Critical gotchas (these actually bite)
- **ML version pins** — the pickles need `scikit-learn 1.8.0 / numpy 2.4.2 /
  pandas 3.0.0`, or the model load fails/warns. Force-reinstall after
  `requirements.txt`.
- **Run Flask as Administrator** — Npcap live capture needs elevation.
- **macvlan-in-VM** — the Ubuntu VM's bridged vNIC must ALLOW promiscuous mode +
  MAC changes (`.vmx`: `ethernet0.noPromisc = "FALSE"`), or the containers'
  distinct MACs collapse to one device.
- **Capture NIC** — pick the host physical adapter (promiscuous by default). If
  bridged VM traffic doesn't appear on the host capture, use the **VMnet8 (NAT)**
  fallback: put VMs on VMware NAT and capture "VMware Network Adapter VMnet8".
- **Demo config swap is non-destructive** — back up `ml/sanctioned_services.txt`
  and `ml/saas_catalog.csv`, swap in `bank-net/config/*`, restore after. The
  demo allowlist deliberately omits `dropbox.com` so it reads as unsanctioned.
- **ANTHROPIC_API_KEY** lives in the dev PC's `.env` (gitignored) — transfer it
  separately; rotate it after the project (it was exposed in chat).

## 7. Key files to read
- `CLAUDE.md` — full project reference (stack, DB schema, ML details, API).
- `bank-net/README.md` — single-machine testbed runbook (setup order).
- `bank-net/vms/README.md` — VMware VM creation + the macvlan gotcha.
- `bank-net/EXPECTED.md` — per-host verification matrix (what each host should detect).
- `bank-net/generator/profiles.py` — exactly what traffic each container role makes.

## 8. Decision log (why it's built this way)
- **Single machine over SPAN/two-device** — the user chose to run bank + detector
  on one box; local promiscuous capture is simpler and needs no managed switch.
- **Hybrid VMs + containers** — real Windows VMs for realism + Wazuh future; lean
  macvlan containers for the bulk device count. Same detection signal either way.
- **`transfer.sh` added to the demo catalog** — makes the exfil bulk-upload a
  GUARANTEED catalog hit; the crypto beacon (`pool.example-mine.test`) is
  best-effort only (a `.test` host doesn't resolve and a raw TCP connect has no
  SNI — see the caveat in `EXPECTED.md`).
