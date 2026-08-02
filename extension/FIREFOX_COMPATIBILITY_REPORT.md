# Firefox Compatibility Report — Cosmo Job Assistant

**Date:** 2026-08-02  
**Extension version:** 1.0.0  
**Gecko ID:** `cosmo-job-assistant@cosmovai.com`  
**Artifact:** `/Users/m.sharan/job-buddy/cosmo-agent-firefox.zip`

## Follow-up (2026-08-02) — dual-target packaging

Chrome and Firefox packages now use **browser-specific `background` keys** from one JS codebase:

| Package | `background` | Purpose |
|---------|--------------|---------|
| `cosmo-chrome-extension.zip` / Chromium dist | `service_worker` only | Chrome MV3 |
| `cosmo-agent-firefox.zip` / Firefox dist | `scripts` only | Firefox event page |

This removes the Firefox `MANIFEST_FIELD_UNSUPPORTED` warning for `service_worker`.

Runtime helpers in `src/shared/browser.ts` detect Firefox vs Chromium and ensure `chrome.*` messaging works in both.

`web-ext lint` after this change: **0 errors**, 10 warnings (`UNSAFE_VAR_ASSIGNMENT` only — pre-existing trusted innerHTML).


## Files modified

| File | Change |
|------|--------|
| `extension/manifest.json` | Dual `background.scripts` + `service_worker`; `action.default_icon`; gecko `browser_specific_settings` + `data_collection_permissions`; trimmed WAR |
| `extension/scripts/build.mjs` | Firefox/AMO packaging, dual background, gecko defaults, prod origin defaults, `--firefox` ZIP, esbuild `firefox121` target, strip sourcemaps |
| `extension/package.json` | Added `build:firefox`; removed unused `@types/uuid` |
| `extension/popup.html` | Dropped `type="module"` (bundle is IIFE) |
| `extension/src/background/index.ts` | Log message: “Background script ready” |
| `extension/src/adapters/naukriAdapter.ts` | TS fixes (PointerEvent cast; null→undefined meta fields) |
| `extension/src/core/applyQueue.ts` | TS fix for `tab.id` typing |
| `extension/src/core/applyPace.test.ts` | TS mock cast via `unknown` |
| `extension/src/core/copilotState.test.ts` | TS mock cast via `unknown` |
| `client/.env.example` | Production web origin + Firefox build notes |
| `README.md` | Firefox load / AMO packaging instructions |

## Files removed

| Path | Reason |
|------|--------|
| `extension/assets/icons/` (empty dir) | Unused placeholder; WAR no longer references `assets/icons/*` |
| `@types/uuid` (devDependency) | `uuid@11` ships its own types |

## Compatibility issues found

1. **Background service worker only** — Firefox does not run MV3 `background.service_worker`; it needs `background.scripts` (event page). Dual declaration is the cross-browser pattern.
2. **Missing `browser_specific_settings.gecko.id`** — Required for Firefox MV3 signing / AMO (and reliable `about:debugging` installs).
3. **Missing `data_collection_permissions`** — Required for new AMO submissions (Nov 2025+).
4. **Popup loaded as ES module** — `popup.js` is an IIFE; `type="module"` was incorrect for Firefox/Chromium.
5. **No `action.default_icon`** — Icons only at top-level `icons`; toolbar icon now set explicitly.
6. **Release localhost hosts** — Store packages must not ship localhost host permissions; release/Firefox builds use production HTTPS origins only.
7. **TypeScript/lint failures** — Pre-existing `tsc` errors blocked a clean lint; fixed without behavior changes.
8. **Empty `assets/icons` WAR entry** — Removed unused pattern.

## Fixes applied

- Dual background: `"scripts": ["background.js"]` + `"service_worker": "background.js"`.
- Always emit gecko block: id, `strict_min_version: "121.0"`, required data-collection categories matching sync/auth/Naukri scraping.
- Production defaults for Firefox/release: API Render URL + dashboard Vercel URL from repo homepage; override via env.
- `npm run build:firefox` → `cosmo-agent-firefox.zip` at repo root (extension files at ZIP root, no parent folder, no sourcemaps).
- esbuild `target: ['chrome120', 'firefox121']`.
- Permissions kept minimal: `storage`, `alarms`, `tabs` + host permissions for API, web app, Naukri only.
- Chrome path unchanged: same codebase; Chromium ignores gecko settings and uses the service worker.

## APIs verified (code review + packaging)

| Area | Status |
|------|--------|
| Background (event page / SW) | Dual entry; Firefox uses scripts |
| Content scripts | Naukri + dashboard matches; no privileged `fetch` from content |
| Popup / action | Classic script load; default icons set |
| Messaging | Async listeners return `true`; `chrome.runtime` / `tabs.sendMessage` |
| Storage | `chrome.storage.local` + `onChanged` |
| Alarms | `chrome.alarms` for sync/health |
| Tabs | create/update/query/reload/remove; single-tab guard |
| Windows | `chrome.windows.update` (no extra permission) |
| Cookies / webRequest | Not used (correctly omitted from permissions) |
| Scripting API | Not used (static content_scripts only) |
| Assets / icons / paths | PNG icons generated; logo + `running.mp4` under `assets/` |

## Validation

- `npm run lint --workspace=@cosmo/extension` — pass  
- `npm test --workspace=@cosmo/extension` — 44 tests pass  
- `npm run build:firefox` — success, no esbuild warnings  
- ZIP: `manifest.json` at root; 12 files; no `.map`  
- `web-ext lint` — **0 errors**, 11 warnings  
- `web-ext run` (Firefox) — extension started successfully  

### `web-ext lint` warnings (remaining, non-blocking)

| Code | Count | Notes |
|------|-------|-------|
| `MANIFEST_FIELD_UNSUPPORTED` | 1 | Firefox warns on `background.service_worker` — **intentional** for Chrome compatibility |
| `UNSAFE_VAR_ASSIGNMENT` | 10 | Trusted `innerHTML` for SVG icons / panel markup in `content.js` — pre-existing; not introduced by Firefox work |

## Remaining issues / AMO notes

1. **Dashboard origin currently 404** — Default `EXTENSION_WEB_ORIGIN` is `https://atlas-ai-job-apply-extension-client-roan.vercel.app` (GitHub homepage). Redeploy the client or set `EXTENSION_WEB_ORIGIN` before relying on Google auth bridge in production.
2. **AMO policy review** — Assisted Easy Apply / automation may draw extra reviewer scrutiny vs Naukri ToS; privacy/terms HTTPS pages should be live on the listing.
3. **Host permission revocation** — Firefox users can revoke hosts; optional runtime `permissions.contains` / request UX is not implemented (same as Chrome optional-host behavior).
4. **innerHTML lint warnings** — Consider DOM APIs later if AMO reviewers push; not required for load/sign.

## How to load in Firefox

1. Build: `npm run build:firefox --workspace=@cosmo/extension` (or local `npm run build` for localhost hosts).  
2. Open `about:debugging#/runtime/this-firefox`.  
3. **Load Temporary Add-on…** → select `extension/dist/manifest.json`.  
4. For AMO upload, use repo-root `cosmo-agent-firefox.zip`.

## Chrome compatibility

Unchanged for Chromium: service worker background, same permissions model, same messaging/storage/tabs usage. `browser_specific_settings` is ignored by Chrome.
