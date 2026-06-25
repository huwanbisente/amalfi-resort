# Amalfi Resort System

Amalfi is the active project. The guest website, desktop admin panel, and mobile admin panel keep their existing Amalfi layout as the source of truth. The Breeze project at `F:\PROJECTS\BREEZE_V3\BREEZE` is only a read-only backend/model reference.

Do not edit Breeze while working on Amalfi.

## Apps And Ports

- Hub API: `http://localhost:3101`
- Guest website: `http://localhost:5273`
- Desktop admin panel: `http://localhost:5274`
- Mobile admin panel: `http://localhost:5275`
- Chatbot/reference service: `http://localhost:8101` when enabled

The primary Amalfi UI lives in the root app, `guest-web`, and `mobile-admin`. The `amalfi-web`, `amalfi-admin`, and `amalfi-mobile-admin` folders are Breeze-derived React reference scaffolds, not the source of truth for the current Amalfi layout.

## Setup

Install dependencies:

```powershell
npm run install:all
```

Copy `.env.example` to `.env`, then set at least:

```env
HUB_ADMIN_TOKEN=your-local-admin-token
JWT_SECRET=your-local-jwt-secret
```

For local development, `dev-start.ps1` and `dev-health.ps1` fall back to `dev-token` when `HUB_ADMIN_TOKEN` is not set.

## Run Locally

Start the full local stack:

```powershell
.\dev-start.ps1
```

Check the running services:

```powershell
.\dev-health.ps1
```

Stop the local stack:

```powershell
.\dev-stop.ps1
```

## Useful Scripts

```powershell
npm run check:static
npm run build
npm run dev:hub
npm run dev:guest
npm run dev:admin
npm run dev:mobile
```

## Backend Scope

The Amalfi Hub adapts Breeze's booking and operations logic for the Amalfi villa catalog, admin workflows, guest booking flow, mobile operations, POS, expenses, staff, payroll, service requests, special bookings, and villa status updates.

If an Amalfi screen needs backend behavior that does not exist in Breeze, build that behavior in Amalfi rather than changing the Amalfi layout or editing Breeze.
