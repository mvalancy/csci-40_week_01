import { test, expect } from '../../shared/testing/ai.js';

test.describe.configure({ mode: 'serial' });

async function boot(page, ai) {
  // Other agents are editing neighboring apps during this live code-off.
  await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/apps/ashdrive/');
  await ai.waitFor(s => s.ready && s.frames > 3, { timeout: 90000, message: 'combat renderer ready' });
  await brandOverlay(page);
}

async function brandOverlay(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      if (element.childNodes.length === 1 && element.firstChild.nodeType === 3 && element.textContent.includes('CLAUDE IS TESTING')) element.textContent = element.textContent.replace('CLAUDE IS TESTING', 'CODEX IS TESTING');
    }
  });
}

test.afterEach(async ({ page }) => {
  for (const key of ['w', 'a', 's', 'd', 'Space', 'Shift', 'q', 'e', 'c']) await page.keyboard.up(key).catch(() => {});
  await page.mouse.up().catch(() => {});
});

test('CODEX guided rockets, EMP, camera modes, and reload reset', async ({ page, ai }) => {
  test.setTimeout(240000);
  await ai.step('CODEX / initialize manual weapons trial', async () => {
    await boot(page, ai);
    await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
    await ai.waitFor(s => s.mode === 'playing' && s.enemies > 0);
  });
  await ai.step('CODEX / graphics quality overrides return to automatic mode', async () => {
    for (const quality of ['low', 'high', 'auto']) {
      await page.getByRole('combobox', { name: 'Graphics quality' }).selectOption(quality);
      const state = await ai.waitFor(s => s.quality?.mode === quality, { message: `${quality} graphics selected` });
      if (quality !== 'auto') expect(state.quality.tier).toBe(quality);
    }
  });
  await ai.step('CODEX / cycle chase, cockpit, and tactical camera', async () => {
    for (const camera of ['cockpit', 'tactical', 'chase']) {
      await ai.tap('c');
      await ai.waitFor(s => s.camera === camera, { message: `${camera} camera selected` });
    }
  });
  await ai.step('CODEX / guided missile destroys a hunter without cannon fire', async () => {
    const before = await ai.state();
    await ai.tap('q');
    const launched = await ai.waitFor(s => s.missilesFired === before.missilesFired + 1, { message: 'rocket launches from rack' });
    expect(launched.missiles).toBe(before.missiles - 1);
    expect(launched.shots).toBe(before.shots + 1);
    await ai.waitFor(s => s.kills > before.kills, { timeout: 60000, message: 'guided rocket hits a hunter' });
  });
  await ai.step('CODEX / EMP destroys nearby hunters and cannot be spammed', async () => {
    const before = await ai.waitFor(s => s.targets?.some(target => target.health <= 4 && Math.hypot(target.x - s.x, target.y - s.y, target.z - s.z) < 30), { timeout: 45000, message: 'hunter enters EMP radius' });
    await ai.tap('e');
    const fired = await ai.waitFor(s => s.empUses === before.empUses + 1, { message: 'EMP fired' });
    expect(fired.empCooldown).toBeGreaterThan(0);
    await ai.waitFor(s => s.kills > before.kills, { timeout: 15000, message: 'nearby hunter disabled by EMP' });
    await ai.tap('e');
    expect((await ai.state()).empUses).toBe(fired.empUses);
    await ai.snap('04-missile-emp-combat');
  });
  await ai.step('CODEX / reload begins a fresh remote deployment', async () => {
    await page.reload();
    await ai.waitFor(s => s.ready && s.mode === 'menu', { timeout: 90000 });
    await brandOverlay(page);
    await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
    const fresh = await ai.waitFor(s => s.mode === 'playing');
    expect(fresh.health).toBe(100);
    expect(fresh.score).toBe(0);
    expect(fresh.kills).toBe(0);
    expect(fresh.missiles).toBe(8);
    expect(fresh.missilesFired).toBe(0);
    expect(fresh.empUses).toBe(0);
    expect(fresh.empCooldown).toBe(0);
    expect(fresh.camera).toBe('chase');
  });
  await ai.step('CODEX / tactical map opens and closes through the controls', async () => {
    await page.getByRole('button', { name: 'Open tactical map' }).click();
    const dialog = page.getByRole('dialog', { name: 'Shadow Sector tactical map' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('canvas')).toBeVisible();
    await expect(dialog.locator('.cb-map-objectives li')).toHaveCount(3);
    await ai.snap('06-tactical-map');
    await page.getByRole('button', { name: 'Close tactical map' }).click();
    await expect(dialog).toBeHidden();
  });
});

test('CODEX mobile controls drive, steer, fire, and boost at 390 by 844', async ({ page, ai }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await ai.step('CODEX / mobile deployment', async () => {
    await boot(page, ai);
    await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
    await ai.waitFor(s => s.mode === 'playing');
    await expect(page.locator('#touch')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
  async function holdButton(name, predicate, message) {
    const button = page.getByRole('button', { name, exact: true });
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    try { return await ai.waitFor(predicate, { timeout: 45000, message }); }
    finally { await page.mouse.up(); }
  }
  await ai.step('CODEX / on-screen throttle drives the bike', async () => {
    const before = await ai.state();
    const after = await holdButton('GO', s => s.z < before.z - 5 && s.speed > 10, 'mobile throttle advances bike');
    expect(after.z).toBeLessThan(before.z);
  });
  await ai.step('CODEX / on-screen steering changes heading', async () => {
    const before = await ai.state();
    await holdButton('Steer left', s => s.heading > before.heading + .3, 'mobile steering turns bike');
  });
  await ai.step('CODEX / on-screen cannon launches projectiles', async () => {
    const before = await ai.state();
    await holdButton('FIRE', s => s.shots >= before.shots + 3, 'mobile cannon fires');
  });
  await ai.step('CODEX / boost button works while throttle is engaged', async () => {
    // A physical keyboard throttle combines with the pointer-operated boost,
    // exercising the same shared input state as simultaneous touch pointers.
    await page.keyboard.down('w');
    try { await holdButton('BOOST', s => s.boosted && s.energy < 95, 'mobile boost drains energy'); }
    finally { await page.keyboard.up('w'); }
  });
  await ai.expectCanvasAlive('canvas.webgl');
  await ai.snap('05-mobile-controls');
});
