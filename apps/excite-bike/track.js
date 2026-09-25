// The track is a 2D height profile h(x) shared by all four lanes,
// plus lane-specific mud patches and cooling pads. Everything is
// generated from a seed so every race (and every test run) matches.
import { mulberry32 } from './rng.js';

export const LANES = [-4.5, -1.5, 1.5, 4.5]; // z of each lane, 0 = far side
export const TRACK_HALF_WIDTH = 6.5;
export const START_X = 10;
export const FINISH_X = 1100;
export const TRACK_END = FINISH_X + 160;
const TRACK_BEGIN = -60;
const STEP = 0.1;

export function buildTrack(seed = 7) {
  const rng = mulberry32(seed);
  const ramps = []; // { x0, up, top, down, h }
  const mud = []; // { x0, x1, lanes: Set }
  const coolers = []; // { x, lane }
  const addRamp = (x0, h, up, top, down) => { ramps.push({ x0, h, up, top, down }); return x0 + up + top + down; };

  let x = 70;
  while (x < FINISH_X - 80) {
    const r = rng();
    if (r < 0.32) {
      const h = 2.5 + rng() * 3;
      x = addRamp(x, h, h * 2.1, 2 + rng() * 5, h * 2.6) + 28 + rng() * 20;
    } else if (r < 0.5) {
      const n = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) x = addRamp(x, 0.9, 2.2, 0.2, 2.2) + 0.6;
      x += 22;
    } else if (r < 0.66) {
      const h = 3 + rng() * 1.5;
      x = addRamp(x, h, h * 2, 1, h * 1.2) + 9;
      x = addRamp(x, h * 0.9, h * 1.3, 1, h * 2.4) + 30;
    } else if (r < 0.82) {
      const lanes = new Set();
      while (lanes.size < 2) lanes.add(Math.floor(rng() * 4));
      mud.push({ x0: x, x1: x + 16, lanes });
      x += 36;
    } else {
      const h = 3;
      x = addRamp(x, h, h * 2.3, 16 + rng() * 8, h * 2.4) + 30;
    }
    if (rng() < 0.35) coolers.push({ x: x - 12, lane: Math.floor(rng() * 4) });
  }

  // Sample the profile once so h(x) is a cheap lookup.
  const n = Math.ceil((TRACK_END - TRACK_BEGIN) / STEP) + 1;
  const heights = new Float32Array(n);
  for (const r of ramps) {
    const end = r.x0 + r.up + r.top + r.down;
    for (let i = Math.floor((r.x0 - TRACK_BEGIN) / STEP); i < n; i++) {
      const px = TRACK_BEGIN + i * STEP;
      if (px > end) break;
      let y = 0;
      if (px < r.x0) y = 0;
      else if (px < r.x0 + r.up) y = (r.h * (px - r.x0)) / r.up;
      else if (px < r.x0 + r.up + r.top) y = r.h;
      else y = r.h * (1 - (px - r.x0 - r.up - r.top) / r.down);
      heights[i] = Math.max(heights[i], y);
    }
  }

  const height = (px) => {
    const f = (Math.min(Math.max(px, TRACK_BEGIN), TRACK_END) - TRACK_BEGIN) / STEP;
    const i = Math.min(Math.floor(f), n - 2);
    return heights[i] + (heights[i + 1] - heights[i]) * (f - i);
  };
  const slope = (px) => Math.atan2(height(px + 0.15) - height(px - 0.15), 0.3);
  const inMud = (px, lane) => mud.some((m) => px >= m.x0 && px <= m.x1 && m.lanes.has(lane));
  const onCooler = (px, lane) => coolers.some((c) => Math.abs(px - c.x) < 1.5 && c.lane === lane);

  return { ramps, mud, coolers, height, slope, inMud, onCooler, begin: TRACK_BEGIN, end: TRACK_END };
}
