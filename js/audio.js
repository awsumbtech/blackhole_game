// ─── AUDIO ENGINE (v7.1 "Calm Sound") ───
// Rebuilt from the rules in docs/AUDIO_RESEARCH.md. In short:
//  - The bed is soft brown noise (like distant surf), swelling with the 10 s breath.
//  - Music is sparse, slow single sine notes in just intonation. Notes that
//    overlap are always exact consonances (octave, fifth, fourth, wide third)
//    and never closer than ~1.5 critical bands, so nothing beats or roughens.
//    There are no detuned oscillators and no LFOs in the audible beating range.
//  - Everything passes a 1.8 kHz lowpass (the ear is most sensitive at 2-5 kHz),
//    and nothing sits below ~180 Hz, where phone speakers only distort.
//  - Every envelope fades in (>= 20 ms for blips, seconds for music).
//  - Levels are low by default, and Music and Effects have their own volumes.

let ctx = null;
let masterGain = null, musicBus = null, sfxBus = null, bedGain = null, bedFilter = null;
let enabled = true;
let volume = 0.4;
let mix = { music: 0.6, sfx: 0.6, musicOn: true, sfxOn: true };
let unlocked = false;
let bedSrc = null;
let musicTimer = null;
let droneActive = false;

// ─── TUNING (the numbers the analysis checks) ───
export const RULES = {
  LOWPASS: 1800,         // Hz, master lowpass (keeps the 2-5 kHz band quiet)
  HIGHPASS: 150,         // Hz, below this phone speakers just buzz
  BED_LEVEL: 0.11,       // brown-noise bed, before the music slider
  BED_SWELL: 0.06,       // extra bed level at the top of an in-breath
  NOTE_LEVEL: 0.045,     // a music note at its peak
  NOTE_EVERY: [9, 7.5, 6.5, 5.5],   // seconds between music notes, by layer (<= 11 notes/min)
  BITE_LEVEL: 0.05,
  MIN_ATTACK: 0.02       // s, shortest fade-in on any sound
};

// Just-intonation pentatonic (1, 9/8, 5/4, 3/2, 5/3): every interval is a small
// whole-number ratio, so overlapping notes have no slow beating.
const JUST = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
// Music notes are chord tones only; any two of these together are consonant
// and at least a fourth apart.
const CHORD = [1, 3 / 2, 2, 5 / 2, 3];
let scaleRoot = 293.7;    // per biome (biome.sound.scale)
export function setScale(root) { scaleRoot = root; }
const musicRoot = () => { let r = scaleRoot; while (r > 260) r /= 2; while (r < 190) r *= 2; return r; };

function buildChain(c) {
  masterGain = c.createGain();
  masterGain.gain.value = volume;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = RULES.HIGHPASS; hp.Q.value = 0.5;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = RULES.LOWPASS; lp.Q.value = 0.5;
  const comp = c.createDynamicsCompressor();   // slow and gentle: only stops stacking
  comp.threshold.value = -28; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
  masterGain.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(c.destination);
  musicBus = c.createGain(); musicBus.connect(masterGain);
  sfxBus = c.createGain(); sfxBus.connect(masterGain);
  applyMix();
}
function applyMix() {
  if (!musicBus) return;
  musicBus.gain.value = mix.musicOn ? mix.music : 0;
  sfxBus.gain.value = mix.sfxOn ? mix.sfx : 0;
}

function ensureCtx() {
  if (ctx) return true;
  if (!unlocked) return false;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    buildChain(ctx);
    return true;
  } catch { return false; }
}

/** Call from a user gesture (tap/click/key). */
export function init() { unlocked = true; ensureCtx(); resume(); }
export function resume() { if (ctx && ctx.state === "suspended" && ctx.resume) ctx.resume(); }
export function setEnabled(on) { enabled = on; if (!on) stopDrone(); }
export function setVolume(v) { volume = v; if (masterGain) masterGain.gain.value = v; }
/** v7.1: separate Music / Effects levels (0..1) and on/off. */
export function setMix(m) { mix = { ...mix, ...m }; applyMix(); }
const ok = () => enabled && ensureCtx();

// ─── THE BED: brown noise, like far-off surf ───
function brownBuffer(c, seconds = 12) {
  const n = Math.floor(c.sampleRate * seconds), fade = Math.floor(c.sampleRate * 1.5);
  const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  let last = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;   // leaky integrator = brown (1/f^2)
    d[i] = last; peak = Math.max(peak, Math.abs(last));
  }
  // Seamless loop: crossfade the tail into the head
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    d[i] = d[i] * a + d[n - fade + i] * (1 - a);
  }
  const out = c.createBuffer(1, n - fade, c.sampleRate), o = out.getChannelData(0);
  for (let i = 0; i < n - fade; i++) o[i] = d[i] / peak * 0.9;
  return out;
}
function startBed(c, at) {
  bedSrc = c.createBufferSource();
  bedSrc.buffer = brownBuffer(c);
  bedSrc.loop = true;
  bedFilter = c.createBiquadFilter(); bedFilter.type = "lowpass"; bedFilter.frequency.value = 420; bedFilter.Q.value = 0.3;
  bedGain = c.createGain();
  bedGain.gain.setValueAtTime(0.0001, at);
  bedGain.gain.exponentialRampToValueAtTime(RULES.BED_LEVEL, at + 5);
  bedSrc.connect(bedFilter); bedFilter.connect(bedGain); bedGain.connect(musicBus);
  bedSrc.start(at);
}

// ─── MUSIC: sparse, slow, consonant sine notes ───
let layer = 0, nextNoteAt = 0, lastNote = 0, wound = false;
function musicNote(c, freq, at, { vol = RULES.NOTE_LEVEL, attack = 2.5, hold = 2, release = 6 } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.setValueAtTime(vol, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  o.connect(g); g.connect(musicBus);
  o.start(at); o.stop(at + attack + hold + release + 0.1);
}
/** Schedule music notes between t0 and t1 (shared by the live loop and the offline render). */
function scheduleMusic(c, t0, t1, rnd = Math.random) {
  if (wound) return;
  if (!nextNoteAt) nextNoteAt = t0 + 3;
  while (nextNoteAt < t1) {
    const pool = CHORD.slice(0, 3 + Math.min(2, layer));   // higher layers open the wider tones
    let i;
    do { i = Math.floor(rnd() * pool.length); } while (pool.length > 1 && i === lastNote);
    lastNote = i;
    musicNote(c, musicRoot() * pool[i], nextNoteAt, { vol: RULES.NOTE_LEVEL * (pool[i] > 2 ? 0.7 : 1) });
    const every = RULES.NOTE_EVERY[Math.min(3, layer)];
    nextNoteAt += every * (0.85 + rnd() * 0.3);
  }
}

export function startDrone(biome) {
  if (!ok()) return;
  stopDrone();
  resume();
  droneActive = true; wound = false;
  const snd = (biome && biome.sound) || {};
  if (snd.scale) setScale(snd.scale);
  const now = ctx.currentTime;
  startBed(ctx, now);
  nextNoteAt = now + 3;
  musicTimer = setInterval(() => { if (ctx && droneActive) scheduleMusic(ctx, ctx.currentTime, ctx.currentTime + 1.5); }, 500);
}
export function stopDrone() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!ctx) return;
  const now = ctx.currentTime;
  if (bedGain) { bedGain.gain.cancelScheduledValues(now); bedGain.gain.setTargetAtTime(0.0001, now, 0.6); }
  if (bedSrc) { try { bedSrc.stop(now + 3); } catch {} }
  bedSrc = null; bedGain = null; bedFilter = null;
  droneActive = false; nextNoteAt = 0;
}

/** b in 0..1 (0 = end of out-breath, 1 = top of in-breath). The surf swells and brightens a little. */
let lastBreathSet = 0;
export function setBreath(b) {
  if (!ctx || !bedGain) return;
  const t = ctx.currentTime;
  if (t - lastBreathSet < 0.2) return;
  lastBreathSet = t;
  bedGain.gain.setTargetAtTime(RULES.BED_LEVEL + b * RULES.BED_SWELL, t, 0.5);
  bedFilter.frequency.setTargetAtTime(340 + b * 260, t, 0.5);
}

/** Tier changes only open the music up a little: a wider note pool and slightly more often. */
export function setMusicLayers(tierIdx) {
  layer = Math.max(0, Math.min(3, Math.floor((tierIdx | 0) / 2)));
}
export function stopMusicLayers() { layer = 0; }
export function musicInfo() { return { layers: layer, root: musicRoot() }; }

// ─── EFFECTS: one soft voice, always in the key ───
function blip(freq, { start = 0, attack = 0.025, decay = 0.5, vol = 0.03, glide = 0 } = {}) {
  if (!ok()) return;
  resume();
  const at = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq * (1 - glide), at);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq, at + 0.08);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + Math.max(RULES.MIN_ATTACK, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  o.connect(g); g.connect(sfxBus);
  o.start(at); o.stop(at + attack + decay + 0.05);
}
const note = (deg, oct = 0) => { const r = musicRoot() * 2; return r * JUST[((deg % 5) + 5) % 5] * Math.pow(2, oct + Math.floor(deg / 5)); };

// Melodic bites: an 8-note phrase on the just pentatonic (380-900 Hz), walking
// in small steps; every 12 bites one note drifts, so the tune evolves.
const PHRASE_LEN = 8;
let phrase = makePhrase(), phraseIdx = 0, phraseBites = 0, lastBiteAt = 0;
function makePhrase() {
  const p = []; let d = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < PHRASE_LEN; i++) { p.push(d); d = Math.max(0, Math.min(7, d + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)])); }
  p[PHRASE_LEN - 1] = [0, 3, 5][Math.floor(Math.random() * 3)];
  return p;
}
export function newPhrase() { phrase = makePhrase(); phraseIdx = 0; }
export function phraseInfo() { return { phrase: phrase.slice(), idx: phraseIdx, root: musicRoot() }; }
function nextBite(now) {
  if (now - lastBiteAt > 2.5) phraseIdx = 0;
  lastBiteAt = now;
  const f = note(phrase[phraseIdx]);
  phraseIdx = (phraseIdx + 1) % PHRASE_LEN;
  if (++phraseBites % 12 === 0) { const i = Math.floor(Math.random() * (PHRASE_LEN - 1)); phrase[i] = Math.max(0, Math.min(7, phrase[i] + (Math.random() < 0.5 ? -1 : 1))); }
  return f;
}
let lastConsumeAt = 0;
/** A bite: a soft water-drop pluck (tiny upward glide, quick fade). Rapid bites thin out. */
export function playConsume(_tone, massRatio = 0.1) {
  if (!ok()) return;
  const now = ctx.currentTime;
  if (now - lastConsumeAt < 0.09) return;   // never a machine-gun
  lastConsumeAt = now;
  const big = Math.min(1, massRatio * 3);
  blip(nextBite(now), { attack: 0.02, decay: 0.35 + big * 0.3, vol: RULES.BITE_LEVEL * (0.7 + big * 0.3), glide: 0.04 });
}
export function playComboChime(count) { if (count % 10 === 0) blip(note(4, 1), { attack: 0.05, decay: 1.2, vol: 0.02 }); }
export function playGalaxyComplete() { [0, 3, 5].forEach((d, i) => blip(note(d), { start: i * 0.45, attack: 0.15, decay: 2.5, vol: 0.03 })); }
export function playBounce() { blip(musicRoot(), { attack: 0.04, decay: 0.3, vol: 0.02 }); }
export function playBump() { playBounce(); }
const EVENT_DEG = { meteorShower: [0, 3], cometStream: [1, 4], stellarBirth: [2, 5], voidPulse: [0, 5], gravitationalWave: [3, 5] };
export function playEventCue(type) { (EVENT_DEG[type] || [0, 3]).forEach((d, i) => blip(note(d, -1), { start: i * 0.6, attack: 0.6, decay: 2.5, vol: 0.03 })); }
export function playPowerup() { [0, 2, 3].forEach((d, i) => blip(note(d), { start: i * 0.12, attack: 0.04, decay: 0.8, vol: 0.025 })); }
export function playPowerupSpawn() { blip(note(4), { attack: 0.08, decay: 0.8, vol: 0.018 }); }
export function playPowerupEnd() { blip(note(3, -1), { attack: 0.08, decay: 0.8, vol: 0.02 }); }
export function playRitual() { [0, 3, 5, 8].forEach((d, i) => blip(note(d, -1), { start: i * 0.7, attack: 0.3, decay: 3, vol: 0.025 })); }
export function playGoalStar(n = 1) { for (let i = 0; i < n; i++) blip(note(3 + i * 2), { start: i * 0.35, attack: 0.05, decay: 1.4, vol: 0.022 }); }
export function playCollapse() { [5, 3, 0, -2].forEach((d, i) => blip(note(d, -1), { start: i * 0.9, attack: 0.5, decay: 3.5, vol: 0.03 })); }
export function playDiscovery() { [2, 4, 5].forEach((d, i) => blip(note(d), { start: i * 0.25, attack: 0.06, decay: 1.6, vol: 0.022 })); }
export function playBigCatch() { blip(note(0, -1), { attack: 0.12, decay: 1.6, vol: 0.04 }); blip(note(3, -1), { start: 0.2, attack: 0.12, decay: 1.6, vol: 0.025 }); }
export function playPurchase() { blip(note(3), { attack: 0.03, decay: 0.6, vol: 0.022 }); }
export function playDenied() { blip(note(0, -1), { attack: 0.03, decay: 0.35, vol: 0.02 }); }
export function playClick() { blip(note(5), { attack: 0.02, decay: 0.12, vol: 0.012 }); }
export function playNearGoal() { blip(note(4), { attack: 0.2, decay: 1.5, vol: 0.018 }); }
export function playTierChime() { [0, 5].forEach((d, i) => blip(note(d, -1), { start: i * 0.5, attack: 0.3, decay: 2.5, vol: 0.03 })); }

/** v7 Zen wind-down: the notes stop and one held root resolves (the surf stays). */
export function playZenResolve() {
  if (!ok()) return;
  wound = true;
  musicNote(ctx, musicRoot(), ctx.currentTime + 0.5, { vol: RULES.NOTE_LEVEL * 0.8, attack: 6, hold: 30, release: 30 });
}
/** Zen exit breaths: a soft low note under each one. */
export function playBreathTone() { blip(musicRoot(), { attack: 1.6, decay: 4.5, vol: 0.025 }); }

// ─── OFFLINE PREVIEW (analysis + the sample Brian can listen to) ───
/** Renders `seconds` of bed + music + bites, breathing 4 s in / 6 s out. Returns an AudioBuffer. */
export async function renderPreview(seconds = 30, { rate = 44100, biteEvery = 1.4, seed = 7, layerIdx = 1, bed = true } = {}) {
  const off = new OfflineAudioContext(1, Math.floor(seconds * rate), rate);
  const keep = { ctx, masterGain, musicBus, sfxBus, bedGain, bedFilter, bedSrc, enabled, unlocked, layer, nextNoteAt, lastNote, wound, lastConsumeAt };
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx = off; enabled = true; unlocked = true; layer = layerIdx; wound = false;
  buildChain(off);
  masterGain.gain.value = 0.4;   // default volume
  startBed(off, 0);
  if (!bed) bedGain.gain.value = 0, bedGain.gain.cancelScheduledValues(0);
  // breath automation, 10 s cycle (4 in, 6 out)
  for (let t = 5; bed && t < seconds; t += 0.25) {
    const ph = t % 10, b = ph < 4 ? 0.5 - 0.5 * Math.cos(Math.PI * ph / 4) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - 4) / 6);
    bedGain.gain.setTargetAtTime(RULES.BED_LEVEL + b * RULES.BED_SWELL, t, 0.5);
    bedFilter.frequency.setTargetAtTime(340 + b * 260, t, 0.5);
  }
  nextNoteAt = 0; scheduleMusic(off, 0, seconds, rnd);
  // bites: clustered, like real play
  for (let t = 4; t < seconds - 1; t += biteEvery * (0.4 + rnd() * 1.2)) {
    const f = nextBite(t);
    const o = off.createOscillator(), g = off.createGain();
    o.frequency.setValueAtTime(f * 0.96, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(RULES.BITE_LEVEL * 0.8, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.5);
  }
  const buf = await off.startRendering();
  ({ ctx, masterGain, musicBus, sfxBus, bedGain, bedFilter, bedSrc, enabled, unlocked, layer, nextNoteAt, lastNote, wound, lastConsumeAt } = keep);
  return buf;
}
