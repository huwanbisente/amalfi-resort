import { describe, it, expect } from 'vitest';
import {
    getHealth,
    fmtSource,
    isUrgentConversation,
    isPaymentConversation,
    isPriorityConversation,
    buildGuestInquiryText,
    getSelectedUnitLabelText,
    buildChatMonitorBookingPayload,
    buildPaymentConfirmationMessage,
    getPaymentConfirmationForSender,
    getLatestGuestMessage,
    buildMonitorReplyInput,
    extractBookingReferencesFromMessages,
    extractReceiptImageCandidates,
    buildReceiptReviewSummary,
    signalModesForWorkflow,
    matchesSignalMode,
    matchesWorkflowMode,
} from '../src/components/ChatMonitorWorkspace.jsx';

describe('Chat Monitor Workspace Logic', () => {
    it('classifies urgent conversations from alerts, urgency counters, or handoff intents', () => {
        const alerts = [{ sender_id: 'guest-1', status: 'new', urgency: 'high' }];

        expect(isUrgentConversation({ sender_id: 'guest-1', urgent_count: 0, last_intent: 'menu' }, alerts)).toBe(true);
        expect(isUrgentConversation({ sender_id: 'guest-2', urgent_count: 2, last_intent: 'menu' }, alerts)).toBe(true);
        expect(isUrgentConversation({ sender_id: 'guest-3', urgent_count: 0, last_intent: 'human_handoff' }, alerts)).toBe(true);
        expect(isUrgentConversation({ sender_id: 'guest-4', urgent_count: 0, last_intent: 'rooms_and_rates' }, alerts)).toBe(false);
    });

    it('classifies payment conversations from payment intents or escalation reasons', () => {
        const alerts = [{ sender_id: 'guest-10', escalation_reason: 'payment_inquiry', status: 'new' }];

        expect(isPaymentConversation({ sender_id: 'guest-9', last_intent: 'payment_inquiry' }, alerts)).toBe(true);
        expect(isPaymentConversation({ sender_id: 'guest-10', last_intent: 'menu' }, alerts)).toBe(true);
        expect(isPaymentConversation({ sender_id: 'guest-11', last_intent: 'human_handoff' }, alerts)).toBe(false);
    });

    it('groups conversations into priority and non-priority workflow buckets', () => {
        const alerts = [{ sender_id: 'guest-alert', status: 'new', urgency: 'high' }];

        expect(isPriorityConversation({ sender_id: 'guest-1', category: 'HOT_BOOKING_LEAD' }, [])).toBe(true);
        expect(isPriorityConversation({ sender_id: 'guest-2', category: 'PAYMENT_SENT' }, [])).toBe(true);
        expect(isPriorityConversation({ sender_id: 'guest-3', category: 'NEEDS_HUMAN' }, [])).toBe(true);
        expect(isPriorityConversation({ sender_id: 'guest-alert', category: 'LOW_PRIORITY_FAQ' }, alerts)).toBe(true);
        expect(isPriorityConversation({ sender_id: 'guest-4', category: 'LOW_PRIORITY_FAQ' }, [])).toBe(false);
        expect(isPriorityConversation({ sender_id: 'guest-5', category: 'SPAM_OR_NONSENSE' }, [])).toBe(false);
        expect(isPriorityConversation({ sender_id: 'guest-6', category: 'CONFIRMED_BOOKING' }, [])).toBe(false);
    });

    it('formats chat source labels cleanly', () => {
        expect(fmtSource('web')).toBe('Web Chat');
        expect(fmtSource('messenger')).toBe('Messenger');
        expect(fmtSource('anything-else')).toBe('Messenger');
    });

    it('reports inbox health based on queue pressure', () => {
        const calm = getHealth([{ urgent_count: 0 }], []);
        const monitor = getHealth([{ urgent_count: 4 }, { urgent_count: 3 }], [{ urgency: 'medium' }]);
        const urgent = getHealth(
            Array.from({ length: 10 }, () => ({ urgent_count: 2 })),
            [{ urgency: 'high' }, { urgency: 'high' }]
        );

        expect(calm.label).toBe('Calm');
        expect(monitor.label).toBe('Monitor');
        expect(urgent.label).toBe('Urgent');
    });

    it('builds inquiry text from recent inbound guest messages only', () => {
        const messages = [
            { direction: 'inbound', text: 'May available po May 10?' },
            { direction: 'outbound', text: 'What pax po?' },
            { direction: 'inbound', text: '10 pax overnight' },
        ];

        expect(buildGuestInquiryText(messages, 'fallback')).toBe('Guest: May available po May 10?\nGuest: 10 pax overnight');
        expect(buildGuestInquiryText([], 'rates po')).toBe('Guest: rates po');
    });

    it('builds a compact response-helper input from the latest guest message', () => {
        const messages = [
            { direction: 'inbound', text: 'May available po May 10?' },
            { direction: 'outbound', text: 'What pax po?' },
            { direction: 'inbound', text: '8 pax po, AC kubo sana' },
        ];

        expect(getLatestGuestMessage(messages)).toBe('8 pax po, AC kubo sana');
        expect(buildMonitorReplyInput(messages)).toContain('Latest guest message: 8 pax po, AC kubo sana');
        expect(buildMonitorReplyInput(messages)).toContain('Guest: May available po May 10?');
    });

    it('formats selected booking units for review copy', () => {
        expect(getSelectedUnitLabelText({
            units: [
                { unit_id: 'OVL-01', unit_label: "Owner's Villa" },
                { unit_id: 'PVL-02' },
            ]
        })).toBe("Owner's Villa, PVL-02");
    });

    it('builds a reviewed Chatbot Monitor quick-booking payload', () => {
        const payload = buildChatMonitorBookingPayload({
            bookingForm: {
                guest_name: 'Test Guest',
                phone: '123',
                email: 'guest@test.local',
                status: 'RESERVED',
                booking_source: 'Chatbot Monitor',
                notes: ''
            },
            bookingAnalysis: {
                context: {
                    check_in: '2026-05-10',
                    check_out: '2026-05-11',
                    raw_message: 'Guest wants Owner Villa for 10 pax'
                }
            },
            topBookingSuggestion: {
                units: [
                    { unit_id: 'OVL-01', room_type: "Owner's Villa", assigned_guests: 10 }
                ]
            },
            roomTotal: 28000,
            addonAmount: 1000,
            selectedId: 'guest-123',
            transcriptNote: 'Guest wants Owner Villa'
        });

        expect(payload.header.guest_name).toBe('Test Guest');
        expect(payload.header.lodging_total).toBe(29000);
        expect(payload.header.booking_source).toBe('Chatbot Monitor');
        expect(payload.items).toEqual([
            expect.objectContaining({
                unit_id: 'OVL-01',
                room_type: "Owner's Villa",
                guest_count: 10,
                lodging_subtotal: 28000,
                status: 'RESERVED'
            })
        ]);
    });

    it('builds a clear payment confirmation message from a verified booking candidate', () => {
        const message = buildPaymentConfirmationMessage({
            booking_ref: 'RES-1234',
            guest_name: 'Maria Guest',
            check_in: '2026-05-10',
            check_out: '2026-05-11',
            unit_summary: "Owner's Villa",
            latest_payment_amount: 5000,
            amount_paid: 14000,
            balance: 0,
        });

        expect(message).toContain('verified your payment');
        expect(message).toContain('RES-1234');
        expect(message).toContain('Maria Guest');
        expect(message).toContain('Stay dates: 2026-05-10 to 2026-05-11');
        expect(message).toContain("Unit: Owner's Villa");
        expect(message).toContain('Balance: Fully paid');
    });

    it('finds the payment confirmation candidate for the selected Messenger sender', () => {
        const candidates = [
            { sender_id: 'guest-a', booking_ref: 'RES-A' },
            { sender_id: 'guest-b', booking_ref: 'RES-B' },
        ];

        expect(getPaymentConfirmationForSender(candidates, 'guest-b')).toEqual({ sender_id: 'guest-b', booking_ref: 'RES-B' });
        expect(getPaymentConfirmationForSender(candidates, 'missing')).toBe(null);
    });

    it('extracts receipt image candidates and booking refs from chat monitor messages', () => {
        const messages = [
            { direction: 'inbound', text: 'Here is my booking acknowledgement RES-1234 https://example.com/ack.png', intent: 'booking_acknowledgement_image', timestamp: 'now' },
            { direction: 'inbound', text: '[Payment Receipt Image] https://example.com/gcash.jpg', intent: 'payment_receipt', timestamp: 'later' },
        ];

        expect(extractBookingReferencesFromMessages(messages)).toEqual(['RES-1234']);
        const candidates = extractReceiptImageCandidates(messages);
        expect(candidates).toHaveLength(2);
        expect(candidates[0]).toEqual(expect.objectContaining({ kind: 'acknowledgement', url: 'https://example.com/ack.png' }));
        expect(candidates[1]).toEqual(expect.objectContaining({ kind: 'transfer', url: 'https://example.com/gcash.jpg' }));
    });

    it('summarizes receipt review without implying automatic payment verification', () => {
        const transfer = buildReceiptReviewSummary({
            classification: 'payment_receipt',
            confidence: 0.91,
            has_amount: true,
            amount: 5000,
            has_reference: true,
            reference_number: 'GC123',
        }, ['RES-1234']);
        const acknowledgement = buildReceiptReviewSummary({
            classification: 'booking_acknowledgement',
            confidence: 0.95,
            has_amount: false,
            has_reference: true,
        }, ['RES-1234']);

        expect(transfer.status).toBe('Likely transfer receipt');
        expect(transfer.action).toContain('admin payment verification');
        expect(transfer.draft).toContain('manual verification');
        expect(acknowledgement.status).toBe('Booking acknowledgement only');
        expect(acknowledgement.action).toContain('actual GCash');
    });

    it('uses queue-specific signal filters for operator and bot-handled modes', () => {
        expect(signalModesForWorkflow('priority').map((mode) => mode.id)).toContain('complaints');
        expect(signalModesForWorkflow('priority').map((mode) => mode.id)).not.toContain('spam');
        expect(signalModesForWorkflow('non_priority').map((mode) => mode.id)).toContain('spam');
        expect(signalModesForWorkflow('non_priority').map((mode) => mode.id)).not.toContain('payment');
    });

    it('matches chatbot signals by queue vocabulary', () => {
        const confirmationSenders = new Set(['guest-confirm']);
        const lead = { sender_id: 'guest-lead', category: 'HOT_BOOKING_LEAD', last_preview: '8 pax AC Kubo May 20' };
        const preBooking = { sender_id: 'guest-pre', category: 'LOW_PRIORITY_FAQ', last_preview: 'available po ba for 4 pax overnight' };
        const location = { sender_id: 'guest-map', category: 'LOW_PRIORITY_FAQ', last_preview: 'where is your location from Subic' };
        const spam = { sender_id: 'guest-spam', category: 'SPAM_OR_NONSENSE', last_preview: 'asdf' };

        expect(matchesSignalMode(lead, [], confirmationSenders, 'hot')).toBe(true);
        expect(matchesSignalMode(preBooking, [], confirmationSenders, 'pre_booking')).toBe(true);
        expect(matchesWorkflowMode(preBooking, [], 'priority', 'pre_booking')).toBe(true);
        expect(matchesSignalMode(location, [], confirmationSenders, 'location')).toBe(true);
        expect(matchesSignalMode(spam, [], confirmationSenders, 'spam')).toBe(true);
    });
});
