# Kitten's Balloon Farm — Mechanics (rng · content · world · weather · bot)

Owner: mechanics engineer. Contract: `DESIGN.md` §2, §5.1–§5.5. Every tuned number lives in `KB.CONFIG` (`game/js/world.js`,
commented) and can be overridden per world: `new KB.World({ config: { roundDoneTime: 2.5 } })`.
Tests: `node tests/unit/run.js` (35 tests, ≈ 35 s). Playtests: `node tests/sim/playtest.js` (2 160 sessions, ≈ 3 min on 2 cores),
`node tests/sim/determinism.js`, `node tests/sim/content_stats.js`, `node tests/sim/run_matrix.js` → `summarize.js`.
Units: logical px (short side 720), seconds, radians, y down; rot > 0 = clockwise.

## 1. API (DESIGN §5.2) — names kept from Owl so `main.js` keeps working
`setViewport(W, H, ins)`, `setAge`, `setLang`, `newSession`, `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → balloon id hit or `null` (pop / wrong happen **on touch-down**), `pointerMove`, `pointerUp`,
`cancelDrag()` (no-op), `hint()` → id, `talkAnswer(choiceId)` → bool, `skipTalk()`, `prompt()` → `{promptKey, params}`
(ask mode: the current target animal). Extra helpers: `canTap(b)`, `balloonById(id)` (= `itemById`), `KB.World.logicalSize`,
`KB.World.computeLayout(W, H, ins, age)`, `KB.World.packHomes`.

Fields: `layout, state, level, levels, topic, round, roundsPerLevel, stars, levelStars, roundStars, roundMistakes, talk,
talkAnswered, cur, alpha, stateTime, time, interactive, solved, balloons, friends, shreds, sign, target, queue, miu, wind,
packShrink, packOk, playRect`. Aliases: `items` → `balloons`, `lumi` → `miu`; `held` is always `null`.
States: `menu → intro → round → roundDone → … → talk → levelDone → … → sessionDone`.

### Events
| event | fields |
|---|---|
| `session` | `levels` |
| `level` | `level, topic` |
| `round` | `round, topic, mode, promptKey, params, sign {type, value, need}` |
| `ask` | `balloonId, promptKey:'p.animals', params {animal}, first` (true at round start → say `p.animals`, else `p.animalsNext`), `left` |
| `appear` | `id` (a balloon starts rising; staggered 0.12 s) |
| `correct` | `id, x, y, color, shape, sprite, text, nameKind, nameValue, n` (pops so far), `need` (count mode, else null) — at touch-down |
| `pop` | same fields — 0.08 s later, when the body bursts (flash, shreds, confetti, POP sound) |
| `wrong` | `id, x, y, nameKind, nameValue, mistakes, target` (balloon id to find), `targetNameKind, targetNameValue` |
| `land` | `id` (friend), `x, y, sprite, nameValue` |
| `hint` | `id` |
| `idle` | `promptKey, params` (current task) |
| `roundDone` | `round, stars, mistakes` (+ `count, need` in count rounds) |
| `talk` / `talkAsk` / `talkResult` | `talk` / `talk, n, glowAnswer` / `choiceId, answerId, correct` |
| `levelDone` / `sessionDone` | `level, stars` / `stars` |

### Renderer contract
- Balloon `b`: draw states `rise | float | away` (skip the body for `pop | gone`). Centre `(x, y)`, rotation `rot`, body **width
  `b.size`** (already × scale and × fit-shrink — do not multiply by `scale` again), squash `sx, sy` about the centre,
  `alpha` (away fade), `glow` 0..1. Interpolate `_px/_py/_prot` with `w.alpha`. `string[0..6]` points in world px
  (`[0]` = knot, from `KB.BalloonArt.knotY` when loaded, else `CONFIG.knotY[shape]·size`), previous step `_pstring`, alpha `strAlpha`.
- Friend `f`: **bottom-centre anchor** `(x, y)` on the grass, width `f.size` = 84, `rot`, `sx, sy` about the anchor, `alpha`.
- Shreds `{x, y, vx, vy, rot, vr, color, life, life0}` (cosmetic, ≤ 64). Sign `{type, value, need, filled, wob, parity?}`:
  suggested board rotation `0.06·wob` about the post foot. Miu `{mood, moodT, lookX, lookY, hop}` (hop = px above the feet).

## 2. Content (DESIGN §5.1) — `KB.Content.makeRound(topic, {age, lang, rng, roundIndex, history})`
Pure and deterministic; `validate()` re-derives every answer flag from the sign/params and rejects broken rounds (makeRound
throws). The world passes `history` = the earlier rounds' `round.sum` of this chapter, so a chapter never repeats a target and
no two consecutive rounds are identical (re-roll ≤ 40×).

| topic | mode | per round |
|---|---|---|
| colors | find | target colour new every round (4 different per chapter); k = 1 (warm-up) / 2–3; n−1 distractor colours (n = 2/3/4 at age 3/4/5+), 1–2 each; ≤ 5/6/8 balloons; circles |
| shapes | find | target shape new every round; n shapes as colours; age ≤ 4 one colour per round (shape is the only cue), 5+ mixed; `rect` from 5 |
| size | find | big 1.3× / small 0.72×, one colour (new every round); warm-up 1 + 1, then 1–2 targets + 1–3 others (≤ 4); target size alternates 65 % |
| count | count | N: warm-up 1–3 (2–3 from age 5), then 3/4 → 2–5, 5 → 3–10, 6/7 → 4–12; N never repeats in a chapter; one new colour; N + 3 balloons (N ≤ 3) else N + 2; all `answer` |
| animals | ask | 2 (warm-up) / 2/3/4 distinct animals, sprite `animal_<id>`, colours mixed incl. pink; `queue` = all ids shuffled |
| letters / lower | find | target letter new every round + 2–3 other letters; 1–2 targets; lower: lower-case balloons, capital on the sign, no I |
| initial | find | sign = animal sticker (new every round), balloons = its initial + 2 other letters (vi: thỏ/ngựa/chó skipped) |
| add / sub | find | `a + b` ≤ 10 (age 7 ≤ 20) / `a − b` within 10; 3 number balloons, distractors = 2 of the 4 nearest valid (±1–3, ≥ 0) |
| oddeven | find | 5–6 distinct numbers 1–20, 1 (warm-up) / 2–3 targets; sign text `1 3 5` / `2 4 6` (+ `parity`) |

Colour safety: below age 5 no blue+purple, red+green (DESIGN) **and no yellow+orange** in any round or colours Talk.
Text balloons: cream / pink / yellow. Prompt params: colors `{color, n}`, shapes `{shape, n}`, size `{size, n, color}`,
count `{n, color}`, animals `{animal}`, letters/lower `{text, letter, n}`, initial `{animal, word, text, n}`,
add/sub `{a, b, text, n}`, oddeven `{parity, n}`. Name kinds: colours `color`, shapes `shape`, size `size`, count `balloon`
(value = colour), animals `animal`, letters `letter`, numbers `number`.

Talk (`makeTalk`): colours (show a circle balloon, 3 safe colours), shapes, size (2), count (k ≤ 5 at age ≤ 4), letters/lower,
initial (`params {word, animal}`), add/sub, oddeven; **animals "Which animal says {sound}?"**: `params.sound` = the answer's
animal id (i18n renders its sound word); answer ∈ animals with a sound (`KB.Content.SOUND`: en all but bunny; vi all but bunny
and goat); 3 choices never share a sound group (en sheep "baa" ≈ goat "maa" are one group), at most one soundless distractor.

## 3. Layout (DESIGN §2) and home packing
`groundY = H − ins.bottom − 96 − (tall ? min(140, 0.3·(H − 1.6W)) : 0)`; Miu `(ins.left + 110, groundY + 18)`, h 190 / 200;
sign post foot `(miu.x + 165, groundY + 24)`, board 150 × 131; bubble `(ins.left + 24, ins.top + 20)`, w = min(640, W − x − ins.right − 160), h 104;
yard `x0 = sign.x + 120 … x1 = W − ins.right − 60`, `y = groundY + 30`; HUD box x > W − ins.right − 160, y < ins.top + 96.
Balloon size 128 / 118 / 108 (age 3 / 4 / 5+), ×1.15 when H/W > 1.6. `layout.play` = rectangle of allowed **centres** for that
size: x from ins.left + 50 + size/2 to W − ins.right − 50 − size/2; y from bubble bottom + 30 + size/2 to
`groundY − max(150, 1.5·size − 50)` (so knot + rope end ≤ 50 px below groundY); portrait: height ≤ 1.05·W, kept at the bottom.
`layout.excl` = Miu + sign box (x < sign.x + 110, y > groundY − 320): **no balloon body** inside it — in both orientations
(portrait too, otherwise balloons sit on Miu's hat).

Packing (`packHomes`): candidate grid every 14 px; biggest balloon first; spacing 1.2 × mean size of the pair (1.05× when
> 10 balloons). Attempts per size step: 2× spread (random among candidates whose clearance ≥ 80 % of the best = farthest-point
sampling with variety), 2× tight (smallest clearance → hex-like), 2× with the Miu box lowered to 240 px (24 attempts for
crowded rounds); then all sizes shrink 5 % (≥ 0.8× = ok). Result over 3 024 unit-test rounds × 12 viewports: worst 0.95× for
≤ 10 balloons, 0.90× (97 px) for 13–14-balloon count rounds on a short iPad landscape; sims: worst 0.85× (age-6 count 12 + 2 on
iPad landscape with insets, 92 px). `setViewport` mid-round re-packs live balloons (seeded by round seed ^ W ^ H), snaps floating
ones home, moves friends to their new yard slot.

## 4. Motion (fixed 1/120 s sub-steps, semi-implicit Euler)
| element | model and numbers |
|---|---|
| rise | starts at `groundY + size`, x = home ± 30, staggered 0.12 s (`appear`); spring to (home + bob + drift + wind) ω 3.2, ζ 0.55 → 60 % of the rise in ≈ 0.5 s, overshoot ≈ 12 % (test: 4–20 %), settled < 2.2 s; tappable from 60 % of the rise; `rise → float` after 1.6 s or once within 3 px / 20 px/s. Round interactive ≈ 0.6 + 0.12·(n−1) s |
| float | spring ω 5.5, ζ 0.7 (settles ≈ 1 s) toward home + bob (6–9 px, period 2.2–3.4 s, random phase; ×2 while a hint glows) + drift (±10 px, 5–8 s) + `wind · 0.35 s` (±14 px) |
| separation | pairs closer than min(1.1 × mean size, 0.95 × their home distance) push apart with 40 px/s² per px |
| tilt | rotational spring ω 7, ζ 0.35 toward clamp(−vx·0.0025 + wind·0.003, ±0.25) |
| string | 7-point verlet, segment 0.15 × **unscaled** size (big balloons keep a normal string), gravity 900, damping 0.98 / step, 3 constraint iterations, wind pull 5 px/s² per px/s; point 0 pinned to the rotated knot. Unit test: segments stay < 1.15× rest under a 400 px/s kick and ±40 wind |
| pop | correct tap: 0.08 s smoothstep swell to 1.18×, then `pop`: body gone, 8 shreds (140–340 px/s, gravity 700, drag 1.6, life 0.6–0.95 s), string unpinned, falls and fades in 0.6 s → `gone` |
| friend | from an animal balloon: appears at its centre (+42 px = bottom anchor) with vy −60; gravity 600, drag 2.7 /s (terminal 222 px/s); x eases from the balloon to the yard slot by fall progress + sway ±18 px / ±0.25 rad at 0.7 Hz (leaf); `land` at first contact, squash 0.22·v/222 (spring ω 18, ζ 0.3), hops: first ≥ 160 px/s (≈ 14 px) then ×0.35, 2 bounces → `rest` (breathes ±2 %); slots 92 px apart from x0, extra rows 24 px further back, offset ½ slot; fade out at 1.6–2.0 s of roundDone |
| wrong | squash q = 0.18 (sx = 1+q, sy = 1−q; spring ω 16, ζ 0.28), impulse 220 px/s away from the finger (≈ 18–40 px push), "no-no" shake 0.22·sin(2π·3.5 t)·(1−u)² over 0.6 s; per-balloon 0.3 s cooldown (taps ignored, no mistake); back home in ≈ 1–1.2 s |
| away | count extras at N, everything else at round end: vy ≤ −180, accelerates up 260 px/s², sways ±22 px, fades from 1.0 s over 0.5 s → `gone` before the next round (roundDone 2.2 s) |
| sign | wob spring ω 14, ζ 0.25; kick 6 per count pop / 4 at round start and per new ask |

## 5. Rules
- Right tap: find → `answer`; count → any balloon; ask → `w.target` (= `queue[0]`). Solved: find → no live answer balloon;
  count → pops = N (extras away at once); ask → queue empty. Then `roundEndDelay` 0.5 s (and the last friend has touched the grass,
  ≤ 3 s), remaining balloons away, `roundDone`. No taps once solved.
- Stars: 3 (no wrong), 2 (one), 1 otherwise; Talk right +1. Max 52 per session.
- Help: from the 2nd wrong tap of a round, a wrong tap triggers `hint` on the (next) target (find: first live answer; ask: target;
  count: first live balloon) unless one glows or < 6 s since the last; glow 3 s (fade in 0.2 s, out 0.4 s). `hint()` = manual.
- Idle: 12 s without a touch (any `pointerDown` in the round resets) → `idle`; gap ×1.5 up to 30 s (12, 18, 27, 30, 30 …).
- Talk: `talkAsk` every 12 s without an answer; `glowAnswer` from the 2nd re-ask (main stops speaking after 3).
- Chapter time limit: after ≥ 3 rounds, Talk time once the chapter passed 75 s.

## 6. Timing (playtest-tuned)
`introTime 2.5` (banner + chapter line + 2.5 s sky crossfade; was 1.8), `roundDoneTime 2.2` (stars + praise ≈ 2 s; was 1.7),
`talkAfterAnswer 2.0` (was 1.6), `levelDoneTime 2.4` (was 2.0). With 1.8 / 1.7 / 1.6 / 2.0 a typical 4-year-old chapter was
54 s (below the 60–100 s target); now 63 s.

## 7. Weather (`KB.Weather`, fixed 1/60 s steps → independent of the dt split; cap 120 particles)
| time | sky top → bottom (horizon) | ambient | particles |
|---|---|---|---|
| 0 morning | `#FFD6C2 → #FFF1DC` (`#FFE6CC`), peach tint .08 | wind 6 px/s, gust +8, sun (0.82, 0.36) | 3 butterflies, 6 mist puffs, 5 sky sparkles |
| 1 noon | `#7EC8F2 → #DDF3FF` (`#EEF9FF`) | wind 14, gust +26 (peaks 30–40), sway .35 | 4 butterflies, 6 breeze leaves/petals |
| 2 sunset | `#B7A0DA → #FFD9A6` (`#FFB585`) | wind 10, gust +12, sun low left, moon .15, darkness .08 | 12 + 2 front dandelion seeds, 3 sparkles |
| 3 night | `#142048 → #34407A` (`#4A5A99`) | wind 4, gust +5, moon, stars 1, darkness .28 | 14 twinkle stars, 14 + 2 fireflies (`glow:true`) |
The sunset top is a lighter lavender than the suggested `#9A7BC9` so purple balloons stay readable against it.
`ambient.wind` = base·(1 + 0.3 sin(0.37t) + 0.15 sin(0.91t + 1.3)) + gusty·gust, clamped ±40; gusts every 4–7 s
(0.6 s rise, 0.8 s hold, 1.5 s decay, amp 0.6–1). Butterflies: heading random walk + steering into the meadow box
(y 0.3·gY … gY − 10), 35–60 px/s, bob 18 px/s, wing flap 7–9 Hz via `flipX = facing·(0.25 + 0.75|cos|)`, wind ×0.35.
Fireflies: 10–22 px/s wander near the grass (0.45·gY … gY + 40), blink pulse 0.35 of a 2–4 s cycle (alpha 0.12 → 1).
Seeds: vx = 0.9·wind + 14, slow vertical wander ±9 px/s, wrap. Leaves: vx = 2.2·wind + 20, lifted by gusts.
`burst(x, y, {kind:'confetti'|'puff'|'sparkle', n, color})` as Owl. No aurora (removed). Layers `sky | back | front`.

## 8. Bot (§5.4)
Reaction (0.9 − 0.5·skill)·U(0.8, 1.25) s (+0.6 s before the first tap of a round), picks a right balloon with p = skill
(else a random wrong one), eased finger path 900–1300 px/s tracking the moving balloon, `pointerDown` at its current
position ± 0.25·size, up 0.06–0.12 s later. Talk after 1.0–2.2 s, right with p = skill. `bot.stats {taps, grabs, correct,
wrong, misses, talks, talkRight}`.

## 9. Playtest results (`tests/sim/playtest.js`, 2 160 sessions = 9 drivers × 5 ages × 2 langs × 4 viewports × 6)
Child models (`tests/sim/lib.js`): **typical(age)** listens 2.6–3.8 s (age 3) … 2.0–3.0 s (age 7) to Miu's prompt, taps every
1.5–2.8 s … 0.9–1.6 s (+0.3–0.8 s after a pop while Miu says the word), right 80 → 95 %, distracted 15 → 7 % of rounds for
4–10 s; **toddler** (impulsive 3-year-old, right 60 %); **slow3** (dreamy 3-year-old: 3–4.5 s listen, 2.5–4.5 s between taps,
right 65 %, aims a bit outside, distracted 30 % for 5–15 s); **tapper** (random taps); **spammer** (5–20 taps/s); bots 0.3–1.

| driver / age | session mean (p90, max) | chapter mean (p10–p90) | round | wrong / round | rounds with hint | stars (of 52) |
|---|---|---|---|---|---|---|
| typical 3 | 237 s (261, 280) | 59 s (46–72) | 9.8 s | 0.4 | 7.6 % | 45 |
| **typical 4** | **251 s (265, 289)** | **63 s (50–75)** | 10.7 s | 0.3 | 6.8 % | 47 |
| typical 5 | 256 s (276, 292) | 64 s (41–90) | 11.2 s | 0.2 | 3.9 % | 48 |
| typical 6 / 7 | 201 / 152 s | 50 / 38 s | 7.9 / 4.8 s | 0.1 | 1–2 % | 50 |
| toddler 3 / 4 | 250 / 262 s | 63 / 65 s | 10.8 / 11.6 s | 1.3 / 1.0 | 32 / 26 % | 36 / 38 |
| slow3 3 / 4 / 5 | 359 / 388 / 396 s (max 471) | 90 / 97 / 99 s (21 / 39 / 55 % cut to Talk after 3 rounds) | 18–23 s | 0.8–0.9 | ≈ 22 % | 35–37 |
| tapper (all ages) | 163–231 s | 41–58 s | 6–10 s | 1.5–3.5 | 33–54 % | 30–36 |
| spammer (all ages) | 91–115 s | 23–29 s | 2–3 s | 1.4–2.9 | 37–53 % | 30–36 |
| bot 0.6 / 0.9 / 1 | 135–182 / 119–158 / 116–154 s | 34–46 / 30–39 / 29–38 s | 3–7 s | 1.0 / 0.15 / 0 | 25 / 2 / 0 % | 40 / 49 / 52 |

Typical-child round time by topic (age 4): colours 9.1 s, shapes 9.1 s, count 12.4 s, animals 12.4 s (friends land);
count rounds are the longest at 5–6 (17–18 s, up to 12 pops). Verdict: typical 4-year-old chapter 62.8 s ✔ (60–100),
typical sessions ≤ 292 s ✔ (≤ 8 min), child-model p90 382 s ✔, 2 160 / 2 160 sessions finished, 0 stuck rounds, 0 NaN,
0 errors, 0 / 146 574 homes off-screen, worst pack scale 0.85. Absent child: 11 idle nudges in 5 min (12, 30, 57, 87 … s),
10 Talk re-asks in 2 min (main.js should stop speaking after the 3rd). Determinism (`determinism.js`): 10 / 10 cases replay
identically at 1/30, 1/60 and 1/120 s frames. Content variety (`content_stats.js`): 0 identical consecutive rounds; 4 distinct
targets per chapter for colours / shapes / letters / initial / count; Talk answers spread over every value.

## 10. Deviations from / additions to DESIGN.md
- `w.balloons[]` extra fields: `base` (unshrunk width), `riseU`, `popT`, `cool`, `shakeT`, `glowT`, `alpha`, `strAlpha`,
  `pinned`; `w.friends[]` extra: `alpha, slot, tx, ty, bounces, balloonId, nameValue`; `w.sign.parity` (oddeven);
  `ask.first` / `ask.left`; `wrong.mistakes`; `correct/pop.text`; `land.sprite/nameValue`; `w.solved`, `w.interactive`, `w.canTap(b)`.
- `b.size` already includes `scale` (big/small) and any fit-shrink; strings use the unscaled size.
- Shape key for rectangles is `'rect'` (DESIGN §5.1), not Owl's `'rectangle'` — i18n must name `shape:'rect'`.
- Miu + sign exclusion box also applies in portrait; it shrinks to 240 px only when a crowded round does not fit otherwise.
- Lowest balloon centre is `groundY − max(150, 1.5·size − 50)` (tall portrait age 3: −170) so strings end near the grass.
- Count rounds with > 10 balloons (ages 5–7, N ≥ 9) use spacing 1.05× and may shrink to ≈ 0.85× (≥ 92 px) on a short
  iPad landscape (DESIGN §8 says ≤ 10 balloons; §5.1's N + 2 with N ≤ 12 needs 14).
- Friend terminal speed: drag 2.7 /s gives the 220 px/s of the text (2.2 would give 272).
- Weather particles use a third layer `back` (in front of the scenery, behind balloons) as in Owl; `ambient.wind` is px/s.
- Pacing defaults changed by the playtest (intro 2.5, roundDone 2.2, talkAfterAnswer 2.0, levelDone 2.4).
