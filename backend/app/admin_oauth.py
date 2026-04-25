"""
admin_oauth.py
--------------
Admin-token routes. Mount under /oauth/admin via include_router in main.py.

Routes:
  GET  /oauth/admin/status                  — is admin connected?
  POST /oauth/admin/promote/{email}         — flip is_admin on an OAuthToken row
  GET  /oauth/admin/accessible              — MC accounts the admin token can see
  GET  /oauth/admin/audit                   — diff DB vs accessible
  POST /oauth/admin/connect                 — add a store to monitoring as admin-backed
  POST /oauth/admin/register-gcp-all        — bulk GCP registration
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session, SessionLocal
from .google_auth import (
    admin_credentials_marker,
    get_admin_access_token,
    get_admin_token_row,
    invalidate_accessible_cache,
    list_accessible_accounts,
    register_gcp_for_account,
)
from .models import MerchantAccount
from .oauth import OAuthToken

router = APIRouter(prefix="/oauth/admin", tags=["admin-oauth"])


class ConnectBody(BaseModel):
    account_id: str
    display_name: str | None = None


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
@router.get("/status")
async def admin_status():
    row = await get_admin_token_row()
    if not row:
        return {"connected": False, "email": None}
    return {
        "connected": True,
        "email":     row.email,
    }


# ---------------------------------------------------------------------------
# Promote — flip is_admin on an existing OAuthToken row
# ---------------------------------------------------------------------------
@router.post("/promote/{email}")
async def promote_to_admin(email: str, session: AsyncSession = Depends(get_session)):
    tok = (await session.execute(
        select(OAuthToken).where(OAuthToken.email == email)
    )).scalar_one_or_none()
    if not tok:
        raise HTTPException(404, f"No OAuth token for {email}. Sign in first.")

    await session.execute(
        update(OAuthToken).where(OAuthToken.is_admin.is_(True)).values(is_admin=False)
    )
    await session.execute(
        update(OAuthToken).where(OAuthToken.email == email).values(is_admin=True)
    )
    await session.commit()
    invalidate_accessible_cache()
    return {"ok": True, "admin_email": email}


# ---------------------------------------------------------------------------
# Accessible accounts (uses admin token)
# ---------------------------------------------------------------------------
@router.get("/accessible")
async def accessible_accounts(refresh: int = 0):
    try:
        return await list_accessible_accounts(bypass_cache=bool(refresh))
    except RuntimeError as e:
        raise HTTPException(500, str(e))


# ---------------------------------------------------------------------------
# Audit — diff DB vs accessible
# ---------------------------------------------------------------------------
@router.get("/audit")
async def admin_audit(session: AsyncSession = Depends(get_session)):
    accessible = await list_accessible_accounts()
    accessible_ids = {str(a["account_id"]) for a in accessible}

    rows = (await session.execute(select(MerchantAccount))).scalars().all()
    stored_ids = {str(r.account_id) for r in rows}

    def is_admin_backed(row) -> bool:
        creds = row.credentials_json or {}
        return bool(creds.get("_admin"))

    return {
        "accessible_and_monitored": [
            {
                "account_id":   r.account_id,
                "display_name": r.display_name,
                "admin_backed": is_admin_backed(r),
            }
            for r in rows if str(r.account_id) in accessible_ids
        ],
        "accessible_but_not_in_db": [
            a for a in accessible if str(a["account_id"]) not in stored_ids
        ],
        "in_db_but_not_accessible": [
            {"account_id": r.account_id, "display_name": r.display_name}
            for r in rows
            if str(r.account_id) not in accessible_ids and is_admin_backed(r)
        ],
    }


# ---------------------------------------------------------------------------
# Connect a store via admin token — writes _admin marker into credentials_json
# ---------------------------------------------------------------------------
@router.post("/connect", status_code=201)
async def connect_admin(body: ConnectBody, session: AsyncSession = Depends(get_session)):
    admin = await get_admin_token_row()
    if not admin:
        raise HTTPException(400, "Admin account not connected. Promote a user first.")

    # Guard: admin must actually see this account
    accessible = await list_accessible_accounts()
    hit = next(
        (a for a in accessible if str(a["account_id"]) == str(body.account_id)),
        None,
    )
    if not hit:
        raise HTTPException(
            403,
            "Admin token cannot access this account. Confirm the admin email "
            "was added in 'People and access' (NOT the email-only section).",
        )

    # One-time GCP registration for Merchant API v1
    token = await get_admin_access_token()
    reg = register_gcp_for_account(token, str(body.account_id), developer_email=admin.email)

    # Write the row. We use the same MerchantAccount.upsert pattern your main.py
    # uses elsewhere — adjust the call to match your existing helper signature.
    account = await MerchantAccount.upsert(
        session,
        account_id=str(body.account_id),
        display_name=body.display_name or hit.get("account_name") or f"Merchant {body.account_id}",
        credentials_json=admin_credentials_marker(),
    )
    return {**account, "verified": True, "gcp": reg}


# ---------------------------------------------------------------------------
# Bulk GCP registration for every accessible store
# ---------------------------------------------------------------------------
@router.post("/register-gcp-all")
async def register_gcp_all():
    token = await get_admin_access_token()
    accessible = await list_accessible_accounts()
    admin = await get_admin_token_row()
    dev_email = admin.email if admin else None

    results = []
    for acc in accessible:
        outcome = register_gcp_for_account(token, str(acc["account_id"]), dev_email)
        results.append({
            "account_id": acc["account_id"],
            "status":     outcome["status"],
            "already":    outcome.get("already", False),
        })
    return {"count": len(results), "results": results}