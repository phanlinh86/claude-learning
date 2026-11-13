# Bao's Bubble Sky — Mechanics (`PB.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js` (+ `bao_points.js` from character artist A, read at layout
time). Contract: `docs/DESIGN.md` §2, §5.1–5.5. Tests: `node tests/unit/run.js` (39 tests, ≈ 18 s; `node tests/unit/run.js <name part>` runs a subset). Sims (report-only, `tests/sim/`):
`node tests/sim/hs_playtest.js [--n 300] [--ages 3,4] [--models typical,kid0.3,…] [--jobs 2] [--config '{…}'] [--tag x]`
(→ `tests/sim/out/hs_<tag>.md`, exit 1 on a stuck round / stuck state / NaN / bubble off screen), `node tests/sim/content_stats.js [chapters]`,
`hs_browser.js` drives the real page in Playwright (`?bot=1`) once main.js is wired.

## 0. Deviations from DESIGN (read this first, integrator)
Nothing in DESIGN §5.2 was renamed or removed. Everything below is an **addition** or a **precision**:
1. **`round.mode` has a third value, `'countSel'`** (count rounds 1 and 3: one target among `stars` bubbles). It behaves exactly like
   `'match'` (k = 1); only the freed stars are counted before the flight. Treat `mode !== 'countPop'` as "match".
2. **n / k table**: chapter 0 round 0 (the session warm-up) is (3, 1) at every age (DESIGN "warm-up n 3, k 1"); other chapters' round 0
   use the age table. `lower` always has both cases → k = max(2, k), n = max(n, k + 2). countPop: n = max(table n, k + 1) (≤ 9);
   short countPop = (4, k 3 — or 2 when the last ask was 3). countSel: 3 bubbles in round 1 (and short), 4 in round 3, all ages.
3. **Freed things fly to the CENTRE of rainbow piece i** (`World.rainbowPoint(rainbow, k, i + 0.5)`), not its start: the arch's feet
   are under the cloud floor (cy = groundY + 30). `paint.x, y` is that point.
4. **Extra events**: `bump` (bubble collisions, for the soft wet tick), `fly` (a freed thing starts its flight), `homeBadge` (the
   badge pops), `squish` (DESIGN mentions it: same bubble again < 1 s → `repeat: true`; a bubble pressed outside play → `early: true`).
   Extra fields are listed in §6 (e.g. `round.n / k / mode`, `ask.chapterFirst`, `right.mode / rule / misses / n`, `pop.soft`,
   `away.forced / popped`, `idle.x, y`). **`ask.first` is true only in a chapter's round 0** (= `chapterFirst`): pass it straight to
   `I18N.ask(…, {first})` for the long "Look at the bubbles! Pop the RED one!" wording (there is one `ask` per round).
5. **Wind**: the world owns the deterministic `PB.WindModel` (`world.wind`, `world.gust`) and emits `gust {dir}`. On the bubbles the
   force is `wind × windK (2.5)` — with the soft home spring (ω 2.4) a raw ±60 px/s² gust would move them only 10 px; × 2.5 gives the
   visible ≈ 25–30 px sideways push the DESIGN asks for. **main.js: set `weather.windSource = world` once** so leaves / petals / snow
   move with the same gusts (without it PB.Weather runs its own copy of the model — it still looks right, just not in sync).
6. The thing's "no-no" wiggle is a separate fast spring (`wig`, ω 16, ζ 0.22) added to the slow counter-rotation (`rot0`, ω 6, ζ 0.3):
   `bubble.rot = rot0 + wig`. Render reads only `rot`.
7. The home badge shows for every freed **animal** (also age 3 `p.animal` rounds), `right.home` is set for every animal.
8. Floating is a **speed-capped** spring: the homing acceleration is capped at 650 px/s² and the speed at 560 px/s (else a bubble 600 px
   from home would rush at 1400 px/s — snappy, not floaty).
9. A surprise can also appear during the `rainbow` phase (after a fast answer); the bird/kite leave at the whoosh.
10. `initial` leaves out the rubber duck (EN "rubber duck" ≠ a duck picture), the toy car and the goldfish bowl. VI: tone marks dropped,
    the asked letter is a plain letter of the tile pool; a distractor's BASE letter (Ô → O, Đ → D) never equals it.
11. Below age 5, an **orange** target gets only ONE other colour (its only safe partners blue + purple clash with each other) — without
    this orange never appeared at age 4.
12. In countPop rounds the bird never perches (every bubble is a target): it flies across the field top.
13. Layout additions: `bao.box`, `bao.s` (h / 300), `bao.mouth`, `R` (= d / 2), `n`, `fits`, `thingSize` (= 0.62 d), `walls` (soft walls
    for centres ± r), `field.bonusX0 / bonusY1` (portrait: the bottom row right of Bao), `keep[]`, `lowKeep[]`, `safe`.
14. API additions: `targets()` → remaining target ids, `answer()` → `{bubble: id}`, `bubbleHit(id)` → `{x, y, r: hitR, own: radius}`,
    `World.computeLayout(W, H, ins, cfg, age, hudKeep, n, seed)`, `World.rainbowPoint`, `World.flight / flightAt`, `PB.WindModel`.
15. On a rotation / resize the floating bubbles take the NEAREST new home (greedy matching), not homes[i] — otherwise they cross the
    whole field and jam against each other.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of every
  sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, homes (seeded per round), the surprise round / type come from the world's seeded `PB.RNG`; cosmetic randomness
  (motion phases, detach speeds, droplets, blinks, bird side) from a second seeded generator; the wind from a third. Same seed + inputs
  on the same sub-steps → the same events (unit-tested).
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler); `World.kickFor(peak, ω, ζ)` = the initial velocity
  whose first spring peak is `peak` (every membrane / wiggle kick). Flights = quadratic Bézier, control point lifted 2 × apex (so the apex
  is ≥ 80 px above the straight line), smoothstep timing.
- The world never needs `bubble_art.js` or the DOM.

## 2. Public API (`PB.World`)
`new PB.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `pointerDown/Move/Up(x, y)`, `cancelDrag()`, `hint()` → `{bubble}` | null,
`talkAnswer(choiceId)` → bool, `prompt()` → `{promptKey, params, rule, nameKind, nameValue, k, left, mode}` while `interactive` | null,
`resetNudges()`, `skipTalk()`, `bubbleById(id)`, `targets()`, `answer()`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, roundsPerLevel, stars, levelStars, roundStars, misses, streak, talk,
talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), wind, gust, bubbles, rainbow, bao, bird, kite, snowflakes,
drops, minis, hintHand, assistId, finger, surprise`.
Test hooks (logical px): `bubbleHit(id)` → `{x, y, r: hitR, own}` (floating only), `baoHit()` → box `{x, y, w, h, cx, cy}`, `birdHit()` /
`kiteHit()` / `snowHit()` → `{x, y, r, cx, cy}` — a tappable point of the surprise that is outside every bubble's own radius and off
the speech bubble / HUD / Bao — or null, `answer()`.

**States / phases.** `menu → intro (2.5 s) → round [blow → play] → roundDone [rainbow → whoosh → out] → … → talk → levelDone (3.6 s) →
… → sessionDone`. `roundDone` (the event) = the moment the stars are known (last piece painted). `interactive` = state `round`, phase
`play`, fewer than k popped.

**Input (one active pointer; a gesture = down … up), logical px:**
- `pointerDown(x, y)` → `'bubble'` (play: judged) | `'brush'` (a bubble pressed outside play / after k: it jiggles, `squish {early}`) |
  `'bird'` | `'kite'` | `'snow'` | `'bao'` (poke fires on release, < 24 px move) | `'soft'` (nothing: mini bubbles) | null.
- Hit test: the floating bubble with the nearest CURRENT centre within `hitR`. A surprise (bird / kite / snowflake) wins only where the
  finger is outside that bubble's OWN radius (so the bubble under a perched bird is always tappable). Surprises win over Bao, Bao over
  the sky.
- **Swipe**: a press that started on nothing and slides onto a bubble (its radius + 10) within `flickTime 0.25 s` is judged on it.
- A soft press counts as "no progress" on **release** (play only) if the gesture never touched anything. A right pop resets the count.
- Assist armed: the next press anywhere in the field (± R) picks the glowing target (`assist {id, from}`), the round is ≤ 2★.

## 3. Layout (`computeLayout`, DESIGN §2) — for THIS round's bubble count n and seed
| field | landscape | portrait |
|---|---|---|
| `groundY` | H − ins.bottom − 14 | H − ins.bottom − 26 |
| `bubble` / `hud` | exactly the parade's speech bubble + HUD band (measured `hudKeep` HUD: narrower beside it, else below it) | same |
| `bao` {x, y feet, h, s = h/300} | ins.left + 130, groundY − 4, 240 | ins.left + 120, groundY − 4, 220 |
| `bao.ring / blowRing / mouth` | `PB.BAO_POINTS` (− feet) × s + (x, y); r = ringR × s | same |
| `bao.box` | x: bao.x − 0.38 h − 10 → max(bao.x + 0.42 h, ring right) + 10; y: min(bao.y − 0.94 h, ring top) − 10 → bao.y + 10 | same |
| `field` (centres) | x0 = box right + 0.55 d, x1 = W − ins.right − 0.55 d − 20, y0 = bubble bottom + 0.55 d + 16, y1 = groundY − 0.55 d − 30 | x0 = ins.left + 0.55 d + 20, x1 = W − ins.right − 0.55 d − 20, y0 = bubble bottom + 0.55 d + 20, y1 = box top − 0.5 d − 10; bonus row to y1 + 0.3 d for x ≥ box right + 0.55 d |
| `d` | ages ≤ 4: 150, 5: 138, 6+: 126; × 1.1 when tall (H/W > 1.6); −4 px steps to 112 until n fit | same |
| `homes[n]` | valid centres (10 px grid): circle r + 14 clear of the speech bubble / HUD / hudKeep and of Bao's box (≥ the ± 10 px wander + ≈ 2.5 px bob, so a resting bubble never touches them — unit-tested while floating), ≥ 44 px above the bottom keep-outs, on the safe screen; n ≥ d + 22 apart: a seeded best-of-14-candidates sample (fallback: farthest-point / a seeded square or hex lattice in tight fields, e.g. 9 at age 6 on an iPad with insets); sorted farthest-from-the-wand first (bubble i → homes[i]) | same |
| `rainbow` {cx, cy, r, w} | cx = field centre, cy = groundY + 30, r = min(0.5 (x1 − x0) + 0.4 d, groundY − bubble bottom − 30), w = clamp(0.16 r, 40, 70) | same |
| `hitR` | 0.6 d + 14; phones (long/short > 1.9): ≥ 92 | same |
| `thingSize` | 0.62 d (box height of the thing inside) | same |
Examples (age 4): 960×720 n 6 → d 150, field x 323–857, y 250–593, rainbow r 327; 1556×720 → d 150, rainbow r 524; 720×1561 (iPhone
portrait, notch) → d 165 (tall); age 6, 960×720 with insets, n 9 → d 112 on a lattice. Unit-tested on 15 viewports (1556×720 ± notch,
1280×720, 960×720 ± insets, 720×1556 notch, 720×960, iPhone 852×393 / 393×852 notch, iPad Air 820×1180 / 1180×820, iPad mini,
iPhone SE both ways, 1600×720) × 5 ages × n 3 … 9 × 3 seeds, + 400 fuzzed viewports.

## 4. `PB.CONFIG` (all tunable via `new PB.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s (after ≥ chapterMinRounds 3), **shortBudget [∞, 26, 44, 60] s** (a round starting later into the chapter is short: 4 bubbles, k 1), introTime 2.5, levelDoneTime 3.6, talkAfterAnswer 1.6, talkAskTime 12, talkGlowAfterAsks 2, talkMaxAsks 3, talkGiveUp 2 |
| floating | homing spring ω 2.4, ζ 0.55, accel cap 650 px/s², speed cap 560 px/s (hard 1500); wandering home ± 10 px Lissajous, periods 3–5 s; buoyancy bob ± 14 px/s² at 0.45–0.75 Hz; wind × 2.5 |
| collisions | contact at r_a + r_b + 6: push-apart 90 px/s² per px overlap, velocity exchange e 0.35; contact start kicks both membranes 0.0007 × approach speed (≤ 0.12) and emits `bump` (≥ 40 px/s, ≥ 0.12 s apart); soft walls 120 px/s² per px (+ damping 6) at the safe screen, the speech-bubble bottom + 6, the cloud floor − 4 and Bao's box |
| membrane / thing | wob spring ω 13, ζ 0.12, \|wob\| ≤ 0.3; thing counter-rotation `rot0` → −0.0005 × vx (≤ 0.2 rad), ω 6, ζ 0.3; wiggle ω 16, ζ 0.22 |
| blow | lead 0.5 s, 0.5 s per bubble, grow 0.35 s (r 0.3 R → R, ease-out; centre pushed out along the blow direction so the back edge stays on the ring; a 0.06 flattening), detach 380–520 px/s towards home + wob 0.22, ask 0.4 s after the last detach; rainbow guide fades in 0.5 s |
| pop | popTime 0.22 s, 14 droplets (160–340 px/s radial + 30 % of the bubble's velocity, gravity 900, life 0.6 s ± 15 %, r 4–9, cap 60) |
| freed thing | hop 46 px in 0.28 s (ease-out) with a squash 0.16 (spring ω 16 ζ 0.4); countSel: first count 0.3 s after the hop, then every 0.45 s, 0.35 s tail; animals: badge (r 0.32 thingSize, beside the thing) pops in at 6 /s, holds 0.9 s; flight 0.75 s smoothstep, apex ≥ max(80, 0.22 × chord) px, scale 1 → 0.35, spin ± 0.5 rad; paint: rainbow.filled → +1 over 0.45 s |
| wrong | squish −0.28 along the finger → centre axis, impulse 260 px/s away from the finger, wiggle 0.25 rad; same bubble < 1 s = `squish {repeat}` (no miss); brush (outside play) 0.12 / 120 px/s |
| soft / poke | 5 mini bubbles at the finger (life 0.6–1.1 s, r 5–11, rise 60 px/s², cap 40); Bao poke: 3 minis from the wand ring |
| help | hint after 2 misses (each further miss too) or 3 no-progress presses; assist after 6; hintTime 3.2 s, cooldown 6 s, hand cycle 1.6 s (taps twice, follows the bubble); idle 12 s × 1.5 up to 30 s (12, 30, 57, 87, 117 s after the ask), the 2nd idle hints |
| rainbow / whoosh / out | rainbow 1.4 s (shine 0 → 1 in 1.2 s); whoosh: up-right wind a_y = −max(600, 1.7 × the way out), a_x = 0.45 \|a_y\|, ramp 0.3 s, stagger by distance from the wand (÷ 2600, ≤ 0.45 s), drag 0.5 /s; one leftover pops softly at the top edge with p 0.5; phase ends when all left (≥ 1.0 s, ≤ 2.2 s): **measured 1.5 s median, ≤ 1.8 s, 0 forced exits on all viewports**; out 0.6 s (rainbow fades) |
| surprises | rounds [1, 2], chapters 0–2 bird / kite (rotating, random start), chapter 3 (winter) snow; appear 2–5 s after the first ask (play or rainbow phase). bird: in 1.8 s along a wave to 18 px above a non-target bubble, perch 3 s (+70 px/s² down on that bubble ≈ 12 px dip), out 1.6 s; tap → loop (r 46, 1 s) then back to perching / out; countPop: a 3.6 s pass; hit r 52. kite: in 2 s from the left to (field x0 + 30 %, field top − 0.1 d), sway 8 s (± 40 / ± 16 px, ± 0.15 rad), out 2 s up-right; tap → a 1.2 s loop; hit r 64. snow: 5 flakes (r 36 ± 15 %) from just below the speech bubble, 0.7 s apart, fall over ≈ 12 s (≥ 42 px/s) with ± 26 px sway + wind; tap → twinkle 0.5 s → 6 minis |
| wind (`PB.WindModel`) | breeze amplitude spring 6, summer 6, autumn 8, winter 10 px/s² (two slow sines); autumn gusts: first after 3–6 s, then every 6–10 s, ± 40–60, 1.5 s sin² envelope, `gust {dir}`, every floating membrane gets a 0.08 kick |
| Bao | moods idle talk happy cheer think oops blow wave giggle dance (times in `moodTime`), bounce 0.42 s, blink 2.2–5 s / 0.13 s, look −1..1 towards the finger / hand / last pop / bird / kite |

## 5. Render contract (what render.js reads; use `_p*` + `alpha` for every moving value)
- **Rainbow** (behind the bubbles): `BubbleArt.drawRainbow(ctx, w.rainbow /* has cx, cy, r, w */, w.rainbow.k, lerp(_pfilled, filled),
  {shine, alpha, guide})`. `guide` = 1 during a round (the dotted outline), `alpha` fades in during the blow and out in `out`.
- **Bubbles** (`w.bubbles[]`, skip `state` `'wait'` / `'gone'` / `'freed'`), back-to-front by `y`; growing ones drawn on the wand
  (after Bao). For each: `x, y, r, wob` interpolated; `ctx.translate(x, y)`; `BubbleArt.drawBubble(ctx, r, {wob, wobA, t: b.t, glow,
  frost: weather.ambient.frost, alpha, grow: state === 'grow' ? grow : 1, pop: state === 'pop' ? popT : 0})` — the art applies the
  ellipse stretch (`wob` along `wobA`) itself; don't scale the context as well.
- **Thing inside** (states `grow`, `float`, `away`, and `pop` when `fstate` is null — a soft pop: fade it with `1 − popT`): at (x, y),
  `rotate(rot)`, size = `layout.thingSize × r / R` (it grows with the bubble), `BubbleArt.drawThing(ctx, thing, size, {glow})`, alpha
  `b.alpha`. Never tinted by the film (draw it after the film, or the film with ≤ 16 % white).
- **Freed thing** (`fstate` ∈ `hop | count | badge | fly`, drawn after all bubbles + the bird): `translate(fx, fy) · rotate(fr) · scale(fs
  · (1 + fq), fs / (1 + fq))` → `drawThing(ctx, thing, layout.thingSize, {count: b.count})` (`count` = stars counted so far: light them
  up one by one, −1 = none). Badge (`b.badge`): `BubbleArt.drawHomeBadge(ctx, badge.home, badge.r, {alpha: badge.a})` at (badge.x,
  badge.y).
- **Drops** `w.drops[] {x, y, r, a}` → `drawDrop(ctx, x, y, r, a)`; **mini bubbles** `w.minis[] {x, y, r, a}` → `drawMiniBubble`.
- **Bird** `w.bird {x, y, flap 0..1, face ±1, state}`: `bird.svg` (flap > 0.5 → `bird_flap.svg`), anchor (60, 50) at (x, y), mirrored
  when face = −1; skip when null / `'gone'`. **Kite** `w.kite {x, y, rot, stringX, stringY, state}`: a sagging string (quadratic curve,
  control ≈ midpoint + 60 px down) from the kite's bottom (x, y + 50) to (stringX, stringY) (off-screen bottom-left), then `kite.svg`
  anchor (70, 70) at (x, y) rotated `rot` (scale ≈ 0.7). **Snowflakes** `w.snowflakes[] {x, y, r, rot, a, tw}` (state `'wait'`: skip)
  → `drawSnowflake(ctx, r × (1 + 0.3 tw), rot, a)`.
- **Hint hand**: `BubbleArt.drawHintHand(ctx, x, y, press, alpha)` (fingertip at x, y); it follows the moving bubble.
- **Bao**: feet at (`bao.x`, `bao.y`), height `bao.h` (art 300 × 300, feet anchor (150, 292), scale h / 300); frame = `bao.mood`
  (`idle` + `blink` → `bao_blink`); lift `bao.bounce × 14 px`; eyes / head towards `bao.look`. The wand film = the ring in `bao.ring`
  (= `layout.bao.blowRing` while `blow`, else `layout.bao.ring`).
- **Weather**: `weather.ambient` sky / tint / sun, `weather.clouds`, `weather.particles` (back = behind the rainbow, front = over all).

## 6. Events (`drainEvents()`; every positional event has `x, y` in logical px — unit-tested over 15 full sessions)
| event | when / fields | main.js should |
|---|---|---|
| `session` | `{levels}` | — |
| `level` | `{level, topic, weather}` chapter start (intro 2.5 s; x, y = field centre) | `weather.setWeather(weather)`, chapter banner, `weather.N` line, season music |
| `round` | `{round, topic, surprise, n, k, mode, short, key}` the blow starts | (rarely) a `blow[]` line |
| `blow` | `{i, id}` a bubble starts growing on the wand (x, y = the ring) | soft breathy noise swell |
| `bubbleIn` | `{id, i}` it detaches | little "blup" |
| `ask` | `{promptKey, params, rule, first (chapter round 0 only), chapterFirst (= first), round, n, k, mode}` (x, y = Bao's mouth) | `speakPrompt(I18N.ask(lang, promptKey, params, {first}))`, bubble text |
| `right` | `{id, thing, rule, mode, i (0-based pop index), k, left, misses, count? (countPop: i + 1), n? (countSel: stars), home? (animals)}` | pop sound; countPop: `sayCount(count)` (+ `sayCountRun` when left = 0); else `sayRight` (names the thing; `left > 0` → "One more!") |
| `pop` | `{id, r, soft}` the film ruptures (x, y = its centre) | bright click + airy splash (pitch varies); `soft` = quieter |
| `homeBadge` | `{id, home}` | small pop; the line "The penguin lives on the ice!" is part of sayRight |
| `count` | `{id, i (1-based), n}` a star counted on the freed thing (0.45 s apart) | rising pip + `sayCount(i)`; at i = n `sayCountRun(n, 'stars')` |
| `fly` | `{id, i, tx, ty}` the freed thing starts flying | swoosh (optional) |
| `paint` | `{id, i, k}` it reaches its rainbow piece (x, y = the piece) | glassy chime, pitch climbs with i; `weather.burst(x, y, {kind: 'sparkle', n: 8})` |
| `wrong` | `{id, thing, got: {nameKind, nameValue}, want: {kind, value, nameKind, promptKey, params, left}, rule, streak, misses, hint?}` | rubbery boing-wobble; `sayWrong` (names it + the goal); `hint: true` → short pointer line |
| `squish` | `{id, repeat?: true, early?: true}` | the boing only (no line) |
| `soft` | press on nothing | tiny bubbling |
| `bump` | `{a, b, v}` two bubbles touch (rate-limited) | soft wet tick (volume ∝ v) |
| `pokeBao` | `{promptKey, params, rule, left}` (play) or `{busy: true}` | giggle; in play repeat the question (protected); busy: giggle only |
| `hint` | `{id, want, idle?}` | `hint[]` line |
| `idle` | `{n, promptKey, params, rule, left}` 12 → 30 → 57 → 87 s after the ask | `idle[]` line / the question again |
| `assistArmed` / `assist` | `{id}` / `{id, from}` | — / like `right` |
| `roundDone` | `{round, stars, misses, assisted}` (x, y = the arch top) | stars fly to the HUD |
| `rainbowDone` | `{k}` (x, y = the arch top) | shimmering arpeggio, `rainbow[]` (+ `great[]` with {child} now and then), star burst |
| `whoosh` | `{n}` leftovers start leaving (x, y = the wand) | filtered noise sweep, `whoosh[]` ("Whoosh!") |
| `away` | `{id, popped?, forced?}` a leftover left the screen (`popped`: it soft-popped at the top) | — |
| `gust` | `{dir}` (autumn; x, y = field centre) | low wind swell |
| `bird` / `birdTap` | `{perch}` / — | tweet; `surprise.bird` / `bird.tap` |
| `kite` / `kiteTap` | — | flutter; `surprise.kite` / `kite.tap` |
| `snow` / `snowTap` | `{n}` / — | snow twinkle; `surprise.snow` / `snow.tap` |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars}` | as the parade | as the parade (sessionDone: Bao `dance`, party) |

## 7. Content (`PB.Content`, DESIGN §5.1)
- n / k per round: warm-up (chapter 0, round 0) (3, 1); age 3 (3,1) (4,1) (4,2) (4,2); age 4 (3,1) (5,2) (5,2) (6,3) — chapter 0: (3,1)
  (4,1) (5,2) (5,2); age 5 (4,1) (5,2) (6,2) (6,3); 6+ (5,1) (6,2) (6,2) (6,3); short (4,1). Non-target values: 1 / 2 / 3+ at ages 3 /
  4 / 5+ (≤ n − k).
- **Self-check** (`validate`, independent of the generator): n / k per table and mode, exactly k targets, every target shares the rule
  and no distractor does (an independent check per kind, e.g. sums parsed from the tile text), distinct non-target values ≤ the table,
  CVD pairs + no pink below 5, topic rules (warm-up colours = one toy; later mixed toys, different toys among the targets from age 4, a
  distractor always wears a target's toy so the toy is no cue; shapes never square/rect, circle/oval, square/diamond, heart/circle in one
  round, one colour ≤ 4 / every bubble its own colour at 5; size = one toy in one colour; countPop = n identical bubbles, k in its range;
  countSel = all different star counts, gaps ≥ 2 at ≤ 4, ≥ 1 (≥ 2 from 6) later; animals p.animal = farm animals at age 3 / round 0,
  p.home: sea k ≤ 2, ice / savanna / jungle k 1; letters never look-alike (also among the distractors); lower: both cases, no I / L, no
  b d p q / n u / m w / c o together; initial from the names; distinct tiles).
- `makeRound` retries until valid, not the same set as earlier in the chapter (`usedKeys`) and the asked value differs from the last
  round's (`prevRule`; count compares numbers across countPop / countSel; size alternates big / small; oddeven alternates; animal homes
  look ahead: farm → sea → farm when round 3 needs 3 farm animals).
- Topic pools (rotation between sessions): 3 colors shapes size animals count · 4 colors size shapes count animals · 5 colors shapes count
  letters animals · 6 letters lower initial add count · 7 count initial add sub oddeven. First session = DESIGN `AGE_TOPICS`.
- **initial** names: `PB.I18N.name(lang, 'toy'|'obj'|'animal', value)` when loaded and it returns a real name (else `PB.THING_NAMES`,
  the DESIGN §6 names); EN groups B ball · U umbrella · K kite · C cow crab · P pig penguin · S sheep · D duck · H hen horse · G goat ·
  L lion · M monkey; VI B bóng bò · D diều dê · C cừu cua · V vịt · H heo · G gà · S sư tử (ô = Ô, distractor only; ngựa / chim cánh cụt
  / khỉ never used).
- `content_stats.js 300`: 30 000 rounds, 0 invalid, 0 % repeated sets, 0 % repeated asks, 0.03–0.13 ms per round; age 4 colours now
  use all 6 colours (orange too).

## 8. Playtest numbers
`node tests/sim/hs_playtest.js --n 300 --jobs 2 --tag final`: **6 320 sessions, 0 failed, 605 s**; 1/30 s frames through the real input
API on 5 viewports (iPhone portrait / landscape with notch, iPad 4:3 with insets, iPad portrait, iPad Air landscape), EN / VI alternating.
Child models (`tests/sim/lib.js`): after an `ask` the kid listens 2.6 s (3.4 s for the chapter's long first prompt) + thinks; it decides on
a bubble NOW and the finger lands 0.15–0.35 s later at that old spot ± aim × r (bubbles drift, a late tap can miss into the sky);
kid0.3 / 0.6 / 0.9 = the age profile at that skill; slow3 = a slow, distractible 3-year-old (skill 0.6, think 2.8–6 s, aim ± 1 r);
tapper = random presses / slides anywhere; spammer = 6 presses/s on bubbles; absent = never touches; bot1 = PB.Bot skill 1.

| model | age | session min mean (p90, max) | chapter s mean [p10–p90] | cut % | round s mean [p10–p90] | blow / first pop / play s | stars 3/2/1 % | wrong / round | rounds with a hint % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 5.4 (5.7, 6.1) | 77.1 [68.1–86.1] | 0.8 | 17.2 [13.1–23.2] | 2.6 / 7.5 / 11.0 | 61.5 / 25.5 / 12.9 | 0.53 | 12.9 | 79 |
| **typical** | **4** | **5.3 (5.6, 6.0)** | **76.5 [67.9–85.7]** | 0.3 | 17.0 [13.0–22.7] | 2.9 / 6.4 / 10.5 | 74.3 / 18.9 / 6.8 | 0.34 | 6.9 | 87 |
| typical | 5 | 5.3 (5.5, 5.8) | 75.8 [68.8–83.2] | 0.1 | 16.8 [13.3–21.6] | 3.2 / 5.5 / 10.0 | 79.9 / 15.6 / 4.5 | 0.25 | 4.5 | 91 |
| typical | 6 | 5.3 (5.6, 5.8) | 76.4 [69.1–84.3] | 0.3 | 17.0 [13.9–21.8] | 3.5 / 5.3 / 9.9 | 81.3 / 15.1 / 3.6 | 0.23 | 3.6 | 93 |
| typical | 7 | 5.1 (5.3, 5.7) | 72.4 [67.0–79.0] | 0.0 | 16.0 [13.4–19.6] | 3.6 / 5.2 / 8.8 | 80.4 / 16.3 / 3.3 | 0.23 | 3.3 | 96 |
| kid0.9 | 3–7 | 5.0–5.3 (≤ 5.5) | 72–76 [65–84] | 0–0.3 | 15.8–16.9 | — | 80–86 / 12–17 / 2–3 | 0.17–0.24 | 2–3 | 79–95 |
| kid0.6 | 3–7 | 5.6–5.8 (≤ 6.0) | 80–83 [71–92] | 0–1.5 | 18.0–18.8 | — | 41–53 / 23–27 / 24–33 | 0.79–1.06 | 24–33 | 75–95 |
| kid0.3 | 3–7 | 6.1–6.2 (≤ 6.5, max 7.1) | 87–89 [78–99] | 4–12 | 20.0–20.6 | — | 19–34 / 14–18 / 51–66 | 1.5–2.1 | 52–66 | 76–95 |
| slow3 | 3 | 6.7 (7.2, 7.8) | 96.7 [84.9–111.3] | 37.3 | 23.7 [14.9–37.2] | 2.6 / 14.1 / 17.5 | 54.7 / 25.5 / 19.9 | 0.79 | 20.9 | 57 |
| slow3 | 4 | 6.7 (7.3, 8.0) | 97.4 [85.3–112.7] | 46.2 | 24.5 [15.3–38.0] | 2.7 / 13.4 / 18.3 | 60.4 / 21.5 / 18.1 | 0.71 | 19.1 | 60 |
| tapper | 3–7 | 6.2–6.4 (≤ 6.8, max 7.0) | 90–93 [81–103] | 4–22 | 20.6–22.2 | — | 18–32 / 22–28 / 46–60 | 1.6–2.1 | 66–80 (assist 44–60 % of rounds) | 79–97 |
| spammer | 3–7 | 4.7–5.1 | 67–73 | 0 | 14.7–16.1 | — | 11–29 / 15–30 / 49–73 | 1.5–2.9 (+ 17–21 squish) | 54–76 (assist 9–34 %) | 79–96 |
| perfect | 3–7 | 3.9–4.4 | 55–62 | 0 | 12.2–14.2 | 2.6–3.6 / 4.0 / 6.0–7.1 | 100 / 0 / 0 | 0 | 0 | 100 |
| bot1 | 3–7 | 3.2–3.7 | 44–53 | 0 | 9.7–11.7 | — | 100 / 0 / 0 | 0 | 0 | 100 |

- **Targets met**: typical age-4 chapter 76.5 s (p10 68, p90 86; target 60–100 s); every model's session ≤ 8 min (slow3 at age 4: p90
  7.3, max 8.0 — 46 % of its chapters end after 3 rounds by the 75 s rule, which is what keeps it there); **0 stuck rounds (> 120 s,
  longest 91.7 s: slow3), 0 stuck states, 0 NaN, 0 floating bubbles off screen, 0 "2 misses and no hint" (outside the 6 s cooldown)**
  for every model and age; 0 % repeated sets in a chapter.
- A typical round (age 4, 17 s) = blow 2.9 s (0.5 + 0.5 × n + 0.4 + detach) + play 10.5 s (listening 2.6 s + thinking → first pop at
  6.4 s after the ask; then 1–2 more pops) + flight / paint ≈ 1.5 s + rainbow 1.4 s + whoosh ≈ 1.6 s + out 0.6 s. Counting chapters are
  the slowest for older children (age 6: 82 s, k up to 8 pops), animal homes for age 4 (81 s).
- Hints: 7 % of typical age-4 rounds; 52–66 % for a 0.3-skill child (≈ every round with ≥ 2 misses). The absent child gets idle nudges
  at 16.8, 34.8, 61.8, 91.8, 121.8, 151.8 s (ask at 4.8 s: +12, +18, +27, +30, +30 …; the 2nd one also hints).
- Surprises: 25 % of rounds (one per chapter); a typical child taps 70 % of them. Bubble bumps: 0.4–4.7 per minute (gentle; most rounds
  have none — bubbles rest ≥ d + 22 apart; bumps come from detach, wrong-tap impulses and gusts).
- `shortBudget [∞, 26, 44, 60]`: short rounds (4 bubbles, k 1) are 3–5 % of typical rounds, 35–41 % for slow3; together with the 75 s
  limit they cap the slow 3-year-old's chapter p90 at ≈ 112 s.
- Whoosh: 1.5 s median, ≤ 1.8 s on iPhone portrait / landscape and iPad; every leftover leaves the screen on its own (unit-tested on 15
  sessions × viewports: 0 forced removals).
