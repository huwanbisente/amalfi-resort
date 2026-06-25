import { describe, expect, it } from 'vitest';
import { buildFinancialCsv } from '../src/utils/financialCsvExport';
import { buildFinancialReportModel, mapLedgerRowForExport } from '../src/utils/financialReporting';

describe('Financial reporting model', () => {
    it('filters by month/year, dedupes booking refs, and computes totals consistently', () => {
        const ledger = [
            {
                booking_ref: 'BR-001',
                full_name: 'Alice',
                check_in: '2026-04-03',
                check_out: '2026-04-05',
                total_price: 4000,
                addon_amount: 1000,
                amount_paid: 3000,
                amount_refunded: 0,
                status: 'RESERVED',
                room_type: 'Villa',
                created_by: 'admin',
                created_at: '2026-04-01',
            },
            {
                booking_ref: 'BR-001',
                full_name: 'Alice Duplicate',
                check_in: '2026-04-03',
                total_price: 9999,
                addon_amount: 0,
                amount_paid: 0,
                status: 'RESERVED',
                created_at: '2026-04-01',
            },
            {
                booking_ref: 'BR-002',
                full_name: 'Bob',
                check_in: '2026-04-10',
                check_out: '2026-04-12',
                total_price: 2000,
                addon_amount: 0,
                amount_paid: 2000,
                amount_refunded: 500,
                status: 'CHECKED_OUT',
                room_type: 'Teepee',
                created_by: 'portal',
                created_at: '2026-04-08',
            },
            {
                booking_ref: 'BR-003',
                full_name: 'Hidden Pending',
                check_in: '2026-04-14',
                total_price: 7000,
                addon_amount: 0,
                amount_paid: 0,
                status: 'PENDING_VERIFICATION',
                created_at: '2026-04-14',
            },
            {
                booking_ref: 'BR-004',
                full_name: 'March Booking',
                check_in: '2026-03-10',
                total_price: 1500,
                addon_amount: 0,
                amount_paid: 1500,
                status: 'RESERVED',
                created_at: '2026-03-01',
            },
        ];

        const receivables = [
            {
                booking_ref: 'BR-001',
                full_name: 'Alice',
                check_in: '2026-04-03',
                total_price: 4000,
                addon_amount: 1000,
                amount_paid: 3000,
                amount_refunded: 0,
            },
        ];

        const model = buildFinancialReportModel({
            ledger,
            specialBookings: [],
            receivables,
            selectedMonth: '04',
            selectedYear: '2026',
            today: new Date('2026-04-20T00:00:00Z'),
        });

        expect(model.ledger).toHaveLength(2);
        expect(model.totals.grossBilled).toBe(7000);
        expect(model.totals.cashCollected).toBe(4500);
        expect(model.totals.refunds).toBe(500);
        expect(model.totals.outstanding).toBe(2500);
        expect(model.totals.agentCommission).toBe(175);
        expect(model.receivables).toHaveLength(1);
        expect(model.aging['1-30 Days']).toBe(2000);
    });

    it('maps ledger rows for export with gross-based commission and balances', () => {
        const mapped = mapLedgerRowForExport({
            booking_ref: 'BR-100',
            full_name: 'Charlie',
            room_type: 'AC Teepee',
            check_in: '2026-04-01',
            check_out: '2026-04-02',
            total_price: 10000,
            addon_amount: 2000,
            amount_paid: 2500,
            amount_refunded: 0,
            status: 'RESERVED',
            created_by: 'admin',
            created_at: '2026-04-01 10:00:00',
        });

        expect(mapped.grossAmount).toBe('12000.00');
        expect(mapped.amountPaid).toBe('2500.00');
        expect(mapped.balance).toBe('9500.00');
        expect(mapped.commissionAmount).toBe('300.00');
        expect(mapped.commissionEligible).toBe('YES');
    });

    it('filters the financial report by exact date range for granular totals', () => {
        const ledger = [
            {
                booking_ref: 'DR-001',
                full_name: 'Early Guest',
                check_in: '2026-04-02',
                total_price: 3000,
                addon_amount: 0,
                amount_paid: 3000,
                status: 'RESERVED',
            },
            {
                booking_ref: 'DR-002',
                full_name: 'Inside Guest',
                check_in: '2026-04-10',
                total_price: 5000,
                addon_amount: 500,
                amount_paid: 2500,
                status: 'RESERVED',
            },
            {
                booking_ref: 'DR-003',
                full_name: 'Late Guest',
                check_in: '2026-04-22',
                total_price: 7000,
                addon_amount: 0,
                amount_paid: 7000,
                status: 'CHECKED_OUT',
            },
        ];

        const model = buildFinancialReportModel({
            ledger,
            selectedMonth: '04',
            selectedYear: '2026',
            dateFrom: '2026-04-05',
            dateTo: '2026-04-15',
            today: new Date('2026-04-20T00:00:00Z'),
        });

        expect(model.ledger.map((row) => row.booking_ref)).toEqual(['DR-002']);
        expect(model.totals.grossBilled).toBe(5500);
        expect(model.totals.cashCollected).toBe(2500);
        expect(model.totals.outstanding).toBe(3000);
        expect(model.reportPeriod).toContain('2026-04-05 to 2026-04-15');
    });

    it('builds a richer accountant csv with report metadata', () => {
        const csv = buildFinancialCsv([
            {
                booking_ref: 'BR-200',
                full_name: 'Dana "Quoted"',
                room_type: 'Villa',
                check_in: '2026-04-07',
                check_out: '2026-04-09',
                total_price: 5000,
                addon_amount: 500,
                amount_paid: 3000,
                amount_refunded: 0,
                status: 'RESERVED',
                created_by: 'portal',
                created_at: '2026-04-01',
            },
        ], {
            reportPeriod: 'April 2026',
            generatedAt: 'April 12, 2026 10:00 AM',
        });

        expect(csv).toContain('"Report Period","April 2026"');
        expect(csv).toContain('"Dana ""Quoted"""');
        expect(csv).toContain('"5500.00"');
        expect(csv).toContain('"2500.00"');
        expect(csv).toContain('"YES"');
        expect(csv).toContain('"137.50"');
    });
});
