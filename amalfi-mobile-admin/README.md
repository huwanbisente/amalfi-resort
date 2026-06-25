# Amalfi Admin Desk

Mobile-first React/Vite staff workspace for Amalfi Resort.

Status: current as of May 25, 2026. Admin Desk is the completed V3 field
companion for today view, guest movements, manual booking, availability/unit
checker, payment verification, mobile ledger, pulse, room operations, and
chatbot controls.

Admin Desk is not a separate source of truth. It must call Hub-backed workflows
for quotes, recommendations, booking creation, payment verification, ledger
data, room status, and chatbot control actions.

Local dev:

```bash
npm run dev
```

Useful checks:

```bash
npm run build
npm test
npm run test:browser
npm run test:browser:mutation
```
