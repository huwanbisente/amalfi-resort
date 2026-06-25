import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { ChevronDown, Package, PlusCircle, X } from 'lucide-react';
import { api } from '../utils/api';
import { addDaysToDateOnly, getManilaTodayKey } from '../utils/manilaDate';
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
import { textareaClass } from '@/components/shared/formStyles';
import { cn } from '@/lib/utils';

const SPECIAL_ADD_ONS = [
    { id: 'kitchen', label: 'Kitchen Package', price: 300 },
    { id: 'bonfire', label: 'Bonfire Set', price: 300 },
    { id: 'fan', label: 'Electric Fan', price: 200 },
    { id: 'grill', label: 'Grill & Charcoal', price: 150 },
    { id: 'foam', label: 'Extra Foam/Bed', price: 250 }
];

const safeFmt = (str, fmtStr = 'MMM dd, yyyy') => {
    if (!str) return 'â€”';
    try {
        const d = parseISO(str);
        if (!isValid(d)) return 'â€”';
        return format(d, fmtStr);
    } catch { return 'â€”'; }
};

const fieldLabelClass = 'text-[0.68rem] font-black uppercase tracking-[0.12em] text-muted-foreground';
const inputClass = 'h-11 rounded-xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] font-semibold text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)]';
const selectClass = 'h-11 w-full rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-3 text-sm font-semibold text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)] outline-none transition focus:border-primary focus:ring-1 focus:ring-primary';
const specialTabTriggerClass = 'rounded-xl border border-[#d8c9b3]/80 bg-[#fffdf8]/78 text-[0.72rem] font-black text-[#5f6d66] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[#c6923f]/70 hover:bg-[#fff7e6] hover:text-[#70480f] data-[state=active]:border-[#0a6b5f] data-[state=active]:bg-[linear-gradient(180deg,#0d766a_0%,#075f55_100%)] data-[state=active]:text-[#fffdf8] data-[state=active]:shadow-[0_8px_18px_rgba(10,107,95,0.18),inset_0_1px_0_rgba(255,255,255,0.22)]';

function normalizeMoneyInput(value) {
    const cleaned = String(value ?? '').replace(/[^\d.]/g, '');
    const [whole = '', ...decimalParts] = cleaned.split('.');
    const normalizedWhole = whole ? String(Number(whole)) : '';
    const decimal = decimalParts.join('').slice(0, 2);
    if (!normalizedWhole && decimal) return `0.${decimal}`;
    if (!normalizedWhole) return '';
    return decimalParts.length ? `${normalizedWhole}.${decimal}` : normalizedWhole;
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

export function TentBookingModal({ 
    mode = 'add', 
    initialData = null, 
    onSaved, 
    onClose, 
    onRefresh 
}) {
    const isEdit = mode === 'edit';
    const [activeTab, setActiveTab] = useState(isEdit ? 'summary' : 'registry');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    const handleDelete = async () => {
        if (!window.confirm(`Danger: You are about to permanently remove the special booking entry for ${form.full_name} (${form.booking_ref}).\n\nThis will purge all financial records for this stay. This action is irreversible.\n\nAre you absolutely sure?`)) return;

        setDeleting(true);
        setError('');

        try {
            const data = await api.delete(`/api/v1/admin/bookings/${form.booking_ref}`);
            if (data) {
                setSuccess(true);
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
    const [success, setSuccess] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [discountTouched, setDiscountTouched] = useState(false);

    const [form, setForm] = useState({
        booking_ref: `${initialData?.booking_type === 'day_tour' ? 'DTR' : 'TPC'}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        full_name: '',
        phone: '',
        email: '',
        guests: 2,
        check_in: initialData?.check_in || getManilaTodayKey(),
        check_out: initialData?.check_out || (initialData?.booking_type === 'day_tour' ? (initialData?.check_in || getManilaTodayKey()) : addDaysToDateOnly(getManilaTodayKey(), 1)),
        addon_amount: 0,
        total_price: 0,
        amount_paid: 0,
        payment_method: 'Cash',
        notes: '',
        special_requests: '',
        status: 'RESERVED',
        booking_type: initialData?.booking_type || 'tent_pitching',
        unit_id: initialData?.booking_type === 'day_tour' ? 'DAYTOUR' : 'CAMP-ZONE',
        selected_rentals: [] // selected add-on IDs
    });

    // Initialize Edit Data
    useEffect(() => {
        if (isEdit && initialData) {
            setForm({
                ...initialData,
                check_in: String(initialData.check_in || '').split('T')[0],
                check_out: String(initialData.check_out || initialData.check_in || '').split('T')[0],
                guests: Number(initialData.guests || 1),
                addon_amount: Number(initialData.addon_amount || 0),
                total_price: Number(initialData.total_price || 0),
                amount_paid: Number(initialData.amount_paid || 0),
            });
            setDiscountTouched(true);
        }
    }, [isEdit, initialData]);

    // Financial Calculations
    const nights = useMemo(() => {
        const ci = parseISO(form.check_in);
        const co = parseISO(form.check_out);
        return (isValid(ci) && isValid(co)) ? Math.max(1, differenceInCalendarDays(co, ci)) : 1;
    }, [form.check_in, form.check_out]);

    const isDayTour = form.booking_type === 'day_tour';
    const specialLabel = isDayTour ? 'Day Tour' : 'Tent Pitching';
    const basePrice = (isDayTour ? 350 : 500) * Number(form.guests || 0) * (isDayTour ? 1 : nights);
    const agreedBasePrice = Number(form.total_price || 0);
    const appliedDiscount = Math.max(0, Number((basePrice - agreedBasePrice).toFixed(2)));

    useEffect(() => {
        if (discountTouched) return;
        setForm((current) => (
            Number(current.total_price || 0) === basePrice ? current : { ...current, total_price: basePrice }
        ));
    }, [basePrice, discountTouched]);

    const rentalTotal = useMemo(() => {
        return (form.selected_rentals || []).reduce((sum, id) => {
            const item = SPECIAL_ADD_ONS.find(r => r.id === id);
            return sum + (item ? item.price : 0);
        }, 0);
    }, [form.selected_rentals]);

    const grossTotal = agreedBasePrice + rentalTotal + Number(form.addon_amount || 0);
    const balance = Math.max(0, grossTotal - Number(form.amount_paid || 0));

    const applyDiscountAmount = (value) => {
        const normalized = normalizeMoneyInput(value);
        const nextTotal = applyDiscountToCalculatedTotal(basePrice, normalized);
        setDiscountTouched(true);
        setForm((current) => ({ ...current, total_price: nextTotal }));
    };

    const applyDiscountPercent = (percent) => {
        applyDiscountAmount(String(discountAmountFromPercent(basePrice, percent)));
    };

    const resetCalculatedRate = () => {
        setDiscountTouched(false);
        setForm((current) => ({ ...current, total_price: basePrice }));
    };

    const addRental = () => {
        if (!selectedId) return;
        const current = form.selected_rentals || [];
        if (!current.includes(selectedId)) {
            setForm({ ...form, selected_rentals: [...current, selectedId] });
        }
        setSelectedId('');
    };

    const removeRental = (id) => {
        setForm({ ...form, selected_rentals: (form.selected_rentals || []).filter(rid => rid !== id) });
    };

    const handleQuickAdd = (val) => {
        if (!val) return;
        const [name, price] = val.split('|');
        setForm(f => ({ 
            ...f, 
            addon_amount: (Number(f.addon_amount) || 0) + Number(price), 
            notes: (f.notes || '') + (f.notes ? '\n' : '') + `+ ${name} (PHP ${price})`
        }));
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        // Pre-Flight Validation
        if (!form.full_name) { setError('Guest Name is required.'); return; }
        if (!form.check_in) { setError('Date is mandatory.'); return; }
        if (!isDayTour && !form.check_out) { setError('Departure is mandatory.'); return; }
        if (!isDayTour && parseISO(form.check_out) <= parseISO(form.check_in)) { setError('Departure must be after arrival.'); return; }
        if (!isDayTour && (Number(form.guests) < 1 || Number(form.guests) > 2)) { setError('Tent bookings allow 1 or 2 guests only. One booking reserves exactly one tent.'); return; }
        if (isDayTour && Number(form.guests) < 1) { setError('Day tours require at least 1 guest.'); return; }

        setSaving(true);
        setError('');

        try {
            const url = isEdit ? `/api/v1/admin/bookings/${initialData.booking_ref}` : '/api/v1/admin/bookings/manual';
            const method = isEdit ? 'PATCH' : 'POST';
            // Add-on log synthesis
            const rentalList = (form.selected_rentals || []).map(id => SPECIAL_ADD_ONS.find(r => r.id === id)?.label).filter(Boolean);
            const rentalNote = rentalList.length > 0 ? `\n[ADD-ONS: ${rentalList.join(', ')}]` : '';
            
            // Clean up old generated add-on notes to prevent stacking.
            const cleanNotes = (form.notes || '').replace(/\n\[(RENTALS|ADD-ONS):.*\]/g, '').trim();

            const payload = {
                ...form,
                total_price: agreedBasePrice,
                addon_amount: Number(form.addon_amount || 0) + rentalTotal,
                notes: cleanNotes + rentalNote,
                admin_id: 'Vincent-Admin',
                room_type: isDayTour ? 'day_tour' : 'tent_pitching',
                booking_type: form.booking_type,
                unit_id: isDayTour ? 'DAYTOUR' : 'CAMP-ZONE',
                check_out: isDayTour ? form.check_in : form.check_out
            };

            const apiCall = method === 'PATCH' ? api.patch : api.post;
            const data = await apiCall(url, payload);

            if (data) {
                setSuccess(true);
                setTimeout(() => {
                    onSaved();
                    if (onRefresh) onRefresh();
                }, 1500);
            }
        } catch (err) {
            setError(err?.message || 'Connection failure. Check if server is online.');
        } finally {
            setSaving(false);
        }
    };

    const handleExtend = () => {
        const currentOut = parseISO(form.check_out);
        if (isValid(currentOut)) {
            setForm({ ...form, check_out: format(addDays(currentOut, 1), 'yyyy-MM-dd') });
        }
    };

    const paymentProgress = grossTotal > 0 ? Math.min(100, (Number(form.amount_paid || 0) / grossTotal) * 100) : 0;

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="flex max-h-[86vh] w-[min(960px,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[22px] border-[#c8ae7c]/80 bg-[#fffdf8] p-0 shadow-[0_26px_72px_rgba(19,33,31,0.22)]">
                <DialogHeader className="relative min-h-[104px] overflow-hidden border-b border-[#d8c9b3]/80 bg-[#fffdf8] px-6 py-4 text-left">
                    <img
                        src="/assets/page-headers/special-tents.svg"
                        alt=""
                        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[48%] object-cover opacity-90"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,#fffdf8_0%,rgba(255,253,248,0.98)_42%,rgba(255,253,248,0.72)_68%,rgba(10,107,95,0.30)_100%)]" />
                    <div className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#c6923f,#0a6b5f)]" />
                    <div className="relative z-10 flex min-h-[68px] items-center pr-12">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <DialogTitle className="font-resortDisplay text-2xl font-black tracking-normal text-amalfi-ink">
                                    {isEdit ? `Refine ${specialLabel}` : 'Manual Special Booking'}
                                </DialogTitle>
                                <StatusBadge tone={isEdit ? 'info' : 'success'}>{isEdit ? 'Revision mode' : 'New entry'}</StatusBadge>
                            </div>
                            <DialogDescription className="sr-only">
                                Special booking lane: {specialLabel}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="border-b border-[#d8c9b3]/70 bg-[#fff7eb] px-5 py-2.5">
                    <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-2xl border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_8px_16px_rgba(19,33,31,0.035)]">
                        <TabsTrigger value="registry" className={specialTabTriggerClass}>Registry</TabsTrigger>
                        <TabsTrigger value="addons" className={specialTabTriggerClass}>Add-ons</TabsTrigger>
                        <TabsTrigger value="logistics" className={specialTabTriggerClass}>Logistics</TabsTrigger>
                        <TabsTrigger value="summary" className={specialTabTriggerClass}>Summary</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="min-h-0 overflow-y-auto border-r bg-[#fffdf8] p-5">
                        <form onSubmit={handleSave} className="flex min-h-full flex-col gap-4">
                            {activeTab === 'registry' && (
                                <section className="flex flex-col gap-3">
                                    <h3 className={fieldLabelClass}>Guest Identification & Contact</h3>
                                    {!isEdit && (
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Special Booking Type</span>
                                            <select
                                                className={selectClass}
                                                value={form.booking_type}
                                                onChange={(e) => {
                                                    const nextType = e.target.value;
                                                    if (nextType === 'day_tour') setActiveTab('logistics');
                                                    setForm((current) => ({
                                                        ...current,
                                                        booking_type: nextType,
                                                        booking_ref: `${nextType === 'day_tour' ? 'DTR' : 'TPC'}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                                                        unit_id: nextType === 'day_tour' ? 'DAYTOUR' : 'CAMP-ZONE',
                                                        check_out: nextType === 'day_tour' ? current.check_in : addDaysToDateOnly(current.check_in, 1),
                                                        selected_rentals: current.selected_rentals,
                                                    }));
                                                }}
                                            >
                                                <option value="tent_pitching">Tent Pitching</option>
                                                <option value="day_tour">Day Tour</option>
                                            </select>
                                        </label>
                                    )}
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Full Name</span>
                                            <Input className={inputClass} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required placeholder="Enter guest name..." />
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Phone</span>
                                            <Input className={inputClass} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="09XX-XXX-XXXX" />
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Ref Code</span>
                                            <Input className={inputClass} value={form.booking_ref} onChange={e => setForm({...form, booking_ref: e.target.value})} placeholder="TPC-XXXX" />
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Email Address</span>
                                            <Input className={inputClass} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="guest@example.com" />
                                        </label>
                                    </div>
                                </section>
                            )}

                            {activeTab === 'logistics' && (
                                <section className="flex flex-col gap-3">
                                    <h3 className={fieldLabelClass}>{isDayTour ? 'Visit Date & Capacity' : 'Stay Parameters & Capacity'}</h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>{isDayTour ? 'Visit Date' : 'Arrival'}</span>
                                            <Input className={inputClass} type="date" value={form.check_in} onChange={e => setForm({...form, check_in: e.target.value, check_out: isDayTour ? e.target.value : form.check_out})} required />
                                        </label>
                                        {!isDayTour && (
                                            <label className="flex flex-col gap-1.5">
                                                <span className={fieldLabelClass}>Departure</span>
                                                <Input className={inputClass} type="date" value={form.check_out} onChange={e => setForm({...form, check_out: e.target.value})} required />
                                            </label>
                                        )}
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Pax Count</span>
                                            <Input className={inputClass} type="number" value={form.guests} onChange={e => setForm({...form, guests: e.target.value})} min="1" max={isDayTour ? "50" : "2"} required />
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Initial Payment</span>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-primary">PHP</span>
                                                <Input className={cn(inputClass, 'border-primary/40 bg-primary/5 pl-12')} type="number" value={form.amount_paid} onChange={e => setForm({...form, amount_paid: e.target.value})} />
                                            </div>
                                        </label>
                                    </div>

                                    <section className="grid gap-4 rounded-2xl border border-[#d8c9b3]/70 bg-[#fff8ec]/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] md:grid-cols-2">
                                        <div className="md:col-span-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#8b7353]">Rate & Discount</div>
                                        <div>
                                            <label className={fieldLabelClass}>Calculated Special Rate</label>
                                            <div className="flex min-h-11 items-center rounded-xl border border-[#d8c9b3]/70 bg-[#fffdf8] px-3 text-sm font-black text-foreground">
                                                PHP {basePrice.toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <label className={fieldLabelClass}>Agreed Special Rate</label>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">PHP</span>
                                                <Input
                                                    className={cn(inputClass, 'pl-12')}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={form.total_price}
                                                    onChange={(event) => {
                                                        setDiscountTouched(true);
                                                        setForm({ ...form, total_price: normalizeMoneyInput(event.target.value) });
                                                    }}
                                                />
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <StatusBadge tone={appliedDiscount > 0 ? 'warning' : 'success'}>
                                                    {appliedDiscount > 0 ? 'Discounted' : 'Rate engine'}
                                                </StatusBadge>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={resetCalculatedRate}
                                                    disabled={basePrice <= 0}
                                                    className="h-7 rounded-full px-3 text-[0.62rem] font-black"
                                                >
                                                    Use calculated
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className={fieldLabelClass}>Applied Discount</label>
                                            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                                                <div className="relative">
                                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">PHP</span>
                                                    <Input
                                                        className={cn(inputClass, 'pl-12')}
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={appliedDiscount > 0 ? String(appliedDiscount) : ''}
                                                        onChange={(event) => applyDiscountAmount(event.target.value)}
                                                        placeholder="0"
                                                        disabled={basePrice <= 0}
                                                    />
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {[10, 20, 50].map((percent) => (
                                                        <Button
                                                            key={percent}
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => applyDiscountPercent(percent)}
                                                            disabled={basePrice <= 0}
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
                                                            disabled={basePrice <= 0}
                                                        />
                                                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] font-black text-muted-foreground">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {!isDayTour && (
                                        <Card className="rounded-2xl border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="m-0 text-sm font-black text-foreground">Quick Stay Extension</p>
                                                </div>
                                                <Button type="button" variant="outline" onClick={handleExtend}>+ Add 1 Night</Button>
                                            </CardContent>
                                        </Card>
                                    )}
                                </section>
                            )}

                            {activeTab === 'addons' && (
                                <section className="flex flex-col gap-3">
                                    <h3 className={fieldLabelClass}>Add-ons & Adjustments</h3>
                                    <label className="flex flex-col gap-1.5 rounded-2xl border border-[#eadfc9]/80 bg-[#fffdf8]/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                                        <span className={fieldLabelClass}>Select Add-on</span>
                                        <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                                            <div className="relative">
                                                <Package className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                <select className={cn(selectClass, 'appearance-none pl-10 pr-10')} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                                                    <option value="">-- Choose Add-on --</option>
                                                    {SPECIAL_ADD_ONS.map(r => (
                                                        <option key={r.id} value={r.id}>{r.label} - PHP {r.price}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                            <Button type="button" onClick={addRental} className="h-11">Add</Button>
                                        </div>
                                    </label>

                                    {form.selected_rentals?.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                            <span className={fieldLabelClass}>Selected Add-ons</span>
                                            <Card className="overflow-hidden rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                                {form.selected_rentals.map(id => {
                                                    const item = SPECIAL_ADD_ONS.find(r => r.id === id);
                                                    if (!item) return null;
                                                    return (
                                                        <div key={id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                                                            <span className="min-w-0 flex-1 text-sm font-bold text-foreground">{item.label}</span>
                                                            <span className="text-sm font-black text-foreground">PHP {item.price}</span>
                                                            <Button type="button" size="icon" variant="ghost" onClick={() => removeRental(id)} aria-label={`Remove ${item.label}`}>
                                                                <X />
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </Card>
                                        </div>
                                    )}

                                    <label className="flex flex-col gap-1.5 rounded-2xl border border-[#eadfc9]/80 bg-[#fffdf8]/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                                        <span className={fieldLabelClass}>Quick Add Charge</span>
                                        <div className="grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]">
                                            <div className="relative">
                                                <PlusCircle className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                <select className={cn(selectClass, 'appearance-none pl-10 pr-10')} onChange={e => {
                                                    handleQuickAdd(e.target.value);
                                                    e.target.value = "";
                                                }}>
                                                    <option value="">Quick Add Category...</option>
                                                    <optgroup label="Stay Adjustments">
                                                        <option value="Early Check-In|500">Early Check-In (PHP 500)</option>
                                                        <option value="Late Check-Out|500">Late Check-Out (PHP 500)</option>
                                                        <option value="Extra Pax|500">Extra Person (PHP 500)</option>
                                                    </optgroup>
                                                    <optgroup label="Amenities & Services">
                                                        <option value="Kitchen Rental|300">Kitchen Rental (PHP 300)</option>
                                                        <option value="Bonfire Set|300">Bonfire Set (PHP 300)</option>
                                                        <option value="Extra Towel|100">Extra Towel (PHP 100)</option>
                                                        <option value="Ice/Cooler|150">Ice/Cooler (PHP 150)</option>
                                                    </optgroup>
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                            <Textarea className={cn(textareaClass, 'min-h-11 resize-none py-3 text-xs')} placeholder="Billing notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                                        </div>
                                    </label>

                                    <div className="grid gap-3 md:grid-cols-2">
                                        <label className="flex flex-col gap-1.5">
                                            <span className={fieldLabelClass}>Total Add-ons / Adjustments</span>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">PHP</span>
                                                <Input
                                                    className={cn(inputClass, 'pl-12')}
                                                    type="number"
                                                    value={form.addon_amount}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value);
                                                        setForm({ ...form, addon_amount: isNaN(val) ? 0 : val });
                                                    }}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </label>
                                        <div className="flex items-end">
                                        </div>
                                    </div>
                                </section>
                            )}

                            {activeTab === 'summary' && (
                                <section className="flex flex-col gap-3">
                                    <h3 className={fieldLabelClass}>Strategic Overview</h3>
                                    <Card className="rounded-2xl border-primary/15 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                        <CardContent className="p-4">
                                            <p className={fieldLabelClass}>Guest Pulse</p>
                                            <p className="m-0 mt-2 text-2xl font-black text-foreground">{form.full_name || 'Guest Pending'}</p>
                                            <p className="m-0 mt-1 text-sm font-bold text-primary">{form.phone || 'No contact provided'}</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="rounded-2xl border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                        <CardContent className="flex flex-col gap-2.5 p-4">
                                            <p className={fieldLabelClass}>Operations Info</p>
                                            <div className="flex items-center justify-between gap-3 text-sm font-bold">
                                                <span>Ref Code</span>
                                                <span className="text-primary">{form.booking_ref || 'PENDING'}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 text-sm font-bold">
                                                <span>Duration</span>
                                                <span>{isDayTour ? 'Day Visit' : `${nights} Night(s) Stay`}</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </section>
                            )}

                            {error && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                    {error}
                                </div>
                            )}

                            <div className="mt-auto flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <Button type="button" variant="outline" onClick={onClose}>Close</Button>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    {isEdit && (
                                        <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting || saving}>
                                            {deleting ? 'Deleting...' : 'Permanently Delete Entry'}
                                        </Button>
                                    )}
                                    <Button type="submit" disabled={saving || success || deleting}>
                                        {saving ? 'Synchronizing...' : success ? 'Entry Recorded' : 'Confirm & Save Entry'}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>

                    <aside className="min-h-0 overflow-y-auto bg-[#f7eedf]/36 p-5">
                        <div className="flex flex-col gap-4">
                            <h3 className={fieldLabelClass}>Master Financial Summary</h3>
                            <Card className="rounded-2xl shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
                                <CardContent className="p-4">
                                    <p className={fieldLabelClass}>Total Bill (Gross)</p>
                                    <p className="m-0 mt-1.5 text-3xl font-black text-foreground">PHP {grossTotal.toLocaleString()}</p>
                                    <progress
                                        className="mt-4 h-2 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#f7eedf] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                                        value={paymentProgress}
                                        max={100}
                                        aria-label="Payment progress"
                                    />
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-black">
                                        <span className="text-primary">Paid: PHP {Number(form.amount_paid || 0).toLocaleString()}</span>
                                        <span className={balance > 0 ? 'text-destructive' : 'text-primary'}>Due: PHP {balance.toLocaleString()}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                <CardContent className="flex flex-col gap-2.5 p-4">
                                    <p className={fieldLabelClass}>Bill Items</p>
                                    <div className="flex items-center justify-between gap-3 text-sm font-bold">
                                        <span>{isDayTour ? 'Day Tour' : `Tent Stay (${nights}n)`}</span>
                                        <span>PHP {agreedBasePrice.toLocaleString()}</span>
                                    </div>
                                    {appliedDiscount > 0 && (
                                        <div className="flex items-center justify-between gap-3 text-sm font-bold text-amber-700">
                                            <span>Applied Discount</span>
                                            <span>- PHP {appliedDiscount.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {rentalTotal > 0 && (
                                        <div className="flex items-center justify-between gap-3 text-sm font-bold">
                                            <span>Selected Add-ons</span>
                                            <span>PHP {rentalTotal.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {Number(form.addon_amount) > 0 && (
                                        <div className="flex items-center justify-between gap-3 text-sm font-bold text-amber-700">
                                            <span>Extra Charges</span>
                                            <span>PHP {Number(form.addon_amount).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3 text-base font-black">
                                        <span>Subtotal</span>
                                        <span>PHP {grossTotal.toLocaleString()}</span>
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
