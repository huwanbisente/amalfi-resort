import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { DEFAULT_ALLOCATION_STATUS, getBookingFinancialSnapshot, validateAddonDraft, validatePaymentDraft } from '../../utils/bookingWorkspaceLogic';

function normalizeLedgerBooking(booking = {}) {
    const totalPrice = Number(booking.total_price || booking.lodging_total || 0);
    const addonAmount = Number(booking.addon_amount || 0);
    const amountPaid = Number(booking.amount_paid || booking.verified_paid_total || booking.deposit_paid || 0);
    const balance = Number.isFinite(Number(booking.balance))
        ? Number(booking.balance)
        : Math.max(0, totalPrice + addonAmount - amountPaid);
    const itemCount = Number(booking.booking_items_count || 0);
    const summary = String(booking.unit_summary || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    return {
        ...booking,
        total_price: totalPrice,
        addon_amount: addonAmount,
        amount_paid: amountPaid,
        balance,
        bookingKind: itemCount > 1 || summary.length > 1 ? 'Multiple rooms' : 'Single room'
    };
}

function buildUnitsModel(ledgerBooking, headerDetails) {
    const items = Array.isArray(headerDetails?.items) ? headerDetails.items : [];
    if (items.length > 0) {
        return items.map((item) => ({
            id: item.booking_item_id || item.unit_id || item.room_type,
            roomType: item.room_type || ledgerBooking?.room_type || 'Unassigned',
            unitId: item.unit_id || '',
            unitLabel: item.unit_label || item.unit_id || 'Unassigned',
            guest_count: Number(item.guest_count ?? item.guests ?? 0),
            lodging_subtotal: Number(item.lodging_subtotal ?? item.subtotal ?? 0),
            status: item.status || DEFAULT_ALLOCATION_STATUS
        }));
    }

    if (!ledgerBooking) return [];

    return [{
        id: ledgerBooking.unit_id || ledgerBooking.booking_ref,
        roomType: ledgerBooking.room_type || 'Unassigned',
        unitId: ledgerBooking.unit_id || '',
        unitLabel: ledgerBooking.unit_label || ledgerBooking.unit_id || ledgerBooking.room_type || 'Unassigned',
        guest_count: Number(ledgerBooking.guests || ledgerBooking.pax || 0),
        lodging_subtotal: Number(ledgerBooking.total_price || 0),
        status: ledgerBooking.status || 'Unknown'
    }];
}

function buildPaymentsModel(reconciliation) {
    const timeline = Array.isArray(reconciliation?.timeline) ? reconciliation.timeline : [];
    return timeline
        .filter((entry) => {
            const lowered = String(entry.type || entry.kind || '').toLowerCase();
            return lowered.includes('payment') || lowered.includes('deposit') || lowered.includes('refund') || lowered.includes('verification');
        })
        .map((entry, index) => ({
            id: entry.id || `${entry.timestamp || entry.created_at || 'payment'}-${index}`,
            label: entry.label || entry.type || entry.kind || 'Ledger event',
            amount: Number(entry.amount || 0),
            status: entry.status || entry.payment_status || '',
            method: entry.method || entry.payment_method || '',
            timestamp: entry.timestamp || entry.created_at || '',
            notes: entry.notes || entry.summary || ''
        }));
}

function buildHistoryModel(reconciliation, headerDetails, ledgerBooking) {
    const timeline = Array.isArray(reconciliation?.timeline) ? reconciliation.timeline : [];
    if (timeline.length > 0) {
        return timeline.map((entry, index) => ({
            id: entry.id || `${entry.timestamp || entry.created_at || 'history'}-${index}`,
            title: entry.label || entry.type || entry.kind || 'Ledger event',
            detail: entry.summary || entry.notes || entry.status || '',
            timestamp: entry.timestamp || entry.created_at || ''
        }));
    }

    const createdAt = headerDetails?.header?.created_at || ledgerBooking?.created_at || '';
    return createdAt ? [{
        id: 'created',
        title: 'Booking record loaded',
        detail: 'No separate audit timeline was returned for this booking yet.',
        timestamp: createdAt
    }] : [];
}

function buildAddonsModel(booking, headerDetails, reconciliation) {
    const headerAddons = Array.isArray(headerDetails?.addons) ? headerDetails.addons : [];
    if (headerAddons.length > 0) {
        return headerAddons.map((addon) => ({
            id: addon.addon_id || `${addon.item_name}-${addon.created_at}`,
            item_name: addon.item_name || 'Add-on',
            amount: Number(addon.amount || 0),
            notes: addon.notes || '',
            created_at: addon.created_at || '',
            source: 'header'
        }));
    }

    const timeline = Array.isArray(reconciliation?.timeline) ? reconciliation.timeline : [];
    return timeline
        .filter((entry) => {
            const lowered = `${entry.category || ''} ${entry.type || ''} ${entry.description || ''}`.toLowerCase();
            return lowered.includes('add-on') || lowered.includes('extra charge') || lowered.includes('service add-on');
        })
        .map((entry, index) => ({
            id: entry.id || `${entry.timestamp || entry.created_at || 'addon'}-${index}`,
            item_name: entry.description || 'Add-on',
            amount: Number(entry.amount || 0),
            notes: entry.description || '',
            created_at: entry.timestamp || entry.created_at || '',
            source: 'legacy'
        }));
}

function buildWarnings(booking, units, reconciliation) {
    const warnings = [];
    const balance = Number(booking?.balance || 0);
    if (balance > 0) {
        warnings.push({ type: 'finance', message: `Balance due: PHP ${balance.toLocaleString()}` });
    }

    if (booking?.booking_mode === 'MANUAL_OVERRIDE') {
        warnings.push({ type: 'override', message: 'Manual pricing was used for this booking. Please review totals before collecting payment.' });
    }

    if (reconciliation?.summary && /pending|rejected/i.test(String(reconciliation.summary))) {
        warnings.push({ type: 'verification', message: reconciliation.summary });
    }

    const unitWithGuests = units.find((unit) => Number(unit.guests || 0) > 0);
    if (!unitWithGuests && booking?.bookingKind === 'Multiple rooms') {
        warnings.push({ type: 'assignment', message: 'Room assignments need review.' });
    }

    return warnings;
}

export function useBookingWorkspace(bookingRef, seedBooking = null) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [ledgerBooking, setLedgerBooking] = useState(seedBooking ? normalizeLedgerBooking(seedBooking) : null);
    const [headerDetails, setHeaderDetails] = useState(null);
    const [reconciliation, setReconciliation] = useState(null);
    const [availableUnits, setAvailableUnits] = useState([]);
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [paymentError, setPaymentError] = useState('');
    const [paymentSuccess, setPaymentSuccess] = useState('');
    const [overviewSaving, setOverviewSaving] = useState(false);
    const [overviewError, setOverviewError] = useState('');
    const [overviewSuccess, setOverviewSuccess] = useState('');
    const [addonSaving, setAddonSaving] = useState(false);
    const [addonError, setAddonError] = useState('');
    const [addonSuccess, setAddonSuccess] = useState('');
    const [actionSaving, setActionSaving] = useState(false);
    const [actionError, setActionError] = useState('');
    const [actionSuccess, setActionSuccess] = useState('');
    const [itemSavingId, setItemSavingId] = useState(null);
    const [itemError, setItemError] = useState('');
    const [itemSuccess, setItemSuccess] = useState('');

    const refresh = useCallback(async () => {
        if (!bookingRef) return;

        setLoading(true);
        setError('');

        try {
            const [ledgerResult, headerResult, reconResult, unitsResult] = await Promise.allSettled([
                api.get('/api/v1/admin/ledger'),
                api.get(`/api/v1/admin/booking-headers/${bookingRef}`),
                api.get(`/api/v1/admin/bookings/${bookingRef}/reconciliation`),
                api.get('/api/v1/admin/units')
            ]);

            let resolvedBooking = seedBooking ? normalizeLedgerBooking(seedBooking) : null;
            if (ledgerResult.status === 'fulfilled') {
                const rows = Array.isArray(ledgerResult.value?.ledger) ? ledgerResult.value.ledger : [];
                const matched = rows.find((row) => row.booking_ref === bookingRef);
                if (matched) resolvedBooking = normalizeLedgerBooking(matched);
            }

            if (!resolvedBooking) {
                throw new Error('Booking not found in the admin ledger.');
            }

            setLedgerBooking(resolvedBooking);
            setHeaderDetails(headerResult.status === 'fulfilled' ? headerResult.value : null);
            setReconciliation(reconResult.status === 'fulfilled' ? reconResult.value : null);
            setAvailableUnits(unitsResult.status === 'fulfilled' ? (unitsResult.value?.units || []) : []);
        } catch (err) {
            setError(err?.message || 'Failed to load booking workspace.');
        } finally {
            setLoading(false);
        }
    }, [bookingRef, seedBooking]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const submitPayment = useCallback(async ({
        amount,
        payment_method = 'Cash',
        payment_type = 'payment',
        verification_status = 'VERIFIED',
        notes = ''
    }) => {
        if (!bookingRef) return false;

        setPaymentSaving(true);
        setPaymentError('');
        setPaymentSuccess('');

        try {
            const paymentValidationMessage = validatePaymentDraft({ amount }, {
                balance: headerDetails?.header?.balance_due ?? ledgerBooking?.balance ?? 0
            });
            if (paymentValidationMessage) {
                throw new Error(paymentValidationMessage);
            }

            await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, {
                workflow: 'edit',
                payment: {
                    amount: Number(amount || 0),
                    payment_type,
                    transaction_type: payment_type,
                    payment_method,
                    verification_status,
                    notes
                },
                admin_id: 'Vincent-Admin'
            });

            await refresh();
            setPaymentSuccess('Payment recorded successfully.');
            return true;
        } catch (err) {
            setPaymentError(err?.message || 'Payment recording failed.');
            return false;
        } finally {
            setPaymentSaving(false);
        }
    }, [bookingRef, headerDetails?.header?.balance_due, ledgerBooking?.balance, refresh]);

    const submitOverview = useCallback(async ({
        full_name,
        email,
        phone,
        check_in,
        check_out,
        booking_source,
        notes,
        special_requests
    }) => {
        if (!bookingRef) return false;

        setOverviewSaving(true);
        setOverviewError('');
        setOverviewSuccess('');

        try {
            const payload = {
                full_name,
                email,
                phone,
                check_in,
                check_out,
                booking_source,
                notes,
                special_requests,
                admin_id: 'Vincent-Admin'
            };

            await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, {
                workflow: 'edit',
                booking: payload,
                admin_id: 'Vincent-Admin'
            });

            await refresh();
            setOverviewSuccess('Booking overview updated successfully.');
            return true;
        } catch (err) {
            setOverviewError(err?.message || 'Overview update failed.');
            return false;
        } finally {
            setOverviewSaving(false);
        }
    }, [bookingRef, headerDetails?.header, refresh]);

    const submitItemUpdate = useCallback(async ({
        itemId,
        unit_id = null,
        status = DEFAULT_ALLOCATION_STATUS
    }) => {
        if (!bookingRef || !itemId) return false;

        setItemSavingId(String(itemId));
        setItemError('');
        setItemSuccess('');

        try {
            await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, {
                workflow: 'edit',
                booking: {
                    items: [{
                        booking_item_id: itemId,
                        unit_id: unit_id || null,
                        status
                    }]
                },
                admin_id: 'Vincent-Admin'
            });

            await refresh();
            setItemSuccess('Unit allocation updated successfully.');
            return true;
        } catch (err) {
            setItemError(err?.message || 'Unit allocation update failed.');
            return false;
        } finally {
            setItemSavingId(null);
        }
    }, [bookingRef, refresh]);

    const submitAddonCharge = useCallback(async ({
        amount,
        item_name
    }) => {
        if (!bookingRef) return false;

        setAddonSaving(true);
        setAddonError('');
        setAddonSuccess('');

        try {
            const addonValidationMessage = validateAddonDraft({ amount, item_name });
            if (addonValidationMessage) {
                throw new Error(addonValidationMessage);
            }

            const currentAddonAmount = Number(headerDetails?.header?.addon_amount ?? ledgerBooking?.addon_amount ?? 0);
            const nextAddonAmount = currentAddonAmount + Number(amount || 0);
            const currentNotes = String(headerDetails?.header?.notes ?? ledgerBooking?.notes ?? '').trim();
            const addonNote = `Add-on: ${item_name} (${Number(amount || 0).toLocaleString()})`;

            await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, {
                workflow: 'edit',
                booking: {
                    addon_amount: nextAddonAmount,
                    notes: [currentNotes, addonNote].filter(Boolean).join('\n')
                },
                admin_id: 'Vincent-Admin'
            });

            await refresh();
            setAddonSuccess('Add-on charge recorded successfully.');
            return true;
        } catch (err) {
            setAddonError(err?.message || 'Add-on charge failed.');
            return false;
        } finally {
            setAddonSaving(false);
        }
    }, [bookingRef, headerDetails?.header, ledgerBooking?.addon_amount, ledgerBooking?.notes, refresh]);

    const submitStatusUpdate = useCallback(async ({
        status
    }) => {
        if (!bookingRef || !status) return false;

        setActionSaving(true);
        setActionError('');
        setActionSuccess('');

        try {
            if (String(status).toUpperCase() === 'CHECKED_OUT') {
                throw new Error('Use the Check Out action so balance clearance and unit release still run correctly.');
            }

            const payload = {
                status,
                admin_id: 'Vincent-Admin'
            };

            if (status === 'CHECKED_IN' && ledgerBooking?.unit_id) {
                payload.unit_id = ledgerBooking.unit_id;
            }

            await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, {
                workflow: status === 'CHECKED_IN' ? 'checkin' : 'edit',
                booking: payload,
                admin_id: 'Vincent-Admin'
            });
            await refresh();
            setActionSuccess(`Status updated to ${status}.`);
            return true;
        } catch (err) {
            setActionError(err?.message || 'Status update failed.');
            return false;
        } finally {
            setActionSaving(false);
        }
    }, [bookingRef, ledgerBooking?.unit_id, refresh]);

    const submitCheckout = useCallback(async () => {
        if (!bookingRef) return false;

        setActionSaving(true);
        setActionError('');
        setActionSuccess('');

        try {
            const result = await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, {
                workflow: 'checkout',
                admin_id: 'Vincent-Admin'
            });
            await refresh();
            setActionSuccess(result?.message || 'Checkout completed successfully.');
            return true;
        } catch (err) {
            setActionError(err?.message || 'Checkout failed.');
            return false;
        } finally {
            setActionSaving(false);
        }
    }, [bookingRef, refresh]);

    const model = useMemo(() => {
        const header = headerDetails?.header || null;
        const booking = ledgerBooking || (header ? normalizeLedgerBooking(header) : null);
        const units = buildUnitsModel(booking, headerDetails);
        const payments = buildPaymentsModel(reconciliation);
        const history = buildHistoryModel(reconciliation, headerDetails, booking);
        const addons = buildAddonsModel(booking, headerDetails, reconciliation);
        const { roomTotal, addonTotal, grandTotal, paid, balance } = getBookingFinancialSnapshot(booking, header);

        return {
            booking,
            units,
            payments,
            history,
            addons,
            reconciliation,
            availableUnits,
            totals: {
                roomTotal,
                addonTotal,
                grandTotal,
                paid,
                balance
            },
            warnings: buildWarnings({ ...booking, balance }, units, reconciliation),
            meta: {
                bookingKind: booking?.bookingKind || 'Single room',
                isTransaction: ['transaction_header', 'transaction_item'].includes(booking?.record_origin),
                canRecordPayments: Boolean(headerDetails?.header),
                canEditUnits: Boolean(headerDetails?.header) && ['transaction_header', 'transaction_item'].includes(booking?.record_origin),
                canEditOverview: Boolean(booking),
                canAddAddons: Boolean(booking),
                canRunActions: Boolean(booking)
            }
        };
    }, [headerDetails, ledgerBooking, reconciliation, availableUnits]);

    return {
        loading,
        error,
        refresh,
        model,
        submitOverview,
        submitPayment,
        submitItemUpdate,
        submitAddonCharge,
        submitStatusUpdate,
        submitCheckout,
        overviewSaving,
        overviewError,
        overviewSuccess,
        addonSaving,
        addonError,
        addonSuccess,
        actionSaving,
        actionError,
        actionSuccess,
        paymentSaving,
        paymentError,
        paymentSuccess,
        itemSavingId,
        itemError,
        itemSuccess
    };
}
