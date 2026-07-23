import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

fs.copyFileSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
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
 * Extension code must only `import type` from @atlas/shared (no Zod value imports).
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
  sourcemap: true,
  alias: {
    '@atlas/shared': sharedEntry,
  },
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('Watching extension...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Extension built to dist/');
}
