# Shard masks (DebrisField)

The four files `shard_mask_1.png` … `shard_mask_4.png` are the painted masks DebrisField owns. They are image assets. The game does not draw these shapes.

- Tool: Grok Bot GenerateImage, 1:1, 1024×1024, generated Nov 11, 2026 ~8:00 AM ET by Black Hole Dev.
- Prompt: "Four separate soft-edged rock shard silhouettes, pure white shapes on a pure black background, arranged in a 2x2 grid with generous black space around each. Each shard is an irregular broken fragment (like a chip of a cracked planet crust), different shape each, with soft feathered painterly edges and slightly rough brush texture inside, no outlines, no shading colors, no text, flat matte, high contrast alpha mask style."
- Source sheet: the 1024×1024 JPEG supplied as `uploads/shard_masks_sheet.jpg`.

## Processing (this export, nothing else)

1. Open the sheet as RGB. It is 1024×1024.
2. Split it into four 512×512 quadrants, in this order:
   - `shard_mask_1.png` — top left, pixels x 0–511, y 0–511
   - `shard_mask_2.png` — top right, x 512–1023, y 0–511
   - `shard_mask_3.png` — bottom left, x 0–511, y 512–1023
   - `shard_mask_4.png` — bottom right, x 512–1023, y 512–1023
3. Luminance of each quadrant, before the crop: `L = 0.2126 R + 0.7152 G + 0.0722 B`.
4. Bounding box of pixels with `L > 16`, then expand by 12 pixels on every side, clamped to the quadrant.
5. Crop the quadrant to that box.
6. One global levels clamp, the same for every pixel of every mask: `out = clip((L − 16) / (236 − 16), 0, 1) × 255`.
7. Export PNG. RGB is white `(255, 255, 255)`. Alpha is `out`. White in the painting is opaque.

No code-drawn shapes, gradients, or extra blurs were applied. The crop boxes this run were:

| File | Crop inside the quadrant (x0, y0, x1, y1) | PNG size |
|---|---|---|
| shard_mask_1.png | 105, 103, 493, 506 | 389×404 |
| shard_mask_2.png | 51, 62, 389, 511 | 339×450 |
| shard_mask_3.png | 104, 44, 494, 421 | 391×378 |
| shard_mask_4.png | 46, 32, 421, 438 | 376×407 |
