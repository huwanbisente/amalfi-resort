export const MANUAL_STATUS_OPTIONS = [
    'PENDING_VERIFICATION',
    'RESERVED',
    'CHECKED_IN',
    'CANCELLED'
];

export const DEFAULT_ALLOCATION_STATUS = 'PENDING_VERIFICATION';

export function getBookingActionState(booking = {}, balanceDue = 0) {
    const status = String(booking?.status || '').toUpperCase();
    const settledBalance = Number(balanceDue || 0);

    return {
        canCheckIn: !['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].includes(status),
        canCheckout: status === 'CHECKED_IN' && settledBalance <= 1,
        canSaveStatus: status !== 'CHECKED_OUT'
    };
}

export function isTodayCheckInRow(booking = {}, todayKey = '') {
    const status = String(booking?.status || '').toUpperCase();
    return booking?.check_in === todayKey && ['RESERVED', 'CHECKED_IN'].includes(status);
}

export function getTodayCheckInActionLabel(booking = {}) {
    return String(booking?.status || '').toUpperCase() === 'RESERVED' ? 'Check In' : null;
}

export function isPaymentDueRow(booking = {}) {
    const status = String(booking?.status || '').toUpperCase();
    const openLifecycle = ['RESERVED', 'CHECKED_IN'].includes(status);
    if (!openLifecycle) return false;

    const snapshot = getBookingFinancialSnapshot(booking);
    return Number(snapshot.balance || 0) > 1;
}

export function validateOverviewDraft(draft = {}) {
    const fullName = String(draft.full_name || '').trim();
    const checkIn = String(draft.check_in || '');
    const checkOut = String(draft.check_out || '');

    if (!fullName) return 'Guest name is required.';
    if (!checkIn || !checkOut) return 'Check-in and check-out dates are required.';
    if (checkOut <= checkIn) return 'Check-out must be after check-in.';

    return '';
}

export function getSummaryGuestCount(booking = {}, units = []) {
    const assignedGuests = units.reduce((sum, unit) => sum + Number(unit?.guest_count ?? unit?.guests ?? 0), 0);
    if (assignedGuests > 0) return assignedGuests;
    return Number(booking?.guests || booking?.pax || 0);
}

export function getUnitDraftState(unit = {}, draft = {}, candidates = []) {
    const currentUnitId = String(unit?.unitId || '');
    const currentStatus = String(unit?.status || DEFAULT_ALLOCATION_STATUS);
    const draftUnitId = String(draft?.unit_id ?? currentUnitId);
    const draftStatus = String(draft?.status ?? currentStatus);
    const hasMatchingUnits = Array.isArray(candidates) && candidates.length > 0;
    const hasChanges = draftUnitId !== currentUnitId || draftStatus !== currentStatus;

    return {
        hasMatchingUnits,
        hasChanges,
        canApply: hasChanges
    };
}

export function validatePaymentDraft(draft = {}, totals = {}) {
    const amount = Number(draft?.amount || 0);
    const balance = Number(totals?.balance || 0);

    if (amount <= 0) return 'Payment amount must be greater than zero.';
    if (balance <= 0) return 'This booking is already fully settled.';

    return '';
}

export function validateAddonDraft(draft = {}) {
    const itemName = String(draft?.item_name || '').trim();
    const amount = Number(draft?.amount || 0);

    if (!itemName) return 'Add-on name is required.';
    if (amount <= 0) return 'Add-on amount must be greater than zero.';

    return '';
}

export function getBookingFinancialSnapshot(booking = {}, header = null) {
    const roomTotal = Number(header?.lodging_total ?? booking?.lodging_total ?? booking?.total_price ?? 0);
    const addonTotal = Number(header?.addon_amount ?? booking?.addon_amount ?? 0);
    const paid = Number(header?.verified_paid_total ?? booking?.verified_paid_total ?? booking?.amount_paid ?? 0);
    const grandTotal = roomTotal + addonTotal;
    const balance = Number.isFinite(Number(header?.balance_due))
        ? Number(header.balance_due)
        : Number.isFinite(Number(booking?.balance_due))
        ? Number(booking.balance_due)
        : Number.isFinite(Number(booking?.balance))
        ? Number(booking.balance)
        : Math.max(0, grandTotal - paid);

    return {
        roomTotal,
        addonTotal,
        grandTotal,
        paid,
        balance
    };
}
