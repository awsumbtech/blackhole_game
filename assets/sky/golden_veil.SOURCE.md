# golden_veil_painted.jpg — source record

- **File:** final/golden/golden_veil_painted.jpg — 1290×2796, JPEG q85, 82 KB.
- **Tool:** GenerateImage (Grok Bot, cursor namespace), aspect_ratio "9:16", output 720×1280 JPEG.
- **Date:** 11 Nov 2026, ~12:45 AM ET.
- **Raw source kept at:** /workspace/vast-art-v97/raw/golden_painted/cand6.jpg (unmodified generator output).
- **Exact prompt:**
  > Portrait painterly overlay on pure black: very soft, smooth, out-of-focus drifts of warm honey-gold haze, like gentle golden fog seen through a soft lens, organic and asymmetric: a soft drift tucked into the upper left corner, a thin faint drift along the upper part of the right edge, and a wider soft drift across the bottom right corner and along the bottom edge. A few very faint, very blurry gold dust motes inside the haze. Smooth airy texture, not gritty, not detailed. The haze stays close to the edges; the large middle of the frame is dark, empty pure black. Dim, low contrast, calm. No round shapes, no orbs, no glow spot, no border band, no frame, no stars, no lines, no text.

## Processing (golden_painted.py, nothing else)
1. Resize 720×1280 → 1290×2796, LANCZOS. No crop: the 0.82× horizontal squeeze keeps the edge haze.
2. Global levels clamp, the same curve for every pixel: out = clip((in − 10) / (290 − 10), 0, 1) × 255. Black point 10 keeps the centre at true black; white point 290 lowers the peak to 145/255.
3. Light grain: Gaussian noise, σ = 0.8 levels, fixed seed 11.
4. JPEG save: quality 85, optimize, progressive.

No masks, vignettes, gradients, blurs or per-region operations were applied.

## Painted check (resid.py)
Pixel brightness is max(R, G, B). It is fitted to distance from the centre with a 200-bin mean curve, and the score is the RMS residual in 8-bit levels.

| Image | Elliptical distance | Euclidean distance |
|---|---|---|
| **golden_veil_painted.jpg** | **28.84** | **27.11** |
| golden_veil.jpg (blocked code vignette) | 1.62 | 19.03 |
| backdrop_nursery.jpg | 10.33 | 10.09 |
| backdrop_meadow.jpg | 11.21 | 9.17 |

The elliptical score is the one that separates code from paint. golden_veil.jpg is blocked and superseded by this file, and must not ship.

Centre region (x 390–900, y 1000–1800) has a mean of 0.3 levels, which is grain only.

## Candidates (7 generated, raw files in raw/golden_painted/)
| Candidate | Result |
|---|---|
| cand1 | Gritty, crinkled texture that reads like debris at phone size |
| cand2 | Rejected: thin wavy line-like wisp, and sharp motes that could read as pickups |
| cand3 | Rejected: bright, bold decorative smoke curls; too busy and strong |
| cand4 | Rejected: small round glow blob at top right, and haze reaching toward the middle |
| cand5 | Rejected: detailed smoke covering too much of the frame; busy |
| **cand6** | **Chosen** |
| cand7 | Close runner-up; visibly grittier texture in the composites |

## Recommended use
- Blend mode: 'screen'.
- Opacity: 0.35 by default; 0.5 is acceptable for a stronger golden galaxy.
- Previews: previews/golden_veil_painted_{nursery,armada,meadow}_screen_{0.35,0.5}_390x844.png and previews/golden_veil_painted_compare_sheet.png.
