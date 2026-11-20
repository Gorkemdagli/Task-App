/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              // Keep Recharts code in dashboard-only entries and split oversized chunks.
              name: 'recharts',
              test: /node_modules[\\/]recharts[\\/]es6[\\/]cartesian[\\/]/,
              entriesAware: true,
              maxSize: 300 * 1024,
            },
            {
              // Keep generated interop helpers out of the API chunk that imports authStore.
              name: 'axios-vendor',
              test: /node_modules[\\/]axios[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(import.meta.dirname, '../node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, '../node_modules/react-dom'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
