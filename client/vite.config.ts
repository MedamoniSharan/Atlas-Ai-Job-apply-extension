import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Import shared TypeScript source so Vite gets real ESM named exports
    // (shared/dist is CommonJS and breaks named imports like DEFAULT_JOB_PREFERENCES).
    alias: {
      '@cosmo/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/api': 'https://atlas-ai-job-apply-extension-1.onrender.com',
      '/socket.io': {
        target: 'https://atlas-ai-job-apply-extension-1.onrender.com',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
