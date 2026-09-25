# REDLINE MX

Retro side-scrolling 3D motocross in three.js. Ride the redline on turbo without cooking the engine, land perfect jumps, pull backflips, and beat three CPU riders across five worlds.

## Controls
| key | action |
|---|---|
| `Z` / `Space` | throttle |
| `X` / `Shift` | turbo (heats the engine; 100% = overheat stall) |
| `↑` `↓` | change lanes |
| `←` `→` | lean back / forward. In the air this rotates the bike. Hold `←` on a big jump to backflip |
| `C` | special ability (charge it with tricks, perfect landings, coins & stars) |
| `P` | autopilot · `M` mute · `Enter` garage / race |

Phones get on-screen buttons automatically. Add `?touch` to force them.

## Worlds
| world | patch in the lanes | twist |
|---|---|---|
| Thunder Dome | mud | the classic stadium |
| Scorpion Canyon | quicksand | engines run 35% hotter; sandstorm gusts push you in the air |
| Frostbite Pass | ice (no traction) | lower gravity, engines run cool, snow cuts grip |
| Neon Nights | oil slicks | rain-slick night city, lightning |
| Magma Jungle | lava crust (slow **and** hot) | heavier gravity, falling embers |

## Bikes (buy in the garage)
| bike | price | ability |
|---|---|---|
| Mud Hornet | free | **Rocket Hop**: launch straight up |
| Iron Buffalo | 400 | **Shockwave**: knock nearby rivals down |
| Viper GT | 700 | **Slipstream**: 4 s of extra top speed, zero heat |
| Photon Ghost | 1000 | **Phase**: 5 s where nothing can crash you |
| Titan Walker-X | 1400 | **Overdrive**: ignore patches & heat; starts every race with a shield |
| Tin Rocket 1950 | 2000 | **Afterburner**: rocket thrust, even in the air |

Upgrades per bike (5 levels each): Engine, Turbo, Radiator, Suspension, Tires.

## Pickups
Coins (rows in the lanes, arcs above big ramps) · **Nitro** burst · **Shield** (absorbs one crash) · **Coolant** (heat → 0) · **Magnet** (pulls coins) · **Rocket** (instant jump) · **Star** (+50% ability).

Race payout = place bonus + 10/coin + 60/flip + 8/perfect landing − 10/crash.

## Code map
| file | what |
|---|---|
| `main.js` | game loop, race flow, input, HUD, abilities, test hook (`window.__app`) |
| `rider.js` | bike physics: ground/air, heat, patches, effects |
| `track.js` | seeded track profile (ramps, whoops, doubles, tabletops, mud, coolers) |
| `biomes.js` | the five worlds as data |
| `progression.js` · `garage.js` | bikes, upgrades, save file · garage UI |
| `items.js` | pickups |
| `world.js` | track mesh, sky, lights, arches, dust, confetti |
| `scenery.js` · `spectators.js` · `wildlife.js` · `weather.js` | pluggable world modules (contract in `MODULES.md`) |
| `bikes.js` · `showroom.html` | bike models + a showroom to inspect them |
| `redline-mx.spec.js` | headed Playwright tests, one per game segment |

URL flags for demos and tests: `?biome=<id>`, `?bike=<id>`, `?race` (skip menus), `?autostart` (race on autopilot), `?touch`.
