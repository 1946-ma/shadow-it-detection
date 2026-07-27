# CLAUDE.md — Shadow IT Detection Framework
> BSc Cybersecurity Final Year Project · University of Mines and Technology (UMaT)
> Author: Jeffrey Sampson Ennin · jeffreysampsonennin@gmail.com
> This file gives Claude full project context to continue work on any device.

---

## Project Summary
An AI-Driven Shadow IT Detection Framework. Detects unauthorized devices and software on a network using an IsolationForest ML model trained on the CICIDS2017 dataset. Includes live packet capture, a full REST API, a Next.js dashboard, PDF report generation, and tamper-proof audit logs.

---

## Repository
- **Local path:** `C:\Users\IT-LIFE\Desktop\Final year project\shadow-it-detection\`
- **Git remote:** GitHub (commits exist, check `git remote -v`)
- **Branch:** `master`

---

## Tech Stack
| Layer | Technology |
|---|---|
| Backend | Python 3.14, Flask 3.0, Flask-CORS |
| Auth | PyJWT (HS256), bcrypt password hashing |
| Database | PostgreSQL, psycopg v3 (`psycopg[binary]`), `dict_row` |
| ML | scikit-learn IsolationForest, pandas, numpy, joblib |
| Packet Capture | Scapy (requires Npcap on Windows, run Flask as Administrator) |
| PDF Reports | reportlab (Platypus) |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Recharts, lucide-react, axios, framer-motion, js-cookie |
| Font | Inter (Google Fonts, `styles/globals.css`) |
| CSS | Tailwind CSS + custom CSS variables — dark/light glassmorphism theme, `.glass` + `.glow-*` utilities |

---

## Environment Setup (new device checklist)

### Prerequisites
- Python 3.14 at `C:\Users\IT-LIFE\AppData\Local\Python\bin\python3.14.exe` (Windows-specific path)
  - On a new device use whichever Python 3.10+ is available
- PostgreSQL installed and running
- Node.js 18+ for the frontend
- **Windows only:** Npcap installed from https://npcap.com (required for Scapy raw socket access)

### 1. Clone & install Python deps
```bash
git clone <repo-url>
cd shadow-it-detection
pip install -r requirements.txt
```
> On Windows with the specific Python install: use the full path
> `"C:\Users\IT-LIFE\AppData\Local\Python\bin\python3.14.exe" -m pip install -r requirements.txt`

### 2. Create `.env` in project root
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shadow_it_db
DB_USER=shadow_it_app
DB_PASSWORD=sh4d0w_app_2026
JWT_SECRET=change-this-to-a-long-random-secret-key
JWT_EXPIRY_HOURS=8
FLASK_ENV=development
FLASK_PORT=5000
```
> `DB_USER=shadow_it_app` is the restricted PostgreSQL role. Use `DB_USER=postgres` if immutability.sql hasn't been applied yet.

### 3. Database setup
```bash
# Create the database (run as postgres superuser)
psql -U postgres -c "CREATE DATABASE shadow_it_db;"

# Apply schema
psql -U postgres -d shadow_it_db -f db/schema.sql

# Apply immutability (triggers + restricted role + hash chain)
psql -U postgres -d shadow_it_db -f db/immutability.sql

# Seed default users
python db/seed.py
```
Default users after seed:
- `admin / admin123` (role: admin)
- `viewer / viewer123` (role: viewer)

### 4. ML pipeline
```bash
# Generate synthetic CICIDS-style training data (creates data/network_traffic.csv)
python ml/generate_dataset.py

# Train the IsolationForest model (saves ml/artifacts/isolation_forest.pkl + scaler.pkl)
python ml/model.py

# Evaluate and generate metrics (saves ml/reports/metrics_summary.csv + scenario results)
python ml/evaluate.py
```

### 5. Run Flask (must be Administrator on Windows for Scapy)
```bash
# Right-click terminal → Run as Administrator, then:
"C:\Users\IT-LIFE\AppData\Local\Python\bin\python3.14.exe" backend/app.py
# Or on any device:
python backend/app.py
```
Flask runs on `http://localhost:5000`

### 6. Run Next.js frontend
```bash
cd frontend
npm install
npm run dev
```
Next.js runs on `http://localhost:3000` (Flask's CORS whitelist in `backend/app.py` is set to this origin).

### frontend/.env.local (gitignored — copy from `.env.local.example`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## Docker Deployment (added 2026-07-05; host-backend default since 2026-07-22)
**Default = host-backend mode** (Live Scan + Network Discovery work). The
`backend` service is behind the `with-backend` Compose profile, so a plain
`up` starts only `db` + `frontend`; the API runs **natively on the host** so
it can see real network adapters:
```bash
docker compose up -d                 # db + frontend only
python backend/app.py                # run the API on the host, as Administrator
# Dashboard: http://localhost:3005  (admin/admin123)  ·  API (host): http://localhost:5000
```
**Full-container mode** (everything in Docker, but NO live capture — a
container can't see host NICs, so Live Scan / Network Discovery are unavailable):
```bash
docker compose --profile with-backend up -d --build
```
> In host-backend mode the native Flask uses the **host PostgreSQL** (`.env`
> → `DB_HOST=localhost`); the Docker `db` container is a separate store used
> only by the containerised backend. The frontend has **no `depends_on`** — the
> browser reaches the API on the host, not a sibling container.
- **Services:** `db` (postgres:16-alpine; schema.sql + immutability.sql auto-applied by initdb on a fresh volume), `backend` (python:3.14-slim + gunicorn, seeds users on start; `with-backend` profile only), `frontend` (node:20-alpine multi-stage, `next start`).
- **Host prerequisites (gitignored, volume-mounted read-only):** `ml/artifacts/` (train with `python ml/model.py`) and `data/` (CICIDS CSVs, needed for Run Detection). ML libs are **pinned in the Dockerfile** (scikit-learn 1.8.0 / numpy 2.4.2 / pandas 3.0.0 / joblib 1.5.3) to match the artifacts' training environment — bump the pins if artifacts are retrained under newer versions.
- **Ports:** frontend published on **3005** (host 3000 is in a Windows excluded port range on the dev machine; 3005 is in Flask's CORS whitelist). `NEXT_PUBLIC_API_URL` is baked at image build time (compose build arg) — it must be the URL the *browser* uses.
- **Live Scan is host-only:** a container on Docker Desktop/Windows cannot see the host's network adapters. For live capture demos run Flask directly on the host as Administrator.
- Docker DB is its own volume (`pgdata`) — separate data from the host PostgreSQL instance.
- **Docker Hub (team access, since 2026-07-06):** public images `jeffreyjr/shadow-it-backend` (trained ML artifacts BAKED IN — no training needed) and `jeffreyjr/shadow-it-frontend`, with OCI author labels. Teammates: clone repo, `docker compose -f docker-compose.hub.yml up -d`. Re-push after model retrain: rebuild, overlay artifacts into the backend tag, `docker push` both (see scratchpad Dockerfile.artifacts pattern — overlay FROMs the compose-built backend image and COPYs ml/artifacts in, because .dockerignore excludes artifacts from the main build context).

---

## Directory Structure
```
shadow-it-detection/
├── backend/
│   ├── app.py                  # Flask entry point, blueprint registration
│   ├── middleware/
│   │   ├── jwt_auth.py         # @token_required decorator
│   │   └── rbac.py             # @admin_required decorator
│   ├── models/
│   │   └── db_models.py        # execute() helper — psycopg v3, dict_row
│   └── routes/
│       ├── auth.py             # /api/auth/login, /api/auth/logout
│       ├── detections.py       # /api/detections CRUD + CSV export
│       ├── stats.py            # /api/stats, /api/stats/timeline, top-offenders, alerts
│       ├── audit.py            # /api/audit-logs + /api/audit-logs/verify
│       ├── metrics.py          # /api/metrics (reads ml/reports/)
│       ├── scan.py             # /api/scan/* (live packet capture)
│       ├── report.py           # /api/report/generate (PDF download)
│       ├── wazuh.py            # /api/wazuh/status + /api/wazuh/sync (Syscollector ingest)
│       └── radius.py           # /api/radius/status + /api/radius/sync (RADIUS accounting ingest)
├── ml/
│   ├── model.py                # IsolationForest train + detect + classify_risk
│   ├── preprocess.py           # Feature cleaning, MinMaxScaler
│   ├── load_cicids.py          # CICIDS2017 CSV loader, FEATURE_COLS list
│   ├── generate_dataset.py     # Synthetic training data generator
│   ├── evaluate.py             # Accuracy/precision/recall/F1 + 6 scenario tests
│   ├── collector.py            # Live Scapy packet capture → flow features → detect
│   ├── wazuh.py                # Wazuh manager REST client — Syscollector software-inventory ingest
│   ├── radius.py               # FreeRADIUS accounting (radacct) query — concurrent-session ingest
│   ├── artifacts/              # isolation_forest.pkl, scaler.pkl (gitignored)
│   └── reports/                # metrics_summary.csv, scenario_results.csv
├── db/
│   ├── schema.sql              # CREATE TABLE users, detections, audit_logs
│   ├── immutability.sql        # Triggers + restricted role + hash chain
│   ├── seed.py                 # Inserts default admin/viewer users
│   └── setup.py                # All-in-one DB setup script
├── frontend/                   # Next.js 14 App Router + TypeScript (replaced the old CRA app on 2026-07-01)
│   ├── tailwind.config.ts      # darkMode:'class', glass-bg/glass-border theme colors
│   ├── postcss.config.js
│   ├── next.config.js
│   ├── styles/globals.css      # Full design system: glass/glow, dark+light CSS vars, Inter, badge/integrity classes
│   ├── app/
│   │   ├── layout.tsx          # Root layout, dark-mode init script (pre-hydration, avoids flash)
│   │   ├── providers.tsx       # Per-route dark-mode class effect (no auth session provider — plain JWT)
│   │   ├── page.tsx            # `/` → redirects to /dashboard or /login based on cookie token
│   │   ├── login/page.tsx      # Real authApi.login(username, password); no OAuth/signup (backend has neither)
│   │   ├── privacy/page.tsx, terms/page.tsx   # Static legal pages
│   │   └── dashboard/
│   │       ├── layout.tsx      # Auth guard (redirects to /login if no cookie token) + Sidebar/Topbar shell
│   │       ├── page.tsx        # Overview — statsApi (summary/timeline/topOffenders), admin Run Detection + Export Report
│   │       ├── alerts/page.tsx # Detections list — real filters/pagination/CSV export/resolve, inline detail slide-over
│   │       ├── devices/page.tsx       # Device inventory — client-side aggregation of /api/detections by src_ip/src_mac
│   │       ├── applications/page.tsx  # App/destination inventory — aggregation by dst_domain
│   │       ├── reports/page.tsx       # Model Performance + Test Scenarios tabs — real /api/metrics, admin PDF export
│   │       ├── live-scan/page.tsx     # Admin-only — real-time packet capture UI via scanApi
│   │       ├── audit/page.tsx         # Admin-only — real /api/audit-logs + Verify Integrity (hash chain)
│   │       ├── settings/page.tsx      # Dark/light theme toggle only (no unbacked settings)
│   │       └── profile/page.tsx       # Real cookie-derived username/role + sign out
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx     # Nav + role-gated admin items (Live Scan, Audit Trail), collapses to icons (md) / drawer (mobile)
│   │   │   └── Topbar.tsx      # Dark/light toggle, real high-risk alert bell (statsApi.alerts()), page search, user menu
│   │   ├── ui/                 # GlassCard, Logo, Badge, AnimatedCounter, RiskMeter, StatusIcon
│   │   └── LoginBackground.tsx
│   └── lib/
│       ├── api.ts              # axios instance + all endpoints (authApi, detectionsApi, statsApi, metricsApi, auditApi, reportApi, scanApi) + apiErrorMessage()
│       ├── auth.ts             # js-cookie helpers: getToken/getRole/getUsername, setAuthFromLogin, isAdmin, isAuthenticated, clearAuth
│       ├── aggregate.ts        # fetchAllDetections/groupByDevice/groupByApplication (Devices & Applications pages)
│       ├── types.ts            # Detection/AuditLog/DashboardSummary/MetricsResponse/ScanStatus etc., matching backend response shapes exactly
│       └── useIsDark.ts        # Dark-mode hook + Recharts tooltip theming helper
├── requirements.txt
├── .env                        # DO NOT COMMIT — contains DB credentials
├── .env.example                # Template (safe to commit)
└── CLAUDE.md                   # This file
```

---

## Security Hardening (2026-07-06)
Applied a security-review batch (findings 3–8 + hygiene; secrets/default-creds handled separately by the author):
- **Auth token in HttpOnly cookie** — `POST /api/auth/login` sets `token` as `HttpOnly; SameSite=Lax; Max-Age=exp` (add `Secure` via `COOKIE_SECURE=true` behind TLS). JS can no longer read the token (XSS-safe). `token_required` accepts the cookie OR an `Authorization: Bearer` header (header kept for curl/API/tests). Frontend axios uses `withCredentials: true`, stores no token in JS — the non-sensitive `role` cookie is the client-side routing signal.
- **JWT revocation** — tokens carry a `jti`; `POST /api/auth/logout` inserts it into `token_denylist` (in `db/schema.sql`, granted in `immutability.sql`; `ensure_auth_schema()` is a check-first fallback for old volumes). `token_required` rejects revoked tokens. So logout now actually invalidates.
- **Login rate limiting** — Flask-Limiter, `5/min` per IP on `/api/auth/login` (in-memory → per-gunicorn-worker, so effective ≈ limit×workers; point `storage_uri` at Redis for a hard cluster limit).
- **Input validation** — `/api/detections` + `/export` validate `date_from/date_to` as ISO and whitelist `risk`/`type` → `400` instead of a `500`.
- **No info leaks** — `run-detection` and a global error handler return generic messages and log details server-side.
- **Debug off by default** — Flask dev server needs explicit `FLASK_DEBUG=true`; never on in prod (gunicorn).
- **TLS option** — `docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build` adds a Caddy HTTPS reverse proxy (`deploy/Caddyfile`), serves same-origin on 443, sets `COOKIE_SECURE=true`.
- Known remaining (author's call): secrets still in committed compose files; default `admin/admin123` seed creds.

---

## API Reference

Protected routes accept the auth token via an **HttpOnly cookie** (browser, set at login) or an `Authorization: Bearer <token>` header (API clients).

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Returns `{ token, user }` |
| POST | `/api/auth/logout` | Any | Revokes the token (denylist) + clears cookie + audit log |
| GET | `/api/detections` | Any | `?page=1&per_page=20&risk=high&type=software&date_from=&date_to=` |
| GET | `/api/detections/:id` | Any | Single detection |
| PATCH | `/api/detections/:id/resolve` | Admin | Toggle is_resolved |
| POST | `/api/run-detection` | Admin | Run IsolationForest on CICIDS2017 data, save to DB |
| GET | `/api/detections/export` | Any | CSV blob download |
| GET | `/api/stats` | Any | totals, by_risk, by_type, recent_alerts |
| GET | `/api/stats/timeline?days=30` | Any | Daily detection counts |
| GET | `/api/stats/alerts` | Any | `{ high_unresolved: N }` |
| GET | `/api/stats/top-offenders?limit=10` | Any | IPs with most detections |
| GET | `/api/metrics` | Any | ML performance from CSV files |
| GET | `/api/audit-logs?page=1&per_page=25` | Admin | Paginated audit log |
| GET | `/api/audit-logs/verify` | Admin | Hash chain integrity check |
| GET | `/api/scan/interfaces` | Admin | List Scapy network interfaces |
| POST | `/api/scan/start` | Admin | `{ iface: "NPF_..." }` — starts packet capture |
| POST | `/api/scan/stop` | Admin | Stops capture |
| GET | `/api/scan/status` | Admin | `{ running, packets_seen, flows_analysed, detections, uptime_s }` (admin-only since 2026-07-06 — live-scan telemetry is admin surface) |
| GET | `/api/scan/detections` | Admin | Drains anomaly buffer + saves to DB |
| POST | `/api/scan/flush` | Admin | Force-analyse all active flows immediately |
| GET | `/api/report/generate` | Admin | PDF binary download |
| GET | `/api/wazuh/status` | Admin | Passive Wazuh connectivity check — `{ connected, agents: [{id,name,ip,status}] }`, no DB writes |
| POST | `/api/wazuh/sync` | Admin | Pulls Syscollector software inventory from every connected agent, saves unsanctioned-catalog matches (`detection_source='wazuh'`) |
| GET | `/api/radius/status` | Admin | Passive RADIUS accounting check — `{ connected, open_sessions, identities }`, no DB writes |
| POST | `/api/radius/sync` | Admin | Flags identities with 2+ open RADIUS sessions from different NAS IPs (`detection_source='radius'`) |

---

## Database Schema

```sql
-- users
id, username, password_hash, role (admin|viewer), created_at

-- detections
id, src_ip, src_mac, dst_domain, protocol, bytes_sent, bytes_received,
duration, device_type, shadow_it_type (software|hardware|mixed),
risk_level (high|medium|low), anomaly_score, detected_at, is_resolved

-- audit_logs  (IMMUTABLE — triggers block UPDATE/DELETE)
id, user_id→users, action, target, timestamp, ip_address, entry_hash (SHA-256)
```

### Audit Log Immutability — Three Layers
1. **BEFORE UPDATE/DELETE trigger** (`fn_audit_immutable`) — raises exception on any modification, even by superuser
2. **Restricted role** (`shadow_it_app`) — has INSERT + SELECT only on audit_logs, no UPDATE/DELETE granted
3. **SHA-256 hash chain** (`fn_audit_hash`) — each INSERT computes `SHA256(user_id|action|target|ip|timestamp|prev_hash)` stored in `entry_hash`

Verify chain integrity: `GET /api/audit-logs/verify`

---

## ML Model Details

### Hybrid Two-Stage Detector (reworked 2026-07-04/05)
The model went through three reworks in one session (each documented in git/session history): benign-only training → F1-calibrated threshold → log1p features took the pure IsolationForest from 65.2% to 76.9% accuracy; experiments showed pure-unsupervised ceilings out at ~90%, so the final architecture is a **hybrid**:

- **Stage 1 — IsolationForest (unsupervised):** trained on BENIGN-only rows of the 70% train partition (500 trees, `max_samples=1.0`). Decision gate set at the 2nd percentile of benign training scores (`IF_GATE_FPR=0.02`, stored in `model.offset_`, currently -0.5246) — its job in the hybrid is high-confidence *novel* anomalies, including attack types the RF never saw.
- **Stage 2 — RandomForest (supervised):** 100 trees trained on the full labeled 70% partition (`ml/artifacts/random_forest.pkl`, loaded via `load_rf()`; `detect()` degrades to IF-only if the artifact is missing).
- **Hybrid rule:** flag = RF predicts attack **OR** IF score below gate. `anomaly_score`/risk levels always come from the IF score.

**Train/holdout split:** `train_mask()` in `ml/load_cicids.py` — deterministic 70/30 split hashing flow-identity columns (IPs/ports/timestamp), stable across scripts and immune to outlier clipping. Both models train on the 70%; `evaluate.py` measures ONLY the 30% holdout.

**Holdout metrics (44,778 unseen rows): accuracy 98.10%, precision 0.94, recall 0.99, F1 0.97, FPR 2.4%, IF ROC-AUC 0.89, 6/6 scenarios.** Stage breakdown: RF alone 99.6% acc, IF alone 82.6% acc (R=0.43 at the strict gate — by design).
```python
IsolationForest(
    n_estimators  = 500,
    contamination = 0.05,   # initial cut only; replaced by the 2% FPR gate in offset_
    max_samples   = 1.0,    # every benign training row per tree (big AUC win vs 512)
    random_state  = 42,
    n_jobs        = -1,
)
RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
```

### Risk Classification (empirically calibrated thirds)
Thresholds are tertiles of the IF anomaly_score distribution on flagged records — NOT the theoretical `score_samples()` range. They are **per-network**: live IsolationForest scores run more anomalous than the 2017 CICIDS baseline (domain shift), so the CICIDS tertiles pinned every live flow to high/medium (never low). **Recalibrated 2026-07-20 to live traffic** (measured from 185 live-captured flagged flows: range [-0.7509, -0.5248], p33=-0.685, p66=-0.563):
```python
if score < -0.685:  return "high"    # bottom third — most anomalous
if score < -0.563:  return "medium"  # middle third
else:               return "low"     # top third — mildly anomalous
```
Recalibrate these two constants in `ml/model.py` (`RISK_THRESHOLD_HIGH`/`RISK_THRESHOLD_MEDIUM`) after retraining or when deploying on a different network. Query: `SELECT percentile_cont(0.33/0.66) WITHIN GROUP (ORDER BY anomaly_score) FROM detections`. (Prior CICIDS-holdout calibration was -0.564 / -0.459 from 13,141 flagged holdout records.)

### Feature Engineering
20 CICIDS2017 features used. Key ones: Flow Duration, Total Fwd/Bwd Packets, Packet Length Mean/Std/Max, Flow Bytes/s, Flow Packets/s, SYN/FIN/RST/PSH/ACK flag counts, Init Win Fwd/Bwd, Subflow Fwd/Bwd Bytes, Active/Idle Mean.

**Added 2026-07-04:** heavy-tailed features (durations, packet/byte counts and rates, flag counts — `LOG_FEATURES` in `ml/preprocess.py`) get `np.log1p(clip(x,0))` before MinMaxScaler; without it, 99% of their values were squashed into a sliver near 0 and the forest couldn't split on them (this lifted ROC-AUC 0.736 → 0.821). The transform is applied only to the feature matrix — `df_clean` keeps raw values because `detect()` reads bytes/duration from it for dashboard records. Bounded features (packet-length means, Init_Win bytes) stay linear.

### Live Capture (ml/collector.py)
- `FlowRecord` — tracks bidirectional flow stats (canonical 5-tuple key: smaller IP first)
- **SNI enrichment (added 2026-07-05):** `extract_sni()` parses the TLS ClientHello's cleartext Server Name Indication (no decryption); `extract_http_host()` grabs the Host header from plaintext HTTP. First hostname found in a flow's early payloads is stored on `FlowRecord.sni` (max 10 parse attempts/flow) and `detect()` prefers it over the raw destination IP for `dst_domain` — so the dashboard's Applications page names actual services (e.g. `drive.google.com`) for live-captured traffic. CICIDS records have no `sni` field and fall back to the IP. Known gap: QUIC/HTTP-3 (UDP) handshakes are not parsed — those flows show IPs.
- **Sanctioned-services allowlist (added 2026-07-05):** `ml/sanctioned_services.txt` — one domain per line, `#` comments; subdomains match (`anthropic.com` covers `api.anthropic.com`). `detect()` suppresses flagged flows whose destination *hostname* matches (sanctioned = authorized IT, not Shadow IT) and logs the suppressed count. Raw-IP destinations never match — an unnamed service can't be verified as sanctioned. Ships with `anthropic.com` active (this dev machine uses Claude Code). Loader/matcher: `load_allowlist()` / `is_sanctioned()` in `ml/model.py`. Does not affect evaluate.py metrics (evaluation bypasses detect()).
- `NetworkCollector` — singleton with sniff thread + flush thread
- `flow_timeout=15s`, `flush_interval=5s`
- `flush_all()` — force-analyses all active flows immediately (used by "Analyze Now" button)
- Requires Npcap on Windows; Flask must run as Administrator

---

## Wazuh Software-Inventory Integration (added 2026-07-27)
Roadmap feature #3 (`Shadow-IT-Pipeline-Flowchart.png`, "Wazuh — INTEGRATE"). A
second, independent detection source alongside the network-flow pipeline
above: instead of catching an unsanctioned app by its *traffic*, Wazuh's
Syscollector module reports what's *installed* on an endpoint, so an app is
still flagged even if the detector's capture window never saw it phone home.
Deliberately an **integration**, not a rebuild — Wazuh is an existing,
mature tool used as a data source; the two actual custom contributions
remain concurrent-session detection and the AI Assistant.

- **Deployment — manager-only, no indexer/dashboard.** `docker run wazuh/wazuh-manager:4.9.2`
  on the bank-net docker-host Ubuntu VM (`192.168.137.40`), publishing
  **1514/tcp AND 1514/udp** (agent comms — Wazuh 4.9 agents default to TCP;
  publishing UDP only silently leaves every agent `never_connected`), 1515/tcp
  (enrollment), 55000/tcp (REST API). The indexer (OpenSearch) and dashboard
  are skipped — the manager's own REST API already exposes Syscollector data
  per-agent, which is all this integration needs. Default API creds
  (`wazuh`/`wazuh`) are fine for this closed lab network; rotate before any
  real exposure.
- **Agents** — real Windows agent MSIs (`wazuh-agent-4.9.2-1.msi`) installed on
  `support-ws` (192.168.137.244) and `employee-ws` (192.168.137.243), the same
  two Windows VMs from `bank-net/vms/README.md`. Auto-enrollment (no
  pre-shared password) against `WAZUH_MANAGER=192.168.137.40`.
- **`ml/wazuh.py`** — `get_status()` (passive: authenticate + list agents,
  no Syscollector pull, no DB writes) and `scan_installed_software()` (pulls
  each active agent's package list, matches against `ml/saas_catalog.csv`
  **by app name** via `load_saas_catalog()`, re-indexed name→domain). Matching
  is **word-boundary regex**, not a bare substring — a naive `in` check
  false-positived constantly (`"Xbox Game Bar"` ~ catalog entry `"Box"`,
  `"Microsoft Store"` ~ catalog entry `"Tor"`). One detection per matched app
  per agent (deduped via a per-scan `seen_apps` set), saved with
  `detection_source='wazuh'`, `src_mac='Wazuh'`, `dst_domain="<App> (installed software)"`,
  `anomaly_score=0.0` (score is meaningless for a presence signal — risk comes
  straight from the catalog's `risk` column, same as a catalog network hit).
- **API** — `backend/routes/wazuh.py`, admin-only: `GET /api/wazuh/status`
  (connectivity + per-agent status, called on Live Scan page load) and
  `POST /api/wazuh/sync` (full pull + `insert_detections()`, audit-logged as
  `WAZUH_SYNC`).
- **Frontend** — new "Wazuh Software Inventory" card on
  `live-scan/page.tsx`: a persistent connected/agent-count pill (fetched via
  `wazuhApi.status()` on mount, refreshed after every sync — without it the
  card showed nothing until "Sync Inventory" was clicked, which read as
  "Wazuh not connected"), a Sync button, and a results table.
  `detection_source: 'wazuh'` added to `lib/types.ts` and the Alerts page's
  source filter/badge map.
- **New dependency:** `requests` (wasn't previously in `requirements.txt`).
- **Config:** `WAZUH_API_URL` / `WAZUH_API_USER` / `WAZUH_API_PASSWORD` in
  `.env` (defaults already point at the bank-net deployment above).
- **Verified:** `support-ws` → TeamViewer + AnyDesk (high), `employee-ws` →
  Dropbox (high) — matches the real installs from `bank-net/vms/README.md`
  with zero false positives after the word-boundary fix.

---

## RADIUS/AAA Concurrent-Session Integration (added 2026-07-27)
Roadmap feature #4 — the last item (`Shadow-IT-Pipeline-Flowchart.png`,
"RADIUS/AAA — 'Regae?' INTEGRATE"). FreeRADIUS's **Simultaneous-Use** check
enforces concurrent-login limits at the network-auth layer (Wi-Fi/VPN/802.1X),
and its **accounting** feed is a second, independent source for the same
identity-Shadow-IT signal the app-layer concurrent-session feature already
provides (`backend/routes/auth.py._check_and_enforce_concurrency`) — sourced
from network logins instead of dashboard JWT sessions.

- **Deployment.** `freeradius/freeradius-server:latest` (3.2.10) on the
  bank-net docker-host Ubuntu VM, **attached to the `bank-net_banknet` macvlan
  network** (`192.168.137.43`), not a plain bridge/published-port container —
  a bridge container's ports are **unreachable from the macvlan bank-net
  containers** (a known Docker limitation: macvlan-to-docker-host doesn't
  route back to the host's own published ports). Config is a locally-edited
  copy of the image's default `/etc/freeradius` (`docker cp`'d out, edited,
  bind-mounted back in) rather than raw env vars — FreeRADIUS's config
  surface is too broad for env-var overrides alone.
- **Accounting writes directly into the existing PostgreSQL** (`shadow_it_db`)
  — not a REST API like Wazuh. FreeRADIUS's own `mods-available/sql` module
  (`dialect=postgresql`, `radius_db="host=192.168.137.1 port=5432 dbname=shadow_it_db user=freeradius_app password=..."`)
  writes straight into the standard FreeRADIUS schema (`radacct`, `radcheck`,
  `radreply`, `nas`, ...), applied to `shadow_it_db` as **new tables only**.
  A restricted `freeradius_app` Postgres role (own login, `GRANT` scoped to
  just those tables) plus a `pg_hba.conf` rule scoped to the
  `192.168.137.0/24` subnet and a matching Windows Firewall rule (inbound
  5432, same subnet only) — same least-privilege pattern as `shadow_it_app`.
  `shadow_it_app` itself gets a plain `GRANT SELECT ON radacct` so the backend
  can read it.
- **Config gotchas that actually bite** (all fixed in the committed config):
  config files copied out via `docker cp` land owned by the host user, not
  the container's `freerad` user — `chmod -R o+rX` the whole tree or every
  module load fails on a permission error (hit this on `certs/server.pem` and
  `mods-config/preprocess/huntgroups`). The default site references the `eap`
  module in **four places** (`authorize{}`, `authenticate{}`, `post-auth{}`,
  plus the whole `inner-tunnel` virtual server) — removing the `eap` module
  (not needed for simple PAP auth) means all four must be commented out too,
  or the config fails to parse. The `session{}` block's `sql` line (for
  Simultaneous-Use) is commented out by default and must be enabled.
- **`ml/radius.py`** — `get_concurrent_sessions()` / `scan_concurrent_sessions()`,
  a plain SQL query (`GROUP BY username HAVING COUNT(DISTINCT nasipaddress) > 1
  WHERE acctstoptime IS NULL`) — no REST client needed since accounting is
  already in-database. Use `host(nasipaddress)` not `nasipaddress::text` or
  every IP grows a spurious `/32` suffix. Detection shape matches the
  app-layer feature exactly (`shadow_it_type='identity'`, `risk_level='high'`,
  `app_category='identity'`, `device_type='user-account'`), with
  `detection_source='radius'`.
- **API** — `backend/routes/radius.py`, admin-only: `GET /api/radius/status`
  (open-session + identity counts, no writes) and `POST /api/radius/sync`
  (audit-logged as `RADIUS_SYNC`).
- **Frontend** — "RADIUS/AAA Concurrent Sessions" card on `live-scan/page.tsx`,
  same status-pill-on-load + sync-button pattern as the Wazuh card.
  `detection_source: 'radius'` added to `lib/types.ts` and the Alerts page.
- **Demo simulation** (no real 802.1X/Wi-Fi hardware in this testbed):
  `freeradius-utils` (`radclient`) installed directly into the `teller-01`/
  `teller-02` bank-net containers (Debian-based, plain `apt-get install`).
  A test identity (`demo_employee`, `radcheck` `Cleartext-Password` +
  `Simultaneous-Use=1`) logging in from `teller-02` while already
  "logged in" from `teller-01` gets a **genuine FreeRADIUS
  `Access-Reject — "You are already logged in - access denied"`** — the
  real-time enforcement working exactly as designed. A separate
  `Accounting-Start` sent from `teller-02` regardless (modelling a NAS that
  doesn't enforce the check, or out-of-order accounting) is what the
  audit-trail sync in `ml/radius.py` actually catches.
- **Verified:** `demo_employee` shows as logged in from `192.168.137.41` AND
  `.42` simultaneously in `radacct`; sync produces one high-risk `identity`
  detection, confirmed via `/api/detections?...` and the audit log.

---

## Frontend Design System

**History:** the original CRA frontend (plain CSS, "no glow/no animation") was first reskinned with Tailwind/glassmorphism while staying on CRA. On 2026-07-01 the user replaced the frontend entirely with a downloaded Next.js/TypeScript app whose visual language they preferred — that app's dashboard pages were almost all mock data, so every page was rewired to the real Flask API described above. The framework is now Next.js 14 (App Router) + TypeScript, not CRA.

**Colors (CSS variables in `styles/globals.css`, dark = default, light via `html:not(.dark)`):**
```css
--bg-base:      #080c1a   /* dark page background (light: #f5f7fb) */
--glass-bg:     rgba(16,24,48,0.55)   /* light: rgba(255,255,255,0.98) */
--glass-border: rgba(100,160,255,0.18)
--glass-blur:   blur(18px)
--accent-primary: #3b82f6 · --accent-danger: #ef4444 · --accent-success: #10b981
```

**Design principles:**
- Glassmorphism: `.glass` class (translucent background + `backdrop-filter: blur()`) used by `GlassCard` and the Sidebar/Topbar shell
- Glow effects and colored status badges throughout (risk levels, audit action badges, integrity indicator)
- Dark/light toggle: `html.dark` class, persisted in `localStorage` (`darkMode`), toggled from the Topbar or `/dashboard/settings`; `lib/useIsDark.ts` exposes the current state via a `MutationObserver`
- framer-motion for the Sidebar mobile drawer (slide + backdrop), card hover micro-interactions, and page transitions
- Sidebar + Topbar shell (`components/layout/`, wired in `app/dashboard/layout.tsx`) — Sidebar collapses to icon-only at `md` breakpoint, becomes a slide-in drawer below `md`
- Inter font (Google Fonts); badges remain pill-shaped

**Icons:** lucide-react v0.408 (SVG, no emojis anywhere)

**RBAC in UI:**
- Admin-only: Run Detection, Export Report, Live Scan page/nav item + route guard, Audit Trail page/nav item + route guard, Resolve button, Generate PDF Report
- `isAdmin()` from `lib/auth.ts` checks the `role` cookie (set from the real login response); Sidebar hides admin-only nav items and `live-scan`/`audit` pages redirect non-admins to `/dashboard`

---

## Known Issues & Gotchas

1. **Python path on current device:** Always use the full path `"C:\Users\IT-LIFE\AppData\Local\Python\bin\python3.14.exe"` — the system `python` command may point to a different installation. Install packages with `-m pip install`.

2. **Scapy requires admin:** Flask must be launched from an Administrator terminal for Live Scan to work on Windows. Regular terminal → Scapy will fail to open raw sockets.

3. **Interface names on Windows:** Scapy uses NPF_ prefixed names (e.g. `NPF_{GUID}`). The UI's interface picker calls `/api/scan/interfaces` to list them. Pick the one that matches your active network adapter.

4. **psycopg v3 syntax:** The project uses `psycopg` (v3), not `psycopg2`. The `%s` placeholder style works, but use `psycopg.connect()` not `psycopg2.connect()`. Row factory is `dict_row`.

5. **DB role:** `.env` uses `DB_USER=shadow_it_app` (restricted role). If schema changes are needed, connect as `postgres` superuser directly.

6. **PDF report:** `reportlab` must be installed in the same Python environment as Flask. Test with: `python -c "import reportlab"`.

7. **ML artifacts not committed:** `ml/artifacts/` (pkl files) and `data/` (CSVs) are gitignored. On a new device, run `generate_dataset.py` → `model.py` → `evaluate.py` before using Run Detection or Live Scan.

---

## Commit History Summary
| Commit | What was done |
|---|---|
| `Initial commit` | Full-stack foundation: Flask API, React UI, IsolationForest, PostgreSQL |
| `UI overhaul` | Animations, live dashboard, SVG icons |
| `ML metrics page` | Accuracy/precision/recall/F1, confusion matrix, CSV export, auto-refresh |
| `Audit immutability` | Triggers, restricted role, SHA-256 hash chain |
| `Live network flow collector` | Scapy collector, scan page, 20 CICIDS features |
| `README update` | Setup guide updated |
| `Live scan UX fixes` | Uptime format bug, risk thresholds, Analyze Now button |
| `PDF security report` | reportlab 6-section report, `/api/report/generate` |
| `feat: replace CRA frontend with Next.js` (9683b11) | Full frontend replacement: Next.js 14/TypeScript app rewired to the real Flask API, real login, admin-only Live Scan page built from scratch |
| `fix: recalibrate risk thresholds...` (079ebc5) | Risk threshold recalibration + live-scan interface picker fix |
| `feat: hybrid IF+RF detector` (7e41fc4) | ML overhaul 2026-07-04/05: benign-only training, log1p features, tuned IF, supervised RF stage, 70/30 holdout split — 98.1% holdout accuracy (was 65.2%) |
| `feat: surface hybrid model metrics on the Reports page` (983029a) | /api/metrics + Reports page show ROC-AUC and IF/RF stage breakdown |

Working tree clean as of 2026-07-05. Detections table was cleared and repopulated with hybrid-scored rows the same day (old rows carried incompatible scores from previous models).

---

## What's Left / Possible Next Steps
- Roadmap (`Shadow-IT-Pipeline-Flowchart.png`) — **all four items complete**: concurrent-session detection ✓, AI Assistant ✓, Wazuh software-inventory ingest ✓, RADIUS/AAA accounting feed ✓ (both 2026-07-27)
- Full bank-net demo rehearsal (Live Scan + Wazuh sync + RADIUS sync run together, cross-checked against `bank-net/EXPECTED.md`) done 2026-07-27 — every device/behaviour row matched; see the git history around that date for details
- Recurring gotcha: both Windows VMs (`support-ws`, `employee-ws`) have spontaneously powered off unprompted several times during long sessions — check their power/sleep settings and Windows Update schedule before a live demo
- Push commits to the GitHub remote
- Final testing of all features end-to-end in the browser (incl. new Reports page sections; restart Flask to pick up metrics.py changes)
- Optional dissertation experiment: leave-one-attack-out (retrain RF without e.g. DDoS labels, show the IF gate still catches it) to evidence the novel-threat claim
- Dissertation write-up / report referencing this codebase
