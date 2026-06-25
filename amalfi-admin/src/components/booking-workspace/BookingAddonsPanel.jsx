import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, Input } from '@/components/shared';
import { validateAddonDraft } from '../../utils/bookingWorkspaceLogic';

const labelClass = 'mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.08em] text-muted-foreground';
const inputClass = 'h-11 rounded-xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] font-bold text-foreground shadow-[0_10px_22px_rgba(19,33,31,0.045)]';

const PRESET_CHARGES = [
    { label: 'Extra Mattress', amount: 500 },
    { label: 'Late Checkout', amount: 1000 },
    { label: 'Additional Cleaning', amount: 1500 },
    { label: 'Bonfire Setup', amount: 1500 },
];

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

function MoneyMetric({ label, value }) {
    return (
        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <CardContent className="p-4">
                <div className="mb-2 text-[0.62rem] font-black uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
                <div className="text-lg font-black text-foreground">{value}</div>
            </CardContent>
        </Card>
    );
}

export function BookingAddonsPanel({
    booking,
    totals,
    addons = [],
    canAddAddons,
    onSubmitAddonCharge,
    addonSaving,
    addonError,
    addonSuccess
}) {
    const [draft, setDraft] = useState({ item_name: '', amount: '' });
    const [showValidation, setShowValidation] = useState(false);

    const validationMessage = useMemo(() => validateAddonDraft(draft), [draft]);
    const canSubmit = useMemo(
        () => canAddAddons && !validationMessage,
        [canAddAddons, validationMessage]
    );

    useEffect(() => {
        setShowValidation(false);
    }, [booking?.booking_ref, addonSuccess]);

    const handlePreset = (preset) => {
        setShowValidation(true);
        setDraft({ item_name: preset.label, amount: String(preset.amount) });
    };

    const handleSubmit = async () => {
        if (!onSubmitAddonCharge) return;
        setShowValidation(true);
        const ok = await onSubmitAddonCharge({
            item_name: String(draft.item_name || '').trim(),
            amount: Number(draft.amount || 0)
        });

        if (ok) {
            setDraft({ item_name: '', amount: '' });
            setShowValidation(false);
        }
    };

    return (
        <section className="grid gap-4">
            <div>
                <h2 className="m-0 text-base font-black text-foreground">Add-Ons</h2>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-muted-foreground">
                    This panel handles operational charges directly inside the booking workspace.
                </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <MoneyMetric label="Current Add-Ons" value={`PHP ${Number(totals.addonTotal || 0).toLocaleString()}`} />
                <MoneyMetric label="Grand Total" value={`PHP ${Number(totals.grandTotal || 0).toLocaleString()}`} />
            </div>

            {addonError && <PanelMessage tone="danger">{addonError}</PanelMessage>}
            {addonSuccess && <PanelMessage tone="success">{addonSuccess}</PanelMessage>}
            {canAddAddons && showValidation && validationMessage && <PanelMessage>{validationMessage}</PanelMessage>}

            <div className="grid gap-3">
                {addons.length === 0 ? (
                    <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="p-4 text-sm font-bold text-muted-foreground">
                            No add-on entries are recorded for this booking yet.
                        </CardContent>
                    </Card>
                ) : addons.map((addon) => (
                    <Card key={addon.id} className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="grid gap-2 p-4">
                            <div className="flex flex-wrap justify-between gap-3">
                                <div className="font-black text-foreground">{addon.item_name}</div>
                                <div className="font-black text-amber-800">PHP {Number(addon.amount || 0).toLocaleString()}</div>
                            </div>
                            <div className="text-xs font-semibold text-muted-foreground">
                                {[addon.source === 'header' ? 'Header Add-on' : 'Legacy Charge', addon.created_at].filter(Boolean).join(' â€¢ ')}
                            </div>
                            {addon.notes && (
                                <div className="text-xs font-semibold leading-relaxed text-muted-foreground">{addon.notes}</div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                <CardContent className="grid gap-4 p-5">
                    <div>
                        <div className="text-sm font-black text-foreground">Quick Add-On Charge</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                            Charges posted here increase the aggregate add-on total and flow into the booking balance.
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {PRESET_CHARGES.map((preset) => (
                            <Button
                                key={`${preset.label}-${preset.amount}`}
                                type="button"
                                variant="outline"
                                className="rounded-xl text-xs font-black"
                                onClick={() => handlePreset(preset)}
                                disabled={!canAddAddons || addonSaving}
                            >
                                {preset.label} Â· PHP {preset.amount.toLocaleString()}
                            </Button>
                        ))}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div>
                            <label className={labelClass}>Item Name</label>
                            <Input
                                className={inputClass}
                                value={draft.item_name}
                                onChange={(e) => {
                                    setShowValidation(true);
                                    setDraft((current) => ({ ...current, item_name: e.target.value }));
                                }}
                                disabled={!canAddAddons || addonSaving}
                                placeholder="Extra charge label"
                            />
                        </div>
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
                                disabled={!canAddAddons || addonSaving}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-semibold leading-relaxed text-muted-foreground">
                            Booking: <strong>{booking?.booking_ref || 'Unknown ref'}</strong>
                        </div>
                        <Button
                            type="button"
                            className="rounded-xl font-black"
                            disabled={!canSubmit || addonSaving}
                            onClick={handleSubmit}
                        >
                            {addonSaving ? 'Adding...' : 'Add Add-On'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
