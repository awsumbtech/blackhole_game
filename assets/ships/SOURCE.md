# Vast ships-v1, stage 2: SOURCE

Art maker: Grok Bot. Every visible pixel comes from a `cursor.GenerateImage` painting (all 532 stage-2 generations, plus the stage-1 b raws for look 0, are listed in `PROVENANCE.json` (repo: `assets/ships/PROVENANCE.json`; workspace: `ships-v1/PROVENANCE.json`) with prompts, refs, sha256 and selected/rejected status; `_raw/gen-log.jsonl` has 692 lines in total; corrections in `_raw/gen-log-errata.jsonl`). Post-processing is mechanical only: key, register, resample, mask, split. There are no third-party packs and no code-drawn art. The round-1 rule applies throughout: **NO tint/recolour/desaturate filters, NO code-traced or code-thinned outlines, NO code-drawn cracks**. Plates break only along painted lines, with 0 fallback cuts.

**Commit base:** blackhole_game `main` at **e93b0f2 (v9.7.3)**, not e803e12 (the unmerged docs PR #9). Committed assets-only on branch `art/ships-v1` (see that branch's log for the SHA); no PR. In the repo these files live in `assets/ships/` (`PROVENANCE.json`, `stage2_metrics.json`, `source/contact_sheet_stage2.png`). Paths starting `_raw/`, `_tools/`, `_scratch/`, `variants/` refer to the art workspace (`vast-art/ships-v1` on the art bot's box) and are not in the repo.

## Deliverables (`stage2_out/`)
| file | size px | bytes | webp |
|---|---|---|---|
| assets/ships/drone.webp | 2880x2560 | 719,194 B | lossless |
| assets/ships/shuttle.webp | 2880x2560 | 932,838 B | lossless |
| assets/ships/freighter.webp | 2880x2560 | 689,852 B | lossless |
| assets/ships/cruiser.webp | 2880x2560 | 628,554 B | lossless |
| assets/ships/capital.webp | 2880x2560 | 760,736 B | lossless |

Each `<class>.json` is `{"frame":320,"cols":["live","wreck","liveEdge","wreckEdge","plate0","plate1","plate2","plate3","glow"],"rows":8}`.
- Each webp is under 2 MB. `stage2.py pack` now tries lossless first and falls back to lossy only when that would reach 2 MB. All five fit losslessly.
- The decoded sheets match the frames premultiplied pixel for pixel, and plate seams in the sheet are 0 (`assets/ships/_sheet_verify.json`).
- Other outputs: `stage2_metrics.json` (every look and gate), `contact_sheet_stage2.png` (plus `_half.jpg`).

## Layout
- **Row = look index.** Look 0 is the stage-1 style **b** frames (`variants/b`), reused exactly as approved.
- Looks 1–7 are `variants/bL1`…`bL7`.
- Each look is a fresh painting, not a recolour. 14 looks (drone L1/L6/L7, freighter L1/L2/L3/L6/L7, capital L1/L2/L4/L5/L6/L7) were repainted for row distinctness (`_scratch/distinct_select.json`, gate: colour-fit R² ≤ 0.87 between every pair of rows at 54 px); their colour words are in `_tools/prompts_used/<look>_live_s2b.txt` / `_s2c.txt`, so the table below lists the original words for those rows. Its colours are **words** in the live prompt, taken from js/ships.js `HULLS[look]` and `ACCENTS[(look*5+cls.length)%6]`. The b look-0 live raw is the style reference.

| row | tag | hull words | accent words per class |
|---|---|---|---|
| 0 | b | cool light grey | drone soft periwinkle blue, shuttle muted gold, freighter muted brick red, cruiser muted gold, capital muted gold |
| 1 | bL1 | cool blue-grey | drone pale cream, shuttle muted copper-orange, freighter muted teal, cruiser muted copper-orange, capital muted copper-orange |
| 2 | bL2 | warm sand-grey | drone muted brick red, shuttle soft periwinkle blue, freighter muted gold, cruiser soft periwinkle blue, capital soft periwinkle blue |
| 3 | bL3 | grey-green slate | drone muted teal, shuttle pale cream, freighter muted copper-orange, cruiser pale cream, capital pale cream |
| 4 | bL4 | soft lilac-grey | drone muted gold, shuttle muted brick red, freighter soft periwinkle blue, cruiser muted brick red, capital muted brick red |
| 5 | bL5 | warm khaki-grey | drone muted copper-orange, shuttle muted teal, freighter pale cream, cruiser muted teal, capital muted teal |
| 6 | bL6 | steel blue-grey | drone soft periwinkle blue, shuttle muted gold, freighter muted brick red, cruiser muted gold, capital muted gold |
| 7 | bL7 | soft mauve-grey | drone pale cream, shuttle muted copper-orange, freighter muted teal, cruiser muted copper-orange, capital muted copper-orange |

## Pipeline (b's approved look-0 pipeline, `_tools/stage2.py`)
- **live**
  - Fresh painting per look, then keying and the frame transform.
- **wreck**
  - A GenerateImage edit of the look's live raw. The second ref is b's look-0 wreck of the same class.
  - DARK tuning (`stage2.py DARK` / `DARK_LOOK`) aims at the 0.44–0.55 wreck/live luminance gate at 54 px.
    - Capital and freighter use the "10%" wording; 30%/20% came out too dark.
    - The look-4 shuttle uses "pale" because its live is near-white lilac.
  - Wreck tries that were too dark, too bright or lost the paint scheme are rejected with reasons in PROVENANCE.json (120 rejected wreck generations in total, including the S2D–S2F retries).
  - Holes are rimmed in gold, as in look 0.
- **glow**
  - A GenerateImage edit, then difference extraction, then `step_glowclean.py` (mask within 16 px of the hull, drop components under 12 px).
  - Then `step_glowclean2.py`: alpha-zero mask of floating flecks (components under 2% of the largest and more than 3 px away). Looks 1–7 only.
  - The glow frames were re-derived from their raws before the single glowclean pass, because glowclean is not idempotent.
- **liveEdge / wreckEdge**
  - A GenerateImage sticker-outline edit of a mechanically k-scaled copy of the frame source. Extraction is `derive.edge_extract_s50`, with no thinning.
  - Edge width wording comes from b's approved edge raws. Retries changed only the width words:
    - freighter: live "about 1%", wreck "about 1.5%"
    - capital: live retries "about 1.5%"
    - bL2 cruiser: live "a thin even hairline about 0.7%" (final `_k44_r4`), wreck "a thin even line about 0.85%" (final `_k35_r6`)
  - Final picks are in `_scratch/edge_overrides.json`; the retry lists are in `_scratch/edge_retry_r2.json` and `_r3.json`.
- **plates**
  - Drone, freighter, cruiser and capital: one painted cyan fracture map, split by `plates2.split_painted` along painted lines only.
  - Shuttle: a colour plate map plus up to two cyan crack maps, run through `plates_shuttle_s2.py`.
    - It groups the regions of the painted borders exhaustively (best4). This is tractable only for **12 or fewer regions**, so single-map sets (platemap + cracksA or + cracksB) are also tried.
    - It keeps the set with the best worst-plate score.
    - Accepted: the single-map and r4 groupings. Every edge is still a painted line.
  - Selected raws are in `_scratch/cracks_select.json`, superseded for the 14 re-derived looks by `_scratch/cracks_select_s2g.json`.
- **label moves (nothing drawn)**
  - Both reassign already-painted wreck pixels to the neighbouring plate, the same as region grouping.
  - Island move (`plate_islands_lab.py`, accepted): bL1 cruiser, 4 px from plate2 to plate1.
  - Soft-rim move (`plate_softrim_lab.py`): 3 soft rim px (bL1 freighter 2, bL6 cruiser 1) go to the plate of their nearest solid px. This removed 1 floating smoke px from a plate.
- **despill** (`despill_frames.py`)
  - Rebuilds live, wreck and plates from their sources. The plates are cut from the same wreck frame with the same per-pixel ops, so the **seams are exactly 0**.
  - Stage-2 fix: `band()` now includes every 0<alpha<255 px, which is the documented rule. The old code missed partly keyed interior px with alpha ≥128, and those kept key spill.
  - The fix was applied to looks 1–7. Look 0 is kept as approved (the new rule would touch 24 of its px, and look 0 already passes).

## Gates (`stage2_metrics.json`, 40 looks; refreshed 2026-11-15, checker r4)
- **All-gate PASS 36/40.** Failing looks and why are listed under KNOWN ISSUES.
- Edge width at the 150 px catch: **aspect-scaled nose-to-tail measure** (`measure_edges` `w150_if_nose_to_tail_is_150`), band 1.6–2.5, target ~2.2 (look 0 drone 2.19/2.23). User ruling 11-15: this is the gate for every class, drones included. **80/80.**
  - Drones (live/wreck): b 2.19/2.23, bL1 1.97/1.93, bL2 2.38/1.86, bL3 1.97/1.78, bL4 1.96/2.40, bL5 2.25/1.80, bL6 1.77/1.77, bL7 2.43/1.67 (`_scratch/drone_edge_gate_s2i.json`).
- Wreck/live luminance at 54 px: 0.44–0.55. **39/40** (bL7 capital 0.439).
- Plates: 4 plates, each one 8-connected piece, solidity ≥ 0.6, sliver ≤ 0.05, area ≥ 8%, overlap 0, fallback cuts 0, straight run ≤ 30 px. **38/40** (bL1 drone, bL1 capital: accepted fragments).
- Seam, exact (alpha u8 diff, composite alpha diff, premultiplied RGB diff): **40/40 exactly 0** (`_scratch/seam_exact.json`).
- Magenta, strays and smoke 0 on all 9 frames: **37/40** (bL1 drone wreck/plates smoke, bL1 shuttle 1 key px, bL7 capital 1 key px).
- Glow: registration ok, glow px > 0, 100% of glow within 16 px of the live hull. **40/40.**
- Packs: decoded sheets premultiplied-identical to the frames, sheet seams 0 (`assets/ships/_sheet_verify.json`, `_tools/s2i_sheet_verify.py`).

## Stage-2 rework, 2026-11-13 to 11-15 (summary; full log `_scratch/stage2_progress.md`)
- **Distinctness:** 14 lives repainted (see Layout). Their wrecks, glows, edges and plates were re-derived from the new lives.
- **Wrecks:** S2D re-render with "% darker" wording (ratio gate 0.44–0.55); S2E/S2F colour repaints for the 9 looks whose wreck lost the live paint scheme (gate `_tools/wcol.py` + by eye). 6 passed; 3 are known issues. bL7 drone was accepted as an exception (hue shift 35.1 vs a 35 limit, passes by eye).
- **Edges:** `derive.edge_extract` gold-hull registration guard is opt-in (`_scratch/edge_goldhull_guard.json`, the 14 looks only); untouched looks' edges proved byte-identical.
- **Cracks and plates (S2G/S2H):** new crack maps painted on the rebuilt wreck references, 1 version + up to 2 rerolls per look (`_scratch/cracks_select_s2g.json`). bL6 drone: plates re-cut from the current wreck along its earlier selected crack map `bL6_drone_cracks_r2` (no new generation); all plate gates pass, seams 0/0/0.
- **Label moves (nothing drawn):** bL6 capital 4 px island plate1→plate0 (`plate_islands_lab.py`); bL7 freighter 1 soft px plate1→plate0 (`plate_softrim_lab.py` rule).
- **Live frames rebuilt (user ruling 11-15):** despill rebuilt `live.png` for the 14 looks from their current raws and `xforms.json` (updated 11-13 06:46 in the wreck re-derivation). The old live frames were stale against that transform. Kept: the live edge fits as well or better on 12 of 14; bL1 freighter (0.980→0.969) and bL7 capital (0.985→0.978) drop slightly, accepted.
- **Base look (row 0):** `variants/b/frames/drone_wreckEdge.png` is the approved stage-1 file, shipped unchanged; it cannot be reproduced from `edges_b.json`'s current inputs (noted in PROVENANCE.json).
- **S2I (11-15, checker recheck r2 HOLD 19/25):**
  - F1 drone bL1 wreckEdge: its k70 ref was stale (painted from the pre-S2F wreck); ref rebuilt (old copy `_raw/refs_superseded/`), new edge `bL1_drone_wreckEdge_k70_s2i`. Outer-silhouette coverage 0.71 → 0.998, no detached gold (`_scratch/drone_bL1_wreckEdge_continuity_s2i.json`).
  - F2 / r3 N1 drone bL7 wreckEdge: final edge `bL7_drone_wreckEdge_k70_s2n`, painted on the outer silhouette only (the torn bite is followed, not ringed), extracted with no mask: aspect width 1.67, one component, 1 hard-cut opaque px. The S2I distance mask (`edge_outer_mask.py`) that trimmed the stroke is withdrawn and removed from `stage2.build_edges`; no edge is code-thinned.
  - F3 drone bL1/bL6 edges: re-picked with "about 1%" width wording: bL1 1.97/1.93, bL6 1.77/1.77.
  - F4 capital bL5 repaint (S2K): live `bL5_capital_live_s2i` warm khaki-grey with charcoal bands, luma 132.7 (was 65.8; siblings 99–154), distinct (no capital pair R² > 0.87). Wreck `wreck_s2i` (edit of the live): ratio 0.481, silhouette IoU 0.984, colour kept (wcol OK). Glow `glow_s2i`. Edges `liveEdge_k35_s2i` 2.49 / `wreckEdge_k40_s2i` 2.35. Cracks `cracks_s2k`: 4 plates PASS, seams 0/0/0 (3 soft rim px moved by the softrim rule). The box restart delayed these files (store unmounted ~09:35–10:08 EST; `delayed_arrival` in the errata). A later chain from `live_s2k` (luma 125.6) failed every wreck try at the reroll cap (ratio 0.469 with lost colour, 0.672, 0.710) and is rejected.
  - F11 paperwork: `_raw/CANONICAL_COPIES.json` (48 canonical-name copies), `_raw/gen-log-errata.jsonl` (112 stale sha256, 9 renamed files, 9 wrong logged aspects, 68 unverifiable refs, 7 delayed arrivals, bL6 drone crack-base note; gen-log itself unedited).
  - r3 N2 capital bL5 plate1: 1 soft px (alpha 8, y142 x124, 3.0 px from its plate) moved to plate2 by the soft-rim rule; every plate is one piece at alpha > 0, seams 0/0/0.

## KNOWN ISSUES
Accepted (user ruling 11-15, checker r2/r4 reasons):
- **R1 (P3, accepted 11-15) drone bL7 wreckEdge:** the faintest drone wreck outline at 1.65 px (checker; maker 1.67), in band (1.6–2.5) and reads fine at play size; a 1.5–3 px gap between the top of the hull and the gold, as on bL7 live. A bolder reroll is nice-to-have only.
- **F6 — MOST IMPORTANT, future candidate. cruiser bL1/bL3/bL4/bL6/bL7:** still near-identical to look 0 at 54 px, all lavender-white. The cruiser was not part of the distinctness repaint.
- **F5 freighter bL6 live and wreck:** dark navy hull, live luma 80 and wreck 39. It still reads because of the orange containers, but it is the second-darkest pair.
- **F7 capital bL1 wreck:** lost its 4 engine nozzles and is 11 px shorter at the stern (261 vs 272), so the stern jumps about 6 px on the swap at 150 px.
- **F8 freighter bL7:** the live frame has a notch in the top container row that the wreck lacks, so the silhouette changes on the swap.
- **F9 drone bL7 / bL1 live:** bL7's pod is glassy, faceted and pink, the least watercolour-like look; bL1's wings are flat cream with a see-through slit and no panel detail. Both acceptable.
- **F10 accepted known issues:**
  - wreck colour drift: freighter bL2 (rust-brown), freighter bL3 (green to grey), capital bL4 (sooted teal), freighter bL1 (teal hull goes near-black);
  - drone bL1 soot pixels (dark, alpha ≤ 114, at the burnt wing tips);
  - crack fragments: drone bL1 (1 px), capital bL1 (4 px); seams still 0;
  - capital bL5/bL1/bL2 liveEdge specks at alpha ≤ 14;
  - capital bL7 wreck/live 0.439 (checker measures 0.450);
  - painted key-hue pixels on capital bL7 and shuttle bL1 live;
  - freighter bL1's single "cyan" pixel is the teal accent.
- **F12:** faint off-engine glow streaks on shuttle bL2/bL4/bL5/bL6 and cruiser bL6; straight vertical freighter breaks along container seams (structural, same as look 0).

Resolved in S2I/S2K: F1, F2, F3 (drone edges), F4 (capital bL5 repaint), F11 (paperwork). Resolved earlier: drone bL6 plates (S2H re-cut).

## Checker scores (style b)
Stage 1 (style b): the first blind check gave 20/25, then the rechecks gave 22/25 and 23/25 PASS (calm 4, readability 4, gold edge 5, wreck/plates/glow 5, alpha 5).
Stage 2: check 20/25 FAIL, r2 19/25 HOLD, r3 21/25 HOLD, **r4 22/25 PASS** (R1–R4 P3 leftovers; R2–R4 paperwork fixed, R1 accepted).

## Visual notes
- bL6 cruiser: tall dorsal spire.
- bL5 and bL6 freighter: container colours vary.
- Capital: engine nozzle count and size vary slightly per look.
- bL7 capital: pinkish-mauve hull (the "soft mauve-grey" hull word).
- bL5 cruiser: registered with the silhouette fallback.
