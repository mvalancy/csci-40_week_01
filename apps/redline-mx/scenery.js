// Backdrop and landmarks for each biome. The actual builders live in
// scenery-<biome>.js; they share the batching helpers in scenery-kit.js.
// Everything sits at z < -8 (behind the track, camera looks toward -z),
// plus a few low props in the foreground at z > 9.
import { makeKit } from './scenery-kit.js';
import { buildStadium } from './scenery-stadium.js';
import { buildCanyon } from './scenery-canyon.js';
import { buildAlpine } from './scenery-alpine.js';
import { buildNeon } from './scenery-neon.js';
import { buildVolcano } from './scenery-volcano.js';

const BUILDERS = { stadium: buildStadium, canyon: buildCanyon, alpine: buildAlpine, neon: buildNeon, volcano: buildVolcano };

export function createScenery(ctx) {
  const kit = makeKit(ctx);
  const build = BUILDERS[ctx.biome.scenery] || BUILDERS.stadium;
  const anim = build(ctx, kit) || {};
  kit.flush();
  return {
    update(dt, time, focus) { anim.update?.(dt, time, focus); },
    dispose() {
      anim.dispose?.();
      kit.dispose();
    },
  };
}
