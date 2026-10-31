"""
database.py
-----------
Production-grade SQLAlchemy database engine configuration.
Supports Supabase (PostgreSQL) and falls back to SQLite for local development.

To connect to Supabase:
  Set the DATABASE_URL environment variable in backend/.env:
  DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
  (or use the connection pooler URL from Supabase Settings -> Database)
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Load .env if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

# ── Database URL Resolution ──────────────────────────────────────────────────
raw_database_url = os.environ.get("DATABASE_URL", "").strip()

if raw_database_url:
    # Supabase / cloud providers use `postgres://` or `postgresql://` without driver tag
    if raw_database_url.startswith("postgres://"):
        DATABASE_URL = raw_database_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif raw_database_url.startswith("postgresql://"):
        DATABASE_URL = raw_database_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    else:
        DATABASE_URL = raw_database_url

    # Ensure sslmode=require for Supabase cloud hosts if missing
    if "supabase.co" in DATABASE_URL and "sslmode" not in DATABASE_URL:
        delimiter = "&" if "?" in DATABASE_URL else "?"
        DATABASE_URL = f"{DATABASE_URL}{delimiter}sslmode=require"
else:
    # Default fallback to local SQLite database
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'cyber_incident.db')}"

# ── Engine Configuration ─────────────────────────────────────────────────────
is_sqlite = DATABASE_URL.startswith("sqlite")

if is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    # PostgreSQL / Supabase configuration with pooling & health ping
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,      # Tests connection liveness before usage
        pool_size=10,            # Maintained active connections
        max_overflow=15,         # Burst allowance under concurrent requests
        pool_timeout=30,         # Seconds to wait before giving up on getting a connection
        pool_recycle=300,        # Recycle connections every 5 mins to prevent drops
        echo=False,
    )

# ── Session Factory ───────────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ── Declarative Base ──────────────────────────────────────────────────────────
Base = declarative_base()


# ── Dependency Injection Helper ───────────────────────────────────────────────
def get_db():
    """
    FastAPI dependency that yields a database session per request.
    Guarantees session cleanup upon completion or exception.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
