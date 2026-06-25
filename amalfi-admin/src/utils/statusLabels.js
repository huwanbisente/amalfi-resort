const titleCaseStatus = (status) => (
    String(status || '')
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
);

export function paymentStatusLabel(status) {
    const labelMap = {
        PAID: 'Paid',
        UNPAID: 'Unpaid',
        PARTIAL: 'Partial',
        PENDING_VERIFICATION: 'Payment Review',
        PAYMENT_REVIEW: 'Payment Review',
        REJECTED: 'Rejected',
        PAYMENT_REJECTED: 'Rejected',
    };

    if (!status) return 'No Payment Recorded';
    return labelMap[status] || titleCaseStatus(status);
}

