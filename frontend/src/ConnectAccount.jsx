// import { useState, useEffect } from 'react';
// import {
//   X, CheckCircle2, AlertCircle, Loader2, ArrowRight,
//   ExternalLink, LogIn, Store,
// } from 'lucide-react';
// import { api } from './api';

// export default function ConnectAccount({ onClose, onSuccess }) {
//   const [step, setStep]             = useState('signin');  // 'signin' | 'pick'
//   const [signedInEmail, setEmail]   = useState(null);
//   const [loading, setLoading]       = useState(false);
//   const [result, setResult]         = useState(null);
//   const [accounts, setAccounts]     = useState([]);
//   const [adding, setAdding]         = useState({});        // {account_id: boolean}

//   // Listen for the OAuth popup to post back
//   useEffect(() => {
//     const handler = (ev) => {
//       if (ev.data?.type !== 'oauth_result') return;
//       if (ev.data.ok && ev.data.email) {
//         setEmail(ev.data.email);
//         setStep('pick');
//         loadAccounts(ev.data.email);
//       } else {
//         setResult({ ok: false, message: ev.data.message || 'Sign-in failed' });
//       }
//     };
//     window.addEventListener('message', handler);
//     return () => window.removeEventListener('message', handler);
//   }, []);

//   const startSignIn = () => {
//     setResult(null);
//     const w = 500, h = 650;
//     const left = window.screen.width / 2 - w / 2;
//     const top = window.screen.height / 2 - h / 2;
//     window.open(
//       `/api/oauth/start`,
//       'google-oauth',
//       `width=${w},height=${h},left=${left},top=${top}`,
//     );
//   };

//   const loadAccounts = async (email) => {
//     setLoading(true);
//     try {
//       const list = await fetch(`/api/oauth/merchant-accounts/${encodeURIComponent(email)}`)
//         .then(r => r.ok ? r.json() : Promise.reject(r));
//       setAccounts(list);
//       if (list.length === 0) {
//         setResult({
//           ok: false,
//           message: 'No Merchant Center accounts found on this Google account.',
//         });
//       }
//     } catch (e) {
//       const msg = e.statusText || (await e.text?.()) || 'Failed to load accounts';
//       setResult({ ok: false, message: `${msg}` });
//     } finally {
//       setLoading(false);
//     }
//   };

//   const addAccount = async (a) => {
//     setAdding((s) => ({ ...s, [a.account_id]: true }));
//     try {
//       await fetch(`/api/oauth/connect`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           email:        signedInEmail,
//           account_id:   a.account_id,
//           display_name: a.account_name || `Merchant ${a.account_id}`,
//         }),
//       }).then(r => r.ok ? r.json() : Promise.reject(r));
//       setAdding((s) => ({ ...s, [a.account_id]: 'done' }));
//     } catch (e) {
//       setAdding((s) => ({ ...s, [a.account_id]: 'error' }));
//     }
//   };

//   return (
//     <div
//       className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-50 flex items-center justify-center p-6"
//       onClick={onClose}
//     >
//       <div
//         className="bg-paper border border-line w-full max-w-xl rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
//         onClick={(e) => e.stopPropagation()}
//       >
//         <div className="flex items-start justify-between px-7 py-5 border-b border-line bg-cream/50">
//           <div>
//             <h3 className="serif text-2xl text-ink">
//               Connect <span className="italic font-light text-forest">Merchant Center</span>
//             </h3>
//             <div className="mono text-[10px] text-ink-mute mt-1.5 uppercase tracking-wide">
//               {step === 'signin'
//                 ? 'Sign in with the Google account that owns your store'
//                 : `Signed in as ${signedInEmail}`}
//             </div>
//           </div>
//           <button
//             onClick={onClose}
//             className="w-8 h-8 flex items-center justify-center text-ink-mute hover:text-ink hover:bg-paper rounded-md transition"
//           >
//             <X className="w-4 h-4" />
//           </button>
//         </div>

//         <div className="flex-1 overflow-y-auto">
//           {step === 'signin' && (
//             <div className="p-8">
//               <div className="text-center py-6">
//                 <div className="w-14 h-14 bg-forest rounded-full mx-auto flex items-center justify-center mb-5">
//                   <LogIn className="w-6 h-6 text-paper" />
//                 </div>
//                 <h4 className="serif text-xl text-ink mb-2">Sign in with Google</h4>
//                 <p className="text-sm text-ink-body max-w-sm mx-auto mb-6">
//                   Use your Gmail account that manages the Merchant Center store
//                   you want to monitor. We'll request read-access to your product data.
//                 </p>
//                 <button
//                   onClick={startSignIn}
//                   className="inline-flex items-center gap-3 bg-white border border-line hover:border-ink-mute px-5 py-2.5 rounded-md text-sm font-medium text-ink transition shadow-sm"
//                 >
//                   <GoogleG />
//                   Sign in with Google
//                 </button>
//               </div>
//               <div className="mt-6 p-4 bg-cream/40 border border-line rounded-md text-xs text-ink-body leading-relaxed">
//                 <b>What you'll see:</b> Google will open a popup, show your accounts,
//                 and ask you to allow "Merchant Center" access. After you click Allow,
//                 you'll pick which stores to monitor.
//               </div>
//             </div>
//           )}

//           {step === 'pick' && (
//             <div className="p-7">
//               <div className="mono text-[10px] tracking-[0.18em] text-ink-mute uppercase mb-3">
//                 Available Merchant Centers
//               </div>
//               {loading && (
//                 <div className="flex items-center gap-2 text-ink-body py-4">
//                   <Loader2 className="w-4 h-4 animate-spin" />
//                   Loading your accounts…
//                 </div>
//               )}
//               {!loading && accounts.length > 0 && (
//                 <div className="space-y-2">
//                   {accounts.map(a => {
//                     const state = adding[a.account_id];
//                     return (
//                       <div
//                         key={a.account_id}
//                         className="flex items-center justify-between gap-3 p-3 bg-white border border-line rounded-md"
//                       >
//                         <div className="flex items-center gap-3 min-w-0">
//                           <div className="w-8 h-8 bg-cream rounded-md flex items-center justify-center flex-shrink-0">
//                             <Store className="w-4 h-4 text-ink-mute" />
//                           </div>
//                           <div className="min-w-0">
//                             <div className="text-sm text-ink truncate">
//                               {a.account_name || `Merchant ${a.account_id}`}
//                             </div>
//                             <div className="mono text-[10px] text-ink-mute">
//                               {a.account_id}
//                             </div>
//                           </div>
//                         </div>
//                         {state === 'done' ? (
//                           <span className="mono text-[10px] text-emerald-700 uppercase tracking-wide flex items-center gap-1">
//                             <CheckCircle2 className="w-3.5 h-3.5" />
//                             Added
//                           </span>
//                         ) : state === 'error' ? (
//                           <span className="mono text-[10px] text-rose-700 uppercase tracking-wide">
//                             Failed
//                           </span>
//                         ) : (
//                           <button
//                             onClick={() => addAccount(a)}
//                             disabled={state === true}
//                             className="text-xs px-3 py-1.5 bg-forest text-paper hover:bg-forest-dark rounded-md disabled:opacity-50 flex items-center gap-1.5"
//                           >
//                             {state === true
//                               ? <Loader2 className="w-3 h-3 animate-spin" />
//                               : <>Add <ArrowRight className="w-3 h-3" /></>}
//                           </button>
//                         )}
//                       </div>
//                     );
//                   })}
//                 </div>
//               )}
//               {!loading && accounts.length === 0 && !result && (
//                 <div className="text-center py-10 text-sm text-ink-body">
//                   Loading…
//                 </div>
//               )}
//             </div>
//           )}
//         </div>

//         {result && (
//           <div
//             className={`px-7 py-3 border-t flex items-center gap-2 ${
//               result.ok
//                 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
//                 : 'border-rose-200 bg-rose-50 text-rose-800'
//             }`}
//           >
//             {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
//             <span className="text-sm">{result.message}</span>
//           </div>
//         )}

//         <div className="flex justify-between items-center gap-2 px-7 py-4 border-t border-line bg-cream/30">
//           <a
//             href="https://support.google.com/merchants/answer/188467"
//             target="_blank"
//             rel="noreferrer"
//             className="inline-flex items-center gap-1 mono text-[10px] text-ink-mute hover:text-ink uppercase tracking-wide"
//           >
//             <ExternalLink className="w-3 h-3" /> Merchant Center help
//           </a>
//           <button
//             onClick={() => {
//               if (step === 'pick' && Object.values(adding).includes('done')) onSuccess?.();
//               onClose();
//             }}
//             className="text-sm px-4 py-2 text-ink-body hover:text-ink rounded-md transition"
//           >
//             {step === 'pick' && Object.values(adding).includes('done') ? 'Done' : 'Close'}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }

// function GoogleG() {
//   return (
//     <svg width="18" height="18" viewBox="0 0 48 48">
//       <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
//       <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
//       <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
//       <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
//       <path fill="none" d="M0 0h48v48H0z"/>
//     </svg>
//   );
// }




import { useState, useEffect, useMemo } from 'react';
import {
  X, CheckCircle2, AlertCircle, Loader2, ArrowRight,
  ExternalLink, LogIn, Store, Search, Shield, RefreshCw,
  Plus, Trash2,
} from 'lucide-react';

export default function ConnectAccount({ onClose, onSuccess }) {
  // admin connection status
  const [adminStatus, setAdminStatus] = useState({ loading: true, connected: false, email: null });
  // accounts already in DB (source of truth for monitored)
  const [monitored, setMonitored]     = useState([]);
  const [monitoredLoading, setMonLoad] = useState(true);
  // accounts accessible via admin token (source of truth for discovery)
  const [accessible, setAccessible]   = useState([]);
  const [accessLoading, setAccLoad]   = useState(false);
  const [accessError, setAccessError] = useState(null);
  // ui state
  const [view, setView]               = useState('monitored'); // 'monitored' | 'browse'
  const [query, setQuery]             = useState('');
  const [busy, setBusy]               = useState({});          // { [account_id]: 'adding' | 'removing' | 'done' | 'error' }
  const [banner, setBanner]           = useState(null);        // { ok, message }

  // ---- initial load ----
  useEffect(() => {
    loadAdminStatus();
    loadMonitored();
  }, []);

  // OAuth popup handler (admin sign-in only)
  useEffect(() => {
    const handler = (ev) => {
      if (ev.data?.type !== 'oauth_result') return;
      if (ev.data.ok && ev.data.email) {
        setAdminStatus({ loading: false, connected: true, email: ev.data.email });
        setBanner({ ok: true, message: `Admin connected as ${ev.data.email}` });
        loadAccessible(); // auto-fetch accessible accounts on fresh connect
      } else {
        setBanner({ ok: false, message: ev.data.message || 'Admin sign-in failed' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const loadAdminStatus = async () => {
    try {
      const r = await fetch('/api/oauth/admin/status');
      if (!r.ok) throw r;
      const d = await r.json();
      setAdminStatus({ loading: false, connected: !!d.connected, email: d.email || null });
    } catch {
      setAdminStatus({ loading: false, connected: false, email: null });
    }
  };

  const loadMonitored = async () => {
    setMonLoad(true);
    try {
      const r = await fetch('/api/accounts');
      if (!r.ok) throw r;
      const raw = await r.json();
      // /accounts returns { account_id, display_name, auth_type, total_products, ... }
      // Map to the shape this component expects: { account_id, display_name, via }
      setMonitored(raw.map(a => ({
        account_id:   a.account_id,
        display_name: a.display_name,
        via:          a.auth_type,  // "admin" | "direct" | "service_account"
      })));
    } catch (e) {
      setBanner({ ok: false, message: 'Could not load stored accounts from database' });
    } finally {
      setMonLoad(false);
    }
  };

  const loadAccessible = async () => {
    setAccLoad(true);
    setAccessError(null);
    try {
      const r = await fetch('/api/oauth/admin/accessible');
      if (!r.ok) {
        const body = await r.text();
        throw new Error(body || `HTTP ${r.status}`);
      }
      setAccessible(await r.json());
    } catch (e) {
      setAccessError(e.message || 'Failed to fetch accessible accounts');
    } finally {
      setAccLoad(false);
    }
  };

  const startAdminSignIn = () => {
    setBanner(null);
    const w = 500, h = 650;
    const left = window.screen.width / 2 - w / 2;
    const top  = window.screen.height / 2 - h / 2;
    // Backend /oauth/start doesn't distinguish admin vs user — the promote
    // step is a separate /oauth/admin/promote/{email} call.
    window.open(
      `/api/oauth/start`,
      'google-oauth',
      `width=${w},height=${h},left=${left},top=${top}`,
    );
  };

  const addAccount = async (a) => {
    setBusy((s) => ({ ...s, [a.account_id]: 'adding' }));
    try {
      const r = await fetch('/api/oauth/admin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id:   a.account_id,
          display_name: a.account_name || `Merchant ${a.account_id}`,
        }),
      });
      if (!r.ok) throw r;
      setBusy((s) => ({ ...s, [a.account_id]: 'done' }));
      loadMonitored(); // refresh DB list
    } catch {
      setBusy((s) => ({ ...s, [a.account_id]: 'error' }));
    }
  };

  const removeAccount = async (a) => {
    setBusy((s) => ({ ...s, [a.account_id]: 'removing' }));
    try {
      const r = await fetch(`/api/accounts/${encodeURIComponent(a.account_id)}`, { method: 'DELETE' });
      if (!r.ok) throw r;
      setBusy((s) => { const n = { ...s }; delete n[a.account_id]; return n; });
      loadMonitored();
    } catch {
      setBusy((s) => ({ ...s, [a.account_id]: 'error' }));
    }
  };

  // set of account_ids already monitored, for dimming "Add" in browse view
  const monitoredIds = useMemo(
    () => new Set(monitored.map(m => String(m.account_id))),
    [monitored],
  );

  const filteredMonitored = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return monitored;
    return monitored.filter(a =>
      String(a.account_id).includes(q) ||
      (a.display_name || '').toLowerCase().includes(q),
    );
  }, [monitored, query]);

  const filteredAccessible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accessible;
    return accessible.filter(a =>
      String(a.account_id).includes(q) ||
      (a.account_name || '').toLowerCase().includes(q),
    );
  }, [accessible, query]);

  return (
    <div
      className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-line w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 py-5 border-b border-line bg-cream/50">
          <div>
            <h3 className="serif text-2xl text-ink">
              Manage <span className="italic font-light text-forest">Merchant Centers</span>
            </h3>
            <div className="mono text-[10px] text-ink-mute mt-1.5 uppercase tracking-wide">
              {adminStatus.loading
                ? 'Checking admin connection…'
                : adminStatus.connected
                  ? <>Admin: {adminStatus.email}</>
                  : 'Admin account not connected'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-ink-mute hover:text-ink hover:bg-paper rounded-md transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Admin status strip */}
        <div className="px-7 py-3 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className={`w-4 h-4 flex-shrink-0 ${adminStatus.connected ? 'text-forest' : 'text-ink-mute'}`} />
            <span className="text-sm text-ink-body truncate">
              {adminStatus.connected
                ? 'Shared admin token — accessible via "Add person" in each MC'
                : 'Connect one admin Google account to manage all stores'}
            </span>
          </div>
          <button
            onClick={startAdminSignIn}
            className="flex-shrink-0 text-xs px-3 py-1.5 border border-line hover:border-ink-mute rounded-md flex items-center gap-1.5 bg-white"
          >
            <LogIn className="w-3 h-3" />
            {adminStatus.connected ? 'Re-authorize' : 'Connect admin'}
          </button>
        </div>

        {/* Tabs + search */}
        <div className="px-7 pt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1">
            <TabBtn active={view === 'monitored'} onClick={() => setView('monitored')}>
              Monitored <span className="mono text-[10px] text-ink-mute ml-1">{monitored.length}</span>
            </TabBtn>
            <TabBtn
              active={view === 'browse'}
              onClick={() => {
                setView('browse');
                if (adminStatus.connected && accessible.length === 0 && !accessLoading) loadAccessible();
              }}
              disabled={!adminStatus.connected}
            >
              Browse accessible
              {accessible.length > 0 && <span className="mono text-[10px] text-ink-mute ml-1">{accessible.length}</span>}
            </TabBtn>
          </div>
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or ID…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-line rounded-md focus:outline-none focus:border-forest bg-white"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-4">
          {view === 'monitored' && (
            <>
              {monitoredLoading && <LoadingRow label="Loading stored accounts…" />}
              {!monitoredLoading && filteredMonitored.length === 0 && (
                <EmptyState
                  icon={<Store className="w-5 h-5 text-ink-mute" />}
                  title={query ? 'No matches' : 'No stores monitored yet'}
                  body={query
                    ? 'Try a different search term.'
                    : adminStatus.connected
                      ? 'Switch to "Browse accessible" to add stores from your admin account.'
                      : 'Connect the admin account first, then browse accessible stores to add them here.'}
                />
              )}
              {!monitoredLoading && filteredMonitored.length > 0 && (
                <div className="space-y-2">
                  {filteredMonitored.map(a => (
                    <AccountRow
                      key={a.account_id}
                      name={a.display_name}
                      accountId={a.account_id}
                      subtitle={
                        a.via === 'admin' ? 'via admin token'
                          : a.via === 'direct' ? 'direct OAuth (legacy)'
                          : 'service account'
                      }
                      trailing={
                        busy[a.account_id] === 'removing'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-mute" />
                          : (
                            <button
                              onClick={() => removeAccount(a)}
                              className="mono text-[10px] text-ink-mute hover:text-rose-700 uppercase tracking-wide flex items-center gap-1 px-2 py-1"
                              title="Stop monitoring"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          )
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'browse' && (
            <>
              {!adminStatus.connected && (
                <EmptyState
                  icon={<Shield className="w-5 h-5 text-ink-mute" />}
                  title="Admin account required"
                  body="Connect the admin Google account to list all Merchant Centers it can access."
                />
              )}
              {adminStatus.connected && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="mono text-[10px] tracking-[0.18em] text-ink-mute uppercase">
                      Accessible via admin token
                    </div>
                    <button
                      onClick={loadAccessible}
                      disabled={accessLoading}
                      className="mono text-[10px] text-ink-mute hover:text-ink uppercase tracking-wide flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${accessLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                  {accessLoading && <LoadingRow label="Fetching from Google…" />}
                  {accessError && (
                    <div className="p-3 border border-rose-200 bg-rose-50 text-rose-800 rounded-md text-sm">
                      {accessError}
                    </div>
                  )}
                  {!accessLoading && !accessError && filteredAccessible.length === 0 && (
                    <EmptyState
                      icon={<Store className="w-5 h-5 text-ink-mute" />}
                      title={query ? 'No matches' : 'No accessible accounts'}
                      body={query
                        ? 'Try a different search term.'
                        : 'This admin has not been added to any Merchant Centers yet. Use "Add person" inside each store\'s MC settings.'}
                    />
                  )}
                  {!accessLoading && filteredAccessible.length > 0 && (
                    <div className="space-y-2">
                      {filteredAccessible.map(a => {
                        const already = monitoredIds.has(String(a.account_id));
                        const state = busy[a.account_id];
                        return (
                          <AccountRow
                            key={a.account_id}
                            name={a.account_name}
                            accountId={a.account_id}
                            subtitle={a.is_mca ? 'MCA parent' : a.parent_id ? `sub of ${a.parent_id}` : undefined}
                            trailing={
                              already || state === 'done'
                                ? (
                                  <span className="mono text-[10px] text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Monitored
                                  </span>
                                )
                                : state === 'error'
                                  ? <span className="mono text-[10px] text-rose-700 uppercase tracking-wide">Failed</span>
                                  : (
                                    <button
                                      onClick={() => addAccount(a)}
                                      disabled={state === 'adding'}
                                      className="text-xs px-3 py-1.5 bg-forest text-paper hover:bg-forest-dark rounded-md disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                      {state === 'adding'
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <><Plus className="w-3 h-3" /> Add</>}
                                    </button>
                                  )
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Banner */}
        {banner && (
          <div
            className={`px-7 py-3 border-t flex items-center gap-2 ${
              banner.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {banner.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm">{banner.message}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-7 py-4 border-t border-line bg-cream/30">
          <a
            href="https://support.google.com/merchants/answer/188467"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mono text-[10px] text-ink-mute hover:text-ink uppercase tracking-wide"
          >
            <ExternalLink className="w-3 h-3" /> "Add person" guide
          </a>
          <button
            onClick={() => { onSuccess?.(); onClose(); }}
            className="text-sm px-4 py-2 text-ink-body hover:text-ink rounded-md transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function TabBtn({ active, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-1.5 rounded-md transition ${
        active
          ? 'bg-ink text-paper'
          : disabled
            ? 'text-ink-mute/50 cursor-not-allowed'
            : 'text-ink-body hover:bg-cream'
      }`}
    >
      {children}
    </button>
  );
}

function AccountRow({ name, accountId, subtitle, trailing }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-white border border-line rounded-md">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 bg-cream rounded-md flex items-center justify-center flex-shrink-0">
          <Store className="w-4 h-4 text-ink-mute" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-ink truncate">{name || `Merchant ${accountId}`}</div>
          <div className="mono text-[10px] text-ink-mute">
            {accountId}{subtitle ? ` · ${subtitle}` : ''}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">{trailing}</div>
    </div>
  );
}

function LoadingRow({ label }) {
  return (
    <div className="flex items-center gap-2 text-ink-body py-4 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="w-10 h-10 bg-cream rounded-full mx-auto flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="serif text-base text-ink mb-1">{title}</div>
      <div className="text-xs text-ink-body max-w-sm mx-auto leading-relaxed">{body}</div>
    </div>
  );
}