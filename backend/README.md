# GMC Dashboard — Backend

FastAPI service for managing products across multiple Google Merchant Center accounts,
built on Merchant API **v1** (v1beta was shut down Feb 28, 2026).

## What it does

- **Multi-account** product management (600+ stores across Merchant Centers)
- `productInputs.insert` / `delete` wired to the v1 Products sub-API
- **Push notification receiver** at `POST /webhooks/gmc` — decodes the
  base64 Pub/Sub envelope and flips local product status on
  `PRODUCT_STATUS_CHANGE` events
- Background sync via Celery to reconcile local cache against GMC
- Aggregated stats endpoint for dashboard overview

## Auth

GMC API does **not** use a flat API key — it's OAuth 2.0 with scope
`https://www.googleapis.com/auth/content`. Easiest path for server-to-server:

1. Create a GCP project; enable **Merchant API**.
2. Create a **service account**, download the JSON key.
3. In Merchant Center → Settings → Linked accounts → Google Cloud project →
   link the GCP project and grant the service account access.
4. POST the JSON to `/accounts` (stored in `merchant_accounts.credentials_json`).

Per account: one **primary data source** of type `API` is required before you can
insert products (file-type sources are read-only via API).

## Running

```bash
pip install -r requirements.txt

export DATABASE_URL="postgresql+asyncpg://USER:PASS@HOST/gmc?sslmode=require"
export REDIS_URL="redis://localhost:6379/0"

# API
uvicorn app.main:app --reload --port 8000

# Workers
celery -A app.tasks.celery worker -l info
```

## Webhook setup

Your webhook URL must be HTTPS with a valid cert. Typical flow:

```bash
curl -X POST http://localhost:8000/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "1234567890",
    "callback_uri": "https://gmc.yourdomain.com/webhooks/gmc",
    "event_type": "PRODUCT_STATUS_CHANGE"
  }'
```

Google recommends a unique callback URI per advanced account per event type —
wire this through your Cloudflare Worker router if you want one domain fan-out.

## Endpoints

| Method | Path                           | Purpose                                    |
| ------ | ------------------------------ | ------------------------------------------ |
| GET    | `/accounts`                    | List merchant accounts                     |
| POST   | `/accounts`                    | Register an account + service-account JSON |
| GET    | `/products`                    | List (filter by account, status)           |
| POST   | `/products`                    | Insert a product via GMC API               |
| DELETE | `/products/{id}`               | Remove from GMC + local cache              |
| POST   | `/products/sync/{account_id}`  | Queue full sync                            |
| POST   | `/subscriptions`               | Register GMC push notification subscription|
| POST   | `/webhooks/gmc`                | Receive status-change pushes from GMC      |
| GET    | `/events`                      | Recent notification events                 |
| GET    | `/stats`                       | Approved/pending/disapproved counts        |

## Notes for your setup

- For **600+ stores** you'll want per-account Celery queues and a rate limiter
  in front of `gmc_client` (GMC API quotas are per project — get them raised).
- Status transitions `"" → pending → approved|disapproved` arrive on the
  webhook — use `eventTime`, not receipt order, when reconciling.
- Peptide category: item-level disapprovals on this vertical tend to cluster
  around `image_link`, `description`, and destination-specific policies. The
  `itemLevelIssues` array in the processed product has the full reason codes.
