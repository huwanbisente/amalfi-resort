import React from 'react';
import { Button, StatusBadge } from '@/components/shared';
import { paymentStatusLabel } from '../../utils/statusLabels';

export function BookingWorkspaceHeader({ booking, bookingKind, onBack, onRefresh, onOpenLedger }) {
    const paymentStatus = paymentStatusLabel(booking?.payment_status);
    const bookingStatus = booking?.status || 'Unknown status';

    return (
        <div className="flex flex-col gap-5 border-b border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-5 py-5 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                    <StatusBadge tone="info">{bookingKind}</StatusBadge>
                    <StatusBadge tone="neutral">{bookingStatus}</StatusBadge>
                    <StatusBadge tone="success">{paymentStatus}</StatusBadge>
                </div>
                <div>
                    <div className="text-xs font-black uppercase tracking-[0.08em] text-muted-foreground">
                        {booking?.booking_ref || 'Unassigned ref'}
                    </div>
                    <div className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-primary">
                        Edit Booking
                    </div>
                    <h1 className="mt-1 font-resortDisplay text-3xl font-black leading-tight text-foreground">
                        {booking?.full_name || booking?.guest_name || 'Unnamed guest'}
                    </h1>
                    <div className="mt-2 max-w-3xl text-sm font-bold leading-relaxed text-muted-foreground">
                        Use the tabs below to update guest details, rooms, charges, payments, and check-in/out status.
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <Button type="button" variant="outline" onClick={onBack} className="rounded-xl font-black">Back</Button>
                <Button type="button" variant="outline" onClick={onOpenLedger} className="rounded-xl font-black">Back to Ledger</Button>
                <Button type="button" onClick={onRefresh} className="rounded-xl font-black">Refresh</Button>
            </div>
        </div>
    );
}
