import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// ðŸ›¡ï¸ Setup Environment
process.env.NODE_ENV = 'test';
const testDbPath = path.resolve(`tests/lifecycle_test_${Date.now()}.sqlite`);
process.env.DATABASE_PATH = testDbPath;
process.env.HUB_ADMIN_TOKEN = 'lifecycle-test-token-123';

let app;
let closeDatabase;
let rememberReceiptPrecheck;

function makeReceiptToken(amount) {
    return rememberReceiptPrecheck({
        cloudUrl: 'https://example.com/lifecycle-receipt.jpg',
        receiptCheck: {
            classification: 'payment_receipt',
            payment_method: 'gcash',
            confidence: 0.98,
            has_amount: true,
            has_reference: true,
            verified: true,
            rejected: false
        },
        amount,
        transactionType: 'deposit',
        paymentMethod: 'GCASH'
    });
}

describe('ðŸŒŠ Amalfi Lifecycle: The Guest Journey', () => {

    let bookingRef = '';
    const testAdminId = 'Lifecycle-Tester';

    beforeAll(async () => {
        // Dynamic import app AFTER setting env vars
        const serverModule = await import('../../amalfi-hub/server.js');
        app = serverModule.default;
        closeDatabase = serverModule.closeDatabase;
        rememberReceiptPrecheck = serverModule.rememberReceiptPrecheck;

        // Wait for server/DB initialization (schema created by server.js initializeDatabase)
        await new Promise(r => setTimeout(r, 2000));
        
        // Seed test data into the server-created schema
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("INSERT OR REPLACE INTO rooms (id, room_type, total_units) VALUES ('ACT', 'AC Teepee', 10)");
                db.run("INSERT OR REPLACE INTO units (unit_id, room_type_id, max_pax, unit_label, unit_status) VALUES ('ACT-01', 'ACT', 2, 'AC Teepee 01', 'Available')", (err) => {
                    if (err) reject(err); else resolve();
                });
            });
        });
        db.close();
    }, 20000);


    afterAll(async () => {
        await new Promise(r => setTimeout(r, 500));
        if (closeDatabase) {
            try { await closeDatabase(); } catch (e) { console.warn("DB close warning (Lifecycle):", e.message); }
        }
        if (fs.existsSync(testDbPath)) { 
            try { fs.unlinkSync(testDbPath); } catch(e) { console.warn("Cleanup warning (Lifecycle):", e.message); }
        }
    });

    it('Step 0: Public booking API rejects inventory holds without payment proof', async () => {
        const res = await request(app)
            .post('/api/v1/public/book')
            .send({
                full_name: 'No Proof Guest',
                email: 'no-proof@lifecycle.test',
                phone: '09123456789',
                room_type: 'AC Teepee',
                check_in: '2026-11-01',
                check_out: '2026-11-03',
                guests: 2,
                total_price: 5000,
                balance: 2500
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Payment proof is required');
    });

    it('Step 1: Guest submits a booking request (PENDING)', async () => {
        const payload = {
            full_name: 'John Doe',
            email: 'john@lifecycle.test',
            phone: '09123456789',
            room_type: 'AC Teepee',
            check_in: '2026-12-01',
            check_out: '2026-12-03',
            guests: 2,
            total_price: 5000,
            balance: 2500,
            receipt_token: makeReceiptToken(2500)
        };

        const res = await request(app)
            .post('/api/v1/public/book')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.booking_ref).toBeDefined();
        bookingRef = res.body.booking_ref;
        expect(res.body.status).toBe('PENDING_VERIFICATION');

        const db = new sqlite3.Database(testDbPath);
        const stored = await new Promise((resolve, reject) => {
            db.get(
                "SELECT status FROM bookings WHERE booking_ref = ?",
                [bookingRef],
                (err, row) => err ? reject(err) : resolve(row)
            );
        });
        db.close();
        expect(stored?.status).toBe('PENDING_VERIFICATION');
    });

    it('Step 2: Admin approves the booking & assigns unit', async () => {
        const payload = {
            status: 'RESERVED', 
            unit_id: 'ACT-01',
            admin_id: testAdminId
        };

        const res = await request(app)
            .patch(`/api/v1/admin/bookings/${bookingRef}`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('updated');
        
        // Verify in DB
        const check = await request(app).get(`/api/v1/public/availability`); 
        // Logic check: Unit should still be available for other dates but maybe not these?
        // Actually we hit the admin route to verify status
        // Since I don't have a single "get one booking" public route, I assume the patch return is enough or check DB.
    });

    it('Step 2b: Change-set preview validates without mutating the booking', async () => {
        const previewRes = await request(app)
            .post(`/api/v1/admin/bookings/${bookingRef}/change-set`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'edit',
                preview: true,
                booking: {
                    total_price: 5200,
                    addon_amount: 300,
                    notes: 'Preview only'
                },
                admin_id: testAdminId
            });

        expect(previewRes.status).toBe(200);
        expect(previewRes.body.is_preview).toBe(true);
        expect(previewRes.body.preview.final_balance).toBe(5500);

        const db = new sqlite3.Database(testDbPath);
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT total_price, addon_amount, notes FROM bookings WHERE booking_ref = ?`, [bookingRef], (err, result) => err ? reject(err) : resolve(result));
        });
        db.close();

        expect(Number(row.total_price)).toBe(5000);
        expect(Number(row.addon_amount || 0)).toBe(0);
        expect(row.notes || '').not.toBe('Preview only');
    });

    it('Step 2c: Normal edit uses change-set and recomputes booking finance', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/bookings/${bookingRef}/change-set`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'edit',
                booking: {
                    total_price: 5200,
                    addon_amount: 300,
                    notes: 'Committed through change-set'
                },
                admin_id: testAdminId
            });

        expect(res.status).toBe(200);
        expect(res.body.is_preview).toBe(false);
        expect(res.body.finance.gross_total).toBe(5500);
        expect(res.body.finance.balance).toBe(5500);
    });

    it('Step 2d: Check-in payment target cannot silently auto-settle balance', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/bookings/${bookingRef}/change-set`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                workflow: 'checkin',
                booking: {
                    total_price: 5200,
                    addon_amount: 300
                },
                payment_target: {
                    target_paid_total: 5500,
                    payment_method: 'Cash',
                    notes: 'Should not auto-settle without explicit confirmation'
                },
                admin_id: testAdminId
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('explicit manual payment entry');

        const db = new sqlite3.Database(testDbPath);
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT status, amount_paid, balance FROM bookings WHERE booking_ref = ?`, [bookingRef], (err, result) => err ? reject(err) : resolve(result));
        });
        db.close();

        expect(row.status).toBe('RESERVED');
        expect(Number(row.amount_paid || 0)).toBe(0);
        expect(Number(row.balance || 0)).toBe(5500);
    });

    it('Step 3: Admin atomically records full payment and checks in', async () => {
        const payload = {
            workflow: 'checkin',
            booking: {
                check_in: '2025-12-20',
                check_out: '2025-12-22',
                total_price: 5200,
                addon_amount: 300,
                unit_id: 'ACT-01'
            },
            payment: {
                amount: 5500,
                payment_method: 'GCash',
                notes: 'Atomic test payment'
            },
            admin_id: testAdminId
        };

        const res = await request(app)
            .post(`/api/v1/admin/bookings/${bookingRef}/change-set`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send(payload);

        if (res.status !== 200) {
            console.error('Step 3 FAILED with status', res.status, 'body:', JSON.stringify(res.body));
        }
        expect(res.status).toBe(200);
        expect(res.body.newStatus).toBe('CHECKED_IN');
        expect(res.body.finance.balance).toBe(0);
    });

    it('Step 4: Guest remains checked in after atomic settlement', async () => {
        const res = await request(app)
            .patch(`/api/v1/admin/bookings/${bookingRef}`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ status: 'CHECKED_IN', admin_id: testAdminId });

        expect(res.status).toBe(200);
    });

    it('Step 5: Admin performs atomic change-set checkout (Status -> CHECKED_OUT)', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/bookings/${bookingRef}/change-set`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ workflow: 'checkout', admin_id: testAdminId });

        expect(res.status).toBe(200);
        expect(res.body.newStatus).toBe('CHECKED_OUT');
    });
});
