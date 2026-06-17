import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:3001';

// Web version - configured for production deployment
export default defineConfig({
  plugins: [preact()],
  css: {
    // Disable PostCSS — we use vanilla CSS and the workspace path has spaces
    // which breaks PostCSS config resolution
    postcss: {},
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/preact') || id.includes('node_modules/zustand')) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 100,
  },
  optimizeDeps: {
    include: ['preact', 'zustand'],
  },
});
