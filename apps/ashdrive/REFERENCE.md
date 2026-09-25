# Cyberbykes reference and adaptation notes

Research date: 2026-09-24. This document records historical references and original implementation proposals. It does not contain or redistribute original game artwork, audio, binaries, or manual pages. Reference images were inspected in memory and were not saved into the project.

## Identity and scope

The reference is **Cyberbykes: Shadow Racer VR (1995)**, developed by Artificial Software and published by GameTek. Its core is armed motorcycle exploration and military retrieval missions across open 3D environments. The DOS Games Archive describes remotely controlled armed bikes securing valuable secrets; this is a stronger mechanic reference than lap racing. [DOS Games Archive](https://www.dosgamesarchive.com/download/cyberbykes)

The user's requested adaptation emphasizes grungy technical bikes, freeway infrastructure, and military drone ships. Freeways are the requested creative direction; this research did not independently establish them as the defining terrain of every original level.

## Visual references inspected

### Original title illustration

[Title-screen image](https://www.myabandonware.com/media/screenshots/c/cyberbykes-shadow-racer-vr-2r6/cyberbykes-shadow-racer-vr_5.png)

The bike has a red angular armored fairing, enormous black tire, exposed silver hub, white rectangular headlamp, prominent gold twin barrels on one side and a dark rotary weapon on the other. The camera is very low and close to the front wheel. Black rounded enemy pods with bright lamps hover behind it against darkness and orange explosions. This gives a concrete silhouette target: **heavy armed vehicle with large tires and visible machinery**.

### Military deployment cinematic

[Transport image](https://www.myabandonware.com/media/screenshots/c/cyberbykes-shadow-racer-vr-2r6/cyberbykes-shadow-racer-vr_7.png)

An enormous dark olive transport has a black enclosed canopy, angular side housings, articulated landing struts and a red motorcycle suspended under its fuselage. The sky is smoky orange at dusk. The craft dwarfs the bike. This is direct visual support for the military ship language in the user's correction.

### In-game telemetry and world

[Gameplay screenshot](https://www.myabandonware.com/media/screenshots/c/cyberbykes-shadow-racer-vr-2r6/cyberbykes-shadow-racer-vr_8.png)

Gameplay uses simple flat-shaded geometry and saturated building/terrain colors. Its interface has a green compass across the top, green vertical graduated scales at the sides, tiny numeric readouts, and open visibility through the center. The historical rendering and cinematic artwork have different levels of detail; our modern interpretation can borrow the cinematic machinery while keeping the readable telemetry.

[Mission-selection screenshot](https://www.myabandonware.com/media/screenshots/c/cyberbykes-shadow-racer-vr-2r6/cyberbykes-shadow-racer-vr_6.png) shows a rotating-Earth-style destination screen, green type and measurement ticks on black, and a city name. A compact mission briefing is a relevant menu pattern.

Additional screenshot galleries: [MobyGames](https://www.mobygames.com/game/27076/cyberbykes-shadow-racer-vr/screenshots/), [Old-Games.ru](https://www.old-games.ru/game/screenshots/6418.html). These galleries were located but their full image pages were not available through the research browser.

## Historical mechanics and caveats

The Collection Chamber reproduces original box features: bike customization, 15 weapon types, network play, level construction, and VR support. Weapon categories include chain guns, lasers, missiles, mortars, scatter guns, and grenades. Its retrospective describes helicopter attackers, stationary turrets, open environments, elevated targets, ramps, and repair/ammunition/upgrade pickups. It also reports that guided missiles provide a way to attack aircraft. Its assertion about inability to aim upward is disputed in the comments, so that should not be treated as a verified control limitation. [Collection Chamber retrospective and box text](https://collectionchamber.blogspot.com/p/cyberbykes-shadow-racer-vr.html)

A contemporary archived demo description explicitly frames the game around military objectives and mentions chain guns, lasers and guided missiles. [Archived 1995 demo description](https://www.apajalista.net/id?id=30408)

A manual is listed in English/French/German on [My Abandonware's game page](https://www.myabandonware.com/game/cyberbykes-shadow-racer-vr-2r6). Its manual link redirected to the listing in this research environment. **The manual was not obtained or read.** Specific original control mappings and exact mission completion logic therefore remain unverified.

## Original adaptation: feasible priorities for a 40-minute pass

These are new design proposals inspired by the references, not claims about original game features.

1. **Bike silhouette first.** Red/oxidized armored fairings, charcoal tires, silver hubs, two long gun barrels, cooling fins, side missile boxes, exhaust outlets and a low tinted canopy. Make visible hardware large enough to read from the chase camera. Do not spend the pass on tiny bolts that cannot be seen.
2. **Road space with purpose.** A cracked asphalt circuit through concrete freeway supports, rusty barriers, maintenance bays, signs and a wide jump ramp. White lane dashes and yellow hazard edges communicate traversable road at speed. An industrial skyline provides depth while keeping combat lanes open.
3. **Readable military atmosphere.** Dusty orange dusk and cool grey concrete; olive aircraft and burnt red bike. Use restrained signal green/amber for target, weapon and health information. Procedural dirt/noise is sufficient; no external textures are needed.
4. **A complete short mission.** Recover three data caches from marked sites, then reach an extraction zone under a hovering transport. Enemy encounters guard or interrupt the route. A visible `INTEL 0/3` counter plus next-objective distance avoids the historical game's confusing objective discovery.
5. **Two weapon roles.** Fast forward cannon for bikes and turrets; slower guided rocket with limited stock for gunships. Obvious muzzle flashes, tracers, impacts, recoil and smoke make these distinct without a complex inventory.
6. **Two enemy silhouettes.** A compact armed ground interceptor and an olive twin-engine gunship. Gunships circle or strafe before firing, with warning markers giving the player time to respond. Add stationary turrets only if mission and controls are already reliable.
7. **Jump and landing feedback.** Ramps give brief airtime; a compressed suspension pose, dust puff and short camera kick sell weight on landing. Keep steering forgiving and provide reverse so the player can recover from barriers.
8. **Telemetry that helps play.** Heading strip, ammo/weapon label, hull, speed, minimap and objective marker. Keep overlays away from the bike and from the center aiming area. A clearly labeled camera toggle can offer first-person instrumentation later.

Recommended implementation order: vehicle/environment appearance → complete retrieve/extract loop → gunship and rocket behavior → landing/impact feedback → controls and mobile checks. A coherent playable mission matters more than reproducing all fifteen original weapons or implementing a level editor.

## Implemented interpretation: Shadow Sector

The current game uses an original red armored remote bike, procedural industrial freeway network, military craft, cannon fire, guided missiles and EMP. Its three relay sites contain armored machinery and rotating radar dishes; destroying a relay exposes a data case, physical collection advances the mission, and returning to the motorpool pad completes extraction. WebGPU rendering has a WebGL 2 fallback. These are this project's implementation choices, not a claim to reproduce historical code or exact mission rules.

The archived 40-minute priority list above records design proposals; it is not a release feature checklist. In particular, use README.md and the game's controls as the source of current supported behavior.
