# Pip's Camp Hide & Seek — Mechanics (`FC.CONFIG`, layout, motion, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (40 tests, ≈ 20 s). Sims: `node tests/sim/playtest.js [--n 40] [--drivers …] [--config '{…}']`
(1 000 sessions ≈ 2 min), `node tests/sim/hs_playtest.js [--n 16] [--ages 3,4,6] [--models …] [--jobs 4]` (child models),
`node tests/sim/determinism.js`, `node tests/sim/content_stats.js [chapters]`, `node tests/sim/hs_browser.js` (the real page in
Playwright, needs the lead's build). Reports go to `tests/sim/out/` (JSON is git-ignored).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s`; each sub-step first copies `x, y, rot → _px, _py, _prot`
  (friends, critter) and `shake → _pshake` (places). Render `p = _p + (p − _p)·w.alpha`.
- Determinism: content + layout use the world's seeded `FC.RNG`; cosmetic randomness (hop apexes, blinks) uses a second
  seeded generator (`_crng`). Same seed + same inputs on the same sub-steps → the same events, whatever the frame size
  (`tests/sim/determinism.js`: replays at 1/120 and 1/60 frames, all identical).

## 2. Public API (`FC.World`)
`new FC.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)`, `setAge(a)`, `setLang(l)`
(both apply at the next `newSession`), `newSession({lastTopics})`, `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → place id | `'empty'` | `'locked'` | `'pip'` | `'critter'` | null, `pointerMove(x, y)`,
`pointerUp(x, y)` → `'pokePip'` | null, `cancelDrag()`, `hint()` → place id | null, `talkAnswer(choiceId)` → bool,
`skipTalk()`, `resetNudges()`, `prompt()` → `{promptKey, params}` | null, `answerId()` → place id | null (phases ask / peek),
`placeHit(id)` / `pipHit()` → `{x, y (centre), w, h}` logical px, `placeById(id)`, `friendById(id)`.
Fields: `layout, hudKeep, state, phase, level, levels, topic, season (= weather), round, roundsPerLevel, ask, asks, misses,
askMisses, stars, levelStars, roundStars, talk, talkAnswered, alpha, time, stateTime, phaseTime, wind, surprise, places,
friends, pip, fire, critter, geo, met, interactive, lastTopics`.
Statics: `FC.World.logicalSize(cssW, cssH)`, `computeLayout(W, H, ins, cfg, age)`, `solvePlaces(…)`, `backOut(u, c)`,
**`FC.World.applySpots(spotsJson)`** → copies `spots.json` peekY values into `CONFIG.peekY` (main.js: call once after loading
`assets/default/spots/spots.json`; the node tests do it in `tests/unit/load.js` / `tests/sim/lib.js`).

### States and phases
`menu → intro (2.5 s) → round → roundDone → … → talk → levelDone (1.8 s) → intro (next chapter = next season) … → sessionDone`.
- `round` phases: `gather → count → ask ⇄ peek → (found → ask …) → party`; surprise `swap` sits between the 1st `found` and
  the 2nd `ask`.
- **Deviation from DESIGN**: after `party` the world is in state **`roundDone`** (phase `'leave'`) while the friends hop off to
  the right and the places shrink away (≤ 2.0 s), then the next round (`gather`) or Talk time. The `roundDone` *event* fires at
  the start of `party` (stars show while the friends dance).
- Chapter = 4 rounds; when ≥ 3 rounds are done and the chapter is > 80 s old → Talk time (`roundsPerLevel` becomes the
  rounds played so the HUD dots fill). Talk re-asks every 12 s (`talkAsk {n}`), `glowAnswer` from the 2nd re-ask.

## 3. Layout (`setViewport`, DESIGN §2)
| key | rule |
|---|---|
| `portrait`, `tall`, `scale` | H > W; H/W > 1.6 → scale 1.15 (else 1) |
| `bubble` | landscape `x = ins.left+24, y = ins.top+20, h = 122, w = min(640, W − x − ins.right − 440)`; portrait `y = ins.top + 120, h = 124, w = W − x − ins.right − 24` |
| `hud` | `x = W − ins.right − 160, y = 0, w = 160 + ins.right, h = ins.top + 96` |
| `groundY` | `H − ins.bottom − 28` (landscape) / `− 40` (portrait) |
| `pip` | `{x: ins.left + 120, y: groundY − 6 (feet), h: 230 / 250 (portrait) × scale, w: 0.66·h (hit box)}` |
| `camp` | `{x: W − ins.right − 150 (portrait − 125), y: groundY − 10, w: 200·scale}` (flames base ≈ 0.29·w above y; flame column `x ± 0.35·w`) |
| `bench[6]` | seat feet points in columns LEFT of the flame column (flames are drawn after the friends): `x = camp.x − 0.35·camp.w − 0.5·seatSize − 8 − col·gap`, `y = camp.y + 2 + dy·seatSize`; `CONFIG.seats` = [col, dy] (0, 0) (1, 0.02) (2, 0) front row, (0.5, −0.42) (1.5, −0.42) (2.5, −0.42) back row; `gap = 0.6·seatSize`, squeezed to ≥ 0.38 so no seat overlaps Pip (portrait); `seatSize = 0.55·spotW` |
| `rows` | landscape back `0.58·H` (scale 0.86), front `groundY − 150` (1); portrait back `0.47·H` (0.88), middle `min(0.62·H, (back+front)/2)` (0.94, only > 4 places), front `groundY − 300·scale` (1) |
| `field` | landscape front row `ins.left + 330 … W − ins.right − 330` (objects clear of Pip and the flame column, QA); every other row `± 0.6·w` from the safe edges (shrinks with the places) |
| `spotW`, `spotH` | 220 (age ≤ 4), 200 (5+) × scale; drawn height = 200/240·w |
| `friendSize`, `peekRise` | `0.75·spotW`, `0.42·friendSize` (front row, unshrunk; each place has its own `fs`, `peekRise`) |
| `gather` | `{y, x0, x1}` the line the friends hop to: landscape `groundY − 18`, between Pip and the fire; portrait halfway between the front row and the ground, from right of Pip to `camp.x − 0.6·camp.w`; when crowded (spacing < 0.6·size) every 2nd friend stands 0.22·size higher |
| `exitX` | `W + 0.7·friendSize` (where friends enter / leave) |

**Place geometry** (per place, set by `_placeLayout`): `w = spotW·row.scale·k`, `h = 200/240·w`, `fs = 0.75·w`,
`peekY = y − (196 − CONFIG.peekY[kind])·w/240`, `peekRise = 0.42·fs`,
`clueTop = peekY − peekRise − clueFrac·fs` (`clueFrac` = the round's clue: hat 0.2, flag / sign / badge 0.55, ears / size 0.04).
`CONFIG.peekY` (viewBox px of the 200-tall art) = **bush 52, stump 50, tent 58, rock 54, leaves 55, log 63, snowman 63,
drift 56** (= `spots.json` and `tools/art_spots.py` PEEK). QA asked for the art's median tops (bush 50, stump 46, tent 56,
rock 50, leaves 53, drift 52) so faces show; `tools/art_spots_sheet.js` measured leaks there (drift 148 px, rock 120, stump 82,
bush 59 — a cut-off head over background), so each kind was raised in 2-px steps to the lowest leak-free line (≤ 16 px, the
old baseline). History: placeholders 60/70/55/65/70/85/40/60 → artist 53/50/59/58/62/63/63/62 → now.

**Solver** (`solvePlaces`, deterministic from the round seed): splits n places over the rows in DESIGN order (landscape
2 → 0+2, 3 → 0+3, 4 → 2+2, 5 → 2+3, 6 → 3+3; portrait 2 → front, 3 → 1+0+2, 4 → 2+0+2, 5 → 2+1+2, 6 → 2+2+2, each with
fallbacks), tries every left-to-right row pattern (alternating rows first), and keeps per pair: same row `|dx| ≥ w + 24`;
different rows whose boxes overlap in y — the **peek box** (head + clue, `x ± 0.5·fs`, `clueTop … peekY`) never overlaps
another peek box nor another place's **object box** (`x ± 0.46·w`, `peekY … y`), + 8 px. Positions spread evenly, jitter
± 18 px. Then every clue is checked against `bubble`, `hud` and every `w.hudKeep` box (+ 8 px): a row that collides moves
down (iterated, rows stay ordered, the front row ≥ 20 px above the ground); if still impossible the places shrink
`k ∈ 1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58`. `w.geo = {k, split, cramped, rowsY, clueFrac}`.
Measured: every viewport in the test list × ages × 2–6 places × 4 seasons fits (`cramped` never set); age-4 rounds keep
k ≥ 0.82 everywhere (iPad portrait 4 places: 0.88); 6 places on iPad portrait 720×960: k = 0.58–0.64.
After changing `w.hudKeep` call `setViewport` again (main.js does on every resize).

**Pop height** (`place.riseMax`): a popped friend stands taller than its clue box (`ears` clue: 0.46·fs); near a keep-out it
rises only to `riseMax` so its head (pop overshoot 1.1 + take-off stretch) stays ≥ 8 px below the box. The solver reserves
room for at least 0.5·fs above the head line (`CONFIG.popRoom`), so `riseMax ≥ 0.63` (iPad portrait p10 0.63, elsewhere ≈ 1).
The found friend's jump apex is capped the same way (`capTop`): it never flies under the bubble / HUD.

**Hit test** (`_hit`, in order): peek boxes → object boxes (front row first) → Pip's box → padded place boxes
(`x ± w/2, clueTop … y` + 22 px, nearest wins) → Pip + 20 px. The centre of `placeHit(id)` always picks that place.

## 4. Round flow, timing and motion (all in `FC.CONFIG`)
| phase | what happens | numbers |
|---|---|---|
| gather | places pop in (back-out 0 → 1.12 → 1, 0.35 s, stagger 0.07 s); friends hop in from `exitX` (stagger 0.12 s, hops ≤ 440 px, apex 36–50) to the gather line and **wave** | ≥ `gatherMin` 1.0 s + 0.25 s of waving; event `gather` |
| count | Pip `cover`; `countNum` 1/2/3 at 0.3 / 1.0 / 1.7 s; from 0.35 s the friends run (stagger 0.15 s, 2 hops, 3 when > 420 px, apex 28–42) to their place, land on its peek line and **duck** (rise 1 → 0 in 0.22 s, place shake + `hideIn`) | ≥ `countTime` 2.6 s and all hidden → Pip `peek` (0.7 s), `ready`, `ask` |
| ask | idle nudges 12 s, ×1.5, ≤ 30 s (`idle {n}`; idle n ≥ 2 also hints); tap a place → `peek` | only a real peek (or the squirrel) resets the idle timer — grass, Pip (`pokePip`) and empty-place taps do not; the **3rd Pip / empty tap within an ask glows the answer** (`softTapHint`, no cooldown) |
| peek | the place opens (0 → 1 in 0.18 s, shake kick ≈ 0.1 rad, squash 0.08); after 0.06 s the friend **pops** (rise 0 → `riseMax`, back-out c = 1.7: peak ≈ 1.10×, 0.25 s) | resolves 0.31 s after the tap |
| found (right) | `found`; fire flares (`fire.power` 1, decays to 0.35 at 0.9/s); the friend **jumps** out (one ballistic arc, apex 90 px) to 0.34·w in front of the place, then hops 2–4 times (≤ 250 px, apex 40–64) to the next bench seat → `seated` + `seat` | phase lasts ≥ 0.8 s and until the jump is done, then the next `ask` |
| wrong | `wrong`; friend **boo**: wiggles (rot 0.14·sin(2π·2.4 t)·(1 − t/0.9)), looks at Pip, 0.9 s, then ducks (0.22 s) and the place closes (0.2 s); tap lock 0.8 s (1.6 s from the 2nd miss of an ask) → taps on places = `locked`; 2nd miss → `hint` always; later misses → hint with a 6 s cooldown | phase goes straight back to `ask` |
| swap (surprise) | after the 1st find two hidden friends pop (0.25 s), trade places on crossing arcs (apex 120 / 60 px, ≈ 0.6 s), duck (0.22 s); `swap {a, b, placeA, placeB}` | ≈ 1.1 s |
| party | `roundDone {stars}` (3/2/1 for 0/1/≥ 2 misses); Pip `cheer`; the **leftover** (never asked) friend pops (`reveal`) and hops to a seat; seated friends **dance** (hops in place, apex 16 px, period 0.46 s, stagger 0.12 s by seat) | ≥ 2.2 s and everybody seated + 0.3 s |
| (roundDone) | friends hop off to the right (stagger 0.08 s, hops ≤ 380 px), places shrink away | ≤ 2.0 s |

**Physics.** Every hop is a true ballistic arc with gravity `hopG = 2600 px/s²`: `apexY = min(y0, y1) − apex`,
`t1 = √(2(y0 − apexY)/g)`, `T = t1 + √(2(y1 − apexY)/g)`, `y(t) = y0 − g·t1·t + ½g t²`, x linear (the unit test checks constant
second differences). Size lerps along the path (perspective: back-row friends are 0.86×, seated 0.55·spotW). Take-off
stretch (q = −0.1), landing squash (q = +0.2) on a spring ω 22, ζ 0.32 → `sy = 1 − q, sx = 1 + 0.6 q` (min ≈ 0.80, overshoot
≈ 1.05). 0.07 s ground contact between hops. Lean on a rotation spring (ω 16, ζ 0.7) up to 0.16 rad into the hop direction.
Place shake: rotation spring ω 18, ζ 0.22, kicked so the first peak is 0.1 rad (`kickFor`), damped < 0.03 within 1 s.
Hinted place: `glow` 0 → 1 (4 s), its hidden friend lifts `rise = 0.16·glow` and bobs (`f.bob` px, 1.6 Hz) so the clue rises.
Hidden pose: feet = `peekY + max(0, size − 0.42·place.fs)·(1 − rise)`, i.e. the head top is 0.42·**fs** above the line for every
friend — a small (0.62×) friend shows 68 % of itself (eyes + ears), not a 24 px tuft (QA).

**Resize / rotation mid-round**: `setViewport` re-solves the places (same seed), then **every running motion finishes
instantly with its events** (a running friend ducks in → `hideIn`; a pop resolves → `found`/`wrong`; a found friend → its
seat → `seat`; leavers → gone) and everything snaps (`_p*` = current). Tested at count / peek / found / party / gather /
swap on 4 viewport sizes.

### Objects (renderer contract)
- `place = { id, idx, kind, x, y (bottom centre), w, h, scale, row, peekY, peekRise, clueTop, fs (friend size), open 0..1,
  shake (rad), _pshake, sx, sy, glow 0..1, found, friendId, appear 0..1, leaving }`.
- `friend = { id, animal, clue, x, y (feet), _px, _py, rot, _prot, sx, sy, scale (1 | 0.62 small), size (px), place (id while
  behind it), home (its place id), state, rise, t, wave, look −1..1, seat (−1 | 0..5), found, bob }` with
  `state ∈ enter | wave | run | duck | hidden | pop | boo | jump | hop | seated | dance | leave | gone`.
  Draw BEHIND `places[place]` and clipped to `y < peekY` while `state ∈ hidden | pop | boo | duck`; the head top is
  `y − size·sy`; `CampArt.drawClue` origin = head top, size = `size`.
- `pip = { x, y (feet), mood (idle | talk | happy | cheer | think | oops | cover | peek), moodT, blink (bool), blinkT, lookX (px), look −1..1 }`
  (main may set `mood`/`moodT`). `fire = { power 0..1, x, y }`. `critter = null | { x, y (bottom), size (0.42·spotW), t,
  state: in | up | tapped | out, rise 0..1.15 }` (draw rising from behind its bottom line; tap radius max(70, 0.7·size)).

## 5. Content (`FC.Content`, DESIGN §5.1)
`round = { topic, age, lang, roundIndex, season, surprise, seed, places:[{kind, friend, clue}], asks:[{promptKey, params, answer}] }`,
places in left-to-right order (kinds alternate between the season's two). Places per round 3: 2,2,3,3 · 4: 2,3,4,4 ·
5: 3,4,5,5 · 6–7: 4,5,6,6 (`CONFIG.placesByAge` overrides); asks = places − 1; the friend never asked pops out at the party.
`validate()` re-checks every round: at each ask exactly one STILL HIDDEN place matches and it is the answer, clues distinct,
friends distinct (except `size`), no two consecutive asks with the same value, colour rules, count-up order.
- **Colours below age 5**: clash-free sets only (blue+purple, red+green, yellow+orange, green+orange, red+orange). The
  largest clash-free set has 3 colours, so colour rounds below 5 have ≤ 3 places — and every 3-set contains yellow
  (content_stats: yellow ≈ 30 % of the answers, orange ≈ 2 %). Two equal hats could never be told apart by an ask.
- **count** (deviation, QA skew): only round 1 counts up (signs 1…n with numeral + stars; asks 1, 2, … in order; the last sign
  is the leftover); rounds 0, 2, 3 stars only (2 places: values ≥ 2 apart; 3+ places: any distinct values — 3 of 1–5 spread
  ≥ 2 apart is always 1, 3, 5). Age-4 share of "1" answers 35 % → 27 % (count-up always asks "1").
- **No repeat across rounds**: `makeRound(…, {avoid})` rejects a round whose first ask equals the previous round's last ask
  (`promptKey + params`; `p.countUp` excepted); the world passes it (reset per chapter).
- **Colours**: in half the 3-hat rounds the yellow hat is the leftover → yellow 32 % → 16 % of age-4 colour answers.
- **size**: ONE animal per round (DESIGN §5.1), big + small (scale 1 / 0.62) → always 2 places, 1 ask (i18n has only big /
  small, so a 3rd friend of the same animal could never be asked apart).
- **animals**: ears clue; from round 2 at age ≥ 4 half the asks are by sound (`p.sound`).
- **initial**: asked friends have pairwise different initials; the leftover has another initial or no word (en sheep, vi chó).
- **oddeven** (deviation): a parity ask can only be unique once per round (after it, the rest all share one parity), so a
  round has ONE `p.oddeven` ask and the other asks are sums `p.add {a, b, text}` of the badges (i18n keys exist).

## 6. Bot (`FC.Bot`) and child models
`new FC.Bot(world, {skill, seed, think: [1.0, 2.4], retry: [0.6, 1.4], critter: 0.6, poke: 0.03})`, `step(dt)` before
`world.update(dt)`; taps ONLY through `pointerDown/Up` at `placeHit()` ± a little; right with p = skill (a glowing place:
max(skill, 0.9)), else a random untried hidden place; waits out the tap lock; taps the squirrel with p 0.6; pokes Pip with
p 0.03 per ask; Talk right with p = skill. `stats {taps, right, wrong, misses, locked, empty, talks, talkRight, pokes, critter}`.
Sim models (`tests/sim/lib.js`, `hs_models.js`): typical child per age (skill 0.6–0.9, think 2.0–3.5 s at 3 … 1.0–2.0 s at 7,
8 % distraction 4–12 s at ≤ 4), slow3, tapper, spammer (6 taps/s on places / anywhere), sloppy (45 % of taps 10–70 px outside
the hit box), confused (random taps, follows a glow), absent, talkAbsent.

## 7. Playtest results (tuned values above; `tests/sim/out/playtest.md`, 1 000 sessions)
| age | typical child chapter mean / p90 | bot 0.8 chapter | typical session max | wrong / ask (typical) | ★★★ rounds (typical) |
|---|---|---|---|---|---|
| 3 | 69.8 / 78.0 s | 54.5 s | 308 s | 0.44 | 48 % |
| 4 | **79.4 / 93.0 s** | **63.4 s** | 370 s | 0.34 | 48 % |
| 5 | 88.5 / 99.9 s | 78.2 s | 390 s | 0.23 | 50 % |
| 6 | 95.7 / 104.9 s | 90.6 s | 426 s | 0.18 | 48 % |
| 7 | 90.8 / 99.6 s | 91.1 s | 402 s | 0.11 | 64 % |
All 1 000 sessions finish (random tapper included), no NaN, no stuck state; longest typical ask 21 s; deterministic.
**After the QA pass** (2026-11-03): typical chapter 68.5 / 74.9 / 89.4 / 97.0 / 92.8 s (ages 3–7), bot 0.8 at age 4 60.1 s,
typical session max 447 s; high-speed models: confused child stuck asks 0 (idle glow now reaches it), 2nd-miss glow never
swallowed, absent → pause at ≈ 123 s.
High-speed child models (age 4): watching time (gather / count / peek / found / swap / party) 45 % of play for a typical
child, asking 36 %; answers left / middle / right 33/34/33 % in 3-place rounds; back row 35 %; the 2nd-miss glow was never
swallowed; spammers get `locked` 9–17 × per ask and mostly 1-star rounds; absent child → 5th idle (≈ 124 s) → main pauses.

**Tuning log.** v1 (DESIGN numbers): typical-4 chapters 88 s, watching 50–64 % → v2: gather hops ≤ 440 px (was 330), wave
0.25 s (0.35), the party starts as soon as the last friend has jumped clear (it used to wait until seated), the leftover pops
at once, party 2.2 s (2.4), seat hops ≤ 250 px (200), leave hops ≤ 380 px (300), stagger 0.08 s (0.1) → 79 s, watching 45 %.
Layout v1 failed 6 places on iPad portrait (the middle row at 0.62·H sat on the front row at H = 960 and the side margins
did not shrink with the places) → middle row = min(0.62·H, halfway), margins 0.6·w(k), more two-row portrait splits.
