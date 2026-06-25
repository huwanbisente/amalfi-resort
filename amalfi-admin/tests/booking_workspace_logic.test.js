import { describe, expect, it } from 'vitest';
import {
    getBookingActionState,
    getBookingFinancialSnapshot,
    getTodayCheckInActionLabel,
    getUnitDraftState,
    getSummaryGuestCount,
    isPaymentDueRow,
    isTodayCheckInRow,
    MANUAL_STATUS_OPTIONS,
    validateAddonDraft,
    validateOverviewDraft,
    validatePaymentDraft
} from '../src/utils/bookingWorkspaceLogic';

describe('Booking workspace action logic', () => {
    it('never exposes direct checked-out status as a manual status option', () => {
        expect(MANUAL_STATUS_OPTIONS).not.toContain('CHECKED_OUT');
    });

    it('only allows checkout when the stay is checked in and financially settled', () => {
        expect(getBookingActionState({ status: 'CHECKED_IN' }, 0).canCheckout).toBe(true);
        expect(getBookingActionState({ status: 'RESERVED' }, 0).canCheckout).toBe(false);
        expect(getBookingActionState({ status: 'CHECKED_IN' }, 250).canCheckout).toBe(false);
    });

    it('blocks check-in for cancelled or completed stays', () => {
        expect(getBookingActionState({ status: 'RESERVED' }, 0).canCheckIn).toBe(true);
        expect(getBookingActionState({ status: 'CANCELLED' }, 0).canCheckIn).toBe(false);
        expect(getBookingActionState({ status: 'CHECKED_OUT' }, 0).canCheckIn).toBe(false);
    });

    it('keeps both reserved and checked-in same-day arrivals in the check-ins view', () => {
        const today = '2026-05-11';

        expect(isTodayCheckInRow({ status: 'RESERVED', check_in: today }, today)).toBe(true);
        expect(isTodayCheckInRow({ status: 'PARTIAL', check_in: today }, today)).toBe(false);
        expect(isTodayCheckInRow({ status: 'CHECKED_IN', check_in: today }, today)).toBe(true);
        expect(isTodayCheckInRow({ status: 'PENDING_VERIFICATION', check_in: today }, today)).toBe(false);
        expect(isTodayCheckInRow({ status: 'RESERVED', check_in: '2026-05-12' }, today)).toBe(false);
    });

    it('does not offer a second check-in action for rows already checked in', () => {
        expect(getTodayCheckInActionLabel({ status: 'RESERVED' })).toBe('Check In');
        expect(getTodayCheckInActionLabel({ status: 'PARTIAL' })).toBeNull();
        expect(getTodayCheckInActionLabel({ status: 'CHECKED_IN' })).toBeNull();
    });

    it('builds the payments due queue from balance, not booking lifecycle status', () => {
        expect(isPaymentDueRow({ status: 'RESERVED', total_price: 10000, amount_paid: 4000 })).toBe(true);
        expect(isPaymentDueRow({ status: 'CHECKED_IN', lodging_total: 10000, verified_paid_total: 7000 })).toBe(true);
        expect(isPaymentDueRow({ status: 'RESERVED', balance_due: 0, payment_status: 'PAID' })).toBe(false);
        expect(isPaymentDueRow({ status: 'PENDING_VERIFICATION', balance_due: 5000, payment_status: 'PARTIAL' })).toBe(false);
        expect(isPaymentDueRow({ status: 'PARTIAL', balance_due: 5000 })).toBe(false);
    });

    it('rejects invalid overview date ranges before save', () => {
        expect(validateOverviewDraft({ full_name: '', check_in: '2026-04-21', check_out: '2026-04-22' })).toBe('Guest name is required.');
        expect(validateOverviewDraft({ full_name: 'Zeke', check_in: '2026-04-21', check_out: '2026-04-21' })).toBe('Check-out must be after check-in.');
        expect(validateOverviewDraft({ full_name: 'Zeke', check_in: '2026-04-21', check_out: '2026-04-22' })).toBe('');
    });

    it('prefers summed unit guests for the summary when unit allocations are present', () => {
        expect(getSummaryGuestCount({ guests: 12 }, [{ guest_count: 4 }, { guest_count: 3 }])).toBe(7);
        expect(getSummaryGuestCount({ guests: 12 }, [])).toBe(12);
    });

    it('only enables unit apply when the draft actually changes something', () => {
        expect(getUnitDraftState({ unitId: 'A1', status: 'PENDING_VERIFICATION' }, {}, [{ unit_id: 'A1' }])).toEqual({
            hasMatchingUnits: true,
            hasChanges: false,
            canApply: false
        });

        expect(getUnitDraftState({ unitId: 'A1', status: 'PENDING_VERIFICATION' }, { status: 'RESERVED' }, [{ unit_id: 'A1' }])).toEqual({
            hasMatchingUnits: true,
            hasChanges: true,
            canApply: true
        });
    });

    it('rejects invalid payment drafts before submit', () => {
        expect(validatePaymentDraft({ amount: 0 }, { balance: 5000 })).toBe('Payment amount must be greater than zero.');
        expect(validatePaymentDraft({ amount: 1000 }, { balance: 0 })).toBe('This booking is already fully settled.');
        expect(validatePaymentDraft({ amount: 1000 }, { balance: 5000 })).toBe('');
    });

    it('rejects invalid add-on drafts before submit', () => {
        expect(validateAddonDraft({ item_name: '', amount: 500 })).toBe('Add-on name is required.');
        expect(validateAddonDraft({ item_name: 'Bonfire', amount: 0 })).toBe('Add-on amount must be greater than zero.');
        expect(validateAddonDraft({ item_name: 'Bonfire', amount: 500 })).toBe('');
    });

    it('prefers live header finance values when they are available', () => {
        expect(getBookingFinancialSnapshot(
            { total_price: 10000, addon_amount: 500, amount_paid: 2000, balance: 8500 },
            { lodging_total: 12000, addon_amount: 1500, verified_paid_total: 4000, balance_due: 9500 }
        )).toEqual({
            roomTotal: 12000,
            addonTotal: 1500,
            grandTotal: 13500,
            paid: 4000,
            balance: 9500
        });
    });
});
