"""
One-command database initialiser.
Run from shadow-it-detection/ : python db/setup.py

Does everything in order:
  1. Creates the shadow_it_db database if it does not exist
  2. Creates all tables and indexes
  3. Seeds admin/admin123 and viewer/viewer123
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
import psycopg
from psycopg import sql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST",     "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME",     "shadow_it_db")
DB_USER = os.getenv("DB_USER",     "postgres")
DB_PASS = os.getenv("DB_PASSWORD", "")

USERS = [
    {"username": "admin",  "password": "admin123",  "role": "admin"},
    {"username": "viewer", "password": "viewer123", "role": "viewer"},
]

DDL = """
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'viewer',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
    id             SERIAL PRIMARY KEY,
    src_ip         VARCHAR(45)  NOT NULL,
    src_mac        VARCHAR(17),
    dst_domain     VARCHAR(255),
    protocol       VARCHAR(10),
    bytes_sent     BIGINT,
    bytes_received BIGINT,
    duration       FLOAT,
    device_type    VARCHAR(50),
    shadow_it_type VARCHAR(20),
    risk_level     VARCHAR(10),
    anomaly_score  FLOAT,
    detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_resolved    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     VARCHAR(100) NOT NULL,
    target     TEXT,
    timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_det_at   ON detections(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_det_risk ON detections(risk_level);
CREATE INDEX IF NOT EXISTS idx_det_type ON detections(shadow_it_type);
CREATE INDEX IF NOT EXISTS idx_det_res  ON detections(is_resolved);
CREATE INDEX IF NOT EXISTS idx_aud_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_aud_ts   ON audit_logs(timestamp DESC);
"""


def _connect(dbname, autocommit=False):
    return psycopg.connect(
        host=DB_HOST, port=DB_PORT, dbname=dbname,
        user=DB_USER, password=DB_PASS,
        autocommit=autocommit,
    )


def create_database():
    conn = _connect("postgres", autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
            if cur.fetchone():
                print(f"  Database '{DB_NAME}' already exists — skipping create.")
            else:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(DB_NAME)))
                print(f"  Database '{DB_NAME}' created.")
    finally:
        conn.close()


def create_tables():
    conn = _connect(DB_NAME)
    try:
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
        print("  Tables and indexes ready.")
    finally:
        conn.close()


def seed_users():
    conn = _connect(DB_NAME)
    try:
        with conn.cursor() as cur:
            for u in USERS:
                pw_hash = bcrypt.hashpw(
                    u["password"].encode("utf-8"), bcrypt.gensalt()
                ).decode("utf-8")
                cur.execute(
                    """INSERT INTO users (username, password_hash, role)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (username) DO UPDATE
                         SET password_hash = EXCLUDED.password_hash,
                             role          = EXCLUDED.role""",
                    (u["username"], pw_hash, u["role"]),
                )
                print(f"  User seeded: {u['username']} ({u['role']})")
        conn.commit()
    finally:
        conn.close()


def setup():
    print(f"\nConnecting to PostgreSQL at {DB_HOST}:{DB_PORT} as '{DB_USER}' …")
    print("\n[1/3] Creating database …")
    create_database()

    print("\n[2/3] Creating tables …")
    create_tables()

    print("\n[3/3] Seeding users …")
    seed_users()

    print("\nSetup complete!")
    print("  admin  / admin123")
    print("  viewer / viewer123")


if __name__ == "__main__":
    try:
        setup()
    except psycopg.OperationalError as e:
        print(f"\nERROR: Could not connect to PostgreSQL.\n{e}")
        print("\nCheck that:")
        print("  1. PostgreSQL is running")
        print("  2. DB_PASSWORD in your .env matches your PostgreSQL password")
        print("  3. DB_HOST / DB_PORT are correct")
        sys.exit(1)
