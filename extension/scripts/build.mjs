import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
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

// Minimal placeholder PNGs (1x1) so Chrome loads the extension; replace later.
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
for (const size of ['icon16.png', 'icon48.png', 'icon128.png']) {
  fs.writeFileSync(path.join(dist, 'icons', size), png1x1);
}

const sharedEntry = path.resolve(root, '../shared/src/index.ts');

const ctx = await esbuild.context({
  entryPoints: {
    background: path.join(root, 'src/background/index.ts'),
    content: path.join(root, 'src/content/index.ts'),
    popup: path.join(root, 'src/popup/index.ts'),
  },
  bundle: true,
  outdir: dist,
  format: 'esm',
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
