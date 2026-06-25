/**
 * Amalfi Resort Public API Client
 * Hub: server.js on Port 3101 (proxied via Vite ? /api)
 * BookingModal.jsx and RoomGrid.jsx also call /api/v1/public directly.
 */
const API_BASE = "/api/v1/public";

export const fetchRooms = async () => {
  try {
    const response = await fetch(`${API_BASE}/rooms`);
    if (!response.ok) throw new Error("Failed to fetch rooms");
    return await response.json();
  } catch (error) {
    console.error("Amalfi Hub API Error:", error);
    return { rooms: [] };
  }
};

export const submitBooking = async (bookingData) => {
  try {
    const response = await fetch(`${API_BASE}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    });
    return await response.json();
  } catch (error) {
    console.error("Booking Error:", error);
    return { status: "error", message: "Network error" };
  }
};

export const uploadReceipt = async (formData) => {
  try {
    const response = await fetch(`${API_BASE}/upload/receipt`, {
      method: "POST",
      body: formData,
    });
    return await response.json();
  } catch (error) {
    console.error("Receipt Upload Error:", error);
    return { status: "error", message: "Upload failed" };
  }
};

