import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronRight, Snowflake, Users, Waves, Wifi } from 'lucide-react';
import { fetchCentralKnowledge } from '../services/knowledge';

const INVENTORY_API = "/api/v1/public/rooms";
const AVAILABILITY_API = "/api/v1/public/availability";

const roomGridClass = "-mx-4 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto px-4 pb-6 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-3 2xl:grid-cols-4 [&::-webkit-scrollbar]:hidden";
const roomCardClass = "group relative flex h-[510px] w-[min(92vw,360px)] shrink-0 snap-start flex-col overflow-hidden rounded-[28px] border-4 border-[#caa65a] bg-[#fffdf8] p-3 text-coastal-ink shadow-[0_18px_40px_rgba(8,68,63,0.18),0_0_0_1px_rgba(138,93,31,0.48),inset_0_0_0_2px_rgba(255,255,255,0.96),inset_0_0_0_5px_rgba(202,166,90,0.16),inset_0_0_18px_rgba(202,166,90,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(8,68,63,0.22),0_0_0_1px_rgba(138,93,31,0.56),inset_0_0_0_2px_rgba(255,255,255,0.96),inset_0_0_0_5px_rgba(202,166,90,0.22),inset_0_0_24px_rgba(202,166,90,0.34)] md:h-[455px] md:w-full md:shrink md:snap-none md:p-2.5";
const roomGalleryClass = "relative overflow-hidden rounded-[22px] border-2 border-[#caa65a] bg-coastal-surfaceContainer shadow-[0_0_0_1px_rgba(138,93,31,0.22),inset_0_0_0_2px_rgba(255,255,255,0.95),inset_0_0_14px_rgba(202,166,90,0.18)] md:rounded-[20px]";
const roomMainImageFrameClass = "relative h-[250px] cursor-zoom-in overflow-hidden md:h-[198px]";
const roomThumbRowClass = "grid grid-cols-4 gap-[3px] bg-white";
const roomThumbButtonClass = "h-[62px] overflow-hidden border-0 bg-transparent p-0 md:h-[54px]";
const roomThumbImageClass = "block h-full w-full object-cover";
const roomImageClass = "relative h-full overflow-hidden";
const roomImageElClass = "block h-full w-full scale-[1.06] object-cover object-center transition duration-700 group-hover:scale-[1.1]";
const roomOverlayClass = "absolute inset-0 flex items-start justify-start bg-gradient-to-t from-black/25 via-transparent to-transparent p-4";
const roomCapacityClass = "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-coastal-secondary to-coastal-tertiary px-3 py-2 text-[0.68rem] font-extrabold uppercase text-white shadow-breezeSm";
const roomInfoClass = "flex flex-1 flex-col px-3 pb-1.5 pt-5 md:px-2.5 md:pt-3.5";
const roomHeaderClass = "mb-3 grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-start gap-4 md:mb-2 md:min-h-[36px] md:gap-3";
const roomTitleClass = "m-0 truncate font-display text-[1.68rem] font-semibold leading-none text-coastal-primary md:text-[1.14rem] 2xl:text-[1.22rem]";
const roomDescriptionClass = "m-0 mb-4 min-h-[42px] [display:-webkit-box] overflow-hidden text-[0.82rem] leading-[1.55] text-coastal-muted [-webkit-box-orient:vertical] [-webkit-line-clamp:2] md:mb-3 md:min-h-[38px] md:text-[0.72rem] md:leading-[1.5]";
const roomPriceClass = "m-0 min-w-[104px] text-right font-display text-[1.18rem] font-semibold leading-tight text-coastal-ink md:min-w-[74px] md:text-[0.88rem]";
const roomFeatureListClass = "hidden";
const roomFeatureItemClass = "relative pl-[18px] before:absolute before:left-0 before:top-[0.65em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-coastal-secondary";
const amenitiesClass = "mb-4 grid grid-cols-3 rounded-xl border border-coastal-outline/60 bg-coastal-surfaceLow px-1 py-3 shadow-breezeSm md:mb-3 md:py-2.5";
const amenityPillClass = "flex min-w-0 items-center justify-center gap-1.5 border-r border-coastal-outline/50 px-1 text-center text-[0.68rem] font-semibold text-coastal-primaryBright last:border-r-0 md:text-[0.58rem]";
const roomActionClass = "mt-auto grid grid-cols-2 gap-3";
const roomButtonClass = "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-[rgba(202,166,90,0.92)] bg-[linear-gradient(135deg,#0c755f,#034638)] px-4 py-3 text-[0.78rem] font-bold text-white shadow-[0_10px_20px_rgba(3,70,56,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-coastal-outline disabled:text-coastal-muted disabled:shadow-none md:min-h-[42px] md:px-3 md:py-2 md:text-[0.66rem]";
const roomDetailsButtonClass = "inline-flex min-h-[48px] items-center justify-center gap-1 rounded-xl border-2 border-[rgba(202,166,90,0.92)] bg-[#fffdf8] px-4 py-3 text-[0.78rem] font-bold text-[#9a6800] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)] transition hover:bg-[rgba(202,166,90,0.1)] md:min-h-[42px] md:px-3 md:py-2 md:text-[0.66rem]";
const loadingRoomsClass = "py-24 text-center text-sm font-semibold text-coastal-secondary";

const getStatusClass = (tone = "success") => {
    const toneClass = {
        success: "bg-coastal-secondarySoft/60 text-coastal-secondary",
        warning: "bg-yellow-100 text-coastal-tertiary",
        danger: "bg-red-50 text-red-700",
    }[tone] || "bg-coastal-secondarySoft/60 text-coastal-secondary";

    return `m-0 mb-3 w-fit rounded-md px-2.5 py-1.5 text-[0.68rem] font-bold leading-tight ${toneClass}`;
};

const getRoomDescription = (room) => {
    const rawDescription = room.raw?.description || room.raw?.long_description || room.raw?.marketing_description;
    if (rawDescription) return rawDescription;

    const hasAC = room.tags.includes('Air Con');
    if (hasAC) return "A private overnight unit with air-conditioned comfort and easy beachfront access.";

    return "A private overnight unit with resort comforts and easy beachfront access.";
};

const getRoomImages = (room) => {
    const candidates = [
        ...(Array.isArray(room.raw?.images) ? room.raw.images : []),
        ...(Array.isArray(room.raw?.gallery) ? room.raw.gallery : []),
        room.image,
    ].filter(Boolean);

    const unique = [...new Set(candidates)];
    const source = unique.length ? unique : ['/api/v1/assets/logo/resort-logo.jpg'];

    return {
        main: source[0],
        thumbs: Array.from({ length: 4 }, (_, index) => source[index + 1] || source[index % source.length]),
        hasGallery: source.length > 1,
    };
};

const getAmenityIcon = (tag) => {
    if (/air|fan/i.test(tag)) return Snowflake;
    if (/beach|front|wave/i.test(tag)) return Waves;
    return Wifi;
};

// Lightbox
const Lightbox = ({ src, alt, onClose }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[3000] flex cursor-zoom-out items-center justify-center bg-[#0a0e0c]/[0.92] p-5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
            onClick={onClose}
        >
            <button className="fixed right-7 top-6 z-[3001] flex h-10 w-10 cursor-pointer items-center justify-center border border-white/15 bg-white/10 text-base text-white transition hover:bg-white/20" onClick={onClose} aria-label="Close">X</button>
            <img
                src={src}
                alt={alt}
                className="max-h-[88vh] max-w-[90vw] cursor-default border-[3px] border-white/[0.06] object-contain shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
                onClick={e => e.stopPropagation()}
            />
        </div>
    );
};

// RoomGrid
const RoomGrid = ({ onSelectRoom, checkIn, checkOut, requestedGuests = 0, portalEnabled = true }) => {
    const [rooms, setRooms] = useState([]);
    const [liveData, setLiveData] = useState([]);
    const [knowledgeBase, setKnowledgeBase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lightbox, setLightbox] = useState(null); // { src, alt }

    useEffect(() => {
        const fetchInventory = async () => {
            setLoading(true);
            try {
                const kb = await fetchCentralKnowledge();
                setKnowledgeBase(kb);
                const hasDateRange = Boolean(checkIn && checkOut);
                const apiUrl = hasDateRange
                    ? `${AVAILABILITY_API}?check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`
                    : INVENTORY_API;
                const response = await fetch(apiUrl);
                if (response.ok) {
                    const data = await response.json();
                    setLiveData(hasDateRange ? (data.availability || []) : (data.rooms || []));
                } else {
                    setLiveData([]);
                }
            } catch (err) {
                console.warn("Live inventory sync failed.");
                setLiveData([]);
            } finally {
                setLoading(false);
            }
        };
        fetchInventory();
    }, [checkIn, checkOut]);

    useEffect(() => {
        if (!knowledgeBase || !knowledgeBase.accommodations) return;

        const processedRooms = knowledgeBase.accommodations.map(room => {
            const liveMatch = (liveData || []).find(ld => ld.room_type === room.name);
            const livePrice = liveMatch?.price || room.rates?.[0]?.price_php || 0;
            const isFullyBooked = checkIn && checkOut
                ? Number(liveMatch?.available_units ?? 1) <= 0
                : String(liveMatch?.status || 'available').toLowerCase() === 'occupied';

            const allRates = room.rates || [];
            const minPax = allRates.length ? Math.min(...allRates.map(r => r.min_pax)) : 1;
            const maxPax = allRates.length ? Math.max(...allRates.map(r => r.max_pax)) : 2;
            const singleUnitMaxPax = room.extra_pax?.allowed
                ? Number(room.extra_pax.max_capacity_pax || maxPax)
                : Number(room.max_capacity_pax || maxPax);
            const unitsForDates = Number(liveMatch?.available_units ?? room.units ?? 1);
            const totalBookableGuests = Math.max(1, unitsForDates) * Math.max(1, singleUnitMaxPax);

            const features = room.features || [];
            const hasAC = features.some(f => /air.cond|aircon|climate.control|ac\b/i.test(f));
            const tags = [
                'WiFi',
                hasAC ? 'Air Con' : 'Fan Ventilated',
                'Beachfront'
            ];

            return {
                id: room.name?.toLowerCase().replace(/\s+/g, '-') || Math.random(),
                room_type: room.name,
                price: livePrice,
                minPax,
                maxPax,
                image: room.image || '/api/v1/assets/logo/resort-logo.jpg',
                amenities: room.features || [],
                tags,
                raw: room,
                isFullyBooked,
                availableUnits: liveMatch?.available_units ?? null,
                totalBookableGuests,
                singleUnitMaxPax,
            };
        });
        setRooms(processedRooms);
    }, [knowledgeBase, liveData, checkIn, checkOut]);

    const closeLightbox = useCallback(() => setLightbox(null), []);
    const isSearching = checkIn && checkOut;

    if (loading) return <p className={loadingRoomsClass}>Loading rooms...</p>;

    return (
        <>
            {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />}

            <div className={roomGridClass}>
                {rooms.map(room => {
                    const isFullyBooked = isSearching && room.isFullyBooked;
                    const exceedsGuestLimit = requestedGuests > 0 && requestedGuests > room.totalBookableGuests;
                    const needsMultipleUnits = requestedGuests > 0 && requestedGuests > room.singleUnitMaxPax && !exceedsGuestLimit;
                    const suggestedUnits = needsMultipleUnits
                        ? Math.ceil(requestedGuests / Math.max(1, room.singleUnitMaxPax))
                        : 1;
                    const bookingDisabled = !portalEnabled || isFullyBooked || exceedsGuestLimit;
                    const guestLabel = room.minPax === room.maxPax
                        ? `${room.maxPax} GUESTS`
                        : `${room.minPax}-${room.maxPax} GUESTS`;
                    const roomImages = getRoomImages(room);

                    return (
                        <article
                            key={room.id}
                            id={`room-${room.id}`}
                            className={`${roomCardClass} ${isFullyBooked ? 'border-[rgba(196,30,58,0.34)] opacity-[0.78]' : ''}`}
                        >
                            {/* Image â€” click to lightbox */}
                            <div className={roomGalleryClass}>
                                <div
                                    className={roomMainImageFrameClass}
                                    onClick={() => setLightbox({ src: roomImages.main, alt: room.room_type })}
                                    title="Click to view full image"
                                >
                                    <div className={roomImageClass}>
                                        <img src={roomImages.main} alt={room.room_type} className={roomImageElClass} />
                                        {isFullyBooked && <div className="absolute right-3 top-3 rounded-full bg-coastal-coral/90 px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.13em] text-white">Fully Reserved</div>}
                                        <div className={roomOverlayClass}>
                                            <span className={roomCapacityClass}><Users size={13} strokeWidth={2.4} />{guestLabel}</span>
                                        </div>
                                    </div>
                                </div>
                                {roomImages.hasGallery && (
                                    <div className={roomThumbRowClass}>
                                        {roomImages.thumbs.map((src, index) => (
                                            <button
                                                type="button"
                                                key={`${src}-${index}`}
                                                className={roomThumbButtonClass}
                                                onClick={() => setLightbox({ src, alt: `${room.room_type} view ${index + 1}` })}
                                                aria-label={`View ${room.room_type} photo ${index + 1}`}
                                            >
                                                <img src={src} alt="" className={roomThumbImageClass} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className={roomInfoClass}>
                                <div className={roomHeaderClass}>
                                    <div>
                                        <h3 className={roomTitleClass}>{room.room_type}</h3>
                                    </div>
                                    <p className={roomPriceClass}>PHP {room.price?.toLocaleString() || '0'} <span className="block text-[0.6rem] font-medium text-coastal-muted">per night</span></p>
                                </div>
                                <p className={roomDescriptionClass}>{getRoomDescription(room)}</p>
                                <ul className={roomFeatureListClass}>
                                    {(room.amenities?.slice(0, 4) || ['Air-conditioned', 'Beachfront access']).map((feature) => (
                                        <li key={feature} className={roomFeatureItemClass}>{feature}</li>
                                    ))}
                                </ul>
                                {isSearching && typeof room.availableUnits === 'number' && (
                                    <p className={getStatusClass(isFullyBooked ? 'danger' : 'success')}>
                                        {isFullyBooked ? 'No units available for selected dates' : `${room.availableUnits} unit${room.availableUnits !== 1 ? 's' : ''} available for selected dates`}
                                    </p>
                                )}
                                {isSearching && requestedGuests > 0 && (
                                    <p className={getStatusClass(exceedsGuestLimit ? 'danger' : needsMultipleUnits ? 'warning' : 'success')}>
                                        {exceedsGuestLimit
                                            ? `Guests exceed room capacity: ${requestedGuests} guests exceed the current ${room.totalBookableGuests}-guest limit`
                                            : needsMultipleUnits
                                                ? `${requestedGuests} guests will be split across about ${suggestedUnits} ${suggestedUnits === 1 ? 'unit' : 'units'}`
                                                : `Fits your ${requestedGuests}-guest search`}
                                    </p>
                                )}

                                <div className={amenitiesClass}>
                                    {room.tags.map((tag) => {
                                        const AmenityIcon = getAmenityIcon(tag);
                                        return (
                                            <div key={tag} className={amenityPillClass}>
                                                <AmenityIcon size={13} strokeWidth={2} />
                                                <span>{tag}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className={roomActionClass}>
                                    <button
                                        type="button"
                                        className={roomDetailsButtonClass}
                                        onClick={() => setLightbox({ src: roomImages.main, alt: room.room_type })}
                                    >
                                        View Details <ChevronRight size={14} strokeWidth={2.3} />
                                    </button>
                                    <button
                                        className={roomButtonClass}
                                        disabled={bookingDisabled}
                                        onClick={() => onSelectRoom(room)}
                                    >
                                        <CalendarDays size={15} strokeWidth={2.2} />
                                        {!portalEnabled ? 'Portal Offline' : exceedsGuestLimit ? 'Exceeds Capacity' : isFullyBooked ? 'Fully Booked' : needsMultipleUnits ? `Book ${suggestedUnits} Units` : 'Book Now'}
                                    </button>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </>
    );
};

export default RoomGrid;
