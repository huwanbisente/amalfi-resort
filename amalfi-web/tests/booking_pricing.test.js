import { describe, expect, it } from 'vitest';
import { calculateBookingPricing } from '../src/utils/bookingPricing.js';

const buildRoom = (raw) => ({ raw, room_type: raw.name });

describe('Booking pricing utility', () => {
    it('prices a standard single-unit booking using the matching rate tier', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'AC Teepee',
                units: 4,
                max_capacity_pax: 2,
                rates: [{ min_pax: 1, max_pax: 2, price_php: 2500 }]
            }),
            guests: 2,
            checkIn: '2026-12-01',
            checkOut: '2026-12-03',
            paymentCommitment: 'DEPOSIT',
        });

        expect(pricing.perNight).toBe(2500);
        expect(pricing.nights).toBe(2);
        expect(pricing.total).toBe(5000);
        expect(pricing.amountToPayNow).toBe(2500);
        expect(pricing.remainingBalance).toBe(2500);
        expect(pricing.singleUnitMaxGuests).toBe(2);
        expect(pricing.maxPossibleGuests).toBe(8);
    });

    it('supports extra pax pricing inside a single villa', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'Pool Villa',
                units: 6,
                max_capacity_pax: 12,
                rates: [{ min_pax: 1, max_pax: 12, price_php: 12000 }],
                extra_pax: {
                    allowed: true,
                    price_per_head_php: 500,
                    max_capacity_pax: 14,
                },
            }),
            guests: 14,
            checkIn: '2026-12-01',
            checkOut: '2026-12-02',
            paymentCommitment: 'FULL',
        });

        expect(pricing.perNight).toBe(13000);
        expect(pricing.total).toBe(13000);
        expect(pricing.amountToPayNow).toBe(13000);
        expect(pricing.remainingBalance).toBe(0);
        expect(pricing.singleUnitMaxGuests).toBe(14);
        expect(pricing.maxPossibleGuests).toBe(84);
    });

    it('keeps Beach Villa on the same villa base price with its new absolute cap', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'Beach Villa',
                units: 6,
                max_capacity_pax: 10,
                rates: [{ min_pax: 1, max_pax: 10, price_php: 12000 }],
            }),
            guests: 10,
            checkIn: '2026-12-01',
            checkOut: '2026-12-02',
            paymentCommitment: 'FULL',
        });

        expect(pricing.perNight).toBe(12000);
        expect(pricing.total).toBe(12000);
        expect(pricing.amountToPayNow).toBe(12000);
        expect(pricing.remainingBalance).toBe(0);
        expect(pricing.singleUnitMaxGuests).toBe(10);
        expect(pricing.maxPossibleGuests).toBe(60);
    });

    it('splits overflow guests across multiple units when needed', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'Fan Kubo',
                units: 4,
                max_capacity_pax: 4,
                rates: [{ min_pax: 1, max_pax: 4, price_php: 2500 }],
            }),
            guests: 6,
            checkIn: '2026-12-01',
            checkOut: '2026-12-03',
            paymentCommitment: 'DEPOSIT',
        });

        expect(pricing.unitsNeeded).toBe(2);
        expect(pricing.unitBreakdown).toHaveLength(2);
        expect(pricing.unitBreakdown[0].pax).toBe(4);
        expect(pricing.unitBreakdown[1].pax).toBe(2);
        expect(pricing.perNight).toBe(5000);
        expect(pricing.total).toBe(10000);
        expect(pricing.maxPossibleGuests).toBe(16);
    });

    it('falls back safely when requested guests exceed a single-unit cap with no overflow units', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'Big Fan Kubo',
                units: 1,
                max_capacity_pax: 6,
                rates: [{ min_pax: 1, max_pax: 6, price_php: 4000 }],
            }),
            guests: 10,
            checkIn: '2026-12-01',
            checkOut: '2026-12-02',
            paymentCommitment: 'DEPOSIT',
        });

        expect(pricing.singleUnitMaxGuests).toBe(6);
        expect(pricing.maxPossibleGuests).toBe(6);
        expect(pricing.unitBreakdown).toEqual([{ pax: 6, rate: 4000 }]);
        expect(pricing.total).toBe(4000);
    });

    it('caps multi-unit pricing at the actual room-type inventory ceiling', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'Fan Kubo',
                units: 2,
                max_capacity_pax: 4,
                rates: [{ min_pax: 1, max_pax: 4, price_php: 2500 }],
            }),
            guests: 12,
            checkIn: '2026-12-01',
            checkOut: '2026-12-02',
            paymentCommitment: 'DEPOSIT',
        });

        expect(pricing.singleUnitMaxGuests).toBe(4);
        expect(pricing.maxPossibleGuests).toBe(8);
        expect(pricing.unitsNeeded).toBe(2);
        expect(pricing.unitBreakdown).toEqual([
            { pax: 4, effectivePax: 4, rate: 2500 },
            { pax: 4, effectivePax: 4, rate: 2500 },
        ]);
        expect(pricing.total).toBe(5000);
    });

    it('can intentionally price extra selected units even when guests fit in one', () => {
        const pricing = calculateBookingPricing({
            room: buildRoom({
                name: 'AC Teepee',
                units: 4,
                max_capacity_pax: 2,
                rates: [{ min_pax: 1, max_pax: 2, price_php: 2500 }]
            }),
            guests: 2,
            requestedUnits: 2,
            checkIn: '2026-12-01',
            checkOut: '2026-12-02',
            paymentCommitment: 'DEPOSIT',
        });

        expect(pricing.unitsNeeded).toBe(2);
        expect(pricing.unitBreakdown).toEqual([
            { pax: 1, effectivePax: 1, rate: 2500 },
            { pax: 1, effectivePax: 1, rate: 2500 },
        ]);
        expect(pricing.total).toBe(5000);
        expect(pricing.amountToPayNow).toBe(2500);
    });
});
