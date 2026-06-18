# CLAUDE.md — Shadow IT Detection Framework
> BSc Cybersecurity Final Year Project · University of Mines and Technology (UMaT)
> Author: Jeffrey Sampson Ennin · jeffreysampsonennin@gmail.com
> This file gives Claude full project context to continue work on any device.

---

## Project Summary
An AI-Driven Shadow IT Detection Framework. Detects unauthorized devices and software on a network using an IsolationForest ML model trained on the CICIDS2017 dataset. Includes live packet capture, a full REST API, a React dashboard, PDF report generation, and tamper-proof audit logs.

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
| Frontend | React 18, React Router v6, Recharts, lucide-react, axios |
| Font | Inter (Google Fonts, loaded in index.css) |
| CSS | Custom dark theme — Tailwind Slate palette (#0f172a bg, #1e293b cards) |

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

### 6. Run React frontend
```bash
cd frontend
npm install
npm start
```
React runs on `http://localhost:3000`

### frontend/.env (already committed)
```env
HOST=0.0.0.0
GENERATE_SOURCEMAP=false
DISABLE_ESLINT_PLUGIN=true
BROWSER=none
```

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
│       └── report.py           # /api/report/generate (PDF download)
├── ml/
│   ├── model.py                # IsolationForest train + detect + classify_risk
│   ├── preprocess.py           # Feature cleaning, MinMaxScaler
│   ├── load_cicids.py          # CICIDS2017 CSV loader, FEATURE_COLS list
│   ├── generate_dataset.py     # Synthetic training data generator
│   ├── evaluate.py             # Accuracy/precision/recall/F1 + 6 scenario tests
│   ├── collector.py            # Live Scapy packet capture → flow features → detect
│   ├── artifacts/              # isolation_forest.pkl, scaler.pkl (gitignored)
│   └── reports/                # metrics_summary.csv, scenario_results.csv
├── db/
│   ├── schema.sql              # CREATE TABLE users, detections, audit_logs
│   ├── immutability.sql        # Triggers + restricted role + hash chain
│   ├── seed.py                 # Inserts default admin/viewer users
│   └── setup.py                # All-in-one DB setup script
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Router — 6 private routes + login
│   │   ├── index.css           # Full design system (Tailwind Slate palette, Inter)
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx   # Stats, charts, top offenders, alerts, Run Detection, Export Report
│   │   │   ├── Detections.jsx  # Filterable table + CSV export + pagination
│   │   │   ├── DetectionDetail.jsx
│   │   │   ├── ModelMetrics.jsx # Accuracy/precision/recall/F1, confusion matrix, scenarios
│   │   │   ├── LiveScan.jsx    # Live packet capture UI
│   │   │   └── AuditLog.jsx    # Audit log + hash chain verify
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── StatsCards.jsx
│   │   │   ├── AlertPanel.jsx
│   │   │   ├── RiskBadge.jsx   # Uses lucide-react Circle icon
│   │   │   ├── TypeBadge.jsx   # Inline SVG icons for software/hardware/mixed
│   │   │   ├── AuditLogTable.jsx
│   │   │   └── DeviceProfile.jsx
│   │   └── utils/
│   │       ├── api.js          # axios instance + all API calls (authApi, detectionsApi, scanApi, reportApi…)
│   │       └── auth.js         # JWT helpers: getToken, getUser, isAdmin, setAuth, clearAuth
│   └── .env
├── requirements.txt
├── .env                        # DO NOT COMMIT — contains DB credentials
├── .env.example                # Template (safe to commit)
└── CLAUDE.md                   # This file
```

---

## API Reference

All protected routes require: `Authorization: Bearer <token>`

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Returns `{ token, user }` |
| POST | `/api/auth/logout` | Any | Writes audit log |
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
| GET | `/api/scan/status` | Any | `{ running, packets_seen, flows_analysed, detections, uptime_s }` |
| GET | `/api/scan/detections` | Admin | Drains anomaly buffer + saves to DB |
| POST | `/api/scan/flush` | Admin | Force-analyse all active flows immediately |
| GET | `/api/report/generate` | Admin | PDF binary download |

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

### IsolationForest Configuration
```python
IsolationForest(
    n_estimators  = 200,
    contamination = 0.27,   # 27% of training data treated as anomalous
    max_samples   = 512,
    random_state  = 42,
    n_jobs        = -1,
)
```

### Risk Classification (standard IsolationForest thirds)
`score_samples()` returns values in ~[-0.5, 0] for anomalies (more negative = more anomalous):
```python
if score < -0.33:   return "high"    # bottom third — most anomalous
if score < -0.17:   return "medium"  # middle third
else:               return "low"     # top third — mildly anomalous
```

### Feature Engineering
20 CICIDS2017 features used. Key ones: Flow Duration, Total Fwd/Bwd Packets, Packet Length Mean/Std/Max, Flow Bytes/s, Flow Packets/s, SYN/FIN/RST/PSH/ACK flag counts, Init Win Fwd/Bwd, Subflow Fwd/Bwd Bytes, Active/Idle Mean.

### Live Capture (ml/collector.py)
- `FlowRecord` — tracks bidirectional flow stats (canonical 5-tuple key: smaller IP first)
- `NetworkCollector` — singleton with sniff thread + flush thread
- `flow_timeout=15s`, `flush_interval=5s`
- `flush_all()` — force-analyses all active flows immediately (used by "Analyze Now" button)
- Requires Npcap on Windows; Flask must run as Administrator

---

## Frontend Design System

**Colors (CSS variables in index.css):**
```css
--bg:      #0f172a   /* slate-900 — page background */
--bg2:     #1e293b   /* slate-800 — card background */
--bg3:     #2d3f55   /* slate-700 — hover / inputs */
--border:  #2d3f55
--text:    #f1f5f9   /* near-white */
--text2:   #94a3b8   /* slate-400 — muted text */
--accent:  #3b82f6   /* blue-500 */
--success: #22c55e   /* green-500 */
--warning: #f59e0b   /* amber-500 */
--danger:  #ef4444   /* red-500 */
--purple:  #8b5cf6   /* violet-500 */
```

**Design principles:**
- No background animations, no glow effects, no scan lines
- Inter font (Google Fonts)
- Stat cards use 3px left border accent (not glow)
- Badges are pill-shaped (border-radius: 20px)
- Only 3 animations remain: `fadeIn` (page load), `shimmer` (skeleton), `spin` (spinner)

**Icons:** lucide-react v1.20+ (SVG, no emojis anywhere)

**RBAC in UI:**
- Admin-only: Run Detection, Export Report, Live Scan page, Audit Log page, Resolve button
- `isAdmin()` from `utils/auth.js` checks role from decoded JWT in localStorage

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

**Not yet committed (as of last session):**
- UI redesign (Tailwind Slate palette, Inter font, no animations)
- Risk thresholds updated to standard IsolationForest thirds (-0.33 / -0.17)

---

## What's Left / Possible Next Steps
- Commit & push the UI redesign and risk threshold changes
- Final testing of all features end-to-end
- Dissertation write-up / report referencing this codebase
