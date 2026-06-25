import React, { useMemo, useState } from 'react';
import { Button, Card, CardContent, StatusBadge } from '@/components/shared';
import { DEFAULT_ALLOCATION_STATUS, getUnitDraftState } from '../../utils/bookingWorkspaceLogic';

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

export function BookingUnitsPanel({
    units,
    availableUnits = [],
    canEditUnits = false,
    onSubmitItemUpdate,
    itemSavingId,
    itemError,
    itemSuccess
}) {
    const [drafts, setDrafts] = useState({});

    const groupedChoices = useMemo(() => {
        return units.reduce((acc, unit) => {
            const roomType = unit.roomType || '';
            acc[unit.id] = availableUnits.filter((candidate) => {
                const candidateType = candidate.room_type || candidate.room_type_id || '';
                return candidateType === roomType;
            });
            return acc;
        }, {});
    }, [availableUnits, units]);

    const handleDraftChange = (unitId, key, value) => {
        setDrafts((current) => ({
            ...current,
            [unitId]: {
                unit_id: current[unitId]?.unit_id ?? units.find((item) => item.id === unitId)?.unitId ?? '',
                status: current[unitId]?.status ?? units.find((item) => item.id === unitId)?.status ?? DEFAULT_ALLOCATION_STATUS,
                ...current[unitId],
                [key]: value
            }
        }));
    };

    const handleApply = async (unit) => {
        if (!onSubmitItemUpdate) return;
        const draft = drafts[unit.id] || { unit_id: unit.unitId || '', status: unit.status || DEFAULT_ALLOCATION_STATUS };
        await onSubmitItemUpdate({
            itemId: unit.id,
            unit_id: draft.unit_id || null,
            status: draft.status || unit.status || DEFAULT_ALLOCATION_STATUS
        });
    };

    return (
        <section className="grid gap-4">
            <div>
                <h2 className="m-0 text-base font-black text-foreground">Rooms</h2>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-muted-foreground">
                    Review assigned rooms and move a booking to another available unit when needed.
                </p>
            </div>

            {!canEditUnits && (
                <PanelMessage>Room changes are read-only for older imported bookings. Use the guest/date tab and ledger actions for now.</PanelMessage>
            )}
            {itemError && <PanelMessage tone="danger">{itemError}</PanelMessage>}
            {itemSuccess && <PanelMessage tone="success">{itemSuccess}</PanelMessage>}

            <div className="grid gap-3">
                {units.length === 0 ? (
                    <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="p-4 text-sm font-bold text-muted-foreground">
                            No unit allocations are attached to this booking yet.
                        </CardContent>
                    </Card>
                ) : units.map((unit) => (
                    <Card key={unit.id} className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="grid gap-4 p-4">
                            {(() => {
                                const unitChoices = groupedChoices[unit.id] || [];
                                const draft = drafts[unit.id] || {};
                                const { hasMatchingUnits, hasChanges, canApply } = getUnitDraftState(unit, draft, unitChoices);

                                return (
                                    <>
                                        <div className="flex flex-wrap justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-[0.08em] text-muted-foreground">{unit.roomType}</div>
                                                <div className="mt-1 text-base font-black text-foreground">{unit.unitLabel}</div>
                                            </div>
                                            <StatusBadge tone={unit.status === 'CANCELLED' ? 'danger' : 'success'}>{unit.status}</StatusBadge>
                                        </div>

                                        <div className="grid gap-2 text-sm font-semibold text-foreground sm:grid-cols-3">
                                            <div><strong>Pax:</strong> {unit.guest_count ?? unit.guests ?? 0}</div>
                                            <div><strong>Subtotal:</strong> PHP {Number(unit.lodging_subtotal ?? unit.subtotal ?? 0).toLocaleString()}</div>
                                            <div><strong>Unit ID:</strong> {unit.unitId || 'Unassigned'}</div>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>Assigned Unit</label>
                                                <select
                                                    className={selectClass}
                                                    value={drafts[unit.id]?.unit_id ?? unit.unitId ?? ''}
                                                    onChange={(e) => handleDraftChange(unit.id, 'unit_id', e.target.value)}
                                                    disabled={!canEditUnits || String(itemSavingId) === String(unit.id)}
                                                >
                                                    <option value="">Unassigned / Hold</option>
                                                    {unitChoices.map((candidate) => (
                                                        <option key={candidate.unit_id} value={candidate.unit_id}>
                                                            {candidate.unit_label || candidate.unit_id}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className={labelClass}>Item Status</label>
                                                <select
                                                    className={selectClass}
                                                    value={drafts[unit.id]?.status ?? unit.status ?? DEFAULT_ALLOCATION_STATUS}
                                                    onChange={(e) => handleDraftChange(unit.id, 'status', e.target.value)}
                                                    disabled={!canEditUnits || String(itemSavingId) === String(unit.id)}
                                                >
                                                    <option value="PENDING_VERIFICATION">Pending Verification</option>
                                                    <option value="RESERVED">Reserved</option>
                                                    <option value="CHECKED_IN">Checked In</option>
                                                    <option value="CANCELLED">Cancelled</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-xs font-semibold leading-relaxed text-muted-foreground">
                                                Matching room-type options: <strong>{unitChoices.length}</strong>
                                            </div>
                                            <Button
                                                type="button"
                                                className="rounded-xl font-black"
                                                disabled={!canEditUnits || String(itemSavingId) === String(unit.id) || !canApply}
                                                onClick={() => handleApply(unit)}
                                            >
                                                {String(itemSavingId) === String(unit.id) ? 'Applying...' : 'Apply Unit Change'}
                                            </Button>
                                        </div>

                                        {!hasMatchingUnits && (
                                            <div className="text-xs font-bold leading-relaxed text-amber-800">
                                                No matching units are currently available for this room type. You can still update the item status if needed.
                                            </div>
                                        )}

                                        {hasMatchingUnits && !hasChanges && (
                                            <div className="text-xs font-bold leading-relaxed text-muted-foreground">
                                                No pending unit or status changes for this allocation yet.
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}
