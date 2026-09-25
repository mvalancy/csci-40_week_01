import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { installOverlay } from '../../../shared/testing/overlay.js';

const output = '/tmp/ashdrive-explore';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chromium', args: ['--window-position=968,0', '--window-size=904,1040', '--ozone-platform=x11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 888, height: 930 } });
const errors = [], samples = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(installOverlay);
await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
async function label(text) {
  await page.evaluate(text => {
    for (const element of document.querySelectorAll('*')) if (element.childNodes.length === 1 && element.firstChild.nodeType === 3 && element.textContent.includes('CLAUDE IS TESTING')) element.textContent = element.textContent.replace('CLAUDE IS TESTING', 'CODEX IS TESTING');
    window.__aiOverlay?.step(text, 1);
  }, text);
}
async function snapshot(name) {
  const state = await page.evaluate(() => window.__app);
  const sample = { name, mode: state.mode, health: state.health, kills: state.kills, wave: state.wave, mission: state.mission, fps: state.fps, backend: state.backend, x: state.x, y: state.y, z: state.z, heading: state.heading, missiles: state.missiles, targets: state.targets };
  samples.push(sample); console.log(JSON.stringify(sample));
  await writeFile(`${output}/telemetry.json`, JSON.stringify({ samples, errors }, null, 2));
  await page.screenshot({ path: `${output}/${name}.png` });
}
try {
  await page.goto('http://localhost:5173/apps/ashdrive/');
  await page.waitForFunction(() => window.__app?.ready, { timeout: 90000 });
  await label('CODEX / live autonomous combat observation');
  await page.getByRole('button', { name: 'AUTONOMOUS SORTIE' }).click();
  for (let n = 1; n <= 6; n++) {
    await page.waitForTimeout(15000);
    await snapshot(`autopilot-${n * 15}s`);
  }
  await page.reload();
  await page.waitForFunction(() => window.__app?.ready, { timeout: 90000 });
  await label('CODEX / manual industrial district patrol');
  await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => window.__app.heading > 1.5, { timeout: 15000 });
  await page.keyboard.up('a');
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w'); await page.keyboard.up('Space');
  await snapshot('manual-ground-refinery');
  await page.keyboard.press('q'); await page.keyboard.press('e');
  await page.keyboard.press('c');
  await label('CODEX / cockpit weapon systems and ground cover');
  await page.waitForTimeout(10000); await snapshot('manual-cockpit');
  await page.keyboard.press('c');
  await label('CODEX / tactical camera and hunter pursuit');
  await page.keyboard.down('d');
  await page.waitForFunction(() => window.__app.heading < .2, { timeout: 15000 });
  await page.keyboard.up('d');
  await page.keyboard.down('w'); await page.keyboard.down('Space');
  await page.waitForTimeout(4000); await page.keyboard.up('w'); await page.keyboard.up('Space');
  await page.waitForTimeout(5000); await snapshot('manual-tactical');
  await page.keyboard.press('c');
  await label('CODEX / sustained combat and damage feedback');
  for (let n = 1; n <= 3; n++) {
    await page.keyboard.press('q');
    await page.keyboard.down('Space'); await page.waitForTimeout(10000); await page.keyboard.up('Space');
    await snapshot(`manual-combat-${n}`);
  }
  await writeFile(`${output}/telemetry.json`, JSON.stringify({ samples, errors }, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  for (const key of ['w', 'a', 'd', 'Space', 'Shift']) await page.keyboard.up(key).catch(() => {});
  await browser.close();
}
