# Family Flappy — Performance report (load + gameplay)

Date: 2026-10-28 · Scope: `game/` as on `main` (v1) · Author: performance engineering pass
Harness: `tests/perf/` · Raw data: `tests/perf/results/*.json|*.log` · Proposed patch: `tests/perf/proposed_fixes.patch`

## TL;DR

The game is **not slow to load**. It feels laggy because of **four gameplay problems**, all fixable in about 120 lines across
`render.js`, `assets.js`, `world.js` and `main.js`:

| Rank | Root cause | Evidence (baseline) | Fix | Measured gain |
|---|---|---|---|---|
| **1** | Each full-screen parallax layer is drawn **stretched by 1 device px** (`w + 1/px`). That forces a filtered (bicubic, because `imageSmoothingQuality='high'`) resample of 4 full-screen layers every frame. | One layer costs 10.0 ms at 1080p, against **0.78 ms** for a 1:1 blit (×13). The backdrop costs 32.7 ms per frame at 1080p and 55 ms at 1440p. `drawImage` is 46–83 % of all CPU samples. | **P1a**: blit sprites at exact device pixels with an identity transform. | Backdrop 32.7 → **3.1 ms** (1080p). 1080p gameplay **22 → 58–60 fps**. 1280×720 47 → 60 fps. |
| **2** | **Fixed 1/120 s simulation steps drawn without interpolation.** Each display frame shows 0, 1, 2 or 3 steps of motion, so the ground, turtles and bird **judder even at a perfect 60 fps**. | Real `world.js` + `main.js` fed with vsync timestamps: **33 % (up to 67 %) of frames uneven at 60 Hz**, 50 % with realistic jitter, 73 % at 75 Hz, 67 % at 120 Hz (a third of frames don't move at all), 17–31 % at 144 Hz, ~100 % at 165 Hz. | **P2**: World keeps the previous step's positions and the renderer draws `prev + (cur-prev)·acc/step`. | **0 % uneven frames at every refresh rate** (60/75/120/144/165 Hz, with and without jitter). |
| **3** | **Season-change hitch.** The 5 new full-screen SVG layers are rasterized lazily, in the frame where the crossfade starts, at device resolution. Then the 1.6 s crossfade draws everything twice (17× overdraw). | Worst frame at the change: 56 ms (720p), **120 ms (1080p)**, 215 ms (1440p), 390–500 ms (4K). Restarting after a game over also re-rasterized spring (66–378 ms). | **P1b**: warm the next season and spring ahead of time in `requestIdleCallback`. Keep cur/prev/next/spring cached. Trim only when the season changes, not every frame. | Worst frame **16.8 ms (720p) / 33 ms (1080p) / 33–50 ms (1440p, 4K)**. Restart: **16.8 ms** everywhere. |
| **4** | **Backing store = window × devicePixelRatio, uncapped.** Full screen on a 4K or high-DPI monitor makes the canvas 3840×2160 (8.3 MP). That is 69 MP blended per frame, 142 MP during a crossfade. | 1440p: 13 fps. 4K backing: 4–6 fps (software). On a GPU, 69 MP × 60 = 4.2 GP/s, beyond typical integrated-GPU fill rate. | **P3**: cap at 2 device px per logical px (≤ 1920×1080 backing) and let CSS upscale. **P5**: adaptive step-down when frames stay > 22 ms. | 2560×1440 and 1920×1080@2×: **13 / 6 fps → 57–60 fps**. Old-PC emulation (4× CPU throttle): 4.8 → 15–22 fps. |

Not a problem: game logic (World, Weather, Bot, Audio) < 1 % of CPU. GC is 6 minor GCs per 8 s, 4.6 ms total. `trimSeasons` takes 0.002 ms.
Load is fine too: the owner's real PC loads it from GitHub Pages in 542 ms, and locally the title screen shows in 0.5 s on Wi-Fi.

---

## 1. Method and what could and could not be measured faithfully

* **Server**: `tests/perf/server.js` mimics GitHub Pages: gzip for html/css/js/svg, `Cache-Control: max-age=600`, ETag/304, one request
  per file over **HTTP/1.1**. Chromium opens at most 6 connections, which is more pessimistic than the HTTP/2 that github.io really serves.
  A second origin with `max-age=0` reproduces a visit made more than 10 minutes later (every file revalidated).
* **Browser**: Playwright Chromium headless (build in `results/*.json`), CDP `Network.emulateNetworkConditions`,
  `Emulation.setCPUThrottlingRate` 1×/4×/6×. Viewports are **CSS px @ deviceScaleFactor**: 1280×720@1, 1920×1080@1 / @1.5 (2880×1620 backing) /
  @2 (3840×2160 backing = a 4K monitor at 200 %), 2560×1440@1.
* **Instrumentation** (init script, no game edits): `Renderer.draw` duration, the `Game.frame` JS time, rAF timestamps, `Assets.sprite` cache
  misses (rasterizations), PerformanceObserver long tasks, CDP CPU profile (top self time) and a CDP trace (GC, commit).
* **Smoothness metric**: for each displayed frame, `rendered scroll delta / (scrollSpeed × Δt)`, measured on the same rAF timestamps the
  game uses. A frame is **uneven** if the ratio is off by more than 25 %.
* **Judder simulator** (`tests/perf/judder.js`): runs the **real** `world.js` + `bot.js` with `main.js`'s exact frame→step code, fed with
  60/75/120/144/165 Hz vsync timestamps coarsened to 0.1 ms (as Chrome does) with ±0 or 0.25 ms jitter. It averages 4 start phases.
* **Overdraw counter** (`tests/perf/overdraw.js`): device megapixels written per frame by `drawImage`/`fillRect`. This is GPU-independent.

**Limits.** The sandbox has no GPU. Chromium's 2D canvas here is **software-rasterized** (SwiftShader). `--enable-gpu-rasterization
--use-angle=swiftshader` made it 10–70× slower (emulated GPU), so it is not useful. Therefore:
* Frame times measured here are **CPU/software-raster costs**. They are faithful for Windows PCs where Chrome/Edge falls back to a
  software canvas: GPU blocklisted, old Intel drivers, Remote Desktop/VMs, "Use graphics acceleration" off.
* On a normal GPU-accelerated Chrome/Edge, the per-frame CPU cost of `draw()` is mostly command recording (≈ 1 ms), and the cost moves to the GPU.
  There, **P1a still matters**: a non-1:1 draw with `imageSmoothingQuality='high'` uses cubic or mipmapped sampling, which means many texture taps per pixel on 4 full-screen layers.
  **P3 matters** through fill rate (the overdraw table below). **P2 (judder) is completely hardware-independent**, and I believe it is the main
  "laggy" feeling on the owner's GPU machine at DPR 1.25.
* The SVG→canvas rasterization at a season change also happens on a GPU machine. With GPU rasterization it partly moves to the GPU process, so the
  absolute hitch is smaller than measured here, but it is still clustered in one frame.
* Headless vsync is a perfectly regular 60 Hz. The in-browser synthetic-clock test (§4) was too slow on the baseline (≈ 20 fps, because frames are
  flushed outside real rAF) to show judder, so judder numbers come from the simulator. The simulator runs the actual game code.

## 2. Load

Owner's real data point (Windows, Chrome 152, DPR 1.25, live GitHub Pages): **542 ms, 49 requests, 117 KB**, slowest file ≈ 0.2 s. Load is not the problem.

Local reproduction, 1920×1080@1, CPU 1×. `title` = menu interactive (`FF.debug.mode === 'title'`); `first frame` = first canvas frame drawn (ms from navigation):

| Network | Visit | Requests (304) | Transfer | FCP | DOMContentLoaded | Title | First frame (its draw) |
|---|---|---|---|---|---|---|---|
| Wi-Fi 30 Mb/40 ms | cold | 50 | 122 KB | 620 | 234 | **513** | 594 (79 ms) |
| Wi-Fi | warm (< 10 min) | 50, all from cache | 0 KB | 272 | 89 | **121** | 204 (83 ms) |
| Wi-Fi | expired (> 10 min) | 50 (49 × 304) | 16 KB | 624 | 227 | 492 | 596 |
| Fast 4G 9 Mb/170 ms | cold | 50 | 122 KB | 912 | 759 | 1811 | 1893 |
| Slow 4G 1.6 Mb/300 ms | cold | 50 | 122 KB | 1256 | 1446 | 3199 | 3284 |
| Wi-Fi, CPU 4× | cold | 50 | 122 KB | 1460 | 388 | 949 | 1378 (**422 ms** draw) |

* About 228 KB raw / 122 KB gzipped. Nothing is render-blocking except `style.css`. The 38 SVGs are requested **in parallel after
  DOMContentLoaded** (in `boot()`), so their timing is one dependency hop plus bandwidth. Over HTTP/1.1 at 170–300 ms RTT, the 6-connection limit
  makes the art wave last 1.6–2.9 s. On real GitHub Pages (HTTP/2, the owner's 542 ms) this doesn't happen.
* The visible start-up cost is the **first canvas frame**: 8 SVG rasterizations plus the stretched blits, 79 ms (CPU 1×) to 422 ms (CPU 4×).
  P1a/P1b bring it to 41–55 ms (CPU 1×) and 164–211 ms (CPU 4×).
* With the fixes (`fix_all`), load timings are unchanged within noise. The `<link rel=preload>` and "load later seasons in the background" changes
  were **not measurably better** here, because of HTTP/1.1 contention. They are optional (P7, low priority).

## 3. Gameplay: steady state (bot playing, 10 s per season)

fps / p95 frame interval (ms) / % frames > 20 ms. Software raster. `before` = `results/baseline_play.json`; `after` = all fixes with
adaptive off (`results/fix_cap.json`, render cap 2). The `P1+P2 only` column shows the fixes without the resolution cap (`fix_nocap.json`).

| Viewport (backing before → after) | CPU | Season | Before | P1+P2 only | After (P1+P2+P3) |
|---|---|---|---|---|---|
| 1280×720@1 (1280×720) | 1× | spring | 49 / 33 / 22 % | 60 / 16.8 / 0 % | **60 / 16.8 / 0 %** |
| | | summer | 44 / 33 / 32 % | 60 / 16.7 / 0 % | **60 / 16.7 / 0 %** |
| 1920×1080@1 (1920×1080) | 1× | spring | 23 / 67 / 100 % | 59.5 / 16.7 / 0.8 % | **59.9 / 16.8 / 0.2 %** |
| | | summer | 22 / 83 / 99.5 % | 54 / 33 / 10 % | **56.7 / 33 / 5.8 %** |
| | | autumn | 23.5 / 50 / 100 % | 59 / 16.8 / 1 % | **59.9 / 16.7 / 0.2 %** |
| | | winter | 22.5 / 67 / 100 % | 59.7 / 16.7 / 0.5 % | **60 / 16.7 / 0 %** |
| 1920×1080@1.5 (2880×1620 → 1920×1080) | 1× | spring | 10.4 / 117 / 100 % | 31 / 50 / 86 % | **60 / 16.7 / 0 %** |
| 1920×1080@2 (3840×2160 → 1920×1080) | 1× | spring | 6.2 / 183 / 100 % | 19.5 / 67 / 100 % | **59.8 / 16.7 / 0.3 %** |
| | | summer | 3.9 / 367 / 100 % | 17 / 100 / 100 % | **56.8 / 33 / 5.5 %** |
| 2560×1440@1 (2560×1440 → 1920×1080) | 1× | spring | 13.1 / 83 / 100 % | 43.6 / 33 / 37 % | **59 / 16.8 / 1.7 %** |
| 1920×1080@1 | 4× | spring | 4.3 / 283 | 14.6 / 100 | 15.2 / 83 → **15–22 fps with P5** (drops to 960×540) |
| 1920×1080@1 | 6× | spring | 3.0 / 383 | 9.5 / 133 | 9.0 / 133 → 5–14 fps with P5 (1080×608) |

Notes
* Summer (sun rays: 6 gradient triangles with `lighter` compositing) is the heaviest season: about 2.3 ms per frame at 1080p in software.
* "Before" at 4K and with CPU throttling also runs in **slow motion**: `main.js` clamps dt to 0.1 s, so below 10 fps game time slows down.
* Per-frame draw at 1080p: 37 ms → 9 ms (`draw p50`). Micro-benchmarks for one frame's pieces (ms, software, 1080p backing):

| Piece | Before | After |
|---|---|---|
| one full-screen layer, stretched `w+1/px`, quality high | 10.0 | — (no longer used) |
| same layer, 1:1 device-pixel blit | 0.78 | 0.65 |
| `backdrop()` (sky + clouds + far + mid) | 32.7 | **3.1** |
| `fadeLayer()` crossfade (offscreen backdrop + composite) | 42.0 | **11.4** |
| full `draw('playing')` | 41.7 | **9.2** |
| sun rays (6 new gradients) / fog gradient / tint rect | 2.4 / 1.9 / 0.7 | same |
| particles (≈ 90) / HUD text / `trimSeasons` | 0.005 / 0.1 / 0.002 | same |
| SVG raster of one season layer (sky / far / mid / clouds / ground) | 18.7 / 12.5 / 9.4 / 9.1 / 1.8 | unchanged, but now off the critical path |

CPU profile (baseline, 10 s): `drawImage` 46 % (1080p, CPU 4×) / 83 % (4K); `restore` 36 % (the deferred raster flush is attributed to it);
`(program)` 13–16 %; all game JS together < 1 %; GC 0.1 %.

**Overdraw (device px written per frame / backing area)**: 8.3–8.9× in normal play; **17.2× during the 1.6 s season crossfade**.

| Backing | MP per frame (normal / crossfade) | Pixel rate needed at 60 fps |
|---|---|---|
| 1280×720 | 7.7–8.2 / 15.8 | 0.5 / 0.95 GP/s |
| 1920×1080 (cap) | 17.3–18.5 / 35.6 | 1.1 / 2.1 GP/s |
| 2560×1440 | 30.8–32.8 / 63.4 | 2.0 / 3.8 GP/s |
| 3840×2160 | 69–74 / 142.5 | **4.4 / 8.6 GP/s**: too much for integrated GPUs |

P1/P2 do not change overdraw. P3 caps it at the 1080p row.

## 4. Motion smoothness (judder), independent of FPS

`world.update(dt)` runs fixed 1/120 s steps with an accumulator. The renderer draws the **latest** step, so each display frame advances by a
whole number of steps. % uneven frames (the scroll per frame is off by more than 25 % from what the speed says), real game code, averaged over 4 start phases:

| Monitor | vsync jitter | Before: uneven % (worst phase) | Steps per frame before | After (P2) |
|---|---|---|---|---|
| 60 Hz | 0 | 33 % (67 %) | 2, or 1/3 alternating on a bad phase | **0 %** |
| 60 Hz | 0.25 ms | 50 % (53 %) | 1 / 2 / 3 | **0 %** |
| 75 Hz | 0–0.25 ms | 66–73 % | 1, 2, 1, 2 … | **0 %** |
| 120 Hz | 0–0.25 ms | 49–67 % | **0**, 1, 2 (frames with no motion) | **0 %** |
| 144 Hz | 0–0.25 ms | 17–31 % | 1 … 1, **0** every ~6th frame | **0 %** |
| 165 Hz | 0–0.25 ms | 96–100 % | 0 / 1 | **0 %** |

In the browser with a synthetic 60/75/120/144 Hz rAF clock, the fixed build shows **0 % uneven frames** at 60–107 fps
(`results/judder_fix_browser.log`). The baseline build only reached about 20 fps in that harness, so its numbers there say nothing.
Interpolation adds at most one 8.3 ms step of display latency, and the simulation stays bit-identical (tests and bot are unaffected).

## 5. Hitches: season change, restart, resize

Worst frame in the 2.5 s after the event (ms) / dropped frames (`baseline.json` vs `fix_cap.json`, CPU 1×):

| Viewport | → summer | → autumn | → winter | → spring (lap 2) | Play Again from winter |
|---|---|---|---|---|---|
| 1280×720@1 before | 56 / 27 | 56 / 52 | 68 / 76 | 44 / 21 | 30 |
| 1280×720@1 after | **17 / 0** | **20 / 0** | **17 / 0** | **17 / 0** | **17** |
| 1920×1080@1 before | 123 / 103 | 120 / 115 | 120 / 113 | 90 / 98 | 66 |
| 1920×1080@1 after | **33 / 13** | **33 / 33** | **34 / 51** | **34 / 11** | **17** |
| 1920×1080@2 before | 391 / 142 | 444 / 155 | 499 / 157 | 409 / 155 | 378 |
| 1920×1080@2 after | **50 / 15** | **50 / 35** | **33 / 46** | **33 / 11** | **17** |
| 2560×1440@1 before | 216 / 125 | 223 / 136 | 213 / 138 | 214 / 135 | 192 |
| 2560×1440@1 after | **33 / 19** | **50 / 38** | **50 / 61** | **34 / 13** | **17** |

What remains in the "after" rows is the crossfade itself (backdrop drawn twice + offscreen composite: 17× overdraw for 1.6 s). A further
option, if still needed on weak hardware: during the crossfade, draw the incoming season at a lower internal resolution, or shorten it to 1 s.

**Resize / fullscreen** (worst frame, CPU 1×): →1920×1080: 100 → 51 ms; →2560×1440: 150 → 83 ms (CPU 4×: 817 → 433 ms). A resize still
re-rasterizes the current season once, which is unavoidable and rare. **P6 debounces** the resize handler: dragging a window edge used to fire
dozens of resize events, and each one cleared the sprite cache and re-rasterized everything.

## 6. Prioritized fixes (apply in this order)

The full unified diff is in **`tests/perf/proposed_fixes.patch`** (`git apply tests/perf/proposed_fixes.patch` from `projects/flappy/`).
The prototype is in `/tmp/claude-0/perf/game_fix` and passed a pixel diff against the baseline: same image except 1-px edge shifts (the old
code stretched layers by 1 px) and objects drawn 1 step earlier (interpolation).

### P1a — Pixel-exact layer blits (render.js `tile()` ~L129 and `backdrop()` ~L170) — biggest win
```js
tile(key, off, y, w, h, alpha) {
  const spr = FF.Assets.sprite(key, w, h);
  if (!spr) return false;
  // 1:1 device pixels: a stretched full-screen drawImage (even by 1 px) takes the filtered resampling path
  const g = this.ctx, sw = spr.width, cw = g.canvas.width;
  let x = -Math.round((((off % w) + w) % w) * sw / w);
  g.setTransform(1, 0, 0, 1, this._ox, this._oy);
  if (alpha < 1) g.globalAlpha = alpha;
  for (const yd = Math.round(y * this.px); x < cw; x += sw) g.drawImage(spr, x, yd);
  g.globalAlpha = 1;
  g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
  return true;
}
// backdrop(): sky as a 1:1 blit
if (sky) { g.setTransform(1, 0, 0, 1, this._ox, this._oy); g.drawImage(sky, 0, 0); g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); }
```
Screen shake becomes a whole-device-pixel offset (`this._ox/_oy`) set at the top of `draw()`, instead of `g.translate(...)` (see the patch).
`fadeLayer()` uses the same offset. *Gain: backdrop 32.7 → 3.1 ms; 1080p 22 → 58–60 fps (software); fewer texture taps per pixel on a GPU.*

### P2 — Render interpolation (world.js `_step` ~L527; render.js `draw()` + new `interp()/uninterp()`)
```js
// world.js, first lines of World.prototype._step:
var b = this.bird, i;
this._pScroll = this.scroll; b._px = b.x; b._py = b.y; b._pa = b.angle;
for (i = 0; i < this.turtles.length; i++) { this.turtles[i]._px = this.turtles[i].x; this.turtles[i]._py = this.turtles[i].y; }
for (i = 0; i < this.drops.length; i++) { this.drops[i]._px = this.drops[i].x; this.drops[i]._py = this.drops[i].y; }
```
```js
// render.js draw(): after setTransform
const lerped = w ? this.interp(w) : false;
// … end of draw(): if (lerped) this.uninterp();
interp(w) {            // swap in prev + (cur - prev) * acc/step for scroll, bird x/y/angle, turtles, drops
  const a = clamp(w._acc / (w.cfg.step || 1 / 120), 0, 1), S = this._saved || (this._saved = []);
  S.length = 0; this._a = a;
  this._lerp(w, 'scroll', '_pScroll');
  const b = w.bird; this._lerp(b, 'x', '_px'); this._lerp(b, 'y', '_py'); this._lerp(b, 'angle', '_pa');
  for (const t of w.turtles) { this._lerp(t, 'x', '_px'); this._lerp(t, 'y', '_py'); }
  for (const d of w.drops) { this._lerp(d, 'x', '_px'); this._lerp(d, 'y', '_py'); }
  return S.length > 0;
}
_lerp(o, k, pk) { const p = o[pk]; if (p == null) return; this._saved.push(o, k, o[k]); o[k] = p + (o[k] - p) * this._a; }
uninterp() { const S = this._saved; for (let i = S.length - 3; i >= 0; i -= 3) S[i][S[i + 1]] = S[i + 2]; S.length = 0; }
```
The state is restored right after drawing, so World, the Bot and the tests always see the exact simulation.
*Gain: uneven frames 17–100 % → 0 % at every refresh rate.* (Update `docs/DESIGN.md`: new World fields `_pScroll`, `_px/_py/_pa`.)

### P1b — Warm season layers off the critical path (assets.js; render.js `setSeason`/`resize`/`draw`)
* `Assets.warm(list)`, `warmSeason(s)`, `_pump()`: a `requestIdleCallback` queue (`timeout: 250`) that rasterizes one or two layers per
  callback. It forces the deferred raster by drawing the sprite into a 1×1 probe canvas.
* `sprite()` split into a cache lookup plus `_raster()`. `setScale()` also clears the warm queue.
* `Renderer.setSeason(i)`: `FF.Assets.warmSeason((i + 1) % 4); FF.Assets.warmSeason(0);`. `resize()`: `warmSeason(this.vis.cur)`.
* `draw()`: trim only when the season pair changes, and keep the next season and spring:
  `if (this._trimKey !== v.cur*4+v.prev) { this._trimKey = v.cur*4+v.prev; FF.Assets.trimSeasons([v.cur, v.prev, (v.cur+1)%4, 0]); }`

*Gain: season-change worst frame 56–499 ms → 17–50 ms; Play Again 30–378 ms → 17 ms.* Memory: up to 4 seasons × ~34 MB at the 1080p cap.

### P3 — Cap the backing store (render.js `resize()` ~L36)
```js
this.px = Math.min(s * dpr, this.maxPx || 2);   // ≤ 1920×1080 device px; CSS upscales the rest
this.canvas.width = Math.round(W * this.px);
this.canvas.height = Math.round(H * this.px);
```
Constructor: `this.maxPx = (/[?&]maxpx=([\d.]+)/.exec(location.search) || [])[1] * 1 || 2;` (the URL override is for testing).
*Gain: 4K/1440p full screen 4–13 fps → 57–60 fps; overdraw 69 → 17 MP per frame.* The owner at DPR 1.25 is unaffected (backing already ≤ 1080p).
Trade-off: slightly softer edges on 4K screens.

### P5 — Adaptive quality (main.js, new `adapt(real)` called after `draw`)
When more than 70 frames out of a decaying window exceed 22 ms, it sets `renderer.maxPx = max(1, px × 0.75)` and calls `resize()`. It only steps down and
pauses for 60 frames after each step. `?adaptive=0` turns it off. *Gain on a 4×-throttled CPU: 4.8 → 15–22 fps.* It never triggered on normal configs (1×).

### P6 — Debounce resize (main.js boot)
`window.addEventListener('resize', () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.renderer.resize(), 120); });`

### P7 (optional, low value) — loading
`<link rel="preload" as="image">` for the spring layers and characters, and `loadAll()` awaiting only characters/particles/spring while the
other seasons stream in (`Assets.restLoaded`). It was neutral in the HTTP/1.1 emulation, and real load is already 542 ms. Skip it unless the artwork grows.

### Not worth doing (measured as negligible)
Caching the sun-ray and fog gradients (2.4 + 1.9 ms in software, about 0 on a GPU), batching particles (0.005 ms), the cost of
`trimSeasons` (0.002 ms), GC (< 0.1 %), and bundling SVGs into one file.
Possible next steps only if weak GPUs still struggle: crop transparent bands from the clouds/far/mid sprites (each layer covers the full 960×540
but is partly transparent) and a cheaper crossfade.

## 7. How to re-run

```bash
cd projects/flappy
node tests/perf/run.js                         # full suite on game/ (≈ 30 min); --quick for a short run
node tests/perf/run.js --only play,season --label mine
PERF_ROOT=/path/to/other/game node tests/perf/run.js --label variant      # measure a patched copy
node tests/perf/run.js --q "maxpx=8&adaptive=0" --label nocap            # switch fixes off via URL params
node tests/perf/run.js --only judder           # synthetic 60/75/120/144 Hz rAF clock (motion smoothness in the browser)
node tests/perf/judder.js [gameDir]            # judder simulator with the real world.js (2 s)
node tests/perf/overdraw.js baseline=game fix=/path/to/fixed/game
node tests/perf/server.js [dir] [port]         # GitHub-Pages-like static server
```
Result files: `baseline*.json` (before), `fix_nocap.json` (P1+P2+P4+P6), `fix_cap.json` (+P3), `fix_all.json` (+P5; load and micro only,
the gameplay part was cut short by a container restart), `fix_all_slowcpu.json` (P5 on throttled CPUs), `judder_*.{txt,json,log}`, `overdraw.log`.
