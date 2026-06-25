import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, Input, Textarea } from '@/components/shared';
import { textareaClass } from '@/components/shared/formStyles';
import { cn } from '@/lib/utils';
import { validatePaymentDraft } from '../../utils/bookingWorkspaceLogic';

const labelClass = 'mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.08em] text-muted-foreground';
const inputClass = 'h-11 rounded-xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] font-bold text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)]';
const selectClass = 'h-11 w-full rounded-xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-3 text-sm font-bold text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)] outline-none transition focus:border-primary focus:ring-1 focus:ring-primary';

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

export function BookingPaymentsPanel({
    payments,
    reconciliation,
    booking,
    totals,
    canRecordPayments,
    onSubmitPayment,
    paymentSaving,
    paymentError,
    paymentSuccess
}) {
    const [draft, setDraft] = useState({
        amount: '',
        payment_method: 'Cash',
        payment_type: '',
        notes: ''
    });
    const [showValidation, setShowValidation] = useState(false);

    const suggestedType = useMemo(() => {
        if (Number(totals.paid || 0) <= 0) return 'deposit';
        if (Number(draft.amount || 0) >= Number(totals.balance || 0) && Number(totals.balance || 0) > 0) return 'Full Settlement';
        return 'payment';
    }, [draft.amount, totals.balance, totals.paid]);

    const resolvedPaymentType = draft.payment_type || suggestedType;
    const validationMessage = validatePaymentDraft(draft, totals);

    useEffect(() => {
        setShowValidation(false);
    }, [booking?.booking_ref, paymentSuccess]);

    const handleRecordPayment = async () => {
        if (!onSubmitPayment) return;
        setShowValidation(true);
        const ok = await onSubmitPayment({
            amount: Number(draft.amount || 0),
            payment_method: draft.payment_method,
            payment_type: resolvedPaymentType,
            notes: draft.notes
        });

        if (ok) {
            setDraft({
                amount: '',
                payment_method: 'Cash',
                payment_type: '',
                notes: ''
            });
            setShowValidation(false);
        }
    };

    return (
        <section className="grid gap-4">
            <div>
                <h2 className="m-0 text-base font-black text-foreground">Payments</h2>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-muted-foreground">
                    Record deposits, settlement payments, and payment notes for this booking.
                </p>
            </div>

            {reconciliation?.summary && <PanelMessage>{reconciliation.summary}</PanelMessage>}

            <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                <CardContent className="grid gap-4 p-5">
                    <div>
                        <div className="text-sm font-black text-foreground">Record Payment</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                            This will post a verified payment event into the booking header ledger and refresh the balance immediately.
                        </div>
                    </div>

                    {!canRecordPayments && <PanelMessage>Payment recording is not available for this imported booking format yet.</PanelMessage>}
                    {canRecordPayments && showValidation && validationMessage && <PanelMessage>{validationMessage}</PanelMessage>}

                    <div className="grid gap-3 md:grid-cols-3">
                        <div>
                            <label className={labelClass}>Amount</label>
                            <Input
                                className={inputClass}
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.amount}
                                onChange={(e) => {
                                    setShowValidation(true);
                                    setDraft((current) => ({ ...current, amount: e.target.value }));
                                }}
                                disabled={!canRecordPayments || paymentSaving}
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Method</label>
                            <select
                                className={selectClass}
                                value={draft.payment_method}
                                onChange={(e) => {
                                    setShowValidation(true);
                                    setDraft((current) => ({ ...current, payment_method: e.target.value }));
                                }}
                                disabled={!canRecordPayments || paymentSaving}
                            >
                                <option value="Cash">Cash</option>
                                <option value="GCash">GCash</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Admin Entry">Admin Entry</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Type</label>
                            <select
                                className={selectClass}
                                value={resolvedPaymentType}
                                onChange={(e) => {
                                    setShowValidation(true);
                                    setDraft((current) => ({ ...current, payment_type: e.target.value }));
                                }}
                                disabled={!canRecordPayments || paymentSaving}
                            >
                                <option value="deposit">Deposit</option>
                                <option value="payment">Payment</option>
                                <option value="Full Settlement">Full Settlement</option>
                                <option value="Full Payment">Full Payment</option>
                                <option value="adjustment">Adjustment</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Notes</label>
                        <Textarea
                            className={textareaClass}
                            value={draft.notes}
                            onChange={(e) => {
                                setShowValidation(true);
                                setDraft((current) => ({ ...current, notes: e.target.value }));
                            }}
                            disabled={!canRecordPayments || paymentSaving}
                            placeholder={`Recorded inside Booking Workspace for ${booking?.booking_ref || 'this booking'}.`}
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-semibold leading-relaxed text-muted-foreground">
                            Suggested type: <strong>{suggestedType}</strong>
                            {' â€¢ '}
                            Current balance: <strong>PHP {Number(totals.balance || 0).toLocaleString()}</strong>
                        </div>
                        <Button
                            type="button"
                            className="rounded-xl font-black"
                            onClick={handleRecordPayment}
                            disabled={!canRecordPayments || paymentSaving || Boolean(validationMessage)}
                        >
                            {paymentSaving ? 'Recording...' : 'Record Payment'}
                        </Button>
                    </div>

                    {paymentError && <PanelMessage tone="danger">{paymentError}</PanelMessage>}
                    {paymentSuccess && <PanelMessage tone="success">{paymentSuccess}</PanelMessage>}
                </CardContent>
            </Card>

            <div className="grid gap-3">
                {payments.length === 0 ? (
                    <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="p-4 text-sm font-bold text-muted-foreground">
                            No payment events were returned for this booking yet.
                        </CardContent>
                    </Card>
                ) : payments.map((payment) => (
                    <Card key={payment.id} className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="grid gap-2 p-4">
                            <div className="flex flex-wrap justify-between gap-3">
                                <div className="font-black text-foreground">{payment.label}</div>
                                <div className={cn('font-black', payment.amount >= 0 ? 'text-primary' : 'text-red-700')}>
                                    PHP {Number(payment.amount || 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-xs font-semibold text-muted-foreground">
                                {[payment.method, payment.status, payment.timestamp].filter(Boolean).join(' â€¢ ') || 'No extra metadata'}
                            </div>
                            {payment.notes && (
                                <div className="text-xs font-semibold leading-relaxed text-muted-foreground">{payment.notes}</div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}
