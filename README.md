# CodeXCareer Job Assistant

MERN + Chrome Extension (Manifest V3) MVP for syncing job applications from supported platforms into a dashboard.

## Stack

- **client** — React + Vite + React Query + Zustand + Socket.IO
- **server** — Express + MongoDB + Redis + BullMQ + Socket.IO
- **extension** — Chrome MV3 with offline queue and Naukri adapter
- **shared** — Zod contracts and API types

## Quick start

```bash
# 1. Infra
npm run docker:up

# 2. Install + build shared contracts
npm install
npm run build --workspace=@codexcareer/shared

# 3. API (http://localhost:4000)
cp .env.example .env   # already present for local defaults
npm run dev:server

# 4. Dashboard (http://localhost:5173)
npm run dev:client

# 5. Extension
npm run build --workspace=@codexcareer/extension
# Chrome → Extensions → Load unpacked → select extension/dist
```

Or run `bash scripts/bootstrap.sh`.

## Vertical slice

1. Register / sign in on the dashboard.
2. Sign in from the extension popup with the same credentials (`API Base URL` = `http://localhost:4000`).
3. Open a Naukri job page while logged into Naukri in Chrome.
4. The content script emits `JobDetected` / `ApplicationRecorded`.
5. Events persist in `chrome.storage`, sync idempotently via `POST /api/v1/events/sync`, and appear on **Applications** (Socket.IO live updates).

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

### Events & applications

- `POST /api/v1/events/sync` — batch upsert by `eventId`
- `GET /api/v1/applications`
- `GET /api/v1/health`

## Tests

```bash
npm test
npm run test --workspace=@codexcareer/extension
```

## Design

See [docs/design.md](docs/design.md).

## MVP scope notes

- Naukri adapter is implemented; other platforms are stubs.
- Google OAuth, billing, and cloud resume storage are deferred.
- Redis is optional at runtime: the API still runs if Redis is down (BullMQ enrichment is skipped).
