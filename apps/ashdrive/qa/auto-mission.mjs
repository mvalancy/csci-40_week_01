import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { installOverlay } from '../../../shared/testing/overlay.js';

const directory = '/tmp/ashdrive-auto-mission';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chromium', args: ['--window-position=968,0', '--window-size=904,1040', '--ozone-platform=x11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 888, height: 930 } });
const errors = [], samples = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(installOverlay);
await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
try {
  await page.goto('http://localhost:5173/apps/ashdrive/');
  await page.waitForFunction(() => window.__app?.ready, { timeout: 90000 });
  console.log('GPU', await page.evaluate(() => {
    if (window.__app.backend === 'WebGPU') return 'Native WebGPU';
    const gl = document.querySelector('canvas.webgl').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
  }));
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) if (element.childNodes.length === 1 && element.firstChild.nodeType === 3 && element.textContent.includes('CLAUDE IS TESTING')) element.textContent = element.textContent.replace('CLAUDE IS TESTING', 'CODEX IS TESTING');
    window.__aiOverlay?.step('CODEX / adaptive graphics and autonomous mission', 1);
  });
  await page.getByRole('button', { name: 'AUTONOMOUS SORTIE' }).click();
  for (const quality of ['low', 'high', 'auto']) {
    await page.getByRole('combobox', { name: 'Graphics quality' }).selectOption(quality);
    await page.waitForFunction(quality => window.__app.quality?.mode === quality, quality);
    console.log('QUALITY', await page.evaluate(() => window.__app.quality));
  }
  for (let second = 10; second <= 120; second += 10) {
    await page.waitForTimeout(10000);
    const sample = await page.evaluate(() => {
      const s = window.__app;
      return { mode: s.mode, health: s.health, kills: s.kills, mission: s.mission, x: s.x, y: s.y, z: s.z, heading: s.heading, speed: s.speed, quality: s.quality, fps: s.fps, backend: s.backend, enemies: s.enemies, targets: s.targets };
    });
    sample.second = second; samples.push(sample);
    console.log(JSON.stringify(sample));
    await writeFile(`${directory}/telemetry.json`, JSON.stringify({ samples, errors }, null, 2));
    await page.screenshot({ path: `${directory}/mission-${second}s.png` });
    if (['over', 'victory'].includes(sample.mode)) break;
  }
  console.log('ERRORS', JSON.stringify(errors));
} finally { await browser.close(); }
