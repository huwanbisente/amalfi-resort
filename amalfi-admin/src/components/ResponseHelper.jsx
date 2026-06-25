import React, { useMemo, useState } from 'react';
import { Bot, Clipboard, Loader2, Send, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { QuickParsedBookingPanel } from './QuickParsedBookingPanel';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from '@/components/shared';

const fmtCur = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
}).format(value || 0);

function Detail({ label, value }) {
    return (
        <div className="rounded-xl bg-[#f7eedf]/48 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <div className="text-[0.58rem] font-black uppercase tracking-normal text-amalfi-muted">{label}</div>
            <div className="mt-1 text-sm font-black text-amalfi-ink">{value || 'Not detected'}</div>
        </div>
    );
}

function ToneSelect({ value, onChange }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-11 min-w-[150px] rounded-xl border-transparent bg-[#f7eedf]/58 font-black text-amalfi-ink shadow-none">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

export function ResponseHelper() {
    const [message, setMessage] = useState('');
    const [tone, setTone] = useState('friendly');
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [bookingResult, setBookingResult] = useState(null);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

    const topSuggestion = useMemo(
        () => draft?.suggestions?.[selectedSuggestionIndex] || draft?.suggestions?.[0] || null,
        [draft, selectedSuggestionIndex]
    );

    const generateDraft = async () => {
        setError('');
        setCopied(false);
        setLoading(true);
        try {
            const result = await api.post('/api/v1/admin/response-helper/draft', { message, tone });
            setDraft(result);
            setSelectedSuggestionIndex(0);
            setBookingResult(null);
        } catch (err) {
            setError(err.message || 'Failed to generate response.');
        } finally {
            setLoading(false);
        }
    };

    const copyReply = async () => {
        if (!draft?.reply) return;
        await navigator.clipboard.writeText(draft.reply);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };

    return (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
            <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                <CardContent className="p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-2xl bg-amalfi-emerald/10 text-amalfi-emerald">
                            <Bot />
                        </div>
                        <div>
                            <div className="text-base font-black text-amalfi-ink">Paste Guest Inquiry</div>
                            <div className="text-xs font-semibold text-amalfi-muted">Uses live units, bookings, and the knowledge base.</div>
                        </div>
                    </div>

                    <Textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Paste all customer messages here..."
                        className="min-h-[260px] w-full resize-y rounded-2xl border-transparent bg-[#f7eedf]/42 px-4 py-3 text-sm font-semibold leading-6 text-amalfi-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] outline-none transition placeholder:text-muted-foreground focus:border-amalfi-emerald focus:ring-1 focus:ring-amalfi-emerald"
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <ToneSelect value={tone} onChange={setTone} />
                        <Button
                            type="button"
                            onClick={generateDraft}
                            disabled={loading || !message.trim()}
                            className="h-11 rounded-xl bg-amalfi-emerald px-5 font-black text-white hover:bg-amalfi-emerald/90"
                        >
                            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                            Generate Draft
                        </Button>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-xl bg-amalfi-coral/10 p-3 text-sm font-bold text-amalfi-coral shadow-[inset_4px_0_0_rgba(200,74,74,0.36)]">
                            {error}
                        </div>
                    )}

                    {draft?.suggestions?.length > 0 && (
                        <QuickParsedBookingPanel
                            analysis={draft}
                            source="Response Helper"
                            inquiryText={message}
                            title="Quick Manual Booking"
                            subtitle="Create the real booking and record payment collected today."
                            successPrefix="Manual booking created"
                            onCreated={setBookingResult}
                        />
                    )}

                    {bookingResult?.header?.booking_reference && (
                        <div className="mt-4 rounded-xl bg-amalfi-emerald/10 p-3 text-xs font-black text-amalfi-emerald shadow-[inset_4px_0_0_rgba(10,107,95,0.36)]">
                            Manual booking created: {bookingResult.header.booking_reference}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
                <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                    <CardHeader className="flex flex-row items-center justify-between gap-3 p-5 pb-0">
                        <div>
                            <div className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-gold">Interpretation</div>
                            <CardTitle className="mt-1 text-base font-black text-amalfi-ink">Detected booking context</CardTitle>
                        </div>
                        <div className="inline-flex items-center gap-2 text-xs font-black text-amalfi-emerald">
                            <ShieldCheck />
                            Live-check guarded
                        </div>
                    </CardHeader>
                    <CardContent className="p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Detail label="Check-in" value={draft?.context?.check_in} />
                            <Detail label="Check-out" value={draft?.context?.check_out} />
                            <Detail label="Pax" value={draft?.context?.guests ? `${draft.context.guests} pax` : ''} />
                            <Detail label="Room Type" value={draft?.context?.room_type} />
                        </div>

                        {draft?.warnings?.length > 0 && (
                            <div className="mt-4 rounded-2xl bg-amalfi-coral/10 p-4 text-sm font-bold text-amalfi-coral shadow-[inset_4px_0_0_rgba(200,74,74,0.36)]">
                                {draft.warnings.join(' ')}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                    <CardHeader className="flex flex-row items-center justify-between gap-3 p-5 pb-0">
                        <div>
                            <div className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-gold">Draft Reply</div>
                            <CardTitle className="mt-1 text-base font-black text-amalfi-ink">Review before sending</CardTitle>
                        </div>
                        <Button
                            type="button"
                            onClick={copyReply}
                            disabled={!draft?.reply}
                            variant={copied ? 'default' : 'outline'}
                            className="rounded-xl font-black"
                        >
                            <Clipboard data-icon="inline-start" />
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                    </CardHeader>
                    <CardContent className="p-5">
                        <Textarea
                            value={draft?.reply || ''}
                            onChange={(event) => setDraft((current) => current ? { ...current, reply: event.target.value } : current)}
                            placeholder="Generated reply will appear here..."
                            className="min-h-[260px] w-full resize-y rounded-2xl border-transparent bg-[#f7eedf]/42 px-4 py-3 text-sm font-semibold leading-6 text-amalfi-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] outline-none transition placeholder:text-muted-foreground focus:border-amalfi-emerald focus:ring-1 focus:ring-amalfi-emerald disabled:opacity-60"
                        />
                    </CardContent>
                </Card>

                {draft?.live_inventory?.checked && (
                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardContent className="p-5">
                            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-base font-black text-amalfi-ink">Live Availability Snapshot</div>
                                <div className="font-black text-amalfi-emerald">{draft.live_inventory.available_unit_count} unit(s) available</div>
                            </div>
                            {topSuggestion && (
                                <div className="mb-4 rounded-2xl bg-amalfi-emerald/10 p-4 shadow-[inset_4px_0_0_rgba(10,107,95,0.32)]">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-muted">Selected fit</div>
                                        {draft.suggestions.length > 1 && (
                                            <Select value={String(selectedSuggestionIndex)} onValueChange={(value) => setSelectedSuggestionIndex(Number(value))}>
                                                <SelectTrigger className="h-9 min-w-[220px] rounded-xl border-transparent bg-[#fffdf8]/70 font-bold shadow-none">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        {draft.suggestions.map((suggestion, index) => (
                                                            <SelectItem key={suggestion.unit_ids?.join('-') || index} value={String(index)}>
                                                                Option {index + 1}: {suggestion.summary?.total_units || 0} unit(s), {fmtCur(suggestion.summary?.total_amount || 0)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                    <div className="mt-3 text-sm font-black text-amalfi-ink">
                                        {(topSuggestion.units || []).map((unit) => unit.unit_label || unit.unit_id).join(', ')}
                                    </div>
                                    <div className="mt-1 text-xs font-bold text-amalfi-muted">
                                        {topSuggestion.summary?.total_units || 0} unit(s), capacity up to {topSuggestion.summary?.total_absolute_capacity || 0} pax, estimated {fmtCur(topSuggestion.summary?.total_amount || 0)}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {(draft.live_inventory.available_units || []).slice(0, 10).map((unit) => (
                                    <Badge key={unit.unit_id} variant="secondary" className="rounded-lg font-black">
                                        {unit.unit_label || unit.unit_id}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
