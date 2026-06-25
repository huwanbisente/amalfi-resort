import { describe, it, expect } from 'vitest';
import { buildReceiptRetryMessage } from '../src/utils/guestPortalHelpers.js';

describe('Guest Portal Helpers', () => {
    it('shows receipt guidance directly for AI receipt rejection messages', () => {
        const message = 'Please upload a clear payment receipt screenshot showing the paid amount and transaction/reference number.';

        expect(buildReceiptRetryMessage('OVL-TEST', message)).toBe(message);
    });

    it('keeps saved booking reference copy for technical upload failures', () => {
        const message = buildReceiptRetryMessage('OVL-TEST', 'Cloudinary upload failed.');

        expect(message).toContain('Your booking reference OVL-TEST is already saved');
        expect(message).toContain('retry the receipt upload');
    });
});
