import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine, ArrowRight, CheckCircle2, CreditCard, History, Home,
  LockKeyhole, LogOut, Plus, RefreshCcw, ShieldCheck, Smartphone,
  Zap, Menu, X, Mic, Info, Wallet as WalletIcon,
} from 'lucide-react';
import { api, money, type Meter, type Quote, type Session, type WalletInfo } from './api';
import StandardVtu from './StandardVtu';
import Landing from './Landing';

type Section = 'overview' | 'meters' | 'wallet' | 'activity' | 'vtu';
const discos = [
  ['ikeja-electric', 'Ikeja Electric'], ['eko-electric', 'Eko Electric'],
  ['abuja-electric', 'Abuja Electric'], ['ibadan-electric', 'Ibadan Electric'],
  ['jos-electric', 'Jos Electric'], ['kano-electric', 'Kano Electric'],
  ['kaduna-electric', 'Kaduna Electric'], ['enugu-electric', 'Enugu Electric'],
  ['benin-electric', 'Benin Electric'], ['portharcourt-electric', 'Port Harcourt Electric'],
];
const initialMeter = { nickname: '', disco: 'ikeja-electric', meter_number: '', meter_type: 'prepaid' };

function Logo() {
  return <div className="h-10 w-10 grid place-items-center rounded-xl bg-brand-700 text-white shadow-lg shadow-blue-900/15"><Zap size={23} fill="currentColor" /></div>;
}
function Button({ children, type = 'button', disabled = false, onClick, secondary = false }: {
  children: React.ReactNode; type?: 'button' | 'submit'; disabled?: boolean;
  onClick?: () => void; secondary?: boolean;
}) {
  return <button type={type} disabled={disabled} onClick={onClick}
    className={'btn ' + (secondary ? 'btn-secondary' : 'btn-primary')}>{children}</button>;
}
function Auth({ onSuccess, register, onModeChange, onBack }: {
  onSuccess: (session: Session) => void;
  register: boolean;
  onModeChange: (register: boolean) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  useEffect(() => {
    let active = true;
    void api<{ status: string }>('/ready')
      .then(result => { if (active) setAvailability(result.status === 'ready' ? 'ready' : 'unavailable'); })
      .catch(() => { if (active) setAvailability('unavailable'); });
    return () => { active = false; };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (availability !== 'ready') return;
    setBusy(true); setError('');
    try {
      const session = await api<Session>(register ? '/auth/register' : '/auth/login', {
        method: 'POST', body: register ? { name, email, password } : { email, password },
      });
      onSuccess(session);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f3f6fc] flex flex-col lg:flex-row">
    <div className="bg-brand-700 text-white p-8 lg:p-14 lg:w-1/2 flex flex-col justify-between min-h-72">
      <button type="button" onClick={onBack} className="flex gap-3 items-center font-black tracking-tight text-2xl text-left" aria-label="Return to Payquick homepage"><Logo />Payquick</button>
      <div className="max-w-lg py-16">
        <p className="text-blue-200 font-semibold text-sm uppercase tracking-[.2em] mb-4">Payquick 2.0</p>
        <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight leading-tight">Your bills. Your wallet. Less hassle.</h1>
        <p className="text-blue-100/80 mt-5 text-lg">Manage your prepaid meters and utility payments in one secure place.</p>
      </div>
      <div className="text-xs text-blue-200">Financial transactions are disabled while the new platform undergoes testing.</div>
    </div>
    <div className="lg:w-1/2 flex justify-center items-center p-6 lg:p-12">
      <form onSubmit={submit} className="surface max-w-md w-full p-7 sm:p-10 space-y-5">
        <div><p className="text-brand-600 font-semibold text-sm mb-1">Welcome to Payquick</p>
          <h2 className="text-3xl font-bold tracking-tight">{register ? 'Create your account' : 'Sign in securely'}</h2>
          <p className="muted mt-2 text-sm">A fresh start with reliable utility services.</p></div>
        {availability === 'checking' && <p role="status" className="text-sm text-slate-600 bg-blue-50 border border-blue-100 rounded-xl p-3">Checking account service availability…</p>}
        {availability === 'unavailable' && <p role="status" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">Account services are being configured. Registration and sign-in are temporarily unavailable. You can still explore the Payquick homepage.</p>}
        {register && <label className="field">Full name<input required value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} placeholder="Your full name" /></label>}
        <label className="field">Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label className="field">Password<input required type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder={register ? '12 characters minimum' : 'Your password'} /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <Button type="submit" disabled={busy || availability !== 'ready'}>{busy ? 'Please wait…' : availability === 'checking' ? 'Checking availability…' : availability === 'unavailable' ? 'Temporarily unavailable' : register ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></Button>
        <p className="text-sm text-center muted">{register ? 'Already registered?' : 'New to Payquick?'} <button type="button" className="text-brand-700 font-bold" onClick={() => { onModeChange(!register); setError(''); }}>{register ? 'Sign in' : 'Create account'}</button></p>
        <p className="text-xs muted flex gap-2 items-start"><LockKeyhole size={15} className="shrink-0"/>Short-lived sessions are used while stronger device authentication is being developed.</p>
      </form>
    </div>
  </main>;
}
function MeterCard({ meter, onQuote, onVerify, busy }: { meter: Meter; onQuote: (meter: Meter) => void; onVerify: (meter: Meter) => void; busy: boolean }) {
  return <div className="surface p-5 flex flex-col justify-between gap-4">
    <div className="flex gap-3 items-start"><div className="rounded-xl bg-blue-50 p-3 text-brand-600"><Zap size={20}/></div>
      <div className="min-w-0 flex-1"><p className="font-bold text-lg">{meter.nickname}</p><p className="text-sm muted truncate">{meter.disco}</p></div></div>
    <div className="text-sm"><p className="muted">Meter number</p><p className="font-mono font-semibold text-base">{meter.meter_number}</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className={meter.capability.remote_loading ? 'chip chip-green' : 'chip'}>{meter.capability.remote_loading ? 'Remote verified' : 'Manual token entry'}</span>
      {meter.meter_type === 'prepaid' && <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => onVerify(meter)} className="text-brand-700 font-bold text-sm hover:underline">Verify meter</button>
        <button type="button" onClick={() => onQuote(meter)} className="text-brand-700 font-bold text-sm hover:underline flex gap-1 items-center">Get quote <ArrowRight size={15}/></button>
      </div>}
    </div>
  </div>;
}
function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('overview');
  const [drawer, setDrawer] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [orders, setOrders] = useState<Array<{
    id: string; status: string; amount_kobo: number; total_kobo: number;
    meter_nickname: string; meter_number: string; disco: string; created_at: string;
  }>>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    id: string; status: string; token: string | null; message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [meterForm, setMeterForm] = useState(initialMeter);
  const [selectedMeter, setSelectedMeter] = useState<Meter | null>(null);
  const [amount, setAmount] = useState('2000');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [fundAmount, setFundAmount] = useState('5000');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [confirmationPassword, setConfirmationPassword] = useState('');
  const [orderKey, setOrderKey] = useState('');
  const [currentOrder, setCurrentOrder] = useState<{ order_id: string; status: string } | null>(null);
  const [receipt, setReceipt] = useState<{ status: string; token: string | null; message: string } | null>(null);
  const token = session.access_token;
  const refresh = useCallback(async () => {
    try {
      const [w, m, o] = await Promise.all([
        api<WalletInfo>('/wallet', { token }),
        api<{ meters: Meter[] }>('/meters', { token }),
        api<{ orders: typeof orders }>('/electricity/orders', { token }),
      ]);
      setWallet(w); setMeters(m.meters); setOrders(o.orders); setError('');
    } catch (err) { setError((err as Error).message); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);

  const navigate = (target: Section) => {
    setSection(target); setDrawer(false); setError(''); setNotice('');
  };
  async function addMeter(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/meters', { method: 'POST', token, body: meterForm });
      setMeterForm(initialMeter); setNotice('Meter saved. Remote eligibility is pending provider verification.');
      await refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function verifyMeter(meter: Meter) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ customer_name: string; minimum_kobo: number }>(
        '/meters/' + meter.id + '/verify', { method: 'POST', token, body: {} },
      );
      setQuote(null); setSelectedMeter(meter);
      setNotice('Meter verified for ' + result.customer_name + '. Minimum purchase: ' + money(result.minimum_kobo));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function getQuote(e: FormEvent) {
    e.preventDefault(); if (!selectedMeter) return;
    setBusy(true); setError(''); setQuote(null);
    try {
      const result = await api<Quote>('/electricity/quotes', {
        method: 'POST', token,
        body: { meter_id: selectedMeter.id, amount_naira: Number(amount) },
      });
      setQuote(result); setOrderKey(crypto.randomUUID()); setCurrentOrder(null); setReceipt(null);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function orderElectricity() {
    if (!quote?.execution_enabled || !orderKey) return;
    if (!window.confirm('Authorize purchase of ' + money(quote.total_kobo ?? quote.amount_kobo)
       + ' for meter ' + quote.meter_number + '? This reserves funds from your wallet.')) return;
    setBusy(true); setError('');
    try {
      const order = await api<{ order_id: string; status: string }>(
        '/electricity/orders', { method: 'POST', token, body: {
          quote_id: quote.quote_id, idempotency_key: orderKey, phone: recipientPhone,
          confirmation_password: confirmationPassword,
        }},
      );
      setCurrentOrder(order);
      setNotice('Purchase queued. Do not submit another purchase while status is pending.');
      setConfirmationPassword('');
      await refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function viewReceipt(orderId: string) {
    setBusy(true); setError('');
    try {
      const receipt = await api<{ id: string; status: string; token: string | null; message: string }>(
        '/electricity/orders/' + orderId, { token },
      );
      setSelectedReceipt(receipt);
      await refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function refreshOrder() {
    if (!currentOrder) return;
    setBusy(true); setError('');
    try {
      const response = await api<{ status: string; token: string | null; message: string }>(
        '/electricity/orders/' + currentOrder.order_id, { token },
      );
      setReceipt(response);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function fund(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ authorization_url?: string }>('/wallet/funding-intents', {
        method: 'POST', token, body: { amount_naira: Number(fundAmount) },
      });
      if (!result.authorization_url || !result.authorization_url.startsWith('https://')) throw Error('Secure payment link unavailable');
      window.location.assign(result.authorization_url);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  const links: { key: Section; name: string; icon: typeof Home }[] = [
    { key: 'overview', name: 'Overview', icon: Home },
    { key: 'meters', name: 'My meters', icon: Zap },
    { key: 'vtu', name: 'Airtime, data & TV', icon: Smartphone },
    { key: 'wallet', name: 'Wallet', icon: WalletIcon },
    { key: 'activity', name: 'Activity', icon: History },
  ];
  return <div className="min-h-screen bg-[#f3f6fc]">
    <div className="lg:hidden bg-white border-b border-slate-200 flex justify-between items-center px-5 py-3">
      <div className="flex gap-2 items-center font-bold text-brand-900"><Logo />Payquick</div>
      <button aria-label="Toggle navigation" onClick={() => setDrawer(!drawer)}>{drawer ? <X/> : <Menu/>}</button>
    </div>
    <aside className={'sidebar ' + (drawer ? 'flex' : 'hidden lg:flex')}>
      <div className="flex items-center gap-3 font-extrabold text-2xl text-brand-900"><Logo />Payquick</div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-12 mb-3">Workspace</p>
      <nav aria-label="Primary navigation" className="space-y-1">
        {links.map(link => <button key={link.key} className={'nav-btn ' + (section === link.key ? 'nav-active' : '')}
          onClick={() => navigate(link.key)}><link.icon size={19}/>{link.name}</button>)}
      </nav>
      <div className="mt-auto border-t pt-6">
        <p className="text-sm font-bold truncate">{session.user.name}</p>
        <p className="text-xs muted truncate mt-1">{session.user.email}</p>
        <button onClick={onLogout} className="nav-btn mt-3 text-red-700"><LogOut size={18}/>Sign out</button>
      </div>
    </aside>
    <main className="lg:ml-64 p-5 sm:p-8 lg:p-10 max-w-6xl">
      <header className="flex flex-wrap items-center gap-3 justify-between mb-7">
        <div><p className="text-sm font-semibold text-brand-600">PAYQUICK 2.0</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{({ overview: 'Welcome back', meters: 'Your meters', wallet: 'Your wallet', activity: 'Transaction activity', vtu: 'Buy airtime, data or TV' } as const)[section]}</h1>
          <p className="muted text-sm mt-1">Hello, {session.user.name.split(' ')[0]}. Manage utilities with confidence.</p></div>
        <button onClick={() => void refresh()} className="btn btn-secondary w-auto" title="Refresh"><RefreshCcw size={17}/>Refresh</button>
      </header>
      <div role="status" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-sm mb-6"><Info size={18} className="shrink-0"/><p><b>Development preview.</b> No live electricity purchase or automatic token delivery is enabled. Meter eligibility must be verified by a provider.</p></div>
      {error && <div role="alert" className="error mb-5">{error} {error.toLowerCase().includes('expired') && <button onClick={onLogout} className="underline font-bold">Sign in again</button>}</div>}
      {notice && <div role="status" className="success mb-5">{notice}</div>}

      {section === 'overview' && <div className="space-y-6">
        <div className="grid md:grid-cols-3 gap-5">
          <div className="rounded-2xl bg-brand-700 p-6 text-white md:col-span-2 shadow-xl shadow-brand-900/10">
            <p className="text-blue-100/80 text-sm flex items-center gap-2"><WalletIcon size={17}/>Available wallet balance</p>
            <p className="text-4xl font-extrabold tracking-tight my-4">{wallet ? money(wallet.balance_kobo) : '—'}</p>
            <button className="text-white text-sm font-semibold bg-white/20 px-4 py-3 rounded-xl flex gap-2 items-center hover:bg-white/30" onClick={() => navigate('wallet')}><Plus size={16}/>Fund wallet <ArrowRight size={16}/></button>
          </div>
          <div className="surface p-6 flex flex-col justify-between">
            <Zap size={23} className="text-brand-600"/><div><p className="text-4xl font-extrabold">{meters.length}</p><p className="muted text-sm mt-2">Saved meters</p></div>
            <button className="text-brand-700 font-bold text-sm text-left" onClick={() => navigate('meters')}>Manage meters →</button>
          </div>
        </div>
        <div><h2 className="section-title">Quick services</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button onClick={() => navigate('meters')} className="service"><Zap className="text-brand-600"/>Prepaid electricity <ArrowRight size={17}/></button>
            <button onClick={() => navigate('wallet')} className="service"><CreditCard className="text-brand-600"/>Fund wallet <ArrowRight size={17}/></button>
            <button onClick={() => navigate('vtu')} className="service"><Smartphone className="text-brand-600"/>Airtime, data & TV <ArrowRight size={17}/></button>
          </div></div>
        <div className="surface p-6 flex gap-4 items-start">
          <div className="rounded-xl bg-blue-50 p-3"><Mic size={24} className="text-brand-600"/></div>
          <div><h2 className="font-bold text-lg">PQ-AI is on the roadmap</h2>
          <p className="muted mt-1 text-sm">PQ-AI will be optional. Ordinary electricity, airtime, data, TV and wallet forms always remain the primary fallback. AI cannot bypass payment authorization.</p></div>
        </div>
      </div>}

      {section === 'vtu' && <StandardVtu token={token} onDone={() => void refresh()}/>}

      {section === 'meters' && <div className="grid lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          <h2 className="section-title">Saved meters</h2>
          {meters.length === 0 ? <div className="surface text-center p-10"><Zap size={32} className="mx-auto text-brand-600 mb-3"/><p className="font-bold">No meters added yet</p><p className="muted text-sm mt-2">Save a prepaid meter to request a purchase quote.</p></div> :
            meters.map(meter => <MeterCard key={meter.id} meter={meter} busy={busy}
                onVerify={m => void verifyMeter(m)}
                onQuote={m => { setSelectedMeter(m); setQuote(null); setCurrentOrder(null); setReceipt(null); }}/>)}
          {selectedMeter && <form onSubmit={getQuote} className="surface p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-bold">Electricity quote</h3><button type="button" onClick={() => setSelectedMeter(null)} aria-label="Close"><X size={18}/></button></div>
            <p className="text-sm muted">{selectedMeter.nickname} · {selectedMeter.meter_number}</p>
            <label className="field">Amount (₦)<input type="number" min="500" max="200000" step="1" value={amount} required onChange={e => setAmount(e.target.value)}/></label>
            <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Get quote'}<ArrowRight size={17}/></Button>
            {quote && <div className="rounded-xl bg-blue-50 p-4 text-sm space-y-2">
              <p className="font-bold text-xl">{money(quote.amount_kobo)}</p>
              <p>Loading: {quote.remote_loading_supported ? 'Verified remote-capable' : 'Manual token fallback'}</p>
              {'verified_customer_name' in quote && <p className="font-medium">Customer: {String(quote.verified_customer_name)}</p>}
              <p className="text-amber-800 font-semibold">{quote.message}</p>
            </div>}
            {quote?.execution_enabled && !currentOrder && <div className="space-y-3 rounded-xl border p-4">
              <p className="font-bold">Authorize electricity purchase</p>
              <label className="field">Recipient mobile<input type="tel" value={recipientPhone}
                placeholder="08012345678" onChange={e => setRecipientPhone(e.target.value)}/></label>
              <label className="field">Confirm with account password<input type="password" value={confirmationPassword}
                autoComplete="off" onChange={e => setConfirmationPassword(e.target.value)}/></label>
              <Button disabled={busy || !/^0[789][01]\d{8}$/.test(recipientPhone) || confirmationPassword.length < 12}
                onClick={() => void orderElectricity()}>Confirm and reserve funds</Button>
            </div>}
            {currentOrder && <div className="space-y-3 p-4 rounded-xl border">
              <p className="font-bold">Order: {currentOrder.order_id.slice(0,8)}</p>
              <p className="text-sm">Initial status: {currentOrder.status}</p>
              <Button secondary disabled={busy} onClick={() => void refreshOrder()}><RefreshCcw size={17}/>Check provider status</Button>
              {receipt && <div className="text-sm space-y-2">
                <p>Latest status: <b>{receipt.status}</b></p>
                {receipt.token && <p className="font-mono font-bold tracking-wide break-all">Token: {receipt.token}</p>}
                <p className="muted">{receipt.message}</p>
              </div>}
            </div>}
          </form>}
        </div>
        <form onSubmit={addMeter} className="surface p-6 space-y-4 lg:col-span-2">
          <h2 className="section-title">Add a meter</h2>
          <label className="field">Nickname<input required value={meterForm.nickname} maxLength={40} onChange={e => setMeterForm({ ...meterForm, nickname: e.target.value })} placeholder="Home, Shop, Office"/></label>
          <label className="field">Distribution company<select value={meterForm.disco} onChange={e => setMeterForm({ ...meterForm, disco: e.target.value })}>{discos.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
          <label className="field">Meter number<input required inputMode="numeric" pattern="[0-9]{8,18}" value={meterForm.meter_number} onChange={e => setMeterForm({ ...meterForm, meter_number: e.target.value })} placeholder="8–18 digits"/></label>
          <label className="field">Meter type<select value={meterForm.meter_type} onChange={e => setMeterForm({ ...meterForm, meter_type: e.target.value })}><option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option></select></label>
          <Button type="submit" disabled={busy}><Plus size={17}/>{busy ? 'Saving…' : 'Save meter'}</Button>
          <p className="text-xs muted">A saved meter is not automatically eligible for remote token loading. Verified integrations will be added later.</p>
        </form>
      </div>}

      {section === 'wallet' && <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="surface p-7 space-y-4"><div className="flex items-center gap-2 text-brand-700"><WalletIcon size={20}/><b>Wallet overview</b></div>
          <p className="text-4xl font-extrabold">{wallet ? money(wallet.balance_kobo) : '—'}</p>
          <p className="muted text-sm">Balance reflects verified ledger activity only.</p>
          <div className="flex gap-2 items-start text-xs muted"><ShieldCheck size={16} className="text-emerald-700 shrink-0"/>No client application can directly credit a wallet balance.</div>
        </div>
        <form onSubmit={fund} className="surface p-7 space-y-4"><h2 className="section-title">Fund wallet</h2>
          <label className="field">Amount (₦)<input type="number" min="100" max="200000" step="1" required value={fundAmount} onChange={e => setFundAmount(e.target.value)}/></label>
          <Button type="submit" disabled={busy}><ArrowDownToLine size={17}/>{busy ? 'Connecting…' : 'Continue to secure checkout'}</Button>
          <p className="text-xs muted">Checkout will remain unavailable until the verified payment sandbox is enabled by the operator.</p>
        </form>
      </div>}

      {section === 'activity' && <div className="space-y-4">
        <h2 className="section-title">Electricity orders</h2>
        {orders.length === 0 ? <div className="surface p-10 text-center">
          <History className="mx-auto text-brand-600" size={30}/>
          <p className="font-bold text-xl mt-3">No electricity orders yet</p>
          <p className="muted mt-2 text-sm">Orders will appear here after purchase authorization.</p>
        </div> : orders.map(order => <div key={order.id} className="surface p-5 flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="font-bold">{order.meter_nickname} · {money(order.total_kobo)}</p>
            <p className="text-sm muted">{order.disco} · {order.meter_number}</p>
            <p className="text-xs muted mt-2">{new Date(order.created_at).toLocaleString('en-NG')} · {order.status}</p>
          </div>
          <button disabled={busy} onClick={() => void viewReceipt(order.id)} className="text-brand-700 text-sm font-bold hover:underline">
            View latest status
          </button>
        </div>)}
        {selectedReceipt && <div className="surface p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold">Order {selectedReceipt.id.slice(0,8)}</p>
            <button aria-label="Close receipt" onClick={() => setSelectedReceipt(null)}><X size={18}/></button>
          </div>
          <p className="text-sm">Status: <b>{selectedReceipt.status}</b></p>
          {selectedReceipt.token && <p className="font-mono break-all font-bold">Token: {selectedReceipt.token}</p>}
          <p className="muted text-sm">{selectedReceipt.message}</p>
        </div>}
      </div>}
      <footer className="text-xs muted mt-10 flex flex-wrap gap-2 items-center"><CheckCircle2 size={14}/>Secure API foundation · <span>Payquick v2 preview</span> · <span>Payments not yet released</span></footer>
    </main>
  </div>;
}
type AppRoute = '/' | '/login' | '/register' | '/app';

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return '/';
  const route = window.location.pathname;
  return route === '/login' || route === '/register' || route === '/app' ? route : '/';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<AppRoute>(getInitialRoute);
  const navigate = useCallback((next: AppRoute) => {
    if (window.location.pathname !== next) window.history.pushState({}, '', next);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const onBackOrForward = () => setRoute(getInitialRoute());
    window.addEventListener('popstate', onBackOrForward);
    return () => window.removeEventListener('popstate', onBackOrForward);
  }, []);

  if (route === '/') {
    return <Landing onSignIn={() => navigate('/login')} onGetStarted={() => navigate('/register')}/>;
  }
  if (route === '/app' && session) {
    return <Dashboard session={session} onLogout={() => {
      setSession(null);
      navigate('/login');
    }}/>;
  }
  return <Auth
    key={route === '/register' ? 'register' : 'login'}
    register={route === '/register'}
    onModeChange={wantsRegister => navigate(wantsRegister ? '/register' : '/login')}
    onBack={() => navigate('/')}
    onSuccess={newSession => {
      setSession(newSession);
      navigate('/app');
    }}
  />;
}
