import { test } from '../../shared/testing/ai.js';

// The AD-07 rides on the shared suspension model (shared/lib/suspension.js):
// the armored body squats under the turbine, dives under braking, then settles.
test('ASHDRIVE suspension squats, dives and settles', async ({ page, ai }) => {
  await ai.step('boot and deploy', async () => {
    await page.goto('/apps/ashdrive/');
    await ai.waitFor((s) => s.ready && s.frames > 5, { message: 'boot' });
    await page.getByRole('button', { name: 'DEPLOY BIKE' }).click();
    await ai.waitFor((s) => s.mode === 'playing' && s.suspension, { message: 'playing' });
  });
  await ai.step('at rest the body sits at sag, level', async () => {
    const s = await ai.waitFor((s) => Math.abs(s.suspension.pitch) < 0.01 && Math.abs(s.suspension.heave) < 0.01, { timeout: 5_000, message: 'settled on spawn' });
    await ai.check('front compression at sag', s.suspension.front.compression, (c) => c > 0.2 && c < 0.4);
    await ai.check('body level', s.suspension.pitch, (p) => Math.abs(p) < 0.01);
  });
  await ai.step('turbine throttle squats the rear', async () => {
    await page.keyboard.down('w');
    await page.keyboard.down('ShiftLeft');
    const s = await ai.waitFor((s) => s.suspension.pitch > 0.01, { timeout: 5_000, message: 'squat' });
    await ai.check('nose lifts', s.suspension.pitch, (p) => p > 0.01);
    await page.waitForTimeout(800);
  });
  await ai.step('braking dives the nose', async () => {
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('w');
    await page.keyboard.down('s');
    const s = await ai.waitFor((s) => s.suspension.pitch < -0.01, { timeout: 5_000, message: 'dive' });
    await ai.check('nose dives', s.suspension.pitch, (p) => p < -0.01);
    await ai.check('fork compressed past sag (0.3)', s.suspension.front.compression, (c) => c > 0.32);
    await page.keyboard.up('s');
  });
  await ai.step('coasting, it settles back to level', async () => {
    const s = await ai.waitFor((s) => Math.abs(s.speed) < 1 && Math.abs(s.suspension.pitch) < 0.01, { timeout: 15_000, message: 'settle' });
    await ai.check('body level again', s.suspension.pitch, (p) => Math.abs(p) < 0.01);
  });
  await ai.snap('settled');
});
