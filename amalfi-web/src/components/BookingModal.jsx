import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getHolidayBookingViolation, formatHolidayBookingViolation } from '../utils/holidayBookingRules';
import { addDaysToDateOnly, formatDateOnlyInManila, formatNowInManila, getManilaTodayKey } from '../utils/manilaDate';
import { buildReceiptRetryMessage, readPortalError, validateGuestContact } from '../utils/guestPortalHelpers';
import { fetchCentralKnowledge } from '../services/knowledge';
import { choiceClass, guestModal, progressStepClass, unitCardClass, uploadZoneClass } from './guestModalTailwind';

const HUB_API = '/api/v1/public';

const buildUnitTags = (unit = {}) => {
    const tags = [];
    const features = unit.features || [];
    const hasAC = features.some((feature) => /air|climate/i.test(feature));
    const hasKitchen = features.some((feature) => /kitchen|stove|dining/i.test(feature));
    const hasEnsuite = features.some((feature) => /ensuite|bathroom/i.test(feature));

    tags.push(hasAC ? 'Air Con' : 'Natural Ventilation');
    if (hasKitchen) tags.push('Kitchen');
    if (hasEnsuite) tags.push('Private Bath');
    if ((unit.room_type || '').toLowerCase().includes('villa')) tags.push('Group Stay');

    return tags.slice(0, 3);
};

const normalizeRoomKey = (value = '') => String(value).trim().toLowerCase();

const BookingModal = ({ room, initialDates, onClose }) => {
    const [bookingRef, setBookingRef] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [step, setStep] = useState(1);
    const [showQRZoom, setShowQRZoom] = useState(false);
    const [showCloseGuard, setShowCloseGuard] = useState(false);
    const [loadingUnits, setLoadingUnits] = useState(false);
    const [availableUnits, setAvailableUnits] = useState([]);
    const [unitOptions, setUnitOptions] = useState([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState([]);
    const [quoteData, setQuoteData] = useState(null);
    const [loadingQuote, setLoadingQuote] = useState(false);
    const [multiRoomMode, setMultiRoomMode] = useState(false);
    const [knowledgeBase, setKnowledgeBase] = useState(null);

    const [paymentMethod, setPaymentMethod] = useState('GCASH');
    const [paymentCommitment, setPaymentCommitment] = useState('DEPOSIT');

    const checkInRef = useRef(null);
    const checkOutRef = useRef(null);
    const receiptRef = useRef(null);

    const roomName = room?.room_type || room?.raw?.name || 'Unnamed Unit';
    const roomDescription = room?.raw?.marketing_name || 'Experience the Amalfi Sanctuary.';
    const today = getManilaTodayKey();

    const [form, setForm] = useState({
        check_in: initialDates?.checkIn || '',
        check_out: initialDates?.checkOut || '',
        guests: parseInt(initialDates?.guests || 2, 10),
        full_name: '',
        email: '',
        phone: '+63 9',
        file: null
    });

    const accommodationMetaByName = useMemo(() => {
        const entries = knowledgeBase?.accommodations || [];
        return new Map(entries.map((entry) => [entry.name, entry]));
    }, [knowledgeBase]);

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

    const minCheckOut = form.check_in ? addDaysToDateOnly(form.check_in, 1) : addDaysToDateOnly(today, 1);

    const selectedUnits = useMemo(() => {
        const selected = new Map(selectedUnitIds.map((unitId) => [unitId, true]));
        return availableUnits.filter((unit) => selected.has(unit.unit_id));
    }, [availableUnits, selectedUnitIds]);

    const visibleUnitOptions = useMemo(() => {
        if (multiRoomMode) return unitOptions;
        const selectedRoomKey = normalizeRoomKey(roomName);
        return unitOptions.filter((unit) => normalizeRoomKey(unit.room_type) === selectedRoomKey);
    }, [multiRoomMode, roomName, unitOptions]);

    const visibleAvailableUnits = useMemo(
        () => visibleUnitOptions.filter((unit) => unit.is_available !== false),
        [visibleUnitOptions]
    );

    const groupedUnits = useMemo(() => (
        visibleUnitOptions.reduce((groups, unit) => {
            const key = unit.room_type || 'Other Units';
            if (!groups[key]) groups[key] = [];
            groups[key].push(unit);
            return groups;
        }, {})
    ), [visibleUnitOptions]);
    const unavailableUnits = useMemo(
        () => visibleUnitOptions.filter((unit) => unit.is_available === false),
        [visibleUnitOptions]
    );

    const totalSelectedCapacity = selectedUnits.reduce((sum, unit) => sum + Number(unit.absolute_max_pax || 0), 0);
    const minimumGuestsForSelection = selectedUnitIds.length;
    const underAssigned = Number(form.guests || 0) < minimumGuestsForSelection;
    const overCapacity = selectedUnitIds.length > 0 && Number(form.guests || 0) > totalSelectedCapacity;

    const pricing = useMemo(() => {
        const total = Number(quoteData?.total_amount || 0);
        const amountToPayNow = paymentCommitment === 'DEPOSIT' ? total * 0.5 : total;
        const remainingBalance = total - amountToPayNow;
        return {
            total,
            amountToPayNow,
            remainingBalance,
            nights: Number(quoteData?.nights || 0),
            unitsNeeded: Number(quoteData?.total_units || selectedUnitIds.length || 0),
            unitBreakdown: quoteData?.quoted_units || [],
        };
    }, [paymentCommitment, quoteData, selectedUnitIds.length]);

    const selectedUnitsLabel = selectedUnits.map((unit) => unit.unit_label || unit.unit_id).join(', ');

    useEffect(() => {
        if (!form.check_in || !form.check_out || form.check_out <= form.check_in) {
            setAvailableUnits([]);
            setUnitOptions([]);
            setSelectedUnitIds([]);
            setQuoteData(null);
            return;
        }

        let cancelled = false;
        setLoadingUnits(true);

        fetch(`${HUB_API}/booking-options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                check_in: form.check_in,
                check_out: form.check_out,
                guests: form.guests
            })
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await readPortalError(response, 'Could not load available units.'));
                }
                return response.json();
            })
            .then((payload) => {
                if (cancelled) return;
                const nextOptions = (payload.all_units || payload.available_units || []).map((unit) => {
                    const meta = accommodationMetaByName.get(unit.room_type) || {};
                    return {
                        ...unit,
                        is_available: unit.is_available !== false,
                        image: meta.image || room?.image || room?.raw?.image || '/api/v1/assets/logo/resort-logo.jpg',
                        features: meta.features || [],
                        marketing_name: unit.marketing_name || meta.marketing_name || unit.room_type,
                        tags: buildUnitTags({
                            ...unit,
                            features: meta.features || [],
                        }),
                    };
                });
                const nextAvailable = nextOptions.filter((unit) => unit.is_available !== false);
                setUnitOptions(nextOptions);
                setAvailableUnits(nextAvailable);
                setSelectedUnitIds((current) => {
                    const nextIds = current.filter((unitId) => nextAvailable.some((unit) => unit.unit_id === unitId));
                    if (nextIds.length > 0) return nextIds;
                    const preferredUnit = nextAvailable.find((unit) => unit.room_type === roomName);
                    return preferredUnit ? [preferredUnit.unit_id] : [];
                });
            })
            .catch((fetchError) => {
                if (!cancelled) {
                    setAvailableUnits([]);
                    setUnitOptions([]);
                    setSelectedUnitIds([]);
                    setQuoteData(null);
                    setError(fetchError.message);
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingUnits(false);
            });

        return () => {
            cancelled = true;
        };
    }, [accommodationMetaByName, form.check_in, form.check_out, form.guests, room?.image, room?.raw?.image, roomName]);

    useEffect(() => {
        if (!multiRoomMode && selectedUnitIds.length > 1) {
            setSelectedUnitIds((current) => current.slice(0, 1));
        }
    }, [multiRoomMode, selectedUnitIds.length]);

    useEffect(() => {
        if (!form.check_in || !form.check_out || form.check_out <= form.check_in || selectedUnitIds.length === 0) {
            setQuoteData(null);
            return;
        }

        if (underAssigned) {
            setQuoteData(null);
            return;
        }

        if (overCapacity) {
            setQuoteData(null);
            return;
        }

        let cancelled = false;
        setLoadingQuote(true);

        fetch(`${HUB_API}/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                check_in: form.check_in,
                check_out: form.check_out,
                guests: form.guests,
                unit_ids: selectedUnitIds
            })
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(await readPortalError(response, 'Could not calculate your stay total.'));
                }
                return response.json();
            })
            .then((payload) => {
                if (!cancelled) {
                    setQuoteData(payload.quote || null);
                }
            })
            .catch((quoteError) => {
                if (!cancelled) {
                    setQuoteData(null);
                    setError((current) => current || quoteError.message);
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingQuote(false);
            });

        return () => {
            cancelled = true;
        };
    }, [form.check_in, form.check_out, form.guests, selectedUnitIds, underAssigned, overCapacity]);

    const handleReceipt = (event) => {
        const file = event.target.files[0];
        if (file) {
            setForm((current) => ({ ...current, file }));
            setError(null);
        }
    };

    const handlePhoneChange = (event) => {
        const digits = event.target.value.replace(/\D/g, '');
        let nationalNumber = digits;
        if (nationalNumber.startsWith('63')) nationalNumber = nationalNumber.slice(2);
        if (nationalNumber.startsWith('0')) nationalNumber = nationalNumber.slice(1);
        nationalNumber = nationalNumber.slice(0, 10);

        const formatted = nationalNumber.length <= 3
            ? `+63 ${nationalNumber}`
            : nationalNumber.length <= 6
                ? `+63 ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3)}`
                : `+63 ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 6)} ${nationalNumber.slice(6)}`;

        setForm((current) => ({ ...current, phone: formatted }));
        setError(null);
    };

    const formatDate = (dateValue) => {
        if (!dateValue) return '-';
        return formatDateOnlyInManila(dateValue, 'en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const handleCloseRequest = () => {
        if ((step === 3 && form.file) || step === 4) {
            setShowCloseGuard(true);
        } else {
            onClose();
        }
    };

    const handleBackRequest = () => {
        setError(null);
        if (step === 3) {
            setStep(2);
            return;
        }
        if (step === 2) {
            setStep(1);
        }
    };

    const toggleUnitSelection = (unitId) => {
        const unit = availableUnits.find((option) => option.unit_id === unitId);
        if (!unit) return;
        setSelectedUnitIds((current) => {
            const exists = current.includes(unitId);
            const next = exists
                ? current.filter((value) => value !== unitId)
                : multiRoomMode
                    ? [...current, unitId]
                    : [unitId];
            if (!exists) {
                setForm((currentForm) => ({
                    ...currentForm,
                    guests: Math.max(next.length, parseInt(currentForm.guests, 10) || next.length),
                }));
            }
            return next;
        });
        setError(null);
    };

    const validateStep1 = () => {
        if (!form.check_in || !form.check_out) { setError('Please select your check-in and check-out dates.'); return false; }
        if (form.check_out <= form.check_in) { setError('Check-out must be after check-in.'); return false; }
        if (!form.guests || Number(form.guests) < 1) { setError('Please enter a valid number of guests.'); return false; }
        if (selectedUnitIds.length === 0) { setError('Please select at least one unit for this stay.'); return false; }
        if (underAssigned) { setError(`Please assign at least 1 guest per selected unit. ${selectedUnitIds.length} unit(s) need at least ${selectedUnitIds.length} guest(s).`); return false; }
        if (overCapacity) { setError(`Your selected units can only accommodate ${totalSelectedCapacity} guest(s) for this stay.`); return false; }

        const holidayViolation = getHolidayBookingViolation({
            checkIn: form.check_in,
            checkOut: form.check_out,
            bookingType: 'overnight',
            rule: knowledgeBase?.booking_rules?.holiday_minimum_stay || {},
        });
        if (holidayViolation) { setError(formatHolidayBookingViolation(holidayViolation)); return false; }
        if (!quoteData) { setError('Please wait for the stay total to finish loading.'); return false; }

        setError(null);
        return true;
    };

    const checkAvailabilityAndAdvance = () => {
        if (!validateStep1()) return;
        setStep(2);
    };

    const validateForm = () => {
        const validationError = validateGuestContact({
            fullName: form.full_name,
            email: form.email,
            phone: form.phone,
        });
        if (validationError) {
            setError(validationError);
            return false;
        }
        setError(null);
        return true;
    };

    const confirmBooking = () => {
        if (!validateForm()) return;
        setError(null);
        setStep(3);
    };

    const finalizeUpload = async () => {
        if (!form.file || !quoteData) return;
        setUploading(true);
        setError(null);

        try {
            let ref = bookingRef;
            let receiptToken = '';

            if (!ref) {
                const precheckData = new FormData();
                precheckData.append('file', form.file);
                precheckData.append('amount', pricing.amountToPayNow);
                precheckData.append('transaction_type', paymentCommitment === 'DEPOSIT' ? 'deposit' : 'full payment');

                const precheckResp = await fetch(`${HUB_API}/precheck/receipt`, {
                    method: 'POST',
                    body: precheckData
                });

                if (!precheckResp.ok) {
                    throw new Error(await readPortalError(precheckResp, 'Please upload a valid receipt to proceed with the booking.'));
                }

                const precheckPayload = await precheckResp.json();
                receiptToken = precheckPayload.receipt_token || '';
                if (!receiptToken) throw new Error('Receipt check passed, but the upload token was not issued. Please try again.');
            }

            if (!ref) {
                const bookResp = await fetch(`${HUB_API}/book`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_type: roomName,
                        check_in: form.check_in,
                        check_out: form.check_out,
                        guests: form.guests,
                        unit_ids: selectedUnitIds,
                        full_name: form.full_name,
                        email: form.email,
                        phone: form.phone,
                        total_price: pricing.total,
                        balance: pricing.remainingBalance,
                        receipt_token: receiptToken,
                        transaction_type: paymentCommitment === 'DEPOSIT' ? 'deposit' : 'full payment',
                        payment_method: paymentMethod
                    })
                });

                if (!bookResp.ok) {
                    throw new Error(await readPortalError(bookResp, 'Booking registration failed. Please try again.'));
                }

                const bookingPayload = await bookResp.json();
                ref = bookingPayload.booking_ref;
                setBookingRef(ref);
                if (bookingPayload.receipt_uploaded) {
                    setStep(4);
                    return;
                }
            }

            const formData = new FormData();
            if (receiptToken) formData.append('receipt_token', receiptToken);
            else formData.append('file', form.file);
            formData.append('booking_ref', ref);
            formData.append('amount', pricing.amountToPayNow);
            formData.append('transaction_type', paymentCommitment === 'DEPOSIT' ? 'deposit' : 'full payment');

            const uploadResp = await fetch(`${HUB_API}/upload/receipt`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResp.ok) {
                const uploadMessage = await readPortalError(uploadResp, 'Receipt upload failed.');
                throw new Error(receiptToken ? uploadMessage : buildReceiptRetryMessage(ref, uploadMessage));
            }

            setStep(4);
        } catch (submitError) {
            setError(submitError.message);
        } finally {
            setUploading(false);
        }
    };

    const downloadAcknowledgement = async () => {
        if (!receiptRef.current) return;
        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(receiptRef.current, {
                scale: 2,
                backgroundColor: '#fef9ef',
                useCORS: true,
                logging: false
            });
            const link = document.createElement('a');
            link.download = `amalfi-acknowledgement-${bookingRef}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (downloadError) {
            console.error('Download failed:', downloadError);
        }
    };

    const calendarIcon = (
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );

    const qrSrc = paymentMethod === 'GCASH' ? '/api/v1/assets/payment/gcash.png' : '/api/v1/assets/payment/bank.png';
    const compactSelectedLabel = selectedUnitsLabel || roomName;

    return (
        <>
            <div className={guestModal.overlay} onClick={(event) => event.stopPropagation()}>
                <div className={guestModal.content}>
                    <button onClick={handleCloseRequest} className={guestModal.close} title="Close">X</button>

                    <div className={guestModal.progress}>
                        <span className={progressStepClass(step >= 1, step === 1)}>01 STAY</span>
                        <span className={guestModal.progressDiv}>/</span>
                        <span className={progressStepClass(step >= 2, step === 2)}>02 GUEST</span>
                        <span className={guestModal.progressDiv}>/</span>
                        <span className={progressStepClass(step >= 3, step === 3)}>03 PAYMENT</span>
                    </div>

                    {step === 1 && (
                        <div className={guestModal.step}>
                            <span className={guestModal.label}>Build Your Stay</span>
                            <h2 className={guestModal.roomTitle}>{roomName}</h2>
                            <p className={guestModal.desc}>
                                {multiRoomMode
                                    ? 'Add available units for one shared stay.'
                                    : `Check live availability for ${roomDescription}.`}
                            </p>

                            <div className={guestModal.builderShell}>
                                <div>
                                    <div className={guestModal.builderGrid}>
                                        <div>
                                            <label className={guestModal.labelSmall}>Check-In</label>
                                            <div className={guestModal.dateWrap}>
                                                <input
                                                    ref={checkInRef}
                                                    type="date"
                                                    value={form.check_in}
                                                    min={today}
                                                    onChange={(event) => {
                                                        const nextCheckIn = event.target.value;
                                                        setForm((current) => ({
                                                            ...current,
                                                            check_in: nextCheckIn,
                                                            check_out: current.check_out && current.check_out <= nextCheckIn ? '' : current.check_out,
                                                        }));
                                                    }}
                                                    className={guestModal.dateInput}
                                                    style={{ color: form.check_in ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                                />
                                                <button type="button" className={guestModal.calBtn} onClick={() => checkInRef.current?.showPicker()}>{calendarIcon}</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className={guestModal.labelSmall}>Check-Out</label>
                                            <div className={guestModal.dateWrap}>
                                                <input
                                                    ref={checkOutRef}
                                                    type="date"
                                                    value={form.check_out}
                                                    min={minCheckOut}
                                                    onChange={(event) => setForm((current) => ({ ...current, check_out: event.target.value }))}
                                                    className={guestModal.dateInput}
                                                    style={{ color: form.check_out ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                                />
                                                <button type="button" className={guestModal.calBtn} onClick={() => checkOutRef.current?.showPicker()}>{calendarIcon}</button>
                                            </div>
                                        </div>
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label className={guestModal.labelSmall}>Total Guests</label>
                                            <input
                                                type="number"
                                                min={Math.max(1, minimumGuestsForSelection)}
                                                value={form.guests}
                                                onChange={(event) => setForm((current) => ({ ...current, guests: event.target.value === '' ? '' : parseInt(event.target.value, 10) || '' }))}
                                                onBlur={() => setForm((current) => ({
                                                    ...current,
                                                    guests: Math.max(Math.max(1, minimumGuestsForSelection), parseInt(current.guests, 10) || Math.max(1, minimumGuestsForSelection)),
                                                }))}
                                                className={guestModal.textInput}
                                                style={overCapacity || underAssigned ? { borderColor: 'var(--color-coastal-coral)', color: 'var(--color-coastal-coral)', fontWeight: 'bold' } : {}}
                                            />
                                            <p className={guestModal.hint} style={overCapacity || underAssigned ? { color: 'var(--color-coastal-coral)', fontWeight: 'bold' } : {}}>
                                                {selectedUnitIds.length === 0
                                                    ? 'Select one unit to price your stay.'
                                                    : `Capacity ${minimumGuestsForSelection}-${totalSelectedCapacity} guests.`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className={guestModal.modeToggle}>
                                        <button
                                            type="button"
                                            className={choiceClass(!multiRoomMode)}
                                            onClick={() => {
                                                setMultiRoomMode(false);
                                                setSelectedUnitIds((current) => current.slice(0, 1));
                                            }}
                                        >
                                            Single Room
                                        </button>
                                        <button
                                            type="button"
                                            className={choiceClass(multiRoomMode)}
                                            onClick={() => setMultiRoomMode(true)}
                                        >
                                            Multi-Room
                                        </button>
                                    </div>

                                    {multiRoomMode && selectedUnits.length > 0 && (
                                        <div className={guestModal.selectedPanel}>
                                            <div className={guestModal.builderHead}>
                                                <p className={guestModal.builderKicker}>Selected</p>
                                                <span className={guestModal.builderCount}>{selectedUnits.length} chosen</span>
                                            </div>
                                            <div className={guestModal.selectedList}>
                                                {selectedUnits.map((unit) => (
                                                    <button
                                                        key={unit.unit_id}
                                                        type="button"
                                                        onClick={() => toggleUnitSelection(unit.unit_id)}
                                                        className={guestModal.selectedChip}
                                                    >
                                                        <img src={unit.image} alt={unit.room_type} className={guestModal.selectedChipImg} />
                                                        <div className={guestModal.selectedChipTop}>
                                                            <div>
                                                                <div className={guestModal.selectedChipTitle}>{unit.unit_label || unit.unit_id}</div>
                                                                <div className={guestModal.selectedChipMeta}>{unit.room_type} - up to {unit.absolute_max_pax} pax</div>
                                                                {unit.tags?.length > 0 && (
                                                                    <div className={guestModal.unitTagRow}>
                                                                        {unit.tags.map((tag) => <span key={tag} className={guestModal.unitTag}>{tag}</span>)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className={guestModal.selectedChipRemove}>Remove</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className={guestModal.unitBrowserPanel}>
                                        <div className={guestModal.builderHead}>
                                            <p className={guestModal.builderKicker}>Choose Unit</p>
                                            <span className={guestModal.builderCount}>{visibleAvailableUnits.length} available</span>
                                        </div>
                                        <p className={guestModal.unitBrowserNote}>
                                            {multiRoomMode
                                                ? 'Choose one or more units.'
                                                : `Choose one ${roomName} unit.`}
                                        </p>
                                        {!loadingUnits && unavailableUnits.length > 0 && (
                                            <p className={guestModal.unitUnavailableAlert}>
                                                {unavailableUnits.length} {roomName} unit{unavailableUnits.length !== 1 ? 's are' : ' is'} already booked for your selected dates.
                                            </p>
                                        )}

                                        <div className={guestModal.unitBrowser}>
                                            {loadingUnits ? (
                                                <p className={guestModal.label} style={{ textAlign: 'center', padding: '40px 0' }}>Loading available units...</p>
                                            ) : Object.keys(groupedUnits).length === 0 ? (
                                                <p style={{ fontSize: '0.82rem', color: '#707882', margin: 0 }}>Choose dates to browse units.</p>
                                            ) : (
                                                Object.entries(groupedUnits).map(([groupName, units]) => (
                                                    <div key={groupName} className={guestModal.unitGroup}>
                                                        <div className={guestModal.builderHead}>
                                                            <p className={guestModal.builderKicker}>{groupName}</p>
                                                            <span className={guestModal.builderCount}>
                                                                {units.filter((unit) => unit.is_available !== false).length} available
                                                            </span>
                                                        </div>
                                                        <div className={guestModal.unitGrid}>
                                                            {units.map((unit) => {
                                                                const isSelected = selectedUnitIds.includes(unit.unit_id);
                                                                const isUnavailable = unit.is_available === false;
                                                                return (
                                                                    <button
                                                                        key={unit.unit_id}
                                                                        type="button"
                                                                        disabled={isUnavailable}
                                                                        onClick={() => toggleUnitSelection(unit.unit_id)}
                                                                        className={unitCardClass(isSelected, isUnavailable)}
                                                                    >
                                                                        <div className={guestModal.unitCardThumbWrap}>
                                                                            <img src={unit.image} alt={unit.room_type} className={guestModal.unitCardThumb} />
                                                                        </div>
                                                                        <div className={guestModal.unitCardMain}>
                                                                            <div className={guestModal.unitCardTop}>
                                                                                <div>
                                                                                    <div className={guestModal.unitCardTitle}>{unit.unit_label || unit.unit_id}</div>
                                                                                    <div className={guestModal.unitCardSub}>{unit.room_type}</div>
                                                                                </div>
                                                                                <div className={guestModal.unitCardAction}>
                                                                                    {isUnavailable ? 'BOOKED' : isSelected ? 'SELECTED' : 'ADD'}
                                                                                </div>
                                                                            </div>
                                                                            <div className={guestModal.unitCardBody}>
                                                                                <div className={guestModal.unitCompactMeta}>
                                                                                    <span className={guestModal.unitBadge}>Up to {unit.absolute_max_pax} pax</span>
                                                                                    {isUnavailable ? (
                                                                                        <span className={guestModal.unitUnavailableText}>
                                                                                            {unit.unavailable_reason || 'Booked for selected dates'}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className={guestModal.unitPrice}>PHP {Number(unit.nightly_rate || 0).toLocaleString()} / night</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className={guestModal.summaryStick}>
                                        <div className={guestModal.summaryCard}>
                                            <div className={guestModal.builderHead}>
                                                <p className={guestModal.builderKicker}>Stay Summary</p>
                                                <span className={guestModal.builderCount}>{pricing.nights || 0} night{pricing.nights === 1 ? '' : 's'}</span>
                                            </div>
                                            <p className={guestModal.summaryLead}>
                                                {selectedUnitIds.length > 0
                                                    ? `${selectedUnitIds.length} unit${selectedUnitIds.length !== 1 ? 's' : ''} selected for ${form.guests || 0} guest${Number(form.guests || 0) !== 1 ? 's' : ''}.`
                                                    : 'Select units to build your stay.'}
                                            </p>
                                            {overCapacity && (
                                                <div className={guestModal.summaryWarning}>
                                                    Your current unit mix is a starting point only. Add more rooms or adjust guests before continuing.
                                                </div>
                                            )}

                                            {selectedUnitIds.length > 0 && (
                                                <div className={guestModal.summaryPill}>
                                                    <p style={{ fontSize: '0.72rem', color: '#707882', margin: 0 }}>{selectedUnitsLabel || 'Selected units will appear here.'}</p>
                                                </div>
                                            )}

                                            {loadingQuote ? (
                                                <p style={{ fontSize: '0.8rem', color: '#707882', margin: '14px 0' }}>Calculating stay total...</p>
                                            ) : quoteData ? (
                                                <div className={guestModal.priceRows}>
                                                    {pricing.unitBreakdown.map((unit) => (
                                                        <div key={unit.unit_id} className={`${guestModal.priceRow} ${guestModal.priceMuted}`}>
                                                            <span>{unit.unit_label} ({unit.assigned_guests} pax)</span>
                                                            <span>PHP {Number(unit.total_amount || 0).toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                    <div className={`${guestModal.priceRow} ${guestModal.priceMuted}`}><span>x {pricing.nights} Night{pricing.nights !== 1 ? 's' : ''}</span><span>PHP {pricing.total.toLocaleString()}</span></div>
                                                    <div className={`${guestModal.priceRow} ${guestModal.priceBold}`}><span>Amount Due Now</span><span>PHP {pricing.amountToPayNow.toLocaleString()}</span></div>
                                                    {pricing.remainingBalance > 0 && (
                                                        <div className={`${guestModal.priceRow} ${guestModal.priceRed}`}><span>Remaining Balance</span><span>PHP {pricing.remainingBalance.toLocaleString()}</span></div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p style={{ fontSize: '0.78rem', color: '#707882', lineHeight: '1.6', margin: '14px 0 0' }}>
                                                    Pick your units first. Pricing updates automatically.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {error && <p className={guestModal.error}>{error}</p>}
                            <div className={guestModal.desktopAction}>
                                <button
                                    className={guestModal.primaryBtn}
                                    disabled={loadingUnits || loadingQuote || selectedUnitIds.length === 0}
                                    onClick={checkAvailabilityAndAdvance}
                                    style={(loadingUnits || loadingQuote || selectedUnitIds.length === 0) ? { opacity: 0.5, cursor: 'not-allowed', filter: 'grayscale(1)' } : {}}
                                >
                                    {loadingUnits ? 'LOADING UNITS...' : loadingQuote ? 'CALCULATING...' : 'CONTINUE'}
                                </button>
                            </div>
                            <div className={guestModal.mobileActionBar}>
                                <div className={guestModal.mobileActionText}>
                                    <span className={guestModal.mobileActionStrong}>
                                        {pricing.nights ? `${pricing.nights} night${pricing.nights === 1 ? '' : 's'}` : 'Select dates'}
                                        {pricing.total ? ` Â· PHP ${pricing.total.toLocaleString()}` : ''}
                                    </span>
                                    {selectedUnitIds.length > 0
                                        ? `${selectedUnitIds.length} unit${selectedUnitIds.length !== 1 ? 's' : ''} Â· ${form.guests || 0} guest${Number(form.guests || 0) !== 1 ? 's' : ''}`
                                        : 'Choose a unit to continue'}
                                </div>
                                <button
                                    className={guestModal.primaryBtn}
                                    disabled={loadingUnits || loadingQuote || selectedUnitIds.length === 0}
                                    onClick={checkAvailabilityAndAdvance}
                                    style={(loadingUnits || loadingQuote || selectedUnitIds.length === 0) ? { opacity: 0.5, cursor: 'not-allowed', filter: 'grayscale(1)' } : {}}
                                >
                                    {loadingUnits ? 'LOADING' : loadingQuote ? 'CALC...' : 'CONTINUE'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className={guestModal.step}>
                            <span className={guestModal.label}>Guest Profile</span>

                            <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '12px', background: 'rgba(29,28,22,0.04)', border: '1px solid rgba(29,28,22,0.08)' }}>
                                <p style={{ fontSize: '0.62rem', fontWeight: '800', letterSpacing: '1.2px', textTransform: 'uppercase', color: '#707882', marginBottom: '2px' }}>Reservation Summary</p>
                                <p style={{ fontSize: '0.76rem', color: '#1d1c16', lineHeight: '1.4', margin: 0 }}>
                                    {selectedUnitIds.length} unit{selectedUnitIds.length !== 1 ? 's' : ''}: {compactSelectedLabel}.
                                </p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div>
                                    <label className={guestModal.labelSmall}>Full Name</label>
                                    <input type="text" placeholder="Juan dela Cruz" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} className={guestModal.textInput} />
                                </div>
                                <div>
                                    <label className={guestModal.labelSmall}>Email Address</label>
                                    <input type="email" placeholder="email@domain.com" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={guestModal.textInput} />
                                </div>
                                <div>
                                    <label className={guestModal.labelSmall}>Phone Number</label>
                                    <input type="tel" placeholder="+63 9XX XXX XXXX" value={form.phone} onChange={handlePhoneChange} className={guestModal.textInput} />
                                </div>
                            </div>

                            <div className={guestModal.commitBox}>
                                <label className={guestModal.labelSmall} style={{ marginBottom: '10px', display: 'block' }}>Payment Commitment</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => setPaymentCommitment('DEPOSIT')} className={choiceClass(paymentCommitment === 'DEPOSIT')}>50% DEPOSIT</button>
                                    <button onClick={() => setPaymentCommitment('FULL')} className={choiceClass(paymentCommitment === 'FULL')}>FULL PAYMENT</button>
                                </div>
                                <div className={guestModal.priceRows}>
                                    {pricing.unitBreakdown.map((unit) => (
                                        <div key={unit.unit_id} className={`${guestModal.priceRow} ${guestModal.priceMuted}`}>
                                            <span>{unit.unit_label} ({unit.assigned_guests} pax)</span>
                                            <span>PHP {Number(unit.total_amount || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className={`${guestModal.priceRow} ${guestModal.priceMuted}`}><span>x {pricing.nights} Night{pricing.nights !== 1 ? 's' : ''}</span><span>PHP {pricing.total.toLocaleString()}</span></div>
                                    <div className={`${guestModal.priceRow} ${guestModal.priceBold}`}><span>Amount Due Now</span><span>PHP {pricing.amountToPayNow.toLocaleString()}</span></div>
                                    {pricing.remainingBalance > 0 && (
                                        <div className={`${guestModal.priceRow} ${guestModal.priceRed}`}><span>REMAINING BALANCE (AT RESORT)</span><span>PHP {pricing.remainingBalance.toLocaleString()}</span></div>
                                    )}
                                </div>
                            </div>

                            {error && <p className={guestModal.error}>{error}</p>}
                            <div className={guestModal.actionBetween}>
                                <button className={guestModal.back} onClick={handleBackRequest}>Back</button>
                                <button className={guestModal.primaryBtn} onClick={confirmBooking}>
                                    CONFIRM {selectedUnitIds.length} UNIT{selectedUnitIds.length !== 1 ? 'S' : ''} & PAY
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className={guestModal.step}>
                            <span className={guestModal.label}>Payment Gateway</span>
                            <div className="mb-3 rounded-2xl bg-coastal-secondary/10 border border-coastal-secondary/30 text-coastal-tertiary px-3 py-2.5">
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 3px' }}>Amount to Transfer</p>
                                        <p style={{ fontSize: '0.76rem', lineHeight: '1.35', margin: 0 }}>
                                            Exact payment for {selectedUnitIds.length} unit{selectedUnitIds.length !== 1 ? 's' : ''}.
                                        </p>
                                    </div>
                                    <b style={{ fontSize: '1rem', color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>PHP {pricing.amountToPayNow.toLocaleString()}</b>
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
                                    <p className={guestModal.qrBank}>{paymentMethod === 'GCASH' ? 'GCash / Maya' : 'EastWest Bank'}</p>
                                    <p className={guestModal.qrName}>{paymentMethod === 'GCASH' ? 'Rica Jane Chiu' : 'Ruby Chioco'}</p>
                                    <p className={guestModal.qrNum}>{paymentMethod === 'GCASH' ? '0927 971 0773' : '200054634802'}</p>
                                    <p className={guestModal.qrSub}>{paymentMethod === 'GCASH' ? 'Scan QR or send to number' : 'Bank - InstaPay - PESONet'}</p>
                                </div>
                            </div>

                            <div className={uploadZoneClass(Boolean(form.file))}>
                                <input type="file" id="receipt-upload" hidden onChange={handleReceipt} accept="image/*,application/pdf" />
                                <label htmlFor="receipt-upload" style={{ cursor: 'pointer', display: 'block' }}>
                                    {form.file ? <p className={guestModal.uploadDone}>Receipt attached - tap to change</p> : <span className={guestModal.uploadLabel}>UPLOAD PROOF OF PAYMENT</span>}
                                </label>
                            </div>

                            {bookingRef && (
                                <div className="mt-3 p-3 bg-coastal-surfaceLow/70 rounded-xl border border-coastal-outline/50">
                                    <p style={{ fontSize: '0.65rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#707882', marginBottom: '4px' }}>Saved Booking Reference</p>
                                    <p style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1d1c16', margin: 0 }}>{bookingRef}</p>
                                </div>
                            )}

                            {error && <p className={guestModal.error}>{error}</p>}
                            <div className={guestModal.paymentActionBar}>
                                <button className={guestModal.back} onClick={handleBackRequest}>Back</button>
                                <button className={guestModal.submitBtn} disabled={!form.file || uploading} onClick={finalizeUpload}>
                                    {uploading ? 'UPLOADING...' : bookingRef ? 'RETRY RECEIPT UPLOAD' : 'SUBMIT PAYMENT'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className={guestModal.stepFlush}>
                            <div ref={receiptRef} style={{ background: '#fef9ef', fontFamily: "'Montserrat', sans-serif", padding: '28px 24px 24px' }}>
                                <div style={{ background: 'var(--accent-green)', margin: '-28px -24px 0', padding: '22px 24px 20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>Amalfi Resort</p>
                                            <p style={{ color: 'var(--accent-gold)', fontSize: '0.52rem', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '6px' }}>Zambales</p>
                                            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.58rem', fontWeight: '300', letterSpacing: '1px', margin: 0 }}>Booking Acknowledgement</p>
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
                                        <p style={{ fontSize: '0.65rem', fontWeight: '700', color: '#166534', letterSpacing: '1px', textTransform: 'uppercase' }}>Payment Received - Pending Verification</p>
                                        <p style={{ fontSize: '0.58rem', color: '#166534', opacity: 0.7, marginTop: '1px' }}>Our team will confirm within 24 hours. An official receipt will be issued upon full confirmation.</p>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <p style={{ fontSize: '0.52rem', fontWeight: '700', letterSpacing: '2px', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: '6px' }}>Guest</p>
                                    <p style={{ fontSize: '0.88rem', fontWeight: '600', color: '#1d1c16', marginBottom: '2px' }}>{form.full_name}</p>
                                    <p style={{ fontSize: '0.72rem', color: '#707882' }}>{form.email} | {form.phone}</p>
                                </div>

                                <div style={{ height: '1px', background: 'rgba(29,28,22,0.06)', marginBottom: '16px' }} />

                                <div style={{ marginBottom: '16px' }}>
                                    <p style={{ fontSize: '0.52rem', fontWeight: '700', letterSpacing: '2px', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Stay Details</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                        {[
                                            ['Units Reserved', selectedUnitsLabel || roomName],
                                            ['Guests', `${form.guests} pax`],
                                            ['Check-in (PHT)', formatDate(form.check_in)],
                                            ['Check-out (PHT)', formatDate(form.check_out)]
                                        ].map(([label, value]) => (
                                            <div key={label}>
                                                <p style={{ fontSize: '0.52rem', color: '#707882', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</p>
                                                <p style={{ fontSize: '0.78rem', fontWeight: '600', color: '#1d1c16' }}>{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: 'rgba(29,28,22,0.06)', marginBottom: '16px' }} />

                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ fontSize: '0.52rem', fontWeight: '700', letterSpacing: '2px', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Payment Summary</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#707882' }}>
                                            <span>Total Stay</span><span>PHP {pricing.total.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '700', color: '#1d1c16', padding: '6px 0', borderTop: '1px solid rgba(29,28,22,0.06)', borderBottom: '1px solid rgba(29,28,22,0.06)' }}>
                                            <span>Amount Submitted</span><span>PHP {pricing.amountToPayNow.toLocaleString()}</span>
                                        </div>
                                        {pricing.remainingBalance > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--accent-gold-hover)' }}>
                                                <span>Balance (payable at resort)</span><span>PHP {pricing.remainingBalance.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#707882', marginTop: '2px' }}>
                                            <span>Type</span><span>{paymentCommitment === 'DEPOSIT' ? '50% Deposit' : 'Full Payment'} | {paymentMethod === 'GCASH' ? 'GCash / Maya' : 'Bank Transfer'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid rgba(29,28,22,0.06)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <p style={{ fontSize: '0.55rem', color: '#707882', opacity: 0.6, lineHeight: 1.5 }}>
                                        This is an acknowledgement only.<br />Not a valid official receipt.
                                    </p>
                                    <p style={{ fontSize: '0.55rem', color: '#707882', opacity: 0.6, textAlign: 'right' }}>
                                        {formatNowInManila('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} PHT
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', padding: '16px 0 0' }}>
                                <button className={guestModal.outlineBtn} style={{ flex: 1 }} onClick={downloadAcknowledgement}>SAVE AS PNG</button>
                                <button className={guestModal.primaryBtn} style={{ flex: 1 }} onClick={onClose}>DONE</button>
                            </div>
                        </div>
                    )}

                    {showCloseGuard && (
                        <div className={guestModal.guardOverlay}>
                            <div className={guestModal.guardBox}>
                                <p style={{ fontWeight: '700', marginBottom: '6px', fontSize: '0.95rem' }}>Leave this page?</p>
                                <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '20px', lineHeight: '1.6' }}>
                                    {step === 3 && form.file
                                        ? `Your receipt is attached. Your booking ref is ${bookingRef}. Please submit before leaving.`
                                        : `Your booking ${bookingRef} is confirmed. You can close safely.`}
                                </p>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className={guestModal.guardStay} onClick={() => setShowCloseGuard(false)}>STAY & SUBMIT</button>
                                    <button className={guestModal.guardLeave} onClick={onClose}>LEAVE ANYWAY</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showQRZoom && (
                <div className={guestModal.lightbox} onClick={() => setShowQRZoom(false)}>
                    <button className={guestModal.lightboxClose} onClick={() => setShowQRZoom(false)}>X</button>
                    <img src={qrSrc} alt="QR Code Full Size" className={guestModal.lightboxImg} onClick={(event) => event.stopPropagation()} />
                    <p className={guestModal.lightboxHint}>Tap anywhere to close</p>
                </div>
            )}
        </>
    );
};

export default BookingModal;
