// Arcade bike physics. The bike is a point that either sticks to the
// ground profile or flies ballistically; pitch is what you control in the
// air. Land at the wrong angle and you crash — just like the original.
import { LANES } from './track.js';

export const G = 40;
const ACCEL = 22;
const TURBO_ACCEL = 32;
const COAST_DRAG = 9;
const MUD_MAX = 13;
const PITCH_RATE = 3.2;
const SPIN_BOOST = 7; // holding a lean spins faster and faster — enough for a backflip off a big ramp
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const CRASH_ANGLE = 0.9;
const CRASH_TIME = 1.6;
const OVERHEAT_TIME = 2.5;

export class Rider {
  constructor(track, lane, { maxSpeed = 32, turboSpeed = 44, name = 'P1' } = {}) {
    this.track = track;
    this.name = name;
    this.maxSpeed = maxSpeed;
    this.turboSpeed = turboSpeed;
    this.lane = lane;
    this.z = LANES[lane];
    this.reset(0);
  }

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
  }

  get crashed() { return this.crashTimer > 0; }
  get overheated() { return this.overheatTimer > 0; }

  crash(events) {
    if (this.crashed) return;
    this.crashTimer = CRASH_TIME;
    this.crashes += 1;
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4);
    events.push({ type: 'crash', rider: this });
  }

  update(dt, input, events) {
    const t = this.track;
    this.throttle = this.turbo = false;
    this.lean = 0;

    if (this.crashed) {
      this.crashTimer -= dt;
      this.speed = Math.max(0, this.speed - 30 * dt);
      this.x += this.speed * dt * 0.5;
      this.pitch += this.crashSpin * dt;
      this.y = Math.max(t.height(this.x), this.y + this.vy * dt);
      this.vy -= G * dt;
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

    // Heat: turbo heats the engine, everything else cools it.
    if (this.turbo) this.heat += 30 * dt;
    else this.heat = Math.max(0, this.heat - 18 * dt);
    if (t.onCooler(this.x, this.lane)) this.heat = 0;
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
    if (input.laneDelta) {
      this.lane = Math.min(3, Math.max(0, this.lane + input.laneDelta));
    }
    const target = LANES[this.lane];
    this.z += Math.sign(target - this.z) * Math.min(Math.abs(target - this.z), 12 * dt);

    const a = t.slope(this.x);
    const mud = t.inMud(this.x, this.lane);
    const cap = mud ? MUD_MAX : this.turbo ? this.turboSpeed : this.maxSpeed;
    if (this.throttle && this.speed < cap) this.speed = Math.min(cap, this.speed + (this.turbo ? TURBO_ACCEL : ACCEL) * dt);
    else if (this.speed > cap) this.speed = Math.max(cap, this.speed - (mud ? 60 : 14) * dt);
    else if (!this.throttle) this.speed = Math.max(0, this.speed - COAST_DRAG * dt);
    this.speed = Math.max(0, this.speed - G * Math.sin(a) * 0.35 * dt);

    this.vx = this.speed * Math.cos(a);
    this.vy = this.speed * Math.sin(a);
    const nx = this.x + this.vx * dt;
    const ballistic = this.y + this.vy * dt - 0.5 * G * dt * dt;
    const ground = t.height(nx);
    this.x = nx;

    if (ballistic > ground + 0.03 && this.speed > 8) {
      this.airborne = true;
      this.airTime = 0;
      this.airSpin = 0;
      this.leanHeld = 0;
      this.y = ballistic;
      this.vy -= G * dt;
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
    this.airTime += dt;
    this.maxAir = Math.max(this.maxAir, this.airTime);
    this.vy -= G * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Lean input rotates the bike; with no input it drifts toward the flight path.
    const before = this.pitch;
    if (this.lean) {
      if (this.lean !== this.lastLean) this.leanHeld = 0; // reversing starts slow again
      this.leanHeld += dt;
      this.pitch -= this.lean * (PITCH_RATE + Math.min(1, this.leanHeld) * SPIN_BOOST) * dt;
    } else {
      this.leanHeld = 0;
      this.pitch += (Math.atan2(this.vy, this.vx) * 0.5 - wrap(this.pitch)) * Math.min(1, dt * 1.2);
    }
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
      if (diff > CRASH_ANGLE) {
        this.speed = Math.hypot(this.vx, this.vy) * 0.6;
        this.vy = 8;
        this.crash(events);
        return;
      }
      const along = this.vx * Math.cos(a) + this.vy * Math.sin(a);
      const perfect = diff < 0.18;
      this.speed = Math.max(0, along) * (perfect ? 1.08 : 1 - 0.3 * diff) * (flips ? 1.2 : 1);
      this.pitch = a;
      if (perfect) this.perfects += 1;
      if (flips) {
        this.flips += flips;
        this.heat = 0; // style points: a flip cools the engine
      }
      events.push({ type: 'land', rider: this, perfect, diff, flips, backflip: this.airSpin > 0 });
    }
  }
}
