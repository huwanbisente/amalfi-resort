import { describe, expect, it } from 'vitest';
import {
  ADMIN_DESK_SECTION_ITEMS,
  CHATBOT_CATEGORY_OPTIONS,
  addDays,
  bookingBalance,
  bookingCoversDate,
  bookingPaid,
  bookingRef,
  bookingTotal,
  buildAdminDeskRequest,
  buildDateWindow,
  buildNightCount,
  compactBookingLabel,
  deriveAdminDeskOps,
  formatCurrency,
  getCategoryLabel,
  getChatbotCategoryLabel,
  getUnitCategory,
  guestName,
  normalizePhoneInput,
  receiptUrl
} from '../src/utils/adminDeskControls.js';

describe('Admin Desk mobile selector contract', () => {
  it('keeps the operator selector order stable', () => {
    expect(ADMIN_DESK_SECTION_ITEMS.map((item) => item.label)).toEqual([
      'Today',
      'Guests',
      'Bookings',
      'Money',
      'Tools'
    ]);
  });

  it('exposes the same high-level chatbot categories as the monitor mirror', () => {
    expect(CHATBOT_CATEGORY_OPTIONS.map((item) => item.value)).toEqual([
      'HOT_BOOKING_LEAD',
      'CONFIRMED_BOOKING',
      'PAYMENT_SENT',
      'COMPLAINT',
      'REBOOKING_OR_CANCELLATION',
      'NEEDS_HUMAN',
      'MANUAL_ACTIVE',
      'LOW_PRIORITY_FAQ',
      'SPAM_OR_NONSENSE'
    ]);
    expect(getChatbotCategoryLabel('PAYMENT_SENT')).toBe('Action: Payment');
    expect(getChatbotCategoryLabel('LOW_PRIORITY_FAQ')).toBe('Bot: FAQ');
  });
});

describe('Admin Desk booking and finance helpers', () => {
  it('normalizes booking identity across legacy and transaction records', () => {
    expect(bookingRef({ booking_reference: 'RES-123' })).toBe('RES-123');
    expect(guestName({ guest_name: 'Maya Guest' })).toBe('Maya Guest');
    expect(receiptUrl({ receipt_url: 'https://receipt.example/a.png' })).toBe('https://receipt.example/a.png');
    expect(compactBookingLabel({ booking_ref: 'RES-0501-AC04' })).toBe('0501-AC');
    expect(compactBookingLabel({ full_name: 'Avie Diego Santiago' })).toBe('ADS');
  });

  it('calculates totals, paid amount, and safe balance from canonical fields', () => {
    const booking = {
      total_price: 12000,
      addon_amount: 1500,
      amount_paid: 5000
    };
    expect(bookingTotal(booking)).toBe(13500);
    expect(bookingPaid(booking)).toBe(5000);
    expect(bookingBalance(booking)).toBe(8500);
    expect(bookingBalance({ lodging_total: 3000, verified_paid_total: 5000 })).toBe(0);
    expect(bookingBalance({ balance_due: -100 })).toBe(0);
  });

  it('uses grand totals as already-complete transaction totals', () => {
    expect(bookingTotal({ grand_total: 9000, addon_amount: 700 })).toBe(9000);
    expect(bookingPaid({ total_paid: 2500 })).toBe(2500);
  });

  it('formats mobile-friendly currency and phone values', () => {
    expect(formatCurrency(1069525)).toBe('P1,069,525');
    expect(normalizePhoneInput('0917 000 0001')).toBe('+639170000001');
    expect(normalizePhoneInput('+63 917 000 0001')).toBe('+639170000001');
  });
});

describe('Admin Desk date, unit, and movement logic', () => {
  it('keeps back-to-back booking date behavior intact', () => {
    expect(buildNightCount('2026-05-06', '2026-05-07')).toBe(1);
    expect(buildNightCount('2026-05-06', '2026-05-06')).toBe(1);
    expect(addDays('2026-05-06', 2)).toBe('2026-05-08');
    expect(bookingCoversDate({ check_in: '2026-05-06', check_out: '2026-05-07' }, '2026-05-06')).toBe(true);
    expect(bookingCoversDate({ check_in: '2026-05-06', check_out: '2026-05-07' }, '2026-05-07')).toBe(false);
  });

  it('builds a seven-day unit checker window', () => {
    const window = buildDateWindow('2026-05-06', 3);
    expect(window.map((day) => day.iso)).toEqual(['2026-05-06', '2026-05-07', '2026-05-08']);
    expect(window[0]).toMatchObject({ short: '5/6' });
  });

  it('categorizes units by room family', () => {
    expect(getUnitCategory({ room_type: 'Beach Villa' })).toBe('villas');
    expect(getUnitCategory({ unit_label: 'AC Kubo #1' })).toBe('kubos');
    expect(getUnitCategory({ marketing_name: 'Teepee Hut' })).toBe('teepee');
    expect(getCategoryLabel('kubos')).toBe('Kubos');
  });

  it('derives movement lanes and pulse totals from synced Hub data', () => {
    const derived = deriveAdminDeskOps({
      ledger: [
        { booking_ref: 'ARR-1', status: 'RESERVED', check_in: '2026-05-06', check_out: '2026-05-07', total_price: 4000, amount_paid: 1000 },
        { booking_ref: 'IN-1', status: 'CHECKED_IN', check_in: '2026-05-05', check_out: '2026-05-07', grand_total: 7000, verified_paid_total: 7000 },
        { booking_ref: 'OLD-1', status: 'CHECKED_OUT', check_in: '2026-05-01', check_out: '2026-05-02', total_price: 2000, amount_paid: 2000 }
      ],
      receivables: [
        { booking_ref: 'ARR-1', balance_due: 3000 },
        { booking_ref: 'OTHER', total_price: 5000, amount_paid: 1000 }
      ],
      units: [
        { unit_id: 'A', unit_status: 'Available' },
        { unit_id: 'B', unit_status: 'Available', active_booking: { booking_ref: 'IN-1' } },
        { unit_id: 'C', unit_status: 'Requires Cleaning' },
        { unit_id: 'D', unit_status: 'Maintenance' }
      ]
    }, '2026-05-06');

    expect(derived.arrivals.map(bookingRef)).toEqual(['ARR-1']);
    expect(derived.inHouse.map(bookingRef)).toEqual(['ARR-1', 'IN-1']);
    expect(derived.dueOut).toEqual([]);
    expect(derived.grossBilled).toBe(13000);
    expect(derived.netPaid).toBe(10000);
    expect(derived.totalDue).toBe(7000);
    expect(derived.readyRooms).toBe(1);
    expect(derived.cleaningRooms).toBe(1);
    expect(derived.blockedRooms).toBe(1);
  });
});

describe('Admin Desk Hub API control requests', () => {
  it('builds check-in, checkout, and verification requests', () => {
    expect(buildAdminDeskRequest('checkIn', { row: { booking_ref: 'RES-1' } })).toEqual({
      method: 'post',
      url: '/api/v1/admin/bookings/RES-1/change-set',
      body: { workflow: 'checkin', admin_id: 'AmalfiDesk' }
    });
    expect(buildAdminDeskRequest('checkout', { row: { booking_ref: 'RES-1' } })).toEqual({
      method: 'post',
      url: '/api/v1/admin/bookings/RES-1/change-set',
      body: { workflow: 'checkout', admin_id: 'AmalfiDesk' }
    });
    expect(buildAdminDeskRequest('verify', { row: { booking_ref: 'RES-1' }, decision: 'approve' })).toEqual({
      method: 'post',
      url: '/api/v1/admin/verify',
      body: {
        booking_ref: 'RES-1',
        decision: 'approve',
        notes: 'Reviewed via Amalfi Admin Desk',
        admin_id: 'AmalfiDesk'
      }
    });
  });

  it('builds room status and chatbot category requests', () => {
    expect(buildAdminDeskRequest('unitStatus', { unitId: 'AC-01', status: 'Maintenance' })).toEqual({
      method: 'patch',
      url: '/api/v1/admin/units/AC-01/status',
      body: { status: 'Maintenance', admin_id: 'AmalfiDesk' }
    });
    expect(buildAdminDeskRequest('chatbotCategory', { senderId: 'guest/123', category: 'PAYMENT_SENT' })).toEqual({
      method: 'patch',
      url: '/api/v1/admin/chatbot-conversations/guest%2F123/category',
      body: { category: 'PAYMENT_SENT' }
    });
  });

  it('routes ledger edits through the canonical booking change-set', () => {
    const draft = {
      guest_name: 'Updated Guest',
      phone: '+639170000001',
      email: 'guest@example.com',
      status: 'RESERVED',
      booking_source: 'Walk-in',
      notes: 'Desk edit'
    };
    expect(buildAdminDeskRequest('saveLedgerEdit', { row: { booking_ref: 'TX-1', record_origin: 'transaction_header' }, draft })).toMatchObject({
      method: 'post',
      url: '/api/v1/admin/bookings/TX-1/change-set',
      body: {
        workflow: 'edit',
        booking: { guest_name: 'Updated Guest', full_name: 'Updated Guest' }
      }
    });
    expect(buildAdminDeskRequest('saveLedgerEdit', { row: { booking_ref: 'RES-1' }, draft })).toMatchObject({
      method: 'post',
      url: '/api/v1/admin/bookings/RES-1/change-set',
      body: {
        workflow: 'edit',
        booking: { guest_name: 'Updated Guest', full_name: 'Updated Guest' }
      }
    });
  });

  it('routes payment recording through the canonical booking change-set', () => {
    expect(buildAdminDeskRequest('recordPayment', {
      row: { booking_ref: 'TX-1', record_origin: 'transaction_header', balance_due: 5000 },
      amount: 5000,
      method: 'GCash'
    })).toEqual({
      method: 'post',
      url: '/api/v1/admin/bookings/TX-1/change-set',
      body: {
        workflow: 'edit',
        payment: {
          amount: 5000,
          payment_type: 'Full Settlement',
          transaction_type: 'Full Settlement',
          payment_method: 'GCash',
          verification_status: 'VERIFIED',
          notes: 'Recorded via Amalfi Admin Desk'
        },
        admin_id: 'AmalfiDesk'
      }
    });
    expect(buildAdminDeskRequest('recordPayment', {
      row: { booking_ref: 'RES-1', total_price: 6000, amount_paid: 1000 },
      amount: 2000,
      method: 'Cash'
    })).toEqual({
      method: 'post',
      url: '/api/v1/admin/bookings/RES-1/change-set',
      body: {
        workflow: 'edit',
        payment: {
          amount: 2000,
          payment_type: 'payment',
          transaction_type: 'payment',
          payment_method: 'Cash',
          verification_status: 'VERIFIED',
          notes: 'Recorded via Amalfi Admin Desk'
        },
        admin_id: 'AmalfiDesk'
      }
    });
  });
});
