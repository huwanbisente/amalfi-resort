import React from 'react';
import { Printer } from 'lucide-react';
import { formatCurrency } from '../utils/financialReporting';
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
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const toneClasses = {
    default: 'text-amalfi-ink',
    emerald: 'text-amalfi-emerald',
    gold: 'text-amalfi-gold',
    purple: 'text-violet-700',
    danger: 'text-amalfi-coral',
};

function StatTile({ label, value, tone = 'default' }) {
    return (
        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <CardContent className="p-4">
                <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-muted">
                    {label}
                </div>
                <div className={cn('mt-2 text-xl font-black', toneClasses[tone] || toneClasses.default)}>
                    {value}
                </div>
            </CardContent>
        </Card>
    );
}

function alignClass(align) {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
}

function SimpleTable({ columns, rows, emptyLabel }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
            <Table>
                <TableHeader className="bg-amalfi-sand/45">
                    <TableRow className="border-[#d8c9b3]/70 hover:bg-amalfi-sand/45">
                        {columns.map((col) => (
                            <TableHead
                                key={col.key}
                                className={cn('px-4 py-3 text-[0.68rem] font-black uppercase tracking-normal text-amalfi-ink', alignClass(col.align))}
                            >
                                {col.label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="px-4 py-4 text-sm font-semibold text-amalfi-muted">
                                {emptyLabel}
                            </TableCell>
                        </TableRow>
                    )}
                    {rows.map((row, idx) => (
                        <TableRow key={row.key || idx} className="border-[#d8c9b3]/70">
                            {columns.map((col) => (
                                <TableCell
                                    key={col.key}
                                    className={cn(
                                        'px-4 py-3 text-sm text-amalfi-ink',
                                        alignClass(col.align),
                                        col.bold ? 'font-black' : 'font-semibold'
                                    )}
                                >
                                    {col.render ? col.render(row) : row[col.key]}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export function FinancialReportPreviewModal({ onClose, model }) {
    const { reportPeriod, generatedAt, ledger = [], receivables = [], totals, aging, topRoomTypes } = model;

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="financial-report-preview-shell flex max-h-[calc(100vh-56px)] w-[min(1180px,calc(100vw-56px))] max-w-none flex-col gap-0 overflow-hidden rounded-[24px] border-[#d8c9b3]/70 bg-amalfi-canvas p-0 shadow-[0_32px_90px_rgba(23,51,48,0.28)]">
                <DialogHeader className="no-print flex-row items-center justify-between gap-4 border-b border-transparent bg-[#fffdf8]/88 shadow-[0_16px_36px_rgba(19,33,31,0.06)] px-6 py-4 text-left">
                    <div>
                        <DialogTitle className="text-xs font-black uppercase tracking-normal text-amalfi-muted">
                            Financial Report Preview
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Amalfi Sanctuary Monthly Financial Statement
                        </DialogDescription>
                    </div>
                    <div className="flex items-center gap-3 pr-8">
                        <Button onClick={() => window.print()} size="sm" className="rounded-xl bg-amalfi-emerald font-black text-white hover:bg-amalfi-emerald/90">
                            <Printer data-icon="inline-start" />
                            Print / Save PDF
                        </Button>
                        <Button onClick={onClose} size="sm" variant="outline" className="rounded-xl font-black">
                            Close
                        </Button>
                    </div>
                </DialogHeader>

                <div className="financial-report-paper flex-1 overflow-y-auto bg-[#fcfbf7] px-6 py-8 text-amalfi-ink sm:px-8 lg:px-[34px] lg:pb-[42px]">
                    <header className="grid gap-5 border-b-[3px] border-amalfi-ink pb-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                        <div>
                            <div className="mb-3 flex items-center gap-4">
                                <img
                                    src="/api/v1/assets/logo/resort_logo.jpg"
                                    alt="Amalfi Sanctuary Resort logo"
                                    className="size-[84px] rounded-2xl border border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] object-contain p-2"
                                />
                                <div>
                                    <div className="text-xs font-black uppercase tracking-normal text-amalfi-emerald">
                                        Amalfi Sanctuary Resort
                                    </div>
                                    <div className="mt-1 text-xs font-bold text-amalfi-muted">
                                        Official Financial Reporting Template
                                    </div>
                                </div>
                            </div>
                            <h1 className="my-2 font-resortDisplay text-4xl font-black leading-tight tracking-normal text-amalfi-ink">
                                Financial Statement
                            </h1>
                        </div>
                        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <CardContent className="p-5">
                                <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-muted">Covered Period</div>
                                <div className="mt-2 text-lg font-black text-amalfi-ink">{reportPeriod}</div>
                                <div className="mt-4 text-[0.66rem] font-black uppercase tracking-normal text-amalfi-muted">Generated</div>
                                <div className="mt-2 text-sm font-bold text-amalfi-ink">{generatedAt}</div>
                            </CardContent>
                        </Card>
                    </header>

                    <section className="mt-6 grid gap-4 md:grid-cols-4">
                        <StatTile label="Gross Billed" value={formatCurrency(totals.grossBilled)} />
                        <StatTile label="Cash Collected" value={formatCurrency(totals.cashCollected)} tone="emerald" />
                        <StatTile label="Outstanding Receivables" value={formatCurrency(totals.outstanding)} tone="gold" />
                        <StatTile label="Agent Commission" value={formatCurrency(totals.agentCommission)} tone="purple" />
                    </section>

                    <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <CardContent className="p-5">
                                <div className="text-[0.7rem] font-black uppercase tracking-normal text-amalfi-emerald">Executive Commentary</div>
                                <div className="mt-3 text-sm font-semibold leading-6 text-amalfi-muted">
                                    This period produced <strong className="text-amalfi-ink">{formatCurrency(totals.cashCollected)}</strong> in net collections from <strong className="text-amalfi-ink">{totals.bookingCount}</strong> booked transactions.
                                    Outstanding receivables stand at <strong className="text-amalfi-ink">{formatCurrency(totals.outstanding)}</strong>, while refunds totaled <strong className="text-amalfi-ink">{formatCurrency(totals.refunds)}</strong>.
                                    After reserving <strong className="text-amalfi-ink">{formatCurrency(totals.agentCommission)}</strong> for agent commissions, net collectible exposure is <strong className="text-amalfi-ink">{formatCurrency(totals.netAfterCommission)}</strong>.
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <CardContent className="p-5">
                                <div className="text-[0.7rem] font-black uppercase tracking-normal text-amalfi-emerald">Payment Mix</div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {Object.entries(totals.paymentMix).map(([label, value]) => (
                                        <div key={label} className="rounded-2xl bg-amalfi-sand/45 p-4">
                                            <div className="text-[0.66rem] font-black uppercase tracking-normal text-amalfi-muted">{label}</div>
                                            <div className="mt-1 text-lg font-black text-amalfi-ink">{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    <section className="mt-7">
                        <div className="mb-3 text-xs font-black uppercase tracking-normal text-amalfi-ink">
                            Top Revenue Drivers
                        </div>
                        <SimpleTable
                            columns={[
                                { key: 'name', label: 'Room / Service', bold: true },
                                { key: 'bookings', label: 'Bookings', align: 'center' },
                                { key: 'gross', label: 'Gross Billed', align: 'right', render: (row) => formatCurrency(row.gross) },
                            ]}
                            rows={topRoomTypes}
                            emptyLabel="No room performance records in the selected period."
                        />
                    </section>

                    <section className="mt-7">
                        <div className="mb-3 text-xs font-black uppercase tracking-normal text-amalfi-ink">
                            Receivables Aging
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                            {Object.entries(aging).map(([bucket, value]) => (
                                <StatTile key={bucket} label={bucket} value={formatCurrency(value)} tone={bucket === '61+ Days' ? 'danger' : 'default'} />
                            ))}
                        </div>
                    </section>

                    <section className="mt-8 [break-before:page]">
                        <div className="mb-3 text-xs font-black uppercase tracking-normal text-amalfi-ink">
                            Transaction Appendix
                        </div>
                        <SimpleTable
                            columns={[
                                { key: 'booking_ref', label: 'Ref', bold: true },
                                { key: 'full_name', label: 'Guest', bold: true },
                                { key: 'check_in', label: 'Check-In' },
                                { key: 'room_type', label: 'Room / Service' },
                                { key: 'gross', label: 'Gross', align: 'right', render: (row) => formatCurrency((Number(row.total_price || 0) + Number(row.addon_amount || 0))) },
                                { key: 'paid', label: 'Collected', align: 'right', render: (row) => formatCurrency((Number(row.amount_paid || 0) - Number(row.amount_refunded || 0))) },
                                { key: 'status', label: 'Status', align: 'center' },
                            ]}
                            rows={ledger.slice(0, 120)}
                            emptyLabel="No ledger items available for the selected period."
                        />
                    </section>

                    <section className="mt-8">
                        <div className="mb-3 text-xs font-black uppercase tracking-normal text-amalfi-ink">
                            Outstanding Accounts Appendix
                        </div>
                        <SimpleTable
                            columns={[
                                { key: 'booking_ref', label: 'Ref', bold: true },
                                { key: 'full_name', label: 'Guest', bold: true },
                                { key: 'check_in', label: 'Due Date' },
                                {
                                    key: 'balance',
                                    label: 'Outstanding Balance',
                                    align: 'right',
                                    render: (row) => formatCurrency((Number(row.total_price || 0) + Number(row.addon_amount || 0)) - (Number(row.amount_paid || 0) - Number(row.amount_refunded || 0))),
                                },
                            ]}
                            rows={receivables}
                            emptyLabel="No outstanding balances for the selected period."
                        />
                    </section>

                    <footer className="mt-7 flex flex-col gap-3 border-t-2 border-amalfi-ink/20 pt-4 text-xs font-semibold text-amalfi-muted sm:flex-row sm:justify-between">
                        <div>Prepared from the Amalfi Sanctuary operational ledger and receivables register.</div>
                        <div className="font-black text-amalfi-ink">Internal financial use only.</div>
                    </footer>
                </div>
            </DialogContent>
        </Dialog>
    );
}
