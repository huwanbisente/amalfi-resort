# Amalfi Admin Hub

Desktop React/Vite operations workspace for Amalfi Resort.

Status: current as of May 25, 2026. Admin Hub is the completed V3 staff command
center for dashboard signals, central ledger, booking workspace, edit/rebooking,
payment verification, financial reports, chatbot monitor, response helper,
special bookings, units, and analytics.

The Hub API in `../amalfi-hub/server.js` is the backend source of truth. Admin
Hub should not own booking, payment, availability, or lifecycle rules outside
client-side validation and operator workflow.

Local dev:

```bash
npm run dev
```

Useful checks:

```bash
npm run build
npm test
npm run test:browser
```
