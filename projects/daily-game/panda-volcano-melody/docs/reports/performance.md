# Tofu's Volcano Melody — performance report (2026-11-14)

Target: iPhone/iPad Safari and desktop browsers. Measured in headless Chromium (Playwright) on a 2-core Linux box
that **other agents were using at the same time** (load average 6–9). Absolute milliseconds are therefore pessimistic
and noisy. Every before/after comparison below is either **interleaved A B A B on the same page** (`tests/perf/ab.js`)
or a **work count** that machine load cannot change (`tests/perf/work.js`).

Fixes: `docs/reports/perf.patch` (17 hunks: 10 in render.js, 5 in assets.js, 2 in main.js). Apply from the repo root with
`git apply projects/daily-game/panda-volcano-melody/docs/reports/perf.patch`. With the patch applied, `tests/e2e/smoke.js`
passes, and `tests/e2e/functional.js` passes 357/357.

## Headline
| | before | after |
|---|---|---|
| Frame time p50 / p95 / p99 (all 32 configs, CPU 4×, raster flushed) | **68.8 / 141.7 / 205.4 ms** | **42.5 / 89.6 / 127.9 ms** (−38 %) |
| Sea pattern pixels filled per frame, 16:9 screen | 2 073 600 (whole backing store, then hidden by the ground) | 11 488 (shake gaps only; usually 0) |
| Sprites rasterized **inside a frame**, 10 s of steady play | 37 (56.7 ms) | **0** |
| Hitch on resize to 4:3 (in-frame rasters / ground layers / max frame) | 23 / 2 / 53 ms | 0 / 1 (the 240 px sea tile, 0.9 ms) / 27 ms |
| Hitch on an adaptive-quality step (max frame) | 72 ms, 30 rasters + 2 ground layers | 30 ms, 0 + 0 |
| Sprite cache after 2 min of bot play at ×8 | 172 canvases (128 of them were note sizes) | 48 canvases |
| Ground layers held (≈8 MB each at 1920×1080) | 4 + sea | at most 3 + sea |
| Adaptive quality at 10 fps: time per quality step | ≈ 9–10 s (counted in frames) | ≈ 1.5 s (counted in seconds) |

## 1. Load waterfall (`measure.js --suite load`)
61 requests, **497 KB** (no compression, local server, cache disabled). The four `ground.svg` files are the largest
(37–48 KB each), then `world.js` 45 KB, `render.js` 33 KB, `style.css` 26 KB. Everything finishes by ~335 ms on the
unthrottled local server. The summer, autumn and winter props and grounds load behind the title as designed (`restLoaded`).

| viewport | CPU | time to title | first 2 s of title: worst frame |
|---|---|---|---|
| 1280×720 @1 | 1× | 627 ms | 15 ms |
| 1280×720 @1 | 4× | 2 017 ms | 28 ms |
| 1024×768 @2 | 4× | 2 215 ms | **194 ms** (in-frame sprite rasters on the first title frames; patch hunks A7 and A10 remove most of them) |

There is no obvious load win left. Gzip on GitHub Pages already shrinks the SVGs a lot. Note that `icon-512.png` (172 KB)
is only requested by the manifest.

## 2. Frame time per season and viewport (`ab.js`, CPU 4×, bot playing, adaptive off, raster flushed)
Each frame ends with a 1-pixel `getImageData` on the game canvas. That moves Chrome's canvas raster into the
measured rAF callback, so the numbers include the real raster cost. Values are callback ms, p50 → p50 (before → after),
taken as the median over the 4 seasons, 2 × 3 s per side, interleaved.

| viewport (backing store) | p50 | p95 | p99 |
|---|---|---|---|
| 1280×720 @1 (1280×720) | 38.1 → 23.7 | 109.3 → 68.2 | 181.2 → 119 |
| 1280×720 @2 (1920×1080) | 67.5 → 44.5 | 187.9 → 85 | 261 → 149.8 |
| 1920×1080 @1 | 68.3 → 42.7 | 139.7 → 95.3 | 302.2 → 119.9 |
| 1920×1080 @2 | 81.5 → 46.4 | 141.2 → 91.6 | 196.4 → 127.9 |
| 2560×1440 @1 | 73 → 42.5 | 161.6 → 77.9 | 484.3 → 142.9 |
| 2560×1440 @2 | 69 → 39 | 147.8 → 103.3 | 209.9 → 129.6 |
| 3840×2160 @1 | 72.9 → 47 | 196.8 → 109.6 | 253.4 → 196.2 |
| 3840×2160 @2 | 72.2 → 47.1 | 136.6 → 124.4 | 205.4 → 165 |

| season (median over viewports) | p50 | p95 | p99 |
|---|---|---|---|
| spring | 66.1 → 42.1 | 141.7 → 81.1 | 197.8 → 142.9 |
| summer | 71.6 → 46.4 | 155 → 95.3 | 261 → 119.9 |
| autumn | 68.3 → 42.6 | 153.1 → 77.4 | 235.6 → 180.2 |
| winter | 73 → 42.1 | 139.7 → 97.2 | 209.9 → 152.3 |

- The backing-store cap (≈ 1920×1080 device px) works. 2560 and 3840 viewports cost the same as 1920×1080, so 4K is safe.
- Seasons cost about the same. The weather is sparse (the particle count peaks at ~160 of the 260 cap in the functional run).
- Unthrottled ablation at 1920×1080 @1 (`profile.js`): the whole frame is ~12.5 ms p50 and a plain clear is 1.7 ms.
  Removing the sea alone brought it to 8.2 ms. No other single stage was worth more than ~1–2 ms.
- CDP `Performance.getMetrics` TaskDuration was ≈ 1 000 ms/s in every throttled run, which means the main thread was saturated.
  At 4× CPU with the raster flushed, this scene is not a 60 fps scene on a weak phone. Adaptive quality is what has to
  rescue it (section 6).

## 3. Hitches
### Season change (crossfade)
`gotoLevel` into each season, 1280×720 @1 and 1920×1080 @2. Unthrottled, a season change costs about 1.5–2.5× the median frame for the
1.2 s crossfade, because two full-screen layers are blitted, one with alpha. The worst single frames came from in-frame
rasters of the new season's props and particles: `rock_winter` 12 ms, and `p_leaf` and `p_blossom` every time, because of the
prewarm key bug (hunk A7). After the patch, 4 season changes have **0 in-frame rasters** (44 before, 20 ms). The crossfade blend itself
remains (180 ms max frame at CPU 4× in both A and B). That cost is inherent to a full-screen alpha blend. A cheaper crossfade would need a design change,
so it is left as is.

### Resize / orientation change / quality step
Before the patch, `setScale()` cleared the sprite cache and `resize()` cleared the ground layers. The next frame then rasterized the 960×540
ground SVG (49 KB of paths) plus every visible sprite synchronously: 53–88 ms max frame unthrottled at 1280×720 @2,
and 189 ms at 1920×1080 @2. After the patch the old-scale canvases are drawn as stand-ins at the same logical size, and they are replaced in
idle callbacks: resize max frame 53 → 27 ms, back-resize 88 → 39 ms, adaptive step 72 → 30 ms, with **zero** sprite or ground rasters
in-frame.

## 4. Judder / interpolation
`world.alpha` is used for every moving entity: Tofu, crabs, notes (x, y, z), mango and Coco (`ix/iy/iz` in render.js). In a probe
where Tofu walks straight at constant speed, the drawn speed per rAF timestamp was 230 px/s with an **sd of 0.0** when interpolated, against 0.8 raw. Weather
particles and renderer animations step with the real frame dt, so they are smooth too. **No judder issue.**
Cosmetic notes (not changed): the letterbox sea translation is rounded to device pixels, so at 6 px/s it moves in 1 px steps.
In portrait, a lighter band is visible where the ground art's static sea border meets the drifting tile. That is pre-existing and a visual issue, not a
performance one.

## 5. Sprite cache growth
- **Notes:** `_note()` asked for a 40 × s sprite while a pop-in note scales (s from 0.2 to 1.25). Every new size was a new cache key, and an
  SVG raster *inside the frame*. Over 2 min at ×8 that was 32 keys per note kind (128 canvases). At ×1 it was ~45 new keys per 6 s, bounded only by
  4 kinds × ~170 sizes ≈ 680 canvases. Fix: one 40 px raster, scaled by the transform (hunk A10).
- **Particles:** `_particles()` caches 2 sizes per sprite, so it is bounded. But the prewarm warmed `PSIZE × 1.5` (e.g. blossom 30 px) while
  the draw asks for the size rounded up to 8 (32 px). So **the prewarm never hit**, and every season's particles plus all burst sprites
  (sparkle, spark, smoke, dust, ripple) were rasterized in-frame. Fix: one `partBox()` helper used by both (hunks A1, A7, A9).
- After 2 min of play: 172 → 48 canvases, 0.67 → 0.43 Mpx. It stays flat (48 from t = 20 s to t = 120 s).
- `Assets.trimSeasons()` is never called, and its prefix test (`spring_…`) would not match keys like `palm_spring|…` anyway. It is left alone because the prop
  sprites are small. The large memory is the ground layers (hunk A5).

## 6. Adaptive quality (`measure.js --suite adaptive`, CPU 6×, adaptive on, speed 1)
`adapt()` counted slow and fast **frames** (90 down, 300 up, hold 60). At 10 fps, one quality step took ~10 s.
- 1920×1080 @2, mouse, before: px 2 → 1.6 → 1.28 after 24 s, still 50–100 ms frames.
  After: 2 → 1.6 → 1.28 → 1.02 → **1.0 within ~10 s**, then a steady 33 ms.
- 844×390 @3 touch (iPhone-like), before: 1.81 for 8 s, then the 1.45 floor. After: at the floor within 2 s.
- 1180×820 @2 touch (iPad-like): both start at the 1.647 floor (0.67 × natural) and stay there at 83 ms frames. On touch devices,
  `floor = 0.67 × natural` is a deliberate crispness limit. **Recommendation (not patched):** if a weak iPad stays slow at the floor,
  allow a last step to ~0.5 × natural.

## 7. Patch hunks (`docs/reports/perf.patch`)
**render.js** (10 hunks, in patch order)
- A1 `@@ -28` `partBox()` helper: the one place that decides a particle's cached raster size.
- A2 `@@ -41` `_spr.clear()` (custom pictures changed) also drops the sprite and ground stand-ins.
- A3 `@@ -49`, A4 `@@ -61` `resize()` saves the current-scale ground layers as `_bgStale` stand-ins before clearing the cache.
- A5 `@@ -86` `setLevel()` deletes ground layers for seasons that cannot be shown (keeps current, fading-out and next). That keeps at most 3 × ~8 MB
  at a 1920×1080 backing store, instead of all 4. This helps the iOS canvas memory budget.
- A6 `@@ -121` `_cachedGround()` / `_groundNow()`: the frame uses the current-scale layer, else the stand-in, else rasterizes (the old behaviour).
- A7 `@@ -142` prewarm: `chars` also warms the HUD Coco (40×33) and the dizzy-stars sparkle (24×24). `parts_<season>` uses `partBox()`, so
  the key finally matches the draw, and it also warms the burst sprites. `_pumpWarm()` drops `_bgStale` once every warm job has run.
- A8 `@@ -227` `draw()`: the **sea is filled only outside the ground rectangle** (even-odd clip, 1 px overlap). On 16:9 screens it is
  skipped entirely, except for shake gaps. The ground is drawn with an explicit size, so a stand-in of another scale lands in the right place.
  A same-size draw is still a 1:1 blit. This hunk is the biggest steady-state win (~⅓ of the frame).
- A9 `@@ -276` `_particles()` uses `partBox()`.
- A10 `@@ -379` `_note()`: a fixed 40 px sprite, scaled with `g.scale(s, s)` during the pop-in, instead of a new raster per size.

**assets.js**
- B1–B3 `loadCustom` / `setShape` / `clearCustom` also clear `_stale`.
- B4 `setScale()` keeps the old cache as `_stale` (merged if two rescales happen back to back) instead of discarding it.
- B5 `_pump()` drops `_stale` when the warm queue is empty.
- B6 `sprite()`: on a miss, return the stale canvas (it is drawn at the same logical size) and queue a re-raster for idle time.

**main.js**
- C1–C2 `adapt()` counters are in seconds of real time (1.5 s slow → step down, 5 s fast → step up, 1 s hold), not frames. At 60 fps
  the behaviour is identical to before. At 10–20 fps it reacts 4–6× sooner.

## 8. Harness (`tests/perf/`; output goes to `tests/perf/out/`, which should be gitignored like `tests/out/`)
- `lib.js`: static server and an rAF recorder (interval and callback time, with an optional raster flush).
- `measure.js --suite load|frames|quick|hitch|cache|adaptive [--root <game dir>]`: the full matrix for any copy of the game.
- `ab.js --b <patched game dir>`: interleaved A/B frame times.
- `work.js --b <patched game dir>`: load-independent counters (pattern px, blit px, in-frame rasters, layers held). Its pattern
  counter ignores clips, so for B on a letterboxed screen it is an upper bound.
- `profile.js`: per-stage ablation and an in-frame raster count.

Not done: Safari/WebKit was not measured. Playwright WebKit is not installed and `playwright install` was not allowed. On iOS, canvas 2D is
GPU-backed, so the sea fill (fill rate) and the in-frame SVG rasters (CPU) should matter at least as much as here.
