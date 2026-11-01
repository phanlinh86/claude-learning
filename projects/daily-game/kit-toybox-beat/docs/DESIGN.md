# Kit's Toybox Beat — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.KB`**. Classic `<script>` files, no build step. Storage prefix `ktb:`.
Sister game with proven integration code: `projects/daily-game/spike-dino-jam` (storage, assets, audio, ui, main, mobile layer, Go wrapper, tests). Copies of its integration files are in `game/js/` and are being adapted by the integrator.

## 1. Lessons from rhythm-tap games (keep / change)
| Classic rhythm tap (lane highways, taiko-style drums) | Kit's Toybox Beat |
|---|---|
| Notes scroll to a hit line, judged by timing | Keep: coins roll along two toy-train tracks to Kit's **catch ring**; Perfect / Good / Miss |
| 4–7 lanes, reading-heavy | **2 lanes** (upper shelf track, lower floor track); **Easy = one button** (any tap catches the next coin) |
| Music from a file, fixed charts | **Generated** charts (seeded patterns per level, always on the beat) + a WebAudio backing band; every catch plays the next melody note |
| Health bar | **Groove meter** = Kit's rocket fuel; drains on misses, refills on catches |
| Combo counter | Keep; multiplier ×2/×3/×4 every 10 in a row |
| Static stage | Toy room through the day (dawn, noon, sunset, night), beat-pulsing toys and particles |
| No "enemy" | **Baron Fluff** every 30 s throws 3 soft pillows that arrive **on beats**: tap them to bop them back (the twist) |
| Spamming beats the chart | Taps that are early (inside the "too early" window) consume the note as a miss, so spamming loses groove |

## 2. Screen & coordinates
- Logical canvas `VW × VH` (see §8; desktop default **960 × 540**). y down; px; seconds.
- **The world is screen-independent**: it only knows lanes (0 = upper, 1 = lower) and times. The renderer maps time to x.
- Render layout (render.js `layout()`; for 960×540): `kitX = 0.2·VW` (≥ 110), lane 0 y = `0.50·VH`, lane 1 y = `0.79·VH` (portrait: lanes at 0.50 / 0.68 of VH), floor line = lane 1 y + 34, ring radius 34. Coins enter at the right edge: `x = kitX + (note.time − songTime) / approach × (VW + 40 − kitX)`.
- Draw order: wallpaper → window (with sky) → wall decor → shelf + floor → floor decor (back) → tracks → catch rings → coins/pillows (lane 0 then lane 1) → Kit (+ flame) → Baron Fluff → front particles → fx → HUD.
- Overlays (banners, "+N", judgement words) never cover the catch ring or Kit: judgement words pop **above** the ring of their lane, banners sit in the top third.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration; never copy or trace; no known characters, brands or toys). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black), saturated but soft palette, kid-friendly: nothing scary. No `<text>`, fonts, scripts, filters with external refs, or external images. `width`/`height` = viewBox. Transparent background unless stated.
**View:** side view, slightly from the front (like a stage). Characters face **right** (towards the incoming coins).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `kit_idle.svg`, `kit_reach.svg`, `kit_happy.svg`, `kit_dizzy.svg` | 0 0 120 120 | 96 × 96 | Kit the kitten (cream/ginger with soft stripes, big eyes, pink nose, tiny blush, a little aviator scarf), wearing a small round **toy rocket backpack** (red/white, with fins). Side 3/4 view facing right. **Body centre (58, 62)**, rocket nozzle bottom at **(30, 96)** (the flame attaches there). Hovering, legs dangling. Body geometry identical across frames; only face, paws and tail change. reach = front paw stretched forward-right to (104, 62), eager face; happy = ^^ eyes, open smile, paws up; dizzy = swirl eyes, wobbly smile, ears tilted (cute, not hurt). |
| `flame_1.svg`, `flame_2.svg` | 0 0 40 48 | 26 × 31 | soft cartoon rocket puff (yellow core, orange edge, a few round puffs), pointing **down**, top centre (20, 2) attaches to the nozzle. 2 frames for flicker. |
| `coin.svg` | 0 0 64 64 | 40 × 40 | chunky gold-yellow toy coin seen face-on with a raised rim, a star stamp (no text, no currency symbols), a highlight. Centre (32, 32). It rotates while rolling, so the stamp must look fine at any angle. |
| `coin_gold.svg` | 0 0 64 64 | 44 × 44 | rare "super coin": rainbow-rim or pink-gold with a heart/star and a sparkle. |
| `pillow.svg` | 0 0 64 48 | 48 × 36 | soft square pillow, pastel stripes or dots, puffy corners, centre (32, 24). |
| `fluff_idle.svg`, `fluff_throw.svg`, `fluff_oof.svg` | 0 0 160 200 | 112 × 140 | Baron Fluff: a tiny grumpy-cute teddy bear (caramel, patched ear, little monocle-free round eyes with a pouty brow, puffed cheeks, tiny crown or captain hat) in a wicker basket under a **patched toy balloon** (balloon top at y≈4, basket bottom at y≈196). Basket centre (80, 160). idle = arms on the basket rim, "hmph"; throw = one arm up high (paw at ~ (112, 112)); oof = eyes squeezed shut, a pillow-shaped bump/feathers, tongue out (funny). Same balloon/basket geometry in all frames. |
| `ring.svg` | 0 0 96 96 | 72 × 72 | catch ring = top view of a toy drum skin / tambourine rim, transparent centre, centre (48, 48). Drawn at each lane in front of Kit. |
| `groove.svg` | 0 0 64 64 | 40 | HUD icon: little fuel can / rocket with a music note. |
| `tap_up.svg`, `tap_down.svg` | 0 0 64 64 | 52 | touch hint chips: rounded button with an up/down chevron (used on screen edges on touch devices and in How to Play). |
| `icon.svg` | 0 0 256 256 | app icon | Kit with her rocket catching a coin, on a round toy-blue badge with a musical note; readable at 32 px. |

### 4.2 Toy room (environment artist)
Per time of day: `levels/<dawn|noon|sunset|night>/`
| File | viewBox | Use |
|---|---|---|
| `wallpaper.svg` | 0 0 256 256 | **opaque**, seamless in **x and y**; low-contrast, mid-to-light tone, calm (stripes/dots/tiny stars). Dawn = peach/pink, noon = soft sky-blue/mint, sunset = warm apricot, night = deep blue with tiny star dots. |
| `window.svg` | 0 0 320 260 | opaque inside the frame, transparent outside: white wooden window frame with 4 panes and curtains; sky view: dawn = pink sky + rising sun half over hills; noon = blue sky + puffy clouds + a sun; sunset = orange-purple gradient + big low sun; night = navy sky + crescent moon + stars. |
| `floor.svg` | 0 0 512 192 | **opaque**, horizontally tileable; wooden floor boards seen from the front/above with a top edge (skirting line) at y=0; tone tinted for the time of day (night darker, blueish). |

Shared props in `room/`:
| File | viewBox | Use |
|---|---|---|
| `shelf.svg` | 0 0 512 56 | transparent, horizontally tileable wooden shelf plank seen from the front; the **top surface y = 8..18** (the upper track sits on it). |
| `track.svg` | 0 0 512 40 | transparent, horizontally tileable toy-train track (two rails + wooden sleepers) seen slightly from above; rail centre line y = 20. Coins roll on it. |
| `decor_0.svg` … `decor_5.svg` | 0 0 160 160 | transparent toys, base at y≈150: block tower (blank letters-free blocks), toy drum, rocking horse (generic), wind-up robot, stacked rings toy, toy sailboat. Placed on the shelf/floor edges and wall margins (never inside the lanes' play band). |
| `nightlight.svg` | 0 0 96 96 | star-shaped night-light lamp (used at night, glows). |

Palette rule: wallpapers stay low-contrast; avoid large saturated gold/yellow areas near the lanes (coins must read); Kit is cream/ginger with a red rocket, Baron Fluff caramel with a pastel balloon.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`mote.svg` (soft light speck), `bubble.svg` (soap bubble with rainbow sheen), `fluff.svg` (dandelion seed), `star.svg` (5-point soft star), `sparkle.svg` (4-point twinkle), `feather.svg` (white fluffy pillow feather), `note.svg` (music note, ink-blue), `confetti.svg` (small paper rectangle, white so code can tint it).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` **[integration]**

### 5.1 `KB.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
```js
KB.CONFIG = { ... }                  // all tunables with units + rationale comments
KB.DIFFICULTY = { easy:{...}, normal:{}, hard:{...} }   // overrides of CONFIG keys; easy has oneButton:true
KB.LEVELS = [{key:'dawn',name:'Dawn',bpm:84}, {key:'noon',name:'Noon',bpm:96}, {key:'sunset',name:'Sunset',bpm:104}, {key:'night',name:'Night',bpm:112}]
const w = new KB.World({ seed, config });   // config overrides KB.CONFIG
w.reset();          // level 0, score 0, groove = cfg.grooveStart, state 'ready'
w.startLevel(i);    // tod = i % 4, lap = floor(i / 4); generates the chart; keeps score/groove/combo
w.tap(lane);        // lane 0 | 1, or -1 = "any" (one-button: judges the nearest live note in either lane). With cfg.oneButton every tap is treated as -1.
w.update(dt); w.drainEvents();
// state
w.state            // 'ready' (count-in: 4 beats, songTime runs from −4·beatLen to 0) | 'playing' | 'cleared' (~2.6 s) | 'dead'
w.level, w.tod /*0..3*/, w.lap, w.bpm, w.beatLen /*s*/, w.songTime /*s; 0 = first downbeat after the count-in*/, w.beat /*float = songTime/beatLen*/, w.songLen /*s*/, w.progress /*0..1*/
w.approach         // s of look-ahead a coin is visible before its hit time (normal ≈ 1.8 s at 84 BPM, shrinking a bit with tempo; easy longer)
w.notes [{ id, lane /*0|1*/, time /*s, hit time*/, beat, kind /*'coin'|'gold'|'pillow'*/, pitch /*0..7 scale degree for the catch sound*/, state /*'live'|'hit'|'miss'|'bounced'|'poof'*/, judge /*'perfect'|'good'|null*/, err /*s, tap − time*/, tDone /*songTime when resolved*/, tThrow /*pillows only: songTime when thrown*/ }]   // sorted by time
w.kit { lane /*0|1 target*/, pos /*0..1 eased current lane position, 0 = upper*/, frame /*'idle'|'reach'|'happy'|'dizzy'*/, reach /*s since last tap*/, dizzy /*s left*/, happy /*s left*/ }
w.groove /*0..1*/, w.combo, w.maxCombo, w.mult /*1..4*/, w.score
w.stats { perfect, good, miss, early, gold, bounced, poofed, taps }
w.boss { state /*'away'|'enter'|'hover'|'leave'*/, x01, y01 /*0..1 position in the screen's upper-right play area, for the renderer*/, t, frame /*'idle'|'throw'|'oof'*/, next /*s until the next visit*/ }
w.cfg; // `_ppos` on kit and `_px01,_py01` on boss saved at the start of each fixed step (render interpolation); w._acc
```
Events: `start`, `level {level, tod, name, bpm, lap}`, `count {n}` (3, 2, 1 on the count-in beats, then n=0 "Go!" at songTime 0), `beat {beat, bar, down /*bool*/}` (each integer beat from the count-in on, while ready/playing), `tap {lane}`, `hit {id, lane, judge, err, points, kind, pitch, combo, mult}`, `miss {id, lane, kind, early /*bool*/}`, `empty {lane}` (tap with no note in range; no penalty), `multup {mult}`, `combobreak {combo}`, `bossin`, `throw {id, lane}`, `bounce {id, lane, points}`, `poof {id, lane}`, `bossout`, `groovelow` (crossing below 0.25), `songdone`, `cleared {bonus, level}`, `dead {score}`.

Rules / feel:
- **Chart**: per level, `bars` 4/4 bars (≈ 60 s at that tempo, + 4 bars per lap... keep ≤ 75 s) built from a seeded library of 1-bar patterns (quarter notes on beats; eighth pairs from level 2 on Normal, level 1 on Hard; never two notes closer than `minGap` s; Easy minGap 0.55 s). Lane patterns: same lane runs, alternations, call-and-response; first 2 bars of level 1 are very sparse (one coin per bar, then two). Density ramps within a song and per level. ~6 % gold. Every song starts and ends on a downbeat; the last bar is a "ta-da" (single coin on beat 1).
- **Boss**: first visit at `bossFirst` (12 s) into each level, then every **30 s** (`bossEvery`), only while ≥ 8 s of song remain. He enters (1.2 s), hovers, throws 3 pillows one bar apart; each pillow is a chart note of kind `'pillow'` on a beat, in a lane, **replacing** any coins within ±1 beat of it; it is thrown `pillowAir` (≈ 2 beats) before its hit time (`tThrow`), then he leaves (1.2 s). All boss timing is decided when the chart is generated (deterministic).
- **Judging**: a tap judges the earliest live note in the tapped lane (or either lane for −1) whose |err| ≤ `goodWin`: ≤ `perfectWin` → perfect, else good. If none, but a live note is within `earlyWin` before its time (i.e. tap is too early by more than goodWin but less than earlyWin) → that note is **missed early** (anti-spam). Otherwise `empty`. Notes not tapped by `time + goodWin` → `miss` (pillows → `poof`). Windows (s) normal 0.075 / 0.15 / 0.30, easy 0.10 / 0.22 / 0.30 (easy: early misses only for the `-1` lane when no note is within goodWin in either lane), hard 0.055 / 0.11 / 0.28.
- Pillow hit (perfect or good) → `bounce` +250 (× mult), boss frame 'oof' for 0.8 s. Pillow not hit → `poof`, kit dizzy 0.9 s (frames only, input still works), groove − `poofCost`.
- Groove: start 0.6; perfect +0.035, good +0.02, miss −`missCost` (normal 0.08, easy 0.04, hard 0.11), early miss same, poof −`poofCost` (normal 0.08, easy 0.03). Easy: groove never drops below 0.05 on level 1 (can't lose the first level). 0 → `dead` (after a short 0.6 s "rocket sputters" in state 'playing' is fine but must emit `dead` once).
- Combo: +1 per catch (incl. pillow bounce); every `comboStep` (10) catches mult +1 up to 4 (`multup`); a miss/poof resets combo and mult (`combobreak` if combo ≥ 5).
- Kit: `kit.lane` = lane of the last tap (with −1: lane of the judged note, else unchanged); `pos` eases toward it (critically damped, ~0.09 s). `reach` resets to 0 on tap; frame: 'dizzy' while dizzy > 0, 'happy' 0.35 s after a perfect, 'reach' < 0.18 s after a tap, else 'idle'.
- Song end: after the last note resolves + 1 beat → `songdone`, state 'cleared' (bonus = round(groove × 1000) × lapFactor, `cleared`), boss leaves; next level after ~2.6 s (`main.js` waits for the world to call startLevel itself — the world auto-advances).
- Score: perfect 100 × mult, good 50 × mult, gold ×3, bounce 250 × mult.
- Level 1 on Normal must be very winnable for a 6-year-old; Easy level 1 cannot be lost.

### 5.2 `KB.Weather` — `new KB.Weather({width,height,seed})`, `setLevel(tod,{instant})`, `resize(w,h)`, `update(dt, {beat /*float*/, kitX, kitY})`, `pulse()` (called on each beat: particles bob), `burst(sprite,x,y,n,opts)` (fx), `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front',color?}`, `ambient {tint /*css rgba overlay*/, glow /*0..1 night glow on coins*/}`. Sprites from §4.3 (names without `.svg`) + `'dot'`. Dawn: motes drifting in diagonal light shafts (back); noon: soap bubbles drifting up and wobbling, popping at random; sunset: dandelion fluff blown sideways with gentle pendulum; night: projector stars on the wall twinkling (back, slow rotate) + a few floating sparkles. Bounded particle counts (< 140). Works for any canvas size (portrait up to 720×1600).

### 5.3 `KB.Bot` — `new KB.Bot(world, {skill, seed})`, `bot.step(dt)` taps the right lane near each note's time; skill 1 = always perfect; skill < 1 adds Gaussian timing error (σ grows as skill drops), occasional wrong lane and missed notes. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.KB.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), bossNow() }`.

## 6. Customisation slots
`hero` (Kit, all frames; the flame is still drawn under the custom picture; procedural bob/lean/squash keeps it alive), `coin` (all coins; gold gets a rainbow ring), `pillow`, `bg_dawn|bg_noon|bg_sunset|bg_night` (replaces the wallpaper: drawn as "cover" over the whole wall; window, shelf, floor and tracks are still drawn on top). Same storage/processing rules as the sister games.

## 7. Audio (rhythm critical)
- When audio is running, the **audio clock is the master clock**: main.js derives the world's dt from `AudioContext.currentTime` (clamped 0..0.1 s), so beats, music and judging never drift. Without audio (muted/locked, `?speed>1`) it uses rAF time.
- The backing band (kick/snare/hat, bass, soft chords; a different instrument colour per time of day) is scheduled from the world's beat grid 0.15 s ahead. Count-in = 3 woodblock clicks + "go" chime. Each catch plays its `pitch` on a toy-piano / music-box voice in the level's key; misses play a soft muted "bonk"; pillow bounce = "boing"; poof = soft "fwump".
- Settings has **Timing offset** (−150…+150 ms, for Bluetooth headphones) added to tap times.

## 8. Mobile (iPhone / iPad) — same platform layer as `spike-dino-jam`
- Logical size: landscape ≥ 16:9 → 540 tall, width up to 1280; other landscape → 960 wide, height up to 960; portrait → 560 wide (720 when aspect ≥ 0.6), height up to 1600.
- Input: Pointer Events; a touch in the upper half of the play area = lane 0, lower half = lane 1 (split at the midpoint between the two lanes); each new pointer is a tap (multi-touch ok). UI buttons fire on touch `pointerup`; the ghost click is swallowed. On touch, `tap_up` / `tap_down` chips are shown at the right edge for the first 2 levels as a hint.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
