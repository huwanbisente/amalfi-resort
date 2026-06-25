# Amalfi Web

Guest-facing React/Vite application for Amalfi Resort.

Status: current as of May 25, 2026. This is the completed V3 public guest
experience for resort presentation, room browsing, guided booking, special
bookings, rebooking/refund entry points, payment proof intake, and capacity
protection.

The backend API now lives in `../amalfi-hub`. This project should call `/api/v1/...` through the Vite or Nginx proxy and should not own backend logic.

Local dev:

```bash
npm run dev
```

The Hub should be running separately from `../amalfi-hub` on port `3001`.

Useful checks:

```bash
npm run build
npm test
npm run test:browser
```
