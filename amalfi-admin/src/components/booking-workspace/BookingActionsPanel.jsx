import React, { useEffect, useState } from 'react';
import { Button, Card, CardContent } from '@/components/shared';
import { cn } from '@/lib/utils';
import { getBookingActionState, MANUAL_STATUS_OPTIONS } from '../../utils/bookingWorkspaceLogic';

const labelClass = 'mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.08em] text-muted-foreground';
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

function StatusMetric({ label, value, tone = 'neutral' }) {
    return (
        <Card className="rounded-2xl border-transparent bg-[#f7eedf]/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <CardContent className="p-4">
                <div className="mb-2 text-[0.62rem] font-black uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
                <div className={cn('text-base font-black text-foreground', tone === 'danger' && 'text-red-700', tone === 'success' && 'text-primary')}>
                    {value}
                </div>
            </CardContent>
        </Card>
    );
}

export function BookingActionsPanel({
    booking,
    totals,
    canRunActions,
    onSubmitStatusUpdate,
    onSubmitCheckout,
    actionSaving,
    actionError,
    actionSuccess
}) {
    const [statusDraft, setStatusDraft] = useState(booking?.status || 'RESERVED');

    useEffect(() => {
        setStatusDraft(booking?.status || 'RESERVED');
    }, [booking?.status]);

    const handleSaveStatus = async () => {
        if (!onSubmitStatusUpdate) return;
        await onSubmitStatusUpdate({ status: statusDraft });
    };

    const balanceDue = Number(totals.balance || 0);
    const { canCheckIn, canCheckout, canSaveStatus } = getBookingActionState(booking, balanceDue);

    return (
        <section className="grid gap-4">
            <div>
                <h2 className="m-0 text-base font-black text-foreground">Actions</h2>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-muted-foreground">
                    Operational state changes now live here so staff can run arrivals and departures inside the booking workspace.
                </p>
            </div>

            {!canRunActions && <PanelMessage>This booking is currently view-only for operational actions.</PanelMessage>}
            {actionError && <PanelMessage tone="danger">{actionError}</PanelMessage>}
            {actionSuccess && <PanelMessage tone="success">{actionSuccess}</PanelMessage>}

            <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                <CardContent className="grid gap-4 p-5">
                    <div>
                        <div className="text-sm font-black text-foreground">Booking Status</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                            Use this when staff needs to explicitly change the operational state outside of a payment or unit change.
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>System Status</label>
                        <select
                            className={selectClass}
                            value={statusDraft}
                            onChange={(e) => setStatusDraft(e.target.value)}
                            disabled={!canRunActions || actionSaving || !canSaveStatus}
                        >
                            {MANUAL_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            className="rounded-xl font-black"
                            disabled={!canRunActions || actionSaving || !canSaveStatus}
                            onClick={handleSaveStatus}
                        >
                            {actionSaving ? 'Saving...' : 'Save Status'}
                        </Button>
                    </div>

                    {!canSaveStatus && (
                        <div className="text-xs font-bold leading-relaxed text-red-700">
                            Checked-out stays can no longer be changed here. Use the booking history for reference or start a new stay if needed.
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                <CardContent className="grid gap-4 p-5">
                    <div>
                        <div className="text-sm font-black text-foreground">Arrival / Departure</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                            Check-in uses the same status route the map already trusts. Check-out still goes through the dedicated backend clearance flow, including balance protection.
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <StatusMetric label="Current Status" value={booking?.status || 'Unknown'} />
                        <StatusMetric label="Balance Gate" value={`PHP ${balanceDue.toLocaleString()}`} tone={balanceDue > 1 ? 'danger' : 'success'} />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            className="rounded-xl font-black"
                            disabled={!canRunActions || actionSaving || !canCheckIn}
                            onClick={() => onSubmitStatusUpdate?.({ status: 'CHECKED_IN' })}
                        >
                            {actionSaving ? 'Processing...' : 'Check In'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl border-red-200 font-black text-red-700 hover:bg-red-50 hover:text-red-700"
                            disabled={!canRunActions || actionSaving || !canCheckout}
                            onClick={() => onSubmitCheckout?.()}
                        >
                            {actionSaving ? 'Processing...' : 'Check Out'}
                        </Button>
                    </div>

                    {!canCheckout && (
                        <div className="text-xs font-bold leading-relaxed text-red-700">
                            Checkout stays locked until the guest is currently checked in and the outstanding balance is cleared.
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    );
}
