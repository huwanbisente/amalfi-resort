import { mapLedgerRowForExport } from './financialReporting';

const CSV_HEADERS = [
    'Booking Ref',
    'Guest Name',
    'Room / Service',
    'Stay Window',
    'Gross Amount (PHP)',
    'Amount Paid Net (PHP)',
    'Balance (PHP)',
    'Payment Status',
    'Reservation Status',
    'Source',
    'Commission Eligible',
    'Agent Commission (2.5%)',
    'Created At',
];

const formatValue = (val) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
};

export function buildFinancialCsv(rows, options = {}) {
    if (!rows || !rows.length) return '';

    const csvRows = [];
    if (options.reportPeriod) csvRows.push(`"Report Period","${String(options.reportPeriod).replace(/"/g, '""')}"`);
    if (options.generatedAt) csvRows.push(`"Generated At","${String(options.generatedAt).replace(/"/g, '""')}"`);
    if (csvRows.length) csvRows.push('');

    csvRows.push(CSV_HEADERS.join(','));

    rows.forEach((row) => {
        const mapped = mapLedgerRowForExport(row);
        csvRows.push([
            formatValue(mapped.bookingRef),
            formatValue(mapped.guestName),
            formatValue(mapped.service),
            formatValue(mapped.stayWindow),
            formatValue(mapped.grossAmount),
            formatValue(mapped.amountPaid),
            formatValue(mapped.balance),
            formatValue(mapped.paymentStatus),
            formatValue(mapped.reservationStatus),
            formatValue(mapped.source),
            formatValue(mapped.commissionEligible),
            formatValue(mapped.commissionAmount),
            formatValue(mapped.createdAt),
        ].join(','));
    });

    return csvRows.join('\r\n');
}

export function exportFinancialCsv(filename, rows, options = {}) {
    if (!rows || !rows.length) return;

    const csvContent = buildFinancialCsv(rows, options);
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL?.(url);
    }
}
