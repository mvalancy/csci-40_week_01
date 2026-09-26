# CSCI 40 · Fall 2026 Demos

A growing collection of web apps and games built live in CSCI 40 (Fall 2026) with AI coding agents. Prompt an AI to build something, then watch it test its own work in a live browser. New demos land in `apps/` as the semester goes on.

## Week 1: the bike game code-off

In week one, two coding agents got the same prompt, *"build a cool bike game"*, and built side by side in this one repo, sharing the same libraries, dev server and test harness. Both games deploy from here to Cloudflare Pages on every push.

## Side by side

| | **REDLINE MX** | **ASHDRIVE** |
|---|---|---|
| | [![REDLINE MX](apps/redline-mx/docs/stadium.png)](https://redlinemx.mattvalancy.com) | [![ASHDRIVE](apps/ashdrive/docs/preview.png)](https://ashdrive.mattvalancy.com) |
| **Play** | **[redlinemx.mattvalancy.com](https://redlinemx.mattvalancy.com)** | **[ashdrive.mattvalancy.com](https://ashdrive.mattvalancy.com)** |
| **Built by** | Claude (Claude Code) | Codex |
| **Genre** | Retro side-scrolling 3D motocross racing | Open-world armored bike combat |
| **Core loop** | Race 3 CPU riders, manage engine heat, land jumps, flip for style | Explore an industrial district, fight drones & gunships, raid 3 relays, extract the intel |
| **Content** | 5 worlds, 6 bikes with special abilities, 5 upgrade tracks, 7 pickups, championship cup, ghost replays | One large open map with freeways, relays, supplies; cannon, guided missiles, EMP; 3 camera modes; tactical map |
| **World life** | ~6,000 spectators of 11 kinds, animals per world, weather (sandstorm, blizzard, rain & lightning, embers) | Drones, gunships, transport craft, smoke, industrial set dressing |
| **Rendering** | three.js WebGL, merged meshes, adaptive quality | three.js **WebGPU** with WebGL 2 fallback, GPU-timed adaptive resolution |
| **Audio** | Procedural Tone.js soundtrack per world + synth SFX | Procedural WebAudio |
| **Source** | [`apps/redline-mx`](apps/redline-mx) · 29 modules · ~344 KB | [`apps/ashdrive`](apps/ashdrive) · 16 modules · ~151 KB |
| **Tests** | 21 headed Playwright segment tests | 3 headed Playwright suites + 60 unit tests + QA scripts |
| **How to play** | [README](apps/redline-mx/README.md) | [README](apps/ashdrive/README.md) |
| **Cloudflare Pages project** | `csci-40-week-01-redline-mx` | `csci-40-week-01-ashdrive` |

### More of REDLINE MX

| | | |
|---|---|---|
| ![Neon Nights](apps/redline-mx/docs/neon.png) | ![Magma Jungle](apps/redline-mx/docs/volcano.png) | ![Garage](apps/redline-mx/docs/garage.png) |
| Neon Nights: rain, oil slicks, lightning | Magma Jungle: lava crust, embers | Garage: bikes, abilities, upgrades |

## Run it yourself

```bash
npm run setup                   # once: installs libraries + Playwright's Chromium
npm run dev                     # lab hub at http://localhost:5173 (both games + Tower Smash)
npm run demo                    # watch Claude race REDLINE MX in a real browser
npm run show ashdrive --right   # watch ASHDRIVE's tests on the right half of the screen
npm run loop -- --owner=claude  # headed tests forever, left half of the screen
```

Ask Claude Code or Codex for anything, e.g. *"make a 3D asteroid shooter"* or *"build a synth drum machine"*. The agent scaffolds `apps/<name>/`, builds it, writes a Playwright test, and runs it headed. You can watch the browser drive itself.

The rules every agent follows (folder ownership, shared libraries, screen halves, the `ai` test fixture, deploys) are in **[AGENTS.md](AGENTS.md)**.

## Deploys

One repo, two Git-connected Cloudflare Pages projects. Each game is served at the root of its own domain, and every push to `main` that touches that game rebuilds it:

| project | build command | output | domain |
|---|---|---|---|
| `csci-40-week-01-redline-mx` | `npm ci && npx vite build --config apps/redline-mx/standalone.vite.config.js` | `apps/redline-mx/dist/` | [redlinemx.mattvalancy.com](https://redlinemx.mattvalancy.com) |
| `csci-40-week-01-ashdrive` | `npm ci && npx vite build --config apps/ashdrive/standalone.vite.config.js` | `apps/ashdrive/dist/` | [ashdrive.mattvalancy.com](https://ashdrive.mattvalancy.com) |

Those settings live in [`scripts/cloudflare-setup.js`](scripts/cloudflare-setup.js). No dashboard clicking:

```bash
npx wrangler login                          # once
npm run setup:cloudflare -- --dry-run       # show what would change
npm run setup:cloudflare                    # apply build settings, watch paths, env vars, custom domains
npm run deploy                              # manual REDLINE MX deploy (fallback); npm run deploy:ashdrive for ASHDRIVE
```

The lab hub (`npm run dev`) is for class only and isn't deployed.

**Game shows "3D graphics are switched off"?** The browser has WebGL disabled, which usually happens after a GPU crash. Open `chrome://restart`, then check that `chrome://gpu` lists WebGL as *Hardware accelerated*.

## License

[MIT](LICENSE)
