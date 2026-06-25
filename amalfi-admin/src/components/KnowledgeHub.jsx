import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CommandDeck,
    EmptyState,
    Input,
    LoadingState,
} from '@/components/shared';

const fmtCur = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
}).format(value || 0);

const titleCase = (value = '') => value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

function ImageHeader({ src, alt, label, heightClass = 'h-24' }) {
    return (
        <div className={`relative overflow-hidden bg-amalfi-emerald/10 ${heightClass}`}>
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    className="block size-full object-cover"
                />
            ) : (
                <div className="flex size-full items-center justify-center text-sm font-black text-amalfi-muted">
                    No image
                </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/[0.02] to-black/30" />
            {label && (
                <Badge variant="secondary" className="absolute bottom-2 left-3 rounded-full bg-[#fffdf8]/90 px-2 py-0.5 text-[0.56rem] font-black uppercase tracking-normal text-amalfi-emerald">
                    {label}
                </Badge>
            )}
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-[#f7eedf]/42 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <span className="text-sm font-bold text-amalfi-muted">{label}</span>
            <span className="text-right text-sm font-black text-amalfi-ink">{value}</span>
        </div>
    );
}

export function KnowledgeHub() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeSection, setActiveSection] = useState('rooms');

    useEffect(() => {
        api.get('/api/v1/admin/knowledge')
            .then(payload => {
                setData(payload);
                setLoading(false);
            })
            .catch(error => {
                console.error(error);
                setLoading(false);
            });
    }, []);

    const filteredRooms = useMemo(() => {
        if (!data?.accommodations) return [];
        const query = search.trim().toLowerCase();
        if (!query) return data.accommodations;
        return data.accommodations.filter(room =>
            room.name?.toLowerCase().includes(query) ||
            room.type?.toLowerCase().includes(query) ||
            (room.features || []).some(feature => String(feature).toLowerCase().includes(query))
        );
    }, [data, search]);

    if (loading) return <LoadingState label="Synchronizing Master Knowledge..." />;
    if (!data) {
        return (
            <EmptyState
                title="Knowledge base unavailable"
                description="Failed to load Knowledge Base."
                className="border-amalfi-coral/25 bg-amalfi-coral/5"
            />
        );
    }

    const navBtn = (id, label) => (
        <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`h-8 rounded-full border-0 px-3 text-[0.66rem] font-black transition ${activeSection === id ? 'bg-[#fffdf8] text-[#173c36] shadow-sm' : 'bg-transparent text-[#fffdf8]/75 hover:bg-white/10 hover:text-white'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 flex flex-col gap-6">
            <CommandDeck
                eyebrow="Knowledge Controls"
                title="Concierge source of truth"
                description="Search rooms, services, rules, policies, add-ons, and kitchen details from one controlled deck."
                primary={(
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                            {navBtn('rooms', 'Accommodations')}
                            {navBtn('specials', 'Special Services')}
                            {navBtn('policies', 'Rules & Policies')}
                            {navBtn('addons', 'Add-ons & Kitchen')}
                        </div>
                        <input
                            type="text"
                            placeholder="Search rooms, rates, or rules..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="h-9 w-[270px] rounded-xl border border-white/20 bg-white/15 px-3 text-[0.68rem] font-bold text-[#fffdf8] outline-none placeholder:text-[#fffdf8]/55 focus:border-[#f4d89a]/70 focus:bg-white/20"
                        />
                    </div>
                )}
            />

            {activeSection === 'rooms' && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {filteredRooms.length === 0 && (
                        <EmptyState title="No matching rooms" description="Try another room name, rate, or feature." className="md:col-span-2 2xl:col-span-3" />
                    )}
                    {filteredRooms.map((room) => (
                        <Card key={room.name} className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] flex overflow-hidden rounded-[16px]">
                            <div className="flex min-w-0 flex-1 flex-col">
                                <ImageHeader src={room.image} alt={room.name} label={room.type} />
                                <CardContent className="p-3">
                                    <div className="text-[0.52rem] font-black uppercase tracking-[0.12em] text-amalfi-gold">Room Type</div>
                                    <div className="mt-0.5 text-[0.92rem] font-black leading-tight text-amalfi-ink">{room.name}</div>

                                    <div className="mt-2 flex flex-col gap-1">
                                        {(room.rates || []).map((rate, index) => (
                                            <div key={`${room.name}-rate-${index}`} className="flex justify-between gap-3 rounded-lg bg-[#f7eedf]/52 px-2.5 py-1 text-[0.66rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                                <span className="font-bold text-amalfi-ink">{rate.min_pax === rate.max_pax ? `${rate.max_pax} Pax` : `${rate.min_pax}-${rate.max_pax} Pax`}</span>
                                                <span className="font-black text-amalfi-emerald">{fmtCur(rate.price_php)}</span>
                                            </div>
                                        ))}
                                        {room.extra_pax && (
                                            <div className="px-2.5 py-0.5 text-[0.62rem] font-semibold text-amalfi-muted">
                                                Extra guest: <b className="text-amalfi-ink">{fmtCur(room.extra_pax.price_per_head_php)}</b> / head. Max {room.extra_pax.max_capacity_pax} pax.
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-2.5 rounded-xl bg-[#f7eedf]/36 p-2.5">
                                        <div className="mb-1.5 text-[0.5rem] font-black uppercase tracking-[0.12em] text-amalfi-muted">Key Features</div>
                                        <ul className="m-0 grid list-none gap-1 p-0">
                                            {(room.features || []).map((feature) => (
                                                <li key={feature} className="grid grid-cols-[6px_minmax(0,1fr)] items-start gap-1.5 text-[0.61rem] font-semibold leading-snug text-amalfi-emerald">
                                                    <span className="mt-[0.28rem] size-1 rounded-full bg-amalfi-gold" aria-hidden="true" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </CardContent>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {activeSection === 'specials' && (
                <div className="grid gap-5 lg:grid-cols-2">
                    {Object.entries(data.special_bookings || {}).map(([key, value]) => (
                        <Card key={key} className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[24px]">
                            <ImageHeader src={value.image} alt={value.marketing_name || titleCase(key)} label={value.marketing_name || titleCase(key)} heightClass="h-52" />
                            <CardContent className="p-6">
                                <div className="text-xl font-black text-amalfi-ink">{value.marketing_name || titleCase(key)}</div>
                                <p className="mt-2 text-sm font-semibold leading-6 text-amalfi-muted">{value.description}</p>
                                <div className="mt-5 flex flex-col gap-3">
                                    {value.weekends && (
                                        <div className="rounded-2xl bg-amalfi-gold/10 p-4">
                                            <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-gold">Weekend Rates</div>
                                            <div className="mt-1 flex justify-between gap-3 text-sm font-black text-amalfi-ink">
                                                <span>Entrance Fee</span>
                                                <span>{fmtCur(value.weekends.entrance_fee_per_head_php)}/head</span>
                                            </div>
                                        </div>
                                    )}
                                    {value.price_php && (
                                        <div className="rounded-2xl bg-amalfi-emerald/10 p-4">
                                            <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-emerald">Flat Rate</div>
                                            <div className="mt-1 flex justify-between gap-3 text-sm font-black text-amalfi-ink">
                                                <span>{value.unit || 'Price'}</span>
                                                <span>{fmtCur(value.price_php)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {activeSection === 'policies' && (
                <div className="grid gap-5 lg:grid-cols-2">
                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardHeader>
                            <CardTitle className="text-lg font-black text-amalfi-ink">Check-In & Check-Out</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <InfoRow label="Standard Check-In" value={data.check_in_out?.check_in_time} />
                            <InfoRow label="Standard Check-Out" value={data.check_in_out?.check_out_time} />
                            <InfoRow label="Extension Rate" value={`${fmtCur(data.check_in_out?.room_extension?.price_php)} / hour`} />
                        </CardContent>
                    </Card>

                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardHeader>
                            <CardTitle className="text-lg font-black text-amalfi-ink">Kids Policy</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-2xl border-l-4 border-amalfi-emerald bg-amalfi-emerald/10 p-5">
                                <div className="text-sm font-bold leading-6 text-amalfi-ink">{data.booking_rules?.kids_policy?.policy_note}</div>
                                <div className="mt-3 text-xs font-black text-amalfi-muted">
                                    Limit: {data.booking_rules?.kids_policy?.free_kids_per_villa} kids, age {data.booking_rules?.kids_policy?.free_kids_age_limit} and under.
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px] lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg font-black text-amalfi-ink">Cancellation & Rebooking Policy</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-3">
                            {(data.booking_and_cancellation_policies?.cancellation_policy || []).map((policy, index) => (
                                <div key={`${policy.condition}-${index}`} className="rounded-2xl bg-[#f7eedf]/48 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-muted">{policy.condition}</div>
                                    <div className={index === 0 ? 'mt-1 text-2xl font-black text-amalfi-emerald' : 'mt-1 text-2xl font-black text-amalfi-ink'}>
                                        {policy.action || `${policy.refund_percent}% Refund`}
                                    </div>
                                    {policy.notes && <div className="mt-1 text-xs font-semibold text-amalfi-muted">{policy.notes}</div>}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeSection === 'addons' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardHeader>
                            <CardTitle className="text-lg font-black text-amalfi-ink">Resort Add-ons</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {(data.add_ons || []).map((addon) => (
                                <div key={addon.name} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f7eedf]/48 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <span className="text-sm font-black text-amalfi-ink">{addon.name}</span>
                                    <span className="text-sm font-black text-amalfi-emerald">{fmtCur(addon.price_php || 0)}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardHeader>
                            <CardTitle className="text-lg font-black text-amalfi-ink">Kitchen Equipment</CardTitle>
                            <p className="m-0 text-sm font-semibold text-amalfi-muted">{data.kitchen_rental?.description}</p>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-2xl bg-[#f7eedf]/48 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                <div className="mb-4 flex justify-between gap-3 text-sm font-black text-amalfi-ink">
                                    <span>Complete Set</span>
                                    <span className="text-amalfi-gold">{fmtCur(data.kitchen_rental?.package?.price_php)}</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {(data.kitchen_rental?.package?.items || []).map((item) => (
                                        <div key={item} className="text-xs font-bold text-amalfi-ink">{item}</div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
