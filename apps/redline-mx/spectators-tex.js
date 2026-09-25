// Canvas textures for spectators.js: sign atlas (2x8 slogans), flag atlas
// (2x2 designs), soft glow and camera-flash sprites. No network assets.
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const BASE_SLOGANS = ['SEND IT!', 'REDLINE!', 'FULL THROTTLE', '#1 FAN', 'BRAAAP!', 'HOLESHOT!', 'BIG AIR!', 'NO BRAKES', 'WHIP IT!', 'GO #1 GO!', '10/10 AIR', 'HI MOM!', 'FLY HIGH!', 'LET\'S GO!'];
const BIOME_SLOGANS = {
  stadium: ['LOUD HOUSE', 'SEND IT!!'],
  canyon: ['YEEHAW!', 'DUST EM!'],
  alpine: ['SNOW WAY!', 'ICE COLD'],
  neon: ['BEEP BOOP', 'OVERCLOCK'],
  volcano: ['HOT LAP!', 'LAVA LUV'],
};
const SIGN_COLORS = [
  ['#ffd23f', '#111'], ['#e63946', '#fff'], ['#ffffff', '#e63946'], ['#1d3557', '#ffd23f'],
  ['#3bceac', '#111'], ['#ff5d8f', '#fff'], ['#111111', '#39ff14'], ['#ff7b00', '#fff'],
];

// 2 columns x 8 rows, tile 256x128. Tile (c, r) → uv offset (c*0.5, 1-(r+1)*0.125).
export function makeSignAtlas(biomeId) {
  const slogans = [...BASE_SLOGANS, ...(BIOME_SLOGANS[biomeId] || BIOME_SLOGANS.stadium)];
  return canvasTex(512, 1024, (g) => {
    slogans.forEach((s, i) => {
      const c = i % 2;
      const r = Math.floor(i / 2);
      const [bg, fg] = SIGN_COLORS[i % SIGN_COLORS.length];
      const x = c * 256;
      const y = r * 128;
      g.fillStyle = bg;
      g.fillRect(x, y, 256, 128);
      g.strokeStyle = fg;
      g.lineWidth = 8;
      g.strokeRect(x + 8, y + 8, 240, 112);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = 64;
      g.font = `900 ${size}px Impact, 'Arial Black', system-ui, sans-serif`;
      while (g.measureText(s).width > 220 && size > 20) {
        size -= 2;
        g.font = `900 ${size}px Impact, 'Arial Black', system-ui, sans-serif`;
      }
      g.fillText(s, x + 128, y + 66);
    });
  });
}
export const signTile = (i) => [(i % 2) * 0.5, 1 - (Math.floor(i / 2) + 1) * 0.125];

// 2x2 flag designs, tile 256x160.
export function makeFlagAtlas() {
  return canvasTex(512, 320, (g) => {
    const text = (s, x, y, color, size = 46) => {
      g.fillStyle = color;
      g.font = `900 italic ${size}px Impact, 'Arial Black', system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s, x, y);
    };
    // 0: checkered
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      g.fillRect(i * 32, j * 32, 32, 32);
    }
    // 1: red REDLINE
    g.fillStyle = '#d7263d'; g.fillRect(256, 0, 256, 160);
    g.fillStyle = '#fff'; g.fillRect(256, 110, 256, 14);
    text('REDLINE', 384, 64, '#fff');
    // 2: blue/white stripes #1
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#fff' : '#1d6fe0'; g.fillRect(0, 160 + i * 32, 256, 32); }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(128, 240, 52, 0, Math.PI * 2); g.fill();
    text('#1', 128, 242, '#1d3557', 60);
    // 3: yellow/black SEND IT
    g.fillStyle = '#ffd23f'; g.fillRect(256, 160, 256, 160);
    g.fillStyle = '#111';
    for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(256 + i * 40, 160); g.lineTo(276 + i * 40, 160); g.lineTo(256 + i * 40 - 20, 190); g.lineTo(236 + i * 40 - 20, 190); g.fill(); }
    text('SEND IT', 384, 250, '#111', 50);
  });
}
export const flagTile = (i) => [(i % 2) * 0.5, 1 - (Math.floor(i / 2) + 1) * 0.5];

export function makeGlowTexture() {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
}

export function makeFlashTexture() {
  return canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.12, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.35, 'rgba(200,225,255,0.25)');
    r.addColorStop(1, 'rgba(200,225,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[128, 6], [6, 128]]) {
      const lg = g.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(64 - w / 2, 64 - h / 2, w, h);
    }
  });
}
