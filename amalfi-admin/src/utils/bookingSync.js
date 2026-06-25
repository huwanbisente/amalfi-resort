const CHANNEL_NAME = 'amalfi-admin-booking-sync';
const STORAGE_KEY = 'amalfi-admin-booking-sync-event';
const senderId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function emitBookingSync(detail = {}) {
    if (typeof window === 'undefined') return;
    const event = {
        ...detail,
        senderId,
        timestamp: Date.now(),
    };

    try {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.postMessage(event);
        channel.close();
    } catch {
        // BroadcastChannel is best-effort; localStorage below covers older browsers.
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    } catch {
        // Ignore private-window storage restrictions.
    }
}

export function subscribeBookingSync(handler) {
    if (typeof window === 'undefined') return () => {};

    const handleEvent = (event) => {
        if (!event || event.senderId === senderId) return;
        handler(event);
    };

    let channel = null;
    try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (message) => handleEvent(message.data);
    } catch {
        channel = null;
    }

    const onStorage = (storageEvent) => {
        if (storageEvent.key !== STORAGE_KEY || !storageEvent.newValue) return;
        try {
            handleEvent(JSON.parse(storageEvent.newValue));
        } catch {
            // Ignore malformed external storage writes.
        }
    };

    window.addEventListener('storage', onStorage);

    return () => {
        window.removeEventListener('storage', onStorage);
        if (channel) channel.close();
    };
}
