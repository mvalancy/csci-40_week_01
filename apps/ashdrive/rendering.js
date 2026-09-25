import * as THREE from 'three';
import { createQualityController, qualityPixelRatio } from './quality.js';

// Hardware chooses a conservative starting budget; sustained frame timings adapt it.
export async function createRendering(container, scene, camera) {
  const query = new URLSearchParams(location.search);
  let adapter = null;
  if (query.get('renderer') !== 'webgl' && navigator.gpu) {
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch {}
  }
  let renderer, enhancedRender, backend, composer;
  if (adapter) {
    try {
      const GPU = await import('three/webgpu');
      const { pass } = await import('three/tsl');
      const { bloom } = await import('three/addons/tsl/display/BloomNode.js');
      renderer = new GPU.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
      await renderer.init();
      const pipeline = new GPU.RenderPipeline(renderer), scenePass = pass(scene, camera), color = scenePass.getTextureNode('output');
      pipeline.outputNode = color.add(bloom(color, .35, .4, 1.1));
      enhancedRender = () => pipeline.render(); backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    } catch { renderer?.dispose(); renderer = null; }
  }
  if (!renderer) {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .4, 1.1));
    composer.addPass(new OutputPass());
    enhancedRender = () => composer.render(); backend = 'WebGL 2';
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
    composer?.setPixelRatio(pixelRatio); composer?.setSize(innerWidth, innerHeight);
  }
  function applyQuality() {
    const settings = policy.settings; bloomEnabled = settings.bloom;
    const shadowsChanged = renderer.shadowMap.enabled !== settings.shadows;
    renderer.shadowMap.enabled = settings.shadows; renderer.shadowMap.needsUpdate = true;
    scene.traverse(object => {
      if (object.isLight && object.shadow && object.shadow.mapSize.x !== settings.shadowSize) {
        object.shadow.mapSize.set(settings.shadowSize, settings.shadowSize);
        object.shadow.map?.dispose(); object.shadow.map = null;
        object.shadow.mapPass?.dispose(); object.shadow.mapPass = null;
        object.shadow.needsUpdate = true;
      }
      if (shadowsChanged && object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
    });
    resize();
  }
  applyQuality();
  return {
    renderer, backend, resize,
    render() { if (bloomEnabled) enhancedRender(); else renderer.render(scene, camera); },
    updateQuality(rawDt) { if (document.hidden) return; if (policy.update(rawDt)) applyQuality(); },
    setQuality(value) { if (!['auto','ultra','high','medium','low'].includes(value)) return; policy.setQuality(value); applyQuality(); },
    get quality() { return { ...policy.snapshot(), scale: Math.round(pixelRatio * 100) / 100 }; },
  };
}
