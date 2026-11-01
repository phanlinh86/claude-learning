# Playtest report — Mầm's Treasure Reef (headless child models, 2026-11-01)

Harness: `tests/sim/lib.js` (child models + metrics) and `tests/sim/playtest.js` (matrix runner, markdown summary).
`node tests/sim/playtest.js` runs the default matrix in ≈ 2 min (1 260 sessions + a 480-session re-simulation of the
recommended changes); `--quick` ≈ 40 s; `--full` is the matrix below (8 400 sessions, 11.5 min on 2 cores). Raw tables of
the full run: `tests/sim/out/full.md`; same-seed before/after of the recommendations: `tests/sim/out/base.md` §6.

**Matrix (full run):** 7 child models × ages 3–7 × all 6 lagoons × 2 viewports (1280×720 landscape; 720×1280 portrait with
insets top 59 / bottom 34) × 20 seeds = 8 400 lagoons (≈ 134 000 rounds), English (a Vietnamese `--quick` pass shows the
same numbers). Every session drives the real input API only — `pointerDown/Move/Up` at logical coordinates (a dig tap is a
down + up on the mound, a drag is down on the treasure, moves at the child's speed with finger wobble, up) and `talkAnswer`.

| model | what it does |
|---|---|
| perfect | always right, 1.2 s think, drops 20–60 px above the chest opening |
| typical (4 y) | 70 % right first try, 1.5–3 s think, drops 40–90 px above the opening, drags 300–600 px/s, 12 % of actions are a poke-and-hold on a treasure (0.1–0.6 s), taps the plain (crab) mound half the time |
| slow3 (3 y) | 50 % right, 3–5 s think, 12 px finger wobble, lets go midway 15 %, 15 % pokes (0.15–0.8 s), taps spread 1.6× around the mound |
| random | every 0.5–1 s taps a random mound / treasure / bit of sand or drags from a random point to a random point |
| spammer | bursts of 10 taps/s on one spot, double taps, two 1 500 px/s drags back-to-back, then a correct move |
| idle | does nothing for 40 s at every chapter start and at Talk time, then plays like *typical* |
| high | always releases 100–140 px above the chest opening |

Times below are simulated game seconds on the world's own clock (they include the 1.8 s chapter banner, 1.7 s stars, 2.0 s
dance and the child's Talk think). The real game adds ≈ 10 s per lagoon for the fanfare / reef-map screens.

## 1. Headline numbers

| | perfect | **typical 4 y** | slow3 | spammer | idle | high |
|---|---|---|---|---|---|---|
| 6 lagoons, age 3 (min) | 15.3 | **28.9** | 50.9 | 21.0 | 55.4 | 24.5 |
| 6 lagoons, age 4 (min) | 18.1 | **30.3** | 60.8 | 23.8 | 60.1 | 28.0 |
| 6 lagoons, age 5 (min) | 19.5 | **32.3** | 62.5 | 26.7 | 61.5 | 28.0 |
| 6 lagoons, age 6 (min) | 18.2 | **30.5** | 58.0 | 25.8 | 59.4 | 27.4 |
| 6 lagoons, age 7 (min) | 18.4 | **31.3** | 64.6 | 25.5 | 60.9 | 28.4 |
| lagoon (s), age 4 | 157–201 | 260–369 | 422–830 | 172–307 | 546–675 | 232–326 |
| chapter mean (s) / in 60–100 s band | 43 / 22 % | 74 / 32 % | 150 / 37 % | 58 / 39 % | 148 / 0 % | 68 / 35 % |
| chapters cut to 3 rounds by the 75 s limit (age 4) | 0 % | **38 %** | 65 % | 6 % | 64 % | 11 % |
| round mean / p95 (s), age 4 | 7.9 / 14.5 | 16.9 / 40.3 | 40.7 / 108 | 11.8 / 29.1 | 28.6 / 57.9 | 14.2 / 29.4 |
| stuck rounds (> 180 s), all ages | 0 | **0** | 25 of ≈ 17 000 (all drag, just over 180 s, all finished) | 0 | 0 | 0 |
| stars 3 / 2 / 1 (age 4) | 100/0/0 | 52/18/30 | 40/10/50 | 80/5/16 | 52/19/29 | 67/21/12 |
| hints per round (age 4) | 0 | 0.37 | 1.56 | 0.19 | 0.38 | 0.07 |
| pearls per lagoon (age 4) | 202 | 185 | 177 | 199 | 177 | 197 |
| crab taps / crab mounds offered (age 4) | 0 / 463 | 408 / 478 | 334 / 394 | 339 / 459 | 355 / 403 | 377 / 454 |
| photobombs per chapter | 2.00 | 2.00 | 1.95 | 2.00 | 1.99 | 2.00 |
| Talk right | 100 % | 70 % | 49 % | 80 % | 71 % | 68 % |

- **Typical-child estimate for all 6 lagoons: 29–32 min (30–33 min with the UI screens)** — inside the 30–40 min target
  but at the low end, and only because the 75 s chapter limit cuts 30–41 % of her chapters to 3 rounds.
- The **random tapper never finishes a drag round** (0 completed lagoons at ages 4 and 7; 2 115 stuck drag rounds, 0 stuck
  dig rounds). Dig rounds are robust to any input; drag rounds have no rescue.
- The perfect bot takes every star (52/52), the typical child 27–29 stars per lagoon (bronze/silver), slow3 ≈ 22 (bronze).
- Idle model: exactly 2 idle nudges per 40 s wait (12 s, 36 s — back-off works), 3 Talk re-asks (12/24/36 s), never more.
- Determinism: identical event logs for the same seed (typical / random / spammer, both runs); zero event-order anomalies in
  8 400 sessions (no `correct`/`wrong`/`drop`/`land` after `roundDone`, pearl totals always consistent, every `next` names a
  buried queue-head item, every count round ends with count = need: 3 200 / 3 200 perfect, 3 037 / 3 037 typical).
- Geometry: 0 treasures packed outside the play rect, 0 overlapping (centre distance < 0.9 × size) in every drag round of the matrix (≈ 50 000);
  0 of 47 134 drops released 100–140 px above the opening were missed (zone +120 px is enough); 0 near-zone misses.

Per-lagoon means for the typical child (s): age 3 291/300/298/267/279/298 · age 4 310/312/305/302/304/285 ·
age 5 309/301/337/321/336/332 · age 6 298/294/295/327/316/299 · age 7 313/318/300/320/321/303 (lagoons 1–6).

## 2. Issues, ranked

1. **A poke on a treasure held ≥ 0.35 s is a drop** (`tapTime 0.35`). Typical child: 4 097 of 6 835 pokes became drops
   (60 %); slow3: 8 708 of 11 344 (77 %). Consequence: `drop` + `miss` → "miss" sound + an "oops" line instead of Tutu
   naming the treasure (`tap` → `sayName`), `item.misses++` → auto-hint glows after two pokes, and — because resting items can
   sit 74 px above the chests while the drop zone reaches 120 px up — **some pokes land in a chest**: in 72 typical
   sessions 9 pokes counted as a wrong drop (chest shakes, a star lost for touching a shell) and 5 as a correct drop with no
   drag. A non-moving finger can never make an intentional drop, so the time condition is simply harmful.
2. **Chapter time limit 75 s truncates the typical 4-year-old's chapters.** 38 % of her chapters (and 65–80 % of a slow
   3-year-old's) end after 3 rounds; drag chapters average 97 s, so the 4th round is lost in most of them. The limit was meant
   for a slow child, but at 75 s it also removes content from the target player and keeps the total at the bottom of the 30–40
   min window.
3. **Wrong-dig peek overlaps the mound above by 22 px** in every dig round on both viewports (`peekAbove 0.55`: the
   peeking item's centre rises to moundTop − 0.55·drawn, its top reaches 110 px above the mound while the next row's mound
   bottom is 88 px above). Because mound sprites are drawn after peeking items, the top of the peeking treasure disappears
   behind the upper mound exactly when Tutu names it. 2 363 overlapping peeks for the typical child (44 % of peeks); never
   overlaps the chest.
4. **Hints are too short for a slow child.** `hintTime 3` s glow vs a 3–5 s think: slow3 needs 1.4–1.8 hints per round and
   still gets 1 star in 50–59 % of rounds; 25 rounds exceeded 180 s. A drag hint also only fires when *one item* has 2 misses
   (`it.misses`), while a child who errs on different items each time gets none (the dig rule uses the round's mistakes).
5. **A child who cannot drag is never rescued.** Dig rounds always complete (0 stuck in 4 487 random dig rounds), but a
   drag round with random flicks never does (hints glow 10–15× per round, idle nudges 17–22 per round). The game has no
   "watch me" assist (e.g. after 6 misses or 60 s without a correct drop, Tutu flies one treasure home).
6. **Dig chapters are short, drag chapters long** for the typical child: 52 s vs 97 s (only 10 % of dig chapters reach the
   60–100 s band). Dig rounds ask for 1 / 2–3 targets; drag rounds move 4–8 treasures. The variety is good but a 4-year-old
   gets a 50 s dig chapter followed by a 100 s drag chapter.
7. **Slow-child taps around a mound fall on sand**: 8 729 of 43 356 slow3 taps (20 %) landed outside the 24 px tap pad and
   did nothing (none were lost to finger wobble ≥ 24 px). A wider pad costs nothing: columns are 173 px apart, nearest centre
   wins where pads overlap.
8. **Idle nudges while the child is hammering the screen**: the idle timer only resets on a successful grab or `tapMound`,
   so the spammer tapping open mounds / sand / chests hears 44–74 "idle" lines per 6 lagoons (1–2 per round), slow3 219–311
   (its sand taps do not count as activity). Any `pointerDown` should reset `_idleT`.
9. **Variety (bored child).** Within a chapter the structure repeats by design: after the warm-up all drag rounds of a chapter
   are "N chests × 2 shells" (1 633 of 4 800 perfect-run chapters have 3 structurally identical rounds in a row; for dig rounds
   it is 3× the same mound/target count in ≈ 1/4 of chapters). 5–6 % of rounds reuse exactly the previous round's label set
   (same two colours, chests swapped). At plan level, ages 3 and 4 play **colours → colours** in lagoon 1 chapters 1–2 (and
   age 3 colours again in chapter 4). The `sig` re-roll prevents fully identical rounds (0 found).
10. Minor: `round.need` for drag count rounds is only on the basket (the `round` event's `need` is null in count mode — the
    voice gets it from `count` events, so no visible effect); the look-alike rule works as specified (4 579 twin accepts, 0
    `wrong` on a twin).

## 3. Recommended changes (exact values) and what the re-simulation shows

Applied together via `new TR.World({ config })` on the same seeds (typical / slow3 / high / idle × ages 3–7 × 6 lagoons × 2
viewports × 2 seeds, `tests/sim/out/base.md` §6):

| # | file · constant | old → new | why / effect in simulation |
|---|---|---|---|
| 1 | `game/js/world.js` CONFIG `tapTime` | `0.35` → **`1e9`** (no time limit: a finger that never moved 24 px is always a tap) — conservative alternative `1.0` | pokes counted as drops **631 → 0** (typical) / **1 348 → 0** (slow3); no poke can land in a chest any more; hints/round 0.37 → 0.26 (typical), stars unchanged. With `1.0` the same result for holds ≤ 1 s. |
| 2 | `world.js` CONFIG `peekAbove` | `0.55` → **`0.3`** | peek overlaps with the row above **22 px → 0** on both viewports (item centre at moundTop − 0.3·drawn: 80 % of the treasure shows, up from 42 % buried; nothing hidden behind the upper mound). |
| 3 | `world.js` CONFIG `chapterTimeLimit` | `75` → **`100`** | typical: chapters cut 38 % → 7 % (age 4), 6-lagoon estimate **30.3 → 34.4 min** (ages 3–7: 30.8–35.3, all inside 30–40). slow3 gets 20 s more per chapter but, with #4, finishes *faster* (62.1 → 59.1 min at age 4). `110` gives 33.4 min and 7 % cut; `90` leaves 20 % cut. |
| 4 | `world.js` CONFIG `hintTime` | `3` → **`5`** | the glow outlasts a slow child's think: slow3 hints/round 1.57 → 1.06, stuck rounds 25 → 2 (just over 180 s), 6-lagoon 60.8 → 59.1 min; no change for the typical child (0.37 → 0.33) or the perfect bot. |
| 5 | `world.js` CONFIG `moundPad` | `24` → **`40`** | slow3 taps on bare sand around a mound 20 % → 7 % (1 795 → 59 per 60 sessions at age 3 with the 1.6× spread); 0 mis-attributed taps (nearest centre still wins), no effect on other models. |

Net for the **typical 4-year-old: 30.3 → 34.4 min** for 6 lagoons (34–35 min with the UI screens), 7 % of chapters cut,
0 pokes mis-read, 0 peek overlaps, 0 stuck rounds, 0 anomalies.

Code (not CONFIG) recommendations, in priority order:

- **Rescue for drag rounds** (`world.js _drop` / `_step`): after `roundMistakes + misses ≥ 6` in a round, or 60 s of
  interactive time without a `correct`, let Tutu demonstrate once — pick the first idle item, `_planFly` it into its chest
  (emit `correct` with a flag `assist: true` so main.js can say "Watch me!" instead of praising). Dig rounds need nothing.
- **Reset the idle timer on any `pointerDown`** (`world.js pointerDown`: `this._idleT = 0;` before the state check) so a
  tapping child is never called idle; keep the back-off growth.
- **Drag hint on the round's mistakes too** (`_autoHint`: also glow when `this.roundMistakes ≥ hintAfterMisses` and no
  chest glows), matching the dig rule.
- **Content, dig pace** (`content.js buildDig`): `T = warm ? 1 : rng.int(2, 3)` → `rng.int(3, 4)` for later rounds
  (`validate` and the look-alike rule already allow it; keep `M ≥ 5`). Simulated with `--dig-extra 1` (sim-side patch of the
  queue): typical dig chapters 52 → 60 s, 6-lagoon 33.0 → 34.5 min; slow3 +4 min. Optional — apply only if dig chapters
  feel short next to drag chapters after #3.
- **Content, variety** (`content.js PLAN`): age 4 lagoon 1 `['colors:2','colors:3','shapes:2','colors:3']` →
  `['colors:2','shapes:2','colors:3','shapes:3']` (keeps the REQUIREMENT's topics, alternates them); age 3 lagoon 1
  `['colors:2','colors:2','size','colors:2']` → `['colors:2','size','colors:2','shapes:2']`. Within a chapter, avoid reusing
  the previous round's label set: pass `prev.labels` into `makeRound` and re-roll when the sorted label set repeats (today
  only the full `sig` is compared; 5–6 % of rounds repeat the set with swapped chests).

## 4. How the numbers were measured (for the lead)

- Round duration = `round` → `roundDone`; chapter = `level` → `levelDone` (includes Talk); lagoon = `session` → `sessionDone`.
  "Stuck" = no `roundDone` within 180 s of the `round` event (the session is capped at 900 s and then counted as a timeout).
- Tap-as-drop: a poke gesture (down, hold, up without moving) in a drag round that produced a `drop` event; "wrong / correct"
  = the same gesture also produced `wrong` / `correct`.
- Peek overlap: at `item.peek ≥ 0.97` the drawn square of the peeking item vs the sprite rects of the chest and of every
  other mound (and their buried items); the overlap is the smaller of the x / y penetrations.
- Pack check: at `round`, each resting treasure's home square must lie inside `w.playRect` (± 2 px) and centre distances ≥
  0.9 × the larger drawn size.
- Look-alike accept: a correct `dig` whose `itemId` ≠ the queue head at tap time. Flow check: every `next.itemId` must be the
  new queue head and sit in a buried/peeking mound.
- Idle / Talk: `idle` events per round (max), `talkAsk` `n` (max).
- Variety: round kind = topic | mode | (dig: mounds M + targets T, count: N; drag: chests B + items I); a chapter is flagged when
  3 consecutive rounds share the kind; "same label set" compares the sorted labels of the targets (dig) or chests (drag) with
  the previous round.
- The child models are deterministic (seeded per model/age/lagoon/seed/viewport); the full event log of a session is
  byte-identical between two runs.
