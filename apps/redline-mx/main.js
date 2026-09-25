import * as THREE from 'three';
import { buildTrack, LANES, START_X, FINISH_X, TRACK_HALF_WIDTH } from './track.js';
import { biomeById } from './biomes.js';
import { mulberry32 } from './rng.js';
import { createScenery } from './scenery.js';
import { createSpectators } from './spectators.js';
import { createWildlife } from './wildlife.js';
import { createWeather } from './weather.js';
import { buildWorld } from './world.js';
import { buildBike, WHEEL_R, WHEELBASE } from './bikes.js';
import { Rider } from './rider.js';
import { optimizeBike } from './optimize.js';
import { createItems } from './items.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import { setupTouch } from './touch.js';
import { createGarage } from './garage.js';
import { BIKES, ITEM_INFO, CUP, bikeById, statsFor, loadSave, writeSave, payout } from './progression.js';

// ---------- save + world selection ----------
const params = new URLSearchParams(location.search);
const save = loadSave();
if (params.get('biome')) save.biome = params.get('biome');
if (params.get('bike') && bikeById(params.get('bike')).id === params.get('bike')) {
  if (!save.owned.includes(params.get('bike'))) save.owned.push(params.get('bike')); // ?bike= for demos/tests
  save.bike = params.get('bike');
}
const biome = biomeById(save.biome);

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
const track = buildTrack(biome.seed);
const world = buildWorld(scene, track, biome);
const ctx = { THREE, scene, camera, renderer, biome, track, LANES, START_X, FINISH_X, TRACK_HALF_WIDTH, rng: mulberry32(biome.seed * 977) };
// ?off=scenery,spectators,… disables modules (for profiling).
const off = new Set((params.get('off') || '').split(','));
const stub = { update() {}, dispose() {} };
const weather = off.has('weather') ? stub : createWeather(ctx);
const modules = [
  off.has('scenery') ? stub : createScenery(ctx),
  off.has('spectators') ? stub : createSpectators(ctx),
  off.has('wildlife') ? stub : createWildlife(ctx),
  weather,
];
const items = createItems(ctx);
// Shadow budget: only the bikes cast shadows (added below). Scenery, crowds,
// animals and pickups receive but never cast — that halves the draw calls.
scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = false; });
const focus = { x: 0, y: 0, z: 0, speed: 0, airborne: false, excitement: 0, riders: [], cameraX: 0 };
const audio = createAudio();
const music = createMusic(biome.id);

// Shared by every rider; weather writes grip & wind into it each frame.
const env = { gravity: biome.physics.gravity, heatMul: biome.physics.heat, patch: biome.patch, weatherGrip: 1, wind: 0 };

// ---------- riders ----------
const playerBike = bikeById(save.bike);
const ROSTER = [
  { lane: 2, color: '#ff3b3b', num: '1', name: 'YOU', bike: playerBike.id },
  { lane: 0, color: '#3b7bff', num: '7', name: 'BLU', bike: 'sport', max: 30.5, turbo: 41 },
  { lane: 1, color: '#2ecc71', num: '3', name: 'GRN', bike: 'chopper', max: 31, turbo: 42 },
  { lane: 3, color: '#ff9f1a', num: '5', name: 'ORG', bike: 'hover', max: 29.5, turbo: 41 },
];
const riders = ROSTER.map((r, i) => {
  const stats = i === 0 ? statsFor(save, r.bike) : { ...bikeById(r.bike).stats, maxSpeed: r.max, turboSpeed: r.turbo, grip: 0.8, crashAngle: 0.9, spin: 1 };
  const rider = new Rider(track, r.lane, { stats, env, name: r.name });
  rider.color = r.color;
  rider.bikeId = r.bike;
  rider.mesh = optimizeBike(buildBike(r.bike, r.color, r.num));
  scene.add(rider.mesh.root);
  return rider;
});
const player = riders[0];

// Floating name tags over the rivals.
function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect(8, 8, 240, 48, 24); g.fill();
  g.fillStyle = color; g.font = 'italic 900 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.4, 0.6, 1);
  sp.renderOrder = 10;
  return sp;
}
const RIVAL_NAMES = { BLU: 'BLAZE', GRN: 'VIPER', ORG: 'NOVA' };
for (const r of riders.slice(1)) {
  r.tag = nameTag(RIVAL_NAMES[r.name] || r.name, r.color);
  scene.add(r.tag);
}

// ---------- ghost of your best run in this world ----------
const GHOST_KEY = `redline-mx.ghost.${biome.id}`;
const GHOST_DT = 0.05;
let ghostRun = null; // [x, y, z, pitch] samples every GHOST_DT
try { ghostRun = JSON.parse(localStorage.getItem(GHOST_KEY) || 'null'); } catch {}
let recording = [];
let recordClock = 0;
const ghost = optimizeBike(buildBike(playerBike.id, '#bfe9ff', 'G'));
ghost.root.traverse((o) => {
  if (!o.isMesh) return;
  o.castShadow = false;
  o.material = o.material.clone();
  o.material.transparent = true;
  o.material.opacity = 0.28;
  o.material.depthWrite = false;
});
ghost.root.visible = false;
scene.add(ghost.root);
function updateGhost() {
  if (!ghostRun || state === 'title' || state === 'garage') { ghost.root.visible = false; return; }
  const f = raceTime / GHOST_DT;
  const i = Math.min(Math.floor(f), ghostRun.length / 4 - 2);
  if (i < 0) return;
  const k = Math.min(1, f - i);
  const at = (j, o) => ghostRun[j * 4 + o] + (ghostRun[(j + 1) * 4 + o] - ghostRun[j * 4 + o]) * k;
  ghost.root.visible = true;
  ghost.root.position.set(at(i, 0), at(i, 1), at(i, 2));
  ghost.root.rotation.z = at(i, 3);
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Effect visuals on the player bike.
const shieldBubble = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.9, 2),
  new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.18, depthWrite: false })
);
shieldBubble.position.y = 1.1;
const aura = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 20, 12),
  new THREE.MeshBasicMaterial({ color: '#b388ff', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })
);
aura.position.y = 1.1;
player.mesh.root.add(shieldBubble, aura);

// ---------- input ----------
const keys = new Set();
let laneQueue = 0;
let autopilot = false;
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  audio.start();
  if ((state === 'racing' || state === 'countdown') && !music.playing) music.start();
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.key === 'ArrowUp') laneQueue -= 1;
  if (e.key === 'ArrowDown') laneQueue += 1;
  if (e.key === 'Enter') {
    if (state === 'finished' && save.cup) nextCupRound();
    else if (state === 'title' || state === 'finished' || state === 'cupdone') openGarage();
    else if (state === 'garage') raceFromGarage();
  }
  if (k === 'c') useAbility();
  if (k === 'p') {
    autopilot = !autopilot;
    callout(autopilot ? 'AUTOPILOT' : 'MANUAL', 'blue', 900);
  }
  if (k === 'm') { audio.toggleMute(); music.setMuted(audio.muted); }
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
    vy -= env.gravity * 0.02;
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
    (skill > 0.5 && track.inMud(r.x + 8, l) && r.stats.grip > 0.5);
  if (blocked(lane)) {
    const options = [lane - 1, lane + 1].filter((l) => l >= 0 && l < 4 && !blocked(l));
    if (options.length) input.laneDelta = options[0] - lane;
    else input.turbo = false;
  }
  return input;
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const speedLines = document.createElement('div');
speedLines.id = 'speedlines';
document.body.appendChild(speedLines);
const hud = {
  tempLabel: document.querySelector('.temp label'), root: $('hud'), place: $('place'), timer: $('timer'), speed: $('speed'),
  heat: $('heat'), stats: $('stats'), progress: $('progress'), coins: $('race-coins'), ability: $('ability'),
  abilityFill: $('ability-fill'), abilityName: $('ability-name'), effects: $('effects'),
};
hud.abilityName.textContent = playerBike.ability.name;
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
function pickupToast(kind) {
  const info = ITEM_INFO[kind];
  const t = document.createElement('div');
  t.className = 'pickup';
  t.textContent = info.label;
  t.style.color = info.color;
  $('pickups').appendChild(t);
  setTimeout(() => t.remove(), 900);
}
const ordinal = (n) => ['1<sup>st</sup>', '2<sup>nd</sup>', '3<sup>rd</sup>', '4<sup>th</sup>'][n - 1];
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// ---------- race flow ----------
let state = 'title';
let countdown = 0;
let raceTime = 0;
let shake = 0;
let placeNow = 1;
let raceCoins = 0;
let ability = 0; // 0..100
let abilityUses = 0;
let lastPayout = 0;
let newRecord = false;

const garage = createGarage($('garage'), save, { onRace: () => raceFromGarage(), onCup: () => raceFromGarage() });

function nextCupRound() {
  if (save.cup.round >= CUP.worlds.length) {
    // Cup over: trophy screen.
    const order = Object.entries(save.cup.points).sort((a, b) => b[1] - a[1]);
    const place = order.findIndex(([n]) => n === 'YOU') + 1;
    const prize = CUP.prize[place - 1];
    save.coins += prize;
    if (place === 1) save.trophies += 1;
    save.cup = null;
    writeSave(save);
    state = 'cupdone';
    const el = $('results');
    el.innerHTML = `<h2>${place === 1 ? '🏆 CHAMPION! 🏆' : `CUP: ${place}${['st', 'nd', 'rd', 'th'][place - 1]} PLACE`}</h2>
      <table>${order.map(([n, p], i) => `<tr class="${n === 'YOU' ? 'me' : ''}"><td>${i + 1}.</td><td>${n}</td><td>${p} pts</td></tr>`).join('')}</table>
      <p class="payout">+◉ ${prize} cup prize</p><p class="blink">PRESS ENTER FOR THE GARAGE</p>`;
    el.hidden = false;
    world.celebrate(player.x, player.y + 4, 400);
    return;
  }
  save.biome = CUP.worlds[save.cup.round];
  writeSave(save);
  location.search = `?race${autopilot ? '&autostart' : ''}`;
}

function openGarage() {
  state = 'garage';
  music.stop();
  $('title').hidden = true;
  $('results').hidden = true;
  hud.root.hidden = true;
  garage.show();
}

function raceFromGarage() {
  writeSave(save);
  // Changing world or bike rebuilds the scene, so reload into the race.
  if (save.biome !== biome.id || save.bike !== playerBike.id) {
    location.search = `?race${autopilot ? '&autostart' : ''}`;
    return;
  }
  garage.hide();
  startRace();
}

function startRace() {
  riders.forEach((r, i) => {
    r.lane = ROSTER[i].lane;
    r.z = LANES[r.lane];
    r.reset(START_X - 3);
  });
  player.shields = playerBike.stats.shields || 0;
  items.reset();
  recording = [];
  recordClock = 0;
  try { ghostRun = JSON.parse(localStorage.getItem(GHOST_KEY) || 'null'); } catch {}
  raceCoins = 0;
  ability = 0;
  abilityUses = 0;
  laneQueue = 0;
  raceTime = 0;
  countdown = 3;
  state = 'countdown';
  $('title').hidden = true;
  $('results').hidden = true;
  garage.hide();
  hud.root.hidden = false;
  music.start();
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

function showResults() {
  const rows = standings()
    .map((r, i) => `<tr class="${r === player ? 'me' : ''}"><td>${i + 1}.</td><td>${r.name}</td><td>${bikeById(r.bikeId).name}</td><td>${r.finishTime != null ? fmt(r.finishTime) : '--'}</td></tr>`)
    .join('');
  const el = $('results');
  el.className = 'screen results';
  const best = save.best[biome.id];
  el.innerHTML = `<h2>${placeNow === 1 ? 'YOU WIN!' : 'FINISH!'}</h2><table>${rows}</table>
    <p class="record">${newRecord ? '★ NEW RECORD ★' : best ? `best ${fmt(best)}` : ''}</p>
    <p class="payout">+◉ ${lastPayout} <small>(${raceCoins} coins · ${player.flips} flips · ${player.perfects} perfect · ${player.crashes} crashes)</small></p>
    ${save.cup ? `<div class="cup-table"><b>CUP · after round ${save.cup.round}/5</b>
      ${Object.entries(save.cup.points).sort((a, b) => b[1] - a[1]).map(([n, p]) => `<span class="${n === 'YOU' ? 'me' : ''}">${n} ${p}</span>`).join('')}</div>` : ''}
    <p class="blink">${save.cup ? (save.cup.round >= CUP.worlds.length ? 'PRESS ENTER FOR THE CUP RESULTS' : `PRESS ENTER · NEXT: ${biomeById(CUP.worlds[save.cup.round]).name}`) : 'PRESS ENTER FOR THE GARAGE'}</p>`;
  el.hidden = false;
}

function finishRace() {
  state = 'finished';
  placeNow = standings().indexOf(player) + 1;
  const prev = save.best[biome.id];
  newRecord = !prev || player.finishTime < prev;
  if (newRecord) {
    save.best[biome.id] = player.finishTime;
    try { localStorage.setItem(GHOST_KEY, JSON.stringify(recording)); } catch {}
  }
  lastPayout = payout({ place: placeNow, coins: raceCoins, flips: player.flips, perfects: player.perfects, crashes: player.crashes });
  if (save.cup && CUP.worlds[save.cup.round] === biome.id) {
    // Rivals that haven't finished yet are placed by distance.
    standings().forEach((r, i) => (save.cup.points[r.name] += CUP.points[i]));
    save.cup.results.push({ biome: biome.id, place: placeNow });
    save.cup.round += 1;
  }
  save.coins += lastPayout;
  save.races += 1;
  writeSave(save);
  callout('FINISH!', 'gold', 1500);
  world.celebrate(FINISH_X, player.y + 3, 260);
  setTimeout(showResults, 1200);
}

// ---------- abilities & items ----------
const charge = (n) => {
  const was = ability;
  ability = Math.min(100, ability + n);
  if (was < 100 && ability >= 100) callout(`${playerBike.ability.name} READY — C`, 'blue', 900);
};

function useAbility(events = []) {
  if (state !== 'racing' || ability < 100 || player.crashed) return false;
  ability = 0;
  abilityUses += 1;
  const id = playerBike.ability.id;
  callout(playerBike.ability.name + '!', 'blue', 900);
  audio.perfect();
  if (id === 'hop') player.hop(20);
  else if (id === 'shockwave') {
    shake = 1;
    for (let i = 0; i < 40; i++) world.puff(player.x + (Math.random() - 0.5) * 30, player.y, (Math.random() - 0.5) * 12, 3);
    for (const r of riders) if (r !== player && Math.abs(r.x - player.x) < 30) { r.vy = 10; r.crash(events); }
  } else if (id === 'slipstream') player.give('slipstream', 4);
  else if (id === 'phase') player.give('phase', 5);
  else if (id === 'overdrive') player.give('overdrive', 6);
  else if (id === 'afterburner') player.give('afterburner', 2.5);
  handleEvents(events);
  return true;
}

function applyItem(kind) {
  pickupToast(kind);
  if (kind === 'coin') { raceCoins += 1; charge(3); audio.beep(true); return; }
  audio.perfect();
  if (kind === 'nitro') player.give('nitro', 1.6);
  else if (kind === 'shield') player.shields = Math.min(3, player.shields + 1);
  else if (kind === 'ice') player.heat = 0;
  else if (kind === 'magnet') player.give('magnet', 8);
  else if (kind === 'rocket') player.hop(16);
  else if (kind === 'star') charge(50);
  else if (kind === 'ring') { raceCoins += 5; charge(35); world.celebrate(player.x, player.y + 1, 30); }
}

function handleEvents(events) {
  for (const e of events) {
    const me = e.rider === player;
    const r = e.rider;
    if (e.type === 'crash') {
      for (let i = 0; i < 25; i++) world.puff(r.x, r.y, r.z, 2);
      if (me) { callout('CRASH!', 'red', 1100); shake = 0.8; audio.crash(); }
    } else if (e.type === 'shield' && me) {
      callout('SHIELD SAVED YOU!', 'blue', 1000);
      audio.land();
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
          charge(40 * e.flips);
        } else if (e.perfect) { callout('PERFECT!', 'gold', 700); audio.perfect(); charge(25); }
      }
    } else if (e.type === 'boost' && me) {
      pickupToast('boost');
    } else if (e.type === 'overheat' && me) {
      callout('OVERHEAT!', 'red', 1500);
      audio.crash();
    }
  }
}

// ---------- simulation ----------
const STEP = 1 / 120;
let acc = 0;
let simTime = 0;

function simulate(dt) {
  const events = [];
  simTime += dt;
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
  if (state === 'racing') {
    recordClock += dt;
    while (recordClock >= GHOST_DT) {
      recordClock -= GHOST_DT;
      recording.push(+player.x.toFixed(2), +player.y.toFixed(2), +player.z.toFixed(2), +wrap(player.pitch).toFixed(3));
    }
  }
  env.weatherGrip = weather.grip ?? 1;
  env.wind = weather.wind ?? 0;

  for (const r of riders) {
    let input;
    if (r === player) input = state === 'finished' ? {} : autopilot ? aiInput(r, 1) : humanInput();
    else input = aiInput(r, 0.55);
    r.update(dt, input, events);
    if (r.finishTime == null && r.x >= FINISH_X) r.finishTime = raceTime;
  }
  if (state === 'racing') {
    charge(dt * 2);
    if (autopilot && ability >= 100) useAbility(events);
    for (const kind of items.update(dt, simTime, player)) applyItem(kind);
  }

  // Clip another rider's back wheel in your lane and you go down.
  for (const a of riders) for (const b of riders) {
    if (a === b || a.crashed || b.crashed || a.airborne || b.airborne || a.has('phase') || b.has('phase')) continue;
    if (Math.abs(a.z - b.z) < 1.2 && b.x - a.x > 0 && b.x - a.x < WHEELBASE && a.speed > b.speed + 1) {
      a.vy = 6;
      a.crash(events);
    }
  }
  handleEvents(events);

  if (state === 'racing' && player.finishTime != null) finishRace();
}

// ---------- render ----------
// Narrow/tall windows (e.g. half a screen) pull the camera back to keep the pack in view.
let zoomOut = 1;
const fitCamera = () => { zoomOut = Math.min(1.7, Math.max(1, 1.6 / camera.aspect)); };
fitCamera();
const camPos = new THREE.Vector3(0, 6, 22);
const camLook = new THREE.Vector3();
const timer = new THREE.Timer();

// On a crash the rider is thrown clear of the bike and tumbles, then climbs back on.
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
function updateRagdoll(r, dt) {
  const m = r.mesh;
  if (r.crashed && !r.ragdoll) {
    m.rider.getWorldPosition(tmpV);
    m.rider.getWorldQuaternion(tmpQ);
    r.ragdoll = { home: { p: m.rider.position.clone(), q: m.rider.quaternion.clone() }, v: new THREE.Vector3(r.speed * 0.5 + 4, 9, (Math.random() - 0.5) * 4), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 4, 6 + Math.random() * 6) };
    scene.attach(m.rider);
    r.ragdolls = (r.ragdolls || 0) + 1;
  }
  if (r.ragdoll && r.crashed) {
    const d = r.ragdoll;
    d.v.y -= env.gravity * 0.7 * dt;
    m.rider.position.addScaledVector(d.v, dt);
    const floor = track.height(m.rider.position.x) - 0.6;
    if (m.rider.position.y < floor) {
      m.rider.position.y = floor;
      d.v.y = Math.abs(d.v.y) * 0.35;
      d.v.x *= 0.6;
      d.spin.multiplyScalar(0.6);
    }
    m.rider.rotation.x += d.spin.x * dt;
    m.rider.rotation.y += d.spin.y * dt;
    m.rider.rotation.z += d.spin.z * dt;
  } else if (r.ragdoll) {
    m.body.add(m.rider);
    m.rider.position.copy(r.ragdoll.home.p);
    m.rider.quaternion.copy(r.ragdoll.home.q);
    r.ragdoll = null;
  }
}

function renderRiders(dt, t) {
  for (const r of riders) {
    const m = r.mesh;
    updateRagdoll(r, dt);
    const lift = r.crashed ? 0.6 : Math.sin(r.wheelie) * WHEELBASE * 0.5;
    m.root.position.set(r.x, r.y + lift, r.z);
    m.root.rotation.z = r.pitch;
    const spin = (r.speed * dt) / WHEEL_R;
    m.rear.rotation.z -= spin;
    m.front.rotation.z -= spin;
    if (!r.ragdoll) m.rider.rotation.z += ((r.airborne ? -r.lean * 0.35 : -0.05) - m.rider.rotation.z) * Math.min(1, dt * 10);
    const boosting = r.has('nitro') || r.has('afterburner') || r.has('slipstream');
    m.flame.visible = (r.turbo || boosting) && !r.crashed;
    if (m.flame.visible) m.flame.scale.set(boosting ? 1.8 : 1, (boosting ? 1.6 : 0.7) + Math.random() * 0.6, boosting ? 1.8 : 1);
    m.root.visible = !r.has('phase') || Math.floor(t * 20) % 2 === 0;
    if (!r.airborne && !r.crashed && r.throttle && r.speed > 3 && Math.random() < 0.6) {
      world.puff(r.x - WHEELBASE / 2 - 0.3, r.y, r.z, r.speed / 30, r.patch ? biome.mud : null);
    }
  }
  shieldBubble.visible = player.shields > 0 && !player.crashed;
  shieldBubble.rotation.y += dt;
  const auraOn = player.has('overdrive') || player.has('slipstream') || player.has('phase');
  aura.material.opacity += ((auraOn ? 0.25 : 0) - aura.material.opacity) * Math.min(1, dt * 6);
  aura.material.color.set(player.has('overdrive') ? '#ff8a00' : player.has('phase') ? '#b388ff' : '#00e5ff');
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
  hud.coins.textContent = `◉ ${raceCoins}`;
  hud.abilityFill.style.width = `${ability}%`;
  hud.ability.classList.toggle('ready', ability >= 100);
  const fx = Object.entries(player.effects).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v.toFixed(1)}s`);
  if (player.shields) fx.unshift(`shield ×${player.shields}`);
  hud.effects.textContent = fx.join(' · ');
  hud.stats.innerHTML = `jumps ${player.jumps}<br>perfect ${player.perfects}<br>flips ${player.flips}<br>crashes ${player.crashes}<br>air ${player.maxAir.toFixed(2)}s${autopilot ? '<br><b style="color:#6cf">AUTOPILOT</b>' : ''}`;
}

// ---------- adaptive quality ----------
// 2 = full res + shadows, 1 = 1x res + smaller shadows, 0 = 0.7x res, no shadows, shorter draw distance.
// Watches real frame times and steps down when the machine can't keep up. ?quality=0|1|2 pins it.
const pinnedQuality = params.has('quality') ? +params.get('quality') : null;
let quality = pinnedQuality ?? 2;
function applyQuality(q) {
  quality = q;
  renderer.setPixelRatio(q === 2 ? Math.min(devicePixelRatio, 2) : q === 1 ? 1 : 0.7);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q > 0;
  world.sun.castShadow = q > 0;
  if (q === 1 && world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  world.sun.shadow.mapSize.set(q === 2 ? 2048 : 1024, q === 2 ? 2048 : 1024);
  camera.far = q === 0 ? 170 : 400;
  camera.updateProjectionMatrix();
  scene.traverse((o) => o.material && (o.material.needsUpdate = true));
}
let qWindow = [];
function watchQuality(realDt) {
  if (pinnedQuality !== null || state === 'title' || state === 'garage') return;
  qWindow.push(realDt);
  if (qWindow.length < 90) return;
  const avg = qWindow.reduce((a, b) => a + b, 0) / qWindow.length;
  qWindow = [];
  if (avg > 1 / 40 && quality > 0) applyQuality(quality - 1);
}
if (pinnedQuality !== null) applyQuality(pinnedQuality);

let timeScale = 1;
const perf = { frame: 0, sim: 0, modules: {}, render: 0 };
const ema = (a, b) => a * 0.9 + b * 0.1;
function frame(now) {
  const t0 = performance.now();
  timer.update(now);
  // Physics steps at a fixed 1/120s, so we can catch up on slow frames without slow-motion.
  const rawDt = timer.getDelta();
  watchQuality(rawDt);
  const realDt = Math.min(rawDt, 1 / 8);
  // Cinematic slow-mo at the top of really big air (never on autopilot/tests' hot path for long).
  const bigAir = state === 'racing' && player.airborne && player.airTime > 0.45 && Math.abs(player.vy) < 6;
  timeScale += ((bigAir ? 0.45 : 1) - timeScale) * Math.min(1, realDt * 8);
  const dt = realDt * timeScale;
  acc += dt;
  const ts = performance.now();
  while (acc >= STEP) { simulate(STEP); acc -= STEP; }
  perf.sim = ema(perf.sim, performance.now() - ts);
  const t = timer.getElapsed();

  renderRiders(dt, t);
  updateGhost();
  for (const r of riders.slice(1)) {
    r.tag.position.set(r.x, r.y + 3.4, r.z);
    r.tag.visible = state !== 'title' && state !== 'garage';
  }
  world.updateDust(dt, camera);
  world.updateConfetti(dt);
  if (state === 'title' || state === 'garage') items.update(dt, t, { x: START_X, y: 0, z: 99, has: () => false, crashed: true });
  Object.assign(focus, {
    x: player.x, y: player.y, z: player.z, speed: player.speed, airborne: player.airborne,
    excitement: player.airborne ? 1 : Math.min(1, player.speed / 50), cameraX: camera.position.x,
  });
  focus.riders = riders.map((r) => ({ x: r.x, y: r.y, z: r.z, airborne: r.airborne }));
  modules.forEach((m, i) => {
    const tm = performance.now();
    m.update(dt, t, focus);
    const name = ['scenery', 'spectators', 'wildlife', 'weather'][i];
    perf.modules[name] = ema(perf.modules[name] || 0, performance.now() - tm);
  });

  // Side-on camera that leads the player.
  const idle = state === 'title' || state === 'garage';
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

  if (state !== 'title' && state !== 'garage') renderHUD();
  speedLines.classList.toggle('on', state === 'racing' && (player.has('nitro') || player.has('afterburner') || player.has('slipstream')));
  document.body.classList.toggle('slowmo', timeScale < 0.8);
  audio.engine(player.speed, player.turbo, state === 'racing' || state === 'countdown');
  music.setIntensity(player.turbo || player.airborne || player.has('nitro') ? 1 : player.speed / 60);
  const tr = performance.now();
  renderer.render(scene, camera);
  perf.render = ema(perf.render, performance.now() - tr);
  perf.frame = ema(perf.frame, performance.now() - t0);
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
      perf: JSON.parse(JSON.stringify(perf)),
      quality,
      render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
      state,
      biome: biome.id,
      bike: playerBike.id,
      raceTime,
      autopilot,
      best: save.best[biome.id] ?? null,
      newRecord,
      finishX: FINISH_X,
      place: placeNow,
      raceCoins,
      bank: save.coins,
      lastPayout,
      cup: save.cup ? { round: save.cup.round, points: { ...save.cup.points } } : null,
      trophies: save.trophies,
      music: { playing: music.playing, bpm: music.bpm },
      timeScale,
      riderThrown: !!player.ragdoll,
      ragdolls: player.ragdolls || 0,
      ghost: { loaded: !!ghostRun, visible: ghost.root.visible, x: ghost.root.position.x, samples: recording.length / 4 },
      ability,
      abilityUses,
      env: { ...env },
      player: {
        x: p.x, y: p.y, z: p.z, lane: p.lane, speed: p.speed, heat: p.heat, pitch: wrap(p.pitch), flips: p.flips,
        airborne: p.airborne, crashed: p.crashed, overheated: p.overheated,
        jumps: p.jumps, perfects: p.perfects, crashes: p.crashes, overheats: p.overheats,
        maxAir: p.maxAir, finishTime: p.finishTime, throttle: p.throttle, turbo: p.turbo,
        airSpin: p.airSpin, airTime: p.airTime, vy: p.vy, shields: p.shields,
        effects: Object.fromEntries(Object.entries(p.effects).filter(([, v]) => v > 0)),
        stats: p.stats, patch: !!p.patch,
      },
      landingSlope: predictLanding(p).slope,
      laneAhead: [0, 1, 2, 3].map((l) => ({
        mud: track.inMud(p.x + 8, l),
        rival: riders.some((o) => o !== p && o.lane === l && o.x > p.x - 1 && o.x - p.x < 9),
      })),
      rivals: riders.slice(1).map((r) => ({ name: r.name, x: r.x, lane: r.lane, speed: r.speed, finishTime: r.finishTime, crashed: r.crashed })),
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
  boosts: () => track.boosts.map((b) => ({ ...b })),
  items: () => items.items.map((it) => ({ kind: it.kind, x: it.x, lane: it.lane, lift: it.lift, taken: it.taken })),
  teleport(x, lane = player.lane, speed = 0) {
    Object.assign(player, { x, lane, z: LANES[lane], y: track.height(x), airborne: false, speed, pitch: track.slope(x), crashTimer: 0 });
    // Park the rivals behind so they don't interfere.
    riders.slice(1).forEach((r, i) => Object.assign(r, { x: x - 40 - i * 5, y: track.height(x - 40 - i * 5), airborne: false, speed: 0 }));
    laneQueue = 0;
  },
  // Put a rival right in front of the player (for shockwave tests).
  rivalAhead(dx = 8) {
    const r = riders[1];
    Object.assign(r, { x: player.x + dx, y: track.height(player.x + dx), airborne: false, crashTimer: 0 });
  },
  setHeat(h) { player.heat = h; },
  // Launch the player so they sail through the ring at x (tests).
  flyThrough(x, lane, lift) {
    const gx = x - 6;
    Object.assign(player, { x: gx, lane, z: LANES[lane], airborne: true, vx: 30, vy: 0, speed: 30, crashTimer: 0 });
    player.y = track.height(x) + lift - 1 + 0.5 * env.gravity * (6 / 30) ** 2;
    player.pitch = 0;
  },
  shield() { player.shields = Math.min(3, player.shields + 1); },
  charge(n = 100) { charge(n); },
  giveCoins(n) { save.coins += n; writeSave(save); garage.render(); },
};

setupTouch();
if (params.has('autostart')) autopilot = true;
if (params.has('race') || params.has('autostart')) startRace();
renderer.setAnimationLoop(frame);
