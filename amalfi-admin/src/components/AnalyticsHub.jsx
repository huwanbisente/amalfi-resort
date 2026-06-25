import React, { useMemo, useState } from 'react';
import {
    format, parseISO, subWeeks, addDays, startOfWeek,
    differenceInCalendarDays, isSameDay, isWithinInterval,
    startOfDay, subDays, isAfter, isBefore, getDay, startOfMonth, endOfMonth
} from 'date-fns';
import { exportToCsv } from '../utils/exportToCsv';
import { FinancialReportsWorkspace } from './FinancialReportsWorkspace';
import { Calendar, Filter, X } from 'lucide-react';
import {
    Button,
    Card as UiCard,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CommandDeck,
    DeckIntro,
    DeckMetric,
    DeckMetricRail,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/shared';
import { cn } from '@/lib/utils';
// Theme
const T = {
    green:  '#486358',
    gold:   '#c49a00',
    red:    '#f44336',
    teal:   '#2e8b74',
    muted:  'rgba(28,37,32,0.05)',
    text:   '#1c2520',
    sub:    'rgba(28,37,32,0.5)',
    white:  '#ffffff',
    glass:  'rgba(255, 255, 255, 0.7)',
};

const ROOM_COLORS = ['#486358', '#2e8b74', '#2a6090', '#c49a00', '#f44336', '#6b4fa0'];
const COLOR_TEXT_CLASS = {
    [T.green]: 'text-emerald-900',
    [T.gold]: 'text-amber-700',
    [T.red]: 'text-red-600',
    [T.teal]: 'text-teal-700',
    '#faad14': 'text-amber-600',
    '#52c41a': 'text-emerald-600',
    '#ff4d4f': 'text-red-600',
    '#5b6cfa': 'text-indigo-600',
};
const COLOR_ACCENT_CLASS = {
    [T.green]: 'accent-emerald-900',
    [T.gold]: 'accent-amber-600',
    [T.red]: 'accent-red-500',
    [T.teal]: 'accent-teal-600',
    '#5b6cfa': 'accent-indigo-500',
};
const colorTextClass = (color) => COLOR_TEXT_CLASS[color] || 'text-slate-900';
const colorAccentClass = (color) => COLOR_ACCENT_CLASS[color] || 'accent-emerald-900';
const donutSizeClass = (size) => {
    if (size <= 120) return 'size-[120px]';
    if (size <= 150) return 'size-[150px]';
    return 'size-40';
};
const fmtCur = (v) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(v);
const fmtNum = (v) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(Number(v || 0));
const MONTH_OPTIONS = [
    ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
    ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
    ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
];

function getBookingDateParts(booking = {}) {
    const dateStr = booking.check_in || booking.created_at || booking.recorded_at || '';
    const match = String(dateStr).match(/^(\d{4})-(\d{2})/);
    return match ? { year: match[1], month: match[2] } : null;
}

function normalizeChatField(log = {}, names = []) {
    for (const name of names) {
        if (log[name] !== undefined && log[name] !== null && String(log[name]).trim()) {
            return String(log[name]).trim();
        }
    }
    return '';
}
// Pulse Stat Card
function PulseStat({ label, value, trend, icon, color = T.green, sub, highlight = false }) {
    const isPos = trend >= 0;
    return (
        <UiCard className={cn('border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px] p-4', highlight && 'bg-[#e7f5ef]')}>
            <div className="mb-2 flex items-center justify-between">
                <span className="text-lg font-black text-slate-900">{icon}</span>
                {trend !== undefined && (
                    <div className={cn(
                        'rounded-full px-2 py-1 text-[0.62rem] font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]',
                        isPos ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    )}>
                        {isPos ? '+' : '-'}{Math.abs(trend)}%
                    </div>
                )}
            </div>
            <div className={cn('text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500', highlight && colorTextClass(color))}>{label}</div>
            <div className="mt-1 text-[1.35rem] font-black text-slate-950">{value}</div>
            {sub && <div className="mt-1 text-[0.68rem] font-semibold text-slate-500">{sub}</div>}
        </UiCard>
    );
}

function AnalyticsCard({ title, subtitle, children, actions, className }) {
    return (
        <UiCard className={cn('border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[18px]', className)}>
            {(title || subtitle || actions) && (
                <CardHeader className="flex flex-col gap-2 p-4 pb-0 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        {title && <CardTitle className="text-[0.95rem] font-extrabold text-slate-950">{title}</CardTitle>}
                        {subtitle && <CardDescription className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</CardDescription>}
                    </div>
                    {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
                </CardHeader>
            )}
            <CardContent className="p-4">{children}</CardContent>
        </UiCard>
    );
}
// Donut Chart
function DonutChart({ data, size = 160 }) {
    const total = data.reduce((s, i) => s + i.value, 0) || 1;
    const radius = 60;
    const circ = 2 * Math.PI * radius;
    let offset = 0;

    return (
        <div className={cn('relative mx-auto', donutSizeClass(size))}>
            <svg viewBox="0 0 160 160" className="-rotate-90">
                {data.map((item, i) => {
                    const strokeDash = (item.value / total) * circ;
                    const r = (
                        <circle key={i} cx="80" cy="80" r={radius} fill="transparent"
                            stroke={item.color} strokeWidth="20"
                            strokeDasharray={`${strokeDash} ${circ - strokeDash}`}
                            strokeDashoffset={-offset}
                            className="transition-all duration-700" />
                    );
                    offset += strokeDash;
                    return r;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-[0.68rem] font-extrabold uppercase text-slate-500">Total</div>
                <div className="text-[1.35rem] font-black text-slate-950">{total}</div>
            </div>
        </div>
    );
}
// Area Chart (Evolution)
function EvolutionChart({ data, color = T.green, valuePrefix = 'PHP ' }) {
    const [hovered, setHovered] = useState(null);
    const W = 800, H = 200;
    const PAD = { l: 60, r: 20, t: 20, b: 40 };
    const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

    const max = Math.max(...data.map(d => d.value), 1) * 1.1;
    const pts = data.map((d, i) => ({
        x: PAD.l + (i / Math.max(data.length - 1, 1)) * iW,
        y: PAD.t + iH - (d.value / max) * iH,
        ...d,
    }));

    const getPath = (points) => {
        if (points.length < 2) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const cp = (points[i-1].x + points[i].x) / 2;
            d += ` C ${cp} ${points[i-1].y}, ${cp} ${points[i].y}, ${points[i].x} ${points[i].y}`;
        }
        return d;
    };
    const linePath = getPath(pts);
    const areaPath = pts.length > 1 ? `${linePath} L ${pts[pts.length-1].x} ${PAD.t + iH} L ${pts[0].x} ${PAD.t + iH} Z` : '';

    return (
        <div className="relative h-[220px] w-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
                <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
                {[0, 0.25, 0.5, 0.75, 1].map(f => (
                    <g key={f}>
                        <line x1={PAD.l} y1={PAD.t + iH - f*iH} x2={W-PAD.r} y2={PAD.t + iH - f*iH} stroke={T.muted} strokeWidth="1" />
                        <text x={PAD.l - 10} y={PAD.t + iH - f*iH + 4} textAnchor="end" fontSize="11" fill={T.sub} fontWeight="700">{valuePrefix}{( (f*max) / 1000).toFixed(1)}k</text>
                    </g>
                ))}
                <path d={areaPath} fill="url(#chartGrad)" />
                <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />
                {pts.map((p, i) => (
                    <g key={i}>
                        {i % Math.ceil(pts.length/6) === 0 && <text x={p.x} y={H-10} textAnchor="middle" fontSize="11" fill={T.sub} fontWeight="700">{p.label}</text>}
                        <circle cx={p.x} cy={p.y} r={hovered === i ? 6 : 4} fill={color} stroke="white" strokeWidth="2" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} className="cursor-pointer transition-all duration-100" />
                        {hovered === i && <g><rect x={p.x-44} y={p.y-46} width="88" height="32" rx="8" fill={T.text} /><text x={p.x} y={p.y-25} textAnchor="middle" fill="white" fontSize="11" fontWeight="900">{valuePrefix}{p.value.toLocaleString()}</text></g>}
                    </g>
                ))}
            </svg>
        </div>
    );
}
// Horizontal Bar Chart (Inquiry Frequency)
function HorizontalBarChart({ data, valueFormatter = (value) => fmtNum(value) }) {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="flex flex-col gap-3">
            {data.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                    <div className="w-[116px] truncate text-right text-[0.78rem] font-bold text-slate-500" title={item.label}>
                        {item.label}
                    </div>
                    <progress
                        className={cn('h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100', item.isWarning ? 'accent-red-500' : 'accent-emerald-900')}
                        max={max}
                        value={item.value}
                    />
                    <div className={cn('w-[86px] text-right text-[0.78rem] font-extrabold', item.isWarning ? 'text-red-600' : 'text-slate-950')}>
                        {valueFormatter(item.value)}
                    </div>
                </div>
            ))}
        </div>
    );
}
// Worry Gauge
function WorryGauge({ score }) {
    const isRed = score >= 35;
    const isAmber = score >= 15 && score < 35;
    const color = isRed ? '#ff4d4f' : (isAmber ? '#faad14' : '#52c41a');
    const label = isRed ? 'ATTENTION' : (isAmber ? 'MONITOR' : 'CALM');
    
    return (
        <div className="relative flex h-[140px] flex-col items-center justify-center">
            <svg width="180" height="100" viewBox="0 0 180 100">
                <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={T.muted} strokeWidth="12" strokeLinecap="round" />
                <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" 
                    strokeDasharray="220" strokeDashoffset={220 - (220 * Math.min(score, 100) / 100)} className="transition-all duration-1000" />
            </svg>
            <div className="-mt-5 text-center">
                <div className={cn('text-xl font-black', colorTextClass(color))}>{label}</div>
                <div className="mt-0.5 text-[0.6rem] font-bold text-slate-500">System Stress: {Math.round(score)}%</div>
            </div>
        </div>
    );
}

function InsightMetric({ label, value, note, accent = T.green }) {
    return (
        <UiCard className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] min-h-24 rounded-[18px] p-4">
            <div className="text-[0.56rem] font-black uppercase tracking-[1px] text-slate-500">
                {label}
            </div>
            <div className={cn('mt-2 text-[1.35rem] font-black leading-none', colorTextClass(accent))}>
                {value}
            </div>
            {note && (
                <div className="mt-2 text-[0.7rem] font-bold leading-snug text-slate-500">
                    {note}
                </div>
            )}
        </UiCard>
    );
}

function ProgressList({ items, formatter = (v) => v }) {
    const max = Math.max(...items.map((item) => item.value), 1);
    return (
        <div className="flex flex-col gap-3.5">
            {items.map((item) => (
                <div key={item.label}>
                    <div className="mb-1.5 flex justify-between gap-3">
                        <span className="text-[0.78rem] font-extrabold text-slate-950">{item.label}</span>
                        <span className={cn('text-[0.78rem] font-black', colorTextClass(item.color || T.text))}>{formatter(item.value)}</span>
                    </div>
                    <progress className={cn('h-2.5 w-full overflow-hidden rounded-full bg-slate-100', colorAccentClass(item.color || T.green))} max={max} value={item.value} />
                    {item.note && (
                        <div className="mt-1 text-[0.7rem] font-bold text-slate-500">
                            {item.note}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function RatioBar({ items }) {
    const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
    let x = 0;
    return (
        <div>
            <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
                {items.map((item) => {
                    const width = Math.max(item.value > 0 ? 2 : 0, (item.value / total) * 100);
                    const segment = <rect key={item.label} x={x} y="0" width={width} height="14" fill={item.color}><title>{`${item.label}: ${item.value}`}</title></rect>;
                    x += width;
                    return segment;
                })}
            </svg>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
                {items.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                        <span className={cn('inline-block size-2.5 rounded-full', colorAccentClass(item.color).replace('accent-', 'bg-'))} />
                        <span className="text-[0.74rem] font-extrabold text-slate-500">
                            {item.label}: <span className="text-slate-950">{item.value}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function VerticalBarChart({ data, color = T.green, valueFormatter = (v) => v }) {
    const max = Math.max(...data.map((item) => item.value), 1);
    return (
        <div className="flex h-[220px] items-end gap-3.5 pt-2">
            {data.map((item) => (
                <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center">
                    <div className={cn('mb-2 text-[0.84rem] font-extrabold', colorTextClass(item.color || T.text))}>
                        {valueFormatter(item.value)}
                    </div>
                    <div className="flex h-[150px] w-full items-end justify-center">
                        <svg viewBox="0 0 56 150" preserveAspectRatio="none" className="h-[150px] w-full max-w-14 overflow-visible">
                            <rect
                                x="4"
                                y={150 - Math.max(10, (item.value / max) * 150)}
                                width="48"
                                height={Math.max(10, (item.value / max) * 150)}
                                rx="10"
                                fill={item.color || color}
                                className="drop-shadow-sm"
                            >
                                <title>{`${item.label}: ${item.value}`}</title>
                            </rect>
                        </svg>
                    </div>
                    <div className="mt-2.5 text-center text-[0.8rem] font-bold leading-snug text-slate-500">
                        {item.label}
                    </div>
                </div>
            ))}
        </div>
    );
}

function MiniDataTable({ columns = [], rows = [], empty = 'No data for this period.' }) {
    return (
        <div className="overflow-hidden rounded-[16px] border border-[#d8c9b3]/70 bg-[#fffdf8]/72">
            <div className="grid border-b border-[#e5d8c4]/80 bg-[#f7eedf]/72 text-[0.58rem] font-black uppercase tracking-[0.08em] text-slate-500" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                {columns.map((column) => (
                    <div key={column} className="px-3 py-2">{column}</div>
                ))}
            </div>
            {rows.length === 0 ? (
                <div className="px-3 py-8 text-center text-[0.76rem] font-semibold text-slate-400">{empty}</div>
            ) : (
                <div className="divide-y divide-[#e5d8c4]/70">
                    {rows.map((row, index) => (
                        <div key={row.key || index} className="grid items-center text-[0.74rem] font-bold text-slate-950" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                            {row.cells.map((cell, cellIndex) => (
                                <div key={cellIndex} className={cn('min-w-0 truncate px-3 py-2.5', cellIndex === row.cells.length - 1 && 'text-right font-black text-[#0a6b5f]')} title={String(cell)}>
                                    {cell}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function AnalysisPager({ pages, activePage, onChange }) {
    const activeIndex = Math.max(0, pages.findIndex((page) => page.id === activePage));
    const active = pages[activeIndex] || pages[0];
    return (
        <div className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] no-print flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-3 py-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#f7eedf] px-3 py-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">
                    Analysis Pages
                </span>
                {pages.map((page, index) => (
                    <Button
                        key={page.id}
                        type="button"
                        variant={activePage === page.id ? 'default' : 'outline'}
                        size="sm"
                        className={cn('h-8 rounded-full px-3 text-[0.62rem] font-black', activePage === page.id && 'bg-[#0a6b5f] text-white hover:bg-[#08443f]')}
                        onClick={() => onChange(page.id)}
                    >
                        {index + 1}. {page.label}
                    </Button>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <span className="hidden max-w-[260px] truncate text-right text-[0.66rem] font-bold text-slate-500 lg:block">
                    {active?.description}
                </span>
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-full text-[0.62rem] font-black" disabled={activeIndex <= 0} onClick={() => onChange(pages[activeIndex - 1].id)}>
                    Prev
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-full text-[0.62rem] font-black" disabled={activeIndex >= pages.length - 1} onClick={() => onChange(pages[activeIndex + 1].id)}>
                    Next
                </Button>
            </div>
        </div>
    );
}
// Main
export function AnalyticsHub({ ledger = [], units = [], specialBookings = [], receivables = [], pending = [], chatLogs = [], mode = 'dashboard' }) {
    const [selectedMonth, setSelectedMonth] = useState('all');
    const [selectedYear, setSelectedYear]   = useState('all');
    
    const [lineRange, setLineRange] = useState(12);
    const [analysisPage, setAnalysisPage] = useState('overview');
    const [currentPage, setCurrentPage] = useState(1);
    const [isPrinting, setIsPrinting] = useState(false);
    const ITEMS_PER_PAGE = 25;

    const today = useMemo(() => new Date(), []);
    const unfilteredTrans = useMemo(() => {
        const seen = new Set();
        return [...ledger, ...specialBookings].filter((booking) => {
            if (!booking.booking_ref) return true;
            if (seen.has(booking.booking_ref)) return false;
            seen.add(booking.booking_ref);
            return true;
        });
    }, [ledger, specialBookings]);

    // Consolidate and filter all transactions for absolute reliability
    const allTrans = useMemo(() => {
        return unfilteredTrans.filter(b => {
            // HARDENING: Unverified bookings must not enter the financial analytics hub
            // this prevents fraud and ensures gross figures only reflect verified capital.
            if (b.status === 'PENDING_VERIFICATION') return false;

            if (selectedMonth === 'all' && selectedYear === 'all') return true;
            const parts = getBookingDateParts(b);
            if (!parts) return false;
            const matchesMonth = selectedMonth === 'all' || parts.month === selectedMonth;
            const matchesYear  = selectedYear  === 'all' || parts.year === selectedYear;
            return matchesMonth && matchesYear;
        });
    }, [unfilteredTrans, selectedMonth, selectedYear]);
    // Shared Calculations
    const m = useMemo(() => {
        const last30 = subDays(today, 30), prev30 = subDays(last30, 30);
        
        const getRev = (s, e) => allTrans.filter(b => {
            if (!b.created_at) return false;
            const d = parseISO(b.created_at);
            if (isNaN(d.getTime())) return false;
            return d >= s && d <= e;
        }).reduce((acc, b) => acc + (Number(b.amount_paid || 0) - Number(b.amount_refunded || 0)), 0);

        const revNow = getRev(last30, today);
        const revOld = getRev(prev30, last30);
        const trend = revOld > 0 ? Math.round(((revNow - revOld) / revOld) * 100) : 0;

        const totalRev = allTrans.reduce((s, b) => s + (Number(b.amount_paid || 0) - Number(b.amount_refunded || 0)), 0);
        const totalRefunds = allTrans.reduce((s, b) => s + Number(b.amount_refunded || 0), 0);
        // Alignment Fix: Total Billed is the strict contract value (Total + Addons)
        // Discrepancy (â‚±294,400) was caused by adding overpayments to this figure.
        const totalBilled = allTrans
            .filter(b => b.status !== 'CANCELLED' && b.status !== 'REJECTED')
            .reduce((s, b) => s + (Number(b.total_price || 0) + Number(b.addon_amount || 0)), 0);
        // Fix: Total Due MUST only sum from the filtered set to avoid leakage
        const totalDue = allTrans.reduce((s, b) => {
            const billed = (Number(b.total_price || 0) + Number(b.addon_amount || 0));
            const paid   = (Number(b.amount_paid || 0) - Number(b.amount_refunded || 0));
            return s + Math.max(0, billed - paid);
        }, 0);

        const inHouse = ledger.filter(b => {
            if (!b.check_in || !b.check_out || b.status !== 'RESERVED') return false;
            try {
                const start = startOfDay(parseISO(b.check_in));
                const end = startOfDay(parseISO(b.check_out));
                if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
                return isWithinInterval(today, { start, end });
            } catch (e) {
                return false;
            }
        });
        const arrivals = ledger.filter(b => b.status === 'RESERVED' && b.check_in && isSameDay(today, parseISO(b.check_in)));
        const departures = ledger.filter(b => b.status === 'RESERVED' && b.check_out && isSameDay(today, parseISO(b.check_out)));

        const totalUnitCount   = units.length || 1;
        const occupiedCount    = inHouse.length;
        const occRate = Math.round((occupiedCount / totalUnitCount) * 100);
        
        // Chat Monitor alignment: use the same operator categories surfaced in the Chatbot Monitor.
        const signalCounts = chatLogs.reduce((acc, log) => {
            const category = normalizeChatField(log, ['category', 'Category']).toUpperCase();
            const intent = normalizeChatField(log, ['Intent', 'intent', 'last_intent']).toLowerCase();
            const urgent = Number(log.urgent_count || 0) > 0 || intent.includes('handoff') || category === 'COMPLAINT' || category === 'NEEDS_HUMAN';
            const payment = intent.includes('payment') || category === 'PAYMENT_SENT';
            const operatorQueue = Boolean(log.manual_active) ||
                ['HOT_BOOKING_LEAD', 'PAYMENT_SENT', 'COMPLAINT', 'REBOOKING_OR_CANCELLATION', 'NEEDS_HUMAN', 'MANUAL_ACTIVE'].includes(category) ||
                urgent ||
                payment;
            const key = operatorQueue ? 'Operator Queue'
                : ['LOW_PRIORITY_FAQ', 'SPAM_OR_NONSENSE'].includes(category) ? 'Bot-Handled'
                : category === 'CONFIRMED_BOOKING' ? 'Booked'
                : intent ? intent.replace(/_/g, ' ') : 'Uncategorized';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const sortedSignals = Object.entries(signalCounts)
            .map(([label, count]) => ({
                label: label.charAt(0).toUpperCase() + label.slice(1),
                value: count,
                isWarning: ['Operator Queue', 'Needs human', 'Human handoff', 'Unrecognized'].includes(label)
            }))
            .sort((a,b) => b.value - a.value)
            .slice(0, 6);

        const unrecognizedCount = signalCounts.Unrecognized || signalCounts.unrecognized || 0;
        const chatAccuracy = chatLogs.length > 0 ? Math.round(((chatLogs.length - unrecognizedCount) / chatLogs.length) * 100) : 100;

        // "Worry Meter" Logic: Focus on RECENT window (last 50 logs)
        const recentLogs = chatLogs.slice(0, 50);
        const stress = recentLogs.reduce((s, log) => {
            const intent = (log.Intent || '').toLowerCase();
            if (intent === 'unrecognized' || intent === 'ai_fallback') return s + 2; // AI is confused
            if (intent === 'human_request' || intent === 'human_handoff') return s + 5; // Direct SOS
            return s;
        }, 0);
        const stressScore = recentLogs.length > 0 ? Math.min((stress / (recentLogs.length * 2)) * 100, 100) : 0;

        return { 
            revNow, trend, totalRev, totalRefunds, totalDue, totalBilled, occRate, 
            arrivals, departures, inHouse: inHouse.length,
            sortedSignals, chatAccuracy, chatTotal: chatLogs.length,
            stressScore
        };
    }, [allTrans, ledger, units, chatLogs, today]);

    const weeklyData = useMemo(() => {
        return Array.from({ length: lineRange }, (_, i) => {
            const wStart = startOfDay(subWeeks(today, lineRange - 1 - i));
            const wEnd   = addDays(wStart, 6);
            const val = allTrans.filter(b => {
                if (!b.created_at) return false;
                const d = parseISO(b.created_at);
                if (isNaN(d.getTime())) return false;
                return d >= wStart && d <= wEnd;
            }).reduce((s, b) => s + (Number(b.amount_paid || 0) - Number(b.amount_refunded || 0)), 0);
            return { label: format(wStart, 'MMM d'), value: val };
        });
    }, [allTrans, today, lineRange]);

    const businessPulse = useMemo(() => {
        const topRoomType = Object.entries(ledger.reduce((acc, b) => {
            acc[b.room_type || 'Other'] = (acc[b.room_type || 'Other'] || 0) + Number(b.amount_paid || 0);
            return acc;
        }, {})).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';
        const status = m.trend >= 0 ? "growing" : "slightly down";
        return `Overall, the property is ${status}. You've earned ${fmtCur(m.revNow)} gross this month. Your most popular option is the ${topRoomType}. Weekend occupancy is where we see the most activity.`;
    }, [m, ledger]);

    const dashboardModel = useMemo(() => {
        const paidCount = allTrans.filter((b) => {
            const gross = Number(b.total_price || 0) + Number(b.addon_amount || 0);
            const paid = Number(b.amount_paid || 0) - Number(b.amount_refunded || 0);
            return gross > 0 && paid >= gross;
        }).length;
        const partialCount = allTrans.filter((b) => {
            const gross = Number(b.total_price || 0) + Number(b.addon_amount || 0);
            const paid = Number(b.amount_paid || 0) - Number(b.amount_refunded || 0);
            return gross > 0 && paid > 0 && paid < gross;
        }).length;
        const unpaidCount = allTrans.filter((b) => {
            const gross = Number(b.total_price || 0) + Number(b.addon_amount || 0);
            const paid = Number(b.amount_paid || 0) - Number(b.amount_refunded || 0);
            return gross > 0 && paid <= 0;
        }).length;
        const refundedCount = allTrans.filter((b) => Number(b.amount_refunded || 0) > 0).length;

        const avgBookingValue = allTrans.length ? Math.round(m.totalBilled / allTrans.length) : 0;
        const settlementRate = m.totalBilled > 0 ? Math.round((m.totalRev / m.totalBilled) * 100) : 0;
        const receivableShare = m.totalBilled > 0 ? Math.round((m.totalDue / m.totalBilled) * 100) : 0;

        const topRooms = Object.entries(allTrans.reduce((acc, b) => {
            const key = b.room_type || b.booking_type || 'Other';
            acc[key] = (acc[key] || 0) + Number(b.total_price || 0) + Number(b.addon_amount || 0);
            return acc;
        }, {}))
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const guestLeaders = Object.entries(allTrans.reduce((acc, b) => {
            const key = b.full_name || b.guest_name || b.booking_ref || 'Unnamed guest';
            const guests = Number(b.guests ?? b.pax ?? b.guest_count ?? 0);
            acc[key] = (acc[key] || 0) + guests;
            return acc;
        }, {}))
            .map(([label, value]) => ({ label, value }))
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const roomDemandMix = Object.entries(allTrans.reduce((acc, b) => {
            const key = b.room_type || b.booking_type || 'Other';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}))
            .map(([label, value], idx) => ({ label, value, color: ROOM_COLORS[idx % ROOM_COLORS.length] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const dayOfWeekBookingPerformance = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, idx) => ({
            label,
            value: allTrans.reduce((count, b) => {
                const sourceDate = b.check_in || b.created_at;
                if (!sourceDate) return count;
                const date = parseISO(sourceDate);
                if (isNaN(date.getTime()) || getDay(date) !== idx) return count;
                return count + 1;
            }, 0),
        }));

        const inHouseNow = ledger.filter((b) => {
            if (!b.check_in || !b.check_out || b.status !== 'RESERVED') return false;
            const nowStr = format(today, 'yyyy-MM-dd');
            return nowStr >= b.check_in && nowStr < b.check_out;
        });
        const arrivalsNext7 = ledger
            .filter((b) => {
                if (b.status !== 'RESERVED' || !b.check_in) return false;
                const dt = parseISO(b.check_in);
                return !isNaN(dt.getTime()) && differenceInCalendarDays(dt, today) >= 0 && differenceInCalendarDays(dt, today) <= 7;
            })
            .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)))
            .slice(0, 6);
        const departuresNext3 = ledger
            .filter((b) => {
                if (b.status !== 'RESERVED' || !b.check_out) return false;
                const dt = parseISO(b.check_out);
                return !isNaN(dt.getTime()) && differenceInCalendarDays(dt, today) >= 0 && differenceInCalendarDays(dt, today) <= 3;
            })
            .sort((a, b) => String(a.check_out).localeCompare(String(b.check_out)))
            .slice(0, 6);

        const attentionAccounts = allTrans
            .map((b) => {
                const gross = Number(b.total_price || 0) + Number(b.addon_amount || 0);
                const paid = Number(b.amount_paid || 0) - Number(b.amount_refunded || 0);
                return { ...b, balance: Math.max(0, gross - paid) };
            })
            .filter((b) => b.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 5);

        const revenueByMonth = Array.from({ length: 6 }, (_, index) => {
            const anchor = startOfMonth(addDays(today, -index * 31));
            const monthStart = startOfMonth(anchor);
            const monthEnd = endOfMonth(anchor);
            const monthRows = allTrans.filter((b) => {
                const sourceDate = b.created_at || b.check_in;
                if (!sourceDate) return false;
                const date = parseISO(sourceDate);
                return !isNaN(date.getTime()) && !isBefore(date, monthStart) && !isAfter(date, monthEnd);
            });
            const billed = monthRows.reduce((sum, b) => sum + Number(b.total_price || 0) + Number(b.addon_amount || 0), 0);
            const collected = monthRows.reduce((sum, b) => sum + Number(b.amount_paid || 0) - Number(b.amount_refunded || 0), 0);
            return {
                label: format(monthStart, 'MMM yyyy'),
                value: collected,
                billed,
                bookings: monthRows.length,
            };
        }).reverse();

        const sourceMix = Object.entries(allTrans.reduce((acc, b) => {
            const key = b.booking_source || b.source || 'Unspecified';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}))
            .map(([label, value], idx) => ({ label, value, color: ROOM_COLORS[idx % ROOM_COLORS.length] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);

        const receivableAging = attentionAccounts.map((b) => {
            const sourceDate = b.check_out || b.check_in || b.created_at;
            const age = sourceDate ? Math.max(0, differenceInCalendarDays(today, parseISO(sourceDate))) : 0;
            return {
                key: b.booking_ref,
                cells: [
                    b.booking_ref || '-',
                    b.full_name || b.guest_name || 'Unnamed guest',
                    `${age}d`,
                    fmtCur(b.balance),
                ],
            };
        });

        const roomPerformanceRows = topRooms.map((item) => {
            const bookings = allTrans.filter((b) => (b.room_type || b.booking_type || 'Other') === item.label).length;
            const avg = bookings ? Math.round(item.value / bookings) : 0;
            return {
                key: item.label,
                cells: [item.label, `${bookings}`, fmtCur(avg), fmtCur(item.value)],
            };
        });

        const readinessRows = Object.entries(units.reduce((acc, unit) => {
            const key = unit.room_type || unit.category || unit.unit_type || 'Uncategorized';
            const status = String(unit.status || unit.readiness_status || 'Ready').toLowerCase();
            acc[key] ||= { total: 0, ready: 0, blocked: 0 };
            acc[key].total += 1;
            if (status.includes('block') || status.includes('maintenance')) acc[key].blocked += 1;
            if (status.includes('ready') || status.includes('open') || status === '') acc[key].ready += 1;
            return acc;
        }, {}))
            .map(([label, value]) => ({
                key: label,
                cells: [label, `${value.ready}/${value.total}`, `${value.blocked}`, `${Math.round((value.ready / Math.max(1, value.total)) * 100)}%`],
            }))
            .sort((a, b) => String(a.cells[0]).localeCompare(String(b.cells[0])))
            .slice(0, 6);

        const arrivalsRows = arrivalsNext7.map((b) => ({
            key: b.booking_ref,
            cells: [b.check_in || '-', b.full_name || b.guest_name || 'Guest', b.unit_label || b.unit_id || b.room_type || '-', b.booking_ref || '-'],
        }));
        const departuresRows = departuresNext3.map((b) => ({
            key: b.booking_ref,
            cells: [b.check_out || '-', b.full_name || b.guest_name || 'Guest', b.unit_label || b.unit_id || b.room_type || '-', b.booking_ref || '-'],
        }));

        const pulseTitle = settlementRate >= 80
            ? 'Collections are healthy and the books are moving well.'
            : settlementRate >= 55
                ? 'Revenue is coming in, but follow-through on settlements needs attention.'
                : 'Cash conversion is lagging behind billing and needs active follow-up.';

        const operationalPulse = [
            { label: 'Checked In', value: inHouseNow.length, color: T.green },
            { label: 'Arrivals', value: arrivalsNext7.length, color: T.teal },
            { label: 'Departures', value: departuresNext3.length, color: T.gold },
            { label: 'Open Balances', value: attentionAccounts.length, color: T.red },
        ];

        return {
            avgBookingValue,
            settlementRate,
            receivableShare,
            paidCount,
            partialCount,
            unpaidCount,
            refundedCount,
            topRooms,
            guestLeaders,
            roomDemandMix,
            dayOfWeekBookingPerformance,
            inHouseNow,
            arrivalsNext7,
            departuresNext3,
            attentionAccounts,
            revenueByMonth,
            sourceMix,
            receivableAging,
            roomPerformanceRows,
            readinessRows,
            arrivalsRows,
            departuresRows,
            operationalPulse,
            pulseTitle,
        };
    }, [allTrans, ledger, m, today]);

    const paginatedTrans = useMemo(() => {
        if (isPrinting) return allTrans;
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return allTrans.slice(start, start + ITEMS_PER_PAGE);
    }, [allTrans, currentPage, isPrinting]);

    const totalPages = Math.ceil(allTrans.length / ITEMS_PER_PAGE);

    const handlePrintReport = () => {
        const reportData = {
            ledger: allTrans,
            receivables: receivables,
            summary: {
                totalRev: fmtCur(m.totalRev),
                totalDue: fmtCur(m.totalDue),
                totalRefunds: fmtCur(m.totalRefunds),
                gross: fmtCur(m.totalBilled)
            }
        };
        sessionStorage.setItem('print_report_data', JSON.stringify(reportData));
        window.open('/print-report', '_blank');
    };

    const handleExport = () => {
        const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
        exportToCsv(`Amalfi_Sanctuary_Ledger_${timestamp}`, allTrans);
    };

    const availableYears = useMemo(() => {
        const years = Array.from(new Set(unfilteredTrans
            .map(getBookingDateParts)
            .filter(Boolean)
            .map((parts) => parts.year)
        ));
        return years.length ? years.sort((a, b) => b.localeCompare(a)) : [String(today.getFullYear())];
    }, [unfilteredTrans, today]);
    // Render
    const selectedMonthLabel = selectedMonth === 'all'
        ? 'All Months'
        : (MONTH_OPTIONS.find(([value]) => value === selectedMonth)?.[1] || 'Selected Month');
    const performancePeriodLabel = `${selectedMonthLabel} / ${selectedYear === 'all' ? 'All Years' : selectedYear}`;
    const analysisPages = [
        { id: 'overview', label: 'Overview', description: 'Executive revenue and settlement pulse.' },
        { id: 'revenue', label: 'Revenue', description: 'Cash movement, receivables, and collection aging.' },
        { id: 'bookings', label: 'Bookings', description: 'Booking volume, guest load, and arrivals flow.' },
        { id: 'rooms', label: 'Rooms', description: 'Room category demand, revenue, and readiness.' },
        { id: 'operations', label: 'Operations', description: 'Workload pressure, source mix, and concierge signals.' },
    ];

    const FilterBar = () => (
        <CommandDeck
            className="no-print"
            eyebrow="Report Controls"
            title="Performance window"
            description="Filter revenue, occupancy, collection health, and booking operations from one reporting deck."
            primary={(
                <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                    <span className="hidden h-9 items-center rounded-full border border-white/15 bg-white/10 px-3 text-[0.58rem] font-black uppercase tracking-[0.14em] text-[#f4d89a] sm:inline-flex">
                        Period
                    </span>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="h-9 w-full rounded-xl border-white/20 bg-white/15 text-xs font-bold text-[#fffdf8] shadow-none sm:w-[160px]">
                            <Calendar className="size-4 text-[#fffdf8]/72" />
                            <SelectValue placeholder="All Months" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="all">All Months</SelectItem>
                                {MONTH_OPTIONS.map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>

                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="h-9 w-full rounded-xl border-white/20 bg-white/15 text-xs font-bold text-[#fffdf8] shadow-none sm:w-[135px]">
                            <Calendar className="size-4 text-[#fffdf8]/72" />
                            <SelectValue placeholder="All Years" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="all">All Years</SelectItem>
                                {availableYears.map(y => (
                                    <SelectItem key={y} value={y}>{y}</SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>

                    {(selectedMonth !== 'all' || selectedYear !== 'all') && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-extrabold text-[#fffdf8] hover:bg-white/25 hover:text-white"
                            onClick={() => { setSelectedMonth('all'); setSelectedYear('all'); }}
                        >
                            <X data-icon="inline-start" /> Reset
                        </Button>
                    )}
                </div>
            )}
        >
            <DeckMetricRail
                intro={(
                    <DeckIntro
                        eyebrow="Performance"
                        title={performancePeriodLabel}
                        description={`${allTrans.length} billable bookings in view`}
                    />
                )}
            >
                <DeckMetric label="Net collected" caption="After refunds" value={fmtCur(m.totalRev)} tone="teal" />
                <DeckMetric label="Gross billed" caption={`${allTrans.length} bookings`} value={fmtCur(m.totalBilled)} tone="gold" />
                <DeckMetric label="Receivables" caption="Open unpaid balance" value={fmtCur(m.totalDue)} tone="red" />
                <DeckMetric label="System stress" caption={m.stressScore > 15 ? 'Needs review' : 'Stable'} value={`${Math.round(m.stressScore)}%`} tone={m.stressScore > 35 ? 'red' : (m.stressScore > 15 ? 'gold' : 'blue')} />
            </DeckMetricRail>
        </CommandDeck>
    );

    if (mode === 'dashboard') {
        return (
            <div className="flex flex-col gap-4">
                <FilterBar />
                <AnalysisPager pages={analysisPages} activePage={analysisPage} onChange={setAnalysisPage} />

                {analysisPage === 'overview' && (
                    <>
                        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
                            <AnalyticsCard title="Revenue Trend" subtitle="Collection movement across the selected rolling window" actions={[8, 12, 24].map(n => (
                                <Button key={n} type="button" variant={lineRange === n ? 'default' : 'outline'} size="sm" onClick={() => setLineRange(n)}>{n}w</Button>
                            ))}>
                                <EvolutionChart data={weeklyData} color={T.green} />
                            </AnalyticsCard>

                            <AnalyticsCard title="Booking Health" subtitle="How current bookings are settling">
                                <RatioBar items={[
                                    { label: 'Paid', value: dashboardModel.paidCount, color: T.teal },
                                    { label: 'Partial', value: dashboardModel.partialCount, color: T.gold },
                                    { label: 'Unpaid', value: dashboardModel.unpaidCount, color: T.red },
                                    { label: 'Refunded', value: dashboardModel.refundedCount, color: '#5b6cfa' },
                                ]} />
                                <div className="mt-[18px] rounded-xl bg-slate-100/70 px-3.5 py-3">
                                    <div className="text-[0.62rem] font-black uppercase tracking-[0.9px] text-slate-500">Collection Read</div>
                                    <div className="mt-1 text-[0.84rem] font-bold leading-relaxed text-slate-950">
                                        {dashboardModel.settlementRate >= 80
                                            ? 'Most billed revenue has already been converted to cash. Collection pressure is manageable.'
                                            : dashboardModel.settlementRate >= 55
                                                ? 'A meaningful share remains in partial or open status. Monitor upcoming due dates closely.'
                                                : 'Collection lag is high relative to billed revenue. This period needs manual follow-up and tighter payment verification.'}
                                    </div>
                                </div>
                            </AnalyticsCard>
                        </div>
                        <div className="grid gap-[18px] xl:grid-cols-3">
                            <AnalyticsCard title="Operational Pressure" subtitle="Live movement and workload indicators">
                                <VerticalBarChart data={dashboardModel.operationalPulse} />
                            </AnalyticsCard>
                            <AnalyticsCard title="Room Demand Mix" subtitle="Booking count distribution by room category">
                                {dashboardModel.roomDemandMix.length === 0 ? <div className="p-8 text-center text-[0.8rem] font-semibold text-slate-400">No room-demand data in the selected period.</div> : <DonutChart data={dashboardModel.roomDemandMix} size={150} />}
                            </AnalyticsCard>
                            <AnalyticsCard title="Room Revenue Leaders" subtitle="Which room categories are carrying revenue">
                                <HorizontalBarChart data={dashboardModel.topRooms.map((item) => ({ label: item.label, value: item.value }))} valueFormatter={fmtCur} />
                            </AnalyticsCard>
                        </div>
                    </>
                )}

                {analysisPage === 'revenue' && (
                    <div className="grid gap-4 xl:grid-cols-2">
                        <AnalyticsCard title="Six-Month Collection Curve" subtitle="Collected cash by posting month" actions={[8, 12, 24].map(n => (
                            <Button key={n} type="button" variant={lineRange === n ? 'default' : 'outline'} size="sm" onClick={() => setLineRange(n)}>{n}w</Button>
                        ))}>
                            <EvolutionChart data={weeklyData} color={T.teal} />
                        </AnalyticsCard>
                        <AnalyticsCard title="Monthly Revenue Table" subtitle="Collected, billed, and booking volume">
                            <MiniDataTable
                                columns={['Month', 'Bookings', 'Billed', 'Collected']}
                                rows={dashboardModel.revenueByMonth.map((item) => ({ key: item.label, cells: [item.label, item.bookings, fmtCur(item.billed), fmtCur(item.value)] }))}
                            />
                        </AnalyticsCard>
                        <AnalyticsCard title="Receivable Aging" subtitle="Largest open balances by guest account">
                            <MiniDataTable columns={['Ref', 'Guest', 'Age', 'Balance']} rows={dashboardModel.receivableAging} empty="No open receivables in this period." />
                        </AnalyticsCard>
                        <AnalyticsCard title="Revenue Leaders" subtitle="Room categories carrying billed value">
                            <HorizontalBarChart data={dashboardModel.topRooms.map((item) => ({ label: item.label, value: item.value }))} valueFormatter={fmtCur} />
                        </AnalyticsCard>
                    </div>
                )}

                {analysisPage === 'bookings' && (
                    <div className="grid gap-4 xl:grid-cols-2">
                        <AnalyticsCard title="Day of the Week Booking Performance" subtitle="Booking volume by check-in day">
                            <VerticalBarChart data={dashboardModel.dayOfWeekBookingPerformance} valueFormatter={(value) => `${fmtNum(value)} ${value === 1 ? 'booking' : 'bookings'}`} />
                        </AnalyticsCard>
                        <AnalyticsCard title="Guest Count Leaderboard" subtitle="Bookings carrying the most guest volume">
                            {dashboardModel.guestLeaders.length === 0 ? (
                                <div className="p-8 text-center text-[0.8rem] font-semibold text-slate-400">No guest-count data in the selected period.</div>
                            ) : (
                                <HorizontalBarChart data={dashboardModel.guestLeaders} valueFormatter={(value) => `${fmtNum(value)} pax`} />
                            )}
                        </AnalyticsCard>
                        <AnalyticsCard title="Arrivals Pipeline" subtitle="Next 7 days of expected check-ins">
                            <MiniDataTable columns={['Date', 'Guest', 'Unit', 'Ref']} rows={dashboardModel.arrivalsRows} empty="No arrivals in the next 7 days." />
                        </AnalyticsCard>
                        <AnalyticsCard title="Departure Load" subtitle="Next 3 days of check-out pressure">
                            <MiniDataTable columns={['Date', 'Guest', 'Unit', 'Ref']} rows={dashboardModel.departuresRows} empty="No departures in the next 3 days." />
                        </AnalyticsCard>
                    </div>
                )}

                {analysisPage === 'rooms' && (
                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <AnalyticsCard title="Room Demand Mix" subtitle="Booking count distribution by room category">
                            {dashboardModel.roomDemandMix.length === 0 ? (
                                <div className="p-8 text-center text-[0.8rem] font-semibold text-slate-400">No room-demand data in the selected period.</div>
                            ) : (
                                <>
                                    <DonutChart data={dashboardModel.roomDemandMix} size={150} />
                                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                                        {dashboardModel.roomDemandMix.map((item) => (
                                            <div key={item.label} className="flex items-center gap-2">
                                                <span className={cn('inline-block size-2.5 rounded-full', colorAccentClass(item.color).replace('accent-', 'bg-'))} />
                                                <span className="text-[0.74rem] font-extrabold text-slate-500">{item.label}: <span className="text-slate-950">{item.value}</span></span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </AnalyticsCard>
                        <AnalyticsCard title="Room Performance Table" subtitle="Average value and total billed by category">
                            <MiniDataTable columns={['Category', 'Bookings', 'Avg Value', 'Billed']} rows={dashboardModel.roomPerformanceRows} />
                        </AnalyticsCard>
                        <AnalyticsCard title="Readiness By Category" subtitle="Ready inventory and blocked unit exposure">
                            <MiniDataTable columns={['Category', 'Ready', 'Blocked', 'Ready %']} rows={dashboardModel.readinessRows} empty="No unit readiness data available." />
                        </AnalyticsCard>
                        <AnalyticsCard title="Room Revenue Leaders" subtitle="Visual rank by billed contribution">
                            <HorizontalBarChart data={dashboardModel.topRooms.map((item) => ({ label: item.label, value: item.value }))} valueFormatter={fmtCur} />
                        </AnalyticsCard>
                    </div>
                )}

                {analysisPage === 'operations' && (
                    <div className="grid gap-4 xl:grid-cols-2">
                        <AnalyticsCard title="Operational Pressure" subtitle="Live movement and workload indicators">
                            <VerticalBarChart data={dashboardModel.operationalPulse} />
                        </AnalyticsCard>
                        <AnalyticsCard title="Booking Source Mix" subtitle="Where visible demand is entering the system">
                            {dashboardModel.sourceMix.length === 0 ? (
                                <div className="p-8 text-center text-[0.8rem] font-semibold text-slate-400">No booking source data in this period.</div>
                            ) : (
                                <DonutChart data={dashboardModel.sourceMix} size={150} />
                            )}
                        </AnalyticsCard>
                        <AnalyticsCard title="Concierge Signal" subtitle="Aligned with Operator Queue and Bot-Handled threads">
                            <WorryGauge score={m.stressScore} />
                            {m.chatTotal === 0 ? (
                                <div className="rounded-xl bg-slate-100/70 p-4 text-[0.76rem] font-bold text-slate-500">No chat interaction data is available yet for this view.</div>
                            ) : (
                                <div className="mt-2"><HorizontalBarChart data={m.sortedSignals.slice(0, 4)} /></div>
                            )}
                        </AnalyticsCard>
                        <AnalyticsCard title="Action Accounts" subtitle="Highest receivables that need follow-up">
                            <MiniDataTable columns={['Ref', 'Guest', 'Age', 'Balance']} rows={dashboardModel.receivableAging} empty="No balances need follow-up." />
                        </AnalyticsCard>
                    </div>
                )}
            </div>
        );
    }

    if (mode === 'dashboard-legacy') {
        return (
            <div className="flex flex-col gap-5">
                <FilterBar />
                <div className="flex gap-6">
                    <div className="mb-5 grid flex-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <PulseStat icon="Rev" label="30D Net Revenue" value={fmtCur(m.revNow)} trend={m.trend} color={T.teal} sub="Net Cash Flow" highlight />
                        <PulseStat icon="Due" label="Receivables" value={fmtCur(m.totalDue)} color={T.red} sub="Outstanding" />
                        <PulseStat icon="Ref" label="Total Refunds" value={fmtCur(m.totalRefunds)} color={T.gold} sub="Capital Returned" />
                        <PulseStat icon="AI" label="System Stress" value={`${Math.round(m.stressScore)}%`} color={m.stressScore > 35 ? T.red : (m.stressScore > 15 ? '#faad14' : T.green)} sub="Recent friction" />
                    </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[1.2fr_1.8fr]">
                    <AnalyticsCard title="Today's Desk" subtitle="Active guest flow for today">
                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="mb-2 text-[0.52rem] font-black uppercase text-teal-700">Checking In ({m.arrivals.length})</div>
                                {m.arrivals.length === 0 ? <div className="text-[0.65rem] font-semibold text-slate-400">No arrivals today</div> : m.arrivals.map(b => (
                                    <div key={b.booking_ref} className="flex justify-between rounded-lg bg-emerald-50/70 p-2.5">
                                        <span className="text-[0.72rem] font-extrabold text-slate-950">{b.full_name}</span>
                                        <span className="text-[0.65rem] font-bold text-slate-500">{b.room_type}</span>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div className="mb-2 text-[0.52rem] font-black uppercase text-red-600">Checking Out ({m.departures.length})</div>
                                {m.departures.length === 0 ? <div className="text-[0.65rem] font-semibold text-slate-400">No departures today</div> : m.departures.map(b => (
                                    <div key={b.booking_ref} className="flex justify-between rounded-lg bg-red-50/70 p-2.5">
                                        <span className="text-[0.72rem] font-extrabold text-slate-950">{b.full_name}</span>
                                        <span className="text-[0.65rem] font-bold text-slate-500">Room {b.unit_id}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </AnalyticsCard>

                    <AnalyticsCard title="Revenue Evolution" actions={[8, 12, 24].map(n => (
                        <Button key={n} type="button" variant={lineRange === n ? 'default' : 'outline'} size="sm" onClick={() => setLineRange(n)}>{n}w</Button>
                    ))}>
                        <EvolutionChart data={weeklyData} color={T.green} />
                    </AnalyticsCard>

                    <AnalyticsCard title="Concierge Health" subtitle="Real-time Attention Meter">
                        <WorryGauge score={m.stressScore} />
                        <div className="mt-2.5 rounded-xl bg-slate-100/70 p-4">
                            <div className="mb-1 text-[0.65rem] font-black uppercase tracking-wide text-slate-950">
                                {m.stressScore > 35 ? 'Urgent Action' : (m.stressScore > 15 ? 'Monitor Logs' : 'All Clear')}
                            </div>
                            <div className="text-[0.6rem] font-semibold leading-relaxed text-slate-500">
                                {m.stressScore > 35 ? "Guests are hitting dead-ends or asking for humans. Open the Concierge Monitor now." : 
                                 m.stressScore > 15 ? "The AI is handling most things, but some questions are going unrecognized. Review periodically." : 
                                 "The Concierge is performing perfectly. Your guests are getting the answers they need."}
                            </div>
                        </div>
                    </AnalyticsCard>

                    <AnalyticsCard title="Concierge Intelligence" subtitle="Most common guest inquiries">
                        {m.chatTotal === 0 ? (
                            <div className="p-10 text-center text-[0.7rem] font-semibold text-slate-400">No chat interaction data available yet.</div>
                        ) : (
                            <HorizontalBarChart data={m.sortedSignals} />
                        )}
                        <div className="mt-5 rounded-lg bg-slate-100/70 p-3 text-[0.55rem] font-bold leading-relaxed text-slate-500">
                            <span className="text-slate-950">Hint:</span> High <span className="text-red-600">"Operator Queue"</span> counts indicate guest threads that may need manual oversight.
                        </div>
                    </AnalyticsCard>
                </div>

                <div className="grid gap-5 xl:grid-cols-3">
                    <AnalyticsCard title="Payment Health" subtitle="Settlement mix">
                        <DonutChart data={[
                            { label: 'Paid', value: ledger.filter(b => b.payment_status === 'PAID').length, color: T.teal },
                            { label: 'Unpaid', value: ledger.filter(b => b.payment_status !== 'PAID').length, color: T.red },
                        ]} size={120} />
                    </AnalyticsCard>
                    <AnalyticsCard title="Room Performance" subtitle="Gross volume by category">
                        <div className="flex flex-col gap-2.5">
                            {Object.entries(ledger.reduce((acc, b) => {
                                acc[b.room_type || 'Other'] = (acc[b.room_type || 'Other'] || 0) + Number(b.amount_paid || 0);
                                return acc;
                            }, {})).sort((a,b) => b[1] - a[1]).slice(0, 4).map(([type, val]) => (
                                <div key={type} className="flex justify-between">
                                    <span className="text-[0.65rem] font-extrabold text-slate-500">{type}</span>
                                    <span className="text-[0.72rem] font-black text-slate-950">{fmtCur(val)}</span>
                                </div>
                            ))}
                        </div>
                    </AnalyticsCard>
                    <AnalyticsCard title="Revenue By Day" subtitle="Weekly performance">
                        <div className="flex h-[100px] items-end gap-2">
                            {Object.entries(ledger.reduce((acc, b) => {
                                if (!b.created_at) return acc;
                                const date = parseISO(b.created_at);
                                if (isNaN(date.getTime())) return acc;
                                const d = getDay(date);
                                acc[d] = (acc[d] || 0) + Number(b.amount_paid || 0);
                                return acc;
                            }, {0:0,1:0,2:0,3:0,4:0,5:0,6:0})).map(([d, val]) => (
                                <div key={d} className="flex flex-1 flex-col items-center">
                                    <svg viewBox="0 0 20 100" preserveAspectRatio="none" className="h-[86px] w-full overflow-visible">
                                        <rect
                                            x="2"
                                            y={100 - Math.max(4, Math.min(100, m.totalRev > 0 ? (val / m.totalRev) * 100 : 4))}
                                            width="16"
                                            height={Math.max(4, Math.min(100, m.totalRev > 0 ? (val / m.totalRev) * 100 : 4))}
                                            rx="2"
                                            fill={T.green}
                                            opacity={0.35 + Math.min(0.55, m.totalRev > 0 ? val / m.totalRev : 0)}
                                        />
                                    </svg>
                                    <span className="mt-1 text-[0.5rem] font-extrabold text-slate-400">{['S','M','T','W','T','F','S'][d]}</span>
                                </div>
                            ))}
                        </div>
                    </AnalyticsCard>
                </div>
            </div>
        );
    }
    // Render: Financial Reports
    return (
        <FinancialReportsWorkspace
            ledger={ledger}
            specialBookings={specialBookings}
            receivables={receivables}
        />
    );
}
