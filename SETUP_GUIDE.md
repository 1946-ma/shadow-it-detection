# Shadow IT Detection Framework — Full Setup Guide

**Project:** AI-Driven Shadow IT Detection System  
**Institution:** University of Mines and Technology (UMaT), Tarkwa, Ghana  
**Stack:** Python 3.11+ · Flask · React.js · PostgreSQL · scikit-learn (Isolation Forest)  
**Dataset:** CICIDS2017 (8 real-world network traffic CSV files)

---

## Table of Contents

1. [System Requirements](#1-system-requirements)  
2. [Required Software](#2-required-software)  
3. [VS Code Extensions](#3-vs-code-extensions)  
4. [Project Files Required](#4-project-files-required)  
5. [Installation Steps](#5-installation-steps)  
6. [Database Setup](#6-database-setup)  
7. [ML Model Training](#7-ml-model-training)  
8. [Running the Application](#8-running-the-application)  
9. [Accessing from Another Device (VM Network)](#9-accessing-from-another-device-vm-network)  
10. [Default Credentials](#10-default-credentials)  
11. [Project Structure](#11-project-structure)  
12. [Troubleshooting](#12-troubleshooting)

---

## 1. System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| OS | Windows 10 / Ubuntu 20.04 | Windows 11 / Ubuntu 22.04 |
| RAM | 8 GB | 16 GB |
| Disk Space | 10 GB free | 20 GB free |
| CPU | Dual-core 2.0 GHz | Quad-core 2.5 GHz+ |
| Network | Local network (for VM demo) | Host-only or NAT adapter |

> **Note:** The CICIDS2017 dataset (8 CSV files) alone occupies approximately 3–4 GB. Ensure sufficient disk space before proceeding.

---

## 2. Required Software

Install each tool in the order listed below.

### 2.1 Python 3.11 or 3.12

> **Important:** Do NOT use Python 3.13 or 3.14. Some scientific packages (scikit-learn, numpy) may lack pre-built wheels for those versions, requiring a C++ compiler to build from source. Python 3.11 or 3.12 is strongly recommended.

- **Download:** https://www.python.org/downloads/
- During installation, check **"Add Python to PATH"**
- Verify installation:
  ```
  python --version
  pip --version
  ```

### 2.2 Node.js 18 LTS (includes npm)

The React frontend requires Node.js.

- **Download:** https://nodejs.org/en/download (choose LTS version)
- Verify installation:
  ```
  node --version
  npm --version
  ```

### 2.3 PostgreSQL 15 or 16

The backend stores detections and audit logs in PostgreSQL.

- **Download:** https://www.postgresql.org/download/
- During installation:
  - Set a password for the `postgres` superuser — **remember this password**
  - Keep the default port: **5432**
  - Install **pgAdmin 4** when prompted (optional but useful)
- Verify PostgreSQL is running:
  ```
  psql -U postgres -c "SELECT version();"
  ```

### 2.4 Git

For cloning or transferring the project repository.

- **Download:** https://git-scm.com/downloads
- Verify:
  ```
  git --version
  ```

### 2.5 Visual Studio Code (Recommended Editor)

- **Download:** https://code.visualstudio.com/

### 2.6 VirtualBox or VMware Workstation *(VM Network Demo only)*

Required only if you intend to demonstrate the system across a virtual machine network.

| Virtualisation Tool | Download |
|---|---|
| VirtualBox (free) | https://www.virtualbox.org/wiki/Downloads |
| VMware Workstation Player (free) | https://www.vmware.com/products/workstation-player.html |

For the VM guest OS, download a lightweight Linux image:
- **Ubuntu 22.04 Desktop ISO** — https://ubuntu.com/download/desktop
- Or **Kali Linux ISO** — https://www.kali.org/get-kali/

---

## 3. VS Code Extensions

Open VS Code → press `Ctrl+Shift+X` → search and install each extension below.

| Extension Name | Publisher | Purpose |
|---|---|---|
| **Python** | Microsoft | Python language support, IntelliSense, debugging |
| **Pylance** | Microsoft | Fast Python type checking and autocomplete |
| **ES7+ React/Redux/React-Native snippets** | dsznajder | React component shortcuts |
| **ESLint** | Microsoft | JavaScript/JSX linting |
| **Prettier - Code formatter** | Prettier | Auto-formats JS, JSX, CSS files |
| **PostgreSQL** | Chris Kolkman | Run SQL queries directly in VS Code |
| **GitLens** | GitKraken | Enhanced Git history and blame |
| **Thunder Client** | Ranga Vadhineni | Test REST API endpoints inside VS Code |
| **DotENV** | mikestead | Syntax highlighting for `.env` files |
| **Auto Rename Tag** | Jun Han | Auto-renames matching HTML/JSX tags |

To install all extensions from the terminal at once:
```
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension dsznajder.es7-react-js-snippets
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ckolkman.vscode-postgres
code --install-extension eamodio.gitlens
code --install-extension rangav.vscode-thunder-client
code --install-extension mikestead.dotenv
code --install-extension formulahendry.auto-rename-tag
```

---

## 4. Project Files Required

After copying or cloning the project, your folder structure should look like this:

```
shadow-it-detection/
├── backend/
│   ├── app.py
│   ├── middleware/
│   │   ├── jwt_auth.py
│   │   └── rbac.py
│   ├── models/
│   │   └── db_models.py
│   └── routes/
│       ├── auth.py
│       ├── detections.py
│       ├── stats.py
│       └── audit.py
├── data/                          ← CICIDS2017 CSV files go here
│   ├── Monday-WorkingHours.pcap_ISCX.csv
│   ├── Tuesday-WorkingHours.pcap_ISCX.csv
│   ├── Wednesday-workingHours.pcap_ISCX.csv
│   ├── Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv
│   ├── Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv
│   ├── Friday-WorkingHours-Morning.pcap_ISCX.csv
│   ├── Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv
│   └── Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv
├── db/
│   ├── schema.sql
│   └── setup.py                   ← One-command DB initialiser
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Detections.jsx
│   │   │   ├── DetectionDetail.jsx
│   │   │   └── AuditLog.jsx
│   │   └── utils/
│   │       ├── api.js
│   │       └── auth.js
│   ├── package.json
│   └── .env                       ← HOST=0.0.0.0 (for VM access)
├── ml/
│   ├── model.py
│   ├── load_cicids.py
│   ├── preprocess.py
│   ├── evaluate.py
│   └── artifacts/                 ← Generated after training
│       ├── isolation_forest.pkl
│       └── scaler.pkl
├── .env                           ← Database and Flask config
├── requirements.txt
└── SETUP_GUIDE.md
```

### CICIDS2017 Dataset

The 8 CSV files are **not included** in the project folder due to their large size (~3 GB). Obtain them from:

- **Official source:** https://www.unb.ca/cic/datasets/ids-2017.html
- Place all 8 files inside the `data/` folder before proceeding to training.

---

## 5. Installation Steps

All commands are run from inside the `shadow-it-detection/` folder unless stated otherwise.

### 5.1 Create and configure the `.env` file

Create a file named `.env` in the `shadow-it-detection/` root with the following content. Replace `YOUR_POSTGRES_PASSWORD` with the password you set during PostgreSQL installation.

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shadow_it_db
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD
JWT_SECRET=shadow-it-umat-2026-super-secret-key
JWT_EXPIRY_HOURS=8
FLASK_ENV=development
FLASK_PORT=5000
```

### 5.2 Install Python dependencies

```
pip install -r requirements.txt
```

This installs:

| Package | Version | Purpose |
|---|---|---|
| Flask | 3.0.0 | Web framework for the REST API |
| Flask-CORS | 4.0.0 | Cross-origin requests from React frontend |
| PyJWT | 2.8.0 | JSON Web Token authentication |
| psycopg[binary] | ≥ 3.1 | PostgreSQL driver (psycopg3) |
| scikit-learn | latest | Isolation Forest ML algorithm |
| pandas | latest | Data loading and manipulation |
| numpy | latest | Numerical operations |
| bcrypt | 4.1.2 | Password hashing |
| python-dotenv | 1.0.0 | Load `.env` configuration |
| joblib | latest | Save and load trained model |
| Werkzeug | 3.0.1 | Flask utilities |

> If `pip` is not recognized, use the full Python path:  
> `C:\path\to\python.exe -m pip install -r requirements.txt`

### 5.3 Install React frontend dependencies

```
cd frontend
npm install
cd ..
```

This installs all packages listed in `frontend/package.json`, including:

| Package | Purpose |
|---|---|
| react 18 | UI framework |
| react-dom | DOM rendering |
| react-router-dom | Client-side routing |
| axios | HTTP requests to Flask API |
| recharts | Charts on the Dashboard |
| react-scripts | Development server and build tools |

---

## 6. Database Setup

### 6.1 Ensure PostgreSQL is running

**Windows:** Open **Services** (`Win+R` → `services.msc`) → find `postgresql-x64-15` (or your version) → Start.

Or from the terminal:
```
net start postgresql-x64-15
```

### 6.2 Run the one-command database initialiser

```
python db/setup.py
```

This script automatically:
1. Connects to PostgreSQL
2. Creates the `shadow_it_db` database (if it does not exist)
3. Creates all tables: `users`, `detections`, `audit_logs`
4. Creates all indexes for fast querying
5. Seeds the two default user accounts

Expected output:
```
Connecting to PostgreSQL at localhost:5432 as 'postgres' …

[1/3] Creating database …
  Database 'shadow_it_db' created.

[2/3] Creating tables …
  Tables and indexes ready.

[3/3] Seeding users …
  User seeded: admin (admin)
  User seeded: viewer (viewer)

Setup complete!
  admin  / admin123
  viewer / viewer123
```

---

## 7. ML Model Training

> Skip this step if you received the project with `ml/artifacts/isolation_forest.pkl` and `ml/artifacts/scaler.pkl` already present. If those files exist, the model is already trained and you can go directly to Step 8.

### 7.1 Verify the dataset files are in place

```
python -c "import os; print([f for f in os.listdir('data') if f.endswith('.csv')])"
```

You should see all 8 CSV filenames listed.

### 7.2 Train the Isolation Forest model

```
python ml/model.py
```

Training loads all 8 CICIDS2017 files (~3.1 million rows), samples up to 30,000 rows per file, cleans and scales the data, then trains the Isolation Forest with:

| Parameter | Value | Meaning |
|---|---|---|
| n_estimators | 200 | Number of isolation trees |
| contamination | 0.27 | Expected anomaly rate (27%, matching dataset) |
| max_samples | 512 | Rows sampled per tree |
| random_state | 42 | Reproducibility |

Expected duration: **3–8 minutes** depending on hardware.

Expected output:
```
  Loaded Monday-WorkingHours.pcap_ISCX.csv: 30,000 rows
  ...
Combined: 210,000+ rows before cleaning
After cleaning: 200,000+ rows
Training Isolation Forest on 200,000 records, 20 features …
Model saved → ml/artifacts/isolation_forest.pkl
```

### 7.3 (Optional) Evaluate the model

```
python ml/evaluate.py
```

Runs 6 test scenarios (2 normal traffic, 4 attack traffic) and prints accuracy, precision, recall, F1 score, and false positive rate.

### 7.4 (Optional) Quick sanity test

```
python ml/test_model.py
```

Should print `PASS` for all 6 test cases.

---

## 8. Running the Application

Open **two separate terminals**, both from inside the `shadow-it-detection/` folder.

### Terminal 1 — Flask Backend (API)

```
python backend/app.py
```

Expected output:
```
 * Running on http://0.0.0.0:5000
 * Debug mode: on
```

Verify it is working:
```
curl http://localhost:5000/api/health
```

Expected response: `{"service":"Shadow IT Detection API","status":"ok"}`

### Terminal 2 — React Frontend (Dashboard)

```
cd frontend
npm start
```

The browser will automatically open `http://localhost:3000`.

> First launch may take 30–60 seconds while webpack compiles.

---

## 9. Accessing from Another Device (VM Network)

This section provides a complete, step-by-step guide for running the Shadow IT Detection demo across a VMware virtual machine network. The host machine runs the Flask backend and React dashboard; the VMs act as simulated corporate workstations.

---

### 9.1 Overview — Network Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  HOST MACHINE (SOC Analyst)              │
│                                                          │
│   Flask API  :5000  ──────────────────────────────┐      │
│   React UI   :3000  ──────────────────────────┐   │      │
│                                               │   │      │
│   VMnet8 (NAT)  IP: 192.168.223.1 ◄───────────┴───┘      │
│   VMnet1 (Host-Only) IP: 192.168.81.1                    │
└──────────────────────┬───────────────────────────────────┘
                       │ VMware virtual network
          ┌────────────┴────────────┐
          │                         │
┌─────────▼──────────┐   ┌─────────▼──────────┐
│  VM 1 — Employee A │   │  VM 2 — Attacker B  │
│  (Normal traffic)  │   │  (Shadow IT / Rogue) │
│  192.168.223.x     │   │  192.168.223.x       │
│  Browser → :3000   │   │  Browser → :3000     │
└────────────────────┘   └─────────────────────┘
```

**Role of each machine:**
- **Host** — Security Operations Centre (SOC): runs the detection engine and dashboard
- **VM 1** — Legitimate employee workstation browsing normal services
- **VM 2** — Rogue device using unauthorized cloud apps, VPNs, or scanning tools

---

### 9.2 Prerequisites

Before starting, confirm the following on the **host machine**:

- [ ] VMware Workstation Player (or Pro) is installed
- [ ] The `frontend/.env` file contains `HOST=0.0.0.0`
- [ ] Flask backend is configured to run on `0.0.0.0:5000` (already set in `backend/app.py`)
- [ ] A guest OS ISO is downloaded (Ubuntu 22.04 recommended — https://ubuntu.com/download/desktop)

---

### 9.3 Step 1 — Verify VMware Virtual Network Adapters

VMware Workstation automatically creates two virtual network adapters on the host when installed:

| Adapter | Type | Default IP on Host | Purpose |
|---|---|---|---|
| VMnet1 | Host-only | 192.168.81.1 | Isolated private network (no internet) |
| VMnet8 | NAT | 192.168.223.1 | VMs share host internet via NAT |

Confirm these adapters exist on your host:

```
ipconfig
```

Look for entries named **VMware Network Adapter VMnet1** and **VMware Network Adapter VMnet8** with their IPv4 addresses. These are the IPs your VMs will use to reach the host.

---

### 9.4 Step 2 — Create a Virtual Machine in VMware

1. Open **VMware Workstation Player**
2. Click **"Create a New Virtual Machine"**
3. Select **"Installer disc image file (iso)"** → Browse to your Ubuntu 22.04 ISO
4. Fill in the Easy Install details:
   - Full name: `Employee-A` (or `Attacker-B` for the second VM)
   - Username: `user`
   - Password: `password123`
5. Click **Next** → Name the VM `ShadowIT-VM1`
6. Set disk size: **20 GB** (Store as a single file)
7. Click **Finish** — VMware will install Ubuntu automatically

> Repeat this process to create a second VM named `ShadowIT-VM2` for the attacker scenario.

**Minimum VM hardware settings** (click "Customize Hardware" before finishing):

| Setting | Value |
|---|---|
| Memory | 2048 MB (2 GB) |
| Processors | 1 |
| Network Adapter | NAT (default) |
| Display | Auto-detect |

---

### 9.5 Step 3 — Configure the VM Network Adapter (NAT Mode)

NAT mode is recommended for this demo. The VMs get internet access and can reach the host machine.

1. In VMware, **right-click the VM → Settings**
2. Click **Network Adapter** in the left panel
3. Under "Network connection", select **NAT: Used to share the host's IP address**
4. Click **OK**

The VM will be assigned an IP like `192.168.223.128` (via VMware's built-in DHCP). Your host machine is reachable from the VM at `192.168.223.1` (the VMnet8 gateway IP).

**To confirm the VM's assigned IP** (run inside the VM after boot):
```bash
ip addr show ens33
```
or
```bash
hostname -I
```

**To confirm the gateway (host) IP** (run inside the VM):
```bash
ip route | grep default
```
The gateway IP shown is your host's VMnet8 address — this is what you will use to access the dashboard.

---

### 9.6 Step 4 — Open Windows Firewall on the Host

The Windows Firewall must allow inbound connections on ports 3000 (React) and 5000 (Flask) from the VMware network.

Open **PowerShell as Administrator** on the host and run:

```powershell
New-NetFirewallRule -DisplayName "Shadow IT Flask API" `
  -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow

New-NetFirewallRule -DisplayName "Shadow IT React UI" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

Verify the rules were created:
```powershell
Get-NetFirewallRule -DisplayName "Shadow IT*" | Select-Object DisplayName, Enabled, Direction
```

Expected output:
```
DisplayName              Enabled  Direction
-----------              -------  ---------
Shadow IT Flask API      True     Inbound
Shadow IT React UI       True     Inbound
```

---

### 9.7 Step 5 — Start the Application on the Host

Open **two terminals** on the host machine from inside `shadow-it-detection/`:

**Terminal 1 — Flask backend:**
```
python backend/app.py
```

Confirm it binds to all interfaces:
```
* Running on http://0.0.0.0:5000
```

**Terminal 2 — React frontend:**
```
cd frontend
npm start
```

The `HOST=0.0.0.0` setting in `frontend/.env` makes the React dev server listen on all network interfaces, not just localhost.

---

### 9.8 Step 6 — Test Connectivity from the VM

Boot the VM and open a terminal inside it. Run the following tests before opening the browser:

**Test 1 — Ping the host:**
```bash
ping 192.168.223.1
```
Expected: replies with low latency (< 1 ms on a VM network)

**Test 2 — Check Flask API is reachable:**
```bash
curl http://192.168.223.1:5000/api/health
```
Expected response:
```json
{"service": "Shadow IT Detection API", "status": "ok"}
```

**Test 3 — Check React frontend is reachable:**
```bash
curl -I http://192.168.223.1:3000
```
Expected: `HTTP/1.1 200 OK`

If Test 1 passes but Tests 2 or 3 fail, the Windows Firewall rule was not applied — re-run Step 4.

---

### 9.9 Step 7 — Access the Dashboard from the VM

Inside the VM, open a web browser (Firefox is pre-installed on Ubuntu):

```
http://192.168.223.1:3000
```

The Shadow IT Detection dashboard will load. You will land directly on the **Dashboard** page showing summary metrics and charts.

> If the IP `192.168.223.1` does not work, check the host's VMnet8 IP with `ipconfig` and use that IP instead.

---

### 9.10 Step 8 — Demo Scenario Walkthrough

Use the following script to demonstrate the system to your examiner.

#### Scene Setup

| Machine | Role | Action |
|---|---|---|
| Host | SOC Analyst | Monitors dashboard, runs detection |
| VM 1 (Employee A) | Authorized user | Browses the dashboard at `:3000` normally |
| VM 2 (Attacker B) | Shadow IT user | Also views the dashboard — represents a rogue device being monitored |

#### Demonstration Steps

**Step 1 — Show network accessibility**
- Open the dashboard URL `http://192.168.223.1:3000` on VM 1's browser
- This proves the system is reachable across the VM network (not just localhost)

**Step 2 — Show the Dashboard page (host)**
- Navigate to the **Dashboard** tab
- Point out: Total Detections, High/Medium/Low risk counts, detection type breakdown chart

**Step 3 — Run a live detection**
- Click the **"Run Detection"** button on the Dashboard
- The system loads 300 rows per file from the 8 CICIDS2017 CSVs, runs the Isolation Forest model, and saves anomalies to the database
- Expected: detection completes in under 5 seconds, anomaly count is displayed

**Step 4 — Review detections**
- Navigate to the **Detections** tab
- Show the table of detected anomalies with: Source IP, Protocol, Risk Level, Shadow IT Type, Anomaly Score
- Click one row → show the **Detection Detail** page with full flow statistics

**Step 5 — Resolve an alert**
- On a detection record, click **"Mark as Resolved"**
- Return to the list — show the record is now marked resolved

**Step 6 — Audit Logs**
- Navigate to the **Audit Logs** tab
- Show the `RUN_DETECTION` event was recorded with timestamp and IP address
- This demonstrates accountability and traceability

**Step 7 — Explain the ML model**
- "The Isolation Forest algorithm was trained on 200,000+ real network flows from the CICIDS2017 dataset"
- "It flags traffic patterns that are statistically isolated from normal behaviour — no labelled attack data is needed during inference"
- "Hardware anomalies represent DoS and scanning attacks; Software anomalies represent web-based attacks; Mixed represents bot or infiltration traffic"

---

### 9.11 VMware Troubleshooting

**VM cannot ping host (192.168.223.1)**
- Confirm the VM's network adapter is set to **NAT** (not Bridged or Host-only)
- In VMware menu: **VM → Settings → Network Adapter → NAT**
- Restart the VM after changing the adapter

**`curl` to port 5000 or 3000 times out**
- The Windows Firewall rule is missing. Re-run Step 4 (Section 9.6)
- Also check: Windows Security → Firewall & network protection → Allow an app through firewall → verify Python and Node.js are allowed

**Dashboard loads but shows no data**
- The React app loaded but the API proxy failed. The React dev server proxies `/api/...` calls back through itself to Flask on port 5000. This is handled server-side so it works even from VM browsers.
- Check that Flask is still running on the host (Terminal 1 should show incoming requests)

**VMnet8 IP is different from 192.168.223.1**
- Run `ipconfig` on the host, find **VMware Network Adapter VMnet8**, and use that IPv4 address
- Update all references to `192.168.223.1` in this guide with the correct IP

**"This site can't be reached" on port 3000**
- The React dev server was started before `frontend/.env` was created
- Stop it (Ctrl+C), then restart: `cd frontend && npm start`
- Confirm the terminal output shows `On Your Network: http://192.168.x.x:3000`

**VM gets IP 192.168.223.x but cannot reach the internet**
- This is expected if the host has no active internet connection
- For the demo, internet access from the VM is not required

---

## 10. Default Credentials

> Authentication is currently bypassed for demonstration purposes. The system automatically logs you in as admin.

| Username | Password | Role | Permissions |
|---|---|---|---|
| admin | admin123 | Admin | Full access: run detection, view all, resolve alerts |
| viewer | viewer123 | Viewer | Read-only: view detections and audit logs |

---

## 11. Project Structure

```
shadow-it-detection/
│
├── backend/                   Flask REST API
│   ├── app.py                 Application entry point, route registration
│   ├── middleware/
│   │   ├── jwt_auth.py        JWT authentication middleware
│   │   └── rbac.py            Role-based access control (admin/viewer)
│   ├── models/
│   │   └── db_models.py       PostgreSQL query helpers (psycopg3)
│   └── routes/
│       ├── auth.py            POST /api/auth/login, /logout
│       ├── detections.py      GET /api/detections, PATCH /:id/resolve
│       ├── stats.py           GET /api/stats (dashboard metrics)
│       └── audit.py           GET /api/audit-logs
│
├── data/                      CICIDS2017 dataset CSV files
│
├── db/
│   ├── schema.sql             Database schema (reference only)
│   └── setup.py               One-command DB initialiser (run this)
│
├── frontend/                  React.js Dashboard
│   ├── public/
│   ├── src/
│   │   ├── App.jsx            Router and layout
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx  Summary metrics and charts
│   │   │   ├── Detections.jsx Detection table with filters
│   │   │   ├── DetectionDetail.jsx Individual detection record
│   │   │   └── AuditLog.jsx   Admin action history
│   │   └── utils/
│   │       ├── api.js         Axios HTTP client (proxies to Flask)
│   │       └── auth.js        Auth state helpers
│   ├── package.json
│   └── .env                   HOST=0.0.0.0 (enables VM access)
│
├── ml/                        Machine Learning pipeline
│   ├── load_cicids.py         CICIDS2017 data loader
│   ├── preprocess.py          Feature cleaning and MinMax scaling
│   ├── model.py               Isolation Forest: train() and detect()
│   ├── evaluate.py            Accuracy, Precision, Recall, F1 metrics
│   ├── test_model.py          Quick 6-scenario pass/fail test
│   └── artifacts/             Generated model files (after training)
│       ├── isolation_forest.pkl
│       └── scaler.pkl
│
├── .env                       Environment config (DB, JWT, Flask)
├── requirements.txt           Python dependencies
└── SETUP_GUIDE.md             This document
```

### API Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login and receive JWT token |
| POST | `/api/auth/logout` | Any | Logout |
| GET | `/api/stats` | Any | Dashboard metrics summary |
| GET | `/api/detections` | Any | Paginated detection list |
| GET | `/api/detections/:id` | Any | Single detection detail |
| PATCH | `/api/detections/:id/resolve` | Admin | Mark detection as resolved |
| GET | `/api/audit-logs` | Admin | Audit event history |
| POST | `/api/run-detection` | Admin | Run Isolation Forest on dataset |
| GET | `/api/health` | Public | Health check |

---

## 12. Troubleshooting

### "pip is not recognized"
Python is not in your PATH. Use the full Python executable path:
```
C:\path\to\python.exe -m pip install -r requirements.txt
```

### "Failed to build psycopg2-binary" or "Microsoft Visual C++ required"
Do not use `psycopg2`. This project uses `psycopg[binary]` (psycopg3). Verify `requirements.txt` contains `psycopg[binary]>=3.1` and not `psycopg2-binary`.

### "No module named 'psycopg'" or "No module named 'flask'"
Packages are installed in a different Python environment. Make sure you run `pip install` and `python backend/app.py` using the same Python executable.

### "fe_sendauth: no password supplied" or "password authentication failed"
The `.env` file is missing or has an incorrect `DB_PASSWORD`. Ensure the `.env` file is in the `shadow-it-detection/` root and `DB_PASSWORD` matches your PostgreSQL password.

### "FATAL: database shadow_it_db does not exist"
The database has not been created. Run:
```
python db/setup.py
```

### "Connection refused" on port 5432
PostgreSQL is not running. Start it:
- **Windows:** `net start postgresql-x64-15`
- **Linux:** `sudo systemctl start postgresql`

### React shows blank page or network errors
Ensure the Flask backend is running on port 5000 before starting the React frontend. The React dev server proxies API calls to `http://localhost:5000`.

### "Run Detection" button returns error about dataset not found
Place all 8 CICIDS2017 CSV files in the `data/` folder. The filenames must match exactly as listed in Section 4.

### Cannot access dashboard from VM
1. Confirm `frontend/.env` contains `HOST=0.0.0.0`
2. Restart the React dev server after adding that file
3. Add Windows Firewall rules for ports 3000 and 5000 (Section 9.3)
4. Check the VM's network adapter is set to Host-only or NAT

### Model artifacts missing (isolation_forest.pkl not found)
The model has not been trained. Run:
```
python ml/model.py
```
Ensure the CICIDS2017 CSV files are in `data/` first.

---

*Last updated: June 2026*  
*University of Mines and Technology, Tarkwa, Ghana*  
*BSc Cybersecurity — Final Year Project*
