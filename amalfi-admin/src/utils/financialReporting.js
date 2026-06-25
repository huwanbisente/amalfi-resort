import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export const REPORT_MONTHS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
];

const AGENT_ELIGIBLE_STATUSES = ['RESERVED', 'CHECKED_IN', 'CHECKED_OUT'];
const EXCLUDED_FINANCIAL_STATUSES = ['CANCELLED', 'REJECTED', 'PENDING_VERIFICATION'];

export function formatCurrency(v) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0,
    }).format(Number(v || 0));
}

export function getAvailableReportYears(rows = []) {
    const years = new Set();
    rows.forEach((row) => {
        const dateStr = row?.check_in || row?.created_at;
        if (!dateStr || typeof dateStr !== 'string') return;
        const year = dateStr.slice(0, 4);
        if (/^\d{4}$/.test(year)) years.add(year);
    });

    if (years.size === 0) years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
}

export function getReportPeriodLabel(selectedMonth = 'all', selectedYear = 'all') {
    const monthLabel = REPORT_MONTHS.find((m) => m.value === selectedMonth)?.label;
    if (selectedMonth !== 'all' && selectedYear !== 'all') return `${monthLabel} ${selectedYear}`;
    if (selectedMonth !== 'all') return monthLabel || 'Selected Month';
    if (selectedYear !== 'all') return `Year ${selectedYear}`;
    return 'All Periods';
}

export function getDateRangeLabel(dateFrom = '', dateTo = '') {
    if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`;
    if (dateFrom) return `From ${dateFrom}`;
    if (dateTo) return `Through ${dateTo}`;
    return '';
}

function matchesPeriod(row, selectedMonth, selectedYear) {
    if (selectedMonth === 'all' && selectedYear === 'all') return true;
    const dateStr = row?.check_in || row?.created_at;
    if (!dateStr || typeof dateStr !== 'string') return false;
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(5, 7);
    const monthMatches = selectedMonth === 'all' || selectedMonth === month;
    const yearMatches = selectedYear === 'all' || selectedYear === year;
    return monthMatches && yearMatches;
}

function matchesDateRange(row, dateFrom = '', dateTo = '') {
    if (!dateFrom && !dateTo) return true;
    const dateStr = getLedgerDate(row).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo) return false;
    return true;
}

function dedupeTransactions(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        if (!row?.booking_ref) return true;
        if (seen.has(row.booking_ref)) return false;
        seen.add(row.booking_ref);
        return true;
    });
}

function toNumber(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
}

function getGross(row) {
    return toNumber(row.total_price) + toNumber(row.addon_amount);
}

function getNetPaid(row) {
    return toNumber(row.amount_paid) - toNumber(row.amount_refunded);
}

function getBalance(row) {
    return Math.max(0, getGross(row) - getNetPaid(row));
}

function getPaymentState(row) {
    const gross = getGross(row);
    const paid = getNetPaid(row);
    if (gross <= 0) return 'Zero';
    if (paid <= 0) return 'Unpaid';
    if (paid >= gross) return 'Paid';
    return 'Partial';
}

function getLedgerDate(row) {
    return row?.check_in || row?.created_at || '';
}

export function buildFinancialReportModel({
    ledger = [],
    specialBookings = [],
    receivables = [],
    selectedMonth = 'all',
    selectedYear = 'all',
    dateFrom = '',
    dateTo = '',
    today = new Date(),
} = {}) {
    const merged = dedupeTransactions([...ledger, ...specialBookings])
        .filter((row) => !EXCLUDED_FINANCIAL_STATUSES.includes(row?.status))
        .filter((row) => matchesPeriod(row, selectedMonth, selectedYear))
        .filter((row) => matchesDateRange(row, dateFrom, dateTo));

    const sortedLedger = [...merged].sort((a, b) => getLedgerDate(b).localeCompare(getLedgerDate(a)));
    const filteredReceivables = receivables
        .filter((row) => matchesPeriod(row, selectedMonth, selectedYear))
        .filter((row) => matchesDateRange(row, dateFrom, dateTo));

    const totals = sortedLedger.reduce((acc, row) => {
        const gross = getGross(row);
        const paid = getNetPaid(row);
        const refunded = toNumber(row.amount_refunded);
        const balance = getBalance(row);

        acc.grossBilled += gross;
        acc.cashCollected += paid;
        acc.refunds += refunded;
        acc.outstanding += balance;
        acc.bookingCount += 1;
        if (AGENT_ELIGIBLE_STATUSES.includes(row.status)) {
            acc.agentCommission += gross * 0.025;
            acc.agentEligibleCount += 1;
        }

        const paymentState = getPaymentState(row);
        acc.paymentMix[paymentState] = (acc.paymentMix[paymentState] || 0) + 1;

        const roomType = row.room_type || row.booking_type || 'Other';
        if (!acc.roomPerformance[roomType]) {
            acc.roomPerformance[roomType] = { gross: 0, bookings: 0 };
        }
        acc.roomPerformance[roomType].gross += gross;
        acc.roomPerformance[roomType].bookings += 1;
        return acc;
    }, {
        grossBilled: 0,
        cashCollected: 0,
        refunds: 0,
        outstanding: 0,
        agentCommission: 0,
        bookingCount: 0,
        agentEligibleCount: 0,
        paymentMix: { Paid: 0, Partial: 0, Unpaid: 0, Zero: 0 },
        roomPerformance: {},
    });

    const netAfterRefunds = totals.cashCollected;
    const netAfterCommission = netAfterRefunds - totals.agentCommission;

    const aging = filteredReceivables.reduce((acc, row) => {
        const balance = getBalance(row);
        if (balance <= 0) return acc;

        const basis = row.check_in || row.created_at;
        let bucket = 'Current';
        if (basis) {
            try {
                const age = differenceInCalendarDays(today, parseISO(basis));
                if (age > 60) bucket = '61+ Days';
                else if (age > 30) bucket = '31-60 Days';
                else if (age > 0) bucket = '1-30 Days';
            } catch {
                bucket = 'Current';
            }
        }

        acc[bucket] += balance;
        return acc;
    }, { Current: 0, '1-30 Days': 0, '31-60 Days': 0, '61+ Days': 0 });

    const topRoomTypes = Object.entries(totals.roomPerformance)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.gross - a.gross)
        .slice(0, 5);

    const basePeriod = getReportPeriodLabel(selectedMonth, selectedYear);
    const rangeLabel = getDateRangeLabel(dateFrom, dateTo);
    const reportPeriod = rangeLabel ? `${basePeriod} | ${rangeLabel}` : basePeriod;
    const generatedAt = format(today, 'MMMM d, yyyy h:mm a');

    return {
        reportPeriod,
        generatedAt,
        ledger: sortedLedger,
        receivables: filteredReceivables.filter((row) => getBalance(row) > 0),
        totals: {
            ...totals,
            netAfterRefunds,
            netAfterCommission,
        },
        aging,
        topRoomTypes,
    };
}

export function mapLedgerRowForExport(row) {
    const gross = getGross(row);
    const paid = getNetPaid(row);
    const balance = getBalance(row);
    const commission = AGENT_ELIGIBLE_STATUSES.includes(row?.status) ? gross * 0.025 : 0;

    return {
        bookingRef: row.booking_ref || '',
        guestName: row.full_name || '',
        service: row.room_type || row.booking_type || 'Custom Service',
        stayWindow: (row.check_in && row.check_out) ? `${row.check_in} TO ${row.check_out}` : 'N/A',
        grossAmount: gross.toFixed(2),
        amountPaid: paid.toFixed(2),
        balance: balance.toFixed(2),
        paymentStatus: getPaymentState(row),
        reservationStatus: row.status || 'N/A',
        source: row.created_by === 'admin' ? 'Admin' : 'Web Portal',
        commissionEligible: commission > 0 ? 'YES' : 'NO',
        commissionAmount: commission.toFixed(2),
        createdAt: row.created_at || '-',
    };
}
