# Cosmo Job Assistant

MERN + Chrome Extension (Manifest V3) MVP for syncing job applications from supported platforms into a dashboard.

## Stack

- **client** — React + Vite + React Query + Zustand + Socket.IO
- **server** — Express + MongoDB + Socket.IO
- **extension** — Chrome MV3 with offline queue and Naukri adapter
- **shared** — Zod contracts and API types

## Quick start

```bash
# 1. Infra
npm run docker:up

# 2. Install + build shared contracts
npm install
npm run build --workspace=@cosmo/shared

# 3. API (http://localhost:4000)
cp .env.example .env   # already present for local defaults
npm run dev:server

# 4. Dashboard (http://localhost:5173)
npm run dev:client

# 5. Extension
npm run build --workspace=@cosmo/extension
# Chrome → Extensions → Load unpacked → select extension/dist

# Store / production package (no sourcemaps; requires HTTPS origins):
# EXTENSION_API_ORIGIN=https://api.example.com \
# EXTENSION_WEB_ORIGIN=https://app.example.com \
# EXTENSION_GECKO_ID=cosmo@cosmovai.com \
# npm run build:release --workspace=@cosmo/extension
```

Or run `bash scripts/bootstrap.sh`.

Privacy / Terms (local): `http://localhost:5173/privacy` and `/terms`.

## Vertical slice

1. Register / sign in on the dashboard.
2. Sign in from the extension popup with the same credentials (`API Base URL` = `http://localhost:4000`).
3. Open a Naukri job page while logged into Naukri in Chrome.
4. The content script emits `JobDetected` / `ApplicationRecorded`.
5. Events persist in `chrome.storage`, sync idempotently via `POST /api/v1/events/sync`, and appear on **Applications** (Socket.IO live updates).

## Billing (Razorpay Subscriptions)

Paid plans (`pro` / `max`) use **Razorpay Subscriptions** (monthly auto-renew).

1. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `.env`.
2. In the Razorpay Dashboard → Webhooks, point to:
   `https://<your-api-host>/api/v1/billing/webhooks/razorpay`
3. Subscribe to at least: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment.failed`.
4. Razorpay Plan IDs are created automatically on first subscribe / when an admin changes plan price.
5. Users subscribe from **Profile** or pricing UI; cancel schedules end-of-period cancellation.

Legacy one-time order endpoints (`/billing/create-order`, `/billing/verify`) remain for reconcile/compat but checkout uses `/billing/subscribe`.

## Admin dashboard

1. Add your email to `ADMIN_EMAILS` in `.env`, **or** run:
   `npx tsx scripts/promote-admin.ts --email=you@example.com`
2. Sign in, then open `/admin` (also linked in the app sidebar for admins).
3. Admins can view revenue charts, manage users/plans/subscriptions/payments, and read the audit log.

Admin API base: `/api/v1/admin/*` (requires JWT with `role: admin`).

## API shape

```json
{
  "success": true,
  "message": "Operation completed",
  "data": {},
  "error": null
}
```

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`

### Billing

- `POST /api/v1/billing/subscribe`
- `POST /api/v1/billing/verify-subscription`
- `POST /api/v1/billing/cancel`
- `GET /api/v1/billing/me`
- `POST /api/v1/billing/webhooks/razorpay`

### Events & applications

- `POST /api/v1/events/sync` — batch upsert by `eventId`
- `GET /api/v1/applications`
- `GET /api/v1/health`

## Tests

```bash
npm test
npm run test --workspace=@cosmo/extension
```

## Design

See [docs/design.md](docs/design.md).

## MVP scope notes

- Naukri adapter is implemented; other platforms are stubs.
- Google OAuth and cloud resume storage are deferred.
- Admin panel and Razorpay recurring subscriptions are implemented.
