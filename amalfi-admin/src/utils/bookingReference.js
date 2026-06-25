const ROOM_PREFIXES = [
    { match: /pool\s*villa|pool-villa|^pvl/i, code: 'PVL' },
    { match: /beach\s*villa|beach-villa|^bvl/i, code: 'BVL' },
    { match: /owner'?s\s*villa|owners-villa|owner-villa|^ovl/i, code: 'OVL' },
    { match: /big\s*fan\s*kubo|big-fan-kubo|^bfk/i, code: 'BFK' },
    { match: /fan\s*kubo|fan-kubo|^fkb/i, code: 'FKB' },
    { match: /ac\s*kubo|ac-kubo|^akb/i, code: 'AKB' },
    { match: /ac\s*teepee|ac-teepee|^act/i, code: 'ACT' },
    { match: /day[\s_-]*tour|^dtr/i, code: 'DTR' },
    { match: /tent|camp|camp-zone|^tpc/i, code: 'TPC' },
];

function compactToken(value = '') {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

export function getBookingCategoryCode(booking = {}) {
    const haystack = [
        booking.room_type,
        booking.unit_label,
        booking.unit_id,
        booking.unitSummary,
        booking.booking_type,
        booking.booking_ref,
    ].filter(Boolean).join(' ');

    const match = ROOM_PREFIXES.find((entry) => entry.match.test(haystack));
    if (match) return match.code;

    const fallback = compactToken(booking.room_type || booking.unit_id || booking.booking_type || booking.booking_ref);
    return (fallback || 'BKG').slice(0, 3).padEnd(3, 'X');
}

export function getBookingShapeCode(booking = {}) {
    const explicitMulti = Number(booking.booking_items_count || booking.unitCount || 1) > 1;
    const sourceRowsMulti = Array.isArray(booking.sourceRows) && booking.sourceRows.length > 1;
    const unitLabelsMulti = Array.isArray(booking.unitLabels) && booking.unitLabels.length > 1;
    const groupCodeMulti = Boolean(booking.group_code || booking.group_master_ref || booking.group_name);
    const transactionMulti = String(booking.booking_mode || '').toUpperCase().includes('GROUP');

    return explicitMulti || sourceRowsMulti || unitLabelsMulti || groupCodeMulti || transactionMulti ? 'M' : 'S';
}

export function getBookingReferenceSuffix(booking = {}, length = 2) {
    const ref = compactToken(booking.booking_ref || booking.booking_reference || booking.reference || '');
    if (!ref) return '00';
    return ref.slice(-length).padStart(length, '0');
}

export function getCompactMapBookingRef(booking = {}) {
    return [
        getBookingCategoryCode(booking),
        getBookingShapeCode(booking),
        getBookingReferenceSuffix(booking, 2),
    ].join('-');
}
