import { describe, it, expect } from 'vitest';
import {
    allocateGuestsAcrossUnits,
    calculatePrice,
    detectConflict,
    generateBookingRef,
    getUnitAbsolutePax,
    getUnitCapacitySummary,
    validatePaxCapacity
} from '../../src/utils/bookingLogic';

/**
 * Ã°Å¸ÂÂ° ADMIN MODAL LOGIC: Pure Function Tests
 * Tests the extracted business logic from AdminBookingModal.jsx
 * without rendering the component (avoids JSDOM/React 19 hang).
 */

describe('Ã°Å¸Â§Â® Pricing Engine: calculatePrice()', () => {

    it('Scenario 1: Flat rate Ã— 1 night = correct total', () => {
        const result = calculatePrice({
            unit: { nightly_rate: 2500, max_capacity_pax: 2 },
            checkIn: '2026-05-10',
            checkOut: '2026-05-11',
            guests: 2
        });
        expect(result.total_price).toBe(2500);
        expect(result.max_allowed_pax).toBe(2);
    });

    it('Scenario 2: Flat rate Ã— 3 nights = correct total', () => {
        const result = calculatePrice({
            unit: { nightly_rate: 2500, max_capacity_pax: 2 },
            checkIn: '2026-05-10',
            checkOut: '2026-05-13',
            guests: 2
        });
        expect(result.total_price).toBe(7500);
    });

    it('Scenario 3: Day tour uses 1-night multiplier regardless of dates', () => {
        const result = calculatePrice({
            unit: { nightly_rate: 500, max_capacity_pax: 50 },
            checkIn: '2026-05-10',
            checkOut: '2026-05-10',
            guests: 10,
            isDayTour: true
        });
        expect(result.total_price).toBe(500);
    });

    it('Scenario 4: Tiered pricing selects correct rate for guest count', () => {
        const result = calculatePrice({
            unit: {
                max_capacity_pax: 4,
                rates: [
                    { min_pax: 1, max_pax: 2, price_php: 2000 },
                    { min_pax: 3, max_pax: 4, price_php: 2500 },
                ],
            },
            checkIn: '2026-05-10',
            checkOut: '2026-05-11',
            guests: 3
        });
        expect(result.total_price).toBe(2500);
    });

    it('Scenario 5: Extra pax surcharge applied correctly', () => {
        const result = calculatePrice({
            unit: {
                max_capacity_pax: 2,
                extra_pax: { allowed: true, max_capacity_pax: 5, price_per_head_php: 500 },
                rates: [
                    { min_pax: 1, max_pax: 2, price_php: 2000 },
                ],
            },
            checkIn: '2026-05-10',
            checkOut: '2026-05-11',
            guests: 4 // 2 extra pax Ã— â‚±500 = â‚±1000 surcharge
        });
        // Base rate (â‚±2000) + 2 extra Ã— â‚±500 = â‚±3000
        expect(result.total_price).toBe(3000);
        expect(result.max_allowed_pax).toBe(5);
    });

    it('Scenario 5b: Owner\'s Villa â€” surcharge starts at pax 21, not 26 (DB max_pax=25 vs rates max_pax=20)', () => {
        // Regression: DB stores max_pax=25 (absolute cap), but rates say max_pax=20.
        // Surcharge of â‚±800/head must kick in at pax 21, NOT pax 26.
        const ownersVilla = {
            max_capacity_pax: 20,
            extra_pax: { allowed: true, max_capacity_pax: 25, price_per_head_php: 800 },
            rates: [{ min_pax: 1, max_pax: 20, price_php: 28000 }],
        };

        // 20 pax = base rate only
        expect(calculatePrice({ unit: ownersVilla, checkIn: '2026-05-10', checkOut: '2026-05-11', guests: 20 }).total_price).toBe(28000);

        // 21 pax = base + 1Ã—800 surcharge
        expect(calculatePrice({ unit: ownersVilla, checkIn: '2026-05-10', checkOut: '2026-05-11', guests: 21 }).total_price).toBe(28800);

        // 25 pax = base + 5Ã—800 = 32000 (absolute max)
        expect(calculatePrice({ unit: ownersVilla, checkIn: '2026-05-10', checkOut: '2026-05-11', guests: 25 }).total_price).toBe(32000);

        // Max allowed should be 25
        expect(calculatePrice({ unit: ownersVilla, checkIn: '2026-05-10', checkOut: '2026-05-11', guests: 25 }).max_allowed_pax).toBe(25);
    });

    it('Scenario 6: Falls back to â‚±2000 when no rate info exists', () => {
        const result = calculatePrice({
            unit: { max_capacity_pax: 2 },
            checkIn: '2026-05-10',
            checkOut: '2026-05-11',
            guests: 2
        });
        expect(result.total_price).toBe(2000);
    });

    it('Scenario 7: Handles null unit gracefully', () => {
        const result = calculatePrice({
            unit: null,
            checkIn: '2026-05-10',
            checkOut: '2026-05-11',
            guests: 2
        });
        expect(result.total_price).toBe(0);
        expect(result.max_allowed_pax).toBe(20);
    });

    it('Scenario 8: Invalid dates default to 1 night', () => {
        const result = calculatePrice({
            unit: { nightly_rate: 3000, max_capacity_pax: 2 },
            checkIn: 'not-a-date',
            checkOut: '',
            guests: 2
        });
        expect(result.total_price).toBe(3000); // 1 night Ã— â‚±3000
    });
});

describe('Ã°Å¸â€ºÂ¡Ã¯Â¸Â PAX Capacity Guard: validatePaxCapacity()', () => {

    it('Scenario 1: Normal guest count passes', () => {
        const result = validatePaxCapacity({ guests: 2, maxAllowedPax: 4, unitLabel: 'AC Teepee 01', unitId: 'ACT-01' });
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    it('Scenario 2: Overstuffed guest count fails', () => {
        const result = validatePaxCapacity({ guests: 10, maxAllowedPax: 2, unitLabel: 'AC Teepee 01', unitId: 'ACT-01' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Capacity Exceeded');
    });

    it('Scenario 3: Uses the provided KB-derived limit directly', () => {
        const result = validatePaxCapacity({ guests: 15, maxAllowedPax: 14, unitLabel: 'Pool Villa #1', unitId: 'PVL-01' });
        expect(result.valid).toBe(false);
        expect(result.limit).toBe(14);
    });

    it('Scenario 4: Owner\'s Villa respects the provided absolute cap', () => {
        const result = validatePaxCapacity({ guests: 20, maxAllowedPax: 25, unitLabel: "Owner's Villa", unitId: 'OVL-01' });
        expect(result.valid).toBe(true);
        expect(result.limit).toBe(25);
    });

    it('Scenario 5: Exactly at limit passes', () => {
        const result = validatePaxCapacity({ guests: 4, maxAllowedPax: 4, unitLabel: 'AC Kubo', unitId: 'AKB-01' });
        expect(result.valid).toBe(true);
    });
});

describe('Multi-booking capacity labels and aggregate limits', () => {
    it('uses extra pax absolute max when a unit has standard and extra capacity', () => {
        const ownersVilla = {
            max_capacity_pax: 20,
            extra_pax: { allowed: true, max_capacity_pax: 25, price_per_head_php: 800 },
            rates: [{ min_pax: 1, max_pax: 20, price_php: 28000 }],
        };

        expect(getUnitAbsolutePax(ownersVilla)).toBe(25);
        expect(getUnitCapacitySummary(ownersVilla).label).toBe('Standard 20 pax / max 25 with extra pax');
    });

    it('allows a shared booking when selected unit absolute capacities cover total guests', () => {
        const selectedUnits = [
            {
                unit_id: 'pool-villa-1',
                unit_label: 'Pool Villa #1',
                max_capacity_pax: 12,
                extra_pax: { allowed: true, max_capacity_pax: 14, price_per_head_php: 500 },
                rates: [{ min_pax: 1, max_pax: 12, price_php: 15000 }],
            },
            {
                unit_id: 'owners-villa',
                unit_label: "Owner's Villa",
                max_capacity_pax: 20,
                extra_pax: { allowed: true, max_capacity_pax: 25, price_per_head_php: 800 },
                rates: [{ min_pax: 1, max_pax: 20, price_php: 28000 }],
            },
        ];
        const aggregateMax = selectedUnits.reduce((sum, unit) => sum + getUnitAbsolutePax(unit), 0);

        expect(aggregateMax).toBe(39);
        expect(validatePaxCapacity({ guests: 25, maxAllowedPax: aggregateMax, unitLabel: 'selected units' }).valid).toBe(true);
    });

    it('allocates total guests across selected units instead of duplicating pax per item', () => {
        const selectedUnits = [
            {
                unit_id: 'pool-villa-1',
                max_capacity_pax: 12,
                extra_pax: { allowed: true, max_capacity_pax: 14, price_per_head_php: 500 },
            },
            {
                unit_id: 'owners-villa',
                max_capacity_pax: 20,
                extra_pax: { allowed: true, max_capacity_pax: 25, price_per_head_php: 800 },
            },
        ];

        const allocations = allocateGuestsAcrossUnits({ units: selectedUnits, guests: 25 });

        expect(allocations).toEqual([13, 12]);
        expect(allocations.reduce((sum, count) => sum + count, 0)).toBe(25);
        expect(allocations[0]).toBeLessThanOrEqual(14);
        expect(allocations[1]).toBeLessThanOrEqual(25);
    });
});

describe('Ã°Å¸â€œâ€¦ Date Conflict Detection: detectConflict()', () => {

    const existingBookings = [
        { booking_ref: 'ACT-A001', unit_id: 'ACT-01', check_in: '2026-06-01', check_out: '2026-06-05', status: 'RESERVED', full_name: 'Guest A' },
        { booking_ref: 'ACT-A002', unit_id: 'ACT-01', check_in: '2026-06-10', check_out: '2026-06-12', status: 'RESERVED', full_name: 'Guest B' },
        { booking_ref: 'ACT-A003', unit_id: 'ACT-02', check_in: '2026-06-01', check_out: '2026-06-05', status: 'RESERVED', full_name: 'Guest C' },
        { booking_ref: 'ACT-A004', unit_id: 'ACT-01', check_in: '2026-07-01', check_out: '2026-07-03', status: 'CANCELLED', full_name: 'Cancelled Guest' },
    ];

    it('Scenario 1: No overlap = no conflict', () => {
        const result = detectConflict({
            checkIn: '2026-06-06', checkOut: '2026-06-09',
            unitId: 'ACT-01', existingBookings
        });
        expect(result).toBeNull();
    });

    it('Scenario 2: Partial overlap detected', () => {
        const result = detectConflict({
            checkIn: '2026-06-04', checkOut: '2026-06-07',
            unitId: 'ACT-01', existingBookings
        });
        expect(result).not.toBeNull();
        expect(result.booking_ref).toBe('ACT-A001');
    });

    it('Scenario 3: Back-to-back is NOT a conflict (checkout = checkin)', () => {
        const result = detectConflict({
            checkIn: '2026-06-05', checkOut: '2026-06-07',
            unitId: 'ACT-01', existingBookings
        });
        expect(result).toBeNull();
    });

    it('Scenario 4: Different unit = no conflict even with overlap', () => {
        const result = detectConflict({
            checkIn: '2026-06-02', checkOut: '2026-06-04',
            unitId: 'ACT-03', existingBookings
        });
        expect(result).toBeNull();
    });

    it('Scenario 5: Cancelled booking is ignored', () => {
        const result = detectConflict({
            checkIn: '2026-07-01', checkOut: '2026-07-03',
            unitId: 'ACT-01', existingBookings
        });
        expect(result).toBeNull();
    });

    it('Scenario 6: Self-booking excluded in edit mode', () => {
        const result = detectConflict({
            checkIn: '2026-06-01', checkOut: '2026-06-05',
            unitId: 'ACT-01', existingBookings,
            selfRef: 'ACT-A001'
        });
        expect(result).toBeNull();
    });

    it('Scenario 7: Missing dates returns null', () => {
        const result = detectConflict({
            checkIn: '', checkOut: '',
            unitId: 'ACT-01', existingBookings
        });
        expect(result).toBeNull();
    });
});

describe('Ã°Å¸ÂÂ·Ã¯Â¸Â Booking Reference Generator: generateBookingRef()', () => {

    it('Scenario 1: AC Teepee â†’ ACT prefix', () => {
        const ref = generateBookingRef('AC Teepee');
        expect(ref).toMatch(/^ACT-B[A-Z0-9]{4}$/);
    });

    it('Scenario 2: Pool Villa â†’ PVL prefix', () => {
        const ref = generateBookingRef('Pool Villa');
        expect(ref).toMatch(/^PVL-B[A-Z0-9]{4}$/);
    });

    it('Scenario 3: Unknown type â†’ BRZ fallback', () => {
        const ref = generateBookingRef('Unknown Room');
        expect(ref).toMatch(/^BRZ-B[A-Z0-9]{4}$/);
    });

    it('Scenario 4: Each call generates a unique ref', () => {
        const refs = new Set(Array.from({ length: 20 }, () => generateBookingRef('AC Teepee')));
        expect(refs.size).toBeGreaterThan(15); // At least 75% unique with random
    });
});
