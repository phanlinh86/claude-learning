# Comet's Gem Factory — design spec (the contract)

Every module and every agent works against this file. Names here are exact.
Namespace: `window.CGF`. Storage prefix `cgf:`. Requirement: `../REQUIREMENT.md`.

## 1. Lessons from the reference (classic Concentration / memory games, our `foxy-reef-memory`)
| Keep | Change |
|---|---|
| Grid of face-down pairs, flip two, match stays | Matched gems fly (ballistic arc) into Gizmo's hopper; the cards then pop away |
| A short peek at the start | Peek is announced ("Remember!") and scales with board size |
| A timer adds pressure | The timer is a fuel gauge; every match refuels a few seconds; Easy is very generous |
| Combo for consecutive matches | Combo multiplier ×1…×5; an unlucky first look never breaks it |
| Fast play: tapping a 3rd card closes a wrong pair at once | Same, so quick kids are never blocked |
| Each card face distinct | Every gem has its **own shape AND colour** (colour-blind safe) |

Fantasy: **a happy little rocket kitten zipping around a toy factory, feeding twin gems to a robot friend.**

## 2. Screen and coordinates
- Logical stage **960×540 px**, y down, units px and seconds. The renderer fits it with *contain* and fills the letterbox with the tileable layers.
- `FLOOR_Y = 478`: top of the factory floor / conveyor (floor strip drawn y 470–540).
- HUD band: y 0–64 (score pill left at x 16–200, fuel gauge x 300–640, combo meter x 660–850; HTML pause/sound buttons in the top-right corner x > 860).
- **Board rect** `BOARD = { x: 180, y: 76, w: 720, h: 392 }` (right of Gizmo). Cards are centred in it.
- **Gizmo** stands with feet bottom-centre at `GIZMO = { x: 92, y: 478 }`; drawn 128×176 (top at y 302). Hopper mouth (where gems land) at `HOPPER = { x: 92, y: 322 }`.
- Comet's home (idle hover) `HOME = { x: 120, y: 200 }` (above Gizmo).

## 3. Art style guide
- 100 % original SVG written by our generator scripts in `tools/art-characters/` and `tools/art-environment/` (Python, writing files). Web references are for inspiration only; never trace.
- Outline: ~4 px at drawn size (scale the stroke with the viewBox), colour = a darker shade of the fill (never pure black). Round joins and caps.
- One-step shading: flat base + one darker shadow shape + one small highlight.
- No `<text>`, fonts, `<script>`, `<image>`, heavy blur filters, or external refs. Transparent backgrounds (except `outside.svg`, opaque).
- Palette mood: candy-bright factory — teal steel, butter yellow, coral, mint, warm wood. Comet is **orange tabby + cream with a red rocket pack and yellow goggles**. Gizmo is **sky-blue + white with a coral hopper**. Card backs are **deep teal plate**, faces **cream**, so gems (saturated) pop on the face. Backgrounds are mid/low saturation so the cards always win.

## 4. Asset table (`game/assets/default/`)
Sizes = drawn size. Anchors in viewBox units.

### Characters (character artist)
| File | viewBox | Drawn | Anchors |
|---|---|---|---|
| `kitten_0.svg`, `kitten_1.svg` | 0 0 120 110 | 84×77 | Body centre (60,58) = world `comet.x,comet.y`. Faces right. Identical body; only the rocket flame differs (two flicker frames: long / short). Rocket nozzle at (24,86) (flame points down-left/back). |
| `kitten_happy.svg` | same | same | Eyes ^^ closed-happy, paws up, flame long. |
| `kitten_oops.svg` | same | same | Little "oops" face (round eyes, small o mouth, one paw at cheek). Never sad/crying. |
| `kitten_sleep.svg` | same | same | Eyes closed, curled, no flame (game over). |
| `gizmo_idle.svg`, `gizmo_eat.svg`, `gizmo_happy.svg`, `gizmo_sleep.svg` | 0 0 160 220 | 128×176 | Feet bottom-centre (80,220). Hopper (a coral funnel on the head) mouth centre (80,25). Identical body geometry; eat = hopper glowing + chomp face, happy = arms up + antenna light on, sleep = eyes closed, antenna drooped. Faces right (towards the board). |
| `gem_<kind>.svg` × 12 | 0 0 100 100 | ≤ 72×72 on a card | Centre (50,50), gem fills ~80 % of the box. Kinds (shape — colour): `heart` red, `drop` blue, `square` green, `star` yellow, `diamond` purple, `hexagon` orange, `round` pink (pearl), `triangle` teal, `moon` pale lemon/white, `clover` lime, `octagon` brown/amber, `bolt` cyan. Each faceted (2–3 facet tones + one sparkle). |
| `card_emblem.svg` | 0 0 64 64 | ~0.55 × card width | The card-back emblem: a cream paw print inside a gear ring. The renderer draws the card plates itself. |
| `icon.svg` | 0 0 256 256 | — | Comet's head with goggles and a gem, on a round butter-yellow badge. |

### Card plates (drawn procedurally by the renderer, colours fixed here)
- Back: fill `#1f8a8a`, darker inner bevel `#176b6b`, outline `#0e4f50`, 4 rivets `#bfe9e4`; emblem centred.
- Face: fill `#fff7e6`, inner panel `#ffeccc`, outline `#b07a3a`. Matched glow `#ffe066`. Keyboard highlight ring `#ff7a59`.

### Environment (environment artist)
Layers, back to front, each **horizontally tileable** and drawn pixel-exact.
| File | viewBox | Notes |
|---|---|---|
| `levels/<season>/outside.svg` | 0 0 960 540 | Opaque. Seen through the windows: sky, hills, trees, a little town. Drifts left at 6 px/s. One per season. |
| `room/wall.svg` | 0 0 1200 540 | Shared. Factory wall (warm cream/teal panels, rivets, pipes along the top y 64–90, a shelf of finished toys). **Three big transparent window openings** per tile, top half (y ≈ 96–300). Below y 300: calmer panels (behind the board). Leave space for gears at the places listed in `palette.json` → `gears`. |
| `room/floor.svg` | 0 0 600 70 | Drawn at y 470–540. A conveyor belt top strip (y 0–22 of the tile) with rollers and a wooden/steel base. The renderer scrolls it at 30 px/s. |
| `room/gear.svg` | 0 0 100 100 | Centre (50,50). Spins (renderer). Mid-tone, not distracting. |
| `room/bench.svg` | — | (Optional; the renderer draws a soft rounded bench panel behind the board.) |

Season keys: `0 spring`, `1 summer`, `2 autumn`, `3 winter`. `levels/palette.json` =
`{ "spring": {"tint":"#…","tintAlpha":0.0,"bench":"#…","accent":"#…"}, …, "gears":[{"x":…,"y":…,"r":…}, …] }` — tint is a light colour wash over the room for each season (spring fresh, summer warm, autumn amber, winter cool-evening); `gears` are positions inside the 1200-wide wall tile.

### Particles (environment artist), `particles/`
`blossom.svg` (0 0 20 20 pink petal), `sunmote.svg` (0 0 16 16 soft glow dot), `butterfly.svg` (0 0 24 20, wings open), `leaf.svg` (0 0 20 20 autumn leaf), `snowflake.svg` (0 0 24 24), `steam.svg` (0 0 64 64 soft puff), `sparkle.svg` (0 0 32 32 four-point star), `spark.svg` (0 0 12 12 tiny round bit).

## 5. Module contracts

### `rng.js` — `CGF.RNG(seed)` → `{ next(): [0,1), range(a,b), int(a,b) inclusive, pick(arr), chance(p), shuffle(arr) (in place, returns arr) }` (mulberry32).

### `world.js` — `CGF.CONFIG`, `CGF.DIFFICULTY`, `CGF.GEMS`, `CGF.LEVELS`, `CGF.World` (headless, deterministic, no DOM)
```
const w = new CGF.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0, config: {}, customGem: false });
w.reset(); w.tap(i) → bool; w.tapAt(x, y) → bool; w.moveCursor(dx, dy); w.tapCursor() → bool;
w.update(dt); w.drainEvents() → [events]; w.getState() → plain object; w.gotoLevel(i); w.cardAt(x, y) → index | -1
```
- `CGF.GEMS = ['heart','drop','square','star','diamond','hexagon','round','triangle','moon','clover','octagon','bolt']`. With `customGem: true` the kind `'custom'` replaces one gem in every level's deck.
- `CGF.LEVELS = [{cols:4,rows:3},{cols:4,rows:4},{cols:5,rows:4},{cols:6,rows:4}]` (season = level % 4).
- Fixed sub-step `CONFIG.step = 1/120`, accumulator; `w.alpha` in [0,1) for render interpolation. Comet and flyers store `prevX/prevY` (and `prevRot`) at the start of each step.
- `phase`: `'deal'` (cards slide in from the conveyor, staggered, ~1 s) → `'peek'` (all face up for `peekT` s) → `'playing'` (timer runs) → `'clear'` (board done, celebration ~2.4 s, then next level → `'deal'`) or → `'over'` (time ran out; Comet and Gizmo nap). Taps only work in `'playing'`.
- State fields:
  - `t` (s since start), `level` (0,1,2,…), `season = level % 4`, `loop = floor(level/4)`, `phaseT`, `peekT`, `timeLeft`, `timeLimit` (s, this level), `score`, `streak` (consecutive matches), `mult` (1..5 = min(5, max(1, streak))), `combo01` (meter fill 0..1 = streak/5 clamped, eased for display by the renderer), `pairs`, `pairsLeft`, `cols`, `rows`, `cursor` (card index, keyboard), `cursorOn` (true after a key was used).
  - `cards[]`: `{ id, kind, col, row, x, y, w, h, state:'down'|'up'|'matched'|'gone', flip (0 = back … 1 = face, animated), seen (bool, ever been face up after the peek), wiggleT (s left, >0 while shaking), popT (s since matched), dealT (s until it has slid in; ≤0 = in place), dealX (current x offset of the slide-in) }`. Card size: fit `cols×rows` into BOARD with gap 12, aspect w/h between 0.8 and 1.0, max h 124.
  - `comet = { x, y, prevX, prevY, vx, vy, rot, prevRot, flame, state:'fly'|'happy'|'oops'|'sleep', stateT }`: steers to a target (above the last tapped card, else HOME after 2 s idle) with a damped spring and max speed; `rot` banks with vx (≤ ±0.35 rad); `flame` 0..1 grows with thrust; happy does a little loop.
  - `gizmo = { state:'idle'|'eat'|'happy'|'sleep', stateT, eaten }`.
  - `flyers[]`: `{ id, kind, x, y, prevX, prevY, vx, vy, rot, prevRot, t, T }` — matched gems on a **ballistic arc** (gravity `CONFIG.flyG`) from the card to HOPPER in `T` s; spin while flying.
  - `stats = { flips, matches, misses, brokenMisses, levelsCleared, perfectLevels, bestStreak, timeBonus }`.
- Rules:
  - `tap(i)`: only a `'down'` card with `flip < 0.05` and no `wiggleT`, phase `'playing'`. If a wrong pair is waiting to flip back, it flips back **immediately** and the tap still counts.
  - First card → up. Second card → up; when its flip finishes (`CONFIG.flipTime` ≈ 0.22 s) the pair is judged.
  - Match: `streak++`, `mult` recomputed, `score += 10 × mult`, `timeLeft += DIFFICULTY.matchBonus`, both cards `'matched'`, two flyers launched; after `CONFIG.popTime` the cards become `'gone'`.
  - Miss: cards wiggle for `CONFIG.wiggleTime`, then flip back after `DIFFICULTY.missDelay`. If either card was `seen` before this flip → combo broken: Easy `streak -= 1`, Normal `streak -= 2`, Hard `streak = 0` (never below 0); else streak unchanged (`broke: false`).
  - `timeLeft` counts down only in `'playing'`; ≤ 0 → `'over'`.
  - Clear: `score += 5 × ceil(timeLeft)`; perfect (no broken miss this level) `+50`.
  - `timeLimit = DIFFICULTY.time[season] × loopFactor`, `loopFactor = max(0.6, 0.88^loop)`.
- `CGF.DIFFICULTY = { easy: { time:[…4], matchBonus, missDelay, peek, … }, normal: {…}, hard: {…} }` — mechanics engineer chooses starting values; level 1 Easy must be comfortably winnable by a 4–6-year-old.
- Events (objects with `type`): `deal {level, season}`, `peekStart`, `peekEnd`, `flip {id, x, y}`, `match {ids:[a,b], kind, x, y, score, mult}`, `miss {ids, broke}`, `comboUp {mult}`, `comboDown {mult}`, `flipBack {ids}`, `gemLand {kind}`, `timeBonus {s}`, `hurry` (once at 10 s left), `tick {s}` (each whole second ≤ 5), `levelClear {level, bonus, perfect}`, `levelUp {level, season}`, `gameOver {score}`.

### `weather.js` — `CGF.Weather({ width, height, seed })`
- `setLevel(season, { instant })`, `update(dt)`, `burst(kind, x, y, n)` (kind `'sparkle'|'spark'|'confetti'`), `steam(x, y)`.
- `particles[]` = `{ sprite, x, y, size, rot, flipX, alpha, layer, color? }`; `layer` ∈ `'outside'` (behind the wall: visible through the windows), `'room'` (in front of the wall, behind the board), `'front'` (over everything, sparse: bursts and confetti). `sprite` = particle file name without `.svg`, or `'confetti'` (renderer draws a small rotated rect in `color`).
- Spring: blossom petals tumbling (outside) + a few in the room. Summer: sun motes (room) + 1–2 butterflies (outside). Autumn: leaves tumbling/pendulum (outside). Winter: snow in 3 depth layers (outside). Steam puffs rise from 2 wall vents (room). Bursts: sparkles on match, confetti on level clear.
- Hard cap: 260 particles.

### `bot.js` — `CGF.Bot(world, { skill: 0..1, seed })` → `step(dt)` calls `world.tap(i)`. Memory model: each seen card is remembered with probability ~skill (and forgotten over time when skill < 1); plays known pairs first, otherwise flips an unknown card and then its known twin if it knows one. Delay between taps 0.25 s (skill 1) … 1.4 s (skill 0). Skill 1 should clear the first year on Normal; the title screen uses skill 0.8.

### Renderer, assets, audio, UI, main (integrator)
- `assets.js` loads SVGs, pre-rasterizes at render scale, custom picture slots: `hero` (Comet), `gem` (one pair), `wall`.
- `render.js`: outside → outside particles → wall (windows transparent) → gears → room particles → floor/conveyor → bench → cards (shadow, flip with scaleX = |cos(π·flip)| and a small lift) → Gizmo → flyers → Comet (+ flame) → front particles → juice (rings, "+N ×M", shake) → HUD (score, fuel gauge, combo meter) → banners ("Remember!", "Go!", "Spring done!").
- Debug view `?debug=1` outlines card rects and indices.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.
`window.CGF.debug`: `world, weather, mode, stats, getState(), setSpeed(n), tap(i), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i)`.
Modes: `title` (bot attract demo) → `playing` ⇄ `paused` → `over`.
