import { test, expect } from './testing/ai.js';

test('hub lists every app and links work', async ({ page, ai }) => {
  await ai.step('open the hub', () => page.goto('/'));
  await ai.step('every app folder has a card', async () => {
    const n = await page.locator('a.card').count();
    await ai.check('app cards found', n, (c) => c >= 2);
  });
  await ai.step('click through to Excite Bike', async () => {
    const card = page.locator('a.card[data-slug="excite-bike"]');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await card.click();
    await expect(page).toHaveURL(/excite-bike/);
    await ai.waitFor((s) => s.ready);
    await ai.check('game loaded', true);
  });
});
