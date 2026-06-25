import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    testTimeout: 20000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  },
  server: {
    port: 5274,
    allowedHosts: true,
    proxy: {
      '/api/v1/assets': {
        target: process.platform === 'win32' ? 'http://localhost:3101' : 'http://hub-api:3001',
        changeOrigin: true,
      },
      '/api': {
        target: process.platform === 'win32' ? 'http://localhost:3101' : 'http://hub-api:3001',
        changeOrigin: true,
      }
    }
  }
})
