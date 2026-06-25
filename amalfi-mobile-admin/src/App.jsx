import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Home,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  WalletCards,
  Wrench
} from 'lucide-react';
import { api } from './utils/api';
import {
  ADMIN_DESK_SECTION_ITEMS,
  buildAdminDeskRequest,
  buildCreateBookingPayload,
  buildFitWarnings,
  buildInitialPaymentPayload,
  buildQuoteRequest,
  buildRecommendationRequest,
  CHATBOT_CATEGORY_OPTIONS as CONTROL_CHATBOT_CATEGORY_OPTIONS
} from './utils/adminDeskControls';

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const BOOKING_DRAFT_KEY = 'amalfi_admin_desk_booking_draft_v1';
const pesoNumberFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const defaultBookingForm = {
  mode: 'solo',
  checkIn: today,
  checkOut: tomorrow,
  guests: 2,
  fullName: '',
  phone: '+63',
  email: '',
  bookingSource: 'Walk-in',
  initialPayment: '',
  paymentMethod: 'Cash',
  notes: ''
};

const CHATBOT_CATEGORY_OPTIONS = CONTROL_CHATBOT_CATEGORY_OPTIONS;

const CHATBOT_CATEGORY_LABELS = CHATBOT_CATEGORY_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});
const HEADER_ASSET_VERSION = '20260525a';
const HEADER_BACKGROUND_URL = `/assets/admin-header-brand-resort-left.png?v=${HEADER_ASSET_VERSION}`;
const HEADER_LOGO_URL = `/assets/resort-logo.jpg?v=${HEADER_ASSET_VERSION}`;

const NAV_ICON_BY_ID = {
  dashboard: Home,
  guests: ClipboardCheck,
  bookings: Plus,
  money: CircleDollarSign,
  tools: Wrench,
  verification: CircleDollarSign,
  ledger: WalletCards,
  movements: ClipboardCheck,
  'unit-checker': CalendarDays,
  booking: Plus,
  rooms: BedDouble,
  pulse: CircleDollarSign,
  chatbot: MessageSquareText
};

const PAGE_SECTION_BY_ID = {
  dashboard: 'dashboard',
  guests: 'guests',
  movements: 'guests',
  bookings: 'bookings',
  booking: 'bookings',
  availability: 'bookings',
  'unit-checker': 'bookings',
  money: 'money',
  verification: 'money',
  ledger: 'money',
  pulse: 'money',
  tools: 'tools',
  rooms: 'tools',
  chatbot: 'tools'
};

const PAGE_LABEL_BY_ID = {
  dashboard: 'Today',
  guests: 'Guests',
  movements: 'Movement Desk',
  bookings: 'Bookings',
  booking: 'Manual Booking',
  availability: 'Availability',
  'unit-checker': 'Unit Checker',
  money: 'Money',
  verification: 'Payment Verification',
  ledger: 'Ledger',
  pulse: 'Pulse',
  tools: 'Tools',
  rooms: 'Room Ops',
  chatbot: 'Chatbot Control'
};

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const shellClass = 'min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(198,146,63,0.12),transparent_30%),linear-gradient(180deg,#f4efe6_0%,#f8f2e8_52%,#f4efe6_100%)] font-sans text-desk-ink antialiased';
const serviceShellClass = `${shellClass} grid place-items-center p-6`;
const servicePanelClass = 'w-[min(420px,100%)] rounded-[24px] border-2 border-[#9b6f35]/75 bg-[#fffdf8]/94 p-7 text-center text-desk-ink shadow-embossed';
const topbarClass = 'sticky top-0 z-20 flex min-h-[96px] items-center justify-between gap-4 overflow-hidden border-b border-[#d8c9b3]/70 bg-[#fffdf8] px-4 py-3 shadow-[0_14px_34px_rgba(19,33,31,0.08)] backdrop-blur-xl after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(198,146,63,0.65),rgba(10,107,95,0.28),transparent)]';
const topbarStyle = {
  backgroundImage: `linear-gradient(90deg, rgba(255,253,248,0.80) 0%, rgba(255,253,248,0.42) 42%, rgba(255,253,248,0.12) 100%), url("${HEADER_BACKGROUND_URL}")`,
  backgroundPosition: 'left top, center center',
  backgroundSize: 'cover, cover'
};
const brandClass = 'flex min-w-0 items-center gap-3';
const brandMarkClass = 'grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-[18px] bg-white text-desk-green shadow-[0_14px_28px_rgba(19,33,31,0.14)] ring-1 ring-[#c6923f]/70';
const brandTitleClass = 'truncate font-display text-[1.16rem] font-black tracking-normal text-desk-ink drop-shadow-[0_1px_0_rgba(255,253,248,0.78)]';
const brandSubClass = 'truncate font-data text-[0.6rem] font-black uppercase tracking-[0.22em] text-desk-deep';
const syncButtonClass = 'relative z-[1] inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/72 px-3.5 text-[0.7rem] font-black text-desk-green shadow-[0_12px_26px_rgba(19,33,31,0.09),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white disabled:opacity-55';
const mainShellClass = 'mx-auto grid min-w-0 w-full max-w-[1180px] gap-4 overflow-x-hidden px-4 pb-56 pt-4';
const bottomNavClass = 'bottomnav fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[1180px] grid-cols-5 gap-2 border-t border-[#c6923f]/35 bg-[#fffdf8]/94 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_36px_rgba(19,33,31,0.12),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[18px]';
const bottomNavButtonClass = 'flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-[18px] border border-transparent px-1.5 py-2 text-[0.58rem] font-black uppercase leading-tight tracking-normal text-desk-muted transition active:scale-[0.98]';
const bottomNavButtonActiveClass = 'border-[#c6923f]/65 bg-[#08443f] text-[#fff8ec] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_24px_rgba(8,68,63,0.24)]';
const panelClass = 'min-w-0 rounded-[22px] border border-desk-line bg-desk-paper p-4 shadow-desk shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_20px_48px_rgba(19,33,31,0.075)]';
const pageStackClass = 'grid min-w-0 gap-4';
const compactHeroClass = `${panelClass} border-desk-gold/35 bg-[linear-gradient(135deg,rgba(255,253,248,0.98),rgba(248,242,232,0.9))] shadow-embossed [&_h1]:m-0 [&_h1]:font-display [&_h1]:text-[1.5rem] [&_h1]:font-black [&_h1]:leading-tight [&_h1]:text-desk-ink [&_p]:m-0 [&_p]:mt-2 [&_p]:text-[0.86rem] [&_p]:font-semibold [&_p]:leading-relaxed [&_p]:text-desk-muted`;
const dashboardHeroClass = 'grid gap-4 rounded-[24px] border border-[#c6923f]/38 bg-[linear-gradient(135deg,rgba(9,42,40,0.98),rgba(10,107,95,0.88)),radial-gradient(circle_at_top_right,rgba(198,146,63,0.28),transparent_52%)] p-5 text-[#fff8ec] shadow-resort [&_h1]:m-0 [&_h1]:mt-2 [&_h1]:font-display [&_h1]:text-[1.62rem] [&_h1]:font-black [&_h1]:leading-tight [&_p]:m-0 [&_p]:mt-2 [&_p]:text-[0.86rem] [&_p]:font-semibold [&_p]:leading-relaxed [&_p]:text-[#fff8ec]/78 [&_span]:font-data [&_span]:text-[0.62rem] [&_span]:font-black [&_span]:uppercase [&_span]:tracking-[0.18em] [&_span]:text-[#f4d79f]';
const emptyStateClass = 'empty-state rounded-[18px] border border-desk-gold/20 bg-[#fff8ec]/68 p-4 text-center text-[0.82rem] font-bold leading-relaxed text-desk-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]';
const bookingPageClass = 'grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-start';
const bookingHeroClass = 'rounded-[24px] border border-[#c6923f]/38 bg-[linear-gradient(135deg,rgba(9,42,40,0.98),rgba(10,107,95,0.88)),radial-gradient(circle_at_top_right,rgba(198,146,63,0.28),transparent_52%)] p-5 text-[#fff8ec] shadow-resort lg:col-span-2';
const heroEyebrowClass = 'font-data text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#f4d79f]';
const surfaceEyebrowClass = 'font-data text-[0.62rem] font-black uppercase tracking-[0.18em] text-desk-gold';
const heroInlineButtonClass = 'mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3.5 text-[0.72rem] font-black text-white';
const bookingAppBarClass = 'rounded-[22px] border border-desk-line bg-[#fffdf8]/92 p-4 shadow-embossed lg:col-span-2';
const flowRailClass = 'grid grid-cols-4 gap-1 rounded-[20px] border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_8px_16px_rgba(19,33,31,0.035)]';
const flowStepClass = 'grid min-h-[52px] place-items-center gap-1 rounded-2xl border border-[#d8c9b3]/80 bg-[#fffdf8]/78 px-2 py-2 text-center text-[0.66rem] font-black text-desk-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]';
const flowStepDoneClass = 'border-desk-green/25 text-desk-deep';
const flowStepActiveClass = 'border-[#0a6b5f] bg-[linear-gradient(180deg,#0d766a_0%,#075f55_100%)] text-[#fff8ec] shadow-[0_8px_18px_rgba(10,107,95,0.18),inset_0_1px_0_rgba(255,255,255,0.22)]';
const stepCardClass = `${panelClass} grid gap-4`;
const stepCardActiveClass = 'border-[#c8a15d]/48 shadow-embossed';
const stepHeaderClass = 'flex items-start gap-3';
const stepBadgeClass = 'grid size-9 shrink-0 place-items-center rounded-full border border-[#c8a15d]/45 bg-[#f5eee2]/75 text-sm font-black text-desk-deep';
const stepBadgeCompleteClass = 'border-desk-green/25 bg-desk-green/10 text-desk-green';
const panelTitleClass = 'font-display text-[1.05rem] font-black text-desk-ink';
const stepCaptionClass = 'mt-1 text-[0.78rem] font-bold leading-relaxed text-desk-muted';
const segmentGroupClass = 'mb-4 grid grid-cols-2 gap-1 rounded-[20px] border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_8px_16px_rgba(19,33,31,0.035)]';
const segmentGroupCompactClass = 'mb-0 flex flex-wrap gap-1 rounded-[18px] border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]';
const segmentButtonClass = 'rounded-2xl border border-[#d8c9b3]/80 bg-[#fffdf8]/78 px-3.5 py-3 text-[0.82rem] font-black text-desk-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition';
const segmentButtonCompactClass = 'rounded-[14px] px-3 py-2.5 text-[0.82rem] leading-none';
const segmentButtonActiveClass = 'border-[#0a6b5f] bg-[linear-gradient(180deg,#0d766a_0%,#075f55_100%)] text-[#fff8ec] shadow-[0_8px_18px_rgba(10,107,95,0.18),inset_0_1px_0_rgba(255,255,255,0.22)]';
const fieldGridClass = 'grid gap-3';
const fieldGridTwoClass = 'grid grid-cols-1 gap-3 min-[430px]:grid-cols-2';
const fieldClassName = 'field flex min-w-0 flex-col gap-2';
const fieldLabelTextClass = 'font-data text-[0.64rem] font-black uppercase tracking-[0.12em] text-desk-muted';
const fieldControlClass = 'block min-w-0 w-full rounded-2xl border border-desk-line bg-[#fffdf8]/95 px-3.5 py-3.5 text-desk-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]';
const statusBannerBaseClass = 'mt-3 max-w-full overflow-hidden rounded-2xl px-3.5 py-3 text-[0.8rem] font-bold leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere]';
const statusBannerToneClass = {
  error: 'bg-desk-red/10 text-[#9f1239]',
  info: 'bg-desk-green/10 text-[#315044]',
  success: 'bg-emerald-600/10 text-emerald-700',
};
const saveButtonClass = 'mt-4 w-full rounded-[18px] border border-[#c6923f]/28 bg-[linear-gradient(135deg,#0a6b5f,#08443f)] px-4 py-4 text-sm font-black text-white shadow-[0_14px_28px_rgba(8,68,63,0.20),inset_0_1px_0_rgba(255,255,255,0.14)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
const secondaryButtonClass = 'w-full rounded-2xl border border-desk-line bg-[#f8f2e8] px-4 py-3.5 text-sm font-black text-desk-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]';
const secondaryButtonAccentClass = 'bg-desk-green/10';
const summaryCardClass = `${panelClass} overflow-hidden lg:sticky lg:top-[88px]`;
const unitCardClass = 'unit-card min-h-[142px] min-w-0 rounded-[18px] border border-desk-line bg-[#fffdf8]/96 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] transition';
const unitCardSelectedClass = 'border-[#c6923f]/65 bg-[linear-gradient(180deg,#e8f5f0,#fffdf8)] shadow-[0_16px_34px_rgba(8,68,63,0.18),inset_0_1px_0_rgba(255,255,255,0.84)]';
const unitCardDisabledClass = 'cursor-not-allowed border-dashed opacity-55 shadow-none';
const unitCardTopClass = 'flex min-w-0 items-start justify-between gap-2 text-[0.98rem] font-black text-desk-ink [&>span:first-child]:min-w-0 [&>span:first-child]:break-words';
const unitCardTopRightClass = 'flex flex-col items-end gap-1.5 text-right text-[0.82rem] font-black';
const unitSelectedBadgeClass = 'inline-flex items-center rounded-full bg-[linear-gradient(180deg,#0a6b5f,#08443f)] px-2 py-1 text-[0.62rem] font-black text-[#fff8ec] shadow-[0_6px_14px_rgba(8,68,63,0.25)]';
const unitCardSubClass = 'mt-2.5 text-[0.76rem] font-bold text-desk-muted';
const unitCardStatClass = 'mt-3 text-[0.76rem] font-black text-desk-ink/75';
const unitCardStateClass = 'mt-3 text-[0.76rem] font-black text-desk-green';
const suggestionCardClass = 'rounded-[18px] border border-desk-line bg-[#fffdf8]/96 p-4 text-left shadow-desk transition';
const suggestionCardSelectedClass = 'border-[#c6923f]/65 bg-[linear-gradient(180deg,#e8f5f0,#fffdf8)] shadow-[0_16px_34px_rgba(8,68,63,0.18),inset_0_1px_0_rgba(255,255,255,0.84)]';
const suggestionToplineClass = 'flex items-center justify-between gap-3 font-black text-desk-ink';
const suggestionUnitsClass = 'mt-2.5 text-[0.96rem] font-black text-desk-ink';
const suggestionMetaClass = 'mt-2 grid grid-cols-2 gap-2 text-[0.72rem] font-bold text-desk-muted';
const suggestionStateClass = 'mt-3 text-[0.8rem] font-black text-desk-green';
const sheetBackdropClass = 'fixed inset-0 z-40 grid place-items-end bg-[#13211f]/38 p-3 backdrop-blur-[6px]';
const sheetClass = 'relative max-h-[86vh] w-full overflow-y-auto rounded-[26px] border-2 border-solid border-[#9b6f35]/90 bg-[#fffdf8]/97 p-5 pb-7 text-desk-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,246,220,0.68),inset_0_-1px_0_rgba(93,61,24,0.20),0_0_0_1px_rgba(70,46,18,0.16),0_28px_88px_rgba(51,34,15,0.28),0_10px_28px_rgba(198,146,63,0.20)]';
const sheetWideClass = 'sm:max-w-[620px]';
const sheetNarrowClass = 'sm:max-w-[420px]';
const panelHeaderClass = 'mb-4 flex items-start justify-between gap-3';
const panelCounterClass = 'rounded-full border border-desk-gold/25 bg-desk-gold/15 px-3 py-1 text-[0.72rem] font-black text-desk-deep';
const miniLinkClass = 'inline-flex min-h-9 items-center justify-center rounded-full border border-desk-line bg-[#fffdf8]/90 px-3 text-[0.72rem] font-black text-desk-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]';
const metricGridClass = 'grid grid-cols-2 gap-3';
const metricCardClass = 'rounded-[18px] border border-desk-line bg-[#fffdf8]/88 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_10px_26px_rgba(19,33,31,0.045)]';
const laneGridClass = 'grid grid-cols-3 gap-2';
const laneCardClass = 'grid min-h-[92px] content-between rounded-[18px] border border-desk-line bg-[#fffdf8]/92 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(19,33,31,0.045)]';
const laneCardActiveClass = 'border-desk-gold/45 bg-[#fff8ec] shadow-embossed';
const laneLabelClass = 'font-data text-[0.58rem] font-black uppercase tracking-[0.16em] text-desk-muted';
const laneValueClass = 'mt-2 text-[1.45rem] font-black leading-none text-desk-deep';
const laneNoteClass = 'mt-1 text-[0.68rem] font-bold leading-tight text-desk-muted';
const metricToneClass = {
  green: 'text-desk-deep',
  red: 'text-desk-red',
  gold: 'text-desk-gold',
  blue: 'text-desk-blue',
};
const opsCardClass = 'relative overflow-hidden rounded-[20px] border border-desk-line bg-desk-paper p-4 shadow-desk';
const opsCardActionClass = 'border-desk-gold/45 bg-[#fffdf8] shadow-embossed before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-desk-gold';
const opsCardTopClass = 'flex items-start justify-between gap-3';
const opsCardMetaClass = 'mt-3 grid grid-cols-3 gap-2';
const opsMetaPillClass = 'rounded-full border border-desk-line bg-[#f8f2e8]/82 px-2.5 py-1.5 text-center text-[0.66rem] font-black text-desk-muted';
const actionRowClass = 'mt-3 flex flex-wrap gap-2';
const opsListClass = 'grid gap-2.5';
const quickActionGridClass = 'grid grid-cols-2 gap-2';
const quickActionCardClass = 'min-h-[118px] rounded-[18px] border border-desk-line bg-desk-paper p-4 text-left text-desk-green shadow-desk transition active:scale-[0.99] [&:first-child]:col-span-2 [&_strong]:mt-2.5 [&_strong]:block [&_strong]:font-black [&_strong]:text-desk-ink [&_span]:mt-1 [&_span]:block [&_span]:text-[0.78rem] [&_span]:font-bold [&_span]:leading-snug [&_span]:text-desk-muted';
const operatorHeroClass = 'relative overflow-hidden rounded-[24px] border-2 border-[#9b6f35]/70 bg-[linear-gradient(135deg,#fffdf8_0%,#f6eddc_62%,#efe0c3_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,246,220,0.72),0_22px_52px_rgba(93,61,24,0.13)] before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-r-full before:bg-[#c6923f]';
const operatorHeaderClass = 'flex min-w-0 items-start justify-between gap-4';
const operatorSummaryClass = 'mt-5 grid grid-cols-2 overflow-hidden rounded-[20px] border border-[#9b6f35]/36 bg-[#fffaf0]/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]';
const operatorMetricClass = 'min-w-0 border-r border-b border-[#9b6f35]/18 p-3.5 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0';
const operatorWorkflowListClass = 'grid gap-2.5';
const operatorWorkflowRowClass = 'group grid min-h-[92px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[#9b6f35]/42 bg-[#fffdf8]/92 p-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_14px_30px_rgba(93,61,24,0.08)] transition active:scale-[0.99]';
const operatorWorkflowPrimaryClass = 'border-2 border-[#9b6f35]/70 bg-[linear-gradient(135deg,#fffdf8,#f6eddc)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_40px_rgba(93,61,24,0.14)]';
const operatorWorkflowIconClass = 'grid size-10 place-items-center rounded-2xl border border-desk-gold/30 bg-desk-green/10 text-desk-green';
const operatorWorkflowArrowClass = 'grid size-8 place-items-center rounded-full border border-[#9b6f35]/30 bg-[#f5eee2] text-[1rem] font-black text-desk-deep';
const deskButtonBaseClass = 'inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-3.5 text-[0.72rem] font-black transition disabled:opacity-55';
const deskButtonToneClass = {
  green: 'border border-desk-gold/25 bg-[#08443f] text-[#fff8ec]',
  red: 'border border-desk-red/20 bg-desk-red text-white',
  muted: 'border border-desk-line bg-[#f8f2e8] text-desk-deep',
};
const statusPillBaseClass = 'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.66rem] font-black uppercase tracking-normal';
const statusPillToneClass = {
  green: 'border-desk-green/15 bg-desk-green/10 text-desk-deep',
  red: 'border-desk-red/15 bg-desk-red/10 text-desk-red',
  gold: 'border-desk-gold/25 bg-desk-gold/15 text-desk-deep',
};
const filterRailClass = 'flex gap-2 overflow-x-auto rounded-[18px] border border-desk-line bg-[#fffdf8]/82 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]';
const filterButtonClass = 'shrink-0 rounded-full border border-transparent px-3 py-2 text-[0.72rem] font-black uppercase tracking-normal text-desk-muted';
const filterButtonActiveClass = 'border-desk-gold/40 bg-[#08443f] text-[#fff8ec] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]';
const ledgerControlsClass = `${panelClass} grid gap-3`;
const searchFieldClass = 'ledger-search flex min-h-11 items-center gap-2 rounded-2xl border border-desk-line bg-[#fffdf8]/95 px-3.5 text-desk-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]';
const verificationLayoutClass = 'grid gap-3 md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]';
const verificationQueueClass = 'grid content-start gap-2';
const verificationListCardClass = 'verification-list-card grid gap-1 rounded-[18px] border border-desk-line bg-desk-paper p-3 text-left shadow-desk';
const verificationListCardActiveClass = 'border-desk-gold/55 bg-[#fff8ec] shadow-embossed';
const factGridClass = 'mt-3 grid grid-cols-2 gap-2 [&_div]:rounded-2xl [&_div]:border [&_div]:border-desk-line [&_div]:bg-[#f8f2e8]/78 [&_div]:p-3 [&_span]:block [&_span]:font-data [&_span]:text-[0.6rem] [&_span]:font-black [&_span]:uppercase [&_span]:tracking-[0.12em] [&_span]:text-desk-muted [&_strong]:mt-1.5 [&_strong]:block [&_strong]:text-[0.95rem] [&_strong]:font-black [&_strong]:text-desk-ink';
const verificationFactsClass = 'mt-3 grid grid-cols-2 gap-2';
const receiptFrameClass = 'mt-3 grid min-h-[260px] place-items-center overflow-hidden rounded-[20px] border border-desk-gold/30 bg-[linear-gradient(180deg,#fffdf8,#f5eee2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]';
const financeHeroClass = 'rounded-[22px] border border-desk-gold/45 bg-[linear-gradient(135deg,#092a28,#0a6b5f)] p-4 text-[#fff8ec] shadow-embossed';
const financeHeroTopClass = 'flex items-start justify-between gap-3';
const financeAmountClass = 'mt-2 block text-[2rem] font-black leading-none';
const ledgerCardClass = 'relative overflow-hidden rounded-[20px] border border-desk-line bg-desk-paper p-4 shadow-desk';
const ledgerCardDueClass = 'border-desk-gold/45 bg-[#fffdf8] shadow-embossed before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-desk-gold';
const sheetSummaryClass = 'mb-4 grid grid-cols-2 gap-2 rounded-[20px] border border-desk-gold/35 bg-[#fff8ec] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(198,146,63,0.10)]';
const tabRailClass = 'grid grid-cols-3 gap-2 rounded-[18px] border border-desk-line bg-[#fffdf8]/82 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]';
const tabRailTwoClass = 'grid grid-cols-2 gap-2 rounded-[18px] border border-desk-line bg-[#fffdf8]/82 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]';
const tabButtonClass = 'rounded-full px-3 py-2.5 text-[0.72rem] font-black uppercase tracking-normal text-desk-muted';
const tabButtonActiveClass = 'bg-[#08443f] text-[#fff8ec] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]';
const roomCardListClass = 'grid gap-3';
const roomOpsHeroClass = 'rounded-[22px] border border-desk-gold/35 bg-[linear-gradient(135deg,#fffdf8,#f8f2e8)] p-4 shadow-embossed';
const roomStatusGridClass = 'grid grid-cols-4 gap-2';
const roomStatusTileClass = 'grid min-h-[86px] content-between rounded-[18px] border border-desk-line bg-[#fffdf8]/92 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]';
const roomStatusValueClass = 'mt-2 text-[1.35rem] font-black leading-none';
const roomCardClass = 'room-op-card grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-[20px] border border-desk-line bg-desk-paper p-4 shadow-desk';
const roomCardAttentionClass = 'border-desk-gold/45 bg-[#fffdf8] shadow-embossed';
const roomIconBaseClass = 'grid size-10 place-items-center rounded-2xl border';
const roomIconToneClass = {
  red: 'border-desk-red/15 bg-desk-red/10 text-desk-red',
  gold: 'border-desk-gold/25 bg-desk-gold/15 text-desk-deep',
  blue: 'border-desk-blue/15 bg-desk-blue/10 text-desk-blue',
  green: 'border-desk-green/15 bg-desk-green/10 text-desk-deep',
};
const roomSelectClass = 'col-span-2 w-full rounded-2xl border border-desk-line bg-[#fffdf8]/95 px-3 py-3 text-sm font-bold text-desk-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]';
const pulseCardClass = `${panelClass} overflow-hidden border-[#c6923f]/35 bg-[linear-gradient(135deg,rgba(9,42,40,0.98),rgba(10,107,95,0.9))] text-[#fff8ec] shadow-resort`;
const pulseRateClass = 'rounded-[22px] border border-[#f0d7aa]/25 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]';
const pulseWatchCardClass = 'rounded-[18px] border border-desk-line bg-desk-paper p-3 shadow-desk';
const pulseWatchDueClass = 'border-desk-gold/45 bg-[#fffdf8] shadow-embossed';
const chatbotLayoutClass = 'grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]';
const chatbotTriageGridClass = 'grid grid-cols-3 gap-2';
const chatbotThreadCardClass = 'grid gap-1 rounded-[18px] border border-desk-line bg-desk-paper p-3 text-left shadow-desk';
const chatbotThreadCardActiveClass = 'border-desk-gold/55 bg-[#fff8ec] shadow-embossed';
const chatbotMessageListClass = 'grid max-h-[420px] gap-2 overflow-y-auto rounded-[18px] border border-desk-line bg-[#f5eee2]/45 p-3';
const chatbotMessageClass = 'max-w-[86%] rounded-2xl border border-desk-line bg-[#fffdf8]/95 px-3 py-2 text-[0.82rem] font-semibold text-desk-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]';
const chatbotMessageOutboundClass = 'ml-auto border-desk-green/20 bg-desk-green/10';
const timelinePanelClass = `${panelClass} overflow-x-auto`;
const timelineControlClass = 'min-w-0 rounded-[22px] border border-desk-gold/35 bg-[#fffdf8]/94 p-4 shadow-embossed';
const timelineLegendClass = 'mt-3 flex flex-wrap gap-2 font-data text-[0.58rem] font-black uppercase tracking-[0.12em] text-desk-muted';
const timelineGridClass = 'grid grid-cols-[96px_minmax(0,1fr)] items-center gap-1.5';
const timelineCellsClass = 'grid grid-cols-7 gap-1';
const timelineHeadCellClass = 'rounded-xl border border-desk-line bg-[#f8f2e8]/82 px-1 py-2 text-center text-[0.5rem] font-black uppercase leading-tight tracking-normal text-desk-muted';
const timelineUnitClass = 'rounded-xl border border-desk-line bg-[#fffdf8]/90 px-2 py-2';
const timelineCellBaseClass = 'grid min-h-9 place-items-center rounded-xl border px-0.5 text-center text-[0.48rem] font-black leading-tight';
const timelineCellOpenClass = 'border-[#d8c9b3]/90 bg-[#f8f2e8] text-desk-green';
const timelineCellBookedClass = 'border-desk-green/45 bg-desk-green text-white';
const timelineCellProjectedClass = 'border-emerald-500/60 bg-emerald-100 text-emerald-800 shadow-[0_0_0_4px_rgba(45,187,84,0.18)]';
const navPillClass = 'inline-flex min-h-9 items-center justify-center rounded-full border border-desk-line bg-[#f8f2e8] px-3 text-[0.72rem] font-black text-desk-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]';
const legendDotClass = 'inline-block size-3 rounded-[4px] border-2 border-[#08443f]';
const unitSummaryListClass = 'mt-4 grid gap-2.5';
const unitSummaryRowClass = 'flex items-center justify-between gap-3 border-b border-desk-line py-3';
const unitSummaryLabelClass = 'font-black text-desk-ink';
const unitSummarySubClass = 'mt-1 text-[0.78rem] font-bold text-desk-muted';
const unitSummaryAmountClass = 'shrink-0 font-black text-desk-ink';
const selectionSummaryClass = 'my-4 rounded-[20px] border border-desk-line bg-[linear-gradient(180deg,rgba(248,242,232,0.92),rgba(255,253,248,0.98))] p-4 shadow-desk';
const capacityPanelClass = 'max-w-full overflow-hidden rounded-[20px] border border-desk-gold/35 bg-[#fffdf8]/94 p-4 shadow-embossed';
const selectedUnitChipClass = 'inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-desk-gold/35 bg-[#fff8ec] px-3 py-2 text-[0.72rem] font-black text-desk-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] [&_span:first-child]:min-w-0 [&_span:first-child]:truncate';
const paginationBarClass = 'mt-3 flex items-center justify-between gap-2.5';
const paginationButtonClass = 'min-w-[84px] rounded-[14px] border border-desk-line bg-[#f8f2e8] px-3.5 py-3 text-[0.82rem] font-black text-desk-deep disabled:cursor-not-allowed disabled:opacity-45';
const paginationStatusClass = 'flex-1 text-center text-[0.82rem] font-black text-desk-muted';
const warningBannerClass = 'flex items-start gap-2.5 rounded-2xl bg-amber-700/10 px-3.5 py-3 text-[0.8rem] font-bold text-amber-800';
const saveReferenceClass = 'mt-3 rounded-2xl border border-desk-green/15 bg-[#f8f2e8]/78 p-3';
const stickyCtaClass = 'fixed inset-x-3 bottom-[88px] z-20 grid grid-cols-[repeat(3,minmax(0,1fr))] items-center gap-2 rounded-[20px] border border-desk-gold/38 bg-[#092a28]/95 px-3.5 py-3 text-[#f7f4ec] shadow-[0_18px_35px_rgba(19,33,31,0.26),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl min-[380px]:grid-cols-[1fr_1fr_1fr_auto]';
const stickyLabelClass = 'block text-[0.72rem] font-bold text-[#f7f4ec]/68';
const stickyActionClass = 'col-span-3 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#c6923f] px-3 text-[0.72rem] font-black text-[#14221d] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] disabled:opacity-45 min-[380px]:col-span-1';
const summaryHeroClass = 'mb-4 flex items-start justify-between gap-3';
const summaryLabelClass = 'text-[0.72rem] font-bold text-desk-muted';
const summaryTotalClass = 'text-[2rem] font-black leading-none text-desk-ink';
const summaryChipClass = 'rounded-full border border-desk-gold/25 bg-desk-gold/15 px-3 py-2 text-[0.72rem] font-black text-desk-deep';
const summaryGridClass = 'grid grid-cols-2 gap-2 [&_div]:rounded-2xl [&_div]:border [&_div]:border-desk-line [&_div]:bg-[#f8f2e8] [&_div]:p-3 [&_span]:block [&_span]:font-data [&_span]:text-[0.6rem] [&_span]:font-black [&_span]:uppercase [&_span]:tracking-[0.12em] [&_span]:text-desk-muted [&_strong]:mt-1.5 [&_strong]:block [&_strong]:font-black [&_strong]:text-desk-ink';
const summaryPaymentClass = 'mt-3 grid grid-cols-2 gap-2.5 [&_div]:rounded-2xl [&_div]:border [&_div]:border-desk-line [&_div]:bg-[#f8f2e8] [&_div]:p-3 [&_span]:block [&_span]:font-data [&_span]:text-[0.6rem] [&_span]:font-black [&_span]:uppercase [&_span]:tracking-[0.12em] [&_span]:text-desk-muted [&_strong]:mt-1.5 [&_strong]:block [&_strong]:font-black [&_strong]:text-desk-ink';
const softNoteClass = 'max-w-full overflow-hidden rounded-2xl bg-[#f8f2e8] px-3.5 py-3 text-[0.82rem] font-bold text-desk-deep whitespace-normal break-words [overflow-wrap:anywhere]';
const confirmationCardClass = 'rounded-[24px] border-2 border-[#9b6f35]/75 bg-[#fffdf8]/96 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,246,220,0.58),0_22px_58px_rgba(51,34,15,0.18)]';

function formatCurrency(value) {
  return `P${pesoNumberFormatter.format(Number(value || 0))}`;
}

function formatDateLong(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAcknowledgementMarkup(booking) {
  const header = booking?.header || {};
  const items = booking?.items || [];
  const payments = booking?.payments || [];
  const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;
  const totalAmount = Number(header.lodging_total ?? header.total_amount ?? 0);
  const totalPaid = Number(header.verified_paid_total ?? header.total_paid ?? 0);
  const balance = Number(header.balance_due ?? header.balance ?? 0);
  const guestCount = items.reduce((sum, item) => sum + Number(item.guest_count ?? item.guests ?? 0), 0) || '-';
  const reservedUnits = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.unit_label || item.unit_id || item.room_type || '-')}</td>
      <td>${escapeHtml(item.room_type || '-')}</td>
      <td>${escapeHtml(item.check_in || '-')}</td>
      <td>${escapeHtml(item.check_out || '-')}</td>
      <td>${escapeHtml(item.guest_count ?? item.guests ?? '-')} pax</td>
      <td>${escapeHtml(formatCurrency(item.lodging_subtotal ?? item.subtotal ?? 0))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Amalfi Booking Acknowledgement ${escapeHtml(header.booking_reference || '')}</title>
      <style>
        body {
          margin: 0;
          background: #eef2ec;
          font-family: Arial, sans-serif;
          color: #1c2520;
        }
        .sheet {
          max-width: 820px;
          margin: 24px auto;
          background: #fcfbf9;
          box-shadow: 0 24px 50px rgba(18, 32, 27, 0.12);
        }
        .header {
          background: #1c2520;
          color: #fff;
          padding: 28px 32px 22px;
          display: flex;
          justify-content: space-between;
          gap: 18px;
        }
        .eyebrow {
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #c5a87b;
          margin-bottom: 6px;
        }
        .title {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 6px;
        }
        .sub {
          font-size: 12px;
          opacity: 0.66;
          margin: 0;
        }
        .refbox {
          text-align: right;
        }
        .refbox .label {
          font-size: 10px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
        }
        .refbox .value {
          margin-top: 8px;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #c5a87b;
        }
        .status {
          margin: 0;
          padding: 12px 32px;
          background: #f0fdf4;
          border-top: 1px solid #bbf7d0;
          border-bottom: 1px solid #bbf7d0;
          color: #166534;
          font-size: 13px;
          font-weight: 700;
        }
        .section {
          padding: 22px 32px 0;
        }
        .section-title {
          margin: 0 0 12px;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #b59665;
          font-weight: 800;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 18px;
        }
        .field-label {
          font-size: 11px;
          color: #6b726d;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .field-value {
          font-size: 15px;
          font-weight: 700;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        th, td {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(28, 37, 32, 0.08);
          text-align: left;
        }
        th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #6b726d;
        }
        .totals {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }
        .total-row strong {
          font-size: 16px;
        }
        .footer {
          padding: 22px 32px 28px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          color: #6b726d;
          font-size: 11px;
          line-height: 1.6;
        }
        @media print {
          body { background: #fff; }
          .sheet { box-shadow: none; margin: 0; }
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <section class="header">
          <div>
            <div class="eyebrow">Amalfi Resort</div>
            <h1 class="title">Booking Acknowledgement Receipt</h1>
            <p class="sub">Formal acknowledgement of reservation intake created through the Amalfi Admin Desk.</p>
          </div>
          <div class="refbox">
            <div class="label">Reference No.</div>
            <div class="value">${escapeHtml(header.booking_reference || '-')}</div>
          </div>
        </section>

        <div class="status">Booking recorded successfully. This acknowledgement confirms the reservation details received by Amalfi Resort and may be shared with the guest for reference.</div>

        <section class="section">
          <h2 class="section-title">Guest Details</h2>
          <div class="grid">
            <div>
              <div class="field-label">Guest Name</div>
              <div class="field-value">${escapeHtml(header.guest_name || header.customer_name || 'Walk-in Guest')}</div>
            </div>
            <div>
              <div class="field-label">Booking Source</div>
              <div class="field-value">${escapeHtml(header.booking_source || 'Walk-in')}</div>
            </div>
            <div>
              <div class="field-label">Phone</div>
              <div class="field-value">${escapeHtml(header.phone || '-')}</div>
            </div>
            <div>
              <div class="field-label">Email</div>
              <div class="field-value">${escapeHtml(header.email || '-')}</div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Stay Details</h2>
          <div class="grid">
            <div>
              <div class="field-label">Check-in</div>
              <div class="field-value">${escapeHtml(formatDateLong(header.check_in))}</div>
            </div>
            <div>
              <div class="field-label">Check-out</div>
              <div class="field-value">${escapeHtml(formatDateLong(header.check_out))}</div>
            </div>
            <div>
              <div class="field-label">Reserved Units</div>
              <div class="field-value">${escapeHtml(items.length)}</div>
            </div>
            <div>
              <div class="field-label">Total Guests</div>
              <div class="field-value">${escapeHtml(guestCount)}</div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Reserved Units</h2>
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Pax</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>${reservedUnits}</tbody>
          </table>
        </section>

        <section class="section">
          <h2 class="section-title">Payment Summary</h2>
          <div class="totals">
            <div class="total-row"><span>Total Booking Amount</span><span>${escapeHtml(formatCurrency(totalAmount))}</span></div>
            <div class="total-row"><span>Total Paid / Recorded</span><span>${escapeHtml(formatCurrency(totalPaid))}</span></div>
            <div class="total-row"><strong>Remaining Balance</strong><strong>${escapeHtml(formatCurrency(balance))}</strong></div>
            <div class="total-row"><span>Payment Status</span><span>${escapeHtml(header.payment_status || 'Unpaid')}</span></div>
            <div class="total-row"><span>Latest Payment Method</span><span>${escapeHtml(latestPayment?.payment_method || '-')}</span></div>
          </div>
        </section>

        <footer class="footer">
          <div>
            This document is an acknowledgement receipt only and not an official BIR receipt.<br />
            Final payment confirmation and internal verification remain subject to Amalfi Resort procedures.
          </div>
          <div>
            Generated via Amalfi Admin Desk<br />
            ${escapeHtml(new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()))}
          </div>
        </footer>
      </main>
      <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
    </body>
  </html>`;
}

function openAcknowledgementPrint(booking) {
  const popup = window.open('', '_blank', 'width=960,height=900');
  if (!popup) {
    window.alert('Please allow pop-ups to open the acknowledgement receipt.');
    return;
  }
  popup.document.open();
  popup.document.write(buildAcknowledgementMarkup(booking));
  popup.document.close();
}

function buildNightCount(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(1, diff || 1);
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function bookingRef(row = {}) {
  return row.booking_ref || row.booking_reference || '';
}

function guestName(row = {}) {
  return row.full_name || row.guest_name || row.customer_name || 'Walk-in Guest';
}

function bookingUnits(row = {}) {
  return row.unit_summary || row.unit_label || row.unit_id || row.room_type || 'No unit summary';
}

function bookingTotal(row = {}) {
  return Number(row.grand_total ?? row.lodging_total ?? row.total_price ?? 0) + Number(row.addon_amount && row.grand_total === undefined ? row.addon_amount : 0);
}

function bookingPaid(row = {}) {
  return Number(row.amount_paid ?? row.verified_paid_total ?? row.total_paid ?? 0);
}

function bookingBalance(row = {}) {
  const explicit = row.balance_due ?? row.balance;
  if (explicit !== undefined && explicit !== null) return Math.max(0, Number(explicit || 0));
  return Math.max(0, bookingTotal(row) - bookingPaid(row));
}

function receiptUrl(row = {}) {
  return row.receipt_path || row.receipt_url || row.payment_proof_url || row.proof_url || '';
}

function compactBookingLabel(booking = {}) {
  const ref = String(booking.booking_ref || booking.booking_reference || '').replace(/^RES-/i, '');
  if (ref) return ref.slice(0, 7);
  const name = String(booking.full_name || booking.guest_name || '').trim();
  if (!name) return 'Hold';
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 4).toUpperCase();
}

function isActiveBooking(row = {}) {
  return ['RESERVED', 'CHECKED_IN'].includes(row.status);
}

function isTodayArrival(row = {}) {
  return isActiveBooking(row) && row.status !== 'CHECKED_IN' && row.check_in === today;
}

function isInHouse(row = {}) {
  return row.status === 'CHECKED_IN' || (row.check_in <= today && row.check_out > today && isActiveBooking(row));
}

function isDueOut(row = {}) {
  return row.status === 'CHECKED_IN' && row.check_out <= today;
}

function roomStatusMeta(status = 'Available') {
  const normalized = String(status || 'Available').toLowerCase();
  if (normalized.includes('maintenance')) return { label: 'Blocked', tone: 'red', Icon: Wrench };
  if (normalized.includes('clean') || normalized.includes('dirty')) return { label: 'Clean', tone: 'blue', Icon: Sparkles };
  if (normalized.includes('inspection')) return { label: 'Inspect', tone: 'gold', Icon: ClipboardCheck };
  if (normalized.includes('checked') || normalized.includes('reserved')) return { label: 'Occupied', tone: 'gold', Icon: BedDouble };
  return { label: 'Ready', tone: 'green', Icon: CheckCircle2 };
}

function normalizePhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const withoutCountry = digits.startsWith('63')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  const trimmed = withoutCountry.slice(0, 10);
  return `+63${trimmed}`;
}

function readBookingDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      form: { ...defaultBookingForm, ...(parsed.form || {}), phone: normalizePhoneInput(parsed.form?.phone || defaultBookingForm.phone) },
      selectedUnitIds: Array.isArray(parsed.selectedUnitIds) ? parsed.selectedUnitIds : [],
      manualCategory: parsed.manualCategory || 'all',
      manualPage: Number(parsed.manualPage || 1),
      savedBooking: parsed.savedBooking || null,
      saveState: parsed.saveState || { loading: false, error: '', success: '', reference: '' }
    };
  } catch {
    return null;
  }
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDateWindow(startDate, length = 7) {
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

function bookingCoversDate(booking, dateIso) {
  if (!booking?.check_in || !booking?.check_out) return false;
  return booking.check_in <= dateIso && booking.check_out > dateIso;
}

function getUnitCategory(unit) {
  const label = String(`${unit?.room_type || ''} ${unit?.marketing_name || ''} ${unit?.unit_label || ''}`).toLowerCase();
  if (label.includes('villa')) return 'villas';
  if (label.includes('kubo')) return 'kubos';
  if (label.includes('teepee')) return 'teepee';
  return 'other';
}

function getCategoryLabel(category) {
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

function getChatbotCategoryLabel(category) {
  const key = String(category || 'LOW_PRIORITY_FAQ').toUpperCase();
  return CHATBOT_CATEGORY_LABELS[key] || key.replace(/_/g, ' ');
}

function runAdminDeskRequest(request) {
  return api[request.method](request.url, request.body);
}

function SegmentedControl({ value, onChange, options, compact = false }) {
  return (
    <div className={compact ? segmentGroupCompactClass : segmentGroupClass}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx(segmentButtonClass, compact && segmentButtonCompactClass, value === option.value && segmentButtonActiveClass)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StepCard({ step, title, caption, active, complete, children }) {
  return (
    <section className={cx(stepCardClass, active && stepCardActiveClass)}>
      <div className={stepHeaderClass}>
        <div className={cx(stepBadgeClass, complete && stepBadgeCompleteClass)}>{step}</div>
        <div>
          <div className={panelTitleClass}>{title}</div>
          <div className={stepCaptionClass}>{caption}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function BookingStepRail({ items }) {
  return (
    <div className={flowRailClass}>
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cx(flowStepClass, item.done && flowStepDoneClass, item.active && flowStepActiveClass)}
        >
          <span className="grid size-6 place-items-center rounded-full bg-current/10 text-[0.72rem]">{index + 1}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function SuggestionCard({ suggestion, selected, onSelect }) {
  return (
    <button type="button" className={cx(suggestionCardClass, selected && suggestionCardSelectedClass)} onClick={onSelect}>
      <div className={suggestionToplineClass}>
        <span>{suggestion.mode === 'solo' ? 'Solo Fit' : `${suggestion.summary.total_units} Rooms`}</span>
        <span>{formatCurrency(suggestion.summary.total_amount)}</span>
      </div>
      <div className={suggestionUnitsClass}>{suggestion.units.map((unit) => unit.unit_label).join(' - ')}</div>
      <div className={suggestionMetaClass}>
        <span>{suggestion.summary.total_absolute_capacity} max pax</span>
        <span>{suggestion.summary.total_extra_guests} over standard</span>
      </div>
      <div className={suggestionStateClass}>{selected ? 'Selected fit' : 'Tap to use this fit'}</div>
    </button>
  );
}

function SummaryCard({ quote, form, warnings, saveState, saveReady, onSave }) {
  const balance = Math.max(0, Number(quote?.total_amount || 0) - Number(form.initialPayment || 0));

  return (
    <section className={cx(summaryCardClass, quote && 'border-[#9b6f35]/65 shadow-embossed')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={panelTitleClass}>{quote ? 'Ready to Save' : 'Booking Summary'}</div>
          <div className="mt-1 text-[0.72rem] font-bold text-desk-muted">{quote ? 'Review totals before saving the transaction.' : 'Build a quote from selected units.'}</div>
        </div>
        {quote && <CheckCircle2 size={20} className="text-desk-green" />}
      </div>
      {!quote ? (
        <div className="mt-2 text-[0.82rem] font-bold leading-relaxed text-desk-muted">Pick the exact rooms you want to generate the transaction total.</div>
      ) : (
        <>
          <div className={summaryHeroClass}>
            <div>
              <div className={summaryLabelClass}>Gross Total</div>
              <div className={summaryTotalClass}>{formatCurrency(quote.total_amount)}</div>
            </div>
            <div className={summaryChipClass}>{quote.total_units} unit{quote.total_units === 1 ? '' : 's'}</div>
          </div>
          <div className={summaryGridClass}>
            <div>
              <span>Pax</span>
              <strong>{quote.guests}</strong>
            </div>
            <div>
              <span>Nights</span>
              <strong>{quote.nights}</strong>
            </div>
            <div>
              <span>Over Pax</span>
              <strong>{quote.total_extra_guests}</strong>
            </div>
            <div>
              <span>Balance</span>
              <strong>{formatCurrency(balance)}</strong>
            </div>
          </div>
          <div className={summaryPaymentClass}>
            <div>
              <span>Initial Payment</span>
              <strong>{formatCurrency(form.initialPayment || 0)}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{form.bookingSource || 'Walk-in'}</strong>
            </div>
          </div>
          <div className={unitSummaryListClass}>
            {quote.quoted_units.map((unit) => (
              <div key={unit.unit_id} className={unitSummaryRowClass}>
                <div>
                  <div className={unitSummaryLabelClass}>{unit.unit_label}</div>
                  <div className={unitSummarySubClass}>
                    {unit.assigned_guests} pax
                    {unit.extra_guests > 0 ? ` - ${unit.extra_guests} extra pax` : ''}
                  </div>
                </div>
                <div className={unitSummaryAmountClass}>{formatCurrency(unit.total_amount)}</div>
              </div>
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="mt-3 grid gap-2.5">
              {warnings.map((warning) => (
                <div key={warning} className={warningBannerClass}>
                  <AlertTriangle size={15} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={saveButtonClass} onClick={onSave} disabled={!saveReady || saveState.loading}>
            {saveState.loading ? 'Saving Booking...' : 'Save Transaction Booking'}
          </button>
          {!saveReady && <StatusBanner tone="error">Complete the highlighted steps before saving this booking.</StatusBanner>}
          {saveState.error && <StatusBanner tone="error">{saveState.error}</StatusBanner>}
          {saveState.success && <StatusBanner tone="success">{saveState.success}</StatusBanner>}
          {saveState.reference && (
            <div className={saveReferenceClass}>
              <div className={fieldLabelTextClass}>Booking Reference</div>
              <div className="mt-1.5 text-[1.1rem] font-black text-teal-800">{saveState.reference}</div>
              <div className="mt-1.5 text-[0.78rem] font-bold text-desk-muted">This transaction is now available in the main admin system.</div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatusBanner({ tone = 'info', children }) {
  return <div className={cx(statusBannerBaseClass, statusBannerToneClass[tone] || statusBannerToneClass.info)}>{children}</div>;
}

function SavedBookingCard({ booking, onReset, onOpenAvailability }) {
  const items = booking?.items || [];
  const header = booking?.header || {};
  const balance = Number(header.balance_due ?? header.balance ?? 0);

  if (!booking) return null;

  return (
    <section className={confirmationCardClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-[0.1em] text-desk-green">
            <CheckCircle2 size={16} />
            Booking Saved
          </div>
          <div className="mt-2 font-display text-[1.35rem] font-semibold leading-none text-desk-ink">{header.booking_reference}</div>
        </div>
        <div className="rounded-full border border-desk-green/15 bg-desk-green/10 px-3 py-1 text-[0.72rem] font-black text-desk-green">{header.status || header.booking_status || 'RESERVED'}</div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-[0.62rem] font-black">
        {['Draft', 'Saved', 'Reserved', 'Check-in'].map((label, index) => (
          <div key={label} className={cx('rounded-full border border-desk-line bg-[#f5eee2]/75 px-2 py-1.5 text-desk-muted', index === 1 && 'border-desk-green/20 bg-desk-green/10 text-desk-deep')}>
            {label}
          </div>
        ))}
      </div>
      {balance > 0 && (
        <div className="mt-4 rounded-2xl border border-desk-gold/35 bg-desk-gold/10 px-3.5 py-3 text-[0.8rem] font-black text-[#805600]">
          Balance of {formatCurrency(balance)} remains.
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div>
          <span className={fieldLabelTextClass}>Guest</span>
          <strong className="mt-1 block text-sm font-black text-desk-ink">{header.guest_name || header.customer_name || 'Walk-in Guest'}</strong>
        </div>
        <div>
          <span className={fieldLabelTextClass}>Stay</span>
          <strong className="mt-1 block text-sm font-black text-desk-ink">{header.check_in} to {header.check_out}</strong>
        </div>
        <div>
          <span className={fieldLabelTextClass}>Units</span>
          <strong className="mt-1 block text-sm font-black text-desk-ink">{pluralize(items.length, 'room', 'rooms')}</strong>
        </div>
        <div>
          <span className={fieldLabelTextClass}>Balance</span>
          <strong className="mt-1 block text-sm font-black text-desk-ink">{formatCurrency(balance)}</strong>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <div key={item.booking_item_id} className={unitSummaryRowClass}>
            <div>
              <div className={unitSummaryLabelClass}>{item.unit_label || item.unit_id || item.room_type}</div>
              <div className={unitSummarySubClass}>{item.guest_count ?? item.guests} pax - {item.status || item.item_status}</div>
            </div>
            <div className={unitSummaryAmountClass}>{formatCurrency(item.lodging_subtotal ?? item.subtotal ?? 0)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2.5">
        <button type="button" className={cx(secondaryButtonClass, secondaryButtonAccentClass)} onClick={() => openAcknowledgementPrint(booking)}>Show Acknowledgement Receipt</button>
        <button type="button" className={cx(secondaryButtonClass, secondaryButtonAccentClass)} onClick={onOpenAvailability}>Check Availability</button>
        <button type="button" className={secondaryButtonClass} onClick={onReset}>Start Another Booking</button>
      </div>
    </section>
  );
}

function BookingDeskPage({ onOpenAvailability }) {
  const unitsPerPage = 5;
  const initialDraft = readBookingDraft();
  const [form, setForm] = useState(initialDraft?.form || defaultBookingForm);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState(initialDraft?.selectedUnitIds || []);
  const [manualCategory, setManualCategory] = useState(initialDraft?.manualCategory || 'all');
  const [manualPage, setManualPage] = useState(initialDraft?.manualPage || 1);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [saveState, setSaveState] = useState(initialDraft?.saveState || { loading: false, error: '', success: '', reference: '' });
  const [savedBooking, setSavedBooking] = useState(initialDraft?.savedBooking || null);

  const nightCount = buildNightCount(form.checkIn, form.checkOut);
  const dateRangeValid = Boolean(form.checkIn && form.checkOut && form.checkOut > form.checkIn);
  const guestCountValid = Number(form.guests) > 0;
  const canSearch = dateRangeValid && guestCountValid;

  useEffect(() => {
    if (!canSearch) {
      setAvailableUnits([]);
      setSelectedUnitIds([]);
      setQuote(null);
      return;
    }

    let active = true;
    setLoadingRecommendations(true);
    setQuoteError('');
    setSaveState((current) => ({ ...current, error: '', success: '', reference: '' }));
    setSavedBooking(null);

    api.post('/api/v1/admin/booking-desk/recommendations', buildRecommendationRequest(form))
      .then((data) => {
        if (!active) return;
        const nextUnits = data.available_units || [];
        setAvailableUnits(nextUnits);
      })
      .catch((error) => {
        if (!active) return;
        setAvailableUnits([]);
        setSelectedUnitIds([]);
        setQuote(null);
        setQuoteError(error.message || 'Could not load recommendations.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingRecommendations(false);
      });

    return () => {
      active = false;
    };
  }, [form.checkIn, form.checkOut, form.guests, form.mode, canSearch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const draft = {
      form,
      selectedUnitIds,
      manualCategory,
      manualPage,
      savedBooking,
      saveState: saveState.reference || saveState.success ? saveState : { loading: false, error: '', success: '', reference: '' }
    };
    window.sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
  }, [form, selectedUnitIds, manualCategory, manualPage, savedBooking, saveState]);

  useEffect(() => {
    if (!canSearch || selectedUnitIds.length === 0) {
      setQuote(null);
      if (!canSearch) setQuoteError('');
      return;
    }

    let active = true;
    setQuoteError('');
    api.post('/api/v1/admin/booking-desk/quote', buildQuoteRequest(form, selectedUnitIds))
      .then((data) => {
        if (!active) return;
        const nextQuote = data.quote || null;
        const effectiveUnitIds = (nextQuote?.quoted_units || []).map((unit) => unit.unit_id);
        if (effectiveUnitIds.length > 0 && effectiveUnitIds.join('|') !== selectedUnitIds.join('|')) {
          setSelectedUnitIds(effectiveUnitIds);
        }
        setQuote(nextQuote);
      })
      .catch((error) => {
        if (!active) return;
        setQuote(null);
        setQuoteError(error.message || 'Could not build quote.');
      });

    return () => {
      active = false;
    };
  }, [form.checkIn, form.checkOut, form.guests, selectedUnitIds, canSearch]);

  const selectedUnits = useMemo(() => {
    const unitMap = new Map(availableUnits.map((unit) => [unit.unit_id, unit]));
    return selectedUnitIds.map((unitId) => unitMap.get(unitId)).filter(Boolean);
  }, [availableUnits, selectedUnitIds]);

  const manualCategories = useMemo(() => {
    const categories = Array.from(new Set(availableUnits.map((unit) => getUnitCategory(unit))));
    return ['all', ...categories.filter((category) => category !== 'all')];
  }, [availableUnits]);

  const manualUnits = useMemo(() => {
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
  }, [availableUnits, manualCategory]);
  const totalManualPages = Math.max(1, Math.ceil(manualUnits.length / unitsPerPage));
  const pagedManualUnits = useMemo(() => {
    const start = (manualPage - 1) * unitsPerPage;
    return manualUnits.slice(start, start + unitsPerPage);
  }, [manualUnits, manualPage]);

  const selectionCapacity = useMemo(() => selectedUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0), [selectedUnits]);
  const selectionStandardCapacity = useMemo(() => selectedUnits.reduce((sum, unit) => sum + Number(unit.standard_max_pax || 0), 0), [selectedUnits]);
  const requestedGuests = Number(form.guests || 0);
  const selectionTargetMet = requestedGuests > 0 && selectionCapacity >= requestedGuests;
  const remainingAbsoluteCapacity = Math.max(0, requestedGuests - selectionCapacity);
  const remainingStandardCapacity = Math.max(0, requestedGuests - selectionStandardCapacity);

  useEffect(() => {
    if (!manualCategories.includes(manualCategory)) {
      setManualCategory('all');
    }
  }, [manualCategories, manualCategory]);

  useEffect(() => {
    setManualPage(1);
  }, [form.checkIn, form.checkOut, form.guests, form.mode, manualCategory]);

  useEffect(() => {
    if (manualPage > totalManualPages) {
      setManualPage(totalManualPages);
    }
  }, [manualPage, totalManualPages]);

  const fitWarnings = useMemo(() => {
    return buildFitWarnings({
      dateRangeValid,
      guestCountValid,
      canSearch,
      availableUnitCount: availableUnits.length,
      loadingRecommendations,
      selectedUnitCount: selectedUnitIds.length,
      selectionCapacity,
      guestCount: form.guests,
      quote,
      fullName: form.fullName,
      quoteError
    });
  }, [dateRangeValid, guestCountValid, canSearch, availableUnits.length, loadingRecommendations, selectedUnitIds.length, selectionCapacity, quote, form.guests, form.fullName, quoteError]);

  const stepState = {
    setupDone: canSearch,
    selectionDone: selectedUnitIds.length > 0 && Boolean(quote),
    guestDone: Boolean(form.phone || form.email || form.fullName.trim()),
  };
  const selectionFits = selectedUnitIds.length > 0 && Number(form.guests) <= Number(selectionCapacity || 0);
  const saveReady = stepState.setupDone && stepState.selectionDone && selectionFits;

  const progressItems = [
    { label: 'Stay', done: stepState.setupDone, active: !stepState.setupDone },
    { label: 'Units', done: stepState.selectionDone, active: stepState.setupDone && !stepState.selectionDone },
    { label: 'Guest', done: stepState.guestDone, active: stepState.selectionDone && !stepState.guestDone },
    { label: 'Review', done: Boolean(saveState.reference), active: stepState.selectionDone && stepState.guestDone },
  ];

  const handleUnitToggle = (unitId) => {
    if (form.mode === 'solo') {
      setSelectedUnitIds((current) => (
        current.includes(unitId) ? [] : [unitId]
      ));
      return;
    }
    setSelectedUnitIds((current) => (
      current.includes(unitId)
        ? current.filter((value) => value !== unitId)
        : selectionTargetMet
          ? current
          : [...current, unitId]
    ));
  };

  const handleSave = async () => {
    if (!quote || !saveReady || saveState.loading) return;
    setSaveState({ loading: true, error: '', success: '', reference: '' });
    try {
      const createPayload = buildCreateBookingPayload({ form, quote });

      const created = await api.post('/api/v1/admin/booking-headers', createPayload);
      const createdRef = created?.header?.booking_reference;

      if (createdRef && Number(form.initialPayment || 0) > 0) {
        await api.post(`/api/v1/admin/booking-headers/${createdRef}/payments`, buildInitialPaymentPayload({
          amount: form.initialPayment,
          quote,
          paymentMethod: form.paymentMethod
        }));
      }

      const latest = createdRef ? await api.get(`/api/v1/admin/booking-headers/${createdRef}`) : null;
      setSavedBooking(latest);
      setSaveState({ loading: false, error: '', success: `Saved as ${createdRef}.`, reference: createdRef });
    } catch (error) {
      setSaveState({ loading: false, error: error.message || 'Booking save failed.', success: '', reference: '' });
    }
  };

  const handleReset = () => {
    setForm(defaultBookingForm);
    setManualCategory('all');
    setManualPage(1);
    setAvailableUnits([]);
    setSelectedUnitIds([]);
    setQuote(null);
    setQuoteError('');
    setSavedBooking(null);
    setSaveState({ loading: false, error: '', success: '', reference: '' });
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(BOOKING_DRAFT_KEY);
    }
  };

  return (
    <div className={bookingPageClass}>
      <section className={bookingAppBarClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={heroEyebrowClass}>Amalfi Admin Desk</div>
            <h1 className="my-1 font-display text-[1.55rem] font-semibold leading-tight text-desk-ink">Booking Desk</h1>
            <p className="m-0 text-[0.82rem] font-bold leading-relaxed text-desk-muted">Mobile entry for solo and multi-unit transaction bookings.</p>
          </div>
          <button type="button" className={miniLinkClass} onClick={onOpenAvailability}>
            <CalendarDays size={15} />
          </button>
        </div>
        <div className="mt-4">
          <BookingStepRail items={progressItems} />
        </div>
      </section>

      <StepCard step="1" title="Stay Setup" caption="Enter the dates, group size, and whether this is solo or combo." active complete={stepState.setupDone}>
        <SegmentedControl
          value={form.mode}
          onChange={(value) => setForm((current) => ({ ...current, mode: value }))}
          options={[
            { value: 'solo', label: 'Solo Booking' },
            { value: 'combo', label: 'Combo Booking' }
          ]}
        />
        <div className={fieldGridTwoClass}>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Check-In</span>
            <input className={fieldControlClass} type="date" value={form.checkIn} onChange={(e) => setForm((current) => ({ ...current, checkIn: e.target.value }))} />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Check-Out</span>
            <input className={fieldControlClass} type="date" value={form.checkOut} onChange={(e) => setForm((current) => ({ ...current, checkOut: e.target.value }))} />
          </label>
        </div>
        <div className={cx(fieldGridTwoClass, 'mt-1.5')}>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Guests</span>
            <input className={fieldControlClass} type="number" min="1" value={form.guests} onChange={(e) => setForm((current) => ({ ...current, guests: e.target.value }))} />
          </label>
          <div className="flex flex-col justify-center gap-2 rounded-2xl border border-desk-line bg-[linear-gradient(180deg,#edf3ea,#f9fbf7)] px-3.5 py-3.5">
            <span className={fieldLabelTextClass}>Nights</span>
            <strong className="text-[1.4rem] font-black text-desk-ink">{nightCount}</strong>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
          <div className="rounded-2xl border border-desk-line bg-[#f7f8f4] p-3 text-center text-[0.8rem] font-black text-[#355145]">{form.mode === 'solo' ? '1 room target' : '2+ rooms target'}</div>
          <div className="rounded-2xl border border-desk-line bg-[#f7f8f4] p-3 text-center text-[0.8rem] font-black text-[#355145]">{pluralize(Number(form.guests || 0), 'guest', 'guests')}</div>
        </div>
        <StatusBanner tone="info">
          {form.mode === 'solo'
            ? 'Solo Booking allows only 1 room. Switch to Combo Booking if you need to select 2 or more units.'
            : 'Combo Booking allows multiple units under one shared transaction booking.'}
        </StatusBanner>
        {!dateRangeValid && <StatusBanner tone="error">Set a valid stay range. Check-out must be later than check-in.</StatusBanner>}
      </StepCard>

      <StepCard step="2" title="Pick Rooms" caption="Manually choose the exact units you want. The desk will track capacity and totals while you decide." active={stepState.setupDone} complete={stepState.selectionDone}>
        {loadingRecommendations && (
          <div className={cx(softNoteClass, 'flex items-center gap-2.5')}>
            <LoaderCircle className="spin-icon" size={18} />
            <span>Checking available units...</span>
          </div>
        )}
        <div className={softNoteClass}>
          Tap the exact rooms you want. The desk will stop extra selections once the requested pax is already covered.
        </div>
        {manualCategories.length > 1 && (
          <div className="my-3">
            <SegmentedControl
              value={manualCategory}
              onChange={setManualCategory}
              compact
              options={manualCategories.map((category) => ({
                value: category,
                label: getCategoryLabel(category)
              }))}
            />
          </div>
        )}
        {form.mode === 'solo' && (
          <StatusBanner tone="info">
            Solo Booking keeps only one room selected at a time.
          </StatusBanner>
        )}
        {form.mode === 'combo' && selectionTargetMet && (
          <StatusBanner tone="success">
            The selected rooms already cover {requestedGuests} pax. Deselect a room first if you want to swap units.
          </StatusBanner>
        )}
        {form.mode === 'combo' && !selectionTargetMet && selectedUnitIds.length > 0 && (
          <StatusBanner tone="info">
            Add rooms until the target is covered. {remainingAbsoluteCapacity} more pax worth of absolute capacity is still needed.
          </StatusBanner>
        )}
        {!loadingRecommendations && availableUnits.length > 0 && (
          <div className={capacityPanelClass}>
            <div className="mb-3">
              <div className="text-[0.82rem] font-black text-desk-deep">Capacity Math</div>
              <div className="mt-1 text-[0.72rem] font-bold text-desk-muted">{requestedGuests} pax requested | {selectionCapacity || 0} capacity selected | {remainingAbsoluteCapacity} remaining</div>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#f5eee2]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#0a6b5f,#c6923f)] transition-all" style={{ width: `${Math.min(100, requestedGuests ? (selectionCapacity / requestedGuests) * 100 : 0)}%` }} />
            </div>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div className="flex min-h-[132px] flex-col justify-between rounded-[18px] border border-desk-line bg-[#f7f8f4] p-4">
                <span className="text-[0.8rem] font-black leading-tight text-desk-ink/80">Rooms Open</span>
                <strong className="text-[2.1rem] font-black leading-none text-desk-deep">{availableUnits.length}</strong>
              </div>
              <div className="grid gap-3">
                <div className="flex min-h-[60px] flex-col justify-center gap-1.5 rounded-[18px] border border-desk-line bg-[#f7f8f4] p-3.5">
                  <strong className="text-[1.1rem] font-black leading-none text-desk-red">{selectionCapacity || 0} pax</strong>
                  <span className="text-[0.8rem] font-black leading-tight text-desk-ink/80">currently fits</span>
                </div>
                <div className="flex min-h-[60px] flex-col justify-center gap-1.5 rounded-[18px] border border-desk-line bg-[#f7f8f4] p-3.5">
                  <strong className="text-[1.1rem] font-black leading-none text-desk-red">{selectionTargetMet ? '0 pax' : `${remainingAbsoluteCapacity} pax`}</strong>
                  <span className="text-[0.8rem] font-black leading-tight text-desk-ink/80">still needed to fill</span>
                </div>
              </div>
            </div>
            {selectedUnits.length > 0 && (
              <div className="mt-3 flex max-w-full flex-wrap gap-2 pb-1">
                {selectedUnits.map((unit) => (
                  <button key={unit.unit_id} type="button" className={selectedUnitChipClass} onClick={() => handleUnitToggle(unit.unit_id)}>
                    <span>{unit.unit_label}</span>
                    <span className="text-desk-muted">x</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="my-4 h-px bg-[linear-gradient(90deg,rgba(18,32,27,0.14),rgba(18,32,27,0.04))]" />
        <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2">
          {pagedManualUnits.map((unit) => {
            const selected = selectedUnitIds.includes(unit.unit_id);
            const disabled = !selected && form.mode === 'combo' && selectionTargetMet;
            return (
              <button
                key={unit.unit_id}
                type="button"
                className={cx(unitCardClass, selected && unitCardSelectedClass, disabled && unitCardDisabledClass)}
                onClick={() => handleUnitToggle(unit.unit_id)}
                disabled={disabled}
              >
                <div className={unitCardTopClass}>
                  <span>{unit.unit_label}</span>
                  <div className={unitCardTopRightClass}>
                    {selected && <span className={unitSelectedBadgeClass}>Selected</span>}
                    <span>{formatCurrency(unit.nightly_rate)}</span>
                  </div>
                </div>
                <div className={unitCardSubClass}>{unit.room_type}</div>
                <div className={unitCardStatClass}>
                  <span>{unit.standard_max_pax} std / {unit.absolute_max_pax} max pax</span>
                </div>
                <div className={unitCardStateClass}>
                  <span>
                    {selected
                      ? 'Selected'
                      : disabled
                        ? 'Target reached'
                        : requestedGuests <= Number(unit.absolute_max_pax || 0)
                          ? 'Fits alone'
                          : 'Needs combo'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {!loadingRecommendations && manualUnits.length === 0 && (
          <div className={emptyStateClass}>No units match this category for the current date and pax input.</div>
        )}
        {!loadingRecommendations && manualUnits.length > unitsPerPage && (
          <div className={paginationBarClass}>
            <button
              type="button"
              className={paginationButtonClass}
              onClick={() => setManualPage((current) => Math.max(1, current - 1))}
              disabled={manualPage === 1}
            >
              Prev
            </button>
            <div className={paginationStatusClass}>
              Page {manualPage} of {totalManualPages}
            </div>
            <button
              type="button"
              className={paginationButtonClass}
              onClick={() => setManualPage((current) => Math.min(totalManualPages, current + 1))}
              disabled={manualPage === totalManualPages}
            >
              Next
            </button>
          </div>
        )}
        {!selectionFits && selectedUnitIds.length > 0 && (
          <StatusBanner tone="error">The selected rooms only fit up to {selectionCapacity} pax max. Add more rooms or reduce the guest count before saving.</StatusBanner>
        )}
      </StepCard>

      <StepCard step="3" title="Guest Details" caption="Capture the booking details that should travel with the transaction." active={stepState.selectionDone} complete={stepState.guestDone}>
        <div className={fieldGridClass}>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Guest Name</span>
            <input className={fieldControlClass} value={form.fullName} onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))} placeholder="Walk-in Guest" />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Phone</span>
            <input
              className={fieldControlClass}
              value={form.phone}
              onChange={(e) => setForm((current) => ({ ...current, phone: normalizePhoneInput(e.target.value) }))}
              placeholder="+63917..."
            />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Email</span>
            <input className={fieldControlClass} value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} placeholder="Optional" />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Initial Payment</span>
            <input className={fieldControlClass} type="number" min="0" value={form.initialPayment} onChange={(e) => setForm((current) => ({ ...current, initialPayment: e.target.value }))} placeholder="0" />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Payment Method</span>
            <select className={fieldControlClass} value={form.paymentMethod} onChange={(e) => setForm((current) => ({ ...current, paymentMethod: e.target.value }))}>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Booking Source</span>
            <select className={fieldControlClass} value={form.bookingSource} onChange={(e) => setForm((current) => ({ ...current, bookingSource: e.target.value }))}>
              <option value="Walk-in">Walk-in</option>
              <option value="Phone">Phone</option>
              <option value="Facebook">Facebook</option>
              <option value="Messenger">Messenger</option>
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Notes</span>
            <textarea className={fieldControlClass} rows="3" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Optional admin notes for this booking" />
          </label>
        </div>
      </StepCard>

      <SummaryCard quote={quote} form={form} warnings={fitWarnings} saveState={saveState} saveReady={saveReady} onSave={handleSave} />
      <SavedBookingCard booking={savedBooking} onReset={handleReset} onOpenAvailability={onOpenAvailability} />

      {(selectedUnits.length > 0 || quote || saveState.loading) && (
        <div className={stickyCtaClass}>
          <div>
            <span className={stickyLabelClass}>Selected</span>
            <strong className="text-[0.82rem]">{pluralize(selectedUnits.length, 'unit', 'units')}</strong>
          </div>
          <div>
            <span className={stickyLabelClass}>Capacity</span>
            <strong className="text-[0.82rem]">{selectionCapacity ? `${selectionCapacity} max` : 'Pick'}</strong>
          </div>
          <div>
            <span className={stickyLabelClass}>Total</span>
            <strong className="text-[0.82rem]">{quote ? formatCurrency(quote.total_amount) : 'Pending'}</strong>
          </div>
          <button type="button" className={stickyActionClass} onClick={handleSave} disabled={!saveReady || saveState.loading || Boolean(savedBooking)}>
            {saveState.loading ? 'Saving' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

function AvailabilityPage() {
  const bookingDraft = readBookingDraft();
  const projectedUnitIds = bookingDraft?.selectedUnitIds || [];
  const projectedCheckIn = bookingDraft?.form?.checkIn || '';
  const projectedCheckOut = bookingDraft?.form?.checkOut || '';
  const hasProjectedBooking = projectedUnitIds.length > 0 && projectedCheckIn && projectedCheckOut && projectedCheckOut > projectedCheckIn;
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [windowStart, setWindowStart] = useState(hasProjectedBooking ? projectedCheckIn : today);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get('/api/v1/admin/occupancy')
      .then((data) => {
        if (!active) return;
        setUnits(data.units || []);
        setBookings(data.bookings || []);
      })
      .catch((fetchError) => {
        if (!active) return;
        setUnits([]);
        setBookings([]);
        setError(fetchError.message || 'Could not load availability.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const dateWindow = useMemo(() => buildDateWindow(windowStart, 7), [windowStart]);
  const categories = useMemo(() => {
    const keys = Array.from(new Set(units.map((unit) => getUnitCategory(unit))));
    return ['all', ...keys];
  }, [units]);

  const visibleUnits = useMemo(() => units
    .filter((unit) => selectedCategory === 'all' || getUnitCategory(unit) === selectedCategory)
    .sort((left, right) => {
      if (String(left.room_type || '') !== String(right.room_type || '')) {
        return String(left.room_type || '').localeCompare(String(right.room_type || ''));
      }
      if (Number(right.absolute_max_pax || 0) !== Number(left.absolute_max_pax || 0)) {
        return Number(right.absolute_max_pax || 0) - Number(left.absolute_max_pax || 0);
      }
      return String(left.unit_label || left.unit_id).localeCompare(String(right.unit_label || right.unit_id));
    }), [units, selectedCategory]);

  const groupedUnits = useMemo(() => visibleUnits.reduce((acc, unit) => {
    const roomType = String(unit.room_type || '').trim();
    const key = roomType && !/^other$/i.test(roomType) ? roomType : getCategoryLabel(getUnitCategory(unit));
    if (!acc[key]) acc[key] = [];
    acc[key].push(unit);
    return acc;
  }, {}), [visibleUnits]);
  const groupedUnitEntries = useMemo(() => Object.entries(groupedUnits), [groupedUnits]);

  const bookingsByUnit = useMemo(() => bookings.reduce((acc, booking) => {
    if (!booking?.unit_id) return acc;
    if (!acc[booking.unit_id]) acc[booking.unit_id] = [];
    acc[booking.unit_id].push(booking);
    return acc;
  }, {}), [bookings]);

  const summary = useMemo(() => {
    const totalUnits = visibleUnits.length;
    const roomTypes = Object.keys(groupedUnits).length;
    const totalCapacity = visibleUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0);
    const bookedToday = visibleUnits.filter((unit) => {
      const unitBookings = bookingsByUnit[unit.unit_id] || [];
      return unitBookings.some((booking) => bookingCoversDate(booking, today));
    }).length;
    const bookedInWindow = visibleUnits.filter((unit) => {
      const unitBookings = bookingsByUnit[unit.unit_id] || [];
      return dateWindow.some((day) => unitBookings.some((booking) => bookingCoversDate(booking, day.iso)));
    }).length;

    return {
      totalUnits,
      roomTypes,
      totalCapacity,
      bookedToday,
      bookedInWindow,
      openToday: Math.max(0, totalUnits - bookedToday)
    };
  }, [bookingsByUnit, dateWindow, groupedUnits, visibleUnits]);

  useEffect(() => {
    if (!hasProjectedBooking) return;
    setWindowStart(projectedCheckIn);
  }, [hasProjectedBooking, projectedCheckIn]);

  return (
    <div className="grid gap-4">
      <section className={bookingHeroClass}>
        <div className={heroEyebrowClass}>Availability Board</div>
        <h1 className="my-2 font-display text-[1.7rem] font-semibold leading-none tracking-normal">Visual Unit Occupancy</h1>
        <p className="m-0 max-w-2xl text-[0.9rem] font-semibold leading-relaxed text-[#f8f7f1]/85">This tab is now a read-first board for currently booked units. Booking details and data entry stay on the Booking tab.</p>
      </section>

      <section className={panelClass}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <div className={panelTitleClass}>Occupancy Summary</div>
            <div className="mt-1 text-[0.82rem] font-bold leading-relaxed text-desk-muted">Showing a 7-day visual window starting {dateWindow[0]?.short}. Use categories to reduce clutter before scanning the rooms.</div>
            {hasProjectedBooking && (
              <div className="mt-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[0.76rem] font-black text-emerald-700">
                Previewing your draft booking from {projectedCheckIn} to {projectedCheckOut} on {pluralize(projectedUnitIds.length, 'selected unit', 'selected units')}.
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f8f4] px-2.5 py-2 text-[0.72rem] font-black text-[#244238]"><span className={cx(legendDotClass, 'bg-white')} />Open</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f8f4] px-2.5 py-2 text-[0.72rem] font-black text-[#244238]"><span className={cx(legendDotClass, 'bg-desk-green')} />Booked</span>
            {hasProjectedBooking && <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f8f4] px-2.5 py-2 text-[0.72rem] font-black text-[#244238]"><span className={cx(legendDotClass, 'border-emerald-500 bg-emerald-100')} />Draft Preview</span>}
          </div>
        </div>
        <div className="mt-3 grid gap-3 rounded-[20px] border border-desk-line bg-[#f7f8f4]/90 p-3 md:grid-cols-[minmax(0,1fr)_1.5fr]">
          <div className="grid gap-1">
            <span className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-desk-muted">Open Today</span>
            <strong className="text-[2rem] font-black leading-none text-desk-ink">{summary.openToday}</strong>
            <span className="text-[0.82rem] font-bold text-desk-muted">{summary.totalUnits} units in current view</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className={metricCardClass}>
              <span>Booked</span>
              <strong>{summary.bookedToday}</strong>
            </div>
            <div className={metricCardClass}>
              <span>Room Types</span>
              <strong>{summary.roomTypes}</strong>
            </div>
            <div className={metricCardClass}>
              <span>Window Booked</span>
              <strong>{summary.bookedInWindow}</strong>
            </div>
            <div className={metricCardClass}>
              <span>Max Pax</span>
              <strong>{summary.totalCapacity}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className={panelTitleClass}>Browse Units</div>
          <div className={cx(statusPillBaseClass, statusPillToneClass.gold)}>{visibleUnits.length} shown</div>
        </div>
        <div className={filterRailClass}>
          {categories.map((category) => {
            const count = category === 'all'
              ? units.length
              : units.filter((unit) => getUnitCategory(unit) === category).length;
            return (
              <button
                key={category}
                type="button"
                className={cx(filterButtonClass, selectedCategory === category && filterButtonActiveClass)}
                onClick={() => setSelectedCategory(category)}
              >
                {getCategoryLabel(category)} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {loading && <div className={panelClass}><div className={emptyStateClass}>Loading availability...</div></div>}
      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      {!loading && !error && visibleUnits.length === 0 && (
        <div className={panelClass}>
          <div className={emptyStateClass}>No units match this category right now.</div>
        </div>
      )}

      {!loading && groupedUnitEntries.length > 1 && (
        <section className={panelClass}>
          <div className="flex items-center justify-between gap-3">
            <button type="button" className={navPillClass} onClick={() => setWindowStart((current) => addDays(current, -7))}>Prev 7</button>
            <div className="text-[0.76rem] font-black text-desk-muted">{dateWindow[0]?.short} to {dateWindow[dateWindow.length - 1]?.short}</div>
            <button type="button" className={navPillClass} onClick={() => setWindowStart((current) => addDays(current, 7))}>Next 7</button>
          </div>
        </section>
      )}

      {!loading && groupedUnitEntries.map(([roomType, roomUnits], index) => (
        <section key={roomType} className={timelinePanelClass}>
          {groupedUnitEntries.length === 1 ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <button type="button" className={navPillClass} onClick={() => setWindowStart((current) => addDays(current, -7))}>Prev 7</button>
              <div className="text-[0.76rem] font-black text-desk-muted">{dateWindow[0]?.short} to {dateWindow[dateWindow.length - 1]?.short}</div>
              <button type="button" className={navPillClass} onClick={() => setWindowStart((current) => addDays(current, 7))}>Next 7</button>
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className={panelTitleClass}>{roomType}</div>
              <div className={cx(statusPillBaseClass, statusPillToneClass.gold)}>{roomUnits.length} unit{roomUnits.length === 1 ? '' : 's'}</div>
            </div>
          )}
          <div className={timelineGridClass}>
            <div className={timelineHeadCellClass}>Unit</div>
            <div className={timelineCellsClass}>
              {dateWindow.map((day) => (
                <div key={day.iso} className={timelineHeadCellClass}>{day.label}</div>
              ))}
            </div>
          </div>
          <div className="mt-2 grid gap-2">
            {roomUnits.map((unit) => (
              <article key={unit.unit_id} className={timelineGridClass}>
                <div className={timelineUnitClass}>
                  <div className="truncate text-[0.76rem] font-black text-desk-ink">{unit.unit_label}</div>
                  <div className="mt-1 text-[0.62rem] font-bold text-desk-muted">{unit.absolute_max_pax} max pax</div>
                </div>
                <div className={timelineCellsClass}>
                  {dateWindow.map((day) => {
                    const unitBookings = bookingsByUnit[unit.unit_id] || [];
                    const activeBooking = unitBookings.find((booking) => bookingCoversDate(booking, day.iso));
                    const blocked = Boolean(activeBooking);
                    const projected = !blocked
                      && projectedUnitIds.includes(unit.unit_id)
                      && hasProjectedBooking
                      && day.iso >= projectedCheckIn
                      && day.iso < projectedCheckOut;
                    return (
                      <div
                        key={`${unit.unit_id}-${day.iso}`}
                        className={cx(timelineCellBaseClass, blocked ? timelineCellBookedClass : projected ? timelineCellProjectedClass : timelineCellOpenClass)}
                        title={
                          blocked
                            ? `${activeBooking.full_name || activeBooking.guest_name || activeBooking.booking_ref} - ${activeBooking.check_in} to ${activeBooking.check_out}`
                            : projected
                              ? `Draft booking preview - ${projectedCheckIn} to ${projectedCheckOut}`
                              : `${unit.unit_label} is open on ${day.iso}`
                        }
                      />
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MetricCard({ label, value, note, tone = 'green' }) {
  return (
    <div className={metricCardClass}>
      <span className="block font-data text-[0.58rem] font-black uppercase leading-snug tracking-[0.14em] text-desk-muted">{label}</span>
      <strong className={cx('mt-1 block text-[1.35rem] font-black leading-none', metricToneClass[tone] || metricToneClass.green)}>{value}</strong>
      {note && <small className="mt-2 block text-[0.7rem] font-bold leading-snug text-desk-muted">{note}</small>}
    </div>
  );
}

function LaneCard({ label, value, note, active }) {
  return (
    <div className={cx(laneCardClass, active && laneCardActiveClass)}>
      <span className={laneLabelClass}>{label}</span>
      <strong className={laneValueClass}>{value}</strong>
      <small className={laneNoteClass}>{note}</small>
    </div>
  );
}

function BookingActionCard({ row, actionLabel, actionTone = 'green', onAction, onPayment, busyRef }) {
  const ref = bookingRef(row);
  const balance = bookingBalance(row);
  const busy = busyRef === ref;
  const balanceTone = balance > 0 ? 'red' : 'green';

  return (
    <article className={cx(opsCardClass, actionLabel && opsCardActionClass)}>
      <div className={opsCardTopClass}>
        <div>
          <strong className="block text-sm font-black text-desk-ink">{guestName(row)}</strong>
          <p className="mt-1 text-[0.78rem] font-bold leading-relaxed text-desk-muted">{ref} - {bookingUnits(row)}</p>
        </div>
        <span className={cx(statusPillBaseClass, statusPillToneClass[balanceTone])}>
          {balance > 0 ? `${formatCurrency(balance)} due` : 'Paid'}
        </span>
      </div>
      <div className={opsCardMetaClass}>
        <span className={opsMetaPillClass}>{formatDateShort(row.check_in)} to {formatDateShort(row.check_out)}</span>
        <span className={opsMetaPillClass}>{row.guests || row.guest_count || '-'} pax</span>
        <span className={opsMetaPillClass}>{row.status || 'RESERVED'}</span>
      </div>
      <div className={actionRowClass}>
        {actionLabel && (
          <button
            type="button"
            className={cx(deskButtonBaseClass, deskButtonToneClass[actionTone] || deskButtonToneClass.green)}
            onClick={() => onAction?.(row)}
            disabled={busy}
          >
            {busy ? 'Working...' : actionLabel}
          </button>
        )}
        {balance > 0 && (
          <button type="button" className={cx(deskButtonBaseClass, deskButtonToneClass.muted)} onClick={() => onPayment?.(row)} disabled={busy}>
            Record Pay
          </button>
        )}
      </div>
    </article>
  );
}

function BookingFactGrid({ row }) {
  return (
    <div className={factGridClass}>
      <div><span>Stay</span><strong>{formatDateShort(row.check_in)} to {formatDateShort(row.check_out)}</strong></div>
      <div><span>Total</span><strong>{formatCurrency(bookingTotal(row))}</strong></div>
      <div><span>Paid</span><strong>{formatCurrency(bookingPaid(row))}</strong></div>
      <div><span>Balance</span><strong>{formatCurrency(bookingBalance(row))}</strong></div>
    </div>
  );
}

function LedgerPage({ data, actions }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [ledgerPage, setLedgerPage] = useState(0);
  const statuses = ['active', 'all', 'PENDING_VERIFICATION', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data.ledger || [])
      .filter((row) => {
        const status = String(row.status || '');
        if (statusFilter === 'active') return ['PENDING_VERIFICATION', 'RESERVED', 'CHECKED_IN'].includes(status);
        if (statusFilter === 'all') return true;
        return status === statusFilter;
      })
      .filter((row) => {
        if (!normalizedQuery) return true;
        return [bookingRef(row), guestName(row), bookingUnits(row), row.phone, row.email, row.booking_source]
          .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => String(right.created_at || right.check_in || '').localeCompare(String(left.created_at || left.check_in || '')));
  }, [data.ledger, query, statusFilter]);
  const ledgerPageSize = 8;
  const ledgerPageCount = Math.max(1, Math.ceil(rows.length / ledgerPageSize));
  const ledgerPageStart = Math.min(ledgerPage, ledgerPageCount - 1) * ledgerPageSize;
  const visibleRows = rows.slice(ledgerPageStart, ledgerPageStart + ledgerPageSize);

  useEffect(() => {
    setLedgerPage(0);
  }, [query, statusFilter]);

  useEffect(() => {
    if (ledgerPage > ledgerPageCount - 1) {
      setLedgerPage(Math.max(0, ledgerPageCount - 1));
    }
  }, [ledgerPage, ledgerPageCount]);

  return (
    <div className={pageStackClass}>
      <section className={compactHeroClass}>
        <h1>Mobile Ledger</h1>
        <p>Search bookings, inspect balances, and make light booking edits without opening the full Admin Hub.</p>
      </section>
      <section className={ledgerControlsClass}>
        <label className={searchFieldClass}>
          <Search size={15} />
          <input className="min-w-0 flex-1 border-0 bg-transparent text-sm font-bold text-desk-ink outline-none placeholder:text-desk-muted" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guest, ref, unit..." />
        </label>
        <div className={filterRailClass}>
          {statuses.map((status) => (
            <button key={status} type="button" className={cx(filterButtonClass, statusFilter === status && filterButtonActiveClass)} onClick={() => setStatusFilter(status)}>
              {status === 'active' ? 'Active' : status === 'all' ? 'All' : status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </section>
      <section className={metricGridClass}>
        <MetricCard label="Showing" value={rows.length} note="Bookings" />
        <MetricCard label="Due" value={formatCurrency(rows.reduce((sum, row) => sum + bookingBalance(row), 0))} note="Visible balance" tone="red" />
      </section>
      <section className={opsListClass}>
        {rows.length === 0 ? (
          <div className={panelClass}><div className={emptyStateClass}>No bookings match this ledger filter.</div></div>
        ) : visibleRows.map((row) => {
          const balance = bookingBalance(row);
          return (
          <article key={bookingRef(row)} className={cx(ledgerCardClass, balance > 0 && ledgerCardDueClass)}>
            <div className={opsCardTopClass}>
              <div>
                <strong className="block text-sm font-black text-desk-ink">{guestName(row)}</strong>
                <p className="mt-1 text-[0.78rem] font-bold leading-relaxed text-desk-muted">{bookingRef(row)} - {bookingUnits(row)}</p>
              </div>
              <span className={cx(statusPillBaseClass, statusPillToneClass[bookingBalance(row) > 0 ? 'red' : 'green'])}>
                {balance > 0 ? `${formatCurrency(balance)} due` : row.status || 'RESERVED'}
              </span>
            </div>
            <BookingFactGrid row={row} />
            <div className={actionRowClass}>
              <button type="button" className={cx(deskButtonBaseClass, deskButtonToneClass.green)} onClick={() => actions.openLedgerEdit(row)}>Edit</button>
              {bookingBalance(row) > 0 && <button type="button" className={cx(deskButtonBaseClass, deskButtonToneClass.muted)} onClick={() => actions.openPayment(row)}>Record Pay</button>}
            </div>
          </article>
          );
        })}
        {rows.length > ledgerPageSize && (
          <div className={paginationBarClass}>
            <button
              type="button"
              className={paginationButtonClass}
              onClick={() => setLedgerPage((current) => Math.max(0, current - 1))}
              disabled={ledgerPage <= 0}
            >
              Previous
            </button>
            <div className={paginationStatusClass}>
              Page {Math.min(ledgerPage + 1, ledgerPageCount)} of {ledgerPageCount}
            </div>
            <button
              type="button"
              className={paginationButtonClass}
              onClick={() => setLedgerPage((current) => Math.min(ledgerPageCount - 1, current + 1))}
              disabled={ledgerPage >= ledgerPageCount - 1}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function OperatorMetric({ label, value, note, tone = 'green' }) {
  return (
    <div className={operatorMetricClass}>
      <span className="block font-data text-[0.56rem] font-black uppercase leading-snug tracking-[0.12em] text-desk-muted">{label}</span>
      <strong className={cx('mt-1.5 block break-words text-[1.28rem] font-black leading-none', metricToneClass[tone] || metricToneClass.green)}>{value}</strong>
      {note && <small className="mt-2 block text-[0.66rem] font-bold leading-tight text-desk-muted">{note}</small>}
    </div>
  );
}

function WorkflowRow({ icon: Icon, title, note, meta, primary, onClick }) {
  return (
    <button type="button" className={cx(operatorWorkflowRowClass, primary && operatorWorkflowPrimaryClass)} onClick={onClick}>
      <span className={operatorWorkflowIconClass}><Icon size={18} /></span>
      <span className="min-w-0">
        <strong className="block truncate font-display text-[1.02rem] font-black leading-tight text-desk-ink">{title}</strong>
        <span className="mt-1.5 block text-[0.74rem] font-bold leading-snug text-desk-muted">{note}</span>
        {meta && <em className="mt-2 block truncate font-data text-[0.58rem] font-black uppercase not-italic tracking-[0.16em] text-desk-gold">{meta}</em>}
      </span>
      <span className={operatorWorkflowArrowClass}>â€º</span>
    </button>
  );
}

function SectionHomePage({ section, data, setPage }) {
  const configs = {
    guests: {
      eyebrow: 'Guest Movement',
      title: 'Guests',
      copy: 'Focused movement tools for arrivals, in-house guests, and due-outs.',
      metrics: [
        { label: 'Arrivals', value: data.arrivals.length, note: 'Need check-in' },
        { label: 'In House', value: data.inHouse.length, note: 'Currently staying', tone: 'gold' },
        { label: 'Due Out', value: data.dueOut.length, note: 'Ready for checkout', tone: 'red' },
        { label: 'Receivables', value: formatCurrency(data.totalDue), note: 'Open balances', tone: 'blue' }
      ],
      tools: [
        { title: 'Movement Desk', note: 'Arrivals, in-house, and due-out guest cards.', meta: `${data.arrivals.length + data.dueOut.length} active movements`, icon: ClipboardCheck, page: 'movements' },
        { title: 'Ledger Search', note: 'Find a guest booking, open light edits, or record payment.', meta: 'Guest lookup', icon: WalletCards, page: 'ledger' }
      ]
    },
    bookings: {
      eyebrow: 'Booking Workflows',
      title: 'Bookings',
      copy: 'Start a walk-in booking or inspect availability without carrying the full desktop app.',
      metrics: [
        { label: 'Ready Rooms', value: data.readyRooms, note: 'Open now' },
        { label: 'Arrivals', value: data.arrivals.length, note: 'Today' },
        { label: 'Pending Pay', value: data.pending.length, note: 'Before confirm', tone: 'red' },
        { label: 'In House', value: data.inHouse.length, note: 'Capacity context', tone: 'gold' }
      ],
      tools: [
        { title: 'Manual Booking', note: 'Create solo or multi-unit walk-in bookings.', meta: 'Fast entry', icon: Plus, page: 'booking' },
        { title: 'Availability', note: 'Inspect date windows and unit occupancy before committing.', meta: 'Calendar view', icon: CalendarDays, page: 'availability' },
        { title: 'Unit Checker', note: 'Filter available units by date, category, and readiness.', meta: `${data.readyRooms} ready rooms`, icon: BedDouble, page: 'unit-checker' }
      ]
    },
    money: {
      eyebrow: 'Payment + Ledger',
      title: 'Money',
      copy: 'Keep cash movement, receipt approval, balances, and pulse checks in one financial section.',
      metrics: [
        { label: 'Pending', value: data.pending.length, note: 'Receipt review', tone: 'red' },
        { label: 'Open Due', value: formatCurrency(data.totalDue), note: 'Receivables', tone: 'blue' },
        { label: 'Paid', value: formatCurrency(data.netPaid), note: 'Verified paid' },
        { label: 'Gross', value: formatCurrency(data.grossBilled), note: 'Booked total', tone: 'gold' }
      ],
      tools: [
        { title: 'Verify Payments', note: 'Approve or reject uploaded payment proof.', meta: `${data.pending.length} pending`, icon: CircleDollarSign, page: 'verification' },
        { title: 'Ledger', note: 'Search bookings and open payment or light edit sheets.', meta: 'Transactions', icon: WalletCards, page: 'ledger' },
        { title: 'Pulse', note: 'Check collections, receivables, and financial health.', meta: 'Dashboard', icon: Sparkles, page: 'pulse' }
      ]
    },
    tools: {
      eyebrow: 'Operations Tools',
      title: 'Tools',
      copy: 'Support workflows that matter on the floor but do not need to live in the main nav.',
      metrics: [
        { label: 'Ready', value: data.readyRooms, note: 'Available units' },
        { label: 'Clean', value: data.cleaningRooms, note: 'Need attention', tone: 'blue' },
        { label: 'Blocked', value: data.blockedRooms, note: 'Maintenance', tone: 'red' },
        { label: 'Chats', value: 'Live', note: 'Guest messaging', tone: 'gold' }
      ],
      tools: [
        { title: 'Room Ops', note: 'Update room readiness, cleaning, inspection, and maintenance.', meta: `${data.cleaningRooms + data.blockedRooms} follow-ups`, icon: BedDouble, page: 'rooms' },
        { title: 'Chatbot Control', note: 'Review guest chats, categories, and quick reply drafts.', meta: 'Messages', icon: MessageSquareText, page: 'chatbot' },
        { title: 'Unit Checker', note: 'Open the unit/date grid from the tools drawer too.', meta: 'Availability tool', icon: CalendarDays, page: 'unit-checker' }
      ]
    }
  };

  const config = configs[section] || configs.guests;

  return (
    <div className={pageStackClass}>
      <section className={operatorHeroClass}>
        <div className={operatorHeaderClass}>
          <div className="min-w-0">
            <span className={surfaceEyebrowClass}>{config.eyebrow}</span>
            <h1 className="mt-2 font-display text-[1.55rem] font-black leading-none text-desk-ink">{config.title}</h1>
            <p className="mt-3 text-[0.82rem] font-bold leading-relaxed text-desk-muted">{config.copy}</p>
          </div>
          <button type="button" className={miniLinkClass} onClick={() => setPage(config.tools[0].page)}>Open</button>
        </div>
        <div className={operatorSummaryClass}>
          {config.metrics.map((item) => (
            <OperatorMetric key={item.label} label={item.label} value={item.value} note={item.note} tone={item.tone} />
          ))}
        </div>
      </section>
      <section className={operatorWorkflowListClass}>
        {config.tools.map((tool, index) => (
          <WorkflowRow
            key={tool.title}
            icon={tool.icon}
            title={tool.title}
            note={tool.note}
            meta={tool.meta}
            primary={index === 0}
            onClick={() => setPage(tool.page)}
          />
        ))}
      </section>
    </div>
  );
}

function OperationsDashboard({ data, actions, setPage }) {
  const priority = [
    ...data.pending.slice(0, 2).map((row) => ({ row, label: 'Review', type: 'payment' })),
    ...data.arrivals.slice(0, 2).map((row) => ({ row, label: 'Check In', type: 'arrival' })),
    ...data.dueOut.slice(0, 2).map((row) => ({ row, label: 'Check Out', type: 'checkout' })),
  ].slice(0, 5);

  return (
    <div className={pageStackClass}>
      <section className={dashboardHeroClass}>
        <div>
          <span>Today at Amalfi</span>
          <h1>{priority.length || data.arrivals.length || data.pending.length} operational action{priority.length === 1 ? '' : 's'} ready.</h1>
          <p>Run arrivals, payments, room readiness, manual bookings, and guest replies without opening the full Admin Hub.</p>
        </div>
        <button type="button" className={heroInlineButtonClass} onClick={actions.refresh} disabled={data.loading}>
          <RefreshCcw size={15} />
          {data.loading ? 'Syncing' : 'Sync'}
        </button>
      </section>

      <section className={metricGridClass}>
        <MetricCard label="Arrivals" value={data.arrivals.length} note="Reserved today" />
        <MetricCard label="In House" value={data.inHouse.length} note="Checked in" tone="gold" />
        <MetricCard label="Payments" value={data.pending.length} note="Need review" tone="red" />
        <MetricCard label="Open Due" value={formatCurrency(data.totalDue)} note="Receivables" tone="blue" />
      </section>

      <section className={laneGridClass}>
        <LaneCard label="Arrive" value={data.arrivals.length} note="Check-ins" active={data.arrivals.length > 0} />
        <LaneCard label="Stay" value={data.inHouse.length} note="In house" active={data.inHouse.length > 0} />
        <LaneCard label="Leave" value={data.dueOut.length} note="Due out" active={data.dueOut.length > 0} />
      </section>

      <section className={panelClass}>
        <div className={panelHeaderClass}>
          <div className={panelTitleClass}>Priority Queue</div>
          <button type="button" className={miniLinkClass} onClick={() => setPage('movements')}>Open Desk</button>
        </div>
        {priority.length === 0 ? (
          <div className={emptyStateClass}>No urgent operational items in the current sync.</div>
        ) : (
          <div className={opsListClass}>
            {priority.map(({ row, label, type }) => (
              <BookingActionCard
                key={`${type}-${bookingRef(row)}`}
                row={row}
                actionLabel={label}
                actionTone={type === 'checkout' ? 'red' : 'green'}
                onAction={type === 'payment' ? () => setPage('verification') : type === 'checkout' ? actions.checkout : actions.checkIn}
                onPayment={actions.openPayment}
                busyRef={data.busyRef}
              />
            ))}
          </div>
        )}
      </section>

      <section className={quickActionGridClass}>
        <button type="button" className={quickActionCardClass} onClick={() => setPage('booking')}>
          <Plus size={18} />
          <strong>New Booking</strong>
          <span>Solo or multi-unit manual booking</span>
        </button>
        <button type="button" className={quickActionCardClass} onClick={() => setPage('rooms')}>
          <Home size={18} />
          <strong>Rooms</strong>
          <span>Readiness and special ops</span>
        </button>
        <button type="button" className={quickActionCardClass} onClick={() => setPage('verification')}>
          <CircleDollarSign size={18} />
          <strong>Verify</strong>
          <span>Receipt approval queue</span>
        </button>
        <button type="button" className={quickActionCardClass} onClick={() => setPage('pulse')}>
          <CircleDollarSign size={18} />
          <strong>Pulse</strong>
          <span>Financial pulse dashboard</span>
        </button>
        <button type="button" className={quickActionCardClass} onClick={() => setPage('chatbot')}>
          <MessageSquareText size={18} />
          <strong>Chatbot</strong>
          <span>Quick chats and categories</span>
        </button>
      </section>
    </div>
  );
}

function VerificationPage({ data, actions }) {
  const [selectedRef, setSelectedRef] = useState('');
  const selected = data.pending.find((row) => bookingRef(row) === selectedRef) || data.pending[0] || null;

  useEffect(() => {
    if (!selectedRef && data.pending[0]) {
      setSelectedRef(bookingRef(data.pending[0]));
    }
  }, [data.pending, selectedRef]);

  const handleDecision = (decision) => {
    if (!selected) return;
    const verb = decision === 'approve' ? 'approve this payment and reserve the booking' : 'reject this payment proof';
    if (window.confirm(`Confirm that you want to ${verb} for ${guestName(selected)}?`)) {
      actions.verify(selected, decision);
    }
  };

  return (
    <div className={pageStackClass}>
      <section className={compactHeroClass}>
        <h1>Payment Verification</h1>
        <p>Review uploaded proof before money counts as paid and before pending bookings become confirmed.</p>
      </section>

      <section className={metricGridClass}>
        <MetricCard label="Pending" value={data.pending.length} note="Need receipt review" tone="red" />
        <MetricCard label="Selected" value={selected ? formatCurrency(bookingPaid(selected)) : 'P0'} note={selected ? bookingRef(selected) : 'No receipt'} tone="gold" />
      </section>

      {data.pending.length === 0 ? (
        <section className={panelClass}>
          <div className={emptyStateClass}>All verifications are clear. No pending receipts need review right now.</div>
        </section>
      ) : (
        <section className={verificationLayoutClass}>
          <div className={verificationQueueClass}>
            {data.pending.map((row) => {
              const ref = bookingRef(row);
              const isActive = selected && bookingRef(selected) === ref;
              return (
                <button key={ref} type="button" className={cx(verificationListCardClass, isActive && verificationListCardActiveClass)} onClick={() => setSelectedRef(ref)}>
                  <span className="text-xs font-black text-desk-ink">{guestName(row)}</span>
                  <strong className="text-[1.05rem] font-black text-desk-red">{formatCurrency(bookingPaid(row))}</strong>
                  <small className="text-[0.72rem] font-bold text-desk-muted">{ref} - {formatDateShort(row.check_in)} to {formatDateShort(row.check_out)}</small>
                </button>
              );
            })}
          </div>

          {selected && (
            <article className={cx(opsCardClass, opsCardActionClass)}>
              <div className={financeHeroClass}>
                <div className={financeHeroTopClass}>
                  <div>
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.11em] text-[#f0d7aa]">Receipt Claim</div>
                    <strong className={financeAmountClass}>{formatCurrency(bookingPaid(selected))}</strong>
                  </div>
                  <span className="rounded-full border border-[#f0d7aa]/35 bg-white/10 px-3 py-1 text-[0.66rem] font-black uppercase text-[#fff8ec]">Pending</span>
                </div>
                <div className="mt-3 text-[0.78rem] font-bold leading-relaxed text-[#fff8ec]/75">{bookingRef(selected)} - {bookingUnits(selected)}</div>
              </div>

              <div className={cx(panelHeaderClass, 'mb-0 mt-4')}>
                <div>
                  <div className={panelTitleClass}>Receipt Review</div>
                  <strong className="mt-1 block text-sm font-black text-desk-ink">{guestName(selected)}</strong>
                </div>
                <span className={cx(statusPillBaseClass, statusPillToneClass.red)}>Pending</span>
              </div>
              <div className={verificationFactsClass}>
                <div className={metricCardClass}><span className={fieldLabelTextClass}>Reference</span><strong className="mt-1 block text-xs font-black text-desk-ink">{bookingRef(selected)}</strong></div>
                <div className={metricCardClass}><span className={fieldLabelTextClass}>Stay</span><strong className="mt-1 block text-xs font-black text-desk-ink">{formatDateShort(selected.check_in)} to {formatDateShort(selected.check_out)}</strong></div>
                <div className={metricCardClass}><span className={fieldLabelTextClass}>Booking</span><strong className="mt-1 block text-xs font-black text-desk-ink">{bookingUnits(selected)}</strong></div>
                <div className={metricCardClass}><span className={fieldLabelTextClass}>Paid Claim</span><strong className="mt-1 block text-xs font-black text-desk-ink">{formatCurrency(bookingPaid(selected))}</strong></div>
                <div className={metricCardClass}><span className={fieldLabelTextClass}>Total</span><strong className="mt-1 block text-xs font-black text-desk-ink">{formatCurrency(bookingTotal(selected))}</strong></div>
                <div className={metricCardClass}><span className={fieldLabelTextClass}>Balance</span><strong className="mt-1 block text-xs font-black text-desk-ink">{formatCurrency(bookingBalance(selected))}</strong></div>
              </div>
              <div className={receiptFrameClass}>
                {receiptUrl(selected) ? (
                  <a href={receiptUrl(selected)} target="_blank" rel="noopener noreferrer">
                    <img className="max-h-[360px] w-full object-contain" src={receiptUrl(selected)} alt={`Payment proof for ${bookingRef(selected)}`} />
                  </a>
                ) : (
                  <div className={emptyStateClass}>No receipt image is attached to this pending booking.</div>
                )}
              </div>
              <div className={actionRowClass}>
                <button type="button" className={cx(deskButtonBaseClass, deskButtonToneClass.green)} disabled={data.busyRef === bookingRef(selected)} onClick={() => handleDecision('approve')}>
                  {data.busyRef === bookingRef(selected) ? 'Working...' : 'Approve Payment'}
                </button>
                <button type="button" className={cx(deskButtonBaseClass, deskButtonToneClass.red)} disabled={data.busyRef === bookingRef(selected)} onClick={() => handleDecision('reject')}>
                  Reject
                </button>
              </div>
              <StatusBanner tone="info">Approving records the payment as verified and confirms the booking. Rejecting keeps the proof out of paid revenue.</StatusBanner>
            </article>
          )}
        </section>
      )}
    </div>
  );
}

function MovementsPage({ data, actions }) {
  const [mode, setMode] = useState('arrivals');
  const rows = mode === 'arrivals' ? data.arrivals : mode === 'inhouse' ? data.inHouse : data.dueOut;
  const selectedLabel = mode === 'arrivals' ? 'Arrivals' : mode === 'inhouse' ? 'In House' : 'Due Out';
  const selectedNote = mode === 'arrivals'
    ? 'Guests reserved for check-in today.'
    : mode === 'inhouse'
      ? 'Guests currently occupying units.'
      : 'Checked-in guests ready for checkout.';

  return (
    <div className={pageStackClass}>
      <section className={compactHeroClass}>
        <h1>Movement Desk</h1>
        <p>Check guests in, check balances, and complete checkouts from the phone workflow.</p>
      </section>
      <section className={laneGridClass}>
        <button type="button" className={cx(laneCardClass, mode === 'arrivals' && laneCardActiveClass)} onClick={() => setMode('arrivals')}>
          <span className={laneLabelClass}>Arrive</span>
          <strong className={laneValueClass}>{data.arrivals.length}</strong>
          <small className={laneNoteClass}>Check-ins</small>
        </button>
        <button type="button" className={cx(laneCardClass, mode === 'inhouse' && laneCardActiveClass)} onClick={() => setMode('inhouse')}>
          <span className={laneLabelClass}>Stay</span>
          <strong className={laneValueClass}>{data.inHouse.length}</strong>
          <small className={laneNoteClass}>In house</small>
        </button>
        <button type="button" className={cx(laneCardClass, mode === 'dueout' && laneCardActiveClass)} onClick={() => setMode('dueout')}>
          <span className={laneLabelClass}>Leave</span>
          <strong className={laneValueClass}>{data.dueOut.length}</strong>
          <small className={laneNoteClass}>Due out</small>
        </button>
      </section>
      <section className={panelClass}>
        <div className={panelHeaderClass}>
          <div>
            <div className={panelTitleClass}>{selectedLabel}</div>
            <p className="m-0 mt-1 text-[0.78rem] font-bold leading-relaxed text-desk-muted">{selectedNote}</p>
          </div>
          <div className={panelCounterClass}>{rows.length}</div>
        </div>
      </section>
      <section className={opsListClass}>
        {rows.length === 0 ? (
          <div className={panelClass}><div className={emptyStateClass}>No records in this movement lane.</div></div>
        ) : rows.map((row) => (
          <BookingActionCard
            key={`${mode}-${bookingRef(row)}`}
            row={row}
            actionLabel={mode === 'dueout' ? 'Check Out' : mode === 'arrivals' ? 'Check In' : 'Open'}
            actionTone={mode === 'dueout' ? 'red' : 'green'}
            onAction={mode === 'dueout' ? actions.checkout : mode === 'arrivals' ? actions.checkIn : null}
            onPayment={actions.openPayment}
            busyRef={data.busyRef}
          />
        ))}
      </section>
    </div>
  );
}

function RoomsOpsPage({ data, actions }) {
  const [filter, setFilter] = useState('attention');
  const rooms = data.units.filter((unit) => {
    if (filter === 'all') return true;
    const status = String(unit.unit_status || 'Available');
    return !/available/i.test(status) || unit.active_booking;
  }).slice(0, filter === 'all' ? 60 : 18);
  const occupiedRooms = data.units.filter((unit) => unit.active_booking).length;

  return (
    <div className={pageStackClass}>
      <section className={roomOpsHeroClass}>
        <div className={panelHeaderClass}>
          <div>
            <div className={surfaceEyebrowClass}>Room Operations</div>
            <h1 className="m-0 mt-1 font-display text-[1.65rem] font-semibold leading-tight text-desk-deep">Room + Special Ops</h1>
            <p className="m-0 mt-2 text-[0.86rem] font-semibold leading-relaxed text-desk-muted">Mobile-safe room readiness, maintenance, day-tour, and camping controls.</p>
          </div>
          <div className={panelCounterClass}>{rooms.length}</div>
        </div>
      </section>

      <section className={roomStatusGridClass}>
        <div className={roomStatusTileClass}>
          <span className={laneLabelClass}>Ready</span>
          <strong className={cx(roomStatusValueClass, metricToneClass.green)}>{data.readyRooms}</strong>
          <small className={laneNoteClass}>Bookable</small>
        </div>
        <div className={roomStatusTileClass}>
          <span className={laneLabelClass}>Clean</span>
          <strong className={cx(roomStatusValueClass, metricToneClass.blue)}>{data.cleaningRooms}</strong>
          <small className={laneNoteClass}>Inspect</small>
        </div>
        <div className={roomStatusTileClass}>
          <span className={laneLabelClass}>Block</span>
          <strong className={cx(roomStatusValueClass, metricToneClass.red)}>{data.blockedRooms}</strong>
          <small className={laneNoteClass}>Maint.</small>
        </div>
        <div className={roomStatusTileClass}>
          <span className={laneLabelClass}>Stay</span>
          <strong className={cx(roomStatusValueClass, metricToneClass.gold)}>{occupiedRooms}</strong>
          <small className={laneNoteClass}>In house</small>
        </div>
      </section>

      <div className={tabRailTwoClass}>
        <button type="button" className={cx(tabButtonClass, filter === 'attention' && tabButtonActiveClass)} onClick={() => setFilter('attention')}>Needs Attention</button>
        <button type="button" className={cx(tabButtonClass, filter === 'all' && tabButtonActiveClass)} onClick={() => setFilter('all')}>All Units</button>
      </div>
      <section className={roomCardListClass}>
        {rooms.length === 0 ? <div className={panelClass}><div className={emptyStateClass}>No room follow-up items right now.</div></div> : rooms.map((unit) => {
          const meta = roomStatusMeta(unit.unit_status);
          const Icon = meta.Icon;
          return (
            <article key={unit.unit_id} className={cx(roomCardClass, meta.tone !== 'green' && roomCardAttentionClass)}>
              <div className={cx(roomIconBaseClass, roomIconToneClass[meta.tone] || roomIconToneClass.green)}><Icon size={16} /></div>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <strong className="block text-sm font-black text-desk-ink">{unit.unit_label || unit.unit_id}</strong>
                  <span className={cx(statusPillBaseClass, statusPillToneClass[meta.tone] || statusPillToneClass.green)}>{meta.label}</span>
                </div>
                <p className="mt-1 text-[0.78rem] font-bold text-desk-muted">{unit.active_booking ? `${unit.active_booking.guest_name} in house` : unit.room_type || unit.marketing_name}</p>
              </div>
              <select
                className={roomSelectClass}
                value={unit.unit_status || 'Available'}
                onChange={(event) => actions.updateUnitStatus(unit.unit_id, event.target.value)}
                disabled={data.busyRef === unit.unit_id}
              >
                <option value="Available">Ready</option>
                <option value="Requires Cleaning">Cleaning</option>
                <option value="Inspection">Inspect</option>
                <option value="Maintenance">Blocked</option>
              </select>
            </article>
          );
        })}
      </section>
      <section className={panelClass}>
        <div className={panelHeaderClass}>
          <div className={panelTitleClass}>Special Booking Queue</div>
          <div className={panelCounterClass}>{data.special.length}</div>
        </div>
        {data.special.slice(0, 6).map((row) => (
          <BookingActionCard key={bookingRef(row)} row={row} actionLabel={row.status === 'PENDING_VERIFICATION' ? 'Verify' : null} onAction={() => actions.verify(row, 'approve')} busyRef={data.busyRef} />
        ))}
      </section>
    </div>
  );
}

function UnitCheckerPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [windowStart, setWindowStart] = useState(today);
  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get('/api/v1/admin/occupancy')
      .then((data) => {
        if (!active) return;
        setUnits(data.units || []);
        setBookings(data.bookings || []);
      })
      .catch((fetchError) => {
        if (!active) return;
        setUnits([]);
        setBookings([]);
        setError(fetchError.message || 'Could not load unit checker.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const dateWindow = useMemo(() => buildDateWindow(windowStart, 7), [windowStart]);
  const categories = useMemo(() => {
    const keys = Array.from(new Set(units.map((unit) => getUnitCategory(unit)))).filter(Boolean);
    return ['all', ...keys];
  }, [units]);
  const bookingsByUnit = useMemo(() => bookings.reduce((acc, booking) => {
    if (!booking?.unit_id) return acc;
    if (!acc[booking.unit_id]) acc[booking.unit_id] = [];
    acc[booking.unit_id].push(booking);
    return acc;
  }, {}), [bookings]);
  const visibleUnits = useMemo(() => units
    .filter((unit) => selectedCategory === 'all' || getUnitCategory(unit) === selectedCategory)
    .sort((left, right) => {
      const leftType = String(left.room_type || '');
      const rightType = String(right.room_type || '');
      if (leftType !== rightType) return leftType.localeCompare(rightType);
      return String(left.unit_label || left.unit_id).localeCompare(String(right.unit_label || right.unit_id), undefined, { numeric: true });
    }), [selectedCategory, units]);
  const groupedUnits = useMemo(() => visibleUnits.reduce((acc, unit) => {
    const roomType = String(unit.room_type || '').trim();
    const key = roomType && !/^other$/i.test(roomType) ? roomType : getCategoryLabel(getUnitCategory(unit));
    if (!acc[key]) acc[key] = [];
    acc[key].push(unit);
    return acc;
  }, {}), [visibleUnits]);
  const windowBooked = useMemo(() => visibleUnits.filter((unit) => {
    const unitBookings = bookingsByUnit[unit.unit_id] || [];
    return dateWindow.some((day) => unitBookings.some((booking) => bookingCoversDate(booking, day.iso)));
  }).length, [bookingsByUnit, dateWindow, visibleUnits]);

  return (
    <div className={pageStackClass}>
      <section className={compactHeroClass}>
        <h1>Unit Quick Checker</h1>
        <p>Seven-day occupancy scan for room assignment, walk-ins, and booking calls.</p>
      </section>

      <section className={timelineControlClass}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
          <button type="button" className={navPillClass} onClick={() => setWindowStart((current) => addDays(current, -7))}>Prev</button>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Start</span>
            <input className={fieldControlClass} type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value || today)} />
          </label>
          <button type="button" className={navPillClass} onClick={() => setWindowStart((current) => addDays(current, 7))}>Next</button>
        </div>
        <div className={cx(filterRailClass, 'unit-checker-categorybar mt-3')}>
          {categories.map((category) => {
            const count = category === 'all' ? units.length : units.filter((unit) => getUnitCategory(unit) === category).length;
            return (
              <button key={category} type="button" className={cx(filterButtonClass, selectedCategory === category && filterButtonActiveClass)} onClick={() => setSelectedCategory(category)}>
                {getCategoryLabel(category)} <span className="ml-1 opacity-75">{count}</span>
              </button>
            );
          })}
        </div>
        <div className={timelineLegendClass}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-desk-green/10 px-2.5 py-1 text-desk-deep"><span className={cx(legendDotClass, 'border-desk-green bg-white')} />Open</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-desk-green/10 px-2.5 py-1 text-desk-deep"><span className={cx(legendDotClass, 'border-desk-green bg-desk-green')} />Booked</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f0e5] px-2.5 py-1 text-desk-muted"><span className={cx(legendDotClass, 'border-desk-gold bg-[#f7f0e5]')} />Weekend</span>
        </div>
      </section>

      <section className={metricGridClass}>
        <MetricCard label="Showing" value={visibleUnits.length} note="Units" />
        <MetricCard label="Booked" value={windowBooked} note="In 7 days" tone="blue" />
      </section>

      {loading && <div className={panelClass}><div className={emptyStateClass}>Loading unit checker...</div></div>}
      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      {!loading && !error && visibleUnits.length === 0 && <div className={panelClass}><div className={emptyStateClass}>No units match this category.</div></div>}

      {!loading && !error && visibleUnits.length > 0 && (
        <section className={timelinePanelClass}>
          <div className={panelHeaderClass}>
            <div>
              <div className={panelTitleClass}>Seven-Day Board</div>
              <p className="m-0 mt-1 text-[0.78rem] font-bold leading-relaxed text-desk-muted">{getCategoryLabel(selectedCategory)} units from {formatDateShort(windowStart)}</p>
            </div>
            <div className={panelCounterClass}>{visibleUnits.length}</div>
          </div>
          <div className={timelineGridClass}>
            <div className={timelineHeadCellClass}>Unit</div>
            <div className={timelineCellsClass}>
            {dateWindow.map((day) => (
              <div key={day.iso} className={cx(timelineHeadCellClass, day.weekend && 'bg-[#f0e7d8]')}>
                <strong>{new Date(`${day.iso}T00:00:00`).getDate()}</strong>
                <span className="block">{day.label}</span>
              </div>
            ))}
            </div>
          </div>
          {Object.entries(groupedUnits).map(([roomType, roomUnits]) => (
            <div key={roomType} className="mt-3 grid gap-2">
              <div className={cx(statusPillBaseClass, statusPillToneClass.gold)}>{roomType}</div>
              {roomUnits.map((unit) => (
                <div key={unit.unit_id} className={timelineGridClass}>
                  <div className={timelineUnitClass}>
                    <strong className="block truncate text-[0.76rem] font-black text-desk-ink">{unit.unit_label || unit.unit_id}</strong>
                    <span className="mt-1 block text-[0.62rem] font-bold text-desk-muted">{unit.absolute_max_pax || unit.max_pax || '-'} pax</span>
                  </div>
                  <div className={timelineCellsClass}>
                  {dateWindow.map((day) => {
                    const booking = (bookingsByUnit[unit.unit_id] || []).find((candidate) => bookingCoversDate(candidate, day.iso));
                    return (
                      <div key={`${unit.unit_id}-${day.iso}`} className={cx(timelineCellBaseClass, booking ? timelineCellBookedClass : timelineCellOpenClass, day.weekend && !booking && 'bg-[#f7f0e5]')} title={booking ? `${guestName(booking)} - ${bookingRef(booking)}` : `${unit.unit_label} open on ${day.iso}`}>
                        {booking ? <span className="size-1.5 rounded-full bg-[#fff8ec]" aria-hidden="true" /> : ''}
                      </div>
                    );
                  })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function PulsePage({ data }) {
  const collectionRate = data.grossBilled > 0 ? Math.round((data.netPaid / data.grossBilled) * 100) : 100;
  const receivableRate = data.grossBilled > 0 ? Math.round((data.totalDue / data.grossBilled) * 100) : 0;
  const balanceRows = data.ledger.filter((row) => bookingBalance(row) > 0);

  return (
    <div className={pageStackClass}>
      <section className={compactHeroClass}>
        <h1>Pulse</h1>
        <p>Mini financial dashboard for active desk decisions: cash collected, billed value, open balances, and receipt pressure.</p>
      </section>
      <section className={pulseCardClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <strong className="font-display text-[1.1rem] font-semibold">Collection Pulse</strong>
            <p className="mt-1 text-[0.82rem] font-semibold leading-relaxed text-[#fff8ec]/75">Cash-view signal for active operations, not full accounting reports.</p>
          </div>
          <span className="text-[1.45rem] font-black text-[#f4d79f]">{collectionRate}%</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
          <div className={pulseRateClass}>
            <div className="text-[0.68rem] font-black uppercase tracking-[0.11em] text-[#f0d7aa]">Collected</div>
            <strong className="mt-2 block text-[2rem] font-black leading-none text-[#fff8ec]">{formatCurrency(data.netPaid)}</strong>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/15"><span className="block h-full rounded-full bg-[#f4d79f]" style={{ width: `${Math.min(100, collectionRate)}%` }} /></div>
          </div>
          <div className={pulseRateClass}>
            <div className="text-[0.68rem] font-black uppercase tracking-[0.11em] text-[#f0d7aa]">Open Due</div>
            <strong className="mt-2 block text-[2rem] font-black leading-none text-[#f4d79f]">{formatCurrency(data.totalDue)}</strong>
            <small className="mt-3 block text-[0.74rem] font-bold text-[#fff8ec]/70">{receivableRate}% of billed value</small>
          </div>
        </div>
      </section>
      <section className={metricGridClass}>
        <MetricCard label="Collection" value={`${collectionRate}%`} note="Paid vs billed" />
        <MetricCard label="Receivable" value={`${receivableRate}%`} note="Due vs billed" tone={receivableRate > 25 ? 'red' : 'blue'} />
        <MetricCard label="Arrivals" value={data.arrivals.length} note="Today" tone="gold" />
        <MetricCard label="Ready Rooms" value={data.readyRooms} note="Available now" />
      </section>
      <section className={panelClass}>
        <div className={panelHeaderClass}>
          <div className={panelTitleClass}>Balance Watch</div>
          <div className={panelCounterClass}>{balanceRows.length}</div>
        </div>
        <div className={opsListClass}>
        {balanceRows.slice(0, 5).map((row) => (
          <article key={bookingRef(row)} className={cx(pulseWatchCardClass, pulseWatchDueClass)}>
            <div className={cx(panelHeaderClass, 'mb-0')}>
              <div>
                <strong className="block text-sm font-black text-desk-ink">{guestName(row)}</strong>
                <p className="m-0 mt-1 text-[0.76rem] font-bold leading-relaxed text-desk-muted">{bookingRef(row)} - {bookingUnits(row)}</p>
              </div>
              <span className={cx(statusPillBaseClass, statusPillToneClass.red)}>{formatCurrency(bookingBalance(row))}</span>
            </div>
          </article>
        ))}
        </div>
        {balanceRows.length === 0 && (
          <div className={emptyStateClass}>No open balances in the current sync.</div>
        )}
      </section>
    </div>
  );
}

function ChatbotControlPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [state, setState] = useState({ loading: true, threadLoading: false, error: '' });
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [draftState, setDraftState] = useState({ loading: false, error: '' });

  const loadConversations = async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await api.get('/api/v1/admin/chatbot-conversations?limit=24');
      const nextConversations = data.conversations || [];
      setConversations(nextConversations);
      setSelectedId((current) => current || nextConversations[0]?.sender_id || '');
      setState((current) => ({ ...current, loading: false, error: '' }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Could not load Chatbot Control.' }));
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let active = true;
    setState((current) => ({ ...current, threadLoading: true }));
    api.get(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}?limit=80`)
      .then((data) => {
        if (!active) return;
        setMessages(data.messages || []);
      })
      .catch((error) => {
        if (!active) return;
        setState((current) => ({ ...current, error: error.message || 'Could not load this chat thread.' }));
      })
      .finally(() => {
        if (!active) return;
        setState((current) => ({ ...current, threadLoading: false }));
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectedConversation = conversations.find((item) => item.sender_id === selectedId) || null;
  const operatorCount = conversations.filter((conversation) => {
    const category = String(conversation.category || '').toUpperCase();
    return ['HOT_BOOKING_LEAD', 'PAYMENT_SENT', 'COMPLAINT', 'REBOOKING_OR_CANCELLATION', 'NEEDS_HUMAN', 'MANUAL_ACTIVE'].includes(category) || conversation.manual_active;
  }).length;
  const paymentCount = conversations.filter((conversation) => String(conversation.category || '').toUpperCase() === 'PAYMENT_SENT').length;
  const botCount = conversations.filter((conversation) => ['LOW_PRIORITY_FAQ', 'SPAM_OR_NONSENSE'].includes(String(conversation.category || '').toUpperCase())).length;
  const filteredConversations = conversations.filter((conversation) => {
    if (filter === 'all') return true;
    const category = String(conversation.category || '').toUpperCase();
    if (filter === 'operator') {
      return ['HOT_BOOKING_LEAD', 'PAYMENT_SENT', 'COMPLAINT', 'REBOOKING_OR_CANCELLATION', 'NEEDS_HUMAN', 'MANUAL_ACTIVE'].includes(category) || conversation.manual_active;
    }
    if (filter === 'bot') return ['LOW_PRIORITY_FAQ', 'SPAM_OR_NONSENSE'].includes(category);
    return category === filter;
  });

  const setCategory = async (category) => {
    if (!selectedId) return;
    try {
      await runAdminDeskRequest(buildAdminDeskRequest('chatbotCategory', { senderId: selectedId, category }));
      setConversations((current) => current.map((conversation) => (
        conversation.sender_id === selectedId
          ? { ...conversation, category, category_source: 'manual' }
          : conversation
      )));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || 'Could not update category.' }));
    }
  };

  const buildDraft = async () => {
    if (!message.trim()) return;
    setDraftState({ loading: true, error: '' });
    try {
      const response = await api.post('/api/v1/admin/response-helper/draft', { message, tone: 'friendly' });
      setDraft(response.reply || response.draft || response.message || response.response || '');
      setDraftState({ loading: false, error: '' });
    } catch (error) {
      setDraftState({ loading: false, error: error.message || 'Could not build a draft.' });
    }
  };

  return (
    <div className={pageStackClass}>
      <section className={compactHeroClass}>
        <h1>Chatbot Control</h1>
        <p>Quick mobile mirror of Chatbot Monitor: active chats, categories, and fast response drafting.</p>
      </section>
      {state.error && <StatusBanner tone="error">{state.error}</StatusBanner>}
      <section className={chatbotTriageGridClass}>
        <button type="button" className={cx(laneCardClass, filter === 'operator' && laneCardActiveClass)} onClick={() => setFilter('operator')}>
          <span className={laneLabelClass}>Human</span>
          <strong className={laneValueClass}>{operatorCount}</strong>
          <small className={laneNoteClass}>Triage</small>
        </button>
        <button type="button" className={cx(laneCardClass, filter === 'PAYMENT_SENT' && laneCardActiveClass)} onClick={() => setFilter('PAYMENT_SENT')}>
          <span className={laneLabelClass}>Pay</span>
          <strong className={laneValueClass}>{paymentCount}</strong>
          <small className={laneNoteClass}>Receipts</small>
        </button>
        <button type="button" className={cx(laneCardClass, filter === 'bot' && laneCardActiveClass)} onClick={() => setFilter('bot')}>
          <span className={laneLabelClass}>Bot</span>
          <strong className={laneValueClass}>{botCount}</strong>
          <small className={laneNoteClass}>Low touch</small>
        </button>
      </section>
      <div className={tabRailClass}>
        {[
          ['all', `All ${conversations.length}`],
          ['operator', 'Operator'],
          ['bot', 'Bot'],
          ['PAYMENT_SENT', 'Payments']
        ].map(([id, label]) => (
          <button key={id} type="button" className={cx(tabButtonClass, filter === id && tabButtonActiveClass)} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <section className={chatbotLayoutClass}>
        <div className={cx(panelClass, 'grid content-start gap-2')}>
          <div className={cx(panelHeaderClass, 'mb-1')}>
            <div className={panelTitleClass}>Quick Chats</div>
            <button type="button" className={miniLinkClass} onClick={loadConversations}>{state.loading ? 'Loading' : 'Refresh'}</button>
          </div>
          {filteredConversations.length === 0 ? (
            <div className={emptyStateClass}>No chatbot threads match this filter.</div>
          ) : filteredConversations.map((conversation) => (
            <button
              key={conversation.sender_id}
              type="button"
              className={cx(chatbotThreadCardClass, selectedId === conversation.sender_id && chatbotThreadCardActiveClass)}
              onClick={() => setSelectedId(conversation.sender_id)}
            >
              <div className="flex items-start justify-between gap-2">
                <strong className="text-sm font-black text-desk-ink">{conversation.sender_id}</strong>
                <span className={cx(statusPillBaseClass, statusPillToneClass[String(conversation.category || '').toUpperCase() === 'PAYMENT_SENT' ? 'gold' : conversation.manual_active ? 'red' : 'green'])}>
                  {conversation.manual_active ? 'Human' : 'Chat'}
                </span>
              </div>
              <span className="text-[0.72rem] font-black uppercase tracking-normal text-desk-green">{getChatbotCategoryLabel(conversation.category)}</span>
              <small className="text-[0.76rem] font-bold leading-relaxed text-desk-muted">{conversation.last_preview || conversation.last_intent || 'No preview available'}</small>
            </button>
          ))}
        </div>
        <div className={cx(panelClass, 'chatbot-thread-detail')}>
          <div className={panelHeaderClass}>
            <div>
              <div className={panelTitleClass}>Category</div>
              <strong className="mt-1 block text-sm font-black text-desk-ink">{selectedConversation ? selectedConversation.sender_id : 'Select a chat'}</strong>
              {selectedConversation && <span className="mt-1 block text-[0.7rem] font-black uppercase tracking-normal text-desk-green">{getChatbotCategoryLabel(selectedConversation.category)}</span>}
            </div>
            <select
              className={cx(fieldControlClass, 'max-w-[190px]')}
              value={selectedConversation?.category || 'LOW_PRIORITY_FAQ'}
              onChange={(event) => setCategory(event.target.value)}
              disabled={!selectedConversation}
            >
              {CHATBOT_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className={chatbotMessageListClass}>
            {state.threadLoading ? (
              <div className={emptyStateClass}>Loading chat...</div>
            ) : messages.length === 0 ? (
              <div className={emptyStateClass}>No messages loaded for this chat.</div>
            ) : messages.slice(-8).map((item, index) => (
              <div key={`${item.timestamp || index}-${index}`} className={cx(chatbotMessageClass, item.direction === 'outbound' && chatbotMessageOutboundClass)}>
                <span className="block text-[0.62rem] font-black uppercase tracking-normal text-desk-muted">{item.direction === 'outbound' ? 'Amalfi' : 'Guest'}</span>
                <p className="m-0 mt-1 leading-relaxed">{item.text || item.bot_answer || item.intent || 'No message text'}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={panelClass}>
        <div className={panelHeaderClass}>
          <div className={panelTitleClass}>Quick Guest Reply</div>
          <Bot size={18} />
        </div>
        <label className={fieldClassName}>
          <span className={fieldLabelTextClass}>Guest Message</span>
          <textarea className={fieldControlClass} rows="5" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Paste the guest's availability or policy question..." />
        </label>
        <button type="button" className={saveButtonClass} onClick={buildDraft} disabled={draftState.loading || !message.trim()}>
          {draftState.loading ? 'Drafting...' : 'Generate Draft'}
        </button>
        {draftState.error && <StatusBanner tone="error">{draftState.error}</StatusBanner>}
        {draft && (
          <div className="mt-4 rounded-[18px] border border-desk-line bg-[#f5eee2]/70 p-4">
            <div className={panelTitleClass}>Suggested Reply</div>
            <p className="m-0 mt-2 text-[0.86rem] font-semibold leading-relaxed text-desk-ink">{draft}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function PaymentSheet({ row, onClose, onSubmit, busy }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');

  useEffect(() => {
    setAmount(row ? String(Math.ceil(bookingBalance(row))) : '');
  }, [row]);

  if (!row) return null;

  return (
    <div className={sheetBackdropClass} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cx(sheetClass, sheetNarrowClass)}>
        <div className={panelHeaderClass}>
          <div>
            <div className={panelTitleClass}>Record Payment</div>
            <strong className="mt-1 block text-sm font-black text-desk-ink">{guestName(row)}</strong>
          </div>
          <button type="button" className={miniLinkClass} onClick={onClose}>Close</button>
        </div>
        <div className={sheetSummaryClass}>
          <div>
            <span className={fieldLabelTextClass}>Balance</span>
            <strong className="mt-1 block text-lg font-black text-desk-red">{formatCurrency(bookingBalance(row))}</strong>
          </div>
          <div>
            <span className={fieldLabelTextClass}>Paid</span>
            <strong className="mt-1 block text-lg font-black text-desk-deep">{formatCurrency(bookingPaid(row))}</strong>
          </div>
          <div className="col-span-2">
            <span className={fieldLabelTextClass}>Reference</span>
            <strong className="mt-1 block text-sm font-black text-desk-ink">{bookingRef(row)} - {formatDateShort(row.check_in)} to {formatDateShort(row.check_out)}</strong>
          </div>
        </div>
        <StatusBanner tone="info">Manual payments are recorded as verified admin entries. Payment proof uploads still use the verification queue.</StatusBanner>
        <label className={cx(fieldClassName, 'mt-4')}>
          <span className={fieldLabelTextClass}>Amount</span>
          <input className={fieldControlClass} type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className={cx(fieldClassName, 'mt-3')}>
          <span className={fieldLabelTextClass}>Method</span>
          <select className={fieldControlClass} value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="Cash">Cash</option>
            <option value="GCash">GCash</option>
            <option value="Bank Transfer">Bank Transfer</option>
          </select>
        </label>
        <button type="button" className={saveButtonClass} disabled={busy || Number(amount) <= 0} onClick={() => onSubmit(row, amount, method)}>
          {busy ? 'Recording...' : 'Record Payment'}
        </button>
      </section>
    </div>
  );
}

function LedgerEditSheet({ row, onClose, onSubmit, busy }) {
  const [draft, setDraft] = useState({
    guest_name: '',
    phone: '',
    email: '',
    status: 'RESERVED',
    booking_source: '',
    notes: ''
  });

  useEffect(() => {
    setDraft({
      guest_name: guestName(row || {}),
      phone: row?.phone || '',
      email: row?.email || '',
      status: row?.status || 'RESERVED',
      booking_source: row?.booking_source || '',
      notes: row?.notes || ''
    });
  }, [row]);

  if (!row) return null;

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className={sheetBackdropClass} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cx(sheetClass, sheetWideClass)}>
        <div className={panelHeaderClass}>
          <div>
            <div className={panelTitleClass}>Edit Booking</div>
            <strong className="mt-1 block text-sm font-black text-desk-ink">{bookingRef(row)}</strong>
          </div>
          <button type="button" className={miniLinkClass} onClick={onClose}>Close</button>
        </div>
        <div className={sheetSummaryClass}>
          <div>
            <span className={fieldLabelTextClass}>Stay</span>
            <strong className="mt-1 block text-sm font-black text-desk-ink">{formatDateShort(row.check_in)} to {formatDateShort(row.check_out)}</strong>
          </div>
          <div>
            <span className={fieldLabelTextClass}>Balance</span>
            <strong className="mt-1 block text-sm font-black text-desk-red">{formatCurrency(bookingBalance(row))}</strong>
          </div>
          <div className="col-span-2">
            <span className={fieldLabelTextClass}>Units</span>
            <strong className="mt-1 block text-sm font-black text-desk-ink">{bookingUnits(row)}</strong>
          </div>
        </div>
        <StatusBanner tone="info">Mobile ledger edits are limited to guest/contact/status/source/notes. Use Admin Hub for date, unit, item, and pricing edits.</StatusBanner>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Guest Name</span>
            <input className={fieldControlClass} value={draft.guest_name} onChange={(event) => updateDraft('guest_name', event.target.value)} />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Status</span>
            <select className={fieldControlClass} value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="RESERVED">Reserved</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Phone</span>
            <input className={fieldControlClass} value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} />
          </label>
          <label className={fieldClassName}>
            <span className={fieldLabelTextClass}>Email</span>
            <input className={fieldControlClass} value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
          </label>
          <label className={cx(fieldClassName, 'sm:col-span-2')}>
            <span className={fieldLabelTextClass}>Booking Source</span>
            <input className={fieldControlClass} value={draft.booking_source} onChange={(event) => updateDraft('booking_source', event.target.value)} />
          </label>
          <label className={cx(fieldClassName, 'sm:col-span-2')}>
            <span className={fieldLabelTextClass}>Notes</span>
            <textarea className={fieldControlClass} rows="3" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} />
          </label>
        </div>
        <button type="button" className={saveButtonClass} disabled={busy || !draft.guest_name.trim()} onClick={() => onSubmit(row, draft)}>
          {busy ? 'Saving...' : 'Save Light Edit'}
        </button>
      </section>
    </div>
  );
}

export function App() {
  const [page, setPage] = useState('dashboard');
  const [serviceStatus, setServiceStatus] = useState({ loading: true, enabled: true, error: '' });
  const [opsData, setOpsData] = useState({
    ledger: [],
    pending: [],
    receivables: [],
    units: [],
    special: [],
    loading: true,
    error: '',
    busyRef: ''
  });
  const [paymentRow, setPaymentRow] = useState(null);
  const [ledgerEditRow, setLedgerEditRow] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page]);

  useEffect(() => {
    let active = true;
    api.get('/api/v1/admin/settings')
      .then((settings) => {
        if (!active) return;
        setServiceStatus({
          loading: false,
          enabled: settings.is_admin_desk_enabled !== 'false',
          error: ''
        });
      })
      .catch((error) => {
        if (!active) return;
        setServiceStatus({
          loading: false,
          enabled: true,
          error: error.message || 'Could not verify Admin Desk status.'
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshOps = React.useCallback(async () => {
    setOpsData((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [ledgerData, pendingData, receivablesData, unitsData, specialData] = await Promise.all([
        api.get('/api/v1/admin/ledger'),
        api.get('/api/v1/admin/bookings/pending'),
        api.get('/api/v1/admin/financials/receivables'),
        api.get('/api/v1/admin/units'),
        api.get('/api/v1/admin/special-bookings')
      ]);
      setOpsData((current) => ({
        ...current,
        ledger: ledgerData.ledger || [],
        pending: pendingData.pending || [],
        receivables: receivablesData.receivables || [],
        units: unitsData.units || [],
        special: specialData.special_bookings || [],
        loading: false,
        error: ''
      }));
    } catch (error) {
      setOpsData((current) => ({ ...current, loading: false, error: error.message || 'Could not sync operations data.' }));
    }
  }, []);

  useEffect(() => {
    refreshOps();
  }, [refreshOps]);

  const withBusy = async (ref, task) => {
    setOpsData((current) => ({ ...current, busyRef: ref }));
    try {
      await task();
      await refreshOps();
    } catch (error) {
      window.alert(error.message || 'Operation failed.');
    } finally {
      setOpsData((current) => ({ ...current, busyRef: '' }));
    }
  };

  const actions = {
    refresh: refreshOps,
    checkIn: (row) => withBusy(bookingRef(row), () => runAdminDeskRequest(buildAdminDeskRequest('checkIn', { row }))),
    checkout: (row) => withBusy(bookingRef(row), () => runAdminDeskRequest(buildAdminDeskRequest('checkout', { row }))),
    verify: (row, decision) => withBusy(bookingRef(row), () => runAdminDeskRequest(buildAdminDeskRequest('verify', { row, decision }))),
    updateUnitStatus: (unitId, status) => withBusy(unitId, () => runAdminDeskRequest(buildAdminDeskRequest('unitStatus', { unitId, status }))),
    openPayment: (row) => setPaymentRow(row),
    openLedgerEdit: (row) => setLedgerEditRow(row),
    saveLedgerEdit: (row, draft) => withBusy(bookingRef(row), async () => {
      await runAdminDeskRequest(buildAdminDeskRequest('saveLedgerEdit', { row, draft }));
      setLedgerEditRow(null);
    }),
    recordPayment: (row, amount, method) => withBusy(bookingRef(row), async () => {
      await runAdminDeskRequest(buildAdminDeskRequest('recordPayment', { row, amount, method }));
      setPaymentRow(null);
    })
  };

  const derivedOps = useMemo(() => {
    const ledger = opsData.ledger || [];
    const arrivals = ledger.filter(isTodayArrival);
    const inHouse = ledger.filter(isInHouse);
    const dueOut = ledger.filter(isDueOut);
    const totalDue = (opsData.receivables || []).reduce((sum, row) => sum + bookingBalance(row), 0);
    const grossBilled = ledger.reduce((sum, row) => sum + bookingTotal(row), 0);
    const netPaid = ledger.reduce((sum, row) => sum + bookingPaid(row), 0);
    const readyRooms = (opsData.units || []).filter((unit) => String(unit.unit_status || 'Available') === 'Available' && !unit.active_booking).length;
    const cleaningRooms = (opsData.units || []).filter((unit) => /clean|dirty|inspection/i.test(String(unit.unit_status || ''))).length;
    const blockedRooms = (opsData.units || []).filter((unit) => /maintenance/i.test(String(unit.unit_status || ''))).length;
    return {
      ...opsData,
      arrivals,
      inHouse,
      dueOut,
      totalDue,
      grossBilled,
      netPaid,
      readyRooms,
      cleaningRooms,
      blockedRooms
    };
  }, [opsData]);
  const activeSection = PAGE_SECTION_BY_ID[page] || 'dashboard';
  const currentPageLabel = PAGE_LABEL_BY_ID[page] || 'Desk';

  if (serviceStatus.loading) {
    return (
      <div className={serviceShellClass}>
        <section className={servicePanelClass}>
          <LoaderCircle size={24} className="spin-icon" />
          <h1 className="mb-2 mt-0 text-[1.35rem] font-black">Checking Admin Desk status</h1>
          <p className="m-0 leading-relaxed text-desk-muted">Connecting to Amalfi Hub controls.</p>
        </section>
      </div>
    );
  }

  if (!serviceStatus.enabled) {
    return (
      <div className={serviceShellClass}>
        <section className={servicePanelClass}>
          <AlertTriangle size={28} className="mx-auto mb-3 text-desk-red" />
          <h1 className="mb-2 mt-0 text-[1.35rem] font-black">Admin Desk is paused</h1>
          <p className="m-0 leading-relaxed text-desk-muted">This customer-facing booking tool has been turned off from Admin Hub. Use the main Admin Hub to re-enable it when operations are clear.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <header className={topbarClass} style={topbarStyle}>
        <div className={brandClass}>
          <div className={brandMarkClass}>
            <img src={HEADER_LOGO_URL} alt="" className="size-full object-cover" />
          </div>
          <div>
            <div className={brandTitleClass}>Amalfi Admin Desk</div>
            <div className={brandSubClass}>{currentPageLabel}</div>
          </div>
        </div>
        <button type="button" className={syncButtonClass} onClick={refreshOps} disabled={derivedOps.loading}>
          <RefreshCcw size={14} />
          {derivedOps.loading ? 'Syncing' : 'Sync'}
        </button>
      </header>

      <main className={mainShellClass}>
        {derivedOps.error && <StatusBanner tone="error">{derivedOps.error}</StatusBanner>}
        {page === 'dashboard' && <OperationsDashboard data={derivedOps} actions={actions} setPage={setPage} />}
        {page === 'guests' && <SectionHomePage section="guests" data={derivedOps} setPage={setPage} />}
        {page === 'bookings' && <SectionHomePage section="bookings" data={derivedOps} setPage={setPage} />}
        {page === 'money' && <SectionHomePage section="money" data={derivedOps} setPage={setPage} />}
        {page === 'tools' && <SectionHomePage section="tools" data={derivedOps} setPage={setPage} />}
        {page === 'movements' && <MovementsPage data={derivedOps} actions={actions} />}
        {page === 'rooms' && <RoomsOpsPage data={derivedOps} actions={actions} />}
        {page === 'unit-checker' && <UnitCheckerPage />}
        {page === 'verification' && <VerificationPage data={derivedOps} actions={actions} />}
        {page === 'ledger' && <LedgerPage data={derivedOps} actions={actions} />}
        {page === 'booking' && <BookingDeskPage onOpenAvailability={() => setPage('availability')} />}
        {page === 'pulse' && <PulsePage data={derivedOps} />}
        {page === 'chatbot' && <ChatbotControlPage />}
        {page === 'availability' && <AvailabilityPage />}
      </main>

      <nav className={bottomNavClass}>
        {ADMIN_DESK_SECTION_ITEMS.map(({ id, label }) => {
          const Icon = NAV_ICON_BY_ID[id] || Home;
          return (
          <button
            key={id}
            type="button"
            aria-current={activeSection === id ? 'page' : undefined}
            aria-label={label}
            className={cx(bottomNavButtonClass, activeSection === id && bottomNavButtonActiveClass)}
            onClick={() => {
              setPage(id);
            }}
          >
            <Icon size={18} />
            <span className="max-w-full truncate">{label}</span>
          </button>
          );
        })}
      </nav>

      <PaymentSheet
        row={paymentRow}
        onClose={() => setPaymentRow(null)}
        onSubmit={actions.recordPayment}
        busy={Boolean(derivedOps.busyRef)}
      />
      <LedgerEditSheet
        row={ledgerEditRow}
        onClose={() => setLedgerEditRow(null)}
        onSubmit={actions.saveLedgerEdit}
        busy={Boolean(derivedOps.busyRef)}
      />
    </div>
  );
}
