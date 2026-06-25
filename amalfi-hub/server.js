import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Local dev: load from root .env (F:\PROJECTS\BUSINESS\Amalfi Resort\.env)
// Production (CT101): root doesn't exist in container - falls back to local .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnv = path.join(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(rootEnv) ? rootEnv : path.join(__dirname, '.env') });
const intelligenceRoot = process.env.INTELLIGENCE_PATH || (fs.existsSync('/intelligence') ? '/intelligence' : path.join(__dirname, '..', 'amalfi-system', 'intelligence'));

import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import yaml from 'js-yaml';

const app = express();
app.use('/api/v1/assets', express.static(path.join(intelligenceRoot, 'assets')));

const BOOKING_STATUS_PENDING_VERIFICATION = 'PENDING_VERIFICATION';
const BOOKING_STATUS_RESERVED = 'RESERVED';
const BOOKING_STATUS_CHECKED_IN = 'CHECKED_IN';
const BOOKING_STATUS_CHECKED_OUT = 'CHECKED_OUT';
const BOOKING_STATUS_CANCELLED = 'CANCELLED';
const BOOKING_STATUS_PAYMENT_REJECTED = 'PAYMENT_REJECTED';
const LEGACY_APPROVED_STATUS = 'APPROVED';
const LEGACY_OCCUPIED_STATUS = 'OCCUPIED';
const LEGACY_AWAITING_PAYMENT_STATUS = 'AWAITING_PAYMENT';
const LEGACY_DELETED_STATUS = 'DELETED';
const LEGACY_PENDING_STATUS = 'PENDING';
const LEGACY_HELD_STATUS = 'HELD';
const PAYMENT_SUMMARY_PAYMENT_REVIEW = 'PAYMENT_REVIEW';
const PAYMENT_SUMMARY_UNPAID = 'UNPAID';
const PAYMENT_SUMMARY_PARTIAL = 'PARTIAL';
const PAYMENT_SUMMARY_PAID = 'PAID';
const PAYMENT_SUMMARY_REJECTED = 'REJECTED';
const BOOKING_MODE_STANDARD = 'STANDARD';
const BOOKING_MODE_MANUAL_OVERRIDE = 'MANUAL_OVERRIDE';
// Canonical booking terms are RESERVED and CHECKED_IN. Legacy APPROVED/OCCUPIED
// stay readable until the database and older clients are fully migrated.
const ACTIVE_BOOKING_STATUSES = [BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, BOOKING_STATUS_PENDING_VERIFICATION, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS];
const INVENTORY_BLOCKING_BOOKING_STATUSES = [BOOKING_STATUS_PENDING_VERIFICATION, BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS];
const LEDGER_BOOKING_STATUSES = [BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, BOOKING_STATUS_CHECKED_OUT, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS, 'COMPLETED'];
const REBOOKABLE_BOOKING_STATUSES = [BOOKING_STATUS_RESERVED, LEGACY_APPROVED_STATUS];
const RECEIVABLE_BOOKING_STATUSES = [BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS];
const ACTIVE_HEADER_STATUSES = [BOOKING_STATUS_PENDING_VERIFICATION, BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, LEGACY_PENDING_STATUS, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS];
const ACTIVE_ITEM_STATUSES = [BOOKING_STATUS_PENDING_VERIFICATION, BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, LEGACY_HELD_STATUS, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS];
const OCCUPANCY_BOOKING_STATUSES = [...ACTIVE_BOOKING_STATUSES, 'CHECKED_OUT'];
const OCCUPANCY_HEADER_STATUSES = [...ACTIVE_HEADER_STATUSES, 'CHECKED_OUT'];
const OCCUPANCY_ITEM_STATUSES = [...ACTIVE_ITEM_STATUSES, 'CHECKED_OUT'];

function defaultPaymentSummaryForBookingStatus(status) {
    return normalizeBookingStatus(status) === BOOKING_STATUS_PENDING_VERIFICATION
        ? PAYMENT_SUMMARY_PAYMENT_REVIEW
        : PAYMENT_SUMMARY_UNPAID;
}

function normalizeBookingStatus(status, { forStorage = true } = {}) {
    const raw = String(status || '').trim();
    const upper = raw.toUpperCase();
    if (!upper) return raw;
    if (upper === LEGACY_APPROVED_STATUS) return BOOKING_STATUS_RESERVED;
    if (upper === LEGACY_OCCUPIED_STATUS) return BOOKING_STATUS_CHECKED_IN;
    if (upper === LEGACY_AWAITING_PAYMENT_STATUS) return BOOKING_STATUS_PENDING_VERIFICATION;
    if (upper === LEGACY_PENDING_STATUS) return BOOKING_STATUS_PENDING_VERIFICATION;
    if (upper === LEGACY_HELD_STATUS) return BOOKING_STATUS_PENDING_VERIFICATION;
    if (upper === LEGACY_DELETED_STATUS) return forStorage ? BOOKING_STATUS_CANCELLED : LEGACY_DELETED_STATUS;
    if (upper === 'COMPLETED') return BOOKING_STATUS_CHECKED_OUT;
    return upper;
}

function normalizePaymentSummary(status, { hasProof = false } = {}) {
    const raw = String(status || '').trim();
    const upper = raw.toUpperCase().replace(/\s+/g, '_');
    if (!upper) return hasProof ? PAYMENT_SUMMARY_PAYMENT_REVIEW : PAYMENT_SUMMARY_UNPAID;
    if (upper === 'FULLY_PAID' || upper === 'FULL_PAYMENT' || upper === 'VERIFIED') return PAYMENT_SUMMARY_PAID;
    if (upper === 'PARTIALLY_PAID' || upper === 'PARTIAL') return PAYMENT_SUMMARY_PARTIAL;
    if (upper === 'PAYMENT_REVIEW' || upper === 'PENDING_VERIFICATION') return PAYMENT_SUMMARY_PAYMENT_REVIEW;
    if (upper === 'UNPAID' || upper === 'NO_PAYMENT' || upper === 'BALANCE_DUE') return hasProof ? PAYMENT_SUMMARY_PAYMENT_REVIEW : PAYMENT_SUMMARY_UNPAID;
    if (upper === 'REJECTED' || upper === 'PAYMENT_REJECTED') return PAYMENT_SUMMARY_REJECTED;
    if ([PAYMENT_SUMMARY_PAID, PAYMENT_SUMMARY_PARTIAL, PAYMENT_SUMMARY_PAYMENT_REVIEW, PAYMENT_SUMMARY_UNPAID, PAYMENT_SUMMARY_REJECTED].includes(upper)) return upper;
    return upper;
}

function derivePaymentSummary({ grossTotal = 0, netPaid = 0, hasPendingProof = false, rejected = false } = {}) {
    if (rejected) return PAYMENT_SUMMARY_REJECTED;
    if (grossTotal > 0 && netPaid >= grossTotal - 0.01) return PAYMENT_SUMMARY_PAID;
    if (netPaid > 0) return PAYMENT_SUMMARY_PARTIAL;
    return hasPendingProof ? PAYMENT_SUMMARY_PAYMENT_REVIEW : PAYMENT_SUMMARY_UNPAID;
}

// Sanctuary hardening: second line of defense
app.set('trust proxy', 1); // Trust Cloudflare
app.use(helmet({ 
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // Allow Vite HMR in dev
}));

// Global Limit: 300 requests per 15 minutes (public routes only)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Too many requests from this IP. The Sanctuary is resting.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/v1/admin'), // Admin routes are already auth-protected
});
app.use(globalLimiter);

// Public Booking Safeguard: 5 bookings per 10 minutes
const bookingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { error: 'System limit reached. Please wait a few minutes before trying to book again.' },
    skip: (req) => req.url !== '/api/v1/public/book'
});
app.use('/api/v1/public/book', bookingLimiter);

// Receipt Upload Safeguard: protects Cloudinary + vision AI from repeated bad uploads
const receiptUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RECEIPT_UPLOAD_RATE_LIMIT || 8),
    message: { error: 'Too many receipt upload attempts. Please wait 15 minutes before trying again, or contact Amalfi Resort with your booking reference.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Fortress Guard: Identity Verification Middleware
 * Validates 'Authorization' header against the HUB_ADMIN_TOKEN (Admin Hub) 
 * or INTERNAL_AUTH_TOKEN (Chatbot Service).
 */
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>
    
    const validTokens = [
        process.env.HUB_ADMIN_TOKEN,
        process.env.INTERNAL_AUTH_TOKEN
    ].filter(Boolean);

    if (!token) {
        console.warn(`[${new Date().toISOString()}] Unauthorized access attempt: no token provided. IP: ${req.ip}`);
        return res.status(401).json({ error: 'Forbidden: Sanctuary access requires a valid signature.' });
    }

    if (!validTokens.includes(token)) {
        console.warn(`[${new Date().toISOString()}] Security alert: invalid token provided. IP: ${req.ip}`);
        return res.status(403).json({ error: 'Shield active: your token is not recognized as a Sanctuary Guardian.' });
    }

    next();
};

const readSetting = (key) => new Promise((resolve, reject) => {
    db.get("SELECT value FROM settings WHERE key = ?", [key], (err, row) => {
        if (err) return reject(err);
        resolve(row?.value);
    });
});

const requireGuestPortalEnabled = async (req, res, next) => {
    try {
        const value = await readSetting('is_portal_enabled');
        const enabled = value === undefined || value === null || value === 'true' || value === true;
        if (!enabled) {
            return res.status(503).json({
                error: 'Guest booking portal is temporarily offline. Please contact Amalfi Resort directly for assistance.'
            });
        }
        next();
    } catch (err) {
        console.error('Failed to read portal setting:', err);
        return res.status(500).json({ error: 'Portal status could not be verified.' });
    }
};

app.get('/api/v1/public/portal-status', async (req, res) => {
    try {
        const value = await readSetting('is_portal_enabled');
        const enabled = value === undefined || value === null || value === 'true' || value === true;
        res.json({
            enabled,
            contact_phone: loadKnowledgeBaseJson()?.contact_phone || null,
        });
    } catch (err) {
        console.error('Failed to read portal status:', err);
        return res.status(500).json({ error: 'Portal status could not be verified.' });
    }
});

// Internal shield: apply auth to sensitive routes
app.use('/api/v1/admin', authenticateAdmin);

// Sanctuary security: multi-origin CORS
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://192.168.1.103',
        'http://192.168.1.103:8080',
        'https://amalfi-resort-zambales.online',
        'https://www.amalfi-resort-zambales.online',
        'https://amalfi-admin.online',
        'https://www.amalfi-admin.online',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    if (req.method !== 'GET') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        if (req.body && Object.keys(req.body).length > 0) {
            const safeBody = { ...req.body };
            if (safeBody.file) safeBody.file = "[FILE]";
            console.log(`  Body:`, JSON.stringify(safeBody, null, 2));
        }
    }
    next();
});

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Setup Professional Cloud Storage Engine
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'amalfi-receipts',
        allowed_formats: ['jpg', 'png', 'pdf'],
        public_id: (req, file) => {
            const bookingRef = req.body.booking_ref || 'unknown';
            return `${bookingRef}-${Date.now()}`;
        },
        transformation: [{ width: 1200, crop: "limit", quality: "auto" }]
    }
});

const upload = multer({ storage });

const RECEIPT_AI_MODEL = process.env.RECEIPT_AI_MODEL || 'gpt-4o-mini';
const RECEIPT_AI_REQUIRED = String(process.env.RECEIPT_AI_REQUIRED || 'false').toLowerCase() === 'true';
const RECEIPT_TOKEN_TTL_MS = 30 * 60 * 1000;
const RECEIPT_PRECHECKS = new Map();

function parseJsonObjectFromText(raw = '') {
    const clean = String(raw || '').trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    try {
        return JSON.parse(clean);
    } catch {
        const match = clean.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : {};
    }
}

function normalizeReceiptCheck(data = {}) {
    const classification = String(data.classification || data.type || 'unknown').toLowerCase();
    const paymentMethod = String(data.payment_method || data.paymentMethod || 'unknown').toLowerCase();
    const confidence = Math.max(0, Math.min(1, Number(data.confidence || 0)));
    const hasAmount = Boolean(data.has_amount ?? data.hasAmount);
    const hasReference = Boolean(data.has_reference ?? data.hasReference);
    const isPaymentReceipt = ['payment_receipt', 'gcash_receipt', 'bank_receipt', 'general_receipt'].includes(classification);
    const isRejectedReceipt = ['booking_acknowledgement', 'acknowledgement_receipt', 'not_receipt', 'non_receipt', 'unknown'].includes(classification);
    const verified = isPaymentReceipt && hasAmount && hasReference && confidence >= 0.65;
    return {
        classification,
        payment_method: paymentMethod,
        confidence,
        has_amount: hasAmount,
        has_reference: hasReference,
        amount: data.amount ?? null,
        reference_number: data.reference_number || data.referenceNumber || null,
        reason: String(data.reason || '').slice(0, 240),
        verified,
        rejected: isRejectedReceipt || !verified
    };
}

function parseReceiptMoney(value) {
    const raw = String(value ?? '').replace(/[^\d.]/g, '');
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function enforceExpectedReceiptAmount(check = {}, expectedAmount = null) {
    const expected = parseReceiptMoney(expectedAmount);
    if (!expected || expected <= 0) return check;
    const detected = parseReceiptMoney(check.amount);
    if (detected === null) {
        return {
            ...check,
            verified: false,
            rejected: true,
            amount_mismatch: true,
            expected_amount: expected,
            reason: check.reason || 'Receipt amount could not be read.'
        };
    }
    const tolerance = Math.max(1, expected * 0.005);
    const matches = Math.abs(detected - expected) <= tolerance;
    return {
        ...check,
        amount: detected,
        expected_amount: expected,
        amount_mismatch: !matches,
        verified: Boolean(check.verified && matches),
        rejected: Boolean(check.rejected || !matches),
        reason: matches
            ? check.reason
            : `Receipt amount PHP ${detected.toLocaleString('en-PH')} does not match expected payment PHP ${expected.toLocaleString('en-PH')}.`
    };
}

function buildReceiptUploadError(check = {}) {
    if (check.classification === 'booking_acknowledgement' || check.classification === 'acknowledgement_receipt') {
        return 'That looks like a Amalfi booking acknowledgement, not a GCash/bank payment receipt. Please upload the actual payment screenshot with amount and reference number.';
    }
    if (check.amount_mismatch) {
        return check.reason || 'The receipt amount does not match the required payment amount. Please upload the correct payment receipt to proceed with the booking.';
    }
    if (!check.has_amount || !check.has_reference) {
        return 'Please upload a clear payment receipt screenshot showing the paid amount and transaction/reference number.';
    }
    return 'Please upload a verified GCash, bank transfer, or payment receipt screenshot before submitting the booking.';
}

async function classifyReceiptImageWithAI(imageUrl, { expectedAmount = null } = {}) {
    if (!process.env.OPENAI_API_KEY) {
        return {
            classification: 'ai_unavailable',
            confidence: 0,
            has_amount: false,
            has_reference: false,
            verified: !RECEIPT_AI_REQUIRED,
            rejected: RECEIPT_AI_REQUIRED,
            reason: 'OPENAI_API_KEY is not configured; skipped first-layer receipt AI.'
        };
    }

    const prompt = [
        'Classify this uploaded booking image for Amalfi Resort payment verification.',
        'Return JSON only with keys: classification, payment_method, has_amount, amount, has_reference, reference_number, confidence, reason.',
        'classification must be one of: payment_receipt, booking_acknowledgement, not_receipt, unknown.',
        'Use payment_receipt only for real GCash, bank transfer, e-wallet, or general payment receipts/proof of transfer.',
        'Use booking_acknowledgement if it is a Amalfi booking acknowledgement/slip and not actual payment proof.',
        'A payment receipt must show both amount and transaction/reference number to pass.',
        expectedAmount ? `Expected paid amount from portal: PHP ${expectedAmount}. If visible amount is very different, lower confidence and explain.` : ''
    ].filter(Boolean).join('\n');

    try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: RECEIPT_AI_MODEL,
                response_format: { type: 'json_object' },
                temperature: 0.1,
                max_tokens: 280,
                messages: [
                    { role: 'system', content: 'You are a strict receipt verification classifier. Do not approve acknowledgements, resort slips, selfies, random photos, or screenshots without amount/reference.' },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ]
            })
        });
        if (!resp.ok) {
            const body = await resp.text();
            console.error(`Receipt AI failed ${resp.status}: ${body.slice(0, 240)}`);
            return enforceExpectedReceiptAmount(
                normalizeReceiptCheck({ classification: 'unknown', confidence: 0, reason: 'Receipt AI request failed.' }),
                expectedAmount
            );
        }
        const payload = await resp.json();
        const raw = payload?.choices?.[0]?.message?.content || '{}';
        return enforceExpectedReceiptAmount(normalizeReceiptCheck(parseJsonObjectFromText(raw)), expectedAmount);
    } catch (err) {
        console.error('Receipt AI classification error:', err);
        return enforceExpectedReceiptAmount(
            normalizeReceiptCheck({ classification: 'unknown', confidence: 0, reason: 'Receipt AI classification failed.' }),
            expectedAmount
        );
    }
}

function rememberReceiptPrecheck({ cloudUrl, receiptCheck, amount, transactionType, paymentMethod }) {
    const token = randomUUID();
    const now = Date.now();
    RECEIPT_PRECHECKS.set(token, {
        cloudUrl,
        receiptCheck,
        amount,
        transactionType,
        paymentMethod,
        createdAt: now
    });
    for (const [key, value] of RECEIPT_PRECHECKS.entries()) {
        if (now - Number(value.createdAt || 0) > RECEIPT_TOKEN_TTL_MS) {
            RECEIPT_PRECHECKS.delete(key);
        }
    }
    return token;
}

function consumeReceiptPrecheck(token) {
    const key = String(token || '').trim();
    if (!key || !RECEIPT_PRECHECKS.has(key)) return null;
    const value = RECEIPT_PRECHECKS.get(key);
    RECEIPT_PRECHECKS.delete(key);
    if (Date.now() - Number(value.createdAt || 0) > RECEIPT_TOKEN_TTL_MS) return null;
    return value;
}

function getExpectedGuestPaymentAmount(totalPrice, balance) {
    const total = parseReceiptMoney(totalPrice);
    const remaining = parseReceiptMoney(balance);
    if (!total || total <= 0 || remaining === null || remaining < 0 || remaining > total) return null;
    const paid = total - remaining;
    const minimum = total * 0.5;
    if (paid < minimum) return null;
    return paid;
}

function consumeGuestBookingReceiptPrecheck({ receiptToken, expectedAmount }) {
    const expected = parseReceiptMoney(expectedAmount);
    if (!receiptToken) {
        throw new Error('Payment proof is required before a guest booking can hold inventory.');
    }
    const precheck = consumeReceiptPrecheck(receiptToken);
    if (!precheck?.receiptCheck?.verified || precheck.receiptCheck.rejected) {
        throw new Error('Receipt precheck expired or was not verified. Please upload payment proof again.');
    }
    const tokenAmount = parseReceiptMoney(precheck.amount);
    if (!expected || !tokenAmount || Math.abs(tokenAmount - expected) > Math.max(1, expected * 0.005)) {
        throw new Error('Receipt precheck amount does not match the required downpayment.');
    }
    return precheck;
}

async function recordLegacyGuestReceiptPrecheck({ bookingRef, precheck, transactionType = 'deposit', paymentMethod = 'GCASH' }) {
    await dbRunAsync(
        `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, receipt_path, notes)
         VALUES (?, ?, ?, 'PENDING_VERIFICATION', ?, ?, ?)`,
        [
            bookingRef,
            precheck.amount,
            precheck.transactionType || transactionType,
            precheck.paymentMethod || paymentMethod,
            precheck.cloudUrl,
            `Guest portal receipt precheck | AI first-layer: ${precheck.receiptCheck.classification} (${Math.round(Number(precheck.receiptCheck.confidence || 0) * 100)}%)`
        ]
    );
}

async function recordHeaderGuestReceiptPrecheck({ bookingRef, precheck, transactionType = 'deposit', paymentMethod = 'GCASH' }) {
    await recordPayment({
        booking_reference: bookingRef,
        amount: precheck.amount,
        payment_type: (precheck.transactionType || transactionType) === 'full payment' ? 'Full Payment' : 'deposit',
        payment_method: precheck.paymentMethod || paymentMethod,
        receipt_url: precheck.cloudUrl,
        verification_status: 'PENDING_VERIFICATION',
        notes: `Guest portal receipt precheck | AI first-layer: ${precheck.receiptCheck.classification} (${Math.round(Number(precheck.receiptCheck.confidence || 0) * 100)}%)`
    });
}

// Setup environment before initializing DB
if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_PATH) {
    process.env.DATABASE_PATH = path.resolve('tests/test_database.sqlite');
}

const runtimeRoot = process.env.RUNTIME_PATH || (fs.existsSync('/runtime') ? '/runtime' : path.join(__dirname, '..', 'amalfi-system', 'runtime'));

// Initialize SQLite DB
const dbFile = process.env.DATABASE_PATH || path.join(runtimeRoot, 'hub', 'database.sqlite');
if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_PATH) {
    process.env.DATABASE_PATH = path.resolve('tests/test_database.sqlite');
}

const centralKbPath = path.join(intelligenceRoot, 'generated', 'knowledge-base.json');

const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error("Database initialization failed:", err);
    else {
        db.serialize(() => {
            // Operational hardening: enable WAL mode and high-performance pragma
            // Fixes SQLITE_IOERR on HDDs and Docker Bind Mounts
            db.run("PRAGMA journal_mode=WAL;");
            db.run("PRAGMA synchronous=NORMAL;");
            db.run("PRAGMA busy_timeout=5000;");

            db.run(`CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                room_type TEXT,
                price REAL,
                total_units INTEGER,
                marketing_name TEXT,
                description TEXT,
                features TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS units (
                unit_id TEXT PRIMARY KEY,
                room_type_id TEXT,
                unit_label TEXT,
                area TEXT DEFAULT 'Sanctuary',
                max_pax INTEGER DEFAULT 2,
                has_ac BOOLEAN DEFAULT 1,
                nightly_rate REAL DEFAULT 0,
                unit_status TEXT DEFAULT 'Available',
                condition TEXT DEFAULT 'clean',
                is_available BOOLEAN DEFAULT 1,
                FOREIGN KEY(room_type_id) REFERENCES rooms(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS unit_date_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                unit_id TEXT NOT NULL,
                tag_type TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                note TEXT,
                blocks_inventory INTEGER DEFAULT 0,
                created_by TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(unit_id) REFERENCES units(unit_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            // Seed default settings for operational kill switches
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_bot_enabled', 'true')`);
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_portal_enabled', 'true')`);
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_admin_desk_enabled', 'true')`);
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_holiday_minimum_stay_enabled', 'true')`);

            db.run(`CREATE TABLE IF NOT EXISTS bookings (
                booking_ref TEXT PRIMARY KEY,
                room_type TEXT,
                check_in TEXT,
                check_out TEXT,
                guests INTEGER,
                full_name TEXT,
                email TEXT,
                phone TEXT,
                total_price REAL,
                balance REAL DEFAULT 0,
                status TEXT DEFAULT 'PENDING_VERIFICATION',
                payment_status TEXT DEFAULT 'PAYMENT_REVIEW',
                booking_source TEXT DEFAULT 'Facebook Direct',
                booking_mode TEXT DEFAULT 'STANDARD',
                created_by TEXT DEFAULT 'guest',
                is_daytour_booking BOOLEAN DEFAULT 0,
                booking_type TEXT DEFAULT 'overnight',
                is_deleted BOOLEAN DEFAULT 0,
                import_source TEXT,
                import_batch_id TEXT,
                import_locked BOOLEAN DEFAULT 0,
                notes TEXT,
                addon_amount REAL DEFAULT 0,
                special_requests TEXT,
                group_code TEXT,
                group_name TEXT,
                group_master_ref TEXT,
                group_sequence INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                unit_id TEXT,
                FOREIGN KEY(unit_id) REFERENCES units(unit_id)
            )`);

            // ðŸ› ï¸ Migration Bridge: Ensure new columns exist in existing databases
            const migrations = [
                { table: 'rooms', column: 'description', type: 'TEXT' },
                { table: 'rooms', column: 'features', type: 'TEXT' },
                { table: 'units', column: 'area', type: "TEXT DEFAULT 'Sanctuary'" },
                { table: 'units', column: 'max_pax', type: 'INTEGER DEFAULT 2' },
                { table: 'units', column: 'has_ac', type: 'BOOLEAN DEFAULT 1' },
                { table: 'units', column: 'nightly_rate', type: 'REAL DEFAULT 0' },
                { table: 'units', column: 'unit_status', type: "TEXT DEFAULT 'Available'" },
                { table: 'bookings', column: 'amount_paid', type: 'REAL DEFAULT 0' },
                { table: 'bookings', column: 'payment_status', type: "TEXT DEFAULT 'PAYMENT_REVIEW'" },
                { table: 'bookings', column: 'booking_mode', type: "TEXT DEFAULT 'STANDARD'" },
                { table: 'bookings', column: 'booking_source', type: "TEXT DEFAULT 'Facebook Direct'" },
                { table: 'bookings', column: 'is_daytour_booking', type: 'BOOLEAN DEFAULT 0' },
                { table: 'bookings', column: 'unit_id', type: 'TEXT' },
                { table: 'bookings', column: 'booking_type', type: "TEXT DEFAULT 'overnight'" },
                { table: 'bookings', column: 'created_by',   type: "TEXT DEFAULT 'guest'" },
                { table: 'bookings', column: 'is_deleted',   type: 'BOOLEAN DEFAULT 0' },
                { table: 'bookings', column: 'import_source', type: 'TEXT' },
                { table: 'bookings', column: 'import_batch_id', type: 'TEXT' },
                { table: 'bookings', column: 'import_locked', type: 'BOOLEAN DEFAULT 0' },
                { table: 'bookings', column: 'notes',        type: 'TEXT' },
                { table: 'bookings', column: 'addon_amount',      type: 'REAL DEFAULT 0' },
                { table: 'bookings', column: 'special_requests', type: 'TEXT' },
                { table: 'bookings', column: 'group_code', type: 'TEXT' },
                { table: 'bookings', column: 'group_name', type: 'TEXT' },
                { table: 'bookings', column: 'group_master_ref', type: 'TEXT' },
                { table: 'bookings', column: 'group_sequence', type: 'INTEGER' },
                { table: 'booking_headers', column: 'addon_amount', type: 'REAL DEFAULT 0' },
                { table: 'transactions', column: 'notes',        type: 'TEXT' },
                { table: 'audit_logs',   column: 'ip_address',   type: 'TEXT' },
            ];

            migrations.forEach(m => {
                db.run(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`, (err) => {
                    // Ignore errors if column already exists
                });
            });
            db.run(`UPDATE bookings SET status = ? WHERE status = ?`, [BOOKING_STATUS_PENDING_VERIFICATION, LEGACY_AWAITING_PAYMENT_STATUS]);
            
            db.run(`CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_ref TEXT,
                amount REAL,
                transaction_type TEXT,
                payment_method TEXT,
                status TEXT DEFAULT 'PENDING_VERIFICATION',
                receipt_path TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(booking_ref) REFERENCES bookings(booking_ref)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS booking_headers (
                booking_reference TEXT PRIMARY KEY,
                guest_name TEXT,
                email TEXT,
                phone TEXT,
                check_in TEXT,
                check_out TEXT,
                lodging_total REAL DEFAULT 0,
                addon_amount REAL DEFAULT 0,
                verified_paid_total REAL DEFAULT 0,
                balance_due REAL DEFAULT 0,
                status TEXT DEFAULT 'PENDING_VERIFICATION',
                payment_status TEXT DEFAULT 'PAYMENT_REVIEW',
                booking_source TEXT DEFAULT 'Direct',
                booking_mode TEXT DEFAULT 'STANDARD',
                notes TEXT,
                special_requests TEXT,
                created_by TEXT DEFAULT 'guest',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS booking_items (
                booking_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_reference TEXT NOT NULL,
                unit_id TEXT,
                room_type TEXT NOT NULL,
                check_in TEXT NOT NULL,
                check_out TEXT NOT NULL,
                guest_count INTEGER DEFAULT 1,
                lodging_subtotal REAL DEFAULT 0,
                status TEXT DEFAULT 'PENDING_VERIFICATION',
                sequence_no INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(booking_reference) REFERENCES booking_headers(booking_reference),
                FOREIGN KEY(unit_id) REFERENCES units(unit_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS payments (
                payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_reference TEXT NOT NULL,
                amount REAL NOT NULL,
                payment_type TEXT DEFAULT 'payment',
                payment_method TEXT,
                receipt_url TEXT,
                reference_no TEXT,
                verification_status TEXT DEFAULT 'PENDING_VERIFICATION',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(booking_reference) REFERENCES booking_headers(booking_reference)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS booking_header_addons (
                addon_id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_reference TEXT NOT NULL,
                item_name TEXT NOT NULL,
                amount REAL NOT NULL,
                notes TEXT,
                created_by TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(booking_reference) REFERENCES booking_headers(booking_reference)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS rebookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_ref TEXT,
                old_check_in TEXT,
                old_check_out TEXT,
                new_check_in TEXT,
                new_check_out TEXT,
                reason TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(booking_ref) REFERENCES bookings(booking_ref)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS approvals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER,
                verdict TEXT,
                admin_notes TEXT,
                processed_by TEXT DEFAULT 'admin',
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(transaction_id) REFERENCES transactions(id)
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT,
                entity_type TEXT,
                entity_id TEXT,
                actor TEXT DEFAULT 'system',
                details TEXT,
                ip_address TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT,
                price REAL DEFAULT 0,
                stock INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_pos_sales (
                id TEXT PRIMARY KEY,
                date TEXT,
                guest TEXT,
                villa TEXT,
                res_id TEXT,
                checkout_type TEXT DEFAULT 'direct',
                payment_method TEXT,
                total REAL DEFAULT 0,
                items_json TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_expenses (
                id TEXT PRIMARY KEY,
                date TEXT,
                vendor TEXT,
                description TEXT,
                department TEXT,
                subcategory TEXT,
                category TEXT,
                amount REAL DEFAULT 0,
                payment_method TEXT,
                recurrence TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_staff (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                position TEXT,
                department TEXT,
                basic_salary REAL DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_payroll_runs (
                id TEXT PRIMARY KEY,
                payroll_month TEXT,
                run_date TEXT,
                gross_pay REAL DEFAULT 0,
                deductions REAL DEFAULT 0,
                net_pay REAL DEFAULT 0,
                staff_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft',
                details_json TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_service_requests (
                id TEXT PRIMARY KEY,
                reservation_id TEXT,
                guest TEXT,
                villa TEXT,
                category TEXT,
                title TEXT,
                details TEXT,
                status TEXT DEFAULT 'Pending',
                priority TEXT DEFAULT 'Normal',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_special_bookings (
                id TEXT PRIMARY KEY,
                guest TEXT,
                amenity TEXT,
                details TEXT,
                date TEXT,
                folio REAL DEFAULT 0,
                status TEXT DEFAULT 'Pending verification',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS amalfi_villa_statuses (
                villa_id TEXT PRIMARY KEY,
                status TEXT DEFAULT 'AVAILABLE',
                note TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            console.log("Amalfi Master Hub: Advanced Dynamic Schema Initialized.");
            
            // Skip knowledge-base sync in test mode to protect mock data
            if (process.env.NODE_ENV !== 'test') {
                syncKnowledgeBase();
                normalizeLegacyBookingStatuses();
                warnOnKnowledgeBaseDrift();
            } else {
                console.log("Test mode: skipping knowledge-base sync.");
            }
        });
    }
});

// Google Sheets sync has been retired - Amalfi runs its own SQLite tables.

function logAction(action, entity_type, entity_id, details, actor = 'system', ip = '0.0.0.0') {
    // Live Pulse: Emit to console for real-time pm2 logs monitoring
    console.log(`[AUDIT] ${action.toUpperCase()} | ${entity_type}: ${entity_id} | Actor: ${actor} | Details: ${details}`);

    db.run(`INSERT INTO audit_logs (action, entity_type, entity_id, details, actor, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
        [action, entity_type, entity_id, details, actor, ip], (err) => {
            if (err) {
                console.warn(`[${new Date().toISOString()}] Audit log skipped:`, err.message);
            }
        });
}

function startOfDay(dateLike = new Date()) {
    if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
        const [year, month, day] = dateLike.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    const d = new Date(dateLike);
    d.setHours(0, 0, 0, 0);
    return d;
}

function manilaDateKey(dateLike = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(dateLike));
}

function daysUntilArrival(checkIn) {
    if (!checkIn) return Number.NaN;
    const arrival = startOfDay(checkIn);
    const today = startOfDay(new Date());
    return Math.round((arrival - today) / 86400000);
}

function isRebookingEligible(checkIn) {
    return Number.isFinite(daysUntilArrival(checkIn)) && daysUntilArrival(checkIn) >= 7;
}

function isBookingRebookableStatus(status) {
    return REBOOKABLE_BOOKING_STATUSES.includes(String(status || '').toUpperCase());
}

function parseDateOnly(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
    return new Date(`${dateStr}T00:00:00Z`);
}

function formatDateOnly(date) {
    return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function calculateWesternEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function getLastWeekdayOfMonth(year, month, weekday) {
    const lastDay = new Date(Date.UTC(year, month, 0));
    while (lastDay.getUTCDay() !== weekday) {
        lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    }
    return lastDay;
}

function resolveHolidayDate(definition, year) {
    if (!definition || !definition.type) return null;

    if (definition.type === 'fixed') {
        return new Date(Date.UTC(year, Number(definition.month) - 1, Number(definition.day)));
    }

    if (definition.type === 'easter_offset') {
        return addUtcDays(calculateWesternEasterSunday(year), Number(definition.days_from_easter || 0));
    }

    if (definition.type === 'last_weekday_of_month') {
        return getLastWeekdayOfMonth(year, Number(definition.month), Number(definition.weekday));
    }

    return null;
}

function getBookingLengthDays(checkIn, checkOut, bookingType = 'overnight') {
    if (bookingType === 'day_tour') return 1;
    const ci = parseDateOnly(checkIn);
    const co = parseDateOnly(checkOut);
    if (!ci || !co) return 0;
    return Math.max(0, Math.round((co - ci) / 86400000));
}

function getHolidayMinimumStayViolation({ checkIn, checkOut, bookingType = 'overnight', kb }) {
    const rule = kb?.booking_rules?.holiday_minimum_stay;
    if (!rule?.enabled) return null;

    const appliesTo = Array.isArray(rule.applies_to) ? rule.applies_to : [];
    if (appliesTo.length && !appliesTo.includes(bookingType)) return null;

    const minimumNights = Number(rule.minimum_nights || 2);
    const bookingLengthDays = getBookingLengthDays(checkIn, checkOut, bookingType);
    if (bookingLengthDays >= minimumNights) return null;

    const ci = parseDateOnly(checkIn);
    const co = parseDateOnly(checkOut);
    if (!ci || !co) return null;

    const years = new Set([ci.getUTCFullYear(), co.getUTCFullYear()]);
    const holidayMatches = [];

    for (const year of years) {
        for (const holiday of rule.holidays || []) {
            const holidayDate = resolveHolidayDate(holiday, year);
            if (!holidayDate) continue;

            const overlaps = bookingType === 'day_tour'
                ? formatDateOnly(holidayDate) === checkIn
                : holidayDate >= ci && holidayDate < co;

            if (overlaps) {
                holidayMatches.push({
                    name: holiday.name,
                    date: formatDateOnly(holidayDate),
                });
            }
        }
    }

    if (!holidayMatches.length) return null;

    return {
        minimumNights,
        bookingLengthDays,
        holidays: holidayMatches,
    };
}

function buildHolidayMinimumStayMessage(violation) {
    const names = violation.holidays.map((holiday) => `${holiday.name} (${holiday.date})`).join(', ');
    return `Bookings that fall on the following holiday dates require at least ${violation.minimumNights} days: ${names}. Selected stay is only ${violation.bookingLengthDays} day${violation.bookingLengthDays === 1 ? '' : 's'}.`;
}

async function isHolidayMinimumStayEnabled() {
    const value = await readSetting('is_holiday_minimum_stay_enabled');
    return value === undefined || value === null || value === 'true' || value === true;
}

async function shouldEnforceHolidayMinimumStay(kb) {
    if (!kb?.booking_rules?.holiday_minimum_stay?.enabled) return false;
    return isHolidayMinimumStayEnabled();
}

async function loadEffectivePublicKnowledgeBaseJson() {
    const kb = loadKnowledgeBaseJson() || {};
    if (kb.booking_rules?.holiday_minimum_stay) {
        kb.booking_rules = { ...kb.booking_rules };
        kb.booking_rules.holiday_minimum_stay = {
            ...kb.booking_rules.holiday_minimum_stay,
            enabled: await shouldEnforceHolidayMinimumStay(kb),
        };
    }
    return kb;
}

function loadKnowledgeBaseJson() {
    const candidates = [centralKbPath];

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;

        try {
            return JSON.parse(fs.readFileSync(candidate, 'utf8'));
        } catch (error) {
            console.warn(`Failed to parse knowledge base at ${candidate}:`, error.message);
        }
    }

    throw new Error('No readable central intelligence JSON file was found.');
}

function normalizeRoomKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function enrichUnitsWithKnowledgeBase(units, kb) {
    return (units || []).map((unit) => {
        const meta = kb.accommodations?.find(
            (accommodation) => normalizeRoomKey(accommodation.name) === normalizeRoomKey(unit.room_type_id)
        ) || {};
        const capacity = deriveCapacityMeta({ ...unit, ...meta });

        return {
            ...unit,
            ...meta,
            standard_max_pax: capacity.base_max_pax,
            absolute_max_pax: capacity.absolute_max_pax,
            extra_pax_allowed: capacity.extra_pax_allowed,
            extra_pax_rate: capacity.extra_pax_rate
        };
    });
}

function findAccommodationMeta(kb, { roomTypeId, roomTypeLabel } = {}) {
    return kb.accommodations?.find((accommodation) => {
        const normalizedName = normalizeRoomKey(accommodation.name);
        return normalizedName === normalizeRoomKey(roomTypeId)
            || normalizedName === normalizeRoomKey(roomTypeLabel);
    }) || null;
}

function deriveCapacityMeta(unit = {}) {
    const rates = Array.isArray(unit.rates) ? unit.rates : [];
    const ratesBaseMax = rates.length
        ? Math.max(...rates.map((rate) => Number(rate.max_pax || 0)))
        : 0;
    const baseMaxPax = ratesBaseMax || Number(unit.max_capacity_pax || 2);
    const absoluteMaxPax = unit.extra_pax?.allowed
        ? Number(unit.extra_pax.max_capacity_pax || baseMaxPax)
        : Number(unit.max_capacity_pax || baseMaxPax);

    return {
        base_max_pax: baseMaxPax,
        absolute_max_pax: absoluteMaxPax,
        extra_pax_allowed: Boolean(unit.extra_pax?.allowed),
        extra_pax_rate: Number(unit.extra_pax?.price_per_head_php || 0)
    };
}

function getAccommodationCapacity(kb, { roomType, roomTypeId, unitId } = {}) {
    const meta = findAccommodationMeta(kb, {
        roomTypeId: roomTypeId || unitId || roomType,
        roomTypeLabel: roomType || roomTypeId || unitId
    });

    if (!meta) return null;

    const capacity = deriveCapacityMeta(meta);
    return {
        room_type: meta.name,
        room_type_id: normalizeRoomKey(meta.name),
        standard_max_pax: capacity.base_max_pax,
        absolute_max_pax: capacity.absolute_max_pax,
        extra_pax_allowed: capacity.extra_pax_allowed,
        extra_pax_rate: capacity.extra_pax_rate
    };
}

function validateBookingHeaderItemCapacity(items = [], kb = loadKnowledgeBaseJson()) {
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const guests = Number(item.guest_count ?? item.guestCount ?? item.guests ?? 1);
        const roomType = item.room_type || item.roomType;
        const unitId = item.unit_id || item.unitId;
        const capacity = getAccommodationCapacity(kb, { roomType, unitId });
        const effectiveMax = Number(capacity?.absolute_max_pax || 0);

        if (!Number.isFinite(guests) || guests <= 0) {
            return { ok: false, error: `Item ${index + 1} requires a valid guest count.` };
        }

        if (effectiveMax > 0 && guests > effectiveMax) {
            return {
                ok: false,
                error: `Capacity Exceeded: ${unitId || roomType || `Item ${index + 1}`} only allows ${effectiveMax} guests.`
            };
        }
    }

    return { ok: true };
}

function calculateNightlyRateForGuests(unit = {}, assignedGuests = 0) {
    const rates = Array.isArray(unit.rates) ? unit.rates : [];
    const { base_max_pax: baseMaxPax, extra_pax_allowed: extraAllowed, extra_pax_rate: extraRate } = deriveCapacityMeta(unit);

    if (!rates.length) {
        const fallbackRate = Number(unit.nightly_rate || unit.price || 0);
        const extraGuests = Math.max(0, Number(assignedGuests || 0) - baseMaxPax);
        return {
            nightly_base_rate: fallbackRate,
            nightly_extra_pax_amount: extraAllowed ? extraGuests * extraRate : 0
        };
    }

    const sortedRates = [...rates].sort((left, right) => Number(right.max_pax || 0) - Number(left.max_pax || 0));
    const getRateForPax = (pax) => {
        const matched = rates.find((rate) => pax >= Number(rate.min_pax || 0) && pax <= Number(rate.max_pax || 0));
        if (matched) return Number(matched.price_php || 0);
        const ascending = [...rates].sort((left, right) => Number(left.min_pax || 0) - Number(right.min_pax || 0));
        if (pax < Number(ascending[0]?.min_pax || 0)) return Number(ascending[0]?.price_php || 0);
        return Number(sortedRates[0]?.price_php || 0);
    };

    if (assignedGuests <= baseMaxPax) {
        return {
            nightly_base_rate: getRateForPax(Math.max(assignedGuests, Number(rates[0]?.min_pax || 1))),
            nightly_extra_pax_amount: 0
        };
    }

    return {
        nightly_base_rate: Number(sortedRates[0]?.price_php || 0),
        nightly_extra_pax_amount: extraAllowed ? (assignedGuests - baseMaxPax) * extraRate : 0
    };
}

function quoteDeskSelection(units = [], guests = 0, nights = 1, options = {}) {
    const normalizedGuests = Number(guests || 0);
    const normalizedNights = Math.max(1, Number(nights || 1));
    const preserveAllUnits = options?.preserveAllUnits === true;

    if (!Array.isArray(units) || units.length === 0) {
        throw new Error('At least one unit is required for a quote.');
    }
    if (!Number.isFinite(normalizedGuests) || normalizedGuests <= 0) {
        throw new Error('Guest count must be greater than zero.');
    }

    const enrichedUnits = units.map((unit) => ({ ...unit, ...deriveCapacityMeta(unit) }));
    const totalAbsoluteCapacity = enrichedUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0);
    const totalStandardCapacity = enrichedUnits.reduce((sum, unit) => sum + Number(unit.base_max_pax || 0), 0);

    if (normalizedGuests > totalAbsoluteCapacity) {
        throw new Error(`Selected units can only accommodate ${totalAbsoluteCapacity} guest(s) for this stay.`);
    }

    const sortedUnits = [...enrichedUnits].sort((left, right) => {
        if (Number(right.base_max_pax || 0) !== Number(left.base_max_pax || 0)) {
            return Number(right.base_max_pax || 0) - Number(left.base_max_pax || 0);
        }
        if (Number(right.absolute_max_pax || 0) !== Number(left.absolute_max_pax || 0)) {
            return Number(right.absolute_max_pax || 0) - Number(left.absolute_max_pax || 0);
        }
        return Number(left.nightly_rate || left.price || 0) - Number(right.nightly_rate || right.price || 0);
    });

    const assignedGuestsByUnit = new Map(sortedUnits.map((unit) => [unit.unit_id, 0]));
    let remainingGuests = normalizedGuests;

    if (preserveAllUnits) {
        if (normalizedGuests < sortedUnits.length) {
            throw new Error(`Selected units require at least ${sortedUnits.length} guest(s).`);
        }

        for (const unit of sortedUnits) {
            assignedGuestsByUnit.set(unit.unit_id, 1);
            remainingGuests -= 1;
        }

        while (remainingGuests > 0) {
            let changed = false;
            for (const unit of sortedUnits) {
                if (remainingGuests <= 0) break;
                const currentAssigned = Number(assignedGuestsByUnit.get(unit.unit_id) || 0);
                if (currentAssigned >= Number(unit.base_max_pax || 0)) continue;
                assignedGuestsByUnit.set(unit.unit_id, currentAssigned + 1);
                remainingGuests -= 1;
                changed = true;
            }
            if (!changed) break;
        }

        while (remainingGuests > 0) {
            let changed = false;
            for (const unit of sortedUnits) {
                if (remainingGuests <= 0) break;
                const currentAssigned = Number(assignedGuestsByUnit.get(unit.unit_id) || 0);
                if (currentAssigned >= Number(unit.absolute_max_pax || 0)) continue;
                assignedGuestsByUnit.set(unit.unit_id, currentAssigned + 1);
                remainingGuests -= 1;
                changed = true;
            }
            if (!changed) break;
        }
    } else {
        for (const unit of sortedUnits) {
            if (remainingGuests <= 0) break;
            const assigned = Math.min(Number(unit.base_max_pax || 0), remainingGuests);
            assignedGuestsByUnit.set(unit.unit_id, assigned);
            remainingGuests -= assigned;
        }

        for (const unit of sortedUnits) {
            if (remainingGuests <= 0) break;
            const currentAssigned = Number(assignedGuestsByUnit.get(unit.unit_id) || 0);
            const spilloverCapacity = Math.max(0, Number(unit.absolute_max_pax || 0) - currentAssigned);
            if (spilloverCapacity <= 0) continue;
            const assigned = Math.min(spilloverCapacity, remainingGuests);
            assignedGuestsByUnit.set(unit.unit_id, currentAssigned + assigned);
            remainingGuests -= assigned;
        }
    }

    if (remainingGuests > 0) {
        throw new Error(`Selected units are short by ${remainingGuests} guest slot(s).`);
    }

    const quotedUnits = units.map((unit) => {
        const capacity = deriveCapacityMeta(unit);
        const assignedGuests = Number(assignedGuestsByUnit.get(unit.unit_id) || 0);
        const extraGuests = Math.max(0, assignedGuests - capacity.base_max_pax);
        const nightly = calculateNightlyRateForGuests(unit, assignedGuests);
        const baseAmount = Number(nightly.nightly_base_rate || 0) * normalizedNights;
        const extraPaxAmount = Number(nightly.nightly_extra_pax_amount || 0) * normalizedNights;
        return {
            unit_id: unit.unit_id,
            unit_label: unit.unit_label || unit.unit_id,
            room_type: unit.room_type || unit.room_type_id || '',
            marketing_name: unit.marketing_name || unit.room_type || unit.room_type_id || '',
            assigned_guests: assignedGuests,
            included_guests: Math.min(assignedGuests, capacity.base_max_pax),
            extra_guests: extraGuests,
            standard_max_pax: capacity.base_max_pax,
            absolute_max_pax: capacity.absolute_max_pax,
            extra_pax_allowed: capacity.extra_pax_allowed,
            extra_pax_rate: capacity.extra_pax_rate,
            nights: normalizedNights,
            nightly_base_rate: Number(nightly.nightly_base_rate || 0),
            nightly_extra_pax_amount: Number(nightly.nightly_extra_pax_amount || 0),
            base_amount: baseAmount,
            extra_pax_amount: extraPaxAmount,
            total_amount: baseAmount + extraPaxAmount
        };
    }).filter((unit) => Number(unit.assigned_guests || 0) > 0);

    const totalAmount = quotedUnits.reduce((sum, unit) => sum + Number(unit.total_amount || 0), 0);
    const totalExtraGuests = quotedUnits.reduce((sum, unit) => sum + Number(unit.extra_guests || 0), 0);
    const totalExtraPaxAmount = quotedUnits.reduce((sum, unit) => sum + Number(unit.extra_pax_amount || 0), 0);

    return {
        guests: normalizedGuests,
        nights: normalizedNights,
        total_units: quotedUnits.length,
        total_standard_capacity: totalStandardCapacity,
        total_absolute_capacity: totalAbsoluteCapacity,
        total_extra_guests: totalExtraGuests,
        total_extra_pax_amount: totalExtraPaxAmount,
        total_amount: totalAmount,
        quoted_units: quotedUnits
    };
}

function buildDeskSuggestionSignature(suggestion = {}) {
    const roomShape = (suggestion.units || [])
        .map((unit) => canonicalizeRoomTypeLabel(unit.room_type || unit.marketing_name || unit.unit_label || unit.unit_id || ''))
        .sort()
        .join('|');

    return [
        suggestion.mode || '',
        Number(suggestion.summary?.total_units || 0),
        Number(suggestion.summary?.total_standard_capacity || 0),
        Number(suggestion.summary?.total_absolute_capacity || 0),
        Number(suggestion.summary?.total_extra_guests || 0),
        Number(suggestion.summary?.total_amount || 0),
        roomShape
    ].join('::');
}

function scoreDeskSuggestion({ quote, guests, unitCount }) {
    const requestedGuests = Number(guests || 0);
    const totalStandardCapacity = Number(quote?.total_standard_capacity || 0);
    const totalAbsoluteCapacity = Number(quote?.total_absolute_capacity || 0);
    const totalExtraGuests = Number(quote?.total_extra_guests || 0);
    const totalAmount = Number(quote?.total_amount || 0);
    const standardShortfall = Math.max(0, requestedGuests - totalStandardCapacity);
    const standardOversize = Math.max(0, totalStandardCapacity - requestedGuests);
    const absoluteWaste = Math.max(0, totalAbsoluteCapacity - requestedGuests);
    const singleUnitOversizePenalty = unitCount === 1 ? standardOversize : 0;

    return {
        standard_shortfall: standardShortfall,
        standard_oversize: standardOversize,
        extra_guests: totalExtraGuests,
        single_unit_oversize: singleUnitOversizePenalty,
        units: unitCount,
        amount: totalAmount,
        absolute_waste: absoluteWaste
    };
}

function compareDeskSuggestionScores(left, right) {
    if (left.standard_shortfall !== right.standard_shortfall) return left.standard_shortfall - right.standard_shortfall;
    if (left.standard_oversize !== right.standard_oversize) return left.standard_oversize - right.standard_oversize;
    if (left.extra_guests !== right.extra_guests) return left.extra_guests - right.extra_guests;
    if (left.single_unit_oversize !== right.single_unit_oversize) return left.single_unit_oversize - right.single_unit_oversize;
    if (left.units !== right.units) return left.units - right.units;
    if (left.amount !== right.amount) return left.amount - right.amount;
    return left.absolute_waste - right.absolute_waste;
}

function finalizeDeskSuggestions(results = [], maxSuggestions = 8) {
    const seen = new Set();
    return results
        .sort((left, right) => compareDeskSuggestionScores(left.score, right.score))
        .filter((suggestion) => {
            const signature = buildDeskSuggestionSignature(suggestion);
            if (seen.has(signature)) return false;
            seen.add(signature);
            return true;
        })
        .slice(0, maxSuggestions);
}

async function listDeskAvailability({ checkIn, checkOut, roomType = null, includeBlocked = false } = {}) {
    const kb = loadKnowledgeBaseJson();
    const allUnits = await dbAllAsync(`
        SELECT u.*, r.room_type, r.marketing_name, r.price as nightly_rate
        FROM units u
        JOIN rooms r ON r.id = u.room_type_id
        WHERE COALESCE(u.unit_status, 'Available') != 'Maintenance'
        ORDER BY u.unit_id ASC
    `);

    const legacyBlocked = await dbAllAsync(`
        SELECT booking_ref, unit_id, full_name, full_name as guest_name, check_in, check_out, status
        FROM bookings
        WHERE unit_id IS NOT NULL
          AND is_deleted = 0
          AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
          AND check_in < ? AND check_out > ?
    `, [checkOut, checkIn]);

    const transactionBlocked = await dbAllAsync(`
        SELECT
            h.booking_reference as booking_ref,
            bi.unit_id,
            h.guest_name as full_name,
            h.guest_name as guest_name,
            bi.check_in,
            bi.check_out,
            bi.status as status
        FROM booking_items bi
        JOIN booking_headers h ON h.booking_reference = bi.booking_reference
        WHERE bi.unit_id IS NOT NULL
          AND h.status IN (${quoteSqlStrings(ACTIVE_HEADER_STATUSES)})
          AND bi.status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
          AND bi.check_in < ? AND bi.check_out > ?
    `, [checkOut, checkIn]);

    const dateTagBlocked = await dbAllAsync(`
        SELECT
            unit_id,
            tag_type as status,
            start_date as check_in,
            end_date as check_out,
            note
        FROM unit_date_tags
        WHERE blocks_inventory = 1
          AND start_date < ? AND end_date > ?
    `, [checkOut, checkIn]);

    const blockedByUnit = new Map();
    [...legacyBlocked, ...transactionBlocked].forEach((booking) => {
        if (!booking.unit_id || blockedByUnit.has(booking.unit_id)) return;
        blockedByUnit.set(booking.unit_id, booking);
    });
    dateTagBlocked.forEach((tag) => {
        if (!tag.unit_id || blockedByUnit.has(tag.unit_id)) return;
        blockedByUnit.set(tag.unit_id, {
            booking_ref: `DATE-TAG-${tag.unit_id}`,
            unit_id: tag.unit_id,
            full_name: tag.note || tag.status,
            guest_name: tag.note || tag.status,
            check_in: tag.check_in,
            check_out: tag.check_out,
            status: tag.status || 'Blocked Date Tag'
        });
    });

    const normalizedRoomType = normalizeRoomKey(roomType);
    return allUnits
        .map((unit) => {
            const meta = findAccommodationMeta(kb, { roomTypeId: unit.room_type_id, roomTypeLabel: unit.room_type }) || {};
            const capacity = deriveCapacityMeta({ ...unit, ...meta });
            return {
                ...unit,
                ...meta,
                ...capacity,
                blocked_booking: blockedByUnit.get(unit.unit_id) || null
            };
        })
        .filter((unit) => !roomType || normalizeRoomKey(unit.room_type_id) === normalizedRoomType || normalizeRoomKey(unit.room_type) === normalizedRoomType)
        .filter((unit) => includeBlocked || !unit.blocked_booking);
}

function buildDeskSuggestions(availableUnits, guests, nights, { mode = 'combo', maxSuggestions = 8 } = {}) {
    const normalizedGuests = Number(guests || 0);
    const normalizedMode = mode === 'solo' ? 'solo' : 'combo';
    const results = [];

    if (normalizedMode === 'solo') {
        return finalizeDeskSuggestions(availableUnits
            .filter((unit) => normalizedGuests <= Number(unit.absolute_max_pax || 0))
            .map((unit) => {
                const quote = quoteDeskSelection([unit], normalizedGuests, nights);
                return {
                    mode: 'solo',
                    score: scoreDeskSuggestion({ quote, guests: normalizedGuests, unitCount: 1 }),
                    summary: {
                        total_units: 1,
                        total_standard_capacity: Number(quote.total_standard_capacity || 0),
                        total_absolute_capacity: Number(quote.total_absolute_capacity || 0),
                        total_extra_guests: quote.total_extra_guests,
                        total_amount: quote.total_amount
                    },
                    unit_ids: [unit.unit_id],
                    units: quote.quoted_units
                };
            }), maxSuggestions);
    }

    const sortedUnits = [...availableUnits].sort((left, right) => {
        if (Number(right.absolute_max_pax || 0) !== Number(left.absolute_max_pax || 0)) {
            return Number(right.absolute_max_pax || 0) - Number(left.absolute_max_pax || 0);
        }
        return Number(left.nightly_rate || left.price || 0) - Number(right.nightly_rate || right.price || 0);
    });

    const seenCombos = new Set();
    const maxComboSize = Math.min(sortedUnits.length, 6);
    let explored = 0;

    const backtrack = (startIndex, currentCombo = [], absoluteCapacity = 0) => {
        if (results.length >= maxSuggestions * 4 || explored >= 6000) return;
        explored += 1;

        if (currentCombo.length >= 2 && absoluteCapacity >= normalizedGuests) {
            const unitIds = currentCombo.map((unit) => unit.unit_id).sort().join('|');
            if (!seenCombos.has(unitIds)) {
                seenCombos.add(unitIds);
                const quote = quoteDeskSelection(currentCombo, normalizedGuests, nights);
                const effectiveUnits = quote.quoted_units || [];
                const totalAbsoluteCapacity = effectiveUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0);
                const totalStandardCapacity = effectiveUnits.reduce((sum, unit) => sum + Number(unit.standard_max_pax || 0), 0);
                results.push({
                    mode: 'combo',
                    score: scoreDeskSuggestion({ quote, guests: normalizedGuests, unitCount: effectiveUnits.length }),
                    summary: {
                        total_units: effectiveUnits.length,
                        total_standard_capacity: totalStandardCapacity,
                        total_absolute_capacity: totalAbsoluteCapacity,
                        total_extra_guests: quote.total_extra_guests,
                        total_amount: quote.total_amount
                    },
                    unit_ids: effectiveUnits.map((unit) => unit.unit_id),
                    units: effectiveUnits
                });
            }
            return;
        }

        if (currentCombo.length >= maxComboSize) return;

        for (let index = startIndex; index < sortedUnits.length; index += 1) {
            const nextUnit = sortedUnits[index];
            backtrack(index + 1, [...currentCombo, nextUnit], absoluteCapacity + Number(nextUnit.absolute_max_pax || 0));
            if (results.length >= maxSuggestions * 4 || explored >= 6000) break;
        }
    };

    backtrack(0, [], 0);

    return finalizeDeskSuggestions(results, maxSuggestions);
}

function serializeRebookingUnitSuggestion(unit = {}) {
    return {
        unit_id: unit.unit_id,
        unit_label: unit.unit_label || unit.unit_id,
        room_type: unit.room_type,
        room_type_id: unit.room_type_id,
        standard_max_pax: Number(unit.base_max_pax || unit.max_pax || 0),
        absolute_max_pax: Number(unit.absolute_max_pax || unit.max_pax || 0),
        is_available: !unit.blocked_booking
    };
}

async function analyzeRebookingTargetAvailability({ booking, newCheckIn, newCheckOut }) {
    const allUnits = await listDeskAvailability({
        checkIn: newCheckIn,
        checkOut: newCheckOut,
        roomType: booking.room_type,
        includeBlocked: true
    });
    const bookingRef = String(booking.booking_ref || '');
    const assignedUnitId = String(booking.unit_id || '');
    const isBlockedByAnotherBooking = (unit) => {
        const blocked = unit?.blocked_booking;
        return Boolean(blocked && String(blocked.booking_ref || '') !== bookingRef);
    };
    const assignedUnit = assignedUnitId
        ? allUnits.find((unit) => String(unit.unit_id) === assignedUnitId)
        : null;
    const conflict = assignedUnit && isBlockedByAnotherBooking(assignedUnit)
        ? assignedUnit.blocked_booking
        : null;
    const guests = Number(booking.guests || 1);
    const suggestedUnits = allUnits
        .filter((unit) => String(unit.unit_id) !== assignedUnitId)
        .filter((unit) => !isBlockedByAnotherBooking(unit))
        .filter((unit) => !Number.isFinite(guests) || guests <= Number(unit.absolute_max_pax || unit.max_pax || 0))
        .map(serializeRebookingUnitSuggestion);

    return {
        assignedUnit,
        conflict,
        suggestedUnits
    };
}

function quoteSqlStrings(values) {
    return values.map((value) => `'${value}'`).join(', ');
}

function canonicalizeRoomTypeLabel(value = '') {
    return String(value || '')
        .replace(/\s+#?\d+\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function computeStayNights(checkIn, checkOut) {
    const start = new Date(`${checkIn}T00:00:00`);
    const end = new Date(`${checkOut}T00:00:00`);
    const milliseconds = end.getTime() - start.getTime();
    const rawDays = Number.isFinite(milliseconds) ? Math.round(milliseconds / (1000 * 60 * 60 * 24)) : 0;
    return Math.max(1, rawDays || 1);
}

function formatPeso(value = 0) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function formatShortDate(value = '') {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeInquiryText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseInquiryDate(value = '', fallbackYear = new Date().getFullYear()) {
    const raw = String(value || '').trim();
    const iso = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (iso) {
        return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    }

    const named = raw.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/i);
    if (!named) return null;

    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = monthNames.findIndex((name) => named[1].toLowerCase().startsWith(name));
    const year = Number(named[3] || fallbackYear);
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
}

function getInquiryMonthNumber(value = '') {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = monthNames.findIndex((name) => String(value || '').toLowerCase().startsWith(name));
    return month >= 0 ? month + 1 : null;
}

function formatInquiryDateParts(year, month, day) {
    if (!year || !month || !day) return null;
    return `${Number(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseInquiryDateRanges(text = '', fallbackYear = new Date().getFullYear()) {
    const ranges = [];
    const monthPattern = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

    const crossMonth = new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:,\\s*(20\\d{2}))?\\s*(?:-|to|until|â€“|â€”)\\s*(${monthPattern})\\.?\\s+(\\d{1,2})(?:,\\s*(20\\d{2}))?\\b`, 'gi');
    for (const match of text.matchAll(crossMonth)) {
        const startMonth = getInquiryMonthNumber(match[1]);
        const endMonth = getInquiryMonthNumber(match[4]);
        const startYear = Number(match[3] || match[6] || fallbackYear);
        const endYear = Number(match[6] || match[3] || startYear);
        ranges.push(formatInquiryDateParts(startYear, startMonth, Number(match[2])));
        ranges.push(formatInquiryDateParts(endYear, endMonth, Number(match[5])));
    }

    const sameMonth = new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:,\\s*(20\\d{2}))?\\s*(?:-|to|until|â€“|â€”)\\s*(\\d{1,2})\\b`, 'gi');
    for (const match of text.matchAll(sameMonth)) {
        const month = getInquiryMonthNumber(match[1]);
        const year = Number(match[3] || fallbackYear);
        ranges.push(formatInquiryDateParts(year, month, Number(match[2])));
        ranges.push(formatInquiryDateParts(year, month, Number(match[4])));
    }

    return ranges.filter(Boolean);
}

function parseInquiryContext(message = '', kb = {}) {
    const text = normalizeInquiryText(message);
    const lower = text.toLowerCase();
    const currentYear = new Date().getFullYear();
    const rangeDates = parseInquiryDateRanges(text, currentYear);
    const isoDates = [...text.matchAll(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g)].map((match) => parseInquiryDate(match[0], currentYear));
    const namedDates = [...text.matchAll(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*20\d{2})?\b/gi)]
        .map((match) => parseInquiryDate(match[0], currentYear));
    const dates = [...new Set([...rangeDates, ...isoDates, ...namedDates].filter(Boolean))].sort();

    const explicitGuestMatches = [...lower.matchAll(/\b(\d{1,3})\s*(?:pax|guests?|persons?|people|adults?|heads?)\b/g)];
    const forGuestMatches = [...lower.matchAll(/\b(?:for|good for)\s+(\d{1,3})\b/g)];
    const guestsMatch = explicitGuestMatches.length
        ? explicitGuestMatches[explicitGuestMatches.length - 1]
        : forGuestMatches.length
            ? forGuestMatches[forGuestMatches.length - 1]
            : null;

    const roomMatches = (kb.accommodations || [])
        .map((room) => {
            const name = String(room.name || '');
            const key = normalizeRoomKey(name);
            const looseName = name.toLowerCase();
            const score = lower.includes(looseName)
                ? 3
                : key && normalizeRoomKey(lower).includes(key)
                    ? 2
                    : lower.includes(looseName.replace(/\s+/g, ' '))
                        ? 1
                        : 0;
            return score > 0 ? { room, score } : null;
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score);

    let bookingType = 'overnight';
    if (/day\s*tour|daytour|swimming/i.test(text)) bookingType = 'day_tour';
    if (/tent|camp|pitch/i.test(text)) bookingType = 'tent_pitching';

    return {
        raw_message: text,
        check_in: dates[0] || null,
        check_out: dates[1] || null,
        guests: guestsMatch ? Number(guestsMatch[1]) : null,
        room_type: roomMatches[0]?.room?.name || null,
        booking_type: bookingType,
        intent: lower.includes('available') || lower.includes('vacant') || lower.includes('avail') ? 'availability' : 'general'
    };
}

function buildResponseHelperDraft({ context, kb, suggestions = [], availableUnits = [], tone = 'friendly' } = {}) {
    const contactPhone = kb.contact_phone || kb.contact?.phone || '';
    const lines = [];
    const warnings = [];
    const sources = ['knowledge-base.yaml'];
    const rawMessage = String(context.raw_message || '');
    const usePoliteTaglish = /\b(po|opo|available po|rate po|rates po)\b/i.test(rawMessage);

    const greeting = tone === 'formal'
        ? 'Good day. Thank you for contacting Amalfi Resort.'
        : usePoliteTaglish
            ? 'Hi po! Thank you for messaging Amalfi Resort.'
            : 'Hi! Thanks for messaging Amalfi Resort.';
    lines.push(greeting);

    if (context.check_in && context.check_out) {
        sources.push('live units inventory', 'active bookings database');
        const stayLabel = `${formatShortDate(context.check_in)} to ${formatShortDate(context.check_out)}`;
        if (suggestions.length) {
            const top = suggestions[0];
            const units = (top.units || []).map((unit) => unit.unit_label || unit.unit_id).join(', ');
            const amount = top.summary?.total_amount ? formatPeso(top.summary.total_amount) : '';
            const paxLabel = context.guests ? ` for ${context.guests} pax` : '';
            if (usePoliteTaglish) {
                lines.push(`Available pa po for ${stayLabel}${paxLabel}.`);
                lines.push(`${units || 'Available unit option'} ang best fit based on live availability${amount ? `, estimated total is ${amount}` : ''}.`);
                lines.push('If you want to proceed po, we can hold the option after confirming the guest name, contact number, and payment arrangement.');
            } else {
                lines.push(`We still have availability for ${stayLabel}${paxLabel}.`);
                lines.push(`Best fit from the live unit check: ${units || 'available unit option'}${amount ? `, estimated at ${amount}` : ''}.`);
                lines.push('If this works for you, we can prepare a temporary hold after confirming the guest name, contact number, and payment arrangement.');
            }
        } else if (availableUnits.length) {
            const sample = availableUnits.slice(0, 5).map((unit) => unit.unit_label || unit.unit_id).join(', ');
            lines.push(usePoliteTaglish
                ? `Available pa po for ${stayLabel}: ${sample}${availableUnits.length > 5 ? ` and ${availableUnits.length - 5} more` : ''}.`
                : `We still have available units for ${stayLabel}: ${sample}${availableUnits.length > 5 ? ` and ${availableUnits.length - 5} more` : ''}.`);
            if (!context.guests) warnings.push('Guest count was not detected, so the draft lists available units without capacity matching.');
        } else {
            lines.push(usePoliteTaglish
                ? `For ${stayLabel}, wala po kaming matching available unit sa live inventory right now.`
                : `For ${stayLabel}, our live inventory does not show a matching available unit right now.`);
            lines.push(usePoliteTaglish
                ? 'Pwede po namin i-check ang alternate room types or nearby dates for you.'
                : 'We can still check alternate room types or nearby dates for you.');
        }
    } else {
        lines.push(usePoliteTaglish
            ? 'May we confirm po your target check-in date, check-out date, and total pax so we can check live availability correctly?'
            : 'May we confirm your target check-in date, check-out date, and total pax so we can check live availability correctly?');
        warnings.push('No complete date range was detected. Availability was not checked.');
    }

    if (!context.guests) {
        lines.push(usePoliteTaglish
            ? 'Please send din po the total number of guests so we can recommend the correct unit and avoid over-capacity.'
            : 'Please also send the total number of guests so we can recommend the correct unit and avoid over-capacity.');
    }

    if (context.room_type) {
        const room = (kb.accommodations || []).find((item) => item.name === context.room_type);
        const rate = room?.rates?.[0]?.price_php;
        if (rate) lines.push(`${context.room_type} rates start at ${formatPeso(rate)} depending on pax and stay details.`);
    }

    if (contactPhone && tone !== 'short') {
        lines.push(usePoliteTaglish
            ? `For faster assistance, you may also call or text us at ${contactPhone}.`
            : `For faster assistance, you may also call or text us at ${contactPhone}.`);
    }

    return {
        reply: tone === 'short' ? lines.slice(0, 3).join('\n\n') : lines.join('\n\n'),
        warnings,
        sources
    };
}

async function analyzeGuestInquiry(message = '', options = {}) {
    const normalizedMessage = normalizeInquiryText(message);
    if (!normalizedMessage) {
        const err = new Error('Paste the customer message first.');
        err.statusCode = 400;
        throw err;
    }

    const kb = options.kb || loadKnowledgeBaseJson();
    const context = parseInquiryContext(normalizedMessage, kb);
    let availableUnits = [];
    let suggestions = [];

    if (context.check_in && context.check_out) {
        availableUnits = await listDeskAvailability({
            checkIn: context.check_in,
            checkOut: context.check_out,
            roomType: context.room_type
        });

        if (context.guests && availableUnits.length) {
            const nights = computeStayNights(context.check_in, context.check_out);
            const maxSuggestions = Math.max(1, Math.min(Number(options.maxSuggestions || 4), 8));
            const soloSuggestions = buildDeskSuggestions(availableUnits, context.guests, nights, {
                mode: 'solo',
                maxSuggestions
            });
            suggestions = soloSuggestions.length
                ? soloSuggestions
                : buildDeskSuggestions(availableUnits, context.guests, nights, {
                    mode: 'combo',
                    maxSuggestions
                });
        }
    }

    return {
        context,
        live_inventory: {
            checked: Boolean(context.check_in && context.check_out),
            available_unit_count: availableUnits.length,
            available_units: availableUnits.slice(0, 20).map((unit) => ({
                unit_id: unit.unit_id,
                unit_label: unit.unit_label,
                room_type: unit.room_type || unit.name,
                nightly_rate: Number(unit.nightly_rate || unit.price || 0),
                standard_max_pax: Number(unit.base_max_pax || unit.standard_max_pax || 0),
                absolute_max_pax: Number(unit.absolute_max_pax || 0)
            }))
        },
        suggestions,
        analysis_engine: 'hub_inquiry_brain_v1'
    };
}

async function generateShortBookingHeaderReference(prefix = 'RES') {
    const safePrefix = String(prefix || 'RES').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 3) || 'RES';

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const token = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
        const candidate = `${safePrefix}-${mm}${dd}-${token}`;
        const existing = await dbGetAsync(
            `SELECT booking_reference FROM booking_headers WHERE booking_reference = ? LIMIT 1`,
            [candidate]
        );
        if (!existing) return candidate;
    }

    const fallbackToken = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    return `${safePrefix}-${fallbackToken}`;
}

function fallbackRoomTypeId(roomType = '') {
    const typeMap = {
        'amalfi suite': 'amalfi-suite',
        'positano vista': 'positano-vista',
        'ravello suite': 'ravello-suite',
        'capri vista': 'capri-vista',
        'sirenuse suite': 'sirenuse-suite',
        'sunset pavilion': 'sunset-pavilion'
    };

    const normalized = canonicalizeRoomTypeLabel(roomType).toLowerCase();
    return typeMap[normalized] || normalized.replace(/\s+/g, '-');
}

function resolveRoomTypeId({ roomType, unitId }, callback) {
    if (unitId) {
        db.get(`SELECT room_type_id FROM units WHERE unit_id = ? LIMIT 1`, [unitId], (unitErr, unitRow) => {
            if (unitErr) return callback(unitErr);
            if (unitRow?.room_type_id) return callback(null, unitRow.room_type_id);
            return resolveRoomTypeId({ roomType, unitId: null }, callback);
        });
        return;
    }

    const canonicalRoomType = canonicalizeRoomTypeLabel(roomType);
    db.get(
        `SELECT id FROM rooms WHERE lower(trim(room_type)) = lower(trim(?)) LIMIT 1`,
        [canonicalRoomType],
        (roomErr, roomRow) => {
            if (roomErr) return callback(roomErr);
            if (roomRow?.id) return callback(null, roomRow.id);
            return callback(null, fallbackRoomTypeId(canonicalRoomType));
        }
    );
}

function findAssignableUnit({ roomTypeId, checkIn, checkOut, excludeBookingRef = null, preferredUnitId = null }, callback) {
    db.all(
        `SELECT unit_id, unit_label, unit_status
         FROM units
         WHERE room_type_id = ?
           AND COALESCE(unit_status, 'Available') != 'Maintenance'
         ORDER BY unit_id ASC`,
        [roomTypeId],
        (unitErr, units = []) => {
            if (unitErr) return callback(unitErr);

            db.all(
                `SELECT booking_ref, unit_id, full_name, check_in, check_out, status
                 FROM bookings
                 WHERE unit_id IS NOT NULL
                   AND is_deleted = 0
                   AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                   AND check_in < ? AND check_out > ?
                   ${excludeBookingRef ? 'AND booking_ref != ?' : ''}
                 ORDER BY check_in ASC, booking_ref ASC`,
                excludeBookingRef ? [checkOut, checkIn, excludeBookingRef] : [checkOut, checkIn],
                (bookingErr, blockingRows = []) => {
                    if (bookingErr) return callback(bookingErr);

                    const blockingByUnit = new Map();
                    for (const row of blockingRows) {
                        if (!blockingByUnit.has(row.unit_id)) blockingByUnit.set(row.unit_id, []);
                        blockingByUnit.get(row.unit_id).push(row);
                    }

                    const orderedUnits = [...units].sort((a, b) => {
                        if (preferredUnitId && a.unit_id === preferredUnitId) return -1;
                        if (preferredUnitId && b.unit_id === preferredUnitId) return 1;
                        return a.unit_id.localeCompare(b.unit_id);
                    });

                    const unit = orderedUnits.find((candidate) => !blockingByUnit.has(candidate.unit_id)) || null;

                    callback(null, {
                        unit,
                        totalUnits: units.length,
                        blockedUnits: blockingByUnit.size,
                        blockingRows
                    });
                }
            );
        }
    );
}

function normalizeLegacyBookingStatuses() {
    const statements = [
        {
            sql: `UPDATE bookings SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_RESERVED, LEGACY_APPROVED_STATUS],
            label: 'legacy APPROVED bookings to RESERVED'
        },
        {
            sql: `UPDATE bookings SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_CHECKED_IN, LEGACY_OCCUPIED_STATUS],
            label: 'legacy OCCUPIED bookings to CHECKED_IN'
        },
        {
            sql: `UPDATE bookings SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_PENDING_VERIFICATION, LEGACY_AWAITING_PAYMENT_STATUS],
            label: 'legacy AWAITING_PAYMENT bookings to PENDING_VERIFICATION'
        },
        {
            sql: `UPDATE bookings SET status = ?, is_deleted = 1 WHERE status = ?`,
            params: [BOOKING_STATUS_CANCELLED, LEGACY_DELETED_STATUS],
            label: 'legacy DELETED bookings to is_deleted records'
        },
        {
            sql: `UPDATE booking_headers SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_RESERVED, LEGACY_APPROVED_STATUS],
            label: 'legacy APPROVED headers to RESERVED'
        },
        {
            sql: `UPDATE booking_headers SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_CHECKED_IN, LEGACY_OCCUPIED_STATUS],
            label: 'legacy OCCUPIED headers to CHECKED_IN'
        },
        {
            sql: `UPDATE booking_headers SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_PENDING_VERIFICATION, LEGACY_PENDING_STATUS],
            label: 'legacy PENDING headers to PENDING_VERIFICATION'
        },
        {
            sql: `UPDATE booking_items SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_RESERVED, LEGACY_APPROVED_STATUS],
            label: 'legacy APPROVED items to RESERVED'
        },
        {
            sql: `UPDATE booking_items SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_CHECKED_IN, LEGACY_OCCUPIED_STATUS],
            label: 'legacy OCCUPIED items to CHECKED_IN'
        },
        {
            sql: `UPDATE booking_items SET status = ? WHERE status = ?`,
            params: [BOOKING_STATUS_PENDING_VERIFICATION, LEGACY_HELD_STATUS],
            label: 'legacy HELD items to PENDING_VERIFICATION'
        },
        {
            sql: `UPDATE bookings SET status = ?, payment_status = ? WHERE status = 'PARTIAL'`,
            params: [BOOKING_STATUS_RESERVED, PAYMENT_SUMMARY_PARTIAL],
            label: 'legacy PARTIAL booking statuses to RESERVED with PARTIAL payment summary'
        },
        {
            sql: `UPDATE booking_headers SET status = ?, payment_status = ? WHERE status = 'PARTIAL'`,
            params: [BOOKING_STATUS_RESERVED, PAYMENT_SUMMARY_PARTIAL],
            label: 'legacy PARTIAL header statuses to RESERVED with PARTIAL payment summary'
        },
        {
            sql: `UPDATE booking_items SET status = ? WHERE status = 'PARTIAL'`,
            params: [BOOKING_STATUS_RESERVED],
            label: 'legacy PARTIAL item statuses to RESERVED'
        },
        {
            sql: `UPDATE bookings SET payment_status = ? WHERE payment_status = 'Fully Paid'`,
            params: [PAYMENT_SUMMARY_PAID],
            label: 'legacy Fully Paid booking summaries to PAID'
        },
        {
            sql: `UPDATE bookings SET payment_status = ? WHERE payment_status = 'Partial'`,
            params: [PAYMENT_SUMMARY_PARTIAL],
            label: 'legacy Partial booking summaries to PARTIAL'
        },
        {
            sql: `UPDATE bookings SET payment_status = ? WHERE payment_status = 'Unpaid'`,
            params: [PAYMENT_SUMMARY_UNPAID],
            label: 'legacy Unpaid booking summaries to UNPAID'
        },
        {
            sql: `UPDATE bookings SET payment_status = ? WHERE payment_status = 'PENDING_VERIFICATION'`,
            params: [PAYMENT_SUMMARY_PAYMENT_REVIEW],
            label: 'legacy pending booking payment summaries to PAYMENT_REVIEW'
        },
        {
            sql: `UPDATE booking_headers SET payment_status = ? WHERE payment_status = 'Fully Paid'`,
            params: [PAYMENT_SUMMARY_PAID],
            label: 'legacy Fully Paid header summaries to PAID'
        },
        {
            sql: `UPDATE booking_headers SET payment_status = ? WHERE payment_status = 'Partial'`,
            params: [PAYMENT_SUMMARY_PARTIAL],
            label: 'legacy Partial header summaries to PARTIAL'
        },
        {
            sql: `UPDATE booking_headers SET payment_status = ? WHERE payment_status = 'Unpaid'`,
            params: [PAYMENT_SUMMARY_UNPAID],
            label: 'legacy Unpaid header summaries to UNPAID'
        },
        {
            sql: `UPDATE booking_headers SET payment_status = ? WHERE payment_status = 'PENDING_VERIFICATION'`,
            params: [PAYMENT_SUMMARY_PAYMENT_REVIEW],
            label: 'legacy pending header payment summaries to PAYMENT_REVIEW'
        }
    ];

    statements.forEach(({ sql, params, label }) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.warn(`Legacy normalization failed for ${label}:`, err.message);
                return;
            }

            if (this.changes > 0) {
                console.log(`Normalized ${this.changes} ${label}.`);
            }
        });
    });
}

function warnOnKnowledgeBaseDrift() {
    if (!fs.existsSync(centralKbPath)) {
        console.warn('Central intelligence JSON missing. Run .\\amalfi-ops\\sync\\compile-kb.ps1 before deploying.');
    }
}


/**
 * The Financial Pulse:
 * Ensures a booking's balance and payment_status are derived from its transaction history.
 * Call this after ANY change to total_price, addon_amount, or transactions.
 */
function syncBookingFinance(bookingRef, callback = () => {}) {
    db.get(`
        SELECT 
            b.total_price,
            COALESCE(b.addon_amount, 0) as addon_amount,
            COALESCE(SUM(CASE 
                WHEN (t.status = 'VERIFIED' OR t.status = 'APPROVED') 
                AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment') 
                THEN t.amount ELSE 0 END), 0) as amount_paid,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END), 0) as amount_refunded,
            COALESCE(SUM(CASE
                WHEN t.status = 'PENDING_VERIFICATION'
                 AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment')
                THEN 1 ELSE 0 END), 0) as pending_proof_count
        FROM bookings b
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.booking_ref = ?
        GROUP BY b.booking_ref
    `, [bookingRef], (err, funds) => {
        if (err || !funds) return callback(err || new Error('Booking not found during sync'));

        const totalContract = (funds.total_price || 0) + (funds.addon_amount || 0);
        const totalNetPaid  = (funds.amount_paid || 0) - (funds.amount_refunded || 0);
        
        // Use a tiny epsilon to handle float precision (0.01)
        const rawBalance    = totalContract - totalNetPaid;
        const newBalance    = rawBalance < 0.01 ? 0 : parseFloat(rawBalance.toFixed(2));
        
        const newStatus = derivePaymentSummary({
            grossTotal: totalContract,
            netPaid: totalNetPaid,
            hasPendingProof: Number(funds.pending_proof_count || 0) > 0
        });

        db.run(`UPDATE bookings SET amount_paid = ?, balance = ?, payment_status = ? WHERE booking_ref = ?`,
            [totalNetPaid, newBalance, newStatus, bookingRef], (err2) => {
                if (!err2) {
                    return callback(null, { amount_paid: totalNetPaid, balance: newBalance, status: newStatus });
                }

                if (String(err2.message || '').includes('no such column: amount_paid')) {
                    return db.run(`UPDATE bookings SET balance = ?, payment_status = ? WHERE booking_ref = ?`,
                        [newBalance, newStatus, bookingRef], (fallbackErr) => {
                            callback(fallbackErr, { amount_paid: totalNetPaid, balance: newBalance, status: newStatus });
                        });
                }

                callback(err2, { amount_paid: totalNetPaid, balance: newBalance, status: newStatus });
            });
    });
}

async function recomputeLegacyBookingFinance(bookingRef) {
    const funds = await dbGetAsync(`
        SELECT
            b.total_price,
            COALESCE(b.addon_amount, 0) as addon_amount,
            COALESCE(SUM(CASE
                WHEN (t.status = 'VERIFIED' OR t.status = 'APPROVED')
                 AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment')
                THEN t.amount ELSE 0 END), 0) as amount_paid,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END), 0) as amount_refunded,
            COALESCE(SUM(CASE
                WHEN t.status = 'PENDING_VERIFICATION'
                 AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment')
                THEN 1 ELSE 0 END), 0) as pending_proof_count
        FROM bookings b
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.booking_ref = ?
        GROUP BY b.booking_ref
    `, [bookingRef]);

    if (!funds) {
        throw new Error(`Booking ${bookingRef} not found during finance sync`);
    }

    const grossTotal = Number(funds.total_price || 0) + Number(funds.addon_amount || 0);
    const netPaid = Number(funds.amount_paid || 0) - Number(funds.amount_refunded || 0);
    const rawBalance = grossTotal - netPaid;
    const balance = rawBalance < 0.01 ? 0 : parseFloat(rawBalance.toFixed(2));
    const paymentStatus = derivePaymentSummary({
        grossTotal,
        netPaid,
        hasPendingProof: Number(funds.pending_proof_count || 0) > 0
    });

    await dbRunAsync(
        `UPDATE bookings SET amount_paid = ?, balance = ?, payment_status = ? WHERE booking_ref = ?`,
        [netPaid, balance, paymentStatus, bookingRef]
    );

    return {
        gross_total: grossTotal,
        amount_paid: netPaid,
        balance,
        payment_status: paymentStatus
    };
}

function buildBookingChangeSetPreview({ before = {}, after = {}, paymentAmount = 0, workflow = 'edit', finance = {} } = {}) {
    const changedFields = [];
    const comparableFields = [
        'full_name', 'guest_name', 'email', 'phone', 'unit_id', 'room_type',
        'check_in', 'check_out', 'guests', 'guest_count', 'status',
        'booking_source', 'notes', 'special_requests',
        'total_price', 'lodging_total', 'addon_amount'
    ];

    for (const field of comparableFields) {
        if (
            Object.prototype.hasOwnProperty.call(before, field) ||
            Object.prototype.hasOwnProperty.call(after, field)
        ) {
            const oldValue = before[field] ?? null;
            const newValue = after[field] ?? null;
            if (String(oldValue ?? '') !== String(newValue ?? '')) {
                changedFields.push({ field, from: oldValue, to: newValue });
            }
        }
    }

    const balance = Number(finance.balance_due ?? finance.balance ?? 0);
    const gross = Number(finance.grand_total ?? finance.gross_total ?? 0);
    const paid = Number(finance.verified_paid_total ?? finance.amount_paid ?? 0);

    return {
        workflow,
        changed_fields: changedFields,
        payment_to_record: Number(paymentAmount || 0),
        gross_total: gross,
        paid_total: paid,
        final_balance: balance,
        can_commit: !['checkin', 'checkout'].includes(workflow) || balance <= 1
    };
}

function syncKnowledgeBase() {
    if (!fs.existsSync(centralKbPath)) return console.warn("Knowledge Base not found.");

    try {
        const kbData = loadKnowledgeBaseJson();
        const rooms = kbData.accommodations || [];

        rooms.forEach((room) => {
            const id = room.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
            const price = room.rates?.[0]?.price_php || 0;
            const unitsTotal = room.units || 1;
            const capacity = deriveCapacityMeta(room);
            const maxPax = capacity.absolute_max_pax;

            const hasAC = room.features.some(f => f.toLowerCase().includes('air-conditioned') || f.toLowerCase().includes('ac'));
            const description = room.marketing_name || '';
            const features = JSON.stringify(room.features || []);

            db.run(
                `INSERT INTO rooms (id, room_type, price, total_units, marketing_name, description, features) 
                 VALUES (?, ?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET price=excluded.price, total_units=excluded.total_units, description=excluded.description, features=excluded.features`,
                [id, room.name, price, unitsTotal, room.marketing_name, description, features]
            );

            for (let i = 1; i <= unitsTotal; i++) {
                const unitId = `${id}-${i}`;
                const label = room.unit_labels?.[i - 1] || `${room.name} #${i}`;

                // Determine area (Pool View, Beach View, or Sanctuary)
                let area = 'Sanctuary';
                if (room.area_assignment) {
                    const poolCount = room.area_assignment.pool_view || 0;
                    const beachCount = room.area_assignment.beach_view || 0;
                    if (i <= poolCount) area = 'Pool View';
                    else if (i <= (poolCount + beachCount)) area = 'Beach View';
                }

                db.run(`INSERT INTO units (unit_id, room_type_id, unit_label, area, max_pax, has_ac, nightly_rate, unit_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(unit_id) DO UPDATE SET unit_label=excluded.unit_label, area=excluded.area, max_pax=excluded.max_pax, has_ac=excluded.has_ac, nightly_rate=excluded.nightly_rate`,
                    [unitId, id, label, area, maxPax, hasAC ? 1 : 0, price, 'Available']);
            }
        });

        logAction('sync_kb', 'system', 'knowledge_base', `Synced ${rooms.length} room types.`);
        console.log(`Synced ${rooms.length} room types and physical units.`);
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

// Admin API: Get Master Knowledge Base (JSON parsed from YAML)
app.get('/api/v1/admin/knowledge', (req, res) => {
    const yamlPath = path.join(intelligenceRoot, 'knowledge-base.yaml');

    if (!fs.existsSync(yamlPath)) {
        try {
            return res.json(loadKnowledgeBaseJson());
        } catch (error) {
            return res.status(404).json({
                error: 'Master Knowledge Base YAML not found in amalfi-system/intelligence/ and no generated JSON fallback was readable.',
                details: error.message
            });
        }
    }

    try {
        const fileContents = fs.readFileSync(yamlPath, 'utf8');
        const data = yaml.load(fileContents);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to parse Knowledge Base', details: e.message });
    }
});

app.post('/api/v1/admin/booking-headers', async (req, res) => {
    const { header = {}, items = [], admin_id = 'admin' } = req.body || {};

    const retiredAliases = [
        ...findRetiredTransactionAliases('header', header, 'header'),
        ...(Array.isArray(items) ? items : []).flatMap((item, index) => (
            findRetiredTransactionAliases('item', item, `items[${index}]`)
        ))
    ];
    if (retiredAliases.length) {
        return res.status(400).json(retiredTransactionAliasResponse(new RetiredTransactionAliasError(retiredAliases)));
    }

    const bookingReference = header.booking_reference || header.bookingReference || null;
    const customerName = header.guest_name || header.guestName || '';
    const normalizedItems = Array.isArray(items) ? items : [];
    const checkIn = header.check_in || header.checkIn || normalizedItems[0]?.check_in || normalizedItems[0]?.checkIn || '';
    const checkOut = header.check_out || header.checkOut || normalizedItems[0]?.check_out || normalizedItems[0]?.checkOut || '';

    if (!customerName || !checkIn || !checkOut) {
        return res.status(400).json({ error: 'guest_name, check_in, and check_out are required for a booking header.' });
    }

    if (checkIn >= checkOut) {
        return res.status(400).json({ error: 'check_out must be after check_in.' });
    }

    if (!normalizedItems.length) {
        return res.status(400).json({ error: 'At least one booking item is required.' });
    }

    for (let index = 0; index < normalizedItems.length; index += 1) {
        const item = normalizedItems[index] || {};
        const itemCheckIn = item.check_in || item.checkIn || checkIn;
        const itemCheckOut = item.check_out || item.checkOut || checkOut;
        const roomType = item.room_type || item.roomType;
        if (!roomType || !itemCheckIn || !itemCheckOut) {
            return res.status(400).json({ error: `Item ${index + 1} requires room_type, check_in, and check_out.` });
        }
        if (itemCheckIn >= itemCheckOut) {
            return res.status(400).json({ error: `Item ${index + 1} has an invalid stay window.` });
        }
    }

    try {
        const selectedUnitIds = normalizedItems
            .map((item) => item.unit_id || item.unitId || null)
            .filter(Boolean);

        if (selectedUnitIds.length) {
            const conflicts = await findOverlappingBookingItems({
                checkIn,
                checkOut,
                unitIds: selectedUnitIds
            });

            if (conflicts.length) {
                return res.status(409).json({
                    error: 'One or more selected units are already blocked for the requested dates.',
                    conflicts
                });
            }
        }

        const capacityCheck = validateBookingHeaderItemCapacity(normalizedItems);
        if (!capacityCheck.ok) {
            return res.status(400).json({ error: capacityCheck.error });
        }

        const totalAmount = header.lodging_total ?? header.lodgingTotal
            ?? normalizedItems.reduce((sum, item) => sum + Number(item.lodging_subtotal ?? item.lodgingSubtotal ?? 0), 0);

        const created = await createHeaderWithItems({
            header: {
                ...header,
                booking_reference: bookingReference || undefined,
                guest_name: customerName,
                check_in: checkIn,
                check_out: checkOut,
                lodging_total: totalAmount,
                created_by: header.created_by || header.createdBy || 'admin',
                booking_source: header.booking_source || header.bookingSource || 'Admin Transaction Desk'
            },
            items: normalizedItems.map((item, index) => ({
                ...item,
                check_in: item.check_in || item.checkIn || checkIn,
                check_out: item.check_out || item.checkOut || checkOut,
                sequence_no: item.sequence_no ?? item.sequenceNo ?? (index + 1)
            }))
        });

        logAction(
            'admin_create_booking_header',
            'booking_header',
            created.header.booking_reference,
            `Guest: ${customerName} | Items: ${created.items.length} | Total: ${Number(totalAmount || 0)}`,
            admin_id
        );

        return res.status(201).json(created);
    } catch (err) {
        if (err instanceof RetiredTransactionAliasError) {
            return res.status(400).json(retiredTransactionAliasResponse(err));
        }
        console.error('Failed to create booking header:', err);
        return res.status(500).json({ error: 'Booking header creation failed.', details: err.message });
    }
});

app.get('/api/v1/admin/booking-headers/:ref', async (req, res) => {
    try {
        const payload = await getBookingHeaderWithItems(req.params.ref);
        if (!payload) return res.status(404).json({ error: 'Booking header not found.' });
        return res.json(payload);
    } catch (err) {
        console.error('Failed to load booking header:', err);
        return res.status(500).json({ error: 'Booking header lookup failed.', details: err.message });
    }
});

app.get('/api/v1/admin/booking-headers/:ref/items', async (req, res) => {
    try {
        const payload = await getBookingHeaderWithItems(req.params.ref);
        if (!payload) return res.status(404).json({ error: 'Booking header not found.' });
        return res.json({ items: payload.items || [] });
    } catch (err) {
        console.error('Failed to load booking items:', err);
        return res.status(500).json({ error: 'Booking item lookup failed.', details: err.message });
    }
});

app.post('/api/v1/admin/booking-headers/:ref/items', async (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body || {};

    try {
        const payload = await addTransactionBookingItem(ref, req.body || {});
        if (!payload) return res.status(404).json({ error: 'Booking header not found.' });

        logAction(
            'admin_add_booking_item',
            'booking_item',
            ref,
            `Unit: ${req.body?.unit_id || 'unassigned'} | Status: ${req.body?.status || 'RESERVED'}`,
            admin_id
        );

        return res.status(201).json(payload);
    } catch (err) {
        if (err instanceof RetiredTransactionAliasError) {
            return res.status(400).json(retiredTransactionAliasResponse(err));
        }
        const statusCode = /already blocked/i.test(err.message) ? 409 : (/not found/i.test(err.message) ? 404 : 500);
        console.error('Failed to add booking item:', err);
        return res.status(statusCode).json({ error: err.message || 'Booking item add failed.' });
    }
});

app.patch('/api/v1/admin/booking-headers/:ref', async (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body || {};

    try {
        const payload = await updateTransactionBooking(ref, req.body || {});
        if (!payload) return res.status(404).json({ error: 'Booking header not found.' });

        logAction(
            'admin_update_booking_header',
            'booking_header',
            ref,
            `Status: ${req.body?.status || 'unchanged'} | Stay: ${req.body?.check_in || 'same'} to ${req.body?.check_out || 'same'}`,
            admin_id
        );

        return res.json(payload);
    } catch (err) {
        if (err instanceof RetiredTransactionAliasError) {
            return res.status(400).json(retiredTransactionAliasResponse(err));
        }
        const statusCode = /not found/i.test(err.message) ? 404 : 500;
        console.error('Failed to update booking header:', err);
        return res.status(statusCode).json({ error: err.message || 'Booking header update failed.' });
    }
});

app.patch('/api/v1/admin/booking-headers/:ref/items/:itemId', async (req, res) => {
    const { ref, itemId } = req.params;
    const { admin_id = 'admin' } = req.body || {};

    try {
        const payload = await updateTransactionBookingItem(ref, itemId, req.body || {});
        if (!payload) return res.status(404).json({ error: 'Booking header not found.' });

        logAction(
            'admin_update_booking_item',
            'booking_item',
            `${ref}#${itemId}`,
            `Unit: ${req.body?.unit_id || 'unchanged'} | Status: ${req.body?.status || 'unchanged'}`,
            admin_id
        );

        return res.json(payload);
    } catch (err) {
        if (err instanceof RetiredTransactionAliasError) {
            return res.status(400).json(retiredTransactionAliasResponse(err));
        }
        const statusCode = /already blocked/i.test(err.message) ? 409 : (/not found/i.test(err.message) ? 404 : 500);
        console.error('Failed to update booking item:', err);
        return res.status(statusCode).json({ error: err.message || 'Booking item update failed.' });
    }
});

app.post('/api/v1/admin/booking-headers/:ref/payments', async (req, res) => {
    const retiredAliases = findRetiredTransactionAliases('payment', req.body || {}, 'payment');
    if (retiredAliases.length) {
        return res.status(400).json(retiredTransactionAliasResponse(new RetiredTransactionAliasError(retiredAliases)));
    }

    const {
        amount,
        payment_type,
        payment_method,
        receipt_url,
        reference_no,
        verification_status,
        notes,
        admin_id = 'admin'
    } = req.body || {};

    if (Number(amount || 0) <= 0) {
        return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }

    try {
        const payload = await getBookingHeaderWithItems(req.params.ref);
        if (!payload) return res.status(404).json({ error: 'Booking header not found.' });

        const result = await recordPayment({
            booking_reference: req.params.ref,
            amount,
            payment_type,
            payment_method,
            receipt_url,
            reference_no,
            verification_status,
            notes
        });

        logAction(
            'admin_header_payment',
            'booking_header',
            req.params.ref,
            `Amount: ${Number(amount)} | Type: ${payment_type || 'payment'} | Method: ${payment_method || 'unspecified'}`,
            admin_id
        );

        return res.status(201).json(result);
    } catch (err) {
        if (err instanceof RetiredTransactionAliasError) {
            return res.status(400).json(retiredTransactionAliasResponse(err));
        }
        console.error('Failed to record header payment:', err);
        return res.status(500).json({ error: 'Header payment recording failed.', details: err.message });
    }
});

app.post('/api/v1/admin/bulk/past-bookings/settle', async (req, res) => {
    const {
        dry_run = true,
        checkout = true,
        cutoff_date,
        confirm_phrase,
        admin_id = 'admin'
    } = req.body || {};

    const cutoffDate = String(cutoff_date || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
        return res.status(400).json({ error: 'cutoff_date must use YYYY-MM-DD format.' });
    }

    const isDryRun = dry_run !== false;
    if (!isDryRun && String(confirm_phrase || '') !== BULK_PAST_SETTLEMENT_CONFIRMATION) {
        return res.status(400).json({
            error: `Type ${BULK_PAST_SETTLEMENT_CONFIRMATION} to confirm bulk settlement.`,
            confirmation_required: BULK_PAST_SETTLEMENT_CONFIRMATION
        });
    }

    try {
        if (isDryRun) {
            const preview = await runInPreviewTransaction(() => findPastSettlementCandidates(cutoffDate));
            return res.json({
                dry_run: true,
                cutoff_date: cutoffDate,
                checkout: Boolean(checkout),
                confirmation_required: BULK_PAST_SETTLEMENT_CONFIRMATION,
                ...preview
            });
        }

        const preview = await findPastSettlementCandidates(cutoffDate);
        const settled = await runInTransaction(async () => {
            const rows = [];
            for (const candidate of preview.candidates) {
                rows.push(await settlePastBookingCandidate(candidate, {
                    checkout: Boolean(checkout),
                    adminId: admin_id,
                    cutoffDate
                }));
            }
            return rows;
        });

        logAction(
            'admin_bulk_past_settlement_batch',
            'booking',
            `past-before-${cutoffDate}`,
            `Settled ${settled.length} past booking(s), total ${preview.summary.total_balance}. Checkout: ${Boolean(checkout)}.`,
            admin_id
        );

        return res.json({
            dry_run: false,
            cutoff_date: cutoffDate,
            checkout: Boolean(checkout),
            summary: {
                ...preview.summary,
                settled: settled.length,
                settled_total: toMoney(settled.reduce((sum, row) => sum + Number(row.settled_amount || 0), 0))
            },
            settled
        });
    } catch (err) {
        console.error('Bulk past booking settlement failed:', err);
        return res.status(500).json({ error: 'Bulk past booking settlement failed.', details: err.message });
    }
});

app.post('/api/v1/admin/booking-headers/:ref/addons', async (req, res) => {
    const { amount, item_name, notes, admin_id = 'admin' } = req.body || {};

    if (Number(amount || 0) <= 0) {
        return res.status(400).json({ error: 'Addon amount must be greater than zero.' });
    }

    if (!String(item_name || '').trim()) {
        return res.status(400).json({ error: 'Addon item name is required.' });
    }

    try {
        const result = await recordHeaderAddon({
            booking_reference: req.params.ref,
            amount,
            item_name,
            notes,
            created_by: admin_id
        });

        logAction(
            'admin_header_addon',
            'booking_header',
            req.params.ref,
            `Addon: ${item_name} | Amount: ${Number(amount)}`,
            admin_id
        );

        return res.status(201).json(result);
    } catch (err) {
        const statusCode = /not found/i.test(err.message) ? 404 : 500;
        console.error('Failed to record header addon:', err);
        return res.status(statusCode).json({ error: err.message || 'Header addon failed.' });
    }
});

app.post('/api/v1/admin/booking-desk/recommendations', async (req, res) => {
    const { check_in, check_out, guests, mode = 'combo', room_type = null, max_suggestions = 8 } = req.body || {};

    if (!check_in || !check_out || Number(guests || 0) <= 0) {
        return res.status(400).json({ error: 'check_in, check_out, and guests are required.' });
    }

    try {
        const nights = computeStayNights(check_in, check_out);
        const availableUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out, roomType: room_type });
        const suggestions = buildDeskSuggestions(availableUnits, Number(guests), nights, {
            mode,
            maxSuggestions: Math.max(1, Math.min(Number(max_suggestions || 8), 12))
        });

        return res.json({
            criteria: {
                check_in,
                check_out,
                guests: Number(guests),
                nights,
                mode: mode === 'solo' ? 'solo' : 'combo',
                room_type: room_type || null
            },
            available_units: availableUnits.map((unit) => ({
                unit_id: unit.unit_id,
                unit_label: unit.unit_label || unit.unit_id,
                room_type_id: unit.room_type_id,
                room_type: unit.room_type,
                marketing_name: unit.marketing_name || unit.room_type,
                nightly_rate: Number(unit.nightly_rate || unit.price || 0),
                standard_max_pax: Number(unit.base_max_pax || 0),
                absolute_max_pax: Number(unit.absolute_max_pax || 0),
                extra_pax_allowed: Boolean(unit.extra_pax_allowed),
                extra_pax_rate: Number(unit.extra_pax_rate || 0),
                fits_requested_pax: Number(guests) <= Number(unit.absolute_max_pax || 0)
            })),
            suggestions
        });
    } catch (err) {
        console.error('Failed to build booking-desk recommendations:', err);
        return res.status(500).json({ error: 'Recommendation generation failed.', details: err.message });
    }
});

app.post('/api/v1/admin/booking-desk/quote', async (req, res) => {
    const { check_in, check_out, guests, unit_ids = [] } = req.body || {};

    if (!check_in || !check_out || Number(guests || 0) <= 0 || !Array.isArray(unit_ids) || unit_ids.length === 0) {
        return res.status(400).json({ error: 'check_in, check_out, guests, and unit_ids are required.' });
    }

    try {
        const nights = computeStayNights(check_in, check_out);
        const requestedUnitIds = [...new Set(unit_ids.map((value) => String(value || '').trim()).filter(Boolean))];
        const availableUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out });
        const availableById = new Map(availableUnits.map((unit) => [unit.unit_id, unit]));
        const selectedUnits = requestedUnitIds.map((unitId) => availableById.get(unitId)).filter(Boolean);
        const unavailableUnitIds = requestedUnitIds.filter((unitId) => !availableById.has(unitId));

        if (unavailableUnitIds.length > 0) {
            return res.status(409).json({
                error: `The following unit(s) are not available for the selected dates: ${unavailableUnitIds.join(', ')}`,
                unavailable_unit_ids: unavailableUnitIds
            });
        }

        const quote = quoteDeskSelection(selectedUnits, Number(guests), nights);
        return res.json({
            criteria: {
                check_in,
                check_out,
                guests: Number(guests),
                nights,
                unit_ids: requestedUnitIds
            },
            quote
        });
    } catch (err) {
        const statusCode = /accommodate|short by/i.test(err.message) ? 400 : 500;
        console.error('Failed to build booking-desk quote:', err);
        return res.status(statusCode).json({ error: err.message || 'Quote generation failed.' });
    }
});

app.post('/api/v1/admin/inquiry-brain/analyze', async (req, res) => {
    const { message = '', max_suggestions = 4 } = req.body || {};

    try {
        const analysis = await analyzeGuestInquiry(message, { maxSuggestions: max_suggestions });
        return res.json(analysis);
    } catch (err) {
        const statusCode = err.statusCode || 500;
        console.error('Inquiry brain analysis failed:', err);
        return res.status(statusCode).json({ error: err.message || 'Inquiry analysis failed.' });
    }
});

app.post('/api/v1/admin/response-helper/draft', async (req, res) => {
    const { message = '', tone = 'friendly' } = req.body || {};

    try {
        const kb = loadKnowledgeBaseJson();
        const analysis = await analyzeGuestInquiry(message, { kb, maxSuggestions: 4 });

        const draft = buildResponseHelperDraft({
            context: analysis.context,
            kb,
            suggestions: analysis.suggestions,
            availableUnits: analysis.live_inventory.available_units,
            tone
        });

        return res.json({
            ...analysis,
            ...draft
        });
    } catch (err) {
        console.error('Response helper draft failed:', err);
        return res.status(err.statusCode || 500).json({ error: 'Response helper failed to build a draft.', details: err.message });
    }
});

app.post('/api/v1/public/booking-options', requireGuestPortalEnabled, async (req, res) => {
    const { check_in, check_out, guests = 1 } = req.body || {};

    if (!check_in || !check_out) {
        return res.status(400).json({ error: 'check_in and check_out are required.' });
    }

    try {
        const nights = computeStayNights(check_in, check_out);
        const allUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out, includeBlocked: true });
        const availableUnits = allUnits.filter((unit) => !unit.blocked_booking);
        const unavailableUnits = allUnits.filter((unit) => unit.blocked_booking);
        const serializeUnitOption = (unit) => ({
            unit_id: unit.unit_id,
            unit_label: unit.unit_label || unit.unit_id,
            room_type_id: unit.room_type_id,
            room_type: unit.room_type,
            marketing_name: unit.marketing_name || unit.room_type,
            nightly_rate: Number(unit.nightly_rate || unit.price || 0),
            standard_max_pax: Number(unit.base_max_pax || 0),
            absolute_max_pax: Number(unit.absolute_max_pax || 0),
            extra_pax_allowed: Boolean(unit.extra_pax_allowed),
            extra_pax_rate: Number(unit.extra_pax_rate || 0),
            fits_requested_pax: Number(guests || 1) <= Number(unit.absolute_max_pax || 0),
            is_available: !unit.blocked_booking,
            unavailable_reason: unit.blocked_booking ? 'Booked for selected dates' : null
        });

        return res.json({
            criteria: {
                check_in,
                check_out,
                guests: Number(guests || 1),
                nights
            },
            available_units: availableUnits.map(serializeUnitOption),
            unavailable_units: unavailableUnits.map(serializeUnitOption),
            all_units: allUnits.map(serializeUnitOption)
        });
    } catch (err) {
        console.error('Failed to build public booking options:', err);
        return res.status(500).json({ error: 'Booking options failed.', details: err.message });
    }
});

app.post('/api/v1/admin/booking-options', async (req, res) => {
    const { check_in, check_out, guests = 1 } = req.body || {};

    if (!check_in || !check_out) {
        return res.status(400).json({ error: 'check_in and check_out are required.' });
    }

    try {
        const nights = computeStayNights(check_in, check_out);
        const allUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out, includeBlocked: true });
        const availableUnits = allUnits.filter((unit) => !unit.blocked_booking);
        const unavailableUnits = allUnits.filter((unit) => unit.blocked_booking);
        const serializeUnitOption = (unit) => ({
            unit_id: unit.unit_id,
            unit_label: unit.unit_label || unit.unit_id,
            room_type_id: unit.room_type_id,
            room_type: unit.room_type,
            marketing_name: unit.marketing_name || unit.room_type,
            nightly_rate: Number(unit.nightly_rate || unit.price || 0),
            standard_max_pax: Number(unit.base_max_pax || 0),
            absolute_max_pax: Number(unit.absolute_max_pax || 0),
            extra_pax_allowed: Boolean(unit.extra_pax_allowed),
            extra_pax_rate: Number(unit.extra_pax_rate || 0),
            fits_requested_pax: Number(guests || 1) <= Number(unit.absolute_max_pax || 0),
            is_available: !unit.blocked_booking,
            unavailable_reason: unit.blocked_booking ? 'Booked for selected dates' : null,
            blocked_booking: unit.blocked_booking ? {
                booking_ref: unit.blocked_booking.booking_ref,
                full_name: unit.blocked_booking.full_name || unit.blocked_booking.guest_name || '',
                guest_name: unit.blocked_booking.guest_name || unit.blocked_booking.full_name || '',
                check_in: unit.blocked_booking.check_in,
                check_out: unit.blocked_booking.check_out,
                status: unit.blocked_booking.status
            } : null
        });

        return res.json({
            criteria: {
                check_in,
                check_out,
                guests: Number(guests || 1),
                nights
            },
            available_units: availableUnits.map(serializeUnitOption),
            unavailable_units: unavailableUnits.map(serializeUnitOption),
            all_units: allUnits.map(serializeUnitOption)
        });
    } catch (err) {
        console.error('Failed to build admin booking options:', err);
        return res.status(500).json({ error: 'Admin booking options failed.', details: err.message });
    }
});

app.post('/api/v1/public/recommendations', requireGuestPortalEnabled, async (req, res) => {
    const { check_in, check_out, guests, room_type = null, max_suggestions = 4 } = req.body || {};

    if (!check_in || !check_out || Number(guests || 0) <= 0) {
        return res.status(400).json({ error: 'check_in, check_out, and guests are required.' });
    }

    try {
        const nights = computeStayNights(check_in, check_out);
        const availableUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out });
        const suggestions = buildDeskSuggestions(
            room_type
                ? availableUnits.filter((unit) => normalizeRoomKey(unit.room_type) === normalizeRoomKey(room_type))
                : availableUnits,
            Number(guests),
            nights,
            {
                mode: 'combo',
                maxSuggestions: Math.max(1, Math.min(Number(max_suggestions || 4), 8))
            }
        );

        return res.json({
            criteria: {
                check_in,
                check_out,
                guests: Number(guests),
                nights,
                room_type: room_type || null
            },
            suggestions
        });
    } catch (err) {
        console.error('Failed to build public booking recommendations:', err);
        return res.status(500).json({ error: 'Recommendation generation failed.', details: err.message });
    }
});

app.post('/api/v1/public/quote', requireGuestPortalEnabled, async (req, res) => {
    const { check_in, check_out, guests, unit_ids = [] } = req.body || {};

    if (!check_in || !check_out || Number(guests || 0) <= 0 || !Array.isArray(unit_ids) || unit_ids.length === 0) {
        return res.status(400).json({ error: 'check_in, check_out, guests, and unit_ids are required.' });
    }

    try {
        const nights = computeStayNights(check_in, check_out);
        const requestedUnitIds = [...new Set(unit_ids.map((value) => String(value || '').trim()).filter(Boolean))];
        const availableUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out });
        const availableById = new Map(availableUnits.map((unit) => [unit.unit_id, unit]));
        const selectedUnits = requestedUnitIds.map((unitId) => availableById.get(unitId)).filter(Boolean);
        const unavailableUnitIds = requestedUnitIds.filter((unitId) => !availableById.has(unitId));

        if (unavailableUnitIds.length > 0) {
            return res.status(409).json({
                error: `The following unit(s) are not available for the selected dates: ${unavailableUnitIds.join(', ')}`,
                unavailable_unit_ids: unavailableUnitIds
            });
        }

        const quote = quoteDeskSelection(selectedUnits, Number(guests), nights, { preserveAllUnits: true });
        return res.json({
            criteria: {
                check_in,
                check_out,
                guests: Number(guests),
                nights,
                unit_ids: requestedUnitIds
            },
            quote
        });
    } catch (err) {
        const statusCode = /accommodate|short by|at least/i.test(err.message) ? 400 : 500;
        console.error('Failed to build public quote:', err);
        return res.status(statusCode).json({ error: err.message || 'Quote generation failed.' });
    }
});

// API Routes
app.get('/api/v1/public/rooms', requireGuestPortalEnabled, (req, res) => {
    // Exclude null-price duplicates (e.g. stale Owner's Villa entry)
    db.all("SELECT * FROM rooms WHERE price IS NOT NULL ORDER BY price ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ rooms: rows || [] });
    });
});

app.get('/api/v1/public/knowledge', async (req, res) => {
    try {
        res.json(await loadEffectivePublicKnowledgeBaseJson());
    } catch (error) {
        res.status(500).json({ error: 'Failed to load central knowledge base.', details: error.message });
    }
});

// Ã°Å¸ÂÂÃ¯Â¸Â CHATBOT: Real-Time Availability Check (with per-unit breakdown)
app.get('/api/v1/public/availability', requireGuestPortalEnabled, (req, res) => {
    const { check_in, check_out } = req.query;
    if (!check_in || !check_out) {
        return res.status(400).json({ error: 'check_in and check_out are required (YYYY-MM-DD)' });
    }

    // Get all bookable room types
    const roomsQuery = `SELECT room_type, price, total_units, marketing_name FROM rooms WHERE price IS NOT NULL GROUP BY room_type ORDER BY price ASC`;

    db.all(roomsQuery, [], (err, rooms) => {
        if (err) return res.status(500).json({ error: err.message });

        // Get all units
        const unitsQuery = `
            SELECT
                u.unit_id,
                u.room_type_id,
                u.unit_label,
                r.room_type
            FROM units u
            LEFT JOIN rooms r ON r.id = u.room_type_id
            WHERE COALESCE(u.unit_status, 'Available') != 'Maintenance'
            ORDER BY u.unit_id
        `;
        db.all(unitsQuery, [], (err1, allUnits) => {
            if (err1) return res.status(500).json({ error: err1.message });

            // Get all legacy bookings overlapping the requested date range
            const bookedQuery = `
                SELECT unit_id, room_type, full_name, booking_ref, check_in, check_out
                FROM bookings
                WHERE unit_id IS NOT NULL
                  AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                  AND check_in < ? AND check_out > ?
            `;

            db.all(bookedQuery, [check_out, check_in], (err2, legacyBookedRows) => {
                if (err2) return res.status(500).json({ error: err2.message });

                const transactionBookedQuery = `
                    SELECT
                        bi.unit_id,
                        bi.room_type,
                        h.guest_name as full_name,
                        h.booking_reference as booking_ref,
                        bi.check_in,
                        bi.check_out
                    FROM booking_items bi
                    JOIN booking_headers h ON h.booking_reference = bi.booking_reference
                    WHERE bi.unit_id IS NOT NULL
                      AND h.status IN (${quoteSqlStrings(ACTIVE_HEADER_STATUSES)})
                      AND bi.status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
                      AND bi.check_in < ? AND bi.check_out > ?
                `;

                db.all(transactionBookedQuery, [check_out, check_in], (err3, transactionBookedRows) => {
                    if (err3) return res.status(500).json({ error: err3.message });

                    db.all(`
                        SELECT unit_id, tag_type, start_date, end_date, note
                        FROM unit_date_tags
                        WHERE blocks_inventory = 1
                          AND start_date < ? AND end_date > ?
                    `, [check_out, check_in], (err4, dateTagRows = []) => {
                        if (err4) return res.status(500).json({ error: err4.message });

                        const bookedRows = [...legacyBookedRows, ...transactionBookedRows];

                        const availability = rooms.map(room => {
                            const rKey = normalizeRoomKey(room.room_type);
                            
                            // Cross-ref with physical units found (Hardening: don't promise more than we have rows for)
                            const roomUnits = allUnits.filter((u) => {
                                const unitRoomKey = normalizeRoomKey(u.room_type || u.room_type_id);
                                return unitRoomKey === rKey;
                            });
                            const bookedCount = roomUnits.filter((unit) =>
                                bookedRows.some((booking) => booking.unit_id === unit.unit_id)
                                || dateTagRows.some((tag) => tag.unit_id === unit.unit_id)
                            ).length;
                            
                            // Use the safe minimum between room definition and unit rows
                            const actualTotal = Math.min(room.total_units || 0, roomUnits.length);
                            const availableUnits = Math.max(0, actualTotal - bookedCount);

                            const unitDetails = roomUnits.map(u => {
                                const booking = bookedRows.find(b => b.unit_id === u.unit_id);
                                const dateTag = dateTagRows.find(tag => tag.unit_id === u.unit_id);
                                return {
                                    unit_id: u.unit_id,
                                    label: u.unit_label || u.unit_id,
                                    status: booking || dateTag ? 'BOOKED' : 'AVAILABLE',
                                    ...(booking ? {
                                        guest: booking.full_name,
                                        ref: booking.booking_ref,
                                        booked_from: booking.check_in,
                                        booked_to: booking.check_out,
                                    } : {}),
                                    ...(!booking && dateTag ? {
                                        guest: dateTag.note || dateTag.tag_type,
                                        ref: `DATE-TAG-${u.unit_id}`,
                                        booked_from: dateTag.start_date,
                                        booked_to: dateTag.end_date,
                                    } : {}),
                                };
                            });

                            return {
                                room_type: room.room_type,
                                marketing_name: room.marketing_name,
                                price: room.price,
                                total_units: actualTotal,
                                booked_units: bookedCount,
                                available_units: availableUnits,
                                is_available: availableUnits > 0,
                                units: unitDetails,
                            };
                        });

                        res.json({ check_in, check_out, availability });
                    });
                });
            });
        });
    });
});

app.post('/api/v1/public/book', requireGuestPortalEnabled, async (req, res) => {
    const {
        room_type, check_in, check_out, guests, requested_units, unit_ids = [], full_name, email, phone,
        total_price, balance, honey_trap, receipt_token, transaction_type = 'deposit', payment_method = 'GCASH'
    } = req.body;
    const kb = loadKnowledgeBaseJson();
    const roomCapacity = getAccommodationCapacity(kb, { roomType: room_type });
    const guestCount = Number(guests || 0);
    const requestedUnits = Math.max(1, Number.parseInt(requested_units, 10) || 1);
    const requestedUnitIds = Array.isArray(unit_ids)
        ? [...new Set(unit_ids.map((value) => String(value || '').trim()).filter(Boolean))]
        : [];

    // Ã°Å¸â€ºÂ¡Ã¯Â¸Â Invisible Honeypot Security Check
    // If 'honey_trap' is filled, it's definitely a bot (field is hidden from humans).
    if (honey_trap) {
        console.warn(`[${new Date().toISOString()}] Ã°Å¸Å¡Â¨ Bot activity detected from IP: ${req.ip}`);
        return res.status(200).json({ booking_ref: `B-BOT-${Math.random().toString(36).substr(2, 4).toUpperCase()}` }); // Silently drop
    }

    // Ã°Å¸â€ºÂ¡Ã¯Â¸Â Pre-Flight Mandatory Check
    if (!full_name || !room_type || !check_in || !check_out) {
        return res.status(400).json({ error: 'Missing mandatory booking fields (Name, Room, Dates).' });
    }

    if (!roomCapacity && requestedUnitIds.length === 0) {
        return res.status(400).json({ error: `Room type "${room_type}" was not found or is currently unavailable.` });
    }

    if (!Number.isFinite(guestCount) || guestCount < 1) {
        return res.status(400).json({ error: 'Guest count must be at least 1.' });
    }

    if (!Number.isFinite(requestedUnits) || requestedUnits < 1) {
        return res.status(400).json({ error: 'Requested unit count must be at least 1.' });
    }

    if (requestedUnits > 1 && guestCount < requestedUnits) {
        return res.status(400).json({ error: `Please assign at least 1 guest per selected unit. ${requestedUnits} unit(s) require at least ${requestedUnits} guest(s).` });
    }

    if (await shouldEnforceHolidayMinimumStay(kb)) {
        const holidayViolation = getHolidayMinimumStayViolation({
            checkIn: check_in,
            checkOut: check_out,
            bookingType: 'overnight',
            kb,
        });
        if (holidayViolation) {
            return res.status(400).json({ error: buildHolidayMinimumStayMessage(holidayViolation) });
        }
    }

    const expectedPaymentAmount = getExpectedGuestPaymentAmount(total_price, balance);
    if (!expectedPaymentAmount) {
        return res.status(400).json({ error: 'Guest bookings require at least a 50% downpayment before inventory can be held.' });
    }

    if (!receipt_token) {
        return res.status(400).json({ error: 'Payment proof is required before a guest booking can hold inventory.' });
    }

    // Ã°Å¸â€ºÂ¡Ã¯Â¸Â Server-Side Integrity Guards: prevent double-bookings and over-capacity
    const integrityCheck = `
        SELECT 
            r.total_units,
            r.features,
            ? as max_capacity_pax,
            COUNT(b.booking_ref) as booked_count
        FROM rooms r
        LEFT JOIN bookings b 
            ON b.room_type = r.room_type
            AND b.status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
            AND b.check_in < ? AND b.check_out > ?
        WHERE r.room_type = ?
        GROUP BY r.room_type
    `;

    db.get(integrityCheck, [roomCapacity.absolute_max_pax, check_out, check_in, room_type], async (err, row) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Integrity check failed:`, err);
            return res.status(500).json({ error: 'System integrity check failed.' });
        }

        // Ã°Å¸â€ºÂ¡Ã¯Â¸Â Fail-Closed: If room type doesn't exist or query failed to find it, reject.
        if (!row) {
            console.warn(`[${new Date().toISOString()}] Room type found was 0 or null for: ${room_type}`);
            return res.status(400).json({
                error: `Ã¢â€ºâ€ Room type "${room_type}" was not found or is currently unavailable.`
            });
        }

        const availableUnits = requestedUnitIds.length > 0
            ? await listDeskAvailability({ checkIn: check_in, checkOut: check_out })
            : await listDeskAvailability({ checkIn: check_in, checkOut: check_out, roomType: room_type });

        if (requestedUnitIds.length > 0) {
            try {
                const availableById = new Map(availableUnits.map((unit) => [unit.unit_id, unit]));
                const selectedUnits = requestedUnitIds.map((unitId) => availableById.get(unitId)).filter(Boolean);
                const unavailableUnitIds = requestedUnitIds.filter((unitId) => !availableById.has(unitId));

                if (unavailableUnitIds.length > 0) {
                    return res.status(409).json({
                        error: `The following unit(s) are not available for the selected dates: ${unavailableUnitIds.join(', ')}`
                    });
                }

                if (selectedUnits.length === 1) {
                    const selectedUnit = selectedUnits[0];
                    const selectedCapacity = Number(selectedUnit.absolute_max_pax || 0);
                    if (guestCount > selectedCapacity) {
                        return res.status(409).json({
                            error: `${selectedUnit.unit_label || selectedUnit.unit_id} can only accommodate ${selectedCapacity} guest(s).`
                        });
                    }

                    const legacyRoomType = selectedUnit.room_type || room_type;
                    const prefixMap = { 'Amalfi Suite': 'AMS', 'Positano Vista': 'POS', 'Ravello Suite': 'RAV', 'Capri Vista': 'CAP', 'Sirenuse Suite': 'SIR', 'Sunset Pavilion': 'SUN' };
                    const unitCode = prefixMap[legacyRoomType] || legacyRoomType.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3);
                    const booking_ref = `${unitCode}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
                    const quote = quoteDeskSelection([selectedUnit], guestCount, computeStayNights(check_in, check_out), {
                        preserveAllUnits: true
                    });
                    const branchExpectedPaymentAmount = getExpectedGuestPaymentAmount(quote.total_amount, balance);
                    if (!branchExpectedPaymentAmount) {
                        return res.status(400).json({ error: 'Guest bookings require at least a 50% downpayment before inventory can be held.' });
                    }

                    const receiptPrecheck = consumeGuestBookingReceiptPrecheck({
                        receiptToken: receipt_token,
                        expectedAmount: branchExpectedPaymentAmount
                    });

                    await dbRunAsync(
                        `INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, booking_mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_VERIFICATION')`,
                        [booking_ref, legacyRoomType, selectedUnit.unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, BOOKING_MODE_STANDARD]
                    );
                    await recordLegacyGuestReceiptPrecheck({ bookingRef: booking_ref, precheck: receiptPrecheck, transactionType: transaction_type, paymentMethod: payment_method });
                    logAction('create_booking', 'booking', booking_ref, `Guest: ${full_name} (Assigned: ${selectedUnit.unit_id})`, 'public_portal', req.ip);
                    return res.status(201).json({ booking_ref, status: 'PENDING_VERIFICATION', receipt_uploaded: true });
                }

                if (guestCount < selectedUnits.length) {
                    return res.status(400).json({
                        error: `Please assign at least 1 guest per selected unit. ${selectedUnits.length} unit(s) require at least ${selectedUnits.length} guest(s).`
                    });
                }

                const quote = quoteDeskSelection(selectedUnits, guestCount, computeStayNights(check_in, check_out), {
                    preserveAllUnits: true
                });
                const branchExpectedPaymentAmount = getExpectedGuestPaymentAmount(quote.total_amount, balance);
                if (!branchExpectedPaymentAmount) {
                    return res.status(400).json({ error: 'Guest bookings require at least a 50% downpayment before inventory can be held.' });
                }
                const roomLabel = [...new Set(selectedUnits.map((unit) => unit.room_type).filter(Boolean))].join(' + ');
                const receiptPrecheck = consumeGuestBookingReceiptPrecheck({
                    receiptToken: receipt_token,
                    expectedAmount: branchExpectedPaymentAmount
                });
                const created = await createHeaderWithItems({
                    header: {
                        guest_name: full_name,
                        email,
                        phone,
                        check_in,
                        check_out,
                        lodging_total: quote.total_amount,
                        status: 'PENDING_VERIFICATION',
                        booking_source: 'Guest Portal',
                        booking_mode: BOOKING_MODE_STANDARD,
                        created_by: 'guest',
                        notes: `Guest portal selected-unit booking for ${roomLabel || room_type || 'custom stay'}`
                    },
                    items: (quote.quoted_units || []).map((unit, index) => ({
                        unit_id: unit.unit_id,
                        room_type: unit.room_type || room_type,
                        check_in,
                        check_out,
                        guest_count: unit.assigned_guests,
                        lodging_subtotal: unit.total_amount,
                        status: BOOKING_STATUS_PENDING_VERIFICATION,
                        sequence_no: index + 1
                    }))
                });
                await recordHeaderGuestReceiptPrecheck({ bookingRef: created.header.booking_reference, precheck: receiptPrecheck, transactionType: transaction_type, paymentMethod: payment_method });

                logAction('create_transaction_booking', 'booking_header', created.header.booking_reference, `Guest: ${full_name} | Selected Units: ${requestedUnitIds.join(', ')}`, 'public_portal', req.ip);
                return res.status(201).json({
                    booking_ref: created.header.booking_reference,
                    status: 'PENDING_VERIFICATION',
                    receipt_uploaded: true,
                    booking_mode: 'TRANSACTION',
                    items_count: created.items.length,
                    selected_units: requestedUnitIds
                });
            } catch (selectedUnitErr) {
                console.error(`[${new Date().toISOString()}] Selected-unit guest booking failed:`, selectedUnitErr);
                const statusCode = /receipt|payment proof|downpayment|precheck/i.test(selectedUnitErr.message)
                    ? 400
                    : /available|accommodate|at least/i.test(selectedUnitErr.message) ? 409 : 500;
                return res.status(statusCode).json({ error: selectedUnitErr.message || 'Selected-unit booking failed.' });
            }
        }

        const requiresMultiUnitFlow = requestedUnits > 1 || guestCount > Number(roomCapacity.absolute_max_pax || 0);

        if (requiresMultiUnitFlow) {
            try {
                const totalAbsoluteCapacity = availableUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0);
                const minimumUnitsNeeded = Math.max(1, Math.ceil(guestCount / Math.max(1, Number(roomCapacity.absolute_max_pax || 0))));
                const targetUnitCount = Math.max(requestedUnits, minimumUnitsNeeded);

                if (targetUnitCount > availableUnits.length) {
                    return res.status(409).json({
                        error: `${room_type} only has ${availableUnits.length} unit(s) available for the selected dates.`
                    });
                }

                if (guestCount > totalAbsoluteCapacity) {
                    return res.status(409).json({
                        error: `${room_type} does not have enough remaining units for ${guestCount} guests on the selected dates.`
                    });
                }

                const selectedUnits = availableUnits.slice(0, targetUnitCount);
                const quote = quoteDeskSelection(selectedUnits, guestCount, computeStayNights(check_in, check_out), {
                    preserveAllUnits: requestedUnits > 1
                });
                const branchExpectedPaymentAmount = getExpectedGuestPaymentAmount(quote.total_amount, balance);
                if (!branchExpectedPaymentAmount) {
                    return res.status(400).json({ error: 'Guest bookings require at least a 50% downpayment before inventory can be held.' });
                }
                const receiptPrecheck = consumeGuestBookingReceiptPrecheck({
                    receiptToken: receipt_token,
                    expectedAmount: branchExpectedPaymentAmount
                });
                const created = await createHeaderWithItems({
                    header: {
                        guest_name: full_name,
                        email,
                        phone,
                        check_in,
                        check_out,
                        lodging_total: quote.total_amount,
                        status: 'PENDING_VERIFICATION',
                        booking_source: 'Guest Portal',
                        booking_mode: BOOKING_MODE_STANDARD,
                        created_by: 'guest',
                        notes: `Guest portal multi-unit booking for ${room_type}`
                    },
                    items: (quote.quoted_units || []).map((unit, index) => ({
                        unit_id: unit.unit_id,
                        room_type: unit.room_type || room_type,
                        check_in,
                        check_out,
                        guest_count: unit.assigned_guests,
                        lodging_subtotal: unit.total_amount,
                        status: BOOKING_STATUS_PENDING_VERIFICATION,
                        sequence_no: index + 1
                    }))
                });
                await recordHeaderGuestReceiptPrecheck({ bookingRef: created.header.booking_reference, precheck: receiptPrecheck, transactionType: transaction_type, paymentMethod: payment_method });

                logAction('create_transaction_booking', 'booking_header', created.header.booking_reference, `Guest: ${full_name} | Room Type: ${room_type} | Items: ${created.items.length}`, 'public_portal', req.ip);
                return res.status(201).json({
                    booking_ref: created.header.booking_reference,
                    status: 'PENDING_VERIFICATION',
                    receipt_uploaded: true,
                    booking_mode: 'TRANSACTION',
                    items_count: created.items.length,
                    requested_units: requestedUnits
                });
            } catch (multiErr) {
                console.error(`[${new Date().toISOString()}] Multi-unit guest booking failed:`, multiErr);
                const statusCode = /receipt|payment proof|downpayment|precheck/i.test(multiErr.message) ? 400 : 500;
                return res.status(statusCode).json({ error: statusCode === 400 ? multiErr.message : 'Multi-unit booking failed.' });
            }
        }

        const available = row.total_units - (row.booked_count || 0);
        if (available <= 0 || availableUnits.length <= 0) {
            return res.status(409).json({
                error: `Ã¢â€ºâ€ ${room_type} is fully booked for your selected dates.`
            });
        }

        const prefixMap = { 'Amalfi Suite': 'AMS', 'Positano Vista': 'POS', 'Ravello Suite': 'RAV', 'Capri Vista': 'CAP', 'Sirenuse Suite': 'SIR', 'Sunset Pavilion': 'SUN' };
        const unitCode = prefixMap[room_type] || room_type.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3);
        const booking_ref = `${unitCode}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const unit_id = availableUnits[0]?.unit_id || null;

        try {
            const quote = quoteDeskSelection([availableUnits[0]], guestCount, computeStayNights(check_in, check_out), {
                preserveAllUnits: true
            });
            const branchExpectedPaymentAmount = getExpectedGuestPaymentAmount(quote.total_amount, balance);
            if (!branchExpectedPaymentAmount) {
                return res.status(400).json({ error: 'Guest bookings require at least a 50% downpayment before inventory can be held.' });
            }
            const receiptPrecheck = consumeGuestBookingReceiptPrecheck({
                receiptToken: receipt_token,
                expectedAmount: branchExpectedPaymentAmount
            });
            await dbRunAsync(
                `INSERT INTO bookings (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, booking_mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_VERIFICATION')`,
                [booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, BOOKING_MODE_STANDARD]
            );
            await recordLegacyGuestReceiptPrecheck({ bookingRef: booking_ref, precheck: receiptPrecheck, transactionType: transaction_type, paymentMethod: payment_method });
            logAction('create_booking', 'booking', booking_ref, `Guest: ${full_name} (Assigned: ${unit_id || 'NONE'})`, 'public_portal', req.ip);
            res.status(201).json({ booking_ref, status: 'PENDING_VERIFICATION', receipt_uploaded: true });
        } catch (insertErr) {
            console.error(`[${new Date().toISOString()}] Booking insert failed:`, insertErr);
            const statusCode = /receipt|payment proof|downpayment|precheck/i.test(insertErr.message) ? 400 : 500;
            return res.status(statusCode).json({ error: statusCode === 400 ? insertErr.message : "Booking failed to save in database." });
        }
    });
});

app.post('/api/v1/public/rebooking-request', requireGuestPortalEnabled, async (req, res) => {
    const { booking_ref, guest_name, new_check_in, new_check_out, reason } = req.body;

    if (!booking_ref || !guest_name || !new_check_in || !new_check_out || !reason) {
        return res.status(400).json({ error: 'booking_ref, guest_name, new_check_in, new_check_out, and reason are required.' });
    }

    if (new_check_in >= new_check_out) {
        return res.status(400).json({ error: 'New check-out must be after new check-in.' });
    }

    try {
        const booking = await dbGetAsync(
            `SELECT booking_ref, room_type, unit_id, guests, full_name, check_in, check_out, status FROM bookings WHERE booking_ref = ?`,
            [booking_ref]
        );
        if (!booking) return res.status(404).json({ error: 'Booking reference not found.' });

        const bookingName = (booking.full_name || '').trim().toLowerCase();
        const requesterName = guest_name.trim().toLowerCase();
        if (bookingName && requesterName && bookingName !== requesterName) {
            return res.status(400).json({ error: 'Guest name does not match the booking record.' });
        }

        if (!isBookingRebookableStatus(booking.status)) {
            return res.status(400).json({ error: 'Rebooking is available only after payment verification is approved.' });
        }

        if (!isRebookingEligible(booking.check_in)) {
            return res.status(400).json({ error: 'Rebooking is only allowed for requests made 7 days or more before arrival.' });
        }

        if (booking.unit_id && booking.status !== 'CANCELLED' && booking.status !== 'REJECTED') {
            const availability = await analyzeRebookingTargetAvailability({
                booking,
                newCheckIn: new_check_in,
                newCheckOut: new_check_out
            });
            if (availability.conflict) {
                return res.status(409).json({
                    error: `The assigned unit ${booking.unit_id} is already booked for the requested dates.`,
                    conflicting_unit_id: booking.unit_id,
                    conflicting_booking: {
                        booking_ref: availability.conflict.booking_ref,
                        full_name: availability.conflict.full_name || availability.conflict.guest_name || '',
                        check_in: availability.conflict.check_in,
                        check_out: availability.conflict.check_out,
                        status: availability.conflict.status
                    },
                    suggested_units: availability.suggestedUnits
                });
            }
        }

        await dbRunAsync(
            `INSERT INTO rebookings (booking_ref, old_check_in, old_check_out, new_check_in, new_check_out, reason)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [booking_ref, booking.check_in, booking.check_out, new_check_in, new_check_out, `Guest Request: ${reason}`]
        );
        logAction('guest_rebooking_request', 'booking', booking_ref, `Requested rebooking ${booking.check_in}->${new_check_in} / ${booking.check_out}->${new_check_out} | Reason: ${reason}`, guest_name);
        res.json({ message: 'Rebooking request submitted. Our team will review the new dates subject to availability.' });
    } catch (err) {
        console.error('Guest rebooking request failed:', err);
        return res.status(500).json({ error: err.message || 'Failed to process rebooking request.' });
    }
});

app.post('/api/v1/public/refund-claim', requireGuestPortalEnabled, (req, res) => {
    const { booking_ref, guest_name, amount, reason, platform, account_number } = req.body || {};

    if (!booking_ref || !guest_name || !account_number) {
        return res.status(400).json({ error: 'booking_ref, guest_name, and account_number are required.' });
    }

    db.get(`SELECT booking_ref, full_name, total_price, balance, status FROM bookings WHERE booking_ref = ?`, [booking_ref], (err, booking) => {
        if (err) return res.status(500).json({ error: 'Failed to verify booking.' });
        if (!booking) return res.status(404).json({ error: 'Booking reference not found.' });

        const bookingName = (booking.full_name || '').trim().toLowerCase();
        const requesterName = String(guest_name || '').trim().toLowerCase();
        if (bookingName && requesterName && bookingName !== requesterName) {
            return res.status(400).json({ error: 'Guest name does not match the booking record.' });
        }

        const amountText = amount ? ` | Claimed amount: ${amount}` : '';
        const details = [
            `Refund claim received via Guest Hub${amountText}`,
            `Platform: ${platform || 'Not specified'}`,
            `Account/details: ${account_number}`,
            `Reason: ${reason || 'Not provided'}`,
            `Booking status: ${booking.status || 'UNKNOWN'}`,
            `Balance: ${booking.balance ?? 'UNKNOWN'}`
        ].join(' | ');

        logAction('guest_refund_claim', 'booking', booking_ref, details, guest_name, req.ip);
        return res.json({ message: 'Refund claim submitted. Our team will review it before any payment action is taken.' });
    });
});


// Ã¢â€â‚¬Ã¢â€â‚¬ Special Availability Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/v1/public/special-availability', requireGuestPortalEnabled, (req, res) => {
    const { type, date, check_in, check_out } = req.query;
    if (!type) return res.status(400).json({ error: 'type required.' });

    const kb       = loadKnowledgeBaseJson();
    const typeData = kb.special_bookings?.[type];
    if (!typeData) return res.status(404).json({ error: `Unknown booking type: ${type}` });

    const slotsTotal = typeData.slots_available || 1;

    // tent_pitching uses date-range overlap (like rooms)
    // day_tour uses single-date exact match
    if (type === 'tent_pitching') {
        if (!check_in || !check_out)
            return res.status(400).json({ error: 'check_in and check_out required for tent_pitching.' });

        db.get(
            `SELECT COUNT(*) as booked_count FROM bookings
             WHERE booking_type = 'tent_pitching'
               AND check_in  < ?
               AND check_out > ?
               AND status NOT IN ('REJECTED','CANCELLED')`,
            [check_out, check_in],
            (err, row) => {
                if (err) return res.status(500).json({ error: 'DB error' });
                const booked = row?.booked_count || 0;
                res.json({
                    type, check_in, check_out,
                    slots_total: slotsTotal,
                    slots_booked: booked,
                    slots_available: Math.max(0, slotsTotal - booked),
                    available: (slotsTotal - booked) > 0
                });
            }
        );
    } else {
        // day_tour Ã¢â‚¬â€ single date
        if (!date) return res.status(400).json({ error: 'date required for day_tour.' });

        db.get(
            `SELECT COUNT(*) as booked_count FROM bookings
             WHERE booking_type = ? AND DATE(check_in) = ? AND status NOT IN ('REJECTED','CANCELLED')`,
            [type, date],
            (err, row) => {
                if (err) return res.status(500).json({ error: 'DB error' });
                const booked = row?.booked_count || 0;
                res.json({
                    type, date,
                    slots_total: slotsTotal,
                    slots_booked: booked,
                    slots_available: Math.max(0, slotsTotal - booked),
                    available: (slotsTotal - booked) > 0
                });
            }
        );
    }
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Special Book (day tour / tent pitching) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.post('/api/v1/public/special-book', requireGuestPortalEnabled, async (req, res) => {
    const { booking_type, date, check_in, check_out, guests,
            full_name, email, phone, total_price, balance, receipt_token,
            transaction_type = 'deposit', payment_method = 'GCASH' } = req.body;

    if (!booking_type) return res.status(400).json({ error: 'booking_type required.' });

    const ci = check_in  || date;   // tent_pitching sends check_in/check_out;
    const co = check_out || date;   // day_tour sends date (same-day visit)
    if (!ci || !co) return res.status(400).json({ error: 'Date(s) required.' });

    if (booking_type === 'tent_pitching' && (Number(guests) < 1 || Number(guests) > 2)) {
        return res.status(400).json({ error: 'Tent bookings allow 1 or 2 guests only. One booking reserves exactly one tent slot.' });
    }

    const kb       = loadKnowledgeBaseJson();
    const typeData = kb.special_bookings?.[booking_type];
    const slotsTotal = typeData?.slots_available || 1;

    if (await shouldEnforceHolidayMinimumStay(kb)) {
        const holidayViolation = getHolidayMinimumStayViolation({
            checkIn: ci,
            checkOut: co,
            bookingType: booking_type,
            kb,
        });
        if (holidayViolation) {
            return res.status(400).json({ error: buildHolidayMinimumStayMessage(holidayViolation) });
        }
    }

    const expectedPaymentAmount = getExpectedGuestPaymentAmount(total_price, balance);
    if (!expectedPaymentAmount) {
        return res.status(400).json({ error: 'Guest bookings require at least a 50% downpayment before inventory can be held.' });
    }

    if (!receipt_token) {
        return res.status(400).json({ error: 'Payment proof is required before a guest booking can hold inventory.' });
    }

    // Availability guard Ã¢â‚¬â€ branched per type
    const slotQuery = booking_type === 'tent_pitching'
        ? [`SELECT COUNT(*) as booked_count FROM bookings
             WHERE booking_type = 'tent_pitching'
               AND check_in < ? AND check_out > ?
               AND status NOT IN ('REJECTED','CANCELLED')`,
           [co, ci]]
        : [`SELECT COUNT(*) as booked_count FROM bookings
             WHERE booking_type = ? AND DATE(check_in) = ?
               AND status NOT IN ('REJECTED','CANCELLED')`,
           [booking_type, ci]];

    db.get(slotQuery[0], slotQuery[1], (err, row) => {
        if (err) return res.status(500).json({ error: 'Slot check failed.' });

        const booked = row?.booked_count || 0;
        if ((slotsTotal - booked) <= 0) {
            const label = booking_type.replace(/_/g, ' ');
            return res.status(409).json({ error: `${label} is fully booked for the selected date(s).` });
        }

        const prefixMap = { day_tour: 'DTR', tent_pitching: 'TPC' };
        const prefix = prefixMap[booking_type] || booking_type.substring(0, 3).toUpperCase();
        const booking_ref = `${prefix}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        let receiptPrecheck;
        try {
            receiptPrecheck = consumeGuestBookingReceiptPrecheck({
                receiptToken: receipt_token,
                expectedAmount: expectedPaymentAmount
            });
        } catch (precheckErr) {
            return res.status(400).json({ error: precheckErr.message });
        }

        db.run(
            `INSERT INTO bookings
             (booking_ref, room_type, booking_type, check_in, check_out, guests,
              full_name, email, phone, total_price, balance, booking_mode, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_VERIFICATION')`,
            [booking_ref, booking_type, booking_type, ci, co,
             guests, full_name, email, phone, total_price, balance, BOOKING_MODE_STANDARD],
            async function(err) {
                if (err) return res.status(500).json({ error: 'Special booking failed.' });
                try {
                    await recordLegacyGuestReceiptPrecheck({ bookingRef: booking_ref, precheck: receiptPrecheck, transactionType: transaction_type, paymentMethod: payment_method });
                } catch (paymentErr) {
                    await dbRunAsync(`UPDATE bookings SET status = 'PAYMENT_REJECTED' WHERE booking_ref = ?`, [booking_ref]).catch(() => {});
                    return res.status(500).json({ error: 'Receipt payment record failed.' });
                }
                logAction('create_special_booking', 'booking', booking_ref,
                    `Type: ${booking_type} | Guest: ${full_name} | In: ${ci} | Out: ${co} | Pax: ${guests}`,
                    'public_portal');
                res.status(200).json({ booking_ref, status: 'PENDING_VERIFICATION', receipt_uploaded: true });
            }
        );
    });
});

app.post('/api/v1/public/precheck/receipt', requireGuestPortalEnabled, receiptUploadLimiter, upload.single('file'), async (req, res) => {
    const { amount, transaction_type, payment_method } = req.body;
    if (!req.file) return res.status(400).json({ error: "Cloudinary upload failed." });
    const cloudUrl = req.file.path;
    const receiptCheck = await classifyReceiptImageWithAI(cloudUrl, { expectedAmount: amount });
    console.log(`[RECEIPT_PRECHECK] booking=pending amount=${amount || 'n/a'} class=${receiptCheck.classification} method=${receiptCheck.payment_method} verified=${receiptCheck.verified} rejected=${receiptCheck.rejected} confidence=${receiptCheck.confidence} reason="${receiptCheck.reason || ''}"`);

    if (receiptCheck.rejected) {
        return res.status(422).json({
            error: buildReceiptUploadError(receiptCheck),
            receipt_check: receiptCheck
        });
    }

    const receiptToken = rememberReceiptPrecheck({
        cloudUrl,
        receiptCheck,
        amount,
        transactionType: transaction_type,
        paymentMethod: payment_method
    });
    return res.status(200).json({
        message: 'Receipt accepted. You may continue with booking.',
        receipt_token: receiptToken,
        receipt_check: receiptCheck
    });
});

app.post('/api/v1/admin/chatbot-receipt-review/analyze', async (req, res) => {
    const imageUrl = String(req.body?.image_url || '').trim();
    const expectedAmount = req.body?.expected_amount || req.body?.amount || null;
    if (!/^https?:\/\//i.test(imageUrl)) {
        return res.status(400).json({ error: 'A valid receipt image URL is required.' });
    }

    try {
        const receiptCheck = await classifyReceiptImageWithAI(imageUrl, { expectedAmount });
        const classification = String(receiptCheck.classification || '').toLowerCase();
        const recommendation = receiptCheck.verified
            ? 'Likely payment receipt. Compare amount/reference against the booking payment record before using admin verification.'
            : classification.includes('acknowledgement')
                ? 'Booking acknowledgement only. Ask the guest for the actual GCash, bank, or transfer receipt.'
                : 'Manual review needed. Ask for a clearer payment receipt if amount or reference is missing.';

        return res.json({
            analysis_only: true,
            mutates_financials: false,
            creates_receipt_token: false,
            receipt_check: receiptCheck,
            recommendation
        });
    } catch (err) {
        console.error('Chatbot receipt review analysis failed:', err);
        return res.status(500).json({ error: 'Could not analyze receipt image.' });
    }
});

app.post('/api/v1/public/upload/receipt', requireGuestPortalEnabled, receiptUploadLimiter, upload.single('file'), async (req, res) => {
    const { booking_ref, amount, transaction_type, payment_method, receipt_token } = req.body;
    let cloudUrl = req.file?.path || null;
    let receiptCheck = null;

    if (receipt_token) {
        const precheck = consumeReceiptPrecheck(receipt_token);
        if (!precheck) {
            return res.status(400).json({ error: 'Receipt precheck expired. Please upload a valid payment receipt again before submitting the booking.' });
        }
        cloudUrl = precheck.cloudUrl;
        receiptCheck = precheck.receiptCheck;
    } else {
        if (!req.file) return res.status(400).json({ error: "Please upload a valid payment receipt before submitting the booking." });
        receiptCheck = await classifyReceiptImageWithAI(cloudUrl, { expectedAmount: amount });
        console.log(`[RECEIPT_UPLOAD] booking=${booking_ref || 'unknown'} amount=${amount || 'n/a'} class=${receiptCheck.classification} method=${receiptCheck.payment_method} verified=${receiptCheck.verified} rejected=${receiptCheck.rejected} confidence=${receiptCheck.confidence} reason="${receiptCheck.reason || ''}"`);

        if (receiptCheck.rejected) {
            return res.status(422).json({
                error: buildReceiptUploadError(receiptCheck),
                receipt_check: receiptCheck
            });
        }
    }

    try {
        const legacyBooking = await dbGetAsync(`SELECT booking_ref FROM bookings WHERE booking_ref = ?`, [booking_ref]);
        const transactionBooking = legacyBooking
            ? null
            : await dbGetAsync(`SELECT booking_reference FROM booking_headers WHERE booking_reference = ?`, [booking_ref]);

        if (legacyBooking) {
            await dbRunAsync(
                `INSERT INTO transactions (booking_ref, amount, transaction_type, receipt_path) VALUES (?, ?, ?, ?)`,
                [booking_ref, amount, transaction_type, cloudUrl]
            );
            await dbRunAsync(`UPDATE bookings SET status = 'PENDING_VERIFICATION' WHERE booking_ref = ?`, [booking_ref]);
        } else if (transactionBooking) {
            await recordPayment({
                booking_reference: booking_ref,
                amount,
                payment_type: transaction_type === 'full payment' ? 'Full Payment' : 'deposit',
                payment_method,
                receipt_url: cloudUrl,
                verification_status: 'PENDING_VERIFICATION',
                notes: `Guest portal receipt upload | AI first-layer: ${receiptCheck.classification} (${Math.round(Number(receiptCheck.confidence || 0) * 100)}%)`
            });
            await dbRunAsync(`UPDATE booking_headers SET status = 'PENDING_VERIFICATION' WHERE booking_reference = ?`, [booking_ref]);
        } else {
            return res.status(404).json({ error: 'Booking reference not found.' });
        }

        logAction('upload_receipt', 'cloud', booking_ref, `Amount: ${amount} | Type: ${transaction_type} | AI: ${receiptCheck.classification}`, 'public_portal');
        return res.status(200).json({ message: "Receipt uploaded successfully.", receipt_check: receiptCheck });
    } catch (err) {
        console.error('Guest receipt upload failed:', err);
        return res.status(500).json({ error: "Status update failed" });
    }
});

// Admin API: Special Bookings (Day Tours + Tent Pitching)
app.get('/api/v1/admin/special-bookings', (req, res) => {
    db.all(
        `SELECT b.*,
                COALESCE(SUM(CASE WHEN COALESCE(t.status,'PENDING_VERIFICATION') != 'REJECTED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_paid
         FROM bookings b
         LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
         WHERE b.booking_type IN ('day_tour','tent_pitching')
         GROUP BY b.booking_ref
         ORDER BY b.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ special_bookings: rows || [] });
        }
    );
});
// Admin API: Current Ledger (All Bookings with Financial Status)
app.get('/api/v1/admin/ledger', (req, res) => {
    // ðŸ” EMERGENCY TRACE: identify active database
    console.log(`[HUB_SYNC_AUDIT] Fetching ledger. Active DB file: ${dbFile}`);
    Promise.all([listLegacyLedgerRows(), listTransactionLedgerRows()])
        .then(([legacyRows, transactionRows]) => {
            const ledger = [...legacyRows, ...transactionRows].sort((a, b) => {
                const left = String(a.recorded_at || a.created_at || '');
                const right = String(b.recorded_at || b.created_at || '');
                if (left !== right) return right.localeCompare(left);
                return String(b.booking_ref || '').localeCompare(String(a.booking_ref || ''));
            });
            res.json({ ledger });
        })
        .catch((err) => {
            console.error('[HUB_SYNC_ERROR] Ledger query failed:', err.message);
            return res.status(500).json({ error: err.message });
        });
    return;

    const query = `
        SELECT
            b.*,
            b.rowid as internal_id,
            COALESCE(b.created_at, date('now')) as recorded_at,
            u.unit_label,
            CASE
                WHEN COUNT(CASE
                    WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED'
                     AND t.transaction_type != 'addon'
                    THEN 1
                END) > 0
                    THEN COALESCE(SUM(CASE
                        WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED'
                         AND t.transaction_type != 'addon'
                        THEN t.amount
                        ELSE 0
                    END), 0)
                ELSE COALESCE(b.amount_paid, 0)
            END as amount_paid,
            COALESCE(SUM(CASE
                WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED'
                 AND t.transaction_type = 'refund'
                THEN t.amount
                ELSE 0
            END), 0) as amount_refunded
        FROM bookings b
        LEFT JOIN units u ON b.unit_id = u.unit_id
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.is_deleted = 0
          AND b.status IN (${quoteSqlStrings(LEDGER_BOOKING_STATUSES)})
        GROUP BY b.booking_ref
        ORDER BY
            datetime(COALESCE(b.created_at, CURRENT_TIMESTAMP)) DESC,
            b.rowid DESC
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('[HUB_SYNC_ERROR] Ledger query failed:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ ledger: rows || [] });
    });
});

// Admin API: Global Refunds Audit Trail
app.get('/api/v1/admin/financials/refunds', (req, res) => {
    const query = `
        SELECT 
            t.id, t.booking_ref, t.amount, t.notes, t.created_at, t.status, t.payment_method,
            b.full_name as guest_name
        FROM transactions t
        LEFT JOIN bookings b ON t.booking_ref = b.booking_ref
        WHERE t.transaction_type = 'refund'
        ORDER BY t.created_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Audit retrieval failure: ' + err.message });
        res.json({ refunds: rows || [] });
    });
});

app.get('/api/v1/admin/rebookings', (req, res) => {
    const sql = `
        SELECT
            r.id,
            r.booking_ref,
            b.full_name,
            b.room_type,
            r.old_check_in,
            r.old_check_out,
            r.new_check_in,
            r.new_check_out,
            r.reason,
            r.updated_at
        FROM rebookings r
        LEFT JOIN bookings b ON b.booking_ref = r.booking_ref
        ORDER BY r.updated_at DESC, r.id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ rebookings: rows || [] });
    });
});

// Admin API: All Units (Enhanced for Dashboard)
app.get('/api/v1/admin/units', (req, res) => {
    const kb = loadKnowledgeBaseJson();
    db.all(`
        SELECT u.*, r.marketing_name, r.price as nightly_rate
        FROM units u 
        JOIN rooms r ON u.room_type_id = r.id
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const today = manilaDateKey();
        Promise.all([
            dbAllAsync(`
                SELECT booking_ref, unit_id, full_name, full_name as guest_name, check_in, check_out, status, payment_status, created_at
                FROM bookings
                WHERE unit_id IS NOT NULL
                  AND is_deleted = 0
                  AND status IN (${quoteSqlStrings(ACTIVE_BOOKING_STATUSES)})
                  AND check_in <= ? AND check_out > ?
                ORDER BY datetime(COALESCE(created_at, CURRENT_TIMESTAMP)) DESC, rowid DESC
            `, [today, today]),
            dbAllAsync(`
                SELECT
                    h.booking_reference as booking_ref,
                    bi.unit_id,
                    h.guest_name as full_name,
                    h.guest_name as guest_name,
                    bi.check_in,
                    bi.check_out,
                    h.status as status,
                    h.payment_status,
                    h.created_at
                FROM booking_items bi
                JOIN booking_headers h ON h.booking_reference = bi.booking_reference
                WHERE bi.unit_id IS NOT NULL
                  AND h.status IN (${quoteSqlStrings(ACTIVE_HEADER_STATUSES)})
                  AND bi.status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
                  AND bi.check_in <= ? AND bi.check_out > ?
                ORDER BY datetime(COALESCE(h.created_at, CURRENT_TIMESTAMP)) DESC, bi.booking_item_id DESC
            `, [today, today]),
            dbAllAsync(`
                SELECT *
                FROM unit_date_tags
                WHERE end_date >= ?
                ORDER BY start_date ASC, id DESC
            `, [today])
        ]).then(([legacyRows, transactionRows, dateTags]) => {
            const activeBookingByUnit = new Map();
            for (const booking of [...legacyRows, ...transactionRows]) {
                if (!booking.unit_id || activeBookingByUnit.has(booking.unit_id)) continue;
                activeBookingByUnit.set(booking.unit_id, {
                    booking_ref: booking.booking_ref,
                    guest_name: booking.full_name || booking.guest_name || '',
                    check_in: booking.check_in,
                    check_out: booking.check_out,
                    status: booking.status,
                    payment_status: booking.payment_status || PAYMENT_SUMMARY_PAYMENT_REVIEW
                });
            }

            const enriched = enrichUnitsWithKnowledgeBase(rows, kb).map((unit) => {
                const unitDateTags = dateTags.filter((tag) => tag.unit_id === unit.unit_id);
                const currentBlockingTag = unitDateTags.find((tag) => (
                    Number(tag.blocks_inventory) === 1 &&
                    tag.start_date <= today &&
                    tag.end_date > today
                ));
                const activeBooking = activeBookingByUnit.get(unit.unit_id) || (currentBlockingTag ? {
                    booking_ref: `UNIT-BLOCK-${currentBlockingTag.id}`,
                    guest_name: currentBlockingTag.note || currentBlockingTag.tag_type || 'Unit blocked',
                    check_in: currentBlockingTag.start_date,
                    check_out: currentBlockingTag.end_date,
                    status: 'UNIT_BLOCKED',
                    payment_status: 'Blocked',
                    record_origin: 'unit_date_tag'
                } : null);
                return {
                    ...unit,
                    available: !activeBooking,
                    active_booking: activeBooking,
                    date_tags: unitDateTags
                };
            });

            res.json({ units: enriched });
        }).catch((bookingErr) => res.status(500).json({ error: bookingErr.message }));
        return;

        db.all(`
            SELECT booking_ref, unit_id, full_name, full_name as guest_name, check_in, check_out, status, payment_status, created_at
            FROM bookings
            WHERE unit_id IS NOT NULL
              AND is_deleted = 0
              AND status IN (${quoteSqlStrings(ACTIVE_BOOKING_STATUSES)})
              AND check_in <= ? AND check_out > ?
            ORDER BY datetime(COALESCE(created_at, CURRENT_TIMESTAMP)) DESC, rowid DESC
        `, [today, today], (bookingErr, bookingRows) => {
            if (bookingErr) return res.status(500).json({ error: bookingErr.message });

            const activeBookingByUnit = new Map();
            for (const booking of bookingRows || []) {
                if (!booking.unit_id || activeBookingByUnit.has(booking.unit_id)) continue;
                activeBookingByUnit.set(booking.unit_id, {
                    booking_ref: booking.booking_ref,
                    guest_name: booking.full_name || booking.guest_name || '',
                    check_in: booking.check_in,
                    check_out: booking.check_out,
                    status: booking.status,
                    payment_status: booking.payment_status || PAYMENT_SUMMARY_PAYMENT_REVIEW
                });
            }

            // Match with KB metadata to link IDs (e.g. ac-kubo) to names (e.g. AC Kubo)
            const enriched = enrichUnitsWithKnowledgeBase(rows, kb).map((unit) => {
                const activeBooking = activeBookingByUnit.get(unit.unit_id) || null;
                return {
                    ...unit,
                    available: !activeBooking,
                    active_booking: activeBooking
                };
            });

            res.json({ units: enriched });
        });
    });
});

// Admin API: Occupancy Timeline Data (High-Fidelity)
app.get('/api/v1/admin/occupancy', (req, res) => {
    db.all(`
        SELECT u.*, r.marketing_name, r.price as nightly_rate
        FROM units u 
        JOIN rooms r ON u.room_type_id = r.id
    `, [], (err, units) => {
        if (err) return res.status(500).json({ error: err.message });
        listOccupancyRows()
            .then((bookings) => {
                const kb = loadKnowledgeBaseJson();
                const enrichedUnits = enrichUnitsWithKnowledgeBase(units, kb);
                res.json({ units: enrichedUnits, bookings });
            })
            .catch((occupancyErr) => res.status(500).json({ error: occupancyErr.message }));
        return;

        db.all(`
            SELECT 
                b.booking_ref, b.room_type, b.check_in, b.check_out,
                b.guests, b.full_name, b.full_name as guest_name, b.email, b.phone,
                b.total_price, COALESCE(b.addon_amount, 0) as addon_amount,
                b.status, b.payment_status, b.unit_id,
                b.created_at, b.booking_type, b.notes,
                b.created_by, b.booking_source,
                u.unit_label,
                COALESCE(SUM(CASE WHEN t.status != 'REJECTED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_paid
            FROM bookings b
            LEFT JOIN units u ON b.unit_id = u.unit_id
            LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
            WHERE b.status IN (${quoteSqlStrings(ACTIVE_BOOKING_STATUSES)})
            GROUP BY b.booking_ref
        `, [], (err, bookings) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const kb = loadKnowledgeBaseJson();
            const enrichedUnits = enrichUnitsWithKnowledgeBase(units, kb);

            res.json({ units: enrichedUnits, bookings });
        });
    });
});

// Admin API: Manual Full-Pay Settlement
app.post('/api/v1/admin/bookings/:ref/settle', (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body;

    db.get(`
        SELECT b.total_price, b.addon_amount, b.booking_ref
        FROM bookings b
        WHERE b.booking_ref = ? AND b.status IN (${quoteSqlStrings(REBOOKABLE_BOOKING_STATUSES)})
    `, [ref], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Booking not found or not reserved.' });

        // Standardize: Settle route now hands off calculation to the "Source of Truth"
        syncBookingFinance(ref, (errSync, data) => {
            if (errSync) return res.status(500).json({ error: 'Sync failed: ' + errSync.message });
            
            if (data.balance <= 0) {
                return res.json({ message: 'Balance already settled.', ...data });
            }

            const remaining = data.balance;

            // Record the settlement transaction for the outstanding balance
            db.run(`INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method)
                    VALUES (?, ?, 'Full Settlement', 'VERIFIED', 'Manual Override')`,
            [ref, remaining], function(err) {
                if (err) return res.status(500).json({ error: 'Failed to record settlement.' });
                
                // Re-sync to stamp final status and balance
                syncBookingFinance(ref, (errFinal, finalData) => {
                    logAction('full_pay', 'booking', ref, `Marked Fully Paid | Settled Ã¢â€šÂ±${remaining} | Admin: ${admin_id}`, 'admin_portal');
                    res.json({ message: `Booking ${ref} settled successfully.`, ...finalData });
                });
            });
        });
    });
});




// Ã¢â€â‚¬Ã¢â€â‚¬ Admin: CSV Bulk Import Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/** Robust CSV row parser Ã¢â‚¬â€ handles double-quoted fields containing commas/newlines */
function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const result = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        const fields = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQ) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') inQ = false;
                else cur += ch;
            } else {
                if (ch === '"') inQ = true;
                else if (ch === ',') { fields.push(cur.trim()); cur = ''; }
                else cur += ch;
            }
        }
        fields.push(cur.trim());
        result.push(fields);
    }
    return result;
}

const runInTransaction = async (work) => {
    await dbRunAsync('BEGIN TRANSACTION');
    try {
        const result = await work();
        await dbRunAsync('COMMIT');
        return result;
    } catch (err) {
        try {
            await dbRunAsync('ROLLBACK');
        } catch {
            // No-op: preserve the original error for callers.
        }
        throw err;
    }
};

const runInPreviewTransaction = async (work) => {
    await dbRunAsync('BEGIN TRANSACTION');
    try {
        const result = await work();
        await dbRunAsync('ROLLBACK');
        return result;
    } catch (err) {
        try {
            await dbRunAsync('ROLLBACK');
        } catch {
            // No-op: preserve the original error for callers.
        }
        throw err;
    }
};

const BULK_PAST_SETTLEMENT_CONFIRMATION = 'SETTLE PAST BOOKINGS';
const BULK_PAST_SETTLEMENT_TYPE = 'Full Settlement';
const BULK_PAST_SETTLEMENT_METHOD = 'Presumed Paid';
const BULK_PAST_SETTLEMENT_NOTE = 'Auto-settled past booking by admin bulk action.';
const BULK_PAST_SETTLEMENT_ELIGIBLE_STATUSES = [BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN];

const toMoney = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric * 100) / 100);
};

async function findPastSettlementCandidates(cutoffDate) {
    const statusSql = quoteSqlStrings(BULK_PAST_SETTLEMENT_ELIGIBLE_STATUSES);
    const headerRows = await dbAllAsync(`
        SELECT
            h.booking_reference,
            h.guest_name,
            h.check_in,
            h.check_out,
            h.status,
            h.booking_mode,
            h.booking_source,
            h.lodging_total,
            h.addon_amount,
            GROUP_CONCAT(DISTINCT bi.unit_id) as unit_ids,
            COUNT(DISTINCT bi.booking_item_id) as unit_count
        FROM booking_headers h
        LEFT JOIN booking_items bi ON bi.booking_reference = h.booking_reference
        WHERE h.check_out < ?
          AND h.status IN (${statusSql})
        GROUP BY h.booking_reference
        ORDER BY h.check_out ASC, h.booking_reference ASC
    `, [cutoffDate]);

    const transactionHeaders = [];
    for (const row of headerRows) {
        const finance = await recomputeHeaderFinance(row.booking_reference);
        const balance = toMoney(finance.balance_due);
        if (balance <= 1) continue;
        transactionHeaders.push({
            record_origin: 'transaction_header',
            booking_ref: row.booking_reference,
            guest_name: row.guest_name || '',
            check_in: row.check_in,
            check_out: row.check_out,
            status: normalizeBookingStatus(row.status),
            booking_mode: row.booking_mode || 'standard',
            booking_source: row.booking_source || '',
            unit_ids: String(row.unit_ids || '').split(',').filter(Boolean),
            unit_count: Number(row.unit_count || 0),
            gross_total: toMoney(finance.grand_total),
            amount_paid: toMoney(finance.verified_paid_total),
            balance_due: balance
        });
    }

    const legacyRows = await dbAllAsync(`
        SELECT
            b.booking_ref,
            b.full_name,
            b.check_in,
            b.check_out,
            b.status,
            b.booking_type,
            b.booking_source,
            b.unit_id,
            COALESCE(b.total_price, 0) + COALESCE(b.addon_amount, 0) as gross_total,
            COALESCE(SUM(CASE
                WHEN (t.status = 'VERIFIED' OR t.status = 'APPROVED')
                 AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment')
                THEN t.amount ELSE 0
            END), 0) as verified_paid_total,
            COALESCE(SUM(CASE
                WHEN (t.status = 'VERIFIED' OR t.status = 'APPROVED')
                 AND t.transaction_type = 'refund'
                THEN t.amount ELSE 0
            END), 0) as total_refunded
        FROM bookings b
        LEFT JOIN transactions t ON t.booking_ref = b.booking_ref
        WHERE b.check_out < ?
          AND b.status IN (${statusSql})
          AND COALESCE(b.is_deleted, 0) = 0
        GROUP BY b.booking_ref
        ORDER BY b.check_out ASC, b.booking_ref ASC
    `, [cutoffDate]);

    const legacyBookings = legacyRows
        .map((row) => {
            const gross = toMoney(row.gross_total);
            const paid = toMoney(Number(row.verified_paid_total || 0) - Number(row.total_refunded || 0));
            const balance = toMoney(gross - paid);
            return {
                record_origin: 'legacy_booking',
                booking_ref: row.booking_ref,
                guest_name: row.full_name || '',
                check_in: row.check_in,
                check_out: row.check_out,
                status: normalizeBookingStatus(row.status),
                booking_type: row.booking_type || '',
                booking_source: row.booking_source || '',
                unit_ids: row.unit_id ? [row.unit_id] : [],
                unit_count: row.unit_id ? 1 : 0,
                gross_total: gross,
                amount_paid: paid,
                balance_due: balance
            };
        })
        .filter((row) => row.balance_due > 1);

    const candidates = [...transactionHeaders, ...legacyBookings].sort((left, right) => {
        const dateOrder = String(left.check_out || '').localeCompare(String(right.check_out || ''));
        if (dateOrder !== 0) return dateOrder;
        return String(left.booking_ref || '').localeCompare(String(right.booking_ref || ''));
    });

    return {
        candidates,
        summary: {
            candidates: candidates.length,
            transaction_headers: transactionHeaders.length,
            legacy_bookings: legacyBookings.length,
            total_balance: toMoney(candidates.reduce((sum, row) => sum + Number(row.balance_due || 0), 0))
        }
    };
}

async function settlePastBookingCandidate(candidate, { checkout = true, adminId = 'admin', cutoffDate }) {
    const amount = toMoney(candidate.balance_due);
    const referenceNo = `BULK-PAST-${String(cutoffDate || '').replace(/-/g, '')}`;
    const notes = `${BULK_PAST_SETTLEMENT_NOTE} Cutoff: ${cutoffDate}.`;

    if (candidate.record_origin === 'transaction_header') {
        const { payment, finance } = await recordPayment({
            booking_reference: candidate.booking_ref,
            amount,
            payment_type: BULK_PAST_SETTLEMENT_TYPE,
            payment_method: BULK_PAST_SETTLEMENT_METHOD,
            reference_no: referenceNo,
            verification_status: 'VERIFIED',
            notes
        });

        if (checkout) {
            await dbRunAsync(
                `UPDATE booking_headers SET status = ? WHERE booking_reference = ?`,
                [BOOKING_STATUS_CHECKED_OUT, candidate.booking_ref]
            );
            await dbRunAsync(
                `UPDATE booking_items
                 SET status = ?
                 WHERE booking_reference = ?
                   AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})`,
                [BOOKING_STATUS_CHECKED_OUT, candidate.booking_ref]
            );
            for (const unitId of candidate.unit_ids || []) {
                await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
            }
        }

        logAction(
            'admin_bulk_past_settlement',
            'booking_header',
            candidate.booking_ref,
            `Settled ${amount} via ${BULK_PAST_SETTLEMENT_METHOD}${checkout ? ' and checked out' : ''}.`,
            adminId
        );

        return {
            ...candidate,
            settled_amount: amount,
            payment_id: payment?.payment_id,
            final_balance: toMoney(finance?.balance_due),
            checked_out: Boolean(checkout)
        };
    }

    const paidAfter = toMoney(Number(candidate.amount_paid || 0) + amount);
    await dbRunAsync(
        `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
         VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
        [candidate.booking_ref, amount, BULK_PAST_SETTLEMENT_TYPE, BULK_PAST_SETTLEMENT_METHOD, notes]
    );
    await dbRunAsync(
        `UPDATE bookings
         SET amount_paid = ?, balance = 0, payment_status = ?
             ${checkout ? ', status = ?' : ''}
         WHERE booking_ref = ?`,
        checkout
            ? [paidAfter, PAYMENT_SUMMARY_PAID, BOOKING_STATUS_CHECKED_OUT, candidate.booking_ref]
            : [paidAfter, PAYMENT_SUMMARY_PAID, candidate.booking_ref]
    );

    if (checkout) {
        for (const unitId of candidate.unit_ids || []) {
            await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
        }
    }

    logAction(
        'admin_bulk_past_settlement',
        'booking',
        candidate.booking_ref,
        `Settled ${amount} via ${BULK_PAST_SETTLEMENT_METHOD}${checkout ? ' and checked out' : ''}.`,
        adminId
    );

    return {
        ...candidate,
        settled_amount: amount,
        final_balance: 0,
        checked_out: Boolean(checkout)
    };
}

async function recomputeHeaderFinance(bookingReference) {
    const summary = await dbGetAsync(`
        SELECT
            h.booking_reference,
            COALESCE(h.lodging_total, 0) as lodging_total,
            COALESCE(h.addon_amount, 0) as addon_amount,
            COALESCE(SUM(CASE
                WHEN p.verification_status IN ('VERIFIED', 'APPROVED')
                 AND p.payment_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment')
                THEN p.amount ELSE 0
            END), 0) as verified_paid_total,
            COALESCE(SUM(CASE
                WHEN p.verification_status IN ('VERIFIED', 'APPROVED')
                 AND p.payment_type = 'refund'
                THEN p.amount ELSE 0
            END), 0) as total_refunded,
            COALESCE(SUM(CASE
                WHEN p.verification_status = 'PENDING_VERIFICATION'
                 AND p.payment_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment')
                THEN 1 ELSE 0
            END), 0) as pending_proof_count
        FROM booking_headers h
        LEFT JOIN payments p ON p.booking_reference = h.booking_reference
        WHERE h.booking_reference = ?
        GROUP BY h.booking_reference
    `, [bookingReference]);

    if (!summary) {
        throw new Error(`Booking header ${bookingReference} not found during finance sync`);
    }

    const grossTotal = Number(summary.lodging_total || 0) + Number(summary.addon_amount || 0);
    const netPaid = Number(summary.verified_paid_total || 0) - Number(summary.total_refunded || 0);
    const rawBalance = grossTotal - netPaid;
    const balance = rawBalance < 0.01 ? 0 : parseFloat(rawBalance.toFixed(2));
    const paymentStatus = derivePaymentSummary({
        grossTotal,
        netPaid,
        hasPendingProof: Number(summary.pending_proof_count || 0) > 0
    });

    await dbRunAsync(
        `UPDATE booking_headers
         SET verified_paid_total = ?, balance_due = ?, payment_status = ?
         WHERE booking_reference = ?`,
        [netPaid, balance, paymentStatus, bookingReference]
    );

    return addHeaderFinanceAliases({
        booking_reference: bookingReference,
        lodging_total: Number(summary.lodging_total || 0),
        addon_amount: Number(summary.addon_amount || 0),
        grand_total: grossTotal,
        verified_paid_total: netPaid,
        balance_due: balance,
        payment_status: paymentStatus
    });
}

function addBookingHeaderAliases(header = null) {
    if (!header) return header;
    const guestName = header.guest_name ?? '';
    const status = header.status ?? BOOKING_STATUS_PENDING_VERIFICATION;
    const lodgingTotal = Number(header.lodging_total ?? 0);
    const verifiedPaidTotal = Number(header.verified_paid_total ?? 0);
    const balanceDue = Number(header.balance_due ?? 0);
    const paymentSummaryStatus = header.payment_summary_status ?? header.payment_status ?? defaultPaymentSummaryForBookingStatus(status);
    return {
        ...header,
        guest_name: guestName,
        status,
        lodging_total: lodgingTotal,
        verified_paid_total: verifiedPaidTotal,
        balance_due: balanceDue,
        payment_summary_status: paymentSummaryStatus
    };
}

function addBookingItemAliases(item = null) {
    if (!item) return item;
    const guestCount = Number(item.guest_count ?? 0);
    const lodgingSubtotal = Number(item.lodging_subtotal ?? 0);
    const status = item.status ?? BOOKING_STATUS_PENDING_VERIFICATION;
    return {
        ...item,
        guest_count: guestCount,
        lodging_subtotal: lodgingSubtotal,
        status
    };
}

function addPaymentAliases(payment = null) {
    if (!payment) return payment;
    const verificationStatus = payment.verification_status ?? 'PENDING_VERIFICATION';
    const receiptUrl = payment.receipt_url ?? null;
    const referenceNo = payment.reference_no ?? null;
    return {
        ...payment,
        verification_status: verificationStatus,
        receipt_url: receiptUrl,
        reference_no: referenceNo
    };
}

function addHeaderFinanceAliases(finance = null) {
    if (!finance) return finance;
    const lodgingTotal = Number(finance.lodging_total ?? 0);
    const verifiedPaidTotal = Number(finance.verified_paid_total ?? 0);
    const balanceDue = Number(finance.balance_due ?? 0);
    const paymentSummaryStatus = finance.payment_summary_status ?? finance.payment_status ?? PAYMENT_SUMMARY_PAYMENT_REVIEW;
    return {
        ...finance,
        lodging_total: lodgingTotal,
        verified_paid_total: verifiedPaidTotal,
        balance_due: balanceDue,
        payment_summary_status: paymentSummaryStatus
    };
}

class RetiredTransactionAliasError extends Error {
    constructor(aliases = []) {
        super(`Retired transaction/header API aliases are no longer accepted: ${aliases.join(', ')}`);
        this.name = 'RetiredTransactionAliasError';
        this.retiredAliases = aliases;
    }
}

const RETIRED_TRANSACTION_ALIAS_FIELDS = {
    header: [
        'customer_name', 'customerName', 'full_name', 'fullName',
        'total_amount', 'totalAmount', 'total_paid', 'totalPaid',
        'balance', 'booking_status', 'bookingStatus'
    ],
    item: ['guests', 'subtotal', 'item_status', 'itemStatus'],
    payment: ['payment_status', 'paymentStatus', 'receipt_reference', 'receiptReference']
};

function findRetiredTransactionAliases(scope, payload = {}, pathPrefix = scope) {
    if (!payload || typeof payload !== 'object') return [];
    const fields = RETIRED_TRANSACTION_ALIAS_FIELDS[scope] || [];
    return fields
        .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
        .map((field) => `${pathPrefix}.${field}`);
}

function assertNoRetiredTransactionAliases(scope, payload = {}, pathPrefix = scope) {
    const aliases = findRetiredTransactionAliases(scope, payload, pathPrefix);
    if (aliases.length) {
        throw new RetiredTransactionAliasError(aliases);
    }
}

function retiredTransactionAliasResponse(err, fallbackMessage = 'Request uses retired transaction/header API aliases.') {
    return {
        error: fallbackMessage,
        retired_aliases: Array.isArray(err?.retiredAliases) ? err.retiredAliases : [],
        details: err?.message
    };
}

function addTransactionBookingAliases(payload = null) {
    if (!payload) return payload;
    return {
        ...payload,
        header: addBookingHeaderAliases(payload.header),
        items: Array.isArray(payload.items) ? payload.items.map(addBookingItemAliases) : [],
        payments: Array.isArray(payload.payments) ? payload.payments.map(addPaymentAliases) : [],
        addons: Array.isArray(payload.addons) ? payload.addons : []
    };
}

async function createBookingHeader(payload = {}) {
    assertNoRetiredTransactionAliases('header', payload, 'header');

    const bookingReference = payload.booking_reference || payload.bookingReference || await generateShortBookingHeaderReference('RES');
    const customerName = payload.guest_name || payload.guestName || '';
    const email = payload.email || '';
    const phone = payload.phone || '';
    const checkIn = payload.check_in || payload.checkIn || '';
    const checkOut = payload.check_out || payload.checkOut || '';
    const totalAmount = Number(payload.lodging_total ?? payload.lodgingTotal ?? 0);
    const addonAmount = Number(payload.addon_amount ?? payload.addonAmount ?? 0);
    const bookingStatus = normalizeBookingStatus(payload.status || BOOKING_STATUS_PENDING_VERIFICATION);
    const bookingSource = payload.booking_source || payload.bookingSource || 'Direct';
    const bookingMode = payload.booking_mode || payload.bookingMode || BOOKING_MODE_STANDARD;
    const notes = payload.notes || '';
    const specialRequests = payload.special_requests || payload.specialRequests || '';
    const createdBy = payload.created_by || payload.createdBy || 'guest';

    await dbRunAsync(
        `INSERT INTO booking_headers
         (booking_reference, guest_name, email, phone, check_in, check_out,
          lodging_total, addon_amount, verified_paid_total, balance_due, status, payment_status,
          booking_source, booking_mode, notes, special_requests, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            bookingReference,
            customerName,
            email,
            phone,
            checkIn,
            checkOut,
            totalAmount,
            addonAmount,
            totalAmount + addonAmount,
            bookingStatus,
            normalizePaymentSummary(
                payload.payment_status || payload.paymentStatus || defaultPaymentSummaryForBookingStatus(bookingStatus),
                { hasProof: bookingStatus === BOOKING_STATUS_PENDING_VERIFICATION }
            ),
            bookingSource,
            bookingMode,
            notes,
            specialRequests,
            createdBy
        ]
    );

    return addBookingHeaderAliases(await dbGetAsync(`SELECT * FROM booking_headers WHERE booking_reference = ?`, [bookingReference]));
}

async function createBookingItems(bookingReference, items = []) {
    if (!bookingReference) throw new Error('bookingReference is required');
    if (!Array.isArray(items) || items.length === 0) return [];

    const createdItems = [];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        assertNoRetiredTransactionAliases('item', item, `items[${index}]`);
        const result = await dbRunAsync(
            `INSERT INTO booking_items
             (booking_reference, unit_id, room_type, check_in, check_out, guest_count, lodging_subtotal, status, sequence_no)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                bookingReference,
                item.unit_id || item.unitId || null,
                item.room_type || item.roomType || '',
                item.check_in || item.checkIn || '',
                item.check_out || item.checkOut || '',
                Number(item.guest_count ?? item.guestCount ?? 1),
                Number(item.lodging_subtotal ?? item.lodgingSubtotal ?? 0),
                normalizeBookingStatus(item.status || BOOKING_STATUS_PENDING_VERIFICATION),
                item.sequence_no ?? item.sequenceNo ?? (index + 1)
            ]
        );
        const created = addBookingItemAliases(await dbGetAsync(`SELECT * FROM booking_items WHERE booking_item_id = ?`, [result.lastID]));
        createdItems.push(created);
    }

    return createdItems;
}

async function recordPayment(payload = {}) {
    assertNoRetiredTransactionAliases('payment', payload, 'payment');

    const bookingReference = payload.booking_reference || payload.bookingReference;
    if (!bookingReference) throw new Error('bookingReference is required');

    const amount = Number(payload.amount ?? 0);
    const paymentType = payload.payment_type || payload.paymentType || 'payment';
    const paymentMethod = payload.payment_method || payload.paymentMethod || null;
    const receiptUrl = payload.receipt_url || payload.receiptUrl || null;
    const referenceNo = payload.reference_no || payload.referenceNo || null;
    const paymentStatus = payload.verification_status || payload.verificationStatus || 'PENDING_VERIFICATION';
    const notes = payload.notes || null;

    const result = await dbRunAsync(
        `INSERT INTO payments
         (booking_reference, amount, payment_type, payment_method, receipt_url, reference_no, verification_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [bookingReference, amount, paymentType, paymentMethod, receiptUrl, referenceNo, paymentStatus, notes]
    );

    const payment = addPaymentAliases(await dbGetAsync(`SELECT * FROM payments WHERE payment_id = ?`, [result.lastID]));
    const finance = await recomputeHeaderFinance(bookingReference);

    return { payment, finance };
}

async function recordHeaderAddon(payload = {}) {
    const bookingReference = payload.booking_reference || payload.bookingReference;
    if (!bookingReference) throw new Error('bookingReference is required');

    const itemName = String(payload.item_name || payload.itemName || '').trim();
    const amount = Number(payload.amount ?? 0);
    const notes = payload.notes || null;
    const createdBy = payload.created_by || payload.createdBy || 'admin';

    if (!itemName) throw new Error('item_name is required');
    if (amount <= 0) throw new Error('Addon amount must be greater than zero.');

    const header = await dbGetAsync(`SELECT booking_reference FROM booking_headers WHERE booking_reference = ?`, [bookingReference]);
    if (!header) throw new Error('Booking header not found.');

    return runInTransaction(async () => {
        const result = await dbRunAsync(
            `INSERT INTO booking_header_addons
             (booking_reference, item_name, amount, notes, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [bookingReference, itemName, amount, notes, createdBy]
        );

        await dbRunAsync(
            `UPDATE booking_headers
             SET addon_amount = COALESCE(addon_amount, 0) + ?
             WHERE booking_reference = ?`,
            [amount, bookingReference]
        );

        const addon = await dbGetAsync(`SELECT * FROM booking_header_addons WHERE addon_id = ?`, [result.lastID]);
        const finance = await recomputeHeaderFinance(bookingReference);
        return { addon, finance };
    });
}

async function getBookingHeaderWithItems(bookingReference) {
    const header = await dbGetAsync(`SELECT * FROM booking_headers WHERE booking_reference = ?`, [bookingReference]);
    if (!header) return null;

    const items = await dbAllAsync(
        `SELECT * FROM booking_items WHERE booking_reference = ? ORDER BY COALESCE(sequence_no, booking_item_id), booking_item_id`,
        [bookingReference]
    );
    const payments = await dbAllAsync(
        `SELECT * FROM payments WHERE booking_reference = ? ORDER BY created_at ASC, payment_id ASC`,
        [bookingReference]
    );
    const addons = await dbAllAsync(
        `SELECT * FROM booking_header_addons WHERE booking_reference = ? ORDER BY created_at ASC, addon_id ASC`,
        [bookingReference]
    );

    return addTransactionBookingAliases({ header, items, payments, addons });
}

async function buildTransactionReconciliation(bookingReference) {
    const transactionBooking = await getBookingHeaderWithItems(bookingReference);
    if (!transactionBooking) return null;

    const { header, items, payments, addons } = transactionBooking;
    const events = [{
        type: 'DEBIT',
        category: 'Property Reservation',
        amount: Number(header.lodging_total || 0),
        description: items.length > 1
            ? `Base contract for ${items.length} reserved units`
            : 'Base contract for sanctuary residency',
        timestamp: header.created_at,
        status: 'FINALIZED'
    }];

    addons.forEach((addon) => {
        events.push({
            type: 'DEBIT',
            category: 'Service Add-on',
            amount: Number(addon.amount || 0),
            description: addon.notes || `${addon.item_name || 'Add-on'} recorded in booking workspace`,
            timestamp: addon.created_at,
            status: 'FINALIZED'
        });
    });

    payments.forEach((payment) => {
        let category = 'Financial Event';
        let type = 'CREDIT';

        switch (payment.payment_type) {
            case 'payment':
            case 'deposit':
            case 'Full Settlement':
            case 'Full Payment':
                type = 'CREDIT';
                category = 'Capital Receipt';
                break;
            case 'refund':
                type = 'DEBIT';
                category = 'Capital Return';
                break;
            case 'charge_item':
            case 'addon':
            case 'Extra Charge':
                type = 'DEBIT';
                category = 'Service Add-on';
                break;
            case 'discount':
            case 'adjustment':
                type = 'CREDIT';
                category = 'Goodwill Adjustment';
                break;
            default:
                category = payment.payment_type || category;
        }

        events.push({
            type,
            category,
            amount: Number(payment.amount || 0),
            description: payment.notes || `${category} processed via ${payment.payment_method || 'Unspecified Method'}`,
            timestamp: payment.created_at,
            status: payment.verification_status,
            method: payment.payment_method
        });
    });

    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let balance = 0;
    const timeline = events.map((event) => {
        const delta = event.type === 'DEBIT' ? Number(event.amount || 0) : -Number(event.amount || 0);
        const isVerified = ['VERIFIED', 'APPROVED', 'FINALIZED', 'Full Payment', 'Full Settlement'].includes(event.status);

        if (isVerified) {
            balance += delta;
        }

        return { ...event, running_balance: balance, affects_balance: isVerified };
    });

    return {
        booking_ref: bookingReference,
        guest: header.guest_name,
        current_status: header.status,
        timeline,
        total_verified_balance: balance,
        summary: items.length > 1
            ? `${items.length} reservation blocks linked under one guest transaction.`
            : 'Single-unit transaction booking.'
    };
}

async function updateTransactionBooking(ref, payload = {}) {
    assertNoRetiredTransactionAliases('header', payload, 'header');

    const transactionBooking = await getBookingHeaderWithItems(ref);
    if (!transactionBooking) return null;

    const { header, items } = transactionBooking;
    const {
        guest_name, email, phone, check_in, check_out,
        status, booking_source, booking_mode,
        notes, special_requests, lodging_total
    } = payload;

    return runInTransaction(async () => {
        const fields = [];
        const values = [];
        const nextStatus = status !== undefined
            ? normalizeBookingStatus(status)
            : undefined;
        const nextCheckIn = check_in ?? header.check_in;
        const nextCheckOut = check_out ?? header.check_out;

        if (guest_name !== undefined) {
            fields.push('guest_name = ?');
            values.push(guest_name ?? header.guest_name);
        }
        if (email !== undefined) {
            fields.push('email = ?');
            values.push(email);
        }
        if (phone !== undefined) {
            fields.push('phone = ?');
            values.push(phone);
        }
        if (check_in !== undefined) {
            fields.push('check_in = ?');
            values.push(check_in);
        }
        if (check_out !== undefined) {
            fields.push('check_out = ?');
            values.push(check_out);
        }
        if (nextStatus !== undefined) {
            fields.push('status = ?');
            values.push(nextStatus);
        }
        if (booking_source !== undefined) {
            fields.push('booking_source = ?');
            values.push(booking_source);
        }
        if (booking_mode !== undefined) {
            fields.push('booking_mode = ?');
            values.push(booking_mode);
        }
        if (notes !== undefined) {
            fields.push('notes = ?');
            values.push(notes);
        }
        if (special_requests !== undefined) {
            fields.push('special_requests = ?');
            values.push(special_requests);
        }
        if (lodging_total !== undefined) {
            fields.push('lodging_total = ?');
            values.push(Number(lodging_total ?? header.lodging_total ?? 0));
        }

        if (fields.length) {
            values.push(ref);
            await dbRunAsync(`UPDATE booking_headers SET ${fields.join(', ')} WHERE booking_reference = ?`, values);
        }

        if (check_in !== undefined || check_out !== undefined) {
            await dbRunAsync(
                `UPDATE booking_items
                 SET check_in = ?, check_out = ?
                 WHERE booking_reference = ?`,
                [nextCheckIn, nextCheckOut, ref]
            );
        }

        const assignedUnitIds = items
            .filter((item) => ACTIVE_ITEM_STATUSES.includes(normalizeBookingStatus(item.status)))
            .map((item) => item.unit_id)
            .filter(Boolean);
        if (nextStatus === BOOKING_STATUS_CHECKED_IN) {
            await dbRunAsync(
                `UPDATE booking_items
                 SET status = 'CHECKED_IN'
                 WHERE booking_reference = ?
                   AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})`,
                [ref]
            );

            for (const unitId of assignedUnitIds) {
                await dbRunAsync(`UPDATE units SET unit_status = 'Checked In' WHERE unit_id = ?`, [unitId]);
            }
        }

        if (nextStatus === BOOKING_STATUS_CHECKED_OUT) {
            await dbRunAsync(
                `UPDATE booking_items
                 SET status = 'CHECKED_OUT'
                 WHERE booking_reference = ?
                   AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})`,
                [ref]
            );

            for (const unitId of assignedUnitIds) {
                await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
            }
        }

        if (nextStatus === BOOKING_STATUS_CANCELLED) {
            await dbRunAsync(
                `UPDATE booking_items
                 SET status = 'CANCELLED'
                 WHERE booking_reference = ?`,
                [ref]
            );

            for (const unitId of assignedUnitIds) {
                await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
            }
        }

        if (lodging_total !== undefined) {
            await recomputeHeaderFinance(ref);
        }

        return getBookingHeaderWithItems(ref);
    });
}

async function updateTransactionBookingItem(bookingReference, bookingItemId, payload = {}) {
    assertNoRetiredTransactionAliases('item', payload, 'item');

    const parent = await getBookingHeaderWithItems(bookingReference);
    if (!parent) return null;

    const currentItem = (parent.items || []).find((item) => Number(item.booking_item_id) === Number(bookingItemId));
    if (!currentItem) {
        throw new Error(`Booking item ${bookingItemId} not found for ${bookingReference}`);
    }

    const nextUnitId = payload.unit_id !== undefined ? (payload.unit_id || null) : currentItem.unit_id;
    const nextCheckIn = payload.check_in || currentItem.check_in;
    const nextCheckOut = payload.check_out || currentItem.check_out;
    const nextStatus = normalizeBookingStatus(payload.status || currentItem.status);
    const activeStatuses = ACTIVE_ITEM_STATUSES;

    if (nextUnitId && activeStatuses.includes(nextStatus)) {
        const overlaps = await dbAllAsync(
            `SELECT * FROM booking_items
             WHERE booking_item_id != ?
               AND unit_id = ?
               AND check_in < ?
               AND check_out > ?
               AND status IN (${quoteSqlStrings(activeStatuses)})
             ORDER BY check_in ASC, booking_item_id ASC`,
            [bookingItemId, nextUnitId, nextCheckOut, nextCheckIn]
        );

        if (overlaps.length > 0) {
            const conflict = overlaps[0];
            throw new Error(`Unit ${nextUnitId} is already blocked from ${conflict.check_in} to ${conflict.check_out}.`);
        }

        const dateTagConflict = await findBlockingDateTag(nextUnitId, nextCheckIn, nextCheckOut);
        if (dateTagConflict) {
            throw new Error(`Unit ${nextUnitId} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
        }
    }

    return runInTransaction(async () => {
        await dbRunAsync(
            `UPDATE booking_items
             SET unit_id = ?, check_in = ?, check_out = ?, status = ?, room_type = ?, guest_count = ?, lodging_subtotal = ?
             WHERE booking_item_id = ? AND booking_reference = ?`,
            [
                nextUnitId,
                nextCheckIn,
                nextCheckOut,
                nextStatus,
                payload.room_type || currentItem.room_type,
                Number(payload.guest_count ?? currentItem.guest_count ?? 1),
                Number(payload.lodging_subtotal ?? currentItem.lodging_subtotal ?? 0),
                bookingItemId,
                bookingReference
            ]
        );

        if (currentItem.unit_id && currentItem.unit_id !== nextUnitId) {
            await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [currentItem.unit_id]);
        }

        if (nextUnitId) {
            const unitStatus = nextStatus === BOOKING_STATUS_CHECKED_IN ? 'Checked In' : 'Available';
            await dbRunAsync(`UPDATE units SET unit_status = ? WHERE unit_id = ?`, [unitStatus, nextUnitId]);
        }

        const updatedParent = await getBookingHeaderWithItems(bookingReference);
        const remainingActiveItems = (updatedParent?.items || []).filter((item) => activeStatuses.includes(item.status));

        if (remainingActiveItems.length === 0) {
            await dbRunAsync(
                `UPDATE booking_headers SET status = ? WHERE booking_reference = ?`,
                [BOOKING_STATUS_CANCELLED, bookingReference]
            );
        } else if (parent.header.status === BOOKING_STATUS_CANCELLED) {
            await dbRunAsync(
                `UPDATE booking_headers SET status = ? WHERE booking_reference = ?`,
                [BOOKING_STATUS_RESERVED, bookingReference]
            );
        } else if (parent.header.status === LEGACY_APPROVED_STATUS) {
            await dbRunAsync(
                `UPDATE booking_headers SET status = ? WHERE booking_reference = ?`,
                [BOOKING_STATUS_RESERVED, bookingReference]
            );
        }

        return getBookingHeaderWithItems(bookingReference);
    });
}

async function addTransactionBookingItem(bookingReference, payload = {}) {
    assertNoRetiredTransactionAliases('item', payload, 'item');

    const parent = await getBookingHeaderWithItems(bookingReference);
    if (!parent) return null;

    const nextUnitId = payload.unit_id || null;
    const nextCheckIn = payload.check_in || parent.header.check_in;
    const nextCheckOut = payload.check_out || parent.header.check_out;
    const nextStatus = normalizeBookingStatus(payload.status || parent.header.status || BOOKING_STATUS_RESERVED);
    const activeStatuses = ACTIVE_ITEM_STATUSES;

    let unitRoomType = payload.room_type || '';
    if (nextUnitId) {
        const unitRow = await dbGetAsync(`SELECT room_type_id FROM units WHERE unit_id = ? LIMIT 1`, [nextUnitId]);
        if (!unitRow) {
            throw new Error(`Unit ${nextUnitId} not found.`);
        }
        unitRoomType = unitRow.room_type_id || unitRoomType;
    }

    if (nextUnitId && activeStatuses.includes(nextStatus)) {
        const overlaps = await dbAllAsync(
            `SELECT * FROM booking_items
             WHERE unit_id = ?
               AND check_in < ?
               AND check_out > ?
               AND status IN (${quoteSqlStrings(activeStatuses)})
             ORDER BY check_in ASC, booking_item_id ASC`,
            [nextUnitId, nextCheckOut, nextCheckIn]
        );

        if (overlaps.length > 0) {
            const conflict = overlaps[0];
            throw new Error(`Unit ${nextUnitId} is already blocked from ${conflict.check_in} to ${conflict.check_out}.`);
        }

        const dateTagConflict = await findBlockingDateTag(nextUnitId, nextCheckIn, nextCheckOut);
        if (dateTagConflict) {
            throw new Error(`Unit ${nextUnitId} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
        }
    }

    return runInTransaction(async () => {
        const sequenceRows = parent.items || [];
        const nextSequence = sequenceRows.reduce((max, item) => Math.max(max, Number(item.sequence_no || item.booking_item_id || 0)), 0) + 1;
        const createdItems = await createBookingItems(bookingReference, [{
            unit_id: nextUnitId,
            room_type: unitRoomType,
            check_in: nextCheckIn,
            check_out: nextCheckOut,
            guest_count: Number(payload.guest_count ?? 0),
            lodging_subtotal: Number(payload.lodging_subtotal ?? 0),
            status: nextStatus,
            sequence_no: payload.sequence_no ?? nextSequence
        }]);

        if (nextUnitId) {
            const unitStatus = nextStatus === BOOKING_STATUS_CHECKED_IN ? 'Checked In' : 'Available';
            await dbRunAsync(`UPDATE units SET unit_status = ? WHERE unit_id = ?`, [unitStatus, nextUnitId]);
        }

        await recomputeHeaderFinance(bookingReference);
        return getBookingHeaderWithItems(bookingReference);
    });
}

async function createHeaderWithItems({ header = {}, items = [] } = {}) {
    return runInTransaction(async () => {
        assertNoRetiredTransactionAliases('header', header, 'header');
        (Array.isArray(items) ? items : []).forEach((item, index) => {
            assertNoRetiredTransactionAliases('item', item, `items[${index}]`);
        });

        const createdHeader = await createBookingHeader(header);
        const createdItems = await createBookingItems(createdHeader.booking_reference, items);
        const refreshedHeader = await recomputeHeaderFinance(createdHeader.booking_reference);
        return addTransactionBookingAliases({
            header: {
                ...createdHeader,
                verified_paid_total: refreshedHeader.verified_paid_total,
                balance_due: refreshedHeader.balance_due,
                payment_status: refreshedHeader.payment_status
            },
            items: createdItems
        });
    });
}

async function findOverlappingBookingItems({ checkIn, checkOut, unitIds = [], statuses = ACTIVE_ITEM_STATUSES } = {}) {
    if (!checkIn || !checkOut) return [];

    const filters = [
        `check_in < ?`,
        `check_out > ?`
    ];
    const params = [checkOut, checkIn];

    if (Array.isArray(statuses) && statuses.length) {
        filters.push(`status IN (${quoteSqlStrings(statuses)})`);
    }

    if (Array.isArray(unitIds) && unitIds.length) {
        filters.push(`unit_id IN (${quoteSqlStrings(unitIds)})`);
    }

    const rows = await dbAllAsync(
        `SELECT * FROM booking_items WHERE ${filters.join(' AND ')} ORDER BY check_in ASC, booking_item_id ASC`,
        params
    );
    const bookingConflicts = rows.map(addBookingItemAliases);

    if (!Array.isArray(unitIds) || !unitIds.length) return bookingConflicts;

    const dateTagConflicts = await dbAllAsync(
        `SELECT
            id as booking_item_id,
            'UNIT-BLOCK-' || id as booking_reference,
            unit_id,
            tag_type as room_type,
            start_date as check_in,
            end_date as check_out,
            0 as guest_count,
            0 as lodging_subtotal,
            'UNIT_BLOCKED' as status,
            note
         FROM unit_date_tags
         WHERE blocks_inventory = 1
           AND unit_id IN (${quoteSqlStrings(unitIds)})
           AND start_date < ?
           AND end_date > ?
         ORDER BY start_date ASC, id ASC`,
        [checkOut, checkIn]
    );

    return [
        ...bookingConflicts,
        ...dateTagConflicts.map((row) => ({
            ...addBookingItemAliases(row),
            record_origin: 'unit_date_tag'
        }))
    ];
}

async function listLegacyLedgerRows() {
    return dbAllAsync(`
        SELECT
            b.booking_ref,
            b.booking_ref as transaction_ref,
            b.room_type,
            b.check_in,
            b.check_out,
            b.guests,
            b.full_name,
            b.full_name as guest_name,
            b.email,
            b.phone,
            b.total_price,
            COALESCE(b.addon_amount, 0) as addon_amount,
            b.balance,
            b.status,
            b.payment_status,
            b.booking_source,
            b.booking_mode,
            b.notes,
            b.special_requests,
            b.created_by,
            b.created_at,
            b.rowid as internal_id,
            COALESCE(b.created_at, date('now')) as recorded_at,
            b.unit_id,
            u.unit_label,
            CASE
                WHEN COUNT(CASE
                    WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED'
                     AND t.transaction_type != 'addon'
                    THEN 1
                END) > 0
                    THEN COALESCE(SUM(CASE
                        WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED'
                         AND t.transaction_type != 'addon'
                        THEN t.amount
                        ELSE 0
                    END), 0)
                ELSE COALESCE(b.amount_paid, 0)
            END as amount_paid,
            COALESCE(SUM(CASE
                WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED'
                 AND t.transaction_type = 'refund'
                THEN t.amount
                ELSE 0
            END), 0) as amount_refunded,
            1 as booking_items_count,
            'legacy' as record_origin
        FROM bookings b
        LEFT JOIN units u ON b.unit_id = u.unit_id
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.is_deleted = 0
          AND b.status IN (${quoteSqlStrings(LEDGER_BOOKING_STATUSES)})
        GROUP BY b.booking_ref
    `);
}

async function listTransactionLedgerRows() {
    return dbAllAsync(`
        SELECT
            h.booking_reference as booking_ref,
            h.booking_reference as transaction_ref,
            CASE
                WHEN COUNT(DISTINCT bi.room_type) = 1 THEN MAX(bi.room_type)
                WHEN COUNT(DISTINCT bi.room_type) > 1 THEN 'Multi-Room'
                ELSE ''
            END as room_type,
            h.check_in,
            h.check_out,
            COALESCE(SUM(COALESCE(bi.guest_count, 0)), 0) as guests,
            h.guest_name as full_name,
            h.guest_name as guest_name,
            h.email,
            h.phone,
            COALESCE(h.lodging_total, 0) as total_price,
            COALESCE(h.addon_amount, 0) as addon_amount,
            COALESCE(h.balance_due, 0) as balance,
            h.status as status,
            h.payment_status,
            h.booking_source,
            h.booking_mode,
            h.notes,
            h.special_requests,
            h.created_by,
            h.created_at,
            -1 as internal_id,
            COALESCE(h.created_at, date('now')) as recorded_at,
            CASE WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(bi.unit_id) ELSE NULL END as unit_id,
            CASE
                WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(u.unit_label)
                WHEN COUNT(DISTINCT bi.unit_id) > 1 THEN 'Multiple Units'
                ELSE NULL
            END as unit_label,
            COALESCE(GROUP_CONCAT(DISTINCT COALESCE(u.unit_label, bi.unit_id)), '') as unit_summary,
            COALESCE(h.verified_paid_total, 0) as amount_paid,
            0 as amount_refunded,
            COUNT(bi.booking_item_id) as booking_items_count,
            'transaction_header' as record_origin
        FROM booking_headers h
        LEFT JOIN booking_items bi ON bi.booking_reference = h.booking_reference
        LEFT JOIN units u ON bi.unit_id = u.unit_id
        WHERE h.status IN (${quoteSqlStrings(LEDGER_BOOKING_STATUSES)})
        GROUP BY h.booking_reference
    `);
}

async function listFinancialTransactionRows() {
    const legacyRows = await dbAllAsync(`
        SELECT
            'legacy:' || t.id as id,
            t.id as numeric_id,
            t.booking_ref,
            t.amount,
            t.transaction_type,
            COALESCE(t.status, 'PENDING_VERIFICATION') as status,
            t.payment_method,
            t.receipt_path,
            t.created_at,
            t.created_at as updated_at,
            t.notes as tx_notes,
            b.full_name,
            b.full_name as guest_name,
            b.check_in,
            b.check_out,
            b.unit_id,
            b.notes as booking_notes,
            b.created_by,
            b.booking_source,
            u.unit_label,
            'legacy_transaction' as record_origin
        FROM transactions t
        LEFT JOIN bookings b ON t.booking_ref = b.booking_ref
        LEFT JOIN units u ON b.unit_id = u.unit_id
    `);

    const paymentRows = await dbAllAsync(`
        SELECT
            'payment:' || p.payment_id as id,
            p.payment_id as numeric_id,
            p.booking_reference as booking_ref,
            p.amount,
            p.payment_type as transaction_type,
            COALESCE(p.verification_status, 'PENDING_VERIFICATION') as status,
            p.payment_method,
            p.receipt_url as receipt_path,
            p.created_at,
            p.created_at as updated_at,
            p.notes as tx_notes,
            h.guest_name as full_name,
            h.guest_name as guest_name,
            h.check_in,
            h.check_out,
            CASE WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(bi.unit_id) ELSE NULL END as unit_id,
            h.notes as booking_notes,
            h.created_by,
            h.booking_source,
            CASE
                WHEN COUNT(DISTINCT u.unit_label) = 1 THEN MAX(u.unit_label)
                WHEN COUNT(DISTINCT bi.unit_id) > 1 THEN 'Multiple Units'
                ELSE NULL
            END as unit_label,
            'transaction_payment' as record_origin
        FROM payments p
        JOIN booking_headers h ON h.booking_reference = p.booking_reference
        LEFT JOIN booking_items bi ON bi.booking_reference = h.booking_reference
        LEFT JOIN units u ON bi.unit_id = u.unit_id
        GROUP BY p.payment_id
    `);

    return [...legacyRows, ...paymentRows].sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
        Number(b.numeric_id || 0) - Number(a.numeric_id || 0)
    );
}

function parseChatSenderFromBooking(row = {}) {
    const haystack = [
        row.notes,
        row.special_requests,
        row.booking_notes,
        row.created_by,
        row.booking_source
    ].filter(Boolean).join(' ');
    const match = haystack.match(/\bSender:\s*([^\s|,;]+)/i) ||
        haystack.match(/\bchat_sender=([^\s|,;&]+)/i) ||
        haystack.match(/\bsender_id[:=]\s*([^\s|,;]+)/i);
    return match ? decodeURIComponent(match[1]).replace(/[.)\]}]+$/, '') : '';
}

function parsePaymentDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function normalizePaidStatus(value) {
    return String(value || '').trim().toLowerCase();
}

async function listChatbotPaymentConfirmationCandidates({ senderId = '', days = 14 } = {}) {
    const lookbackMs = Math.max(1, Number(days || 14)) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    const [legacyRows, transactionRows, paymentRows] = await Promise.all([
        listLegacyLedgerRows(),
        listTransactionLedgerRows(),
        listFinancialTransactionRows()
    ]);

    const latestVerifiedPaymentByRef = new Map();
    paymentRows.forEach((payment) => {
        const ref = payment.booking_ref;
        if (!ref) return;
        const status = normalizePaidStatus(payment.status);
        const paymentType = normalizePaidStatus(payment.transaction_type);
        if (!['verified', 'approved'].includes(status)) return;
        if (paymentType === 'refund' || paymentType === 'addon') return;
        const paidAt = parsePaymentDate(payment.updated_at || payment.created_at);
        if (!paidAt || paidAt.getTime() < cutoff) return;
        const current = latestVerifiedPaymentByRef.get(ref);
        if (!current || paidAt.getTime() > current.paid_at_ms) {
            latestVerifiedPaymentByRef.set(ref, {
                paid_at: payment.updated_at || payment.created_at,
                paid_at_ms: paidAt.getTime(),
                amount: Number(payment.amount || 0),
                method: payment.payment_method || '',
                receipt_url: payment.receipt_path || ''
            });
        }
    });

    const wantedSender = String(senderId || '').trim();
    return [...legacyRows, ...transactionRows]
        .map((booking) => {
            const sender_id = parseChatSenderFromBooking(booking);
            const recentPayment = latestVerifiedPaymentByRef.get(booking.booking_ref);
            const status = String(booking.status || '').toUpperCase();
            const amountPaid = Number(booking.amount_paid || 0);
            const grandTotal = Number(booking.total_price || 0) + Number(booking.addon_amount || 0);
            const balance = Math.max(0, Number(booking.balance ?? (grandTotal - amountPaid)) || 0);
            return {
                sender_id,
                booking_ref: booking.booking_ref,
                guest_name: booking.full_name || booking.guest_name || 'Guest',
                check_in: booking.check_in,
                check_out: booking.check_out,
                unit_summary: booking.unit_summary || booking.unit_label || booking.unit_id || booking.room_type || '',
                amount_paid: amountPaid,
                total_due: grandTotal,
                balance,
                payment_status: booking.payment_status || '',
                status: booking.status || '',
                normalized_status: status,
                latest_payment_at: recentPayment?.paid_at || '',
                latest_payment_amount: recentPayment?.amount || 0,
                payment_method: recentPayment?.method || '',
                record_origin: booking.record_origin || '',
                source: booking.booking_source || ''
            };
        })
        .filter((booking) =>
            booking.sender_id &&
            booking.booking_ref &&
            latestVerifiedPaymentByRef.has(booking.booking_ref) &&
            booking.amount_paid > 0 &&
            [BOOKING_STATUS_RESERVED, BOOKING_STATUS_CHECKED_IN, LEGACY_APPROVED_STATUS, LEGACY_OCCUPIED_STATUS].includes(booking.normalized_status) &&
            (!wantedSender || booking.sender_id === wantedSender)
        )
        .sort((a, b) => String(b.latest_payment_at || '').localeCompare(String(a.latest_payment_at || '')));
}

async function listOccupancyRows() {
    const legacyRows = await dbAllAsync(`
        SELECT 
            b.booking_ref, b.booking_ref as transaction_ref, b.room_type, b.check_in, b.check_out,
            b.guests, b.full_name, b.full_name as guest_name, b.email, b.phone,
            b.total_price, COALESCE(b.addon_amount, 0) as addon_amount,
            b.balance, b.status, b.payment_status, b.unit_id,
            b.created_at, b.booking_type, b.notes,
            b.created_by, b.booking_source,
            u.unit_label,
            COALESCE(SUM(CASE WHEN t.status != 'REJECTED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_paid,
            'legacy' as record_origin,
            NULL as booking_item_id,
            1 as booking_items_count
        FROM bookings b
        LEFT JOIN units u ON b.unit_id = u.unit_id
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.status IN (${quoteSqlStrings(OCCUPANCY_BOOKING_STATUSES)})
        GROUP BY b.booking_ref
    `);

    const transactionRows = await dbAllAsync(`
        SELECT
            h.booking_reference as booking_ref,
            h.booking_reference as transaction_ref,
            bi.room_type,
            bi.check_in,
            bi.check_out,
            bi.guest_count,
            h.guest_name as full_name,
            h.guest_name as guest_name,
            h.email,
            h.phone,
            COALESCE(h.lodging_total, 0) as total_price,
            COALESCE(h.addon_amount, 0) as addon_amount,
            COALESCE(h.balance_due, 0) as balance,
            h.status as status,
            h.payment_status,
            bi.unit_id,
            h.created_at,
            'overnight' as booking_type,
            h.notes,
            h.created_by,
            h.booking_source,
            u.unit_label,
            COALESCE(h.verified_paid_total, 0) as amount_paid,
            'transaction_item' as record_origin,
            bi.booking_item_id,
            counts.item_count as booking_items_count
        FROM booking_items bi
        JOIN booking_headers h ON h.booking_reference = bi.booking_reference
        LEFT JOIN units u ON bi.unit_id = u.unit_id
        LEFT JOIN (
            SELECT booking_reference, COUNT(*) as item_count
            FROM booking_items
            GROUP BY booking_reference
        ) counts ON counts.booking_reference = bi.booking_reference
        WHERE h.status IN (${quoteSqlStrings(OCCUPANCY_HEADER_STATUSES)})
          AND bi.status IN (${quoteSqlStrings(OCCUPANCY_ITEM_STATUSES)})
    `);

    const dateTagRows = await dbAllAsync(`
        SELECT
            'UNIT-BLOCK-' || id as booking_ref,
            'UNIT-BLOCK-' || id as transaction_ref,
            tag_type as room_type,
            start_date as check_in,
            end_date as check_out,
            0 as guests,
            COALESCE(NULLIF(note, ''), tag_type) as full_name,
            COALESCE(NULLIF(note, ''), tag_type) as guest_name,
            '' as email,
            '' as phone,
            0 as total_price,
            0 as addon_amount,
            0 as balance,
            'UNIT_BLOCKED' as status,
            'Blocked' as payment_status,
            unit_id,
            created_at,
            'unit_block' as booking_type,
            note as notes,
            created_by,
            'Units Hub' as booking_source,
            unit_id as unit_label,
            0 as amount_paid,
            'unit_date_tag' as record_origin,
            NULL as booking_item_id,
            1 as booking_items_count
        FROM unit_date_tags
        WHERE blocks_inventory = 1
    `);

    return [...legacyRows, ...transactionRows, ...dateTagRows].sort((a, b) => {
        const left = String(a.created_at || '');
        const right = String(b.created_at || '');
        if (left !== right) return right.localeCompare(left);
        return String(a.booking_ref || '').localeCompare(String(b.booking_ref || ''));
    });
}

const CSV_COLS = [
    'booking_ref','full_name','email','phone','unit_id','room_type','booking_type',
    'check_in','check_out','guests','total_price','amount_paid','payment_status',
    'booking_source','status','notes','addon_amount','special_requests'
];

const UNIT_PREFIX = {
    day_tour: 'DTR',
    tent_pitching: 'TPC',
    'Amalfi Suite': 'AMS',
    'Positano Vista': 'POS',
    'Ravello Suite': 'RAV',
    'Capri Vista': 'CAP',
    'Sirenuse Suite': 'SIR',
    'Sunset Pavilion': 'SUN'
};

const SNAPSHOT_IMPORT_SOURCE = 'CSV_SNAPSHOT';
const SNAPSHOT_PAYMENT_METHOD = 'Snapshot CSV Import';
const SNAPSHOT_BLOCKING_STATUSES = INVENTORY_BLOCKING_BOOKING_STATUSES;

const dbAllAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});

const dbGetAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
});

const dbRunAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const AMALFI_DEFAULT_PRODUCTS = [
    { id: 'p-1', name: 'Local Craft Beer', price: 180, category: 'Food & Beverage', stock: 120 },
    { id: 'p-2', name: 'Club Sandwich with Fries', price: 380, category: 'Food & Beverage', stock: 50 },
    { id: 'p-3', name: 'Soda Can (Coke/Sprite)', price: 90, category: 'Food & Beverage', stock: 150 },
    { id: 'p-4', name: 'Burger & Fries Combo', price: 420, category: 'Food & Beverage', stock: 40 },
    { id: 'p-5', name: 'Bottled Water (500ml)', price: 50, category: 'Food & Beverage', stock: 200 },
    { id: 'p-6', name: 'Sunscreen Lotion', price: 450, category: 'Boutique & Retail', stock: 35 },
    { id: 'p-7', name: 'Resort Souvenir T-Shirt', price: 650, category: 'Boutique & Retail', stock: 60 },
    { id: 'p-8', name: 'Pool Float Rental', price: 200, category: 'Experiences & Services', stock: 15 }
];

const AMALFI_DEFAULT_STAFF = [
    { id: 'staff-1', name: 'Housekeeper 1', position: 'Head Housekeeper', department: 'Rooms & Housekeeping', basicSalary: 18000, isActive: true },
    { id: 'staff-2', name: 'Housekeeper 2', position: 'Housekeeper', department: 'Rooms & Housekeeping', basicSalary: 14000, isActive: true },
    { id: 'staff-3', name: 'Front Desk Officer', position: 'Front Desk', department: 'Admin', basicSalary: 16500, isActive: true },
    { id: 'staff-4', name: 'Cook / Kitchen Staff', position: 'Cook', department: 'Food & Beverage', basicSalary: 17000, isActive: true },
    { id: 'staff-5', name: 'Maintenance Staff', position: 'Maintenance', department: 'Maintenance & Facilities', basicSalary: 15500, isActive: true },
    { id: 'staff-6', name: 'Security Guard', position: 'Security', department: 'Staffing & Payroll', basicSalary: 14800, isActive: true },
    { id: 'staff-7', name: 'Resort Manager', position: 'Manager', department: 'Admin', basicSalary: 35000, isActive: true }
];

const AMALFI_DEFAULT_EXPENSES = [
    { id: 'exp-1', date: '2026-06-05', vendor: 'Payroll Run - June H1', description: 'Regular Salaries - June H1', department: 'Staffing & Payroll', subcategory: 'Regular Salaries', category: 'fixed', amount: 131800, paymentMethod: 'Bank Transfer', recurrence: 'Monthly' },
    { id: 'exp-2', date: '2026-06-05', vendor: 'Payroll Run - June H1', description: 'SSS / PhilHealth / HDMF - June H1', department: 'Staffing & Payroll', subcategory: 'SSS / PhilHealth / HDMF', category: 'fixed', amount: 14200, paymentMethod: 'Bank Transfer', recurrence: 'Monthly' },
    { id: 'exp-3', date: '2026-06-10', vendor: 'Meralco', description: 'Electricity Bill - June', department: 'Utilities', subcategory: 'Electricity', category: 'variable', amount: 10900, paymentMethod: 'Corporate Card', recurrence: 'Monthly' },
    { id: 'exp-4', date: '2026-06-10', vendor: 'Local Water District', description: 'Water & Sewage - June', department: 'Utilities', subcategory: 'Water & Sewage', category: 'variable', amount: 3200, paymentMethod: 'Corporate Card', recurrence: 'Monthly' },
    { id: 'exp-5', date: '2026-06-11', vendor: 'Shell Gasoline', description: 'Generator Fuel Refill', department: 'Utilities', subcategory: 'Generator Fuel', category: 'variable', amount: 8500, paymentMethod: 'Cash', recurrence: 'One-Time' },
    { id: 'exp-6', date: '2026-06-12', vendor: 'Sun Laundry Services', description: 'Weekly Laundry & Linen Service', department: 'Rooms & Housekeeping', subcategory: 'Laundry & Linen Service', category: 'variable', amount: 6800, paymentMethod: 'Cash', recurrence: 'Weekly' },
    { id: 'exp-7', date: '2026-06-12', vendor: 'SM Supermarket', description: 'Room Toiletries & Supplies', department: 'Rooms & Housekeeping', subcategory: 'Room Supplies (Toiletries)', category: 'variable', amount: 4200, paymentMethod: 'Corporate Card', recurrence: 'Monthly' },
    { id: 'exp-8', date: '2026-06-13', vendor: 'Fresh Mart Produce', description: 'Food Inventory Restocking', department: 'Food & Beverage', subcategory: 'Food Inventory Restocking', category: 'variable', amount: 28400, paymentMethod: 'Corporate Card', recurrence: 'Weekly' },
    { id: 'exp-9', date: '2026-06-13', vendor: 'Beverage Depot', description: 'Beer, Wine & Soft Drinks Restock', department: 'Food & Beverage', subcategory: 'Beverage Restocking', category: 'variable', amount: 15200, paymentMethod: 'Corporate Card', recurrence: 'Weekly' },
    { id: 'exp-10', date: '2026-06-14', vendor: 'HVAC Solutions Co.', description: 'Aircon Unit Repair - Villa 4', department: 'Maintenance & Facilities', subcategory: 'General Repairs', category: 'variable', amount: 12400, paymentMethod: 'Bank Transfer', recurrence: 'One-Time' }
];

const AMALFI_DEFAULT_SERVICE_REQUESTS = [
    { id: '#ENG-401', villa: 'Villa 4', category: 'Maintenance', title: 'Aircon compressor replacement scheduled', details: 'Aircon compressor replacement scheduled for Villa 4.', status: 'Pending', priority: 'HIGH' },
    { id: '#ENG-402', villa: 'Villa 1', category: 'Maintenance', title: 'Pool filter cleaning check', details: 'Pool filter cleaning check scheduled for Villa 1 next Monday.', status: 'Pending', priority: 'MEDIUM' }
];

const AMALFI_DEFAULT_SPECIAL_BOOKINGS = [
    { id: 'SB-401', guest: 'George Clooney', amenity: 'Pool Cabana Reservation', details: 'Luxury pool cabana with refreshments and fresh fruits', date: 'June 23, 2026', folio: 1500, status: 'Confirmed' },
    { id: 'SB-402', guest: 'Lord Marcus Harrington', amenity: 'Premium Drinks Package', details: 'Welcome drinks package and local snacks stocked in Villa 6 Acc.', date: 'June 24, 2026', folio: 1500, status: 'Pending verification' },
    { id: 'SB-403', guest: 'Sophia Loren', amenity: 'Airport Shuttle Service', details: 'Coordination of priority resort shuttle transfer from airport', date: 'June 18, 2026', folio: 1200, status: 'Cleared' },
    { id: 'SB-404', guest: 'Lady Gaga', amenity: 'Private Beach Sauna', details: 'Reservation of Emerald Cove thermal cave and spa wellness kit', date: 'June 25, 2026', folio: 1500, status: 'Scheduled' }
];

const AMALFI_DEFAULT_VILLA_STATUSES = {
    'Villa 1': 'AVAILABLE',
    'Villa 2': 'MAINTENANCE',
    'Villa 3': 'AVAILABLE',
    'Villa 4': 'MAINTENANCE',
    'Villa 5': 'AVAILABLE',
    'Villa 6': 'BOOKING_HOLD'
};

async function seedAmalfiOperationalDefaults() {
    const productCount = await dbGetAsync('SELECT COUNT(*) AS count FROM amalfi_products');
    if (!Number(productCount?.count || 0)) {
        for (const item of AMALFI_DEFAULT_PRODUCTS) {
            await dbRunAsync(
                `INSERT INTO amalfi_products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)`,
                [item.id, item.name, item.category, item.price, item.stock]
            );
        }
    }

    const staffCount = await dbGetAsync('SELECT COUNT(*) AS count FROM amalfi_staff');
    if (!Number(staffCount?.count || 0)) {
        for (const person of AMALFI_DEFAULT_STAFF) {
            await dbRunAsync(
                `INSERT INTO amalfi_staff (id, name, position, department, basic_salary, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
                [person.id, person.name, person.position, person.department, person.basicSalary, person.isActive ? 1 : 0]
            );
        }
    }

    const expenseCount = await dbGetAsync('SELECT COUNT(*) AS count FROM amalfi_expenses');
    if (!Number(expenseCount?.count || 0)) {
        for (const item of AMALFI_DEFAULT_EXPENSES) {
            await dbRunAsync(
                `INSERT INTO amalfi_expenses (id, date, vendor, description, department, subcategory, category, amount, payment_method, recurrence)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [item.id, item.date, item.vendor, item.description, item.department, item.subcategory, item.category, item.amount, item.paymentMethod, item.recurrence]
            );
        }
    }

    const requestCount = await dbGetAsync('SELECT COUNT(*) AS count FROM amalfi_service_requests');
    if (!Number(requestCount?.count || 0)) {
        for (const item of AMALFI_DEFAULT_SERVICE_REQUESTS) {
            await dbRunAsync(
                `INSERT INTO amalfi_service_requests (id, reservation_id, guest, villa, category, title, details, status, priority)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [item.id, '', 'Operations', item.villa, item.category, item.title, item.details, item.status, item.priority]
            );
        }
    }

    const specialCount = await dbGetAsync('SELECT COUNT(*) AS count FROM amalfi_special_bookings');
    if (!Number(specialCount?.count || 0)) {
        for (const item of AMALFI_DEFAULT_SPECIAL_BOOKINGS) {
            await dbRunAsync(
                `INSERT INTO amalfi_special_bookings (id, guest, amenity, details, date, folio, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [item.id, item.guest, item.amenity, item.details, item.date, item.folio, item.status]
            );
        }
    }

    for (const [villaId, status] of Object.entries(AMALFI_DEFAULT_VILLA_STATUSES)) {
        await dbRunAsync(
            `INSERT OR IGNORE INTO amalfi_villa_statuses (villa_id, status) VALUES (?, ?)`,
            [villaId, status]
        );
    }
}

const asBool = (value) => value === true || value === 1 || value === '1';
const makeId = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;

const mapAmalfiExpense = (row) => ({
    id: row.id,
    date: row.date,
    vendor: row.vendor,
    description: row.description,
    department: row.department,
    subcategory: row.subcategory,
    category: row.category,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    recurrence: row.recurrence
});

const mapAmalfiStaff = (row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    department: row.department,
    basicSalary: Number(row.basic_salary || 0),
    isActive: Boolean(row.is_active)
});

const mapAmalfiProduct = (row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    isActive: Boolean(row.is_active)
});

const mapAmalfiSale = (row) => ({
    id: row.id,
    date: row.date,
    guest: row.guest,
    villa: row.villa,
    resId: row.res_id,
    checkoutType: row.checkout_type,
    paymentMethod: row.payment_method,
    total: Number(row.total || 0),
    items: safeJsonParse(row.items_json, [])
});

const mapAmalfiRequest = (row) => ({
    id: row.id,
    reservationId: row.reservation_id,
    guest: row.guest,
    villa: row.villa,
    category: row.category,
    title: row.title,
    details: row.details,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at
});

const mapAmalfiSpecialBooking = (row) => ({
    id: row.id,
    guest: row.guest,
    amenity: row.amenity,
    details: row.details,
    date: row.date,
    folio: Number(row.folio || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    status: row.status,
    createdAt: row.created_at
});

const mapAmalfiPayrollRun = (row) => ({
    id: row.id,
    payrollMonth: row.payroll_month,
    runDate: row.run_date,
    grossPay: Number(row.gross_pay || 0),
    deductions: Number(row.deductions || 0),
    netPay: Number(row.net_pay || 0),
    staffCount: Number(row.staff_count || 0),
    status: row.status,
    details: safeJsonParse(row.details_json, [])
});

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

async function loadAmalfiOperationalState() {
    await seedAmalfiOperationalDefaults();
    const [products, expenses, staff, payrollRuns, posSales, requests, specialBookings, statusRows] = await Promise.all([
        dbAllAsync('SELECT * FROM amalfi_products WHERE is_active = 1 ORDER BY category, name'),
        dbAllAsync('SELECT * FROM amalfi_expenses ORDER BY date DESC, vendor'),
        dbAllAsync('SELECT * FROM amalfi_staff ORDER BY department, name'),
        dbAllAsync('SELECT * FROM amalfi_payroll_runs ORDER BY run_date DESC, created_at DESC'),
        dbAllAsync('SELECT * FROM amalfi_pos_sales ORDER BY date DESC, created_at DESC LIMIT 200'),
        dbAllAsync('SELECT * FROM amalfi_service_requests ORDER BY created_at DESC LIMIT 200'),
        dbAllAsync('SELECT * FROM amalfi_special_bookings ORDER BY date DESC, created_at DESC LIMIT 200'),
        dbAllAsync('SELECT * FROM amalfi_villa_statuses ORDER BY villa_id')
    ]);

    return {
        products: products.map(mapAmalfiProduct),
        expenses: expenses.map(mapAmalfiExpense),
        staff: staff.map(mapAmalfiStaff),
        payrollRuns: payrollRuns.map(mapAmalfiPayrollRun),
        posSales: posSales.map(mapAmalfiSale),
        requests: requests.map(mapAmalfiRequest),
        specialBookings: specialBookings.map(mapAmalfiSpecialBooking),
        villaStatuses: Object.fromEntries(statusRows.map((row) => [row.villa_id, row.status]))
    };
}

app.get('/api/v1/admin/amalfi/bootstrap', async (req, res) => {
    try {
        const [rooms, units, pending, ledger, operational] = await Promise.all([
            dbAllAsync('SELECT * FROM rooms ORDER BY price ASC'),
            dbAllAsync('SELECT * FROM units ORDER BY unit_label ASC'),
            dbAllAsync('SELECT * FROM bookings WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 200'),
            dbAllAsync('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200'),
            loadAmalfiOperationalState()
        ]);

        res.json({
            rooms,
            units,
            reservations: pending,
            transactions: ledger,
            ...operational
        });
    } catch (err) {
        console.error('Failed to load Amalfi bootstrap:', err);
        res.status(500).json({ error: 'Unable to load Amalfi backend state.' });
    }
});

app.get('/api/v1/admin/amalfi/ops', async (req, res) => {
    try {
        res.json(await loadAmalfiOperationalState());
    } catch (err) {
        console.error('Failed to load Amalfi ops:', err);
        res.status(500).json({ error: 'Unable to load Amalfi operational state.' });
    }
});

app.get('/api/v1/public/amalfi/villas', requireGuestPortalEnabled, async (req, res) => {
    try {
        const kb = loadKnowledgeBaseJson();
        const rooms = await dbAllAsync('SELECT * FROM rooms ORDER BY price ASC');
        const villas = rooms.map((room) => {
            const meta = (kb.accommodations || []).find((item) => normalizeRoomKey(item.name) === normalizeRoomKey(room.room_type)) || {};
            return {
                id: meta.unit_labels?.[0]?.match(/Villa \d+/)?.[0] || room.room_type,
                roomType: room.room_type,
                name: room.room_type,
                category: Number(meta.max_capacity_pax || 0) > 4 ? 'Large Luxury Villa' : 'Medium Sized Luxury Villa',
                nightlyRate: Number(room.price || 0),
                cap: Number(meta.max_capacity_pax || 1),
                image: meta.image || '/api/v1/assets/logo/resort-logo.jpg',
                unitId: normalizeRoomKey(room.room_type) ? `${normalizeRoomKey(room.room_type)}-1` : null
            };
        });
        res.json({ villas });
    } catch (err) {
        console.error('Failed to load Amalfi villas:', err);
        res.status(500).json({ error: 'Unable to load Amalfi villas.' });
    }
});

app.post('/api/v1/public/amalfi/book', requireGuestPortalEnabled, async (req, res) => {
    try {
        const {
            villa_id,
            room_type,
            unit_id,
            full_name,
            email,
            phone,
            check_in,
            check_out,
            guests,
            total_price,
            balance,
            payment_reference,
            addons = {}
        } = req.body || {};

        if (!full_name || !check_in || !check_out || (!room_type && !villa_id)) {
            return res.status(400).json({ error: 'Missing required booking fields.' });
        }

        const requestedRoomType = room_type || villa_id;
        const room = await dbGetAsync(
            `SELECT id, room_type, price FROM rooms WHERE room_type = ? OR marketing_name = ? OR id = ? LIMIT 1`,
            [requestedRoomType, requestedRoomType, fallbackRoomTypeId(requestedRoomType)]
        );
        if (!room) return res.status(400).json({ error: `Villa "${requestedRoomType}" is not available for booking.` });

        const availableUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out, roomType: room.room_type });
        const selectedUnit = unit_id
            ? availableUnits.find((unit) => unit.unit_id === unit_id)
            : availableUnits[0];

        if (!selectedUnit) {
            return res.status(409).json({ error: `${room.room_type} is already booked or blocked for the selected dates.` });
        }

        const guestCount = Number(guests || 1);
        if (guestCount > Number(selectedUnit.absolute_max_pax || 1)) {
            return res.status(409).json({ error: `${selectedUnit.unit_label || room.room_type} can only accommodate ${selectedUnit.absolute_max_pax} guests.` });
        }

        const prefixMap = { 'Amalfi Suite': 'AMS', 'Positano Vista': 'POS', 'Ravello Suite': 'RAV', 'Capri Vista': 'CAP', 'Sirenuse Suite': 'SIR', 'Sunset Pavilion': 'SUN' };
        const prefix = prefixMap[room.room_type] || 'AML';
        const bookingRef = `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const total = Number(total_price || 0);
        const balanceDue = Number(balance ?? total);

        await dbRunAsync(
            `INSERT INTO bookings
             (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, addon_amount, booking_mode, status, payment_status, booking_source, special_requests)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                bookingRef,
                room.room_type,
                selectedUnit.unit_id,
                check_in,
                check_out,
                guestCount,
                full_name,
                email || '',
                phone || '',
                total,
                balanceDue,
                Number(total - (Number(room.price || 0) * Math.max(1, computeStayNights(check_in, check_out))) || 0),
                BOOKING_MODE_STANDARD,
                BOOKING_STATUS_PENDING_VERIFICATION,
                'PENDING_VERIFICATION',
                'Amalfi Guest Portal',
                JSON.stringify({ addons })
            ]
        );

        await dbRunAsync(
            `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                bookingRef,
                Math.max(0, total - balanceDue),
                'deposit',
                'PENDING_VERIFICATION',
                'Guest Reference',
                payment_reference ? `Guest submitted reference: ${payment_reference}` : 'Guest submitted booking without a reference note.'
            ]
        );

        logAction('create_amalfi_guest_booking', 'booking', bookingRef, `Guest: ${full_name} | Unit: ${selectedUnit.unit_id}`, 'public_portal', req.ip);
        res.status(201).json({
            booking_ref: bookingRef,
            status: BOOKING_STATUS_PENDING_VERIFICATION,
            payment_status: 'PENDING_VERIFICATION',
            unit_id: selectedUnit.unit_id
        });
    } catch (err) {
        console.error('Failed to create Amalfi guest booking:', err);
        res.status(500).json({ error: err.message || 'Unable to create booking.' });
    }
});

app.post('/api/v1/admin/amalfi/manual-booking', async (req, res) => {
    try {
        const {
            villa_id,
            room_type,
            full_name,
            email = '',
            phone = '',
            check_in,
            check_out,
            guests = 1,
            total_price = 0,
            status,
            payment_status,
            notes = 'Created from Amalfi mobile admin.'
        } = req.body || {};

        if (!full_name || !check_in || !check_out || (!room_type && !villa_id)) {
            return res.status(400).json({ error: 'Missing required manual booking fields.' });
        }

        const villaRoomMap = {
            'Villa 1': 'Amalfi Suite',
            'Villa 2': 'Positano Vista',
            'Villa 3': 'Ravello Suite',
            'Villa 4': 'Capri Vista',
            'Villa 5': 'Sirenuse Suite',
            'Villa 6': 'Sunset Pavilion'
        };
        const requestedRoomType = room_type || villaRoomMap[villa_id] || villa_id;
        const room = await dbGetAsync(
            `SELECT id, room_type, price FROM rooms WHERE room_type = ? OR id = ? LIMIT 1`,
            [requestedRoomType, fallbackRoomTypeId(requestedRoomType)]
        );
        if (!room) return res.status(400).json({ error: `Villa "${requestedRoomType}" is not available for booking.` });

        const availableUnits = await listDeskAvailability({ checkIn: check_in, checkOut: check_out, roomType: room.room_type });
        const selectedUnit = availableUnits[0];
        if (!selectedUnit) {
            return res.status(409).json({ error: `${room.room_type} is already booked or blocked for the selected dates.` });
        }

        const prefixMap = { 'Amalfi Suite': 'AMS', 'Positano Vista': 'POS', 'Ravello Suite': 'RAV', 'Capri Vista': 'CAP', 'Sirenuse Suite': 'SIR', 'Sunset Pavilion': 'SUN' };
        const prefix = prefixMap[room.room_type] || 'AML';
        const bookingRef = `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const total = Number(total_price || 0);
        const bookingStatus = status ? normalizeBookingStatus(status) : BOOKING_STATUS_RESERVED;
        const paymentSummary = payment_status || PAYMENT_SUMMARY_PAID;
        const balanceDue = ['FULL', 'PAID', PAYMENT_SUMMARY_PAID].includes(String(paymentSummary).toUpperCase()) ? 0 : total;
        const verifiedPaid = Math.max(0, total - balanceDue);

        await dbRunAsync(
            `INSERT INTO bookings
             (booking_ref, room_type, unit_id, check_in, check_out, guests, full_name, email, phone, total_price, balance, addon_amount, booking_mode, status, payment_status, booking_source, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
            [
                bookingRef,
                room.room_type,
                selectedUnit.unit_id,
                check_in,
                check_out,
                Number(guests || 1),
                full_name,
                email,
                phone,
                total,
                BOOKING_MODE_STANDARD,
                bookingStatus,
                paymentSummary,
                'Amalfi Mobile Admin',
                notes
            ]
        );
        if (balanceDue > 0) {
            await dbRunAsync(`UPDATE bookings SET balance = ? WHERE booking_ref = ?`, [balanceDue, bookingRef]);
        }

        if (verifiedPaid > 0) {
            await dbRunAsync(
                `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                 VALUES (?, ?, 'Full Payment', 'VERIFIED', 'Manual Admin', ?)`,
                [bookingRef, verifiedPaid, 'Recorded from Amalfi admin.']
            );
        }

        logAction('create_amalfi_manual_booking', 'booking', bookingRef, `Guest: ${full_name} | Unit: ${selectedUnit.unit_id}`, 'admin', req.ip);
        res.status(201).json({
            booking_ref: bookingRef,
            status: bookingStatus,
            payment_status: paymentSummary,
            unit_id: selectedUnit.unit_id
        });
    } catch (err) {
        console.error('Failed to create Amalfi manual booking:', err);
        res.status(500).json({ error: err.message || 'Unable to create manual booking.' });
    }
});

app.post('/api/v1/admin/amalfi/products', async (req, res) => {
    try {
        const item = req.body || {};
        const id = item.id || makeId('prod');
        await dbRunAsync(
            `INSERT INTO amalfi_products (id, name, category, price, stock, is_active)
             VALUES (?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, price=excluded.price, stock=excluded.stock, updated_at=CURRENT_TIMESTAMP`,
            [id, item.name, item.category, Number(item.price || 0), Number(item.stock || 0)]
        );
        logAction('upsert_product', 'amalfi_product', id, `Product: ${item.name}`, 'admin', req.ip);
        res.json({ ok: true, product: { id, ...item } });
    } catch (err) {
        console.error('Failed to save Amalfi product:', err);
        res.status(500).json({ error: 'Unable to save product.' });
    }
});

app.delete('/api/v1/admin/amalfi/products/:id', async (req, res) => {
    try {
        await dbRunAsync(`UPDATE amalfi_products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
        logAction('archive_product', 'amalfi_product', req.params.id, 'Product archived', 'admin', req.ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('Failed to archive Amalfi product:', err);
        res.status(500).json({ error: 'Unable to archive product.' });
    }
});

app.post('/api/v1/admin/amalfi/pos-sales', async (req, res) => {
    try {
        const sale = req.body || {};
        const id = sale.id || makeId('sale');
        const items = Array.isArray(sale.items) ? sale.items : [];
        const total = Number(sale.total ?? items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0));
        await dbRunAsync(
            `INSERT INTO amalfi_pos_sales (id, date, guest, villa, res_id, checkout_type, payment_method, total, items_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, sale.date || new Date().toISOString().slice(0, 10), sale.guest || 'Walk-in Guest', sale.villa || 'N/A', sale.resId || null, sale.checkoutType || 'direct', sale.paymentMethod || 'Cash', total, JSON.stringify(items)]
        );
        for (const item of items) {
            if (item.id) {
                await dbRunAsync(`UPDATE amalfi_products SET stock = MAX(stock - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [Number(item.qty || 1), item.id]);
            }
        }
        logAction('create_pos_sale', 'amalfi_pos_sale', id, `POS total: ${total}`, 'admin', req.ip);
        res.json({ ok: true, sale: { id, ...sale, total, items } });
    } catch (err) {
        console.error('Failed to record Amalfi POS sale:', err);
        res.status(500).json({ error: 'Unable to record POS sale.' });
    }
});

app.post('/api/v1/admin/amalfi/expenses', async (req, res) => {
    try {
        const item = req.body || {};
        const id = item.id || makeId('exp');
        await dbRunAsync(
            `INSERT INTO amalfi_expenses (id, date, vendor, description, department, subcategory, category, amount, payment_method, recurrence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET date=excluded.date, vendor=excluded.vendor, description=excluded.description,
                 department=excluded.department, subcategory=excluded.subcategory, category=excluded.category,
                 amount=excluded.amount, payment_method=excluded.payment_method, recurrence=excluded.recurrence,
                 updated_at=CURRENT_TIMESTAMP`,
            [id, item.date, item.vendor, item.description, item.department, item.subcategory, item.category, Number(item.amount || 0), item.paymentMethod, item.recurrence]
        );
        logAction('upsert_expense', 'amalfi_expense', id, `Expense: ${item.vendor || item.description}`, 'admin', req.ip);
        res.json({ ok: true, expense: { id, ...item } });
    } catch (err) {
        console.error('Failed to save Amalfi expense:', err);
        res.status(500).json({ error: 'Unable to save expense.' });
    }
});

app.post('/api/v1/admin/amalfi/staff', async (req, res) => {
    try {
        const person = req.body || {};
        const id = person.id || makeId('staff');
        await dbRunAsync(
            `INSERT INTO amalfi_staff (id, name, position, department, basic_salary, is_active)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, position=excluded.position, department=excluded.department,
                 basic_salary=excluded.basic_salary, is_active=excluded.is_active, updated_at=CURRENT_TIMESTAMP`,
            [id, person.name, person.position, person.department, Number(person.basicSalary || 0), asBool(person.isActive ?? true) ? 1 : 0]
        );
        logAction('upsert_staff', 'amalfi_staff', id, `Staff: ${person.name}`, 'admin', req.ip);
        res.json({ ok: true, staff: { id, ...person } });
    } catch (err) {
        console.error('Failed to save Amalfi staff:', err);
        res.status(500).json({ error: 'Unable to save staff.' });
    }
});

app.post('/api/v1/admin/amalfi/payroll-runs', async (req, res) => {
    try {
        const run = req.body || {};
        const details = Array.isArray(run.details) ? run.details : [];
        const id = run.id || makeId('payroll');
        const grossPay = Number(run.grossPay ?? details.reduce((sum, item) => sum + Number(item.grossPay || item.basicSalary || 0), 0));
        const deductions = Number(run.deductions ?? details.reduce((sum, item) => sum + Number(item.deductions || 0), 0));
        const netPay = Number(run.netPay ?? (grossPay - deductions));
        await dbRunAsync(
            `INSERT INTO amalfi_payroll_runs (id, payroll_month, run_date, gross_pay, deductions, net_pay, staff_count, status, details_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, run.payrollMonth, run.runDate || new Date().toISOString().slice(0, 10), grossPay, deductions, netPay, Number(run.staffCount || details.length || 0), run.status || 'posted', JSON.stringify(details)]
        );
        logAction('create_payroll_run', 'amalfi_payroll_run', id, `Payroll net: ${netPay}`, 'admin', req.ip);
        res.json({ ok: true, payrollRun: { id, ...run, grossPay, deductions, netPay, details } });
    } catch (err) {
        console.error('Failed to save Amalfi payroll run:', err);
        res.status(500).json({ error: 'Unable to save payroll run.' });
    }
});

app.post('/api/v1/admin/amalfi/service-requests', async (req, res) => {
    try {
        const item = req.body || {};
        const id = item.id || makeId('req');
        await dbRunAsync(
            `INSERT INTO amalfi_service_requests (id, reservation_id, guest, villa, category, title, details, status, priority)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET reservation_id=excluded.reservation_id, guest=excluded.guest, villa=excluded.villa,
                 category=excluded.category, title=excluded.title, details=excluded.details, status=excluded.status,
                 priority=excluded.priority, updated_at=CURRENT_TIMESTAMP`,
            [id, item.reservationId, item.guest, item.villa, item.category, item.title, item.details, item.status || 'Pending', item.priority || 'Normal']
        );
        logAction('upsert_service_request', 'amalfi_service_request', id, `Request: ${item.title || item.category}`, 'admin', req.ip);
        res.json({ ok: true, request: { id, ...item } });
    } catch (err) {
        console.error('Failed to save Amalfi service request:', err);
        res.status(500).json({ error: 'Unable to save service request.' });
    }
});

app.delete('/api/v1/admin/amalfi/service-requests/:id', async (req, res) => {
    try {
        await dbRunAsync(`DELETE FROM amalfi_service_requests WHERE id = ?`, [req.params.id]);
        logAction('delete_service_request', 'amalfi_service_request', req.params.id, 'Service request removed', 'admin', req.ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('Failed to delete Amalfi service request:', err);
        res.status(500).json({ error: 'Unable to delete service request.' });
    }
});

app.post('/api/v1/admin/amalfi/special-bookings', async (req, res) => {
    try {
        const item = req.body || {};
        const id = item.id || makeId('sb');
        const folio = Number(String(item.folio || '0').replace(/,/g, '')) || 0;
        await dbRunAsync(
            `INSERT INTO amalfi_special_bookings (id, guest, amenity, details, date, folio, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET guest=excluded.guest, amenity=excluded.amenity, details=excluded.details,
                 date=excluded.date, folio=excluded.folio, status=excluded.status, updated_at=CURRENT_TIMESTAMP`,
            [id, item.guest, item.amenity, item.details, item.date, folio, item.status || 'Pending verification']
        );
        logAction('upsert_special_booking', 'amalfi_special_booking', id, `Special booking: ${item.amenity}`, 'admin', req.ip);
        res.json({ ok: true, specialBooking: { id, ...item, folio } });
    } catch (err) {
        console.error('Failed to save Amalfi special booking:', err);
        res.status(500).json({ error: 'Unable to save special booking.' });
    }
});

app.delete('/api/v1/admin/amalfi/special-bookings/:id', async (req, res) => {
    try {
        await dbRunAsync(`DELETE FROM amalfi_special_bookings WHERE id = ?`, [req.params.id]);
        logAction('delete_special_booking', 'amalfi_special_booking', req.params.id, 'Special booking removed', 'admin', req.ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('Failed to delete Amalfi special booking:', err);
        res.status(500).json({ error: 'Unable to delete special booking.' });
    }
});

app.patch('/api/v1/admin/amalfi/villa-statuses/:villaId', async (req, res) => {
    try {
        const villaId = decodeURIComponent(req.params.villaId);
        const { status = 'AVAILABLE', note = null } = req.body || {};
        await dbRunAsync(
            `INSERT INTO amalfi_villa_statuses (villa_id, status, note, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(villa_id) DO UPDATE SET status=excluded.status, note=excluded.note, updated_at=CURRENT_TIMESTAMP`,
            [villaId, status, note]
        );
        logAction('update_villa_status', 'amalfi_villa_status', villaId, `Status: ${status}`, 'admin', req.ip);
        res.json({ ok: true, villaId, status, note });
    } catch (err) {
        console.error('Failed to update Amalfi villa status:', err);
        res.status(500).json({ error: 'Unable to update villa status.' });
    }
});

async function findBlockingDateTag(unitId, checkIn, checkOut) {
    if (!unitId || !checkIn || !checkOut) return null;
    return dbGetAsync(
        `SELECT id, unit_id, tag_type, start_date, end_date, note
         FROM unit_date_tags
         WHERE unit_id = ?
           AND blocks_inventory = 1
           AND start_date < ? AND end_date > ?
         LIMIT 1`,
        [unitId, checkOut, checkIn]
    );
}

const normalizeSnapshotHeader = (value = '') =>
    String(value).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

const normalizeSnapshotText = (value = '') =>
    String(value ?? '').trim().replace(/\s+/g, ' ');

const parseSnapshotMoney = (value = '') => {
    const raw = normalizeSnapshotText(value).replace(/,/g, '');
    if (!raw) return 0;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseSnapshotGuests = (value = '') => {
    const raw = normalizeSnapshotText(value);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseSnapshotDate = (value = '') => {
    const raw = normalizeSnapshotText(value);
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return raw;
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
};

const getSnapshotValue = (get, row, names = [], def = '') => {
    for (const name of names) {
        const value = get(row, name, '');
        if (normalizeSnapshotText(value)) return value;
    }
    return def;
};

const inferSnapshotStatus = (checkIn, checkOut) => {
    const today = manilaDateKey();
    if (checkOut <= today) return BOOKING_STATUS_CHECKED_OUT;
    if (checkIn <= today && checkOut > today) return BOOKING_STATUS_CHECKED_IN;
    return BOOKING_STATUS_RESERVED;
};

const inferSnapshotPaymentStatus = (totalPrice, amountPaid) => {
    return derivePaymentSummary({ grossTotal: totalPrice, netPaid: amountPaid, hasPendingProof: true });
};

const snapshotSlug = (value = '') =>
    normalizeSnapshotText(value)
        .toLowerCase()
        .replace(/#/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const snapshotRoomLabel = (roomTypeId = '') => {
    const labels = {
        'amalfi-suite': 'Amalfi Suite',
        'positano-vista': 'Positano Vista',
        'ravello-suite': 'Ravello Suite',
        'capri-vista': 'Capri Vista',
        'sirenuse-suite': 'Sirenuse Suite',
        'sunset-pavilion': 'Sunset Pavilion',
    };
    return labels[roomTypeId] || roomTypeId;
};

const extractSnapshotUnitNumber = (unitId = '') => {
    const match = String(unitId).match(/-(\d+)$/);
    return match ? match[1] : '';
};

function buildSnapshotUnitLookup(units = []) {
    const lookup = new Map();
    const addAlias = (alias, unit) => {
        const key = snapshotSlug(alias);
        if (key) lookup.set(key, unit);
    };

    for (const unit of units) {
        const num = extractSnapshotUnitNumber(unit.unit_id);
        const roomLabel = snapshotRoomLabel(unit.room_type_id);
        addAlias(unit.unit_id, unit);
        addAlias(unit.unit_label, unit);
        if (num) {
            addAlias(`${roomLabel} ${num}`, unit);
            addAlias(`${roomLabel} #${num}`, unit);
        }
        if (unit.room_type_id === 'amalfi-suite') addAlias('Villa 1', unit);
        if (unit.room_type_id === 'positano-vista') addAlias('Villa 2', unit);
        if (unit.room_type_id === 'ravello-suite') addAlias('Villa 3', unit);
        if (unit.room_type_id === 'capri-vista') addAlias('Villa 4', unit);
        if (unit.room_type_id === 'sirenuse-suite') addAlias('Villa 5', unit);
        if (unit.room_type_id === 'sunset-pavilion') addAlias('Villa 6', unit);
    }

    return lookup;
}

function summarizeSnapshotPreview(rows = []) {
    return rows.reduce((acc, row) => {
        acc.total_rows += 1;
        acc.action_counts[row.action] = (acc.action_counts[row.action] || 0) + 1;
        acc.status_counts[row.status] = (acc.status_counts[row.status] || 0) + 1;
        acc.total_paid += row.amount_paid || 0;
        acc.total_balance += row.balance || 0;
        acc.total_gross += row.total_price || 0;
        return acc;
    }, {
        total_rows: 0,
        action_counts: {},
        status_counts: {},
        total_paid: 0,
        total_balance: 0,
        total_gross: 0,
    });
}

async function classifySnapshotRowsFromText(text) {
    const parsed = parseCSV(text);
    if (parsed.length < 2) {
        const err = new Error('CSV has no data rows.');
        err.statusCode = 400;
        throw err;
    }

    const header = parsed[0].map(normalizeSnapshotHeader);
    const dataRows = parsed.slice(1).filter(row => row.some(cell => String(cell || '').trim()));
    const colIdx = (name) => header.indexOf(name);
    const get = (row, name, def = '') => {
        const idx = colIdx(name);
        return idx >= 0 && row[idx] !== undefined ? row[idx] : def;
    };

    const units = await dbAllAsync(`SELECT unit_id, unit_label, room_type_id FROM units ORDER BY unit_id`);
    const existingBookings = await dbAllAsync(`
        SELECT booking_ref, full_name, full_name as guest_name, room_type, unit_id, check_in, check_out,
               status, booking_mode, payment_status, booking_source,
               COALESCE(import_source, '') as import_source,
               COALESCE(import_batch_id, '') as import_batch_id,
               COALESCE(import_locked, 0) as import_locked
        FROM bookings
        WHERE is_deleted = 0
    `);

    const unitLookup = buildSnapshotUnitLookup(units);
    const previewRows = dataRows.map((row, index) => {
        const guestName = normalizeSnapshotText(getSnapshotValue(get, row, ['guest_name', 'full_name']));
        const rawUnit = normalizeSnapshotText(getSnapshotValue(get, row, ['unit', 'unit_id']));
        const mappedUnit = unitLookup.get(snapshotSlug(rawUnit)) || null;
        const checkIn = parseSnapshotDate(getSnapshotValue(get, row, ['check_in', 'checkin']));
        const checkOut = parseSnapshotDate(getSnapshotValue(get, row, ['check_out', 'checkout']));
        const guests = parseSnapshotGuests(getSnapshotValue(get, row, ['guests', 'pax']));
        const amountPaid = parseSnapshotMoney(getSnapshotValue(get, row, ['amount_paid', 'dp']));
        const balance = parseSnapshotMoney(getSnapshotValue(get, row, ['balance']));
        const explicitTotalPrice = parseSnapshotMoney(getSnapshotValue(get, row, ['total_price']));
        const totalPrice = explicitTotalPrice > 0 ? explicitTotalPrice : (amountPaid + balance);
        const addonAmount = parseSnapshotMoney(getSnapshotValue(get, row, ['addon_amount']));
        const bookingSource = normalizeSnapshotText(getSnapshotValue(get, row, ['booking_source'], 'Snapshot CSV Import')) || 'Snapshot CSV Import';
        const specialRequests = normalizeSnapshotText(getSnapshotValue(get, row, ['special_requests']));
        const sourceBookingRef = normalizeSnapshotText(getSnapshotValue(get, row, ['booking_ref']));
        const explicitRoomType = normalizeSnapshotText(getSnapshotValue(get, row, ['room_type']));
        const roomType = explicitRoomType || (mappedUnit ? snapshotRoomLabel(mappedUnit.room_type_id) : null);
        const rowNotes = normalizeSnapshotText(getSnapshotValue(get, row, ['notes']));
        const warnings = [];
        const errors = [];

        if (!guestName) errors.push('Missing Guest Name');
        if (!rawUnit) errors.push('Missing Unit');
        if (rawUnit && !mappedUnit) errors.push(`Unit not mapped: ${rawUnit}`);
        if (!checkIn) errors.push(`Invalid Check-in: ${getSnapshotValue(get, row, ['check_in', 'checkin'])}`);
        if (!checkOut) errors.push(`Invalid Check-out: ${getSnapshotValue(get, row, ['check_out', 'checkout'])}`);
        if (guests === null) warnings.push('Missing Pax');

        const status = normalizeBookingStatus(normalizeSnapshotText(getSnapshotValue(get, row, ['status'])) || ((checkIn && checkOut) ? inferSnapshotStatus(checkIn, checkOut) : BOOKING_STATUS_RESERVED));
        const paymentStatus = normalizePaymentSummary(normalizeSnapshotText(getSnapshotValue(get, row, ['payment_status'])) || inferSnapshotPaymentStatus(totalPrice, amountPaid), { hasProof: amountPaid > 0 });
        const exactMatches = mappedUnit ? existingBookings.filter(booking =>
            booking.unit_id === mappedUnit.unit_id &&
            booking.check_in === checkIn &&
            booking.check_out === checkOut
        ) : [];
        const importerOwnedMatches = exactMatches.filter(booking =>
            booking.booking_mode === BOOKING_MODE_MANUAL_OVERRIDE &&
            Number(booking.import_locked || 0) !== 1
        );
        const protectedExactMatches = exactMatches.filter(booking => !importerOwnedMatches.includes(booking));
        const overlappingMatches = mappedUnit ? existingBookings.filter(booking =>
            booking.unit_id === mappedUnit.unit_id &&
            SNAPSHOT_BLOCKING_STATUSES.includes(booking.status) &&
            checkIn && checkOut &&
            booking.check_in < checkOut &&
            booking.check_out > checkIn
        ) : [];
        const protectedOverlaps = overlappingMatches.filter(booking =>
            !importerOwnedMatches.some(match => match.booking_ref === booking.booking_ref)
        );

        let action = 'CREATE';
        let reason = 'Ready to create a new manual-override snapshot row.';

        if (errors.length > 0) {
            action = 'ERROR';
            reason = errors.join(' | ');
        } else if (importerOwnedMatches.length > 1) {
            action = 'CONFLICT';
            reason = 'Multiple importer-owned rows match this unit and date range.';
        } else if (protectedExactMatches.length > 0) {
            action = 'CONFLICT';
            reason = `Exact stay already exists as protected booking ${protectedExactMatches[0].booking_ref}.`;
        } else if (importerOwnedMatches.length === 1) {
            action = 'UPDATE';
            reason = `Will update importer-owned booking ${importerOwnedMatches[0].booking_ref}.`;
        } else if (protectedOverlaps.length > 0) {
            action = 'CONFLICT';
            reason = `Overlaps protected booking ${protectedOverlaps[0].booking_ref}.`;
        }

        return {
            source_row: index + 2,
            source_booking_ref: sourceBookingRef || null,
            guest_name: guestName,
            raw_unit: rawUnit,
            unit_id: mappedUnit?.unit_id || null,
            room_type: roomType,
            check_in: checkIn,
            check_out: checkOut,
            guests,
            amount_paid: amountPaid,
            balance,
            total_price: totalPrice,
            addon_amount: addonAmount,
            status,
            payment_status: paymentStatus,
            booking_source: bookingSource,
            notes: rowNotes,
            special_requests: specialRequests,
            booking_mode: BOOKING_MODE_MANUAL_OVERRIDE,
            action,
            reason,
            warnings,
            errors,
            existing_booking_ref: importerOwnedMatches[0]?.booking_ref || null,
        };
    });

    return {
        rows: previewRows,
        summary: summarizeSnapshotPreview(previewRows),
    };
}

app.post('/api/v1/admin/bookings/snapshot/preview', csvUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });
        if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
            return res.status(400).json({ error: 'File must be a .csv' });
        }

        const preview = await classifySnapshotRowsFromText(req.file.buffer.toString('utf8'));
        res.json({
            filename: req.file.originalname,
            ...preview,
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || 'Snapshot preview failed.' });
    }
});

app.post('/api/v1/admin/bookings/snapshot/apply', csvUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });
        if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
            return res.status(400).json({ error: 'File must be a .csv' });
        }

        const adminId = req.body.admin_id || 'admin';
        const batchId = `snapshot-${randomUUID().slice(0, 8)}`;
        const preview = await classifySnapshotRowsFromText(req.file.buffer.toString('utf8'));
        const actionableRows = preview.rows.filter(row => row.action === 'CREATE' || row.action === 'UPDATE');
        const blockedRows = preview.rows.filter(row => row.action === 'CONFLICT' || row.action === 'ERROR');

        if (!actionableRows.length && blockedRows.length) {
            return res.status(409).json({
                error: 'No safe rows available to apply.',
                summary: preview.summary,
                rows: preview.rows
            });
        }

        await dbRunAsync('BEGIN TRANSACTION');
        let created = 0;
        let updated = 0;

        try {
            for (const row of actionableRows) {
                if (row.action === 'CREATE') {
                    const prefix = UNIT_PREFIX[row.room_type] || 'SNP';
                    const bookingRef = `${prefix}-SNP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
                    await dbRunAsync(
                        `INSERT INTO bookings (
                          booking_ref, room_type, check_in, check_out, guests, full_name,
                          email, phone, total_price, balance, amount_paid, status,
                          payment_status, booking_source, booking_mode, created_by,
                          import_source, import_batch_id, notes, addon_amount, special_requests, unit_id, booking_type
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            bookingRef,
                            row.room_type,
                            row.check_in,
                            row.check_out,
                            row.guests,
                            row.guest_name,
                            '',
                            '',
                            row.total_price,
                            row.balance,
                            row.amount_paid,
                            row.status,
                            row.payment_status,
                            row.booking_source || 'Snapshot CSV Import',
                            BOOKING_MODE_MANUAL_OVERRIDE,
                            'admin',
                            SNAPSHOT_IMPORT_SOURCE,
                            batchId,
                            row.notes || `Snapshot import row ${row.source_row}${row.source_booking_ref ? ` | Source ref ${row.source_booking_ref}` : ''}`,
                            row.addon_amount || 0,
                            row.special_requests || '',
                            row.unit_id,
                            'overnight'
                        ]
                    );

                    if (row.amount_paid > 0) {
                        const transactionType = row.amount_paid >= row.total_price && row.total_price > 0 ? 'Full Payment' : 'deposit';
                        await dbRunAsync(
                            `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                             VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
                            [
                                bookingRef,
                                row.amount_paid,
                                transactionType,
                                SNAPSHOT_PAYMENT_METHOD,
                                `Snapshot import batch ${batchId} row ${row.source_row}`
                            ]
                        );
                    }

                    logAction('snapshot_import_create', 'booking', bookingRef, `Snapshot create | ${row.guest_name} | Admin: ${adminId}`, 'admin_portal');
                    created += 1;
                }

                if (row.action === 'UPDATE' && row.existing_booking_ref) {
                    await dbRunAsync(
                        `UPDATE bookings
                         SET room_type = ?, check_in = ?, check_out = ?, guests = ?,
                             full_name = ?, total_price = ?,
                             balance = ?, amount_paid = ?, status = ?,
                             payment_status = ?, booking_source = ?, booking_mode = ?, created_by = ?,
                             import_source = ?, import_batch_id = ?, notes = ?, addon_amount = ?, special_requests = ?,
                             unit_id = ?, booking_type = 'overnight'
                         WHERE booking_ref = ?`,
                        [
                            row.room_type,
                            row.check_in,
                            row.check_out,
                            row.guests,
                            row.guest_name,
                            row.total_price,
                            row.balance,
                            row.amount_paid,
                            row.status,
                            row.payment_status,
                            row.booking_source || 'Snapshot CSV Import',
                            BOOKING_MODE_MANUAL_OVERRIDE,
                            'admin',
                            SNAPSHOT_IMPORT_SOURCE,
                            batchId,
                            row.notes || `Snapshot import row ${row.source_row}${row.source_booking_ref ? ` | Source ref ${row.source_booking_ref}` : ''}`,
                            row.addon_amount || 0,
                            row.special_requests || '',
                            row.unit_id,
                            row.existing_booking_ref
                        ]
                    );

                    await dbRunAsync(
                        `DELETE FROM transactions
                         WHERE booking_ref = ?
                           AND payment_method IN ('Legacy CSV Import', 'Snapshot CSV Import')`,
                        [row.existing_booking_ref]
                    );

                    if (row.amount_paid > 0) {
                        const transactionType = row.amount_paid >= row.total_price && row.total_price > 0 ? 'Full Payment' : 'deposit';
                        await dbRunAsync(
                            `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                             VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
                            [
                                row.existing_booking_ref,
                                row.amount_paid,
                                transactionType,
                                SNAPSHOT_PAYMENT_METHOD,
                                `Snapshot import batch ${batchId} row ${row.source_row}`
                            ]
                        );
                    }

                    logAction('snapshot_import_update', 'booking', row.existing_booking_ref, `Snapshot update | ${row.guest_name} | Admin: ${adminId}`, 'admin_portal');
                    updated += 1;
                }
            }

            await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_status IN ('Occupied', 'Checked In')`);
            await dbRunAsync(`
                UPDATE units
                SET unit_status = 'Checked In'
                WHERE unit_id IN (
                    SELECT DISTINCT unit_id
                    FROM bookings
                    WHERE status IN (${quoteSqlStrings([BOOKING_STATUS_CHECKED_IN, LEGACY_OCCUPIED_STATUS])})
                      AND unit_id IS NOT NULL
                      AND is_deleted = 0
                )
            `);

            await dbRunAsync('COMMIT');
        } catch (innerError) {
            await dbRunAsync('ROLLBACK');
            throw innerError;
        }

        res.json({
            message: `Snapshot import applied with batch ${batchId}.`,
            batch_id: batchId,
            created,
            updated,
            skipped: preview.rows.filter(row => row.action === 'SKIP').length,
            conflicts: blockedRows.filter(row => row.action === 'CONFLICT').length,
            errors: blockedRows.filter(row => row.action === 'ERROR').length,
            summary: preview.summary,
            rows: preview.rows,
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || 'Snapshot import failed.' });
    }
});

app.post('/api/v1/admin/bookings/import', csvUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!req.file.originalname.toLowerCase().endsWith('.csv'))
        return res.status(400).json({ error: 'File must be a .csv' });

    const text   = req.file.buffer.toString('utf8');
    const parsed = parseCSV(text);
    if (parsed.length < 2) return res.status(400).json({ error: 'CSV has no data rows.' });

    // Map header Ã¢â€ â€™ column index (case-insensitive)
    const header = parsed[0].map(h => h.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''));
    const colIdx = (name) => header.indexOf(name);

    const get = (row, name, def = '') => {
        const i = colIdx(name);
        return i >= 0 && row[i] !== undefined ? (row[i].trim() || def) : def;
    };

    const inserted = [], skipped = [], errors = [];

    const dataRows = parsed.slice(1).filter(r => r.some(c => c.trim()));
    let pending = dataRows.length;
    if (pending === 0) return res.json({ inserted: 0, skipped: 0, errors: [] });

    const finish = () => {
        if (--pending === 0)
            res.json({ inserted: inserted.length, skipped: skipped.length, errors });
    };

    for (let i = 0; i < dataRows.length; i++) {
        const row    = dataRows[i];
        const rowNum = i + 2; // 1-indexed, +1 for header

        const full_name = get(row, 'full_name');
        const check_in  = get(row, 'check_in');
        const check_out = get(row, 'check_out');

        if (!full_name || !check_in || !check_out) {
            errors.push({ row: rowNum, reason: 'Missing required field: full_name, check_in, or check_out' });
            finish(); continue;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(check_out)) {
            errors.push({ row: rowNum, reason: 'Dates must be YYYY-MM-DD format' });
            finish(); continue;
        }

        const booking_type  = get(row, 'booking_type', 'overnight');
        const room_type     = get(row, 'room_type', booking_type);
        const unit_id       = get(row, 'unit_id') || null;
        const email         = get(row, 'email');
        const phone         = get(row, 'phone');
        const guests        = parseInt(get(row, 'guests', '1')) || 1;
        const total_price   = parseFloat(get(row, 'total_price', '0')) || 0;
        const amount_paid   = parseFloat(get(row, 'amount_paid', '0')) || 0;
        const addon_amount  = parseFloat(get(row, 'addon_amount', '0')) || 0;
        const payment_status = normalizePaymentSummary(
            get(row, 'payment_status') || derivePaymentSummary({ grossTotal: total_price, netPaid: amount_paid, hasPendingProof: amount_paid > 0 }),
            { hasProof: amount_paid > 0 }
        );
        const booking_source = get(row, 'booking_source', 'CSV Import');
        const status         = normalizeBookingStatus(get(row, 'status', BOOKING_STATUS_RESERVED));
        const booking_mode   = get(row, 'booking_mode', BOOKING_MODE_MANUAL_OVERRIDE);
        const notes          = get(row, 'notes');
        const special_requests = get(row, 'special_requests');
        const balance        = Math.max(0, total_price - amount_paid);
        const created_at     = get(row, 'created_at') || get(row, 'Created At') || null;

        // Auto-generate booking_ref if blank
        let booking_ref = get(row, 'booking_ref');
        if (!booking_ref) {
            const prefix = UNIT_PREFIX[booking_type] || UNIT_PREFIX[room_type] || 'IMP';
            booking_ref  = `${prefix}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
        }

        db.run(
            `INSERT INTO bookings
             (booking_ref, full_name, email, phone, unit_id, room_type, booking_type,
              check_in, check_out, guests, total_price, balance, amount_paid,
              payment_status, booking_source, status, booking_mode, notes, addon_amount, created_by, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(booking_ref) DO UPDATE SET
                created_at = COALESCE(EXCLUDED.created_at, bookings.created_at)`,
            [booking_ref, full_name, email, phone, unit_id, room_type, booking_type,
             check_in, check_out, guests, total_price, balance, amount_paid,
             payment_status, booking_source, status, booking_mode, notes, addon_amount, 'admin', created_at],
            function(err) {
                if (err) {
                    errors.push({ row: rowNum, reason: err.message });
                    return finish();
                }
                if (this.changes === 0) {
                    skipped.push(booking_ref);
                    return finish();
                }
                inserted.push(booking_ref);
                // Record payment transaction if amount was collected
                if (amount_paid > 0) {
                    db.run(
                        `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                         VALUES (?,?,'deposit','VERIFIED','CSV Import',?)`,
                        [booking_ref, amount_paid, `Bulk import Ã¢â‚¬â€ row ${rowNum}`]
                    );
                }
                logAction('csv_import', 'booking', booking_ref,
                    `Imported from CSV: ${full_name} | ${check_in}Ã¢â€ â€™${check_out} | Ã¢â€šÂ±${total_price}`, 'admin_portal');
                finish();
            }
        );
    }
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin: Save / Update Notes on a booking Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.patch('/api/v1/admin/bookings/:ref/notes', (req, res) => {
    const { ref }   = req.params;
    const { notes, admin_id = 'Vincent-Admin' } = req.body;
    db.run(`UPDATE bookings SET notes = ? WHERE booking_ref = ?`, [notes ?? '', ref], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Booking not found.' });
        logAction('update_notes', 'booking', ref, `Notes updated by ${admin_id}`, 'admin_portal');
        res.json({ ok: true });
    });
});

app.post('/api/v1/admin/bookings/:ref/mark-reserved', (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body;

    db.run(
        `UPDATE bookings SET payment_status = ? WHERE booking_ref = ? AND status IN (${quoteSqlStrings(REBOOKABLE_BOOKING_STATUSES)})`,
        [PAYMENT_SUMMARY_PARTIAL, ref],
        function(err) {
            if (err || this.changes === 0) return res.status(404).json({ error: 'Booking not found or not reserved.' });
            logAction('mark_reserved', 'booking', ref, `Marked RESERVED booking as partial balance due | Admin: ${admin_id}`, 'admin_portal');
            res.json({ message: `Booking ${ref} remains RESERVED with partial balance due.`, payment_status: PAYMENT_SUMMARY_PARTIAL });
        }
    );
});

// Admin API: Upcoming Check-ins (next 7 days)
app.get('/api/v1/admin/financials/checkins', (req, res) => {
    Promise.all([
        dbAllAsync(`
            SELECT 
                b.booking_ref, b.booking_ref as transaction_ref, b.room_type, b.check_in, b.check_out,
                b.guests, b.full_name, b.full_name as guest_name, b.email, b.phone,
                b.total_price, COALESCE(b.addon_amount, 0) as addon_amount,
                b.balance, b.status, b.payment_status, b.unit_id,
                b.created_at, b.booking_type, b.notes,
                b.created_by, b.booking_source,
                u.unit_label,
                COALESCE(u.unit_label, b.unit_id, '') as unit_summary,
                COALESCE(SUM(CASE WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_paid,
                'legacy' as record_origin,
                1 as booking_items_count
            FROM bookings b
            LEFT JOIN units u ON b.unit_id = u.unit_id
            LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
            WHERE b.status IN (${quoteSqlStrings(REBOOKABLE_BOOKING_STATUSES)})
              AND b.check_in >= date('now')
              AND b.check_in <= date('now', '+7 days')
            GROUP BY b.booking_ref
        `),
        dbAllAsync(`
            SELECT
                h.booking_reference as booking_ref,
                h.booking_reference as transaction_ref,
                CASE
                    WHEN COUNT(DISTINCT bi.room_type) = 1 THEN MAX(bi.room_type)
                    WHEN COUNT(DISTINCT bi.room_type) > 1 THEN 'Multi-Room'
                    ELSE ''
                END as room_type,
                h.check_in,
                h.check_out,
                COALESCE(SUM(COALESCE(bi.guest_count, 0)), 0) as guests,
                h.guest_name as full_name,
                h.guest_name as guest_name,
                h.email,
                h.phone,
                COALESCE(h.lodging_total, 0) as total_price,
                COALESCE(h.addon_amount, 0) as addon_amount,
                COALESCE(h.balance_due, 0) as balance,
                h.status as status,
                h.payment_status,
                CASE WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(bi.unit_id) ELSE NULL END as unit_id,
                h.created_at,
                'overnight' as booking_type,
                h.notes,
                h.created_by,
                h.booking_source,
                CASE
                    WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(u.unit_label)
                    WHEN COUNT(DISTINCT bi.unit_id) > 1 THEN 'Multiple Units'
                    ELSE NULL
                END as unit_label,
                COALESCE(GROUP_CONCAT(DISTINCT COALESCE(u.unit_label, bi.unit_id)), '') as unit_summary,
                COALESCE(h.verified_paid_total, 0) as amount_paid,
                'transaction_header' as record_origin,
                COUNT(bi.booking_item_id) as booking_items_count
            FROM booking_headers h
            LEFT JOIN booking_items bi ON bi.booking_reference = h.booking_reference
            LEFT JOIN units u ON bi.unit_id = u.unit_id
            WHERE h.status IN (${quoteSqlStrings(REBOOKABLE_BOOKING_STATUSES)})
              AND h.check_in >= date('now')
              AND h.check_in <= date('now', '+7 days')
            GROUP BY h.booking_reference
        `)
    ]).then(([legacyRows, transactionRows]) => {
        const rows = [...legacyRows, ...transactionRows].sort((a, b) =>
            String(a.check_in || '').localeCompare(String(b.check_in || '')) ||
            String(a.booking_ref || '').localeCompare(String(b.booking_ref || ''))
        );
        res.json({ checkins: rows });
    }).catch((err) => res.status(500).json({ error: err.message }));
});

// Admin API: Upcoming Check-outs (next 3 days)
app.get('/api/v1/admin/financials/checkouts', (req, res) => {
    Promise.all([
        dbAllAsync(`
            SELECT 
                b.booking_ref, b.booking_ref as transaction_ref, b.room_type, b.check_in, b.check_out,
                b.guests, b.full_name, b.full_name as guest_name, b.email, b.phone,
                b.total_price, COALESCE(b.addon_amount, 0) as addon_amount,
                b.balance, b.status, b.payment_status, b.unit_id,
                b.created_at, b.booking_type, b.notes,
                b.created_by, b.booking_source,
                u.unit_label,
                COALESCE(u.unit_label, b.unit_id, '') as unit_summary,
                COALESCE(SUM(CASE WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_paid,
                'legacy' as record_origin,
                1 as booking_items_count
            FROM bookings b
            LEFT JOIN units u ON b.unit_id = u.unit_id
            LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
            WHERE b.status IN (${quoteSqlStrings(REBOOKABLE_BOOKING_STATUSES)})
              AND b.check_out >= date('now')
              AND b.check_out <= date('now', '+3 days')
            GROUP BY b.booking_ref
        `),
        dbAllAsync(`
            SELECT
                h.booking_reference as booking_ref,
                h.booking_reference as transaction_ref,
                CASE
                    WHEN COUNT(DISTINCT bi.room_type) = 1 THEN MAX(bi.room_type)
                    WHEN COUNT(DISTINCT bi.room_type) > 1 THEN 'Multi-Room'
                    ELSE ''
                END as room_type,
                h.check_in,
                h.check_out,
                COALESCE(SUM(COALESCE(bi.guest_count, 0)), 0) as guests,
                h.guest_name as full_name,
                h.guest_name as guest_name,
                h.email,
                h.phone,
                COALESCE(h.lodging_total, 0) as total_price,
                COALESCE(h.addon_amount, 0) as addon_amount,
                COALESCE(h.balance_due, 0) as balance,
                h.status as status,
                h.payment_status,
                CASE WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(bi.unit_id) ELSE NULL END as unit_id,
                h.created_at,
                'overnight' as booking_type,
                h.notes,
                h.created_by,
                h.booking_source,
                CASE
                    WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(u.unit_label)
                    WHEN COUNT(DISTINCT bi.unit_id) > 1 THEN 'Multiple Units'
                    ELSE NULL
                END as unit_label,
                COALESCE(GROUP_CONCAT(DISTINCT COALESCE(u.unit_label, bi.unit_id)), '') as unit_summary,
                COALESCE(h.verified_paid_total, 0) as amount_paid,
                'transaction_header' as record_origin,
                COUNT(bi.booking_item_id) as booking_items_count
            FROM booking_headers h
            LEFT JOIN booking_items bi ON bi.booking_reference = h.booking_reference
            LEFT JOIN units u ON bi.unit_id = u.unit_id
            WHERE h.status IN (${quoteSqlStrings(REBOOKABLE_BOOKING_STATUSES)})
              AND h.check_out >= date('now')
              AND h.check_out <= date('now', '+3 days')
            GROUP BY h.booking_reference
        `)
    ]).then(([legacyRows, transactionRows]) => {
        const rows = [...legacyRows, ...transactionRows].sort((a, b) =>
            String(a.check_out || '').localeCompare(String(b.check_out || '')) ||
            String(a.booking_ref || '').localeCompare(String(b.booking_ref || ''))
        );
        res.json({ checkouts: rows });
    }).catch((err) => res.status(500).json({ error: err.message }));
});

// Admin API: Full Transaction Log (audit trail)
app.get('/api/v1/admin/financials/transactions', (req, res) => {
    listFinancialTransactionRows()
        .then((rows) => res.json({ transactions: rows.slice(0, 200) }))
        .catch((err) => res.status(500).json({ error: err.message }));
});

// Admin API: Pending Verifications (Enhanced)
app.get('/api/v1/admin/bookings/pending', (req, res) => {
    const query = `
        SELECT b.*, t.amount as trans_amount, t.transaction_type, t.receipt_path, t.id as trans_id 
        FROM bookings b
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.status = 'PENDING_VERIFICATION'
        ORDER BY t.created_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ pending: rows || [] });
    });
});

// Admin API: Financial Ledger (Receivables Tracking)
app.get('/api/v1/admin/financials/receivables', (req, res) => {
    Promise.all([
        dbAllAsync(`
            SELECT 
                b.booking_ref, b.full_name as guest_name, b.full_name, b.unit_id, u.unit_label,
                COALESCE(u.unit_label, b.unit_id, '') as unit_summary,
                b.check_in, b.check_out, b.total_price,
                COALESCE(b.addon_amount, 0) as addon_amount,
                b.total_price + COALESCE(b.addon_amount, 0) as grand_total,
                b.payment_status, b.status, b.created_by, b.booking_source, b.created_at,
                COALESCE(SUM(CASE 
                    WHEN (t.status = 'VERIFIED' OR t.status = 'APPROVED') 
                    AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment') 
                    THEN t.amount ELSE 0 END), 0) as amount_paid,
                COALESCE(SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END), 0) as amount_refunded,
                'legacy' as record_origin
            FROM bookings b
            LEFT JOIN units u ON b.unit_id = u.unit_id
            LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
            WHERE b.is_deleted = 0 
              AND b.status IN (${quoteSqlStrings(RECEIVABLE_BOOKING_STATUSES)})
              AND b.payment_status != ?
            GROUP BY b.booking_ref
            HAVING (b.total_price + COALESCE(b.addon_amount, 0)) - (COALESCE(SUM(CASE WHEN (t.status = 'VERIFIED' OR t.status = 'APPROVED') AND t.transaction_type IN ('payment', 'deposit', 'Full Settlement', 'Full Payment', 'adjustment') THEN t.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END), 0)) > 0
        `, [PAYMENT_SUMMARY_PAID]),
        dbAllAsync(`
            SELECT
                h.booking_reference as booking_ref,
                h.guest_name as guest_name,
                h.guest_name as full_name,
                CASE WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(bi.unit_id) ELSE NULL END as unit_id,
                CASE
                    WHEN COUNT(DISTINCT bi.unit_id) = 1 THEN MAX(u.unit_label)
                    WHEN COUNT(DISTINCT bi.unit_id) > 1 THEN 'Multiple Units'
                    ELSE NULL
                END as unit_label,
                COALESCE(GROUP_CONCAT(DISTINCT COALESCE(u.unit_label, bi.unit_id)), '') as unit_summary,
                h.check_in,
                h.check_out,
                COALESCE(h.lodging_total, 0) as total_price,
                COALESCE(h.addon_amount, 0) as addon_amount,
                COALESCE(h.lodging_total, 0) + COALESCE(h.addon_amount, 0) as grand_total,
                h.payment_status,
                h.status as status,
                h.created_by,
                h.booking_source,
                h.created_at,
                COALESCE(h.verified_paid_total, 0) as amount_paid,
                0 as amount_refunded,
                'transaction_header' as record_origin
            FROM booking_headers h
            LEFT JOIN booking_items bi ON bi.booking_reference = h.booking_reference
            LEFT JOIN units u ON bi.unit_id = u.unit_id
            WHERE h.status IN (${quoteSqlStrings(RECEIVABLE_BOOKING_STATUSES)})
              AND COALESCE(h.balance_due, 0) > 0
              AND COALESCE(h.payment_status, '') != ?
            GROUP BY h.booking_reference
        `, [PAYMENT_SUMMARY_PAID])
    ]).then(([legacyRows, transactionRows]) => {
        const rows = [...legacyRows, ...transactionRows].sort((a, b) =>
            String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
            String(b.booking_ref || '').localeCompare(String(a.booking_ref || ''))
        );
        res.json({ receivables: rows });
    }).catch((err) => res.status(500).json({ error: err.message }));
});

// Admin API: Verify Decision with Automated Room Assignment
app.post('/api/v1/admin/verify', (req, res) => {
    const { booking_ref, decision, notes, admin_id } = req.body;
    const newStatus = decision === 'approve' ? BOOKING_STATUS_RESERVED : BOOKING_STATUS_PAYMENT_REJECTED;

    if (decision !== 'approve') {
        db.run(`UPDATE bookings SET status = ? WHERE booking_ref = ?`, [newStatus, booking_ref], (err) => {
            if (err) return res.status(500).json({ error: "Rejection protocol failed." });
            
            // Ã°Å¸â€ºÂ¡Ã¯Â¸  Fiscal Guard: Reject associated transactions too
            db.run(`UPDATE transactions SET status = 'REJECTED' WHERE booking_ref = ? AND status = 'PENDING_VERIFICATION'`, [booking_ref]);

            // Ã°Å¸â€â€œ Release unit back to Available if one was assigned
            db.get(`SELECT unit_id FROM bookings WHERE booking_ref = ?`, [booking_ref], (err, row) => {
                if (!err && row?.unit_id) {
                    db.run(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [row.unit_id]);
                }
            });
            
            logAction('admin_verify', 'booking', booking_ref, `Payment rejected | Admin: ${admin_id}`, 'admin_portal');
            res.status(200).json({ message: `Booking ${booking_ref} marked as PAYMENT_REJECTED.` });
        });
        return;
    }

    // Ã°Å¸Å’Å  Automated Room Assignment Logic
    db.get("SELECT * FROM bookings WHERE booking_ref = ?", [booking_ref], (err, booking) => {
        if (err || !booking) return res.status(404).json({ error: "Booking not found." });

        const { room_type, check_in, check_out, booking_type, unit_id: currentUnitId } = booking;

        // Ã¢â€ºÂº Special bookings (day_tour, tent_pitching) have no physical units Ã¢â‚¬â€ approve directly
        const SPECIAL_TYPES = ['day_tour', 'tent_pitching'];
        if (SPECIAL_TYPES.includes(booking_type)) {
            db.run(`UPDATE transactions SET status = 'VERIFIED' WHERE booking_ref = ? AND status = 'PENDING_VERIFICATION'`, [booking_ref], (err) => {
                if (err) console.error("Ã¢Å¡Â Ã¯Â¸  Transaction verification fail:", err);

                db.get(`
                    SELECT b.total_price, COALESCE(b.addon_amount, 0) as addon_amount,
                           COALESCE(SUM(CASE WHEN t.status = 'VERIFIED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_verified
                    FROM bookings b
                    LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
                    WHERE b.booking_ref = ?
                    GROUP BY b.booking_ref
                `, [booking_ref], (err, funds) => {
                    const grandTotal      = (funds?.total_price || 0) + (funds?.addon_amount || 0);
                    const amountVerified  = funds?.amount_verified  || 0;
                    const paymentStatus = derivePaymentSummary({ grossTotal: grandTotal, netPaid: amountVerified, hasPendingProof: true });

                    db.run(`UPDATE bookings SET status = ?, payment_status = ? WHERE booking_ref = ?`,
                        [BOOKING_STATUS_RESERVED, paymentStatus, booking_ref], (err) => {
                            if (err) return res.status(500).json({ error: "Special booking approval failed." });

                            db.run(`INSERT INTO approvals (transaction_id, verdict, admin_notes, processed_by) VALUES (?, ?, ?, ?)`,
                                [null, decision, notes, admin_id]);

                            logAction('admin_verify', 'booking', booking_ref,
                                `Reserved special [${booking_type}] (${paymentStatus}) | Admin: ${admin_id}`, 'admin_portal');

                            res.status(200).json({
                                message: `Booking ${booking_ref} reserved (${paymentStatus}).`,
                                payment_status: paymentStatus
                            });
                        }
                    );
                });
            });
            return; // Ã¢â€   stop here, skip unit assignment below
        }
        
        resolveRoomTypeId({ roomType: room_type, unitId: currentUnitId }, (typeErr, normalizedType) => {
            if (typeErr || !normalizedType) {
                return res.status(500).json({ error: "Room type resolution failed during approval." });
            }

            findAssignableUnit({
                roomTypeId: normalizedType,
                checkIn: check_in,
                checkOut: check_out,
                excludeBookingRef: booking_ref,
                preferredUnitId: currentUnitId
            }, (err, assignment) => {
                if (err) return res.status(500).json({ error: "Sanctuary Map search collision." });

                const unit = assignment?.unit || null;
                if (!unit) {
                    return res.status(400).json({
                        error: `Ã¢Å¡Â Ã¯Â¸  Sanctuary full: No available [${room_type}] for these dates.`,
                        debug: {
                            room_type_id: normalizedType,
                            total_units: assignment?.totalUnits || 0,
                            blocked_units: assignment?.blockedUnits || 0
                        }
                    });
                }

                // Ã°Å¸â€ºÂ¡Ã¯Â¸  Step 1: Verify all pending transactions for this booking (atomic, in-chain)
                db.run(`UPDATE transactions SET status = 'VERIFIED' WHERE booking_ref = ? AND status = 'PENDING_VERIFICATION'`, [booking_ref], (err) => {
                    if (err) console.error("Ã¢Å¡Â Ã¯Â¸  Transaction verification fail:", err);

                    // Ã°Å¸â€™Â¸ Step 2: Compute real payment_status from verified funds
                    db.get(`
                        SELECT 
                            b.total_price,
                            COALESCE(b.addon_amount, 0) as addon_amount,
                            COALESCE(SUM(CASE WHEN t.status = 'VERIFIED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_verified
                        FROM bookings b
                        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
                        WHERE b.booking_ref = ?
                        GROUP BY b.booking_ref
                    `, [booking_ref], (err, funds) => {
                        const grandTotal = (funds?.total_price || 0) + (funds?.addon_amount || 0);
                        const amountVerified = funds?.amount_verified || 0;
                        const paymentStatus = derivePaymentSummary({ grossTotal: grandTotal, netPaid: amountVerified, hasPendingProof: true });

                        // Ã¢Å¡Â¡ Step 3: Approve booking, assign unit, and stamp payment status atomically
                        db.run(`UPDATE bookings SET status = ?, unit_id = ?, payment_status = ? WHERE booking_ref = ?`,
                            [newStatus, unit.unit_id, paymentStatus, booking_ref], (err) => {
                            if (err) return res.status(500).json({ error: "Atomic locking failed." });

                            // Step 4: Tag the physical unit as reserved while the booking remains RESERVED
                            db.run(`UPDATE units SET unit_status = 'Reserved' WHERE unit_id = ?`, [unit.unit_id]);

                            // Step 5: Log the approval
                            db.run(`INSERT INTO approvals (transaction_id, verdict, admin_notes, processed_by) VALUES (?, ?, ?, ?)`,
                                [null, decision, notes, admin_id]);

                            logAction('admin_verify', 'booking', booking_ref, `Reserved [${paymentStatus}] & Assigned to ${unit.unit_id} | Unit tagged Reserved | Admin: ${admin_id}`, 'admin_portal');

                            res.status(200).json({
                                message: `Success! Booking ${booking_ref} reserved (${paymentStatus}) and assigned to ${unit.unit_label || unit.unit_id}.`,
                                assigned_unit: unit.unit_id,
                                payment_status: paymentStatus
                            });
                        });
                    });
                });
            });
        });
    });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin CRUD: Edit Booking Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.patch('/api/v1/admin/bookings/:ref', async (req, res) => {
    const { ref } = req.params;
    const {
        full_name, email, phone, room_type, check_in, check_out,
        guests, status, booking_source, booking_type, unit_id,
        notes, special_requests, addon_amount, total_price, amount_paid, booking_mode,
        group_code, group_name, group_master_ref, group_sequence,
        admin_id = 'admin'
    } = req.body;

    try {
        const transactionBooking = await getBookingHeaderWithItems(ref);
        if (transactionBooking) {
            await updateTransactionBooking(ref, req.body);
            logAction('admin_edit_booking_header', 'booking_header', ref, `Transaction booking updated | Admin: ${admin_id}`, 'admin_portal');
            return res.json({ message: `Transaction booking ${ref} updated successfully.` });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Transaction update failed: ' + error.message });
    }

    db.get('SELECT * FROM bookings WHERE booking_ref = ?', [ref], (err, old) => {
        if (err || !old) return res.status(404).json({ error: 'Booking not found.' });

        const effectiveBookingType = booking_type !== undefined ? booking_type : old.booking_type;
        const effectiveGuests = guests !== undefined ? Number(guests) : Number(old.guests);

        if (effectiveBookingType === 'tent_pitching' && (effectiveGuests < 1 || effectiveGuests > 2)) {
            return res.status(400).json({ error: 'Tent bookings allow 1 or 2 guests only. One booking reserves exactly one tent slot.' });
        }

        // Optimization: Use provided values or fallback to old ones
        const props = {
            check_in:  check_in  !== undefined ? check_in  : old.check_in,
            check_out: check_out !== undefined ? check_out : old.check_out,
            unit_id:   unit_id   !== undefined ? unit_id   : old.unit_id,
        };

        const datesChanged = (check_in !== undefined && check_in !== old.check_in) || (check_out !== undefined && check_out !== old.check_out);
        const unitChanged  = (unit_id  !== undefined && unit_id  !== old.unit_id);

        const performUpdate = () => {
            const fields = [];
            const values = [];

            if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
            if (email !== undefined)     { fields.push('email = ?');     values.push(email); }
            if (phone !== undefined)     { fields.push('phone = ?');     values.push(phone); }
            if (room_type !== undefined) { fields.push('room_type = ?'); values.push(room_type); }
            if (check_in !== undefined)  { fields.push('check_in = ?');  values.push(check_in); }
            if (check_out !== undefined) { fields.push('check_out = ?'); values.push(check_out); }
            if (guests !== undefined)    { fields.push('guests = ?');    values.push(guests); }
            const normalizedStatus = status !== undefined ? normalizeBookingStatus(status) : undefined;
            if (normalizedStatus !== undefined) { fields.push('status = ?'); values.push(normalizedStatus); }
            if (booking_source !== undefined) { fields.push('booking_source = ?'); values.push(booking_source); }
            if (booking_mode !== undefined)   { fields.push('booking_mode = ?');   values.push(booking_mode); }
            if (booking_type !== undefined)   { fields.push('booking_type = ?');   values.push(booking_type); }
            if (unit_id !== undefined)        { fields.push('unit_id = ?');        values.push(unit_id); }
            if (notes !== undefined)          { fields.push('notes = ?');          values.push(notes); }
            if (special_requests !== undefined) { fields.push('special_requests = ?'); values.push(special_requests); }
            if (addon_amount !== undefined)     { fields.push('addon_amount = ?');     values.push(addon_amount); }
            if (total_price !== undefined)      { fields.push('total_price = ?');      values.push(total_price); }
            if (amount_paid !== undefined)      { fields.push('amount_paid = ?');      values.push(amount_paid); }
            if (group_code !== undefined)       { fields.push('group_code = ?');       values.push(group_code || null); }
            if (group_name !== undefined)       { fields.push('group_name = ?');       values.push(group_name || null); }
            if (group_master_ref !== undefined) { fields.push('group_master_ref = ?'); values.push(group_master_ref || null); }
            if (group_sequence !== undefined)   { fields.push('group_sequence = ?');   values.push(group_sequence ?? null); }
            
            if (!fields.length) return res.json({ message: "No actual logistics changes." });

            values.push(ref);
            db.run(`UPDATE bookings SET ${fields.join(', ')} WHERE booking_ref = ?`, values, function(err) {
                if (err) return res.status(500).json({ error: 'Update failed: ' + err.message });

                // Ã°Å¸â€™Â¸ Financial Delta Logging: Capture shifts in price/addons for the Audit Trail
                if (total_price !== undefined && Number(total_price) !== Number(old.total_price)) {
                    const delta = Number(total_price) - Number(old.total_price);
                    const label = (delta > 0 ? 'Extra Charge' : 'Goodwill Adjustment');
                    const noteStr = `${label} | Contract Price Shift: Ã¢â€šÂ±${old.total_price} Ã¢â€ â€™ Ã¢â€šÂ±${total_price} (Delta: ${delta > 0 ? '+' : ''}${delta})`;
                    db.run(`INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                            VALUES (?, ?, 'adjustment', 'VERIFIED', 'System Sync', ?)`,
                            [ref, Math.abs(delta), noteStr]);
                }

                if (addon_amount !== undefined && Number(addon_amount) !== Number(old.addon_amount)) {
                    const delta = Number(addon_amount) - Number(old.addon_amount);
                    const label = (delta > 0 ? 'Service Add-on' : 'Adjustment');
                    const noteStr = `${label} | Aggregate Addon Shift: Ã¢â€šÂ±${old.addon_amount} Ã¢â€ â€™ Ã¢â€šÂ±${addon_amount} (Delta: ${delta > 0 ? '+' : ''}${delta})`;
                    db.run(`INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                            VALUES (?, ?, 'addon', 'VERIFIED', 'System Sync', ?)`,
                            [ref, Math.abs(delta), noteStr]);
                }

                // Keep the physical unit marker aligned for existing dashboards after check-in.
                if (normalizedStatus === BOOKING_STATUS_CHECKED_IN && old.unit_id) {
                    db.run(`UPDATE units SET unit_status = 'Checked In' WHERE unit_id = ?`, [old.unit_id]);
                }

                // Sync finance just in case dates changed
                syncBookingFinance(ref, (errFin) => {
                    logAction('admin_edit_booking', 'booking', ref, `Financial & Logistics Updated | Admin: ${admin_id}`, 'admin_portal');
                    res.json({ message: `Booking ${ref} updated successfully.` });
                });
            });
        };

        if ((datesChanged || unitChanged) && props.unit_id && status !== 'CANCELLED' && status !== 'REJECTED') {
            db.get(`
                SELECT booking_ref, full_name, check_in, check_out 
                FROM bookings 
                WHERE unit_id = ? 
                  AND booking_ref != ?
                  AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                  AND check_in < ? AND check_out > ?
                LIMIT 1
            `, [props.unit_id, ref, props.check_out, props.check_in], (err, conflict) => {
                if (err) return res.status(500).json({ error: 'Availability check failure.' });
                if (conflict) {
                    return res.status(409).json({
                        error: `Ã¢â€ºâ€ Conflict: Unit ${props.unit_id} is already taken by ${conflict.full_name} (${conflict.check_in} to ${conflict.check_out}).`
                    });
                }
                performUpdate();
            });
        } else {
            performUpdate();
        }
    });
});

// Ã°Å¸â€™Â¸ FINANCIAL HUB ENDPOINTS

app.post('/api/v1/admin/bookings/:ref/manual-payment', (req, res) => {
    const { ref } = req.params;
    const { amount, method, payment_method, notes, admin_id = 'admin' } = req.body;
    const finalMethod = method || payment_method || 'Cash';
    const val = parseFloat(amount || 0);

    // Ã°Å¸â€ºÂ¡Ã¯Â¸  FINANCIAL INTEGRITY GUARD: Block negative/zero payments
    if (isNaN(val) || val <= 0) {
        return res.status(400).json({ error: 'Ã¢â€ºâ€ Rejected: Payment amount must be greater than zero.' });
    }
    
    db.run(
        `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
         VALUES (?, ?, 'payment', 'VERIFIED', ?, ?)`,
        [ref, parseFloat(amount), finalMethod, `Admin Manual Entry: ${notes || 'No notes'}`],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            syncBookingFinance(ref, (errSync, data) => {
                if (errSync) return res.status(500).json({ error: 'Financial sync failed: ' + errSync.message });
                logAction('admin_payment', 'financial', ref, `Payment recorded: Ã¢â€šÂ±${amount} via ${finalMethod}`, admin_id);
                res.json({ message: 'Payment recorded successfully.', ...data });
            });
        }
    );
});

app.post('/api/v1/admin/bookings/:ref/change-set', async (req, res) => {
    const { ref } = req.params;
    const {
        workflow = 'edit',
        booking = {},
        payment = null,
        payment_target = null,
        preview = false,
        admin_id = 'admin'
    } = req.body || {};

    const normalizedWorkflow = String(workflow || 'edit').toLowerCase();
    const allowedWorkflows = ['edit', 'checkin', 'checkout', 'correction'];
    if (!allowedWorkflows.includes(normalizedWorkflow)) {
        return res.status(400).json({ error: 'Unsupported booking workflow.' });
    }

    const paymentAmount = Number(payment?.amount || 0);
    if (payment && paymentAmount <= 0) {
        return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }
    const hasPaymentTarget = payment_target?.target_paid_total !== undefined || booking?.paid_total !== undefined;
    const targetPaidTotal = Number(payment_target?.target_paid_total ?? booking?.paid_total ?? 0);
    if (hasPaymentTarget && targetPaidTotal < 0) {
        return res.status(400).json({ error: 'Paid amount cannot be negative.' });
    }
    const requiresExplicitPaymentTarget = ['checkin', 'checkout'].includes(normalizedWorkflow);
    const hasExplicitPaymentTargetConfirmation = payment_target?.confirmed_manual_entry === true;

    const noteWithAddonContext = (baseNote) => {
        const cleanBase = String(baseNote ?? '').trim();
        const cleanAddonNote = String(booking.addon_note || booking.addonNote || '').trim();
        if (!cleanAddonNote) return baseNote;
        const line = `Additional charge note: ${cleanAddonNote}`;
        if (cleanBase.includes(line)) return cleanBase;
        return [cleanBase, line].filter(Boolean).join('\n');
    };

    const applyHeaderPaymentTarget = async (bookingReference) => {
        if (!hasPaymentTarget) return recomputeHeaderFinance(bookingReference);
        const currentFinance = await recomputeHeaderFinance(bookingReference);
        const currentPaid = Number(currentFinance.verified_paid_total || 0);
        const delta = Number((targetPaidTotal - currentPaid).toFixed(2));
        if (Math.abs(delta) >= 0.01) {
            if (requiresExplicitPaymentTarget && !hasExplicitPaymentTargetConfirmation) {
                const err = new Error('Check-in and checkout payment adjustments require an explicit manual payment entry.');
                err.statusCode = 400;
                throw err;
            }
            await dbRunAsync(
                `INSERT INTO payments
                 (booking_reference, amount, payment_type, payment_method, receipt_url, reference_no, verification_status, notes)
                 VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED', ?)`,
                [
                    bookingReference,
                    Math.abs(delta),
                    delta > 0 ? 'adjustment' : 'refund',
                    payment_target?.payment_method || payment?.payment_method || 'Cash',
                    null,
                    null,
                    payment_target?.notes || `Paid total adjusted to ${targetPaidTotal} via ${normalizedWorkflow} change-set`
                ]
            );
        }
        return recomputeHeaderFinance(bookingReference);
    };

    const applyLegacyPaymentTarget = async (bookingReference) => {
        if (!hasPaymentTarget) return recomputeLegacyBookingFinance(bookingReference);
        const currentFinance = await recomputeLegacyBookingFinance(bookingReference);
        const currentPaid = Number(currentFinance.amount_paid || 0);
        const delta = Number((targetPaidTotal - currentPaid).toFixed(2));
        if (Math.abs(delta) >= 0.01) {
            if (requiresExplicitPaymentTarget && !hasExplicitPaymentTargetConfirmation) {
                const err = new Error('Check-in and checkout payment adjustments require an explicit manual payment entry.');
                err.statusCode = 400;
                throw err;
            }
            await dbRunAsync(
                `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                 VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
                [
                    bookingReference,
                    Math.abs(delta),
                    delta > 0 ? 'adjustment' : 'refund',
                    payment_target?.payment_method || payment?.payment_method || 'Cash',
                    payment_target?.notes || `Paid total adjusted to ${targetPaidTotal} via ${normalizedWorkflow} change-set`
                ]
            );
        }
        return recomputeLegacyBookingFinance(bookingReference);
    };

    try {
        const applyChangeSet = async () => {
            const transactionBooking = await getBookingHeaderWithItems(ref);

            if (transactionBooking) {
                const header = transactionBooking.header || {};
                const originalHeader = { ...header };
                const originalItems = (transactionBooking.items || []).map((item) => ({ ...item }));
                const nextCheckIn = booking.check_in !== undefined ? booking.check_in : header.check_in;
                const nextCheckOut = booking.check_out !== undefined ? booking.check_out : header.check_out;
                if (!nextCheckIn || !nextCheckOut || nextCheckOut <= nextCheckIn) {
                    const err = new Error('Check-out must be after check-in.');
                    err.statusCode = 400;
                    throw err;
                }

                const nextStatus = booking.status !== undefined
                    ? normalizeBookingStatus(booking.status)
                    : (normalizedWorkflow === 'checkin'
                        ? BOOKING_STATUS_CHECKED_IN
                        : normalizedWorkflow === 'checkout'
                            ? BOOKING_STATUS_CHECKED_OUT
                            : header.status);

                let itemUpdates = Array.isArray(booking.items) ? booking.items : [];
                if (!itemUpdates.length && booking.unit_id !== undefined) {
                    const editableItem = (transactionBooking.items || [])
                        .filter((item) => ACTIVE_ITEM_STATUSES.includes(normalizeBookingStatus(item.status)))
                        .sort((a, b) => Number(a.booking_item_id || 0) - Number(b.booking_item_id || 0))[0]
                        || (transactionBooking.items || [])[0];

                    if (editableItem) {
                        const chosenUnit = booking.unit_id
                            ? await dbGetAsync(`SELECT unit_id, room_type_id, unit_label FROM units WHERE unit_id = ?`, [booking.unit_id])
                            : null;
                        itemUpdates = [{
                            booking_item_id: editableItem.booking_item_id,
                            unit_id: booking.unit_id || null,
                            room_type: booking.room_type || chosenUnit?.room_type_id || editableItem.room_type || header.room_type || '',
                            status: booking.status !== undefined ? normalizeBookingStatus(booking.status) : editableItem.status,
                            guest_count: booking.guests !== undefined ? Number(booking.guests || 0) : Number(editableItem.guest_count || 0),
                            lodging_subtotal: booking.lodging_total !== undefined || booking.total_price !== undefined
                                ? Number(booking.lodging_total ?? booking.total_price ?? 0)
                                : Number(editableItem.lodging_subtotal || 0),
                        }];
                    }
                }

                const itemUpdatesById = new Map(itemUpdates
                    .filter((item) => item?.booking_item_id !== undefined)
                    .map((item) => [String(item.booking_item_id), item]));

                if (ACTIVE_HEADER_STATUSES.includes(nextStatus)) {
                    const existingItemIds = new Set((transactionBooking.items || []).map((item) => String(item.booking_item_id)));
                    const intendedActiveItems = [];

                    for (const item of transactionBooking.items || []) {
                        const itemUpdate = itemUpdatesById.get(String(item.booking_item_id)) || {};
                        const intendedUnitId = itemUpdate.unit_id !== undefined ? itemUpdate.unit_id : item.unit_id;
                        const intendedStatus = itemUpdate.status !== undefined ? normalizeBookingStatus(itemUpdate.status) : normalizeBookingStatus(item.status);
                        if (!intendedUnitId || !ACTIVE_ITEM_STATUSES.includes(intendedStatus)) continue;
                        intendedActiveItems.push({
                            booking_item_id: item.booking_item_id,
                            unit_id: intendedUnitId,
                            check_in: itemUpdate.check_in || nextCheckIn,
                            check_out: itemUpdate.check_out || nextCheckOut,
                        });
                    }

                    for (const itemUpdate of itemUpdates) {
                        if (itemUpdate?.booking_item_id === undefined || existingItemIds.has(String(itemUpdate.booking_item_id))) continue;
                        const intendedUnitId = itemUpdate.unit_id || null;
                        const intendedStatus = itemUpdate.status !== undefined ? normalizeBookingStatus(itemUpdate.status) : BOOKING_STATUS_RESERVED;
                        if (!intendedUnitId || !ACTIVE_ITEM_STATUSES.includes(intendedStatus)) continue;
                        intendedActiveItems.push({
                            booking_item_id: itemUpdate.booking_item_id,
                            unit_id: intendedUnitId,
                            check_in: itemUpdate.check_in || nextCheckIn,
                            check_out: itemUpdate.check_out || nextCheckOut,
                        });
                    }

                    for (let i = 0; i < intendedActiveItems.length; i += 1) {
                        for (let j = i + 1; j < intendedActiveItems.length; j += 1) {
                            const left = intendedActiveItems[i];
                            const right = intendedActiveItems[j];
                            if (
                                left.unit_id === right.unit_id
                                && left.check_in < right.check_out
                                && left.check_out > right.check_in
                            ) {
                                const err = new Error(`Unit ${left.unit_id} is assigned more than once in this booking for overlapping dates.`);
                                err.statusCode = 400;
                                throw err;
                            }
                        }
                    }

                    for (const intendedItem of intendedActiveItems) {
                        const conflict = await dbGetAsync(
                            `SELECT booking_item_id, booking_reference, unit_id, check_in, check_out
                             FROM booking_items
                             WHERE booking_reference != ?
                               AND unit_id = ?
                               AND check_in < ?
                               AND check_out > ?
                               AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
                             LIMIT 1`,
                            [ref, intendedItem.unit_id, intendedItem.check_out, intendedItem.check_in]
                        );
                        if (conflict) {
                            const err = new Error(`Unit ${intendedItem.unit_id} is already blocked from ${conflict.check_in} to ${conflict.check_out}.`);
                            err.statusCode = 409;
                            err.conflict = conflict;
                            throw err;
                        }
                        const dateTagConflict = await findBlockingDateTag(intendedItem.unit_id, intendedItem.check_in, intendedItem.check_out);
                        if (dateTagConflict) {
                            const err = new Error(`Unit ${intendedItem.unit_id} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
                            err.statusCode = 409;
                            err.conflict = dateTagConflict;
                            throw err;
                        }
                    }
                }

                const fields = [];
                const values = [];
                const headerFieldMap = [
                    ['guest_name', booking.guest_name ?? booking.full_name],
                    ['email', booking.email],
                    ['phone', booking.phone],
                    ['check_in', booking.check_in],
                    ['check_out', booking.check_out],
                    ['booking_source', booking.booking_source],
                    ['notes', booking.notes !== undefined || booking.addon_note !== undefined || booking.addonNote !== undefined ? noteWithAddonContext(booking.notes ?? header.notes) : undefined],
                    ['special_requests', booking.special_requests],
                    ['lodging_total', booking.lodging_total ?? booking.total_price],
                    ['addon_amount', booking.addon_amount],
                    ['status', booking.status],
                    ['payment_status', booking.payment_status],
                ];

                for (const [field, value] of headerFieldMap) {
                    if (value !== undefined) {
                        fields.push(`${field} = ?`);
                        values.push(field === 'lodging_total' || field === 'addon_amount' ? Number(value || 0) : field === 'status' ? normalizeBookingStatus(value) : value);
                    }
                }

                if (fields.length) {
                    values.push(ref);
                    await dbRunAsync(`UPDATE booking_headers SET ${fields.join(', ')} WHERE booking_reference = ?`, values);
                }

                if (booking.check_in !== undefined || booking.check_out !== undefined) {
                    await dbRunAsync(
                        `UPDATE booking_items SET check_in = ?, check_out = ? WHERE booking_reference = ?`,
                        [nextCheckIn, nextCheckOut, ref]
                    );
                }

                for (const itemUpdate of itemUpdates) {
                    const currentItem = (transactionBooking.items || []).find((item) => Number(item.booking_item_id) === Number(itemUpdate.booking_item_id));
                    if (!currentItem) {
                        const nextItemUnitId = itemUpdate.unit_id || null;
                        const nextItemCheckIn = itemUpdate.check_in || nextCheckIn;
                        const nextItemCheckOut = itemUpdate.check_out || nextCheckOut;
                        const nextItemStatus = itemUpdate.status !== undefined ? normalizeBookingStatus(itemUpdate.status) : BOOKING_STATUS_RESERVED;

                        if (nextItemStatus === BOOKING_STATUS_CANCELLED) {
                            continue;
                        }

                        if (nextItemUnitId && ACTIVE_ITEM_STATUSES.includes(nextItemStatus)) {
                            const conflict = await dbGetAsync(
                                `SELECT booking_item_id, booking_reference, unit_id, check_in, check_out
                                 FROM booking_items
                                 WHERE booking_reference != ?
                                   AND unit_id = ?
                                   AND check_in < ?
                                   AND check_out > ?
                                   AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
                                 LIMIT 1`,
                                [ref, nextItemUnitId, nextItemCheckOut, nextItemCheckIn]
                            );
                            if (conflict) {
                                const err = new Error(`Unit ${nextItemUnitId} is already blocked from ${conflict.check_in} to ${conflict.check_out}.`);
                                err.statusCode = 409;
                                err.conflict = conflict;
                                throw err;
                            }
                            const dateTagConflict = await findBlockingDateTag(nextItemUnitId, nextItemCheckIn, nextItemCheckOut);
                            if (dateTagConflict) {
                                const err = new Error(`Unit ${nextItemUnitId} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
                                err.statusCode = 409;
                                err.conflict = dateTagConflict;
                                throw err;
                            }
                        }

                        await dbRunAsync(
                            `INSERT INTO booking_items
                             (booking_reference, unit_id, room_type, check_in, check_out, guest_count, lodging_subtotal, status)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                ref,
                                nextItemUnitId,
                                itemUpdate.room_type || header.room_type || '',
                                nextItemCheckIn,
                                nextItemCheckOut,
                                Number(itemUpdate.guest_count || 0),
                                Number(itemUpdate.lodging_subtotal || 0),
                                nextItemStatus
                            ]
                        );

                        if (nextItemUnitId) {
                            const unitStatus = nextItemStatus === BOOKING_STATUS_CHECKED_IN ? 'Checked In' : 'Available';
                            await dbRunAsync(`UPDATE units SET unit_status = ? WHERE unit_id = ?`, [unitStatus, nextItemUnitId]);
                        }

                        continue;
                    }

                    const nextItemUnitId = itemUpdate.unit_id !== undefined ? (itemUpdate.unit_id || null) : currentItem.unit_id;
                    const nextItemCheckIn = itemUpdate.check_in || nextCheckIn || currentItem.check_in;
                    const nextItemCheckOut = itemUpdate.check_out || nextCheckOut || currentItem.check_out;
                    const nextItemStatus = itemUpdate.status !== undefined ? normalizeBookingStatus(itemUpdate.status) : currentItem.status;

                    if (nextItemUnitId && ACTIVE_ITEM_STATUSES.includes(nextItemStatus)) {
                        const conflict = await dbGetAsync(
                            `SELECT booking_item_id, booking_reference, unit_id, check_in, check_out
                             FROM booking_items
                             WHERE booking_item_id != ?
                               AND booking_reference != ?
                               AND unit_id = ?
                               AND check_in < ?
                               AND check_out > ?
                               AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
                             LIMIT 1`,
                            [currentItem.booking_item_id, ref, nextItemUnitId, nextItemCheckOut, nextItemCheckIn]
                        );
                        if (conflict) {
                            const err = new Error(`Unit ${nextItemUnitId} is already blocked from ${conflict.check_in} to ${conflict.check_out}.`);
                            err.statusCode = 409;
                            err.conflict = conflict;
                            throw err;
                        }
                        const dateTagConflict = await findBlockingDateTag(nextItemUnitId, nextItemCheckIn, nextItemCheckOut);
                        if (dateTagConflict) {
                            const err = new Error(`Unit ${nextItemUnitId} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
                            err.statusCode = 409;
                            err.conflict = dateTagConflict;
                            throw err;
                        }
                    }

                    await dbRunAsync(
                        `UPDATE booking_items
                         SET unit_id = ?, check_in = ?, check_out = ?, status = ?, room_type = ?, guest_count = ?, lodging_subtotal = ?
                         WHERE booking_item_id = ? AND booking_reference = ?`,
                        [
                            nextItemUnitId,
                            nextItemCheckIn,
                            nextItemCheckOut,
                            nextItemStatus,
                            itemUpdate.room_type || currentItem.room_type,
                            Number(itemUpdate.guest_count ?? currentItem.guest_count ?? 0),
                            Number(itemUpdate.lodging_subtotal ?? currentItem.lodging_subtotal ?? 0),
                            currentItem.booking_item_id,
                            ref
                        ]
                    );

                    if (currentItem.unit_id && currentItem.unit_id !== nextItemUnitId) {
                        await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [currentItem.unit_id]);
                    }
                    if (nextItemUnitId) {
                        const unitStatus = nextItemStatus === BOOKING_STATUS_CHECKED_IN ? 'Checked In' : 'Available';
                        await dbRunAsync(`UPDATE units SET unit_status = ? WHERE unit_id = ?`, [unitStatus, nextItemUnitId]);
                    }
                }

                if (paymentAmount > 0) {
                    await dbRunAsync(
                        `INSERT INTO payments
                         (booking_reference, amount, payment_type, payment_method, receipt_url, reference_no, verification_status, notes)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            ref,
                            paymentAmount,
                            payment.payment_type || (normalizedWorkflow === 'checkout' ? 'Full Settlement' : 'payment'),
                            payment.payment_method || 'Cash',
                            payment.receipt_url || null,
                            payment.reference_no || null,
                            payment.verification_status || 'VERIFIED',
                            payment.notes || `Recorded via ${normalizedWorkflow} change-set`
                        ]
                    );
                }

                let finance = await applyHeaderPaymentTarget(ref);
                if (['checkin', 'checkout'].includes(normalizedWorkflow) && Number(finance.balance_due || 0) > 1) {
                    const err = new Error(`Cannot ${normalizedWorkflow === 'checkin' ? 'check in' : 'check out'}: guest still owes P${Number(finance.balance_due || 0).toLocaleString()}.`);
                    err.statusCode = 400;
                    throw err;
                }

                const assignedUnitIds = (await dbAllAsync(
                    `SELECT unit_id
                     FROM booking_items
                     WHERE booking_reference = ?
                       AND unit_id IS NOT NULL
                       AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})`,
                    [ref]
                )).map((row) => row.unit_id).filter(Boolean);

                if (normalizedWorkflow === 'checkin') {
                    await dbRunAsync(`UPDATE booking_headers SET status = 'CHECKED_IN' WHERE booking_reference = ?`, [ref]);
                    await dbRunAsync(
                        `UPDATE booking_items SET status = 'CHECKED_IN' WHERE booking_reference = ? AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})`,
                        [ref]
                    );
                    for (const unitId of assignedUnitIds) {
                        await dbRunAsync(`UPDATE units SET unit_status = 'Checked In' WHERE unit_id = ?`, [unitId]);
                    }
                }

                if (normalizedWorkflow === 'checkout') {
                    await dbRunAsync(`UPDATE booking_headers SET status = 'CHECKED_OUT' WHERE booking_reference = ?`, [ref]);
                    await dbRunAsync(
                        `UPDATE booking_items
                         SET status = 'CHECKED_OUT'
                         WHERE booking_reference = ?
                           AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})`,
                        [ref]
                    );
                    for (const unitId of assignedUnitIds) {
                        await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
                    }
                }

                const updated = await getBookingHeaderWithItems(ref);
                finance = await recomputeHeaderFinance(ref);

                return {
                    booking_type: 'transaction_header',
                    workflow: normalizedWorkflow,
                    finance,
                    booking: updated,
                    preview: buildBookingChangeSetPreview({
                        before: originalHeader,
                        after: updated?.header || {},
                        paymentAmount,
                        workflow: normalizedWorkflow,
                        finance
                    }),
                    original_items: originalItems,
                    newStatus: normalizedWorkflow === 'checkin' ? 'CHECKED_IN' : normalizedWorkflow === 'checkout' ? 'CHECKED_OUT' : updated?.header?.status
                };
            }

            const legacy = await dbGetAsync(`SELECT * FROM bookings WHERE booking_ref = ?`, [ref]);
            if (!legacy) {
                const err = new Error('Booking not found.');
                err.statusCode = 404;
                throw err;
            }

            const nextCheckIn = booking.check_in !== undefined ? booking.check_in : legacy.check_in;
            const nextCheckOut = booking.check_out !== undefined ? booking.check_out : legacy.check_out;
            if (!nextCheckIn || !nextCheckOut || nextCheckOut <= nextCheckIn) {
                const err = new Error('Check-out must be after check-in.');
                err.statusCode = 400;
                    throw err;
            }

            const nextStatus = booking.status !== undefined
                ? normalizeBookingStatus(booking.status)
                : (normalizedWorkflow === 'checkin'
                    ? BOOKING_STATUS_CHECKED_IN
                    : normalizedWorkflow === 'checkout'
                        ? BOOKING_STATUS_CHECKED_OUT
                        : legacy.status);
            const nextUnitId = booking.unit_id !== undefined ? booking.unit_id : legacy.unit_id;
            const datesChanged = booking.check_in !== undefined || booking.check_out !== undefined;
            const unitChanged = booking.unit_id !== undefined && String(booking.unit_id || '') !== String(legacy.unit_id || '');
            const shouldConvertToTransaction = booking.convert_to_transaction === true && Array.isArray(booking.items);

            if (shouldConvertToTransaction) {
                const rawItems = booking.items || [];
                const activeItems = rawItems
                    .map((item, index) => ({
                        ...item,
                        sequence_no: item.sequence_no ?? (index + 1),
                        status: normalizeBookingStatus(item.status || nextStatus || BOOKING_STATUS_RESERVED)
                    }))
                    .filter((item) => item.status !== BOOKING_STATUS_CANCELLED);

                if (!activeItems.length) {
                    const err = new Error('At least one active unit is required.');
                    err.statusCode = 400;
                    throw err;
                }

                const duplicateUnitIds = activeItems
                    .map((item) => item.unit_id)
                    .filter(Boolean)
                    .filter((unitId, index, list) => list.indexOf(unitId) !== index);
                if (duplicateUnitIds.length) {
                    const err = new Error(`Unit ${duplicateUnitIds[0]} is selected more than once.`);
                    err.statusCode = 400;
                    throw err;
                }

                for (const item of activeItems) {
                    const itemUnitId = item.unit_id || null;
                    const itemCheckIn = item.check_in || nextCheckIn;
                    const itemCheckOut = item.check_out || nextCheckOut;
                    if (!itemCheckIn || !itemCheckOut || itemCheckOut <= itemCheckIn) {
                        const err = new Error('Check-out must be after check-in.');
                        err.statusCode = 400;
                        throw err;
                    }
                    if (!itemUnitId || !ACTIVE_ITEM_STATUSES.includes(item.status)) continue;

                    const itemConflict = await dbGetAsync(
                        `SELECT booking_item_id, booking_reference, unit_id, check_in, check_out
                         FROM booking_items
                         WHERE booking_reference != ?
                           AND unit_id = ?
                           AND check_in < ?
                           AND check_out > ?
                           AND status IN (${quoteSqlStrings(ACTIVE_ITEM_STATUSES)})
                         LIMIT 1`,
                        [ref, itemUnitId, itemCheckOut, itemCheckIn]
                    );
                    if (itemConflict) {
                        const err = new Error(`Unit ${itemUnitId} is already blocked from ${itemConflict.check_in} to ${itemConflict.check_out}.`);
                        err.statusCode = 409;
                        err.conflict = itemConflict;
                        throw err;
                    }

                    const legacyConflict = await dbGetAsync(
                        `SELECT booking_ref, full_name, unit_id, check_in, check_out
                         FROM bookings
                         WHERE unit_id = ?
                           AND booking_ref != ?
                           AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                           AND check_in < ?
                           AND check_out > ?
                         LIMIT 1`,
                        [itemUnitId, ref, itemCheckOut, itemCheckIn]
                    );
                    if (legacyConflict) {
                        const err = new Error(`Unit ${itemUnitId} is already blocked by ${legacyConflict.full_name || legacyConflict.booking_ref} (${legacyConflict.check_in} to ${legacyConflict.check_out}).`);
                        err.statusCode = 409;
                        err.conflict = legacyConflict;
                        throw err;
                    }

                    const dateTagConflict = await findBlockingDateTag(itemUnitId, itemCheckIn, itemCheckOut);
                    if (dateTagConflict) {
                        const err = new Error(`Unit ${itemUnitId} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
                        err.statusCode = 409;
                        err.conflict = dateTagConflict;
                        throw err;
                    }
                }

                const headerStatus = normalizedWorkflow === 'checkin'
                    ? BOOKING_STATUS_CHECKED_IN
                    : normalizedWorkflow === 'checkout'
                        ? BOOKING_STATUS_CHECKED_OUT
                        : nextStatus;
                const guestName = booking.guest_name ?? booking.full_name ?? legacy.full_name ?? '';
                const lodgingTotal = Number(booking.lodging_total ?? booking.total_price ?? legacy.total_price ?? 0);
                const addonAmount = Number(booking.addon_amount ?? legacy.addon_amount ?? 0);
                const bookingMode = activeItems.length > 1 ? 'TRANSACTION_GROUP' : BOOKING_MODE_STANDARD;

                await dbRunAsync(
                    `INSERT INTO booking_headers
                     (booking_reference, guest_name, email, phone, check_in, check_out,
                      lodging_total, addon_amount, verified_paid_total, balance_due, status, payment_status,
                      booking_source, booking_mode, notes, special_requests, created_by, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
                    [
                        ref,
                        guestName,
                        booking.email ?? legacy.email ?? '',
                        booking.phone ?? legacy.phone ?? '',
                        nextCheckIn,
                        nextCheckOut,
                        lodgingTotal,
                        addonAmount,
                        lodgingTotal + addonAmount,
                        headerStatus,
                        defaultPaymentSummaryForBookingStatus(headerStatus),
                        booking.booking_source ?? legacy.booking_source ?? 'Direct',
                        bookingMode,
                        booking.notes !== undefined || booking.addon_note !== undefined || booking.addonNote !== undefined ? noteWithAddonContext(booking.notes ?? legacy.notes) : (legacy.notes || ''),
                        booking.special_requests ?? legacy.special_requests ?? '',
                        admin_id || legacy.created_by || 'admin',
                        legacy.created_at
                    ]
                );

                for (const item of activeItems) {
                    const unit = item.unit_id
                        ? await dbGetAsync(`SELECT unit_id, room_type_id FROM units WHERE unit_id = ?`, [item.unit_id])
                        : null;
                    await dbRunAsync(
                        `INSERT INTO booking_items
                         (booking_reference, unit_id, room_type, check_in, check_out, guest_count, lodging_subtotal, status, sequence_no)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            ref,
                            item.unit_id || null,
                            item.room_type || unit?.room_type_id || legacy.room_type || '',
                            item.check_in || nextCheckIn,
                            item.check_out || nextCheckOut,
                            Number(item.guest_count ?? booking.guests ?? legacy.guests ?? 0),
                            Number(item.lodging_subtotal ?? 0),
                            normalizedWorkflow === 'checkin' ? BOOKING_STATUS_CHECKED_IN : item.status,
                            item.sequence_no
                        ]
                    );
                }

                const legacyTransactions = await dbAllAsync(
                    `SELECT * FROM transactions WHERE booking_ref = ? ORDER BY created_at ASC, id ASC`,
                    [ref]
                );
                for (const tx of legacyTransactions) {
                    await dbRunAsync(
                        `INSERT INTO payments
                         (booking_reference, amount, payment_type, payment_method, receipt_url, reference_no, verification_status, notes, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
                        [
                            ref,
                            Number(tx.amount || 0),
                            tx.transaction_type || 'payment',
                            tx.payment_method || null,
                            tx.receipt_path || null,
                            null,
                            tx.status || 'PENDING_VERIFICATION',
                            tx.notes || 'Migrated from single-room booking during edit.',
                            tx.created_at
                        ]
                    );
                }

                if (paymentAmount > 0) {
                    await dbRunAsync(
                        `INSERT INTO payments
                         (booking_reference, amount, payment_type, payment_method, receipt_url, reference_no, verification_status, notes)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            ref,
                            paymentAmount,
                            payment.payment_type || (normalizedWorkflow === 'checkout' ? 'Full Settlement' : 'payment'),
                            payment.payment_method || 'Cash',
                            payment.receipt_url || null,
                            payment.reference_no || null,
                            payment.verification_status || 'VERIFIED',
                            payment.notes || `Recorded via ${normalizedWorkflow} change-set`
                        ]
                    );
                }

                await dbRunAsync(`DELETE FROM transactions WHERE booking_ref = ?`, [ref]);
                await dbRunAsync(`DELETE FROM bookings WHERE booking_ref = ?`, [ref]);

                let finance = await applyHeaderPaymentTarget(ref);
                if (['checkin', 'checkout'].includes(normalizedWorkflow) && Number(finance.balance_due || 0) > 1) {
                    const err = new Error(`Cannot ${normalizedWorkflow === 'checkin' ? 'check in' : 'check out'}: guest still owes P${Number(finance.balance_due || 0).toLocaleString()}.`);
                    err.statusCode = 400;
                    throw err;
                }

                const assignedUnitIds = activeItems.map((item) => item.unit_id).filter(Boolean);
                if (normalizedWorkflow === 'checkout') {
                    await dbRunAsync(`UPDATE booking_headers SET status = 'CHECKED_OUT' WHERE booking_reference = ?`, [ref]);
                    await dbRunAsync(`UPDATE booking_items SET status = 'CHECKED_OUT' WHERE booking_reference = ?`, [ref]);
                    for (const unitId of assignedUnitIds) {
                        await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
                    }
                } else {
                    for (const unitId of assignedUnitIds) {
                        const unitStatus = normalizedWorkflow === 'checkin' ? 'Checked In' : 'Available';
                        await dbRunAsync(`UPDATE units SET unit_status = ? WHERE unit_id = ?`, [unitStatus, unitId]);
                    }
                }
                if (legacy.unit_id && !assignedUnitIds.some((unitId) => String(unitId) === String(legacy.unit_id))) {
                    await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [legacy.unit_id]);
                }

                const updated = await getBookingHeaderWithItems(ref);
                finance = await recomputeHeaderFinance(ref);

                return {
                    booking_type: 'transaction_header',
                    workflow: normalizedWorkflow,
                    finance,
                    booking: updated,
                    converted_from: 'single_booking',
                    preview: buildBookingChangeSetPreview({
                        before: legacy,
                        after: updated?.header || {},
                        paymentAmount,
                        workflow: normalizedWorkflow,
                        finance
                    }),
                    newStatus: updated?.header?.status
                };
            }

            if ((datesChanged || unitChanged) && nextUnitId && INVENTORY_BLOCKING_BOOKING_STATUSES.includes(nextStatus)) {
                const conflict = await dbGetAsync(
                    `SELECT booking_ref, full_name, check_in, check_out
                     FROM bookings
                     WHERE unit_id = ?
                       AND booking_ref != ?
                       AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                       AND check_in < ?
                       AND check_out > ?
                     LIMIT 1`,
                    [nextUnitId, ref, nextCheckOut, nextCheckIn]
                );
                if (conflict) {
                    const err = new Error(`Unit ${nextUnitId} is already blocked by ${conflict.full_name || conflict.booking_ref} (${conflict.check_in} to ${conflict.check_out}).`);
                    err.statusCode = 409;
                    err.conflict = conflict;
                    throw err;
                }
                const dateTagConflict = await findBlockingDateTag(nextUnitId, nextCheckIn, nextCheckOut);
                if (dateTagConflict) {
                    const err = new Error(`Unit ${nextUnitId} is blocked from ${dateTagConflict.start_date} to ${dateTagConflict.end_date}.`);
                    err.statusCode = 409;
                    err.conflict = dateTagConflict;
                    throw err;
                }
            }

            const fields = [];
            const values = [];
            const legacyFieldMap = [
                ['full_name', booking.full_name ?? booking.guest_name],
                ['email', booking.email],
                ['phone', booking.phone],
                ['room_type', booking.room_type],
                ['unit_id', booking.unit_id],
                ['check_in', booking.check_in],
                ['check_out', booking.check_out],
                ['guests', booking.guests],
                ['booking_source', booking.booking_source],
                ['booking_type', booking.booking_type],
                ['notes', booking.notes !== undefined || booking.addon_note !== undefined || booking.addonNote !== undefined ? noteWithAddonContext(booking.notes ?? legacy.notes) : undefined],
                ['special_requests', booking.special_requests],
                ['addon_amount', booking.addon_amount],
                ['total_price', booking.total_price ?? booking.lodging_total],
                ['status', booking.status],
                ['payment_status', booking.payment_status],
            ];

            for (const [field, value] of legacyFieldMap) {
                if (value !== undefined) {
                    fields.push(`${field} = ?`);
                    values.push(['guests', 'addon_amount', 'total_price'].includes(field) ? Number(value || 0) : field === 'status' ? normalizeBookingStatus(value) : value);
                }
            }

            if (fields.length) {
                values.push(ref);
                await dbRunAsync(`UPDATE bookings SET ${fields.join(', ')} WHERE booking_ref = ?`, values);
            }

            if (paymentAmount > 0) {
                await dbRunAsync(
                    `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                     VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
                    [
                        ref,
                        paymentAmount,
                        payment.transaction_type || (normalizedWorkflow === 'checkout' ? 'Full Settlement' : 'payment'),
                        payment.payment_method || 'Cash',
                        `Admin Change-Set: ${payment.notes || normalizedWorkflow}`
                    ]
                );
            }

            let finance = await applyLegacyPaymentTarget(ref);
            if (['checkin', 'checkout'].includes(normalizedWorkflow) && Number(finance.balance || 0) > 1) {
                const err = new Error(`Cannot ${normalizedWorkflow === 'checkin' ? 'check in' : 'check out'}: guest still owes P${Number(finance.balance || 0).toLocaleString()}.`);
                err.statusCode = 400;
                throw err;
            }

            const current = await dbGetAsync(`SELECT * FROM bookings WHERE booking_ref = ?`, [ref]);
            if (normalizedWorkflow === 'checkin') {
                await dbRunAsync(`UPDATE bookings SET status = 'CHECKED_IN' WHERE booking_ref = ?`, [ref]);
                if (current?.unit_id) {
                    await dbRunAsync(`UPDATE units SET unit_status = 'Checked In' WHERE unit_id = ?`, [current.unit_id]);
                }
            }

            if (normalizedWorkflow === 'checkout') {
                await dbRunAsync(`UPDATE bookings SET status = 'CHECKED_OUT' WHERE booking_ref = ?`, [ref]);
                if (current?.unit_id) {
                    await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [current.unit_id]);
                }
            }

            finance = await recomputeLegacyBookingFinance(ref);
            const updated = await dbGetAsync(`SELECT * FROM bookings WHERE booking_ref = ?`, [ref]);

            return {
                booking_type: 'legacy_booking',
                workflow: normalizedWorkflow,
                finance,
                booking: updated,
                preview: buildBookingChangeSetPreview({
                    before: legacy,
                    after: updated || {},
                    paymentAmount,
                    workflow: normalizedWorkflow,
                    finance
                }),
                newStatus: updated?.status
            };
        };

        const result = preview
            ? await runInPreviewTransaction(applyChangeSet)
            : await runInTransaction(applyChangeSet);

        if (!preview) {
            logAction(
                `admin_booking_change_set_${normalizedWorkflow}`,
                'booking',
                ref,
                `Workflow ${normalizedWorkflow} applied${paymentAmount > 0 ? ` with payment ${paymentAmount}` : ''}.`,
                admin_id
            );
        }

        return res.json({
            message: `Booking ${ref} ${normalizedWorkflow} change-set ${preview ? 'previewed' : 'applied'}.`,
            is_preview: Boolean(preview),
            ...result
        });
    } catch (err) {
        const statusCode = err.statusCode || (/not found/i.test(err.message) ? 404 : 500);
        if (statusCode >= 500) console.error('Booking change-set failed:', err);
        return res.status(statusCode).json({ error: err.message || 'Booking change-set failed.', conflict: err.conflict || undefined });
    }
});

app.post('/api/v1/admin/bookings/:ref/add-charge', (req, res) => {
    const { ref } = req.params;
    const { amount, item_name, admin_id = 'admin' } = req.body;
    const val = parseFloat(amount);

    db.serialize(() => {
        // 1. Log the charge as an addon transaction for itemized history
        db.run(
            `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
             VALUES (?, ?, 'charge_item', 'VERIFIED', 'Admin Charge', ?)`,
            [ref, val, `Extra Charge: ${item_name}`]
        );

        // 2. Update the booking's aggregate addon_amount
        db.run(`UPDATE bookings SET addon_amount = COALESCE(addon_amount, 0) + ? WHERE booking_ref = ?`, [val, ref], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            syncBookingFinance(ref, (errSync, data) => {
                logAction('admin_charge', 'financial', ref, `Extra charge: ${item_name} (Ã¢â€šÂ±${amount})`, admin_id);
                res.json({ message: 'Charge added successfully.', ...data });
            });
        });
    });
});

app.post('/api/v1/admin/bookings/:ref/process-rebooking', async (req, res, next) => {
    const { ref } = req.params;
    const { new_check_in, new_check_out, reason, admin_id = 'admin' } = req.body;

    if (!new_check_in || !new_check_out || !reason) {
        return res.status(400).json({ error: 'new_check_in, new_check_out, and reason are required.' });
    }

    try {
        const booking = await dbGetAsync(`SELECT * FROM bookings WHERE booking_ref = ?`, [ref]);
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });

        if (!isBookingRebookableStatus(booking.status)) {
            return res.status(400).json({ error: 'Rebooking is available only after payment verification is approved.' });
        }

        if (!isRebookingEligible(booking.check_in)) {
            return res.status(400).json({ error: 'Rebooking is only allowed for bookings requested 7 days or more before arrival.' });
        }

        if (new_check_in >= new_check_out) {
            return res.status(400).json({ error: 'New check-out must be after new check-in.' });
        }

        if (booking.unit_id && booking.status !== 'CANCELLED' && booking.status !== 'REJECTED') {
            const availability = await analyzeRebookingTargetAvailability({
                booking,
                newCheckIn: new_check_in,
                newCheckOut: new_check_out
            });
            if (availability.conflict) {
                return res.status(409).json({
                    error: `Conflict: Unit ${booking.unit_id} is already booked for the requested dates.`,
                    conflicting_unit_id: booking.unit_id,
                    conflicting_booking: {
                        booking_ref: availability.conflict.booking_ref,
                        full_name: availability.conflict.full_name || availability.conflict.guest_name || '',
                        check_in: availability.conflict.check_in,
                        check_out: availability.conflict.check_out,
                        status: availability.conflict.status
                    },
                    suggested_units: availability.suggestedUnits
                });
            }
        }

        await dbRunAsync(
            `UPDATE bookings SET check_in = ?, check_out = ? WHERE booking_ref = ?`,
            [new_check_in, new_check_out, ref]
        );

        await dbRunAsync(
            `INSERT INTO rebookings (booking_ref, old_check_in, old_check_out, new_check_in, new_check_out, reason)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ref, booking.check_in, booking.check_out, new_check_in, new_check_out, `Admin Approved: ${reason}`]
        );

        syncBookingFinance(ref, (syncErr, data) => {
            if (syncErr) return res.status(500).json({ error: 'Financial sync failed: ' + syncErr.message });
            logAction('admin_rebooking', 'booking', ref, `Rebooked ${booking.check_in}->${new_check_in} / ${booking.check_out}->${new_check_out} | Reason: ${reason}`, admin_id);
            res.json({ message: 'Booking rebooked successfully.', ...data });
        });
    } catch (err) {
        console.error('Admin rebooking failed:', err);
        return next(err);
    }
});

app.post('/api/v1/admin/bookings/:ref/process-rebooking-legacy-disabled', (req, res) => {
    const { ref } = req.params;
    const { new_check_in, new_check_out, reason, admin_id = 'admin' } = req.body;

    if (!new_check_in || !new_check_out || !reason) {
        return res.status(400).json({ error: 'new_check_in, new_check_out, and reason are required.' });
    }

    db.get(`SELECT * FROM bookings WHERE booking_ref = ?`, [ref], (err, booking) => {
        if (err) return res.status(500).json({ error: 'Failed to load booking.' });
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });

        if (!isBookingRebookableStatus(booking.status)) {
            return res.status(400).json({ error: 'Rebooking is available only after payment verification is approved.' });
        }

        if (!isRebookingEligible(booking.check_in)) {
            return res.status(400).json({ error: 'Rebooking is only allowed for bookings requested 7 days or more before arrival.' });
        }

        if (new_check_in >= new_check_out) {
            return res.status(400).json({ error: 'New check-out must be after new check-in.' });
        }

        const finalizeRebooking = () => {
            db.run(
                `UPDATE bookings SET check_in = ?, check_out = ? WHERE booking_ref = ?`,
                [new_check_in, new_check_out, ref],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });

                    db.run(
                        `INSERT INTO rebookings (booking_ref, old_check_in, old_check_out, new_check_in, new_check_out, reason)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [ref, booking.check_in, booking.check_out, new_check_in, new_check_out, `Admin Approved: ${reason}`],
                        (insertErr) => {
                            if (insertErr) return res.status(500).json({ error: insertErr.message });
                            syncBookingFinance(ref, (syncErr, data) => {
                                if (syncErr) return res.status(500).json({ error: 'Financial sync failed: ' + syncErr.message });
                                logAction('admin_rebooking', 'booking', ref, `Rebooked ${booking.check_in}->${new_check_in} / ${booking.check_out}->${new_check_out} | Reason: ${reason}`, admin_id);
                                res.json({ message: 'Booking rebooked successfully.', ...data });
                            });
                        }
                    );
                }
            );
        };

        if (booking.unit_id && booking.status !== 'CANCELLED' && booking.status !== 'REJECTED') {
            db.get(`
                SELECT booking_ref, full_name, check_in, check_out
                FROM bookings
                WHERE unit_id = ?
                  AND booking_ref != ?
                  AND status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                  AND check_in < ? AND check_out > ?
                LIMIT 1
            `, [booking.unit_id, ref, new_check_out, new_check_in], (conflictErr, conflict) => {
                if (conflictErr) return res.status(500).json({ error: 'Availability check failure.' });
                if (conflict) {
                    return res.status(409).json({
                        error: `Ã¢â€ºâ€ Conflict: Unit ${booking.unit_id} is already taken by ${conflict.full_name} (${conflict.check_in} to ${conflict.check_out}).`
                    });
                }
                finalizeRebooking();
            });
            return;
        }

        finalizeRebooking();
    });
});

app.post('/api/v1/admin/bookings/:ref/process-refund', (req, res) => {
    return res.status(410).json({
        error: 'Refund processing has been retired. Use rebooking for requests made 7 days or more before arrival.'
    });
});
app.post('/api/v1/admin/bookings/:ref/apply-discount', (req, res) => {
    const { ref } = req.params;
    const { amount, reason, admin_id = 'admin' } = req.body;
    const val = parseFloat(amount);

    // Discounts reduce the total_price (base room cost)
    db.run(`UPDATE bookings SET total_price = total_price - ? WHERE booking_ref = ?`, [val, ref], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Log the discount in transactions for history too
        db.run(`INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                VALUES (?, ?, 'discount', 'VERIFIED', 'Admin Discount', ?)`,
                [ref, val, `Discount Applied: ${reason}`]);

        syncBookingFinance(ref, (errSync, data) => {
            logAction('admin_discount', 'financial', ref, `Discount Ã¢â€šÂ±${amount} | Reason: ${reason}`, admin_id);
            res.json({ message: 'Discount applied successfully.', ...data });
        });
    });
});


app.patch('/api/v1/admin/units/:unit_id/status', (req, res) => {
    const { unit_id } = req.params;
    const { status, admin_id = 'admin' } = req.body;
    
    db.run(`UPDATE units SET unit_status = ? WHERE unit_id = ?`, [status, unit_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction('unit_status_change', 'unit', unit_id, `Status set to ${status}`, admin_id);
        res.json({ message: 'Unit status updated.' });
    });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin: Hard Deletion System Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.post('/api/v1/admin/unit-date-tags', async (req, res) => {
    const {
        unit_id,
        tag_type,
        start_date,
        end_date,
        note = '',
        blocks_inventory = false,
        admin_id = 'admin'
    } = req.body || {};

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const cleanUnitId = String(unit_id || '').trim();
    const cleanTagType = String(tag_type || '').trim();
    const cleanStart = String(start_date || '').trim();
    const cleanEnd = String(end_date || '').trim();

    if (!cleanUnitId || !cleanTagType || !datePattern.test(cleanStart) || !datePattern.test(cleanEnd)) {
        return res.status(400).json({ error: 'unit_id, tag_type, start_date, and end_date are required.' });
    }
    if (cleanStart >= cleanEnd) {
        return res.status(400).json({ error: 'end_date must be after start_date.' });
    }

    try {
        const unit = await dbGetAsync(`SELECT unit_id FROM units WHERE unit_id = ?`, [cleanUnitId]);
        if (!unit) return res.status(404).json({ error: 'Unit not found.' });

        const result = await dbRunAsync(`
            INSERT INTO unit_date_tags (unit_id, tag_type, start_date, end_date, note, blocks_inventory, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            cleanUnitId,
            cleanTagType,
            cleanStart,
            cleanEnd,
            String(note || '').trim(),
            blocks_inventory ? 1 : 0,
            admin_id
        ]);

        const created = await dbGetAsync(`SELECT * FROM unit_date_tags WHERE id = ?`, [result.lastID]);
        logAction('unit_date_tag_create', 'unit', cleanUnitId, `${cleanTagType} from ${cleanStart} to ${cleanEnd}`, admin_id);
        res.status(201).json({ message: 'Unit date tag created.', tag: created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/v1/admin/unit-date-tags/:id', async (req, res) => {
    const { id } = req.params;
    const { admin_id = 'admin' } = req.body || {};

    try {
        const existing = await dbGetAsync(`SELECT * FROM unit_date_tags WHERE id = ?`, [id]);
        if (!existing) return res.status(404).json({ error: 'Date tag not found.' });

        await dbRunAsync(`DELETE FROM unit_date_tags WHERE id = ?`, [id]);
        logAction('unit_date_tag_delete', 'unit', existing.unit_id, `${existing.tag_type} ${existing.start_date} to ${existing.end_date}`, admin_id);
        res.json({ message: 'Unit date tag removed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/v1/admin/bookings/:ref', (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body || {};

    db.get(`SELECT unit_id, status, full_name, room_type FROM bookings WHERE booking_ref = ?`, [ref], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!row) {
            getBookingHeaderWithItems(ref)
                .then((transactionBooking) => {
                    if (!transactionBooking) {
                        return res.status(404).json({ error: 'Booking not found.' });
                    }

                    return runInTransaction(async () => {
                        const assignedUnitIds = (transactionBooking.items || [])
                            .map((item) => item.unit_id)
                            .filter(Boolean);

                        for (const unitId of assignedUnitIds) {
                            await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
                        }

                        await dbRunAsync(`DELETE FROM payments WHERE booking_reference = ?`, [ref]);
                        await dbRunAsync(`DELETE FROM booking_items WHERE booking_reference = ?`, [ref]);
                        await dbRunAsync(`DELETE FROM booking_headers WHERE booking_reference = ?`, [ref]);

                        logAction(
                            'admin_hard_delete',
                            'transaction_booking',
                            ref,
                            `PERMANENTLY REMOVED: ${transactionBooking.header.guest_name || 'Walk-in Guest'} | ${transactionBooking.items.length} item(s)`,
                            admin_id
                        );

                        return res.json({ message: 'Transaction booking and associated payment records purged successfully.' });
                    });
                })
                .catch((deleteErr) => res.status(500).json({ error: 'Deletion failed: ' + deleteErr.message }));
            return;
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // 1. Release room if it was checked in
            if (row.unit_id && [BOOKING_STATUS_CHECKED_IN, LEGACY_OCCUPIED_STATUS].includes(row.status)) {
                db.run(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [row.unit_id]);
            }

            // 2. Cascade delete transactions to prevent ledger orphans
            db.run(`DELETE FROM transactions WHERE booking_ref = ?`, [ref]);

            // 3. Delete the booking itself
            db.run(`DELETE FROM bookings WHERE booking_ref = ?`, [ref], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Deletion failed: ' + err.message });
                }
                
                db.run('COMMIT');
                logAction('admin_hard_delete', 'booking', ref, 
                    `PERMANENTLY REMOVED: ${row.full_name} | ${row.room_type} | Unit: ${row.unit_id || 'N/A'}`, admin_id);
                
                res.json({ message: 'Booking and associated financial records purged successfully.' });
            });
        });
    });
});


// Ã¢â€â‚¬Ã¢â€â‚¬ Admin: Checkout Process Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.post('/api/v1/admin/bookings/:ref/checkout', async (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body;

    try {
        const transactionBooking = await getBookingHeaderWithItems(ref);
        if (transactionBooking) {
            const refreshedFinance = await recomputeHeaderFinance(ref);
            const balance = Number(refreshedFinance.balance_due || 0);

            if (balance > 1) {
                return res.status(400).json({
                    error: `Cannot checkout: Guest still owes P${balance.toLocaleString()}. Please settle all balances in the Funds Hub first.`
                });
            }

            const updated = await updateTransactionBooking(ref, { status: 'CHECKED_OUT' });
            const releasedUnits = (updated?.items || []).map((item) => item.unit_id).filter(Boolean);

            logAction(
                'admin_checkout_header',
                'booking_header',
                ref,
                `Checkout completed for ${updated?.header?.guest_name || ref}. Released ${releasedUnits.length} unit(s).`,
                admin_id
            );

            return res.json({
                message: `Checkout successful! ${releasedUnits.length} unit(s) released.`,
                newStatus: 'CHECKED_OUT'
            });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }

    // Use Live Source of Truth (Summing Transactions)
    const sql = `
        SELECT b.*, 
               COALESCE(SUM(CASE WHEN COALESCE(t.status, 'PENDING_VERIFICATION') != 'REJECTED' AND t.transaction_type != 'addon' THEN t.amount ELSE 0 END), 0) as amount_paid
        FROM bookings b
        LEFT JOIN transactions t ON b.booking_ref = t.booking_ref
        WHERE b.booking_ref = ?
        GROUP BY b.booking_ref
    `;

    db.get(sql, [ref], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Booking not found.' });

        // Calculate current balance (Strict zero-balance check)
        const total = parseFloat(row.total_price || 0);
        const addon = parseFloat(row.addon_amount || 0);
        const paid  = parseFloat(row.amount_paid || 0);
        const balance = (total + addon) - paid;

        if (balance > 1) {
            return res.status(400).json({
                error: `Ã¢â€ºâ€ Cannot checkout: Guest still owes Ã¢â€šÂ±${balance.toLocaleString()}. Please settle all balances in the Funds Hub first.`
            });
        }

        db.serialize(() => {
            // 1. Release the room
            if (row.unit_id) {
                db.run(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [row.unit_id]);
            }

            // 2. Mark as checked out
            db.run(`UPDATE bookings SET status = 'CHECKED_OUT' WHERE booking_ref = ?`, [ref], (updErr) => {
                if (updErr) return res.status(500).json({ error: updErr.message });
                
                logAction('admin_checkout', 'booking', ref, `Checkout completed for ${row.full_name}. Unit ${row.unit_id} released.`, admin_id);
                res.json({ message: 'Checkout successful! Record updated and room is now Available.', newStatus: 'CHECKED_OUT' });
            });
        });
    });
});


// Ã¢â€â‚¬Ã¢â€â‚¬ Admin CRUD: Delete Booking Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.delete('/api/v1/admin/bookings/:ref', (req, res) => {
    const { ref } = req.params;
    const { admin_id = 'admin' } = req.body || {};

    // First, grab the booking for logging
    db.get('SELECT * FROM bookings WHERE booking_ref = ?', [ref], (err, booking) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!booking) {
            getBookingHeaderWithItems(ref)
                .then((transactionBooking) => {
                    if (!transactionBooking) {
                        return res.status(404).json({ error: 'Booking not found.' });
                    }

                    return runInTransaction(async () => {
                        const assignedUnitIds = (transactionBooking.items || [])
                            .map((item) => item.unit_id)
                            .filter(Boolean);

                        for (const unitId of assignedUnitIds) {
                            await dbRunAsync(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [unitId]);
                        }

                        await dbRunAsync(`DELETE FROM payments WHERE booking_reference = ?`, [ref]);
                        await dbRunAsync(`DELETE FROM booking_items WHERE booking_reference = ?`, [ref]);
                        await dbRunAsync(`DELETE FROM booking_headers WHERE booking_reference = ?`, [ref]);

                        logAction(
                            'admin_delete_booking',
                            'transaction_booking',
                            ref,
                            `Deleted transaction booking: ${transactionBooking.header.guest_name || 'Walk-in Guest'} | ${transactionBooking.items.length} item(s) | Admin: ${admin_id}`,
                            'admin_portal'
                        );

                        return res.json({ message: `Transaction booking ${ref} permanently deleted.` });
                    });
                })
                .catch((deleteErr) => res.status(500).json({ error: 'Delete failed: ' + deleteErr.message }));
            return;
        }

        db.serialize(() => {
            // RELEASE unit if assigned (still do this so room becomes available)
            if (booking.unit_id) {
                db.run(`UPDATE units SET unit_status = 'Available' WHERE unit_id = ?`, [booking.unit_id]);
            }
            
            // SOFT DELETE (FLAG ONLY)
            // We keep the transactions for the ledger, but mark the booking as deleted.
            db.run(`UPDATE bookings SET is_deleted = 1 WHERE booking_ref = ?`, [ref], function(err) {
                if (err) return res.status(500).json({ error: 'Delete failed: ' + err.message });
                
                logAction('admin_delete_booking', 'booking', ref,
                    `Soft Deleted: ${booking.full_name} | ${booking.room_type} | Admin: ${admin_id}`,
                    'admin_portal');
                    
                res.json({ message: `Booking ${ref} moved to archive (Soft Deleted).` });
            });
        });
    });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin CRUD: Hardened Manual Booking (Combined Route Handlers) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.post(['/api/v1/admin/bookings', '/api/v1/admin/bookings/manual'], async (req, res) => {
    const {
        full_name, email, phone, room_type, check_in, check_out,
        guests, total_price: rawPrice, amount_paid: rawAmountPaid,
        booking_type = 'overnight',
        booking_source = 'Walk-in', status = BOOKING_STATUS_RESERVED,
        booking_mode = BOOKING_MODE_STANDARD,
        notes = '', special_requests = '',
        unit_id = null,
        addon_amount: rawAddon = 0,
        addon_category = '',
        payment_status: rawPayStatus,
        group_code = null,
        group_name = null,
        group_master_ref = null,
        group_sequence = null,
        admin_id = 'admin'
    } = req.body;
    const total_price = parseFloat(rawPrice)  || 0;
    const amount_paid = parseFloat(rawAmountPaid) || 0;
    const addon_amount = parseFloat(rawAddon) || 0;
    const grand_total  = total_price + addon_amount;
    const balance     = Math.max(0, grand_total - amount_paid);

    // Auto-derive payment_status from real numbers Ã¢â‚¬â€ don't trust the caller
    const payment_status = normalizePaymentSummary(
        rawPayStatus || derivePaymentSummary({ grossTotal: grand_total, netPaid: amount_paid, hasPendingProof: amount_paid > 0 }),
        { hasProof: amount_paid > 0 }
    );
    const normalizedStatus = normalizeBookingStatus(status);

    if (!full_name || !room_type || !check_in || !check_out) {
        return res.status(400).json({ error: 'full_name, room_type, check_in, check_out are required.' });
    }

    const kb = loadKnowledgeBaseJson();
    if (await shouldEnforceHolidayMinimumStay(kb)) {
        const holidayViolation = getHolidayMinimumStayViolation({
            checkIn: check_in,
            checkOut: check_out,
            bookingType: booking_type,
            kb,
        });
        if (holidayViolation) {
            return res.status(400).json({ error: buildHolidayMinimumStayMessage(holidayViolation) });
        }
    }

    const isSpecial = booking_type === 'day_tour' || booking_type === 'tent_pitching';

    if (booking_type === 'tent_pitching' && (Number(guests) < 1 || Number(guests) > 2)) {
        return res.status(400).json({ error: 'Tent bookings allow 1 or 2 guests only. One booking reserves exactly one tent slot.' });
    }

    if (booking_type === 'day_tour') {
        const dayTourCapacity = Number(kb.special_bookings?.day_tour?.max_capacity_pax || 0);
        if (Number(guests) < 1) {
            return res.status(400).json({ error: 'Day tours require at least 1 guest.' });
        }
        if (dayTourCapacity && Number(guests) > dayTourCapacity) {
            return res.status(400).json({ error: `Capacity Exceeded: Day Tour only allows ${dayTourCapacity} guests.` });
        }
    }

    if (!isSpecial) {
        // Admin PAX Guard: overnight capacity always comes from the knowledge base.
        const accommodationCapacity = getAccommodationCapacity(kb, { roomType: room_type, unitId: unit_id });
        const effectiveMax = Number(accommodationCapacity?.absolute_max_pax || 0);

        if (!effectiveMax) {
            return res.status(400).json({ error: `Capacity data for ${unit_id || room_type} is unavailable.` });
        }

        if (Number(guests || 0) > effectiveMax) {
            return res.status(400).json({ error: `Capacity Exceeded: ${unit_id || room_type} only allows ${effectiveMax} guests.` });
        }
    }

        // Ã°Å¸â€ºÂ¡Ã¯Â¸  Availability Guard: block if room_type is fully booked for these dates
    const runInsert = () => {
        const prefixMap = {
            'overnight': 'MAN', 'day_tour': 'MDT', 'tent_pitching': 'MTP',
            'Amalfi Suite': 'AMS',
            'Positano Vista': 'POS',
            'Ravello Suite': 'RAV',
            'Capri Vista': 'CAP',
            'Sirenuse Suite': 'SIR',
            'Sunset Pavilion': 'SUN'
        };
        const prefix      = prefixMap[room_type] || prefixMap[booking_type] || 'MAN';
        const booking_ref = `${prefix}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        db.run(
            `INSERT INTO bookings
             (booking_ref, room_type, booking_type, check_in, check_out, guests,
             full_name, email, phone, total_price, balance, addon_amount,
              status, payment_status, booking_source, booking_mode, created_by,
              notes, special_requests, unit_id, group_code, group_name, group_master_ref, group_sequence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, ?)`,
            [booking_ref, room_type, booking_type, check_in, check_out, guests || 1,
             full_name, email || '', phone || '', total_price, balance, addon_amount,
             normalizedStatus, payment_status, booking_source, booking_mode,
             notes || '', special_requests || '', unit_id || null,
             group_code || null, group_name || null, group_master_ref || null, group_sequence ?? null],
            function(err) {
                if (err) return res.status(500).json({ error: 'Manual booking failed: ' + err.message });

                // Ã¢â€â‚¬Ã¢â€â‚¬ Record initial payment as a VERIFIED transaction Ã¢â€â‚¬Ã¢â€â‚¬
                if (amount_paid > 0) {
                    const txType = (amount_paid >= total_price && total_price > 0) ? 'Full Payment' : 'deposit';
                    db.run(
                        `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method)
                         VALUES (?, ?, ?, 'VERIFIED', 'Admin Entry')`,
                        [booking_ref, amount_paid, txType]
                    );
                }

                // Ã¢â€â‚¬Ã¢â€â‚¬ Record add-on charges Ã¢â€â‚¬Ã¢â€â‚¬
                if (addon_amount > 0) {
                    const addonNote = addon_category
                        ? `Add-on: ${addon_category} Ã¢â‚¬â€ PENDING SETTLEMENT`
                        : 'Add-on charges Ã¢â‚¬â€ PENDING SETTLEMENT';
                    db.run(
                        `INSERT INTO transactions (booking_ref, amount, transaction_type, status, payment_method, notes)
                         VALUES (?, ?, 'addon', 'PENDING_SETTLEMENT', 'Admin Entry', ?)`,
                        [booking_ref, addon_amount, addonNote]
                    );
                }

                logAction('admin_manual_booking', 'booking', booking_ref,
                    `Manual: ${full_name} | ${room_type} | ${check_in}Ã¢â€ â€™${check_out} | Paid: Ã¢â€šÂ±${amount_paid}/${total_price} (${payment_status}) | Unit: ${unit_id || 'unassigned'} | Group: ${group_code || 'solo'} | Admin: ${admin_id}`,
                    'admin_portal');
                res.status(200).json({
                    booking_ref,
                    payment_status,
                    unit_id: unit_id || null,
                    group_code: group_code || null,
                    group_name: group_name || null,
                    group_master_ref: group_master_ref || null,
                    group_sequence: group_sequence ?? null
                });
            }
        );
    };

    // Special bookings (day tour / tent pitching) Ã¢â‚¬â€ just check slots
    if (isSpecial) {
        const typeData = kb.special_bookings?.[booking_type];
        const slotsTotal = typeData?.slots_available || 1;
        const slotQuery = booking_type === 'tent_pitching'
            ? [`SELECT COUNT(*) as booked_count FROM bookings
                 WHERE booking_type = 'tent_pitching'
                   AND check_in < ? AND check_out > ?
                   AND status NOT IN ('REJECTED','CANCELLED')`, [check_out, check_in]]
            : [`SELECT COUNT(*) as booked_count FROM bookings
                 WHERE booking_type = ? AND DATE(check_in) = ?
                   AND status NOT IN ('REJECTED','CANCELLED')`, [booking_type, check_in]];
        db.get(slotQuery[0], slotQuery[1], (err, row) => {
            if (err) return res.status(500).json({ error: 'Slot check failed.' });
            const booked = row?.booked_count || 0;
            if ((slotsTotal - booked) <= 0) {
                return res.status(409).json({ error: `Ã¢â€ºâ€ ${booking_type.replace(/_/g,' ')} is fully booked for the selected date(s). Please choose a different date.` });
            }
            runInsert();
        });
        return;
    }

    // Overnight bookings Ã¢â‚¬â€ two-layer availability guard:
    //   Layer 1: If a specific unit_id is given, check that EXACT unit for date conflicts
    //   Layer 2: Check room_type capacity (all units of that type)
    const checkRoomTypeCapacity = () => {
        db.get(`
            SELECT r.total_units,
                   COUNT(b.booking_ref) as booked_count
            FROM rooms r
            LEFT JOIN bookings b
                ON b.room_type = r.room_type
                AND b.status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                AND b.check_in < ? AND b.check_out > ?
            WHERE r.room_type = ?
            GROUP BY r.room_type
        `, [check_out, check_in, room_type], (err, row) => {
            if (err) return res.status(500).json({ error: 'Availability check failed.' });
            if (row) {
                const totalUnits = Number(row.total_units || 10); // Fallback to 10 if metadata missing
                const available = totalUnits - (row.booked_count || 0);
                if (available <= 0) {
                    return res.status(409).json({
                        error: `Ã¢â€ºâ€ ${room_type} is fully booked (${row.booked_count}/${totalUnits}) for ${check_in} Ã¢â€ â€™ ${check_out}.`
                    });
                }
            }
            runInsert();
        });
    };

        // Layer 1: Unit-level conflict check (prevents overlapping blocks on the same unit)
        if (unit_id) {
            db.get(`
                SELECT b.booking_ref, b.full_name, b.check_in, b.check_out
                FROM bookings b
                WHERE b.unit_id = ?
                  AND b.status IN (${quoteSqlStrings(INVENTORY_BLOCKING_BOOKING_STATUSES)})
                  AND b.check_in < ? AND b.check_out > ?
                LIMIT 1
            `, [unit_id, check_out, check_in], (err, conflict) => {
                if (err) return res.status(500).json({ error: 'Unit availability check failed.' });
                if (conflict) {
                    return res.status(409).json({
                        error: `Ã¢â€ºâ€ Unit "${unit_id}" is already occupied by ${conflict.full_name} (${conflict.booking_ref}) from ${conflict.check_in} Ã¢â€ â€™ ${conflict.check_out}. Choose a different unit or date range.`
                    });
                }
                // Unit is free Ã¢â‚¬â€ still verify room_type capacity as a safety net
                checkRoomTypeCapacity();
            });
        } else {
            checkRoomTypeCapacity();
        }
    
});

// Legacy Google Sheets sync endpoint Ã¢â‚¬â€ retired, Amalfi uses SQLite directly
app.get('/api/v1/admin/sync/full', (req, res) => {
    const tableKeys = {
        'rooms': 'id',
        'units': 'unit_id',
        'bookings': 'booking_ref',
        'transactions': 'id',
        'approvals': 'id',
        'audit_logs': 'id'
    };

    res.json({ status: 'retired', message: 'Google Sheets sync has been removed. Amalfi uses its own SQLite tables.' });
});

// Ã°Å¸Å¡â‚¬ ADMIN: Bulk Booking Importer (System Wins Logic)
app.post('/api/v1/admin/financials/bulk-import', (req, res) => {
    const { bookings, dryRun } = req.body;
    if (!Array.isArray(bookings)) return res.status(400).json({ error: 'Bookings array required.' });

    const results = [];
    const roomsInfo = {};

    // Load room capacity into memory for faster checks
    db.all("SELECT room_type, total_units FROM rooms", [], (err, roomRows) => {
        if (err) return res.status(500).json({ error: 'DB Error loading rooms' });
        roomRows.forEach(r => roomsInfo[r.room_type] = r.total_units);

        // Recursive processor to handle async DB calls sequentially
        const processRow = (idx) => {
            if (idx >= bookings.length) {
                return res.json({ results });
            }

            const row = bookings[idx];
            const ref = row.booking_ref;

            // 1. DUPLICATE CHECK
            if (ref) {
                db.get("SELECT booking_ref FROM bookings WHERE booking_ref = ?", [ref], (err, exists) => {
                    if (exists) {
                        results.push({ ...row, status: 'SKIPPED', reason: 'Duplicate Reference (System Wins)' });
                        return processRow(idx + 1);
                    }
                    checkInventory(idx, row);
                });
            } else {
                checkInventory(idx, row);
            }
        };

        const checkInventory = (idx, row) => {
            const checkIn = row.check_in;
            const checkOut = row.check_out;
            const roomType = row.room_type;
            const unitId = row.unit_id;

            // 2. OVERBOOKING CHECK (Unit Level)
            const unitConflictQuery = `
                SELECT booking_ref, full_name FROM bookings 
                WHERE unit_id = ? AND status NOT IN ('CANCELLED','REJECTED')
                AND check_in < ? AND check_out > ?
            `;
            
            db.get(unitConflictQuery, [unitId, checkOut, checkIn], (err, conflict) => {
                if (conflict) {
                    results.push({ ...row, status: 'REJECTED', reason: `Unit ${unitId} occupied by ${conflict.full_name}` });
                    return processRow(idx + 1);
                }

                // 3. CAPACITY CHECK (Room Type Level)
                const capQuery = `
                    SELECT COUNT(*) as count FROM bookings 
                    WHERE room_type = ? AND status NOT IN ('CANCELLED','REJECTED')
                    AND check_in < ? AND check_out > ?
                `;
                db.get(capQuery, [roomType, checkOut, checkIn], (err, capRow) => {
                    const booked = capRow?.count || 0;
                    const total = roomsInfo[roomType] || 0;

                    if (booked >= total) {
                        results.push({ ...row, status: 'REJECTED', reason: `${roomType} is fully booked (${booked}/${total})` });
                        return processRow(idx + 1);
                    }

                    // VALID - Proceed to Import (if not dry run)
                    if (dryRun) {
                        results.push({ ...row, status: 'VALID', reason: 'Ready to import' });
                        return processRow(idx + 1);
                    } else {
                        performInsert(idx, row);
                    }
                });
            });
        };

        const performInsert = (idx, row) => {
            const prefixMap = { 'Amalfi Suite': 'AMS', 'Positano Vista': 'POS', 'Ravello Suite': 'RAV', 'Capri Vista': 'CAP', 'Sirenuse Suite': 'SIR', 'Sunset Pavilion': 'SUN' };
            const unitCode = prefixMap[row.room_type] || 'BRZ';
            const finalRef = row.booking_ref || `${unitCode}-B${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            
            const total = Number(row.total_price || 0);
            const addon = Number(row.addon_amount || 0);
            const paid = Number(row.amount_paid || 0);
            const balance = (total + addon) - paid;

            const q = `INSERT INTO bookings (
                booking_ref, full_name, room_type, unit_id, status,
                check_in, check_out, total_price, addon_amount, amount_paid, balance, booking_source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Bulk Import')`;

            const params = [
                finalRef, row.full_name, row.room_type, row.unit_id,
                normalizeBookingStatus(row.status || BOOKING_STATUS_RESERVED), row.check_in, row.check_out,
                total, addon, paid, balance
            ];

            db.run(q, params, function(err) {
                if (err) {
                    results.push({ ...row, status: 'ERROR', reason: err.message });
                } else {
                    logAction('bulk_import', 'booking', finalRef, `Bulk Added: ${row.full_name}`, 'admin');
                    results.push({ ...row, status: 'IMPORTED', booking_ref: finalRef });
                }
                processRow(idx + 1);
            });
        };

        processRow(0);
    });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin: Financial Reconciliation (Passbook Pulse) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/v1/admin/bookings/:ref/reconciliation', async (req, res) => {
    const { ref } = req.params;

    try {
        const transactionReconciliation = await buildTransactionReconciliation(ref);
        if (transactionReconciliation) {
            return res.json(transactionReconciliation);
        }
    } catch (error) {
        return res.status(500).json({ error: 'Ledger retrieval failure.' });
    }

    // 1. Get Core Booking metadata
    db.get(`SELECT total_price, addon_amount, full_name, created_at, status FROM bookings WHERE booking_ref = ?`, [ref], (err, booking) => {
        if (err) return res.status(500).json({ error: 'Database access failure.' });
        if (!booking) return res.status(404).json({ error: 'Sanctuary record not found.' });

        // 2. Aggregate all financial events: Initial Contract + Transactions
        const query = `
            SELECT amount, transaction_type, status, payment_method, notes, created_at 
            FROM transactions 
            WHERE booking_ref = ? 
            ORDER BY created_at ASC
        `;

        db.all(query, [ref], (err2, txs) => {
            if (err2) return res.status(500).json({ error: 'Ledger retrieval failure.' });

            const events = [];

            // Anchor: The Initial Reservation Charge
            events.push({
                type: 'DEBIT',
                category: 'Property Reservation',
                amount: booking.total_price,
                description: 'Base contract for sanctuary residency',
                timestamp: booking.created_at,
                status: 'FINALIZED'
            });

            // Iterate Transactions and normalize to Pulse events
            txs.forEach(tx => {
                let category = 'Financial Event';
                let type = 'CREDIT'; // Payments reduce debt
                let normalizedStatus = tx.status;

                // Type Mapping
                switch(tx.transaction_type) {
                    case 'payment':
                    case 'deposit':
                    case 'Full Settlement':
                        type = 'CREDIT';
                        category = 'Capital Receipt';
                        break;
                    case 'refund':
                        type = 'DEBIT'; // Refund is money leaving the system, increasing the guest's "effective" debt or reducing their credit
                        category = 'Capital Return';
                        break;
                    case 'charge_item':
                    case 'addon':
                    case 'Extra Charge':
                        type = 'DEBIT';
                        category = 'Service Add-on';
                        break;
                    case 'discount':
                        type = 'CREDIT'; // Discount reduces balance owed
                        category = 'Goodwill Adjustment';
                        break;
                    default:
                        category = tx.transaction_type;
                }

                events.push({
                    type,
                    category,
                    amount: tx.amount,
                    description: tx.notes || `${category} processed via ${tx.payment_method}`,
                    timestamp: tx.created_at,
                    status: normalizedStatus,
                    method: tx.payment_method
                });
            });

            // Sort by absolute chronology
            events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Calculate Running Financial Pulse
            let balance = 0;
            const timeline = events.map(ev => {
                const delta = (ev.type === 'DEBIT') ? ev.amount : -ev.amount;
                
                // Only confirmed/verified events affect the running balance
                const isVerified = (ev.status === 'VERIFIED' || ev.status === 'APPROVED' || ev.status === 'FINALIZED' || ev.status === 'Full Payment' || ev.status === 'Full Settlement');
                
                if (isVerified) {
                    balance += delta;
                }

                return { ...ev, running_balance: balance, affects_balance: isVerified };
            });

            res.json({
                booking_ref: ref,
                guest: booking.full_name,
                current_status: booking.status,
                timeline,
                total_verified_balance: balance
            });
        });
    });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin: Chatbot Logs Proxy Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Proxies requests to the chatbot container (port 8001) so the admin panel
// can fetch logs through the hub-api (exposed via Cloudflare Tunnel)
// instead of trying to hit port 8001 directly from the browser.
app.get('/api/v1/admin/chatbot-logs', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const limit = req.query.limit || 40;
        const response = await fetch(`${chatbotHost}/logs?limit=${limit}`);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.get('/api/v1/admin/chatbot-alerts', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const limit = req.query.limit || 40;
        const status = req.query.status || 'open';
        const response = await fetch(`${chatbotHost}/alerts?limit=${limit}&status=${status}`);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot alert proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.get('/api/v1/admin/chatbot-conversations', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const limit = req.query.limit || 60;
        const response = await fetch(`${chatbotHost}/conversations?limit=${limit}`);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot conversation proxy failed:`, err.message);
        res.json({
            conversations: [],
            unavailable: true,
            error: 'Could not reach Chatbot Service.'
        });
    }
});

app.get('/api/v1/admin/chatbot-archives', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const response = await fetch(`${chatbotHost}/archives`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot archive list proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/archive', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const response = await fetch(`${chatbotHost}/conversations/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot conversation archive proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/purge', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const response = await fetch(`${chatbotHost}/conversations/purge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot conversation purge proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/demo', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const response = await fetch(`${chatbotHost}/conversations/demo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot demo conversation proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/:senderId/archive', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/archive`, { method: 'POST' });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot conversation archive proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.get('/api/v1/admin/chatbot-conversations/:senderId', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const limit = req.query.limit || 200;
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}?limit=${limit}`);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot conversation detail proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.get('/api/v1/admin/chatbot-payment-confirmations', async (req, res) => {
    try {
        const days = Number(req.query.days || 14);
        const senderId = String(req.query.sender_id || '').trim();
        const confirmations = await listChatbotPaymentConfirmationCandidates({ senderId, days });
        res.json({ confirmations, days });
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot payment confirmation lookup failed:`, err.message);
        res.status(500).json({ error: 'Could not load chatbot payment confirmation candidates.' });
    }
});

app.delete('/api/v1/admin/chatbot-conversations/:senderId', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}`, { method: 'DELETE' });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot conversation delete proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/:senderId/reply', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            return res.status(response.ok ? 400 : response.status).json({ error: data.error || 'Failed to send chatbot reply.' });
        }
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot reply proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/:senderId/notify', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            return res.status(response.ok ? 400 : response.status).json({ error: data.error || 'Failed to send chatbot notification.' });
        }
        logAction(
            'chatbot_notification',
            'chatbot_conversation',
            req.params.senderId,
            `Type: ${req.body?.type || 'notification'} | Booking: ${req.body?.booking_ref || 'n/a'}`,
            req.body?.admin_id || 'admin_portal',
            req.ip
        );
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot notification proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.get('/api/v1/admin/chatbot-conversations/:senderId/status', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/status`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot status proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.patch('/api/v1/admin/chatbot-conversations/:senderId/category', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/category`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot category proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/:senderId/pause', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot pause proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.post('/api/v1/admin/chatbot-conversations/:senderId/resume', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const senderId = encodeURIComponent(req.params.senderId);
        const response = await fetch(`${chatbotHost}/conversations/${senderId}/resume`, { method: 'POST' });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot resume proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

app.patch('/api/v1/admin/chatbot-alerts/:id', async (req, res) => {
    try {
        const chatbotHost = process.env.CHATBOT_URL || 'http://chatbot:8001';
        const response = await fetch(`${chatbotHost}/alerts/${req.params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            return res.status(response.ok ? 404 : response.status).json({ error: data.error || 'Failed to update chatbot alert.' });
        }
        res.json(data);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Chatbot alert update proxy failed:`, err.message);
        res.status(502).json({ error: 'Could not reach Chatbot Service.' });
    }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`\nÃ°Å¸Å’Å  Amalfi Master Hub: Dynamic Pricing Engine Active on Port ${PORT}`);
    });
}

export function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err && err.code !== 'SQLITE_MISUSE') {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

export {
    createBookingHeader,
    createBookingItems,
    recordPayment,
    recomputeHeaderFinance,
    getBookingHeaderWithItems,
    buildTransactionReconciliation,
    updateTransactionBooking,
    updateTransactionBookingItem,
    createHeaderWithItems,
    findOverlappingBookingItems,
    parseInquiryContext,
    analyzeGuestInquiry,
    normalizeReceiptCheck,
    enforceExpectedReceiptAmount,
    buildReceiptUploadError,
    rememberReceiptPrecheck,
    consumeReceiptPrecheck,
    parseChatSenderFromBooking
};


/**
 * âš™ï¸ GLOBAL SETTINGS (Chatbot Toggle, etc.)
 */
app.get('/api/v1/admin/settings', (req, res) => {
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) {
            console.error("Failed to fetch settings:", err);
            return res.status(500).json({ error: "Failed to fetch settings." });
        }
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    });
});

app.patch('/api/v1/admin/settings', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "Setting key is required." });

    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, String(value)], function(err) {
        if (err) {
            console.error(`Failed to update setting ${key}:`, err);
            return res.status(500).json({ error: `Failed to update ${key}.` });
        }
        console.log(`[SETTINGS] ${key} updated to: ${value}`);
        res.json({ success: true, key, value });
    });
});


// Admin API: System Audit Logs
app.get('/api/v1/admin/audit-logs', (req, res) => {
    const query = `
        SELECT * FROM audit_logs 
        ORDER BY timestamp DESC 
        LIMIT 100
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ logs: rows || [] });
    });
});

export default app;

