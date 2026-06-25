const LEDGER_SYNC_STATUSES = new Set([
    'RESERVED',
    'CHECKED_IN',
    'RESERVED',
    'PARTIAL',
    'PENDING_VERIFICATION'
]);

const SNAPSHOT_EXPORT_HEADERS = [
    'Booking Ref',
    'Guest Name',
    'Unit',
    'Room Type',
    'Check-in',
    'Check-out',
    'Pax',
    'Total Price',
    'DP',
    'Balance',
    'Add-on Amount',
    'Payment Status',
    'Status',
    'Booking Source',
    'Notes',
    'Special Requests'
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

export function getManilaDateKey(dateLike = new Date()) {
    const parts = dateFormatter.formatToParts(new Date(dateLike));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function formatSnapshotDate(value) {
    const raw = String(value ?? '').trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${day}/${month}/${year}`;
    }

    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return raw;

    const year = String(parsed.getUTCFullYear());
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
}

export function formatSnapshotMoney(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function escapeCsvCell(value) {
    const stringValue = String(value ?? '');
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function pluralizeRoomLabel(label = '', count = 1) {
    if (count === 1) return label;
    if (/Villa$/i.test(label)) return `${label}s`;
    if (/Teepee$/i.test(label)) return `${label}s`;
    if (/Kubo$/i.test(label)) return `${label}s`;
    return `${label}s`;
}

function normalizeUnitFamilyLabel(label = '') {
    return String(label)
        .replace(/\s+#\d+$/i, '')
        .replace(/\s+\d{1,3}$/i, '')
        .trim();
}

function splitUnitSummary(unitSummary = '') {
    return String(unitSummary)
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean);
}

export function buildLedgerAllocationMeta(row = {}) {
    const listedUnits = splitUnitSummary(row.unit_summary);
    const fallbackUnit = String(row.unit_label || row.unit_id || '').trim();
    const units = listedUnits.length
        ? listedUnits
        : (fallbackUnit && fallbackUnit !== 'Multiple Units' ? [fallbackUnit] : []);

    const groupedUnits = new Map();
    for (const unitLabel of units) {
        const familyLabel = normalizeUnitFamilyLabel(unitLabel) || unitLabel;
        if (!groupedUnits.has(familyLabel)) {
            groupedUnits.set(familyLabel, []);
        }
        groupedUnits.get(familyLabel).push(unitLabel);
    }

    const bookingCount = units.length || Number(row.booking_items_count) || (fallbackUnit ? 1 : 0);
    const bookingKind = bookingCount > 1 ? 'Multi-booking' : 'Solo-booking';

    const groupedSummary = [...groupedUnits.entries()]
        .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
        .map(([familyLabel, labels]) => (
            labels.length > 1
                ? `${pluralizeRoomLabel(familyLabel, labels.length)} x${labels.length}`
                : familyLabel
        ));

    const primaryLabel = groupedSummary.join(', ') || row.room_type || 'Unassigned';
    const secondaryLabel = units.join(' â€¢ ') || fallbackUnit || row.room_type || 'No unit assigned yet';

    return {
        bookingCount,
        bookingKind,
        primaryLabel,
        secondaryLabel,
        isGrouped: groupedUnits.size > 0
    };
}

export function buildCurrentBookingsSnapshotCsv(ledger = [], todayKey = getManilaDateKey()) {
    const candidateRows = ledger
        .filter((row) => {
            if (!LEDGER_SYNC_STATUSES.has(row.status)) return false;
            if (!row.check_out || row.check_out < todayKey) return false;
            return true;
        })
        .sort((a, b) => String(a.check_in || '').localeCompare(String(b.check_in || '')));

    const exportableRows = candidateRows.filter((row) => row.unit_label || row.unit_id);
    const csvRows = exportableRows.map((row) => ([
        row.booking_ref || '',
        row.full_name || row.guest_name || '',
        row.unit_label || row.unit_id || '',
        row.room_type || '',
        formatSnapshotDate(row.check_in),
        formatSnapshotDate(row.check_out),
        row.guests ?? row.pax ?? '',
        formatSnapshotMoney(row.total_price),
        formatSnapshotMoney(row.amount_paid ?? row.deposit_paid ?? 0),
        formatSnapshotMoney(row.balance),
        formatSnapshotMoney(row.addon_amount ?? 0),
        row.payment_status || '',
        row.status || '',
        row.booking_source || '',
        row.notes || '',
        row.special_requests || ''
    ]));

    const csvContent = exportableRows.length
        ? [SNAPSHOT_EXPORT_HEADERS, ...csvRows]
            .map((line) => line.map(escapeCsvCell).join(','))
            .join('\n')
        : '';

    return {
        candidateCount: candidateRows.length,
        exportedCount: exportableRows.length,
        skippedUnassignedCount: candidateRows.length - exportableRows.length,
        csvContent
    };
}

export function decorateUnitsWithLedger(units = [], ledger = [], todayKey = getManilaDateKey()) {
    const bookingsByUnit = new Map();
    const orderedLedger = [...ledger].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    for (const booking of orderedLedger) {
        if (!booking?.unit_id || bookingsByUnit.has(booking.unit_id)) continue;
        if (!LEDGER_SYNC_STATUSES.has(booking.status)) continue;
        if (!booking.check_in || !booking.check_out) continue;
        if (!(booking.check_in <= todayKey && booking.check_out > todayKey)) continue;

        bookingsByUnit.set(booking.unit_id, {
            booking_ref: booking.booking_ref,
            guest_name: booking.full_name || booking.guest_name || '',
            check_in: booking.check_in,
            check_out: booking.check_out,
            status: booking.status,
            payment_status: booking.payment_status || 'PENDING_VERIFICATION'
        });
    }

    return units.map((unit) => {
        const activeBooking = bookingsByUnit.get(unit.unit_id) || unit.active_booking || null;
        return {
            ...unit,
            available: activeBooking ? false : (typeof unit.available === 'boolean' ? unit.available : true),
            active_booking: activeBooking
        };
    });
}
