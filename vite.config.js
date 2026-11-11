import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // Keep the original Host header: the server builds survey links from it.
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
});
