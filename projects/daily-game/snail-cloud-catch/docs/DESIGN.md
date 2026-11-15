# Shelly's Sky Catch — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.SC`**. Storage prefix **`ssc:`**. Classic scripts, no build step.
The integration code (storage, assets, audio, render, ui, main, mobile layer, Go wrapper, tests) is adapted from the sister catcher
`projects/daily-game/puff-volcano-catch` (copied here and renamed). The World API deliberately mirrors Puff's so the renderer
and tests carry over; the mechanics are new.

## 1. Lessons from basket catchers (keep / change)
| Classic catcher (Kaboom!-style, fruit catchers) | Shelly's Sky Catch |
|---|---|
| Items drop straight down at constant speed | Stars are **light**: gravity + air drag → a soft terminal speed, a flutter sway and spin. Gold is heavier (faster). Wind pushes them sideways. |
| No warning before a drop | A **twinkle peeks** out of the cloud bank for ~0.6 s at the drop x (readable for kids) |
| One miss = lose a life | A missed star only ends the streak; only catching a **thunder puff** costs a heart |
| Flat score | Streak multiplier ×1 → ×3, and the rare **golden star = 5×** (the twist) |
| Paddle only | **Jet Hop**: a vertical jetpack hop (real impulse + gravity arc) to grab a star early, plus a little extra sideways speed while airborne |
| Same feel every level | **Weather levels** change the physics: sunny (calm), rain (faster, more puffs), wind (gusts push stars + nudge Shelly), snow (icy sliding, slow fluttery stars) |

Fantasy: **zooming along the clouds on a tiny jetpack, catching falling stars.**

## 2. Screen & coordinates
- Logical **960 × 540**, letter-boxed (mobile: extended, see §8); y down; px; seconds. Static scene (no scrolling).
- **HUD band** y 0–64: hearts top-left, score + streak top-centre, star jar + jet meter top-right under the HUD buttons. Windsock (wind level) next to the jar.
- **Cloud bank** (where items come from): a soft cloud strip along the top; its fluffy bottom edge at y ≈ 90–110. Items **peek** at `y = 96` and drop from there.
- **Cloud floor** (items land / melt): y = **492**. Ground art top edge ≈ y 468–500, fluffy.
- **Shelly**: body centre at `(x, 430 − hop)` (+ bob in render only); x clamped to **70 … 890** (or the play range).
- **Basket rim** (catch line): centre `(rimX, rimY)` with `rimY = snail.y − 46` (= 384 at rest), catch half-width **36** px (+ item r × 0.5). `rimX = x + basket sway offset` (small damped pendulum, ±10 px max).
- Draw order: sky → castle layer (far cloud islands) → clouds strip (drifting) → back particles (sun sparkles, far rain, far snow) → cloud bank (top) → peeking twinkles → falling items (behind the basket front) → Shelly + basket → basket_front → ground (cloud floor) → front particles (rain, near snow, wind streaks, jet puffs) → fx → HUD.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only, from generator scripts (`tools/art-characters/gen.js`, `tools/art-environment/gen.js`; Node, writing files). Web search is for inspiration only; never copy or trace; no known characters or brands.
- Flat cartoon, rounded shapes, big friendly eyes, **one-step cel shading + one highlight**.
- Outline ≈ 3 px at drawn size, in a dark tone of the fill (never pure black). Round joins and caps.
- No `<text>`, fonts, `<script>`, `<image>`, external refs, or filters beyond a tiny blur. `width`/`height` = viewBox. Transparent background unless stated.
- Kid-friendly: nothing scary. Thunder puffs are grumpy-cute (pouty brows, tiny zigzag), never menacing; a zap is "fizzy" (hair-up, surprised eyes), never hurt.
- Palette mood: pastel sky kingdom. **Shelly**: mint-green/teal snail body, a **coral-orange shell** with a cream spiral, a small **silver-blue jetpack** with a red button, a honey-brown woven basket on top of the shell. Stars: saturated **yellow, pink, sky-blue** (all value 1, shape identical, colour + a small face/no face is fine), **gold** star = bigger, deep gold with a white rim glow and extra points of sparkle (clearly different by size and halo, colour-blind safe). Thunder puff: **slate-grey/indigo** cloud with a small yellow zigzag. Backgrounds are **soft, lower saturation and lower contrast** in the play band (y 280–480) so Shelly, stars and puffs always win; avoid large flat yellow, gold, coral or slate areas there.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `shelly_idle.svg`, `shelly_happy.svg`, `shelly_zap.svg`, `shelly_jet.svg` | 0 0 120 100 | 96 × 80 | body centre **(60, 58)** (= world `snail.x, snail.y`). Side view facing **right** (renderer mirrors when moving left). Snail body low along the bottom (y 70–92), head + eye stalks at the right, coral shell on the back (centre ≈ (52, 50)), jetpack on the back-left of the shell with a nozzle pointing **down-left** at ≈ (22, 78) (renderer emits jet puffs there). **Top of the shell flat-ish at y ≈ 24** where the basket sits (the basket is a separate sprite). Body geometry identical across frames; only face/eyes/stalks/nozzle glow change. happy = ^^ eyes, open smile; zap = surprised round eyes, stalks frizzy/zigzag, tiny cheek sparks; jet = determined smile, nozzle glowing (flame is drawn by code). |
| `basket.svg` | 0 0 80 60 | 64 × 48 | woven wicker basket seen slightly from above (front rim + back rim ellipse). **Rim centre (40, 14)** = world `(rimX, rimY)`. Bottom of the basket at y ≈ 56 (rests on the shell top). |
| `basket_front.svg` | 0 0 80 60 | same | ONLY the front half of the rim + front weave (transparent elsewhere), drawn OVER items inside the basket. |
| `star_yellow.svg`, `star_pink.svg`, `star_blue.svg` | 0 0 48 48 | 32 | 5-point rounded "puffy" star, centre (24,24), cute simple face (dot eyes, tiny smile), one highlight. Code spins/sways them. |
| `star_gold.svg` | 0 0 64 64 | 44 | centre (32,32). Bigger gold star with a white-cream halo ring and 4 tiny sparkle points around; reads instantly as special. |
| `thunder.svg`, `thunder_2.svg` | 0 0 64 56 | 46 × 40 | centre (32,28). Small grumpy-cute storm cloud (slate/indigo, lighter top highlight), pouty brows, a short yellow zigzag below; 2 = cheeks puffed / zigzag the other way (animation frame). |
| `heart_full.svg`, `heart_empty.svg` | 0 0 48 48 | 28 | HUD |
| `jar.svg` | 0 0 64 72 | 46 × 52 | glass star jar with a cork; code draws the fill bar beside it |
| `rocket.svg` | 0 0 48 48 | 28 | small jetpack/rocket icon for the Jet Hop meter / touch button |
| `windsock.svg` | 0 0 64 48 | 46 × 34 | striped windsock on a pole (pole at x≈6), pointing **right**; code mirrors and stretches it by wind strength |
| `icon.svg` | 0 0 256 256 | app icon | Shelly + basket + a gold star on a round sky-blue badge with a little cloud; readable at 32 px |

### 4.2 Weather levels (environment artist) — `zones/<sunny|rain|wind|snow>/`
| File | viewBox | Use |
|---|---|---|
| `sky.svg` | 0 0 960 540 | **opaque**: sky gradient + far horizon (distant cloud sea). sunny = clear blue + soft sun top-left; rain = lavender-grey; wind = peach → teal; snow = twilight violet with a few stars. Keep y 280–480 calm and mid-toned. |
| `castle.svg` | 0 0 960 540 | transparent: far cloud islands with original cloud-castle towers, a rainbow bridge (sunny), drippy rain-cloud islands (rain), little windmills + flags (wind; the code does not animate them, draw blades static), snow-capped towers + lit windows (snow). Bottoms rest behind the cloud floor (y ≈ 470). Low contrast, nothing that looks like a star or thunder puff. |
| `clouds.svg` | 0 0 960 220 | transparent, **horizontally tileable** soft wispy cloud strip, drawn at y 120, drifting (parallax 6 px/s, wind level: follows the wind). No outlines. |
| `bank.svg` | 0 0 960 150 | transparent, **horizontally tileable** cloud bank across the top: solid soft cloud from y 0 down to a fluffy bottom edge at y ≈ 90–110. Lighter, low contrast (the HUD sits on it); rain = greyer, snow = blue-white with snow on it. |
| `ground.svg` | 0 0 960 540 | transparent above the floor: the fluffy cloud floor, top edge ≈ y 468–500 (avg 492), with a few soft bumps; snow = icy, sparkly; rain = with small shiny puddles. Low detail directly under Shelly's band. |

`zones/palette.json` = `{ "sunny": { "banner": "#…", "accent": "#…", "hud": "#…", "sky": "#…" }, "rain": {…}, "wind": {…}, "snow": {…} }` (banner colour, accent, HUD pill background that reads on that sky, average sky colour for letterbox fill).

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, soft transparent edges)
`sparkle.svg` (4-point twinkle), `twinkle.svg` (small soft star glint, used for peeks and trails), `puff.svg` (soft white jet/smoke puff), `rain.svg` (one elongated raindrop), `splash.svg` (small crown splash), `snowflake.svg`, `streak.svg` (horizontal white wind wisp, 32×12 look inside the 32 box), `petal.svg` (pastel petal blown by the wind), `zap.svg` (small yellow zigzag spark), `mote.svg` (soft sunny dust mote).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` `extras.js` **[integration]**

### 5.1 `SC.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
```js
SC.CONFIG = { ... }                  // all tunables with units + rationale comments
SC.DIFFICULTY = { easy:{...}, normal:{}, hard:{...} }   // overrides of CONFIG keys
SC.ZONES = ['sunny','rain','wind','snow'];
const w = new SC.World({ seed, config });   // config overrides SC.CONFIG
w.reset(seed?);     // level 0 (sunny), score 0, full hearts, state 'ready'
w.startLevel(i);    // zone = i % 4, lap = floor(i / 4); clears items, keeps score/hearts/streak
w.levelInfo(i);     // { zone, lap, jarTarget, ... } for UI
w.setMove(mx);      // keyboard axis −1..1 (call every frame; 0 = none)
w.setTarget(x);     // pointer-follow target x in logical coords, or null
w.setPlayRange(xMin, xMax);   // mobile: visible floor; items only drop where Shelly can reach; re-aims peeking items
w.action();         // Jet Hop if charged and not already airborne
w.update(dt); w.drainEvents(); w.snapshot();
// state
w.state            // 'ready' (~1.4 s intro, no drops) | 'playing' | 'cleared' (~2.2 s celebration) | 'dead'
w.level, w.zone /*0..3*/, w.lap, w.time, w.levelTime
w.score, w.hearts, w.heartsMax, w.combo, w.mult /*1..3*/, w.bestCombo
w.jar, w.jarTarget, w.starsTotal, w.goldTotal, w.zaps, w.missed, w.puffsPopped
w.jet   { charge /*0..1*/, air /*bool*/, cooldown /*s*/ }
w.wind  { x /*current horizontal accel on stars, px/s², signed*/, target, warn /*s of telegraph left, 0 = none*/, nextDir /*-1|1*/, t }
w.snail { x, y, vx, vy, hop /*px above hover line ≥0*/, tilt /*rad*/, face /*1 right | -1 left*/, frame /*'idle'|'happy'|'zap'|'jet'*/,
          invuln /*s*/, squash /*0..1 catch squish*/, sway /*basket offset px*/, rimX, rimY, flame /*0..1 jet strength*/ }
w.items [{ id, kind /*'star'|'gold'|'puff'*/, color /*0 yellow|1 pink|2 blue (stars)*/, value, x, y, vx, vy, rot, spin, sway /*flutter phase*/,
           r, state /*'peek'|'fall'|'caught'|'ground'|'pop'*/, t /*time in state*/, alpha }]
w.cfg;  // plus `_px,_py` on snail and items, saved at the start of each fixed step (render interpolation)
```
**Events:** `start`, `zone {zone, level}` (each level start incl. 0), `peek {id, kind, x}`, `drop {id, kind, x}`, `catch {x, y, kind, value, points, combo, mult}`, `multup {mult}`, `miss {x, y}` (star reached the floor; streak reset if combo > 0), `zap {x, y, hearts}`, `puffland {x, y}` (thunder puff popped on the floor), `jet {x}`, `jetland {x}`, `jetcharged`, `gust {dir, strength}` (wind changes, after its telegraph), `gustwarn {dir}`, `jarfull`, `cleared {bonus, level}`, `dead {score}`.

**Rules / feel** (the mechanics engineer picks the numbers, with rationale, in `CONFIG`):
- Shelly: acceleration toward input (keys: accel ≈ 2400 px/s², max ≈ 380 px/s; pointer-follow: critically damped approach with a speed cap, stops within ~3 px, no big overshoot). Snow: grip much lower (accel and braking ×≈0.35, she slides; max speed same) — still controllable. Wind: a small push on Shelly (≤ 15 % of her max speed). Tilt eases toward the motion (max ±0.22 rad). `face` follows vx with a dead zone. Bob = render only.
- **Jet Hop:** `action()` with `charge ≥ 1` and on the hover line → `vy = −jetImpulse`, gravity `jetG` (hop apex ≈ 100 px, air time ≈ 0.7 s), sideways max speed ×1.35 while airborne, lands with a soft squash (`jetland`). `charge` refills over `jetRecharge` s (≈ 2.5 s normal, 2.0 easy) starting at landing. The rim follows Shelly (`rimY = y − 46`), so a hop catches stars earlier.
- **Drops:** a drop scheduler per zone emits items every `dropGap` s (zone- and lap-dependent; e.g. sunny 1.5 s → snow 1.1 s, never two peeks closer than ~150 px within 0.5 s unless reachable). Each item first **peeks** for `peekTime` (≈ 0.6 s; Easy 0.8 s) at its drop x in [80, 880] ∩ play range, then falls.
- **Fall physics:** `vy += (g − drag·vy) h` (terminal speed `g/drag`), stars ≈ 150–190 px/s terminal (readable: ~2.2 s to the rim on sunny), gold ≈ 1.5× faster, puffs ≈ 0.6× slower with a bobbing drift. Flutter: a sideways sway `sin(phase)·A` on x (small, stars A ≈ 10 px, snow ×1.8). Spin: stars rotate slowly; gold spins faster. Rain: stars' terminal speed ×1.15. **Wind:** `vx += (wind.x − vx·dragX) h` for stars (gold less: heavier, puffs more), so gusts carry them sideways but they stay inside the play range (bounce softly off the side limits). Gusts: every 5–8 s, a `gustwarn` telegraph of ≈ 1.2 s (streaks + windsock turn), then `gust` with a new signed target, eased in over ≈ 0.6 s. The very first gust only after 4 s of play.
- **Catch test:** a falling item whose y crosses `rimY` going down within `catchHalfW + r·0.5` of `rimX` → state `'caught'` (sinks into the basket over 0.25 s, then removed). Items that reach the floor: stars bounce once softly, then fade over 0.6 s (`miss`), puffs pop (`puffland`).
- **Scoring:** star = 10 × mult, gold = 50 × mult. Streak +1 per star/gold; `mult` from thresholds `[0, 8, 20]` → ×1..×3 (`multup`). Star missed → combo 0, mult 1. Thunder puff caught → `zap`: hearts −1, combo 0, `invuln` ≈ 1.2 s (puffs caught during invuln pop harmlessly), frame `'zap'`. Hearts 0 → `'dead'`.
- **Mix (normal):** gold ≈ 8 % of stars (at least one gold per level guaranteed by mid-level). Thunder puffs: sunny 0 % in the first 20 s then ≈ 8 %; rain ≈ 16 %; wind ≈ 14 %; snow ≈ 18 %. Lap ≥ 1: +8 % fall speed per lap and slightly more puffs, capped. Never drop a puff where it can only be avoided by giving up a star that peeked at the same moment right next to it.
- **Jar:** each caught star/gold +1. Targets 18/22/26/30 (easy 12/15/18/21, hard 22/26/30/34). Jar full → `jarfull`, drops stop, falling puffs pop, remaining stars still catchable for 1 s, state `'cleared'` (bonus = hearts × 100, `cleared`), next level after ≈ 2.2 s.
- Level 1 (sunny) on Normal must be very winnable for a 6-year-old; on Easy for a 4-year-old.

### 5.2 `SC.Weather` — `new SC.Weather({width, height, seed})`
`setZone(z, {instant})` (alias `setSeason`), `update(dt, {wind, snail, world})`, `burst(kind, x, y, n)` (kind `'sparkle'|'twinkle'|'zap'|'puff'|'splash'|'confetti'`), `jet(x, y, strength)` (jet puffs from the nozzle, inherit Shelly's velocity a little, drift down/back, grow and fade), `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?}`, `ambient {tint, fog}`. Sprites from §4.3 (names without `.svg`) + `'dot'` + `'confetti'` (renderer draws a small rect in `color`).
Sunny: motes + slow sparkles in the back, rare. Rain: raindrops in 2 depth layers (back thin/slow-looking, front bigger), slight slant, splashes on the floor (y ≈ 488–496). Wind: streaks and petals that follow `wind.x` (more while a gust is strong). Snow: snowflakes in 3 depth layers (size/speed/alpha by depth) with pendulum drift; follow the wind a little. Bounded particle counts (< 180 total).

### 5.3 `SC.Bot` — `new SC.Bot(world, {skill, seed})`, `bot.step(dt)` drives `setMove`/`setTarget`/`action`: predicts each falling item's crossing of `rimY` (incl. drag, sway and current wind), picks the best reachable plan (value, streak, time), avoids puff crossings, uses Jet Hop when a star would otherwise be blown away or is reachable only early; skill < 1 adds reaction delay + aim noise. `bot.stats`. Skill 1 clears the first loop on Normal; the title demo uses skill 0.8.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.SC.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i) }`.

## 6. Customisation slots
`hero` (Shelly, all frames; procedural bob/squash/tilt + code-drawn jet flame keep it alive), `star` (all three colours use it as a round sticker with a coloured ring; gold adds the gold halo), `puff` (both frames; code adds the zigzag), `bg_sunny|bg_rain|bg_wind|bg_snow` (replaces sky + castle + clouds; the bank and floor stay). Same storage/processing rules as the sister games (characters ≤ 512 px WebP, backgrounds ≤ 1280×720 JPEG 0.85, round-sticker crop for opaque photos).

## 7. Performance rules (from day one)
Pixel-exact full-screen layer blits, render interpolation, pre-warm the next zone in idle time, backing store capped + adaptive quality + debounced resize, cached gradients, no per-frame allocations in hot loops where easy.

## 8. Mobile (v1.1, iPhone / iPad)
Same platform layer as the education games (`.claude/skills/build-education-game/SKILL.md`, "Mobile translation"), adapted to a side-view scene:
- **Layout:** the canvas fills the screen. Logical size: landscape ≥ 16:9 is 540 tall and up to 1280 wide; otherwise landscape is 960 wide and up to 960 tall; portrait is 560 wide (720 when aspect ≥ 0.6) and up to 1600 tall. Beyond these limits it letter-boxes.
- **Scene placement:** the 960×540 scene sits at `(SX, SY) = ((VW-960)/2, VH-540)`.
  - The sky layer is extended into one cached device-pixel canvas per zone: averaged side columns, an averaged top strip, and stars at night.
  - Cloud strips tile across the full width, and stack in portrait.
  - The ground is mirrored to the sides.
  - A custom background in portrait fits the sky band and fades out at its bottom edge.
- **Safe areas:** read from `#safeProbe` (`env(safe-area-inset-*)`). The HUD is inset; `World.setPlayRange(xMin, xMax)` is called with the visible cloud floor minus 50 px, and stops short of the corner 🚀 button. The 🚀 button sits in the sky when `SY ≥ 150`, otherwise bottom-right, and is ≥ 66 CSS px.
- **Input:** Pointer Events. One steering finger with pointer capture. A second finger triggers Jet Hop. UI buttons fire on touch `pointerup`, and the ghost click that follows is swallowed. Rotating or resizing releases the steering finger.
- **iOS:** the audio unlock (resume + a silent buffer) happens in the first `touchend`. `visibilitychange` pauses the game and suspends audio. Kid-proofing blocks gesture zoom, double-tap zoom, `touchmove` (except inside panels) and long-press callouts.
- **Home screen:** `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
- **Backing store:** capped at 3.2 MP on touch devices and 1920×1080 on desktop.
