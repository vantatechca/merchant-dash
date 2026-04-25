// import { useState, useEffect, useCallback, useRef } from 'react';
// import { api } from './api';

// /** Generic fetch-on-mount hook with manual refresh. */
// export function useFetch(fn, deps = []) {
//   const [data, setData] = useState(null);
//   const [error, setError] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const fnRef = useRef(fn);
//   fnRef.current = fn;

//   const run = useCallback(async () => {
//     setData(null);          // ← clear stale data while the next request is in flight
//     setLoading(true);
//     setError(null);
//     try {
//       const result = await fnRef.current();
//       setData(result);
//     } catch (e) {
//       setError(e.message || 'Request failed');
//     } finally {
//       setLoading(false);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, deps);

//   useEffect(() => { run(); }, [run]);

//   return { data, error, loading, refresh: run };
// }

// export function useAccounts() {
//   return useFetch(() => api.listAccounts(), []);
// }

// export function useProducts(accountId, statusFilter) {
//   return useFetch(
//     () => api.listProducts({
//       account_id: accountId === 'all' ? undefined : accountId,
//       status_filter: statusFilter === 'all' ? undefined : statusFilter,
//       limit: 200,
//     }),
//     [accountId, statusFilter],
//   );
// }

// export function useStats(accountId) {
//   return useFetch(
//     () => api.stats(accountId === 'all' ? undefined : accountId),
//     [accountId],
//   );
// }

// /** Live-polling events (fallback when no SSE). Polls every 4s. */
// export function useEvents(accountId, pollMs = 4000) {
//   const [events, setEvents] = useState([]);
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     setEvents([]);          // ← clear stale events when switching accounts
//     let cancelled = false;
//     const poll = async () => {
//       try {
//         const acct = accountId === 'all' ? undefined : accountId;
//         const data = await api.events(acct, 40);
//         if (!cancelled) setEvents(data || []);
//       } catch (e) {
//         if (!cancelled) setError(e.message);
//       }
//     };
//     poll();
//     const i = setInterval(poll, pollMs);
//     return () => { cancelled = true; clearInterval(i); };
//   }, [accountId, pollMs]);

//   return { events, error };
// }


import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * useFetch — data hook with silent background refresh.
 *
 * Key behaviors that prevent the "page reload" flash:
 *   • `loading` is only true on the FIRST load. Background refreshes don't
 *     flip it, so any component reading `loading` stays put.
 *   • `setData` is skipped when the new result is structurally identical
 *     to the current data. No identical-but-new-reference updates = no
 *     unnecessary re-renders downstream.
 *   • In-flight requests are tracked so overlapping refreshes can't stomp
 *     each other.
 */
export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Track whether we've ever successfully loaded. If yes, future refreshes
  // are "silent" and don't flip `loading`.
  const hasLoadedRef = useRef(false);
  const lastJsonRef = useRef(null);
  const inFlightRef = useRef(false);

  const run = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    // Only show loading state on the very first fetch.
    if (!hasLoadedRef.current) setLoading(true);

    try {
      const result = await fnRef.current();

      // Skip the state update if nothing changed. This is the single most
      // important line for preventing flicker — identical API responses
      // (common when polling) become no-ops.
      const nextJson = safeStringify(result);
      if (nextJson !== lastJsonRef.current) {
        lastJsonRef.current = nextJson;
        setData(result);
      }

      if (error) setError(null);
      hasLoadedRef.current = true;
    } catch (e) {
      // Don't clear existing data on a transient error — keep showing
      // the last-known-good snapshot. Only surface the error if we've
      // never successfully loaded.
      if (!hasLoadedRef.current) setError(e.message || 'Request failed');
      else console.warn('[useFetch] silent refresh failed:', e?.message || e);
    } finally {
      if (!hasLoadedRef.current) setLoading(false);
      else if (loading) setLoading(false);
      inFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    // When deps change (e.g. account switch), reset so the loading
    // indicator shows appropriately for the new context.
    hasLoadedRef.current = false;
    lastJsonRef.current = null;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return { data, error, loading, refresh: run };
}

// JSON.stringify can throw on circular refs; guard it.
function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return Math.random().toString(); }
}

export function useAccounts() {
  return useFetch(() => api.listAccounts(), []);
}

export function useProducts(accountId, statusFilter) {
  return useFetch(
    () => api.listProducts({
      account_id: accountId === 'all' ? undefined : accountId,
      status_filter: statusFilter === 'all' ? undefined : statusFilter,
      limit: 200,
    }),
    [accountId, statusFilter],
  );
}

export function useStats(accountId) {
  return useFetch(
    () => api.stats(accountId === 'all' ? undefined : accountId),
    [accountId],
  );
}

/**
 * useEvents — polls /events every `pollMs` milliseconds.
 *
 * Uses the same "skip identical updates" trick so idle periods (no new
 * webhook events) produce zero re-renders of the whole app.
 */
export function useEvents(accountId, pollMs = 4000) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const lastJsonRef = useRef('[]');
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    lastJsonRef.current = '[]';

    const poll = async () => {
      if (inFlightRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      inFlightRef.current = true;
      try {
        const acct = accountId === 'all' ? undefined : accountId;
        const data = await api.events(acct, 40);
        if (cancelled) return;
        const nextJson = safeStringify(data || []);
        if (nextJson !== lastJsonRef.current) {
          lastJsonRef.current = nextJson;
          setEvents(data || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        inFlightRef.current = false;
      }
    };

    poll();
    const i = setInterval(poll, pollMs);
    return () => { cancelled = true; clearInterval(i); };
  }, [accountId, pollMs]);

  return { events, error };
}