import { test, expect } from '../../shared/testing/ai.js';

test('ASHDRIVE drives, fires, boosts, pauses, and battles', async ({ page, ai }) => {
  await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await ai.step('CODEX / boot armored combat district', async () => {
    await page.goto('/apps/ashdrive/');
    await ai.waitFor(s => s.ready && s.frames > 5);
    await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.childNodes.length === 1 && el.firstChild.nodeType === 3 && el.textContent.includes('CLAUDE IS TESTING')) el.textContent = el.textContent.replace('CLAUDE IS TESTING', 'CODEX IS TESTING'); });
  });
  await ai.step('CODEX / inspect rendered city', () => ai.expectCanvasAlive('canvas.webgl'));
  await ai.snap('01-title');
  await ai.step('CODEX / deploy armored bike', async () => {
    await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
    await ai.waitFor(s => s.mode === 'playing');
    await expect(page.locator('#menu')).toBeHidden();
  });
  await ai.step('CODEX / throttle and 30 mm autocannons', async () => {
    const before = await ai.state();
    await page.keyboard.down('Space');
    await page.keyboard.down('w');
    try { await ai.waitFor(s => s.shots > before.shots + 2 && s.z < before.z - 5, { timeout: 30000, message: 'throttle and cannon respond' }); }
    finally { await page.keyboard.up('w'); await page.keyboard.up('Space'); }
    const s = await ai.state();
    expect(s.shots).toBeGreaterThan(2);
    expect(s.z).toBeLessThan(before.z - 5);
  });
  await ai.step('CODEX / test afterburner and steering', async () => {
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
    await page.keyboard.down('a');
    await ai.waitFor(s => s.heading > .65, { message: 'steering turns bike' });
    await page.keyboard.up('a');
    const s = await ai.state();
    expect(s.energy).toBeLessThan(100);
    expect(s.heading).toBeGreaterThan(.3);
    await page.keyboard.up('Shift');
    await page.keyboard.up('w');
  });
  await ai.step('CODEX / pause freezes simulation', async () => {
    await ai.tap('p');
    const before = await ai.state();
    expect(before.mode).toBe('paused');
    await page.waitForTimeout(400);
    const after = await ai.state();
    expect(after.x).toBe(before.x);
    expect(after.health).toBe(before.health);
    await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible();
    await expect(page.locator('#quality-status')).toContainText('PAUSED');
    await ai.waitFor(s => s.performance?.rendered === false && s.performance.drawCalls === 0, { message: 'paused scene stops drawing' });
    await ai.tap('p');
    await expect(page.getByRole('button', { name: 'Pause game' })).toBeVisible();
  });
  await ai.step('CODEX / keyboard and button audio indicators stay synchronized', async () => {
    await ai.tap('m');
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toHaveText('MUTED');
    await page.getByRole('button', { name: 'Toggle sound' }).click();
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toHaveText('SOUND');
  });
  await ai.step('CODEX / pause menu returns to hangar and redeploys cleanly', async () => {
    await ai.tap('p');
    const pause = page.getByRole('dialog', { name: 'Pause menu' });
    await expect(pause).toBeVisible();
    await pause.getByRole('button', { name: 'RETURN TO HANGAR' }).click();
    await ai.waitFor(s => s.mode === 'menu');
    await expect(pause).toBeHidden();
    await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
    const reset = await ai.waitFor(s => s.mode === 'playing');
    expect(reset.health).toBe(100); expect(reset.missiles).toBe(8);
  });
  await ai.snap('02-combat');
  await ai.step('CODEX / autopilot earns a takedown', async () => {
    await page.reload();
    await ai.waitFor(s => s.ready);
    await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.childNodes.length === 1 && el.firstChild.nodeType === 3 && el.textContent.includes('CLAUDE IS TESTING')) el.textContent = el.textContent.replace('CLAUDE IS TESTING', 'CODEX IS TESTING'); });
    await page.getByRole('button', { name: 'AUTONOMOUS SORTIE' }).click();
    await ai.waitFor(s => s.kills > 0, { timeout: 45000, message: 'autopilot combat kill' });
    expect((await ai.state()).score).toBeGreaterThan(0);
  });
  await ai.snap('03-autopilot');
});
