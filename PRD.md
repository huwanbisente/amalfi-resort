# Product Requirement Document (PRD)
## Project: Amalfi Resort Luxury Booking Dashboard (Frontend-First MVP)
### Date: June 20, 2026
### Role: Principal Product Manager & Elite UI/UX Engineer

---

## 1. Executive Summary & Core Vision

### 1.1 Overview
The **Amalfi Resort Luxury Booking Dashboard** is a hyper-exclusive, web-based digital concierge portal designed to streamline booking management, itinerary tracking, bespoke guest preparation, and financial summaries for elite travelers. The immediate goal is a **Frontend-First MVP** powered by robust mock data structures to establish a premium "vibe," high-end aesthetic, and seamless user experience for client demonstrations, stakeholder validation, and rapid buy-in.

### 1.2 Target Audience
* **Ultra-High-Net-Worth Individuals (UHNWIs):** High-profile clients, CEOs, and VIPs who value friction-free interactions, absolute discretion, and instant access to bespoke reservation data.
* **Elite Private Travel Managers & Concierges:** Operators managing multi-leg itineraries, specific villa setup preferences, and discrete travel arrangements on behalf of UHNWIs.

### 1.3 Core Value Proposition
* **Frictionless Bespoke Service:** Transitioning traditional concierge communication (emails, text messages) into a centralized, highly responsive interactive portal.
* **Timeline Fluidity:** Translating complex travel details (private jets, villa arrivals, yacht charters, custom dinners) into a single, cohesive visual stream.
* **Uncompromising Discretion & Security:** Presenting incidental tracking and financial ledgers with privacy-obscuring toggles to safeguard high-value details in public spaces.
* **Elite Aesthetic Feel:** Utilizing a clean, low-glare, dark terminal-luxury framework (Stitch Design System) that communicates prestige, weightless depth, and premium quality.

---

## 2. Stitch-Driven Premium Luxury Theme Specifications

The application's interface must strictly adhere to the "Stitch" design system guidelines, leveraging a dark, editorial, and glassmorphic aesthetic to create an elite, premium presentation.

### 2.1 Visual Palette & Color Tokens

| Palette Role | Token Name | Hex Value | Visual Weight & Usage Guidelines |
| :--- | :--- | :--- | :--- |
| **Base Canvas** | `stitch-bg-dark` | `#0B0C10` | Deep Obsidian. Primary background for the entire page canvas to reduce eye-strain. |
| **Surface Base** | `stitch-bg-midnight` | `#1F2833` | Matte Midnight. Used for cards, panels, list containers, and structural sections. |
| **Typography & Borders** | `stitch-text-platinum` | `#E3E8EC` | Brushed Platinum. High contrast, crisp readability for text, icons, and subtle rules. |
| **Primary Accent** | `stitch-accent-gold` | `#D4AF37` | Champagne Gold. Used strictly under 5% visual weight for elite tier badges, status signifiers, and premium CTA highlights. |
| **System Accent** | `stitch-accent-mint` | `#39FF14` | Neon-Mint. Strictly reserved for active states, real-time live tracking indicators, and system confirmations. |
| **Overlay Border** | `stitch-border-glass` | `rgba(227, 232, 236, 0.08)` | Translucent Platinum Border. Super thin 1px border for containers to define edges without clutter. |
| **Muted Text** | `stitch-text-muted` | `#6C7A89` | Muted Charcoal. Used for secondary labels, table headers, and timestamp metadata. |

### 2.2 Typography Hierarchy & Styling
The dashboard utilizes an **Elegant Editorial** typography model:
* **Section Headers (`h1`, `h2`, `h3`):** Must be rendered with wide letter-spacing (`letter-spacing: 0.15em` / `tracking-wide`) to evoke high-end editorial magazines. Serif fonts are acceptable for dramatic main titles, but clean, geometric sans-serif fonts are preferred for headers when aligned with technical or numeric details.
* **System Numeric Data & Labels:** Strict use of crisp, geometric monospace/sans-serif fonts (e.g., `Space Grotesk`, `JetBrains Mono` or similar system-fallback geometric sans) to emphasize precision, clean lines, and financial security.
* **Letter-Case:** Headers and category chips should be formatted in `uppercase` with wide tracking to maintain a clean, architectural visual grid.

### 2.3 Material, Depth & Spacing ("Stitch Glass")
To convey weightlessness and floating interfaces, we specify the following properties:
* **Backdrop Filters:** Glassmorphic surfaces using `backdrop-filter: blur(12px)` and translucent backgrounds (`rgba(31, 40, 51, 0.7)`).
* **Super-Thin Borders:** Structural elements must use razor-thin `1px` solid borders colored with `stitch-border-glass`.
* **Ambient Drop Shadows:** Soft, diffuse dark glows (`box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.47)`) to separate layout cards from the deep obsidian backdrop.
* **Generous White Space:** Layout paddings of `2rem` (32px) or more between primary cards to give components breathing room, avoiding information density overload.

### 2.4 Motion & Micro-interactions
Transitions must feel deliberate, velvet-smooth, and custom-tuned:
* **Interactive Transitions:** A standard transition of `transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)` (ease-out-quad) or `cubic-bezier(0.4, 0, 0.2, 1)` must be applied to all hover states.
* **Hover Animations:** Buttons, list rows, and interactive cards must lift or glow subtly (e.g., slight border color shifting to `#D4AF37` gold or opacity shifts) rather than jumping abruptly.
* **Entry Effects:** Modals and dynamic sections should slide in from a Y-offset of `10px` combined with a smooth fade-in over `350ms`.

---

## 3. Core Dashboard Features & Functional Requirements

The MVP dashboard layout consists of a responsive sidebar structure paired with four main functional panels.

```
+-----------------------------------------------------------------------------------+
|  (S) STITCH                                                                       |
|  AMALFI RESORT    [ OVERVIEW HUB ]                                                |
|                   +-------------------------------------------------------------+ |
|  [ ] Overview     | VIP Welcome & Membership Status             [GOLD TIER]     | |
|  [ ] Itinerary    | Villa 12 (Amalfi Vista Suite) | June 24 - July 02           | |
|  [ ] Requests     +-------------------------------------------------------------+ |
|  [ ] Financial    | [ DYNAMIC ITINERARY TIMELINE ]                              | |
|                   |  [Jun 24] Transfer (Limo) -> Villa Check-In                 | |
|  User Context     |  [Jun 25] Yacht Charter (Capri) -> Chef Dinner              | |
|  [Obscure Ledger] +-------------------------------------------------------------+ |
|  [Sign Out]       | [ BESPOKE REQUEST PORTAL ]   | [ DISCREET FINANCIAL LEDGER ]| |
|                   | - Dietary Prov. (Submitted)  | Total Balance: $XX,XXX      | |
|                   | - Room Temp (Pending)        | Pending: $X,XXX             | |
|                   | - Private Butler (Confirmed) | [Show/Hide Financials Toggle] | |
+-----------------------------------------------------------------------------------+
```

### 3.1 Immersive Overview Hub
* **Objective:** Instantly orient the user/concierge upon landing.
* **Visual Components:**
  * **VIP Welcome Banner:** Personalized greeting (e.g., *"Welcome back, Lord Harrington"*).
  * **Membership Tier Indicator:** A custom luxury badge marked as `Gold Elite` or `Black Diamond` utilizing the `#D4AF37` (Champagne Gold) accent color with a subtle pulsing aura.
  * **Current Accommodation Quick-Card:** Displays current/upcoming villa assignment, dates, and live booking status ("Confirmed" with Neon-Mint dot indicator).
  * **Quick Actions Panel:** Rapid navigation buttons to trigger new request submissions, message the concierge, or download the full reservation folio.

### 3.2 Dynamic Itinerary Timeline
* **Objective:** Give the guest a fluid, chronologically accurate map of their resort experience.
* **Visual Components:**
  * **Multi-Day Timeline Track:** Vertical or horizontal path showing daily events. Each node represents a scheduled experience (e.g., Private Jet Land, Yacht Excursion, Spa Session, In-Villa Dining).
  * **Live Event Highlight:** Current ongoing events highlighted with a Neon-Mint active pulsing indicator.
  * **Timeline Filtering:** Toggle tabs to filter events by category (Travel, Dining, Leisure, Wellness).
  * **Interactivity:** Clicking a timeline node slides open a details panel containing reservation IDs, contact numbers for drivers/captains, and coordinates.

### 3.3 Bespoke Request Portal
* **Objective:** Provide a digital form and status board for ultra-custom prep requests.
* **Visual Components:**
  * **Active Request Board:** A Kanban or grid-like list showing the status of requested amenities (e.g., "Pantry Stocking," "Private Chef," "Room Micro-Climate Presets").
  * **Status Badges:** Dynamic statuses using Stitch tokens:
    * *Pending Review* (Muted Charcoal text)
    * *In Coordination* (Champagne Gold border/text)
    * *Confirmed & Ready* (Neon-Mint active state)
  * **New Request Form:** A modal or slide-over drawer allowing users to select prep categories, type custom details, select date/time, and submit. The submission instantly prepends a mock item to the list with interactive state feedback.

### 3.4 Discreet Financial Ledger
* **Objective:** Deliver transparent transaction and incidentals details while respecting privacy.
* **Visual Components:**
  * **Folio Summary Cards:** Showing Total Charges, Deposits Held, and Current Balance in monospace typography.
  * **Discretion Toggle (Privacy Mode):** A global header toggle ("Obscure Balances"). When toggled, all currency amounts are masked behind a soft backdrop-blur filter or character replacement (e.g., `$ ••••••`), allowing guests to review the ledger in public spaces or airport terminals without exposing their net worth.
  * **Transaction Data Table:** Structured row listing (Date, Description, Category, Amount) using a luxury data table with a 1px border.

---

## 4. Technical Blueprint & Component Tree

To achieve a production-ready, clean react/svelte-like codebase structural blueprint, components are isolated and mapped directly to Stitch primitive templates.

### 4.1 Folder Hierarchy Strategy

```
amalfi-resort/
├── public/
│   └── assets/                     # Premium SVGs, Luxury background imagery
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx          # StitchSidebar container
│   │   │   └── Header.jsx           # Global controls (Privacy toggle, User profile)
│   │   ├── dashboard/
│   │   │   ├── OverviewHub.jsx      # VIP overview card & status panel
│   │   │   ├── ItineraryTimeline.jsx# Dynamic itinerary list & event modal
│   │   │   ├── RequestPortal.jsx    # Bespoke request list & interactive form
│   │   │   └── FinancialLedger.jsx  # Folio details & privacy masking
│   │   └── ui/                     # Reusable Stitch primitives
│   │       ├── StitchCard.jsx       # Custom-glass card container
│   │       ├── StitchButton.jsx     # Champagne Gold & Neon Mint button variations
│   │       ├── StitchModal.jsx      # Glassmorphic backdrop popovers
│   │       └── StitchTable.jsx      # Secure data-table layout
│   ├── context/
│   │   └── DashboardContext.jsx     # Handles global privacy mode toggle & state sharing
│   ├── data/
│   │   └── mockData.js              # Centralized JSON storage for stateful mock interaction
│   ├── index.css                    # Root design tokens & global overrides
│   ├── App.jsx                      # Main assembly & layout router
│   └── main.jsx
├── package.json
└── vite.config.js
```

### 4.2 Mapping UI Components to Stitch Primitives

We map our core UI views to standard design system guidelines using the following structural layout components:

1. **`StitchSidebar` (`<Sidebar />`)**
   * *Purpose:* Left-aligned static navigation wrapper.
   * *Styles:* Fixed width (260px), background of Deep Obsidian mixed with 4% opacity Brushed Platinum, 1px right border.
   * *Elements:* Monospace luxury logo at top, navigation items with Champagne Gold highlight on hover, bottom section for the Guest Privacy Control switch.

2. **`StitchCard` (`<StitchCard />`)**
   * *Purpose:* Reusable container for all content blocks.
   * *Styles:* Background `rgba(31, 40, 51, 0.6)` (Midnight Glass), border `1px solid rgba(227, 232, 236, 0.08)`, border-radius `12px`, padding `1.5rem` to `2.5rem`, backdrop-filter `blur(10px)`.

3. **`StitchModal` (`<StitchModal />` / `<StitchDrawer />`)**
   * *Purpose:* Overlay for submitting bespoke requests or showing timeline node details.
   * *Styles:* Absolute overlay with `backdrop-filter: blur(15px)`, content panel container using `stitch-bg-dark` surrounded by a `1px` gold border for elite alerts.

4. **`StitchDataTable` (`<StitchTable />`)**
   * *Purpose:* Displays the transaction list in the financial view.
   * *Styles:* Table rows with slight hover scaling, alternating row backgrounds (Matte Midnight vs Deep Obsidian), crisp platinum cell text, and integration with the balance-masking filter.

### 4.3 Centralized Mock Data Structure (`mockData.js`)

To guarantee immediate reactivity during client walk-throughs, the application will load dynamic JSON data representing the reservation profile. Below is the blueprint schema to be implemented:

```javascript
export const MOCK_RESERVATION = {
  guest: {
    name: "Lord Marcus Harrington",
    tier: "BLACK DIAMOND",
    points: 120000,
    avatar: "/assets/harrington_avatar.png"
  },
  accommodation: {
    villaName: "Villa 12 (Amalfi Vista Suite)",
    arrivalDate: "2026-06-24",
    departureDate: "2026-07-02",
    status: "CONFIRMED"
  },
  itinerary: [
    {
      id: "itinerary-1",
      date: "2026-06-24",
      time: "14:00",
      title: "Private Flight Arrival & Limo Transfer",
      description: "Arrival at Naples International Airport. Private AMG Mercedes-Maybach transfer to Amalfi Resort.",
      category: "Travel",
      status: "COMPLETED",
      coordinator: "Giovanni Russo"
    },
    {
      id: "itinerary-2",
      date: "2026-06-25",
      time: "10:00",
      title: "Private Yacht Charter - Capri Coastline",
      description: "Boarding the 80ft Riva Flybridge at Amalfi Marina. Sunset dinner served by private chef on board.",
      category: "Leisure",
      status: "ACTIVE",
      coordinator: "Captain Matteo"
    },
    {
      id: "itinerary-3",
      date: "2026-06-26",
      time: "16:00",
      title: "In-Villa Thermal Spa Ritual",
      description: "Custom deep-tissue massage and private aromatherapy steam room setup inside Villa 12.",
      category: "Wellness",
      status: "UPCOMING",
      coordinator: "Elena Schmidt"
    }
  ],
  bespokeRequests: [
    {
      id: "req-1",
      category: "Dietary & Provisioning",
      title: "Vintage Wine & Cellar Stocking",
      details: "Requesting 6 bottles of Sassicaia 2016, organic San Marzano tomatoes, and gluten-free pastries stocked in kitchen.",
      status: "CONFIRMED",
      dateRequested: "2026-06-18"
    },
    {
      id: "req-2",
      category: "Dedicated Staff",
      title: "24/7 Private Butler Service",
      details: "Assigned butler fluent in English and Italian to handle packing/unpacking and dinner bookings.",
      status: "CONFIRMED",
      dateRequested: "2026-06-19"
    },
    {
      id: "req-3",
      category: "Room Presets",
      title: "Micro-Climate Preset (21°C)",
      details: "Set main suite temperature to 21°C, low humidity. High-density down pillows only.",
      status: "PENDING",
      dateRequested: "2026-06-20"
    }
  ],
  ledger: {
    totalCharges: 84200.00,
    depositHeld: 50000.00,
    outstandingBalance: 34200.00,
    transactions: [
      { id: "tx-1", date: "2026-06-15", desc: "Villa 12 Base Rate - Deposit (50%)", amount: 42100.00, status: "PAID" },
      { id: "tx-2", date: "2026-06-18", desc: "Private Yacht Charter Booking Fee", amount: 15000.00, status: "PAID" },
      { id: "tx-3", date: "2026-06-20", desc: "Helicopter Transfer (Naples to Amalfi)", amount: 8500.00, status: "PENDING" },
      { id: "tx-4", date: "2026-06-20", desc: "Premium Cellar Stocking (Sassicaia)", amount: 18600.00, status: "UNPAID" }
    ]
  }
};
```

---

## 5. Verification Plan (Pre-Client Demo Validation)

To ensure the client presentation is flawless, the following manual and interactive workflows must be validated:

### 5.1 Interactive Validation Checklist
1. **Privacy Mode Test:** 
   * Click the "Obscure Ledger / Privacy Mode" toggle in the sidebar.
   * Verify all numbers on the dashboard card headers and table cells instantly apply a CSS blur (`filter: blur(5px)`) or text obscuring (`$ ••••••`).
   * Turn toggle off and verify they return to clean text smoothly.
2. **New Bespoke Request Submission Test:**
   * Open the "Bespoke Request Portal" modal.
   * Submit a new entry (e.g., *"Helicopter transfer luggage service"*).
   * Verify the submission is dynamically prepended to the React state list and displays a "Pending" label immediately on the UI.
3. **Responsive / Fluid Drag-Scroll Test:**
   * Resize screen to mobile, tablet, and widescreen.
   * Verify the sidebar collapses into a sleek slide-out menu drawer and the content grid shifts into a clean, vertical stack without breaking the editorial grid alignment.
