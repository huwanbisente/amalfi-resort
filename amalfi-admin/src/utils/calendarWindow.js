import { addDays, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format } from 'date-fns';

const PHILIPPINE_LEGAL_HOLIDAYS_2026 = {
    '2026-01-01': "New Year's Day",
    '2026-02-17': 'Chinese New Year',
    '2026-04-02': 'Maundy Thursday',
    '2026-04-03': 'Good Friday',
    '2026-04-09': 'Day of Valor',
    '2026-05-01': 'Labor Day',
    '2026-06-12': 'Independence Day',
    '2026-08-21': 'Ninoy Aquino Day',
    '2026-08-31': 'National Heroes Day',
    '2026-11-02': "All Souls' Day",
    '2026-11-30': 'Bonifacio Day',
    '2026-12-08': 'Feast of the Immaculate Conception of Mary',
    '2026-12-24': 'Christmas Eve',
    '2026-12-25': 'Christmas Day',
    '2026-12-30': 'Rizal Day',
    '2026-12-31': 'Last Day of the Year',
};

export function getCalendarWindowEnd(viewId, viewStart, fixedDays = 7) {
    if (viewId === 'month') return endOfMonth(viewStart);
    return addDays(viewStart, fixedDays - 1);
}

export function buildCalendarTimeline({ viewId, viewStart, fixedDays }) {
    const end = getCalendarWindowEnd(viewId, viewStart, fixedDays);
    return eachDayOfInterval({ start: viewStart, end });
}

export function getCalendarWindowDays({ viewId, viewStart, fixedDays }) {
    if (viewId !== 'month') return fixedDays;
    return differenceInCalendarDays(endOfMonth(viewStart), viewStart) + 1;
}

export function getCalendarWindowLabel({ viewId, viewStart, fixedDays }) {
    if (viewId === 'week') return `Week of ${format(viewStart, 'MMM d, yyyy')}`;
    const end = getCalendarWindowEnd(viewId, viewStart, fixedDays);
    return `${format(viewStart, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
}

export function getPhilippineLegalHoliday(date) {
    return PHILIPPINE_LEGAL_HOLIDAYS_2026[format(date, 'yyyy-MM-dd')] || null;
}

export function getCalendarDayMeta(date) {
    const holiday = getPhilippineLegalHoliday(date);
    const isWeekend = [0, 6].includes(date.getDay());
    return {
        holiday,
        isHoliday: Boolean(holiday),
        isWeekend,
        tone: holiday ? '#c2410c' : isWeekend ? '#be123c' : '#1f2937',
        weekdayTone: holiday ? '#c2410c' : isWeekend ? '#be123c' : '#64748b',
    };
}
