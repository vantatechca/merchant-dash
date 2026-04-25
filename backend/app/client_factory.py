"""
Canonical auth router for MerchantAccount rows.

Two entry points:
  build_client_for(acct)   — async. USE THIS from FastAPI route handlers and
                             anywhere else that runs inside an event loop.
                             Safely handles the admin-token path (which needs
                             to hit the DB asynchronously to fetch the token).

  _client_for(acct)        — sync. For use from Celery tasks and other sync
                             contexts. NOT safe for admin-backed rows when
                             called from inside a running event loop.
"""

from __future__ import annotations

import asyncio

from .gmc_client import GMCClient
from .gmc_oauth import make_gmc_client_from_oauth
from .models import MerchantAccount


async def build_client_for(acct: MerchantAccount) -> GMCClient:
    """
    Async entry point. Route the account to the right GMCClient, fetching
    the admin token asynchronously when needed so we don't deadlock.
    """
    creds = acct.credentials_json or {}

    # Admin-backed row → pre-fetch a fresh admin token and return a client
    # configured with it. Import inline to avoid circular imports.
    if creds.get("_admin"):
        from .google_auth import build_admin_client
        return await build_admin_client()

    # Per-user OAuth (legacy, direct) — sync refresh is safe, google-auth
    # does it in-thread and is fast.
    if creds.get("_oauth"):
        return make_gmc_client_from_oauth(
            refresh_token=creds["refresh_token"],
            client_id=creds["client_id"],
            client_secret=creds["client_secret"],
        )

    # Service account — sync, safe.
    return GMCClient(creds)


def _client_for(acct: MerchantAccount) -> GMCClient:
    """
    Sync entry point. Safe from sync contexts (Celery tasks, CLI tools).
    For admin-backed rows, it calls asyncio.run() which requires NO running
    event loop — fine in Celery workers, NOT fine inside FastAPI handlers.
    """
    creds = acct.credentials_json or {}

    if creds.get("_admin"):
        from .google_auth import build_admin_client
        # asyncio.run fails if a loop is already running — that's the signal
        # that this code was called from the wrong context.
        try:
            asyncio.get_running_loop()
            raise RuntimeError(
                "_client_for() called on an admin-backed row from inside a "
                "running event loop. Use `await build_client_for(acct)` instead."
            )
        except RuntimeError as e:
            if "already running" in str(e):
                raise
            # No loop running — we're in a sync context (Celery, script). Good.
        return asyncio.run(build_admin_client())

    if creds.get("_oauth"):
        return make_gmc_client_from_oauth(
            refresh_token=creds["refresh_token"],
            client_id=creds["client_id"],
            client_secret=creds["client_secret"],
        )

    return GMCClient(creds)