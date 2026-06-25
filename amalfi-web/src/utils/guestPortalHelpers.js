const EMAIL_RE = /^[^@]+@[^@]+\.[^@]+$/;

export function validateGuestContact({ fullName, email, phone }) {
  if (!String(fullName || '').trim()) return 'Please enter your full name.';
  if (!String(email || '').trim() || !EMAIL_RE.test(String(email).trim())) {
    return 'Please enter a valid email address.';
  }
  const digits = String(phone || '').replace(/\D/g, '');
  const nationalNumber = digits.startsWith('63')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  if (!/^9\d{9}$/.test(nationalNumber)) {
    return 'Please enter a valid phone number (+63 9XX XXX XXXX).';
  }
  return null;
}

export function buildReceiptRetryMessage(ref, fallback = 'Receipt upload failed.') {
  if (!ref) return fallback;
  const message = String(fallback || '').trim();
  const lower = message.toLowerCase();
  const isReceiptGuidance =
    lower.includes('receipt') &&
    (
      lower.includes('please upload') ||
      lower.includes('payment screenshot') ||
      lower.includes('booking acknowledgement') ||
      lower.includes('reference number')
    );
  if (isReceiptGuidance) return message;
  return `Your booking reference ${ref} is already saved. Please retry the receipt upload or contact Amalfi Resort with this reference.`;
}

export async function readPortalError(response, fallbackMessage) {
  let message = fallbackMessage;
  try {
    const payload = await response.json();
    if (payload?.error) message = payload.error;
  } catch {
    // Keep fallback when the response body is not JSON.
  }
  return message;
}
