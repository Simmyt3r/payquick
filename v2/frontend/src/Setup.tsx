import { useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Database, LockKeyhole, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { api } from './api';
import './AdminSetup.css';

type Migration = { filename: string; sha256: string; status: 'applied' | 'pending'; applied_at: string | null };
type SetupStatus = {
  migrations: Migration[];
  next_migration: string | null;
  bootstrap_completed: boolean;
  admin_configured: boolean;
};

export default function Setup({ onHome, onLogin }: { onHome: () => void; onLogin: () => void }) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [completed, setCompleted] = useState(false);

  async function call<T>(path: string, value: string) {
    return api<T>(path, { method: 'POST', headers: { 'X-Payquick-Setup-Token': value } });
  }

  async function inspect(e?: React.FormEvent) {
    e?.preventDefault();
    if (token.length < 48) return setError('Enter the complete setup token from your Vercel environment.');
    setBusy(true); setError(''); setMessage('');
    try {
      setStatus(await call<SetupStatus>('/setup/status', token));
    } catch (err) { setError((err as Error).message); setStatus(null); }
    finally { setBusy(false); }
  }

  async function applyNext() {
    if (!status?.next_migration || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await call<{ applied: string }>('/setup/apply-next', token);
      setMessage('Applied ' + result.applied + ' successfully.');
      setStatus(await call<SetupStatus>('/setup/status', token));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function createAdmin() {
    if (!status || status.next_migration || !status.admin_configured || busy) return;
    if (!window.confirm('Create the initial Payquick administrator from the Vercel email and password? This can only succeed once.')) return;
    setBusy(true); setError('');
    try {
      await call('/setup/create-admin', token);
      setCompleted(true); setStatus(null); setToken('');
      setMessage('Administrator created. Remove the initial setup token and password from Vercel, disable setup, and sign in.');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="pq-admin-bg">
    <div className="pq-admin-wrap">
      <header className="pq-admin-top">
        <div className="pq-admin-logo"><span><ShieldCheck size={22}/></span><strong>Payquick setup</strong></div>
        <button className="pq-text-action" type="button" onClick={onHome}><ArrowLeft size={17}/> Back to homepage</button>
      </header>
      <section className="pq-admin-head">
        <span className="pq-kicker">INITIAL DATABASE SETUP</span>
        <h1>Set up Payquick securely.</h1>
        <p>Apply only the approved migrations included in the application. Your first administrator is created from Vercel variables after the database is ready.</p>
      </section>
      <section className="pq-panel pq-warning" aria-label="Important setup notice">
        <CircleAlert size={20}/>
        <p>Use an <strong>isolated PostgreSQL database</strong>. Configure <code>DATABASE_URL</code>, <code>JWT_SECRET</code>, <code>PAYQUICK_ADMIN_EMAIL</code>, <code>PAYQUICK_ADMIN_PASSWORD</code>, <code>PAYQUICK_SETUP_TOKEN</code> and <code>PAYQUICK_SETUP_ENABLED=true</code> in Vercel, then redeploy. Keep payments and vending disabled. Do not enter your database credentials here.</p>
      </section>
      {!completed && <section className="pq-panel">
        <div className="pq-panel-title"><LockKeyhole size={19}/><h2>Authorize initial setup</h2></div>
        <form onSubmit={inspect} className="pq-form">
          <label htmlFor="pq-setup-secret">One-time setup token</label>
          <input id="pq-setup-secret" type="password" autoComplete="off" spellCheck={false} minLength={48}
            placeholder="Paste the setup token configured in Vercel" value={token}
            onChange={e => { setToken(e.target.value); setStatus(null); setError(''); }} required />
          <button className="pq-button" disabled={busy || token.length < 48} type="submit"><RefreshCw size={17}/>{busy ? 'Working…' : 'Check setup status'}</button>
          <p className="pq-caption">The token stays in this page's memory while open. It is sent in a request header, never in a URL or browser storage.</p>
        </form>
      </section>}
      {error && <div role="alert" className="pq-alert pq-alert-error">{error}</div>}
      {message && <div role="status" className="pq-alert pq-alert-success">{message}</div>}
      {status && !completed && <section className="pq-panel">
        <div className="pq-panel-title"><Database size={19}/><h2>Approved database migrations</h2></div>
        <div className="pq-stat-grid">
          <div><strong>{status.migrations.filter(m => m.status === 'applied').length}</strong><span>Applied</span></div>
          <div><strong>{status.migrations.filter(m => m.status === 'pending').length}</strong><span>Pending</span></div>
          <div><strong>{status.admin_configured ? 'Ready' : 'Missing'}</strong><span>Admin variables</span></div>
        </div>
        <div className="pq-migration-list">
          {status.migrations.map(item => <div className="pq-migration" key={item.filename}>
            {item.status === 'applied' ? <CheckCircle2 size={19} color="#1c956e"/> : <Wrench size={18} color="#577191"/>}
            <span>{item.filename}</span><strong>{item.status}</strong>
          </div>)}
        </div>
        {status.next_migration
          ? <><p className="pq-caption">Each click applies exactly one committed SQL migration in a database transaction. If it fails, no later migration is attempted.</p><button className="pq-button" type="button" disabled={busy} onClick={applyNext}><Database size={17}/>{busy ? 'Applying…' : 'Apply next migration: ' + status.next_migration}</button></>
          : <><p className="pq-caption">All migrations have been recorded. Create the first administrator to close initial setup permanently.</p><button className="pq-button" disabled={busy || !status.admin_configured} type="button" onClick={createAdmin}><ShieldCheck size={18}/>Create administrator from Vercel variables</button></>}
      </section>}
      {completed && <section className="pq-panel">
        <div className="pq-panel-title"><CheckCircle2 color="#18936d" size={24}/><h2>Initial setup complete</h2></div>
        <p>For security, now set <code>PAYQUICK_SETUP_ENABLED=false</code> and remove <code>PAYQUICK_SETUP_TOKEN</code> and <code>PAYQUICK_ADMIN_PASSWORD</code> from Vercel, then redeploy. The database administrator account persists.</p>
        <button className="pq-button" type="button" onClick={onLogin}>Go to admin sign in</button>
      </section>}
      <footer className="pq-admin-footer">Payquick v2 · Database setup is independent of Paystack and VTpass certification.</footer>
    </div>
  </main>;
}
