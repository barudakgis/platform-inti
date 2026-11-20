import { defineConfig } from 'vite';

// base './' membuat hasil build bisa dipasang di root domain
// (Cloudflare Pages) maupun di sub-folder (GitHub Pages: /nama-repo/).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, host: true },
});
