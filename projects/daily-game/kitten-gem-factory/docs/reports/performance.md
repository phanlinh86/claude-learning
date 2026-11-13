# Comet's Gem Factory — Performance report

Date: 2026-11-13 · Scope: `game/js/{render,assets,world,main}.js` · Report-only (patch in `perf.patch`).

## How this was measured

Harness: `tests/perf/perf.js` (+ `tests/perf/micro.js` for isolated costs). Playwright + headless
Chromium, game served by `python3 -m http.server`. It records, per real `requestAnimationFrame` frame, both
the **rAF interval** (what the player feels) and the **game's own simulate+draw work** (JS time inside
`Game.frame`), plus a count of SVG rasterizations and full-screen-layer builds that happen *inside* a frame,
and `longtask` entries. Runs cover 1280×720 / 1920×1080 / 2560×1440 / 3840×2160, CDP CPU throttling 1× and 4×
(phone proxy), and iPhone/iPad device-metrics contexts. Memory: a 3-minute `speed=8` autorestart bot run,
sampling JS heap + the sprite/layer/plate caches.

**Important caveat about absolute numbers.** Headless Chromium rasterizes the canvas on the **CPU**; a real
iPhone/iPad composites the canvas on the **GPU**, so the per-frame milliseconds here are far more pessimistic
than real hardware, and the 2-core throttled test box is noisy. Treat the absolute p95/p99 as worst-case and
trust the **before/after deltas and the raster/longtask/memory counts**, which are structural and
device-independent.

## Load

- **Time to interactive title: ~1.04 s** (DCL 238 ms, FCP 288 ms). Good.
- Total bytes to title **~492 KB over 51 requests**; the three deferred season SVGs stream in behind the title
  (spring/room load up front, summer/autumn/winter after).
- Largest assets are the outside SVGs: **summer 67 KB, winter 53 KB, spring 38 KB, autumn 30 KB**. Transfer
  time is trivial (7–41 ms each). The real cost is **decode + raster**: decoding winter's SVG takes ~53 ms and
  the first raster of an outside layer is **~19 ms at 960×540 and ~25–30 ms at 1920×1080** on this CPU (3–4× on
  a throttled phone). That is a one-time-per-size cost — it only hurts if it lands inside a visible frame (see
  "Season change" below). No action needed on bytes; the fix addresses *when* the raster is paid.

## Frame time during play (steady state)

At 1280×720 and 1920×1080, un-throttled, the game holds **60 fps** (rAF p50 16.7 ms) with p95 at one dropped
frame; the game's own JS work is **~1–5 ms p50/p95**. At 2560×1440 and 3840×2160 un-throttled the *headless
CPU* can't rasterize the larger backing store at 60 fps (p50 50–100 ms) — but adaptive quality caps the
backing store (see below), and a real GPU would not hit this. Steady-state JS work stays ≤ ~20 ms p95 even at
4× throttle. **Steady-state play was already healthy; the problems were at transitions and in memory.**

## Problems found and fixed

### 1. Season crossfade hitch — the biggest player-visible issue  (FIXED)
On every season change the renderer built the next outside layer, the room wall and floor **inside the first
frame of the crossfade**, and `_cards`/particles rasterized that season's gems and particle sprites on first
use. Measured as a burst of **60–83 synchronous rasterizations in the transition window** and a single frame
of **90–185 ms** (`--flush` run: one `longtask` of 118–313 ms on season change). On a phone this is a clearly
visible multi-hundred-ms freeze right when the "Spring/Summer…" banner appears.

Root causes: (a) `prewarm()` only warmed one season's background and relied on the lazy sprite cache for gems
and particles; (b) canvas 2D **defers** an SVG `drawImage` until the canvas is first read, so even "pre-warmed"
layers paid their raster inside the frame that first drew them.

Fix (`render.js`): `prewarm(season)` now enqueues **everything** that season needs — outside layer, wall,
floor, the per-size **bench plate**, the back/face **card plates**, the **gem sprites** at the card size, and
the season's **particle sprites** — as one job per `requestIdleCallback`, and **forces each raster at build
time** with a 1×1 `getImageData` readback so the cost is paid in idle time, not in a frame. `resize()` warms
the current **and next** season. `assets.js` `_pump()` forces its idle rasters the same way (it used a
`drawImage`-into-another-canvas that does *not* force the deferred raster). Result: **in-transition rasters
drop from 60–83 to ~0** and the transition long-task disappears in the controlled A/B
(`--flush`: orig 118–313 ms → fix 0–145 ms, usually 0).

### 2. Unbounded sprite-cache growth from flyers  (FIXED — memory)
`_flyers()` drew each flying gem with `_gemOnCard(kind, s)` where `s = 56·(1−0.45k)` **shrinks every frame**.
Each distinct size is a new sprite-cache key, so over a 3-minute run the cache grew to **1253 entries /
~17.8 MB** (and every new size is a fresh SVG rasterization — a per-flyer, per-frame cost).

| Sprite cache over 3 min @ speed 8 | before | after |
|---|---|---|
| cache entries | 107 → **1253** | 51 → **54 (flat)** |
| sprite memory | 2.4 → **17.8 MB** | ~**2.0 MB (flat)** |
| total rasterizations | **1253** | **54** |
| JS heap | ~2.4 MB stable | ~2.4 MB stable |

Fix (`render.js`): draw the flyer gem at a **fixed 56 px and apply the shrink with `g.scale()`**, so one
cached sprite is reused. Background-layer memory (`bgMB` ~18.7 MB) is bounded (one layer per key per scale,
rebuilt on resize) and unchanged.

### 3. Judder: card deal slide was not interpolated  (FIXED)
Comet and flyers interpolate between the 1/120 s sim steps with `world.alpha`, but the **card deal slide did
not** — `dealX` was read raw, so the fast slide (~3000 px/s off the conveyor) stepped visibly at display
refresh rates above the sim rate. Fix: `world.js` saves `prevDealX` each sub-step and `render.js` interpolates
`dealX` with `w.alpha`, matching the comet/flyer path. No cost change; removes the stutter.

### 4. Adaptive quality was blind on mobile  (FIXED)
`adapt()` judged only `performance.now()` around `Game.frame` — i.e. **JS time**, which stays 1–5 ms because
canvas raster is deferred to the compositor. So on a device where the *real* frame is slow, the adaptive
downshift **never triggered**. Verified: iPad-metrics context under 6× CPU throttle — original backing store
stayed at px 1.80 (never downshifted, `maxPx` never set); the fix detected the slow **rAF interval** (relative
to the fastest interval seen, so a 30 Hz Low-Power cap or 120 Hz screen isn't misread) and dropped to its
floor px 1.65, recovering to smooth fps sooner. Fix (`main.js`): `adapt(work, iv)` also tracks a smoothed rAF
interval vs. its running minimum and downshifts when either the work **or** the interval is sustainedly slow;
it pauses while the tab is hidden.

### 5. Per-frame re-draw of static pixels: bench + resting cards  (FIXED — throughput)
- **Bench** (big translucent rounded rects + double stroke + bolts) was re-stroked every frame though it only
  changes per season/scale. Now cached as a per-season **bench plate** and blitted (micro: 4.8 ms → 1.5 ms at
  1280/4×; 8 ms → ~3 ms at 1920/4×). Cost: bench plates add a bounded **~9 MB** to the plate cache
  (≤ 4 seasons, cleared on resize) — a deliberate memory-for-time trade.
- **Resting cards** (not mid-flip, not matched) blitted their plate and gem through the scaled logical
  transform, so Chromium **resampled** them every frame. They are now blitted **1:1 on whole device pixels**
  when upright and un-scaled (micro: 20 cards 12.9 ms → 2.9 ms at 1280/4×, 22.3 → 6.9 ms at 1920/4×). Cards
  mid-flip/pop keep the exact old scaled path, so animation is pixel-identical.

A full-canvas pixel diff of a dealt board (desktop and iPhone-metrics) shows **< 0.6 % of pixels differ by
> 40/255**, all sub-pixel edge shifts from the now-crisper integer blits — side-by-side crops are visually
identical.

## Checks against the stated performance rules

- **Full-screen layers pixel-exact, never stretched** — yes: `_layer`/`_customWall` rasterize at
  `w·px × h·px` and tile 1:1; backing store capped ≈ 1920×1080 by the `cap` in `resize()`. Unchanged.
- **Next season's layers pre-warmed in idle time** — was partial (one background only); **now complete**
  (layers + plates + gems + particles, current and next season) and actually forced to rasterize in idle.
- **Adaptive quality** — present but **mobile-blind**; now interval-aware. Backing-store cap verified.
- **Per-scale sprite cache / cached card plates** — present and correct; the flyer bug defeated the sprite
  cache's intent and is fixed. Bench now joins the plate cache.
- **Interpolation (world.alpha)** — comet/flyers already interpolated; **cards now too**.

## Regression check

`tests/e2e/smoke.js` run against the patched copy: **all checks PASS, zero console errors** (title, every
menu, manual tap flips a card, bot reaches level 30 scoring 22 520, pause/resume, game over). `node --check`
clean on all four files.

## Recommendation

**Apply `perf.patch`.** It removes the season-change freeze (60–83 in-frame rasters → ~0), stops an 18 MB
sprite-cache leak (now flat at ~2 MB), fixes card-slide judder, makes adaptive quality work on phones, and
cuts static-pixel redraw cost — with no gameplay or visual change (smoke green, <0.6 % sub-pixel pixel diff).
The one cost is ~9 MB of bounded bench-plate cache, well within an iPhone/iPad budget. No further work needed
on load size or steady-state desktop frame time.
