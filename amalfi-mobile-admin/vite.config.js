import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5275,
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
});
