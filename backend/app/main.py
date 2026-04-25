

# """
# GMC Dashboard — FastAPI backend (with OAuth support + debug logging)
# """

# from __future__ import annotations

# print(">>> LOADED FROM:", __file__, flush=True)
# print(">>> Python exe:", __import__("sys").executable, flush=True)

# import asyncio
# import base64
# import json
# import logging
# import os
# import time
# from collections import defaultdict
# from contextlib import asynccontextmanager
# from datetime import datetime
# from typing import Optional

# from fastapi import Depends, FastAPI, HTTPException, Request, status
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse
# from pydantic import BaseModel, HttpUrl
# from sqlalchemy import case, func, select
# from sqlalchemy.ext.asyncio import AsyncSession

# from .admin import router as admin_router
# from .admin_oauth import router as admin_oauth_router
# from .client_factory import build_client_for  # ASYNC auth router
# from .db import get_session, init_db
# from .gmc_client import GMCClient, GMCError
# from .gmc_oauth import list_accessible_merchant_accounts
# from .models import MerchantAccount, Notification, Product
# from .oauth import OAuthToken, router as oauth_router

# log = logging.getLogger("gmc")
# logging.basicConfig(level=logging.INFO)


# # ─── Sync throttle state ─────────────────────────────────────────────────────

# SYNC_COOLDOWN_SECONDS = int(os.getenv("SYNC_COOLDOWN_SECONDS", "60"))
# _sync_last_run: dict[str, float] = {}
# _sync_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     await init_db()
#     yield


# app = FastAPI(title="GMC Dashboard API", version="1.0.0", lifespan=lifespan)

# # CORS
# _origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Mount sub-routers
# app.include_router(oauth_router)
# app.include_router(admin_router)
# app.include_router(admin_oauth_router)  # /oauth/admin/*


# @app.exception_handler(GMCError)
# async def gmc_error_handler(_request: Request, exc: GMCError):
#     return JSONResponse(
#         status_code=exc.status if 400 <= exc.status < 600 else 500,
#         content={"error": {"code": exc.code, "message": exc.message, "detail": exc.raw}},
#     )


# # ─── Schemas ─────────────────────────────────────────────────────────────────

# class AccountIn(BaseModel):
#     account_id: str
#     display_name: str
#     credentials_json: dict


# class AccountTestOut(BaseModel):
#     ok: bool
#     account_id: str
#     account_name: Optional[str] = None
#     sub_accounts: int = 0
#     data_sources: int = 0
#     error: Optional[str] = None


# class DataSourceIn(BaseModel):
#     account_id: str
#     display_name: str
#     feed_label: str = "CA"
#     content_language: str = "en"
#     countries: Optional[list[str]] = None


# class ProductIn(BaseModel):
#     account_id: str
#     offer_id: str
#     title: str
#     description: str
#     link: HttpUrl
#     image_link: HttpUrl
#     price_micros: int
#     currency: str = "CAD"
#     availability: str = "in_stock"
#     condition: str = "new"
#     google_product_category: Optional[str] = None
#     gtin: Optional[str] = None
#     feed_label: str = "CA"
#     content_language: str = "en"
#     data_source_id: str


# class SubscribeIn(BaseModel):
#     account_id: str
#     callback_uri: HttpUrl
#     event_type: str = "PRODUCT_STATUS_CHANGE"


# class OAuthConnectIn(BaseModel):
#     email: str
#     account_id: str
#     display_name: str


# # ─── Accounts ────────────────────────────────────────────────────────────────

# @app.get("/accounts")
# async def list_accounts(session: AsyncSession = Depends(get_session)):
#     """
#     List all linked merchant accounts, enriched with per-account product
#     counts. MerchantAccount.all() already returns auth_type.
#     """
#     accounts = await MerchantAccount.all(session)

#     stmt = (
#         select(
#             Product.account_id,
#             func.count(Product.id).label("total"),
#             func.sum(case((Product.status == "approved", 1), else_=0)).label("approved"),
#             func.sum(case((Product.status == "pending", 1), else_=0)).label("pending"),
#             func.sum(case((Product.status == "disapproved", 1), else_=0)).label("disapproved"),
#         )
#         .group_by(Product.account_id)
#     )
#     rows = (await session.execute(stmt)).all()
#     counts = {
#         r.account_id: {
#             "total":       int(r.total or 0),
#             "approved":    int(r.approved or 0),
#             "pending":     int(r.pending or 0),
#             "disapproved": int(r.disapproved or 0),
#         }
#         for r in rows
#     }

#     out = []
#     for a in accounts:
#         acct_dict = a if isinstance(a, dict) else {
#             "account_id":   a.account_id,
#             "display_name": a.display_name,
#             "id":           getattr(a, "id", None),
#             "auth_type":    "service_account",
#         }
#         c = counts.get(acct_dict["account_id"], {})
#         out.append({
#             **acct_dict,
#             "total_products":    c.get("total", 0),
#             "approved_count":    c.get("approved", 0),
#             "pending_count":     c.get("pending", 0),
#             "disapproved_count": c.get("disapproved", 0),
#         })
#     return out


# @app.post("/accounts", status_code=201)
# async def add_account(payload: AccountIn, session: AsyncSession = Depends(get_session)):
#     try:
#         client = GMCClient(payload.credentials_json)
#         info = client.get_account(payload.account_id)
#     except GMCError as e:
#         raise HTTPException(
#             status_code=400,
#             detail=f"Connection failed: {e.message}. "
#                    "Verify the account ID is correct and the service account "
#                    "has been granted access in Merchant Center.",
#         )
#     account = await MerchantAccount.upsert(session, **payload.model_dump())
#     return {**account, "verified": True, "gmc_info": info}


# @app.get("/accounts/{account_id}/test", response_model=AccountTestOut)
# async def test_connection(account_id: str, session: AsyncSession = Depends(get_session)):
#     acct = await MerchantAccount.get(session, account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")
#     try:
#         client = await build_client_for(acct)
#         info = client.get_account(account_id)
#         subs = client.list_sub_accounts(account_id).get("accounts", [])
#         ds = client.list_data_sources(account_id).get("dataSources", [])
#         return AccountTestOut(
#             ok=True,
#             account_id=account_id,
#             account_name=info.get("accountName") or info.get("displayName"),
#             sub_accounts=len(subs),
#             data_sources=len(ds),
#         )
#     except GMCError as e:
#         return AccountTestOut(ok=False, account_id=account_id, error=e.message)


# @app.delete("/accounts/{account_id}")
# async def delete_account(account_id: str, session: AsyncSession = Depends(get_session)):
#     await MerchantAccount.remove(session, account_id)
#     return {"deleted": True}


# # ─── OAuth-based account connect ─────────────────────────────────────────────

# @app.get("/oauth/merchant-accounts/{email}")
# async def list_merchant_accounts_for_user(
#     email: str, session: AsyncSession = Depends(get_session),
# ):
#     log.info(f"[MC-LIST] Request for email={email}")
#     token = (await session.execute(
#         select(OAuthToken).where(OAuthToken.email == email)
#     )).scalar_one_or_none()
#     if not token:
#         log.warning(f"[MC-LIST] No token in DB for {email}")
#         raise HTTPException(404, "Not signed in with this Google account")
#     log.info(
#         f"[MC-LIST] Token found, refresh_token_len={len(token.refresh_token)}, "
#         f"client_id={token.client_id[:30]}..."
#     )
#     try:
#         accounts = list_accessible_merchant_accounts(
#             token.refresh_token, token.client_id, token.client_secret,
#             developer_email=email,
#         )
#         log.info(
#             f"[MC-LIST] Google returned {len(accounts)} accounts: "
#             f"{[a.get('account_id') for a in accounts]}"
#         )
#         return accounts
#     except GMCError as e:
#         log.error(
#             f"[MC-LIST] GMCError status={e.status} code={e.code} "
#             f"msg={str(e.message)[:300]}"
#         )
#         raise
#     except Exception as e:
#         log.exception(f"[MC-LIST] Unexpected for {email}")
#         raise HTTPException(500, f"Internal: {type(e).__name__}: {e}")


# @app.post("/oauth/connect", status_code=201)
# async def connect_via_oauth(
#     payload: OAuthConnectIn, session: AsyncSession = Depends(get_session),
# ):
#     token = (await session.execute(
#         select(OAuthToken).where(OAuthToken.email == payload.email)
#     )).scalar_one_or_none()
#     if not token:
#         raise HTTPException(404, "Google account not signed in")

#     oauth_creds = {
#         "_oauth":        True,
#         "email":         payload.email,
#         "refresh_token": token.refresh_token,
#         "client_id":     token.client_id,
#         "client_secret": token.client_secret,
#     }
#     account = await MerchantAccount.upsert(
#         session,
#         account_id=payload.account_id,
#         display_name=payload.display_name,
#         credentials_json=oauth_creds,
#     )
#     return {**account, "verified": True}


# # ─── Data sources ────────────────────────────────────────────────────────────

# @app.get("/accounts/{account_id}/datasources")
# async def list_datasources(account_id: str, session: AsyncSession = Depends(get_session)):
#     acct = await MerchantAccount.get(session, account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")
#     client = await build_client_for(acct)
#     result = client.list_data_sources(account_id)
#     sources = []
#     for ds in result.get("dataSources", []):
#         ds_id = ds.get("name", "").split("/")[-1]
#         sources.append({
#             "id": ds_id,
#             "display_name": ds.get("displayName"),
#             "input": ds.get("input"),
#             "primary": "primaryProductDataSource" in ds,
#             "feed_label": ds.get("primaryProductDataSource", {}).get("feedLabel"),
#             "content_language": ds.get("primaryProductDataSource", {}).get("contentLanguage"),
#         })
#     return sources


# @app.post("/datasources", status_code=201)
# async def create_datasource(payload: DataSourceIn, session: AsyncSession = Depends(get_session)):
#     acct = await MerchantAccount.get(session, payload.account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")
#     client = await build_client_for(acct)
#     return client.create_primary_api_data_source(
#         account_id=payload.account_id,
#         display_name=payload.display_name,
#         feed_label=payload.feed_label,
#         content_language=payload.content_language,
#         countries=payload.countries,
#     )


# # ─── Products ────────────────────────────────────────────────────────────────

# @app.get("/products")
# async def list_products(
#     account_id: Optional[str] = None,
#     status_filter: Optional[str] = None,
#     limit: int = 100,
#     offset: int = 0,
#     session: AsyncSession = Depends(get_session),
# ):
#     return await Product.search(
#         session,
#         account_id=account_id,
#         status=status_filter,
#         limit=limit,
#         offset=offset,
#     )


# @app.post("/products", status_code=201)
# async def create_product(payload: ProductIn, session: AsyncSession = Depends(get_session)):
#     acct = await MerchantAccount.get(session, payload.account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")

#     client = await build_client_for(acct)
#     attrs = {
#         "title": payload.title,
#         "description": payload.description,
#         "link": str(payload.link),
#         "imageLink": str(payload.image_link),
#         "availability": payload.availability,
#         "condition": payload.condition,
#         "price": {
#             "amountMicros": str(payload.price_micros),
#             "currencyCode": payload.currency,
#         },
#     }
#     if payload.google_product_category:
#         attrs["googleProductCategory"] = payload.google_product_category
#     if payload.gtin:
#         attrs["gtins"] = [payload.gtin]

#     resp = client.insert_product_input(
#         account_id=payload.account_id,
#         data_source_id=payload.data_source_id,
#         offer_id=payload.offer_id,
#         content_language=payload.content_language,
#         feed_label=payload.feed_label,
#         attributes=attrs,
#     )

#     product = await Product.upsert(
#         session,
#         account_id=payload.account_id,
#         offer_id=payload.offer_id,
#         title=payload.title,
#         status="pending",
#         content_language=payload.content_language,
#         feed_label=payload.feed_label,
#         data_source_id=payload.data_source_id,
#         raw=resp,
#     )
#     return product


# # ─── Sync implementation + throttled endpoint ────────────────────────────────

# async def _do_sync(account_id: str, session: AsyncSession) -> dict:
#     acct = await MerchantAccount.get(session, account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")

#     client = await build_client_for(acct)
#     page_token = None
#     count = 0
#     while True:
#         page = client.list_products(account_id, page_token=page_token)
#         products_in_page = page.get("products", [])
#         log.info(f"[SYNC {account_id}] page returned {len(products_in_page)} products")

#         for p in products_in_page:
#             name = p.get("name", "")
#             parts = name.split("/products/")[-1].split("~")

#             if len(parts) == 4:
#                 _, lang, feed, offer = parts
#             elif len(parts) == 3:
#                 lang, feed, offer = parts
#             else:
#                 log.warning(f"[SYNC] Skipping unknown name format: {name}")
#                 continue

#             attrs = p.get("attributes") or p.get("productAttributes") or {}
#             status_val, issues = _aggregate_status(p)

#             log.info(
#                 f"[SYNC] {offer}: {status_val} ({issues} issues) — "
#                 f"{(attrs.get('title') or '')[:60]}"
#             )

#             await Product.upsert(
#                 session,
#                 account_id=account_id,
#                 offer_id=offer,
#                 title=attrs.get("title", offer),
#                 status=status_val,
#                 content_language=lang,
#                 feed_label=feed,
#                 issue_count=issues,
#                 raw=p,
#             )
#             count += 1

#         page_token = page.get("nextPageToken")
#         if not page_token:
#             break

#     log.info(f"[SYNC {account_id}] completed · {count} products synced")
#     return {"synced": count, "account_id": account_id}


# @app.post("/products/sync/{account_id}")
# async def sync_account(
#     account_id: str,
#     force: bool = False,
#     session: AsyncSession = Depends(get_session),
# ):
#     last = _sync_last_run.get(account_id, 0.0)
#     age = time.time() - last

#     if not force and age < SYNC_COOLDOWN_SECONDS:
#         return {
#             "status": "skipped",
#             "reason": "cooldown",
#             "account_id": account_id,
#             "last_synced_seconds_ago": round(age, 1),
#             "cooldown_remaining": round(SYNC_COOLDOWN_SECONDS - age, 1),
#         }

#     async with _sync_locks[account_id]:
#         last = _sync_last_run.get(account_id, 0.0)
#         if not force and (time.time() - last) < SYNC_COOLDOWN_SECONDS:
#             return {
#                 "status": "skipped",
#                 "reason": "piggyback",
#                 "account_id": account_id,
#                 "last_synced_seconds_ago": round(time.time() - last, 1),
#             }

#         result = await _do_sync(account_id, session)
#         _sync_last_run[account_id] = time.time()
#         return {"status": "ok", **result}


# def _aggregate_status(processed: dict) -> tuple[str, int]:
#     ps = processed.get("productStatus") or {}
#     dests = ps.get("destinationStatuses") or []
#     issues = ps.get("itemLevelIssues") or []
#     approved = any(d.get("approvedCountries") for d in dests)
#     disapproved = any(d.get("disapprovedCountries") for d in dests)
#     pending = any(d.get("pendingCountries") for d in dests)
#     if disapproved and not approved:
#         return "disapproved", len(issues)
#     if approved:
#         return "approved", len(issues)
#     if pending:
#         return "pending", len(issues)
#     return "pending", len(issues)


# @app.delete("/products/{product_id}")
# async def delete_product(product_id: int, session: AsyncSession = Depends(get_session)):
#     product = await Product.get(session, product_id)
#     if not product:
#         raise HTTPException(404)
#     acct = await MerchantAccount.get(session, product.account_id)
#     if acct and product.data_source_id:
#         client = await build_client_for(acct)
#         client.delete_product_input(
#             account_id=product.account_id,
#             offer_id=product.offer_id,
#             content_language=product.content_language,
#             feed_label=product.feed_label,
#             data_source_id=product.data_source_id,
#         )
#     await Product.delete(session, product_id)
#     return {"deleted": True}


# # ─── Notifications / webhook ─────────────────────────────────────────────────

# @app.post("/subscriptions", status_code=201)
# async def subscribe(payload: SubscribeIn, session: AsyncSession = Depends(get_session)):
#     acct = await MerchantAccount.get(session, payload.account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")
#     client = await build_client_for(acct)
#     return client.create_subscription(
#         account_id=payload.account_id,
#         callback_uri=str(payload.callback_uri),
#         event_type=payload.event_type,
#     )


# @app.get("/accounts/{account_id}/subscriptions")
# async def list_subscriptions(account_id: str, session: AsyncSession = Depends(get_session)):
#     acct = await MerchantAccount.get(session, account_id)
#     if not acct:
#         raise HTTPException(404, "Account not found")
#     client = await build_client_for(acct)
#     return client.list_subscriptions(account_id)


# @app.post("/webhooks/gmc")
# async def gmc_webhook(request: Request, session: AsyncSession = Depends(get_session)):
#     envelope = await request.json()
#     msg = envelope.get("message") or {}
#     raw = msg.get("data")
#     if not raw:
#         raise HTTPException(400, "Missing message.data")

#     try:
#         decoded = json.loads(base64.b64decode(raw).decode("utf-8"))
#     except Exception as e:
#         log.exception("Failed to decode GMC notification")
#         raise HTTPException(400, f"Bad payload: {e}")

#     account_path = decoded.get("account", "")
#     account_id = account_path.split("/")[-1] if account_path else None
#     change = decoded.get("resource", {}) or decoded.get("attribute", {})
#     reporting_ctx = decoded.get("reportingContext")
#     event_time_str = decoded.get("eventTime")
#     old_value = decoded.get("oldValue") or change.get("oldValue")
#     new_value = decoded.get("newValue") or change.get("newValue")
#     resource_name = decoded.get("resourceName") or decoded.get("resource")

#     offer_id = None
#     if resource_name and isinstance(resource_name, str) and "/products/" in resource_name:
#         offer_id = resource_name.split("/products/")[-1]

#     event_time = (
#         datetime.fromisoformat(event_time_str.replace("Z", "+00:00"))
#         if event_time_str else datetime.utcnow()
#     )

#     await Notification.create(
#         session,
#         account_id=account_id,
#         event_type="PRODUCT_STATUS_CHANGE",
#         offer_id=offer_id,
#         old_value=old_value,
#         new_value=new_value,
#         reporting_context=reporting_ctx,
#         event_time=event_time,
#         raw=decoded,
#     )

#     if offer_id and new_value:
#         await Product.update_status(
#             session, account_id=account_id, offer_id=offer_id, status_value=new_value
#         )
#     return {"ok": True}


# @app.get("/events")
# async def list_events(
#     account_id: Optional[str] = None,
#     limit: int = 50,
#     session: AsyncSession = Depends(get_session),
# ):
#     return await Notification.recent(session, account_id=account_id, limit=limit)


# # ─── Stats ───────────────────────────────────────────────────────────────────

# @app.get("/stats")
# async def stats(
#     account_id: Optional[str] = None,
#     session: AsyncSession = Depends(get_session),
# ):
#     return await Product.stats(session, account_id=account_id)


# @app.get("/health")
# async def health():
#     return {"ok": True, "service": "gmc-dashboard"}





"""
GMC Dashboard — FastAPI backend (with OAuth support + debug logging)
"""

from __future__ import annotations

print(">>> LOADED FROM:", __file__, flush=True)
print(">>> Python exe:", __import__("sys").executable, flush=True)

import asyncio
import base64
import json
import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from .admin import router as admin_router
from .admin_oauth import router as admin_oauth_router
from .client_factory import build_client_for  # ASYNC auth router
from .db import get_session, init_db
from .gmc_client import GMCClient, GMCError
from .gmc_oauth import list_accessible_merchant_accounts
from .models import MerchantAccount, Notification, Product
from .oauth import OAuthToken, router as oauth_router
from .user_auth import router as auth_router

log = logging.getLogger("gmc")
logging.basicConfig(level=logging.INFO)


# ─── Sync throttle state ─────────────────────────────────────────────────────

SYNC_COOLDOWN_SECONDS = int(os.getenv("SYNC_COOLDOWN_SECONDS", "60"))
_sync_last_run: dict[str, float] = {}
_sync_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="GMC Dashboard API", version="1.0.0", lifespan=lifespan)

# CORS
_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session cookie — required for user_auth's request.session access.
# same_site="lax" lets the cookie survive Google's OAuth callback redirect.
# Flip https_only=True in production (and serve over HTTPS).
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET"],
    session_cookie="gmc_session",
    max_age=60 * 60 * 24 * 30,  # 30 days — outer bound; app enforces tighter expiry
    same_site="lax",
    https_only=False,
)

# Mount sub-routers
app.include_router(oauth_router)
app.include_router(admin_router)
app.include_router(admin_oauth_router)  # /oauth/admin/*
app.include_router(auth_router)         # /auth/login, /auth/me, /auth/google, ...


@app.exception_handler(GMCError)
async def gmc_error_handler(_request: Request, exc: GMCError):
    return JSONResponse(
        status_code=exc.status if 400 <= exc.status < 600 else 500,
        content={"error": {"code": exc.code, "message": exc.message, "detail": exc.raw}},
    )


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AccountIn(BaseModel):
    account_id: str
    display_name: str
    credentials_json: dict


class AccountTestOut(BaseModel):
    ok: bool
    account_id: str
    account_name: Optional[str] = None
    sub_accounts: int = 0
    data_sources: int = 0
    error: Optional[str] = None


class DataSourceIn(BaseModel):
    account_id: str
    display_name: str
    feed_label: str = "CA"
    content_language: str = "en"
    countries: Optional[list[str]] = None


class ProductIn(BaseModel):
    account_id: str
    offer_id: str
    title: str
    description: str
    link: HttpUrl
    image_link: HttpUrl
    price_micros: int
    currency: str = "CAD"
    availability: str = "in_stock"
    condition: str = "new"
    google_product_category: Optional[str] = None
    gtin: Optional[str] = None
    feed_label: str = "CA"
    content_language: str = "en"
    data_source_id: str


class SubscribeIn(BaseModel):
    account_id: str
    callback_uri: HttpUrl
    event_type: str = "PRODUCT_STATUS_CHANGE"


class OAuthConnectIn(BaseModel):
    email: str
    account_id: str
    display_name: str


# ─── Accounts ────────────────────────────────────────────────────────────────

@app.get("/accounts")
async def list_accounts(session: AsyncSession = Depends(get_session)):
    """
    List all linked merchant accounts, enriched with per-account product
    counts. MerchantAccount.all() already returns auth_type.
    """
    accounts = await MerchantAccount.all(session)

    stmt = (
        select(
            Product.account_id,
            func.count(Product.id).label("total"),
            func.sum(case((Product.status == "approved", 1), else_=0)).label("approved"),
            func.sum(case((Product.status == "pending", 1), else_=0)).label("pending"),
            func.sum(case((Product.status == "disapproved", 1), else_=0)).label("disapproved"),
        )
        .group_by(Product.account_id)
    )
    rows = (await session.execute(stmt)).all()
    counts = {
        r.account_id: {
            "total":       int(r.total or 0),
            "approved":    int(r.approved or 0),
            "pending":     int(r.pending or 0),
            "disapproved": int(r.disapproved or 0),
        }
        for r in rows
    }

    out = []
    for a in accounts:
        acct_dict = a if isinstance(a, dict) else {
            "account_id":   a.account_id,
            "display_name": a.display_name,
            "id":           getattr(a, "id", None),
            "auth_type":    "service_account",
        }
        c = counts.get(acct_dict["account_id"], {})
        out.append({
            **acct_dict,
            "total_products":    c.get("total", 0),
            "approved_count":    c.get("approved", 0),
            "pending_count":     c.get("pending", 0),
            "disapproved_count": c.get("disapproved", 0),
        })
    return out


@app.post("/accounts", status_code=201)
async def add_account(payload: AccountIn, session: AsyncSession = Depends(get_session)):
    try:
        client = GMCClient(payload.credentials_json)
        info = client.get_account(payload.account_id)
    except GMCError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Connection failed: {e.message}. "
                   "Verify the account ID is correct and the service account "
                   "has been granted access in Merchant Center.",
        )
    account = await MerchantAccount.upsert(session, **payload.model_dump())
    return {**account, "verified": True, "gmc_info": info}


@app.get("/accounts/{account_id}/test", response_model=AccountTestOut)
async def test_connection(account_id: str, session: AsyncSession = Depends(get_session)):
    acct = await MerchantAccount.get(session, account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    try:
        client = await build_client_for(acct)
        info = client.get_account(account_id)
        subs = client.list_sub_accounts(account_id).get("accounts", [])
        ds = client.list_data_sources(account_id).get("dataSources", [])
        return AccountTestOut(
            ok=True,
            account_id=account_id,
            account_name=info.get("accountName") or info.get("displayName"),
            sub_accounts=len(subs),
            data_sources=len(ds),
        )
    except GMCError as e:
        return AccountTestOut(ok=False, account_id=account_id, error=e.message)


@app.delete("/accounts/{account_id}")
async def delete_account(account_id: str, session: AsyncSession = Depends(get_session)):
    await MerchantAccount.remove(session, account_id)
    return {"deleted": True}


# ─── OAuth-based account connect ─────────────────────────────────────────────

@app.get("/oauth/merchant-accounts/{email}")
async def list_merchant_accounts_for_user(
    email: str, session: AsyncSession = Depends(get_session),
):
    log.info(f"[MC-LIST] Request for email={email}")
    token = (await session.execute(
        select(OAuthToken).where(OAuthToken.email == email)
    )).scalar_one_or_none()
    if not token:
        log.warning(f"[MC-LIST] No token in DB for {email}")
        raise HTTPException(404, "Not signed in with this Google account")
    log.info(
        f"[MC-LIST] Token found, refresh_token_len={len(token.refresh_token)}, "
        f"client_id={token.client_id[:30]}..."
    )
    try:
        accounts = list_accessible_merchant_accounts(
            token.refresh_token, token.client_id, token.client_secret,
            developer_email=email,
        )
        log.info(
            f"[MC-LIST] Google returned {len(accounts)} accounts: "
            f"{[a.get('account_id') for a in accounts]}"
        )
        return accounts
    except GMCError as e:
        log.error(
            f"[MC-LIST] GMCError status={e.status} code={e.code} "
            f"msg={str(e.message)[:300]}"
        )
        raise
    except Exception as e:
        log.exception(f"[MC-LIST] Unexpected for {email}")
        raise HTTPException(500, f"Internal: {type(e).__name__}: {e}")


@app.post("/oauth/connect", status_code=201)
async def connect_via_oauth(
    payload: OAuthConnectIn, session: AsyncSession = Depends(get_session),
):
    token = (await session.execute(
        select(OAuthToken).where(OAuthToken.email == payload.email)
    )).scalar_one_or_none()
    if not token:
        raise HTTPException(404, "Google account not signed in")

    oauth_creds = {
        "_oauth":        True,
        "email":         payload.email,
        "refresh_token": token.refresh_token,
        "client_id":     token.client_id,
        "client_secret": token.client_secret,
    }
    account = await MerchantAccount.upsert(
        session,
        account_id=payload.account_id,
        display_name=payload.display_name,
        credentials_json=oauth_creds,
    )
    return {**account, "verified": True}


# ─── Data sources ────────────────────────────────────────────────────────────

@app.get("/accounts/{account_id}/datasources")
async def list_datasources(account_id: str, session: AsyncSession = Depends(get_session)):
    acct = await MerchantAccount.get(session, account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    client = await build_client_for(acct)
    result = client.list_data_sources(account_id)
    sources = []
    for ds in result.get("dataSources", []):
        ds_id = ds.get("name", "").split("/")[-1]
        sources.append({
            "id": ds_id,
            "display_name": ds.get("displayName"),
            "input": ds.get("input"),
            "primary": "primaryProductDataSource" in ds,
            "feed_label": ds.get("primaryProductDataSource", {}).get("feedLabel"),
            "content_language": ds.get("primaryProductDataSource", {}).get("contentLanguage"),
        })
    return sources


@app.post("/datasources", status_code=201)
async def create_datasource(payload: DataSourceIn, session: AsyncSession = Depends(get_session)):
    acct = await MerchantAccount.get(session, payload.account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    client = await build_client_for(acct)
    return client.create_primary_api_data_source(
        account_id=payload.account_id,
        display_name=payload.display_name,
        feed_label=payload.feed_label,
        content_language=payload.content_language,
        countries=payload.countries,
    )


# ─── Products ────────────────────────────────────────────────────────────────

@app.get("/products")
async def list_products(
    account_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    return await Product.search(
        session,
        account_id=account_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )


@app.post("/products", status_code=201)
async def create_product(payload: ProductIn, session: AsyncSession = Depends(get_session)):
    acct = await MerchantAccount.get(session, payload.account_id)
    if not acct:
        raise HTTPException(404, "Account not found")

    client = await build_client_for(acct)
    attrs = {
        "title": payload.title,
        "description": payload.description,
        "link": str(payload.link),
        "imageLink": str(payload.image_link),
        "availability": payload.availability,
        "condition": payload.condition,
        "price": {
            "amountMicros": str(payload.price_micros),
            "currencyCode": payload.currency,
        },
    }
    if payload.google_product_category:
        attrs["googleProductCategory"] = payload.google_product_category
    if payload.gtin:
        attrs["gtins"] = [payload.gtin]

    resp = client.insert_product_input(
        account_id=payload.account_id,
        data_source_id=payload.data_source_id,
        offer_id=payload.offer_id,
        content_language=payload.content_language,
        feed_label=payload.feed_label,
        attributes=attrs,
    )

    product = await Product.upsert(
        session,
        account_id=payload.account_id,
        offer_id=payload.offer_id,
        title=payload.title,
        status="pending",
        content_language=payload.content_language,
        feed_label=payload.feed_label,
        data_source_id=payload.data_source_id,
        raw=resp,
    )
    return product


# ─── Sync implementation + throttled endpoint ────────────────────────────────

async def _do_sync(account_id: str, session: AsyncSession) -> dict:
    acct = await MerchantAccount.get(session, account_id)
    if not acct:
        raise HTTPException(404, "Account not found")

    client = await build_client_for(acct)
    page_token = None
    count = 0
    while True:
        page = client.list_products(account_id, page_token=page_token)
        products_in_page = page.get("products", [])
        log.info(f"[SYNC {account_id}] page returned {len(products_in_page)} products")

        for p in products_in_page:
            name = p.get("name", "")
            parts = name.split("/products/")[-1].split("~")

            if len(parts) == 4:
                _, lang, feed, offer = parts
            elif len(parts) == 3:
                lang, feed, offer = parts
            else:
                log.warning(f"[SYNC] Skipping unknown name format: {name}")
                continue

            attrs = p.get("attributes") or p.get("productAttributes") or {}
            status_val, issues = _aggregate_status(p)

            log.info(
                f"[SYNC] {offer}: {status_val} ({issues} issues) — "
                f"{(attrs.get('title') or '')[:60]}"
            )

            await Product.upsert(
                session,
                account_id=account_id,
                offer_id=offer,
                title=attrs.get("title", offer),
                status=status_val,
                content_language=lang,
                feed_label=feed,
                issue_count=issues,
                raw=p,
            )
            count += 1

        page_token = page.get("nextPageToken")
        if not page_token:
            break

    log.info(f"[SYNC {account_id}] completed · {count} products synced")
    return {"synced": count, "account_id": account_id}


@app.post("/products/sync/{account_id}")
async def sync_account(
    account_id: str,
    force: bool = False,
    session: AsyncSession = Depends(get_session),
):
    last = _sync_last_run.get(account_id, 0.0)
    age = time.time() - last

    if not force and age < SYNC_COOLDOWN_SECONDS:
        return {
            "status": "skipped",
            "reason": "cooldown",
            "account_id": account_id,
            "last_synced_seconds_ago": round(age, 1),
            "cooldown_remaining": round(SYNC_COOLDOWN_SECONDS - age, 1),
        }

    async with _sync_locks[account_id]:
        last = _sync_last_run.get(account_id, 0.0)
        if not force and (time.time() - last) < SYNC_COOLDOWN_SECONDS:
            return {
                "status": "skipped",
                "reason": "piggyback",
                "account_id": account_id,
                "last_synced_seconds_ago": round(time.time() - last, 1),
            }

        result = await _do_sync(account_id, session)
        _sync_last_run[account_id] = time.time()
        return {"status": "ok", **result}


def _aggregate_status(processed: dict) -> tuple[str, int]:
    ps = processed.get("productStatus") or {}
    dests = ps.get("destinationStatuses") or []
    issues = ps.get("itemLevelIssues") or []
    approved = any(d.get("approvedCountries") for d in dests)
    disapproved = any(d.get("disapprovedCountries") for d in dests)
    pending = any(d.get("pendingCountries") for d in dests)
    if disapproved and not approved:
        return "disapproved", len(issues)
    if approved:
        return "approved", len(issues)
    if pending:
        return "pending", len(issues)
    return "pending", len(issues)


@app.delete("/products/{product_id}")
async def delete_product(product_id: int, session: AsyncSession = Depends(get_session)):
    product = await Product.get(session, product_id)
    if not product:
        raise HTTPException(404)
    acct = await MerchantAccount.get(session, product.account_id)
    if acct and product.data_source_id:
        client = await build_client_for(acct)
        client.delete_product_input(
            account_id=product.account_id,
            offer_id=product.offer_id,
            content_language=product.content_language,
            feed_label=product.feed_label,
            data_source_id=product.data_source_id,
        )
    await Product.delete(session, product_id)
    return {"deleted": True}


# ─── Notifications / webhook ─────────────────────────────────────────────────

@app.post("/subscriptions", status_code=201)
async def subscribe(payload: SubscribeIn, session: AsyncSession = Depends(get_session)):
    acct = await MerchantAccount.get(session, payload.account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    client = await build_client_for(acct)
    return client.create_subscription(
        account_id=payload.account_id,
        callback_uri=str(payload.callback_uri),
        event_type=payload.event_type,
    )


@app.get("/accounts/{account_id}/subscriptions")
async def list_subscriptions(account_id: str, session: AsyncSession = Depends(get_session)):
    acct = await MerchantAccount.get(session, account_id)
    if not acct:
        raise HTTPException(404, "Account not found")
    client = await build_client_for(acct)
    return client.list_subscriptions(account_id)


@app.post("/webhooks/gmc")
async def gmc_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    envelope = await request.json()
    msg = envelope.get("message") or {}
    raw = msg.get("data")
    if not raw:
        raise HTTPException(400, "Missing message.data")

    try:
        decoded = json.loads(base64.b64decode(raw).decode("utf-8"))
    except Exception as e:
        log.exception("Failed to decode GMC notification")
        raise HTTPException(400, f"Bad payload: {e}")

    account_path = decoded.get("account", "")
    account_id = account_path.split("/")[-1] if account_path else None
    change = decoded.get("resource", {}) or decoded.get("attribute", {})
    reporting_ctx = decoded.get("reportingContext")
    event_time_str = decoded.get("eventTime")
    old_value = decoded.get("oldValue") or change.get("oldValue")
    new_value = decoded.get("newValue") or change.get("newValue")
    resource_name = decoded.get("resourceName") or decoded.get("resource")

    offer_id = None
    if resource_name and isinstance(resource_name, str) and "/products/" in resource_name:
        offer_id = resource_name.split("/products/")[-1]

    event_time = (
        datetime.fromisoformat(event_time_str.replace("Z", "+00:00"))
        if event_time_str else datetime.utcnow()
    )

    await Notification.create(
        session,
        account_id=account_id,
        event_type="PRODUCT_STATUS_CHANGE",
        offer_id=offer_id,
        old_value=old_value,
        new_value=new_value,
        reporting_context=reporting_ctx,
        event_time=event_time,
        raw=decoded,
    )

    if offer_id and new_value:
        await Product.update_status(
            session, account_id=account_id, offer_id=offer_id, status_value=new_value
        )
    return {"ok": True}


@app.get("/events")
async def list_events(
    account_id: Optional[str] = None,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    return await Notification.recent(session, account_id=account_id, limit=limit)


# ─── Stats ───────────────────────────────────────────────────────────────────

@app.get("/stats")
async def stats(
    account_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    return await Product.stats(session, account_id=account_id)


@app.get("/health")
async def health():
    return {"ok": True, "service": "gmc-dashboard"}