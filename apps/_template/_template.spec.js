// Template test — `npm run new <name>` copies this to apps/<name>/<name>.spec.js.
import { test, expect } from '../../shared/testing/ai.js';

test('starter scene renders and reacts to clicks', async ({ page, ai }) => {
  await ai.step('open the app', async () => {
    await page.goto('/apps/_template/');
    await ai.waitFor((s) => s.ready && s.frames > 10, { message: 'first frames' });
  });

  await ai.step('WebGL canvas is drawing', () => ai.expectCanvasAlive());

  await ai.step('click the knot in the middle', async () => {
    const before = await ai.state();
    const { width, height } = page.viewportSize();
    await page.mouse.move(width * 0.2, height * 0.2);
    await page.mouse.move(width / 2, height / 2, { steps: 20 });
    await page.mouse.click(width / 2, height / 2);
    const after = await ai.waitFor((s) => s.clicks > before.clicks, { message: 'click registered' });
    await ai.check('knot changed colour', after.color, (c) => c !== before.color);
  });

  await ai.snap('final');
});
