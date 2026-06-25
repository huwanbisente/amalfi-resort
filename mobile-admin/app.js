document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = '/api/v1';
  let backendOnline = false;

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Amalfi backend request failed.');
    return data;
  }

  const villaNameByRoomType = {
    "Amalfi Suite": "Amalfi Suite",
    "Positano Vista": "Positano Vista",
    "Ravello Suite": "Ravello Suite",
    "Capri Vista": "Capri Vista",
    "Sirenuse Suite": "Sirenuse Suite",
    "Sunset Pavilion": "Sunset Pavilion"
  };

  const villaIdByRoomType = {
    "Amalfi Suite": "Villa 1",
    "Positano Vista": "Villa 2",
    "Ravello Suite": "Villa 3",
    "Capri Vista": "Villa 4",
    "Sirenuse Suite": "Villa 5",
    "Sunset Pavilion": "Villa 6"
  };

  function formatMoney(value) {
    return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDateRange(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 'Dates pending';
    return `${checkIn.slice(5)} - ${checkOut.slice(5)}`;
  }

  function mapBackendBooking(row) {
    const status = String(row.status || '').toUpperCase();
    const payment = String(row.payment_status || '').toUpperCase();
    const roomType = row.room_type || 'Amalfi Suite';
    let bookingStatus = 'Confirmed';
    if (status === 'PENDING_VERIFICATION') bookingStatus = 'Pending Verification';
    if (status === 'CHECKED_IN') bookingStatus = 'Checked In';
    if (status === 'CHECKED_OUT') bookingStatus = 'Checked Out';
    if (status === 'PAYMENT_REJECTED' || status === 'CANCELLED') bookingStatus = 'Cancelled';

    let paymentStatus = payment || 'UNPAID';
    if (payment === 'PAID' || payment === 'FULL') paymentStatus = 'PAID';
    if (payment === 'PAYMENT_REVIEW' || status === 'PENDING_VERIFICATION') paymentStatus = 'PENDING_VERIFICATION';
    if (status === 'PAYMENT_REJECTED') paymentStatus = 'REJECTED';

    return {
      id: row.booking_ref,
      bookingRef: row.booking_ref,
      guest: row.full_name,
      villa: villaIdByRoomType[roomType] || row.unit_id || roomType,
      villaName: villaNameByRoomType[roomType] || roomType,
      dates: formatDateRange(row.check_in, row.check_out),
      checkIn: row.check_in,
      checkOut: row.check_out,
      created: row.created_at ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
      bookingStatus,
      paymentStatus,
      baseRate: Number(row.total_price || 0),
      folio: formatMoney(row.total_price || 0),
      isBlockout: false,
      refNo: row.booking_ref
    };
  }

  async function syncBackendState() {
    try {
      const data = await apiFetch('/admin/amalfi/bootstrap');
      backendOnline = true;

      if (Array.isArray(data.reservations)) {
        reservations = data.reservations.map(mapBackendBooking);
        localStorage.setItem('amalfi_reservations', JSON.stringify(reservations));
      }
      if (Array.isArray(data.requests)) {
        requests = data.requests.map(req => ({
          id: req.id,
          category: req.category,
          title: req.title,
          details: req.details,
          status: String(req.status || 'Pending').toUpperCase(),
          guest: req.guest || 'Guest'
        }));
        localStorage.setItem('amalfi_requests', JSON.stringify(requests));
      }
      if (data.villaStatuses) {
        villaStatuses = data.villaStatuses;
        localStorage.setItem('amalfi_villa_statuses', JSON.stringify(villaStatuses));
      }
      if (Array.isArray(data.products)) {
        localStorage.setItem('amalfi_products_v2', JSON.stringify(data.products));
      }
      if (Array.isArray(data.posSales)) {
        localStorage.setItem('amalfi_pos_sales_v2', JSON.stringify(data.posSales));
      }
    } catch (err) {
      backendOnline = false;
      console.warn('Using local mobile-admin data:', err.message);
    }
  }

  // Mobile Theme Toggle Management
  const themeToggleBtn = document.getElementById('mobile-theme-toggle');
  const themeIcon = document.getElementById('mobile-theme-icon');
  
  let currentTheme = localStorage.getItem('amalfi_theme') || 'dark';
  document.documentElement.className = currentTheme;
  updateThemeIcon(currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      currentTheme = 'light';
    } else {
      document.documentElement.classList.add('dark');
      currentTheme = 'dark';
    }
    localStorage.setItem('amalfi_theme', currentTheme);
    updateThemeIcon(currentTheme);
  });

  function updateThemeIcon(theme) {
    if (theme === 'dark') {
      themeIcon.textContent = 'light_mode';
    } else {
      themeIcon.textContent = 'dark_mode';
    }
  }

  // Cross-window Theme Sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'amalfi_theme') {
      const newTheme = e.newValue || 'dark';
      document.documentElement.className = newTheme;
      updateThemeIcon(newTheme);
    }
  });

  // Shared Data Initializer
  const DEFAULT_RESERVATIONS = [
    {
      id: "alf-1029",
      guest: "Sophia Loren",
      villa: "Villa 1",
      villaName: "Amalfi Suite",
      dates: "June 18 - June 25",
      checkIn: "2026-06-18",
      checkOut: "2026-06-25",
      created: "June 10, 2026",
      bookingStatus: "Checked In",
      paymentStatus: "PAID",
      baseRate: 57950,
      addonWine: false,
      addonYacht: false,
      addonSpa: true,
      addonChef: false,
      folio: "66,450.00",
      isBlockout: false
    },
    {
      id: "alf-9831",
      guest: "George Clooney",
      villa: "Villa 5",
      villaName: "Sirenuse Suite",
      dates: "June 22 - June 27",
      checkIn: "2026-06-22",
      checkOut: "2026-06-27",
      created: "June 12, 2026",
      bookingStatus: "Confirmed",
      paymentStatus: "PARTIAL",
      baseRate: 95400,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      folio: "95,400.00",
      isBlockout: false
    },
    {
      id: "alf-4402",
      guest: "Lord Marcus Harrington",
      villa: "Villa 6",
      villaName: "Sunset Pavilion",
      dates: "June 24 - June 28",
      checkIn: "2026-06-24",
      checkOut: "2026-06-28",
      created: "June 15, 2026",
      bookingStatus: "Confirmed",
      paymentStatus: "UNPAID",
      baseRate: 42100,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      folio: "42,100.00",
      isBlockout: false
    }
  ];

  const DEFAULT_REQUESTS = [
    {
      id: "req-1",
      category: "Dietary & Provisioning",
      title: "Vintage Wine & Cellar Stocking",
      details: "Sassicaia 2016, organic tomatoes, gluten-free pastries stocked in kitchen.",
      status: "CONFIRMED",
      guest: "Lord Marcus Harrington"
    },
    {
      id: "req-2",
      category: "Dedicated Staff",
      title: "24/7 Private Butler Service",
      details: "Assigned butler fluent in English and Italian to handle dinner bookings.",
      status: "CONFIRMED",
      guest: "Lord Marcus Harrington"
    },
    {
      id: "req-3",
      category: "Room Presets",
      title: "Micro-Climate Preset (21°C)",
      details: "Set main suite temperature to 21°C, low humidity. High-density pillows.",
      status: "PENDING",
      guest: "Lord Marcus Harrington"
    }
  ];

  const DEFAULT_VILLA_STATUSES = {
    "Villa 1": "AVAILABLE",
    "Villa 2": "AVAILABLE",
    "Villa 3": "MAINTENANCE",
    "Villa 4": "AVAILABLE",
    "Villa 5": "AVAILABLE",
    "Villa 6": "AVAILABLE"
  };

  // Seed localStorage if not exists
  if (!localStorage.getItem('amalfi_reservations')) {
    localStorage.setItem('amalfi_reservations', JSON.stringify(DEFAULT_RESERVATIONS));
  }
  if (!localStorage.getItem('amalfi_requests')) {
    localStorage.setItem('amalfi_requests', JSON.stringify(DEFAULT_REQUESTS));
  }
  if (!localStorage.getItem('amalfi_villa_statuses')) {
    localStorage.setItem('amalfi_villa_statuses', JSON.stringify(DEFAULT_VILLA_STATUSES));
  }

  // DOM Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  
  // Lists
  const movementsList = document.getElementById('movements-list');
  const serviceList = document.getElementById('service-list');
  const verificationList = document.getElementById('verification-list');
  const transactionsList = document.getElementById('transactions-list');
  const roomOpsGrid = document.getElementById('room-ops-grid');
  const roomOpsMapList = document.getElementById('room-ops-map-list');
  
  // Sanctuary Map sub-view controls
  const roomOpsTitle = document.getElementById('room-ops-title');
  const opsToggleMap = document.getElementById('ops-toggle-map');
  const opsToggleMatrix = document.getElementById('ops-toggle-matrix');
  const opsDateNav = document.getElementById('ops-date-nav');
  const opsSelectedDateInput = document.getElementById('ops-selected-date');
  const opsDatePrev = document.getElementById('ops-date-prev');
  const opsDateNext = document.getElementById('ops-date-next');
  const opsBoardGrid = document.getElementById('ops-board-grid');
  const opsBoardDetail = document.getElementById('ops-board-detail');
  
  // Forms & Inputs
  const manualBookingForm = document.getElementById('manual-booking-form');
  const ledgerPrivacyToggle = document.getElementById('ledger-privacy-toggle');
  
  // Load State from LocalStorage
  let reservations = JSON.parse(localStorage.getItem('amalfi_reservations'));
  let requests = JSON.parse(localStorage.getItem('amalfi_requests'));
  let villaStatuses = JSON.parse(localStorage.getItem('amalfi_villa_statuses'));
  let opsCurrentSubView = 'map'; // 'map' or 'matrix'
  let opsSelectedCellVilla = 'Villa 1';
  let opsSelectedCellDate = '2026-06-18';



  // Navigation Logic
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetPanel = btn.getAttribute('data-tab');
      
      // Update active tab button
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show/Hide Panels
      panels.forEach(p => {
        if (p.id === targetPanel + '-panel') {
          p.classList.remove('hidden');
        } else {
          p.classList.add('hidden');
        }
      });

      // Refresh Data on tab entry
      refreshData();
    });
  });

  // Sub-view Toggles for Room Operations
  if (opsToggleMap && opsToggleMatrix) {
    opsToggleMap.addEventListener('click', () => {
      opsCurrentSubView = 'map';
      renderRoomOpsTab();
    });
    
    opsToggleMatrix.addEventListener('click', () => {
      opsCurrentSubView = 'matrix';
      renderRoomOpsTab();
    });
  }

  // Date Navigation for Sanctuary Map
  if (opsSelectedDateInput) {
    opsSelectedDateInput.addEventListener('change', () => {
      opsSelectedCellDate = opsSelectedDateInput.value;
      renderOpsMapList();
    });
  }

  if (opsDatePrev && opsSelectedDateInput) {
    opsDatePrev.addEventListener('click', () => {
      adjustOpsDate(-7);
    });
  }

  if (opsDateNext && opsSelectedDateInput) {
    opsDateNext.addEventListener('click', () => {
      adjustOpsDate(7);
    });
  }

  function adjustOpsDate(days) {
    const currentDate = new Date(opsSelectedDateInput.value);
    if (!isNaN(currentDate.getTime())) {
      currentDate.setDate(currentDate.getDate() + days);
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const nextDateStr = `${yyyy}-${mm}-${dd}`;
      opsSelectedDateInput.value = nextDateStr;
      opsSelectedCellDate = nextDateStr;
      renderOpsMapList();
    }
  }



  // Reload data from localStorage
  function reloadLocalStorage() {
    reservations = JSON.parse(localStorage.getItem('amalfi_reservations')) || [];
    requests = JSON.parse(localStorage.getItem('amalfi_requests')) || [];
    villaStatuses = JSON.parse(localStorage.getItem('amalfi_villa_statuses')) || {};
  }

  // Refreshes data displays
  async function refreshData() {
    reloadLocalStorage();
    await syncBackendState();
    renderMovementsTab();
    renderVerificationTab();
    renderLedgerTab();
    renderRoomOpsTab();
  }

  // 1. Render movements / today's activities
  function renderMovementsTab() {
    movementsList.innerHTML = '';
    serviceList.innerHTML = '';
    
    // Sort arrivals and active stays
    const todayReservations = reservations.filter(res => {
      return res.bookingStatus === 'Checked In' || res.bookingStatus === 'Confirmed' || res.bookingStatus === 'Pending Verification';
    });

    if (todayReservations.length === 0) {
      movementsList.innerHTML = '<div class="text-xs text-stitch-muted italic py-2">No guest movements registered today.</div>';
    } else {
      todayReservations.forEach(res => {
        let statusBadge = '';
        if (res.bookingStatus === 'Checked In') {
          statusBadge = `<span class="bg-stitch-mint bg-opacity-10 text-stitch-mint border border-stitch-mint border-opacity-35 text-[9px] px-2.5 py-1 uppercase tracking-widest font-bold">Checked In</span>`;
        } else if (res.bookingStatus === 'Pending Verification') {
          statusBadge = `<span class="bg-stitch-gold bg-opacity-10 text-stitch-gold border border-stitch-gold border-opacity-35 text-[9px] px-2.5 py-1 uppercase tracking-widest font-bold">Pending Approval</span>`;
        } else {
          statusBadge = `<span class="bg-stitch-gold bg-opacity-10 text-stitch-gold border border-stitch-gold border-opacity-35 text-[9px] px-2.5 py-1 uppercase tracking-widest font-bold">Confirmed</span>`;
        }

        const div = document.createElement('div');
        div.className = 'p-4 border border-stitch-platinum border-opacity-5 bg-stitch-midnight bg-opacity-40 flex items-center justify-between transition';
        div.innerHTML = `
          <div>
            <div class="text-xs font-bold text-stitch-platinum">${res.guest}</div>
            <div class="text-[10px] text-stitch-muted mt-1 font-medium">${res.villaName} • ${res.dates}</div>
          </div>
          <div>${statusBadge}</div>
        `;
        movementsList.appendChild(div);
      });
    }

    // Render Concierge Service Requests
    if (requests.length === 0) {
      serviceList.innerHTML = '<div class="text-xs text-stitch-muted italic py-2">No butler requests submitted.</div>';
    } else {
      requests.forEach(req => {
        let reqStatus = '';
        if (req.status === 'CONFIRMED') {
          reqStatus = `<span class="text-stitch-mint flex items-center gap-1.5 font-bold"><span class="h-2 w-2 rounded-full bg-stitch-mint shadow-mint-pulse"></span>Confirmed</span>`;
        } else {
          reqStatus = `<span class="text-stitch-muted flex items-center gap-1.5 font-bold"><span class="h-2 w-2 rounded-full bg-stitch-muted bg-opacity-50"></span>Pending</span>`;
        }

        const div = document.createElement('div');
        div.className = 'p-4 border border-stitch-platinum border-opacity-5 bg-stitch-midnight bg-opacity-40 flex flex-col justify-between gap-2 transition';
        div.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <div class="text-[9px] uppercase tracking-widest text-stitch-gold font-bold">${req.category}</div>
              <h4 class="text-xs font-bold text-stitch-platinum mt-0.5">${req.title}</h4>
            </div>
            <div class="text-[10px] font-bold uppercase tracking-wider">${reqStatus}</div>
          </div>
          <p class="text-[10px] text-stitch-muted leading-normal font-medium">${req.details}</p>
          <div class="flex justify-between items-center mt-2 pt-2 border-t border-stitch-platinum border-opacity-5">
            <span class="text-[9px] text-stitch-muted font-semibold">Guest: ${req.guest}</span>
            ${req.status === 'PENDING' ? `
              <button class="approve-req-btn text-[9px] text-stitch-dark font-bold uppercase bg-stitch-gold px-2.5 py-1" data-id="${req.id}">
                Approve
              </button>
            ` : ''}
          </div>
        `;
        serviceList.appendChild(div);
      });

      // Add listeners to approve buttons
      document.querySelectorAll('.approve-req-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const reqId = e.target.getAttribute('data-id');
          approveRequest(reqId);
        });
      });
    }
  }

  async function approveRequest(reqId) {
    const list = JSON.parse(localStorage.getItem('amalfi_requests')) || [];
    const index = list.findIndex(r => r.id === reqId);
    if (index !== -1) {
      list[index].status = 'CONFIRMED';
      if (backendOnline) {
        try {
          await apiFetch('/admin/amalfi/service-requests', {
            method: 'POST',
            body: JSON.stringify(list[index])
          });
        } catch (err) {
          console.warn('Backend service request approval failed:', err.message);
        }
      }
      localStorage.setItem('amalfi_requests', JSON.stringify(list));
      refreshData();
    }
  }

  // 2. Render Verification Tab
  function renderVerificationTab() {
    verificationList.innerHTML = '';
    const pendingBookings = reservations.filter(res => res.paymentStatus === 'PENDING_VERIFICATION');

    if (pendingBookings.length === 0) {
      verificationList.innerHTML = `
        <div class="flex flex-col items-center justify-center text-center py-10 gap-3">
          <span class="material-symbols-outlined text-4xl text-stitch-muted text-opacity-35">task_alt</span>
          <span class="text-xs text-stitch-muted italic font-medium">No pending payment proofs. All reservations verified.</span>
        </div>
      `;
    } else {
      pendingBookings.forEach(res => {
        const div = document.createElement('div');
        div.className = 'p-5 border border-stitch-platinum border-opacity-5 bg-stitch-midnight bg-opacity-40 flex flex-col gap-4 transition';
        div.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <div class="text-[10px] tracking-widest text-stitch-gold font-mono font-bold uppercase">${res.id}</div>
              <h4 class="text-sm font-bold text-stitch-platinum mt-0.5">${res.guest}</h4>
              <p class="text-[10px] text-stitch-muted mt-1 font-semibold">${res.villaName} • $${res.folio}</p>
            </div>
            <span class="text-[9px] uppercase font-bold text-stitch-muted bg-white bg-opacity-5 px-2.5 py-1">UNVERIFIED</span>
          </div>

          <div class="p-3 border border-stitch-platinum border-opacity-5 bg-stitch-dark flex flex-col gap-2 relative">
            <span class="text-[9px] uppercase tracking-widest text-stitch-muted font-bold">Simulated Receipt Slip</span>
            <div class="h-28 bg-[#1A2536] bg-opacity-40 flex items-center justify-center border border-stitch-platinum border-opacity-5">
              <span class="material-symbols-outlined text-3xl text-stitch-platinum text-opacity-20 mr-2">receipt_long</span>
              <div class="text-left">
                <div class="text-[9px] uppercase tracking-wider text-stitch-muted">Secure Digital Transfer</div>
                <div class="text-[10px] text-stitch-platinum font-mono font-bold mt-0.5">REF NO: ${res.refNo || 'N/A'}</div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <button class="verify-reject-btn py-2 border border-opacity-20 border-stitch-gold hover:bg-stitch-gold hover:bg-opacity-5 text-stitch-gold text-xs font-bold uppercase tracking-wider transition" data-id="${res.id}" data-action="reject">
              Reject Proof
            </button>
            <button class="verify-approve-btn py-2 bg-stitch-mint hover:bg-opacity-95 text-stitch-dark text-xs font-bold uppercase tracking-wider transition" data-id="${res.id}" data-action="approve">
              Verify & Approve
            </button>
          </div>
        `;
        verificationList.appendChild(div);
      });

      // Add listeners to actions
      document.querySelectorAll('.verify-reject-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const resId = e.currentTarget.getAttribute('data-id');
          processVerification(resId, 'reject');
        });
      });

      document.querySelectorAll('.verify-approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const resId = e.currentTarget.getAttribute('data-id');
          processVerification(resId, 'approve');
        });
      });
    }
  }

  async function processVerification(resId, action) {
    const list = JSON.parse(localStorage.getItem('amalfi_reservations')) || [];
    const index = list.findIndex(r => r.id === resId);
    if (index !== -1) {
      const bookingRef = list[index].bookingRef || list[index].id;
      if (backendOnline && bookingRef) {
        try {
          await apiFetch('/admin/verify', {
            method: 'POST',
            body: JSON.stringify({
              booking_ref: bookingRef,
              decision: action,
              notes: action === 'approve' ? 'Verified from Amalfi mobile admin.' : 'Rejected from Amalfi mobile admin.',
              admin_id: 'amalfi-mobile-admin'
            })
          });
        } catch (err) {
          console.warn('Backend verification failed:', err.message);
        }
      }
      if (action === 'approve') {
        list[index].bookingStatus = 'Confirmed';
        list[index].paymentStatus = 'PAID';
      } else {
        list[index].bookingStatus = 'Cancelled';
        list[index].paymentStatus = 'REJECTED';
      }
      localStorage.setItem('amalfi_reservations', JSON.stringify(list));
      refreshData();
    }
  }

  // 3. Render Ledger Tab
  function renderLedgerTab() {
    transactionsList.innerHTML = '';
    
    // Sum charges
    let totalIncome = 0;
    let pendingIncome = 0;

    reservations.forEach(res => {
      const folioValue = parseFloat(res.folio.replace(/,/g, ''));
      if (res.paymentStatus === 'PAID') {
        totalIncome += folioValue;
      } else if (res.paymentStatus === 'PENDING_VERIFICATION') {
        pendingIncome += folioValue;
      }
    });

    document.getElementById('ledger-total-income').textContent = `$${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    document.getElementById('ledger-pending-income').textContent = `$${pendingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    if (reservations.length === 0) {
      transactionsList.innerHTML = '<tr><td colspan="3" class="text-xs text-stitch-muted italic py-4 text-center">No transactions ledger entries found.</td></tr>';
    } else {
      reservations.forEach(res => {
        let textClass = 'text-stitch-mint';
        let statusLabel = 'PAID';
        if (res.paymentStatus === 'PENDING_VERIFICATION') {
          textClass = 'text-stitch-gold';
          statusLabel = 'PENDING';
        } else if (res.paymentStatus === 'REJECTED') {
          textClass = 'text-[#E64A19]';
          statusLabel = 'REJECTED';
        } else if (res.paymentStatus === 'UNPAID') {
          textClass = 'text-stitch-muted';
          statusLabel = 'UNPAID';
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b border-stitch-platinum border-opacity-5 hover:bg-white hover:bg-opacity-5 transition';
        tr.innerHTML = `
          <td class="py-3 pr-2 text-xs font-bold text-stitch-platinum truncate max-w-[130px]">${res.guest}</td>
          <td class="py-3 px-2 text-xs text-stitch-muted font-mono">${res.villa.replace("Villa ", "V")}</td>
          <td class="py-3 pl-2 text-xs font-mono text-right font-bold ${textClass}">
            <span class="ledger-amt">$${res.folio}</span>
            <div class="text-[8px] uppercase tracking-wider opacity-85 mt-0.5">${statusLabel}</div>
          </td>
        `;
        transactionsList.appendChild(tr);
      });
    }

    applyLedgerPrivacyFilter();
  }

  // Privacy obscuring logic
  ledgerPrivacyToggle.addEventListener('change', applyLedgerPrivacyFilter);

  function applyLedgerPrivacyFilter() {
    const isChecked = ledgerPrivacyToggle.checked;
    const targets = document.querySelectorAll('.ledger-amt, #ledger-total-income, #ledger-pending-income');
    targets.forEach(el => {
      if (isChecked) {
        el.classList.add('blur-filter');
      } else {
        el.classList.remove('blur-filter');
      }
    });
  }

  // 4. Render Room Ops Tab
  function renderRoomOpsTab() {
    if (opsCurrentSubView === 'map') {
      roomOpsTitle.textContent = "Sanctuary Map";
      roomOpsMapList.classList.remove('hidden');
      opsDateNav.classList.remove('hidden');
      roomOpsGrid.classList.add('hidden');
      
      opsToggleMap.className = "flex-1 py-2 text-[10px] uppercase tracking-widest font-bold transition-all bg-stitch-gold text-stitch-dark";
      opsToggleMatrix.className = "flex-1 py-2 text-[10px] uppercase tracking-widest font-bold transition-all text-stitch-muted hover:text-stitch-platinum";
      
      renderOpsMapList();
    } else {
      roomOpsTitle.textContent = "Villa Status Matrix";
      roomOpsMapList.classList.add('hidden');
      opsDateNav.classList.add('hidden');
      roomOpsGrid.classList.remove('hidden');
      
      opsToggleMatrix.className = "flex-1 py-2 text-[10px] uppercase tracking-widest font-bold transition-all bg-stitch-gold text-stitch-dark";
      opsToggleMap.className = "flex-1 py-2 text-[10px] uppercase tracking-widest font-bold transition-all text-stitch-muted hover:text-stitch-platinum";
      
      renderOpsMatrix();
    }
  }

  function renderOpsMatrix() {
    roomOpsGrid.innerHTML = '';
    const roomKeys = Object.keys(villaStatuses);
    
    roomKeys.forEach(room => {
      const status = villaStatuses[room];
      let btnClass = '';
      let statusColor = '';
      
      if (status === 'AVAILABLE') {
        btnClass = 'border-stitch-mint border-opacity-35 text-stitch-mint';
        statusColor = 'bg-stitch-mint';
      } else if (status === 'MAINTENANCE') {
        btnClass = 'border-stitch-gold border-opacity-35 text-stitch-gold';
        statusColor = 'bg-stitch-gold';
      } else {
        btnClass = 'border-[#E64A19] border-opacity-35 text-[#E64A19]';
        statusColor = 'bg-[#E64A19]';
      }

      const div = document.createElement('div');
      div.className = 'p-4 border border-stitch-platinum border-opacity-5 bg-stitch-midnight bg-opacity-40 flex flex-col justify-between gap-4 transition';
      div.innerHTML = `
        <div class="flex justify-between items-center">
          <h4 class="text-xs font-bold text-stitch-platinum uppercase">${room}</h4>
          <span class="h-2 w-2 rounded-full ${statusColor}"></span>
        </div>
        <select class="room-status-select bg-stitch-dark border border-stitch-platinum border-opacity-10 text-stitch-platinum text-[10px] py-1.5 px-2 focus:border-stitch-gold focus:ring-0" data-room="${room}" style="border-radius: 0;">
          <option value="AVAILABLE" ${status === 'AVAILABLE' ? 'selected' : ''}>Available</option>
          <option value="MAINTENANCE" ${status === 'MAINTENANCE' ? 'selected' : ''}>Maintenance</option>
          <option value="OUT_OF_SERVICE" ${status === 'OUT_OF_SERVICE' ? 'selected' : ''}>Out of Service</option>
        </select>
      `;
      roomOpsGrid.appendChild(div);
    });

    // Listen to changes in selector
    document.querySelectorAll('.room-status-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const room = e.target.getAttribute('data-room');
        const nextStatus = e.target.value;
        updateRoomStatus(room, nextStatus);
      });
    });
  }

  function renderOpsMapList() {
    opsBoardGrid.innerHTML = '';

    
    const selectedStartStr = opsSelectedDateInput.value; // YYYY-MM-DD
    const startDate = new Date(selectedStartStr);
    
    if (isNaN(startDate.getTime())) return;
    
    // Generate 7-day array
    const days = [];
    const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const isoStr = `${yyyy}-${mm}-${dd}`;
      days.push({
        iso: isoStr,
        dayNum: d.getDate(),
        dayName: weekdaysShort[d.getDay()],
        isWeekend: d.getDay() === 0 || d.getDay() === 6
      });
    }

    // 1. Render Header Row (8 columns: Villa + 7 days)
    const headerRow = document.createElement('div');
    headerRow.className = 'grid grid-cols-8 gap-1.5 items-center pb-2 border-b border-stitch-platinum border-opacity-5';
    
    // Villa label column
    const villaHeaderLabel = document.createElement('div');
    villaHeaderLabel.className = 'text-[9px] uppercase tracking-wider text-stitch-muted font-bold pl-1';
    villaHeaderLabel.textContent = 'Villa';
    headerRow.appendChild(villaHeaderLabel);
    
    // 7 day headers
    days.forEach(day => {
      const col = document.createElement('div');
      col.className = `flex flex-col items-center justify-center text-center py-1 ${day.isWeekend ? 'bg-white bg-opacity-5' : ''}`;
      col.innerHTML = `
        <span class="text-[10px] font-mono font-bold text-stitch-platinum">${day.dayNum}</span>
        <span class="text-[8px] text-stitch-muted uppercase font-semibold mt-0.5">${day.dayName}</span>
      `;
      headerRow.appendChild(col);
    });
    opsBoardGrid.appendChild(headerRow);

    // 2. Render Villa Rows
    const villaNames = {
      "Villa 1": "Amalfi Suite",
      "Villa 2": "Positano Vista",
      "Villa 3": "Ravello Suite",
      "Villa 4": "Capri Vista",
      "Villa 5": "Sirenuse Suite",
      "Villa 6": "Sunset Pavilion"
    };

    const roomKeys = Object.keys(villaNames);
    
    roomKeys.forEach(room => {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-8 gap-1.5 items-center py-1.5 border-b border-stitch-platinum border-opacity-5 hover:bg-white hover:bg-opacity-[0.02] transition-colors';
      
      // Villa Title (V1, V2, etc.)
      const roomLabelCol = document.createElement('div');
      roomLabelCol.className = 'text-[11px] font-mono font-black text-stitch-gold pl-1';
      roomLabelCol.textContent = room.replace('Villa ', 'V');
      row.appendChild(roomLabelCol);
      
      // 7 cells
      days.forEach(day => {
        const dayStr = day.iso;
        
        // Check if there is an overlapping reservation
        const overlappingRes = reservations.find(res => {
          if (res.bookingStatus === 'Cancelled') return false;
          const isThisVilla = res.villa === room || (typeof res.villa === 'string' && res.villa.split(', ').includes(room));
          if (!isThisVilla) return false;
          
          return res.checkIn <= dayStr && dayStr < res.checkOut;
        });

        let cellClass = '';
        let cellContent = '';

        if (overlappingRes) {
          if (overlappingRes.isBlockout) {
            if (overlappingRes.bookingStatus === 'Cleaning') {
              // Housekeeping
              cellClass = 'bg-alert-orange text-stitch-dark border border-alert-orange';
              cellContent = '<span class="material-symbols-outlined text-[14px]">cleaning_services</span>';
            } else {
              // Maintenance hold
              cellClass = 'bg-alert-red text-stitch-dark border border-alert-red';
              cellContent = '<span class="material-symbols-outlined text-[14px]">engineering</span>';
            }
          } else {
            const bookingStatus = overlappingRes.bookingStatus;
            if (bookingStatus === 'Checked In') {
              cellClass = 'bg-stitch-mint text-stitch-dark border border-stitch-mint';
              cellContent = '<span class="material-symbols-outlined text-[14px]">key</span>';
            } else if (bookingStatus === 'Pending Verification') {
              cellClass = 'bg-stitch-gold bg-opacity-40 text-stitch-platinum border border-stitch-gold border-opacity-40';
              cellContent = '<span class="material-symbols-outlined text-[14px]">schedule</span>';
            } else {
              // Confirmed
              cellClass = 'bg-stitch-gold text-stitch-dark border border-stitch-gold';
              cellContent = '<span class="material-symbols-outlined text-[14px]">check_circle</span>';
            }
          }
        } else {
          // Check overrides
          const overrideStatus = villaStatuses[room] || 'AVAILABLE';
          if (overrideStatus === 'MAINTENANCE') {
            cellClass = 'bg-alert-orange text-stitch-dark border border-alert-orange';
            cellContent = '<span class="material-symbols-outlined text-[14px]">build</span>';
          } else if (overrideStatus === 'OUT_OF_SERVICE') {
            cellClass = 'bg-alert-red text-stitch-dark border border-alert-red';
            cellContent = '<span class="material-symbols-outlined text-[14px]">block</span>';
          } else {
            // Vacant
            cellClass = 'bg-stitch-mint bg-opacity-5 border border-stitch-mint border-opacity-15 hover:bg-opacity-10 text-stitch-mint';
            cellContent = '<span class="h-1.5 w-1.5 rounded-full bg-stitch-mint bg-opacity-40"></span>';
          }
        }

        // Active selection highlight
        const isSelected = room === opsSelectedCellVilla && dayStr === opsSelectedCellDate;
        if (isSelected) {
          cellClass += ' ring-2 ring-stitch-gold ring-offset-2 ring-offset-stitch-dark scale-105 z-10 shadow-lg';
        }

        const cell = document.createElement('div');
        cell.className = `h-9 flex items-center justify-center transition-all cursor-pointer relative ${cellClass}`;
        cell.innerHTML = cellContent;
        cell.title = `${room} - ${dayStr}`;
        
        cell.addEventListener('click', () => {
          opsSelectedCellVilla = room;
          opsSelectedCellDate = dayStr;
          renderOpsMapList(); // re-render to update the ring and highlight
        });

        row.appendChild(cell);
      });
      opsBoardGrid.appendChild(row);
    });

    // Update inspection details card
    updateCellDetails(opsSelectedCellVilla, opsSelectedCellDate);
  }

  function updateCellDetails(room, dateStr) {
    opsBoardDetail.innerHTML = '';
    
    const villaNames = {
      "Villa 1": "Amalfi Suite",
      "Villa 2": "Positano Vista",
      "Villa 3": "Ravello Suite",
      "Villa 4": "Capri Vista",
      "Villa 5": "Sirenuse Suite",
      "Villa 6": "Sunset Pavilion"
    };

    const roomName = villaNames[room] || "Luxury Suite";
    
    // Format date in human readable format
    const parsedDate = new Date(dateStr);
    const dateLabel = isNaN(parsedDate.getTime()) ? dateStr : parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Find reservation
    const res = reservations.find(r => {
      if (r.bookingStatus === 'Cancelled') return false;
      const isThisVilla = r.villa === room || (typeof r.villa === 'string' && r.villa.split(', ').includes(room));
      if (!isThisVilla) return false;
      
      return r.checkIn <= dateStr && dateStr < r.checkOut;
    });

    const headerHTML = `
      <div class="flex justify-between items-start border-b border-stitch-platinum border-opacity-5 pb-2 mb-2 select-none">
        <div>
          <span class="text-[8px] uppercase tracking-[0.15em] text-stitch-muted font-bold">${room}</span>
          <h4 class="text-xs font-serif font-bold text-stitch-platinum mt-0.5">${roomName}</h4>
        </div>
        <span class="text-[9px] font-mono font-bold text-stitch-gold">${dateLabel}</span>
      </div>
    `;

    if (res) {
      if (res.isBlockout) {
        let blockStatusLabel = res.bookingStatus === 'Cleaning' ? 'Housekeeping Block' : 'Maintenance Hold';
        let blockDesc = res.bookingStatus === 'Cleaning' 
          ? 'Unit is scheduled for turn-over cleaning and sanitization presets.' 
          : `Operational hold for repairs: ${res.guest || 'System Hold'}.`;
        
        opsBoardDetail.innerHTML = `
          ${headerHTML}
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5 text-xs text-[#F57C00] font-bold">
              <span class="material-symbols-outlined text-[14px]">engineering</span>
              <span>${blockStatusLabel}</span>
            </div>
            <p class="text-[10px] text-stitch-muted mt-1 leading-normal font-medium">${blockDesc}</p>
            <div class="text-[9px] text-stitch-muted font-mono mt-1 select-none">Timeline Block: ${res.dates}</div>
          </div>
        `;
      } else {
        const bookingStatus = res.bookingStatus;
        let paymentBadge = '';
        if (res.paymentStatus === 'PAID') {
          paymentBadge = `<span class="bg-stitch-mint bg-opacity-15 text-stitch-mint border border-stitch-mint border-opacity-30 text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-wider">PAID</span>`;
        } else if (res.paymentStatus === 'PENDING_VERIFICATION') {
          paymentBadge = `<span class="bg-stitch-gold bg-opacity-15 text-stitch-gold border border-stitch-gold border-opacity-30 text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-wider">UNVERIFIED</span>`;
        } else {
          paymentBadge = `<span class="bg-stitch-muted bg-opacity-15 text-stitch-muted border border-stitch-muted border-opacity-30 text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-wider">${res.paymentStatus}</span>`;
        }

        let verifyBtnHTML = '';
        if (res.paymentStatus === 'PENDING_VERIFICATION') {
          verifyBtnHTML = `
            <button class="ops-detail-verify-btn mt-2 py-1 px-3 bg-stitch-gold text-stitch-dark font-bold text-[9px] uppercase tracking-wider transition hover:bg-opacity-90" style="border-radius: 0;">
              Verify Payment Proof
            </button>
          `;
        }

        opsBoardDetail.innerHTML = `
          ${headerHTML}
          <div class="flex flex-col gap-1">
            <div class="flex justify-between items-start">
              <div>
                <div class="text-xs font-bold text-stitch-platinum">${res.guest}</div>
                <div class="text-[9px] text-stitch-muted font-mono mt-0.5">Stay: ${res.dates}</div>
              </div>
              <div class="flex flex-col items-end gap-1 shrink-0">
                <div class="flex items-center gap-1">
                  <span class="text-[9px] text-stitch-muted font-mono uppercase font-semibold">${res.id}</span>
                  <span class="text-[9px] text-stitch-gold bg-stitch-gold bg-opacity-10 px-1 border border-stitch-gold border-opacity-25 uppercase font-bold text-[8px] tracking-wider">${bookingStatus}</span>
                </div>
                ${paymentBadge}
              </div>
            </div>
            ${verifyBtnHTML}
          </div>
        `;

        // Bind verify button click
        const verifyBtn = opsBoardDetail.querySelector('.ops-detail-verify-btn');
        if (verifyBtn) {
          verifyBtn.addEventListener('click', () => {
            document.querySelector('.tab-btn[data-tab="verification"]').click();
          });
        }
      }
    } else {
      // Manual overrides
      const overrideStatus = villaStatuses[room] || 'AVAILABLE';
      let statusLabel = '';
      let statusDesc = '';
      let statusIcon = '';
      let textTone = '';

      if (overrideStatus === 'MAINTENANCE') {
        statusLabel = 'Maintenance Hold (Manual)';
        statusDesc = 'Villa is flagged for operational checkups. Bookings are temporarily blocked.';
        statusIcon = 'build';
        textTone = 'text-[#F57C00]';
      } else if (overrideStatus === 'OUT_OF_SERVICE') {
        statusLabel = 'Out of Service (Manual)';
        statusDesc = 'Villa is decommissioned from active resort inventory.';
        statusIcon = 'block';
        textTone = 'text-[#E64A19]';
      } else {
        statusLabel = 'Vacant & Available';
        statusDesc = 'Villa is ready and available for walk-ins or online bookings.';
        statusIcon = 'check_circle';
        textTone = 'text-stitch-mint';
      }

      opsBoardDetail.innerHTML = `
        ${headerHTML}
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1.5 text-xs font-bold ${textTone}">
            <span class="material-symbols-outlined text-[14px]">${statusIcon}</span>
            <span>${statusLabel}</span>
          </div>
          <p class="text-[10px] text-stitch-muted mt-1 leading-normal font-medium">${statusDesc}</p>
        </div>
      `;
    }
  }

  async function updateRoomStatus(room, status) {
    const statuses = JSON.parse(localStorage.getItem('amalfi_villa_statuses')) || {};
    statuses[room] = status;
    if (backendOnline) {
      try {
        await apiFetch(`/admin/amalfi/villa-statuses/${encodeURIComponent(room)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status })
        });
      } catch (err) {
        console.warn('Backend villa status update failed:', err.message);
      }
    }
    localStorage.setItem('amalfi_villa_statuses', JSON.stringify(statuses));
    refreshData();
  }


  // 5. Manual Booking Form Submission
  manualBookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fullName = document.getElementById('manual-guest-name').value;
    const villaId = document.getElementById('manual-villa-select').value;
    const checkIn = document.getElementById('manual-check-in').value;
    const checkOut = document.getElementById('manual-check-out').value;
    const cost = parseFloat(document.getElementById('manual-cost').value);

    if (!fullName.trim() || isNaN(cost)) {
      alert("Please fill out guest name and cost.");
      return;
    }

    const currentReservations = JSON.parse(localStorage.getItem('amalfi_reservations')) || [];
    
    // Date calculate
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    const diffTime = co - ci;
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    // Find Villa Name
    const villaNames = {
      "Villa 1": "Amalfi Suite",
      "Villa 2": "Positano Vista",
      "Villa 3": "Ravello Suite",
      "Villa 4": "Capri Vista",
      "Villa 5": "Sirenuse Suite",
      "Villa 6": "Sunset Pavilion"
    };

    const refId = "ALF-" + Math.floor(1000 + Math.random() * 9000);
    const newReservation = {
      id: refId.toLowerCase(),
      guest: fullName,
      villa: villaId,
      villaName: villaNames[villaId] || "Luxury Suite",
      dates: `${checkIn.slice(5)} - ${checkOut.slice(5)}`,
      checkIn: checkIn,
      checkOut: checkOut,
      created: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      bookingStatus: "Confirmed",
      paymentStatus: "PAID",
      baseRate: cost,
      addonWine: false,
      addonYacht: false,
      addonSpa: false,
      addonChef: false,
      folio: cost.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      isBlockout: false
    };

    if (backendOnline) {
      try {
        const created = await apiFetch('/admin/amalfi/manual-booking', {
          method: 'POST',
          body: JSON.stringify({
            villa_id: villaId,
            room_type: villaNames[villaId],
            full_name: fullName,
            check_in: checkIn,
            check_out: checkOut,
            guests: 1,
            total_price: cost
          })
        });
        if (created.booking_ref) {
          newReservation.id = created.booking_ref;
          newReservation.bookingRef = created.booking_ref;
          newReservation.refNo = created.booking_ref;
        }
      } catch (err) {
        console.warn('Backend manual booking failed:', err.message);
      }
    }

    currentReservations.push(newReservation);
    localStorage.setItem('amalfi_reservations', JSON.stringify(currentReservations));
    
    // Reset form
    manualBookingForm.reset();
    
    // Redirect to Today Tab
    document.querySelector('.tab-btn[data-tab="movements"]').click();
  });

  // Initialize
  refreshData();

  // ─────────────────────────────────────────────
  // 6. POS SYSTEM
  // ─────────────────────────────────────────────
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

  if (!localStorage.getItem('amalfi_products_v2')) {
    localStorage.setItem('amalfi_products_v2', JSON.stringify(DEFAULT_PRODUCTS));
  }
  if (!localStorage.getItem('amalfi_pos_sales_v2')) {
    localStorage.setItem('amalfi_pos_sales_v2', JSON.stringify([]));
  }

  let posProducts = JSON.parse(localStorage.getItem('amalfi_products_v2')) || DEFAULT_PRODUCTS;
  let posCart = []; // [{ product, qty }]
  let posCheckoutType = 'direct'; // 'direct' | 'room'
  let posActiveCategory = 'All';

  const posCategoryTabs = document.getElementById('pos-category-tabs');
  const posProductGrid = document.getElementById('pos-product-grid');
  const posCartSection = document.getElementById('pos-cart-section');
  const posCartItems = document.getElementById('pos-cart-items');
  const posCartTotal = document.getElementById('pos-cart-total');
  const posCartCount = document.getElementById('pos-cart-count');
  const posClearCartBtn = document.getElementById('pos-clear-cart');
  const posCheckoutBtn = document.getElementById('pos-checkout-btn');
  const posCheckoutModal = document.getElementById('pos-checkout-modal');
  const posModalClose = document.getElementById('pos-modal-close');
  const posTypeDirect = document.getElementById('pos-type-direct');
  const posTypeRoom = document.getElementById('pos-type-room');
  const posRoomSelectWrapper = document.getElementById('pos-room-select-wrapper');
  const posRoomSelect = document.getElementById('pos-room-select');
  const posModalTotal = document.getElementById('pos-modal-total');
  const posConfirmCheckout = document.getElementById('pos-confirm-checkout');
  const posRecentSales = document.getElementById('pos-recent-sales');

  function getPosCategories() {
    const cats = [...new Set(posProducts.map(p => p.category))];
    return ['All', ...cats];
  }

  function renderPosCategoryTabs() {
    posCategoryTabs.innerHTML = '';
    getPosCategories().forEach(cat => {
      const btn = document.createElement('button');
      const isActive = cat === posActiveCategory;
      btn.className = `shrink-0 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border transition ${
        isActive
          ? 'bg-stitch-gold text-stitch-dark border-stitch-gold'
          : 'border-stitch-platinum border-opacity-20 text-stitch-muted hover:text-stitch-platinum hover:border-opacity-40'
      }`;
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        posActiveCategory = cat;
        renderPosCategoryTabs();
        renderPosProductGrid();
      });
      posCategoryTabs.appendChild(btn);
    });
  }

  function renderPosProductGrid() {
    posProductGrid.innerHTML = '';
    const filtered = posActiveCategory === 'All'
      ? posProducts
      : posProducts.filter(p => p.category === posActiveCategory);

    if (filtered.length === 0) {
      posProductGrid.innerHTML = '<div class="col-span-2 text-xs text-stitch-muted italic text-center py-4">No products in this category.</div>';
      return;
    }

    filtered.forEach(product => {
      const inCart = posCart.find(c => c.product.id === product.id);
      const qty = inCart ? inCart.qty : 0;
      const tile = document.createElement('div');
      tile.className = `p-3 border transition flex flex-col gap-2 cursor-pointer active:scale-[0.97] ${
        qty > 0
          ? 'border-stitch-gold bg-stitch-gold bg-opacity-10'
          : 'border-stitch-platinum border-opacity-10 bg-stitch-midnight bg-opacity-40 hover:border-opacity-20'
      }`;
      tile.innerHTML = `
        <div class="text-[9px] uppercase tracking-wider text-stitch-muted font-bold truncate">${product.category.split(' ')[0]}</div>
        <div class="text-xs font-bold text-stitch-platinum leading-snug">${product.name}</div>
        <div class="flex items-center justify-between mt-auto">
          <span class="text-stitch-gold font-mono font-bold text-xs">₱${product.price.toLocaleString()}</span>
          ${qty > 0
            ? `<div class="flex items-center gap-1.5">
                <button class="pos-qty-dec w-5 h-5 border border-stitch-platinum border-opacity-20 text-stitch-muted flex items-center justify-center text-xs leading-none" data-id="${product.id}">−</button>
                <span class="text-[10px] font-bold text-stitch-gold w-4 text-center">${qty}</span>
                <button class="pos-qty-inc w-5 h-5 bg-stitch-gold text-stitch-dark flex items-center justify-center text-xs leading-none font-bold" data-id="${product.id}">+</button>
              </div>`
            : `<button class="pos-add-btn w-6 h-6 bg-stitch-gold text-stitch-dark flex items-center justify-center text-sm leading-none font-bold" data-id="${product.id}">+</button>`
          }
        </div>
      `;
      posProductGrid.appendChild(tile);
    });

    // Bind add/increment/decrement
    posProductGrid.querySelectorAll('.pos-add-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        posAddToCart(id);
      });
    });
    posProductGrid.querySelectorAll('.pos-qty-inc').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        posAddToCart(btn.getAttribute('data-id'));
      });
    });
    posProductGrid.querySelectorAll('.pos-qty-dec').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        posDecFromCart(btn.getAttribute('data-id'));
      });
    });
  }

  function posAddToCart(productId) {
    const product = posProducts.find(p => p.id === productId);
    if (!product) return;
    const existing = posCart.find(c => c.product.id === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      posCart.push({ product, qty: 1 });
    }
    renderPosProductGrid();
    renderPosCart();
  }

  function posDecFromCart(productId) {
    const index = posCart.findIndex(c => c.product.id === productId);
    if (index === -1) return;
    posCart[index].qty -= 1;
    if (posCart[index].qty <= 0) {
      posCart.splice(index, 1);
    }
    renderPosProductGrid();
    renderPosCart();
  }

  function renderPosCart() {
    const totalItems = posCart.reduce((s, c) => s + c.qty, 0);
    const totalAmt = posCart.reduce((s, c) => s + c.product.price * c.qty, 0);

    if (totalItems === 0) {
      posCartSection.classList.add('hidden');
      posCartCount.classList.add('hidden');
      return;
    }

    posCartSection.classList.remove('hidden');
    posCartCount.classList.remove('hidden');
    posCartCount.textContent = `${totalItems} item${totalItems > 1 ? 's' : ''}`;
    posCartTotal.textContent = `₱${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    posCartItems.innerHTML = '';
    posCart.forEach(({ product, qty }) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between py-1 border-b border-stitch-platinum border-opacity-5 last:border-0';
      row.innerHTML = `
        <div>
          <div class="text-xs font-semibold text-stitch-platinum">${product.name}</div>
          <div class="text-[9px] text-stitch-muted font-mono">×${qty} @ ₱${product.price.toLocaleString()}</div>
        </div>
        <div class="text-xs font-bold font-mono text-stitch-gold">₱${(product.price * qty).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
      `;
      posCartItems.appendChild(row);
    });
  }

  function renderPosRecentSales() {
    const sales = JSON.parse(localStorage.getItem('amalfi_pos_sales_v2')) || [];
    posRecentSales.innerHTML = '';
    if (sales.length === 0) {
      posRecentSales.innerHTML = '<div class="text-xs text-stitch-muted italic py-2">No sales recorded yet.</div>';
      return;
    }
    const recent = [...sales].reverse().slice(0, 8);
    recent.forEach(sale => {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between py-2 border-b border-stitch-platinum border-opacity-5 last:border-0';
      const typeIcon = sale.checkoutType === 'room' ? 'bed' : 'payments';
      const typeTip = sale.checkoutType === 'room' ? sale.villa : (sale.paymentMethod || 'Direct');
      div.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[14px] text-stitch-muted">${typeIcon}</span>
          <div>
            <div class="text-xs font-semibold text-stitch-platinum">${sale.guest}</div>
            <div class="text-[9px] text-stitch-muted font-mono">${sale.date} · ${typeTip}</div>
          </div>
        </div>
        <div class="text-xs font-mono font-bold text-stitch-gold">₱${sale.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
      `;
      posRecentSales.appendChild(div);
    });
  }

  function populatePosRoomSelect() {
    posRoomSelect.innerHTML = '';
    const activeRes = (JSON.parse(localStorage.getItem('amalfi_reservations')) || [])
      .filter(r => r.bookingStatus === 'Checked In' || r.bookingStatus === 'Confirmed');
    if (activeRes.length === 0) {
      posRoomSelect.innerHTML = '<option value="">No active guests</option>';
      return;
    }
    activeRes.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.guest} — ${r.villaName}`;
      posRoomSelect.appendChild(opt);
    });
  }

  function renderPosTab() {
    posProducts = JSON.parse(localStorage.getItem('amalfi_products_v2')) || DEFAULT_PRODUCTS;
    posCart = [];
    posActiveCategory = 'All';
    renderPosCategoryTabs();
    renderPosProductGrid();
    renderPosCart();
    renderPosRecentSales();
  }

  // Tab entry hook — extend the existing navigation listener
  const origTabBtns = document.querySelectorAll('.tab-btn');
  origTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-tab') === 'pos') {
        renderPosTab();
      }
    });
  });

  // Clear cart
  posClearCartBtn.addEventListener('click', () => {
    posCart = [];
    renderPosProductGrid();
    renderPosCart();
  });

  // Open checkout modal
  posCheckoutBtn.addEventListener('click', () => {
    if (posCart.length === 0) return;
    const total = posCart.reduce((s, c) => s + c.product.price * c.qty, 0);
    posModalTotal.textContent = `₱${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    populatePosRoomSelect();
    posCheckoutModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });

  posModalClose.addEventListener('click', () => {
    posCheckoutModal.classList.add('hidden');
    document.body.style.overflow = '';
  });

  // Toggle checkout type buttons
  posTypeDirect.addEventListener('click', () => {
    posCheckoutType = 'direct';
    posTypeDirect.className = 'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border bg-stitch-gold text-stitch-dark border-stitch-gold transition pos-type-btn';
    posTypeRoom.className = 'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border border-stitch-platinum border-opacity-20 text-stitch-muted transition pos-type-btn';
    posRoomSelectWrapper.classList.add('hidden');
  });

  posTypeRoom.addEventListener('click', () => {
    posCheckoutType = 'room';
    posTypeRoom.className = 'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border bg-stitch-gold text-stitch-dark border-stitch-gold transition pos-type-btn';
    posTypeDirect.className = 'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border border-stitch-platinum border-opacity-20 text-stitch-muted transition pos-type-btn';
    posRoomSelectWrapper.classList.remove('hidden');
  });

  // Confirm checkout
  posConfirmCheckout.addEventListener('click', async () => {
    if (posCart.length === 0) return;

    const total = posCart.reduce((s, c) => s + c.product.price * c.qty, 0);
    const items = posCart.map(c => ({ id: c.product.id, name: c.product.name, price: c.product.price, qty: c.qty }));
    const saleId = 'msale-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    const newSale = {
      id: saleId,
      date: today,
      items,
      total,
      checkoutType: posCheckoutType
    };

    if (posCheckoutType === 'room') {
      const resId = posRoomSelect.value;
      const allRes = JSON.parse(localStorage.getItem('amalfi_reservations')) || [];
      const resIndex = allRes.findIndex(r => r.id === resId);
      if (resIndex !== -1) {
        const res = allRes[resIndex];
        newSale.guest = res.guest;
        newSale.villa = res.villa;
        newSale.resId = resId;

        // Append individual items to posCharges on the reservation
        res.posCharges = res.posCharges || [];
        const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        items.forEach(item => {
          for (let i = 0; i < item.qty; i++) {
            res.posCharges.push({
              id: 'chg-' + Date.now() + Math.random().toString(36).slice(2, 6),
              name: item.name,
              amount: item.price,
              date: dateLabel
            });
          }
        });

        allRes[resIndex] = res;
        localStorage.setItem('amalfi_reservations', JSON.stringify(allRes));
      }
    } else {
      newSale.guest = 'Walk-in Guest';
      newSale.villa = 'N/A';
      newSale.paymentMethod = 'Cash / Card';
    }

    // Save sale record
    if (backendOnline) {
      try {
        const saved = await apiFetch('/admin/amalfi/pos-sales', {
          method: 'POST',
          body: JSON.stringify(newSale)
        });
        if (saved.sale?.id) newSale.id = saved.sale.id;
      } catch (err) {
        console.warn('Backend POS sale failed:', err.message);
      }
    }

    const sales = JSON.parse(localStorage.getItem('amalfi_pos_sales_v2')) || [];
    sales.push(newSale);
    localStorage.setItem('amalfi_pos_sales_v2', JSON.stringify(sales));

    // Reset
    posCart = [];
    posCheckoutType = 'direct';
    posTypeDirect.className = 'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border bg-stitch-gold text-stitch-dark border-stitch-gold transition pos-type-btn';
    posTypeRoom.className = 'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider border border-stitch-platinum border-opacity-20 text-stitch-muted transition pos-type-btn';
    posRoomSelectWrapper.classList.add('hidden');
    posCheckoutModal.classList.add('hidden');
    document.body.style.overflow = '';

    renderPosCategoryTabs();
    renderPosProductGrid();
    renderPosCart();
    renderPosRecentSales();

    // Brief success feedback
    const successBanner = document.createElement('div');
    successBanner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-stitch-mint text-stitch-dark text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 shadow-lg transition-all';
    successBanner.textContent = '✓ Sale Recorded';
    document.body.appendChild(successBanner);
    setTimeout(() => successBanner.remove(), 2200);
  });

  // ─────────────────────────────────────────────
  // 7. AI OPERATIONS COPILOT
  // ─────────────────────────────────────────────
  const copilotFab = document.getElementById('copilot-fab');
  const copilotOverlay = document.getElementById('copilot-overlay');
  const copilotCloseBtn = document.getElementById('copilot-close');
  const copilotForm = document.getElementById('mobile-copilot-form');
  const copilotInput = document.getElementById('mobile-copilot-input');
  const copilotStream = document.getElementById('mobile-copilot-stream');
  const copilotTyping = document.getElementById('copilot-typing');
  const copilotSuggestions = document.getElementById('copilot-suggestions');
  let copilotFirstMessage = true;

  // Open overlay
  copilotFab.addEventListener('click', () => {
    copilotOverlay.classList.remove('translate-y-full');
    copilotOverlay.classList.add('translate-y-0');
    setTimeout(() => copilotInput.focus(), 350);
  });

  // Close overlay
  copilotCloseBtn.addEventListener('click', () => {
    copilotOverlay.classList.remove('translate-y-0');
    copilotOverlay.classList.add('translate-y-full');
  });

  // Suggestion chip clicks
  document.querySelectorAll('.copilot-suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      copilotInput.value = btn.getAttribute('data-prompt');
      copilotInput.focus();
      copilotForm.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });

  // Form submit
  copilotForm.addEventListener('submit', e => {
    e.preventDefault();
    const query = copilotInput.value.trim();
    if (!query) return;

    // Hide suggestions after first use
    if (copilotFirstMessage) {
      copilotSuggestions.classList.add('hidden');
      copilotFirstMessage = false;
    }

    // Add user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'bg-stitch-midnight border border-stitch-platinum border-opacity-10 p-3 self-end max-w-[85%]';
    userBubble.innerHTML = `
      <div class="text-[9px] font-bold text-stitch-gold uppercase tracking-wider mb-1.5">Manager</div>
      <p class="text-[11px] text-stitch-platinum leading-relaxed">${query}</p>
      <span class="text-[8px] text-stitch-muted block text-right mt-1.5 font-mono">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    `;
    copilotStream.appendChild(userBubble);
    copilotInput.value = '';
    copilotStream.scrollTop = copilotStream.scrollHeight;

    // Show typing indicator
    copilotTyping.classList.remove('hidden');
    copilotStream.scrollTop = copilotStream.scrollHeight;

    setTimeout(() => {
      copilotTyping.classList.add('hidden');
      const responseText = mobileCopilotRAG(query);
      const aiBubble = document.createElement('div');
      aiBubble.className = 'bg-stitch-midnight border border-stitch-gold border-opacity-25 p-3.5 self-start max-w-[90%]';
      aiBubble.innerHTML = `
        <div class="flex items-center gap-1.5 mb-2">
          <span class="material-symbols-outlined text-[14px] text-stitch-gold" style="font-variation-settings: 'FILL' 1;">psychology</span>
          <span class="text-[10px] font-bold text-stitch-gold uppercase tracking-wider">Operations Copilot AI</span>
        </div>
        <div class="text-[11px] text-stitch-platinum leading-relaxed whitespace-pre-line">${responseText}</div>
        <span class="text-[8px] text-stitch-muted block text-right mt-2 font-mono">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      `;
      copilotStream.appendChild(aiBubble);
      copilotStream.scrollTop = copilotStream.scrollHeight;
    }, 900);
  });

  function mobileCopilotRAG(query) {
    const q = query.toLowerCase();
    // Load fresh data from localStorage each time
    const allRes = JSON.parse(localStorage.getItem('amalfi_reservations')) || [];
    const villaNames = {
      "Villa 1": "Amalfi Suite", "Villa 2": "Positano Vista",
      "Villa 3": "Ravello Suite", "Villa 4": "Capri Vista",
      "Villa 5": "Sirenuse Suite", "Villa 6": "Sunset Pavilion"
    };

    // Guest lookups
    const guestMatches = [
      { keys: ['sophia', 'loren'],     name: 'Sophia Loren' },
      { keys: ['harrington', 'lord'],  name: 'Lord Harrington' },
      { keys: ['clooney', 'george'],   name: 'George Clooney' },
    ];
    for (const gm of guestMatches) {
      if (gm.keys.some(k => q.includes(k))) {
        const res = allRes.find(r => r.guest.toLowerCase().includes(gm.keys[0]) || r.guest.toLowerCase().includes(gm.keys[1]));
        if (res) {
          const folio = res.folio ? `₱${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'N/A';
          const addons = [res.addonWine && 'Welcome Drink Pkg', res.addonYacht && 'Pool Cabana', res.addonSpa && 'Massage Treatment', res.addonChef && 'Dinner Buffet'].filter(Boolean);
          const posChargeTotal = (res.posCharges || []).reduce((s, c) => s + c.amount, 0);
          return `📋 ${res.guest} — Stay Record

• Villa: ${res.villaName || villaNames[res.villa] || res.villa}
• Dates: ${res.dates || `${res.checkIn} → ${res.checkOut}`}
• Status: ${res.bookingStatus} | Payment: ${res.paymentStatus}
• Folio Total: ${folio}
• Add-ons: ${addons.length ? addons.join(', ') : 'None'}
• POS Charges: ₱${posChargeTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }
        return `⚠️ No record found for that guest in the current reservation database.`;
      }
    }

    // Occupancy
    if (q.includes('occupancy') || q.includes('occupied') || q.includes('checked in')) {
      const active = allRes.filter(r => r.bookingStatus === 'Checked In' && !r.isBlockout);
      const rate = ((active.length / 6) * 100).toFixed(1);
      const list = active.map(r => `  • ${r.villaName || villaNames[r.villa] || r.villa}: ${r.guest}`).join('\n');
      return `🏨 Live Occupancy Report

• Rate: ${rate}% (${active.length} / 6 villas occupied)
• Occupied Units:
${list || '  None currently checked in'}`;
    }

    // Maintenance
    if (q.includes('maintenance') || q.includes('hold') || q.includes('blockout') || q.includes('tickets')) {
      const holds = allRes.filter(r => r.isBlockout);
      const holdText = holds.length > 0
        ? holds.map(h => `  • ${h.villaName || villaNames[h.villa] || h.villa}: ${h.bookingStatus} (${h.dates})`).join('\n')
        : '  • No active maintenance holds.';
      return `🔧 Maintenance Hub Logs

• Active Holds: ${holds.length}
${holdText}
• Open Tickets:
  • AC Unit compressor — Villa 4
  • Pool filter check — Villa 1 (next Monday)`;
    }

    // Revenue / financial
    if (q.includes('revenue') || q.includes('ledger') || q.includes('pacing') || q.includes('ebitda') || q.includes('financial') || q.includes('cashflow')) {
      const receivables = allRes
        .filter(r => !r.isBlockout && (r.paymentStatus === 'PARTIAL' || r.paymentStatus === 'UNPAID'))
        .reduce((s, r) => s + parseFloat(r.folio.replace(/,/g, '')), 0);
      const posSales = JSON.parse(localStorage.getItem('amalfi_pos_sales_v2')) || [];
      const posTotal = posSales.reduce((s, sale) => s + sale.total, 0);
      return `💰 H1 Revenue & Financial Pacing

• Receivables (Folios): ₱${receivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
• POS Sales (Total): ₱${posTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
• ADR Pacing: ₱4,733.33 (YTD +12.4%)
• RevPAR: ₱4,007.16 (YTD +8.2%)
• EBITDA Margin: 48.6% ✅ On target
• Allocation:
  • Suite Lodging: 85%
  • Amenity Add-ons: 15%`;
    }

    // Rates & policies
    if (q.includes('rate') || q.includes('rates') || q.includes('price') || q.includes('policy') || q.includes('policies') || q.includes('check-in') || q.includes('cabana') || q.includes('drinks') || q.includes('buffet') || q.includes('spa') || q.includes('massage') || q.includes('amenity')) {
      return `📖 Resort Policies & Amenity Rates

• Check-in: 14:00 (Early check-in: ₱2,500)
• Check-out: 11:00 (Late check-out: ₱3,500 until 16:00)
• Security Deposit: ₱15,000 on confirmation

Amenity Rates:
  • Pool Cabana Rental: ₱1,500/day
  • Welcome Drink Package: ₱1,500/pkg
  • Dinner Buffet Package: ₱1,200/guest
  • Massage Treatment: ₱1,500/session`;
    }

    // Verification
    if (q.includes('verif') || q.includes('deposit') || q.includes('wire') || q.includes('slip') || q.includes('pending payment')) {
      const pending = allRes.filter(r => r.paymentStatus === 'PENDING_VERIFICATION');
      if (pending.length === 0) return '✅ No pending payment verifications. All folios are cleared.';
      const list = pending.map(r => `  • ${r.guest} (${r.villa}): ₱${parseFloat(r.folio.replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 })}`).join('\n');
      return `⏳ Pending Payment Verifications

• Count: ${pending.length}
${list}
→ Go to the Verify tab to action these.`;
    }

    // POS summary
    if (q.includes('pos') || q.includes('sales') || q.includes('transactions')) {
      const sales = JSON.parse(localStorage.getItem('amalfi_pos_sales_v2')) || [];
      const total = sales.reduce((s, sale) => s + sale.total, 0);
      const today = new Date().toISOString().split('T')[0];
      const todaySales = sales.filter(s => s.date === today);
      const todayTotal = todaySales.reduce((s, sale) => s + sale.total, 0);
      return `🛒 POS Sales Summary

• Total Transactions: ${sales.length}
• All-Time Revenue: ₱${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
• Today's Sales (${today}): ${todaySales.length} transactions
• Today's Revenue: ₱${todayTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    // Fallback
    const activeCount = allRes.filter(r => r.bookingStatus === 'Checked In' && !r.isBlockout).length;
    const holds = allRes.filter(r => r.isBlockout).length;
    const receivables = allRes
      .filter(r => !r.isBlockout && (r.paymentStatus === 'PARTIAL' || r.paymentStatus === 'UNPAID'))
      .reduce((s, r) => s + parseFloat(r.folio.replace(/,/g, '')), 0);
    return `📊 Amalfi Ops Summary

• Occupancy: ${((activeCount / 6) * 100).toFixed(1)}% (${activeCount}/6 villas)
• Active Maintenance Holds: ${holds}
• Outstanding Receivables: ₱${receivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
• EBITDA Margin: 48.6% ✅

💡 Try asking:
  "What is Sophia Loren's folio?"
  "Show occupancy rate"
  "List maintenance holds"
  "Analyze revenue pacing"`;
  }

});
