import React from 'react';
import { Card, CardContent } from '@/components/shared';
import { cn } from '@/lib/utils';
import { getSummaryGuestCount } from '../../utils/bookingWorkspaceLogic';

function row(label, value, tone = 'neutral') {
    return (
        <div className="flex justify-between gap-4 text-xs">
            <span className="font-bold text-muted-foreground">{label}</span>
            <span className={cn(
                'text-right font-black text-foreground',
                tone === 'success' && 'text-primary',
                tone === 'danger' && 'text-red-700',
            )}>
                {value}
            </span>
        </div>
    );
}

export function BookingSummarySidebar({ booking, totals, units, warnings, bookingKind }) {
    const guestCount = getSummaryGuestCount(booking, units);
    const hasBalance = Number(totals.balance || 0) > 0;

    return (
        <aside className="self-start lg:sticky lg:top-5">
            <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                <CardContent className="grid gap-5 p-5">
                    <div>
                        <div className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-muted-foreground">
                            Booking Summary
                        </div>
                        <div className="text-base font-black text-foreground">{bookingKind}</div>
                        <div className="mt-1 text-sm font-semibold text-muted-foreground">
                            {booking?.check_in || '-'} to {booking?.check_out || '-'}
                        </div>
                    </div>

                    <div className="grid gap-2.5">
                        {row('Units', String(units.length || 0))}
                        {row('Guests', String(guestCount || 0))}
                        {row('Room Total', `PHP ${Number(totals.roomTotal || 0).toLocaleString()}`)}
                        {row('Add-Ons', `PHP ${Number(totals.addonTotal || 0).toLocaleString()}`)}
                        {row('Grand Total', `PHP ${Number(totals.grandTotal || 0).toLocaleString()}`)}
                        {row('Paid', `PHP ${Number(totals.paid || 0).toLocaleString()}`, 'success')}
                        {row('Balance', `PHP ${Number(totals.balance || 0).toLocaleString()}`, totals.balance > 0 ? 'danger' : 'success')}
                    </div>

                    <div className={cn(
                        'rounded-2xl border px-3 py-3 text-xs font-black leading-relaxed',
                        hasBalance ? 'border-red-200 bg-red-50 text-red-700' : 'border-primary/20 bg-primary/10 text-primary',
                    )}>
                        {hasBalance
                            ? `Collect PHP ${Number(totals.balance || 0).toLocaleString()} before checkout.`
                            : 'Payment is settled based on current ledger totals.'}
                    </div>

                    <div className="grid gap-2.5">
                        <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-muted-foreground">
                            Heads Up
                        </div>
                        {warnings.length === 0 ? (
                            <div className="text-xs font-bold text-primary">No active warnings.</div>
                        ) : warnings.map((warning) => (
                            <div
                                key={`${warning.type}-${warning.message}`}
                                className={cn(
                                    'rounded-xl border px-3 py-2 text-xs font-bold leading-relaxed',
                                    warning.type === 'finance'
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : 'border-amber-200 bg-amber-50 text-amber-800',
                                )}
                            >
                                {warning.message}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </aside>
    );
}
