/**
 * Amalfi Resort: Virtual Hub Sync v2.0
 * Local-First architecture — no external GSheet dependency.
 * All bookings persist exclusively to the local SQLite database via the Hub API.
 */

const HubMock = {
    /**
     * The "Shadow Brain": Retrieves bookings from the browser's persistent storage.
     */
    getBookingManifest: () => {
        const data = localStorage.getItem('amalfi_manifest');
        return data ? JSON.parse(data) : [];
    },

    saveBookingToShadow: (booking) => {
        const manifest = HubMock.getBookingManifest();
        manifest.push({ ...booking, timestamp: new Date().toISOString() });
        localStorage.setItem('amalfi_manifest', JSON.stringify(manifest));
    },

    /**
     * Availability Logic (Shadow DB Aware)
     */
    checkAvailability: async (checkIn, checkOut, roomType) => {
        const manifest = HubMock.getBookingManifest();

        const isOverlap = (sA, eA, sB, eB) => {
            return new Date(sA) < new Date(eB) && new Date(eA) > new Date(sB);
        };

        const existingUnits = manifest.filter(b =>
            b.room_type === roomType && isOverlap(b.check_in, b.check_out, checkIn, checkOut)
        ).length;

        return { available: existingUnits === 0 };
    },

    /**
     * Master Synchronizer: Persists to local Shadow DB only.
     * Google Sheets integration has been retired — Amalfi runs on SQLite.
     */
    processBooking: async (payload) => {
        // Persist to Shadow DB (local storage mirror)
        HubMock.saveBookingToShadow(payload);
        return { status: "success", booking_ref: payload.booking_ref };
    }
};

export default HubMock;

