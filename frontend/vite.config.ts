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
  server: { port: 5173, open: true },
  // Node fetch cần URL tuyệt đối; MSW (setupServer) chặn đúng base này trong test.
  test: { env: { VITE_API_BASE_URL: 'http://localhost/api' } },
})
