import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CreditCard } from 'lucide-react';
import { api } from '../utils/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { cn } from '@/lib/utils';

const TX_TYPES = {
    payment: {
        label: 'Payment',
        railClass: 'bg-amalfi-emerald',
        amountClass: 'text-amalfi-emerald',
        badgeClass: 'border-emerald-200 bg-emerald-50 text-amalfi-emerald',
    },
    charge_item: {
        label: 'Extra Charge',
        railClass: 'bg-amalfi-gold',
        amountClass: 'text-amalfi-gold',
        badgeClass: 'border-amber-200 bg-amber-50 text-amalfi-gold',
    },
    refund: {
        label: 'Refund (Legacy)',
        railClass: 'bg-amalfi-coral',
        amountClass: 'text-amalfi-coral',
        badgeClass: 'border-red-200 bg-red-50 text-amalfi-coral',
    },
    discount: {
        label: 'Discount',
        railClass: 'bg-amalfi-lagoon',
        amountClass: 'text-amalfi-lagoon',
        badgeClass: 'border-sky-200 bg-sky-50 text-amalfi-lagoon',
    },
    deposit: {
        label: 'Legacy Sync',
        railClass: 'bg-amalfi-muted',
        amountClass: 'text-amalfi-muted',
        badgeClass: 'border-[#d8c9b3]/70 bg-[#f7eedf] text-amalfi-muted',
    },
    adjustment: {
        label: 'Adjustment',
        railClass: 'bg-violet-500',
        amountClass: 'text-violet-700',
        badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
    },
    addon: {
        label: 'Add-on',
        railClass: 'bg-amalfi-gold',
        amountClass: 'text-amalfi-gold',
        badgeClass: 'border-amber-200 bg-amber-50 text-amalfi-gold',
    },
};

const INITIAL_FORM = {
    amount: '',
    notes: '',
    item_name: '',
    reason: '',
    method: 'Cash',
    new_check_in: '',
    new_check_out: '',
};

function MoneyStat({ title, value, tone = 'default' }) {
    const toneClass = {
        default: 'text-amalfi-ink',
        positive: 'text-amalfi-emerald',
        danger: 'text-amalfi-coral',
    }[tone];

    return (
        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
            <CardContent className="p-5">
                <div className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">{title}</div>
                <div className={cn('mt-2 font-resortDisplay text-2xl font-black tracking-normal', toneClass)}>
                    PHP {Number(value || 0).toLocaleString()}
                </div>
            </CardContent>
        </Card>
    );
}

function FieldLabel({ children }) {
    return (
        <label className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">
            {children}
        </label>
    );
}

export function FinancialLedgerModal({ booking, onClose, onRefresh }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionView, setActionView] = useState(null);
    const [form, setForm] = useState(INITIAL_FORM);
    const [busy, setBusy] = useState(false);

    const ref = booking.booking_ref;

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/api/v1/admin/transactions?ref=${ref}`);
            setHistory(data.transactions || []);
        } catch (e) {
            console.error('Failed to load history', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchHistory(); }, [ref]);

    const resetActionState = () => {
        setActionView(null);
        setForm(INITIAL_FORM);
    };

    const handleAction = async (e) => {
        e.preventDefault();
        alert('Financial actions now run through Edit Booking so booking status, unit movement, and payment history stay aligned.');
        resetActionState();
    };

    const totalBill = Number(booking.total_price || 0) + Number(booking.addon_amount || 0);
    const balanceTone = Number(booking.balance || 0) > 0 ? 'danger' : 'positive';

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="flex max-h-[86vh] w-[min(820px,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[22px] border-[#c8ae7c]/80 bg-[#fffdf8] p-0 shadow-[0_26px_72px_rgba(19,33,31,0.22)]">
                <DialogHeader className="relative min-h-[100px] overflow-hidden border-b border-[#d8c9b3]/80 bg-[#fffdf8] px-6 py-4 text-left sm:px-8">
                    <img
                        src="/assets/page-headers/reports-desk.svg"
                        alt=""
                        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[46%] object-cover opacity-90"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,#fffdf8_0%,rgba(255,253,248,0.98)_46%,rgba(255,253,248,0.72)_72%,rgba(10,107,95,0.28)_100%)]" />
                    <div className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#c6923f,#0a6b5f)]" />
                    <div className="relative z-10 flex min-h-[62px] items-center pr-10">
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <DialogTitle className="font-resortDisplay text-2xl font-black tracking-normal text-amalfi-ink">
                                    Financial Hub
                                </DialogTitle>
                                <Badge variant="secondary" className="rounded-lg bg-amalfi-emerald/10 font-black text-amalfi-ink">
                                    {ref}
                                </Badge>
                            </div>
                            <DialogDescription className="sr-only">
                                Guest: {booking.full_name || booking.guest_name} | {booking.room_type}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <section className="grid gap-4 border-b border-[#d8c9b3]/60 bg-amalfi-sand/25 px-6 py-5 sm:px-10 md:grid-cols-3">
                    <MoneyStat title="Total Bill" value={totalBill} />
                    <MoneyStat title="Settled Funds" value={booking.amount_paid} tone="positive" />
                    <MoneyStat title="Outstanding Balance" value={booking.balance} tone={balanceTone} />
                </section>

                <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
                    <aside className="flex min-h-0 flex-col gap-4 border-b border-[#d8c9b3]/70 p-5 lg:border-b-0 lg:border-r lg:border-[#d8c9b3]/70 lg:p-6">
                        <div className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">
                            Financial Actions
                        </div>

                        {actionView && (
                            <form onSubmit={handleAction} className="rounded-2xl border border-transparent bg-[#f7eedf]/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] p-5">
                                <div className="mb-4 text-xs font-black text-amalfi-ink">
                                    {actionView === 'payment' && 'Record Settlement'}
                                    {actionView === 'charge' && 'Add Charge Item'}
                                    {actionView === 'rebook' && 'Rebook Stay'}
                                    {actionView === 'discount' && 'Apply Discount'}
                                </div>

                                <div className="flex flex-col gap-3">
                                    {(actionView === 'payment' || actionView === 'charge' || actionView === 'discount') && (
                                        <div className="flex flex-col gap-1.5">
                                            <FieldLabel>Amount (PHP)</FieldLabel>
                                            <Input
                                                autoFocus
                                                required
                                                type="number"
                                                value={form.amount}
                                                onChange={e => setForm({ ...form, amount: e.target.value })}
                                                className="rounded-xl font-bold"
                                            />
                                        </div>
                                    )}

                                    {actionView === 'charge' && (
                                        <div className="flex flex-col gap-1.5">
                                            <FieldLabel>Item Name / Description</FieldLabel>
                                            <Input
                                                required
                                                placeholder="e.g. Extra foam bed"
                                                value={form.item_name}
                                                onChange={e => setForm({ ...form, item_name: e.target.value })}
                                                className="rounded-xl"
                                            />
                                        </div>
                                    )}

                                    {actionView === 'payment' && (
                                        <>
                                            <div className="flex flex-col gap-1.5">
                                                <FieldLabel>Payment Method</FieldLabel>
                                                <Select value={form.method} onValueChange={method => setForm({ ...form, method })}>
                                                    <SelectTrigger className="rounded-xl">
                                                        <CreditCard data-icon="inline-start" />
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectGroup>
                                                            {['Cash', 'GCash', 'Bank Transfer', 'Credit Card'].map(method => (
                                                                <SelectItem key={method} value={method}>{method}</SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <FieldLabel>Notes</FieldLabel>
                                                <Input
                                                    placeholder="Optional payment note"
                                                    value={form.notes}
                                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                                    className="rounded-xl"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {actionView === 'rebook' && (
                                        <>
                                            <div className="flex flex-col gap-1.5">
                                                <FieldLabel>New Check-In</FieldLabel>
                                                <Input
                                                    autoFocus
                                                    required
                                                    type="date"
                                                    value={form.new_check_in}
                                                    onChange={e => setForm({ ...form, new_check_in: e.target.value })}
                                                    className="rounded-xl"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <FieldLabel>New Check-Out</FieldLabel>
                                                <Input
                                                    required
                                                    type="date"
                                                    value={form.new_check_out}
                                                    onChange={e => setForm({ ...form, new_check_out: e.target.value })}
                                                    className="rounded-xl"
                                                />
                                            </div>
                                            <p className="m-0 text-xs font-semibold leading-5 text-amalfi-muted">
                                                Rebooking is only allowed when the request is made 7 days or more before the original arrival date.
                                            </p>
                                        </>
                                    )}

                                    {(actionView === 'discount' || actionView === 'rebook') && (
                                        <div className="flex flex-col gap-1.5">
                                            <FieldLabel>Reason</FieldLabel>
                                            <Input
                                                required
                                                placeholder={actionView === 'rebook' ? 'Why is the stay being moved?' : 'Why is this discount being applied?'}
                                                value={form.reason}
                                                onChange={e => setForm({ ...form, reason: e.target.value })}
                                                className="rounded-xl"
                                            />
                                        </div>
                                    )}

                                    <div className="mt-2 grid grid-cols-[1fr_2fr] gap-2">
                                        <Button type="button" variant="outline" size="sm" onClick={resetActionState} className="rounded-xl">
                                            Cancel
                                        </Button>
                                        <Button type="submit" size="sm" disabled={busy} className="rounded-xl bg-amalfi-night text-white hover:bg-amalfi-night/90">
                                            {busy ? 'Processing...' : 'Confirm'}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </aside>

                    <main className="min-h-0 overflow-y-auto p-5 sm:p-6 lg:p-7">
                        <div className="mb-5 text-admin-label font-black uppercase tracking-normal text-amalfi-muted">
                            Financial Activity Log
                        </div>

                        {loading ? (
                            <LoadingState label="Loading history..." className="border-transparent bg-[#fffdf8]/78 shadow-[0_16px_36px_rgba(19,33,31,0.06)]" />
                        ) : history.length === 0 ? (
                            <EmptyState
                                title="No manual transactions"
                                className="bg-[#fffdf8]/78"
                            />
                        ) : (
                            <div className="flex flex-col gap-3">
                                <Card className="rounded-2xl border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4">
                                        <div>
                                            <div className="text-sm font-black text-amalfi-ink">Base Room Occupation</div>
                                            <div className="mt-1 text-xs font-semibold text-amalfi-muted">Generated upon booking creation</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-amalfi-ink">
                                                PHP {Number(booking.total_price || 0).toLocaleString()}
                                            </div>
                                            <Badge variant="outline" className="mt-1 border-emerald-200 bg-emerald-50 text-[0.62rem] font-black uppercase tracking-normal text-amalfi-emerald">
                                                Contract Base
                                            </Badge>
                                        </div>
                                    </CardContent>
                                </Card>

                                {history.map(tx => {
                                    const meta = TX_TYPES[tx.transaction_type] || {
                                        label: tx.transaction_type,
                                        railClass: 'bg-amalfi-muted',
                                        amountClass: 'text-amalfi-ink',
                                        badgeClass: 'border-[#d8c9b3]/70 bg-[#f7eedf] text-amalfi-muted',
                                    };
                                    const isOutflow = tx.transaction_type === 'refund' || tx.transaction_type === 'discount';

                                    return (
                                        <Card key={tx.id} className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                                            <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4">
                                                <div className="flex min-w-0 gap-3">
                                                    <div className={cn('w-1 shrink-0 rounded-full', meta.railClass)} />
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-black text-amalfi-ink">{meta.label}</div>
                                                        <div className="mt-1 truncate text-xs font-semibold text-amalfi-muted">{tx.notes}</div>
                                                        <div className="mt-1 text-[0.68rem] font-semibold text-amalfi-muted/70">
                                                            {format(new Date(tx.created_at), 'MMM dd, yyyy hh:mm a')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={cn('text-sm font-black', meta.amountClass)}>
                                                        {isOutflow ? '-' : '+'} PHP {Number(tx.amount || 0).toLocaleString()}
                                                    </div>
                                                    <Badge variant="outline" className={cn('mt-1 text-[0.62rem] font-black uppercase tracking-normal', meta.badgeClass)}>
                                                        {tx.status}
                                                    </Badge>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </main>
                </div>

                <DialogFooter className="justify-center border-t border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] px-6 py-3 sm:justify-center sm:px-10" />
            </DialogContent>
        </Dialog>
    );
}
