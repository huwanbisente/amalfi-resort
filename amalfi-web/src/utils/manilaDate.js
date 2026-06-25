const MANILA_TIME_ZONE = 'Asia/Manila';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParts(dateStr) {
  if (!DATE_ONLY_RE.test(String(dateStr || ''))) return null;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return { year, month, day };
}

function dateOnlyToUtcDate(dateStr, hour = 12) {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, 0, 0));
}

export function parseDateOnlyAsLocalDate(dateStr) {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

export function getManilaTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formatDateOnlyInManila(dateStr, locale = 'en-PH', options = {}) {
  const date = dateOnlyToUtcDate(dateStr);
  if (!date) return 'â€”';
  return new Intl.DateTimeFormat(locale, {
    timeZone: MANILA_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatNowInManila(locale = 'en-PH', options = {}) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: MANILA_TIME_ZONE,
    ...options,
  }).format(new Date());
}

export function formatDateTimeInManila(dateValue, locale = 'en-PH', options = {}) {
  if (!dateValue) return '-';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, {
    timeZone: MANILA_TIME_ZONE,
    ...options,
  }).format(date);
}

export function addDaysToDateOnly(dateStr, days) {
  const date = dateOnlyToUtcDate(dateStr, 0);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffDateOnlyDays(startDate, endDate) {
  const start = dateOnlyToUtcDate(startDate, 0);
  const end = dateOnlyToUtcDate(endDate, 0);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function isValidDateOnly(dateStr) {
  return Boolean(parseDateParts(dateStr));
}

export { MANILA_TIME_ZONE };
