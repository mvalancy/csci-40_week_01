import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityController, qualityPixelRatio, QUALITY_TIERS } from '../quality.js';
const strong = { cores: 12, memory: 16, width: 1280, height: 720, dpr: 1 };
function simulate(policy, fps, seconds) { for(let i=0;i<fps*seconds;i++)policy.update(1/fps); }
test('device baseline is conservative on mobile and low memory fallback',()=>{
  assert.equal(createQualityController(strong).snapshot().tier,'medium');
  assert.equal(createQualityController({...strong,mobile:true}).snapshot().tier,'medium');
  assert.equal(createQualityController({...strong,memory:2}).snapshot().tier,'low');
  assert.equal(createQualityController().snapshot().tier,'medium');
});
test('sustained slow frames downgrade after warmup, not on a single hitch',()=>{
  const q=createQualityController(strong);q.update(.2);assert.equal(q.snapshot().tier,'medium');
  simulate(q,25,4.5);assert.equal(q.snapshot().tier,'low');
  simulate(q,25,5);assert.equal(q.snapshot().tier,'low');
});
test('upgrade takes sustained headroom and threshold oscillation does not flap',()=>{
  const q=createQualityController({...strong,mobile:true});
  simulate(q,60,7);assert.equal(q.snapshot().tier,'medium');
  simulate(q,60,4);assert.equal(q.snapshot().tier,'high');
  for(let i=0;i<20;i++){simulate(q,38,.5);simulate(q,48,.5);}
  assert.equal(q.snapshot().tier,'high');
});
test('manual override resists FPS changes and auto resets capability baseline',()=>{
  const q=createQualityController(strong);q.setQuality('high');simulate(q,15,10);assert.equal(q.snapshot().tier,'high');assert.equal(q.snapshot().mode,'high');
  q.setQuality('low');simulate(q,60,15);assert.equal(q.snapshot().tier,'low');q.setQuality('auto');assert.equal(q.snapshot().tier,'medium');
});
test('background gaps ignored; resolution obeys device and pixel budgets',()=>{
  const q=createQualityController(strong);for(let i=0;i<100;i++)q.update(3);assert.equal(q.snapshot().tier,'medium');
  assert.ok(qualityPixelRatio(QUALITY_TIERS.low,1280,720,2)<=.65);
  assert.ok(1280*720*qualityPixelRatio(QUALITY_TIERS.low,1280,720,2)**2<=350001);
  assert.ok(qualityPixelRatio(QUALITY_TIERS.high,3840,2160,2)<.6);
  assert.equal(qualityPixelRatio(QUALITY_TIERS.ultra,100,100,1),1);
});
test('an expensive failed tier cannot be retried for sixty seconds',()=>{
  const q=createQualityController({...strong,mobile:true});
  simulate(q,60,11);assert.equal(q.snapshot().tier,'high');
  simulate(q,20,3.5);assert.equal(q.snapshot().tier,'medium');
  simulate(q,60,20);assert.equal(q.snapshot().tier,'medium');
  simulate(q,60,35);assert.equal(q.snapshot().tier,'medium');
  simulate(q,60,8);assert.equal(q.snapshot().tier,'high');
});
test('visible frames below four FPS still cause a downgrade',()=>{
  const q=createQualityController(strong);
  for(let i=0;i<8;i++)q.update(.8);
  assert.equal(q.snapshot().tier,'low');
  assert.equal(q.snapshot().fps,4);
});
test('auto keeps reducing resolution below low tier during sustained GPU pressure',()=>{
  const q=createQualityController(strong);let changes=0;
  for(let i=0;i<20*24;i++)if(q.update(1/20))changes++;
  assert.equal(q.snapshot().tier,'low');assert.equal(q.snapshot().scale,.35);
  assert.ok(changes>=4);assert.equal(q.settings.scale,.35);
  assert.ok(q.settings.pixels<QUALITY_TIERS.low.pixels);
  simulate(q,20,20);assert.equal(q.snapshot().scale,.35);
});
test('emergency resolution recovers slowly one step at a time before tier upgrades',()=>{
  const q=createQualityController(strong);simulate(q,20,24);
  simulate(q,60,7);assert.equal(q.snapshot().scale,.35);
  simulate(q,60,7);assert.equal(q.snapshot().scale,.45);assert.equal(q.snapshot().tier,'low');
  simulate(q,60,12);assert.equal(q.snapshot().scale,.55);assert.equal(q.snapshot().tier,'low');
});
test('manual low stays fixed and emergency scales do not flap around downgrade threshold',()=>{
  const manual=createQualityController(strong);manual.setQuality('low');simulate(manual,15,25);assert.equal(manual.snapshot().scale,.65);
  const q=createQualityController(strong);simulate(q,20,24);
  for(let i=0;i<20;i++){simulate(q,29,.5);simulate(q,45,.5);}
  assert.equal(q.snapshot().scale,.35);
  q.setQuality('auto');assert.equal(q.snapshot().scale,.85);
});

function withGpu(policy, fps, seconds, milliseconds, { stale = false, repeated = false } = {}) {
  for (let i = 0; i < fps * seconds; i++) policy.update(1 / fps, {
    supported: true, gpuMs: milliseconds, sampleId: repeated ? 'one' : `${seconds}/${i >> 2}`,
    ageSeconds: stale ? 4 : .1,
  });
}
test('cheap GPU work prevents pointless emergency blur during low-FPS CPU contention', () => {
  const q = createQualityController(strong);
  withGpu(q, 20, 30, 3);
  assert.equal(q.snapshot().tier, 'low');
  assert.equal(q.snapshot().scale, .65);
});
test('fresh expensive GPU work still reaches emergency resolution', () => {
  const q = createQualityController(strong);
  withGpu(q, 20, 30, 24);
  assert.equal(q.snapshot().scale, .35);
});
test('GPU headroom restores clarity gradually even while other work limits FPS', () => {
  const q = createQualityController(strong); simulate(q, 20, 24);
  withGpu(q, 20, 7, 2); assert.equal(q.snapshot().scale, .35);
  withGpu(q, 20, 7, 2); assert.equal(q.snapshot().scale, .45);
  withGpu(q, 20, 12, 2); assert.equal(q.snapshot().scale, .55);
  withGpu(q, 20, 12, 2); assert.equal(q.snapshot().scale, .65);
  assert.equal(q.snapshot().tier, 'low');
});
test('a resolution increase requires room for the predicted higher pixel cost', () => {
  const q = createQualityController(strong); simulate(q, 20, 24);
  withGpu(q, 20, 25, 8); assert.equal(q.snapshot().scale, .35);
  withGpu(q, 20, 15, 2); assert.equal(q.snapshot().scale, .45);
});
test('stale, absent, or repeatedly reused single samples cannot claim GPU headroom', () => {
  for (const options of [{ stale: true }, { repeated: true }]) {
    const q = createQualityController(strong); withGpu(q, 20, 30, 2, options);
    assert.equal(q.snapshot().scale, .35);
  }
});
test('GPU feedback never overrides a manual graphics selection', () => {
  const q = createQualityController(strong); q.setQuality('low'); withGpu(q, 20, 30, 30);
  assert.equal(q.snapshot().scale, .65); assert.equal(q.snapshot().mode, 'low');
});
