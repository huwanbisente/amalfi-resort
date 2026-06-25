import React, { useEffect, useState } from 'react';
import { Button, Card, CardContent, Input, Textarea } from '@/components/shared';
import { textareaClass } from '@/components/shared/formStyles';
import { validateOverviewDraft } from '../../utils/bookingWorkspaceLogic';

const labelClass = 'mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.08em] text-muted-foreground';
const inputClass = 'h-11 rounded-xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] font-bold text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)]';

function PanelMessage({ tone = 'warning', children }) {
    const toneClass = tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'success'
            ? 'border-primary/20 bg-primary/10 text-primary'
            : 'border-amber-200 bg-amber-50 text-amber-800';

    return (
        <div className={`rounded-xl border px-3 py-3 text-xs font-bold leading-relaxed ${toneClass}`}>
            {children}
        </div>
    );
}

function FieldCard({ label, children }) {
    return (
        <Card className="rounded-2xl border-transparent bg-[#f7eedf]/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <CardContent className="p-4">
                <label className={labelClass}>{label}</label>
                {children}
            </CardContent>
        </Card>
    );
}

export function BookingOverviewPanel({
    booking,
    canEditOverview,
    onSubmitOverview,
    overviewSaving,
    overviewError,
    overviewSuccess
}) {
    const [draft, setDraft] = useState({
        full_name: '',
        email: '',
        phone: '',
        check_in: '',
        check_out: '',
        booking_source: '',
        notes: '',
        special_requests: ''
    });
    const [showValidation, setShowValidation] = useState(false);

    useEffect(() => {
        setDraft({
            full_name: booking?.full_name || booking?.guest_name || '',
            email: booking?.email || '',
            phone: booking?.phone || '',
            check_in: booking?.check_in || '',
            check_out: booking?.check_out || '',
            booking_source: booking?.booking_source || 'Direct',
            notes: booking?.notes || '',
            special_requests: booking?.special_requests || ''
        });
        setShowValidation(false);
    }, [booking]);

    const handleChange = (key, value) => {
        setShowValidation(true);
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const handleSave = async () => {
        if (!onSubmitOverview) return;
        setShowValidation(true);
        await onSubmitOverview(draft);
    };

    const validationMessage = validateOverviewDraft(draft);

    return (
        <section className="grid gap-4">
            <div>
                <h2 className="m-0 text-base font-black text-foreground">Guest & Stay</h2>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-muted-foreground">
                    Edit the guest name, contact details, dates, source, and internal notes for this booking.
                </p>
            </div>

            {!canEditOverview && <PanelMessage>This booking is currently view-only in the workspace.</PanelMessage>}
            {overviewError && <PanelMessage tone="danger">{overviewError}</PanelMessage>}
            {!overviewError && showValidation && validationMessage && <PanelMessage>{validationMessage}</PanelMessage>}
            {overviewSuccess && <PanelMessage tone="success">{overviewSuccess}</PanelMessage>}

            <div className="grid gap-3 md:grid-cols-2">
                <FieldCard label="Guest">
                    <Input className={inputClass} value={draft.full_name} onChange={(e) => handleChange('full_name', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Phone">
                    <Input className={inputClass} value={draft.phone} onChange={(e) => handleChange('phone', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Email">
                    <Input className={inputClass} value={draft.email} onChange={(e) => handleChange('email', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Check-In">
                    <Input className={inputClass} type="date" value={draft.check_in} onChange={(e) => handleChange('check_in', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Check-Out">
                    <Input className={inputClass} type="date" value={draft.check_out} onChange={(e) => handleChange('check_out', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Source">
                    <Input className={inputClass} value={draft.booking_source} onChange={(e) => handleChange('booking_source', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Notes">
                    <Textarea className={textareaClass} value={draft.notes} onChange={(e) => handleChange('notes', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
                <FieldCard label="Special Requests">
                    <Textarea className={textareaClass} value={draft.special_requests} onChange={(e) => handleChange('special_requests', e.target.value)} disabled={!canEditOverview || overviewSaving} />
                </FieldCard>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold leading-relaxed text-muted-foreground">
                    Changes save directly to this booking and refresh the ledger summary.
                </div>
                <Button
                    type="button"
                    className="rounded-xl font-black"
                    disabled={!canEditOverview || overviewSaving || Boolean(validationMessage)}
                    onClick={handleSave}
                >
                    {overviewSaving ? 'Saving...' : 'Save Guest & Stay'}
                </Button>
            </div>
        </section>
    );
}
