/**
 * Amalfi Admin: Booking Modal Business Logic
 * 
 * Extracted from AdminBookingModal.jsx for independent testability.
 * These are the critical algorithms that protect data integrity on the admin side.
 */

import { differenceInCalendarDays, parseISO, isValid } from 'date-fns';

/**
 * Calculate the total price for a booking based on unit rates and guest count.
 * Mirrors the "Smart Pricing Engine" inside AdminBookingModal.jsx.
 * 
 * @param {Object} params
 * @param {Object} params.unit - The unit object with nightly_rate, max_capacity_pax, rates, extra_pax
 * @param {string} params.checkIn - ISO date string
 * @param {string} params.checkOut - ISO date string  
 * @param {number} params.guests - Number of guests
 * @param {boolean} [params.isDayTour=false] - Whether this is a day tour
 * @returns {{ total_price: number, max_allowed_pax: number }}
 */
export function calculatePrice({ unit, checkIn, checkOut, guests, isDayTour = false }) {
    if (!unit) return { total_price: 0, max_allowed_pax: 20 };

    const extraPax = unit.extra_pax;
    const rates = unit.rates || [];

    const ratesBaseMax = rates.length
        ? Math.max(...rates.map(r => r.max_pax || 0))
        : 0;
    const baseMax = ratesBaseMax || Number(unit.max_capacity_pax || (isDayTour ? 50 : 2));

    const absMax = Number(extraPax?.allowed
        ? (extraPax.max_capacity_pax || baseMax)
        : (unit.max_capacity_pax || baseMax)) || baseMax || 20;

    // Calculate nights
    const ciDate = checkIn ? parseISO(checkIn) : null;
    const coDate = checkOut ? parseISO(checkOut) : null;
    const nights = (ciDate && coDate && isValid(ciDate) && isValid(coDate))
        ? Math.max(1, differenceInCalendarDays(coDate, ciDate))
        : 1;

    // No tiered rates â†’ use flat nightly rate
    if (!rates.length) {
        const fallbackRate = unit.nightly_rate || 2000;
        return {
            total_price: fallbackRate * (isDayTour ? 1 : nights),
            max_allowed_pax: absMax
        };
    }

    // Tiered Pricing
    const sortedRates = [...rates].sort((a, b) => (b.max_pax || 0) - (a.max_pax || 0));

    const getRateForPax = (p) => {
        const matched = rates.find(r => p >= r.min_pax && p <= r.max_pax);
        if (matched) return matched.price_php;
        const sorted = [...rates].sort((a, b) => a.min_pax - b.min_pax);
        if (p < sorted[0].min_pax) return sorted[0].price_php;
        return sortedRates[0].price_php;
    };

    let perNight = 0;
    if (guests <= baseMax) {
        perNight = getRateForPax(guests);
    } else if (extraPax?.allowed) {
        perNight = sortedRates[0].price_php + (guests - baseMax) * (extraPax.price_per_head_php || 0);
    } else {
        perNight = sortedRates[0].price_php; // Hard Clamp
    }

    return {
        total_price: perNight * Math.max(nights, 1),
        max_allowed_pax: absMax
    };
}

export function getUnitStandardPax(unit) {
    const rates = unit?.rates || [];
    const ratesBaseMax = rates.length
        ? Math.max(...rates.map(r => Number(r?.max_pax || 0)))
        : 0;

    return Number(unit?.standard_max_pax || ratesBaseMax || unit?.max_capacity_pax || unit?.max_pax || 0);
}

export function getUnitAbsolutePax(unit, fallback = 0) {
    const standardPax = getUnitStandardPax(unit);
    const extraPax = unit?.extra_pax;
    const extraMax = extraPax?.allowed ? Number(extraPax?.max_capacity_pax || 0) : 0;

    return Number(
        unit?.absolute_max_pax ||
        extraMax ||
        unit?.max_capacity_pax ||
        unit?.max_pax ||
        standardPax ||
        fallback ||
        0
    );
}

export function getUnitCapacitySummary(unit, fallback = 0) {
    const standardPax = getUnitStandardPax(unit);
    const absolutePax = getUnitAbsolutePax(unit, fallback);
    const hasExtraPaxCapacity = Boolean(unit?.extra_pax?.allowed) && absolutePax > standardPax;

    return {
        standardPax,
        absolutePax,
        hasExtraPaxCapacity,
        label: hasExtraPaxCapacity
            ? `Standard ${standardPax} pax / max ${absolutePax} with extra pax`
            : `Max ${absolutePax} pax`
    };
}

export function allocateGuestsAcrossUnits({ units = [], guests = 0, fallbackPax = 1 } = {}) {
    if (!Array.isArray(units) || units.length === 0) return [];

    let remainingGuests = Math.max(Number(guests || 0), units.length);

    return units.map((unit, index) => {
        const remainingUnits = units.length - index;
        const unitCapacity = Math.max(getUnitAbsolutePax(unit, fallbackPax), 1);
        const minimumGuestsHere = Math.max(1, Math.ceil(remainingGuests / remainingUnits));
        const allocatedGuests = Math.min(unitCapacity, minimumGuestsHere);
        remainingGuests = Math.max(0, remainingGuests - allocatedGuests);
        return allocatedGuests;
    });
}

/**
 * Validate PAX capacity with admin policy overrides.
 * Mirrors the "Double-Layer Capacity Guard" inside handleSubmit.
 * 
 * @param {Object} params
 * @param {number} params.guests - Number of guests
 * @param {number} params.maxAllowedPax - Base max from unit
 * @param {string} params.unitLabel - Label of the unit (e.g., "Pool Villa #1")
 * @param {string} params.unitId - ID of the unit (e.g., "PVL-01")
 * @returns {{ valid: boolean, limit: number, error: string|null }}
 */
export function validatePaxCapacity({ guests, maxAllowedPax, unitLabel = '', unitId = '' }) {
    const paxLimit = Number(maxAllowedPax) || 20;

    if (Number(guests) > paxLimit) {
        return {
            valid: false,
            limit: paxLimit,
            error: `Capacity Exceeded: ${unitLabel || unitId} only allows ${paxLimit} guests.`
        };
    }

    return { valid: true, limit: paxLimit, error: null };
}

/**
 * Detect date conflicts with existing bookings for a specific unit.
 * Mirrors the conflict detection useEffect in AdminBookingModal.jsx.
 * 
 * @param {Object} params
 * @param {string} params.checkIn - ISO date string
 * @param {string} params.checkOut - ISO date string
 * @param {string} params.unitId - Unit being booked
 * @param {Array} params.existingBookings - All existing bookings
 * @param {string|null} [params.selfRef=null] - Own booking ref to exclude (edit mode)
 * @returns {Object|null} - The conflicting booking, or null if no conflict
 */
export function detectConflict({ checkIn, checkOut, unitId, existingBookings = [], selfRef = null }) {
    if (!checkIn || !checkOut || !unitId) return null;

    return existingBookings.find(b => {
        if (selfRef && b.booking_ref === selfRef) return false;
        if (b.unit_id !== unitId) return false;
        if (b.status === 'CANCELLED') return false;

        const startA = parseISO(checkIn);
        const endA = parseISO(checkOut);
        const startB = parseISO(b.check_in);
        const endB = parseISO(b.check_out);

        return (isValid(startA) && isValid(endA) && isValid(startB) && isValid(endB))
            ? (startA < endB && endA > startB)
            : false;
    }) || null;
}

/**
 * Generate a booking reference code.
 * Mirrors the generateRef function in AdminBookingModal.jsx.
 * 
 * @param {string} roomType - e.g., "Amalfi Suite", "Sunset Pavilion"
 * @returns {string} - e.g., "AMS-BXYZ1"
 */
export function generateBookingRef(roomType) {
    const prefixMap = {
        'Amalfi Suite': 'AMS',
        'Positano Vista': 'POS',
        'Ravello Suite': 'RAV',
        'Capri Vista': 'CAP',
        'Sirenuse Suite': 'SIR',
        'Sunset Pavilion': 'SUN'
    };
    const prefix = prefixMap[roomType] || 'AML';
    const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}-B${rand}`;
}
