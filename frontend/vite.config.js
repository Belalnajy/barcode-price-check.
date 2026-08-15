import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /* Vercel rewrites /api/* to the serverless function; locally both the dev
     and preview servers forward it to `npm run dev:api`. */
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        /* React changes far less often than app code — keeping it in its own
           chunk means a redeploy only invalidates the small app bundle. */
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-scan': ['fuse.js', 'jsbarcode'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    /* Tests reach up into ../api as well — one runner covers both halves. */
    testTimeout: 15000,
  },
});
