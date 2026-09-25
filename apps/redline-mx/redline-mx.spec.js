// REDLINE MX — one test per game segment, so a headed run
// (`npm run show redline-mx`) walks through every mechanic on screen.
import { test, expect } from '../../shared/testing/ai.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Every test starts from a fresh save file (cleared once per test, not on reloads).
async function openGame(page, ai, query = '') {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fresh')) { localStorage.clear(); sessionStorage.setItem('fresh', '1'); }
  });
  await page.goto(`/apps/redline-mx/${query}`);
  await ai.waitFor((s) => s.ready, { timeout: 60_000, message: 'renderer warm-up' });
}

// title → ENTER → garage → ENTER → race
async function startRace(page, ai, query = '') {
  await openGame(page, ai, query);
  await ai.tap('Enter');
  await ai.waitFor((s) => s.state === 'garage', { message: 'garage' });
  await ai.tap('Enter');
  await ai.waitFor((s) => s.state === 'racing', { timeout: 60_000, message: 'GO!' });
}

const debug = (page, fn, ...args) => page.evaluate(([fn, args]) => window.__app.debug[fn](...args), [fn, args]);

// Hold keys by name; only sends events when the wanted state changes.
function keyHolder(page) {
  const held = new Set();
  return {
    async set(key, on) {
      if (on && !held.has(key)) { held.add(key); await page.keyboard.down(key); }
      if (!on && held.has(key)) { held.delete(key); await page.keyboard.up(key); }
    },
    async releaseAll() { for (const k of [...held]) await this.set(k, false); },
  };
}

// Line the bike up with where it will land.
async function steer(keys, s) {
  const diff = s.player.airborne ? wrap(s.player.pitch - s.landingSlope) : 0;
  await keys.set('ArrowRight', diff > 0.08);
  await keys.set('ArrowLeft', diff < -0.08);
}

test.describe('REDLINE MX', () => {
  test('1 · title screen and 3D world render', async ({ page, ai }) => {
    await ai.step('load the game', () => openGame(page, ai));
    await ai.step('WebGL scene is drawing real pixels', () => ai.expectCanvasAlive('canvas', 200));
    await ai.step('title screen is up', async () => {
      await expect(page.locator('#title h1')).toHaveText('REDLINEMX');
      await ai.check('state is "title"', (await ai.state()).state, (s) => s === 'title');
    });
    await ai.snap('title');
  });

  test('2 · countdown, throttle, lanes', async ({ page, ai }) => {
    await openGame(page, ai);
    await ai.step('ENTER opens the garage, ENTER again starts a 3-2-1 countdown', async () => {
      await ai.tap('Enter');
      await expect(page.locator('#garage')).toBeVisible();
      await ai.tap('Enter');
      await ai.check('countdown started', (await ai.state()).state, (s) => s === 'countdown');
      await expect(page.locator('#hud')).toBeVisible();
    });
    await ai.step('riders are held on the line until GO', async () => {
      await page.keyboard.down('z');
      await page.waitForTimeout(600);
      const s = await ai.state();
      if (s.state === 'countdown') await ai.check('no false start', s.player.speed, (v) => v === 0);
      await ai.waitFor((s) => s.state === 'racing', { timeout: 60_000, message: 'GO!' });
    });
    await ai.step('the world soundtrack is playing', async () => {
      const s = await ai.waitFor((s) => s.music.playing, { message: 'music' });
      await ai.check(`music at ${s.music.bpm} bpm`, s.music.bpm, (b) => b > 100);
    });
    await ai.step('Z throttle accelerates', async () => {
      const s = await ai.waitFor((s) => s.player.speed > 20, { message: 'speed > 20' });
      await ai.check('speed (units/s)', s.player.speed, (v) => v > 20);
    });
    await ai.step('↑ and ↓ change lanes', async () => {
      await ai.waitFor((s) => !s.player.airborne);
      const start = (await ai.state()).player.lane;
      await ai.tap('ArrowUp');
      const up = await ai.waitFor((s) => s.player.lane === start - 1, { message: 'lane up' });
      await ai.check(`lane ${start} → ${up.player.lane}`, up.player.lane, (l) => l === start - 1);
      await ai.waitFor((s) => !s.player.airborne);
      await ai.tap('ArrowDown');
      const down = await ai.waitFor((s) => s.player.lane === start, { message: 'lane down' });
      await ai.check(`back to lane ${start}`, down.player.lane, (l) => l === start);
    });
    await page.keyboard.up('z');
  });

  test('3 · turbo heats the engine until it overheats', async ({ page, ai }) => {
    await startRace(page, ai);
    await ai.step('hold X on the flat start straight', async () => {
      await debug(page, 'teleport', 20, 2);
      await page.keyboard.down('x');
      const s = await ai.waitFor((s) => s.player.heat > 50, { message: 'heat > 50' });
      await ai.check('turbo speed above normal max (32)', s.player.speed, (v) => v > 32);
    });
    await ai.step('keep holding → OVERHEAT', async () => {
      await ai.waitFor((s) => s.player.heat > 80, { message: 'redline' });
      await expect(page.locator('.temp label')).toHaveText('REDLINE');
      await ai.say('REDLINE — engine about to blow');
      const s = await ai.waitFor((s) => s.player.overheated, { message: 'overheat' });
      await ai.check('overheated', s.player.overheats, (n) => n === 1);
      await expect(page.locator('#callout')).toHaveText('OVERHEAT!');
      await page.keyboard.up('x');
    });
    await ai.step('engine cools and the bike can drive again', async () => {
      const s = await ai.waitFor((s) => !s.player.overheated, { timeout: 6000, message: 'cool-down' });
      await ai.check('heat dropped', s.player.heat, (h) => h < 60);
    });
  });

  test('4 · mud slows you down', async ({ page, ai }) => {
    await startRace(page, ai);
    const { mud } = await debug(page, 'track');
    test.skip(!mud.length, 'this track seed has no mud');
    const patch = mud[0];
    await ai.step(`jump to the mud at ${Math.round(patch.x0)}m, lane ${patch.lanes[0]}`, async () => {
      await page.keyboard.down('z'); // throttle first so slowMo can't make us coast
      await debug(page, 'teleport', patch.x0 - 30, patch.lanes[0], 30);
      const s = await ai.state();
      await ai.check('arriving at speed', s.player.speed, (v) => v > 25);
    });
    await ai.step('speed collapses in the mud', async () => {
      const s = await ai.waitFor((s) => s.player.x > patch.x0 + 10, { message: 'inside the mud' });
      await ai.check('mud speed ≤ 14', s.player.speed, (v) => v <= 14.5);
    });
    await ai.step('recovers after the mud', async () => {
      const s = await ai.waitFor((s) => s.player.x > patch.x1 + 10 && s.player.speed > 25, { message: 'recovery' });
      await ai.check('back up to speed', s.player.speed, (v) => v > 25);
    });
    await page.keyboard.up('z');
  });

  test('5 · blue arrows cool the engine', async ({ page, ai }) => {
    await startRace(page, ai);
    const { coolers } = await debug(page, 'track');
    test.skip(!coolers.length, 'this track seed has no cooling pads');
    const pad = coolers[0];
    await ai.step(`line up with the pad at ${Math.round(pad.x)}m, lane ${pad.lane}`, async () => {
      await debug(page, 'teleport', pad.x - 12, pad.lane, 20);
      await debug(page, 'setHeat', 90);
      await ai.check('engine is hot', (await ai.state()).player.heat, (h) => h > 80);
    });
    await ai.step('drive over the arrows', async () => {
      await page.keyboard.down('z');
      const s = await ai.waitFor((s) => s.player.x > pad.x + 2, { message: 'pass the pad' });
      await ai.check('heat reset', s.player.heat, (h) => h < 5);
      await page.keyboard.up('z');
    });
  });

  test('6 · landing nose-down crashes, then the rider respawns', async ({ page, ai }) => {
    await startRace(page, ai);
    const { ramps } = await debug(page, 'track');
    const big = ramps.find((r) => r.h > 4);
    await ai.step(`approach the ${big.h.toFixed(1)}m ramp at ${Math.round(big.x0)}m`, async () => {
      await debug(page, 'teleport', big.x0 - 25, 2, 32);
      await page.keyboard.down('z');
      await ai.waitFor((s) => s.player.airborne, { message: 'take-off' });
      await ai.say('airborne — leaning hard forward (wrong!)');
    });
    await ai.step('hold → the whole flight', async () => {
      await page.keyboard.down('ArrowRight');
      const s = await ai.waitFor((s) => s.player.crashed, { message: 'crash' });
      await page.keyboard.up('ArrowRight');
      await ai.check('crashed', s.player.crashes, (n) => n === 1);
      await expect(page.locator('#callout')).toHaveText('CRASH!');
    });
    await ai.step('rider gets back on the bike', async () => {
      const s = await ai.waitFor((s) => !s.player.crashed && s.player.speed > 5, { timeout: 6000, message: 'respawn' });
      await ai.check('riding again', s.player.speed, (v) => v > 5);
    });
    await page.keyboard.up('z');
  });

  test('7 · stunt: land a backflip', async ({ page, ai }) => {
    test.setTimeout(200_000);
    await startRace(page, ai);
    const keys = keyHolder(page);
    await keys.set('z', true);
    let attempts = 0;
    await ai.step('hold ← on big jumps until one full rotation lands', async () => {
      let trying = false;
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        const s = await ai.state();
        const p = s.player;
        if (p.flips > 0) break;
        if (s.state === 'finished') {
          // Out of ramps — go again.
          await keys.releaseAll();
          await page.waitForTimeout(1500);
          await ai.say('no luck this race — restarting');
          await ai.tap('Enter');
          await ai.waitFor((s) => s.state === 'racing', { timeout: 60_000, message: 'GO!' });
          await keys.set('z', true);
          continue;
        }
        if (s.state !== 'racing') { await page.waitForTimeout(50); continue; }
        if (p.airborne) {
          if (!trying && p.vy > 9) { trying = true; attempts += 1; await ai.say(`backflip attempt #${attempts}`); }
          if (trying && p.airSpin < Math.PI * 2 - 0.6) {
            await keys.set('ArrowRight', false);
            await keys.set('ArrowLeft', true);
          } else await steer(keys, s);
        } else {
          trying = false;
          await keys.set('ArrowLeft', false);
          await keys.set('ArrowRight', false);
          await keys.set('x', p.heat < 50);
        }
        await page.waitForTimeout(10);
      }
      await keys.releaseAll();
    });
    await ai.step('BACKFLIP!', async () => {
      const s = await ai.state();
      await ai.check(`flips landed (${attempts} attempts)`, s.player.flips, (f) => f >= 1);
    });
    await ai.snap('backflip');
  });

  test('8 · autopilot finishes, results, record, restart', async ({ page, ai }) => {
    await startRace(page, ai);
    await ai.step('P turns on autopilot', async () => {
      await ai.tap('p');
      await ai.check('autopilot on', (await ai.state()).autopilot, (a) => a === true);
    });
    await ai.step('autopilot drives to the finish', async () => {
      const s = await ai.waitFor((s) => s.state === 'finished', { timeout: 90_000, message: 'finish line' });
      await ai.check('finish time (s)', s.player.finishTime, (t) => t > 10 && t < 60);
    });
    await ai.step('results screen, record and coin payout', async () => {
      await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#results .record')).toHaveText('★ NEW RECORD ★');
      const s = await ai.state();
      await ai.check('best time stored', s.best, (b) => b === s.player.finishTime);
      await ai.check('coins paid out', s.lastPayout, (c) => c > 0);
      await ai.check('bank = payout', s.bank, (b) => b === s.lastPayout);
      await expect(page.locator('#results .payout')).toContainText(`+◉ ${s.lastPayout}`);
      await ai.snap('results');
    });
    await ai.step('ENTER → garage → ENTER races again', async () => {
      await ai.tap('Enter');
      await ai.waitFor((s) => s.state === 'garage');
      await expect(page.locator('#coins')).toContainText(String((await ai.state()).bank));
      await ai.tap('Enter');
      const s = await ai.state();
      await ai.check('back to countdown', s.state, (v) => v === 'countdown');
      await ai.check('player reset to the start', s.player.x, (x) => x < 20);
    });
    await ai.step('your record run comes back as a ghost', async () => {
      const s = await ai.waitFor((s) => s.state === 'racing' && s.ghost.visible && s.ghost.x > 30, { message: 'ghost riding' });
      await ai.check('ghost loaded from the record', s.ghost.loaded, (g) => g === true);
      await ai.snap('ghost');
    });
  });

  test('9 · full race driven by Claude with the keyboard', async ({ page, ai }) => {
    test.setTimeout(240_000);
    await startRace(page, ai);
    await ai.step('drive to the finish: manage heat, lanes & landings', async () => {
      await ai.say('autopilot OFF — Claude is driving');
      const keys = keyHolder(page);
      await keys.set('z', true);
      let last = await ai.state();
      let lastMark = 0;
      const deadline = Date.now() + 200_000;
      while (Date.now() < deadline) {
        const s = await ai.state();
        if (!s) throw new Error('game state disappeared (page reloaded?)');
        const p = s.player;
        if (s.state !== 'racing') break;
        await keys.set('x', !p.airborne && p.heat < 55);
        await steer(keys, s);
        const lane = s.laneAhead[p.lane];
        if (!p.airborne && (lane.rival || lane.mud)) {
          const free = [p.lane - 1, p.lane + 1].find((l) => l >= 0 && l < 4 && !s.laneAhead[l].rival && !s.laneAhead[l].mud);
          if (free !== undefined) await ai.tap(free < p.lane ? 'ArrowUp' : 'ArrowDown');
        }
        if (p.perfects > last.player.perfects) await ai.say('perfect landing!');
        if (p.crashes > last.player.crashes) await ai.say('crashed — recovering');
        const mark = Math.floor(p.x / 250);
        if (mark > lastMark) { lastMark = mark; await ai.say(`${Math.round(p.x)}m · place ${s.place} · ${Math.round(p.speed * 3.6)} km/h`); }
        last = s;
        await page.waitForTimeout(16);
      }
      await keys.releaseAll();
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

test.describe('REDLINE MX on a phone', () => {
  test.use({ viewport: { width: 430, height: 860 }, hasTouch: true, isMobile: true });

  test('10 · touch buttons drive the bike', async ({ page, ai }) => {
    await ai.step('load in phone mode', async () => {
      await openGame(page, ai, '?touch');
      await expect(page.locator('#touchpad .tb')).toHaveCount(7);
      await expect(page.locator('#title .blink')).toContainText('TAP');
    });
    await ai.step('tap the title screen, then RACE in the garage', async () => {
      await page.locator('#title').tap();
      await ai.waitFor((s) => s.state === 'garage', { message: 'garage' });
      await page.locator('#race-btn').tap();
      await ai.waitFor((s) => s.state === 'racing', { timeout: 60_000, message: 'GO!' });
    });
    await ai.step('hold GAS', async () => {
      const gas = page.locator('.tb.a');
      const box = await gas.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await page.mouse.down();
      const s = await ai.waitFor((s) => s.player.speed > 15, { message: 'speed from GAS' });
      await ai.check('GAS button accelerates', s.player.speed, (v) => v > 15);
      await page.mouse.up();
    });
    await ai.step('tap ▲ to change lane', async () => {
      await ai.waitFor((s) => !s.player.airborne);
      const before = (await ai.state()).player.lane;
      await page.locator('.tb.up').tap();
      const s = await ai.waitFor((s) => s.player.lane !== before, { message: 'lane change' });
      await ai.check('lane changed', s.player.lane, (l) => l === before - 1);
    });
    await ai.step('WebGL renders at phone size', () => ai.expectCanvasAlive('canvas', 100));
    await ai.snap('phone');
  });
});

test.describe('REDLINE MX garage & economy', () => {
  test('11 · buy upgrades and a new bike with coins', async ({ page, ai }) => {
    await openGame(page, ai);
    await ai.step('open the garage', async () => {
      await ai.tap('Enter');
      await expect(page.locator('#garage')).toBeVisible();
      await ai.check('starts broke', (await ai.state()).bank, (b) => b === 0);
      await expect(page.locator('[data-upgrade="engine"]')).toBeDisabled();
    });
    await ai.step('earn 1500 coins (debug)', async () => {
      await page.evaluate(() => window.__app.debug.giveCoins(1500));
      await expect(page.locator('#coins')).toContainText('1,500');
    });
    await ai.step('buy Engine level 1 and 2', async () => {
      await page.locator('[data-upgrade="engine"]').click();
      await page.locator('[data-upgrade="engine"]').click();
      await expect(page.locator('.upg').first().locator('.pips i.on')).toHaveCount(2);
      await ai.check('paid 80 + 320', (await ai.state()).bank, (b) => b === 1100);
    });
    await ai.step('locked bike: buy the Iron Buffalo', async () => {
      await page.locator('[data-bike="chopper"]').click();
      await expect(page.locator('[data-bike="chopper"]')).toHaveClass(/sel/);
      await ai.check('paid 400', (await ai.state()).bank, (b) => b === 700);
    });
    await ai.step('pick Frostbite Pass and race → world reloads', async () => {
      await page.locator('[data-biome="alpine"]').click();
      await page.locator('#race-btn').click();
      const s = await ai.waitFor((s) => s.state === 'racing' && s.biome === 'alpine', { message: 'alpine race' });
      await ai.check('riding the chopper', s.bike, (b) => b === 'chopper');
      await ai.check('icy lanes', s.env.patch, (p) => p === 'ice');
    });
    await ai.snap('alpine-chopper');
  });
});

test.describe('REDLINE MX worlds', () => {
  for (const [id, patch] of [['stadium', 'mud'], ['canyon', 'quicksand'], ['alpine', 'ice'], ['neon', 'oil'], ['volcano', 'lava']]) {
    test(`12 · world: ${id}`, async ({ page, ai }) => {
      await ai.step(`load ${id} and race on autopilot`, async () => {
        await openGame(page, ai, `?biome=${id}&autostart`);
        await ai.waitFor((s) => s.state === 'racing' && s.player.x > 120, { timeout: 30_000, message: 'racing 120m' });
      });
      await ai.step('scene renders', () => ai.expectCanvasAlive('canvas', 150));
      await ai.step(`${patch} patches affect the bike`, async () => {
        const s = await ai.state();
        await ai.check(`patch type ${patch}`, s.env.patch, (p) => p === patch);
      });
      await ai.snap(id);
    });
  }
});

test.describe('REDLINE MX abilities', () => {
  const ABILITIES = [
    ['dirt', 'ROCKET HOP', (s, b) => s.player.jumps > b.player.jumps],
    ['chopper', 'SHOCKWAVE', (s) => s.rivals.some((r) => r.crashed)],
    ['sport', 'SLIPSTREAM', (s) => s.player.effects.slipstream > 0],
    ['hover', 'PHASE', (s) => s.player.effects.phase > 0],
    ['mech', 'OVERDRIVE', (s) => s.player.effects.overdrive > 0],
    ['retro', 'AFTERBURNER', (s) => s.player.effects.afterburner > 0],
  ];
  test('13 · every bike fires its special ability with C', async ({ page, ai }) => {
    test.setTimeout(180_000);
    for (const [bike, name, works] of ABILITIES) {
      await ai.step(`${bike}: ${name}`, async () => {
        await openGame(page, ai, `?bike=${bike}&race`);
        await ai.waitFor((s) => s.state === 'racing' && s.bike === bike, { message: `${bike} racing` });
        await page.keyboard.down('z');
        await ai.waitFor((s) => s.player.speed > 15 && !s.player.airborne, { message: 'rolling' });
        await page.evaluate(() => { window.__app.debug.rivalAhead(10); window.__app.debug.charge(100); });
        await expect(page.locator('#ability')).toHaveClass(/ready/);
        const before = await ai.state();
        await ai.tap('c');
        const s = await ai.waitFor((s) => works(s, before), { timeout: 10_000, message: `${name} effect` });
        await ai.check(`${name} fired`, s.abilityUses, (n) => n === 1);
        await ai.check('meter emptied', s.ability, (a) => a < 10);
        await page.keyboard.up('z');
      });
    }
  });
});

test.describe('REDLINE MX pickups', () => {
  test('14 · coins, nitro, shield, coolant', async ({ page, ai }) => {
    await startRace(page, ai);
    const list = await page.evaluate(() => window.__app.debug.items());
    const grab = async (kind) => {
      const it = list.find((i) => i.kind === kind && i.lift < 2 && i.x > 60 && !i.taken);
      test.skip(!it, `no ${kind} on this track`);
      await page.keyboard.down('z');
      // Start just before it on the ground (x-14 could be mid-ramp and launch us over it).
      await page.evaluate(([x, lane]) => window.__app.debug.teleport(x - 5, lane, 14), [it.x, it.lane]);
      await ai.waitFor((s) => s.player.x > it.x + 1, { message: `drive through ${kind}` });
      return it;
    };
    await ai.step('coin row', async () => {
      await grab('coin');
      await ai.check('coins collected', (await ai.state()).raceCoins, (c) => c >= 1);
    });
    await ai.step('coolant resets heat', async () => {
      await page.evaluate(() => window.__app.debug.setHeat(80));
      await grab('ice');
      await ai.check('heat after coolant', (await ai.state()).player.heat, (h) => h < 20);
    });
    await ai.step('shield bubble', async () => {
      await grab('shield');
      await ai.check('shield count', (await ai.state()).player.shields, (n) => n >= 1);
    });
    await ai.step('nitro boost', async () => {
      await grab('nitro');
      const s = await ai.state();
      await ai.check('nitro above normal top speed', s.player.speed, (v) => v > 33);
    });
    await page.keyboard.up('z');
  });

  test('15 · a shield saves a terrible landing', async ({ page, ai }) => {
    await startRace(page, ai, '');
    const { ramps } = await debug(page, 'track');
    const big = ramps.find((r) => r.h > 4);
    await ai.step('grab a shield (debug) and hit a big ramp', async () => {
      await page.evaluate(() => { window.__app.debug.teleport(20, 2, 0); });
      await page.keyboard.down('z');
      await page.evaluate((x) => window.__app.debug.teleport(x, 2, 32), big.x0 - 25);
      await page.evaluate(() => window.__app.debug.shield());
      await ai.waitFor((s) => s.player.airborne, { message: 'take-off' });
    });
    await ai.step('nose-dive the landing → shield pops instead of a crash', async () => {
      await page.keyboard.down('ArrowRight');
      await ai.waitFor((s) => !s.player.airborne, { message: 'landing' });
      await page.keyboard.up('ArrowRight');
      const s = await ai.state();
      await ai.check('no crash', s.player.crashes, (n) => n === 0);
      await ai.check('shield used up', s.player.shields, (n) => n === 0);
    });
    await page.keyboard.up('z');
  });
});

test.describe('REDLINE MX track features & cup', () => {
  test('16 · boost pads fire nitro, stunt rings pay out', async ({ page, ai }) => {
    await startRace(page, ai);
    await ai.step('ride over an orange boost pad', async () => {
      const [pad] = await page.evaluate(() => window.__app.debug.boosts());
      test.skip(!pad, 'no boost pad on this track');
      await page.keyboard.down('z');
      await page.evaluate(([x, lane]) => window.__app.debug.teleport(x - 10, lane, 20), [pad.x, pad.lane]);
      const s = await ai.waitFor((s) => s.player.effects.nitro > 0, { message: 'boost' });
      await ai.check('nitro from the pad', s.player.effects.nitro, (n) => n > 0);
    });
    await ai.step('fly through a stunt ring', async () => {
      const rings = (await page.evaluate(() => window.__app.debug.items())).filter((i) => i.kind === 'ring');
      await ai.check('rings above big ramps', rings.length, (n) => n > 0);
      // Autopilot flies the big jumps; ring through-passes are luck, so check the pickup code path by lining one up.
      const before = (await ai.state()).raceCoins;
      await page.evaluate((r) => window.__app.debug.flyThrough(r.x, r.lane, r.lift), rings[0]);
      const s = await ai.waitFor((s) => s.raceCoins >= before + 5, { message: 'ring pass' });
      await ai.check('ring paid 5 coins', s.raceCoins - before, (c) => c >= 5);
    });
    await page.keyboard.up('z');
  });

  test('17 · championship cup: round 1 scores points, round 2 loads the next world', async ({ page, ai }) => {
    test.setTimeout(240_000);
    await openGame(page, ai);
    await ai.step('garage → START CUP', async () => {
      await ai.tap('Enter');
      await page.locator('#cup-start').click();
      const s = await ai.waitFor((s) => s.state === 'countdown' || s.state === 'racing', { timeout: 60_000, message: 'cup race' });
      await ai.check('round 1 is Thunder Dome', s.biome, (b) => b === 'stadium');
      await ai.tap('p');
    });
    await ai.step('autopilot wins points', async () => {
      const s = await ai.waitFor((s) => s.state === 'finished', { timeout: 150_000, message: 'finish' });
      const total = Object.values(s.cup.points).reduce((a, b) => a + b, 0);
      await ai.check('22 points handed out', total, (t) => t === 22);
      await ai.check('round advanced', s.cup.round, (r) => r === 1);
      await expect(page.locator('#results .cup-table')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#results .blink')).toContainText('Scorpion Canyon');
    });
    await ai.step('ENTER → round 2 in Scorpion Canyon', async () => {
      await ai.tap('Enter');
      const s = await ai.waitFor((s) => s.biome === 'canyon' && (s.state === 'countdown' || s.state === 'racing'), { timeout: 60_000, message: 'round 2' });
      await ai.check('cup carried over', s.cup.round, (r) => r === 1);
    });
    await ai.snap('cup-round-2');
  });
});
