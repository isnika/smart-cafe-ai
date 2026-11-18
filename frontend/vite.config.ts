/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    open: '/home',
    // Gateway expose /api/v1/...; proxy keeps browser requests same-origin in dev.
    proxy: {
      // Translate service paths used by the frontend to the gateway's public routes.
      '/users': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/users/, '/api/v1/users'),
      },
      '/admin': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        // `/admin` is also an SPA route. Only proxy API calls; let browser
        // navigations (which request HTML) fall through to Vite's index.html.
        bypass: (req) => req.headers.accept?.includes('text/html') ? req.url : undefined,
        rewrite: (path) => path.replace(/^\/admin/, '/api/v1/admin'),
      },
      '/auth': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/auth/, '/api/v1/auth'),
      },
      '/catalog': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/catalog/, '/api/v1/catalog'),
      },
      // Online and QR carts use service-relative paths; forward them to Order Service.
      '/carts': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/carts/, '/api/v1/carts'),
      },
      // Customer order history uses service-relative paths (/orders/me).
      '/orders': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/orders/, '/api/v1/orders'),
      },
      // Admin pages call the Store service with service-relative paths.
      // Forward these through the gateway just like the versioned production API.
      '/branches': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/branches/, '/api/v1/branches'),
      },
      '/tables': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tables/, '/api/v1/tables'),
      },
      '/staff-profiles': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/staff-profiles/, '/api/v1/staff-profiles'),
      },
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
      // Chat Service route in API Gateway: /api/v1/chat/**.
      '/chat': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chat/, '/api/v1/chat'),
      },
    },
  },
  // Node fetch cần URL tuyệt đối; MSW (setupServer) chặn đúng base này trong test.
  test: { env: { VITE_API_BASE_URL: 'http://localhost/api' }, maxWorkers: 1 },
})
