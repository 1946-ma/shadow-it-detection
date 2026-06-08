# AI-Driven Shadow IT Detection Framework

> BSc Cybersecurity Final Year Project · University of Mines and Technology, Tarkwa  
> Algorithm: Isolation Forest (scikit-learn) | Stack: Python + Flask + React + PostgreSQL

---

## Quick-start (in order)

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+

---

### 1. Clone & install Python dependencies

```bash
cd shadow-it-detection
pip install -r requirements.txt
```

---

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your DB_PASSWORD and a strong JWT_SECRET
```

---

### 3. Set up PostgreSQL

Make sure PostgreSQL is running, then run the single setup script:

```bash
python db/setup.py
```

This script creates the database, all tables, and seeds the default users automatically.

Default credentials (change in production):

| Role   | Username | Password  |
|--------|----------|-----------|
| admin  | admin    | admin123  |
| viewer | viewer   | viewer123 |

---

### 4. Generate synthetic dataset

```bash
python ml/generate_dataset.py
# Produces: data/network_traffic.csv  (~10 000 records, ~10% Shadow IT)
```

---

### 5. Train the Isolation Forest model

```bash
python ml/model.py
# Produces: ml/artifacts/isolation_forest.pkl
#           ml/artifacts/encoders.pkl
#           ml/artifacts/scaler.pkl
```

---

### 6. Evaluate model performance

```bash
python ml/evaluate.py
# Prints accuracy, precision, recall, F1, FPR
# Runs 6 predefined test scenarios (S1–S6)
# Produces: ml/reports/metrics_summary.csv
#           ml/reports/scenario_results.csv
```

---

### 7. Start the Flask API

```bash
python backend/app.py
# API available at http://localhost:5000
# Health check: GET http://localhost:5000/api/health
```

---

### 8. Start the React dashboard

```bash
cd frontend
npm install
npm start
# Dashboard at http://localhost:3000
```

---

## API Reference

### Auth
| Method | Endpoint           | Auth | Description        |
|--------|--------------------|------|--------------------|
| POST   | /api/auth/login    | No   | Returns JWT token  |
| POST   | /api/auth/logout   | JWT  | Logs out           |

### Detections
| Method | Endpoint                        | Auth       | Description               |
|--------|---------------------------------|------------|---------------------------|
| GET    | /api/detections                 | JWT        | List (filterable/paged)   |
| GET    | /api/detections/:id             | JWT        | Single detection          |
| PATCH  | /api/detections/:id/resolve     | JWT+Admin  | Mark resolved             |
| POST   | /api/run-detection              | JWT+Admin  | Trigger ML detection      |

### Stats & Audit
| Method | Endpoint       | Auth      | Description         |
|--------|----------------|-----------|---------------------|
| GET    | /api/stats     | JWT       | Dashboard summary   |
| GET    | /api/audit-logs| JWT+Admin | Paginated audit log |

#### Filter parameters for `GET /api/detections`
- `type` — `software` | `hardware` | `mixed`
- `risk` — `high` | `medium` | `low`
- `date_from`, `date_to` — ISO datetime strings
- `page`, `per_page` — pagination

---

## Project Structure

```
shadow-it-detection/
├── backend/              Flask REST API
│   ├── app.py            Entry-point
│   ├── routes/           auth · detections · stats · audit
│   ├── middleware/        jwt_auth · rbac
│   └── models/           db_models (psycopg2)
├── ml/
│   ├── generate_dataset.py   Synthetic traffic generator
│   ├── preprocess.py         Clean → Encode → Normalise pipeline
│   ├── model.py              Isolation Forest train + detect()
│   └── evaluate.py           Metrics + 6 test scenarios
├── db/
│   ├── schema.sql            Table definitions
│   └── seed.py               Default user seeding
├── frontend/src/
│   ├── pages/                Login · Dashboard · Detections · Detail · AuditLog
│   ├── components/           AlertPanel · StatsCards · Badges · DeviceProfile · AuditLogTable
│   └── utils/                api.js · auth.js
├── requirements.txt
└── .env.example
```

---

## Architecture

```
React Dashboard  ←──JWT──→  Flask API  ←──SQL──→  PostgreSQL
                                │
                         Isolation Forest
                         (scikit-learn)
                                │
                     data/network_traffic.csv
```

### Isolation Forest anomaly score formula
```
s(x, n) = 2^( −E(h(x)) / c(n) )
```
Where `E(h(x))` = average path length across trees, `c(n)` = normalisation factor.

Scores are then classified into:
- **Shadow IT type**: `software` (unapproved domain), `hardware` (unknown MAC/device), `mixed`
- **Risk level**: `low` / `medium` / `high` based on score magnitude and type

---

## Performance Targets (from literature)
- Accuracy ≥ 90%
- F1-Score ≥ 90%
- Detection response time < 1 s per batch

---

## Role-Based Access

| Feature              | Admin | Viewer |
|----------------------|-------|--------|
| View dashboard       | ✅    | ✅     |
| View detections      | ✅    | ✅     |
| Resolve detection    | ✅    | ❌     |
| Run ML detection     | ✅    | ❌     |
| View audit log       | ✅    | ❌     |
