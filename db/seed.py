"""
Seed the database with default admin and viewer accounts.
Run from shadow-it-detection/ : python db/seed.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
import psycopg
from dotenv import load_dotenv

load_dotenv()

USERS = [
    {"username": "admin",  "password": "admin123",  "role": "admin"},
    {"username": "viewer", "password": "viewer123", "role": "viewer"},
]

def seed():
    conn = psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", 5432),
        dbname=os.getenv("DB_NAME", "shadow_it_db"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )
    try:
        with conn.cursor() as cur:
            for user in USERS:
                pw_hash = bcrypt.hashpw(
                    user["password"].encode("utf-8"), bcrypt.gensalt()
                ).decode("utf-8")
                cur.execute(
                    """INSERT INTO users (username, password_hash, role)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (username) DO UPDATE
                       SET password_hash = EXCLUDED.password_hash,
                           role = EXCLUDED.role""",
                    (user["username"], pw_hash, user["role"]),
                )
                print(f"  Seeded user: {user['username']} ({user['role']})")
        conn.commit()
        print("Seed complete.")
    finally:
        conn.close()

if __name__ == "__main__":
    seed()
