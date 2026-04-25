"""
google_auth.py
--------------
Admin-token management + client factory. Sits on top of gmc_oauth.py.

Key functions:
  get_admin_token_row()         — async: the is_admin=True OAuthToken row
  get_admin_access_token()      — async: fresh bearer token for admin
  list_accessible_accounts()    — async: cached discovery via Content API authinfo
  build_admin_client()          — async: GMCClient pre-loaded with a fresh admin token
  admin_credentials_marker()    — the dict to write into credentials_json for admin rows
"""

from __future__ import annotations

import time
from typing import Optional

from sqlalchemy import select

from .db import SessionLocal
from .gmc_client import GMCClient
from .gmc_oauth import (
    _access_token,
    _register_gcp,
    list_accessible_with_token,
    make_gmc_client_from_token_callable,
)
from .oauth import OAuthToken

SCOPES = ["https://www.googleapis.com/auth/content"]

# In-process cache for accessible accounts (5 min TTL)
_accessible_cache: dict = {"data": None, "fetched_at": 0.0, "ttl": 300.0}


# ---------------------------------------------------------------------------
# Admin OAuth token
# ---------------------------------------------------------------------------

async def get_admin_token_row() -> Optional[OAuthToken]:
    async with SessionLocal() as session:
        return (await session.execute(
            select(OAuthToken).where(OAuthToken.is_admin.is_(True))
        )).scalar_one_or_none()


async def get_admin_access_token() -> str:
    row = await get_admin_token_row()
    if not row:
        raise RuntimeError("Admin account not connected")
    # _access_token is sync — google-auth does the HTTP call in-thread.
    # Cheap enough that we don't need to push to a thread pool.
    return _access_token(row.refresh_token, row.client_id, row.client_secret)


# ---------------------------------------------------------------------------
# Accessible accounts discovery
# ---------------------------------------------------------------------------

async def list_accessible_accounts(bypass_cache: bool = False) -> list[dict]:
    now = time.time()
    if (not bypass_cache
            and _accessible_cache["data"] is not None
            and (now - _accessible_cache["fetched_at"]) < _accessible_cache["ttl"]):
        return _accessible_cache["data"]

    token = await get_admin_access_token()
    data = list_accessible_with_token(token)
    _accessible_cache["data"] = data
    _accessible_cache["fetched_at"] = now
    return data


def invalidate_accessible_cache() -> None:
    _accessible_cache["data"] = None
    _accessible_cache["fetched_at"] = 0.0


# ---------------------------------------------------------------------------
# Client factory — returns a GMCClient pre-loaded with a fresh admin token
# ---------------------------------------------------------------------------
# We pre-fetch the token here (async-safe) and hand the sync GMCClient a
# closure that just returns it. Avoids the run_coroutine_threadsafe deadlock
# that happens when GMCClient tries to fetch a token from inside an async
# request handler.
#
# Trade-off: the token is captured when the client is built, so if a single
# client instance is used for longer than ~55 minutes (Google's token TTL),
# it'll get a 401. Build a fresh client per request and you're fine.

async def build_admin_client() -> GMCClient:
    token = await get_admin_access_token()
    return make_gmc_client_from_token_callable(lambda: token)


def admin_credentials_marker() -> dict:
    """Dict to store in MerchantAccount.credentials_json for admin-backed rows."""
    return {"_oauth": True, "_admin": True}


# ---------------------------------------------------------------------------
# GCP registration wrapper
# ---------------------------------------------------------------------------

def register_gcp_for_account(
    access_token: str,
    account_id: str,
    developer_email: Optional[str] = None,
) -> dict:
    """Idempotent GCP registration. Returns {status, already}."""
    try:
        _register_gcp(access_token, str(account_id), developer_email)
        return {"status": 200, "already": False}
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg:
            return {"status": 409, "already": True}
        raise