import { describe, expect, it } from 'vitest';
import { applyDiscountToCalculatedTotal, buildConflictMap, calculateUnitCharge, datesOverlap, discountAmountFromPercent, isTransactionRecord, makeSeedBookingItem, normalizeMoneyInput, normalizePaxInput, selectedUnitConflicts, unitCapacity } from '../../src/components/EditBookingModal.jsx';

describe('EditBookingModal booking classification', () => {
    it('does not treat every RES-prefixed booking as a transaction record', () => {
        expect(isTransactionRecord({
            booking_ref: 'RES-0510-ABCD',
            record_origin: 'legacy_booking',
            booking_items_count: 0,
        })).toBe(false);
        expect(isTransactionRecord({
            booking_ref: 'ACT-0510-ABCD',
            record_origin: 'legacy',
            booking_mode: 'STANDARD',
            booking_items_count: 1,
        })).toBe(false);
    });

    it('treats explicit transaction rows and multi-item bookings as transaction records', () => {
        expect(isTransactionRecord({ booking_ref: 'RES-1', record_origin: 'transaction_header' })).toBe(true);
        expect(isTransactionRecord({ booking_ref: 'RES-2', booking_items_count: 2 })).toBe(true);
        expect(isTransactionRecord({ booking_ref: 'RES-3', booking_mode: 'TRANSACTION_GROUP' })).toBe(true);
    });

    it('keeps header-backed standard bookings multi-unit capable', () => {
        expect(isTransactionRecord({
            booking_ref: 'RES-4',
            record_origin: 'transaction_header',
            booking_mode: 'STANDARD',
            booking_items_count: 1,
        })).toBe(true);
        expect(isTransactionRecord({
            booking_ref: 'RES-5',
            transaction_ref: 'RES-5',
            booking_mode: 'STANDARD',
            booking_items_count: 1,
        })).toBe(true);
    });
});

describe('EditBookingModal single to multi-room staging', () => {
    it('seeds the current single-room booking as the first multi-room row', () => {
        const seed = makeSeedBookingItem({
            bookingRef: 'MAN-SMH00',
            form: {
                unit_id: 'SMH-01',
                room_type: 'Single Room',
                status: 'RESERVED',
                guests: 10,
                total_price: 56000,
            },
            unit: {
                unit_id: 'SMH-01',
                room_type_id: 'Sanctuary Main House',
            },
        });

        expect(seed).toMatchObject({
            booking_item_id: 'seed-MAN-SMH00',
            unit_id: 'SMH-01',
            room_type: 'Sanctuary Main House',
            status: 'RESERVED',
            guest_count: 10,
            lodging_subtotal: 56000,
            is_legacy_seed_item: true,
        });
    });
});

describe('EditBookingModal date-scoped unit conflicts', () => {
    it('uses strict overlap, allowing back-to-back stays', () => {
        expect(datesOverlap('2026-06-10', '2026-06-12', '2026-06-12', '2026-06-14')).toBe(false);
        expect(datesOverlap('2026-06-10', '2026-06-12', '2026-06-11', '2026-06-13')).toBe(true);
    });

    it('ignores active unit markers that do not overlap the edited dates', () => {
        const conflicts = buildConflictMap({
            bookingRef: 'RES-EDIT',
            checkIn: '2026-06-20',
            checkOut: '2026-06-23',
            units: [{
                unit_id: 'pool-villa-1',
                active_booking: {
                    booking_ref: 'RES-OTHER',
                    check_in: '2026-06-01',
                    check_out: '2026-06-03',
                    full_name: 'Other Guest',
                },
            }],
            existingBookings: [],
        });

        expect(conflicts.has('pool-villa-1')).toBe(false);
    });

    it('keeps overlapping bookings blocked and excludes the booking being edited', () => {
        const conflicts = buildConflictMap({
            bookingRef: 'RES-EDIT',
            checkIn: '2026-06-20',
            checkOut: '2026-06-23',
            units: [],
            existingBookings: [
                { booking_ref: 'RES-EDIT', unit_id: 'pool-villa-1', check_in: '2026-06-20', check_out: '2026-06-23', status: 'RESERVED' },
                { booking_ref: 'RES-OTHER', unit_id: 'pool-villa-2', check_in: '2026-06-21', check_out: '2026-06-24', status: 'RESERVED' },
            ],
        });

        expect(conflicts.has('pool-villa-1')).toBe(false);
        expect(conflicts.has('pool-villa-2')).toBe(true);
    });

    it('reports selected unit conflicts so Save can be blocked after date changes', () => {
        const conflicts = buildConflictMap({
            bookingRef: 'RES-EDIT',
            checkIn: '2026-06-20',
            checkOut: '2026-06-23',
            units: [],
            existingBookings: [
                { booking_ref: 'RES-OTHER', unit_id: 'pool-villa-2', check_in: '2026-06-21', check_out: '2026-06-24', status: 'RESERVED' },
            ],
        });

        expect(selectedUnitConflicts({ unitIds: ['pool-villa-2'], conflictMap: conflicts })).toEqual([
            {
                unitId: 'pool-villa-2',
                conflict: {
                    booking_ref: 'RES-OTHER',
                    unit_id: 'pool-villa-2',
                    check_in: '2026-06-21',
                    check_out: '2026-06-24',
                    status: 'RESERVED',
                },
            },
        ]);
        expect(selectedUnitConflicts({ unitIds: ['pool-villa-3'], conflictMap: conflicts })).toEqual([]);
    });
});

describe('EditBookingModal capacity', () => {
    it('normalizes pax entry like a regular data form', () => {
        expect(normalizePaxInput('05')).toBe('5');
        expect(normalizePaxInput('12 guests')).toBe('12');
        expect(normalizePaxInput('')).toBe('');
    });

    it('normalizes money entry without requiring spinner inputs', () => {
        expect(normalizeMoneyInput('05')).toBe('5');
        expect(normalizeMoneyInput('1,250.987')).toBe('1250.98');
        expect(normalizeMoneyInput('PHP 500')).toBe('500');
    });

    it('prefers absolute pax so extra-pax capacity is visible in edit mode', () => {
        expect(unitCapacity({ max_capacity_pax: 20, absolute_max_pax: 25 })).toBe(25);
    });

    it('calculates unit charge from rates, dates, and pax for edit pricing', () => {
        expect(calculateUnitCharge({
            unit: {
                rates: [
                    { min_pax: 1, max_pax: 4, price_php: 6000 },
                    { min_pax: 5, max_pax: 10, price_php: 12000 },
                ],
                max_capacity_pax: 10,
            },
            checkIn: '2026-06-10',
            checkOut: '2026-06-12',
            guests: 8,
        })).toBe(24000);
    });

    it('applies a discount against the calculated total without going negative', () => {
        expect(applyDiscountToCalculatedTotal(12000, 2500)).toBe(9500);
        expect(applyDiscountToCalculatedTotal(12000, 15000)).toBe(0);
        expect(applyDiscountToCalculatedTotal(12000, -500)).toBe(12000);
    });

    it('calculates common percentage discount amounts', () => {
        expect(discountAmountFromPercent(12000, 10)).toBe(1200);
        expect(discountAmountFromPercent(12000, 20)).toBe(2400);
        expect(discountAmountFromPercent(9999, 50)).toBe(4999.5);
        expect(discountAmountFromPercent(12000, 12.5)).toBe(1500);
    });
});
