import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installOverlay } from '../../../shared/testing/overlay.js';

const url = process.env.ASHDRIVE_URL || 'http://localhost:4175/';
const output = process.env.ASHDRIVE_OUTPUT || '/tmp/ashdrive-final';
const missionTimeout = Number(process.env.ASHDRIVE_TIMEOUT_MS || 240000);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chromium', args: ['--window-position=968,0', '--window-size=904,1040', '--ozone-platform=x11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 888, height: 930 } });
const errors = [], samples = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(installOverlay);
await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
const state = () => page.evaluate(() => window.__app);
const photo = name => page.screenshot({ path: `${output}/${name}.png`, style: '#__ai-overlay { display: none !important; }' });
async function persist() { await writeFile(`${output}/telemetry.json`, JSON.stringify({ url, samples, errors }, null, 2)); }
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__app?.ready && window.__app.frames > 20, undefined, { timeout: 90000 });
  await page.evaluate(() => {
    document.querySelector('#__ai-overlay .who').textContent = 'CODEX IS TESTING';
    window.__aiOverlay?.step('ASHDRIVE / production mission and free exploration', 1);
  });
  console.log('GPU', await page.evaluate(() => {
    if (window.__app.backend === 'WebGPU') return 'Native WebGPU';
    const gl = document.querySelector('canvas.webgl').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
  }));
  await photo('01-title');
  await page.getByRole('button', { name: 'AUTONOMOUS SORTIE' }).click();
  const began = Date.now();
  let combatShot = false, lockShot = false, chargeShot = false, latest;
  while (Date.now() - began < missionTimeout) {
    await page.waitForTimeout(5000);
    latest = await state();
    const sample = { second: Math.round((Date.now() - began) / 1000), mode: latest.mode, health: latest.health, kills: latest.kills, mission: latest.mission, quality: latest.quality, fps: latest.fps, metrics: latest.performance, lock: latest.lock, x: latest.x, y: latest.y, z: latest.z };
    samples.push(sample); console.log(JSON.stringify(sample)); await persist();
    if (!combatShot && latest.kills > 0) { await photo('02-combat'); combatShot = true; }
    if (!lockShot && latest.lock) { await photo('02-target-lock'); lockShot = true; }
    if (!chargeShot && latest.targets?.some(target => target.cooldown > 0 && target.cooldown < .65)) { await photo('02-enemy-charge'); chargeShot = true; }
    if (latest.mode === 'victory' || latest.mode === 'over') break;
  }
  assert.equal(latest.mode, 'victory', 'autonomous mission must reach extraction alive');
  assert.equal(latest.mission.recovered, 3);
  assert.equal(latest.mission.complete, true);
  await photo('03-victory');
  await page.getByRole('button', { name: 'KEEP EXPLORING' }).click();
  await page.waitForFunction(() => window.__app.mode === 'playing' && window.__app.freeRoam && !window.__app.autopilot);
  const beforeDrive = await state();
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(before => Math.hypot(window.__app.x - before.x, window.__app.z - before.z) > 5, beforeDrive, { timeout: 30000 });
  } finally { await page.keyboard.up('w'); }
  console.log('MANUAL DRIVE', await state());
  await page.keyboard.press('Tab');
  await page.getByRole('dialog', { name: 'Shadow Sector tactical map' }).waitFor({ state: 'visible' });
  await photo('04-secured-map');
  await page.keyboard.press('Tab');
  await page.getByRole('dialog', { name: 'Shadow Sector tactical map' }).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__app.mode === 'playing');
  const beforeRocket = await state();
  assert.ok(beforeRocket.missiles > 0, 'field resupply leaves missiles for exploration');
  await page.keyboard.press('q');
  await page.waitForFunction(count => window.__app.missilesFired === count + 1, beforeRocket.missilesFired);
  await page.waitForFunction(() => window.__app.empCooldown === 0, undefined, { timeout: 45000 });
  const beforeEmp = await state();
  await page.keyboard.press('e');
  await page.waitForFunction(count => window.__app.empUses === count + 1, beforeEmp.empUses);
  const final = await state();
  assert.equal(final.autopilot, false);
  assert.equal(final.freeRoam, true);
  assert.equal(final.mode, 'playing');
  await photo('05-free-exploration');
  await page.keyboard.press('p');
  await page.locator('#pause-menu').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#resume-game').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#pause-hangar').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#resume-game').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#pause-hangar').evaluate(el => el === document.activeElement), true);
  await photo('06-pause-keyboard');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__app.mode === 'playing');
  assert.deepEqual(errors, [], 'browser remains free of errors');
  samples.push({ final }); await persist();
  console.log('PASS: production mission, all intel, extraction, manual free exploration, tactical map, rockets, EMP.');
} catch (error) {
  await photo('failure').catch(() => {}); await persist(); throw error;
} finally {
  await page.keyboard.up('w').catch(() => {});
  await browser.close();
}
