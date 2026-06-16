# AI-Driven Shadow IT Detection Framework

> BSc Cybersecurity Final Year Project · University of Mines and Technology (UMaT), Tarkwa, Ghana  
> Algorithm: Isolation Forest (scikit-learn) · Stack: Python · Flask · React.js · PostgreSQL  
> Dataset: CICIDS2017 — 8 real-world network traffic captures (~3.1 million flows)

---

## Prerequisites

Install these before proceeding:

| Tool | Version | Download |
|---|---|---|
| Python | **3.11 or 3.12** (not 3.13/3.14) | https://www.python.org/downloads/ |
| Node.js | 18 LTS | https://nodejs.org/en/download |
| PostgreSQL | 15, 16, or 17 | https://www.postgresql.org/download/ |
| Git | any | https://git-scm.com/downloads |
| Npcap | latest | https://npcap.com/#download *(Windows only — required for Live Scan)* |

> During Python installation, check **"Add Python to PATH"**.  
> During PostgreSQL installation, note your `postgres` user password — you will need it in Step 3.  
> During Npcap installation, check **"Install Npcap in WinPcap API-compatible Mode"**.

---

## Setup (run steps in order)

### 1. Clone the repository

```bash
git clone https://github.com/1946-ma/shadow-it-detection.git
cd shadow-it-detection
```

---

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs Flask, psycopg3, scikit-learn, pandas, PyJWT, bcrypt, and Scapy.

---

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shadow_it_db
DB_USER=shadow_it_app
DB_PASSWORD=sh4d0w_app_2026
JWT_SECRET=shadow-it-umat-2026-super-secret-key
JWT_EXPIRY_HOURS=8
FLASK_ENV=development
FLASK_PORT=5000
```

> The app connects as the restricted `shadow_it_app` role (created in Step 4b), not the `postgres` superuser. This enforces least-privilege access.

---

### 4a. Set up the database schema

Ensure PostgreSQL is running, then run as the `postgres` superuser:

```bash
python db/setup.py
```

This creates the `shadow_it_db` database, all tables, indexes, and seeds two default accounts.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Viewer | `viewer` | `viewer123` |

---

### 4b. Apply audit log immutability (run once, as postgres superuser)

```bash
psql -U postgres -d shadow_it_db -f db/immutability.sql
```

This applies three security layers to `audit_logs`:

1. **Hash chain trigger** — every new log entry gets a SHA-256 hash that chains to the previous entry (blockchain-style). Computed automatically on INSERT via `fn_audit_hash()`.
2. **Immutability triggers** — `fn_audit_immutable()` raises an exception on any UPDATE or DELETE, blocking modifications even from the postgres superuser.
3. **Restricted app role** — creates `shadow_it_app` with `SELECT + INSERT` only on `audit_logs`. UPDATE and DELETE are intentionally not granted.

---

### 5. Download the CICIDS2017 dataset

The model uses real network traffic data. Download all 8 CSV files from the Canadian Institute for Cybersecurity:

**Source:** https://www.unb.ca/cic/datasets/ids-2017.html

Place all 8 files in the `data/` folder:

```
data/
├── Monday-WorkingHours.pcap_ISCX.csv
├── Tuesday-WorkingHours.pcap_ISCX.csv
├── Wednesday-workingHours.pcap_ISCX.csv
├── Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv
├── Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv
├── Friday-WorkingHours-Morning.pcap_ISCX.csv
├── Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv
└── Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv
```

> Total size: ~3 GB. These files are excluded from this repository.

---

### 6. Train the Isolation Forest model

```bash
python ml/model.py
```

Loads and cleans CICIDS2017 data (~200,000 sampled flows), then trains the model.  
Expected duration: **3–8 minutes**.

Produces:
```
ml/artifacts/isolation_forest.pkl
ml/artifacts/scaler.pkl
```

---

### 7. (Optional) Evaluate model performance

```bash
python ml/evaluate.py
```

Runs 6 predefined test scenarios and prints accuracy, precision, recall, F1, and false positive rate.  
Results are saved to `ml/reports/` and displayed on the **Model Metrics** page in the dashboard.

---

### 8. Start the Flask API

**Standard mode** (dataset-based detection only):

```bash
python backend/app.py
```

**Administrator mode** (required for Live Network Scan on Windows):

```powershell
# Run PowerShell as Administrator, then:
python backend/app.py
```

> Live packet capture requires raw socket access. On Windows this means running as Administrator with Npcap installed. On Linux/macOS run with `sudo` or grant `CAP_NET_RAW`.

API available at `http://localhost:5000`  
Health check: `GET http://localhost:5000/api/health`

---

### 9. Install and start the React dashboard

```bash
cd frontend
npm install
npm start
```

Dashboard opens at `http://localhost:3000` — log in with `admin / admin123`.

---

## Accessing from a VM network

To access the dashboard from a virtual machine on the same host:

1. The `frontend/.env` file already contains `HOST=0.0.0.0` — no changes needed
2. Open firewall ports on the host (run PowerShell as Administrator):
   ```powershell
   New-NetFirewallRule -DisplayName "Shadow IT Flask API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
   New-NetFirewallRule -DisplayName "Shadow IT React UI"  -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```
3. In VMware: set the VM network adapter to **NAT**
4. From the VM browser, navigate to `http://192.168.223.1:3000` (replace with your VMnet8 IP from `ipconfig`)

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Returns JWT token |
| POST | `/api/auth/logout` | JWT | Logs out and writes audit entry |

### Detections
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/detections` | JWT | List — filterable and paginated |
| GET | `/api/detections/export` | JWT | Download filtered detections as CSV |
| GET | `/api/detections/:id` | JWT | Single detection detail |
| PATCH | `/api/detections/:id/resolve` | JWT + Admin | Mark as resolved |
| POST | `/api/run-detection` | JWT + Admin | Run Isolation Forest on CICIDS2017 dataset |

**Filter parameters for `GET /api/detections` and `/api/detections/export`:**
- `type` — `software` · `hardware` · `mixed`
- `risk` — `high` · `medium` · `low`
- `date_from`, `date_to` — ISO datetime strings
- `page`, `per_page` — pagination

### Stats
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/stats` | JWT | Dashboard summary (totals, by_type, by_risk) |
| GET | `/api/stats/timeline` | JWT | Daily detection counts (last N days) |
| GET | `/api/stats/alerts` | JWT | Count of unresolved high-risk detections |
| GET | `/api/stats/top-offenders` | JWT | Most active source IPs with risk breakdown |

### Audit Log
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/audit-logs` | JWT + Admin | Paginated audit event history |
| GET | `/api/audit-logs/verify` | JWT + Admin | Verify SHA-256 hash chain integrity |

### Model Metrics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/metrics` | JWT | Model accuracy, confusion matrix, scenario results |

### Live Network Scan
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/scan/interfaces` | JWT + Admin | List available network interfaces |
| POST | `/api/scan/start` | JWT + Admin | Start live packet capture (body: `{"iface": "eth0"}`) |
| POST | `/api/scan/stop` | JWT + Admin | Stop capture |
| GET | `/api/scan/status` | JWT | Packets seen, flows analysed, active flows, uptime |
| GET | `/api/scan/detections` | JWT + Admin | Drain pending anomalies and persist to DB |

---

## Project Structure

```
shadow-it-detection/
├── backend/
│   ├── app.py                  Flask entry-point and blueprint registration
│   ├── middleware/
│   │   ├── jwt_auth.py         JWT token validation decorator
│   │   └── rbac.py             Role-based access control (admin / viewer)
│   ├── models/
│   │   └── db_models.py        PostgreSQL query helpers (psycopg3)
│   └── routes/
│       ├── auth.py             Login / logout
│       ├── detections.py       Detection CRUD + CSV export
│       ├── stats.py            Dashboard metrics, timeline, alerts, top offenders
│       ├── audit.py            Audit log list + hash chain verify
│       ├── metrics.py          Model performance metrics from ml/reports/
│       └── scan.py             Live network scan start/stop/status/detections
├── data/                       CICIDS2017 CSV files (download separately, ~3 GB)
├── db/
│   ├── schema.sql              Database schema reference
│   ├── setup.py                One-command DB initialiser
│   └── immutability.sql        Audit log immutability: triggers + restricted role + hash chain
├── frontend/
│   ├── src/
│   │   ├── App.jsx             Router + protected routes
│   │   ├── pages/
│   │   │   ├── Login.jsx       Authentication page
│   │   │   ├── Dashboard.jsx   Live stats, charts, top offenders, timeline
│   │   │   ├── Detections.jsx  Detection list with filters and CSV export
│   │   │   ├── DetectionDetail.jsx  Full detection details
│   │   │   ├── AuditLog.jsx    Audit history with hash chain verify button
│   │   │   ├── ModelMetrics.jsx     Accuracy, confusion matrix, scenario table
│   │   │   └── LiveScan.jsx    Real-time packet capture and anomaly feed
│   │   ├── components/
│   │   │   ├── Navbar.jsx      Navigation with bell notification and role guards
│   │   │   ├── StatsCards.jsx  Animated summary cards
│   │   │   ├── AlertPanel.jsx  Recent high-risk alerts table
│   │   │   ├── AuditLogTable.jsx    Audit entries table
│   │   │   ├── DeviceProfile.jsx    Detection detail breakdown
│   │   │   ├── RiskBadge.jsx   High / Medium / Low badge
│   │   │   └── TypeBadge.jsx   Software / Hardware / Mixed badge
│   │   └── utils/
│   │       ├── api.js          Axios client (authApi, detectionsApi, statsApi,
│   │       │                   auditApi, metricsApi, scanApi)
│   │       └── auth.js         JWT storage and auth helpers
│   ├── package.json
│   └── .env                    HOST=0.0.0.0 (enables VM network access)
├── ml/
│   ├── load_cicids.py          CICIDS2017 loader (load_all / load_fast)
│   ├── preprocess.py           Clean → MinMax scale pipeline
│   ├── model.py                Isolation Forest train() and detect()
│   ├── collector.py            Live packet capture — FlowRecord + NetworkCollector
│   ├── evaluate.py             Accuracy, Precision, Recall, F1, FPR + reports
│   ├── test_model.py           6-scenario pass/fail test suite
│   ├── artifacts/              Generated after training (not in repo)
│   └── reports/                Generated after evaluate.py (not in repo)
├── .env.example                Environment variable template
├── requirements.txt            Python dependencies
└── README.md
```

---

## Architecture

```
  Browser (React Dashboard)
          │  JWT Bearer token
          ▼
  Flask REST API  ──SQL──►  PostgreSQL (shadow_it_db)
        │  │                    │
        │  │              audit_logs (immutable:
        │  │              trigger + restricted role
        │  │              + SHA-256 hash chain)
        │  │
        │  ├── Dataset path ──► CICIDS2017 CSVs
        │  │                        │
        │  │                    load_fast()
        │  │                        │
        │  └── Live path ──────► Scapy packet capture
        │                            │
        │                        FlowRecord assembly
        │                            │
        │                    (both paths converge here)
        │                            ▼
        └────────────────────► IsolationForest detect()
                                        │
                                   anomalies saved
                                   to detections table
```

### Dataset-based detection (Run Detection button)

1. `POST /api/run-detection` triggers `load_fast()` — reads the first 300 rows of each CICIDS2017 CSV
2. 20 numerical traffic features are extracted and MinMax-scaled
3. The trained Isolation Forest scores each flow — anomalies (`score < threshold`) are flagged
4. Each anomaly is classified into a Shadow IT type and risk level, then saved to the database

### Live network detection (Live Scan page)

1. Scapy captures raw IP packets from the selected network interface
2. Packets are grouped into bidirectional flows by `(src_ip, dst_ip, src_port, dst_port, protocol)`
3. After 30 seconds of inactivity, each flow is flushed and the same 20 CICIDS2017 features are computed
4. The trained Isolation Forest scores the flows — anomalies are saved to the database and appear in the live feed
5. The dashboard polls for new anomalies every 5 seconds while a scan is running

### Isolation Forest scoring

```
s(x, n) = 2^( −E(h(x)) / c(n) )
```

`E(h(x))` = mean path length across trees · `c(n)` = normalisation constant  
Shorter path → more isolated → higher anomaly score

### Risk classification

| Anomaly Score | Shadow IT Type | Risk Level |
|---|---|---|
| any | mixed (bot / infiltration) | High |
| \|score\| > 0.15 | any | High |
| \|score\| > 0.08 | any | Medium |
| \|score\| ≤ 0.08 | any | Low |

### Shadow IT type mapping

| CICIDS2017 Label | Shadow IT Type |
|---|---|
| DDoS, DoS, PortScan, FTP/SSH-Patator, Heartbleed | hardware |
| Web Attack (Brute Force, XSS, SQLi) | software |
| Bot, Infiltration | mixed |

---

## Audit Log Immutability

The audit log records every login, logout, detection run, and scan event. Three independent layers prevent any record from being altered after it is written:

| Layer | Mechanism | Blocks |
|---|---|---|
| 1 — Trigger | `fn_audit_immutable()` raises an exception on UPDATE / DELETE | Everyone, including the postgres superuser |
| 2 — Role | `shadow_it_app` has no UPDATE or DELETE permission on `audit_logs` | Stolen app credentials |
| 3 — Hash chain | Each entry stores SHA-256(content + previous hash); `GET /api/audit-logs/verify` recomputes the chain in SQL | Detects any tampering that bypasses layers 1 and 2 |

To verify the chain at any time, click **Verify Integrity** on the Audit Log page.

---

## Model Performance

Trained on ~200,000 CICIDS2017 flows · Isolation Forest (unsupervised)

| Metric | Result |
|---|---|
| Overall accuracy | 65.20% |
| Test scenarios passed | 6 / 6 (100%) |
| Detection speed | < 1 ms per record |
| Contamination parameter | 0.27 (matches 27% attack rate in dataset) |

> Isolation Forest is an unsupervised algorithm — it learns normal traffic patterns without labelled attack data. All 6 attack scenario tests (DDoS, port scan, web attack, brute force, bot, infiltration) pass correctly.

---

## Security Controls

| Control | Implementation |
|---|---|
| Password hashing | bcrypt (intentionally slow, salted) |
| Session tokens | JWT signed with HS256, 8-hour expiry |
| Role-based access | `@token_required` + `@admin_required` decorators on every sensitive endpoint |
| Database least privilege | App connects as `shadow_it_app` (no superuser rights) |
| Audit log integrity | Immutable via trigger + restricted role + SHA-256 hash chain |
| Frontend route guards | `<Private>` wrapper redirects unauthenticated users to `/login` |

---

## Role-Based Access

| Feature | Admin | Viewer |
|---|---|---|
| View dashboard | Yes | Yes |
| View detections | Yes | Yes |
| View detection detail | Yes | Yes |
| Export detections CSV | Yes | Yes |
| View model metrics | Yes | Yes |
| Run dataset detection | Yes | No |
| Resolve an alert | Yes | No |
| Live network scan | Yes | No |
| View audit log | Yes | No |
| Verify audit chain | Yes | No |
