// Pure quality policy: hardware baseline plus slow, hysteretic frame feedback.
export const QUALITY_TIERS = {
  low: { scale: .65, bloom: false, shadows: false, shadowSize: 512, pixels: 350000 },
  medium: { scale: .85, bloom: false, shadows: false, shadowSize: 512, pixels: 650000 },
  high: { scale: 1, bloom: true, shadows: true, shadowSize: 1024, pixels: 2200000 },
  ultra: { scale: 1.25, bloom: true, shadows: true, shadowSize: 1024, pixels: 3200000 },
};
const names = Object.keys(QUALITY_TIERS);
export function createQualityController({ cores = 4, memory = 4, mobile = false, width = 1280, height = 720, dpr = 1, backend = '' } = {}) {
  const weak = cores <= 2 || memory <= 2;
  const initial = weak ? 0 : 1; // Start direct-rendered; earn costly effects with sustained headroom.
  const ceiling = weak ? 1 : mobile ? 2 : 3;
  const retryAfter = names.map(() => 0);
  const lowScales = [.65, .55, .45, .35];
  let lowStep = 0, emergencySlow = 0, emergencyFast = 0;
  let gpuSampleId = null, gpuMean = null, gpuSamples = 0, gpuUnknown = 0;
  let index = initial, mode = 'auto', frameTime = 1 / 60, age = 0, slow = 0, fast = 0, cooldown = 0;
  function setQuality(value = 'auto') {
    if (value !== 'auto' && !names.includes(value)) return false;
    const old = index; mode = value; index = value === 'auto' ? initial : names.indexOf(value);
    age = 0; slow = 0; fast = 0; cooldown = 2; retryAfter.fill(0); lowStep = 0; emergencySlow = emergencyFast = 0;
    gpuSampleId = null; gpuMean = null; gpuSamples = 0; gpuUnknown = 0;
    return index !== old;
  }
  function update(dt, gpu = null) {
    // Hidden tabs are filtered by the renderer. Keep visible sub-4fps samples
    // useful while ignoring long debugger/suspension gaps.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) return false;
    frameTime += (Math.min(dt, .25) - frameTime) * (1 - Math.exp(-dt / .6));
    age += dt; cooldown = Math.max(0, cooldown - dt);
    const fresh = gpu?.supported && Number.isFinite(gpu.gpuMs) && gpu.gpuMs >= 0 && Number.isFinite(gpu.ageSeconds) && gpu.ageSeconds >= 0 && gpu.ageSeconds <= 2 && gpu.sampleId != null;
    if (fresh && gpu.sampleId !== gpuSampleId) {
      gpuMean = gpuMean === null ? gpu.gpuMs : gpuMean + (gpu.gpuMs - gpuMean) * .35;
      gpuSampleId = gpu.sampleId; gpuSamples++;
    }
    const measured = fresh && gpuSamples >= 2;
    gpuUnknown = measured ? 0 : gpuUnknown + dt;
    if (mode !== 'auto' || age < 2 || cooldown > 0) return false;
    const fps = 1 / frameTime;
    if (index === 0) {
      // Resolution cannot fix a CPU/compositor bottleneck. Keep clarity when
      // recent GPU work fits the budget; missing timers retain the FPS fallback.
      const gpuPressure = measured ? gpuMean > 16 : !gpu?.supported || gpuUnknown >= 3;
      const nextScale = lowScales[Math.max(0, lowStep - 1)];
      const projectedGpuMs = gpuMean * (nextScale / lowScales[lowStep]) ** 2;
      const resolutionHeadroom = measured && projectedGpuMs < 12;
      emergencySlow = fps < 30 && gpuPressure ? emergencySlow + dt : 0;
      emergencyFast = fps > 50 || resolutionHeadroom ? emergencyFast + dt : 0;
      if (emergencySlow >= 2 && lowStep < lowScales.length - 1) {
        lowStep++; emergencySlow = emergencyFast = slow = fast = 0; cooldown = 2; return true;
      }
      if (lowStep > 0) {
        // Restore one step after ten stable seconds of FPS or measured GPU headroom.
        // Tier upgrades remain disabled until full low-tier resolution returns.
        if (emergencyFast >= 10) { lowStep--; emergencySlow = emergencyFast = slow = fast = 0; cooldown = 2; return true; }
        return false;
      }
    }
    slow = fps < 40 ? slow + dt : 0;
    fast = fps > 57 ? fast + dt : 0;
    if (slow >= 2 && index > 0) { retryAfter[index] = age + 60; index--; lowStep = 0; emergencySlow = emergencyFast = 0; slow = fast = 0; cooldown = 2; return true; }
    if (fast >= 8 && index < ceiling && age >= retryAfter[index + 1]) { index++; slow = fast = 0; cooldown = 2; return true; }
    return false;
  }
  function settings() {
    const base = QUALITY_TIERS[names[index]];
    if (index !== 0 || lowStep === 0) return base;
    const scale = lowScales[lowStep];
    return { ...base, scale, pixels: Math.round(base.pixels * (scale / base.scale) ** 2) };
  }
  return { update, setQuality, get settings() { return settings(); }, snapshot() { return { mode, tier: names[index], scale: settings().scale, backend, fps: Math.round(1 / frameTime) }; } };
}
export function qualityPixelRatio(settings, width, height, dpr = 1) {
  return Math.max(.35, Math.min(Math.max(.35, dpr), settings.scale, Math.sqrt(settings.pixels / Math.max(1, width * height))));
}
