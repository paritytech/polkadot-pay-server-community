// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

declare const process: {
  env: Record<string, string | undefined>;
};

const target = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8788';


// Dashboard routes own `/quick-start`; the backend guide remains available through `/docs/reference`.
const proxy = {
  '/v1': { target, changeOrigin: true },
  '/public': { target, changeOrigin: true },
  '/docs/reference': { target, changeOrigin: true },
  '/openapi.json': { target, changeOrigin: true },
  '/healthz': { target, changeOrigin: true },
};

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 5175,
  },
});
