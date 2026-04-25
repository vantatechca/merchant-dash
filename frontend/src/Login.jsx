import { useState } from 'react';
import {
  Lock, Mail, Eye, EyeOff, ArrowRight, Loader2,
  CheckCircle2, Link2, Radio, Command,
  AlertCircle,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Global micro-styles — identical to App.jsx so this drops in cleanly.
// If Login is rendered alongside App, the <style> tags dedupe harmlessly.
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

      @keyframes login-fade-up {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .fade-up { animation: login-fade-up 0.5s cubic-bezier(.16,1,.3,1) both; }

      .grid-bg {
        background-image:
          linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px);
        background-size: 32px 32px;
      }

      /* Radial fade on the brand panel so the grid doesn't compete with the headline */
      .grid-bg-fade {
        mask-image: radial-gradient(ellipse at 30% 40%, black 30%, transparent 85%);
        -webkit-mask-image: radial-gradient(ellipse at 30% 40%, black 30%, transparent 85%);
      }
    `}</style>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Login
// Props: onSubmit({ email, password, remember }), onGoogleAuth()
// Both are optional — falls back to a stubbed delay so the page is previewable.
// ═══════════════════════════════════════════════════════════════════════════
export default function Login({ onSubmit, onGoogleAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit({ email, password, remember });
      } else {
        // Preview fallback so you can see the loading state without wiring anything
        await new Promise(r => setTimeout(r, 800));
        setError('No auth handler wired. Pass `onSubmit` to <Login />.');
      }
    } catch (err) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (onGoogleAuth) {
        await onGoogleAuth();
      } else {
        await new Promise(r => setTimeout(r, 600));
        setError('No Google handler wired. Pass `onGoogleAuth` to <Login />.');
      }
    } catch (err) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 flex text-slate-900">
        {/* ────────────────────────────────────────────────────────────────
            LEFT: brand / product preview
           ──────────────────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col justify-between relative w-[56%] bg-white border-r border-slate-200 overflow-hidden">
          <div className="absolute inset-0 grid-bg grid-bg-fade opacity-80 pointer-events-none" />

          {/* Logo — same lockup as Header */}
          <div className="relative px-12 pt-10 flex items-center gap-2.5 fade-up">
            <div className="relative w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-600/20">
              <div className="w-2.5 h-2.5 bg-white rounded-sm" />
              <div className="absolute -right-0.5 -top-0.5 w-2 h-2 bg-amber-400 rounded-full ring-2 ring-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-[15px] text-slate-900">Merchant</span>
              <span className="font-mono-ui text-[9px] tracking-wider text-slate-400 uppercase -mt-0.5">
                Control · v1.0
              </span>
            </div>
          </div>

          {/* Hero */}
          <div className="relative px-12 pb-8 max-w-2xl">
            <div
              className="flex items-center gap-1.5 font-mono-ui text-[10px] tracking-wider uppercase mb-5 fade-up"
              style={{ animationDelay: '60ms' }}
            >
              <span className="text-slate-400">Dashboard</span>
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <span className="text-slate-900 font-semibold">Sign in</span>
            </div>

            <h1
              className="font-display text-[56px] leading-[1.02] text-slate-900 mb-5 fade-up"
              style={{ animationDelay: '120ms' }}
            >
              Google Merchant,
              <br />
              <span className="text-indigo-600">under your control.</span>
            </h1>

            <p
              className="text-slate-600 text-base leading-relaxed mb-10 max-w-md fade-up"
              style={{ animationDelay: '180ms' }}
            >
              Multi-account product dashboard with real-time status webhooks,
              bulk sync, and issue triage across every linked Merchant Center account.
            </p>

            {/* Preview cards — same visual grammar as KPICard in App.jsx */}
            <div className="grid grid-cols-2 gap-3 max-w-md mb-5">
              <PreviewCard
                icon={<Link2 className="w-4 h-4" />}
                label="Accounts linked"
                value="142"
                sub="across 3 regions"
                delay="240ms"
              />
              <PreviewCard
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Approval rate"
                value="96.2%"
                sub="last 30 days"
                accent="emerald"
                delay="300ms"
              />
            </div>

            {/* Mini live-feed — echoes EventsTable styling */}
            <div
              className="relative max-w-md bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden fade-up"
              style={{ animationDelay: '360ms' }}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
                  <span className="font-mono-ui text-[10px] tracking-wider text-emerald-700 font-semibold uppercase">
                    Live feed
                  </span>
                </div>
                <Radio className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="divide-y divide-slate-100">
                <FeedRow time="08:42:14" offer="SKU-78291" transition={['pending', 'approved']} />
                <FeedRow time="08:41:58" offer="BPC-12-BRZ" transition={['approved', 'disapproved']} />
                <FeedRow time="08:41:22" offer="PEP-5011" transition={[null, 'approved']} />
              </div>
            </div>
          </div>

          {/* Footer — matches App.jsx Footer */}
          <div className="relative px-12 pb-10">
            <div className="flex items-center gap-4 font-mono-ui text-[10px] text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-indigo-600" />
                Merchant API · v1
              </span>
              <span className="text-slate-300">·</span>
              <span>merchantapi.googleapis.com</span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot text-emerald-500" />
                All systems operational
              </span>
            </div>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────
            RIGHT: form
           ──────────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col">
          {/* Mobile-only brand */}
          <div className="lg:hidden px-8 pt-8 flex items-center gap-2.5">
            <div className="relative w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-600/20">
              <div className="w-2.5 h-2.5 bg-white rounded-sm" />
              <div className="absolute -right-0.5 -top-0.5 w-2 h-2 bg-amber-400 rounded-full ring-2 ring-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-[15px] text-slate-900">Merchant</span>
              <span className="font-mono-ui text-[9px] tracking-wider text-slate-400 uppercase -mt-0.5">
                Control · v1.0
              </span>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10">
            <div className="w-full max-w-md fade-up">
              <div className="font-mono-ui text-[10px] tracking-wider text-slate-400 uppercase mb-3">
                AUTH · SIGN IN
              </div>
              <h2 className="font-display text-[38px] leading-[1.1] text-slate-900 mb-2">
                Welcome back
              </h2>
              <p className="text-slate-600 text-sm mb-8">
                Sign in to your Merchant control panel.
              </p>

              {/* Google OAuth — primary for GMC since content-scope needs it */}
              <button
                onClick={handleGoogle}
                type="button"
                disabled={googleLoading || submitting}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition text-sm font-semibold text-slate-900 rounded-lg shadow-sm mb-5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Redirecting to Google…
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Continue with Google
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="font-mono-ui text-[10px] tracking-wider text-slate-400 uppercase">
                  or sign in with email
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field
                  label="Email"
                  icon={<Mail className="w-4 h-4" />}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@vantatech.ca"
                  autoComplete="email"
                  disabled={submitting}
                />

                <Field
                  label="Password"
                  icon={<Lock className="w-4 h-4" />}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={submitting}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="text-slate-400 hover:text-slate-700 transition"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  rightLabel={
                    <button
                      type="button"
                      className="font-mono-ui text-[10px] tracking-wider uppercase text-indigo-600 hover:text-indigo-700 transition font-semibold"
                    >
                      Forgot?
                    </button>
                  }
                />

                {/* Remember me */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div
                      className={`w-4 h-4 border rounded flex items-center justify-center transition ${
                        remember
                          ? 'bg-indigo-600 border-indigo-600'
                          : 'bg-white border-slate-300 group-hover:border-slate-400'
                      }`}
                    >
                      {remember && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                  </div>
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition">
                    Keep me signed in for 30 days
                  </span>
                </label>

                {error && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg fade-up">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-rose-700">{error}</div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || googleLoading}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-md shadow-indigo-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 text-center">
                <p className="text-sm text-slate-500">
                  Don't have an account?{' '}
                  <a href="#" className="text-indigo-600 font-semibold hover:text-indigo-700 transition">
                    Request access
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Form footer */}
          <div className="px-8 py-5 border-t border-slate-200 flex items-center justify-between font-mono-ui text-[10px] text-slate-400 uppercase tracking-wider">
            <div className="flex items-center gap-3">
              <span>© 2026 Vanta Tech</span>
              <span className="text-slate-300">·</span>
              <a href="#" className="hover:text-slate-600 transition">Privacy</a>
              <span className="text-slate-300">·</span>
              <a href="#" className="hover:text-slate-600 transition">Terms</a>
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <kbd className="font-mono-ui text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500 flex items-center gap-0.5">
                <Command className="w-2.5 h-2.5" /> ↵
              </kbd>
              <span>to sign in</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════════════
function PreviewCard({ icon, label, value, sub, accent, delay }) {
  const accents = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  };
  const a = accent ? accents[accent] : null;
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm fade-up"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase font-semibold">
          {label}
        </span>
        <span
          className={`w-7 h-7 flex items-center justify-center rounded-lg ${
            a ? `${a.bg} ${a.icon}` : 'bg-slate-100 text-slate-500'
          }`}
        >
          {icon}
        </span>
      </div>
      <div className="font-display text-[26px] leading-none text-slate-900 tabular-nums mb-1">
        {value}
      </div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function FeedRow({ time, offer, transition }) {
  const [from, to] = transition;
  const STATUS_COLOR = {
    approved: 'text-emerald-700',
    pending: 'text-amber-700',
    disapproved: 'text-rose-700',
  };
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-xs">
      <span className="font-mono-ui text-[10px] text-slate-400 tabular-nums">{time}</span>
      <span className="font-mono-ui text-slate-900 font-semibold flex-1 truncate">{offer}</span>
      <span className="inline-flex items-center gap-1.5 font-mono-ui text-[11px]">
        {from ? (
          <span className={STATUS_COLOR[from] || 'text-slate-500'}>{from}</span>
        ) : (
          <span className="text-slate-300 italic">null</span>
        )}
        <ArrowRight className="w-3 h-3 text-slate-300" />
        <span className={`font-semibold ${STATUS_COLOR[to] || 'text-slate-900'}`}>{to}</span>
      </span>
    </div>
  );
}

function Field({ label, icon, rightSlot, rightLabel, ...inputProps }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-mono-ui text-[10px] tracking-wider text-slate-500 uppercase font-semibold">
          {label}
        </label>
        {rightLabel}
      </div>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {icon}
        </div>
        <input
          {...inputProps}
          className="w-full bg-white border border-slate-200 pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}