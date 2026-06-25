const parseDateOnly = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  return new Date(`${dateStr}T00:00:00Z`);
};

const formatDateOnly = (date) => date.toISOString().slice(0, 10);

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const calculateWesternEasterSunday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
};

const getLastWeekdayOfMonth = (year, month, weekday) => {
  const lastDay = new Date(Date.UTC(year, month, 0));
  while (lastDay.getUTCDay() !== weekday) {
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  }
  return lastDay;
};

const resolveHolidayDate = (definition, year) => {
  if (!definition?.type) return null;

  if (definition.type === 'fixed') {
    return new Date(Date.UTC(year, Number(definition.month) - 1, Number(definition.day)));
  }

  if (definition.type === 'easter_offset') {
    return addUtcDays(calculateWesternEasterSunday(year), Number(definition.days_from_easter || 0));
  }

  if (definition.type === 'last_weekday_of_month') {
    return getLastWeekdayOfMonth(year, Number(definition.month), Number(definition.weekday));
  }

  return null;
};

const getBookingLengthDays = ({ checkIn, checkOut, bookingType = 'overnight' }) => {
  if (bookingType === 'day_tour') return 1;
  const ci = parseDateOnly(checkIn);
  const co = parseDateOnly(checkOut);
  if (!ci || !co) return 0;
  return Math.max(0, Math.round((co - ci) / 86400000));
};

export function getHolidayBookingViolation({ checkIn, checkOut, bookingType = 'overnight', rule = {} }) {
  if (!rule?.enabled) return null;

  const appliesTo = Array.isArray(rule.applies_to) ? rule.applies_to : [];
  if (appliesTo.length && !appliesTo.includes(bookingType)) return null;

  const minimumNights = Number(rule.minimum_nights || 2);
  const bookingLengthDays = getBookingLengthDays({ checkIn, checkOut, bookingType });
  if (bookingLengthDays >= minimumNights) return null;

  const ci = parseDateOnly(checkIn);
  const co = parseDateOnly(checkOut);
  if (!ci || !co) return null;

  const holidayMatches = [];
  const years = new Set([ci.getUTCFullYear(), co.getUTCFullYear()]);

  for (const year of years) {
    for (const holiday of rule.holidays || []) {
      const holidayDate = resolveHolidayDate(holiday, year);
      if (!holidayDate) continue;

      const overlaps = bookingType === 'day_tour'
        ? formatDateOnly(holidayDate) === checkIn
        : holidayDate >= ci && holidayDate < co;

      if (overlaps) {
        holidayMatches.push({
          name: holiday.name,
          date: formatDateOnly(holidayDate),
        });
      }
    }
  }

  if (!holidayMatches.length) return null;

  return {
    minimumNights,
    bookingLengthDays,
    holidays: holidayMatches,
  };
}

export function formatHolidayBookingViolation(violation) {
  if (!violation) return '';
  const labels = violation.holidays.map((holiday) => `${holiday.name} (${holiday.date})`).join(', ');
  return `Bookings that include ${labels} must be at least ${violation.minimumNights} days. Your selected stay is only ${violation.bookingLengthDays} day${violation.bookingLengthDays === 1 ? '' : 's'}.`;
}
