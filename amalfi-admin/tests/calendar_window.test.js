import { describe, expect, it } from 'vitest';
import {
    buildCalendarTimeline,
    getCalendarDayMeta,
    getCalendarWindowDays,
    getCalendarWindowLabel,
} from '../src/utils/calendarWindow';

describe('Sanctuary Map calendar window', () => {
    it('uses the real month length for May 2026', () => {
        const viewStart = new Date(2026, 4, 1);
        const timeline = buildCalendarTimeline({ viewId: 'month', viewStart, fixedDays: 30 });

        expect(getCalendarWindowDays({ viewId: 'month', viewStart, fixedDays: 30 })).toBe(31);
        expect(timeline).toHaveLength(31);
        expect(timeline[0].getDate()).toBe(1);
        expect(timeline[30].getDate()).toBe(31);
        expect(getCalendarWindowLabel({ viewId: 'month', viewStart, fixedDays: 30 })).toBe('May 1 - May 31, 2026');
    });

    it('classifies weekends and Philippine legal holidays for header colors', () => {
        const laborDay = getCalendarDayMeta(new Date(2026, 4, 1));
        const saturday = getCalendarDayMeta(new Date(2026, 4, 2));
        const weekday = getCalendarDayMeta(new Date(2026, 4, 4));
        const movableEidCandidate = getCalendarDayMeta(new Date(2026, 4, 26));

        expect(laborDay).toMatchObject({ isHoliday: true, holiday: 'Labor Day', tone: '#c2410c' });
        expect(saturday).toMatchObject({ isWeekend: true, isHoliday: false, tone: '#be123c' });
        expect(weekday).toMatchObject({ isWeekend: false, isHoliday: false, tone: '#1f2937' });
        expect(movableEidCandidate).toMatchObject({ isHoliday: false, isWeekend: false, tone: '#1f2937' });
    });
});
