# """
# Celery background tasks.

# - sync_account_products: pulls all processed products from GMC for an account
#   and reconciles local cache + statuses.
# - register_webhook_subscription: creates a PRODUCT_STATUS_CHANGE subscription
#   pointing at our /webhooks/gmc endpoint.
# """

# import asyncio
# import os

# from celery import Celery

# from .db import SessionLocal
# from .gmc_client import GMCClient
# from .models import MerchantAccount, Product

# REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# celery = Celery("gmc", broker=REDIS_URL, backend=REDIS_URL)
# celery.conf.task_default_queue = "gmc"


# def _aggregate_status(processed: dict) -> tuple[str, int]:
#     """Collapse per-destination statuses into one summary + issue count."""
#     product_status = processed.get("productStatus", {}) or {}
#     destinations = product_status.get("destinationStatuses", []) or []
#     issues = product_status.get("itemLevelIssues", []) or []

#     approved_anywhere = any(d.get("approvedCountries") for d in destinations)
#     disapproved_anywhere = any(d.get("disapprovedCountries") for d in destinations)
#     pending_anywhere = any(d.get("pendingCountries") for d in destinations)

#     if disapproved_anywhere and not approved_anywhere:
#         status = "disapproved"
#     elif approved_anywhere:
#         status = "approved"
#     elif pending_anywhere:
#         status = "pending"
#     else:
#         status = "pending"
#     return status, len(issues)


# async def _sync(account_id: str):
#     async with SessionLocal() as session:
#         acct = await MerchantAccount.get(session, account_id)
#         if not acct:
#             return
#         client = GMCClient(acct.credentials_json)
#         token = None
#         while True:
#             page = client.list_products(account_id, page_token=token)
#             for p in page.get("products", []):
#                 name = p.get("name", "")  # accounts/X/products/en~CA~SKU
#                 parts = name.split("/products/")[-1].split("~")
#                 if len(parts) != 3:
#                     continue
#                 lang, feed, offer = parts
#                 attrs = p.get("productAttributes", {})
#                 status, issue_count = _aggregate_status(p)
#                 await Product.upsert(
#                     session,
#                     account_id=account_id,
#                     offer_id=offer,
#                     title=attrs.get("title", offer),
#                     status=status,
#                     content_language=lang,
#                     feed_label=feed,
#                     issue_count=issue_count,
#                     raw=p,
#                 )
#             token = page.get("nextPageToken")
#             if not token:
#                 break


# @celery.task(name="gmc.sync_account_products")
# def sync_account_products(account_id: str):
#     asyncio.run(_sync(account_id))


# @celery.task(name="gmc.register_webhook_subscription")
# def register_webhook_subscription(account_id: str, callback_uri: str, event_type: str):
#     async def _run():
#         async with SessionLocal() as session:
#             acct = await MerchantAccount.get(session, account_id)
#             if not acct:
#                 return
#             GMCClient(acct.credentials_json).create_subscription(
#                 account_id=account_id,
#                 callback_uri=callback_uri,
#                 event_type=event_type,
#             )

#     asyncio.run(_run())




"""
Celery background tasks.

- sync_account_products: pulls all processed products from GMC for an account
  and reconciles local cache + statuses.
- register_webhook_subscription: creates a PRODUCT_STATUS_CHANGE subscription
  pointing at our /webhooks/gmc endpoint.
"""

import asyncio
import os

from celery import Celery

from .client_factory import _client_for
from .db import SessionLocal
from .models import MerchantAccount, Product

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery = Celery("gmc", broker=REDIS_URL, backend=REDIS_URL)
celery.conf.task_default_queue = "gmc"


def _aggregate_status(processed: dict) -> tuple[str, int]:
    """Collapse per-destination statuses into one summary + issue count."""
    product_status = processed.get("productStatus", {}) or {}
    destinations = product_status.get("destinationStatuses", []) or []
    issues = product_status.get("itemLevelIssues", []) or []

    approved_anywhere = any(d.get("approvedCountries") for d in destinations)
    disapproved_anywhere = any(d.get("disapprovedCountries") for d in destinations)
    pending_anywhere = any(d.get("pendingCountries") for d in destinations)

    if disapproved_anywhere and not approved_anywhere:
        status = "disapproved"
    elif approved_anywhere:
        status = "approved"
    elif pending_anywhere:
        status = "pending"
    else:
        status = "pending"
    return status, len(issues)


async def _sync(account_id: str):
    async with SessionLocal() as session:
        acct = await MerchantAccount.get(session, account_id)
        if not acct:
            return

        # Routes to admin token / per-user OAuth / service account based on
        # credentials_json. Same helper main.py uses.
        client = _client_for(acct)

        token = None
        while True:
            page = client.list_products(account_id, page_token=token)
            for p in page.get("products", []):
                name = p.get("name", "")  # accounts/X/products/en~CA~SKU or 4-part v1beta
                parts = name.split("/products/")[-1].split("~")

                # v1beta: channel~lang~feed~offer (4 parts)
                # v1 legacy: lang~feed~offer      (3 parts)
                if len(parts) == 4:
                    _, lang, feed, offer = parts
                elif len(parts) == 3:
                    lang, feed, offer = parts
                else:
                    continue

                # v1beta uses 'attributes'; v1 used 'productAttributes'
                attrs = p.get("attributes") or p.get("productAttributes") or {}
                status, issue_count = _aggregate_status(p)

                await Product.upsert(
                    session,
                    account_id=account_id,
                    offer_id=offer,
                    title=attrs.get("title", offer),
                    status=status,
                    content_language=lang,
                    feed_label=feed,
                    issue_count=issue_count,
                    raw=p,
                )
            token = page.get("nextPageToken")
            if not token:
                break


@celery.task(name="gmc.sync_account_products")
def sync_account_products(account_id: str):
    asyncio.run(_sync(account_id))


@celery.task(name="gmc.register_webhook_subscription")
def register_webhook_subscription(account_id: str, callback_uri: str, event_type: str):
    async def _run():
        async with SessionLocal() as session:
            acct = await MerchantAccount.get(session, account_id)
            if not acct:
                return
            _client_for(acct).create_subscription(
                account_id=account_id,
                callback_uri=callback_uri,
                event_type=event_type,
            )

    asyncio.run(_run())