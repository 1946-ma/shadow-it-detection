"""
Diagnostic script — run to find out exactly why login fails.
Run from shadow-it-detection/ : python db/diagnose.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import bcrypt

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "shadow_it_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASSWORD", "")

sep = "=" * 60
print(sep)
print("  SHADOW IT — LOGIN DIAGNOSTIC")
print(sep)

# 1. .env
print("\n[1] .env settings")
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(env_path):
    print(f"  .env found      : {env_path}")
else:
    print(f"  WARNING: .env NOT found at {env_path}")
    print("  Run:  copy .env.example .env  then set DB_PASSWORD and JWT_SECRET")
print(f"  DB_HOST         : {DB_HOST}")
print(f"  DB_PORT         : {DB_PORT}")
print(f"  DB_NAME         : {DB_NAME}")
print(f"  DB_USER         : {DB_USER}")
print(f"  DB_PASSWORD set : {'YES' if DB_PASS else 'NO  ← likely cause of failure'}")

# 2. psycopg import
print("\n[2] Checking psycopg …")
try:
    import psycopg
    from psycopg.rows import dict_row
    print("  psycopg (v3) OK")
except ImportError:
    print("  ERROR: psycopg not installed.")
    print("  Run: python -m pip install -r requirements.txt")
    sys.exit(1)

# 3. DB connection
print(f"\n[3] Connecting to '{DB_NAME}' …")
try:
    conn = psycopg.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS,
    )
    print("  Connection OK")
except psycopg.OperationalError as e:
    print(f"  ERROR: {e}")
    print("\n  Fix options:")
    print("  a) Make sure PostgreSQL is running")
    print("  b) Check DB_PASSWORD in .env matches your PostgreSQL password")
    print("  c) Run 'python db/setup.py' to create the database first")
    sys.exit(1)

# 4. Tables
print("\n[4] Checking tables …")
with conn.cursor() as cur:
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name
    """)
    tables = [r[0] for r in cur.fetchall()]

for t in ["users", "detections", "audit_logs"]:
    print(f"  {t:<20} {'OK' if t in tables else 'MISSING'}")

if "users" not in tables:
    print("\n  Table 'users' missing. Run: python db/setup.py")
    conn.close(); sys.exit(1)

# 5. User rows
print("\n[5] Users in database …")
with conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT id, username, role, LEFT(password_hash, 20) AS preview FROM users ORDER BY id")
    rows = cur.fetchall()

if not rows:
    print("  NO USERS FOUND — this is why login fails!")
    print("  Run: python db/setup.py")
    conn.close(); sys.exit(1)

for r in rows:
    print(f"  id={r['id']}  username={r['username']:<10}  role={r['role']}  hash={r['preview']}…")

# 6. bcrypt check
print("\n[6] bcrypt verification for admin/admin123 …")
with conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT password_hash FROM users WHERE username = 'admin'")
    row = cur.fetchone()

if not row:
    print("  'admin' user not found — run python db/setup.py")
else:
    h = row["password_hash"]
    ok = bcrypt.checkpw(b"admin123", h.encode("utf-8"))
    print(f"  checkpw('admin123') → {'PASS ✓' if ok else 'FAIL ✗  hash mismatch — run python db/setup.py'}")

conn.close()

# 7. Flask backend
print("\n[7] Flask backend execute() …")
try:
    from backend.models.db_models import execute
    u = execute("SELECT id, username, role FROM users WHERE username = 'admin'", fetch="one")
    if u:
        print(f"  execute() OK → admin found (role={u['role']})")
    else:
        print("  execute() OK but admin not found")
except Exception as e:
    print(f"  ERROR: {e}")

print()
print(sep)
print("  Done. Paste this output if you need further help.")
print(sep)
