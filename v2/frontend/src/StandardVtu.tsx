import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { api, money } from './api';

type Category = 'airtime' | 'data' | 'tv';
type Service = { id: string; name: string };
type CatalogGroup = { id: Category; name: string; services: Service[] };
type Plan = { code: string; name: string; amount_kobo: number };
type Quote = {
  quote_id: string; category: Category; beneficiary: string; amount_kobo: number;
  fee_kobo: number; total_kobo: number; verified_customer_name?: string | null;
  execution_enabled: boolean; expires_at: string;
};
type Order = { id: string; category: Category; status: string; service_id: string;
  beneficiary: string; total_kobo: number; created_at: string };
type Receipt = { id: string; status: string; message: string; reference?: string | null;
  category: Category; service_id: string; beneficiary: string; total_kobo: number };

const labels: Record<Category, string> = {
  airtime: 'Buy airtime', data: 'Buy data', tv: 'Pay for TV',
};

export default function StandardVtu({ token, onDone }: { token: string; onDone: () => void }) {
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [category, setCategory] = useState<Category>('airtime');
  const [service, setService] = useState('mtn');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [variation, setVariation] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('500');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [password, setPassword] = useState('');
  const [orderKey, setOrderKey] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [history, setHistory] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const loadHistory = useCallback(async () => {
    const x = await api<{ orders: Order[] }>('/vtu/orders', { token });
    setHistory(x.orders);
  }, [token]);
  useEffect(() => {
    void Promise.all([
      api<{ categories: CatalogGroup[] }>('/vtu/catalog', { token }),
      api<{ orders: Order[] }>('/vtu/orders', { token }),
    ]).then(([c, o]) => {
      setGroups(c.categories);
      setHistory(o.orders);
    }).catch((err: Error) => setError(err.message));
  }, [token]);
  useEffect(() => {
    setVariation(''); setPlans([]); setQuote(null); setOrderId(null); setReceipt(null);
    if (category === 'airtime') return;
    let active = true;
    void api<{ plans: Plan[] }>('/vtu/plans/' + category + '/' + service, { token })
      .then(p => { if (active) setPlans(p.plans); })
      .catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [category, service, token]);

  function switchCategory(next: Category) {
    setCategory(next);
    const first = groups.find(g => g.id === next)?.services[0]?.id;
    setService(first || ({airtime: 'mtn', data: 'mtn-data', tv: 'dstv'} as const)[next]);
    setError(''); setNote(''); setQuote(null); setOrderId(null);
  }
  function switchService(next: string) {
    setService(next); setError(''); setNote(''); setQuote(null); setOrderId(null);
  }
  async function prepare(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNote(''); setQuote(null); setOrderId(null);
    try {
      const request = {
        category, service_id: service, beneficiary, contact_phone: category === 'tv' ? phone : beneficiary,
        ...(category === 'airtime' ? { amount_naira: Number(amount) } : { variation_code: variation }),
      };
      const q = await api<Quote>('/vtu/quotes', { token, method: 'POST', body: request });
      setQuote(q); setOrderKey(crypto.randomUUID()); setPassword('');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function purchase() {
    if (!quote || !orderKey || busy || !quote.execution_enabled) return;
    const approved = window.confirm('Buy ' + labels[category].toLowerCase() + ' for ' +
      quote.beneficiary + ' for ' + money(quote.total_kobo) + '? Your wallet will be debited.');
    if (!approved) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ order_id: string; status: string }>('/vtu/orders', {
        token, method: 'POST',
        body: { quote_id: quote.quote_id, idempotency_key: orderKey, confirmation_password: password },
      });
      setOrderId(result.order_id);
      setPassword('');
      setNote('Order submitted. Check its status before starting another purchase.');
      await loadHistory(); onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function check(id: string) {
    setBusy(true); setError(''); setReceipt(null);
    try {
      const result = await api<Receipt>('/vtu/orders/' + id, { token });
      setReceipt(result); await loadHistory(); onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  const serviceOptions = groups.find(g => g.id === category)?.services || [];
  return <div className="space-y-6">
    <div className="surface p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap gap-2">
        {(['airtime','data','tv'] as Category[]).map(item =>
          <button key={item} type="button" onClick={() => switchCategory(item)}
            aria-pressed={category === item}
            className={'rounded-xl border px-4 py-3 text-sm font-bold ' +
              (category === item ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-200')}>
            {labels[item]}
          </button>)}
      </div>
      <div>
        <h2 className="text-xl font-bold">Standard VTU checkout</h2>
        <p className="muted mt-1 text-sm">No PQ-AI or automatic meter loading required. Enter your details, review the price and approve the payment.</p>
      </div>
      <form className="space-y-4" onSubmit={prepare}>
        <label className="field">Network or TV provider
          <select required value={service} onChange={e => switchService(e.target.value)}>
            {(serviceOptions.length ? serviceOptions : [{id: service,name: service}]).map(s =>
              <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">{category === 'tv' ? 'Smartcard / IUC number' : 'Recipient phone'}
          <input required inputMode="numeric" value={beneficiary}
            placeholder={category === 'tv' ? 'Enter your decoder ID' : '08012345678'}
            onChange={e => { setBeneficiary(e.target.value); setQuote(null); }}/>
        </label>
        {category === 'tv' && <label className="field">Your mobile number (for receipt)
          <input type="tel" required inputMode="numeric" placeholder="08012345678"
            value={phone} onChange={e => setPhone(e.target.value)} />
        </label>}
        {category === 'airtime' ? <label className="field">Airtime amount (₦)
          <input type="number" required min="100" max="200000" step="1"
            value={amount} onChange={e => setAmount(e.target.value)} />
        </label> : <label className="field">Available {category === 'tv' ? 'TV bouquets' : 'data plans'}
          <select required value={variation} onChange={e => {setVariation(e.target.value); setQuote(null);}}>
            <option value="">Select a current provider plan</option>
            {plans.map(plan => <option value={plan.code} key={plan.code}>
              {plan.name} · {money(plan.amount_kobo)}
            </option>)}
          </select>
        </label>}
        <button type="submit" disabled={busy || (category !== 'airtime' && !variation)}
          className="btn btn-primary">
          {busy ? 'Checking…' : 'Review purchase'} <ArrowRight size={16}/>
        </button>
      </form>
      {error && <div role="alert" className="error">{error}</div>}
      {note && <div role="status" className="success">{note}</div>}
      {quote && <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/60 p-5">
        <h3 className="font-bold text-lg">Review your purchase</h3>
        <p className="text-sm">Recipient: <b>{quote.beneficiary}</b></p>
        {quote.verified_customer_name && <p className="text-sm">Subscriber: <b>{quote.verified_customer_name}</b></p>}
        <div className="flex justify-between text-sm"><span>Service</span><b>{money(quote.amount_kobo)}</b></div>
        <div className="flex justify-between text-sm"><span>Fee</span><b>{money(quote.fee_kobo)}</b></div>
        <div className="flex justify-between text-lg font-extrabold border-t border-blue-200 pt-3"><span>Total</span><span>{money(quote.total_kobo)}</span></div>
        <p className="text-xs muted">Quote expires at {new Date(quote.expires_at).toLocaleTimeString('en-NG')}.</p>
        {quote.execution_enabled && !orderId ? <div className="space-y-3">
          <label className="field">Confirm using your account password
            <input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="button"
            disabled={busy || !password || !orderKey} onClick={() => void purchase()}>
            <ShieldCheck size={17}/>Confirm and pay from wallet
          </button>
        </div> : !quote.execution_enabled && <p className="text-sm text-amber-800 font-semibold">Purchases are temporarily disabled pending provider certification. Quote preview only.</p>}
        {orderId && <button className="btn btn-secondary" type="button" disabled={busy}
          onClick={() => void check(orderId)}><RefreshCcw size={17}/>Check my purchase</button>}
      </section>}
    </div>
    <div className="surface p-5 sm:p-7">
      <h2 className="section-title">Your VTU purchases</h2>
      {history.length ? <div className="space-y-3">{history.map(o =>
        <div key={o.id} className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
          <div><p className="font-bold text-sm">{o.service_id.toUpperCase()} · {money(o.total_kobo)}</p>
            <p className="text-xs muted">{o.beneficiary} · {o.status} · {new Date(o.created_at).toLocaleString('en-NG')}</p></div>
          <button disabled={busy} type="button" className="text-sm font-bold text-brand-700"
            onClick={() => void check(o.id)}>View status</button>
        </div>)}</div> : <p className="muted text-sm">No VTU purchases yet.</p>}
      {receipt && <div role="status" className="rounded-xl bg-blue-50 border border-blue-200 p-4 mt-4 space-y-2">
        <p className="font-bold flex gap-2 items-center"><CheckCircle2 size={18}/>Order status: {receipt.status}</p>
        <p className="text-sm">{receipt.message}</p>
        <p className="text-xs muted">Receipt: {receipt.id}</p>
        <p className="text-xs muted">Provider reference: {receipt.reference || 'Not assigned yet'}</p>
      </div>}
    </div>
  </div>;
}
