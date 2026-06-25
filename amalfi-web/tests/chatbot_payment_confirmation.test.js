import { describe, expect, it } from 'vitest';

describe('chatbot payment confirmation helpers', () => {
  it('extracts Messenger sender ids from Chatbot Monitor booking notes', async () => {
    const { parseChatSenderFromBooking } = await import('../../amalfi-hub/server.js');

    expect(parseChatSenderFromBooking({
      notes: 'Manual booking from Chatbot Monitor. Sender: 1234567890. Inquiry: booking details',
    })).toBe('1234567890');

    expect(parseChatSenderFromBooking({
      special_requests: 'guest context | chat_sender=PSID%2DABC',
    })).toBe('PSID-ABC');

    expect(parseChatSenderFromBooking({
      booking_notes: 'sender_id: guest-42',
    })).toBe('guest-42');
  });

  it('returns an empty sender when no chatbot marker exists', async () => {
    const { parseChatSenderFromBooking } = await import('../../amalfi-hub/server.js');

    expect(parseChatSenderFromBooking({
      notes: 'Walk-in booking without chat monitor context',
      booking_source: 'Walk-in',
    })).toBe('');
  });
});
