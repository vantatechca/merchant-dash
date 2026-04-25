# """
# OAuth 2.0 flow for connecting Google accounts to the dashboard.
# User clicks "Sign in with Google" → consents → we store their refresh token.
# """

# from __future__ import annotations

# import os
# import secrets
# from datetime import datetime, timedelta
# from pathlib import Path
# from typing import Optional
# from urllib.parse import urlencode

# from dotenv import load_dotenv
# load_dotenv(Path(__file__).parent.parent.parent / ".env")

# import requests
# from fastapi import APIRouter, HTTPException, Request
# from fastapi.responses import HTMLResponse, RedirectResponse
# from sqlalchemy import JSON, DateTime, String, select
# from sqlalchemy.orm import Mapped, mapped_column

# from .db import SessionLocal
# from .models import Base, MerchantAccount

# router = APIRouter(prefix="/oauth", tags=["oauth"])

# # ── Config ────────────────────────────────────────────────────────────────────

# CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
# CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
# # Where Google redirects after consent. Must be in your OAuth client's
# # "Authorized redirect URIs" in GCP Console.
# REDIRECT_URI  = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8000/oauth/callback")
# FRONTEND_URL  = os.getenv("FRONTEND_URL", "http://localhost:5173")

# SCOPES = [
#     "https://www.googleapis.com/auth/content",       # Merchant Center API
#     "https://www.googleapis.com/auth/userinfo.email",
# ]

# GOOGLE_AUTH  = "https://accounts.google.com/o/oauth2/v2/auth"
# GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
# GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo"

# # In-memory state store (swap for Redis in prod if you want multi-worker)
# _state_store: dict[str, dict] = {}


# # ── Token storage on MerchantAccount ─────────────────────────────────────────

# class OAuthToken(Base):
#     """Stores the user's refresh token per Google account (email)."""
#     __tablename__ = "oauth_tokens"
#     email:         Mapped[str]      = mapped_column(String(255), primary_key=True)
#     refresh_token: Mapped[str]      = mapped_column(String(1024))
#     client_id:     Mapped[str]      = mapped_column(String(255))
#     client_secret: Mapped[str]      = mapped_column(String(255))
#     scope:         Mapped[str]      = mapped_column(String(1024))
#     created_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# # ── Routes ────────────────────────────────────────────────────────────────────

# @router.get("/config")
# async def oauth_config():
#     """Returns whether OAuth is configured (for frontend to show the button)."""
#     return {
#         "configured": bool(CLIENT_ID and CLIENT_SECRET),
#         "client_id_preview": CLIENT_ID[:20] + "…" if CLIENT_ID else None,
#     }


# @router.get("/start")
# async def start(request: Request):
#     """Step 1: redirect the user to Google's consent screen."""
#     if not CLIENT_ID:
#         raise HTTPException(500, "GOOGLE_CLIENT_ID not set. Add it to your .env file.")

#     state = secrets.token_urlsafe(32)
#     _state_store[state] = {"created": datetime.utcnow()}

#     params = {
#         "client_id":     CLIENT_ID,
#         "redirect_uri":  REDIRECT_URI,
#         "response_type": "code",
#         "scope":         " ".join(SCOPES),
#         "access_type":   "offline",     # gives us a refresh_token
#         "prompt":        "consent",     # force the consent screen (needed to get refresh_token every time)
#         "state":         state,
#     }
#     return RedirectResponse(f"{GOOGLE_AUTH}?{urlencode(params)}")


# @router.get("/callback")
# async def callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
#     """Step 2: Google redirects back here with an auth code. We exchange it for tokens."""
#     if error:
#         return _close_popup_html(ok=False, message=f"Authorization denied: {error}")
#     if not code:
#         raise HTTPException(400, "Missing code")
#     if not state or state not in _state_store:
#         raise HTTPException(400, "Invalid state (CSRF check failed)")
#     _state_store.pop(state, None)

#     # Exchange the auth code for tokens
#     r = requests.post(
#         GOOGLE_TOKEN,
#         data={
#             "code":          code,
#             "client_id":     CLIENT_ID,
#             "client_secret": CLIENT_SECRET,
#             "redirect_uri":  REDIRECT_URI,
#             "grant_type":    "authorization_code",
#         },
#         timeout=30,
#     )
#     if r.status_code != 200:
#         return _close_popup_html(ok=False, message=f"Token exchange failed: {r.text[:200]}")

#     tokens = r.json()
#     access_token  = tokens.get("access_token")
#     refresh_token = tokens.get("refresh_token")
#     if not refresh_token:
#         return _close_popup_html(
#             ok=False,
#             message="No refresh token returned. Revoke app access at "
#                     "https://myaccount.google.com/permissions and try again.",
#         )

#     # Find out which Google account we just connected
#     ur = requests.get(
#         GOOGLE_USERINFO,
#         headers={"Authorization": f"Bearer {access_token}"},
#         timeout=30,
#     )
#     email = ur.json().get("email", "unknown")

#     # Store the refresh token
#     async with SessionLocal() as session:
#         existing = (await session.execute(
#             select(OAuthToken).where(OAuthToken.email == email)
#         )).scalar_one_or_none()
#         if existing:
#             existing.refresh_token = refresh_token
#             existing.scope = tokens.get("scope", "")
#         else:
#             session.add(OAuthToken(
#                 email=email,
#                 refresh_token=refresh_token,
#                 client_id=CLIENT_ID,
#                 client_secret=CLIENT_SECRET,
#                 scope=tokens.get("scope", ""),
#             ))
#         await session.commit()

#     return _close_popup_html(
#         ok=True,
#         message=f"Connected as {email}",
#         email=email,
#     )


# @router.get("/accounts")
# async def list_oauth_accounts():
#     """Return Google accounts the user has signed in with."""
#     async with SessionLocal() as session:
#         res = await session.execute(select(OAuthToken))
#         return [{"email": t.email, "created_at": t.created_at.isoformat()} for t in res.scalars()]


# @router.delete("/accounts/{email}")
# async def revoke_oauth(email: str):
#     async with SessionLocal() as session:
#         existing = (await session.execute(
#             select(OAuthToken).where(OAuthToken.email == email)
#         )).scalar_one_or_none()
#         if existing:
#             await session.delete(existing)
#             await session.commit()
#     return {"revoked": email}


# # ── Helper: popup closer HTML ────────────────────────────────────────────────

# def _close_popup_html(ok: bool, message: str, email: Optional[str] = None) -> HTMLResponse:
#     """Returns a tiny HTML page that notifies the parent window and closes itself."""
#     color = "#059669" if ok else "#dc2626"
#     return HTMLResponse(f"""<!doctype html>
# <html>
# <head>
#   <title>OAuth {'Success' if ok else 'Error'}</title>
#   <style>
#     body {{
#       font-family: system-ui, sans-serif;
#       display: flex; align-items: center; justify-content: center;
#       height: 100vh; margin: 0; background: #fafaf5; color: #1a1a17;
#     }}
#     .box {{
#       max-width: 400px; text-align: center; padding: 2rem;
#       border: 1px solid #e8e4d8; border-radius: 12px; background: white;
#     }}
#     h1 {{ color: {color}; margin: 0 0 0.5rem; font-size: 1.5rem; }}
#     p  {{ color: #44443e; }}
#     small {{ color: #8a8676; }}
#   </style>
# </head>
# <body>
#   <div class="box">
#     <h1>{'✓ Connected' if ok else '✗ Failed'}</h1>
#     <p>{message}</p>
#     <small>This window will close automatically…</small>
#   </div>
#   <script>
#     if (window.opener) {{
#       window.opener.postMessage({{
#         type: 'oauth_result',
#         ok: {str(ok).lower()},
#         email: {('"' + email + '"') if email else 'null'},
#         message: {repr(message)}
#       }}, '*');
#     }}
#     setTimeout(() => window.close(), 1500);
#   </script>
# </body>
# </html>""")



"""
OAuth 2.0 flow for connecting Google accounts to the dashboard.
User clicks "Sign in with Google" → consents → we store their refresh token.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import Boolean, JSON, DateTime, String, select
from sqlalchemy.orm import Mapped, mapped_column

from .db import SessionLocal
from .models import Base, MerchantAccount

router = APIRouter(prefix="/oauth", tags=["oauth"])

# ── Config ────────────────────────────────────────────────────────────────────

CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
# Where Google redirects after consent. Must be in your OAuth client's
# "Authorized redirect URIs" in GCP Console.
REDIRECT_URI  = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8000/oauth/callback")
FRONTEND_URL  = os.getenv("FRONTEND_URL", "http://localhost:5173")

SCOPES = [
    "https://www.googleapis.com/auth/content",       # Merchant Center API
    "https://www.googleapis.com/auth/userinfo.email",
]

GOOGLE_AUTH  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo"

# In-memory state store (swap for Redis in prod if you want multi-worker)
_state_store: dict[str, dict] = {}


# ── Token storage on MerchantAccount ─────────────────────────────────────────

class OAuthToken(Base):
    """
    Stores the user's refresh token per Google account (email).

    One row may have is_admin=True — that row is the shared admin token used
    by merchant_accounts where credentials_json contains {"_admin": true}.
    Enforced at DB level by a partial unique index (see db.py migrations).
    """
    __tablename__ = "oauth_tokens"
    email:         Mapped[str]      = mapped_column(String(255), primary_key=True)
    refresh_token: Mapped[str]      = mapped_column(String(1024))
    client_id:     Mapped[str]      = mapped_column(String(255))
    client_secret: Mapped[str]      = mapped_column(String(255))
    scope:         Mapped[str]      = mapped_column(String(1024))
    created_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_admin:      Mapped[bool]     = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/config")
async def oauth_config():
    """Returns whether OAuth is configured (for frontend to show the button)."""
    return {
        "configured": bool(CLIENT_ID and CLIENT_SECRET),
        "client_id_preview": CLIENT_ID[:20] + "…" if CLIENT_ID else None,
    }


@router.get("/start")
async def start(request: Request):
    """Step 1: redirect the user to Google's consent screen."""
    if not CLIENT_ID:
        raise HTTPException(500, "GOOGLE_CLIENT_ID not set. Add it to your .env file.")

    state = secrets.token_urlsafe(32)
    _state_store[state] = {"created": datetime.utcnow()}

    params = {
        "client_id":     CLIENT_ID,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         " ".join(SCOPES),
        "access_type":   "offline",     # gives us a refresh_token
        "prompt":        "consent",     # force the consent screen (needed to get refresh_token every time)
        "state":         state,
    }
    return RedirectResponse(f"{GOOGLE_AUTH}?{urlencode(params)}")


@router.get("/callback")
async def callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Step 2: Google redirects back here with an auth code. We exchange it for tokens."""
    if error:
        return _close_popup_html(ok=False, message=f"Authorization denied: {error}")
    if not code:
        raise HTTPException(400, "Missing code")
    if not state or state not in _state_store:
        raise HTTPException(400, "Invalid state (CSRF check failed)")
    _state_store.pop(state, None)

    # Exchange the auth code for tokens
    r = requests.post(
        GOOGLE_TOKEN,
        data={
            "code":          code,
            "client_id":     CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri":  REDIRECT_URI,
            "grant_type":    "authorization_code",
        },
        timeout=30,
    )
    if r.status_code != 200:
        return _close_popup_html(ok=False, message=f"Token exchange failed: {r.text[:200]}")

    tokens = r.json()
    access_token  = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return _close_popup_html(
            ok=False,
            message="No refresh token returned. Revoke app access at "
                    "https://myaccount.google.com/permissions and try again.",
        )

    # Find out which Google account we just connected
    ur = requests.get(
        GOOGLE_USERINFO,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    email = ur.json().get("email", "unknown")

    # Store the refresh token. is_admin is preserved on update — promoting is
    # a separate operation via /oauth/admin/promote/{email}.
    async with SessionLocal() as session:
        existing = (await session.execute(
            select(OAuthToken).where(OAuthToken.email == email)
        )).scalar_one_or_none()
        if existing:
            existing.refresh_token = refresh_token
            existing.scope = tokens.get("scope", "")
        else:
            session.add(OAuthToken(
                email=email,
                refresh_token=refresh_token,
                client_id=CLIENT_ID,
                client_secret=CLIENT_SECRET,
                scope=tokens.get("scope", ""),
            ))
        await session.commit()

    return _close_popup_html(
        ok=True,
        message=f"Connected as {email}",
        email=email,
    )


@router.get("/accounts")
async def list_oauth_accounts():
    """Return Google accounts the user has signed in with."""
    async with SessionLocal() as session:
        res = await session.execute(select(OAuthToken))
        return [
            {
                "email":      t.email,
                "created_at": t.created_at.isoformat(),
                "is_admin":   t.is_admin,
            }
            for t in res.scalars()
        ]


@router.delete("/accounts/{email}")
async def revoke_oauth(email: str):
    async with SessionLocal() as session:
        existing = (await session.execute(
            select(OAuthToken).where(OAuthToken.email == email)
        )).scalar_one_or_none()
        if existing:
            await session.delete(existing)
            await session.commit()
    return {"revoked": email}


# ── Helper: popup closer HTML ────────────────────────────────────────────────

def _close_popup_html(ok: bool, message: str, email: Optional[str] = None) -> HTMLResponse:
    """Returns a tiny HTML page that notifies the parent window and closes itself."""
    color = "#059669" if ok else "#dc2626"
    return HTMLResponse(f"""<!doctype html>
<html>
<head>
  <title>OAuth {'Success' if ok else 'Error'}</title>
  <style>
    body {{
      font-family: system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0; background: #fafaf5; color: #1a1a17;
    }}
    .box {{
      max-width: 400px; text-align: center; padding: 2rem;
      border: 1px solid #e8e4d8; border-radius: 12px; background: white;
    }}
    h1 {{ color: {color}; margin: 0 0 0.5rem; font-size: 1.5rem; }}
    p  {{ color: #44443e; }}
    small {{ color: #8a8676; }}
  </style>
</head>
<body>
  <div class="box">
    <h1>{'✓ Connected' if ok else '✗ Failed'}</h1>
    <p>{message}</p>
    <small>This window will close automatically…</small>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage({{
        type: 'oauth_result',
        ok: {str(ok).lower()},
        email: {('"' + email + '"') if email else 'null'},
        message: {repr(message)}
      }}, '*');
    }}
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>""")