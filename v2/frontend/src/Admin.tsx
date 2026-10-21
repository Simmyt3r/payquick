import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, type Session } from './api';
import './AdminSetup.css';

type Migration = { filename: string; sha256: string; status: 'applied' | 'pending'; applied_at: string | null };
type Status = {
  migrations: Migration[]; next_migration: string | null; bootstrap_completed: boolean;
  admin_migrations_enabled: boolean;
};

export default function Admin({ session, onBack, onLogout }: {
  session: Session; onBack: () => void; onLogout: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try { setStatus(await api<Status>('/admin/migrations', { token: session.access_token })); }
    catch (err) { setStatus(null); setError((err as Error).message); }
  }, [session.access_token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function applyNext(e: React.FormEvent) {
    e.preventDefault();
    if (!status?.next_migration || !status.admin_migrations_enabled || !confirmed || !password) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ applied: string }>('/admin/migrations/apply-next', {
        method: 'POST', token: session.access_token, body: { confirmation_password: password },
      });
      setNotice('Migration ' + result.applied + ' applied successfully.');
      setPassword(''); setConfirmed(false); await refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setPassword(''); setBusy(false); }
  }

  return <main className="pq-admin-bg">
    <div className="pq-admin-wrap">
      <header className="pq-admin-top">
        <div className="pq-admin-logo"><span><ShieldCheck size={22}/></span><strong>Payquick administration</strong></div>
        <div className="pq-toolbar"><button className="pq-text-action" onClick={onBack}><ArrowLeft size={17}/> Dashboard</button><button className="pq-text-action" onClick={onLogout}>Sign out</button></div>
      </header>
      <section className="pq-admin-head">
        <span className="pq-kicker">DATABASE CONTROL CENTRE</span>
        <h1>Migration dashboard</h1>
        <p>Review migration history and apply reviewed, committed updates. This panel requires an active administrator account; permissions are verified by the database on every request.</p>
      </section>
      <div className="pq-panel pq-warning"><CircleAlert size={20}/><p>Only prepackaged SQL migrations are supported. Apply migrations during a maintenance window, after a verified database backup. This panel does not execute arbitrary SQL or enable financial transactions.</p></div>
      {error && <div className="pq-alert pq-alert-error" role="alert">{error}</div>}
      {notice && <div className="pq-alert pq-alert-success" role="status">{notice}</div>}
      <section className="pq-panel">
        <div className="pq-panel-title"><Database size={20}/><h2>Schema history</h2><button className="pq-refresh" onClick={() => void refresh()} disabled={busy} aria-label="Refresh migration history"><RefreshCw size={17}/></button></div>
        {status ? <>
          <div className="pq-stat-grid">
            <div><strong>{status.migrations.filter(x => x.status === 'applied').length}</strong><span>Applied</span></div>
            <div><strong>{status.migrations.filter(x => x.status === 'pending').length}</strong><span>Pending</span></div>
            <div><strong>{status.admin_migrations_enabled ? 'Enabled' : 'Locked'}</strong><span>Migration writes</span></div>
          </div>
          <div className="pq-migration-list">{status.migrations.map(x => <div className="pq-migration" key={x.filename}>
            {x.status === 'applied' ? <CheckCircle2 size={18} color="#149369"/> : <Database size={18}/>}
            <span>{x.filename}</span><strong>{x.status}</strong>
          </div>)}</div>
          {status.next_migration ? <form onSubmit={applyNext} className="pq-form">
            <label htmlFor="pq-admin-confirm-password">Confirm administrator password</label>
            <input id="pq-admin-confirm-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password confirmation for this migration" required/>
            <label className="pq-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I have verified a current database backup and approved applying {status.next_migration}.</label>
            <button className="pq-button" type="submit" disabled={busy || !status.admin_migrations_enabled || !confirmed || !password}><Database size={17}/>{busy ? 'Applying…' : 'Apply ' + status.next_migration}</button>
            {!status.admin_migrations_enabled && <p className="pq-caption">Migration writes are disabled. Enable <code>PAYQUICK_ADMIN_MIGRATIONS_ENABLED=true</code> temporarily in Vercel and redeploy to authorize this maintenance operation, then disable it again.</p>}
          </form> : <div className="pq-alert pq-alert-success"><CheckCircle2 size={19}/> All approved migrations are applied. No changes required.</div>}
        </> : <p className="pq-caption">Retrieving migration history from the authenticated backend…</p>}
      </section>
      <footer className="pq-admin-footer">Payquick administrator: {session.user.email} · Financial providers are managed separately.</footer>
    </div>
  </main>;
}
