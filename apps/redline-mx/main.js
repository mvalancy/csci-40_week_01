import * as THREE from 'three';
import { buildTrack, LANES, START_X, FINISH_X } from './track.js';
import { buildWorld } from './world.js';
import { buildBike, WHEEL_R, WHEELBASE } from './bike.js';
import { Rider, G } from './rider.js';
import { createAudio } from './audio.js';
import { setupTouch } from './touch.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
const track = buildTrack(7);
const world = buildWorld(scene, track);
const audio = createAudio();

// ---------- riders ----------
const ROSTER = [
  { lane: 2, color: '#ff3b3b', num: '1', name: 'YOU', max: 32, turbo: 44 },
  { lane: 0, color: '#3b7bff', num: '7', name: 'BLU', max: 30.5, turbo: 41 },
  { lane: 1, color: '#2ecc71', num: '3', name: 'GRN', max: 31, turbo: 42 },
  { lane: 3, color: '#ff9f1a', num: '5', name: 'ORG', max: 29.5, turbo: 41 },
];
const riders = ROSTER.map((r) => {
  const rider = new Rider(track, r.lane, { maxSpeed: r.max, turboSpeed: r.turbo, name: r.name });
  rider.color = r.color;
  rider.mesh = buildBike(r.color, r.num);
  scene.add(rider.mesh.root);
  return rider;
});
const player = riders[0];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- input ----------
const keys = new Set();
let laneQueue = 0;
let autopilot = false;
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  audio.start();
  if (e.repeat) return;
  keys.add(e.key.toLowerCase());
  if (e.key === 'ArrowUp') laneQueue -= 1;
  if (e.key === 'ArrowDown') laneQueue += 1;
  if (e.key === 'Enter' && (state === 'title' || state === 'finished')) startRace();
  if (e.key.toLowerCase() === 'p') {
    autopilot = !autopilot;
    callout(autopilot ? 'AUTOPILOT' : 'MANUAL', 'blue', 900);
  }
  if (e.key.toLowerCase() === 'm') audio.toggleMute();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const humanInput = () => {
  const lean = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
  const input = {
    throttle: keys.has('z') || keys.has(' '),
    turbo: keys.has('x') || keys.has('shift'),
    lean,
    laneDelta: Math.sign(laneQueue),
  };
  if (!player.airborne) laneQueue = 0; // lane changes only happen on the ground
  return input;
};

// Where will this rider touch down? Quick ballistic simulation.
function predictLanding(r) {
  if (!r.airborne) return { x: r.x, slope: track.slope(r.x + 2) };
  let { x, y, vx, vy } = r;
  for (let i = 0; i < 150; i++) {
    vy -= G * 0.02;
    x += vx * 0.02;
    y += vy * 0.02;
    if (y <= track.height(x)) break;
  }
  return { x, slope: track.slope(x) };
}

// Shared by CPU riders and the P-key autopilot. `skill` 0..1.
function aiInput(r, skill) {
  const input = { throttle: true, turbo: r.heat < 45 + skill * 30, lean: 0, laneDelta: 0 };
  if (r.airborne) {
    const diff = wrap(r.pitch - predictLanding(r).slope);
    const deadzone = 0.06 + (1 - skill) * 0.3;
    input.lean = diff > deadzone ? 1 : diff < -deadzone ? -1 : 0;
    return input;
  }
  const lane = r.lane;
  const blocked = (l) =>
    riders.some((o) => o !== r && o.lane === l && o.x > r.x - 1 && o.x - r.x < 9 && (o.speed < r.speed || o.crashed)) ||
    (skill > 0.5 && track.inMud(r.x + 8, l));
  if (blocked(lane)) {
    const options = [lane - 1, lane + 1].filter((l) => l >= 0 && l < 4 && !blocked(l));
    if (options.length) input.laneDelta = options[0] - lane;
    else input.turbo = false;
  }
  return input;
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hud = { tempLabel: document.querySelector('.temp label'), root: $('hud'), place: $('place'), timer: $('timer'), speed: $('speed'), heat: $('heat'), stats: $('stats'), progress: $('progress') };
hud.dots = riders.map((r, i) => {
  const d = document.createElement('i');
  d.style.background = r.color;
  if (i === 0) d.className = 'me';
  hud.progress.appendChild(d);
  return d;
});
let calloutTimer;
function callout(text, cls = '', ms = 800) {
  const el = $('callout');
  el.textContent = text;
  el.className = `callout show ${cls}`;
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => (el.className = 'callout'), ms);
}
const ordinal = (n) => ['1<sup>st</sup>', '2<sup>nd</sup>', '3<sup>rd</sup>', '4<sup>th</sup>'][n - 1];
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// ---------- race flow ----------
let state = 'title';
let countdown = 0;
let raceTime = 0;
let shake = 0;
let placeNow = 1;

function startRace() {
  riders.forEach((r, i) => {
    r.lane = ROSTER[i].lane;
    r.z = LANES[r.lane];
    r.reset(START_X - 3);
  });
  laneQueue = 0;
  raceTime = 0;
  countdown = 3;
  state = 'countdown';
  $('title').hidden = true;
  $('results').hidden = true;
  hud.root.hidden = false;
  callout('3', 'gold', 700);
  audio.beep(false);
}

function standings() {
  return [...riders].sort((a, b) => {
    if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
    if (a.finishTime != null) return -1;
    if (b.finishTime != null) return 1;
    return b.x - a.x;
  });
}

const BEST_KEY = 'redline-mx.best';
const readBest = () => { try { return +localStorage.getItem(BEST_KEY) || null; } catch { return null; } };
let best = readBest();
let newRecord = false;

function showResults() {
  const rows = standings()
    .map((r, i) => `<tr class="${r === player ? 'me' : ''}"><td>${i + 1}.</td><td>${r.name}</td><td>${r.finishTime != null ? fmt(r.finishTime) : '--'}</td></tr>`)
    .join('');
  const el = $('results');
  el.className = 'screen results';
  el.innerHTML = `<h2>${placeNow === 1 ? 'YOU WIN!' : 'FINISH!'}</h2><table>${rows}</table>
    <p class="record">${newRecord ? '★ NEW RECORD ★' : best ? `best ${fmt(best)}` : ''}</p>
    <p>jumps ${player.jumps} · perfect landings ${player.perfects} · flips ${player.flips} · crashes ${player.crashes} · overheats ${player.overheats}</p>
    <p class="blink">PRESS ENTER TO RACE AGAIN</p>`;
  el.hidden = false;
}

function handleEvents(events) {
  for (const e of events) {
    const me = e.rider === player;
    const r = e.rider;
    if (e.type === 'crash') {
      for (let i = 0; i < 25; i++) world.puff(r.x, r.y, r.z, 2);
      if (me) { callout('CRASH!', 'red', 1100); shake = 0.8; audio.crash(); }
    } else if (e.type === 'land') {
      for (let i = 0; i < 8; i++) world.puff(r.x - 0.9, r.y, r.z, 1.2);
      if (me) {
        shake = Math.max(shake, 0.25);
        audio.land();
        if (e.flips) {
          const name = e.backflip ? 'BACKFLIP' : 'FRONTFLIP';
          callout(e.flips > 1 ? `${e.flips}× ${name}!` : `${name}!`, 'blue', 1100);
          audio.perfect();
          world.celebrate(r.x, r.y + 2, 40);
        } else if (e.perfect) { callout('PERFECT!', 'gold', 700); audio.perfect(); }
      }
    } else if (e.type === 'overheat' && me) {
      callout('OVERHEAT!', 'red', 1500);
      audio.crash();
    }
  }
}

// ---------- simulation ----------
const STEP = 1 / 120;
let acc = 0;

function simulate(dt) {
  const events = [];
  if (state === 'countdown') {
    const before = Math.ceil(countdown);
    countdown -= dt;
    const now = Math.ceil(countdown);
    if (now !== before) {
      if (now > 0) { callout(String(now), 'gold', 700); audio.beep(false); }
      else { callout('GO!', 'gold', 700); audio.beep(true); state = 'racing'; }
    }
    return;
  }
  if (state !== 'racing' && state !== 'finished') return;
  raceTime += dt;

  for (const r of riders) {
    let input;
    if (r === player) input = state === 'finished' ? {} : autopilot ? aiInput(r, 1) : humanInput();
    else input = aiInput(r, 0.55);
    r.update(dt, input, events);
    if (r.finishTime == null && r.x >= FINISH_X) r.finishTime = raceTime;
  }

  // Clip another rider's back wheel in your lane and you go down.
  for (const a of riders) for (const b of riders) {
    if (a === b || a.crashed || b.crashed || a.airborne || b.airborne) continue;
    if (Math.abs(a.z - b.z) < 1.2 && b.x - a.x > 0 && b.x - a.x < WHEELBASE && a.speed > b.speed + 1) {
      a.vy = 6;
      a.crash(events);
    }
  }
  handleEvents(events);

  if (state === 'racing' && player.finishTime != null) {
    state = 'finished';
    placeNow = standings().indexOf(player) + 1;
    newRecord = !best || player.finishTime < best;
    if (newRecord) {
      best = player.finishTime;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
    }
    callout('FINISH!', 'gold', 1500);
    world.celebrate(FINISH_X, player.y + 3, 260);
    setTimeout(showResults, 1200);
  }
}

// ---------- render ----------
// Narrow/tall windows (e.g. half a screen) pull the camera back to keep the pack in view.
let zoomOut = 1;
const fitCamera = () => { zoomOut = Math.min(1.7, Math.max(1, 1.6 / camera.aspect)); };
fitCamera();
const camPos = new THREE.Vector3(0, 6, 22);
const camLook = new THREE.Vector3();
const timer = new THREE.Timer();

function renderRiders(dt) {
  for (const r of riders) {
    const m = r.mesh;
    const lift = r.crashed ? 0.6 : Math.sin(r.wheelie) * WHEELBASE * 0.5;
    m.root.position.set(r.x, r.y + lift, r.z);
    m.root.rotation.z = r.pitch;
    const spin = (r.speed * dt) / WHEEL_R;
    m.rear.rotation.z -= spin;
    m.front.rotation.z -= spin;
    m.rider.rotation.z += ((r.airborne ? -r.lean * 0.35 : -0.05) - m.rider.rotation.z) * Math.min(1, dt * 10);
    m.flame.visible = r.turbo && !r.crashed;
    if (m.flame.visible) m.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    if (!r.airborne && !r.crashed && r.throttle && r.speed > 3 && Math.random() < 0.6) {
      const mud = track.inMud(r.x, r.lane);
      world.puff(r.x - WHEELBASE / 2 - 0.3, r.y, r.z, r.speed / 30, mud ? '#6b4a2b' : null);
    }
  }
}

function renderHUD() {
  const order = standings();
  placeNow = order.indexOf(player) + 1;
  hud.place.innerHTML = ordinal(placeNow);
  hud.timer.textContent = fmt(raceTime);
  hud.speed.textContent = Math.round(player.speed * 3.6);
  hud.heat.style.width = `${player.heat}%`;
  const hot = player.heat > 75;
  hud.heat.parentElement.parentElement.classList.toggle('hot', hot);
  hud.tempLabel.textContent = hot ? 'REDLINE' : 'TEMP';
  riders.forEach((r, i) => (hud.dots[i].style.left = `${Math.min(100, Math.max(0, ((r.x - START_X) / (FINISH_X - START_X)) * 100))}%`));
  hud.stats.innerHTML = `jumps ${player.jumps}<br>perfect ${player.perfects}<br>flips ${player.flips}<br>crashes ${player.crashes}<br>air ${player.maxAir.toFixed(2)}s${autopilot ? '<br><b style="color:#6cf">AUTOPILOT</b>' : ''}`;
}

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  acc += dt;
  while (acc >= STEP) { simulate(STEP); acc -= STEP; }

  renderRiders(dt);
  world.updateDust(dt);
  world.updateConfetti(dt);
  const t = timer.getElapsed();
  world.updateCrowd(t, player.x, player.airborne ? 1 : player.speed / 60);

  // Side-on camera that leads the player, like the NES original but in 3D.
  const idle = state === 'title';
  const target = idle
    ? new THREE.Vector3(START_X + 8 + Math.sin(t * 0.3) * 6, 5, 20)
    : new THREE.Vector3(player.x + 3, player.y * 0.6 + 5.5, (21 + player.speed * 0.08) * zoomOut);
  camPos.lerp(target, Math.min(1, dt * 4));
  camLook.lerp(new THREE.Vector3(idle ? START_X + 10 : player.x + 8, (idle ? 0 : player.y * 0.5) + 1.5 + (zoomOut - 1) * 9, 0), Math.min(1, dt * 5));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.5);
  }
  camera.lookAt(camLook);

  world.sun.position.set(camLook.x - 20, 40, 30);
  world.sun.target.position.set(camLook.x, 0, 0);

  if (state !== 'title') renderHUD();
  audio.engine(player.speed, player.turbo, state === 'racing' || state === 'countdown');
  renderer.render(scene, camera);
  app.frames += 1;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fitCamera();
});

// ---------- test hook ----------
// Tests call ai.state() which reads __app.snapshot(). Keep it plain data.
const app = (window.__app = {
  frames: 0,
  get ready() { return this.frames > 5; },
  snapshot() {
    const p = player;
    return {
      ready: this.ready,
      frames: this.frames,
      state,
      raceTime,
      autopilot,
      best,
      newRecord,
      finishX: FINISH_X,
      place: placeNow,
      player: {
        x: p.x, y: p.y, lane: p.lane, speed: p.speed, heat: p.heat, pitch: wrap(p.pitch), flips: p.flips,
        airborne: p.airborne, crashed: p.crashed, overheated: p.overheated,
        jumps: p.jumps, perfects: p.perfects, crashes: p.crashes, overheats: p.overheats,
        maxAir: p.maxAir, finishTime: p.finishTime, throttle: p.throttle, turbo: p.turbo,
        airSpin: p.airSpin, airTime: p.airTime, vy: p.vy,
      },
      landingSlope: predictLanding(p).slope,
      laneAhead: [0, 1, 2, 3].map((l) => ({
        mud: track.inMud(p.x + 8, l),
        rival: riders.some((o) => o !== p && o.lane === l && o.x > p.x - 1 && o.x - p.x < 9),
      })),
      rivals: riders.slice(1).map((r) => ({ name: r.name, x: r.x, lane: r.lane, speed: r.speed, finishTime: r.finishTime })),
    };
  },
});

// Debug helpers so tests can jump straight to one segment of the track.
app.debug = {
  track: () => ({
    ramps: track.ramps.map((r) => ({ x0: r.x0, h: r.h, end: r.x0 + r.up + r.top + r.down })),
    mud: track.mud.map((m) => ({ x0: m.x0, x1: m.x1, lanes: [...m.lanes] })),
    coolers: track.coolers.map((c) => ({ ...c })),
  }),
  teleport(x, lane = player.lane, speed = 0) {
    Object.assign(player, { x, lane, z: LANES[lane], y: track.height(x), airborne: false, speed, pitch: track.slope(x), crashTimer: 0 });
    // Park the rivals behind so they don't interfere.
    riders.slice(1).forEach((r, i) => Object.assign(r, { x: x - 40 - i * 5, y: track.height(x - 40 - i * 5), airborne: false, speed: 0 }));
    laneQueue = 0;
  },
  setHeat(h) { player.heat = h; },
};

setupTouch();
renderer.setAnimationLoop(frame);
