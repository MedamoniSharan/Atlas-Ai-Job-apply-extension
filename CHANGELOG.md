# Changelog

All notable changes to Cosmo Job Assistant (extension + dashboard + API) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Firefox MV3 compatibility: dual `background.scripts` + `service_worker`, gecko id, AMO `data_collection_permissions`, `build:firefox` → `cosmo-agent-firefox.zip`.

### Changed

- Full rebrand from Atlas to Cosmo (packages `@cosmo/*`, auth storage keys, extension UI, docs).

### Planned

- Public `/privacy` and `/terms` pages on the Cosmo web app.
- Chrome / Edge / Firefox store listings and screenshots.

## [1.0.3] - 2026-08-03

### Added

- Naukri-style chips + autocomplete for titles, keywords, and locations (extension popup + dashboard).
- Curated spaced suggestion catalogs so prefs store labels like `Spring Boot`.

### Fixed

- Title/keyword matching treats spaced and compact forms as equivalent (`Spring Boot` ≡ `SpringBoot`).

## [1.0.2] - 2026-08-03

### Fixed

- Ship release zips with production `webBridge` matches so Google auth syncs on cosmovai.in.
- Preserve panel `<style>` tags so the floating Cosmo dock appears on Naukri.
- Mount action SVGs via HTML parsing so Pause / Stop / Minimize icons are visible in Chrome.
- Show animated dots on the Start button while scanning.

## [1.0.0] - 2026-07-24

### Added

- Manifest V3 Chrome extension (`Cosmo Job Assistant`) with Naukri content script and floating co-pilot panel.
- Background service worker: auth, offline event queue, sync alarms, scan/apply orchestration, plan apply quotas.
- Dashboard (React + Vite): Google sign-in, applications tracker, preferences, onboarding, Razorpay subscriptions.
- Extension ↔ web auth bridge via `postMessage` / `webBridge.js` (currently localhost dashboard origins).
- Shared Zod contracts (`@cosmo/shared`) for events, preferences, billing limits, and apply safety pacing.
- Admin dashboard for users, plans, subscriptions, payments, and audit log.

### Known limitations (pre-store)

- Production dashboard URL may need redeploy before Google auth bridge works against the default Vercel host.
- Privacy Policy / Terms drafts exist in-repo; public HTTPS routes still required for store listing.
- Auto Easy Apply automation may conflict with store policies and Naukri Terms of Service — review before publish.
