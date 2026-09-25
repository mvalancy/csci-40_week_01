import { defineConfig } from '@playwright/test';

// SHOW=1 opens a real, visible browser window and slows every action down
// so the class can watch the AI test its own code.
const SHOW = !!process.env.SHOW;
// APP=<slug> scopes the run to apps/<slug>/ and gives it its own output
// folders, so several agents can test different apps at the same time.
const APP = process.env.APP;
const out = APP || '_all';
// Headed windows get half the screen each: Claude on the LEFT (default),
// Codex / a second agent on the RIGHT with SIDE=right.
const SCREEN_W = +(process.env.SCREEN_W || 1920);
const SCREEN_H = +(process.env.SCREEN_H || 1080);
const HALF = Math.floor(SCREEN_W / 2);
const WIN_W = HALF - 56; // margin for a side dock so windows never cross the midline
const RIGHT = process.env.SIDE === 'right';
const WIN_X = RIGHT ? HALF + 8 : 0;
// Each side gets its own dev server so one agent's restarts/reloads
// never hit the other agent's pages mid-test.
const PORT = +(process.env.PORT || (RIGHT ? 5174 : 5173));

export default defineConfig({
  testDir: APP ? `apps/${APP}` : '.',
  testMatch: APP ? '**/*.spec.js' : ['apps/**/*.spec.js', 'shared/**/*.spec.js'],
  testIgnore: '**/node_modules/**',
  outputDir: `test-results/${out}`,
  timeout: 120_000,
  fullyParallel: !SHOW,
  workers: SHOW ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: `playwright-report/${out}` }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Fits inside a half-screen window (browser chrome takes ~100px).
    viewport: SHOW ? { width: WIN_W - 16, height: SCREEN_H - 150 } : { width: 1280, height: 720 },
    headless: !SHOW,
    // Full Chromium ("new headless") can use the real GPU; the default
    // headless shell falls back to software WebGL at ~2 fps.
    channel: 'chromium',
    screenshot: 'on',
    video: SHOW ? 'on' : 'retain-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      slowMo: SHOW ? 120 : 0,
      args: [
        `--window-size=${WIN_W},${SCREEN_H - 40}`,
        `--window-position=${WIN_X},0`,
        '--ozone-platform=x11', // Wayland ignores window positions; X11 honours them
        '--autoplay-policy=no-user-gesture-required',
        '--ignore-gpu-blocklist',
        '--enable-unsafe-swiftshader', // software WebGL fallback if there is no GPU
        ...(SHOW ? [] : ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan']),
      ],
    },
  },
  // Reused if already running on this port.
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
