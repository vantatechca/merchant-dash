// import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
// import {
//   CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw,
//   Search, Plus, ArrowRight, ArrowLeft,
//   Box, Radio, Settings, Link2, ServerCrash, Loader2, Database,
//   ChevronRight, Building2, Bell, BellOff, Command, X,
//   Zap, ZapOff,
// } from 'lucide-react';

// import { api } from './api';
// import { useAccounts, useProducts, useStats, useEvents } from './hooks';
// import ConnectAccount from './ConnectAccount';

// const STATUS_STYLES = {
//   approved:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Approved' },
//   pending:     { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   label: 'Pending' },
//   disapproved: { dot: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    label: 'Disapproved' },
// };

// // Autosync cadence. Tune here if GMC rate-limits you.
// const FAST_REFRESH_MS = 8_000;    // DB re-read (products/stats/accounts)
// const BACKEND_SYNC_MS = 90_000;   // GMC pull (only when account selected)
// const INITIAL_SYNC_DELAY_MS = 2_000;

// // ═══════════════════════════════════════════════════════════════════════════
// // Typography + global micro-styles (self-contained, no tailwind.config change)
// // ═══════════════════════════════════════════════════════════════════════════
// function GlobalStyles() {
//   return (
//     <style>{`
//       @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

//       html, body, #root { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
//       body {
//         font-feature-settings: 'cv02','cv03','cv04','cv11','ss01';
//         -webkit-font-smoothing: antialiased;
//         color: #0f172a;
//       }
//       .font-display { font-family: 'Inter', -apple-system, sans-serif; letter-spacing: -0.025em; font-weight: 700; }
//       .font-mono-ui { font-family: 'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace; font-feature-settings: 'ss01'; }
//       .tabular-nums { font-variant-numeric: tabular-nums; }

//       @keyframes ping-dot { 75%, 100% { transform: scale(2.2); opacity: 0; } }
//       .pulse-dot { position: relative; }
//       .pulse-dot::after {
//         content: ''; position: absolute; inset: 0; border-radius: 9999px;
//         background: currentColor; animation: ping-dot 2s cubic-bezier(0,0,.2,1) infinite;
//       }

//       @keyframes spin-slow { to { transform: rotate(360deg); } }
//       .spin-slow { animation: spin-slow 1.4s linear infinite; }

//       @keyframes slide-in { from { opacity: 0; transform: translateY(-6px);} to { opacity: 1; transform: translateY(0);} }
//       .event-enter { animation: slide-in 0.35s cubic-bezier(.16,1,.3,1); }

//       @keyframes toast-in {
//         from { opacity: 0; transform: translateX(24px) scale(0.96); }
//         to { opacity: 1; transform: translateX(0) scale(1); }
//       }
//       @keyframes toast-out {
//         from { opacity: 1; transform: translateX(0); max-height: 200px; margin-bottom: 8px; }
//         to { opacity: 0; transform: translateX(24px); max-height: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0; }
//       }
//       .toast-in { animation: toast-in 0.32s cubic-bezier(.16,1,.3,1); }
//       .toast-out { animation: toast-out 0.28s cubic-bezier(.4,0,1,1) forwards; overflow: hidden; }

//       .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
//       .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
//       .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
//       .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

//       .grid-bg {
//         background-image:
//           linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px),
//           linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px);
//         background-size: 32px 32px;
//       }
//     `}</style>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // Root
// // ═══════════════════════════════════════════════════════════════════════════
// export default function App() {
//   const [selectedAccount, setSelectedAccount] = useState(null);
//   const [statusFilter, setStatusFilter] = useState('all');
//   const [search, setSearch] = useState('');
//   const [syncing, setSyncing] = useState(false);
//   const [showConnect, setShowConnect] = useState(false);
//   const [backendDown, setBackendDown] = useState(false);

//   // ── Autosync state ──────────────────────────────────────────────────────
//   const [autoSync, setAutoSync] = useState(() => {
//     if (typeof window === 'undefined') return true;
//     const saved = window.localStorage.getItem('gmc-autosync');
//     return saved === null ? true : saved === 'true';
//   });
//   const [lastSyncAt, setLastSyncAt] = useState(null);
//   const [autoSyncState, setAutoSyncState] = useState('idle'); // idle | refreshing | syncing | error
//   const autoSyncBusyRef = useRef(false); // prevents overlapping backend syncs
//   const refreshBusyRef = useRef(false);  // prevents overlapping DB re-reads

//   useEffect(() => {
//     window.localStorage.setItem('gmc-autosync', String(autoSync));
//   }, [autoSync]);

//   // Toast notifications
//   const [toasts, setToasts] = useState([]);
//   const [notifEnabled, setNotifEnabled] = useState(
//     typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
//   );
//   const seenEventIdsRef = useRef(new Set());
//   const isFirstEventRunRef = useRef(true);

//   useEffect(() => {
//     api.health().catch(() => setBackendDown(true));
//   }, []);

//   const { data: accounts, loading: accountsLoading, refresh: refreshAccounts } = useAccounts();
//   const { data: products, refresh: refreshProducts } = useProducts(selectedAccount || 'all', statusFilter);
//   const { data: stats, refresh: refreshStats } = useStats(selectedAccount || 'all');
//   const { events } = useEvents(selectedAccount || 'all');

// const refreshAll = useCallback(async () => {
//     if (refreshBusyRef.current) return;
//     refreshBusyRef.current = true;
//     // Silent refresh — don't touch autoSyncState so the header pill doesn't flicker.
//     // Errors are logged but not surfaced; the next tick will retry.
//     try {
//       const tasks = [refreshProducts(), refreshStats()];
//       if (!selectedAccount) tasks.push(refreshAccounts());
//       await Promise.all(tasks);
//     } catch (e) {
//       console.warn('[refresh] silent refresh failed:', e?.message || e);
//     } finally {
//       refreshBusyRef.current = false;
//     }
//   }, [selectedAccount, refreshProducts, refreshStats, refreshAccounts]);


//   // ── Fast DB poll: every FAST_REFRESH_MS, pause when tab hidden ──────────
//   useEffect(() => {
//     if (!autoSync) return;
//     const tick = () => {
//       if (typeof document !== 'undefined' && document.hidden) return;
//       refreshAll();
//     };
//     const id = setInterval(tick, FAST_REFRESH_MS);
//     // When tab regains focus, refresh immediately so we catch up fast.
//     const onVisible = () => { if (!document.hidden) refreshAll(); };
//     document.addEventListener('visibilitychange', onVisible);
//     return () => {
//       clearInterval(id);
//       document.removeEventListener('visibilitychange', onVisible);
//     };
//   }, [autoSync, refreshAll]);

//   // ── Backend→GMC sync: every BACKEND_SYNC_MS for the selected account ────
//   useEffect(() => {
//     if (!autoSync || !selectedAccount) return;

//     const doSync = async () => {
//       if (typeof document !== 'undefined' && document.hidden) return;
//       if (autoSyncBusyRef.current || syncing) return; // skip if manual sync running
//       autoSyncBusyRef.current = true;
//       setAutoSyncState('syncing');
//       try {
//         await api.syncAccount(selectedAccount);
//         await Promise.all([refreshProducts(), refreshStats()]);
//         setLastSyncAt(new Date());
//         setAutoSyncState('idle');
//       } catch (e) {
//         // Don't alert — autosync failures are background noise. Log only.
//         console.warn('[autosync] background sync failed:', e?.message || e);
//         setAutoSyncState('error');
//       } finally {
//         autoSyncBusyRef.current = false;
//       }
//     };

//     const initialTimer = setTimeout(doSync, INITIAL_SYNC_DELAY_MS);
//     const interval = setInterval(doSync, BACKEND_SYNC_MS);
//     return () => { clearTimeout(initialTimer); clearInterval(interval); };
//   }, [autoSync, selectedAccount, refreshProducts, refreshStats, syncing]);

//   // ── Refresh-on-event: new events = instant UI refresh ───────────────────
//   const lastSeenEventCountRef = useRef(0);
//   useEffect(() => {
//     if (!events) return;
//     // Skip the first tick so we don't refresh needlessly on mount.
//     if (lastSeenEventCountRef.current === 0 && events.length > 0) {
//       lastSeenEventCountRef.current = events.length;
//       return;
//     }
//     if (events.length > lastSeenEventCountRef.current) {
//       lastSeenEventCountRef.current = events.length;
//       refreshAll();
//     }
//   }, [events, refreshAll]);

//     const seenAccountIdsRef = useRef(null);
//   useEffect(() => {
//     if (!accounts) return;

//     // First time accounts data loads: seed the seen-set, don't sync anything.
//     if (seenAccountIdsRef.current === null) {
//       seenAccountIdsRef.current = new Set(accounts.map(a => a.account_id));
//       return;
//     }

//     const newAccounts = accounts.filter(
//       a => !seenAccountIdsRef.current.has(a.account_id)
//     );
//     if (newAccounts.length === 0) return;

//     // Claim them immediately so rapid re-renders don't fire duplicate syncs.
//     newAccounts.forEach(a => seenAccountIdsRef.current.add(a.account_id));

//     (async () => {
//       setAutoSyncState('syncing');
//       for (const a of newAccounts) {
//         try {
//           console.log(`[autosync] initial sync for new account ${a.account_id}`);
//           await api.syncAccount(a.account_id, true); // force=true bypasses cooldown
//         } catch (e) {
//           console.warn(
//             `[autosync] initial sync failed for ${a.account_id}:`,
//             e?.message || e,
//           );
//         }
//       }
//       // Refresh everything so the new counts/products show up.
//       await Promise.all([refreshAccounts(), refreshProducts(), refreshStats()]);
//       setLastSyncAt(new Date());
//       setAutoSyncState('idle');
//     })();
//   }, [accounts, refreshAccounts, refreshProducts, refreshStats]);

//   // Detect new approved/disapproved events and surface them as toasts
//   useEffect(() => {
//     if (!events || events.length === 0) return;

//     // First poll after mount: mark everything as "already seen" so we don't
//     // spam the user with toasts for historical events.
//     if (isFirstEventRunRef.current) {
//       events.forEach(ev => seenEventIdsRef.current.add(ev.id));
//       isFirstEventRunRef.current = false;
//       return;
//     }

//     const newOnes = events.filter(ev => ev.id && !seenEventIdsRef.current.has(ev.id));
//     if (newOnes.length === 0) return;

//     const incoming = [];
//     newOnes.forEach(ev => {
//       seenEventIdsRef.current.add(ev.id);
//       const val = (ev.new_value || '').toLowerCase();
//       if (val !== 'approved' && val !== 'disapproved') return;

//       const toast = {
//         id: `${ev.id}-${Date.now()}`,
//         status: val,
//         offer_id: ev.offer_id,
//         account_id: ev.account_id,
//         leaving: false,
//       };
//       incoming.push(toast);

//       // Browser notification (silent if permission wasn't granted)
//       if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
//         const title = val === 'approved' ? '✅ Product approved' : '🚨 Product disapproved';
//         const acctTag = ev.account_id ? ` · ${ev.account_id.slice(-6)}` : '';
//         new Notification(title, {
//           body: `${ev.offer_id || 'product'}${acctTag}`,
//           tag:  `gmc-${ev.id}`,
//         });
//       }
//     });

//     if (incoming.length === 0) return;
//     setToasts(prev => [...prev, ...incoming]);

//     // Schedule auto-dismiss with exit animation
//     incoming.forEach(t => {
//       setTimeout(() => {
//         setToasts(prev => prev.map(x => x.id === t.id ? { ...x, leaving: true } : x));
//         setTimeout(() => {
//           setToasts(prev => prev.filter(x => x.id !== t.id));
//         }, 280);
//       }, 8000);
//     });
//   }, [events]);

//   const dismissToast = (id) => {
//     setToasts(prev => prev.map(x => x.id === id ? { ...x, leaving: true } : x));
//     setTimeout(() => {
//       setToasts(prev => prev.filter(x => x.id !== id));
//     }, 280);
//   };

//   const toggleNotifications = async () => {
//     if (!('Notification' in window)) {
//       alert('Your browser does not support notifications.');
//       return;
//     }
//     if (Notification.permission === 'granted') {
//       setNotifEnabled(false);
//       alert('To fully disable, revoke permission in your browser site settings. Toast notifications will stop appearing for now.');
//       return;
//     }
//     const perm = await Notification.requestPermission();
//     setNotifEnabled(perm === 'granted');
//   };

//   const hasAccounts = accounts && accounts.length > 0;
//   const activeAccount = accounts?.find(a => a.account_id === selectedAccount);

//   const filteredProducts = useMemo(() => {
//     if (!products) return [];
//     let result = products;

//     // Defensive account filter — prevents products from other accounts
//     // leaking in if the hook/API doesn't filter server-side.
//     if (selectedAccount) {
//       result = result.filter(p => p.account_id === selectedAccount);
//     }

//     if (search) {
//       const s = search.toLowerCase();
//       result = result.filter(p =>
//         p.title?.toLowerCase().includes(s) || p.offer_id?.toLowerCase().includes(s)
//       );
//     }
//     return result;
//   }, [products, search, selectedAccount]);

// const handleSync = async () => {
//     if (!selectedAccount) return;
//     setSyncing(true);
//     setAutoSyncState('syncing');
//     try {
//       await api.syncAccount(selectedAccount, true);  // force=true — manual button bypasses cooldown
//       await Promise.all([refreshProducts(), refreshStats()]);
//       setLastSyncAt(new Date());
//       setAutoSyncState('idle');
//     } catch (e) {
//       setAutoSyncState('error');
//       alert(`Sync failed: ${e.message}`);
//     } finally {
//       setSyncing(false);
//     }
//   };

//   // Stats: prefer server-side, but fall back to computing from filtered
//   // products when an account is selected, so the KPI cards never show
//   // aggregate cross-account numbers while inside one account.
//   const totals = useMemo(() => {
//     if (selectedAccount && products) {
//       const own = products.filter(p => p.account_id === selectedAccount);
//       // Only recompute when the server returned unfiltered data (wrong total).
//       const serverTotal = stats?.total ?? 0;
//       if (serverTotal !== own.length && own.length > 0) {
//         return {
//           total: own.length,
//           approved: own.filter(p => p.status === 'approved').length,
//           pending: own.filter(p => p.status === 'pending').length,
//           disapproved: own.filter(p => p.status === 'disapproved').length,
//         };
//       }
//     }
//     return stats || { total: 0, approved: 0, pending: 0, disapproved: 0 };
//   }, [stats, products, selectedAccount]);
//   const approvalRate = totals.total ? ((totals.approved / totals.total) * 100).toFixed(1) : '0';

//   // ── Backend down ─────────────────────────────────────────────────────────
//   if (backendDown) {
//     return (
//       <>
//         <GlobalStyles />
//         <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
//           <div className="max-w-md text-center">
//             <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mx-auto mb-5">
//               <ServerCrash className="w-6 h-6 text-rose-600" />
//             </div>
//             <h2 className="font-display text-3xl text-slate-900 mb-2">Backend unreachable</h2>
//             <p className="text-slate-600 mb-6 leading-relaxed">
//               The dashboard couldn't reach the API at <code className="font-mono-ui text-sm bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">/api</code>.
//               Make sure the FastAPI server is running on port 8000.
//             </p>
//             <div className="bg-slate-900 text-slate-200 rounded-xl p-4 text-left font-mono-ui text-xs">
//               <div className="text-slate-500">$ cd backend</div>
//               <div className="text-slate-500">$ pip install -r requirements.txt</div>
//               <div>uvicorn app.main:app --reload --port 8000</div>
//             </div>
//             <button
//               onClick={() => window.location.reload()}
//               className="mt-6 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm shadow-indigo-600/20"
//             >
//               Retry connection
//             </button>
//           </div>
//         </div>
//       </>
//     );
//   }

//   // ── Empty state ──────────────────────────────────────────────────────────
//   if (!accountsLoading && !hasAccounts) {
//     return (
//       <>
//         <GlobalStyles />
//         <div className="min-h-screen bg-slate-50">
//           <Header events={events} onSync={handleSync} syncing={syncing} showSync={false} />
//           <div className="relative flex items-center justify-center px-8 py-24 overflow-hidden">
//             <div className="absolute inset-0 grid-bg opacity-60 pointer-events-none" />
//             <div className="relative max-w-lg text-center">
//               <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-600/20">
//                 <Link2 className="w-6 h-6 text-white" />
//               </div>
//               <h1 className="font-display text-5xl text-slate-900 mb-3">
//                 Connect your first account
//               </h1>
//               <p className="text-slate-600 text-lg mb-8 leading-relaxed">
//                 Link a Google Merchant Center account to manage products, track approval
//                 status, and receive real-time webhook notifications.
//               </p>
//               <button
//                 onClick={() => setShowConnect(true)}
//                 className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-md shadow-indigo-600/25"
//               >
//                 <Plus className="w-4 h-4" />
//                 Connect Merchant Center
//               </button>
//             </div>
//           </div>
//           {showConnect && (
//             <ConnectAccount onClose={() => setShowConnect(false)} onSuccess={() => refreshAccounts()} />
//           )}
//         </div>
//       </>
//     );
//   }

//   // ── Main ─────────────────────────────────────────────────────────────────
//   return (
//     <>
//       <GlobalStyles />
//       <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
//         <Header
//           events={events}
//           onSync={handleSync}
//           syncing={syncing}
//           showSync={!!selectedAccount}
//           notifEnabled={notifEnabled}
//           onToggleNotifications={toggleNotifications}
//           autoSync={autoSync}
//           onToggleAutoSync={() => setAutoSync(v => !v)}
//           autoSyncState={autoSyncState}
//           lastSyncAt={lastSyncAt}
//         />

//         <div className="flex-1">
//           {selectedAccount ? (
//             <ProductsView
//               account={activeAccount}
//               products={filteredProducts}
//               rawProductsLoaded={products !== null}
//               totals={totals}
//               approvalRate={approvalRate}
//               search={search}
//               setSearch={setSearch}
//               statusFilter={statusFilter}
//               setStatusFilter={setStatusFilter}
//               events={events}
//               onBack={() => { setSelectedAccount(null); setSearch(''); setStatusFilter('all'); }}
//               onSync={handleSync}
//               syncing={syncing}
//             />
//           ) : (
//             <AccountsView
//               accounts={accounts}
//               totals={totals}
//               approvalRate={approvalRate}
//               events={events}
//               onSelect={setSelectedAccount}
//               onConnect={() => setShowConnect(true)}
//             />
//           )}
//         </div>

//         <Footer autoSync={autoSync} autoSyncState={autoSyncState} lastSyncAt={lastSyncAt} />

//         <ToastStack toasts={toasts} accounts={accounts} onDismiss={dismissToast} />

//         {showConnect && (
//           <ConnectAccount onClose={() => setShowConnect(false)} onSuccess={() => refreshAccounts()} />
//         )}
//       </div>
//     </>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // Accounts view
// // ═══════════════════════════════════════════════════════════════════════════
// function AccountsView({ accounts, totals, approvalRate, events, onSelect, onConnect }) {
//   // Local search + status filter for the accounts table.
//   const [search, setSearch] = useState('');
//   const [statusFilter, setStatusFilter] = useState('all');

//   const accountStats = useMemo(() => {
//     const list = accounts ?? [];
//     return {
//       total: list.length,
//       withApproved:    list.filter(a => (a.approved_count ?? 0) > 0).length,
//       withDisapproved: list.filter(a => (a.disapproved_count ?? 0) > 0).length,
//       withPending:     list.filter(a => (a.pending_count ?? 0) > 0).length,
//     };
//   }, [accounts]);
//   const pct = (n) => accountStats.total ? `${((n / accountStats.total) * 100).toFixed(0)}% of accounts` : '—';

//   // Filter = accounts that HAVE at least one product in that state.
//   // `clean` = nothing disapproved AND nothing pending (everything approved).
//   const filteredAccounts = useMemo(() => {
//     const list = accounts ?? [];
//     let result = list;

//     if (search) {
//       const s = search.toLowerCase();
//       result = result.filter(a =>
//         a.display_name?.toLowerCase().includes(s) ||
//         a.account_id?.toLowerCase().includes(s)
//       );
//     }

//     if (statusFilter !== 'all') {
//       result = result.filter(a => {
//         const approved    = a.approved_count    ?? a.approved    ?? 0;
//         const disapproved = a.disapproved_count ?? a.disapproved ?? 0;
//         const pending     = a.pending_count     ?? a.pending     ?? 0;
//         if (statusFilter === 'approved')    return approved > 0;
//         if (statusFilter === 'disapproved') return disapproved > 0;
//         if (statusFilter === 'pending')     return pending > 0;
//         if (statusFilter === 'clean')       return disapproved === 0 && pending === 0 && approved > 0;
//         return true;
//       });
//     }

//     return result;
//   }, [accounts, search, statusFilter]);

//   const isFiltered = search.trim().length > 0 || statusFilter !== 'all';

//   return (
//     <>
//       {/* Hero */}
//       <section className="relative px-8 pt-12 pb-10 border-b border-slate-200 bg-white overflow-hidden">
//         <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
//         <div className="relative flex items-end justify-between gap-8">
//           <div>
//             <Breadcrumb items={['Dashboard', 'Accounts']} />
//             <h1 className="font-display text-[44px] leading-[1.1] text-slate-900 mt-4">
//               Merchant accounts
//             </h1>
//             <p className="text-slate-600 text-base mt-3 max-w-xl">
//               {totals.total.toLocaleString()} products across {accounts?.length ?? 0} linked {accounts?.length === 1 ? 'account' : 'accounts'}. Select one to drill into its inventory.
//             </p>
//           </div>

//           <button
//             onClick={onConnect}
//             className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition rounded-lg shadow-sm shadow-indigo-600/20"
//           >
//             <Plus className="w-4 h-4" />
//             Connect account
//           </button>
//         </div>
//       </section>

//       {/* KPIs */}
//       <section className="px-8 py-8">
//         <div className="grid grid-cols-4 gap-4">
//           <KPICard
//             label="Accounts connected"
//             value={accountStats.total.toLocaleString()}
//             sub={totals.total ? `${totals.total.toLocaleString()} products in total` : 'No products yet'}
//             icon={<Link2 className="w-4 h-4" />}
//           />
//           <KPICard
//             label="With approved products"
//             value={accountStats.withApproved.toLocaleString()}
//             sub={pct(accountStats.withApproved) + ' live'}
//             icon={<CheckCircle2 className="w-4 h-4" />}
//             accent="emerald"
//           />
//           <KPICard
//             label="With disapproved"
//             value={accountStats.withDisapproved.toLocaleString()}
//             sub={accountStats.withDisapproved > 0 ? 'needs attention' : 'all clear'}
//             icon={<XCircle className="w-4 h-4" />}
//             accent="rose"
//           />
//           <KPICard
//             label="Under review"
//             value={accountStats.withPending.toLocaleString()}
//             sub="awaiting Google decision"
//             icon={<Clock className="w-4 h-4" />}
//             accent="amber"
//           />
//         </div>
//       </section>

//       {/* Accounts table */}
//       <section className="px-8 pb-8">
//         <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
//           <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
//             <div className="flex items-center gap-3">
//               <h2 className="font-display text-lg text-slate-900">Linked accounts</h2>
//               <span className="font-mono-ui text-[10px] tracking-wide text-slate-500 uppercase px-2 py-0.5 bg-slate-100 rounded-md">
//                 {isFiltered
//                   ? `${filteredAccounts.length} of ${accounts?.length ?? 0}`
//                   : `${accounts?.length ?? 0} total`}
//               </span>
//             </div>

//             <div className="flex items-center gap-2">
//               <div className="relative">
//                 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
//                 <input
//                   value={search}
//                   onChange={e => setSearch(e.target.value)}
//                   placeholder="Search name or account ID…"
//                   className="w-72 bg-white border border-slate-200 pl-10 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-lg transition"
//                 />
//                 {search && (
//                   <button
//                     onClick={() => setSearch('')}
//                     className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition"
//                     aria-label="Clear search"
//                   >
//                     <X className="w-3.5 h-3.5" />
//                   </button>
//                 )}
//               </div>
//               <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white p-0.5 gap-0.5">
//                 {[
//                   { key: 'all',         label: 'All' },
//                   { key: 'disapproved', label: 'Disapproved' },
//                   { key: 'pending',     label: 'Pending' },
//                   { key: 'approved',    label: 'Approved' },
//                   { key: 'clean',       label: 'Healthy' },
//                 ].map(opt => (
//                   <button
//                     key={opt.key}
//                     onClick={() => setStatusFilter(opt.key)}
//                     className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
//                       statusFilter === opt.key
//                         ? 'bg-indigo-600 text-white shadow-sm'
//                         : 'bg-white text-slate-600 hover:bg-slate-50'
//                     }`}
//                   >
//                     {opt.label}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           </div>

//           <table className="w-full text-sm">
//             <thead className="bg-slate-50/60">
//               <tr className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase">
//                 <th className="text-left font-medium px-6 py-3 border-b border-slate-200 w-[40%]">Account</th>
//                 <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Account ID</th>
//                 <th className="text-right font-medium px-3 py-3 border-b border-slate-200">Products</th>
//                 <th className="text-right font-medium px-3 py-3 border-b border-slate-200">GMC Status</th>
//                 <th className="text-right font-medium px-6 py-3 border-b border-slate-200">Status</th>
//               </tr>
//             </thead>
//             <tbody>
//               {filteredAccounts.map((a, i) => {
//                 const productCount = a.total_products ?? a.product_count ?? null;
//                 const approvedCount    = a.approved_count    ?? a.approved    ?? 0;
//                 const disapprovedCount = a.disapproved_count ?? a.disapproved ?? 0;
//                 const pendingCount     = a.pending_count     ?? a.pending     ?? 0;
//                 const hasApproved    = approvedCount    > 0;
//                 const hasDisapproved = disapprovedCount > 0;
//                 const hasPending     = pendingCount     > 0;
//                 const hasAnyStatus   = hasApproved || hasDisapproved || hasPending;
//                 return (
//                   <tr
//                     key={a.account_id}
//                     onClick={() => onSelect(a.account_id)}
//                     className={`hover:bg-slate-50 transition cursor-pointer group ${i < filteredAccounts.length - 1 ? 'border-b border-slate-100' : ''}`}
//                   >
//                     <td className="px-6 py-4">
//                       <div className="flex items-center gap-3">
//                         <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:border-indigo-300 group-hover:text-indigo-600 group-hover:from-indigo-50 group-hover:to-white transition">
//                           <Building2 className="w-4 h-4" />
//                         </div>
//                         <div>
//                           <div className="text-slate-900 font-semibold">{a.display_name}</div>
//                           <div className="font-mono-ui text-[11px] text-slate-400 mt-0.5">Merchant API · v1</div>
//                         </div>
//                       </div>
//                     </td>
//                     <td className="px-3 py-4 font-mono-ui text-xs text-slate-500">{a.account_id}</td>
//                     <td className="px-3 py-4 text-right font-mono-ui text-sm text-slate-900 tabular-nums font-semibold">
//                       {productCount !== null ? productCount.toLocaleString() : <span className="text-slate-300">—</span>}
//                     </td>
//                     <td className="px-3 py-4">
//                       <div className="flex items-center justify-end gap-1.5 flex-wrap">
//                         {hasApproved && (
//                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-semibold rounded-full">
//                             <CheckCircle2 className="w-3 h-3" />
//                             Approved
//                           </span>
//                         )}
//                         {hasDisapproved && (
//                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-semibold rounded-full">
//                             <XCircle className="w-3 h-3" />
//                             Disapproved
//                           </span>
//                         )}
//                         {hasPending && (
//                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-semibold rounded-full">
//                             <Clock className="w-3 h-3" />
//                             Under review
//                           </span>
//                         )}
//                         {!hasAnyStatus && (
//                           <span className="text-slate-300 font-mono-ui text-xs">—</span>
//                         )}
//                       </div>
//                     </td>
//                     <td className="px-6 py-4">
//                       <div className="flex items-center justify-end gap-3">
//                         <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 bg-slate-50 text-slate-600 text-[11px] font-semibold rounded-full">
//                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
//                           Connected
//                         </span>
//                         <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
//                       </div>
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>

//           {filteredAccounts.length === 0 && (
//             <div className="py-20 text-center">
//               <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
//                 <Search className="w-5 h-5 text-slate-400" />
//               </div>
//               <div className="font-display text-lg text-slate-900 mb-1.5">No accounts match</div>
//               <div className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
//                 {search && <>No results for <span className="font-mono-ui text-slate-700">"{search}"</span>. </>}
//                 Try adjusting your search or filter.
//               </div>
//               <button
//                 onClick={() => { setSearch(''); setStatusFilter('all'); }}
//                 className="text-sm text-indigo-600 font-medium hover:text-indigo-700"
//               >
//                 Clear filters
//               </button>
//             </div>
//           )}
//         </div>
//       </section>

//       {/* Recent activity */}
//       {events.length > 0 && (
//         <section className="px-8 pb-10">
//           <div className="flex items-end justify-between mb-4">
//             <div>
//               <h2 className="font-display text-xl text-slate-900 flex items-center gap-2">
//                 Recent activity
//                 <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
//               </h2>
//               <p className="font-mono-ui text-[11px] tracking-wide text-slate-400 uppercase mt-1">
//                 Across all accounts · {events.length} events
//               </p>
//             </div>
//             <Radio className="w-4 h-4 text-indigo-600" />
//           </div>
//           <EventsTable events={events.slice(0, 8)} />
//         </section>
//       )}
//     </>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // Products view
// // ═══════════════════════════════════════════════════════════════════════════
// function ProductsView({
//   account, products, rawProductsLoaded, totals, approvalRate,
//   search, setSearch, statusFilter, setStatusFilter,
//   events, onBack, onSync, syncing,
// }) {
//   return (
//     <>
//       {/* Hero */}
//       <section className="relative px-8 pt-10 pb-8 border-b border-slate-200 bg-white overflow-hidden">
//         <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
//         <div className="relative">
//           <button
//             onClick={onBack}
//             className="group inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-5 transition"
//           >
//             <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
//             Back to accounts
//           </button>

//           <div className="flex items-end justify-between gap-8">
//             <div>
//               <Breadcrumb items={['Accounts', account?.display_name || '—']} />
//               <h1 className="font-display text-[44px] leading-[1.1] text-slate-900 mt-4">
//                 {account?.display_name}
//               </h1>
//               <div className="flex items-center gap-2 mt-4">
//                 <Chip>ACCT · {account?.account_id}</Chip>
//                 <Chip>MERCHANT API v1</Chip>
//                 <span className="inline-flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wide uppercase px-2 py-1 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-md font-semibold">
//                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
//                   Connected
//                 </span>
//               </div>
//             </div>

//             <div className="flex items-center gap-2">
//               <button
//                 onClick={onSync}
//                 disabled={syncing}
//                 className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition rounded-lg disabled:opacity-50 shadow-sm"
//               >
//                 {syncing
//                   ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
//                   : <><RefreshCw className="w-4 h-4" /> Sync now</>}
//               </button>
//               <button
//                 onClick={() => alert('Insert product — wire to POST /api/products. Pick a data source first via GET /api/accounts/{id}/datasources.')}
//                 className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition rounded-lg shadow-sm shadow-indigo-600/20"
//               >
//                 <Plus className="w-4 h-4" />
//                 Insert product
//               </button>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* KPIs */}
//       <section className="px-8 py-8">
//         <div className="grid grid-cols-4 gap-4">
//           <KPICard label="Total products" value={totals.total.toLocaleString()} sub="in this account" icon={<Box className="w-4 h-4" />} />
//           <KPICard label="Approved" value={totals.approved.toLocaleString()} sub={`${approvalRate}% approval rate`} icon={<CheckCircle2 className="w-4 h-4" />} accent="emerald" />
//           <KPICard label="Pending" value={totals.pending.toLocaleString()} sub="awaiting decision" icon={<Clock className="w-4 h-4" />} accent="amber" />
//           <KPICard label="Disapproved" value={totals.disapproved.toLocaleString()} sub={totals.total ? `${((totals.disapproved/totals.total)*100).toFixed(1)}% of inventory` : '—'} icon={<XCircle className="w-4 h-4" />} accent="rose" />
//         </div>
//       </section>

//       {/* Products table */}
//       <section className="px-8 pb-8">
//         <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
//           <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
//             <div className="flex items-center gap-3">
//               <h2 className="font-display text-lg text-slate-900">Inventory</h2>
//               <span className="font-mono-ui text-[10px] tracking-wide text-slate-500 uppercase px-2 py-0.5 bg-slate-100 rounded-md">
//                 {products.length} items
//               </span>
//             </div>
//             <div className="flex items-center gap-2">
//               <div className="relative">
//                 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
//                 <input
//                   value={search}
//                   onChange={e => setSearch(e.target.value)}
//                   placeholder="Search offer_id or title…"
//                   className="w-72 bg-white border border-slate-200 pl-10 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-lg transition"
//                 />
//                 {search && (
//                   <button
//                     onClick={() => setSearch('')}
//                     className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition"
//                     aria-label="Clear search"
//                   >
//                     <X className="w-3.5 h-3.5" />
//                   </button>
//                 )}
//               </div>
//               <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white p-0.5 gap-0.5">
//                 {['all', 'approved', 'pending', 'disapproved'].map(s => (
//                   <button
//                     key={s}
//                     onClick={() => setStatusFilter(s)}
//                     className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
//                       statusFilter === s
//                         ? 'bg-indigo-600 text-white shadow-sm'
//                         : 'bg-white text-slate-600 hover:bg-slate-50'
//                     }`}
//                   >
//                     {s === 'all' ? 'All' : STATUS_STYLES[s]?.label}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           </div>

//           <div className="overflow-auto scrollbar-thin">
//             <table className="w-full text-sm">
//               <thead className="bg-slate-50/60 sticky top-0 z-10 backdrop-blur">
//                 <tr className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase">
//                   <th className="text-left font-medium px-6 py-3 border-b border-slate-200">Offer ID</th>
//                   <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Title</th>
//                   <th className="text-right font-medium px-3 py-3 border-b border-slate-200">Issues</th>
//                   <th className="text-right font-medium px-3 py-3 border-b border-slate-200">Updated</th>
//                   <th className="text-right font-medium px-6 py-3 border-b border-slate-200 w-[180px]">Status</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {products.map((p, i) => (
//                   <tr
//                     key={p.id}
//                     className={`hover:bg-slate-50 transition ${i < products.length - 1 ? 'border-b border-slate-100' : ''}`}
//                   >
//                     <td className="px-6 py-3.5 font-mono-ui text-xs text-slate-600 font-medium">{p.offer_id}</td>
//                     <td className="px-3 py-3.5 text-slate-900">{p.title}</td>
//                     <td className="px-3 py-3.5 text-right">
//                       {p.issue_count > 0 ? (
//                         <span className="inline-flex items-center gap-1 text-rose-600 font-mono-ui text-xs font-semibold">
//                           <AlertTriangle className="w-3 h-3" />
//                           {p.issue_count}
//                         </span>
//                       ) : <span className="text-slate-300 font-mono-ui text-xs">—</span>}
//                     </td>
//                     <td className="px-3 py-3.5 font-mono-ui text-xs text-right text-slate-400 tabular-nums">
//                       {p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}
//                     </td>
//                     <td className="px-6 py-3.5 text-right">
//                       <StatusBadge status={p.status} />
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>

//             {products.length === 0 && (
//               <div className="py-24 text-center">
//                 <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
//                   <Database className="w-5 h-5 text-slate-400" />
//                 </div>
//                 <div className="font-display text-lg text-slate-900 mb-1.5">
//                   {!rawProductsLoaded ? 'Loading…' : 'No products yet'}
//                 </div>
//                 <div className="text-sm text-slate-500 max-w-sm mx-auto">
//                   Run <button onClick={onSync} className="text-indigo-600 font-medium hover:text-indigo-700">sync</button> to pull products from this account, or add your first product.
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </section>

//       {/* Live feed */}
//       {events.length > 0 && (
//         <section className="px-8 pb-10">
//           <div className="flex items-end justify-between mb-4">
//             <div>
//               <h2 className="font-display text-xl text-slate-900 flex items-center gap-2">
//                 Live feed
//                 <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
//               </h2>
//               <p className="font-mono-ui text-[11px] tracking-wide text-slate-400 uppercase mt-1">
//                 PRODUCT_STATUS_CHANGE · {events.length} events
//               </p>
//             </div>
//             <Radio className="w-4 h-4 text-indigo-600" />
//           </div>
//           <EventsTable events={events.slice(0, 12)} showContext />
//         </section>
//       )}
//     </>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // Subcomponents
// // ═══════════════════════════════════════════════════════════════════════════
// function Header({
//   events, onSync, syncing, showSync, notifEnabled, onToggleNotifications,
//   autoSync, onToggleAutoSync, autoSyncState, lastSyncAt,
// }) {
//   return (
//     <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
//       <div className="flex items-center justify-between px-8 h-16">
//         <div className="flex items-center gap-8">
//           <div className="flex items-center gap-2.5">
//             <div className="relative w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-600/20">
//               <div className="w-2.5 h-2.5 bg-white rounded-sm" />
//               <div className="absolute -right-0.5 -top-0.5 w-2 h-2 bg-amber-400 rounded-full ring-2 ring-white" />
//             </div>
//             <div className="flex flex-col leading-tight">
//               <span className="font-display text-[15px] text-slate-900">Merchant</span>
//               <span className="font-mono-ui text-[9px] tracking-wider text-slate-400 uppercase -mt-0.5">Control · v1.0</span>
//             </div>
//           </div>
//           <nav className="flex items-center gap-1 text-sm">
//             <NavLink active>Products</NavLink>
//             <NavLink>Issues</NavLink>
//             <NavLink>Feeds</NavLink>
//             <NavLink>Webhooks</NavLink>
//             <NavLink>Reports</NavLink>
//           </nav>
//         </div>

//         <div className="flex items-center gap-2">
//           <button className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-slate-50 hover:bg-white transition rounded-lg text-sm text-slate-500">
//             <Search className="w-3.5 h-3.5" />
//             <span className="text-xs">Search…</span>
//             <kbd className="font-mono-ui text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500 flex items-center gap-0.5">
//               <Command className="w-2.5 h-2.5" />K
//             </kbd>
//           </button>

//           {/* Autosync indicator / toggle */}
//           {autoSync !== undefined && (
//             <AutoSyncPill
//               autoSync={autoSync}
//               state={autoSyncState}
//               lastSyncAt={lastSyncAt}
//               onToggle={onToggleAutoSync}
//             />
//           )}

//           <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
//             <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
//             <span className="font-mono-ui text-[10px] tracking-wide text-emerald-700 font-semibold">LIVE</span>
//             <span className="text-emerald-300">·</span>
//             <span className="font-mono-ui text-[10px] text-emerald-700">{events?.length || 0}</span>
//           </div>

//           {showSync && (
//             <button
//               onClick={onSync}
//               disabled={syncing}
//               className="flex items-center gap-2 px-3.5 py-1.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition text-sm text-slate-700 rounded-lg disabled:opacity-50 font-medium"
//             >
//               {syncing
//                 ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Syncing</span></>
//                 : <><RefreshCw className="w-3.5 h-3.5" /><span>Sync</span></>}
//             </button>
//           )}

//           <button
//             onClick={onToggleNotifications}
//             title={notifEnabled ? 'Notifications enabled — click for info' : 'Enable browser notifications'}
//             className={`relative w-9 h-9 flex items-center justify-center border rounded-lg transition ${
//               notifEnabled
//                 ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
//                 : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
//             }`}
//           >
//             {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
//             {notifEnabled && (
//               <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
//             )}
//           </button>
//           <button className="w-9 h-9 flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition">
//             <Settings className="w-4 h-4 text-slate-600" />
//           </button>
//         </div>
//       </div>
//     </header>
//   );
// }

// function AutoSyncPill({ autoSync, state, lastSyncAt, onToggle }) {
//   // Human-friendly "last synced" text that ticks without re-rendering the world.
//   const [, forceTick] = useState(0);
//   useEffect(() => {
//     const id = setInterval(() => forceTick(t => t + 1), 15_000);
//     return () => clearInterval(id);
//   }, []);
//   const agoText = lastSyncAt ? timeAgo(lastSyncAt) : null;

//   if (!autoSync) {
//     return (
//       <button
//         onClick={onToggle}
//         title="Auto-sync is OFF. Click to enable."
//         className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-full text-slate-500 hover:text-slate-700 transition"
//       >
//         <ZapOff className="w-3.5 h-3.5" />
//         <span className="font-mono-ui text-[10px] tracking-wide uppercase font-semibold">Auto off</span>
//       </button>
//     );
//   }

//   const isWorking = state === 'syncing' || state === 'refreshing';
//   const isError = state === 'error';

//   return (
//     <button
//       onClick={onToggle}
//       title={`Auto-sync is ON${agoText ? ` · last synced ${agoText}` : ''}. Click to disable.`}
//       className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${
//         isError
//           ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
//           : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
//       }`}
//     >
//       {isWorking
//         ? <RefreshCw className="w-3.5 h-3.5 spin-slow" />
//         : <Zap className="w-3.5 h-3.5" />}
//       <span className="font-mono-ui text-[10px] tracking-wide uppercase font-semibold">
//         {state === 'syncing' ? 'Syncing' : state === 'refreshing' ? 'Refresh' : isError ? 'Retry' : 'Auto'}
//       </span>
//       {agoText && !isWorking && (
//         <>
//           <span className="text-indigo-300">·</span>
//           <span className="font-mono-ui text-[10px] text-indigo-600">{agoText}</span>
//         </>
//       )}
//     </button>
//   );
// }

// function timeAgo(date) {
//   const ms = Date.now() - date.getTime();
//   const s = Math.floor(ms / 1000);
//   if (s < 10) return 'just now';
//   if (s < 60) return `${s}s ago`;
//   const m = Math.floor(s / 60);
//   if (m < 60) return `${m}m ago`;
//   const h = Math.floor(m / 60);
//   if (h < 24) return `${h}h ago`;
//   return `${Math.floor(h / 24)}d ago`;
// }

// function Footer({ autoSync, autoSyncState, lastSyncAt }) {
//   const statusText = !autoSync
//     ? 'Auto-sync: OFF'
//     : autoSyncState === 'syncing'
//       ? 'Auto-sync: pulling from GMC…'
//       : autoSyncState === 'refreshing'
//         ? 'Auto-sync: refreshing…'
//         : autoSyncState === 'error'
//           ? 'Auto-sync: last attempt failed'
//           : lastSyncAt
//             ? `Auto-sync: on · last pull ${timeAgo(lastSyncAt)}`
//             : 'Auto-sync: on';

//   return (
//     <footer className="border-t border-slate-200 bg-white px-8 py-4 flex justify-between items-center">
//       <div className="flex items-center gap-4 font-mono-ui text-[10px] text-slate-400 uppercase tracking-wider">
//         <span className="flex items-center gap-1.5">
//           <div className="w-1 h-1 rounded-full bg-indigo-600" />
//           Merchant API · v1
//         </span>
//         <span className="text-slate-300">·</span>
//         <span>merchantapi.googleapis.com</span>
//         <span className="text-slate-300">·</span>
//         <span>OAuth · content scope</span>
//         <span className="text-slate-300">·</span>
//         <span className={autoSync ? 'text-indigo-500' : 'text-slate-400'}>{statusText}</span>
//       </div>
//       <div className="font-mono-ui text-[10px] text-slate-400 uppercase tracking-wider tabular-nums">
//         UTC {new Date().toISOString().slice(11, 19)}
//       </div>
//     </footer>
//   );
// }

// function NavLink({ children, active }) {
//   return (
//     <button className={`relative px-3 py-1.5 text-sm rounded-md transition font-medium ${
//       active ? 'text-slate-900 bg-slate-100' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
//     }`}>
//       {children}
//     </button>
//   );
// }

// function Breadcrumb({ items }) {
//   return (
//     <div className="flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wider uppercase">
//       {items.map((item, i) => (
//         <span key={i} className="flex items-center gap-1.5">
//           <span className={i === items.length - 1 ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
//             {item}
//           </span>
//           {i < items.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
//         </span>
//       ))}
//     </div>
//   );
// }

// function Chip({ children }) {
//   return (
//     <span className="inline-flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wide text-slate-500 uppercase px-2 py-1 bg-white border border-slate-200 rounded-md">
//       {children}
//     </span>
//   );
// }

// function KPICard({ label, value, sub, icon, accent }) {
//   const accents = {
//     emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
//     amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
//     rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
//   };
//   const a = accent ? accents[accent] : null;
//   return (
//     <div className="relative bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition">
//       <div className="flex items-start justify-between mb-4">
//         <span className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase font-semibold">{label}</span>
//         <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${a ? `${a.bg} ${a.icon}` : 'bg-slate-100 text-slate-500'}`}>
//           {icon}
//         </span>
//       </div>
//       <div className="font-display text-[36px] leading-none text-slate-900 tabular-nums">{value}</div>
//       <div className="text-xs text-slate-500 mt-2.5">{sub}</div>
//     </div>
//   );
// }

// function StatusBadge({ status }) {
//   const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
//   return (
//     <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 border ${s.border} ${s.bg} ${s.text} text-[11px] font-semibold rounded-full`}>
//       <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
//       {s.label}
//     </span>
//   );
// }

// function EventsTable({ events, showContext = false }) {
//   return (
//     <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
//       <table className="w-full text-sm">
//         <thead className="bg-slate-50/60">
//           <tr className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase">
//             <th className="text-left font-medium px-6 py-3 border-b border-slate-200">Time</th>
//             <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Offer ID</th>
//             {showContext
//               ? <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Context</th>
//               : <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Account</th>}
//             <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Transition</th>
//             <th className="text-right font-medium px-6 py-3 border-b border-slate-200">Status</th>
//           </tr>
//         </thead>
//         <tbody>
//           {events.map((ev, i) => {
//             const t = ev.event_time ? new Date(ev.event_time).toTimeString().slice(0, 8) : '—';
//             return (
//               <tr
//                 key={ev.id || i}
//                 className={`hover:bg-slate-50 transition ${i < events.length - 1 ? 'border-b border-slate-100' : ''}`}
//               >
//                 <td className="px-6 py-3 font-mono-ui text-[11px] text-slate-400 tabular-nums">{t}</td>
//                 <td className="px-3 py-3 font-mono-ui text-xs text-slate-900 font-medium">{ev.offer_id || '—'}</td>
//                 {showContext ? (
//                   <td className="px-3 py-3">
//                     <span className="font-mono-ui text-[9px] tracking-wider text-slate-500 uppercase px-1.5 py-0.5 bg-slate-100 rounded">
//                       {ev.reporting_context || 'SHOPPING_ADS'}
//                     </span>
//                   </td>
//                 ) : (
//                   <td className="px-3 py-3 font-mono-ui text-[11px] text-slate-500">·{(ev.account_id || '').slice(-6)}</td>
//                 )}
//                 <td className="px-3 py-3">
//                   <span className="inline-flex items-center gap-1.5 font-mono-ui text-[11px]">
//                     {ev.old_value
//                       ? <span className="text-slate-500">{ev.old_value}</span>
//                       : <span className="text-slate-300 italic">null</span>}
//                     <ArrowRight className="w-3 h-3 text-slate-300" />
//                     <span className="text-slate-900 font-semibold">{ev.new_value || '—'}</span>
//                   </span>
//                 </td>
//                 <td className="px-6 py-3 text-right">
//                   <StatusBadge status={ev.new_value} />
//                 </td>
//               </tr>
//             );
//           })}
//         </tbody>
//       </table>
//     </div>
//   );
// }

// function ToastStack({ toasts, accounts, onDismiss }) {
//   if (!toasts || toasts.length === 0) return null;

//   return (
//     <div className="fixed top-20 right-6 z-[60] flex flex-col gap-2 w-[340px] pointer-events-none">
//       {toasts.map(t => {
//         const isApproved = t.status === 'approved';
//         const accountName = accounts?.find(a => a.account_id === t.account_id)?.display_name;
//         return (
//           <div
//             key={t.id}
//             className={`pointer-events-auto bg-white border rounded-xl shadow-lg shadow-slate-900/5 p-4 flex items-start gap-3 ${t.leaving ? 'toast-out' : 'toast-in'} ${
//               isApproved ? 'border-emerald-200' : 'border-rose-200'
//             }`}
//           >
//             <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
//               isApproved ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
//             }`}>
//               {isApproved ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
//             </div>
//             <div className="flex-1 min-w-0">
//               <div className="font-semibold text-sm text-slate-900 leading-tight">
//                 {isApproved ? 'Product approved' : 'Product disapproved'}
//               </div>
//               <div className="font-mono-ui text-[11px] text-slate-500 mt-1 truncate">
//                 {t.offer_id || '—'}
//               </div>
//               {accountName && (
//                 <div className="text-xs text-slate-500 mt-0.5 truncate">{accountName}</div>
//               )}
//             </div>
//             <button
//               onClick={() => onDismiss(t.id)}
//               className="flex-shrink-0 text-slate-400 hover:text-slate-900 transition p-0.5 -mr-0.5"
//               aria-label="Dismiss notification"
//             >
//               <X className="w-4 h-4" />
//             </button>
//           </div>
//         );
//       })}
//     </div>
//   );
// }




import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw,
  Search, Plus, ArrowRight, ArrowLeft,
  Box, Radio, Link2, ServerCrash, Loader2, Database,
  ChevronRight, Building2, Bell, BellOff, X,
  Zap, ZapOff, LogOut,
} from 'lucide-react';

import { api } from './api';
import { useAccounts, useProducts, useStats, useEvents } from './hooks';
import ConnectAccount from './ConnectAccount';

const STATUS_STYLES = {
  approved:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Approved' },
  pending:     { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   label: 'Pending' },
  disapproved: { dot: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    label: 'Disapproved' },
};

// Autosync cadence. Tune here if GMC rate-limits you.
const FAST_REFRESH_MS = 8_000;    // DB re-read (products/stats/accounts)
const BACKEND_SYNC_MS = 90_000;   // GMC pull (only when account selected)
const INITIAL_SYNC_DELAY_MS = 2_000;

// ═══════════════════════════════════════════════════════════════════════════
// Typography + global micro-styles (self-contained, no tailwind.config change)
// ═══════════════════════════════════════════════════════════════════════════
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

      html, body, #root { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      body {
        font-feature-settings: 'cv02','cv03','cv04','cv11','ss01';
        -webkit-font-smoothing: antialiased;
        color: #0f172a;
      }
      .font-display { font-family: 'Inter', -apple-system, sans-serif; letter-spacing: -0.025em; font-weight: 700; }
      .font-mono-ui { font-family: 'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace; font-feature-settings: 'ss01'; }
      .tabular-nums { font-variant-numeric: tabular-nums; }

      @keyframes ping-dot { 75%, 100% { transform: scale(2.2); opacity: 0; } }
      .pulse-dot { position: relative; }
      .pulse-dot::after {
        content: ''; position: absolute; inset: 0; border-radius: 9999px;
        background: currentColor; animation: ping-dot 2s cubic-bezier(0,0,.2,1) infinite;
      }

      @keyframes spin-slow { to { transform: rotate(360deg); } }
      .spin-slow { animation: spin-slow 1.4s linear infinite; }

      @keyframes slide-in { from { opacity: 0; transform: translateY(-6px);} to { opacity: 1; transform: translateY(0);} }
      .event-enter { animation: slide-in 0.35s cubic-bezier(.16,1,.3,1); }

      @keyframes toast-in {
        from { opacity: 0; transform: translateX(24px) scale(0.96); }
        to { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes toast-out {
        from { opacity: 1; transform: translateX(0); max-height: 200px; margin-bottom: 8px; }
        to { opacity: 0; transform: translateX(24px); max-height: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0; }
      }
      .toast-in { animation: toast-in 0.32s cubic-bezier(.16,1,.3,1); }
      .toast-out { animation: toast-out 0.28s cubic-bezier(.4,0,1,1) forwards; overflow: hidden; }

      @keyframes menu-in {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .menu-in { animation: menu-in 0.16s cubic-bezier(.16,1,.3,1); transform-origin: top right; }

      .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
      .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
      .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
      .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

      .grid-bg {
        background-image:
          linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px);
        background-size: 32px 32px;
      }
    `}</style>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════════════════════
export default function App({ user, onSignOut }) {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [backendDown, setBackendDown] = useState(false);

  // ── Autosync state ──────────────────────────────────────────────────────
  const [autoSync, setAutoSync] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem('gmc-autosync');
    return saved === null ? true : saved === 'true';
  });
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [autoSyncState, setAutoSyncState] = useState('idle'); // idle | refreshing | syncing | error
  const autoSyncBusyRef = useRef(false); // prevents overlapping backend syncs
  const refreshBusyRef = useRef(false);  // prevents overlapping DB re-reads

  useEffect(() => {
    window.localStorage.setItem('gmc-autosync', String(autoSync));
  }, [autoSync]);

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const [notifEnabled, setNotifEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );
  const seenEventIdsRef = useRef(new Set());
  const isFirstEventRunRef = useRef(true);

  useEffect(() => {
    api.health().catch(() => setBackendDown(true));
  }, []);

  const { data: accounts, loading: accountsLoading, refresh: refreshAccounts } = useAccounts();
  const { data: products, refresh: refreshProducts } = useProducts(selectedAccount || 'all', statusFilter);
  const { data: stats, refresh: refreshStats } = useStats(selectedAccount || 'all');
  const { events } = useEvents(selectedAccount || 'all');
  const { events: allEvents } = useEvents('all');

const refreshAll = useCallback(async () => {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;
    // Silent refresh — don't touch autoSyncState so the header pill doesn't flicker.
    // Errors are logged but not surfaced; the next tick will retry.
    try {
      const tasks = [refreshProducts(), refreshStats()];
      if (!selectedAccount) tasks.push(refreshAccounts());
      await Promise.all(tasks);
    } catch (e) {
      console.warn('[refresh] silent refresh failed:', e?.message || e);
    } finally {
      refreshBusyRef.current = false;
    }
  }, [selectedAccount, refreshProducts, refreshStats, refreshAccounts]);


  // ── Fast DB poll: every FAST_REFRESH_MS, pause when tab hidden ──────────
  useEffect(() => {
    if (!autoSync) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshAll();
    };
    const id = setInterval(tick, FAST_REFRESH_MS);
    // When tab regains focus, refresh immediately so we catch up fast.
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [autoSync, refreshAll]);

  // ── Backend→GMC sync: every BACKEND_SYNC_MS for the selected account ────
  useEffect(() => {
    if (!autoSync || !selectedAccount) return;

    const doSync = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (autoSyncBusyRef.current || syncing) return; // skip if manual sync running
      autoSyncBusyRef.current = true;
      setAutoSyncState('syncing');
      try {
        await api.syncAccount(selectedAccount);
        await Promise.all([refreshProducts(), refreshStats()]);
        setLastSyncAt(new Date());
        setAutoSyncState('idle');
      } catch (e) {
        // Don't alert — autosync failures are background noise. Log only.
        console.warn('[autosync] background sync failed:', e?.message || e);
        setAutoSyncState('error');
      } finally {
        autoSyncBusyRef.current = false;
      }
    };

    const initialTimer = setTimeout(doSync, INITIAL_SYNC_DELAY_MS);
    const interval = setInterval(doSync, BACKEND_SYNC_MS);
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
  }, [autoSync, selectedAccount, refreshProducts, refreshStats, syncing]);

  // ── Refresh-on-event: new events = instant UI refresh ───────────────────
  const lastSeenEventCountRef = useRef(0);
  useEffect(() => {
    if (!events) return;
    // Skip the first tick so we don't refresh needlessly on mount.
    if (lastSeenEventCountRef.current === 0 && events.length > 0) {
      lastSeenEventCountRef.current = events.length;
      return;
    }
    if (events.length > lastSeenEventCountRef.current) {
      lastSeenEventCountRef.current = events.length;
      refreshAll();
    }
  }, [events, refreshAll]);

    const seenAccountIdsRef = useRef(null);
  useEffect(() => {
    if (!accounts) return;

    // First time accounts data loads: seed the seen-set, don't sync anything.
    if (seenAccountIdsRef.current === null) {
      seenAccountIdsRef.current = new Set(accounts.map(a => a.account_id));
      return;
    }

    const newAccounts = accounts.filter(
      a => !seenAccountIdsRef.current.has(a.account_id)
    );
    if (newAccounts.length === 0) return;

    // Claim them immediately so rapid re-renders don't fire duplicate syncs.
    newAccounts.forEach(a => seenAccountIdsRef.current.add(a.account_id));

    (async () => {
      setAutoSyncState('syncing');
      for (const a of newAccounts) {
        try {
          console.log(`[autosync] initial sync for new account ${a.account_id}`);
          await api.syncAccount(a.account_id, true); // force=true bypasses cooldown
        } catch (e) {
          console.warn(
            `[autosync] initial sync failed for ${a.account_id}:`,
            e?.message || e,
          );
        }
      }
      // Refresh everything so the new counts/products show up.
      await Promise.all([refreshAccounts(), refreshProducts(), refreshStats()]);
      setLastSyncAt(new Date());
      setAutoSyncState('idle');
    })();
  }, [accounts, refreshAccounts, refreshProducts, refreshStats]);

  // Detect new approved/disapproved events and surface them as toasts
useEffect(() => {
    if (!allEvents || allEvents.length === 0) return;

    // First poll after mount: mark everything as "already seen" so we don't
    // spam the user with toasts for historical events.
    if (isFirstEventRunRef.current) {
      allEvents.forEach(ev => seenEventIdsRef.current.add(ev.id));
      isFirstEventRunRef.current = false;
      return;
    }

    const newOnes = allEvents.filter(ev => ev.id && !seenEventIdsRef.current.has(ev.id));
    if (newOnes.length === 0) return;

    const incoming = [];
    newOnes.forEach(ev => {
      seenEventIdsRef.current.add(ev.id);
      const val = (ev.new_value || '').toLowerCase();
      if (val !== 'approved' && val !== 'disapproved') return;

      const toast = {
        id: `${ev.id}-${Date.now()}`,
        status: val,
        offer_id: ev.offer_id,
        account_id: ev.account_id,
        leaving: false,
      };
      incoming.push(toast);

      // Browser notification (silent if permission wasn't granted)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const title = val === 'approved' ? '✅ Product approved' : '🚨 Product disapproved';
        const acctTag = ev.account_id ? ` · ${ev.account_id.slice(-6)}` : '';
        new Notification(title, {
          body: `${ev.offer_id || 'product'}${acctTag}`,
          tag:  `gmc-${ev.id}`,
        });
      }
    });

    if (incoming.length === 0) return;
    setToasts(prev => [...prev, ...incoming]);

    // Schedule auto-dismiss with exit animation
    incoming.forEach(t => {
      setTimeout(() => {
        setToasts(prev => prev.map(x => x.id === t.id ? { ...x, leaving: true } : x));
        setTimeout(() => {
          setToasts(prev => prev.filter(x => x.id !== t.id));
        }, 280);
      }, 8000);
    });
  }, [allEvents]);

  

  const dismissToast = (id) => {
    setToasts(prev => prev.map(x => x.id === id ? { ...x, leaving: true } : x));
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id));
    }, 280);
  };

  const toggleNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Your browser does not support notifications.');
      return;
    }
    if (Notification.permission === 'granted') {
      setNotifEnabled(false);
      alert('To fully disable, revoke permission in your browser site settings. Toast notifications will stop appearing for now.');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifEnabled(perm === 'granted');
  };

  const hasAccounts = accounts && accounts.length > 0;
  const activeAccount = accounts?.find(a => a.account_id === selectedAccount);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let result = products;

    // Defensive account filter — prevents products from other accounts
    // leaking in if the hook/API doesn't filter server-side.
    if (selectedAccount) {
      result = result.filter(p => p.account_id === selectedAccount);
    }

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        p.title?.toLowerCase().includes(s) || p.offer_id?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [products, search, selectedAccount]);

const handleSync = async () => {
    if (!selectedAccount) return;
    setSyncing(true);
    setAutoSyncState('syncing');
    try {
      await api.syncAccount(selectedAccount, true);  // force=true — manual button bypasses cooldown
      await Promise.all([refreshProducts(), refreshStats()]);
      setLastSyncAt(new Date());
      setAutoSyncState('idle');
    } catch (e) {
      setAutoSyncState('error');
      alert(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Stats: prefer server-side, but fall back to computing from filtered
  // products when an account is selected, so the KPI cards never show
  // aggregate cross-account numbers while inside one account.
  const totals = useMemo(() => {
    if (selectedAccount && products) {
      const own = products.filter(p => p.account_id === selectedAccount);
      // Only recompute when the server returned unfiltered data (wrong total).
      const serverTotal = stats?.total ?? 0;
      if (serverTotal !== own.length && own.length > 0) {
        return {
          total: own.length,
          approved: own.filter(p => p.status === 'approved').length,
          pending: own.filter(p => p.status === 'pending').length,
          disapproved: own.filter(p => p.status === 'disapproved').length,
        };
      }
    }
    return stats || { total: 0, approved: 0, pending: 0, disapproved: 0 };
  }, [stats, products, selectedAccount]);
  const approvalRate = totals.total ? ((totals.approved / totals.total) * 100).toFixed(1) : '0';

  // ── Backend down ─────────────────────────────────────────────────────────
  if (backendDown) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mx-auto mb-5">
              <ServerCrash className="w-6 h-6 text-rose-600" />
            </div>
            <h2 className="font-display text-3xl text-slate-900 mb-2">Backend unreachable</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              The dashboard couldn't reach the API at <code className="font-mono-ui text-sm bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">/api</code>.
              Make sure the FastAPI server is running on port 8000.
            </p>
            <div className="bg-slate-900 text-slate-200 rounded-xl p-4 text-left font-mono-ui text-xs">
              <div className="text-slate-500">$ cd backend</div>
              <div className="text-slate-500">$ pip install -r requirements.txt</div>
              <div>uvicorn app.main:app --reload --port 8000</div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm shadow-indigo-600/20"
            >
              Retry connection
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!accountsLoading && !hasAccounts) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen bg-slate-50">
          <Header
            events={events}
            onSync={handleSync}
            syncing={syncing}
            showSync={false}
            user={user}
            onSignOut={onSignOut}
          />
          <div className="relative flex items-center justify-center px-8 py-24 overflow-hidden">
            <div className="absolute inset-0 grid-bg opacity-60 pointer-events-none" />
            <div className="relative max-w-lg text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                <Link2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="font-display text-5xl text-slate-900 mb-3">
                Connect your first account
              </h1>
              <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                Link a Google Merchant Center account to manage products, track approval
                status, and receive real-time webhook notifications.
              </p>
              <button
                onClick={() => setShowConnect(true)}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-md shadow-indigo-600/25"
              >
                <Plus className="w-4 h-4" />
                Connect Merchant Center
              </button>
            </div>
          </div>
          {showConnect && (
            <ConnectAccount onClose={() => setShowConnect(false)} onSuccess={() => refreshAccounts()} />
          )}
        </div>
      </>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Header
          events={events}
          onSync={handleSync}
          syncing={syncing}
          showSync={!!selectedAccount}
          notifEnabled={notifEnabled}
          onToggleNotifications={toggleNotifications}
          autoSync={autoSync}
          onToggleAutoSync={() => setAutoSync(v => !v)}
          autoSyncState={autoSyncState}
          lastSyncAt={lastSyncAt}
          user={user}
          onSignOut={onSignOut}
        />

        <div className="flex-1">
          {selectedAccount ? (
            <ProductsView
              account={activeAccount}
              products={filteredProducts}
              rawProductsLoaded={products !== null}
              totals={totals}
              approvalRate={approvalRate}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              events={events}
              onBack={() => { setSelectedAccount(null); setSearch(''); setStatusFilter('all'); }}
              onSync={handleSync}
              syncing={syncing}
            />
          ) : (
            <AccountsView
              accounts={accounts}
              totals={totals}
              approvalRate={approvalRate}
              events={events}
              onSelect={setSelectedAccount}
              onConnect={() => setShowConnect(true)}
            />
          )}
        </div>

        <Footer autoSync={autoSync} autoSyncState={autoSyncState} lastSyncAt={lastSyncAt} />

        <ToastStack toasts={toasts} accounts={accounts} onDismiss={dismissToast} />

        {showConnect && (
          <ConnectAccount onClose={() => setShowConnect(false)} onSuccess={() => refreshAccounts()} />
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Accounts view
// ═══════════════════════════════════════════════════════════════════════════
function AccountsView({ accounts, totals, approvalRate, events, onSelect, onConnect }) {
  // Local search + status filter for the accounts table.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const accountStats = useMemo(() => {
    const list = accounts ?? [];
    return {
      total: list.length,
      withApproved:    list.filter(a => (a.approved_count ?? 0) > 0).length,
      withDisapproved: list.filter(a => (a.disapproved_count ?? 0) > 0).length,
      withPending:     list.filter(a => (a.pending_count ?? 0) > 0).length,
    };
  }, [accounts]);
  const pct = (n) => accountStats.total ? `${((n / accountStats.total) * 100).toFixed(0)}% of accounts` : '—';

  // Filter = accounts that HAVE at least one product in that state.
  // `clean` = nothing disapproved AND nothing pending (everything approved).
  const filteredAccounts = useMemo(() => {
    const list = accounts ?? [];
    let result = list;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(a =>
        a.display_name?.toLowerCase().includes(s) ||
        a.account_id?.toLowerCase().includes(s)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(a => {
        const approved    = a.approved_count    ?? a.approved    ?? 0;
        const disapproved = a.disapproved_count ?? a.disapproved ?? 0;
        const pending     = a.pending_count     ?? a.pending     ?? 0;
        if (statusFilter === 'approved')    return approved > 0;
        if (statusFilter === 'disapproved') return disapproved > 0;
        if (statusFilter === 'pending')     return pending > 0;
        if (statusFilter === 'clean')       return disapproved === 0 && pending === 0 && approved > 0;
        return true;
      });
    }

    return result;
  }, [accounts, search, statusFilter]);

  const isFiltered = search.trim().length > 0 || statusFilter !== 'all';

  return (
    <>
      {/* Hero */}
      <section className="relative px-8 pt-12 pb-10 border-b border-slate-200 bg-white overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="relative flex items-end justify-between gap-8">
          <div>
            <Breadcrumb items={['Dashboard', 'Accounts']} />
            <h1 className="font-display text-[44px] leading-[1.1] text-slate-900 mt-4">
              Merchant accounts
            </h1>
          </div>

          <button
            onClick={onConnect}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition rounded-lg shadow-sm shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            Connect account
          </button>
        </div>
      </section>

      {/* KPIs */}
      <section className="px-8 py-8">
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Accounts connected"
            value={accountStats.total.toLocaleString()}
            sub={totals.total ? `${totals.total.toLocaleString()} products in total` : 'No products yet'}
            icon={<Link2 className="w-4 h-4" />}
          />
          <KPICard
            label="With approved products"
            value={accountStats.withApproved.toLocaleString()}
            sub={pct(accountStats.withApproved) + ' live'}
            icon={<CheckCircle2 className="w-4 h-4" />}
            accent="emerald"
          />
          <KPICard
            label="With disapproved"
            value={accountStats.withDisapproved.toLocaleString()}
            sub={accountStats.withDisapproved > 0 ? 'needs attention' : 'all clear'}
            icon={<XCircle className="w-4 h-4" />}
            accent="rose"
          />
          <KPICard
            label="Under review"
            value={accountStats.withPending.toLocaleString()}
            sub="awaiting Google decision"
            icon={<Clock className="w-4 h-4" />}
            accent="amber"
          />
        </div>
      </section>

      {/* Accounts table */}
      <section className="px-8 pb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg text-slate-900">Linked accounts</h2>
              <span className="font-mono-ui text-[10px] tracking-wide text-slate-500 uppercase px-2 py-0.5 bg-slate-100 rounded-md">
                {isFiltered
                  ? `${filteredAccounts.length} of ${accounts?.length ?? 0}`
                  : `${accounts?.length ?? 0} total`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name or account ID…"
                  className="w-72 bg-white border border-slate-200 pl-10 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-lg transition"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white p-0.5 gap-0.5">
                {[
                  { key: 'all',         label: 'All' },
                  { key: 'disapproved', label: 'Disapproved' },
                  { key: 'pending',     label: 'Pending' },
                  { key: 'approved',    label: 'Approved' },
                  { key: 'clean',       label: 'Healthy' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setStatusFilter(opt.key)}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                      statusFilter === opt.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-50/60">
              <tr className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase">
                <th className="text-left font-medium px-6 py-3 border-b border-slate-200 w-[40%]">Account</th>
                <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Account ID</th>
                <th className="text-right font-medium px-3 py-3 border-b border-slate-200">Products</th>
                <th className="text-right font-medium px-3 py-3 border-b border-slate-200">GMC Status</th>
                <th className="text-right font-medium px-6 py-3 border-b border-slate-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a, i) => {
                const productCount = a.total_products ?? a.product_count ?? null;
                const approvedCount    = a.approved_count    ?? a.approved    ?? 0;
                const disapprovedCount = a.disapproved_count ?? a.disapproved ?? 0;
                const pendingCount     = a.pending_count     ?? a.pending     ?? 0;
                const hasApproved    = approvedCount    > 0;
                const hasDisapproved = disapprovedCount > 0;
                const hasPending     = pendingCount     > 0;
                const hasAnyStatus   = hasApproved || hasDisapproved || hasPending;
                return (
                  <tr
                    key={a.account_id}
                    onClick={() => onSelect(a.account_id)}
                    className={`hover:bg-slate-50 transition cursor-pointer group ${i < filteredAccounts.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:border-indigo-300 group-hover:text-indigo-600 group-hover:from-indigo-50 group-hover:to-white transition">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-slate-900 font-semibold">{a.display_name}</div>
                          <div className="font-mono-ui text-[11px] text-slate-400 mt-0.5">Merchant API · v1</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 font-mono-ui text-xs text-slate-500">{a.account_id}</td>
                    <td className="px-3 py-4 text-right font-mono-ui text-sm text-slate-900 tabular-nums font-semibold">
                      {productCount !== null ? productCount.toLocaleString() : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {hasApproved && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-semibold rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Approved
                          </span>
                        )}
                        {hasDisapproved && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-semibold rounded-full">
                            <XCircle className="w-3 h-3" />
                            Disapproved
                          </span>
                        )}
                        {hasPending && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-semibold rounded-full">
                            <Clock className="w-3 h-3" />
                            Under review
                          </span>
                        )}
                        {!hasAnyStatus && (
                          <span className="text-slate-300 font-mono-ui text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 bg-slate-50 text-slate-600 text-[11px] font-semibold rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Connected
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAccounts.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <div className="font-display text-lg text-slate-900 mb-1.5">No accounts match</div>
              <div className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
                {search && <>No results for <span className="font-mono-ui text-slate-700">"{search}"</span>. </>}
                Try adjusting your search or filter.
              </div>
              <button
                onClick={() => { setSearch(''); setStatusFilter('all'); }}
                className="text-sm text-indigo-600 font-medium hover:text-indigo-700"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Recent activity */}
      {events.length > 0 && (
        <section className="px-8 pb-10">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-xl text-slate-900 flex items-center gap-2">
                Recent activity
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
              </h2>
              <p className="font-mono-ui text-[11px] tracking-wide text-slate-400 uppercase mt-1">
                Across all accounts · {events.length} events
              </p>
            </div>
            <Radio className="w-4 h-4 text-indigo-600" />
          </div>
          <EventsTable events={events.slice(0, 8)} />
        </section>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Products view
// ═══════════════════════════════════════════════════════════════════════════
function ProductsView({
  account, products, rawProductsLoaded, totals, approvalRate,
  search, setSearch, statusFilter, setStatusFilter,
  events, onBack, onSync, syncing,
}) {
  return (
    <>
      {/* Hero */}
      <section className="relative px-8 pt-10 pb-8 border-b border-slate-200 bg-white overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="relative">
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
            Back to accounts
          </button>

          <div className="flex items-end justify-between gap-8">
            <div>
              <Breadcrumb items={['Accounts', account?.display_name || '—']} />
              <h1 className="font-display text-[44px] leading-[1.1] text-slate-900 mt-4">
                {account?.display_name}
              </h1>
              <div className="flex items-center gap-2 mt-4">
                <Chip>ACCT · {account?.account_id}</Chip>
                <Chip>MERCHANT API v1</Chip>
                <span className="inline-flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wide uppercase px-2 py-1 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-md font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition rounded-lg disabled:opacity-50 shadow-sm"
              >
                {syncing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
                  : <><RefreshCw className="w-4 h-4" /> Sync now</>}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="px-8 py-8">
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Total products" value={totals.total.toLocaleString()} sub="in this account" icon={<Box className="w-4 h-4" />} />
          <KPICard label="Approved" value={totals.approved.toLocaleString()} sub={`${approvalRate}% approval rate`} icon={<CheckCircle2 className="w-4 h-4" />} accent="emerald" />
          <KPICard label="Pending" value={totals.pending.toLocaleString()} sub="awaiting decision" icon={<Clock className="w-4 h-4" />} accent="amber" />
          <KPICard label="Disapproved" value={totals.disapproved.toLocaleString()} sub={totals.total ? `${((totals.disapproved/totals.total)*100).toFixed(1)}% of inventory` : '—'} icon={<XCircle className="w-4 h-4" />} accent="rose" />
        </div>
      </section>

      {/* Products table */}
      <section className="px-8 pb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg text-slate-900">Inventory</h2>
              <span className="font-mono-ui text-[10px] tracking-wide text-slate-500 uppercase px-2 py-0.5 bg-slate-100 rounded-md">
                {products.length} items
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search offer_id or title…"
                  className="w-72 bg-white border border-slate-200 pl-10 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-lg transition"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white p-0.5 gap-0.5">
                {['all', 'approved', 'pending', 'disapproved'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                      statusFilter === s
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s === 'all' ? 'All' : STATUS_STYLES[s]?.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 sticky top-0 z-10 backdrop-blur">
                <tr className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase">
                  <th className="text-left font-medium px-6 py-3 border-b border-slate-200">Offer ID</th>
                  <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Title</th>
                  <th className="text-right font-medium px-3 py-3 border-b border-slate-200">Issues</th>
                  <th className="text-right font-medium px-3 py-3 border-b border-slate-200">Updated</th>
                  <th className="text-right font-medium px-6 py-3 border-b border-slate-200 w-[180px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 transition ${i < products.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <td className="px-6 py-3.5 font-mono-ui text-xs text-slate-600 font-medium">{p.offer_id}</td>
                    <td className="px-3 py-3.5 text-slate-900">{p.title}</td>
                    <td className="px-3 py-3.5 text-right">
                      {p.issue_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-mono-ui text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          {p.issue_count}
                        </span>
                      ) : <span className="text-slate-300 font-mono-ui text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3.5 font-mono-ui text-xs text-right text-slate-400 tabular-nums">
                      {p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {products.length === 0 && (
              <div className="py-24 text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Database className="w-5 h-5 text-slate-400" />
                </div>
                <div className="font-display text-lg text-slate-900 mb-1.5">
                  {!rawProductsLoaded ? 'Loading…' : 'No products yet'}
                </div>
                <div className="text-sm text-slate-500 max-w-sm mx-auto">
                  Run <button onClick={onSync} className="text-indigo-600 font-medium hover:text-indigo-700">sync</button> to pull products from this account.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Live feed */}
      {events.length > 0 && (
        <section className="px-8 pb-10">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-xl text-slate-900 flex items-center gap-2">
                Live feed
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
              </h2>
              <p className="font-mono-ui text-[11px] tracking-wide text-slate-400 uppercase mt-1">
                PRODUCT_STATUS_CHANGE · {events.length} events
              </p>
            </div>
            <Radio className="w-4 h-4 text-indigo-600" />
          </div>
          <EventsTable events={events.slice(0, 12)} showContext />
        </section>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════════════
function Header({
  events, onSync, syncing, showSync, notifEnabled, onToggleNotifications,
  autoSync, onToggleAutoSync, autoSyncState, lastSyncAt,
  user, onSignOut,
}) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center justify-between px-8 h-16">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-600/20">
            <div className="w-2.5 h-2.5 bg-white rounded-sm" />
            <div className="absolute -right-0.5 -top-0.5 w-2 h-2 bg-amber-400 rounded-full ring-2 ring-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px] text-slate-900">Merchant</span>
            <span className="font-mono-ui text-[9px] tracking-wider text-slate-400 uppercase -mt-0.5">Control · v1.0</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Autosync indicator / toggle */}
          {autoSync !== undefined && (
            <AutoSyncPill
              autoSync={autoSync}
              state={autoSyncState}
              lastSyncAt={lastSyncAt}
              onToggle={onToggleAutoSync}
            />
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
            <span className="font-mono-ui text-[10px] tracking-wide text-emerald-700 font-semibold">LIVE</span>
            <span className="text-emerald-300">·</span>
            <span className="font-mono-ui text-[10px] text-emerald-700">{events?.length || 0}</span>
          </div>

          {showSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3.5 py-1.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition text-sm text-slate-700 rounded-lg disabled:opacity-50 font-medium"
            >
              {syncing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Syncing</span></>
                : <><RefreshCw className="w-3.5 h-3.5" /><span>Sync</span></>}
            </button>
          )}

          <button
            onClick={onToggleNotifications}
            title={notifEnabled ? 'Notifications enabled — click for info' : 'Enable browser notifications'}
            className={`relative w-9 h-9 flex items-center justify-center border rounded-lg transition ${
              notifEnabled
                ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
            }`}
          >
            {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {notifEnabled && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </button>

          <UserMenu user={user} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSignOut = async () => {
    if (!onSignOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } catch (e) {
      console.error('[signout] failed:', e);
      setSigningOut(false);
      setOpen(false);
    }
    // On success, AuthGate swaps to <Login />, so we don't reset state here.
  };

  const initial = (user?.display_name || user?.email || '?').trim()[0]?.toUpperCase() || '?';
  const name = user?.display_name || user?.email?.split('@')[0] || 'User';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-9 h-9 flex items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-700 text-white font-semibold text-sm shadow-sm shadow-indigo-600/20 hover:shadow-md transition ${
          open ? 'ring-2 ring-indigo-500/30' : ''
        }`}
        aria-label="User menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div className="menu-in absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-900/10 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="font-mono-ui text-[9px] tracking-wider text-slate-400 uppercase mb-1.5">
              Signed in as
            </div>
            <div className="font-semibold text-sm text-slate-900 truncate">{name}</div>
            {user?.email && (
              <div className="font-mono-ui text-[11px] text-slate-500 mt-0.5 truncate">
                {user.email}
              </div>
            )}
          </div>
          <div className="py-1">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {signingOut ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing out…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  Sign out
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoSyncPill({ autoSync, state, lastSyncAt, onToggle }) {
  // Human-friendly "last synced" text that ticks without re-rendering the world.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const agoText = lastSyncAt ? timeAgo(lastSyncAt) : null;

  if (!autoSync) {
    return (
      <button
        onClick={onToggle}
        title="Auto-sync is OFF. Click to enable."
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-full text-slate-500 hover:text-slate-700 transition"
      >
        <ZapOff className="w-3.5 h-3.5" />
        <span className="font-mono-ui text-[10px] tracking-wide uppercase font-semibold">Auto off</span>
      </button>
    );
  }

  const isWorking = state === 'syncing' || state === 'refreshing';
  const isError = state === 'error';

  return (
    <button
      onClick={onToggle}
      title={`Auto-sync is ON${agoText ? ` · last synced ${agoText}` : ''}. Click to disable.`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${
        isError
          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
          : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
      }`}
    >
      {isWorking
        ? <RefreshCw className="w-3.5 h-3.5 spin-slow" />
        : <Zap className="w-3.5 h-3.5" />}
      <span className="font-mono-ui text-[10px] tracking-wide uppercase font-semibold">
        {state === 'syncing' ? 'Syncing' : state === 'refreshing' ? 'Refresh' : isError ? 'Retry' : 'Auto'}
      </span>
      {agoText && !isWorking && (
        <>
          <span className="text-indigo-300">·</span>
          <span className="font-mono-ui text-[10px] text-indigo-600">{agoText}</span>
        </>
      )}
    </button>
  );
}

function timeAgo(date) {
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Footer({ autoSync, autoSyncState, lastSyncAt }) {
  const statusText = !autoSync
    ? 'Auto-sync: OFF'
    : autoSyncState === 'syncing'
      ? 'Auto-sync: pulling from GMC…'
      : autoSyncState === 'refreshing'
        ? 'Auto-sync: refreshing…'
        : autoSyncState === 'error'
          ? 'Auto-sync: last attempt failed'
          : lastSyncAt
            ? `Auto-sync: on · last pull ${timeAgo(lastSyncAt)}`
            : 'Auto-sync: on';

  return (
    <footer className="border-t border-slate-200 bg-white px-8 py-4 flex justify-between items-center">
      <div className="flex items-center gap-4 font-mono-ui text-[10px] text-slate-400 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-indigo-600" />
          Merchant API · v1
        </span>
        <span className="text-slate-300">·</span>
        <span>merchantapi.googleapis.com</span>
        <span className="text-slate-300">·</span>
        <span>OAuth · content scope</span>
        <span className="text-slate-300">·</span>
        <span className={autoSync ? 'text-indigo-500' : 'text-slate-400'}>{statusText}</span>
      </div>
      <div className="font-mono-ui text-[10px] text-slate-400 uppercase tracking-wider tabular-nums">
        UTC {new Date().toISOString().slice(11, 19)}
      </div>
    </footer>
  );
}

function Breadcrumb({ items }) {
  return (
    <div className="flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wider uppercase">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className={i === items.length - 1 ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
            {item}
          </span>
          {i < items.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
        </span>
      ))}
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wide text-slate-500 uppercase px-2 py-1 bg-white border border-slate-200 rounded-md">
      {children}
    </span>
  );
}

function KPICard({ label, value, sub, icon, accent }) {
  const accents = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
  };
  const a = accent ? accents[accent] : null;
  return (
    <div className="relative bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition">
      <div className="flex items-start justify-between mb-4">
        <span className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase font-semibold">{label}</span>
        <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${a ? `${a.bg} ${a.icon}` : 'bg-slate-100 text-slate-500'}`}>
          {icon}
        </span>
      </div>
      <div className="font-display text-[36px] leading-none text-slate-900 tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 mt-2.5">{sub}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 border ${s.border} ${s.bg} ${s.text} text-[11px] font-semibold rounded-full`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function EventsTable({ events, showContext = false }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50/60">
          <tr className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase">
            <th className="text-left font-medium px-6 py-3 border-b border-slate-200">Time</th>
            <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Offer ID</th>
            {showContext
              ? <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Context</th>
              : <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Account</th>}
            <th className="text-left font-medium px-3 py-3 border-b border-slate-200">Transition</th>
            <th className="text-right font-medium px-6 py-3 border-b border-slate-200">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev, i) => {
            const t = ev.event_time ? new Date(ev.event_time).toTimeString().slice(0, 8) : '—';
            return (
              <tr
                key={ev.id || i}
                className={`hover:bg-slate-50 transition ${i < events.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <td className="px-6 py-3 font-mono-ui text-[11px] text-slate-400 tabular-nums">{t}</td>
                <td className="px-3 py-3 font-mono-ui text-xs text-slate-900 font-medium">{ev.offer_id || '—'}</td>
                {showContext ? (
                  <td className="px-3 py-3">
                    <span className="font-mono-ui text-[9px] tracking-wider text-slate-500 uppercase px-1.5 py-0.5 bg-slate-100 rounded">
                      {ev.reporting_context || 'SHOPPING_ADS'}
                    </span>
                  </td>
                ) : (
                  <td className="px-3 py-3 font-mono-ui text-[11px] text-slate-500">·{(ev.account_id || '').slice(-6)}</td>
                )}
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 font-mono-ui text-[11px]">
                    {ev.old_value
                      ? <span className="text-slate-500">{ev.old_value}</span>
                      : <span className="text-slate-300 italic">null</span>}
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                    <span className="text-slate-900 font-semibold">{ev.new_value || '—'}</span>
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <StatusBadge status={ev.new_value} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ToastStack({ toasts, accounts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-[60] flex flex-col gap-2 w-[340px] pointer-events-none">
      {toasts.map(t => {
        const isApproved = t.status === 'approved';
        const accountName = accounts?.find(a => a.account_id === t.account_id)?.display_name;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto bg-white border rounded-xl shadow-lg shadow-slate-900/5 p-4 flex items-start gap-3 ${t.leaving ? 'toast-out' : 'toast-in'} ${
              isApproved ? 'border-emerald-200' : 'border-rose-200'
            }`}
          >
            <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
              isApproved ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {isApproved ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-slate-900 leading-tight">
                {isApproved ? 'Product approved' : 'Product disapproved'}
              </div>
              <div className="font-mono-ui text-[11px] text-slate-500 mt-1 truncate">
                {t.offer_id || '—'}
              </div>
              {accountName && (
                <div className="text-xs text-slate-500 mt-0.5 truncate">{accountName}</div>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-900 transition p-0.5 -mr-0.5"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}