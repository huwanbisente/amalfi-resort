import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, addDays, differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { Home, Globe, Activity, PlusCircle, ChevronDown, Smartphone, Package } from 'lucide-react';
import { api } from '../utils/api';
import { getManilaTodayKey } from '../utils/manilaDate';
import { allocateGuestsAcrossUnits, calculatePrice, getUnitAbsolutePax, getUnitCapacitySummary } from '../utils/bookingLogic';
import {
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
    fieldLabelClass,
    inputClass,
    moneyInputClass,
    selectClass,
    tallTextareaClass,
    twoColClass,
} from '@/components/shared/formStyles';
import { cn } from '@/lib/utils';

const safeFmt = (str, fmtStr = 'MMM dd') => {
    if (!str) return '-';
    try {
        const d = parseISO(str);
        if (!isValid(d)) return '-';
        return format(d, fmtStr);
    } catch { return '-'; }
};

const Divider = () => <div className="my-4 border-t border-[#d8c9b3]/70" />;
const textareaClass = tallTextareaClass;
const EDIT_TAB_OPTIONS = [
    { key: 'details', label: 'Stay & Units' },
    { key: 'charges', label: 'Add-ons' },
    { key: 'payments', label: 'Payments' },
    { key: 'extension', label: 'Extension' },
    { key: 'checkout', label: 'Checkout' },
    { key: 'overview', label: 'Summary' },
];
const CREATE_TAB_OPTIONS = [
    { key: 'stay', label: 'Stay & Units' },
    { key: 'guest', label: 'Guest Details' },
    { key: 'review', label: 'Payment' },
];
const bookingTabListClass = 'h-auto gap-1 rounded-2xl border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_8px_16px_rgba(19,33,31,0.035)]';
const bookingTabTriggerClass = 'group min-h-8 rounded-xl border border-[#d8c9b3]/80 bg-[#fffdf8]/78 px-3 text-[0.72rem] font-black text-[#5f6d66] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[#c6923f]/70 hover:bg-[#fff7e6] hover:text-[#70480f] data-[state=active]:border-[#0a6b5f] data-[state=active]:bg-[linear-gradient(180deg,#0d766a_0%,#075f55_100%)] data-[state=active]:text-[#fffdf8] data-[state=active]:shadow-[0_8px_18px_rgba(10,107,95,0.18),inset_0_1px_0_rgba(255,255,255,0.22)] disabled:cursor-not-allowed disabled:opacity-45';
const unitPickerShellClass = 'max-h-[260px] overflow-y-auto rounded-2xl border border-[#c8ae7c]/70 bg-[#fffdf8]/96 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),inset_0_0_0_1px_rgba(255,246,220,0.42),0_14px_28px_rgba(51,34,15,0.06)]';
const unitPickerGridClass = 'grid gap-2 md:grid-cols-2';
const unitOptionCardClass = 'grid grid-cols-[18px_minmax(0,1fr)_minmax(74px,auto)] items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[0.72rem] font-bold transition';
const unitMetaPillClass = 'justify-self-end rounded-full border px-2 py-1 text-[0.58rem] font-black uppercase tracking-normal';

const ROOM_FAMILY_OPTIONS = ['Kubos', 'Teepee', 'Villas'];

function getRoomFamily(roomType = '') {
    const value = String(roomType || '').toLowerCase();
    if (value.includes('kubo')) return 'Kubos';
    if (value.includes('teepee')) return 'Teepee';
    if (value.includes('villa')) return 'Villas';
    return '';
}

function normalizeIntegerInput(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    return String(Number(digits));
}

function normalizeMoneyInput(value) {
    const cleaned = String(value ?? '').replace(/[^\d.]/g, '');
    const [whole = '', ...decimalParts] = cleaned.split('.');
    const normalizedWhole = whole ? String(Number(whole)) : '';
    const decimal = decimalParts.join('').slice(0, 2);
    if (!normalizedWhole && decimal) return `0.${decimal}`;
    if (!normalizedWhole) return '';
    return decimalParts.length ? `${normalizedWhole}.${decimal}` : normalizedWhole;
}

function getUnitCapacity(unitRow, fallback = 0) {
    return getUnitAbsolutePax(unitRow, fallback);
}

function getUnitCapacityLabel(unitRow, fallback = 0) {
    return getUnitCapacitySummary(unitRow, fallback).label;
}

function calculateSharedBookingTotal({ units = [], guests = 0, checkIn, checkOut, isDayTour = false, fallbackPax = 0 }) {
    if (!Array.isArray(units) || units.length === 0) {
        return { total_price: 0, max_allowed_pax: 0 };
    }

    let remainingGuests = Math.max(Number(guests || 0), 0);

    const totals = units.reduce((acc, unitRow, index) => {
        const unitCapacity = Math.max(getUnitCapacity(unitRow, fallbackPax), 1);
        const remainingUnits = units.length - index;
        const minimumGuestsHere = remainingGuests > 0 ? Math.max(1, Math.ceil(remainingGuests / remainingUnits)) : 1;
        const allocatedGuests = Math.min(unitCapacity, minimumGuestsHere);
        const pricing = calculatePrice({
            unit: unitRow,
            checkIn,
            checkOut,
            guests: allocatedGuests,
            isDayTour,
        });

        remainingGuests = Math.max(0, remainingGuests - allocatedGuests);

        return {
            total_price: acc.total_price + Number(pricing.total_price || 0),
            max_allowed_pax: acc.max_allowed_pax + unitCapacity,
        };
    }, { total_price: 0, max_allowed_pax: 0 });

    return totals;
}

function applyDiscountToCalculatedTotal(calculatedTotal, discountAmount) {
    const calculated = Math.max(0, Number(calculatedTotal || 0));
    const discount = Math.min(calculated, Math.max(0, Number(discountAmount || 0)));
    return Number((calculated - discount).toFixed(2));
}

function discountAmountFromPercent(calculatedTotal, percent) {
    const calculated = Math.max(0, Number(calculatedTotal || 0));
    const normalizedPercent = Math.min(100, Math.max(0, Number(percent || 0)));
    return Number(((calculated * normalizedPercent) / 100).toFixed(2));
}

export function AdminBookingModal({ 
    mode = 'add', 
    initialData = null, 
    initialTab = null,
    prefillRemainingPayment = false,
    onSaved, 
    onSync = () => {},
    onClose, 
    onDelete,
    unit = null, 
    defaultCheckIn = null,
    defaultCheckOut = null,
    existingBookings = [],
    units = [] 
}) {
    const today = getManilaTodayKey();
    const isEdit = mode === 'edit';
    const isTransactionEdit = isEdit && ['transaction_item', 'transaction_header'].includes(initialData?.record_origin);
    const normalizedInitialTab = isEdit && initialTab === 'units' ? 'details' : initialTab;
    const [activeTab, setActiveTab] = useState(isEdit ? (normalizedInitialTab || 'details') : 'stay');
    const [checkoutStep, setCheckoutStep] = useState(1); // 1: Initial, 2: Confirming
    const [customChargeName, setCustomChargeName] = useState('');
    const [customChargeAmount, setCustomChargeAmount] = useState('');
    
    // Resolve underlying unit/type info
    const effectiveUnit = isEdit ? { unit_id: initialData?.unit_id, room_type_id: initialData?.room_type } : unit;
    const isDayTour = (effectiveUnit?.room_type_id === 'day_tour' || initialData?.booking_type === 'day_tour');

    const [form, setForm] = useState({
        booking_ref:      '',
        full_name:        '',
        email:            '',
        phone:            '',
        guests:           isDayTour ? '1' : '2',
        check_in:         defaultCheckIn || initialData?.check_in || today,
        check_out:        isDayTour ? (defaultCheckIn || initialData?.check_in || today) : (defaultCheckOut || initialData?.check_out || today),
        booking_source:   initialData?.booking_source || 'Direct',
        status:           initialData?.status || 'RESERVED',
        notes:            '',
        special_requests: '',
        unit_id:          unit?.unit_id || '',
        room_type:        unit?.room_type_id || '',
        max_allowed_pax:  20, // Safe default to prevent null-validation lock
        total_price:      0,
        amount_paid:      0,
        initial_payment:  0, // Quick Entry: Settlement during registration
        addon_amount:     0,
        group_code:       '',
        group_name:       '',
        group_master_ref: '',
        group_sequence:   '',
    });

    const [conflict, setConflict] = useState(null);
    const [saving, setSaving]   = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSynced, setLastSynced]         = useState(false);
    const [deleting, setDeleting]             = useState(false);

    const handleDelete = async () => {
        if (!window.confirm(`Danger: You are about to permanently remove booking ${initialData.booking_ref} (${form.full_name}).\n\nThis will also purge all associated financial transactions from the ledger. This action is irreversible.\n\nAre you absolutely sure?`)) return;

        setDeleting(true);
        setError('');

        try {
            const data = await api.delete(`/api/v1/admin/bookings/${initialData.booking_ref}`);
            if (data) {
                setLastSynced(true);
                setTimeout(() => {
                    onSaved();
                    onClose();
                }, 1000);
            }
        } catch (err) {
            setError('Connection failure. Check sanctuary uplink.');
        } finally {
            setDeleting(false);
        }
    };

    const [error,  setError]    = useState('');
    const [isAutoPrice, setIsAutoPrice] = useState(() => !isEdit);
    const [reconciliation, setReconciliation] = useState(null);
    const [loadingRecon, setLoadingRecon] = useState(false);
    const [assignLater, setAssignLater] = useState(() => isEdit ? !unit?.unit_id : false);
    const [useTransactionBooking, setUseTransactionBooking] = useState(() => !isEdit && !unit && !isDayTour);
    const [selectedUnitIds, setSelectedUnitIds] = useState(() => unit?.unit_id ? [unit.unit_id] : []);
    const [selectedRoomFamily, setSelectedRoomFamily] = useState(() => getRoomFamily(unit?.room_type || unit?.room_type_id || ''));
    const [availabilityConflicts, setAvailabilityConflicts] = useState({});
    const [transactionDetails, setTransactionDetails] = useState(null);
    const [loadingTransactionDetails, setLoadingTransactionDetails] = useState(false);
    const [itemDrafts, setItemDrafts] = useState({});
    const [newTransactionUnitId, setNewTransactionUnitId] = useState('');
    const [editingSections, setEditingSections] = useState(() => (isEdit && normalizedInitialTab ? { [normalizedInitialTab]: true } : {}));
    const priceDirty            = useRef(false);
    const isTransactionMode = useTransactionBooking && !isEdit && !unit && !isDayTour;
    const isTransactionBookingMode = isTransactionMode || isTransactionEdit;
    const visibleTabOptions = isEdit ? EDIT_TAB_OPTIONS : CREATE_TAB_OPTIONS;
    // Reference ID Generator (Aligns with server.js)
    const generateRef = () => {
        const prefixMap = { 'Amalfi Suite': 'AMS', 'Positano Vista': 'POS', 'Ravello Suite': 'RAV', 'Capri Vista': 'CAP', 'Sirenuse Suite': 'SIR', 'Sunset Pavilion': 'SUN' };
        const u = units.find(ux => ux.unit_id === (form.unit_id || unit?.unit_id)) || unit;
        let prefix = prefixMap[u?.room_type] || prefixMap[u?.room_type_id] || 'AML';
        const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
        setForm(f => ({ ...f, booking_ref: `${prefix}-B${rand}` }));
    };

    // Sync form with initialData (edit) or unit prop (add)
    useEffect(() => {
        if (isEdit && initialData) {
            setForm({
                ...initialData,
                full_name:      initialData.full_name || initialData.guest_name || '',
                check_in:       String(initialData.check_in || '').split('T')[0] || today,
                check_out:      String(initialData.check_out || '').split('T')[0] || today,
                guests:         Number(initialData.guests || initialData.pax || 1),
                room_type:      initialData.room_type || initialData.room_type_id || '',
                max_allowed_pax: Number(initialData.max_allowed_pax) || 20,
                group_code:     initialData.group_code || '',
                group_name:     initialData.group_name || '',
                group_master_ref: initialData.group_master_ref || '',
                group_sequence: initialData.group_sequence ?? '',
            });
            setAssignLater(!initialData?.unit_id);
            setSelectedUnitIds(initialData?.unit_id ? [initialData.unit_id] : []);
            setSelectedRoomFamily(getRoomFamily(initialData.room_type || initialData.room_type_id || ''));
            setUseTransactionBooking(isTransactionEdit);
            setIsAutoPrice(false); // Disable auto-calc for existing bookings unless toggled
        } else if (!isEdit && unit) {
            // New entry from map: sync unit info
            setForm(f => {
                const updated = { 
                    ...f, 
                    unit_id: unit.unit_id, 
                    room_type: unit.room_type || unit.room_type_id,
                    booking_source: 'Walk-in', // Default for map-based additions
                    booking_type: (unit.room_type_id === 'day_tour') ? 'day_tour' : 'overnight'
                };
                return updated;
            });
            // Auto-generate Ref Code immediately
            setSelectedUnitIds(unit?.unit_id ? [unit.unit_id] : []);
            setSelectedRoomFamily(getRoomFamily(unit.room_type || unit.room_type_id || ''));
            setUseTransactionBooking(false);
            generateRef();
        }
    }, [isEdit, initialData, unit, today, isTransactionEdit]);

    useEffect(() => {
        if (!isEdit && assignLater) {
            setAssignLater(false);
        }
    }, [assignLater, isEdit]);

    useEffect(() => {
        if (!form.check_in || !form.check_out || form.check_out <= form.check_in) {
            setAvailabilityConflicts({});
            return;
        }

        let active = true;
        api.post('/api/v1/admin/booking-options', {
            check_in: form.check_in,
            check_out: form.check_out,
            guests: Number(form.guests || 1)
        })
            .then((payload) => {
                if (!active) return;
                const conflicts = {};
                (payload.unavailable_units || []).forEach((unitRow) => {
                    if (!unitRow.unit_id || !unitRow.blocked_booking) return;
                    if (isEdit && unitRow.blocked_booking.booking_ref === initialData?.booking_ref) return;
                    conflicts[unitRow.unit_id] = unitRow.blocked_booking;
                });
                setAvailabilityConflicts(conflicts);
            })
            .catch(() => {
                if (active) setAvailabilityConflicts({});
            });

        return () => {
            active = false;
        };
    }, [form.check_in, form.check_out, form.guests, isEdit, initialData?.booking_ref]);

    useEffect(() => {
        if (!isTransactionEdit || !initialData?.booking_ref) {
            setTransactionDetails(null);
            setLoadingTransactionDetails(false);
            return;
        }

        let active = true;
        setLoadingTransactionDetails(true);

        api.get(`/api/v1/admin/booking-headers/${initialData.booking_ref}`)
            .then((data) => {
                if (!active || !data?.header) return;

                const header = data.header;
                const items = Array.isArray(data.items) ? data.items : [];
                const distinctRoomTypes = [...new Set(items.map((item) => item.room_type).filter(Boolean))];
                const resolvedRoomType = distinctRoomTypes.length === 1 ? distinctRoomTypes[0] : (header.room_type || initialData.room_type || '');
                const resolvedGuests = items.reduce((sum, item) => sum + Number(item.guest_count ?? item.guests ?? 0), 0) || Number(initialData.guests || initialData.pax || 1);
                const linkedUnitIds = items.map((item) => item.unit_id).filter(Boolean);
                const linkedAssigned = linkedUnitIds.length > 0;

                setTransactionDetails(data);
                setItemDrafts(Object.fromEntries(items.map((item) => [item.booking_item_id, {
                    unit_id: item.unit_id || '',
                    room_type: item.room_type || '',
                    status: item.status || 'PENDING_VERIFICATION'
                }])));
                setAssignLater(!linkedAssigned);
                setSelectedUnitIds(linkedUnitIds);
                setSelectedRoomFamily(getRoomFamily(resolvedRoomType));
                setUseTransactionBooking(true);
                setForm((current) => ({
                    ...current,
                    booking_ref: header.booking_reference || initialData.booking_ref || current.booking_ref,
                    full_name: header.guest_name || initialData.full_name || initialData.guest_name || current.full_name,
                    email: header.email || current.email || '',
                    phone: header.phone || current.phone || '',
                    check_in: String(header.check_in || current.check_in || today).split('T')[0],
                    check_out: String(header.check_out || current.check_out || today).split('T')[0],
                    guests: resolvedGuests,
                    room_type: resolvedRoomType,
                    unit_id: linkedUnitIds.length === 1 ? linkedUnitIds[0] : '',
                    total_price: Number(header.lodging_total ?? 0),
                    amount_paid: Number(header.verified_paid_total ?? 0),
                    status: header.status || current.status || 'RESERVED',
                    booking_source: header.booking_source || current.booking_source || 'Direct',
                    notes: header.notes || current.notes || '',
                    special_requests: header.special_requests || current.special_requests || '',
                    initial_payment: 0,
                    new_payment: '',
                }));
            })
            .catch((err) => {
                if (!active) return;
                console.error('Failed to load transaction booking details:', err);
                setError(err?.message || 'Failed to load transaction booking details.');
            })
            .finally(() => {
                if (!active) return;
                setLoadingTransactionDetails(false);
            });

        return () => {
            active = false;
        };
    }, [isTransactionEdit, initialData?.booking_ref, today]);

    // Reset checkout step when switching tabs
    useEffect(() => {
        setCheckoutStep(1);
    }, [activeTab]);

    const roomTypeOptions = useMemo(() => {
        const seen = new Set();
        (units || []).forEach((currentUnit) => {
            const value = getRoomFamily(currentUnit.room_type || currentUnit.room_type_id);
            if (value) seen.add(value);
        });
        return ROOM_FAMILY_OPTIONS.filter((option) => seen.has(option));
    }, [units]);
    const roomTypeUnits = useMemo(
        () => (units || []).filter((candidate) => !selectedRoomFamily || getRoomFamily(candidate.room_type || candidate.room_type_id) === selectedRoomFamily),
        [units, selectedRoomFamily]
    );
    const transactionSelectedUnits = useMemo(
        () => (units || []).filter((candidate) => selectedUnitIds.includes(candidate.unit_id)),
        [units, selectedUnitIds]
    );
    const transactionDraftUnits = useMemo(() => {
        if (!isTransactionEdit) return [];
        const items = Array.isArray(transactionDetails?.items) ? transactionDetails.items : [];
        return items
            .map((item) => {
                const draft = itemDrafts[item.booking_item_id] || {};
                const draftUnitId = draft.unit_id !== undefined ? draft.unit_id : item.unit_id;
                return (units || []).find((candidate) => String(candidate.unit_id) === String(draftUnitId || ''));
            })
            .filter(Boolean);
    }, [isTransactionEdit, itemDrafts, transactionDetails, units]);

    useEffect(() => {
        if (!(isTransactionMode || isTransactionEdit)) return;
        if (selectedRoomFamily || !roomTypeOptions.length) return;
        setForm((current) => ({ ...current, room_type: current.room_type || roomTypeOptions[0] }));
    }, [isTransactionMode, isTransactionEdit, roomTypeOptions, selectedRoomFamily]);
    // Smart Pricing Engine (Sync with BookingModal.jsx)
    useEffect(() => {
        if (isTransactionMode) {
            if (!isAutoPrice) {
                if (transactionSelectedUnits.length > 0) {
                    setForm((f) => ({
                        ...f,
                        max_allowed_pax: transactionSelectedUnits.reduce((sum, unitRow) => sum + getUnitCapacity(unitRow, f.max_allowed_pax), 0),
                    }));
                }
                return;
            }

            if (transactionSelectedUnits.length === 0) {
                setForm((f) => ({ ...f, total_price: 0, max_allowed_pax: 20 }));
                return;
            }

            const sharedPricing = calculateSharedBookingTotal({
                units: transactionSelectedUnits,
                guests: form.guests,
                checkIn: form.check_in,
                checkOut: form.check_out,
                isDayTour,
                fallbackPax: form.max_allowed_pax,
            });

            setForm((f) => ({
                ...f,
                total_price: Number(sharedPricing.total_price || 0),
                max_allowed_pax: Number(sharedPricing.max_allowed_pax || f.max_allowed_pax || 20),
                room_type: f.room_type || transactionSelectedUnits[0]?.room_type || transactionSelectedUnits[0]?.room_type_id || '',
            }));
            return;
        }

        const u = units.find(ux => ux.unit_id === (form.unit_id || unit?.unit_id)) || unit;
        
        // TIERED PRICING: Calculate Final Guest Cap Rule (Admin Backstop)
        const extraPax = u?.extra_pax;
        const rates = u?.rates || [];

        const ratesBaseMax = rates.length
            ? Math.max(...rates.map(r => r.max_pax || 0))
            : 0;
        const baseMax = ratesBaseMax || Number(u?.max_capacity_pax || (isDayTour ? 50 : 2));
        
        const absMax = Number(extraPax?.allowed 
            ? (extraPax.max_capacity_pax || baseMax) 
            : (u?.max_capacity_pax || baseMax)) || baseMax || 20;

        if (!isAutoPrice) {
            setForm(f => ({ ...f, max_allowed_pax: absMax, room_type: f.room_type || u?.room_type_id || '' }));
            return;
        }
        
        if (!u) {
            setForm(f => ({ ...f, max_allowed_pax: absMax }));
            return;
        }
        
        // Safety: Ensure dates are valid before calculating nights
        const checkIn = form.check_in ? parseISO(form.check_in) : null;
        const checkOut = form.check_out ? parseISO(form.check_out) : null;
        const nights = (checkIn && checkOut && isValid(checkIn) && isValid(checkOut)) ? Math.max(1, differenceInCalendarDays(checkOut, checkIn)) : 1;

        const absMaxPerUnit = Number(extraPax?.allowed 
            ? (extraPax.max_capacity_pax || baseMax) 
            : (u?.max_capacity_pax || baseMax)) || 2;

        if (!rates.length) {
            const fallbackRate = u?.nightly_rate || 2000;
            const calculatedTotal = fallbackRate * (isDayTour ? 1 : nights);
            setForm(f => ({ 
                ...f, 
                total_price: calculatedTotal,
                max_allowed_pax: absMaxPerUnit 
            }));
            return;
        }

        // Tiered Pricing Logic
        const sortedRates = [...rates].sort((a, b) => (b.max_pax || 0) - (a.max_pax || 0));
        
        const getRateForPax = (p) => {
            const matched = rates.find(r => p >= r.min_pax && p <= r.max_pax);
            if (matched) return matched.price_php;
            const sorted = [...rates].sort((a,b) => a.min_pax - b.min_pax);
            if (p < sorted[0].min_pax) return sorted[0].price_php;
            return sortedRates[0].price_php;
        };

        let perNight = 0;
        if (form.guests <= baseMax) {
            perNight = getRateForPax(form.guests);
        } else if (extraPax?.allowed) {
            perNight = sortedRates[0].price_php + (form.guests - baseMax) * (extraPax.price_per_head_php || 0);
        } else {
            perNight = sortedRates[0].price_php; // Hard Clamp
        }

        const calculatedTotal = perNight * Math.max(nights, 1);
        
        // In admin modal, we auto-update unless priceDirty is true.
        if (calculatedTotal > 0 || !isEdit) {
            setForm(f => ({ 
                ...f, 
                total_price: calculatedTotal,
                max_allowed_pax: absMax // Store limit in form for UI validation
            }));
        }
    }, [form.check_in, form.check_out, form.guests, form.unit_id, units, unit, isDayTour, isEdit, isAutoPrice, isTransactionMode, transactionSelectedUnits]);

    useEffect(() => {
        if (!form.check_in || !form.check_out || assignLater || (!form.unit_id && !unit?.unit_id)) {
            setConflict(null);
            return;
        }

        const found = (existingBookings || []).find(b => {
            // Rule 1: Ignore self (if editing)
            if (isEdit && b.booking_ref === initialData?.booking_ref) return false;
            // Rule 2: Must be the same unit
            if (b.unit_id !== (form.unit_id || unit?.unit_id)) return false;
            // Rule 3: Ignore cancelled bookings
            if (b.status === 'CANCELLED') return false;
            
            const startA = parseISO(form.check_in);
            const endA   = parseISO(form.check_out);
            const startB = parseISO(b.check_in);
            const endB   = parseISO(b.check_out);
            
            // Standard Overlap Logic: (startA < endB && endA > startB)
            return (isValid(startA) && isValid(endA) && isValid(startB) && isValid(endB)) 
                ? (startA < endB && endA > startB) 
                : false;
        });

        setConflict(found || null);
    }, [form.check_in, form.check_out, form.unit_id, existingBookings, unit, isEdit, initialData, assignLater]);

    const handleSubmit = async (e, shouldClose = false) => {
        if (e && e.preventDefault) e.preventDefault();
        
        setSaving(true);
        setError('');

        if (isTransactionEdit) {
            const normalizedGroupSequence = form.group_sequence === '' ? null : Number(form.group_sequence);
            const newPaymentValue = Number(form.new_payment || 0);

            if (!form.check_in || !form.check_out) {
                setError('Stay dates are required.');
                setSaving(false);
                return;
            }

            if (normalizedGroupSequence !== null && (!Number.isInteger(normalizedGroupSequence) || normalizedGroupSequence <= 0)) {
                setError('Group lane number must be a whole number greater than zero.');
                setSaving(false);
                return;
            }

            try {
                await api.post(`/api/v1/admin/bookings/${initialData.booking_ref}/change-set`, {
                    workflow: 'edit',
                    booking: {
                        guest_name: form.full_name,
                        email: form.email,
                        phone: form.phone,
                        check_in: form.check_in,
                        check_out: form.check_out,
                        status: form.status,
                        booking_source: form.booking_source,
                        notes: form.notes,
                        special_requests: form.special_requests,
                        lodging_total: grossTotal,
                        items: (Array.isArray(transactionDetails?.items) ? transactionDetails.items : []).map((item) => {
                            const draft = itemDrafts[item.booking_item_id] || {};
                            const selectedUnitRow = (units || []).find((unitRow) => String(unitRow.unit_id) === String(draft.unit_id || ''));
                            return {
                                booking_item_id: item.booking_item_id,
                                unit_id: draft.unit_id || null,
                                room_type: selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || draft.room_type || item.room_type,
                                status: draft.status || item.status || 'RESERVED',
                                guest_count: Number(draft.guest_count ?? item.guest_count ?? 0),
                                lodging_subtotal: Number(draft.lodging_subtotal ?? item.lodging_subtotal ?? 0)
                            };
                        })
                    },
                    payment: newPaymentValue > 0 ? {
                        amount: newPaymentValue,
                        payment_type: newPaymentValue >= currentBalance && grossTotal > 0 ? 'Full Settlement' : 'payment',
                        transaction_type: newPaymentValue >= currentBalance && grossTotal > 0 ? 'Full Settlement' : 'payment',
                        payment_method: form.payment_method || 'Cash',
                        verification_status: 'VERIFIED',
                        notes: 'Recorded via Booking Workspace'
                    } : null,
                    admin_id: 'Vincent-Admin'
                });

                const refreshed = await api.get(`/api/v1/admin/booking-headers/${initialData.booking_ref}`);
                const refreshedHeader = refreshed?.header || {};
                const refreshedItems = Array.isArray(refreshed?.items) ? refreshed.items : [];
                setTransactionDetails(refreshed);
                setSelectedUnitIds(refreshedItems.map((item) => item.unit_id).filter(Boolean));
                setAssignLater(!refreshedItems.some((item) => item.unit_id));
                setForm((current) => ({
                    ...current,
                    total_price: Number(refreshedHeader.lodging_total ?? current.total_price ?? 0),
                    amount_paid: Number(refreshedHeader.verified_paid_total ?? 0),
                    status: refreshedHeader.status || current.status,
                    new_payment: '',
                }));
                await fetchReconciliation();

                setLastSynced(true);
                setTimeout(() => setLastSynced(false), 3000);

                if (shouldClose) {
                    onSaved();
                } else {
                    Promise.resolve(onSync()).catch(err => console.error('Silent sync refresh failed:', err));
                }
                setSaving(false);
                return;
            } catch (err) {
                console.error('Transaction booking update failed:', err);
                setError(err?.message || 'Transaction booking update failed.');
                setSaving(false);
                return;
            }
        }

        if (isTransactionMode) {
            const normalizedGroupCode = String(form.group_code || '').trim().toUpperCase();
            const normalizedGroupName = String(form.group_name || '').trim();
            const normalizedGroupMasterRef = String(form.group_master_ref || '').trim().toUpperCase();
            const normalizedGroupSequence = form.group_sequence === '' ? null : Number(form.group_sequence);
            const selectedTransactionUnits = transactionSelectedUnits;

            if (!form.check_in || !form.check_out) {
                setError('Stay dates are required.');
                setSaving(false);
                return;
            }

            if (selectedTransactionUnits.length === 0) {
                setError('Select at least one actual unit for this multi-booking.');
                setSaving(false);
                return;
            }

            if (effectiveMaxAllowedPax && Number(form.guests) > effectiveMaxAllowedPax) {
                const shortfall = Number(form.guests) - effectiveMaxAllowedPax;
                setError(`Select more units to cover the booking. Need ${shortfall} more pax capacity.`);
                setSaving(false);
                return;
            }

            if (normalizedGroupSequence !== null && (!Number.isInteger(normalizedGroupSequence) || normalizedGroupSequence <= 0)) {
                setError('Group lane number must be a whole number greater than zero.');
                setSaving(false);
                return;
            }

            const conflictingSelection = selectedTransactionUnits.find((candidate) => unitConflictMap.has(candidate.unit_id));
            if (conflictingSelection) {
                const existing = unitConflictMap.get(conflictingSelection.unit_id);
                setError(`Date Conflict: ${conflictingSelection.unit_label || conflictingSelection.unit_id} is already blocked for ${existing.full_name || existing.guest_name || existing.booking_ref}.`);
                setSaving(false);
                return;
            }

            try {
                const totalUnits = Math.max(selectedTransactionUnits.length, 1);
                const guestAllocations = allocateGuestsAcrossUnits({
                    units: selectedTransactionUnits,
                    guests: Number(form.guests || 1),
                    fallbackPax: Number(form.max_allowed_pax || 1)
                });
                const guestName = String(form.full_name || '').trim() || 'Walk-in Guest';
                const grossAmount = Number(form.total_price || 0) + Number(form.addon_amount || 0);
                const baseSubtotal = totalUnits > 0 ? Math.floor((Number(form.total_price || 0) / totalUnits) * 100) / 100 : Number(form.total_price || 0);
                const items = selectedTransactionUnits.map((unitRow, index) => ({
                        unit_id: unitRow.unit_id,
                        room_type: unitRow.room_type || unitRow.room_type_id || form.room_type,
                        check_in: form.check_in,
                        check_out: form.check_out,
                        guest_count: guestAllocations[index] || 1,
                        lodging_subtotal: index === selectedTransactionUnits.length - 1
                            ? Number(form.total_price || 0) - (baseSubtotal * index)
                            : baseSubtotal,
                        status: form.status === 'CHECKED_IN' ? 'CHECKED_IN' : 'RESERVED'
                    }));

                const createPayload = {
                    admin_id: 'Vincent-Admin',
                    header: {
                        booking_reference: form.booking_ref || undefined,
                        guest_name: guestName,
                        email: form.email,
                        phone: form.phone,
                        check_in: form.check_in,
                        check_out: form.check_out,
                        lodging_total: grossAmount,
                        status: form.status || 'RESERVED',
                        booking_source: form.booking_source || 'Walk-in',
                        booking_mode: selectedTransactionUnits.length > 1 ? 'TRANSACTION_GROUP' : 'STANDARD',
                        notes: form.notes || '',
                        special_requests: form.special_requests || '',
                        created_by: 'admin'
                    },
                    items
                };

                const created = await api.post('/api/v1/admin/booking-headers', createPayload);
                const createdRef = created?.header?.booking_reference;

                if (createdRef && Number(form.initial_payment || 0) > 0) {
                    await api.post(`/api/v1/admin/booking-headers/${createdRef}/payments`, {
                        amount: Number(form.initial_payment || 0),
                        payment_type: Number(form.initial_payment || 0) >= grossAmount && grossAmount > 0 ? 'Full Payment' : 'deposit',
                        payment_method: form.payment_method || 'Admin Entry',
                        verification_status: 'VERIFIED',
                        notes: 'Recorded during transaction booking creation',
                        admin_id: 'Vincent-Admin'
                    });
                }

                setForm((current) => ({
                    ...current,
                    booking_ref: createdRef || current.booking_ref
                }));
                setLastSynced(true);
                setTimeout(() => setLastSynced(false), 3000);

                if (shouldClose) {
                    onSaved();
                } else {
                    Promise.resolve(onSync()).catch(err => console.error('Silent sync refresh failed:', err));
                }
                setSaving(false);
                return;
            } catch (err) {
                console.error('Transaction booking save failed:', err);
                setError(err?.message || 'Transaction booking creation failed.');
                setSaving(false);
                return;
            }
        }

        const resolvedUnitId = form.unit_id || unit?.unit_id || '';
        const normalizedGroupCode = String(form.group_code || '').trim().toUpperCase();
        const normalizedGroupName = String(form.group_name || '').trim();
        const normalizedGroupMasterRef = String(form.group_master_ref || '').trim().toUpperCase();
        const normalizedGroupSequence = form.group_sequence === '' ? null : Number(form.group_sequence);

        if (!resolvedUnitId) {
            setError('Please select the actual room/unit for this booking.');
            setSaving(false);
            return;
        }

        if (normalizedGroupSequence !== null && (!Number.isInteger(normalizedGroupSequence) || normalizedGroupSequence <= 0)) {
            setError('Group lane number must be a whole number greater than zero.');
            setSaving(false);
            return;
        }
        // Double-Layer Capacity Guard (bypassed in freeform mode)
        if (isAutoPrice && resolvedUnitId) {
            const paxLimit = Number(effectiveMaxAllowedPax) || 20;
            const uLabel = units.find(ux => ux.unit_id === resolvedUnitId)?.unit_label || '';

            if (Number(form.guests) > paxLimit) {
                const shortfall = Number(form.guests) - paxLimit;
                setError(`Selected unit is short by ${shortfall} pax. Choose a larger unit or reduce the guest count.`);
                setSaving(false);
                return;
            }
        }

        // Hard Block: Date Conflict (Availability Guard)
        const conflict = existingBookings.find(b => {
            if (isEdit && b.booking_ref === initialData.booking_ref) return false;
            if (b.unit_id !== resolvedUnitId) return false;
            if (b.status === 'CANCELLED') return false;
            
            const startA = parseISO(form.check_in);
            const endA   = parseISO(form.check_out);
            const startB = parseISO(b.check_in);
            const endB   = parseISO(b.check_out);
            
            return (startA < endB && endA > startB);
        });

        if (conflict) {
            setError(`Date Conflict: The unit is already blocked for ${conflict.full_name} from ${safeFmt(conflict.check_in)} to ${safeFmt(conflict.check_out)}.`);
            setSaving(false);
            return;
        }

        try {
            const url = isEdit ? `/api/v1/admin/bookings/${initialData.booking_ref}` : '/api/v1/admin/bookings/manual';
            const method = isEdit ? 'PATCH' : 'POST';
            const newPaymentValue = Number(form.new_payment || 0);
            
            const resolvedUnit = units.find(ux => ux.unit_id === resolvedUnitId) || unit;
            
            const payload = {
                ...form,
                room_type: form.room_type || resolvedUnit?.room_type_id || '',
                amount_paid: isEdit ? form.amount_paid : (Number(form.amount_paid) + Number(form.initial_payment || 0)),
                admin_id: 'Vincent-Admin',
                full_name: String(form.full_name || '').trim() || 'Walk-in Guest',
                guest_name: String(form.full_name || '').trim() || 'Walk-in Guest',
                unit_id: resolvedUnitId || null,
                group_code: normalizedGroupCode || null,
                group_name: normalizedGroupName || null,
                group_master_ref: normalizedGroupMasterRef || null,
                group_sequence: normalizedGroupSequence
            };

            if (isEdit && newPaymentValue > 0) {
                delete payload.new_payment;
            }

            if (!payload.room_type) {
                setError("Internal Error: Could not resolve Room Type for this unit.");
                setSaving(false);
                return;
            }

            const apiCall = method === 'PATCH' ? api.patch : api.post;
            const d = await apiCall(url, payload);

            if (d) {
                // ... logic for releasing unit status ...
                if (form.status === 'CHECKED_OUT') {
                    await api.patch(`/api/v1/admin/units/${payload.unit_id}/status`, { status: 'Available', admin_id: 'Vincent-Admin' }).catch(() => {});
                }

                // Record additional payment from Settlement tab only (Quick Registry sets amount_paid directly via PATCH)
                if (isEdit && newPaymentValue > 0) {
                    const editGrossAmount = Number(form.total_price || 0) + Number(form.addon_amount || 0);
                    const paymentResult = await api.post(`/api/v1/admin/bookings/${initialData.booking_ref}/change-set`, {
                        workflow: 'edit',
                        payment: {
                            amount: newPaymentValue,
                            payment_type: newPaymentValue >= currentBalance && editGrossAmount > 0 ? 'Full Settlement' : 'payment',
                            transaction_type: newPaymentValue >= currentBalance && editGrossAmount > 0 ? 'Full Settlement' : 'payment',
                            payment_method: form.payment_method || 'Cash',
                            verification_status: 'VERIFIED',
                            notes: 'Recorded via Master Hub (Settlement Tab)'
                        },
                        admin_id: 'Vincent-Admin'
                    });
                    setForm(f => ({
                        ...f,
                        amount_paid: Number(paymentResult.amount_paid ?? (Number(f.amount_paid || 0) + newPaymentValue)),
                        new_payment: 0
                    }));
                }

                setLastSynced(true);
                setTimeout(() => setLastSynced(false), 3000);

                if (shouldClose) {
                    onSaved();
                } else {
                    Promise.resolve(onSync()).catch(err => console.error('Silent sync refresh failed:', err));
                }
            } else {
                setError(d.error || 'Server rejected the entry.');
            }
        } catch (err) {
            console.error('Booking save failed:', err);
            setError(err?.message || 'Connection failure. Check if the server is running.');
        } finally {
            setSaving(false);
        }
    };
    // Reconciliation Pulse Logic
    const fetchReconciliation = async () => {
        const ref = initialData?.booking_ref || form.booking_ref;
        if (!ref || !isEdit) return;

        setLoadingRecon(true);
        try {
            const d = await api.get(`/api/v1/admin/bookings/${ref}/reconciliation`);
            if (d) {
                setReconciliation(d);
            }
        } catch (e) {
            console.error("Failed to fetch reconciliation pulse:", e);
        } finally {
            setLoadingRecon(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'overview' && isEdit) {
            fetchReconciliation();
        }
    }, [activeTab, isEdit, initialData?.booking_ref]);

    const handleCheckIn = async () => {
        const ref = initialData?.booking_ref || form.booking_ref;
        if (!ref) {
            setError('Booking reference missing.');
            return;
        }

        setSyncing(true);
        setError('');
        try {
                const url = `/api/v1/admin/bookings/${ref}`;
                const resData = await api.patch(url, {
                    status: 'CHECKED_IN',
                    admin_id: 'Vincent-Admin',
                    unit_id: form.unit_id || initialData?.unit_id
                });

            if (resData) {
                setForm(f => ({ ...f, status: 'CHECKED_IN' }));
                onSync(); // Silent refresh triggered in parent
                // If this unit status is not auto-synced by DB yet, we can do it here too
                if (!isTransactionEdit && (form.unit_id || initialData?.unit_id)) {
                    await api.patch(`/api/v1/admin/units/${form.unit_id || initialData?.unit_id}/status`, { status: 'Checked In', admin_id: 'Vincent-Admin' }).catch(() => {});
                }
                setLastSynced(true);
                setTimeout(() => setLastSynced(false), 3000);
            } else {
                const d = await res.json();
                setError(d.error || 'Check-in failed.');
            }
        } catch {
            setError('Connection failure.');
        } finally {
            setSyncing(false);
        }
    };

    const handleExtend = (n) => {
        if (!form.check_out) return;
        try {
            const currentOut = parseISO(form.check_out);
            if (!isValid(currentOut)) return;
            const newOut = addDays(currentOut, n);
            // Logic Guard: Enable auto-pricing when extending so the bill reflects new nights
            setIsAutoPrice(true);
            
            setForm(f => ({ ...f, check_out: format(newOut, 'yyyy-MM-dd') }));
        } catch (e) {
            console.error("Extension failed:", e);
        }
    };

    const handleCustomCharge = () => {};

    const appendChargeNote = (label, price) => {
        const cleanLabel = String(label || '').trim();
        if (!cleanLabel || !(price > 0)) return;
        setForm(f => ({
            ...f,
            addon_amount: (Number(f.addon_amount) || 0) + price,
            notes: (f.notes || '') + (f.notes ? '\n' : '') + `+ ${cleanLabel} (P${price})`
        }));
    };

    const handlePresetCharge = (value) => {
        if (!value) return;
        const [name, price] = value.split('|');
        const parsedPrice = Number(price);
        if (!name || !(parsedPrice > 0)) return;
        appendChargeNote(name, parsedPrice);
    };

    const handleAddCustomCharge = () => {
        const cleanName = customChargeName.trim();
        const parsedAmount = Number(customChargeAmount);

        if (!cleanName || !(parsedAmount > 0)) {
            setError('Enter a charge name and a valid positive amount.');
            return;
        }

        appendChargeNote(cleanName, parsedAmount);
        setCustomChargeName('');
        setCustomChargeAmount('');
        setError('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (!isEdit && activeTab !== 'review') return;
            handleSubmit(e);
        }
    };

    // Financial calculations for the Sidebar and Tabs
    const initialPaid = Number(form.initial_payment || 0);
    const verifiedPaid = Number(form.amount_paid || 0);
    const pendingNewPay = Number(form.new_payment || 0);
    const masterTotalPaid = initialPaid + verifiedPaid + pendingNewPay;
    const grossTotal = Number(form.total_price || 0) + Number(form.addon_amount || 0);
    const currentBalance = Math.max(0, grossTotal - masterTotalPaid);
    const isFullyCovered = currentBalance <= 0 && grossTotal > 0;
    const calculatedBookingTotal = useMemo(() => {
        const selectedUnitsForPricing = isTransactionEdit ? transactionDraftUnits : transactionSelectedUnits;
        if ((isTransactionMode || isTransactionEdit) && selectedUnitsForPricing.length > 0) {
            return Number(calculateSharedBookingTotal({
                units: selectedUnitsForPricing,
                guests: form.guests,
                checkIn: form.check_in,
                checkOut: form.check_out,
                isDayTour,
                fallbackPax: form.max_allowed_pax,
            }).total_price || 0);
        }

        const selectedUnit = units.find(ux => ux.unit_id === (form.unit_id || unit?.unit_id)) || unit;
        return Number(calculatePrice({
            unit: selectedUnit,
            checkIn: form.check_in,
            checkOut: form.check_out,
            guests: Number(form.guests || 0),
            isDayTour,
        })?.total_price || 0);
    }, [form.check_in, form.check_out, form.guests, form.max_allowed_pax, form.unit_id, isDayTour, isTransactionEdit, isTransactionMode, transactionDraftUnits, transactionSelectedUnits, unit, units]);
    const appliedDiscount = Math.max(0, Number((calculatedBookingTotal - Number(form.total_price || 0)).toFixed(2)));

    const handleFillFullPayment = () => {
        const remaining = Math.max(0, currentBalance);
        setForm(f => ({
            ...f,
            new_payment: remaining > 0 ? String(remaining) : '',
            payment_method: f.payment_method || 'Cash',
        }));
    };

    const handleApplyDiscount = (value) => {
        const normalized = normalizeMoneyInput(value);
        const nextTotal = applyDiscountToCalculatedTotal(calculatedBookingTotal, normalized);
        setIsAutoPrice(false);
        priceDirty.current = true;
        setForm(f => ({
            ...f,
            total_price: nextTotal,
        }));
    };

    const handleApplyDiscountPercent = (percent) => {
        handleApplyDiscount(String(discountAmountFromPercent(calculatedBookingTotal, percent)));
    };

    useEffect(() => {
        if (!isEdit || !prefillRemainingPayment || activeTab !== 'payments') return;
        const remaining = Math.max(0, currentBalance);
        if (remaining <= 0) return;
        setForm(f => {
            if (Number(f.new_payment || 0) > 0) return f;
            return {
                ...f,
                new_payment: String(remaining),
                payment_method: f.payment_method || 'Cash',
            };
        });
    }, [activeTab, currentBalance, isEdit, prefillRemainingPayment]);

    const handleTransactionItemUpdate = async (bookingItemId, overrides = {}) => {
        if (!initialData?.booking_ref) return;

        const draft = { ...(itemDrafts[bookingItemId] || {}), ...overrides };
        const selectedUnitRow = (units || []).find((unitRow) => String(unitRow.unit_id) === String(draft.unit_id || ''));
        setSyncing(true);
        setError('');

        try {
            const updated = await api.post(`/api/v1/admin/bookings/${initialData.booking_ref}/change-set`, {
                workflow: 'edit',
                booking: {
                    items: [{
                        booking_item_id: bookingItemId,
                        unit_id: draft.unit_id || null,
                        room_type: selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || draft.room_type || undefined,
                        status: draft.status || 'PENDING_VERIFICATION'
                    }]
                },
                admin_id: 'Vincent-Admin'
            });

            const refreshed = await api.get(`/api/v1/admin/booking-headers/${initialData.booking_ref}`);
            const refreshedItems = Array.isArray(refreshed?.items) ? refreshed.items : [];
            setTransactionDetails(refreshed);
            setItemDrafts(Object.fromEntries(refreshedItems.map((item) => [item.booking_item_id, {
                unit_id: item.unit_id || '',
                room_type: item.room_type || '',
                status: item.status || 'PENDING_VERIFICATION'
            }])));
            setSelectedUnitIds(refreshedItems.map((item) => item.unit_id).filter(Boolean));
            setAssignLater(!refreshedItems.some((item) => item.unit_id));
            await fetchReconciliation();
            Promise.resolve(onSync()).catch(err => console.error('Silent sync refresh failed:', err));
            setLastSynced(true);
            setTimeout(() => setLastSynced(false), 3000);
        } catch (err) {
            console.error('Transaction item update failed:', err);
            setError(err?.message || 'Transaction item update failed.');
        } finally {
            setSyncing(false);
        }
    };

    const handleTransactionItemAdd = async () => {
        if (!initialData?.booking_ref || !newTransactionUnitId) return;
        const selectedUnitRow = (units || []).find((unitRow) => String(unitRow.unit_id) === String(newTransactionUnitId));
        if (!selectedUnitRow) return;

        setSyncing(true);
        setError('');

        try {
            await api.post(`/api/v1/admin/bookings/${initialData.booking_ref}/change-set`, {
                workflow: 'edit',
                booking: {
                    items: [{
                        booking_item_id: `temp-${Date.now()}`,
                        unit_id: selectedUnitRow.unit_id,
                        room_type: selectedUnitRow.room_type || selectedUnitRow.room_type_id || form.room_type,
                        check_in: form.check_in,
                        check_out: form.check_out,
                        guest_count: 0,
                        lodging_subtotal: 0,
                        status: form.status === 'CHECKED_IN' ? 'CHECKED_IN' : 'RESERVED'
                    }]
                },
                admin_id: 'Vincent-Admin'
            });

            const refreshed = await api.get(`/api/v1/admin/booking-headers/${initialData.booking_ref}`);
            const refreshedItems = Array.isArray(refreshed?.items) ? refreshed.items : [];
            setTransactionDetails(refreshed);
            setItemDrafts(Object.fromEntries(refreshedItems.map((item) => [item.booking_item_id, {
                unit_id: item.unit_id || '',
                room_type: item.room_type || '',
                status: item.status || 'PENDING_VERIFICATION'
            }])));
            setSelectedUnitIds(refreshedItems.map((item) => item.unit_id).filter(Boolean));
            setAssignLater(!refreshedItems.some((item) => item.unit_id));
            setNewTransactionUnitId('');
            await fetchReconciliation();
            Promise.resolve(onSync()).catch(err => console.error('Silent sync refresh failed:', err));
            setLastSynced(true);
            setTimeout(() => setLastSynced(false), 3000);
        } catch (err) {
            console.error('Transaction item add failed:', err);
            setError(err?.message || 'Transaction item add failed.');
        } finally {
            setSyncing(false);
        }
    };

    const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' };
    const isEditingSection = (key) => !isEdit || Boolean(editingSections[key]);
    const startEditingSection = (key) => setEditingSections((current) => ({ ...current, [key]: true }));
    const readOnlyGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' };
    const readOnlyItemStyle = { padding: '14px 16px', borderRadius: '14px', background: '#fff', border: '1px solid rgba(0,0,0,0.06)' };
    const readOnlyLabelStyle = { fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(72,99,88,0.55)', marginBottom: '6px' };
    const readOnlyValueStyle = { fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-primary)' };
    const setBookingType = (nextType) => {
        const makeMulti = nextType === 'multi';
        setUseTransactionBooking(makeMulti);
        setAssignLater(false);
        setConflict(null);
        setError('');
        if (makeMulti) {
            setForm((current) => ({ ...current, unit_id: '' }));
            setSelectedUnitIds((current) => current.filter(Boolean));
            return;
        }

        const fallbackUnitId = selectedUnitIds[0] || '';
        setForm((current) => ({ ...current, unit_id: fallbackUnitId }));
        setSelectedUnitIds(fallbackUnitId ? [fallbackUnitId] : []);
    };
    const nights = useMemo(() => {
        if (!(form.check_in && form.check_out)) return 1;
        const checkIn = parseISO(form.check_in);
        const checkOut = parseISO(form.check_out);
        if (!isValid(checkIn) || !isValid(checkOut)) return 1;
        return Math.max(1, differenceInCalendarDays(checkOut, checkIn) || 1);
    }, [form.check_in, form.check_out]);
    const unitConflictMap = useMemo(() => {
        const map = new Map();
        Object.entries(availabilityConflicts || {}).forEach(([unitId, booking]) => {
            if (unitId && booking) map.set(unitId, booking);
        });
        (existingBookings || []).forEach((booking) => {
            if (!booking?.unit_id) return;
            if (map.has(booking.unit_id)) return;
            if (isEdit && booking.booking_ref === initialData?.booking_ref) return;
            if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') return;

            const startA = parseISO(form.check_in);
            const endA = parseISO(form.check_out);
            const startB = parseISO(booking.check_in);
            const endB = parseISO(booking.check_out);

            if (!(isValid(startA) && isValid(endA) && isValid(startB) && isValid(endB))) return;
            if (!(startA < endB && endA > startB)) return;

            if (!map.has(booking.unit_id)) {
                map.set(booking.unit_id, booking);
            }
        });
        return map;
    }, [availabilityConflicts, existingBookings, form.check_in, form.check_out, isEdit, initialData?.booking_ref]);
    const getUnitBlockerLabel = (blockingBooking) => {
        if (!blockingBooking) return '';
        return blockingBooking.full_name || blockingBooking.guest_name || blockingBooking.booking_ref || 'another booking';
    };
    const getUnitOptionLabel = (unitRow) => {
        const blockingBooking = unitConflictMap.get(unitRow.unit_id);
        const baseLabel = `${unitRow.unit_label || unitRow.unit_id} (${unitRow.room_type})`;
        if (!blockingBooking) return baseLabel;
        return `${baseLabel} - BOOKED by ${getUnitBlockerLabel(blockingBooking)}`;
    };
    const blockedRoomTypeUnits = useMemo(
        () => roomTypeUnits.filter((candidate) => unitConflictMap.has(candidate.unit_id)),
        [roomTypeUnits, unitConflictMap]
    );
    const effectiveMaxAllowedPax = useMemo(() => {
        if (isTransactionMode) {
            if (assignLater || transactionSelectedUnits.length === 0) return null;
            const summedCapacity = transactionSelectedUnits.reduce((sum, unitRow) => {
                const unitCap = getUnitCapacity(unitRow, form.max_allowed_pax);
                return sum + Math.max(unitCap, 0);
            }, 0);
            return summedCapacity > 0 ? summedCapacity : null;
        }

        if (isTransactionEdit) {
            if (assignLater || transactionDraftUnits.length === 0) return null;
            const summedCapacity = transactionDraftUnits.reduce((sum, unitRow) => {
                const unitCap = getUnitCapacity(unitRow, form.max_allowed_pax);
                return sum + Math.max(unitCap, 0);
            }, 0);
            return summedCapacity > 0 ? summedCapacity : null;
        }

        if (!isEdit && !(form.unit_id || unit?.unit_id)) return null;
        return Number(form.max_allowed_pax) || 20;
    }, [assignLater, form.max_allowed_pax, isEdit, isTransactionEdit, isTransactionMode, transactionDraftUnits, transactionSelectedUnits, unit?.unit_id]);
    const selectedUnit = units.find(ux => ux.unit_id === (form.unit_id || unit?.unit_id)) || unit;
    const currentGuests = Number(form.guests || 0);
    const capacityDelta = effectiveMaxAllowedPax ? effectiveMaxAllowedPax - currentGuests : null;
    const capacityShortfall = capacityDelta !== null && capacityDelta < 0 ? Math.abs(capacityDelta) : 0;
    const roomNeedCovered = capacityDelta !== null && capacityDelta >= 0;
    const capacityTone = capacityDelta === null
        ? '#6b7280'
        : capacityDelta >= 0
            ? '#17603a'
            : '#c41e3a';
    const capacityStatusLabel = capacityDelta === null
        ? 'Select rooms to check capacity'
        : capacityDelta >= 0
            ? capacityDelta === 0
                ? 'Selected rooms exactly match the guest count'
                : `Selected rooms cover the booking with ${capacityDelta} spare pax`
            : `Select more units: ${capacityShortfall} pax capacity short`;
    useEffect(() => {
        if (!/capacity|short by|Select more units/i.test(String(error || ''))) return;
        if (effectiveMaxAllowedPax && currentGuests <= effectiveMaxAllowedPax) {
            setError('');
        }
    }, [currentGuests, effectiveMaxAllowedPax, error]);
    const createUnitSummary = isTransactionBookingMode
        ? `${selectedUnitIds.length} selected`
        : (selectedUnit?.unit_label || form.unit_id || 'Not set');
    const transactionUnitSummaries = useMemo(() => {
        if (!isTransactionEdit) return [];
        const items = Array.isArray(transactionDetails?.items) ? transactionDetails.items : [];
        return items.map((item) => {
            const matchedUnit = units.find((unitRow) => unitRow.unit_id === item.unit_id);
            return {
                ...item,
                display_label: matchedUnit?.unit_label || item.unit_id || `${item.room_type || 'Unassigned'} Queue`
            };
        });
    }, [isTransactionEdit, transactionDetails, units]);
    const transactionUnitChoices = useMemo(() => {
        if (!isTransactionEdit) return {};
        return Object.fromEntries(transactionUnitSummaries.map((item) => {
            const currentUnit = (units || []).find((unitRow) => String(unitRow.unit_id) === String(item.unit_id || ''));
            const currentFallback = item.unit_id
                ? {
                    unit_id: item.unit_id,
                    unit_label: item.display_label || item.unit_id,
                    room_type: item.room_type,
                    room_type_id: item.room_type,
                    max_pax: Number(item.guest_count || form.max_allowed_pax || 0),
                }
                : null;
            const allUnits = currentUnit
                ? [currentUnit, ...(units || []).filter((unitRow) => String(unitRow.unit_id) !== String(currentUnit.unit_id))]
                : [currentFallback, ...(units || [])].filter(Boolean);
            const choices = allUnits
                .map((unitRow) => ({
                    ...unitRow,
                    isCurrentSelection: String(unitRow.unit_id) === String(item.unit_id || '')
                }))
                .sort((a, b) => {
                    if (a.isCurrentSelection !== b.isCurrentSelection) return a.isCurrentSelection ? -1 : 1;
                    const aBlocked = unitConflictMap.has(a.unit_id);
                    const bBlocked = unitConflictMap.has(b.unit_id);
                    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
                    return String(a.unit_label || a.unit_id).localeCompare(String(b.unit_label || b.unit_id));
                });
            return [item.booking_item_id, choices];
        }));
    }, [form.max_allowed_pax, isTransactionEdit, transactionUnitSummaries, unitConflictMap, units]);
// Main
    const checkInDate = form.check_in ? parseISO(form.check_in) : null;
    const checkOutDate = form.check_out ? parseISO(form.check_out) : null;
    const createStayDone = Boolean(
        form.check_in &&
        form.check_out &&
        Number(form.guests || 0) > 0 &&
        isValid(checkInDate) &&
        isValid(checkOutDate) &&
        (isDayTour || checkOutDate > checkInDate)
    );
    const createUnitsDone = isTransactionMode
        ? selectedUnitIds.length > 0 && (!effectiveMaxAllowedPax || Number(form.guests || 0) <= effectiveMaxAllowedPax)
        : Boolean(form.unit_id || unit?.unit_id) && !conflict && (!effectiveMaxAllowedPax || Number(form.guests || 0) <= effectiveMaxAllowedPax);
    const createGuestDone = Boolean(String(form.full_name || form.phone || form.email || form.notes || form.special_requests || '').trim());
    const createStepDone = {
        stay: createStayDone,
        units: createUnitsDone,
        guest: createGuestDone,
        review: createStayDone && createUnitsDone,
    };
    const createTabIndex = Math.max(0, CREATE_TAB_OPTIONS.findIndex((tab) => tab.key === activeTab));
    const canOpenCreateTab = (tabKey) => {
        if (isEdit) return true;
        return true;
    };
    const goToCreateStep = (offset) => {
        if (isEdit) return;
        const next = CREATE_TAB_OPTIONS[createTabIndex + offset];
        if (next && canOpenCreateTab(next.key)) {
            setActiveTab(next.key);
        }
    };
    const createSaveReady = createStayDone && createUnitsDone;

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
            <DialogContent className="flex max-h-[96vh] w-[min(1140px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[28px] border border-[#b8873e]/80 bg-[#fffaf1] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,255,255,0.48),0_0_0_1px_rgba(73,50,21,0.08),0_28px_90px_rgba(19,33,31,0.30),0_10px_30px_rgba(198,146,63,0.16)]">
                <DialogHeader className="relative min-h-[76px] overflow-hidden border-b border-[#c8ae7c]/70 bg-[#fffdf8] px-6 py-2 text-left shadow-[inset_0_-1px_0_rgba(255,255,255,0.86)]">
                    <img
                        src="/assets/page-headers/summary-lagoon.svg"
                        alt=""
                        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[52%] object-cover opacity-95"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,#fffdf8_0%,rgba(255,253,248,0.98)_40%,rgba(255,253,248,0.72)_64%,rgba(10,107,95,0.44)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,#c6923f,rgba(198,146,63,0.32),rgba(10,107,95,0.55))]" />
                    <div className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#c6923f,#0a6b5f)] shadow-[0_0_18px_rgba(198,146,63,0.32)]" />
                    <div className="relative z-10 flex min-h-[52px] flex-col items-start justify-center pr-12">
                        <div className="flex flex-wrap items-center gap-2">
                            <DialogTitle className="font-resortDisplay text-[1.45rem] font-black leading-none tracking-normal text-amalfi-ink">
                                {isEdit ? 'Edit Booking' : 'Manual Booking'}
                            </DialogTitle>
                            <StatusBadge tone={isEdit ? 'neutral' : 'info'}>
                                {isEdit ? 'Existing Booking' : 'New Booking'}
                            </StatusBadge>
                        </div>
                        <DialogDescription className="sr-only">
                            {isEdit ? 'Edit booking details.' : 'Create a manual booking.'}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(next) => {
                    if (canOpenCreateTab(next)) setActiveTab(next);
                }} className="border-b border-[#d8c9b3]/70 bg-[#fff7eb]/92 px-5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <TabsList className={cn(
                        bookingTabListClass,
                        isEdit ? 'grid w-full grid-cols-2 lg:grid-cols-6' : 'flex w-fit max-w-full flex-wrap items-center'
                    )}>
                    {visibleTabOptions.map((tab, index) => {
                        const disabled = !canOpenCreateTab(tab.key);
                        const done = !isEdit && createStepDone[tab.key];
                        return (
                            <TabsTrigger
                                key={tab.key}
                                value={tab.key}
                                disabled={disabled}
                                className={cn(
                                    bookingTabTriggerClass,
                                    'justify-center gap-2 text-center',
                                    !isEdit && 'w-[150px] flex-none',
                                    done && 'border-primary/35 text-primary'
                                )}
                            >
                                {!isEdit && (
                                    <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-[0.56rem] text-primary group-data-[state=active]:bg-white/15 group-data-[state=active]:text-white">
                                        {index + 1}
                                    </span>
                                )}
                                {tab.label}
                            </TabsTrigger>
                        );
                    })}
                    </TabsList>
                </Tabs>

                <div className="grid min-h-0 flex-1 bg-[linear-gradient(135deg,#fffaf1_0%,#f7eedf_52%,#eef6f0_100%)] lg:grid-cols-[minmax(0,1fr)_340px]">
                    
                    {/* Left Pane: Data Entry (60%) */}
                    <div className="min-h-0 overflow-y-auto border-r border-[#d8c9b3]/70 bg-[#fffdf8]/68 px-4 py-3 shadow-[inset_-1px_0_0_rgba(255,255,255,0.72)]">
                        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                            {!isEdit && activeTab === 'stay' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <section className="rounded-2xl border border-[#d8c9b3]/70 bg-[#fffdf8]/64 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(19,33,31,0.035)]">
                                    <div className="mb-3 flex items-center gap-3">
                                        <div className="h-px flex-1 bg-[linear-gradient(90deg,#c6923f,rgba(216,201,179,0.35))]" />
                                        <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Stay Setup</div>
                                        <div className="h-px flex-[2] bg-[linear-gradient(90deg,rgba(216,201,179,0.45),transparent)]" />
                                    </div>

                                    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(280px,430px)_minmax(0,1fr)]">
                                    {!unit && !isDayTour && (
                                        <Card className="min-w-0 rounded-2xl border-primary/20 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                            <CardContent className="p-3">
                                            <div className="mb-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                                Booking Type
                                            </div>
                                            <div className="inline-flex gap-1 rounded-full border border-primary/20 bg-[#fffdf8] p-1">
                                                <Button
                                                    type="button"
                                                    onClick={() => setBookingType('solo')}
                                                    size="sm"
                                                    variant={!useTransactionBooking ? 'default' : 'ghost'}
                                                    className="rounded-full px-4 text-xs font-black"
                                                >
                                                    Single Booking
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => setBookingType('multi')}
                                                    size="sm"
                                                    variant={useTransactionBooking ? 'default' : 'ghost'}
                                                    className="rounded-full px-4 text-xs font-black"
                                                >
                                                    Multi Booking
                                                </Button>
                                            </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    <div className="grid min-w-0 gap-2.5">
                                        <div className="grid min-w-0 gap-2.5">
                                            <div className="min-w-0"><label className={fieldLabelClass}>Check-In Date</label><Input className={inputClass} type="date" value={form.check_in} onChange={e => { setForm({...form, check_in: e.target.value}); setIsAutoPrice(true); }} required /></div>
                                            <div className="min-w-0"><label className={fieldLabelClass}>Check-Out Date</label><Input className={inputClass} type="date" value={form.check_out} onChange={e => { setForm({...form, check_out: e.target.value}); setIsAutoPrice(true); }} required disabled={isDayTour} /></div>
                                        </div>

                                        <div className="grid min-w-0 gap-2.5 min-[1180px]:grid-cols-[minmax(150px,180px)_minmax(0,220px)]">
                                            <div className="min-w-0">
                                                <label className={fieldLabelClass}>Guests (Pax)</label>
                                                <Input className={cn(inputClass, (effectiveMaxAllowedPax && form.guests > effectiveMaxAllowedPax) && 'border-red-300 focus-visible:ring-red-200')}
                                                       type="text" inputMode="numeric" pattern="[0-9]*" value={form.guests}
                                                       onChange={e => { setForm({...form, guests: normalizeIntegerInput(e.target.value)}); setIsAutoPrice(true); }} required />
                                                {effectiveMaxAllowedPax && form.guests > effectiveMaxAllowedPax && (
                                                    <div className="mt-1.5 text-xs font-black text-red-700">
                                                        Select more units: {capacityShortfall} pax capacity short.
                                                    </div>
                                                )}
                                                {effectiveMaxAllowedPax && form.guests <= effectiveMaxAllowedPax && (
                                                    <div className="mt-1.5 text-xs font-black text-primary">
                                                        Within capacity. {Math.max(effectiveMaxAllowedPax - Number(form.guests || 0), 0)} pax still available.
                                                    </div>
                                                )}
                                            </div>
                                            <div className="rounded-2xl border border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] p-3">
                                                <div className="text-[0.55rem] font-black uppercase tracking-[0.1em] text-muted-foreground">Booking Shape</div>
                                                <div className="mt-1 text-sm font-black text-primary">
                                                    {isTransactionBookingMode ? 'Multi-booking' : 'Single booking'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    </div>
                                    </section>

                                    <section className="mt-3 rounded-2xl border border-[#b8873e]/65 bg-[#fffaf1]/74 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_12px_28px_rgba(198,146,63,0.055)]">
                                        <div className="mb-3 flex items-center gap-3">
                                            <div className="h-px flex-1 bg-[linear-gradient(90deg,#b8873e,rgba(216,201,179,0.35))]" />
                                            <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Units</div>
                                            <div className="h-px flex-[2] bg-[linear-gradient(90deg,rgba(216,201,179,0.48),transparent)]" />
                                        </div>

                                        <div className="grid max-w-[560px] gap-2.5 sm:grid-cols-[260px_220px]">
                                            {!unit && !isTransactionEdit && (
                                                <div className="max-w-[260px]">
                                                    <label className={fieldLabelClass}>Browse Category</label>
                                                    <div className="relative">
                                                        <Home className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                        <select
                                                            className={selectClass}
                                                            value={selectedRoomFamily}
                                                            onChange={e => {
                                                                const nextFamily = e.target.value;
                                                                setSelectedRoomFamily(nextFamily);
                                                            }}
                                                        >
                                                            <option value="">All Room Types</option>
                                                            {roomTypeOptions.map(option => (
                                                                <option key={option} value={option}>{option}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="max-w-[220px] rounded-2xl border border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] p-3">
                                                <div className="text-[0.55rem] font-black uppercase tracking-[0.1em] text-muted-foreground">Assignment Status</div>
                                                <div className="mt-1 text-sm font-black text-primary">
                                                    {isTransactionBookingMode ? `${selectedUnitIds.length || 0} units selected` : (selectedUnit?.unit_label || form.unit_id || 'No unit selected')}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3">
                                            <label className={fieldLabelClass}>{isTransactionBookingMode ? 'Unit Allocation' : 'Primary Unit'}</label>
                                            {!isTransactionMode && !isTransactionEdit && (
                                                <>
                                                <div className="relative">
                                                    <Home className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                    <select className={selectClass} value={form.unit_id || unit?.unit_id} onChange={e => {
                                                        const selectedUnitRow = units.find(ux => ux.unit_id === e.target.value);
                                                        if (selectedUnitRow && unitConflictMap.has(selectedUnitRow.unit_id)) return;
                                                        setForm({...form, unit_id: e.target.value, room_type: selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || ''});
                                                        setSelectedRoomFamily(getRoomFamily(selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || ''));
                                                        setSelectedUnitIds(e.target.value ? [e.target.value] : []);
                                                    }} required disabled={!!unit}>
                                                        <option value="">Select Unit...</option>
                                                        {units
                                                            .filter(u => !selectedRoomFamily || getRoomFamily(u.room_type || u.room_type_id) === selectedRoomFamily)
                                                            .map(u => {
                                                                const blocked = unitConflictMap.has(u.unit_id);
                                                                return (
                                                                    <option key={u.unit_id} value={u.unit_id} disabled={blocked}>
                                                                        {getUnitOptionLabel(u)} - {getUnitCapacityLabel(u, form.max_allowed_pax)}
                                                                    </option>
                                                                );
                                                            })}
                                                    </select>
                                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                </div>
                                                {blockedRoomTypeUnits.length > 0 && (
                                                    <div className="mt-2 text-xs font-black leading-relaxed text-red-700">
                                                        Booked for selected dates: {blockedRoomTypeUnits.slice(0, 4).map((unitRow) => unitRow.unit_label || unitRow.unit_id).join(', ')}
                                                        {blockedRoomTypeUnits.length > 4 ? ` and ${blockedRoomTypeUnits.length - 4} more` : ''}
                                                    </div>
                                                )}
                                                </>
                                            )}

                                            {isTransactionMode && (
                                                <div className="flex flex-col gap-2.5">
                                                    {roomNeedCovered && (
                                                        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-black leading-relaxed text-primary">
                                                            Capacity is already covered by the current room selections. Deselect a room first if you want to swap to another one.
                                                        </div>
                                                    )}
                                                    <div className={unitPickerShellClass}>
                                                        {roomTypeUnits.length === 0 && (
                                                            <div className="rounded-xl border border-dashed border-[#c8ae7c]/55 bg-[#fffaf1]/70 px-3 py-3 text-xs font-bold text-muted-foreground">
                                                                Select a room type first, then choose the exact rooms for this shared booking.
                                                            </div>
                                                        )}
                                                        <div className={unitPickerGridClass}>
                                                            {roomTypeUnits.map((unitRow) => {
                                                                const blockingBooking = unitConflictMap.get(unitRow.unit_id);
                                                                const checked = selectedUnitIds.includes(unitRow.unit_id);
                                                                const disabled = Boolean(blockingBooking) || (roomNeedCovered && !checked);
                                                                return (
                                                                    <label key={unitRow.unit_id} className={cn(unitOptionCardClass, checked ? 'border-primary/45 bg-primary/7 text-foreground shadow-[inset_3px_0_0_rgba(10,107,95,0.78)]' : 'border-[#eadfcd] bg-[#fffaf1]/66', blockingBooking ? 'border-red-200 bg-red-50 text-red-700' : disabled ? 'text-muted-foreground/60' : 'text-foreground hover:border-[#c8ae7c]/80 hover:bg-white')}>
                                                                        <input
                                                                            type="checkbox"
                                                                            className="size-4 accent-primary"
                                                                            checked={checked}
                                                                            disabled={disabled}
                                                                            onChange={e => {
                                                                                const nextChecked = e.target.checked;
                                                                                setSelectedUnitIds((current) => nextChecked
                                                                                    ? [...current, unitRow.unit_id]
                                                                                    : current.filter((value) => value !== unitRow.unit_id));
                                                                            }}
                                                                        />
                                                                        <span className="min-w-0">
                                                                            <span className="block truncate text-[0.78rem] font-black">{unitRow.unit_label || unitRow.unit_id}</span>
                                                                            <span className={cn('mt-0.5 block truncate text-[0.62rem] font-black uppercase tracking-normal', blockingBooking ? 'text-red-700' : disabled ? 'text-muted-foreground/60' : 'text-primary')}>
                                                                                {blockingBooking ? 'Booked' : getUnitCapacityLabel(unitRow, form.max_allowed_pax)}
                                                                            </span>
                                                                        </span>
                                                                        <span className={cn(unitMetaPillClass, blockingBooking ? 'border-red-200 bg-red-100 text-red-700' : (roomNeedCovered && !checked ? 'border-[#d8c9b3]/70 bg-[#f7eedf]/70 text-muted-foreground' : 'border-primary/18 bg-primary/5 text-primary'))}>
                                                                            {blockingBooking ? getUnitBlockerLabel(blockingBooking) : (roomNeedCovered && !checked ? 'Covered' : 'Open')}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[0.66rem] font-black">
                                                        <div className="text-foreground">
                                                            {selectedUnitIds.length} room{selectedUnitIds.length === 1 ? '' : 's'} selected
                                                        </div>
                                                        <div className="text-primary">
                                                            Total max capacity: {effectiveMaxAllowedPax || 0}
                                                        </div>
                                                        <div className="text-primary">
                                                            Booking pax: {currentGuests || 0}
                                                        </div>
                                                        <div className={capacityTone === '#c41e3a' ? 'text-red-700' : 'text-primary'}>
                                                            {capacityStatusLabel}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                </div>
                            )}

                            {!isEdit && activeTab === 'units' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Units</div>

                                    <div className={cn(twoColClass, 'mb-5')}>
                                        {!unit && !isTransactionEdit && (
                                                <div>
                                                <label className={fieldLabelClass}>Browse Category</label>
                                                <div className="relative">
                                                    <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                    <select
                                                        className={selectClass}
                                                        value={selectedRoomFamily}
                                                        onChange={e => {
                                                            const nextFamily = e.target.value;
                                                            setSelectedRoomFamily(nextFamily);
                                                        }}
                                                    >
                                                        <option value="">All Room Types</option>
                                                        {roomTypeOptions.map(option => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                </div>
                                            </div>
                                        )}
                                        <div className="rounded-2xl border border-transparent bg-[#f7eedf]/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] px-4 py-3">
                                            <div className="text-[0.6rem] font-black uppercase tracking-[0.1em] text-muted-foreground">Assignment Status</div>
                                            <div className="mt-1 text-sm font-black text-primary">
                                                {isTransactionBookingMode ? `${selectedUnitIds.length || 0} units selected` : (selectedUnit?.unit_label || form.unit_id || 'No unit selected')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-5">
                                        <label className={fieldLabelClass}>{isTransactionBookingMode ? 'Unit Allocation' : 'Primary Unit'}</label>
                                        {!isTransactionMode && !isTransactionEdit && (
                                            <>
                                            <div className="relative">
                                                <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                <select value={form.unit_id || unit?.unit_id} onChange={e => {
                                                    const selectedUnitRow = units.find(ux => ux.unit_id === e.target.value);
                                                    if (selectedUnitRow && unitConflictMap.has(selectedUnitRow.unit_id)) return;
                                                    setForm({...form, unit_id: e.target.value, room_type: selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || ''});
                                                    setSelectedRoomFamily(getRoomFamily(selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || ''));
                                                    setSelectedUnitIds(e.target.value ? [e.target.value] : []);
                                                }} required disabled={!!unit} className={selectClass}>
                                                    <option value="">Select Unit...</option>
                                                    {units
                                                        .filter(u => !selectedRoomFamily || getRoomFamily(u.room_type || u.room_type_id) === selectedRoomFamily)
                                                        .map(u => {
                                                            const blocked = unitConflictMap.has(u.unit_id);
                                                            return (
                                                                <option key={u.unit_id} value={u.unit_id} disabled={blocked}>
                                                                    {getUnitOptionLabel(u)} - {getUnitCapacityLabel(u, form.max_allowed_pax)}
                                                                </option>
                                                            );
                                                        })}
                                                </select>
                                                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                            {blockedRoomTypeUnits.length > 0 && (
                                                <div className="mt-2 text-xs font-black leading-relaxed text-red-700">
                                                    Booked for selected dates: {blockedRoomTypeUnits.slice(0, 4).map((unitRow) => unitRow.unit_label || unitRow.unit_id).join(', ')}
                                                    {blockedRoomTypeUnits.length > 4 ? ` and ${blockedRoomTypeUnits.length - 4} more` : ''}
                                                </div>
                                            )}
                                            </>
                                        )}

                                        {isTransactionMode && (
                                            <div className="flex flex-col gap-3">
                                                {roomNeedCovered && (
                                                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-black leading-relaxed text-primary">
                                                        Capacity is already covered by the current room selections. Deselect a room first if you want to swap to another one.
                                                    </div>
                                                )}
                                                <div className={unitPickerShellClass}>
                                                    {roomTypeUnits.length === 0 && (
                                                        <div className="rounded-xl border border-dashed border-[#c8ae7c]/55 bg-[#fffaf1]/70 px-3 py-3 text-xs font-bold text-muted-foreground">
                                                            Select a room type first, then choose the exact rooms for this shared booking.
                                                        </div>
                                                    )}
                                                    <div className={unitPickerGridClass}>
                                                        {roomTypeUnits.map((unitRow) => {
                                                            const blockingBooking = unitConflictMap.get(unitRow.unit_id);
                                                            const checked = selectedUnitIds.includes(unitRow.unit_id);
                                                            const disabled = Boolean(blockingBooking) || (roomNeedCovered && !checked);
                                                            return (
                                                                <label key={unitRow.unit_id} className={cn(unitOptionCardClass, checked ? 'border-primary/45 bg-primary/7 text-foreground shadow-[inset_3px_0_0_rgba(10,107,95,0.78)]' : 'border-[#eadfcd] bg-[#fffaf1]/66', blockingBooking ? 'border-red-200 bg-red-50 text-red-700' : disabled ? 'text-muted-foreground/60' : 'text-foreground hover:border-[#c8ae7c]/80 hover:bg-white')}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="size-4 accent-primary"
                                                                        checked={checked}
                                                                        disabled={disabled}
                                                                        onChange={e => {
                                                                            const nextChecked = e.target.checked;
                                                                            setSelectedUnitIds((current) => nextChecked
                                                                                ? [...current, unitRow.unit_id]
                                                                                : current.filter((value) => value !== unitRow.unit_id));
                                                                        }}
                                                                    />
                                                                    <span className="min-w-0">
                                                                        <span className="block truncate text-[0.78rem] font-black">{unitRow.unit_label || unitRow.unit_id}</span>
                                                                        <span className={cn('mt-0.5 block truncate text-[0.62rem] font-black uppercase tracking-normal', blockingBooking ? 'text-red-700' : disabled ? 'text-muted-foreground/60' : 'text-primary')}>
                                                                            {blockingBooking ? 'Booked for selected dates' : getUnitCapacityLabel(unitRow, form.max_allowed_pax)}
                                                                        </span>
                                                                    </span>
                                                                    <span className={cn(unitMetaPillClass, blockingBooking ? 'border-red-200 bg-red-100 text-red-700' : (roomNeedCovered && !checked ? 'border-[#d8c9b3]/70 bg-[#f7eedf]/70 text-muted-foreground' : 'border-primary/18 bg-primary/5 text-primary'))}>
                                                                        {blockingBooking
                                                                            ? getUnitBlockerLabel(blockingBooking)
                                                                            : (roomNeedCovered && !checked ? 'Covered' : 'Available')}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-black">
                                                    <div className="text-foreground">
                                                        {selectedUnitIds.length} room{selectedUnitIds.length === 1 ? '' : 's'} selected
                                                    </div>
                                                    <div className="text-primary">
                                                        Total max capacity: {effectiveMaxAllowedPax || 0}
                                                    </div>
                                                    <div className="text-primary">
                                                        Booking pax: {currentGuests || 0}
                                                    </div>
                                                    <div className={cn(capacityTone === '#c41e3a' ? 'text-red-700' : 'text-primary')}>
                                                        {capacityStatusLabel}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!isEdit && activeTab === 'guest' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                        <CardContent className="grid gap-4 p-5">
                                        <div>
                                            <h3 className="text-base font-black text-foreground">Guest Details</h3>
                                        </div>

                                        <div className={twoColClass}>
                                            <div><label className={fieldLabelClass}>Full Name</label><Input className={inputClass} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="Walk-in Guest" /></div>
                                            <div><label className={fieldLabelClass}>Phone</label><Input className={inputClass} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="0917-000-0000" /></div>
                                        </div>

                                        <div className={twoColClass}>
                                            <div><label className={fieldLabelClass}>Email</label><Input className={inputClass} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} placeholder="guest@email.com" /></div>
                                        <div>
                                            <label className={fieldLabelClass}>Booking Source</label>
                                            <div className="relative">
                                                <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                <select className={selectClass} value={form.booking_source} onChange={e => setForm({...form, booking_source: e.target.value})}>
                                                    {['Direct', 'Facebook', 'Messenger', 'Walk-in', 'Referral', 'Phone'].map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                        </div>
                                        </div>

                                        <div>
                                            <label className={fieldLabelClass}>Special Requests</label>
                                            <Textarea className={textareaClass} value={form.special_requests || ''} onChange={e => setForm({...form, special_requests: e.target.value})} placeholder="Guest-facing requests, arrival notes, or setup reminders..." />
                                        </div>

                                        <div>
                                            <label className={fieldLabelClass}>Admin Notes</label>
                                            <Textarea className={textareaClass} value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Internal notes, payment context, or front desk handoff..." />
                                        </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {!isEdit && activeTab === 'review' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Payment</div>

                                    <Card className="mb-5 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                        <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                                        <div className="md:col-span-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">Rate & Discount</div>
                                        <div>
                                            <label className={fieldLabelClass}>Agreed Room Total</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-foreground">P</span>
                                                <Input className={moneyInputClass}
                                                       type="text" inputMode="decimal"
                                                       value={form.total_price}
                                                       onChange={e => { setIsAutoPrice(false); setForm({...form, total_price: normalizeMoneyInput(e.target.value)}); }}
                                                       placeholder="Enter agreed amount"
                                                       disabled={isAutoPrice} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-start gap-2 md:items-end">
                                            <StatusBadge tone={isAutoPrice ? 'success' : 'warning'}>
                                                {isAutoPrice ? 'AUTO PRICE' : 'MANUAL TOTAL'}
                                            </StatusBadge>
                                            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    className="size-4 accent-primary"
                                                    checked={!isAutoPrice}
                                                    onChange={e => setIsAutoPrice(!e.target.checked)}
                                                />
                                                Manual override total
                                            </label>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <label className={fieldLabelClass}>Calculated Rate</label>
                                                    <div className="flex min-h-11 items-center rounded-xl border border-[#d8c9b3]/70 bg-[#fffdf8] px-3 text-sm font-black text-foreground">
                                                        P{calculatedBookingTotal.toLocaleString()}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className={fieldLabelClass}>Applied Discount</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                        <Input
                                                            className={moneyInputClass}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={appliedDiscount > 0 ? String(appliedDiscount) : ''}
                                                            onChange={e => handleApplyDiscount(e.target.value)}
                                                            placeholder="0"
                                                            disabled={calculatedBookingTotal <= 0}
                                                        />
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {[10, 20, 50].map((percent) => (
                                                            <Button
                                                                key={percent}
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleApplyDiscountPercent(percent)}
                                                                disabled={calculatedBookingTotal <= 0}
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
                                                                onChange={e => handleApplyDiscountPercent(normalizeMoneyInput(e.target.value))}
                                                                disabled={calculatedBookingTotal <= 0}
                                                            />
                                                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] font-black text-muted-foreground">%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        </CardContent>
                                    </Card>

                                    <div className="mb-6">
                                        <label className={fieldLabelClass}>Quick Add-On Charge</label>
                                        <div className="grid items-end gap-3 md:grid-cols-[1.6fr_1fr_auto]">
                                            <div>
                                                <Input
                                                    className={inputClass}
                                                    value={customChargeName}
                                                    onChange={e => setCustomChargeName(e.target.value)}
                                                    placeholder="Example: Corkage, bonfire, extra mattress"
                                                />
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input
                                                    className={moneyInputClass}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={customChargeAmount}
                                                    onChange={e => setCustomChargeAmount(normalizeMoneyInput(e.target.value))}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={handleAddCustomCharge}
                                                className="rounded-xl font-black"
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    </div>

                                    <div className={twoColClass}>
                                        <div>
                                            <label className={fieldLabelClass}>Add-On Total</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input
                                                    className={moneyInputClass}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={form.addon_amount}
                                                    onChange={e => {
                                                        const val = parseFloat(normalizeMoneyInput(e.target.value));
                                                        setForm({ ...form, addon_amount: isNaN(val) ? 0 : val });
                                                    }}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Payment Method</label>
                                            <select className={selectClass} value={form.payment_method || 'Cash'} onChange={e => setForm({...form, payment_method: e.target.value})}>
                                                {['Cash', 'GCash', 'Bank Transfer', 'Credit Card'].map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className={cn(twoColClass, 'mt-4')}>
                                        <div>
                                            <label className={fieldLabelClass}>Initial Payment Today</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-primary">P</span>
                                                <Input className={cn(moneyInputClass, 'border-primary/40 bg-primary/5')}
                                                       type="text" inputMode="decimal"
                                                       value={form.initial_payment}
                                                       onChange={e => setForm({...form, initial_payment: normalizeMoneyInput(e.target.value)})}
                                                       placeholder="Deposit or full payment"
                                                />
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                                            <div className="text-[0.55rem] font-black uppercase tracking-[0.1em] text-muted-foreground">Review Snapshot</div>
                                            <div className="mt-2 text-sm font-black text-foreground">
                                                Gross: P{grossTotal.toLocaleString()}
                                            </div>
                                            <div className="mt-1 text-xs font-black text-primary">
                                                Paid today: P{masterTotalPaid.toLocaleString()}
                                            </div>
                                            <div className={cn('mt-1 text-xs font-black', currentBalance > 0 ? 'text-red-700' : 'text-primary')}>
                                                Balance: P{currentBalance.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            )}

                            {activeTab === 'manual' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                            Freeform Quick Entry
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {isTransactionBookingMode && (
                                                <StatusBadge tone="success">
                                                    {isTransactionEdit ? 'TRANSACTION EDIT MODE' : 'TRANSACTION HEADER MODE'}
                                                </StatusBadge>
                                            )}
                                            <StatusBadge tone="warning">
                                                MANUAL OVERRIDE
                                            </StatusBadge>
                                        </div>
                                    </div>
                                    
                                    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                        <div className={cn(twoColClass, 'mb-4')}>
                                            <div>
                                                <label className={fieldLabelClass}>Full Name</label>
                                                <Input className={inputClass} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required placeholder="Enter Guest Name" />
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Phone</label>
                                                <Input className={inputClass} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="09XX-XXX-XXXX" />
                                            </div>
                                        </div>

                                        <div className={cn(twoColClass, 'mb-4')}>
                                            <div>
                                                <label className={fieldLabelClass}>Check-In</label>
                                                <Input className={inputClass} type="date" value={form.check_in} onChange={e => setForm({...form, check_in: e.target.value})} required />
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Check-Out</label>
                                                <Input className={inputClass} type="date" value={form.check_out} onChange={e => setForm({...form, check_out: e.target.value})} required disabled={isDayTour} />
                                            </div>
                                        </div>

                                        <div className={cn(twoColClass, 'mb-4')}>
                                            <div>
                                               <label className={fieldLabelClass}>Pax (Freeform)</label>
                                               <Input className={inputClass}
                                                      type="text" inputMode="numeric" pattern="[0-9]*" value={form.guests}
                                                      onChange={e => setForm({...form, guests: normalizeIntegerInput(e.target.value)})}
                                                      placeholder="Any count" />
                                               {effectiveMaxAllowedPax && form.guests > effectiveMaxAllowedPax && (
                                                   <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                                                       Selected units are short by {capacityShortfall} pax.
                                                   </div>
                                               )}
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Total Amount (Manual)</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                    <Input className={moneyInputClass}
                                                           type="text" inputMode="decimal"
                                                           value={form.total_price} 
                                                           onChange={e => { setIsAutoPrice(false); setForm({...form, total_price: normalizeMoneyInput(e.target.value)}); }}
                                                           placeholder="Enter agreed amount" 
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mb-4 max-w-full md:max-w-[50%]">
                                            <label className={fieldLabelClass}>{isTransactionEdit ? 'Verified Paid (Read Only)' : (isEdit ? 'Total Paid (Override)' : 'Initial Cash Settlement')}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-primary">P</span>
                                                <Input className={cn(moneyInputClass, 'border-primary/40 bg-primary/5')} type="text" inputMode="decimal"
                                                       value={isEdit ? (form.amount_paid ?? 0) : form.initial_payment} 
                                                       onChange={e => setForm({...form, [isEdit ? 'amount_paid' : 'initial_payment']: normalizeMoneyInput(e.target.value)})}
                                                       disabled={isTransactionEdit}
                                                       placeholder={isTransactionEdit ? "Use Payments tab for new receipts" : (isEdit ? "Set total paid..." : "Deposit or full...")} />
                                            </div>
                                        </div>

                                        <div className="mb-5">
                                            <label className={fieldLabelClass}>Special Booking Notes</label>
                                            <Textarea 
                                                className={textareaClass}
                                                value={form.notes || ''}
                                                onChange={e => setForm({...form, notes: e.target.value})}
                                                placeholder="Example: charged flat P25k per owner's request, actual pax is 22. Payment via GCash to Rica..."
                                            />
                                        </div>

                                        <div className="flex flex-col gap-4 rounded-2xl border border-transparent bg-[#f7eedf]/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <SummaryMini label="Assigned Unit" value={isTransactionBookingMode ? (assignLater ? 'Assign-Later Queue' : `${selectedUnitIds.length || 0} Units Selected`) : (assignLater ? 'Group Hold Queue' : (units.find(ux => ux.unit_id === (form.unit_id || unit?.unit_id))?.unit_label || form.unit_id))} tone="success" />
                                            <SummaryMini label="Registry Code" value={form.booking_ref} />
                                        </div>

                                    </div>
                                </div>
                            )}

                            {activeTab === 'overview' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Booking Overview</div>
                                    
                                    <div className="mb-6 grid gap-4 md:grid-cols-2">
                                        <Card className="rounded-2xl border-transparent bg-[#f7eedf]/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                            <CardContent className="p-5">
                                            <div className="mb-3 text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Guest Pulse</div>
                                            <div className="text-lg font-black text-foreground">{form.full_name || 'Manual booking still incomplete'}</div>
                                            <div className="mt-1 text-sm font-bold text-primary">{form.phone || 'No phone recorded'}</div>
                                            <div className="mt-2 text-xs font-black text-muted-foreground">Source: {form.booking_source}</div>
                                            </CardContent>
                                        </Card>
                                        <Card className="rounded-2xl border-[#d8c9b3]/70 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                            <CardContent className="p-5">
                                            <div className="mb-3 text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Stay Anchor</div>
                                            <div className="text-sm font-black text-primary">{isTransactionBookingMode ? (assignLater ? 'Assign-Later Queue' : `${selectedUnitIds.length || 0} Units Selected`) : (assignLater ? 'Group Hold Queue' : (units.find(ux => ux.unit_id === (form.unit_id || unit?.unit_id))?.unit_label || form.unit_id || 'Unit Unassigned'))}</div>
                                            <div className="mt-1 text-sm font-bold text-foreground">
                                                {safeFmt(form.check_in)} - {safeFmt(form.check_out)}
                                            </div>
                                            <div className="mt-2 text-xs font-black text-primary">
                                                {(form.check_in && form.check_out && isValid(parseISO(form.check_in)) && isValid(parseISO(form.check_out))) 
                                                    ? differenceInCalendarDays(parseISO(form.check_out), parseISO(form.check_in)) 
                                                : 1} Nights Total
                                            </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="mb-6 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                        <CardContent className="p-5">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <div className="mb-2 text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Financial Health</div>
                                                <div className={cn('text-2xl font-black', currentBalance > 0 ? 'text-red-700' : 'text-primary')}>
                                                    Balance: P{currentBalance.toLocaleString()}
                                                </div>
                                            </div>
                                            <StatusBadge tone={currentBalance > 0 ? 'danger' : 'success'}>{currentBalance > 0 ? 'Unsettled' : 'Fully Cleared'}</StatusBadge>
                                        </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-2xl border-transparent bg-[#e7f5ef] shadow-[inset_4px_0_0_rgba(10,107,95,0.32)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                        <CardContent className="p-5">
                                        <div className="mb-4 text-center text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Status Shortcuts</div>
                                        <div className="flex flex-col gap-3 sm:flex-row">
                                            {isEdit && form.status !== 'CHECKED_IN' && form.status !== 'CHECKED_OUT' && (
                                                <Button type="button" 
                                                    onClick={() => setForm((current) => ({ ...current, status: 'CHECKED_IN' }))}
                                                    className="flex-1 rounded-xl font-black">
                                                    Mark Checked In
                                                </Button>
                                            )}
                                            {form.status === 'CHECKED_IN' && (
                                                <Button type="button" 
                                                    onClick={() => setActiveTab('checkout')}
                                                    className="flex-1 rounded-xl bg-red-700 font-black text-white hover:bg-red-800">
                                                    Go To Checkout
                                                </Button>
                                            )}
                                            {form.status === 'CHECKED_OUT' && (
                                                <div className="flex-1 rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-black text-primary">
                                                    Room Cleared & Available
                                                </div>
                                            )}
                                        </div>
                                        </CardContent>
                                    </Card>

                                    {isEdit && reconciliation && (
                                        <div className="mt-8 border-t border-[#d8c9b3]/70 pt-6">
                                            <div className="mb-5 flex items-center justify-between gap-3">
                                                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                                    Payment Activity
                                                </div>
                                                <Button type="button" onClick={fetchReconciliation} variant="ghost" className="h-8 px-2 text-xs font-black text-primary">
                                                    {loadingRecon ? 'Refreshing...' : 'Refresh'}
                                                </Button>
                                            </div>

                                            <Card className="rounded-2xl border-transparent bg-[#f7eedf]/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                                <CardContent className="p-5">
                                                <div className="flex flex-col gap-3">
                                                    {reconciliation.timeline.map((ev, i) => (
                                                        <div key={i} className={cn(
                                                            'grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1fr_auto_auto]',
                                                            ev.type === 'DEBIT' ? 'border-red-100 bg-red-50/50' : 'border-primary/15 bg-primary/5',
                                                            !ev.affects_balance && 'opacity-60',
                                                        )}>
                                                            <div className={cn('flex size-8 items-center justify-center rounded-lg text-xs font-black', ev.type === 'DEBIT' ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary')}>
                                                                {ev.type === 'DEBIT' ? 'DR' : 'CR'}
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-black text-foreground">{ev.category}</div>
                                                                <div className="mt-0.5 text-xs font-semibold text-muted-foreground">{ev.description}</div>
                                                                <div className="mt-0.5 text-[0.65rem] font-bold text-muted-foreground/70">{format(parseISO(ev.timestamp), 'MMM dd, HH:mm')} | {ev.status}</div>
                                                            </div>
                                                            <div className="text-left sm:text-right">
                                                                <div className={cn('text-sm font-black', ev.type === 'DEBIT' ? 'text-red-700' : 'text-primary')}>
                                                                    {ev.type === 'DEBIT' ? '-' : '+'} P{ev.amount.toLocaleString()}
                                                                </div>
                                                            </div>
                                                            <div className="min-w-20 text-left sm:text-right">
                                                                <div className="text-xs font-black text-foreground">
                                                                    P{ev.running_balance.toLocaleString()}
                                                                </div>
                                                                <div className="text-[0.6rem] font-black uppercase text-muted-foreground">Balance</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#d8c9b3]/70 pt-4">
                                                    <span className="text-xs font-black text-muted-foreground">Current Balance</span>
                                                    <span className={cn('text-base font-black', reconciliation.total_verified_balance > 0 ? 'text-red-700' : 'text-primary')}>
                                                        P{reconciliation.total_verified_balance.toLocaleString()}
                                                    </span>
                                                </div>
                                                </CardContent>
                                            </Card>

                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'details' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Stay & Units</div>
                                    {isEdit && !isEditingSection('details') && (
                                        <Card className="mb-6 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                            <CardContent className="p-5">
                                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <div className="text-sm font-black text-foreground">Current stay and unit details</div>
                                                </div>
                                                <Button type="button" onClick={() => startEditingSection('details')} className="rounded-xl font-black">Edit</Button>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                {[
                                                    ['Guest', form.full_name || 'Walk-in Guest'],
                                                    ['Phone', form.phone || '-'],
                                                    ['Email', form.email || '-'],
                                                    ['Source', form.booking_source || '-'],
                                                    ['Check-in', safeFmt(form.check_in, 'MMM dd, yyyy')],
                                                    ['Check-out', safeFmt(form.check_out, 'MMM dd, yyyy')],
                                                    ['Guests', `${form.guests || 0} pax`],
                                                    ['Status', form.status || '-'],
                                                    ['Booking Type', isTransactionBookingMode ? 'Multi Booking' : 'Single Booking'],
                                                    ['Unit(s)', createUnitSummary],
                                                    ['Room Type', form.room_type || selectedUnit?.room_type || '-'],
                                                    ['Capacity', `${effectiveMaxAllowedPax || 0} max pax`],
                                                ].map(([label, value]) => (
                                                    <ReadOnlyMetric key={label} label={label} value={value} />
                                                ))}
                                            </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                    {isEdit && isEditingSection('details') && (
                                        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                                    Booking Type
                                                </div>
                                            </div>
                                            <StatusBadge tone="success">{isTransactionBookingMode ? 'Multi-unit booking' : 'Single-unit booking'}</StatusBadge>
                                        </div>
                                    )}
                                    {!isEdit && !unit && !isDayTour && (
                                        <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                                            <label className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    className="size-4 rounded border-[#d8c9b3]/70 accent-primary"
                                                    checked={useTransactionBooking}
                                                    onChange={e => {
                                                        const checked = e.target.checked;
                                                        setUseTransactionBooking(checked);
                                                        if (!checked && selectedUnitIds.length > 0) {
                                                            setForm((current) => ({ ...current, unit_id: selectedUnitIds[0] || '' }));
                                                        }
                                                    }}
                                                />
                                                Create one transaction booking with multiple unit blockers
                                            </label>
                                        </div>
                                    )}
                                    <div className={cn(twoColClass, isEditingSection('details') ? 'mb-4' : 'hidden')}>
                                        <div>
                                            <label className={fieldLabelClass}>Full Name</label>
                                            <Input className={inputClass} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required placeholder="Maria Clara" />
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Phone</label>
                                            <Input className={inputClass} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="0917-000-0000" />
                                        </div>
                                    </div>
                                    
                                    <div className={cn(twoColClass, isEditingSection('details') ? 'mb-4' : 'hidden')}>
                                        <div>
                                            <label className={fieldLabelClass}>Check-In Date</label>
                                            <Input className={inputClass} type="date" value={form.check_in} onChange={e => { setForm({...form, check_in: e.target.value}); setIsAutoPrice(true); }} required />
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Check-Out Date</label>
                                            <Input className={inputClass} type="date" value={form.check_out} onChange={e => { setForm({...form, check_out: e.target.value}); setIsAutoPrice(true); }} required disabled={isDayTour} />
                                        </div>
                                    </div>

                                    <div className={cn(twoColClass, isEditingSection('details') ? 'mb-4' : 'hidden')}>
                                        <div>
                                            <label className={fieldLabelClass}>Guests (Pax)</label>
                                            <Input className={cn(inputClass, effectiveMaxAllowedPax && form.guests > effectiveMaxAllowedPax && 'border-red-300 text-red-700 focus-visible:ring-red-200')}
                                                   type="text" inputMode="numeric" pattern="[0-9]*" value={form.guests}
                                                   onChange={e => { setForm({...form, guests: normalizeIntegerInput(e.target.value)}); setIsAutoPrice(true); }} required />
                                            {effectiveMaxAllowedPax && form.guests > effectiveMaxAllowedPax && (
                                                <div className="mt-1 text-xs font-black text-red-700">
                                                    Select more units: {capacityShortfall} pax capacity short.
                                                </div>
                                            )}
                                        </div>
                                        {!unit && !isTransactionEdit && (
                                            <div>
                                                <label className={fieldLabelClass}>Unit Category</label>
                                                <div className="relative">
                                                    <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                    <select
                                                        className={selectClass}
                                                        value={selectedRoomFamily}
                                                        onChange={e => {
                                                            setSelectedRoomFamily(e.target.value);
                                                            setForm({ ...form, unit_id: '' });
                                                            setSelectedUnitIds([]);
                                                            setIsAutoPrice(true);
                                                        }}
                                                    >
                                                        <option value="">All unit categories</option>
                                                        {roomTypeOptions.map(option => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                </div>
                                        </div>
                                    )}
                                    </div>
                                    <Card className={cn('rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]', isEditingSection('details') ? 'mb-4 block' : 'hidden')}>
                                        <CardContent className="p-5">
                                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <label className={fieldLabelClass}>{isTransactionEdit ? 'Linked Units' : 'Assigned Unit'}</label>
                                                </div>
                                                <StatusBadge tone={effectiveMaxAllowedPax && form.guests > effectiveMaxAllowedPax ? 'danger' : 'success'}>Max {effectiveMaxAllowedPax || 0} pax</StatusBadge>
                                            </div>
                                            {!unit && !isTransactionMode && !isTransactionEdit && (
                                                <label className="mb-4 flex items-center gap-3 text-sm font-bold text-muted-foreground">
                                                    <input
                                                        type="checkbox"
                                                        className="size-4 rounded border-[#d8c9b3]/70 accent-primary"
                                                        checked={assignLater}
                                                        onChange={e => {
                                                            const checked = e.target.checked;
                                                            setAssignLater(checked);
                                                            if (checked) {
                                                                setConflict(null);
                                                                setForm(current => ({ ...current, unit_id: '' }));
                                                            }
                                                        }}
                                                    />
                                                    Save as group hold and assign unit later
                                                </label>
                                            )}
                                            {!isTransactionMode && !isTransactionEdit && (
                                                <>
                                                    <div className="relative">
                                                        <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                        <select value={form.unit_id || unit?.unit_id} onChange={e => {
                                                            const selectedUnit = units.find(ux => ux.unit_id === e.target.value);
                                                            if (selectedUnit && unitConflictMap.has(selectedUnit.unit_id)) return;
                                                            setForm({...form, unit_id: e.target.value, room_type: selectedUnit?.room_type || selectedUnit?.room_type_id || ''});
                                                            setSelectedUnitIds(e.target.value ? [e.target.value] : []);
                                                        }} required={!assignLater} disabled={!!unit || assignLater} className={selectClass}>
                                                            <option value="">Select Unit...</option>
                                                            {units
                                                                .filter(u => !selectedRoomFamily || getRoomFamily(u.room_type || u.room_type_id) === selectedRoomFamily)
                                                                .map(u => (
                                                                <option key={u.unit_id} value={u.unit_id} disabled={unitConflictMap.has(u.unit_id)}>
                                                                    {getUnitOptionLabel(u)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                    </div>
                                                </>
                                            )}
                                            {isTransactionMode && (
                                                <div className="flex flex-col gap-3">
                                                    <label className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
                                                        <input
                                                            type="checkbox"
                                                            className="size-4 rounded border-[#d8c9b3]/70 accent-primary"
                                                            checked={assignLater}
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setAssignLater(checked);
                                                                if (checked) {
                                                                    setSelectedUnitIds([]);
                                                                }
                                                            }}
                                                        />
                                                        Save as assign-later queue items
                                                    </label>
                                                    {!assignLater && (
                                                        <div className={unitPickerShellClass}>
                                                            {roomTypeUnits.length === 0 && (
                                                                <div className="rounded-xl border border-dashed border-[#c8ae7c]/55 bg-[#fffaf1]/70 px-3 py-3 text-xs font-bold text-muted-foreground">
                                                                    Select a room type first to choose the units for this transaction.
                                                                </div>
                                                            )}
                                                            <div className={unitPickerGridClass}>
                                                                {roomTypeUnits.map((unitRow) => {
                                                                    const blockingBooking = unitConflictMap.get(unitRow.unit_id);
                                                                    const disabled = Boolean(blockingBooking);
                                                                    const checked = selectedUnitIds.includes(unitRow.unit_id);
                                                                    return (
                                                                        <label key={unitRow.unit_id} className={cn(unitOptionCardClass, checked ? 'border-primary/45 bg-primary/7 text-foreground shadow-[inset_3px_0_0_rgba(10,107,95,0.78)]' : 'border-[#eadfcd] bg-[#fffaf1]/66', disabled ? 'border-red-200 bg-red-50 text-red-700' : 'text-foreground hover:border-[#c8ae7c]/80 hover:bg-white')}>
                                                                            <input
                                                                                type="checkbox"
                                                                                className="size-4 accent-primary"
                                                                                checked={checked}
                                                                                disabled={disabled}
                                                                                onChange={e => {
                                                                                    const nextChecked = e.target.checked;
                                                                                    setSelectedUnitIds((current) => nextChecked
                                                                                        ? [...current, unitRow.unit_id]
                                                                                        : current.filter((value) => value !== unitRow.unit_id));
                                                                                }}
                                                                            />
                                                                            <span className="min-w-0">
                                                                                <span className="block truncate text-[0.78rem] font-black">{unitRow.unit_label || unitRow.unit_id}</span>
                                                                                <span className={cn('mt-0.5 block truncate text-[0.62rem] font-black uppercase tracking-normal', disabled ? 'text-red-700' : 'text-primary')}>
                                                                                    {getUnitCapacityLabel(unitRow, form.max_allowed_pax)}
                                                                                </span>
                                                                            </span>
                                                                            <span className={cn(unitMetaPillClass, disabled ? 'border-red-200 bg-red-100 text-red-700' : 'border-primary/18 bg-primary/5 text-primary')}>
                                                                                {disabled ? getUnitBlockerLabel(blockingBooking) : 'Available'}
                                                                            </span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {isTransactionEdit && (
                                                <div className="flex flex-col gap-3">
                                                    {loadingTransactionDetails ? (
                                                        <div className="text-xs font-bold text-muted-foreground">
                                                            Loading linked transaction units...
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="grid items-center gap-3 sm:grid-cols-[minmax(180px,1fr)_auto]">
                                                                <div className="relative">
                                                                    <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                                    <select
                                                                        className={selectClass}
                                                                        value={newTransactionUnitId}
                                                                        onChange={e => setNewTransactionUnitId(e.target.value)}
                                                                    >
                                                                        <option value="">Add another unit...</option>
                                                                        {(units || []).map((unitRow) => {
                                                                            const alreadySelected = transactionDraftUnits.some((selected) => String(selected.unit_id) === String(unitRow.unit_id));
                                                                            const blocked = unitConflictMap.has(unitRow.unit_id);
                                                                            return (
                                                                                <option key={unitRow.unit_id} value={unitRow.unit_id} disabled={alreadySelected || blocked}>
                                                                                    {alreadySelected
                                                                                        ? `Already assigned: ${unitRow.unit_label || unitRow.unit_id}`
                                                                                        : blocked
                                                                                            ? getUnitOptionLabel(unitRow)
                                                                                            : `${unitRow.unit_label || unitRow.unit_id}${unitRow.room_type || unitRow.room_type_id ? ` - ${unitRow.room_type || unitRow.room_type_id}` : ''} (${getUnitCapacityLabel(unitRow, 0)})`}
                                                                                </option>
                                                                            );
                                                                        })}
                                                                    </select>
                                                                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    onClick={handleTransactionItemAdd}
                                                                    disabled={syncing || !newTransactionUnitId}
                                                                    variant="outline"
                                                                    className="rounded-xl font-black"
                                                                >
                                                                    Add Unit
                                                                </Button>
                                                            </div>
                                                            <div className={unitPickerShellClass}>
                                                                {transactionUnitSummaries.length === 0 && (
                                                                    <div className="rounded-xl border border-dashed border-[#c8ae7c]/55 bg-[#fffaf1]/70 px-3 py-3 text-xs font-bold text-muted-foreground">
                                                                        No physical units are assigned yet. This transaction is still in assign-later mode.
                                                                    </div>
                                                                )}
                                                                {transactionUnitSummaries.map((item) => {
                                                                    const itemStatus = item.status || 'PENDING_VERIFICATION';
                                                                    const draft = itemDrafts[item.booking_item_id] || { unit_id: item.unit_id || '', status: itemStatus };
                                                                    const unitChoices = transactionUnitChoices[item.booking_item_id] || [];
                                                                    const unitChanged = String(draft.unit_id || '') !== String(item.unit_id || '');
                                                                    return (
                                                                        <div key={item.booking_item_id || `${item.unit_id}-${item.sequence_no || 'queue'}`} className="mb-2 flex flex-col gap-3 rounded-2xl border border-[#c8ae7c]/65 bg-[#fffdf8]/96 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_12px_28px_rgba(51,34,15,0.06)] last:mb-0">
                                                                            <div className="flex items-center justify-between gap-3 text-xs font-bold text-foreground">
                                                                                <span>{item.display_label}</span>
                                                                                <StatusBadge tone={itemStatus === 'CANCELLED' ? 'danger' : 'success'}>{itemStatus}</StatusBadge>
                                                                            </div>
                                                                            <div className="grid items-center gap-3 lg:grid-cols-[minmax(180px,1fr)_auto_auto]">
                                                                                <select
                                                                                    className={selectClass}
                                                                                    value={draft.unit_id || ''}
                                                                                    onChange={e => setItemDrafts((current) => ({
                                                                                        ...current,
                                                                                        [item.booking_item_id]: {
                                                                                            ...draft,
                                                                                            unit_id: e.target.value,
                                                                                            room_type: (() => {
                                                                                                const selectedUnitRow = (units || []).find((unitRow) => String(unitRow.unit_id) === String(e.target.value || ''));
                                                                                                return selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || item.room_type || '';
                                                                                            })()
                                                                                        }
                                                                                    }))}
                                                                                >
                                                                                    <option value="">No unit assigned</option>
                                                                                    {unitChoices.map((unitRow) => {
                                                                                        const blocked = unitConflictMap.has(unitRow.unit_id) && String(unitRow.unit_id) !== String(item.unit_id || '');
                                                                                        const isCurrentUnit = Boolean(unitRow.isCurrentSelection);
                                                                                        return (
                                                                                            <option key={unitRow.unit_id} value={unitRow.unit_id} disabled={blocked}>
                                                                                                {isCurrentUnit
                                                                                                    ? `Current: ${unitRow.unit_label || unitRow.unit_id}`
                                                                                                    : blocked
                                                                                                        ? getUnitOptionLabel(unitRow)
                                                                                                        : `${unitRow.unit_label || unitRow.unit_id}${unitRow.room_type || unitRow.room_type_id ? ` - ${unitRow.room_type || unitRow.room_type_id}` : ''} (${getUnitCapacityLabel(unitRow, 0)})`}
                                                                                            </option>
                                                                                        );
                                                                                    })}
                                                                                </select>
                                                                                <Button
                                                                                    type="button"
                                                                                    onClick={() => handleTransactionItemUpdate(item.booking_item_id)}
                                                                                    disabled={syncing || !unitChanged}
                                                                                    variant="outline"
                                                                                    className="rounded-xl font-black"
                                                                                >
                                                                                    Save Unit
                                                                                </Button>
                                                                                <Button
                                                                                    type="button"
                                                                                    onClick={() => handleTransactionItemUpdate(item.booking_item_id, {
                                                                                        status: itemStatus === 'CANCELLED' ? 'PENDING_VERIFICATION' : 'CANCELLED'
                                                                                    })}
                                                                                    disabled={syncing}
                                                                                    variant="outline"
                                                                                    className={cn('rounded-xl font-black', itemStatus === 'CANCELLED' ? 'border-primary/30 text-primary hover:bg-primary/5' : 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700')}
                                                                                >
                                                                                    {itemStatus === 'CANCELLED' ? 'Reopen' : 'Remove'}
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <div className="mb-6 hidden rounded-2xl border border-transparent bg-[#e7f5ef] shadow-[inset_4px_0_0_rgba(10,107,95,0.32)] p-5">
                                        <div className="mb-4 text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                            Group Booking Link
                                        </div>
                                        <div className={twoColClass}>
                                            <div>
                                                <label className={fieldLabelClass}>Group Code</label>
                                                <Input
                                                    className={inputClass}
                                                    value={form.group_code}
                                                    onChange={e => setForm({ ...form, group_code: e.target.value.toUpperCase() })}
                                                    placeholder="GRP-SALES-APR"
                                                />
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Group Name</label>
                                                <Input
                                                    className={inputClass}
                                                    value={form.group_name}
                                                    onChange={e => setForm({ ...form, group_name: e.target.value })}
                                                    placeholder="Sales Leadership Retreat"
                                                />
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Master Booking Ref</label>
                                                <Input
                                                    className={inputClass}
                                                    value={form.group_master_ref}
                                                    onChange={e => setForm({ ...form, group_master_ref: e.target.value.toUpperCase() })}
                                                    placeholder="Optional anchor booking ref"
                                                />
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Group Lane #</label>
                                                <Input
                                                    className={inputClass}
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    value={form.group_sequence}
                                                    onChange={e => setForm({ ...form, group_sequence: normalizeIntegerInput(e.target.value) })}
                                                    placeholder="1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isEdit && activeTab === 'units' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Units</div>
                                    {!isEditingSection('units') && (
                                        <Card className="mb-6 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                            <CardContent className="p-5">
                                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <div className="text-sm font-black text-foreground">Current unit setup</div>
                                                </div>
                                                <Button type="button" onClick={() => startEditingSection('units')} className="rounded-xl font-black">Edit</Button>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <ReadOnlyMetric label="Booking Type" value={isTransactionBookingMode ? 'Multi Booking' : 'Single Booking'} />
                                                <ReadOnlyMetric label="Units" value={createUnitSummary} />
                                                <ReadOnlyMetric label="Room Type" value={form.room_type || selectedUnit?.room_type || '-'} />
                                                <ReadOnlyMetric label="Capacity" value={`${effectiveMaxAllowedPax || 0} max pax`} />
                                            </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    <div className={cn('mb-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3', isEditingSection('units') ? 'block' : 'hidden')}>
                                        <div className="mb-3 text-[0.6rem] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                            Current Booking Type
                                        </div>
                                        <div className="inline-flex gap-2 rounded-full border border-primary/20 bg-[#fffdf8] p-1 shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
                                            <Button
                                                type="button"
                                                title="Booking type is set when the booking is created."
                                                variant={!isTransactionBookingMode ? 'default' : 'ghost'}
                                                className="h-9 rounded-full px-4 text-xs font-black"
                                            >
                                                Single Booking
                                            </Button>
                                            <Button
                                                type="button"
                                                title="Booking type is set when the booking is created."
                                                variant={isTransactionBookingMode ? 'default' : 'ghost'}
                                                className="h-9 rounded-full px-4 text-xs font-black"
                                            >
                                                Multi Booking
                                            </Button>
                                        </div>
                                    </div>

                                    <div className={cn(twoColClass, isEditingSection('units') ? 'mb-5' : 'hidden')}>
                                        {!unit && !isTransactionEdit && (
                                            <div>
                                                <label className={fieldLabelClass}>Room Type</label>
                                                <div className="relative">
                                                    <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                    <select
                                                        className={selectClass}
                                                        value={form.room_type || selectedRoomFamily}
                                                        onChange={e => {
                                                            const nextType = e.target.value;
                                                            setForm({ ...form, room_type: nextType });
                                                            setSelectedRoomFamily(getRoomFamily(nextType) || nextType);
                                                        }}
                                                    >
                                                        <option value="">Select Room Type...</option>
                                                        {roomTypeOptions.map(option => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                </div>
                                            </div>
                                        )}

                                        {!isTransactionBookingMode && (
                                            <div>
                                                <label className={fieldLabelClass}>Assigned Unit</label>
                                                {!unit && (
                                                    <div className="relative">
                                                        <Home size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                        <select
                                                            className={selectClass}
                                                            value={form.unit_id || unit?.unit_id}
                                                            onChange={e => {
                                                                const selectedUnitRow = units.find(ux => ux.unit_id === e.target.value);
                                                                if (selectedUnitRow && unitConflictMap.has(selectedUnitRow.unit_id)) return;
                                                                setForm({...form, unit_id: e.target.value, room_type: selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || ''});
                                                                setSelectedUnitIds(e.target.value ? [e.target.value] : []);
                                                                setSelectedRoomFamily(getRoomFamily(selectedUnitRow?.room_type || selectedUnitRow?.room_type_id || ''));
                                                            }}
                                                        >
                                                            <option value="">Select Unit...</option>
                                                            {units.map(u => (
                                                                <option key={u.unit_id} value={u.unit_id} disabled={unitConflictMap.has(u.unit_id)}>
                                                                    {getUnitOptionLabel(u)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                    </div>
                                                )}
                                                {unit && (
                                                    <div className="flex h-11 items-center rounded-xl border border-[#d8c9b3]/70 bg-primary/5 px-3 text-sm font-black text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
                                                        {unit.unit_label || unit.unit_id}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {isTransactionBookingMode && (
                                        <div className={cn('flex-col gap-3', isEditingSection('units') ? 'flex' : 'hidden')}>
                                            <label className={fieldLabelClass}>Linked Units</label>
                                            {isTransactionEdit ? (
                                                loadingTransactionDetails ? (
                                                    <div className="text-xs font-bold text-muted-foreground">Loading units...</div>
                                                ) : (
                                                    <div className="max-h-64 overflow-y-auto rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] p-3">
                                                        {transactionUnitSummaries.length === 0 && (
                                                            <div className="text-xs font-bold text-muted-foreground">No units are linked yet.</div>
                                                        )}
                                                        {transactionUnitSummaries.map((item) => {
                                                            const itemStatus = item.status || 'PENDING_VERIFICATION';
                                                            const draft = itemDrafts[item.booking_item_id] || { unit_id: item.unit_id || '', status: itemStatus };
                                                            const unitChoices = transactionUnitChoices[item.booking_item_id] || [];
                                                            return (
                                                                <div key={item.booking_item_id || `${item.unit_id}-${item.sequence_no || 'unit'}`} className="grid items-center gap-3 border-b border-[#d8c9b3]/60 py-3 last:border-b-0 sm:grid-cols-[minmax(180px,1fr)_auto]">
                                                                    <select
                                                                        className={selectClass}
                                                                        value={draft.unit_id || ''}
                                                                        onChange={e => setItemDrafts((current) => ({
                                                                            ...current,
                                                                            [item.booking_item_id]: { ...draft, unit_id: e.target.value }
                                                                        }))}
                                                                    >
                                                                        <option value="">Assign later</option>
                                                                        {unitChoices.map((unitRow) => {
                                                                            const blocked = unitConflictMap.has(unitRow.unit_id) && String(unitRow.unit_id) !== String(item.unit_id || '');
                                                                            return (
                                                                                <option key={unitRow.unit_id} value={unitRow.unit_id} disabled={blocked}>
                                                                                    {blocked ? getUnitOptionLabel(unitRow) : (unitRow.unit_label || unitRow.unit_id)}
                                                                                </option>
                                                                            );
                                                                        })}
                                                                    </select>
                                                                    <StatusBadge tone={itemStatus === 'CANCELLED' ? 'danger' : 'success'}>{itemStatus}</StatusBadge>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )
                                            ) : (
                                                <div className="max-h-64 overflow-y-auto rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-3 py-2">
                                                    {roomTypeUnits.map((unitRow) => {
                                                        const blockingBooking = unitConflictMap.get(unitRow.unit_id);
                                                        const disabled = Boolean(blockingBooking);
                                                        const checked = selectedUnitIds.includes(unitRow.unit_id);
                                                        return (
                                                            <label key={unitRow.unit_id} className={cn('flex items-center justify-between gap-3 border-b border-[#d8c9b3]/60 py-2 text-xs font-bold last:border-b-0', disabled ? 'text-red-700' : 'text-foreground')}>
                                                                <span className="flex items-center gap-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="size-4 rounded border-[#d8c9b3]/70 accent-primary"
                                                                        checked={checked}
                                                                        disabled={disabled}
                                                                        onChange={e => {
                                                                            const nextChecked = e.target.checked;
                                                                            setSelectedUnitIds((current) => nextChecked
                                                                                ? [...current, unitRow.unit_id]
                                                                                : current.filter((value) => value !== unitRow.unit_id));
                                                                        }}
                                                                    />
                                                                    <span>{unitRow.unit_label || unitRow.unit_id}</span>
                                                                </span>
                                                                <span className={cn('text-[0.65rem] font-black', disabled ? 'text-red-700' : 'text-primary')}>
                                                                    {disabled ? `Booked by ${getUnitBlockerLabel(blockingBooking)}` : 'Available'}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'charges' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Charges & Add-ons</div>
                                    {isEdit && !isEditingSection('charges') && (
                                        <Card className="mb-5 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                            <CardContent className="p-5">
                                            <div className="mb-4 flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-black text-foreground">Current charges</div>
                                                </div>
                                                <Button type="button" onClick={() => startEditingSection('charges')} className="rounded-xl font-black">Edit</Button>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <ReadOnlyMetric label="Room Total" value={`P${Number(form.total_price || 0).toLocaleString()}`} />
                                                <ReadOnlyMetric label="Discount" value={`P${appliedDiscount.toLocaleString()}`} tone={appliedDiscount > 0 ? 'warning' : 'neutral'} />
                                                <ReadOnlyMetric label="Add-ons" value={`P${Number(form.addon_amount || 0).toLocaleString()}`} />
                                                <ReadOnlyMetric label="Grand Total" value={`P${grossTotal.toLocaleString()}`} />
                                                <ReadOnlyMetric label="Pricing" value={isAutoPrice ? 'Auto' : 'Manual'} />
                                            </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                    
                                    <div className={cn('mb-6 rounded-2xl border border-[#d8c9b3]/70 bg-[#fff8ec]/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]', isEditingSection('charges') ? 'grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]' : 'hidden')}>
                                        <div>
                                            <div className="mb-3 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">Rate & Discount</div>
                                            <label className={fieldLabelClass}>Base Booking Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input
                                                    className={moneyInputClass}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={form.total_price}
                                                    onChange={e => {
                                                        setForm({ ...form, total_price: normalizeMoneyInput(e.target.value) });
                                                        setIsAutoPrice(false);
                                                        priceDirty.current = true;
                                                    }}
                                                />
                                            </div>
                                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <label className={fieldLabelClass}>Calculated Rate</label>
                                                    <div className="flex min-h-11 items-center rounded-xl border border-[#d8c9b3]/70 bg-[#fffdf8] px-3 text-sm font-black text-foreground">
                                                        P{calculatedBookingTotal.toLocaleString()}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className={fieldLabelClass}>Applied Discount</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                        <Input
                                                            className={moneyInputClass}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={appliedDiscount > 0 ? String(appliedDiscount) : ''}
                                                            onChange={e => handleApplyDiscount(e.target.value)}
                                                            placeholder="0"
                                                            disabled={calculatedBookingTotal <= 0}
                                                        />
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {[10, 20, 50].map((percent) => (
                                                            <Button
                                                                key={percent}
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleApplyDiscountPercent(percent)}
                                                                disabled={calculatedBookingTotal <= 0}
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
                                                                onChange={e => handleApplyDiscountPercent(normalizeMoneyInput(e.target.value))}
                                                                disabled={calculatedBookingTotal <= 0}
                                                            />
                                                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] font-black text-muted-foreground">%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-start justify-end">
                                            <StatusBadge tone={isAutoPrice ? 'success' : 'warning'}>{isAutoPrice ? 'AUTO PRICE' : 'MANUAL TOTAL'}</StatusBadge>
                                        </div>
                                    </div>

                                    <div className={cn('mb-6 rounded-2xl border border-[#c7dfd3]/80 bg-[#f3fbf6]/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]', isEditingSection('charges') ? 'block' : 'hidden')}>
                                        <div className="mb-3 text-[0.58rem] font-black uppercase tracking-[0.12em] text-primary">Add-ons & Extra Charges</div>
                                        <label className={fieldLabelClass}>Preset Charge</label>
                                        <div className="mb-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
                                            <div className="relative">
                                                <PlusCircle className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                                <select className={selectClass} defaultValue="" onChange={e => {
                                                    handlePresetCharge(e.target.value);
                                                    e.target.value = '';
                                                }}>
                                                    <option value="">Select quick charge...</option>
                                                    <optgroup label="Stay Adjustments">
                                                        <option value="Early Check-In|500">Early Check-In (P500)</option>
                                                        <option value="Late Check-Out|500">Late Check-Out (P500)</option>
                                                        <option value="Extra Pax|500">Extra Person (P500)</option>
                                                    </optgroup>
                                                    <optgroup label="Amenities & Rentals">
                                                        <option value="Kitchen Rental|300">Kitchen Rental (P300)</option>
                                                        <option value="Bonfire Set|300">Bonfire Set (P300)</option>
                                                        <option value="Extra Towel|100">Extra Towel (P100)</option>
                                                        <option value="Charcoal|100">Charcoal (P100)</option>
                                                    </optgroup>
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                        </div>

                                        <label className={fieldLabelClass}>Custom Charge</label>
                                        <div className="grid items-end gap-3 md:grid-cols-[1.6fr_1fr_auto]">
                                            <div>
                                                <Input
                                                    className={inputClass}
                                                    value={customChargeName}
                                                    onChange={e => setCustomChargeName(e.target.value)}
                                                    placeholder="Example: Corkage, damaged towel, special setup"
                                                />
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input
                                                    className={moneyInputClass}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={customChargeAmount}
                                                    onChange={e => setCustomChargeAmount(normalizeMoneyInput(e.target.value))}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={handleAddCustomCharge}
                                                className="rounded-xl font-black"
                                            >
                                                Add Charge
                                            </Button>
                                        </div>
                                    </div>

                                    <div className={cn('mb-5 rounded-2xl border border-[#d8c9b3]/70 bg-[#fffdf8]/88 p-4', isEditingSection('charges') ? 'block' : 'hidden')}>
                                        <label className={fieldLabelClass}>Billing Notes</label>
                                        <Textarea 
                                            className={textareaClass}
                                            placeholder="Add context for add-ons, special agreements, or manual billing notes..."
                                            value={form.notes}
                                            onChange={e => setForm({...form, notes: e.target.value})}
                                        />
                                        </div>

                                    <div className={cn(twoColClass, !isEditingSection('charges') && 'hidden')}>
                                        <div>
                                            <label className={fieldLabelClass}>Total Adjustments (Addon)</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                <Input 
                                                    className={moneyInputClass}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={form.addon_amount} 
                                                    onChange={e => {
                                                        const val = parseFloat(normalizeMoneyInput(e.target.value));
                                                        setForm({ ...form, addon_amount: isNaN(val) ? 0 : val });
                                                    }} 
                                                    placeholder="0.00" 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'payments' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Payments</div>
                                    {isEdit && !isEditingSection('payments') && (
                                        <Card className="mb-5 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                            <CardContent className="p-5">
                                            <div className="mb-4 flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-black text-foreground">Current payment state</div>
                                                </div>
                                                <Button type="button" onClick={() => startEditingSection('payments')} className="rounded-xl font-black">Edit</Button>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <ReadOnlyMetric label="Total Bill" value={`P${grossTotal.toLocaleString()}`} />
                                                <ReadOnlyMetric label="Discount" value={`P${appliedDiscount.toLocaleString()}`} tone={appliedDiscount > 0 ? 'warning' : 'neutral'} />
                                                <ReadOnlyMetric label="Paid" value={`P${masterTotalPaid.toLocaleString()}`} tone="success" />
                                                <ReadOnlyMetric label="Balance" value={`P${currentBalance.toLocaleString()}`} tone={currentBalance > 0 ? 'danger' : 'success'} />
                                                <ReadOnlyMetric label="Payment Status" value={currentBalance > 0 ? 'Unpaid / Partial' : 'Paid'} />
                                            </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                    
                                    <div className={cn(isEditingSection('payments') ? 'grid gap-4' : 'hidden')}>
                                        <section className="grid gap-4 rounded-2xl border border-[#d8c9b3]/70 bg-[#fff8ec]/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] md:grid-cols-2">
                                            <div className="md:col-span-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">Rate & Discount</div>
                                            <div>
                                                <label className={fieldLabelClass}>Calculated Rate</label>
                                                <div className="flex min-h-11 items-center rounded-xl border border-[#d8c9b3]/70 bg-[#fffdf8] px-3 text-sm font-black text-foreground">
                                                    P{calculatedBookingTotal.toLocaleString()}
                                                </div>
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Applied Discount</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">P</span>
                                                    <Input
                                                        className={moneyInputClass}
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={appliedDiscount > 0 ? String(appliedDiscount) : ''}
                                                        onChange={e => handleApplyDiscount(e.target.value)}
                                                        placeholder="0"
                                                        disabled={calculatedBookingTotal <= 0}
                                                    />
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {[10, 20, 50].map((percent) => (
                                                        <Button
                                                            key={percent}
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleApplyDiscountPercent(percent)}
                                                            disabled={calculatedBookingTotal <= 0}
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
                                                            onChange={e => handleApplyDiscountPercent(normalizeMoneyInput(e.target.value))}
                                                            disabled={calculatedBookingTotal <= 0}
                                                        />
                                                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] font-black text-muted-foreground">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                        <section className="grid gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.64)] md:grid-cols-2">
                                            <div className="md:col-span-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-primary">Payment Received</div>
                                            <div>
                                                <label className={fieldLabelClass}>Record New Payment</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-primary">P</span>
                                                    <Input className={cn(moneyInputClass, 'border-primary/40 bg-primary/5')} type="text" inputMode="decimal"
                                                        value={form.new_payment || ''} 
                                                        onChange={e => setForm({...form, new_payment: normalizeMoneyInput(e.target.value)})}
                                                        placeholder="Enter amount to add..." 
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className={fieldLabelClass}>Payment Method</label>
                                                <select className={selectClass} value={form.payment_method || 'Cash'} onChange={e => setForm({...form, payment_method: e.target.value})}>
                                                    {['Cash', 'GCash', 'Bank Transfer', 'Credit Card'].map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                        </section>
                                    </div>

                                    <div className={cn('mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-[#fffdf8]/80 p-4', isEditingSection('payments') ? 'flex' : 'hidden')}>
                                        <Button
                                            type="button"
                                            onClick={handleFillFullPayment}
                                            disabled={grossTotal <= 0 || currentBalance <= 0}
                                            variant="outline"
                                            className="rounded-xl border-primary/30 text-xs font-black text-primary hover:bg-primary/5"
                                        >
                                            Fill Remaining Balance
                                        </Button>
                                    </div>

                                    <div className={cn('mt-4', isEditingSection('payments') ? 'block' : 'hidden')}>
                                        <label className={fieldLabelClass}>Total Settled Funds</label>
                                        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 text-base font-black text-primary">
                                            <span>P{(Number(form.amount_paid) + Number(form.new_payment || 0) + Number(form.initial_payment || 0)).toLocaleString()}</span>
                                            {Number(form.new_payment) > 0 && <span className="text-xs font-bold text-primary/70">(Includes +P{Number(form.new_payment).toLocaleString()} new)</span>}
                                        </div>
                                    </div>

                                </div>
                            )}

                            {activeTab === 'extension' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Stay Extension</div>
                                    
                                    <Card className="mb-6 rounded-2xl border-primary/20 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                        <CardContent className="p-5 sm:p-6">
                                        <label className={fieldLabelClass}>Add Extra Nights</label>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            {[1, 2, 3, 7].map(n => (
                                                <Button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => handleExtend(n)}
                                                    variant="outline"
                                                    className="h-12 rounded-xl border-primary/30 bg-[#fffdf8] text-sm font-black text-primary shadow-[0_10px_22px_rgba(19,33,31,0.045)] hover:bg-primary/5"
                                                >
                                                    +{n} {n===1?'Night':'Nights'}
                                                </Button>
                                            ))}
                                        </div>
                                        </CardContent>
                                    </Card>
                                    
                                </div>
                            )}

                            {activeTab === 'checkout' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Checkout</div>
                                    
                                    <Card className="rounded-2xl border-transparent bg-[#f7eedf]/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                        <CardContent className="p-5 sm:p-6">
                                        <label className={fieldLabelClass}>Departure Status</label>
                                        
                                        {(() => {
                                            const totalBill = Number(form.total_price) + Number(form.addon_amount);
                                            const totalPaid = Number(form.amount_paid) + Number(form.new_payment || 0) + Number(form.initial_payment || 0);
                                            const balance = totalBill - totalPaid;
                                            const isCleared = balance <= 0;

                                            if (!isCleared) {
                                                return (
                                                    <div className="py-6 text-center">
                                                        <StatusBadge tone="danger">Stop</StatusBadge>
                                                        <div className="mt-4 text-base font-black text-red-700">Balance Still Due</div>
                                                        <p className="mx-auto mb-5 mt-2 max-w-md text-xs font-bold leading-relaxed text-muted-foreground">The system cannot release this room until the final balance of P{balance.toLocaleString()} is fully settled.</p>
                                                        <Button type="button" onClick={() => {
                                                            startEditingSection('payments');
                                                            setActiveTab('payments');
                                                        }}
                                                            className="rounded-xl bg-red-700 font-black text-white shadow-[0_16px_36px_rgba(19,33,31,0.06)] hover:bg-red-800">
                                                            Go To Payments
                                                        </Button>
                                                    </div>
                                                );
                                            }

                                            if (form.status === 'CHECKED_OUT') {
                                                return (
                                                    <div className="py-6 text-center">
                                                        <StatusBadge tone="success">Done</StatusBadge>
                                                        <div className="mt-4 text-base font-black text-primary">Checkout Complete</div>
                                                        <p className="mx-auto mt-2 max-w-md text-xs font-bold leading-relaxed text-muted-foreground">This unit has been officially released to the "Available" pool.</p>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                                    <div className="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-bold leading-relaxed text-primary">
                                                        <span className="font-black">Ready</span>
                                                        <span>Balance is settled. You can mark the booking checked out.</span>
                                                    </div>

                                                    {checkoutStep === 1 ? (
                                                        <Button 
                                                            type="button" 
                                                            onClick={() => setCheckoutStep(2)} 
                                                            className="h-12 w-full rounded-2xl bg-foreground text-sm font-black text-background shadow-[0_16px_36px_rgba(19,33,31,0.06)] hover:bg-foreground/90">
                                                            Start Checkout
                                                        </Button>
                                                    ) : (
                                                        <div className="text-center">
                                                            <div className="mb-4 text-[0.65rem] font-black uppercase tracking-[0.12em] text-red-700">Confirm Checkout</div>
                                                            <div className="flex flex-col gap-3 sm:flex-row">
                                                                <Button type="button" variant="outline" onClick={() => setCheckoutStep(1)} className="flex-1 rounded-xl font-black">Wait, Go Back</Button>
                                                                <Button 
                                                                    type="button" 
                                                                    onClick={() => setForm({...form, status: 'CHECKED_OUT'})} 
                                                                    className="flex-[2] rounded-xl bg-red-700 font-black text-white shadow-[0_16px_36px_rgba(19,33,31,0.06)] hover:bg-red-800">
                                                                    CONFIRM OFFICIAL RELEASE
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        </CardContent>
                                    </Card>
                                    
                                    <div className="mt-5 flex items-center gap-3 px-2">
                                        <input type="checkbox" defaultChecked id="release-unit" className="size-4 rounded border-[#d8c9b3]/70 accent-primary" />
                                        <label htmlFor="release-unit" className="text-xs font-bold leading-relaxed text-muted-foreground">Auto-release physical unit to "Ready/Available" status</label>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'actions' && (
                                <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                                    <div className="mb-5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-muted-foreground">Admin Controls</div>
                                    <div className={twoColClass}>
                                        <div>
                                            <label className={fieldLabelClass}>Booking Source</label>
                                        <div className="relative">
                                            <Globe size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <select className={selectClass} value={form.booking_source} onChange={e => setForm({...form, booking_source: e.target.value})}>
                                                {['Direct', 'Facebook', 'Messenger', 'Walk-in', 'Referral'].map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={fieldLabelClass}>System Status</label>
                                        <div className="relative">
                                            <Activity size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <select className={selectClass} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                                                {[
                                                    ['PENDING_VERIFICATION', 'Pending Verification'],
                                                    ['RESERVED', 'Reserved'],
                                                    ['CHECKED_IN', 'Checked In'],
                                                    ['CANCELLED', 'Cancelled'],
                                                    ['CHECKED_OUT', 'Checked Out'],
                                                ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                            </select>
                                            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        </div>
                                    </div>
                                    </div>
                                    <div className="mt-5">
                                        <label className={fieldLabelClass}>Internal Staff Notes</label>
                                        <Textarea className={textareaClass} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Billing details, special requests details, etc..." />
                                    </div>
                                    <div className="mt-5">
                                        <label className={fieldLabelClass}>Guest Special Requests</label>
                                        <Textarea className={textareaClass} value={form.special_requests} onChange={e => setForm({...form, special_requests: e.target.value})} placeholder="Requests from the guest side..." />
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-relaxed text-red-700">
                                    {error}
                                </div>
                            )}

                            {!isEdit && activeTab === 'review' && !createSaveReady && (
                                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                                    Add a valid stay window and at least one available unit before creating the booking. Guest details and payment can stay blank for a walk-in draft.
                                </div>
                            )}

                            <div className="mt-10 flex flex-col gap-3 border-t border-[#d8c9b3]/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex gap-2">
                                    <Button type="button" variant="ghost" onClick={onClose} className="font-black">Close</Button>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    {mode === 'edit' && !isTransactionEdit && (
                                        <Button
                                            type="button" 
                                            onClick={handleDelete} 
                                            disabled={deleting || saving}
                                            variant="outline"
                                            className="rounded-xl border-red-200 font-black text-red-700 hover:bg-red-50 hover:text-red-700"
                                        >
                                            {deleting ? 'Purging...' : 'Permanently Delete'}
                                        </Button>
                                    )}

                                    {!isEdit && (
                                        <>
                                            {createTabIndex > 0 && (
                                                <Button type="button" variant="outline" onClick={() => goToCreateStep(-1)}
                                                    className="rounded-xl font-black">
                                                    Back
                                                </Button>
                                            )}

                                            {activeTab !== 'review' ? (
                                                <Button type="button" onClick={() => goToCreateStep(1)}
                                                    className="rounded-xl font-black">
                                                    Continue
                                                </Button>
                                            ) : (
                                                <Button type="button" onClick={() => handleSubmit(null, true)} disabled={saving || deleting || !createSaveReady}
                                                    className="rounded-xl font-black">
                                                    {saving ? 'Creating...' : 'Create Booking'}
                                                </Button>
                                            )}
                                        </>
                                    )}

                                    {isEdit && (
                                        <Button type="button" onClick={() => handleSubmit(null, true)} disabled={saving || deleting} 
                                            className="rounded-xl font-black">
                                            {saving ? 'Saving...' : 'Save Booking'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            
                            {lastSynced && (
                                <div className="mt-4 text-center text-xs font-black text-primary">
                                    System synchronization successful. Dashboard updated.
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Right Pane: Summary Sidebar (40%) */}
                    <aside className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#fffdf8_0%,#fff8ea_48%,#f4fbf7_100%)] px-4 py-4 shadow-[inset_1px_0_0_rgba(255,255,255,0.74)]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-[#8b7353]">Booking Summary</div>
                            <StatusBadge tone={currentBalance > 0 ? 'warning' : 'success'}>
                                {currentBalance > 0 ? 'Balance Due' : 'Cleared'}
                            </StatusBadge>
                        </div>
                        
                        <div className="flex flex-col gap-3">
                            <Card className="overflow-hidden rounded-[22px] border border-[#d8c9b3]/80 bg-[#fffdf8]/96 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_42px_rgba(19,33,31,0.08)]">
                                <CardContent className="relative p-4">
                                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#c6923f,#0a6b5f)]" />
                                <div className="text-[0.55rem] font-black uppercase tracking-[0.14em] text-[#8b7353]">Total Bill (Gross)</div>
                                <div className="my-1.5 font-resortDisplay text-[2rem] font-black leading-none text-foreground">
                                    P{grossTotal.toLocaleString()}
                                </div>
                                <progress
                                    className="mt-3 h-2 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-[#eadcc6] [&::-webkit-progress-value]:bg-primary"
                                    value={grossTotal > 0 ? Math.min(100, (masterTotalPaid / grossTotal) * 100) : 0}
                                    max={100}
                                    aria-label="Payment progress"
                                />
                                <div className="mt-2.5 flex justify-between gap-3 text-[0.68rem] font-black">
                                    <span className="text-primary">Paid: P{masterTotalPaid.toLocaleString()}</span>
                                    <span className={currentBalance > 0 ? 'text-red-700' : 'text-primary'}>
                                        Due: P{currentBalance.toLocaleString()}
                                    </span>
                                </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-[20px] border border-[#d8c9b3]/65 bg-[#fffdf8]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_12px_28px_rgba(19,33,31,0.055)]">
                                <CardContent className="p-3.5">
                                <div className="mb-3 text-[0.52rem] font-black uppercase tracking-[0.14em] text-[#8b7353]">Booking Snapshot</div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <SummaryMini label="Guest" value={form.full_name || 'Not set'} />
                                    <SummaryMini label="Reference" value={form.booking_ref || 'Pending'} tone="success" />
                                    <SummaryMini label={isTransactionBookingMode ? 'Units' : 'Unit'} value={createUnitSummary} />
                                    <SummaryMini label="Status" value={form.status} />
                                    <SummaryMini label="Stay" value={`${safeFmt(form.check_in)} to ${safeFmt(form.check_out)}`} />
                                    <SummaryMini label="Pax / Nights" value={`${form.guests || 0} pax / ${nights} ${nights === 1 ? 'night' : 'nights'}`} />
                                    <SummaryMini label="Booking Type" value={isTransactionBookingMode ? 'Multi-booking' : 'Single booking'} />
                                    <SummaryMini label="Capacity" value={`${effectiveMaxAllowedPax || 0} max pax`} />
                                </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-[20px] border border-[#d8c9b3]/65 bg-[#fffdf8]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_12px_28px_rgba(19,33,31,0.055)]">
                                <CardContent className="p-3.5">
                                <div className="mb-3 text-[0.52rem] font-black uppercase tracking-[0.14em] text-[#8b7353]">Money Breakdown</div>
                                <div className="flex flex-col gap-2">
                                    <MoneyMini label="Base amount" value={`P${Number(form.total_price || 0).toLocaleString()}`} />
                                    <MoneyMini label="Add-ons" value={`P${Number(form.addon_amount || 0).toLocaleString()}`} />
                                    <MoneyMini label="Recorded paid" value={`P${masterTotalPaid.toLocaleString()}`} tone="success" />
                                    <div className="flex justify-between gap-3 border-t border-[#d8c9b3]/70 pt-2.5 text-[0.78rem] font-black">
                                        <span>Balance due</span>
                                        <span className={currentBalance > 0 ? 'text-red-700' : 'text-primary'}>P{currentBalance.toLocaleString()}</span>
                                    </div>
                                </div>
                                </CardContent>
                            </Card>

                        </div>
                    </aside>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SummaryMini({ label, value, tone = 'neutral' }) {
    return (
        <div className="text-[0.68rem] font-bold leading-tight">
            <span className="text-muted-foreground">{label}</span>
            <div className={cn('mt-1 [overflow-wrap:anywhere] font-black text-foreground', tone === 'success' && 'text-primary')}>
                {value || '-'}
            </div>
        </div>
    );
}

function ReadOnlyMetric({ label, value, tone = 'neutral' }) {
    return (
        <div className="rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-4 py-3">
            <div className="mb-1 text-[0.6rem] font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
            <div className={cn(
                '[overflow-wrap:anywhere] text-sm font-black text-foreground',
                tone === 'success' && 'text-primary',
                tone === 'danger' && 'text-red-700',
                tone === 'warning' && 'text-amber-700',
            )}>
                {value || '-'}
            </div>
        </div>
    );
}

function MoneyMini({ label, value, tone = 'neutral' }) {
    return (
        <div className={cn('flex justify-between gap-3 text-[0.68rem] font-bold text-foreground', tone === 'success' && 'text-primary')}>
            <span>{label}</span>
            <span className="font-black">{value}</span>
        </div>
    );
}
