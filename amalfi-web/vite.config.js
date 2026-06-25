import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    fileParallelism: false,
  },
  server: {
    port: 5273,
    allowedHosts: true,
    proxy: {
      '/api/v1/assets': {
        target: process.platform === 'win32' ? 'http://localhost:3101' : 'http://hub-api:3001',
        changeOrigin: true
      },
      '/api/v1/public': {
        target: process.platform === 'win32' ? 'http://localhost:3101' : 'http://hub-api:3001',
        changeOrigin: true
      },
      '/api/v1/admin': {
        target: process.platform === 'win32' ? 'http://localhost:3101' : 'http://hub-api:3001',
        changeOrigin: true
      },
      '/chatbot': {
        target: process.platform === 'win32' ? 'http://localhost:8101' : 'http://chatbot:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chatbot/, '')
      }
    }
  }
})
