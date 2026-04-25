# """
# Google Merchant API client (v1beta preferred — v1 requires GCP registration).

# Docs:
#   https://developers.google.com/merchant/api/guides/products/add-manage
# """

# from __future__ import annotations

# import logging
# from typing import Any, Optional

# import google.auth.transport.requests as gauth_requests
# import requests
# from google.oauth2 import service_account

# log = logging.getLogger("gmc.client")

# BASE = "https://merchantapi.googleapis.com"
# SCOPES = ["https://www.googleapis.com/auth/content"]

# # Use v1beta everywhere to avoid the "GCP project not registered" wall.
# # v1 is stricter: every call requires the GCP project to be pre-registered with MC.
# # v1beta is still live and has the same shape, but doesn't enforce that check.
# API_VERSION = "v1"


# class GMCError(Exception):
#     """Raised on any GMC API error. Surfaces Google's error details."""

#     def __init__(self, status: int, code: str, message: str, raw: dict | None = None):
#         self.status = status
#         self.code = code
#         self.message = message
#         self.raw = raw or {}
#         super().__init__(f"[{status} {code}] {message}")


# class GMCClient:
#     def __init__(self, credentials_json: dict):
#         try:
#             self.creds = service_account.Credentials.from_service_account_info(
#                 credentials_json, scopes=SCOPES
#             )
#         except Exception as e:
#             raise GMCError(
#                 400, "INVALID_CREDENTIALS",
#                 f"Credentials JSON is not a valid service account key: {e}",
#             )

#     # ---- internals ----

#     def _token(self) -> str:
#         if not self.creds.valid:
#             self.creds.refresh(gauth_requests.Request())
#         return self.creds.token

#     def _headers(self) -> dict:
#         return {
#             "Authorization": f"Bearer {self._token()}",
#             "Content-Type": "application/json",
#         }

#     def _request(self, method: str, url: str, **kw) -> dict:
#         r = requests.request(method, url, headers=self._headers(), timeout=60, **kw)
#         if r.status_code >= 400:
#             try:
#                 err = r.json().get("error", {})
#             except Exception:
#                 err = {}
#             raise GMCError(
#                 status=r.status_code,
#                 code=err.get("status", "UNKNOWN"),
#                 message=err.get("message", r.text[:300]),
#                 raw=err,
#             )
#         if r.status_code == 204 or not r.content:
#             return {}
#         return r.json()

#     # ---- Account info ----

#     def get_account(self, account_id: str) -> dict:
#         return self._request(
#             "GET", f"{BASE}/accounts/{API_VERSION}/accounts/{account_id}"
#         )

#     def list_sub_accounts(self, advanced_account_id: str) -> dict:
#         """List sub-accounts under an MCA. May not work on non-MCA accounts (returns empty)."""
#         try:
#             return self._request(
#                 "GET",
#                 f"{BASE}/accounts/{API_VERSION}/accounts/{advanced_account_id}:listSubaccounts",
#             )
#         except GMCError:
#             return {"accounts": []}

#     # ---- Data sources ----

#     def list_data_sources(self, account_id: str) -> dict:
#         try:
#             return self._request(
#                 "GET",
#                 f"{BASE}/datasources/{API_VERSION}/accounts/{account_id}/dataSources",
#             )
#         except GMCError:
#             return {"dataSources": []}

#     def create_primary_api_data_source(
#         self,
#         account_id: str,
#         display_name: str,
#         feed_label: str,
#         content_language: str,
#         countries: list[str] | None = None,
#     ) -> dict:
#         body = {
#             "displayName": display_name,
#             "primaryProductDataSource": {
#                 "feedLabel": feed_label,
#                 "contentLanguage": content_language,
#                 "countries": countries or [feed_label],
#                 "channel": "ONLINE",
#             },
#             "input": "API",
#         }
#         return self._request(
#             "POST",
#             f"{BASE}/datasources/{API_VERSION}/accounts/{account_id}/dataSources",
#             json=body,
#         )

#     # ---- Products ----

#     def insert_product_input(
#         self,
#         account_id: str,
#         data_source_id: str,
#         offer_id: str,
#         content_language: str,
#         feed_label: str,
#         attributes: dict[str, Any],
#     ) -> dict:
#         url = f"{BASE}/products/{API_VERSION}/accounts/{account_id}/productInputs:insert"
#         params = {"dataSource": f"accounts/{account_id}/dataSources/{data_source_id}"}
#         body = {
#             "offerId": offer_id,
#             "contentLanguage": content_language,
#             "feedLabel": feed_label,
#             "productAttributes": attributes,
#         }
#         return self._request("POST", url, params=params, json=body)

#     def delete_product_input(
#         self,
#         account_id: str,
#         offer_id: str,
#         content_language: str,
#         feed_label: str,
#         data_source_id: str,
#     ) -> None:
#         name = f"{content_language}~{feed_label}~{offer_id}"
#         url = f"{BASE}/products/{API_VERSION}/accounts/{account_id}/productInputs/{name}"
#         params = {"dataSource": f"accounts/{account_id}/dataSources/{data_source_id}"}
#         self._request("DELETE", url, params=params)

#     def list_products(
#         self, account_id: str, page_token: str | None = None, page_size: int = 250
#     ) -> dict:
#         url = f"{BASE}/products/{API_VERSION}/accounts/{account_id}/products"
#         params = {"pageSize": page_size}
#         if page_token:
#             params["pageToken"] = page_token
#         return self._request("GET", url, params=params)

#     def get_product(self, account_id: str, product_name: str) -> dict:
#         return self._request(
#             "GET",
#             f"{BASE}/products/{API_VERSION}/accounts/{account_id}/products/{product_name}",
#         )

#     # ---- Notifications ----

#     def create_subscription(
#         self,
#         account_id: str,
#         callback_uri: str,
#         event_type: str = "PRODUCT_STATUS_CHANGE",
#         target_account_id: str | None = None,
#     ) -> dict:
#         url = f"{BASE}/notifications/{API_VERSION}/accounts/{account_id}/notificationsubscriptions"
#         target = target_account_id or account_id
#         body = {
#             "registeredEvent": event_type,
#             "targetAccount": f"accounts/{target}",
#             "callBackUri": callback_uri,
#         }
#         return self._request("POST", url, json=body)

#     def list_subscriptions(self, account_id: str) -> dict:
#         return self._request(
#             "GET",
#             f"{BASE}/notifications/{API_VERSION}/accounts/{account_id}/notificationsubscriptions",
#         )

#     def delete_subscription(self, account_id: str, subscription_id: str) -> None:
#         self._request(
#             "DELETE",
#             f"{BASE}/notifications/{API_VERSION}/accounts/{account_id}"
#             f"/notificationsubscriptions/{subscription_id}",
#         )

#     # ---- Reports ----

#     def search_disapproved(self, account_id: str) -> dict:
#         url = f"{BASE}/reports/{API_VERSION}/accounts/{account_id}/reports:search"
#         body = {
#             "query": (
#                 "SELECT offer_id, id, title, "
#                 "aggregated_reporting_context_status "
#                 "FROM product_view "
#                 'WHERE aggregated_reporting_context_status = "NOT_ELIGIBLE_OR_DISAPPROVED"'
#             )
#         }
#         return self._request("POST", url, json=body)



"""
Google Merchant API client — auth-agnostic.

Accepts either:
  - Service account credentials (a JSON dict with type='service_account'), OR
  - A callable returning a valid OAuth bearer token (e.g. admin OAuth token)

Same API surface either way — caller doesn't care which auth is in use.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional, Union

import google.auth.transport.requests as gauth_requests
import requests
from google.oauth2 import service_account

log = logging.getLogger("gmc.client")

BASE = "https://merchantapi.googleapis.com"
SCOPES = ["https://www.googleapis.com/auth/content"]

# v1beta was shut down Feb 28, 2026 — v1 is the only supported version now.
# v1 requires GCP registration per MC account (see google_auth.register_gcp_for_account).
API_VERSION = "v1"

# Type alias: either a callable that returns a fresh bearer token, or raw creds
TokenProvider = Callable[[], str]


class GMCError(Exception):
    """Raised on any GMC API error. Surfaces Google's error details."""

    def __init__(self, status: int, code: str, message: str, raw: dict | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.raw = raw or {}
        super().__init__(f"[{status} {code}] {message}")


class GMCClient:
    def __init__(
        self,
        credentials_json: Optional[dict] = None,
        token_provider: Optional[TokenProvider] = None,
    ):
        """
        Pass exactly one of:
          - credentials_json: service account key dict
          - token_provider:   callable returning a valid OAuth access token
        """
        if bool(credentials_json) == bool(token_provider):
            raise GMCError(
                400, "INVALID_AUTH",
                "GMCClient requires exactly one of credentials_json or token_provider",
            )

        self._sa_creds = None
        self._token_provider = token_provider

        if credentials_json is not None:
            try:
                self._sa_creds = service_account.Credentials.from_service_account_info(
                    credentials_json, scopes=SCOPES
                )
            except Exception as e:
                raise GMCError(
                    400, "INVALID_CREDENTIALS",
                    f"Credentials JSON is not a valid service account key: {e}",
                )

    @classmethod
    def from_service_account(cls, credentials_json: dict) -> "GMCClient":
        return cls(credentials_json=credentials_json)

    @classmethod
    def from_token_provider(cls, token_provider: TokenProvider) -> "GMCClient":
        """Use with the admin OAuth token — pass a callable that returns a fresh token."""
        return cls(token_provider=token_provider)

    # ---- internals ----

    def _token(self) -> str:
        if self._token_provider is not None:
            return self._token_provider()
        # Service account path
        if not self._sa_creds.valid:
            self._sa_creds.refresh(gauth_requests.Request())
        return self._sa_creds.token

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token()}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, url: str, **kw) -> dict:
        r = requests.request(method, url, headers=self._headers(), timeout=60, **kw)
        if r.status_code >= 400:
            try:
                err = r.json().get("error", {})
            except Exception:
                err = {}
            raise GMCError(
                status=r.status_code,
                code=err.get("status", "UNKNOWN"),
                message=err.get("message", r.text[:300]),
                raw=err,
            )
        if r.status_code == 204 or not r.content:
            return {}
        return r.json()

    # ---- Account info ----

    def get_account(self, account_id: str) -> dict:
        return self._request(
            "GET", f"{BASE}/accounts/{API_VERSION}/accounts/{account_id}"
        )

    def list_accounts(self, page_token: str | None = None, page_size: int = 250) -> dict:
        """List all accounts accessible to this auth. Only works with OAuth, not SA."""
        params = {"pageSize": page_size}
        if page_token:
            params["pageToken"] = page_token
        return self._request(
            "GET", f"{BASE}/accounts/{API_VERSION}/accounts", params=params
        )

    def list_sub_accounts(self, advanced_account_id: str) -> dict:
        """List sub-accounts under an MCA. May not work on non-MCA accounts (returns empty)."""
        try:
            return self._request(
                "GET",
                f"{BASE}/accounts/{API_VERSION}/accounts/{advanced_account_id}:listSubaccounts",
            )
        except GMCError:
            return {"accounts": []}

    # ---- Data sources ----

    def list_data_sources(self, account_id: str) -> dict:
        try:
            return self._request(
                "GET",
                f"{BASE}/datasources/{API_VERSION}/accounts/{account_id}/dataSources",
            )
        except GMCError:
            return {"dataSources": []}

    def create_primary_api_data_source(
        self,
        account_id: str,
        display_name: str,
        feed_label: str,
        content_language: str,
        countries: list[str] | None = None,
    ) -> dict:
        body = {
            "displayName": display_name,
            "primaryProductDataSource": {
                "feedLabel": feed_label,
                "contentLanguage": content_language,
                "countries": countries or [feed_label],
                "channel": "ONLINE",
            },
            "input": "API",
        }
        return self._request(
            "POST",
            f"{BASE}/datasources/{API_VERSION}/accounts/{account_id}/dataSources",
            json=body,
        )

    # ---- Products ----

    def insert_product_input(
        self,
        account_id: str,
        data_source_id: str,
        offer_id: str,
        content_language: str,
        feed_label: str,
        attributes: dict[str, Any],
    ) -> dict:
        url = f"{BASE}/products/{API_VERSION}/accounts/{account_id}/productInputs:insert"
        params = {"dataSource": f"accounts/{account_id}/dataSources/{data_source_id}"}
        body = {
            "offerId": offer_id,
            "contentLanguage": content_language,
            "feedLabel": feed_label,
            "productAttributes": attributes,
        }
        return self._request("POST", url, params=params, json=body)

    def delete_product_input(
        self,
        account_id: str,
        offer_id: str,
        content_language: str,
        feed_label: str,
        data_source_id: str,
    ) -> None:
        name = f"{content_language}~{feed_label}~{offer_id}"
        url = f"{BASE}/products/{API_VERSION}/accounts/{account_id}/productInputs/{name}"
        params = {"dataSource": f"accounts/{account_id}/dataSources/{data_source_id}"}
        self._request("DELETE", url, params=params)

    def list_products(
        self, account_id: str, page_token: str | None = None, page_size: int = 250
    ) -> dict:
        url = f"{BASE}/products/{API_VERSION}/accounts/{account_id}/products"
        params = {"pageSize": page_size}
        if page_token:
            params["pageToken"] = page_token
        return self._request("GET", url, params=params)

    def get_product(self, account_id: str, product_name: str) -> dict:
        return self._request(
            "GET",
            f"{BASE}/products/{API_VERSION}/accounts/{account_id}/products/{product_name}",
        )

    # ---- Notifications ----

    def create_subscription(
        self,
        account_id: str,
        callback_uri: str,
        event_type: str = "PRODUCT_STATUS_CHANGE",
        target_account_id: str | None = None,
    ) -> dict:
        url = f"{BASE}/notifications/{API_VERSION}/accounts/{account_id}/notificationsubscriptions"
        target = target_account_id or account_id
        body = {
            "registeredEvent": event_type,
            "targetAccount": f"accounts/{target}",
            "callBackUri": callback_uri,
        }
        return self._request("POST", url, json=body)

    def list_subscriptions(self, account_id: str) -> dict:
        return self._request(
            "GET",
            f"{BASE}/notifications/{API_VERSION}/accounts/{account_id}/notificationsubscriptions",
        )

    def delete_subscription(self, account_id: str, subscription_id: str) -> None:
        self._request(
            "DELETE",
            f"{BASE}/notifications/{API_VERSION}/accounts/{account_id}"
            f"/notificationsubscriptions/{subscription_id}",
        )

    # ---- Reports ----

    def search_disapproved(self, account_id: str) -> dict:
        url = f"{BASE}/reports/{API_VERSION}/accounts/{account_id}/reports:search"
        body = {
            "query": (
                "SELECT offer_id, id, title, "
                "aggregated_reporting_context_status "
                "FROM product_view "
                'WHERE aggregated_reporting_context_status = "NOT_ELIGIBLE_OR_DISAPPROVED"'
            )
        }
        return self._request("POST", url, json=body)

    # ---- Health check ----

    def can_read_account(self, account_id: str) -> tuple[bool, str]:
        """
        Lightweight test: can this client actually read this account?
        Returns (ok, reason). Used by the audit endpoint.
        """
        try:
            self.get_account(account_id)
            return True, "ok"
        except GMCError as e:
            return False, f"{e.code}: {e.message[:100]}"