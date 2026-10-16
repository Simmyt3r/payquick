import { useState } from 'react';
import {
  ArrowRight, CheckCircle2, ChevronDown, CreditCard, Headphones,
  LockKeyhole, Menu, ReceiptText, ShieldCheck, Smartphone, Sparkles,
  Wallet, X, Zap, Wifi, Tv, Clock3, ArrowUpRight, Fingerprint,
} from 'lucide-react';

type Props = {
  onSignIn: () => void;
  onGetStarted: () => void;
};

const services = [
  { icon: Smartphone, title: 'Airtime', description: 'Top up MTN, Airtel, Glo and 9mobile numbers with a familiar checkout.', tint: 'sky' },
  { icon: Wifi, title: 'Data bundles', description: 'Choose network plans, check the amount and confirm before you pay.', tint: 'violet' },
  { icon: Zap, title: 'Electricity', description: 'Purchase prepaid power and use your token manually when remote loading is unavailable.', tint: 'amber' },
  { icon: Tv, title: 'Cable TV', description: 'Select a DStv, GOtv or StarTimes package with subscriber verification.', tint: 'rose' },
  { icon: Wallet, title: 'Wallet', description: 'Keep bill payments in one place with verified funding and clear balances.', tint: 'mint' },
  { icon: ReceiptText, title: 'Receipts', description: 'See your purchases, reference numbers and genuine provider statuses.', tint: 'blue' },
] as const;

const steps = [
  { n: '01', title: 'Choose a service', description: 'Select electricity, airtime, mobile data or a TV subscription.' },
  { n: '02', title: 'Review the details', description: 'Verify your recipient, meter or smartcard and the total amount.' },
  { n: '03', title: 'Confirm securely', description: 'Authorize your purchase and keep its reference for tracking.' },
] as const;

function Brand({ light = false }: { light?: boolean }) {
  return <span className={'lp-brand ' + (light ? 'lp-brand-light' : '')}>
    <span className="lp-brand-symbol"><Zap size={20} fill="currentColor" strokeWidth={2.4} /></span>
    <span>payquick<span className="lp-brand-dot">.</span></span>
  </span>;
}

function MiniTransaction({ icon: Icon, label, subtitle, amount, kind }: {
  icon: typeof Zap; label: string; subtitle: string; amount: string; kind: string;
}) {
  return <div className="lp-mini-transaction">
    <span className={'lp-mini-icon lp-mini-' + kind}><Icon size={19} strokeWidth={2.1}/></span>
    <span className="lp-mini-text"><strong>{label}</strong><small>{subtitle}</small></span>
    <span className="lp-mini-amount">{amount}</span>
  </div>;
}

function AppPreview() {
  return <div className="lp-preview-shell" aria-label="Illustrative Payquick app interface preview">
    <div className="lp-preview-top">
      <span className="lp-preview-appicon"><Zap size={16} fill="currentColor" /></span>
      <span>payquick</span>
      <span className="lp-preview-top-right"><span className="lp-preview-pulse"/>APP PREVIEW</span>
    </div>
    <div className="lp-preview-body">
      <div className="lp-preview-welcome">
        <span>YOUR MONEY, SIMPLIFIED</span>
        <div className="lp-preview-avatar"><span>●</span><span>●</span><span>●</span><span>●</span></div>
      </div>
      <div className="lp-preview-wallet">
        <span className="lp-preview-wallet-label"><Wallet size={15}/> Wallet balance</span>
        <div className="lp-preview-wallet-amount">₦12,500.00</div>
        <span className="lp-preview-wallet-sub">Illustrative balance</span>
        <div className="lp-preview-wallet-action"><ArrowUpRight size={14}/> Fund wallet</div>
        <span className="lp-preview-wave lp-preview-wave-one"/>
        <span className="lp-preview-wave lp-preview-wave-two"/>
      </div>
      <div className="lp-preview-section-head"><strong>Quick payments</strong><span>All services <ArrowRight size={13}/></span></div>
      <div className="lp-preview-actions">
        <div><span className="lp-mini-icon lp-mini-amber"><Zap size={18}/></span><small>Electricity</small></div>
        <div><span className="lp-mini-icon lp-mini-sky"><Smartphone size={18}/></span><small>Airtime</small></div>
        <div><span className="lp-mini-icon lp-mini-violet"><Wifi size={18}/></span><small>Data</small></div>
        <div><span className="lp-mini-icon lp-mini-rose"><Tv size={18}/></span><small>Cable TV</small></div>
      </div>
      <div className="lp-preview-section-head"><strong>Recent activity</strong><span>View all <ArrowRight size={13}/></span></div>
      <div className="lp-preview-history">
        <MiniTransaction icon={Smartphone} label="MTN airtime" subtitle="Example transaction" amount="−₦1,000" kind="sky"/>
        <MiniTransaction icon={Zap} label="Electricity token" subtitle="Example transaction" amount="−₦3,000" kind="amber"/>
      </div>
    </div>
  </div>;
}

export default function Landing({ onSignIn, onGetStarted }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return <div className="lp-page">
    <a href="#main" className="lp-skip">Skip to content</a>
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <a href="/" aria-label="Payquick homepage" className="lp-logo-link" onClick={closeMenu}><Brand/></a>
        <nav className={'lp-nav ' + (menuOpen ? 'lp-nav-open' : '')} aria-label="Primary navigation" id="lp-primary-nav">
          <a href="#services" onClick={closeMenu}>Services</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#why-payquick" onClick={closeMenu}>Why Payquick</a>
          <a href="#questions" onClick={closeMenu}>FAQs</a>
          <div className="lp-mobile-actions">
            <button onClick={() => { closeMenu(); onSignIn(); }}>Sign in</button>
            <button className="lp-mobile-primary" onClick={() => { closeMenu(); onGetStarted(); }}>Get started <ArrowRight size={16}/></button>
          </div>
        </nav>
        <div className="lp-header-actions">
          <button className="lp-link-button" type="button" onClick={onSignIn}>Sign in</button>
          <button className="lp-btn lp-btn-sm lp-btn-dark" type="button" onClick={onGetStarted}>Get started <ArrowRight size={16}/></button>
        </div>
        <button className="lp-menu-toggle" type="button" aria-controls="lp-primary-nav"
          aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={24}/> : <Menu size={24}/>}</button>
      </div>
    </header>

    <main id="main">
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow"><span className="lp-eyebrow-dot"/> A simpler way to handle everyday payments</span>
            <h1>All your bills.<br/><span>One easy place.</span></h1>
            <p className="lp-hero-lead">Airtime, data, electricity, TV subscriptions and wallet payments, together in a familiar experience built for everyday life in Nigeria.</p>
            <div className="lp-hero-actions">
              <button className="lp-btn lp-btn-blue" type="button" onClick={onGetStarted}>Explore Payquick <ArrowRight size={19}/></button>
              <a className="lp-text-link" href="#how-it-works">See how it works <ArrowRight size={17}/></a>
            </div>
            <div className="lp-trust-strip">
              <span><CheckCircle2 size={18}/> Familiar VTU checkout</span>
              <span><ShieldCheck size={18}/> Clear confirmations</span>
              <span><ReceiptText size={18}/> Trackable receipts</span>
            </div>
          </div>
          <div className="lp-hero-visual">
            <div className="lp-preview-glow"/>
            <div className="lp-floating lp-floating-top"><span className="lp-floating-icon"><ShieldCheck size={18}/></span><span><strong>Review before paying</strong><small>You're in control</small></span></div>
            <AppPreview/>
            <div className="lp-floating lp-floating-bottom"><span className="lp-floating-icon lp-floating-blue"><ReceiptText size={18}/></span><span><strong>Know your status</strong><small>Receipts and references</small></span></div>
          </div>
        </div>
      </section>

      <div className="lp-note-band"><div className="lp-container">
        <Clock3 size={17}/><p><strong>Development preview:</strong> Payquick 2.0 is being prepared and tested. Live transactions and automatic meter loading are not yet available on this version.</p>
      </div></div>

      <section className="lp-section lp-services" id="services">
        <div className="lp-container">
          <div className="lp-section-heading lp-heading-center">
            <span className="lp-section-kicker">EVERYDAY ESSENTIALS</span>
            <h2>Everything you pay for,<br/>beautifully brought together.</h2>
            <p>The services you already know, with a simple checkout you can use without learning anything new.</p>
          </div>
          <div className="lp-services-grid">
            {services.map(service => <article className="lp-service-card" key={service.title}>
              <span className={'lp-service-icon lp-mini-' + service.tint}><service.icon size={26} strokeWidth={1.9}/></span>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <span className="lp-service-foot"><CheckCircle2 size={15}/> Standard checkout</span>
            </article>)}
          </div>
        </div>
      </section>

      <section className="lp-section lp-how" id="how-it-works">
        <div className="lp-container">
          <div className="lp-section-heading lp-heading-center">
            <span className="lp-section-kicker">SIMPLE BY DESIGN</span>
            <h2>Three steps. That's it.</h2>
            <p>No complicated setup just to pay a bill. Choose, check and confirm.</p>
          </div>
          <div className="lp-step-grid">
            {steps.map(step => <article className="lp-step" key={step.n}>
              <span className="lp-step-number">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section className="lp-section lp-difference" id="why-payquick">
        <div className="lp-container lp-difference-grid">
          <div>
            <span className="lp-section-kicker lp-kicker-light">BUILT AROUND REAL LIFE</span>
            <h2>Smart when you want it.<br/>Simple when you don't.</h2>
            <p>We're designing Payquick around the ordinary payment journey first. Advanced tools are optional, not obstacles between you and a bill.</p>
            <div className="lp-difference-items">
              <div><span><Smartphone size={20}/></span><div><strong>Use the regular checkout</strong><p>Pay for utilities by selecting your service and entering your details.</p></div></div>
              <div><span><Zap size={20}/></span><div><strong>Manual token entry always available</strong><p>When a meter cannot load remotely, retrieve your genuine electricity token.</p></div></div>
              <div><span><Sparkles size={20}/></span><div><strong>Intelligence will be optional</strong><p>Future PQ-AI voice and assistant features won't be required to make payments.</p></div></div>
            </div>
          </div>
          <div className="lp-difference-panel">
            <div className="lp-difference-illustration">
              <div className="lp-difference-tag"><CheckCircle2 size={16}/> Your choice</div>
              <div className="lp-option lp-option-highlight"><span><CreditCard size={20}/></span><div><strong>Normal VTU</strong><small>Select · Review · Confirm</small></div><CheckCircle2 size={21}/></div>
              <div className="lp-option"><span><Sparkles size={20}/></span><div><strong>PQ-AI assistant</strong><small>Optional future experience</small></div><span className="lp-option-later">Planned</span></div>
              <div className="lp-difference-bottom"><LockKeyhole size={15}/> You authorize each payment.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-faq" id="questions">
        <div className="lp-container lp-faq-grid">
          <div className="lp-section-heading">
            <span className="lp-section-kicker">GOOD TO KNOW</span>
            <h2>A few things worth knowing.</h2>
            <p>No hidden complexity. Here's how the experience is intended to work.</p>
          </div>
          <div className="lp-faq-items">
            <details><summary>Do I need AI to buy airtime or electricity?<ChevronDown size={20}/></summary><p>No. Regular form-based payments are the default. PQ-AI will be an optional future convenience.</p></details>
            <details><summary>Can I still use an electricity token manually?<ChevronDown size={20}/></summary><p>Yes. When remote loading isn't supported or verified, the standard path is to retrieve the provider-issued token and enter it on your meter's CIU.</p></details>
            <details><summary>Is Payquick 2.0 accepting live payments now?<ChevronDown size={20}/></summary><p>Not yet. This version is in development and provider testing. We will not describe test transactions as completed live payments.</p></details>
            <details><summary>How will I know whether a purchase succeeded?<ChevronDown size={20}/></summary><p>Your transaction history and receipt will show the provider-confirmed status. If a provider response is uncertain, the order remains pending or under review rather than silently charging again.</p></details>
          </div>
        </div>
      </section>

      <section className="lp-final-cta">
        <div className="lp-container lp-cta-inner">
          <div><span className="lp-cta-eyebrow">PAYQUICK 2.0</span><h2>Ready for simpler everyday payments?</h2><p>Explore the new Payquick experience. Transactions remain in development preview while integrations are validated.</p></div>
          <button className="lp-btn lp-btn-white" type="button" onClick={onGetStarted}>Get started <ArrowRight size={19}/></button>
        </div>
      </section>
    </main>
    <footer className="lp-footer">
      <div className="lp-container lp-footer-main">
        <div><Brand/><p>Making everyday utility payments easier to understand and manage.</p></div>
        <div className="lp-footer-links"><a href="#services">Services</a><a href="#how-it-works">How it works</a><a href="#questions">FAQs</a><button type="button" onClick={onSignIn}>Sign in</button></div>
      </div>
      <div className="lp-container lp-footer-bottom"><span>© {new Date().getFullYear()} Payquick. All rights reserved.</span><span>Built for simplicity. Currently in development preview.</span></div>
    </footer>
  </div>;
}
