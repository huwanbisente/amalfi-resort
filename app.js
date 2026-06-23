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

  const reservations = [
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
      folio: "62,150.00",
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
      folio: "28,500.00",
      startOffset: 5,
      duration: 3,
      isBlockout: false
    },
    // Blockouts
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
      folio: "0.00",
      startOffset: 0,
      duration: 3,
      isBlockout: true
    }
  ];

  let ganttStartDate = new Date("2026-06-18");
  const operationalStartDate = new Date("2026-06-18");
  let currentLedgerTab = 'active';

  const specialBookings = [
    {
      id: "SB-401",
      guest: "George Clooney",
      amenity: "Private Yacht Charter",
      details: "80ft Riva Flybridge Capri tour, private chef sunset dinner",
      date: "June 23, 2026",
      folio: "8,500.00",
      status: "Confirmed"
    },
    {
      id: "SB-402",
      guest: "Lord Marcus Harrington",
      amenity: "Sommelier Wine Reserve",
      details: "Stocking 1 bottle of Sassicaia 2016 wine in Villa 6 Acc.",
      date: "June 24, 2026",
      folio: "1,860.00",
      status: "Pending verification"
    },
    {
      id: "SB-403",
      guest: "Sophia Loren",
      amenity: "Helicopter Arrival Transfer",
      details: "Coordination of custom flight path and helipad landing clearance",
      date: "June 18, 2026",
      folio: "4,500.00",
      status: "Cleared"
    },
    {
      id: "SB-404",
      guest: "Lady Gaga",
      amenity: "Private Beach Sauna & Skipper",
      details: "Reservation of Emerald Cove thermal cave and skippered tender",
      date: "June 25, 2026",
      folio: "3,200.00",
      status: "Scheduled"
    }
  ];
  
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

  // Theme Toggle Click Handler
  if (themeToggleBtn && themeToggleIcon && themeToggleText) {
    themeToggleBtn.addEventListener('click', () => {
      const isDarkMode = document.documentElement.classList.toggle('dark');
      
      if (isDarkMode) {
        themeToggleIcon.textContent = 'light_mode';
        themeToggleText.textContent = 'Light Mode';
        if (typeof Chart !== 'undefined') {
          Chart.defaults.color = '#c7c6cb';
        }
      } else {
        themeToggleIcon.textContent = 'dark_mode';
        themeToggleText.textContent = 'Dark Mode';
        if (typeof Chart !== 'undefined') {
          Chart.defaults.color = '#0F1417';
        }
      }
      
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
    });
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
    }
  }

  // 2. Financial Ledger Privacy Obscuring Toggles
  if (privacyCheckbox) {
    privacyCheckbox.addEventListener('change', (e) => {
      const isObscured = e.target.checked;
      
      document.querySelectorAll('.ledger-maskable').forEach(el => {
        if (isObscured) {
          el.textContent = '••,•••.••';
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

      // Create and prepend row to Maintenance panel
      const tr = document.createElement('tr');
      tr.className = "border-b border-secondary/10 hover:bg-surface-variant/30 transition-all cursor-pointer";
      tr.innerHTML = `
        <td class="py-4 pr-4 font-mono-data">${ticketId}</td>
        <td class="py-4 px-4 font-label-caps text-tertiary">${location}</td>
        <td class="py-4 px-4">${desc}</td>
        <td class="py-4 px-4"><span class="font-semibold text-xs border px-2 py-0.5 ${severityClass}">${severity}</span></td>
        <td class="py-4 pl-4 text-right"><span class="text-xs font-label-caps text-on-surface-variant">Pending</span></td>
      `;

      ticketsTableBody.insertBefore(tr, ticketsTableBody.firstChild);
      
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

  // 5. Receipt Verification Workflow & Operator State Sync
  if (btnApproveSlip) {
    btnApproveSlip.addEventListener('click', () => {
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
      const harringtonRes = reservations.find(r => r.id === 'harrington');
      if (harringtonRes) {
        harringtonRes.bookingStatus = "Checked In";
        harringtonRes.paymentStatus = "PARTIAL";
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
            <span class="font-mono-data text-mint-active text-xs">16:50 • FRONT DESK</span>
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
    if (document.getElementById('edit-booking-addon-wine').checked) addonSum += 43600;
    if (document.getElementById('edit-booking-addon-yacht').checked) addonSum += 12500;
    if (document.getElementById('edit-booking-addon-spa').checked) addonSum += 4200;
    if (document.getElementById('edit-booking-addon-chef').checked) addonSum += 1500;
    
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
        discountValLabel.textContent = type === 'flat' ? 'Discount Amount (₱)' : 'Discount Percentage (%)';
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
    editBookingForm.addEventListener('submit', (e) => {
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
          res.folio = folio;
          res.startOffset = startOffset;
          res.duration = duration;
          res.isBlockout = isBlockout;
        }
      } else {
        // Add Mode
        const newId = "res-" + Date.now();
        reservations.push({
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
          folio: folio,
          startOffset: startOffset,
          duration: duration,
          isBlockout: isBlockout
        });
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
    btnDeleteBooking.addEventListener('click', (e) => {
      e.preventDefault();
      const rowId = document.getElementById('edit-booking-row-id').value;
      const idx = reservations.findIndex(r => r.id === rowId);
      if (idx !== -1) {
        reservations.splice(idx, 1);
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

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#c7c6cb' : '#0F1417';
    const gridColor = isDark ? 'rgba(227, 232, 236, 0.04)' : 'rgba(15, 20, 23, 0.06)';
    const doughnutBorderColor = isDark ? '#0f1417' : '#FFFFFF';
    const doughnutBgColor = isDark ? ['#D4AF37', '#1F2833', '#919095', '#39FF14'] : ['#D4AF37', '#E3E8EC', '#8C909F', '#0D7A0D'];

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
                label: 'Revenues (₱)',
                data: [240000, 295000, 340000, 325000, 380000, 412850],
                backgroundColor: 'rgba(214, 175, 55, 0.75)',
                borderColor: '#D4AF37',
                borderWidth: 1
              },
              {
                label: 'Operating Expenses (₱)',
                data: [110000, 135000, 150000, 145000, 170000, 185300],
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
                  callback: function(value) { return '₱' + (value / 1000) + 'k'; }
                }
              }
            }
          }
        });
      } else {
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
              data: [49.2, 49.2, 50.6, 50.2, 50.3, 43.4],
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
        chartSummaryMarginInstance.update();
      }
    }

    if (sumCatCtx && !sumCatCtx.closest('.hidden')) {
      if (!chartSummaryCategoriesInstance) {
        chartSummaryCategoriesInstance = new Chart(sumCatCtx, {
          type: 'doughnut',
          data: {
            labels: ['Suites', 'Dining', 'Experiences', 'Spa'],
            datasets: [{
              data: [70, 15, 10, 5],
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
                label: 'Suites Base Rates (₱)',
                data: [180000, 220000, 250000, 240000, 270000, 284500],
                borderColor: '#D4AF37',
                backgroundColor: goldGradient,
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointBackgroundColor: '#D4AF37',
                pointRadius: 4
              },
              {
                label: 'Incidentals & Services (₱)',
                data: [60000, 75000, 90000, 85000, 110000, 128350],
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
                  callback: function(value) { return '₱' + (value / 1000) + 'k'; }
                }
              }
            }
          }
        });
      } else {
        chartRevenueInstance.update();
      }
    }

    if (catCtx && !catCtx.closest('.hidden')) {
      if (!chartCategoriesInstance) {
        chartCategoriesInstance = new Chart(catCtx, {
          type: 'doughnut',
          data: {
            labels: ['Suites', 'Dining', 'Experiences', 'Spa'],
            datasets: [{
              data: [70, 15, 10, 5],
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
                label: 'Room Revenue (₱)',
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
                  callback: function(value) { return '₱' + (value / 1000) + 'k'; }
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
              label: 'ADR (₱)',
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
                  callback: function(value) { return '₱' + value.toLocaleString(); }
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
              label: 'RevPAR (₱)',
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
                  callback: function(value) { return '₱' + value.toLocaleString(); }
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
                label: 'Revenues (₱)',
                data: [240000, 295000, 340000, 325000, 380000, 412850],
                backgroundColor: 'rgba(214, 175, 55, 0.75)',
                borderColor: '#D4AF37',
                borderWidth: 1
              },
              {
                type: 'bar',
                label: 'Operating Expenses (₱)',
                data: [110000, 135000, 150000, 145000, 170000, 185300],
                backgroundColor: isDark ? 'rgba(199, 198, 203, 0.2)' : 'rgba(15, 20, 23, 0.15)',
                borderColor: '#8C909F',
                borderWidth: 1
              },
              {
                type: 'line',
                label: 'Net Cashflow (₱)',
                data: [130000, 160000, 190000, 180000, 210000, 227550],
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
                  callback: function(value) { return '₱' + (value / 1000) + 'k'; }
                }
              }
            }
          }
        });
      } else {
        chartExpensesCashflowInstance.update();
      }
    }

    if (expenseCategoriesCtx && !expenseCategoriesCtx.closest('.hidden')) {
      if (!chartExpenseCategoriesInstance) {
        chartExpenseCategoriesInstance = new Chart(expenseCategoriesCtx, {
          type: 'polarArea',
          data: {
            labels: ['Salaries', 'Utilities', 'Sommelier', 'Yacht Ops', 'Spa Supplies'],
            datasets: [{
              data: [87200, 10900, 43600, 32700, 10900],
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
              data: [54.2, 54.2, 55.9, 55.4, 55.3, 55.1],
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
      const headers = ["Reservation ID", "Guest Name", "Villa", "Villa Name", "Booking Dates", "Date Created", "Booking Status", "Payment Status", "Folio Value (₱)"];
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
                <td class="text-right"><strong>Currency:</strong> PHP (₱)</td>
              </tr>
            </table>
          </div>
          
          <div class="section-title">Operating Ledger Breakdown (USALI Lodging Standard)</div>
          <table class="financial-table">
            <thead>
              <tr>
                <th>Account Category</th>
                <th class="text-right" style="width: 18%;">June 2026 (₱)</th>
                <th class="text-right" style="width: 12%;">June %</th>
                <th class="text-right" style="width: 20%;">YTD Total (₱)</th>
                <th class="text-right" style="width: 12%;">YTD %</th>
              </tr>
            </thead>
            <tbody>
              <!-- REVENUES -->
              <tr class="category-header">
                <td colspan="5">Operating Revenues</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Rooms Base Rates</td>
                <td class="text-right">284,500.00</td>
                <td class="text-right">68.9%</td>
                <td class="text-right">1,204,500.00</td>
                <td class="text-right">70.4%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Food, Wine & Sommelier Services</td>
                <td class="text-right">64,200.00</td>
                <td class="text-right">15.5%</td>
                <td class="text-right">244,200.00</td>
                <td class="text-right">14.3%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Guest Yacht Experience & Amenities</td>
                <td class="text-right">48,500.00</td>
                <td class="text-right">11.7%</td>
                <td class="text-right">198,500.00</td>
                <td class="text-right">11.6%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Spa & Wellness Programs</td>
                <td class="text-right">15,650.00</td>
                <td class="text-right">3.8%</td>
                <td class="text-right">62,800.00</td>
                <td class="text-right">3.7%</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Gross Operating Revenue</td>
                <td class="text-right">412,850.00</td>
                <td class="text-right">100.0%</td>
                <td class="text-right">1,710,000.00</td>
                <td class="text-right">100.0%</td>
              </tr>
              
              <!-- COGS -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Cost of Goods Sold (COGS)</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Sommelier Wine Stocking Costs</td>
                <td class="text-right">43,600.00</td>
                <td class="text-right">10.6%</td>
                <td class="text-right">163,600.00</td>
                <td class="text-right">9.6%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Yacht Fuel & Consumables</td>
                <td class="text-right">12,500.00</td>
                <td class="text-right">3.0%</td>
                <td class="text-right">42,500.00</td>
                <td class="text-right">2.5%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Spa & Wellness Materials</td>
                <td class="text-right">4,200.00</td>
                <td class="text-right">1.0%</td>
                <td class="text-right">15,200.00</td>
                <td class="text-right">0.9%</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Total Cost of Goods Sold</td>
                <td class="text-right">60,300.00</td>
                <td class="text-right">14.6%</td>
                <td class="text-right">221,300.00</td>
                <td class="text-right">12.9%</td>
              </tr>

              <!-- GROSS PROFIT -->
              <tr class="total-row" style="background: #F7FAFC;">
                <td style="text-transform: uppercase; font-weight: 700;">Gross Profit</td>
                <td class="text-right font-bold">352,550.00</td>
                <td class="text-right font-bold">85.4%</td>
                <td class="text-right font-bold">1,488,700.00</td>
                <td class="text-right font-bold">87.1%</td>
              </tr>
              
              <!-- SGA -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Undistributed Operating Expenses (SGA)</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Staff Salaries & Benefits</td>
                <td class="text-right">87,200.00</td>
                <td class="text-right">21.1%</td>
                <td class="text-right">387,200.00</td>
                <td class="text-right">22.6%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Utilities, Infrastructure & IT</td>
                <td class="text-right">10,900.00</td>
                <td class="text-right">2.6%</td>
                <td class="text-right">48,900.00</td>
                <td class="text-right">2.9%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Yacht Crewing & Operations Maintenance</td>
                <td class="text-right">20,200.00</td>
                <td class="text-right">4.9%</td>
                <td class="text-right">80,200.00</td>
                <td class="text-right">4.7%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Spa & Wellness Operations Staffing</td>
                <td class="text-right">6,700.00</td>
                <td class="text-right">1.6%</td>
                <td class="text-right">25,700.00</td>
                <td class="text-right">1.5%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Maintenance & Facility Upkeep</td>
                <td class="text-right">12,400.00</td>
                <td class="text-right">3.0%</td>
                <td class="text-right">45,600.00</td>
                <td class="text-right">2.7%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Administration, Guest Acquisition & Marketing</td>
                <td class="text-right">15,300.00</td>
                <td class="text-right">3.7%</td>
                <td class="text-right">65,200.00</td>
                <td class="text-right">3.8%</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Total SGA Expenses</td>
                <td class="text-right" style="color: #C53030;">152,700.00</td>
                <td class="text-right">37.0%</td>
                <td class="text-right" style="color: #C53030;">652,800.00</td>
                <td class="text-right">38.2%</td>
              </tr>
              
              <!-- EBITDA -->
              <tr class="noi-row" style="background: #F7FAFC;">
                <td style="text-transform: uppercase; font-weight: 700; color: #1A365D;">Gross Operating Profit (EBITDA)</td>
                <td class="text-right font-bold" style="color: #1A365D;">199,850.00</td>
                <td class="text-right font-bold" style="color: #1A365D;">48.4%</td>
                <td class="text-right font-bold" style="color: #1A365D;">835,900.00</td>
                <td class="text-right font-bold" style="color: #1A365D;">48.9%</td>
              </tr>

              <!-- FIXED CHARGES -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Fixed Charges</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Property Insurance & Taxes</td>
                <td class="text-right">8,500.00</td>
                <td class="text-right">2.1%</td>
                <td class="text-right">51,000.00</td>
                <td class="text-right">3.0%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Management & Brand Franchise Fees</td>
                <td class="text-right">12,000.00</td>
                <td class="text-right">2.9%</td>
                <td class="text-right">72,000.00</td>
                <td class="text-right">4.2%</td>
              </tr>
              <tr class="total-row">
                <td style="text-transform: uppercase;">Total Fixed Charges</td>
                <td class="text-right">20,500.00</td>
                <td class="text-right">5.0%</td>
                <td class="text-right">123,000.00</td>
                <td class="text-right">7.2%</td>
              </tr>

              <!-- NOI -->
              <tr class="noi-row" style="background: #F7FAFC;">
                <td style="text-transform: uppercase; font-weight: 700;">Net Operating Income (NOI)</td>
                <td class="text-right font-bold">179,350.00</td>
                <td class="text-right font-bold">43.4%</td>
                <td class="text-right font-bold">712,900.00</td>
                <td class="text-right font-bold">41.7%</td>
              </tr>

              <!-- NON-OPERATING -->
              <tr class="category-header">
                <td colspan="5" style="padding-top: 15px;">Non-Operating Expenses / Taxes</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Mortgage & Debt Interest Expense</td>
                <td class="text-right">5,400.00</td>
                <td class="text-right">1.3%</td>
                <td class="text-right">32,400.00</td>
                <td class="text-right">1.9%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Depreciation & Capital Amortization</td>
                <td class="text-right">14,000.00</td>
                <td class="text-right">3.4%</td>
                <td class="text-right">84,000.00</td>
                <td class="text-right">4.9%</td>
              </tr>
              <tr>
                <td style="padding-left: 20px;">Corporate Taxes</td>
                <td class="text-right">25,000.00</td>
                <td class="text-right">6.1%</td>
                <td class="text-right">120,000.00</td>
                <td class="text-right">7.0%</td>
              </tr>

              <!-- NET INCOME -->
              <tr class="net-income-row">
                <td style="text-transform: uppercase;">Net Income</td>
                <td class="text-right">134,950.00</td>
                <td class="text-right">32.7%</td>
                <td class="text-right">476,500.00</td>
                <td class="text-right">27.9%</td>
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
                <th class="text-right">Folio (₱)</th>
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
                  <td class="text-right"><strong>₱${res.folio}</strong></td>
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
        amount: `₱${res.baseRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        status: res.paymentStatus === 'FULL' ? 'Settled' : 'Pending',
        resId: res.id
      });
      
      // 2. Add-on transactions
      const addons = [
        { key: 'addonWine', label: 'Sommelier Wine Stocking', price: 43600 },
        { key: 'addonYacht', label: 'Yacht Charter Experience', price: 12500 },
        { key: 'addonSpa', label: 'Spa & Wellness Program', price: 4200 },
        { key: 'addonChef', label: 'Private Chef Dining', price: 1500 }
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
            amount: `₱${addon.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            status: res.paymentStatus === 'FULL' ? 'Settled' : 'Pending',
            resId: res.id
          });
        }
      });
    });
    
    // Sort transactions by date (descending)
    return txList.reverse();
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
        overviewReceivablesVal.textContent = '••,•••.••';
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
          const headers = ["Reservation ID", "Guest Name", "Villa", "Villa Name", "Booking Dates", "Date Created", "Booking Status", "Payment Status", "Folio Value (₱)"];
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
          <td class="py-4 pl-4 text-right font-mono-data text-tertiary">₱<span class="ledger-maskable ledger-folio" ${harringtonValId}>${res.folio}</span></td>
        `;
        
        row.addEventListener('click', () => {
          openEditBookingModal(res);
        });
        
        tbody.appendChild(row);
      });
    }

    // Re-apply original folio masking variables
    document.querySelectorAll('.ledger-maskable').forEach(el => {
      el.setAttribute('data-original', el.textContent.trim().replace('₱', ''));
    });
    
    const isObscured = privacyCheckbox ? privacyCheckbox.checked : false;
    document.querySelectorAll('.ledger-maskable').forEach(el => {
      if (isObscured) {
        el.textContent = '••,•••.••';
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
        <td class="py-4 px-4 font-mono-data text-tertiary text-xs">₱<span class="ledger-maskable">${sb.folio}</span></td>
        <td class="py-4 pl-4 text-right sb-status"><span class="${statusColor} text-xs font-bold border px-2 py-0.5">${sb.status}</span></td>
      `;
      
      tr.addEventListener('click', () => {
        if (sb.status === 'Pending verification') {
          alert(`Special booking ${sb.id} is pending verification. Please clear deposit slip in Receipt Verifications tab.`);
        } else {
          alert(`Special booking details:\nGuest: ${sb.guest}\nService: ${sb.amenity}\nDetails: ${sb.details}\nFolio: ₱${sb.folio}\nStatus: ${sb.status}`);
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
            document.getElementById('discount-value-label').textContent = discType === 'flat' ? 'Discount Amount (₱)' : 'Discount Percentage (%)';
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
    } else {
      // ADD MODE
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
    
    label.textContent = `${startStr} — ${endStr}`;
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
        - **Folio Total**: ₱${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
        - **Payment Status**: ${res.paymentStatus === 'PARTIAL' ? 'PARTIAL (deposit paid, balance due)' : res.paymentStatus}
        - **Stay Dates**: ${res.dates} (${res.duration} nights)
        - **Add-on Services**: ${res.addonSpa ? 'Spa & Wellness (₱4,200.00)' : 'None'}
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
        - **Folio Total**: ₱${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
        - **Payment Status**: ${res.paymentStatus} (Wire Transfer pending verifications)
        - **Add-on Services**: Wine & Sommelier Pre-stock (₱1,860.00)
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
        - **Folio Total**: ₱${parseFloat(res.folio.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
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
      - **Active Receivables Ledger (Folios)**: **₱${totalReceivables.toLocaleString('en-US', {minimumFractionDigits: 2})}**
      - **ADR Pacing**: ₱4,733.33 (YTD +12.4% MoM)
      - **RevPAR**: ₱4,007.16 (YTD +8.2% MoM)
      - **EBITDA Profit Margin**: **48.6%** (Pacing on track for YTD H1 Targets)
      - **Revenue Streams**:
        - Suite Lodging: 75% allocation
        - Amenity Add-ons (Yacht/Chef/Spa): 25% allocation`;
    }

    // 7. Knowledgebase & Amenity Rates
    if (q.includes('rules') || q.includes('knowledge') || q.includes('rate') || q.includes('rates') || q.includes('price') || q.includes('pricing') || q.includes('yacht') || q.includes('sommelier') || q.includes('chef') || q.includes('spa')) {
      return `**RAG Match: Knowledge Monitor Accommodations & Amenities Rules**
      - **Standard Operations Policies**:
        - Check-in: 14:00 (Early check-in fee: ₱2,500.00, subject to availability).
        - Check-out: 11:00 (Late check-out fee: ₱3,500.00 until 16:00).
        - Security Deposit: ₱15,000.00 required upon reservation confirmation.
      - **Amenity Service Rates**:
        - **Yacht Charter (Private)**: ₱15,000.00/hour (includes crew and sparkling wine).
        - **Private Sommelier Wine Tasting**: ₱2,500.00/session.
        - **Personal Culinary Chef**: ₱8,500.00/meal prep (excludes ingredient folios).
        - **Luxury Spa Wellness Program**: ₱4,200.00/session.`;
    }

    // 8. Verification slips
    if (q.includes('verification') || q.includes('deposit') || q.includes('wire') || q.includes('swift') || q.includes('slip') || q.includes('auditor')) {
      return `**RAG Match: Front Desk Pending Verifications**
      - **Pending Slips in Queue**: **1**
      - **Details**: Lord Harrington (Villa 6). SWIFT transfer verification slip submitted for **₱42,100.00** matching deposit folio requirements.
      - **Action Required**: Operations manager approval required under the "Receipt Verifications" module to release check-in hold.`;
    }

    // Fallback general analysis
    return `**RAG Operations Brain - General Summary Report**
    I have run a broad vector search across the resort system:
    - **Villas & Map**: 6 total villas (Occupancy rate: **83.0%**). Villa 4 is under an active **Maintenance Hold**.
    - **Roster Flow**: George Clooney is arriving tomorrow at Villa 5 (Sirenuse Suite, Confirmed). Sophia Loren is checked in at Villa 1.
    - **Ledger Audit**: Receivables are at **₱312,850.00**. Margin pacing remains healthy at **48.6% EBITDA**.
    - **Front Desk**: 1 pending SWIFT receipt verification for Lord Harrington.
    
    *Tip: You can query specific details like "List all maintenance holds", "What is Sophia Loren's folio?", or "What are the private yacht rates?".*`;
  }

  // Trigger initial filter rendering for the overview view
  renderGlobalFilters('overview');

});
