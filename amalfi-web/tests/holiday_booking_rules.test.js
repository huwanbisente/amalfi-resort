import { describe, it, expect } from 'vitest';
import { getHolidayBookingViolation, formatHolidayBookingViolation } from '../src/utils/holidayBookingRules';

const holidayRule = {
  enabled: true,
  minimum_nights: 2,
  applies_to: ['overnight', 'day_tour', 'tent_pitching'],
  holidays: [
    { name: "New Year's Day", type: 'fixed', month: 1, day: 1 },
    { name: 'Maundy Thursday', type: 'easter_offset', days_from_easter: -3 },
    { name: 'Christmas Day', type: 'fixed', month: 12, day: 25 },
  ],
};

describe('Holiday Minimum Stay Rule', () => {
  it('rejects a 1-night overnight stay on New Year\'s Day', () => {
    const violation = getHolidayBookingViolation({
      checkIn: '2027-01-01',
      checkOut: '2027-01-02',
      bookingType: 'overnight',
      rule: holidayRule,
    });

    expect(violation).not.toBeNull();
    expect(violation.minimumNights).toBe(2);
    expect(violation.holidays.some((holiday) => holiday.name.includes('New Year'))).toBe(true);
  });

  it('allows a 2-night overnight stay across a covered holiday', () => {
    const violation = getHolidayBookingViolation({
      checkIn: '2027-12-24',
      checkOut: '2027-12-26',
      bookingType: 'overnight',
      rule: holidayRule,
    });

    expect(violation).toBeNull();
  });

  it('rejects a same-day day tour on Christmas Day', () => {
    const violation = getHolidayBookingViolation({
      checkIn: '2027-12-25',
      checkOut: '2027-12-25',
      bookingType: 'day_tour',
      rule: holidayRule,
    });

    expect(violation).not.toBeNull();
    expect(formatHolidayBookingViolation(violation)).toContain('Christmas Day');
  });

  it('resolves movable Holy Week dates from Easter offsets', () => {
    const violation = getHolidayBookingViolation({
      checkIn: '2027-03-25',
      checkOut: '2027-03-26',
      bookingType: 'overnight',
      rule: holidayRule,
    });

    expect(violation).not.toBeNull();
    expect(violation.holidays.some((holiday) => holiday.name === 'Maundy Thursday')).toBe(true);
  });

  it('does not block normal non-holiday single-night stays', () => {
    const violation = getHolidayBookingViolation({
      checkIn: '2027-02-10',
      checkOut: '2027-02-11',
      bookingType: 'overnight',
      rule: holidayRule,
    });

    expect(violation).toBeNull();
  });
});
