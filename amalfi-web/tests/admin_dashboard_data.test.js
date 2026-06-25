import { describe, it, expect } from 'vitest';
import {
    buildCurrentBookingsSnapshotCsv,
    buildLedgerAllocationMeta,
    decorateUnitsWithLedger,
    formatSnapshotDate
} from '../src/utils/adminDashboardData.js';

describe('Admin dashboard data helpers', () => {
    it('builds snapshot-compatible CSV rows for manual upload', () => {
        const { csvContent, exportedCount, skippedUnassignedCount } = buildCurrentBookingsSnapshotCsv([
            {
                booking_ref: 'BVL-SYNC-1',
                full_name: 'Snapshot Guest',
                unit_label: 'Beach Villa #4',
                room_type: 'Beach Villa',
                check_in: '2026-04-20',
                check_out: '2026-04-22',
                guests: 6,
                total_price: 10000,
                amount_paid: 4500,
                balance: 5500,
                status: 'RESERVED'
            }
        ], '2026-04-15');

        expect(exportedCount).toBe(1);
        expect(skippedUnassignedCount).toBe(0);
        expect(csvContent).toContain('Booking Ref,Guest Name,Unit,Room Type,Check-in,Check-out,Pax,Total Price,DP,Balance,Add-on Amount,Payment Status,Status,Booking Source,Notes,Special Requests');
        expect(csvContent).toContain('BVL-SYNC-1,Snapshot Guest,Beach Villa #4,Beach Villa,20/04/2026,22/04/2026,6,"10,000.00","4,500.00","5,500.00",0.00,,RESERVED,,,');
    });

    it('skips rows without assigned units because they cannot populate the sanctuary map', () => {
        const { candidateCount, exportedCount, skippedUnassignedCount } = buildCurrentBookingsSnapshotCsv([
            {
                booking_ref: 'UNASSIGNED-1',
                full_name: 'Floating Guest',
                room_type: 'Pool Villa',
                check_in: '2026-04-20',
                check_out: '2026-04-22',
                guests: 4,
                amount_paid: 0,
                balance: 8000,
                status: 'RESERVED'
            }
        ], '2026-04-15');

        expect(candidateCount).toBe(1);
        expect(exportedCount).toBe(0);
        expect(skippedUnassignedCount).toBe(1);
    });

    it('decorates units from the same live ledger booking set', () => {
        const units = [
            { unit_id: 'ACT-01', unit_label: 'AC Teepee 01' },
            { unit_id: 'ACT-02', unit_label: 'AC Teepee 02' }
        ];
        const ledger = [
            {
                booking_ref: 'LIVE-1',
                unit_id: 'ACT-01',
                full_name: 'Live Guest',
                check_in: '2026-04-10',
                check_out: '2026-04-18',
                status: 'RESERVED',
                payment_status: 'PARTIAL',
                created_at: '2026-04-01 08:00:00'
            },
            {
                booking_ref: 'FUTURE-1',
                unit_id: 'ACT-02',
                full_name: 'Future Guest',
                check_in: '2026-04-20',
                check_out: '2026-04-22',
                status: 'RESERVED',
                payment_status: 'PAYMENT_REVIEW',
                created_at: '2026-04-02 08:00:00'
            }
        ];

        const decorated = decorateUnitsWithLedger(units, ledger, '2026-04-15');

        expect(decorated[0].available).toBe(false);
        expect(decorated[0].active_booking.booking_ref).toBe('LIVE-1');
        expect(decorated[1].available).toBe(true);
        expect(decorated[1].active_booking).toBe(null);
    });

    it('formats snapshot dates as DD/MM/YYYY', () => {
        expect(formatSnapshotDate('2026-04-15')).toBe('15/04/2026');
    });

    it('groups multi-booking unit labels into a readable ledger summary', () => {
        const meta = buildLedgerAllocationMeta({
            room_type: 'Fan Kubo',
            unit_label: 'Multiple Units',
            unit_summary: 'Fan Kubo #2, Fan Kubo #3, Fan Kubo #4',
            booking_items_count: 3
        });

        expect(meta.bookingKind).toBe('Multi-booking');
        expect(meta.primaryLabel).toBe('Fan Kubos x3');
        expect(meta.secondaryLabel).toBe('Fan Kubo #2 â€¢ Fan Kubo #3 â€¢ Fan Kubo #4');
    });

    it('keeps mixed-room allocations grouped by room family', () => {
        const meta = buildLedgerAllocationMeta({
            room_type: 'Multi-Room',
            unit_label: 'Multiple Units',
            unit_summary: 'AC Kubo #1, AC Kubo #2, AC Teepee #1',
            booking_items_count: 3
        });

        expect(meta.bookingKind).toBe('Multi-booking');
        expect(meta.primaryLabel).toBe('AC Kubos x2, AC Teepee');
    });
});
