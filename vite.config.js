import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const api = process.env.API ?? 'http://localhost:8787';

export default defineConfig({
  root: 'web',
  plugins: [svelte()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rolldownOptions: { checks: { bundlerTimings: false } }, // the slow-plugin report is just Svelte on a Pi
  },
  server: {
    host: true,
    proxy: {
      '/api': api,
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
});
