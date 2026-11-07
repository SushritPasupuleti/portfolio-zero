import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownLeft, ArrowUpRight, BookOpen, Bot, BriefcaseBusiness,
  ChartNoAxesCombined, Check, ChevronDown, CircleHelp, Download, FileUp, Grid2X2,
  Landmark, LayoutDashboard, Menu, Plus, RefreshCw, Search, Server, Settings2,
  ShieldCheck, Trash2, Upload, WalletCards,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import './style.css';

type Health = 'checking' | 'connected' | 'unavailable';
type Section = 'Overview' | 'Holdings' | 'Manual portfolio' | 'Activity' | 'AI insights' | 'Glossary' | 'Settings';

type ManualPosition = {
  id: string;
  ticker: string;
  units: number;
  market: 'BSE' | 'NSE' | 'NYSE';
  buy_price: number;
  current_price: number | null;
  price_as_of: string | null;
  price_source: string | null;
  source: string;
  asset_type: 'stock' | 'mf' | 'etf' | 'bond' | 'other';
  created_at: string;
  updated_at: string;
};

type Preferences = {
  show_manual_imports: boolean;
  auto_sync_zerodha: boolean;
  ollama_enabled: boolean;
  ollama_endpoint: string;
  ollama_model: string;
  yfinance_sync_enabled: boolean;
  yahoo_terms_confirmed: boolean;
  auto_sync_yfinance: boolean;
};

type AIReview = {
  summary: string;
  insights: { title: string; detail: string; evidence: string; type: string }[];
  model: string;
  generated_at: string | null;
  scope: string;
};

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
  state?: string;
  message: string;
  api_key: boolean;
};

type HoldingRow = {
  id: string;
  instrument_name: string;
  asset_class: string;
  symbol: string | null;
  quantity: number | null;
  average_cost: number | null;
  last_price: number | null;
  value: number | null;
  pnl: number | null;
  price_as_of: string | null;
  price_source: string | null;
  currency: string;
  source: string;
  as_of: string | null;
};

type AllocationBucket = {
  asset_class: string;
  value: number;
  percentage: number;
};

type SipRow = {
  id: string;
  scheme_name: string;
  amount: number | null;
  frequency: string | null;
  next_date: string | null;
  status: string | null;
  source: string;
  as_of: string | null;
};

type SourceStatusItem = {
  source: string;
  source_type: string;
  state: string;
  status_message: string | null;
  last_successful_refresh: string | null;
  last_attempted_refresh: string | null;
  last_error: string | null;
  as_of: string | null;
};

const navigation: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Holdings', icon: BriefcaseBusiness },
  { label: 'Manual portfolio', icon: Grid2X2 },
  { label: 'Activity', icon: Activity },
  { label: 'AI insights', icon: Bot },
  { label: 'Glossary', icon: BookOpen },
  { label: 'Settings', icon: Settings2 },
];

const ollamaEndpoints = [
  { label: 'Local Ollama on this machine', value: 'http://127.0.0.1:11434' },
  { label: 'Ollama on host from Docker API', value: 'http://host.docker.internal:11434' },
  { label: 'Ollama service in Docker Compose (make dev-ai)', value: 'http://ollama:11434' },
];

const modelPresets = [
  { name: 'gemma4:26b-a4b', description: 'Gemma 4 26B A4B MoE · 16–19 GB · high-capability' },
  { name: 'gemma4:e2b', description: 'Gemma 4 E2B · 4.6–7.5 GB · constrained local systems' },
  { name: 'gemma4:e4b', description: 'Gemma 4 E4B · 6.6–9.5 GB · modest local systems' },
];

const glossaryTerms = [
  { term: 'Asset allocation', definition: 'How portfolio value is divided across asset classes such as equity, mutual funds, and derivatives.' },
  { term: 'Average cost', definition: 'The average acquisition price recorded for the current quantity. It may exclude fees, taxes, or earlier realized trades.' },
  { term: 'Daily close', definition: 'The last reported closing price for a completed trading session. It is delayed market data, not a live quote.' },
  { term: 'Last price', definition: 'The latest price supplied by the selected source. Its date and source are shown beside the holding.' },
  { term: 'Market value', definition: 'Quantity or units multiplied by the selected last price or NAV.' },
  { term: 'MoE', definition: 'Mixture of Experts: a model architecture that activates a subset of its experts for each token. Total model size still affects memory requirements.' },
  { term: 'NAV', definition: 'Net Asset Value per mutual-fund unit. NAV is published periodically and can be older than a stock quote.' },
  { term: 'P&L', definition: 'Profit and loss. In this dashboard it is based on the source response or current price relative to recorded average cost.' },
  { term: 'SIP', definition: 'Systematic Investment Plan: a recurring mutual-fund investment schedule.' },
  { term: 'T1 quantity', definition: 'Shares bought recently that are awaiting settlement. Kite may report them separately from settled quantity.' },
  { term: 'Net position', definition: 'The current net quantity in an open position after buys and sells, including short or derivative exposure.' },
  { term: 'Source date', definition: 'The date attached to a price or NAV. The snapshot fetch time can differ from the underlying market-data date.' },
];

function App() {
  const [apiHealth, setApiHealth] = useState<Health>('checking');
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [sips, setSips] = useState<SipRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationBucket[]>([]);
  const [sources, setSources] = useState<SourceStatusItem[]>([]);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size: string | null }[]>([]);
  const [modelStatus, setModelStatus] = useState('');
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState('');
  const [manualPositions, setManualPositions] = useState<ManualPosition[]>([]);
  const [selectedManualIds, setSelectedManualIds] = useState<string[]>([]);
  const [bulkMarket, setBulkMarket] = useState('');
  const [bulkType, setBulkType] = useState('');
  const [bulkSource, setBulkSource] = useState('');
  const [csvMode, setCsvMode] = useState<'append' | 'replace'>('append');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date()).toUpperCase();
  const displayHoldings = activeSection === 'Overview' ? holdings.slice(0, 5) : holdings;
  const filteredGlossary = glossaryTerms.filter((item) =>
    `${item.term} ${item.definition}`.toLowerCase().includes(glossarySearch.toLowerCase()),
  );
  const sourceSplit = holdings.reduce<Record<string, { value: number; count: number; unpriced: number; currency: string }>>((groups, holding) => {
    const currency = holding.currency || 'INR';
    const key = `${holding.source || 'Unknown'}|${currency}`;
    const group = groups[key] ?? { value: 0, count: 0, unpriced: 0, currency };
    group.value += holding.value ?? 0;
    group.count += 1;
    if (holding.value == null) group.unpriced += 1;
    groups[key] = group;
    return groups;
  }, {});
  const currencyTotals = Object.values(sourceSplit).reduce<Record<string, number>>((totals, item) => {
    totals[item.currency] = (totals[item.currency] ?? 0) + item.value;
    return totals;
  }, {});
  const invalidManualRow = manualPositions.some(row =>
    !row.ticker.trim() || !row.source.trim() || row.units <= 0 || row.buy_price < 0,
  );

  const formatCurrency = (value: number | null, currency = 'INR') => {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'INR' ? 0 : 2,
    }).format(value);
  };

  const formatCompact = (value: number | null) => {
    if (value == null) return '—';
    return `${value.toFixed(2)}`;
  };

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => current ? { ...current, [key]: value } : current);
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

  async function loadPortfolioData() {
    try {
      const [holdingsResponse, allocationsResponse, sourcesResponse, sipsResponse] = await Promise.all([
        fetch('/api/portfolio/holdings'),
        fetch('/api/portfolio/allocations'),
        fetch('/api/sources'),
        fetch('/api/portfolio/sips'),
      ]);
      if (holdingsResponse.ok) {
        const payload = (await holdingsResponse.json()) as { items?: HoldingRow[] };
        setHoldings(payload.items ?? []);
      } else {
        setHoldings([]);
      }
      if (allocationsResponse.ok) {
        const payload = (await allocationsResponse.json()) as AllocationBucket[];
        setAllocations(payload);
      } else {
        setAllocations([]);
      }
      if (sourcesResponse.ok) {
        const payload = (await sourcesResponse.json()) as { items?: SourceStatusItem[] };
        setSources(payload.items ?? []);
      } else {
        setSources([]);
      }
      if (sipsResponse.ok) {
        const payload = (await sipsResponse.json()) as { items?: SipRow[] };
        setSips(payload.items ?? []);
      } else {
        setSips([]);
      }
    } catch {
      setHoldings([]);
      setAllocations([]);
      setSources([]);
      setSips([]);
    }
  }

  async function loadManualPortfolio() {
    try {
      const response = await fetch('/api/manual-portfolio');
      if (!response.ok) throw new Error('Manual portfolio could not be loaded.');
      const payload = (await response.json()) as { items: ManualPosition[] };
      setManualPositions(payload.items ?? []);
      setSelectedManualIds([]);
      setManualDirty(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Manual portfolio could not be loaded.');
    }
  }

  async function saveManualPortfolio() {
    setManualBusy(true);
    try {
      const payload = manualPositions.map(({ id, ticker, units, market, buy_price, current_price, source, asset_type }) => ({
        id: id.startsWith('draft-') ? null : id,
        ticker,
        units: Number(units),
        market,
        buy_price: Number(buy_price),
        current_price: current_price == null ? null : Number(current_price),
        source,
        asset_type,
      }));
      const response = await fetch('/api/manual-portfolio', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Manual portfolio could not be saved.');
      setManualPositions(result.items as ManualPosition[]);
      setSelectedManualIds([]);
      setManualDirty(false);
      await Promise.all([loadSummary(), loadPortfolioData()]);
      setNotice('Manual portfolio saved separately from Zerodha.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Manual portfolio could not be saved.');
    } finally {
      setManualBusy(false);
    }
  }

  function addManualPosition() {
    setManualDirty(true);
    setManualPositions(rows => [...rows, {
      id: `draft-${crypto.randomUUID()}`, ticker: '', units: 1, market: 'NSE', buy_price: 0,
      current_price: null, price_as_of: null, price_source: null, source: '', asset_type: 'stock',
      created_at: '', updated_at: '',
    }]);
  }

  async function applyManualBulkEdit() {
    const updates = Object.fromEntries([
      ['market', bulkMarket], ['asset_type', bulkType], ['source', bulkSource.trim()],
    ].filter(([, value]) => value));
    if (!selectedManualIds.length || !Object.keys(updates).length) return;
    setManualBusy(true);
    try {
      const response = await fetch('/api/manual-portfolio/bulk', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedManualIds, ...updates }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Bulk edit failed.');
      setManualPositions(rows => rows.map(row => selectedManualIds.includes(row.id) ? {
        ...row,
        ...(bulkMarket ? {
          market: bulkMarket as ManualPosition['market'],
          current_price: null,
          price_as_of: null,
          price_source: null,
        } : {}),
        ...(bulkType ? { asset_type: bulkType as ManualPosition['asset_type'] } : {}),
        ...(bulkSource.trim() ? { source: bulkSource.trim() } : {}),
      } : row));
      if (selectedManualIds.some(id => id.startsWith('draft-'))) setManualDirty(true);
      setSelectedManualIds([]);
      setBulkMarket(''); setBulkType(''); setBulkSource('');
      await Promise.all([loadSummary(), loadPortfolioData()]);
      setNotice(`Updated ${payload.updated} selected row(s).`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Bulk edit failed.');
    } finally { setManualBusy(false); }
  }

  async function deleteSelectedManualRows() {
    if (!selectedManualIds.length) return;
    if (!window.confirm(`Delete ${selectedManualIds.length} selected manual row(s)?`)) return;
    setManualBusy(true);
    try {
      const savedIds = selectedManualIds.filter(id => !id.startsWith('draft-'));
      let deleted = 0;
      if (savedIds.length) {
        const response = await fetch('/api/manual-portfolio/bulk-delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: savedIds }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || 'Selected rows could not be deleted.');
        deleted = payload.deleted;
      }
      setManualPositions(rows => rows.filter(row => !selectedManualIds.includes(row.id)));
      setSelectedManualIds([]);
      await Promise.all([loadSummary(), loadPortfolioData()]);
      setNotice(`Deleted ${deleted} saved row(s) and cleared unsaved rows.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Selected rows could not be deleted.');
    } finally { setManualBusy(false); }
  }

  async function importManualCsv(file: File) {
    if (manualDirty && !window.confirm('Discard unsaved grid edits and continue with this CSV import?')) return;
    if (csvMode === 'replace' && !window.confirm('Replace every saved manual position with rows from this CSV?')) return;
    setManualBusy(true);
    try {
      const csvText = await file.text();
      const response = await fetch('/api/manual-portfolio/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText, replace_existing: csvMode === 'replace' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'CSV import failed.');
      await loadManualPortfolio();
      await Promise.all([loadSummary(), loadPortfolioData()]);
      const rowIssues = (payload.warnings as string[] | undefined)?.slice(0, 2).join(' ');
      setNotice(`Imported ${payload.imported} row(s)${payload.skipped ? `; skipped ${payload.skipped} invalid row(s). ${rowIssues ?? ''}` : ''}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'CSV import failed.');
    } finally { setManualBusy(false); }
  }

  function syncManualCell<K extends keyof ManualPosition>(id: string, field: K, value: ManualPosition[K]) {
    setManualDirty(true);
    setManualPositions(rows => rows.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      if ((field === 'ticker' && row.ticker !== value) || (field === 'market' && row.market !== value)) {
        updated.current_price = null;
        updated.price_as_of = null;
        updated.price_source = null;
      }
      return updated;
    }));
  }

  async function loadTokenStatus(): Promise<TokenStatus> {
    try {
      const response = await fetch('/api/token/status');
      if (!response.ok) throw new Error('Token status unavailable');
      const payload = (await response.json()) as TokenStatus;
      setTokenStatus(payload);
      return payload;
    } catch {
      const fallback = { configured: false, state: 'not_configured', message: 'Token status is unavailable.', api_key: false };
      setTokenStatus(fallback);
      return fallback;
    }
  }

  async function loadPreferences(): Promise<Preferences | null> {
    try {
      const response = await fetch('/api/preferences');
      if (!response.ok) throw new Error('Settings could not be loaded.');
      const payload = (await response.json()) as Preferences;
      setPreferences(payload);
      return payload;
    } catch {
      setNotice('Saved settings could not be loaded from the local API.');
      return null;
    }
  }

  async function requestPriceSync() {
    const response = await fetch('/api/market-data/sync', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Daily price sync failed.');
    await Promise.all([loadSummary(), loadPortfolioData(), loadManualPortfolio()]);
    return payload as { updated: number; message: string };
  }

  async function syncMarketData() {
    setRefreshing(true);
    try {
      const result = await requestPriceSync();
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Price sync failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function syncPortfolio(forceBroker = true) {
    setRefreshing(true);
    let apiResponded = false;
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('API unavailable');
      apiResponded = true;
      setApiHealth('connected');
      const [nextTokenStatus, currentPreferences] = await Promise.all([
        loadTokenStatus(),
        loadPreferences(),
      ]);
      await Promise.all([loadSummary(), loadPortfolioData()]);
      if (nextTokenStatus.configured && (forceBroker || currentPreferences?.auto_sync_zerodha)) {
        setNotice('Syncing your read-only portfolio snapshot from Zerodha…');
        const syncResponse = await fetch('/api/portfolio/sync', { method: 'POST' });
        const syncPayload = await syncResponse.json();
        if (!syncResponse.ok) throw new Error(syncPayload.detail || 'Zerodha portfolio sync failed.');
        await Promise.all([loadSummary(), loadPortfolioData()]);
        setNotice(`Updated from Zerodha: ${syncPayload.holdings_synced} holdings and ${syncPayload.sips_synced} SIPs.`);
      } else if (!nextTokenStatus.configured) {
        setNotice(nextTokenStatus.message);
      } else {
        setNotice('Showing the latest saved local snapshot.');
      }

      if (currentPreferences?.auto_sync_yfinance && currentPreferences.yahoo_terms_confirmed) {
        const priceResult = await requestPriceSync();
        setNotice(priceResult.message);
      }
    } catch (error) {
      if (!apiResponded) setApiHealth('unavailable');
      else await Promise.all([loadSummary(), loadPortfolioData()]);
      setNotice(error instanceof Error
        ? error.message
        : 'The local API or Zerodha could not be reached.');
    } finally {
      setRefreshing(false);
    }
  }

  async function saveSettings() {
    if (!preferences) return;
    setSettingsSaving(true);
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Settings could not be saved.');
      setPreferences(payload as Preferences);
      await Promise.all([loadSummary(), loadPortfolioData()]);
      setNotice('Preferences saved to the local SQLite database.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function discoverOllamaModels() {
    setModelStatus('Checking the saved local Ollama endpoint…');
    try {
      const endpoint = preferences?.ollama_endpoint ?? '';
      const response = await fetch(`/api/ai/models?endpoint=${encodeURIComponent(endpoint)}`);
      const payload = await response.json();
      if (!payload.available) throw new Error(payload.message || 'Ollama is unavailable.');
      setOllamaModels(payload.models ?? []);
      setModelStatus(payload.message || 'Ollama is available.');
    } catch (error) {
      setOllamaModels([]);
      setModelStatus(error instanceof Error ? error.message : 'Ollama is unavailable.');
    }
  }

  async function generateAIReview() {
    setAiLoading(true);
    try {
      const response = await fetch('/api/ai/recommendations', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Local portfolio review failed.');
      setAiReview(payload as AIReview);
      setNotice('Local portfolio review generated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Local portfolio review failed.');
    } finally {
      setAiLoading(false);
    }
  }

  async function loadSamplePortfolio() {
    const payload = {
      source_type: 'manual-import',
      rows: [
        {
          id: 'sample-1',
          instrument_name: 'Reliance Industries',
          asset_class: 'equity',
          symbol: 'RELIANCE',
          quantity: 10,
          average_cost: 2500,
          last_price: 2900,
          value: 29000,
          pnl: 4000,
          currency: 'INR',
          as_of: new Date().toISOString(),
        },
        {
          id: 'sample-2',
          instrument_name: 'HDFC Bank',
          asset_class: 'equity',
          symbol: 'HDFCBANK',
          quantity: 12,
          average_cost: 1600,
          last_price: 1700,
          value: 20400,
          pnl: 1200,
          currency: 'INR',
          as_of: new Date().toISOString(),
        },
      ],
    };

    setNotice('Loading a local sample portfolio so the dashboard has visible data while the live broker sync is implemented.');
    try {
      const response = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to import sample data');
      await Promise.all([loadSummary(), loadPortfolioData()]);
      setNotice('Sample portfolio loaded. You can now view holdings, allocation, and source data.');
    } catch {
      setNotice('The local import endpoint could not load the sample portfolio. Check the API server and try again.');
    }
  }

  useEffect(() => { void syncPortfolio(false); }, []);

  const openSection = (section: Section) => {
    if (activeSection === section) return;
    if (activeSection === 'Manual portfolio' && section !== 'Manual portfolio' && manualDirty
      && !window.confirm('Discard unsaved manual portfolio edits and leave this view?')) return;
    setActiveSection(section);
    setNotice('');
    if (section === 'Settings' && !preferences) void loadPreferences();
    if (section === 'Manual portfolio') void loadManualPortfolio();
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
          <button className="nav-item muted-nav" aria-label="Settings" onClick={() => openSection('Settings')}><Settings2 size={17} /><span>Settings</span></button>
          <button className="nav-item muted-nav" aria-label="Help and guides" onClick={() => openSection('Glossary')}><CircleHelp size={17} /><span>Help & guides</span></button>
          <div className="user-row"><div className="avatar" aria-hidden="true">P</div><div className="user-text"><strong>Personal portfolio</strong><span>Local workspace</span></div><ChevronDown size={16} aria-hidden="true" /></div>
        </div>
      </aside>

      <main id="main-content" className="main-area" tabIndex={-1}>
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setNotice('Use the sidebar navigation to switch sections.')}><Menu size={19} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{activeSection}</strong></div>
          <div className="top-actions"><span className="local-pill"><span className={`status-dot ${apiHealth}`} />LOCAL MODE</span><button className="icon-button" aria-label="Open settings" onClick={() => openSection('Settings')}><Settings2 size={18} /></button></div>
        </header>

        <div className="content-wrap">
          {notice && <div className="notice" role="status"><span>{notice}</span><button className="notice-close" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
          {activeSection === 'Manual portfolio' && <section className="manual-editor-page">
            <div className="welcome-row"><div><p className="overline">SEPARATE FROM ZERODHA</p><h1>Manual <em>portfolio.</em></h1><p className="welcome-copy">Track investments held on other apps. These rows live in a dedicated SQLite table and are included in portfolio analysis when manual imports are visible.</p>{manualDirty && <p className="unsaved-indicator">Unsaved grid edits</p>}</div><div className="manual-actions"><Button variant="outline" disabled={manualBusy || manualDirty} onClick={() => { window.location.href = '/api/manual-portfolio/export'; }}><Download size={15}/> Export CSV</Button><Button variant="outline" onClick={addManualPosition}><Plus size={15}/> Add row</Button><Button onClick={() => void saveManualPortfolio()} disabled={manualBusy || invalidManualRow}><Check size={15}/>{manualBusy ? 'Saving…' : 'Save edits'}</Button></div></div>
            <Card className="manual-import-card"><div className="manual-import-info"><strong>Import a CSV</strong><small>Required columns: ticker, units, market, buy_price, source, asset_type. current_price is optional.</small></div><Select value={csvMode} onChange={event => setCsvMode(event.target.value as 'append' | 'replace')} aria-label="CSV import mode"><option value="append">Append rows</option><option value="replace">Replace manual ledger</option></Select><label className="button button-outline csv-file-button"><Upload size={15}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={event => { const file = event.target.files?.[0]; if (file) void importManualCsv(file); event.currentTarget.value = ''; }} /></label></Card>
            {selectedManualIds.length > 0 && <Card className="bulk-toolbar"><strong>{selectedManualIds.length} selected</strong><Select value={bulkMarket} onChange={event => setBulkMarket(event.target.value)} aria-label="Bulk set market"><option value="">Set market…</option><option value="NSE">NSE</option><option value="BSE">BSE</option><option value="NYSE">NYSE</option></Select><Select value={bulkType} onChange={event => setBulkType(event.target.value)} aria-label="Bulk set type"><option value="">Set type…</option><option value="stock">Stock</option><option value="mf">Mutual fund</option><option value="etf">ETF</option><option value="bond">Bond</option><option value="other">Other</option></Select><Input aria-label="Bulk set source" list="manual-sources" placeholder="Set source (e.g. Groww)" value={bulkSource} onChange={event => setBulkSource(event.target.value)} /><Button variant="outline" onClick={() => void applyManualBulkEdit()} disabled={manualBusy}>Apply changes</Button><Button variant="outline" className="danger-button" onClick={() => void deleteSelectedManualRows()} disabled={manualBusy}><Trash2 size={14}/> Delete selected</Button></Card>}
            <section className="panel manual-grid-panel"><div className="panel-heading"><div><h2>Investment ledger</h2><p className="section-subtitle">Edit cells directly, then save changes. Price sync fills current prices for stock and ETF rows.</p></div><Button variant="outline" disabled={refreshing || manualDirty || !preferences?.yfinance_sync_enabled || !preferences?.yahoo_terms_confirmed} onClick={() => void syncMarketData()}><RefreshCw size={14}/>{refreshing ? 'Syncing…' : 'Sync Yahoo prices'}</Button></div>
              <datalist id="manual-sources">{[...new Set(manualPositions.map(item => item.source).filter(Boolean))].map(source => <option key={source} value={source}/>)}</datalist>
              <Table className="manual-grid"><TableHeader><TableRow><TableHead><input aria-label="Select all rows" type="checkbox" checked={manualPositions.length > 0 && manualPositions.every(row => selectedManualIds.includes(row.id))} onChange={event => setSelectedManualIds(event.target.checked ? manualPositions.map(row => row.id) : [])}/></TableHead><TableHead scope="col">Ticker</TableHead><TableHead scope="col">Units</TableHead><TableHead scope="col">Market</TableHead><TableHead scope="col">Buy price</TableHead><TableHead scope="col">Current price</TableHead><TableHead scope="col">Source</TableHead><TableHead scope="col">Type</TableHead><TableHead scope="col">Market value</TableHead></TableRow></TableHeader><TableBody>
                {manualPositions.map(row => <TableRow key={row.id}><TableCell><input aria-label={`Select ${row.ticker || 'new row'}`} type="checkbox" checked={selectedManualIds.includes(row.id)} onChange={event => setSelectedManualIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))}/></TableCell>
                  <TableCell><Input aria-label="Ticker" value={row.ticker} onChange={event => syncManualCell(row.id, 'ticker', event.target.value)}/></TableCell>
                  <TableCell><Input aria-label="Units" type="number" min="0.000001" step="any" value={row.units} onChange={event => syncManualCell(row.id, 'units', Number(event.target.value))}/></TableCell>
                  <TableCell><Select aria-label="Market" value={row.market} onChange={event => syncManualCell(row.id, 'market', event.target.value as ManualPosition['market'])}><option value="NSE">NSE</option><option value="BSE">BSE</option><option value="NYSE">NYSE</option></Select></TableCell>
                  <TableCell><Input aria-label="Buy price" type="number" min="0" step="any" value={row.buy_price} onChange={event => syncManualCell(row.id, 'buy_price', Number(event.target.value))}/></TableCell>
                  <TableCell><span className="manual-price-cell">{row.current_price == null ? '—' : formatCurrency(row.current_price, row.market === 'NYSE' ? 'USD' : 'INR')}<small>{row.price_source ?? (row.market === 'NYSE' ? 'USD' : 'INR')} · {formatDate(row.price_as_of)}</small></span></TableCell>
                  <TableCell><Input aria-label="Source app or broker" list="manual-sources" placeholder="e.g. Groww" value={row.source} onChange={event => syncManualCell(row.id, 'source', event.target.value)}/></TableCell>
                  <TableCell><Select aria-label="Asset type" value={row.asset_type} onChange={event => syncManualCell(row.id, 'asset_type', event.target.value as ManualPosition['asset_type'])}><option value="stock">Stock</option><option value="mf">Mutual fund</option><option value="etf">ETF</option><option value="bond">Bond</option><option value="other">Other</option></Select></TableCell>
                  <TableCell>{formatCurrency(row.current_price == null ? null : row.current_price * row.units, row.market === 'NYSE' ? 'USD' : 'INR')}</TableCell>
                </TableRow>)}
                {manualPositions.length === 0 && <TableRow><TableCell colSpan={9} className="manual-empty">No manual positions yet. Add a row or import a CSV.</TableCell></TableRow>}
              </TableBody></Table>
              <p className="manual-grid-note">Ticker and source are required; units must be positive. Prices use the market currency. Yahoo Finance refresh is optional and gated in Settings. NYSE values are in USD; currency conversion is not applied to INR portfolio totals.</p>
            </section>
          </section>}
          {activeSection === 'Settings' && <section className="settings-page">
            <div className="welcome-row"><div><p className="overline">LOCAL PREFERENCES</p><h1>Make it <em>yours.</em></h1><p className="welcome-copy">Saved in this app’s SQLite database on your device.</p></div><Button onClick={() => void saveSettings()} disabled={!preferences || settingsSaving}>{settingsSaving ? 'Saving…' : 'Save preferences'}</Button></div>
            {!preferences ? <div className="panel">Loading saved preferences…</div> : <>
              <section className="panel settings-panel"><div className="panel-heading"><div><h2>Portfolio display & sync</h2><p className="section-subtitle">Choose what appears and which sources refresh.</p></div></div>
                <label className="setting-row"><span><strong>Show manual imports</strong><small>Include CSV, manual, and sample rows in totals, holdings, and allocations.</small></span><input type="checkbox" checked={preferences.show_manual_imports} onChange={e => updatePreference('show_manual_imports', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>Sync Zerodha on app open</strong><small>Fetch the latest read-only holdings and SIP snapshot when the dashboard opens.</small></span><input type="checkbox" checked={preferences.auto_sync_zerodha} onChange={e => updatePreference('auto_sync_zerodha', e.target.checked)} /></label>
              </section>
              <section className="panel settings-panel"><div className="panel-heading"><div><h2>Local AI with Ollama</h2><p className="section-subtitle">Requests stay on your configured local or private Ollama host.</p></div><Button variant="outline" onClick={() => void discoverOllamaModels()}><Server size={15}/> Find installed models</Button></div>
                <label className="setting-row"><span><strong>Enable AI portfolio review</strong><small>Generate evidence-linked summaries. Output is informational and not financial advice.</small></span><input type="checkbox" checked={preferences.ollama_enabled} onChange={e => updatePreference('ollama_enabled', e.target.checked)} /></label>
                <div className="settings-fields"><label>Ollama endpoint<input list="ollama-endpoints" value={preferences.ollama_endpoint} onChange={e => updatePreference('ollama_endpoint', e.target.value)} placeholder="http://127.0.0.1:11434"/><datalist id="ollama-endpoints">{ollamaEndpoints.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</datalist><small>{ollamaEndpoints.map(item => item.label + ': ' + item.value).join(' · ')}</small></label>
                  <label>Model<input list="ollama-models" value={preferences.ollama_model} onChange={e => updatePreference('ollama_model', e.target.value)} placeholder="gemma4:e2b"/><datalist id="ollama-models">{[...modelPresets.map(item => item.name), ...ollamaModels.map(item => item.name)].map(name => <option key={name} value={name}/>)}</datalist><small>{modelPresets.map(item => `${item.name} — ${item.description}`).join(' · ')}</small></label></div>
                {modelStatus && <p className="inline-status" role="status">{modelStatus}{ollamaModels.length > 0 && ` · ${ollamaModels.length} model(s) installed`}</p>}
              </section>
              <section className="panel settings-panel"><div className="panel-heading"><div><h2>Yahoo Finance price sync</h2><p className="section-subtitle">Uses yfinance for daily equity closes. Yahoo access is subject to Yahoo’s terms.</p></div></div>
                <label className="setting-row"><span><strong>Allow manual Yahoo price refresh</strong><small>Updates prices for Zerodha equity holdings when you press Sync prices.</small></span><input type="checkbox" checked={preferences.yfinance_sync_enabled} onChange={e => updatePreference('yfinance_sync_enabled', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>I have permission to retrieve Yahoo Finance data this way</strong><small>Automated collection may require prior permission. See <a href="https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html?ncid=mbr_idnedulnk00000001" target="_blank" rel="noreferrer">Yahoo terms</a>.</small></span><input type="checkbox" checked={preferences.yahoo_terms_confirmed} onChange={e => updatePreference('yahoo_terms_confirmed', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>Refresh Yahoo prices on app open</strong><small>Runs only when price sync is enabled and the permission confirmation is saved.</small></span><input type="checkbox" checked={preferences.auto_sync_yfinance} onChange={e => updatePreference('auto_sync_yfinance', e.target.checked)} /></label>
              </section>
            </>}
          </section>}

          {activeSection === 'Glossary' && <section><div className="welcome-row"><div><p className="overline">PLAIN LANGUAGE</p><h1>Portfolio <em>glossary.</em></h1><p className="welcome-copy">Short definitions for the numbers and terms in this dashboard.</p></div></div><label className="glossary-search"><Search size={17}/><input aria-label="Search glossary" placeholder="Search terms" value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)}/></label><div className="glossary-grid">{filteredGlossary.map(item => <article className="panel glossary-card" key={item.term}><h2>{item.term}</h2><p>{item.definition}</p></article>)}</div></section>}

          {activeSection === 'AI insights' && <section><div className="welcome-row"><div><p className="overline">PRIVATE · LOCAL MODEL</p><h1>Understand your <em>portfolio.</em></h1><p className="welcome-copy">Ask your configured Ollama model to summarize concentration and data quality using saved holdings.</p></div><Button variant="ai" onClick={() => void generateAIReview()} disabled={aiLoading || !preferences?.ollama_enabled}>{aiLoading ? 'Reviewing…' : 'Generate review'}</Button></div>
            {!preferences?.ollama_enabled && <div className="panel"><h2>Enable local AI in Settings</h2><p>Choose a local Ollama endpoint and installed model, then enable AI portfolio review.</p><Button variant="outline" onClick={() => openSection('Settings')}>Open settings</Button></div>}
            {aiReview && <><div className="panel ai-summary"><h2>Summary · {aiReview.model}</h2><p>{aiReview.summary}</p><small>Generated {formatDate(aiReview.generated_at)} · {aiReview.scope}</small></div><div className="ai-insight-grid">{aiReview.insights.map((item, index) => <article className="panel" key={`${item.title}-${index}`}><span className="status-pill">{item.type}</span><h2>{item.title}</h2><p>{item.detail}</p><small>Portfolio evidence: {item.evidence}</small></article>)}</div></>}
            <p className="ai-disclaimer">Informational only. The model does not forecast returns or provide buy, sell, or trade instructions.</p>
          </section>}

          {activeSection === 'Activity' && <section><div className="welcome-row"><div><p className="overline">DATA FRESHNESS</p><h1>Recent <em>activity.</em></h1><p className="welcome-copy">Review connections, refresh attempts, and the age of your saved snapshots.</p></div><Button variant="outline" onClick={() => void syncPortfolio()} disabled={refreshing}><RefreshCw size={15}/> Sync Zerodha</Button></div><div className="panel activity-list">{sources.length === 0 ? <p>No source activity has been recorded yet.</p> : sources.map(source => <article className="activity-item" key={source.source}><span className={`status-pill ${source.state}`}>{source.state}</span><div><h2>{source.source}</h2><p>{source.status_message || source.last_error || 'No status detail available.'}</p><small>Last success: {formatDate(source.last_successful_refresh)} · Last attempt: {formatDate(source.last_attempted_refresh)} · Data date: {formatDate(source.as_of)}</small></div></article>)}</div></section>}

          {(activeSection === 'Overview' || activeSection === 'Holdings') && <>
          <section className="welcome-row">
            <div><p className="overline">{today}</p><h1>Your portfolio, <em>in focus.</em></h1><p className="welcome-copy">A calm place to understand what you own and how it’s doing.</p></div>
            <div className="welcome-actions">
              <Button variant="outline" onClick={loadSamplePortfolio}><FileUp size={16} /> Load sample</Button>
              <Button onClick={() => void syncPortfolio()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Sync Zerodha</Button>
            </div>
          </section>

          {tokenStatus && !tokenStatus.configured && (
            <section className="panel" aria-labelledby="setup-heading">
              <div className="panel-heading"><div><h2 id="setup-heading">Setup required</h2><p className="section-subtitle">The app needs a local Zerodha access token before it can load holdings.</p></div></div>
              <p>{tokenStatus.message}</p>
              <p>Open the internal Streamlit setup UI with <code>make token-ui</code> and save a fresh token to the local secure secret store.</p>
            </section>
          )}

          <section aria-labelledby="summary-heading">
            <div className="section-title-row"><div><h2 id="summary-heading">Portfolio overview</h2><p className="section-subtitle">Your investment snapshot at a glance</p></div><Button variant="ghost" onClick={() => void syncPortfolio()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Syncing…' : 'Refresh'}</Button></div>
            <div className="metric-grid">
              <Card className="metric-card" role="group" aria-label="Total portfolio value"><div className="metric-label">Total portfolio value <span className="metric-icon mint"><WalletCards size={17} /></span></div><div className="metric-value">{formatCurrency(summary?.total_value ?? null)}</div><div className="metric-foot">{summary?.as_of ? new Date(summary.as_of).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'INR'} <span className="foot-separator">·</span> {summary?.status === 'empty' ? 'Awaiting data' : 'Updated value'}</div></Card>
              <Card className="metric-card" role="group" aria-label="Invested amount"><div className="metric-label">Invested amount <span className="metric-icon peach"><Landmark size={17} /></span></div><div className="metric-value">{formatCurrency(summary?.invested ?? null)}</div><div className="metric-foot">{summary?.invested != null ? 'Based on imported transactions' : 'No cost basis yet'}</div></Card>
              <Card className="metric-card" role="group" aria-label="Overall returns"><div className="metric-label">Overall returns <span className="metric-icon blue"><ArrowUpRight size={17} /></span></div><div className="metric-value">{formatCurrency(summary?.pnl ?? null)}</div><div className="metric-foot">{summary?.pnl != null ? 'Portfolio P&L' : 'P&amp;L appears when cost data is available'}</div></Card>
            </div>
            {summary?.warnings.length ? <div className="summary-warnings" role="status">{summary.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</div> : null}
          </section>

          <div className="dashboard-grid">
            <section className="panel allocation-panel" aria-labelledby="allocation-title">
              <div className="panel-heading"><div><h2 id="allocation-title">Asset allocation</h2><p className="section-subtitle">Where your portfolio is invested</p></div><button className="icon-button small" aria-label="Allocation information" onClick={() => setNotice('Allocation is calculated from the latest imported holdings.')}><CircleHelp size={16} /></button></div>
              {allocations.length === 0 ? (
                <div className="allocation-empty"><div className="donut" aria-hidden="true"><div className="donut-inner"><ChartNoAxesCombined size={23} /></div></div><strong>{holdings.length ? 'No priced INR holdings yet' : 'No holdings yet'}</strong><p>{holdings.length ? 'Allocation uses priced INR positions. Other currencies stay separate until conversion is configured.' : 'Import a statement or load the sample portfolio.'}</p>{!holdings.length && <button className="text-button" onClick={loadSamplePortfolio}>Load sample data <ArrowUpRight size={14} /></button>}</div>
              ) : (
                <div className="allocation-list">
                  {allocations.map((bucket) => (
                    <div key={bucket.asset_class} className="allocation-row">
                      <div className="allocation-label">
                        <span className={`legend-dot ${bucket.asset_class === 'equity' ? 'equity' : bucket.asset_class === 'mutual_fund' ? 'funds' : 'other'}`} />
                        <strong>{bucket.asset_class === 'mutual_fund' ? 'Mutual funds' : bucket.asset_class}</strong>
                      </div>
                      <div className="allocation-meta">
                        <span>{formatCurrency(bucket.value)}</span>
                        <small>{bucket.percentage.toFixed(1)}%</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="legend-row"><span><i className="legend-dot equity" />Equity</span><span><i className="legend-dot funds" />Mutual funds</span><span><i className="legend-dot other" />Other</span></div>
            </section>
            <section className="panel insight-panel" aria-labelledby="insight-heading">
              <div className="insight-top"><span className="ai-mark"><Bot size={18} /></span><span className="ai-local">PRIVATE · LOCAL AI</span></div>
              <h2 id="insight-heading">A little perspective.</h2>
              <p>Ask your local Gemma model to explain your allocation, spot concentration, or summarize recent changes.</p>
              <div className="model-status"><span className={`model-dot ${preferences?.ollama_enabled ? 'connected' : ''}`} /><span>{preferences?.ollama_enabled ? preferences.ollama_model : 'Model not enabled'}</span><button className="text-button" onClick={() => openSection('Settings')}>Configure <ArrowUpRight size={13} /></button></div>
              <Button variant="ai" onClick={() => openSection('AI insights')}><Bot size={16} /> Explore insights</Button>
              <span className="ai-disclaimer">Informational only. Never a trade instruction.</span>
            </section>
          </div>

          {activeSection === 'Overview' && <section className="panel source-split-panel" aria-labelledby="source-split-title"><div className="panel-heading"><div><h2 id="source-split-title">Portfolio by source</h2><p className="section-subtitle">Market value grouped by the account or app where you hold it</p></div><Button variant="ghost" onClick={() => openSection('Manual portfolio')}>Manage manual rows <ArrowUpRight size={14}/></Button></div>
            {Object.keys(sourceSplit).length === 0 ? <p className="source-split-empty">Add manual positions or sync Zerodha to see source coverage here.</p> : <div className="source-split-list">{Object.entries(sourceSplit).sort((a, b) => b[1].value - a[1].value).map(([key, item]) => { const [name] = key.split('|'); const percentage = currencyTotals[item.currency] ? item.value / currencyTotals[item.currency] * 100 : 0; return <div className="source-split-row" key={key}><span className="source-split-name"><i className="legend-dot equity"/><strong>{name}</strong><small>{item.count} holding{item.count === 1 ? '' : 's'}{item.unpriced ? ` · ${item.unpriced} unpriced` : ''}</small></span><span className="source-split-value">{formatCurrency(item.value, item.currency)}<small>{percentage.toFixed(1)}% of priced {item.currency} holdings</small></span></div>; })}</div>}
          </section>}

          <section className="panel holdings-panel" aria-labelledby="holdings-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="holdings-heading">Your holdings</h2><p className="section-subtitle">A clear view of each investment</p></div><Button variant="ghost" onClick={() => openSection('Holdings')}>View all <ArrowUpRight size={14} /></Button></div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th scope="col">INSTRUMENT</th><th scope="col">TYPE</th><th scope="col">QUANTITY</th><th scope="col">PRICE</th><th scope="col">VALUE</th><th scope="col">RETURNS</th></tr>
                </thead>
                <tbody>
                  {holdings.length === 0 ? (
                    <tr><td colSpan={6}><div className="table-empty"><span className="empty-icon"><WalletCards size={19} /></span><span><strong>Your holdings will appear here</strong><small>Import a statement or connect an account to begin.</small></span><ArrowDownLeft className="empty-arrow" size={17} aria-hidden="true" /></div></td></tr>
                  ) : displayHoldings.map((holding) => (
                    <tr key={holding.id}>
                      <td>{holding.instrument_name}</td>
                      <td>{holding.asset_class === 'mutual_fund' ? 'Mutual fund' : holding.asset_class === 'equity_position' ? 'Equity position' : holding.asset_class === 'derivative_position' ? 'Derivative' : holding.asset_class}</td>
                      <td>{formatCompact(holding.quantity)}</td>
                      <td title={`Price date: ${formatDate(holding.price_as_of)}`}>
                        {formatCurrency(holding.last_price, holding.currency)}
                        <small className="table-price-date">{formatDate(holding.price_as_of)}</small>
                        <small className="table-price-date">{holding.price_source ?? holding.source}</small>
                      </td>
                      <td>{formatCurrency(holding.value, holding.currency)}</td>
                      <td>{formatCurrency(holding.pnl, holding.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-note"><span>INR and USD follow each holding’s market currency</span><span>Data date: {formatDate(summary?.as_of ?? null)}</span></div>
          </section>

          <section className="panel holdings-panel" aria-labelledby="sips-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="sips-heading">Mutual fund SIPs</h2><p className="section-subtitle">Schedules returned by Zerodha Coin</p></div></div>
            {sips.length === 0 ? (
              <div className="table-empty"><span className="empty-icon"><RefreshCw size={17} /></span><span><strong>No active or paused SIPs returned</strong><small>Sync the Zerodha account to refresh SIP schedules.</small></span></div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th scope="col">FUND</th><th scope="col">AMOUNT</th><th scope="col">FREQUENCY</th><th scope="col">NEXT INSTALMENT</th><th scope="col">STATUS</th></tr></thead>
                  <tbody>{sips.map((sip) => (
                    <tr key={sip.id}><td>{sip.scheme_name}</td><td>{formatCurrency(sip.amount)}</td><td>{sip.frequency ?? '—'}</td><td>{formatDate(sip.next_date)}</td><td>{sip.status ?? '—'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          {sources.length > 0 && (
            <section className="panel holdings-panel" aria-labelledby="source-heading">
              <div className="panel-heading holdings-heading"><div><h2 id="source-heading">Source status</h2><p className="section-subtitle">Where each value is coming from</p></div></div>
              <div className="source-list">
                {sources.map((source) => (
                  <div key={source.source} className="source-item">
                    <span className={`status-pill ${source.state}`}>{source.state}</span>
                    <strong>{source.source}</strong>
                    <small>{source.status_message ?? 'No status detail available'}</small>
                    <em>{formatDate(source.as_of)} · {source.source_type}</em>
                  </div>
                ))}
              </div>
            </section>
          )}
          {activeSection === 'Holdings' && <section className="panel price-sync-panel"><div><h2>Daily market price update</h2><p className="section-subtitle">Yahoo Finance data via yfinance · refreshes Zerodha equity symbols only.</p></div><Button variant="outline" disabled={refreshing || !preferences?.yfinance_sync_enabled || !preferences?.yahoo_terms_confirmed} onClick={() => void syncMarketData()}><RefreshCw size={15}/>{refreshing ? 'Refreshing…' : 'Sync prices'}</Button></section>}
          </>}

          <footer className="page-footer"><span>Made for clarity, built for privacy.</span><span><ShieldCheck size={14} /> Your data never leaves this device</span></footer>
        </div>
      </main>
    </div>
  );
}

export default App;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find the React root element.');
}

createRoot(rootElement).render(<App />);
