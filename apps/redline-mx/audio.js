// Tiny WebAudio synth: a buzzy engine whose pitch follows speed, plus
// noise bursts for crashes and a blip for perfect landings. M mutes.
export function createAudio() {
  let ctx, engine, filter, gain, muted = false;

  const start = () => {
    if (ctx) return;
    ctx = new AudioContext();
    engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain = ctx.createGain();
    gain.gain.value = 0;
    engine.connect(filter).connect(gain).connect(ctx.destination);
    engine.start();
  };

  const burst = (dur, freq, vol = 0.2) => {
    if (!ctx || muted) return;
    const n = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  };

  const blip = (freq) => {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 2, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  };

  return {
    start,
    toggleMute: () => (muted = !muted),
    get muted() { return muted; },
    engine(speed, turbo, on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engine.frequency.setTargetAtTime(45 + speed * 3.2 + (turbo ? 25 : 0), t, 0.05);
      filter.frequency.setTargetAtTime(400 + speed * 30, t, 0.1);
      gain.gain.setTargetAtTime(muted || !on ? 0 : 0.045, t, 0.1);
    },
    crash: () => burst(0.6, 900, 0.3),
    land: () => burst(0.12, 300, 0.15),
    perfect: () => blip(660),
    beep: (hi) => blip(hi ? 880 : 440),
  };
}
