# ASHDRIVE headed checks

Run from the shared lab root. These scripts use the root Playwright installation and open their browser on the right; keep only one GPU browser test running at a time.

```sh
npm run show -- ashdrive --right --config=apps/ashdrive/qa/playwright.config.js
```

The three fixture tests cover desktop inputs, guided weapons, manual graphics settings, cameras, pause/redeployment, and portrait touch controls. The app-specific config disables video encoding and preserves screenshots.

Export and build the standalone app, then serve it on port 4175 for release checks. Override `ASHDRIVE_URL` to test another preview or the public deployment.

```sh
ASHDRIVE_URL=http://localhost:4175/ node apps/ashdrive/qa/final-mission.mjs
ASHDRIVE_URL=http://localhost:4175/ node apps/ashdrive/qa/native-quality.mjs
ASHDRIVE_URL=http://localhost:4175/ node apps/ashdrive/qa/touch-landscape.mjs
```

- `final-mission.mjs` completes all three relays and extraction through the normal Autonomous Sortie button, then checks manual free exploration, map, missiles, EMP, and pause keyboard focus. Set `ASHDRIVE_TIMEOUT_MS=420000` under heavy machine load. Artifacts default to `/tmp/ashdrive-final`; override with `ASHDRIVE_OUTPUT`.
- `native-quality.mjs` exercises manual-start WebGPU quality changes and then Auto, including actual GPU timestamp availability. It requires a timestamp-capable WebGPU device; `--webgl` selects the WebGL variant. Results and screenshots go to `/tmp/ashdrive-native-quality` or `/tmp/ashdrive-webgl-quality`.
- `touch-landscape.mjs` emulates a coarse touch pointer at 844×390, sends real touch input for throttle/cannon, checks all controls and pause buttons fit, and rotates to portrait. Artifacts go to `/tmp/ashdrive-touch-landscape`.
- `profile.mjs` captures visible/focused frame, CPU, GPU, and draw telemetry. Treat measurements taken while other browsers or screen recording are active as contention diagnostics, not an isolated FPS benchmark.

Inspect the captured screenshots as well as assertions and browser-error logs. Browser specs and this QA folder stay in the shared lab and are excluded from standalone exports.
