// Weather per biome: clear skies, sandstorms, snow, rain + lightning, embers.
// Every particle volume is one THREE.Points / LineSegments whose motion runs in
// the vertex shader: base positions are wrapped (mod) inside a box that follows
// the camera, and JS only integrates a per-field offset. So the whole module is
// a handful of draw calls and O(1) JS per frame (plus ≤400 ripple checks).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- shared shader pieces ----------
const WRAP = /* glsl */ `
uniform vec3 uOffset; uniform vec3 uCenter; uniform vec3 uBox; uniform float uTime; uniform float uSwirl;
vec3 wrapPos(vec3 base, vec4 r) {
  vec3 p = base + uOffset * (0.65 + 0.7 * r.x);
  float ph = r.y * 6.2831;
  p += vec3(sin(uTime * (0.9 + r.x) + ph), sin(uTime * 1.7 + ph * 2.0) * 0.35, cos(uTime * (0.7 + r.z) + ph)) * uSwirl;
  vec3 lo = uCenter - uBox * 0.5;
  return lo + mod(p - lo, uBox);
}
float edgeFade(vec3 p) {
  vec3 q = abs(p - uCenter) / (uBox * 0.5);
  return 1.0 - smoothstep(0.82, 1.0, max(max(q.x, q.y), q.z));
}`;

// shape: 0 soft disc, 1 horizontal streak (sand), 2 hot glow (ember), 3 flake with dark rim
function pointsMaterial({ shape = 0, color = '#fff', color2, size = 0.1, opacity = 1, additive = false, maxPx = 36 }) {
  return new THREE.ShaderMaterial({
    defines: { SHAPE: shape },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uOffset: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(90, 34, 44) },
      uTime: { value: 0 }, uSwirl: { value: 0 }, uScale: { value: 500 }, uSize: { value: size }, uMaxPx: { value: maxPx },
      uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(color2 || color) }, uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      ${WRAP}
      attribute vec4 aRand;
      uniform float uScale; uniform float uSize; uniform float uMaxPx;
      varying float vAlpha; varying float vMix;
      void main() {
        vec3 p = wrapPos(position, aRand);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(uMaxPx, uSize * (0.5 + aRand.z) * uScale / max(d, 0.1));
        vAlpha = edgeFade(p) * smoothstep(1.5, 5.0, d);
        vMix = fract(aRand.w * 7.0 + uTime * (0.5 + aRand.x) * 0.6);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uColor2; uniform float uOpacity;
      varying float vAlpha; varying float vMix;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        #if SHAPE == 1
          c *= vec2(0.55, 3.2);
        #endif
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        float a = 1.0 - smoothstep(0.35, 1.0, r);
        vec3 col = mix(uColor, uColor2, vMix);
        #if SHAPE == 2
          a = pow(1.0 - r, 1.6);
          float flick = 0.55 + 0.45 * sin(vMix * 6.2831);
          col = mix(col, vec3(1.0, 0.95, 0.7), pow(1.0 - r, 5.0)) * (0.6 + flick);
        #endif
        #if SHAPE == 3
          col *= mix(1.0, 0.78, smoothstep(0.5, 0.95, r));
        #endif
        gl_FragColor = vec4(col, a * vAlpha * uOpacity);
      }`,
  });
}

function field(count, mat, rng) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  const box = mat.uniforms.uBox.value;
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng() * box.x; pos[i * 3 + 1] = rng() * box.y; pos[i * 3 + 2] = rng() * box.z;
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = rng();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glowTex = (inner, outer) => canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

export function createWeather(ctx) {
  const { scene, camera, renderer, biome, track } = ctx;
  const rng = ctx.rng || Math.random;
  const kind = biome.weather;
  const added = [];
  const disposables = [];
  const fields = []; // { mat, vel: Vector3 (units/s), boxOffset }
  const add = (o) => { scene.add(o); added.push(o); if (o.geometry) disposables.push(o.geometry); if (o.material) disposables.push(o.material); return o; };

  const api = { grip: 1, wind: 0, flash: 0, update, dispose };

  // Fog: we only ever scale around the biome's own values and restore them.
  const fog = scene.fog;
  const fogBase = fog ? { near: fog.near, far: fog.far, color: fog.color.clone() } : null;
  const tmpCol = new THREE.Color();
  const setFog = (thick, tint, tintAmt = 0) => {
    if (!fog) return;
    fog.near = fogBase.near * (1 - 0.9 * thick);
    fog.far = fogBase.far * (1 - 0.7 * thick);
    fog.color.copy(fogBase.color);
    if (tint && tintAmt > 0) fog.color.lerp(tmpCol.set(tint), tintAmt);
  };

  const addField = (count, opts, vel, box, center) => {
    const mat = pointsMaterial(opts);
    if (box) mat.uniforms.uBox.value.copy(box);
    const pts = add(field(count, mat, rng));
    const f = { mat, pts, vel: vel.clone(), center: center || new THREE.Vector3(8, -1, -18), mul: 1 };
    fields.push(f);
    return f;
  };

  const size = new THREE.Vector2();
  const syncField = (f, dt, time) => {
    const u = f.mat.uniforms;
    u.uOffset.value.addScaledVector(f.vel, dt * f.mul);
    u.uCenter.value.copy(camera.position).add(f.center);
    u.uTime.value = time;
    if (u.uScale) u.uScale.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };

  // Event scheduler: periodic "gust"/"blizzard"/"strike"/"rumble" envelopes.
  const event = (minGap, maxGap, dur, firstIn) => ({ next: firstIn, t: -1, dur, minGap, maxGap, level: 0 });
  const stepEvent = (e, time) => {
    if (e.t < 0 && time >= e.next) { e.t = 0; e.start = time; }
    if (e.t >= 0) {
      e.t = time - e.start;
      if (e.t > e.dur) { e.t = -1; e.next = time + e.minGap + rng() * (e.maxGap - e.minGap); }
    }
    e.level = e.t < 0 ? 0 : smooth(0, 0.8, e.t) * (1 - smooth(e.dur - 1.2, e.dur, e.t));
    return e.level;
  };

  const per = {}; // per-weather state
  const lights = [];

  // =====================================================================
  if (kind === 'clear') {
    // Clouds: one InstancedMesh of billboards far back in the sky.
    const cloudTex = canvasTex(256, 128, (g, w, h) => {
      const r = Math.random;
      for (let i = 0; i < 26; i++) {
        const x = 40 + r() * (w - 80), y = h * 0.55 + (r() - 0.5) * h * 0.35 - Math.sin(((x - 40) / (w - 80)) * Math.PI) * 20;
        const rad = 18 + r() * 30 * Math.sin(((x - 40) / (w - 80)) * Math.PI + 0.3);
        const gr = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(250,250,255,0.6)'); gr.addColorStop(1, 'rgba(235,240,250,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      const shade = g.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(160,180,210,0.9)');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = shade; g.fillRect(0, h * 0.45, w, h);
    });
    const N = 16;
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.92 });
    disposables.push(cloudTex);
    const clouds = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.5), cloudMat, N));
    clouds.frustumCulled = false;
    clouds.renderOrder = -5;
    per.clouds = Array.from({ length: N }, () => ({ u: rng() * 700, y: 38 + rng() * 55, z: -150 - rng() * 60, s: 45 + rng() * 60, v: 1.5 + rng() * 2.5 }));
    per.cloudMesh = clouds;

    // Sun glare + lens ghosts (sprites, additive, no fog).
    const sunTex = glowTex('rgba(255,255,240,1)', 'rgba(255,230,170,0.45)');
    const ringTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,240,200,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    disposables.push(sunTex, ringTex);
    // The sun core is occluded by scenery; lens ghosts are camera artefacts so they draw on top.
    const mk = (map, color, s, o, ghost = true) => {
      const sp = add(new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: !ghost, fog: false, transparent: true, opacity: o })));
      sp.scale.setScalar(s); sp.renderOrder = 10; return sp;
    };
    per.sun = mk(sunTex, '#fff6dd', 70, 1, false);
    per.halo = mk(sunTex, '#ffe2a8', 150, 0.22);
    per.ghosts = [
      [0.35, 0.35, ringTex, '#ffd9a0', 10], [0.6, 0.3, sunTex, '#9fe0ff', 4],
      [0.8, 0.18, sunTex, '#ffb0e0', 7], [1.25, 0.22, ringTex, '#b0ffd0', 16],
    ].map(([k, o, tex, c, sz]) => [k, mk(tex, c, sz, o), o]);
    // Pollen motes
    addField(1100, { shape: 2, color: '#ffe79a', color2: '#fffbe8', size: 0.13, opacity: 0.55, additive: true, maxPx: 16 }, new THREE.Vector3(0.8, 0.25, 0.3));
    fields[0].mat.uniforms.uSwirl.value = 0.9;
  }

  // =====================================================================
  if (kind === 'sandstorm') {
    per.sand = addField(6000, { shape: 1, color: '#fff0cf', color2: '#b8763a', size: 0.5, opacity: 0.85, maxPx: 44 }, new THREE.Vector3(-28, -0.6, 0.5));
    per.sand.mat.uniforms.uSwirl.value = 0.6;
    per.haze = addField(260, { shape: 0, color: '#f0c58c', size: 1.6, opacity: 0.18, maxPx: 90 }, new THREE.Vector3(-18, 0.2, 0));
    per.gust = event(9, 15, 4.2, 3);

    // Dust devils: 3 swirling funnels, one Points, centres as uniforms.
    const D = 3, P = 900;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(D * P * 3);
    const rnd = new Float32Array(D * P * 4);
    for (let i = 0; i < D * P; i++) {
      rnd[i * 4] = Math.floor(i / P); rnd[i * 4 + 1] = rng(); rnd[i * 4 + 2] = rng() * TAU; rnd[i * 4 + 3] = rng();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const devMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uDevil: { value: Array.from({ length: D }, () => new THREE.Vector4()) }, uTime: { value: 0 }, uScale: { value: 500 } },
      vertexShader: /* glsl */ `
        uniform vec4 uDevil[${D}]; uniform float uTime; uniform float uScale;
        attribute vec4 aRand; varying float vA; varying float vH;
        void main() {
          vec4 dv = uDevil[int(aRand.x + 0.5)];
          float h = fract(aRand.y + uTime * (0.18 + 0.12 * aRand.w));
          float ang = aRand.z + uTime * (7.0 - 3.5 * h) * (0.8 + 0.4 * aRand.w);
          float rad = (0.25 + 3.2 * h * h + 0.4 * aRand.w) * (0.6 + 0.4 * dv.w);
          vec3 p = dv.xyz + vec3(cos(ang) * rad + sin(uTime * 1.3 + h * 5.0) * h * 1.2, h * 14.0 * (0.5 + 0.5 * dv.w), sin(ang) * rad);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(40.0, (0.25 + 0.9 * h) * (0.6 + aRand.w) * uScale / max(-mv.z, 0.1));
          vA = dv.w * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.7, 1.0, h));
          vH = h;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vH;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          if (r > 1.0) discard;
          vec3 col = mix(vec3(0.62, 0.42, 0.24), vec3(0.93, 0.76, 0.52), vH);
          gl_FragColor = vec4(col, (1.0 - r) * vA * 0.55);
        }`,
    });
    const devils = add(new THREE.Points(g, devMat));
    devils.frustumCulled = false;
    per.devMat = devMat;
    per.devils = Array.from({ length: D }, (_, i) => ({ x: 20 + i * 35, z: -12 - rng() * 14, life: rng() * 8, max: 10 + rng() * 8, ph: rng() * TAU }));
  }

  // =====================================================================
  if (kind === 'snow') {
    per.snow = addField(9000, { shape: 3, color: '#ffffff', color2: '#e4efff', size: 0.16, opacity: 0.95, maxPx: 22 },
      new THREE.Vector3(-1.5, -3.2, 0.3));
    per.snow.mat.uniforms.uSwirl.value = 1.2;
    // big soft foreground flakes for depth
    per.big = addField(350, { shape: 0, color: '#ffffff', size: 0.34, opacity: 0.55, maxPx: 32 },
      new THREE.Vector3(-2.5, -4.5, 0), new THREE.Vector3(70, 26, 16), new THREE.Vector3(10, -2, -8));
    per.big.mat.uniforms.uSwirl.value = 1.6;
    per.white = addField(240, { shape: 0, color: '#f4f8ff', size: 2.4, opacity: 0, maxPx: 110 }, new THREE.Vector3(-14, -1, 0));
    per.blizzard = event(12, 20, 5, 6);
  }

  // =====================================================================
  if (kind === 'rain') {
    const N = 5000;
    const box = new THREE.Vector3(90, 34, 40);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 6);
    const rnd = new Float32Array(N * 8);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = rng() * box.x, y = rng() * box.y, z = rng() * box.z;
      const r = [rng(), rng(), rng(), rng()];
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], i * 6 + k * 3);
        rnd.set(r, i * 8 + k * 4);
        end[i * 2 + k] = k;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uOffset: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uBox: { value: box },
        uTime: { value: 0 }, uSwirl: { value: 0 }, uDir: { value: new THREE.Vector3(0.22, 1, -0.04).normalize() },
        uLen: { value: 1.6 }, uColor: { value: new THREE.Color('#9fd8ff') }, uOpacity: { value: 0.55 }, uFlash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        ${WRAP}
        attribute vec4 aRand; attribute float aEnd;
        uniform vec3 uDir; uniform float uLen;
        varying float vA;
        void main() {
          vec3 p = wrapPos(position, aRand);
          float fade = edgeFade(p);
          p += uDir * uLen * (0.6 + 0.8 * aRand.z) * aEnd;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = fade * mix(1.0, 0.1, aEnd) * smoothstep(2.0, 6.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; uniform float uFlash; varying float vA;
        void main() { gl_FragColor = vec4(uColor + uFlash * 0.8, vA * (uOpacity + uFlash * 0.4)); }`,
    });
    const rain = add(new THREE.LineSegments(g, mat));
    rain.frustumCulled = false;
    per.rain = { mat, pts: rain, vel: new THREE.Vector3(-0.22, -1, 0.04).multiplyScalar(48), center: new THREE.Vector3(8, -1, -18), mul: 1 };
    fields.push(per.rain);
    // mist
    per.mist = addField(400, { shape: 0, color: '#6a4aa8', size: 2.4, opacity: 0.12, maxPx: 110 }, new THREE.Vector3(-2, 0, 0));

    // Splash ripples: instanced quads lying on the track, ring drawn in the shader.
    const R = 420;
    const ig = new THREE.InstancedBufferGeometry();
    ig.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
    ig.setIndex([0, 2, 1, 0, 3, 2]);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(R * 4), 4); // x,y,z,start
    ig.setAttribute('iPos', iPos);
    ig.instanceCount = R;
    const rMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 iPos; uniform float uTime; varying vec2 vC; varying float vAge;
        void main() {
          vAge = clamp((uTime - iPos.w) / 0.7, 0.0, 1.0);
          vC = position.xz;
          vec3 p = iPos.xyz + vec3(position.x * 0.55, 0.05, position.z * 0.55);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vC; varying float vAge; uniform float uFlash;
        void main() {
          float r = length(vC);
          float ring = 1.0 - smoothstep(0.0, 0.12, abs(r - vAge * 0.95));
          float a = ring * (1.0 - vAge) * 0.8;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) + uFlash, a);
        }`,
    });
    const ripples = add(new THREE.Mesh(ig, rMat));
    ripples.frustumCulled = false;
    per.ripples = { attr: iPos, mat: rMat, n: R };
    for (let i = 0; i < R; i++) iPos.setW(i, -10 - rng());

    // Lightning: our own lights (restored by removal), a sky flash plane, a bolt strip.
    const flashLight = new THREE.DirectionalLight('#c9d4ff', 0);
    flashLight.position.set(0, 80, -40);
    const flashAmb = new THREE.AmbientLight('#a595ff', 0);
    scene.add(flashLight, flashLight.target, flashAmb);
    lights.push(flashLight, flashLight.target, flashAmb);
    per.flashLight = flashLight; per.flashAmb = flashAmb;
    const sky = add(new THREE.Mesh(new THREE.PlaneGeometry(1400, 500),
      new THREE.MeshBasicMaterial({ color: '#8f7dff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    sky.renderOrder = -10;
    per.sky = sky;
    const MAXV = 400;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3));
    const bolt = add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#f2eeff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })));
    bolt.frustumCulled = false;
    const boltGlow = add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#7a5cff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })));
    boltGlow.frustumCulled = false;
    boltGlow.scale.set(1, 1, 1);
    per.bolt = bolt; per.boltGlow = boltGlow; per.boltMax = MAXV;
    per.strike = { next: 4, t: -1, pulses: [] };
  }

  // =====================================================================
  if (kind === 'embers') {
    per.embers = addField(2600, { shape: 2, color: '#ff7a1a', color2: '#ffcf4a', size: 0.22, opacity: 1, additive: true, maxPx: 26 },
      new THREE.Vector3(1.2, 2.4, 0.2));
    per.embers.mat.uniforms.uSwirl.value = 1.4;
    per.ash = addField(2200, { shape: 0, color: '#4a3c36', color2: '#8a7a70', size: 0.16, opacity: 0.8, maxPx: 22 },
      new THREE.Vector3(-0.8, -1.3, 0.1));
    per.ash.mat.uniforms.uSwirl.value = 0.8;
    const amb = new THREE.AmbientLight('#ff5a1a', 0);
    scene.add(amb); lights.push(amb);
    per.amb = amb;
    per.rumble = event(9, 16, 3.2, 5);
    per.sky = add(new THREE.Mesh(new THREE.PlaneGeometry(1400, 500),
      new THREE.MeshBasicMaterial({ color: '#ff4a0a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    per.sky.renderOrder = -10;
  }

  // ---------- lightning helpers ----------
  const buildBolt = (x0) => {
    const pts = [];
    const segs = [];
    const walk = (x, y, dx, len, w, depth) => {
      let px = x, py = y;
      const steps = Math.floor(len / 6);
      for (let i = 0; i < steps; i++) {
        const nx = px + dx * 6 + (rng() - 0.5) * 9, ny = py - 6 - rng() * 2;
        segs.push([px, py, nx, ny, w * (1 - (i / steps) * 0.5)]);
        if (depth < 1 && rng() < 0.12) walk(nx, ny, (rng() - 0.5) * 1.6, len * 0.35, w * 0.55, depth + 1);
        px = nx; py = ny;
        if (py < 4) break;
      }
    };
    walk(x0, 130, (rng() - 0.5) * 0.4, 130, 1.4, 0);
    for (const [ax, ay, bx, by, w] of segs) {
      if (pts.length / 3 + 6 > per.boltMax) break;
      const z = -175;
      pts.push(ax - w, ay, z, ax + w, ay, z, bx + w, by, z, ax - w, ay, z, bx + w, by, z, bx - w, by, z);
    }
    const a = per.bolt.geometry.attributes.position;
    a.array.set(pts);
    a.needsUpdate = true;
    per.bolt.geometry.setDrawRange(0, pts.length / 3);
  };

  const fwd = new THREE.Vector3();
  const cenV = new THREE.Vector3();
  const v = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();

  function update(dt, time, focus) {
    renderer.getDrawingBufferSize(size);
    const cx = camera.position.x;

    if (kind === 'clear') {
      per.clouds.forEach((c, i) => {
        c.u += c.v * dt;
        const W = 700;
        const lo = cx - W * 0.4;
        const x = lo + ((((c.u + cx * 0.85 - lo) % W) + W) % W);
        m4.compose(v.set(x, c.y, c.z), q.identity(), sc.set(c.s, c.s, 1));
        per.cloudMesh.setMatrixAt(i, m4);
      });
      per.cloudMesh.instanceMatrix.needsUpdate = true;
      camera.getWorldDirection(fwd);
      const sunP = v.copy(camera.position).addScaledVector(fwd, 150).add(sc.set(-95, 48, 0));
      per.sun.position.copy(sunP);
      per.halo.position.copy(sunP);
      per.sun.material.opacity = 0.85 + 0.15 * Math.sin(time * 0.7);
      const cen = cenV.copy(camera.position).addScaledVector(fwd, 150);
      const ndc = sc.copy(sunP).project(camera);
      const vis = 1 - smooth(0.85, 1.3, Math.max(Math.abs(ndc.x), Math.abs(ndc.y)));
      for (const [k, sp, o] of per.ghosts) { sp.position.copy(sunP).lerp(cen, k); sp.material.opacity = o * vis; }
      per.halo.material.opacity = 0.22 * vis;
    }

    if (kind === 'sandstorm') {
      const g = stepEvent(per.gust, time);
      per.sand.mul = 1 + 1.6 * g;
      per.sand.mat.uniforms.uOpacity.value = 0.75 + 0.25 * g;
      per.sand.mat.uniforms.uSwirl.value = 0.6 + 1.2 * g;
      per.haze.mul = 1 + 1.5 * g;
      per.haze.mat.uniforms.uOpacity.value = 0.12 + 0.22 * g;
      setFog(0.92 * g + 0.08 * (0.5 + 0.5 * Math.sin(time * 0.4)), '#d9965a', 0.35 * g);
      api.wind = 0.4 * g * (0.8 + 0.2 * Math.sin(time * 6));
      api.grip = 1 - 0.05 * g;
      const u = per.devMat.uniforms;
      u.uTime.value = time;
      if (u.uScale) u.uScale.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
      per.devils.forEach((d, i) => {
        d.life += dt;
        d.x += (-3 - 6 * g) * dt + Math.sin(time * 0.5 + d.ph) * 2 * dt;
        d.z += Math.cos(time * 0.4 + d.ph) * 1.2 * dt;
        if (d.life > d.max || d.x < cx - 45) {
          d.life = 0; d.max = 10 + rng() * 10; d.x = cx + 20 + rng() * 45; d.z = rng() < 0.3 ? 12 + rng() * 6 : -10 - rng() * 22; d.ph = rng() * TAU;
        }
        const s = smooth(0, 2, d.life) * (1 - smooth(d.max - 2, d.max, d.life));
        const onTrack = Math.abs(d.z) < 7.5 && d.x > track.begin && d.x < track.end;
        u.uDevil.value[i].set(d.x, onTrack ? track.height(d.x) : 0, d.z, s);
      });
    }

    if (kind === 'snow') {
      const b = stepEvent(per.blizzard, time);
      per.snow.vel.set(-1.5 - 16 * b, -3.2 - 2.5 * b, 0.3 + 1.5 * b);
      per.snow.mat.uniforms.uSwirl.value = 1.2 + 1.5 * b;
      per.big.vel.set(-2.5 - 22 * b, -4.5 - 3 * b, 0);
      per.big.mat.uniforms.uOpacity.value = 0.45 + 0.4 * b;
      setFog(1.0 * b, '#ffffff', 0.35 * b);
      per.white.mat.uniforms.uOpacity.value = 0.28 * b;
      per.snow.mat.uniforms.uSize.value = 0.16 + 0.06 * b;
      api.grip = 1 - 0.15 * b;
      api.wind = 0.3 * b;
    }

    if (kind === 'rain') {
      // lightning: schedule a burst of 2..4 flickers
      const s = per.strike;
      if (time >= s.next && s.t < 0) {
        s.t = 0; s.start = time;
        s.pulses = Array.from({ length: 2 + Math.floor(rng() * 3) }, (_, i) => ({ at: i * (0.09 + rng() * 0.12) + (i > 1 ? 0.15 : 0), amp: i === 0 ? 1 : 0.5 + rng() * 0.5 }));
        buildBolt(cx - 40 + rng() * 140);
        per.flashLight.position.set(cx + (rng() - 0.5) * 60, 80, -60);
        per.flashLight.target.position.set(cx, 0, 0);
      }
      let f = 0;
      if (s.t >= 0) {
        s.t = time - s.start;
        for (const p of s.pulses) { const k = s.t - p.at; if (k >= 0) f = Math.max(f, p.amp * Math.exp(-k * 14)); }
        if (s.t > 1.4) { s.t = -1; s.next = time + 5 + rng() * 7; }
      }
      api.flash = f;
      per.flashLight.intensity = 5 * f;
      per.flashAmb.intensity = 2.2 * f;
      per.sky.position.set(cx + 20, 60, -185);
      per.sky.material.opacity = 0.55 * f;
      per.bolt.material.opacity = Math.min(1, f * 1.6);
      per.boltGlow.material.opacity = 0.5 * f;
      per.boltGlow.visible = per.bolt.visible = f > 0.02;
      per.rain.mat.uniforms.uFlash.value = f;
      per.ripples.mat.uniforms.uFlash.value = f * 0.5;
      api.grip = 0.9;
      api.wind = 0;
      // ripples respawn on the ground in view
      const { attr, n } = per.ripples;
      const arr = attr.array;
      let dirty = false;
      for (let i = 0; i < n; i++) {
        if (time - arr[i * 4 + 3] < 0.7 + (i % 7) * 0.05) continue;
        const x = cx - 18 + rng() * 60;
        const z = -9 + rng() * 21;
        const onTrack = Math.abs(z) < 6.4 && x > track.begin && x < track.end;
        arr[i * 4] = x; arr[i * 4 + 1] = onTrack ? track.height(x) : 0; arr[i * 4 + 2] = z; arr[i * 4 + 3] = time + rng() * 0.4;
        dirty = true;
      }
      if (dirty) attr.needsUpdate = true;
      per.ripples.mat.uniforms.uTime.value = time;
    }

    if (kind === 'embers') {
      const r = stepEvent(per.rumble, time);
      const pulse = r * (0.55 + 0.45 * Math.sin(time * 17) * Math.sin(time * 5.3));
      api.flash = Math.max(0, Math.min(1, pulse));
      per.amb.intensity = 5 * api.flash;
      per.sky.position.set(cx + 20, 40, -185);
      per.sky.material.opacity = 0.45 * api.flash;
      per.embers.mul = 1 + 2 * r;
      per.embers.mat.uniforms.uOpacity.value = 0.85 + 0.3 * r;
      per.embers.mat.uniforms.uSwirl.value = 1.4 + 1.5 * r;
      per.ash.mul = 1 + 1.2 * r;
      setFog(0.5 * r, '#ff5010', 0.7 * api.flash);
      api.wind = 0.15 * r * Math.sin(time * 9);
      api.grip = 1;
    }

    for (const f of fields) syncField(f, dt, time);
  }

  function dispose() {
    for (const o of added) scene.remove(o);
    for (const l of lights) scene.remove(l);
    for (const d of disposables) d.dispose?.();
    for (const o of added) if (o.material?.map) o.material.map.dispose();
    if (fog && fogBase) { fog.near = fogBase.near; fog.far = fogBase.far; fog.color.copy(fogBase.color); }
    api.grip = 1; api.wind = 0; api.flash = 0;
  }

  return api;
}
