import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// REDLINE MX deploys on its own at https://redlinemx.mattvalancy.com (site root),
// so it builds from this folder with relative asset paths.
const here = (f) => fileURLToPath(new URL(f, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800, // three.js alone is ~560 kB
    rollupOptions: { input: { index: here('index.html'), showroom: here('showroom.html') } },
  },
});
