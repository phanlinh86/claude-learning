# Tuk's Ice Match — Mechanics (rng · content · world · weather · bot)

Owner: mechanics engineer. Contract: `DESIGN.md` §1, §2, §5.1–§5.5 (+ Dee's `../duckling-forest-memory/docs/DESIGN.md`). Every tuned
number lives in `IM.CONFIG` (`game/js/world.js`, commented) and can be overridden per world: `new IM.World({ config: { … } })`.
Content tables (the DESIGN values) are `IM.Content.PAIRS / PEEK`; the playtest-tuned values the game uses are
`IM.CONFIG.pairsByAge / peekByAge`. The renderer contract (fields, anchors, draw order) is the CONVENTIONS block at the top
of `world.js` — read it first.
Tests: `node tests/unit/run.js` (44 tests, ≈ 45 s; `node tests/unit/run.js rub` runs the tests whose name contains "rub").
Playtests: `node tests/sim/playtest.js` (2 400 sessions + verdicts), `node tests/sim/tune.js --n 4 --config '{…}' --drivers …`
(quick CONFIG comparisons), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js`.
Units: logical px (short side 720), seconds, radians, y down; rot > 0 = clockwise.

## 1. What changed versus Dee's Forest Memory (for main.js / render.js)
| Dee | Tuk | notes |
|---|---|---|
| `w.dee`, `layout.dee`, `layout.deeRect` | **`w.tuk`**, **`layout.tuk`**, **`layout.tukRect`** | the old names are aliases of the SAME objects (`w.dee === w.tuk`) |
| `w.dee {mood, moodT, lookX, lookY, hop}` | `w.tuk {…, slide, belly}` | `slide` px to the right of the feet anchor, `belly` = draw the belly-slide pose |
| card aspect 0.78 | **0.9** | blocks ≥ 120 px wide (≤ 4), ≥ 104 px (5+) |
| deal arcs from `layout.stack` | slide-in on the ice | draw `deal` blocks at `(x, y)` like any block (they start off-screen); `layout.stack` is info only |
| `flip` (3D card turn) | `flip` 0 frosted … 1 clear, `frost = 1 − flip`, **`crack`** 0..1, `melt`, `hole/holeT/holeA`, `glint`, `bob` | no scaleX turn: draw the frost overlay with `frost` and `crack` |
| `flip {id, …, open}` | `flip {…, via:'tap'|'rub', x, y}` | x, y = block centre (shard burst) |
| — | **`clink {a, b, x, y, v}`**, **`melt {id, x, y}`** (one per block, a then b), **`leap {id, k, n, x, y, color}`**, **`splash {id, k, x, y}`**, **`homeArrive {id, home, sprite, x, y}`** | |
| `shuffle {a, b}`, phase `shuffle` | **`slide {a, b}`**, phase **`slide`** | main.js: play the swap sound on `slide` |
| surprise `golden` / `pond` | **`aurora`** (event `golden` stays, now with `aurora: true`) / **`floes`** (`grid.style 'floes'`) | `w.aurora` 0..1.5 shimmer strength |
| rewards butterfly / lantern / acorns / animal / star | **fish / sculpture / fishes / animal (+ home badge) / star** | fish never perch: they dive into `layout.sea` and are removed |
| perches ground / lily / branch / air | **shore / sea / sky** | `layout.shore`, `layout.sea` new |
| `IM.World.pondLayout` | `IM.World.floesLayout` (old name kept) | |
| weather seasons, `ambient.season` | stages 0 sunny · 1 breezy · 2 rain · 3 rainbow, **`ambient.stage`**, **`ambient.rainbow`** 0..1 (`season` kept) | particles snow / streak / drop / splash / sparkle; bursts `shard`, `splash` |

## 2. API (DESIGN §5.2) — names kept from Dee so `main.js` keeps working
`setViewport(W, H, ins)`, `setAge`, `setLang`, `newSession({lastTopics})`, `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → block id or `null` (reveals happen **on touch-down**), **`pointerMove(x, y)` → id revealed by a rub or
`null`**, `pointerUp()`, `cancelDrag()` (ends a rub), `hint()`, `talkAnswer(choiceId)`, `skipTalk()`, `prompt()`.
Helpers: `cardById(id)` (= `itemById` = `blockById`), `rewardById(id)`, `cardRect(c)`, `IM.World.logicalSize / computeLayout /
chooseGrid / floesLayout / placeAt(kind, perch, cfg, n, home) / rectGap / overlapArea`.
Fields as Dee (`layout, state, phase, phaseTime, level, levels, topic, weather, round, roundsPerLevel, stars, levelStars,
roundStars, mismatches, streak, found, pairs, open, cur, talk, talkAnswered, alpha, stateTime, time, interactive, solved, wind,
cards, rewards, collected, surprise, pairsHeld`) + `tuk`, `aurora`, `finger`. States `menu → intro → round → roundDone → … →
talk → levelDone → … → sessionDone`; phases `deal → peek → hide → (slide) → play ⇄ resolve → done`.

### Events
| event | fields |
|---|---|
| `session` / `level` / `round` | `levels` / `level, topic` / `round, topic, promptKey, params {n}, pairs, held, surprise` |
| `deal` | `id` (a block starts sliding in; 0.07 s apart) |
| `peek` / `hide` / `play` | — |
| `flip` | `id, nameKind, nameValue, face, size, open, via ('tap'|'rub'), x, y` |
| `tap` | `id, nameKind, nameValue, face, size` (an up / matched block was tapped → say its name again; never from a rub) |
| `match` | as Dee + `home` (homes), `animal`, `golden`, `aurora` |
| `clink` | `a, b, x, y` (the midpoint), `v` (contact speed px/s → clink loudness) |
| `melt` | `id, x, y` — twice per pair (a, then b), `meltDelay` 0.1 s after the clink |
| `reward` | `id, kind, x, y` (the hole), `color, shape, sprite, n, text, home, golden` |
| `leap` | `id, k (1..n), n, x, y, color` — one per fish, in order k = 1, 2, … (count aloud on these) |
| `splash` | `id, k, x, y` (a fish dived into the sea) |
| `land` | `id, kind, x, y` — a reward settled (fish: after the last splash; again after a re-perch) |
| `homeArrive` | `id, home, sprite, x, y` — right after `land` of an animal that has a home badge |
| `slide` | `a, b` (slide surprise: two frosted blocks swap places) |
| `golden` | `a, b, key, x, y, aurora: true` |
| `mismatch`, `hint`, `idle`, `roundDone`, `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone` | as Dee |

Order for one colour match (unit-tested): `match → clink → melt(a) → melt(b) → reward → leap → splash → land`.

## 3. Content (DESIGN §5.1) — `IM.Content.makeRound(topic, {age, lang, rng, roundIndex, history, pairs?, peekByAge?})`
Pure and deterministic; `validate()` re-derives every pair from the faces alone (`facesMatch`) and rejects a round when a key is
not on exactly 2 blocks, a pair does not match, any block also matches another pair (ambiguity) or a colour round up to age 5
has a confusable pair. A round never repeats the previous round's face set (re-roll ≤ 40×) and prefers fresh values.

`IM.ANIMALS = bear seal fox owl whale puffin penguin hare walrus`; `IM.HOMES = {bear: den, seal: floe, fox: burrow, owl: nest,
whale: sea, puffin: cliff, penguin: pebbles}` (hare, walrus: no home → never in `homes`).
`IM.AGE_TOPICS` as DESIGN; pools (≥ 5 per age, rotation as Dee): 3 colors/animals/size/shapes/count · 4 colors/animals/shapes/
count/homes · 5 shapes/count/letters/homes/colors · 6 lower/initial/add/count/letters · 7 initial/add/sub/oddeven/count.
Difficulty order: colors, animals, size, shapes, letters, count, **homes**, lower, initial, add, sub, oddeven.

| topic | pair (key) | faces | reward |
|---|---|---|---|
| colors | same colour (`c:red`) | 2 × `color` (fish drawn in the ice) | `fish` of that colour |
| size (3) | animal big ↔ small (`z:seal`) | `animal` scale 1 / 0.6 | `animal` |
| shapes | same shape (`s:star`) | ≤ 4: each shape its colour, pair shares it; 5: pair in two colours | `sculpture` (shape, colour) |
| count | numeral ↔ that many fish (`n:3`) | `number` + `dots` (small fish, dice layout); 1–4 (3), 1–5 (4, warm-up 1–3), 1–10 (5), 1–12 | `fishes` (n) |
| animals | two identical animals (`a:owl`) | 2 × `animal` | `animal` |
| **homes** | animal ↔ its home (`h:seal`) | `animal` (nameKind `animal`) + `home` `{kind:'home', value:'floe', sprite:'home_floe'}` (nameKind `home`) | `animal` with `home` |
| letters / lower | capital / capital ↔ small | `letter` | `star` |
| initial | letter ↔ animal starting with it | `letter` + `animal` (`card.word`) | `animal` |
| add / sub | "2 + 3" ↔ 5 | `text` + `number` | `star` |
| oddeven | numeral ↔ fish dots, both parities | `number` + `dots` with `parity` | `fishes` (n) |

`pairInfo[key]` for homes: `{nameKind:'animal', nameValue:'seal', animal:'seal', home:'floe', reward:{kind:'animal', sprite, home}}`
→ the match line can say "The seal lives on the ice floe!". Homes rounds hold ≤ `HOMES_MAX` pairs (3: 3, 4: 3, 5: 4, 6–7: 5).
Talk `homes`: show the animal, `params {animal, home}`, 3 `home` choices (each with `sprite`), answer = its home.
Word lists (`IM.WORDS`): en bear B, seal S, fox F, owl O, whale W, puffin P, penguin P, hare H, walrus W (7 initials);
vi head words gấu G, hải cẩu H, cáo C, cú C, cá voi C, hải âu H, hải mã H (thỏ tuyết / chim cánh cụt / chim hải âu cổ rụt
start with th / ch digraphs: left out) → **3 vi initials, vi `initial` rounds have ≤ 3 pairs**.
Colour safety as Dee (≤ age 5: no blue+purple, red+green, yellow+orange, green+orange, no pink → ≤ 3 colour pairs). Tuk's hat
is red: colour rounds swap red blocks to slots ≥ 40 px from Tuk's box (`tukColor`, `tukColorGap`).

## 4. Layout (DESIGN §2)
As Dee (groundY, Tuk anchor = Dee's numbers, bubble, HUD, boards A/B, grid fitting, hit rect + 10 px, ties) with block aspect
0.9. New: `layout.shore = {x: ins.left, y: groundY − 10, w, h: 60}`, `layout.sea = {x: W − ins.right − 90, y: groundY + 34,
w: 120}` (open water at the right end of the snow bank, never under the HUD / bubble — tested on 12 viewports),
`layout.perches[] {x, y, kind}`: `shore` (3 rows, bottom anchors at groundY + 72 / + 40 / + 8, jittered), `sea` (the 2
rightmost front-row points: whale, seal, walrus go there first), `sky` (a jittered grid above, for stars). A reward box must be
inside the safe area − 6 px and ≥ 10 px from the bubble, HUD (`hudKeep` too), Tuk and the current grid.
Block widths, age 4 / 4 pairs: iPhone landscape 4×2 194 px (notch 178) · iPhone portrait 2×4 210 · iPad landscape 4×2 160 ·
iPad portrait 4×2 154 · 16:9 194 · iPad Pro landscape insets 167. Every grid ≥ the age minimum (unit test, 12 viewports × 2–6 pairs).

## 5. Motion (fixed 1/120 s sub-steps)
| element | model and numbers |
|---|---|
| deal | the blocks slide in as a "train": every block travels the same distance D (landscape from the left edge: D = max slot x − ins.left + w/2 + 20; portrait from below: D = H + h/2 + 20 − min slot y) with constant ice friction μ = `dealFriction` 5000 px/s²: v0 = √(2μD), s(t) = v0·t − ½μt², stops **exactly** in the slot at T = √(2D/μ) (0.55–0.8 s); far side first, 0.07 s stagger (equal D + equal profile → blocks never overlap, unit-tested); arrival bump: spring offset along the slide (v 140 px/s, ω 28, ζ 0.45 → ≈ 4 px) + squash 0.06 |
| peek / hide | as Dee (wave 0.05 s; hold `peekByAge · (0.6 + 0.1·blocks)`); the frost clears with ω 18 and grows back with **ω 10** (1 → 0.05 in 0.47 s) |
| reveal (tap / rub) | `crack` 0 → 1 in `crackTime` 0.12 s (frost holds), then `flipT` → 1 (critically damped ω 18: clear in 0.26 s). Match check at flip ≥ 0.95 (≈ 0.38 s after the touch) |
| match | hold 0.15 s, then both glide toward each other on the centre line u with **exponential ice friction** k = 2.2 /s, integrated exactly per step (v·e^(−kh), x += v(1 − e^(−kh))/k). Launch v0 = k·s + 180 px/s (s = each block's way to touching) → they touch at 180 px/s exactly when their rects meet (contact separation along u: min(w/|ux|, h/|uy|)) **centred on the midpoint**; `clink` → bounce with restitution 0.3, then friction stops them (pair centre stays exactly at the midpoint); `melt` 0.1 s later, 0.4 s: scale 1 → 0.15, alpha → 0; then `gone`, block a gets `hole` (ripple `holeT` over 1.2 s, fades 0.4 s once the reward has left) and the reward pops out at the midpoint. Glide time 0.3–1.0 s (max 2.5 s safety) |
| resize mid-glide | the pair restarts its glide from the new slots (or, after the clink, touches at the new midpoint with the new size) → always inside the board (unit test: 4 stages × 5 rotations) |
| mismatch | wobble rot = 0.07·sin(2π·3u)·(1 − u)², u = t/0.55 s; pictures stay 1.0 s (age 3: 1.2 s), frost grows back |
| idle | frosted blocks glint (`glint` ≤ 0.35 for 0.5 s every 3–6 s, phase per block, no rng) |
| fish | emerges 0.22 s (scale 0.35 → 1), then a ballistic parabola g = 1400 px/s² to a point on `layout.sea` (±0.4·sea.w), apex 120–200 px above the higher end (≥ ins.top + 40); `rot` = heading atan2(vy, vx) (face ±1 = direction); `splash` at the sea line, then the reward is removed |
| fishes | n fish (≤ 12, colours cycle), leaps 0.35 s apart (`leap.k` = 1..n in order), spread over the sea width |
| sculpture | emerges, then slides on the ice with constant friction μ 900 px/s² straight to its shore spot (v0 = √(2μd), stops exactly; small wobble), settle squash |
| animal | emerges, then 3 parabolic hops (g 2600, apex 80 / 46 / 30) to its shore spot; homes: the spot is next to its **home badge** (`r.badge {x, y, size 58, alpha}`, centre = feet + (−36, −30), fades in 0.4 s) → `land`, `homeArrive` |
| star | emerges, rises on a bezier to a sky point (T 0.9–1.8 s), twinkles ±10 % at 1.4 Hz |
| Tuk | happy hop 14 px on a match, cheer 3 hops; **belly slide** at round end: 0.25 s after `roundDone`, out 70 px with constant friction 500 px/s² (v0 = 265 px/s, 0.53 s), hold 0.25 s, back the same way (total 1.56 s ≤ roundDoneTime 1.6) |
| slide surprise | after the hide 1 swap (2 from age 5) of frosted blocks with different keys; each follows a quadratic curve bulging max(0.35·d + 30, 1.05·block size) to opposite sides with ice deceleration u = 1 − (1 − t/T)², T 1.0 s, lift ≤ 0.35; 0.15 s → play |
| aurora surprise | one secret golden pair (`cur.golden`); `w.aurora` rises to 1 over 1.2 s in that round, +0.5 for 1.5 s after the golden match |
| floes surprise | `floesLayout`: blocks 0.92× (≥ age minimum), columns on an arc, rows staggered; each floe bobs ±`grid.bobAmp` (≤ 3 px, 0.4 Hz) and drifts ±`grid.driftAmp` (≤ 2 px, 0.13 Hz) — the amplitudes shrink when the board is tight so blocks stay in the board and ≥ 14 px apart (unit test with live positions) |

## 6. Rules
As Dee: reveals count in `play` and while a mismatch shows (third-tap fast reset after 0.5 s); stars 3/2/1; hints after 3
mismatches in a row (cooldown 6 s); idle nudges 12, 30, 57, 87 … s; same-block taps ×3 → hint; adaptive hold; Talk after ≥ 3
rounds once the chapter passed **75 s**.
**Rub** (`pointerMove` while down): entering a frosted block reveals it (`flip via 'rub'`) only in `play`, with < 2 unmatched
blocks up and no mismatch showing. Each stroke (pointerDown → pointerUp) remembers what it touched: a block is never revealed
twice in one stroke (even after it froze again), rubbing over up / matched blocks says nothing (no `tap` spam), the ice between
blocks does nothing. Matched blocks gliding over the board never steal a touch (hit test prefers unmatched blocks).

## 7. Weather (`IM.Weather`, fixed 1/60 s steps, cap 120)
| stage | sky top → bottom (horizon), tint | ambient | particles |
|---|---|---|---|
| 0 sunny | `#8CCBF0 → #E8F6FC` (`#F4FAFD`) | wind 6 (+6 gusts), sun 1 | 8 + 4 sky sparkles |
| 1 breezy | `#B9B8D8 → #ECEBF4` (`#F3F1F7`), lilac .06 | wind 16 (+22 gusts, peaks > 30), sun 0.8 | 16 snow1 + 8 snow2 blowing (drift 0.9·wind) + 14 + 3 front **streaks** (150–240 px/s + 3·wind, × (0.7 + 0.9·gust), `stretch` 1.5–4, alpha 0.3 → 1 when gust > 0.6) |
| 2 rain | `#9DB2C6 → #DCE5ED` (`#E8EEF3`), grey .08, darkness 0.06 | wind 8 (+10), sun 0.25 | 40 + 6 front **drops** (520–700 px/s, slanted 1.2·wind) — every back drop hits the ice at a random y in [lakeTop, groundY] and leaves a **splash ring** (`scaleY` 0.4, 6 → 20 px in 0.3–0.4 s) |
| 3 rainbow | `#A3D8F4 → #F0F8FC` (`#FBFDFE`), pink .05 | wind 5 (+6), sun 1, **rainbow 1** | 10 + 4 sparkles, 12 gentle snow1 (22–38 px/s) |
`ambient.rainbow` crossfades with the stage (2.5 s). `burst(x, y, {kind})`: `confetti`, `puff`, `sparkle`, **`shard`** (10 ice
shards, g 1400, spin; for a frost crack), **`splash`** (8 spray drops g 1200 + a big ring; for a fish dive). Pass
`update(dt, {groundY, lakeTop})` (lakeTop = top of the lake panel). Deterministic for any dt split (unit test).

## 8. Bot (§5.4)
Memory model as Dee (each exposure remembered with p = skill, known pairs first). **Rub** (`opts.rub`, default 0.3): after
revealing a block by pointerDown it keeps the finger down and swipes (pointerMove each frame, 700–1000 px/s, straight) to a 2nd
block, then pointerUp — the remembered partner when it knows the first face, else (first face unseen) a random unseen block;
only when the straight path crosses no other frosted block (exact segment × hit-rect test). `bot.stats.rubs`. Skill 1 still
never mismatches (unit test).

## 9. Playtests and tuning
Harness `tests/sim/lib.js` (child models as Dee: typical(age), careful4, toddler, slow3, tapper, spammer + `IM.Bot` skills,
rub 0.3). Full report: `tests/sim/out/pt_tuk.md` (`node tests/sim/playtest.js --name tuk`, 2 400 sessions, 239 s wall).
Bot matrix: `node tests/sim/tune.js --n 50 --drivers bot0.3,bot0.6,bot0.9` = **6 000 sessions (1 200 per age, 400 per skill
per age)** × 2 langs × 4 viewports.

| driver / age | session mean (p90, max) | chapter mean (p10–p90) | round | mismatch / round |
|---|---|---|---|---|
| bot 0.3 · 3 / 4 / 5 / 6 / 7 | 303 / 315 / 369 / 396 / 388 s (p90 324–430, max 479) | 76 / 79 / 92 / 99 / 97 s | 15–24 s | 0.8 → 2.1 |
| bot 0.6 · 3 / 4 / 5 / 6 / 7 | 262 / 267 / 307 / 335 / 350 s (p90 ≤ 371, max 393) | 65 / 67 / 77 / 84 / 88 s | 13–18 s | 0.2 → 0.6 |
| bot 0.9 · 3 / 4 / 5 / 6 / 7 | 242 / 244 / 275 / 294 / 306 s (p90 ≤ 321, max 333) | 60 / 61 / 69 / 73 / 77 s | 11.5–15.5 s | 0.0 |
| **toddler 3 / 4** | **378 / 384 s (p90 401 / 409, max 455)** | **95 / 96 s (82–109)** | 20–21 s | 1.3 / 1.6 |
| typical 3 / **4** / 5 / 6 / 7 | 388 / **369** / 387 / 398 / 376 s (p90 ≤ 418, max 436) | 97 / **92** / 97 / 100 / 94 s | 19–22 s | 0.6–0.9 |
| careful4 3 / 4 / 5 | 410 / 408 / 438 s (p90 439 / 438 / 465) | 102 / 102 / 109 s (23 / 54 / 97 % cut to 3 rounds) | 23–31 s | 1.1–2.1 |
| slow3 3 / 4 (INFO) | 449 / 484 s (p90 498 / 530) | 112 / 121 s (88 / 99 % cut) | 31–35 s | 1.2–1.6 |
| tapper / spammer 3 → 7 | 420 → 633 / 255 → 390 s | 105 → 158 / 64 → 98 s | | |

Typical round time by topic (age 4): colours 19.0, shapes 19.7, count 19.1, **homes 19.0**, animals 19.6 s.
Verdicts (all PASS): typical 4-year-old chapter **92.2 s** (60–100) · toddler chapter **95 / 96 s** at ages 3 / 4 (60–100) ·
typical sessions max **436 s** (≤ 480) · child models at their ages (typical 3–7, careful4 3–5, toddler 3–4) session p90
**435 s** · careful 4-year-old p90 438 s · 2 400 / 2 400 + 6 000 / 6 000 finished · 0 stuck rounds / NaN / errors ·
0 / 76 153 resting-reward checks off-screen or on blocks / bubble / HUD / Tuk · smallest block 123 px, 0 grids below the age
minimum. Determinism (`determinism.js`): every case identical at 1/30, 1/60, 1/120 s frames. Absent child: 11 idle nudges in
5 min, 10 Talk re-asks in 2 min (main.js should stop speaking after the 3rd).

Tuning history (typical 4 chapter / toddler 3–4 chapter / careful4 age 5 p90): Dee's CONFIG with the new motion (deal slide
μ 4000, glide contact 150 px/s, melt 0.45, roundDone 1.8, limit 80 s) → 96 / 96–98 / 488 s (✗ > 480) → `roundDoneTime 1.6`,
`dealFriction 5000`, `glideContactV 180`, `meltTime 0.4` → 94 / 94–99 / 489 s → + `chapterTimeLimit 75` → **92 / 95–96 / 465 s**.
The ice motion costs ≈ +1.5 s per round versus Dee (crack 0.12 s before every reveal, 0.3–1.0 s glide); the shorter round-end and
chapter limit pay for it.

## 10. Deviations from / additions to DESIGN.md
- vi `initial` has 3 distinct initials (G, H, C) → ≤ 3 pairs (the polar animal head words); i18n must accept them.
- `glideContactV`: the blocks touch with 180 px/s (so the clink is audible) instead of stopping on their own; after the
  restitution-0.3 bounce, friction stops them a few px apart, centred on the midpoint.
- One hole per pair (on block a, moved to the midpoint), not one per block.
- Fish rewards are transient (removed after the last splash); `w.collected` keeps them for the rainbow party.
- Shore has 3 rows (+ 8 px row behind) because animals and sculptures no longer use branches: crowding (> 40 % box overlap)
  44 / 3 420 reward pairs in the unit check.
- Floes bob / drift amplitudes are per layout (`grid.bobAmp`, `grid.driftAmp`), ≤ DESIGN's ±3 px.
- `w.aurora` (shimmer strength) and `layout.shore / sea` are new fields; `layout.stack` is info only.
