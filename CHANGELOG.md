# Changelog

All notable changes to Cosmo Job Assistant (extension + dashboard + API) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-24

### Added

- Manifest V3 Chrome extension (`Cosmo Job Assistant`) with Naukri content script and floating co-pilot panel.
- Background service worker: auth, offline event queue, sync alarms, scan/apply orchestration, plan apply quotas.
- Dashboard (React + Vite): Google sign-in, applications tracker, preferences, onboarding, Razorpay subscriptions.
- Extension ↔ web auth bridge via `postMessage` / `webBridge.js` (currently localhost dashboard origins).
- Shared Zod contracts (`@cosmo/shared`) for events, preferences, billing limits, and apply safety pacing.
- Admin dashboard for users, plans, subscriptions, payments, and audit log.

### Known limitations (pre-store)

- Host permissions limited to localhost API/dashboard + Naukri; production origins not configured for store builds.
- Firefox `browser_specific_settings.gecko.id` not yet added.
- Privacy Policy / Terms drafts exist in-repo; public HTTPS routes still required for store listing.
- Auto Easy Apply automation may conflict with store policies and Naukri Terms of Service — review before publish.

## [Unreleased]

### Changed

- Full rebrand from Atlas to Cosmo (packages `@cosmo/*`, auth storage keys, extension UI, docs).

### Planned

- Production manifest hosts and release build without source maps.
- Public `/privacy` and `/terms` pages on the Cosmo web app.
- Chrome / Edge / Firefox store listings and screenshots.
