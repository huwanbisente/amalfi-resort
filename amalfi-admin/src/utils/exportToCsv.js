/**
 * Amalfi Accounting: CSV Export Utility
 * Converts ledger data into a professional Excel-ready CSV format.
 * Includes a '2.5% Agent Commission' column for personal earnings tracking.
 */
export function exportToCsv(filename, rows) {
    if (!rows || !rows.length) return;
    // CSV Headers
    const headers = [
        'Booking Ref',
        'Guest Name',
        'Room / Service',
        'Stay Window',
        'Gross Amount (PHP)',
        'Agent Fee (2.5%)',
        'Source',
        'Created At'
    ];
    // Helper: Sanitize CSV values
    const formatValue = (val) => {
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
    };
    // Build Rows
    const csvRows = [headers.join(',')];

    rows.forEach(row => {
        const gross = Number(row.amount_paid || 0);
        const commission = (gross * 0.025).toFixed(2);
        const stay = (row.check_in && row.check_out) ? `${row.check_in} TO ${row.check_out}` : 'N/A';
        const service = row.room_type || row.booking_type || 'Custom Service';

        const line = [
            formatValue(row.booking_ref),
            formatValue(row.full_name),
            formatValue(service),
            formatValue(stay),
            formatValue(gross),
            formatValue(commission),
            formatValue(row.created_by === 'admin' ? 'Admin' : 'Web Portal'),
            formatValue(row.created_at || 'â€”')
        ];
        csvRows.push(line.join(','));
    });
    // Trigger Download
    const csvContent = csvRows.join('\r\n');
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
    }
}
