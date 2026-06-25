import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const testDbPath = path.resolve(`tests/rebooking_policy_${Date.now()}.sqlite`);
process.env.DATABASE_PATH = testDbPath;
process.env.HUB_ADMIN_TOKEN = 'rebooking-test-token-999';

describe('Rebooking and Policy Enforcement', () => {
    let app;
    let closeDatabase;

    beforeAll(async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, room_type TEXT, total_units INTEGER, price REAL, marketing_name TEXT)");
                db.run("CREATE TABLE IF NOT EXISTS units (unit_id TEXT PRIMARY KEY, room_type_id TEXT, max_pax INTEGER, unit_label TEXT, unit_status TEXT)");
                db.run("CREATE TABLE IF NOT EXISTS bookings (booking_ref TEXT PRIMARY KEY, room_type TEXT, unit_id TEXT, check_in TEXT, check_out TEXT, guests INTEGER, full_name TEXT, email TEXT, phone TEXT, total_price REAL, balance REAL, status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
                db.run("CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_ref TEXT, amount REAL, transaction_type TEXT, status TEXT DEFAULT 'PENDING_VERIFICATION', payment_method TEXT, notes TEXT, receipt_path TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
                db.run("CREATE TABLE IF NOT EXISTS rebookings (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_ref TEXT, old_check_in TEXT, old_check_out TEXT, new_check_in TEXT, new_check_out TEXT, reason TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
                db.run("CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, entity_type TEXT, entity_id TEXT, actor TEXT DEFAULT 'system', details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ip_address TEXT)");
                db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");

                db.run("INSERT OR REPLACE INTO rooms (id, room_type, total_units) VALUES ('ACT', 'AC Teepee', 4)");
                db.run("INSERT OR REPLACE INTO units (unit_id, room_type_id, max_pax, unit_label) VALUES ('ac-teepee-1', 'ACT', 2, 'AC Teepee #1')");
                db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('is_portal_enabled', 'true')");
                db.run("INSERT OR REPLACE INTO units (unit_id, room_type_id, max_pax, unit_label) VALUES ('ac-teepee-2', 'ACT', 2, 'AC Teepee #2')", (err) => {
                    if (err) reject(err); else resolve();
                });
            });
        });
        db.close();

        const serverModule = await import('../../amalfi-hub/server.js');
        app = serverModule.default;
        closeDatabase = serverModule.closeDatabase;
    }, 20000);

    afterAll(async () => {
        await new Promise((r) => setTimeout(r, 300));
        if (closeDatabase) {
            try { await closeDatabase(); } catch {}
        }
        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch {}
        }
    });

    it('rejects one-night public bookings that fall on covered holiday dates', async () => {
        const res = await request(app)
            .post('/api/v1/public/book')
            .send({
                full_name: 'Holiday Guest',
                email: 'holiday@test.local',
                phone: '09123456789',
                room_type: 'AC Teepee',
                check_in: '2026-12-24',
                check_out: '2026-12-25',
                guests: 2,
                total_price: 2500,
                balance: 1250,
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('require at least 2 days');
    });

    it('allows operations to disable the holiday minimum-stay rejection', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.run(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_holiday_minimum_stay_enabled', 'false')",
                resolve
            );
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/book')
            .send({
                full_name: 'Holiday Override Guest',
                email: 'holiday-override@test.local',
                phone: '09123456789',
                room_type: 'AC Teepee',
                check_in: '2026-12-24',
                check_out: '2026-12-25',
                guests: 2,
                total_price: 2500,
                balance: 1250,
            });

        expect(res.status).toBe(400);
        expect(res.body.error).not.toContain('require at least 2 days');
        expect(res.body.error).toContain('Payment proof is required');

        const resetDb = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            resetDb.run(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_holiday_minimum_stay_enabled', 'true')",
                resolve
            );
        });
        resetDb.close();
    });

    it('accepts a guest rebooking request when the arrival date is at least 7 days away', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.run(
                "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REB-ALLOW', 'AC Teepee', 'ac-teepee-1', '2026-07-14', '2026-07-16', 2, 'Rebook Guest', 5000, 2500, 'RESERVED')",
                resolve
            );
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/rebooking-request')
            .send({
                booking_ref: 'REB-ALLOW',
                guest_name: 'Rebook Guest',
                new_check_in: '2026-07-18',
                new_check_out: '2026-07-20',
                reason: 'Need to move the trip',
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Rebooking request submitted');
    });

    it('blocks guest rebooking requests when the assigned unit is taken and suggests another unit', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.serialize(() => {
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REB-CONFLICT', 'AC Teepee', 'ac-teepee-1', '2026-07-14', '2026-07-16', 2, 'Conflict Guest', 5000, 2500, 'RESERVED')"
                );
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REB-BLOCKER', 'AC Teepee', 'ac-teepee-1', '2026-07-18', '2026-07-20', 2, 'Existing Guest', 5000, 2500, 'RESERVED')",
                    resolve
                );
            });
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/rebooking-request')
            .send({
                booking_ref: 'REB-CONFLICT',
                guest_name: 'Conflict Guest',
                new_check_in: '2026-07-18',
                new_check_out: '2026-07-20',
                reason: 'Need to move onto checked in dates',
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already booked');
        expect(res.body.conflicting_unit_id).toBe('ac-teepee-1');
        expect(res.body.suggested_units.some((unit) => unit.unit_id === 'ac-teepee-2')).toBe(true);

        const rows = await new Promise((resolve, reject) => {
            const verifyDb = new sqlite3.Database(testDbPath);
            verifyDb.all("SELECT * FROM rebookings WHERE booking_ref = 'REB-CONFLICT'", (err, result) => {
                verifyDb.close();
                if (err) reject(err); else resolve(result);
            });
        });
        expect(rows).toHaveLength(0);
    });

    it('blocks admin rebooking processing when the assigned unit conflicts and suggests another unit', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.serialize(() => {
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('ADM-REBOOK', 'AC Teepee', 'ac-teepee-1', '2026-07-14', '2026-07-16', 2, 'Admin Rebook Guest', 5000, 2500, 'RESERVED')"
                );
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('ADM-BLOCKER', 'AC Teepee', 'ac-teepee-1', '2026-07-18', '2026-07-20', 2, 'Existing Admin Guest', 5000, 2500, 'RESERVED')",
                    resolve
                );
            });
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/admin/bookings/ADM-REBOOK/process-rebooking')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`)
            .send({
                new_check_in: '2026-07-18',
                new_check_out: '2026-07-20',
                reason: 'Admin requested move',
                admin_id: 'Test-Admin',
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already booked');
        expect(res.body.suggested_units.some((unit) => unit.unit_id === 'ac-teepee-2')).toBe(true);

        const row = await new Promise((resolve, reject) => {
            const verifyDb = new sqlite3.Database(testDbPath);
            verifyDb.get("SELECT check_in, check_out FROM bookings WHERE booking_ref = 'ADM-REBOOK'", (err, result) => {
                verifyDb.close();
                if (err) reject(err); else resolve(result);
            });
        });
        expect(row.check_in).toBe('2026-07-14');
        expect(row.check_out).toBe('2026-07-16');
    });

    it('blocks rebooking when the target unit is held by a pending verification booking', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.serialize(() => {
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REB-PENDING-CONFLICT', 'AC Teepee', 'ac-teepee-1', '2027-06-01', '2027-06-03', 2, 'Pending Conflict Guest', 5000, 2500, 'RESERVED')"
                );
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status, created_at) VALUES ('REB-PENDING-BLOCKER', 'AC Teepee', 'ac-teepee-1', '2027-06-10', '2027-06-12', 2, 'Pending Verification Guest', 5000, 2500, 'PENDING_VERIFICATION', datetime('now', '-3 days'))",
                    resolve
                );
            });
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/rebooking-request')
            .send({
                booking_ref: 'REB-PENDING-CONFLICT',
                guest_name: 'Pending Conflict Guest',
                new_check_in: '2027-06-10',
                new_check_out: '2027-06-12',
                reason: 'Need to move onto held dates',
            });

        expect(res.status).toBe(409);
        expect(res.body.conflicting_booking.status).toBe('PENDING_VERIFICATION');
        expect(res.body.suggested_units.some((unit) => unit.unit_id === 'ac-teepee-2')).toBe(true);
    });

    it('rejects rebooking before payment verification is reserved', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.run(
                "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REB-PENDING-VERIFY', 'AC Teepee', 'ac-teepee-2', '2026-06-14', '2026-06-16', 2, 'Pending Verify Guest', 5000, 2500, 'PENDING_VERIFICATION')",
                resolve
            );
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/rebooking-request')
            .send({
                booking_ref: 'REB-PENDING-VERIFY',
                guest_name: 'Pending Verify Guest',
                new_check_in: '2026-06-18',
                new_check_out: '2026-06-20',
                reason: 'Trying before approval',
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('payment verification');
    });

    it('keeps unverified payment bookings out of the financial ledger', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.serialize(() => {
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('LEDGER-PENDING-OLD', 'AC Teepee', 'ac-teepee-1', '2026-06-22', '2026-06-24', 2, 'Ledger Pending Guest Old', 5000, 2500, 'PENDING_VERIFICATION')"
                );
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('LEDGER-PENDING', 'AC Teepee', 'ac-teepee-2', '2026-06-22', '2026-06-24', 2, 'Ledger Pending Guest', 5000, 2500, 'PENDING_VERIFICATION')"
                );
                db.run(
                    "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('LEDGER-APPROVED', 'AC Teepee', 'ac-teepee-2', '2026-06-25', '2026-06-27', 2, 'Ledger Reserved Guest', 5000, 2500, 'RESERVED')",
                    resolve
                );
            });
        });
        db.close();

        const res = await request(app)
            .get('/api/v1/admin/ledger')
            .set('Authorization', `Bearer ${process.env.HUB_ADMIN_TOKEN}`);

        expect(res.status).toBe(200);
        const refs = res.body.ledger.map((row) => row.booking_ref);
        expect(refs).not.toContain('LEDGER-PENDING-OLD');
        expect(refs).not.toContain('LEDGER-PENDING');
        expect(refs).toContain('LEDGER-APPROVED');
    });

    it('logs a guest refund claim through the central Hub', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.run(
                "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REF-CLAIM', 'AC Teepee', 'ac-teepee-1', '2026-05-10', '2026-05-12', 2, 'Refund Guest', 5000, 2500, 'RESERVED')",
                resolve
            );
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/refund-claim')
            .send({
                booking_ref: 'REF-CLAIM',
                guest_name: 'Refund Guest',
                amount: '2500',
                reason: 'Trip cancelled',
                platform: 'GCASH',
                account_number: '09170000000',
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Refund claim submitted');
    });

    it('rejects guest rebooking requests inside the 7-day policy window', async () => {
        const db = new sqlite3.Database(testDbPath);
        await new Promise((resolve) => {
            db.run(
                "INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, total_price, balance, status) VALUES ('REB-BLOCK', 'AC Teepee', 'ac-teepee-2', '2026-04-18', '2026-04-20', 2, 'Late Guest', 5000, 2500, 'RESERVED')",
                resolve
            );
        });
        db.close();

        const res = await request(app)
            .post('/api/v1/public/rebooking-request')
            .send({
                booking_ref: 'REB-BLOCK',
                guest_name: 'Late Guest',
                new_check_in: '2026-04-21',
                new_check_out: '2026-04-23',
                reason: 'Need to move late',
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('7 days or more before arrival');
    });
});
