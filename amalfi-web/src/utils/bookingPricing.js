import { diffDateOnlyDays } from './manilaDate';

const ZERO_PRICING = {
  total: 0,
  amountToPayNow: 0,
  remainingBalance: 0,
  perNight: 0,
  nights: 0,
  unitsNeeded: 1,
  unitBreakdown: [],
  maxPossibleGuests: 1,
  singleUnitMaxGuests: 1,
};

const getNightCount = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const nights = diffDateOnlyDays(checkIn, checkOut);
  return nights < 0 ? 0 : nights;
};

const buildUnitRate = ({ pax, baseMax, minPerUnit, getRateForPax, sortedRates, extraPax }) => {
  if (pax <= baseMax) {
    return getRateForPax(Math.max(pax, minPerUnit));
  }

  return sortedRates[0].price_php + (pax - baseMax) * extraPax.price_per_head_php;
};

const distributeGuestsAcrossUnits = ({ guests, unitCount, baseMax, absoluteMax }) => {
  if (unitCount <= 1) return [guests];
  if (guests < unitCount) {
    throw new Error('Guest count must be at least the number of selected units.');
  }

  const assignments = new Array(unitCount).fill(1);
  let remaining = guests - unitCount;

  while (remaining > 0) {
    let changed = false;
    for (let index = 0; index < assignments.length && remaining > 0; index += 1) {
      if (assignments[index] >= baseMax) continue;
      assignments[index] += 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) break;
  }

  while (remaining > 0) {
    let changed = false;
    for (let index = 0; index < assignments.length && remaining > 0; index += 1) {
      if (assignments[index] >= absoluteMax) continue;
      assignments[index] += 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) break;
  }

  return assignments;
};

export function calculateBookingPricing({ room, guests, checkIn, checkOut, paymentCommitment = 'DEPOSIT', requestedUnits = 1 }) {
  if (!room?.raw) return ZERO_PRICING;

  const rates = room.raw.rates || [];
  const extraPax = room.raw.extra_pax;
  const availableUnits = Math.max(1, parseInt(room.raw.units, 10) || 1);
  const guestCount = parseInt(guests, 10) || 0;

  if (!rates.length || guestCount < 1) return ZERO_PRICING;

  const nights = getNightCount(checkIn, checkOut);
  const sortedRates = [...rates].sort((a, b) => b.max_pax - a.max_pax);
  const baseMax = sortedRates[0]?.max_pax ?? 1;
  const absMaxPerUnit = extraPax?.allowed
    ? (extraPax.max_capacity_pax || baseMax)
    : (room.raw.max_capacity_pax || baseMax);
  const minPerUnit = Math.min(...rates.map((rate) => rate.min_pax));

  const getRateForPax = (pax) => {
    const matched = rates.find((rate) => pax >= rate.min_pax && pax <= rate.max_pax);
    if (matched) return matched.price_php;

    const ascendingRates = [...rates].sort((a, b) => a.min_pax - b.min_pax);
    const lowestTier = ascendingRates[0];
    if (pax < lowestTier.min_pax) return lowestTier.price_php;

    return sortedRates[0]?.price_php ?? 0;
  };

  let perNight = 0;
  let unitsNeeded = 1;
  let unitBreakdown = [];
  const singleUnitMaxGuests = extraPax?.allowed ? absMaxPerUnit : baseMax;
  const requestedUnitCount = Math.max(1, Math.min(availableUnits, parseInt(requestedUnits, 10) || 1));
  const minimumUnitsNeeded = Math.max(1, Math.ceil(guestCount / Math.max(1, singleUnitMaxGuests)));
  const effectiveUnitCount = Math.min(availableUnits, Math.max(requestedUnitCount, minimumUnitsNeeded));

  if (effectiveUnitCount <= 1 && guestCount <= baseMax) {
    perNight = getRateForPax(guestCount);
    unitBreakdown = [{ pax: guestCount, rate: perNight }];
  } else if (effectiveUnitCount <= 1 && extraPax?.allowed && guestCount <= absMaxPerUnit) {
    perNight = sortedRates[0].price_php + (guestCount - baseMax) * extraPax.price_per_head_php;
    unitBreakdown = [{ pax: guestCount, rate: perNight }];
  } else if (effectiveUnitCount > 1 && requestedUnitCount > 1) {
    const assignments = distributeGuestsAcrossUnits({
      guests: Math.min(guestCount, effectiveUnitCount * singleUnitMaxGuests),
      unitCount: effectiveUnitCount,
      baseMax,
      absoluteMax: singleUnitMaxGuests,
    });

    unitBreakdown = assignments.map((assignedGuests) => {
      const rate = buildUnitRate({
        pax: assignedGuests,
        baseMax,
        minPerUnit,
        getRateForPax,
        sortedRates,
        extraPax,
      });

      return {
        pax: assignedGuests,
        effectivePax: Math.max(assignedGuests, minPerUnit),
        rate,
      };
    });
    unitsNeeded = unitBreakdown.length;
    perNight = unitBreakdown.reduce((sum, unit) => sum + Number(unit.rate || 0), 0);
  } else if (availableUnits > 1) {
    let remaining = guestCount;
    let totalPerNight = 0;

    while (remaining > 0 && unitBreakdown.length < effectiveUnitCount) {
      const thisUnitMax = extraPax?.allowed ? absMaxPerUnit : baseMax;
      const thisPax = Math.min(remaining, thisUnitMax);
      const unitRate = buildUnitRate({
        pax: thisPax,
        baseMax,
        minPerUnit,
        getRateForPax,
        sortedRates,
        extraPax,
      });

      totalPerNight += unitRate;
      unitBreakdown.push({
        pax: thisPax,
        effectivePax: Math.max(thisPax, minPerUnit),
        rate: unitRate,
      });
      remaining -= thisPax;
    }

    unitsNeeded = unitBreakdown.length;
    perNight = totalPerNight;
  } else {
    const effectivePax = Math.min(guestCount, singleUnitMaxGuests);
    perNight = buildUnitRate({
      pax: effectivePax,
      baseMax,
      minPerUnit,
      getRateForPax,
      sortedRates,
      extraPax,
    });
    unitBreakdown = [{ pax: effectivePax, rate: perNight }];
  }

  const maxPossibleGuests = singleUnitMaxGuests * availableUnits;
  const total = perNight * Math.max(nights, 1);
  const amountToPayNow = paymentCommitment === 'DEPOSIT' ? total * 0.5 : total;
  const remainingBalance = total - amountToPayNow;

  return {
    total,
    amountToPayNow,
    remainingBalance,
    perNight,
    nights,
    unitsNeeded,
    unitBreakdown,
    maxPossibleGuests,
    singleUnitMaxGuests,
  };
}

export { ZERO_PRICING };
