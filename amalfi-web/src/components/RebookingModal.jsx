import React, { useState } from 'react';

const overlayClass = "fixed inset-0 z-[3000] flex items-center justify-center bg-coastal-primaryBright/64 p-[clamp(12px,2vw,28px)] backdrop-blur-[14px]";
const cardClass = "relative max-h-[90vh] w-[min(94vw,620px)] overflow-y-auto rounded-3xl border border-coastal-outline bg-gradient-to-b from-coastal-surface to-coastal-surfaceLow p-7 text-coastal-ink shadow-breezeResort md:p-10";
const closeClass = "absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-coastal-outline bg-coastal-surface/92 text-[1.1rem] font-bold leading-none text-coastal-ink shadow-breezeSm transition hover:bg-coastal-secondarySoft";
const sectionLabelClass = "mb-2 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-coastal-secondary";
const titleClass = "mb-3 font-display text-[clamp(2rem,5vw,2.8rem)] font-bold leading-tight text-coastal-ink";
const copyClass = "mb-9 text-[0.82rem] leading-[1.7] text-coastal-muted";
const gridClass = "mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2";
const fieldClass = "flex flex-col gap-2";
const labelClass = "text-[0.64rem] font-black uppercase tracking-[0.14em] text-coastal-primary";
const inputClass = "min-h-[46px] w-full rounded-none border-0 border-b border-coastal-outline bg-transparent px-0 py-3 text-[0.95rem] font-bold text-coastal-ink outline-none [color-scheme:light] placeholder:text-coastal-muted/55 focus:border-coastal-primary";
const textareaClass = `${inputClass} !min-h-[110px] resize-none`;
const submitClass = "mt-7 inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-coastal-primary/80 bg-coastal-primary px-6 py-3 text-[0.7rem] font-black uppercase tracking-[0.14em] text-white shadow-breezeSm transition hover:bg-coastal-primaryBright disabled:cursor-not-allowed disabled:opacity-60";
const footnoteClass = "mt-6 text-center text-[0.65rem] font-bold uppercase tracking-[1px] text-coastal-muted/60";

const RebookingModal = ({ onClose }) => {
    const [formData, setFormData] = useState({
        booking_ref: '',
        guest_name: '',
        new_check_in: '',
        new_check_out: '',
        reason: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.booking_ref || !formData.guest_name || !formData.new_check_in || !formData.new_check_out || !formData.reason) {
            return alert('Required fields: Reference, Guest Name, New Dates, and Reason.');
        }

        setIsSubmitting(true);
        try {
            const resp = await fetch('/api/v1/public/rebooking-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(data.error || 'Submission failed');
            }
            alert(data.message || 'Rebooking request submitted successfully.');
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

                <span className={sectionLabelClass}>Guest Care</span>
                <h2 className={titleClass}>Rebooking Request</h2>
                <p className={copyClass}>
                    Rebooking is allowed for requests made 7 days or more before arrival and remains subject to availability.
                </p>

                <form onSubmit={handleSubmit}>
                    <div className={gridClass}>
                        <div className={fieldClass}>
                            <label className={labelClass}>Booking Reference</label>
                            <input
                                type="text"
                                className={inputClass}
                                placeholder="BRZ-XXXX"
                                value={formData.booking_ref}
                                onChange={(e) => setFormData({ ...formData, booking_ref: e.target.value.toUpperCase() })}
                            />
                        </div>
                        <div className={fieldClass}>
                            <label className={labelClass}>Guest Name</label>
                            <input
                                type="text"
                                className={inputClass}
                                placeholder="Juan Dela Cruz"
                                value={formData.guest_name}
                                onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className={gridClass}>
                        <div className={fieldClass}>
                            <label className={labelClass}>Preferred New Check-In</label>
                            <input
                                type="date"
                                className={inputClass}
                                value={formData.new_check_in}
                                onChange={(e) => setFormData({ ...formData, new_check_in: e.target.value })}
                            />
                        </div>
                        <div className={fieldClass}>
                            <label className={labelClass}>Preferred New Check-Out</label>
                            <input
                                type="date"
                                className={inputClass}
                                value={formData.new_check_out}
                                onChange={(e) => setFormData({ ...formData, new_check_out: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className={fieldClass}>
                        <label className={labelClass}>Reason for Rebooking</label>
                        <textarea
                            className={textareaClass}
                            placeholder="Tell us why you need to move the booking..."
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        />
                    </div>

                    <button className={submitClass} disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Rebooking Request'}
                    </button>

                    <p className={footnoteClass}>
                        Date changes are reviewed by our reservations team
                    </p>
                </form>
            </div>
        </div>
    );
};

export default RebookingModal;
