import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Textarea,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/shared';
import { cn } from '@/lib/utils';

const fmtCur = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
}).format(value || 0);

const unitSelectValue = (unitIds = []) => unitIds.join('|');
const parseUnitSelectValue = (value = '') => String(value || '').split('|').filter(Boolean);

function Detail({ label, value }) {
    return (
        <div className="rounded-xl border border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] p-3">
            <div className="text-[0.56rem] font-black uppercase tracking-normal text-amalfi-muted">{label}</div>
            <div className="mt-1 text-xs font-black text-amalfi-ink">{value || 'Not detected'}</div>
        </div>
    );
}

function FieldSelect({ value, onValueChange, children, placeholder = 'Select...' }) {
    return (
        <Select value={String(value ?? '')} onValueChange={onValueChange}>
            <SelectTrigger className="h-10 rounded-xl bg-[#fffdf8] font-bold text-amalfi-ink">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>{children}</SelectGroup>
            </SelectContent>
        </Select>
    );
}

function unitCapacity(unit) {
    return Number(unit?.absolute_max_pax || unit?.max_capacity_pax || 0);
}

export function QuickParsedBookingPanel({
    analysis,
    source = 'Response Helper',
    inquiryText = '',
    defaultCustomerName = '',
    title = 'Quick Manual Booking',
    subtitle = 'Create the real booking and record payment collected today.',
    successPrefix = 'Manual booking created',
    sourceSenderId = '',
    onCreated,
}) {
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
    const [bookingMode, setBookingMode] = useState('single');
    const [bookingReviewOpen, setBookingReviewOpen] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingError, setBookingError] = useState('');
    const [bookingResult, setBookingResult] = useState(null);
    const [unitOptions, setUnitOptions] = useState([]);
    const [loadingUnits, setLoadingUnits] = useState(false);
    const [form, setForm] = useState({
        guest_name: defaultCustomerName,
        phone: '',
        email: '',
        check_in: '',
        check_out: '',
        guests: '',
        selected_unit_ids: [],
        booking_source: source,
        status: 'RESERVED',
        lodging_total: '',
        addon_amount: '0',
        initial_payment: '',
        payment_method: 'GCash',
        payment_notes: '',
        notes: ''
    });

    const suggestions = analysis?.suggestions || [];
    const topSuggestion = suggestions[selectedSuggestionIndex] || suggestions[0] || null;
    const bookableUnits = useMemo(() => {
        const options = unitOptions.length ? unitOptions : (topSuggestion?.units || []);
        return options.filter((unit) => unit.is_available !== false);
    }, [topSuggestion, unitOptions]);
    const selectedUnits = useMemo(() => {
        const selectedById = (form.selected_unit_ids || [])
            .map((unitId) => bookableUnits.find((unit) => unit.unit_id === unitId))
            .filter(Boolean);
        const fallback = selectedById.length ? selectedById : (topSuggestion?.units || []);
        return bookingMode === 'multi' ? fallback : fallback.slice(0, 1);
    }, [bookableUnits, bookingMode, form.selected_unit_ids, topSuggestion]);
    const selectedUnitText = selectedUnits.map((unit) => unit.unit_label || unit.unit_id).filter(Boolean).join(', ');
    const selectedUnitIds = selectedUnits.map((unit) => unit.unit_id).filter(Boolean);
    const capacity = selectedUnits.reduce((sum, unit) => sum + unitCapacity(unit), 0);
    const guests = Number(form.guests || analysis?.context?.guests || 0);
    const capacityOk = !capacity || !guests || guests <= capacity;
    const roomTotal = Number(form.lodging_total || topSuggestion?.summary?.total_amount || 0);
    const addonAmount = Number(form.addon_amount || 0);
    const grossTotal = roomTotal + addonAmount;
    const initialPayment = Number(form.initial_payment || 0);
    const balance = Math.max(0, grossTotal - initialPayment);
    const canCreate = Boolean(form.check_in && form.check_out && guests > 0 && form.guest_name.trim() && selectedUnits.length && capacityOk && grossTotal >= 0 && initialPayment >= 0);

    useEffect(() => {
        if (!analysis) return;
        const firstSuggestion = analysis.suggestions?.[0] || null;
        const units = firstSuggestion?.units || [];
        const firstCapacity = unitCapacity(units[0]);
        const parsedGuests = Number(analysis.context?.guests || 0);
        setSelectedSuggestionIndex(0);
        setBookingMode(units.length > 1 && parsedGuests > firstCapacity ? 'multi' : 'single');
        setUnitOptions([]);
        setBookingReviewOpen(false);
        setBookingError('');
        setBookingResult(null);
        setForm((current) => ({
            ...current,
            guest_name: current.guest_name || defaultCustomerName,
            check_in: analysis.context?.check_in || '',
            check_out: analysis.context?.check_out || '',
            guests: analysis.context?.guests || '',
            selected_unit_ids: units.map((unit) => unit.unit_id).filter(Boolean),
            booking_source: source,
            lodging_total: String(Number(firstSuggestion?.summary?.total_amount || 0))
        }));
    }, [analysis, defaultCustomerName, source]);

    useEffect(() => {
        if (!topSuggestion) return;
        const units = topSuggestion.units || [];
        const firstCapacity = unitCapacity(units[0]);
        setBookingMode(units.length > 1 && guests > firstCapacity ? 'multi' : 'single');
    }, [guests, topSuggestion]);

    useEffect(() => {
        if (!form.check_in || !form.check_out || form.check_out <= form.check_in) {
            setUnitOptions([]);
            return;
        }
        let active = true;
        setLoadingUnits(true);
        api.post('/api/v1/admin/booking-options', {
            check_in: form.check_in,
            check_out: form.check_out,
            guests: Number(form.guests || 1)
        })
            .then((payload) => {
                if (!active) return;
                const options = payload.all_units || payload.available_units || [];
                setUnitOptions(options);
                setForm((current) => {
                    const availableIds = new Set(options.filter((unit) => unit.is_available !== false).map((unit) => unit.unit_id));
                    return { ...current, selected_unit_ids: (current.selected_unit_ids || []).filter((unitId) => availableIds.has(unitId)) };
                });
            })
            .catch(() => {
                if (active) setUnitOptions([]);
            })
            .finally(() => {
                if (active) setLoadingUnits(false);
            });
        return () => {
            active = false;
        };
    }, [form.check_in, form.check_out, form.guests]);

    useEffect(() => {
        if (!form.check_in || !form.check_out || selectedUnits.length === 0) return;
        let active = true;
        api.post('/api/v1/admin/booking-desk/quote', {
            check_in: form.check_in,
            check_out: form.check_out,
            guests: Number(form.guests || 1),
            unit_ids: selectedUnits.map((unit) => unit.unit_id)
        })
            .then((payload) => {
                if (!active || !payload?.quote) return;
                setForm((current) => ({ ...current, lodging_total: String(Number(payload.quote.total_amount || current.lodging_total || 0)) }));
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [form.check_in, form.check_out, form.guests, selectedUnits]);

    const createBooking = async () => {
        if (!canCreate || !bookingReviewOpen) return;
        setBookingLoading(true);
        setBookingError('');
        setBookingResult(null);
        try {
            const baseSubtotal = selectedUnits.length > 0 ? Math.floor((roomTotal / selectedUnits.length) * 100) / 100 : roomTotal;
            const senderNote = sourceSenderId ? ` Sender: ${sourceSenderId}.` : '';
            const payload = {
                header: {
                    guest_name: form.guest_name.trim(),
                    phone: form.phone.trim(),
                    email: form.email.trim(),
                    check_in: form.check_in,
                    check_out: form.check_out,
                    lodging_total: grossTotal,
                    addon_amount: addonAmount,
                    status: form.status || 'RESERVED',
                    booking_source: form.booking_source || source,
                    booking_mode: selectedUnits.length > 1 ? 'TRANSACTION_GROUP' : 'STANDARD',
                    notes: form.notes.trim() || `Manual booking from ${source}.${senderNote} Inquiry: ${String(inquiryText || '').slice(0, 500)}`,
                    special_requests: analysis?.context?.raw_message || inquiryText,
                    created_by: 'admin'
                },
                items: selectedUnits.map((unit, index) => ({
                    unit_id: unit.unit_id,
                    room_type: unit.room_type,
                    check_in: form.check_in,
                    check_out: form.check_out,
                    guest_count: Number(unit.assigned_guests || 1),
                    lodging_subtotal: index === selectedUnits.length - 1 ? roomTotal - (baseSubtotal * index) : baseSubtotal,
                    status: form.status === 'CHECKED_IN' ? 'CHECKED_IN' : 'RESERVED',
                    sequence_no: index + 1
                })),
                admin_id: 'Vincent-Admin'
            };
            const created = await api.post('/api/v1/admin/booking-headers', payload);
            const createdRef = created?.header?.booking_reference;
            if (createdRef && initialPayment > 0) {
                await api.post(`/api/v1/admin/booking-headers/${createdRef}/payments`, {
                    amount: initialPayment,
                    payment_type: initialPayment >= grossTotal && grossTotal > 0 ? 'Full Payment' : 'deposit',
                    payment_method: form.payment_method || 'GCash',
                    verification_status: 'VERIFIED',
                    notes: form.payment_notes.trim() || `Recorded during ${source} quick booking creation`,
                    admin_id: 'Vincent-Admin'
                });
            }
            setBookingResult(created);
            setBookingReviewOpen(false);
            if (onCreated) onCreated(created);
        } catch (err) {
            setBookingError(err.message || 'Booking creation failed.');
        } finally {
            setBookingLoading(false);
        }
    };

    if (!suggestions.length) return null;

    return (
        <div className="mt-5 border-t border-[#d8c9b3]/70 pt-5">
            <div className="mb-4 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-2xl bg-amalfi-gold/10 text-amalfi-gold">
                    <CalendarCheck />
                </div>
                <div>
                    <div className="text-sm font-black text-amalfi-ink">{title}</div>
                    <div className="text-xs font-semibold text-amalfi-muted">{subtitle}</div>
                </div>
            </div>

            <Card className="mb-3 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">Parsed Stay</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                    <Input value={form.check_in} onChange={(event) => setForm((current) => ({ ...current, check_in: event.target.value, selected_unit_ids: [] }))} type="date" className="h-10 rounded-xl font-bold" />
                    <Input value={form.check_out} onChange={(event) => setForm((current) => ({ ...current, check_out: event.target.value, selected_unit_ids: [] }))} type="date" className="h-10 rounded-xl font-bold" />
                    <Input
                        value={form.guests}
                        onChange={(event) => setForm((current) => ({ ...current, guests: event.target.value }))}
                        type="number"
                        min="1"
                        placeholder="Guests / pax"
                        className={cn('h-10 rounded-xl font-bold sm:col-span-2', !capacityOk && 'border-amalfi-coral')}
                    />
                </CardContent>
            </Card>

            <Card className="mb-3 rounded-2xl border-transparent bg-[#f7eedf]/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">Booking Type</div>
                            <div className="mt-1 text-xs font-black text-amalfi-ink">
                                {bookingMode === 'multi' ? 'Multi booking with shared payment trail' : 'Single booking with one primary unit'}
                            </div>
                        </div>
                        <div className="inline-flex rounded-full border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] p-1">
                            <Button
                                type="button"
                                size="sm"
                                variant={bookingMode === 'single' ? 'default' : 'ghost'}
                                onClick={() => setBookingMode('single')}
                                className={cn('h-8 rounded-full px-3 text-[0.68rem] font-black', bookingMode === 'single' && 'bg-amalfi-emerald text-white hover:bg-amalfi-emerald/90')}
                            >
                                Single Booking
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={bookingMode === 'multi' ? 'default' : 'ghost'}
                                onClick={() => setBookingMode('multi')}
                                disabled={bookableUnits.length < 2}
                                className={cn('h-8 rounded-full px-3 text-[0.68rem] font-black', bookingMode === 'multi' && 'bg-amalfi-emerald text-white hover:bg-amalfi-emerald/90')}
                            >
                                Multi Booking
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <Detail label="Selected Units" value={selectedUnits.length ? `${selectedUnits.length} unit${selectedUnits.length !== 1 ? 's' : ''}` : 'None'} />
                        <Detail label="Capacity" value={capacity ? `${capacity} pax max` : 'Not set'} />
                        <Detail label="Booking Pax" value={guests ? `${guests} pax` : 'Not detected'} />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">Unit Selection</div>
                        {loadingUnits && <div className="text-xs font-bold text-amalfi-muted">Refreshing live units...</div>}
                    </div>

                    {bookableUnits.length > 0 ? (
                        <div className="mt-2">
                            <FieldSelect
                                value={unitSelectValue(selectedUnitIds)}
                                onValueChange={(value) => setForm((current) => ({
                                    ...current,
                                    selected_unit_ids: parseUnitSelectValue(value)
                                }))}
                            >
                                {bookingMode === 'single' ? (
                                    bookableUnits.map((unit) => (
                                        <SelectItem key={unit.unit_id} value={unit.unit_id}>
                                            {unit.unit_label || unit.unit_id} - {unit.room_type || 'Unit'} - {unitCapacity(unit) || 0} pax
                                        </SelectItem>
                                    ))
                                ) : (
                                    <>
                                        {suggestions
                                            .filter((suggestion) => (suggestion.units || []).length > 1)
                                            .map((suggestion, index) => {
                                                const units = suggestion.units || [];
                                                const ids = units.map((unit) => unit.unit_id).filter(Boolean);
                                                const label = units.map((unit) => unit.unit_label || unit.unit_id).join(', ');
                                                return (
                                                    <SelectItem key={suggestion.unit_ids?.join('-') || ids.join('|') || index} value={unitSelectValue(ids)}>
                                                        {label} - {units.length} units - {suggestion.summary?.total_absolute_capacity || ids.reduce((sum, id) => sum + unitCapacity(bookableUnits.find((unit) => unit.unit_id === id)), 0)} pax
                                                    </SelectItem>
                                                );
                                            })}
                                        {bookableUnits.length > 1 && (
                                            <SelectItem value={unitSelectValue(bookableUnits.map((unit) => unit.unit_id))}>
                                                All available units - {bookableUnits.length} units
                                            </SelectItem>
                                        )}
                                    </>
                                )}
                            </FieldSelect>
                        </div>
                    ) : (
                        <div className="mt-2 text-xs font-black text-amalfi-coral">No available unit selected.</div>
                    )}

                    {selectedUnitText && (
                        <div className="mt-3 rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] p-3 text-xs font-bold leading-5 text-amalfi-ink">
                            {selectedUnitText}
                        </div>
                    )}
                    {!capacityOk && (
                        <div className="mt-3 text-xs font-black text-amalfi-coral">
                            Pax exceeds selected capacity. Switch to Multi Booking or choose a larger suggested option.
                        </div>
                    )}
                </CardContent>
            </Card>

            {suggestions.length > 1 && (
                <div className="mb-3">
                    <FieldSelect
                        value={String(selectedSuggestionIndex)}
                        onValueChange={(value) => {
                            const nextIndex = Number(value);
                            const nextSuggestion = suggestions[nextIndex];
                            const nextUnits = nextSuggestion?.units || [];
                            setSelectedSuggestionIndex(nextIndex);
                            setUnitOptions([]);
                            setForm((current) => ({ ...current, selected_unit_ids: nextUnits.map((unit) => unit.unit_id).filter(Boolean), lodging_total: String(Number(nextSuggestion?.summary?.total_amount || 0)) }));
                        }}
                    >
                        {suggestions.map((suggestion, index) => (
                            <SelectItem key={suggestion.unit_ids?.join('-') || index} value={String(index)}>
                                Option {index + 1}: {suggestion.summary?.total_units || 0} unit(s), {fmtCur(suggestion.summary?.total_amount || 0)}
                            </SelectItem>
                        ))}
                    </FieldSelect>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                <Input value={form.guest_name} onChange={(event) => setForm((current) => ({ ...current, guest_name: event.target.value }))} placeholder="Guest name" className="h-10 rounded-xl font-bold" />
                <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="h-10 rounded-xl font-bold" />
                <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email optional" className="h-10 rounded-xl font-bold sm:col-span-2" />
                <FieldSelect value={form.booking_source} onValueChange={(value) => setForm((current) => ({ ...current, booking_source: value }))}>
                    {['Response Helper', 'Chatbot Monitor', 'Direct', 'Facebook', 'Messenger', 'Walk-in', 'Referral'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </FieldSelect>
                <FieldSelect value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                    <SelectItem value="RESERVED">Reserved</SelectItem>
                    <SelectItem value="PENDING_VERIFICATION">Pending Verification</SelectItem>
                    <SelectItem value="CHECKED_IN">Checked In</SelectItem>
                </FieldSelect>
                <Input value={form.lodging_total} onChange={(event) => setForm((current) => ({ ...current, lodging_total: event.target.value }))} type="number" min="0" step="100" placeholder="Agreed room total" className="h-10 rounded-xl font-bold" />
                <Input value={form.addon_amount} onChange={(event) => setForm((current) => ({ ...current, addon_amount: event.target.value }))} type="number" min="0" step="100" placeholder="Add-ons / extras" className="h-10 rounded-xl font-bold" />
                <Input value={form.initial_payment} onChange={(event) => setForm((current) => ({ ...current, initial_payment: event.target.value }))} type="number" min="0" step="100" placeholder="Downpayment / paid today" className="h-10 rounded-xl border-amalfi-emerald/40 bg-amalfi-emerald/5 font-black" />
                <FieldSelect value={form.payment_method} onValueChange={(value) => setForm((current) => ({ ...current, payment_method: value }))}>
                    {['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Admin Entry'].map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                </FieldSelect>
                <Input value={form.payment_notes} onChange={(event) => setForm((current) => ({ ...current, payment_notes: event.target.value }))} placeholder="Payment note / reference optional" className="h-10 rounded-xl font-bold sm:col-span-2" />
                <Textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Internal notes optional"
                    className="min-h-20 rounded-xl border border-transparent bg-[#f7eedf]/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] px-3 py-2 text-sm font-bold text-amalfi-ink shadow-[0_10px_22px_rgba(19,33,31,0.045)] outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:col-span-2"
                />
            </div>

            {!bookingReviewOpen ? (
                <Button
                    type="button"
                    onClick={() => { if (canCreate) { setBookingError(''); setBookingReviewOpen(true); } }}
                    disabled={!canCreate}
                    className="mt-3 h-11 w-full rounded-xl bg-amalfi-gold font-black text-white hover:bg-amalfi-gold/90"
                >
                    <CalendarCheck data-icon="inline-start" />
                    Review Manual Booking
                </Button>
            ) : (
                <Card className="mt-3 rounded-2xl border-amalfi-gold/25 bg-amalfi-gold/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                    <CardContent className="p-4">
                        <div className="text-[0.68rem] font-black uppercase tracking-normal text-amalfi-gold">Confirm before creating</div>
                        <div className="mt-2 text-xs font-bold leading-6 text-amalfi-ink">
                            Create a {selectedUnits.length > 1 ? 'multi' : 'single'} booking for <strong>{form.guest_name.trim()}</strong> on <strong>{form.check_in}</strong> to <strong>{form.check_out}</strong>. Booked unit{selectedUnits.length !== 1 ? 's' : ''}: <strong>{selectedUnitText || 'Not selected'}</strong>. Gross: <strong>{fmtCur(grossTotal)}</strong>. Paid today: <strong>{fmtCur(initialPayment)}</strong>. Balance: <strong>{fmtCur(balance)}</strong>.
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Button type="button" onClick={() => setBookingReviewOpen(false)} disabled={bookingLoading} variant="outline" className="rounded-xl font-black">
                                Edit Details
                            </Button>
                            <Button onClick={createBooking} disabled={bookingLoading} className="rounded-xl bg-amalfi-emerald font-black text-white hover:bg-amalfi-emerald/90">
                                {bookingLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CalendarCheck data-icon="inline-start" />}
                                Create Booking
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {bookingError && <div className="mt-3 text-xs font-black text-amalfi-coral">{bookingError}</div>}
            {bookingResult?.header?.booking_reference && (
                <div className="mt-3 rounded-xl border border-amalfi-emerald/20 bg-amalfi-emerald/10 p-3 text-xs font-black text-amalfi-emerald">
                    {successPrefix}: {bookingResult.header.booking_reference}
                    {selectedUnitText ? ` - Booked unit${selectedUnits.length !== 1 ? 's' : ''}: ${selectedUnitText}` : ''}
                </div>
            )}
        </div>
    );
}
