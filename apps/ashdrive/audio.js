// Original synthesized vehicle/industrial sound. Audio starts on interaction.
export function createAudio() {
  let context = null, master, engineGain, engineFilter, droneGain;
  let engineOscillators = [], disposed = false, muted = false, noiseBuffer;
  const voices = new Set(), continuous = [];
  const MAX_VOICES = 18;
  function param(parameter, value, smoothing = .05) {
    parameter.setTargetAtTime(value, context.currentTime, smoothing);
  }
  function connectContinuous(node, destination) { node.connect(destination); continuous.push(node); return node; }
  function initialize() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext || disposed) return false;
    context = new AudioContext();
    master = context.createGain(); master.gain.value = muted ? 0 : .34; master.connect(context.destination);
    const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -16; compressor.knee.value = 14; compressor.ratio.value = 5;
    compressor.connect(master); continuous.push(compressor);
    engineGain = context.createGain(); engineGain.gain.value = 0; engineGain.connect(compressor); continuous.push(engineGain);
    engineFilter = context.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420; engineFilter.Q.value = .6; engineFilter.connect(engineGain); continuous.push(engineFilter);
    for (const [type, multiplier, volume] of [['sawtooth', 1, .20], ['triangle', 2, .19], ['sine', .5, .34]]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = type; oscillator.frequency.value = 40 * multiplier; gain.gain.value = volume;
      oscillator.connect(gain); gain.connect(engineFilter); oscillator.start();
      engineOscillators.push({ oscillator, multiplier }); continuous.push(oscillator, gain);
    }
    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0); let brown = 0;
    for (let i = 0; i < samples.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .035) / 1.035; samples[i] = brown * 3.5; }
    const noise = context.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
    const droneFilter = context.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 130;
    droneGain = context.createGain(); droneGain.gain.value = 0;
    connectContinuous(noise, droneFilter); connectContinuous(droneFilter, droneGain); connectContinuous(droneGain, compressor); noise.start();
    // Separate transient bus shares the compressor with engine and ambience.
    apiBus = compressor;
    return true;
  }
  let apiBus;
  async function start() {
    if (disposed) return false;
    try { if (!context && !initialize()) return false; if (context.state === 'suspended') await context.resume(); return context.state === 'running'; }
    catch { return false; }
  }
  function update({ speed = 0, boosting = false, mode = 'menu' } = {}, dt = 0) {
    if (!context || disposed) return;
    const running = mode === 'playing', velocity = Math.min(70, Math.abs(Number.isFinite(speed) ? speed : 0));
    const rpm = 34 + velocity * 1.65 + (boosting ? 24 : 0);
    for (const { oscillator, multiplier } of engineOscillators) param(oscillator.frequency, rpm * multiplier, .09);
    param(engineFilter.frequency, 180 + velocity * 15 + (boosting ? 650 : 0), .12);
    param(engineGain.gain, running ? .42 + velocity / 140 : 0, running ? .08 : .04);
    param(droneGain.gain, running ? .14 : 0, .2);
  }
  function sound({ duration, volume, frequency = 100, endFrequency = 40, noise = false, type = 'sine', filter = 'lowpass', cutoff = 1500, endCutoff = cutoff }) {
    if (!context || context.state !== 'running' || muted || disposed) return;
    // Drop the oldest transient during dense firefights. Stop+disconnect is
    // synchronous for resource ownership; onended later becomes a no-op.
    if (voices.size >= MAX_VOICES) voices.values().next().value.stop();
    const source = noise ? context.createBufferSource() : context.createOscillator();
    const gain = context.createGain(), shaping = context.createBiquadFilter();
    const now = context.currentTime;
    if (noise) source.buffer = noiseBuffer;
    else { source.type = type; source.frequency.setValueAtTime(frequency, now); source.frequency.exponentialRampToValueAtTime(Math.max(15, endFrequency), now + duration); }
    shaping.type = filter; shaping.frequency.setValueAtTime(cutoff, now); shaping.frequency.exponentialRampToValueAtTime(Math.max(30, endCutoff), now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), now + .006); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(shaping); shaping.connect(gain); gain.connect(apiBus);
    let cleaned = false;
    const voice = { stop() { if (cleaned) return; cleaned = true; try { source.stop(); } catch {} source.disconnect(); shaping.disconnect(); gain.disconnect(); voices.delete(voice); } };
    voices.add(voice); source.onended = voice.stop; source.start(now); source.stop(now + duration + .02);
  }
  function cannon() {
    sound({ duration: .11, volume: .65, noise: true, filter: 'highpass', cutoff: 460, endCutoff: 170 });
    sound({ duration: .12, volume: .52, frequency: 120, endFrequency: 35, type: 'triangle', cutoff: 1100 });
  }
  function missile() {
    sound({ duration: .65, volume: .85, noise: true, filter: 'bandpass', cutoff: 2200, endCutoff: 250 });
    sound({ duration: .35, volume: .35, frequency: 95, endFrequency: 30, cutoff: 500 });
  }
  function explosion(scale = 1) {
    scale = Math.max(.25, Math.min(2, Number.isFinite(scale) ? scale : 1));
    sound({ duration: .55 + scale * .3, volume: .85 * scale, noise: true, cutoff: 1600, endCutoff: 80 });
    sound({ duration: .5 + scale * .22, volume: .65, frequency: 75, endFrequency: 22, cutoff: 250 });
  }
  function hit() {
    sound({ duration: .18, volume: .65, noise: true, filter: 'bandpass', cutoff: 2100, endCutoff: 350 });
    sound({ duration: .16, volume: .28, frequency: 330, endFrequency: 95, type: 'triangle', cutoff: 1900 });
  }
  function pickup() { sound({ duration: .3, volume: .26, frequency: 420, endFrequency: 840, type: 'sine', cutoff: 2100 }); }
  function toggle() { muted = !muted; if (context) param(master.gain, muted ? 0 : .34, .025); return muted; }
  function destroy() {
    disposed = true;
    for (const voice of [...voices]) voice.stop();
    for (const node of continuous) { try { node.stop?.(); } catch {} node.disconnect(); }
    continuous.length = 0; engineOscillators.length = 0;
    if (context) { master.disconnect(); context.close().catch(() => {}); }
  }
  return { start, update, cannon, missile, explosion, hit, pickup, toggle, destroy };
}
