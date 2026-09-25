// Garage data: bikes you can own, their special abilities, upgrade tracks,
// and the save file (coins, unlocks, upgrade levels, best times).

export const BIKES = [
  {
    id: 'dirt', name: 'Mud Hornet', price: 0,
    blurb: 'Balanced all-rounder. Grippy in the muck.',
    stats: { maxSpeed: 32, turboSpeed: 44, accel: 22, spin: 1, crashAngle: 0.9, grip: 0.8, heatRate: 30, cooling: 18 },
    ability: { id: 'hop', name: 'ROCKET HOP', blurb: 'Launch straight up — clear anything', cost: 100 },
  },
  {
    id: 'chopper', name: 'Iron Buffalo', price: 400,
    blurb: 'Heavy, stable, forgiving landings. Slow to spin.',
    stats: { maxSpeed: 31, turboSpeed: 43, accel: 18, spin: 0.75, crashAngle: 1.15, grip: 0.9, heatRate: 26, cooling: 20 },
    ability: { id: 'shockwave', name: 'SHOCKWAVE', blurb: 'Knock down every rival near you', cost: 100 },
  },
  {
    id: 'sport', name: 'Viper GT', price: 700,
    blurb: 'Top speed monster. Hates mud.',
    stats: { maxSpeed: 35, turboSpeed: 49, accel: 26, spin: 0.95, crashAngle: 0.8, grip: 1.1, heatRate: 34, cooling: 18 },
    ability: { id: 'slipstream', name: 'SLIPSTREAM', blurb: '4s of extra top speed, zero heat', cost: 100 },
  },
  {
    id: 'hover', name: 'Photon Ghost', price: 1000,
    blurb: 'Floats over patches, twitchy in the air.',
    stats: { maxSpeed: 33, turboSpeed: 46, accel: 24, spin: 1.3, crashAngle: 0.85, grip: 0.3, heatRate: 30, cooling: 22 },
    ability: { id: 'phase', name: 'PHASE', blurb: '5s ghost mode: nothing can crash you', cost: 100 },
  },
  {
    id: 'mech', name: 'Titan Walker-X', price: 1400,
    blurb: 'Armoured tank. Starts every race with a shield.',
    stats: { maxSpeed: 31, turboSpeed: 45, accel: 20, spin: 0.85, crashAngle: 1.0, grip: 0.6, heatRate: 24, cooling: 24, shields: 1 },
    ability: { id: 'overdrive', name: 'OVERDRIVE', blurb: '6s: ignore patches and heat', cost: 100 },
  },
  {
    id: 'retro', name: 'Tin Rocket 1950', price: 2000,
    blurb: 'Rocket-powered relic. Terrifying and wonderful.',
    stats: { maxSpeed: 33, turboSpeed: 50, accel: 23, spin: 1.15, crashAngle: 0.85, grip: 1, heatRate: 36, cooling: 16 },
    ability: { id: 'afterburner', name: 'AFTERBURNER', blurb: '2.5s of rocket thrust — even in the air', cost: 100 },
  },
];

export const UPGRADES = [
  { id: 'engine', name: 'Engine', blurb: '+1.2 top speed / level', apply: (s, l) => { s.maxSpeed += 1.2 * l; s.accel += 1.5 * l; } },
  { id: 'turbo', name: 'Turbo', blurb: '+1.5 turbo speed / level', apply: (s, l) => { s.turboSpeed += 1.5 * l; s.turboAccel = (s.turboAccel ?? 32) + 2 * l; } },
  { id: 'radiator', name: 'Radiator', blurb: '−10% heat, +cooling / level', apply: (s, l) => { s.heatRate *= 1 - 0.1 * l; s.cooling += 2 * l; } },
  { id: 'suspension', name: 'Suspension', blurb: 'Survive sloppier landings', apply: (s, l) => { s.crashAngle += 0.05 * l; } },
  { id: 'tires', name: 'Tires', blurb: 'Shrug off mud, ice, oil & lava', apply: (s, l) => { s.grip *= 1 - 0.15 * l; } },
];
export const MAX_LEVEL = 5;
export const upgradePrice = (level) => 80 * (level + 1) ** 2; // 80, 320, 720, 1280, 2000

export const ITEM_INFO = {
  coin: { label: '+COIN', color: '#ffcf40' },
  nitro: { label: 'NITRO!', color: '#ff3b3b' },
  shield: { label: 'SHIELD', color: '#00e5ff' },
  ice: { label: 'COOLANT', color: '#9ff' },
  magnet: { label: 'MAGNET', color: '#ff2d95' },
  rocket: { label: 'ROCKET', color: '#ff8a00' },
  star: { label: 'ABILITY +50%', color: '#b388ff' },
};

// Race payout: place bonus + tricks + whatever you grabbed.
export function payout({ place, coins, flips, perfects, crashes }) {
  const placeBonus = [250, 150, 90, 50][place - 1] ?? 0;
  return Math.max(0, placeBonus + coins * 10 + flips * 60 + perfects * 8 - crashes * 10);
}

// ---------- save file ----------
const KEY = 'redline-mx.save.v1';
const fresh = () => ({ coins: 0, owned: ['dirt'], bike: 'dirt', biome: 'stadium', upgrades: {}, best: {}, races: 0 });

export function loadSave() {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return fresh();
  }
}
export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {}
}
export const SAVE_KEY = KEY;

export const bikeById = (id) => BIKES.find((b) => b.id === id) || BIKES[0];
export const upgradeLevels = (save, bikeId) => save.upgrades[bikeId] || {};

// Final stats for a bike after its upgrades.
export function statsFor(save, bikeId) {
  const bike = bikeById(bikeId);
  const s = { turboAccel: 32, ...bike.stats };
  const levels = upgradeLevels(save, bikeId);
  for (const u of UPGRADES) u.apply(s, levels[u.id] || 0);
  return s;
}
