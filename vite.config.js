import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Every folder in apps/ with an index.html becomes its own page.
// Nothing to register: `npm run new my-app` and it shows up in the hub.
const apps = readdirSync('apps', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`apps/${d.name}/index.html`))
  .map((d) => d.name);

export default defineConfig({
  server: {
    port: 5173,
    open: false,
    // Test output must not trigger reloads in pages that are mid-test.
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/dist/**'] },
  },
  build: {
    chunkSizeWarningLimit: 800, // three.js alone is ~560 kB
    rollupOptions: {
      input: {
        hub: resolve('index.html'),
        ...Object.fromEntries(apps.map((a) => [a, resolve(`apps/${a}/index.html`)])),
      },
    },
  },
});
