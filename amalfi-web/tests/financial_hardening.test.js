import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// ðŸ›¡ï¸ Setup Environment
process.env.NODE_ENV = 'test';
const testDbPath = path.resolve(`tests/finance_hardening_${Date.now()}.sqlite`);
process.env.DATABASE_PATH = testDbPath;
process.env.HUB_ADMIN_TOKEN = 'finance-test-token-456';

describe('ðŸ’° Amalfi Financial Hardening: Edge Case & Precision Stress', () => {
    let app;
    let closeDatabase;
    const testAdmin = 'Finance-Hardener';

    beforeAll(async () => {
        // Wait for potential previous runs to clear
        await new Promise(r => setTimeout(r, 1000));
        
        // Ensure tables exist in the NEW test DB
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, room_type TEXT, total_units INTEGER, price REAL, marketing_name TEXT)");
                db.run("CREATE TABLE IF NOT EXISTS units (unit_id TEXT PRIMARY KEY, room_type_id TEXT, max_pax INTEGER, unit_label TEXT, unit_status TEXT)");
                db.run("CREATE TABLE IF NOT EXISTS bookings (booking_ref TEXT PRIMARY KEY, room_type TEXT, unit_id TEXT, check_in TEXT, check_out TEXT, guests INTEGER, full_name TEXT, email TEXT, phone TEXT, total_price REAL, balance REAL, status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
                db.run("CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_ref TEXT, amount REAL, transaction_type TEXT, status TEXT DEFAULT 'PENDING_VERIFICATION', payment_method TEXT, notes TEXT, receipt_path TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

                db.run("INSERT OR REPLACE INTO rooms (id, room_type, total_units) VALUES ('PVL', 'Pool Villa', 5)");
                db.run("INSERT OR REPLACE INTO units (unit_id, room_type_id, max_pax, unit_label) VALUES ('PVL-01', 'PVL', 15, 'Pool Villa 01')", (err) => {
                    if (err) reject(err); else resolve();
                });
            });
        });
        db.close();

        // ðŸ›¡ï¸ DYNAMIC IMPORT: Load server AFTER env is set
        const serverModule = await import('../../amalfi-hub/server.js');
        app = serverModule.default;
        closeDatabase = serverModule.closeDatabase;
    }, 20000);


    afterAll(async () => {
        // Give the server a moment to finish any pending DB operations
        await new Promise(r => setTimeout(r, 500));
        if (closeDatabase) {
            try { await closeDatabase(); } catch (e) { console.warn("DB close warning (Finance):", e.message); }
        }
        if (fs.existsSync(testDbPath)) { 
            try { fs.unlinkSync(testDbPath); } catch(e) { console.warn("Cleanup warning (Lifecycle):", e.message); }
        }
    });

    it('Scenario 1: Float Precision Guard - Balance ?0.001 should be ?0', async () => {
        const ref = `PRECISION-${Date.now()}`;
        const db = new sqlite3.Database(testDbPath);
        // 5000.001 should round to 5000.00
        await new Promise(r => db.run("INSERT INTO bookings (booking_ref, full_name, total_price, status) VALUES (?, 'Mr. Precision', 5000.001, 'RESERVED')", [ref], r));
        
        // 1. Pay exactly 5000
        await new Promise(r => db.run("INSERT INTO transactions (booking_ref, amount, transaction_type, status) VALUES (?, 5000, 'payment', 'VERIFIED')", [ref], r));

        // 2. Trigger sync via a valid charge
        const res = await (await import('supertest')).default(app)
            .post(`/api/v1/admin/bookings/${ref}/add-charge`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ amount: 100, item_name: 'Sync Trigger', admin_id: testAdmin });

        expect(res.status).toBe(200);
        expect(res.body.balance).toBe(100); // 100.001 rounded to 100.00
        db.close();
    });

    it('Scenario 2: Refund Logic - Refund processing is retired in favor of rebooking', async () => {
        const ref = 'FIN-REFUND-MAX';
        
        // Setup: Booking with 5000 payment
        const db = new sqlite3.Database(testDbPath);
        await new Promise(r => db.run("INSERT INTO bookings (booking_ref, full_name, total_price) VALUES (?, 'Refund Guest', 5000)", [ref], r));
        await new Promise(r => db.run("INSERT INTO transactions (booking_ref, amount, transaction_type, status) VALUES (?, 3000, 'payment', 'VERIFIED')", [ref], r));

        // Attempt to refund 4000 (exceeds 3000 paid)
        const res = await (await import('supertest')).default(app)
            .post(`/api/v1/admin/bookings/${ref}/process-refund`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ amount: 4000, reason: 'Test Over-refund', admin_id: testAdmin });

        expect(res.status).toBe(410);
        expect(res.body.error).toContain('Refund processing has been retired');
        db.close();
    });

    it('Scenario 3: Audit Trail - Negative payments should be rejected', async () => {
        const ref = 'FIN-NEGATIVE-PAY';
        const res = await (await import('supertest')).default(app)
            .post(`/api/v1/admin/bookings/${ref}/manual-payment`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ amount: -500, admin_id: testAdmin });

        expect(res.status).toBe(400); // Should be blocked by validation
    });

    it('Scenario 4: Multi-item Addon totaling logic', async () => {
        const ref = 'FIN-ADDON-TOTAL';
        const db = new sqlite3.Database(testDbPath);
        await new Promise(r => db.run("INSERT INTO bookings (booking_ref, full_name, total_price) VALUES (?, 'Addon Guest', 1000)", [ref], r));

        // Add two charges
        await (await import('supertest')).default(app)
            .post(`/api/v1/admin/bookings/${ref}/add-charge`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ amount: 200, item_name: 'Dinner', admin_id: testAdmin });

        const res = await (await import('supertest')).default(app)
            .post(`/api/v1/admin/bookings/${ref}/add-charge`)
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({ amount: 300, item_name: 'Pool Access', admin_id: testAdmin });

        expect(res.body.balance).toBe(1500); // 1000 + 200 + 300
        db.close();
    });
});
