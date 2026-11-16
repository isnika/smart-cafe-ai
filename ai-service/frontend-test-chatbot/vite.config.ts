import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:8000'

  // The browser talks to the frontend origin (/api). Vite forwards those
  // requests to FastAPI, so a Cloudflare quick-tunnel URL never needs to be
  // embedded in the frontend bundle and CORS is not involved in the browser.
  const apiProxy = {
    '/api': {
      target: backendUrl,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, '') || '/',
    },
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Quick tunnels generate a new subdomain on each run. The leading dot
      // allows any subdomain of trycloudflare.com in local development.
      allowedHosts: ['.trycloudflare.com'],
      proxy: apiProxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: ['.trycloudflare.com'],
      proxy: apiProxy,
    },
  }
})
