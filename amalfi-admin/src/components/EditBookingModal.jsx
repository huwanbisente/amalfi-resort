import React, { useEffect, useMemo, useState } from 'react';
import { Home, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { calculatePrice } from '../utils/bookingLogic';
import {
    Badge,
    Button,
    Card,
    CardContent,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Input,
    StatusBadge,
    Tabs,
    TabsList,
    TabsTrigger,
    Textarea,
} from '@/components/shared';
import {
    alertDangerClass,
    editorGridClass,
    fieldLabelClass,
    formGridClass,
    inputClass,
    readOnlyFieldClass,
    selectClass,
    textareaClass,
} from '@/components/shared/formStyles';
import { cn } from '@/lib/utils';

const TABS = [
    { key: 'stay', label: 'Stay Dates', step: '01' },
    { key: 'units', label: 'Units', step: '02' },
    { key: 'guest', label: 'Guest Info', step: '03' },
    { key: 'money', label: 'Payments', step: '04' },
    { key: 'review', label: 'Review', step: '05' },
];
const bookingTabListClass = 'grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_8px_16px_rgba(19,33,31,0.035)] md:grid-cols-5';
const bookingTabTriggerClass = 'group min-h-9 justify-center gap-2 rounded-xl border border-[#d8c9b3]/80 bg-[#fffdf8]/78 px-3 text-center text-[0.72rem] font-black text-[#5f6d66] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[#c6923f]/70 hover:bg-[#fff7e6] hover:text-[#70480f] data-[state=active]:border-[#0a6b5f] data-[state=active]:bg-[linear-gradient(180deg,#0d766a_0%,#075f55_100%)] data-[state=active]:text-[#fffdf8] data-[state=active]:shadow-[0_8px_18px_rgba(10,107,95,0.18),inset_0_1px_0_rgba(255,255,255,0.22)]';

const WORKFLOW_COPY = {
    edit: {
        title: 'Edit Booking',
        pill: 'CONTRACT EDIT',
        subtext: 'Change dates, unit assignments, guest details, totals, and payments from one contract editor.',
        moneyTitle: 'Payment Readiness',
        cta: 'Save Booking',
        saving: 'Saving...',
    },
    checkin: {
        title: 'Check In Booking',
        pill: 'ARRIVAL WORKFLOW',
        subtext: 'Settle the guest balance, verify the assigned unit, then move the booking into checked-in status.',
        moneyTitle: 'Arrival Settlement',
        cta: 'Settle & Check In',
        saving: 'Checking In...',
    },
    checkout: {
        title: 'Check Out Booking',
        pill: 'DEPARTURE WORKFLOW',
        subtext: 'Settle room balance and any additional charges before closing the stay and releasing the unit.',
        moneyTitle: 'Final Settlement',
        cta: 'Settle & Check Out',
        saving: 'Checking Out...',
    },
    correction: {
        title: 'Correct Past Booking',
        pill: 'HISTORICAL CORRECTION',
        subtext: 'Make careful record corrections for a closed booking. Keep a clear note for audit history.',
        moneyTitle: 'Correction Settlement',
        cta: 'Save Correction',
        saving: 'Saving Correction...',
    },
};

const STATUS_OPTIONS = ['PENDING_VERIFICATION', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];
const unitEditHeaderClass = 'hidden grid-cols-[minmax(260px,1fr)_72px_116px_104px_88px] gap-2 px-3 text-[0.56rem] font-black uppercase tracking-[0.08em] text-muted-foreground lg:grid';
const unitEditRowClass = 'grid min-w-0 gap-2 rounded-2xl border border-[#c8ae7c]/65 bg-[#fffdf8]/92 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_12px_28px_rgba(51,34,15,0.06)] lg:grid-cols-[minmax(260px,1fr)_72px_116px_104px_88px] lg:items-center';

function getBookingRef(booking = {}) {
    return booking.booking_ref || booking.booking_reference || booking.reference || '';
}

function dateOnly(value, fallback = '') {
    return String(value || fallback || '').split('T')[0];
}

function roomFamily(roomType = '') {
    const value = String(roomType || '').toLowerCase();
    if (value.includes('villa')) return 'Villas';
    if (value.includes('kubo')) return 'Kubos';
    if (value.includes('teepee')) return 'Teepee';
    return '';
}

function unitRoomType(unit = {}) {
    return unit.room_type || unit.room_type_id || unit.marketing_name || '';
}

export function unitCapacity(unit = {}) {
    return Number(unit.absolute_max_pax || unit.max_capacity_pax || unit.max_pax || 0);
}

function money(value) {
    return `P${Number(value || 0).toLocaleString()}`;
}

export function normalizePaxInput(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    return String(Number(digits));
}

export function normalizeMoneyInput(value) {
    const cleaned = String(value ?? '').replace(/[^\d.]/g, '');
    const [whole = '', ...decimalParts] = cleaned.split('.');
    const normalizedWhole = whole ? String(Number(whole)) : '';
    const decimal = decimalParts.join('').slice(0, 2);
    if (!normalizedWhole && decimal) return `0.${decimal}`;
    if (!normalizedWhole) return '';
    return decimalParts.length ? `${normalizedWhole}.${decimal}` : normalizedWhole;
}

export function calculateUnitCharge({ unit, checkIn, checkOut, guests }) {
    if (!unit) return 0;
    return Number(calculatePrice({
        unit,
        checkIn,
        checkOut,
        guests: Number(guests || 0),
        isDayTour: false,
    })?.total_price || 0);
}

export function applyDiscountToCalculatedTotal(calculatedTotal, discountAmount) {
    const calculated = Math.max(0, Number(calculatedTotal || 0));
    const discount = Math.min(calculated, Math.max(0, Number(discountAmount || 0)));
    return Number((calculated - discount).toFixed(2));
}

export function discountAmountFromPercent(calculatedTotal, percent) {
    const calculated = Math.max(0, Number(calculatedTotal || 0));
    const normalizedPercent = Math.min(100, Math.max(0, Number(percent || 0)));
    return Number(((calculated * normalizedPercent) / 100).toFixed(2));
}

function bookingErrorMessage(err, fallback = 'Unable to save booking.') {
    const base = err?.message || err?.details?.error || fallback;
    const conflict = err?.conflict || err?.details?.conflict || err?.details?.conflicting_booking;
    if (!conflict) return base;
    const unitId = conflict.unit_id ? `Unit ${conflict.unit_id}` : 'Selected unit';
    const guest = conflict.full_name || conflict.guest_name || conflict.booking_ref || '';
    const dates = conflict.check_in && conflict.check_out ? ` from ${conflict.check_in} to ${conflict.check_out}` : '';
    if (/blocked|booked|conflict|taken/i.test(base)) return base;
    return `${unitId} is already booked${guest ? ` by ${guest}` : ''}${dates}.`;
}

export function isTransactionRecord(booking = {}) {
    if (['legacy', 'legacy_booking'].includes(booking.record_origin)) return false;
    if (['transaction_item', 'transaction_header'].includes(booking.record_origin)) return true;
    if (booking.transaction_ref || booking.booking_reference) return true;
    if (booking.booking_mode === 'STANDARD') return false;
    return booking.booking_mode === 'TRANSACTION'
        || booking.booking_mode === 'MULTI_UNIT'
        || booking.booking_mode === 'TRANSACTION_GROUP'
        || Number(booking.booking_items_count || 0) > 1;
}

export function selectedUnitConflicts({ unitIds = [], conflictMap = new Map() }) {
    return [...new Set((unitIds || []).filter(Boolean).map(String))]
        .map((unitId) => ({ unitId, conflict: conflictMap.get(unitId) }))
        .filter((entry) => Boolean(entry.conflict));
}

function getUnitLabel(unit = {}) {
    const type = unitRoomType(unit);
    const capacity = unitCapacity(unit);
    return `${unit.unit_label || unit.unit_id}${type ? ` - ${type}` : ''}${capacity ? ` (${capacity} pax)` : ''}`;
}

function makeTempBookingItem(unit) {
    return {
        booking_item_id: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        unit_id: unit.unit_id,
        room_type: unitRoomType(unit),
        status: 'RESERVED',
        guest_count: 0,
        lodging_subtotal: 0,
        is_draft_item: true,
    };
}

export function makeSeedBookingItem({ bookingRef = '', form = {}, unit = null } = {}) {
    return {
        booking_item_id: `seed-${bookingRef || 'booking'}`,
        unit_id: form.unit_id || unit?.unit_id || '',
        room_type: unit ? unitRoomType(unit) : form.room_type || '',
        status: form.status || 'RESERVED',
        guest_count: Number(form.guests || 0),
        lodging_subtotal: Number(form.total_price || 0),
        is_legacy_seed_item: true,
    };
}

export function datesOverlap(checkIn, checkOut, blockedCheckIn, blockedCheckOut) {
    if (!checkIn || !checkOut || !blockedCheckIn || !blockedCheckOut) return false;
    return checkIn < blockedCheckOut && checkOut > blockedCheckIn;
}

export function buildConflictMap({ units = [], existingBookings = [], bookingRef = '', checkIn = '', checkOut = '' }) {
    const map = new Map();
    for (const unit of units || []) {
        const active = unit.active_booking;
        if (
            active?.booking_ref &&
            active.booking_ref !== bookingRef &&
            datesOverlap(checkIn, checkOut, active.check_in, active.check_out)
        ) {
            map.set(unit.unit_id, active);
        }
    }
    for (const booking of existingBookings || []) {
        if (!booking?.unit_id || booking.booking_ref === bookingRef) continue;
        if (['CANCELLED', 'REJECTED', 'PAYMENT_REJECTED'].includes(booking.status)) continue;
        if (!datesOverlap(checkIn, checkOut, booking.check_in, booking.check_out)) continue;
        if (!map.has(booking.unit_id)) map.set(booking.unit_id, booking);
    }
    return map;
}

export function EditBookingModal({
    initialData,
    initialTab = null,
    workflowMode = 'edit',
    onSaved,
    onSync = () => {},
    onClose,
    onDelete,
    units = [],
    existingBookings = [],
}) {
    const bookingRef = getBookingRef(initialData);
    const transactionMode = isTransactionRecord(initialData);
    const normalizedWorkflowMode = Object.prototype.hasOwnProperty.call(WORKFLOW_COPY, workflowMode) ? workflowMode : 'edit';
    const workflowCopy = WORKFLOW_COPY[normalizedWorkflowMode];
    const normalizedInitialTab = initialTab === 'payments' ? 'money' : initialTab === 'checkout' ? 'money' : initialTab === 'unit-change' ? 'units' : initialTab || 'stay';
    const [activeTab, setActiveTab] = useState(normalizedInitialTab || 'stay');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [bookingConflictMessage, setBookingConflictMessage] = useState('');
    const [savedFlash, setSavedFlash] = useState(false);
    const [transactionDetails, setTransactionDetails] = useState(null);
    const [itemDrafts, setItemDrafts] = useState({});
    const [addUnitId, setAddUnitId] = useState('');
    const [unitCategory, setUnitCategory] = useState(roomFamily(initialData?.room_type || ''));
    const initialVerifiedPaid = Number(initialData?.amount_paid || initialData?.verified_paid_total || 0);
    const [paidTotalEdit, setPaidTotalEdit] = useState(String(initialVerifiedPaid));
    const [verifiedPaidBaseline, setVerifiedPaidBaseline] = useState(initialVerifiedPaid);
    const [paymentTargetTouched, setPaymentTargetTouched] = useState(false);
    const [paymentNote, setPaymentNote] = useState('');
    const [unitBookingMode, setUnitBookingMode] = useState(transactionMode ? 'multi' : 'single');
    const [manualPricing, setManualPricing] = useState(true);
    const editingMultiUnits = transactionMode || unitBookingMode === 'multi';

    const [form, setForm] = useState(() => ({
        full_name: initialData?.full_name || initialData?.guest_name || '',
        email: initialData?.email || '',
        phone: initialData?.phone || '',
        check_in: dateOnly(initialData?.check_in),
        check_out: dateOnly(initialData?.check_out),
        guests: Number(initialData?.guests || initialData?.pax || 1),
        booking_source: initialData?.booking_source || 'Direct',
        status: initialData?.status || 'RESERVED',
        notes: initialData?.notes || '',
        special_requests: initialData?.special_requests || '',
        addon_note: initialData?.addon_note || '',
        unit_id: initialData?.unit_id || '',
        room_type: initialData?.room_type || initialData?.room_type_id || '',
        total_price: Number(initialData?.total_price || initialData?.lodging_total || 0),
        addon_amount: Number(initialData?.addon_amount || 0),
        amount_paid: Number(initialData?.amount_paid || initialData?.verified_paid_total || 0),
        payment_method: 'Cash',
    }));

    useEffect(() => {
        if (!transactionMode || !bookingRef) return;
        let active = true;
        setLoading(true);
        api.get(`/api/v1/admin/booking-headers/${bookingRef}`)
            .then((payload) => {
                if (!active) return;
                const header = payload?.header || {};
                const items = Array.isArray(payload?.items) ? payload.items : [];
                const editableItems = items.filter((item) => String(item.status || '').toUpperCase() !== 'CANCELLED');
                setTransactionDetails({ ...payload, items: editableItems });
                setItemDrafts(Object.fromEntries(editableItems.map((item) => [item.booking_item_id, {
                    unit_id: item.unit_id || '',
                    room_type: item.room_type || '',
                    status: item.status || 'RESERVED',
                    guest_count: Number(item.guest_count || 0),
                    lodging_subtotal: Number(item.lodging_subtotal || 0),
                }])));
                setForm((current) => ({
                    ...current,
                    full_name: header.guest_name || current.full_name,
                    email: header.email || current.email,
                    phone: header.phone || current.phone,
                    check_in: dateOnly(header.check_in, current.check_in),
                    check_out: dateOnly(header.check_out, current.check_out),
                    status: header.status || current.status,
                    booking_source: header.booking_source || current.booking_source,
                    notes: header.notes || current.notes,
                    special_requests: header.special_requests || current.special_requests,
                    addon_note: current.addon_note,
                    total_price: Number(header.lodging_total ?? current.total_price),
                    addon_amount: Number(header.addon_amount ?? current.addon_amount),
                    amount_paid: Number(header.verified_paid_total ?? current.amount_paid),
                    guests: editableItems.reduce((sum, item) => sum + Number(item.guest_count || 0), 0) || current.guests,
                }));
                const refreshedPaidTotal = Number(header.verified_paid_total || 0);
                setPaidTotalEdit(String(refreshedPaidTotal));
                setVerifiedPaidBaseline(refreshedPaidTotal);
                setPaymentTargetTouched(false);
                setManualPricing(true);
            })
            .catch((err) => setError(err?.message || 'Failed to load booking details.'))
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [bookingRef, transactionMode]);

    useEffect(() => {
        if (transactionMode || unitBookingMode !== 'multi') return;
        const items = Array.isArray(transactionDetails?.items) ? transactionDetails.items : [];
        if (items.length > 0) return;
        const seedUnit = (units || []).find((unit) => String(unit.unit_id) === String(form.unit_id || ''));
        const seedItem = makeSeedBookingItem({ bookingRef, form, unit: seedUnit });
        setTransactionDetails((current) => ({
            ...(current || {}),
            items: [seedItem],
        }));
        setItemDrafts((current) => ({
            ...current,
            [seedItem.booking_item_id]: {
                unit_id: seedItem.unit_id,
                room_type: seedItem.room_type,
                status: seedItem.status,
                guest_count: seedItem.guest_count,
                lodging_subtotal: seedItem.lodging_subtotal,
            },
        }));
    }, [bookingRef, form, transactionDetails, transactionMode, unitBookingMode, units]);

    const transactionItems = useMemo(() => {
        if (!editingMultiUnits) return [];
        return Array.isArray(transactionDetails?.items) ? transactionDetails.items : [];
    }, [editingMultiUnits, transactionDetails]);

    useEffect(() => {
        if (!editingMultiUnits || transactionItems.length === 0) return;
        if (manualPricing) return;
        let changed = false;
        const nextDrafts = { ...itemDrafts };

        for (const item of transactionItems) {
            const draft = nextDrafts[item.booking_item_id] || {};
            const unitId = draft.unit_id ?? item.unit_id ?? '';
            const unit = (units || []).find((row) => String(row.unit_id) === String(unitId || ''));
            const guestCount = Number(draft.guest_count ?? item.guest_count ?? 0);
            const calculatedCharge = calculateUnitCharge({
                unit,
                checkIn: form.check_in,
                checkOut: form.check_out,
                guests: guestCount,
            });
            if (Number(draft.lodging_subtotal ?? item.lodging_subtotal ?? 0) !== calculatedCharge) {
                nextDrafts[item.booking_item_id] = {
                    ...draft,
                    lodging_subtotal: calculatedCharge,
                };
                changed = true;
            }
        }

        if (changed) {
            setItemDrafts(nextDrafts);
        }
    }, [editingMultiUnits, form.check_in, form.check_out, itemDrafts, manualPricing, transactionItems, units]);

    useEffect(() => {
        if (!editingMultiUnits) return;
        if (manualPricing) return;
        const nextTotal = transactionItems
            .filter((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')
            .reduce((sum, item) => sum + Number(itemDrafts[item.booking_item_id]?.lodging_subtotal ?? item.lodging_subtotal ?? 0), 0);
        setForm((current) => (
            Number(current.total_price || 0) === nextTotal ? current : { ...current, total_price: nextTotal }
        ));
    }, [editingMultiUnits, itemDrafts, manualPricing, transactionItems]);

    const conflictMap = useMemo(() => buildConflictMap({
        units,
        existingBookings,
        bookingRef,
        checkIn: form.check_in,
        checkOut: form.check_out,
    }), [bookingRef, existingBookings, form.check_in, form.check_out, units]);

    const selectedLegacyUnit = useMemo(
        () => (units || []).find((unit) => String(unit.unit_id) === String(form.unit_id || '')),
        [form.unit_id, units]
    );

    useEffect(() => {
        if (editingMultiUnits || !selectedLegacyUnit) return;
        if (manualPricing) return;
        const nextTotal = calculateUnitCharge({
            unit: selectedLegacyUnit,
            checkIn: form.check_in,
            checkOut: form.check_out,
            guests: form.guests,
        });
        setForm((current) => (
            Number(current.total_price || 0) === nextTotal ? current : { ...current, total_price: nextTotal }
        ));
    }, [editingMultiUnits, form.check_in, form.check_out, form.guests, manualPricing, selectedLegacyUnit]);

    const draftAssignedUnits = useMemo(() => {
        if (!editingMultiUnits) return selectedLegacyUnit ? [selectedLegacyUnit] : [];
        return transactionItems
            .filter((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')
            .map((item) => {
                const unitId = itemDrafts[item.booking_item_id]?.unit_id ?? item.unit_id;
                return (units || []).find((unit) => String(unit.unit_id) === String(unitId || ''));
            })
            .filter(Boolean);
    }, [editingMultiUnits, itemDrafts, selectedLegacyUnit, transactionItems, units]);

    const capacity = draftAssignedUnits.reduce((sum, unit) => sum + unitCapacity(unit), 0);
    const activeAssignedPax = useMemo(() => {
        if (!editingMultiUnits) return Number(form.guests || 0);
        return transactionItems
            .filter((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')
            .reduce((sum, item) => sum + Number(itemDrafts[item.booking_item_id]?.guest_count ?? item.guest_count ?? 0), 0);
    }, [editingMultiUnits, form.guests, itemDrafts, transactionItems]);

    useEffect(() => {
        if (!editingMultiUnits) return;
        setForm((current) => (
            Number(current.guests || 0) === activeAssignedPax ? current : { ...current, guests: activeAssignedPax }
        ));
    }, [activeAssignedPax, editingMultiUnits]);

    const paxCapacityViolations = useMemo(() => {
        if (!editingMultiUnits) {
            const maxPax = selectedLegacyUnit ? unitCapacity(selectedLegacyUnit) : 0;
            return maxPax > 0 && Number(form.guests || 0) > maxPax
                ? [{ label: selectedLegacyUnit.unit_label || selectedLegacyUnit.unit_id || 'Selected unit', guests: Number(form.guests || 0), maxPax }]
                : [];
        }

        return transactionItems
            .filter((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')
            .map((item) => {
                const draft = itemDrafts[item.booking_item_id] || {};
                const unitId = draft.unit_id ?? item.unit_id ?? '';
                const unit = (units || []).find((row) => String(row.unit_id) === String(unitId || ''));
                const maxPax = unit ? unitCapacity(unit) : 0;
                const guests = Number(draft.guest_count ?? item.guest_count ?? 0);
                return maxPax > 0 && guests > maxPax
                    ? { label: unit?.unit_label || unitId || 'Selected unit', guests, maxPax }
                    : null;
            })
            .filter(Boolean);
    }, [editingMultiUnits, form.guests, itemDrafts, selectedLegacyUnit, transactionItems, units]);

    const hasPaxCapacityError = paxCapacityViolations.length > 0 || (capacity > 0 && activeAssignedPax > capacity);
    const paxCapacityMessage = paxCapacityViolations.length > 0
        ? `${paxCapacityViolations[0].label} allows max ${paxCapacityViolations[0].maxPax} pax. Current entry is ${paxCapacityViolations[0].guests} pax.`
        : hasPaxCapacityError
            ? `Total pax exceeds selected unit capacity: ${activeAssignedPax} / ${capacity}.`
            : '';
    const unitConflicts = selectedUnitConflicts({
        unitIds: editingMultiUnits
            ? transactionItems
                .filter((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')
                .map((item) => itemDrafts[item.booking_item_id]?.unit_id ?? item.unit_id)
            : [form.unit_id],
        conflictMap,
    });
    const hasUnitConflict = unitConflicts.length > 0;
    const activeConflictMessage = useMemo(() => {
        if (bookingConflictMessage) return bookingConflictMessage;
        if (!hasUnitConflict) return '';
        const first = unitConflicts[0];
        const blocker = first?.conflict || {};
        return `Unit ${first.unitId} is already blocked for these dates${blocker.full_name || blocker.guest_name || blocker.booking_ref ? ` by ${blocker.full_name || blocker.guest_name || blocker.booking_ref}` : ''}. Choose another unit or change the stay dates.`;
    }, [bookingConflictMessage, hasUnitConflict, unitConflicts]);
    const roomChargeTotal = Number(form.total_price || 0);
    const calculatedRoomCharge = useMemo(() => {
        if (!editingMultiUnits) {
            return calculateUnitCharge({
                unit: selectedLegacyUnit,
                checkIn: form.check_in,
                checkOut: form.check_out,
                guests: form.guests,
            });
        }

        return transactionItems
            .filter((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')
            .reduce((sum, item) => {
                const draft = itemDrafts[item.booking_item_id] || {};
                const unitId = draft.unit_id ?? item.unit_id ?? '';
                const rowUnit = (units || []).find((unit) => String(unit.unit_id) === String(unitId || ''));
                return sum + calculateUnitCharge({
                    unit: rowUnit,
                    checkIn: form.check_in,
                    checkOut: form.check_out,
                    guests: Number(draft.guest_count ?? item.guest_count ?? 0),
                });
            }, 0);
    }, [editingMultiUnits, form.check_in, form.check_out, form.guests, itemDrafts, selectedLegacyUnit, transactionItems, units]);
    const pricingAdjustment = Number((calculatedRoomCharge - roomChargeTotal).toFixed(2));
    const addonChargeTotal = Number(form.addon_amount || 0);
    const grossTotal = roomChargeTotal + addonChargeTotal;
    const targetPaidTotal = Number(paidTotalEdit || 0);
    const balance = Math.max(0, grossTotal - targetPaidTotal);
    const paidAfterSave = targetPaidTotal;
    const finalBalance = Math.max(0, grossTotal - paidAfterSave);
    const isSettlementWorkflow = ['checkin', 'checkout'].includes(normalizedWorkflowMode);
    const settlementBlocked = isSettlementWorkflow && finalBalance > 1;
    const overCapacity = hasPaxCapacityError;
    const categoryOptions = useMemo(() => {
        const seen = new Set();
        for (const unit of units || []) {
            const family = roomFamily(unitRoomType(unit));
            if (family) seen.add(family);
        }
        return ['Villas', 'Kubos', 'Teepee'].filter((value) => seen.has(value));
    }, [units]);

    const fillFullPayment = () => {
        setPaidTotalEdit(String(grossTotal));
        setPaymentTargetTouched(true);
        setForm((current) => ({
            ...current,
            payment_method: current.payment_method || 'Cash',
        }));
    };

    const useCalculatedPricing = () => {
        setManualPricing(false);
        if (!editingMultiUnits) {
            setForm((current) => ({ ...current, total_price: calculatedRoomCharge }));
            return;
        }

        const nextDrafts = {};
        for (const item of transactionItems) {
            const draft = itemDrafts[item.booking_item_id] || {};
            const unitId = draft.unit_id ?? item.unit_id ?? '';
            const rowUnit = (units || []).find((unit) => String(unit.unit_id) === String(unitId || ''));
            nextDrafts[item.booking_item_id] = {
                ...draft,
                lodging_subtotal: calculateUnitCharge({
                    unit: rowUnit,
                    checkIn: form.check_in,
                    checkOut: form.check_out,
                    guests: Number(draft.guest_count ?? item.guest_count ?? 0),
                }),
            };
        }
        setItemDrafts((current) => ({ ...current, ...nextDrafts }));
        setForm((current) => ({ ...current, total_price: calculatedRoomCharge }));
    };

    const applyDiscountAmount = (value) => {
        const normalized = normalizeMoneyInput(value);
        const nextTotal = applyDiscountToCalculatedTotal(calculatedRoomCharge, normalized);
        setManualPricing(true);
        setForm((current) => ({ ...current, total_price: nextTotal }));
    };

    const applyDiscountPercent = (percent) => {
        applyDiscountAmount(String(discountAmountFromPercent(calculatedRoomCharge, percent)));
    };

    const updateForm = (field, value) => {
        if (['check_in', 'check_out', 'unit_id'].includes(field)) {
            setBookingConflictMessage('');
        }
        setForm((current) => ({ ...current, [field]: value }));
    };

    const buildChangeSetPayload = (preview = false) => {
        const chosenUnit = units.find((unit) => String(unit.unit_id) === String(form.unit_id || ''));
        const itemPayload = editingMultiUnits
            ? transactionItems.map((item) => {
                const draft = itemDrafts[item.booking_item_id] || {};
                return {
                    booking_item_id: item.booking_item_id,
                    unit_id: draft.unit_id ?? item.unit_id ?? null,
                    room_type: draft.room_type || item.room_type || '',
                    status: draft.status || item.status || 'RESERVED',
                    guest_count: Number(draft.guest_count ?? item.guest_count ?? 0),
                    lodging_subtotal: Number(draft.lodging_subtotal ?? item.lodging_subtotal ?? 0),
                };
            })
            : undefined;

        const shouldSendPaymentTarget = paymentTargetTouched
            && Math.abs(targetPaidTotal - verifiedPaidBaseline) >= 0.01;

        return {
            workflow: normalizedWorkflowMode,
            preview,
            booking: {
                full_name: form.full_name,
                guest_name: form.full_name,
                email: form.email,
                phone: form.phone,
                check_in: form.check_in,
                check_out: form.check_out,
                guests: Number(form.guests || 1),
                status: form.status,
                booking_source: form.booking_source,
                booking_type: initialData?.booking_type || 'overnight',
                notes: form.notes,
                special_requests: form.special_requests,
                addon_note: form.addon_note,
                addon_amount: Number(form.addon_amount || 0),
                total_price: Number(form.total_price || 0),
                lodging_total: Number(form.total_price || 0),
                unit_id: form.unit_id || null,
                room_type: chosenUnit ? unitRoomType(chosenUnit) : form.room_type,
                booking_mode: editingMultiUnits ? 'TRANSACTION_GROUP' : 'STANDARD',
                convert_to_transaction: !transactionMode && editingMultiUnits,
                items: itemPayload,
            },
            payment: null,
            payment_target: shouldSendPaymentTarget
                ? {
                    target_paid_total: targetPaidTotal,
                    payment_method: form.payment_method || 'Cash',
                    notes: paymentNote.trim() || `Paid total set via ${workflowCopy.title}`,
                    confirmed_manual_entry: true,
                }
                : null,
            admin_id: 'Vincent-Admin',
        };
    };

    const unitOptions = (units || [])
        .filter((unit) => !unitCategory || roomFamily(unitRoomType(unit)) === unitCategory)
        .sort((a, b) => String(a.unit_label || a.unit_id).localeCompare(String(b.unit_label || b.unit_id)));

    const allUnitOptions = (units || [])
        .sort((a, b) => String(a.unit_label || a.unit_id).localeCompare(String(b.unit_label || b.unit_id)));

    const addTransactionUnit = async () => {
        if (!addUnitId) return;
        const chosenUnit = units.find((unit) => String(unit.unit_id) === String(addUnitId));
        if (!chosenUnit) return;
        setError('');
        setBookingConflictMessage('');
        const tempItem = makeTempBookingItem(chosenUnit);
        const defaultGuestCount = 1;
        const defaultCharge = calculateUnitCharge({
            unit: chosenUnit,
            checkIn: form.check_in,
            checkOut: form.check_out,
            guests: defaultGuestCount,
        });
        setTransactionDetails((current) => ({
            ...(current || {}),
            items: [...(Array.isArray(current?.items) ? current.items : []), tempItem],
        }));
        setItemDrafts((current) => ({
            ...current,
            [tempItem.booking_item_id]: {
                unit_id: tempItem.unit_id,
                room_type: tempItem.room_type,
                status: form.status === 'CHECKED_IN' ? 'CHECKED_IN' : 'RESERVED',
                guest_count: defaultGuestCount,
                lodging_subtotal: defaultCharge,
            },
        }));
        setAddUnitId('');
    };

    const saveBooking = async () => {
        setSaving(true);
        setError('');
        setBookingConflictMessage('');
        if (!form.full_name || !form.check_in || !form.check_out) {
            setError('Guest name and stay dates are required.');
            setSaving(false);
            return;
        }
        if (form.check_out <= form.check_in) {
            setError('Check-out must be after check-in.');
            setSaving(false);
            return;
        }
        if (overCapacity) {
            setError(paxCapacityMessage || `Capacity exceeded: selected units allow ${capacity} pax.`);
            setSaving(false);
            return;
        }
        if (editingMultiUnits && !transactionItems.some((item) => (itemDrafts[item.booking_item_id]?.status || item.status) !== 'CANCELLED')) {
            setActiveTab('units');
            setError('At least one active unit is required.');
            setSaving(false);
            return;
        }
        if (hasUnitConflict) {
            setActiveTab('units');
            const first = unitConflicts[0];
            const blocker = first.conflict || {};
            const conflictMessage = `Unit ${first.unitId} is already blocked for these dates${blocker.full_name || blocker.guest_name || blocker.booking_ref ? ` by ${blocker.full_name || blocker.guest_name || blocker.booking_ref}` : ''}. Choose another unit or change the stay dates.`;
            setBookingConflictMessage(conflictMessage);
            setError(conflictMessage);
            setSaving(false);
            return;
        }
        if (settlementBlocked) {
            setActiveTab('money');
            setError(`${workflowCopy.cta} requires the final balance to be fully settled. Fill or record the remaining ${money(finalBalance)} before continuing.`);
            setSaving(false);
            return;
        }
        if (normalizedWorkflowMode === 'correction' && !String(form.notes || '').trim()) {
            setActiveTab('guest');
            setError('Past booking corrections require a note explaining why the record changed.');
            setSaving(false);
            return;
        }
        try {
            const preview = await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, buildChangeSetPayload(true));
            if (preview?.preview && preview.preview.can_commit === false) {
                setActiveTab('money');
                setError(preview.preview.message || preview.preview.reason || 'This change cannot be committed yet. Review the final balance and booking rules before saving.');
                setSaving(false);
                return;
            }
            await api.post(`/api/v1/admin/bookings/${bookingRef}/change-set`, buildChangeSetPayload(false));
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2500);
            await onSaved();
        } catch (err) {
            const message = bookingErrorMessage(err);
            if (err?.status === 409 || /blocked|booked|conflict|taken/i.test(err?.message || '')) {
                setBookingConflictMessage(message);
                setActiveTab('units');
            }
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const renderUnitSelect = (value, onChange, { currentUnitId = '', includeAll = false, placeholder = 'No unit assigned' } = {}) => {
        const baseOptions = includeAll ? allUnitOptions : unitOptions;
        const options = [...baseOptions].sort((a, b) => {
            if (String(a.unit_id) === String(currentUnitId || '')) return -1;
            if (String(b.unit_id) === String(currentUnitId || '')) return 1;
            return String(a.unit_label || a.unit_id).localeCompare(String(b.unit_label || b.unit_id));
        });
        return (
            <div className="relative min-w-0">
                <Home className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <select className={selectClass} value={value || ''} onChange={(event) => onChange(event.target.value)}>
                    <option value="">{placeholder}</option>
                    {options.map((unit) => {
                        const conflict = conflictMap.get(unit.unit_id);
                        const disabled = Boolean(conflict);
                        return (
                            <option key={unit.unit_id} value={unit.unit_id} disabled={disabled}>
                                {String(unit.unit_id) === String(currentUnitId || '') && !disabled ? `Current: ${unit.unit_label || unit.unit_id}` : disabled ? `${getUnitLabel(unit)} - BOOKED` : getUnitLabel(unit)}
                            </option>
                        );
                    })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
        );
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
            <DialogContent className="flex max-h-[90vh] w-[min(1140px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[28px] border border-[#b8873e]/80 bg-[#fffaf1] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,255,255,0.48),0_0_0_1px_rgba(73,50,21,0.08),0_28px_90px_rgba(19,33,31,0.30),0_10px_30px_rgba(198,146,63,0.16)]">
                <DialogHeader className="relative min-h-[92px] overflow-hidden border-b border-[#c8ae7c]/70 bg-[#fffdf8] px-6 py-3 text-left shadow-[inset_0_-1px_0_rgba(255,255,255,0.86)]">
                    <img
                        src="/assets/page-headers/ledger-dock.svg"
                        alt=""
                        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[52%] object-cover opacity-95"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,#fffdf8_0%,rgba(255,253,248,0.98)_40%,rgba(255,253,248,0.72)_64%,rgba(10,107,95,0.44)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,#c6923f,rgba(198,146,63,0.32),rgba(10,107,95,0.55))]" />
                    <div className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#c6923f,#0a6b5f)] shadow-[0_0_18px_rgba(198,146,63,0.32)]" />
                    <div className="relative z-10 flex min-h-[62px] items-center pr-12">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <DialogTitle className="font-resortDisplay text-[1.55rem] font-black leading-none tracking-normal text-amalfi-ink">
                                    {workflowCopy.title}
                                </DialogTitle>
                                <StatusBadge tone="info">{workflowCopy.pill}</StatusBadge>
                                <StatusBadge tone={editingMultiUnits ? 'warning' : 'neutral'}>
                                    {editingMultiUnits ? 'Multi-room Booking' : 'Single Booking'}
                                </StatusBadge>
                            </div>
                            <DialogDescription className="sr-only">
                                {workflowCopy.subtext}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="border-b border-[#d8c9b3]/70 bg-[#fff7eb]/92 px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <TabsList className={bookingTabListClass}>
                        {TABS.map((tab) => (
                            <TabsTrigger key={tab.key} value={tab.key} className={bookingTabTriggerClass}>
                                <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[0.58rem] text-primary group-data-[state=active]:bg-white/15 group-data-[state=active]:text-white">
                                    {tab.step}
                                </span>
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(135deg,#fffaf1_0%,#f7eedf_52%,#eef6f0_100%)] px-4 py-3">
                    {error && (
                        <div className={cn(alertDangerClass, 'mb-4')}>
                            {error}
                        </div>
                    )}
                    {loading && <div className="text-sm font-bold text-muted-foreground">Loading booking details...</div>}

                    {activeTab === 'stay' && !loading && (
                        <div className={editorGridClass}>
                            <div className="grid min-w-0 gap-4">
                                <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                    <CardContent className="p-5">
                                        <div className="mb-3">
                                            <h3 className="text-base font-black text-foreground">Stay Dates</h3>
                                        </div>
                                        {activeConflictMessage && <div className={cn(alertDangerClass, 'mb-4')}>{activeConflictMessage}</div>}
                                        {paxCapacityMessage && <div className={cn(alertDangerClass, 'mb-4')}>{paxCapacityMessage}</div>}
                                    <div className={formGridClass}>
                                        <div>
                                            <label className={fieldLabelClass}>Check-In</label>
                                            <Input className={inputClass} type="date" value={form.check_in} onChange={(event) => updateForm('check_in', event.target.value)} />
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Check-Out</label>
                                            <Input className={inputClass} type="date" value={form.check_out} onChange={(event) => updateForm('check_out', event.target.value)} />
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Guests</label>
                                            <Input
                                                className={cn(inputClass, overCapacity && 'border-red-300 focus-visible:ring-red-200')}
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={form.guests}
                                                onChange={(event) => updateForm('guests', normalizePaxInput(event.target.value))}
                                                readOnly={editingMultiUnits}
                                                title={editingMultiUnits ? 'Total pax is calculated from the unit rows.' : 'Enter guests as whole numbers.'}
                                            />
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Status</label>
                                            <div className="relative">
                                                <select className={selectClass} value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                                                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                        </div>
                                    </div>
                                    </CardContent>
                                </Card>
                            </div>
                            <SummaryPanel form={form} capacity={capacity} grossTotal={grossTotal} balance={balance} transactionMode={editingMultiUnits} bookingRef={bookingRef} />
                        </div>
                    )}

                    {activeTab === 'units' && !loading && (
                        <div className={editorGridClass}>
                            <Card className="min-w-0 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                <CardContent className="p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-black text-foreground">Units</h3>
                                    </div>
                                    <StatusBadge tone={overCapacity ? 'danger' : 'success'}>
                                        {capacity || 0} pax capacity
                                    </StatusBadge>
                                </div>
                                {(hasUnitConflict || activeConflictMessage) && (
                                    <div className={cn(alertDangerClass, 'mb-4')}>
                                        {activeConflictMessage || 'One or more selected units are already blocked for these dates. Save is disabled until the unit or dates are changed.'}
                                    </div>
                                )}
                                {paxCapacityMessage && (
                                    <div className={cn(alertDangerClass, 'mb-4')}>
                                        {paxCapacityMessage}
                                    </div>
                                )}

                                    <div className="mb-4 inline-flex gap-1 rounded-2xl border border-transparent bg-[#f7eedf]/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] p-1">
                                        {[
                                            { id: 'single', label: 'Single room' },
                                            { id: 'multi', label: 'Multi-room' },
                                        ].map((mode) => {
                                            const active = unitBookingMode === mode.id;
                                            return (
                                                <Button
                                                    key={mode.id}
                                                    type="button"
                                                    onClick={() => setUnitBookingMode(mode.id)}
                                                    size="sm"
                                                    variant={active ? 'default' : 'ghost'}
                                                    className="rounded-xl text-xs font-black"
                                                >
                                                    {mode.label}
                                                </Button>
                                            );
                                        })}
                                    </div>

                                    {!editingMultiUnits && (
                                        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                                            <div>
                                                <label className={fieldLabelClass}>Category</label>
                                                <div className="relative">
                                                    <select className={selectClass} value={unitCategory} onChange={(event) => setUnitCategory(event.target.value)}>
                                                        <option value="">All</option>
                                                        {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                                                    </select>
                                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Assigned Unit</label>
                                                {renderUnitSelect(form.unit_id, (unitId) => {
                                                    const chosen = units.find((unit) => String(unit.unit_id) === String(unitId || ''));
                                                    setForm((current) => ({ ...current, unit_id: unitId, room_type: chosen ? unitRoomType(chosen) : current.room_type }));
                                                }, { currentUnitId: initialData?.unit_id })}
                                            </div>
                                        </div>
                                    )}

                                    {editingMultiUnits && (
                                        <div className="grid gap-3">
                                            <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                                <div className="min-w-0">
                                                    <label className={fieldLabelClass}>Add Unit</label>
                                                    {renderUnitSelect(addUnitId, setAddUnitId, { includeAll: true, placeholder: 'Add another unit...' })}
                                                </div>
                                                <Button type="button" variant="outline" onClick={addTransactionUnit} disabled={!addUnitId} className="rounded-xl font-black">
                                                    <Plus /> Add Unit
                                                </Button>
                                            </div>
                                            <div className={unitEditHeaderClass}>
                                                <span>Unit</span>
                                                <span>Pax</span>
                                                <span>Unit Charge</span>
                                                <span>Status</span>
                                                <span>Action</span>
                                            </div>

                                            {transactionItems.map((item) => {
                                                const draft = itemDrafts[item.booking_item_id] || {};
                                                const currentUnitId = item.unit_id || '';
                                                const itemStatus = draft.status || item.status || 'RESERVED';
                                                const currentGuestCount = Number(draft.guest_count ?? item.guest_count ?? 0);
                                                const currentCharge = Number(draft.lodging_subtotal ?? item.lodging_subtotal ?? 0);
                                                const rowUnitId = draft.unit_id ?? item.unit_id ?? '';
                                                const rowUnit = units.find((unit) => String(unit.unit_id) === String(rowUnitId || ''));
                                                const rowMaxPax = rowUnit ? unitCapacity(rowUnit) : 0;
                                                const rowOverCapacity = rowMaxPax > 0 && currentGuestCount > rowMaxPax;
                                                return (
                                                    <div key={item.booking_item_id} className={cn(unitEditRowClass, rowOverCapacity && 'border-red-300 bg-red-50/70')}>
                                                        <div className="min-w-0">
                                                            {renderUnitSelect(draft.unit_id ?? item.unit_id ?? '', (unitId) => {
                                                                const chosen = units.find((unit) => String(unit.unit_id) === String(unitId || ''));
                                                                const calculatedCharge = calculateUnitCharge({
                                                                    unit: chosen,
                                                                    checkIn: form.check_in,
                                                                    checkOut: form.check_out,
                                                                    guests: currentGuestCount,
                                                                });
                                                                setItemDrafts((current) => ({
                                                                    ...current,
                                                                    [item.booking_item_id]: {
                                                                        ...draft,
                                                                        unit_id: unitId,
                                                                        room_type: chosen ? unitRoomType(chosen) : draft.room_type || item.room_type,
                                                                        lodging_subtotal: calculatedCharge,
                                                                    },
                                                                }));
                                                            }, { currentUnitId, includeAll: true })}
                                                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[0.62rem] font-black uppercase tracking-normal">
                                                                <span className="rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-primary">
                                                                    {rowMaxPax || 0} pax max
                                                                </span>
                                                                {rowUnit?.room_type || rowUnit?.room_type_id ? (
                                                                    <span className="max-w-[180px] truncate rounded-full border border-[#d8c9b3]/70 bg-[#f7eedf]/66 px-2 py-0.5 text-muted-foreground">
                                                                        {rowUnit.room_type || rowUnit.room_type_id}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                        <Input aria-label="Pax for this unit" title={rowMaxPax ? `Max ${rowMaxPax} pax for this unit` : 'Pax for this unit'} className={cn(inputClass, 'text-center', rowOverCapacity && 'border-red-300 focus-visible:ring-red-200')} type="text" inputMode="numeric" pattern="[0-9]*" value={String(currentGuestCount || '')} onChange={(event) => {
                                                            const guestCount = Number(normalizePaxInput(event.target.value) || 0);
                                                            const selectedUnitId = draft.unit_id ?? item.unit_id ?? '';
                                                            const selectedUnit = units.find((unit) => String(unit.unit_id) === String(selectedUnitId || ''));
                                                            setItemDrafts((current) => ({
                                                                ...current,
                                                                [item.booking_item_id]: {
                                                                    ...draft,
                                                                    guest_count: guestCount,
                                                                    lodging_subtotal: calculateUnitCharge({
                                                                        unit: selectedUnit,
                                                                        checkIn: form.check_in,
                                                                        checkOut: form.check_out,
                                                                        guests: guestCount,
                                                                    }),
                                                                },
                                                            }));
                                                        }} />
                                                        <div
                                                            aria-label="Calculated unit charge"
                                                            title="Calculated from this unit, stay dates, and pax"
                                                            className="flex h-10 items-center justify-end rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-3 text-xs font-black text-foreground"
                                                        >
                                                            {money(currentCharge)}
                                                        </div>
                                                        <StatusBadge tone={itemStatus === 'CANCELLED' ? 'danger' : 'success'} className="justify-center py-2">
                                                            {itemStatus === 'CANCELLED' ? 'Staged Remove' : item.is_draft_item ? 'New Unit' : 'Active'}
                                                        </StatusBadge>
                                                        <Button type="button" variant="outline" onClick={() => setItemDrafts((current) => ({ ...current, [item.booking_item_id]: { ...draft, status: itemStatus === 'CANCELLED' ? 'RESERVED' : 'CANCELLED' } }))} className="rounded-xl border-red-200 text-xs font-black text-red-700 hover:bg-red-50">
                                                            <Trash2 /> {itemStatus === 'CANCELLED' ? 'Undo' : 'Remove'}
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <SummaryPanel form={form} capacity={capacity} grossTotal={grossTotal} balance={balance} transactionMode={editingMultiUnits} bookingRef={bookingRef} />
                        </div>
                    )}

                    {activeTab === 'guest' && (
                        <div className={editorGridClass}>
                            <Card className="min-w-0 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                <CardContent className="grid gap-4 p-5">
                                <div>
                                    <h3 className="text-base font-black text-foreground">Guest Info</h3>
                                </div>
                                <div className={formGridClass}>
                                    <div><label className={fieldLabelClass}>Full Name</label><Input className={inputClass} value={form.full_name} onChange={(event) => updateForm('full_name', event.target.value)} /></div>
                                    <div><label className={fieldLabelClass}>Phone</label><Input className={inputClass} value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} /></div>
                                    <div><label className={fieldLabelClass}>Email</label><Input className={inputClass} value={form.email} onChange={(event) => updateForm('email', event.target.value)} /></div>
                                    <div><label className={fieldLabelClass}>Source</label><Input className={inputClass} value={form.booking_source} onChange={(event) => updateForm('booking_source', event.target.value)} /></div>
                                    <div className="md:col-span-2">
                                        <label className={fieldLabelClass}>Notes</label>
                                        <Textarea className={textareaClass} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Internal booking notes..." />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={fieldLabelClass}>Special Requests</label>
                                        <Textarea className={textareaClass} value={form.special_requests} onChange={(event) => updateForm('special_requests', event.target.value)} placeholder="Guest requests, arrival details, or room preferences..." />
                                    </div>
                                </div>
                                </CardContent>
                            </Card>
                            <SummaryPanel form={form} capacity={capacity} grossTotal={grossTotal} balance={balance} transactionMode={editingMultiUnits} bookingRef={bookingRef} />
                        </div>
                    )}

                    {activeTab === 'money' && (
                        <div className={editorGridClass}>
                            <Card className="min-w-0 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                <CardContent className="grid gap-4 p-5">
                                <div className="grid min-w-0 gap-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-base font-black text-foreground">{workflowCopy.moneyTitle}</h3>
                                        <StatusBadge tone={manualPricing ? 'warning' : 'success'}>
                                            {manualPricing ? 'Manual agreed total' : 'Calculated from units'}
                                        </StatusBadge>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <ReviewItem label="Room / Unit Charges" value={money(roomChargeTotal)} />
                                        <ReviewItem
                                            label={pricingAdjustment > 0 ? 'Discount / Override' : pricingAdjustment < 0 ? 'Manual Increase' : 'Rate Difference'}
                                            value={money(Math.abs(pricingAdjustment))}
                                            tone={Math.abs(pricingAdjustment) >= 0.01 ? 'warning' : 'neutral'}
                                        />
                                        <ReviewItem label="Additional Charges" value={money(addonChargeTotal)} tone={addonChargeTotal > 0 ? 'warning' : 'neutral'} />
                                        <ReviewItem label="Paid" value={money(targetPaidTotal)} tone="success" />
                                        <ReviewItem label="Final Balance After Save" value={money(finalBalance)} tone={finalBalance > 0 ? 'danger' : 'success'} />
                                    </div>
                                </div>
                                <div className="grid min-w-0 gap-4">
                                    <section className="grid min-w-0 gap-4 rounded-2xl border border-[#d8c9b3]/70 bg-[#fff8ec]/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] md:grid-cols-2">
                                        <div className="md:col-span-2">
                                            <div className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">Rate & Discount</div>
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Room / Unit Charge Total</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input
                                                    className={cn(inputClass, 'pl-8')}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={form.total_price}
                                                    onChange={(event) => {
                                                        setManualPricing(true);
                                                        updateForm('total_price', normalizeMoneyInput(event.target.value));
                                                    }}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <StatusBadge tone={manualPricing ? 'warning' : 'success'}>
                                                    {manualPricing ? 'Manual total' : 'Rate engine'}
                                                </StatusBadge>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={useCalculatedPricing}
                                                    disabled={calculatedRoomCharge <= 0}
                                                    className="h-7 rounded-full px-3 text-[0.62rem] font-black"
                                                >
                                                    Use {money(calculatedRoomCharge)}
                                                </Button>
                                            </div>
                                            {Math.abs(pricingAdjustment) >= 0.01 && (
                                                <div className="mt-2 text-xs font-bold text-muted-foreground">
                                                    {pricingAdjustment > 0 ? 'Discount from calculated rate' : 'Above calculated rate'}: {money(Math.abs(pricingAdjustment))}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Calculated Rate</label>
                                            <div title="Based on selected unit/s, stay dates, and pax" className={readOnlyFieldClass}>
                                                {money(calculatedRoomCharge)}
                                            </div>
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Applied Discount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input
                                                    className={cn(inputClass, 'pl-8')}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={pricingAdjustment > 0 ? String(pricingAdjustment) : ''}
                                                    onChange={(event) => applyDiscountAmount(event.target.value)}
                                                    placeholder="0"
                                                    disabled={calculatedRoomCharge <= 0}
                                                />
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {[10, 20, 50].map((percent) => (
                                                    <Button
                                                        key={percent}
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => applyDiscountPercent(percent)}
                                                        disabled={calculatedRoomCharge <= 0}
                                                        className="h-7 rounded-full px-3 text-[0.62rem] font-black"
                                                    >
                                                        {percent}%
                                                    </Button>
                                                ))}
                                                <div className="relative w-24">
                                                    <Input
                                                        aria-label="Custom discount percentage"
                                                        className={cn(inputClass, 'h-7 rounded-full px-3 pr-6 text-[0.62rem] font-black')}
                                                        type="text"
                                                        inputMode="decimal"
                                                        placeholder="Custom"
                                                        onChange={(event) => applyDiscountPercent(normalizeMoneyInput(event.target.value))}
                                                        disabled={calculatedRoomCharge <= 0}
                                                    />
                                                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] font-black text-muted-foreground">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                    <section className="grid min-w-0 gap-4 rounded-2xl border border-[#c7dfd3]/80 bg-[#f3fbf6]/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] md:grid-cols-2">
                                        <div className="md:col-span-2">
                                            <div className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-primary">Add-ons & Extra Charges</div>
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Additional Charges / Add-ons</label>
                                            <Input
                                                className={inputClass}
                                                type="text"
                                                inputMode="decimal"
                                                value={form.addon_amount}
                                                onChange={(event) => updateForm('addon_amount', normalizeMoneyInput(event.target.value))}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className={fieldLabelClass}>Additional Charge Note</label>
                                            <Textarea className={textareaClass} value={form.addon_note} onChange={(event) => updateForm('addon_note', event.target.value)} placeholder="Laundry, corkage, extra mattress, damaged item..." />
                                        </div>
                                    </section>
                                    <section className="grid min-w-0 gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)]">
                                        <div>
                                            <div className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-primary">Payment / Settlement</div>
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                                    <label className={fieldLabelClass}>Paid</label>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={fillFullPayment}
                                                        disabled={balance <= 0}
                                                        className="h-7 rounded-full px-3 text-[0.62rem] font-black"
                                                    >
                                                        Fill Due
                                                    </Button>
                                                </div>
                                                <Input
                                                    className={inputClass}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={paidTotalEdit}
                                                    onChange={(event) => {
                                                        setPaymentTargetTouched(true);
                                                        setPaidTotalEdit(normalizeMoneyInput(event.target.value));
                                                    }}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                                            <div>
                                                <label className={fieldLabelClass}>Payment Method</label>
                                                <div className="relative">
                                                    <select className={selectClass} value={form.payment_method} onChange={(event) => updateForm('payment_method', event.target.value)}>
                                                        {['Cash', 'GCash', 'Bank Transfer', 'Card', 'Other'].map((method) => <option key={method} value={method}>{method}</option>)}
                                                        {form.payment_method && !['Cash', 'GCash', 'Bank Transfer', 'Card', 'Other'].includes(form.payment_method) && <option value={form.payment_method}>{form.payment_method}</option>}
                                                    </select>
                                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Payment Record Note</label>
                                                <Input className={inputClass} value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="OR number, cashier note, bank ref..." />
                                            </div>
                                        </div>
                                    </section>
                                </div>
                                {settlementBlocked && (
                                    <div className={alertDangerClass}>
                                        {workflowCopy.cta} is blocked until the final balance is {money(0)}.
                                    </div>
                                )}
                                </CardContent>
                            </Card>
                            <SummaryPanel form={form} capacity={capacity} grossTotal={grossTotal} balance={balance} transactionMode={editingMultiUnits} bookingRef={bookingRef} />
                        </div>
                    )}

                    {activeTab === 'review' && (
                        <Card className="min-w-0 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                            <CardContent className="grid gap-5 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-black text-foreground">Review Booking</h3>
                                </div>
                                <StatusBadge tone="success">
                                    {workflowCopy.title}
                                </StatusBadge>
                            </div>

                            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                                <div className="grid min-w-0 gap-4">
                                    <ReviewSection title="Stay">
                                        <ReviewLine label="Reference" value={bookingRef} tone="success" />
                                        <ReviewLine label="Booking Type" value={editingMultiUnits ? 'Multi-room booking' : 'Single booking'} />
                                        <ReviewLine label="Dates" value={`${form.check_in || '-'} to ${form.check_out || '-'}`} />
                                        <ReviewLine label="Status After Save" value={normalizedWorkflowMode === 'checkin' ? 'CHECKED_IN' : normalizedWorkflowMode === 'checkout' ? 'CHECKED_OUT' : form.status} />
                                        <ReviewLine label="Pax / Capacity" value={`${form.guests || 0} pax / ${capacity || 0} max`} tone={overCapacity ? 'danger' : 'neutral'} />
                                    </ReviewSection>

                                    <ReviewSection title="Guest">
                                        <ReviewLine label="Name" value={form.full_name || '-'} />
                                        <ReviewLine label="Contact" value={[form.phone, form.email].filter(Boolean).join(' / ') || '-'} />
                                        <ReviewLine label="Source" value={form.booking_source || '-'} />
                                        <ReviewLine label="Notes" value={form.notes || '-'} wide />
                                        <ReviewLine label="Special Requests" value={form.special_requests || '-'} wide />
                                    </ReviewSection>

                                    <ReviewSection title="Units">
                                        <div className="flex flex-wrap gap-2">
                                            {draftAssignedUnits.length ? draftAssignedUnits.map((unit) => (
                                                <Badge key={unit.unit_id} variant="outline" className="rounded-full bg-[#f7eedf]/48 px-3 py-1 text-xs font-black text-foreground">
                                                    {unit.unit_label || unit.unit_id}
                                                </Badge>
                                            )) : <span className="text-sm font-bold text-muted-foreground">No unit assigned</span>}
                                        </div>
                                    </ReviewSection>
                                </div>

                                <div className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                                    <div className="text-[0.58rem] font-black uppercase tracking-[0.1em] text-primary">Financial Summary</div>
                                    <ReviewMoneyLine label="Room / Unit Charges" value={money(roomChargeTotal)} />
                                    {Math.abs(pricingAdjustment) >= 0.01 && (
                                        <ReviewMoneyLine
                                            label={pricingAdjustment > 0 ? 'Discount / Override' : 'Manual Increase'}
                                            value={money(Math.abs(pricingAdjustment))}
                                            tone="warning"
                                        />
                                    )}
                                    <ReviewMoneyLine label="Additional Charges" value={money(addonChargeTotal)} tone={addonChargeTotal > 0 ? 'warning' : 'neutral'} />
                                    <ReviewMoneyLine label="Gross Total" value={money(grossTotal)} strong />
                                    <ReviewMoneyLine label="Paid" value={money(paidAfterSave)} tone="success" />
                                    <ReviewMoneyLine label="Final Balance" value={money(finalBalance)} tone={finalBalance > 0 ? 'danger' : 'success'} strong />
                                    {(form.addon_note || paymentNote) && (
                                        <div className="grid gap-2 border-t border-primary/20 pt-3">
                                            {form.addon_note && <ReviewNote label="Add-on Note" value={form.addon_note} />}
                                            {paymentNote && <ReviewNote label="Payment Note" value={paymentNote} />}
                                        </div>
                                    )}
                                </div>
                            </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={onClose} className="font-black">Close</Button>
                        {onDelete && <Button type="button" variant="ghost" onClick={() => onDelete(bookingRef)} className="font-black text-red-700 hover:bg-red-50 hover:text-red-700">Delete</Button>}
                    </div>
                    <div className="flex items-center gap-3">
                        {savedFlash && <span className="text-xs font-black text-primary">Saved</span>}
                        <Button type="button" onClick={saveBooking} disabled={saving || overCapacity || settlementBlocked || hasUnitConflict} className="rounded-xl font-black">
                            {saving ? workflowCopy.saving : workflowCopy.cta}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SummaryPanel({ form, capacity, grossTotal, balance, transactionMode, bookingRef }) {
    return (
        <aside className="sticky top-0">
            <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                <CardContent className="p-5">
            <div className="mb-4 text-[0.58rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Booking Snapshot</div>
            <div className="grid gap-3">
                <ReviewItem label="Reference" value={bookingRef} tone="success" />
                <ReviewItem label="Booking Type" value={transactionMode ? 'Multi-room booking' : 'Single booking'} />
                <ReviewItem label="Guest" value={form.full_name || '-'} />
                <ReviewItem label="Stay" value={`${form.check_in || '-'} to ${form.check_out || '-'}`} />
                <ReviewItem label="Pax / Capacity" value={`${form.guests || 0} / ${capacity || 0}`} />
                <ReviewItem label="Gross" value={money(grossTotal)} />
                <ReviewItem label="Balance" value={money(balance)} tone={balance > 0 ? 'danger' : 'success'} />
            </div>
                </CardContent>
            </Card>
        </aside>
    );
}

function ReviewSection({ title, children }) {
    return (
        <section className="grid gap-3 rounded-2xl border border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] p-4">
            <div className="text-[0.58rem] font-black uppercase tracking-[0.1em] text-muted-foreground">{title}</div>
            <div className="grid gap-2.5">{children}</div>
        </section>
    );
}

function toneTextClass(tone) {
    if (tone === 'success') return 'text-primary';
    if (tone === 'danger') return 'text-red-700';
    if (tone === 'warning') return 'text-amber-800';
    return 'text-foreground';
}

function ReviewLine({ label, value, tone = 'neutral' }) {
    return (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 text-xs">
            <span className="font-bold text-muted-foreground">{label}</span>
            <span className={cn('[overflow-wrap:anywhere] font-black leading-snug', toneTextClass(tone))}>{value || '-'}</span>
        </div>
    );
}

function ReviewMoneyLine({ label, value, tone = 'neutral', strong = false }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-3 text-xs', strong && 'border-t border-primary/20 pt-3 text-sm')}>
            <span className="font-bold text-muted-foreground">{label}</span>
            <span className={cn('whitespace-nowrap font-black', toneTextClass(tone))}>{value}</span>
        </div>
    );
}

function ReviewNote({ label, value }) {
    return (
        <div>
            <div className="mb-1 text-[0.56rem] font-black uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
            <div className="[overflow-wrap:anywhere] text-xs font-bold leading-snug text-foreground">{value}</div>
        </div>
    );
}

function ReviewItem({ label, value, tone = 'neutral' }) {
    return (
        <div className="rounded-xl border border-[#d8c9b3]/60 bg-[#f7eedf]/42 px-3 py-2.5">
            <div className="text-[0.56rem] font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
            <div className={cn('mt-1 [overflow-wrap:anywhere] text-sm font-black', toneTextClass(tone))}>{value || '-'}</div>
        </div>
    );
}
