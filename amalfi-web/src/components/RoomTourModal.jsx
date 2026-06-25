import React from 'react';

const tourOverlayClass = "fixed inset-0 z-[3000] flex items-center justify-center bg-coastal-primaryBright/64 p-[clamp(8px,2vw,28px)] backdrop-blur-[14px]";
const tourCardClass = "relative max-h-[90vh] w-[90vw] max-w-[1000px] overflow-y-auto rounded-[30px] bg-coastal-surface text-coastal-ink border border-coastal-outline/50 shadow-breezeResort";
const tourCloseClass = "absolute right-[30px] top-[30px] z-10 border-0 bg-transparent text-2xl text-coastal-ink";
const tourHeroClass = "relative";
const tourImageClass = "h-[500px] w-full rounded-t-[30px] object-cover";
const tourScrimClass = "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-10 pb-10 pt-[60px] text-white";
const tourTitleClass = "mb-1 text-5xl font-black";
const tourKickerClass = "text-[0.7rem] font-black uppercase tracking-[2px] opacity-80";
const tourBodyClass = "p-10";
const tourGridClass = "grid grid-cols-1 gap-[50px] md:grid-cols-[1fr_2fr]";
const tourSectionTitleClass = "mb-4 text-[0.7rem] font-black uppercase tracking-[2px] text-coastal-primary";
const tourSpecRowClass = "flex justify-between border-b border-coastal-outline py-4";
const tourSpecLabelClass = "text-xs opacity-50";
const tourSpecValueClass = "text-xs font-extrabold";
const tourPriceWrapClass = "mt-10";
const tourPriceClass = "text-3xl font-black";
const tourPriceUnitClass = "text-[0.7rem] opacity-50";
const tourCopyClass = "mb-8 text-[0.9rem] leading-[1.8] text-coastal-muted";
const tourAmenityGridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2";
const tourAmenityClass = "flex items-center gap-2.5 text-xs font-bold";
const tourCheckClass = "text-coastal-secondary";

const RoomTourModal = ({ room, images, onClose }) => {
    if (!room) return null;

    return (
        <div className={tourOverlayClass} onClick={onClose}>
            <div className={tourCardClass} onClick={(event) => event.stopPropagation()}>
                <button onClick={onClose} className={tourCloseClass}>&times;</button>

                <div className={tourHeroClass}>
                    <img
                        src={images[room.room_type] || images.Default}
                        className={tourImageClass}
                        alt={room.room_type}
                    />
                    <div className={tourScrimClass}>
                        <h2 className={tourTitleClass}>{room.room_type}</h2>
                        <p className={tourKickerClass}>Amalfi Resort Stay</p>
                    </div>
                </div>

                <div className={tourBodyClass}>
                    <div className={tourGridClass}>
                        <div>
                            <h4 className={tourSectionTitleClass}>Specifications</h4>
                            <div className={tourSpecRowClass}>
                                <span className={tourSpecLabelClass}>Capacity</span>
                                <span className={tourSpecValueClass}>{room.capacity || 2} Pax</span>
                            </div>
                            <div className={tourSpecRowClass}>
                                <span className={tourSpecLabelClass}>View</span>
                                <span className={tourSpecValueClass}>{room.view || 'Resort Panorama'}</span>
                            </div>
                            <div className={tourSpecRowClass}>
                                <span className={tourSpecLabelClass}>Status</span>
                                <span className={`${tourSpecValueClass} text-[#16a34a]`}>Available</span>
                            </div>

                            <div className={tourPriceWrapClass}>
                                <h4 className={tourSectionTitleClass}>Official Pricing</h4>
                                <div className={tourPriceClass}>PHP {Number(room.price || 0).toLocaleString()} <span className={tourPriceUnitClass}>/Night</span></div>
                            </div>
                        </div>

                        <div>
                            <h4 className={tourSectionTitleClass}>Amenities</h4>
                            <p className={tourCopyClass}>
                                Designed for surfers and dreamers seeking a quiet Liwliwa stay. This unit combines minimalist Filipino aesthetics with modern comfort, restful views, and direct access to the resort grounds.
                            </p>
                            <div className={tourAmenityGridClass}>
                                {['Premium Linens', 'Climate Control', 'Organic Toiletries', 'Fiber WiFi', 'Beach Access'].map((amenity) => (
                                    <div key={amenity} className={tourAmenityClass}>
                                        <div className={tourCheckClass}>Ã¢Å“â€œ</div> {amenity}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoomTourModal;
