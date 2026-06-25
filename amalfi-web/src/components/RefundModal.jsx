import React, { useState } from 'react';

const overlayClass = "fixed inset-0 z-[3000] flex items-center justify-center bg-coastal-primaryBright/64 p-[clamp(12px,2vw,28px)] backdrop-blur-[14px]";
const cardClass = "relative max-h-[90vh] w-[min(94vw,620px)] overflow-y-auto rounded-3xl border border-coastal-outline bg-gradient-to-b from-coastal-surface to-coastal-surfaceLow p-7 text-coastal-ink shadow-breezeResort md:p-10";
const closeClass = "absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-coastal-outline bg-coastal-surface/92 text-[1.1rem] font-bold leading-none text-coastal-ink shadow-breezeSm transition hover:bg-coastal-secondarySoft";
const sectionLabelClass = "mb-2 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-coastal-secondary";
const titleClass = "mb-10 font-display text-[clamp(2rem,5vw,2.8rem)] font-bold leading-tight text-coastal-ink";
const gridClass = "mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2";
const fieldClass = "flex flex-col gap-2";
const labelClass = "text-[0.64rem] font-black uppercase tracking-[0.14em] text-coastal-primary";
const inputClass = "min-h-[46px] w-full rounded-none border-0 border-b border-coastal-outline bg-transparent px-0 py-3 text-[0.95rem] font-bold text-coastal-ink outline-none [color-scheme:light] placeholder:text-coastal-muted/55 focus:border-coastal-primary";
const textareaClass = `${inputClass} !min-h-[92px] resize-none`;
const payoutPanelClass = "my-10 rounded-[22px] border border-coastal-outline bg-coastal-surfaceLow p-6 shadow-breezeSm";
const payoutGridClass = "grid grid-cols-1 gap-6 sm:grid-cols-[1fr_2fr]";
const submitClass = "inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-coastal-primary/80 bg-coastal-primary px-6 py-3 text-[0.7rem] font-black uppercase tracking-[0.14em] text-white shadow-breezeSm transition hover:bg-coastal-primaryBright disabled:cursor-not-allowed disabled:opacity-60";
const footnoteClass = "mt-7 text-center text-[0.6rem] font-bold uppercase tracking-[2px] text-coastal-muted/45";

const RefundModal = ({ onClose }) => {
    const [formData, setFormData] = useState({
        booking_ref: '',
        guest_name: '',
        amount: '',
        reason: '',
        platform: 'GCASH',
        account_number: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.booking_ref || !formData.guest_name || !formData.account_number) {
            return alert("Required fields: Reference, Name, and Account.");
        }

        setIsSubmitting(true);
        try {
            const resp = await fetch('/api/v1/public/refund-claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    booking_ref: formData.booking_ref,
                    guest_name: formData.guest_name,
                    amount: formData.amount,
                    reason: formData.reason,
                    platform: formData.platform,
                    account_number: formData.account_number
                })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(data.error || "Submission failed");
            }
            alert(data.message || "Success! Your request has been logged. Our audit team will review it within 48 hours.");
            onClose();
        } catch (err) {
            alert(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={overlayClass} onClick={onClose}>
            <div className={cardClass} onClick={(e) => e.stopPropagation()}>
                <button className={closeClass} onClick={onClose}>&times;</button>

                <span className={sectionLabelClass}>Guest Vault</span>
                <h2 className={titleClass}>Refund Claim</h2>

                <form onSubmit={handleSubmit}>
                    <div className={gridClass}>
                        <div className={fieldClass}>
                            <label className={labelClass}>Booking Reference</label>
                            <input
                                type="text"
                                className={inputClass}
                                placeholder="BRZ-XXXX"
                                value={formData.booking_ref}
                                onChange={(e) => setFormData({...formData, booking_ref: e.target.value.toUpperCase()})}
                            />
                        </div>
                        <div className={fieldClass}>
                            <label className={labelClass}>Guest Name</label>
                            <input
                                type="text"
                                className={inputClass}
                                placeholder="Ma. Clara"
                                value={formData.guest_name}
                                onChange={(e) => setFormData({...formData, guest_name: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className={fieldClass}>
                        <label className={labelClass}>Reason for Claim</label>
                        <textarea
                            className={textareaClass}
                            placeholder="Nature of cancellation..."
                            value={formData.reason}
                            onChange={(e) => setFormData({...formData, reason: e.target.value})}
                        />
                    </div>

                    <div className={payoutPanelClass}>
                        <div className={payoutGridClass}>
                             <div className={fieldClass}>
                                <label className={labelClass}>Platform</label>
                                <select
                                    className={inputClass}
                                    value={formData.platform}
                                    onChange={(e) => setFormData({...formData, platform: e.target.value})}
                                >
                                    <option value="GCASH">GCASH</option>
                                    <option value="MAYA">MAYA</option>
                                    <option value="BPI">BPI</option>
                                </select>
                            </div>
                            <div className={fieldClass}>
                                <label className={labelClass}>Account / Details</label>
                                <input
                                    type="text"
                                    className={inputClass}
                                    placeholder="Number for reimbursement"
                                    value={formData.account_number}
                                    onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <button className={submitClass} disabled={isSubmitting}>
                        {isSubmitting ? 'Syncing...' : 'Submit Claim'}
                    </button>

                    <p className={footnoteClass}>
                        Security Protocol Amalfi Vault 4.0
                    </p>
                </form>
            </div>
        </div>
    );
};

export default RefundModal;
