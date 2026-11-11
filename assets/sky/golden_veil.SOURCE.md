# assets/sky/golden_veil.jpg — source record

The file that ships is `assets/sky/golden_veil.jpg`, owned by `GoldenVeil`. It is drawn with `screen` at 0.35 over the backdrop, and only on a golden galaxy.

- **Art-box original:** `final/golden/golden_veil_full.jpg` (1290×2796, JPEG q85, 152 KB). Copied into the repo under the shipped name above. It replaces the earlier edge-only painting.
- **Tool:** GenerateImage (Grok Bot, cursor namespace), aspect_ratio "9:16", output 720×1280 JPEG.
- **Date:** 11 Nov 2026, ~12:55 AM ET.
- **Raw candidates:** `/workspace/vast-art-v97/raw/golden_full/` (cand1–3; chosen = cand3.jpg). These stay off-repo. Do not commit them.
- **Exact prompt (cand3):**
  > Full-frame portrait painterly overlay: a soft, dim, warm honey and amber haze spread evenly across the entire frame, like faint golden nebula fog, with smooth organic cloud variation in large gentle shapes, some areas a little warmer and some a little dimmer, scattered irregularly across top, middle and bottom alike. Dark low-key image, low contrast, smooth airbrushed painterly texture. No glow spot, no bright center, no empty center, no vignette, no frame band, no lines, no specks, no stars, no text.

## Processing (golden_full.py, nothing else)
1. Resize 720×1280 → 1290×2796 with LANCZOS. No crop (0.82× horizontal squeeze).
2. One global levels clamp, the same for every pixel: out = clip((in − 20) / (450 − 20), 0, 1) × 255.
   - The white point is above 255, so this is a linear dim; the brightest pixel is 106/255.
   - Resulting veil mean RGB is (57, 33, 5).
3. Light grain: Gaussian, σ 0.8 levels, seed 11.
4. JPEG: quality 85, optimize, progressive.

No masks, vignettes, gradients, blurs or per-region operations.

## Measurements
**Paint check (resid.py).** Brightness = max(R, G, B), fitted to distance from the centre with a 200-bin mean; the score is the RMS residual in levels.
- Elliptical distance: **10.74**.
- Euclidean distance: 10.02.
- For reference: a code vignette scored 1.62, and the painted backdrops score 10.3–11.2. That vignette was never shipped.

**Colour deltas.** Canvas-only `getImageData` (the page chrome is not in the figures), golden minus plain, one frozen frame after the Flagship has finished painting and fading. Centre is the middle 30–70% of the canvas on both axes, the same box `tools/v97-review.cjs` uses.

| Backdrop | Whole frame (R / G / B) | Centre 30–70% (R / G / B) | Pixels moved >8 |
|---|---|---|---|
| Ruined Armada | +16.69 / +10.35 / +1.68 | +19.09 / +12.81 / +2.41 | 92.75% |
| Planet Nursery | +17.55 / +9.84 / +1.89 | +21.69 / +12.99 / +2.83 | 94.25% |

The art-box whole-frame check (no centre box) was about +17 R / +10 G / +1.4 B, inside the +12 to +25 R target. The centre is warmed too.

## Candidates
| Candidate | Result |
|---|---|
| cand1 | Rejected: even, but bright and blotchy with gritty grain. It hits the R target, but the JPEG is 289 KB (over the limit) and reads speckled. |
| cand2 | Rejected: a dark round blob in the lower middle that could read as a second hole, plus crusty texture. |
| **cand3** | **Chosen:** smooth, large soft drifts across the whole frame. Its natural painted edge falloff is part of the image, not a mask. |

## Preview
`previews/golden_full_compare_sheet.png` on the art box shows nursery, armada and meadow, each plain and then golden at screen 0.35. The ring and hole mock is drawn on every tile; the ring stays the brightest, clearest element.
