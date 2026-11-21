# Bristle's Moon Pop — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.MP`**. Storage prefix **`hmp:`**. Classic scripts, no build step.
The integration code (storage, assets, audio, render, ui, main, mobile layer, Go wrapper, tests) is adapted from the sister
side-view game `projects/daily-game/snail-cloud-catch` (copied here and renamed). The World API deliberately mirrors that
game's shape (one hero object + an `items[]` list + events) so the renderer and tests carry over; the mechanics are new.

## 1. Lessons from bubble poppers (keep / change)
| Classic bubble / balloon popper | Bristle's Moon Pop |
|---|---|
| Tap a bubble anywhere on screen to pop it | You **move a hero** and pop with his spikes: skate into low bubbles, jump for high ones (a body-based popper) |
| Bubbles rise at constant speed | **Buoyancy + drag** → soft terminal rise speed, a wobble sway, a squash-wobble of the film; magnet pulls bend the path |
| Every pop is worth the same | **Height tiers** (low ×1, mid ×2, sky ×3) + an **air chain** (each pop in the air bounces you up again) + streak multiplier |
| Missing a bubble = lose a life | An escaped bubble only ends the streak; only a **moon pebble bonk** costs a heart |
| Power-ups are random screen clears | **Magnet bubble** (the twist): for 7 s nearby bubbles are pulled to Bristle (visible field ring + spark lines) |
| Same feel every level | **Times of day**: dawn (calm) → noon (more vents) → sunset (more pebbles, faster bubbles) → night (glowing bubbles, busiest) |

Fantasy: **skating on the Moon and doing huge floaty jumps, popping bubbles with your spikes.**

## 2. Screen & coordinates
- Logical **960 × 540**, letter-boxed (mobile: extended, see §8); y down; px; seconds. Static scene (no scrolling).
- **HUD band** y 0–64: hearts top-left, score + streak top-centre, cupcake box + magnet timer top-right under the HUD buttons.
- **Moon floor** (skate surface): flat at **y = 492** (`cfg.floorY`). Ground art top edge 486–498 (a flat skate line; craters are code sprites).
- **Escape line**: a bubble whose centre goes above **y = 60** (`cfg.escapeY`) floats away.
- **Bristle**: body centre `(hog.x, hog.y)`; on the floor `hog.y = 446` (`cfg.hogRestY`: board top at 478, wheels touch 492). x clamped to the play range (default **60 … 900**).
- **Board**: drawn under Bristle, deck centre `(hog.x, hog.y + 38)` when skating; in the air the board follows him (code-animated kick-flip).
- **Vents**: craters in the floor at `w.vents[i].x` (3–5 per level, inside the play range, ≥ 120 px apart). Bubbles emerge at `(vent.x, 470)`.
- Draw order: sky → far (moon hills, domes, planet) → drifting haze → back particles (stars, dust, shooting stars) → ground →
  vent craters → pebble shadow rings → bubbles (item sprite, then the bubble film over it) → board → Bristle → falling pebbles →
  front particles (pop droplets, wheel dust, magnet sparks) → fx (+N popups, rings, cupcake flying to the box) → HUD.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only, from generator scripts (`tools/art-characters/gen.js`, `tools/art-environment/gen.js`; Node, writing files). Web search is for inspiration only; never copy or trace; no known characters, brands or the look of any famous video-game hedgehog (Bristle is a small round chestnut-brown European-style hedgehog with a cream face, NOT blue, no sneakers, no gloves).
- Flat cartoon, rounded shapes, big friendly eyes, **one-step cel shading + one highlight**.
- Outline ≈ 3 px at drawn size, in a dark tone of the fill (never pure black). Round joins and caps.
- No `<text>`, fonts, `<script>`, `<image>`, external refs, or filters beyond a tiny blur. `width`/`height` = viewBox. Transparent background unless stated.
- Kid-friendly: nothing scary. Moon pebbles are sleepy-cute (closed sleepy eyes, tiny "z" shape allowed as a path), a bonk is "dizzy" (swirly eyes, little stars), never hurt.
- Palette mood: soft pastel space. **Bristle**: chestnut/cocoa spikes (#8a5a3c family) with lighter tips, cream-peach face and belly, a dark-brown button nose, rosy cheeks, a small **mint-teal scarf** whose end flutters (code adds no cloth sim; draw it short). **Board**: coral-red deck (#e8604c family) with a cream stripe, **mint wheels**. **Cupcakes**: three frosting colours — pink, mint, lemon — on a brown/peach paper cup with a cherry on top; small cute face on the cup allowed. **Bubble film**: almost transparent, white rim with a pastel iridescent (pink→cyan→lemon) edge and a big curved highlight; must read on BOTH light (noon) and dark (night) skies → the rim has a faint darker outer line (#5b6aa0 at 35 %). **Magnet**: red horseshoe with silver tips. **Pebble**: lilac-grey rock with darker craters spots.
- Backgrounds: lower saturation and contrast in the play band (y 250–480) so Bristle, bubbles and pebbles always win; avoid large flat chestnut, coral, pink-frosting or lilac-grey areas there. The floor is a pale moon-grey with a lilac (dawn/noon), warm (sunset) or blue (night) cast.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `bristle_skate.svg`, `bristle_push.svg`, `bristle_jump.svg`, `bristle_happy.svg`, `bristle_bonk.svg` | 0 0 120 100 | 96 × 80 | body centre **(60, 54)** (= world `hog.x, hog.y`), **feet line y = 94** (stands on the board; board drawn separately). Side view facing **right** (renderer mirrors). Round body, spikes on the back/top (left side), face on the right. Body + spike geometry identical across frames; only eyes/mouth/arms/feet change. skate = calm smile, both feet on the board; push = back (left) foot lowered below the feet line to y ≈ 100 pushing; jump = excited open smile, arms up; happy = ^^ eyes, big smile; bonk = swirly dizzy eyes, wobbly mouth. |
| `bristle_ball.svg` | 0 0 100 100 | 76 | centre **(50, 50)**: Bristle curled into a round spiky ball (spikes all around, a peek of cream face + one happy eye + nose so he is still recognisable). The renderer spins it. Spikes = rounded triangles, chunky (not needle-sharp). |
| `board.svg` | 0 0 120 40 | 96 × 32 | side-view skateboard, deck top centre **(60, 10)**, deck kicked up at both ends, two mint wheels with bottoms at **y = 38**. |
| `bubble.svg` | 0 0 80 80 | 60 (r 30) | centre (40,40), circle r ≈ 37. Film: transparent centre (fill white ≤ 8 % alpha), iridescent rim stroke, a big curved highlight top-left, a tiny glint bottom-right. Drawn OVER the item. |
| `cupcake_pink.svg`, `cupcake_mint.svg`, `cupcake_lemon.svg` | 0 0 48 48 | 36 | centre (24, 26). Same shape, only frosting colour differs (+ sprinkles). |
| `magnet.svg` | 0 0 48 48 | 34 | centre (24,24). Red horseshoe magnet, opening down, silver tips, 2 small spark lines. Also used as the HUD magnet icon. |
| `pebble.svg`, `pebble_2.svg` | 0 0 56 56 | 40 | centre (28,28). Sleepy-cute lilac-grey moon pebble; frame 2 = slightly different eyelid / tiny "z" — an animation pair. |
| `crater.svg` | 0 0 120 40 | 96 × 32 | a vent crater seen from the side-front: raised rim ellipse, darker inside, **mouth centre (60, 16)**; bottom edge at y ≈ 34 sits on the floor line (renderer draws it at floor y − 22). Neutral moon grey (renderer tints a little per zone). |
| `heart_full.svg`, `heart_empty.svg` | 0 0 48 48 | 28 | HUD |
| `box.svg` | 0 0 64 56 | 46 × 40 | open bakery cupcake box (pastel pink with a little window), code draws a fill bar beside it |
| `jump.svg` | 0 0 48 48 | 28 | jump icon for the touch button: a chunky up-arrow with a little sparkle |
| `icon.svg` | 0 0 256 256 | app icon | Bristle (ball or skating) + a bubble with a cupcake on a round dark-blue starry badge with a little crescent; readable at 32 px; opaque full-bleed background allowed. |

### 4.2 Times of day (environment artist) — `zones/<dawn|noon|sunset|night>/`
| File | viewBox | Use |
|---|---|---|
| `sky.svg` | 0 0 960 540 | **opaque**: sky gradient (+ stars where suitable). dawn = peach-pink → lilac with fading stars and the **Earth rising** (blue-green planet, original shapes) low left; noon = pale lilac-blue, small white sun top-right; sunset = orange → violet, a big **ringed planet**; night = deep blue starfield with a soft milky band. Keep y 250–480 calm and mid-toned. |
| `far.svg` | 0 0 960 540 | transparent: distant moon hills / crater ridges with soft round shapes; a cute **moon bakery** base (domes, a little chimney shaped like a cupcake, antenna) somewhere left or right (lit windows at night); low contrast. Bottoms rest behind the floor (y ≈ 495). Nothing that looks like a bubble, cupcake or pebble. |
| `haze.svg` | 0 0 960 220 | transparent, **horizontally tileable** faint nebula/dust haze strip, drawn at y 140, drifting (6 px/s). No outlines, very low alpha. |
| `ground.svg` | 0 0 960 540 | transparent above the floor: the Moon floor, **flat top edge at y 488–494** (it is the skate surface; a slightly lighter lip line), regolith texture with tiny craters BELOW y 500 only, bottom fills to 540. Low detail directly under the hero band. |

`zones/palette.json` = `{ "dawn": { "banner": "#…", "accent": "#…", "hud": "#…", "sky": "#…", "skyTop": "#…", "tint": "#…" }, "noon": {…}, "sunset": {…}, "night": {…} }` (banner colour, accent, HUD pill background that reads on that sky, average sky colour for letterbox fill, top-of-sky colour for extending upward in portrait, crater tint).

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, soft transparent edges)
`sparkle.svg` (4-point twinkle), `twinkle.svg` (small soft star glint), `dust.svg` (soft moon-dust puff), `droplet.svg` (bubble droplet, iridescent), `mote.svg` (soft glowing dust mote), `shoot.svg` (shooting-star streak pointing right, 32×10 look), `spark.svg` (small magnet spark, red-white), `star.svg` (small yellow dizzy star, 5 points), `crumb.svg` (pastel sprinkle).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` `extras.js` **[integration]**

### 5.1 `MP.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
```js
MP.CONFIG = { ... }                  // all tunables with units + rationale comments (step, floorY, hogRestY, escapeY, ...)
MP.DIFFICULTY = { easy:{...}, normal:{}, hard:{...} }   // overrides of CONFIG keys
MP.ZONES = ['dawn','noon','sunset','night'];
const w = new MP.World({ seed, config });   // config overrides MP.CONFIG
w.reset(seed?);     // level 0 (dawn), score 0, full hearts, state 'ready'
w.startLevel(i);    // zone = i % 4, lap = floor(i / 4); clears items, picks vents, keeps score/hearts/streak
w.levelInfo(i);     // { zone, lap, boxTarget, vents, ... } for UI
w.setMove(mx);      // keyboard axis −1..1 (call every frame; 0 = none)
w.setTarget(x);     // pointer-follow target x in logical coords, or null
w.setPlayRange(xMin, xMax);   // mobile: visible floor; vents are re-placed inside it (bubbles in flight are clamped softly)
w.action();         // Jump: buffered ≈ 0.12 s; jumps if on the floor (coyote ≈ 0.08 s)
w.update(dt); w.drainEvents(); w.snapshot();
// state
w.state            // 'ready' (~1.4 s intro, no spawns) | 'playing' | 'cleared' (~2.2 s celebration) | 'dead'
w.level, w.zone /*0..3*/, w.lap, w.time, w.levelTime
w.score, w.hearts, w.heartsMax, w.combo, w.mult /*1..3*/, w.bestCombo, w.chain /*pops in the current jump*/, w.bestChain
w.box, w.boxTarget, w.popsTotal, w.airPops, w.skyPops, w.bonks, w.escaped, w.magnets
w.magnet { t /*s left, 0 = off*/, dur /*s, for the HUD ring*/, r /*pull radius px*/ }
w.vents [{ x, puff /*0..1 telegraph glow*/, cool /*s*/ }]
w.hog { x, y, vx, vy, air /*bool*/, lift /*px above rest ≥0*/, tilt /*rad*/, face /*1 | -1*/,
        frame /*'skate'|'push'|'jump'|'ball'|'happy'|'bonk'*/, spin /*rad, ball rotation*/, curl /*0..1*/,
        invuln /*s*/, squash /*0..1 landing/pop squish*/, board { x, y, rot } /*deck centre + rotation*/, wheel /*rad*/ }
w.items [{ id, kind /*'cupcake'|'magnet'|'pebble'*/, color /*0 pink|1 mint|2 lemon (cupcakes)*/, x, y, vx, vy, r,
           wob /*film wobble phase*/, squish /*0..1*/, rot, spin, vent /*index or -1*/,
           state /*'puff'(telegraph at the vent)|'rise'|'pop'|'escape'|'fall'(pebble)|'land'(pebble on floor)*/, t /*s in state*/, alpha }]
w.cfg;  // plus `_px,_py` on hog, board and items, saved at the start of each fixed step (render interpolation)
```
**Events:** `start`, `zone {zone, level}` (each level start incl. 0), `puff {id, kind, x}` (vent telegraph starts), `emerge {id, kind, x}`,
`pop {id, x, y, kind, color, tier /*1|2|3*/, points, combo, mult, chain, air}`, `multup {mult}`, `chain {n, x, y}` (n ≥ 2),
`escape {x, y}` (streak reset if combo > 0), `magnet {dur}` (magnet bubble popped), `magnetend`, `pebblewarn {id, x}`,
`bonk {x, y, hearts}`, `pebbleland {x, y}`, `jump {x}`, `land {x, vy}`, `boxfull`, `cleared {bonus, level}`, `dead {score}`.

**Rules / feel** (the mechanics engineer picks the numbers, with rationale, in `CONFIG`):
- **Skating:** acceleration toward input (keys ≈ 1900 px/s², max ≈ 380 px/s; pointer-follow: critically damped approach with a speed cap, stops within ~4 px, little overshoot) and **low friction** (coasts ~0.25 s when released — it's a skateboard on the Moon, but still precise enough for a 6-year-old). Air control ×0.6. Tilt eases toward the motion (max ±0.2 rad). `face` follows vx with a dead zone. `frame` 'push' alternates with 'skate' while accelerating on the floor. `wheel` rotates by distance / wheel radius (5 px).
- **Jump:** `vy = −jumpV`, Moon gravity `g` (apex ≈ 200 px above rest, air ≈ 1.4 s; e.g. g ≈ 820 px/s², jumpV ≈ 575 px/s). After ≈ 0.1 s in the air `curl` eases to 1 and frame 'ball' (spinning `spin` in the facing direction, ≈ 2.2 turns/s). Landing: soft squash, `land` event, the board catches him (board follows with a small lag + kick-flip rotation during the air time, back to flat at landing). A soft ceiling: hog.y ≥ 110.
- **Pop test:** a bubble (state 'rise') pops when `dist(hog, bubble) < bubble.r + hogR` (hogR ≈ 30 in the air as a ball, ≈ 28 on the floor). Pebbles never pop bubbles.
- **Tiers:** by the bubble's y at the pop: `y > 360` → tier 1 (low), `240 < y ≤ 360` → tier 2, `y ≤ 240` → tier 3 (sky) (`cfg.tierY`; raised from 200 after the playtest).
- **Air chain:** in the air each pop sets `vy = min(vy, −popBounce)` (≈ 400 px/s, so another ~100 px of hang time) and `chain += 1`; on landing `chain = 0`. Points = `10 × tier × mult + 10 × (chain − 1)` (chain bonus from the 2nd air pop on). `chain` event when n ≥ 2.
- **Streak:** combo +1 per pop (cupcake or magnet); mult from thresholds `[0, 8, 20]` → ×1..×3 (`multup`). An **escaped** cupcake bubble → combo 0, mult 1 (escaped magnets don't reset).
- **Vents & spawns:** a scheduler per zone emits bubbles every `spawnGap` s (zone/lap-dependent; dawn ≈ 1.9 s → night ≈ 1.2 s; Easy slower) from a vent not used in the last ~1 s; each first **puffs** for `puffTime` (≈ 0.8 s, Easy 1.1 s) then emerges at (vent.x, 470) with a small random sideways velocity.
- **Bubble physics:** `vy += (−buoy − drag·vy) h` → terminal rise `buoy/drag` (dawn ≈ 65 px/s, night ≈ 95 px/s, lap +6 % capped) — readable: ~6 s from the vent to the escape line on dawn. Wobble sway on x: `x += sin(wob)·A` (A ≈ 18 px/s drift amplitude), wobble phase rate ≈ 1.6 Hz. Bubbles softly repel each other (no overlap > 30 %) and bounce softly off the play-range sides. `squish` springs when bumped. Escape when y < escapeY → state 'escape' (rises + fades 0.5 s, `escape` event).
- **Magnet bubble** (the twist): about every `magnetEvery` s (≈ 22–28 s, first after ≈ 12 s of the first level; never two alive). Pop → `magnet.t = magnetDur` (7 s; Easy 9 s, Hard 6 s), `magnet` event. While on, each rising bubble within `magnetR` (≈ 300 px) is pulled toward Bristle: accel ≈ 520 px/s² × (1 − d/R)^0.5 toward him plus extra drag so they curve in, not shoot; bubbles already above him sink toward him. `magnetend` at 0.
- **Moon pebbles:** a scheduler (dawn: none in the first 20 s, then rare; noon ≈ 1 per 9 s; sunset ≈ 1 per 6 s; night ≈ 1 per 5.5 s; Easy ×0.5; lap +10 %, capped) drops a pebble from y −30 at an x in the play range, telegraphed by `pebblewarn` + a shadow ring on the floor that grows during the fall (≥ 1.3 s fall to the hero band). Fall: slow constant-ish speed (≈ 190 px/s terminal with drag, slight sway, spin). Hit test vs Bristle (circle 18 + hogR·0.8, forgiving) → `bonk`: hearts −1, combo 0, invuln 1.5 s (blink), frame 'bonk' for 0.6 s, a small knock-back. Pebbles never land closer than ~60 px to Bristle's position at spawn time + 0.4 s × his velocity **unless** he has room to dodge (a pebble is always avoidable). Land → `pebbleland`, rolls a little, fades in 0.8 s.
- **Box:** each popped cupcake +1 (magnets don't count). Targets 20/24/26/28 (easy 14/17/20/23, hard 26/30/34/38 — raised from 15–24 by the mechanics engineer so a level lasts 45–90 s; `lengthK` from settings scales them). Box full → `boxfull`, spawns stop, falling pebbles fade, bubbles still poppable 1 s, state `'cleared'` (bonus = hearts × 100), next level after ≈ 2.2 s.
- Level 1 (dawn) on Normal must be very winnable for a 6-year-old just skating (ground pops alone fill the box); on Easy for a 4-year-old.

### 5.2 `MP.Weather` — `new MP.Weather({width, height, seed})`
`setZone(z, {instant})` (alias `setSeason`), `update(dt, {hog, world})`, `burst(kind, x, y, n)` (kind `'pop'|'sparkle'|'dust'|'star'|'spark'|'confetti'|'crumb'`), `wheels(x, y, speed)` (moon-dust from the wheels when skating fast; inherits a little velocity, low-gravity arcs), `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?}`, `ambient {tint, glow /*0..1 bubble glow at night*/}`. Sprites from §4.3 (names without `.svg`) + `'dot'` + `'confetti'` (renderer draws a small rect in `color`).
Dawn: fading twinkles + slow dust motes. Noon: glittering motes. Sunset: motes + a shooting star every ~6 s. Night: twinkling stars (back), shooting stars every ~4 s, glowing motes. Pop droplets: 8–12 droplets flung outward with the bubble's velocity, Moon-gravity arcs (g ≈ 400), fade 0.6 s. Bounded particle counts (< 180 total).

### 5.3 `MP.Bot` — `new MP.Bot(world, {skill, seed})`, `bot.step(dt)` drives `setMove`/`setTarget`/`action`: predicts bubbles' rise (incl. drag, wobble and magnet pull), picks the best reachable plan (value, streak, time: skate to low ones, jump for high ones and chains, go for magnets), dodges pebble shadows; skill < 1 adds reaction delay + aim noise. `bot.stats`. Skill 1 clears the first loop on Normal; the title demo uses skill 0.8.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.MP.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i) }`. Test-URL runs (seed/level/speed/bot) don't save best scores unless `?savebest=1`.

## 6. Customisation slots
`hero` (Bristle, all frames incl. the ball; procedural bob/squash/tilt/spin keep it alive), `cupcake` (all three colours use it as a round sticker inside the bubble), `pebble` (both frames), `bg_dawn|bg_noon|bg_sunset|bg_night` (replaces sky + far + haze; the floor stays). Same storage/processing rules as the sister games (characters ≤ 512 px WebP, backgrounds ≤ 1280×720 JPEG 0.85, round-sticker crop for opaque photos).

## 7. Performance rules (from day one)
Pixel-exact full-screen layer blits, render interpolation, pre-warm the next zone in idle time, backing store capped + adaptive quality + debounced resize, cached gradients, no per-frame allocations in hot loops where easy.

## 8. Mobile (iPhone / iPad)
Same platform layer as the sister game:
- **Layout:** landscape ≥ 16:9 is 540 tall and up to 1280 wide; otherwise landscape is 960 wide and up to 960 tall; portrait is 560 wide (720 when aspect ≥ 0.6) and up to 1600 tall. The 960×540 scene sits at `(SX, SY) = ((VW-960)/2, VH-540)`; the sky is extended (cached per zone); the ground is mirrored to the sides.
- **Portrait:** bubbles escape at the *visible* top (`escapeY` stays 60 in scene coords — bubbles above the scene in portrait keep rising until y < 60, which is still on screen; the extra sky is for looks only).
- **Safe areas** from `#safeProbe`; `World.setPlayRange(xMin, xMax)` = visible floor minus 50 px, stopping short of the corner jump button (≥ 66 CSS px; in the sky when `SY ≥ 150`, else bottom-right).
- **Input:** Pointer Events; one steering finger with capture; a second finger = jump; a quick tap (< 0.2 s, < 12 px move) on the play area also jumps; UI buttons fire on touch `pointerup`, ghost clicks swallowed.
- iOS audio unlock, `visibilitychange` pause, kid-proofing, home-screen manifest + icons, backing store capped (3.2 MP touch / 1920×1080 desktop).
