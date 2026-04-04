import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Web version - configured for production deployment
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['preact', 'zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 100,
  },
  optimizeDeps: {
    include: ['preact', 'zustand'],
  },
});
