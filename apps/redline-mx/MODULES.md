# REDLINE MX module contract

The game world is assembled from independent modules. Each lives in one file,
exports one factory, and knows nothing about the others.

```js
export function createX(ctx) {
  // build meshes, add them to ctx.scene
  return {
    update(dt, time, focus) {},   // called every frame
    dispose() {},                 // remove everything you added from ctx.scene
    // optional extras (see per-module notes)
  };
}
```

## `ctx`
| field | what |
|---|---|
| `THREE` | the three.js namespace (also fine to `import * as THREE from 'three'`) |
| `scene`, `camera`, `renderer` | the live three.js objects |
| `biome` | entry from `biomes.js`: `id`, `sky`, `fog`, `night`, `weather`, `wildlife[]`, `spectators{}`, `scenery`, … |
| `track` | `height(x)`, `slope(x)`, `begin`, `end`, `ramps[]` `{x0,h,up,top,down}`, `mud[]`, `coolers[]` |
| `LANES` | z of the 4 lanes: `[-4.5, -1.5, 1.5, 4.5]`. Track spans z ∈ [-6.5, 6.5]; hay bales at z≈-7.3 |
| `START_X`, `FINISH_X` | 10 and 1100. Track mesh spans x ∈ [track.begin, track.end] = [-60, 1260] |
| `rng()` | seeded random, use instead of Math.random for layout so screenshots are stable |

## `focus` (every frame)
`{ x, y, z, speed, airborne, excitement /*0..1*/, riders: [{x,y,z,airborne}], cameraX }`

## Coordinate & camera facts
- +x is race direction. The camera looks from **+z toward -z**, so the backdrop goes at **z < -8** and the foreground at **z > 8** (sparingly, it occludes).
- The camera sits around (player.x+3, 5..10, 21..36) looking at (player.x+8, ~2..10, 0). The viewport shows roughly x ∈ [player.x-25, player.x+45].
- Performance budget: the whole game has to hold 60 fps on an Intel iGPU. Use `InstancedMesh` for anything numerous, merge static geometry, and keep per-frame work O(visible). Only animate things within ~80 units of `focus.x`.
- Night biomes (`biome.night`) need emissive materials to read at all.

## Modules
- **scenery.js** `createScenery(ctx)`: backdrop and landmarks per `biome.scenery` (stadium stands structure, canyon mesas and cacti, alpine peaks and pines, neon skyscrapers and billboards, volcano and palms). No people or animals.
- **spectators.js** `createSpectators(ctx)`: crowds of every kind per `biome.spectators` mix (humans, robots, aliens, yetis, penguins, monkeys, mascots, holograms, …), stadium waves, camera flashes, signs, flags, trackside fans at big ramps who cheer when `focus.airborne`.
- **wildlife.js** `createWildlife(ctx)`: animated critters per `biome.wildlife`. They flee or scatter when the player gets close.
- **weather.js** `createWeather(ctx)`: particles and lighting per `biome.weather` (`clear`, `rain`, `snow`, `sandstorm`, `embers`). Extra return fields: `grip` (multiplier, 1 = normal), `wind` (air pitch nudge, rad/s), `flash` (0..1 lightning level).
- **bikes.js** `buildBike(modelId, color, number)`: same return shape as the original `bike.js`: `{ root, body, rider, rear, front, flame }`.
