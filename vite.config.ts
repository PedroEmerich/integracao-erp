/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH permite publicar em subpasta (GitHub Pages: /<repositorio>/).
// Ex.: BASE_PATH=/integracao-erp/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
