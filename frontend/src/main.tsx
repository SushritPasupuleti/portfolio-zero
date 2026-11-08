import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider, useBlocker, useLocation, useNavigate } from 'react-router';
import {
  Activity, ArrowUpRight, BookOpen, Bot, BriefcaseBusiness,
  ChartNoAxesCombined, Check, CircleHelp, Copy, Download, Grid2X2,
  ExternalLink, Eye, EyeOff, Landmark, LayoutDashboard, Menu, Newspaper, Palette, Plus, RefreshCw, Search, Server, Settings2, Type,
  Trash2, Upload, WalletCards,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { AlertDialog } from './components/ui/alert-dialog';
import { Card } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Collapsible } from './components/ui/collapsible';
import { DataTable, type DataTableColumn } from './components/ui/data-table';
import { Dialog } from './components/ui/dialog';
import { Empty } from './components/ui/empty';
import { Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Markdown } from './components/ui/markdown';
import { Progress } from './components/ui/progress';
import { Select } from './components/ui/select';
import { Switch } from './components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ToastViewport, type ToastItem } from './components/ui/toast';
import { Skeleton } from './components/ui/skeleton';
import { Tooltip } from './components/ui/tooltip';
import { ZerodhaMark } from './components/ui/zerodha-mark';
import './style.css';
import './theme.css';

type Health = 'checking' | 'connected' | 'unavailable';
type Section = 'Overview' | 'Holdings' | 'Projections' | 'Manual portfolio' | 'News & reports' | 'Activity' | 'AI insights' | 'Glossary' | 'Settings';
type NpsAccount = { valuation: number; contribution_amount: number; contribution_day: number; annual_return_percent: number; valuation_as_of: string; updated_at?: string };
type Confirmation = { title: string; description: string; confirmLabel: string; destructive?: boolean };

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
  theme: 'latte' | 'frappe' | 'macchiato' | 'mocha';
  ollama_enabled: boolean;
  ollama_endpoint: string;
  ollama_model: string;
  yfinance_sync_enabled: boolean;
  yahoo_terms_confirmed: boolean;
  auto_sync_yfinance: boolean;
  yahoo_news_enabled: boolean;
  rss_news_enabled: boolean;
  news_lookback_hours: number;
  news_max_articles: number;
};

type NewsItem = {
  id: string;
  ticker: string;
  instrument_name: string;
  asset_type: string;
  related_tickers: string[];
  source_key: string;
  title: string;
  publisher: string | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  fetched_at: string;
};

type AIReport = {
  report_id: string;
      report_type: 'portfolio' | 'news' | 'ideas' | 'risk' | 'diversification' | 'funds';
  markdown: string;
  model: string;
  generated_at: string | null;
  saved_at: string;
  scope: string;
  metadata?: Record<string, unknown>;
};

type AIReportSummary = Omit<AIReport, 'markdown'>;

type ReportType = AIReport['report_type'];
type AISectionTab = 'portfolio' | 'news' | 'ideas' | 'risk' | 'diversification' | 'funds';

function reportTypeLabel(type: ReportType): string {
  const labels: Record<ReportType, string> = { portfolio: 'Portfolio review', news: 'News report', ideas: 'Stock & fund ideas', risk: 'Risk & concentration', diversification: 'Diversification', funds: 'Fund & ETF research' };
  return labels[type];
}

function statusBadgeVariant(state: string): 'success' | 'destructive' | 'secondary' | 'outline' {
  if (state === 'connected') return 'success';
  if (state === 'invalid' || state === 'reauth_required') return 'destructive';
  if (state === 'disconnected') return 'secondary';
  return 'outline';
}

function exportMarkdownReport(report: AIReport) {
  const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date(report.saved_at).toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `portfolio-${report.report_type}-report-${date}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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

type ManualSipEntry = {
  id: string;
  schedule_id: string;
  interval_key: string;
  effective_date: string;
  amount: number;
  status: 'scheduled/unconfirmed' | 'confirmed' | 'skipped';
  created_at: string;
};

type ManualSipSchedule = {
  id: string;
  scheme_name: string;
  source: string;
  amount: number;
  frequency: 'monthly' | 'weekly';
  trigger_day: number;
  start_date: string;
  end_date: string | null;
  timezone: string;
  enabled: boolean;
  next_trigger_date: string | null;
  entries: ManualSipEntry[];
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
  { label: 'Projections', icon: ChartNoAxesCombined },
  { label: 'Manual portfolio', icon: Grid2X2 },
  { label: 'News & reports', icon: Newspaper },
  { label: 'Activity', icon: Activity },
  { label: 'AI insights', icon: Bot },
  { label: 'Glossary', icon: BookOpen },
  { label: 'Settings', icon: Settings2 },
];

const sectionPaths: Record<Section, string> = {
  Overview: '/',
  Holdings: '/holdings',
  Projections: '/projections',
  'Manual portfolio': '/manual-portfolio',
  'News & reports': '/news',
  Activity: '/activity',
  'AI insights': '/ai-insights',
  Glossary: '/glossary',
  Settings: '/settings',
};

function sectionFromPath(pathname: string): Section {
  return navigation.find(({ label }) => sectionPaths[label] === pathname)?.label ?? 'Overview';
}

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

  const themes: { value: Preferences['theme']; label: string; appearance: string; mode: 'light' | 'dark' }[] = [
  { value: 'latte', label: 'Latte', appearance: 'Light', mode: 'light' },
  { value: 'frappe', label: 'Frappé', appearance: 'Soft dark', mode: 'dark' },
  { value: 'macchiato', label: 'Macchiato', appearance: 'Medium dark', mode: 'dark' },
  { value: 'mocha', label: 'Mocha', appearance: 'Deep dark', mode: 'dark' },
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
  const location = useLocation();
  const navigate = useNavigate();
  const [apiHealth, setApiHealth] = useState<Health>('checking');
  const activeSection = sectionFromPath(location.pathname);
  const [navOpen, setNavOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSequence = useRef(0);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [sips, setSips] = useState<SipRow[]>([]);
  const [manualSips, setManualSips] = useState<ManualSipSchedule[]>([]);
  const [npsAccount, setNpsAccount] = useState<NpsAccount | null>(null);
  const [npsValuation, setNpsValuation] = useState('100000.00');
  const [npsContribution, setNpsContribution] = useState('5000');
  const [npsDay, setNpsDay] = useState('5');
  const [npsReturn, setNpsReturn] = useState('8');
  const [npsAsOf, setNpsAsOf] = useState('2025-01-01');
  const [npsBusy, setNpsBusy] = useState(false);
  const [projectionYears, setProjectionYears] = useState(10);
  const [projectionRates, setProjectionRates] = useState<Record<string, number>>({ equity: 10, mutual_fund: 10, etf: 9, bond: 6, other: 5, equity_position: 10, derivative_position: 0, nps: 10 });
  const [manualSipBusy, setManualSipBusy] = useState(false);
  const [sipSchemeName, setSipSchemeName] = useState('');
  const [sipSource, setSipSource] = useState('Manual');
  const [sipAmount, setSipAmount] = useState('');
  const [sipFrequency, setSipFrequency] = useState<'monthly' | 'weekly'>('monthly');
  const [sipTriggerDay, setSipTriggerDay] = useState('1');
  const [sipStartDate, setSipStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [sipEndDate, setSipEndDate] = useState('');
  const [sipEditingId, setSipEditingId] = useState<string | null>(null);
  const [sipEnabled, setSipEnabled] = useState(true);
  const [allocations, setAllocations] = useState<AllocationBucket[]>([]);
  const [sources, setSources] = useState<SourceStatusItem[]>([]);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [kiteApiKey, setKiteApiKey] = useState('');
  const [kiteApiSecret, setKiteApiSecret] = useState('');
  const [kiteLoginUrl, setKiteLoginUrl] = useState('');
  const [kiteTokenBusy, setKiteTokenBusy] = useState(false);
  const [kiteTokenNotice, setKiteTokenNotice] = useState('');
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size: string | null }[]>([]);
  const [modelStatus, setModelStatus] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [reportArchive, setReportArchive] = useState<AIReportSummary[]>([]);
  const [selectedSavedReport, setSelectedSavedReport] = useState<AIReport | null>(null);
  const [reportArchiveLoading, setReportArchiveLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [latestGeneratedReport, setLatestGeneratedReport] = useState<AIReport | null>(null);
  const [reportExpanded, setReportExpanded] = useState(true);
  const [aiTab, setAiTab] = useState<AISectionTab>('portfolio');
  const [fontScale, setFontScale] = useState<'normal' | 'large'>(() => localStorage.getItem('portfolio-font-scale') === 'large' ? 'large' : 'normal');
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('portfolio-privacy-mode') === 'on');
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [glossarySearch, setGlossarySearch] = useState('');
  const [manualPositions, setManualPositions] = useState<ManualPosition[]>([]);
  const [selectedManualIds, setSelectedManualIds] = useState<string[]>([]);
  const [bulkMarket, setBulkMarket] = useState('');
  const [bulkType, setBulkType] = useState('');
  const [bulkSource, setBulkSource] = useState('');
  const [csvMode, setCsvMode] = useState<'append' | 'replace'>('append');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [initialPortfolioLoading, setInitialPortfolioLoading] = useState(true);
  const navigationBlocker = useBlocker(({ currentLocation, nextLocation }) =>
    activeSection === 'Manual portfolio'
      && manualDirty
      && currentLocation.pathname !== nextLocation.pathname,
  );
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date()).toUpperCase();
  const kiteRedirectUrl = `${window.location.origin}/`;
  const displayHoldings = activeSection === 'Overview' ? holdings.slice(0, 5) : holdings;
  const filteredGlossary = glossaryTerms.filter((item) =>
    `${item.term} ${item.definition}`.toLowerCase().includes(glossarySearch.toLowerCase()),
  );

  function addToast(message: string, variant: ToastItem['variant'] = 'default', progressLabel?: string) {
    const id = ++toastSequence.current;
    setToasts(items => [...items, { id, message, variant, progressLabel }]);
    return id;
  }

  function setNotice(message: string) {
    if (!message) return;
    const isError = /failed|could not|unavailable|error|invalid|missing|unable/i.test(message);
    addToast(message, isError ? 'destructive' : 'default');
  }

  function dismissToast(id: number) {
    setToasts(items => items.filter(item => item.id !== id));
  }

  function askForConfirmation(options: Confirmation): Promise<boolean> {
    return new Promise(resolve => {
      confirmationResolver.current = resolve;
      setConfirmation(options);
    });
  }

  function resolveConfirmation(confirmed: boolean) {
    const resolve = confirmationResolver.current;
    confirmationResolver.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  }
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
  const projectionRows = holdings.filter(row => row.currency === 'INR' && row.value != null && row.value > 0).map(row => {
    const type = row.asset_class || 'other';
    const annual = (projectionRates[type] ?? projectionRates.other ?? 5) / 100;
    const current = row.value ?? 0;
    const cost = row.quantity != null && row.average_cost != null ? row.quantity * row.average_cost : null;
    let projected = current * Math.pow(1 + annual, projectionYears);
    if (type === 'nps' && npsAccount) {
      const months = projectionYears * 12;
      const monthlyRate = Math.pow(1 + annual, 1 / 12) - 1;
      const contributions = monthlyRate === 0
        ? npsAccount.contribution_amount * months
        : npsAccount.contribution_amount * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
      projected += contributions;
    }
    return { ...row, annual, current, cost, projected, gain: projected - current };
  });
  const projectionCurrentTotal = projectionRows.reduce((total, row) => total + row.current, 0);
  const projectionFutureTotal = projectionRows.reduce((total, row) => total + row.projected, 0);
  const projectionCostTotal = projectionRows.reduce((total, row) => total + (row.cost ?? 0), 0);
  const invalidManualRow = manualPositions.some(row =>
    !row.ticker.trim() || !row.source.trim() || row.units <= 0 || row.buy_price < 0,
  );
  const filteredManualPositions = manualPositions.filter(row =>
    `${row.ticker} ${row.source} ${row.market} ${row.asset_type}`.toLocaleLowerCase().includes(manualSearch.trim().toLocaleLowerCase()),
  );

  const formatCurrency = (value: number | null, currency = 'INR') => {
    if (value == null) return '—';
    if (privacyMode) return '••••••';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'INR' ? 0 : 2,
    }).format(value);
  };

  const formatPercent = (value: number, digits = 1) => privacyMode ? '•••' : `${value.toFixed(digits)}%`;

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

  const holdingColumns: DataTableColumn<HoldingRow>[] = [
    { id: 'instrument', header: 'Instrument', sortValue: row => row.instrument_name, cell: row => <strong className="table-primary-cell">{row.instrument_name}</strong> },
    { id: 'type', header: 'Type', sortValue: row => row.asset_class, cell: row => <Badge variant="secondary">{row.asset_class === 'mutual_fund' ? 'Mutual fund' : row.asset_class === 'equity_position' ? 'Equity position' : row.asset_class === 'derivative_position' ? 'Derivative' : row.asset_class}</Badge> },
    { id: 'quantity', header: 'Quantity', sortValue: row => row.quantity, cell: row => formatCompact(row.quantity) },
    { id: 'price', header: 'Price', sortValue: row => row.last_price, cell: row => <span className="table-detail-cell" title={`Price date: ${formatDate(row.price_as_of)}`}>{formatCurrency(row.last_price, row.currency)}<small>{row.price_source ?? row.source} · {formatDate(row.price_as_of)}</small></span> },
    { id: 'value', header: 'Market value', sortValue: row => row.value, cell: row => formatCurrency(row.value, row.currency) },
    { id: 'pnl', header: 'P&L', sortValue: row => row.pnl, cell: row => { const pnl = row.pnl; const tone = pnl == null || pnl === 0 ? 'neutral' : pnl > 0 ? 'profit' : 'loss'; const intensity = pnl == null || pnl === 0 ? 0 : Math.min(1, Math.abs(pnl) / Math.max(Math.abs(row.value ?? 0) * .25, 1)); return <span className={`pnl-heat pnl-heat-${tone}`} style={{ '--heat': intensity } as React.CSSProperties} title={pnl == null ? 'P&L unavailable' : `${pnl > 0 ? 'Profit' : pnl < 0 ? 'Loss' : 'Neutral'}: ${formatCurrency(pnl, row.currency)}`}><span className="pnl-heat-dot" aria-hidden="true"/>{formatCurrency(pnl, row.currency)}</span> } },
  ];
  const sipColumns: DataTableColumn<SipRow>[] = [
    { id: 'fund', header: 'Fund', sortValue: row => row.scheme_name, cell: row => <strong className="table-primary-cell">{row.scheme_name}</strong> },
    { id: 'amount', header: 'Amount', sortValue: row => row.amount, cell: row => formatCurrency(row.amount) },
    { id: 'frequency', header: 'Frequency', sortValue: row => row.frequency, cell: row => row.frequency ?? '—' },
    { id: 'next-date', header: 'Next installment', sortValue: row => row.next_date, cell: row => formatDate(row.next_date) },
    { id: 'status', header: 'Status', sortValue: row => row.status, cell: row => <Badge variant={row.status?.toLowerCase() === 'active' ? 'success' : 'outline'}>{row.status ?? 'Unknown'}</Badge> },
    { id: 'source', header: 'Source', sortValue: row => row.source, cell: row => row.source },
  ];

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => current ? { ...current, [key]: value } : current);
    if (key === 'theme') document.documentElement.dataset.theme = String(value);
  };

  async function saveThemePreference(theme: Preferences['theme']) {
    const previousTheme = preferences?.theme ?? 'latte';
    updatePreference('theme', theme);
    setThemeSaving(true);
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Theme could not be saved.');
      setPreferences(current => current ? { ...current, theme } : payload as Preferences);
      setNotice(`${themes.find(item => item.value === theme)?.label ?? theme} theme saved.`);
    } catch (error) {
      document.documentElement.dataset.theme = previousTheme;
      setPreferences(current => current ? { ...current, theme: previousTheme } : current);
      setNotice(error instanceof Error ? error.message : 'Theme could not be saved.');
    } finally {
      setThemeSaving(false);
    }
  }

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
      const [holdingsResponse, allocationsResponse, sourcesResponse, sipsResponse, manualSipsResponse, npsResponse] = await Promise.all([
        fetch('/api/portfolio/holdings'),
        fetch('/api/portfolio/allocations'),
        fetch('/api/sources'),
        fetch('/api/portfolio/sips'),
        fetch('/api/manual-sips'),
        fetch('/api/nps'),
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
      if (manualSipsResponse.ok) {
        const payload = (await manualSipsResponse.json()) as { items?: ManualSipSchedule[] };
        setManualSips(payload.items ?? []);
      } else {
        setManualSips([]);
      }
      if (npsResponse.ok) {
        const payload = await npsResponse.json() as { account?: NpsAccount | null };
        if (payload.account) { setNpsAccount(payload.account); setNpsValuation(String(payload.account.valuation)); setNpsContribution(String(payload.account.contribution_amount)); setNpsDay(String(payload.account.contribution_day)); setNpsReturn(String(payload.account.annual_return_percent)); setNpsAsOf(payload.account.valuation_as_of); }
      }
    } catch {
      setHoldings([]);
      setAllocations([]);
      setSources([]);
      setSips([]);
      setManualSips([]);
    }
  }

  async function saveNps(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNpsBusy(true);
    try {
      const response = await fetch('/api/nps', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valuation: Number(npsValuation), contribution_amount: Number(npsContribution), contribution_day: Number(npsDay), annual_return_percent: Number(npsReturn), valuation_as_of: npsAsOf }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.detail || 'NPS account could not be saved.');
      setNpsAccount(payload.account); await Promise.all([loadPortfolioData(), loadSummary()]); setNotice('NPS account updated.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'NPS account could not be saved.'); }
    finally { setNpsBusy(false); }
  }

  async function createManualSip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualSipBusy(true);
    try {
      const response = await fetch(sipEditingId ? `/api/manual-sips/${sipEditingId}` : '/api/manual-sips', {
        method: sipEditingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheme_name: sipSchemeName,
          source: sipSource,
          amount: Number(sipAmount),
          frequency: sipFrequency,
          trigger_day: Number(sipTriggerDay),
          start_date: sipStartDate,
          end_date: sipEndDate || null,
          timezone: 'Asia/Kolkata',
          enabled: sipEnabled,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Manual SIP schedule could not be saved.');
      const schedules = (payload.items ?? []) as ManualSipSchedule[];
      setManualSips(schedules);
      setSipSchemeName('');
      setSipAmount('');
      setSipEndDate('');
      setSipEditingId(null);
      setSipEnabled(true);
      setNotice(sipEditingId ? 'Manual SIP schedule updated.' : 'Manual SIP schedule saved. Due installments are recorded as unconfirmed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Manual SIP schedule could not be saved.');
    } finally {
      setManualSipBusy(false);
    }
  }

  function editManualSip(schedule: ManualSipSchedule) {
    setSipEditingId(schedule.id);
    setSipSchemeName(schedule.scheme_name);
    setSipSource(schedule.source);
    setSipAmount(String(schedule.amount));
    setSipFrequency(schedule.frequency);
    setSipTriggerDay(String(schedule.trigger_day));
    setSipStartDate(schedule.start_date);
    setSipEndDate(schedule.end_date ?? '');
    setSipEnabled(schedule.enabled);
  }

  function cancelManualSipEdit() {
    setSipEditingId(null);
    setSipSchemeName('');
    setSipSource('Manual');
    setSipAmount('');
    setSipFrequency('monthly');
    setSipTriggerDay('1');
    setSipStartDate(new Date().toISOString().slice(0, 10));
    setSipEndDate('');
    setSipEnabled(true);
  }

  async function toggleManualSip(schedule: ManualSipSchedule) {
    setManualSipBusy(true);
    try {
      const response = await fetch(`/api/manual-sips/${schedule.id}/enabled`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Schedule status could not be updated.');
      setManualSips((payload.items ?? []) as ManualSipSchedule[]);
      if (sipEditingId === schedule.id) setSipEnabled(!schedule.enabled);
      setNotice(schedule.enabled ? 'Schedule paused. Existing entries are retained.' : 'Schedule enabled.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Schedule status could not be updated.');
    } finally {
      setManualSipBusy(false);
    }
  }

  async function updateManualSipEntry(entry: ManualSipEntry, status: ManualSipEntry['status']) {
    try {
      const response = await fetch(`/api/manual-sips/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Installment could not be updated.');
      setManualSips(current => current.map(schedule => ({
        ...schedule,
        entries: schedule.entries.map(item => item.id === entry.id ? { ...item, status } : item),
      })));
      setNotice(`Installment marked ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Installment could not be updated.');
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
    const confirmed = await askForConfirmation({
      title: 'Delete selected positions?',
      description: `${selectedManualIds.length} selected manual row(s) will be removed from this device. This cannot be undone.`,
      confirmLabel: 'Delete positions',
      destructive: true,
    });
    if (!confirmed) return;
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
    if (manualDirty && !await askForConfirmation({
      title: 'Discard unsaved edits?',
      description: 'The CSV import will discard changes that have not been saved in the manual positions grid.',
      confirmLabel: 'Discard and import',
    })) return;
    if (csvMode === 'replace' && !await askForConfirmation({
      title: 'Replace the manual portfolio?',
      description: 'Saved manual positions will be replaced by the valid rows in this CSV. Zerodha data is not affected.',
      confirmLabel: 'Replace positions',
      destructive: true,
    })) return;
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

  async function loadKiteCredentials() {
    try {
      const response = await fetch('/api/token/credentials');
      if (!response.ok) throw new Error('Stored Kite credentials could not be loaded.');
      const payload = await response.json() as { api_key?: string; api_secret?: string; configured?: boolean };
      setKiteApiKey(payload.api_key ?? '');
      setKiteApiSecret(payload.api_secret ?? '');
      if (payload.configured) await createKiteLoginUrl(payload.api_key ?? '');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Stored Kite credentials could not be loaded.');
    }
  }

  async function persistKiteCredentials() {
    try {
      const response = await fetch('/api/token/credentials', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: kiteApiKey, api_secret: kiteApiSecret }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Kite credentials could not be saved.');
      addToast('Kite API key and secret saved.');
      await createKiteLoginUrl();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Kite credentials could not be saved.'); }
  }

  async function createKiteLoginUrl(apiKey = kiteApiKey) {
    setKiteTokenBusy(true);
    setKiteTokenNotice('');
    try {
      const response = await fetch('/api/token/login-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Kite login URL could not be created.');
      setKiteLoginUrl(payload.login_url as string);
      setKiteTokenNotice('Login URL ready. Confirm the redirect URL below matches the Kite Developer Console, then sign in to Zerodha.');
      addToast('Kite login URL is ready.');
    } catch (error) {
      setKiteTokenNotice(error instanceof Error ? error.message : 'Kite login URL could not be created.');
    } finally {
      setKiteTokenBusy(false);
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
      setNotice('Saved settings could not be loaded.');
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
        : 'The API or Zerodha could not be reached.');
    } finally {
      setRefreshing(false);
      setInitialPortfolioLoading(false);
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
      setNotice('Preferences saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function discoverOllamaModels() {
    setModelStatus('Checking Ollama connection…');
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

  async function generateTypedReport(type: AISectionTab, endpoint?: string) {
    const progressToast = addToast(`Generating ${reportTypeLabel(type).toLowerCase()}…`, 'progress', 'Generating a local AI report');
    setAiLoading(true);
    try {
      const response = await fetch(endpoint ?? `/api/ai/${type}-report`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Local AI report failed.');
      setLatestGeneratedReport(payload as AIReport);
      setReportExpanded(true);
      setSelectedSavedReport(null);
      await loadReportArchive(type);
      setNotice(`${reportTypeLabel(type)} generated and saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Local AI report failed.');
    } finally {
      dismissToast(progressToast);
      setAiLoading(false);
    }
  }

  async function loadReportArchive(type: ReportType) {
    setReportArchiveLoading(true);
    try {
      const response = await fetch(`/api/ai/reports?report_type=${type}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Saved reports could not be loaded.');
      setReportArchive((payload.items ?? []) as AIReportSummary[]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Saved reports could not be loaded.');
    } finally {
      setReportArchiveLoading(false);
    }
  }

  async function openSavedReport(reportId: string) {
    try {
      const response = await fetch(`/api/ai/reports/${encodeURIComponent(reportId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Saved report could not be opened.');
      setSelectedSavedReport(payload as AIReport);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Saved report could not be opened.');
    }
  }

  async function loadPortfolioNews() {
    try {
      const response = await fetch('/api/news');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Saved news could not be loaded.');
      setNewsItems((payload.items ?? []) as NewsItem[]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Saved news could not be loaded.');
    }
  }

  async function syncPortfolioNews() {
    setNewsLoading(true);
    try {
      const response = await fetch('/api/news/sync', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Yahoo Finance news refresh failed.');
      await loadPortfolioNews();
      setLatestGeneratedReport(null);
      localStorage.setItem('portfolio-news-last-check', String(Date.now()));
      sessionStorage.removeItem('portfolio-news-reminder-shown');
      setNotice(payload.message || 'Portfolio news refreshed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Portfolio news refresh failed.');
    } finally {
      setNewsLoading(false);
    }
  }

  useEffect(() => { void syncPortfolio(false); }, []);
  const tokenExchangeStarted = useRef(false);
  const kiteCredentialsLoaded = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenSetup = params.get('token_setup');
    if (tokenSetup) {
      const success = tokenSetup === 'success';
      addToast(success ? 'Zerodha access token saved.' : params.get('reason') || 'Zerodha token setup failed.', success ? 'default' : 'destructive');
      if (success) void loadTokenStatus();
      navigate({ pathname: location.pathname }, { replace: true });
      return;
    }
    const requestToken = params.get('request_token');
    const isKiteCallback = Boolean(requestToken || params.has('action') || params.has('type') || params.has('status'));
    if (!isKiteCallback) return;
    if (requestToken) {
      if (tokenExchangeStarted.current) return;
      tokenExchangeStarted.current = true;
      addToast('Zerodha redirected successfully. Saving the new access token…', 'progress', 'Exchanging the short-lived Kite request token');
      void (async () => {
        try {
          const body = new URLSearchParams({ request_token: requestToken });
          const response = await fetch('/api/token/exchange', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
          if (!response.ok) { const payload = await response.json(); throw new Error(payload.detail || 'Token exchange failed.'); }
          addToast('Zerodha access token saved. It will need renewal after it expires.');
          await loadTokenStatus();
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Zerodha token exchange failed.'); }
        finally { navigate({ pathname: location.pathname }, { replace: true }); }
      })();
    } else {
      const message = params.get('message') || params.get('error_description') || params.get('error');
      const loginError = message?.toLowerCase().includes('user is not enabled for the app')
        ? 'Kite did not enable the account signed into the browser for this app. Check that the app Client ID matches the account, sign out of any other Kite account, and retry. Personal app market-data limits are unrelated.'
        : message ? `Zerodha login did not complete: ${message}` : 'Zerodha login did not return a request token. Create a fresh login URL and try again.';
      setKiteTokenNotice(loginError);
      addToast(loginError, 'destructive');
      navigate({ pathname: location.pathname }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);
  useEffect(() => {
    if (preferences?.theme) document.documentElement.dataset.theme = preferences.theme;
  }, [preferences?.theme]);
  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale;
    localStorage.setItem('portfolio-font-scale', fontScale);
  }, [fontScale]);
  useEffect(() => {
    document.documentElement.dataset.privacyMode = privacyMode ? 'on' : 'off';
    localStorage.setItem('portfolio-privacy-mode', privacyMode ? 'on' : 'off');
  }, [privacyMode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCommandQuery(''); setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    if (!preferences) void loadPreferences();
  }, []);
  useEffect(() => {
    const key = 'portfolio-news-last-check';
    const remind = () => {
      const last = Number(localStorage.getItem(key) || 0);
      if (last && Date.now() - last >= 4 * 60 * 60 * 1000 && !sessionStorage.getItem('portfolio-news-reminder-shown')) {
        addToast('It has been 4 hours since your last news check. Review the latest market stories.');
        sessionStorage.setItem('portfolio-news-reminder-shown', '1');
      }
    };
    const timer = window.setInterval(remind, 60_000);
    remind();
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (activeSection === 'Settings' && !preferences) void loadPreferences();
    if (activeSection === 'Manual portfolio') void loadManualPortfolio();
    if (activeSection === 'Settings') {
      void loadTokenStatus();
      if (!kiteCredentialsLoaded.current) { kiteCredentialsLoaded.current = true; void loadKiteCredentials(); }
    }
    if (activeSection === 'News & reports') void loadPortfolioNews();
    if (activeSection === 'AI insights') {
      void loadReportArchive(aiTab);
      if (aiTab === 'news' || aiTab === 'ideas') void loadPortfolioNews();
    }
  }, [activeSection, aiTab]);
  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    void askForConfirmation({
      title: 'Leave without saving?',
      description: 'Unsaved edits in the manual positions grid will be discarded.',
      confirmLabel: 'Discard changes',
      destructive: true,
    }).then(confirmed => confirmed ? navigationBlocker.proceed() : navigationBlocker.reset());
  }, [navigationBlocker.state]);

  const openSection = (section: Section) => {
    if (window.matchMedia('(max-width: 760px)').matches) setNavOpen(false);
    if (activeSection === section) return;
    navigate(sectionPaths[section]);
  };

  const quickActions = [
    ...navigation.map(({ label, icon }) => ({ label: `Go to ${label}`, keywords: label, icon, run: () => openSection(label) })),
    { label: 'Sync Zerodha portfolio', keywords: 'refresh holdings account', icon: RefreshCw, run: () => void syncPortfolio() },
    { label: 'Open manual portfolio', keywords: 'new position investment', icon: Plus, run: () => openSection('Manual portfolio') },
    { label: 'Refresh market news', keywords: 'headlines news', icon: Newspaper, run: () => { openSection('AI insights'); setAiTab('news'); void syncPortfolioNews(); } },
    { label: 'Hide or show portfolio values', keywords: 'privacy screen hide money', icon: privacyMode ? Eye : EyeOff, run: () => setPrivacyMode(value => !value) },
  ];
  const filteredQuickActions = quickActions.filter(action =>
    `${action.label} ${action.keywords}`.toLowerCase().includes(commandQuery.trim().toLowerCase()),
  );

  function renderReportArchive(type: ReportType) {
    return <section className="panel report-archive">
      <div className="panel-heading"><div><h2>Saved runs</h2><p className="section-subtitle">{reportArchive.length} {reportArchive.length === 1 ? 'report' : 'reports'}</p></div><Button variant="ghost" aria-label="Refresh saved reports" disabled={reportArchiveLoading} onClick={() => void loadReportArchive(type)}><RefreshCw size={14} className={reportArchiveLoading ? 'spin' : ''}/></Button></div>
      {reportArchive.length === 0 ? <Empty title={reportArchiveLoading ? 'Loading saved reports' : 'No saved runs yet'} description={reportArchiveLoading ? 'Loading saved reports…' : 'Your generated reports will appear here.'} /> : <div className="report-archive-list">{reportArchive.map(report => <article className={`report-archive-item ${selectedSavedReport?.report_id === report.report_id ? 'selected' : ''}`} key={report.report_id}><div className="report-archive-copy"><strong>{reportTypeLabel(report.report_type)}</strong><span>{formatDate(report.saved_at)} <i aria-hidden="true">·</i> {report.model}</span><small>{String(report.metadata?.portfolio_row_count ?? 0)} holdings <i aria-hidden="true">·</i> {String(report.metadata?.news_article_count ?? 0)} stories</small></div><Button variant="outline" onClick={() => void openSavedReport(report.report_id)} aria-label={`Open ${reportTypeLabel(report.report_type)} from ${formatDate(report.saved_at)}`}>{selectedSavedReport?.report_id === report.report_id ? 'Opened' : 'Open'}</Button></article>)}</div>}
    </section>;
  }

  return (
    <div className={`app-frame ${navOpen ? 'nav-open' : 'nav-collapsed'}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#main-content" aria-label="Portfolio dashboard">
          <span className="brand-mark" aria-hidden="true"><ChartNoAxesCombined size={19} /></span>
          <span>puffin<span className="brand-light">folio</span></span>
        </a>
        <div className="workspace-label">PORTFOLIO</div>
        <nav className="nav-list" aria-label="Portfolio">
          {navigation.map(({ label, icon: Icon }) => (
            <Button key={label} variant="ghost" title={label} className={`nav-item ${activeSection === label ? 'active' : ''}`} aria-label={label} aria-current={activeSection === label ? 'page' : undefined} onClick={() => openSection(label)}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button variant="ghost" className="nav-item muted-nav" aria-label="Settings" onClick={() => openSection('Settings')}><Settings2 size={17} /><span>Settings</span></Button>
          <Button variant="ghost" className="nav-item muted-nav" aria-label="Help and guides" onClick={() => openSection('Glossary')}><CircleHelp size={17} /><span>Help & guides</span></Button>
        </div>
      </aside>

      <Dialog open={commandOpen} onOpenChange={setCommandOpen} className="command-dialog" labelledBy="command-dialog-title" describedBy="command-dialog-description">
        <h2 className="sr-only" id="command-dialog-title">Quick actions</h2><p className="sr-only" id="command-dialog-description">Search dashboard sections and common actions. Use Tab to move through the results.</p>
        <label className="command-search"><Search size={18} aria-hidden="true"/><Input autoFocus value={commandQuery} onChange={event=>setCommandQuery(event.target.value)} aria-label="Search actions" placeholder="Search pages and actions…"/><kbd>ESC</kbd></label>
        <div className="command-list" aria-label="Dashboard actions">{filteredQuickActions.length ? filteredQuickActions.map(({label,icon:Icon,run})=><Button key={label} variant="ghost" className="command-item" onClick={()=>{setCommandOpen(false);run();}}><Icon size={17} aria-hidden="true"/><span>{label}</span><ArrowUpRight size={14} className="command-item-arrow"/></Button>):<Empty title="No matching actions" description="Try a page name or action such as sync, news, or add holding."/>}</div>
        <div className="command-footer"><span><kbd>⌘</kbd><kbd>K</kbd> or <kbd>Ctrl</kbd><kbd>K</kbd> to open</span><span><kbd>Enter</kbd> to select</span></div>
      </Dialog>

      <main id="main-content" className="main-area" tabIndex={-1}>
        <header className="topbar">
          <Button variant="ghost" className="mobile-menu icon-button" aria-label={navOpen ? 'Collapse navigation' : 'Expand navigation'} aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}><Menu size={19} /></Button>
          <div className="breadcrumb"><span>Portfolio</span><span className="slash">/</span><strong>{activeSection}</strong></div>
          <div className="top-actions">
            {aiLoading && <div className="ai-progress" role="status" aria-live="polite" aria-atomic="true"><span className="ai-progress-label">Generating AI report</span><Progress label="Generating a local AI report" /></div>}
            <Button variant="outline" className="quick-search-trigger" onClick={()=>{setCommandQuery('');setCommandOpen(true);}} aria-keyshortcuts="Control+K Meta+K"><Search size={15}/><span>Search</span><kbd>⌘ K</kbd></Button>
            <Button variant="ghost" className="icon-button privacy-toggle" aria-label={privacyMode?'Show portfolio values':'Hide portfolio values'} aria-pressed={privacyMode} title={privacyMode?'Show portfolio values':'Hide portfolio values'} onClick={()=>setPrivacyMode(value=>!value)}>{privacyMode?<EyeOff size={17}/>:<Eye size={17}/>}</Button>
            <div className="accessibility-control" role="group" aria-label="Text size"><Type size={15} aria-hidden="true"/><Button variant="ghost" aria-label="Decrease text size" title="Decrease text size" disabled={fontScale==='normal'} onClick={()=>setFontScale('normal')}>A−</Button><Button variant="ghost" aria-label="Increase text size" title="Increase text size" aria-pressed={fontScale==='large'} disabled={fontScale==='large'} onClick={()=>setFontScale('large')}>A+</Button></div>
            <details className="top-theme-menu"><summary aria-label={`Theme: ${themes.find(theme=>theme.value===preferences?.theme)?.label ?? 'Latte'}`}><Palette size={16}/><span>{themes.find(theme=>theme.value===preferences?.theme)?.label ?? 'Theme'}</span></summary><div className="top-theme-options" role="group" aria-label="Choose color theme"><p>Appearance</p>{themes.map(theme=><Button key={theme.value} variant="ghost" aria-pressed={preferences?.theme===theme.value} onClick={()=>void saveThemePreference(theme.value)} disabled={!preferences||themeSaving}><span className={`theme-swatch theme-${theme.value}`} aria-hidden="true"/>{theme.label}<small>{theme.appearance}</small>{preferences?.theme===theme.value&&<Check size={14}/>}</Button>)}</div></details>
            <span className="local-pill" title="API connection status"><span className={`status-dot ${apiHealth}`} />{apiHealth === 'connected' ? 'CONNECTED' : apiHealth === 'checking' ? 'CONNECTING' : 'OFFLINE'}</span><Button variant="ghost" className="icon-button" aria-label="Open settings" onClick={() => openSection('Settings')}><Settings2 size={18} /></Button>
          </div>
        </header>

        <div className="content-wrap">
          {activeSection === 'Manual portfolio' && <section className="manual-editor-page">
            <div className="welcome-row"><div><p className="overline">SEPARATE FROM ZERODHA</p><h1>Manual <em>portfolio.</em></h1><p className="welcome-copy">Track investments held on other apps and include them in portfolio analysis.</p>{manualDirty && <p className="unsaved-indicator">Unsaved grid edits</p>}</div><div className="manual-actions"><Button variant="outline" disabled={manualBusy || manualDirty} onClick={() => { window.location.href = '/api/manual-portfolio/export'; }}><Download size={15}/> Export CSV</Button><Button variant="outline" onClick={addManualPosition}><Plus size={15}/> Add row</Button><Button onClick={() => void saveManualPortfolio()} disabled={manualBusy || invalidManualRow}><Check size={15}/>{manualBusy ? 'Saving…' : 'Save edits'}</Button></div></div>
            {invalidManualRow && <Alert variant="warning"><AlertTitle>Review the manual ledger</AlertTitle><AlertDescription>Every saved position needs a ticker and source, positive units, and a non-negative buy price.</AlertDescription></Alert>}
            <Card className="manual-import-card"><div className="manual-import-info"><strong>Import a CSV</strong><small>Required columns: ticker, units, market, buy_price, source, asset_type. current_price is optional.</small></div><Select value={csvMode} onChange={event => setCsvMode(event.target.value as 'append' | 'replace')} aria-label="CSV import mode"><option value="append">Append rows</option><option value="replace">Replace manual ledger</option></Select><label className="button button-outline csv-file-button"><Upload size={15}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={event => { const file = event.target.files?.[0]; if (file) void importManualCsv(file); event.currentTarget.value = ''; }} /></label></Card>
            {selectedManualIds.length > 0 && <Card className="bulk-toolbar"><strong>{selectedManualIds.length} selected</strong><Select value={bulkMarket} onChange={event => setBulkMarket(event.target.value)} aria-label="Bulk set market"><option value="">Set market…</option><option value="NSE">NSE</option><option value="BSE">BSE</option><option value="NYSE">NYSE</option></Select><Select value={bulkType} onChange={event => setBulkType(event.target.value)} aria-label="Bulk set type"><option value="">Set type…</option><option value="stock">Stock</option><option value="mf">Mutual fund</option><option value="etf">ETF</option><option value="bond">Bond</option><option value="other">Other</option></Select><Input aria-label="Bulk set source" list="manual-sources" placeholder="Set source (e.g. Groww)" value={bulkSource} onChange={event => setBulkSource(event.target.value)} /><Button variant="outline" onClick={() => void applyManualBulkEdit()} disabled={manualBusy}>Apply changes</Button><Button variant="outline" className="danger-button" onClick={() => void deleteSelectedManualRows()} disabled={manualBusy}><Trash2 size={14}/> Delete selected</Button></Card>}
            <section className="panel manual-grid-panel"><div className="panel-heading"><div><h2>Investment ledger</h2><p className="section-subtitle">Edit cells directly, then save changes. Price sync fills current prices for stock and ETF rows.</p></div><div className="manual-grid-toolbar"><label className="data-table-filter"><Search size={15} aria-hidden="true"/><Input type="search" aria-label="Filter manual positions" placeholder="Filter positions…" value={manualSearch} onChange={event => setManualSearch(event.target.value)}/></label><Button variant="outline" disabled={refreshing || manualDirty || !preferences?.yfinance_sync_enabled || !preferences?.yahoo_terms_confirmed} onClick={() => void syncMarketData()}><RefreshCw size={14}/>{refreshing ? 'Syncing…' : 'Sync Yahoo prices'}</Button></div></div>
              {preferences && (!preferences.yfinance_sync_enabled || !preferences.yahoo_terms_confirmed) && <p className="data-table-count">Enable Yahoo price sync and confirm its terms in Settings to refresh prices. Save current edits first.</p>}
              <datalist id="manual-sources">{[...new Set(manualPositions.map(item => item.source).filter(Boolean))].map(source => <option key={source} value={source}/>)}</datalist>
              <Table className="manual-grid"><TableHeader><TableRow><TableHead><Checkbox aria-label="Select all filtered positions" checked={filteredManualPositions.length > 0 && filteredManualPositions.every(row => selectedManualIds.includes(row.id))} onChange={event => setSelectedManualIds(ids => event.target.checked ? [...new Set([...ids, ...filteredManualPositions.map(row => row.id)])] : ids.filter(id => !filteredManualPositions.some(row => row.id === id)))}/></TableHead><TableHead scope="col">Ticker</TableHead><TableHead scope="col">Units</TableHead><TableHead scope="col">Market</TableHead><TableHead scope="col">Buy price</TableHead><TableHead scope="col">Current price</TableHead><TableHead scope="col">Source</TableHead><TableHead scope="col">Type</TableHead><TableHead scope="col">Market value</TableHead></TableRow></TableHeader><TableBody>
                {filteredManualPositions.map(row => <TableRow key={row.id}><TableCell><Checkbox aria-label={`Select ${row.ticker || 'new row'}`} checked={selectedManualIds.includes(row.id)} onChange={event => setSelectedManualIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))}/></TableCell>
                  <TableCell><Input aria-label="Ticker" value={row.ticker} onChange={event => syncManualCell(row.id, 'ticker', event.target.value)}/></TableCell>
                  <TableCell><Input aria-label="Units" type="number" min="0.000001" step="any" value={row.units} onChange={event => syncManualCell(row.id, 'units', Number(event.target.value))}/></TableCell>
                  <TableCell><Select aria-label="Market" value={row.market} onChange={event => syncManualCell(row.id, 'market', event.target.value as ManualPosition['market'])}><option value="NSE">NSE</option><option value="BSE">BSE</option><option value="NYSE">NYSE</option></Select></TableCell>
                  <TableCell><Input aria-label="Buy price" type="number" min="0" step="any" value={row.buy_price} onChange={event => syncManualCell(row.id, 'buy_price', Number(event.target.value))}/></TableCell>
                  <TableCell><span className="manual-price-cell">{row.current_price == null ? '—' : formatCurrency(row.current_price, row.market === 'NYSE' ? 'USD' : 'INR')}<small>{row.price_source ?? (row.market === 'NYSE' ? 'USD' : 'INR')} · {formatDate(row.price_as_of)}</small></span></TableCell>
                  <TableCell><Input aria-label="Source app or broker" list="manual-sources" placeholder="e.g. Groww" value={row.source} onChange={event => syncManualCell(row.id, 'source', event.target.value)}/></TableCell>
                  <TableCell><Select aria-label="Asset type" value={row.asset_type} onChange={event => syncManualCell(row.id, 'asset_type', event.target.value as ManualPosition['asset_type'])}><option value="stock">Stock</option><option value="mf">Mutual fund</option><option value="etf">ETF</option><option value="bond">Bond</option><option value="other">Other</option></Select></TableCell>
                  <TableCell>{formatCurrency(row.current_price == null ? null : row.current_price * row.units, row.market === 'NYSE' ? 'USD' : 'INR')}</TableCell>
                </TableRow>)}
                {filteredManualPositions.length === 0 && <TableRow><TableCell colSpan={9} className="manual-empty">{manualPositions.length === 0 ? 'No manual positions yet. Add a row or import a CSV.' : 'No positions match this search.'}</TableCell></TableRow>}
              </TableBody></Table>
              <p className="manual-grid-note">Ticker and source are required; units must be positive. Prices use the market currency. Yahoo Finance refresh is optional and gated in Settings. NYSE values are in USD; currency conversion is not applied to INR portfolio totals.</p>
            </section>
          </section>}
          {activeSection === 'Settings' && <section className="settings-page">
            <div className="welcome-row"><div><p className="overline">PREFERENCES</p><h1>Make it <em>yours.</em></h1><p className="welcome-copy">Adjust your dashboard and connection settings.</p></div><Button onClick={() => void saveSettings()} disabled={!preferences || settingsSaving || themeSaving}>{settingsSaving ? 'Saving…' : 'Save preferences'}</Button></div>
            <section className="panel settings-panel zerodha-setup-panel"><div className="panel-heading"><div><h2 className="heading-with-provider"><ZerodhaMark/>Zerodha connection</h2><p className="section-subtitle">Create and save the daily read-only Kite access token from this app.</p></div><Badge variant={tokenStatus?.configured ? 'success' : tokenStatus ? 'outline' : 'secondary'}>{tokenStatus?.configured ? 'Token saved' : tokenStatus ? 'Setup required' : 'Checking status'}</Badge></div>
              {kiteTokenNotice && <Alert variant={/failed|error|expired|not enable|did not|does not|could not|invalid/i.test(kiteTokenNotice) ? 'destructive' : 'default'}><AlertDescription>{kiteTokenNotice}</AlertDescription></Alert>}
              {tokenStatus?.configured && <p className="section-subtitle">A token is saved. Kite access tokens expire daily; replace it after the next login.</p>}
              <div className="zerodha-token-form"><div className="settings-fields zerodha-token-fields"><Field label="Kite API key"><Input required type="password" autoComplete="new-password" value={kiteApiKey} onChange={event => { setKiteApiKey(event.target.value); setKiteLoginUrl(''); }} onCopy={event=>event.preventDefault()} onCut={event=>event.preventDefault()} onContextMenu={event=>event.preventDefault()} placeholder="Kite API key" /></Field><Field label="Kite API secret"><Input required type="password" autoComplete="new-password" value={kiteApiSecret} onChange={event => setKiteApiSecret(event.target.value)} onCopy={event=>event.preventDefault()} onCut={event=>event.preventDefault()} onContextMenu={event=>event.preventDefault()} placeholder="Kite API secret" /></Field></div>
                <div className="zerodha-token-actions"><Button type="button" onClick={() => void persistKiteCredentials()} disabled={!kiteApiKey.trim() || !kiteApiSecret.trim() || kiteTokenBusy}><Check size={14}/>Save credentials</Button>{kiteLoginUrl && <Button type="button" asChild variant="outline"><a href={kiteLoginUrl} target="_blank" rel="noreferrer"><ZerodhaMark/>Continue to Zerodha <ExternalLink size={14}/></a></Button>}</div>
                {kiteLoginUrl && <a className="kite-login-url" href={kiteLoginUrl} target="_blank" rel="noreferrer">{kiteLoginUrl}</a>}
              </div>
              <div className="kite-redirect-row"><span><strong>Redirect URL registered with Kite</strong><code>{kiteRedirectUrl}</code></span><Button variant="ghost" aria-label="Copy redirect URL" onClick={() => void navigator.clipboard.writeText(kiteRedirectUrl).then(() => setNotice('Redirect URL copied.')).catch(() => setKiteTokenNotice('Clipboard access is unavailable. Copy the redirect URL shown above.'))}><Copy size={15}/> Copy</Button></div>
              <Collapsible title="Setup and troubleshooting instructions"><ol className="kite-setup-steps"><li>In the <a href="https://developers.kite.trade/" target="_blank" rel="noreferrer">Kite Developer Console</a>, set the app Redirect URL to the exact value shown above, including host, port, and trailing slash.</li><li>Save your API key and secret once. The login URL is then generated and displayed automatically.</li><li>Complete Zerodha sign-in and 2FA. On return, this page exchanges the request token and saves the new expiring access token automatically.</li></ol><Alert variant="warning"><AlertTitle>“The user is not enabled for the app”</AlertTitle><AlertDescription>Confirm that the Developer Console Client ID exactly matches the signed-in account. Sign out of other Zerodha accounts in the browser and retry with the linked account.</AlertDescription></Alert><p className="section-subtitle">API key and secret are saved and prefilled here. The access token expires and must be renewed by signing in again.</p></Collapsible>
            </section>
            {!preferences ? <div className="panel">Loading saved preferences…</div> : <>
              <section className="panel settings-panel"><div className="panel-heading"><div><h2>Portfolio display & sync</h2><p className="section-subtitle">Choose what appears and which sources refresh.</p></div></div>
                <label className="setting-row"><span><strong>Show manual positions</strong><small>Include the separate manual ledger and CSV imports in totals, holdings, and allocations.</small></span><Switch checked={preferences.show_manual_imports} onChange={e => updatePreference('show_manual_imports', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>Sync Zerodha on app open</strong><small>Fetch the latest read-only holdings and SIP snapshot when the dashboard opens.</small></span><Switch checked={preferences.auto_sync_zerodha} onChange={e => updatePreference('auto_sync_zerodha', e.target.checked)} /></label>
                <div className="theme-setting-row"><div><Palette size={17}/><span><strong>Theme</strong><small>Choose a light or dark appearance. It previews immediately and saves automatically.</small></span></div><div className="theme-control"><span className={`theme-swatch theme-${preferences.theme}`} aria-hidden="true">Aa</span><Select aria-label="Color theme" value={preferences.theme} disabled={themeSaving} onChange={event => void saveThemePreference(event.target.value as Preferences['theme'])}><optgroup label="Light themes">{themes.filter(theme => theme.mode === 'light').map(theme => <option key={theme.value} value={theme.value}>{theme.label} · {theme.appearance}</option>)}</optgroup><optgroup label="Dark themes">{themes.filter(theme => theme.mode === 'dark').map(theme => <option key={theme.value} value={theme.value}>{theme.label} · {theme.appearance}</option>)}</optgroup></Select></div></div>
              </section>
              <section className="panel settings-panel"><div className="panel-heading"><div><h2>Local AI with Ollama</h2><p className="section-subtitle">Requests stay on your configured local or private Ollama host.</p></div><Button variant="outline" onClick={() => void discoverOllamaModels()}><Server size={15}/> Find installed models</Button></div>
                <label className="setting-row"><span><strong>Enable AI portfolio review</strong><small>Generate evidence-linked summaries. Output is informational and not financial advice.</small></span><Switch checked={preferences.ollama_enabled} onChange={e => updatePreference('ollama_enabled', e.target.checked)} /></label>
                <div className="settings-fields"><label>Ollama endpoint<Input list="ollama-endpoints" value={preferences.ollama_endpoint} onChange={e => updatePreference('ollama_endpoint', e.target.value)} placeholder="http://127.0.0.1:11434"/><datalist id="ollama-endpoints">{ollamaEndpoints.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</datalist><small>{ollamaEndpoints.map(item => item.label + ': ' + item.value).join(' · ')}</small></label>
                  <label>Model<Input list="ollama-models" value={preferences.ollama_model} onChange={e => updatePreference('ollama_model', e.target.value)} placeholder="gemma4:e2b"/><datalist id="ollama-models">{[...modelPresets.map(item => item.name), ...ollamaModels.map(item => item.name)].map(name => <option key={name} value={name}/>)}</datalist><small>{modelPresets.map(item => `${item.name} — ${item.description}`).join(' · ')}</small></label></div>
                {modelStatus && <p className="inline-status" role="status">{modelStatus}{ollamaModels.length > 0 && ` · ${ollamaModels.length} model(s) installed`}</p>}
              </section>
              <section className="panel settings-panel"><div className="panel-heading"><div><h2>Yahoo Finance price sync</h2><p className="section-subtitle">Uses yfinance for daily equity closes. Yahoo access is subject to Yahoo’s terms.</p></div></div>
                <label className="setting-row"><span><strong>Allow manual Yahoo price refresh</strong><small>Updates prices for Zerodha equity holdings when you press Sync prices.</small></span><Switch checked={preferences.yfinance_sync_enabled} onChange={e => updatePreference('yfinance_sync_enabled', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>I have permission to retrieve Yahoo Finance data this way</strong><small>Applies to both price and news refresh. Automated collection may require prior permission. See <a href="https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html?ncid=mbr_idnedulnk00000001" target="_blank" rel="noreferrer">Yahoo terms</a>.</small></span><Switch checked={preferences.yahoo_terms_confirmed} onChange={e => updatePreference('yahoo_terms_confirmed', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>Refresh Yahoo prices on app open</strong><small>Runs only when price sync is enabled and the permission confirmation is saved.</small></span><Switch checked={preferences.auto_sync_yfinance} onChange={e => updatePreference('auto_sync_yfinance', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>Enable Yahoo portfolio headlines</strong><small>Fetches holding-specific headlines through yfinance. This is an unofficial Yahoo client; enable only if your use is permitted.</small></span><Switch checked={preferences.yahoo_news_enabled} onChange={e => updatePreference('yahoo_news_enabled', e.target.checked)} /></label>
                <label className="setting-row"><span><strong>Enable market RSS sources</strong><small>Manually refreshes curated Economic Times, Moneycontrol, Business Standard, and Mint feeds. Results are matched to held names and tickers, with broad Indian-market stories retained for context.</small></span><Switch checked={preferences.rss_news_enabled} onChange={e => updatePreference('rss_news_enabled', e.target.checked)} /></label>
                <div className="settings-fields news-settings-fields"><label>Article lookback window<Select value={String(preferences.news_lookback_hours)} onChange={e => updatePreference('news_lookback_hours', Number(e.target.value))}><option value="24">Last 24 hours</option><option value="48">Last 48 hours</option><option value="72">Last 3 days</option><option value="168">Last week</option><option value="720">Last month</option></Select><small>Headlines outside this window are omitted from the page and AI context.</small></label><label>Maximum articles<Input type="number" min="5" max="150" step="5" value={preferences.news_max_articles} onChange={e => updatePreference('news_max_articles', Math.max(5, Math.min(150, Number(e.target.value) || 5)))}/><small>Limits news shown and sent with each AI report.</small></label></div>
              </section>
            </>}
          </section>}

          {activeSection === 'Glossary' && <section><div className="welcome-row"><div><p className="overline">PLAIN LANGUAGE</p><h1>Portfolio <em>glossary.</em></h1><p className="welcome-copy">Short definitions for the numbers and terms in this dashboard.</p></div></div><label className="glossary-search"><Search size={17}/><Input aria-label="Search glossary" placeholder="Search terms" value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)}/></label><div className="glossary-grid">{filteredGlossary.map(item => <article className="panel glossary-card" key={item.term}><h2>{item.term}</h2><p>{item.definition}</p></article>)}</div></section>}

          {activeSection === 'Projections' && <section className="projections-page">
            <div className="welcome-row"><div><p className="overline">SCENARIO PLANNER</p><h1>Investment <em>projections.</em></h1><p className="welcome-copy">Explore illustrative future values across your INR holdings using editable annual-return assumptions.</p></div><label className="projection-horizon">Projection horizon<Select value={projectionYears} onChange={event => setProjectionYears(Number(event.target.value))}>{[1,5,10,15,20,25,30,40].map(year=><option key={year} value={year}>{year} years</option>)}</Select></label></div>
            <Alert variant="warning"><AlertTitle>Scenario estimates, not forecasts</AlertTitle><AlertDescription>Saved values and cost bases provide a snapshot, not enough history to estimate reliable future returns. Each asset class uses an editable nominal annual-return assumption. Values exclude new contributions except the NPS scheduled amount, and do not account for inflation, taxes, fees, volatility, or withdrawals.</AlertDescription></Alert>
            <div className="metric-grid projection-summary-grid"><Card className="metric-card"><div className="metric-label">Current visible INR value</div><div className="metric-value">{formatCurrency(projectionCurrentTotal)}</div><div className="metric-foot">Based on currently priced/saved values</div></Card><Card className="metric-card"><div className="metric-label">Illustrative value in {projectionYears} years</div><div className="metric-value">{formatCurrency(projectionFutureTotal)}</div><div className="metric-foot">Constant annual returns assumed</div></Card><Card className="metric-card"><div className="metric-label">Recorded cost basis</div><div className="metric-value">{formatCurrency(projectionCostTotal || null)}</div><div className="metric-foot">Only rows with quantity and average cost</div></Card></div>
            <section className="panel projection-assumptions"><div className="panel-heading"><div><h2>Return assumptions by investment type</h2><p className="section-subtitle">Change an assumption to immediately update the scenario</p></div></div><div className="projection-rate-grid">{['equity','mutual_fund','etf','bond','other','equity_position','derivative_position','nps'].map(type=><Field key={type} label={type.replaceAll('_',' ')}><Input aria-label={`${type} annual return percentage`} type="number" min="-100" max="100" step="0.5" value={projectionRates[type] ?? 0} onChange={event=>setProjectionRates(current=>({...current,[type]:Number(event.target.value)}))}/></Field>)}</div></section>
            <section className="panel projection-table-panel"><div className="panel-heading"><div><h2>Position scenarios</h2><p className="section-subtitle">Compounded annually from the latest saved value</p></div></div><div className="table-scroll"><table className="projection-table"><thead><tr><th>Investment</th><th>Type</th><th>Current value</th><th>Cost basis</th><th>Assumed return</th><th>Value in {projectionYears} years</th><th>Scenario change</th></tr></thead><tbody>{projectionRows.map(row=><tr key={row.id}><td>{row.instrument_name}</td><td>{row.asset_class.replaceAll('_',' ')}</td><td>{formatCurrency(row.current)}</td><td>{formatCurrency(row.cost)}</td><td>{row.annual.toLocaleString('en-IN',{style:'percent',maximumFractionDigits:1})}</td><td>{formatCurrency(row.projected)}</td><td>{formatCurrency(row.gain)}</td></tr>)}</tbody></table>{projectionRows.length===0&&<Empty title="No valued INR holdings to project" description="Sync or add investments to view scenario estimates."/>}</div></section>
          </section>}

          {activeSection === 'AI insights' && <section><div className="welcome-row"><div><p className="overline">OLLAMA AI</p><h1>AI <em>command centre.</em></h1><p className="welcome-copy">Choose a research lens, generate a sourced report, then revisit its saved run and metadata.</p></div></div>
            {!preferences?.ollama_enabled && <Alert><AlertTitle>Local AI is turned off</AlertTitle><AlertDescription>Choose an Ollama endpoint and model, then enable local reports in Settings.</AlertDescription><Button variant="outline" onClick={() => openSection('Settings')}>Configure Ollama</Button></Alert>}
            <Tabs value={aiTab} onValueChange={value=>setAiTab(value as AISectionTab)} className="ai-tabs"><TabsList aria-label="AI report types"><TabsTrigger value="portfolio">Portfolio</TabsTrigger><TabsTrigger value="news">News</TabsTrigger><TabsTrigger value="ideas">Stock & fund ideas</TabsTrigger><TabsTrigger value="risk">Risk</TabsTrigger><TabsTrigger value="diversification">Diversification</TabsTrigger><TabsTrigger value="funds">Fund & ETF</TabsTrigger></TabsList>
            <TabsContent value={aiTab} className="ai-tab-content"><section className="panel ai-report-workspace"><div className="panel-heading"><div><h2>{reportTypeLabel(aiTab)}</h2><p className="section-subtitle">{aiTab==='news' ? 'Refresh coverage and summarize portfolio-linked stories.' : aiTab==='ideas' ? 'Discover candidates and themes from broader market news.' : aiTab==='risk' ? 'Review concentration, data quality, liquidity caveats, and portfolio risks.' : aiTab==='diversification' ? 'Inspect overlap and diversification gaps from the current holdings snapshot.' : aiTab==='funds' ? 'Research fund and ETF categories, overlap, fees and due diligence gaps from available evidence.' : 'Review portfolio structure, holdings, data quality, and watchpoints.'}</p></div><div className="ai-report-actions"><span className="ai-refresh-slot">{(aiTab==='news'||aiTab==='ideas')?<Button variant="outline" disabled={newsLoading||!preferences||(!preferences.rss_news_enabled&&!(preferences.yahoo_news_enabled&&preferences.yahoo_terms_confirmed))} onClick={()=>void syncPortfolioNews()}><RefreshCw size={14} className={newsLoading?'spin':''}/>{newsLoading?'Refreshing…':'Refresh news'}</Button>:<span aria-hidden="true"/>}</span><Button variant="ai" disabled={aiLoading||!preferences?.ollama_enabled||(aiTab==='news'&&!newsItems.length)} onClick={()=>void generateTypedReport(aiTab,aiTab==='portfolio'?'/api/ai/recommendations':aiTab==='news'?'/api/ai/news-report':undefined)}><Bot size={14}/>{aiLoading?'Generating…':'Generate report'}</Button></div></div>
              {aiTab==='news'&&<div className="news-list ai-news-brief">{newsItems.slice(0,8).map(article=><article className="news-card" key={article.id}><div className="news-card-meta"><span>{article.related_tickers?.join(', ')||article.ticker}</span><span>{article.publisher||'News source'}</span><time>{formatDate(article.published_at)}</time></div><h3>{article.url?<a href={article.url} target="_blank" rel="noreferrer">{article.title} <ExternalLink size={13}/></a>:article.title}</h3></article>)}{newsItems.length===0&&<Empty title="No saved market stories" description="Refresh news to populate this report’s evidence base."/>}</div>}
              {(selectedSavedReport?.report_type===aiTab||latestGeneratedReport?.report_type===aiTab)&&<article className="saved-report-view"><div className="panel-heading"><div><p className="overline">{selectedSavedReport?.report_type===aiTab?'SAVED RUN':'LATEST RUN'}</p><h3>{reportTypeLabel(aiTab)} · {(selectedSavedReport?.report_type===aiTab?selectedSavedReport:latestGeneratedReport)?.model}</h3><p className="section-subtitle">Saved {formatDate((selectedSavedReport?.report_type===aiTab?selectedSavedReport:latestGeneratedReport)?.saved_at ?? null)} · {(selectedSavedReport?.report_type===aiTab?selectedSavedReport:latestGeneratedReport)?.scope}</p></div><div className="ai-report-actions"><Button variant="outline" onClick={()=>setReportExpanded(value=>!value)}>{reportExpanded?'Collapse':'Read report'}</Button><Button variant="outline" onClick={()=>exportMarkdownReport((selectedSavedReport?.report_type===aiTab?selectedSavedReport:latestGeneratedReport)!)}><Download size={14}/> Export</Button></div></div>{reportExpanded&&<Markdown source={(selectedSavedReport?.report_type===aiTab?selectedSavedReport:latestGeneratedReport)!.markdown}/>}</article>}
      <details className="saved-runs-disclosure"><summary>Saved runs <span>{reportArchive.length}</span></summary>{renderReportArchive(aiTab)}</details>
            </section><p className="ai-disclaimer">Reports include source counts, snapshot timing, and run-specific metadata. Treat AI output as research support, not personalized investment advice.</p></TabsContent></Tabs>
          </section>}

          {activeSection === 'News & reports' && <section className="news-page"><div className="welcome-row"><div><p className="overline">PORTFOLIO COVERAGE</p><h1>Market <em>news.</em></h1><p className="welcome-copy">Cached per-holding Yahoo Finance headlines and market RSS stories matched to holdings. AI research reports live in the AI insights command centre.</p></div><Button variant="outline" onClick={()=>openSection('AI insights')}>Open AI insights</Button></div>
            {preferences && !preferences.rss_news_enabled && !preferences.yahoo_news_enabled && <Alert><AlertTitle>No news sources enabled</AlertTitle><AlertDescription>Enable market RSS feeds or Yahoo portfolio headlines in Settings. Yahoo access also requires its permission confirmation.</AlertDescription><Button variant="outline" onClick={() => openSection('Settings')}>Configure news</Button></Alert>}
            {preferences?.yahoo_news_enabled && !preferences.yahoo_terms_confirmed && !preferences.rss_news_enabled && <Alert variant="warning"><AlertTitle>Yahoo access needs confirmation</AlertTitle><AlertDescription>Confirm Yahoo portfolio headline access in Settings, or enable market RSS feeds independently.</AlertDescription><Button variant="outline" onClick={() => openSection('Settings')}>Review news settings</Button></Alert>}
            <div className="news-list">{newsItems.length === 0 ? <Card className="news-empty"><Empty icon={<Newspaper size={23}/>} title={newsLoading ? 'Refreshing headlines' : 'No saved headlines in this window'} description={newsLoading ? 'Checking enabled sources for updates…' : 'Enable a news source in Settings, then refresh to load stories relevant to your holdings.'} action={!newsLoading && <Button variant="outline" onClick={() => openSection('Settings')}>Open news settings</Button>} /></Card> : newsItems.map(article => <article className="panel news-card" key={article.id}><div className="news-card-meta"><span>{article.related_tickers?.join(', ') || article.ticker}</span><span>{article.publisher || 'News source'}</span><time>{formatDate(article.published_at)}</time></div><h2>{article.url ? <a href={article.url} target="_blank" rel="noreferrer">{article.title} <ExternalLink size={13}/></a> : article.title}</h2>{article.summary && <p>{article.summary}</p>}<small>{article.instrument_name} · {article.asset_type} · fetched {formatDate(article.fetched_at)}</small></article>)}</div>
          </section>}

          {activeSection === 'Activity' && <section><div className="welcome-row"><div><p className="overline">DATA FRESHNESS</p><h1>Recent <em>activity.</em></h1><p className="welcome-copy">Review connections, refresh attempts, and the age of your saved snapshots.</p></div><Button variant="outline" onClick={() => void syncPortfolio()} disabled={refreshing}><ZerodhaMark/><RefreshCw size={15}/> Sync Zerodha</Button></div><div className="panel activity-list">{sources.length === 0 ? <p>No source activity has been recorded yet.</p> : sources.map(source => <article className="activity-item" key={source.source}><Badge variant={statusBadgeVariant(source.state)} className="status-pill">{source.state.replace('_', ' ')}</Badge><div><h2>{source.source}</h2><p>{source.status_message || source.last_error || 'No status detail available.'}</p><small>Last success: {formatDate(source.last_successful_refresh)} · Last attempt: {formatDate(source.last_attempted_refresh)} · Data date: {formatDate(source.as_of)}</small></div></article>)}</div></section>}

          {(activeSection === 'Overview' || activeSection === 'Holdings') && <>
          <section className="welcome-row">
            <div><p className="overline">{today}</p><h1>Portfolio <em>overview.</em></h1><p className="welcome-copy">Holdings, prices, and source dates from Zerodha and your manual ledger.</p></div>
            <div className="welcome-actions">
              <Button variant="outline" onClick={() => openSection('Manual portfolio')}><Plus size={16} /> Add holdings</Button>
              <Button onClick={() => void syncPortfolio()} disabled={refreshing}><ZerodhaMark/><RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Sync Zerodha</Button>
            </div>
          </section>

          {apiHealth === 'unavailable' && <Alert variant="destructive"><AlertTitle>Dashboard service is offline</AlertTitle><AlertDescription>Start the backend with <code>make api</code>, then refresh this page. Reconnect the service, then refresh this page.</AlertDescription></Alert>}
          {tokenStatus && !tokenStatus.configured && <Alert><AlertTitle>Connect Zerodha</AlertTitle><AlertDescription>{tokenStatus.message} Save a fresh Kite access token in Settings before syncing your account.</AlertDescription><Button variant="outline" onClick={() => openSection('Settings')}>Open Zerodha setup</Button></Alert>}

          <section aria-labelledby="summary-heading">
            <div className="section-title-row"><div><h2 id="summary-heading">Portfolio overview</h2><p className="section-subtitle">Your investment snapshot at a glance</p></div><Button variant="ghost" onClick={() => void syncPortfolio()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Syncing…' : 'Refresh'}</Button></div>
            <div className="metric-grid">
              <Card className="metric-card" role="group" aria-label="Total portfolio value"><div className="metric-label">Total portfolio value <span className="metric-icon mint"><WalletCards size={17} /></span></div><div className="metric-value">{initialPortfolioLoading ? <Skeleton className="metric-value-skeleton"/> : formatCurrency(summary?.total_value ?? null)}</div><div className="metric-foot">{summary?.as_of ? new Date(summary.as_of).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'INR'} <span className="foot-separator">·</span> {summary?.status === 'empty' ? 'Awaiting data' : 'Updated value'}</div></Card>
              <Card className="metric-card" role="group" aria-label="Invested amount"><div className="metric-label">Invested amount <span className="metric-icon peach"><Landmark size={17} /></span></div><div className="metric-value">{initialPortfolioLoading ? <Skeleton className="metric-value-skeleton"/> : formatCurrency(summary?.invested ?? null)}</div><div className="metric-foot">{summary?.invested != null ? 'Based on imported transactions' : 'No cost basis yet'}</div></Card>
              <Card className="metric-card" role="group" aria-label="Overall returns"><div className="metric-label">Overall returns <span className="metric-icon blue"><ArrowUpRight size={17} /></span></div><div className="metric-value">{initialPortfolioLoading ? <Skeleton className="metric-value-skeleton"/> : formatCurrency(summary?.pnl ?? null)}</div><div className="metric-foot">{summary?.pnl != null ? 'Portfolio P&L' : 'P&amp;L appears when cost data is available'}</div></Card>
            </div>
            {summary?.warnings.length ? <Alert variant="warning" className="summary-warnings"><AlertTitle>Data notes</AlertTitle><AlertDescription><ul>{summary.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></AlertDescription></Alert> : null}
          </section>

          <div className="dashboard-grid">
            <section className="panel allocation-panel" aria-labelledby="allocation-title">
              <div className="panel-heading"><div><h2 id="allocation-title">Asset allocation</h2><p className="section-subtitle">Where your portfolio is invested</p></div><Tooltip content="Allocation uses priced INR holdings from the latest saved snapshots. Holdings in other currencies are excluded until conversion is configured."><span className="allocation-help-icon"><CircleHelp size={16} aria-hidden="true" /></span></Tooltip></div>
              {initialPortfolioLoading ? <div className="allocation-skeleton" role="status" aria-label="Loading portfolio allocation"><Skeleton/><Skeleton/><Skeleton/></div> : allocations.length === 0 ? (
                <div className="allocation-empty"><div className="donut" aria-hidden="true"><div className="donut-inner"><ChartNoAxesCombined size={23} /></div></div><Empty title={holdings.length ? 'No priced INR holdings yet' : 'No holdings yet'} description={holdings.length ? 'Allocation uses priced INR positions. Other currencies stay separate until conversion is configured.' : 'Sync Zerodha or add a position to get started.'} action={!holdings.length && <Button variant="outline" onClick={() => openSection('Manual portfolio')}>Add manual holdings</Button>} /></div>
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
                        <small>{formatPercent(bucket.percentage)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="legend-row"><span><i className="legend-dot equity" />Equity</span><span><i className="legend-dot funds" />Mutual funds</span><span><i className="legend-dot other" />Other</span></div>
            </section>
            <section className="panel insight-panel" aria-labelledby="insight-heading">
              <div className="insight-top"><span className="ai-mark"><Bot size={18} /></span><span className="ai-local">AI INSIGHT</span></div>
              <h2 id="insight-heading">A little perspective.</h2>
              <p>Ask your local Gemma model to explain your allocation, spot concentration, or summarize recent changes.</p>
              <div className="model-status"><span className={`model-dot ${preferences?.ollama_enabled ? 'connected' : ''}`} /><span>{preferences?.ollama_enabled ? preferences.ollama_model : 'Model not enabled'}</span><Button variant="ghost" className="text-button" onClick={() => openSection('Settings')}>Configure <ArrowUpRight size={13} /></Button></div>
              <Button variant="ai" onClick={() => openSection('AI insights')}><Bot size={16} /> Explore insights</Button>
              <span className="ai-disclaimer">Informational only. Never a trade instruction.</span>
            </section>
          </div>

          {activeSection === 'Overview' && <section className="panel source-split-panel" aria-labelledby="source-split-title"><div className="panel-heading"><div><h2 id="source-split-title">Portfolio by source</h2><p className="section-subtitle">Market value grouped by the account or app where you hold it</p></div><Button variant="ghost" onClick={() => openSection('Manual portfolio')}>Manage manual rows <ArrowUpRight size={14}/></Button></div>
            {Object.keys(sourceSplit).length === 0 ? <p className="source-split-empty">Add manual positions or sync Zerodha to see source coverage here.</p> : <div className="source-split-list">{Object.entries(sourceSplit).sort((a, b) => b[1].value - a[1].value).map(([key, item]) => { const [name] = key.split('|'); const percentage = currencyTotals[item.currency] ? item.value / currencyTotals[item.currency] * 100 : 0; return <div className="source-split-row" key={key}><span className="source-split-name"><i className="legend-dot equity"/><strong>{name}</strong><small>{item.count} holding{item.count === 1 ? '' : 's'}{item.unpriced ? ` · ${item.unpriced} unpriced` : ''}</small></span><span className="source-split-value">{formatCurrency(item.value, item.currency)}<small>{formatPercent(percentage)} of priced {item.currency} holdings</small></span></div>; })}</div>}
          </section>}

          <section className="panel holdings-panel" aria-labelledby="holdings-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="holdings-heading">Your holdings</h2><p className="section-subtitle">{activeSection === 'Overview' ? 'A quick view of your portfolio' : 'Search, sort, and page through your holdings'}</p></div><Button variant="ghost" onClick={() => openSection('Holdings')}>View all <ArrowUpRight size={14} /></Button></div>
            {initialPortfolioLoading ? <div className="portfolio-table-loading" role="status" aria-label="Loading portfolio holdings">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="table-row-skeleton" />)}</div> : <DataTable data={displayHoldings} columns={holdingColumns} getRowId={row => row.id} searchValue={row => `${row.instrument_name} ${row.symbol ?? ''} ${row.asset_class} ${row.source}`} searchPlaceholder="Find a holding…" caption="Portfolio holdings" emptyState={holdings.length === 0 ? <Empty icon={<WalletCards size={20}/>} title="No holdings yet" description="Sync Zerodha or add a position to load your portfolio." action={<Button variant="outline" onClick={() => openSection('Manual portfolio')}>Add manual positions</Button>} /> : 'No holdings match this search.'}/>}
            <div className="table-note"><span>INR and USD follow each holding’s market currency</span><span>Data date: {formatDate(summary?.as_of ?? null)}</span></div>
          </section>

          <section className="panel holdings-panel" aria-labelledby="sips-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="sips-heading" className="heading-with-provider"><ZerodhaMark/>Mutual fund SIPs</h2><p className="section-subtitle">Read-only schedules returned by Zerodha Coin</p></div></div>
            {initialPortfolioLoading ? <div className="portfolio-table-loading" role="status" aria-label="Loading Zerodha SIP schedules">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="table-row-skeleton" />)}</div> : sips.length === 0 ? <Empty icon={<RefreshCw size={18}/>} title="No Zerodha SIPs in the latest snapshot" description="Sync your Zerodha account to check for current mutual-fund SIP schedules." action={<Button variant="outline" onClick={() => void syncPortfolio()} disabled={refreshing}><RefreshCw size={14}/> Sync Zerodha</Button>} /> : <DataTable data={sips} columns={sipColumns} getRowId={row => row.id} searchValue={row => `${row.scheme_name} ${row.status ?? ''} ${row.source}`} searchPlaceholder="Find a Zerodha SIP…" caption="Zerodha mutual fund SIP schedules"/>}
          </section>

          <section className="panel holdings-panel manual-sips-panel" aria-labelledby="manual-sips-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="manual-sips-heading">Manual SIP schedules</h2><p className="section-subtitle">Local reminders and planned entries for funds held outside Zerodha</p></div></div>
            <p className="manual-sip-disclaimer">Entries created automatically are marked scheduled/unconfirmed. They do not prove that a payment was made and never change a Zerodha SIP.</p>
            <form className="manual-sip-form" onSubmit={event => void createManualSip(event)}>
              <Field label="Fund or scheme"><Input required maxLength={160} value={sipSchemeName} onChange={event => setSipSchemeName(event.target.value)} placeholder="Fund name" /></Field>
              <Field label="Source"><Input required maxLength={120} value={sipSource} onChange={event => setSipSource(event.target.value)} placeholder="Broker or app" /></Field>
              <Field label="Amount (₹)"><Input required type="number" min="0.01" step="0.01" value={sipAmount} onChange={event => setSipAmount(event.target.value)} /></Field>
              <Field label="Frequency"><Select value={sipFrequency} onChange={event => { const value = event.target.value as 'monthly' | 'weekly'; setSipFrequency(value); setSipTriggerDay(value === 'monthly' ? '1' : '0'); }}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></Select></Field>
              <Field label={sipFrequency === 'monthly' ? 'Trigger day' : 'Trigger weekday'}><Select value={sipTriggerDay} onChange={event => setSipTriggerDay(event.target.value)}>{sipFrequency === 'monthly' ? Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of month</option>) : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></Field>
              <Field label="Start date"><Input required type="date" value={sipStartDate} onChange={event => setSipStartDate(event.target.value)} /></Field>
              <Field label="End date (optional)"><Input type="date" min={sipStartDate} value={sipEndDate} onChange={event => setSipEndDate(event.target.value)} /></Field>
              <div className="manual-sip-form-actions"><Button type="submit" disabled={manualSipBusy || !sipSchemeName.trim() || !sipSource.trim() || !sipAmount}> <Plus size={14} />{manualSipBusy ? 'Saving…' : sipEditingId ? 'Save changes' : 'Add schedule'}</Button>{sipEditingId && <Button type="button" variant="ghost" onClick={cancelManualSipEdit}>Cancel</Button>}</div>
            </form>
            {initialPortfolioLoading ? <div className="portfolio-table-loading" aria-label="Loading manual SIP schedules">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="schedule-skeleton" />)}</div> : manualSips.length === 0 ? <Empty title="No manual SIP schedules" description="Add a schedule above. The app records one eligible installment per trigger interval." /> : <div className="manual-sip-list">{manualSips.map(schedule => <article className="manual-sip-card" key={schedule.id}>
              <div className="manual-sip-card-head"><div><h3>{schedule.scheme_name}</h3><p>{schedule.source} · {formatCurrency(schedule.amount)} · {schedule.frequency === 'monthly' ? `day ${schedule.trigger_day} each month` : `every ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][schedule.trigger_day]}`} · {schedule.timezone}</p></div><div className="manual-sip-card-controls"><Button variant="ghost" onClick={() => editManualSip(schedule)}>Edit</Button><label className="manual-sip-toggle"><Switch checked={schedule.enabled} disabled={manualSipBusy} onChange={() => void toggleManualSip(schedule)} /><span>{schedule.enabled ? 'Enabled' : 'Paused'}</span></label></div></div>
              <div className="manual-sip-dates">Next trigger {formatDate(schedule.next_trigger_date)} · Starts {formatDate(schedule.start_date)}{schedule.end_date ? ` · Ends ${formatDate(schedule.end_date)}` : ' · No end date'}</div>
              {schedule.entries.length === 0 ? <p className="manual-sip-no-entries">No eligible trigger interval has been recorded yet.</p> : <Collapsible title={`Installment history · ${schedule.entries.length} ${schedule.entries.length === 1 ? 'entry' : 'entries'}`}><DataTable data={schedule.entries} getRowId={entry => entry.id} searchValue={entry => `${entry.effective_date} ${entry.interval_key} ${entry.status}`} searchPlaceholder="Filter installments…" caption={`${schedule.scheme_name} manual SIP entries`} columns={[
                { id: 'date', header: 'Trigger interval', sortValue: entry => entry.effective_date, cell: entry => <span className="table-detail-cell">{formatDate(entry.effective_date)}<small>{entry.interval_key}</small></span> },
                { id: 'amount', header: 'Amount', sortValue: entry => entry.amount, cell: entry => formatCurrency(entry.amount) },
                { id: 'status', header: 'Status', sortValue: entry => entry.status, cell: entry => <Badge variant={entry.status === 'confirmed' ? 'success' : entry.status === 'skipped' ? 'secondary' : 'outline'}>{entry.status}</Badge> },
                { id: 'action', header: 'Update', cell: entry => entry.status === 'scheduled/unconfirmed' ? <div className="manual-sip-entry-actions"><Button variant="outline" onClick={() => void updateManualSipEntry(entry, 'confirmed')}>Confirm paid</Button><Button variant="ghost" onClick={() => void updateManualSipEntry(entry, 'skipped')}>Skip</Button></div> : <Button variant="ghost" onClick={() => void updateManualSipEntry(entry, 'scheduled/unconfirmed')}>Reopen</Button> },
              ]}/></Collapsible>}
            </article>)}</div>}
          </section>

          <section className="panel holdings-panel manual-sips-panel" aria-labelledby="nps-heading">
            <div className="panel-heading holdings-heading"><div><h2 id="nps-heading">NPS · Tier-I</h2><p className="section-subtitle">Track your account valuation and monthly contribution plan</p></div></div>
            <p className="manual-sip-disclaimer">Your NPS Tier-I account value counts toward portfolio totals and AI analysis. Contribution reminders are a schedule only; this app does not make payments or add contributions to valuation automatically.</p>
            <form className="manual-sip-form" onSubmit={event => void saveNps(event)}>
              <Field label="Current valuation (₹)"><Input required type="number" min="0" step="0.01" value={npsValuation} onChange={event => setNpsValuation(event.target.value)} /></Field>
              <Field label="Monthly contribution (₹)"><Input required type="number" min="0.01" step="0.01" value={npsContribution} onChange={event => setNpsContribution(event.target.value)} /></Field>
              <Field label="Contribution day"><Select value={npsDay} onChange={event => setNpsDay(event.target.value)}>{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}{day===1?'st':day===2?'nd':day===3?'rd':'th'} of month</option>)}</Select></Field>
              <Field label="Valuation as of"><Input required type="date" value={npsAsOf} onChange={event => setNpsAsOf(event.target.value)} /></Field>
              <Field label="Estimated annual return (%)" description="Illustrative assumption. Change it to model a different market return."><Input required type="number" min="0" max="30" step="0.1" value={npsReturn} onChange={event => setNpsReturn(event.target.value)} /></Field>
              <div className="manual-sip-form-actions"><Button type="submit" disabled={npsBusy || !npsValuation || !npsContribution}><Landmark size={14}/>{npsBusy ? 'Saving…' : 'Save NPS details'}</Button></div>
            </form>
            <div className="manual-sip-dates">{npsAccount ? <>Current Tier-I value <strong>{formatCurrency(npsAccount.valuation)}</strong> · {formatCurrency(npsAccount.contribution_amount)} scheduled for day {npsAccount.contribution_day} monthly · Valued {formatDate(npsAccount.valuation_as_of)}</> : 'Enter the valuation and contribution details from your NPS account.'}</div>
            {npsAccount && <div className="nps-projection-grid">{[10,20,30,40].map(years => { const months=years*12; const monthlyRate=npsAccount.annual_return_percent/100/12; const base=npsAccount.valuation*Math.pow(1+monthlyRate,months); const contributions=monthlyRate===0?npsAccount.contribution_amount*months:npsAccount.contribution_amount*((Math.pow(1+monthlyRate,months)-1)/monthlyRate)*(1+monthlyRate); const total=base+contributions; const invested=npsAccount.valuation+npsAccount.contribution_amount*months; return <Card className="nps-projection-card" key={years}><div className="metric-label">In {years} years</div><div className="metric-value">{formatCurrency(total)}</div><div className="metric-foot">Projected growth {formatCurrency(total-invested)}</div><small>Contributions + estimated returns</small></Card>; })}<p className="nps-projection-note">Illustration only: monthly contributions are assumed to continue at the configured amount and compound monthly at {npsAccount.annual_return_percent}% annually. Market returns vary; taxes, fees, inflation, contribution interruptions, and NPS withdrawal rules are not modeled. This is not a withdrawal eligibility estimate.</p></div>}
          </section>

          {sources.length > 0 && (
            <section className="panel holdings-panel" aria-labelledby="source-heading">
              <div className="panel-heading holdings-heading"><div><h2 id="source-heading">Source status</h2><p className="section-subtitle">Where each value is coming from</p></div></div>
              <div className="source-list">
                {sources.map((source) => (
                  <div key={source.source} className="source-item">
                    <Badge variant={statusBadgeVariant(source.state)} className="status-pill">{source.state.replace('_', ' ')}</Badge>
                    <strong>{source.source}</strong>
                    <small>{source.status_message ?? 'No status detail available'}</small>
                    <em>{formatDate(source.as_of)} · {source.source_type}</em>
                  </div>
                ))}
              </div>
            </section>
          )}
          {activeSection === 'Holdings' && <section className="panel price-sync-panel"><div><h2>Market prices</h2><p className="section-subtitle">Yahoo Finance data via yfinance · refreshes supported equity symbols and manual stock/ETF positions.</p>{preferences && (!preferences.yfinance_sync_enabled || !preferences.yahoo_terms_confirmed) && <p className="section-subtitle">Enable Yahoo price sync and confirm its terms in Settings to use this action.</p>}</div><Button variant="outline" disabled={refreshing || !preferences?.yfinance_sync_enabled || !preferences?.yahoo_terms_confirmed} onClick={() => void syncMarketData()}><RefreshCw size={15}/>{refreshing ? 'Refreshing…' : 'Sync prices'}</Button></section>}
          </>}

          <footer className="page-footer"><span>Portfolio dashboard</span></footer>
        </div>
      </main>
      <AlertDialog open={confirmation !== null} title={confirmation?.title ?? ''} description={confirmation?.description ?? ''} confirmLabel={confirmation?.confirmLabel ?? 'Confirm'} destructive={confirmation?.destructive} onOpenChange={open => { if (!open) resolveConfirmation(false); }} onConfirm={() => resolveConfirmation(true)} />
      <ToastViewport items={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find the React root element.');
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true },
      ...navigation.filter(({ label }) => label !== 'Overview').map(({ label }) => ({
        path: sectionPaths[label].slice(1),
      })),
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(rootElement).render(<RouterProvider router={router} />);
