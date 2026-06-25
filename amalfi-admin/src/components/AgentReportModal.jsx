import React from 'react';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const fmtCur = (v) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v);

function MetricCard({ label, value, accent = false }) {
    return (
        <Card className={cn('rounded-2xl border-[#d8c9b3]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]', accent ? 'bg-amalfi-emerald/5' : 'bg-[#fffdf8]/88')}>
            <CardContent className="p-5">
                <div className="text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">{label}</div>
                <div className={cn('mt-2 text-xl font-black', accent ? 'text-amalfi-emerald' : 'text-amalfi-ink')}>
                    {value}
                </div>
            </CardContent>
        </Card>
    );
}

export function AgentReportModal({ onClose, agentName, commission, bookings, totalRev }) {
    const handlePrint = () => {
        window.print();
    };

    const metrics = {
        avgComm: commission / (bookings.length || 1),
        volShare: (commission / (totalRev || 1)) * 100
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent
                id="agent-invoice-root"
                className="flex h-[90vh] w-[min(850px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] p-0 text-amalfi-ink shadow-[0_50px_150px_rgba(23,51,48,0.34)]"
            >
                <DialogHeader className="no-print flex-row items-center justify-between gap-4 border-b border-transparent bg-[#f7eedf]/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] px-6 py-4 text-left">
                    <div>
                        <DialogTitle className="text-xs font-black uppercase tracking-normal text-amalfi-muted">
                            Agent Earnings Statement
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Printable commission invoice for {agentName}.
                        </DialogDescription>
                    </div>
                    <div className="flex items-center gap-3 pr-8">
                        <Button onClick={handlePrint} size="sm" className="rounded-xl bg-amalfi-emerald font-black text-white hover:bg-amalfi-emerald/90">
                            <Printer data-icon="inline-start" />
                            Print Invoice
                        </Button>
                        <Button onClick={onClose} size="sm" variant="outline" className="rounded-xl font-black">
                            Close
                        </Button>
                    </div>
                </DialogHeader>

                <div className="printable-invoice flex-1 overflow-y-auto px-6 py-8 sm:px-10 lg:px-[60px] lg:py-[50px]">
                    <div className="mb-12 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-5">
                            <img
                                src="/api/v1/assets/logo/resort-logo.png"
                                alt="Logo"
                                className="size-20 object-contain"
                            />
                            <div>
                                <h1 className="m-0 font-resortDisplay text-3xl font-black tracking-normal text-amalfi-ink">
                                    Amalfi Sanctuary
                                </h1>
                                <div className="mt-1 text-xs font-black uppercase tracking-normal text-amalfi-emerald">
                                    Concierge Services
                                </div>
                            </div>
                        </div>
                        <div className="text-left sm:text-right">
                            <div className="text-xl font-black text-amalfi-ink">INVOICE</div>
                            <div className="mt-1 text-xs font-semibold text-amalfi-muted">
                                Ref: BS-AGNT-{format(new Date(), 'yyyyMMdd')}
                            </div>
                            <div className="text-xs font-semibold text-amalfi-muted">
                                Date: {format(new Date(), 'MMMM d, yyyy')}
                            </div>
                        </div>
                    </div>

                    <div className="mb-10 grid gap-8 border-b-2 border-amalfi-ink pb-8 sm:grid-cols-2">
                        <div>
                            <div className="mb-2 text-[0.68rem] font-black uppercase tracking-normal text-amalfi-muted">From (Agent)</div>
                            <div className="text-lg font-black text-amalfi-ink">{agentName}</div>
                            <div className="mt-1 text-sm font-semibold leading-6 text-amalfi-muted">
                                Certified Property Representative<br />Amalfi Sanctuary Resort Complex
                            </div>
                        </div>
                        <div className="sm:text-right">
                            <div className="mb-2 text-[0.68rem] font-black uppercase tracking-normal text-amalfi-muted">To (Client)</div>
                            <div className="text-lg font-black text-amalfi-ink">Management Board</div>
                            <div className="mt-1 text-sm font-semibold leading-6 text-amalfi-muted">
                                Amalfi Sanctuary Operations Unit<br />Finance & Distributions Dept.
                            </div>
                        </div>
                    </div>

                    <div className="mb-10 grid gap-4 md:grid-cols-3">
                        <MetricCard label="Volume Managed" value={`${bookings.length} Bookings`} />
                        <MetricCard label="Avg Comm / Stay" value={fmtCur(metrics.avgComm)} />
                        <MetricCard label="Total Net Payable" value={fmtCur(commission)} accent />
                    </div>

                    <div className="mb-14 overflow-hidden rounded-2xl border border-[#d8c9b3]/70">
                        <Table>
                            <TableHeader className="bg-amalfi-ink">
                                <TableRow className="border-amalfi-ink hover:bg-amalfi-ink">
                                    <TableHead className="px-4 text-xs font-black text-white">DATE</TableHead>
                                    <TableHead className="px-4 text-xs font-black text-white">GUEST / REFERENCE</TableHead>
                                    <TableHead className="px-4 text-right text-xs font-black text-white">GROSS SALES</TableHead>
                                    <TableHead className="px-4 text-right text-xs font-black text-white">COMM (2.5%)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bookings.map((b, i) => {
                                    const gross = Number(b.total_price || 0) + Number(b.addon_amount || 0);
                                    const comm = gross * 0.025;
                                    return (
                                        <TableRow key={i} className="border-[#d8c9b3]/70">
                                            <TableCell className="px-4 py-4 text-sm font-semibold text-amalfi-ink">
                                                {format(parseISO(b.created_at || new Date().toISOString()), 'MMM dd, yyyy')}
                                            </TableCell>
                                            <TableCell className="px-4 py-4">
                                                <div className="text-sm font-black text-amalfi-ink">{b.full_name}</div>
                                                <div className="mt-1 text-xs font-semibold text-amalfi-muted">{b.room_type} | {b.booking_ref}</div>
                                            </TableCell>
                                            <TableCell className="px-4 py-4 text-right text-sm font-semibold text-amalfi-ink">
                                                {fmtCur(gross)}
                                            </TableCell>
                                            <TableCell className="px-4 py-4 text-right text-sm font-black text-amalfi-emerald">
                                                {fmtCur(comm)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                            <TableFooter className="border-t-2 border-amalfi-ink bg-[#fffdf8]">
                                <TableRow className="hover:bg-[#fffdf8]">
                                    <TableCell colSpan={2} className="px-4 py-5 text-right text-sm font-black text-amalfi-ink">
                                        TOTAL COMMISSION EARNED
                                    </TableCell>
                                    <TableCell colSpan={2} className="px-4 py-5 text-right text-2xl font-black text-amalfi-ink">
                                        {fmtCur(commission)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>

                    <div className="mt-auto flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
                        <div className="max-w-[300px] text-xs font-semibold leading-6 text-amalfi-muted">
                            This document serves as an official request for commission settlement for services rendered as the lead property concierge.
                        </div>
                        <div className="w-full text-center sm:w-[250px]">
                            <div className="mb-2 border-b border-amalfi-ink pb-2 font-resortDisplay text-2xl font-semibold text-amalfi-ink">
                                {agentName}
                            </div>
                            <div className="text-[0.68rem] font-black uppercase tracking-normal text-amalfi-muted">Certified Property Agent</div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function parseISO(s) {
    if (!s) return new Date();
    return new Date(s);
}
