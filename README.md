# GMC Dashboard

Full-stack dashboard for managing products across multiple Google Merchant
Center accounts, built on **Merchant API v1** (v1beta was shut down Feb 28, 2026).

```
gmc-dashboard/
├── backend/       FastAPI + SQLAlchemy + Celery · Merchant API v1 client
└── frontend/      Vite + React + Tailwind dashboard
```

## Quick start

**Frontend** (runs at http://localhost:5173):
```bash
cd frontend
npm install
npm run dev
```

**Backend** (runs at http://localhost:8000):
```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://USER:PASS@HOST/gmc?sslmode=require"
export REDIS_URL="redis://localhost:6379/0"
uvicorn app.main:app --reload --port 8000
```

The Vite dev server proxies `/api/*` → `:8000`, so the two run side by side
with no CORS config needed.

## Features

- Multi-account product management (`productInputs.insert` / `delete`)
- Push notification receiver at `POST /webhooks/gmc` for
  `PRODUCT_STATUS_CHANGE` events
- Live event feed in the UI (swap mock data for SSE or polling against `/events`)
- Account-level approval-rate breakdown
- Disapproval issue tracking via `reports:search` on `product_view`

See `backend/README.md` and `frontend/README.md` for details.
"# merchant-dash" 
