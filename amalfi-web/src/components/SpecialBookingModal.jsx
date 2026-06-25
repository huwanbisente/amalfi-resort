import React, { useEffect, useState, useRef } from 'react';
import { getHolidayBookingViolation, formatHolidayBookingViolation } from '../utils/holidayBookingRules';
import { buildReceiptRetryMessage, readPortalError, validateGuestContact } from '../utils/guestPortalHelpers';
import { formatDateOnlyInManila, formatNowInManila, getManilaTodayKey, parseDateOnlyAsLocalDate } from '../utils/manilaDate';
import { fetchCentralKnowledge } from '../services/knowledge';
import { choiceClass, guestModal, progressStepClass, uploadZoneClass } from './guestModalTailwind';

const HUB_API       = '/api/v1/public';

const isWeekend  = (d) => { const day = parseDateOnlyAsLocalDate(d)?.getDay(); return day === 0 || day === 5 || day === 6; };
const formatDate = (s) => s ? formatDateOnlyInManila(s, 'en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '-';
const formatDateManila = (s) => s ? formatDateOnlyInManila(s, 'en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '-';

const CalIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
);

const SpecialBookingModal = ({ onClose }) => {
    const [step, setStep]           = useState(1);
    const [date, setDate]           = useState('');
    const [guests, setGuests]       = useState(2);
    const [form, setForm]           = useState({ full_name: '', email: '', phone: '+63 ' });
    const [paymentCommitment, setPaymentCommitment] = useState('DEPOSIT');
    const [paymentMethod, setPaymentMethod]         = useState('GCASH');
    const [file, setFile]           = useState(null);
    const [bookingRef, setBookingRef] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError]         = useState(null);
    const [showQRZoom, setShowQRZoom] = useState(false);
    const [knowledgeBase, setKnowledgeBase] = useState(null);

    const dateRef    = useRef(null);
    const receiptRef = useRef(null);
    const today      = getManilaTodayKey();

    useEffect(() => {
        let cancelled = false;
        fetchCentralKnowledge()
            .then((payload) => {
                if (!cancelled) setKnowledgeBase(payload);
            })
            .catch(() => {
                if (!cancelled) setKnowledgeBase({});
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const pricePerPax      = knowledgeBase?.special_bookings?.day_tour?.pax_fee_php || 350;
    const downPct          = knowledgeBase?.booking_and_cancellation_policies?.downpayment_required_percent || 50;
    const gcash            = knowledgeBase?.payment_channels?.gcash;
    const bank             = knowledgeBase?.payment_channels?.bank_transfer;
    const total            = pricePerPax * (guests || 0);
    const amountToPayNow   = paymentCommitment === 'DEPOSIT' ? Math.ceil(total * (downPct / 100)) : total;
    const remainingBalance = total - amountToPayNow;

    const handleClose = () => {
        if (step === 3 && file && !bookingRef) {
            if (!window.confirm('You have an attached receipt. Submit before leaving?')) return;
        }
        onClose();
    };

    const checkAndAdvance = async () => {
        if (!date)      { setError('Please select a visit date.'); return; }
        if (guests < 1) { setError('Please enter the number of guests.'); return; }
        if (guests > 50) { setError('Maximum 50 guests allowed for Day Tours.'); return; }
        const holidayViolation = getHolidayBookingViolation({
            checkIn: date,
            checkOut: date,
            bookingType: 'day_tour',
            rule: knowledgeBase?.booking_rules?.holiday_minimum_stay || {},
        });
        if (holidayViolation) { setError(formatHolidayBookingViolation(holidayViolation)); return; }
        setUploading(true); setError(null);
        try {
            const resp = await fetch(`${HUB_API}/special-availability?type=day_tour&date=${date}`);
            const data = await resp.json();
            if (!data.available) { setError(`Day Tours are fully booked on ${formatDateManila(date)}. Please choose another date.`); setUploading(false); return; }
        } catch { /* allow on network failure */ }
        finally { setUploading(false); }
        setStep(2);
    };

    const confirmGuest = () => {
        const validationError = validateGuestContact({
            fullName: form.full_name,
            email: form.email,
            phone: form.phone,
        });
        if (validationError) { setError(validationError); return; }
        setError(null);
        setStep(3);
    };

    const finalizeUpload = async () => {
        if (!file) { setError('Please attach your payment screenshot or receipt.'); return; }
        setUploading(true); setError(null);
        try {
            let ref = bookingRef;
            let receiptToken = '';
            if (!ref) {
                const precheckFd = new FormData();
                precheckFd.append('file', file);
                precheckFd.append('amount', amountToPayNow);
                precheckFd.append('transaction_type', paymentCommitment === 'DEPOSIT' ? 'deposit' : 'full payment');
                precheckFd.append('payment_method', paymentMethod);
                const precheckResp = await fetch(`${HUB_API}/precheck/receipt`, { method: 'POST', body: precheckFd });
                if (!precheckResp.ok) throw new Error(await readPortalError(precheckResp, 'Please upload a valid receipt to proceed with the booking.'));
                const precheckPayload = await precheckResp.json();
                receiptToken = precheckPayload.receipt_token || '';
                if (!receiptToken) throw new Error('Receipt check passed, but the upload token was not issued. Please try again.');
            }
            if (!ref) {
                const bookResp = await fetch(`${HUB_API}/special-book`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        booking_type: 'day_tour',
                        date,
                        guests,
                        full_name: form.full_name,
                        email: form.email,
                        phone: form.phone,
                        total_price: total,
                        balance: remainingBalance,
                        receipt_token: receiptToken,
                        transaction_type: paymentCommitment === 'DEPOSIT' ? 'deposit' : 'full payment',
                        payment_method: paymentMethod
                    }),
                });
                if (!bookResp.ok) throw new Error(await readPortalError(bookResp, 'Booking failed.'));
                const bookingPayload = await bookResp.json();
                ref = bookingPayload.booking_ref;
                setBookingRef(ref);
                if (bookingPayload.receipt_uploaded) {
                    setStep(4);
                    return;
                }
            }
            const fd = new FormData();
            if (receiptToken) fd.append('receipt_token', receiptToken); else fd.append('file', file);
            fd.append('booking_ref', ref); fd.append('amount', amountToPayNow);
            fd.append('transaction_type', paymentCommitment === 'DEPOSIT' ? 'deposit' : 'full payment');
            fd.append('payment_method', paymentMethod);
            const upResp = await fetch(`${HUB_API}/upload/receipt`, { method: 'POST', body: fd });
            if (!upResp.ok) {
                const uploadMessage = await readPortalError(upResp, 'Receipt upload failed.');
                throw new Error(receiptToken ? uploadMessage : buildReceiptRetryMessage(ref, uploadMessage));
            }
            setStep(4);
        } catch (e) { setError(e.message); }
        finally { setUploading(false); }
    };

    const handlePhone = (e) => {
        let v = e.target.value;
        if (!v.startsWith('+63 ')) v = '+63 ' + v.replace(/^\+63\s?/, '');
        if (v.length <= 16) setForm({ ...form, phone: v });
    };

    const downloadSlip = async () => {
        if (!receiptRef.current) return;
        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(receiptRef.current, { scale: 2, backgroundColor: '#fef9ef', useCORS: true, logging: false });
            const link = document.createElement('a');
            link.download = `amalfi-daytour-${bookingRef}.png`;
            link.href = canvas.toDataURL('image/png'); link.click();
        } catch (e) { console.error(e); }
    };

    const qrSrc = paymentMethod === 'GCASH' ? '/api/v1/assets/payment/gcash.png' : '/api/v1/assets/payment/bank.png';

    return (
        <>
            <div className={guestModal.overlay} onClick={handleClose}>
                <div className={guestModal.content} onClick={e => e.stopPropagation()}>
                    <button onClick={handleClose} className={guestModal.close} title="Close">X</button>

                    <div className={guestModal.progress}>
                        <span className={progressStepClass(step >= 1, step === 1)}>01 VISIT</span>
                        <span className={guestModal.progressDiv}>/</span>
                        <span className={progressStepClass(step >= 2, step === 2)}>02 GUEST</span>
                        <span className={guestModal.progressDiv}>/</span>
                        <span className={progressStepClass(step >= 3, step === 3)}>03 PAYMENT</span>
                    </div>

                    {/* -- STEP 1 -- */}
                    {step === 1 && (
                        <div className={guestModal.step}>
                            <span className={guestModal.label}>Special Booking</span>
                            <h2 className={guestModal.roomTitle}>Day Tour</h2>
                            <p className={guestModal.desc}>Full-day beach, pool and open cottage access. PHP 350/pax. 7am - 7pm. No cooking allowed (grilling only).</p>
                            <div className={guestModal.gridTwo}>
                                <div className={guestModal.fullSpan}>
                                    <label className={guestModal.labelSmall}>Visit Date</label>
                                    <div className={guestModal.dateWrap}>
                                        <input ref={dateRef} type="date" className={guestModal.dateInput} min={today} value={date}
                                            style={{ color: date ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                            onChange={e => setDate(e.target.value)} />
                                        <button type="button" className={guestModal.calBtn} onClick={() => dateRef.current?.showPicker()}><CalIcon /></button>
                                    </div>
                                    {date && <p className={guestModal.hint}>Day Tour Rate - PHP 350 per guest</p>}
                                </div>
                                <div className={guestModal.fullSpan}>
                                    <label className={guestModal.labelSmall}>Number of Guests</label>
                                    <input type="number" min="1" max="50" value={guests}
                                        onChange={e => setGuests(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                                        onBlur={() => setGuests(Math.max(1, parseInt(guests) || 1))}
                                        className={guestModal.textInput} />
                                    <p className={guestModal.hint}><span className={guestModal.hintBold}>Max 50 pax per booking</span> Â· Only 2 slots available per day</p>
                                </div>
                            </div>
                            {error && <p className={guestModal.error}>{error}</p>}
                            <div className={guestModal.actionRight}>
                                <button className={guestModal.primaryBtn} disabled={uploading} onClick={checkAndAdvance}>
                                    {uploading ? 'CHECKING AVAILABILITY...' : 'CONTINUE TO GUEST DETAILS'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* -- STEP 2 -- */}
                    {step === 2 && (
                        <div className={guestModal.step}>
                            <span className={guestModal.label}>Guest Profile</span>
                            <h2 className={guestModal.sectionTitle}>Contact Information</h2>
                            <div className={guestModal.stack}>
                                <div>
                                    <label className={guestModal.labelSmall}>Full Name</label>
                                    <input type="text" placeholder="Juan dela Cruz" value={form.full_name}
                                        onChange={e => setForm({ ...form, full_name: e.target.value })} className={guestModal.textInput} />
                                </div>
                                <div>
                                    <label className={guestModal.labelSmall}>Email Address</label>
                                    <input type="email" placeholder="email@domain.com" value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })} className={guestModal.textInput} />
                                </div>
                                <div>
                                    <label className={guestModal.labelSmall}>Phone Number</label>
                                    <input type="text" value={form.phone} onChange={handlePhone} className={guestModal.textInput} />
                                </div>
                            </div>

                            <div className={guestModal.commitBox}>
                                <label className={guestModal.labelSmall}>Payment Commitment</label>
                                <div className={guestModal.commitButtons}>
                                    <button onClick={() => setPaymentCommitment('DEPOSIT')} className={choiceClass(paymentCommitment === 'DEPOSIT')}>{downPct}% DEPOSIT</button>
                                    <button onClick={() => setPaymentCommitment('FULL')} className={choiceClass(paymentCommitment === 'FULL')}>FULL PAYMENT</button>
                                </div>
                                <div className={guestModal.priceRows}>
                                    <div className={`${guestModal.priceRow} ${guestModal.priceMuted}`}><span>Visit Total ({guests} guest{guests > 1 ? 's' : ''} - {formatDateManila(date)})</span><span>PHP {total.toLocaleString()}</span></div>
                                    <div className={`${guestModal.priceRow} ${guestModal.priceBold}`}><span>Amount Due Now</span><span>PHP {amountToPayNow.toLocaleString()}</span></div>
                                    {remainingBalance > 0 && <div className={`${guestModal.priceRow} ${guestModal.priceRed}`}><span>REMAINING BALANCE (AT RESORT)</span><span>PHP {remainingBalance.toLocaleString()}</span></div>}
                                </div>
                            </div>

                            {error && <p className={guestModal.error}>{error}</p>}
                            <div className={guestModal.actionBetween}>
                                <button className={guestModal.ghostBtn} onClick={() => { setStep(1); setError(null); }}>BACK</button>
                                <button className={guestModal.primaryBtn} onClick={confirmGuest}>CONFIRM &amp; PAY</button>
                            </div>
                        </div>
                    )}

                    {/* -- STEP 3 -- */}
                    {step === 3 && (
                        <div className={guestModal.step}>
                            <span className={guestModal.label}>Payment Gateway</span>
                            <h2 className={guestModal.bookingRef}>Scan &amp; Transfer</h2>
                            <p className={guestModal.desc}>Transfer <b>PHP {amountToPayNow.toLocaleString()}</b> then upload your receipt below.</p>
                            <div className={guestModal.warning}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 900, marginBottom: '6px' }}>IMPORTANT</div>
                                <div style={{ fontSize: '0.78rem', lineHeight: '1.55' }}>
                                    A {downPct}% downpayment is required to confirm your booking unless you choose full payment.
                                    Only exact payments of PHP {amountToPayNow.toLocaleString()} will be accepted.
                                    Incorrect amounts will not be processed or refunded automatically.
                                </div>
                            </div>
                            <div className={guestModal.methodRow}>
                                <button onClick={() => setPaymentMethod('GCASH')} className={choiceClass(paymentMethod === 'GCASH')}>GCASH / MAYA</button>
                                <button onClick={() => setPaymentMethod('BANK')} className={choiceClass(paymentMethod === 'BANK')}>BANK TRANSFER</button>
                            </div>
                            <div className={guestModal.qrCard} onClick={() => setShowQRZoom(true)} title="Tap to enlarge">
                                <div>
                                    <div className={guestModal.qrThumbWrap}>
                                        <img src={qrSrc} alt="QR Code" className={guestModal.qrThumb} />
                                        <span className={guestModal.qrHint}>TAP TO ENLARGE</span>
                                    </div>
                                </div>
                                <div>
                                    <p className={guestModal.qrBank}>{paymentMethod === 'GCASH' ? 'GCash / Maya' : (bank?.bank || 'EastWest Bank')}</p>
                                    <p className={guestModal.qrName}>{paymentMethod === 'GCASH' ? (gcash?.name || 'Rica Jane Chiu') : (bank?.account_name || 'Ruby Chioco')}</p>
                                    <p className={guestModal.qrNum}>{paymentMethod === 'GCASH' ? (gcash?.mobile || '0927 971 0773') : (bank?.account_number || '200054634802')}</p>
                                    <p className={guestModal.qrSub}>{paymentMethod === 'GCASH' ? 'Scan QR or send to number' : 'Bank Â· InstaPay Â· PESONet'}</p>
                                </div>
                            </div>
                            <div className={uploadZoneClass(file)}>
                                <input type="file" id="dt-receipt" hidden onChange={e => { setFile(e.target.files[0]); setError(null); }} accept="image/*,application/pdf" />
                                <label htmlFor="dt-receipt" style={{ cursor: 'pointer', display: 'block' }}>
                                    {file ? <p className={guestModal.uploadDone}>Receipt attached - tap to change</p> : <span className={guestModal.uploadLabel}>UPLOAD PROOF OF PAYMENT</span>}
                                </label>
                            </div>
                            {bookingRef && (
                                <div className="mt-3 p-3 bg-coastal-surfaceLow/70 rounded-xl border border-coastal-outline/50">
                                    <p style={{ fontSize: '0.65rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#707882', marginBottom: '4px' }}>Saved Booking Reference</p>
                                    <p style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1d1c16', margin: 0 }}>{bookingRef}</p>
                                    <p style={{ fontSize: '0.72rem', color: '#707882', marginTop: '6px' }}>Retrying here will reuse this same day-tour booking.</p>
                                </div>
                            )}
                            {error && <p className={guestModal.error}>{error}</p>}
                            <button className={guestModal.submitBtn} disabled={!file || uploading} onClick={finalizeUpload}>
                                {uploading ? 'UPLOADING...' : bookingRef ? 'RETRY RECEIPT UPLOAD' : 'SUBMIT PAYMENT'}
                            </button>
                        </div>
                    )}

                    {/* -- STEP 4 -- */}
                    {step === 4 && (
                        <div className={guestModal.step} style={{ padding: '0' }}>
                            <div ref={receiptRef} style={{ background: '#fef9ef', fontFamily: "'Montserrat', sans-serif", padding: '28px 24px 24px' }}>
                                <div style={{ background: 'var(--accent-green)', margin: '-28px -24px 0', padding: '22px 24px 20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>Amalfi Resort</p>
                                            <p style={{ color: 'var(--accent-gold)', fontSize: '0.52rem', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '6px' }}>Zambales</p>
                                            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.58rem', fontWeight: '300', letterSpacing: '1px', margin: 0 }}>Day Tour Acknowledgement</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.52rem', letterSpacing: '1px', marginBottom: '2px' }}>REF NO.</p>
                                            <p style={{ color: 'var(--accent-gold)', fontSize: '1rem', fontWeight: '700', letterSpacing: '2px' }}>{bookingRef}</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 -24px', marginBottom: '20px' }}>
                                    <span style={{ fontSize: '0.9rem' }}>Received</span>
                                    <div>
                                        <p style={{ fontSize: '0.65rem', fontWeight: '700', color: '#166534', letterSpacing: '1px', textTransform: 'uppercase' }}>Payment Received â€” Pending Verification</p>
                                        <p style={{ fontSize: '0.58rem', color: '#166534', opacity: 0.7, marginTop: '1px' }}>Our team will confirm within 24 hours. An official receipt will be issued upon full confirmation.</p>
                                    </div>
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <p style={{ fontSize: '0.52rem', fontWeight: '700', letterSpacing: '2px', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: '6px' }}>Guest</p>
                                    <p style={{ fontSize: '0.88rem', fontWeight: '600', color: '#1d1c16', marginBottom: '2px' }}>{form.full_name}</p>
                                    <p style={{ fontSize: '0.72rem', color: '#707882' }}>{form.email} Â· {form.phone}</p>
                                </div>
                                <div style={{ height: '1px', background: 'rgba(29,28,22,0.06)', marginBottom: '16px' }} />
                                <div style={{ marginBottom: '16px' }}>
                                    <p style={{ fontSize: '0.52rem', fontWeight: '700', letterSpacing: '2px', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Booking Details</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                        {[['Type', 'Day Tour'], ['Guests', `${guests} pax`], ['Visit Date (PHT)', formatDateManila(date)], ['Rate', `PHP ${pricePerPax}/pax`]].map(([label, val]) => (
                                            <div key={label}>
                                                <p style={{ fontSize: '0.52rem', color: '#707882', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</p>
                                                <p style={{ fontSize: '0.78rem', fontWeight: '600', color: '#1d1c16' }}>{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ height: '1px', background: 'rgba(29,28,22,0.06)', marginBottom: '16px' }} />
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ fontSize: '0.52rem', fontWeight: '700', letterSpacing: '2px', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Payment Summary</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#707882' }}><span>Total ({guests} pax x PHP {pricePerPax})</span><span>PHP {total.toLocaleString()}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '700', color: '#1d1c16', padding: '6px 0', borderTop: '1px solid rgba(29,28,22,0.06)', borderBottom: '1px solid rgba(29,28,22,0.06)' }}><span>Amount Submitted</span><span>PHP {amountToPayNow.toLocaleString()}</span></div>
                                        {remainingBalance > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--accent-gold-hover)' }}><span>Balance (payable at resort)</span><span>PHP {remainingBalance.toLocaleString()}</span></div>}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#707882', marginTop: '2px' }}><span>Type</span><span>{paymentCommitment === 'DEPOSIT' ? `${downPct}% Deposit` : 'Full Payment'} Â· {paymentMethod === 'GCASH' ? 'GCash / Maya' : 'Bank Transfer'}</span></div>
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(29,28,22,0.06)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <p style={{ fontSize: '0.55rem', color: '#707882', opacity: 0.6, lineHeight: 1.5 }}>This is an acknowledgement only.<br/>Not a valid official receipt.</p>
                                    <p style={{ fontSize: '0.55rem', color: '#707882', opacity: 0.6, textAlign: 'right' }}>{formatNowInManila('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} PHT</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', padding: '16px 0 0' }}>
                                <button className={guestModal.outlineBtn} style={{ flex: 1 }} onClick={downloadSlip}>SAVE AS PNG</button>
                                <button className={guestModal.primaryBtn} style={{ flex: 1 }} onClick={onClose}>DONE</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showQRZoom && (
                <div className={guestModal.lightbox} onClick={() => setShowQRZoom(false)}>
                    <button className={guestModal.lightboxClose} onClick={() => setShowQRZoom(false)}>X</button>
                    <img src={qrSrc} alt="QR Code Full Size" className={guestModal.lightboxImg} onClick={e => e.stopPropagation()} />
                    <p className={guestModal.lightboxHint}>Tap anywhere to close</p>
                </div>
            )}
        </>
    );
};

export default SpecialBookingModal;
