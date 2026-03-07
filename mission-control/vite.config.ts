import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative paths for Cloudflare Pages compatibility
  base: './',
  
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
    // Ensure assets use relative paths
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Prevent hash in filenames for easier debugging
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/\.css$/i.test(assetInfo.name)) {
            return 'assets/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  
  // Ensure public files are copied
  publicDir: 'public',
});
