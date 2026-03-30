import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devApiOrigin = process.env.VITE_DEV_API_ORIGIN || 'https://youtubeboosterai.com';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom')) return 'react-vendor';
          if (id.includes('node_modules/react-router')) return 'router';
          if (id.includes('node_modules/react-markdown')) return 'markdown';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: devApiOrigin,
        changeOrigin: true
      },
      '/health': {
        target: devApiOrigin,
        changeOrigin: true
      }
    }
  }
});
