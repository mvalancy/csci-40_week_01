// Procedural soundtrack with Tone.js: one groove per world (tempo, key,
// drum pattern, bass line, arpeggio). Intensity (turbo / big air) opens
// the filter and adds hats. Starts only after a user gesture.
import * as Tone from 'tone';

const STYLES = {
  stadium: { bpm: 150, root: 'E2', scale: [0, 3, 5, 7, 10], lead: 'square', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: [0, 0, 3, 0, 5, 3, 7, 5], arp: [0, 2, 4, 2] },
  canyon: { bpm: 128, root: 'D2', scale: [0, 1, 4, 5, 7, 8, 10], lead: 'triangle', kick: 'x.....x...x.....', snare: '....x.......x..x', hat: '..x...x...x...x.', bass: [0, 0, 1, 0, 4, 5, 4, 1], arp: [0, 2, 3, 5] },
  alpine: { bpm: 140, root: 'A2', scale: [0, 2, 3, 5, 7, 8, 10], lead: 'sine', kick: 'x.......x.......', snare: '........x.......', hat: 'x.xxx.xxx.xxx.xx', bass: [0, 0, 5, 5, 3, 3, 4, 4], arp: [0, 2, 4, 6] },
  neon: { bpm: 118, root: 'F#2', scale: [0, 2, 3, 5, 7, 8, 10], lead: 'sawtooth', kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: [0, 0, 0, 0, 5, 5, 3, 4], arp: [0, 2, 4, 7] },
  volcano: { bpm: 164, root: 'C2', scale: [0, 1, 3, 5, 6, 8, 10], lead: 'square', kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', bass: [0, 1, 0, 4, 0, 1, 5, 4], arp: [0, 1, 4, 2] },
};

// When the page stalls, Tone can schedule two notes at the same instant and
// throw; dropping that note is inaudible, crashing the game is not.
const safe = (fn) => { try { fn(); } catch {} };

export function createMusic(biomeId) {
  const style = STYLES[biomeId] || STYLES.stadium;
  let ready = false;
  let playing = false;
  let muted = false;
  let parts = [];
  let filter;
  let master;

  const note = (degree, octave = 0) => {
    const s = style.scale;
    const i = ((degree % s.length) + s.length) % s.length;
    const oct = Math.floor(degree / s.length) + octave;
    return Tone.Frequency(style.root).transpose(s[i] + 12 * oct).toNote();
  };

  function build() {
    master = new Tone.Volume(-14).toDestination();
    filter = new Tone.Filter(1400, 'lowpass').connect(master);
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } }).connect(master);
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(master);
    const hat = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.04, release: 0.01 }, harmonicity: 5.1, resonance: 5000, octaves: 1.5, volume: -22 }).connect(master);
    const bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.1 }, filterEnvelope: { attack: 0.001, decay: 0.15, sustain: 0.2, baseFrequency: 120, octaves: 3 }, volume: -8 }).connect(filter);
    const lead = new Tone.Synth({ oscillator: { type: style.lead }, envelope: { attack: 0.005, decay: 0.12, sustain: 0.1, release: 0.15 }, volume: -18 }).connect(filter);

    const steps = [...Array(16).keys()];
    parts.push(new Tone.Sequence((t, i) => {
      if (style.kick[i] === 'x') safe(() => kick.triggerAttackRelease('C1', '8n', t));
      if (style.snare[i] === 'x') safe(() => snare.triggerAttackRelease('16n', t));
      if (style.hat[i] === 'x' || (intensity > 0.6 && i % 2)) safe(() => hat.triggerAttackRelease('C6', '32n', t, 0.3 + intensity * 0.4));
    }, steps, '16n'));
    let bar = 0;
    parts.push(new Tone.Sequence((t, i) => {
      if (i === 0) bar++;
      safe(() => bass.triggerAttackRelease(note(style.bass[i]), '8n', t));
    }, [...Array(8).keys()], '8n'));
    parts.push(new Tone.Sequence((t, i) => {
      // Arp climbs an octave every other bar so the loop doesn't feel static.
      const lift = (bar % 4 >= 2 ? style.scale.length : 0);
      safe(() => lead.triggerAttackRelease(note(style.arp[i % style.arp.length] + lift, 2), '16n', t));
    }, steps, '16n'));
    Tone.getTransport().bpm.value = style.bpm;
    ready = true;
  }

  let intensity = 0;
  return {
    get playing() { return playing; },
    get bpm() { return style.bpm; },
    async start() {
      try {
        await Tone.start();
        if (!ready) build();
        if (playing) return;
        parts.forEach((p) => p.start(0));
        Tone.getTransport().start('+0.05');
        playing = true;
        if (muted) master.mute = true;
      } catch {}
    },
    stop() {
      if (!playing) return;
      Tone.getTransport().stop();
      parts.forEach((p) => p.stop());
      playing = false;
    },
    setMuted(m) { muted = m; if (master) master.mute = m; },
    // 0..1 — turbo / air make the track brighter and busier.
    setIntensity(v) {
      intensity += (v - intensity) * 0.05;
      if (filter) filter.frequency.value = 900 + intensity * 4000;
    },
  };
}
