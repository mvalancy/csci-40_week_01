import { test, expect } from '../../shared/testing/ai.js';

async function open(page, ai) {
  await page.goto('/apps/tower-smash/');
  await ai.waitFor((s) => s.ready && s.total > 0, { message: 'towers built' });
}

// Glide the (visible) cursor to a point and click it like a person would.
async function shoot(page, x, y) {
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.down();
  await page.mouse.up();
}

const targets = (page) => page.evaluate(() => window.__app.debug.targets());

test.describe('Tower Smash', () => {
  test('1 · island, towers and bloom render', async ({ page, ai }) => {
    await ai.step('load', () => open(page, ai));
    await ai.step('canvas is drawing', () => ai.expectCanvasAlive('canvas', 80));
    await ai.step('level 1 is set up', async () => {
      const s = await ai.state();
      await ai.check('planks in the tower', s.total, (n) => n >= 20);
      await ai.check('ammo loaded', s.ammo, (a) => a === 6);
      await expect(page.locator('.ammo i')).toHaveCount(6);
    });
    await ai.snap('level-1');
  });

  test('2 · a click fires a cannonball, a drag orbits instead', async ({ page, ai }) => {
    await open(page, ai);
    const { width, height } = page.viewportSize();
    await ai.step('drag to orbit — no shot', async () => {
      await page.mouse.move(width * 0.3, height * 0.6);
      await page.mouse.down();
      await page.mouse.move(width * 0.5, height * 0.55, { steps: 25 });
      await page.mouse.up();
      await ai.check('no shots fired by a drag', (await ai.state()).shots, (n) => n === 0);
    });
    await ai.step('click fires', async () => {
      const [t] = await targets(page);
      await shoot(page, t.x, t.y);
      const s = await ai.waitFor((s) => s.shots === 1, { message: 'shot' });
      await ai.check('ammo used', s.ammo, (a) => a === 5);
    });
    await ai.step('the ball hits the tower', async () => {
      const s = await ai.waitFor((s) => s.knocked > 0, { timeout: 5000, message: 'planks knocked' });
      await ai.check('planks knocked loose', s.knocked, (n) => n > 0);
    });
  });

  test('3 · Claude clears levels 1 and 2 by aiming at tower bases', async ({ page, ai }) => {
    test.setTimeout(150_000);
    await open(page, ai);
    for (const lvl of [1, 2]) {
      await ai.step(`level ${lvl}: smash 70%`, async () => {
        await ai.waitFor((s) => s.level === lvl && s.state === 'aiming', { timeout: 8000, message: `level ${lvl}` });
        while (true) {
          const s = await ai.state();
          if (s.state !== 'aiming') break;
          if (s.ammo === 0) { await page.waitForTimeout(200); continue; }
          const ts = await targets(page);
          if (!ts.length) { await page.waitForTimeout(200); continue; }
          const t = ts[s.shots % ts.length];
          await shoot(page, t.x, t.y);
          await ai.say(`shot ${s.shots + 1} → ${Math.round(s.progress * 100)}% smashed`);
          await page.waitForTimeout(900);
        }
        const s = await ai.waitFor((s) => s.state !== 'aiming', { message: 'level outcome' });
        await ai.check(`level ${lvl} cleared`, s.state, (v) => v === 'cleared');
        await expect(page.locator('#banner')).toContainText('LEVEL CLEAR');
      });
    }
    await ai.step('level 3 loads with more towers', async () => {
      const s = await ai.waitFor((s) => s.level === 3 && s.state === 'aiming', { message: 'level 3' });
      await ai.check('level 3 planks', s.total, (n) => n > 60);
    });
    await ai.snap('level-3');
  });

  test('4 · wasting all ammo → OUT OF AMMO → R retries', async ({ page, ai }) => {
    await open(page, ai);
    const { width } = page.viewportSize();
    await ai.step('fire every ball into the sky', async () => {
      for (let i = 0; i < 6; i++) await shoot(page, width * (0.15 + i * 0.13), 40);
      await ai.check('ammo empty', (await ai.state()).ammo, (a) => a === 0);
    });
    await ai.step('game over banner', async () => {
      const s = await ai.waitFor((s) => s.state === 'failed', { timeout: 12000, message: 'out of ammo' });
      await ai.check('state failed', s.state, (v) => v === 'failed');
      await expect(page.locator('#banner')).toContainText('OUT OF AMMO');
    });
    await ai.step('R rebuilds the level', async () => {
      await ai.tap('r');
      const s = await ai.state();
      await ai.check('ammo refilled', s.ammo, (a) => a === 6);
      await ai.check('towers standing again', s.knocked, (n) => n === 0);
    });
  });
});
