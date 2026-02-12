// ─── AUDIO ENGINE ───
// Generative ambient soundscape + consume sounds + milestone events
// All procedural, no external files needed.

let ctx = null;
let masterGain = null;
let droneGain = null;
let sfxGain = null;
let droneOscs = [];
let enabled = true;
let volume = 0.4;
let initialized = false;

function ensureCtx() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master chain
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;

    // Compressor for smoothness
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;

    masterGain.connect(comp);
    comp.connect(ctx.destination);

    // Sub-chains
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.12;
    droneGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(masterGain);

    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export function init() {
  ensureCtx();
}

export function resume() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

export function setEnabled(on) {
  enabled = on;
  if (!on) stopDrone();
}

export function setVolume(v) {
  volume = v;
  if (masterGain) masterGain.gain.value = v;
}

// ─── AMBIENT DRONE ───
// Low evolving pad that shifts with biome

let droneActive = false;

export function startDrone(biomeTintRGB) {
  if (!enabled || !ensureCtx()) return;
  stopDrone();

  resume();
  droneActive = true;

  // Map biome color to base frequency — darker = lower
  const brightness = (biomeTintRGB[0] + biomeTintRGB[1] + biomeTintRGB[2]) / 3;
  const baseFreq = 40 + brightness * 0.6;

  const now = ctx.currentTime;

  // 3 detuned oscillators for richness
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = baseFreq * (1 + i * 0.005);

    // Slow LFO-like frequency modulation
    osc.frequency.setValueAtTime(baseFreq * (1 + i * 0.005), now);

    filter.type = "lowpass";
    filter.frequency.value = 200 + brightness * 3;
    filter.Q.value = 1;

    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.exponentialRampToValueAtTime(i === 0 ? 0.08 : 0.03, now + 3);

    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(droneGain);
    osc.start(now);

    droneOscs.push({ osc, gain: oscGain, filter });
  }
}

export function stopDrone() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const d of droneOscs) {
    try {
      d.gain.gain.exponentialRampToValueAtTime(0.001, now + 1);
      d.osc.stop(now + 1.1);
    } catch {}
  }
  droneOscs = [];
  droneActive = false;
}

// ─── CONSUME SOUNDS ───

export function playConsume(tone, massRatio, comboCount) {
  if (!enabled || !ensureCtx()) return;
  resume();

  const now = ctx.currentTime;

  // Layer 1: Tonal ping
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "sine";
  // Higher combo = ascending pitch
  const pitch = tone * (1 + comboCount * 0.04);
  osc.frequency.value = pitch;

  filter.type = "lowpass";
  filter.frequency.value = 1200 + massRatio * 400;

  const vol = Math.min(0.15, 0.04 + massRatio * 0.08);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(vol, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18 + massRatio * 0.1);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.3);

  // Layer 2: Sub-bass bloom for larger objects
  if (massRatio > 0.3) {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.value = tone * 0.25;

    const subVol = Math.min(0.1, massRatio * 0.06);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.exponentialRampToValueAtTime(subVol, now + 0.04);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    sub.connect(subGain);
    subGain.connect(sfxGain);
    sub.start(now);
    sub.stop(now + 0.35);
  }

  // Layer 3: Noise "fwoomp" for suction feel
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 300 + tone * 0.5;
  noiseFilter.Q.value = 2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(Math.min(0.06, 0.02 + massRatio * 0.04), now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(sfxGain);
  noise.start(now);
}

// ─── COMBO CHIME ───
// Triggered on rapid consumes (3+ in quick succession)

export function playComboChime(count) {
  if (!enabled || !ensureCtx()) return;
  resume();

  const now = ctx.currentTime;
  const baseNote = 440;

  // Ascending arpeggio based on combo length
  const intervals = [0, 4, 7, 12, 16]; // Major + octave
  const noteCount = Math.min(count, 5);

  for (let i = 0; i < noteCount; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = baseNote * Math.pow(2, intervals[i] / 12);

    const t = now + i * 0.06;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.04, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}

// ─── GALAXY COMPLETE ───
// Satisfying chord resolution

export function playGalaxyComplete() {
  if (!enabled || !ensureCtx()) return;
  resume();

  const now = ctx.currentTime;
  // C major chord with octave — resolving, peaceful
  const freqs = [261.6, 329.6, 392.0, 523.3];

  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 3.8);
  }
}

// ─── BOUNCE ───
// Soft thud when hitting boundary

export function playBounce() {
  if (!enabled || !ensureCtx()) return;
  resume();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.2);
}
