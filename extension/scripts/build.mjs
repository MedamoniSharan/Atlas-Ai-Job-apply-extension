import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const release = process.argv.includes('--release');

const apiOrigins = (
  process.env.EXTENSION_API_ORIGIN || 'http://localhost:4000,http://127.0.0.1:4000'
)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const webOrigins = (
  process.env.EXTENSION_WEB_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const geckoId = process.env.EXTENSION_GECKO_ID?.trim() || '';

if (release) {
  const hasLocalApi = apiOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o));
  const hasLocalWeb = webOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o));
  if (hasLocalApi || hasLocalWeb) {
    console.error(
      'Release build requires EXTENSION_API_ORIGIN and EXTENSION_WEB_ORIGIN to be production HTTPS URLs (no localhost).'
    );
    process.exit(1);
  }
}

fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

function toMatchPattern(origin) {
  return `${origin}/*`;
}

function buildManifest() {
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

  if (geckoId) {
    base.browser_specific_settings = {
      gecko: {
        id: geckoId,
        strict_min_version: '121.0',
      },
    };
  }

  fs.writeFileSync(
    path.join(dist, 'manifest.json'),
    `${JSON.stringify(base, null, 2)}\n`
  );
}

buildManifest();
fs.copyFileSync(path.join(root, 'popup.html'), path.join(dist, 'popup.html'));
fs.copyFileSync(path.join(root, 'popup.css'), path.join(dist, 'popup.css'));

const assetsSrc = path.join(root, 'assets');
const assetsDist = path.join(dist, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsDist, { recursive: true });
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
  target: 'chrome120',
  sourcemap: !release,
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
  console.log('Watching extension...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log(
    release
      ? `Release extension built to dist/ (API: ${apiOrigins.join(', ')}; web: ${webOrigins.join(', ')})`
      : 'Extension built to dist/'
  );
}
