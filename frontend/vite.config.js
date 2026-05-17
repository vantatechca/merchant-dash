// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 5173,
//     proxy: {
//       '/api': {
//         target: 'http://localhost:8001',
//         changeOrigin: true,
//         rewrite: (path) => path.replace(/^\/api/, ''),
//       },
//     },
//   },
// });


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In prod, FastAPI serves both the SPA (from frontend/dist) and the API
// (mounted under /api), so everything is same-origin and no proxy is
// needed. In dev, the SPA is served by Vite on :5173 — this proxy
// forwards /api/* to FastAPI so dev and prod use identical URLs.
//
// IMPORTANT: no rewrite. Backend routes are registered under /api/...
// directly, so the path the browser sends is the path FastAPI serves.
// Don't add a `rewrite` — it'll silently break prod.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        // Pub/Sub webhooks come over HTTP/1.1 with chunked encoding —
        // ws/secure flags aren't relevant here, but if you ever add
        // websocket routes flip ws: true.
      },
    },
  },
});