import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { writeZipFromDirectory } from './zipDirectory.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const clientPublicZip = path.resolve(
  root,
  '../client/public/cosmo-chrome-extension.zip'
);
const firefoxZip = path.resolve(root, '../cosmo-agent-firefox.zip');
const watch = process.argv.includes('--watch');
const release = process.argv.includes('--release');
const firefox = process.argv.includes('--firefox');

/** Production Cosmo API (Render). */
const DEFAULT_PROD_API =
  'https://atlas-ai-job-apply-extension-1.onrender.com';
/** Production dashboard origins (custom domain + original Vercel). Override via env. */
const DEFAULT_PROD_WEB =
  'https://www.cosmovai.in,https://atlas-ai-job-apply-extension-client-roan.vercel.app';
/** Stable AMO / Firefox add-on ID (email-shaped). */
const DEFAULT_GECKO_ID = 'cosmo-job-assistant@cosmovai.com';

function parseOrigins(raw, fallback) {
  const source = raw?.trim() ? raw : fallback;
  return source
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const apiOrigins = parseOrigins(
  process.env.EXTENSION_API_ORIGIN,
  release || firefox
    ? DEFAULT_PROD_API
    : `${DEFAULT_PROD_API},http://localhost:4000,http://127.0.0.1:4000`
);

const webOrigins = parseOrigins(
  process.env.EXTENSION_WEB_ORIGIN,
  release || firefox
    ? DEFAULT_PROD_WEB
    : 'http://localhost:5173,http://127.0.0.1:5173'
);

const geckoId =
  process.env.EXTENSION_GECKO_ID?.trim() || DEFAULT_GECKO_ID;

if (release || firefox) {
  const hasLocalApi = apiOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o));
  const hasLocalWeb = webOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o));
  if (hasLocalApi || hasLocalWeb) {
    console.error(
      'Release/Firefox build requires EXTENSION_API_ORIGIN and EXTENSION_WEB_ORIGIN to be production HTTPS URLs (no localhost).'
    );
    process.exit(1);
  }
}

fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

function toMatchPattern(origin) {
  return `${origin}/*`;
}

/**
 * Build a Manifest V3 object for one browser target.
 * - chromium: background.service_worker only (Chrome MV3)
 * - firefox: background.scripts only (Firefox event page; avoids
 *   MANIFEST_FIELD_UNSUPPORTED for service_worker)
 */
function createManifest(target) {
  const base = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );

  const hostPermissions = [
    ...apiOrigins.map(toMatchPattern),
    ...webOrigins.map(toMatchPattern),
    'https://www.naukri.com/*',
    'https://naukri.com/*',
  ];

  base.host_permissions = [...new Set(hostPermissions)];
  base.permissions = ['storage', 'alarms', 'tabs'];

  if (target === 'firefox') {
    base.background = { scripts: ['background.js'] };
  } else {
    base.background = { service_worker: 'background.js' };
  }

  base.action = {
    ...(base.action || {}),
    default_popup: 'popup.html',
    default_title: 'Cosmo',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  };

  base.content_scripts = [
    {
      matches: ['https://www.naukri.com/*', 'https://naukri.com/*'],
      js: ['content.js'],
      run_at: 'document_idle',
    },
    {
      matches: webOrigins.map(toMatchPattern),
      js: ['webBridge.js'],
      run_at: 'document_idle',
    },
  ];

  base.web_accessible_resources = [
    {
      resources: ['assets/*'],
      matches: ['https://www.naukri.com/*', 'https://naukri.com/*'],
    },
  ];

  // Required for Firefox MV3 / AMO. Chromium ignores this key.
  // data_collection_permissions needs desktop ≥140 and Android ≥142.
  base.browser_specific_settings = {
    gecko: {
      id: geckoId,
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: [
          'authenticationInfo',
          'browsingActivity',
          'personallyIdentifyingInfo',
          'websiteActivity',
          'websiteContent',
        ],
      },
    },
    gecko_android: {
      strict_min_version: '142.0',
    },
  };

  return base;
}

function writeManifest(target) {
  const manifest = createManifest(target);
  fs.writeFileSync(
    path.join(dist, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

// Seed dist with the active target manifest (rewritten again after JS build).
writeManifest(firefox ? 'firefox' : 'chromium');
fs.copyFileSync(path.join(root, 'popup.html'), path.join(dist, 'popup.html'));
fs.copyFileSync(path.join(root, 'popup.css'), path.join(dist, 'popup.css'));

const assetsSrc = path.join(root, 'assets');
const assetsDist = path.join(dist, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsDist, { recursive: true });
}
const emptyIcons = path.join(assetsDist, 'icons');
if (fs.existsSync(emptyIcons) && fs.readdirSync(emptyIcons).length === 0) {
  fs.rmSync(emptyIcons, { recursive: true, force: true });
}

async function writeIcons(outDir) {
  const svgPath = path.join(root, 'icons', 'icon.svg');
  const svg = fs.readFileSync(svgPath);
  for (const size of [16, 48, 128]) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon${size}.png`));
  }
}

await writeIcons(path.join(dist, 'icons'));

const sharedEntry = path.resolve(root, '../shared/src/index.ts');

/**
 * IIFE avoids Zod/ESM circular-init failures in Chrome MV3 service workers.
 * Extension code must only `import type` from @cosmo/shared (no Zod value imports).
 * Browser family is detected at runtime (see src/shared/browser.ts) so the same
 * JS bundle can ship in both Chromium and Firefox packages.
 */
const ctx = await esbuild.context({
  entryPoints: {
    background: path.join(root, 'src/background/index.ts'),
    content: path.join(root, 'src/content/index.ts'),
    webBridge: path.join(root, 'src/content/webAuthBridge.ts'),
    popup: path.join(root, 'src/popup/index.ts'),
  },
  bundle: true,
  outdir: dist,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox121'],
  sourcemap: !(release || firefox),
  define: {
    __EXTENSION_API_ORIGIN__: JSON.stringify(apiOrigins.join(',')),
    __EXTENSION_WEB_ORIGIN__: JSON.stringify(webOrigins.join(',')),
  },
  alias: {
    '@cosmo/shared': sharedEntry,
  },
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log(`Watching extension (${firefox ? 'firefox' : 'chromium'} manifest)...`);
} else {
  await ctx.rebuild();
  await ctx.dispose();

  if (release || firefox) {
    for (const name of fs.readdirSync(dist)) {
      if (name.endsWith('.map')) {
        fs.unlinkSync(path.join(dist, name));
      }
    }
  }

  // Same JS bundle; manifest differs per browser so Chrome keeps service_worker
  // and Firefox keeps scripts-only (no unsupported-field warning).
  writeManifest('chromium');
  writeZipFromDirectory(dist, clientPublicZip);

  if (firefox || release) {
    writeManifest('firefox');
    writeZipFromDirectory(dist, firefoxZip);
  }

  // Leave dist matching the requested primary target for load-unpacked / about:debugging.
  writeManifest(firefox ? 'firefox' : 'chromium');

  const targets = [path.relative(root, clientPublicZip)];
  if (firefox || release) {
    targets.push(path.relative(root, firefoxZip));
  }
  console.log(
    release || firefox
      ? `Release extension built to dist/ + ${targets.join(' + ')} (API: ${apiOrigins.join(', ')}; web: ${webOrigins.join(', ')}; gecko: ${geckoId}; dist manifest: ${firefox ? 'firefox' : 'chromium'})`
      : `Extension built to dist/ + ${targets.join(' + ')} (dist manifest: chromium)`
  );
}
