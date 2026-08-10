import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Import shared TypeScript source so Vite gets real ESM named exports
    // (shared/dist is CommonJS and breaks named imports like DEFAULT_JOB_PREFERENCES).
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@cosmo/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/api': 'https://shjisr6492.execute-api.ap-south-2.amazonaws.com',
      '/health': 'https://shjisr6492.execute-api.ap-south-2.amazonaws.com',
    },
  },
});
