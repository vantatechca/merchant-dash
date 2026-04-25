
# """
# GMC client that uses OAuth refresh tokens instead of service account JSON.
# """

# from __future__ import annotations

# import logging
# import time
# from typing import Any

# import requests
# from google.oauth2.credentials import Credentials
# from google.auth.transport.requests import Request as GRequest

# from .gmc_client import GMCClient, GMCError

# log = logging.getLogger("gmc")

# CONTENT_API  = "https://shoppingcontent.googleapis.com/content/v2.1"
# MERCHANT_API = "https://merchantapi.googleapis.com/accounts/v1"
# SCOPES = ["https://www.googleapis.com/auth/content"]


# def _access_token(refresh_token: str, client_id: str, client_secret: str) -> str:
#     creds = Credentials(
#         token=None,
#         refresh_token=refresh_token,
#         token_uri="https://oauth2.googleapis.com/token",
#         client_id=client_id,
#         client_secret=client_secret,
#         scopes=SCOPES,
#     )
#     creds.refresh(GRequest())
#     return creds.token


# def _raise_gmc(r: requests.Response) -> None:
#     try:
#         body = r.json()
#         err = body.get("error", {})
#     except Exception:
#         body, err = {}, {}
#     raise GMCError(
#         r.status_code,
#         err.get("status", "UNKNOWN"),
#         err.get("message", r.text[:300]),
#         body,
#     )


# def _list_via_content_api(token: str) -> list[dict]:
#     """
#     Uses Content API for Shopping (pre-Merchant API). Does NOT require
#     GCP project registration — this is our bootstrap to discover which
#     MC accounts the signed-in user can access.
#     """
#     r = requests.get(
#         f"{CONTENT_API}/accounts/authinfo",
#         headers={"Authorization": f"Bearer {token}"},
#         timeout=30,
#     )
#     if r.status_code != 200:
#         _raise_gmc(r)

#     data = r.json()
#     out: list[dict] = []

#     # accountIdentifiers: [{merchantId, aggregatorId}, ...]
#     for ident in data.get("accountIdentifiers", []):
#         acct_id = ident.get("merchantId") or ident.get("aggregatorId")
#         if not acct_id:
#             continue
#         out.append({
#             "account_id":   str(acct_id),
#             "account_name": "",
#             "raw":          ident,
#         })
#     return out


# def _register_gcp(token: str, mc_id: str, developer_email: str | None) -> None:
#     body: dict[str, Any] = {}
#     if developer_email:
#         body["developerEmail"] = developer_email

#     r = requests.post(
#         f"{MERCHANT_API}/accounts/{mc_id}/developerRegistration:registerGcp",
#         headers={
#             "Authorization": f"Bearer {token}",
#             "Content-Type": "application/json",
#         },
#         json=body,
#         timeout=30,
#     )
#     if r.status_code >= 400:
#         log.error("[REGISTER-GCP] mc=%s status=%s body=%s", mc_id, r.status_code, r.text)
#         _raise_gmc(r)
#     log.info("[REGISTER-GCP] OK for mc=%s", mc_id)


# def _name_from_content_account(j: dict) -> str:
#     """Pick the best available display name from a Content API account resource."""
#     return (
#         j.get("name")
#         or j.get("businessInformation", {}).get("name")
#         or j.get("adsAccountName")
#         or j.get("websiteUrl")
#         or ""
#     )


# def _enrich_names_via_content_api(token: str, accounts: list[dict]) -> list[dict]:
#     """
#     Fill in human-readable store names via Content API.
#     Works immediately — not subject to Merchant API registration delay.
#     """
#     for a in accounts:
#         acct_id = a["account_id"]
#         parent_id = a.get("raw", {}).get("aggregatorId") or acct_id

#         try:
#             r = requests.get(
#                 f"{CONTENT_API}/{parent_id}/accounts/{acct_id}",
#                 headers={"Authorization": f"Bearer {token}"},
#                 timeout=15,
#             )
#             if r.status_code == 200:
#                 name = _name_from_content_account(r.json())
#                 if name:
#                     a["account_name"] = name
#                     log.info("[MC-NAME] %s → %s", acct_id, name)
#                     continue
#                 log.info("[MC-NAME] %s → 200 but no name field", acct_id)
#             else:
#                 log.info("[MC-NAME] %s → %s %s", acct_id, r.status_code, r.text[:120])
#         except Exception as e:
#             log.info("[MC-NAME] %s failed: %s", acct_id, e)

#         # Fallback: try Merchant API (works after registerGcp propagates)
#         try:
#             r = requests.get(
#                 f"{MERCHANT_API}/accounts/{acct_id}",
#                 headers={"Authorization": f"Bearer {token}"},
#                 timeout=15,
#             )
#             if r.status_code == 200:
#                 j = r.json()
#                 name = j.get("accountName") or j.get("displayName") or ""
#                 if name:
#                     a["account_name"] = name
#                     log.info("[MC-NAME] %s → %s (via Merchant API)", acct_id, name)
#         except Exception:
#             pass

#     return accounts


# def make_gmc_client_from_oauth(
#     refresh_token: str,
#     client_id: str,
#     client_secret: str,
# ) -> GMCClient:
#     creds = Credentials(
#         token=None,
#         refresh_token=refresh_token,
#         token_uri="https://oauth2.googleapis.com/token",
#         client_id=client_id,
#         client_secret=client_secret,
#         scopes=SCOPES,
#     )
#     client = GMCClient.__new__(GMCClient)
#     client.creds = creds
#     return client


# def list_accessible_merchant_accounts(
#     refresh_token: str,
#     client_id: str,
#     client_secret: str,
#     developer_email: str | None = None,
# ) -> list[dict]:
#     """
#     Discovers MC accounts via Content API (no registration needed),
#     then registers the GCP against the first one so subsequent
#     Merchant API calls work.
#     """
#     token = _access_token(refresh_token, client_id, client_secret)

#     log.info("[MC-LIST] Discovering via Content API authinfo…")
#     accounts = _list_via_content_api(token)
#     log.info("[MC-LIST] Content API returned %d accounts", len(accounts))

#     if not accounts:
#         return []

#     primary_id = accounts[0]["account_id"]
#     try:
#         _register_gcp(token, primary_id, developer_email)
#         time.sleep(5)
#     except GMCError as e:
#         msg = (e.message or "").lower()
#         if "already" in msg:
#             log.info("[REGISTER-GCP] already registered — continuing")
#         else:
#             log.warning("[REGISTER-GCP] failed: %s — continuing with list", e.message)

#     return _enrich_names_via_content_api(token, accounts)




"""
GMC client that uses OAuth refresh tokens instead of service account JSON.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GRequest

from .gmc_client import GMCClient, GMCError

log = logging.getLogger("gmc")

CONTENT_API  = "https://shoppingcontent.googleapis.com/content/v2.1"
MERCHANT_API = "https://merchantapi.googleapis.com/accounts/v1"
SCOPES = ["https://www.googleapis.com/auth/content"]


def _access_token(refresh_token: str, client_id: str, client_secret: str) -> str:
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )
    creds.refresh(GRequest())
    return creds.token


def _raise_gmc(r: requests.Response) -> None:
    try:
        body = r.json()
        err = body.get("error", {})
    except Exception:
        body, err = {}, {}
    raise GMCError(
        r.status_code,
        err.get("status", "UNKNOWN"),
        err.get("message", r.text[:300]),
        body,
    )


def _list_via_content_api(token: str) -> list[dict]:
    """
    Uses Content API for Shopping (pre-Merchant API). Does NOT require
    GCP project registration — this is our bootstrap to discover which
    MC accounts the signed-in user can access.
    """
    r = requests.get(
        f"{CONTENT_API}/accounts/authinfo",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if r.status_code != 200:
        _raise_gmc(r)

    data = r.json()
    out: list[dict] = []

    # accountIdentifiers: [{merchantId, aggregatorId}, ...]
    for ident in data.get("accountIdentifiers", []):
        acct_id = ident.get("merchantId") or ident.get("aggregatorId")
        if not acct_id:
            continue
        out.append({
            "account_id":   str(acct_id),
            "account_name": "",
            "raw":          ident,
        })
    return out


def _register_gcp(token: str, mc_id: str, developer_email: str | None) -> None:
    body: dict[str, Any] = {}
    if developer_email:
        body["developerEmail"] = developer_email

    r = requests.post(
        f"{MERCHANT_API}/accounts/{mc_id}/developerRegistration:registerGcp",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=30,
    )
    if r.status_code >= 400:
        log.error("[REGISTER-GCP] mc=%s status=%s body=%s", mc_id, r.status_code, r.text)
        _raise_gmc(r)
    log.info("[REGISTER-GCP] OK for mc=%s", mc_id)


def _name_from_content_account(j: dict) -> str:
    """Pick the best available display name from a Content API account resource."""
    return (
        j.get("name")
        or j.get("businessInformation", {}).get("name")
        or j.get("adsAccountName")
        or j.get("websiteUrl")
        or ""
    )


def _enrich_names_via_content_api(token: str, accounts: list[dict]) -> list[dict]:
    """
    Fill in human-readable store names via Content API.
    Works immediately — not subject to Merchant API registration delay.
    """
    for a in accounts:
        acct_id = a["account_id"]
        parent_id = a.get("raw", {}).get("aggregatorId") or acct_id

        try:
            r = requests.get(
                f"{CONTENT_API}/{parent_id}/accounts/{acct_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if r.status_code == 200:
                name = _name_from_content_account(r.json())
                if name:
                    a["account_name"] = name
                    log.info("[MC-NAME] %s → %s", acct_id, name)
                    continue
                log.info("[MC-NAME] %s → 200 but no name field", acct_id)
            else:
                log.info("[MC-NAME] %s → %s %s", acct_id, r.status_code, r.text[:120])
        except Exception as e:
            log.info("[MC-NAME] %s failed: %s", acct_id, e)

        # Fallback: try Merchant API (works after registerGcp propagates)
        try:
            r = requests.get(
                f"{MERCHANT_API}/accounts/{acct_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if r.status_code == 200:
                j = r.json()
                name = j.get("accountName") or j.get("displayName") or ""
                if name:
                    a["account_name"] = name
                    log.info("[MC-NAME] %s → %s (via Merchant API)", acct_id, name)
        except Exception:
            pass

    return accounts


# ─── Client builders ────────────────────────────────────────────────────────

def make_gmc_client_from_oauth(
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> GMCClient:
    """
    Build a GMCClient wired to use a per-user OAuth refresh token.

    The token provider closure captures the refresh creds and returns a fresh
    access token on each call. GMCClient's _token() calls it on every request,
    but google-auth internally caches valid tokens so this is cheap.
    """
    def _provider() -> str:
        return _access_token(refresh_token, client_id, client_secret)
    return GMCClient.from_token_provider(_provider)


def make_gmc_client_from_token_callable(provider: Callable[[], str]) -> GMCClient:
    """
    Build a GMCClient from an arbitrary token-provider callable.
    Used by google_auth.py to wire the shared admin token through.
    """
    return GMCClient.from_token_provider(provider)


# ─── Discovery ──────────────────────────────────────────────────────────────

def list_accessible_merchant_accounts(
    refresh_token: str,
    client_id: str,
    client_secret: str,
    developer_email: str | None = None,
) -> list[dict]:
    """
    Discovers MC accounts via Content API (no registration needed),
    then registers the GCP against the first one so subsequent
    Merchant API calls work.
    """
    token = _access_token(refresh_token, client_id, client_secret)

    log.info("[MC-LIST] Discovering via Content API authinfo…")
    accounts = _list_via_content_api(token)
    log.info("[MC-LIST] Content API returned %d accounts", len(accounts))

    if not accounts:
        return []

    primary_id = accounts[0]["account_id"]
    try:
        _register_gcp(token, primary_id, developer_email)
        time.sleep(5)
    except GMCError as e:
        msg = (e.message or "").lower()
        if "already" in msg:
            log.info("[REGISTER-GCP] already registered — continuing")
        else:
            log.warning("[REGISTER-GCP] failed: %s — continuing with list", e.message)

    return _enrich_names_via_content_api(token, accounts)


def list_accessible_with_token(token: str) -> list[dict]:
    """
    Same as list_accessible_merchant_accounts but takes a pre-fetched access
    token. Used when the caller (google_auth.py) already has a valid token
    from the admin refresh flow and doesn't need a second refresh round-trip.
    Skips the implicit GCP registration — that's handled separately by the
    admin flow's /oauth/admin/register-gcp-all sweep.
    """
    accounts = _list_via_content_api(token)
    if not accounts:
        return []
    return _enrich_names_via_content_api(token, accounts)