import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { FinancialReportPreviewModal } from './FinancialReportPreviewModal';
import { exportFinancialCsv } from '../utils/financialCsvExport';
import {
    CommandDeck,
    DeckIntro,
    DeckMetric,
    DeckMetricRail,
    StatusBadge,
} from '@/components/shared';
import {
    buildFinancialReportModel,
    formatCurrency,
} from '../utils/financialReporting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';

const summaryToneClasses = {
    default: 'text-amalfi-ink',
    green: 'text-amalfi-emerald',
    gold: 'text-amalfi-gold',
    red: 'text-amalfi-coral',
};

function ToolbarSelect({ value, onChange, options, className }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={cn('min-w-40 rounded-xl border-transparent bg-[#f7eedf]/58 font-black text-amalfi-ink shadow-none', className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    {options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

function DetailMetric({ label, value, tone = 'default' }) {
    return (
        <div className="rounded-2xl bg-[#f7eedf]/48 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <div className="text-[0.64rem] font-black uppercase tracking-normal text-amalfi-muted">{label}</div>
            <div className={cn('mt-1 text-sm font-black', summaryToneClasses[tone])}>{value}</div>
        </div>
    );
}

export function FinancialReportsWorkspace({ ledger = [], specialBookings = [], receivables = [] }) {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [pageSize, setPageSize] = useState(8);
    const [page, setPage] = useState(1);
    const [expandedRef, setExpandedRef] = useState(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    const model = useMemo(() => buildFinancialReportModel({
        ledger,
        specialBookings,
        receivables,
        dateFrom,
        dateTo,
    }), [ledger, specialBookings, receivables, dateFrom, dateTo]);

    const filteredLedger = useMemo(() => {
        const query = search.trim().toLowerCase();
        return model.ledger.filter((row) => {
            const gross = Number(row.total_price || 0) + Number(row.addon_amount || 0);
            const paid = Number(row.amount_paid || 0) - Number(row.amount_refunded || 0);
            const balance = Math.max(0, gross - paid);

            let matchesStatus = true;
            if (statusFilter === 'paid') matchesStatus = balance <= 0 && gross > 0;
            if (statusFilter === 'partial') matchesStatus = paid > 0 && balance > 0;
            if (statusFilter === 'unpaid') matchesStatus = paid <= 0 && gross > 0;
            if (statusFilter === 'refunded') matchesStatus = Number(row.amount_refunded || 0) > 0;
            if (statusFilter === 'agent') matchesStatus = ['RESERVED', 'CHECKED_IN', 'CHECKED_OUT'].includes(row.status);

            const matchesQuery = !query || [
                row.booking_ref,
                row.full_name,
                row.room_type,
                row.unit_id,
                row.unit_label,
                row.status,
            ].some((value) => String(value || '').toLowerCase().includes(query));

            return matchesStatus && matchesQuery;
        });
    }, [model.ledger, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredLedger.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = filteredLedger.length === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
    const pageEnd = Math.min(safePage * pageSize, filteredLedger.length);

    const paginatedLedger = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return filteredLedger.slice(start, start + pageSize);
    }, [filteredLedger, pageSize, safePage]);

    React.useEffect(() => {
        setPage(1);
        setExpandedRef(null);
    }, [dateFrom, dateTo, search, statusFilter, pageSize]);

    const exportRange = dateFrom || dateTo ? `${dateFrom || 'START'}_${dateTo || 'END'}` : 'ALL_DATES';
    const exportFilename = `Amalfi_Financial_Ledger_${exportRange}`;

    const statusOptions = [
        { value: 'all', label: 'All Ledger Rows' },
        { value: 'paid', label: 'Paid' },
        { value: 'partial', label: 'Partial' },
        { value: 'unpaid', label: 'Unpaid' },
        { value: 'refunded', label: 'Refunded' },
        { value: 'agent', label: 'Agent Eligible' },
    ];

    return (
        <div className="flex flex-col gap-5">
            <CommandDeck
                className="no-print"
                eyebrow="Report Controls"
                title={`${filteredLedger.length} rows in statement view`}
                description="Build the accounting period, export the accountant CSV, and preview the print-ready financial statement from one reporting deck."
                primary={(
                    <div className="grid w-full max-w-[880px] gap-2">
                        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                            <span className="hidden h-9 items-center rounded-full border border-white/15 bg-white/10 px-3 text-[0.58rem] font-black uppercase tracking-[0.14em] text-[#f4d89a] sm:inline-flex">
                                Date Range
                            </span>
                            <Input
                                type="date"
                                value={dateFrom}
                                max={dateTo || undefined}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-9 w-[150px] rounded-xl border-white/20 bg-white/15 font-black text-[#fffdf8] shadow-none [color-scheme:dark] placeholder:text-[#fffdf8]/70"
                                aria-label="Financial report start date"
                            />
                            <span className="text-xs font-black text-[#fffdf8]/70">to</span>
                            <Input
                                type="date"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-9 w-[150px] rounded-xl border-white/20 bg-white/15 font-black text-[#fffdf8] shadow-none [color-scheme:dark] placeholder:text-[#fffdf8]/70"
                                aria-label="Financial report end date"
                            />
                            <ToolbarSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="h-9 w-[190px] border-white/20 bg-white/15 text-[#fffdf8]" />
                            {(dateFrom || dateTo) && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                                    className="h-9 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-black text-[#fffdf8] hover:bg-white/20 hover:text-white"
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                            <div className="relative min-w-[280px] flex-1 xl:max-w-[380px]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#fffdf8]/72" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search guest, ref, room, unit..."
                                    className="h-9 rounded-xl border-white/20 bg-white/15 pl-9 font-bold text-[#fffdf8] shadow-none placeholder:text-[#fffdf8]/70"
                                />
                            </div>
                            <Button type="button" variant="outline" className="h-9 rounded-xl font-black" onClick={() => setShowPrintPreview(true)}>
                                <Printer data-icon="inline-start" />
                                Preview Report
                            </Button>
                            <Button
                                type="button"
                                className="h-9 rounded-xl bg-amalfi-emerald font-black text-white hover:bg-amalfi-emerald/90"
                                onClick={() => exportFinancialCsv(exportFilename, model.ledger, { reportPeriod: model.reportPeriod, generatedAt: model.generatedAt })}
                            >
                                <FileSpreadsheet data-icon="inline-start" />
                                Export CSV
                            </Button>
                        </div>
                    </div>
                )}
            >
                <DeckMetricRail
                    intro={(
                        <DeckIntro
                            eyebrow="Statement"
                            title={model.reportPeriod}
                            description={`Generated ${model.generatedAt}`}
                        />
                    )}
                >
                    <DeckMetric label="Gross billed" caption={`${model.totals.bookingCount} bookings`} value={formatCurrency(model.totals.grossBilled)} tone="gold" />
                    <DeckMetric label="Cash collected" caption="Net of refunds" value={formatCurrency(model.totals.cashCollected)} tone="teal" />
                    <DeckMetric label="Receivables" caption={`${model.receivables.length} accounts open`} value={formatCurrency(model.totals.outstanding)} tone="red" />
                    <DeckMetric label="Refund liability" caption="Contra-revenue activity" value={formatCurrency(model.totals.refunds)} tone="violet" />
                </DeckMetricRail>
                {(search || statusFilter !== 'all') && (
                    <div className="border-t border-[#20342c1f] bg-[#fffdf8] px-5 py-2">
                        <StatusBadge tone="info">Filtered view active</StatusBadge>
                    </div>
                )}
            </CommandDeck>

            <section className="grid items-start gap-5 xl:grid-cols-[0.82fr_1.18fr]">
                <div className="grid gap-4">
                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardHeader className="p-5 pb-0">
                            <CardTitle className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">Period Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 p-5">
                            <DetailMetric label="Reporting Period" value={model.reportPeriod} />
                            <DetailMetric label="Net Collected" value={formatCurrency(model.totals.cashCollected)} tone="green" />
                            <DetailMetric label="Generated" value={model.generatedAt} />
                        </CardContent>
                    </Card>

                    <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] rounded-[24px]">
                        <CardHeader className="p-5 pb-0">
                            <CardTitle className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">Top Revenue Drivers</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 p-5">
                            {model.topRoomTypes.length === 0 && (
                                <EmptyState
                                    title="No activity"
                                    description="No activity for the selected period."
                                    className="p-5"
                                />
                            )}
                            {model.topRoomTypes.map((item) => (
                                <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl bg-[#f7eedf]/42 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-black text-amalfi-ink">{item.name}</div>
                                        <div className="text-xs font-semibold text-amalfi-muted">{item.bookings} bookings</div>
                                    </div>
                                    <div className="text-sm font-black text-amalfi-ink">{formatCurrency(item.gross)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card className="border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[24px]">
                    <CardHeader className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="text-admin-label font-black uppercase tracking-normal text-amalfi-muted">Ledger Explorer</CardTitle>
                            <CardDescription className="mt-1 text-xs font-bold text-amalfi-muted">
                                Cleaner page-by-page browsing with expandable payment details.
                            </CardDescription>
                        </div>
                        <div className="no-print flex flex-wrap items-center justify-end gap-3">
                            <span className="text-xs font-black text-amalfi-muted">
                                {pageStart}-{pageEnd} of {filteredLedger.length}
                            </span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1} className="h-8 rounded-xl font-black">
                                Previous
                            </Button>
                            <span className="text-xs font-black text-amalfi-ink">{safePage} / {totalPages}</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={safePage >= totalPages} className="h-8 rounded-xl font-black">
                                Next
                            </Button>
                            <span className="text-xs font-black text-amalfi-muted">Rows</span>
                            <ToolbarSelect
                                value={String(pageSize)}
                                onChange={(value) => setPageSize(Number(value))}
                                options={[8, 10, 25].map((size) => ({ value: String(size), label: String(size) }))}
                                className="min-w-24"
                            />
                        </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0">
                        <div className="overflow-hidden rounded-2xl bg-[#fffdf8]/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <Table>
                                <TableHeader className="bg-amalfi-sand/45">
                                    <TableRow className="hover:bg-amalfi-sand/45">
                                        <TableHead className="w-10 px-3"></TableHead>
                                        <TableHead className="px-3 text-xs font-black text-amalfi-ink">Ref / Guest</TableHead>
                                        <TableHead className="px-3 text-xs font-black text-amalfi-ink">Stay</TableHead>
                                        <TableHead className="px-3 text-xs font-black text-amalfi-ink">Unit / Service</TableHead>
                                        <TableHead className="px-3 text-right text-xs font-black text-amalfi-ink">Gross</TableHead>
                                        <TableHead className="px-3 text-right text-xs font-black text-amalfi-ink">Collected</TableHead>
                                        <TableHead className="px-3 text-right text-xs font-black text-amalfi-ink">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedLedger.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="px-4 py-6 text-sm font-semibold text-amalfi-muted">
                                                No ledger rows match the current filters.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {paginatedLedger.map((row) => {
                                        const gross = Number(row.total_price || 0) + Number(row.addon_amount || 0);
                                        const paid = Number(row.amount_paid || 0) - Number(row.amount_refunded || 0);
                                        const balance = Math.max(0, gross - paid);
                                        const open = expandedRef === row.booking_ref;

                                        return (
                                            <React.Fragment key={row.booking_ref || `${row.full_name}-${row.check_in}`}>
                                                <TableRow className={cn(open && 'bg-amalfi-emerald/5')}>
                                                    <TableCell className="px-2 py-3">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setExpandedRef(open ? null : row.booking_ref)}
                                                            className="size-8 rounded-xl text-amalfi-emerald"
                                                            aria-label={open ? 'Collapse ledger row' : 'Expand ledger row'}
                                                        >
                                                            {open ? <ChevronUp /> : <ChevronDown />}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell className="px-3 py-3">
                                                        <div className="font-black text-amalfi-ink">{row.booking_ref || 'INTERNAL'}</div>
                                                        <div className="text-xs font-semibold text-amalfi-muted">{row.full_name || 'Unnamed guest'}</div>
                                                    </TableCell>
                                                    <TableCell className="px-3 py-3">
                                                        <div className="font-bold text-amalfi-ink">{row.check_in || '-'}</div>
                                                        <div className="text-xs font-semibold text-amalfi-muted">{row.check_out || '-'}</div>
                                                    </TableCell>
                                                    <TableCell className="px-3 py-3">
                                                        <div className="font-bold text-amalfi-ink">{row.unit_label || row.unit_id || row.room_type || 'N/A'}</div>
                                                        <div className="text-xs font-semibold text-amalfi-muted">{row.room_type || row.booking_type || row.status}</div>
                                                    </TableCell>
                                                    <TableCell className="px-3 py-3 text-right font-black text-amalfi-ink">{formatCurrency(gross)}</TableCell>
                                                    <TableCell className={cn('px-3 py-3 text-right font-black', paid > 0 ? 'text-amalfi-emerald' : 'text-amalfi-ink')}>
                                                        {formatCurrency(paid)}
                                                    </TableCell>
                                                    <TableCell className={cn('px-3 py-3 text-right font-black', balance > 0 ? 'text-amalfi-coral' : 'text-amalfi-emerald')}>
                                                        {formatCurrency(balance)}
                                                    </TableCell>
                                                </TableRow>
                                                {open && (
                                                    <TableRow className="bg-amalfi-sand/25 hover:bg-amalfi-sand/25">
                                                        <TableCell colSpan={7} className="px-5 py-4">
                                                            <div className="grid gap-3 md:grid-cols-4">
                                                                <DetailMetric label="Reservation Status" value={row.status || 'N/A'} />
                                                                <DetailMetric label="Add-Ons" value={formatCurrency(Number(row.addon_amount || 0))} />
                                                                <DetailMetric
                                                                    label="Refunds"
                                                                    value={formatCurrency(Number(row.amount_refunded || 0))}
                                                                    tone={Number(row.amount_refunded || 0) > 0 ? 'red' : 'default'}
                                                                />
                                                                <DetailMetric label="Origin" value={row.created_by === 'admin' ? 'Admin' : 'Web Portal'} />
                                                            </div>
                                                            {row.notes && (
                                                                <div className="mt-3 rounded-2xl bg-[#fffdf8]/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                                                                    <div className="text-[0.64rem] font-black uppercase tracking-normal text-amalfi-muted">Notes</div>
                                                                    <div className="mt-1 text-sm font-semibold text-amalfi-muted">{row.notes}</div>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs font-black text-amalfi-muted">
                                Showing {pageStart}-{pageEnd} of {filteredLedger.length}
                            </div>
                            <div className="flex items-center gap-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1} className="rounded-xl font-black">
                                    Previous
                                </Button>
                                <span className="text-xs font-black text-amalfi-ink">{safePage} / {totalPages}</span>
                                <Button type="button" variant="outline" size="sm" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={safePage >= totalPages} className="rounded-xl font-black">
                                    Next
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {showPrintPreview && (
                <FinancialReportPreviewModal
                    onClose={() => setShowPrintPreview(false)}
                    model={model}
                />
            )}
        </div>
    );
}
