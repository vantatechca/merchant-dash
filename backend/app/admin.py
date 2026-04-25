"""Admin utilities: register the GCP project with each MC account."""

from __future__ import annotations

import requests
from fastapi import APIRouter, HTTPException
from google.auth.transport.requests import Request as GRequest
from google.oauth2.credentials import Credentials
from sqlalchemy import select

from .db import SessionLocal
from .models import MerchantAccount
from .oauth import OAuthToken

router = APIRouter(prefix="/admin", tags=["admin"])


def _fresh_token(refresh_token, client_id, client_secret):
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=["https://www.googleapis.com/auth/content"],
    )
    creds.refresh(GRequest())
    return creds.token


@router.post("/register-gcp/{email}/{account_id}")
async def register_gcp(email: str, account_id: str):
    """
    Register the GCP project (from the OAuth client) with a specific MC account.
    One-time per MC account.
    """
    async with SessionLocal() as session:
        tok = (await session.execute(
            select(OAuthToken).where(OAuthToken.email == email)
        )).scalar_one_or_none()
    if not tok:
        raise HTTPException(404, "Not signed in")

    token = _fresh_token(tok.refresh_token, tok.client_id, tok.client_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Try every known registration endpoint
    results = []

    def try_call(label, method, url, body=None):
        try:
            r = requests.request(method, url, headers=headers, json=body, timeout=30)
            results.append({
                "step": label, "method": method, "url": url,
                "status": r.status_code, "body": r.text[:1500],
            })
            return r
        except Exception as e:
            results.append({"step": label, "error": str(e)})
            return None

    # Endpoint A — developerRegistration.registerGcp (the new path)
    try_call(
        "developerRegistration.registerGcp (v1)",
        "POST",
        f"https://merchantapi.googleapis.com/accounts/v1/accounts/{account_id}/developerRegistration:registerGcp",
        body={},
    )

    # Endpoint B — get developerRegistration (to see current state)
    try_call(
        "get developerRegistration (v1)",
        "GET",
        f"https://merchantapi.googleapis.com/accounts/v1/accounts/{account_id}/developerRegistration",
    )

    # Endpoint C — retry original failing call
    try_call(
        "list accounts (v1) post-registration",
        "GET",
        "https://merchantapi.googleapis.com/accounts/v1/accounts",
    )

    # Endpoint D — direct account read
    try_call(
        "direct account read (v1)",
        "GET",
        f"https://merchantapi.googleapis.com/accounts/v1/accounts/{account_id}",
    )

    return {"email": email, "account_id": account_id, "results": results}


@router.post("/register-all/{email}")
async def register_all(email: str):
    """Register GCP against every MC account the user has access to."""
    async with SessionLocal() as session:
        tok = (await session.execute(
            select(OAuthToken).where(OAuthToken.email == email)
        )).scalar_one_or_none()
    if not tok:
        raise HTTPException(404, "Not signed in")

    token = _fresh_token(tok.refresh_token, tok.client_id, tok.client_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # First get the user's MC accounts via v1 (will fail with hint on what to do)
    r = requests.get(
        "https://merchantapi.googleapis.com/accounts/v1/accounts",
        headers=headers, timeout=30,
    )
    return {
        "email": email,
        "list_status": r.status_code,
        "list_body": r.text[:2000],
    }