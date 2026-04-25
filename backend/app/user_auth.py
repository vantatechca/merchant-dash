"""
User authentication routes (async).

NOT the same as gmc_oauth.py / google_auth.py:
    - gmc_oauth.py  → authorizes the app to call GMC on behalf of a merchant
    - user_auth.py  → authenticates the human using the dashboard itself

Routes (mounted at /api/auth):
    POST /auth/login           — email + password, sets session cookie
    POST /auth/logout          — clears session cookie
    GET  /auth/me              — returns current user, 401 if none
    GET  /auth/google          — 302 → Google consent (login-only scopes)
    GET  /auth/google/callback — consumes code, sets session, 302 → frontend

Sessions are signed cookies via Starlette's SessionMiddleware. No DB rows
for sessions — simple and fast. Upgrade to a sessions table if you need
server-side revocation later.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session
from .models import User

# ────────────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────────────
# Rotate SESSION_SECRET to invalidate every existing session.
SESSION_SECRET = os.environ["SESSION_SECRET"]

# Google OAuth for LOGIN (openid + email + profile).
# Keep this separate from your GMC OAuth client — different scopes, different
# redirect URI, different consent screen.
GOOGLE_LOGIN_CLIENT_ID = os.environ.get("GOOGLE_LOGIN_CLIENT_ID")
GOOGLE_LOGIN_CLIENT_SECRET = os.environ.get("GOOGLE_LOGIN_CLIENT_SECRET")
GOOGLE_LOGIN_REDIRECT_URI = os.environ.get(
    "GOOGLE_LOGIN_REDIRECT_URI",
    "http://localhost:8000/api/auth/google/callback",
)
POST_LOGIN_REDIRECT = os.environ.get("POST_LOGIN_REDIRECT", "http://localhost:5173/")

# Inactivity window for non-"remember me" sessions. The cookie itself has
# a longer max_age (set in main.py); this is the app-level timeout we enforce.
SHORT_SESSION_HOURS = 12
REMEMBER_SESSION_DAYS = 30

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/auth", tags=["auth"])


def _utcnow() -> datetime:
    """
    Naive UTC datetime — matches the DateTime (no tz) columns in models.py.
    asyncpg rejects tz-aware values for `TIMESTAMP WITHOUT TIME ZONE` columns,
    so every DB write of "now" must use this helper, not datetime.now(tz=utc).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ────────────────────────────────────────────────────────────────────────────
# Schemas
# ────────────────────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    email: EmailStr
    password: str
    remember: bool = False


class UserOut(BaseModel):
    id: int
    email: str
    display_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ────────────────────────────────────────────────────────────────────────────
# Session helpers
# ────────────────────────────────────────────────────────────────────────────
def _start_session(request: Request, user: User, remember: bool) -> None:
    # Tz-aware here is correct — this value goes into the session cookie
    # (JSON-serialized), never into the DB. isoformat() preserves the offset.
    now = datetime.now(timezone.utc)
    lifetime = (
        timedelta(days=REMEMBER_SESSION_DAYS)
        if remember
        else timedelta(hours=SHORT_SESSION_HOURS)
    )
    request.session["user_id"] = user.id
    request.session["expires_at"] = (now + lifetime).isoformat()
    request.session["remember"] = remember


def _session_valid(request: Request) -> bool:
    exp = request.session.get("expires_at")
    if not exp:
        return False
    try:
        return datetime.now(timezone.utc) < datetime.fromisoformat(exp)
    except ValueError:
        return False


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    """Dependency — raises 401 if no valid session."""
    if not _session_valid(request):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = request.session.get("user_id")
    user = await db.get(User, user_id) if user_id else None
    if not user:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ────────────────────────────────────────────────────────────────────────────
# Email + password
# ────────────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=UserOut)
async def login(
    body: LoginBody,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    # Uniform error — don't leak whether the account exists.
    if (
        not user
        or not user.password_hash
        or not pwd.verify(body.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user.last_login_at = _utcnow()
    await db.commit()

    _start_session(request, user, body.remember)
    return user


@router.post("/logout", status_code=204)
async def logout(request: Request):
    request.session.clear()
    return None


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


# ────────────────────────────────────────────────────────────────────────────
# Google OAuth — login only (openid/email/profile), NOT GMC access
# ────────────────────────────────────────────────────────────────────────────
_oauth = OAuth()
_oauth.register(
    name="google_login",
    client_id=GOOGLE_LOGIN_CLIENT_ID,
    client_secret=GOOGLE_LOGIN_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/google")
async def google_start(request: Request):
    if not GOOGLE_LOGIN_CLIENT_ID:
        raise HTTPException(500, "Google login is not configured on the server")
    return await _oauth.google_login.authorize_redirect(
        request, GOOGLE_LOGIN_REDIRECT_URI
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    try:
        token = await _oauth.google_login.authorize_access_token(request)
    except OAuthError as e:
        # Send the user back to the frontend with an error flag. Adapt as you like.
        return RedirectResponse(f"{POST_LOGIN_REDIRECT}?auth_error={e.error}")

    claims = token.get("userinfo") or {}
    sub = claims.get("sub")
    email = (claims.get("email") or "").lower()
    name = claims.get("name")

    if not sub or not email or not claims.get("email_verified"):
        raise HTTPException(400, "Google did not return a verified email")

    # Look up by google_sub first (stable id), then fall back to email so
    # password users can link Google on their first OAuth sign-in.
    result = await db.execute(select(User).where(User.google_sub == sub))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_sub = sub
        else:
            # Auto-provision. For invite-only, replace with:
            #   raise HTTPException(403, "Not authorized")
            user = User(email=email, google_sub=sub, display_name=name)
            db.add(user)

    user.last_login_at = _utcnow()
    await db.commit()
    await db.refresh(user)

    _start_session(request, user, remember=True)
    return RedirectResponse(POST_LOGIN_REDIRECT)