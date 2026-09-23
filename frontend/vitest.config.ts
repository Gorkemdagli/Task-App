import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(import.meta.dirname, '../node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, '../node_modules/react-dom'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      thresholds: {
        'src/hooks/tasks.ts': { perFile: { lines: 52 } },
        'src/hooks/useTaskFilters.ts': { perFile: { lines: 95 } },
        'src/components/tasks/CreateTaskDialog.tsx': { perFile: { lines: 85 } },
        'src/components/comments/CommentInput.tsx': { perFile: { lines: 95 } },
      },
    },
  },
});
