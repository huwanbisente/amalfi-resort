import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.resolve(`tests/inquiry_parser_${Date.now()}.sqlite`);
process.env.HUB_ADMIN_TOKEN = 'inquiry-parser-test-token';

let parseInquiryContext;
let normalizeReceiptCheck;
let enforceExpectedReceiptAmount;
let buildReceiptUploadError;
let rememberReceiptPrecheck;
let consumeReceiptPrecheck;
let closeDatabase;

describe('Hub Inquiry Parser', () => {
    beforeAll(async () => {
        const serverModule = await import('../../amalfi-hub/server.js');
        parseInquiryContext = serverModule.parseInquiryContext;
        normalizeReceiptCheck = serverModule.normalizeReceiptCheck;
        enforceExpectedReceiptAmount = serverModule.enforceExpectedReceiptAmount;
        buildReceiptUploadError = serverModule.buildReceiptUploadError;
        rememberReceiptPrecheck = serverModule.rememberReceiptPrecheck;
        consumeReceiptPrecheck = serverModule.consumeReceiptPrecheck;
        closeDatabase = serverModule.closeDatabase;
    });

    afterAll(async () => {
        if (closeDatabase) await closeDatabase();
    });

    it('uses the latest explicit pax count when old date ranges are in the transcript', () => {
        const kb = { accommodations: [{ name: "Owner's Villa" }] };
        const year = new Date().getFullYear();
        const transcript = [
            "Guest: owner's villa may 20-21",
            "Guest: ok may 11-12",
            "Guest: owner's villa may 11-12. 25pax."
        ].join('\n');

        const context = parseInquiryContext(transcript, kb);

        expect(context.check_in).toBe(`${year}-05-11`);
        expect(context.check_out).toBe(`${year}-05-12`);
        expect(context.guests).toBe(25);
        expect(context.room_type).toBe("Owner's Villa");
    });

    it('passes only payment receipts with amount and reference details', () => {
        const paymentReceipt = normalizeReceiptCheck({
            classification: 'payment_receipt',
            payment_method: 'gcash',
            has_amount: true,
            amount: 8400,
            has_reference: true,
            reference_number: 'GCASH-123',
            confidence: 0.91
        });
        const acknowledgement = normalizeReceiptCheck({
            classification: 'booking_acknowledgement',
            has_amount: true,
            has_reference: false,
            confidence: 0.95
        });

        expect(paymentReceipt.verified).toBe(true);
        expect(paymentReceipt.rejected).toBe(false);
        expect(acknowledgement.verified).toBe(false);
        expect(acknowledgement.rejected).toBe(true);
        expect(buildReceiptUploadError(acknowledgement)).toContain('booking acknowledgement');
    });

    it('rejects valid-looking receipts when the amount does not match expected payment', () => {
        const wrongAmountReceipt = normalizeReceiptCheck({
            classification: 'payment_receipt',
            payment_method: 'gcash',
            has_amount: true,
            amount: 839.30,
            has_reference: true,
            reference_number: '116969981',
            confidence: 0.92
        });
        const enforced = enforceExpectedReceiptAmount(wrongAmountReceipt, 32000);

        expect(enforced.verified).toBe(false);
        expect(enforced.rejected).toBe(true);
        expect(enforced.amount_mismatch).toBe(true);
        expect(buildReceiptUploadError(enforced)).toContain('does not match expected payment');
    });

    it('uses one-time receipt precheck tokens before booking creation', () => {
        const token = rememberReceiptPrecheck({
            cloudUrl: 'https://example.com/receipt.jpg',
            receiptCheck: normalizeReceiptCheck({
                classification: 'payment_receipt',
                has_amount: true,
                has_reference: true,
                confidence: 0.9
            }),
            amount: 5000,
            transactionType: 'deposit',
            paymentMethod: 'GCash'
        });

        const firstUse = consumeReceiptPrecheck(token);
        const secondUse = consumeReceiptPrecheck(token);

        expect(firstUse.cloudUrl).toBe('https://example.com/receipt.jpg');
        expect(firstUse.receiptCheck.verified).toBe(true);
        expect(secondUse).toBe(null);
    });
});
