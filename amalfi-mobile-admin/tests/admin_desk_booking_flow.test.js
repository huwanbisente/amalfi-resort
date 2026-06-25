import { describe, expect, it } from 'vitest';
import {
  buildCreateBookingPayload,
  buildFitWarnings,
  buildInitialPaymentPayload,
  buildQuoteRequest,
  buildRecommendationRequest,
  filterChatbotConversations,
  filterLedgerRows,
  getManualCategories,
  getManualUnits,
  isSaveReady,
  selectBookingUnit,
  summarizeSelection
} from '../src/utils/adminDeskControls.js';

describe('Admin Desk booking setup and picker contracts', () => {
  const form = {
    mode: 'combo',
    checkIn: '2026-05-20',
    checkOut: '2026-05-21',
    guests: '8',
    fullName: 'Demo Guest',
    phone: '+639170000001',
    email: 'guest@example.com',
    bookingSource: 'Messenger',
    paymentMethod: 'GCash',
    notes: 'Near pool if possible'
  };

  it('builds recommendation and quote payloads for the Hub booking desk API', () => {
    expect(buildRecommendationRequest(form)).toEqual({
      check_in: '2026-05-20',
      check_out: '2026-05-21',
      guests: 8,
      mode: 'combo'
    });
    expect(buildQuoteRequest(form, ['AC1', 'AC2'])).toEqual({
      check_in: '2026-05-20',
      check_out: '2026-05-21',
      guests: 8,
      unit_ids: ['AC1', 'AC2']
    });
  });

  it('sorts manual units by capacity and filters by room category', () => {
    const units = [
      { unit_id: 'K1', unit_label: 'Fan Kubo #1', room_type: 'Fan Kubo', absolute_max_pax: 4, standard_max_pax: 2 },
      { unit_id: 'V1', unit_label: 'Pool Villa #1', room_type: 'Pool Villa', absolute_max_pax: 12, standard_max_pax: 8 },
      { unit_id: 'K2', unit_label: 'AC Kubo #2', room_type: 'AC Kubo', absolute_max_pax: 6, standard_max_pax: 4 }
    ];
    expect(getManualCategories(units)).toEqual(['all', 'kubos', 'villas']);
    expect(getManualUnits(units, 'all').map((unit) => unit.unit_id)).toEqual(['V1', 'K2', 'K1']);
    expect(getManualUnits(units, 'kubos').map((unit) => unit.unit_id)).toEqual(['K2', 'K1']);
  });

  it('enforces solo and combo room-picking behavior', () => {
    expect(selectBookingUnit([], 'AC1', { mode: 'solo' })).toEqual(['AC1']);
    expect(selectBookingUnit(['AC1'], 'AC1', { mode: 'solo' })).toEqual([]);
    expect(selectBookingUnit(['AC1'], 'AC2', { mode: 'combo', selectionTargetMet: false })).toEqual(['AC1', 'AC2']);
    expect(selectBookingUnit(['AC1'], 'AC2', { mode: 'combo', selectionTargetMet: true })).toEqual(['AC1']);
    expect(selectBookingUnit(['AC1', 'AC2'], 'AC1', { mode: 'combo', selectionTargetMet: true })).toEqual(['AC2']);
  });

  it('summarizes selected capacity for PAX-safe save readiness', () => {
    const summary = summarizeSelection([
      { unit_id: 'A', absolute_max_pax: 4, standard_max_pax: 2 },
      { unit_id: 'B', absolute_max_pax: 6, standard_max_pax: 4 }
    ], 8);
    expect(summary).toEqual({
      absoluteCapacity: 10,
      standardCapacity: 6,
      targetMet: true,
      remainingAbsoluteCapacity: 0,
      remainingStandardCapacity: 2
    });
    expect(isSaveReady({ canSearch: true, selectedUnitIds: ['A', 'B'], quote: { total_amount: 10000 }, guestCount: 8, selectionCapacity: 10 })).toBe(true);
    expect(isSaveReady({ canSearch: true, selectedUnitIds: ['A'], quote: { total_amount: 10000 }, guestCount: 8, selectionCapacity: 4 })).toBe(false);
  });
});

describe('Admin Desk booking warnings and save payloads', () => {
  it('builds user-facing warnings for incomplete or unsafe saves', () => {
    expect(buildFitWarnings({
      dateRangeValid: false,
      guestCountValid: false,
      canSearch: false,
      fullName: ''
    })).toEqual([
      'Check-out must be later than check-in.',
      'Guest count must be greater than zero.',
      'Guest name is still blank. The booking will save as Walk-in Guest.'
    ]);

    expect(buildFitWarnings({
      dateRangeValid: true,
      guestCountValid: true,
      canSearch: true,
      availableUnitCount: 2,
      selectedUnitCount: 1,
      selectionCapacity: 4,
      guestCount: 6,
      quote: { total_extra_guests: 2 },
      fullName: 'Demo Guest',
      quoteError: 'Quote failed'
    })).toEqual([
      'Selected units cannot hold this pax count within absolute max capacity.',
      '2 guest(s) are using extra-pax capacity on this quote.',
      'Quote failed'
    ]);
  });

  it('builds transaction booking payloads using canonical header and item fields', () => {
    const payload = buildCreateBookingPayload({
      form: {
        mode: 'combo',
        checkIn: '2026-05-20',
        checkOut: '2026-05-21',
        fullName: '',
        phone: '+639170000001',
        email: '',
        bookingSource: 'Walk-in',
        notes: 'Desk note'
      },
      quote: {
        total_amount: 13000,
        quoted_units: [
          { unit_id: 'AC1', room_type: 'AC Kubo', assigned_guests: 4, total_amount: 6500 },
          { unit_id: 'AC2', room_type: 'AC Kubo', assigned_guests: 4, total_amount: 6500 }
        ]
      }
    });

    expect(payload.header).toMatchObject({
      guest_name: 'Walk-in Guest',
      lodging_total: 13000,
      status: 'RESERVED',
      booking_mode: 'TRANSACTION_GROUP',
      created_by: 'admin'
    });
    expect(payload.items).toEqual([
      { unit_id: 'AC1', room_type: 'AC Kubo', check_in: '2026-05-20', check_out: '2026-05-21', guest_count: 4, lodging_subtotal: 6500, status: 'RESERVED' },
      { unit_id: 'AC2', room_type: 'AC Kubo', check_in: '2026-05-20', check_out: '2026-05-21', guest_count: 4, lodging_subtotal: 6500, status: 'RESERVED' }
    ]);
  });

  it('builds verified initial payment payloads without automatic settlement shortcuts', () => {
    expect(buildInitialPaymentPayload({ amount: 3000, quote: { total_amount: 10000 }, paymentMethod: 'Cash' })).toEqual({
      amount: 3000,
      payment_type: 'deposit',
      payment_method: 'Cash',
      verification_status: 'VERIFIED',
      notes: 'Recorded via Amalfi Admin Desk',
      admin_id: 'AmalfiDesk'
    });
    expect(buildInitialPaymentPayload({ amount: 10000, quote: { total_amount: 10000 }, paymentMethod: 'GCash' }).payment_type).toBe('Full Payment');
  });
});

describe('Admin Desk list filtering contracts', () => {
  const ledger = [
    { booking_ref: 'RES-3', full_name: 'Closed Guest', status: 'CHECKED_OUT', check_in: '2026-05-01', created_at: '2026-05-01' },
    { booking_ref: 'RES-2', guest_name: 'Pending Guest', status: 'PENDING_VERIFICATION', check_in: '2026-05-03', created_at: '2026-05-03' },
    { booking_ref: 'RES-1', full_name: 'Active Guest', status: 'RESERVED', unit_label: 'AC Kubo #1', check_in: '2026-05-04', created_at: '2026-05-04' }
  ];

  it('filters ledger cards by lane and query', () => {
    expect(filterLedgerRows(ledger, { statusFilter: 'active' }).map((row) => row.booking_ref)).toEqual(['RES-1']);
    expect(filterLedgerRows(ledger, { statusFilter: 'pending' }).map((row) => row.booking_ref)).toEqual(['RES-2']);
    expect(filterLedgerRows(ledger, { statusFilter: 'closed' }).map((row) => row.booking_ref)).toEqual(['RES-3']);
    expect(filterLedgerRows(ledger, { statusFilter: 'all', query: 'kubo' }).map((row) => row.booking_ref)).toEqual(['RES-1']);
  });

  it('filters chatbot conversations into operator, bot, and exact category lanes', () => {
    const conversations = [
      { sender_id: 'lead', category: 'HOT_BOOKING_LEAD' },
      { sender_id: 'faq', category: 'LOW_PRIORITY_FAQ' },
      { sender_id: 'noise', category: 'SPAM_OR_NONSENSE' },
      { sender_id: 'manual', category: 'LOW_PRIORITY_FAQ', manual_active: true },
      { sender_id: 'pay', category: 'PAYMENT_SENT' }
    ];
    expect(filterChatbotConversations(conversations, 'operator').map((item) => item.sender_id)).toEqual(['lead', 'manual', 'pay']);
    expect(filterChatbotConversations(conversations, 'bot').map((item) => item.sender_id)).toEqual(['faq', 'noise', 'manual']);
    expect(filterChatbotConversations(conversations, 'PAYMENT_SENT').map((item) => item.sender_id)).toEqual(['pay']);
  });
});
