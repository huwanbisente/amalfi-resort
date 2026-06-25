import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import request from 'supertest';
import sqlite3 from 'sqlite3';

process.env.NODE_ENV = 'test';
const testDbPath = path.resolve(`tests/transaction_foundation_${Date.now()}.sqlite`);
process.env.DATABASE_PATH = testDbPath;
process.env.HUB_ADMIN_TOKEN = 'transaction-foundation-token';

function addDays(baseDate, days) {
    const next = new Date(baseDate);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
}

const RETIRED_HEADER_ALIAS_KEYS = [
    'customer_name',
    'total_amount',
    'total_paid',
    'balance',
    'booking_status'
];

const RETIRED_ITEM_ALIAS_KEYS = [
    'guests',
    'subtotal',
    'item_status'
];

const RETIRED_PAYMENT_ALIAS_KEYS = [
    'payment_status',
    'receipt_reference'
];

function expectNoRetiredTransactionAliases(payload = {}, retiredKeys = []) {
    retiredKeys.forEach((key) => {
        expect(payload).not.toHaveProperty(key);
    });
}

function runSql(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getSql(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allSql(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

describe('Transaction Booking Foundation', () => {
    let app;
    let closeDatabase;
    let createHeaderWithItems;
    let recordPayment;
    let getBookingHeaderWithItems;
    let findOverlappingBookingItems;
    let recomputeHeaderFinance;

    beforeAll(async () => {
        const serverModule = await import('../../amalfi-hub/server.js');
        app = serverModule.default;
        closeDatabase = serverModule.closeDatabase;
        createHeaderWithItems = serverModule.createHeaderWithItems;
        recordPayment = serverModule.recordPayment;
        getBookingHeaderWithItems = serverModule.getBookingHeaderWithItems;
        findOverlappingBookingItems = serverModule.findOverlappingBookingItems;
        recomputeHeaderFinance = serverModule.recomputeHeaderFinance;

        await new Promise((resolve) => setTimeout(resolve, 1500));
    }, 20000);

    afterAll(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (closeDatabase) {
            try { await closeDatabase(); } catch (err) { console.warn('DB close warning (Foundation):', err.message); }
        }
        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (err) { console.warn('Cleanup warning (Foundation):', err.message); }
        }
    });

    it('creates one booking header with multiple inventory items', async () => {
        const result = await createHeaderWithItems({
            header: {
                booking_reference: 'RES-FOUND-0001',
                guest_name: 'Northwind Delegation',
                email: 'ops@northwind.test',
                phone: '09170000001',
                check_in: '2026-08-10',
                check_out: '2026-08-12',
                lodging_total: 27000,
                status: 'RESERVED',
                booking_source: 'Admin Group Desk',
                created_by: 'admin'
            },
            items: [
                { unit_id: 'PVL-01', room_type: 'Pool Villa', check_in: '2026-08-10', check_out: '2026-08-12', guest_count: 8, lodging_subtotal: 9000, status: 'RESERVED' },
                { unit_id: 'PVL-02', room_type: 'Pool Villa', check_in: '2026-08-10', check_out: '2026-08-12', guest_count: 8, lodging_subtotal: 9000, status: 'RESERVED' },
                { unit_id: 'PVL-03', room_type: 'Pool Villa', check_in: '2026-08-10', check_out: '2026-08-12', guest_count: 8, lodging_subtotal: 9000, status: 'RESERVED' }
            ]
        });

        expect(result.header.booking_reference).toBe('RES-FOUND-0001');
        expect(result.header.balance_due).toBe(27000);
        expect(result.header.status).toBe('RESERVED');
        expect(result.header.guest_name).toBe('Northwind Delegation');
        expect(result.header.lodging_total).toBe(27000);
        expect(result.header.verified_paid_total).toBe(0);
        expect(result.header.balance_due).toBe(27000);
        expect(result.header.payment_status).toBe('UNPAID');
        expect(result.header.payment_summary_status).toBe('UNPAID');
        expectNoRetiredTransactionAliases(result.header, RETIRED_HEADER_ALIAS_KEYS);
        expect(result.items).toHaveLength(3);
        expect(result.items.map((item) => item.unit_id)).toEqual(['PVL-01', 'PVL-02', 'PVL-03']);
        expect(result.items[0].status).toBe('RESERVED');
        expect(result.items[0].guest_count).toBe(8);
        expect(result.items[0].lodging_subtotal).toBe(9000);
        expectNoRetiredTransactionAliases(result.items[0], RETIRED_ITEM_ALIAS_KEYS);
    });

    it('records one payment stream at the header level and recomputes balance correctly', async () => {
        const paymentResult = await recordPayment({
            booking_reference: 'RES-FOUND-0001',
            amount: 9000,
            payment_type: 'deposit',
            payment_method: 'Bank Transfer',
            verification_status: 'VERIFIED',
            receipt_url: 'RCPT-FOUND-01'
        });

        expect(paymentResult.finance.booking_reference).toBe('RES-FOUND-0001');
        expect(paymentResult.finance.verified_paid_total).toBe(9000);
        expect(paymentResult.finance.balance_due).toBe(18000);
        expect(paymentResult.finance.payment_status).toBe('PARTIAL');
        expect(paymentResult.finance.payment_summary_status).toBe('PARTIAL');
        expect(paymentResult.payment.verification_status).toBe('VERIFIED');
        expect(paymentResult.payment.receipt_url).toBe('RCPT-FOUND-01');
        expectNoRetiredTransactionAliases(paymentResult.finance, RETIRED_HEADER_ALIAS_KEYS);
        expectNoRetiredTransactionAliases(paymentResult.payment, RETIRED_PAYMENT_ALIAS_KEYS);

        const hydrated = await getBookingHeaderWithItems('RES-FOUND-0001');
        expect(hydrated.header.verified_paid_total).toBe(9000);
        expect(hydrated.header.balance_due).toBe(18000);
        expect(hydrated.items).toHaveLength(3);
        expect(hydrated.payments).toHaveLength(1);
        expect(hydrated.payments[0].verification_status).toBe('VERIFIED');
        expectNoRetiredTransactionAliases(hydrated.header, RETIRED_HEADER_ALIAS_KEYS);
        expectNoRetiredTransactionAliases(hydrated.items[0], RETIRED_ITEM_ALIAS_KEYS);
        expectNoRetiredTransactionAliases(hydrated.payments[0], RETIRED_PAYMENT_ALIAS_KEYS);
    });

    it('blocks transaction check-in payment targets unless the payment entry is explicit', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-CHECKIN-GUARD',
                guest_name: 'Guarded Arrival',
                check_in: '2026-08-18',
                check_out: '2026-08-19',
                lodging_total: 5000,
                status: 'RESERVED',
                booking_source: 'Admin',
                created_by: 'admin'
            },
            items: [
                { room_type: 'AC Teepee', check_in: '2026-08-18', check_out: '2026-08-19', guest_count: 2, lodging_subtotal: 5000, status: 'RESERVED' }
            ]
        });

        const blockedRes = await request(app)
            .post('/api/v1/admin/bookings/RES-CHECKIN-GUARD/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'checkin',
                payment_target: {
                    target_paid_total: 5000,
                    payment_method: 'Cash',
                    notes: 'Accidental full settlement'
                },
                admin_id: 'Test-Guard'
            });

        expect(blockedRes.status).toBe(400);
        expect(blockedRes.body.error).toContain('explicit manual payment entry');

        const afterBlocked = await getBookingHeaderWithItems('RES-CHECKIN-GUARD');
        expect(afterBlocked.header.status).toBe('RESERVED');
        expect(afterBlocked.header.verified_paid_total).toBe(0);
        expect(afterBlocked.header.balance_due).toBe(5000);
        expect(afterBlocked.payments).toHaveLength(0);

        const confirmedRes = await request(app)
            .post('/api/v1/admin/bookings/RES-CHECKIN-GUARD/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'checkin',
                payment_target: {
                    target_paid_total: 5000,
                    payment_method: 'Cash',
                    notes: 'Explicit front desk payment',
                    confirmed_manual_entry: true
                },
                admin_id: 'Test-Guard'
            });

        expect(confirmedRes.status).toBe(200);
        expect(confirmedRes.body.newStatus).toBe('CHECKED_IN');
        expect(confirmedRes.body.finance.balance_due).toBe(0);
    });

    it('rejects retired transaction/header API aliases on new writes', async () => {
        const createRes = await request(app)
            .post('/api/v1/admin/booking-headers')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                admin_id: 'alias-contract-test',
                header: {
                    booking_reference: 'RES-RETIRED-ALIAS',
                    customer_name: 'Old Alias Guest',
                    check_in: '2026-08-20',
                    check_out: '2026-08-21',
                    total_amount: 9000,
                    booking_status: 'RESERVED'
                },
                items: [
                    {
                        unit_id: 'PVL-09',
                        room_type: 'Pool Villa',
                        check_in: '2026-08-20',
                        check_out: '2026-08-21',
                        guests: 4,
                        subtotal: 9000,
                        item_status: 'RESERVED'
                    }
                ]
            });

        expect(createRes.status).toBe(400);
        expect(createRes.body.retired_aliases).toEqual(expect.arrayContaining([
            'header.customer_name',
            'header.total_amount',
            'header.booking_status',
            'items[0].guests',
            'items[0].subtotal',
            'items[0].item_status'
        ]));

        const paymentRes = await request(app)
            .post('/api/v1/admin/booking-headers/RES-FOUND-0001/payments')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                amount: 1000,
                payment_type: 'deposit',
                payment_status: 'VERIFIED',
                receipt_reference: 'OLD-RECEIPT-01'
            });

        expect(paymentRes.status).toBe(400);
        expect(paymentRes.body.retired_aliases).toEqual(expect.arrayContaining([
            'payment.payment_status',
            'payment.receipt_reference'
        ]));
    });

    it('does not block availability when only a header exists without inventory items', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-FOUND-QUEUE',
                guest_name: 'Queue Only Group',
                check_in: '2026-09-01',
                check_out: '2026-09-03',
                lodging_total: 12000,
                status: 'PENDING_VERIFICATION'
            },
            items: []
        });

        const blocked = await findOverlappingBookingItems({
            checkIn: '2026-09-01',
            checkOut: '2026-09-03',
            unitIds: ['PVL-09']
        });

        expect(blocked).toHaveLength(0);
    });

    it('blocks availability from booking_items rather than booking_headers', async () => {
        const conflicts = await findOverlappingBookingItems({
            checkIn: '2026-08-11',
            checkOut: '2026-08-13',
            unitIds: ['PVL-02', 'PVL-03']
        });

        expect(conflicts).toHaveLength(2);
        expect(conflicts.every((item) => item.booking_reference === 'RES-FOUND-0001')).toBe(true);

        const finance = await recomputeHeaderFinance('RES-FOUND-0001');
        expect(finance.balance_due).toBe(18000);
        expect(finance.payment_status).toBe('PARTIAL');
    });

    it('converts a single-room booking into a multi-room transaction booking from edit change-set', async () => {
        const db = new sqlite3.Database(testDbPath);
        try {
            await runSql(db, `INSERT OR REPLACE INTO units (unit_id, room_type_id, unit_label, max_pax) VALUES ('EDIT-SMH-01', 'Single Room', 'Single Main 01', 10)`);
            await runSql(db, `INSERT OR REPLACE INTO units (unit_id, room_type_id, unit_label, max_pax) VALUES ('EDIT-SMH-02', 'Single Room', 'Single Main 02', 10)`);
            await runSql(
                db,
                `INSERT INTO bookings
                 (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, status, booking_source, notes)
                 VALUES ('EDIT-CONVERT-01', 'Single Room', 'EDIT-SMH-01', '2026-10-10', '2026-10-12', 8, 'Convert Guest', 'convert@test.local', '09170001111', 12000, 6000, 'RESERVED', 'Admin', 'Original note')`
            );
            await runSql(
                db,
                `INSERT INTO transactions (booking_ref, amount, transaction_type, payment_method, status, notes)
                 VALUES ('EDIT-CONVERT-01', 6000, 'deposit', 'Cash', 'VERIFIED', 'Original deposit')`
            );
        } finally {
            await new Promise((resolve) => db.close(resolve));
        }

        const res = await request(app)
            .post('/api/v1/admin/bookings/EDIT-CONVERT-01/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'edit',
                admin_id: 'edit-modal-test',
                booking: {
                    convert_to_transaction: true,
                    guest_name: 'Convert Guest',
                    check_in: '2026-10-10',
                    check_out: '2026-10-12',
                    guests: 8,
                    status: 'RESERVED',
                    lodging_total: 18000,
                    items: [
                        { booking_item_id: 'seed-EDIT-CONVERT-01', unit_id: 'EDIT-SMH-01', room_type: 'Single Room', guest_count: 4, lodging_subtotal: 9000, status: 'RESERVED' },
                        { booking_item_id: 'temp-edit-2', unit_id: 'EDIT-SMH-02', room_type: 'Single Room', guest_count: 4, lodging_subtotal: 9000, status: 'RESERVED' }
                    ]
                }
            });

        expect(res.status).toBe(200);
        expect(res.body.booking_type).toBe('transaction_header');
        expect(res.body.converted_from).toBe('single_booking');
        expect(res.body.booking.items).toHaveLength(2);
        expect(res.body.booking.header.booking_mode).toBe('TRANSACTION_GROUP');
        expect(res.body.finance.verified_paid_total).toBe(6000);
        expect(res.body.finance.balance_due).toBe(12000);

        const verifyDb = new sqlite3.Database(testDbPath);
        try {
            const legacy = await getSql(verifyDb, `SELECT booking_ref FROM bookings WHERE booking_ref = 'EDIT-CONVERT-01'`);
            const legacyTx = await allSql(verifyDb, `SELECT id FROM transactions WHERE booking_ref = 'EDIT-CONVERT-01'`);
            const payments = await allSql(verifyDb, `SELECT payment_id, amount, verification_status FROM payments WHERE booking_reference = 'EDIT-CONVERT-01'`);
            expect(legacy).toBeUndefined();
            expect(legacyTx).toHaveLength(0);
            expect(payments).toHaveLength(1);
            expect(payments[0].verification_status).toBe('VERIFIED');
        } finally {
            await new Promise((resolve) => verifyDb.close(resolve));
        }
    });

    it('lets edit change-set set paid total downward when the room total decreases', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-PAID-TARGET',
                guest_name: 'Paid Target Guest',
                check_in: '2026-11-10',
                check_out: '2026-11-12',
                lodging_total: 54000,
                status: 'RESERVED'
            },
            items: [
                { unit_id: 'PVL-07', room_type: 'Pool Villa', check_in: '2026-11-10', check_out: '2026-11-12', guest_count: 10, lodging_subtotal: 54000, status: 'RESERVED' }
            ]
        });
        await recordPayment({
            booking_reference: 'RES-PAID-TARGET',
            amount: 54000,
            payment_type: 'Full Payment',
            payment_method: 'Cash',
            verification_status: 'VERIFIED'
        });
        const paidTargetBooking = await getBookingHeaderWithItems('RES-PAID-TARGET');

        const res = await request(app)
            .post('/api/v1/admin/bookings/RES-PAID-TARGET/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'edit',
                admin_id: 'paid-target-test',
                booking: {
                    lodging_total: 24000,
                    total_price: 24000,
                    check_in: '2026-11-10',
                    check_out: '2026-11-12',
                    items: [
                        { booking_item_id: paidTargetBooking.items[0].booking_item_id, unit_id: 'PVL-07', room_type: 'Pool Villa', guest_count: 5, lodging_subtotal: 24000, status: 'RESERVED' }
                    ]
                },
                payment_target: {
                    target_paid_total: 24000,
                    payment_method: 'Cash',
                    notes: 'Adjusted after room change'
                }
            });

        expect(res.status).toBe(200);
        expect(res.body.finance.verified_paid_total).toBe(24000);
        expect(res.body.finance.balance_due).toBe(0);

        const verifyDb = new sqlite3.Database(testDbPath);
        try {
            const refunds = await allSql(verifyDb, `SELECT amount, payment_type, verification_status FROM payments WHERE booking_reference = 'RES-PAID-TARGET' AND payment_type = 'refund'`);
            expect(refunds).toHaveLength(1);
            expect(refunds[0].amount).toBe(30000);
            expect(refunds[0].verification_status).toBe('VERIFIED');
        } finally {
            await new Promise((resolve) => verifyDb.close(resolve));
        }
    });

    it('validates multi-room date changes against intended units, not stale original units', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-EDIT-MOVE-UNITS',
                guest_name: 'Move Units Guest',
                check_in: '2026-06-10',
                check_out: '2026-06-12',
                lodging_total: 28000,
                status: 'RESERVED',
                booking_mode: 'TRANSACTION_GROUP'
            },
            items: [
                { unit_id: 'pool-villa-1', room_type: 'Pool Villa', check_in: '2026-06-10', check_out: '2026-06-12', guest_count: 12, lodging_subtotal: 14000, status: 'RESERVED' },
                { unit_id: 'owners-villa-1', room_type: "Owner's Villa", check_in: '2026-06-10', check_out: '2026-06-12', guest_count: 12, lodging_subtotal: 14000, status: 'RESERVED' }
            ]
        });

        const db = new sqlite3.Database(testDbPath);
        try {
            await runSql(
                db,
                `INSERT INTO unit_date_tags (unit_id, tag_type, start_date, end_date, note, blocks_inventory, created_by)
                 VALUES ('pool-villa-1', 'maintenance', '2026-06-18', '2026-06-20', 'Old unit blocked only', 1, 'test')`
            );
        } finally {
            await new Promise((resolve) => db.close(resolve));
        }

        const current = await getBookingHeaderWithItems('RES-EDIT-MOVE-UNITS');
        const [firstItem, secondItem] = current.items;

        const res = await request(app)
            .post('/api/v1/admin/bookings/RES-EDIT-MOVE-UNITS/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'edit',
                admin_id: 'edit-modal-test',
                booking: {
                    check_in: '2026-06-19',
                    check_out: '2026-06-21',
                    lodging_total: 52000,
                    total_price: 52000,
                    status: 'RESERVED',
                    booking_mode: 'TRANSACTION_GROUP',
                    items: [
                        { booking_item_id: firstItem.booking_item_id, unit_id: 'pool-villa-2', room_type: 'Pool Villa', check_in: '2026-06-19', check_out: '2026-06-21', guest_count: 12, lodging_subtotal: 26000, status: 'RESERVED' },
                        { booking_item_id: secondItem.booking_item_id, unit_id: 'pool-villa-3', room_type: 'Pool Villa', check_in: '2026-06-19', check_out: '2026-06-21', guest_count: 12, lodging_subtotal: 26000, status: 'RESERVED' }
                    ]
                }
            });

        expect(res.status).toBe(200);
        expect(res.body.booking.items.map((item) => item.unit_id)).toEqual(['pool-villa-2', 'pool-villa-3']);
        expect(res.body.booking.items.every((item) => item.check_in === '2026-06-19' && item.check_out === '2026-06-21')).toBe(true);
    });

    it('lets edit change-set remove one unit and move another unit into that room in the same save', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-EDIT-REMOVE-SWAP',
                guest_name: 'Remove Swap Guest',
                check_in: '2026-07-10',
                check_out: '2026-07-12',
                lodging_total: 10000,
                status: 'RESERVED',
                booking_mode: 'TRANSACTION_GROUP'
            },
            items: [
                { unit_id: 'pool-villa-1', room_type: 'Pool Villa', check_in: '2026-07-10', check_out: '2026-07-12', guest_count: 6, lodging_subtotal: 5000, status: 'RESERVED' },
                { unit_id: 'pool-villa-2', room_type: 'Pool Villa', check_in: '2026-07-10', check_out: '2026-07-12', guest_count: 6, lodging_subtotal: 5000, status: 'RESERVED' }
            ]
        });

        const current = await getBookingHeaderWithItems('RES-EDIT-REMOVE-SWAP');
        const [keptItem, removedItem] = current.items;

        const res = await request(app)
            .post('/api/v1/admin/bookings/RES-EDIT-REMOVE-SWAP/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'edit',
                admin_id: 'edit-modal-test',
                booking: {
                    lodging_total: 10000,
                    total_price: 10000,
                    status: 'RESERVED',
                    booking_mode: 'TRANSACTION_GROUP',
                    items: [
                        { booking_item_id: keptItem.booking_item_id, unit_id: 'pool-villa-2', room_type: 'Pool Villa', check_in: '2026-07-10', check_out: '2026-07-12', guest_count: 6, lodging_subtotal: 10000, status: 'RESERVED' },
                        { booking_item_id: removedItem.booking_item_id, unit_id: 'pool-villa-2', room_type: 'Pool Villa', check_in: '2026-07-10', check_out: '2026-07-12', guest_count: 0, lodging_subtotal: 0, status: 'CANCELLED' }
                    ]
                }
            });

        expect(res.status).toBe(200);
        const activeItems = res.body.booking.items.filter((item) => item.status !== 'CANCELLED');
        const cancelledItems = res.body.booking.items.filter((item) => item.status === 'CANCELLED');
        expect(activeItems).toHaveLength(1);
        expect(activeItems[0].unit_id).toBe('pool-villa-2');
        expect(cancelledItems).toHaveLength(1);

        const checkoutRes = await request(app)
            .post('/api/v1/admin/bookings/RES-EDIT-REMOVE-SWAP/change-set')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'checkout',
                admin_id: 'edit-modal-test',
                payment_target: {
                    target_paid_total: 10000,
                    payment_method: 'Cash',
                    confirmed_manual_entry: true
                }
            });

        expect(checkoutRes.status).toBe(200);

        const db = new sqlite3.Database(testDbPath);
        try {
            const rows = await allSql(
                db,
                `SELECT unit_id, status FROM booking_items WHERE booking_reference = ? ORDER BY booking_item_id ASC`,
                ['RES-EDIT-REMOVE-SWAP']
            );
            expect(rows).toEqual([
                expect.objectContaining({ unit_id: 'pool-villa-2', status: 'CHECKED_OUT' }),
                expect.objectContaining({ unit_id: 'pool-villa-2', status: 'CANCELLED' })
            ]);
        } finally {
            await new Promise((resolve) => db.close(resolve));
        }
    });

    it('surfaces header-level payments in the admin transaction log', async () => {
        const res = await request(app)
            .get('/api/v1/admin/financials/transactions')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.transactions)).toBe(true);

        const tx = res.body.transactions.find((row) => row.booking_ref === 'RES-FOUND-0001');
        expect(tx).toBeTruthy();
        expect(tx.record_origin).toBe('transaction_payment');
        expect(tx.amount).toBe(9000);
        expect(tx.transaction_type).toBe('deposit');
        expect(tx.status).toBe('VERIFIED');
        expect(tx.full_name).toBe('Northwind Delegation');
        expect(tx.unit_label).toBe('Multiple Units');
        expect(tx.created_by).toBe('admin');
        expect(tx.booking_source).toBe('Admin Group Desk');
    });

    it('keeps multi-unit header bookings legible across ledger-facing admin endpoints', async () => {
        const today = new Date();
        const checkIn = addDays(today, 1);
        const checkOut = addDays(today, 2);

        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-FOUND-SOON',
                guest_name: 'Summit Circle',
                email: 'summit@test.local',
                phone: '09170000002',
                check_in: checkIn,
                check_out: checkOut,
                lodging_total: 18000,
                status: 'RESERVED',
                booking_source: 'Admin Group Desk',
                created_by: 'admin'
            },
            items: [
                { unit_id: 'PVL-07', room_type: 'Pool Villa', check_in: checkIn, check_out: checkOut, guest_count: 6, lodging_subtotal: 9000, status: 'RESERVED' },
                { unit_id: 'PVL-08', room_type: 'Pool Villa', check_in: checkIn, check_out: checkOut, guest_count: 6, lodging_subtotal: 9000, status: 'RESERVED' }
            ]
        });

        await recordPayment({
            booking_reference: 'RES-FOUND-SOON',
            amount: 6000,
            payment_type: 'deposit',
            payment_method: 'Admin Entry',
            verification_status: 'VERIFIED'
        });

        const [ledgerRes, receivablesRes, checkinsRes, checkoutsRes] = await Promise.all([
            request(app).get('/api/v1/admin/ledger').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`),
            request(app).get('/api/v1/admin/financials/receivables').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`),
            request(app).get('/api/v1/admin/financials/checkins').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`),
            request(app).get('/api/v1/admin/financials/checkouts').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
        ]);

        expect(ledgerRes.status).toBe(200);
        expect(receivablesRes.status).toBe(200);
        expect(checkinsRes.status).toBe(200);
        expect(checkoutsRes.status).toBe(200);

        const ledgerRow = ledgerRes.body.ledger.find((row) => row.booking_ref === 'RES-FOUND-SOON');
        const receivableRow = receivablesRes.body.receivables.find((row) => row.booking_ref === 'RES-FOUND-SOON');
        const checkinRow = checkinsRes.body.checkins.find((row) => row.booking_ref === 'RES-FOUND-SOON');
        const checkoutRow = checkoutsRes.body.checkouts.find((row) => row.booking_ref === 'RES-FOUND-SOON');

        expect(ledgerRow?.record_origin).toBe('transaction_header');
        expect(receivableRow?.record_origin).toBe('transaction_header');
        expect(checkinRow?.record_origin).toBe('transaction_header');
        expect(checkoutRow?.record_origin).toBe('transaction_header');

        expect(ledgerRow?.unit_label).toBe('Multiple Units');
        expect(receivableRow?.unit_label).toBe('Multiple Units');
        expect(checkinRow?.unit_label).toBe('Multiple Units');
        expect(checkoutRow?.unit_label).toBe('Multiple Units');
        expect(ledgerRow?.unit_summary).toContain('PVL-07');
        expect(ledgerRow?.unit_summary).toContain('PVL-08');
        expect(receivableRow?.unit_summary).toContain('PVL-07');
        expect(checkinRow?.unit_summary).toContain('PVL-08');
        expect(checkoutRow?.unit_summary).toContain('PVL-08');

        expect(receivableRow?.amount_paid).toBe(6000);
        expect(receivableRow?.total_price).toBe(18000);
    });

    it('supports the lean admin workflow views across active booking states', async () => {
        const today = new Date();
        const arrivalCheckIn = addDays(today, 3);
        const arrivalCheckOut = addDays(today, 5);
        const inHouseCheckIn = addDays(today, -1);
        const inHouseCheckOut = addDays(today, 1);
        const pastCheckIn = addDays(today, -5);
        const pastCheckOut = addDays(today, -2);

        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-WORKFLOW-ARRIVAL',
                guest_name: 'Arrival Guest',
                check_in: arrivalCheckIn,
                check_out: arrivalCheckOut,
                lodging_total: 12000,
                status: 'RESERVED',
                booking_source: 'Direct',
                created_by: 'admin'
            },
            items: [
                { unit_id: 'ACT-02', room_type: 'AC Teepee', check_in: arrivalCheckIn, check_out: arrivalCheckOut, guest_count: 2, lodging_subtotal: 12000, status: 'RESERVED' }
            ]
        });

        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-WORKFLOW-INHOUSE',
                guest_name: 'In House Guest',
                check_in: inHouseCheckIn,
                check_out: inHouseCheckOut,
                lodging_total: 9000,
                status: 'CHECKED_IN',
                booking_source: 'Walk-in',
                created_by: 'admin'
            },
            items: [
                { unit_id: 'ACT-03', room_type: 'AC Teepee', check_in: inHouseCheckIn, check_out: inHouseCheckOut, guest_count: 2, lodging_subtotal: 9000, status: 'RESERVED' }
            ]
        });

        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-WORKFLOW-PAST',
                guest_name: 'Past Guest',
                check_in: pastCheckIn,
                check_out: pastCheckOut,
                lodging_total: 7000,
                status: 'COMPLETED',
                verification_status: 'PAID',
                booking_source: 'Portal',
                created_by: 'guest'
            },
            items: [
                { unit_id: 'ACT-04', room_type: 'AC Teepee', check_in: pastCheckIn, check_out: pastCheckOut, guest_count: 2, lodging_subtotal: 7000, status: 'RESERVED' }
            ]
        });

        await recordPayment({
            booking_reference: 'RES-WORKFLOW-INHOUSE',
            amount: 3000,
            payment_type: 'deposit',
            payment_method: 'Cash',
            verification_status: 'VERIFIED'
        });

        await recordPayment({
            booking_reference: 'RES-WORKFLOW-PAST',
            amount: 7000,
            payment_type: 'payment',
            payment_method: 'GCash',
            verification_status: 'VERIFIED'
        });

        const [ledgerRes, receivablesRes, checkinsRes, txLogRes] = await Promise.all([
            request(app).get('/api/v1/admin/ledger').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`),
            request(app).get('/api/v1/admin/financials/receivables').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`),
            request(app).get('/api/v1/admin/financials/checkins').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`),
            request(app).get('/api/v1/admin/financials/transactions').set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
        ]);

        expect(ledgerRes.status).toBe(200);
        expect(receivablesRes.status).toBe(200);
        expect(checkinsRes.status).toBe(200);
        expect(txLogRes.status).toBe(200);

        const ledgerRows = ledgerRes.body.ledger || [];
        const receivableRows = receivablesRes.body.receivables || [];
        const checkinRows = checkinsRes.body.checkins || [];
        const txRows = txLogRes.body.transactions || [];

        const allBookingsRefs = ledgerRows.map((row) => row.booking_ref);
        const allActiveRefs = ledgerRows
            .filter((row) => !['CHECKED_OUT', 'COMPLETED', 'CANCELLED'].includes(row.status))
            .map((row) => row.booking_ref);
        const inHouseRefs = ledgerRows
            .filter((row) => row.status === 'CHECKED_IN')
            .map((row) => row.booking_ref);
        const pastRefs = ledgerRows
            .filter((row) => ['CHECKED_OUT', 'COMPLETED', 'CANCELLED'].includes(row.status))
            .map((row) => row.booking_ref);

        expect(allBookingsRefs).toContain('RES-WORKFLOW-ARRIVAL');
        expect(allBookingsRefs).toContain('RES-WORKFLOW-INHOUSE');
        expect(allBookingsRefs).toContain('RES-WORKFLOW-PAST');

        expect(allActiveRefs).toContain('RES-WORKFLOW-ARRIVAL');
        expect(allActiveRefs).toContain('RES-WORKFLOW-INHOUSE');
        expect(allActiveRefs).not.toContain('RES-WORKFLOW-PAST');

        expect(inHouseRefs).toContain('RES-WORKFLOW-INHOUSE');
        expect(inHouseRefs).not.toContain('RES-WORKFLOW-ARRIVAL');

        expect(pastRefs).toContain('RES-WORKFLOW-PAST');
        expect(pastRefs).not.toContain('RES-WORKFLOW-INHOUSE');

        expect(checkinRows.some((row) => row.booking_ref === 'RES-WORKFLOW-ARRIVAL')).toBe(true);
        expect(checkinRows.some((row) => row.booking_ref === 'RES-WORKFLOW-INHOUSE')).toBe(false);

        expect(receivableRows.some((row) => row.booking_ref === 'RES-WORKFLOW-ARRIVAL')).toBe(true);
        expect(receivableRows.some((row) => row.booking_ref === 'RES-WORKFLOW-INHOUSE')).toBe(true);
        expect(receivableRows.some((row) => row.booking_ref === 'RES-WORKFLOW-PAST')).toBe(false);

        expect(txRows.some((row) => row.booking_ref === 'RES-WORKFLOW-INHOUSE' && Number(row.amount) === 3000)).toBe(true);
        expect(txRows.some((row) => row.booking_ref === 'RES-WORKFLOW-PAST' && Number(row.amount) === 7000)).toBe(true);
    });

    it('allows admin deletion of transaction-header bookings from the central ledger', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-DELETE-HEADER',
                guest_name: 'Delete Me Kindly',
                email: 'delete@test.local',
                phone: '09170000003',
                check_in: '2026-10-10',
                check_out: '2026-10-12',
                lodging_total: 12000,
                status: 'RESERVED',
                booking_source: 'Admin Desk',
                created_by: 'admin'
            },
            items: [
                { unit_id: 'DEL-01', room_type: 'AC Kubo', check_in: '2026-10-10', check_out: '2026-10-12', guest_count: 2, lodging_subtotal: 12000, status: 'RESERVED' }
            ]
        });

        const deleteRes = await request(app)
            .delete('/api/v1/admin/bookings/RES-DELETE-HEADER')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ admin_id: 'vitest-admin' });

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toContain('Transaction booking and associated payment records purged successfully.');

        const remaining = await getBookingHeaderWithItems('RES-DELETE-HEADER');
        expect(remaining).toBeNull();

        const ledgerRes = await request(app)
            .get('/api/v1/admin/ledger')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`);

        expect(ledgerRes.status).toBe(200);
        expect(ledgerRes.body.ledger.some((row) => row.booking_ref === 'RES-DELETE-HEADER')).toBe(false);
    });

    it('allows browser-style transaction-header deletion with no request body', async () => {
        await createHeaderWithItems({
            header: {
                booking_reference: 'RES-DELETE-NO-BODY',
                guest_name: 'Delete Without Body',
                email: 'delete-nobody@test.local',
                phone: '09170000004',
                check_in: '2026-10-13',
                check_out: '2026-10-14',
                lodging_total: 8000,
                status: 'RESERVED',
                booking_source: 'Admin Hub',
                created_by: 'admin'
            },
            items: [
                { unit_id: 'DEL-02', room_type: 'AC Kubo', check_in: '2026-10-13', check_out: '2026-10-14', guest_count: 2, lodging_subtotal: 8000, status: 'RESERVED' }
            ]
        });

        const deleteRes = await request(app)
            .delete('/api/v1/admin/bookings/RES-DELETE-NO-BODY')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`);

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toContain('Transaction booking and associated payment records purged successfully.');

        const remaining = await getBookingHeaderWithItems('RES-DELETE-NO-BODY');
        expect(remaining).toBeNull();
    });
});
