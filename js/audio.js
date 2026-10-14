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

    // v6.0.1 softer master: a gentle, slow compressor, then a soft limiter
    // so nothing ever pokes out, however many sounds stack up.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.03;
    comp.release.value = 0.4;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.3;

    masterGain.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);

    // Sub-chains
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.12;
    droneGain.connect(masterGain);

    // Sound effects pass through a warm lowpass (no bright overtones)
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.6;
    const sfxLP = ctx.createBiquadFilter();
    sfxLP.type = "lowpass";
    sfxLP.frequency.value = 1600;
    sfxLP.Q.value = 0.5;
    sfxGain.connect(sfxLP);
    sfxLP.connect(masterGain);

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

// v3: each biome has its own chord + filter; the whole bed swells gently with
// the breathing cycle (setBreath, driven from the game loop).
let breathTarget = 0.5;
let lastBreathSet = 0;

export function startDrone(biome) {
  if (!enabled || !ensureCtx()) return;
  stopDrone();
  resume();
  droneActive = true;

  const snd = (biome && biome.sound) || { root: 60, chord: [1, 1.5, 2], cutoff: 400 };
  const now = ctx.currentTime;
  snd.chord.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = snd.root * ratio * (1 + i * 0.003);
    filter.type = "lowpass";
    filter.frequency.value = snd.cutoff;
    filter.Q.value = 0.7;
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.exponentialRampToValueAtTime(i === 0 ? 0.08 : 0.03 / (1 + i * 0.3), now + 4);
    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(droneGain);
    osc.start(now);
    droneOscs.push({ osc, gain: oscGain, filter });
  });
  if (snd.scale) setScale(snd.scale);
  if (layerWant) setMusicLayers(layerWant.tierIdx, layerWant.biome);
}

/** b in 0..1 (0 = out-breath, 1 = in-breath). Throttled, smoothed. */
export function setBreath(b) {
  if (!ctx || !droneGain) return;
  const t = ctx.currentTime;
  if (t - lastBreathSet < 0.2) return;
  lastBreathSet = t;
  breathTarget = b;
  droneGain.gain.setTargetAtTime(0.09 + b * 0.07, t, 0.4);
}

// Eating sounds snap to a major-pentatonic scale in the biome's key, so
// nothing ever clashes with the drone.
let scaleRoot = 293.7;
const PENTA = [0, 2, 4, 7, 9];
export function setScale(root) { scaleRoot = root; }
function snapToScale(freq) {
  const semis = 12 * Math.log2(freq / scaleRoot);
  const oct = Math.floor(semis / 12);
  let best = PENTA[0], bd = Infinity;
  for (const p of [...PENTA, 12]) {
    const d = Math.abs(semis - oct * 12 - p);
    if (d < bd) { bd = d; best = p; }
  }
  return scaleRoot * Math.pow(2, (oct * 12 + best) / 12);
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
  stopMusicLayers();
}

// ─── v6 MELODIC BITES ───
// An 8-note phrase on scale degrees (0-9 = two octaves of the pentatonic).
// It walks in small steps so it always sounds like a melody, and every 12
// bites one note drifts by a step, so the tune slowly evolves as you play.
const PHRASE_LEN = 8;
let phrase = makePhrase();
let phraseIdx = 0, phraseBites = 0, lastBiteAt = 0;
function makePhrase() {
  const p = [];
  let d = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < PHRASE_LEN; i++) {
    p.push(d);
    d = Math.max(0, Math.min(9, d + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
  }
  p[PHRASE_LEN - 1] = [0, 2, 5, 7][Math.floor(Math.random() * 4)];   // phrases come home to a root/fifth
  return p;
}
function degreeToFreq(d) {
  const oct = Math.floor(d / 5), step = PENTA[d % 5];
  return scaleRoot * Math.pow(2, (oct * 12 + step) / 12);   // v6.0.1: an octave lower, warmer
}
function nextPhraseNote() {
  const t = ctx ? ctx.currentTime : 0;
  // After a quiet pause the phrase starts again from the top, like a new line
  if (t - lastBiteAt > 2.5) phraseIdx = 0;
  lastBiteAt = t;
  const f = degreeToFreq(phrase[phraseIdx]);
  phraseIdx = (phraseIdx + 1) % PHRASE_LEN;
  if (++phraseBites % 12 === 0) {
    const i = Math.floor(Math.random() * (PHRASE_LEN - 1));
    phrase[i] = Math.max(0, Math.min(9, phrase[i] + (Math.random() < 0.5 ? -1 : 1)));
  }
  return f;
}
/** A new galaxy gets a fresh phrase. */
export function newPhrase() { phrase = makePhrase(); phraseIdx = 0; }
export function phraseInfo() { return { phrase: phrase.slice(), idx: phraseIdx, root: scaleRoot }; }

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
  // v6 melodic bites: each bite plays the next note of a slowly evolving
  // pentatonic phrase in the biome's key, so a streak sounds like a tune.
  const pitch = nextPhraseNote();
  osc.frequency.value = pitch;

  filter.type = "lowpass";
  filter.frequency.value = 900 + massRatio * 300;

  const vol = Math.min(0.06, 0.022 + massRatio * 0.035);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(vol, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6 + massRatio * 0.25);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.9);

  // Layer 2: Sub-bass bloom for larger objects
  if (massRatio > 0.3) {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.value = tone * 0.25;

    const subVol = Math.min(0.05, massRatio * 0.035);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(subVol, now + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    sub.connect(subGain);
    subGain.connect(sfxGain);
    sub.start(now);
    sub.stop(now + 0.55);
  }

  // Layer 3: Noise "fwoomp" for suction feel — reuse pre-generated buffer
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 500 + Math.min(300, tone * 0.3);
  noiseFilter.Q.value = 0.4;

  // a soft "hush" of suction, eased in rather than clicked on
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(Math.min(0.02, 0.008 + massRatio * 0.015), now + 0.04);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

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
  const baseNote = scaleRoot;

  // v6: a soft arpeggio in the biome's pentatonic key (was a fixed A major)
  const intervals = [0, 4, 7, 12, 14];
  const noteCount = Math.min(count, 5);

  for (let i = 0; i < noteCount; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = baseNote * Math.pow(2, intervals[i] / 12);

    const t = now + i * 0.1;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.011, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.75);
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
    gain.gain.exponentialRampToValueAtTime(0.028, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 1.8);
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

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.35);
}

// ─── EVENT CUES ───
// v3: soft, slow-swelling pads that play at the start of each event's 2.5s
// warning. No buzz, no sharp attacks.

const EVENT_PADS = {
  meteorShower: [196, 293.7, 392],          // G3 D4 G4
  cometStream: [329.6, 493.9, 659.3],       // E4 B4 E5 (icy)
  derelictFlotilla: [146.8, 220, 293.7],    // low D
  voidPulse: [174.6, 261.6, 349.2],         // F (warm, open)
  stellarBirth: [261.6, 329.6, 392, 523.3], // C major bloom
  gravitationalWave: [110, 164.8, 220]      // low A, very soft
};

function pad(freqs, { attack = 1.2, hold = 0.6, release = 1.6, vol = 0.03 } = {}) {
  const now = ctx.currentTime;
  const end = now + attack + hold + release;
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = f * (1 + (i - 1) * 0.002);
    filter.type = "lowpass";
    filter.frequency.value = 900;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol / (1 + i * 0.4), now + attack);
    gain.gain.setValueAtTime(vol / (1 + i * 0.4), now + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(end + 0.05);
  });
}

export function playEventCue(eventType) {
  if (!enabled || !ensureCtx()) return;
  resume();
  pad(EVENT_PADS[eventType] || EVENT_PADS.meteorShower);
}

// ─── v2 SOUNDS ───

function tone(freq, { type = "sine", start = 0, attack = 0.02, decay = 0.25, vol = 0.05, slideTo = null } = {}) {
  // v6.0.1 soft by design: sine/triangle only, never under a 45ms attack,
  // a longer gentle release and about 40% quieter than before
  if (type !== "sine" && type !== "triangle") type = "triangle";
  attack = Math.max(0.045, attack);
  decay = decay * 1.4 + 0.1;
  vol *= 0.6;
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
  // Soft, low "boop" (was a hard triangle thud)
  tone(196, { type: "sine", attack: 0.03, decay: 0.35, vol: 0.035, slideTo: 165 });
}

/** v6: the end-of-galaxy ritual. A low, slow chord, like a held breath. */
export function playRitual() {
  if (!enabled || !ensureCtx()) return;
  resume();
  [0, 7, 16].forEach((st, i) => tone(scaleRoot / 2 * Math.pow(2, st / 12), { start: 0.3 + i * 0.35, attack: 0.9, decay: 3.2, vol: 0.03 }));
}

/** v7 Zen wind-down: the music resolves into one long, held note. */
export function playZenResolve() {
  if (!enabled || !ensureCtx()) return;
  resume();
  const now = ctx.currentTime;
  [[scaleRoot / 2, 0.035], [scaleRoot, 0.018], [scaleRoot * 1.5, 0.01]].forEach(([f, v]) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + 6);
    g.gain.setValueAtTime(v, now + 40);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 80);
    osc.connect(g); g.connect(sfxGain);
    osc.start(now); osc.stop(now + 81);
  });
}

/** v7 Zen exit: a soft low tone under each guided breath. */
export function playBreathTone() {
  if (!enabled || !ensureCtx()) return;
  resume();
  tone(scaleRoot / 2, { attack: 1.6, decay: 5, vol: 0.03 });
}

/** v7: a goal star. One soft, rising note per star. */
export function playGoalStar(n) {
  if (!enabled || !ensureCtx()) return;
  resume();
  [0, 4, 7].slice(0, Math.max(1, n)).forEach((st, i) => tone(scaleRoot * Math.pow(2, st / 12), { start: i * 0.18, attack: 0.08, decay: 1.1, vol: 0.022 }));
}

/** v7: collapse into a singularity. A slow descending fall into a low, held note. */
export function playCollapse() {
  if (!enabled || !ensureCtx()) return;
  resume();
  [12, 7, 4, 0].forEach((st, i) => tone(scaleRoot / 2 * Math.pow(2, st / 12), { start: i * 0.45, attack: 0.3, decay: 2.2, vol: 0.026 }));
  tone(scaleRoot / 4, { start: 1.6, attack: 1.5, decay: 5, vol: 0.04 });
}

/** v6: a discovery. A slow, soft rising phrase in the biome's key. */
export function playDiscovery() {
  if (!enabled || !ensureCtx()) return;
  resume();
  const r = scaleRoot * 2;
  [0, 4, 7, 9, 12].forEach((s, i) => tone(r * Math.pow(2, s / 12), { start: i * 0.16, attack: 0.06, decay: 1.1, vol: 0.026 }));
}

/** Swallowed a former "bigger fish". */
export function playBigCatch() {
  if (!enabled || !ensureCtx()) return;
  resume();
  // v6: a slow, warm swell in the biome's key that matches the swallow
  tone(scaleRoot / 2, { attack: 0.3, decay: 1.4, vol: 0.04 });
  [0, 7, 12, 16].forEach((st, i) => tone(scaleRoot * Math.pow(2, st / 12), { start: 0.12 + i * 0.15, attack: 0.1, decay: 1.0, vol: 0.016 }));
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
  tone(196, { type: "sine", decay: 0.12, vol: 0.02 });
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

// ─── v5: TIER MUSIC LAYERS ───
// One soft layer joins the drone for each scale tier you reach (up to six):
// shimmer, low bass, slow plucks, air, an open fifth, distant bells.
let layerNodes = [];      // [{ stop() }]
let layerRoot = 0;
let layerCount = 0;
let layerTick = null;
let pluckClock = 0, bellClock = 0;
let airBuffer = null;

function voice(freq, type, vol, { cutoff = 2000, lfo = 0.07, depth = 0.4, fade = 6 } = {}) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  osc.type = type;
  osc.frequency.value = freq;
  f.type = "lowpass"; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + fade);
  // slow swell
  const l = ctx.createOscillator(), lg = ctx.createGain();
  l.frequency.value = lfo; lg.gain.value = vol * depth;
  l.connect(lg); lg.connect(g.gain);
  osc.connect(f); f.connect(g); g.connect(droneGain);
  osc.start(now); l.start(now);
  return {
    stop() {
      const t = ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
        osc.stop(t + 3.1); l.stop(t + 3.1);
      } catch {}
    }
  };
}

function air(vol) {
  if (!airBuffer) {
    const n = ctx.sampleRate * 2;
    airBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = airBuffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = airBuffer; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 8);
  const l = ctx.createOscillator(), lg = ctx.createGain();
  l.frequency.value = 0.05; lg.gain.value = vol * 0.6;
  l.connect(lg); lg.connect(g.gain);
  src.connect(f); f.connect(g); g.connect(droneGain);
  src.start(now); l.start(now);
  return {
    stop() {
      const t = ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
        src.stop(t + 3.1); l.stop(t + 3.1);
      } catch {}
    }
  };
}

function softNote(freq, { vol = 0.02, attack = 0.06, decay = 2.2, type = "sine", start = 0 } = {}) {
  attack = Math.max(0.06, attack);
  if (type !== "sine" && type !== "triangle") type = "triangle";
  const now = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  osc.connect(g); g.connect(droneGain);
  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

function buildLayer(i, root) {
  switch (i) {
    case 0: return [voice(root * 4, "sine", 0.05, { lfo: 0.06 }), voice(root * 6.02, "sine", 0.03, { lfo: 0.045 })];
    case 1: return [voice(root * 0.5, "sine", 0.16, { cutoff: 300, lfo: 0.05, depth: 0.25 })];
    case 2: return [];   // plucks (scheduled)
    case 3: return [air(0.05)];
    case 4: return [voice(root * 3, "triangle", 0.05, { cutoff: 900, lfo: 0.03 })];
    case 5: return [];   // bells (scheduled)
  }
  return [];
}

function tickLayers() {
  if (!ctx || !enabled || !droneActive || ctx.state !== "running") return;
  pluckClock += 0.4; bellClock += 0.4;
  if (layerCount > 2 && pluckClock >= 3.2) {
    pluckClock = 0;
    const n = PENTA[Math.floor(Math.random() * PENTA.length)];
    softNote(scaleRoot * Math.pow(2, n / 12), { vol: 0.12, decay: 2.4, type: "triangle" });
  }
  if (layerCount > 5 && bellClock >= 9.6) {
    bellClock = 0;
    const base = scaleRoot * 2;
    [0, 7, 12].forEach((s, k) => softNote(base * Math.pow(2, s / 12), { vol: 0.07, decay: 4, start: k * 0.45 }));
  }
}

let layerWant = null;
export function setMusicLayers(tierIdx, biome) {
  layerWant = { tierIdx, biome };
  if (!ensureCtx() || !droneActive) return;
  const root = ((biome && biome.sound) || { root: 60 }).root;
  const want = Math.max(0, Math.min(6, tierIdx | 0));
  if (root !== layerRoot) {
    for (const n of layerNodes.flat()) n.stop();
    layerNodes = [];
    layerRoot = root;
  }
  while (layerNodes.length < want) layerNodes.push(buildLayer(layerNodes.length, root));
  while (layerNodes.length > want) for (const n of layerNodes.pop()) n.stop();
  layerCount = want;
  if (!layerTick) layerTick = setInterval(tickLayers, 400);
}

export function stopMusicLayers() {
  for (const n of layerNodes.flat()) { try { n.stop(); } catch {} }
  layerNodes = [];
  layerRoot = 0;
  layerCount = 0;
}

export function musicInfo() { return { layers: layerCount, root: layerRoot }; }

/** A tier reveal: a slow, rising four-note bell over a soft pad. */
export function playTierChime() {
  if (!enabled || !ensureCtx()) return;
  resume();
  const base = scaleRoot;
  [0, 4, 7, 12].forEach((s, k) => {
    const f = base * Math.pow(2, s / 12);
    const start = k * 0.38;
    const now = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.026, now + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
    osc.connect(g); g.connect(sfxGain);
    osc.start(now); osc.stop(now + 3.3);
  });
  pad([base, base * 1.5, base * 2], { attack: 1.4, hold: 1, release: 2.2, vol: 0.025 });
}
