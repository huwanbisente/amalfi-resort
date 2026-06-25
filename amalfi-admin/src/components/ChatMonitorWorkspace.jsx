import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Input, Textarea } from '@/components/shared';
import { cn } from '@/lib/utils';
import { api } from '../utils/api';

const T = {
    green: '#486358',
    greenSoft: 'rgba(72,99,88,0.10)',
    gold: '#c49a00',
    goldSoft: 'rgba(196,154,0,0.12)',
    red: '#d64545',
    redSoft: 'rgba(214,69,69,0.10)',
    blue: '#4c6fff',
    blueSoft: 'rgba(76,111,255,0.10)',
    muted: 'rgba(28,37,32,0.05)',
    text: '#1c2520',
    sub: 'rgba(28,37,32,0.58)',
    border: 'rgba(0,0,0,0.08)',
    white: '#ffffff'
};

const cardStyle = {
    background: T.white,
    border: `1px solid ${T.border}`,
    borderRadius: '18px'
};

const shellButton = (tone = 'neutral', filled = false) => {
    const tones = {
        neutral: { color: T.text, bg: T.white, border: T.border },
        green: { color: T.green, bg: T.greenSoft, border: `${T.green}33` },
        blue: { color: T.blue, bg: T.blueSoft, border: `${T.blue}33` },
        gold: { color: T.gold, bg: T.goldSoft, border: `${T.gold}33` },
        red: { color: T.red, bg: T.redSoft, border: `${T.red}33` },
    };
    const selected = tones[tone] || tones.neutral;
    return {
        minHeight: 38,
        padding: '9px 12px',
        borderRadius: '10px',
        border: filled ? 'none' : `1px solid ${selected.border}`,
        background: filled ? selected.color : selected.bg,
        color: filled ? T.white : selected.color,
        cursor: 'pointer',
        fontWeight: 850,
        fontSize: '0.72rem',
        whiteSpace: 'nowrap',
    };
};

const railPanelStyle = {
    border: `1px solid ${T.border}`,
    borderRadius: '16px',
    background: T.white,
    padding: '14px',
    minWidth: 0,
    overflow: 'hidden',
};

const nativeSelectClass = 'h-[34px] rounded-xl border border-[#dfd5c4] bg-[#fffdf8] px-2.5 text-[0.68rem] font-black text-[#13211f] outline-none transition focus:border-[#0a6b5f]/45 focus:ring-2 focus:ring-[#0a6b5f]/10';
const labelTextClass = 'text-[0.56rem] font-black uppercase tracking-[0.1em] text-[#6d756f]';
const compactButtonClass = 'h-[34px] min-h-[34px] rounded-xl px-3 text-[0.68rem] font-black shadow-sm';
const panelClass = 'border border-[#e1d8c8] bg-[#fffdf8] shadow-[0_16px_42px_rgba(19,35,31,0.08)]';

const headerActionTone = (action) => {
    if (action === 'delete_all') return 'destructive';
    if (action === 'archive_all' || action === 'archive_inactive') return 'secondary';
    return 'default';
};

const conversationDotClass = ({ urgent, payment, manual, priority }) => cn(
    'size-2 shrink-0 rounded-full',
    urgent ? 'bg-red-500' : payment ? 'bg-amber-500' : manual ? 'bg-blue-500' : priority ? 'bg-[#486358]' : 'bg-[#1c2520]/55'
);

const EMPTY_SUMMARY = { open: 0, new: 0, high: 0 };

const OPERATOR_SIGNAL_MODES = [
    { id: 'all', label: 'All Operator' },
    { id: 'hot', label: 'Leads' },
    { id: 'pre_booking', label: 'Pre-Booking' },
    { id: 'payment', label: 'Payments' },
    { id: 'booked', label: 'Reserved' },
    { id: 'complaints', label: 'Complaints' },
    { id: 'rebook', label: 'Rebook / Cancel' },
    { id: 'manual', label: 'Manual Active' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'confirmations', label: 'Confirmations' },
];

const BOT_SIGNAL_MODES = [
    { id: 'all', label: 'All Bot-Handled' },
    { id: 'spam', label: 'Spam / Noise' },
    { id: 'general', label: 'General' },
    { id: 'booking_related', label: 'Booking-Related' },
    { id: 'location', label: 'Location' },
    { id: 'faq', label: 'FAQ' },
];

const ALL_SIGNAL_MODES = [
    { id: 'all', label: 'All Signals' },
    ...OPERATOR_SIGNAL_MODES.filter((mode) => mode.id !== 'all'),
    ...BOT_SIGNAL_MODES.filter((mode) => mode.id !== 'all'),
];

const WORKFLOW_MODES = [
    { id: 'priority', label: 'Operator Queue' },
    { id: 'non_priority', label: 'Bot-Handled' },
    { id: 'all', label: 'All Threads' },
];

const BOOKING_RAIL_MODES = [
    { id: 'reply', label: 'Reply Helper' },
    { id: 'assist', label: 'Quick Booking' },
    { id: 'receipts', label: 'Receipt Review' },
    { id: 'actions', label: 'Guest Actions' },
];

const CATEGORY_OPTIONS = [
    { value: 'HOT_BOOKING_LEAD', label: 'Action: Booking Lead', priority: 'high' },
    { value: 'CONFIRMED_BOOKING', label: 'Info: Already Booked', priority: 'medium' },
    { value: 'PAYMENT_SENT', label: 'Action: Payment', priority: 'high' },
    { value: 'COMPLAINT', label: 'Action: Complaint', priority: 'critical' },
    { value: 'REBOOKING_OR_CANCELLATION', label: 'Action: Rebook/Cancel', priority: 'high' },
    { value: 'NEEDS_HUMAN', label: 'Action: Needs Human', priority: 'high' },
    { value: 'MANUAL_ACTIVE', label: 'Human Active', priority: 'high' },
    { value: 'LOW_PRIORITY_FAQ', label: 'Bot: FAQ', priority: 'normal' },
    { value: 'SPAM_OR_NONSENSE', label: 'Bot: Noise', priority: 'low' },
];

const CATEGORY_LABELS = {
    HOT_BOOKING_LEAD: 'Action: Booking Lead',
    CONFIRMED_BOOKING: 'Info: Booked',
    PAYMENT_SENT: 'Action: Payment',
    COMPLAINT: 'Action: Complaint',
    REBOOKING_OR_CANCELLATION: 'Action: Rebook/Cancel',
    NEEDS_HUMAN: 'Action: Needs Human',
    MANUAL_ACTIVE: 'Human Active',
    LOW_PRIORITY_FAQ: 'Bot: FAQ',
    SPAM_OR_NONSENSE: 'Bot: Noise'
};

const PRIORITY_CATEGORIES = new Set([
    'HOT_BOOKING_LEAD',
    'PAYMENT_SENT',
    'COMPLAINT',
    'REBOOKING_OR_CANCELLATION',
    'NEEDS_HUMAN',
    'MANUAL_ACTIVE',
]);

const fmtCur = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
}).format(value || 0);

const fmtBytes = (value) => {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function buildGuestInquiryText(messages, fallback = '') {
    const guestLines = messages
        .filter((message) => message.direction === 'inbound' && String(message.text || '').trim())
        .slice(-18)
        .map((message) => `Guest: ${message.text}`);

    if (guestLines.length > 0) return guestLines.join('\n');
    return fallback ? `Guest: ${fallback}` : '';
}

export function getSelectedUnitLabelText(suggestion) {
    return (suggestion?.units || [])
        .map((unit) => unit.unit_label || unit.unit_id)
        .filter(Boolean)
        .join(', ');
}

function getUnitCapacity(unit) {
    return Number(unit?.absolute_max_pax || unit?.max_capacity_pax || 0);
}

export function buildChatMonitorBookingPayload({
    bookingForm,
    bookingAnalysis,
    topBookingSuggestion,
    selectedUnits,
    roomTotal,
    addonAmount,
    selectedId,
    transcriptNote,
} = {}) {
    const bookingUnits = selectedUnits || topBookingSuggestion?.units || [];
    const baseSubtotal = bookingUnits.length > 0 ? Math.floor((Number(roomTotal || 0) / bookingUnits.length) * 100) / 100 : Number(roomTotal || 0);
    const note = String(transcriptNote || '').slice(0, 500);

    return {
        header: {
            guest_name: String(bookingForm?.guest_name || '').trim(),
            phone: String(bookingForm?.phone || '').trim(),
            email: String(bookingForm?.email || '').trim(),
            check_in: bookingAnalysis?.context?.check_in,
            check_out: bookingAnalysis?.context?.check_out,
            lodging_total: Number(roomTotal || 0) + Number(addonAmount || 0),
            addon_amount: Number(addonAmount || 0),
            status: bookingForm?.status || 'RESERVED',
            booking_source: bookingForm?.booking_source || 'Chatbot Monitor',
            booking_mode: bookingUnits.length > 1 ? 'TRANSACTION_GROUP' : 'STANDARD',
            notes: String(bookingForm?.notes || '').trim() || `Manual booking from Chatbot Monitor. Sender: ${selectedId}. Inquiry: ${note}`,
            special_requests: bookingAnalysis?.context?.raw_message || note,
            created_by: 'admin'
        },
        items: bookingUnits.map((unit, index) => ({
            unit_id: unit.unit_id,
            room_type: unit.room_type,
            check_in: bookingAnalysis?.context?.check_in,
            check_out: bookingAnalysis?.context?.check_out,
            guest_count: Number(unit.assigned_guests || 1),
            lodging_subtotal: index === bookingUnits.length - 1
                ? Number(roomTotal || 0) - (baseSubtotal * index)
                : baseSubtotal,
            status: bookingForm?.status === 'CHECKED_IN' ? 'CHECKED_IN' : 'RESERVED',
            sequence_no: index + 1
        })),
        admin_id: 'Vincent-Admin'
    };
}

export function buildPaymentConfirmationMessage(candidate = {}) {
    const bookingRef = candidate.booking_ref || 'your booking';
    const guestName = candidate.guest_name || 'Guest';
    const paidAmount = fmtCur(candidate.latest_payment_amount || candidate.amount_paid || 0);
    const totalPaid = fmtCur(candidate.amount_paid || candidate.latest_payment_amount || 0);
    const balance = Number(candidate.balance || 0);
    const unitLine = candidate.unit_summary ? `Unit: ${candidate.unit_summary}\n` : '';
    const stayLine = candidate.check_in && candidate.check_out
        ? `Stay dates: ${candidate.check_in} to ${candidate.check_out}\n`
        : '';
    const balanceLine = balance > 0
        ? `Remaining balance: ${fmtCur(balance)}\n`
        : 'Balance: Fully paid\n';

    return [
        `Hello ${guestName}, this is Amalfi Resort confirming that we have verified your payment for booking ${bookingRef}.`,
        '',
        `Recent verified payment: ${paidAmount}`,
        `Total paid: ${totalPaid}`,
        balanceLine.trim(),
        '',
        'Booking details:',
        stayLine.trim(),
        unitLine.trim(),
        '',
        'Please keep this message as your payment reference. Our Guest Services team will continue assisting you here if any detail needs correction.'
    ].filter(Boolean).join('\n');
}

export function getLatestGuestMessage(messages = [], fallback = '') {
    const latest = [...messages]
        .reverse()
        .find((message) => message.direction === 'inbound' && String(message.text || '').trim());
    return String(latest?.text || fallback || '').trim();
}

export function buildMonitorReplyInput(messages = [], fallback = '') {
    const latest = getLatestGuestMessage(messages, fallback);
    const prior = buildGuestInquiryText(messages, fallback);
    if (!latest) return '';
    return [
        `Latest guest message: ${latest}`,
        prior && prior !== `Guest: ${latest}` ? `Recent guest context:\n${prior}` : ''
    ].filter(Boolean).join('\n\n').slice(0, 1800);
}

const URL_PATTERN = /https?:\/\/[^\s)]+/gi;
const BOOKING_REF_PATTERN = /\b(?:RES|BRZ|OVL|BVL|KUBO|AK|AC|TP|DT|SP|DATE-TAG|B-BOT)-[A-Z0-9-]{3,}\b/gi;

function unique(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function getMessageImageUrls(message = {}) {
    const direct = [
        message.image_url,
        message.imageUrl,
        message.media_url,
        message.mediaUrl,
        message.attachment_url,
        message.attachmentUrl,
        message.receipt_url,
        message.receiptUrl,
        message.url,
    ];
    const attachments = Array.isArray(message.attachments)
        ? message.attachments.flatMap((attachment) => [
            attachment?.url,
            attachment?.image_url,
            attachment?.media_url,
            attachment?.payload?.url,
        ])
        : [];
    const textUrls = String(message.text || '').match(URL_PATTERN) || [];
    return unique([...direct, ...attachments, ...textUrls])
        .filter((url) => /^https?:\/\//i.test(String(url)));
}

export function extractBookingReferencesFromMessages(messages = [], fallback = '') {
    const text = [
        fallback,
        ...messages.flatMap((message) => [message.text, message.intent, message.bot_answer])
    ].filter(Boolean).join(' ');
    return unique((text.match(BOOKING_REF_PATTERN) || []).map((ref) => ref.toUpperCase()));
}

export function extractReceiptImageCandidates(messages = []) {
    return messages.flatMap((message, index) => {
        const text = String(message.text || '');
        const intent = String(message.intent || '');
        const haystack = `${text} ${intent}`.toLowerCase();
        const urls = getMessageImageUrls(message);
        const looksLikeReceipt = [
            'receipt',
            'payment',
            'gcash',
            'bank',
            'proof',
            'acknowledgement',
            'acknowledgment',
            'transfer',
            '[payment receipt image]',
            '[booking acknowledgement image]',
            '[receipt image]',
        ].some((term) => haystack.includes(term));

        if (!looksLikeReceipt && urls.length === 0) return [];
        const kind = haystack.includes('acknowledg')
            ? 'acknowledgement'
            : haystack.includes('payment') || haystack.includes('gcash') || haystack.includes('bank') || haystack.includes('transfer')
                ? 'transfer'
                : 'image';

        if (urls.length === 0) {
            return [{
                id: `receipt-${index}-missing-url`,
                url: '',
                kind,
                label: `${message.timestamp || 'Receipt image'} - image URL unavailable`,
                text,
                timestamp: message.timestamp || '',
                hasUrl: false,
            }];
        }

        return urls.map((url, urlIndex) => ({
            id: `receipt-${index}-${urlIndex}`,
            url,
            kind,
            label: `${message.timestamp || 'Receipt image'} - ${kind === 'acknowledgement' ? 'acknowledgement' : 'transfer'} image`,
            text,
            timestamp: message.timestamp || '',
            hasUrl: true,
        }));
    });
}

export function buildReceiptReviewSummary(receiptCheck = {}, bookingRefs = []) {
    const classification = String(receiptCheck.classification || receiptCheck.status || 'unknown').toLowerCase();
    const confidence = Math.round(Number(receiptCheck.confidence || 0) * 100);
    const hasAmount = Boolean(receiptCheck.has_amount);
    const hasReference = Boolean(receiptCheck.has_reference);
    const isPaymentReceipt = classification === 'payment_receipt' || receiptCheck.status === 'verified_payment_receipt';
    const isAcknowledgement = classification.includes('acknowledgement');
    const bookingRefText = bookingRefs.length ? `Detected booking ref: ${bookingRefs.join(', ')}.` : 'No booking ref detected in the thread.';

    if (isPaymentReceipt && hasAmount && hasReference && confidence >= 65) {
        return {
            tone: 'blue',
            status: 'Likely transfer receipt',
            action: `${bookingRefText} Compare amount/reference with the payment record, then use the admin payment verification screen if it matches.`,
            draft: `Thanks for sending the payment screenshot. We can see a payment receipt with amount and reference details. Our team will compare it with your booking record and update you here after manual verification.`,
        };
    }

    if (isAcknowledgement) {
        return {
            tone: 'gold',
            status: 'Booking acknowledgement only',
            action: `${bookingRefText} Ask for the actual GCash, bank, or transfer receipt before payment verification.`,
            draft: `Thank you. This looks like a Amalfi booking acknowledgement, not the actual payment receipt. Please send the GCash, bank transfer, or payment screenshot with the amount and reference number so our team can verify it.`,
        };
    }

    return {
        tone: 'red',
        status: 'Needs manual review',
        action: `${bookingRefText} The image did not pass the first-layer receipt check. Ask for a clearer receipt if amount/reference is missing.`,
        draft: `Thank you. Please send a clear payment receipt screenshot showing the paid amount and transaction/reference number so our team can verify it properly.`,
    };
}

export function getPaymentConfirmationForSender(confirmations = [], senderId = '') {
    return confirmations.find((item) => item.sender_id === senderId) || null;
}

export function getHealth(conversations, alerts) {
    const stress = conversations.slice(0, 40).reduce((total, convo) => total + (Number(convo.urgent_count || 0) * 2), 0)
        + alerts.reduce((total, alert) => total + (alert.urgency === 'high' ? 6 : 3), 0);

    if (stress > 30) return { color: T.red, bg: T.redSoft, label: 'Urgent', sub: 'Human queue needs attention' };
    if (stress > 12) return { color: T.gold, bg: T.goldSoft, label: 'Monitor', sub: 'Some guests need follow-up' };
    return { color: T.green, bg: T.greenSoft, label: 'Calm', sub: 'Inbox is manageable' };
}

export function fmtSource(source) {
    return source === 'web' ? 'Web Chat' : 'Messenger';
}

export function isUrgentConversation(convo, alerts) {
    const hasAlert = alerts.some((alert) => alert.sender_id === convo.sender_id && ['new', 'acknowledged'].includes(alert.status));
    const urgentByLog = Number(convo.urgent_count || 0) > 0;
    const urgentByIntent = String(convo.last_intent || '').toLowerCase().includes('handoff');
    return hasAlert || urgentByLog || urgentByIntent;
}

export function isPaymentConversation(convo, alerts) {
    const paymentIntent = String(convo.last_intent || '').toLowerCase().includes('payment');
    const paymentAlert = alerts.some(
        (alert) =>
            alert.sender_id === convo.sender_id &&
            String(alert.escalation_reason || '').toLowerCase().includes('payment')
    );
    return paymentIntent || paymentAlert;
}

export function isPriorityConversation(convo, alerts = []) {
    const category = String(convo?.category || '').toUpperCase();
    return Boolean(convo?.manual_active) ||
        PRIORITY_CATEGORIES.has(category) ||
        isUrgentConversation(convo, alerts) ||
        isPaymentConversation(convo, alerts);
}

export function isBookingRelatedConversation(convo = {}) {
    const text = `${convo.last_preview || ''} ${convo.last_intent || ''}`.toLowerCase();
    return [
        'available', 'availability', 'book', 'booking', 'reserve', 'reservation',
        'room', 'villa', 'kubo', 'teepee', 'tent', 'overnight', 'day tour',
        'rate', 'rates', 'price', 'check in', 'check-in', 'pax', 'guest'
    ].some((term) => text.includes(term));
}

export function isLocationConversation(convo = {}) {
    const text = `${convo.last_preview || ''} ${convo.last_intent || ''}`.toLowerCase();
    return [
        'location', 'where', 'address', 'directions', 'map', 'waze', 'google maps',
        'zambales', 'cabangan', 'travel time', 'how to get'
    ].some((term) => text.includes(term));
}

export function signalModesForWorkflow(workflowMode = 'priority') {
    if (workflowMode === 'priority') return OPERATOR_SIGNAL_MODES;
    if (workflowMode === 'non_priority') return BOT_SIGNAL_MODES;
    return ALL_SIGNAL_MODES;
}

export function matchesSignalMode(convo = {}, alerts = [], confirmationSenders = new Set(), signalMode = 'all') {
    const category = String(convo.category || '').toUpperCase();
    const payment = isPaymentConversation(convo, alerts);
    const urgent = isUrgentConversation(convo, alerts);
    const manual = Boolean(convo.manual_active);
    const confirmationReady = confirmationSenders.has(convo.sender_id);
    const bookingRelated = isBookingRelatedConversation(convo);
    const location = isLocationConversation(convo);

    if (signalMode === 'all') return true;
    if (signalMode === 'hot') return category === 'HOT_BOOKING_LEAD';
    if (signalMode === 'pre_booking') return category === 'LOW_PRIORITY_FAQ' && bookingRelated;
    if (signalMode === 'payment') return payment || category === 'PAYMENT_SENT';
    if (signalMode === 'booked') return category === 'CONFIRMED_BOOKING';
    if (signalMode === 'complaints') return category === 'COMPLAINT';
    if (signalMode === 'rebook') return category === 'REBOOKING_OR_CANCELLATION';
    if (signalMode === 'manual') return manual;
    if (signalMode === 'urgent') return urgent;
    if (signalMode === 'confirmations') return confirmationReady;
    if (signalMode === 'spam') return category === 'SPAM_OR_NONSENSE';
    if (signalMode === 'general') return category === 'LOW_PRIORITY_FAQ' && !bookingRelated && !location;
    if (signalMode === 'booking_related') return category === 'LOW_PRIORITY_FAQ' && bookingRelated;
    if (signalMode === 'location') return category === 'LOW_PRIORITY_FAQ' && location;
    if (signalMode === 'faq') return category === 'LOW_PRIORITY_FAQ';
    return true;
}

export function matchesWorkflowMode(convo = {}, alerts = [], workflowMode = 'priority', signalMode = 'all') {
    const priority = isPriorityConversation(convo, alerts);
    if (workflowMode === 'all') return true;
    if (workflowMode === 'priority') {
        return priority || signalMode === 'pre_booking';
    }
    if (workflowMode === 'non_priority') return !priority;
    return true;
}

export function ChatMonitorWorkspace() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [conversations, setConversations] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [selectedId, setSelectedId] = useState(searchParams.get('chat_sender') || '');
    const [selectedSource, setSelectedSource] = useState(searchParams.get('chat_source') || 'messenger');
    const [messages, setMessages] = useState([]);
    const transcriptEndRef = React.useRef(null);
    const [selectedState, setSelectedState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [threadLoading, setThreadLoading] = useState(false);
    const [error, setError] = useState(null);
    const [draft, setDraft] = useState('');
    const [sendBusy, setSendBusy] = useState(false);
    const [purgeBusy, setPurgeBusy] = useState(false);
    const [purgeNotice, setPurgeNotice] = useState('');
    const [demoBusy, setDemoBusy] = useState(false);
    const [headerAction, setHeaderAction] = useState('refresh');
    const [archiveFiles, setArchiveFiles] = useState([]);
    const [paymentConfirmations, setPaymentConfirmations] = useState([]);
    const [paymentConfirmationBusy, setPaymentConfirmationBusy] = useState(false);
    const [paymentNotice, setPaymentNotice] = useState('');
    const [filter, setFilter] = useState('');
    const [workflowMode, setWorkflowMode] = useState('priority');
    const [inboxMode, setInboxMode] = useState('all');
    const [bookingAnalysis, setBookingAnalysis] = useState(null);
    const [bookingAssistBusy, setBookingAssistBusy] = useState(false);
    const [bookingAssistError, setBookingAssistError] = useState('');
    const [bookingReviewOpen, setBookingReviewOpen] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState(null);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
    const [bookingMode, setBookingMode] = useState('single');
    const [bookingRailMode, setBookingRailMode] = useState('reply');
    const [replyHelperBusy, setReplyHelperBusy] = useState(false);
    const [replyHelperError, setReplyHelperError] = useState('');
    const [replyHelperDraft, setReplyHelperDraft] = useState(null);
    const [receiptReviewBusy, setReceiptReviewBusy] = useState(false);
    const [receiptReviewError, setReceiptReviewError] = useState('');
    const [selectedReceiptId, setSelectedReceiptId] = useState('');
    const [receiptReviewResult, setReceiptReviewResult] = useState(null);
    const [reminderType, setReminderType] = useState('underpayment_reminder');
    const [reminderForm, setReminderForm] = useState({
        booking_ref: '',
        amount_due: '',
        due_date: '',
        status: 'updated',
        note: 'Our Guest Services team is reviewing this thread and will assist you here.'
    });
    const [bookingForm, setBookingForm] = useState({
        guest_name: '',
        phone: '',
        email: '',
        booking_source: 'Chatbot Monitor',
        status: 'RESERVED',
        lodging_total: '',
        addon_amount: '0',
        initial_payment: '',
        payment_method: 'GCash',
        payment_notes: '',
        notes: ''
    });

    const syncSelection = (senderId, source) => {
        setSelectedId(senderId);
        setSelectedSource(source || 'messenger');
        const next = new URLSearchParams(searchParams);
        if (senderId) {
            next.set('chat_sender', senderId);
            next.set('chat_source', source || 'messenger');
        } else {
            next.delete('chat_sender');
            next.delete('chat_source');
        }
        setSearchParams(next, { replace: true });
    };

    const fetchMonitor = async () => {
        try {
            const [conversationData, alertData] = await Promise.all([
                api.get('/api/v1/admin/chatbot-conversations?limit=60'),
                api.get('/api/v1/admin/chatbot-alerts?limit=30&status=open')
            ]);
            const nextConversations = conversationData.conversations || [];
            setConversations(nextConversations);
            setAlerts(alertData.alerts || []);
            setSummary(alertData.summary || EMPTY_SUMMARY);
            setError(null);

            if (!selectedId && nextConversations.length > 0) {
                syncSelection(nextConversations[0].sender_id, nextConversations[0].source);
            }
        } catch (e) {
            console.error(e);
            setError('Could not reach the chatbot inbox services. Please check the chatbot container and proxy routes.');
        } finally {
            setLoading(false);
        }
    };

    const fetchArchives = async () => {
        try {
            const data = await api.get('/api/v1/admin/chatbot-archives');
            setArchiveFiles(data.archives || []);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchPaymentConfirmations = async () => {
        try {
            const data = await api.get('/api/v1/admin/chatbot-payment-confirmations?days=14');
            setPaymentConfirmations(data.confirmations || []);
        } catch (e) {
            console.error(e);
            setPaymentConfirmations([]);
        }
    };

    const fetchConversation = async (senderId) => {
        if (!senderId) {
            setMessages([]);
            return;
        }
        try {
            setThreadLoading(true);
            const data = await api.get(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(senderId)}?limit=200`);
            setMessages(data.messages || []);
            setSelectedState(data.state || null);
            if (data.source) setSelectedSource(data.source);
        } catch (e) {
            console.error(e);
            setError(`Could not load conversation ${senderId}.`);
        } finally {
            setThreadLoading(false);
        }
    };

    useEffect(() => {
        fetchMonitor();
        fetchArchives();
        fetchPaymentConfirmations();
        const interval = setInterval(() => {
            fetchMonitor();
            fetchPaymentConfirmations();
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const sender = searchParams.get('chat_sender');
        const source = searchParams.get('chat_source') || 'messenger';
        if (sender && sender !== selectedId) {
            setSelectedId(sender);
            setSelectedSource(source);
        }
    }, [searchParams]);

    useEffect(() => {
        fetchConversation(selectedId);
        setBookingAnalysis(null);
        setBookingAssistError('');
        setBookingReviewOpen(false);
        setBookingResult(null);
        setPaymentNotice('');
        setSelectedSuggestionIndex(0);
        setBookingMode('single');
        setBookingRailMode('reply');
        setReplyHelperDraft(null);
        setReplyHelperError('');
        setReceiptReviewError('');
        setSelectedReceiptId('');
        setReceiptReviewResult(null);
        setReminderForm({
            booking_ref: '',
            amount_due: '',
            due_date: '',
            status: 'updated',
            note: 'Our Guest Services team is reviewing this thread and will assist you here.'
        });
        setBookingForm({
            guest_name: '',
            phone: '',
            email: '',
            booking_source: 'Chatbot Monitor',
            status: 'RESERVED',
            lodging_total: '',
            addon_amount: '0',
            initial_payment: '',
            payment_method: 'GCash',
            payment_notes: '',
            notes: ''
        });
    }, [selectedId]);

    useEffect(() => {
        if (threadLoading) return;
        transcriptEndRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, selectedId, threadLoading]);

    const conversationCounts = useMemo(() => {
        const confirmationSenders = new Set(paymentConfirmations.map((item) => item.sender_id));
        return conversations.reduce((acc, convo) => {
            const payment = isPaymentConversation(convo, alerts);
            const urgent = isUrgentConversation(convo, alerts);
            const priority = isPriorityConversation(convo, alerts);
            const category = String(convo.category || '').toUpperCase();
            const manual = Boolean(convo.manual_active);
            const confirmationReady = confirmationSenders.has(convo.sender_id);

            if (priority) acc.priority += 1;
            if (!priority) acc.non_priority += 1;
            if (payment) acc.payment += 1;
            if (confirmationReady) acc.confirmations += 1;
            if (urgent) acc.urgent += 1;
            if (manual) acc.manual += 1;
            if (category === 'HOT_BOOKING_LEAD') acc.hot += 1;
            if (['LOW_PRIORITY_FAQ', 'SPAM_OR_NONSENSE'].includes(category)) {
                acc.low += 1;
                if (priority) acc.low_flagged += 1;
            }
            if (category === 'CONFIRMED_BOOKING') acc.booked += 1;
            acc.all += 1;
            return acc;
        }, { all: 0, priority: 0, non_priority: 0, hot: 0, booked: 0, manual: 0, urgent: 0, payment: 0, confirmations: 0, low: 0, low_flagged: 0 });
    }, [conversations, alerts, paymentConfirmations]);

    const activeSignalModes = useMemo(() => signalModesForWorkflow(workflowMode), [workflowMode]);

    useEffect(() => {
        if (!activeSignalModes.some((mode) => mode.id === inboxMode)) {
            setInboxMode('all');
        }
    }, [activeSignalModes, inboxMode]);

    const signalCounts = useMemo(() => {
        const confirmationSenders = new Set(paymentConfirmations.map((item) => item.sender_id));
        return activeSignalModes.reduce((acc, mode) => {
            acc[mode.id] = conversations.filter((convo) => (
                matchesWorkflowMode(convo, alerts, workflowMode, mode.id) &&
                matchesSignalMode(convo, alerts, confirmationSenders, mode.id)
            )).length;
            return acc;
        }, {});
    }, [activeSignalModes, conversations, alerts, workflowMode, paymentConfirmations]);

    const filteredConversations = useMemo(() => {
        const query = filter.trim().toLowerCase();
        const confirmationSenders = new Set(paymentConfirmations.map((item) => item.sender_id));
        return conversations.filter((convo) => {
            const matchesWorkflow = matchesWorkflowMode(convo, alerts, workflowMode, inboxMode);
            const matchesMode = matchesSignalMode(convo, alerts, confirmationSenders, inboxMode);

            const matchesQuery = !query ||
                convo.sender_id.toLowerCase().includes(query) ||
                String(convo.last_preview || '').toLowerCase().includes(query);

            return matchesWorkflow && matchesMode && matchesQuery;
        });
    }, [conversations, alerts, filter, workflowMode, inboxMode, paymentConfirmations]);

    const selectedConversation = useMemo(
        () => conversations.find((item) => item.sender_id === selectedId) || null,
        [conversations, selectedId]
    );

    const selectedAlerts = useMemo(
        () => alerts.filter((alert) => alert.sender_id === selectedId),
        [alerts, selectedId]
    );

    const selectedPaymentConfirmation = useMemo(
        () => getPaymentConfirmationForSender(paymentConfirmations, selectedId),
        [paymentConfirmations, selectedId]
    );

    const receiptImageCandidates = useMemo(
        () => extractReceiptImageCandidates(messages),
        [messages]
    );
    const detectedBookingRefs = useMemo(
        () => extractBookingReferencesFromMessages(messages, selectedConversation?.last_preview || ''),
        [messages, selectedConversation?.last_preview]
    );
    const selectedReceiptCandidate = useMemo(
        () => receiptImageCandidates.find((item) => item.id === selectedReceiptId) || receiptImageCandidates[0] || null,
        [receiptImageCandidates, selectedReceiptId]
    );

    useEffect(() => {
        if (receiptImageCandidates.length === 0) {
            setSelectedReceiptId('');
            return;
        }
        if (!receiptImageCandidates.some((item) => item.id === selectedReceiptId)) {
            setSelectedReceiptId(receiptImageCandidates[0].id);
        }
    }, [receiptImageCandidates, selectedReceiptId]);

    useEffect(() => {
        if (filteredConversations.length === 0) return;
        if (filteredConversations.some((item) => item.sender_id === selectedId)) return;
        syncSelection(filteredConversations[0].sender_id, filteredConversations[0].source);
    }, [filteredConversations, selectedId]);

    const health = getHealth(conversations, alerts);
    const topBookingSuggestion = useMemo(
        () => bookingAnalysis?.suggestions?.[selectedSuggestionIndex] || bookingAnalysis?.suggestions?.[0] || null,
        [bookingAnalysis, selectedSuggestionIndex]
    );
    const selectedBookingUnits = useMemo(() => {
        const suggestionUnits = topBookingSuggestion?.units || [];
        return bookingMode === 'multi' ? suggestionUnits : suggestionUnits.slice(0, 1);
    }, [bookingMode, topBookingSuggestion]);
    const selectedUnitLabelText = useMemo(
        () => selectedBookingUnits.map((unit) => unit.unit_label || unit.unit_id).filter(Boolean).join(', '),
        [selectedBookingUnits]
    );
    const selectedCapacity = selectedBookingUnits.reduce((sum, unit) => sum + getUnitCapacity(unit), 0);
    const capacityOk = !selectedCapacity || !bookingAnalysis?.context?.guests || Number(bookingAnalysis.context.guests || 0) <= selectedCapacity;
    const suggestedTotal = Number(topBookingSuggestion?.summary?.total_amount || 0);
    const roomTotal = Number(bookingForm.lodging_total || suggestedTotal || 0);
    const addonAmount = Number(bookingForm.addon_amount || 0);
    const grossTotal = roomTotal + addonAmount;
    const initialPayment = Number(bookingForm.initial_payment || 0);
    const bookingBalance = Math.max(0, grossTotal - initialPayment);
    const canCreateBooking = Boolean(
        bookingAnalysis?.context?.check_in &&
        bookingAnalysis?.context?.check_out &&
        bookingAnalysis?.context?.guests &&
        bookingForm.guest_name.trim() &&
        selectedBookingUnits.length &&
        capacityOk &&
        grossTotal >= 0 &&
        initialPayment >= 0
    );

    useEffect(() => {
        if (!topBookingSuggestion) return;
        const units = topBookingSuggestion.units || [];
        const firstCapacity = getUnitCapacity(units[0]);
        const guests = Number(bookingAnalysis?.context?.guests || 0);
        setBookingMode(units.length > 1 && guests > firstCapacity ? 'multi' : 'single');
        setBookingForm((current) => ({
            ...current,
            lodging_total: current.lodging_total || String(Number(topBookingSuggestion.summary?.total_amount || 0))
        }));
    }, [bookingAnalysis?.context?.guests, topBookingSuggestion]);

    const openConversationWindow = (senderId, source) => {
        const base = `${window.location.pathname}?chat_sender=${encodeURIComponent(senderId)}&chat_source=${encodeURIComponent(source || 'messenger')}`;
        window.open(base, `_blank_${senderId}`, 'width=540,height=820,resizable=yes,scrollbars=yes');
    };

    const openAllWindows = () => {
        filteredConversations.forEach((convo, index) => {
            setTimeout(() => openConversationWindow(convo.sender_id, convo.source), index * 120);
        });
    };

    const runHeaderAction = async () => {
        if (headerAction === 'refresh') {
            await fetchMonitor();
            return;
        }
        if (headerAction === 'demo') {
            await seedDemoConversations();
            return;
        }
        if (headerAction === 'open_all') {
            openAllWindows();
            return;
        }
        if (headerAction === 'archive_all') {
            await archiveAllConversations();
            return;
        }
        if (headerAction === 'archive_inactive') {
            await archiveInactiveConversations();
            return;
        }
        if (headerAction === 'delete_all') {
            await purgeAllConversations();
        }
    };

    const sendReply = async () => {
        const text = draft.trim();
        if (!selectedId || !text) return;
        try {
            setSendBusy(true);
            const data = await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/reply`, {
                text,
                source: selectedSource,
                intent: 'admin_reply'
            });
            setDraft('');
            await fetchConversation(selectedId);
            await fetchMonitor();
            if (data.message) {
                setError(null);
            }
        } catch (e) {
            console.error(e);
            setError(e.message || 'Failed to send admin reply.');
        } finally {
            setSendBusy(false);
        }
    };

    const buildTemplatePayload = (type, overrides = {}) => {
        if (type === 'underpayment_reminder') {
            return {
                type,
                source: selectedSource,
                booking_ref: overrides.booking_ref || 'your booking',
                amount_due: overrides.amount_due || 'the remaining balance',
                due_date: overrides.due_date || ''
            };
        }

        return {
            type: 'booking_notice',
            source: selectedSource,
            booking_ref: overrides.booking_ref || 'your booking',
            status: overrides.status || 'updated',
            note: overrides.note || 'Our Guest Services team is reviewing this thread and will assist you here.'
        };
    };

    const previewTemplate = async (type, overrides = {}) => {
        if (!selectedId) return;
        try {
            setSendBusy(true);
            const payload = { ...buildTemplatePayload(type, overrides), preview_only: true };
            const data = await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/notify`, payload);
            setDraft(data.text || '');
            setError(null);
        } catch (e) {
            console.error(e);
            setError(e.message || 'Failed to preview notification.');
        } finally {
            setSendBusy(false);
        }
    };

    const sendTemplate = async (type, overrides = {}) => {
        if (!selectedId) return;
        try {
            setSendBusy(true);
            const payload = buildTemplatePayload(type, overrides);
            await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/notify`, payload);
            await fetchConversation(selectedId);
            await fetchMonitor();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Failed to send notification.');
        } finally {
            setSendBusy(false);
        }
    };

    const generateReplyHelperDraft = async () => {
        const message = buildMonitorReplyInput(messages, selectedConversation?.last_preview || '');
        if (!message) return;
        try {
            setReplyHelperBusy(true);
            setReplyHelperError('');
            const result = await api.post('/api/v1/admin/response-helper/draft', {
                message,
                tone: 'friendly'
            });
            setReplyHelperDraft(result);
        } catch (e) {
            console.error(e);
            setReplyHelperError(e.message || 'Could not draft a response from the latest guest message.');
        } finally {
            setReplyHelperBusy(false);
        }
    };

    const useReplyHelperDraft = () => {
        if (!replyHelperDraft?.reply) return;
        setDraft(replyHelperDraft.reply);
    };

    const sendPaymentConfirmation = async () => {
        if (!selectedId || !selectedPaymentConfirmation) return;
        const text = buildPaymentConfirmationMessage(selectedPaymentConfirmation);
        try {
            setPaymentConfirmationBusy(true);
            setPaymentNotice('');
            await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/notify`, {
                type: 'payment_confirmation',
                source: selectedSource,
                text,
                booking_ref: selectedPaymentConfirmation.booking_ref
            });
            setPaymentNotice(`Payment confirmation sent for ${selectedPaymentConfirmation.booking_ref}.`);
            await fetchConversation(selectedId);
            await fetchMonitor();
            await fetchPaymentConfirmations();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Failed to send payment confirmation.');
        } finally {
            setPaymentConfirmationBusy(false);
        }
    };

    const usePaymentConfirmationDraft = () => {
        if (!selectedPaymentConfirmation) return;
        setDraft(buildPaymentConfirmationMessage(selectedPaymentConfirmation));
    };

    const analyzeSelectedReceipt = async () => {
        if (!selectedReceiptCandidate?.url) return;
        try {
            setReceiptReviewBusy(true);
            setReceiptReviewError('');
            const payload = {
                image_url: selectedReceiptCandidate.url,
                booking_refs: detectedBookingRefs,
                source: selectedSource,
                sender_id: selectedId,
                analysis_only: true
            };
            const result = await api.post('/api/v1/admin/chatbot-receipt-review/analyze', payload);
            const summary = buildReceiptReviewSummary(result.receipt_check || {}, detectedBookingRefs);
            setReceiptReviewResult({
                ...result,
                summary,
                candidate: selectedReceiptCandidate
            });
        } catch (e) {
            console.error(e);
            setReceiptReviewError(e.message || 'Could not analyze this receipt image.');
        } finally {
            setReceiptReviewBusy(false);
        }
    };

    const useReceiptReviewDraft = () => {
        if (!receiptReviewResult?.summary?.draft) return;
        setDraft(receiptReviewResult.summary.draft);
    };

    const setManualMode = async (paused) => {
        if (!selectedId) return;
        try {
            setSendBusy(true);
            if (paused) {
                await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/pause`, {
                    duration_hours: 0.5,
                    reason: 'admin_monitor_pause',
                    notify_guest: true
                });
            } else {
                await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/resume`, {});
            }
            await fetchConversation(selectedId);
            await fetchMonitor();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Failed to update manual mode.');
        } finally {
            setSendBusy(false);
        }
    };

    const tagConversation = async (category) => {
        if (!selectedId || !category) return;
        const option = CATEGORY_OPTIONS.find((item) => item.value === category);
        try {
            setSendBusy(true);
            await api.patch(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/category`, {
                category,
                priority: option?.priority || 'normal'
            });
            await fetchConversation(selectedId);
            await fetchMonitor();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Failed to update conversation category.');
        } finally {
            setSendBusy(false);
        }
    };

    const purgeSelectedConversation = async () => {
        if (!selectedId || purgeBusy) return;
        const confirmed = window.confirm(`Delete ${selectedId} from Chatbot Monitor history? This clears its transcript, alerts, manual state, and AI usage counters, but does not delete Messenger messages or bookings.`);
        if (!confirmed) return;
        try {
            setPurgeBusy(true);
            const result = await api.delete(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}`);
            setPurgeNotice(`Deleted ${result.log_rows_deleted || 0} archived row(s) for ${selectedId}.`);
            syncSelection('', 'messenger');
            setMessages([]);
            setSelectedState(null);
            await fetchMonitor();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Could not delete this conversation from the monitor.');
        } finally {
            setPurgeBusy(false);
        }
    };

    const archiveSelectedConversation = async () => {
        if (!selectedId || purgeBusy) return;
        const confirmed = window.confirm(`Archive ${selectedId} and remove it from the active monitor? It will move into the monthly archive pool.`);
        if (!confirmed) return;
        try {
            setPurgeBusy(true);
            const result = await api.post(`/api/v1/admin/chatbot-conversations/${encodeURIComponent(selectedId)}/archive`, {});
            setPurgeNotice(`Archived ${result.log_rows_archived || 0} row(s) for ${selectedId}.`);
            syncSelection('', 'messenger');
            setMessages([]);
            setSelectedState(null);
            await fetchMonitor();
            await fetchArchives();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Could not archive this conversation.');
        } finally {
            setPurgeBusy(false);
        }
    };

    const archiveAllConversations = async () => {
        if (purgeBusy) return;
        const confirmed = window.confirm('Archive ALL active Chatbot Monitor history? This keeps compressed monthly archive files and clears the working inbox.');
        if (!confirmed) return;
        try {
            setPurgeBusy(true);
            const result = await api.post('/api/v1/admin/chatbot-conversations/archive', { mode: 'all' });
            setPurgeNotice(`Archived active monitor history: ${result.log_rows_archived || 0} row(s) into ${result.archive_files?.length || 0} file(s).`);
            syncSelection('', 'messenger');
            setMessages([]);
            setSelectedState(null);
            await fetchMonitor();
            await fetchArchives();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Could not archive the active monitor history.');
        } finally {
            setPurgeBusy(false);
        }
    };

    const archiveInactiveConversations = async () => {
        if (purgeBusy) return;
        const confirmed = window.confirm('Archive inactive Chatbot Monitor threads older than 30 days? High-priority and active manual threads will stay in the inbox.');
        if (!confirmed) return;
        try {
            setPurgeBusy(true);
            const result = await api.post('/api/v1/admin/chatbot-conversations/archive', { mode: 'inactive', days_inactive: 30 });
            setPurgeNotice(`Archived ${result.conversation_count || 0} inactive thread(s), ${result.log_rows_archived || 0} row(s).`);
            if (result.senders?.includes(selectedId)) {
                syncSelection('', 'messenger');
                setMessages([]);
                setSelectedState(null);
            }
            await fetchMonitor();
            await fetchArchives();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Could not archive inactive monitor threads.');
        } finally {
            setPurgeBusy(false);
        }
    };

    const purgeAllConversations = async () => {
        if (purgeBusy) return;
        const confirmed = window.confirm('Clear ALL Chatbot Monitor history? This resets monitor transcripts, alerts, manual states, and AI usage counters. It does not delete Messenger messages or bookings.');
        if (!confirmed) return;
        try {
            setPurgeBusy(true);
            const result = await api.post('/api/v1/admin/chatbot-conversations/purge', { mode: 'all' });
            setPurgeNotice(`Cleared monitor history: ${result.log_rows_deleted || 0} archived row(s), ${result.alerts_deleted || 0} alert(s).`);
            syncSelection('', 'messenger');
            setMessages([]);
            setSelectedState(null);
            await fetchMonitor();
            await fetchArchives();
        } catch (e) {
            console.error(e);
            setError(e.message || 'Could not clear the monitor history.');
        } finally {
            setPurgeBusy(false);
        }
    };

    const seedDemoConversations = async () => {
        if (demoBusy) return;
        try {
            setDemoBusy(true);
            const result = await api.post('/api/v1/admin/chatbot-conversations/demo', {});
            setPurgeNotice(`Loaded ${result.seeded || 0} demo chatbot thread(s) for manual testing.`);
            await fetchMonitor();
            await fetchPaymentConfirmations();
            if (result.senders?.[0]) {
                syncSelection(result.senders[0], 'messenger');
            }
        } catch (e) {
            console.error(e);
            setError(e.message || 'Could not create demo chatbot interactions.');
        } finally {
            setDemoBusy(false);
        }
    };

    const analyzeBookingContext = async () => {
        const inquiryText = buildGuestInquiryText(messages, selectedConversation?.last_preview || '');
        if (!selectedId || !inquiryText.trim()) return;
        try {
            setBookingAssistBusy(true);
            setBookingAssistError('');
            setBookingResult(null);
            setBookingReviewOpen(false);
            const result = await api.post('/api/v1/admin/inquiry-brain/analyze', {
                message: inquiryText,
                max_suggestions: 4
            });
            setBookingAnalysis(result);
            setSelectedSuggestionIndex(0);
            setBookingForm((current) => ({
                ...current,
                lodging_total: String(Number(result?.suggestions?.[0]?.summary?.total_amount || 0))
            }));
        } catch (e) {
            console.error(e);
            setBookingAssistError(e.message || 'Could not analyze this conversation for booking context.');
        } finally {
            setBookingAssistBusy(false);
        }
    };

    const reviewBooking = () => {
        if (!canCreateBooking) return;
        setBookingAssistError('');
        setBookingReviewOpen(true);
    };

    const createQuickBooking = async () => {
        if (!canCreateBooking || !bookingReviewOpen) return;
        try {
            setBookingLoading(true);
            setBookingAssistError('');
            setBookingResult(null);

            const transcriptNote = buildGuestInquiryText(messages, selectedConversation?.last_preview || '').slice(0, 500);
            const payload = buildChatMonitorBookingPayload({
                bookingForm,
                bookingAnalysis,
                topBookingSuggestion,
                selectedUnits: selectedBookingUnits,
                roomTotal,
                addonAmount,
                selectedId,
                transcriptNote,
            });
            const finalGross = payload.header.lodging_total;

            const created = await api.post('/api/v1/admin/booking-headers', payload);
            const createdRef = created?.header?.booking_reference;
            if (createdRef && initialPayment > 0) {
                await api.post(`/api/v1/admin/booking-headers/${createdRef}/payments`, {
                    amount: initialPayment,
                    payment_type: initialPayment >= finalGross && finalGross > 0 ? 'Full Payment' : 'deposit',
                    payment_method: bookingForm.payment_method || 'GCash',
                    verification_status: 'VERIFIED',
                    notes: bookingForm.payment_notes.trim() || 'Recorded during Chatbot Monitor quick booking creation',
                    admin_id: 'Vincent-Admin'
                });
            }
            setBookingResult(created);
            setBookingReviewOpen(false);
        } catch (e) {
            console.error(e);
            setBookingAssistError(e.message || 'Booking creation failed.');
        } finally {
            setBookingLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-40 items-center justify-center p-10 text-center text-sm font-semibold text-muted-foreground">
                Connecting to conversation inbox...
            </div>
        );
    }

    return (
        <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 flex h-[calc(100vh-210px)] min-h-0 flex-col gap-3 overflow-hidden">
            <Card className={cn(panelClass, 'grid min-w-0 items-center gap-3 rounded-[24px] px-3.5 py-3 lg:grid-cols-[minmax(250px,290px)_minmax(420px,1fr)_minmax(320px,380px)]')}>
                <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="m-0 text-[0.95rem] font-black leading-tight text-[#13211f]">Guest Chat Command Center</h2>
                    <p className="m-0 truncate text-[0.68rem] font-semibold leading-tight text-[#6d756f]">
                        {health.sub} | {filteredConversations.length} of {conversationCounts.all} thread(s)
                    </p>
                </div>

                <div className="grid min-w-0 items-center gap-2 md:grid-cols-[minmax(150px,0.36fr)_minmax(220px,0.64fr)]">
                    <label className="grid min-w-0 gap-1">
                        <span className={labelTextClass}>Queue</span>
                        <select
                            value={workflowMode}
                            onChange={(event) => setWorkflowMode(event.target.value)}
                            className={nativeSelectClass}
                        >
                            {WORKFLOW_MODES.map((mode) => (
                                <option key={mode.id} value={mode.id}>{mode.label} ({conversationCounts[mode.id] || 0})</option>
                            ))}
                        </select>
                    </label>
                    <label className="grid min-w-0 gap-1">
                        <span className={labelTextClass}>Signal</span>
                        <select
                            value={inboxMode}
                            onChange={(event) => setInboxMode(event.target.value)}
                            className={nativeSelectClass}
                        >
                            {activeSignalModes.map((mode) => (
                                <option key={mode.id} value={mode.id}>{mode.label} ({signalCounts[mode.id] || 0})</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                    <label className="grid min-w-0 gap-1">
                        <span className={labelTextClass}>Workspace Action</span>
                        <select
                            value={headerAction}
                            onChange={(event) => setHeaderAction(event.target.value)}
                            className={nativeSelectClass}
                        >
                            <option value="refresh">Refresh inbox</option>
                            <option value="demo">Load demo threads</option>
                            <option value="open_all">Open filtered windows</option>
                            <option value="archive_inactive">Archive inactive 30d</option>
                            <option value="archive_all">Archive active history</option>
                            <option value="delete_all">Delete monitor history</option>
                        </select>
                    </label>
                    <Button onClick={runHeaderAction} disabled={demoBusy || purgeBusy} variant={headerActionTone(headerAction)} className={compactButtonClass}>
                        {headerAction === 'refresh'
                            ? 'Refresh Inbox'
                            : headerAction === 'demo'
                                ? 'Load Demo'
                                : headerAction === 'open_all'
                                    ? 'Open'
                                    : headerAction === 'archive_all'
                                        ? 'Archive'
                                        : headerAction === 'archive_inactive'
                                        ? 'Archive 30d'
                                        : 'Delete'}
                    </Button>
                </div>
            </Card>

            {error && (
                <Card className="rounded-[20px] border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] font-semibold text-red-700 shadow-sm">
                    {error}
                </Card>
            )}

            {purgeNotice && (
                <Card className="rounded-[20px] border-[#0a6b5f]/20 bg-[#0a6b5f]/10 px-4 py-3 text-[0.78rem] font-black text-[#0a6b5f] shadow-sm">
                    {purgeNotice}
                </Card>
            )}

            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(250px,290px)_minmax(420px,1fr)_minmax(320px,380px)]">
                <Card className={cn(panelClass, 'flex min-h-0 flex-col gap-2 overflow-hidden rounded-[24px] p-3')}>
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <div className="text-[0.86rem] font-black text-[#13211f]">Conversation Inbox</div>
                            <div className="text-[0.72rem] font-semibold text-[#6d756f]">{filteredConversations.length} of {conversations.length} tracked thread(s)</div>
                        </div>
                        <div className="rounded-full bg-[#f5ead7] px-2.5 py-1 text-[0.68rem] font-extrabold text-[#9a6223]">
                            Alerts: {summary.open || 0}
                        </div>
                    </div>

                    <Input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Search threads..."
                        className="h-9 rounded-xl text-[0.74rem]"
                    />

                    {archiveFiles.length > 0 && (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/15 bg-amber-100/55 px-2.5 py-2">
                            <span className="min-w-0 truncate text-[0.68rem] font-black text-amber-700">
                                {archiveFiles.length} archive file{archiveFiles.length !== 1 ? 's' : ''}
                            </span>
                            <Button type="button" variant="ghost" size="sm" onClick={fetchArchives} className="h-6 shrink-0 px-1.5 text-[0.68rem] font-black text-amber-700 hover:text-amber-800">
                                Refresh
                            </Button>
                        </div>
                    )}

                    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
                        {filteredConversations.map((convo) => {
                            const isActive = convo.sender_id === selectedId;
                            const alertCount = alerts.filter((alert) => alert.sender_id === convo.sender_id).length;
                            const urgent = isUrgentConversation(convo, alerts);
                            const payment = isPaymentConversation(convo, alerts);
                            const priority = isPriorityConversation(convo, alerts);
                            const confirmationReady = getPaymentConfirmationForSender(paymentConfirmations, convo.sender_id);
                            const category = String(convo.category || 'LOW_PRIORITY_FAQ').toUpperCase();
                            const manual = Boolean(convo.manual_active);
                            return (
                                <button
                                    key={convo.sender_id}
                                    onClick={() => syncSelection(convo.sender_id, convo.source)}
                                    className={cn(
                                        'grid min-h-[42px] grid-cols-[minmax(82px,0.7fr)_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition hover:border-[#0a6b5f]/35 hover:bg-[#0a6b5f]/5',
                                        isActive ? 'border-[#0a6b5f] bg-[#0a6b5f]/10' : 'border-[#e1d8c8] bg-[#fffdf8]'
                                    )}
                                >
                                    <div className="min-w-0 truncate text-[0.74rem] font-black text-[#1c2520]">
                                        {convo.sender_id}
                                    </div>
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span title={CATEGORY_LABELS[category] || category} className={conversationDotClass({ urgent, payment, manual, priority })} />
                                        <span className="min-w-0 truncate text-[0.72rem] font-bold text-[#1c2520]/60">
                                            {convo.last_preview || 'No preview available.'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[0.66rem] font-extrabold text-[#1c2520]/60">
                                        {confirmationReady && <span title="Payment confirmation ready" className="text-blue-600">Pay</span>}
                                        {alertCount > 0 && <span title={`${alertCount} open alert(s)`} className="text-red-600">{alertCount}</span>}
                                        <span>{convo.turn_count || 0}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                <Card className={cn(panelClass, 'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] p-0')}>
                    {!selectedId ? (
                        <div className="flex flex-1 items-center justify-center text-sm font-semibold text-muted-foreground">
                            Select a conversation to open the workspace.
                        </div>
                    ) : (
                        <>
                            <div className="grid min-w-0 items-center gap-2 border-b border-black/10 bg-[#fbfcfb] px-2.5 py-2 lg:grid-cols-[minmax(160px,0.58fr)_minmax(0,1.42fr)]">
                                <div className="min-w-0">
                                    <div className="flex min-w-0 items-baseline gap-2">
                                        <div className="min-w-0 truncate text-[0.9rem] font-black text-[#1c2520]">{selectedId}</div>
                                        <div className="shrink-0 text-[0.66rem] font-bold text-[#1c2520]/60">{fmtSource(selectedSource)}</div>
                                    </div>
                                    {selectedState && (
                                        <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
                                            <span className="max-w-[150px] truncate rounded-full bg-[#1c2520]/5 px-2 py-1 text-[0.61rem] font-black text-[#1c2520]">
                                                {CATEGORY_LABELS[selectedState.category] || selectedState.category || 'Uncategorized'}
                                            </span>
                                            <span className={cn(
                                                'whitespace-nowrap rounded-full px-2 py-1 text-[0.61rem] font-black',
                                                selectedState.manual_active ? 'bg-blue-50 text-blue-700' : 'bg-[#486358]/10 text-[#486358]'
                                            )}>
                                                {selectedState.manual_active ? `Manual until ${selectedState.manual_until || 'set'}` : 'Bot Active'}
                                            </span>
                                            {selectedState.category_source === 'ai' && (
                                                <span title={selectedState.ai_reason || ''} className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-[0.61rem] font-black text-blue-700">
                                                    AI Tagged {Math.round(Number(selectedState.ai_confidence || 0) * 100)}%
                                                </span>
                                            )}
                                            {selectedState.category_source === 'manual' && (
                                                <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-1 text-[0.61rem] font-black text-amber-700">
                                                    Manual Tag
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex min-w-0 flex-nowrap items-center justify-end gap-1.5 overflow-hidden">
                                    <select
                                        value={selectedState?.category || selectedConversation?.category || 'LOW_PRIORITY_FAQ'}
                                        onChange={(event) => tagConversation(event.target.value)}
                                        disabled={sendBusy}
                                        className="h-8 min-w-[130px] max-w-[150px] rounded-xl border border-black/10 bg-white px-2 text-[0.66rem] font-extrabold text-[#1c2520] disabled:cursor-not-allowed disabled:opacity-55"
                                    >
                                        {CATEGORY_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                    <Button size="sm" variant="outline" onClick={() => setManualMode(true)} disabled={sendBusy || selectedSource !== 'messenger'} className="h-8 rounded-xl px-2 text-[0.66rem] font-extrabold">
                                        Pause
                                    </Button>
                                    <Button size="sm" variant={selectedState?.manual_active ? 'default' : 'outline'} onClick={() => setManualMode(false)} disabled={sendBusy || selectedSource !== 'messenger'} className="h-8 rounded-xl px-2 text-[0.66rem] font-extrabold">
                                        Release
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openConversationWindow(selectedId, selectedSource)} className="h-8 rounded-xl px-2 text-[0.66rem] font-extrabold">
                                        Window
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={archiveSelectedConversation} disabled={purgeBusy} className="h-8 rounded-xl px-2 text-[0.66rem] font-extrabold text-amber-700">
                                        Archive
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={purgeSelectedConversation} disabled={purgeBusy} className="h-8 rounded-xl px-2 text-[0.66rem] font-extrabold">
                                        Delete
                                    </Button>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3.5">
                                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-black/10 bg-[#fbfcfb] p-4">
                                        {threadLoading ? (
                                            <div className="p-6 text-center text-sm font-semibold text-muted-foreground">Loading conversation...</div>
                                        ) : messages.length === 0 ? (
                                            <div className="p-6 text-center text-sm font-semibold text-muted-foreground">No messages archived for this conversation yet.</div>
                                        ) : (
                                            messages.map((message, index) => {
                                                const outgoing = message.direction === 'outbound';
                                                return (
                                                    <div key={`${message.timestamp}-${index}`} className={cn('max-w-[82%]', outgoing ? 'self-end' : 'self-start')}>
                                                        <div className={cn('mb-1.5 text-[0.62rem] font-black uppercase tracking-[0.08em]', outgoing ? 'text-right text-[#486358]' : 'text-left text-[#1c2520]/60')}>
                                                            {message.author}
                                                        </div>
                                                        <div className={cn(
                                                            'border px-3.5 py-3 text-[0.82rem] leading-normal text-[#1c2520]',
                                                            outgoing
                                                                ? 'rounded-[16px_16px_4px_16px] border-[#486358]/15 bg-[#486358]/10'
                                                                : 'rounded-[16px_16px_16px_4px] border-black/10 bg-white'
                                                        )}>
                                                            {message.text}
                                                        </div>
                                                        <div className={cn('mt-1 text-[0.65rem] text-[#1c2520]/60', outgoing ? 'text-right' : 'text-left')}>
                                                            {message.timestamp}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <div ref={transcriptEndRef} />
                                    </div>

                                    <div className="flex shrink-0 flex-col gap-2 border-t border-black/10 bg-white pt-3">
                                        <Textarea
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            placeholder={selectedSource === 'messenger' ? 'Write your response to the guest...' : 'Web chat threads are read-only for now.'}
                                            disabled={selectedSource !== 'messenger' || sendBusy}
                                            className="max-h-[78px] min-h-12 w-full resize-y rounded-xl border border-black/10 px-3 py-3 text-[0.82rem] leading-normal outline-none transition placeholder:text-muted-foreground focus:border-[#486358]/40 focus:ring-2 focus:ring-[#486358]/10 disabled:cursor-not-allowed disabled:opacity-60"
                                        />
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-[0.68rem] text-[#1c2520]/60">
                                                {selectedState?.manual_active ? 'Human mode is active. Replies send through Messenger while the bot stays quiet.' : 'Replies send through Messenger and pause the bot for follow-up.'}
                                            </div>
                                            <Button onClick={sendReply} disabled={sendBusy || selectedSource !== 'messenger' || !draft.trim()} className="rounded-xl text-[0.72rem] font-extrabold">
                                                {sendBusy ? 'Sending...' : 'Send Reply'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </Card>

                <Card className={cn(panelClass, 'flex min-h-0 flex-col overflow-hidden rounded-[24px] p-0')}>
                    {!selectedId ? (
                        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-muted-foreground">
                            Booking tools will appear after selecting a conversation.
                        </div>
                    ) : (
                        <>
                            <div className="min-w-0 border-b border-black/10 bg-[#fbfcfb] px-4 py-3.5">
                                <div className="text-[0.92rem] font-black text-[#1c2520]">Assistant Panel</div>
                                <div className="mt-1 text-[0.72rem] font-bold leading-snug text-[#1c2520]/60">Pre-booking replies, quick booking, receipt review, and post-booking actions.</div>
                                <div className="mt-2.5 grid min-w-0 grid-cols-4 gap-1.5 rounded-xl border border-black/10 bg-[#f2f5f3] p-1.5">
                                    {BOOKING_RAIL_MODES.map((mode) => {
                                        const active = bookingRailMode === mode.id;
                                        return (
                                            <button
                                                key={mode.id}
                                                type="button"
                                                onClick={() => setBookingRailMode(mode.id)}
                                                className={cn(
                                                    'min-h-8 overflow-hidden rounded-[9px] border px-1.5 py-1.5 text-[0.61rem] font-black leading-tight transition [overflow-wrap:anywhere]',
                                                    active
                                                        ? 'border-[#486358]/25 bg-white text-[#1c2520] shadow-sm'
                                                        : 'border-[#1c2520]/10 bg-white/40 text-[#1c2520]/60 hover:bg-white/70'
                                                )}
                                            >
                                                {mode.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3.5">
                                {bookingRailMode === 'reply' && (
                                    <div className="grid max-h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-2.5 overflow-hidden rounded-2xl border border-black/10 bg-white p-3.5">
                                        <div>
                                            <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#486358]">Reply Helper</div>
                                            <div className="mt-1 text-[0.78rem] font-black leading-snug text-[#1c2520]">
                                                Pre-booking support for general questions transferred to a human agent.
                                            </div>
                                            <div className="mt-1.5 text-[0.7rem] font-extrabold leading-snug text-[#1c2520]/60">
                                                Always drafts in Amalfi friendly tone.
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-black/10 bg-[#1c2520]/5 p-2.5 text-[0.73rem] font-extrabold leading-normal text-[#1c2520]/60">
                                            {getLatestGuestMessage(messages, selectedConversation?.last_preview || '') || 'No guest message available yet.'}
                                        </div>
                                        <div className="grid gap-2">
                                            <Button
                                                type="button"
                                                onClick={generateReplyHelperDraft}
                                                disabled={replyHelperBusy || !getLatestGuestMessage(messages, selectedConversation?.last_preview || '')}
                                                className="h-[38px] min-h-[38px] w-full rounded-xl text-[0.72rem] font-extrabold"
                                            >
                                                {replyHelperBusy ? 'Drafting...' : 'Draft Friendly Reply'}
                                            </Button>
                                        </div>
                                        {replyHelperDraft?.reply && (
                                            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2.5">
                                                <div className="min-h-0 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#486358]/15 bg-[#486358]/10 px-3 py-2.5 text-[0.78rem] font-extrabold leading-normal text-[#1c2520] [overflow-wrap:anywhere]">
                                                    {replyHelperDraft.reply}
                                                </div>
                                                <Button type="button" onClick={useReplyHelperDraft} className="w-full rounded-xl bg-blue-600 text-[0.72rem] font-extrabold text-white hover:bg-blue-700">
                                                    Use In Message Box
                                                </Button>
                                            </div>
                                        )}
                                        {replyHelperError && <div className="text-[0.74rem] font-extrabold text-red-600">{replyHelperError}</div>}
                                    </div>
                                )}

                            {bookingRailMode === 'receipts' && (
                                <>
                            <div className="grid gap-3 rounded-[14px] border border-black/10 bg-white p-3.5">
                                <div className="flex min-w-0 items-start justify-between gap-2.5">
                                    <div className="min-w-0">
                                        <div className="text-[0.86rem] font-black leading-tight text-[#1c2520]">Receipt Review</div>
                                        <div className="mt-1 text-[0.72rem] font-bold leading-snug text-[#1c2520]/60">
                                            Transfer proof, acknowledgement slips, and post-payment follow-ups.
                                        </div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[0.62rem] font-black text-blue-700">
                                        Read-only
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5">
                                    {[
                                        ['Images', receiptImageCandidates.length],
                                        ['Refs', detectedBookingRefs.length],
                                        ['Alerts', selectedAlerts.length],
                                    ].map(([label, value]) => (
                                        <div key={label} className="min-w-0 rounded-xl border border-black/10 bg-[#1c2520]/5 px-2 py-2">
                                            <div className="text-[0.6rem] font-black uppercase text-[#1c2520]/60">{label}</div>
                                            <div className="mt-0.5 text-[0.86rem] font-black text-[#1c2520]">{value}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid gap-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[0.68rem] font-black uppercase text-[#1c2520]/60">Selected image</span>
                                        {selectedReceiptCandidate?.url && (
                                            <a href={selectedReceiptCandidate.url} target="_blank" rel="noreferrer" className="text-[0.68rem] font-black text-blue-700 no-underline hover:underline">
                                                Open image
                                            </a>
                                        )}
                                    </div>
                                <select
                                    value={selectedReceiptCandidate?.id || ''}
                                    onChange={(event) => {
                                        setSelectedReceiptId(event.target.value);
                                        setReceiptReviewResult(null);
                                        setReceiptReviewError('');
                                    }}
                                    disabled={receiptImageCandidates.length === 0}
                                    className="h-[38px] w-full min-w-0 rounded-xl border border-black/10 bg-white px-2.5 text-[0.72rem] font-extrabold text-[#1c2520] disabled:bg-[#1c2520]/5 disabled:text-[#1c2520]/60"
                                >
                                    {receiptImageCandidates.length === 0 ? (
                                        <option>No receipt images detected in thread</option>
                                    ) : (
                                        receiptImageCandidates.map((candidate) => (
                                            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                                        ))
                                    )}
                                </select>
                                </div>

                                {detectedBookingRefs.length > 0 && (
                                    <div className="rounded-xl border border-black/10 bg-[#f8faf9] px-2.5 py-2 text-[0.7rem] font-extrabold text-[#1c2520] [overflow-wrap:anywhere]">
                                        Booking ref detected: {detectedBookingRefs.join(', ')}
                                    </div>
                                )}
                                {selectedReceiptCandidate && !selectedReceiptCandidate.hasUrl && (
                                    <div className="rounded-xl border border-amber-500/15 bg-amber-50 px-2.5 py-2 text-[0.7rem] font-extrabold leading-snug text-amber-800 [overflow-wrap:break-word]">
                                        Older receipt marker only. New Messenger image receipts will show here with a selectable URL.
                                    </div>
                                )}

                                <Button
                                    type="button"
                                    onClick={analyzeSelectedReceipt}
                                    disabled={receiptReviewBusy || !selectedReceiptCandidate?.url}
                                    className="h-9 min-h-9 w-full rounded-xl bg-blue-600 text-[0.72rem] font-extrabold text-white hover:bg-blue-700"
                                >
                                    {receiptReviewBusy ? 'Analyzing...' : 'Analyze Receipt'}
                                </Button>
                                {receiptReviewError && <div className="text-[0.74rem] font-extrabold text-red-600">{receiptReviewError}</div>}
                            </div>

                            {receiptReviewResult?.summary && (
                                <div className={cn(
                                    'grid gap-2.5 overflow-hidden rounded-2xl border p-3.5',
                                    receiptReviewResult.summary.tone === 'red'
                                        ? 'border-red-500/20 bg-red-50'
                                        : receiptReviewResult.summary.tone === 'blue'
                                            ? 'border-blue-500/20 bg-blue-50'
                                            : receiptReviewResult.summary.tone === 'gold'
                                                ? 'border-amber-500/20 bg-amber-50'
                                                : 'border-[#486358]/20 bg-[#486358]/10'
                                )}>
                                    <div>
                                        <div className="text-[0.72rem] font-black uppercase tracking-normal text-[#486358]">Analysis Result</div>
                                        <div className="mt-1 text-[0.84rem] font-black text-[#1c2520] [overflow-wrap:break-word]">{receiptReviewResult.summary.status}</div>
                                    </div>
                                    <div className="grid min-w-0 grid-cols-2 gap-2">
                                        <div className="min-w-0 rounded-xl border border-black/10 bg-white p-2.5">
                                            <div className="text-[0.62rem] font-black uppercase text-[#1c2520]/60">Amount</div>
                                            <div className="mt-1 text-[0.76rem] font-black text-[#1c2520] [overflow-wrap:anywhere]">{receiptReviewResult.receipt_check?.amount || (receiptReviewResult.receipt_check?.has_amount ? 'Detected' : 'Missing')}</div>
                                        </div>
                                        <div className="min-w-0 rounded-xl border border-black/10 bg-white p-2.5">
                                            <div className="text-[0.62rem] font-black uppercase text-[#1c2520]/60">Reference</div>
                                            <div className="mt-1 text-[0.76rem] font-black text-[#1c2520] [overflow-wrap:anywhere]">{receiptReviewResult.receipt_check?.reference_number || (receiptReviewResult.receipt_check?.has_reference ? 'Detected' : 'Missing')}</div>
                                        </div>
                                    </div>
                                    <div className="text-[0.76rem] font-extrabold leading-normal text-[#1c2520] [overflow-wrap:break-word]">
                                        {receiptReviewResult.summary.action}
                                    </div>
                                    {receiptReviewResult.receipt_check?.reason && (
                                        <div className="text-[0.72rem] font-extrabold leading-normal text-[#1c2520]/60 [overflow-wrap:break-word]">
                                            AI note: {receiptReviewResult.receipt_check.reason}
                                        </div>
                                    )}
                                    <Button type="button" onClick={useReceiptReviewDraft} className="w-full rounded-xl text-[0.72rem] font-extrabold">
                                        Use Suggested Reply
                                    </Button>
                                </div>
                            )}

                            {selectedAlerts.length > 0 && (
                                <div className="min-w-0 overflow-hidden rounded-[14px] border border-red-500/15 bg-red-50 px-3 py-2.5 text-[#1c2520]">
                                    <div className="text-[0.68rem] font-black uppercase tracking-normal text-red-600">Open Alerts</div>
                                    <div className="mt-1.5 text-[0.74rem] leading-normal [overflow-wrap:break-word]">
                                        {selectedAlerts.map((alert) => `${alert.escalation_reason} (${alert.status})`).join(' | ')}
                                    </div>
                                </div>
                            )}

                            {selectedState?.ai_reason && (
                                <details className="min-w-0 overflow-hidden rounded-[14px] border border-blue-500/15 bg-blue-50 px-3 py-2.5 text-[#1c2520]">
                                    <summary className="cursor-pointer text-[0.7rem] font-black uppercase tracking-normal text-blue-700">
                                        AI Triage
                                    </summary>
                                    <div className="mt-2 text-[0.74rem] leading-normal [overflow-wrap:break-word]">
                                        {selectedState.ai_reason}
                                        {selectedState.ai_suggested_action ? ` Action: ${selectedState.ai_suggested_action}` : ''}
                                    </div>
                                </details>
                            )}
                                </>
                            )}

                                {bookingRailMode === 'actions' && (
                                    <>
                                <div className="grid gap-2.5 overflow-hidden rounded-2xl border border-black/10 bg-white p-3.5">
                                    <div>
                                        <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#486358]">Guest Actions</div>
                                        <div className="mt-1 text-[0.76rem] font-extrabold leading-normal text-[#1c2520]/60">Post-booking confirmations and booking reminders.</div>
                                    </div>
                                    <select
                                        value={reminderType}
                                        onChange={(event) => setReminderType(event.target.value)}
                                        className="h-[38px] rounded-xl border border-black/10 px-2.5 font-extrabold text-[#1c2520]"
                                    >
                                        <option value="booking_notice">Booking confirmation / notice</option>
                                        <option value="underpayment_reminder">Payment reminder</option>
                                    </select>
                                    <div className="grid gap-2">
                                        <Input value={reminderForm.booking_ref} onChange={(event) => setReminderForm((current) => ({ ...current, booking_ref: event.target.value }))} placeholder="Booking ref optional" className="h-[38px] rounded-xl font-bold" />
                                        {reminderType === 'underpayment_reminder' ? (
                                            <>
                                                <Input value={reminderForm.amount_due} onChange={(event) => setReminderForm((current) => ({ ...current, amount_due: event.target.value }))} placeholder="Amount due optional" className="h-[38px] rounded-xl font-bold" />
                                                <Input value={reminderForm.due_date} onChange={(event) => setReminderForm((current) => ({ ...current, due_date: event.target.value }))} placeholder="Due date optional" className="h-[38px] rounded-xl font-bold" />
                                            </>
                                        ) : (
                                            <>
                                                <Input value={reminderForm.status} onChange={(event) => setReminderForm((current) => ({ ...current, status: event.target.value }))} placeholder="Status" className="h-[38px] rounded-xl font-bold" />
                                                <Textarea value={reminderForm.note} onChange={(event) => setReminderForm((current) => ({ ...current, note: event.target.value }))} placeholder="Notice note" className="min-h-[68px] resize-y rounded-xl border border-black/10 p-2.5 font-bold outline-none focus:border-[#486358]/40 focus:ring-2 focus:ring-[#486358]/10" />
                                            </>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" onClick={() => previewTemplate(reminderType, reminderForm)} disabled={sendBusy || selectedSource !== 'messenger'} className={cn('rounded-xl text-[0.72rem] font-extrabold', reminderType === 'underpayment_reminder' ? 'text-amber-700' : 'text-blue-700')}>
                                            Preview
                                        </Button>
                                        <Button onClick={() => sendTemplate(reminderType, reminderForm)} disabled={sendBusy || selectedSource !== 'messenger'} className={cn('rounded-xl text-[0.72rem] font-extrabold', reminderType === 'underpayment_reminder' ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700')}>
                                            Send
                                        </Button>
                                    </div>
                                </div>

                            {selectedPaymentConfirmation && (
                                <div className="grid items-center gap-3.5 rounded-2xl border border-blue-500/15 bg-blue-50 p-3.5 text-[#1c2520] lg:grid-cols-[1fr_auto]">
                                    <div>
                                        <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-blue-700">Payment Confirmation Ready</div>
                                        <div className="mt-1.5 text-[0.86rem] font-black">
                                            {selectedPaymentConfirmation.guest_name} | {selectedPaymentConfirmation.booking_ref}
                                        </div>
                                        <div className="mt-1 text-[0.74rem] font-extrabold leading-normal text-[#1c2520]/60">
                                            Paid {fmtCur(selectedPaymentConfirmation.latest_payment_amount || selectedPaymentConfirmation.amount_paid)} on {selectedPaymentConfirmation.latest_payment_at || 'recent payment'}.
                                            {' '}Stay: {selectedPaymentConfirmation.check_in || '-'} to {selectedPaymentConfirmation.check_out || '-'}.
                                            {' '}Balance: {fmtCur(selectedPaymentConfirmation.balance || 0)}.
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <Button variant="outline" onClick={usePaymentConfirmationDraft} disabled={selectedSource !== 'messenger' || paymentConfirmationBusy} className="rounded-xl text-[0.74rem] font-black text-blue-700">
                                            Review Draft
                                        </Button>
                                        <Button onClick={sendPaymentConfirmation} disabled={selectedSource !== 'messenger' || paymentConfirmationBusy} className="rounded-xl bg-blue-600 text-[0.74rem] font-black text-white hover:bg-blue-700">
                                            {paymentConfirmationBusy ? 'Sending...' : 'Send Confirmation'}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {paymentNotice && (
                                <div className="rounded-[14px] border border-[#486358]/15 bg-[#486358]/10 px-3 py-2.5 text-[0.76rem] font-black text-[#486358]">
                                    {paymentNotice}
                                </div>
                            )}
                                    </>
                                )}

                            {bookingRailMode === 'assist' && (
                            <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-3.5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-amber-700">Quick Booking</div>
                                        <div className="mt-1 text-[0.86rem] font-black text-[#1c2520]">Parse chat context and create a reviewed booking</div>
                                        <div className="mt-1.5 text-[0.7rem] font-extrabold leading-snug text-[#1c2520]/60">
                                            Analyze Request extracts dates, pax, room intent, and does a quick audit before booking review.
                                        </div>
                                    </div>
                                    <Button
                                        onClick={analyzeBookingContext}
                                        disabled={bookingAssistBusy || threadLoading || messages.length === 0}
                                        className="rounded-xl text-[0.74rem] font-black"
                                    >
                                        {bookingAssistBusy ? 'Reading Thread...' : 'Analyze Request'}
                                    </Button>
                                </div>

                                {!bookingAnalysis && (
                                    <div className="grid gap-2 rounded-2xl border border-black/10 bg-[#1c2520]/5 p-3">
                                        <div className="text-[0.7rem] font-black text-[#1c2520]">Booking audit appears here after analysis</div>
                                        <div className="text-[0.74rem] font-extrabold leading-normal text-[#1c2520]/60">
                                            Analyze the chat to extract dates, pax, and room intent. Then this panel shows available unit options, single/multi booking controls, pricing, payment, and final Create Booking review.
                                        </div>
                                    </div>
                                )}

                                {bookingAnalysis && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {[
                                                ['Check-in', bookingAnalysis.context?.check_in || 'Not detected'],
                                                ['Check-out', bookingAnalysis.context?.check_out || 'Not detected'],
                                                ['Pax', bookingAnalysis.context?.guests ? `${bookingAnalysis.context.guests} pax` : 'Not detected'],
                                                ['Room', bookingAnalysis.context?.room_type || 'Any available']
                                            ].map(([label, value]) => (
                                                <div key={label} className="rounded-[14px] border border-black/10 bg-[#1c2520]/5 px-3 py-2.5">
                                                    <div className="text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#1c2520]/60">{label}</div>
                                                    <div className="mt-1 text-[0.76rem] font-black text-[#1c2520]">{value}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {bookingAnalysis.warnings?.length > 0 && (
                                            <div className="rounded-[14px] border border-red-500/15 bg-red-50 px-3 py-2.5 text-[0.74rem] font-extrabold text-red-600">
                                                {bookingAnalysis.warnings.join(' ')}
                                            </div>
                                        )}

                                        {topBookingSuggestion ? (
                                            <div className="rounded-2xl border border-[#486358]/15 bg-[#486358]/10 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2.5">
                                                    <div className="text-[0.7rem] font-black uppercase tracking-[0.08em] text-[#486358]">Unit Booking Option</div>
                                                    {bookingAnalysis.suggestions?.length > 1 && (
                                                        <select
                                                            value={selectedSuggestionIndex}
                                                            onChange={(event) => {
                                                                const nextIndex = Number(event.target.value);
                                                                const nextSuggestion = bookingAnalysis.suggestions[nextIndex];
                                                                setSelectedSuggestionIndex(nextIndex);
                                                                setBookingForm((current) => ({
                                                                    ...current,
                                                                    lodging_total: String(Number(nextSuggestion?.summary?.total_amount || 0))
                                                                }));
                                                            }}
                                                            className="h-8 rounded-xl border border-black/10 px-2 text-[0.68rem] font-extrabold"
                                                        >
                                                            {bookingAnalysis.suggestions.map((suggestion, index) => (
                                                                <option key={suggestion.unit_ids?.join('-') || index} value={index}>
                                                                    Option {index + 1}: {suggestion.summary?.total_units || 0} unit(s), {fmtCur(suggestion.summary?.total_amount || 0)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                                <div className="mt-1.5 font-black text-[#1c2520]">{selectedUnitLabelText}</div>
                                                <div className="mt-1 text-[0.74rem] font-extrabold text-[#1c2520]/60">
                                                    {topBookingSuggestion.summary?.total_units || 0} unit(s), capacity up to {topBookingSuggestion.summary?.total_absolute_capacity || 0} pax, estimated {fmtCur(topBookingSuggestion.summary?.total_amount || 0)}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl border border-amber-500/15 bg-amber-50 p-3 text-[0.76rem] font-extrabold text-[#1c2520]">
                                                No bookable unit suggestion yet. Confirm dates and pax in the thread, then analyze again.
                                            </div>
                                        )}

                                        {topBookingSuggestion && (
                                            <>
                                                <div className="flex flex-col gap-2.5 rounded-2xl border border-black/10 bg-[#1c2520]/5 p-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                                                        <div>
                                                            <div className="text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#1c2520]/60">Booking Type</div>
                                                            <div className="mt-1 text-[0.76rem] font-black text-[#1c2520]">
                                                                {bookingMode === 'multi' ? 'Multi booking with shared payment' : 'Single booking with one unit'}
                                                            </div>
                                                        </div>
                                                        <div className="inline-flex gap-1 rounded-full border border-black/10 bg-white p-1">
                                                            <button type="button" onClick={() => setBookingMode('single')} className={cn('rounded-full px-3 py-2 text-[0.64rem] font-black', bookingMode === 'single' ? 'bg-[#486358] text-white' : 'text-[#1c2520]/60')}>Single</button>
                                                            <button type="button" onClick={() => setBookingMode('multi')} disabled={(topBookingSuggestion?.units || []).length < 2} className={cn('rounded-full px-3 py-2 text-[0.64rem] font-black disabled:cursor-not-allowed disabled:opacity-50', bookingMode === 'multi' ? 'bg-[#486358] text-white' : 'text-[#1c2520]/60')}>Multi</button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap justify-between gap-2 text-[0.7rem] font-extrabold text-[#1c2520]">
                                                        <span>{selectedBookingUnits.length} selected unit{selectedBookingUnits.length !== 1 ? 's' : ''}</span>
                                                        <span>{selectedCapacity || 0} pax capacity</span>
                                                        <span>{bookingAnalysis.context?.guests || 0} booking pax</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedBookingUnits.map((unit) => (
                                                            <span key={unit.unit_id} className="rounded-xl border border-black/10 bg-white px-2.5 py-2 text-[0.68rem] font-extrabold">
                                                                {unit.unit_label || unit.unit_id}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {!capacityOk && (
                                                        <div className="text-[0.72rem] font-black text-red-600">
                                                            Pax exceeds selected capacity. Switch to Multi or choose a larger suggestion.
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 gap-2.5">
                                                    <Input value={bookingForm.guest_name} onChange={(event) => setBookingForm((current) => ({ ...current, guest_name: event.target.value }))} placeholder="Guest name" className="h-10 rounded-xl font-bold" />
                                                    <Input value={bookingForm.phone} onChange={(event) => setBookingForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="h-10 rounded-xl font-bold" />
                                                    <Input value={bookingForm.email} onChange={(event) => setBookingForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email optional" className="h-10 rounded-xl font-bold" />
                                                    <select value={bookingForm.status} onChange={(event) => setBookingForm((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-xl border border-black/10 px-3 font-bold">
                                                        <option value="RESERVED">Reserved</option>
                                                        <option value="PENDING_VERIFICATION">Pending Verification</option>
                                                        <option value="CHECKED_IN">Checked In</option>
                                                    </select>
                                                    <Input value={bookingForm.lodging_total} onChange={(event) => setBookingForm((current) => ({ ...current, lodging_total: event.target.value }))} type="number" min="0" step="100" placeholder="Agreed room total" className="h-10 rounded-xl font-bold" />
                                                    <Input value={bookingForm.addon_amount} onChange={(event) => setBookingForm((current) => ({ ...current, addon_amount: event.target.value }))} type="number" min="0" step="100" placeholder="Add-ons / extras" className="h-10 rounded-xl font-bold" />
                                                    <Input value={bookingForm.initial_payment} onChange={(event) => setBookingForm((current) => ({ ...current, initial_payment: event.target.value }))} type="number" min="0" step="100" placeholder="Downpayment / paid today" className="h-10 rounded-xl border-[#486358]/30 bg-[#486358]/10 font-extrabold" />
                                                    <select value={bookingForm.payment_method} onChange={(event) => setBookingForm((current) => ({ ...current, payment_method: event.target.value }))} className="h-10 rounded-xl border border-black/10 px-3 font-bold">
                                                        {['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Admin Entry'].map((method) => <option key={method} value={method}>{method}</option>)}
                                                    </select>
                                                    <Input value={bookingForm.payment_notes} onChange={(event) => setBookingForm((current) => ({ ...current, payment_notes: event.target.value }))} placeholder="Payment note / reference optional" className="col-span-full h-10 rounded-xl font-bold" />
                                                </div>

                                                {!bookingReviewOpen ? (
                                                    <Button onClick={reviewBooking} disabled={!canCreateBooking} className="h-[42px] rounded-xl bg-amber-600 font-black text-white hover:bg-amber-700">
                                                        Review Quick Booking
                                                    </Button>
                                                ) : (
                                                    <div className="rounded-2xl border border-amber-500/20 bg-amber-50 p-3">
                                                        <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-amber-700">Confirm before creating</div>
                                                        <div className="mt-2 text-[0.78rem] font-extrabold leading-normal text-[#1c2520]">
                                                            Create a {selectedBookingUnits.length > 1 ? 'multi' : 'single'} booking for <strong>{bookingForm.guest_name.trim()}</strong> on <strong>{bookingAnalysis.context.check_in}</strong> to <strong>{bookingAnalysis.context.check_out}</strong>. Booked unit{selectedBookingUnits.length !== 1 ? 's' : ''}: <strong>{selectedUnitLabelText || 'Not selected'}</strong>. Gross: <strong>{fmtCur(grossTotal)}</strong>. Paid today: <strong>{fmtCur(initialPayment)}</strong>. Balance: <strong>{fmtCur(bookingBalance)}</strong>.
                                                        </div>
                                                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                                                            <Button type="button" variant="outline" onClick={() => setBookingReviewOpen(false)} disabled={bookingLoading} className="h-10 rounded-xl font-black">Edit Details</Button>
                                                            <Button onClick={createQuickBooking} disabled={bookingLoading} className="h-10 rounded-xl font-black">{bookingLoading ? 'Creating...' : 'Create Booking'}</Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}

                                {bookingAssistError && <div className="text-[0.74rem] font-extrabold text-red-600">{bookingAssistError}</div>}
                                {bookingResult?.header?.booking_reference && (
                                    <div className="rounded-[14px] border border-[#486358]/15 bg-[#486358]/10 px-3 py-2.5 text-[0.76rem] font-black text-[#486358]">
                                        Booking created: {bookingResult.header.booking_reference}
                                        {selectedUnitLabelText ? ` · Booked unit: ${selectedUnitLabelText}` : ''}
                                    </div>
                                )}
                            </div>
                            )}
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
