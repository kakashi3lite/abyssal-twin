import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://staging.abyssal-twin.dev',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'wss://staging.abyssal-twin.dev',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
