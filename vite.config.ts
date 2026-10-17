/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const alias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
  '@web': fileURLToPath(new URL('./src/web', import.meta.url)),
};

// `--mode demo` genera la versión estática (GitHub Pages) que ejecuta la API en
// el propio navegador sobre PGlite. El resto de modos usan la API real (/api).
export default defineConfig(({ mode }) => ({
  root: 'src/web',
  base: mode === 'demo' ? './' : '/',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : '0'),
  },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    outDir: fileURLToPath(new URL(mode === 'demo' ? './dist/demo' : './dist/web', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: mode === 'demo' ? undefined : { '/api': 'http://localhost:3000' },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}));
