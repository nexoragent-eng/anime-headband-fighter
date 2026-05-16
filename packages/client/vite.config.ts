import { defineConfig } from 'vite';
import path from 'path';
/// <reference types="vitest" />

export default defineConfig({
  resolve: {
    alias: {
      '@ahf/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:2567',
      '/player': 'http://localhost:2567',
      '/leaderboard': 'http://localhost:2567',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
  },
  define: {
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? 'ws://localhost:2567'),
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    alias: {
      '@ahf/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
