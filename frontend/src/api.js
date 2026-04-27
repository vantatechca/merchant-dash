// /**
//  * Backend API client.
//  * Vite proxies /api/* → http://localhost:8000 (see vite.config.js)
//  */

// const BASE = '/api';

// async function request(path, options = {}) {
//   const res = await fetch(`${BASE}${path}`, {
//     headers: { 'Content-Type': 'application/json' },
//     ...options,
//   });
//   if (!res.ok) {
//     let msg = `HTTP ${res.status}`;
//     try {
//       const body = await res.json();
//       msg = body.error?.message || body.detail || msg;
//     } catch {}
//     throw new Error(msg);
//   }
//   if (res.status === 204) return null;
//   return res.json();
// }

// export const api = {
//   // accounts
//   listAccounts:    ()        => request('/accounts'),
//   addAccount:      (body)    => request('/accounts', { method: 'POST', body: JSON.stringify(body) }),
//   testAccount:     (id)      => request(`/accounts/${id}/test`),
//   deleteAccount:   (id)      => request(`/accounts/${id}`, { method: 'DELETE' }),

//   // data sources
//   listDataSources: (id)      => request(`/accounts/${id}/datasources`),
//   createDataSource:(body)    => request('/datasources', { method: 'POST', body: JSON.stringify(body) }),

//   // products
//   listProducts:    (params = {}) => {
//     const qs = new URLSearchParams(
//       Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')
//     ).toString();
//     return request(`/products${qs ? '?' + qs : ''}`);
//   },
//   addProduct:      (body)    => request('/products', { method: 'POST', body: JSON.stringify(body) }),
//   // force=true bypasses the server-side cooldown (for the manual "Sync now" button).
//   // force=false (default) respects the cooldown so autosync doesn't hammer GMC.
//   syncAccount:     (id, force = false) =>
//     request(`/products/sync/${id}${force ? '?force=true' : ''}`, { method: 'POST' }),
//   deleteProduct:   (id)      => request(`/products/${id}`, { method: 'DELETE' }),

//   // stats & events
//   stats:           (accountId) => request(`/stats${accountId ? '?account_id=' + accountId : ''}`),
//   events:          (accountId, limit = 40) => {
//     const qs = new URLSearchParams({ limit });
//     if (accountId) qs.set('account_id', accountId);
//     return request(`/events?${qs}`);
//   },

//   // subscriptions
//   subscribe:       (body)    => request('/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
//   listSubscriptions:(id)     => request(`/accounts/${id}/subscriptions`),

//   health:          ()        => request('/health'),
// };















/**
 * Backend API client.
 * Vite proxies /api/* → http://localhost:8000 (see vite.config.js)
 */

const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',                         // ← session cookie on every call
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error?.message || body.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // auth
  me:              ()        => request('/auth/me'),
  login:           (email, password, remember) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    }),
  logout:          ()        => request('/auth/logout', { method: 'POST' }),

  // accounts
  listAccounts:    ()        => request('/accounts'),
  addAccount:      (body)    => request('/accounts', { method: 'POST', body: JSON.stringify(body) }),
  testAccount:     (id)      => request(`/accounts/${id}/test`),
  deleteAccount:   (id)      => request(`/accounts/${id}`, { method: 'DELETE' }),

  // data sources
  listDataSources: (id)      => request(`/accounts/${id}/datasources`),
  createDataSource:(body)    => request('/datasources', { method: 'POST', body: JSON.stringify(body) }),

  // products
  listProducts:    (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')
    ).toString();
    return request(`/products${qs ? '?' + qs : ''}`);
  },
  addProduct:      (body)    => request('/products', { method: 'POST', body: JSON.stringify(body) }),
  // force=true bypasses the server-side cooldown (for the manual "Sync now" button).
  // force=false (default) respects the cooldown so autosync doesn't hammer GMC.
  syncAccount:     (id, force = false) =>
    request(`/products/sync/${id}${force ? '?force=true' : ''}`, { method: 'POST' }),
  deleteProduct:   (id)      => request(`/products/${id}`, { method: 'DELETE' }),

  // stats & events
  stats:           (accountId) => request(`/stats${accountId ? '?account_id=' + accountId : ''}`),
  events:          (accountId, limit = 40) => {
    const qs = new URLSearchParams({ limit });
    if (accountId) qs.set('account_id', accountId);
    return request(`/events?${qs}`);
  },

  // subscriptions
  subscribe:       (body)    => request('/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  listSubscriptions:(id)     => request(`/accounts/${id}/subscriptions`),

  health:          ()        => request('/health'),
};