import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { format, addDays, startOfMonth, endOfMonth, isSameDay, differenceInCalendarDays } from 'date-fns';
import { useOccupancy } from '../hooks/useOccupancy';
import { exportToPng } from '../utils/exportToPng';
import { api } from '../utils/api';
import { buildCalendarTimeline, getCalendarDayMeta, getCalendarWindowDays, getCalendarWindowLabel } from '../utils/calendarWindow';
import { formatDateTimeInManila, getManilaTodayDate, getManilaTodayKey, parseDateOnlyAsLocalDate } from '../utils/manilaDate';
import { paymentStatusLabel } from '../utils/statusLabels';
import { getBookingReferenceSuffix, getCompactMapBookingRef } from '../utils/bookingReference';
import { Button } from '@/components/shared';
import { embossedModalFrameClass } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Color tokens for the high-contrast booking map palette
const RESERVED = {
    bg:         'rgba(37, 99, 235, 0.15)',
    border:     '#2563eb',
    text:       '#1e3a8a',
    icon:       '',
    label:      'Reserved',
    dot:        '#3b82f6',
    legendBg:   'rgba(37, 99, 235, 0.10)',
};
const INQUIRY = {
    bg:         'rgba(245, 158, 11, 0.25)', // Amber-500 tint
    border:     '#b45309',                 // Amber-700
    text:       '#78350f',                 // Amber-900
    icon:       '',
    label:      'Awaiting Confirmation',
    dot:        '#f59e0b',
    legendBg:   'rgba(245, 158, 11, 0.15)',
};
const CHECKED_IN = {
    bg:         'rgba(16, 185, 129, 0.22)', // Emerald-500 tint
    border:     '#047857',                 // Emerald-700
    text:       '#064e3b',                 // Emerald-950
    icon:       '',
    label:      'Check-In',
    dot:        '#10b981',
    legendBg:   'rgba(16, 185, 129, 0.15)',
};
const OVERDUE = {
    bg:         'rgba(244, 63, 94, 0.22)',  // Rose-500 tint
    border:     '#be123c',                 // Rose-700
    text:       '#881337',                 // Rose-950
    icon:       '',
    label:      'Action Needed',
    dot:        '#f43f5e',
    legendBg:   'rgba(244, 63, 94, 0.15)',
};
const UNIT_BLOCKED = {
    bg:         'rgba(22, 101, 52, 0.20)',
    border:     '#166534',
    text:       '#052e16',
    icon:       '',
    label:      'Scheduled Hold',
    dot:        '#15803d',
    legendBg:   'rgba(22, 101, 52, 0.14)',
};
const LIVE_MAINTENANCE = {
    bg:         'rgba(219, 39, 119, 0.18)',
    border:     '#be185d',
    text:       '#831843',
    icon:       '',
    label:      'Live Maintenance',
    dot:        '#db2777',
    legendBg:   'rgba(219, 39, 119, 0.13)',
};
const LIVE_CLEANING = {
    bg:         'rgba(245, 158, 11, 0.18)',
    border:     '#b45309',
    text:       '#78350f',
    icon:       '',
    label:      'Live Cleaning',
    dot:        '#f59e0b',
    legendBg:   'rgba(245, 158, 11, 0.13)',
};
const LIVE_INSPECTION = {
    bg:         'rgba(99, 102, 241, 0.18)',
    border:     '#4f46e5',
    text:       '#312e81',
    icon:       '',
    label:      'Live Inspection',
    dot:        '#6366f1',
    legendBg:   'rgba(99, 102, 241, 0.13)',
};
const DAY_TOUR = {
    bg:         'rgba(8, 145, 178, 0.20)', // Cyan-600 tint
    border:     '#0e7490',                 // Cyan-700
    text:       '#164e63',                 // Cyan-950
    icon:       '',
    label:      'Day Tour',
    dot:        '#06b6d4',
    legendBg:   'rgba(8, 145, 178, 0.15)',
    headerBg:   'rgba(8, 145, 178, 0.10)',
    headerColor:'#0e7490',
    rowBg:      'rgba(8, 145, 178, 0.05)',
};
const TENT_ZONE = {
    bg:         'rgba(139, 92, 246, 0.20)', // Violet-500 tint
    border:     '#6d28d9',                 // Violet-700
    text:       '#4c1d95',                 // Violet-950
    icon:       '',
    label:      'Camping',
    dot:        '#8b5cf6',
    legendBg:   'rgba(139, 92, 246, 0.15)',
    headerBg:   'rgba(139, 92, 246, 0.10)',
    headerColor:'#6d28d9',
    rowBg:      'rgba(139, 92, 246, 0.05)',
};
const CHECKED_OUT = {
    bg:         'rgba(100, 116, 139, 0.14)',
    border:     '#64748b',
    text:       '#334155',
    icon:       '',
    label:      'Check-Out',
    dot:        '#94a3b8',
    legendBg:   'rgba(100, 116, 139, 0.10)',
};
const AVAILABLE_STATUS = {
    bg:         'rgba(248, 250, 252, 0.92)',
    border:     '#94a3b8',
    text:       '#475569',
    label:      'Available',
    dot:        '#94a3b8',
    legendBg:   'rgba(248, 250, 252, 0.92)',
};
const TENT_CAPACITY = 20;

const STATUS_FILTERS = [
    { id: 'available', label: 'Available', token: AVAILABLE_STATUS },
    { id: 'reserved', label: 'Reserved', token: RESERVED },
    { id: 'pending', label: 'Pending', token: INQUIRY },
    { id: 'checkin', label: 'Check-In', token: CHECKED_IN },
    { id: 'checkout', label: 'Check-Out', token: CHECKED_OUT },
    { id: 'cleaning', label: 'Cleaning', token: LIVE_CLEANING },
    { id: 'maintenance', label: 'Maintenance', token: LIVE_MAINTENANCE },
    { id: 'inspection', label: 'Inspection', token: LIVE_INSPECTION },
    { id: 'action', label: 'Action', token: OVERDUE },
    { id: 'daytour', label: 'Day Tour', token: DAY_TOUR },
    { id: 'camping', label: 'Camping 20', token: TENT_ZONE },
];
const ALL_STATUS_FILTER_IDS = STATUS_FILTERS.map((filter) => filter.id);

const AVAILABLE_COL  = '#fff';          // Purified Excel White
const TODAY_COL      = 'rgba(0,0,0,0)'; // Removed Green Highlight
const GRID_LINE      = 'rgba(31, 41, 55, 0.09)';
const CROSSHAIR_BG   = 'rgba(15, 23, 42, 0.08)'; // Slightly darker for better visibility
const SLOT_ALT_BG    = '#fff';
const ROW_H          = 48;
const COL_W_WEEK     = 90;
const COL_W_BIWEEK   = 60;
const COL_W_MONTH    = 36;
const UNIT_COL_W     = 230;
const BOOKING_BOARD_LEFT_W = 320;
const DAY_TOUR_SLOTS = 2;   // max day tours per day

const TRACKER_THEME = {
    shell: '#f4f1e8',
    board: '#fbfaf5',
    chrome: '#17352b',
    chromeAlt: '#2c5a49',
    chromeSoft: '#3f6f5d',
    textOnChrome: '#f7f6f0',
    sand: '#ece4d3',
    sandSoft: '#f6f0e4',
    line: 'rgba(32, 52, 44, 0.12)',
    unitPanel: '#f2ede1',
    unitPanelAlt: '#faf7ef',
    unitPanelEdge: '#e0d5bc',
    category: '#c58a3e',
    glow: 'rgba(197, 138, 62, 0.22)',
    lagoon: '#d8ece8',
    reef: '#e7f2fb',
    dusk: '#efe7fb',
};

function flowToneClasses(token, lane = 'overnight') {
    if (token === LIVE_CLEANING) return {
        card: 'border-[#f2e6ce] bg-[linear-gradient(135deg,#fffdf8_0%,#fff9ef_58%,#fbf1df_100%)] text-[#a46b13] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#fff3d5] via-[#e8c77f] to-[#c6923f] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#a46b13]',
        value: 'text-[#74480c]',
    };
    if (token === LIVE_MAINTENANCE) return {
        card: 'border-[#f4cfe1] bg-[linear-gradient(135deg,#fffafd_0%,#fff0f7_55%,#fce3ef_100%)] text-[#be185d] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#fce7f3] via-[#f472b6] to-[#be185d] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#be185d]',
        value: 'text-[#831843]',
    };
    if (token === LIVE_INSPECTION) return {
        card: 'border-[#d8d7fb] bg-[linear-gradient(135deg,#fbfbff_0%,#f0efff_55%,#e0e7ff_100%)] text-[#4f46e5] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#e0e7ff] via-[#818cf8] to-[#4f46e5] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#4f46e5]',
        value: 'text-[#312e81]',
    };
    if (token === UNIT_BLOCKED) return {
        card: 'border-[#c9e6ce] bg-[linear-gradient(135deg,#fbfffb_0%,#ecfdf3_54%,#dcfce7_100%)] text-[#166534] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#dcfce7] via-[#86efac] to-[#166534] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#166534]',
        value: 'text-[#052e16]',
    };
    if (token === OVERDUE) return {
        card: 'border-[#f2dada] bg-[linear-gradient(135deg,#fffdfd_0%,#fff6f6_58%,#fceeee_100%)] text-[#c84a4a] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#ffe4e4] via-[#efa1a1] to-[#d75a5a] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#c84a4a]',
        value: 'text-[#9f2f2f]',
    };
    if (token === CHECKED_IN) return {
        card: 'border-[#d9eee8] bg-[linear-gradient(135deg,#fbfffd_0%,#f1faf7_58%,#eaf7f3_100%)] text-[#0a6b5f] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#d7fbef] via-[#8ee5cd] to-[#20a889] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#0a6b5f]',
        value: 'text-[#064f47]',
    };
    if (token === CHECKED_OUT) return {
        card: 'border-[#f2e6ce] bg-[linear-gradient(135deg,#fffdf8_0%,#fff9ef_58%,#fbf1df_100%)] text-[#a46b13] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#fff3d5] via-[#e8c77f] to-[#c6923f] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#5f6d66]',
        value: 'text-[#13211f]',
    };
    if (token === INQUIRY) return {
        card: 'border-[#f2e6ce] bg-[linear-gradient(135deg,#fffdf8_0%,#fff9ef_58%,#fbf1df_100%)] text-[#a46b13] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#fff3d5] via-[#e8c77f] to-[#c6923f] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#a46b13]',
        value: 'text-[#74480c]',
    };
    if (token === RESERVED) return {
        card: 'border-[#d4e2fb] bg-[linear-gradient(135deg,#fbfdff_0%,#eef5ff_58%,#dbeafe_100%)] text-[#2563eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#dbeafe] via-[#60a5fa] to-[#2563eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#2563eb]',
        value: 'text-[#1e3a8a]',
    };
    if (token === DAY_TOUR || lane === 'daytour') return {
        card: 'border-[#c8eef4] bg-[linear-gradient(135deg,#fbfeff_0%,#ecfeff_58%,#cffafe_100%)] text-[#0e7490] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#cffafe] via-[#67e8f9] to-[#0e7490] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#0e7490]',
        value: 'text-[#164e63]',
    };
    if (token === TENT_ZONE || lane === 'camping') return {
        card: 'border-[#e5ddfa] bg-[linear-gradient(135deg,#fffdfd_0%,#f8f4ff_58%,#f2ecff_100%)] text-[#5b35b1] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#eee4ff] via-[#c6adff] to-[#7f5fd5] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#5b35b1]',
        value: 'text-[#3f2583]',
    };
    return {
        card: 'border-[#dbeaf3] bg-[linear-gradient(135deg,#fbfdff_0%,#f2f8fe_58%,#edf5fb_100%)] text-[#266c83] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)]',
        marker: 'bg-gradient-to-b from-[#dff1ff] via-[#9fd0e6] to-[#4b97b2] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]',
        accent: 'text-[#266c83]',
        value: 'text-[#0c4d66]',
    };
}

function flowMapBlockClasses(token, lane = 'overnight') {
    if (token === LIVE_CLEANING) return {
        block: 'border-amber-600 bg-[linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.98)_100%)] shadow-[0_5px_14px_rgba(180,83,9,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-amber-600',
        accentText: 'text-amber-700',
        text: 'text-amber-950',
    };
    if (token === LIVE_MAINTENANCE) return {
        block: 'border-pink-700 bg-[linear-gradient(135deg,rgba(253,242,248,0.98)_0%,rgba(252,231,243,0.98)_100%)] shadow-[0_5px_14px_rgba(190,24,93,0.14),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-pink-700',
        accentText: 'text-pink-700',
        text: 'text-pink-950',
    };
    if (token === LIVE_INSPECTION) return {
        block: 'border-indigo-600 bg-[linear-gradient(135deg,rgba(238,242,255,0.98)_0%,rgba(224,231,255,0.98)_100%)] shadow-[0_5px_14px_rgba(79,70,229,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-indigo-600',
        accentText: 'text-indigo-700',
        text: 'text-indigo-950',
    };
    if (token === UNIT_BLOCKED) return {
        block: 'border-green-800 bg-[linear-gradient(135deg,rgba(240,253,244,0.98)_0%,rgba(187,247,208,0.98)_100%)] shadow-[0_5px_14px_rgba(22,101,52,0.14),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-green-800',
        accentText: 'text-green-800',
        text: 'text-green-950',
    };
    if (token === OVERDUE) return {
        block: 'border-rose-500 bg-[linear-gradient(135deg,rgba(255,241,242,0.98)_0%,rgba(255,228,230,0.98)_100%)] shadow-[0_5px_14px_rgba(190,18,60,0.14),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-rose-600',
        accentText: 'text-rose-700',
        text: 'text-rose-950',
    };
    if (token === CHECKED_IN) return {
        block: 'border-emerald-600 bg-[linear-gradient(135deg,rgba(236,253,245,0.98)_0%,rgba(209,250,229,0.98)_100%)] shadow-[0_5px_14px_rgba(4,120,87,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-emerald-700',
        accentText: 'text-emerald-700',
        text: 'text-emerald-950',
    };
    if (token === CHECKED_OUT) return {
        block: 'border-[#b9aa8f] bg-[linear-gradient(135deg,rgba(255,253,248,0.98)_0%,rgba(231,221,203,0.98)_100%)] shadow-[0_5px_14px_rgba(19,33,31,0.10),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-[#69776f]',
        accentText: 'text-[#5f6d66]',
        text: 'text-[#13211f]',
    };
    if (token === INQUIRY) return {
        block: 'border-amber-600 bg-[linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.98)_100%)] shadow-[0_5px_14px_rgba(180,83,9,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-amber-600',
        accentText: 'text-amber-700',
        text: 'text-amber-950',
    };
    if (token === RESERVED) return {
        block: 'border-blue-600 bg-[linear-gradient(135deg,rgba(239,246,255,0.98)_0%,rgba(219,234,254,0.98)_100%)] shadow-[0_5px_14px_rgba(37,99,235,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-blue-600',
        accentText: 'text-blue-700',
        text: 'text-blue-950',
    };
    if (token === DAY_TOUR || lane === 'daytour') return {
        block: 'border-cyan-700 bg-[linear-gradient(135deg,rgba(236,254,255,0.98)_0%,rgba(207,250,254,0.98)_100%)] shadow-[0_5px_14px_rgba(14,116,144,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-cyan-700',
        accentText: 'text-cyan-700',
        text: 'text-cyan-950',
    };
    if (token === TENT_ZONE || lane === 'camping') return {
        block: 'border-violet-500 bg-[linear-gradient(135deg,rgba(248,245,255,0.98)_0%,rgba(237,233,254,0.98)_100%)] shadow-[0_5px_14px_rgba(109,40,217,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-violet-700',
        accentText: 'text-violet-700',
        text: 'text-violet-950',
    };
    return {
        block: 'border-blue-600 bg-[linear-gradient(135deg,rgba(239,246,255,0.98)_0%,rgba(219,234,254,0.98)_100%)] shadow-[0_5px_14px_rgba(37,99,235,0.13),inset_0_1px_0_rgba(255,255,255,0.72)]',
        marker: 'bg-blue-600',
        accentText: 'text-blue-700',
        text: 'text-blue-950',
    };
}

function getFlowBookingStyle(token, lane = 'overnight') {
    if (token === OVERDUE) {
        return {
            fill: 'linear-gradient(135deg, rgba(255,238,242,0.98) 0%, rgba(255,229,236,0.98) 100%)',
            accent: '#be123c',
            edge: '#e11d48',
            shadow: 'rgba(190, 18, 60, 0.12)',
            text: '#881337',
        };
    }
    if (token === CHECKED_IN) {
        return {
            fill: 'linear-gradient(135deg, rgba(235,252,246,0.98) 0%, rgba(221,246,236,0.98) 100%)',
            accent: '#047857',
            edge: '#10b981',
            shadow: 'rgba(4, 120, 87, 0.12)',
            text: '#064e3b',
        };
    }
    if (token === CHECKED_OUT) {
        return {
            fill: 'linear-gradient(135deg, rgba(248,250,252,0.96) 0%, rgba(226,232,240,0.96) 100%)',
            accent: '#64748b',
            edge: '#94a3b8',
            shadow: 'rgba(100, 116, 139, 0.10)',
            text: '#334155',
        };
    }
    if (token === INQUIRY) {
        return {
            fill: 'linear-gradient(135deg, rgba(255,247,223,0.98) 0%, rgba(252,238,204,0.98) 100%)',
            accent: '#b45309',
            edge: '#f59e0b',
            shadow: 'rgba(180, 83, 9, 0.12)',
            text: '#78350f',
        };
    }
    if (token === DAY_TOUR || lane === 'daytour') {
        return {
            fill: 'linear-gradient(135deg, rgba(241,249,255,0.98) 0%, rgba(223,241,253,0.98) 100%)',
            accent: '#0369a1',
            edge: '#38bdf8',
            shadow: 'rgba(3, 105, 161, 0.14)',
            text: '#0c4a6e',
        };
    }
    if (token === TENT_ZONE || lane === 'camping') {
        return {
            fill: 'linear-gradient(135deg, rgba(248,245,255,0.98) 0%, rgba(237,233,254,0.98) 100%)',
            accent: '#6d28d9',
            edge: '#8b5cf6',
            shadow: 'rgba(109, 40, 217, 0.13)',
            text: '#4c1d95',
        };
    }
    return {
        fill: 'linear-gradient(135deg, rgba(239,246,255,0.98) 0%, rgba(219,234,254,0.98) 100%)',
        accent: '#2563eb',
        edge: '#60a5fa',
        shadow: 'rgba(37, 99, 235, 0.12)',
        text: '#1e3a8a',
    };
}

function gridStartClass(startCol) {
    return `[grid-column-start:${Math.max(1, Number(startCol || 0) + 1)}]`;
}

function gridSpanClass(spanCols) {
    return `[grid-column-end:span_${Math.max(1, Number(spanCols || 1))}]`;
}

function blockZClass(index) {
    return `z-[${Math.min(28, Math.max(5, 5 + Number(index || 0)))}]`;
}

function tentHeightClass(count) {
    return `h-[${Math.min(100, Math.max(0, Math.round((Number(count || 0) / TENT_CAPACITY) * 100)))}%]`;
}

function getLiveUnitStateMeta(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'maintenance' || normalized === 'blocked') {
        return {
            id: 'maintenance',
            label: 'Maintenance',
            action: 'Repair before release',
            token: LIVE_MAINTENANCE,
            origin: 'unit_status_maintenance',
            status: 'MAINTENANCE',
        };
    }
    if (normalized === 'requires cleaning' || normalized === 'cleaning' || normalized === 'needs cleaning') {
        return {
            id: 'cleaning',
            label: 'Cleaning',
            action: 'Assign housekeeping',
            token: LIVE_CLEANING,
            origin: 'unit_status_cleaning',
            status: 'CLEANING',
        };
    }
    if (normalized === 'inspection' || normalized === 'inspect') {
        return {
            id: 'inspection',
            label: 'Inspection',
            action: 'Manager inspection',
            token: LIVE_INSPECTION,
            origin: 'unit_status_inspection',
            status: 'INSPECTION',
        };
    }
    return null;
}

function isLiveUnitStateRecord(record = {}) {
    return Boolean(getLiveUnitStateMeta(record.live_unit_status || record.status))
        || String(record.record_origin || '').startsWith('unit_status_');
}

function slotStyle(span) {
    const today = getManilaTodayKey();

    const liveStateMeta = getLiveUnitStateMeta(span.live_unit_status || span.status);
    if (isLiveUnitStateRecord(span) && liveStateMeta) return liveStateMeta.token;
    if (span.status === 'UNIT_BLOCKED' || span.record_origin === 'unit_date_tag') return UNIT_BLOCKED;
    
    // 1. Overdue Logic: If Checkout date <= Today and still CHECKED_IN
    if (span.status === 'CHECKED_IN' && span.check_out <= today) {
        return OVERDUE;
    }
    
    // 2. Physical Status Priority
    if (span.status === 'CHECKED_IN') return CHECKED_IN;
    if (span.status === 'CHECKED_OUT') return CHECKED_OUT;
    
    // 3. Pending Verification / Inquiry Priority (Soft-Block States)
    if (span.status === 'PENDING_VERIFICATION') return INQUIRY;
    
    // 4. Fallback: Reserved (includes RESERVED)
    return RESERVED;
}

function getStatusFilterId(record = {}, todayKey = getManilaTodayKey()) {
    const liveStateMeta = getLiveUnitStateMeta(record.live_unit_status || record.status);
    if (isLiveUnitStateRecord(record) && liveStateMeta) return liveStateMeta.id;
    if (record.record_origin === 'unit_date_tag' || record.status === 'UNIT_BLOCKED') return 'action';
    if (record.booking_type === 'day_tour') return 'daytour';
    if (record.booking_type === 'tent_pitching' || record.unit_id === 'CAMP-ZONE') return 'camping';
    if (record.status === 'CHECKED_IN' && record.check_out <= todayKey) return 'action';
    if (record.status === 'CHECKED_IN') return 'checkin';
    if (record.status === 'CHECKED_OUT') return 'checkout';
    if (record.status === 'PENDING_VERIFICATION') return 'pending';
    return 'reserved';
}

function isScheduledHold(record = {}) {
    return record.record_origin === 'unit_date_tag' || record.status === 'UNIT_BLOCKED';
}

function getScheduledHoldReason(record = {}) {
    return record.room_type || record.tag_type || record.full_name || record.guest_name || record.notes || 'Scheduled Hold';
}

function getMapPrimaryLabel(record = {}) {
    const liveStateMeta = getLiveUnitStateMeta(record.live_unit_status || record.status);
    if (isLiveUnitStateRecord(record) && liveStateMeta) return liveStateMeta.label;
    if (isScheduledHold(record)) return getScheduledHoldReason(record);
    return getBookingReferenceSuffix(record, 4);
}

function getMapSecondaryLabel(record = {}) {
    if (isLiveUnitStateRecord(record)) return 'Live unit state';
    if (isScheduledHold(record)) return record.notes || record.note || 'Scheduled hold';
    if (record.status === 'CHECKED_IN') return 'CHECKED IN';
    if (record.status === 'CHECKED_OUT') return 'CHECK-OUT';
    if (record.status === 'PENDING_VERIFICATION') return 'PEND';
    return 'RESERVED';
}

function getUnitStatusReferenceLabel(record = {}) {
    if (!record) return '-';
    const liveStateMeta = getLiveUnitStateMeta(record.live_unit_status || record.status);
    if (isLiveUnitStateRecord(record) && liveStateMeta) return liveStateMeta.label;
    if (isScheduledHold(record)) return getScheduledHoldReason(record);
    return record.booking_ref || '-';
}

function getUnitOperationStatus(currentBooking) {
    if (!currentBooking) {
        return {
            label: 'Available',
            tone: '#475569',
            bg: 'rgba(248, 250, 252, 0.92)',
            border: 'rgba(100, 116, 139, 0.28)',
            rowBg: '#ffffff',
        };
    }

    if (currentBooking.status === 'UNIT_BLOCKED' || currentBooking.record_origin === 'unit_date_tag') {
        return {
            label: 'Blocked',
            tone: '#8a6000',
            bg: 'rgba(245, 158, 11, 0.15)',
            border: '#b45309',
            rowBg: 'rgba(255, 251, 235, 0.74)',
        };
    }

    const liveStateMeta = getLiveUnitStateMeta(currentBooking.live_unit_status || currentBooking.status);
    if (isLiveUnitStateRecord(currentBooking) && liveStateMeta) {
        return {
            label: liveStateMeta.label,
            tone: liveStateMeta.token.text,
            bg: liveStateMeta.token.legendBg,
            border: liveStateMeta.token.border,
            rowBg: liveStateMeta.id === 'cleaning'
                ? 'rgba(255, 251, 235, 0.70)'
                : liveStateMeta.id === 'inspection'
                ? 'rgba(240, 249, 255, 0.70)'
                : 'rgba(255, 241, 242, 0.70)',
        };
    }

    const token = slotStyle(currentBooking);
    const label = currentBooking.status === 'CHECKED_IN'
        ? 'Checked In'
        : currentBooking.status === 'CHECKED_OUT'
        ? 'Check-Out'
        : currentBooking.status === 'PENDING_VERIFICATION'
        ? 'Pending'
        : 'Reserved';

    return {
        label,
        tone: token.text,
        bg: token.legendBg || token.bg,
        border: token.border,
        rowBg: currentBooking.status === 'CHECKED_OUT'
            ? 'rgba(248, 250, 252, 0.72)'
            : currentBooking.status === 'CHECKED_IN'
            ? 'rgba(236, 253, 245, 0.62)'
            : currentBooking.status === 'PENDING_VERIFICATION'
            ? 'rgba(255, 251, 235, 0.70)'
            : 'rgba(239, 246, 255, 0.62)',
    };
}

function unitOperationRowClass(status) {
    if (status === 'Cleaning') return 'bg-amber-50/70';
    if (status === 'Maintenance') return 'bg-rose-50/70';
    if (status === 'Inspection') return 'bg-sky-50/70';
    if (status === 'Blocked') return 'bg-amber-50/70';
    if (status === 'Checked In') return 'bg-emerald-50/70';
    if (status === 'Check-Out') return 'bg-[#f2ede1]/80';
    if (status === 'Pending') return 'bg-amber-50/80';
    if (status === 'Reserved') return 'bg-blue-50/70';
    return 'bg-[#fffdf8]';
}

function unitOperationStatusClass(status) {
    if (status === 'Cleaning') return 'border-amber-600 bg-amber-100/80 text-amber-950';
    if (status === 'Maintenance') return 'border-rose-700 bg-rose-100/80 text-rose-900';
    if (status === 'Inspection') return 'border-sky-700 bg-sky-100/80 text-sky-950';
    if (status === 'Blocked') return 'border-amber-600 bg-amber-100/80 text-amber-800';
    if (status === 'Checked In') return 'border-emerald-700 bg-emerald-100/80 text-emerald-950';
    if (status === 'Check-Out') return 'border-[#b9aa8f] bg-[#f2ede1] text-[#5f6d66]';
    if (status === 'Pending') return 'border-amber-700 bg-amber-100/80 text-amber-950';
    if (status === 'Reserved') return 'border-blue-600 bg-blue-100/80 text-blue-950';
    return 'border-[#c9b895] bg-[#fffdf8] text-[#5f6d66]';
}

function bookingDrawerToneClass(booking = {}) {
    const liveStateMeta = getLiveUnitStateMeta(booking.live_unit_status || booking.status);
    if (isLiveUnitStateRecord(booking) && liveStateMeta) {
        if (liveStateMeta.id === 'cleaning') {
            return { header: 'bg-amber-50', eyebrow: 'text-amber-700', status: 'text-amber-950' };
        }
        if (liveStateMeta.id === 'inspection') {
            return { header: 'bg-sky-50', eyebrow: 'text-sky-700', status: 'text-sky-950' };
        }
        return { header: 'bg-rose-50', eyebrow: 'text-rose-700', status: 'text-rose-950' };
    }
    if (booking.status === 'UNIT_BLOCKED' || booking.record_origin === 'unit_date_tag') {
        return {
            header: 'bg-amber-50',
            eyebrow: 'text-amber-700',
            status: 'text-amber-950',
        };
    }
    if (booking.status === 'CHECKED_IN') {
        return {
            header: 'bg-emerald-50',
            eyebrow: 'text-emerald-700',
            status: 'text-emerald-950',
        };
    }
    if (booking.status === 'CHECKED_OUT') {
        return {
            header: 'bg-slate-50',
            eyebrow: 'text-slate-600',
            status: 'text-slate-700',
        };
    }
    if (booking.status === 'PENDING_VERIFICATION') {
        return {
            header: 'bg-amber-50',
            eyebrow: 'text-amber-700',
            status: 'text-amber-950',
        };
    }
    if (booking.booking_type === 'day_tour') {
        return {
            header: 'bg-sky-50',
            eyebrow: 'text-sky-700',
            status: 'text-sky-950',
        };
    }
    if (booking.booking_type === 'tent_pitching' || booking.unit_id === 'CAMP-ZONE') {
        return {
            header: 'bg-violet-50',
            eyebrow: 'text-violet-700',
            status: 'text-violet-950',
        };
    }
    return {
        header: 'bg-blue-50',
        eyebrow: 'text-blue-700',
        status: 'text-blue-950',
    };
}

// Legacy BookingSummaryModal removed in favor of Unified Master Hub (AdminBookingModal)

// View configuration
const VIEWS = [
    { id: 'week',    label: '7-Day',    days: 7,  colW: COL_W_WEEK },
    { id: 'biweek',  label: '14-Day',   days: 14, colW: COL_W_BIWEEK },
    { id: 'month',   label: 'Month',    days: 30, colW: COL_W_MONTH },
];

function sanctuaryBoardWidthClass(daysToShow) {
    if (daysToShow === 7) return 'w-[860px]';
    if (daysToShow === 14) return 'w-[1070px]';
    if (daysToShow === 28) return 'w-[1238px]';
    if (daysToShow === 29) return 'w-[1274px]';
    if (daysToShow === 30) return 'w-[1310px]';
    return 'w-[1346px]';
}

function sanctuaryGridColumnsClass(daysToShow) {
    if (daysToShow === 7) return 'grid-cols-7';
    if (daysToShow === 14) return 'grid-cols-14';
    if (daysToShow === 28) return 'grid-cols-[repeat(28,minmax(0,1fr))]';
    if (daysToShow === 29) return 'grid-cols-[repeat(29,minmax(0,1fr))]';
    if (daysToShow === 30) return 'grid-cols-[repeat(30,minmax(0,1fr))]';
    return 'grid-cols-[repeat(31,minmax(0,1fr))]';
}

const CATEGORY_PRIORITY = {
    'owners-villa':  { rank: 1, label: "OWNER'S VILLA",             color: '#475569' }, /* Slate-600 */
    'pool-villa':    { rank: 2, label: 'POOL VILLAS',               color: '#475569' },
    'beach-villa':   { rank: 3, label: 'BEACH VILLAS',              color: '#475569' },
    'big-fan-kubo':  { rank: 4, label: 'BIG FAN KUBOS',             color: '#64748b' }, /* Slate-500 */
    'ac-kubo':       { rank: 5, label: 'AC KUBOS',                  color: '#64748b' },
    'ac-teepee':     { rank: 6, label: 'AC TEEPEES',                color: '#64748b' },
    'fan-kubo':      { rank: 7, label: 'FAN KUBOS',                 color: '#64748b' },
};

function normalizeMapKey(value) {
    return value ? String(value).toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
}

function findCategoryId(raw) {
    const normalized = normalizeMapKey(raw);
    if (!normalized) return null;
    return Object.keys(CATEGORY_PRIORITY).find((key) => normalizeMapKey(key) === normalized) || null;
}

function deriveCategoryIdFromRecord(record = {}) {
    return (
        findCategoryId(record.room_type_id) ||
        findCategoryId(record.room_type) ||
        findCategoryId(String(record.unit_id || '').replace(/-\d+$/, '')) ||
        null
    );
}

function resolveBookingEndDate(record = {}) {
    const start = parseDateOnlyAsLocalDate(record.check_in);
    const end = parseDateOnlyAsLocalDate(record.check_out);
    if (!start) return null;
    if (!end || end <= start || record.booking_type === 'day_tour') return addDays(start, 1);
    return end;
}

function formatBookingMoney(value) {
    return `PHP ${Number(value || 0).toLocaleString()}`;
}

function formatCompactDate(value) {
    const date = parseDateOnlyAsLocalDate(value);
    return date ? format(date, 'M/d') : '-';
}

function formatCompactStay(checkIn, checkOut) {
    const start = formatCompactDate(checkIn);
    const end = formatCompactDate(checkOut);
    if (start === '-' && end === '-') return '-';
    return `${start}-${end}`;
}

function formatCompactMoney(value) {
    const amount = Number(value || 0);
    if (Math.abs(amount) >= 1000000) return `P${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `P${Math.round(amount / 1000)}K`;
    return `P${amount.toLocaleString()}`;
}

function getAdminUnitLabel(unit = {}) {
    return unit.unit_label || unit.unit_id || unit.room_type || unit.room_type_id || 'Unit';
}

// Main grid
export function AvailabilityGrid({ onDataChanged, onOpenBookingEditor, onOpenBookingSummary }) {
    const { units, bookings, dayTours, loading, refreshing, error, lastUpdated, refresh } = useOccupancy();
    const [viewStart, setViewStart]             = useState(() => startOfMonth(getManilaTodayDate()));
    const [viewId, setViewId]                   = useState('month');
    const [visualMode, setVisualMode]           = useState('units');
    const [searchQuery, setSearchQuery]         = useState('');
    const [categoryFilter, setCategoryFilter]   = useState('all');
    const [activeStatusFilters, setActiveStatusFilters] = useState(() => ALL_STATUS_FILTER_IDS);
    const [statusDateKey, setStatusDateKey]     = useState(() => getManilaTodayKey());
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [drawerBusy, setDrawerBusy]           = useState(false);
    const [drawerError, setDrawerError]         = useState('');
    const [reconciliation, setReconciliation]   = useState(null);
    const [loadingRecon, setLoadingRecon]       = useState(false);
    const [hoveredUnitId, setHoveredUnitId]     = useState(null); // Crosshair Row Tracking
    const [hoveredDayIdx, setHoveredDayIdx]     = useState(null); // Crosshair Col Tracking
    const [hoveredBookingRange, setHoveredBookingRange] = useState(null);
    const [exporting, setExporting]             = useState(false);
    const gridRef                               = useRef(null);
    const drawerPanelRef                        = useRef(null);
    const drawerCloseRef                        = useRef(null);
    const lastFocusedElementRef                 = useRef(null);

    const handleExport = async () => {
        setExporting(true);
        try { await exportToPng(gridRef, 'Sanctuary Booking Map'); }
        finally { setExporting(false); }
    };

    const handleExportCSV = () => {
        window.alert('Use the shared Data Sync ribbon above the map to export the booking snapshot CSV.');
    };
    const setHoverUnit = useCallback((unitId) => {
        setHoveredUnitId((current) => current === unitId ? current : unitId);
    }, []);
    const clearHoverUnit = useCallback(() => {
        setHoveredUnitId((current) => current === null ? current : null);
    }, []);
    const setHoverDay = useCallback((idx) => {
        setHoveredDayIdx((current) => current === idx ? current : idx);
    }, []);
    const clearHoverDay = useCallback(() => {
        setHoveredDayIdx((current) => current === null ? current : null);
    }, []);
    const setHoverRange = useCallback((range) => {
        setHoveredBookingRange((current) => (
            current
            && current.startCol === range.startCol
            && current.spanCols === range.spanCols
                ? current
                : range
        ));
    }, []);
    const clearHoverRange = useCallback(() => {
        setHoveredBookingRange((current) => current === null ? current : null);
    }, []);
    const clearRowHover = useCallback(() => {
        clearHoverUnit();
        clearHoverRange();
        clearHoverDay();
    }, [clearHoverDay, clearHoverRange, clearHoverUnit]);

    const view     = VIEWS.find(v => v.id === viewId);
    const daysToShow = getCalendarWindowDays({ viewId, viewStart, fixedDays: view.days });
    const colW       = view.colW;

    const timeline = useMemo(() => {
        return buildCalendarTimeline({ viewId, viewStart, fixedDays: view.days });
    }, [viewId, viewStart, view.days]);

    const sections = useMemo(() => {
        if (!Array.isArray(units) || !Array.isArray(bookings)) return [];
        const normalize = s => s ? s.toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
        const catKeys   = Object.keys(CATEGORY_PRIORITY);
        const findCat   = raw => catKeys.find(k => normalize(k) === normalize(raw)) || null;

        const groups = {};
        units.forEach(u => {
            const catId = findCat(u.room_type_id) || findCat(u.unit_id?.replace(/-\d+$/, ''));
            if (!catId) return;
            if (!groups[catId]) groups[catId] = { units: [], unassigned: [] };
            groups[catId].units.push(u);
        });

        // Identify "Floating" bookings that have dates but no specific Unit ID
        bookings.forEach(b => {
            if (b.status === 'CANCELLED' || b.status === 'REJECTED') return;
            if (!b.unit_id || b.unit_id === 'unassigned') {
                const catId = findCat(b.room_type);
                if (!catId) return;
                if (!groups[catId]) groups[catId] = { units: [], unassigned: [] };
                groups[catId].unassigned.push(b);
            }
        });

        return Object.keys(groups)
            .sort((a, b) => (CATEGORY_PRIORITY[a]?.rank || 99) - (CATEGORY_PRIORITY[b]?.rank || 99))
            .map(catId => {
                const baseUnits = [...groups[catId].units].sort((a, b) => a.unit_id.localeCompare(b.unit_id));
                // Inject the Virtual "Queue" Unit if there are unassigned bookings
                if (groups[catId].unassigned.length > 0) {
                    baseUnits.unshift({
                        unit_id: `QUEUE-${catId}`,
                        marketing_name: `${CATEGORY_PRIORITY[catId]?.label || 'UNASSIGNED'} QUEUE`,
                        is_virtual: true,
                        room_type_id: catId
                    });
                }
                return {
                    id: catId,
                    ...CATEGORY_PRIORITY[catId],
                    units: baseUnits
                };
            });
    }, [units, bookings]);


    const handleRefresh = useCallback(async () => { await refresh(true); onDataChanged?.(); }, [refresh, onDataChanged]);
    const closeBookingDetails = useCallback(() => {
        setSelectedBooking(null);
        setDrawerError('');
        setReconciliation(null);
        setLoadingRecon(false);
        const target = lastFocusedElementRef.current;
        if (target && typeof target.focus === 'function') {
            window.setTimeout(() => target.focus(), 0);
        }
    }, []);
    const openBookingDetails = useCallback((booking) => {
        if (onOpenBookingSummary) {
            onOpenBookingSummary(booking);
            return;
        }
        lastFocusedElementRef.current = document.activeElement;
        setDrawerError('');
        setSelectedBooking(booking);
    }, [onOpenBookingSummary]);

    useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') closeBookingDetails(); };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [closeBookingDetails]);

    const todayDate = getManilaTodayDate();
    const todayKey = format(todayDate, 'yyyy-MM-dd');
    const todayOffset = differenceInCalendarDays(todayDate, viewStart);
    const todayVisible = todayOffset >= 0 && todayOffset < daysToShow;
    const activeStatusSet = useMemo(() => new Set(activeStatusFilters), [activeStatusFilters]);
    const allStatusFiltersOn = activeStatusFilters.length === ALL_STATUS_FILTER_IDS.length;
    const toggleStatusFilter = useCallback((id) => {
        setActiveStatusFilters((current) => {
            if (current.includes(id)) return current.filter((item) => item !== id);
            return [...current, id];
        });
    }, []);
    const showAllStatusFilters = useCallback(() => setActiveStatusFilters(ALL_STATUS_FILTER_IDS), []);
    const clearStatusFilters = useCallback(() => setActiveStatusFilters([]), []);

    // Parse a "yyyy-MM-dd" string as LOCAL midnight (not UTC).
    // JS's new Date("yyyy-MM-dd") treats date-only strings as UTC, which causes
    // a timezone-offset shift that breaks all calendar-day comparisons with date-fns.
    const localDate = (str) => parseDateOnlyAsLocalDate(str);

    // For each unit, compute an array of booking spans visible in the current window
    const getUnitSpans = useCallback((unitId, roomTypeId = '') => {
        if (!bookings) return [];
        const windowStart = viewStart;
        const windowEnd   = addDays(viewStart, daysToShow - 1);
        
        const isVirtual = unitId.startsWith('QUEUE-');
        const targetCat = isVirtual ? unitId.replace('QUEUE-', '') : null;

        const bookingSpans = (bookings)
            .filter(b => {
                if (b.status === 'CANCELLED' || b.status === 'REJECTED') return false;
                if (!activeStatusSet.has(getStatusFilterId(b, todayKey))) return false;
                if (isVirtual) {
                    // Match by room_type for the virtual queue
                    const normalize = s => s ? s.toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
                    const catKeys   = Object.keys(CATEGORY_PRIORITY);
                    const findCat   = raw => catKeys.find(k => normalize(k) === normalize(raw)) || null;
                    return findCat(b.room_type) === targetCat && (!b.unit_id || b.unit_id === 'unassigned');
                }
                return String(b.unit_id) === String(unitId);
            })
            .map(b => {
                const bStart = localDate(b.check_in);
                const bEnd   = localDate(b.check_out);
                // Clamp to window
                const visStart = bStart < windowStart ? windowStart : bStart;
                const visEnd   = bEnd   > windowEnd   ? windowEnd   : addDays(bEnd, -1);
                if (visStart > windowEnd || visEnd < windowStart) return null;
                const startCol = differenceInCalendarDays(visStart, windowStart); // 0-indexed
                const endCol   = differenceInCalendarDays(visEnd, windowStart);
                const spanCols = endCol - startCol + 1;
                const clippedLeft  = bStart < windowStart;
                const clippedRight = addDays(bEnd, -1) > windowEnd;
                return { ...b, startCol, spanCols, clippedLeft, clippedRight };
            })
            .filter(Boolean);

        const unitRow = !isVirtual ? units.find((unit) => String(unit.unit_id) === String(unitId)) : null;
        const liveStateMeta = getLiveUnitStateMeta(unitRow?.unit_status);
        if (!liveStateMeta || !activeStatusSet.has(liveStateMeta.id)) return bookingSpans;

        const todayCol = differenceInCalendarDays(todayDate, windowStart);
        if (todayCol < 0 || todayCol >= daysToShow) return bookingSpans;

        const hasBlockingSpan = bookingSpans.some((span) => (
            span.status !== 'CHECKED_OUT' &&
            !isLiveUnitStateRecord(span) &&
            span.startCol <= todayCol &&
            span.startCol + span.spanCols > todayCol
        ));
        if (hasBlockingSpan) return bookingSpans;

        return [
            {
                booking_ref: `LIVE-${liveStateMeta.id.toUpperCase()}-${unitId}`,
                transaction_ref: `LIVE-${liveStateMeta.id.toUpperCase()}-${unitId}`,
                unit_id: unitId,
                unit_label: unitRow?.unit_label || unitId,
                room_type: unitRow?.room_type || unitRow?.marketing_name || roomTypeId || 'Unit',
                full_name: liveStateMeta.label,
                guest_name: liveStateMeta.label,
                status: liveStateMeta.status,
                payment_status: 'Live Unit State',
                booking_type: 'unit_status',
                check_in: todayKey,
                check_out: format(addDays(todayDate, 1), 'yyyy-MM-dd'),
                notes: `Live unit state: ${liveStateMeta.label}`,
                record_origin: liveStateMeta.origin,
                live_unit_status: unitRow?.unit_status,
                startCol: todayCol,
                spanCols: 1,
                clippedLeft: false,
                clippedRight: false,
            },
            ...bookingSpans
        ];
    }, [bookings, units, viewStart, daysToShow, activeStatusSet, todayDate, todayKey]);

    // Build per-slot day tour bookings for a given slot index (0 or 1)
    // Day tours are single-day: check_in date = the tour date
    // We assign them to slots 0 and 1 in the order they appear per day
    const getDayTourSlots = useCallback((slotIdx) => {
        if (!dayTours || !dayTours.length) return [];
        const windowStart = viewStart;
        const windowEnd   = addDays(viewStart, daysToShow - 1);
        // Group all day tours by their date (check_in)
        const byDate = {};
        dayTours.forEach(b => {
            if (!activeStatusSet.has('daytour')) return;
            const dateKey = b.check_in?.slice(0, 10);
            if (!dateKey) return;
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push(b);
        });
        // For this slot, find bookings at slotIdx per date that are visible
        const result = [];
        Object.entries(byDate).forEach(([dateKey, bList]) => {
            const tourDate = parseDateOnlyAsLocalDate(dateKey);
            if (tourDate < windowStart || tourDate > windowEnd) return;
            const b = bList[slotIdx]; // undefined if fewer tours on this day
            if (!b) return;
            const col = differenceInCalendarDays(tourDate, windowStart);
            result.push({ ...b, startCol: col, spanCols: 1, clippedLeft: false, clippedRight: false });
        });
        return result;
    }, [dayTours, viewStart, daysToShow, activeStatusSet]);

    // Calculate aggregate tent occupancy per day
    const getTentOccupancy = useCallback((day) => {
        if (!bookings) return 0;
        return bookings.filter(b => {
            if (b.booking_type !== 'tent_pitching' && b.unit_id !== 'CAMP-ZONE') return false;
            if (b.status === 'CANCELLED' || b.status === 'REJECTED') return false;
            if (!activeStatusSet.has('camping')) return false;
            const sStart = localDate(b.check_in);
            const sEnd   = localDate(b.check_out);
            return day >= sStart && day < sEnd;
        }).reduce((acc, b) => acc + (parseInt(b.guests) || 1), 0);
    }, [bookings, activeStatusSet]);

    // Navigate: back/forward by one view-period
    const navBack = () => setViewStart((d) => (
        viewId === 'month' ? startOfMonth(addDays(d, -1)) : addDays(d, -daysToShow)
    ));
    const navFwd  = () => setViewStart((d) => (
        viewId === 'month' ? startOfMonth(addDays(endOfMonth(d), 1)) : addDays(d, daysToShow)
    ));
    const goToday = () => {
        const today = getManilaTodayDate();
        setViewStart(viewId === 'month' ? startOfMonth(today) : today);
        setStatusDateKey(format(today, 'yyyy-MM-dd'));
    };
    const navUnitLabel = daysToShow === 7 ? 'Week' : 'Window';
    const syncLabel = lastUpdated
        ? `Last synced ${formatDateTimeInManila(lastUpdated, 'en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}`
        : 'Waiting for first live sync';

    // Week label for header
    const windowLabel = getCalendarWindowLabel({ viewId, viewStart, fixedDays: view.days });

    const summaryCards = useMemo(() => {
        const liveBookings = Array.isArray(bookings) ? bookings.filter(b => !['CANCELLED', 'REJECTED'].includes(b.status)) : [];
        const overnightBookings = liveBookings.filter(b => !isScheduledHold(b));
        const scheduledHolds = liveBookings.filter(isScheduledHold);
        const liveCleaningCount = Array.isArray(units)
            ? units.filter((unit) => getLiveUnitStateMeta(unit?.unit_status)?.id === 'cleaning').length
            : 0;
        const liveMaintenanceCount = Array.isArray(units)
            ? units.filter((unit) => getLiveUnitStateMeta(unit?.unit_status)?.id === 'maintenance').length
            : 0;
        const liveInspectionCount = Array.isArray(units)
            ? units.filter((unit) => getLiveUnitStateMeta(unit?.unit_status)?.id === 'inspection').length
            : 0;
        const activeStays = overnightBookings.filter(b => {
            if (b.booking_type === 'day_tour' || b.unit_id === 'CAMP-ZONE') return false;
            const stayStart = localDate(b.check_in);
            const rawEnd = localDate(b.check_out);
            if (!stayStart || !rawEnd) return false;
            const stayEnd = rawEnd <= stayStart ? addDays(stayStart, 1) : rawEnd;
            return todayDate >= stayStart && todayDate < stayEnd;
        }).length;

        const arrivalsToday = overnightBookings.filter(b => {
            if (b.booking_type === 'day_tour') return false;
            const stayStart = localDate(b.check_in);
            return stayStart && isSameDay(stayStart, todayDate);
        }).length;

        const departuresToday = overnightBookings.filter(b => {
            if (b.booking_type === 'day_tour') return false;
            const stayEnd = localDate(b.check_out);
            return stayEnd && isSameDay(stayEnd, todayDate);
        }).length;

        const actionNeeded = overnightBookings.filter(b => {
            const stayEnd = localDate(b.check_out);
            return b.status === 'CHECKED_IN' && stayEnd && stayEnd <= todayDate;
        }).length;

        const activeScheduledHolds = scheduledHolds.filter(b => {
            const holdStart = localDate(b.check_in);
            const rawEnd = localDate(b.check_out);
            if (!holdStart || !rawEnd) return false;
            const holdEnd = rawEnd <= holdStart ? addDays(holdStart, 1) : rawEnd;
            return todayDate >= holdStart && todayDate < holdEnd;
        }).length;

        const dayToursToday = (dayTours || []).filter(b => {
            const tourDate = b.check_in ? localDate(b.check_in.slice(0, 10)) : null;
            return tourDate && isSameDay(tourDate, todayDate);
        }).length;

        const campingToday = liveBookings
            .filter(b => (b.booking_type === 'tent_pitching' || b.unit_id === 'CAMP-ZONE'))
            .filter(b => {
                const stayStart = localDate(b.check_in);
                const stayEnd = localDate(b.check_out);
                return stayStart && stayEnd && todayDate >= stayStart && todayDate < stayEnd;
            })
            .reduce((sum, b) => sum + (parseInt(b.guests, 10) || 1), 0);

        return [
            { label: 'Check-In Now', value: activeStays, token: CHECKED_IN, mapLabel: 'Checked-in block', caption: 'Active overnight stays' },
            { label: 'Arrivals Today', value: arrivalsToday, token: RESERVED, mapLabel: 'Reserved block', caption: 'Check-ins scheduled' },
            { label: 'Departures Today', value: departuresToday, token: CHECKED_OUT, mapLabel: 'Checkout block', caption: 'Check-outs due' },
            { label: 'Cleaning', value: liveCleaningCount, token: LIVE_CLEANING, mapLabel: 'Today block', caption: 'Live unit state now' },
            { label: 'Maintenance', value: liveMaintenanceCount, token: LIVE_MAINTENANCE, mapLabel: 'Today block', caption: 'Live unit state now' },
            { label: 'Inspection', value: liveInspectionCount, token: LIVE_INSPECTION, mapLabel: 'Today block', caption: 'Live unit state now' },
            { label: 'Action Needed', value: actionNeeded, token: OVERDUE, mapLabel: 'Action block', caption: 'Past checkout' },
            { label: 'Scheduled Holds', value: activeScheduledHolds, token: UNIT_BLOCKED, mapLabel: 'Hold block', caption: 'Maintenance or owner holds' },
            { label: 'Day Tours', value: `${dayToursToday}/${DAY_TOUR_SLOTS}`, token: DAY_TOUR, lane: 'daytour', mapLabel: 'Day tour lane', caption: 'Reserved tour slots' },
            { label: 'Camping Load', value: `${campingToday}/${TENT_CAPACITY}`, token: TENT_ZONE, lane: 'camping', mapLabel: 'Camp zone fill', caption: 'Guests in camping' },
        ];
    }, [bookings, dayTours, units, todayDate]);

    const legendGroups = useMemo(() => {
        const cardByLabel = new Map(summaryCards.map((card) => [card.label, card]));
        const buildGroup = (title, caption, labels) => ({
            title,
            caption,
            cards: labels.map((label) => cardByLabel.get(label)).filter(Boolean),
        });
        return [
            buildGroup('Guest Flow', 'Booking movement', ['Check-In Now', 'Arrivals Today', 'Departures Today']),
            buildGroup('Live State', 'Today only', ['Cleaning', 'Maintenance', 'Inspection']),
            buildGroup('Blocks', 'Needs attention', ['Action Needed', 'Scheduled Holds']),
            buildGroup('Special', 'Separate lanes', ['Day Tours', 'Camping Load']),
        ];
    }, [summaryCards]);

    const categoryOptions = useMemo(() => ([
        ...sections.map(section => ({ value: section.id, label: section.label, count: section.units.length })),
        { value: 'special-operations', label: 'DAY TOURS + TENTS', count: 'Special' }
    ]), [sections]);

    const filteredSections = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        const matchesStatus = (unit) => {
            const spans = getUnitSpans(unit.unit_id);
            if (spans.length > 0) return true;
            return activeStatusSet.has('available');
        };

        const matchesSearch = (unit) => {
            if (!query) return true;
            const baseFields = [unit.unit_id, unit.unit_label, unit.room_type, unit.room_type_id, unit.unit_status]
                .filter(Boolean)
                .map(value => String(value).toLowerCase());
            if (baseFields.some(value => value.includes(query))) return true;

            return getUnitSpans(unit.unit_id).some(span => {
                return [span.full_name, span.guest_name, span.booking_ref, span.status]
                    .filter(Boolean)
                    .some(value => String(value).toLowerCase().includes(query));
            });
        };

        return sections
            .filter(section => categoryFilter === 'all' || section.id === categoryFilter)
            .map(section => ({
                ...section,
                units: section.units.filter(unit => matchesStatus(unit) && matchesSearch(unit))
            }))
            .filter(section => section.units.length > 0);
    }, [sections, categoryFilter, activeStatusSet, searchQuery, getUnitSpans]);

    const guestRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const windowStart = viewStart;
        const windowEnd = addDays(viewStart, daysToShow - 1);
        const activeBookings = [...(Array.isArray(bookings) ? bookings : []), ...(Array.isArray(dayTours) ? dayTours : [])]
            .filter((booking) => !['CANCELLED', 'REJECTED'].includes(booking.status));
        const grouped = new Map();

        activeBookings.forEach((booking, index) => {
            const bookingStart = parseDateOnlyAsLocalDate(booking.check_in);
            const bookingEnd = resolveBookingEndDate(booking);
            if (!bookingStart || !bookingEnd) return;
            if (bookingStart > windowEnd || addDays(bookingEnd, -1) < windowStart) return;

            const key = booking.booking_ref
                || `adhoc-${booking.full_name || booking.guest_name || 'guest'}-${booking.check_in}-${booking.check_out}-${booking.unit_id || booking.room_type || index}`;

            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(booking);
        });

        return Array.from(grouped.entries())
            .map(([key, rows]) => {
                const sortedRows = [...rows].sort((left, right) => {
                    if ((left.check_in || '') !== (right.check_in || '')) return String(left.check_in || '').localeCompare(String(right.check_in || ''));
                    return String(left.unit_id || left.room_type || '').localeCompare(String(right.unit_id || right.room_type || ''));
                });

                const primary = sortedRows[0];
                const bookingStart = sortedRows
                    .map((row) => parseDateOnlyAsLocalDate(row.check_in))
                    .filter(Boolean)
                    .sort((a, b) => a - b)[0];
                const bookingEnd = sortedRows
                    .map((row) => resolveBookingEndDate(row))
                    .filter(Boolean)
                    .sort((a, b) => a - b)
                    .slice(-1)[0];

                if (!bookingStart || !bookingEnd) return null;

                const visStart = bookingStart < windowStart ? windowStart : bookingStart;
                const visEnd = bookingEnd > windowEnd ? windowEnd : addDays(bookingEnd, -1);
                const unitLabels = Array.from(new Set(
                    sortedRows.map((row) => row.unit_label || row.unit_id || row.room_type).filter(Boolean)
                ));
                const categories = Array.from(new Set(
                    sortedRows.map((row) => deriveCategoryIdFromRecord(row)).filter(Boolean)
                ));
                const totalGuests = sortedRows.reduce((sum, row) => sum + (Number(row.guests || 0) || 0), 0);
                const unitCount = unitLabels.length || sortedRows.length;
                const matchText = [
                    key,
                    primary.booking_ref,
                    primary.full_name,
                    primary.guest_name,
                    primary.status,
                    primary.payment_status,
                    ...unitLabels
                ].filter(Boolean).join(' ').toLowerCase();

                if (query && !matchText.includes(query)) return null;
                if (categoryFilter !== 'all' && categoryFilter !== 'special-operations' && !categories.includes(categoryFilter)) return null;
                if (categoryFilter === 'special-operations' && !sortedRows.some((row) => row.booking_type === 'day_tour' || row.unit_id === 'CAMP-ZONE' || row.booking_type === 'tent_pitching')) return null;
                if (!sortedRows.some((row) => activeStatusSet.has(getStatusFilterId(row, todayKey)))) return null;

                return {
                    key,
                    booking_ref: primary.booking_ref || key,
                    full_name: primary.full_name || primary.guest_name || 'Walk-in Guest',
                    status: primary.status,
                    payment_status: primary.payment_status || 'Unconfirmed',
                    check_in: format(bookingStart, 'yyyy-MM-dd'),
                    check_out: format(bookingEnd, 'yyyy-MM-dd'),
                    guests: totalGuests || Number(primary.guests || 0) || 1,
                    unitCount,
                    unitLabels,
                    unitSummary: unitLabels.length > 2 ? `${unitLabels.slice(0, 2).join(', ')} +${unitLabels.length - 2} more` : unitLabels.join(', '),
                    total_price: Number(primary.total_price || 0) + Number(primary.addon_amount || 0),
                    amount_paid: Number(primary.amount_paid || 0),
                    categories,
                    startCol: differenceInCalendarDays(visStart, windowStart),
                    spanCols: differenceInCalendarDays(visEnd, windowStart) - differenceInCalendarDays(visStart, windowStart) + 1,
                    clippedLeft: bookingStart < windowStart,
                    clippedRight: addDays(bookingEnd, -1) > windowEnd,
                    isTransactionGroup: Number(primary.booking_items_count || 1) > 1 || unitCount > 1,
                    sourceRows: sortedRows,
                    primaryRecord: primary
                };
            })
            .filter(Boolean)
            .sort((left, right) => {
                if (left.check_in !== right.check_in) return String(left.check_in).localeCompare(String(right.check_in));
                if (right.unitCount !== left.unitCount) return right.unitCount - left.unitCount;
                return String(left.full_name || '').localeCompare(String(right.full_name || ''));
            });
    }, [bookings, dayTours, searchQuery, categoryFilter, activeStatusSet, todayKey, viewStart, daysToShow]);

    const visibleUnitCount = useMemo(() => (
        filteredSections.reduce((sum, section) => sum + section.units.length, 0)
    ), [filteredSections]);
    const visibleBookingCount = guestRows.length;
    const showSpecialSections = categoryFilter === 'all' || categoryFilter === 'special-operations';
    const showDayTourSection = showSpecialSections && activeStatusSet.has('daytour');
    const showCampingSection = showSpecialSections && activeStatusSet.has('camping');
    const selectedStatusDate = parseDateOnlyAsLocalDate(statusDateKey) || todayDate;
    const selectedStatusLabel = format(selectedStatusDate, 'MMM d, yyyy');
    const selectedMonthKey = format(viewStart, 'yyyy-MM');
    const isHoveredBookingDay = useCallback((idx) => (
        hoveredBookingRange
        && idx >= hoveredBookingRange.startCol
        && idx < hoveredBookingRange.startCol + hoveredBookingRange.spanCols
    ), [hoveredBookingRange]);
    const handleStatusDateChange = useCallback((value) => {
        const nextDate = parseDateOnlyAsLocalDate(value);
        if (!nextDate) return;
        setStatusDateKey(value);
        setViewStart(startOfMonth(nextDate));
    }, []);

    const unitOperationsRows = useMemo(() => {
        const monthStart = startOfMonth(viewStart);
        const monthEnd = endOfMonth(viewStart);
        const activeBookings = Array.isArray(bookings)
            ? bookings.filter((booking) => !['CANCELLED', 'REJECTED'].includes(booking.status))
            : [];

        return filteredSections
            .flatMap(section => section.units.map(unit => ({ section, unit })))
            .filter(({ unit }) => !unit.is_virtual)
            .map(({ section, unit }) => {
                const unitBookings = activeBookings
                    .filter((booking) => String(booking.unit_id) === String(unit.unit_id))
                    .sort((left, right) => String(left.check_in || '').localeCompare(String(right.check_in || '')));

                const currentBooking = unitBookings.find((booking) => {
                    const stayStart = parseDateOnlyAsLocalDate(booking.check_in);
                    const rawEnd = parseDateOnlyAsLocalDate(booking.check_out);
                    if (!stayStart || !rawEnd) return false;
                    const stayEnd = rawEnd <= stayStart ? addDays(stayStart, 1) : rawEnd;
                    return selectedStatusDate >= stayStart && selectedStatusDate < stayEnd;
                }) || (() => {
                    const liveStateMeta = getLiveUnitStateMeta(unit?.unit_status);
                    if (!liveStateMeta) return null;
                    return {
                        booking_ref: `LIVE-${liveStateMeta.id.toUpperCase()}-${unit.unit_id}`,
                        unit_id: unit.unit_id,
                        unit_label: unit.unit_label || unit.unit_id,
                        room_type: unit.room_type || unit.room_type_id || 'Unit',
                        full_name: liveStateMeta.label,
                        guest_name: liveStateMeta.label,
                        check_in: format(selectedStatusDate, 'yyyy-MM-dd'),
                        check_out: format(addDays(selectedStatusDate, 1), 'yyyy-MM-dd'),
                        status: liveStateMeta.status,
                        payment_status: 'Live Unit State',
                        notes: `Live unit state: ${liveStateMeta.label}`,
                        record_origin: liveStateMeta.origin,
                        live_unit_status: unit.unit_status,
                    };
                })();

                const nextBooking = unitBookings.find((booking) => {
                    const stayStart = parseDateOnlyAsLocalDate(booking.check_in);
                    return stayStart && stayStart >= selectedStatusDate && booking.booking_ref !== currentBooking?.booking_ref;
                });

                const stats = unitBookings.reduce((acc, booking) => {
                    const stayStart = parseDateOnlyAsLocalDate(booking.check_in);
                    const rawEnd = parseDateOnlyAsLocalDate(booking.check_out);
                    if (!stayStart || !rawEnd) return acc;
                    const stayEnd = rawEnd <= stayStart ? addDays(stayStart, 1) : rawEnd;
                    const overlapStart = stayStart < monthStart ? monthStart : stayStart;
                    const overlapEnd = stayEnd > addDays(monthEnd, 1) ? addDays(monthEnd, 1) : stayEnd;
                    const nights = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart));
                    if (nights <= 0) return acc;
                    acc.bookedNights += nights;
                    acc.revenue += Number(booking.total_price || 0) + Number(booking.addon_amount || 0);
                    return acc;
                }, { bookedNights: 0, revenue: 0 });

                const operationStatus = getUnitOperationStatus(currentBooking);
                const operationFilterId = currentBooking ? getStatusFilterId(currentBooking, todayKey) : 'available';
                if (!activeStatusSet.has(operationFilterId)) return null;

                return {
                    unit,
                    sectionLabel: section.label,
                    currentBooking,
                    nextBooking,
                    status: operationStatus.label,
                    statusTone: operationStatus.tone,
                    statusBg: operationStatus.bg,
                    statusBorder: operationStatus.border,
                    rowBg: operationStatus.rowBg,
                    bookedNights: stats.bookedNights,
                    occupancyPct: (stats.bookedNights / Math.max(1, differenceInCalendarDays(addDays(monthEnd, 1), monthStart))) * 100,
                    revenue: stats.revenue
                };
            })
            .filter(Boolean);
    }, [bookings, filteredSections, selectedStatusDate, viewStart, activeStatusSet, todayKey]);
    const sanctuaryVisibleRecordCount = visualMode === 'bookings' ? unitOperationsRows.length : visibleUnitCount;

    const selectedBookingStyle = selectedBooking ? (
        selectedBooking.booking_type === 'day_tour' ? DAY_TOUR : slotStyle(selectedBooking)
    ) : null;
    const selectedBookingIsTransaction = selectedBooking?.record_origin === 'transaction_item';

    const selectedBookingFacts = useMemo(() => {
        if (!selectedBooking) return [];
        const bookingItemsCount = Number(selectedBooking.booking_items_count || 1);

        const facts = [
            ['Map Ref', getCompactMapBookingRef(selectedBooking)],
            ['Full Ref', selectedBooking.booking_ref || 'Unassigned'],
            ['Guest', selectedBooking.full_name || selectedBooking.guest_name || 'Walk-in / pending name'],
            ['Status', selectedBooking.status || 'Unknown'],
            ['Check-In', selectedBooking.check_in || 'Not set'],
            ['Check-Out', selectedBooking.check_out || 'Not set'],
            ['Guests', selectedBooking.guests || '1'],
            [selectedBookingIsTransaction && bookingItemsCount > 1 ? 'This Block' : 'Unit', selectedBooking.unit_id || selectedBooking.room_type || 'Not assigned'],
            ['Payment', paymentStatusLabel(selectedBooking.payment_status)],
        ];

        if (selectedBookingIsTransaction) facts.push(['Transaction Units', String(bookingItemsCount)]);
        if (selectedBooking.booking_source) facts.push(['Source', selectedBooking.booking_source]);
        if (selectedBooking.created_by) facts.push(['Created By', selectedBooking.created_by]);
        if (selectedBooking.notes) facts.push(['Notes', selectedBooking.notes]);

        return facts;
    }, [selectedBooking, selectedBookingIsTransaction]);

    const drawerBalance = useMemo(() => {
        if (!selectedBooking) return null;
        const total = Number(selectedBooking.total_price || 0) + Number(selectedBooking.addon_amount || 0);
        const paid = Number(selectedBooking.amount_paid || 0);
        return total - paid;
    }, [selectedBooking]);

    useEffect(() => {
        if (!selectedBooking) return undefined;

        setDrawerError('');
        drawerCloseRef.current?.focus();

        if (!selectedBooking.booking_ref) return undefined;

        let active = true;
        setLoadingRecon(true);
        api.get(`/api/v1/admin/bookings/${selectedBooking.booking_ref}/reconciliation`)
            .then((data) => {
                if (!active) return;
                setReconciliation(data);
            })
            .catch(() => {
                if (!active) return;
                setReconciliation(null);
            })
            .finally(() => {
                if (!active) return;
                setLoadingRecon(false);
            });

        return () => {
            active = false;
        };
    }, [selectedBooking]);

    const handleDrawerCheckIn = useCallback(async () => {
        setDrawerError('Open the booking from Today\'s Check Ins to run the payment-guarded check-in workflow.');
    }, []);

    const handleDrawerCheckout = useCallback(async () => {
        setDrawerError('Open the booking from Today\'s Check Outs to run the payment-guarded checkout workflow.');
    }, []);

    const handleDrawerKeyDown = useCallback((e) => {
        if (e.key !== 'Tab' || !drawerPanelRef.current) return;

        const focusable = drawerPanelRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    // Initial blocking loader only if no data yet
    if (loading && units.length === 0) return (
        <div className="py-20 text-center text-slate-500/70">
            <div className="mb-3 text-3xl font-black text-[#1b332d]">Loading</div>
            <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-[#66766c]">Mapping Sanctuary...</div>
        </div>
    );

    return (
        <div ref={gridRef} className="availability-explorer animate-in fade-in-0 slide-in-from-bottom-1 duration-300 relative flex flex-col gap-3">

            <div className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#fffdf8_0%,#f4efe6_100%)]">
            <div className="map-control-panel grid gap-4 border-b border-[#092a28]/25 bg-[linear-gradient(135deg,#092a28_0%,#0a4f48_55%,#0a6b5f_100%)] px-5 py-4 xl:grid-cols-[minmax(250px,1fr)_auto] xl:items-start">
                <div className="map-control-context flex min-w-[250px] flex-col gap-1.5">
                    <span className="text-[0.58rem] font-black uppercase tracking-[0.22em] text-[#f4d89a]">Placement Window</span>
                    <p className="m-0 text-[0.74rem] font-black tracking-[0.01em] text-[#fffdf8]/90">{windowLabel}</p>
                    <p className={`m-0 text-[0.62rem] font-bold ${error ? 'text-red-100' : 'text-[#fffdf8]/65'}`}>
                        {error ? `Sync issue: ${error}` : syncLabel}
                        {refreshing && !loading ? ' - Refreshing live data...' : ''}
                    </p>
                </div>

                <div className="map-control-stack flex max-w-[980px] flex-wrap items-center justify-start gap-2 xl:justify-end">
                    <div className="map-control-row map-control-row-primary flex flex-wrap items-center gap-2">
                    <div className="map-segmented-control flex gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                        {[{ id: 'units', label: 'Unit Map' }, { id: 'bookings', label: 'Unit Status' }].map(mode => (
                            <button key={mode.id} onClick={() => setVisualMode(mode.id)}
                                className={`rounded-full border-0 px-3.5 py-1.5 text-[0.66rem] font-black transition ${visualMode === mode.id ? 'bg-[#fffdf8] text-[#173c36] shadow-sm' : 'bg-transparent text-[#fffdf8]/75 hover:bg-white/10 hover:text-white'}`}>
                                {mode.label}
                            </button>
                        ))}
                    </div>
                    <div className="map-segmented-control flex gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                        {VIEWS.map(v => (
                            <button key={v.id} onClick={() => {
                                setViewId(v.id);
                                if (v.id === 'month') setViewStart(startOfMonth(viewStart));
                            }}
                                className={`rounded-full border-0 px-4 py-1.5 text-[0.66rem] font-black transition ${viewId === v.id ? 'bg-[#c6923f] text-white shadow-sm' : 'bg-transparent text-[#fffdf8]/75 hover:bg-white/10 hover:text-white'}`}>
                                {v.label}
                            </button>
                        ))}
                    </div>
                    {visualMode === 'units' && viewId === 'month' && (
                        <label className="map-date-field flex items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-2.5 py-1.5">
                            <span className="text-[0.55rem] font-black uppercase tracking-[0.12em] text-[#fffdf8]/75">
                                Month
                            </span>
                            <input
                                type="month"
                                value={selectedMonthKey}
                                onChange={(e) => {
                                    const next = parseDateOnlyAsLocalDate(`${e.target.value}-01`);
                                    if (next) setViewStart(startOfMonth(next));
                                }}
                                className="border-0 bg-transparent text-[0.68rem] font-black text-[#fffdf8] outline-none [color-scheme:dark]"
                            />
                        </label>
                    )}
                    {visualMode === 'bookings' && (
                        <label className="map-date-field flex items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-2.5 py-1.5">
                            <span className="text-[0.55rem] font-black uppercase tracking-[0.12em] text-[#fffdf8]/75">
                                Status Date
                            </span>
                            <input
                                type="date"
                                aria-label="Select unit status date"
                                value={statusDateKey}
                                onChange={(e) => handleStatusDateChange(e.target.value)}
                                className="border-0 bg-transparent text-[0.68rem] font-black text-[#fffdf8] outline-none [color-scheme:dark]"
                            />
                        </label>
                    )}
                    </div>
                    <div className="map-control-row map-control-row-secondary flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        aria-label="Search sanctuary map bookings"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search booking ref, guest, or unit"
                        className="h-9 w-[236px] rounded-xl border border-white/20 bg-white/15 px-3 text-[0.68rem] font-bold tracking-[0.01em] text-[#fffdf8] outline-none placeholder:text-[#fffdf8]/55 focus:border-[#f4d89a]/70 focus:bg-white/20"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="h-9 rounded-xl border border-white/20 bg-white/15 px-3 text-[0.66rem] font-black text-[#fffdf8] transition hover:bg-white/25"
                        >
                            Clear
                        </button>
                    )}
                    <button onClick={goToday} className={`h-9 rounded-xl border px-4 text-[0.66rem] font-black text-[#fffdf8] transition ${todayVisible ? 'border-[#d8a84c] bg-[#c6923f]' : 'border-white/20 bg-white/15 hover:bg-white/25'}`}>
                        Today
                    </button>
                    <button onClick={handleRefresh} className="h-9 rounded-xl border border-white/20 bg-white/15 px-3.5 text-[0.66rem] font-black text-[#fffdf8] transition hover:bg-white/25">
                        {refreshing && !loading ? 'Refreshing...' : 'Refresh Now'}
                    </button>
                    <button onClick={navBack} className="h-9 rounded-xl border border-white/20 bg-white/15 px-3.5 text-[0.66rem] font-black text-[#fffdf8] transition hover:bg-white/25">Prev {navUnitLabel}</button>
                    <button onClick={navFwd}  className="h-9 rounded-xl border border-white/20 bg-white/15 px-3.5 text-[0.66rem] font-black text-[#fffdf8] transition hover:bg-white/25">Next {navUnitLabel}</button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200/70 bg-rose-50 px-6 py-3 text-rose-950">
                    <div className="text-[0.68rem] font-bold">
                        Live occupancy data could not be refreshed. The grid may be showing the last successful snapshot.
                    </div>
                    <Button type="button" onClick={handleRefresh} variant="outline" size="sm" className="border-rose-200 text-[0.62rem] font-extrabold text-rose-700 hover:bg-rose-100">
                        Retry Sync
                    </Button>
                </div>
            )}

            <div className="sticky top-0 z-25 grid items-stretch gap-3.5 border-b border-[#20342c1f] bg-gradient-to-b from-[#fffdf8] via-[#fffaf1] to-[#f8f1e4] px-6 py-[13px] xl:grid-cols-[minmax(170px,0.38fr)_minmax(0,1.62fr)]">
                <div className="grid content-center gap-1 rounded-2xl border border-white/15 bg-[linear-gradient(135deg,#062321_0%,#0a514b_58%,#0a6b5f_100%)] px-3.5 py-2.5 shadow-sm">
                    <div className="text-[0.55rem] font-black uppercase tracking-[1.4px] text-[#f7f6f0]/70">
                        Today
                    </div>
                    <div className="text-[0.92rem] font-black leading-tight text-[#fffdf8]">
                        Map Color Key
                    </div>
                    <div className="text-[0.62rem] font-bold leading-snug text-[#f7f6f0]/70">
                        Status counts match the sanctuary blocks
                    </div>
                </div>
                <div className="grid min-w-0 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                    {legendGroups.map(group => (
                        <div
                            key={group.title}
                            className="min-w-0 rounded-2xl border border-[#e2d7bf]/80 bg-[linear-gradient(135deg,rgba(255,253,248,0.96)_0%,rgba(251,247,239,0.96)_100%)] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.035)]"
                        >
                            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[#e5dac3]/70 pb-1.5">
                                <span className="truncate text-[0.62rem] font-black uppercase tracking-[0.11em] text-[#13211f]">
                                    {group.title}
                                </span>
                                <span className="shrink-0 text-[0.56rem] font-black uppercase tracking-[0.08em] text-[#8a7b62]">
                                    {group.caption}
                                </span>
                            </div>
                            <div className="grid gap-1.5">
                                {group.cards.map(card => {
                                    const tone = flowToneClasses(card.token, card.lane);
                                    return (
                                        <div key={card.label} className="grid min-h-[32px] grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2">
                                            <span
                                                aria-hidden="true"
                                                className={cn('h-7 w-2.5 rounded-full', tone.marker)}
                                            />
                                            <span className="grid min-w-0">
                                                <span className={cn('truncate text-[0.62rem] font-black uppercase leading-tight tracking-wide', tone.accent)}>
                                                    {card.label}
                                                </span>
                                                <span className="truncate text-[0.58rem] font-bold leading-tight text-[#7d877f]">
                                                    {card.mapLabel}
                                                </span>
                                            </span>
                                            <span className={cn('min-w-[2.2rem] text-right text-[0.9rem] font-black leading-none', tone.value)}>
                                                {card.value}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-3 xl:flex-nowrap">
                <h2 className="m-0 shrink-0 whitespace-nowrap font-resortDisplay text-admin-section font-black tracking-normal text-[#13211f]">
                    Sanctuary Map
                </h2>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-[#d8c9b3]/80 bg-[#fffdf8]/92 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(19,33,31,0.04)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="View by category">
                    <button
                        onClick={() => setCategoryFilter('all')}
                        className={cn('h-8 shrink-0 rounded-full border px-3 text-[0.62rem] font-black transition', categoryFilter === 'all' ? 'border-[#c6923f] bg-[#fff3d5] text-[#74480c] shadow-sm' : 'border-transparent bg-transparent text-[#5f6d66] hover:bg-[#f7eedf]/72 hover:text-[#173c36]')}
                    >
                        All <span className={cn('ml-1 rounded-full px-1.5', categoryFilter === 'all' ? 'bg-[#c6923f]/16 text-[#74480c]' : 'bg-[#0a6b5f]/10 text-[#0a6b5f]')}>{units.length}</span>
                    </button>
                    {categoryOptions.map(option => (
                        <button
                            key={option.value}
                            onClick={() => setCategoryFilter(option.value)}
                            className={cn('h-8 shrink-0 rounded-full border px-3 text-[0.62rem] font-black transition', categoryFilter === option.value ? 'border-[#c6923f] bg-[#fff3d5] text-[#74480c] shadow-sm' : 'border-transparent bg-transparent text-[#5f6d66] hover:bg-[#f7eedf]/72 hover:text-[#173c36]')}
                        >
                            {option.label} <span className={cn('ml-1 rounded-full px-1.5', categoryFilter === option.value ? 'bg-[#c6923f]/16 text-[#74480c]' : 'bg-[#0a6b5f]/10 text-[#0a6b5f]')}>{option.count}</span>
                        </button>
                    ))}
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-full border border-[#d8c9b3]/70 bg-[#f7eedf]/70 px-3 py-1 text-[0.62rem] font-black tracking-normal text-[#5f6d66]">
                    Showing {sanctuaryVisibleRecordCount} records
                </span>
            </div>

            {visualMode === 'bookings' ? (
            <>
            <div className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] max-h-[70vh] max-w-full overflow-y-auto overflow-x-hidden rounded-[24px] bg-[#fffdf8]">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[clamp(0.56rem,0.62vw,0.68rem)]">
                    <colgroup>
                        <col className="w-[12.2%]" />
                        <col className="w-[6.4%]" />
                        <col className="w-[8.3%]" />
                        <col className="w-[11.1%]" />
                        <col className="w-[6.7%]" />
                        <col className="w-[1.8%]" />
                        <col className="w-[8.3%]" />
                        <col className="w-[11.3%]" />
                        <col className="w-[6.7%]" />
                        <col className="w-[1.8%]" />
                        <col className="w-[7%]" />
                        <col className="w-[7%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-20">
                        <tr>
                            <th colSpan={5} className="bg-[#0a6b5f] px-2 py-[7px] text-center text-[0.58rem] font-black uppercase tracking-[1.1px] text-white">
                                Current Status On Selected Date
                            </th>
                            <th className="border-0 bg-white" />
                            <th colSpan={3} className="bg-[#0a6b5f] px-2 py-[7px] text-center text-[0.58rem] font-black uppercase tracking-[1.1px] text-white">
                                Next Booking
                            </th>
                            <th className="border-0 bg-white" />
                            <th colSpan={2} className="bg-[#0a6b5f] px-2 py-[7px] text-center text-[0.58rem] font-black uppercase tracking-[1.1px] text-white">
                                Monthly Stats - {format(viewStart, 'MMM')}
                            </th>
                        </tr>
                        <tr>
                            {['Unit', 'Status', 'Ref', 'Guest', 'Stay', '', 'Next Ref', 'Next Guest', 'Next Stay', '', 'Nights', 'Occ %'].map((label, idx) => (
                                <th
                                    key={`${label}-${idx}`}
                                    className={cn(
                                        'truncate text-nowrap text-[0.56rem] font-black text-[#17251f]',
                                        label ? 'border-b-2 border-r border-[#20342c1f] px-2 py-[7px]' : 'border-0 bg-white p-0',
                                        idx >= 10 ? 'text-right' : 'text-left',
                                        label && (idx >= 6 && idx <= 8 ? 'bg-[#fff8df]' : 'bg-[#f8f6ef]')
                                    )}
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {unitOperationsRows.length === 0 && (
                            <tr>
                                <td colSpan={12} className="px-[18px] py-[34px] text-center font-extrabold text-slate-500">
                                    No units match the current filters.
                                </td>
                            </tr>
                        )}
                        {unitOperationsRows.map((row) => {
                            const unitName = getAdminUnitLabel(row.unit);
                            const current = row.currentBooking;
                            const next = row.nextBooking;
                            return (
                                <tr key={row.unit.unit_id} className={unitOperationRowClass(row.status)}>
                                    <td className="min-w-0 border-b border-r border-[#20342c1f] px-2 py-[7px] font-black text-[#17251f]">
                                        <div title={unitName} className="truncate">{unitName}</div>
                                        <div className="mt-0.5 text-[0.54rem] font-extrabold uppercase tracking-[0.7px] text-slate-400">{row.sectionLabel}</div>
                                    </td>
                                    <td className="border-b border-r border-[#20342c1f] px-2 py-[7px]">
                                        <span className={cn('inline-flex max-w-full truncate rounded-full border px-[7px] py-[3px] font-black', unitOperationStatusClass(row.status))}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="min-w-0 border-b border-r border-[#20342c1f] px-2 py-[7px] font-extrabold">
                                        {current?.booking_ref ? (
                                            <button type="button" onClick={() => openBookingDetails(current)} title={getUnitStatusReferenceLabel(current)} className="max-w-full truncate border-0 bg-transparent p-0 font-black text-[#0f4f82]">
                                                {getUnitStatusReferenceLabel(current)}
                                            </button>
                                        ) : 'â€”'}
                                    </td>
                                    <td className="min-w-0 border-b border-r border-[#20342c1f] px-2 py-[7px] font-extrabold">
                                        <div title={current?.full_name || current?.guest_name || ''} className="truncate">
                                            {current?.full_name || current?.guest_name || '-'}
                                        </div>
                                    </td>
                                    <td className="text-nowrap border-b border-r border-[#20342c1f] px-2 py-[7px] font-extrabold">
                                        {formatCompactStay(current?.check_in, current?.check_out)}
                                    </td>
                                    <td className="border-b border-[#20342c1f] bg-white" />
                                    <td className="min-w-0 border-b border-r border-[#20342c1f] bg-[#fff4cf] px-2 py-[7px] font-extrabold">
                                        {next?.booking_ref ? (
                                            <button type="button" onClick={() => openBookingDetails(next)} title={next.booking_ref} className="max-w-full truncate border-0 bg-transparent p-0 font-black text-[#8a6000]">
                                                {next.booking_ref}
                                            </button>
                                        ) : '-'}
                                    </td>
                                    <td className="min-w-0 border-b border-r border-[#20342c1f] bg-[#fff4cf] px-2 py-[7px] font-extrabold">
                                        <div title={next?.full_name || next?.guest_name || ''} className="truncate">
                                            {next?.full_name || next?.guest_name || '-'}
                                        </div>
                                    </td>
                                    <td className="text-nowrap border-b border-r border-[#20342c1f] bg-[#fff4cf] px-2 py-[7px] font-extrabold">
                                        {formatCompactStay(next?.check_in, next?.check_out)}
                                    </td>
                                    <td className="border-b border-[#20342c1f] bg-white" />
                                    <td className="border-b border-r border-[#20342c1f] px-2 py-[7px] text-right font-black">
                                        {row.bookedNights}
                                    </td>
                                    <td className="border-b border-r border-[#20342c1f] px-2 py-[7px] text-right font-black">
                                        {row.occupancyPct.toFixed(0)}%
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            </>            ) : (
            <>
            <div className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] max-h-[70vh] max-w-full overflow-auto rounded-[24px] bg-[#fffdf8]">
                <div
                    className={cn('relative min-w-full', sanctuaryBoardWidthClass(daysToShow))}
                >

                    {/* Date header */}
                    <div className="sticky top-0 z-20 flex bg-[linear-gradient(180deg,#f7f1df_0%,#fffdf8_100%)]" style={{ borderBottom: '1px solid rgba(170, 154, 130, 0.62)' }}>
                        <div className="sticky left-0 z-[22] flex w-[230px] min-w-[230px] shrink-0 items-center bg-[linear-gradient(180deg,#f5efe0_0%,#fffaf0_100%)] px-3.5 py-[11px] text-[0.6rem] font-black uppercase tracking-[2.4px] text-[#3f564d] shadow-[inset_-1px_0_0_rgba(32,52,44,0.08)]" style={{ borderRight: '1px solid rgba(170, 154, 130, 0.62)' }}>
                            Unit ({format(viewStart, 'MMM yyyy')})
                        </div>
                        {timeline.map((day, i) => {
                            const isToday    = isSameDay(day, todayDate);
                            const dayMeta = getCalendarDayMeta(day);
                            const isRangeHover = isHoveredBookingDay(i);
                            const isSingleDayHover = hoveredDayIdx === i;
                            const isDateHover = isRangeHover || isSingleDayHover;
                            return (
                                <div key={i} data-date-range-hover={isDateHover ? 'true' : undefined} title={dayMeta.holiday || undefined} className={cn('relative min-w-0 flex-1 px-0.5 pb-[7px] pt-2 text-center shadow-[inset_-1px_0_0_rgba(170,154,130,0.56)]', isRangeHover ? 'bg-slate-950/10 shadow-[inset_0_-2px_0_rgba(72,99,88,0.55),inset_-1px_0_0_rgba(170,154,130,0.56)]' : isSingleDayHover ? 'bg-slate-950/10' : isToday ? 'bg-amber-600/10' : 'bg-transparent')}>
                                    <div className={cn('text-[0.45rem] font-extrabold uppercase tracking-[0.6px] opacity-70', dayMeta.isHoliday ? 'text-orange-700' : dayMeta.isWeekend ? 'text-rose-700' : 'text-slate-500')}>
                                        {format(day, 'EEE')}
                                    </div>
                                    <div className={cn('font-extrabold leading-tight tracking-normal', dayMeta.isHoliday ? 'text-orange-700' : dayMeta.isWeekend ? 'text-rose-700' : 'text-slate-800', daysToShow <= 7 ? 'text-[0.85rem]' : daysToShow <= 14 ? 'text-[0.74rem]' : 'text-[0.62rem]', (isToday || dayMeta.isHoliday || isDateHover) && 'font-black')}>
                                        {format(day, 'd')}
                                    </div>
                                    {isToday && (
                                        <div className="mx-auto mt-[3px] size-1 rounded-full bg-[#486358]" title="Today" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Unit rows */}
                    {filteredSections.length === 0 && (
                        <div className="border-b border-[#20342c1f] bg-white px-6 py-10 text-center">
                            <div className="mb-1.5 text-[0.9rem] font-black text-[#173c36]">
                                No units match the current filters
                            </div>
                            <div className="text-[0.68rem] font-semibold text-slate-500">
                                Try clearing filters or widening the timeline window.
                            </div>
                        </div>
                    )}

                    {filteredSections.map(section => (
                        <React.Fragment key={section.id}>
                            <div className="pointer-events-none sticky left-0 z-[13] flex min-h-[46px] items-center border-y border-[#e1cfaa]/70 bg-[linear-gradient(90deg,rgba(246,235,214,0.98)_0%,rgba(255,249,237,0.96)_34%,rgba(255,253,248,0.72)_100%)] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_1px_0_rgba(197,138,62,0.16)]">
                                <div className="h-7 w-[4px] rounded-full bg-[linear-gradient(180deg,#d9a24c_0%,#a46b13_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.55)]" />
                                <div className="ml-2.5 flex min-w-[190px] items-center gap-2.5">
                                    <span className="rounded-full border border-[#d6b67a]/70 bg-[linear-gradient(180deg,#fff7e6_0%,#f3dfb8_100%)] px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#70480f] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_4px_10px_rgba(112,72,15,0.08)]">
                                        {section.label}
                                    </span>
                                    <span className="rounded-full border border-[#cfd8d2]/80 bg-[#eef5f1] px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-normal text-[#486358]">
                                        {section.units.length}
                                    </span>
                                </div>
                                <div className="ml-3 h-px flex-1 bg-[linear-gradient(90deg,rgba(197,138,62,0.34)_0%,rgba(197,138,62,0.13)_48%,rgba(197,138,62,0)_100%)]" />
                            </div>
                            {section.units.map(unit => {
                                const spans = getUnitSpans(unit.unit_id, unit.room_type_id);
                                const isUnitHovered = hoveredUnitId === unit.unit_id;
                                return (
                                    <div key={unit.unit_id}
                                        onMouseEnter={() => setHoverUnit(unit.unit_id)}
                                        onMouseLeave={clearRowHover}
                                        className={cn('relative flex h-12', isUnitHovered ? 'bg-[#486358]/5' : unit.is_virtual ? 'bg-[#b59665]/5' : 'bg-white')}
                                        style={{ borderTop: '1px solid rgba(170, 154, 130, 0.58)', borderBottom: '1px solid rgba(170, 154, 130, 0.58)' }}>
                                        <div data-unit-hover={isUnitHovered ? 'true' : undefined} className={cn('sticky left-0 z-[11] flex w-[230px] min-w-[230px] shrink-0 flex-col justify-center px-3.5', isUnitHovered ? 'bg-[linear-gradient(180deg,rgba(219,236,228,0.98)_0%,rgba(202,222,211,0.98)_100%)] shadow-[inset_-3px_0_0_rgba(72,99,88,0.62)]' : 'bg-[linear-gradient(180deg,#fffaf0_0%,#f5efe0_100%)] shadow-[inset_-1px_0_0_rgba(32,52,44,0.05)]')} style={{ borderTop: '1px solid rgba(170, 154, 130, 0.58)', borderRight: '1px solid rgba(170, 154, 130, 0.62)' }}>
                                            <div className="flex items-center gap-1.5 text-[0.76rem] font-black leading-tight tracking-normal text-[#24362f]">
                                                {getAdminUnitLabel(unit)}
                                            </div>
                                            <div className="text-[0.48rem] font-black uppercase tracking-[0.9px] text-[#7a817c] opacity-95">
                                                {unit.unit_id}
                                            </div>
                                        </div>
                                        <div
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-y-0 left-[230px] right-0 z-[1]"
                                            style={{
                                                backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(${100 / daysToShow}% - 1px), rgba(170, 154, 130, 0.58) calc(${100 / daysToShow}% - 1px), rgba(170, 154, 130, 0.58) ${100 / daysToShow}%)`,
                                            }}
                                        />
                                        {timeline.map((day, i) => {
                                            const occupied = spans.some(s => {
                                                const sStart = localDate(s.check_in);
                                                const rawEnd = localDate(s.check_out);
                                                const sEnd   = rawEnd <= sStart
                                                    ? new Date(sStart.getTime() + 86400000)
                                                    : rawEnd;
                                                return day >= sStart && day < sEnd;
                                            });
                                            return (
                                                <div key={i}
                                                    data-unit-grid-cell="true"
                                                    data-occupied={occupied ? 'true' : 'false'}
                                                    onMouseEnter={() => {
                                                        setHoverUnit(unit.unit_id);
                                                        setHoverDay(i);
                                                        clearHoverRange();
                                                    }}
                                                    onMouseLeave={clearHoverDay}
                                                    className={cn('relative z-[2] flex-1 cursor-default transition-colors duration-75', (isUnitHovered && isHoveredBookingDay(i)) ? 'bg-[#486358]/10' : (i === hoveredDayIdx && hoveredUnitId === unit.unit_id) ? 'bg-slate-950/5' : 'bg-transparent')}
                                                />
                                            );
                                        })}

                                        <div className={cn('pointer-events-none absolute bottom-0 right-0 top-0 left-[230px] grid grid-rows-1', sanctuaryGridColumnsClass(daysToShow))}>
                                            {spans.map((span, si) => {
                                                const s = slotStyle(span);
                                                const flowClasses = flowMapBlockClasses(s);
                                                const borderRadius = `${span.clippedLeft ? 4 : 12}px ${span.clippedRight ? 4 : 12}px ${span.clippedRight ? 4 : 12}px ${span.clippedLeft ? 4 : 12}px`;
                                                const scheduledHold = isScheduledHold(span);
                                                const guestLabel = scheduledHold ? getScheduledHoldReason(span) : (span.full_name || span.guest_name || span.booking_ref || 'Booked');
                                                const mapRef = getCompactMapBookingRef(span);
                                                const compact = span.spanCols <= 2 || daysToShow >= 30;
                                                const tinyMapBlock = compact && span.spanCols <= 1 && daysToShow >= 30;
                                                const visibleMapRef = getMapPrimaryLabel(span);
                                                const showCompactMapRef = true;
                                                const statusLabel = getMapSecondaryLabel(span);
                                                return (
                                                    <div
                                                        key={si}
                                                        onMouseEnter={() => {
                                                            setHoverUnit(unit.unit_id);
                                                            setHoverRange({ startCol: span.startCol, spanCols: span.spanCols });
                                                        }}
                                                        onMouseLeave={clearHoverRange}
                                                        onFocus={() => {
                                                            setHoverUnit(unit.unit_id);
                                                            setHoverRange({ startCol: span.startCol, spanCols: span.spanCols });
                                                        }}
                                                        onBlur={clearHoverRange}
                                                        onClick={() => openBookingDetails(span)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                openBookingDetails(span);
                                                            }
                                                        }}
                                                        role="button"
                                                        tabIndex={0}
                                                        aria-label={scheduledHold ? `${guestLabel} scheduled hold` : `Open booking details for ${span.full_name || span.guest_name || span.booking_ref}`}
                                                        title={scheduledHold ? `${guestLabel} - ${formatCompactStay(span.check_in, span.check_out)}${span.notes ? ` - ${span.notes}` : ''}` : `${span.full_name || span.guest_name || '-'} - ${s.label} - ${span.booking_ref}`}
                                                        className={cn('booking-cell-block pointer-events-auto row-start-1 my-[2px] flex self-stretch cursor-pointer items-center overflow-hidden border border-t-2 ring-1 ring-[#20342c]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_2px_7px_rgba(19,33,31,0.055)] transition-[transform,box-shadow,filter] duration-100 hover:z-40 hover:-translate-y-px hover:scale-[1.005] hover:saturate-[1.05] hover:brightness-[0.98] focus-visible:z-40 focus-visible:-translate-y-px focus-visible:scale-[1.005] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f4f8247] active:brightness-[0.94]', gridStartClass(span.startCol), gridSpanClass(span.spanCols), blockZClass(si), flowClasses.block, span.clippedLeft ? 'rounded-l' : 'rounded-l-lg', span.clippedRight ? 'rounded-r' : 'rounded-r-lg', compact ? 'justify-center gap-0 px-[3px]' : 'justify-start gap-1.5 py-0 pl-[7px] pr-[9px]')}
                                                    >
                                                        {!compact && (
                                                            <span
                                                                aria-hidden="true"
                                                                className={cn('h-6 w-[9px] flex-none rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]', flowClasses.marker)}
                                                            />
                                                        )}
                                                        {showCompactMapRef && (
                                                            <span className="flex w-full min-w-0 flex-col leading-none">
                                                                <span className={cn('block min-w-0 max-w-full truncate text-center font-black leading-none tracking-[0.02em]', flowClasses.text, scheduledHold ? 'normal-case' : '', tinyMapBlock ? 'text-[0.49rem] tracking-normal' : 'text-[0.54rem]')}>
                                                                    {visibleMapRef}
                                                                </span>
                                                                {!compact && (
                                                                <span className={cn('mt-0.5 truncate text-[0.48rem] font-black tracking-[0.7px]', flowClasses.accentText)}>
                                                                    {scheduledHold ? statusLabel : `${statusLabel} - ${guestLabel}`}
                                                                </span>
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}

                    {/* Day tour section */}
                    {showDayTourSection && (
                    <>
                    <div className="flex border-y border-[#7f9eb1] border-t-[10px] border-t-white bg-[#e9f7ff] shadow-[inset_0_1px_0_rgba(3,105,161,0.22)]">
                        <div className="flex w-[230px] min-w-[230px] shrink-0 items-center gap-2 border-r border-[#7f9eb1] px-3.5 pb-2 pt-2.5 text-[0.5rem] font-black uppercase tracking-[3.2px] text-[#0369a1]">
                            <span className="text-[0.72rem]">SPECIAL</span>
                            <span className="rounded-full border border-sky-700/35 bg-white/80 px-2 py-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">BOOKINGS</span>
                        </div>
                        <div className="flex-1 bg-[linear-gradient(180deg,rgba(231,242,251,0.72)_0%,rgba(232,247,255,0.95)_100%)]" />
                    </div>

                    {[0, 1].map(slotIdx => {
                        const slotSpans = getDayTourSlots(slotIdx);
                        return (
                            <div key={`daytour-${slotIdx}`} 
                                onMouseEnter={() => setHoverUnit(`DAYTOUR-${slotIdx + 1}`)}
                                onMouseLeave={clearRowHover}
                                className="relative flex h-12 border-y border-[#7f9eb1] bg-[linear-gradient(180deg,rgba(231,242,251,0.64)_0%,rgba(255,255,255,0.96)_100%)] transition-colors">
                                <div
                                    className="z-10 flex w-[230px] min-w-[230px] shrink-0 flex-col justify-center border border-l-0 border-[#7f9eb1] bg-[linear-gradient(180deg,rgba(219,239,251,0.98)_0%,rgba(241,249,254,0.98)_100%)] px-3.5"
                                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), inset -1px 0 0 #7f9eb1' }}
                                >
                                    <div className="text-[0.72rem] font-black leading-tight text-[#0f4c75]">Day Tour Lane {slotIdx + 1}</div>
                                    <div className="mt-0.5 text-[0.5rem] font-extrabold tracking-[0.2px] text-[#4b6b82]">Quick-turn slot {slotIdx + 1} of {DAY_TOUR_SLOTS}</div>
                                </div>

                                {timeline.map((day, i) => {
                                    const dateKey = format(day, 'yyyy-MM-dd');
                                    const toursOnDay = (dayTours || []).filter(b => b.check_in?.slice(0, 10) === dateKey);
                                    const atCapacity = toursOnDay.length >= DAY_TOUR_SLOTS;
                                    const slotFilled = toursOnDay.length > slotIdx;
                                    const cellBgClass = i === hoveredDayIdx && hoveredUnitId === `DAYTOUR-${slotIdx + 1}`
                                        ? 'bg-sky-500/[0.10]'
                                        : i === todayOffset
                                        ? 'bg-sky-700/[0.09]'
                                        : atCapacity
                                        ? 'bg-sky-700/[0.035]'
                                        : 'bg-white';
                                    return (
                                        <div key={i}
                                            onMouseEnter={() => {
                                                setHoverUnit(`DAYTOUR-${slotIdx + 1}`);
                                                setHoverDay(i);
                                                clearHoverRange();
                                            }}
                                            onMouseLeave={clearHoverDay}
                                            className={cn('pointer-events-none flex-1 cursor-default border border-[#8aaabd] transition-colors duration-75', cellBgClass)}
                                            style={{ boxShadow: 'inset 1px 0 0 #8aaabd, inset 0 1px 0 #8aaabd' }}
                                        />
                                    );
                                })}

                                <div className={cn('pointer-events-none absolute bottom-0 right-0 top-0 left-[230px] grid grid-rows-1', sanctuaryGridColumnsClass(daysToShow))}>
                                    {slotSpans.map((span, si) => {
                                        const flowClasses = flowMapBlockClasses(DAY_TOUR, 'daytour');
                                        const guestLabel = span.full_name || span.guest_name || span.booking_ref || 'Day Tour';
                                        const mapRef = getCompactMapBookingRef(span);
                                        return (
                                            <div
                                                key={si}
                                                onMouseEnter={() => {
                                                    setHoverUnit(`DAYTOUR-${slotIdx + 1}`);
                                                    setHoverRange({ startCol: span.startCol, spanCols: 1 });
                                                }}
                                                onMouseLeave={clearHoverRange}
                                                onFocus={() => {
                                                    setHoverUnit(`DAYTOUR-${slotIdx + 1}`);
                                                    setHoverRange({ startCol: span.startCol, spanCols: 1 });
                                                }}
                                                onBlur={clearHoverRange}
                                                onClick={() => openBookingDetails(span)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        openBookingDetails(span);
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                aria-label={`Open day tour details for ${span.full_name || span.guest_name || span.booking_ref}`}
                                                title={`${span.full_name || span.guest_name || '-'} - Day Tour - ${span.booking_ref}`}
                                                className={cn('booking-cell-block pointer-events-auto row-start-1 my-[2px] flex self-stretch cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-t-2 px-1 ring-1 ring-[#20342c]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_2px_7px_rgba(19,33,31,0.055)] transition-[transform,box-shadow,filter] duration-100 hover:z-40 hover:-translate-y-px hover:scale-[1.005] hover:saturate-[1.05] hover:brightness-[0.98] focus-visible:z-40 focus-visible:-translate-y-px focus-visible:scale-[1.005] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f4f8247] active:brightness-[0.94]', gridStartClass(span.startCol), gridSpanClass(1), blockZClass(si), flowClasses.block)}
                                            >
                                                <span className={cn('h-[22px] w-2 flex-none rounded-full', flowClasses.marker)} />
                                                {daysToShow <= 14 && (
                                                    <span className={cn('ml-1.5 block min-w-0 max-w-full truncate text-center text-[0.54rem] font-black leading-none tracking-[0.02em]', flowClasses.text)}>
                                                        {mapRef}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    </>
                    )}

                    {/* Camping zone aggregate row */}
                    {showCampingSection && (
                    <div className="flex border-y border-[#9f90bf] border-t-[10px] border-t-white bg-[#f3eefe] shadow-[inset_0_1px_0_rgba(109,40,217,0.18)]">
                        <div className="flex w-[230px] min-w-[230px] shrink-0 items-center gap-2 border-r border-[#9f90bf] px-3.5 pb-2 pt-2.5 text-[0.5rem] font-black uppercase tracking-[3.6px] text-violet-700">
                            <span className="text-[0.78rem]">CAMP</span>
                            <span className="rounded-full border border-violet-700/15 bg-white/70 px-2 py-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">ZONE</span>
                        </div>
                        {timeline.map((day, i) => {
                            const count = getTentOccupancy(day);
                            const ratio = count / TENT_CAPACITY;
                            const isOver = count >= TENT_CAPACITY;
                            
                            return (
                                <div key={i}
                                    title={`Checked In: ${count}/${TENT_CAPACITY}\nAdd manual bookings via Special Hub.`}
                                    onMouseEnter={() => setHoverDay(i)}
                                    onMouseLeave={clearHoverDay}
                                    className={cn('relative flex flex-1 cursor-default items-center justify-center overflow-hidden border border-[#aa9bcc]', (i === hoveredDayIdx) ? 'bg-violet-500/[0.10]' : (i === todayOffset ? 'bg-violet-600/12' : 'bg-white'))}
                                    style={{ boxShadow: 'inset 1px 0 0 #aa9bcc, inset 0 1px 0 #aa9bcc' }}>
                                    {/* Progress background bar */}
                                    <div
                                        className={cn('absolute inset-x-0 bottom-0 transition-[height] duration-300', tentHeightClass(count), isOver ? 'bg-[linear-gradient(180deg,rgba(251,113,133,0.06)_0%,rgba(225,29,72,0.18)_100%)]' : 'bg-[linear-gradient(180deg,rgba(196,181,253,0.04)_0%,rgba(147,51,234,0.18)_100%)]')}
                                    />
                                    
                                    <div className={cn('z-[1] flex min-w-7 flex-col items-center rounded-xl border bg-white/70 px-0.5 py-1 text-[0.65rem] font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]', isOver ? 'border-red-600/25 text-red-600' : 'border-violet-700/20 text-violet-700')}>
                                        <div className="text-[0.7rem] font-black tracking-[0.2px]">TENT</div>
                                        <div>{count}/{TENT_CAPACITY}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    )}
                </div>
                </div>
            </>
            )}

            {selectedBooking && selectedBookingStyle && (() => {
                const drawerTone = bookingDrawerToneClass(selectedBooking);
                return (
                <>
                    <div
                        onClick={closeBookingDetails}
                        className="fixed inset-0 z-[80] bg-slate-900/30 backdrop-blur-sm"
                    />
                    <aside
                        ref={drawerPanelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="sanctuary-booking-drawer-title"
                        onKeyDown={handleDrawerKeyDown}
                        className={cn(embossedModalFrameClass, 'fixed bottom-6 right-6 top-6 z-[81] flex w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] bg-[#fffdf8]/[0.96]')}
                    >
                        <div className={cn('px-[22px] pb-[18px] pt-5', drawerTone.header)}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className={cn('mb-2 text-[0.62rem] font-black uppercase tracking-[1.5px]', drawerTone.eyebrow)}>
                                        Booking Detail
                                    </div>
                                    <div id="sanctuary-booking-drawer-title" className="text-[1.2rem] font-black leading-tight text-slate-950">
                                        {selectedBooking.full_name || selectedBooking.guest_name || selectedBooking.booking_ref}
                                    </div>
                                    <div className={cn('mt-1.5 text-[0.72rem] font-bold', drawerTone.status)}>
                                        {selectedBookingStyle.icon} {selectedBookingStyle.label}
                                    </div>
                                </div>
                                <Button
                                    ref={drawerCloseRef}
                                    type="button"
                                    onClick={closeBookingDetails}
                                    variant="outline"
                                    size="sm"
                                    className="text-[0.72rem] font-extrabold"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-[18px] overflow-y-auto px-[22px] py-[18px]">
                            <div className="grid grid-cols-3 gap-2.5">
                                <div className="rounded-2xl bg-[#f7eedf]/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <div className="mb-1.5 text-[0.55rem] font-black uppercase tracking-[1.2px] text-[#69776f]">Total</div>
                                    <div className="text-[0.8rem] font-extrabold text-[#13211f]">PHP {Number((selectedBooking.total_price || 0) + (selectedBooking.addon_amount || 0)).toLocaleString()}</div>
                                </div>
                                <div className="rounded-2xl bg-[#f7eedf]/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <div className="mb-1.5 text-[0.55rem] font-black uppercase tracking-[1.2px] text-[#69776f]">Paid</div>
                                    <div className="text-[0.8rem] font-extrabold text-[#13211f]">PHP {Number(selectedBooking.amount_paid || 0).toLocaleString()}</div>
                                </div>
                                <div className="rounded-2xl bg-[#f7eedf]/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <div className="mb-1.5 text-[0.55rem] font-black uppercase tracking-[1.2px] text-[#69776f]">Balance</div>
                                    <div className={cn('text-[0.8rem] font-extrabold', drawerBalance > 1 ? 'text-rose-700' : 'text-teal-700')}>PHP {Number(drawerBalance || 0).toLocaleString()}</div>
                                </div>
                            </div>

                            {loadingRecon && (
                                <div className="text-[0.66rem] font-bold text-slate-500">
                                    Loading payment reconciliation...
                                </div>
                            )}

                            {reconciliation?.summary && (
                                <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-3">
                                    <div className="mb-1.5 text-[0.56rem] font-black uppercase tracking-[1.2px] text-amber-700">
                                        Financial Pulse
                                    </div>
                                    <div className="text-[0.68rem] font-bold leading-relaxed text-slate-950">
                                        {reconciliation.summary}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2.5">
                                {selectedBookingFacts.map(([label, value]) => (
                                    <div key={label} className="rounded-2xl bg-[#f7eedf]/42 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                        <div className="mb-1.5 text-[0.56rem] font-black uppercase tracking-[1.2px] text-[#69776f]">
                                            {label}
                                        </div>
                                        <div className="break-words text-[0.72rem] font-bold leading-snug text-[#13211f]">
                                            {value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {drawerError && (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[0.68rem] font-bold text-rose-700">
                                    {drawerError}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2.5">
                                <Button
                                    type="button"
                                    onClick={() => {
                                        onOpenBookingEditor?.(selectedBooking);
                                        closeBookingDetails();
                                    }}
                                    className="text-[0.7rem] font-extrabold"
                                >
                                    View Booking
                                </Button>
                                <span className="rounded-xl bg-slate-100 px-3.5 py-[11px] text-[0.68rem] font-extrabold text-slate-500">
                                    View-only map. Use Ledger workflows for Check In and Check Out.
                                </span>
                            </div>

                            {selectedBooking.status === 'CHECKED_IN' && drawerBalance > 1 && (
                                <div className="text-[0.66rem] font-bold text-rose-700">
                                    Checkout is locked until the outstanding balance is fully settled.
                                </div>
                            )}

                            {selectedBookingIsTransaction && (
                                <div className="text-[0.66rem] font-bold text-slate-600">
                                    This drawer row is one inventory block under a shared transaction. Check-in and checkout actions apply to the full booking reference.
                                </div>
                            )}
                        </div>
                    </aside>
                </>
                );
            })()}
        </div>
    );
}

