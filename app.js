document.addEventListener('DOMContentLoaded', () => {
  
  // Central Data Stores
  const villas = [
    { id: "Villa 1", name: "Amalfi Suite", category: "Medium Sized Luxury Villa", nightlyRate: 8278.57 },
    { id: "Villa 2", name: "Positano Vista", category: "Medium Sized Luxury Villa", nightlyRate: 9500 },
    { id: "Villa 3", name: "Ravello Suite", category: "Medium Sized Luxury Villa", nightlyRate: 8750 },
    { id: "Villa 4", name: "Capri Vista", category: "Medium Sized Luxury Villa", nightlyRate: 8800 },
    { id: "Villa 5", name: "Sirenuse Suite", category: "Large Luxury Villa", nightlyRate: 19080 },
    { id: "Villa 6", name: "Sunset Pavilion", category: "Large Luxury Villa", nightlyRate: 10525 }
  ];

  const API_BASE = '/api/v1';
  const OPERATIONAL_START_DATE = new Date("2026-06-18");
  let backendOnline = false;

  function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    return fetch(`${API_BASE}${path}`, { ...options, headers }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Request failed: ${response.status}`);
      }
      return payload;
    });
  }

  function pushBackend(path, payload, options = {}) {
    if (!backendOnline && options.skipWhenOffline !== false) return;
    apiFetch(path, {
      method: options.method || 'POST',
      body: payload !== undefined ? JSON.stringify(payload) : undefined
    }).catch(err => console.warn(`Amalfi backend sync skipped for ${path}:`, err.message));
  }

  function toLocalDate(value) {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysBetween(start, end) {
    if (!start || !end) return 1;
    return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  }

  function formatBackendDateRange(checkIn, checkOut) {
    const start = toLocalDate(checkIn);
    const end = toLocalDate(checkOut);
    if (!start || !end) return 'Dates pending';
    const startText = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const endText = end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return `${startText} - ${endText}`;
  }

  function humanizeBackendStatus(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'CHECKED_IN') return 'Checked In';
    if (normalized === 'CHECKED_OUT') return 'Checked Out';
    if (normalized === 'PENDING_VERIFICATION') return 'Pending Verification';
    if (normalized === 'CONFIRMED' || normalized === 'VERIFIED') return 'Confirmed';
    if (normalized === 'CANCELLED') return 'Cancelled';
    if (normalized === 'REJECTED' || normalized === 'PAYMENT_REJECTED') return 'Rejected';
    return status || 'Confirmed';
  }

  function humanizePaymentStatus(status, balance, total) {
    const normalized = String(status || '').toUpperCase();
    if (normalized.includes('PENDING')) return 'PENDING';
    if (normalized === 'FULL' || Number(balance || 0) <= 0) return 'FULL';
    if (Number(balance || 0) < Number(total || 0)) return 'PARTIAL';
    return normalized || 'UNPAID';
  }

  function mapBackendReservation(row) {
    const checkIn = toLocalDate(row.check_in);
    const checkOut = toLocalDate(row.check_out);
    const villa = villas.find(v => v.name === row.room_type || v.id === row.unit_id) || villas.find(v => row.unit_id && String(row.unit_id).toLowerCase().includes(v.name.toLowerCase().split(' ')[0]));
    const total = Number(row.total_price || 0);
    const duration = daysBetween(checkIn, checkOut);
    const startOffset = checkIn ? Math.max(0, Math.round((checkIn - OPERATIONAL_START_DATE) / (1000 * 60 * 60 * 24))) : 0;
    return {
      id: row.booking_ref || row.id || `booking-${Date.now()}`,
      bookingRef: row.booking_ref,
      guest: row.full_name || row.guest || 'Guest',
      villa: villa?.id || row.unit_id || row.room_type || 'Villa',
      villaName: villa?.name || row.room_type || row.unit_id || 'Amalfi Villa',
      dates: formatBackendDateRange(row.check_in, row.check_out),
      created: row.created_at ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
      bookingStatus: humanizeBackendStatus(row.status),
      paymentStatus: humanizePaymentStatus(row.payment_status || row.status, row.balance, total),
      baseRate: total,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: total.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      startOffset,
      duration,
      isBlockout: false,
      checkIn: row.check_in,
      checkOut: row.check_out
    };
  }

  function backendStatusFromUi(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('checked in')) return 'CHECKED_IN';
    if (normalized.includes('checked out')) return 'CHECKED_OUT';
    if (normalized.includes('cancel')) return 'CANCELLED';
    if (normalized.includes('pending')) return 'PENDING_VERIFICATION';
    if (normalized.includes('reject')) return 'REJECTED';
    return 'CONFIRMED';
  }

  function backendPaymentStatusFromUi(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'FULL' || normalized === 'PAID') return 'FULL';
    if (normalized === 'PARTIAL') return 'PARTIAL';
    if (normalized.includes('PENDING')) return 'PENDING_VERIFICATION';
    if (normalized.includes('REJECT')) return 'REJECTED';
    return 'UNPAID';
  }

  function workflowFromBookingStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('checked in')) return 'checkin';
    if (normalized.includes('checked out')) return 'checkout';
    return 'edit';
  }

  function buildBackendBookingPayload({ guest, villaName, room, checkinVal, checkoutVal, bookingStatus, paymentStatus, baseRate, folio }) {
    const total = parseFloat(String(folio || baseRate || '0').replace(/,/g, '')) || Number(baseRate || 0);
    return {
      full_name: guest,
      guest_name: guest,
      room_type: villaName,
      villa_id: room,
      check_in: checkinVal,
      check_out: checkoutVal,
      guests: 1,
      total_price: total,
      lodging_total: total,
      status: backendStatusFromUi(bookingStatus),
      payment_status: backendPaymentStatusFromUi(paymentStatus),
      booking_source: 'Amalfi Desktop Admin',
      notes: 'Updated from Amalfi desktop admin.'
    };
  }

  const DEFAULT_RESERVATIONS = [
    {
      id: "loren",
      guest: "Sophia Loren",
      villa: "Villa 1",
      villaName: "Amalfi Suite",
      dates: "June 18 - June 25",
      created: "June 10, 2026",
      bookingStatus: "Checked In",
      paymentStatus: "PARTIAL",
      baseRate: 57950,
      addonWine: false,
      addonYacht: false,
      addonSpa: true,
      addonChef: false,
      posCharges: [
        { id: "chg-1", name: "Local Beer (2x)", amount: 360, date: "June 19, 2026" },
        { id: "chg-2", name: "Bottled Water (500ml)", amount: 50, date: "June 19, 2026" }
      ],
      folio: "62,560.00",
      startOffset: 0,
      duration: 7,
      isBlockout: false
    },
    {
      id: "clooney",
      guest: "George Clooney",
      villa: "Villa 5",
      villaName: "Sirenuse Suite",
      dates: "June 22 - June 27",
      created: "June 12, 2026",
      bookingStatus: "Confirmed",
      paymentStatus: "PARTIAL",
      baseRate: 95400,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "95,400.00",
      startOffset: 4,
      duration: 5,
      isBlockout: false
    },
    {
      id: "harrington",
      guest: "Lord Marcus Harrington",
      villa: "Villa 6",
      villaName: "Sunset Pavilion",
      dates: "June 24 - June 28",
      created: "June 15, 2026",
      bookingStatus: "Confirmed",
      paymentStatus: "UNPAID",
      baseRate: 42100,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "42,100.00",
      startOffset: 6,
      duration: 4,
      isBlockout: false
    },
    {
      id: "dicaprio",
      guest: "Leonardo DiCaprio",
      villa: "Villa 3",
      villaName: "Ravello Suite",
      dates: "June 19 - June 23",
      created: "June 11, 2026",
      bookingStatus: "Checked In",
      paymentStatus: "FULL",
      baseRate: 35000,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "35,000.00",
      startOffset: 1,
      duration: 4,
      isBlockout: false
    },
    {
      id: "pitt",
      guest: "Brad Pitt",
      villa: "Villa 4",
      villaName: "Capri Vista",
      dates: "June 21 - June 27",
      created: "June 12, 2026",
      bookingStatus: "Checked In",
      paymentStatus: "FULL",
      baseRate: 52800,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "52,800.00",
      startOffset: 3,
      duration: 6,
      isBlockout: false
    },
    {
      id: "gaga",
      guest: "Lady Gaga",
      villa: "Villa 2",
      villaName: "Positano Vista",
      dates: "June 23 - June 26",
      created: "June 14, 2026",
      bookingStatus: "Confirmed",
      paymentStatus: "PARTIAL",
      baseRate: 28500,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "28,500.00",
      startOffset: 5,
      duration: 3,
      isBlockout: false
    },
    {
      id: "block-villa-2",
      guest: "Housekeeping: In Progress",
      villa: "Villa 2",
      villaName: "Positano Vista",
      dates: "June 18 - June 20",
      created: "June 18, 2026",
      bookingStatus: "Cleaning",
      paymentStatus: "FULL",
      baseRate: 0,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "0.00",
      startOffset: 0,
      duration: 2,
      isBlockout: true
    },
    {
      id: "block-villa-4",
      guest: "Maintenance: AC Failure",
      villa: "Villa 4",
      villaName: "Capri Vista",
      dates: "June 18 - June 21",
      created: "June 18, 2026",
      bookingStatus: "Maint. Hold",
      paymentStatus: "FULL",
      baseRate: 0,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      posCharges: [],
      folio: "0.00",
      startOffset: 0,
      duration: 3,
      isBlockout: true
    }
  ];

  const DEFAULT_PRODUCTS = [
    { id: "p-1", name: "Local Craft Beer", price: 180, category: "Food & Beverage", stock: 120 },
    { id: "p-2", name: "Club Sandwich with Fries", price: 380, category: "Food & Beverage", stock: 50 },
    { id: "p-3", name: "Soda Can (Coke/Sprite)", price: 90, category: "Food & Beverage", stock: 150 },
    { id: "p-4", name: "Burger & Fries Combo", price: 420, category: "Food & Beverage", stock: 40 },
    { id: "p-5", name: "Bottled Water (500ml)", price: 50, category: "Food & Beverage", stock: 200 },
    { id: "p-6", name: "Sunscreen Lotion", price: 450, category: "Boutique & Retail", stock: 35 },
    { id: "p-7", name: "Resort Souvenir T-Shirt", price: 650, category: "Boutique & Retail", stock: 60 },
    { id: "p-8", name: "Pool Float Rental", price: 200, category: "Experiences & Services", stock: 15 }
  ];

  // â”€â”€ DEPARTMENT MAP â”€â”€ drives cascading dropdowns & P&L grouping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const DEPT_MAP = {
    "Rooms & Housekeeping": {
      subcategories: [
        { name: "Laundry & Linen Service",       category: "variable" },
        { name: "Room Supplies (Toiletries)",     category: "variable" },
        { name: "Housekeeping Wages",             category: "variable" },
        { name: "Room Repairs & Upkeep",          category: "variable" },
        { name: "Deep Cleaning Service",          category: "variable" },
        { name: "Bedding & Linen Replacement",    category: "variable" }
      ]
    },
    "Food & Beverage": {
      subcategories: [
        { name: "Food Inventory Restocking",      category: "variable" },
        { name: "Beverage Restocking",            category: "variable" },
        { name: "Kitchen Wages",                  category: "variable" },
        { name: "Kitchen Equipment Repairs",      category: "variable" },
        { name: "Kitchen Gas / LPG",              category: "variable" },
        { name: "Dining Supplies & Tableware",    category: "variable" }
      ]
    },
    "Staffing & Payroll": {
      subcategories: [
        { name: "Regular Salaries",               category: "fixed" },
        { name: "Overtime Pay",                   category: "variable" },
        { name: "SSS / PhilHealth / HDMF",        category: "fixed" },
        { name: "Contractual / Part-Time",        category: "variable" },
        { name: "Staff Benefits & Allowances",    category: "variable" }
      ]
    },
    "Utilities": {
      subcategories: [
        { name: "Electricity",                    category: "variable" },
        { name: "Water & Sewage",                 category: "variable" },
        { name: "Internet & Telecom",             category: "fixed" },
        { name: "Generator Fuel",                 category: "variable" },
        { name: "LPG / Cooking Gas",              category: "variable" }
      ]
    },
    "Maintenance & Facilities": {
      subcategories: [
        { name: "General Repairs",                category: "variable" },
        { name: "Pool Maintenance",               category: "variable" },
        { name: "Landscaping & Grounds",          category: "variable" },
        { name: "Pest Control",                   category: "variable" },
        { name: "Security Services",              category: "fixed" }
      ]
    },
    "Marketing & Admin": {
      subcategories: [
        { name: "Digital Marketing & Ads",        category: "variable" },
        { name: "OTA / Booking Platform Fees",    category: "variable" },
        { name: "Office Supplies",                category: "variable" },
        { name: "Software & Subscriptions",       category: "fixed" },
        { name: "Print & Signage",                category: "variable" }
      ]
    },
    "Fixed Overheads": {
      subcategories: [
        { name: "Property Insurance",             category: "fixed" },
        { name: "Business Taxes & Permits",       category: "fixed" },
        { name: "Franchise / Management Fees",    category: "fixed" },
        { name: "Loan Interest",                  category: "fixed" },
        { name: "Depreciation & Amortization",    category: "fixed" },
        { name: "Income Tax Provision",           category: "fixed" }
      ]
    }
  };

  // â”€â”€ DEFAULT STAFF ROSTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const DEFAULT_STAFF = [
    { id: "staff-1", name: "Housekeeper 1",       position: "Head Housekeeper",  department: "Rooms & Housekeeping", basicSalary: 18000, isActive: true },
    { id: "staff-2", name: "Housekeeper 2",       position: "Housekeeper",        department: "Rooms & Housekeeping", basicSalary: 14000, isActive: true },
    { id: "staff-3", name: "Front Desk Officer",  position: "Front Desk",         department: "Admin",               basicSalary: 16500, isActive: true },
    { id: "staff-4", name: "Cook / Kitchen Staff",position: "Cook",               department: "Food & Beverage",     basicSalary: 17000, isActive: true },
    { id: "staff-5", name: "Maintenance Staff",   position: "Maintenance",        department: "Maintenance & Facilities", basicSalary: 15500, isActive: true },
    { id: "staff-6", name: "Security Guard",      position: "Security",           department: "Staffing & Payroll",  basicSalary: 14800, isActive: true },
    { id: "staff-7", name: "Resort Manager",      position: "Manager",            department: "Admin",               basicSalary: 35000, isActive: true }
  ];

  // â”€â”€ DEFAULT EXPENSES v3 (departmental schema) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const DEFAULT_EXPENSES = [
    { id: "exp-1",  date: "2026-06-05", vendor: "Payroll Run - June H1",        description: "Regular Salaries - June H1",        department: "Staffing & Payroll",     subcategory: "Regular Salaries",           category: "fixed",    amount: 131800, paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-2",  date: "2026-06-05", vendor: "Payroll Run - June H1",        description: "SSS / PhilHealth / HDMF - June H1",  department: "Staffing & Payroll",     subcategory: "SSS / PhilHealth / HDMF",    category: "fixed",    amount: 14200,  paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-3",  date: "2026-06-10", vendor: "Meralco",                       description: "Electricity Bill - June",             department: "Utilities",              subcategory: "Electricity",                category: "variable", amount: 10900,  paymentMethod: "Corporate Card", recurrence: "Monthly" },
    { id: "exp-4",  date: "2026-06-10", vendor: "Local Water District",          description: "Water & Sewage - June",              department: "Utilities",              subcategory: "Water & Sewage",             category: "variable", amount: 3200,   paymentMethod: "Corporate Card", recurrence: "Monthly" },
    { id: "exp-5",  date: "2026-06-11", vendor: "Shell Gasoline",                description: "Generator Fuel Refill",              department: "Utilities",              subcategory: "Generator Fuel",             category: "variable", amount: 8500,   paymentMethod: "Cash",          recurrence: "One-Time" },
    { id: "exp-6",  date: "2026-06-12", vendor: "Sun Laundry Services",          description: "Weekly Laundry & Linen Service",     department: "Rooms & Housekeeping",   subcategory: "Laundry & Linen Service",    category: "variable", amount: 6800,   paymentMethod: "Cash",          recurrence: "Weekly" },
    { id: "exp-7",  date: "2026-06-12", vendor: "SM Supermarket",                description: "Room Toiletries & Supplies",         department: "Rooms & Housekeeping",   subcategory: "Room Supplies (Toiletries)", category: "variable", amount: 4200,   paymentMethod: "Corporate Card", recurrence: "Monthly" },
    { id: "exp-8",  date: "2026-06-13", vendor: "Fresh Mart Produce",            description: "Food Inventory Restocking",          department: "Food & Beverage",        subcategory: "Food Inventory Restocking",  category: "variable", amount: 28400,  paymentMethod: "Corporate Card", recurrence: "Weekly" },
    { id: "exp-9",  date: "2026-06-13", vendor: "Beverage Depot",                description: "Beer, Wine & Soft Drinks Restock",  department: "Food & Beverage",        subcategory: "Beverage Restocking",        category: "variable", amount: 15200,  paymentMethod: "Corporate Card", recurrence: "Weekly" },
    { id: "exp-10", date: "2026-06-14", vendor: "HVAC Solutions Co.",            description: "Aircon Unit Repair - Villa 4",       department: "Maintenance & Facilities",subcategory: "General Repairs",            category: "variable", amount: 12400,  paymentMethod: "Bank Transfer", recurrence: "One-Time" },
    { id: "exp-11", date: "2026-06-14", vendor: "AquaClean Pool Services",       description: "Pool Chemical Treatment & Filter",  department: "Maintenance & Facilities",subcategory: "Pool Maintenance",           category: "variable", amount: 4500,   paymentMethod: "Cash",          recurrence: "Monthly" },
    { id: "exp-12", date: "2026-06-15", vendor: "Meta Ads / Facebook",           description: "Social Media Marketing - June",     department: "Marketing & Admin",      subcategory: "Digital Marketing & Ads",   category: "variable", amount: 8500,   paymentMethod: "Corporate Card", recurrence: "Monthly" },
    { id: "exp-13", date: "2026-06-15", vendor: "Booking.com",                   description: "OTA Commission Fees - June",         department: "Marketing & Admin",      subcategory: "OTA / Booking Platform Fees",category: "variable", amount: 6800,   paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-14", date: "2026-06-01", vendor: "PhilAm Insurance",              description: "Property Insurance Premium",        department: "Fixed Overheads",        subcategory: "Property Insurance",         category: "fixed",    amount: 8500,   paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-15", date: "2026-06-01", vendor: "Bureau of Internal Revenue",    description: "Income Tax Provision - Q2",         department: "Fixed Overheads",        subcategory: "Income Tax Provision",       category: "fixed",    amount: 25000,  paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-16", date: "2026-06-01", vendor: "BDO Home Loan",                 description: "Mortgage / Loan Interest - June",   department: "Fixed Overheads",        subcategory: "Loan Interest",              category: "fixed",    amount: 5400,   paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-17", date: "2026-06-01", vendor: "Accounting Write-Down",         description: "Depreciation & Amortization",       department: "Fixed Overheads",        subcategory: "Depreciation & Amortization",category: "fixed",    amount: 14000,  paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-18", date: "2026-06-01", vendor: "Management Agreement",          description: "Franchise / Management Fee",        department: "Fixed Overheads",        subcategory: "Franchise / Management Fees",category: "fixed",    amount: 12000,  paymentMethod: "Bank Transfer", recurrence: "Monthly" },
    { id: "exp-19", date: "2026-06-16", vendor: "PLDT Fiber",                    description: "Internet & Telephone - June",       department: "Utilities",              subcategory: "Internet & Telecom",         category: "fixed",    amount: 3500,   paymentMethod: "Corporate Card", recurrence: "Monthly" },
    { id: "exp-20", date: "2026-06-16", vendor: "GreenScape Landscaping",        description: "Landscaping & Garden Upkeep",       department: "Maintenance & Facilities",subcategory: "Landscaping & Grounds",      category: "variable", amount: 3800,   paymentMethod: "Cash",          recurrence: "Monthly" }
  ];

  const DEFAULT_POS_SALES = [
    { id: "sale-1", date: "2026-06-19", guest: "Sophia Loren", villa: "Villa 1", items: [{ name: "Local Craft Beer", price: 180, qty: 2 }, { name: "Bottled Water (500ml)", price: 50, qty: 1 }], total: 410, checkoutType: "room", resId: "loren" },
    { id: "sale-2", date: "2026-06-19", guest: "Walk-in Guest", villa: "N/A", items: [{ name: "Club Sandwich with Fries", price: 380, qty: 4 }], total: 1520, checkoutType: "direct", paymentMethod: "Cash" }
  ];

  // Seed / Load logic
  if (!localStorage.getItem('amalfi_reservations')) {
    localStorage.setItem('amalfi_reservations', JSON.stringify(DEFAULT_RESERVATIONS));
  }
  let reservations = JSON.parse(localStorage.getItem('amalfi_reservations'));

  if (!localStorage.getItem('amalfi_products_v2')) {
    localStorage.setItem('amalfi_products_v2', JSON.stringify(DEFAULT_PRODUCTS));
    localStorage.removeItem('amalfi_products'); // Clean up old key
  }
  let products = JSON.parse(localStorage.getItem('amalfi_products_v2'));

  // Migrate to v3 schema â€” always use amalfi_expenses_v3
  if (!localStorage.getItem('amalfi_expenses_v3')) {
    localStorage.setItem('amalfi_expenses_v3', JSON.stringify(DEFAULT_EXPENSES));
    localStorage.removeItem('amalfi_expenses_v2');
    localStorage.removeItem('amalfi_expenses');
  }
  let expenses = JSON.parse(localStorage.getItem('amalfi_expenses_v3'));

  // Staff & Payroll data
  if (!localStorage.getItem('amalfi_staff')) {
    localStorage.setItem('amalfi_staff', JSON.stringify(DEFAULT_STAFF));
  }
  let staff = JSON.parse(localStorage.getItem('amalfi_staff'));

  if (!localStorage.getItem('amalfi_payroll_runs')) {
    localStorage.setItem('amalfi_payroll_runs', JSON.stringify([]));
  }
  let payrollRuns = JSON.parse(localStorage.getItem('amalfi_payroll_runs'));

  if (!localStorage.getItem('amalfi_pos_sales_v2')) {
    localStorage.setItem('amalfi_pos_sales_v2', JSON.stringify(DEFAULT_POS_SALES));
    localStorage.removeItem('amalfi_pos_sales'); // Clean up old key
  }
  let posSales = JSON.parse(localStorage.getItem('amalfi_pos_sales_v2'));

  // Sync helpers
  function saveReservations() {
    localStorage.setItem('amalfi_reservations', JSON.stringify(reservations));
  }
  function saveProducts() {
    localStorage.setItem('amalfi_products_v2', JSON.stringify(products));
  }
  function saveExpenses() {
    localStorage.setItem('amalfi_expenses_v3', JSON.stringify(expenses));
  }
  function saveStaff() {
    localStorage.setItem('amalfi_staff', JSON.stringify(staff));
  }
  function savePayrollRuns() {
    localStorage.setItem('amalfi_payroll_runs', JSON.stringify(payrollRuns));
  }
  function savePosSales() {
    localStorage.setItem('amalfi_pos_sales_v2', JSON.stringify(posSales));
  }

  function refreshAdminViews() {
    if (typeof renderLedgerTable === 'function') renderLedgerTable();
    if (typeof renderGanttChart === 'function') renderGanttChart();
    if (typeof renderSpecialBookings === 'function') renderSpecialBookings();
    if (typeof renderServiceRequests === 'function') renderServiceRequests();
    if (typeof window.renderMaintenanceBlockouts === 'function') window.renderMaintenanceBlockouts();
    if (typeof updateOverviewKPIs === 'function') updateOverviewKPIs();
    if (typeof updateOverviewRoster === 'function') updateOverviewRoster();
    if (typeof window.renderPosTerminal === 'function') window.renderPosTerminal();
    if (typeof window.renderProductCatalogTable === 'function') window.renderProductCatalogTable();
    if (typeof renderExpensesTable === 'function') renderExpensesTable();
    if (typeof renderStaffRoster === 'function') renderStaffRoster();
    if (typeof renderPayrollHistory === 'function') renderPayrollHistory();
    if (typeof updatePLStatement === 'function') updatePLStatement();
    if (typeof applyFilters === 'function') applyFilters();
  }

  async function syncBackendState() {
    try {
      const data = await apiFetch('/admin/amalfi/bootstrap');
      backendOnline = true;

      const localBlockouts = reservations.filter(res => res.isBlockout);
      if (Array.isArray(data.reservations)) {
        reservations = [...data.reservations.map(mapBackendReservation), ...localBlockouts];
        saveReservations();
      }
      if (Array.isArray(data.products)) {
        products = data.products;
        saveProducts();
      }
      if (Array.isArray(data.expenses)) {
        expenses = data.expenses;
        saveExpenses();
      }
      if (Array.isArray(data.staff)) {
        staff = data.staff;
        saveStaff();
      }
      if (Array.isArray(data.payrollRuns)) {
        const expandedRuns = [];
        data.payrollRuns.forEach(run => {
          const details = Array.isArray(run.details) ? run.details : [];
          if (details.length) {
            details.forEach(item => expandedRuns.push({
              id: `${run.id}-${item.employeeId || item.id || item.employeeName}`,
              month: run.payrollMonth,
              employeeId: item.employeeId || item.id,
              employeeName: item.employeeName || item.name,
              position: item.position,
              grossPay: Number(item.grossPay || item.basicSalary || 0),
              sssDeduction: Number(item.sssDeduction || item.sss || 0),
              philhealthDeduction: Number(item.philhealthDeduction || item.philhealth || 0),
              hdmfDeduction: Number(item.hdmfDeduction || item.hdmf || 0),
              withholdingTax: Number(item.withholdingTax || item.withholding || 0),
              netPay: Number(item.netPay || 0),
              dateProcessed: run.runDate
            }));
          } else {
            expandedRuns.push({
              id: run.id,
              month: run.payrollMonth,
              employeeId: run.id,
              employeeName: `${run.staffCount || 0} staff`,
              position: 'Payroll run',
              grossPay: Number(run.grossPay || 0),
              sssDeduction: 0,
              philhealthDeduction: 0,
              hdmfDeduction: 0,
              withholdingTax: Number(run.deductions || 0),
              netPay: Number(run.netPay || 0),
              dateProcessed: run.runDate
            });
          }
        });
        payrollRuns = expandedRuns;
        savePayrollRuns();
      }
      if (Array.isArray(data.posSales)) {
        posSales = data.posSales;
        savePosSales();
      }
      if (Array.isArray(data.requests)) {
        serviceRequests = data.requests;
      }
      if (Array.isArray(data.specialBookings)) {
        specialBookings = data.specialBookings;
      }

      refreshAdminViews();
    } catch (err) {
      backendOnline = false;
      console.warn('Amalfi backend is unavailable; desktop admin is using local data.', err.message);
    }
  }

  let ganttStartDate = new Date("2026-06-18");
  const operationalStartDate = new Date("2026-06-18");
  let currentLedgerTab = 'active';
  let activeExpenseTab = 'all';

  let specialBookings = [
    {
      id: "SB-401",
      guest: "George Clooney",
      amenity: "Pool Cabana Reservation",
      details: "Luxury pool cabana with refreshments and fresh fruits",
      date: "June 23, 2026",
      folio: "1,500.00",
      status: "Confirmed"
    },
    {
      id: "SB-402",
      guest: "Lord Marcus Harrington",
      amenity: "Premium Drinks Package",
      details: "Welcome drinks package and local snacks stocked in Villa 6 Acc.",
      date: "June 24, 2026",
      folio: "1,500.00",
      status: "Pending verification"
    },
    {
      id: "SB-403",
      guest: "Sophia Loren",
      amenity: "Airport Shuttle Service",
      details: "Coordination of priority resort shuttle transfer from airport",
      date: "June 18, 2026",
      folio: "1,200.00",
      status: "Cleared"
    },
    {
      id: "SB-404",
      guest: "Lady Gaga",
      amenity: "Private Beach Sauna",
      details: "Reservation of Emerald Cove thermal cave and spa wellness kit",
      date: "June 25, 2026",
      folio: "1,500.00",
      status: "Scheduled"
    }
  ];
  let serviceRequests = [];
  
  // DOM Elements
  const sidebar = document.getElementById('stitch-sidebar');
  const hamburgerBtn = document.getElementById('sidebar-hamburger');
  const navLinks = document.querySelectorAll('.nav-link');
  const breadcrumbs = document.getElementById('ops-breadcrumbs');
  const viewTitle = document.getElementById('ops-view-title');
  const viewPanels = document.querySelectorAll('.view-panel');
  const privacyCheckbox = document.getElementById('global-privacy-toggle');
  
  // Modal Elements
  const modalTicket = document.getElementById('modal-ticket');
  const btnNewTicket = document.getElementById('btn-new-ticket');
  const btnQuickNewTicket = document.getElementById('btn-quick-new-ticket');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const ticketForm = document.getElementById('ticket-form');
  const ticketsTableBody = document.querySelector('#maintenance-tickets-table tbody');

  // Special Bookings & Maintenance Hub Elements
  const btnNewSpecialBooking = document.getElementById('btn-new-special-booking');
  const modalSpecialBooking = document.getElementById('modal-special-booking');
  const btnCloseSpecialModal = document.getElementById('btn-close-special-modal');
  const specialBookingForm = document.getElementById('special-booking-form');
  const specialBookingsTableBody = document.querySelector('#special-bookings-table tbody');
  const maintenanceBlockoutsTableBody = document.querySelector('#maintenance-blockouts-table tbody');
  
  // Overview & Verification Badges
  const ticketBadge = document.getElementById('overview-badge-tickets');
  const verificationBadgeOverview = document.getElementById('overview-badge-verification');
  const verificationBadgeSidebar = document.getElementById('badge-verifications-count');

  // Verification View DOM
  const btnApproveSlip = document.getElementById('btn-approve-slip');
  const btnRejectSlip = document.getElementById('btn-reject-slip');
  const verificationCardHarrington = document.querySelector('[data-ref="harrington"]');
  const inspectionPane = document.getElementById('verification-inspection-pane');
  
  // Room Grid / Ledger elements for State Sync
  const villa10Card = document.getElementById('villa-10-card');
  const harringtonLedgerStatus = document.getElementById('harrington-ledger-status');
  const harringtonLedgerVal = document.getElementById('harrington-ledger-val');
  
  // Search & Filter View DOM
  const globalSearchInput = document.getElementById('global-search-input');
  const globalFilterSelect = document.getElementById('global-filter-select');
  const globalFilterSelect2 = document.getElementById('global-filter-select-2');
  const knowledgeCards = document.querySelectorAll('.knowledge-card');
  
  // Chatbot Supervisor View DOM
  const btnChatTakeover = document.getElementById('btn-chat-takeover');
  const chatHeaderAIText = document.getElementById('chat-header-ai-text');
  const chatHeaderAIDot = document.getElementById('chat-header-ai-dot');
  const chatInputMsg = document.getElementById('chat-input-msg');
  const chatInputSend = document.getElementById('chat-input-send');
  const chatInputForm = document.getElementById('chat-input-form');
  const chatMessagesStream = document.getElementById('chat-messages-stream');

  // Theme Toggle Elements
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const themeToggleText = document.getElementById('theme-toggle-text');

  // Initialize Theme from localStorage
  let currentTheme = localStorage.getItem('amalfi_theme') || 'light';
  document.documentElement.className = currentTheme;
  updateRootThemeUI(currentTheme);

  function updateRootThemeUI(theme) {
    if (theme === 'dark') {
      if (themeToggleIcon) themeToggleIcon.textContent = 'light_mode';
      if (themeToggleText) themeToggleText.textContent = 'Light Mode';
      if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#8E9BB0';
      }
    } else {
      if (themeToggleIcon) themeToggleIcon.textContent = 'dark_mode';
      if (themeToggleText) themeToggleText.textContent = 'Dark Mode';
      if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#555D6B';
      }
    }
  }

  // Theme Toggle Click Handler
  if (themeToggleBtn && themeToggleIcon && themeToggleText) {
    themeToggleBtn.addEventListener('click', () => {
      const isDarkMode = document.documentElement.classList.toggle('dark');
      const themeValue = isDarkMode ? 'dark' : 'light';
      localStorage.setItem('amalfi_theme', themeValue);
      updateRootThemeUI(themeValue);
      recreateCharts();
    });
  }

  // Cross-window Theme Sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'amalfi_theme') {
      const newTheme = e.newValue || 'dark';
      document.documentElement.className = newTheme;
      updateRootThemeUI(newTheme);
      recreateCharts();
    }
  });

  function recreateCharts() {
    // Destroy and re-create charts to update text & grid line colors dynamically
    if (chartRevenueInstance || chartCategoriesInstance || chartChannelsInstance || chartUnitOccupancyInstance || chartUnitAdrInstance || chartUnitRevparInstance || chartExpensesCashflowInstance || chartExpenseCategoriesInstance || chartOperatingMarginInstance || chartSummaryFinancialsInstance || chartSummaryMarginInstance || chartSummaryCategoriesInstance || chartDailyRevenueOccupancyInstance) {
      if (chartRevenueInstance) {
        chartRevenueInstance.destroy();
        chartRevenueInstance = null;
      }
      if (chartCategoriesInstance) {
        chartCategoriesInstance.destroy();
        chartCategoriesInstance = null;
      }
      if (chartChannelsInstance) {
        chartChannelsInstance.destroy();
        chartChannelsInstance = null;
      }
      if (chartUnitOccupancyInstance) {
        chartUnitOccupancyInstance.destroy();
        chartUnitOccupancyInstance = null;
      }
      if (chartUnitAdrInstance) {
        chartUnitAdrInstance.destroy();
        chartUnitAdrInstance = null;
      }
      if (chartUnitRevparInstance) {
        chartUnitRevparInstance.destroy();
        chartUnitRevparInstance = null;
      }
      if (chartExpensesCashflowInstance) {
        chartExpensesCashflowInstance.destroy();
        chartExpensesCashflowInstance = null;
      }
      if (chartExpenseCategoriesInstance) {
        chartExpenseCategoriesInstance.destroy();
        chartExpenseCategoriesInstance = null;
      }
      if (chartOperatingMarginInstance) {
        chartOperatingMarginInstance.destroy();
        chartOperatingMarginInstance = null;
      }
      if (chartSummaryFinancialsInstance) {
        chartSummaryFinancialsInstance.destroy();
        chartSummaryFinancialsInstance = null;
      }
      if (chartSummaryMarginInstance) {
        chartSummaryMarginInstance.destroy();
        chartSummaryMarginInstance = null;
      }
      if (chartSummaryCategoriesInstance) {
        chartSummaryCategoriesInstance.destroy();
        chartSummaryCategoriesInstance = null;
      }
      if (chartDailyRevenueOccupancyInstance) {
        chartDailyRevenueOccupancyInstance.destroy();
        chartDailyRevenueOccupancyInstance = null;
      }
      initializeAnalyticsCharts();
    }
  }

  // Cache original ledger values
  document.querySelectorAll('.ledger-maskable').forEach(el => {
    el.setAttribute('data-original', el.textContent.trim());
  });

  // 1. Tab Switching Controller
  window.switchToTab = function(viewId) {
    const link = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    if (link) {
      link.click();
    }
  };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      const viewId = link.getAttribute('data-view');
      
      // Update active links styling classes
      navLinks.forEach(item => {
        item.className = "nav-link flex items-center gap-3.5 py-2.5 text-on-surface-variant font-label-caps pl-4 hover:text-primary transition-colors duration-300";
        const icon = item.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 0";
      });
      
      link.className = "nav-link flex items-center gap-3.5 py-2.5 text-tertiary font-bold border-l-2 border-tertiary pl-4 scale-[0.99] transition-all";
      const activeIcon = link.querySelector('.material-symbols-outlined');
      if (activeIcon) activeIcon.style.fontVariationSettings = "'FILL' 1";

      // Hide all panels, show active
      viewPanels.forEach(panel => panel.classList.add('hidden'));
      const activePanel = document.getElementById(`view-${viewId}`);
      if (activePanel) activePanel.classList.remove('hidden');

      // Update header details
      updateHeaderMetadata(viewId);

      // Render the context filters in the Control Panel
      if (typeof renderGlobalFilters === 'function') {
        renderGlobalFilters(viewId);
      }

      // Close mobile sidebar drawer
      if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });
  });

  function updateHeaderMetadata(viewId) {
    switch (viewId) {
      case 'overview':
        viewTitle.textContent = "Admin Summary";
        breadcrumbs.textContent = "AMALFI RESORT / HUB OVERVIEW";
        break;
      case 'verifications':
        viewTitle.textContent = "Receipt Verifications";
        breadcrumbs.textContent = "AMALFI RESORT / BOOKING DESK";
        break;
      case 'ledger':
        viewTitle.textContent = "Central Ledger";
        breadcrumbs.textContent = "AMALFI RESORT / AUDITING";
        break;
      case 'assignments':
        viewTitle.textContent = "Sanctuary Map";
        breadcrumbs.textContent = "AMALFI RESORT / ROOMS";
        break;
      case 'special':
        viewTitle.textContent = "Special Bookings";
        breadcrumbs.textContent = "AMALFI RESORT / AMENITIES OPERATIONS";
        break;
      case 'maintenance':
        viewTitle.textContent = "Maintenance Hub";
        breadcrumbs.textContent = "AMALFI RESORT / OPERATIONS";
        break;
      case 'analytics':
        viewTitle.textContent = "Performance & Reports";
        breadcrumbs.textContent = "AMALFI RESORT / ANALYTICS";
        setTimeout(initializeAnalyticsCharts, 50); // Delay to guarantee container size is computed
        break;
      case 'knowledge':
        viewTitle.textContent = "Knowledge Monitor";
        breadcrumbs.textContent = "AMALFI RESORT / MANAGEMENT HUB";
        break;
      case 'chatbot':
        viewTitle.textContent = "Chatbot Monitor";
        breadcrumbs.textContent = "AMALFI RESORT / SUPERVISOR CONSOLE";
        break;
      case 'copilot':
        viewTitle.textContent = "AI Operations Copilot";
        breadcrumbs.textContent = "AMALFI RESORT / OPERATIONS BRAIN";
        break;
      case 'pos':
        viewTitle.textContent = "Point of Sale (POS)";
        breadcrumbs.textContent = "AMALFI RESORT / POS & ACCOUNTING";
        if (typeof renderPosTerminal === 'function') renderPosTerminal();
        if (typeof populateRoomSelect === 'function') populateRoomSelect();
        break;
      case 'expenses':
        viewTitle.textContent = "Expense Tracker";
        breadcrumbs.textContent = "AMALFI RESORT / POS & ACCOUNTING";
        if (typeof renderExpensesTable === 'function') renderExpensesTable();
        break;
    }
  }

  // 2. Financial Ledger Privacy Obscuring Toggles
  if (privacyCheckbox) {
    privacyCheckbox.addEventListener('change', (e) => {
      const isObscured = e.target.checked;
      
      document.querySelectorAll('.ledger-maskable').forEach(el => {
        if (isObscured) {
          el.textContent = 'â€¢â€¢,â€¢â€¢â€¢.â€¢â€¢';
        } else {
          el.textContent = el.getAttribute('data-original');
        }
      });

      // Apply blur to other money/financial figures in tables
      document.querySelectorAll('.font-mono-data.text-tertiary').forEach(el => {
        el.style.filter = isObscured ? 'blur(4px)' : 'none';
        el.style.transition = 'filter 0.3s ease';
      });
    });
  }

  // 3. Mobile Hamburger Actions
  if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });

  // 4. Maintenance Ticket Modals
  function openTicketModal() {
    modalTicket.classList.remove('hidden');
    modalTicket.classList.add('flex');
  }

  if (btnNewTicket) btnNewTicket.addEventListener('click', openTicketModal);
  if (btnQuickNewTicket) btnQuickNewTicket.addEventListener('click', openTicketModal);

  if (btnCloseModal && modalTicket) {
    btnCloseModal.addEventListener('click', () => {
      modalTicket.classList.add('hidden');
      modalTicket.classList.remove('flex');
    });
  }

  // 4.5 Special Booking Modal Event Handlers
  if (btnNewSpecialBooking && modalSpecialBooking) {
    btnNewSpecialBooking.addEventListener('click', () => {
      modalSpecialBooking.classList.remove('hidden');
      modalSpecialBooking.classList.add('flex');
    });
  }

  if (btnCloseSpecialModal && modalSpecialBooking) {
    btnCloseSpecialModal.addEventListener('click', () => {
      modalSpecialBooking.classList.add('hidden');
      modalSpecialBooking.classList.remove('flex');
    });
  }

  if (specialBookingForm && modalSpecialBooking) {
    specialBookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const guest = document.getElementById('special-booking-guest').value.trim();
      const amenity = document.getElementById('special-booking-amenity').value;
      const date = document.getElementById('special-booking-date').value.trim();
      const folio = document.getElementById('special-booking-folio').value.trim();
      const details = document.getElementById('special-booking-details').value.trim();
      const status = document.getElementById('special-booking-status').value;
      
      const newBooking = {
        id: "SB-" + Math.floor(100 + Math.random() * 900),
        guest,
        amenity,
        date,
        details,
        folio,
        status
      };
      
      specialBookings.push(newBooking);
      pushBackend('/admin/amalfi/special-bookings', newBooking);
      renderSpecialBookings();
      
      // Close modal
      modalSpecialBooking.classList.add('hidden');
      modalSpecialBooking.classList.remove('flex');
      
      // Reset form
      specialBookingForm.reset();
      
      applyFilters();
    });
  }

  // Ticket Form Submission Handler
  if (ticketForm && ticketsTableBody) {
    ticketForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const location = document.getElementById('ticket-villa').value;
      const desc = document.getElementById('ticket-desc').value;
      const severity = document.getElementById('ticket-severity').value;
      
      const ticketNum = Math.floor(100 + Math.random() * 900);
      const ticketId = `#ENG-${ticketNum}`;
      
      let severityClass = "text-secondary-fixed-dim border-secondary/30";
      if (severity === "HIGH") {
        severityClass = "text-alert-red border-alert-red/30";
      } else if (severity === "MEDIUM") {
        severityClass = "text-alert-orange border-alert-orange/30";
      }

      const request = {
        id: ticketId,
        reservationId: '',
        guest: 'Operations',
        villa: location,
        category: 'Maintenance',
        title: desc,
        details: desc,
        status: 'Pending',
        priority: severity
      };
      serviceRequests.unshift(request);
      pushBackend('/admin/amalfi/service-requests', request);
      renderServiceRequests();
      
      // Update Overview Ticket Count Badge
      if (ticketBadge) {
        let currentCount = parseInt(ticketBadge.textContent);
        ticketBadge.textContent = currentCount + 1;
        document.getElementById('overview-badge-tickets').textContent = currentCount + 1;
      }
      if (typeof updateOverviewKPIs === 'function') updateOverviewKPIs();
      
      // Reset form and close modal
      ticketForm.reset();
      modalTicket.classList.add('hidden');
      modalTicket.classList.remove('flex');
    });
  }

  function renderServiceRequests() {
    if (!ticketsTableBody) return;
    ticketsTableBody.innerHTML = '';
    if (!serviceRequests.length) {
      ticketsTableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-on-surface-variant italic">No maintenance tickets logged.</td></tr>';
      return;
    }
    serviceRequests.forEach(req => {
      const severity = req.priority || 'Normal';
      let severityClass = "text-secondary-fixed-dim border-secondary/30";
      if (String(severity).toUpperCase() === "HIGH") severityClass = "text-alert-red border-alert-red/30";
      else if (String(severity).toUpperCase() === "MEDIUM") severityClass = "text-alert-orange border-alert-orange/30";

      const tr = document.createElement('tr');
      tr.className = "border-b border-secondary/10 hover:bg-surface-variant/30 transition-all cursor-pointer";
      tr.innerHTML = `
        <td class="py-4 pr-4 font-mono-data">${req.id}</td>
        <td class="py-4 px-4 font-label-caps text-tertiary">${req.villa || req.category || 'Resort'}</td>
        <td class="py-4 px-4">${req.details || req.title || ''}</td>
        <td class="py-4 px-4"><span class="font-semibold text-xs border px-2 py-0.5 ${severityClass}">${String(severity).toUpperCase()}</span></td>
        <td class="py-4 pl-4 text-right"><span class="text-xs font-label-caps text-on-surface-variant">${req.status || 'Pending'}</span></td>
      `;
      ticketsTableBody.appendChild(tr);
    });
  }

  // 5. Receipt Verification Workflow & Operator State Sync
  if (btnApproveSlip) {
    btnApproveSlip.addEventListener('click', async () => {
      const pendingBackendRes = reservations.find(r => !r.isBlockout && (r.bookingRef || r.id) && (r.paymentStatus === 'PENDING' || r.paymentStatus === 'PENDING_VERIFICATION' || r.bookingStatus === 'Pending Verification'));
      const harringtonRes = reservations.find(r => r.id === 'harrington');
      const targetRes = pendingBackendRes || harringtonRes;
      if (backendOnline && targetRes && (targetRes.bookingRef || targetRes.id) && targetRes.id !== 'harrington') {
        try {
          await apiFetch('/admin/verify', {
            method: 'POST',
            body: JSON.stringify({
              booking_ref: targetRes.bookingRef || targetRes.id,
              decision: 'approve',
              admin_id: 'amalfi-desktop'
            })
          });
          await syncBackendState();
        } catch (err) {
          alert(`Backend verification failed: ${err.message}`);
          return;
        }
      }
      // 5a. Update verifications cards list
      if (verificationCardHarrington) {
        verificationCardHarrington.className = "bg-surface/30 opacity-60 border-l-2 border-mint-active p-3 flex flex-col gap-2 cursor-not-allowed";
        verificationCardHarrington.querySelector('.flex-col, div:last-child').innerHTML = `
          <span>Villa 6 (Booking Hold)</span>
          <span class="text-mint-active flex items-center gap-1 font-label-caps text-[9px]"><span class="material-symbols-outlined text-[10px]">check_circle</span> Approved & checked-In</span>
        `;
      }
      
      // Disable control buttons
      btnApproveSlip.disabled = true;
      btnApproveSlip.textContent = "Payment Cleared";
      btnApproveSlip.className = "flex-grow-[2] py-3 bg-mint-active/20 text-mint-active border border-mint-active/30 font-label-caps text-label-caps font-bold transition-all text-xs cursor-not-allowed";
      btnRejectSlip.style.display = 'none';

      // 5b. Update badges (Overview & Navigation Sidebar)
      if (verificationBadgeOverview) verificationBadgeOverview.textContent = "0";
      if (verificationBadgeSidebar) verificationBadgeSidebar.style.display = 'none';

      // 5c. Update Harrington's reservation state directly
      if (harringtonRes) {
        harringtonRes.bookingStatus = "Checked In";
        harringtonRes.paymentStatus = "PARTIAL";
        saveReservations();
      }

      // Update Harrington's Special Booking status
      const harringtonSb = specialBookings.find(sb => sb.id === 'SB-402');
      if (harringtonSb) {
        harringtonSb.status = "Stocked";
      }

      renderLedgerTable();
      renderGanttChart();
      renderSpecialBookings();
      applyFilters();

      // 5e. Append check-in notification to Daily operational log in Overview
      const dailyLog = document.querySelector('#view-overview Daily Operational Feed, #view-overview .border-l');
      if (dailyLog) {
        const item = document.createElement('div');
        item.className = "relative";
        item.innerHTML = `
          <div class="absolute -left-[29px] top-1.5 w-2 h-2 bg-mint-active shadow-[0_0_6px_#39FF14]"></div>
          <div class="flex flex-col">
            <span class="font-mono-data text-mint-active text-xs">16:50 â€¢ FRONT DESK</span>
            <h4 class="font-body-lg text-body-lg text-on-surface mt-1">Harrington Deposit Approved & Villa 6 Checked-In</h4>
            <p class="font-body-md text-on-surface-variant mt-1 text-sm">Credit Suisse slip verified. Folio state set to OPEN. Digital key issued.</p>
          </div>
        `;
        dailyLog.insertBefore(item, dailyLog.firstChild);
      }

      // 5f. Sync Chatbot status details
      if (chatMessagesStream) {
        const checkInChat = document.createElement('div');
        checkInChat.className = "bg-surface-variant/40 border border-tertiary/20 p-3 self-end max-w-[80%] text-xs";
        checkInChat.innerHTML = `
          <div class="font-semibold text-mint-active mb-1 flex items-center gap-1">
            <span class="material-symbols-outlined text-[12px]">smart_toy</span> AI Concierge
          </div>
          <p>Update, Lord Harrington: Your CS Wire Transfer has been verified. Welcome to Villa 6! The Sommelier team is placing the Sassicaia 2016 wine in your kitchen as we speak.</p>
          <span class="text-[9px] text-on-surface-variant block text-right mt-1">11:04 AM</span>
        `;
        chatMessagesStream.appendChild(checkInChat);
        chatMessagesStream.scrollTop = chatMessagesStream.scrollHeight;
      }

      alert("Harrington CS slip verified. Villa 6 room assigned. Ledger updated to OPEN.");
    });
  }

  if (btnRejectSlip) {
    btnRejectSlip.addEventListener('click', async () => {
      const pendingBackendRes = reservations.find(r => !r.isBlockout && (r.bookingRef || r.id) && (r.paymentStatus === 'PENDING' || r.paymentStatus === 'PENDING_VERIFICATION' || r.bookingStatus === 'Pending Verification'));
      if (backendOnline && pendingBackendRes) {
        try {
          await apiFetch('/admin/verify', {
            method: 'POST',
            body: JSON.stringify({
              booking_ref: pendingBackendRes.bookingRef || pendingBackendRes.id,
              decision: 'reject',
              admin_id: 'amalfi-desktop'
            })
          });
          await syncBackendState();
        } catch (err) {
          alert(`Backend rejection failed: ${err.message}`);
          return;
        }
      }
      if (pendingBackendRes) {
        pendingBackendRes.bookingStatus = 'Cancelled';
        pendingBackendRes.paymentStatus = 'REJECTED';
        saveReservations();
      }
      if (verificationCardHarrington) {
        verificationCardHarrington.className = "bg-surface/30 opacity-60 border-l-2 border-alert-red p-3 flex flex-col gap-2 cursor-not-allowed";
      }
      if (verificationBadgeOverview) verificationBadgeOverview.textContent = "0";
      if (verificationBadgeSidebar) verificationBadgeSidebar.style.display = 'none';
      renderLedgerTable();
      renderGanttChart();
      applyFilters();
      alert("Payment proof rejected. Booking ledger updated.");
    });
  }

  // 6. Interactive Room Grid State Swapping (Double-click is now handled inside renderGanttChart timeline track)

  // 7. Unified Filter and Search Events
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', () => {
      if (typeof applyFilters === 'function') {
        applyFilters();
      }
    });
  }

  if (globalFilterSelect) {
    globalFilterSelect.addEventListener('change', () => {
      if (typeof applyFilters === 'function') {
        applyFilters();
      }
    });
  }

  if (globalFilterSelect2) {
    globalFilterSelect2.addEventListener('change', () => {
      if (typeof applyFilters === 'function') {
        applyFilters();
      }
    });
  }

  // Helper Functions for Dates and Calculations
  function parseLocalDate(dateStr) {
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function formatDateToYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateRange(startDate, endDate) {
    const allMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const startMonth = allMonths[startDate.getMonth()];
    const endMonth = allMonths[endDate.getMonth()];
    return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}`;
  }

  function getDatesFromAbsoluteOffset(offset, duration) {
    const start = new Date(operationalStartDate);
    start.setDate(start.getDate() + offset);
    
    const end = new Date(start);
    end.setDate(end.getDate() + duration);
    
    return formatDateRange(start, end);
  }

  function calculateDiscountAmount(baseRate) {
    const typeSelect = document.getElementById('edit-booking-discount-type');
    if (!typeSelect) return 0;
    const type = typeSelect.value;
    let discount = 0;
    
    if (type === 'flat') {
      const valInput = document.getElementById('edit-booking-discount-value').value;
      const parsed = parseFloat(valInput.replace(/,/g, '')) || 0;
      discount = parsed;
    } else if (type === 'percent') {
      const valInput = document.getElementById('edit-booking-discount-value').value;
      const parsed = parseFloat(valInput.replace(/,/g, '')) || 0;
      discount = baseRate * (parsed / 100);
    } else if (type === 'promo') {
      const promo = document.getElementById('edit-booking-promo-code').value;
      if (promo === 'WELCOME10') {
        discount = baseRate * 0.1;
      } else if (promo === 'AMALFISUMMER') {
        discount = 15000;
      } else if (promo === 'VIPMEMBER') {
        discount = baseRate * 0.2;
      }
    }
    
    return Math.min(baseRate, Math.max(0, discount));
  }

  function recalculateAutoBaseRateIfNeeded() {
    const overrideCheckbox = document.getElementById('edit-booking-manual-override');
    const baseRateInput = document.getElementById('edit-booking-base-rate');
    if (!overrideCheckbox || !baseRateInput) return;
    
    if (overrideCheckbox.checked) {
      baseRateInput.removeAttribute('readonly');
      baseRateInput.classList.remove('bg-surface-variant/30', 'cursor-not-allowed', 'text-secondary');
      baseRateInput.classList.add('bg-surface');
      return;
    } else {
      baseRateInput.setAttribute('readonly', 'true');
      baseRateInput.classList.add('bg-surface-variant/30', 'cursor-not-allowed', 'text-secondary');
      baseRateInput.classList.remove('bg-surface');
    }

    const checkinVal = document.getElementById('edit-booking-checkin').value;
    const checkoutVal = document.getElementById('edit-booking-checkout').value;
    
    const checkinDate = parseLocalDate(checkinVal);
    const checkoutDate = parseLocalDate(checkoutVal);
    if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
      baseRateInput.value = "0.00";
      updateCalculatedFolio();
      return;
    }
    
    const duration = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
    
    const modeEl = document.querySelector('input[name="booking-unit-mode"]:checked');
    const unitMode = modeEl ? modeEl.value : 'single';
    
    let ratePerNight = 0;
    if (unitMode === 'single') {
      const singleVilla = document.getElementById('edit-booking-villa').value;
      const v = villas.find(v => v.id === singleVilla);
      ratePerNight = v ? (v.nightlyRate || 0) : 0;
    } else {
      const selectedVillas = Array.from(document.querySelectorAll('input[name="multi-villa-select"]:checked')).map(cb => cb.value);
      selectedVillas.forEach(vId => {
        const v = villas.find(v => v.id === vId);
        ratePerNight += v ? (v.nightlyRate || 0) : 0;
      });
    }
    
    const autoRate = ratePerNight * duration;
    baseRateInput.value = autoRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    updateCalculatedFolio();
  }

  function updateCalculatedFolio() {
    const baseRateInput = document.getElementById('edit-booking-base-rate');
    if (!baseRateInput) return;
    const baseRate = parseFloat(baseRateInput.value.replace(/,/g, '')) || 0;
    
    const discountAmount = calculateDiscountAmount(baseRate);
    const discountSpan = document.getElementById('edit-booking-applied-discount');
    if (discountSpan) {
      discountSpan.textContent = discountAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    let addonSum = 0;
    if (document.getElementById('edit-booking-addon-wine').checked) addonSum += 1500;
    if (document.getElementById('edit-booking-addon-yacht').checked) addonSum += 1500;
    if (document.getElementById('edit-booking-addon-spa').checked) addonSum += 1500;
    if (document.getElementById('edit-booking-addon-chef').checked) addonSum += 1200;
    
    const total = Math.max(0, baseRate - discountAmount) + addonSum;
    document.getElementById('edit-booking-folio').value = total.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatNumberWithCommas(val) {
    const cleaned = val.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) parts.splice(2);
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function resetBookingModalTabs() {
    const tabs = document.querySelectorAll('.booking-modal-tab');
    tabs.forEach(tab => {
      if (tab.getAttribute('data-tab') === 'details') {
        tab.classList.add('border-tertiary', 'text-tertiary');
        tab.classList.remove('border-transparent', 'text-secondary');
      } else {
        tab.classList.remove('border-tertiary', 'text-tertiary');
        tab.classList.add('border-transparent', 'text-secondary');
      }
    });
    
    document.querySelectorAll('.booking-tabpane').forEach(pane => {
      if (pane.id === 'booking-tabpane-details') {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });
  }

  // Open Edit Booking Modal
  const editBookingModal = document.getElementById('modal-edit-booking');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const editBookingForm = document.getElementById('edit-booking-form');
  const btnDeleteBooking = document.getElementById('btn-delete-booking');

  // New Booking Button Triggers
  const btnLedgerNewBooking = document.getElementById('btn-ledger-new-booking');
  const btnMapNewBooking = document.getElementById('btn-map-new-booking');
  if (btnLedgerNewBooking) {
    btnLedgerNewBooking.addEventListener('click', () => {
      window.openEditBookingModal(null);
    });
  }
  if (btnMapNewBooking) {
    btnMapNewBooking.addEventListener('click', () => {
      window.openEditBookingModal(null);
    });
  }

  // Booking Modal Tab Switches
  document.querySelectorAll('.booking-modal-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const tabName = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.booking-modal-tab').forEach(btn => {
        if (btn === tabBtn) {
          btn.classList.add('border-tertiary', 'text-tertiary');
          btn.classList.remove('border-transparent', 'text-secondary');
        } else {
          btn.classList.remove('border-tertiary', 'text-tertiary');
          btn.classList.add('border-transparent', 'text-secondary');
        }
      });
      document.querySelectorAll('.booking-tabpane').forEach(pane => {
        if (pane.id === `booking-tabpane-${tabName}`) {
          pane.classList.remove('hidden');
        } else {
          pane.classList.add('hidden');
        }
      });
    });
  });

  // Booking Unit Mode Toggle View Event Listeners
  document.querySelectorAll('input[name="booking-unit-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const mode = radio.value;
      const singleContainer = document.getElementById('booking-single-villa-container');
      const multiContainer = document.getElementById('booking-villas-multiselect-container');
      if (mode === 'single') {
        singleContainer.classList.remove('hidden');
        multiContainer.classList.add('hidden');
      } else {
        singleContainer.classList.add('hidden');
        multiContainer.classList.remove('hidden');
      }
      recalculateAutoBaseRateIfNeeded();
    });
  });

  const editBookingVillaSelect = document.getElementById('edit-booking-villa');
  if (editBookingVillaSelect) {
    editBookingVillaSelect.addEventListener('change', recalculateAutoBaseRateIfNeeded);
  }
  
  document.querySelectorAll('input[name="multi-villa-select"]').forEach(cb => {
    cb.addEventListener('change', recalculateAutoBaseRateIfNeeded);
  });

  const manualOverrideCheckbox = document.getElementById('edit-booking-manual-override');
  if (manualOverrideCheckbox) {
    manualOverrideCheckbox.addEventListener('change', recalculateAutoBaseRateIfNeeded);
  }

  // Booking Modal Calculation & Amount Comma formatting Event Listeners
  const baseRateInput = document.getElementById('edit-booking-base-rate');
  if (baseRateInput) {
    baseRateInput.addEventListener('input', (e) => {
      const cursor = e.target.selectionStart;
      const originalLength = e.target.value.length;
      
      const formatted = formatNumberWithCommas(e.target.value);
      e.target.value = formatted;
      
      const newLength = formatted.length;
      e.target.setSelectionRange(cursor + (newLength - originalLength), cursor + (newLength - originalLength));
      
      updateCalculatedFolio();
    });
    baseRateInput.addEventListener('blur', (e) => {
      const val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
      e.target.value = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      updateCalculatedFolio();
    });
  }

  const specialFolioInput = document.getElementById('special-booking-folio');
  if (specialFolioInput) {
    specialFolioInput.addEventListener('input', (e) => {
      const cursor = e.target.selectionStart;
      const originalLength = e.target.value.length;
      
      const formatted = formatNumberWithCommas(e.target.value);
      e.target.value = formatted;
      
      const newLength = formatted.length;
      e.target.setSelectionRange(cursor + (newLength - originalLength), cursor + (newLength - originalLength));
    });
    specialFolioInput.addEventListener('blur', (e) => {
      const val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
      e.target.value = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  }

  ['wine', 'yacht', 'spa', 'chef'].forEach(addon => {
    const el = document.getElementById(`edit-booking-addon-${addon}`);
    if (el) {
      el.addEventListener('change', updateCalculatedFolio);
    }
  });

  // Calendar Date Constraints (Stay validation)
  const checkinInput = document.getElementById('edit-booking-checkin');
  const checkoutInput = document.getElementById('edit-booking-checkout');
  if (checkinInput && checkoutInput) {
    checkinInput.addEventListener('change', () => {
      const checkinDate = parseLocalDate(checkinInput.value);
      const checkoutDate = parseLocalDate(checkoutInput.value);
      if (checkoutDate <= checkinDate) {
        const newCheckout = new Date(checkinDate.getTime());
        newCheckout.setDate(newCheckout.getDate() + 1);
        checkoutInput.value = formatDateToYYYYMMDD(newCheckout);
      }
      recalculateAutoBaseRateIfNeeded();
    });
    checkoutInput.addEventListener('change', () => {
      const checkinDate = parseLocalDate(checkinInput.value);
      const checkoutDate = parseLocalDate(checkoutInput.value);
      if (checkoutDate <= checkinDate) {
        const newCheckin = new Date(checkoutDate.getTime());
        newCheckin.setDate(newCheckin.getDate() - 1);
        checkinInput.value = formatDateToYYYYMMDD(newCheckin);
      }
      recalculateAutoBaseRateIfNeeded();
    });
  }

  // Discount & Promos Tab Change Handlers
  const discountTypeSelect = document.getElementById('edit-booking-discount-type');
  const discountValContainer = document.getElementById('discount-value-container');
  const discountValLabel = document.getElementById('discount-value-label');
  const discountValInput = document.getElementById('edit-booking-discount-value');
  const promoContainer = document.getElementById('promo-code-container');
  const promoSelect = document.getElementById('edit-booking-promo-code');

  if (discountTypeSelect) {
    discountTypeSelect.addEventListener('change', () => {
      const type = discountTypeSelect.value;
      if (type === 'none') {
        discountValContainer.classList.add('hidden');
        promoContainer.classList.add('hidden');
      } else if (type === 'flat' || type === 'percent') {
        discountValContainer.classList.remove('hidden');
        promoContainer.classList.add('hidden');
        discountValLabel.textContent = type === 'flat' ? 'Discount Amount (â‚±)' : 'Discount Percentage (%)';
        discountValInput.placeholder = type === 'flat' ? '5,000.00' : '10';
      } else if (type === 'promo') {
        discountValContainer.classList.add('hidden');
        promoContainer.classList.remove('hidden');
      }
      updateCalculatedFolio();
    });
  }

  if (discountValInput) {
    discountValInput.addEventListener('input', (e) => {
      const type = discountTypeSelect.value;
      if (type === 'flat') {
        const cursor = e.target.selectionStart;
        const originalLength = e.target.value.length;
        const formatted = formatNumberWithCommas(e.target.value);
        e.target.value = formatted;
        const newLength = formatted.length;
        e.target.setSelectionRange(cursor + (newLength - originalLength), cursor + (newLength - originalLength));
      } else {
        const cleaned = e.target.value.replace(/[^\d.]/g, '');
        e.target.value = cleaned;
      }
      updateCalculatedFolio();
    });
    discountValInput.addEventListener('blur', (e) => {
      const type = discountTypeSelect.value;
      if (type === 'flat') {
        const val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
        e.target.value = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        let val = parseFloat(e.target.value) || 0;
        val = Math.min(100, Math.max(0, val));
        e.target.value = val.toString();
      }
      updateCalculatedFolio();
    });
  }

  if (promoSelect) {
    promoSelect.addEventListener('change', updateCalculatedFolio);
  }

  if (btnCloseEditModal && editBookingModal) {
    btnCloseEditModal.addEventListener('click', (e) => {
      e.stopPropagation();
      editBookingModal.classList.remove('flex');
      editBookingModal.classList.add('hidden');
    });
  }

  // Handle Edit Booking Submit
  if (editBookingForm) {
    editBookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const rowId = document.getElementById('edit-booking-row-id').value;
      const guest = document.getElementById('edit-booking-guest').value;
      const created = document.getElementById('edit-booking-created').value;
      const bookingStatus = document.getElementById('edit-booking-status').value;
      const paymentStatus = document.getElementById('edit-booking-payment-status').value;
      
      const checkinVal = document.getElementById('edit-booking-checkin').value;
      const checkoutVal = document.getElementById('edit-booking-checkout').value;
      
      const checkinDate = parseLocalDate(checkinVal);
      const checkoutDate = parseLocalDate(checkoutVal);
      
      const startOffset = Math.round((checkinDate - operationalStartDate) / (1000 * 60 * 60 * 24));
      const duration = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
      const dates = formatDateRange(checkinDate, checkoutDate);
      
      const baseRate = parseFloat(document.getElementById('edit-booking-base-rate').value.replace(/,/g, '')) || 0;
      const addonWine = document.getElementById('edit-booking-addon-wine').checked;
      const addonYacht = document.getElementById('edit-booking-addon-yacht').checked;
      const addonSpa = document.getElementById('edit-booking-addon-spa').checked;
      const addonChef = document.getElementById('edit-booking-addon-chef').checked;
      
      const manualOverride = document.getElementById('edit-booking-manual-override').checked;
      const discountType = document.getElementById('edit-booking-discount-type').value;
      const discountValue = parseFloat(document.getElementById('edit-booking-discount-value').value.replace(/,/g, '')) || 0;
      const promoCode = document.getElementById('edit-booking-promo-code').value;
      const discountAmount = calculateDiscountAmount(baseRate);
      
      const folio = document.getElementById('edit-booking-folio').value;
      const isBlockout = (bookingStatus === 'Cleaning' || bookingStatus === 'Maint. Hold');
      
      // Get selected unit mode & room mappings
      const unitMode = document.querySelector('input[name="booking-unit-mode"]:checked').value;
      let room = "";
      let villaName = "";
      
      if (unitMode === 'single') {
        room = document.getElementById('edit-booking-villa').value;
        const villaObj = villas.find(v => v.id === room);
        villaName = villaObj ? villaObj.name : "";
      } else {
        const selectedVillas = Array.from(document.querySelectorAll('input[name="multi-villa-select"]:checked')).map(cb => cb.value);
        room = selectedVillas.length > 0 ? selectedVillas.join(', ') : "Villa 1";
        villaName = selectedVillas.map(vId => {
          const vObj = villas.find(v => v.id === vId);
          return vObj ? vObj.name : "";
        }).join(', ') || "Amalfi Suite";
      }
      
      let savedReservation = null;
      let isNewBackendBooking = false;
      const backendPayload = buildBackendBookingPayload({
        guest,
        villaName,
        room,
        checkinVal,
        checkoutVal,
        bookingStatus,
        paymentStatus,
        baseRate,
        folio
      });

      if (rowId) {
        // Edit Mode
        const res = reservations.find(r => r.id === rowId);
        if (res) {
          res.guest = guest;
          res.villa = room;
          res.villaName = villaName;
          res.dates = dates;
          res.created = created;
          res.bookingStatus = bookingStatus;
          res.paymentStatus = paymentStatus;
          res.baseRate = baseRate;
          res.addonWine = addonWine;
          res.addonYacht = addonYacht;
          res.addonSpa = addonSpa;
          res.addonChef = addonChef;
          res.manualOverride = manualOverride;
          res.discountType = discountType;
          res.discountValue = discountValue;
          res.promoCode = promoCode;
          res.discountAmount = discountAmount;
          res.posCharges = res.posCharges || [];
          updateFolio(res);
          res.startOffset = startOffset;
          res.duration = duration;
          res.isBlockout = isBlockout;
          savedReservation = res;
        }
      } else {
        // Add Mode
        const newId = "res-" + Date.now();
        const newRes = {
          id: newId,
          guest: guest,
          villa: room,
          villaName: villaName,
          dates: dates,
          created: created || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          bookingStatus: bookingStatus,
          paymentStatus: paymentStatus,
          baseRate: baseRate,
          addonWine: addonWine,
          addonYacht: addonYacht,
          addonSpa: addonSpa,
          addonChef: addonChef,
          manualOverride: manualOverride,
          discountType: discountType,
          discountValue: discountValue,
          promoCode: promoCode,
          discountAmount: discountAmount,
          posCharges: [],
          folio: folio,
          startOffset: startOffset,
          duration: duration,
          isBlockout: isBlockout
        };
        updateFolio(newRes);
        reservations.push(newRes);
        savedReservation = newRes;
        isNewBackendBooking = true;
      }
      saveReservations();
      if (backendOnline && savedReservation && !savedReservation.isBlockout) {
        try {
          if (isNewBackendBooking) {
            const createdBooking = await apiFetch('/admin/amalfi/manual-booking', {
              method: 'POST',
              body: JSON.stringify(backendPayload)
            });
            if (createdBooking.booking?.booking_ref || createdBooking.booking_ref) {
              savedReservation.id = createdBooking.booking?.booking_ref || createdBooking.booking_ref;
              savedReservation.bookingRef = savedReservation.id;
              saveReservations();
            }
          } else if (savedReservation.bookingRef || savedReservation.id) {
            await apiFetch(`/admin/bookings/${encodeURIComponent(savedReservation.bookingRef || savedReservation.id)}/change-set`, {
              method: 'POST',
              body: JSON.stringify({
                workflow: workflowFromBookingStatus(bookingStatus),
                booking: backendPayload,
                admin_id: 'amalfi-desktop'
              })
            });
          }
          await syncBackendState();
        } catch (err) {
          alert(`Backend booking sync failed: ${err.message}`);
        }
      }
      
      // Re-render
      renderLedgerTable();
      renderGanttChart();
      renderMaintenanceBlockouts();
      
      // Close modal
      if (editBookingModal) {
        editBookingModal.classList.remove('flex');
        editBookingModal.classList.add('hidden');
      }
      
      // Re-apply filters
      applyFilters();
    });
  }

  // Handle Delete/Release Booking
  if (btnDeleteBooking) {
    btnDeleteBooking.addEventListener('click', async (e) => {
      e.preventDefault();
      const rowId = document.getElementById('edit-booking-row-id').value;
      const idx = reservations.findIndex(r => r.id === rowId);
      if (idx !== -1) {
        const removedReservation = reservations[idx];
        if (backendOnline && !removedReservation.isBlockout && (removedReservation.bookingRef || removedReservation.id)) {
          try {
            await apiFetch(`/admin/bookings/${encodeURIComponent(removedReservation.bookingRef || removedReservation.id)}`, {
              method: 'DELETE',
              body: JSON.stringify({ admin_id: 'amalfi-desktop' })
            });
          } catch (err) {
            alert(`Backend booking delete failed: ${err.message}`);
            return;
          }
        }
        reservations.splice(idx, 1);
        saveReservations();
        if (backendOnline) await syncBackendState();
        renderLedgerTable();
        renderGanttChart();
        renderMaintenanceBlockouts();
        applyFilters();
      }
      if (editBookingModal) {
        editBookingModal.classList.remove('flex');
        editBookingModal.classList.add('hidden');
      }
    });
  }

  // 8. Chatbot Live Takeover Simulator
  let isTakeoverMode = false;
  if (btnChatTakeover) {
    btnChatTakeover.addEventListener('click', () => {
      isTakeoverMode = !isTakeoverMode;
      
      if (isTakeoverMode) {
        // Human takeover active
        btnChatTakeover.textContent = "Resume AI Concierge";
        btnChatTakeover.className = "px-4 py-2 border border-mint-active/30 text-mint-active font-label-caps text-label-caps font-bold hover:bg-mint-active/10 transition-all text-xs";
        
        chatHeaderAIText.textContent = "Human Operator Elena Russo in control";
        chatHeaderAIDot.className = "w-1.5 h-1.5 bg-alert-orange rounded-full shadow-[0_0_4px_#FFA500]";
        
        chatInputMsg.disabled = false;
        chatInputMsg.classList.remove('opacity-50', 'cursor-not-allowed');
        chatInputMsg.placeholder = "Type message to Lord Harrington...";
        
        chatInputSend.disabled = false;
        chatInputSend.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        // Restore AI active state
        btnChatTakeover.textContent = "Pause AI & Take Over";
        btnChatTakeover.className = "px-4 py-2 bg-alert-orange text-dark-obsidian font-label-caps text-label-caps font-bold hover:bg-white hover:text-dark-obsidian transition-all text-xs";
        
        chatHeaderAIText.textContent = "AI Concierge handling query...";
        chatHeaderAIDot.className = "w-1.5 h-1.5 bg-mint-active rounded-full shadow-[0_0_4px_#39FF14]";
        
        chatInputMsg.disabled = true;
        chatInputMsg.classList.add('opacity-50', 'cursor-not-allowed');
        chatInputMsg.placeholder = "Take over the chat to send operator messages...";
        chatInputMsg.value = "";
        
        chatInputSend.disabled = true;
        chatInputSend.classList.add('opacity-50', 'cursor-not-allowed');
      }
    });
  }

  // Send Operator message simulator
  if (chatInputForm) {
    chatInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const text = chatInputMsg.value.trim();
      if (!text) return;
      
      const bubble = document.createElement('div');
      bubble.className = "bg-surface-variant/40 border border-alert-orange/20 p-3 self-end max-w-[80%] text-xs";
      bubble.innerHTML = `
        <div class="font-semibold text-alert-orange mb-1 flex items-center gap-1">
          <span class="material-symbols-outlined text-[12px]">support_agent</span> Operator (Elena Russo)
        </div>
        <p>${text}</p>
        <span class="text-[9px] text-on-surface-variant block text-right mt-1">11:04 AM</span>
      `;
      
      chatMessagesStream.appendChild(bubble);
      chatInputMsg.value = "";
      
      // Auto scroll
      chatMessagesStream.scrollTop = chatMessagesStream.scrollHeight;
    });
  }

  // 9. Performance Analytics Charts Storage & Initialization
  let chartRevenueInstance = null;
  let chartCategoriesInstance = null;
  let chartChannelsInstance = null;
  let chartUnitOccupancyInstance = null;
  let chartUnitAdrInstance = null;
  let chartUnitRevparInstance = null;
  let chartExpensesCashflowInstance = null;
  let chartExpenseCategoriesInstance = null;
  let chartOperatingMarginInstance = null;
  
  // New summary and revenues chart instances
  let chartSummaryFinancialsInstance = null;
  let chartSummaryMarginInstance = null;
  let chartSummaryCategoriesInstance = null;
  let chartDailyRevenueOccupancyInstance = null;

  function initializeAnalyticsCharts() {
    if (typeof Chart === 'undefined') return;
    const val = getPLValues();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#c7c6cb' : '#0F1417';
    const gridColor = isDark ? 'rgba(227, 232, 236, 0.04)' : 'rgba(15, 20, 23, 0.06)';
    const doughnutBorderColor = isDark ? '#0f1417' : '#FFFFFF';
    const doughnutBgColor = isDark ? ['#D4AF37', '#1F2833', '#919095', '#39FF14', '#FF8C00'] : ['#D4AF37', '#E3E8EC', '#8C909F', '#0D7A0D', '#E28743'];

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Hanken Grotesk', sans-serif";

    // 0. Executive Summary View Charts
    const sumFinCtx = document.getElementById('chart-summary-financials');
    const sumMarginCtx = document.getElementById('chart-summary-margin');
    const sumCatCtx = document.getElementById('chart-summary-categories');

    if (sumFinCtx && !sumFinCtx.closest('.hidden')) {
      if (!chartSummaryFinancialsInstance) {
        chartSummaryFinancialsInstance = new Chart(sumFinCtx, {
          type: 'bar',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [
              {
                label: 'Revenues (â‚±)',
                data: [240000, 295000, 340000, 325000, 380000, val.grossRevenue],
                backgroundColor: 'rgba(214, 175, 55, 0.75)',
                borderColor: '#D4AF37',
                borderWidth: 1
              },
              {
                label: 'Operating Expenses (â‚±)',
                data: [110000, 135000, 150000, 145000, 170000, val.totalCOGS + val.totalSGA],
                backgroundColor: isDark ? 'rgba(199, 198, 203, 0.2)' : 'rgba(15, 20, 23, 0.15)',
                borderColor: '#8C909F',
                borderWidth: 1
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12 } }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                ticks: {
                  callback: function(value) { return 'â‚±' + (value / 1000) + 'k'; }
                }
              }
            }
          }
        });
      } else {
        chartSummaryFinancialsInstance.data.datasets[0].data[5] = val.grossRevenue;
        chartSummaryFinancialsInstance.data.datasets[1].data[5] = val.totalCOGS + val.totalSGA;
        chartSummaryFinancialsInstance.update();
      }
    }

    if (sumMarginCtx && !sumMarginCtx.closest('.hidden')) {
      if (!chartSummaryMarginInstance) {
        chartSummaryMarginInstance = new Chart(sumMarginCtx, {
          type: 'line',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
              label: 'EBITDA Margin (%)',
              data: [49.2, 49.2, 50.6, 50.2, 50.3, val.ebitdaPct],
              borderColor: '#D4AF37',
              backgroundColor: 'rgba(214, 175, 55, 0.05)',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              pointBackgroundColor: '#D4AF37',
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                min: 30,
                max: 60,
                ticks: {
                  callback: function(value) { return value + '%'; }
                }
              }
            }
          }
        });
      } else {
        chartSummaryMarginInstance.data.datasets[0].data[5] = val.ebitdaPct;
        chartSummaryMarginInstance.update();
      }
    }

    if (sumCatCtx && !sumCatCtx.closest('.hidden')) {
      if (!chartSummaryCategoriesInstance) {
        chartSummaryCategoriesInstance = new Chart(sumCatCtx, {
          type: 'doughnut',
          data: {
            labels: ['Suites', 'Dining', 'Experiences', 'Spa', 'Retail'],
            datasets: [{
              data: [val.roomsBase, val.fbRevenues, val.yachtRevenues, val.spaRevenues, val.otherRevenues],
              backgroundColor: doughnutBgColor,
              borderColor: doughnutBorderColor,
              borderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8 } }
            }
          }
        });
      } else {
        chartSummaryCategoriesInstance.data.labels = ['Suites', 'Dining', 'Experiences', 'Spa', 'Retail'];
        chartSummaryCategoriesInstance.data.datasets[0].data = [val.roomsBase, val.fbRevenues, val.yachtRevenues, val.spaRevenues, val.otherRevenues];
        chartSummaryCategoriesInstance.update();
      }
    }

    // 1. Revenues View Charts
    const revCtx = document.getElementById('chart-revenue');
    const catCtx = document.getElementById('chart-categories');
    const chanCtx = document.getElementById('chart-channels');
    const dailyRevOccCtx = document.getElementById('chart-daily-revenue-occupancy');
    
    if (revCtx && !revCtx.closest('.hidden')) {
      if (!chartRevenueInstance) {
        const goldGradient = revCtx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        goldGradient.addColorStop(0, 'rgba(214, 175, 55, 0.25)');
        goldGradient.addColorStop(1, 'rgba(214, 175, 55, 0)');

        const mintGradient = revCtx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        mintGradient.addColorStop(0, 'rgba(57, 255, 20, 0.15)');
        mintGradient.addColorStop(1, 'rgba(57, 255, 20, 0)');

        chartRevenueInstance = new Chart(revCtx, {
          type: 'line',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [
              {
                label: 'Suites Base Rates (â‚±)',
                data: [180000, 220000, 250000, 240000, 270000, val.roomsBase],
                borderColor: '#D4AF37',
                backgroundColor: goldGradient,
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointBackgroundColor: '#D4AF37',
                pointRadius: 4
              },
              {
                label: 'Incidentals & Services (â‚±)',
                data: [60000, 75000, 90000, 85000, 110000, val.fbRevenues + val.yachtRevenues + val.spaRevenues + val.otherRevenues],
                borderColor: isDark ? '#39FF14' : '#0D7A0D',
                backgroundColor: mintGradient,
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointBackgroundColor: isDark ? '#39FF14' : '#0D7A0D',
                pointRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12 } }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                ticks: {
                  callback: function(value) { return 'â‚±' + (value / 1000) + 'k'; }
                }
              }
            }
          }
        });
      } else {
        chartRevenueInstance.data.datasets[0].data[5] = val.roomsBase;
        chartRevenueInstance.data.datasets[1].data[5] = val.fbRevenues + val.yachtRevenues + val.spaRevenues + val.otherRevenues;
        chartRevenueInstance.update();
      }
    }

    if (catCtx && !catCtx.closest('.hidden')) {
      if (!chartCategoriesInstance) {
        chartCategoriesInstance = new Chart(catCtx, {
          type: 'doughnut',
          data: {
            labels: ['Suites', 'Dining', 'Experiences', 'Spa', 'Retail'],
            datasets: [{
              data: [val.roomsBase, val.fbRevenues, val.yachtRevenues, val.spaRevenues, val.otherRevenues],
              backgroundColor: doughnutBgColor,
              borderColor: doughnutBorderColor,
              borderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8 } }
            }
          }
        });
      } else {
        chartCategoriesInstance.data.labels = ['Suites', 'Dining', 'Experiences', 'Spa', 'Retail'];
        chartCategoriesInstance.data.datasets[0].data = [val.roomsBase, val.fbRevenues, val.yachtRevenues, val.spaRevenues, val.otherRevenues];
        chartCategoriesInstance.update();
      }
    }

    if (chanCtx && !chanCtx.closest('.hidden')) {
      if (!chartChannelsInstance) {
        chartChannelsInstance = new Chart(chanCtx, {
          type: 'doughnut',
          data: {
            labels: ['Direct', 'OTAs', 'Virtuoso'],
            datasets: [{
              data: [55, 25, 20],
              backgroundColor: isDark ? ['#D4AF37', '#1F2833', '#8C909F'] : ['#D4AF37', '#E3E8EC', '#8C909F'],
              borderColor: doughnutBorderColor,
              borderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8 } }
            }
          }
        });
      } else {
        chartChannelsInstance.update();
      }
    }
    if (dailyRevOccCtx && !dailyRevOccCtx.closest('.hidden')) {
      if (!chartDailyRevenueOccupancyInstance) {
        chartDailyRevenueOccupancyInstance = new Chart(dailyRevOccCtx, {
          type: 'bar',
          data: {
            labels: ['Jun 16', 'Jun 17', 'Jun 18', 'Jun 19', 'Jun 20', 'Jun 21', 'Jun 22', 'Jun 23', 'Jun 24', 'Jun 25', 'Jun 26', 'Jun 27', 'Jun 28', 'Jun 29', 'Jun 30'],
            datasets: [
              {
                type: 'bar',
                label: 'Room Revenue (â‚±)',
                data: [12000, 15000, 18500, 16000, 22000, 24500, 19000, 28000, 31000, 29000, 35000, 38000, 42000, 37000, 45000],
                backgroundColor: 'rgba(214, 175, 55, 0.75)',
                borderColor: '#D4AF37',
                borderWidth: 1,
                yAxisID: 'y'
              },
              {
                type: 'line',
                label: 'Occupancy Rate (%)',
                data: [67, 75, 83, 78, 85, 92, 80, 88, 95, 90, 100, 100, 95, 92, 100],
                borderColor: isDark ? '#39FF14' : '#0D7A0D',
                pointBackgroundColor: isDark ? '#39FF14' : '#0D7A0D',
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                yAxisID: 'y1'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12 } }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                type: 'linear',
                display: true,
                position: 'left',
                grid: { color: gridColor },
                ticks: {
                  callback: function(value) { return 'â‚±' + (value / 1000) + 'k'; }
                }
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                min: 0,
                max: 100,
                grid: { drawOnChartArea: false },
                ticks: {
                  callback: function(value) { return value + '%'; }
                }
              }
            }
          }
        });
      } else {
        chartDailyRevenueOccupancyInstance.update();
      }
    }

    // 2. Units Analysis View Charts
    const occupancyCtx = document.getElementById('chart-unit-occupancy');
    const adrCtx = document.getElementById('chart-unit-adr');
    const revparCtx = document.getElementById('chart-unit-revpar');

    if (occupancyCtx && !occupancyCtx.closest('.hidden')) {
      if (!chartUnitOccupancyInstance) {
        chartUnitOccupancyInstance = new Chart(occupancyCtx, {
          type: 'bar',
          data: {
            labels: ['Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5', 'Villa 6'],
            datasets: [{
              label: 'Occupancy Rate (%)',
              data: [82, 78, 85, 74, 91, 88],
              backgroundColor: ['#D4AF37', '#D4AF37', '#D4AF37', '#D4AF37', '#8C909F', '#8C909F'],
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                min: 0,
                max: 100,
                ticks: {
                  callback: function(value) { return value + '%'; }
                }
              }
            }
          }
        });
      } else {
        chartUnitOccupancyInstance.update();
      }
    }

    if (adrCtx && !adrCtx.closest('.hidden')) {
      if (!chartUnitAdrInstance) {
        chartUnitAdrInstance = new Chart(adrCtx, {
          type: 'bar',
          data: {
            labels: ['Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5', 'Villa 6'],
            datasets: [{
              label: 'ADR (â‚±)',
              data: [3200, 3500, 3800, 4200, 6500, 7200],
              backgroundColor: ['#919095', '#919095', '#919095', '#919095', '#D4AF37', '#D4AF37'],
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              borderWidth: 1
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: {
                grid: { color: gridColor },
                ticks: {
                  callback: function(value) { return 'â‚±' + value.toLocaleString(); }
                }
              },
              y: { grid: { color: gridColor } }
            }
          }
        });
      } else {
        chartUnitAdrInstance.update();
      }
    }

    if (revparCtx && !revparCtx.closest('.hidden')) {
      if (!chartUnitRevparInstance) {
        chartUnitRevparInstance = new Chart(revparCtx, {
          type: 'bar',
          data: {
            labels: ['Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5', 'Villa 6'],
            datasets: [{
              label: 'RevPAR (â‚±)',
              data: [2624, 2730, 3230, 3108, 5915, 6336],
              backgroundColor: ['#D4AF37', '#D4AF37', '#D4AF37', '#D4AF37', '#8C909F', '#8C909F'],
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                ticks: {
                  callback: function(value) { return 'â‚±' + value.toLocaleString(); }
                }
              }
            }
          }
        });
      } else {
        chartUnitRevparInstance.update();
      }
    }

    // 3. Expenses & Cashflow View Charts
    const expensesCashflowCtx = document.getElementById('chart-expenses-cashflow');
    const expenseCategoriesCtx = document.getElementById('chart-expense-categories');
    const marginCtx = document.getElementById('chart-operating-margin');

    if (expensesCashflowCtx && !expensesCashflowCtx.closest('.hidden')) {
      if (!chartExpensesCashflowInstance) {
        chartExpensesCashflowInstance = new Chart(expensesCashflowCtx, {
          type: 'bar',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [
              {
                type: 'bar',
                label: 'Revenues (â‚±)',
                data: [240000, 295000, 340000, 325000, 380000, val.grossRevenue],
                backgroundColor: 'rgba(214, 175, 55, 0.75)',
                borderColor: '#D4AF37',
                borderWidth: 1
              },
              {
                type: 'bar',
                label: 'Operating Expenses (â‚±)',
                data: [110000, 135000, 150000, 145000, 170000, val.totalCOGS + val.totalSGA],
                backgroundColor: isDark ? 'rgba(199, 198, 203, 0.2)' : 'rgba(15, 20, 23, 0.15)',
                borderColor: '#8C909F',
                borderWidth: 1
              },
              {
                type: 'line',
                label: 'Net Cashflow (â‚±)',
                data: [130000, 160000, 190000, 180000, 210000, val.grossRevenue - (val.totalCOGS + val.totalSGA)],
                borderColor: isDark ? '#39FF14' : '#0D7A0D',
                pointBackgroundColor: isDark ? '#39FF14' : '#0D7A0D',
                borderWidth: 2.5,
                tension: 0.4,
                fill: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12 } }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                ticks: {
                  callback: function(value) { return 'â‚±' + (value / 1000) + 'k'; }
                }
              }
            }
          }
        });
      } else {
        chartExpensesCashflowInstance.data.datasets[0].data[5] = val.grossRevenue;
        chartExpensesCashflowInstance.data.datasets[1].data[5] = val.totalCOGS + val.totalSGA;
        chartExpensesCashflowInstance.data.datasets[2].data[5] = val.grossRevenue - (val.totalCOGS + val.totalSGA);
        chartExpensesCashflowInstance.update();
      }
    }

    if (expenseCategoriesCtx && !expenseCategoriesCtx.closest('.hidden')) {
      if (!chartExpenseCategoriesInstance) {
        chartExpenseCategoriesInstance = new Chart(expenseCategoriesCtx, {
          type: 'polarArea',
          data: {
            labels: ['Salaries', 'Utilities', 'Snacks & Food', 'General Ops', 'Spa Supplies'],
            datasets: [{
              data: [val.sgaSalaries, val.sgaUtilities, val.cogsWine, val.sgaYachtCrew + val.cogsFuel, val.cogsSpa + val.sgaSpaStaff],
              backgroundColor: [
                'rgba(140, 144, 159, 0.7)',
                'rgba(74, 85, 104, 0.7)',
                'rgba(214, 175, 55, 0.75)',
                'rgba(26, 54, 93, 0.7)',
                'rgba(155, 44, 44, 0.7)'
              ],
              borderColor: doughnutBorderColor,
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8 } }
            },
            scales: {
              r: {
                grid: { color: gridColor },
                angleLines: { color: gridColor },
                ticks: { display: false }
              }
            }
          }
        });
      } else {
        chartExpenseCategoriesInstance.data.datasets[0].data = [
          val.sgaSalaries,
          val.sgaUtilities,
          val.cogsWine,
          val.sgaYachtCrew + val.cogsFuel,
          val.cogsSpa + val.sgaSpaStaff
        ];
        chartExpenseCategoriesInstance.update();
      }
    }

    if (marginCtx && !marginCtx.closest('.hidden')) {
      if (!chartOperatingMarginInstance) {
        chartOperatingMarginInstance = new Chart(marginCtx, {
          type: 'line',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
              label: 'EBITDA Margin (%)',
              data: [54.2, 54.2, 55.9, 55.4, 55.3, val.ebitdaPct],
              borderColor: '#D4AF37',
              backgroundColor: 'rgba(214, 175, 55, 0.05)',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              pointBackgroundColor: '#D4AF37',
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { color: gridColor } },
              y: {
                grid: { color: gridColor },
                min: 40,
                max: 70,
                ticks: {
                  callback: function(value) { return value + '%'; }
                }
              }
            }
          }
        });
      } else {
        chartOperatingMarginInstance.data.datasets[0].data[5] = val.ebitdaPct;
        chartOperatingMarginInstance.update();
      }
    }
  }

  // 9b. Performance Analytics Sub-tab switching
  const analyticsSubTabs = document.querySelectorAll('.analytics-sub-tab');
  const analyticsSubViews = document.querySelectorAll('.analytics-subview');

  analyticsSubTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const subviewId = tab.getAttribute('data-subview');

      // Update tab styles
      analyticsSubTabs.forEach(t => {
        t.className = "analytics-sub-tab px-4 py-2 border-b-2 border-transparent text-secondary hover:text-on-surface text-xs font-label-caps font-bold transition-all focus:outline-none";
      });
      tab.className = "analytics-sub-tab px-4 py-2 border-b-2 border-tertiary text-tertiary text-xs font-label-caps font-bold transition-all focus:outline-none";

      // Show/Hide target subview container
      analyticsSubViews.forEach(view => {
        if (view.id === `analytics-subview-${subviewId}`) {
          view.classList.remove('hidden');
        } else {
          view.classList.add('hidden');
        }
      });

      // Rerender/initialize visible charts after transition
      setTimeout(initializeAnalyticsCharts, 50);
    });
  });

  // 9c. Ledger CSV Export
  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const activeReservations = reservations.filter(res => !res.isBlockout);
      const headers = ["Reservation ID", "Guest Name", "Villa", "Villa Name", "Booking Dates", "Date Created", "Booking Status", "Payment Status", "Folio Value (â‚±)"];
      const rows = activeReservations.map(res => [
        res.id,
        res.guest,
        res.villa,
        res.villaName,
        res.dates,
        res.created,
        res.bookingStatus,
        res.paymentStatus,
        res.folio.replace(/,/g, '')
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `amalfi_resort_ledger_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // 9d. Printable PDF Report
  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', () => {
      const printWindow = window.open('', '_blank');
      const activeReservations = reservations.filter(res => !res.isBlockout);
      const val = getPLValues();
      const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const pct = (p) => p.toFixed(1) + '%';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Amalfi Resort - Executive Operations Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;600;700&display=swap');
            body {
              font-family: 'Hanken Grotesk', sans-serif;
              color: #0F1417;
              background: #FFFFFF;
              padding: 40px;
              line-height: 1.5;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #D4AF37;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo-text {
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 2px;
              color: #0F1417;
              text-transform: uppercase;
            }
            .report-title {
              font-size: 16px;
              color: #D4AF37;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .metadata {
              margin-bottom: 30px;
              font-size: 12px;
              color: #718096;
            }
            .metadata table {
              width: 100%;
            }
            .section-title {
              font-size: 14px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-top: 30px;
              margin-bottom: 15px;
              border-bottom: 1px solid #E2E8F0;
              padding-bottom: 5px;
              color: #1A365D;
            }
            table.financial-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
              font-size: 13px;
            }
            table.financial-table th {
              font-size: 11px;
              text-transform: uppercase;
              color: #718096;
              border-bottom: 1px solid #CBD5E0;
              padding: 10px 5px;
              text-align: left;
            }
            table.financial-table td {
              padding: 10px 5px;
              border-bottom: 1px solid #EDF2F7;
            }
            .text-right {
              text-align: right !important;
            }
            .font-semibold {
              font-weight: 600;
            }
            .font-bold {
              font-weight: 700;
            }
            .category-header {
              background: #F7FAFC;
              font-weight: 600;
              color: #2D3748;
            }
            .total-row {
              font-weight: 700;
              background: #EDF2F7;
              border-top: 1px solid #CBD5E0;
              border-bottom: 1px solid #A0AEC0;
            }
            .noi-row {
              font-weight: 700;
              background: #EDF2F7;
              border-top: 1px solid #CBD5E0;
              border-bottom: 2px solid #0F1417;
            }
            .net-income-row {
              font-weight: 700;
              background: #FEFCBF;
              font-size: 14px;
              border-top: 2px solid #D4AF37;
              border-bottom: 3px double #D4AF37;
              color: #744210;
            }
            .reservation-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
              margin-top: 20px;
            }
            .reservation-table th {
              background: #EDF2F7;
              color: #4A5568;
              font-weight: 600;
              text-transform: uppercase;
              padding: 8px;
              border: 1px solid #E2E8F0;
              text-align: left;
            }
            .reservation-table td {
              padding: 8px;
              border: 1px solid #E2E8F0;
            }
            @media print {
              body {
                padding: 20px;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo-text">Amalfi Resort</div>
              <div style="font-size: 12px; color: #718096; margin-top: 4px;">Positano, Italy</div>
            </div>
            <div class="text-right">
              <div class="report-title">Executive Profit & Loss Statement</div>
              <div style="font-size: 12px; color: #718096; margin-top: 4px;">Q2 Operations Ledger</div>
            </div>
          </div>
          
          <div class="metadata">
            <table>
              <tr>
                <td><strong>Reporting Period:</strong> June 1 - June 30, 2026</td>
                <td class="text-right"><strong>Generated On:</strong> ${new Date().toLocaleString()}</td>
              </tr>
              <tr>
                <td><strong>Accounting Method:</strong> Accrual</td>
                <td class="text-right"><strong>Currency:</strong> PHP (â‚±)</td>
              </tr>
            </table>
          </div>
          
          <div class="section-title">Operating Ledger Breakdown (USALI Lodging Standard)</div>
          <table class="financial-table">
            <thead>
              <tr>
                <th>Account Category</th>
                <th class="text-right" style="width: 18%;">June 2026 (â‚±)</th>
                <th class="text-right" style="width: 12%;">June %</th>
                <th class="text-right" style="width: 20%;">YTD Total (â‚±)</th>
                <th class="text-right" style="width: 12%;">YTD %</th>
                    <!-- REVENUES -->
              <tr class="category-header">
                <td colspan="5">Operating Revenues</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Rooms Base Rates</td>
                <td class="text-right">${fmt(val.roomsBase)}</td>
                <td class="text-right">${pct(val.roomsBasePct)}</td>
                <td class="text-right">${fmt(val.ytdRooms)}</td>
                <td class="text-right">${pct(val.ytdRoomsPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Food &amp; Beverage Operations</td>
                <td class="text-right">${fmt(val.fbRevenues)}</td>
                <td class="text-right">${pct(val.fbRevenuesPct)}</td>
                <td class="text-right">${fmt(val.ytdFB)}</td>
                <td class="text-right">${pct(val.ytdFBPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Guest Activity &amp; Equipment Rentals</td>
                <td class="text-right">${fmt(val.yachtRevenues)}</td>
                <td class="text-right">${pct(val.yachtRevenuesPct)}</td>
                <td class="text-right">${fmt(val.ytdYacht)}</td>
                <td class="text-right">${pct(val.ytdYachtPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Spa & Wellness Programs</td>
                <td class="text-right">${fmt(val.spaRevenues)}</td>
                <td class="text-right">${pct(val.spaRevenuesPct)}</td>
                <td class="text-right">${fmt(val.ytdSpa)}</td>
                <td class="text-right">${pct(val.ytdSpaPct)}</td>
              </tr>
              ${val.otherRevenues > 0 ? `
              <tr>
                <td style="padding-left: 20px;">Boutique & Retail POS Sales</td>
                <td class="text-right">${fmt(val.otherRevenues)}</td>
                <td class="text-right">${pct(val.otherRevenuesPct)}</td>
                <td class="text-right">${fmt(val.ytdOther)}</td>
                <td class="text-right">${pct(val.ytdOtherPct)}</td>
              </tr>
              ` : ''}
              <tr class="total-row">
                <td style="text-transform: uppercase;">Gross Operating Revenue</td>
                <td class="text-right">${fmt(val.grossRevenue)}</td>
                <td class="text-right">100.0%</td>
                <td class="text-right">${fmt(val.ytdGrossRevenue)}</td>
                <td class="text-right">100.0%</td>
              </tr>
              
              <!-- COGS -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Cost of Goods Sold (COGS)</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">F&amp;B Supplies &amp; Consumables</td>
                <td class="text-right">${fmt(val.cogsWine)}</td>
                <td class="text-right">${pct(val.cogsWinePct)}</td>
                <td class="text-right">${fmt(val.ytdCogsWine)}</td>
                <td class="text-right">${pct(val.ytdCogsWinePct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Resort Utilities &amp; Fuel</td>
                <td class="text-right">${fmt(val.cogsFuel)}</td>
                <td class="text-right">${pct(val.cogsFuelPct)}</td>
                <td class="text-right">${fmt(val.ytdCogsFuel)}</td>
                <td class="text-right">${pct(val.ytdCogsFuelPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Spa & Wellness Materials</td>
                <td class="text-right">${fmt(val.cogsSpa)}</td>
                <td class="text-right">${pct(val.cogsSpaPct)}</td>
                <td class="text-right">${fmt(val.ytdCogsSpa)}</td>
                <td class="text-right">${pct(val.ytdCogsSpaPct)}</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Total Cost of Goods Sold</td>
                <td class="text-right">${fmt(val.totalCOGS)}</td>
                <td class="text-right">${pct(val.totalCOGSPct)}</td>
                <td class="text-right">${fmt(val.ytdTotalCOGS)}</td>
                <td class="text-right">${pct(val.ytdTotalCOGSPct)}</td>
              </tr>

              <!-- GROSS PROFIT -->
              <tr class="total-row" style="background: #F7FAFC;">
                <td style="text-transform: uppercase; font-weight: 700;">Gross Profit</td>
                <td class="text-right font-bold">${fmt(val.grossProfit)}</td>
                <td class="text-right font-bold">${pct(val.grossProfitPct)}</td>
                <td class="text-right font-bold">${fmt(val.ytdGrossProfit)}</td>
                <td class="text-right font-bold">${pct(val.ytdGrossProfitPct)}</td>
              </tr>
              
              <!-- SGA -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Undistributed Operating Expenses (SGA)</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Staff Salaries & Benefits</td>
                <td class="text-right">${fmt(val.sgaSalaries)}</td>
                <td class="text-right">${pct(val.sgaSalariesPct)}</td>
                <td class="text-right">${fmt(val.ytdSgaSalaries)}</td>
                <td class="text-right">${pct(val.ytdSgaSalariesPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Utilities, Infrastructure & IT</td>
                <td class="text-right">${fmt(val.sgaUtilities)}</td>
                <td class="text-right">${pct(val.sgaUtilitiesPct)}</td>
                <td class="text-right">${fmt(val.ytdSgaUtilities)}</td>
                <td class="text-right">${pct(val.ytdSgaUtilitiesPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Operations Wages &amp; Overhead Maintenance</td>
                <td class="text-right">${fmt(val.sgaYachtCrew)}</td>
                <td class="text-right">${pct(val.sgaYachtCrewPct)}</td>
                <td class="text-right">${fmt(val.ytdSgaYachtCrew)}</td>
                <td class="text-right">${pct(val.ytdSgaYachtCrewPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Spa & Wellness Operations Staffing</td>
                <td class="text-right">${fmt(val.sgaSpaStaff)}</td>
                <td class="text-right">${pct(val.sgaSpaStaffPct)}</td>
                <td class="text-right">${fmt(val.ytdSgaSpaStaff)}</td>
                <td class="text-right">${pct(val.ytdSgaSpaStaffPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Maintenance & Facility Upkeep</td>
                <td class="text-right">${fmt(val.sgaMaintenance)}</td>
                <td class="text-right">${pct(val.sgaMaintenancePct)}</td>
                <td class="text-right">${fmt(val.ytdSgaMaintenance)}</td>
                <td class="text-right">${pct(val.ytdSgaMaintenancePct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Administration, Guest Acquisition & Marketing</td>
                <td class="text-right">${fmt(val.sgaMarketing)}</td>
                <td class="text-right">${pct(val.sgaMarketingPct)}</td>
                <td class="text-right">${fmt(val.ytdSgaMarketing)}</td>
                <td class="text-right">${pct(val.ytdSgaMarketingPct)}</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Total SGA Expenses</td>
                <td class="text-right" style="color: #C53030;">${fmt(val.totalSGA)}</td>
                <td class="text-right">${pct(val.totalSGAPct)}</td>
                <td class="text-right" style="color: #C53030;">${fmt(val.ytdTotalSGA)}</td>
                <td class="text-right">${pct(val.ytdTotalSGAPct)}</td>
              </tr>
              
              <!-- EBITDA -->
              <tr class="noi-row" style="background: #F7FAFC;">
                <td style="text-transform: uppercase; font-weight: 700; color: #1A365D;">Gross Operating Profit (EBITDA)</td>
                <td class="text-right font-bold" style="color: #1A365D;">${fmt(val.ebitda)}</td>
                <td class="text-right font-bold" style="color: #1A365D;">${pct(val.ebitdaPct)}</td>
                <td class="text-right font-bold" style="color: #1A365D;">${fmt(val.ytdEbitda)}</td>
                <td class="text-right font-bold" style="color: #1A365D;">${pct(val.ytdEbitdaPct)}</td>
              </tr>

              <!-- FIXED CHARGES -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Fixed Charges</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Property Insurance & Taxes</td>
                <td class="text-right">${fmt(val.fixedInsurance)}</td>
                <td class="text-right">${pct(val.fixedInsurancePct)}</td>
                <td class="text-right">${fmt(val.ytdFixedInsurance)}</td>
                <td class="text-right">${pct(val.ytdFixedInsurancePct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Management & Brand Franchise Fees</td>
                <td class="text-right">${fmt(val.fixedFees)}</td>
                <td class="text-right">${pct(val.fixedFeesPct)}</td>
                <td class="text-right">${fmt(val.ytdFixedFees)}</td>
                <td class="text-right">${pct(val.ytdFixedFeesPct)}</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Total Fixed Charges</td>
                <td class="text-right">${fmt(val.totalFixed)}</td>
                <td class="text-right">${pct(val.totalFixedPct)}</td>
                <td class="text-right">${fmt(val.ytdTotalFixed)}</td>
                <td class="text-right">${pct(val.ytdTotalFixedPct)}</td>
              </tr>

              <!-- NOI -->
              <tr class="noi-row" style="background: #F7FAFC;">
                <td style="text-transform: uppercase; font-weight: 700;">Net Operating Income (NOI)</td>
                <td class="text-right font-bold">${fmt(val.noi)}</td>
                <td class="text-right font-bold">${pct(val.noiPct)}</td>
                <td class="text-right font-bold">${fmt(val.ytdNoi)}</td>
                <td class="text-right font-bold">${pct(val.ytdNoiPct)}</td>
              </tr>

              <!-- NON-OPERATING -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Non-Operating Expenses / Taxes</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Mortgage & Debt Interest Expense</td>
                <td class="text-right">${fmt(val.nonOpMortgage)}</td>
                <td class="text-right">${pct(val.nonOpMortgagePct)}</td>
                <td class="text-right">${fmt(val.ytdNonOpMortgage)}</td>
                <td class="text-right">${pct(val.ytdNonOpMortgagePct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Depreciation & Capital Amortization</td>
                <td class="text-right">${fmt(val.nonOpDepr)}</td>
                <td class="text-right">${pct(val.nonOpDeprPct)}</td>
                <td class="text-right">${fmt(val.ytdNonOpDepr)}</td>
                <td class="text-right">${pct(val.ytdNonOpDeprPct)}</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Corporate Taxes</td>
                <td class="text-right">${fmt(val.nonOpTaxes)}</td>
                <td class="text-right">${pct(val.nonOpTaxesPct)}</td>
                <td class="text-right">${fmt(val.ytdNonOpTaxes)}</td>
                <td class="text-right">${pct(val.ytdNonOpTaxesPct)}</td>
              </tr>

              <!-- NET INCOME -->
              <tr class="net-income-row">
                <td style="text-transform: uppercase;">Net Income</td>
                <td class="text-right">${fmt(val.netIncome)}</td>
                <td class="text-right">${pct(val.netIncomePct)}</td>
                <td class="text-right">${fmt(val.ytdNetIncome)}</td>
                <td class="text-right">${pct(val.ytdNetIncomePct)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="section-title">Active Guest Reservations Ledger</div>
          <table class="reservation-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Villa</th>
                <th>Dates</th>
                <th>Booking Status</th>
                <th>Payment Status</th>
                <th class="text-right">Folio (â‚±)</th>
              </tr>
            </thead>
            <tbody>
              ${activeReservations.map(res => `
                <tr>
                  <td><strong>${res.guest}</strong></td>
                  <td>${res.villaName} (${res.villa})</td>
                  <td>${res.dates}</td>
                  <td>${res.bookingStatus}</td>
                  <td>${res.paymentStatus}</td>
                  <td class="text-right"><strong>â‚±${res.folio}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 40px; font-size: 11px; color: #718096; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 15px;">
            CONFIDENTIAL - FOR OWNER & EXECUTIVE REVIEW ONLY. DO NOT DISTRIBUTE.
          </div>
          
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
        </html>
      `;
      
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    });
  }

  // 10. Operations Clock in Banner Header
  function updateClock() {
    const timeEl = document.getElementById('banner-clock-time');
    const dateEl = document.getElementById('banner-clock-date');
    if (!timeEl || !dateEl) return;

    const now = new Date();
    
    // Time format: HH:MM:SS AM/PM
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // key correction for 12 hours
    const hoursStr = String(hours).padStart(2, '0');
    
    timeEl.textContent = `${hoursStr}:${minutes}:${seconds} ${ampm}`;
    
    // Date format: Saturday, June 20, 2026
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }
  
  setInterval(updateClock, 1000);
  updateClock(); // Initial clock trigger

  // 11. Unified Control Panel Context Filtering & Search
  window.renderGlobalFilters = function(viewId) {
    const controlPanel = document.getElementById('ops-view-control-panel');
    const filterSelect = document.getElementById('global-filter-select');
    const filterSelect2 = document.getElementById('global-filter-select-2');
    const select2Wrapper = document.getElementById('filter-select-2-wrapper');
    
    // Reset search input value when switching tabs
    if (globalSearchInput) {
      globalSearchInput.value = '';
      let searchPlaceholder = 'Search...';
      if (viewId === 'assignments') searchPlaceholder = 'Search suites...';
      else if (viewId === 'special') searchPlaceholder = 'Search amenities...';
      else if (viewId === 'ledger') searchPlaceholder = 'Search invoices...';
      else if (viewId === 'maintenance') searchPlaceholder = 'Search tickets...';
      else if (viewId === 'knowledge') searchPlaceholder = 'Search articles...';
      globalSearchInput.placeholder = searchPlaceholder;
    }
    
    resetAllViewFilters();

    const viewsWithControls = ['assignments', 'special', 'ledger', 'maintenance', 'knowledge'];
    if (viewsWithControls.includes(viewId)) {
      // Show control panel
      if (controlPanel) {
        controlPanel.classList.remove('hidden');
        controlPanel.classList.add('flex');
      }
      
      // Manage filterSelect2 wrapper visibility
      if (viewId === 'ledger') {
        if (select2Wrapper) {
          select2Wrapper.classList.remove('hidden');
          select2Wrapper.classList.add('flex');
        }
      } else {
        if (select2Wrapper) {
          select2Wrapper.classList.add('hidden');
          select2Wrapper.classList.remove('flex');
        }
      }
      
      // Populate select options
      if (filterSelect) {
        filterSelect.innerHTML = '';
        
        let options = [];
        if (viewId === 'assignments') {
          options = [
            { label: 'All Rooms', value: 'all' },
            { label: 'Ready', value: 'vacant' },
            { label: 'Occupied', value: 'occupied' },
            { label: 'Cleaning', value: 'cleaning' },
            { label: 'Maint. Hold', value: 'hold' }
          ];
        } else if (viewId === 'special') {
          options = [
            { label: 'All Bookings', value: 'all' },
            { label: 'Confirmed', value: 'Confirmed' },
            { label: 'Scheduled', value: 'Scheduled' },
            { label: 'Pending verification', value: 'Pending verification' },
            { label: 'Cleared', value: 'Cleared' },
            { label: 'Stocked', value: 'Stocked' }
          ];
        } else if (viewId === 'ledger') {
          options = [
            { label: 'All Payments', value: 'all' },
            { label: 'UNPAID', value: 'UNPAID' },
            { label: 'PARTIAL', value: 'PARTIAL' },
            { label: 'FULL', value: 'FULL' }
          ];
        } else if (viewId === 'maintenance') {
          options = [
            { label: 'All Tickets', value: 'all' },
            { label: 'HIGH', value: 'HIGH' },
            { label: 'MEDIUM', value: 'MEDIUM' },
            { label: 'LOW', value: 'LOW' }
          ];
        } else if (viewId === 'knowledge') {
          options = [
            { label: 'Accommodations', value: 'accommodations' },
            { label: 'Special Services', value: 'services' },
            { label: 'Rules & Policies', value: 'rules' }
          ];
        }
        
        options.forEach(opt => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          filterSelect.appendChild(optionEl);
        });
      }

      if (viewId === 'ledger' && filterSelect2) {
        filterSelect2.innerHTML = '';
        const options2 = [
          { label: 'All Bookings', value: 'all' },
          { label: 'Confirmed', value: 'Confirmed' },
          { label: 'Checked In', value: 'Checked In' },
          { label: 'Checked Out', value: 'Checked Out' },
          { label: 'Cancelled', value: 'Cancelled' }
        ];
        options2.forEach(opt => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          filterSelect2.appendChild(optionEl);
        });
      }
      
      // Execute initial tab filter render
      applyFilters();
    } else {
      // Hide control panel
      if (controlPanel) {
        controlPanel.classList.add('hidden');
        controlPanel.classList.remove('flex');
      }
    }
  };

  function resetAllViewFilters() {
    // Room rows reset
    document.querySelectorAll('.gantt-row').forEach(row => row.classList.remove('hidden'));
    const mediumContainer = document.getElementById('gantt-medium-container');
    if (mediumContainer) mediumContainer.classList.remove('hidden');
    const largeContainer = document.getElementById('gantt-large-container');
    if (largeContainer) largeContainer.classList.remove('hidden');
    // Ledger rows reset
    document.querySelectorAll('#view-ledger tbody tr').forEach(row => row.classList.remove('hidden'));
    // Special bookings reset
    document.querySelectorAll('#special-bookings-table tbody tr').forEach(row => row.classList.remove('hidden'));
    // Maintenance blockouts reset
    document.querySelectorAll('#maintenance-blockouts-table tbody tr').forEach(row => row.classList.remove('hidden'));
    // Maintenance tickets reset
    document.querySelectorAll('#maintenance-tickets-table tbody tr').forEach(row => row.classList.remove('hidden'));
    // Knowledge base cards reset
    document.querySelectorAll('.knowledge-card').forEach(card => card.classList.remove('hidden'));
  }

  // Gantt Chart Rendering Engine
  window.renderGanttChart = function() {
    const ganttRowsMedium = document.getElementById('gantt-rows-medium');
    const ganttRowsLarge = document.getElementById('gantt-rows-large');
    const ganttHeadersDays = document.querySelectorAll('.gantt-header-days');
    
    if (!ganttRowsMedium || !ganttRowsLarge) return;
    
    const offsetDiff = Math.round((ganttStartDate - operationalStartDate) / (1000 * 60 * 60 * 24));
    
    // Update timeline display range label
    updateTimelineRangeLabel();
    
    // 1. Render day column headers dynamically for both timeline tables
    if (ganttHeadersDays.length > 0) {
      ganttHeadersDays.forEach(headerDays => {
        headerDays.innerHTML = '';
        const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 0; i < 10; i++) {
          const d = new Date(ganttStartDate);
          d.setDate(d.getDate() + i);
          const dayNum = d.getDate();
          const dayName = daysOfWeek[d.getDay()];
          
          const col = document.createElement('div');
          col.className = "flex-1 text-center py-2 border-r border-secondary/15 select-none font-bold flex flex-col justify-center min-w-0";
          
          let labelColor = 'opacity-70';
          if (i === 2) {
            // Highlight current day (June 20)
            col.classList.add('bg-tertiary/10');
            labelColor = 'text-tertiary font-bold';
          } else if (d.getDay() === 0 || d.getDay() === 6) {
            // Weekend highlight
            col.classList.add('bg-surface-variant/20');
          }
          
          col.innerHTML = `${dayNum} <span class="block text-[9px] font-normal ${labelColor}">${dayName}</span>`;
          headerDays.appendChild(col);
        }
      });
    }

    // 2. Render Medium Sized Luxury Villas
    ganttRowsMedium.innerHTML = '';
    const mediumVillas = villas.filter(v => v.category === "Medium Sized Luxury Villa");
    mediumVillas.forEach(villa => {
      const row = document.createElement('div');
      row.className = "gantt-row flex border-b border-secondary/10 hover:bg-surface-variant/10 transition-all items-center min-h-[60px]";
      row.setAttribute('data-villa-id', villa.id);
      
      // Sticky Room name column
      const infoCol = document.createElement('div');
      infoCol.className = "w-52 px-4 py-2 shrink-0 border-r border-secondary/15 flex flex-col justify-center bg-surface select-none";
      infoCol.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-xs font-label-caps text-tertiary font-bold">${villa.id}</span>
          <span class="text-[9px] bg-secondary/15 text-secondary border border-secondary/25 px-1 font-semibold">MD</span>
        </div>
        <span class="text-xs font-semibold text-on-surface leading-tight mt-0.5">${villa.name}</span>
      `;
      row.appendChild(infoCol);
      
      // Responsive timeline column (percentage-based width)
      const trackCol = document.createElement('div');
      trackCol.className = "flex-grow h-full relative flex items-center gantt-track";
      trackCol.style.height = "60px";
      
      // Render gridlines (10 cells)
      const gridlines = document.createElement('div');
      gridlines.className = "absolute inset-0 flex pointer-events-none";
      for (let i = 0; i < 10; i++) {
        const line = document.createElement('div');
        line.className = "flex-1 border-r border-secondary/5 h-full min-w-0";
        if (i === 2) {
          line.classList.add('bg-tertiary/5');
        } else {
          const d = new Date(ganttStartDate);
          d.setDate(d.getDate() + i);
          if (d.getDay() === 0 || d.getDay() === 6) {
            line.classList.add('bg-surface-variant/10');
          }
        }
        gridlines.appendChild(line);
      }
      trackCol.appendChild(gridlines);
      
      // Find reservations for this room
      const villaRes = reservations.filter(res => res.villa === villa.id || (typeof res.villa === 'string' && res.villa.split(', ').includes(villa.id)));
      
      villaRes.forEach(res => {
        const relativeStart = res.startOffset - offsetDiff;
        const relativeEnd = relativeStart + res.duration;
        
        if (relativeStart < 10 && relativeEnd > 0) {
          const dispStart = Math.max(0, relativeStart);
          const dispEnd = Math.min(10, relativeEnd);
          const dispDuration = dispEnd - dispStart;
          
          const pill = document.createElement('div');
          
          let pillClass = '';
          let statusText = res.bookingStatus;
          if (res.isBlockout) {
            if (res.bookingStatus === 'Cleaning') {
              pillClass = 'bg-alert-orange text-[#FAF6EE] dark:text-[#070D19] border-alert-orange';
              statusText = 'Housekeeping';
            } else {
              pillClass = 'bg-alert-red text-[#FAF6EE] border-alert-red';
              statusText = 'Maint. Hold';
            }
          } else {
            if (res.bookingStatus === 'Checked In') {
              pillClass = 'bg-mint-active text-[#FAF6EE] dark:text-[#070D19] border-mint-active';
            } else if (res.bookingStatus === 'Checked Out') {
              pillClass = 'bg-secondary text-[#FAF6EE] dark:text-[#070D19] border-secondary';
            } else if (res.bookingStatus === 'Cancelled') {
              pillClass = 'bg-alert-red text-[#FAF6EE] border-alert-red';
            } else {
              // Confirmed
              pillClass = 'bg-tertiary text-[#070D19] border-tertiary';
            }
          }
          
          pill.className = `absolute h-10 border flex items-center justify-between px-3 text-xs cursor-pointer select-none transition-all hover:brightness-110 font-medium ${pillClass}`;
          
          pill.style.left = `calc(${dispStart * 10}% + 4px)`;
          pill.style.width = `calc(${dispDuration * 10}% - 8px)`;
          pill.style.zIndex = "5";
          pill.style.borderRadius = "0px";
          
          const startClipped = relativeStart < 0;
          const endClipped = relativeEnd > 10;
          
          let displayLabel = `<span class="truncate font-bold">${res.guest}</span>`;
          if (startClipped) {
            displayLabel = `<span class="material-symbols-outlined text-[10px] mr-0.5 select-none opacity-75">arrow_left</span>` + displayLabel;
          }
          if (endClipped) {
            displayLabel = displayLabel + `<span class="material-symbols-outlined text-[10px] ml-0.5 select-none opacity-75">arrow_right</span>`;
          }
          
          pill.innerHTML = `
            <div class="flex items-center min-w-0 truncate mr-1">
              ${displayLabel}
            </div>
            <span class="text-[9px] uppercase tracking-wider font-semibold opacity-85 ml-1 shrink-0">${statusText}</span>
          `;
          
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditBookingModal(res);
          });
          
          trackCol.appendChild(pill);
        }
      });
      
      // Add double-click handler on the track to create blockouts or cycle status for the clicked day
      trackCol.addEventListener('dblclick', (e) => {
        const rect = trackCol.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const colIndex = Math.floor(clickX / rect.width * 10);
        if (colIndex >= 0 && colIndex < 10) {
          handleGridDoubleClick(villa.id, colIndex);
        }
      });
      
      row.appendChild(trackCol);
      ganttRowsMedium.appendChild(row);
    });

    // 3. Render Large Luxury Villas (with extra premium spacing and custom left border accents)
    ganttRowsLarge.innerHTML = '';
    const largeVillas = villas.filter(v => v.category === "Large Luxury Villa");
    largeVillas.forEach(villa => {
      const row = document.createElement('div');
      row.className = "gantt-row flex border-b border-secondary/10 hover:bg-surface-variant/15 transition-all items-center min-h-[66px]";
      row.setAttribute('data-villa-id', villa.id);
      
      // Sticky Room name column (no side border accent)
      const infoCol = document.createElement('div');
      infoCol.className = "w-52 px-4 py-2 shrink-0 border-r border-secondary/15 flex flex-col justify-center bg-surface select-none";
      infoCol.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-xs font-label-caps text-tertiary font-bold">${villa.id}</span>
          <span class="text-[9px] bg-tertiary/15 text-tertiary border border-tertiary/25 px-1 font-bold">LG</span>
        </div>
        <span class="text-xs font-semibold text-on-surface leading-tight mt-0.5">${villa.name}</span>
      `;
      row.appendChild(infoCol);
      
      // Responsive timeline column (percentage-based width)
      const trackCol = document.createElement('div');
      trackCol.className = "flex-grow h-full relative flex items-center gantt-track";
      trackCol.style.height = "66px";
      
      // Render gridlines (10 cells)
      const gridlines = document.createElement('div');
      gridlines.className = "absolute inset-0 flex pointer-events-none";
      for (let i = 0; i < 10; i++) {
        const line = document.createElement('div');
        line.className = "flex-1 border-r border-secondary/5 h-full min-w-0";
        if (i === 2) {
          line.classList.add('bg-tertiary/5');
        } else {
          const d = new Date(ganttStartDate);
          d.setDate(d.getDate() + i);
          if (d.getDay() === 0 || d.getDay() === 6) {
            line.classList.add('bg-surface-variant/10');
          }
        }
        gridlines.appendChild(line);
      }
      trackCol.appendChild(gridlines);
      
      // Find reservations for this room
      const villaRes = reservations.filter(res => res.villa === villa.id || (typeof res.villa === 'string' && res.villa.split(', ').includes(villa.id)));
      
      villaRes.forEach(res => {
        const relativeStart = res.startOffset - offsetDiff;
        const relativeEnd = relativeStart + res.duration;
        
        if (relativeStart < 10 && relativeEnd > 0) {
          const dispStart = Math.max(0, relativeStart);
          const dispEnd = Math.min(10, relativeEnd);
          const dispDuration = dispEnd - dispStart;
          
          const pill = document.createElement('div');
          
          let pillClass = '';
          let statusText = res.bookingStatus;
          if (res.isBlockout) {
            if (res.bookingStatus === 'Cleaning') {
              pillClass = 'bg-alert-orange text-[#FAF6EE] dark:text-[#070D19] border-alert-orange';
              statusText = 'Housekeeping';
            } else {
              pillClass = 'bg-alert-red text-[#FAF6EE] border-alert-red';
              statusText = 'Maint. Hold';
            }
          } else {
            if (res.bookingStatus === 'Checked In') {
              pillClass = 'bg-mint-active text-[#FAF6EE] dark:text-[#070D19] border-mint-active';
            } else if (res.bookingStatus === 'Checked Out') {
              pillClass = 'bg-secondary text-[#FAF6EE] dark:text-[#070D19] border-secondary';
            } else if (res.bookingStatus === 'Cancelled') {
              pillClass = 'bg-alert-red text-[#FAF6EE] border-alert-red';
            } else {
              // Confirmed
              pillClass = 'bg-tertiary text-[#070D19] border-tertiary';
            }
          }
          
          pill.className = `absolute h-10 border flex items-center justify-between px-3 text-xs cursor-pointer select-none transition-all hover:brightness-110 font-medium ${pillClass}`;
          
          pill.style.left = `calc(${dispStart * 10}% + 4px)`;
          pill.style.width = `calc(${dispDuration * 10}% - 8px)`;
          pill.style.zIndex = "5";
          pill.style.borderRadius = "0px";
          
          const startClipped = relativeStart < 0;
          const endClipped = relativeEnd > 10;
          
          let displayLabel = `<span class="truncate font-bold">${res.guest}</span>`;
          if (startClipped) {
            displayLabel = `<span class="material-symbols-outlined text-[10px] mr-0.5 select-none opacity-75">arrow_left</span>` + displayLabel;
          }
          if (endClipped) {
            displayLabel = displayLabel + `<span class="material-symbols-outlined text-[10px] ml-0.5 select-none opacity-75">arrow_right</span>`;
          }
          
          pill.innerHTML = `
            <div class="flex items-center min-w-0 truncate mr-1">
              ${displayLabel}
            </div>
            <span class="text-[9px] uppercase tracking-wider font-semibold opacity-85 ml-1 shrink-0">${statusText}</span>
          `;
          
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditBookingModal(res);
          });
          
          trackCol.appendChild(pill);
        }
      });
      
      // Add double-click handler on the track to create blockouts or cycle status for the clicked day
      trackCol.addEventListener('dblclick', (e) => {
        const rect = trackCol.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const colIndex = Math.floor(clickX / rect.width * 10);
        if (colIndex >= 0 && colIndex < 10) {
          handleGridDoubleClick(villa.id, colIndex);
        }
      });
      
      row.appendChild(trackCol);
      ganttRowsLarge.appendChild(row);
    });
  };

  function handleGridDoubleClick(villaId, colIndex) {
    const offsetDiff = Math.round((ganttStartDate - operationalStartDate) / (1000 * 60 * 60 * 24));
    const absoluteOffset = colIndex + offsetDiff;

    // Check if there is an overlapping reservation or blockout on this day
    const overlapIndex = reservations.findIndex(res => 
      (res.villa === villaId || (typeof res.villa === 'string' && res.villa.split(', ').includes(villaId))) && 
      absoluteOffset >= res.startOffset && 
      absoluteOffset < (res.startOffset + res.duration)
    );
    
    const villa = villas.find(v => v.id === villaId);
    
    if (overlapIndex !== -1) {
      const res = reservations[overlapIndex];
      if (res.isBlockout) {
        if (res.bookingStatus === 'Cleaning') {
          // Rotate to Maint. Hold
          res.bookingStatus = 'Maint. Hold';
          res.guest = `Maintenance: Repair`;
        } else {
          // Remove blockout
          reservations.splice(overlapIndex, 1);
        }
        renderGanttChart();
        renderMaintenanceBlockouts();
        applyFilters();
      }
    } else {
      // Create new 1-day cleaning blockout
      const dateStr = getDatesFromAbsoluteOffset(absoluteOffset, 1);
      reservations.push({
        id: "block-" + villaId + "-" + absoluteOffset + "-" + Date.now(),
        guest: "Housekeeping: In Progress",
        villa: villaId,
        villaName: villa ? villa.name : "",
        dates: dateStr,
        created: "June 20, 2026",
        bookingStatus: "Cleaning",
        paymentStatus: "PAID",
        baseRate: 0,
        addonWine: false,
        addonYacht: false,
        addonSpa: false,
        addonChef: false,
        folio: "0.00",
        startOffset: absoluteOffset,
        duration: 1,
        isBlockout: true
      });
      renderGanttChart();
      renderMaintenanceBlockouts();
      applyFilters();
    }
  }

  function getDatesFromOffset(offset, duration) {
    const start = new Date(ganttStartDate);
    start.setDate(start.getDate() + offset);
    
    const end = new Date(start);
    end.setDate(end.getDate() + duration);
    
    return `June ${start.getDate()} - June ${end.getDate()}`;
  }

  function generateTransactions() {
    const txList = [];
    reservations.forEach(res => {
      if (res.isBlockout) return;
      
      const dateObj = new Date(operationalStartDate.getTime());
      dateObj.setDate(dateObj.getDate() + res.startOffset);
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      // 1. Room Lodging Base Rate transaction
      txList.push({
        timestamp: `${dateStr} 02:00 PM`,
        guest: res.guest,
        villa: res.villa,
        description: "Lodging Base Rate Charge",
        type: "Room Charges",
        amount: `â‚±${res.baseRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        status: res.paymentStatus === 'FULL' ? 'Settled' : 'Pending',
        resId: res.id
      });
      
      // 2. Add-on transactions
      const addons = [
        { key: 'addonWine', label: 'Welcome Drink Package', price: 1500 },
        { key: 'addonYacht', label: 'Pool Cabana Rental', price: 1500 },
        { key: 'addonSpa', label: 'Massage Treatment', price: 1500 },
        { key: 'addonChef', label: 'Dinner Buffet Package', price: 1200 }
      ];
      
      addons.forEach(addon => {
        if (res[addon.key]) {
          const addonDate = new Date(dateObj.getTime());
          addonDate.setDate(addonDate.getDate() + 1);
          const addonDateStr = addonDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          
          txList.push({
            timestamp: `${addonDateStr} 10:00 AM`,
            guest: res.guest,
            villa: res.villa,
            description: addon.label,
            type: "Services",
            amount: `â‚±${addon.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            status: res.paymentStatus === 'FULL' ? 'Settled' : 'Pending',
            resId: res.id
          });
        }
      });

      // 3. POS Room-Charged items
      if (res.posCharges && res.posCharges.length > 0) {
        res.posCharges.forEach(charge => {
          txList.push({
            timestamp: charge.date.includes(':') ? charge.date : `${charge.date} 05:00 PM`,
            guest: res.guest,
            villa: res.villa,
            description: `Room Charge: ${charge.name}`,
            type: "POS Charge",
            amount: `â‚±${charge.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            status: res.paymentStatus === 'FULL' ? 'Settled' : 'Pending',
            resId: res.id
          });
        });
      }
    });

    // 4. POS Direct Walk-in cashier sales
    posSales.forEach(sale => {
      let displayDate = sale.date;
      if (sale.date.includes('-')) {
        const [y, m, d] = sale.date.split('-');
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        displayDate = `${monthNames[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
      }
      const itemDesc = sale.items.map(it => `${it.name} (${it.qty}x)`).join(', ');
      
      txList.push({
        timestamp: `${displayDate} 04:00 PM`,
        guest: sale.guest || "Walk-in Guest",
        villa: sale.villa || "N/A",
        description: `Direct Sale: ${itemDesc}`,
        type: "POS Direct",
        amount: `â‚±${sale.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        status: "Settled",
        resId: sale.resId || null
      });
    });
    
    // Sort transactions by date (descending)
    txList.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    return txList;
  }

  // --- REDESIGNED OVERVIEW HUB HELPERS ---

  // 1. Dynamic KPI calculations
  window.updateOverviewKPIs = function() {
    const totalRooms = villas.length || 6;
    const occupiedRooms = reservations.filter(res => !res.isBlockout && res.bookingStatus === 'Checked In').length;
    const occupancyPercentage = Math.round((occupiedRooms / totalRooms) * 100);
    
    const overviewOccupancyRate = document.getElementById('overview-occupancy-rate');
    const overviewOccupancyFraction = document.getElementById('overview-occupancy-fraction');
    if (overviewOccupancyRate) overviewOccupancyRate.textContent = `${occupancyPercentage}%`;
    if (overviewOccupancyFraction) overviewOccupancyFraction.textContent = `${occupiedRooms} of ${totalRooms} Suites Active`;

    // Receivables sum (dynamic from unpaid reservations)
    const unpaidFolios = reservations.filter(res => !res.isBlockout && res.paymentStatus !== 'FULL');
    const receivablesSum = unpaidFolios.reduce((sum, res) => {
      const val = parseFloat(res.folio.replace(/,/g, '')) || 0;
      return sum + val;
    }, 0);
    
    const overviewReceivablesVal = document.getElementById('overview-receivables-val');
    if (overviewReceivablesVal) {
      overviewReceivablesVal.textContent = receivablesSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      overviewReceivablesVal.setAttribute('data-original', overviewReceivablesVal.textContent);
      
      // Obscure if privacy mode is active
      const isObscured = privacyCheckbox ? privacyCheckbox.checked : false;
      if (isObscured) {
        overviewReceivablesVal.textContent = 'â€¢â€¢,â€¢â€¢â€¢.â€¢â€¢';
      }
    }

    // Pending verification slips count
    const pendingSlipsCount = document.querySelectorAll('#verifications-list .active-verification-card:not(.opacity-60)').length;
    const badgeVerif = document.getElementById('overview-badge-verification');
    if (badgeVerif) {
      badgeVerif.textContent = pendingSlipsCount;
    }

    // Active Maintenance blockouts count
    const maintHoldsCount = reservations.filter(res => res.isBlockout && res.bookingStatus === 'Maintenance Hold').length;
    const badgeTickets = document.getElementById('overview-badge-tickets');
    if (badgeTickets) {
      badgeTickets.textContent = maintHoldsCount;
    }
    const holdsSubtitle = document.getElementById('overview-holds-subtitle');
    if (holdsSubtitle) {
      const maintVillas = reservations.filter(res => res.isBlockout && res.bookingStatus === 'Maintenance Hold').map(res => res.villa);
      holdsSubtitle.textContent = maintVillas.length > 0 ? `${maintVillas.join(', ')} Maintenance` : "No Active Holds";
    }
  };

  // 2. Guest Flow Roster Populator (Next 5 Days)
  window.updateOverviewRoster = function() {
    const arrivalsContainer = document.getElementById('overview-arrivals-list');
    const departuresContainer = document.getElementById('overview-departures-list');
    if (!arrivalsContainer || !departuresContainer) return;

    arrivalsContainer.innerHTML = '';
    departuresContainer.innerHTML = '';

    // Confirmed bookings are upcoming arrivals
    const arrivalsList = reservations.filter(res => !res.isBlockout && res.bookingStatus === 'Confirmed');
    if (arrivalsList.length === 0) {
      arrivalsContainer.innerHTML = '<span class="text-xs text-on-surface-variant italic">No upcoming arrivals</span>';
    } else {
      arrivalsList.forEach(res => {
        const item = document.createElement('div');
        item.className = "flex justify-between items-center text-xs py-1 border-b border-secondary/5";
        item.innerHTML = `
          <span class="font-semibold text-on-surface hover:text-tertiary cursor-pointer transition-colors" onclick="openEditBookingModalByID('${res.id}')">${res.guest}</span>
          <span class="text-on-surface-variant font-mono-data text-[10px]">${res.dates.split(' - ')[0]} (${res.villa})</span>
        `;
        arrivalsContainer.appendChild(item);
      });
    }

    // Checked-in bookings are active stays (checking out next)
    const departuresList = reservations.filter(res => !res.isBlockout && res.bookingStatus === 'Checked In');
    if (departuresList.length === 0) {
      departuresContainer.innerHTML = '<span class="text-xs text-on-surface-variant italic">No active stays</span>';
    } else {
      departuresList.forEach(res => {
        const item = document.createElement('div');
        item.className = "flex justify-between items-center text-xs py-1 border-b border-secondary/5";
        item.innerHTML = `
          <span class="font-semibold text-on-surface hover:text-tertiary cursor-pointer transition-colors" onclick="openEditBookingModalByID('${res.id}')">${res.guest}</span>
          <span class="text-on-surface-variant font-mono-data text-[10px]">Out: ${res.dates.split(' - ')[1]} (${res.villa})</span>
        `;
        departuresContainer.appendChild(item);
      });
    }
  };

  // Helper to open stay modal by id
  window.openEditBookingModalByID = function(id) {
    const res = reservations.find(r => r.id === id);
    if (res) openEditBookingModal(res);
  };

  // 3. Daily Task Checklist Tracker
  window.initializeTaskTracker = function() {
    const checkboxes = document.querySelectorAll('.daily-task-checkbox');
    const progressEl = document.getElementById('task-tracker-progress');
    if (checkboxes.length === 0) return;

    let savedStates = [];
    try {
      savedStates = JSON.parse(localStorage.getItem('amalfi_daily_tasks')) || [];
    } catch (e) {
      savedStates = [];
    }

    checkboxes.forEach((cb, idx) => {
      const isChecked = !!savedStates[idx];
      cb.checked = isChecked;
      
      const label = cb.closest('label');
      if (label) {
        const spanText = label.querySelector('.task-text');
        if (isChecked) {
          label.classList.add('opacity-50');
          if (spanText) spanText.classList.add('line-through');
        } else {
          label.classList.remove('opacity-50');
          if (spanText) spanText.classList.remove('line-through');
        }
      }

      cb.addEventListener('change', () => {
        const states = Array.from(checkboxes).map(c => c.checked);
        localStorage.setItem('amalfi_daily_tasks', JSON.stringify(states));
        
        const itemLabel = cb.closest('label');
        if (itemLabel) {
          const textEl = itemLabel.querySelector('.task-text');
          if (cb.checked) {
            itemLabel.classList.add('opacity-50');
            if (textEl) textEl.classList.add('line-through');
          } else {
            itemLabel.classList.remove('opacity-50');
            if (textEl) textEl.classList.remove('line-through');
          }
        }
        updateTaskProgress();
      });
    });

    function updateTaskProgress() {
      const total = checkboxes.length;
      const completed = Array.from(checkboxes).filter(c => c.checked).length;
      if (progressEl) {
        progressEl.textContent = `${completed} of ${total} Completed`;
      }
    }

    updateTaskProgress();
  };

  // 4. Quick Controls wiring
  window.initializeQuickControls = function() {
    const overviewPrivacySwitch = document.getElementById('overview-privacy-switch');
    if (overviewPrivacySwitch && privacyCheckbox) {
      overviewPrivacySwitch.checked = privacyCheckbox.checked;
      
      overviewPrivacySwitch.addEventListener('change', (e) => {
        privacyCheckbox.checked = e.target.checked;
        privacyCheckbox.dispatchEvent(new Event('change'));
      });
      
      privacyCheckbox.addEventListener('change', (e) => {
        overviewPrivacySwitch.checked = e.target.checked;
      });
    }

    const btnOverviewCsvExport = document.getElementById('btn-overview-csv-export');
    if (btnOverviewCsvExport) {
      btnOverviewCsvExport.addEventListener('click', () => {
        const btnExportCsv = document.getElementById('btn-export-csv');
        if (btnExportCsv) {
          btnExportCsv.click();
        } else {
          const activeReservations = reservations.filter(res => !res.isBlockout);
          const headers = ["Reservation ID", "Guest Name", "Villa", "Villa Name", "Booking Dates", "Date Created", "Booking Status", "Payment Status", "Folio Value (â‚±)"];
          const rows = activeReservations.map(res => [
            res.id,
            res.guest,
            res.villa,
            res.villaName,
            res.dates,
            res.created,
            res.bookingStatus,
            res.paymentStatus,
            res.folio.replace(/,/g, '')
          ]);
          const csvContent = [headers, ...rows]
            .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
            .join("\n");
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", `amalfi_operations_report_${new Date().toISOString().slice(0,10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      });
    }

    const btnOverviewDispatchMaintenance = document.getElementById('btn-overview-dispatch-maintenance');
    if (btnOverviewDispatchMaintenance && modalTicket) {
      btnOverviewDispatchMaintenance.addEventListener('click', () => {
        modalTicket.classList.remove('hidden');
        modalTicket.classList.add('flex');
      });
    }
  };

  // Active Guest Ledger Rendering Engine
  window.renderLedgerTable = function() {
    // Recalculate metrics dynamically
    let receivablesSum = 0;
    let pendingSum = 0;
    let escrowSum = 150000;
    
    reservations.forEach(res => {
      if (!res.isBlockout && res.bookingStatus !== 'Cancelled') {
        const val = parseFloat(res.folio.replace(/,/g, '')) || 0;
        if (res.paymentStatus !== 'FULL') {
          receivablesSum += val;
        }
        if (res.bookingStatus === 'Checked In') {
          pendingSum += val;
        }
      }
    });

    const metricReceivables = document.getElementById('ledger-metric-receivables');
    if (metricReceivables) {
      metricReceivables.textContent = receivablesSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const metricPending = document.getElementById('ledger-metric-pending');
    if (metricPending) {
      metricPending.textContent = pendingSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const metricEscrow = document.getElementById('ledger-metric-escrow');
    if (metricEscrow) {
      metricEscrow.textContent = escrowSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Compute badge counts
    const activeCount = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled').length;
    const paymentsCount = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled' && res.paymentStatus !== 'FULL').length;
    const upcomingCount = reservations.filter(res => !res.isBlockout && res.bookingStatus === 'Confirmed').length;
    const checkinsCount = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled' && res.startOffset === 2).length;
    const checkoutsCount = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled' && (res.startOffset + res.duration) === 2).length;
    const transactionsList = generateTransactions();
    const transactionsCount = transactionsList.length;
    const pastCount = reservations.filter(res => !res.isBlockout && (res.bookingStatus === 'Checked Out' || res.bookingStatus === 'Cancelled')).length;

    // Set badge text content
    document.getElementById('badge-ledger-active').textContent = activeCount;
    document.getElementById('badge-ledger-payments').textContent = paymentsCount;
    document.getElementById('badge-ledger-upcoming').textContent = upcomingCount;
    document.getElementById('badge-ledger-checkins').textContent = checkinsCount;
    document.getElementById('badge-ledger-checkouts').textContent = checkoutsCount;
    document.getElementById('badge-ledger-transactions').textContent = transactionsCount;
    document.getElementById('badge-ledger-past').textContent = pastCount;

    // Select table elements
    const table = document.querySelector('#view-ledger table');
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    // Clear previous headers/rows
    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Update section title and help text based on tab
    const titleEl = document.querySelector('#view-ledger section h3');
    const descEl = document.getElementById('ledger-help-description-text');

    if (currentLedgerTab === 'transactions') {
      if (titleEl) titleEl.textContent = "Transaction Audit Log";
      if (descEl) descEl.textContent = "Audited ledger log of room base charges and checked premium add-on services.";

      thead.innerHTML = `
        <tr class="border-b border-secondary/20 text-xs font-label-caps text-on-surface-variant animate-fade-in">
          <th class="py-3 pr-4">Timestamp</th>
          <th class="py-3 px-4">Guest</th>
          <th class="py-3 px-4">Villa</th>
          <th class="py-3 px-4">Description</th>
          <th class="py-3 px-4">Type</th>
          <th class="py-3 px-4 text-right">Amount</th>
          <th class="py-3 pl-4 text-right">Status</th>
        </tr>
      `;

      transactionsList.forEach(tx => {
        const row = document.createElement('tr');
        row.className = "ledger-row border-b border-secondary/10 hover:bg-surface-variant/30 transition-all cursor-pointer";
        
        row.innerHTML = `
          <td class="py-4 pr-4 font-mono-data text-xs">${tx.timestamp}</td>
          <td class="py-4 px-4 font-semibold text-on-surface ledger-guest">${tx.guest}</td>
          <td class="py-4 px-4 font-label-caps text-tertiary ledger-room text-xs">${tx.villa}</td>
          <td class="py-4 px-4 text-xs">${tx.description}</td>
          <td class="py-4 px-4 text-xs"><span class="text-secondary border border-secondary/20 px-2 py-0.5">${tx.type}</span></td>
          <td class="py-4 px-4 text-right text-tertiary font-mono-data">${tx.amount}</td>
          <td class="py-4 pl-4 text-right"><span class="ledger-tx-status ${tx.status === 'Settled' ? 'text-mint-active border-mint-active/20' : 'text-alert-orange border-alert-orange/20'} text-xs font-bold border px-2 py-0.5">${tx.status}</span></td>
        `;

        row.addEventListener('click', () => {
          const res = reservations.find(r => r.id === tx.resId);
          if (res) openEditBookingModal(res);
        });

        tbody.appendChild(row);
      });
    } else {
      // Standard Ledger views
      let filteredBookings = [];
      if (currentLedgerTab === 'active') {
        if (titleEl) titleEl.textContent = "Active Guest Ledger";
        if (descEl) descEl.textContent = "Ledger view for booking balance checks, movement, payment review, and archive follow-up.";
        filteredBookings = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled');
      } else if (currentLedgerTab === 'payments') {
        if (titleEl) titleEl.textContent = "Payments Due Ledger";
        if (descEl) descEl.textContent = "Outstanding receivables from guests with active bookings and unpaid balances.";
        filteredBookings = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled' && res.paymentStatus !== 'FULL');
      } else if (currentLedgerTab === 'upcoming') {
        if (titleEl) titleEl.textContent = "Upcoming Arrivals";
        if (descEl) descEl.textContent = "Confirmed arrivals scheduled for future dates at the resort.";
        filteredBookings = reservations.filter(res => !res.isBlockout && res.bookingStatus === 'Confirmed');
      } else if (currentLedgerTab === 'checkins') {
        if (titleEl) titleEl.textContent = "Today's Check Ins";
        if (descEl) descEl.textContent = "Guests expected to check in today (June 20, 2026).";
        filteredBookings = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled' && res.startOffset === 2);
      } else if (currentLedgerTab === 'checkouts') {
        if (titleEl) titleEl.textContent = "Today's Check Outs";
        if (descEl) descEl.textContent = "Guests expected to check out today (June 20, 2026).";
        filteredBookings = reservations.filter(res => !res.isBlockout && res.bookingStatus !== 'Cancelled' && (res.startOffset + res.duration) === 2);
      } else if (currentLedgerTab === 'past') {
        if (titleEl) titleEl.textContent = "Past & Cancelled Bookings";
        if (descEl) descEl.textContent = "Archived records of completed, checked-out, and cancelled guest stays.";
        filteredBookings = reservations.filter(res => !res.isBlockout && (res.bookingStatus === 'Checked Out' || res.bookingStatus === 'Cancelled'));
      }

      thead.innerHTML = `
        <tr class="border-b border-secondary/20 text-xs font-label-caps text-on-surface-variant animate-fade-in">
          <th class="py-3 pr-4">Guest</th>
          <th class="py-3 px-4">Villa Room</th>
          <th class="py-3 px-4">Dates</th>
          <th class="py-3 px-4">Created On</th>
          <th class="py-3 px-4">Booking Status</th>
          <th class="py-3 px-4">Payment Status</th>
          <th class="py-3 pl-4 text-right">Outstanding Folio</th>
        </tr>
      `;

      filteredBookings.forEach(res => {
        const row = document.createElement('tr');
        row.className = "ledger-row border-b border-secondary/10 hover:bg-surface-variant/30 transition-all cursor-pointer";
        row.setAttribute('data-id', res.id);
        
        let bookingColor = 'text-tertiary border-tertiary/20';
        if (res.bookingStatus === 'Checked In') bookingColor = 'text-mint-active border-mint-active/20';
        else if (res.bookingStatus === 'Checked Out') bookingColor = 'text-on-surface-variant border-secondary/20';
        else if (res.bookingStatus === 'Cancelled') bookingColor = 'text-alert-red border-alert-red/20';
        
        let paymentColor = 'text-mint-active border-mint-active/20';
        if (res.paymentStatus === 'UNPAID') paymentColor = 'text-alert-red border-alert-red/20';
        else if (res.paymentStatus === 'PARTIAL') paymentColor = 'text-alert-orange border-alert-orange/20';
        else if (res.paymentStatus === 'FULL') paymentColor = 'text-mint-active border-mint-active/20';
        
        const harringtonStatusId = res.id === 'harrington' ? 'id="harrington-ledger-status"' : '';
        const harringtonValId = res.id === 'harrington' ? 'id="harrington-ledger-val"' : '';
        
        row.innerHTML = `
          <td class="py-4 pr-4 font-semibold text-on-surface ledger-guest">${res.guest}</td>
          <td class="py-4 px-4 font-label-caps text-tertiary ledger-room">${res.villa}</td>
          <td class="py-4 px-4 ledger-dates">${res.dates}</td>
          <td class="py-4 px-4 ledger-created">${res.created}</td>
          <td class="py-4 px-4 ledger-booking-status"><span class="${bookingColor} text-xs font-bold border px-2 py-0.5">${res.bookingStatus.toUpperCase()}</span></td>
          <td class="py-4 px-4 ledger-payment-status" ${harringtonStatusId}><span class="${paymentColor} text-xs font-bold border px-2 py-0.5">${res.paymentStatus}</span></td>
          <td class="py-4 pl-4 text-right font-mono-data text-tertiary">â‚±<span class="ledger-maskable ledger-folio" ${harringtonValId}>${res.folio}</span></td>
        `;
        
        row.addEventListener('click', () => {
          openEditBookingModal(res);
        });
        
        tbody.appendChild(row);
      });
    }

    // Re-apply original folio masking variables
    document.querySelectorAll('.ledger-maskable').forEach(el => {
      el.setAttribute('data-original', el.textContent.trim().replace('â‚±', ''));
    });
    
    const isObscured = privacyCheckbox ? privacyCheckbox.checked : false;
    document.querySelectorAll('.ledger-maskable').forEach(el => {
      if (isObscured) {
        el.textContent = 'â€¢â€¢,â€¢â€¢â€¢.â€¢â€¢';
      } else {
        el.textContent = el.getAttribute('data-original');
      }
    });

    // Update record counts
    updateLedgerRecordCount();

    // Sync Overview Hub dynamic metrics and rosters
    if (typeof updateOverviewKPIs === 'function') updateOverviewKPIs();
    if (typeof updateOverviewRoster === 'function') updateOverviewRoster();
  };

  // Resort Amenities Special Bookings Rendering Engine
  window.renderSpecialBookings = function() {
    if (!specialBookingsTableBody) return;
    specialBookingsTableBody.innerHTML = '';
    
    specialBookings.forEach(sb => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-secondary/10 hover:bg-surface-variant/30 transition-all cursor-pointer";
      
      let statusColor = 'text-tertiary border-tertiary/20';
      if (sb.status === 'Cleared' || sb.status === 'Stocked') statusColor = 'text-mint-active border-mint-active/20';
      else if (sb.status === 'Pending verification') statusColor = 'text-alert-orange border-alert-orange/20';
      else if (sb.status === 'Scheduled') statusColor = 'text-tertiary border-tertiary/20';
      
      tr.innerHTML = `
        <td class="py-4 pr-4 font-mono-data text-xs">${sb.id}</td>
        <td class="py-4 px-4 font-semibold text-on-surface sb-guest">${sb.guest}</td>
        <td class="py-4 px-4 font-label-caps text-tertiary sb-amenity text-xs">${sb.amenity}</td>
        <td class="py-4 px-4 text-xs">${sb.date}</td>
        <td class="py-4 px-4 sb-details text-xs max-w-xs truncate">${sb.details}</td>
        <td class="py-4 px-4 font-mono-data text-tertiary text-xs">â‚±<span class="ledger-maskable">${sb.folio}</span></td>
        <td class="py-4 pl-4 text-right sb-status"><span class="${statusColor} text-xs font-bold border px-2 py-0.5">${sb.status}</span></td>
      `;
      
      tr.addEventListener('click', () => {
        if (sb.status === 'Pending verification') {
          alert(`Special booking ${sb.id} is pending verification. Please clear deposit slip in Receipt Verifications tab.`);
        } else {
          alert(`Special booking details:\nGuest: ${sb.guest}\nService: ${sb.amenity}\nDetails: ${sb.details}\nFolio: â‚±${sb.folio}\nStatus: ${sb.status}`);
        }
      });
      
      specialBookingsTableBody.appendChild(tr);
    });
  };

  // Maintenance Room Blockouts Rendering Engine
  window.renderMaintenanceBlockouts = function() {
    if (!maintenanceBlockoutsTableBody) return;
    maintenanceBlockoutsTableBody.innerHTML = '';
    
    // Filter for only blockout reservations
    const blockouts = reservations.filter(res => res.isBlockout);
    
    if (blockouts.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" class="py-8 text-center text-on-surface-variant text-xs font-semibold">No active room blockings. Double-click empty timeline tracks in Sanctuary Map to create blockouts.</td>`;
      maintenanceBlockoutsTableBody.appendChild(tr);
      return;
    }
    
    blockouts.forEach(res => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-secondary/10 hover:bg-surface-variant/30 transition-all cursor-pointer";
      
      let typeLabel = '';
      let typeColor = '';
      if (res.bookingStatus === 'Cleaning') {
        typeLabel = 'Housekeeping';
        typeColor = 'text-alert-orange border-alert-orange/20';
      } else {
        typeLabel = 'Maintenance Hold';
        typeColor = 'text-alert-red border-alert-red/20';
      }
      
      tr.innerHTML = `
        <td class="py-4 pr-4 font-label-caps text-tertiary font-bold">${res.villa}</td>
        <td class="py-4 px-4"><span class="${typeColor} text-xs font-bold border px-2 py-0.5">${typeLabel}</span></td>
        <td class="py-4 px-4">${res.dates}</td>
        <td class="py-4 px-4 text-xs">${res.guest}</td>
        <td class="py-4 px-4 text-xs">${res.created}</td>
        <td class="py-4 pl-4 text-right"><span class="text-xs font-semibold text-mint-active">Active Blocking</span></td>
      `;
      
      tr.addEventListener('click', () => {
        openEditBookingModal(res);
      });
      
      maintenanceBlockoutsTableBody.appendChild(tr);
    });
  };

  // Open Edit Booking Modal Helper
  window.openEditBookingModal = function(res) {
    const statusSelect = document.getElementById('edit-booking-status');
    const paymentSelect = document.getElementById('edit-booking-payment-status');
    const btnDeleteBooking = document.getElementById('btn-delete-booking');
    const modalTitle = document.querySelector('#modal-edit-booking h4');
    const btnSubmitBooking = document.getElementById('btn-submit-booking');

    const singleContainer = document.getElementById('booking-single-villa-container');
    const multiContainer = document.getElementById('booking-villas-multiselect-container');

    const valContainer = document.getElementById('discount-value-container');
    const promoContainer = document.getElementById('promo-code-container');

    if (res) {
      // EDIT MODE
      document.getElementById('edit-booking-row-id').value = res.id;
      document.getElementById('edit-booking-guest').value = res.guest;
      document.getElementById('edit-booking-created').value = res.created;
      
      // Calculate Check-in and Check-out Date input values
      const checkinDate = new Date(operationalStartDate.getTime());
      checkinDate.setDate(checkinDate.getDate() + res.startOffset);
      document.getElementById('edit-booking-checkin').value = formatDateToYYYYMMDD(checkinDate);
      
      const checkoutDate = new Date(checkinDate.getTime());
      checkoutDate.setDate(checkoutDate.getDate() + res.duration);
      document.getElementById('edit-booking-checkout').value = formatDateToYYYYMMDD(checkoutDate);
      
      const isMulti = res.villa && res.villa.includes(', ');

      // Toggle booking unit mode view state
      if (isMulti) {
        document.querySelector('input[name="booking-unit-mode"][value="multi"]').checked = true;
        singleContainer.classList.add('hidden');
        multiContainer.classList.remove('hidden');
        
        const selectedVillas = res.villa.split(', ');
        document.querySelectorAll('input[name="multi-villa-select"]').forEach(cb => {
          cb.checked = selectedVillas.includes(cb.value);
        });
      } else {
        document.querySelector('input[name="booking-unit-mode"][value="single"]').checked = true;
        singleContainer.classList.remove('hidden');
        multiContainer.classList.add('hidden');
        document.getElementById('edit-booking-villa').value = res.villa;
        
        document.querySelectorAll('input[name="multi-villa-select"]').forEach(cb => {
          cb.checked = false;
        });
      }

      if (res.isBlockout) {
        statusSelect.innerHTML = `
          <option value="Cleaning">Cleaning</option>
          <option value="Maint. Hold">Maint. Hold</option>
          <option value="Confirmed">Confirmed</option>
        `;
        paymentSelect.value = "FULL";
        document.getElementById('edit-booking-manual-override').checked = false;
        document.getElementById('edit-booking-base-rate').value = "0.00";
        document.getElementById('edit-booking-base-rate').setAttribute('readonly', 'true');
        document.getElementById('edit-booking-addon-wine').checked = false;
        document.getElementById('edit-booking-addon-yacht').checked = false;
        document.getElementById('edit-booking-addon-spa').checked = false;
        document.getElementById('edit-booking-addon-chef').checked = false;

        document.getElementById('edit-booking-discount-type').value = 'none';
        document.getElementById('edit-booking-discount-value').value = '0.00';
        document.getElementById('edit-booking-promo-code').value = '';
        if (valContainer) valContainer.classList.add('hidden');
        if (promoContainer) promoContainer.classList.add('hidden');
      } else {
        statusSelect.innerHTML = `
          <option value="Confirmed">Confirmed</option>
          <option value="Checked In">Checked In</option>
          <option value="Checked Out">Checked Out</option>
          <option value="Cancelled">Cancelled</option>
        `;
        paymentSelect.value = res.paymentStatus || "PARTIAL";
        
        const hasOverride = res.manualOverride !== undefined ? !!res.manualOverride : false;
        const overrideCb = document.getElementById('edit-booking-manual-override');
        if (overrideCb) overrideCb.checked = hasOverride;
        
        const baseRateField = document.getElementById('edit-booking-base-rate');
        if (hasOverride) {
          baseRateField.removeAttribute('readonly');
          baseRateField.classList.remove('bg-surface-variant/30', 'cursor-not-allowed', 'text-secondary');
          baseRateField.classList.add('bg-surface');
        } else {
          baseRateField.setAttribute('readonly', 'true');
          baseRateField.classList.add('bg-surface-variant/30', 'cursor-not-allowed', 'text-secondary');
          baseRateField.classList.remove('bg-surface');
        }
        
        const baseVal = res.baseRate !== undefined ? res.baseRate : (parseFloat(res.folio.replace(/,/g, '')) || 0);
        baseRateField.value = baseVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        document.getElementById('edit-booking-addon-wine').checked = !!res.addonWine;
        document.getElementById('edit-booking-addon-yacht').checked = !!res.addonYacht;
        document.getElementById('edit-booking-addon-spa').checked = !!res.addonSpa;
        document.getElementById('edit-booking-addon-chef').checked = !!res.addonChef;

        // Discount fields population
        const discType = res.discountType || 'none';
        document.getElementById('edit-booking-discount-type').value = discType;
        if (discType === 'flat') {
          document.getElementById('edit-booking-discount-value').value = (res.discountValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
          document.getElementById('edit-booking-discount-value').value = res.discountValue || 0;
        }
        document.getElementById('edit-booking-promo-code').value = res.promoCode || '';

        // Toggle container visibility
        if (valContainer && promoContainer) {
          if (discType === 'none') {
            valContainer.classList.add('hidden');
            promoContainer.classList.add('hidden');
          } else if (discType === 'flat' || discType === 'percent') {
            valContainer.classList.remove('hidden');
            promoContainer.classList.add('hidden');
            document.getElementById('discount-value-label').textContent = discType === 'flat' ? 'Discount Amount (â‚±)' : 'Discount Percentage (%)';
            document.getElementById('edit-booking-discount-value').placeholder = discType === 'flat' ? '5,000.00' : '10';
          } else if (discType === 'promo') {
            valContainer.classList.add('hidden');
            promoContainer.classList.remove('hidden');
          }
        }
      }
      statusSelect.value = res.bookingStatus;
      
      if (btnDeleteBooking) {
        btnDeleteBooking.textContent = res.isBlockout ? "Release Blockout" : "Delete Booking";
        btnDeleteBooking.classList.remove('hidden');
      }
      if (modalTitle) {
        modalTitle.textContent = res.isBlockout ? "Edit Blockout Details" : "Edit Booking Details";
      }
      if (btnSubmitBooking) {
        btnSubmitBooking.textContent = "Save Changes";
      }

      // Render POS Billed Charges for this reservation
      const posTableBody = document.querySelector('#booking-pos-charges-table tbody');
      const posTotalEl = document.getElementById('booking-pos-charges-total');
      if (posTableBody && posTotalEl) {
        posTableBody.innerHTML = '';
        res.posCharges = res.posCharges || [];
        
        let posSum = 0;
        if (res.posCharges.length === 0) {
          posTableBody.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-xs text-on-surface-variant italic">No POS billed charges for this stay.</td></tr>';
        } else {
          res.posCharges.forEach(charge => {
            posSum += charge.amount;
            const row = document.createElement('tr');
            row.className = "border-b border-secondary/5";
            row.innerHTML = `
              <td class="py-2 pr-2 font-mono-data text-[10px] text-on-surface-variant">${charge.date}</td>
              <td class="py-2 px-2 font-semibold text-on-surface text-xs">${charge.name}</td>
              <td class="py-2 pl-2 text-right font-mono-data text-tertiary">â‚±${charge.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            `;
            posTableBody.appendChild(row);
          });
        }
        posTotalEl.textContent = `â‚±${posSum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
    } else {
      // ADD MODE
      const posTableBody = document.querySelector('#booking-pos-charges-table tbody');
      const posTotalEl = document.getElementById('booking-pos-charges-total');
      if (posTableBody && posTotalEl) {
        posTableBody.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-xs text-on-surface-variant italic">No POS billed charges for this stay.</td></tr>';
        posTotalEl.textContent = "â‚±0.00";
      }
      document.getElementById('edit-booking-row-id').value = "";
      document.getElementById('edit-booking-guest').value = "";
      
      document.querySelector('input[name="booking-unit-mode"][value="single"]').checked = true;
      singleContainer.classList.remove('hidden');
      multiContainer.classList.add('hidden');
      document.getElementById('edit-booking-villa').value = "Villa 1";
      
      document.querySelectorAll('input[name="multi-villa-select"]').forEach(cb => {
        cb.checked = false;
      });

      const today = new Date();
      const formattedToday = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      document.getElementById('edit-booking-created').value = formattedToday;
      
      // Default stay start is ganttStartDate
      const checkinDate = new Date(ganttStartDate.getTime());
      document.getElementById('edit-booking-checkin').value = formatDateToYYYYMMDD(checkinDate);
      
      // Default stay duration is 3 days
      const checkoutDate = new Date(checkinDate.getTime());
      checkoutDate.setDate(checkoutDate.getDate() + 3);
      document.getElementById('edit-booking-checkout').value = formatDateToYYYYMMDD(checkoutDate);
      
      statusSelect.innerHTML = `
        <option value="Confirmed">Confirmed</option>
        <option value="Checked In">Checked In</option>
        <option value="Checked Out">Checked Out</option>
        <option value="Cancelled">Cancelled</option>
      `;
      statusSelect.value = "Confirmed";
      paymentSelect.value = "PARTIAL";
      
      // Reset override & discounts
      document.getElementById('edit-booking-manual-override').checked = false;
      document.getElementById('edit-booking-base-rate').setAttribute('readonly', 'true');
      document.getElementById('edit-booking-base-rate').classList.add('bg-surface-variant/30', 'cursor-not-allowed', 'text-secondary');
      document.getElementById('edit-booking-base-rate').classList.remove('bg-surface');

      document.getElementById('edit-booking-addon-wine').checked = false;
      document.getElementById('edit-booking-addon-yacht').checked = false;
      document.getElementById('edit-booking-addon-spa').checked = false;
      document.getElementById('edit-booking-addon-chef').checked = false;
      
      document.getElementById('edit-booking-discount-type').value = 'none';
      document.getElementById('edit-booking-discount-value').value = '0.00';
      document.getElementById('edit-booking-promo-code').value = '';
      if (valContainer) valContainer.classList.add('hidden');
      if (promoContainer) promoContainer.classList.add('hidden');

      if (btnDeleteBooking) {
        btnDeleteBooking.classList.add('hidden');
      }
      if (modalTitle) {
        modalTitle.textContent = "New Booking Details";
      }
      if (btnSubmitBooking) {
        btnSubmitBooking.textContent = "Create Booking";
      }
      
      // Calculate auto base rate for new booking
      recalculateAutoBaseRateIfNeeded();
    }
    
    // Update calculated folio total input value
    updateCalculatedFolio();
    
    // Reset modal tabs to first tab
    resetBookingModalTabs();
    
    // Open modal
    if (editBookingModal) {
      editBookingModal.classList.remove('hidden');
      editBookingModal.classList.add('flex');
    }
  };

  function filterRoomCards() {
    const status = globalFilterSelect ? globalFilterSelect.value : 'all';
    const query = globalSearchInput ? globalSearchInput.value.toLowerCase().trim() : '';
    
    document.querySelectorAll('.gantt-row').forEach(row => {
      const villaId = row.getAttribute('data-villa-id');
      if (!villaId) return;
      
      const villaNameEl = row.querySelector('.font-semibold');
      const villaName = villaNameEl ? villaNameEl.textContent : '';
      
      // Find overlapping reservation on offset 2 (June 20)
      const currentRes = reservations.find(res => 
        (res.villa === villaId || (typeof res.villa === 'string' && res.villa.split(', ').includes(villaId))) && 
        2 >= res.startOffset && 
        2 < (res.startOffset + res.duration)
      );
      
      let currentStatus = 'Ready';
      if (currentRes) {
        currentStatus = currentRes.bookingStatus;
      }
      
      let mappedStatus = 'Ready';
      if (currentStatus === 'Checked In') {
        mappedStatus = 'Occupied';
      } else if (currentStatus === 'Cleaning') {
        mappedStatus = 'Cleaning';
      } else if (currentStatus === 'Maint. Hold') {
        mappedStatus = 'Maint. Hold';
      }
      
      const matchesStatus = (status === 'all' || mappedStatus === status);
      
      // Check search query against villa name, ID, and guest names on any booking for this room
      const villaResList = reservations.filter(res => res.villa === villaId || (typeof res.villa === 'string' && res.villa.split(', ').includes(villaId)));
      const matchesSearch = !query || 
                            villaId.toLowerCase().includes(query) || 
                            villaName.toLowerCase().includes(query) || 
                            villaResList.some(res => res.guest.toLowerCase().includes(query));
      
      row.classList.toggle('hidden', !(matchesStatus && matchesSearch));
    });

    // Toggle container cards based on whether they contain visible rows
    const mediumVillas = villas.filter(v => v.category === "Medium Sized Luxury Villa");
    const hasVisibleMedium = mediumVillas.some(villa => {
      const row = document.querySelector(`.gantt-row[data-villa-id="${villa.id}"]`);
      return row && !row.classList.contains('hidden');
    });
    const mediumContainer = document.getElementById('gantt-medium-container');
    if (mediumContainer) {
      mediumContainer.classList.toggle('hidden', !hasVisibleMedium);
    }

    const largeVillas = villas.filter(v => v.category === "Large Luxury Villa");
    const hasVisibleLarge = largeVillas.some(villa => {
      const row = document.querySelector(`.gantt-row[data-villa-id="${villa.id}"]`);
      return row && !row.classList.contains('hidden');
    });
    const largeContainer = document.getElementById('gantt-large-container');
    if (largeContainer) {
      largeContainer.classList.toggle('hidden', !hasVisibleLarge);
    }
  }

  function filterLedgerTable() {
    const paymentStatus = globalFilterSelect ? globalFilterSelect.value : 'all';
    const bookingStatus = globalFilterSelect2 ? globalFilterSelect2.value : 'all';
    const query = globalSearchInput ? globalSearchInput.value.toLowerCase().trim() : '';
    
    document.querySelectorAll('#view-ledger tbody tr').forEach(row => {
      const paymentStatusEl = row.querySelector('.ledger-payment-status span');
      const rowPaymentStatus = paymentStatusEl ? paymentStatusEl.textContent.trim() : '';
      
      const bookingStatusEl = row.querySelector('.ledger-booking-status span');
      const rowBookingStatus = bookingStatusEl ? bookingStatusEl.textContent.trim() : '';
      
      const guestName = row.querySelector('.ledger-guest') ? row.querySelector('.ledger-guest').textContent : '';
      const roomName = row.querySelector('.ledger-room') ? row.querySelector('.ledger-room').textContent : '';
      
      const matchesPayment = (paymentStatus === 'all' || rowPaymentStatus.toLowerCase() === paymentStatus.toLowerCase());
      const matchesBooking = (bookingStatus === 'all' || rowBookingStatus.toLowerCase() === bookingStatus.toLowerCase());
      const matchesQuery = !query || 
                            guestName.toLowerCase().includes(query) || 
                            roomName.toLowerCase().includes(query);
      
      row.classList.toggle('hidden', !(matchesPayment && matchesBooking && matchesQuery));
    });
  }

  function filterMaintenanceTable() {
    const severity = globalFilterSelect ? globalFilterSelect.value : 'all';
    const query = globalSearchInput ? globalSearchInput.value.toLowerCase().trim() : '';
    
    document.querySelectorAll('#maintenance-tickets-table tbody tr').forEach(row => {
      const severityEl = row.querySelector('td:nth-child(4) span');
      const rowSeverity = severityEl ? severityEl.textContent.trim() : '';
      
      const ticketId = row.querySelector('td:nth-child(1)') ? row.querySelector('td:nth-child(1)').textContent : '';
      const location = row.querySelector('td:nth-child(2)') ? row.querySelector('td:nth-child(2)').textContent : '';
      const desc = row.querySelector('td:nth-child(3)') ? row.querySelector('td:nth-child(3)').textContent : '';
      
      const matchesSeverity = (severity === 'all' || rowSeverity.toLowerCase() === severity.toLowerCase());
      const matchesQuery = !query || 
                            ticketId.toLowerCase().includes(query) || 
                            location.toLowerCase().includes(query) || 
                            desc.toLowerCase().includes(query);
      
      row.classList.toggle('hidden', !(matchesSeverity && matchesQuery));
    });
  }

  function filterKnowledge() {
    const category = globalFilterSelect ? globalFilterSelect.value : 'accommodations';
    const query = globalSearchInput ? globalSearchInput.value.toLowerCase().trim() : '';
    
    knowledgeCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category') || '';
      const metadata = card.getAttribute('data-search') || '';
      const title = card.querySelector('h4') ? card.querySelector('h4').textContent : '';
      
      const matchesCategory = (cardCategory === category);
      const matchesQuery = !query || 
                            metadata.toLowerCase().includes(query) || 
                            title.toLowerCase().includes(query);
      
      card.classList.toggle('hidden', !(matchesCategory && matchesQuery));
    });
  }

  function filterSpecialBookings() {
    const status = globalFilterSelect ? globalFilterSelect.value : 'all';
    const query = globalSearchInput ? globalSearchInput.value.toLowerCase().trim() : '';
    
    document.querySelectorAll('#special-bookings-table tbody tr').forEach(row => {
      const statusEl = row.querySelector('.sb-status');
      const rowStatus = statusEl ? statusEl.textContent.trim() : '';
      
      const guest = row.querySelector('.sb-guest') ? row.querySelector('.sb-guest').textContent : '';
      const amenity = row.querySelector('.sb-amenity') ? row.querySelector('.sb-amenity').textContent : '';
      const details = row.querySelector('.sb-details') ? row.querySelector('.sb-details').textContent : '';
      
      const matchesStatus = (status === 'all' || rowStatus.toLowerCase() === status.toLowerCase());
      const matchesQuery = !query || 
                            guest.toLowerCase().includes(query) || 
                            amenity.toLowerCase().includes(query) || 
                            details.toLowerCase().includes(query);
      
      row.classList.toggle('hidden', !(matchesStatus && matchesQuery));
    });
  }

  // Master apply filters function
  window.applyFilters = function() {
    const activeLink = document.querySelector('.nav-link.text-tertiary');
    const activeView = activeLink ? activeLink.getAttribute('data-view') : 'overview';
    
    if (activeView === 'assignments') {
      filterRoomCards();
    } else if (activeView === 'special') {
      filterSpecialBookings();
    } else if (activeView === 'ledger') {
      filterLedgerTable();
    } else if (activeView === 'maintenance') {
      filterMaintenanceTable();
    } else if (activeView === 'knowledge') {
      filterKnowledge();
    }
  };

  // DOM selectors for date navigation
  const navMonthSelect = document.getElementById('nav-month-select');
  const navDaySelect = document.getElementById('nav-day-select');
  const btnTimelineToday = document.getElementById('btn-timeline-today');
  const btnTimelinePrev = document.getElementById('btn-timeline-prev');
  const btnTimelineNext = document.getElementById('btn-timeline-next');

  function populateDaySelect() {
    if (!navMonthSelect || !navDaySelect) return;
    
    const selectedDate = new Date(navMonthSelect.value);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    const currentVal = navDaySelect.value;
    navDaySelect.innerHTML = '';
    
    for (let d = 1; d <= totalDays; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      navDaySelect.appendChild(opt);
    }
    
    if (currentVal && parseInt(currentVal) <= totalDays) {
      navDaySelect.value = currentVal;
    } else {
      navDaySelect.value = "1";
    }
  }

  function syncDateSelectors() {
    if (!navMonthSelect || !navDaySelect) return;
    
    const year = ganttStartDate.getFullYear();
    const month = ganttStartDate.getMonth();
    const day = ganttStartDate.getDate();
    
    const monthVal = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    
    let monthExists = false;
    Array.from(navMonthSelect.options).forEach(opt => {
      if (opt.value === monthVal) {
        monthExists = true;
      }
    });
    
    if (!monthExists) {
      const opt = document.createElement('option');
      opt.value = monthVal;
      const monthName = ganttStartDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      opt.textContent = monthName;
      navMonthSelect.appendChild(opt);
    }
    navMonthSelect.value = monthVal;
    
    populateDaySelect();
    navDaySelect.value = day;
  }

  function updateGanttStartDateFromSelectors() {
    if (!navMonthSelect || !navDaySelect) return;
    const selectedDate = new Date(navMonthSelect.value);
    const day = parseInt(navDaySelect.value);
    ganttStartDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    renderGanttChart();
  }

  function updateTimelineRangeLabel() {
    const label = document.getElementById('timeline-range-label');
    if (!label) return;
    
    const start = new Date(ganttStartDate);
    const end = new Date(ganttStartDate);
    end.setDate(end.getDate() + 9);
    
    const startStr = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    label.textContent = `${startStr} â€” ${endStr}`;
  }

  // Hook Date Navigation Event Listeners
  if (navMonthSelect && navDaySelect) {
    populateDaySelect();
    syncDateSelectors();

    navMonthSelect.addEventListener('change', () => {
      populateDaySelect();
      updateGanttStartDateFromSelectors();
    });

    navDaySelect.addEventListener('change', () => {
      updateGanttStartDateFromSelectors();
    });
  }

  if (btnTimelineToday) {
    btnTimelineToday.addEventListener('click', () => {
      ganttStartDate = new Date("2026-06-18");
      syncDateSelectors();
      renderGanttChart();
    });
  }

  if (btnTimelinePrev) {
    btnTimelinePrev.addEventListener('click', () => {
      ganttStartDate.setDate(ganttStartDate.getDate() - 10);
      syncDateSelectors();
      renderGanttChart();
    });
  }

  if (btnTimelineNext) {
    btnTimelineNext.addEventListener('click', () => {
      ganttStartDate.setDate(ganttStartDate.getDate() + 10);
      syncDateSelectors();
      renderGanttChart();
    });
  }

  function updateLedgerRecordCount() {
    const totalRows = document.querySelectorAll('#view-ledger tbody tr').length;
    const visibleRows = document.querySelectorAll('#view-ledger tbody tr:not(.hidden)').length;
    const recordsTextEl = document.getElementById('ledger-showing-records-text');
    if (recordsTextEl) {
      if (totalRows === visibleRows) {
        recordsTextEl.textContent = `Showing ${totalRows} records`;
      } else {
        recordsTextEl.textContent = `Showing ${visibleRows} of ${totalRows} records`;
      }
    }
  }

  // Ledger Tab Switcher Click Listeners
  document.querySelectorAll('.ledger-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-ledger-tab');
      currentLedgerTab = tabName;
      
      // Update active tab styling
      document.querySelectorAll('.ledger-tab-btn').forEach(b => {
        if (b === btn) {
          b.className = "ledger-tab-btn px-2 py-1 bg-tertiary text-dark-obsidian text-[10px] font-semibold transition-all hover:brightness-110 flex items-center gap-1 shrink-0";
          const badge = b.querySelector('span');
          if (badge) {
            badge.className = "bg-dark-obsidian/15 text-dark-obsidian text-[9px] px-1 py-px font-bold";
          }
        } else {
          b.className = "ledger-tab-btn px-2 py-1 border border-secondary/35 text-secondary hover:text-on-surface text-[10px] transition-all flex items-center gap-1 shrink-0";
          const badge = b.querySelector('span');
          if (badge) {
            badge.className = "bg-secondary/15 text-secondary text-[9px] px-1 py-px font-bold";
          }
        }
      });
      
      // Re-render and apply filters
      renderLedgerTable();
      applyFilters();
    });
  });

  // Render initial tables
  renderLedgerTable();
  renderGanttChart();
  renderSpecialBookings();
  renderServiceRequests();
  renderMaintenanceBlockouts();

  // Initialize Overview Hub components
  initializeTaskTracker();
  initializeQuickControls();
  updateOverviewKPIs();
  updateOverviewRoster();

  // --- AI Operations Copilot RAG Logic ---
  const copilotForm = document.getElementById('copilot-input-form');
  const copilotMsgInput = document.getElementById('copilot-input-msg');
  const copilotStream = document.getElementById('copilot-messages-stream');

  window.setCopilotPrompt = function(promptText) {
    if (copilotMsgInput) {
      copilotMsgInput.value = promptText;
      copilotMsgInput.focus();
    }
  };

  if (copilotForm) {
    copilotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = copilotMsgInput.value.trim();
      if (!query) return;

      // Add user message
      const userBubble = document.createElement('div');
      userBubble.className = "bg-surface/60 border border-secondary/10 p-3 self-end max-w-[85%] text-xs";
      userBubble.innerHTML = `
        <div class="font-semibold text-tertiary mb-1">Manager</div>
        <p>${query}</p>
        <span class="text-[9px] text-on-surface-variant block text-right mt-1">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      `;
      copilotStream.appendChild(userBubble);
      copilotMsgInput.value = "";
      copilotStream.scrollTop = copilotStream.scrollHeight;

      // Simulate typing delay
      setTimeout(() => {
        const responseText = processRAGQuery(query);
        const aiBubble = document.createElement('div');
        aiBubble.className = "bg-surface-variant/40 border border-tertiary/20 p-3.5 self-start max-w-[90%] text-xs";
        aiBubble.innerHTML = `
          <div class="font-semibold text-accent-gold mb-1.5 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px]">psychology</span> Operations Copilot AI
          </div>
          <div class="leading-relaxed whitespace-pre-line">${responseText}</div>
          <span class="text-[9px] text-on-surface-variant block text-right mt-1.5">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        `;
        copilotStream.appendChild(aiBubble);
        copilotStream.scrollTop = copilotStream.scrollHeight;
      }, 700);
    });
  }

  function processRAGQuery(query) {
    const q = query.toLowerCase();

    // 1. Sophia Loren stay info
    if (q.includes('sophia') || q.includes('loren')) {
      const res = reservations.find(r => r.guest.toLowerCase().includes('loren'));
      if (res) {
        return `**RAG Match: Sophia Loren Stay Record**
        - **Villa Assigned**: ${res.villaName} (${res.villa})
        - **Folio Total**: â‚±${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
        - **Payment Status**: ${res.paymentStatus === 'PARTIAL' ? 'PARTIAL (deposit paid, balance due)' : res.paymentStatus}
        - **Stay Dates**: ${res.dates} (${res.duration} nights)
        - **Add-on Services**: ${res.addonSpa ? 'Spa & Wellness (â‚±4,200.00)' : 'None'}
        - **Operational Note**: Checked In. Sommelier wine logs show she has requested room dining access for breakfast.`;
      }
    }

    // 2. Lord Harrington stay info
    if (q.includes('harrington') || q.includes('lord')) {
      const res = reservations.find(r => r.guest.toLowerCase().includes('harrington'));
      if (res) {
        return `**RAG Match: Lord Harrington Stay Record**
        - **Villa Assigned**: ${res.villaName} (${res.villa})
        - **Dates of Stay**: ${res.dates} (${res.duration} nights)
        - **Folio Total**: â‚±${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
        - **Payment Status**: ${res.paymentStatus} (Wire Transfer pending verifications)
        - **Add-on Services**: Wine & Sommelier Pre-stock (â‚±1,860.00)
        - **Operational Status**: Checked In. Front desk is awaiting supervisor wire validation to confirm clearance.`;
      }
    }

    // 3. George Clooney stay info
    if (q.includes('clooney') || q.includes('george')) {
      const res = reservations.find(r => r.guest.toLowerCase().includes('clooney'));
      if (res) {
        return `**RAG Match: George Clooney Stay Record**
        - **Villa Assigned**: ${res.villaName} (${res.villa})
        - **Dates of Stay**: ${res.dates} (${res.duration} nights)
        - **Folio Total**: â‚±${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
        - **Booking Status**: ${res.bookingStatus} (Confirmed check-in scheduled for tomorrow)
        - **Payment Status**: ${res.paymentStatus} (Fully settled upfront)`;
      }
    }

    // 4. Occupancy Rate
    if (q.includes('occupancy') || q.includes('occupied') || q.includes('checked in')) {
      const activeRes = reservations.filter(r => r.bookingStatus === 'Checked In' && !r.isBlockout);
      const rate = ((activeRes.length / villas.length) * 100).toFixed(1);
      let list = activeRes.map(r => `  - **${r.villaName}** (${r.villa}): Occupied by ${r.guest}`).join('\n');
      return `**RAG Match: Live Sanctuary Map Occupancy Analysis**
      - **Current Occupancy Rate**: **${rate}%** (${activeRes.length} of ${villas.length} villas occupied)
      - **Occupied Villas**:
      ${list}
      - **Vacant / Confirmed Arrival Villas**:
        - Villa 2 (Positano Vista)
        - Villa 3 (Ravello Suite)
        - Villa 5 (Sirenuse Suite) - Confirmed arrival for George Clooney.`;
    }

    // 5. Maintenance Holds
    if (q.includes('maintenance') || q.includes('hold') || q.includes('holds') || q.includes('tickets')) {
      const holds = reservations.filter(r => r.isBlockout);
      let holdText = holds.length > 0 
        ? holds.map(h => `  - **${h.villaName}** (${h.villa}): ${h.guest} (Dates: ${h.dates})`).join('\n')
        : "  - No active maintenance holds on the timeline.";
      return `**RAG Match: Maintenance Hub Logs**
      - **Active Maintenance Holds**: **${holds.length}**
      ${holdText}
      - **Open Tickets**: 
        - AC Unit Compressor replacement scheduled for Villa 4.
        - Pool filter cleaning check scheduled for Villa 1 next Monday.`;
    }

    // 6. Financial Ledger & Pacing
    if (q.includes('revenue') || q.includes('ledger') || q.includes('pacing') || q.includes('ebitda') || q.includes('receivables') || q.includes('financial')) {
      const totalReceivables = reservations
        .filter(r => !r.isBlockout && (r.paymentStatus === 'PARTIAL' || r.paymentStatus === 'UNPAID'))
        .reduce((sum, r) => sum + parseFloat(r.folio.replace(/,/g, '')), 0);
      return `**RAG Match: H1 Operations & Revenue Audit Summary**
      - **Active Receivables Ledger (Folios)**: **â‚±${totalReceivables.toLocaleString('en-US', {minimumFractionDigits: 2})}**
      - **ADR Pacing**: â‚±4,733.33 (YTD +12.4% MoM)
      - **RevPAR**: â‚±4,007.16 (YTD +8.2% MoM)
      - **EBITDA Profit Margin**: **48.6%** (Pacing on track for YTD H1 Targets)
      - **Revenue Streams**:
        - Suite Lodging: 85% allocation
        - Amenity Add-ons (Cabana/Drinks/Spa): 15% allocation`;
    }

    // 7. Knowledgebase & Amenity Rates
    if (q.includes('rules') || q.includes('knowledge') || q.includes('rate') || q.includes('rates') || q.includes('price') || q.includes('pricing') || q.includes('cabana') || q.includes('drinks') || q.includes('buffet') || q.includes('spa')) {
      return `**RAG Match: Knowledge Monitor Accommodations & Amenities Rules**
      - **Standard Operations Policies**:
        - Check-in: 14:00 (Early check-in fee: â‚±2,500.00, subject to availability).
        - Check-out: 11:00 (Late check-out fee: â‚±3,500.00 until 16:00).
        - Security Deposit: â‚±15,000.00 required upon reservation confirmation.
      - **Amenity Service Rates**:
        - **Pool Cabana Rental**: â‚±1,500.00/day.
        - **Welcome Drink Package**: â‚±1,500.00/package.
        - **Dinner Buffet Package**: â‚±1,200.00/guest.
        - **Massage Treatment**: â‚±1,500.00/session.`;
    }

    // 8. Verification slips
    if (q.includes('verification') || q.includes('deposit') || q.includes('wire') || q.includes('swift') || q.includes('slip') || q.includes('auditor')) {
      return `**RAG Match: Front Desk Pending Verifications**
      - **Pending Slips in Queue**: **1**
      - **Details**: Lord Harrington (Villa 6). SWIFT transfer verification slip submitted for **â‚±42,100.00** matching deposit folio requirements.
      - **Action Required**: Operations manager approval required under the "Receipt Verifications" module to release check-in hold.`;
    }

    // Fallback general analysis
    return `**RAG Operations Brain - General Summary Report**
    I have run a broad vector search across the resort system:
    - **Villas & Map**: 6 total villas (Occupancy rate: **83.0%**). Villa 4 is under an active **Maintenance Hold**.
    - **Roster Flow**: George Clooney is arriving tomorrow at Villa 5 (Sirenuse Suite, Confirmed). Sophia Loren is checked in at Villa 1.
    - **Ledger Audit**: Receivables are at **â‚±312,850.00**. Margin pacing remains healthy at **48.6% EBITDA**.
    - **Front Desk**: 1 pending SWIFT receipt verification for Lord Harrington.
    - 
    *Tip: You can query specific details like "List all maintenance holds", "What is Sophia Loren's folio?", or "What are the pool cabana rates?".*`;
  }

  // ==========================================
  // Dynamic Folio & POS Logic
  // ==========================================

  function updateFolio(res) {
    let total = res.baseRate || 0;
    
    // Apply discount if active
    let discountAmount = 0;
    if (res.discountType === 'flat') {
      discountAmount = res.discountValue || 0;
    } else if (res.discountType === 'percent') {
      discountAmount = total * ((res.discountValue || 0) / 100);
    }
    
    total = Math.max(0, total - discountAmount);

    if (res.addonWine) total += 1500;
    if (res.addonYacht) total += 1500;
    if (res.addonSpa) total += 1500;
    if (res.addonChef) total += 1200;
    
    if (res.posCharges) {
      res.posCharges.forEach(charge => {
        total += charge.amount;
      });
    }
    
    res.folio = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  let cart = [];

  // Toggle POS sub tabs
  window.togglePosSubTab = function(tabName) {
    const btnSell = document.getElementById('btn-pos-tab-sell');
    const btnManage = document.getElementById('btn-pos-tab-manage');
    const paneSell = document.getElementById('pos-pane-sell');
    const paneManage = document.getElementById('pos-pane-manage');
    const filters = document.getElementById('pos-category-filters');

    if (tabName === 'sell') {
      btnSell.className = "px-4 py-1.5 text-xs font-label-caps font-bold transition-all focus:outline-none bg-tertiary text-dark-obsidian";
      btnManage.className = "px-4 py-1.5 text-xs font-label-caps font-bold transition-all focus:outline-none text-secondary hover:text-on-surface";
      paneSell.classList.remove('hidden');
      paneManage.classList.add('hidden');
      if (filters) filters.classList.remove('hidden');
      renderPosTerminal();
    } else {
      btnManage.className = "px-4 py-1.5 text-xs font-label-caps font-bold transition-all focus:outline-none bg-tertiary text-dark-obsidian";
      btnSell.className = "px-4 py-1.5 text-xs font-label-caps font-bold transition-all focus:outline-none text-secondary hover:text-on-surface";
      paneManage.classList.remove('hidden');
      paneSell.classList.add('hidden');
      if (filters) filters.classList.add('hidden');
      renderProductCatalogTable();
    }
  };

  // Filter POS products by category
  let currentPosCategory = 'All';
  window.filterPosProducts = function(category, buttonEl) {
    currentPosCategory = category;
    
    // Style active category filter buttons
    const filterButtons = document.querySelectorAll('#pos-category-filters button');
    filterButtons.forEach(btn => {
      if (btn === buttonEl) {
        btn.className = "px-3 py-1 text-xs border border-tertiary bg-tertiary/10 text-tertiary font-medium transition-all";
      } else {
        btn.className = "px-3 py-1 text-xs border border-secondary/15 text-secondary hover:text-on-surface hover:border-secondary transition-all";
      }
    });

    renderPosTerminal();
  };

  // Populate active room reservations for charging
  window.populateRoomSelect = function() {
    const select = document.getElementById('pos-room-reservation-select');
    if (!select) return;
    
    select.innerHTML = '';
    const activeRooms = reservations.filter(res => !res.isBlockout && res.bookingStatus === 'Checked In');
    
    if (activeRooms.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No active checked-in guests';
      select.appendChild(opt);
    } else {
      activeRooms.forEach(res => {
        const opt = document.createElement('option');
        opt.value = res.id;
        opt.textContent = `${res.guest} (${res.villa} - ${res.villaName})`;
        select.appendChild(opt);
      });
    }
  };

  // Render Product Grid for Sales
  window.renderPosTerminal = function() {
    const container = document.getElementById('pos-pane-sell');
    if (!container) return;

    container.innerHTML = '';
    
    const filteredProducts = currentPosCategory === 'All' 
      ? products 
      : products.filter(p => p.category === currentPosCategory);

    if (filteredProducts.length === 0) {
      container.innerHTML = '<span class="text-xs text-on-surface-variant italic col-span-3 text-center py-8">No products found in this category.</span>';
      return;
    }

    filteredProducts.forEach(product => {
      const card = document.createElement('div');
      card.className = "glass-panel p-stack-md flex flex-col justify-between gap-4";
      
      const stockColor = product.stock > 0 ? "text-mint-active/80" : "text-alert-red/80";
      const stockText = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";
      const isDisabled = product.stock <= 0 ? "disabled opacity-40 cursor-not-allowed" : "";

      card.innerHTML = `
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-secondary font-label-caps uppercase">${product.category}</span>
          <h4 class="text-sm font-semibold text-on-surface">${product.name}</h4>
          <span class="text-xs ${stockColor} font-mono-data">${stockText}</span>
        </div>
        <div class="flex justify-between items-center mt-2 border-t border-secondary/10 pt-2">
          <span class="font-mono-data text-tertiary font-bold text-sm">â‚±${product.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          <button type="button" class="bg-tertiary hover:bg-white text-dark-obsidian text-[10px] font-label-caps font-bold px-3 py-1.5 transition-all ${isDisabled}" onclick="addToCart('${product.id}')">
            + Add
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  };

  // Render Product Catalog Table for Editing
  window.renderProductCatalogTable = function() {
    const tbody = document.querySelector('#pos-catalog-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-on-surface-variant italic">No products in catalog.</td></tr>';
      return;
    }

    products.forEach(product => {
      const row = document.createElement('tr');
      row.className = "border-b border-secondary/10 hover:bg-surface-variant/30 transition-all";
      row.innerHTML = `
        <td class="py-3 pr-4 font-semibold text-on-surface text-xs">${product.name}</td>
        <td class="py-3 px-4 text-xs text-on-surface-variant">${product.category}</td>
        <td class="py-3 px-4 text-right font-mono-data text-tertiary text-xs">â‚±${product.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="py-3 px-4 text-right font-mono-data text-xs">${product.stock}</td>
        <td class="py-3 pl-4 text-right text-xs">
          <button type="button" class="text-alert-red hover:text-white transition-colors" onclick="deleteProduct('${product.id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  };

  // Add Product to Cart
  window.addToCart = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;

    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
      if (cartItem.qty < product.stock) {
        cartItem.qty++;
      } else {
        alert("Cannot add more. Reached maximum available stock.");
      }
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty: 1
      });
    }

    updateCartUI();
  };

  // Update Cart Quantity
  window.updateCartQty = function(productId, delta) {
    const cartItem = cart.find(item => item.id === productId);
    const product = products.find(p => p.id === productId);
    if (!cartItem || !product) return;

    if (delta > 0) {
      if (cartItem.qty < product.stock) {
        cartItem.qty++;
      } else {
        alert("Cannot add more. Reached maximum available stock.");
      }
    } else {
      cartItem.qty--;
      if (cartItem.qty <= 0) {
        removeFromCart(productId);
        return;
      }
    }

    updateCartUI();
  };

  // Remove Item from Cart
  window.removeFromCart = function(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartUI();
  };

  // Update Cart UI
  window.updateCartUI = function() {
    const container = document.getElementById('pos-cart-items-container');
    const countBadge = document.getElementById('pos-cart-count');
    const subtotalEl = document.getElementById('pos-cart-subtotal');
    const taxEl = document.getElementById('pos-cart-tax');
    const totalEl = document.getElementById('pos-cart-total');

    if (!container) return;

    container.innerHTML = '';
    
    if (cart.length === 0) {
      container.innerHTML = '<span class="text-xs text-on-surface-variant italic py-8 text-center w-full">Your cart is empty. Add products to get started.</span>';
      if (countBadge) countBadge.textContent = "0 items";
      if (subtotalEl) subtotalEl.textContent = "â‚±0.00";
      if (taxEl) taxEl.textContent = "â‚±0.00";
      if (totalEl) totalEl.textContent = "â‚±0.00";
      return;
    }

    let subtotal = 0;
    let totalItems = 0;

    cart.forEach(item => {
      subtotal += item.price * item.qty;
      totalItems += item.qty;

      const div = document.createElement('div');
      div.className = "flex justify-between items-center py-2 border-b border-secondary/5 text-xs";
      div.innerHTML = `
        <div class="flex flex-col gap-0.5 max-w-[60%]">
          <span class="font-semibold text-on-surface">${item.name}</span>
          <span class="text-[10px] text-on-surface-variant">â‚±${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} each</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center border border-secondary/20 p-0.5 bg-surface">
            <button type="button" class="w-5 h-5 flex items-center justify-center text-secondary hover:text-on-surface transition-colors" onclick="updateCartQty('${item.id}', -1)">-</button>
            <span class="w-6 text-center font-mono-data text-xs text-on-surface">${item.qty}</span>
            <button type="button" class="w-5 h-5 flex items-center justify-center text-secondary hover:text-on-surface transition-colors" onclick="updateCartQty('${item.id}', 1)">+</button>
          </div>
          <button type="button" class="text-alert-red hover:text-white transition-colors" onclick="removeFromCart('${item.id}')">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      `;
      container.appendChild(div);
    });

    const tax = subtotal * 0.12; // 12% VAT
    const grandTotal = subtotal; // Price includes VAT already

    if (countBadge) countBadge.textContent = `${totalItems} items`;
    if (subtotalEl) subtotalEl.textContent = `â‚±${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (taxEl) taxEl.textContent = `â‚±${tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (totalEl) totalEl.textContent = `â‚±${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  // Toggle Cart Destination payment controls
  window.handlePosCheckoutTypeChange = function() {
    const dest = document.getElementById('pos-checkout-dest').value;
    const roomSelect = document.getElementById('pos-group-room-select');
    const paymentMethodSelect = document.getElementById('pos-group-payment-method');

    if (dest === 'room') {
      roomSelect.classList.remove('hidden');
      paymentMethodSelect.classList.add('hidden');
      populateRoomSelect();
    } else {
      roomSelect.classList.add('hidden');
      paymentMethodSelect.classList.remove('hidden');
    }
  };

  // Checkout complete handler
  window.completePosCheckout = function() {
    if (cart.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    const dest = document.getElementById('pos-checkout-dest').value;
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const timestampStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Deduct stock
    cart.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.qty);
      }
    });
    saveProducts();

    if (dest === 'room') {
      // Charge to Villa
      const resId = document.getElementById('pos-room-reservation-select').value;
      if (!resId) {
        alert("Please select a checked-in villa.");
        return;
      }
      
      const res = reservations.find(r => r.id === resId);
      if (!res) {
        alert("Selected reservation not found.");
        return;
      }

      res.posCharges = res.posCharges || [];
      
      // Add items as POS charges
      cart.forEach(item => {
        res.posCharges.push({
          id: "chg-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          name: `${item.name} (${item.qty}x)`,
          amount: item.price * item.qty,
          date: `${dateStr} ${timestampStr}`
        });
      });

      // Recalculate folio total
      updateFolio(res);
      saveReservations();

      // Log transaction as room POS sale
      const roomSale = {
        id: "sale-" + Date.now(),
        date: new Date().toISOString().split('T')[0],
        guest: res.guest,
        villa: res.villa,
        items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.qty })),
        total: total,
        checkoutType: "room",
        resId: res.id
      };
      posSales.push(roomSale);
      savePosSales();
      pushBackend('/admin/amalfi/pos-sales', roomSale);

      alert(`Successfully billed â‚±${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ${res.guest} (${res.villa}) folio.`);

    } else {
      // Direct Walk-in Sale
      const method = document.getElementById('pos-payment-method-select').value;
      
      const directSale = {
        id: "sale-" + Date.now(),
        date: new Date().toISOString().split('T')[0],
        guest: "Walk-in Guest",
        villa: "N/A",
        items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.qty })),
        total: total,
        checkoutType: "direct",
        paymentMethod: method
      };
      posSales.push(directSale);
      savePosSales();
      pushBackend('/admin/amalfi/pos-sales', directSale);

      alert(`Direct sale of â‚±${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} completed successfully via ${method}.`);
    }

    // Reset cart and UI
    cart = [];
    updateCartUI();
    renderPosTerminal();
    
    // Refresh ledger, financials, and charts
    renderLedgerTable();
    updateOverviewKPIs();
    if (typeof updatePLStatement === 'function') updatePLStatement();
  };

  // Add Product submission handler
  const addProductForm = document.getElementById('pos-add-product-form');
  if (addProductForm) {
    addProductForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('pos-new-name').value;
      const category = document.getElementById('pos-new-category').value;
      const price = parseFloat(document.getElementById('pos-new-price').value);
      const stock = parseInt(document.getElementById('pos-new-stock').value);

      if (!name || isNaN(price) || isNaN(stock)) return;

      const newProd = {
        id: "p-" + Date.now(),
        name: name,
        category: category,
        price: price,
        stock: stock
      };

      products.push(newProd);
      saveProducts();
      pushBackend('/admin/amalfi/products', newProd);
      addProductForm.reset();

      renderProductCatalogTable();
      renderPosTerminal();
      alert("Product added successfully.");
    });
  }

  // Delete product from catalog
  window.deleteProduct = function(productId) {
    if (confirm("Are you sure you want to delete this product from the catalog?")) {
      products = products.filter(p => p.id !== productId);
      saveProducts();
      pushBackend(`/admin/amalfi/products/${encodeURIComponent(productId)}`, undefined, { method: 'DELETE' });
      renderProductCatalogTable();
      renderPosTerminal();
    }
  };

  // ==========================================
  // Dynamic USALI P&L Calculations
  // ==========================================

  window.getPLValues = function() {
    function getCategoryOfItem(itemName) {
      const prod = products.find(p => p.name === itemName || itemName.includes(p.name));
      return prod ? prod.category : 'Food & Beverage';
    }

    function sumPOSByCategory(category, keyword) {
      let sum = 0;
      posSales.forEach(sale => {
        sale.items.forEach(item => {
          const cat = getCategoryOfItem(item.name);
          const matchesCat = cat === category;
          const matchesKw = !keyword || item.name.toLowerCase().includes(keyword.toLowerCase());
          if (matchesCat && matchesKw) {
            sum += item.price * item.qty;
          }
        });
      });
      return sum;
    }

    // Sum expenses by department (v3 schema)
    function sumExpByDept(dept) {
      return expenses
        .filter(e => e.department === dept)
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }

    // Sum expenses by subcategory (for COGS isolation)
    function sumExpBySubcat(subcat) {
      return expenses
        .filter(e => e.subcategory === subcat)
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }


    const activeReservations = reservations.filter(r => !r.isBlockout && r.bookingStatus !== 'Cancelled');
    const roomsBase = activeReservations.reduce((sum, r) => sum + (r.baseRate || 0), 0);
    
    const wineAddonsCount = activeReservations.filter(r => r.addonWine).length;
    const chefAddonsCount = activeReservations.filter(r => r.addonChef).length;
    const fbPOS = sumPOSByCategory('Food & Beverage');
    const fbRevenues = 18480 + (wineAddonsCount * 1500) + (chefAddonsCount * 1200) + fbPOS;

    const yachtAddonsCount = activeReservations.filter(r => r.addonYacht).length;
    const yachtPOS = sumPOSByCategory('Experiences & Services', 'Activity') + sumPOSByCategory('Experiences & Services', 'Rental');
    const yachtRevenues = 12000 + (yachtAddonsCount * 1500) + yachtPOS;

    const spaAddonsCount = activeReservations.filter(r => r.addonSpa).length;
    const spaPOS = sumPOSByCategory('Experiences & Services', 'Spa');
    const spaRevenues = 8450 + (spaAddonsCount * 1500) + spaPOS;

    const otherRevenues = sumPOSByCategory('Boutique & Retail');

    const grossRevenue = roomsBase + fbRevenues + yachtRevenues + spaRevenues + otherRevenues;

    // COGS = direct F&B, utility/fuel, and spa/wellness consumables
    const cogsFood = sumExpBySubcat('Food Inventory Restocking');
    const cogsBeverage = sumExpBySubcat('Beverage Restocking');
    const cogsWine = cogsFood + cogsBeverage;
    const cogsFuel = sumExpBySubcat('Generator Fuel') + sumExpBySubcat('Kitchen Gas / LPG');
    const cogsSpa = sumExpBySubcat('Spa Supplies') + sumExpBySubcat('Wellness Materials');
    const totalCOGS = cogsWine + cogsFuel + cogsSpa;

    const grossProfit = grossRevenue - totalCOGS;

    // Operating expenses by department (v3)
    const expRoomsHousekeeping = sumExpByDept('Rooms & Housekeeping');
    const expStaffing         = sumExpByDept('Staffing & Payroll');
    const expUtilities        = sumExpByDept('Utilities');
    const expMaintenance      = sumExpByDept('Maintenance & Facilities');
    const expMarketing        = sumExpByDept('Marketing & Admin');
    // sgaSalaries alias kept for chart backward compat
    const sgaSalaries    = expStaffing;
    const sgaUtilities   = expUtilities;
    const sgaMaintenance = expMaintenance;
    const sgaMarketing   = expMarketing;
    const sgaYachtCrew   = 0;
    const sgaSpaStaff    = 0;
    const totalSGA = expRoomsHousekeeping + expStaffing + expUtilities + expMaintenance + expMarketing;

    const ebitda = grossProfit - totalSGA;

    // Fixed overhead charges
    const expFixedOverheads = sumExpByDept('Fixed Overheads');
    const fixedInsurance = sumExpBySubcat('Property Insurance');
    const fixedFees      = sumExpBySubcat('Franchise / Management Fees');
    const totalFixed     = expFixedOverheads;

    const noi = ebitda - totalFixed;

    // Non-operating (embedded in Fixed Overheads for this system)
    const nonOpMortgage = sumExpBySubcat('Loan Interest');
    const nonOpDepr     = sumExpBySubcat('Depreciation & Amortization');
    const nonOpTaxes    = sumExpBySubcat('Income Tax Provision');
    const totalNonOp    = 0; // Already included in totalFixed above

    const netIncome = noi;


    // YTD Calculations
    const ytdRooms = 320000 + roomsBase;
    const ytdFB = 60000 + fbRevenues;
    const ytdYacht = 35000 + yachtRevenues;
    const ytdSpa = 25000 + spaRevenues;
    const ytdOther = otherRevenues;
    const ytdGrossRevenue = ytdRooms + ytdFB + ytdYacht + ytdSpa + ytdOther;

    const ytdCogsWine = 35000 + cogsWine;
    const ytdCogsFuel = 15000 + cogsFuel;
    const ytdCogsSpa = 8000 + cogsSpa;
    const ytdTotalCOGS = ytdCogsWine + ytdCogsFuel + ytdCogsSpa;

    const ytdGrossProfit = ytdGrossRevenue - ytdTotalCOGS;

    const ytdSgaSalaries = 150000 + sgaSalaries;
    const ytdSgaUtilities = 38000 + sgaUtilities;
    const ytdSgaYachtCrew = 40000 + sgaYachtCrew;
    const ytdSgaSpaStaff = 12000 + sgaSpaStaff;
    const ytdSgaMaintenance = 20000 + sgaMaintenance;
    const ytdSgaMarketing = 15000 + sgaMarketing;
    const ytdTotalSGA = ytdSgaSalaries + ytdSgaUtilities + ytdSgaYachtCrew + ytdSgaSpaStaff + ytdSgaMaintenance + ytdSgaMarketing;

    const ytdEbitda = ytdGrossProfit - ytdTotalSGA;

    const ytdFixedInsurance = 42500 + fixedInsurance;
    const ytdFixedFees = 60000 + fixedFees;
    const ytdTotalFixed = ytdFixedInsurance + ytdFixedFees;

    const ytdNoi = ytdEbitda - ytdTotalFixed;

    const ytdNonOpMortgage = 27000 + nonOpMortgage;
    const ytdNonOpDepr = 70000 + nonOpDepr;
    const ytdNonOpTaxes = 95000 + nonOpTaxes;
    const ytdTotalNonOp = ytdNonOpMortgage + ytdNonOpDepr + ytdNonOpTaxes;

    const ytdNetIncome = ytdNoi - ytdTotalNonOp;

    return {
      roomsBase, roomsBasePct: (roomsBase / grossRevenue * 100) || 0,
      ytdRooms, ytdRoomsPct: (ytdRooms / ytdGrossRevenue * 100) || 0,
      
      fbRevenues, fbRevenuesPct: (fbRevenues / grossRevenue * 100) || 0,
      ytdFB, ytdFBPct: (ytdFB / ytdGrossRevenue * 100) || 0,

      yachtRevenues, yachtRevenuesPct: (yachtRevenues / grossRevenue * 100) || 0,
      ytdYacht, ytdYachtPct: (ytdYacht / ytdGrossRevenue * 100) || 0,

      spaRevenues, spaRevenuesPct: (spaRevenues / grossRevenue * 100) || 0,
      ytdSpa, ytdSpaPct: (ytdSpa / ytdGrossRevenue * 100) || 0,

      otherRevenues, otherRevenuesPct: (otherRevenues / grossRevenue * 100) || 0,
      ytdOther, ytdOtherPct: (ytdOther / ytdGrossRevenue * 100) || 0,

      grossRevenue, grossRevenuePct: 100,
      ytdGrossRevenue, ytdGrossRevenuePct: 100,

      cogsWine, cogsWinePct: (cogsWine / grossRevenue * 100) || 0,
      ytdCogsWine, ytdCogsWinePct: (ytdCogsWine / ytdGrossRevenue * 100) || 0,

      cogsFuel, cogsFuelPct: (cogsFuel / grossRevenue * 100) || 0,
      ytdCogsFuel, ytdCogsFuelPct: (ytdCogsFuel / ytdGrossRevenue * 100) || 0,

      cogsSpa, cogsSpaPct: (cogsSpa / grossRevenue * 100) || 0,
      ytdCogsSpa, ytdCogsSpaPct: (ytdCogsSpa / ytdGrossRevenue * 100) || 0,

      totalCOGS, totalCOGSPct: (totalCOGS / grossRevenue * 100) || 0,
      ytdTotalCOGS, ytdTotalCOGSPct: (ytdTotalCOGS / ytdGrossRevenue * 100) || 0,

      grossProfit, grossProfitPct: (grossProfit / grossRevenue * 100) || 0,
      ytdGrossProfit, ytdGrossProfitPct: (ytdGrossProfit / ytdGrossRevenue * 100) || 0,

      sgaSalaries, sgaSalariesPct: (sgaSalaries / grossRevenue * 100) || 0,
      ytdSgaSalaries, ytdSgaSalariesPct: (ytdSgaSalaries / ytdGrossRevenue * 100) || 0,

      sgaUtilities, sgaUtilitiesPct: (sgaUtilities / grossRevenue * 100) || 0,
      ytdSgaUtilities, ytdSgaUtilitiesPct: (ytdSgaUtilities / ytdGrossRevenue * 100) || 0,

      sgaYachtCrew, sgaYachtCrewPct: (sgaYachtCrew / grossRevenue * 100) || 0,
      ytdSgaYachtCrew, ytdSgaYachtCrewPct: (ytdSgaYachtCrew / ytdGrossRevenue * 100) || 0,

      sgaSpaStaff, sgaSpaStaffPct: (sgaSpaStaff / grossRevenue * 100) || 0,
      ytdSgaSpaStaff, ytdSgaSpaStaffPct: (ytdSgaSpaStaff / ytdGrossRevenue * 100) || 0,

      sgaMaintenance, sgaMaintenancePct: (sgaMaintenance / grossRevenue * 100) || 0,
      ytdSgaMaintenance, ytdSgaMaintenancePct: (ytdSgaMaintenance / ytdGrossRevenue * 100) || 0,

      sgaMarketing, sgaMarketingPct: (sgaMarketing / grossRevenue * 100) || 0,
      ytdSgaMarketing, ytdSgaMarketingPct: (ytdSgaMarketing / ytdGrossRevenue * 100) || 0,

      totalSGA, totalSGAPct: (totalSGA / grossRevenue * 100) || 0,
      ytdTotalSGA, ytdTotalSGAPct: (ytdTotalSGA / ytdGrossRevenue * 100) || 0,

      ebitda, ebitdaPct: (ebitda / grossRevenue * 100) || 0,
      ytdEbitda, ytdEbitdaPct: (ytdEbitda / ytdGrossRevenue * 100) || 0,

      fixedInsurance, fixedInsurancePct: (fixedInsurance / grossRevenue * 100) || 0,
      ytdFixedInsurance, ytdFixedInsurancePct: (ytdFixedInsurance / ytdGrossRevenue * 100) || 0,

      fixedFees, fixedFeesPct: (fixedFees / grossRevenue * 100) || 0,
      ytdFixedFees, ytdFixedFeesPct: (ytdFixedFees / ytdGrossRevenue * 100) || 0,

      totalFixed, totalFixedPct: (totalFixed / grossRevenue * 100) || 0,
      ytdTotalFixed, ytdTotalFixedPct: (ytdTotalFixed / ytdGrossRevenue * 100) || 0,

      noi, noiPct: (noi / grossRevenue * 100) || 0,
      ytdNoi, ytdNoiPct: (ytdNoi / ytdGrossRevenue * 100) || 0,

      nonOpMortgage, nonOpMortgagePct: (nonOpMortgage / grossRevenue * 100) || 0,
      ytdNonOpMortgage, ytdNonOpMortgagePct: (ytdNonOpMortgage / ytdGrossRevenue * 100) || 0,

      nonOpDepr, nonOpDeprPct: (nonOpDepr / grossRevenue * 100) || 0,
      ytdNonOpDepr, ytdNonOpDeprPct: (ytdNonOpDepr / ytdGrossRevenue * 100) || 0,

      nonOpTaxes, nonOpTaxesPct: (nonOpTaxes / grossRevenue * 100) || 0,
      ytdNonOpTaxes, ytdNonOpTaxesPct: (ytdNonOpTaxes / ytdGrossRevenue * 100) || 0,

      totalNonOp, totalNonOpPct: (totalNonOp / grossRevenue * 100) || 0,
      ytdTotalNonOp, ytdTotalNonOpPct: (ytdTotalNonOp / ytdGrossRevenue * 100) || 0,

      netIncome, netIncomePct: (netIncome / grossRevenue * 100) || 0,
      ytdNetIncome, ytdNetIncomePct: (ytdNetIncome / ytdGrossRevenue * 100) || 0
    };
  };

  window.updatePLStatement = function() {
    const tbody = document.getElementById('pl-statement-tbody');
    if (!tbody) return;

    const val = getPLValues();

    tbody.innerHTML = `
      <!-- OPERATING REVENUES -->
      <tr class="border-b border-secondary/5 font-semibold bg-surface-variant/10 text-tertiary">
        <td class="py-3 pr-4" colspan="5">Operating Revenues</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Rooms Base Rates</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.roomsBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.roomsBasePct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdRooms.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdRoomsPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Food &amp; Beverage Operations</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.fbRevenues.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.fbRevenuesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdFB.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdFBPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Experiences &amp; Services Amenities</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.yachtRevenues.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.yachtRevenuesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdYacht.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdYachtPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Spa &amp; Wellness Program</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.spaRevenues.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.spaRevenuesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSpa.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSpaPct.toFixed(1)}%</td>
      </tr>
      ${val.otherRevenues > 0 ? `
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Boutique &amp; Retail POS Sales</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.otherRevenues.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.otherRevenuesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdOther.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdOtherPct.toFixed(1)}%</td>
      </tr>` : ''}
      <tr class="border-b border-secondary/15 font-bold bg-surface-variant/20">
        <td class="py-2.5 pr-4 text-xs uppercase">Gross Operating Revenue</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-mint-active">â‚±${val.grossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-mint-active">100.0%</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-mint-active">â‚±${val.ytdGrossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data text-mint-active">100.0%</td>
      </tr>
      
      <!-- COST OF GOODS SOLD -->
      <tr class="border-b border-secondary/5 font-semibold bg-surface-variant/10 text-tertiary">
        <td class="py-3 pr-4 mt-2" colspan="5">Cost of Goods Sold (COGS)</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">F&B Inventory Restocking Costs</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.cogsWine.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.cogsWinePct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdCogsWine.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdCogsWinePct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Facility Utilities &amp; Power Fuel</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.cogsFuel.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.cogsFuelPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdCogsFuel.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdCogsFuelPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Spa &amp; Wellness Materials</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.cogsSpa.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.cogsSpaPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdCogsSpa.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdCogsSpaPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/15 font-bold bg-surface-variant/20">
        <td class="py-2.5 pr-4 text-xs uppercase">Total Cost of Goods Sold</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-alert-orange">â‚±${val.totalCOGS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-alert-orange">${val.totalCOGSPct.toFixed(1)}%</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-alert-orange">â‚±${val.ytdTotalCOGS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data text-alert-orange">${val.ytdTotalCOGSPct.toFixed(1)}%</td>
      </tr>
 
      <!-- GROSS PROFIT -->
      <tr class="border-b border-secondary/15 font-bold bg-surface-variant/20 text-on-surface">
        <td class="py-2.5 pr-4 text-xs uppercase">Gross profit</td>
        <td class="py-2.5 px-4 text-right font-mono-data">â‚±${val.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data">${val.grossProfitPct.toFixed(1)}%</td>
        <td class="py-2.5 px-4 text-right font-mono-data">â‚±${val.ytdGrossProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data">${val.ytdGrossProfitPct.toFixed(1)}%</td>
      </tr>
      
      <!-- UNDISTRIBUTED OPERATING EXPENSES -->
      <tr class="border-b border-secondary/5 font-semibold bg-surface-variant/10 text-tertiary">
        <td class="py-3 pr-4 mt-2" colspan="5">Undistributed Operating Expenses (SGA)</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Staff Salaries &amp; Benefits</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.sgaSalaries.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.sgaSalariesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSgaSalaries.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSgaSalariesPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Utilities, Infrastructure &amp; IT</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.sgaUtilities.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.sgaUtilitiesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSgaUtilities.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSgaUtilitiesPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Operations &amp; Security Payroll</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.sgaYachtCrew.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.sgaYachtCrewPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSgaYachtCrew.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSgaYachtCrewPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Spa &amp; Wellness Operations Staffing</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.sgaSpaStaff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.sgaSpaStaffPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSgaSpaStaff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSgaSpaStaffPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Maintenance &amp; Facility Upkeep</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.sgaMaintenance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.sgaMaintenancePct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSgaMaintenance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSgaMaintenancePct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Administration, Guest Acquisition &amp; Marketing</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.sgaMarketing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.sgaMarketingPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdSgaMarketing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdSgaMarketingPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/15 font-bold bg-surface-variant/20">
        <td class="py-2.5 pr-4 text-xs uppercase">Total SGA Expenses</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-alert-orange">â‚±${val.totalSGA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-alert-orange">${val.totalSGAPct.toFixed(1)}%</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-alert-orange">â‚±${val.ytdTotalSGA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data text-alert-orange">${val.ytdTotalSGAPct.toFixed(1)}%</td>
      </tr>
      
      <!-- EBITDA -->
      <tr class="border-b border-secondary/15 font-bold bg-tertiary/5 text-tertiary">
        <td class="py-2.5 pr-4 text-xs uppercase">Gross Operating Profit (EBITDA)</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-tertiary">â‚±${val.ebitda.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-tertiary">${val.ebitdaPct.toFixed(1)}%</td>
        <td class="py-2.5 px-4 text-right font-mono-data text-tertiary">â‚±${val.ytdEbitda.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data text-tertiary">${val.ytdEbitdaPct.toFixed(1)}%</td>
      </tr>

      <!-- FIXED CHARGES -->
      <tr class="border-b border-secondary/5 font-semibold bg-surface-variant/10 text-tertiary">
        <td class="py-3 pr-4 mt-2" colspan="5">Fixed Charges</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Property Insurance &amp; Taxes</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.fixedInsurance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.fixedInsurancePct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdFixedInsurance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdFixedInsurancePct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/5">
        <td class="py-2 pr-4 pl-4 text-xs text-on-surface-variant">Management &amp; Brand Franchise Fees</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.fixedFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 px-4 text-right font-mono-data text-xs text-on-surface-variant">${val.fixedFeesPct.toFixed(1)}%</td>
        <td class="py-2 px-4 text-right font-mono-data">â‚±${val.ytdFixedFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2 pl-4 text-right font-mono-data text-xs text-on-surface-variant">${val.ytdFixedFeesPct.toFixed(1)}%</td>
      </tr>
      <tr class="border-b border-secondary/15 font-bold bg-surface-variant/20">
        <td class="py-2.5 pr-4 text-xs uppercase">Total Fixed Charges</td>
        <td class="py-2.5 px-4 text-right font-mono-data">â‚±${val.totalFixed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data">${val.totalFixedPct.toFixed(1)}%</td>
        <td class="py-2.5 px-4 text-right font-mono-data">â‚±${val.ytdTotalFixed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data">${val.ytdTotalFixedPct.toFixed(1)}%</td>
      </tr>

      <!-- NET OPERATING INCOME -->
      <tr class="border-b border-secondary/15 font-bold bg-surface-variant/20 text-on-surface">
        <td class="py-2.5 pr-4 text-xs uppercase">Net Operating Income (NOI)</td>
        <td class="py-2.5 px-4 text-right font-mono-data">â‚±${val.noi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 px-4 text-right font-mono-data">${val.noiPct.toFixed(1)}%</td>
        <td class="py-2.5 px-4 text-right font-mono-data">â‚±${val.ytdNoi.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="py-2.5 pl-4 text-right font-mono-data">${val.ytdNoiPct.toFixed(1)}%</td>
      </tr>
    `;
  };

  // ==========================================
  // Expense Tracker Implementation (v3)
  // ==========================================

  // Set default expense date
  const expDateInput = document.getElementById('exp-input-date');
  if (expDateInput) expDateInput.value = '2026-06-20';

  // Populate department dropdown & wire cascade
  function populateExpenseDeptDropdown() {
    const deptSel = document.getElementById('exp-input-dept');
    const subcatSel = document.getElementById('exp-input-subcat');
    const catDisplay = document.getElementById('exp-input-category-display');
    if (!deptSel || !subcatSel) return;

    deptSel.innerHTML = Object.keys(DEPT_MAP).filter(d => d !== 'Staffing & Payroll').map(d => `<option value="${d}">${d}</option>`).join('');

    function updateSubcats() {
      const dept = deptSel.value;
      const subs = DEPT_MAP[dept]?.subcategories || [];
      subcatSel.innerHTML = subs.map(s => `<option value="${s.name}" data-class="${s.category}">${s.name}</option>`).join('');
      updateCatDisplay();
    }

    function updateCatDisplay() {
      const selected = subcatSel.options[subcatSel.selectedIndex];
      if (catDisplay && selected) {
        const cls = selected.getAttribute('data-class') || 'variable';
        catDisplay.textContent = cls.charAt(0).toUpperCase() + cls.slice(1);
        catDisplay.className = `font-label-caps text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wider select-none pointer-events-none ${cls === 'fixed' ? 'bg-tertiary/10 text-tertiary' : 'bg-secondary/10 text-secondary'}`;
      }
    }

    deptSel.addEventListener('change', updateSubcats);
    subcatSel.addEventListener('change', updateCatDisplay);
    updateSubcats();
  }
  populateExpenseDeptDropdown();

  // Render expenses history table and department KPIs
  window.renderExpensesTable = function() {
    const tbody = document.querySelector('#expenses-ledger-table tbody');
    const metricFixed    = document.getElementById('exp-metric-fixed');
    const metricVariable = document.getElementById('exp-metric-variable');
    const metricCombined = document.getElementById('exp-metric-combined');
    const metricCount    = document.getElementById('exp-metric-combined-count');
    const deptBars       = document.getElementById('exp-dept-bars');

    if (!tbody) return;
    tbody.innerHTML = '';

    const query      = (document.getElementById('exp-search-query')?.value || '').toLowerCase();
    const deptFilter = document.getElementById('exp-filter-dept')?.value || 'All';

    // Totals
    let totalFixed = 0, totalVariable = 0;
    const deptTotals = {};
    expenses.forEach(exp => {
      const amount = parseFloat(exp.amount) || 0;
      if (exp.category === 'fixed') totalFixed += amount; else totalVariable += amount;
      const dept = exp.department || 'Other';
      deptTotals[dept] = (deptTotals[dept] || 0) + amount;
    });

    if (metricFixed)    metricFixed.textContent    = totalFixed.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (metricVariable) metricVariable.textContent = totalVariable.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (metricCombined) metricCombined.textContent = (totalFixed + totalVariable).toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (metricCount)    metricCount.textContent    = `${expenses.length} expense entries`;

    // Update cost classification badges
    const badgeAll = document.getElementById('badge-expense-all');
    const badgeVariable = document.getElementById('badge-expense-variable');
    const badgeFixed = document.getElementById('badge-expense-fixed');
    if (badgeAll) badgeAll.textContent = expenses.length;
    if (badgeVariable) badgeVariable.textContent = expenses.filter(e => e.category === 'variable').length;
    if (badgeFixed) badgeFixed.textContent = expenses.filter(e => e.category === 'fixed').length;

    // Department breakdown bars
    if (deptBars) {
      const grandTotal = totalFixed + totalVariable || 1;
      const deptColors = {
        'Rooms & Housekeeping': '#4A90D9', 'Food & Beverage': '#E2A840',
        'Staffing & Payroll': '#5BAD8F', 'Utilities': '#9B59B6',
        'Maintenance & Facilities': '#E67E22', 'Marketing & Admin': '#E74C3C',
        'Fixed Overheads': '#95A5A6'
      };
      deptBars.innerHTML = Object.entries(deptTotals).sort((a,b) => b[1]-a[1]).map(([dept, amt]) => {
        const pct = ((amt / grandTotal) * 100).toFixed(1);
        const color = deptColors[dept] || '#888';
        return `<div class="flex items-center gap-2 text-xs">
          <div class="w-28 shrink-0 font-label-caps text-[9px] uppercase tracking-wider text-on-surface-variant truncate">${dept.split(' ')[0]}</div>
          <div class="flex-1 h-2 bg-surface-variant rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="w-20 text-right font-mono-data text-[10px] text-alert-red shrink-0">₱${amt.toLocaleString()}</div>
          <div class="w-10 text-right font-mono-data text-[9px] text-on-surface-variant shrink-0">${pct}%</div>
        </div>`;
      }).join('');
    }

    // Filter & sort for table
    const filtered = expenses.filter(exp => {
      const matchesSearch = (exp.description || '').toLowerCase().includes(query) ||
                            (exp.vendor || '').toLowerCase().includes(query) ||
                            (exp.subcategory || '').toLowerCase().includes(query);
      const matchesDept = deptFilter === 'All' || exp.department === deptFilter;
      
      let matchesTab = true;
      if (activeExpenseTab === 'variable') {
        matchesTab = (exp.category === 'variable');
      } else if (activeExpenseTab === 'fixed') {
        matchesTab = (exp.category === 'fixed');
      }
      
      return matchesSearch && matchesDept && matchesTab;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update record count text
    const recordText = document.getElementById('expense-showing-records-text');
    if (recordText) {
      recordText.textContent = `Showing ${filtered.length} of ${expenses.length} records`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="py-4 text-center text-xs text-on-surface-variant italic">No matching expenses found.</td></tr>';
      return;
    }

    filtered.forEach(exp => {
      const row = document.createElement('tr');
      row.className = 'border-b border-secondary/10 hover:bg-surface-variant/30 transition-all';
      const dateFormatted = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const catColor = exp.category === 'fixed' ? 'text-tertiary border-tertiary/20' : 'text-secondary border-secondary/20';
      const recTag = exp.recurrence && exp.recurrence !== 'One-Time'
        ? `<span class="ml-1 border border-secondary/20 font-label-caps text-[8px] uppercase tracking-wider px-1 text-on-surface-variant">${exp.recurrence}</span>` : '';
      row.innerHTML = `
        <td class="py-3 pr-4 font-mono-data text-xs text-on-surface-variant">${dateFormatted}</td>
        <td class="py-3 px-2 text-xs text-on-surface-variant">${exp.department || 'â€”'}</td>
        <td class="py-3 px-2 text-xs text-on-surface-variant">${exp.subcategory || exp.type || 'â€”'}</td>
        <td class="py-3 px-2 font-semibold text-on-surface text-xs">${exp.description}${recTag}<br><span class="text-[9px] text-on-surface-variant font-normal">${exp.vendor || ''}</span></td>
        <td class="py-3 px-2"><span class="border ${catColor} px-1.5 py-0.5 font-label-caps text-[9px] uppercase tracking-wider font-bold">${exp.category || 'variable'}</span></td>
        <td class="py-3 px-2 text-right font-mono-data text-alert-red font-bold text-xs">â‚±${parseFloat(exp.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="py-3 px-2 text-xs text-on-surface-variant">${exp.paymentMethod || 'â€”'}</td>
        <td class="py-3 pl-2 text-right text-xs">
          <button type="button" class="text-alert-red hover:text-white transition-colors" onclick="deleteExpense('${exp.id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  };

  // Expense form submit
  const expenseForm = document.getElementById('expense-log-form');
  if (expenseForm) {
    expenseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const date   = document.getElementById('exp-input-date').value;
      const vendor = document.getElementById('exp-input-vendor')?.value || '';
      const desc   = document.getElementById('exp-input-desc').value;
      const dept   = document.getElementById('exp-input-dept')?.value || '';
      const subcatSel = document.getElementById('exp-input-subcat');
      const subcat = subcatSel ? subcatSel.value : '';
      const catClass = subcatSel?.options[subcatSel.selectedIndex]?.getAttribute('data-class') || 'variable';
      const amount = parseFloat(document.getElementById('exp-input-amount').value);
      const method = document.getElementById('exp-input-method').value;
      const recurrence = document.getElementById('exp-input-recurrence')?.value || 'One-Time';

      if (!date || !desc || isNaN(amount)) return;

      const newExpense = {
        id: 'exp-' + Date.now(),
        date, vendor, description: desc,
        department: dept, subcategory: subcat,
        category: catClass, amount, paymentMethod: method, recurrence
      };

      expenses.push(newExpense);
      saveExpenses();
      pushBackend('/admin/amalfi/expenses', newExpense);

      document.getElementById('exp-input-vendor').value = '';
      document.getElementById('exp-input-desc').value   = '';
      document.getElementById('exp-input-amount').value = '';

      renderExpensesTable();
      if (typeof updatePLStatement === 'function') updatePLStatement();
      const banner = document.createElement('div');
      banner.className = 'fixed top-4 right-4 z-[999] bg-tertiary text-dark-obsidian text-xs font-bold px-5 py-3 shadow-xl';
      banner.textContent = 'âœ“ Expense Recorded';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 2000);
    });
  }

  window.deleteExpense = function(expenseId) {
    if (confirm('Delete this expense record?')) {
      expenses = expenses.filter(exp => exp.id !== expenseId);
      saveExpenses();
      renderExpensesTable();
      if (typeof updatePLStatement === 'function') updatePLStatement();
    }
  };

  const expSearchInput = document.getElementById('exp-search-query');
  if (expSearchInput) expSearchInput.addEventListener('input', () => renderExpensesTable());

  window.filterExpensesList = function() { renderExpensesTable(); };

  // ==========================================
  // Payroll Engine
  // ==========================================

  function computeDeductions(basicSalary) {
    // SSS 2024: 4.5% employee share (capped at MSC of â‚±35,000 â†’ max â‚±1,575)
    const sssMSC = Math.min(basicSalary, 35000);
    const sss = Math.round(sssMSC * 0.045);

    // PhilHealth 2024: 5% total premium; employee pays 2.5% (capped monthly at â‚±2,125)
    const philhealthBase = Math.min(basicSalary, 85000);
    const philhealth = Math.round(philhealthBase * 0.025);

    // HDMF 2024: 2% of basic, max â‚±200 employee share
    const hdmf = Math.min(Math.round(basicSalary * 0.02), 200);

    // BIR 2024 graduated monthly withholding tax (simplified)
    const taxableMonthly = basicSalary - sss - philhealth - hdmf;
    let withholding = 0;
    if (taxableMonthly > 83333) {
      withholding = 25000 + (taxableMonthly - 83333) * 0.32;
    } else if (taxableMonthly > 33333) {
      withholding = 10000 + (taxableMonthly - 33333) * 0.30;
    } else if (taxableMonthly > 20833) {
      withholding = 2500 + (taxableMonthly - 20833) * 0.25;
    } else if (taxableMonthly > 20833 * 0.5) {
      withholding = (taxableMonthly - 10417) * 0.20;
    } else {
      withholding = 0; // exempt â‰¤ â‚±250,000 annual
    }
    withholding = Math.max(0, Math.round(withholding));

    return { sss, philhealth, hdmf, withholding };
  }

  function renderStaffRoster() {
    const tbody = document.querySelector('#staff-roster-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    staff.forEach(s => {
      if (!s.isActive) return;
      const ded = computeDeductions(s.basicSalary);
      const netPay = s.basicSalary - ded.sss - ded.philhealth - ded.hdmf - ded.withholding;
      const row = document.createElement('tr');
      row.className = 'border-b border-secondary/10 hover:bg-surface-variant/20 transition-all';
      row.innerHTML = `
        <td class="py-3 px-3 font-semibold text-on-surface text-xs">${s.name}</td>
        <td class="py-3 px-3 text-xs text-on-surface-variant">${s.position}</td>
        <td class="py-3 px-3 text-xs text-on-surface-variant">${s.department}</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs">â‚±${s.basicSalary.toLocaleString()}</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs text-on-surface-variant">(â‚±${ded.sss.toLocaleString()})</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs text-on-surface-variant">(â‚±${ded.philhealth.toLocaleString()})</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs text-on-surface-variant">(â‚±${ded.hdmf.toLocaleString()})</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs text-on-surface-variant">(â‚±${ded.withholding.toLocaleString()})</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs font-bold text-mint-active">â‚±${netPay.toLocaleString()}</td>
        <td class="py-3 px-3 text-right">
          <button onclick="deleteStaff('${s.id}')" class="text-alert-red text-xs hover:underline">Remove</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Summary row
    const totals = staff.filter(s => s.isActive).reduce((acc, s) => {
      const d = computeDeductions(s.basicSalary);
      acc.gross += s.basicSalary;
      acc.sss += d.sss; acc.ph += d.philhealth; acc.hdmf += d.hdmf; acc.tax += d.withholding;
      acc.net += s.basicSalary - d.sss - d.philhealth - d.hdmf - d.withholding;
      return acc;
    }, { gross: 0, sss: 0, ph: 0, hdmf: 0, tax: 0, net: 0 });

    const summaryRow = document.createElement('tr');
    summaryRow.className = 'bg-surface-variant/20 font-bold border-t border-secondary/20';
    summaryRow.innerHTML = `
      <td colspan="3" class="py-3 px-3 text-xs font-label-caps tracking-wider text-on-surface-variant uppercase">TOTALS</td>
      <td class="py-3 px-3 text-right font-mono-data text-xs text-on-surface">â‚±${totals.gross.toLocaleString()}</td>
      <td class="py-3 px-3 text-right font-mono-data text-xs text-alert-red">(â‚±${totals.sss.toLocaleString()})</td>
      <td class="py-3 px-3 text-right font-mono-data text-xs text-alert-red">(â‚±${totals.ph.toLocaleString()})</td>
      <td class="py-3 px-3 text-right font-mono-data text-xs text-alert-red">(â‚±${totals.hdmf.toLocaleString()})</td>
      <td class="py-3 px-3 text-right font-mono-data text-xs text-alert-red">(â‚±${totals.tax.toLocaleString()})</td>
      <td class="py-3 px-3 text-right font-mono-data text-xs font-bold text-mint-active">â‚±${totals.net.toLocaleString()}</td>
      <td></td>
    `;
    tbody.appendChild(summaryRow);

    // Update summary KPIs
    const el = id => document.getElementById(id);
    if (el('payroll-gross')) el('payroll-gross').textContent = totals.gross.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (el('payroll-deductions')) el('payroll-deductions').textContent = (totals.sss + totals.ph + totals.hdmf + totals.tax).toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (el('payroll-net')) el('payroll-net').textContent = totals.net.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (el('payroll-headcount')) el('payroll-headcount').textContent = staff.filter(s => s.isActive).length + ' staff';
  }

  function renderPayrollHistory() {
    const tbody = document.querySelector('#payroll-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (payrollRuns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-on-surface-variant italic">No payroll runs yet. Use "Run Payroll" to generate the first run.</td></tr>';
      return;
    }
    const grouped = {};
    payrollRuns.forEach(r => {
      if (!grouped[r.month]) grouped[r.month] = { runs: [], total: 0 };
      grouped[r.month].runs.push(r);
      grouped[r.month].total += r.netPay;
    });
    Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0])).forEach(([month, data]) => {
      const grossTotal = data.runs.reduce((s,r) => s + r.grossPay, 0);
      const dedTotal   = data.runs.reduce((s,r) => s + r.sssDeduction + r.philhealthDeduction + r.hdmfDeduction + r.withholdingTax, 0);
      const row = document.createElement('tr');
      row.className = 'border-b border-secondary/10 hover:bg-surface-variant/20 transition-all';
      row.innerHTML = `
        <td class="py-3 px-3 font-semibold text-on-surface text-xs">${new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
        <td class="py-3 px-3 text-xs text-on-surface-variant">${data.runs.length} employees</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs">â‚±${grossTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs text-alert-red">(â‚±${dedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })})</td>
        <td class="py-3 px-3 text-right font-mono-data text-xs font-bold text-mint-active">â‚±${data.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      `;
      tbody.appendChild(row);
    });
  }

  // Add staff form
  const addStaffForm = document.getElementById('add-staff-form');
  if (addStaffForm) {
    addStaffForm.addEventListener('submit', e => {
      e.preventDefault();
      const name     = document.getElementById('staff-input-name').value.trim();
      const position = document.getElementById('staff-input-position').value.trim();
      const dept     = document.getElementById('staff-input-dept').value;
      const salary   = parseFloat(document.getElementById('staff-input-salary').value);
      if (!name || !position || isNaN(salary)) return;
      const newStaff = { id: 'staff-' + Date.now(), name, position, department: dept, basicSalary: salary, isActive: true };
      staff.push(newStaff);
      saveStaff();
      pushBackend('/admin/amalfi/staff', newStaff);
      addStaffForm.reset();
      renderStaffRoster();
    });
  }

  window.deleteStaff = function(staffId) {
    if (confirm('Remove this staff member from the roster?')) {
      staff = staff.map(s => s.id === staffId ? { ...s, isActive: false } : s);
      saveStaff();
      const inactiveStaff = staff.find(s => s.id === staffId);
      if (inactiveStaff) pushBackend('/admin/amalfi/staff', inactiveStaff);
      renderStaffRoster();
    }
  };

  // Run Payroll button
  const runPayrollBtn = document.getElementById('run-payroll-btn');
  if (runPayrollBtn) {
    runPayrollBtn.addEventListener('click', () => {
      const monthInput = document.getElementById('payroll-month-input')?.value;
      if (!monthInput) { alert('Please select a payroll month.'); return; }

      const alreadyRan = payrollRuns.some(r => r.month === monthInput);
      if (alreadyRan) {
        if (!confirm(`Payroll for ${monthInput} has already been run. Run again and post duplicate entries?`)) return;
      }

      const activeStaff = staff.filter(s => s.isActive);
      if (activeStaff.length === 0) { alert('No active staff in the roster.'); return; }

      let grossTotal = 0, netTotal = 0, deductionTotal = 0;
      const payrollDetails = [];

      activeStaff.forEach(s => {
        const d = computeDeductions(s.basicSalary);
        const netPay = s.basicSalary - d.sss - d.philhealth - d.hdmf - d.withholding;
        grossTotal += s.basicSalary;
        netTotal += netPay;
        deductionTotal += d.sss + d.philhealth + d.hdmf + d.withholding;

        const runDetail = {
          id: 'pr-' + Date.now() + '-' + s.id,
          month: monthInput, employeeId: s.id, employeeName: s.name, position: s.position,
          grossPay: s.basicSalary, sssDeduction: d.sss, philhealthDeduction: d.philhealth,
          hdmfDeduction: d.hdmf, withholdingTax: d.withholding, netPay,
          dateProcessed: new Date().toISOString().split('T')[0]
        };
        payrollRuns.push(runDetail);
        payrollDetails.push(runDetail);
      });
      savePayrollRuns();
      pushBackend('/admin/amalfi/payroll-runs', {
        id: 'payroll-' + Date.now(),
        payrollMonth: monthInput,
        grossPay: grossTotal,
        deductions: deductionTotal,
        netPay: netTotal,
        staffCount: activeStaff.length,
        details: payrollDetails
      });

      // Auto-post to expenses
      const payDate = monthInput + '-01';
      expenses.push({
        id: 'exp-pr-sal-' + Date.now(),
        date: payDate, vendor: `Payroll Run â€” ${monthInput}`,
        description: `Regular Salaries â€” ${new Date(payDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        department: 'Staffing & Payroll', subcategory: 'Regular Salaries',
        category: 'fixed', amount: netTotal, paymentMethod: 'Bank Transfer', recurrence: 'Monthly'
      });
      expenses.push({
        id: 'exp-pr-ded-' + Date.now(),
        date: payDate, vendor: `Payroll Run â€” ${monthInput}`,
        description: `SSS / PhilHealth / HDMF â€” ${new Date(payDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        department: 'Staffing & Payroll', subcategory: 'SSS / PhilHealth / HDMF',
        category: 'fixed', amount: deductionTotal, paymentMethod: 'Bank Transfer', recurrence: 'Monthly'
      });
      saveExpenses();
      expenses
        .filter(exp => exp.date === payDate && String(exp.id).startsWith('exp-pr-'))
        .slice(-2)
        .forEach(exp => pushBackend('/admin/amalfi/expenses', exp));

      renderPayrollHistory();
      renderStaffRoster();
      renderExpensesTable();
      if (typeof updatePLStatement === 'function') updatePLStatement();

      alert(`âœ“ Payroll for ${monthInput} processed.\n\nGross: â‚±${grossTotal.toLocaleString()}\nDeductions: â‚±${deductionTotal.toLocaleString()}\nNet Pay: â‚±${netTotal.toLocaleString()}\n\nEntries posted to Expense Tracker.`);
    });
  }

  // Wire up view entry
  const origNavLinks = document.querySelectorAll('.nav-link');
  origNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      const view = link.getAttribute('data-view');
      if (view === 'payroll') {
        renderStaffRoster();
        renderPayrollHistory();
        // Default payroll month to current
        const pm = document.getElementById('payroll-month-input');
        if (pm && !pm.value) pm.value = new Date().toISOString().slice(0, 7);
      }
    });
  });

  // Expense Tab Switcher Click Listeners
  document.querySelectorAll('.expense-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-expense-tab');
      activeExpenseTab = tabName;
      
      // Update active tab styling
      document.querySelectorAll('.expense-tab-btn').forEach(b => {
        if (b === btn) {
          b.className = "expense-tab-btn px-2 py-1 bg-tertiary text-dark-obsidian text-[10px] font-semibold transition-all hover:brightness-110 flex items-center gap-1 shrink-0";
          const badge = b.querySelector('span');
          if (badge) {
            badge.className = "bg-dark-obsidian/15 text-dark-obsidian text-[9px] px-1 py-px font-bold";
          }
        } else {
          b.className = "expense-tab-btn px-2 py-1 border border-secondary/35 text-secondary hover:text-on-surface text-[10px] transition-all flex items-center gap-1 shrink-0";
          const badge = b.querySelector('span');
          if (badge) {
            badge.className = "bg-secondary/15 text-secondary text-[9px] px-1 py-px font-bold";
          }
        }
      });
      
      // Re-render table
      renderExpensesTable();
    });
  });

  // Initial render
  renderStaffRoster();
  renderPayrollHistory();
  renderGlobalFilters('overview');
  syncBackendState();

});
