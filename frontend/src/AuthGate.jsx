// src/AuthGate.jsx
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import App from './App';
import Login from './Login';
import { api } from './api';

export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // On mount: ask the backend if we already have a valid sessions
  useEffect(() => {
    api.me()
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  // Initial session check — blank screen w/ spinner, no flash of Login
  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onSubmit={async ({ email, password, remember }) => {
          const u = await api.login(email, password, remember);
          setUser(u);  // flips to <App />
        }}
        onGoogleAuth={() => {
          window.location.href = '/api/auth/google';  // backend handles redirect
        }}
      />
    );
  }

  return <App user={user} onSignOut={async () => {
    await api.logout();
    setUser(null);
  }} />;
}