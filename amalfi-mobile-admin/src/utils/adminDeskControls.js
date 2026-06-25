export const ADMIN_DESK_SECTION_ITEMS = [
  { id: 'dashboard', label: 'Today' },
  { id: 'guests', label: 'Guests' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'money', label: 'Money' },
  { id: 'tools', label: 'Tools' }
];

export const CHATBOT_CATEGORY_OPTIONS = [
  { value: 'HOT_BOOKING_LEAD', label: 'Action: Booking Lead' },
  { value: 'CONFIRMED_BOOKING', label: 'Info: Already Booked' },
  { value: 'PAYMENT_SENT', label: 'Action: Payment' },
  { value: 'COMPLAINT', label: 'Action: Complaint' },
  { value: 'REBOOKING_OR_CANCELLATION', label: 'Action: Rebook/Cancel' },
  { value: 'NEEDS_HUMAN', label: 'Action: Needs Human' },
  { value: 'MANUAL_ACTIVE', label: 'Human Active' },
  { value: 'LOW_PRIORITY_FAQ', label: 'Bot: FAQ' },
  { value: 'SPAM_OR_NONSENSE', label: 'Bot: Noise' }
];

const CHATBOT_CATEGORY_LABELS = CHATBOT_CATEGORY_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export function formatCurrency(value) {
  return `P${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value || 0))}`;
}

export function buildNightCount(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(1, diff || 1);
}

export function bookingRef(row = {}) {
  return row.booking_ref || row.booking_reference || '';
}

export function guestName(row = {}) {
  return row.full_name || row.guest_name || row.customer_name || 'Walk-in Guest';
}

export function bookingUnits(row = {}) {
  return row.unit_summary || row.unit_label || row.unit_id || row.room_type || 'No unit summary';
}

export function bookingTotal(row = {}) {
  const base = Number(row.grand_total ?? row.lodging_total ?? row.total_price ?? 0);
  const addon = row.addon_amount && row.grand_total === undefined ? Number(row.addon_amount) : 0;
  return base + addon;
}

export function bookingPaid(row = {}) {
  return Number(row.amount_paid ?? row.verified_paid_total ?? row.total_paid ?? 0);
}

export function bookingBalance(row = {}) {
  const explicit = row.balance_due ?? row.balance;
  if (explicit !== undefined && explicit !== null) return Math.max(0, Number(explicit || 0));
  return Math.max(0, bookingTotal(row) - bookingPaid(row));
}

export function receiptUrl(row = {}) {
  return row.receipt_path || row.receipt_url || row.payment_proof_url || row.proof_url || '';
}

export function compactBookingLabel(booking = {}) {
  const ref = String(booking.booking_ref || booking.booking_reference || '').replace(/^RES-/i, '');
  if (ref) return ref.slice(0, 7);
  const name = String(booking.full_name || booking.guest_name || '').trim();
  if (!name) return 'Hold';
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 4).toUpperCase();
}

export function isActiveBooking(row = {}) {
  return ['RESERVED', 'CHECKED_IN'].includes(row.status);
}

export function isTodayArrival(row = {}, todayKey) {
  return isActiveBooking(row) && row.status !== 'CHECKED_IN' && row.check_in === todayKey;
}

export function isInHouse(row = {}, todayKey) {
  return row.status === 'CHECKED_IN' || (row.check_in <= todayKey && row.check_out > todayKey && isActiveBooking(row));
}

export function isDueOut(row = {}, todayKey) {
  return row.status === 'CHECKED_IN' && row.check_out <= todayKey;
}

export function getRoomStatusMeta(status = 'Available') {
  const normalized = String(status || 'Available').toLowerCase();
  if (normalized.includes('maintenance')) return { label: 'Blocked', tone: 'red' };
  if (normalized.includes('clean') || normalized.includes('dirty')) return { label: 'Clean', tone: 'blue' };
  if (normalized.includes('inspection')) return { label: 'Inspect', tone: 'gold' };
  if (normalized.includes('checked') || normalized.includes('reserved')) return { label: 'Occupied', tone: 'gold' };
  return { label: 'Ready', tone: 'green' };
}

export function normalizePhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const withoutCountry = digits.startsWith('63')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return `+63${withoutCountry.slice(0, 10)}`;
}

export function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildDateWindow(startDate, length = 7) {
  return Array.from({ length }, (_, index) => {
    const iso = addDays(startDate, index);
    const date = new Date(`${iso}T00:00:00`);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    return {
      iso,
      short: `${date.getMonth() + 1}/${date.getDate()}`,
      label: `${weekday} ${date.getMonth() + 1}/${date.getDate()}`,
      weekend: weekday === 'Sat' || weekday === 'Sun'
    };
  });
}

export function bookingCoversDate(booking, dateIso) {
  if (!booking?.check_in || !booking?.check_out) return false;
  return booking.check_in <= dateIso && booking.check_out > dateIso;
}

export function getUnitCategory(unit) {
  const label = String(`${unit?.room_type || ''} ${unit?.marketing_name || ''} ${unit?.unit_label || ''}`).toLowerCase();
  if (label.includes('villa')) return 'villas';
  if (label.includes('kubo')) return 'kubos';
  if (label.includes('teepee')) return 'teepee';
  return 'other';
}

export function getCategoryLabel(category) {
  const labels = {
    all: 'All',
    kubos: 'Kubos',
    villas: 'Villas',
    teepee: 'Teepee',
    mixed: 'Mixed',
    other: 'Other'
  };
  return labels[category] || category;
}

export function getChatbotCategoryLabel(category) {
  const key = String(category || 'LOW_PRIORITY_FAQ').toUpperCase();
  return CHATBOT_CATEGORY_LABELS[key] || key.replace(/_/g, ' ');
}

export function deriveAdminDeskOps(opsData = {}, todayKey) {
  const ledger = opsData.ledger || [];
  const units = opsData.units || [];
  return {
    ...opsData,
    arrivals: ledger.filter((row) => isTodayArrival(row, todayKey)),
    inHouse: ledger.filter((row) => isInHouse(row, todayKey)),
    dueOut: ledger.filter((row) => isDueOut(row, todayKey)),
    totalDue: (opsData.receivables || []).reduce((sum, row) => sum + bookingBalance(row), 0),
    grossBilled: ledger.reduce((sum, row) => sum + bookingTotal(row), 0),
    netPaid: ledger.reduce((sum, row) => sum + bookingPaid(row), 0),
    readyRooms: units.filter((unit) => String(unit.unit_status || 'Available') === 'Available' && !unit.active_booking).length,
    cleaningRooms: units.filter((unit) => /clean|dirty|inspection/i.test(String(unit.unit_status || ''))).length,
    blockedRooms: units.filter((unit) => /maintenance/i.test(String(unit.unit_status || ''))).length
  };
}

export function buildRecommendationRequest(form = {}) {
  return {
    check_in: form.checkIn,
    check_out: form.checkOut,
    guests: Number(form.guests),
    mode: form.mode
  };
}

export function buildQuoteRequest(form = {}, selectedUnitIds = []) {
  return {
    check_in: form.checkIn,
    check_out: form.checkOut,
    guests: Number(form.guests),
    unit_ids: selectedUnitIds
  };
}

export function getManualCategories(availableUnits = []) {
  const categories = Array.from(new Set(availableUnits.map((unit) => getUnitCategory(unit))));
  return ['all', ...categories.filter((category) => category !== 'all')];
}

export function getManualUnits(availableUnits = [], manualCategory = 'all') {
  const filtered = manualCategory === 'all'
    ? availableUnits
    : availableUnits.filter((unit) => getUnitCategory(unit) === manualCategory);

  return [...filtered].sort((left, right) => {
    if (Number(right.absolute_max_pax || 0) !== Number(left.absolute_max_pax || 0)) {
      return Number(right.absolute_max_pax || 0) - Number(left.absolute_max_pax || 0);
    }
    if (Number(right.standard_max_pax || 0) !== Number(left.standard_max_pax || 0)) {
      return Number(right.standard_max_pax || 0) - Number(left.standard_max_pax || 0);
    }
    return String(left.unit_label || left.unit_id).localeCompare(String(right.unit_label || right.unit_id));
  });
}

export function selectBookingUnit(currentIds = [], unitId, { mode = 'solo', selectionTargetMet = false } = {}) {
  if (mode === 'solo') return currentIds.includes(unitId) ? [] : [unitId];
  if (currentIds.includes(unitId)) return currentIds.filter((value) => value !== unitId);
  if (selectionTargetMet) return currentIds;
  return [...currentIds, unitId];
}

export function summarizeSelection(selectedUnits = [], requestedGuests = 0) {
  const absoluteCapacity = selectedUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0);
  const standardCapacity = selectedUnits.reduce((sum, unit) => sum + Number(unit.standard_max_pax || 0), 0);
  return {
    absoluteCapacity,
    standardCapacity,
    targetMet: Number(requestedGuests || 0) > 0 && absoluteCapacity >= Number(requestedGuests || 0),
    remainingAbsoluteCapacity: Math.max(0, Number(requestedGuests || 0) - absoluteCapacity),
    remainingStandardCapacity: Math.max(0, Number(requestedGuests || 0) - standardCapacity)
  };
}

export function buildFitWarnings({
  dateRangeValid,
  guestCountValid,
  canSearch,
  availableUnitCount = 0,
  loadingRecommendations = false,
  selectedUnitCount = 0,
  selectionCapacity = 0,
  guestCount = 0,
  quote = null,
  fullName = '',
  quoteError = ''
} = {}) {
  const warnings = [];
  if (!dateRangeValid) warnings.push('Check-out must be later than check-in.');
  if (!guestCountValid) warnings.push('Guest count must be greater than zero.');
  if (canSearch && availableUnitCount === 0 && !loadingRecommendations) warnings.push('No units are currently available for that date range.');
  if (selectedUnitCount === 0 && canSearch && availableUnitCount > 0) warnings.push('Pick the exact room or room combo you want to save.');
  if (selectedUnitCount > 0 && selectionCapacity > 0 && Number(guestCount) > selectionCapacity) warnings.push('Selected units cannot hold this pax count within absolute max capacity.');
  if (quote?.total_extra_guests > 0) warnings.push(`${quote.total_extra_guests} guest(s) are using extra-pax capacity on this quote.`);
  if (!String(fullName || '').trim()) warnings.push('Guest name is still blank. The booking will save as Walk-in Guest.');
  if (quoteError) warnings.push(quoteError);
  return warnings;
}

export function getBookingStepState({ canSearch, selectedUnitIds = [], quote = null, form = {} } = {}) {
  return {
    setupDone: Boolean(canSearch),
    selectionDone: selectedUnitIds.length > 0 && Boolean(quote),
    guestDone: Boolean(form.phone || form.email || String(form.fullName || '').trim())
  };
}

export function isSaveReady({ canSearch, selectedUnitIds = [], quote = null, guestCount = 0, selectionCapacity = 0 } = {}) {
  return Boolean(canSearch) && selectedUnitIds.length > 0 && Boolean(quote) && Number(guestCount) <= Number(selectionCapacity || 0);
}

export function buildCreateBookingPayload({ form = {}, quote = {}, admin_id = 'AmalfiDesk' } = {}) {
  return {
    admin_id,
    header: {
      guest_name: form.fullName || 'Walk-in Guest',
      email: form.email,
      phone: form.phone,
      check_in: form.checkIn,
      check_out: form.checkOut,
      lodging_total: quote.total_amount,
      status: 'RESERVED',
      booking_source: form.bookingSource,
      booking_mode: form.mode === 'combo' ? 'TRANSACTION_GROUP' : 'STANDARD',
      notes: form.notes,
      created_by: 'admin'
    },
    items: (quote.quoted_units || []).map((unit) => ({
      unit_id: unit.unit_id,
      room_type: unit.room_type,
      check_in: form.checkIn,
      check_out: form.checkOut,
      guest_count: unit.assigned_guests,
      lodging_subtotal: unit.total_amount,
      status: 'RESERVED'
    }))
  };
}

export function buildInitialPaymentPayload({ amount, quote = {}, paymentMethod = 'Cash', admin_id = 'AmalfiDesk' } = {}) {
  const paid = Number(amount || 0);
  return {
    amount: paid,
    payment_type: paid >= Number(quote.total_amount || 0) ? 'Full Payment' : 'deposit',
    payment_method: paymentMethod,
    verification_status: 'VERIFIED',
    notes: 'Recorded via Amalfi Admin Desk',
    admin_id
  };
}

export function filterLedgerRows(ledger = [], { query = '', statusFilter = 'active' } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return ledger
    .filter((row) => {
      if (statusFilter === 'active' && !isActiveBooking(row)) return false;
      if (statusFilter === 'pending' && row.status !== 'PENDING_VERIFICATION') return false;
      if (statusFilter === 'checked_in' && row.status !== 'CHECKED_IN') return false;
      if (statusFilter === 'closed' && !['CHECKED_OUT', 'COMPLETED', 'CANCELLED'].includes(row.status)) return false;
      if (!normalizedQuery) return true;
      return [
        bookingRef(row),
        guestName(row),
        row.phone,
        row.email,
        bookingUnits(row),
        row.room_type
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => String(right.created_at || right.check_in || '').localeCompare(String(left.created_at || left.check_in || '')));
}

export function filterChatbotConversations(conversations = [], filter = 'all') {
  return conversations.filter((conversation) => {
    if (filter === 'all') return true;
    const category = String(conversation.category || '').toUpperCase();
    if (filter === 'operator') {
      return ['HOT_BOOKING_LEAD', 'PAYMENT_SENT', 'COMPLAINT', 'REBOOKING_OR_CANCELLATION', 'NEEDS_HUMAN', 'MANUAL_ACTIVE'].includes(category) || conversation.manual_active;
    }
    if (filter === 'bot') return ['LOW_PRIORITY_FAQ', 'SPAM_OR_NONSENSE'].includes(category);
    return category === filter;
  });
}

export function buildAdminDeskRequest(kind, input = {}) {
  const row = input.row || {};
  const ref = input.bookingRef || bookingRef(row);
  const admin_id = input.admin_id || 'AmalfiDesk';

  if (kind === 'checkIn') {
    return {
      method: 'post',
      url: `/api/v1/admin/bookings/${ref}/change-set`,
      body: { workflow: 'checkin', admin_id }
    };
  }

  if (kind === 'checkout') {
    return {
      method: 'post',
      url: `/api/v1/admin/bookings/${ref}/change-set`,
      body: { workflow: 'checkout', admin_id }
    };
  }

  if (kind === 'verify') {
    return {
      method: 'post',
      url: '/api/v1/admin/verify',
      body: {
        booking_ref: ref,
        decision: input.decision,
        notes: 'Reviewed via Amalfi Admin Desk',
        admin_id
      }
    };
  }

  if (kind === 'unitStatus') {
    return {
      method: 'patch',
      url: `/api/v1/admin/units/${input.unitId}/status`,
      body: { status: input.status, admin_id }
    };
  }

  if (kind === 'saveLedgerEdit') {
    const draft = input.draft || {};
    return {
      method: 'post',
      url: `/api/v1/admin/bookings/${ref}/change-set`,
      body: {
        workflow: 'edit',
        booking: {
          guest_name: draft.guest_name,
          full_name: draft.guest_name,
          phone: draft.phone,
          email: draft.email,
          status: draft.status,
          booking_source: draft.booking_source,
          notes: draft.notes
        },
        admin_id
      }
    };
  }

  if (kind === 'recordPayment') {
    const amount = Number(input.amount);
    return {
      method: 'post',
      url: `/api/v1/admin/bookings/${ref}/change-set`,
      body: {
        workflow: 'edit',
        payment: {
          amount,
          payment_type: amount >= bookingBalance(row) ? 'Full Settlement' : 'payment',
          transaction_type: amount >= bookingBalance(row) ? 'Full Settlement' : 'payment',
          payment_method: input.method,
          verification_status: 'VERIFIED',
          notes: 'Recorded via Amalfi Admin Desk'
        },
        admin_id
      }
    };
  }

  if (kind === 'chatbotCategory') {
    return {
      method: 'patch',
      url: `/api/v1/admin/chatbot-conversations/${encodeURIComponent(input.senderId)}/category`,
      body: { category: input.category }
    };
  }

  throw new Error(`Unknown Admin Desk request kind: ${kind}`);
}
