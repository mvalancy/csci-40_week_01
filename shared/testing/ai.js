// The `ai` test fixture. Import { test, expect } from here instead of
// '@playwright/test' and every test gets:
//   - the on-screen "CLAUDE IS TESTING" overlay
//   - ai.step(name, fn)        named step, shown in the banner + report
//   - ai.check(label, value, predicate)  assertion that flashes a toast
//   - ai.hold(key, ms)         hold a key down (games!)
//   - ai.tap(key)              quick press
//   - ai.state()               read window.__app (the app's test hook)
//   - ai.waitFor(fn, opts)     wait until fn(state) is truthy
//   - ai.expectCanvasAlive()   proves WebGL/canvas is really drawing pixels
//   - ai.snap(name)            screenshot attached to the HTML report
// Console errors and uncaught exceptions fail the test automatically.
import { test as base, expect } from '@playwright/test';
import { installOverlay } from './overlay.js';

export { expect };

export const test = base.extend({
  ai: async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      // 404s are reported below with their URL, which is more useful.
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console.error: ${m.text()}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    await page.addInitScript(installOverlay);
    // Swallow Vite's hot-reload socket: any file edit anywhere (by you or
    // another agent) makes Vite reload every open page, which would reset
    // the app mid-test. Tests always load the code fresh anyway.
    await page.routeWebSocket(/^ws:\/\/localhost:\d+\/(\?.*)?$/, () => {});

    let n = 0;
    const overlay = (fn, ...args) =>
      page.evaluate(([fn, args]) => window.__aiOverlay?.[fn](...args), [fn, args]).catch(() => {});

    const ai = {
      async step(name, fn) {
        n += 1;
        return base.step(name, async () => {
          await overlay('step', name, n);
          return fn();
        });
      },

      async check(label, value, predicate = Boolean) {
        const ok = !!predicate(value);
        const shown = typeof value === 'number' ? value.toFixed(2) : JSON.stringify(value);
        await overlay('toast', `${label}  (${shown})`, ok ? 'pass' : 'fail');
        expect(ok, `${label} — got ${shown}`).toBe(true);
        return value;
      },

      say: (text) => overlay('toast', text, 'info'),

      async hold(key, ms) {
        await page.keyboard.down(key);
        await page.waitForTimeout(ms);
        await page.keyboard.up(key);
      },

      async tap(key) {
        await page.keyboard.down(key);
        await page.waitForTimeout(90);
        await page.keyboard.up(key);
      },

      // Returns null (instead of throwing) while the page is navigating/reloading.
      state: (hook = '__app') => page.evaluate((h) => {
        const s = window[h];
        return s ? JSON.parse(JSON.stringify(typeof s.snapshot === 'function' ? s.snapshot() : s)) : null;
      }, hook).catch(() => null),

      async waitFor(fn, { timeout = 15_000, hook = '__app', message = 'condition' } = {}) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const s = await ai.state(hook);
          if (s && fn(s)) return s;
          await page.waitForTimeout(50);
        }
        throw new Error(`Timed out after ${timeout}ms waiting for ${message}`);
      },

      // Screenshot the page and count distinct colours inside the canvas.
      // A blank/black/crashed WebGL canvas has ~1 colour; a real scene has hundreds.
      async expectCanvasAlive(selector = 'canvas', minColors = 50) {
        const canvas = page.locator(selector).first();
        await expect(canvas).toBeVisible();
        const png = await canvas.screenshot();
        const colors = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4 * 7) seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
          return seen.size;
        }, png.toString('base64'));
        return ai.check(`canvas is rendering (${colors} colours)`, colors, (c) => c >= minColors);
      },

      async snap(name) {
        await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
      },
    };

    await use(ai);

    if (process.env.SHOW) {
      await overlay('step', errors.length ? 'found errors ✗' : 'all checks passed ✓', n);
      await page.waitForTimeout(1200); // let the audience see the final state
    }
    expect(errors, 'browser console errors').toEqual([]);
  },
});
