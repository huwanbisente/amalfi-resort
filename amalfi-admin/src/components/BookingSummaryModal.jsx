import React from 'react';
import { Calendar, CreditCard, Home, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const money = (value) => `PHP ${Number(value || 0).toLocaleString()}`;

function dateOnly(value) {
    if (!value) return '-';
    return String(value).split('T')[0];
}

function unitSummary(booking = {}) {
    if (booking.unit_summary) return booking.unit_summary;
    if (booking.unit_label) return booking.unit_label;
    if (booking.unit_id) return booking.unit_id;
    if (booking.room_type) return booking.room_type;
    return 'No unit assigned';
}

function DetailCard({ label, value }) {
    return (
        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
            <CardContent className="p-4">
                <div className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">{label}</div>
                <div className="mt-2 text-sm font-black text-amalfi-ink">{value}</div>
            </CardContent>
        </Card>
    );
}

export function BookingSummaryModal({ booking, onClose }) {
    if (!booking) return null;

    const total = Number(booking.total_price || 0) + Number(booking.addon_amount || 0);
    const paid = Number(booking.amount_paid || booking.verified_paid_total || 0);
    const balance = Math.max(0, total - paid);
    const bookingType = Number(booking.booking_items_count || 1) > 1 || booking.record_origin === 'transaction_header' || booking.record_origin === 'transaction_item'
        ? 'Multi Booking'
        : 'Solo Booking';

    const guestName = booking.full_name || booking.guest_name || 'Walk-in Guest';
    const bookingRef = booking.booking_ref || booking.booking_reference || '-';
    const facts = [
        { label: 'Guest', value: guestName },
        { label: 'Reference', value: bookingRef },
        { label: 'Status', value: booking.status || '-' },
        { label: 'Booking Type', value: bookingType },
        { label: 'Check-in', value: dateOnly(booking.check_in) },
        { label: 'Check-out', value: dateOnly(booking.check_out) },
        { label: 'Guests', value: `${booking.guests || booking.pax || 0} pax` },
        { label: 'Source', value: booking.booking_source || '-' },
    ];

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[84vh] gap-0 overflow-hidden rounded-[22px] border-[#c8ae7c]/80 bg-[#fffdf8] p-0 shadow-[0_26px_72px_rgba(19,33,31,0.22)] sm:max-w-2xl">
                <DialogHeader className="relative min-h-[98px] overflow-hidden border-b border-[#d8c9b3]/80 bg-[#fffdf8] px-6 py-4 text-left">
                    <img
                        src="/assets/page-headers/verifications-receipts.svg"
                        alt=""
                        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[46%] object-cover opacity-90"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,#fffdf8_0%,rgba(255,253,248,0.98)_46%,rgba(255,253,248,0.72)_72%,rgba(10,107,95,0.28)_100%)]" />
                    <div className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#c6923f,#0a6b5f)]" />
                    <div className="relative z-10 pr-12">
                    <Badge variant="secondary" className="mb-2 w-fit rounded-full text-admin-label font-black uppercase tracking-normal">
                        Booking Summary
                    </Badge>
                    <DialogTitle className="font-resortDisplay text-2xl font-black tracking-normal text-amalfi-ink">{guestName}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {bookingRef} Â· {bookingType}
                    </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="max-h-[56vh] overflow-y-auto px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {facts.map((fact) => (
                            <DetailCard key={fact.label} label={fact.label} value={fact.value} />
                        ))}
                    </div>

                    <Card className="mt-4 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-normal text-amalfi-muted">
                                <Home className="size-4 text-amalfi-muted" />
                                Units
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="text-base font-black text-amalfi-ink">{unitSummary(booking)}</div>
                            <div className="mt-1 text-sm font-bold text-amalfi-muted">{booking.room_type || 'Room type not specified'}</div>
                        </CardContent>
                    </Card>

                    <Card className="mt-4 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-normal text-amalfi-muted">
                                <CreditCard className="size-4 text-amalfi-emerald" />
                                Payment
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
                            <DetailCard label="Total" value={money(total)} />
                            <DetailCard label="Paid" value={<span className="text-amalfi-emerald">{money(paid)}</span>} />
                            <DetailCard label="Balance" value={<span className={balance > 0 ? 'text-amalfi-coral' : 'text-amalfi-emerald'}>{money(balance)}</span>} />
                        </CardContent>
                    </Card>

                    {(booking.notes || booking.special_requests) && (
                        <Card className="mt-4 rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_10px_22px_rgba(19,33,31,0.045)]">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-normal text-amalfi-muted">
                                    <UserRound className="size-4 text-amalfi-muted" />
                                    Notes
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-2 pt-0 text-sm leading-6">
                                {booking.special_requests && <div className="font-bold text-amalfi-ink">{booking.special_requests}</div>}
                                {booking.notes && <div className="font-semibold text-amalfi-muted">{booking.notes}</div>}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <DialogFooter className="items-center gap-3 sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-amalfi-muted">
                        <Calendar className="size-4" />
                        <span>{dateOnly(booking.check_in)} to {dateOnly(booking.check_out)}</span>
                    </div>
                    <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
