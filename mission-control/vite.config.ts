import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 2000, // Mapbox GL is ~1.7MB, so increase limit
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          // Separate mapbox into its own chunk for better caching
          'mapbox-gl': ['mapbox-gl'],
          // React and related
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    // Dev proxy → local Worker (wrangler dev on :8787). Relative /api calls in
    // the app hit this proxy, so no CORS is needed in development.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  // Optimize dependencies for faster dev startup
  optimizeDeps: {
    include: ['mapbox-gl', 'react-map-gl'],
  },
});
