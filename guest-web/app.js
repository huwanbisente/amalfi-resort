document.addEventListener('DOMContentLoaded', () => {
  // Theme Toggle Management
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');
  
  // Set default theme to dark
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
      themeIcon.textContent = 'light_mode'; // icon to switch to light mode
    } else {
      themeIcon.textContent = 'dark_mode'; // icon to switch to dark mode
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
      id: "loren",
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
      addonCabana: true,
      addonDrinks: false,
      addonShuttle: false,
      addonMassage: true,
      folio: "61,950.00",
      isBlockout: false
    },
    {
      id: "clooney",
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
      addonCabana: false,
      addonDrinks: true,
      addonShuttle: true,
      addonMassage: false,
      folio: "96,900.00",
      isBlockout: false
    },
    {
      id: "harrington",
      guest: "Marcus Harrington",
      villa: "Villa 6",
      villaName: "Sunset Pavilion",
      dates: "June 24 - June 28",
      checkIn: "2026-06-24",
      checkOut: "2026-06-28",
      created: "June 15, 2026",
      bookingStatus: "Confirmed",
      paymentStatus: "UNPAID",
      baseRate: 42100,
      addonCabana: false,
      addonDrinks: false,
      addonShuttle: true,
      addonMassage: false,
      folio: "42,600.00",
      isBlockout: false
    }
  ];

  // Initialize reservations in localStorage if not exists
  if (!localStorage.getItem('amalfi_reservations')) {
    localStorage.setItem('amalfi_reservations', JSON.stringify(DEFAULT_RESERVATIONS));
  }

  // Villa Data
  const villas = [
    { id: "Villa 1", name: "Amalfi Suite", category: "Medium Sized Luxury Villa", nightlyRate: 8278.57, cap: 4, image: "../amalfi_pool.png" },
    { id: "Villa 2", name: "Positano Vista", category: "Medium Sized Luxury Villa", nightlyRate: 9500, cap: 4, image: "../amalfi_terrace.png" },
    { id: "Villa 3", name: "Ravello Suite", category: "Medium Sized Luxury Villa", nightlyRate: 8750, cap: 4, image: "../amalfi_gardens.png" },
    { id: "Villa 4", name: "Capri Vista", category: "Medium Sized Luxury Villa", nightlyRate: 8800, cap: 4, image: "../amalfi_yacht.png" },
    { id: "Villa 5", name: "Sirenuse Suite", category: "Large Luxury Villa", nightlyRate: 19080, cap: 8, image: "../amalfi_bedroom.png" },
    { id: "Villa 6", name: "Sunset Pavilion", category: "Large Luxury Villa", nightlyRate: 10525, cap: 6, image: "../amalfi_bathroom.png" }
  ];

  // DOM Elements
  const checkinInput = document.getElementById('checkin');
  const checkoutInput = document.getElementById('checkout');
  const guestsSelect = document.getElementById('guests-count');
  const searchBtn = document.getElementById('search-btn');
  const villasGrid = document.getElementById('villas-grid');
  
  // Booking Modal Elements
  const bookingModal = document.getElementById('booking-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const modalVillaName = document.getElementById('modal-villa-name');
  const modalVillaRate = document.getElementById('modal-villa-rate');
  
  // Step navigation
  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');
  const stepSuccess = document.getElementById('step-success');
  
  const toStep2Btn = document.getElementById('to-step-2');
  const backToStep1Btn = document.getElementById('back-to-step-1');
  const toStep3Btn = document.getElementById('to-step-3');
  const backToStep2Btn = document.getElementById('back-to-step-2');
  const submitBookingBtn = document.getElementById('submit-booking-btn');
  
  // Addons prices
  const ADDONS = {
    cabana: { price: 2000, label: "Private Pool Cabana (per stay)" },
    drinks: { price: 1500, label: "All-Day Drinks Package" },
    shuttle: { price: 500, label: "Airport / Port Shuttle" },
    massage: { price: 2000, label: "In-Room Massage Session" }
  };
  
  // Form fields
  const guestNameInput = document.getElementById('guest-name');
  const guestEmailInput = document.getElementById('guest-email');
  const guestPhoneInput = document.getElementById('guest-phone');
  const guestCountInput = document.getElementById('guest-count');
  const refNoInput = document.getElementById('ref-no');
  
  // Dynamic Pricing Summary
  const summaryNights = document.getElementById('summary-nights');
  const summaryBaseRate = document.getElementById('summary-base-rate');
  const summaryBaseTotal = document.getElementById('summary-base-total');
  const summaryAddonsList = document.getElementById('summary-addons-list');
  const summaryTotal = document.getElementById('summary-total');

  let selectedVilla = null;
  let nightsCount = 1;

  // Set default dates (today and tomorrow)
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  checkinInput.value = today.toISOString().split('T')[0];
  checkoutInput.value = tomorrow.toISOString().split('T')[0];

  // Render villas
  function renderVillas() {
    villasGrid.innerHTML = '';
    villas.forEach(villa => {
      const card = document.createElement('div');
      card.className = 'glass-panel hover-border-gold flex flex-col overflow-hidden bg-opacity-70 border-outline transition duration-300 min-w-[85vw] md:min-w-0 snap-start shrink-0';
      card.innerHTML = `
        <div class="h-72 overflow-hidden relative img-zoom-container">
          <img src="${villa.image}" alt="${villa.name}" class="w-full h-full object-cover">
          <div class="absolute top-4 right-4 bg-background bg-opacity-80 text-[10px] tracking-widest text-tertiary font-bold px-3.5 py-1.5 border border-tertiary border-opacity-30">
            $${villa.nightlyRate.toLocaleString()}/NIGHT
          </div>
        </div>
        <div class="p-8 flex-1 flex flex-col">
          <div class="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-[0.2em] font-bold mb-1.5">${villa.category}</div>
          <h3 class="font-headline-md text-on-surface mb-3">${villa.name}</h3>
          
          <div class="flex items-center gap-6 mb-8 text-xs text-on-surface-variant font-medium">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-tertiary">group</span>
              <span>Capacity: ${villa.cap} guests</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-tertiary">wifi</span>
              <span>Complimentary Wi-Fi</span>
            </div>
          </div>
          
          <button class="reserve-btn mt-auto w-full py-3.5 bg-tertiary hover:bg-opacity-95 text-background font-label-caps font-bold text-xs uppercase tracking-widest transition duration-300 shadow-sm" data-id="${villa.id}">
            Book Suite
          </button>
        </div>
      `;
      villasGrid.appendChild(card);
    });

    // Add listeners to reserve buttons
    document.querySelectorAll('.reserve-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        openBookingModal(id);
      });
    });
  }

  // Date difference helper
  function calculateNights() {
    const ci = new Date(checkinInput.value);
    const co = new Date(checkoutInput.value);
    const diffTime = co - ci;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1;
  }

  // Open booking modal
  function openBookingModal(villaId) {
    selectedVilla = villas.find(v => v.id === villaId);
    if (!selectedVilla) return;

    nightsCount = calculateNights();
    
    // Set title
    modalVillaName.textContent = selectedVilla.name;
    modalVillaRate.textContent = `$${selectedVilla.nightlyRate.toLocaleString()} / Night`;

    // Reset steps
    step1.classList.remove('hidden');
    step2.classList.add('hidden');
    step3.classList.add('hidden');
    stepSuccess.classList.add('hidden');

    // Populate initial inputs
    guestCountInput.value = guestsSelect.value;
    
    updatePricingSummary();
    
    // Show modal
    bookingModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  // Close modal
  function closeModal() {
    bookingModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
  }

  closeModalBtn.addEventListener('click', closeModal);

  // Close when clicking outside of modal content
  bookingModal.addEventListener('click', (e) => {
    if (e.target === bookingModal) {
      closeModal();
    }
  });

  // Update dynamic pricing summary
  function updatePricingSummary() {
    if (!selectedVilla) return;
    
    const baseTotal = selectedVilla.nightlyRate * nightsCount;
    let addonsTotal = 0;
    
    summaryNights.textContent = `${nightsCount} ${nightsCount === 1 ? 'Night' : 'Nights'}`;
    summaryBaseRate.textContent = `$${selectedVilla.nightlyRate.toLocaleString()}`;
    summaryBaseTotal.textContent = `$${baseTotal.toLocaleString()}`;
    
    // Calculate addons
    summaryAddonsList.innerHTML = '';
    document.querySelectorAll('.addon-cb:checked').forEach(cb => {
      const key = cb.value;
      const addon = ADDONS[key];
      addonsTotal += addon.price;
      
      const item = document.createElement('div');
      item.className = 'flex justify-between text-xs text-stitch-muted py-1';
      item.innerHTML = `
        <span>+ ${addon.label}</span>
        <span class="mono-input font-semibold text-stitch-platinum">$${addon.price.toLocaleString()}</span>
      `;
      summaryAddonsList.appendChild(item);
    });

    const grandTotal = baseTotal + addonsTotal;
    summaryTotal.textContent = `$${grandTotal.toLocaleString()}`;
  }

  // Listen for addon checkbox changes
  document.querySelectorAll('.addon-cb').forEach(cb => {
    cb.addEventListener('change', updatePricingSummary);
  });

  // Step Navigation Listeners
  toStep2Btn.addEventListener('click', () => {
    // Basic validation
    if (!guestNameInput.value.trim()) {
      alert("Please enter the primary guest's full name.");
      return;
    }
    step1.classList.add('hidden');
    step2.classList.remove('hidden');
  });

  backToStep1Btn.addEventListener('click', () => {
    step2.classList.add('hidden');
    step1.classList.remove('hidden');
  });

  toStep3Btn.addEventListener('click', () => {
    step2.classList.add('hidden');
    step3.classList.remove('hidden');
  });

  backToStep2Btn.addEventListener('click', () => {
    step3.classList.add('hidden');
    step2.classList.remove('hidden');
  });

  // Submit Booking
  submitBookingBtn.addEventListener('click', () => {
    if (!refNoInput.value.trim()) {
      alert("Please enter the payment reference number.");
      return;
    }

    const currentReservations = JSON.parse(localStorage.getItem('amalfi_reservations')) || [];
    
    const baseTotal = selectedVilla.nightlyRate * nightsCount;
    let addonsTotal = 0;
    
    const activeAddons = {};
    document.querySelectorAll('.addon-cb:checked').forEach(cb => {
      const key = cb.value;
      const addon = ADDONS[key];
      addonsTotal += addon.price;
      
      if (key === 'cabana') activeAddons.cabana = true;
      if (key === 'drinks') activeAddons.drinks = true;
      if (key === 'shuttle') activeAddons.shuttle = true;
      if (key === 'massage') activeAddons.massage = true;
    });

    const grandTotal = baseTotal + addonsTotal;

    // Create new reservation record
    const refId = "ALF-" + Math.floor(1000 + Math.random() * 9000);
    const newReservation = {
      id: refId.toLowerCase(),
      guest: guestNameInput.value,
      email: guestEmailInput.value,
      phone: guestPhoneInput.value,
      villa: selectedVilla.id,
      villaName: selectedVilla.name,
      dates: `${formatDate(checkinInput.value)} - ${formatDate(checkoutInput.value)}`,
      checkIn: checkinInput.value,
      checkOut: checkoutInput.value,
      created: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      bookingStatus: "Pending Verification",
      paymentStatus: "PENDING_VERIFICATION",
      baseRate: baseTotal,
      addonCabana: !!activeAddons.cabana,
      addonDrinks: !!activeAddons.drinks,
      addonShuttle: !!activeAddons.shuttle,
      addonMassage: !!activeAddons.massage,
      folio: grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      isBlockout: false,
      refNo: refNoInput.value,
      receiptMockUrl: "../amalfi_backdrop.png" // placeholder simulated upload
    };

    currentReservations.push(newReservation);
    localStorage.setItem('amalfi_reservations', JSON.stringify(currentReservations));

    // Show Success Step
    step3.classList.add('hidden');
    stepSuccess.classList.remove('hidden');
    
    // Set success text details
    document.getElementById('success-ref-no').textContent = refId;
  });

  // Date Formatting Helper
  function formatDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  // Trigger search
  searchBtn.addEventListener('click', () => {
    renderVillas();
    villasGrid.scrollIntoView({ behavior: 'smooth' });
  });

  // Side Navigation Drawer
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const closeSideNavBtn = document.getElementById('close-side-nav-btn');
  const sideNav = document.getElementById('side-nav');
  const sideNavBackdrop = document.getElementById('side-nav-backdrop');
  const sideNavLinks = document.querySelectorAll('.side-nav-link');

  if (menuToggleBtn && sideNav && sideNavBackdrop) {
    menuToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSideNav();
    });
  }

  if (closeSideNavBtn) {
    closeSideNavBtn.addEventListener('click', () => {
      closeSideNav();
    });
  }

  if (sideNavBackdrop) {
    sideNavBackdrop.addEventListener('click', () => {
      closeSideNav();
    });
  }

  function openSideNav() {
    sideNav.classList.remove('invisible', 'translate-x-full');
    sideNav.classList.add('visible', 'translate-x-0');
    sideNavBackdrop.classList.remove('opacity-0', 'pointer-events-none');
    sideNavBackdrop.classList.add('opacity-100', 'pointer-events-auto');
    document.body.style.overflow = 'hidden'; // prevent background scrolling
  }

  function closeSideNav() {
    sideNav.classList.remove('visible', 'translate-x-0');
    sideNav.classList.add('invisible', 'translate-x-full');
    sideNavBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    sideNavBackdrop.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = 'auto';
  }

  // Close side nav on link clicks
  sideNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeSideNav();
    });
  });

  // Initialize
  renderVillas();
});
