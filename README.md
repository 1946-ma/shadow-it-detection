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
| PostgreSQL | 15 or 16 | https://www.postgresql.org/download/ |
| Git | any | https://git-scm.com/downloads |

> During Python installation, check **"Add Python to PATH"**.  
> During PostgreSQL installation, note your `postgres` user password — you will need it in Step 3.

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

---

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set `DB_PASSWORD` to your PostgreSQL password:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shadow_it_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=shadow-it-umat-2026-super-secret-key
JWT_EXPIRY_HOURS=8
FLASK_ENV=development
FLASK_PORT=5000
```

---

### 4. Set up the database

Ensure PostgreSQL is running, then run:

```bash
python db/setup.py
```

This creates the `shadow_it_db` database, all tables, indexes, and seeds the two default accounts in one step.

| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Viewer | viewer | viewer123 |

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
Results are saved to `ml/reports/`.

---

### 8. Start the Flask API

```bash
python backend/app.py
```

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

See `SETUP_GUIDE.md` for the full step-by-step VM network demo procedure.

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Returns JWT token |
| POST | `/api/auth/logout` | JWT | Logs out |

### Detections
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/detections` | JWT | List — filterable and paginated |
| GET | `/api/detections/:id` | JWT | Single detection detail |
| PATCH | `/api/detections/:id/resolve` | JWT + Admin | Mark as resolved |
| POST | `/api/run-detection` | JWT + Admin | Run Isolation Forest on dataset |

### Stats & Audit
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/stats` | JWT | Dashboard summary metrics |
| GET | `/api/audit-logs` | JWT + Admin | Paginated audit event history |

**Filter parameters for `GET /api/detections`:**
- `type` — `software` · `hardware` · `mixed`
- `risk` — `high` · `medium` · `low`
- `date_from`, `date_to` — ISO datetime strings
- `page`, `per_page` — pagination

---

## Project Structure

```
shadow-it-detection/
├── backend/
│   ├── app.py                  Flask entry-point and route registration
│   ├── middleware/
│   │   ├── jwt_auth.py         JWT token validation
│   │   └── rbac.py             Role-based access control (admin / viewer)
│   ├── models/
│   │   └── db_models.py        PostgreSQL query helpers (psycopg3)
│   └── routes/
│       ├── auth.py             Login / logout
│       ├── detections.py       Detection CRUD
│       ├── stats.py            Dashboard metrics
│       └── audit.py            Audit log
├── data/                       CICIDS2017 CSV files (download separately)
├── db/
│   ├── schema.sql              Database schema reference
│   └── setup.py                One-command DB initialiser
├── frontend/
│   ├── src/
│   │   ├── App.jsx             Router + protected routes
│   │   ├── pages/              Login · Dashboard · Detections · DetectionDetail · AuditLog
│   │   ├── components/         Navbar · StatsCards · AlertPanel · RiskBadge · TypeBadge
│   │   └── utils/
│   │       ├── api.js          Axios HTTP client
│   │       └── auth.js         JWT storage and auth helpers
│   ├── package.json
│   └── .env                    HOST=0.0.0.0 (enables VM network access)
├── ml/
│   ├── load_cicids.py          CICIDS2017 loader (load_all / load_fast)
│   ├── preprocess.py           Clean → MinMax scale pipeline
│   ├── model.py                Isolation Forest train() and detect()
│   ├── evaluate.py             Accuracy, Precision, Recall, F1, FPR
│   ├── test_model.py           Quick 6-scenario pass/fail test
│   └── artifacts/              Generated after training (not in repo)
├── .env.example                Environment variable template
├── requirements.txt            Python dependencies
├── SETUP_GUIDE.md              Full setup and VM demo guide
└── README.md
```

---

## Architecture

```
  Browser (React Dashboard)
          │  JWT
          ▼
  Flask REST API  ──SQL──►  PostgreSQL
          │
          ▼
  Isolation Forest (scikit-learn)
          │
          ▼
  CICIDS2017 CSVs (8 files, ~3.1M network flows)
```

### How detection works

1. `POST /api/run-detection` triggers `load_fast()` — reads the first 300 rows of each CICIDS2017 file
2. 20 numerical traffic features are extracted and MinMax-scaled
3. The trained Isolation Forest scores each flow — anomalies (score < threshold) are flagged
4. Each anomaly is classified into a **Shadow IT type** and **risk level**, then saved to the database
5. The dashboard updates in real time

### Isolation Forest scoring

```
s(x, n) = 2^( −E(h(x)) / c(n) )
```

`E(h(x))` = mean path length across trees · `c(n)` = normalisation constant  
Shorter path → more isolated → higher anomaly score

### Risk classification

| Anomaly Score | Shadow IT Type | Risk Level |
|---|---|---|
| any | mixed (bot/infiltration) | High |
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

## Model Performance

Trained on ~200,000 CICIDS2017 flows · Isolation Forest (unsupervised)

| Metric | Result |
|---|---|
| Overall accuracy | 65.20% |
| Test scenarios passed | 6 / 6 (100%) |
| Detection speed | < 1 ms per record |
| Contamination parameter | 0.27 (matches 27% attack rate in dataset) |

> Isolation Forest is an unsupervised algorithm — it learns normal traffic patterns without labelled attack data. Overall accuracy reflects statistical isolation performance across all flow types. All 6 attack scenario tests (DDoS, port scan, web attack, brute force, bot, infiltration) pass correctly.

---

## Role-Based Access

| Feature | Admin | Viewer |
|---|---|---|
| View dashboard | Yes | Yes |
| View detections | Yes | Yes |
| View detection detail | Yes | Yes |
| Run ML detection | Yes | No |
| Resolve an alert | Yes | No |
| View audit log | Yes | No |
