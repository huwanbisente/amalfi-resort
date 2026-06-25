import React, { useMemo, useState } from 'react';
import {
    addDays,
    differenceInCalendarDays,
    eachDayOfInterval,
    format,
    isSameDay,
    parseISO,
    startOfDay,
    startOfToday,
} from 'date-fns';
import { CalendarDays, ChevronRight, Plus, RefreshCw } from 'lucide-react';

import {
    Badge,
    Button,
    Card,
    CardContent,
    CommandDeck,
    DeckIntro,
    DeckMetric,
    DeckMetricRail,
    EmptyState,
    StatusBadge,
} from '@/components/shared';
import { cn } from '@/lib/utils';

const TENT_CAPACITY = 20;
const DAY_TOUR_SLOTS = 2;
const VIEWS = [
    { id: '7', label: '7-Day', days: 7 },
    { id: '14', label: '14-Day', days: 14 },
    { id: '30', label: '30-Day', days: 30 },
];

const fmtDate = d => format(parseISO(d), 'MMM d, yyyy');
const fmtShort = d => format(d, 'MMM d');
const fmtDay = d => format(d, 'EEE');

function computeDayData(date, bookings) {
    const d = startOfDay(date);

    const tents = bookings.filter(b => {
        if (b.booking_type !== 'tent_pitching') return false;
        const ci = startOfDay(parseISO(b.check_in));
        const co = startOfDay(parseISO(b.check_out));
        return d >= ci && d < co;
    });

    const tentPax = tents.reduce((s, b) => s + Number(b.guests || 0), 0);
    const pending = tents.filter(b => b.status === 'PENDING_VERIFICATION').length;
    const approved = tents.filter(b => b.status === 'RESERVED').length;
    const dayTours = bookings.filter(b => {
        if (b.booking_type !== 'day_tour') return false;
        const ci = startOfDay(parseISO(b.check_in));
        return isSameDay(ci, d);
    });

    return { tents, tentPax, pending, approved, dayTours };
}

function statusTone(status) {
    if (status === 'RESERVED') return 'success';
    if (status === 'PENDING_VERIFICATION') return 'warning';
    if (status === 'REJECTED') return 'danger';
    return 'neutral';
}

function statusLabel(status) {
    if (status === 'RESERVED') return 'Reserved';
    if (status === 'PENDING_VERIFICATION') return 'Pending';
    if (status === 'REJECTED') return 'Rejected';
    return status || 'Unknown';
}

function paymentTone(pct) {
    if (pct >= 1) return 'success';
    if (pct > 0) return 'warning';
    return 'danger';
}

function paymentLabel(pct) {
    if (pct >= 1) return 'Fully paid';
    if (pct > 0) return 'Partial';
    return 'Unpaid';
}

function meterTone(fill, type = 'tent') {
    if (fill >= (type === 'tour' ? 1 : 0.8)) return 'bg-destructive';
    if (fill >= 0.5) return 'bg-amber-500';
    return type === 'tour' ? 'bg-sky-600' : 'bg-primary';
}

function meterTextTone(fill, type = 'tent') {
    if (fill >= (type === 'tour' ? 1 : 0.8)) return 'text-destructive';
    if (fill >= 0.5) return 'text-amber-700';
    return type === 'tour' ? 'text-sky-700' : 'text-primary';
}

function Dot({ tone, title }) {
    const toneClass = {
        success: 'bg-emerald-600',
        warning: 'bg-amber-500',
        danger: 'bg-destructive',
        info: 'bg-sky-600',
        neutral: 'bg-muted-foreground',
    };

    return (
        <span
            className={cn('size-2 shrink-0 rounded-full border border-card', toneClass[tone] || toneClass.neutral)}
            title={title}
        />
    );
}

function CapacityMeter({ label, value, total, type = 'tent', detail }) {
    const fill = total > 0 ? Math.min(1, value / total) : 0;

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[0.68rem] font-bold text-muted-foreground">{label}</span>
                <span className={cn('text-xs font-black', meterTextTone(fill, type))}>
                    {value}/{total}
                </span>
            </div>
            <progress
                className={cn(
                    'h-1.5 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full',
                    type === 'tour' ? '[&::-webkit-progress-bar]:bg-sky-100' : '[&::-webkit-progress-bar]:bg-muted',
                    type === 'tour' ? '[&::-moz-progress-bar]:bg-sky-600 [&::-webkit-progress-value]:bg-sky-600' : '[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary',
                    fill >= (type === 'tour' ? 1 : 0.8) && '[&::-moz-progress-bar]:bg-destructive [&::-webkit-progress-value]:bg-destructive',
                    fill >= 0.5 && fill < (type === 'tour' ? 1 : 0.8) && '[&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-value]:bg-amber-500'
                )}
                value={value}
                max={total || 1}
                aria-label={label}
            />
            {detail && <p className="m-0 text-[0.65rem] font-medium text-muted-foreground">{detail}</p>}
        </div>
    );
}

function DayCard({ date, bookings, onDayClick, isSelected }) {
    const today = startOfToday();
    const isToday = isSameDay(date, today);
    const isPast = date < today;
    const { tents, tentPax, pending, dayTours } = computeDayData(date, bookings);
    const hasActivity = tents.length > 0 || dayTours.length > 0;

    return (
        <button
            type="button"
            onClick={() => onDayClick(date)}
            className={cn(
                'border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] min-w-0 rounded-[22px] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#c6923f] hover:bg-white',
                isSelected && 'border-[#0a6b5f] bg-[#e7f5ef] shadow-[inset_4px_0_0_#0a6b5f,0_16px_36px_rgba(19,33,31,0.06)]',
                isToday && !isSelected && 'border-[#0a6b5f]/70',
                isPast && !hasActivity && 'opacity-55'
            )}
        >
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="m-0 text-[0.62rem] font-black uppercase tracking-[0.14em] text-muted-foreground">
                        {fmtDay(date)}
                    </p>
                    <p className={cn('m-0 text-xl font-black leading-none text-foreground', isToday && 'text-primary')}>
                        {format(date, 'd')}
                    </p>
                    <p className="m-0 mt-1 text-[0.65rem] font-medium text-muted-foreground">{format(date, 'MMM yyyy')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    {isToday && <StatusBadge tone="success">Today</StatusBadge>}
                    {pending > 0 && <StatusBadge tone="warning">{pending} pending</StatusBadge>}
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <CapacityMeter
                    label="Tent Slots"
                    value={tents.length}
                    total={TENT_CAPACITY}
                    detail={tentPax > 0 ? `${tentPax} pax staying` : null}
                />
                <CapacityMeter label="Day Tours" value={dayTours.length} total={DAY_TOUR_SLOTS} type="tour" />
            </div>
        </button>
    );
}

function CollapsibleRow({ b, onVerify, onEdit }) {
    const [open, setOpen] = useState(false);
    const paid = Number(b.amount_paid || b.verified_paid_total || 0);
    const total = Number(b.total_price || b.lodging_total || b.total_due || 0);
    const isTent = b.booking_type === 'tent_pitching';
    const nights = isTent ? differenceInCalendarDays(parseISO(b.check_out), parseISO(b.check_in)) : null;
    const pct = total > 0 ? paid / total : 0;

    return (
        <Card className={cn('overflow-hidden rounded-[20px] border-transparent bg-[#f7eedf]/44 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition', open && 'bg-[#e7f5ef] shadow-[inset_4px_0_0_#0a6b5f]')}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center gap-2 p-3 text-left transition hover:bg-[#fffdf8]/62"
            >
                <Badge variant="secondary" className="shrink-0 rounded-full text-[0.62rem] font-black">
                    {isTent ? 'Tent' : 'Day'}
                </Badge>
                <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-xs font-black text-foreground">{b.full_name}</p>
                    <p className="m-0 truncate text-[0.66rem] font-semibold text-muted-foreground">
                        {b.booking_ref} Â· {isTent ? `${nights}N` : 'day visit'} Â· {b.guests || b.guest_count || '-'} pax
                    </p>
                </div>
                <Dot tone={paymentTone(pct)} title={paymentLabel(pct)} />
                <Dot tone={statusTone(b.status)} title={statusLabel(b.status)} />
                <ChevronRight className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
            </button>

            {open && (
                <CardContent className="flex flex-col gap-3 bg-[#fffdf8]/56 p-3">
                    <div className={cn('flex flex-wrap items-center gap-1.5 text-[0.72rem] font-bold', isTent ? 'text-primary' : 'text-sky-700')}>
                        <CalendarDays />
                        <span>{fmtDate(b.check_in)}</span>
                        {isTent ? (
                            <>
                                <span className="text-muted-foreground">to</span>
                                <span>{fmtDate(b.check_out)}</span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">Day Tour Visit</span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {[
                            ['Guests', `${b.guests || b.guest_count || '-'} pax`],
                            ['Total', `PHP ${total.toLocaleString()}`],
                            ['Paid', `PHP ${paid.toLocaleString()}`],
                            ['Status', statusLabel(b.status)],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl bg-[#f7eedf]/52 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                <p className="m-0 text-[0.58rem] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                                <p className="m-0 mt-1 text-xs font-bold text-foreground">{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-1">
                        <progress
                            className={cn(
                                'h-1.5 w-full overflow-hidden rounded-full appearance-none [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-bar]:bg-muted',
                                pct >= 1 ? '[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary' : pct > 0 ? '[&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-value]:bg-amber-500' : '[&::-moz-progress-bar]:bg-destructive [&::-webkit-progress-value]:bg-destructive'
                            )}
                            value={Math.min(100, pct * 100)}
                            max={100}
                            aria-label="Payment progress"
                        />
                        <div className="flex items-center justify-between gap-2">
                            <StatusBadge tone={paymentTone(pct)}>{paymentLabel(pct)}</StatusBadge>
                            <span className="text-[0.66rem] font-bold text-muted-foreground">{Math.round(pct * 100)}% settled</span>
                        </div>
                    </div>

                    {(b.phone || b.email) && (
                        <p className="m-0 text-[0.7rem] font-medium text-muted-foreground">
                            {[b.phone, b.email].filter(Boolean).join(' / ')}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {b.status === 'PENDING_VERIFICATION' && (
                            <>
                                <Button size="sm" className="flex-1" onClick={() => onVerify(b.booking_ref, 'approve')}>
                                    Approve
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="flex-1"
                                    onClick={() => onVerify(b.booking_ref, 'reject')}
                                >
                                    Reject
                                </Button>
                            </>
                        )}
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit && onEdit(b)}>
                            Manage {isTent ? 'Tent Booking' : 'Day Tour'}
                        </Button>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

function BookingSection({ title, rows, tone = 'tent', onVerify, onEdit }) {
    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-[0.68rem] font-black uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
                <StatusBadge tone={tone === 'tour' ? 'info' : 'success'}>{rows.length}</StatusBadge>
            </div>
            {rows.length === 0 ? (
                <EmptyState title="No entries" className="border-transparent bg-[#f7eedf]/42 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]" />
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map(b => (
                        <CollapsibleRow key={b.booking_ref} b={b} onVerify={onVerify} onEdit={onEdit} />
                    ))}
                </div>
            )}
        </section>
    );
}

export function SpecialBookingsHub({ bookings = [], onVerify, onRefresh, onEdit, onManualAdd }) {
    const [viewDays, setViewDays] = useState('7');
    const [viewStart, setViewStart] = useState(startOfToday());
    const [selectedDate, setSelectedDate] = useState(startOfToday());

    const days = Number(viewDays);
    const today = startOfToday();

    const timeline = useMemo(
        () => eachDayOfInterval({ start: viewStart, end: addDays(viewStart, days - 1) }),
        [viewStart, days]
    );

    const windowBookings = useMemo(
        () => bookings.filter(b => ['tent_pitching', 'day_tour'].includes(b.booking_type)),
        [bookings]
    );

    const dayBookings = useMemo(() => {
        const d = startOfDay(selectedDate);
        return bookings.filter(b => {
            if (!['tent_pitching', 'day_tour'].includes(b.booking_type)) return false;
            const ci = startOfDay(parseISO(b.check_in));
            if (b.booking_type === 'day_tour') return isSameDay(ci, d);
            const co = startOfDay(parseISO(b.check_out));
            return d >= ci && d < co;
        });
    }, [bookings, selectedDate]);

    const selectedTentBookings = dayBookings.filter(b => b.booking_type === 'tent_pitching');
    const selectedDayTours = dayBookings.filter(b => b.booking_type === 'day_tour');
    const totalTent = bookings.filter(b => b.booking_type === 'tent_pitching' && b.status === 'RESERVED').length;
    const totalDayTours = bookings.filter(b => b.booking_type === 'day_tour' && b.status === 'RESERVED').length;
    const pending = bookings.filter(
        b => ['tent_pitching', 'day_tour'].includes(b.booking_type) && b.status === 'PENDING_VERIFICATION'
    ).length;

    const selectedDayData = computeDayData(selectedDate, bookings);

    return (
        <div className="flex h-full flex-col gap-4">
            <CommandDeck
                eyebrow="Special Window"
                title={`${fmtShort(viewStart)} to ${fmtShort(addDays(viewStart, days - 1))}`}
                description="Review tent pitching and day tour capacity in the same operational rhythm as the sanctuary map."
                primary={(
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-full border border-white/15 bg-white/10 p-1">
                            {VIEWS.map(v => (
                                <button
                                    key={v.id}
                                    type="button"
                                    className={`rounded-full border-0 px-3.5 py-1.5 text-[0.66rem] font-black transition ${viewDays === v.id ? 'bg-[#c6923f] text-white shadow-sm' : 'bg-transparent text-[#fffdf8]/75 hover:bg-white/10 hover:text-white'}`}
                                    onClick={() => setViewDays(v.id)}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                        <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl border-white/20 bg-white/15 text-[#fffdf8] hover:bg-white/25 hover:text-white" onClick={() => setViewStart(addDays(viewStart, -days))}>Prev</Button>
                        <Button type="button" size="sm" className="h-9 rounded-xl border-[#d8a84c] bg-[#c6923f] text-white hover:bg-[#b5842b]" onClick={() => { setViewStart(today); setSelectedDate(today); }}>Today</Button>
                        <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl border-white/20 bg-white/15 text-[#fffdf8] hover:bg-white/25 hover:text-white" onClick={() => setViewStart(addDays(viewStart, days))}>Next</Button>
                        <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl border-white/20 bg-white/15 text-[#fffdf8] hover:bg-white/25 hover:text-white" onClick={onRefresh}>
                            <RefreshCw /> Refresh
                        </Button>
                    </div>
                )}
            >
                <DeckMetricRail intro={<DeckIntro title="Special Color Key" description="Capacity counts match selected date cards" />}>
                    <DeckMetric label="Tent Active" caption="Reserved tent slots" value={totalTent} tone="teal" />
                    <DeckMetric label="Day Tours" caption="Reserved tour slots" value={totalDayTours} tone="blue" />
                    <DeckMetric label="Pending" caption="Awaiting verification" value={pending} tone={pending > 0 ? 'gold' : 'teal'} />
                </DeckMetricRail>
            </CommandDeck>

            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                        {timeline.map(date => (
                            <DayCard
                                key={date.toISOString()}
                                date={date}
                                bookings={windowBookings}
                                onDayClick={setSelectedDate}
                                isSelected={isSameDay(date, selectedDate)}
                            />
                        ))}
                    </div>
                </div>

                <aside className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] flex min-h-0 flex-col gap-4 rounded-[24px] p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="m-0 text-base font-black text-foreground">{format(selectedDate, 'EEEE, MMM d')}</h3>
                            <p className="m-0 mt-1 text-xs font-semibold text-muted-foreground">
                                {dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''} on this date
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => onManualAdd && onManualAdd(selectedDate, 'tent_pitching')}
                            >
                                <Plus />
                                Tent
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-transparent bg-sky-50 text-sky-800 hover:bg-sky-100"
                                onClick={() => onManualAdd && onManualAdd(selectedDate, 'day_tour')}
                            >
                                <Plus />
                                Day
                            </Button>
                        </div>
                    </div>

                    <Card className="rounded-2xl border-transparent bg-[#f7eedf]/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="flex flex-col gap-4 p-4">
                            <CapacityMeter
                                label="Tent Slots Used"
                                value={selectedDayData.tents.length}
                                total={TENT_CAPACITY}
                                detail={`${selectedDayData.tentPax} pax in tents`}
                            />
                            <CapacityMeter
                                label="Day Tour Slots"
                                value={selectedDayData.dayTours.length}
                                total={DAY_TOUR_SLOTS}
                                type="tour"
                                detail={`${selectedDayData.dayTours.length} day tour${selectedDayData.dayTours.length === 1 ? '' : 's'}`}
                            />
                        </CardContent>
                    </Card>

                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.68rem] font-bold text-muted-foreground">
                        <span>Payment: Paid / Partial / Unpaid</span>
                        <span>Status: Reserved / Pending</span>
                    </div>

                    <BookingSection title="Tent Pitching" rows={selectedTentBookings} onVerify={onVerify} onEdit={onEdit} />
                    <BookingSection title="Day Tours" rows={selectedDayTours} tone="tour" onVerify={onVerify} onEdit={onEdit} />
                </aside>
            </div>
        </div>
    );
}
