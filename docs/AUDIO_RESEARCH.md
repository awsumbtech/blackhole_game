# Calm, non-fatiguing game audio: research and rules (v7.1)

This doc was written after Brian said the v7 background music "gives me a headache" and the effects
were still too harsh. It lists what the evidence says, then the concrete rules `js/audio.js` now follows.

## What the evidence says

1. **Beating and roughness are the most likely cause of the headache.**
   - When two tones fall inside one critical band, the basilar membrane cannot separate them. They
     beat, and fast beating (about 15–300 Hz, strongest near 70 Hz) is heard as *roughness*.
   - More roughness means less sensory pleasantness. It is perceived as "aggressive and annoying"
     even at the same loudness.
   - Slow fluctuations below about 15 Hz are heard as pulsing.
   - The old drone did exactly this: slightly detuned oscillators (`ratio × (1 + i·0.003)`), an
     "almost-octave" at 2.01×, a 1.498 fifth, triangle-wave overtones, and LFO layers on top. All of
     it was sustained for the whole session.
   - Sources: Zwicker & Fastl, *Psychoacoustics* (via Di Stefano et al. 2022, *Attention,
     Perception & Psychophysics*, https://pmc.ncbi.nlm.nih.gov/articles/PMC9481510/); HEAD acoustics,
     *Psychoacoustic Analyses II* (https://cdn.head-acoustics.com/fileadmin/data/global/Application-Notes/SVP/Psychoacoustic-Analyses-II_e.pdf).
2. **The ear is most sensitive at 2–5 kHz,** because of ear-canal resonance (ISO 226 equal-loudness
   contours). Energy there is what reads as "harsh" or "piercing" at any given level.
   Sources: https://en.wikipedia.org/wiki/Equal-loudness_contour; ISO 226:2023 (essentially the same
   as 2003, per Suzuki et al. 2024).
3. **Tempo drives arousal, and pauses relax.** In Bernardi et al. 2006 (*Heart* 92:445), heart rate,
   blood pressure and breathing rose with faster tempo. Slow or meditative music relaxed listeners,
   and a 2-minute *silence* lowered them below baseline.
   - Takeaway: be sparse, slow, and leave plenty of space.
   - Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC1860846/
4. **The design of *Weightless* (Marconi Union with Lyz Cooper, BAST).** Its rhythm starts at about
   60 BPM and slows to about 50. It has no repeating melody, so the listener can switch off, and it
   uses low "whooshing sounds and hums". Its frequency spectrum is broad and close to pink noise.
   - Caveat: the "most relaxing" claim rests on a commercial Mindlab study (skin conductance), not
     peer-reviewed work.
   - Sources: https://britishacademyofsoundtherapy.com/research/weightless-marconi-union-ft-lyz-cooper/;
     Stylist/Telegraph interview quotes; Nie et al. 2024 frequency study
     (https://jurnal.unimed.ac.id/2012/index.php/GDG/article/download/64558/26131).
5. **Nature-like sound helps recovery.**
   - Alvarsson et al. 2010 (*IJERPH* 7:1036): skin-conductance recovery after stress was 9–37% faster
     with nature sound than with noise.
   - Gould van Praag et al. 2017 (*Sci. Reports* 7:45273): natural sounds raised parasympathetic
     activity (HF-HRV) and shifted attention outward. Artificial sounds produced an inward,
     anxiety-like pattern.
   - Takeaway: build the bed from soft surf or wind-like noise, not a synth drone.
   - Sources: https://www.mdpi.com/1660-4601/7/3/1036; https://www.nature.com/articles/srep45273
6. **Binaural beats: not used.**
   - A meta-analysis (Garcia-Argibay et al. 2019, *Psychological Research*) found a medium effect on
     anxiety, but it rests on only 5 effect sizes in short pre-procedure settings.
   - Binaural beats need headphones, and they don't work on a phone speaker.
   - By design they are a beat between close tones, which is exactly what rule 1 avoids.
   - Source: https://link.springer.com/article/10.1007/s00426-018-1066-8
7. **Phone speakers.** Small speakers reproduce very little below about 200–300 Hz. Deep bass
   becomes buzzy distortion, and the mids carry everything. A 70 Hz drone on a phone is mostly its
   distorted harmonics. (General loudspeaker measurement practice: audioXpress, Pico Technology notes.)

## Rules (enforced in `js/audio.js` → `RULES`)

| Rule | Value |
|---|---|
| Bed | Brown (1/f²) noise, lowpassed at 340–600 Hz. Swells with the breath (4 s in, 6 s out). It sounds like distant surf. |
| Music | Single **sine** notes only, in **just intonation**. Overlapping notes are only chord tones (1, 3/2, 2, 5/2, 3), so every pair is an exact consonance at least a fourth apart (more than 1.5 ERB). No detune, no LFOs, no triangle or saw waves. |
| Density | One note every 5.5–9 s (≤ 11 notes per minute). Each note has a 2.5 s attack, a 2 s hold and a 6 s release, and there is always space between them. |
| Register | Music 190–780 Hz. Effects 380–1,000 Hz. Nothing meant to be heard below 150 Hz (highpass). |
| Brightness | 1.8 kHz lowpass on the whole mix, keeping the 2–5 kHz band near silent. |
| Effects | Sine "water-drop" plucks, with an attack of at least 20 ms and a decay of 0.3–0.6 s, always in the key. Bites closer than 90 ms are dropped, and a combo chime plays only every 10th bite. |
| Loudness | Peaks around −22 dBFS and RMS around −37 dBFS at the default volume. Music and Effects each have their own slider and on/off switch. |
| Zen wind-down | The notes stop, one held root note fades in, and only the surf remains. |

## Measured (offline render, `tools/audio-analyze.py`, Playwright + numpy)

See CHANGELOG v7.1 for the numbers. In summary:
- Spectral centroid is about 340–400 Hz.
- Under 0.01% of energy is in 2–5 kHz.
- The tonal-only envelope roughness index is 0.022, against 0.092 for the old Reef drone.
