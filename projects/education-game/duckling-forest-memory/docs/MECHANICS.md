# Dee's Forest Memory — Mechanics (rng · content · world · weather · bot)

Owner: mechanics engineer. Contract: `DESIGN.md` §2, §5.1–§5.5. Every tuned number lives in `DM.CONFIG` (`game/js/world.js`,
commented) and can be overridden per world: `new DM.World({ config: { roundDoneTime: 2.5 } })`. Content tables (the DESIGN
values) are `DM.Content.PAIRS / PEEK`; the playtest-tuned values the game uses are `DM.CONFIG.pairsByAge / peekByAge`.
Tests: `node tests/unit/run.js` (32 tests, ≈ 30 s; `node tests/unit/run.js grid` runs the tests whose name contains "grid").
Playtests: `node tests/sim/playtest.js` (2 400 sessions, ≈ 8 min on 2 cores), `node tests/sim/tune.js --config '{…}'` (quick
CONFIG comparisons), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js`, `node tests/sim/run_matrix.js` → `summarize.js`.
Units: logical px (short side 720), seconds, radians, y down; rot > 0 = clockwise.

## 1. API (DESIGN §5.2) — names kept from Kitten so `main.js` keeps working
`setViewport(W, H, ins)`, `setAge`, `setLang`, `newSession`, `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → card id or `null` (flips happen **on touch-down**), `pointerMove`, `pointerUp`, `cancelDrag()` (no-op),
`hint()` → card id (manual: tap on Dee / the bubble), `talkAnswer(choiceId)` → bool, `skipTalk()`, `prompt()` → `{promptKey, params}`.
Helpers: `cardById(id)` (= `itemById`), `rewardById(id)`, `cardRect(c)`, `DM.World.logicalSize`, `DM.World.computeLayout(W, H, ins)`,
`DM.World.chooseGrid(L, n, age)`, `DM.World.placeAt(kind, perch)`, `DM.World.rectGap`, `DM.World.overlapArea`.

Fields: `layout, state, phase, phaseTime, level, levels, topic, weather (= level = season), round, roundsPerLevel, stars,
levelStars, roundStars, mismatches, streak, found, pairs, open (ids of the face-up unmatched cards, ≤ 2), cur (the round),
talk, talkAnswered, alpha, stateTime, time, interactive, solved, wind, cards, rewards, collected (every reward of the session,
for the winter party), dee, pairsHeld`. Aliases: `items` → `cards`, `miu` → `dee`; `held` is always `null`.
States: `menu → intro → round → roundDone → … → talk → levelDone → … → sessionDone`.
Phases inside `round`: `deal → peek → hide → play ⇄ resolve → done`.

### Events
| event | fields |
|---|---|
| `session` | `levels` |
| `level` | `level, topic` |
| `round` | `round, topic, promptKey, params {n: pairs}, pairs, held` (held = the adaptive rule kept the grid size) |
| `deal` | `id` (a card leaves the deck; staggered 0.07 s) |
| `peek` / `hide` / `play` | — (all faces up in a wave / down in a reverse wave / the child may tap) |
| `flip` | `id, nameKind, nameValue, face, size, open` (the child turned a card; open = 1 or 2) |
| `tap` | `id, nameKind, nameValue, face, size` (a face-up or matched card was tapped → say its name again) |
| `match` | `a, b, key, nameKind, nameValue, found, pairs, nameKindA, nameValueA, faceA, sizeA, nameKindB, nameValueB, faceB, sizeB` + `parity` (oddeven), `animal, word` (initial), `text` (add/sub: "2 + 3"), `lower` (lower: "a") |
| `mismatch` | `a, b, streak, mismatches, nameKindA, nameValueA, faceA, sizeA, nameKindB, nameValueB, faceB, sizeB` |
| `reward` | `id, kind, x, y, color, shape, sprite, n, text` (the pair burst at x, y) |
| `land` | `id, kind, x, y` (a reward reached its perch; again after a re-perch) |
| `hint` | `a, b, nameKind, nameValue` (+ `idle: true` from an idle nudge) |
| `idle` | `n, promptKey, params` |
| `roundDone` | `round, stars, mismatches` |
| `talk` / `talkAsk` / `talkResult` | `talk` / `talk, n, glowAnswer` / `correct, choiceId, answerId` |
| `levelDone` / `sessionDone` | `level, stars` / `stars, rewards` |

### Renderer contract
- **Card** `c` (skip `gone`): centre `(x, y)`, size `w × h` (= grid size) × `(sx, sy)`, `rot`, `alpha`. `flip` 0 back … 1 face:
  draw scaleX·|cos(π·flip)|, the face when flip > 0.5; `lift` 0..1 → draw `CONFIG.liftPx` (8) px higher with a bigger, softer
  shadow; `glow` 0..1 hint halo. `deal` cards with `t < 0` sit on the deck at `layout.stack` (1.5 px apart, `sx = sy = 0.45`).
  Interpolate `_px, _py, _prot, _pflip` with `w.alpha`. `c.face` is what `DM.CardArt.drawFront` draws.
- **Reward** `r` (`state fly | settle | idle`, `alpha` fades in `levelDone`), interpolate `_px/_py/_prot`:
  `butterfly` centre, width `size` 46, `flap` 0..1 (wings), `face` ±1, `rot` · `lantern` centre, `size` 52, string from `(ax, ay)`
  when `ax !== null`, `glow`, `rot` (pendulum) · `star` centre, `size` 44 × `sx`, `glow`, `text` · `animal` **bottom-centre** anchor,
  `size` 70, `face` ±1, squash `sx, sy` about the anchor · `acorns` `pieces[] {x, y, rot, _px, _py, _prot}` acorn centres, each
  `pieceSize` 22. `r.perch.kind` = `ground | lily | branch | air`.
- **Dee** `{mood, moodT, lookX, lookY, hop}`: moods `happy` (match, 1 hop of 14 px), `cheer` (last pair / round done, 3 hops of
  26 px × 0.7ⁿ), `oops` (mismatch), `think` (hint, idle). Looks at the last tapped card for 3 s, else at the grid centre.
- `layout.perches` lists the candidate perches (debug overlay); `layout.grid = {cols, rows, cw, ch, gap, x0, y0, slots, rect, board,
  boardIndex, minOk}` for the current round (`null` outside a round).

## 2. Content (DESIGN §5.1) — `DM.Content.makeRound(topic, {age, lang, rng, roundIndex, history, pairs?, pairsByAge?, peekByAge?})`
Pure and deterministic. `validate()` re-derives every pair from the faces alone (`facesMatch`) and rejects a round when a key is
not on exactly 2 cards, a pair does not really match, **any card also matches a card of another pair** (ambiguity), or a colour
round below age 5 has a confusable pair; `makeRound` throws on a broken round (never happened in 88 000 test rounds). The world
passes `history` (earlier `round.sum`s of the chapter): a round never shows exactly the previous round's set of faces (re-roll ≤ 40×)
and prefers values the previous round did not use.

| topic | pair (key) | faces | reward |
|---|---|---|---|
| colors | same colour (`c:red`) | 2 × `color` (code-drawn butterfly) | butterfly of that colour |
| size (3) | same animal big ↔ small (`z:fox`) | `animal` scale 1 (`size:'big'`) + 0.6 (`'small'`) | the animal |
| shapes | same shape (`s:star`) | ≤ 4: each shape its own colour, the pair shares it; 5: the two cards differ in colour; `rect` from 5 | lantern (shape, colour) |
| count | numeral ↔ that many acorns (`n:3`) | `number` + `dots`; 1–5 (3–4, warm-up 1–3), 1–10 (5), 1–12 (6–7) | `n` acorns |
| animals | two identical animals (`a:owl`) | 2 × `animal` | the animal |
| letters | same capital (`L:A`) | 2 × `letter` | star with the letter |
| lower | capital ↔ small (`L:A`), never I / L | `letter` 'A' + 'a' | star |
| initial | letter ↔ animal whose word starts with it (`I:F`) | `letter` + `animal` (card.word) — one word per initial in a round | the animal |
| add / sub | "2 + 3" ↔ 5 (`v:5`) | `text` + `number`; sums 2–10 (6) / 2–20 (7), differences 0–9 within 10; warm-up ≤ 6 / ≤ 4 | star with the answer |
| oddeven | numeral ↔ dots, n ≤ 12, both parities every round | `number` + `dots` with `face.parity` (frame colour: odd blue, even orange) | `n` acorns |

Word lists (`DM.WORDS`): en fox F, deer D, hedgehog H, squirrel S, bunny B, frog F, bear B, owl O, mouse M (7 initials);
vi cáo C, hươu H, sóc S, gấu G, cú C, ếch **Ê** (5 initials; thỏ / nhím / chuột skipped — th, nh, ch are their own sounds).
Colour safety below age 5: no blue+purple, red+green, yellow+orange, green+orange in a round or a Talk question → the largest
safe sets have **3 colours** (6 such sets), so a colour round below age 5 has ≤ 3 pairs. Pink is an answer colour from age 5.
Name kinds on a card: `color, shape, animal` (+ `card.size` big/small in size rounds), `dots` (n: "one, two, three acorns"),
`number, letter` (as shown), `sum` ('2 + 3'), `diff` ('5 − 2'). `round.pairInfo[key]` names the pair (count / oddeven / add / sub:
`number`, initial: `letter` + `animal, word`, lower: `letter` + `lower`).

Talk (`makeTalk`) — `show` is a card face (`null` for animals): colours (3 safe colours), shapes, size (big/small of an animal),
count (dots; k ≤ 5 at ages ≤ 4), letters / lower (capital choices), initial (`params {word, animal}`), add / sub, oddeven
(`parity`), **animals "Where is the {animal}?"** (`params.animal` = the answer, 3 animal picture choices).

## 3. Layout and grid (DESIGN §2)
`groundY = H − ins.bottom − 90`; Dee landscape `(ins.left + 110, groundY + 16)`, h 180; portrait `(ins.left + 100, groundY + 20)`,
h 170; Dee's keep-out box = h × h above the feet. Bubble landscape `(ins.left + 24, ins.top + 20)`, w = min(640, W − x − ins.right − 160),
h 122; portrait `y = ins.top + 96 + 24`, h 124, w = min(640, W − x − ins.right − 24). HUD x > W − ins.right − 160, y < ins.top + 96.
Deck: `(dee.x + 72, groundY + 30)`.
**Boards**: from bubble bottom + 24 to groundY − 10. Landscape x from dee.x + 130 (≥ 120 per DESIGN; +10 so cards are ≥ 40 px from
Dee's box) to W − ins.right − 24. Portrait two candidates: **A** full width (24 px margins) with the bottom ≤ Dee's head − 10, **B**
right of Dee (x ≥ Dee box right + 40) down to groundY − 10.
**Grid**: every cols × rows with cols·rows − n ∈ {0, 1} (one empty slot → last row centred) on every board; card w:h = 0.78,
gap = max(14, 0.12·cw); the largest card wins (capped at 210 px), ties (< 0.5 px) → more columns in landscape, more rows in portrait.
Hit test: the card rect + 10 px; several hits → nearest centre. Colour rounds swap yellow cards to slots ≥ 40 px from Dee.

Card widths (px) at the 12 test viewports, worst cases (all ≥ the 120 / 104 px minimum):

| viewport | 2 pairs | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| iPhone portrait notch 720×1556 | 2×2 210 | 2×3 210 | 3×3 207 | 2×5 148 (B) | 3×4 158 |
| iPhone landscape notch 1556×720 | 4×1 210 | 6×1 163 | 4×2 155 | 5×2 155 | 6×2 155 |
| iPad landscape insets 960×720 | 4×1 160 | 3×2 147 | 4×2 147 | 5×2 127 | 6×2 104 |
| iPad portrait insets 720×960 | 2×2 199 (B) | 3×2 145 (B) | 4×2 143 | 5×2 123 | 4×3 107 (B) |
| 16:9 1280×720 | 4×1 210 | 3×2 169 | 4×2 169 | 5×2 169 | 6×2 154 |

The tuned game never deals more than 5 pairs (age 6–7 last round) → smallest card in 2 400 playtest sessions: 123 px.

**Perches** (`layout.perchCands`): ground points every 64 px at groundY + 72 (bottom anchor; the 2 rightmost are lily pads), branch
rows at groundY − 420 / − 360 / − 300 (`CONFIG.branchDy`, to be replaced by the env artist's branch heights) + a canopy row at
ins.top + 26, and an air grid (64 × 54 px). A reward's box (per kind: animal 70², butterfly 46² sitting 0.6·size above a flower /
0.45·size above a branch, star 44² + twinkle pad, lantern hanging 36 px string + 52 body with ±18 px swing room, acorn pile 92 × 48)
must be inside the safe area − 6 px and ≥ 10 px from the bubble, HUD, Dee and the current card grid. Preference per kind:
butterfly branch → ground → air; lantern branch → air; star air → branch; acorns ground → lily; animals ground → lily (frog lily
first, owl / squirrel branch first). The pick is random among the 3 free perches tightest to the other rewards; with no free perch
the least-overlapping one is used (crowded chapters on portrait phones at ages 6–7). At every round start rewards whose box the new
(bigger) grid covers fly to a new perch; `setViewport` re-perches every reward at once (snap).

## 4. Motion (fixed 1/120 s sub-steps, semi-implicit Euler)
| element | model and numbers |
|---|---|
| deal | ballistic arc from the deck: T = 0.42 + d/2400 s (≤ 0.62), g 2600 px/s², spin 0.5–1 turn (random sign) ending at rot 0, scale 0.45 → 1; stagger 0.07 s (`deal` event); landing squash q 0.12 (spring ω 20, ζ 0.35); peek 0.15 s after the last landing |
| peek / hide | flipT → 1 in slot order every 0.05 s; hold `peekByAge` s after the last card is ≥ 0.95; reverse wave down; `play` once every flip < 0.5 |
| flip | critically damped spring ω 18 on `flip` → 95 % in 0.26 s, no overshoot; `lift = sin(π·flip)` (peaks mid-turn) |
| idle | face-down cards breathe ±1.2 % at 0.35 Hz (random phase) during play |
| match | check when both flips ≥ 0.95. Hold 0.25 s (faces shown, lift → 1), then slide to the midpoint (spring ω 11, ζ 0.8), spin to 2π from 0.35 s (spring ω 9, ζ 0.45 → ≈ 1.2 turns peak, measured 1.05–1.45), shrink to 0.86×, squash 0.2 at 0.7 s, **burst at 0.85 s** → `gone` + reward. Phase back to `play` 0.4 s after the check (other cards can be turned while the pair spins away) |
| mismatch | both shake rot = 0.08·sin(2π·3u)·(1−u)², u = t/0.5 s; faces stay `mismatchShow` 1.0 s (age 3: 1.2 s), then flip down |
| hint peek | the hinted face-down cards turn to flip 0.75 (face at 70 % width) from 0.2 s to 0.65 s, glow 2.5 s (in 0.2 s, out 0.4 s) |
| butterfly | quadratic bezier (control point 0.35·d ≤ 170 px above), T = 0.7 + d/900 s in [0.9, 1.8], smooth-step speed, sideways flutter 26·sin(πu)·(sin(2π·2.2t) + 0.4 sin(2π·3.7t)), wings 9 Hz; sits (settle 0.6 s, slowing flaps), then a lazy 0.5 s flap every 2–4 s |
| star | same bezier, spins in flight; idle twinkle scale 1 ± 0.1 at 1.4 Hz, bob 4 px, glow 0.65 ± 0.35 |
| lantern | floats up the bezier; on a branch a pendulum: θ″ = −(g/L) sin θ − 0.8 θ′ + 0.0025·9.8·wind, g 980, L = 36 + 26 px (period ≈ 1.6 s), first swing 0.32 rad in the flight direction; string length exact (test); in the air it bobs |
| animal | 3 parabolic hops (g 2600, apex 80 / 46 / 30 px, kept below ins.top + 30), the first from the burst down to the ground line at 55 % of the way; landing squash 0.18·v/700 (spring ω 18, ζ 0.3); resting: breathes ±2 %, a 10 px hop every 4–8 s |
| acorns | n pieces (≤ 12, 2 rows of ≤ 6), launched 0.04 s apart on parabolic hops (apex 60–130 px, g 2000) to spots across the pile; bounce with restitution 0.4 (measured 0.40), friction 0.75, then roll (rate 6 /s) with rot = x/r until at rest |

## 5. Rules
- Taps count only in `play` and while a **mismatch** shows; during the deal / peek / hide nothing happens. A face-down card flips up
  (≤ 2 open); a face-up or matched card → `tap` (name again); a tap just after a match (≤ 0.4 s) on a face-down card is ignored.
- **Third tap:** with 2 mismatched cards up (shown or not yet checked), tapping a third card flips both down at once and the new one up;
  the mismatch counts once. A pending *match* is never broken (the third tap is ignored).
- Stars per round: mismatches ≤ max(1, pairs − 1) → 3, ≤ 2·pairs → 2, else 1; Talk right → +1. Max 52 per session.
- Hints: 3 mismatches in a row → `hint` on one pair (the partner of a single open card, else the pair of the last tapped card, else a
  random unfound pair), streak resets; no auto-hint while one glows or within 6 s of the last. Idle nudges after 12 s without a tap
  in play (any `pointerDown` resets), gap ×1.5 to 30 s (12, 30, 57, 87 … s); from the 2nd nudge a hint too (`idle: true`).
- Chapter: 4 rounds, **Talk time after ≥ 3 rounds once the chapter passed 80 s**; `talkAsk` every 12 s, `glowAnswer` from the 2nd.
- **Adaptive hold:** after a hard round (only 1 star, or > 40 s of play) the next round keeps the last round's pair count instead of
  growing (`round.held`); a new chapter starts fresh.
- Rewards stay for the whole chapter (≤ 30), fade over 1.2 s in `levelDone`, are cleared at the next `level`; `w.collected` keeps
  every reward of the session for the winter party.

## 6. Timing (playtest-tuned)
`introTime 2.5`, `dealSettle 0.15` (0.25), `peekByAge 2.8 / 2.2 / 2.0 / 1.5 / 1.5` (DESIGN 3.5 / 2.5 / 2.0 / 1.5 / 1.5),
`pairsByAge` 3: 2, 2, 2, 3 · 4: 2, 2, 3, 3 · 5: 2, 3, 4, 4 · 6: 3, 3, 4, 5 · 7: 3, 4, 4, 5 (DESIGN 2,2,3,3 · 2,3,4,4 · 3,4,5,5 · 3,4,5,6),
`mismatchShow 1.0` (age 3: 1.2; DESIGN 1.4), `matchBurstAt 0.85` (0.95), `matchResolveTime 0.4` (0.5), `roundEndDelay 0.4` (0.7),
`roundDoneTime 1.8` (2.2), `talkAfterAnswer 2.0`, `levelDoneTime 2.0` (2.4), `chapterTimeLimit 80` (DESIGN 90).
With the DESIGN values a typical 4-year-old chapter was **119 s** and typical sessions reached **527 s**; see §9.

## 7. Weather (`DM.Weather`, fixed 1/60 s steps → independent of the dt split; cap 120 particles)
| season | sky top → bottom (horizon), tint | ambient | particles |
|---|---|---|---|
| 0 spring | `#A9D8F0 → #EEF7EE` (`#F6F2E2`), blossom pink .06 | wind 8, gust +10, sun (0.8, 0.16) | 16 + 3 front falling petals, 3 butterflies, 3 sky sparkles |
| 1 summer | `#7EC4EE → #DFF2FA` (`#F2F6E2`) | wind 6, gust +8, sun (0.68, 0.1) | 10 sun sparkles, 6 fireflies (`glow`), 2 butterflies |
| 2 autumn | `#E9C9A0 → #FBEBD6` (`#F6DDB8`), apricot .06 | wind 14, gust +26 (peaks 30–40) | 9 `leaf_a` + 9 `leaf_b` + 2 front tumbling leaves |
| 3 winter | `#C5D7E6 → #EEF4F8` (`#F7FAFC`), cold blue .08 | wind 5, gust +8, pale sun 0.55 | 26 `snow1` + 14 `snow2` + 4 front flakes |
`ambient`: `skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, darkness (0), season, gust, windBase` (+ `moon, stars` = 0
for the shared renderer); `setWeather(i)` crossfades sky / numbers / particle counts over 2.5 s.
Fallers (petal / leaf / snow): fall speed 26–44 / 38–62 / 30–55 px/s (× depth for front ones), sideways sway 24 / 34 / 14 px/s,
wind drift ×0.9 / ×1.6 / ×0.5, gusts lift leaves 70 px/s (petals 25) — autumn leaves are blown across at > 50 px/s; leaves and petals
tumble (`flipX = cos`, fractional = 3D turn), wrap from the top (in strong wind some re-enter from the left). Butterflies: heading
random walk + steering into the meadow box, 35–60 px/s, `flap` 0..1 at 7–9 Hz, `color` (draw with `DM.CardArt.drawButterfly`),
`flipX` = facing. Fireflies blink (0.12 → 1). `burst(x, y, {kind: confetti | puff | sparkle})` unchanged from Kitten.

## 8. Bot (§5.4)
Memory model: every exposure of a face (peek, flips, hint peeks) is remembered with p = skill; plays a known pair first, else the
remembered partner of the open card, else an unseen card. Reaction (0.9 − 0.5·skill)·U(0.8, 1.25) s (+0.6 s at a round start),
finger path 900–1300 px/s, tap at the card ± 0.25·size; waits while a pair is checked or a mismatch shows. Talk right with p = skill.
`bot.stats {taps, grabs, flips, matches, mismatches, misses, talks, talkRight}`; `bot.memory`. skill 1 never mismatches (test).

## 9. Playtest results (`tests/sim/playtest.js`, 2 400 sessions = 10 drivers × 5 ages × 2 langs × 4 viewports × 6)
Child models (`tests/sim/lib.js`, all with memory): a face is remembered with p = peekRecall (peek) / flipRecall (own flips) and
forgotten with an exponential lifetime tau; the child plays a remembered pair, else the remembered partner, else an unseen card, but
taps a random card with p = pRandom; taps a glowing hint card with p = 0.8; waits `afterFlip` after its own flip (Dee says the name)
and `reaction` between turns; while a mismatch shows it waits with p = patience (else the third-tap reset).
**typical(age)** peek 0.30 → 0.60, flip 0.55 → 0.85, tau 30 → 90 s, reaction 1.3–2.6 → 0.8–1.5 s, distracted 15 → 7 % of rounds;
**careful4** (careful 4-year-old, weak memory: peek 0.2, flip 0.45, tau 25 s, always waits, reaction 1.6–3.0 s);
**toddler** (impulsive 3-year-old, patience 0.3); **slow3** (dreamy 3-year-old: 2.5–4.5 s between taps, distracted 30 % for 5–15 s);
**tapper** (random taps); **spammer** (5–20 taps/s); DM.Bot memory skills 0.3 / 0.6 / 0.9 / 1.

| driver / age | session mean (p90, max) | chapter mean (p10–p90) | round | mismatch / round | rounds with hint | stars (of 52) |
|---|---|---|---|---|---|---|
| typical 3 | 392 s (419, 483) | 98 s (85–109) | 20.4 s | 0.8 | 5.8 % | 48 |
| **typical 4** | **375 s (400, 413)** | **94 s (81–106)** | 19.2 s | 0.8 | 5.0 % | 49 |
| typical 5 / 6 / 7 | 401 / 401 / 372 s (p90 ≤ 427, max 453) | 100 / 100 / 93 s | 19–21 s | 0.6–1.0 | 1–5 % | 50–52 |
| careful4 3 / **4** / 5 | 432 / **431** / 453 s (p90 465 / **462** / 502) | 108 / 108 / 113 s (40 % of the age-4 chapters cut to 3 rounds) | 23–32 s | 1.1 / 1.4 / 2.2 | 11 / 15 / 25 % | 45 / 42 / 35 |
| toddler 3 / 4 | 378 / 394 s (p90 398 / 417) | 94 / 98 s | 20–21 s | 1.3 / 1.6 | 16 / 19 % | 45 / 44 |
| slow3 3 / 4 | 469 / 505 s (p90 516 / 554, max 636) | 117 / 126 s (79 / 95 % cut) | 31–36 s | 1.3 / 1.8 | 19 / 24 % | 36 / 34 |
| tapper 3 → 7 | 408 → 577 s | 102 → 144 s | 23–44 s | 2.8 → 8.7 | 38 → 75 % | 37 → 22 |
| spammer 3 → 7 | 211 → 298 s | 53 → 75 s | 10–15 s | 2.7 → 10.8 | 59 → 91 % | 39 → 28 |
| bot 0.3 / 0.6 / 1 | 298–413 / 259–333 / 240–292 s | 75–103 / 65–83 / 60–73 s | 11–23 s | 0.6–1.7 / 0.1–0.3 / 0 | 5–15 / ≤ 1 / 0 % | 45–47 / 50 / 52 |

Typical-child round time by topic: 19–21 s everywhere (age 4: colours 18.8, shapes 19.4, count 19.6, animals 19.2 s), 4.5 → 8 cards.
Verdict: typical 4-year-old chapter **93.8 s ✔** (60–100); child models at their ages (typical 3–7, careful4 3–5, toddler 3–4)
session p90 **453 s ✔** (≤ 8 min); careful 4-year-old p90 **462 s ✔**; typical sessions max **483 s ✗ by 3 s** (one distracted
age-3 session of 240; p90 419 s); 2 400 / 2 400 finished, 0 stuck rounds, 0 NaN, 0 errors, 1 round > 180 s (slow3 at age 7);
0 / 128 725 resting-reward checks off-screen or on the cards / bubble / HUD / Dee; smallest card 123 px (0 grids below the age
minimum). Slow dreamy 3-year-old (INFO, not a gate): p90 549 s at ages 3–4 even with 79–95 % of its chapters cut to 3 rounds —
its 2.5–4.5 s between taps dominate. Absent child: 11 idle nudges in 5 min (12, 30, 57, 87 … s), 10 Talk re-asks in 2 min
(main.js should stop speaking after the 3rd). Determinism (`determinism.js`): 10 / 10 cases replay identically at 1/30, 1/60
and 1/120 s frames. Content (`content_stats.js`, 300 chapters per cell): 0 identical consecutive rounds; 0–42 % of a round's values
carried over from the previous round (more in tiny pools: shapes, colours, vi initial 77 %); Talk answers spread over every value.

Tuning history (typical 4-year-old chapter / typical session max): DESIGN numbers 119 s / 527 s → shorter overheads
(roundDone 1.8, burst 0.85, roundEnd 0.4, dealSettle 0.15, levelDone 2.0) and pairs 2,2,3,3 at age 4 → 94 s / 489 s →
+ adaptive hold + chapter limit 80 s → 94 s / 483 s, careful4 p90 494 → 462 s.
Reward crowding (perch overlap > 40 % of a box, end of chapter, bot sessions): 0 % on landscape phones, 0 % (age 4) – 12 % (age 6) on iPad landscape,
12 % (age 4) – 28 % (age 6) on portrait screens (15 rewards around a 5-pair grid) — they then stand in little clusters.

## 10. Deviations from / additions to DESIGN.md
- **Tuned numbers** (§6): pairs per round, peek times, mismatchShow at age 3 (1.2, not 1.4), chapter time limit **80 s** (not 90),
  burst at 0.85 s. DESIGN tables stay in `DM.Content.PAIRS / PEEK`; CONFIG `pairsByAge: null, peekByAge: null` restores them.
- **Colour rounds below age 5 have ≤ 3 pairs**: only 3 colours are pairwise safe with DESIGN's four confusable pairs.
- **vi `initial`** has 5 distinct initials (cáo/cú C, hươu H, sóc S, gấu G, ếch **Ê**) → ≤ 5 pairs; i18n must speak the letter Ê.
  en has 7 (fox/frog F, bunny/bear B: one word per initial in a round).
- **oddeven** uses face kinds `number` / `dots` with `face.parity` (no separate `parity` face kind).
- **size** cards are `animal` faces with `scale` 1 / 0.6 and `size: 'big' | 'small'` (also on the card and the flip / tap events).
- **Hint peek** turns the cards to flip 0.75 (DESIGN "0.5" would show the card edge-on).
- **Adaptive hold** (new): after a hard round the grid does not grow; `round` event `held`, `w.pairsHeld`.
- New events / fields: `play` event, `flip.open`, `match.lower/text/word/animal/parity`, `sessionDone.rewards`; `w.open`,
  `w.collected`, `w.found`, `w.streak`, `layout.deeRect / boards / stack / safe / perchCands`, reward `size, anchor, face, perch,
  target, pieces, pieceSize, ax, ay, glow`.
- Landscape board starts at dee.x + 130 (DESIGN ≥ 120); portrait has a second board candidate right of Dee (needed for 12 cards on
  an iPad portrait with insets, 107 px).
- Weather butterflies carry `color` + `flap` (sprite `'butterfly'` is drawn by `DM.CardArt.drawButterfly`); `ambient.moon/stars` stay 0.
- `tests/sim/out/` holds generated reports (JSON + md): consider git-ignoring it.
