import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all /api requests to the Node.js backend
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false, // Set to true for HTTPS backends
      },
    },
  },
});