'use client';
// ============================================================================
// Sign-in screen with one-click demo accounts (one per role)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { useState } from 'react';
import { LifeBuoy, LogIn } from 'lucide-react';
import { useSession } from '@/lib/client/session';
import { DEMO_ACCOUNTS, ROLE_LABELS, ROLE_SUMMARY } from '@/lib/permissions';
import { Field } from './ui';

export default function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent, creds = { email, password }) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="header">
        <div className="container">
          <div className="brand">
            <div className="brand-icon"><LifeBuoy size={28} /></div>
            <div>
              <div className="brand-title">ReliefChain</div>
              <div className="brand-subtitle">Disaster Relief Management Portal</div>
            </div>
          </div>
        </div>
      </header>
      <div className="accent-line" />

      <div className="login-wrap">
        <div className="panel login-card stack-sm">
          <h2>Officer Sign In</h2>
          <p className="small muted">Sign in with your official account to continue.</p>

          <form className="form" onSubmit={submit}>
            <Field label="Email">
              <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <div className="alert alert-error">{error}</div>}
            <button className="btn btn-primary" disabled={busy}><LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}</button>
          </form>

          <div className="divider" />
          <p className="small muted">Demo accounts — click one to sign in:</p>
          <div className="demo-accounts">
            {DEMO_ACCOUNTS.map((d) => (
              <button key={d.email} className="demo-account" disabled={busy} onClick={() => submit(undefined, d)}>
                <span>
                  <span className="strong small">{ROLE_LABELS[d.role]}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>{ROLE_SUMMARY[d.role]}</span>
                </span>
                <span className="tiny dim">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
