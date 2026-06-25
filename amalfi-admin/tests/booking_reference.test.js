import { describe, expect, it } from 'vitest';
import {
    getBookingCategoryCode,
    getBookingShapeCode,
    getBookingReferenceSuffix,
    getCompactMapBookingRef,
} from '../src/utils/bookingReference';

describe('booking reference display helpers', () => {
    it('builds a compact map reference from current RES header refs', () => {
        expect(getCompactMapBookingRef({
            booking_ref: 'RES-0506-D7C8',
            room_type: 'Pool Villa',
            booking_items_count: 1,
        })).toBe('PVL-S-C8');
    });

    it('marks grouped or multi-unit bookings as M', () => {
        expect(getCompactMapBookingRef({
            booking_ref: 'RES-0510-ABCD',
            unitLabels: ['Pool Villa #1', 'Pool Villa #2'],
            room_type: 'Pool Villa',
        })).toBe('PVL-M-CD');
    });

    it('keeps legacy category prefixes readable', () => {
        expect(getCompactMapBookingRef({
            booking_ref: 'ACT-A001',
            room_type: 'AC Teepee',
        })).toBe('ACT-S-01');
    });

    it('detects special booking categories', () => {
        expect(getBookingCategoryCode({ booking_ref: 'DTR-X9K2L', booking_type: 'day_tour' })).toBe('DTR');
        expect(getBookingCategoryCode({ booking_ref: 'TPC-X9K2L', booking_type: 'tent_pitching' })).toBe('TPC');
    });

    it('defaults to solo unless a multi signal is present', () => {
        expect(getBookingShapeCode({ booking_ref: 'PVL-12345' })).toBe('S');
        expect(getBookingShapeCode({ booking_ref: 'PVL-12345', booking_items_count: 2 })).toBe('M');
    });

    it('can expose the last 4 reference characters for tiny map blocks', () => {
        expect(getBookingReferenceSuffix({ booking_ref: 'RES-0506-D7C8' }, 4)).toBe('D7C8');
        expect(getBookingReferenceSuffix({ booking_ref: 'ACT-A001' }, 4)).toBe('A001');
    });
});
