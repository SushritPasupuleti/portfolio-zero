import { useEffect, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bot, BriefcaseBusiness, ChartNoAxesCombined,
  ChevronDown, CircleHelp, FileUp, Landmark, LayoutDashboard, Menu, Plus, RefreshCw,
  Settings2, ShieldCheck, WalletCards,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import './style.css';

type Health = 'checking' | 'connected' | 'unavailable';
type Section = 'Overview' | 'Holdings' | 'Activity' | 'AI insights';

type PortfolioSummary = {
  total_value: number | null;
  invested: number | null;
  pnl: number | null;
  day_change: number | null;
  currency: string;
  as_of: string | null;
  status: 'empty' | 'partial' | 'ready' | 'stale' | 'invalid' | 'token_required';
  warnings: string[];
  message?: string;
};

type TokenStatus = {
  configured: boolean;
  message: string;
  api_key: boolean;
};

const navigation: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Holdings', icon: BriefcaseBusiness },
  { label: 'Activity', icon: Activity },
  { label: 'AI insights', icon: Bot },
];

function App() {
  const [apiHealth, setApiHealth] = useState<Health>('checking');
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date()).toUpperCase();

  const formatCurrency = (value: number | null) => {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  async function loadSummary() {
    try {
      const response = await fetch('/api/portfolio/summary');
      if (!response.ok) throw new Error('Summary unavailable');
      const payload = (await response.json()) as PortfolioSummary;
      setSummary(payload);
    } catch {
      setSummary(null);
    }
  }

  async function loadTokenStatus(): Promise<TokenStatus> {
    try {
      const response = await fetch('/api/token/status');
      if (!response.ok) throw new Error('Token status unavailable');
      const payload = (await response.json()) as TokenStatus;
      setTokenStatus(payload);
      return payload;
    } catch {
      const fallback = { configured: false, message: 'Token status is unavailable.', api_key: false };
      setTokenStatus(fallback);
      return fallback;
    }
  }

  async function checkApi() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('API unavailable');
      setApiHealth('connected');
      setNotice('Local API is responding. Connect a read-only data source to load your portfolio.');
      await loadSummary();
      const nextTokenStatus = await loadTokenStatus();
      if (!nextTokenStatus.configured) {
        setNotice(nextTokenStatus.message);
      }
    } catch {
      setApiHealth('unavailable');
      setNotice('The local API could not be reached. Start the app with Docker Compose and try again.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void checkApi(); }, []);

  const openSection = (section: Section) => {
    setActiveSection(section);
    if (section !== 'Overview') setNotice(`${section} will be available after you import portfolio data.`);
    else setNotice('');
  };

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#main-content" aria-label="Puffin Portfolio home">
          <span className="brand-mark" aria-hidden="true"><ChartNoAxesCombined size={19} /></span>
          <span>puffin<span className="brand-light">folio</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Portfolio">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activeSection === label ? 'active' : ''}`} aria-label={label} aria-current={activeSection === label ? 'page' : undefined} onClick={() => openSection(label)}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
              {label === 'AI insights' && <span className="nav-soon">LOCAL</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card"><span className="privacy-icon"><ShieldCheck size={17} /></span><div><strong>Your data stays yours</strong><p>Stored and processed on this device.</p></div></div>
          <button className="nav-item muted-nav" aria-label="Settings" onClick={() => setNotice('Settings will be available in a future step.')}><Settings2 size={17} /><span>Settings</span></button>
          <button className="nav-item muted-nav" aria-label="Help and guides" onClick={() => setNotice('Help: import a Kite holdings CSV to get started.')}><CircleHelp size={17} /><span>Help & guides</span></button>
          <div className="user-row"><div className="avatar" aria-hidden="true">P</div><div className="user-text"><strong>Personal portfolio</strong><span>Local workspace</span></div><ChevronDown size={16} aria-hidden="true" /></div>
        </div>
      </aside>

      <main id="main-content" className="main-area" tabIndex={-1}>
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setNotice('Use the sidebar navigation to switch sections.')}><Menu size={19} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{activeSection}</strong></div>
          <div className="top-actions"><span className="local-pill"><span className={`status-dot ${apiHealth}`} />LOCAL MODE</span><button className="icon-button" aria-label="Open settings" onClick={() => setNotice('Settings will be available in a future step.')}><Settings2 size={18} /></button></div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div><p className="overline">{today}</p><h1>Your portfolio, <em>in focus.</em></h1><p className="welcome-copy">A calm place to understand what you own and how it’s doing.</p></div>
            <div className="welcome-actions"><Button variant="outline" onClick={() => setNotice('The CSV import flow is the next build step. No account data is read or stored yet.')}><FileUp size={16} /> Import data</Button><Button onClick={() => setNotice('Broker connection is not configured. This scaffold does not request or store broker credentials.')}><Plus size={17} /> Connect account</Button></div>
          </section>

          {notice && <div className="notice" role="status"><span>{notice}</span><button className="notice-close" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}

          {tokenStatus && !tokenStatus.configured && (
            <section className="panel" aria-labelledby="setup-heading">
              <div className="panel-heading"><div><h2 id="setup-heading">Setup required</h2><p className="section-subtitle">The app needs a local Zerodha access token before it can load holdings.</p></div></div>
              <p>{tokenStatus.message}</p>
              <p>Open the internal Streamlit setup UI with <code>make token-ui</code> and save a fresh token to SQLite.</p>
            </section>
          )}

          <section aria-labelledby="summary-heading">
            <div className="section-title-row"><div><h2 id="summary-heading">Portfolio overview</h2><p className="section-subtitle">Your investment snapshot at a glance</p></div><Button variant="ghost" onClick={() => void checkApi()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Checking…' : 'Refresh'}</Button></div>
            <div className="metric-grid">
              <Card className="metric-card" role="group" aria-label="Total portfolio value"><div className="metric-label">Total portfolio value <span className="metric-icon mint"><WalletCards size={17} /></span></div><div className="metric-value">{formatCurrency(summary?.total_value ?? null)}</div><div className="metric-foot">{summary?.as_of ? new Date(summary.as_of).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'INR'} <span className="foot-separator">·</span> {summary?.status === 'empty' ? 'Awaiting data' : 'Updated value'}</div></Card>
              <Card className="metric-card" role="group" aria-label="Invested amount"><div className="metric-label">Invested amount <span className="metric-icon peach"><Landmark size={17} /></span></div><div className="metric-value">{formatCurrency(summary?.invested ?? null)}</div><div className="metric-foot">{summary?.invested != null ? 'Based on imported transactions' : 'No cost basis yet'}</div></Card>
              <Card className="metric-card" role="group" aria-label="Overall returns"><div className="metric-label">Overall returns <span className="metric-icon blue"><ArrowUpRight size={17} /></span></div><div className="metric-value">{formatCurrency(summary?.pnl ?? null)}</div><div className="metric-foot">{summary?.pnl != null ? 'Portfolio P&L' : 'P&amp;L appears when cost data is available'}</div></Card>
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="panel allocation-panel" aria-labelledby="allocation-title">
              <div className="panel-heading"><div><h2 id="allocation-title">Asset allocation</h2><p className="section-subtitle">Where your portfolio is invested</p></div><button className="icon-button small" aria-label="Allocation information" onClick={() => setNotice('Allocation is calculated from the latest imported holdings.')}><CircleHelp size={16} /></button></div>
              <div className="allocation-empty"><div className="donut" aria-hidden="true"><div className="donut-inner"><ChartNoAxesCombined size={23} /></div></div><strong>No holdings yet</strong><p>Import a statement to see your allocation.</p><button className="text-button" onClick={() => setNotice('The CSV import flow is the next build step. No account data is read or stored yet.')}>Add your first data <ArrowUpRight size={14} /></button></div>
              <div className="legend-row"><span><i className="legend-dot equity" />Equity</span><span><i className="legend-dot funds" />Mutual funds</span><span><i className="legend-dot other" />Other</span></div>
            </section>
            <section className="panel insight-panel" aria-labelledby="insight-heading">
              <div className="insight-top"><span className="ai-mark"><Bot size={18} /></span><span className="ai-local">PRIVATE · LOCAL AI</span></div>
              <h2 id="insight-heading">A little perspective.</h2>
              <p>Ask your local Gemma model to explain your allocation, spot concentration, or summarize recent changes.</p>
              <div className="model-status"><span className="model-dot" /><span>Model not connected</span><button className="text-button" onClick={() => setNotice('Configure LLM_BASE_URL and LLM_MODEL in your local .env file to connect Gemma.')}>Configure <ArrowUpRight size={13} /></button></div>
              <Button variant="ai" onClick={() => setNotice('Import holdings and connect a local model to start an insight session.')} disabled><Bot size={16} /> Explore insights</Button>
              <span className="ai-disclaimer">Informational only. Never a trade instruction.</span>
            </section>
          </div>

          <section className="panel holdings-panel" aria-labelledby="holdings-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="holdings-heading">Your holdings</h2><p className="section-subtitle">A clear view of each investment</p></div><Button variant="ghost" onClick={() => openSection('Holdings')}>View all <ArrowUpRight size={14} /></Button></div>
            <div className="table-scroll"><table><thead><tr><th scope="col">INSTRUMENT</th><th scope="col">TYPE</th><th scope="col">QUANTITY</th><th scope="col">PRICE</th><th scope="col">VALUE</th><th scope="col">RETURNS</th></tr></thead><tbody><tr><td colSpan={6}><div className="table-empty"><span className="empty-icon"><WalletCards size={19} /></span><span><strong>Your holdings will appear here</strong><small>Import a statement or connect an account to begin.</small></span><ArrowDownLeft className="empty-arrow" size={17} aria-hidden="true" /></div></td></tr></tbody></table></div>
            <div className="table-note"><span>Values are shown in INR</span><span>Data date: —</span></div>
          </section>

          <footer className="page-footer"><span>Made for clarity, built for privacy.</span><span><ShieldCheck size={14} /> Your data never leaves this device</span></footer>
        </div>
      </main>
    </div>
  );
}

export default App;
