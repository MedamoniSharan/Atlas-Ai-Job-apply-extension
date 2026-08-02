# Cosmo Job Assistant — Firefox source build (AMO)

These instructions reproduce the uploaded `cosmo-agent-firefox.zip`.

## Requirements

- Node.js 20 or newer
- npm 10+ (comes with Node)

## Build steps

From the repository root (this archive root):

```bash
npm install
npm run build --workspace=@cosmo/shared
npm run build:firefox --workspace=@cosmo/extension
```

## Output

- Extension package: `cosmo-agent-firefox.zip` (repository root)
- Unpacked build: `extension/dist/`
- `manifest.json` is at the root of `cosmo-agent-firefox.zip`

The Firefox package uses `background.scripts` (event page). The same sources also produce a Chromium package with `background.service_worker`.

## Optional environment overrides

Defaults are already set for production in `extension/scripts/build.mjs`.

```bash
export EXTENSION_API_ORIGIN=https://atlas-ai-job-apply-extension-1.onrender.com
export EXTENSION_WEB_ORIGIN=https://www.cosmovai.in,https://atlas-ai-job-apply-extension-client-roan.vercel.app
export EXTENSION_GECKO_ID=cosmo-job-assistant@cosmovai.com
npm run build:firefox --workspace=@cosmo/extension
```

## Notes for reviewers

- Bundler: esbuild (TypeScript → IIFE bundles)
- Icons: generated from `extension/icons/icon.svg` via `sharp` during build
- Do not upload `extension/dist/` as source; use this archive and run the build above
- Gecko id: `cosmo-job-assistant@cosmovai.com`
- Minimum Firefox: 140.0 (desktop), 142.0 (Android)
