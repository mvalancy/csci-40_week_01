# AI App Lab — rules for every agent (Claude, Codex, …)

Many agents build apps **side by side** in this folder at the same time.
Everything below exists so you never step on each other.

## Layout

```
week1/
├── AGENTS.md / CLAUDE.md    this file (CLAUDE.md just imports it)
├── package.json             ONE shared set of libraries — see "Libraries"
├── index.html               hub: auto-lists every apps/*/meta.json
├── vite.config.js           auto-discovers apps/*/index.html (don't edit per app)
├── playwright.config.js     auto-discovers apps/*/*.spec.js (don't edit per app)
├── shared/                  SHARED — read, import, don't change casually
│   ├── testing/ai.js        the `ai` test fixture (HUD overlay, steps, checks)
│   ├── testing/overlay.js   the on-screen "CLAUDE IS TESTING" HUD
│   └── hub.spec.js          test for the hub page
├── scripts/                 new-app.js (scaffolder), test.js (runner)
└── apps/
    ├── _template/           starter copied by `npm run new`
    ├── redline-mx/         example: 3D motocross (Claude)
    └── <your-app>/          ← YOU OWN ONLY THIS FOLDER
        ├── index.html       page (served at /apps/<your-app>/)
        ├── meta.json        { title, description, emoji, owner } for the hub card
        ├── main.js …        your code, split into modules as you like
        └── <your-app>.spec.js   your Playwright tests
```

## Ownership rules

1. **Create your app with `OWNER=<you> npm run new <slug> "Title"`** (e.g. `OWNER=codex`). The `owner` in `meta.json` puts a badge on the hub card and lets `npm run loop --owner=<you>` find your apps. It refuses to overwrite an existing folder. If the name is taken, pick another; that folder belongs to another agent.
2. **Only edit files inside `apps/<your-slug>/`.** Never modify, move, or delete another app's folder, even to "fix" it.
3. **Shared files** (`shared/`, `index.html`, configs, `scripts/`, `package.json`) change only when the user asks, and the change must be additive and backwards compatible.
4. **Imports stay local or come from npm packages.** Never import from another app's folder. If code should be shared, ask the user first. Then put it in `shared/`.
5. No CDNs or network fetches at runtime. Everything is installed locally so the class works offline.

## Sharing the screen

Headed browsers split the monitor in half so two agents can demo at once:

- **Claude → left half** (default): `npm run show <slug>` (dev server on port 5173)
- **Codex → right half**: `npm run show <slug> --right` (or `SIDE=right`, dev server on port 5174)

Each side has its own dev server, so a restart or reload on one side never breaks tests on the other.

Stay on your side. Don't resize or move the other agent's window.

## Git & deploy

- Repo: https://github.com/mvalancy/ai-app-lab (MIT, public). Live site: **https://redlinemx.mattvalancy.com** (Cloudflare Workers static assets; `/` redirects to REDLINE MX, every app is at `/apps/<slug>/`).
- Deploy: `npm run deploy` (Vite build + `wrangler deploy`; needs `wrangler login`). CI deploys too once the repo has `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.
- **Commit only your own `apps/<slug>/` folder** (`git add apps/<slug>`). Run `git pull --rebase` right before `git push`. Never force-push, and never commit another agent's folder.
- `npm run build` must pass before you push. It builds every app, so a broken app breaks the deploy for everyone.
- It's a static site: no servers, no API keys, no secrets in client code.

## Libraries (already installed — just `import` them)

| package | import | use it for |
|---|---|---|
| three | `import * as THREE from 'three'`, addons: `three/addons/controls/OrbitControls.js`, `three/addons/loaders/GLTFLoader.js`, `three/addons/postprocessing/…` | 3D / WebGL |
| cannon-es | `import * as CANNON from 'cannon-es'` | 3D physics |
| matter-js | `import Matter from 'matter-js'` | 2D physics |
| gsap | `import { gsap } from 'gsap'` | tweens / animation timelines |
| tone | `import * as Tone from 'tone'` | music & synth audio |
| chart.js | `import Chart from 'chart.js/auto'` | charts |
| lil-gui | `import GUI from 'lil-gui'` | debug sliders |
| simplex-noise | `import { createNoise2D } from 'simplex-noise'` | terrain, procedural stuff |

Plain Canvas 2D, WebAudio, and DOM work too. **Need a new package?** Tell the user before you add it. Install it at the root (`npm i <pkg>`) so every app can use it. Never add a second `package.json` or `node_modules` inside an app.

## Workflow for "build me X"

1. `npm run new my-thing "My Thing"`
2. Build it in `apps/my-thing/`. Make it look great: full-screen canvas, real lighting, juice, sound.
3. **Expose a test hook.** `window.__app` should be plain data (or have a `snapshot()` that returns plain data), for example `{ ready, frames, state, score, player: {x, y} }`. Tests read it with `ai.state()`. Without it, tests can only guess from pixels.
4. Write `apps/my-thing/my-thing.spec.js` with the `ai` fixture (see below). Test like a player would: real key presses and mouse moves, then check the state changed.
5. Run it **headed** so the class sees the browser: `npm run show my-thing`
6. Iterate until green. Then **look at the screenshots** in `test-results/my-thing/**/*.png`. A passing test on a black screen is not a pass.

## Commands

| command | what it does |
|---|---|
| `npm run dev` | dev server + hub at http://localhost:5173 |
| `npm run new <slug> ["Title"]` | scaffold `apps/<slug>/` from the template |
| `npm run show <slug>` | **headed** test run, slowed down, with the HUD overlay |
| `npm test <slug>` | headless test run for one app |
| `npm test` | every app plus the hub |
| `npm run report <slug>` | open that app's HTML report (screenshots and video) |
| `npm run demo` | the REDLINE MX showcase, headed |
| `npm run loop [slug …] [--right] [--owner=<you>]` | headed tests forever, round after round (summary in `test-results/loop.log`) |

Per-app runs write to `test-results/<slug>/` and `playwright-report/<slug>/`, so agents testing different apps at the same time don't clobber each other. A Vite server already running on your side's port is reused. Don't kill the other side's server.
If your app imports a package that isn't in `optimizeDeps.include` in `vite.config.js`, ask the user to add it there. A dependency discovered late forces every open page to reload.

## The `ai` test fixture

```js
import { test, expect } from '../../shared/testing/ai.js';

test('it works', async ({ page, ai }) => {
  await ai.step('open', async () => {
    await page.goto('/apps/my-thing/');
    await ai.waitFor((s) => s.ready, { message: 'boot' });
  });
  await ai.step('canvas draws', () => ai.expectCanvasAlive());      // fails on blank/black WebGL
  await ai.step('jump', async () => {
    await ai.hold('Space', 300);                                   // hold a key
    await ai.check('player left the ground', (await ai.state()).player.y, (y) => y > 0);
  });
  await ai.say('any info toast');                                  // shows on screen
  await ai.snap('final');                                          // screenshot → report
});
```

Also available: `ai.tap(key)`, `ai.state(hookName)`, `page.mouse.move(x, y, { steps: 20 })`. The HUD draws a fake cursor, so smooth mouse moves look great. Uncaught exceptions, `console.error`, and HTTP 4xx/5xx fail the test automatically.

## Gotchas

- Headless runs use full Chromium with the GPU (`channel: 'chromium'` + Vulkan flags). The default headless shell renders WebGL in software at ~2 fps. Keep that config.
- Simulate with a fixed timestep and clamp `dt`, so slow frames don't break the physics.
- three.js r186: use `THREE.Timer` (not `Clock`) and `PCFShadowMap` (not `PCFSoftShadowMap`).
- Add `<link rel="icon" href="data:," />` to your page head to avoid a favicon 404.
