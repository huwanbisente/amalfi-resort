import React from 'react';
import { Card, CardContent } from '@/components/shared';

export function BookingHistoryPanel({ history }) {
    return (
        <section className="grid gap-4">
            <div>
                <h2 className="m-0 text-base font-black text-foreground">History</h2>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-muted-foreground">
                    This keeps the workspace audit-friendly even before full edit flows move here.
                </p>
            </div>

            <div className="grid gap-3">
                {history.length === 0 ? (
                    <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="p-4 text-sm font-bold text-muted-foreground">
                            No timeline events are available yet.
                        </CardContent>
                    </Card>
                ) : history.map((event) => (
                    <Card key={event.id} className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <CardContent className="grid gap-2 p-4">
                            <div className="flex flex-wrap justify-between gap-3">
                                <div className="font-black text-foreground">{event.title}</div>
                                <div className="text-xs font-bold text-muted-foreground">{event.timestamp || 'No timestamp'}</div>
                            </div>
                            {event.detail && (
                                <div className="text-sm font-semibold leading-relaxed text-muted-foreground">{event.detail}</div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}
