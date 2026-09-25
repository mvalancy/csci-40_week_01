import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const webgl = process.argv.includes('--webgl');
const output = `/tmp/ashdrive-${webgl ? 'webgl' : 'native'}-quality`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chromium', args: ['--window-position=968,0', '--window-size=904,1040', '--ozone-platform=x11', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 888, height: 930 } });
const errors = [], samples = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto((process.env.ASHDRIVE_URL || 'http://localhost:4175/') + '?quality=low' + (webgl ? '&renderer=webgl' : ''));
  await page.waitForFunction(() => window.__app?.ready, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__app.backend), webgl ? 'WebGL 2' : 'WebGPU');
  await page.getByRole('button', { name: 'AUTONOMOUS SORTIE' }).click();
  for (const tier of ['high', 'ultra', 'low', 'high', 'auto']) {
    await page.locator('select').selectOption(tier);
    const start = await page.evaluate(() => window.__app.frames);
    await page.waitForFunction(frames => window.__app.frames > frames + 30, start, { timeout: 90000 });
    const state = await page.evaluate(() => window.__app);
    samples.push({ selected: tier, backend: state.backend, frames: state.frames, fps: state.fps, quality: state.quality, performance: state.performance });
    await page.screenshot({ path: `${output}/${tier}-${samples.length}.png` });
    console.log(JSON.stringify(samples.at(-1)));
  }
  assert.equal(samples.at(-1).performance.gpu?.supported, true, 'Auto enables timestamps after a manual start');
  assert.ok(Number.isFinite(samples.at(-1).performance.gpu?.gpuMs), 'Auto receives a real GPU sample');
  assert.deepEqual(errors, []);
  console.log(`PASS: ${webgl ? 'WebGL 2' : 'native WebGPU'} high, ultra, low, high, auto quality transitions.`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ samples, errors }, null, 2));
  await browser.close();
}
