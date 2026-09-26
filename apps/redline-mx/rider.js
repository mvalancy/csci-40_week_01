// Arcade bike physics. The bike is a point that either sticks to the
// ground profile or flies ballistically; pitch is what you control in the
// air. Land at the wrong angle and you crash.
//
// Every number that differs between bikes lives in `stats` (bike model +
// garage upgrades); everything that differs between worlds lives in `env`
// (gravity, heat, what the lane patches are made of, weather grip & wind).
import { LANES } from './track.js';

export const DEFAULT_STATS = {
  maxSpeed: 32,
  turboSpeed: 44,
  accel: 22,
  turboAccel: 32,
  heatRate: 30, // heat/s while on turbo
  cooling: 18, // heat/s shed otherwise
  spin: 1, // air-control multiplier
  crashAngle: 0.9, // radians of landing error you survive
  grip: 1, // how much lane patches (mud, ice, …) bother you: lower = better
};
export const DEFAULT_ENV = { gravity: 40, heatMul: 1, patch: 'mud', weatherGrip: 1, wind: 0 };

const COAST_DRAG = 9;
const PITCH_RATE = 3.2;
const SPIN_BOOST = 7; // holding a lean spins faster and faster — enough for a backflip off a big ramp
const CRASH_TIME = 1.6;
const OVERHEAT_TIME = 2.5;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// What each lane patch does. cap = speed cap, accel = accel multiplier,
// heat = extra heat/s, lane = lane-change speed multiplier.
const PATCHES = {
  mud: { cap: 13, accel: 1, heat: 0, lane: 1 },
  quicksand: { cap: 10, accel: 0.8, heat: 0, lane: 0.6 },
  ice: { cap: Infinity, accel: 0.15, heat: 0, lane: 0.35, slide: true },
  oil: { cap: Infinity, accel: 0.1, heat: 0, lane: 0.3, slide: true },
  lava: { cap: 20, accel: 1, heat: 45, lane: 1 },
};

export class Rider {
  constructor(track, lane, { stats = {}, env = DEFAULT_ENV, name = 'P1' } = {}) {
    this.track = track;
    this.name = name;
    this.stats = { ...DEFAULT_STATS, ...stats };
    this.env = env;
    this.lane = lane;
    this.z = LANES[lane];
    this.reset(0);
  }

  // Kept for code that reads these directly.
  get maxSpeed() { return this.stats.maxSpeed; }
  get turboSpeed() { return this.stats.turboSpeed; }

  reset(x) {
    this.x = x;
    this.y = this.track.height(x);
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.pitch = this.track.slope(x);
    this.airborne = false;
    this.heat = 0;
    this.crashTimer = 0;
    this.overheatTimer = 0;
    this.crashes = 0;
    this.overheats = 0;
    this.jumps = 0;
    this.perfects = 0;
    this.flips = 0;
    this.leanHeld = 0;
    this.airSpin = 0;
    this.airTime = 0;
    this.maxAir = 0;
    this.finishTime = null;
    this.throttle = false;
    this.turbo = false;
    this.lean = 0;
    this.wheelie = 0;
    this.shields = 0;
    this.effects = {}; // name → seconds left
    this.patch = null;
  }

  get crashed() { return this.crashTimer > 0; }
  get overheated() { return this.overheatTimer > 0; }
  has(effect) { return (this.effects[effect] || 0) > 0; }
  give(effect, seconds) { this.effects[effect] = Math.max(this.effects[effect] || 0, seconds); }

  crash(events) {
    if (this.crashed) return false;
    if (this.has('phase')) return false;
    if (this.shields > 0) {
      this.shields -= 1;
      this.give('phase', 0.8); // brief invulnerability after the shield pops
      events.push({ type: 'shield', rider: this });
      return false;
    }
    this.crashTimer = CRASH_TIME;
    this.crashes += 1;
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4);
    events.push({ type: 'crash', rider: this });
    return true;
  }

  // Instant vertical launch (dirt bike ability, rocket item).
  hop(power = 18) {
    if (this.crashed) return;
    if (!this.airborne) {
      const a = this.track.slope(this.x);
      this.vx = this.speed * Math.cos(a);
      this.airborne = true;
      this.airTime = 0;
      this.airSpin = 0;
      this.leanHeld = 0;
      this.jumps += 1;
    }
    this.vy = Math.max(this.vy, power);
    this.y += 0.05;
  }

  update(dt, input, events) {
    const t = this.track;
    const s = this.stats;
    const env = this.env;
    for (const k in this.effects) this.effects[k] = Math.max(0, this.effects[k] - dt);
    this.throttle = this.turbo = false;
    this.lean = 0;

    if (this.crashed) {
      this.crashTimer -= dt;
      this.speed = Math.max(0, this.speed - 30 * dt);
      this.x += this.speed * dt * 0.5;
      this.pitch += this.crashSpin * dt;
      this.y = Math.max(t.height(this.x), this.y + this.vy * dt);
      this.vy -= env.gravity * dt;
      if (this.crashTimer <= 0) {
        // Respawn on the ground, upright, a little further along.
        const x = this.x;
        this.airborne = false;
        this.y = t.height(x);
        this.pitch = t.slope(x);
        this.vx = this.vy = this.speed = 0;
        events.push({ type: 'respawn', rider: this });
      }
      return;
    }

    if (this.overheated) {
      this.overheatTimer -= dt;
      this.heat = Math.max(0, this.heat - 40 * dt);
    } else {
      this.throttle = !!input.throttle || !!input.turbo;
      this.turbo = !!input.turbo;
      this.lean = input.lean || 0;
    }

    this.patch = !this.airborne && t.inMud(this.x, this.lane) && !this.has('overdrive') ? PATCHES[env.patch] || PATCHES.mud : null;

    // Heat: turbo heats the engine, everything else cools it.
    const coolRun = this.has('slipstream') || this.has('overdrive') || this.has('nitro');
    if (this.turbo && !coolRun) this.heat += s.heatRate * env.heatMul * dt;
    else this.heat = Math.max(0, this.heat - s.cooling * dt);
    if (this.patch?.heat) this.heat += this.patch.heat * dt;
    if (t.onCooler(this.x, this.lane)) this.heat = 0;
    if (!this.airborne && t.onBoost?.(this.x, this.lane) && !this.has('nitro')) {
      this.give('nitro', 0.9);
      events.push({ type: 'boost', rider: this });
    }
    if (this.heat >= 100) {
      this.heat = 100;
      this.overheatTimer = OVERHEAT_TIME;
      this.overheats += 1;
      this.turbo = this.throttle = false;
      events.push({ type: 'overheat', rider: this });
    }

    if (!this.airborne) this.updateGround(dt, input, events);
    else this.updateAir(dt, events);
  }

  updateGround(dt, input, events) {
    const t = this.track;
    const s = this.stats;
    const env = this.env;
    const patch = this.patch;
    // Better tyres (lower stats.grip) shrug patches off.
    const patchPull = patch ? s.grip : 0;

    if (input.laneDelta) this.lane = Math.min(3, Math.max(0, this.lane + input.laneDelta));
    const target = LANES[this.lane];
    const laneRate = 12 * (patch ? 1 - patchPull * (1 - patch.lane) : 1);
    this.z += Math.sign(target - this.z) * Math.min(Math.abs(target - this.z), laneRate * dt);

    const a = t.slope(this.x);
    let cap = this.turbo ? s.turboSpeed : s.maxSpeed;
    if (this.has('slipstream')) cap += 12;
    if (this.has('afterburner')) cap = s.turboSpeed + 20;
    if (this.has('nitro')) cap = Math.max(cap, s.turboSpeed + 10);
    if (patch && patch.cap < cap) cap = cap + (patch.cap - cap) * patchPull;
    let accel = (this.turbo ? s.turboAccel : s.accel) * env.weatherGrip;
    if (patch) accel *= 1 - patchPull * (1 - patch.accel);
    if (this.has('afterburner') || this.has('nitro')) accel += 45;

    const driving = this.throttle || this.has('afterburner') || this.has('nitro');
    if (driving && this.speed < cap) this.speed = Math.min(cap, this.speed + accel * dt);
    else if (this.speed > cap) this.speed = Math.max(cap, this.speed - (patch ? 60 : 14) * dt);
    else if (!driving && !patch?.slide) this.speed = Math.max(0, this.speed - COAST_DRAG * dt);
    this.speed = Math.max(0, this.speed - env.gravity * Math.sin(a) * 0.35 * dt);

    this.vx = this.speed * Math.cos(a);
    this.vy = this.speed * Math.sin(a);
    const nx = this.x + this.vx * dt;
    const ballistic = this.y + this.vy * dt - 0.5 * env.gravity * dt * dt;
    const ground = t.height(nx);
    this.x = nx;

    if (ballistic > ground + 0.03 && this.speed > 8) {
      this.airborne = true;
      this.airTime = 0;
      this.airSpin = 0;
      this.leanHeld = 0;
      this.y = ballistic;
      this.vy -= env.gravity * dt;
      this.jumps += 1;
      events.push({ type: 'jump', rider: this });
    } else {
      this.y = ground;
      // Pull back on the ground for a wheelie, purely cosmetic.
      this.wheelie += ((this.lean < 0 && this.speed > 4 ? 0.35 : 0) - this.wheelie) * Math.min(1, dt * 8);
      this.pitch = a + this.wheelie;
    }
  }

  updateAir(dt, events) {
    const t = this.track;
    const s = this.stats;
    const env = this.env;
    this.airTime += dt;
    this.maxAir = Math.max(this.maxAir, this.airTime);
    this.vy -= env.gravity * dt;
    if (this.has('afterburner')) {
      // Rocket thrust along the nose, even in the air.
      this.vx += Math.cos(this.pitch) * 30 * dt;
      this.vy += Math.sin(this.pitch) * 30 * dt + env.gravity * 0.6 * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Lean input rotates the bike; with no input it drifts toward the flight path.
    const before = this.pitch;
    if (this.lean) {
      if (this.lean !== this.lastLean) this.leanHeld = 0; // reversing starts slow again
      this.leanHeld += dt;
      this.pitch -= this.lean * (PITCH_RATE + Math.min(1, this.leanHeld) * SPIN_BOOST) * s.spin * dt;
    } else {
      this.leanHeld = 0;
      this.pitch += (Math.atan2(this.vy, this.vx) * 0.5 - wrap(this.pitch)) * Math.min(1, dt * 1.2);
    }
    this.pitch += env.wind * dt;
    this.airSpin += this.pitch - before;
    this.lastLean = this.lean;
    this.wheelie = 0;

    const ground = t.height(this.x);
    if (this.y <= ground) {
      const a = t.slope(this.x);
      const diff = Math.abs(wrap(this.pitch - a));
      const flips = Math.round(Math.abs(this.airSpin) / (Math.PI * 2));
      this.y = ground;
      this.airborne = false;
      const survivable = s.crashAngle * (0.85 + 0.15 * env.weatherGrip);
      if (diff > survivable) {
        const speed = Math.hypot(this.vx, this.vy);
        if (this.crash(events)) {
          this.speed = speed * 0.6;
          this.vy = 8;
          return;
        }
        // Saved by a shield / phase: land upright but slower.
        this.speed = Math.max(0, this.vx * Math.cos(a) + this.vy * Math.sin(a)) * 0.6;
        this.pitch = a;
        return;
      }
      const along = this.vx * Math.cos(a) + this.vy * Math.sin(a);
      // How hard the suspension gets hit: speed into the slope, and which end touches first.
      const impact = Math.max(0, this.vx * Math.sin(a) - this.vy * Math.cos(a));
      const noseDown = wrap(a - this.pitch);
      const perfect = diff < 0.18;
      this.speed = Math.max(0, along) * (perfect ? 1.08 : 1 - 0.3 * diff) * (flips ? 1.2 : 1);
      this.pitch = a;
      if (perfect) this.perfects += 1;
      if (flips) {
        this.flips += flips;
        this.heat = 0; // style points: a flip cools the engine
      }
      events.push({ type: 'land', rider: this, perfect, diff, flips, backflip: this.airSpin > 0, impact, noseDown });
    }
  }
}
