import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite dev server proxies API calls to the backend so the
// app is always same-origin — mirroring the production setup where Vercel
// rewrites /api/* to the Railway backend. Same-origin is a deliberate
// security property: it lets the session cookie stay sameSite=strict.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
