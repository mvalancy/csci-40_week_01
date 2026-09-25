import { test, expect } from '../../shared/testing/ai.js';

test.describe('Excite Bike 3D', () => {
  test('title screen and 3D world render', async ({ page, ai }) => {
    await ai.step('load the game', async () => {
      await page.goto('/apps/excite-bike/');
      await ai.waitFor((s) => s.ready, { message: 'renderer warm-up' });
    });
    await ai.step('WebGL scene is drawing real pixels', () => ai.expectCanvasAlive('canvas', 200));
    await ai.step('title screen is up', async () => {
      await expect(page.locator('#title h1')).toBeVisible();
      await ai.check('state is "title"', (await ai.state()).state, (s) => s === 'title');
    });
    await ai.snap('title');
  });

  test('Claude races the full track using only the keyboard', async ({ page, ai }) => {
    await page.goto('/apps/excite-bike/');
    await ai.waitFor((s) => s.ready);

    await ai.step('press ENTER → countdown → GO', async () => {
      await ai.tap('Enter');
      await ai.check('countdown started', (await ai.state()).state, (s) => s === 'countdown');
      await ai.waitFor((s) => s.state === 'racing', { message: 'GO!' });
    });

    await ai.step('hold Z — throttle', async () => {
      await page.keyboard.down('z');
      const s = await ai.waitFor((s) => s.player.speed > 20, { message: 'speed > 20' });
      await ai.check('bike is moving fast', s.player.speed, (v) => v > 20);
    });

    await ai.step('tap ↑ — change lanes', async () => {
      const before = (await ai.state()).player.lane;
      await ai.tap('ArrowUp');
      const s = await ai.waitFor((s) => s.player.lane !== before || s.player.airborne === false, { message: 'lane change' });
      await ai.check(`moved from lane ${before}`, s.player.lane, (l) => l !== before);
    });

    await ai.step('hold X — turbo heats the engine', async () => {
      const before = (await ai.state()).player.heat;
      await ai.hold('x', 900);
      await ai.check('engine temp rose', (await ai.state()).player.heat, (h) => h > before + 10);
    });

    await ai.step('drive to the finish: manage heat, lanes & landings', async () => {
      await ai.say('autopilot OFF — Claude is driving');
      const held = new Set(['z']);
      const set = async (key, on) => {
        if (on && !held.has(key)) { held.add(key); await page.keyboard.down(key); }
        if (!on && held.has(key)) { held.delete(key); await page.keyboard.up(key); }
      };
      let last = await ai.state();
      let lastMark = 0;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const s = await ai.state();
        if (!s) throw new Error('game state disappeared (page reloaded?)');
        const p = s.player;
        if (s.state !== 'racing') break;

        // Turbo when cool, back off before overheating.
        await set('x', !p.airborne && p.heat < (held.has('x') ? 70 : 40));
        // In the air: rotate the bike so it matches the ground where we'll land.
        const diff = p.airborne ? p.pitch - s.landingSlope : 0;
        await set('ArrowRight', diff > 0.08);
        await set('ArrowLeft', diff < -0.08);
        // Dodge slower riders and mud.
        const lane = s.laneAhead[p.lane];
        if (!p.airborne && (lane.rival || lane.mud)) {
          const free = [p.lane - 1, p.lane + 1].find((l) => l >= 0 && l < 4 && !s.laneAhead[l].rival && !s.laneAhead[l].mud);
          if (free !== undefined) await ai.tap(free < p.lane ? 'ArrowUp' : 'ArrowDown');
        }

        if (p.perfects > last.player.perfects) await ai.say('perfect landing!');
        if (p.crashes > last.player.crashes) await ai.say('crashed — recovering');
        if (p.overheats > last.player.overheats) await ai.say('overheated — cooling down');
        const mark = Math.floor(p.x / 250);
        if (mark > lastMark) { lastMark = mark; await ai.say(`${Math.round(p.x)}m · place ${s.place} · ${Math.round(p.speed * 3.6)} km/h`); }
        last = s;
        await page.waitForTimeout(16);
      }
      for (const k of [...held]) await page.keyboard.up(k);
    });

    await ai.step('crossed the finish line', async () => {
      const s = await ai.state();
      await ai.check('race finished', s.state, (v) => v === 'finished');
      await ai.check('finish time (s)', s.player.finishTime, (t) => t > 0 && t < 90);
      await ai.check('jumps made', s.player.jumps, (j) => j >= 5);
      await ai.check('finishing place', s.place, (p) => p >= 1 && p <= 4);
      await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
    });
    await ai.snap('results');
  });
});
