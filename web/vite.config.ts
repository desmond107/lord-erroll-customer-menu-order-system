import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies to the on-premise API so the app behaves in development
// exactly as it does when the built bundle is served by that same Node process.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
