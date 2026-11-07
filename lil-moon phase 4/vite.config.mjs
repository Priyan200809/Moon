import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP is injected into production builds only (the dev server needs inline scripts for HMR).
const csp = {
  name: 'lil-moon-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<!--CSP-->',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:">`
    ),
};

export default defineConfig({
  root: 'frontend',
  base: './',
  plugins: [react(), csp],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
