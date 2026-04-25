# GMC Dashboard — Frontend

Vite + React + Tailwind dashboard for managing products and approval status
across multiple Google Merchant Center accounts.

## Run

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:5173. Dev server proxies `/api/*` → `http://localhost:8000`
so if you run the FastAPI backend on `:8000`, calls like `fetch('/api/products')`
will hit it directly with no CORS headache.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build
```

## Wiring to the real backend

The dashboard currently uses mock data at the top of `src/App.jsx`
(`ACCOUNTS`, `PRODUCTS`, `INITIAL_EVENTS`). Swap those for real calls:

```js
const { data: accounts } = useFetch('/api/accounts');
const { data: products } = useFetch('/api/products?account_id=' + selectedAccount);
const { data: events }   = useFetch('/api/events?limit=40');
```

For the live event feed, either long-poll `/api/events`, or add an SSE
endpoint on the backend and switch the `useEffect` in `App.jsx` to an
`EventSource` subscription.
