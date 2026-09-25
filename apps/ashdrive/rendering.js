import * as THREE from 'three';
import { createQualityController, qualityPixelRatio } from './quality.js';
import { createGpuTimer } from './gpu-timer.js';

// Hardware chooses a conservative starting budget; sustained frame timings adapt it.
export async function createRendering(container, scene, camera) {
  const query = new URLSearchParams(location.search);
  const profiling = query.get('profile') === '1';
  let sampleTiming = profiling || !['low', 'medium', 'high', 'ultra'].includes(query.get('quality'));
  let adapter = null;
  if (query.get('renderer') !== 'webgl' && navigator.gpu) {
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch {}
  }
  let renderer, enhancedRender, backend, composer, createEnhanced;
  if (adapter) {
    try {
      const GPU = await import('three/webgpu');
      const { pass } = await import('three/tsl');
      const { bloom } = await import('three/addons/tsl/display/BloomNode.js');
      renderer = new GPU.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', trackTimestamp: sampleTiming });
      await renderer.init();
      createEnhanced = () => {
        const pipeline = new GPU.RenderPipeline(renderer), scenePass = pass(scene, camera), color = scenePass.getTextureNode('output');
        pipeline.outputNode = color.add(bloom(color, .35, .4, 1.1));
        enhancedRender = () => pipeline.render();
      };
      backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    } catch { renderer?.dispose(); renderer = null; }
  }
  if (!renderer) {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    createEnhanced = () => {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .4, 1.1));
      composer.addPass(new OutputPass());
      enhancedRender = () => composer.render();
    };
    backend = 'WebGL 2';
  }
  const policy = createQualityController({ cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory || 4, mobile: matchMedia('(pointer: coarse)').matches, width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1, backend });
  if (query.has('quality')) policy.setQuality(query.get('quality'));
  let pixelRatio = 1, bloomEnabled = false;
  renderer.domElement.className = 'webgl';
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);
  function resize() {
    pixelRatio = qualityPixelRatio(policy.settings, innerWidth, innerHeight, devicePixelRatio || 1);
    renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight);
    if (bloomEnabled && composer) { composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight); }
  }
  function applyQuality() {
    const settings = policy.settings; bloomEnabled = settings.bloom;
    if (bloomEnabled && !enhancedRender) createEnhanced();
    const shadowsChanged = renderer.shadowMap.enabled !== settings.shadows;
    renderer.shadowMap.enabled = settings.shadows; renderer.shadowMap.needsUpdate = true;
    scene.traverse(object => {
      if (settings.shadows && object.isLight && object.shadow && object.shadow.mapSize.x !== settings.shadowSize) {
        object.shadow.mapSize.set(settings.shadowSize, settings.shadowSize);
        // Both backends own and resize their targets. Keep them across tiers:
        // manual disposal invalidates WebGPU's cached shadow texture bindings.
        object.shadow.needsUpdate = true;
      }
      if (shadowsChanged && object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
    });
    resize();
  }
  applyQuality();
  let timer = createGpuTimer(renderer);
  return {
    renderer, backend, resize,
    render() {
      if (sampleTiming) timer.begin();
      try { if (bloomEnabled) enhancedRender(); else renderer.render(scene, camera); }
      finally { if (sampleTiming) timer.end(); }
    },
    get gpuTiming() { return sampleTiming ? timer.sample() : null; },
    updateQuality(rawDt) { if (document.hidden) return; if (policy.update(rawDt, sampleTiming ? timer.sample() : null)) applyQuality(); },
    setQuality(value) {
      if (!['auto','ultra','high','medium','low'].includes(value)) return;
      if (value === 'auto' && renderer.backend?.isWebGPUBackend && !renderer.backend.trackTimestamp && renderer.hasFeature('timestamp-query')) {
        // Three requests the supported feature at device creation; its query
        // pool is lazy, so manual-start sessions can enable timing on demand.
        renderer.backend.trackTimestamp = true;
        timer.dispose(); timer = createGpuTimer(renderer);
      }
      sampleTiming = profiling || value === 'auto' || renderer.backend?.trackTimestamp === true;
      policy.setQuality(value); applyQuality();
    },
    get quality() { return { ...policy.snapshot(), scale: Math.round(pixelRatio * 100) / 100 }; },
  };
}
