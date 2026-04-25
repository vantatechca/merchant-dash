# """Async SQLAlchemy engine + session factory."""

# import os
# from pathlib import Path
# from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# from dotenv import load_dotenv

# # Load .env from project root (two levels up from backend/app/)
# load_dotenv(Path(__file__).parent.parent.parent / ".env")

# from sqlalchemy import text
# from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# from .models import Base

# DATABASE_URL = os.getenv(
#     "DATABASE_URL",
#     "postgresql+asyncpg://user:pass@localhost:5432/gmc_dashboard",
# )

# # --- Normalize the URL so asyncpg is happy ----------------------------------
# # asyncpg chokes on Neon's extra query params (sslmode, channel_binding, etc.)
# # We strip them here and pass SSL via connect_args.

# if DATABASE_URL.startswith("postgres://"):
#     DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
# elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
#     DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# _parsed = urlparse(DATABASE_URL)
# _qs = parse_qs(_parsed.query)

# # Determine if we need SSL based on original query params or host
# _needs_ssl = (
#     "sslmode" in _qs
#     or "channel_binding" in _qs
#     or "neon.tech" in (_parsed.hostname or "")
#     or "aws" in (_parsed.hostname or "")
#     or "supabase" in (_parsed.hostname or "")
# )

# # Strip params asyncpg doesn't accept
# for _bad in ("sslmode", "channel_binding", "application_name", "options"):
#     _qs.pop(_bad, None)

# DATABASE_URL = urlunparse(_parsed._replace(query=urlencode(_qs, doseq=True)))

# _connect_args = {"ssl": True} if _needs_ssl else {}

# # ----------------------------------------------------------------------------

# engine = create_async_engine(
#     DATABASE_URL,
#     echo=False,
#     pool_pre_ping=True,
#     connect_args=_connect_args,
# )
# SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# # ----------------------------------------------------------------------------
# # Idempotent schema migrations
# # ----------------------------------------------------------------------------
# # Runs after create_all() on every startup. Each statement uses IF NOT EXISTS
# # so it's safe to run repeatedly. Add new migrations at the end — never edit
# # or reorder existing ones.
# # ----------------------------------------------------------------------------

# _MIGRATIONS = [
#     # --- 2026-04: single-admin-token model -----------------------------------
#     # One OAuthToken row may be marked is_admin=True (the shared admin).
#     """
#     ALTER TABLE oauth_tokens
#       ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
#     """,
#     # Enforce only-one-admin at the DB level (partial unique index).
#     """
#     CREATE UNIQUE INDEX IF NOT EXISTS uniq_oauth_admin
#       ON oauth_tokens (is_admin)
#       WHERE is_admin = TRUE
#     """,
#     # Route each monitored account to admin token or legacy per-user token.
#     """
#     ALTER TABLE merchant_accounts
#       ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'direct'
#     """,
#     # Can't use CHECK IF NOT EXISTS portably; drop-then-add keeps it idempotent.
#     """
#     DO $$ BEGIN
#       IF NOT EXISTS (
#         SELECT 1 FROM pg_constraint WHERE conname = 'merchant_accounts_via_check'
#       ) THEN
#         ALTER TABLE merchant_accounts
#           ADD CONSTRAINT merchant_accounts_via_check
#           CHECK (via IN ('direct', 'admin'));
#       END IF;
#     END $$
#     """,
#     # Last time accounts.list confirmed the admin token can see this store.
#     """
#     ALTER TABLE merchant_accounts
#       ADD COLUMN IF NOT EXISTS last_seen_accessible TIMESTAMPTZ
#     """,
#     # When GCP was registered (Merchant API v1 one-time per-account requirement).
#     """
#     ALTER TABLE merchant_accounts
#       ADD COLUMN IF NOT EXISTS gcp_registered_at TIMESTAMPTZ
#     """,
#     # Speeds up the audit diff query.
#     """
#     CREATE INDEX IF NOT EXISTS idx_merchant_accounts_via
#       ON merchant_accounts (via)
#     """,
# ]


# async def _run_migrations(conn) -> None:
#     """Execute each migration statement. Each is idempotent on its own."""
#     for stmt in _MIGRATIONS:
#         await conn.execute(text(stmt))


# async def init_db():
#     async with engine.begin() as conn:
#         await conn.run_sync(Base.metadata.create_all)
#         await _run_migrations(conn)


# async def get_session():
#     async with SessionLocal() as session:
#         yield session




"""Async SQLAlchemy engine + session factory."""

import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from dotenv import load_dotenv

# Load .env from project root (two levels up from backend/app/)
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://user:pass@localhost:5432/gmc_dashboard",
)

# --- Normalize the URL so asyncpg is happy ----------------------------------
# asyncpg chokes on Neon's extra query params (sslmode, channel_binding, etc.)
# We strip them here and pass SSL via connect_args.

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

_parsed = urlparse(DATABASE_URL)
_qs = parse_qs(_parsed.query)

# Determine if we need SSL based on original query params or host
_needs_ssl = (
    "sslmode" in _qs
    or "channel_binding" in _qs
    or "neon.tech" in (_parsed.hostname or "")
    or "aws" in (_parsed.hostname or "")
    or "supabase" in (_parsed.hostname or "")
)

# Strip params asyncpg doesn't accept
for _bad in ("sslmode", "channel_binding", "application_name", "options"):
    _qs.pop(_bad, None)

DATABASE_URL = urlunparse(_parsed._replace(query=urlencode(_qs, doseq=True)))

_connect_args = {"ssl": True} if _needs_ssl else {}

# ----------------------------------------------------------------------------

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=_connect_args,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# ----------------------------------------------------------------------------
# Idempotent schema migrations
# ----------------------------------------------------------------------------
# Runs after create_all() on every startup. Each statement uses IF NOT EXISTS
# so it's safe to run repeatedly. Add new migrations at the end — never edit
# or reorder existing ones.
# ----------------------------------------------------------------------------

_MIGRATIONS = [
    # --- 2026-04: single-admin-token model -----------------------------------
    # One OAuthToken row may be marked is_admin=True (the shared admin).
    """
    ALTER TABLE oauth_tokens
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
    """,
    # Enforce only-one-admin at the DB level (partial unique index).
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_oauth_admin
      ON oauth_tokens (is_admin)
      WHERE is_admin = TRUE
    """,
    # Route each monitored account to admin token or legacy per-user token.
    """
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'direct'
    """,
    # Can't use CHECK IF NOT EXISTS portably; drop-then-add keeps it idempotent.
    """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'merchant_accounts_via_check'
      ) THEN
        ALTER TABLE merchant_accounts
          ADD CONSTRAINT merchant_accounts_via_check
          CHECK (via IN ('direct', 'admin'));
      END IF;
    END $$
    """,
    # Last time accounts.list confirmed the admin token can see this store.
    """
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS last_seen_accessible TIMESTAMPTZ
    """,
    # When GCP was registered (Merchant API v1 one-time per-account requirement).
    """
    ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS gcp_registered_at TIMESTAMPTZ
    """,
    # Speeds up the audit diff query.
    """
    CREATE INDEX IF NOT EXISTS idx_merchant_accounts_via
      ON merchant_accounts (via)
    """,
]


async def _run_migrations(conn) -> None:
    """Execute each migration statement. Each is idempotent on its own."""
    for stmt in _MIGRATIONS:
        await conn.execute(text(stmt))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_migrations(conn)


async def get_session():
    async with SessionLocal() as session:
        yield session