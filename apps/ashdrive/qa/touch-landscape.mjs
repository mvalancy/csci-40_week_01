import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installOverlay } from '../../../shared/testing/overlay.js';
const output = '/tmp/ashdrive-touch-landscape';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chromium', args: ['--window-position=968,0', '--window-size=904,1040', '--ozone-platform=x11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await context.newPage(), errors = [], samples = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(installOverlay);
const photo = name => page.screenshot({ path: `${output}/${name}.png`, style: '#__ai-overlay {display:none!important}' });
const cdp = await context.newCDPSession(page);
async function inside(locator) {
  const b = await locator.boundingBox(); assert.ok(b, 'control visible');
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 845 && b.y + b.height <= 391, `control inside landscape viewport: ${JSON.stringify(b)}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function hold(locator, predicate) {
  const point = await inside(locator);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  try { await page.waitForFunction(predicate, undefined, { timeout: 30000 }); }
  finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
}
try {
  await page.goto((process.env.ASHDRIVE_URL || 'http://localhost:4175/') + '?renderer=webgl&quality=low');
  await page.waitForFunction(() => window.__app?.ready, undefined, { timeout: 90000 });
  await page.evaluate(() => { document.querySelector('#__ai-overlay .who').textContent = 'CODEX IS TESTING'; window.__aiOverlay?.step('ASHDRIVE / touch phone landscape', 1); });
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  await inside(page.locator('#start')); await inside(page.locator('#demo'));
  await photo('01-landscape-menu');
  await page.locator('#start').tap();
  await page.waitForFunction(() => window.__app.mode === 'playing');
  for (const button of await page.locator('#touch button').all()) await inside(button);
  await hold(page.getByRole('button', { name: 'GO', exact: true }), () => window.__app.speed > 10 && window.__app.z < 170);
  await hold(page.getByRole('button', { name: 'FIRE', exact: true }), () => window.__app.shots >= 3);
  await photo('02-landscape-driving'); samples.push(await page.evaluate(() => window.__app));
  await page.locator('#pause-toggle').tap();
  await page.locator('#pause-menu').waitFor({ state: 'visible' });
  await inside(page.locator('#resume-game')); await inside(page.locator('#pause-hangar'));
  await photo('03-landscape-pause');
  await page.locator('#pause-hangar').tap();
  await page.waitForFunction(() => window.__app.mode === 'menu');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#start').tap();
  await page.locator('#pause-toggle').tap();
  await page.locator('#pause-menu').waitFor({ state: 'visible' });
  await photo('04-portrait-pause');
  await page.locator('#resume-game').tap();
  await page.waitForFunction(() => window.__app.mode === 'playing');
  assert.deepEqual(errors, []);
  console.log('PASS: landscape menu, all8 touch controls, real touch throttle and cannon, pause/hangar, rotation and portrait pause.');
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ errors, samples }, null, 2));
  await browser.close();
}
