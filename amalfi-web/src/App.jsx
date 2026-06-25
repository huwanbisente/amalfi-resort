import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RoomGrid from './components/RoomGrid';
import BookingModal from './components/BookingModal';
import RebookingModal from './components/RebookingModal';
import SpecialBookingModal from './components/SpecialBookingModal';
import TentPitchingModal from './components/TentPitchingModal';
import AdminDashboard from './pages/AdminDashboard';
import { fetchCentralKnowledge } from './services/knowledge';
import { Camera, ChevronLeft, ChevronRight, Sun, TreePalm } from 'lucide-react';

const specialGridClass = "mt-7 -mx-4 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto px-4 pb-6 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 xl:mt-0 xl:grid-cols-2 [&::-webkit-scrollbar]:hidden";
const specialCardClass = "group relative flex h-[510px] w-[min(92vw,360px)] shrink-0 snap-start flex-col overflow-hidden rounded-[28px] border-4 border-[#caa65a] bg-[#fffdf8] p-3 text-coastal-ink shadow-[0_18px_40px_rgba(8,68,63,0.18),0_0_0_1px_rgba(138,93,31,0.48),inset_0_0_0_2px_rgba(255,255,255,0.96),inset_0_0_0_5px_rgba(202,166,90,0.16),inset_0_0_18px_rgba(202,166,90,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(8,68,63,0.22),0_0_0_1px_rgba(138,93,31,0.56),inset_0_0_0_2px_rgba(255,255,255,0.96),inset_0_0_0_5px_rgba(202,166,90,0.22),inset_0_0_24px_rgba(202,166,90,0.34)] md:w-full md:shrink md:snap-none";
const specialImageFrameClass = "m-0 cursor-zoom-in border-0 bg-transparent shadow-none";
const specialImageClass = "relative h-[250px] overflow-hidden rounded-[22px] border-2 border-[#caa65a] bg-coastal-surfaceContainer shadow-[0_0_0_1px_rgba(138,93,31,0.22),inset_0_0_0_2px_rgba(255,255,255,0.95),inset_0_0_14px_rgba(202,166,90,0.18)]";
const specialImageElClass = "block h-full w-full scale-[1.04] object-cover object-center saturate-[0.96] contrast-[1.04] brightness-[0.98] transition duration-1000 group-hover:scale-[1.08] group-hover:saturate-[1.08] group-hover:contrast-[1.06] group-hover:brightness-[1.01]";
const specialOverlayClass = "absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/40 to-transparent p-4";
const specialCapacityClass = "rounded-full bg-gradient-to-br from-coastal-secondary to-coastal-tertiary px-3 py-2 text-[0.68rem] font-extrabold uppercase tracking-normal text-white shadow-breezeSm";
const specialInfoClass = "flex flex-1 flex-col px-3 pb-1.5 pt-5";
const specialHeaderClass = "mb-3 grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-start gap-4";
const specialTitleClass = "m-0 truncate font-display text-[1.68rem] font-semibold leading-none text-coastal-primary";
const specialPriceClass = "m-0 min-w-[104px] text-right font-display text-[1.18rem] font-semibold leading-tight text-coastal-ink";
const specialFeatureListClass = "m-0 mb-3 min-h-[22px] list-none p-0 text-[0.78rem] leading-[1.45] text-coastal-muted";
const specialFeatureItemClass = "relative pl-[18px] before:absolute before:left-0 before:top-[0.62em] before:h-[7px] before:w-[7px] before:rounded-full before:bg-gradient-to-br before:from-coastal-primary before:to-coastal-secondary before:shadow-[0_0_0_3px_rgba(10,107,95,0.08)]";
const specialAlertClass = "hidden";
const specialAmenitiesClass = "mb-4 grid grid-cols-3 rounded-xl border border-coastal-outline/60 bg-coastal-surfaceLow px-1 py-3 shadow-breezeSm";
const specialAmenityClass = "flex min-w-0 items-center justify-center gap-1.5 border-r border-coastal-outline/50 px-1 text-center text-[0.68rem] font-semibold text-coastal-primaryBright last:border-r-0";
const specialActionClass = "mt-auto";
const specialButtonClass = "inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[rgba(202,166,90,0.92)] bg-[linear-gradient(135deg,#0c755f,#034638)] px-4 py-3 text-[0.78rem] font-bold text-white shadow-[0_10px_20px_rgba(3,70,56,0.3)] transition hover:brightness-110";
const guestNavClass = "fixed left-0 top-0 z-[1000] w-full";
const guestNavInnerClass = "flex h-[72px] w-full items-center justify-between gap-3 border-b border-white/15 bg-[linear-gradient(180deg,rgba(5,28,42,0.76),rgba(5,28,42,0.2))] px-4 shadow-[0_18px_38px_rgba(0,0,0,0.18)] backdrop-blur-xl md:h-[82px] md:px-10 lg:px-12";
const guestBrandClass = "flex min-w-0 flex-1 items-center gap-3 md:flex-none md:gap-4";
const guestLogoWrapClass = "grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full md:h-12 md:w-12";
const guestLogoClass = "h-full w-full rounded-full object-cover";
const guestBrandNameClass = "flex min-w-0 flex-col no-underline";
const guestBrandPrimaryClass = "truncate font-display text-[1.22rem] font-bold leading-none text-white md:text-[1.6rem]";
const guestBrandLocationClass = "mt-1 text-[0.62rem] font-black uppercase tracking-[0.22em] text-coastal-secondary md:text-[0.66rem] md:tracking-[0.34em] md:text-white/78";
const guestNavLinksClass = "hidden list-none items-center gap-8 p-0 md:flex lg:gap-10";
const guestNavLinkClass = "text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#cfeee6] no-underline transition hover:text-white";
const guestNavCtaClass = "inline-flex min-h-[38px] items-center rounded-md border border-[#9a6a24] px-5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#f2c46f] no-underline shadow-[0_8px_18px_rgba(33,20,7,0.18),inset_0_0_0_1px_rgba(255,245,218,0.18),inset_0_0_12px_rgba(154,106,36,0.22)] transition hover:border-[#caa65a] hover:text-[#ffe2a3]";
const guestThemeToggleClass = "hidden";
const mobileMenuClass = "inline-flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-1.5 border-0 bg-transparent p-0 text-[#cfeee6] shadow-none";
const mobilePanelClass = "mx-auto grid max-w-[1280px] grid-cols-2 gap-2 overflow-hidden border-t bg-coastal-background/95 px-4 transition-all duration-200 md:hidden";
const mobilePanelOpenClass = "!max-h-[180px] border-coastal-outline/50 !py-3";
const mobilePanelClosedClass = "!max-h-0 border-transparent !py-0";
const mobilePanelLinkClass = "inline-flex min-h-[42px] items-center justify-center rounded-lg border border-[#caa65a]/80 bg-[#fffdf8]/88 text-[0.72rem] font-bold text-coastal-ink no-underline shadow-[0_8px_18px_rgba(8,68,63,0.12),inset_0_0_0_1px_rgba(255,255,255,0.9),inset_0_0_12px_rgba(202,166,90,0.16)] backdrop-blur transition active:scale-[0.99]";
const heroClass = "relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[url('/api/v1/assets/banner/amalfi_banner.png')] bg-cover bg-center px-4 pb-28 pt-24 md:min-h-[760px] md:pb-32 md:pt-28";
const heroOverlayClass = "absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,rgba(1,28,24,0.16)_0%,rgba(1,28,24,0.28)_36%,rgba(1,28,24,0.48)_100%)]";
const heroContentClass = "relative z-[2] mx-auto flex max-w-4xl flex-col items-center rounded-[26px] px-4 py-6 text-center before:pointer-events-none before:absolute before:inset-x-[-2rem] before:inset-y-[-1.5rem] before:-z-10 before:rounded-[34px] before:bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.24),rgba(0,0,0,0.12)_48%,rgba(0,0,0,0)_72%)] md:px-10 md:py-8";
const heroLabelClass = "hidden";
const heroTitleClass = "max-w-[860px] font-display text-[clamp(3rem,10vw,5.4rem)] font-bold leading-[1.02] text-white [text-shadow:0_3px_0_rgba(30,18,6,0.28),0_18px_46px_rgba(0,0,0,0.62),0_0_26px_rgba(0,0,0,0.36)]";
const heroCopyClass = "mt-6 max-w-[700px] text-[1rem] font-semibold leading-[1.75] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.72),0_2px_8px_rgba(0,0,0,0.78),0_0_14px_rgba(255,255,255,0.34),0_0_28px_rgba(0,81,71,0.32)] md:text-lg";
const heroBookCtaClass = "mt-7 inline-flex min-h-[54px] min-w-[210px] items-center justify-center rounded-md border border-[#caa65a]/90 bg-[linear-gradient(135deg,#0c755f,#034638)] px-8 text-[0.78rem] font-black uppercase tracking-[0.16em] text-white no-underline shadow-[0_20px_40px_rgba(0,0,0,0.34),0_8px_26px_rgba(3,70,56,0.34),inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:brightness-110 md:mt-8";
const portalOfflineClass = "mx-auto mb-6 max-w-[680px] rounded-2xl border border-white/15 bg-coastal-tertiary/70 px-[18px] py-3.5 text-white/90 backdrop-blur-lg";
const portalOfflineTitleClass = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1.2px]";
const portalOfflineTextClass = "m-0 text-[0.82rem] leading-[1.6]";
const availabilityPanelClass = "mt-40 grid w-full max-w-[320px] grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-[#caa65a]/45 bg-[linear-gradient(180deg,rgba(5,28,42,0.82),rgba(5,28,42,0.46))] p-5 text-left text-white shadow-[0_18px_38px_rgba(0,0,0,0.24),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-12px_28px_rgba(202,166,90,0.08)] backdrop-blur-xl md:mt-24 md:max-w-[520px] md:p-6";
const availabilityFieldClass = "flex flex-col gap-2";
const availabilityLabelClass = "text-[0.68rem] font-black uppercase tracking-[0.16em] text-white";
const availabilityInputClass = "min-h-[42px] w-full rounded-none border-0 border-b border-white/55 bg-transparent px-0 text-[0.9rem] font-medium text-white outline-none [color-scheme:dark] placeholder:text-white/70 focus:border-[#caa65a] focus:ring-0";
const availabilityDividerClass = "hidden";
const availabilityButtonClass = "col-span-2 min-h-[48px] rounded-md border border-[#caa65a]/85 bg-[linear-gradient(135deg,#9a6a24,#6d5130)] px-8 text-[0.78rem] font-black uppercase tracking-[0.1em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.18),inset_0_0_14px_rgba(202,166,90,0.18)] transition hover:brightness-105";
const welcomeSectionClass = "relative overflow-hidden border-y border-[#caa65a]/35 bg-[#fffdf8] py-16 md:py-24";
const welcomeContainerClass = "relative z-[1] mx-auto grid max-w-[1760px] items-center gap-10 px-5 md:px-8 xl:grid-cols-[minmax(320px,0.74fr)_minmax(0,1fr)] 2xl:px-12";
const welcomeCopyClass = "max-w-[620px]";
const welcomeKickerClass = "mb-4 text-[0.72rem] font-black uppercase tracking-[0.2em] text-coastal-secondary";
const welcomeTitleClass = "m-0 font-display text-[clamp(2.8rem,6vw,6.2rem)] font-bold leading-[0.92] text-coastal-primary";
const welcomeRuleClass = "my-7 h-px w-20 bg-[#c6923f]";
const welcomeTextClass = "m-0 max-w-[560px] text-[1rem] leading-[1.8] text-coastal-muted md:text-[1.08rem]";
const welcomeProofClass = "mt-8 grid max-w-[560px] grid-cols-3 overflow-hidden rounded-xl border border-[#caa65a]/35 bg-[linear-gradient(135deg,#063f35,#032b25)] px-4 py-3 text-white shadow-[0_18px_34px_rgba(3,43,37,0.16)]";
const welcomeProofItemClass = "grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3 border-r border-white/12 px-3 py-1 last:border-r-0";
const welcomeProofIconClass = "text-[#caa65a]";
const welcomeProofLabelClass = "block text-[0.58rem] font-black uppercase tracking-[0.14em] text-[#caa65a]";
const welcomeProofTextClass = "mt-0.5 block text-[0.62rem] font-semibold leading-4 text-white/78";
const welcomeMediaClass = "overflow-hidden rounded-[18px] border border-[#caa65a] bg-[#fffdf8] shadow-[0_18px_42px_rgba(8,68,63,0.18),0_0_0_1px_rgba(138,93,31,0.45),inset_0_0_0_2px_rgba(255,255,255,0.92),inset_0_0_18px_rgba(202,166,90,0.16)]";
const welcomeCollageClass = "grid h-[560px] grid-cols-4 grid-rows-5 gap-[3px] bg-[#fffdf8] md:h-[520px] md:grid-cols-6 md:grid-rows-4";
const welcomeTileClass = "m-0 min-h-0 overflow-hidden bg-[#fffdf8]";
const welcomeTileMainClass = "col-span-4 row-span-2 md:col-span-3 md:col-start-1 md:row-span-3 md:row-start-1";
const welcomeTileSunsetClass = "col-span-2 row-span-1 md:col-span-1 md:col-start-4 md:row-span-3 md:row-start-1";
const welcomeTilePoolClass = "col-span-2 row-span-1 md:col-span-2 md:col-start-5 md:row-start-1";
const welcomeTileCourtyardClass = "col-span-2 row-span-1 md:col-span-2 md:col-start-5 md:row-start-2";
const welcomeTileWideClass = "col-span-2 row-span-1 md:col-span-3 md:col-start-1 md:row-start-4";
const welcomeTileBottomClass = "col-span-4 row-span-1 md:col-span-3 md:col-start-4 md:row-span-2 md:row-start-3";
const welcomeImageClass = "h-full w-full object-cover";
const guestSectionClass = "bg-coastal-background py-20 md:py-[120px]";
const unitShowcaseSectionClass = "relative scroll-mt-24 overflow-hidden border-y border-[#caa65a]/45 bg-[linear-gradient(90deg,#fffaf0_0%,#fffdf8_52%,#eef4ef_100%)] pb-16 pt-28 before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[23vw] before:bg-[radial-gradient(circle_at_28%_28%,rgba(202,166,90,0.16),transparent_34%),linear-gradient(180deg,rgba(255,253,248,0.94),rgba(255,246,226,0.82))] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-[22vw] after:bg-[linear-gradient(90deg,transparent,rgba(12,117,95,0.08))] md:scroll-mt-28 md:pb-20 md:pt-24";
const unitShowcaseContainerClass = "relative z-[1] mx-auto max-w-[1760px] px-5 md:px-8 2xl:px-12";
const unitShowcaseShellClass = "grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)]";
const unitEditorialClass = "rounded-[28px] border border-[#caa65a]/35 bg-[#fffdf8]/62 p-6 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.72)] xl:self-start xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none";
const unitEditorialRuleClass = "my-6 h-px w-16 bg-[#c6923f]";
const unitEditorialListClass = "mt-8 grid gap-5 sm:grid-cols-3 xl:grid-cols-1";
const unitEditorialItemClass = "grid grid-cols-[42px_1fr] gap-3 text-left";
const unitEditorialIconClass = "grid h-11 w-11 place-items-center rounded-full border border-[#caa65a]/70 bg-coastal-primary text-[#caa65a] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.12)]";
const unitEditorialItemTitleClass = "mb-1 text-[0.78rem] font-black uppercase tracking-[0.08em] text-coastal-ink";
const unitEditorialItemCopyClass = "m-0 text-[0.76rem] leading-5 text-coastal-muted";
const guestSpecialSectionClass = "relative overflow-hidden border-y border-[#caa65a]/35 bg-[linear-gradient(90deg,#eef4ef_0%,#fffdf8_48%,#fffaf0_100%)] py-16 before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[24vw] before:bg-[linear-gradient(90deg,rgba(12,117,95,0.08),transparent)] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-[24vw] after:bg-[radial-gradient(circle_at_68%_24%,rgba(202,166,90,0.16),transparent_34%),linear-gradient(180deg,rgba(255,253,248,0.94),rgba(255,246,226,0.82))] md:py-24";
const specialShowcaseContainerClass = "relative z-[1] mx-auto max-w-[1760px] px-5 md:px-8 2xl:px-12";
const specialShowcaseShellClass = "grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_310px]";
const specialEditorialClass = "order-first rounded-[28px] border border-[#caa65a]/35 bg-[#fffdf8]/62 p-6 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.72)] xl:order-none xl:self-start xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none";
const specialStatusPillClass = "mb-6 inline-flex items-center gap-2 rounded-lg border border-coastal-secondary/30 bg-coastal-secondary/10 px-3 py-2 text-xs font-bold text-coastal-tertiary";
const guestContainerClass = "mx-auto max-w-[1520px] px-4 md:px-10 xl:px-14";
const sectionLabelClass = "mb-3 block text-sm font-semibold text-coastal-secondary";
const sectionHeadingRowClass = "mb-12 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between md:gap-6";
const sectionTitleClass = "m-0 font-display text-[clamp(2.6rem,5vw,4.5rem)] font-bold leading-[1.08] text-coastal-primary";
const sectionCopyClass = "mt-3 max-w-[680px] text-base leading-[1.75] text-coastal-muted md:text-lg";
const sectionLinkClass = "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-coastal-secondary px-4 py-2 text-sm font-semibold text-coastal-secondary no-underline transition hover:bg-coastal-secondary hover:text-white";
const availabilityNoteClass = "inline-flex items-center gap-2 rounded-lg border border-coastal-secondary/30 bg-coastal-secondary/10 px-3 py-2 text-xs font-bold text-coastal-tertiary";
const experienceSectionClass = "relative overflow-hidden border-t border-coastal-outline bg-gradient-to-b from-coastal-surface/70 to-coastal-surfaceLow/80 py-[70px] md:py-[96px]";
const experienceHeaderClass = "mb-6 border-b border-coastal-outline pb-[18px]";
const experienceTitleClass = "m-0 font-display text-[clamp(2.25rem,4.2vw,4.1rem)] font-bold leading-[0.98] tracking-normal text-coastal-ink";
const experienceCardsClass = "grid grid-cols-1 gap-5 md:grid-cols-3";
const experienceCardClass = "group flex min-h-[230px] cursor-pointer flex-col gap-2.5 rounded-[22px] border border-coastal-outline bg-gradient-to-b from-coastal-surface/98 to-coastal-surfaceLow/94 p-6 text-left shadow-breezeSm transition duration-200 hover:-translate-y-[3px] hover:border-coastal-secondary/40 hover:from-coastal-secondarySoft/20 hover:to-coastal-surface/94";
const experienceNumClass = "text-[0.62rem] font-black uppercase tracking-[0.16em] text-coastal-primary";
const experienceCardTitleClass = "m-0 font-display text-[1.45rem] font-bold leading-tight text-coastal-ink";
const experienceTeaserClass = "m-0 flex-1 text-[0.88rem] leading-[1.65] text-coastal-muted";
const experienceMoreClass = "mt-2 w-fit rounded-full border border-coastal-outline bg-coastal-surface/78 px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.12em] text-coastal-primaryBright";
const videoSectionClass = "relative overflow-hidden border-t border-coastal-outline bg-coastal-background py-14 md:py-16";
const videoHeaderActionsClass = "mt-5 flex items-center gap-3 md:mt-0";
const videoSideButtonClass = "absolute top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border-2 border-[#caa65a] bg-[#fffdf8]/95 text-coastal-primary shadow-[0_12px_28px_rgba(8,68,63,0.18),inset_0_0_0_2px_rgba(255,255,255,0.9),inset_0_0_14px_rgba(202,166,90,0.2)] backdrop-blur transition hover:-translate-y-[52%] hover:bg-coastal-secondarySoft md:grid";
const videoSidePrevClass = `${videoSideButtonClass} -left-16`;
const videoSideNextClass = `${videoSideButtonClass} -right-16`;
const videoRailWrapClass = "relative mt-7 overflow-visible px-0 md:px-1";
const videoRailClass = "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-5 [scrollbar-width:none] md:gap-5 [&::-webkit-scrollbar]:hidden";
const videoCardClass = "group w-[min(72vw,250px)] shrink-0 snap-start border-0 bg-transparent p-0 text-left md:w-[calc((100%-3.75rem)/4)]";
const videoFrameClass = "relative overflow-hidden rounded-[28px] border-4 border-[#caa65a] bg-[#fffdf8] p-2 shadow-[0_18px_40px_rgba(8,68,63,0.18),0_0_0_1px_rgba(138,93,31,0.48),inset_0_0_0_2px_rgba(255,255,255,0.96),inset_0_0_0_5px_rgba(202,166,90,0.16),inset_0_0_18px_rgba(202,166,90,0.28)] transition duration-200 group-hover:-translate-y-0.5";
const videoElClass = "block aspect-[9/16] w-full rounded-[20px] bg-coastal-primaryBright object-cover";
const videoOverlayClass = "pointer-events-none absolute inset-x-2 bottom-2 rounded-b-[20px] bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 pb-3 pt-14 text-white";
const videoLabelClass = "text-[0.58rem] font-black uppercase tracking-[0.14em] text-coastal-secondary";
const videoTitleClass = "mt-1 font-display text-[1.15rem] font-bold leading-tight text-white";
const videoModalCardClass = "relative grid max-h-[92vh] w-[min(94vw,860px)] gap-4 overflow-x-hidden overflow-y-auto rounded-[30px] border-2 border-[#caa65a] bg-[#fffdf8] p-4 text-coastal-ink shadow-breezeResort md:grid-cols-[minmax(280px,370px)_minmax(300px,410px)] md:gap-6 md:overflow-hidden md:p-5";
const videoModalVideoClass = "block max-h-[46vh] w-full justify-self-center rounded-[24px] bg-coastal-primaryBright object-contain md:h-auto md:max-h-[74vh] md:w-auto md:max-w-full";
const videoModalBodyClass = "flex max-w-[440px] flex-col justify-center p-1 pr-2 md:p-5 md:pr-6";
const videoModalEyebrowClass = "mb-2.5 text-[0.62rem] font-black uppercase tracking-[0.24em] text-coastal-secondary";
const videoModalTitleClass = "mb-2.5 font-display text-[1.75rem] font-bold leading-tight text-[#13211f] md:text-[2.1rem]";
const videoModalIntroClass = "mb-3 max-w-[30rem] text-[0.86rem] leading-[1.66] text-[#3e4946]";
const videoModalMoodClass = "mb-4 border-l-2 border-[#caa65a] pl-4 font-display text-[0.98rem] italic leading-[1.55] text-coastal-primary";
const videoModalChipsClass = "mb-4 grid grid-cols-3 gap-2";
const videoModalChipClass = "rounded-2xl border border-[#caa65a]/45 bg-[#f8f3ea]/80 px-2 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)]";
const videoModalChipLabelClass = "mb-1 block text-[0.55rem] font-black uppercase tracking-[0.18em] text-coastal-secondary";
const videoModalChipValueClass = "block text-[0.74rem] font-bold leading-snug text-coastal-primary";
const videoModalNoteClass = "mb-5 text-[0.74rem] leading-[1.6] text-coastal-muted";
const appModalOverlayClass = "fixed inset-0 z-[3000] flex items-center justify-center bg-coastal-primaryBright/68 p-[clamp(12px,2vw,28px)] backdrop-blur-[14px]";
const appModalCardClass = "relative max-h-[90vh] w-[min(94vw,520px)] overflow-y-auto rounded-3xl border border-coastal-outline bg-gradient-to-b from-coastal-surface to-coastal-surfaceLow p-7 text-coastal-ink shadow-breezeResort md:p-10";
const modalCloseClass = "absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-coastal-secondary/30 bg-coastal-surface/90 text-[0.72rem] font-black text-coastal-ink shadow-breezeSm";
const experienceModalImageClass = "mb-7 block h-60 w-full rounded-[20px] border border-coastal-outline object-cover";
const policyButtonClass = "inline-flex min-h-[46px] w-full items-center justify-center rounded-full border border-coastal-primary/80 bg-coastal-primary px-6 py-3 text-[0.7rem] font-black uppercase tracking-[0.14em] text-white transition hover:bg-coastal-primaryBright";
const footerClass = "relative overflow-hidden bg-coastal-primaryBright pt-[74px] text-white/80 before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-coastal-primaryBright/98 before:to-coastal-primary/96 max-[640px]:pt-[54px]";
const footerContainerClass = "container relative z-[1] mx-auto max-w-[1520px] px-[clamp(22px,4vw,56px)]";
const footerGridClass = "grid grid-cols-1 gap-[clamp(24px,4vw,56px)] border-b border-white/10 pb-[34px] min-[760px]:grid-cols-[1.35fr_1.65fr] min-[1180px]:grid-cols-[1.35fr_1.45fr]";
const footerLinkGridClass = "grid grid-cols-2 gap-x-7 gap-y-8";
const footerLogoClass = "mb-4 font-display text-[clamp(2.1rem,4vw,3.2rem)] font-extrabold leading-none tracking-normal text-white";
const footerCopyClass = "mb-4 text-[0.75rem] leading-[1.7] text-white/70";
const footerTaglineClass = "mb-4 text-[0.7rem] leading-[1.8] tracking-[1px] text-white/70";
const footerHeadingClass = "mb-5 block text-[0.66rem] font-black uppercase tracking-[0.16em] text-coastal-secondary";
const footerLinksClass = "flex list-none flex-col gap-3 p-0";
const footerLinkClass = "text-[0.8rem] font-extrabold text-white/70 no-underline transition hover:text-white";
const footerAccentLinkClass = "text-[0.7rem] font-extrabold tracking-[1px] text-coastal-secondary no-underline transition hover:text-white";
const footerBottomClass = "flex flex-col gap-2 border-t border-white/10 py-6 text-[0.72rem] text-white/50 md:flex-row md:justify-between";
const arrivalModalCardClass = "relative max-h-[90vh] w-[min(94vw,720px)] overflow-hidden rounded-3xl border border-coastal-outline bg-gradient-to-b from-coastal-surface to-coastal-surfaceLow text-coastal-ink shadow-breezeResort";
const arrivalHeaderClass = "border-b border-coastal-secondary/30 bg-gradient-to-r from-coastal-surface/90 to-coastal-surfaceLow/90 px-8 pb-7 pt-9";
const arrivalTitleClass = "m-0 font-display text-[clamp(2rem,4vw,2.8rem)] font-extrabold leading-[1.05] text-coastal-ink";
const arrivalSubtitleClass = "mt-2 text-[0.78rem] font-bold leading-6 text-coastal-muted";
const arrivalSectionsClass = "max-h-[60vh] overflow-y-auto px-0 py-2";
const arrivalSectionClass = "flex items-start gap-[18px] px-8 py-6 max-[640px]:flex-col max-[640px]:gap-3 max-[640px]:px-[22px]";
const arrivalIconClass = "w-16 shrink-0 rounded-full border border-coastal-outline bg-coastal-secondarySoft px-2.5 py-2 text-center text-[0.66rem] font-black uppercase tracking-[0.08em] text-coastal-primaryBright";
const arrivalSectionTitleClass = "mb-3 text-[0.65rem] font-black uppercase tracking-[2.5px] text-coastal-primary";
const arrivalRowClass = "mb-1.5 flex items-center justify-between gap-6";
const arrivalKeyClass = "text-[0.75rem] text-coastal-muted";
const arrivalValueClass = "text-[0.85rem] font-black tracking-[0.5px] text-coastal-ink";
const arrivalNoteClass = "mt-2.5 text-[0.65rem] leading-[1.6] text-coastal-muted";
const arrivalListClass = "flex list-none flex-col gap-2 p-0";
const arrivalListItemClass = "relative pl-4 text-[0.78rem] leading-[1.5] text-coastal-muted before:absolute before:left-0 before:top-[0.65em] before:h-[7px] before:w-[7px] before:rounded-full before:bg-gradient-to-br before:from-coastal-primary before:to-coastal-secondary";
const arrivalTagClass = "ml-1 inline-block rounded-full bg-coastal-secondary/10 px-2 py-0.5 align-middle text-[0.6rem] font-bold tracking-[0.5px] text-coastal-tertiary";
const arrivalDividerClass = "mx-8 h-px bg-coastal-outline max-[640px]:mx-[22px]";
const arrivalMapButtonClass = "inline-flex min-h-[38px] items-center rounded-full border border-coastal-primary/80 bg-coastal-primary px-[18px] text-[0.62rem] font-black uppercase tracking-[1.5px] text-white shadow-breezeSm transition hover:bg-coastal-primaryBright";
const devModalCardClass = "relative max-h-[90vh] w-[min(94vw,560px)] overflow-hidden rounded-3xl border border-coastal-outline bg-gradient-to-b from-coastal-surface to-coastal-surfaceLow text-coastal-ink shadow-breezeResort";
const devHeaderClass = "relative overflow-hidden bg-gradient-to-br from-coastal-primaryBright to-coastal-primary px-8 py-9 text-center text-white before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_18%_10%,rgba(198,146,63,0.24),transparent_32%)]";
const devAvatarClass = "relative mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full border border-white/40 bg-white/10 font-display text-2xl font-extrabold text-coastal-secondary shadow-breezeMd";
const devNameClass = "relative m-0 font-display text-[1.8rem] font-extrabold leading-tight text-white";
const devTitleClass = "relative mt-2 text-[0.72rem] font-black uppercase tracking-[0.18em] text-white/70";
const devBodyClass = "px-7 py-7";
const devLinksClass = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const devLinkClass = "flex min-h-[58px] items-center gap-3 rounded-2xl border border-coastal-outline bg-coastal-surface/78 px-4 text-[0.78rem] font-extrabold text-coastal-ink no-underline transition hover:border-coastal-primary/30 hover:bg-coastal-secondarySoft";
const devLinkIconClass = "inline-flex min-w-[54px] justify-center rounded-full bg-coastal-secondary/10 px-2 py-1 text-[0.58rem] font-black uppercase tracking-[0.08em] text-coastal-tertiary";
const devFooterClass = "border-t border-coastal-outline bg-coastal-surfaceLow/50 px-7 py-5";
const devFooterTextClass = "m-0 text-center text-[0.76rem] font-bold leading-6 text-coastal-muted";

const breezeVideos = [
    {
        title: 'Beachfront Arrival',
        label: 'Start Here',
        src: '/videos/breeze/promo-1.mp4',
        copy: 'Start the trip before check-in with a quiet drive toward the coast, the resort sign, and the first glimpse of Zambales calm.',
        mood: 'A soft arrival reel for guests imagining the first few minutes of their Amalfi getaway.',
        details: ['Arrival cue', 'Road to resort', 'First impression'],
        note: 'Best watched before choosing a room, especially for first-time guests who want to feel the location and approach.'
    },
    {
        title: 'Cabin Moments',
        label: 'Units',
        src: '/videos/breeze/promo-2.mp4',
        copy: 'A closer look at the stay experience around the rooms, facade, and little resort details that make the overnight units feel personal.',
        mood: 'Simple, homey, and made for guests who want an easy place to settle in after beach time.',
        details: ['Room preview', 'Quiet corners', 'Overnight stays'],
        note: 'Pair this reel with the unit cards below to compare capacity, comfort, and the style of each stay.'
    },
    {
        title: 'Pool & Palms',
        label: 'Experience',
        src: '/videos/breeze/promo-3.mp4',
        copy: 'Walk through palms, sand, shade, and poolside corners that shape the slower rhythm of a day inside the resort.',
        mood: 'A breezy resort preview for guests looking for pool dips, beach walks, and unhurried afternoons.',
        details: ['Pool access', 'Palm walkways', 'Beach pace'],
        note: 'Ideal for families and barkadas who want a quick sense of the shared spaces before booking.'
    },
    {
        title: 'By The Shore',
        label: 'Beach',
        src: '/videos/breeze/promo-4.mp4',
        copy: 'A shoreline reel focused on the beach atmosphere, open-air views, and the simple pleasure of being close to the water.',
        mood: 'For guests who want the beach to be the main character of the trip.',
        details: ['Beachfront', 'Sea breeze', 'Open views'],
        note: 'Use this preview if your group is choosing between a relaxed overnight stay and a daytime beach visit.'
    },
    {
        title: 'Stay Preview',
        label: 'Booking',
        src: '/videos/breeze/promo-5.mp4',
        copy: 'A practical booking preview that connects the resort atmosphere with the next step: selecting dates, guests, and the right unit.',
        mood: 'A gentle nudge from browsing into planning, without making the booking feel rushed.',
        details: ['Plan your stay', 'Choose dates', 'Reserve ahead'],
        note: 'Availability can change quickly, so this is a good moment to check your dates before comparing rooms.'
    },
    {
        title: 'Amalfi Reel',
        label: 'Resort',
        src: '/videos/breeze/promo-6.mp4',
        copy: 'A wider resort mood piece with sunset color, seaside energy, and the kind of simple moments guests remember after the trip.',
        mood: 'Golden-hour atmosphere for guests who want the full Amalfi Resort feeling in one short reel.',
        details: ['Sunset mood', 'Resort story', 'Memories'],
        note: 'A good final watch before booking, especially if you are planning a family vacation or barkada getaway.'
    },
];

const LandingPage = () => {
    const [selectedRoom, setSelectedRoom]         = useState(null);
    const [showRebookingModal, setShowRebookingModal] = useState(false);
    const [showPolicyModal, setShowPolicyModal]   = useState(false);
    const [activeExp, setActiveExp]               = useState(null);
    const [activeVideo, setActiveVideo]           = useState(null);
    const [showDayTourModal, setShowDayTourModal] = useState(false);
    const [showTentModal, setShowTentModal]       = useState(false);
    const [showArrivalModal, setShowArrivalModal] = useState(false);
    const [showDevPopup, setShowDevPopup]         = useState(false);
    const [showMobileNav, setShowMobileNav]       = useState(false);
    const [knowledgeBase, setKnowledgeBase]       = useState(null);
    const [portalStatus, setPortalStatus]         = useState({ enabled: true, contactPhone: '' });
    const [themeMode, setThemeMode]               = useState(() => localStorage.getItem('amalfiGuestTheme') || 'light');
    const videoRailRef = useRef(null);
    const [searchDates, setSearchDates] = useState({ 
        checkIn: '', 
        checkOut: '', 
        guests: 2
    });

    const scrollVideoRail = (direction) => {
        const rail = videoRailRef.current;
        if (!rail) return;
        rail.scrollBy({
            left: direction * Math.min(rail.clientWidth * 0.86, 720),
            behavior: 'smooth',
        });
    };

    useEffect(() => {
        localStorage.setItem('amalfiGuestTheme', themeMode);
    }, [themeMode]);

    useEffect(() => {
        let cancelled = false;

        const loadAppData = async () => {
            let kb = {};
            try {
                kb = await fetchCentralKnowledge();
                if (!cancelled) setKnowledgeBase(kb);
            } catch {
                if (!cancelled) setKnowledgeBase({});
            }

            try {
                const response = await fetch('/api/v1/public/portal-status');
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled) {
                    setPortalStatus({
                        enabled: data.enabled !== false,
                        contactPhone: data.contact_phone || kb.contact_phone || '',
                    });
                }
            } catch {
                if (!cancelled) {
                    setPortalStatus((current) => ({ ...current, enabled: true }));
                }
            }
        };

        loadAppData();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!knowledgeBase || !knowledgeBase.accommodations) {
        return <div className="px-8 py-24 text-center font-sans">Loading Amalfi Sanctuary... Please refresh.</div>;
    }

    const handleSearch = () => {
        document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
    };

    const policyRows = knowledgeBase.booking_and_cancellation_policies?.cancellation_policy || [];
    const primaryPolicy = policyRows[0] || { condition: "Contact Management", action: "Contact Management", notes: "" };
    const formatPolicyAction = (policy) => policy.action || (policy.refund_percent !== undefined ? `${policy.refund_percent}% refund` : 'Contact Management');
    const heroHeadlineLines = ['Beach Â· Sunset', 'Sanctuary Â· Memories'];

    return (
        <div className={`amalfi-app theme-${themeMode}`}>
            <nav className={guestNavClass}>
                <div className={guestNavInnerClass}>
                    <div className={guestBrandClass}>
                        <div className={guestLogoWrapClass}>
                            <img src="/api/v1/assets/logo/resort-logo.jpg" alt="Amalfi Resort logo" className={guestLogoClass} />
                        </div>
                        <Link to="/" className={guestBrandNameClass} aria-label="Amalfi Resort home">
                            <span className={guestBrandPrimaryClass}>Amalfi Resort</span>
                            <span className={guestBrandLocationClass}>Zambales</span>
                        </Link>
                    </div>
                    <ul className={guestNavLinksClass}>
                        <li><a href="#rooms" className={guestNavLinkClass}>Units</a></li>
                        <li><a href="#special-bookings" className={guestNavLinkClass}>Special</a></li>
                        <li><a href="#amalfi-reels" className={guestNavLinkClass}>Reels</a></li>
                        <li><a href="#experience" className={guestNavLinkClass}>Experience</a></li>
                        <li><a href="#" className={guestNavLinkClass} onClick={() => setShowRebookingModal(true)}>Rebooking</a></li>
                        <li><a href="#rooms" className={guestNavCtaClass}>Book Now</a></li>
                    </ul>
                    <button
                        type="button"
                        className={guestThemeToggleClass}
                        onClick={() => setThemeMode((current) => current === 'light' ? 'dark' : 'light')}
                        aria-label={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}
                    >
                        {themeMode === 'light' ? 'Dark' : 'Light'}
                    </button>
                    <div className="inline-flex items-center gap-2 md:hidden">
                        <button
                            type="button"
                            className={mobileMenuClass}
                            onClick={() => setShowMobileNav((current) => !current)}
                            aria-expanded={showMobileNav}
                            aria-controls="mobile-navigation"
                        >
                            <span className="block h-0.5 w-[15px] rounded-full bg-current" />
                            <span className="block h-0.5 w-[15px] rounded-full bg-current" />
                            <span className="block h-0.5 w-[15px] rounded-full bg-current" />
                        </button>
                    </div>
                </div>
                <div id="mobile-navigation" className={`${mobilePanelClass} ${showMobileNav ? mobilePanelOpenClass : mobilePanelClosedClass}`}>
                    <a href="#rooms" className={mobilePanelLinkClass} onClick={() => setShowMobileNav(false)}>Units</a>
                    <a href="#special-bookings" className={mobilePanelLinkClass} onClick={() => setShowMobileNav(false)}>Special</a>
                    <a href="#amalfi-reels" className={mobilePanelLinkClass} onClick={() => setShowMobileNav(false)}>Reels</a>
                    <a href="#experience" className={mobilePanelLinkClass} onClick={() => setShowMobileNav(false)}>Experience</a>
                    <button type="button" className={mobilePanelLinkClass} onClick={() => { setShowMobileNav(false); setShowRebookingModal(true); }}>Rebooking</button>
                </div>
            </nav>

            <header className={heroClass}>
                <div className={heroOverlayClass}></div>
                <div className={heroContentClass}>
                    <span className={heroLabelClass}>{knowledgeBase.status || 'Premier Destination'}</span>
                    <h1 className={heroTitleClass}>
                        {heroHeadlineLines.map((line) => <span key={line} className="block whitespace-normal">{line}</span>)}
                    </h1>
                    <p className={heroCopyClass}>
                        Amalfi Resort is a welcoming seaside resort in Zambales, created for relaxing family vacations, barkada getaways, and simple moments made special by the beach.
                    </p>
                    <a href="#rooms" className={heroBookCtaClass}>
                        Book Now
                    </a>
                    {!portalStatus.enabled && (
                        <div className={portalOfflineClass}>
                            <p className={portalOfflineTitleClass}>
                                Guest portal temporarily offline
                            </p>
                            <p className={portalOfflineTextClass}>
                                Online booking is paused right now. Please contact Amalfi Resort directly at {portalStatus.contactPhone || knowledgeBase.contact_phone}.
                            </p>
                        </div>
                    )}
                    
                    <div className={availabilityPanelClass}>
                        {/* Arrival */}
                        <div className={availabilityFieldClass}>
                            <label className={availabilityLabelClass}>Check-In</label>
                            <input
                                type="date"
                                className={availabilityInputClass}
                                value={searchDates.checkIn}
                                onChange={(e) => setSearchDates({ ...searchDates, checkIn: e.target.value })}
                            />
                        </div>

                        <div className={availabilityDividerClass} />

                        {/* Departure */}
                        <div className={availabilityFieldClass}>
                            <label className={availabilityLabelClass}>Check-Out</label>
                            <input
                                type="date"
                                className={availabilityInputClass}
                                value={searchDates.checkOut}
                                onChange={(e) => setSearchDates({ ...searchDates, checkOut: e.target.value })}
                            />
                        </div>

                        <div className={availabilityDividerClass} />

                        {/* Guests */}
                        <div className={`${availabilityFieldClass} col-span-2`}>
                            <label className={availabilityLabelClass}>Guests</label>
                            <select
                                className={availabilityInputClass}
                                value={searchDates.guests}
                                onChange={(e) => setSearchDates({ ...searchDates, guests: e.target.value })}
                            >
                                <option value="2">1 - 2 guests</option>
                                <option value="4">3 - 4 guests</option>
                                <option value="8">5 - 8 guests</option>
                                <option value="12">9 - 12 guests</option>
                                <option value="20">12 + guests</option>
                            </select>
                        </div>

                        {/* CTA */}
                        <button className={availabilityButtonClass} onClick={handleSearch}>
                            Search Availability
                        </button>
                    </div>
                </div>
            </header>

            <section aria-labelledby="welcome-heading" className={welcomeSectionClass}>
                <div className="amalfi-section-bg amalfi-section-bg--soft amalfi-section-bg--text-left" aria-hidden="true" />
                <div className={welcomeContainerClass}>
                    <div className={welcomeCopyClass}>
                        <p className={welcomeKickerClass}>Before you choose your stay</p>
                        <h2 id="welcome-heading" className={welcomeTitleClass}>Simple moments by the sea.</h2>
                        <div className={welcomeRuleClass} />
                        <p className={welcomeTextClass}>
                            Amalfi Resort is a welcoming seaside resort in Zambales, made for family vacations, barkada getaways, and slow beachfront days. Settle in, wander toward the water, and let the rhythm of the coast shape the rest of your stay.
                        </p>
                        <div className={welcomeProofClass} aria-label="Amalfi Resort highlights">
                            {[
                                [TreePalm, 'Beach', 'Private coast'],
                                [Sun, 'Sunset', 'Golden views'],
                                [Camera, 'Memories', 'Easy getaways'],
                            ].map(([Icon, label, copy]) => (
                                <div key={label} className={welcomeProofItemClass}>
                                    <Icon size={22} strokeWidth={1.7} className={welcomeProofIconClass} aria-hidden="true" />
                                    <span>
                                        <span className={welcomeProofLabelClass}>{label}</span>
                                        <span className={welcomeProofTextClass}>{copy}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={welcomeMediaClass}>
                        <div className={welcomeCollageClass}>
                            <figure className={`${welcomeTileClass} ${welcomeTileMainClass}`}>
                                <img src="/assets/pictures/8.jpg" alt="Amalfi Resort beachfront walkway" className={welcomeImageClass} />
                            </figure>
                            <figure className={`${welcomeTileClass} ${welcomeTileSunsetClass}`}>
                                <img src="/assets/pictures/3.jpg" alt="Sunset by the sea in Zambales" className={welcomeImageClass} />
                            </figure>
                            <figure className={`${welcomeTileClass} ${welcomeTilePoolClass}`}>
                                <img src="/assets/pictures/12.jpg" alt="Amalfi Resort pool area" className={welcomeImageClass} />
                            </figure>
                            <figure className={`${welcomeTileClass} ${welcomeTileWideClass}`}>
                                <img src="/assets/pictures/6.jpg" alt="Beachfront sand and palms at Amalfi Resort" className={welcomeImageClass} />
                            </figure>
                            <figure className={`${welcomeTileClass} ${welcomeTileCourtyardClass}`}>
                                <img src="/assets/pictures/5.jpg" alt="Amalfi Resort garden courtyard" className={welcomeImageClass} />
                            </figure>
                            <figure className={`${welcomeTileClass} ${welcomeTileBottomClass}`}>
                                <img src="/assets/pictures/10.jpg" alt="Amalfi Resort teepee-style unit exterior" className={welcomeImageClass} />
                            </figure>
                        </div>
                    </div>
                </div>
            </section>

            <section id="rooms" className={unitShowcaseSectionClass}>
                <div className="amalfi-section-bg amalfi-section-bg--text-left" aria-hidden="true" />
                <div className={unitShowcaseContainerClass}>
                    <div className={unitShowcaseShellClass}>
                        <aside className={unitEditorialClass}>
                            <span className={sectionLabelClass}>Amalfi Resort</span>
                            <h2 className={sectionTitleClass}>Stay The Night</h2>
                            <div className={unitEditorialRuleClass} />
                            <p className={sectionCopyClass}>
                                Relax in thoughtfully designed stays just steps from the beach. Whether you are traveling as a couple, with friends, or with the whole family, there is a space for every kind of getaway.
                            </p>
                            <div className={unitEditorialListClass}>
                                {[
                                    ['Beachfront Sanctuary', 'Wake up to sea breeze and stunning coastal views.'],
                                    ['Thoughtful Amenities', 'Enjoy modern comforts surrounded by nature.'],
                                    ['Warm Filipino Hospitality', 'Our team is here to make your stay truly memorable.'],
                                ].map(([title, copy]) => (
                                    <div key={title} className={unitEditorialItemClass}>
                                        <span className={unitEditorialIconClass}>+</span>
                                        <div>
                                            <p className={unitEditorialItemTitleClass}>{title}</p>
                                            <p className={unitEditorialItemCopyClass}>{copy}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </aside>
                        <RoomGrid
                            onSelectRoom={setSelectedRoom}
                            checkIn={searchDates.checkIn}
                            checkOut={searchDates.checkOut}
                            requestedGuests={Number(searchDates.guests) || 0}
                            portalEnabled={portalStatus.enabled}
                        />
                    </div>
                </div>
            </section>

            {/* Special Bookings */}
            <section id="special-bookings" className={guestSpecialSectionClass}>
                <div className="amalfi-section-bg amalfi-section-bg--ocean amalfi-section-bg--text-right" aria-hidden="true" />
                <div className={specialShowcaseContainerClass}>
                    <div className={specialShowcaseShellClass}>
                        <div className={specialGridClass}>
                            {/* Day Tour Card */}
                            <article className={specialCardClass} id="special-day-tour">
                                <div className={specialImageFrameClass}>
                                    <div className={specialImageClass}>
                                        <img src="/api/v1/assets/special_bookings/day_tour.jfif" alt="Day Tour at Amalfi Resort" className={specialImageElClass} />
                                        <div className={specialOverlayClass}>
                                            <span className={specialCapacityClass}>30 - 50 GUESTS</span>
                                            <span className="ml-auto text-[0.58rem] font-black uppercase tracking-[0.1em] text-[#ffffff] [text-shadow:0_8px_20px_rgba(19,33,31,0.34)]">Limited slots</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={specialInfoClass}>
                                    <div className={specialHeaderClass}>
                                        <h3 className={specialTitleClass}>Day Tour</h3>
                                        <p className={specialPriceClass}>
                                            PHP 300 <span className="mt-0.5 block text-[0.55rem] font-extrabold tracking-[0.1em] text-[#69776f]">/ PAX</span>
                                        </p>
                                    </div>
                                    <ul className={specialFeatureListClass}>
                                        <li>Beach, pool, and cottage access for day guests.</li>
                                    </ul>
                                    <p className={specialAlertClass}>
                                        Subject to availability - Limited slots only
                                    </p>
                                    <div className={specialAmenitiesClass}>
                                        {['Beach Access', 'Pool', 'Day Use'].map(tag => (
                                            <div key={tag} className={specialAmenityClass}><div className="h-1.5 w-1.5 rounded-full bg-[#c6923f]" /><span>{tag}</span></div>
                                        ))}
                                    </div>
                                </div>
                                <div className={specialActionClass}>
                                    <button className={specialButtonClass}
                                        onClick={() => setShowDayTourModal(true)}>
                                        Book Day Tour
                                    </button>
                                </div>
                            </article>

                            {/* Tent Pitching Card */}
                            <article className={specialCardClass} id="special-tent-pitching">
                                <div className={specialImageFrameClass}>
                                    <div className={specialImageClass}>
                                        <img src="/api/v1/assets/special_bookings/tent_pitching.png" alt="Tent Pitching at Amalfi Resort" className={specialImageElClass} />
                                        <div className={specialOverlayClass}>
                                            <span className={specialCapacityClass}>MAX 20 CAMPERS</span>
                                            <span className="ml-auto text-[0.58rem] font-black uppercase tracking-[0.1em] text-[#ffffff] [text-shadow:0_8px_20px_rgba(19,33,31,0.34)]">Limited slots</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={specialInfoClass}>
                                    <div className={specialHeaderClass}>
                                        <h3 className={specialTitleClass}>Tent Pitching</h3>
                                        <p className={specialPriceClass}>
                                            PHP 500 <span className="mt-0.5 block text-[0.55rem] font-extrabold tracking-[0.1em] text-[#69776f]">/ PAX</span>
                                        </p>
                                    </div>
                                    <ul className={specialFeatureListClass}>
                                        <li>Beachfront camping for guests bringing their own tent.</li>
                                    </ul>
                                    <p className={specialAlertClass}>
                                        Subject to availability - Limited slots only
                                    </p>
                                    <div className={specialAmenitiesClass}>
                                        {['Beachfront', 'BYO Tent', 'Limited Slots'].map(tag => (
                                            <div key={tag} className={specialAmenityClass}><div className="h-1.5 w-1.5 rounded-full bg-[#c6923f]" /><span>{tag}</span></div>
                                        ))}
                                    </div>
                                </div>
                                <div className={specialActionClass}>
                                    <button className={specialButtonClass}
                                        onClick={() => setShowTentModal(true)}>
                                        Book Tent Spot
                                    </button>
                                </div>
                            </article>
                        </div>

                        <aside className={specialEditorialClass}>
                            <span className={sectionLabelClass}>Special Bookings</span>
                            <h2 className={sectionTitleClass}>Day Tour &amp; Camping</h2>
                            <div className={unitEditorialRuleClass} />
                            <p className={sectionCopyClass}>
                                Quick day visits and beachfront camping options for guests who want the Amalfi experience without booking an overnight room.
                            </p>
                            <div className={specialStatusPillClass}>
                                <span className="h-[7px] w-[7px] rounded-full bg-[#c84a4a]" />
                                Subject to availability
                            </div>
                            <div className={unitEditorialListClass}>
                                {[
                                    ['Day Visits', 'Enjoy beach, pool, and cottage access in one simple day pass.'],
                                    ['Beach Camping', 'Bring your own tent and stay close to the shoreline.'],
                                    ['Limited Slots', 'These options are managed carefully for a comfortable guest flow.'],
                                ].map(([title, copy]) => (
                                    <div key={title} className={unitEditorialItemClass}>
                                        <span className={unitEditorialIconClass}>+</span>
                                        <div>
                                            <p className={unitEditorialItemTitleClass}>{title}</p>
                                            <p className={unitEditorialItemCopyClass}>{copy}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </aside>
                    </div>
                </div>
            </section>


            <section id="amalfi-reels" className={videoSectionClass}>
                <div className="amalfi-section-bg amalfi-section-bg--soft amalfi-section-bg--heading-left" aria-hidden="true" />
                <div className={`${guestContainerClass} relative z-[1]`}>
                    <span className={sectionLabelClass}>Amalfi Reels</span>
                    <div className={sectionHeadingRowClass}>
                        <div>
                            <h2 className={sectionTitleClass}>See The Stay</h2>
                            <p className={sectionCopyClass}>Portrait clips work naturally here as quick resort previews for mobile guests and elegant framed reels on desktop.</p>
                        </div>
                        <div className={videoHeaderActionsClass}>
                            <a href="#rooms" className={sectionLinkClass}>Book After Watching</a>
                        </div>
                    </div>

                    <div className={videoRailWrapClass}>
                        <button
                            type="button"
                            className={videoSidePrevClass}
                            aria-label="Previous video"
                            onClick={() => scrollVideoRail(-1)}
                        >
                            <ChevronLeft size={18} strokeWidth={2.3} />
                        </button>
                        <div ref={videoRailRef} className={videoRailClass} aria-label="Amalfi video previews">
                            {breezeVideos.map((video) => (
                                <button
                                    key={video.src}
                                    type="button"
                                    className={videoCardClass}
                                    onClick={() => setActiveVideo(video)}
                                >
                                    <div className={videoFrameClass}>
                                        <video
                                            className={videoElClass}
                                            src={video.src}
                                            muted
                                            loop
                                            playsInline
                                            preload="metadata"
                                            onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
                                            onMouseLeave={(event) => {
                                                event.currentTarget.pause();
                                                event.currentTarget.currentTime = 0;
                                            }}
                                        />
                                        <div className={videoOverlayClass}>
                                            <span className={videoLabelClass}>{video.label}</span>
                                            <h3 className={videoTitleClass}>{video.title}</h3>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            className={videoSideNextClass}
                            aria-label="Next video"
                            onClick={() => scrollVideoRail(1)}
                        >
                            <ChevronRight size={18} strokeWidth={2.3} />
                        </button>
                    </div>
                </div>
            </section>


            <section id="experience" className={experienceSectionClass}>
                <div className="amalfi-section-bg amalfi-section-bg--ocean amalfi-section-bg--heading-left" aria-hidden="true" />
                <div className={`${guestContainerClass} relative z-[1]`}>
                    <div className={experienceHeaderClass}>
                        <div>
                            <span className={sectionLabelClass}>What's Here</span>
                            <h2 className={experienceTitleClass}>The Amalfi Experience</h2>
                        </div>
                    </div>
                    <div className={experienceCardsClass}>
                        {[
                            { num: '01', title: 'Swimming Pool', teaser: 'A refreshing pool right in the heart of the resort - no crowds, just your group.', desc: 'Cool off in our refreshing pool right in the heart of the resort. Perfect for a lazy afternoon dip or a full swim with the family - no crowd, just your group and the breeze.', img: '/api/v1/assets/facilities/swimming_pool.jfif', label: 'Swimming Pool' },
                            { num: '02', title: 'Private Beachfront', teaser: 'Exclusive beachfront for resort guests - sunsets, waves, and no tourist crowd.', desc: 'Step right onto the sand. Our beachfront is exclusive to resort guests - enjoy the sunsets, the waves, and quiet mornings without the usual tourist crowd.', img: '/api/v1/assets/facilities/beachfront.jfif', label: 'Private Beachfront' },
                            { num: '03', title: 'Special Events', teaser: 'Host your celebration, reunion, or team outing by the beach - personalized and exclusive.', desc: 'From intimate family reunions to barkada getaways and corporate events, Amalfi provides a scenic beachfront setting for your special occasion. Contact us to plan your event with our team.', img: '/api/v1/assets/facilities/special_events.jfif', label: 'Special Events' },

                        ].map(exp => (
                            <button key={exp.num} className={experienceCardClass} onClick={() => setActiveExp(exp)}>
                                <span className={experienceNumClass}>{exp.num}</span>
                                <h3 className={experienceCardTitleClass}>{exp.title}</h3>
                                <p className={experienceTeaserClass}>{exp.teaser}</p>
                                <span className={experienceMoreClass}>Learn more -&gt;</span>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Experience detail modal */}
            {activeExp && (
                <div className={appModalOverlayClass} onClick={() => setActiveExp(null)}>
                    <div className={appModalCardClass} onClick={e => e.stopPropagation()}>
                        <button className={modalCloseClass} onClick={() => setActiveExp(null)}>X</button>
                        {activeExp.img
                            ? <img src={activeExp.img} alt={activeExp.title} className={experienceModalImageClass} />
                            : <div className="mb-7 grid h-[220px] place-items-center rounded-[20px] border border-dashed border-[rgba(216,201,179,0.72)] bg-[#f8f2e8] text-[0.72rem] font-black uppercase tracking-[0.14em] text-[#69776f]">Photo coming soon</div>
                        }
                        <span className={sectionLabelClass}>Resort Feature</span>
                        <h3 className="mb-4 font-display text-[1.6rem] font-bold leading-tight text-[#13211f]">{activeExp.title}</h3>
                        <p className="text-[0.9rem] leading-[1.8] text-[#69776f]">{activeExp.desc}</p>
                    </div>
                </div>
            )}

            {/* Video preview modal */}
            {activeVideo && (
                <div className={appModalOverlayClass} onClick={() => setActiveVideo(null)}>
                    <div className={videoModalCardClass} onClick={e => e.stopPropagation()}>
                        <button className={modalCloseClass} onClick={() => setActiveVideo(null)}>X</button>
                        <video
                            src={activeVideo.src}
                            className={videoModalVideoClass}
                            controls
                            autoPlay
                            loop
                            playsInline
                        />
                        <div className={videoModalBodyClass}>
                            <span className={videoModalEyebrowClass}>{activeVideo.label}</span>
                            <h3 className={videoModalTitleClass}>{activeVideo.title}</h3>
                            <p className={videoModalIntroClass}>{activeVideo.copy}</p>
                            <p className={videoModalMoodClass}>{activeVideo.mood}</p>
                            <div className={videoModalChipsClass} aria-label={`${activeVideo.title} highlights`}>
                                {activeVideo.details.map((detail, index) => (
                                    <span key={detail} className={videoModalChipClass}>
                                        <span className={videoModalChipLabelClass}>0{index + 1}</span>
                                        <span className={videoModalChipValueClass}>{detail}</span>
                                    </span>
                                ))}
                            </div>
                            <p className={videoModalNoteClass}>{activeVideo.note}</p>
                            <a href="#rooms" className={policyButtonClass} onClick={() => setActiveVideo(null)}>Book Now</a>
                        </div>
                    </div>
                </div>
            )}

            {/* Policy modal */}
            {showPolicyModal && (
                <div className={appModalOverlayClass} onClick={() => setShowPolicyModal(false)}>
                    <div className={`${appModalCardClass} w-[min(94vw,480px)]`} onClick={e => e.stopPropagation()}>
                        <button className={modalCloseClass} onClick={() => setShowPolicyModal(false)}>X</button>
                        <span className={sectionLabelClass}>Booking Policy</span>
                        <h3 className="mb-6 font-display text-[1.4rem] font-bold leading-tight text-[#13211f]">Cancellation & Rebooking</h3>
                        <p className="mb-5 text-[0.8rem] leading-6 text-[#69776f]">A 50% downpayment is required to confirm your booking.</p>
                        <ul className="mb-7 flex list-none flex-col gap-4">
                            {policyRows.map((p, i) => (
                                <li key={i} className="border-b border-[rgba(216,201,179,0.72)] pb-4">
                                    <div className="mb-1 text-[0.8rem] font-bold text-[#13211f]">{p.condition}</div>
                                    <div className="text-[0.75rem] leading-5 text-[#69776f]">{formatPolicyAction(p)}{p.notes ? ` - ${p.notes}` : ''}</div>
                                </li>
                            ))}
                        </ul>
                        <button className={policyButtonClass} onClick={() => { setShowPolicyModal(false); setShowRebookingModal(true); }}>
                            Request Rebooking
                        </button>
                    </div>
                </div>
            )}

            <footer className={footerClass}>
                <div className={footerContainerClass}>
                    <div className={footerGridClass}>

                        {/* Column 1 - Brand */}
                        <div>
                            <p className={footerLogoClass}>AMALFI<span className="text-[#c6923f]">.</span></p>
                            <p className={footerTaglineClass}>{knowledgeBase.about?.headline || 'Beach - Sunset - Memories'}</p>
                            <p className={footerCopyClass}>{knowledgeBase.location}</p>
                            <a
                                href={knowledgeBase.about?.map_link || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={footerAccentLinkClass}
                            >
                                Get Directions -&gt;
                            </a>
                        </div>

                        <div className={footerLinkGridClass}>
                            {/* Column 2 - Quick Links */}
                            <div>
                                <h4 className={footerHeadingClass}>Quick Links</h4>
                                <ul className={footerLinksClass}>
                                    <li><a href="#rooms" className={footerLinkClass}>Our Units</a></li>
                                    <li><a href="#experience" className={footerLinkClass}>The Experience</a></li>
                                    <li><a href="#" className={footerLinkClass} onClick={(e) => { e.preventDefault(); setShowArrivalModal(true); }}>Before You Arrive</a></li>
                                    <li><a href="#" className={footerLinkClass} onClick={(e) => { e.preventDefault(); setShowPolicyModal(true); }}>Refund Policy</a></li>
                                    <li><a href="#" className={footerLinkClass} onClick={(e) => { e.preventDefault(); setShowRebookingModal(true); }}>Cancellation & Rebooking</a></li>
                                    <li><a href={knowledgeBase.about?.inquiry_link || '#'} className={footerLinkClass} target="_blank" rel="noopener noreferrer">Send Inquiry</a></li>
                                    <li><a href={knowledgeBase.socials_and_booking_links?.airbnb || '#'} className={footerLinkClass} target="_blank" rel="noopener noreferrer">Book on Airbnb</a></li>
                                </ul>
                            </div>

                            {/* Column 3 - Contact & Socials */}
                            <div>
                                <h4 className={footerHeadingClass}>Connect With Us</h4>
                                <ul className={footerLinksClass}>
                                    <li>
                                        <a href={knowledgeBase.socials_and_booking_links?.facebook || '#'} className={footerLinkClass} target="_blank" rel="noopener noreferrer">Facebook</a>
                                    </li>
                                    <li>
                                        <a href={knowledgeBase.socials_and_booking_links?.instagram || '#'} className={footerLinkClass} target="_blank" rel="noopener noreferrer">Instagram</a>
                                    </li>
                                    <li>
                                        <a href={knowledgeBase.socials_and_booking_links?.airbnb || '#'} className={footerLinkClass} target="_blank" rel="noopener noreferrer">Airbnb</a>
                                    </li>
                                </ul>
                                <p className={`${footerHeadingClass} mt-[30px]`}>Official Website</p>
                                <a href={`https://${knowledgeBase.official_website}`} className={footerAccentLinkClass} target="_blank" rel="noopener noreferrer">
                                    {knowledgeBase.official_website}
                                </a>
                            </div>
                        </div>

                    </div>

                    <div className={footerBottomClass}>
                        <p>Copyright {new Date().getFullYear()} {knowledgeBase.resort_name}. All rights reserved.</p>
                        <p>San Felipe, Zambales, Philippines</p>
                    </div>
                </div>
            </footer>


            {/* BookingModal - overnight rooms */}
            {selectedRoom && (
                <BookingModal 
                    room={selectedRoom} 
                    initialDates={searchDates} 
                    onClose={() => setSelectedRoom(null)} 
                />
            )}

            {/* SpecialBookingModal - Day Tour */}
            {showDayTourModal && (
                <SpecialBookingModal
                    onClose={() => setShowDayTourModal(false)}
                />
            )}

            {/* TentPitchingModal - multi-night camping */}
            {showTentModal && (
                <TentPitchingModal
                    onClose={() => setShowTentModal(false)}
                />
            )}

            {showRebookingModal && (
                <RebookingModal 
                    onClose={() => setShowRebookingModal(false)}
                />
            )}

            {/* Before You Arrive Modal */}
            {showArrivalModal && (
                <div className={appModalOverlayClass} onClick={() => setShowArrivalModal(false)}>
                    <div className={arrivalModalCardClass} onClick={e => e.stopPropagation()}>
                        <button className={modalCloseClass} onClick={() => setShowArrivalModal(false)}>X</button>

                        {/* Header */}
                        <div className={arrivalHeaderClass}>
                            <span className={sectionLabelClass}>Guest Guide</span>
                            <h2 className={arrivalTitleClass}>Before You Arrive</h2>
                            <p className={arrivalSubtitleClass}>Everything you need to know for a seamless stay.</p>
                        </div>

                        <div className={arrivalSectionsClass}>

                            {/* Timing */}
                            <div className={arrivalSectionClass}>
                                <div className={arrivalIconClass}>Time</div>
                                <div>
                                    <h3 className={arrivalSectionTitleClass}>Check-In & Check-Out</h3>
                                    <div className={arrivalRowClass}>
                                        <span className={arrivalKeyClass}>Check-In</span>
                                        <span className={arrivalValueClass}>{knowledgeBase.check_in_out?.check_in_time || '1:00 PM'}</span>
                                    </div>
                                    <div className={arrivalRowClass}>
                                        <span className={arrivalKeyClass}>Check-Out</span>
                                        <span className={arrivalValueClass}>{knowledgeBase.check_in_out?.check_out_time || '11:00 AM'}</span>
                                    </div>
                                    <p className={arrivalNoteClass}>Early check-in & late check-out available - subject to availability. Not applicable on holidays or back-to-back bookings.</p>
                                </div>
                            </div>

                            <div className={arrivalDividerClass} />

                            {/* What to Bring */}
                            <div className={arrivalSectionClass}>
                                <div className={arrivalIconClass}>Bring</div>
                                <div>
                                    <h3 className={arrivalSectionTitleClass}>What to Bring</h3>
                                    <ul className={arrivalListClass}>
                                        <li className={arrivalListItemClass}>Personal toiletries & towels</li>
                                        <li className={arrivalListItemClass}>Cooking ware & utensils <span className={arrivalTagClass}>or rent a set for PHP 300</span></li>
                                        <li className={arrivalListItemClass}>Your own tent <span className={arrivalTagClass}>for Tent Pitching guests</span></li>
                                        <li className={arrivalListItemClass}>Food & drinks - <strong className="font-black text-[#13211f]">no corkage fee</strong></li>
                                    </ul>
                                </div>
                            </div>

                            <div className={arrivalDividerClass} />

                            {/* Good to Know */}
                            <div className={arrivalSectionClass}>
                                <div className={arrivalIconClass}>Info</div>
                                <div>
                                    <h3 className={arrivalSectionTitleClass}>Good to Know</h3>
                                    <ul className={arrivalListClass}>
                                        <li className={arrivalListItemClass}>Kids 5 & under are <strong className="font-black text-[#13211f]">FREE</strong> - up to 2 per villa</li>
                                        <li className={arrivalListItemClass}>Complimentary WiFi & secure parking</li>
                                        <li className={arrivalListItemClass}>24/7 CCTV security on premises</li>
                                        <li className={arrivalListItemClass}>50% downpayment required to confirm any booking</li>
                                    </ul>
                                </div>
                            </div>

                            <div className={arrivalDividerClass} />

                            {/* Getting Here */}
                            <div className={arrivalSectionClass}>
                                <div className={arrivalIconClass}>Map</div>
                                <div>
                                    <h3 className={arrivalSectionTitleClass}>Getting Here</h3>
                                    <p className="mb-3.5 text-[0.75rem] leading-[1.6] text-[#69776f]">{knowledgeBase.location}</p>
                                    <a
                                        href={knowledgeBase.about?.map_link || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={arrivalMapButtonClass}
                                    >
                                        Open in Google Maps -&gt;
                                    </a>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* Developer Spotlight Modal */}
            {showDevPopup && (
                <div className={appModalOverlayClass} onClick={() => setShowDevPopup(false)}>
                    <div className={devModalCardClass} onClick={e => e.stopPropagation()}>
                        <button className={modalCloseClass} onClick={() => setShowDevPopup(false)}>X</button>
                        
                        <div className={devHeaderClass}>
                            <div className={devAvatarClass}>JV</div>
                            <h2 className={devNameClass}>Jan Vincent Chioco</h2>
                            <p className={devTitleClass}>Full Stack Developer</p>
                        </div>

                        <div className={devBodyClass}>
                            <div className={devLinksClass}>
                                <a href="http://huwanbisente-portfolio.me/" target="_blank" rel="noopener noreferrer" className={devLinkClass}>
                                    <span className={devLinkIconClass}>Web</span>
                                    <span>Portfolio Page</span>
                                </a>
                                <a href="mailto:chiocojv@gmail.com" className={devLinkClass}>
                                    <span className={devLinkIconClass}>Email</span>
                                    <span>chiocojv@gmail.com</span>
                                </a>
                                <a href="https://github.com/huwanbisente" target="_blank" rel="noopener noreferrer" className={devLinkClass}>
                                    <span className={devLinkIconClass}>GitHub</span>
                                    <span>GitHub Profile</span>
                                </a>
                                <a href="https://www.linkedin.com/in/jvchioco/" target="_blank" rel="noopener noreferrer" className={devLinkClass}>
                                    <span className={devLinkIconClass}>LinkedIn</span>
                                    <span>LinkedIn Professional</span>
                                </a>
                                <a href="https://www.facebook.com/jan.vincent.chioco" target="_blank" rel="noopener noreferrer" className={devLinkClass}>
                                    <span className={devLinkIconClass}>Facebook</span>
                                    <span>Facebook Connect</span>
                                </a>
                                <a href="https://www.instagram.com/huwanbisente/" target="_blank" rel="noopener noreferrer" className={devLinkClass}>
                                    <span className={devLinkIconClass}>Instagram</span>
                                    <span>Instagram Feed</span>
                                </a>
                            </div>
                        </div>

                        <div className={devFooterClass}>
                            <p className={devFooterTextClass}>Handcrafted with soul and too much caffeine for Amalfi Resort.</p>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
            </Routes>
        </Router>
    );
}

export default App;
