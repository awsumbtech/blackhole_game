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
let noiseBuffer = null;

// Browsers only allow audio after a user gesture; until then every sound is a no-op
// (avoids "AudioContext was not allowed to start" warnings).
let unlocked = false;

function ensureCtx() {
  if (ctx) return true;
  if (!unlocked) return false;
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

    // Pre-generate noise buffer for consume sounds
    const bufferSize = ctx.sampleRate * 0.15;
    noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    initialized = true;
    return true;
  } catch {
    return false;
  }
}

/** Call from a user gesture (tap/click/key). */
export function init() {
  unlocked = true;
  ensureCtx();
  resume();
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

  // Layer 3: Noise "fwoomp" for suction feel — reuse pre-generated buffer
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

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

// ─── EVENT CUES ───
// Short procedural audio signatures for living-world events

export function playEventCue(eventType) {
  if (!enabled || !ensureCtx()) return;
  resume();

  const now = ctx.currentTime;

  switch (eventType) {
    case "meteorShower": {
      // Filtered sawtooth sweep 60→200Hz
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.4);
      filter.type = "lowpass";
      filter.frequency.value = 400;
      filter.Q.value = 2;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.5);
      break;
    }

    case "cometStream": {
      // High sine with fast tremolo
      const osc = ctx.createOscillator();
      const tremolo = ctx.createOscillator();
      const tremoloGain = ctx.createGain();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 800;
      tremolo.type = "sine";
      tremolo.frequency.value = 12;
      tremoloGain.gain.value = 0.04;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      tremolo.connect(tremoloGain);
      tremoloGain.connect(gain.gain);
      osc.connect(gain);
      gain.connect(sfxGain);
      tremolo.start(now);
      osc.start(now);
      tremolo.stop(now + 0.45);
      osc.stop(now + 0.45);
      break;
    }

    case "voidPulse": {
      // Sub-bass thump at 30Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(30, now);
      osc.frequency.exponentialRampToValueAtTime(18, now + 0.3);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.45);
      break;
    }

    case "derelictFlotilla": {
      // Low resonant hum at 50Hz
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 50;
      filter.type = "bandpass";
      filter.frequency.value = 50;
      filter.Q.value = 8;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.55);
      break;
    }

    case "stellarBirth": {
      // Ascending sine arpeggio
      const notes = [330, 440, 550, 660];
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = notes[i];
        const t = now + i * 0.08;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.04, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + 0.25);
      }
      break;
    }

    case "gravitationalWave": {
      // Slow frequency sweep 100→40Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.55);
      break;
    }
  }
}

// ─── v2 SOUNDS ───

function tone(freq, { type = "sine", start = 0, attack = 0.02, decay = 0.25, vol = 0.05, slideTo = null } = {}) {
  const now = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + attack + decay);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(vol, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

/** Power-up collected: bright rising sparkle in the power-up's key. */
export function playPowerup(kind) {
  if (!enabled || !ensureCtx()) return;
  resume();
  const base = kind === "slow" ? 392 : kind === "double" ? 523.3 : 440;
  [0, 4, 7, 12, 19].forEach((st, i) => {
    tone(base * Math.pow(2, st / 12), { start: i * 0.05, decay: 0.3, vol: 0.045, type: i % 2 ? "triangle" : "sine" });
  });
}

export function playPowerupSpawn() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(880, { decay: 0.35, vol: 0.03 });
  tone(1318.5, { start: 0.08, decay: 0.4, vol: 0.025 });
}

export function playPowerupEnd() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(660, { decay: 0.25, vol: 0.03, slideTo: 330 });
}

/** Bumped into something too big. */
export function playBump() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(140, { type: "triangle", attack: 0.005, decay: 0.22, vol: 0.1, slideTo: 55 });
  tone(90, { type: "sine", attack: 0.005, decay: 0.3, vol: 0.08, slideTo: 40 });
}

/** Swallowed a former "bigger fish". */
export function playBigCatch() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(55, { attack: 0.02, decay: 0.7, vol: 0.12, slideTo: 35 });
  [261.6, 392, 523.3, 784].forEach((f, i) => tone(f, { start: 0.04 + i * 0.07, decay: 0.45, vol: 0.04 }));
}

export function playPurchase() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(659.3, { decay: 0.15, vol: 0.05, type: "triangle" });
  tone(987.8, { start: 0.07, decay: 0.3, vol: 0.05, type: "triangle" });
}

export function playDenied() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(196, { type: "square", decay: 0.12, vol: 0.02 });
}

export function playClick() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(520, { decay: 0.06, vol: 0.025 });
}

/** Rising "almost there" shimmer when a galaxy is 90% done. */
export function playNearGoal() {
  if (!enabled || !ensureCtx()) return;
  resume();
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, { start: i * 0.09, decay: 0.5, vol: 0.03 }));
}
