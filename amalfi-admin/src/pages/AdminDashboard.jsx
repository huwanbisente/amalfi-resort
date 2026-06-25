import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { SpecialBookingsHub } from '../components/SpecialBookingsHub';
import { AnalyticsHub } from '../components/AnalyticsHub';
import { KnowledgeHub } from '../components/KnowledgeHub';
import { ResponseHelper } from '../components/ResponseHelper';
import { ConciergeHubV2 } from '../components/ConciergeHubV2';
import { Sidebar } from '../components/Sidebar';
import {
    AppShell,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    CommandDeck,
    DeckIntro,
    DeckMetric,
    DeckMetricRail,
    DeckWorkspace,
    EmptyState,
    Header,
    Input,
    PageContainer,
    PageHeader,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
    StatusBadge,
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsList,
    TabsTrigger,
} from '../components/shared';
import { AdminBookingModal } from '../components/AdminBookingModal';
import { EditBookingModal } from '../components/EditBookingModal';
import { BookingSummaryModal } from '../components/BookingSummaryModal';
import { TentBookingModal } from '../components/TentBookingModal';
import { exportToPng } from '../utils/exportToPng';
import { api } from '../utils/api';
import { emitBookingSync, subscribeBookingSync } from '../utils/bookingSync';
import { paymentStatusLabel } from '../utils/statusLabels';
import { cn } from '@/lib/utils';
import { getTodayCheckInActionLabel, isPaymentDueRow, isTodayCheckInRow } from '../utils/bookingWorkspaceLogic';
import {
    addDaysToDateOnly,
    diffDateOnlyDays,
    formatDateOnlyInManila,
    formatDateTimeInManila,
    getManilaTodayKey,
} from '../utils/manilaDate';
import { 
    Search, Calendar, Globe, Plus, FileText, Power, Bot, MonitorSmartphone, BriefcaseBusiness,
    ArrowUpDown, CheckCircle2, Sparkles, Wrench, AlertTriangle, Clock3, ShieldAlert, BedDouble
} from 'lucide-react';

/**
 * ?? Amalfi Sanctuary Admin Hub
 * Central Ledger now includes: All Bookings, Check-ins, Check-outs, Transaction Log, and booking history.
 */
const ADMIN_TAB_IDS = new Set([
    'summary',
    'pending',
    'ledger',
    'map',
    'special',
    'units',
    'analytics',
    'reports',
    'knowledge',
    'responses',
    'concierge',
]);
const DEFAULT_ADMIN_TAB = 'summary';
const ADMIN_TAB_STORAGE_KEY = 'amalfiAdminActiveTab';

function getInitialAdminTab() {
    if (typeof window === 'undefined') return DEFAULT_ADMIN_TAB;

    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (ADMIN_TAB_IDS.has(viewParam)) return viewParam;

    const storedTab = window.localStorage.getItem(ADMIN_TAB_STORAGE_KEY);
    if (ADMIN_TAB_IDS.has(storedTab)) return storedTab;

    if (params.has('chat_sender')) return 'concierge';

    return DEFAULT_ADMIN_TAB;
}

export function AdminDashboard() {
    const [activeTab, setActiveTab]       = useState(() => getInitialAdminTab());
    const [ledgerTab, setLedgerTab]       = useState('all');
    const [error, setError]               = useState(null);
    const [pending, setPending]           = useState([]);
    const [receivables, setReceivables]   = useState([]);
    const [ledger, setLedger]             = useState([]);
    const [checkouts, setCheckouts]       = useState([]);
    const [txLog, setTxLog]               = useState([]);
    const [units, setUnits]               = useState([]);
    const [specialBookings, setSpecialBookings] = useState([]);
    const [chatLogs, setChatLogs]         = useState([]);
    const [loading, setLoading]           = useState(true);
    const [currentTime, setCurrentTime]   = useState(new Date());
    const [serviceSwitches, setServiceSwitches] = useState({
        is_portal_enabled: true,
        is_bot_enabled: true,
        is_admin_desk_enabled: true,
        is_holiday_minimum_stay_enabled: true,
    });
    const [serviceBusyKey, setServiceBusyKey] = useState(null);
    const [serviceError, setServiceError] = useState('');
    const [themeMode, setThemeMode] = useState(() => localStorage.getItem('amalfiAdminTheme') || 'light');
    const [ledgerDateWindow, setLedgerDateWindow] = useState({ from: '', to: '' });
    const [bulkPastSettlementOpen, setBulkPastSettlementOpen] = useState(false);
    const [bulkPastSettlementPreview, setBulkPastSettlementPreview] = useState(null);
    const [bulkPastSettlementResult, setBulkPastSettlementResult] = useState(null);
    const [bulkPastSettlementConfirm, setBulkPastSettlementConfirm] = useState('');
    const [bulkPastSettlementLoading, setBulkPastSettlementLoading] = useState(false);
    const [bulkPastSettlementError, setBulkPastSettlementError] = useState('');

    // ?? Live Operational Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        localStorage.setItem('amalfiAdminTheme', themeMode);
    }, [themeMode]);

    useEffect(() => {
        if (!ADMIN_TAB_IDS.has(activeTab)) return;

        localStorage.setItem(ADMIN_TAB_STORAGE_KEY, activeTab);

        const url = new URL(window.location.href);
        url.searchParams.set('view', activeTab);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }, [activeTab]);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [activeTab]);

    const fetchServiceSwitches = React.useCallback(async () => {
        try {
            const settings = await api.get('/api/v1/admin/settings');
            setServiceSwitches({
                is_portal_enabled: settings.is_portal_enabled !== 'false',
                is_bot_enabled: settings.is_bot_enabled !== 'false',
                is_admin_desk_enabled: settings.is_admin_desk_enabled !== 'false',
                is_holiday_minimum_stay_enabled: settings.is_holiday_minimum_stay_enabled !== 'false',
            });
            setServiceError('');
        } catch (err) {
            console.error('Service switch fetch failed:', err);
            setServiceError('Service controls unavailable');
        }
    }, []);

    useEffect(() => {
        fetchServiceSwitches();
    }, [fetchServiceSwitches]);

    const toggleCustomerService = async (key) => {
        const nextValue = !serviceSwitches[key];
        setServiceBusyKey(key);
        setServiceError('');
        setServiceSwitches((current) => ({ ...current, [key]: nextValue }));
        try {
            await api.patch('/api/v1/admin/settings', { key, value: String(nextValue) });
            await fetchServiceSwitches();
        } catch (err) {
            console.error('Service switch update failed:', err);
            setServiceSwitches((current) => ({ ...current, [key]: !nextValue }));
            setServiceError(err.message || 'Service toggle failed');
        } finally {
            setServiceBusyKey(null);
        }
    };

    // ??? SHARP LEDGER SEGMENTATION (React Memoized)
    // Defined above child views to prevent ReferenceErrors
    const todayStr     = React.useMemo(() => getManilaTodayKey(), []);
    const isPastStay = React.useCallback((booking) => {
        return Boolean(booking?.check_out) && String(booking.check_out) < todayStr;
    }, [todayStr]);
    const closedBookingStatuses = React.useMemo(() => new Set(['CHECKED_OUT', 'COMPLETED', 'CANCELLED', 'PAYMENT_REJECTED', 'REJECTED']), []);
    const activeBookings = React.useMemo(() => (
        ledger.filter(b => !closedBookingStatuses.has(String(b.status || '').toUpperCase()))
    ), [ledger, closedBookingStatuses]);
    const historyBookings = React.useMemo(() => (
        ledger.filter(b => closedBookingStatuses.has(String(b.status || '').toUpperCase()) && isPastStay(b))
    ), [ledger, closedBookingStatuses, isPastStay]);

    // -- Pre-Calculated Ledger Views (Hooks at top to prevent crash) --------------
    const isCheckedInBooking = React.useCallback((booking) => {
        if (!booking) return false;
        return booking.status === 'CHECKED_IN';
    }, []);
    const checkedInBookings = React.useMemo(() => activeBookings.filter(isCheckedInBooking), [activeBookings, isCheckedInBooking]);
    const paymentDueBookings = React.useMemo(() => activeBookings.filter(isPaymentDueRow), [activeBookings]);
    const arrivals     = React.useMemo(() => {
        return activeBookings.filter((booking) => isTodayCheckInRow(booking, todayStr));
    }, [activeBookings, todayStr]);
    const upcomingAudit = React.useMemo(() => {
        const tomorrow = addDaysToDateOnly(todayStr, 1);
        return activeBookings.filter(b =>
            b.status === 'RESERVED' &&
            b.check_in === tomorrow
        );
    }, [activeBookings, todayStr]);
    const todaysCheckouts = React.useMemo(() => {
        return checkedInBookings.filter(b => b.check_out === todayStr);
    }, [checkedInBookings, todayStr]);
    const pastBookings = React.useMemo(() => historyBookings, [historyBookings]);

    // Export refs
    const refPending  = useRef(null);
    const refLedger   = useRef(null);
    const refSpecial  = useRef(null);
    const refAnalytics = useRef(null);
    // CRUD
    const [crudModal, setCrudModal]       = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [summaryBooking, setSummaryBooking] = useState(null);
    const [editInitialTab, setEditInitialTab] = useState(null);
    const [editWorkflowMode, setEditWorkflowMode] = useState('edit');
    const [tentModal, setTentModal]             = useState(null); // 'add' | 'edit'
    const [selectedPendingRef, setSelectedPendingRef] = useState(null); // Verification detail view
    
    // Bulk Import Logic
    const [bulkImportModal, setBulkImportModal] = useState(false);
    const [importAnalysis, setImportAnalysis]   = useState(null);
    const [importLoading, setImportLoading]     = useState(false);
    const [importFile, setImportFile]           = useState(null);
    const [importNotice, setImportNotice]       = useState('');
    
    // Ledger Filtering State
    const [globalSearch, setGlobalSearch] = useState('');
    const [currentPage,  setCurrentPage]  = useState(1);
    const [prefillRemainingPayment, setPrefillRemainingPayment] = useState(false);
    const [unitSearch, setUnitSearch] = useState('');
    const [unitCategoryFilter, setUnitCategoryFilter] = useState('');
    const [unitStatusFilter, setUnitStatusFilter] = useState('all');
    const [summaryMiniMapCategory, setSummaryMiniMapCategory] = useState('');
    const [unitDateTagDraft, setUnitDateTagDraft] = useState(null);
    const PAGE_SIZE = 6; // Keep central ledger views short enough to scan without long page scrolling.

    const openManualBooking = React.useCallback(() => {
        setSummaryBooking(null);
        setTentModal(null);
        setPrefillRemainingPayment(false);
        setSelectedBooking({
            check_in: todayStr,
            check_out: addDaysToDateOnly(todayStr, 1),
            booking_source: 'Direct',
            status: 'RESERVED',
        });
        setEditInitialTab(null);
        setEditWorkflowMode('edit');
        setCrudModal('add');
        setActiveTab('ledger');
    }, [todayStr]);

    const openSpecialBooking = React.useCallback((type = 'tent_pitching', date = null) => {
        const checkIn = date ? format(date, 'yyyy-MM-dd') : todayStr;
        setSummaryBooking(null);
        setCrudModal(null);
        setEditInitialTab(null);
        setEditWorkflowMode('edit');
        setPrefillRemainingPayment(false);
        setSelectedBooking({
            booking_type: type,
            check_in: checkIn,
            check_out: type === 'day_tour' ? checkIn : addDaysToDateOnly(checkIn, 1),
            status: 'RESERVED',
        });
        setTentModal('add');
    }, [todayStr]);

    const openBookingEditor = React.useCallback((booking, initialTab = null, workflowMode = 'edit') => {
        if (!booking) return;
        setSelectedBooking(booking);
        setSummaryBooking(null);
        setTentModal(null);
        setEditInitialTab(initialTab);
        setEditWorkflowMode(workflowMode);
        setPrefillRemainingPayment(false);
        if (['tent_pitching', 'day_tour'].includes(booking.booking_type)) {
            setCrudModal(null);
            setTentModal('edit');
            return;
        }
        setCrudModal('edit');
    }, []);

    const openBookingSummary = React.useCallback((booking) => {
        if (!booking) return;
        setCrudModal(null);
        setTentModal(null);
        setEditInitialTab(null);
        setEditWorkflowMode('edit');
        setPrefillRemainingPayment(false);
        setSummaryBooking(booking);
    }, []);

    const openBookingPaymentShortcut = React.useCallback((booking, workflowMode = 'checkin') => {
        if (!booking) return;
        setSelectedBooking(booking);
        setSummaryBooking(null);
        setTentModal(null);
        setEditInitialTab('payments');
        setEditWorkflowMode(workflowMode);
        setPrefillRemainingPayment(false);
        if (['tent_pitching', 'day_tour'].includes(booking.booking_type)) {
            setPrefillRemainingPayment(false);
            setCrudModal(null);
            setTentModal('edit');
            return;
        }
        setCrudModal('edit');
    }, []);

    const openBookingCheckoutShortcut = React.useCallback((booking) => {
        if (!booking) return;
        setSelectedBooking(booking);
        setSummaryBooking(null);
        setTentModal(null);
        setEditInitialTab('payments');
        setEditWorkflowMode('checkout');
        setPrefillRemainingPayment(false);
        if (['tent_pitching', 'day_tour'].includes(booking.booking_type)) {
            setPrefillRemainingPayment(false);
            setCrudModal(null);
            setTentModal('edit');
            return;
        }
        setCrudModal('edit');
    }, []);


    // -- Filtering Logic (Applied globally to Central Ledger tabs) --
    const filteredLedger = React.useMemo(() => {
        const query = globalSearch.trim().toLowerCase();
        const applyDateWindow = ['all', 'payments'].includes(ledgerTab) && (ledgerDateWindow.from || ledgerDateWindow.to);

        // 1. Determine base list and date anchor
        let baseList = [];

        switch(ledgerTab) {
            case 'txlog':       baseList = txLog; break;
            case 'payments':    baseList = paymentDueBookings; break;
            case 'arrivals':    baseList = arrivals; break;
            case 'upcoming':    baseList = upcomingAudit; break;
            case 'departures':  baseList = todaysCheckouts; break;
            case 'past':        baseList = pastBookings; break;
            default:            baseList = activeBookings;
        }

        return baseList.filter(row => {
            if (applyDateWindow && !stayFallsWithinDateWindow(row, ledgerDateWindow)) return false;
            if (!query) return true;
            return [
                row.booking_ref,
                row.full_name,
                row.guest_name,
                row.phone,
                row.email,
                row.unit_id,
                row.unit_label,
                row.unit_summary,
                row.room_type
            ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
        });
    }, [activeBookings, globalSearch, ledgerTab, ledgerDateWindow, txLog, paymentDueBookings, arrivals, upcomingAudit, todaysCheckouts, pastBookings]);

    // ?? PAGINATION RESET COMMAND: Return to Page 1 on any filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [ledgerTab, globalSearch, ledgerDateWindow]);
    
    const ledgerTotals = React.useMemo(() => {
        return filteredLedger
            .filter(row => row.status !== 'PENDING_VERIFICATION')
            .reduce((acc, row) => {
                const total = Number(row.total_price || 0) + Number(row.addon_amount || 0);
                const paid = Number(row.amount_paid || 0);
                acc.billed += total;
                acc.settled += paid;
                acc.balance += (total - paid);
                return acc;
            }, { billed: 0, settled: 0, balance: 0 });
    }, [filteredLedger]);

    const pendingSort      = useSort(pending,       'created_at', 'desc');
    const ledgerSort       = useSort(filteredLedger,  'check_in', 'asc');
    const paymentsSort     = useSort(filteredLedger,  'check_in', 'asc');
    const arrivalsSort     = useSort(filteredLedger,  'check_in', 'asc');
    const upcomingSort     = useSort(filteredLedger,  'check_in', 'asc');
    const departuresSort   = useSort(filteredLedger,  'check_out', 'asc');
    const pastSort         = useSort(filteredLedger,  'check_out', 'desc');
    const txLogSort        = useSort(filteredLedger,           'created_at', 'desc');
    const combinedSpecialBookings = React.useMemo(() => {
        const merged = [];
        const seen = new Set();
        [...specialBookings, ...ledger.filter((booking) => ['tent_pitching', 'day_tour'].includes(booking.booking_type))].forEach((booking) => {
            const key = booking.booking_ref || `${booking.booking_type}-${booking.check_in}-${booking.full_name || booking.guest_name || merged.length}`;
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(booking);
        });
        return merged;
    }, [specialBookings, ledger]);

    // ?? High-Value Intelligence: Today's Revenue counter
    const todayRevenue = React.useMemo(() => {
        return txLog
            .filter(tx => tx.created_at?.startsWith(todayStr))
            .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    }, [txLog, todayStr]);

    useEffect(() => { 
        fetchAll(); 
        const pulseInterval = setInterval(() => fetchAll(true), 60000); // ?? Live Pulse Sync (60s)
        return () => clearInterval(pulseInterval);
    }, []);

    // ?? GUEST PULSE INTELLIGENCE: Analyze AI/Guest sentiment real-time
    const guestPulse = React.useMemo(() => {
        const todayLogs = chatLogs.filter(l => l.Timestamp?.includes(todayStr));
        const recent = chatLogs.slice(0, 30); // Focus on latest friction
        const stress = recent.reduce((s, log) => {
            const intent = (log.Intent || '').toLowerCase();
            if (intent === 'unrecognized' || intent === 'ai_fallback') return s + 2;
            if (intent === 'human_request' || intent === 'human_handoff') return s + 5;
            return s;
        }, 0);
        const score = recent.length > 0 ? (stress / (recent.length * 2)) * 100 : 0;
        
        if (score > 35) return { color: '#ff4d4d', label: 'URGENT', sub: 'GUESTS NEED HELP', count: todayLogs.length };
        if (score > 15) return { color: '#c49a00', label: 'MONITOR', sub: 'MINOR FRICTION', count: todayLogs.length };
        return { color: '#10b981', label: 'CALM', sub: 'AI HANDLING IT', count: todayLogs.length };
    }, [chatLogs, todayStr]);

    const fetchChatLogs = async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 1600);
        try {
            const response = await fetch(`http://${window.location.hostname}:8101/logs?limit=200`, {
                signal: controller.signal,
            });
            if (!response.ok) return { logs: [] };
            return response.json();
        } catch {
            return { logs: [] };
        } finally {
            window.clearTimeout(timeout);
        }
    };

    const fetchAll = async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const results = await Promise.allSettled([
                api.get('/api/v1/admin/bookings/pending'),
                api.get('/api/v1/admin/ledger'),
                api.get('/api/v1/admin/units'),
                api.get('/api/v1/admin/financials/receivables'),
                api.get('/api/v1/admin/financials/checkouts'),
                api.get('/api/v1/admin/financials/transactions'),
                api.get('/api/v1/admin/special-bookings'),
                // Analytics is optional; do not block bookings when the chatbot monitor is offline.
                fetchChatLogs(),
            ]);

            const safe = (r, key, fallback = []) =>
                r.status === 'fulfilled' ? (r.value[key] ?? fallback) : fallback;

            setPending(safe(results[0], 'pending'));
            setLedger(safe(results[1], 'ledger'));
            setUnits(safe(results[2], 'units'));
            setReceivables(safe(results[3], 'receivables'));
            setCheckouts(safe(results[4], 'checkouts'));
            setTxLog(safe(results[5], 'transactions'));
            setSpecialBookings(safe(results[6], 'special_bookings'));

            setChatLogs(results[7]?.status === 'fulfilled' ? (results[7].value.logs ?? []) : []);

            if (results[1].status !== 'fulfilled') throw new Error('Core Ledger unavailable.');
        } catch (e) {
            setError(`Master Hub Sync Failed: ${e.message}`);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const resetBookingModalState = React.useCallback(() => {
        setCrudModal(null);
        setSelectedBooking(null);
        setEditInitialTab(null);
        setEditWorkflowMode('edit');
        setPrefillRemainingPayment(false);
    }, []);

    const handleBookingModalSaved = React.useCallback(async () => {
        emitBookingSync({ type: 'booking-saved', source: 'admin-dashboard' });
        await fetchAll(true);
        resetBookingModalState();
    }, [fetchAll, resetBookingModalState]);

    useEffect(() => {
        const unsubscribe = subscribeBookingSync(() => {
            fetchAll(true);
        });
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') fetchAll(true);
        };
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);

        return () => {
            unsubscribe();
            window.removeEventListener('focus', refreshWhenVisible);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, []);

    const handleVerify = async (ref, decision) => {
        const notes = prompt(`Enter notes for ${decision}:`);
        if (notes === null) return;
        try {
            const d = await api.post('/api/v1/admin/verify', {
                booking_ref: ref, decision, notes, admin_id: 'Vincent-Admin'
            });
            alert(d.message || `Booking ${decision}ed successfully.`);
            emitBookingSync({ type: 'booking-verified', ref, source: 'admin-dashboard' });
            fetchAll();
        } catch (e) {
            alert(e.message || 'Verification failed.');
        }
    };

    const handleDelete = async (ref) => {
        if (!ref) {
            alert('Delete failed: missing booking reference.');
            return;
        }
        if (!window.confirm(`Permanently delete booking ${ref}?\nThis cannot be undone.`)) return;
        try {
            const d = await api.delete(`/api/v1/admin/bookings/${ref}`);
            setLedger((current) => current.filter((row) => row.booking_ref !== ref));
            resetBookingModalState();
            emitBookingSync({ type: 'booking-deleted', ref, source: 'admin-dashboard' });
            await fetchAll(true);
            alert(d.message);
        } catch (e) {
            alert(e.message || 'Delete failed.');
            throw e;
        }
    };

    const handleSave = async (formData, mode) => {
        try {
            const isEdit = mode === 'edit';
            const url = isEdit ? `/api/v1/admin/bookings/${formData.booking_ref}` : '/api/v1/admin/bookings/manual';
            const payload = { ...formData, admin_id: 'Vincent-Admin' };
            
            const d = isEdit 
                ? await api.patch(url, payload)
                : await api.post(url, payload);

            await fetchAll(true);
            emitBookingSync({ type: 'booking-saved', ref: formData.booking_ref, source: 'admin-dashboard' });
            setCrudModal(null);
        } catch (err) {
            console.error('Save error:', err);
            throw err;
        }
    };

    const previewBulkPastSettlement = async () => {
        setBulkPastSettlementOpen(true);
        setBulkPastSettlementPreview(null);
        setBulkPastSettlementResult(null);
        setBulkPastSettlementConfirm('');
        setBulkPastSettlementError('');
        setBulkPastSettlementLoading(true);
        try {
            const result = await api.post('/api/v1/admin/bulk/past-bookings/settle', {
                dry_run: true,
                checkout: true,
                cutoff_date: todayStr,
                admin_id: 'Vincent-Admin',
            });
            setBulkPastSettlementPreview(result);
        } catch (err) {
            setBulkPastSettlementError(err.message || 'Bulk settlement preview failed.');
        } finally {
            setBulkPastSettlementLoading(false);
        }
    };

    const applyBulkPastSettlement = async () => {
        setBulkPastSettlementError('');
        setBulkPastSettlementLoading(true);
        try {
            const result = await api.post('/api/v1/admin/bulk/past-bookings/settle', {
                dry_run: false,
                checkout: true,
                cutoff_date: bulkPastSettlementPreview?.cutoff_date || todayStr,
                confirm_phrase: bulkPastSettlementConfirm,
                admin_id: 'Vincent-Admin',
            });
            setBulkPastSettlementResult(result);
            setBulkPastSettlementPreview(null);
            setBulkPastSettlementConfirm('');
            emitBookingSync({ type: 'bulk-past-settlement', source: 'admin-dashboard' });
            await fetchAll(true);
        } catch (err) {
            setBulkPastSettlementError(err.message || 'Bulk settlement failed.');
        } finally {
            setBulkPastSettlementLoading(false);
        }
    };



    // -- Shared Helpers --------------------------------------------------------
    const PayBadge = ({ paid, total }) => {
        const isFullyPaid = Number(paid) >= Number(total) && Number(total) > 0;
        return isFullyPaid
            ? <StatusBadge tone="success">Fully Paid</StatusBadge>
            : <StatusBadge tone="warning">Partial</StatusBadge>;
    };

    const daysUntil = (dateStr) => {
        const diff = diffDateOnlyDays(todayStr, dateStr);
        if (diff === 0) return <StatusBadge tone="danger">Today</StatusBadge>;
        if (diff === 1) return <StatusBadge tone="warning">Tomorrow</StatusBadge>;
        return <StatusBadge tone="neutral">In {diff}d</StatusBadge>;
    };

    const txStatusBadge = (status) => {
        const map = {
            VERIFIED: 'success',
            PENDING_VERIFICATION: 'warning',
            REJECTED: 'danger',
        };
        return <StatusBadge tone={map[status] || 'neutral'}>{status}</StatusBadge>;
    };

    const fmtDate = (d) => {
        return formatDateOnlyInManila(d, 'en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    const fmtTs = (d) => {
        return formatDateTimeInManila(d, 'en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const handleStatusChange = async (unitId, newStatus) => {
        try {
            await api.patch(`/api/v1/admin/units/${unitId}/status`, {
                status: newStatus, admin_id: 'Vincent-Admin'
            });
            emitBookingSync({ type: 'unit-status-changed', unitId, status: newStatus, source: 'admin-dashboard' });
            fetchAll();
        } catch (e) {
            alert(e.message || 'Failed to update status.');
        }
    };

    const handleCreateUnitDateTag = async () => {
        if (!unitDateTagDraft?.unit_id) return;
        try {
            await api.post('/api/v1/admin/unit-date-tags', {
                ...unitDateTagDraft,
                admin_id: 'Vincent-Admin',
            });
            setUnitDateTagDraft(null);
            fetchAll(true);
        } catch (e) {
            alert(e.message || 'Failed to add date tag.');
        }
    };

    const handleDeleteUnitDateTag = async (tagId) => {
        try {
            await api.delete(`/api/v1/admin/unit-date-tags/${tagId}`);
            fetchAll(true);
        } catch (e) {
            alert(e.message || 'Failed to remove date tag.');
        }
    };

    const resetImportModal = () => {
        setBulkImportModal(false);
        setImportAnalysis(null);
        setImportFile(null);
        setImportNotice('');
        setImportLoading(false);
    };

    const previewSnapshotImport = async (file) => {
        if (!file) {
            alert('Select a CSV file first.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('admin_id', 'Vincent-Admin');

        setImportLoading(true);
        setImportNotice(`Previewing ${file.name}...`);

        try {
            const result = await api.upload('/api/v1/admin/bookings/snapshot/preview', formData);
            setImportAnalysis(result);
            setImportNotice(`Preview ready for ${result.filename || file.name}.`);
        } catch (err) {
            alert(err.message || 'Failed to analyze CSV.');
            setImportNotice('Preview failed.');
        } finally {
            setImportLoading(false);
        }
    };

    const applySnapshotImport = async () => {
        if (!importFile) {
            alert('Select a CSV file first.');
            return;
        }

        const formData = new FormData();
        formData.append('file', importFile);
        formData.append('admin_id', 'Vincent-Admin');

        setImportLoading(true);
        setImportNotice(`Applying safe rows from ${importFile.name}...`);

        try {
            const result = await api.upload('/api/v1/admin/bookings/snapshot/apply', formData);
            setImportAnalysis(result);
            setImportNotice(`Snapshot import applied. Batch ${result.batch_id}.`);
            alert(`Snapshot import applied. Created ${result.created || 0}, updated ${result.updated || 0}, conflicts ${result.conflicts || 0}.`);
            fetchAll(true);
        } catch (err) {
            alert(err.message || 'Import failed.');
            setImportNotice('Apply failed.');
        } finally {
            setImportLoading(false);
        }
    };

    const getCheckoutTimer = (checkoutDate) => {
        const now = new Date();
        const target = new Date(`${checkoutDate}T12:00:00+08:00`);
        
        const diff = target - now;
        const totalMinutes = Math.floor(diff / 60000);
        const hours = Math.floor(Math.abs(totalMinutes) / 60);
        const minutes = Math.abs(totalMinutes) % 60;
        
        const isPast = diff < 0;
        const color = isPast ? 'var(--accent-red)' : (totalMinutes < 60 ? '#b88a00' : 'var(--accent-emerald)');
        const label = isPast ? 'OVERDUE' : `${hours}h ${minutes}m Left`;
        
        return { label, color, isPast, totalMinutes };
    };

    const unitCategoryOrder = [
        'amalfi-suite',
        'Amalfi Suite',
        'positano-vista',
        'Positano Vista',
        'ravello-suite',
        'Ravello Suite',
        'capri-vista',
        'Capri Vista',
        'sirenuse-suite',
        'Sirenuse Suite',
        'sunset-pavilion',
        'Sunset Pavilion',
    ];
    const unitCategoryLabels = {
        'amalfi-suite': 'Amalfi Suite',
        'positano-vista': 'Positano Vista',
        'ravello-suite': 'Ravello Suite',
        'capri-vista': 'Capri Vista',
        'sirenuse-suite': 'Sirenuse Suite',
        'sunset-pavilion': 'Sunset Pavilion',
    };
    const displayUnitCategory = (category) => unitCategoryLabels[String(category || '').toLowerCase()] || category || 'Other Units';
    const sortUnitCategories = (left, right) => {
        const leftRank = unitCategoryOrder.indexOf(left);
        const rightRank = unitCategoryOrder.indexOf(right);
        return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank) || left.localeCompare(right);
    };
    const categoryForUnit = (unit) => unit.room_type || unit.room_type_id || 'Other Units';
    const unitCategoryOptions = React.useMemo(() => (
        Array.from(new Set(units.map(categoryForUnit))).sort(sortUnitCategories)
    ), [units]);
    React.useEffect(() => {
        if (unitCategoryOptions.length === 0) {
            if (unitCategoryFilter) setUnitCategoryFilter('');
            if (summaryMiniMapCategory) setSummaryMiniMapCategory('');
            return;
        }
        if (!unitCategoryFilter || !unitCategoryOptions.includes(unitCategoryFilter)) {
            setUnitCategoryFilter(unitCategoryOptions[0]);
        }
        if (!summaryMiniMapCategory || !unitCategoryOptions.includes(summaryMiniMapCategory)) {
            setSummaryMiniMapCategory(unitCategoryOptions[0]);
        }
    }, [unitCategoryOptions, unitCategoryFilter, summaryMiniMapCategory]);
    const unitCategoryCounts = units.reduce((acc, unit) => {
        const category = categoryForUnit(unit);
        acc[category] = (acc[category] || 0) + 1;
        return acc;
    }, {});

    if (error) return (
        <div className="flex h-screen flex-col items-center justify-center text-center text-amalfi-coral">
            <div className="mb-5 text-5xl">!</div>
            <h1 className="text-xl font-black">Master Hub Sync Failed</h1>
            <p className="mt-2.5 text-sm opacity-60">{error}</p>
            <Button onClick={fetchAll} className="mt-8 rounded-2xl">Reconnect Protocol</Button>
        </div>
    );

    // Blocking loader ONLY on initial app bootstrap (no data yet)
    if (loading && units.length === 0) return (
        <div className="flex h-screen flex-col items-center justify-center text-center">
            <div className="mb-8 animate-spin text-4xl font-black text-amalfi-gold">SYNC</div>
            <div className="text-xs font-black uppercase tracking-[4px] text-amalfi-muted">Synchronizing Sanctuary...</div>
        </div>
    );

    const totalRevenue = ledger.reduce((s, r) => s + (r.status === 'RESERVED' ? (Number(r.total_price || 0) + Number(r.addon_amount || 0)) : 0), 0);

    // Date-based metrics (Sync with database state)
    const sevenDays     = addDaysToDateOnly(todayStr, 7);
    const threeDays     = addDaysToDateOnly(todayStr, 3);

    const checkedIn     = checkedInBookings;
    const upcoming      = ledger.filter(b => b.status === 'RESERVED' && b.check_in >= todayStr);

    // Arrival/Departure counts for the next window

    // Arrival/Departure counts for the next window
    const arrivingCount = ledger.filter(b => b.status === 'RESERVED' && b.check_in >= todayStr && b.check_in <= sevenDays).length;
    const departingCount = ledger.filter(b => b.status === 'RESERVED' && b.check_out >= todayStr && b.check_out <= threeDays).length;

    const checkedInCount   = checkedIn.length;

    const specialCount      = combinedSpecialBookings.length;
    const unitReadyCount = units.filter(unit => (unit.unit_status || 'Available') === 'Available').length;
    const unitBlockedCount = units.filter(unit => ['Maintenance', 'Cleaning', 'Blocked'].includes(unit.unit_status)).length;
    const summaryHousekeepingUnitCount = units.filter(unit => ['Requires Cleaning', 'Inspection', 'Dirty'].includes(unit.unit_status)).length;
    const receivableBalance = receivables.reduce((sum, row) => {
        const total = Number(row.total_price || 0) + Number(row.addon_amount || 0);
        return sum + Math.max(0, total - Number(row.amount_paid || 0));
    }, 0);
    const summaryPaymentMix = activeBookings.reduce((acc, booking) => {
        const status = String(booking.payment_status || '').toUpperCase();
        if (status.includes('PAID') && !status.includes('UNPAID')) acc.paid += 1;
        else if (status.includes('PARTIAL')) acc.partial += 1;
        else if (status.includes('REFUND')) acc.refunded += 1;
        else acc.unpaid += 1;
        return acc;
    }, { paid: 0, partial: 0, unpaid: 0, refunded: 0 });
    const summaryPaymentTotal = Math.max(1, activeBookings.length);
    const summaryCategoryLeaders = Object.entries(unitCategoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const summaryCommandMetrics = [
        { label: 'Booked revenue', value: `PHP ${totalRevenue.toLocaleString()}`, note: 'Reserved ledger value', tone: 'green' },
        { label: 'Receivables', value: `PHP ${receivableBalance.toLocaleString()}`, note: 'Open verified balance', tone: 'gold' },
    ];
    const summaryCards = [
        { label: 'Pending verification', value: pending.length, note: 'Receipts awaiting approval', tone: 'gold' },
        { label: 'Active bookings', value: activeBookings.length, note: 'Open reservations in the ledger', tone: 'green' },
        { label: 'Today arrivals', value: arrivals.length, note: 'Guests expected for check-in', tone: 'blue' },
        { label: 'Payment follow-up', value: paymentDueBookings.length, note: 'Bookings with balances to settle', tone: 'red' },
    ];
    const summaryActions = [
        { label: 'Review payment verifications', value: pending.length, target: 'pending' },
        { label: 'Open central ledger', value: activeBookings.length, target: 'ledger' },
        { label: 'Check room map', value: `${unitReadyCount}/${units.length || 0}`, target: 'map' },
        { label: 'Review special bookings', value: specialCount, target: 'special' },
    ];
    const summaryOccupancyRate = units.length ? Math.round((checkedInCount / units.length) * 100) : 0;
    const summaryRecentBookings = activeBookings.slice(0, 5);
    const summaryTasks = [
        {
            label: pending.length ? 'Review payment verification' : 'Payment verifications are clear',
            count: pending.length,
            done: pending.length === 0,
            target: 'pending',
        },
        {
            label: paymentDueBookings.length ? 'Follow up open balances' : 'No urgent balance follow-ups',
            count: paymentDueBookings.length,
            done: paymentDueBookings.length === 0,
            target: 'ledger',
        },
        {
            label: arrivals.length ? 'Prepare arrivals for check-in' : 'No arrivals need check-in prep',
            count: arrivals.length,
            done: arrivals.length === 0,
            target: 'ledger',
        },
        {
            label: unitBlockedCount ? 'Check blocked or turnover units' : 'Unit readiness looks clear',
            count: unitBlockedCount,
            done: unitBlockedCount === 0,
            target: 'map',
        },
        {
            label: upcomingAudit.length ? 'Confirm tomorrow arrivals' : 'Tomorrow arrivals are covered',
            count: upcomingAudit.length,
            done: upcomingAudit.length === 0,
            target: 'ledger',
        },
        {
            label: summaryHousekeepingUnitCount ? 'Review housekeeping queue' : 'Housekeeping queue is clear',
            count: summaryHousekeepingUnitCount,
            done: summaryHousekeepingUnitCount === 0,
            target: 'units',
        },
    ];
    const summaryTaskDoneCount = summaryTasks.filter(task => task.done).length;
    const summaryTaskCompletion = Math.round((summaryTaskDoneCount / Math.max(1, summaryTasks.length)) * 100);
    const occupancyHeightClass = (height) => {
        if (height >= 70) return 'h-[70%]';
        if (height >= 62) return 'h-[62%]';
        if (height >= 54) return 'h-[54%]';
        if (height >= 48) return 'h-[48%]';
        if (height >= 42) return 'h-[42%]';
        if (height >= 30) return 'h-[30%]';
        return 'h-[18%]';
    };


    // Source badge helper
    const SourceBadge = ({ row }) => {
        const isAdmin = row.created_by === 'admin';
        return (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[0.55rem] font-black uppercase ${isAdmin ? 'border-black/5 bg-black/5 text-amalfi-muted' : 'border-amalfi-emerald/10 bg-amalfi-emerald/10 text-amalfi-emerald'}`}>
                {isAdmin ? 'ADMIN' : 'WEB'} {isAdmin ? `Admin | ${row.booking_source || 'Walk-in'}` : `Web | ${row.booking_source || 'Direct'}`}
            </span>
        );
    };

    const LEDGER_TAB_GROUPS = [
        {
            label: 'Current Work',
            tabs: [
                { id: 'all', label: 'Active Ledger', shortLabel: 'Active', count: activeBookings.length, bg: 'rgba(9,9,11,0.04)', text: 'var(--text-primary)', active: 'var(--text-primary)', description: 'Master register of open bookings. Use Edit for contract changes and Delete only for intentional entry removal.' },
                { id: 'payments', label: 'Payments Due', shortLabel: 'Payments Due', count: paymentDueBookings.length, bg: 'rgba(244,63,94,0.06)', text: 'var(--accent-red)', active: 'var(--accent-red)', description: 'Open reserved and checked-in bookings with a remaining verified balance. Use Record Pay to open the money workflow.' },
            ],
        },
        {
            label: 'Stay Movement',
            tabs: [
                { id: 'upcoming', label: 'Upcoming Bookings', shortLabel: 'Upcoming Bookings', count: upcomingAudit.length, bg: 'rgba(59,130,246,0.06)', text: 'var(--accent-blue)', active: 'var(--accent-blue)', description: "Tomorrow's arrivals grouped with today's check-in/check-out operations. Rebook, unit changes, and payments all happen through Edit." },
                { id: 'arrivals', label: "Today's Check Ins", shortLabel: 'Check Ins', count: arrivals.length, bg: 'rgba(217,119,6,0.06)', text: 'var(--accent-gold)', active: 'var(--accent-gold)', description: "Today's arrivals, including guests already checked in. Check In opens the payment workflow and requires settlement before status moves." },
                { id: 'departures', label: "Today's Check Outs", shortLabel: 'Check Outs', count: todaysCheckouts.length, bg: 'rgba(5,150,105,0.06)', text: 'var(--accent-emerald)', active: 'var(--accent-emerald)', description: "Today's checked-in departures. Check Out closes only after total balance is settled." },
            ],
        },
        {
            label: 'Records',
            tabs: [
                { id: 'txlog', label: 'Transaction Log', shortLabel: 'Transaction Log', count: txLog.length, bg: 'rgba(15,23,42,0.04)', text: 'var(--sidebar-muted)', active: 'var(--sidebar-muted)', description: 'View-only payment journal for collections, adjustments, refunds, and manual entries.' },
            ],
        },
        {
            label: 'Archive',
            tabs: [
                { id: 'past', label: 'Past Bookings', shortLabel: 'Past Bookings', count: pastBookings.length, bg: 'rgba(100,116,139,0.06)', text: 'var(--text-muted)', active: 'var(--text-muted)', description: 'Closed stays with checkout dates before today.' },
            ],
        },
    ];
    const LEDGER_TABS = LEDGER_TAB_GROUPS.flatMap(group => group.tabs);

    const activeLedgerTabMeta = LEDGER_TABS.find(tab => tab.id === ledgerTab) || LEDGER_TABS[0];
    const activeLedgerRecordCount = {
        all: ledgerSort.sorted.length,
        payments: paymentsSort.sorted.length,
        upcoming: upcomingSort.sorted.length,
        arrivals: arrivalsSort.sorted.length,
        departures: departuresSort.sorted.length,
        past: pastSort.sorted.length,
        txlog: txLogSort.sorted.length,
    }[ledgerTab] ?? filteredLedger.length;
    const activeLedgerFilters = [
        globalSearch ? `Search: ${globalSearch}` : null,
        ['all', 'payments'].includes(ledgerTab) && ledgerDateWindow.from ? `Check in from: ${ledgerDateWindow.from}` : null,
        ['all', 'payments'].includes(ledgerTab) && ledgerDateWindow.to ? `Check out by: ${ledgerDateWindow.to}` : null,
    ].filter(Boolean);
    const showLedgerDateSlicer = ['all', 'payments'].includes(ledgerTab);
    const setLedgerDatePreset = (preset) => {
        if (preset === 'today') {
            setLedgerDateWindow({ from: todayStr, to: todayStr });
            return;
        }
        if (preset === 'next7') {
            setLedgerDateWindow({ from: todayStr, to: addDaysToDateOnly(todayStr, 7) });
            return;
        }
        setLedgerDateWindow({ from: '', to: '' });
    };
    const customerServices = [
        {
            key: 'is_portal_enabled',
            label: 'Guest Hub',
            Icon: Globe,
            description: 'Public booking site',
        },
        {
            key: 'is_bot_enabled',
            label: 'Chatbot',
            Icon: Bot,
            description: 'Messenger replies',
        },
        {
            key: 'is_admin_desk_enabled',
            label: 'Admin Desk',
            Icon: BriefcaseBusiness,
            description: 'Mobile booking tool',
        },
        {
            key: 'is_holiday_minimum_stay_enabled',
            label: 'Holiday Rule',
            Icon: Calendar,
            description: '2-day holiday minimum',
        },
    ];
    const UNIT_STATUS_OPTIONS = [
        {
            value: 'Available',
            label: 'Available',
            short: 'Available',
            description: 'Bookable inventory',
            Icon: CheckCircle2,
            tone: '#047857',
            bg: 'rgba(5,150,105,0.10)',
            border: 'rgba(5,150,105,0.22)',
            rowBg: '#fbfffc',
            blocksBooking: false,
        },
        {
            value: 'Requires Cleaning',
            label: 'Requires Cleaning',
            short: 'Cleaning',
            description: 'Housekeeping queue',
            Icon: Sparkles,
            tone: '#0369a1',
            bg: 'rgba(14,165,233,0.10)',
            border: 'rgba(14,165,233,0.22)',
            rowBg: '#f7fcff',
            blocksBooking: false,
        },
        {
            value: 'On Demand',
            label: 'On Demand',
            short: 'On Demand',
            description: 'Use only when manually assigned',
            Icon: Clock3,
            tone: '#7c3aed',
            bg: 'rgba(124,58,237,0.10)',
            border: 'rgba(124,58,237,0.20)',
            rowBg: '#fbf8ff',
            blocksBooking: false,
        },
        {
            value: 'Maintenance',
            label: 'Maintenance',
            short: 'Blocked',
            description: 'Blocked from booking engine',
            Icon: Wrench,
            tone: '#be123c',
            bg: 'rgba(225,29,72,0.10)',
            border: 'rgba(225,29,72,0.22)',
            rowBg: '#fff8fa',
            blocksBooking: true,
        },
        {
            value: 'Inspection',
            label: 'Inspection',
            short: 'Inspection',
            description: 'Needs manager check',
            Icon: ShieldAlert,
            tone: '#b45309',
            bg: 'rgba(245,158,11,0.12)',
            border: 'rgba(245,158,11,0.24)',
            rowBg: '#fffdf7',
            blocksBooking: false,
        },
        {
            value: 'Checked In',
            label: 'Checked In',
            short: 'Checked In',
            description: 'Guest checked in',
            Icon: BedDouble,
            tone: '#92400e',
            bg: 'rgba(181,150,101,0.12)',
            border: 'rgba(181,150,101,0.24)',
            rowBg: '#fffdf8',
            blocksBooking: false,
        },
        {
            value: 'Reserved',
            label: 'Reserved',
            short: 'Reserved',
            description: 'Held by booking flow',
            Icon: Calendar,
            tone: '#1d4ed8',
            bg: 'rgba(59,130,246,0.10)',
            border: 'rgba(59,130,246,0.22)',
            rowBg: '#f8fbff',
            blocksBooking: false,
        },
        {
            value: 'Dirty',
            label: 'Dirty',
            short: 'Dirty',
            description: 'Legacy cleaning tag',
            Icon: Sparkles,
            tone: '#0369a1',
            bg: 'rgba(14,165,233,0.10)',
            border: 'rgba(14,165,233,0.22)',
            rowBg: '#f7fcff',
            blocksBooking: false,
        },
        {
            value: 'Hold',
            label: 'Hold',
            short: 'Hold',
            description: 'Temporary ops hold',
            Icon: AlertTriangle,
            tone: '#475569',
            bg: 'rgba(100,116,139,0.10)',
            border: 'rgba(100,116,139,0.22)',
            rowBg: '#fbfcfd',
            blocksBooking: false,
        },
    ];
    const UNIT_DATE_TAG_OPTIONS = [
        { value: 'High Demand', label: 'High Demand', blocks: false, tone: '#b45309' },
        { value: 'Rate Watch', label: 'Rate Watch', blocks: false, tone: '#7c3aed' },
        { value: 'VIP Hold', label: 'VIP Hold', blocks: false, tone: '#1d4ed8' },
        { value: 'Deep Cleaning', label: 'Deep Cleaning', blocks: true, tone: '#0369a1' },
        { value: 'Owner Hold', label: 'Owner Hold', blocks: true, tone: '#475569' },
        { value: 'Maintenance Window', label: 'Maintenance Window', blocks: true, tone: '#be123c' },
    ];
    const unitStatusMeta = (status) => (
        UNIT_STATUS_OPTIONS.find(option => option.value === (status || 'Available')) || UNIT_STATUS_OPTIONS[0]
    );
    const effectiveUnitStatus = (unit) => (
        unit?.active_booking?.status === 'UNIT_BLOCKED' ? 'Maintenance' : (unit?.unit_status || 'Available')
    );
    const unitStatusCounts = UNIT_STATUS_OPTIONS.reduce((acc, option) => {
        acc[option.value] = units.filter(unit => effectiveUnitStatus(unit) === option.value).length;
        return acc;
    }, {});
    const UNIT_HUB_FILTERS = UNIT_STATUS_OPTIONS.filter(option =>
        ['Available', 'Requires Cleaning', 'Inspection', 'Maintenance'].includes(option.value)
    );
    const UNIT_HUB_TOGGLES = UNIT_HUB_FILTERS;
    const blockedUnitCount = unitStatusCounts.Maintenance || 0;
    const housekeepingUnitCount = (unitStatusCounts['Requires Cleaning'] || 0) + (unitStatusCounts.Inspection || 0);
    const availableUnitCount = unitStatusCounts.Available || 0;
    const filteredUnits = units.filter((unit) => {
        const status = effectiveUnitStatus(unit);
        const category = categoryForUnit(unit);
        const query = unitSearch.trim().toLowerCase();
        const matchesCategory = !unitCategoryFilter || category === unitCategoryFilter;
        const matchesStatus = unitStatusFilter === 'all' || status === unitStatusFilter;
        const matchesQuery = !query || [
            unit.unit_id,
            unit.unit_label,
            unit.room_type,
            unit.room_type_id,
            displayUnitCategory(category),
            status,
        ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
        return matchesCategory && matchesStatus && matchesQuery;
    });
    const unitCategoryGroups = Object.entries(filteredUnits.reduce((acc, unit) => {
        const category = categoryForUnit(unit);
        if (!acc[category]) acc[category] = [];
        acc[category].push(unit);
        return acc;
    }, {})).sort(([left], [right]) => sortUnitCategories(left, right));
    const summaryMiniMapDays = Array.from({ length: 15 }, (_, index) => addDaysToDateOnly(todayStr, index));
    const summaryMiniMapSelectedCategory = unitCategoryOptions.includes(summaryMiniMapCategory)
        ? summaryMiniMapCategory
        : (unitCategoryOptions[0] || '');
    const summaryMiniMapAllUnits = units.filter((unit) => categoryForUnit(unit) === summaryMiniMapSelectedCategory);
    const summaryMiniMapUnits = summaryMiniMapAllUnits.slice(0, 6);
    const summaryMiniMapOverflowCount = Math.max(0, summaryMiniMapAllUnits.length - summaryMiniMapUnits.length);
    const summaryMiniMapBookingForUnitDay = (unitId, dayKey) => activeBookings.find((booking) => (
        String(booking.unit_id || '') === String(unitId || '')
        && String(booking.check_in || '') <= dayKey
        && String(booking.check_out || '') > dayKey
    ));
    const nextActionLabel = (status) => {
        if (status === 'Maintenance') return 'Repair before release';
        if (status === 'Requires Cleaning') return 'Assign housekeeping';
        if (status === 'Inspection') return 'Manager inspection';
        if (status === 'On Demand') return 'Manual assignment only';
        if (status === 'Hold') return 'Review hold reason';
        if (status === 'Checked In') return 'Follow checkout flow';
        if (status === 'Reserved') return 'Protected by booking';
        if (status === 'Dirty') return 'Clean and reset';
        return 'Ready for booking';
    };
    const openUnitDateTagDraft = (unit, tagType = 'High Demand') => {
        const option = UNIT_DATE_TAG_OPTIONS.find(item => item.value === tagType) || UNIT_DATE_TAG_OPTIONS[0];
        const start = todayStr;
        setUnitDateTagDraft({
            unit_id: unit.unit_id,
            unit_label: unit.unit_label || unit.unit_id,
            tag_type: option.value,
            start_date: start,
            end_date: addDaysToDateOnly(start, 1),
            blocks_inventory: option.blocks,
            note: '',
        });
    };
    const activeDateTags = (unit) => Array.isArray(unit.date_tags) ? unit.date_tags.slice(0, 3) : [];
    const readinessActionLabel = (unit, option) => {
        const current = unit?.unit_status || 'Available';
        if (option.value === 'Available' && current === 'Maintenance') return 'Return';
        if (option.value === 'Available') return 'Ready';
        if (option.value === 'Requires Cleaning') return 'Clean';
        if (option.value === 'Inspection') return 'Inspect';
        if (option.value === 'Maintenance') return 'Maintenance';
        return option.short;
    };
    const readinessActionTitle = (unit, option) => {
        const current = unit?.unit_status || 'Available';
        if (option.value === 'Available' && current === 'Maintenance') return 'Return this unit to Available';
        if (option.value === 'Available') return 'Mark this unit Available';
        if (option.value === 'Requires Cleaning') return 'Move this unit to the housekeeping queue';
        if (option.value === 'Inspection') return 'Send this unit for manager inspection';
        if (option.value === 'Maintenance') return 'Put this unit on Maintenance';
        return option.description;
    };

    return (
        <AppShell
            themeMode={themeMode}
            header={
                <Header
                    services={customerServices}
                    serviceSwitches={serviceSwitches}
                    serviceBusyKey={serviceBusyKey}
                    onToggleService={toggleCustomerService}
                    onNotificationsClick={() => setActiveTab('pending')}
                    pendingCount={pending.length}
                    currentTime={currentTime}
                />
            }
            sidebar={
                <Sidebar
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    pendingCount={pending.length}
                    specialCount={combinedSpecialBookings.filter(b => b.status === 'PENDING_VERIFICATION').length}
                />
            }
        >
                    {activeTab === 'summary' && (
                        <PageContainer className="flex flex-col gap-4">
                            <PageHeader
                                eyebrow="AS"
                                title="Admin Summary"
                                description="A shift-ready view of bookings, balances, room readiness, and the next tasks that need attention."
                                imageSrc="/assets/page-headers/summary-lagoon.svg"
                                imageClassName="object-[center_58%]"
                                action={
                                  <Button
                                    type="button"
                                    onClick={openManualBooking}
                                    className="h-10 rounded-2xl bg-[#0a6b5f] px-4 text-[0.68rem] font-black tracking-normal text-[#fff8e8] shadow-[0_14px_28px_rgba(10,107,95,0.18)] transition hover:-translate-y-0.5 hover:bg-[#08443f]"
                                  >
                                    New Booking
                                  </Button>
                                }
                            />

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                                <div className="grid content-start gap-4 xl:col-span-8">
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] relative overflow-hidden rounded-[24px]">
                                            <CardContent className="p-3">
                                                <div className="mb-2 flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <h2 className="m-0 font-resortDisplay text-[1rem] font-extrabold tracking-normal text-[#13211f]">Occupancy Pulse</h2>
                                                        <p className="mt-0.5 text-[0.58rem] font-black uppercase leading-4 tracking-[0.12em] text-[#0a6b5f]">
                                                            {summaryOccupancyRate}% occupied / {units.length || 0} mapped units
                                                        </p>
                                                    </div>
                                                    <Badge variant="secondary" className="rounded-full border border-[#d8c9b3]/70 bg-[#f7eedf] px-2 py-0.5 text-[0.58rem] font-black tracking-normal text-[#13211f]">
                                                        Today / Live
                                                    </Badge>
                                                </div>
                                                <div className="flex h-20 items-end gap-1.5 rounded-[18px] bg-[#f7eedf]/45 px-3 pb-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                                    {[42, 54, 48, Math.max(18, summaryOccupancyRate), 62, 70, 52].map((height, index) => (
                                                        <div key={index} className="flex h-full flex-1 items-end">
                                                            <span className={cn('block w-full rounded-t-xl transition-all', occupancyHeightClass(height), index === 3 ? 'bg-[#0a6b5f] shadow-[0_14px_28px_rgba(10,107,95,0.22)]' : 'bg-[#d8c9b3]')} />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                                                    {[
                                                        ['Checked in', checkedInCount],
                                                        ['Arrivals', arrivals.length],
                                                        ['Departures', todaysCheckouts.length],
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="rounded-[16px] bg-[#f7eedf]/48 px-2 py-1">
                                                            <span className="block text-sm font-black text-[#13211f]">{value}</span>
                                                            <small className="text-[0.54rem] font-black uppercase tracking-normal text-[#69776f]">{label}</small>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                                            <CardContent className="p-3">
                                                <div className="mb-2 flex items-start justify-between gap-3">
                                                    <div>
                                                        <h3 className="m-0 font-resortDisplay text-[1rem] font-black tracking-normal text-[#13211f]">Booking Health</h3>
                                                        <p className="m-0 text-[0.62rem] font-semibold text-[#69776f]">Payment mix across active bookings.</p>
                                                    </div>
                                                    <StatusBadge tone="success">{activeBookings.length} open</StatusBadge>
                                                </div>
                                                <div className="grid gap-1.5">
                                                    {[
                                                        ['Paid', summaryPaymentMix.paid, 'text-[#0a6b5f]', '[&::-moz-progress-bar]:bg-[#0a6b5f] [&::-webkit-progress-value]:bg-[#0a6b5f]'],
                                                        ['Partial', summaryPaymentMix.partial, 'text-[#c6923f]', '[&::-moz-progress-bar]:bg-[#c6923f] [&::-webkit-progress-value]:bg-[#c6923f]'],
                                                        ['Unpaid', summaryPaymentMix.unpaid, 'text-[#c84a4a]', '[&::-moz-progress-bar]:bg-[#c84a4a] [&::-webkit-progress-value]:bg-[#c84a4a]'],
                                                        ['Refunded', summaryPaymentMix.refunded, 'text-sky-500', '[&::-moz-progress-bar]:bg-sky-500 [&::-webkit-progress-value]:bg-sky-500'],
                                                    ].map(([label, value, textClass, barClass]) => (
                                                        <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)_28px] items-center gap-2 text-[0.64rem] font-black">
                                                            <span className={textClass}>{label}</span>
                                                            <progress className={cn('h-2 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#eee2cf] [&::-webkit-progress-value]:rounded-full', barClass)} value={value} max={summaryPaymentTotal} aria-label={`${label} payment mix`} />
                                                            <span className="text-right text-amalfi-muted">{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-2 grid grid-cols-2 gap-2">
                                                    {summaryCommandMetrics.map((metric) => (
                                                        <div key={metric.label} className="border border-[rgba(189,169,130,0.86)] bg-[#fffdf8]/[0.82] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] rounded-[16px] px-3 py-2">
                                                            <span className="block truncate text-[0.56rem] font-black uppercase tracking-[0.1em] text-[#69776f]">{metric.label}</span>
                                                            <strong className="mt-0.5 block truncate font-resortDisplay text-[0.86rem] font-black tracking-normal text-[#13211f]">{metric.value}</strong>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                                        <CardHeader className="flex flex-col items-start justify-between gap-2 border-b border-[#e5d8c4]/80 px-4 py-3 sm:flex-row sm:items-center">
                                            <div className="min-w-0">
                                                <CardTitle className="font-resortDisplay text-[1rem] font-black tracking-normal text-[#13211f]">Recent Bookings</CardTitle>
                                                <CardDescription className="text-[0.68rem] font-semibold text-[#69776f]">Latest open records from the active ledger.</CardDescription>
                                            </div>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setActiveTab('ledger')} className="h-8 text-[0.62rem] font-black tracking-normal text-[#0a6b5f] hover:text-[#092a28]">View all</Button>
                                        </CardHeader>
                                        <div className="divide-y divide-black/5">
                                            {summaryRecentBookings.length === 0 ? (
                                                <EmptyState title="No active bookings" description="Active booking records will appear here once the ledger loads." className="border-0 bg-transparent shadow-none" />
                                            ) : summaryRecentBookings.map((booking) => {
                                                const guestName = booking.full_name || booking.guest_name || 'Guest';
                                                const amount = Number(booking.total_price || 0) + Number(booking.addon_amount || 0);
                                                return (
                                                    <button key={booking.booking_ref} type="button" onClick={() => openBookingSummary(booking)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-0 bg-transparent px-4 py-2 text-left transition hover:bg-[#f7eedf]/70 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                                                        <span className="min-w-0">
                                                            <strong className="block truncate text-[0.78rem] font-black text-[#13211f]">{guestName}</strong>
                                                            <small className="block truncate text-[0.62rem] font-semibold text-[#69776f]">{booking.unit_label || booking.unit_id || booking.unit_summary || 'No unit assigned'}</small>
                                                        </span>
                                                        <StatusBadge tone="success" className="hidden md:inline-flex">{paymentStatusLabel(booking.payment_status || booking.status)}</StatusBadge>
                                                        <b className="text-right text-[0.76rem] font-black text-[#13211f]">PHP {amount.toLocaleString()}</b>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </Card>

                                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[24px]">
                                        <CardHeader className="border-b border-[#e5d8c4]/80 px-4 py-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <CardTitle className="font-resortDisplay text-[1rem] font-black tracking-normal text-[#13211f]">Sanctuary Quick View</CardTitle>
                                                    <CardDescription className="text-[0.64rem] font-semibold text-[#69776f]">15-day glance for the selected unit type.</CardDescription>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Select value={summaryMiniMapSelectedCategory} onValueChange={setSummaryMiniMapCategory} disabled={unitCategoryOptions.length === 0}>
                                                        <SelectTrigger className="h-8 w-[170px] rounded-xl border-[#d7c2a4] bg-[#fffaf1] px-3 text-[0.62rem] font-black text-[#13211f] shadow-none">
                                                            <SelectValue placeholder="Unit type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectGroup>
                                                                {unitCategoryOptions.map((category) => (
                                                                    <SelectItem key={category} value={category}>
                                                                        {displayUnitCategory(category)} ({unitCategoryCounts[category] || 0})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectGroup>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => setActiveTab('map')} className="h-8 text-[0.62rem] font-black text-[#0a6b5f]">Open</Button>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="overflow-x-auto p-0">
                                            <div className="min-w-[640px]">
                                                <div className="grid grid-cols-[126px_repeat(15,minmax(24px,1fr))] border-b border-[#eadfcd] bg-[#fff9ef] px-3 py-1.5 text-[0.5rem] font-black uppercase tracking-[0.12em] text-[#69776f]">
                                                    <span>Unit</span>
                                                    {summaryMiniMapDays.map((dayKey) => <span key={dayKey} className="text-center">{dayKey.slice(8)}</span>)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 bg-[#fffaf1] px-3 py-1.5">
                                                        <span className="rounded-full bg-[#c6923f] px-2.5 py-1 text-[0.48rem] font-black uppercase tracking-[0.16em] text-white">{displayUnitCategory(summaryMiniMapSelectedCategory)}</span>
                                                        <span className="h-px flex-1 bg-[#d8c9b3]/80" />
                                                        <span className="shrink-0 text-[0.5rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">
                                                            {summaryMiniMapUnits.length} shown{summaryMiniMapOverflowCount ? `, ${summaryMiniMapOverflowCount} more` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="divide-y divide-[#f0e5d5]">
                                                        {summaryMiniMapUnits.length === 0 ? (
                                                            <div className="px-3 py-5 text-center text-[0.68rem] font-semibold text-[#69776f]">No units in this type yet.</div>
                                                        ) : summaryMiniMapUnits.map((unit) => (
                                                            <div key={unit.unit_id} className="grid grid-cols-[126px_repeat(15,minmax(24px,1fr))] items-center gap-1 px-3 py-1">
                                                                <span className="truncate text-[0.58rem] font-black text-[#13211f]">{unit.unit_label || unit.unit_id}</span>
                                                                {summaryMiniMapDays.map((dayKey) => {
                                                                    const hit = summaryMiniMapBookingForUnitDay(unit.unit_id, dayKey);
                                                                    const blocked = effectiveUnitStatus(unit) === 'Maintenance';
                                                                    return <span key={`${unit.unit_id}-${dayKey}`} title={hit?.booking_ref || (blocked ? 'Blocked' : 'Open')} className={cn('h-[18px] rounded-md border border-white/80', hit ? 'bg-[#dbeafe] shadow-[0_4px_10px_rgba(37,99,235,0.12)]' : blocked ? 'bg-[#fde2e2]' : 'bg-[#edf7f3]')} />;
                                                                })}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="grid content-start gap-3 xl:col-span-4">
                                    <section className="grid content-start gap-2">
                                        {summaryCards.map((card) => (
                                            <Button key={card.label} type="button" variant="outline" onClick={() => setActiveTab(card.tone === 'gold' ? 'pending' : 'ledger')} className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] grid h-11 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-[18px] px-3 py-1 text-left transition hover:-translate-y-0.5 hover:border-[#c6923f] hover:bg-white">
                                                <span className={cn('flex size-7 items-center justify-center rounded-xl text-[0.72rem] font-black', card.tone === 'gold' ? 'bg-amber-50 text-[#c6923f]' : card.tone === 'blue' ? 'bg-sky-50 text-[#236f7c]' : card.tone === 'red' ? 'bg-red-50 text-[#c84a4a]' : 'bg-emerald-50 text-[#0a6b5f]')}>{card.value}</span>
                                                <span className="min-w-0">
                                                    <strong className="block truncate text-[0.72rem] font-black text-[#13211f]">{card.label}</strong>
                                                    <small className="block truncate text-[0.58rem] font-semibold leading-3 text-[#69776f]">{card.note}</small>
                                                </span>
                                            </Button>
                                        ))}
                                    </section>

                                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[22px]">
                                        <CardContent className="p-3">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="m-0 font-resortDisplay text-[0.92rem] font-black tracking-normal text-[#13211f]">Tasks for Today</h3>
                                                    <p className="m-0 text-[0.6rem] font-semibold text-[#69776f]">Compact follow-up queue.</p>
                                                </div>
                                                <span className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-1 text-center">
                                                    <strong className="block text-[0.74rem] font-black leading-none text-[#13211f]">{summaryTaskCompletion}%</strong>
                                                    <small className="block text-[0.5rem] font-black uppercase leading-none text-[#69776f]">done</small>
                                                </span>
                                            </div>
                                            <progress className="mb-2 h-1.5 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[#c6923f] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#eee2cf] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#c6923f]" value={summaryTaskCompletion} max={100} aria-label="Task completion" />
                                            <div className="grid gap-1.5">
                                                {summaryTasks.map((task) => (
                                                    <button key={task.label} type="button" onClick={() => setActiveTab(task.target)} className="border border-[rgba(189,169,130,0.86)] bg-[#fffdf8]/[0.82] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] grid h-8 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] px-2.5 text-left transition hover:border-[#0a6b5f]/45 hover:bg-[#f7eedf]/70">
                                                        <span className={cn('flex size-4 items-center justify-center rounded-md border text-[0.52rem] font-black', task.done ? 'border-[#0a6b5f] bg-[#0a6b5f] text-white' : 'border-black/15 bg-white text-transparent')}>?</span>
                                                        <strong className={cn('min-w-0 truncate text-[0.66rem] font-bold', task.done ? 'text-[#69776f] line-through' : 'text-[#13211f]')}>{task.label}</strong>
                                                        {!task.done && task.count > 0 && <span className="rounded-full bg-[#f5ead7] px-1.5 py-0.5 text-[0.56rem] font-black text-[#9a6223]">{task.count}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                                        <CardHeader className="px-4 pb-2 pt-3">
                                            <CardTitle className="font-resortDisplay text-[1rem] font-black tracking-normal text-[#13211f]">Room Demand</CardTitle>
                                            <CardDescription className="text-[0.68rem] font-semibold text-[#69776f]">Unit mix available in the sanctuary map.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-2 px-4 pb-4 pt-0">
                                            {summaryCategoryLeaders.length === 0 ? (
                                                <EmptyState title="No unit categories" description="Unit category data will appear once the sanctuary map loads." className="border-0 bg-transparent shadow-none" />
                                            ) : summaryCategoryLeaders.map(([label, count]) => (
                                                <div key={label}>
                                                    <div className="mb-1 flex items-center justify-between gap-3 text-[0.68rem] font-bold">
                                                        <span className="truncate text-[#13211f]">{label}</span>
                                                        <span className="text-[#69776f]">{count}</span>
                                                    </div>
                                                    <progress className="h-2 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[#236f7c] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#eee2cf] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#236f7c]" value={Math.max(12, (count / Math.max(1, units.length)) * 100)} max={100} aria-label={`${label} demand`} />
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>                        </PageContainer>
                    )}

                    {/* --------------------------- PENDING + RECEIVABLES --------------------------- */}
                    {activeTab === 'pending' && (() => {
                        const selectedItem = pendingSort.sorted.find(i => i.booking_ref === selectedPendingRef) || pendingSort.sorted[0] || null;
                        return (
                        <PageContainer className="flex flex-col gap-5" ref={refPending}>
                            <PageHeader
                                eyebrow="PV"
                                title="Payment Verifications"
                                description="Review guest receipts, confirm posted payments, and clear the approval queue without changing the existing booking workflow."
                                imageSrc="/assets/page-headers/verifications-receipts.svg"
                                imageClassName="object-[center_52%]"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <h2 className="m-0 font-resortDisplay text-[1.35rem] font-semibold text-amalfi-ink">Active Verifications</h2>
                                <ExportBtn onClick={() => exportToPng(refPending, 'Pending Verifications')} />
                            </div>

                            {pendingSort.sorted.length === 0 ? (
                                <EmptyState
                                    title="All verifications are clear"
                                    description="No pending receipts need review right now."
                                    className="min-h-[320px] justify-center"
                                />
                            ) : (
                                <div className="flex h-[calc(100vh-280px)] gap-4 pb-10">
                                    {/* --- LEFT PANEL: Scrollable Entry List --- */}
                                    <div className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] flex basis-[38%] flex-col gap-2 overflow-y-auto rounded-[24px] p-3">
                                        {pendingSort.sorted.map((item) => {
                                            const paid    = Number(item.amount_paid || item.trans_amount || 0);
                                            const total   = Number(item.total_price || 0);
                                            const balance = Math.max(0, total - paid);
                                            const isFullPay = total > 0 && paid >= total;
                                            const bt = item.booking_type || 'overnight';
                                            const typeLabel = bt === 'day_tour' ? 'Day Tour'
                                                            : bt === 'tent_pitching' ? 'Tent'
                                                            : `${item.room_type || 'Room'}`;
                                            const isActive = selectedItem?.booking_ref === item.booking_ref;
                                            return (
                                                <Card key={item.booking_ref}
                                                    className={`cursor-pointer rounded-[18px] border-0 p-0 shadow-none transition ${isActive ? 'bg-[#e7f5ef] shadow-[inset_4px_0_0_#0a6b5f]' : 'bg-[#f7eedf]/42 hover:bg-[#f7eedf]/70'}`}
                                                    onClick={() => setSelectedPendingRef(item.booking_ref)}
                                                >
                                                  <CardContent className="p-4">
                                                    {/* Row 1: Name + Badges */}
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-[0.82rem] font-black text-amalfi-ink">{item.full_name}</span>
                                                        <StatusBadge tone="warning" className="rounded-md px-2 py-0 text-[0.5rem]">{typeLabel}</StatusBadge>
                                                        <StatusBadge tone={isFullPay ? 'success' : 'warning'} className="rounded-md px-2 py-0 text-[0.5rem]">
                                                            {isFullPay ? 'Full' : 'Partial'}
                                                        </StatusBadge>
                                                    </div>
                                                    {/* Row 2: Ref + Stay + Financials */}
                                                    <div className="flex items-center gap-2 text-[0.68rem] font-semibold text-amalfi-muted">
                                                        <span className="text-[0.62rem] font-black text-amalfi-muted">{item.booking_ref}</span>
                                                        <span className="opacity-30">|</span>
                                                        <span>{fmtDate(item.check_in)} - {fmtDate(item.check_out)}</span>
                                                    </div>
                                                    {/* Row 3: Financial + Timestamp */}
                                                    <div className="mt-2 flex items-center justify-between gap-3">
                                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem]">
                                                            <span className="font-black text-amalfi-ink">PHP {total.toLocaleString()}</span>
                                                            <span className="font-bold text-amalfi-emerald">Paid PHP {paid.toLocaleString()}</span>
                                                            {balance > 0 && <span className="font-black text-amalfi-coral">Bal PHP {balance.toLocaleString()}</span>}
                                                        </div>
                                                        <div className="whitespace-nowrap text-[0.58rem] text-amalfi-muted/60">
                                                            {item.updated_at ? fmtTs(item.updated_at) : 'No update'}
                                                        </div>
                                                    </div>
                                                  </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>

                                    {/* --- RIGHT PANEL: Receipt Viewer --- */}
                                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] flex flex-1 flex-col overflow-hidden rounded-[24px]">
                                        {selectedItem ? (() => {
                                            const sPaid    = Number(selectedItem.amount_paid || selectedItem.trans_amount || 0);
                                            const sTotal   = Number(selectedItem.total_price || 0);
                                            const sBalance = Math.max(0, sTotal - sPaid);
                                            const sFullPay = sTotal > 0 && sPaid >= sTotal;
                                            return (
                                                <>
                                                    {/* Compact Detail Strip */}
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#f7eedf]/48 px-5 py-3">
                                                        <span className="text-[0.88rem] font-black text-amalfi-ink">{selectedItem.full_name}</span>
                                                        <span className="text-[0.65rem] text-amalfi-muted">{selectedItem.phone}</span>
                                                        <span className="text-[0.68rem] font-black text-amalfi-muted">{selectedItem.booking_ref}</span>
                                                        <span className="h-3.5 w-px bg-[#d8c9b3]" />
                                                        <span className="text-[0.65rem] font-bold text-amalfi-ink">{fmtDate(selectedItem.check_in)} - {fmtDate(selectedItem.check_out)}</span>
                                                        <span className="h-3.5 w-px bg-[#d8c9b3]" />
                                                        <span className="text-[0.68rem] font-black text-amalfi-ink">PHP {sTotal.toLocaleString()}</span>
                                                        <span className="text-[0.68rem] font-black text-amalfi-emerald">Paid PHP {sPaid.toLocaleString()}</span>
                                                        {sBalance > 0 && <span className="text-[0.68rem] font-black text-amalfi-coral">Due PHP {sBalance.toLocaleString()}</span>}
                                                        <span className="ml-auto text-[0.58rem] text-amalfi-muted">{selectedItem.updated_at ? fmtTs(selectedItem.updated_at) : 'No update'}</span>
                                                    </div>

                                                    {/* Receipt Image Area */}
                                                    <div className="flex flex-1 items-center justify-center overflow-auto bg-[#fffdf8] p-5">
                                                        {selectedItem.receipt_path ? (
                                                            <a href={selectedItem.receipt_path} target="_blank" rel="noopener noreferrer" className="flex h-full w-full items-center justify-center">
                                                                <img
                                                                    src={selectedItem.receipt_path}
                                                                    alt="Receipt"
                                                                    className="max-h-full max-w-full cursor-zoom-in rounded-2xl bg-white object-contain p-2 shadow-[0_14px_34px_rgba(19,33,31,0.08)]"
                                                                />
                                                            </a>
                                                        ) : (
                                                            <EmptyState
                                                                title="No receipt uploaded"
                                                                description="This pending record does not include a receipt image."
                                                                className="border-0 bg-transparent shadow-none"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Action Bar */}
                                                    <div className="flex justify-end gap-3 bg-[#f7eedf]/42 px-5 py-3">
                                                        <Button onClick={() => handleVerify(selectedItem.booking_ref, 'approve')} className="h-11 rounded-2xl bg-amalfi-emerald px-7 text-sm font-black text-white shadow-[0_12px_24px_rgba(10,107,95,0.18)] hover:bg-amalfi-emerald/90">
                                                            Approve Payment
                                                        </Button>
                                                        <Button onClick={() => handleVerify(selectedItem.booking_ref, 'reject')} variant="outline" className="h-11 rounded-2xl border-amalfi-coral/20 px-7 text-sm font-black text-amalfi-coral hover:bg-amalfi-coral/5 hover:text-amalfi-coral">
                                                            Reject
                                                        </Button>
                                                    </div>
                                                </>
                                            );
                                        })() : null}
                                    </Card>
                                </div>
                            )}
                        </PageContainer>
                        );
                    })()}


                    {/* --------------------------- UNITS HUB --------------------------- */}
                    {activeTab === 'units' && (
                        <PageContainer className="flex flex-col gap-5">
                            <PageHeader
                                eyebrow="UN"
                                title="Units Hub"
                                description="Manage current room readiness separately from scheduled booking blocks."
                                imageSrc="/assets/page-headers/units-cabins.svg"
                                imageClassName="object-[center_45%]"
                            />

                            <CommandDeck
                                eyebrow="Unit Controls"
                                title={`${filteredUnits.length} units showing`}
                                description="Use live unit state for the room's status until staff changes it. Use date holds for unavailable dates."
                                primary={(
                                    <div className="grid w-full max-w-[720px] gap-2">
                                        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                                        <Select
                                            value={unitCategoryFilter}
                                            onValueChange={setUnitCategoryFilter}
                                            disabled={unitCategoryOptions.length === 0}
                                        >
                                            <SelectTrigger className="h-9 w-[230px] rounded-xl border-white/20 bg-white/15 text-xs font-bold text-[#fffdf8] shadow-none">
                                                <SelectValue placeholder="Select category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    {unitCategoryOptions.map((category) => (
                                                        <SelectItem key={category} value={category}>
                                                            {displayUnitCategory(category)} ({unitCategoryCounts[category] || 0})
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                        <div className="relative min-w-[280px] flex-1 xl:max-w-[420px]">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#fffdf8]/78" />
                                            <input
                                                type="text"
                                                value={unitSearch}
                                                onChange={(e) => setUnitSearch(e.target.value)}
                                                className="h-9 w-full rounded-xl border border-white/20 bg-white/15 pl-9 pr-3 text-[0.68rem] font-bold text-[#fffdf8] outline-none placeholder:text-[#fffdf8]/55 focus:border-[#f4d89a]/70 focus:bg-white/20"
                                                placeholder="Search unit, label, room type, or tag..."
                                            />
                                        </div>
                                        </div>
                                    </div>
                                )}
                            >
                                <DeckMetricRail intro={<DeckIntro title="Unit Color Key" description="Readiness counts match filtered room cards" />}>
                                    <DeckMetric label="Ready Rooms" caption="Bookable now" value={availableUnitCount} tone="teal" />
                                    <DeckMetric label="Housekeeping" caption="Cleaning or inspection" value={housekeepingUnitCount} tone="gold" />
                                    <DeckMetric label="Maintenance" caption="Not bookable" value={blockedUnitCount} tone="red" />
                                    <DeckMetric label="Total Units" caption={`${filteredUnits.length} showing`} value={units.length} tone="blue" />
                                </DeckMetricRail>
                            </CommandDeck>

                            <div className="flex min-w-0 flex-wrap items-center gap-3 xl:flex-nowrap">
                                <h2 className="m-0 shrink-0 whitespace-nowrap font-resortDisplay text-admin-section font-black tracking-normal text-[#13211f]">
                                    Units Hub
                                </h2>
                                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-[#d8c9b3]/80 bg-[#fffdf8]/92 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(19,33,31,0.04)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Room status filters">
                                    <button
                                        type="button"
                                        className={cn('h-8 shrink-0 rounded-full border px-3 text-[0.62rem] font-black transition', unitStatusFilter === 'all' ? 'border-[#c6923f] bg-[#fff3d5] text-[#74480c] shadow-sm' : 'border-transparent bg-transparent text-[#5f6d66] hover:bg-[#f7eedf]/72 hover:text-[#173c36]')}
                                        onClick={() => setUnitStatusFilter('all')}
                                    >
                                        All <span className={cn('ml-1 rounded-full px-1.5', unitStatusFilter === 'all' ? 'bg-[#c6923f]/16 text-[#74480c]' : 'bg-[#0a6b5f]/10 text-[#0a6b5f]')}>{units.length}</span>
                                    </button>
                                    {UNIT_HUB_FILTERS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={cn('h-8 shrink-0 rounded-full border px-3 text-[0.62rem] font-black transition', unitStatusFilter === option.value ? 'border-[#c6923f] bg-[#fff3d5] text-[#74480c] shadow-sm' : 'border-transparent bg-transparent text-[#5f6d66] hover:bg-[#f7eedf]/72 hover:text-[#173c36]')}
                                            onClick={() => setUnitStatusFilter(option.value)}
                                        >
                                            {option.short} <span className={cn('ml-1 rounded-full px-1.5', unitStatusFilter === option.value ? 'bg-[#c6923f]/16 text-[#74480c]' : 'bg-[#0a6b5f]/10 text-[#0a6b5f]')}>{unitStatusCounts[option.value] || 0}</span>
                                        </button>
                                    ))}
                                </div>
                                <span className="shrink-0 whitespace-nowrap rounded-full border border-[#d8c9b3]/70 bg-[#f7eedf]/70 px-3 py-1 text-[0.62rem] font-black tracking-normal text-[#5f6d66]">
                                    Showing {filteredUnits.length} units
                                </span>
                            </div>

                            <div className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] max-h-[72vh] overflow-auto rounded-[24px] bg-[#fffdf8]">
                                <div className="grid min-w-[1400px] grid-cols-[260px_minmax(210px,0.8fr)_minmax(460px,1.35fr)_minmax(360px,1.1fr)_180px] border-b border-[#e5d8c4]/80 bg-[#fff9ef] px-3 py-3 text-[0.58rem] font-black uppercase tracking-[0.18em] text-[#5f6d66]">
                                    <span>Unit</span>
                                    <span>Live Unit State</span>
                                    <span>Set Live State</span>
                                    <span>Date Holds</span>
                                    <span className="text-right">Actions</span>
                                </div>
                                {unitCategoryGroups.map(([category, categoryUnits]) => {
                                    const readyCount = categoryUnits.filter(unit => (unit.unit_status || 'Available') === 'Available').length;
                                    const blockedCount = categoryUnits.filter(unit => unit.unit_status === 'Maintenance').length;
                                    return (
                                        <div key={category} className="min-w-[1080px] border-b border-[#eadfcd]/80 last:border-b-0">
                                            <div className="border-b border-[#eadfcd]/70 bg-[#fffaf1] px-3 py-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <CardTitle className="font-resortDisplay text-admin-section font-black tracking-normal text-amalfi-ink">{displayUnitCategory(category)}</CardTitle>
                                                        <CardDescription className="text-xs font-semibold text-amalfi-muted">
                                                            {categoryUnits.length} unit{categoryUnits.length === 1 ? '' : 's'} / {readyCount} ready / {blockedCount} blocked
                                                        </CardDescription>
                                                    </div>
                                                    <StatusBadge tone={blockedCount ? 'warning' : 'success'}>
                                                        {readyCount} ready
                                                    </StatusBadge>
                                                </div>
                                            </div>
                                            <div className="divide-y divide-[#efe5d4]">
                                                {categoryUnits.map((u) => {
                                                    const dateBlocked = u.active_booking?.status === 'UNIT_BLOCKED';
                                                    const meta = unitStatusMeta(effectiveUnitStatus(u));
                                                    const Icon = meta.Icon;
                                                    return (
                                                        <div
                                                            key={u.unit_id}
                                                            className="grid grid-cols-[260px_minmax(210px,0.8fr)_minmax(460px,1.35fr)_minmax(360px,1.1fr)_180px] items-center gap-3 bg-[#fffdf8] px-3 py-3 transition hover:bg-white hover:shadow-[inset_4px_0_0_rgba(10,107,95,0.22)]"
                                                        >
                                                            <div className="contents">
                                                                <div className="grid min-w-0 grid-cols-[34px_minmax(0,1fr)] items-center gap-3">
                                                                    <span className="flex size-9 items-center justify-center rounded-2xl bg-[#f7eedf]/75 text-amalfi-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"><Icon /></span>
                                                                    <div className="min-w-0">
                                                                        <h4 className="m-0 truncate text-sm font-black text-amalfi-ink">{u.unit_label || u.unit_id}</h4>
                                                                        <p className="m-0 truncate text-xs font-semibold text-amalfi-muted">{u.unit_id} / {displayUnitCategory(categoryForUnit(u))}</p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                                    <StatusBadge tone={meta.value === 'Maintenance' ? 'danger' : meta.value === 'Available' ? 'success' : 'warning'}>
                                                                        {meta.short}
                                                                    </StatusBadge>
                                                                    <span className="truncate text-[0.68rem] font-bold text-[#5f6d66]">
                                                                        {dateBlocked ? 'Blocked by date hold' : nextActionLabel(u.unit_status || 'Available')}
                                                                    </span>
                                                                </div>

                                                                <div className="grid grid-cols-[repeat(4,minmax(86px,1fr))] gap-1.5">
                                                                    {UNIT_HUB_TOGGLES.map((option) => {
                                                                        const ActiveIcon = option.Icon;
                                                                        const active = (u.unit_status || 'Available') === option.value;
                                                                        const actionLabel = readinessActionLabel(u, option);
                                                                        const actionTitle = readinessActionTitle(u, option);
                                                                        return (
                                                                            <Button
                                                                                key={option.value}
                                                                                type="button"
                                                                                variant={active ? 'default' : 'outline'}
                                                                                size="sm"
                                                                                className="h-8 min-w-0 justify-center gap-1 rounded-xl px-1.5 text-[0.56rem] font-black leading-none"
                                                                                onClick={() => handleStatusChange(u.unit_id, option.value)}
                                                                                title={actionTitle}
                                                                            >
                                                                                <ActiveIcon className="size-3.5 shrink-0" />
                                                                                <span className="min-w-0 truncate">{actionLabel}</span>
                                                                            </Button>
                                                                        );
                                                                    })}
                                                                </div>

                                                                <div className="min-w-0">
                                                                {(() => {
                                                                    const tags = activeDateTags(u);
                                                                    return tags.length > 0 ? (
                                                                        <div className="grid gap-2">
                                                                            {tags.map((tag) => (
                                                                                <div key={tag.id || `${tag.tag_type}-${tag.start_date}-${tag.end_date}`} className="rounded-2xl bg-[#f1faf7] px-3 py-2 shadow-[inset_4px_0_0_rgba(10,107,95,0.32)]">
                                                                                    <div className="flex items-center justify-between gap-3">
                                                                                        <strong className="min-w-0 truncate text-[0.7rem] font-black text-amalfi-ink">{tag.tag_type}</strong>
                                                                                        <div className="flex shrink-0 items-center gap-2">
                                                                                            {Number(tag.blocks_inventory) ? <StatusBadge tone="danger">Blocks Booking</StatusBadge> : <StatusBadge tone="neutral">Note</StatusBadge>}
                                                                                            <Button
                                                                                                type="button"
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-7 rounded-xl px-2 text-[0.6rem] font-black"
                                                                                                onClick={() => handleDeleteUnitDateTag(tag.id)}
                                                                                            >
                                                                                                Remove
                                                                                            </Button>
                                                                                        </div>
                                                                                    </div>
                                                                                    <span className="mt-1 block truncate text-[0.66rem] font-semibold text-amalfi-muted">{tag.start_date} to {tag.end_date}</span>
                                                                                </div>
                                                                            ))}
                                                                            {Array.isArray(u.date_tags) && u.date_tags.length > tags.length && <em className="text-[0.68rem] font-bold not-italic text-amalfi-muted">+{u.date_tags.length - tags.length} more scheduled item(s)</em>}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="truncate rounded-2xl bg-[#f7eedf]/42 px-3 py-2 text-[0.68rem] font-semibold text-amalfi-muted">No date holds</div>
                                                                    );
                                                                })()}
                                                                </div>

                                                                <div className="flex justify-end">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="rounded-xl text-[0.66rem] font-black"
                                                                        onClick={() => openUnitDateTagDraft(u, 'Deep Cleaning')}
                                                                        title="Set a hold for selected dates"
                                                                    >
                                                                        Set Date Hold
                                                                    </Button>
                                                                </div>

                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {filteredUnits.length === 0 && (
                                <EmptyState
                                    title="No matching rooms"
                                    description="No rooms match the selected category, search, and status filter."
                                />
                            )}

                            <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px] bg-[#fff7df]/82">
                                <CardContent className="flex items-start gap-3 p-4 text-sm font-semibold text-amalfi-muted">
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amalfi-gold" />
                                    <span><strong>Live unit state</strong> stays active until staff changes it. <strong>Date holds</strong> apply only to the selected date range and can be removed from the row.</span>
                                </CardContent>
                            </Card>

                            <Dialog open={Boolean(unitDateTagDraft)} onOpenChange={(open) => !open && setUnitDateTagDraft(null)}>
                                <DialogContent className="rounded-2xl sm:max-w-xl">
                                    {unitDateTagDraft && (
                                        <>
                                            <DialogHeader>
                                                <DialogTitle className="font-resortDisplay text-amalfi-ink">Set Date Hold / {unitDateTagDraft.unit_label}</DialogTitle>
                                                <DialogDescription>Add a hold, booking pause, or operational note for the selected dates only.</DialogDescription>
                                            </DialogHeader>

                                            <div className="grid gap-4">
                                                <label className="grid gap-2">
                                                    <span className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">Reason</span>
                                                    <Select
                                                        value={unitDateTagDraft.tag_type}
                                                        onValueChange={(value) => {
                                                            const option = UNIT_DATE_TAG_OPTIONS.find(item => item.value === value) || UNIT_DATE_TAG_OPTIONS[0];
                                                            setUnitDateTagDraft((draft) => ({ ...draft, tag_type: option.value, blocks_inventory: option.blocks }));
                                                        }}
                                                    >
                                                        <SelectTrigger className="rounded-2xl">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectGroup>
                                                                {UNIT_DATE_TAG_OPTIONS.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                                ))}
                                                            </SelectGroup>
                                                        </SelectContent>
                                                    </Select>
                                                </label>

                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <label className="grid gap-2">
                                                        <span className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">From</span>
                                                        <Input
                                                            type="date"
                                                            value={unitDateTagDraft.start_date}
                                                            onChange={(e) => setUnitDateTagDraft((draft) => ({
                                                                ...draft,
                                                                start_date: e.target.value,
                                                                end_date: draft.end_date <= e.target.value ? addDaysToDateOnly(e.target.value, 1) : draft.end_date
                                                            }))}
                                                            className="rounded-2xl"
                                                        />
                                                    </label>
                                                    <label className="grid gap-2">
                                                        <span className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">Until</span>
                                                        <Input
                                                            type="date"
                                                            value={unitDateTagDraft.end_date}
                                                            min={addDaysToDateOnly(unitDateTagDraft.start_date, 1)}
                                                            onChange={(e) => setUnitDateTagDraft((draft) => ({ ...draft, end_date: e.target.value }))}
                                                            className="rounded-2xl"
                                                        />
                                                    </label>
                                                </div>

                                                <label className="grid gap-2">
                                                    <span className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">Note</span>
                                                    <Input
                                                        type="text"
                                                        value={unitDateTagDraft.note}
                                                        onChange={(e) => setUnitDateTagDraft((draft) => ({ ...draft, note: e.target.value }))}
                                                        placeholder="Optional ops note"
                                                        className="rounded-2xl"
                                                    />
                                                </label>

                                                <label className="flex items-start gap-3 rounded-2xl bg-[#f7eedf]/58 p-3 text-sm font-semibold text-amalfi-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(unitDateTagDraft.blocks_inventory)}
                                                        onChange={(e) => setUnitDateTagDraft((draft) => ({ ...draft, blocks_inventory: e.target.checked }))}
                                                        className="mt-1"
                                                    />
                                                    <span>Block this unit from booking assignment for these dates</span>
                                                </label>

                                                <div className="flex justify-end gap-3">
                                                    <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setUnitDateTagDraft(null)}>
                                                        Close
                                                    </Button>
                                                    <Button type="button" className="rounded-2xl bg-amalfi-night px-6 text-[#f8e8c8] hover:bg-amalfi-night/90" onClick={handleCreateUnitDateTag}>
                                                        Save Date Hold
                                                    </Button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </DialogContent>
                            </Dialog>
                        </PageContainer>
                    )}

                    {/* --------------------------- SANCTUARY MAP --------------------------- */}
                    {activeTab === 'map' && (
                        <PageContainer className="flex flex-col gap-5">
                            <PageHeader
                                eyebrow="MAP"
                                title="Sanctuary Map"
                                description="Monitor room occupancy and guest flow in one timeline. Booking bars show stay status, open cells show bookable dates, and each unit opens directly into booking logistics."
                                imageSrc="/assets/page-headers/map-aerial.svg"
                                imageClassName="object-[center_58%]"
                            />
                            <AvailabilityGrid
                                exportable
                                onOpenBookingSummary={openBookingSummary}
                            />
                        </PageContainer>
                    )}

                    {/* --------------------------- SPECIAL BOOKINGS --------------------------- */}
                    {activeTab === 'special' && (
                        <PageContainer className="flex flex-col gap-5" ref={refSpecial}>
                            <PageHeader
                                eyebrow="SP"
                                title="Special Bookings"
                                description="Manage tent pitching, day tours, and custom amenity bookings in the same operational rhythm as room stays."
                                imageSrc="/assets/page-headers/special-tents.svg"
                                imageClassName="object-[center_62%]"
                                action={
                                  <Button
                                    type="button"
                                    onClick={() => openSpecialBooking('tent_pitching')}
                                    className="h-12 rounded-2xl bg-amalfi-night px-5 text-admin-label font-black uppercase tracking-normal text-[#f8e8c8] shadow-[0_12px_24px_rgba(10,107,95,0.18)] hover:bg-amalfi-night/90"
                                  >
                                    <Plus />
                                    New Special
                                  </Button>
                                }
                            />
                            <div className="flex justify-end">
                                <ExportBtn onClick={() => exportToPng(refSpecial, 'Special Bookings')} />
                            </div>
                            <SpecialBookingsHub
                                bookings={combinedSpecialBookings}
                                onVerify={handleVerify}
                                onRefresh={fetchAll}
                                onEdit={(b) => {
                                    setSummaryBooking(null);
                                    setCrudModal(null);
                                    setEditInitialTab(null);
                                    setPrefillRemainingPayment(false);
                                    setSelectedBooking(b);
                                    setTentModal('edit');
                                }}
                                onManualAdd={(date, type = 'tent_pitching') => openSpecialBooking(type, date)}
                            />
                        </PageContainer>
                    )}
{/* --------------------------- CENTRAL LEDGER --------------------------- */}
                    {activeTab === 'ledger' && (
                        <PageContainer className="flex flex-col gap-3" ref={refLedger}>
                            <PageHeader
                                eyebrow="CL"
                                title="Central Ledger"
                                description="Search bookings, review balances, audit arrivals, and move guests through check-in, check-out, payment, and archive workflows."
                                imageSrc="/assets/page-headers/ledger-dock.svg"
                                imageClassName="object-[center_50%]"
                            />

                            <CommandDeck
                                eyebrow="Ledger Control"
                                title={`${activeLedgerRecordCount} records in view`}
                                description="Search, filter, and move bookings without leaving the active ledger workspace."
                                primary={(
                                    <div className="flex w-full max-w-[920px] flex-col items-stretch gap-2 xl:items-end">
                                        {showLedgerDateSlicer && (
                                            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end" aria-label="Ledger stay date slicer">
                                                <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-2 text-[0.58rem] font-black uppercase tracking-[0.14em] text-[#f4d89a] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                                                    <Calendar size={13} />
                                                    <span>Stay window</span>
                                                </div>
                                                <Button className="h-9 rounded-xl border border-[#d8a84c] bg-[#c6923f] px-3.5 text-[0.66rem] font-black text-white hover:bg-[#b5842b]" type="button" onClick={() => setLedgerDatePreset('today')}>Today</Button>
                                                <Button variant="outline" className="h-9 rounded-xl border-white/20 bg-white/15 px-3.5 text-[0.66rem] font-black text-[#fffdf8] hover:bg-white/25 hover:text-white" type="button" onClick={() => setLedgerDatePreset('next7')}>Next 7</Button>
                                                <Button variant="outline" className="h-9 rounded-xl border-white/20 bg-white/10 px-3.5 text-[0.66rem] font-black text-[#fffdf8]/70 hover:bg-white/20 hover:text-white" type="button" onClick={() => setLedgerDatePreset('clear')} disabled={!ledgerDateWindow.from && !ledgerDateWindow.to}>Clear</Button>
                                                <Input className="h-9 w-[148px] rounded-xl border border-white/20 bg-white/15 px-3 text-[0.68rem] font-black text-[#fffdf8] outline-none [color-scheme:dark] focus:border-[#f4d89a]/70 focus:bg-white/20" type="date" value={ledgerDateWindow.from} onChange={(event) => setLedgerDateWindow((current) => ({ ...current, from: event.target.value, to: current.to && event.target.value && current.to < event.target.value ? event.target.value : current.to }))} />
                                                <Input className="h-9 w-[148px] rounded-xl border border-white/20 bg-white/15 px-3 text-[0.68rem] font-black text-[#fffdf8] outline-none [color-scheme:dark] focus:border-[#f4d89a]/70 focus:bg-white/20" type="date" value={ledgerDateWindow.to} min={ledgerDateWindow.from || undefined} onChange={(event) => setLedgerDateWindow((current) => ({ ...current, to: event.target.value }))} />
                                            </div>
                                        )}
                                        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                                            <div className="relative">
                                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#fffdf8]/78" />
                                                <input
                                                    className="h-9 w-[min(360px,60vw)] rounded-xl border border-white/20 bg-white/15 pl-9 pr-3 text-[0.68rem] font-bold text-[#fffdf8] outline-none placeholder:text-[#fffdf8]/55 focus:border-[#f4d89a]/70 focus:bg-white/20"
                                                    type="text"
                                                    placeholder="Search booking ref, guest, email, or unit"
                                                    value={globalSearch}
                                                    onChange={e => { setGlobalSearch(e.target.value); setCurrentPage(1); }}
                                                />
                                            </div>
                                            <Button className="h-9 rounded-xl border border-[#d8a84c] bg-[#c6923f] px-3.5 text-[0.66rem] font-black text-white hover:bg-[#b5842b]" onClick={openManualBooking}>
                                                <Plus /> Manual Booking
                                            </Button>
                                            <Button variant="outline" className="h-9 rounded-xl border-white/20 bg-white/15 px-3.5 text-[0.66rem] font-black text-[#fffdf8] hover:bg-white/25 hover:text-white" onClick={() => openSpecialBooking('tent_pitching')}>
                                                <Plus /> Special
                                            </Button>
                                            <Button variant="outline" className="h-9 rounded-xl border-white/20 bg-white/15 px-3.5 text-[0.66rem] font-black text-[#fffdf8] hover:bg-white/25 hover:text-white" onClick={() => setBulkImportModal(true)}>
                                                <FileText /> CSV
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            >
                                <DeckMetricRail
                                    intro={<DeckIntro title="Ledger Color Key" description="Status counts match the active booking rows" />}
                                >
                                    <DeckMetric label="Active Records" caption="Open booking rows" value={activeBookings.length} tone="teal" />
                                    <DeckMetric label="Payments Due" caption="Balances to settle" value={paymentDueBookings.length} tone="gold" />
                                    <DeckMetric label="Arrivals Today" caption="Expected check-ins" value={arrivals.length} tone="blue" />
                                    <DeckMetric label="Checked In" caption="Guests onsite" value={ledger.filter(b => String(b.status || '').toUpperCase() === 'CHECKED_IN').length} tone="teal" />
                                    <DeckMetric label="Transaction Log" caption="Ledger entries" value={txLog.length} tone="violet" />
                                    <DeckMetric label="Past Bookings" caption="Archived stays" value={pastBookings.length} tone="gold" />
                                </DeckMetricRail>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8c9b3]/60 bg-[#fffdf8] px-5 py-2 text-[0.6rem] font-black tracking-normal text-[#5f6d66]">
                                    <span>Showing {activeLedgerRecordCount} records</span>
                                    <span className="text-right text-[0.58rem] font-bold text-[#69776f]">Ledger view for booking balance checks, movement, payment review, and archive follow-up.</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 border-b border-[#d8c9b3]/55 bg-[#f7eedf]/54 px-5 py-2.5">
                                    <span className="mr-1 text-[0.56rem] font-black uppercase tracking-[0.18em] text-[#13211f]">View by ledger</span>
                                    {LEDGER_TABS.map((t) => {
                                        const active = ledgerTab === t.id;
                                        const startsGroup = ['upcoming', 'txlog'].includes(t.id);
                                        return (
                                            <React.Fragment key={t.id}>
                                                {startsGroup && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="mx-3 hidden h-10 w-[3px] shrink-0 rounded-full border border-[#f4d89a]/80 bg-[linear-gradient(180deg,rgba(198,146,63,0.08),#b98330,rgba(198,146,63,0.08))] shadow-[inset_1px_0_0_rgba(255,253,248,0.78),0_0_0_1px_rgba(111,76,29,0.08),0_8px_18px_rgba(198,146,63,0.20)] min-[860px]:inline-block"
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setLedgerTab(t.id);
                                                        setCurrentPage(1);
                                                    }}
                                                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.6rem] font-black transition ${startsGroup ? 'min-[860px]:ml-1' : ''} ${active ? 'border-[#b98330] bg-[#c6923f] text-white shadow-sm' : 'border-[#d8c9b3] bg-[#fffdf8] text-[#13211f] hover:border-[#b98330]/70'}`}
                                                >
                                                    <span>{t.label}</span>
                                                    <span className={`rounded-full px-1.5 py-0.5 text-[0.52rem] ${active ? 'bg-white/18 text-white' : 'bg-[#f7eedf] text-[#5f6d66]'}`}>{t.count}</span>
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </CommandDeck>

                            {/* -- Active Ledger -- */}
                            {ledgerTab === 'all' && (
                                <CompactBookingTable
                                    title="Active Ledger"
                                    rows={ledgerSort.sorted}
                                    currentPage={currentPage}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setCurrentPage}
                                    todayStr={todayStr}
                                    mode="all"
                                    totals={ledgerTotals}
                                    onEditRow={openBookingEditor}
                                    onDeleteRow={(row) => handleDelete(row.booking_ref)}
                                />
                            )}

                            {ledgerTab === 'payments' && (
                                <CompactBookingTable
                                    title="Payments Due"
                                    rows={paymentsSort.sorted}
                                    currentPage={currentPage}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setCurrentPage}
                                    todayStr={todayStr}
                                    mode="payments"
                                    totals={summarizeBookingRows(paymentsSort.sorted)}
                                    onEditRow={openBookingEditor}
                                    onPrimaryAction={(row) => openBookingEditor(row, 'payments', 'edit')}
                                />
                            )}

                            {ledgerTab === 'upcoming' && (
                                <CompactBookingTable
                                    title="Upcoming Bookings"
                                    rows={upcomingSort.sorted}
                                    currentPage={currentPage}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setCurrentPage}
                                    todayStr={todayStr}
                                    mode="upcoming"
                                    totals={summarizeBookingRows(upcomingSort.sorted)}
                                    onEditRow={openBookingEditor}
                                    onDeleteRow={(row) => handleDelete(row.booking_ref)}
                                />
                            )}

                            {ledgerTab === 'arrivals' && (
                                <CompactBookingTable
                                    title="Today's Check Ins"
                                    rows={arrivalsSort.sorted}
                                    currentPage={currentPage}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setCurrentPage}
                                    todayStr={todayStr}
                                    mode="arrivals"
                                    totals={summarizeBookingRows(arrivalsSort.sorted)}
                                    onEditRow={openBookingEditor}
                                    onPrimaryAction={(row) => openBookingPaymentShortcut(row, 'checkin')}
                                />
                            )}

                            {ledgerTab === 'departures' && (
                                <CompactBookingTable
                                    title="Today's Check Outs"
                                    rows={departuresSort.sorted}
                                    currentPage={currentPage}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setCurrentPage}
                                    todayStr={todayStr}
                                    mode="departures"
                                    totals={summarizeBookingRows(departuresSort.sorted)}
                                    onPrimaryAction={openBookingCheckoutShortcut}
                                />
                            )}

                            {ledgerTab === 'txlog' && (
                                <CompactTransactionTable
                                    rows={txLogSort.sorted}
                                    ledger={ledger}
                                    currentPage={currentPage}
                                    pageSize={PAGE_SIZE}
                                    onPageChange={setCurrentPage}
                                />
                            )}

                            {ledgerTab === 'past' && (
                                <>
                                    <Card className="overflow-hidden rounded-[22px] border-[#c8ae7c]/75 bg-[#fffdf8] shadow-[0_18px_46px_rgba(19,33,31,0.08)]">
                                        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex items-start gap-3">
                                                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#d8c9b3]/80 bg-[#f7eedf] text-[#0b776b] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                                                    <CheckCircle2 size={20} />
                                                </span>
                                                <div>
                                                    <div className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-[#b98330]">Past Balance Sweep</div>
                                                    <h3 className="font-resortDisplay text-xl font-black tracking-normal text-amalfi-ink">Settle old unpaid stays in one audited batch</h3>
                                                    <p className="mt-1 max-w-3xl text-[0.76rem] font-semibold leading-relaxed text-amalfi-muted">
                                                        Preview past reserved or checked-in bookings with balances before today, then record verified presumed-paid settlement entries and check them out together.
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={previewBulkPastSettlement}
                                                disabled={bulkPastSettlementLoading}
                                                className="h-11 rounded-2xl border border-[#b8873e] bg-[#0b776b] px-4 text-[0.68rem] font-black uppercase tracking-normal text-white shadow-[0_14px_28px_rgba(10,107,95,0.18)] hover:bg-[#096a60]"
                                            >
                                                {bulkPastSettlementLoading ? 'Scanning...' : 'Preview Sweep'}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                    <CompactBookingTable
                                        title="Past Bookings"
                                        rows={pastSort.sorted}
                                        currentPage={currentPage}
                                        pageSize={PAGE_SIZE}
                                        onPageChange={setCurrentPage}
                                        todayStr={todayStr}
                                        mode="past"
                                        totals={summarizeBookingRows(pastSort.sorted)}
                                        onEditRow={(row) => openBookingEditor(row, null, 'correction')}
                                    />
                                </>
                            )}
                        </PageContainer>
                    )}

                    {/* ANALYTICS & REPORTS */}
                    {activeTab === 'analytics' && (
                        <PageContainer className="flex flex-col gap-3" ref={refAnalytics}>
                            <PageHeader
                                eyebrow="AN"
                                title="Performance"
                                description="Track occupancy trends, revenue movement, booking pressure, and room category performance from one analysis view."
                                imageSrc="/assets/page-headers/performance-sunrise.svg"
                                imageClassName="object-[center_55%]"
                                action={<ExportBtn onClick={() => exportToPng(refAnalytics, 'Performance')} />}
                            />
                            <AnalyticsHub ledger={ledger} units={units} specialBookings={combinedSpecialBookings} receivables={receivables} pending={pending} chatLogs={chatLogs} mode="dashboard" />
                        </PageContainer>
                    )}
                    {activeTab === 'reports' && (
                        <PageContainer className="flex flex-col gap-5">
                            <PageHeader
                                eyebrow="RP"
                                title="Financial Reports"
                                description="Generate print-ready accounting reports, export ledger history, and review collections for audit or stakeholder updates."
                                imageSrc="/assets/page-headers/reports-desk.svg"
                                imageClassName="object-[center_48%]"
                            />
                            <AnalyticsHub ledger={ledger} units={units} specialBookings={combinedSpecialBookings} receivables={receivables} pending={pending} chatLogs={chatLogs} mode="reports" />
                        </PageContainer>
                    )}
                    {activeTab === 'knowledge' && (
                        <PageContainer className="flex flex-col gap-5">
                            <PageHeader
                                eyebrow="KB"
                                title="Knowledge Monitor"
                                description="Maintain the source of truth for policies, pricing, room details, and FAQs used by Amalfi Concierge."
                                imageSrc="/assets/page-headers/knowledge-cove.svg"
                                imageClassName="object-[center_42%]"
                            />
                            <KnowledgeHub />
                        </PageContainer>
                    )}
                    {activeTab === 'responses' && (
                        <PageContainer className="flex flex-col gap-5">
                            <PageHeader
                                eyebrow="RH"
                                title="Response Helper"
                                description="Paste guest inquiries and generate admin-reviewed replies using the current knowledge base, live unit inventory, and active booking database. Availability drafts are checked against the Hub before you send them."
                                imageSrc="/assets/page-headers/responses-shells.svg"
                                imageClassName="object-[center_60%]"
                            />
                            <ResponseHelper />
                        </PageContainer>
                    )}
                    {activeTab === 'concierge' && (
                        <PageContainer className="flex flex-col gap-5">
                            <PageHeader
                                eyebrow="AI"
                                title="Chatbot Monitor"
                                description="Monitor guest conversations, review AI handling, and intervene when a thread needs operator attention."
                                imageSrc="/assets/page-headers/concierge-night.svg"
                                imageClassName="object-[center_55%]"
                            />
                            <ConciergeHubV2 />
                        </PageContainer>
                    )}
            <footer className="mx-[34px] mb-5 ml-[274px] mt-4 border-t border-amalfi-line pt-3.5 text-center text-amalfi-muted opacity-70 max-[1180px]:ml-[118px] max-[980px]:mx-[18px] max-[760px]:mx-3.5 max-[760px]:mb-[90px]">
                <span className="text-[0.58rem] font-black uppercase tracking-[1.2px]">Amalfi Sanctuary Hub v5.3.0 | Operational Intelligence Active</span>
            </footer>

            {summaryBooking && (
                <BookingSummaryModal
                    booking={summaryBooking}
                    onClose={() => setSummaryBooking(null)}
                />
            )}

            {crudModal === 'add' && (
                <AdminBookingModal
                    key={`${crudModal}-${selectedBooking?.booking_ref || 'new'}-${editInitialTab || 'default'}-${editWorkflowMode}-${prefillRemainingPayment ? 'prefill' : 'plain'}`}
                    mode={crudModal}
                    initialData={selectedBooking}
                    initialTab={null}
                    prefillRemainingPayment={false}
                    onSaved={handleBookingModalSaved}
                    onSync={() => fetchAll(true)}
                    onClose={() => { setCrudModal(null); setEditInitialTab(null); setEditWorkflowMode('edit'); setPrefillRemainingPayment(false); }}
                    onDelete={handleDelete}
                    units={units}
                    existingBookings={ledger}
                />
            )}

            {crudModal === 'edit' && (
                <EditBookingModal
                    key={`edit-${selectedBooking?.booking_ref || 'unknown'}-${editInitialTab || 'default'}-${editWorkflowMode}-${prefillRemainingPayment ? 'prefill' : 'plain'}`}
                    initialData={selectedBooking}
                    initialTab={editInitialTab}
                    workflowMode={editWorkflowMode}
                    prefillRemainingPayment={prefillRemainingPayment}
                    onSaved={handleBookingModalSaved}
                    onSync={() => fetchAll(true)}
                    onClose={() => { setCrudModal(null); setEditInitialTab(null); setEditWorkflowMode('edit'); setPrefillRemainingPayment(false); }}
                    onDelete={handleDelete}
                    units={units}
                    existingBookings={ledger}
                />
            )}

            {tentModal && (
                <TentBookingModal
                    mode={tentModal}
                    initialData={selectedBooking}
                    onSaved={() => { setTentModal(null); fetchAll(true); }}
                    onClose={() => setTentModal(null)}
                    onRefresh={() => fetchAll(true)}
                />
            )}

            {bulkPastSettlementOpen && (
                <Dialog open onOpenChange={(open) => {
                    if (!open && !bulkPastSettlementLoading) {
                        setBulkPastSettlementOpen(false);
                        setBulkPastSettlementPreview(null);
                        setBulkPastSettlementResult(null);
                        setBulkPastSettlementConfirm('');
                        setBulkPastSettlementError('');
                    }
                }}>
                    <DialogContent className="flex max-h-[88vh] w-[min(760px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[24px] border-[#b8873e]/80 bg-[#fffaf1] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_28px_90px_rgba(19,33,31,0.28)]">
                        <DialogHeader className="border-b border-[#c8ae7c]/70 bg-[#fffdf8] px-6 py-5 text-left">
                            <DialogTitle className="font-resortDisplay text-2xl font-black tracking-normal text-amalfi-ink">Past Balance Sweep</DialogTitle>
                            <DialogDescription className="text-[0.78rem] font-semibold text-amalfi-muted">
                                Preview first. Commit records verified presumed-paid settlements and checks out every eligible past booking.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="max-h-[58vh] overflow-y-auto px-6 py-5">
                            {bulkPastSettlementLoading && (
                                <div className="rounded-2xl border border-[#d8c9b3]/70 bg-white/70 p-5 text-sm font-bold text-amalfi-muted">Scanning past bookings...</div>
                            )}

                            {!!bulkPastSettlementError && (
                                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
                                    {bulkPastSettlementError}
                                </div>
                            )}

                            {bulkPastSettlementResult && (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                                    <div className="flex items-center gap-2 text-sm font-black text-emerald-800">
                                        <CheckCircle2 size={18} />
                                        Sweep complete
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-emerald-900">
                                        Settled {bulkPastSettlementResult.summary?.settled || 0} booking(s), total PHP {Number(bulkPastSettlementResult.summary?.settled_total || 0).toLocaleString()}.
                                    </p>
                                </div>
                            )}

                            {bulkPastSettlementPreview && !bulkPastSettlementResult && (
                                <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-[#d8c9b3]/70 bg-white/70 p-4">
                                            <div className="text-[0.56rem] font-black uppercase tracking-[0.16em] text-amalfi-muted">Bookings</div>
                                            <div className="mt-2 text-2xl font-black text-amalfi-ink">{bulkPastSettlementPreview.summary?.candidates || 0}</div>
                                        </div>
                                        <div className="rounded-2xl border border-[#d8c9b3]/70 bg-white/70 p-4">
                                            <div className="text-[0.56rem] font-black uppercase tracking-[0.16em] text-amalfi-muted">Balance</div>
                                            <div className="mt-2 text-2xl font-black text-[#b98330]">PHP {Number(bulkPastSettlementPreview.summary?.total_balance || 0).toLocaleString()}</div>
                                        </div>
                                        <div className="rounded-2xl border border-[#d8c9b3]/70 bg-white/70 p-4">
                                            <div className="text-[0.56rem] font-black uppercase tracking-[0.16em] text-amalfi-muted">Action</div>
                                            <div className="mt-2 text-sm font-black text-[#0b776b]">Settle + Checkout</div>
                                        </div>
                                    </div>

                                    {(bulkPastSettlementPreview.candidates || []).length === 0 ? (
                                        <div className="rounded-2xl border border-[#d8c9b3]/70 bg-white/70 p-5 text-sm font-bold text-amalfi-muted">
                                            No eligible past bookings with unpaid balances were found before {bulkPastSettlementPreview.cutoff_date}.
                                        </div>
                                    ) : (
                                        <>
                                            <div className="rounded-2xl border border-[#d8c9b3]/70 bg-white/70">
                                                <div className="border-b border-[#eadfce] px-4 py-3 text-[0.58rem] font-black uppercase tracking-[0.16em] text-amalfi-muted">Preview sample</div>
                                                <div className="divide-y divide-[#eadfce]">
                                                    {(bulkPastSettlementPreview.candidates || []).slice(0, 8).map((row) => (
                                                        <div key={`${row.record_origin}-${row.booking_ref}`} className="grid gap-2 px-4 py-3 text-[0.72rem] font-bold text-amalfi-ink sm:grid-cols-[1fr_auto]">
                                                            <div>
                                                                <div className="font-black">{row.booking_ref} Â· {row.guest_name || 'Guest'}</div>
                                                                <div className="text-amalfi-muted">{row.check_out} Â· {row.status} Â· {row.unit_count || 0} unit(s)</div>
                                                            </div>
                                                            <div className="font-black text-[#b98330]">PHP {Number(row.balance_due || 0).toLocaleString()}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-[#d8c9b3]/70 bg-[#fffdf8] p-4">
                                                <label className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-amalfi-muted" htmlFor="bulk-past-confirm">
                                                    Type SETTLE PAST BOOKINGS to commit
                                                </label>
                                                <Input
                                                    id="bulk-past-confirm"
                                                    className="mt-2 h-11 rounded-xl border-[#c8ae7c]/80 bg-white text-sm font-black"
                                                    value={bulkPastSettlementConfirm}
                                                    onChange={(event) => setBulkPastSettlementConfirm(event.target.value)}
                                                    placeholder="SETTLE PAST BOOKINGS"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <DialogFooter className="gap-2 border-t border-[#c8ae7c]/70 bg-[#f7eedf]/65 px-6 py-4">
                            <Button variant="outline" type="button" onClick={() => setBulkPastSettlementOpen(false)} disabled={bulkPastSettlementLoading}>
                                Close
                            </Button>
                            {!!bulkPastSettlementPreview?.candidates?.length && !bulkPastSettlementResult && (
                                <Button
                                    type="button"
                                    onClick={applyBulkPastSettlement}
                                    disabled={bulkPastSettlementLoading || bulkPastSettlementConfirm !== 'SETTLE PAST BOOKINGS'}
                                    className="bg-[#0b776b] text-white hover:bg-[#096a60]"
                                >
                                    Settle and Check Out
                                </Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* ?? BULK IMPORT AUDIT HUB */}
            {bulkImportModal && (
                <SnapshotImportModal
                    importAnalysis={importAnalysis}
                    importFile={importFile}
                    importLoading={importLoading}
                    importNotice={importNotice}
                    onClose={resetImportModal}
                    onFileSelected={(file) => {
                        setImportFile(file);
                        setImportNotice(file ? `Loaded ${file.name}. Ready for preview.` : '');
                    }}
                    onPreview={() => previewSnapshotImport(importFile)}
                    onApply={applySnapshotImport}
                    onResetPreview={() => {
                        setImportAnalysis(null);
                        setImportNotice(importFile ? `Loaded ${importFile.name}. Ready for preview.` : '');
                    }}
                />
            )}

        </AppShell>
    );
}

function SnapshotImportModal({
    importAnalysis,
    importFile,
    importLoading,
    importNotice,
    onClose,
    onFileSelected,
    onPreview,
    onApply,
    onResetPreview,
}) {
    const createCount = importAnalysis?.summary?.action_counts?.CREATE || 0;
    const updateCount = importAnalysis?.summary?.action_counts?.UPDATE || 0;
    const conflictCount = importAnalysis?.summary?.action_counts?.CONFLICT || 0;
    const errorCount = importAnalysis?.summary?.action_counts?.ERROR || 0;
    const actionableCount = createCount + updateCount;

    const actionTone = (action) => {
        if (action === 'CREATE') return 'success';
        if (action === 'UPDATE') return 'info';
        if (action === 'CONFLICT' || action === 'ERROR') return 'danger';
        return 'neutral';
    };

    const downloadTemplate = () => {
        const csv = "Guest Name,Unit,Check-in,Check-out,Pax,DP,Balance\nJuan Dela Cruz,AC Kubo 1,01/05/2026,03/05/2026,4,1000,2500";
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'amalfi_snapshot_template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-hidden rounded-2xl sm:max-w-6xl">
                <DialogHeader>
                    <DialogTitle className="font-resortDisplay text-amalfi-ink">CSV Snapshot Importer</DialogTitle>
                    <DialogDescription>
                        Preview first, then apply only safe Manual Override rows into your Amalfi Master Ledger.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[66vh] overflow-y-auto pr-1">
                    {!!importNotice && (
                        <Card className="mb-4 rounded-2xl border-transparent bg-[#f7eedf]/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <CardContent className="p-3 text-sm font-bold text-amalfi-muted">
                            {importNotice}
                            </CardContent>
                        </Card>
                    )}

                    {!importAnalysis ? (
                        <Card className="rounded-2xl border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <CardContent className="grid justify-items-center gap-5 p-10 text-center">
                            <div className="grid size-16 place-items-center rounded-2xl bg-[#f7eedf] text-sm font-black text-amalfi-ink">CSV</div>
                            <div>
                                <h3 className="m-0 font-resortDisplay text-xl font-black text-amalfi-ink">Select Resort Snapshot CSV</h3>
                                <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-amalfi-muted">
                                    Upload the fixed snapshot format. Amalfi will classify every row as create, update, conflict, or error before anything is applied.
                                </p>
                            </div>
                            <input
                                type="file"
                                id="snapshot-csv-upload"
                                accept=".csv"
                                className="hidden"
                                onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
                            />
                            <div className="flex flex-wrap justify-center gap-3">
                                <Button className="rounded-2xl bg-amalfi-night px-6 text-[#f8e8c8] hover:bg-amalfi-night/90" onClick={() => document.getElementById('snapshot-csv-upload').click()}>
                                    {importFile ? importFile.name : 'SELECT CSV FILE'}
                                </Button>
                                <Button className="rounded-2xl" disabled={importLoading || !importFile} onClick={onPreview}>
                                    {importLoading ? 'PREVIEWING...' : 'PREVIEW CSV'}
                                </Button>
                                <Button variant="outline" className="rounded-2xl" onClick={downloadTemplate}>
                                    Download Template
                                </Button>
                            </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap gap-2">
                                    <StatusBadge tone="success">Create: {createCount}</StatusBadge>
                                    <StatusBadge tone="info">Update: {updateCount}</StatusBadge>
                                    <StatusBadge tone="danger">Conflicts: {conflictCount}</StatusBadge>
                                    <StatusBadge tone="warning">Errors: {errorCount}</StatusBadge>
                                </div>
                                <Button variant="outline" className="rounded-2xl" onClick={onResetPreview}>Start Over</Button>
                            </div>

                            <Card className="max-h-[420px] overflow-auto rounded-2xl border-[#d8c9b3]/70">
                                <Table className="text-xs">
                                    <TableHeader className="sticky top-0 z-10 bg-[#f7eedf]">
                                        <TableRow>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Row</TableHead>
                                            <TableHead>Guest</TableHead>
                                            <TableHead>Unit Mapping</TableHead>
                                            <TableHead>Stay</TableHead>
                                            <TableHead>Financials</TableHead>
                                            <TableHead>Audit Notes</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(importAnalysis.rows || []).map((row, i) => (
                                            <TableRow key={`${row.source_row}-${row.guest_name}-${i}`}>
                                                <TableCell>
                                                    <StatusBadge tone={actionTone(row.action)}>{row.action}</StatusBadge>
                                                </TableCell>
                                                <TableCell className="font-black text-amalfi-muted">{row.source_row}</TableCell>
                                                <TableCell className="font-bold">
                                                    <div>{row.guest_name || 'Unnamed Guest'}</div>
                                                    <div className="text-[0.68rem] font-semibold text-muted-foreground">Pax: {row.guests ?? 'Blank'}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold">{row.raw_unit || 'No Unit'}</div>
                                                    <div className="text-[0.68rem] font-semibold text-muted-foreground">{row.unit_id ? `${row.room_type} -> ${row.unit_id}` : 'Mapping failed'}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold">{row.check_in || 'Invalid'} to {row.check_out || 'Invalid'}</div>
                                                    <div className="text-[0.68rem] font-semibold text-muted-foreground">{row.status}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold">PHP {Number(row.total_price || 0).toLocaleString()}</div>
                                                    <div className="text-[0.68rem] font-bold text-amalfi-emerald">Paid: PHP {Number(row.amount_paid || 0).toLocaleString()}</div>
                                                    <div className="text-[0.68rem] font-bold text-amalfi-coral">Balance: PHP {Number(row.balance || 0).toLocaleString()}</div>
                                                </TableCell>
                                                <TableCell className={`text-[0.7rem] ${row.action === 'CONFLICT' || row.action === 'ERROR' ? 'font-black text-amalfi-coral' : 'font-semibold text-muted-foreground'}`}>
                                                    <div>{row.reason}</div>
                                                    {row.existing_booking_ref && <div className="mt-1 opacity-70">Ref: {row.existing_booking_ref}</div>}
                                                    {!!row.warnings?.length && <div className="mt-1 text-amber-800">{row.warnings.join(' | ')}</div>}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" className="rounded-2xl" onClick={onClose}>Close Auditor</Button>
                    {!!importAnalysis && actionableCount > 0 && (
                        <Button className="rounded-2xl bg-amalfi-night px-6 text-[#f8e8c8] hover:bg-amalfi-night/90" disabled={importLoading} onClick={onApply}>
                            {importLoading ? 'APPLYING SAFE ROWS...' : `APPLY SAFE ROWS (${actionableCount})`}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const BADGE = {
    green: { background: 'rgba(16,185,129,0.08)', color: 'var(--accent-emerald)', border: '1.5px solid rgba(16,185,129,0.2)', fontSize: '0.6rem', padding: '3px 10px', borderRadius: '8px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block' },
    amber: { background: 'rgba(217,119,6,0.08)',   color: 'var(--accent-gold)',    border: '1.5px solid rgba(217,119,6,0.2)',    fontSize: '0.6rem', padding: '3px 10px', borderRadius: '8px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block' },
    red:   { background: 'rgba(225,29,72,0.08)',   color: 'var(--accent-red)',     border: '1.5px solid rgba(225,29,72,0.2)',   fontSize: '0.6rem', padding: '3px 10px', borderRadius: '8px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block' },
    muted: { background: 'rgba(72,99,88,0.08)',    color: 'var(--sidebar-muted)',  border: '1.5px solid rgba(72,99,88,0.15)',    fontSize: '0.6rem', padding: '3px 10px', borderRadius: '8px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block' },
};
const COMPACT_HEAD = { color: 'rgba(28,37,32,0.5)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' };
const SECTION_HDR = { fontSize: '0.6rem', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--text-muted)', marginBottom: '20px', opacity: 0.95 };
const EMPTY_CELL  = { textAlign: 'center', padding: '80px', opacity: 0.35, fontSize: '0.8rem', fontWeight: 500, color: 'var(--sidebar-muted)' };

function ExportBtn({ onClick }) {
    const [busy, setBusy] = React.useState(false);
    const handle = async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } };
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handle}
            disabled={busy}
            className="rounded-xl text-[0.66rem] font-black shadow-[0_10px_22px_rgba(19,33,31,0.045)]"
            title="Export this view to PNG">
            {busy ? 'Capturing...' : 'Export PNG'}
        </Button>
    );
}

function getBookingMoney(row = {}) {
    const total = Number(row.total_price || 0);
    const addon = Number(row.addon_amount || 0);
    const paid = Number(row.amount_paid || 0);
    const grand = Number(row.grand_total || (total + addon));
    const storedBalance = Number(row.balance);
    const balance = Number.isFinite(storedBalance) && storedBalance >= 0
        ? storedBalance
        : Math.max(0, grand - paid);

    return { total, addon, paid, grand, balance };
}

function summarizeBookingRows(rows = []) {
    return rows.reduce((acc, row) => {
        const money = getBookingMoney(row);
        acc.billed += money.grand;
        acc.settled += money.paid;
        acc.balance += money.balance;
        return acc;
    }, { billed: 0, settled: 0, balance: 0 });
}

function normalizeUnitFamilyLabel(label = '') {
    return String(label)
        .replace(/\s+#\d+$/i, '')
        .replace(/\s+\d{1,3}$/i, '')
        .trim();
}

function pluralizeUnitFamilyLabel(label = '', count = 1) {
    if (count === 1) return label;
    return `${label}s`;
}

function getUnitDisplay(row = {}) {
    const summary = String(row.unit_summary || '').split(',').map((value) => value.trim()).filter(Boolean);
    const uniqueSummary = [...new Set(summary)];
    const hasExpandedSummary = uniqueSummary.length > 1 || (uniqueSummary.length === 1 && uniqueSummary[0] !== (row.unit_label || row.unit_id));

    if (hasExpandedSummary) {
        const groupedFamilies = new Map();
        for (const label of uniqueSummary) {
            const familyLabel = normalizeUnitFamilyLabel(label) || label;
            if (!groupedFamilies.has(familyLabel)) groupedFamilies.set(familyLabel, []);
            groupedFamilies.get(familyLabel).push(label);
        }

        const groupedSummary = [...groupedFamilies.entries()]
            .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
            .map(([familyLabel, labels]) => (
                labels.length > 1
                    ? `${pluralizeUnitFamilyLabel(familyLabel, labels.length)} x${labels.length}`
                    : familyLabel
            ))
            .join(', ');

        const preview = uniqueSummary.slice(0, 3).join(', ');
        const remainder = Math.max(0, uniqueSummary.length - 3);
        return {
            primary: 'Multi-booking',
            secondary: groupedSummary || row.room_type || 'Multiple Units',
            detail: remainder > 0 ? `${preview} +${remainder} more` : preview
        };
    }

    return {
        primary: 'Solo-booking',
        secondary: normalizeUnitFamilyLabel(row.unit_label || row.unit_id || row.room_type || 'Unassigned'),
        detail: null
    };
}

function bookingStatusBadge(row, todayStr, mode = 'all') {
    if (mode === 'past') {
        if (row.status === 'CANCELLED') return <StatusBadge tone="danger">Cancelled</StatusBadge>;
        if (row.check_out === todayStr) return <StatusBadge tone="warning">Due Out Today</StatusBadge>;
        return <StatusBadge tone="neutral">Closed</StatusBadge>;
    }

    if (mode === 'arrivals') {
        if (row.status === 'CHECKED_IN') return <StatusBadge tone="success">Checked In</StatusBadge>;
        return <StatusBadge tone="warning">{daysUntil(row.check_in)}</StatusBadge>;
    }

    if (mode === 'departures') {
        if (row.check_out === todayStr) return <StatusBadge tone="danger">Due Out Today</StatusBadge>;
        return <StatusBadge tone="success">Checked In</StatusBadge>;
    }

    if (
        row.status === 'CHECKED_IN' ||
        (row.status === 'RESERVED' && row.check_in && row.check_out && todayStr >= row.check_in && todayStr < row.check_out)
    ) {
        if (row.check_out === todayStr) return <StatusBadge tone="danger">Due Out Today</StatusBadge>;
        return <StatusBadge tone="success">Checked In</StatusBadge>;
    }
    return <StatusBadge tone="neutral">{bookingStatusLabel(row.status)}</StatusBadge>;
}

function bookingStatusLabel(status) {
    const labelMap = {
        RESERVED: 'Reserved',
        CHECKED_IN: 'Checked In',
        PENDING_VERIFICATION: 'Pending Verification',
        CHECKED_OUT: 'Checked Out',
        CANCELLED: 'Cancelled',
        PAID: 'Paid',
        UNPAID: 'Unpaid',
    };
    if (!status) return 'Open';
    return labelMap[status] || String(status).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function CompactBookingTable({
    title,
    rows = [],
    currentPage,
    pageSize,
    onPageChange,
    todayStr,
    mode = 'all',
    totals,
    onOpenRow,
    onEditRow,
    onUnitChangeRow,
    onDeleteRow,
    onPrimaryAction,
    primaryBusyRef,
    onBulkAction,
    bulkActionLabel,
    bulkActionTone = 'green',
    bulkDisabled = false,
}) {
    const [createdSortDir, setCreatedSortDir] = React.useState('desc');
    const sortedRows = React.useMemo(() => (
        [...rows].sort((left, right) => {
            const result = String(left.created_at || '').localeCompare(String(right.created_at || ''));
            return createdSortDir === 'asc' ? result : -result;
        })
    ), [rows, createdSortDir]);
    const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const bulkVariant = bulkActionTone === 'red' ? 'destructive' : 'default';

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 font-resortDisplay text-admin-section font-black tracking-normal text-[#13211f]">{title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full border border-[#d8c9b3]/70 bg-[#f7eedf]/70 px-3 py-1 text-[0.62rem] font-black tracking-normal text-[#5f6d66]">
                        Showing {rows.length} records
                    </Badge>
                    {onBulkAction && (
                        <Button
                            variant={bulkVariant}
                            size="sm"
                            className="rounded-full font-black"
                            disabled={bulkDisabled}
                            onClick={onBulkAction}
                        >
                            {bulkActionLabel}
                        </Button>
                    )}
                </div>
            </div>
            <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[24px]">
                <Table>
                    <TableHeader className="bg-[#f7eedf]/70">
                        <TableRow>
                            <TableHead>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-none border-0 bg-transparent p-0 text-left font-inherit text-[inherit] font-black uppercase tracking-normal text-[#315044] shadow-none outline-none transition hover:text-[#b98330] focus-visible:ring-2 focus-visible:ring-[#c6923f]/45"
                                    onClick={() => {
                                        setCreatedSortDir((current) => current === 'asc' ? 'desc' : 'asc');
                                        onPageChange?.(1);
                                    }}
                                >
                                    Created On
                                    <ArrowUpDown size={12} className="text-[#8a6a35]" />
                                    <span className="rounded-full bg-[#fff8ec]/80 px-1.5 py-0.5 text-[0.5rem] font-black text-[#8a6a35]">{createdSortDir === 'asc' ? 'Oldest' : 'Newest'}</span>
                                </button>
                            </TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Guest</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Units</TableHead>
                            <TableHead>Check In</TableHead>
                            <TableHead>Check Out</TableHead>
                            <TableHead>Pax</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={12}>
                                    <EmptyState
                                        title="No matching bookings"
                                        description="No bookings match the current ledger view."
                                        className="border-0 bg-transparent shadow-none"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : pagedRows.map((row) => {
                            const money = getBookingMoney(row);
                            const nights = row.check_in && row.check_out ? getNights(row.check_in, row.check_out) : '-';
                            const unitDisplay = getUnitDisplay(row);
                            const primaryLabel = mode === 'departures'
                                ? 'Check Out'
                                : mode === 'arrivals'
                                    ? getTodayCheckInActionLabel(row)
                                    : mode === 'payments'
                                        ? 'Record Pay'
                                    : null;
                            const primaryVariant = mode === 'departures' ? 'destructive' : 'default';
                            const primaryDisabled = primaryBusyRef === row.booking_ref;
                            const editLabel = mode === 'past' ? 'Correct Record' : 'Edit';
                            return (
                                <TableRow key={`${mode}-${row.booking_ref}-${row.record_origin || 'row'}`}>
                                    <TableCell data-label="Created On">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{row.created_at ? fmtTs(row.created_at) : '-'}</div>
                                            <div className="text-[0.65rem] font-semibold text-muted-foreground">booking created</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Reference">
                                        <div className="font-black text-amalfi-ink">{row.booking_ref}</div>
                                    </TableCell>
                                    <TableCell data-label="Guest">
                                        <div className="grid gap-1">
                                            <div className="font-bold text-amalfi-ink">{row.full_name || row.guest_name || 'Unnamed guest'}</div>
                                            {(row.phone || row.email) && (
                                                <span className="text-[0.68rem] font-semibold text-muted-foreground">{row.phone || row.email}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Source">
                                        <SourceBadge row={row} />
                                    </TableCell>
                                    <TableCell data-label="Units">
                                        <div className="grid gap-1">
                                            <div className="font-black leading-snug text-amalfi-gold">{unitDisplay.primary}</div>
                                            {unitDisplay.secondary && (
                                                <div className="text-[0.65rem] font-black uppercase text-muted-foreground">
                                                    {unitDisplay.secondary}
                                                </div>
                                            )}
                                            {unitDisplay.detail && (
                                                <div className="text-[0.68rem] font-semibold text-amalfi-muted">
                                                    {unitDisplay.detail}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Check In">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{row.check_in || '-'}</div>
                                            <div className="text-[0.65rem] font-semibold text-muted-foreground">arrival</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Check Out">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{row.check_out || '-'}</div>
                                            <div className="text-[0.65rem] font-semibold text-muted-foreground">{nights}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Pax">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">
                                                {row.pax || row.guests || '-'}
                                            </div>
                                            <div className="text-[0.65rem] font-semibold text-muted-foreground">
                                                guests
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Status">
                                        <div className="grid gap-2">
                                            {bookingStatusBadge(row, todayStr, mode)}
                                            <div className="text-[0.68rem] font-semibold text-muted-foreground">
                                                {mode === 'departures'
                                                    ? `Departure ${row.check_out || '-'}`
                                                    : mode === 'payments'
                                                        ? paymentStatusLabel(row.payment_status)
                                                    : mode === 'arrivals'
                                                        ? `Arrival ${row.check_in || '-'}`
                                                        : mode === 'upcoming'
                                                            ? `Arrival ${row.check_in || '-'}`
                                                        : paymentStatusLabel(row.payment_status)}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Payment">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">PHP {money.grand.toLocaleString()}</div>
                                            <div className="text-[0.7rem] font-bold text-amalfi-emerald">Paid PHP {money.paid.toLocaleString()}</div>
                                            <div className={`text-[0.7rem] font-black ${money.balance > 0 ? 'text-amalfi-coral' : 'text-amalfi-emerald'}`}>
                                                Balance PHP {money.balance.toLocaleString()}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Payment Status">
                                        <PayBadge paid={money.paid} total={money.grand} />
                                    </TableCell>
                                    <TableCell data-label="Actions">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {onOpenRow && (
                                                <Button size="sm" className="rounded-full font-black" onClick={() => onOpenRow(row)}>
                                                    Open
                                                </Button>
                                            )}
                                            {onEditRow && (
                                                <Button variant="outline" size="sm" className="rounded-full font-black" onClick={() => onEditRow(row)}>
                                                    {editLabel}
                                                </Button>
                                            )}
                                            {onUnitChangeRow && (
                                                <Button variant="outline" size="sm" className="rounded-full font-black" onClick={() => onUnitChangeRow(row)}>
                                                    Change Unit
                                                </Button>
                                            )}
                                            {primaryLabel && onPrimaryAction && (
                                                <Button
                                                    variant={primaryVariant}
                                                    size="sm"
                                                    className="rounded-full font-black"
                                                    disabled={primaryDisabled}
                                                    onClick={() => onPrimaryAction(row)}
                                                >
                                                    {primaryDisabled ? 'Working...' : primaryLabel}
                                                </Button>
                                            )}
                                            {['all', 'upcoming'].includes(mode) && onDeleteRow && (
                                                <Button variant="destructive" size="sm" className="rounded-full font-black" onClick={() => onDeleteRow(row)}>
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    <TableFooter className="border-[#d8c9b3]/70 bg-[#f7eedf]/70">
                        <TableRow>
                            <TableCell data-label="Totals" colSpan={9} className="text-[0.68rem] font-black tracking-normal text-[#5f6d66]">Filtered Totals</TableCell>
                            <TableCell data-label="Rows" className="font-black text-amalfi-ink">{rows.length} rows</TableCell>
                            <TableCell data-label="Payment Total" className="leading-6">
                                <div>Billed PHP {Number(totals?.billed || 0).toLocaleString()}</div>
                                <div className="text-amalfi-emerald">Paid PHP {Number(totals?.settled || 0).toLocaleString()}</div>
                                <div className="text-amalfi-coral">Balance PHP {Number(totals?.balance || 0).toLocaleString()}</div>
                            </TableCell>
                            <TableCell data-label="Actions" />
                        </TableRow>
                    </TableFooter>
                </Table>
            </Card>
            <TablePagination current={currentPage} total={rows.length} pageSize={pageSize} onPageChange={onPageChange} />
        </div>
    );
}

function stayFallsWithinDateWindow(row = {}, window = {}) {
    const checkIn = row.check_in || '';
    const checkOut = row.check_out || '';
    const from = window.from || '';
    const to = window.to || '';

    if (!checkIn && !checkOut) return false;
    if (from && (!checkIn || checkIn < from)) return false;
    if (to && (!checkOut || checkOut > to)) return false;
    return true;
}

function CompactTransactionTable({ rows = [], ledger = [], currentPage, pageSize, onPageChange, onOpenRow, onEditRow }) {
    const [postedSortDir, setPostedSortDir] = React.useState('desc');
    const sortedRows = React.useMemo(() => (
        [...rows].sort((left, right) => {
            const result = String(left.created_at || '').localeCompare(String(right.created_at || ''));
            return postedSortDir === 'asc' ? result : -result;
        })
    ), [rows, postedSortDir]);
    const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const hasActions = Boolean(onOpenRow || onEditRow);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 font-resortDisplay text-admin-section font-black tracking-normal text-[#13211f]">Transaction Log</h2>
                <Badge variant="secondary" className="rounded-full border border-[#d8c9b3]/70 bg-[#f7eedf]/70 px-3 py-1 text-[0.62rem] font-black tracking-normal text-[#5f6d66]">{rows.length} events</Badge>
            </div>
            <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[24px]">
                <Table>
                    <TableHeader className="bg-[#f7eedf]/70">
                        <TableRow>
                            <TableHead>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-none border-0 bg-transparent p-0 text-left font-inherit text-[inherit] font-black uppercase tracking-normal text-[#315044] shadow-none outline-none transition hover:text-[#b98330] focus-visible:ring-2 focus-visible:ring-[#c6923f]/45"
                                    onClick={() => {
                                        setPostedSortDir((current) => current === 'asc' ? 'desc' : 'asc');
                                        onPageChange?.(1);
                                    }}
                                >
                                    Posted On
                                    <ArrowUpDown size={12} className="text-[#8a6a35]" />
                                    <span className="rounded-full bg-[#fff8ec]/80 px-1.5 py-0.5 text-[0.5rem] font-black text-[#8a6a35]">{postedSortDir === 'asc' ? 'Oldest' : 'Newest'}</span>
                                </button>
                            </TableHead>
                            <TableHead>Check In</TableHead>
                            <TableHead>Check Out</TableHead>
                            <TableHead>Booking</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            {hasActions && <TableHead>Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={hasActions ? 8 : 7}>
                                    <EmptyState
                                        title="No transactions"
                                        description="No transactions are recorded for this ledger view yet."
                                        className="border-0 bg-transparent shadow-none"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : pagedRows.map((tx) => {
                            const linkedBooking = ledger.find((row) => row.booking_ref === tx.booking_ref);
                            const checkIn = tx.check_in || linkedBooking?.check_in;
                            const checkOut = tx.check_out || linkedBooking?.check_out;
                            const nights = checkIn && checkOut ? getNights(checkIn, checkOut) : '-';
                            return (
                                <TableRow key={tx.id}>
                                    <TableCell data-label="Posted On">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{tx.created_at ? fmtTs(tx.created_at) : '-'}</div>
                                            <div className="text-[0.68rem] font-semibold text-muted-foreground">transaction posted</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Check In">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{checkIn || '-'}</div>
                                            <div className="text-[0.68rem] font-semibold text-muted-foreground">arrival</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Check Out">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{checkOut || '-'}</div>
                                            <div className="text-[0.68rem] font-semibold text-muted-foreground">{nights}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Booking">
                                        <div className="grid gap-1">
                                            <div className="font-black text-amalfi-ink">{tx.booking_ref}</div>
                                            <div className="font-bold">{tx.full_name || tx.guest_name || linkedBooking?.full_name || '-'}</div>
                                            <div className="text-[0.68rem] font-semibold text-muted-foreground">{tx.unit_label || tx.unit_id || linkedBooking?.unit_label || 'No unit summary'}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Event">
                                        <div className="grid gap-1">
                                            <span className="text-[0.72rem] font-black text-amalfi-muted">{tx.transaction_type || '-'}</span>
                                            <span className="text-[0.68rem] font-semibold text-muted-foreground">{tx.payment_method || tx.booking_source || 'No source note'}</span>
                                            <span className="text-[0.68rem] font-semibold text-muted-foreground">{tx.record_origin === 'transaction_payment' ? 'Header Payment' : 'Legacy Transaction'}</span>
                                            {(tx.tx_notes || tx.booking_notes) && (
                                                <span className="text-[0.68rem] font-semibold text-muted-foreground">{tx.tx_notes || tx.booking_notes}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell data-label="Amount" className={`font-black ${tx.status === 'REJECTED' ? 'text-amalfi-coral' : 'text-amalfi-ink'}`}>
                                        PHP {Number(tx.amount || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell data-label="Status">{txStatusBadge(tx.status)}</TableCell>
                                    {hasActions && (
                                        <TableCell data-label="Actions">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {onOpenRow && (
                                                    <Button size="sm" className="rounded-full font-black" onClick={() => onOpenRow(tx)}>
                                                        Open
                                                    </Button>
                                                )}
                                                {onEditRow && (
                                                    <Button variant="outline" size="sm" className="rounded-full font-black" onClick={() => onEditRow(tx)}>
                                                        Edit
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Card>
            <TablePagination current={currentPage} total={rows.length} pageSize={pageSize} onPageChange={onPageChange} />
        </div>
    );
}

function PayBadge({ paid, total }) {
    const p = Number(paid || 0);
    const t = Number(total || 0);
    if (t === 0) return <StatusBadge tone="neutral">No Charge</StatusBadge>;
    if (p >= t) return <StatusBadge tone="success">Settled</StatusBadge>;
    if (p > 0) return <StatusBadge tone="warning">Partial</StatusBadge>;
    return <StatusBadge tone="danger">Unpaid</StatusBadge>;
}

function SourceBadge({ row }) {
    const isAdmin = row.created_by === 'admin';
    const isPortal = row.created_by && !isAdmin;
    let label = 'WEB';
    let tone = 'info';

    if (isAdmin) {
        label = 'ADMIN';
        tone = 'neutral';
    } else if (isPortal) {
        label = 'PORTAL';
    }

    return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function txStatusBadge(status) {
    if (status === 'RESERVED') return <StatusBadge tone="success">Reserved</StatusBadge>;
    if (status === 'REJECTED') return <StatusBadge tone="danger">Rejected</StatusBadge>;
    return <StatusBadge tone="warning">Pending</StatusBadge>;
}

function fmtDate(d) {
    return formatDateOnlyInManila(d, 'en-PH', { month: 'short', day: 'numeric' });
}

function fmtTs(ts) {
    return formatDateTimeInManila(ts, 'en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getNights(inDate, outDate) {
    const diff = diffDateOnlyDays(inDate, outDate);
    return diff > 0 ? `${diff}n` : '0n';
}

function daysUntil(d) {
    if (!d) return '-';
    const diff = diffDateOnlyDays(getManilaTodayKey(), d);
    if (diff === 0) return <span className="font-black text-amalfi-emerald">Today</span>;
    if (diff === 1) return <span className="font-bold text-amalfi-gold">In 1d</span>;
    if (diff < 0) return <span className="text-muted-foreground">Past</span>;
    return `In ${diff}d`;
}

function useSort(data, initialKey = null, initialDir = 'asc') {
    const [sortKey, setSortKey] = React.useState(initialKey);
    const [sortDir, setSortDir] = React.useState(initialDir);
    const toggle = (col) => {
        if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(col); setSortDir('asc'); }
    };
    const sorted = React.useMemo(() => {
        if (!sortKey || !data) return data || [];
        return [...data].sort((a, b) => {
            const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
            const res = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return sortDir === 'asc' ? res : -res;
        });
    }, [data, sortKey, sortDir]);
    return { sortKey, sortDir, toggle, sorted };
}

function SortTh({ col, label, sortKey, sortDir, onSort, className = '' }) {
    const active = sortKey === col;
    return (
        <th onClick={() => onSort(col)} className={`cursor-pointer select-none text-[0.6rem] font-extrabold uppercase tracking-[1px] ${active ? 'text-amalfi-muted' : 'text-amalfi-muted/70'} ${className}`}>
            {label} {active ? (sortDir === 'asc' ? '^' : 'v') : ''}
        </th>
    );
}

function TablePagination({ current, total, pageSize, onPageChange }) {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return null;
    const start = ((current - 1) * pageSize) + 1;
    const end = Math.min(current * pageSize, total);
    const pages = Array.from(
        new Set([1, current - 1, current, current + 1, totalPages].filter(page => page >= 1 && page <= totalPages))
    ).sort((a, b) => a - b);

    return (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-transparent bg-[#fffdf8]/88 shadow-[0_16px_36px_rgba(19,33,31,0.06)] p-4">
            <span className="text-sm font-bold text-muted-foreground">Showing {start} to {end} of {total} records</span>
            <div className="flex flex-wrap items-center gap-2" aria-label="Table pagination">
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={current === 1}
                    onClick={() => onPageChange(current - 1)}
                    aria-label="Previous page"
                >
                    Previous
                </Button>
                {pages.map((page, index) => {
                    const previous = pages[index - 1];
                    return (
                        <React.Fragment key={page}>
                            {previous && page - previous > 1 && <span className="px-1 text-muted-foreground">...</span>}
                            <Button
                                variant={page === current ? 'default' : 'outline'}
                                size="sm"
                                className="rounded-full"
                                onClick={() => onPageChange(page)}
                                aria-current={page === current ? 'page' : undefined}
                            >
                                {page}
                            </Button>
                        </React.Fragment>
                    );
                })}
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={current === totalPages}
                    onClick={() => onPageChange(current + 1)}
                    aria-label="Next page"
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
