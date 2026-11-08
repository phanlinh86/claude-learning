# Clover's Farm Hop — high-speed playtest report

Date 2026-11-08 · build `a1c18ef` (v0.1) · playtester: high-speed sim agent (report-only, `game/` untouched).

## TL;DR

- **Fairness is solid.** Across 10,200 simulated rounds (5,100 with the current CONFIG and 5,100 with the patch), a perfect-information oracle checked 46,283 falls. **No fall was unavoidable**: from the take-off before the fatal hop, some steering always survived. A numeric hop audit of 120,000 generated platform pairs found **0 impossible gaps**, even with the strongest gust blowing against the hop for the whole flight. The minimum spare reach is 1.5 u. Carts at their worst ends are included.
- **P1: Easy is not "comfortably easy for a 6-year-old".** The kid model (age 6) **lasts 53 s and finishes level 1 in 1 % of 200 rounds**. Kids aged 4 and 5 finish it in 0 %. The cause is speed × reaction time. Clover runs at 6.5 u/s, so a 0.25–0.5 s late release puts her 1.6–3 u past the target, and the planks are only ±1.1–1.4 u wide.
- **P1: Normal is far harder for people than the bot suggests.** A casual adult (250 ms) **lasts 34 s on Normal** (3 % finish level 1) and 23 s on Hard. The bot's "skill 0.5 ≈ casual" (DESIGN §5.3) is really a 150 ms player. Pure hand latency is a cliff: the falls/min of the skill-1 planner with added lag jump between 0.10 s and 0.15 s.
- **Recommended CONFIG patch** (9 keys, below; the wind is not touched): the 6-year-old survives **53 s → 247 s, level 1 1 % → 98 % (76 s)**. Casual on Normal: **34 s → 350 s, level 1 3 % → 88 % (77 s/level)**. Casual on Easy: 67 s/level. The skill-1 bot is unchanged (0 falls, 48–56 s/level). The twist stays prominent: gusts now cause **30–43 % of all falls** (was 20–33 %).
- **No exploit gives free climbing.** Holding one side or idling parks Clover on the farmyard ground forever (score 2). Wall-hugging through gusts, button mashing, alternating and deliberate falls all do worse than playing.

## 1. Method

Scripts in `tests/sim/` (node only, no dependencies; they load `game/js/*` through `tests/unit/load.js`):

| script | what it does | runtime |
|---|---|---|
| `lib.js` | player models, round runner, world clone, fairness oracles | – |
| `run.js [--patch p.json] [--out f.json] [--only …]` | the matrix: bots 5 skills × 3 difficulties × 40 rounds (600 s cap); human-like models 5 × 3 × 200 (900 s cap); unlimited-hearts pacing runs 5 × 3 × 20 × 600 s; exploits 8 × 3 × 50 | ≈ 10 min per config |
| `report.js base.json [patched.json]` | the markdown tables of this report (`tests/sim/out/tables.md`) | – |
| `gen-audit.js [--patch]` | climbs the generator to 2,000 u (levels 0–15, loops 0–3) × 20 seeds × 3 difficulties and checks every pair of path platforms with a numeric hop | 1 s |
| `probe.js [--patch]` | spring launch and rescue mat with the hands off | 30 s |
| `sweep.js` | compares candidate patches | – |
| `followups.js` | measures the two proposed code changes by overriding them in the sim process | 2 min |
| `trace.js player arg diff seed T` | prints one round bounce by bounce (for debugging) | – |

**Player models.** They only call `world.steer(-1|0|1)` and read what is on screen: platform positions and visible motion, hero position and velocity, wind state.

| model | reaction | target choice | steering | wind |
|---|---|---|---|---|
| **kid4 / kid5 / kid6** | 0.5–0.6 / 0.45–0.55 / 0.4–0.5 s per action, decides every 0.15 s | the **nearest** platform higher than the last bounce, at its *current* x (no cart lead); a platform up to 0.3 u above the apex counts (misjudged) | holds until "almost there", looking ahead only 0.15 / 0.2 / 0.25 s. Releases come 0.1–0.3 / 0.05–0.15 s late 60 % of the time. Lets go for 0.4–1 s now and then (3.5 % / 2.5 % / 1.5 % per decision) | ignores the warning; only sees the drift |
| **casual** | 250 ms | the highest platform it can reach, with a simple reach estimate. It leads carts from their visible motion and lands on the side nearest the next step | release point, anticipating 80 % of its own lag. It lets go instead of reversing for small overshoots | starts compensating 0.6 s into a gust |
| **lagBot0.25** | 250 ms | the FH.Bot skill-1 planner | the FH.Bot controller, with a pure 0.25 s output delay | anticipates the warning (like the bot) |
| **bot s** | the FH.Bot, skill 1 / 0.85 / 0.7 / 0.5 / 0.3 (lag (1 − s)·0.3 s) | | | |
| exploits | `idle`, `holdLeft`, `holdRight`, `alt0.1` / `alt0.5` (flip every 0.1 / 0.5 s), `mash` (random input every 0.2–0.7 s), `wallHug` (casual, but holds into the wind's wall during every warning and gust), `fallFarm` (casual, but drops off on purpose while it has ≥ 3 hearts, to ride the 6.2 u rescue throw) | | | |

**Fairness oracle.** At every bounce the world is deep-cloned. At a fall, the oracle tries 165 two-segment steering plans from the last take-off: hold d1 for 0–1.8 s, then d2, for d1, d2 ∈ {−1, 0, 1}. The fall counts as *doomed* if none lands on a platform. A doomed fall is only called **unfair** if the take-off before it had no plan that lands *and* leaves a surviving next hop (two-hop search). The oracle has perfect information, so it knows future gusts.

## 2. Key numbers — current CONFIG

Real hearts (Easy 5, Normal and Hard 3). Survival and score are median (p10–p90). "+" = most rounds were still alive at the cap.

| diff | player | survival s | score | climb u/s | level 1 reached · med | s per level | falls/min | gust share of falls |
|---|---|---|---|---|---|---|---|---|
| easy | **kid4** | 34 (23–52) | 174 | 0.97 | **0 %** | – | 8.60 | 20 % |
| easy | **kid5** | 37 (23–58) | 208 | 1.07 | **0 %** | – | 8.12 | 21 % |
| easy | **kid6** | **53 (28–76)** | 337 | 1.10 | **1 %** | 91 | 6.58 | 24 % |
| easy | casual | 900+ (362–900) | 11,938 | 1.56 | 99 % · 72 s | 78 | 2.08 | 33 % |
| easy | lagBot0.25 | 197 (64–542) | 1,431 | 1.15 | 73 % · 90 s | 76 | 2.91 | 27 % |
| easy | bot 1 / 0.7 / 0.5 | 600+ | 12,082 / 11,808 / 7,354 | 2.36 / 2.29 / 1.46 | 100 % · 48 / 49 / 81 s | 54 / 55 / 81 | 0 / 0.04 / 1.49 | – |
| normal | kid6 | 23 (14–35) | 99 | 0.90 | 0 % | – | 7.46 | 25 % |
| normal | **casual** | **34 (17–67)** | 214 | 1.40 | **3 %** | 87 | 5.20 | 24 % |
| normal | lagBot0.25 | 42 (17–106) | 304 | 1.36 | 7 % | 89 | 4.33 | 24 % |
| normal | bot 1 / 0.7 / 0.5 | 600+ / 600+ / **68** | 11,240 / 11,099 / 413 | 2.69 / 2.53 / 1.41 | 100 / 100 / 25 % | 56 / 59 / 90 | 0 / 0.15 / 3.14 | – |
| hard | casual | 23 (14–42) | 134 | 1.36 | 0 % | – | 7.17 | 22 % |
| hard | bot 1 / 0.7 / 0.5 | 600+ / 600+ / 50 | 11,562 / 10,507 / 365 | 3.02 / 2.73 / 1.61 | 100 / 100 / 17 % | 56 / 62 / 99 | 0.02 / 0.35 / 3.33 | – |

- **Time to first point / first platform:** 1.3–1.4 s for everyone (the first hop is at 0.6 s). **First firefly:** median 1.4–1.8 s (bots, casual), 2.4–3.5 s (kids). Fireflies come early everywhere.
- **Level pacing:** skill-1 and 0.7 bots take 48–62 s per level; casual on Easy takes 72–78 s (within 45–90). Casual and kids on Normal and Hard die before level 1 ends. With unlimited hearts their levels take 100–160 s.
- **Gusts by weather** (unlimited hearts; gust-caused falls per gust): casual on Easy 0.14 sunny → 0.26 wind; kid6 on Easy 0.43 sunny → 0.74 wind; casual on Normal 0.35 → 0.48. The windy hill is the hardest level, as designed.

Latency is the whole story. Below are falls/min with unlimited hearts, for the bot's skill-1 planner plus a pure output delay (10 seeds × 240 s):

| hand lag | 0 s | 0.10 | 0.15 | 0.20 | 0.25 | 0.30 | 0.40 |
|---|---|---|---|---|---|---|---|
| maxVx 6.5 (now): easy / normal / hard | 0 / 0 / 0 | 0.02 / 0 / 0.25 | 0.95 / 2.12 / 3.02 | 1.60 / 3.27 / 5.97 | 3.20 / 5.52 / 7.00 | 3.90 / 5.95 / 8.77 | 6.17 / 9.02 / 10.37 |
| maxVx 5.0: easy / normal / hard | 0 / 0 / 0.02 | 0 / 0 / 0.10 | 0.12 / 0.52 / 0.95 | 0.95 / 2.60 / 3.15 | 2.17 / 3.67 / 4.55 | 2.97 / 3.87 / 6.35 | 3.72 / 6.20 / 7.72 |

## 3. Fairness checks

| check | current | after the patch |
|---|---|---|
| falls checked by the oracle (all bots, kids, casual, lagBot) | 19,392 | 26,891 |
| doomed at the last bounce (late commitment, e.g. bouncing on a puff while already moving the wrong way) | 6 (0.03 %) | 17 (0.06 %) |
| **unfair (doomed two hops back)** | **0** | **0** |
| generated path pairs audited (20 seeds × 2,000 u × 3 difficulties) | 60,910 | 60,749 |
| impossible gaps, no wind / strongest gust against the whole hop | 0 / 0 | 0 / 0 |
| … the same from the **centre** of the lower platform (a kid bouncing in the middle) | 0 / 0 | 0 / 0 |
| smallest spare reach under the worst gust (easy / normal / hard) | 3.72 / 1.82 / 1.54 u | 3.08 / 2.11 / 1.78 u |
| Easy level 1: horizontal distance still needed from the centre of a step, med / p90 / max | 0.06 / 1.09 / 1.63 u | **0 / 0.45 / 1.00 u** (68 % of steps need no steering at all) |
| spring launch, hands off → falls (easy / normal / hard) | 7 / 13 / 18 % | 5 / 12 / 11 % |
| spring launch with no possible landing (one-hop oracle from the launch) | 0 of 394 | **1 of 394** (normal seed 30, side bale; see P2-3) |
| rescue mat, hands off → falls again (easy / normal / hard) | **29 / 44 / 48 %** | 34 / 44 / 47 % |

The suspect cases from the brief:
- **The rescue trampoline throws into nothing (P2-1):** yes, when the hands are off. The mat is placed under the spot she fell from (`world.js:562`), often near a wall after an overshoot. The 6.2 u throw then goes straight up, and in 29–48 % of cases nothing is above. With a kid steering, 1–4 % of Easy falls happen straight after a rescue (5–12 % on Normal and Hard). They are always avoidable by steering.
- **A gust during a long jump makes a gap unreachable:** no. Counter-steering accel (34 u/s²) beats the strongest gust (13.75 u/s²), and at full speed a head-wind costs only the spin-up time. The audit confirms ≥ 1.5 u spare.
- **A cart moving away:** no. The generator reserves both carts' full half ranges (`world.js:244`), and the audit uses the worst ends.
- **A regrowing puff:** never harmful. The doomed-bounce cases are all "bounced on a puff while already moving away from the next step". The step before was always fine.

## 4. Exploits

| exploit | result (current CONFIG; the patch changes nothing material) |
|---|---|
| **idle** | Survives on Easy (600+ s) and 230–470 s on Normal / Hard. The gusts drift her onto the first few platforms, max height ≈ 19–30 m, score 47–78. A cute "wind plays for you", not an exploit. |
| **hold left / right** | Clover sits against the fence and bounces on the farmyard ground **forever**: score 2, never loses, never progresses. The ground is only removed once camY > 3 (`world.js:607`) (P3-1). |
| alternate (0.1 s / 0.5 s), mash | Die in 20–40 s, or after 50–190 s for the slow alternation. No free climbing: the walls are soft (−0.35) and the platforms do not touch both walls. |
| wall-hug during gusts | Worse than playing: 48 s on Easy vs 900+ s for the same casual player. The fence is not a safe spot. |
| spring camping | Impossible. After a spring the camera rises 3.4 u above the bale (`world.js:574–577`), so the bale is culled and below the fall line. |
| firefly farming | Impossible. Flies are placed once by the generator and never respawn. |
| deliberate falls (rescue = 6.2 u free throw) | Not worth it: score −90 % vs. honest play (Easy 1,053 vs 11,938 med). |

## 5. Findings

| id | sev | where | finding |
|---|---|---|---|
| P1-1 | **P1** | `game/js/world.js:61` (`maxVx`), `:62` (`landPad`), `:76` (Easy row) | **Easy level 1 is not passable for young kids.** kid6: 1 % finish level 1 and survive 53 s. kid4 and kid5 are at 0 %. Overshoot ≈ maxVx × uncompensated lag (6.5 u/s × 0.3 s ≈ 2 u) exceeds the landing window (bale ±1.84 u, plank ±1.37 u on Easy). |
| P1-2 | **P1** | `world.js:61`, `:77` (Normal row), DESIGN.md §5.3 line 112 | **Normal punishes a normal adult.** Casual (250 ms) survives 34 s and 3 % finish level 1. The tuning target "bot 0.5 ≈ casual" is wrong: bot 0.5 has 150 ms of lag, just past a sharp cliff (table in §2). Calibrate future tuning against the lagBot (0.25 s) or casual model, not bot 0.5. |
| P2-1 | P2 | `world.js:562` (`_fall`: mat at `clamp(h.x)`) | The rescue throw lands nowhere 29–48 % of the time when the child does nothing after a fall, so one mistake becomes two hearts. Suggested code: put the mat under the nearest non-puff platform 1.5–5.5 u above the mat. Measured in `followups.js`: hands-off re-falls **34 % → 0 %**, post-rescue falls 2–5 % → 0 %, kid5 level 1 88 % → 96 %. |
| P2-2 | P2 | `world.js:61`, `:100–111` (reachX, pathLimit) and `bot.js:68` use one global `maxVx` | A per-difficulty top speed would let Easy go slower without touching Normal and Hard. Code: `maxVx` in each `difficulty` row, read as `this.D.maxVx || C.maxVx` in `_stepHero`, `pathLimit/reachX` and the bot. Measured (Easy 4.5 on top of the patch): kid6 survival 246 → 524 s, kid4 level 1 18 → 57 %, kid5 61 → 88 %. |
| P2-3 | P2 | `world.js:272` (side platforms get springs) | A spring on a **side** bale is not covered by the path guarantee. With the slower patch speed, 1 in 394 spring launches had no reachable landing (normal seed 30: side bale at x 2.0, next reachable path plank at x 9.3, 4.3 u up). That is not unfair two hops back (you can avoid the coil), but a child cannot know. Fix: `spring: false` for side platforms, or only when a landing 2.3–7 u up is within reachX. |
| P2-4 | P2 | `world.js:266–274`, `sideChance/sideDx` (`:70`) | Side platforms 5–6 u away can be dead ends: from there the next path step is out of reach and the only way on is back down. With the current speed this is rare. With maxVx 5 it stalled the bot for 570 s (easy seed 1039). The patch's `sideDx [2.5, 5]` removes that case. |
| P3-1 | P3 | `world.js:607` (ground removed only once camY > 3) | Holding one direction (or doing nothing) on the farmyard ground is a soft lock: 600 s, score 2, no feedback. A "tap the other side!" hint after ~8 s without a new platform would help a toddler. |
| P3-2 | P3 | `bot.js:118` (repeat penalty) and `:110` (look-ahead) | The bot can bounce forever on a dead-end side platform instead of dropping back to the path (stalls of 270–570 s seen with the current and patched CONFIG, 1–2 rounds per 120). Only the autopilot (`?bot=1` demo) is affected. A climb-stall timeout that allows a lower target would fix it. |
| P3-3 | P3 | `world.js:574–577` + spring (`springK 1.6`) | A spring launch forces a landing ≥ ~2.2 u above the coil, because the camera rises past it. A hands-off kid falls 5–12 % of the time after a spring. That is fine as "the big boing needs steering", but the coil could be centred on bales only on Normal and Hard (Easy: `springChance` 0.08 → 0.05). Not in the patch. |
| P3-4 | P3 | `tests/unit/run.js:152`, `:373–382`, `:431` | Three unit tests hard-code current CONFIG values: the landPad offset `+ 0.3`, `goal === 140`, and spawned plank `w === 1.7` (× widthK). They fail with the patch (26/29). Update them to read `C.landPad + 0.08`, `C.goal.normal` and `1.7 * C.difficulty.normal.widthK`. |

## 6. Recommended CONFIG patch (`game/js/world.js`)

The patch is also stored as `tests/sim/patch.json`; it was tested through every script above. The wind keys are **unchanged**. A slower Clover makes the same gusts relatively stronger, so the twist's share of falls rises (Easy 33 → 35 %, Normal 24 → 33 %).

| key (line) | old → new | why |
|---|---|---|
| `maxVx` (61) | **6.5 → 5.0** u/s | Overshoot per unit of lag −23 %. Full speed is still reached in 0.15 s. The generator re-derives reach (`pathLimit` → `reachX`), so every gap stays reachable (audit: 0 impossible). |
| `landPad` (62) | **0.22 → 0.32** u | +0.1 u of "toes" on each side, for kids who land on the edge. |
| `lanternSize` (65) | **20 → 15** | A heart back every ≈ 30 s of firefly catching for a kid (was ≈ 45 s). It softens the 5-heart budget without touching the fall rule. |
| `sideDx` (70) | **[3, 6] → [2.5, 5]** u | Keeps side platforms connected at the slower speed (P2-4). |
| `goal.normal` (74) | **140 → 125** u | Casual Normal levels become 77 s (target 45–90). Easy and Hard are unchanged. |
| `difficulty.easy.widthK` (76) | **1.35 → 1.5** | Bales 3.6 u, planks 2.55 u. |
| `difficulty.easy.maxDx` (76) | **3.0 → 2.6** u | 68 % of Easy steps need no steering from the middle of the step (was 47 %). |
| `difficulty.normal.widthK` (77) | **1.0 → 1.2** | The main gain for casual adults on Normal. |
| `difficulty.hard.widthK` (78) | **0.88 → 0.95** | Hard stays hard (casual 75 s, bot 0.5 now survives), but is not a wall. |

**Before → after** (real hearts; 200 rounds per human row, 40 per bot row):

| row | survival med s | level 1 reached | level 1 med s | s per level | falls/min | gust share of falls | score med |
|---|---|---|---|---|---|---|---|
| easy kid4 | 34 → **57** | 0 → **20 %** | – | – → 83 | 8.60 → 6.68 | 20 → 24 % | 174 → 431 |
| easy kid5 | 37 → **104** | 0 → **67 %** | – → 85 | – → 79 | 8.12 → 5.46 | 21 → 26 % | 208 → 911 |
| easy **kid6** | 53 → **247** | 1 → **98 %** | – → **76** | 91 → 78 | 6.58 → 3.52 | 24 → 41 % | 337 → 2,513 |
| easy casual | 900+ → 900+ | 99 → 100 % | 72 → 59 | 78 → **67** | 2.08 → 0.47 | 33 → 35 % | 11,938 → 16,701 |
| easy lagBot0.25 | 197 → **900+** | 73 → 98 % | 90 → 80 | 76 → 75 | 2.91 → 1.94 | 27 → 30 % | 1,431 → 10,901 |
| normal kid6 | 23 → 50 | 0 → 14 % | – | – → 96 | 7.46 → 4.27 | 25 → 29 % | 99 → 306 |
| normal **casual** | 34 → **350** | 3 → **88 %** | – → 77 | 87 → **77** | 5.20 → 1.90 | 24 → 33 % | 214 → 3,740 |
| normal lagBot0.25 | 42 → 291 | 7 → 70 % | – → 122 | 89 → 81 | 4.33 → 1.63 | 24 → 31 % | 304 → 1,986 |
| hard casual | 23 → 75 | 0 → 36 % | – | – → 90 | 7.17 → 3.44 | 22 → 30 % | 134 → 528 |
| easy / normal / hard bot 1 | 600+ (0 falls) | 100 % | 48 / 55 / 55 → 48 / 48 / 54 | 54 / 56 / 56 → 53 / 50 / 56 | ≤ 0.02 | – | ≈ same |
| normal bot 0.5 | 68 → 600+ | 25 → 100 % | – → 61 | 90 → 63 | 3.14 → 0.77 | 27 → 42 % | 413 → 9,432 |
| hard bot 0.5 | 50 → 583 | 17 → 97 % | – → 72 | 99 → 74 | 3.33 → 1.26 | 27 → 42 % | 365 → 8,137 |

Pacing after the patch (unlimited hearts, median s per level: sunny / rain / wind / snow):
- casual Easy: 65 / 64 / 63 / 64
- casual Normal: 79 / 79 / 79 / 73
- kid6 Easy: 82 / 84 / 87 / 80

Every casual level is now inside 45–90 s. Gust-caused falls per gust (kid6 on Easy) still climb from 0.18 in sunny to 0.55 on the windy hill, so the twist reads as the level's challenge.

**Optional, code** (measured with `followups.js` on top of the CONFIG patch, Easy, 100 rounds each):

| | kid4 survival · level 1 | kid5 survival · level 1 | kid6 survival · level 1 | post-rescue falls |
|---|---|---|---|---|
| CONFIG patch only | 54 s · 18 % | 104 s · 61 % | 246 s · 96 % | 1–5 % |
| + Easy-only maxVx 4.5 (P2-2) | 94 s · 57 % | 159 s · 88 % | 524 s · 100 % | 1–4 % |
| + rescue aim (P2-1) | 92 s · 66 % | 167 s · 96 % | 540 s · 100 % | **0 %** |

Apply the patch and also update the three unit tests (P3-4). With the patch on a scratch copy, the other 26 tests pass, including "bot skill 1 survives 10 minutes" and "Easy level 1 ≈ 50–90 s".

## 7. Reproduce

```
cd projects/daily-game/frog-farm-hop
node tests/sim/run.js --out tests/sim/out/base.json                          # ≈ 10 min
node tests/sim/run.js --patch tests/sim/patch.json --out tests/sim/out/patched.json
node tests/sim/report.js tests/sim/out/base.json tests/sim/out/patched.json   # all tables below
node tests/sim/gen-audit.js [--patch tests/sim/patch.json]
node tests/sim/probe.js [--patch tests/sim/patch.json]
node tests/sim/followups.js
node tests/sim/run.js --quick                                                # 20 % sample, ≈ 1.5 min
```

## Appendix — full tables (generated by `report.js`)

**Bot matrix — current CONFIG (real hearts, 40 rounds × ≤ 600 s; "+" = most rounds still alive at the cap)**

| diff | player | n | survival s, med (p10–p90) | score med (p10–p90) | climb u/s | level 1: reached · med s | s per level med (p10–p90) | falls/min | gust share of falls | fireflies/min | 1st platform / 1st firefly s | unfair |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | bot1 | 40 | 600+ (600–600) | 12082 (11847–12303) | 2.36 | 100 % · 48 s | 54 (47–59) | 0.00 | 0 % | 59 | 1.4 / 1.6 | 0/1 |
| easy | bot0.85 | 40 | 600+ (600–600) | 12306 (12073–12542) | 2.35 | 100 % · 48 s | 54 (47–59) | 0.00 | 0 % | 61 | 1.4 / 1.7 | 0/2 |
| easy | bot0.7 | 40 | 600+ (600–600) | 11808 (11392–12720) | 2.29 | 100 % · 49 s | 55 (48–61) | 0.04 | 53 % | 63 | 1.4 / 1.7 | 0/17 |
| easy | bot0.5 | 40 | 600+ (600–600) | 7354 (6388–7754) | 1.46 | 100 % · 81 s | 81 (63–103) | 1.49 | 28 % | 43 | 1.4 / 1.8 | 0/594 |
| easy | bot0.3 | 40 | 371 (92–600) | 4055 (694–7317) | 1.37 | 88 % · 90 s | 82 (67–102) | 2.92 | 30 % | 41 | 1.4 / 1.8 | 0/704 |
| normal | bot1 | 40 | 600+ (600–600) | 11240 (11017–11483) | 2.69 | 100 % · 55 s | 56 (53–59) | 0.00 | 100 % | 57 | 1.3 / 1.5 | 0/1 |
| normal | bot0.85 | 40 | 600+ (600–600) | 11551 (11276–11748) | 2.70 | 100 % · 55 s | 56 (54–59) | 0.00 | 0 % | 60 | 1.3 / 1.4 | 0/1 |
| normal | bot0.7 | 40 | 600+ (600–600) | 11099 (10455–11390) | 2.53 | 100 % · 57 s | 59 (55–64) | 0.15 | 52 % | 58 | 1.3 / 1.4 | 0/60 |
| normal | bot0.5 | 40 | 68 (42–184) | 413 (250–1566) | 1.41 | 25 % · – | 90 (74–116) | 3.14 | 27 % | 34 | 1.3 / 1.4 | 0/192 |
| normal | bot0.3 | 40 | 31 (18–91) | 236 (113–561) | 1.38 | 7 % · – | 85 (84–120) | 4.66 | 27 % | 33 | 1.4 / 1.4 | 0/144 |
| hard | bot1 | 40 | 600+ (600–600) | 11562 (11380–11733) | 3.02 | 100 % · 55 s | 56 (53–60) | 0.02 | 80 % | 58 | 1.3 / 1.4 | 0/10 |
| hard | bot0.85 | 40 | 600+ (600–600) | 11725 (11505–12085) | 3.04 | 100 % · 55 s | 57 (54–61) | 0.03 | 100 % | 60 | 1.3 / 1.4 | 0/11 |
| hard | bot0.7 | 40 | 600+ (600–600) | 10507 (10055–10916) | 2.73 | 100 % · 59 s | 62 (57–69) | 0.35 | 60 % | 56 | 1.3 / 1.4 | 0/141 |
| hard | bot0.5 | 40 | 50 (20–191) | 365 (160–1529) | 1.61 | 17 % · – | 99 (82–123) | 3.33 | 27 % | 34 | 1.3 / 1.4 | 0/179 |
| hard | bot0.3 | 40 | 26 (16–57) | 168 (88–404) | 1.50 | 0 % · – | – | 5.94 | 20 % | 31 | 1.3 / 1.4 | 0/130 |

**Human-like models — current CONFIG (real hearts, 200 rounds × ≤ 900 s)**

| diff | player | n | survival s, med (p10–p90) | score med (p10–p90) | climb u/s | level 1: reached · med s | s per level med (p10–p90) | falls/min | gust share of falls | fireflies/min | 1st platform / 1st firefly s | unfair |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | kid4 | 200 | 34 (23–52) | 174 (108–302) | 0.97 | 0 % · – | – | 8.60 | 20 % | 25 | 1.4 / 2.8 | 0/1044 |
| easy | kid5 | 200 | 37 (23–58) | 208 (123–371) | 1.07 | 0 % · – | – | 8.12 | 21 % | 29 | 1.4 / 2.7 | 0/1084 |
| easy | kid6 | 200 | 53 (28–76) | 337 (161–549) | 1.10 | 1 % · – | 91 (88–92) | 6.58 | 24 % | 31 | 1.4 / 2.6 | 0/1165 |
| easy | casual | 200 | 900+ (362–900) | 11938 (4474–13474) | 1.56 | 99 % · 72 s | 78 (66–93) | 2.08 | 33 % | 46 | 1.4 / 1.8 | 0/5090 |
| easy | lagBot0.25 | 200 | 197 (64–542) | 1431 (447–4472) | 1.15 | 73 % · 90 s | 76 (63–111) | 2.91 | 27 % | 34 | 1.4 / 1.8 | 0/2515 |
| normal | kid4 | 200 | 23 (14–41) | 77 (49–116) | 0.65 | 0 % · – | – | 6.78 | 21 % | 15 | 2.3 / 3.3 | 0/600 |
| normal | kid5 | 200 | 22 (13–38) | 93 (50–151) | 0.77 | 0 % · – | – | 7.27 | 24 % | 18 | 1.4 / 2.9 | 0/600 |
| normal | kid6 | 200 | 23 (14–35) | 99 (61–161) | 0.90 | 0 % · – | – | 7.46 | 25 % | 22 | 1.4 / 2.6 | 0/602 |
| normal | casual | 200 | 34 (17–67) | 214 (117–464) | 1.40 | 3 % · – | 87 (83–110) | 5.20 | 24 % | 32 | 1.4 / 1.7 | 0/691 |
| normal | lagBot0.25 | 200 | 42 (17–106) | 304 (119–669) | 1.36 | 7 % · – | 89 (76–103) | 4.33 | 24 % | 33 | 1.4 / 1.6 | 0/753 |
| hard | kid4 | 200 | 19 (12–39) | 72 (42–107) | 0.68 | 0 % · – | – | 7.51 | 24 % | 14 | 3.2 / 3.4 | 0/600 |
| hard | kid5 | 200 | 21 (13–41) | 79 (44–111) | 0.73 | 0 % · – | – | 7.42 | 22 % | 16 | 2.3 / 3.3 | 0/601 |
| hard | kid6 | 200 | 19 (12–30) | 81 (48–125) | 0.90 | 0 % · – | – | 8.66 | 26 % | 19 | 1.4 / 2.4 | 0/600 |
| hard | casual | 200 | 23 (14–42) | 134 (76–292) | 1.36 | 0 % · – | – | 7.17 | 22 % | 29 | 1.3 / 1.8 | 0/629 |
| hard | lagBot0.25 | 200 | 22 (13–52) | 152 (77–340) | 1.43 | 0 % · – | – | 6.86 | 24 % | 30 | 1.4 / 1.8 | 0/631 |

**Level pacing and gusts by weather — current CONFIG** (unlimited hearts, 20 × 600 s per row; each cell = median s per level · falls/min · gust-caused falls per gust)

| diff | player | sunny | rain | wind | snow | post-rescue falls | spring falls |
|---|---|---|---|---|---|---|---|
| easy | bot0.7 | 55 · 0.0 · 0.00 | 56 · 0.0 · 0.00 | 54 · 0.1 · 0.00 | 52 · 0.1 · 0.01 | 0 % | 0 % |
| easy | bot0.5 | 91 · 1.3 · 0.06 | 78 · 1.6 · 0.11 | 72 · 1.7 · 0.15 | 76 · 1.9 · 0.14 | 0 % | 0 % |
| easy | kid5 | 121 · 9.2 · 0.56 | 101 · 10.8 · 0.75 | 97 · 11.7 · 0.94 | 101 · 11.4 · 0.81 | 3 % | 1 % |
| easy | kid6 | 109 · 7.3 · 0.43 | 105 · 9.0 · 0.66 | 99 · 9.2 · 0.74 | 99 · 9.0 · 0.65 | 1 % | 1 % |
| easy | casual | 75 · 1.6 · 0.14 | 76 · 2.4 · 0.19 | 79 · 2.6 · 0.26 | 75 · 2.4 · 0.19 | 0 % | 1 % |
| normal | bot0.7 | 59 · 0.1 · 0.02 | 58 · 0.2 · 0.01 | 60 · 0.3 · 0.06 | 58 · 0.2 · 0.02 | 0 % | 0 % |
| normal | bot0.5 | 102 · 3.2 · 0.24 | 89 · 2.7 · 0.25 | 86 · 2.9 · 0.24 | 95 · 2.6 · 0.23 | 0 % | 1 % |
| normal | kid5 | 144 · 11.9 · 0.80 | 138 · 13.4 · 0.96 | 138 · 13.9 · 1.15 | 137 · 14.3 · 1.00 | 8 % | 1 % |
| normal | kid6 | 134 · 10.9 · 0.66 | 130 · 12.2 · 0.84 | 130 · 13.0 · 1.09 | 132 · 12.5 · 0.98 | 6 % | 1 % |
| normal | casual | 105 · 5.8 · 0.35 | 103 · 5.8 · 0.37 | 97 · 5.7 · 0.48 | 101 · 6.7 · 0.47 | 2 % | 1 % |
| hard | bot0.7 | 62 · 0.1 · 0.01 | 59 · 0.2 · 0.01 | 64 · 0.8 · 0.09 | 60 · 0.4 · 0.06 | 0 % | 0 % |
| hard | bot0.5 | 107 · 4.6 · 0.32 | 92 · 4.0 · 0.27 | 88 · 3.8 · 0.37 | 96 · 4.1 · 0.35 | 0 % | 1 % |
| hard | kid5 | 166 · 12.7 · 0.82 | 157 · 14.5 · 1.03 | 154 · 15.2 · 1.23 | 148 · 15.0 · 1.06 | 12 % | 1 % |
| hard | kid6 | 158 · 12.7 · 0.68 | 149 · 14.4 · 0.92 | 157 · 14.6 · 1.19 | 144 · 14.1 · 1.12 | 11 % | 1 % |
| hard | casual | 121 · 8.4 · 0.55 | 118 · 8.2 · 0.56 | 116 · 7.6 · 0.73 | 121 · 9.1 · 0.72 | 4 % | 1 % |

**Exploits — current CONFIG** (real hearts, 50 rounds × ≤ 600 s)

| diff | player | survival s med (p10–p90) | score med (p10–p90) | max height med | falls/min | longest stall p90 s |
|---|---|---|---|---|---|---|
| easy | idle | 600+ (324–600) | 78 (22–204) | 30 | 0.25 | 573 |
| easy | holdLeft | 600+ (600–600) | 2 (2–2) | 6 | 0.02 | 599 |
| easy | holdRight | 600+ (600–600) | 2 (2–5) | 6 | 0.00 | 599 |
| easy | alt0.1 | 37 (20–54) | 97 (39–197) | 32 | 8.32 | 16 |
| easy | alt0.5 | 192 (69–457) | 178 (50–400) | 40 | 1.34 | 295 |
| easy | mash | 30 (22–48) | 100 (47–164) | 24 | 9.49 | 17 |
| easy | wallHug | 48 (32–71) | 345 (203–539) | 64 | 6.69 | 8 |
| easy | fallFarm | 253 (83–600) | 1053 (2–2879) | 165 | 1.86 | 599 |
| normal | idle | 466 (114–600) | 47 (33–97) | 19 | 0.30 | 574 |
| normal | holdLeft | 600+ (600–600) | 2 (2–12) | 6 | 0.01 | 599 |
| normal | holdRight | 600+ (600–600) | 2 (2–14) | 6 | 0.00 | 599 |
| normal | alt0.1 | 27 (14–55) | 56 (41–105) | 13 | 5.28 | 39 |
| normal | alt0.5 | 76 (30–234) | 88 (44–143) | 15 | 1.73 | 123 |
| normal | mash | 23 (12–47) | 54 (30–95) | 13 | 6.74 | 31 |
| normal | wallHug | 19 (11–28) | 99 (42–155) | 22 | 9.08 | 7 |
| normal | fallFarm | 37 (18–130) | 142 (66–308) | 19 | 2.63 | 110 |
| hard | idle | 230 (59–600) | 46 (24–86) | 11 | 0.46 | 575 |
| hard | holdLeft | 600+ (600–600) | 2 (2–12) | 6 | 0.00 | 599 |
| hard | holdRight | 600+ (600–600) | 2 (2–14) | 6 | 0.00 | 599 |
| hard | alt0.1 | 29 (11–194) | 54 (33–91) | 7 | 2.73 | 159 |
| hard | alt0.5 | 51 (26–137) | 66 (42–106) | 12 | 2.39 | 92 |
| hard | mash | 23 (13–51) | 59 (31–99) | 12 | 6.24 | 33 |
| hard | wallHug | 18 (10–26) | 79 (43–151) | 21 | 9.71 | 9 |
| hard | fallFarm | 30 (15–123) | 95 (53–167) | 13 | 3.15 | 107 |

**Before → after the recommended patch (real hearts)**

| row | survival med s: before → after | level 1 reached: before → after | level 1 med s | s per level med | falls/min | gust share of falls | score med |
|---|---|---|---|---|---|---|---|
| easy/kid4 | 34 (23–52) → **57 (34–105)** | 0 % → **20 %** | – → – | – → 83 | 8.60 → 6.68 | 20 → 24 % | 174 → 431 |
| easy/kid5 | 37 (23–58) → **104 (45–153)** | 0 % → **67 %** | – → 85 | – → 79 | 8.12 → 5.46 | 21 → 26 % | 208 → 911 |
| easy/kid6 | 53 (28–76) → **247 (120–543)** | 1 % → **98 %** | – → 76 | 91 → 78 | 6.58 → 3.52 | 24 → 41 % | 337 → 2513 |
| easy/casual | 900+ (362–900) → **900+ (900–900)** | 99 % → **100 %** | 72 → 59 | 78 → 67 | 2.08 → 0.47 | 33 → 35 % | 11938 → 16701 |
| easy/lagBot0.25 | 197 (64–542) → **900+ (867–900)** | 73 % → **98 %** | 90 → 80 | 76 → 75 | 2.91 → 1.94 | 27 → 30 % | 1431 → 10901 |
| normal/kid4 | 23 (14–41) → **25 (16–47)** | 0 % → **0 %** | – → – | – → – | 6.78 → 6.77 | 21 → 26 % | 77 → 136 |
| normal/kid5 | 22 (13–38) → **34 (19–59)** | 0 % → **1 %** | – → – | – → 83 | 7.27 → 5.67 | 24 → 26 % | 93 → 171 |
| normal/kid6 | 23 (14–35) → **50 (22–107)** | 0 % → **14 %** | – → – | – → 96 | 7.46 → 4.27 | 25 → 29 % | 99 → 306 |
| normal/casual | 34 (17–67) → **350 (71–845)** | 3 % → **88 %** | – → 77 | 87 → 77 | 5.20 → 1.90 | 24 → 33 % | 214 → 3740 |
| normal/lagBot0.25 | 42 (17–106) → **291 (49–900)** | 7 % → **70 %** | – → 122 | 89 → 81 | 4.33 → 1.63 | 24 → 31 % | 304 → 1986 |
| hard/kid4 | 19 (12–39) → **22 (14–36)** | 0 % → **0 %** | – → – | – → – | 7.51 → 7.73 | 24 → 24 % | 72 → 103 |
| hard/kid5 | 21 (13–41) → **24 (14–42)** | 0 % → **0 %** | – → – | – → – | 7.42 → 7.16 | 22 → 26 % | 79 → 112 |
| hard/kid6 | 19 (12–30) → **30 (16–59)** | 0 % → **0 %** | – → – | – → – | 8.66 → 5.98 | 26 → 29 % | 81 → 153 |
| hard/casual | 23 (14–42) → **75 (27–225)** | 0 % → **36 %** | – → – | – → 90 | 7.17 → 3.44 | 22 → 30 % | 134 → 528 |
| hard/lagBot0.25 | 22 (13–52) → **70 (21–288)** | 0 % → **34 %** | – → – | – → 94 | 6.86 → 2.80 | 24 → 29 % | 152 → 530 |
| easy/bot1 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 48 → 48 | 54 → 53 | 0.00 → 0.00 | 0 → 100 % | 12082 → 12144 |
| easy/bot0.7 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 49 → 49 | 55 → 54 | 0.04 → 0.01 | 53 → 20 % | 11808 → 12513 |
| easy/bot0.5 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 81 → 54 | 81 → 59 | 1.49 → 0.38 | 28 → 40 % | 7354 → 11189 |
| easy/bot0.3 | 371 (92–600) → **600+ (600–600)** | 88 % → **100 %** | 90 → 68 | 82 → 71 | 2.92 → 1.23 | 30 → 35 % | 4055 → 9141 |
| normal/bot1 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 55 → 48 | 56 → 50 | 0.00 → 0.01 | 100 → 100 % | 11240 → 11822 |
| normal/bot0.7 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 57 → 49 | 59 → 51 | 0.15 → 0.02 | 52 → 88 % | 11099 → 12219 |
| normal/bot0.5 | 68 (42–184) → **600+ (600–600)** | 25 % → **100 %** | – → 61 | 90 → 63 | 3.14 → 0.77 | 27 → 42 % | 413 → 9432 |
| normal/bot0.3 | 31 (18–91) → **285 (95–600)** | 7 % → **93 %** | – → 81 | 85 → 75 | 4.66 → 1.82 | 27 → 35 % | 236 → 3040 |
| hard/bot1 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 55 → 54 | 56 → 56 | 0.02 → 0.01 | 80 → 100 % | 11562 → 11297 |
| hard/bot0.7 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 59 → 56 | 62 → 58 | 0.35 → 0.08 | 60 → 67 % | 10507 → 11551 |
| hard/bot0.5 | 50 (20–191) → **600+ (463–600)** | 17 % → **97 %** | – → 72 | 99 → 74 | 3.33 → 1.26 | 27 → 42 % | 365 → 8137 |
| hard/bot0.3 | 26 (16–57) → **113 (29–345)** | 0 % → **53 %** | – → 112 | – → 89 | 5.94 → 2.70 | 20 → 27 % | 168 → 907 |

**Before → after, unlimited hearts (pacing and fall rates)**

| row | survival med s: before → after | level 1 reached: before → after | level 1 med s | s per level med | falls/min | gust share of falls | score med |
|---|---|---|---|---|---|---|---|
| easy/kid6 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 105 → 77 | 105 → 83 | 8.42 → 3.81 | 28 → 43 % | 5062 → 7301 |
| easy/casual | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 71 → 58 | 75 → 64 | 2.22 → 0.40 | 37 → 41 % | 7862 → 10058 |
| easy/bot0.5 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 79 → 56 | 78 → 59 | 1.56 → 0.34 | 29 → 47 % | 7499 → 11289 |
| normal/kid6 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 134 → 97 | 131 → 102 | 12.01 → 6.17 | 31 → 39 % | 4051 → 4943 |
| normal/casual | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 100 → 76 | 102 → 79 | 5.97 → 1.75 | 28 → 33 % | 5318 → 6976 |
| normal/bot0.5 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 95 → 64 | 93 → 64 | 2.91 → 0.74 | 34 → 36 % | 6124 → 9500 |
| hard/kid6 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 158 → 134 | 154 → 136 | 13.93 → 9.10 | 31 → 35 % | 3330 → 4264 |
| hard/casual | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 119 → 98 | 120 → 99 | 8.34 → 3.70 | 32 → 34 % | 4723 → 6049 |
| hard/bot0.5 | 600+ (600–600) → **600+ (600–600)** | 100 % → **100 %** | 108 → 72 | 100 → 74 | 4.19 → 1.23 | 32 → 44 % | 5783 → 8410 |

**Level pacing and gusts by weather — AFTER the patch** (unlimited hearts, 20 × 600 s per row; each cell = median s per level · falls/min · gust-caused falls per gust)

| diff | player | sunny | rain | wind | snow | post-rescue falls | spring falls |
|---|---|---|---|---|---|---|---|
| easy | bot0.7 | 54 · 0.0 · 0.01 | 55 · 0.0 · 0.00 | 55 · 0.0 · 0.00 | 52 · 0.0 · 0.00 | 0 % | 0 % |
| easy | bot0.5 | 60 · 0.2 · 0.01 | 59 · 0.4 · 0.04 | 57 · 0.3 · 0.06 | 57 · 0.5 · 0.05 | 0 % | 0 % |
| easy | kid5 | 86 · 5.0 · 0.31 | 90 · 6.7 · 0.56 | 87 · 7.4 · 0.69 | 87 · 6.7 · 0.59 | 3 % | 1 % |
| easy | kid6 | 82 · 2.3 · 0.18 | 84 · 3.7 · 0.35 | 87 · 5.0 · 0.55 | 80 · 4.4 · 0.48 | 1 % | 1 % |
| easy | casual | 65 · 0.3 · 0.03 | 64 · 0.4 · 0.03 | 63 · 0.5 · 0.06 | 64 · 0.5 · 0.04 | 0 % | 1 % |
| normal | bot0.7 | 52 · 0.0 · 0.00 | 51 · 0.1 · 0.00 | 51 · 0.1 · 0.01 | 50 · 0.0 · 0.00 | 0 % | 0 % |
| normal | bot0.5 | 67 · 0.8 · 0.06 | 61 · 0.7 · 0.06 | 61 · 1.0 · 0.12 | 63 · 0.5 · 0.03 | 0 % | 1 % |
| normal | kid5 | 109 · 5.9 · 0.46 | 105 · 7.8 · 0.66 | 110 · 9.5 · 0.95 | 110 · 8.8 · 0.73 | 4 % | 1 % |
| normal | kid6 | 104 · 4.4 · 0.35 | 100 · 6.7 · 0.57 | 101 · 7.6 · 0.80 | 104 · 7.3 · 0.71 | 3 % | 1 % |
| normal | casual | 79 · 1.8 · 0.10 | 79 · 1.7 · 0.11 | 79 · 1.7 · 0.16 | 73 · 1.8 · 0.18 | 1 % | 1 % |
| hard | bot0.7 | 58 · 0.0 · 0.00 | 58 · 0.1 · 0.01 | 58 · 0.2 · 0.02 | 57 · 0.1 · 0.02 | 0 % | 5 % |
| hard | bot0.5 | 77 · 1.1 · 0.07 | 74 · 1.3 · 0.14 | 72 · 1.2 · 0.15 | 69 · 1.4 · 0.14 | 0 % | 2 % |
| hard | kid5 | 138 · 8.6 · 0.57 | 141 · 10.8 · 0.78 | 140 · 11.2 · 1.00 | 139 · 11.8 · 0.94 | 8 % | 1 % |
| hard | kid6 | 134 · 7.2 · 0.51 | 135 · 8.9 · 0.70 | 138 · 10.7 · 0.96 | 136 · 10.4 · 0.79 | 5 % | 1 % |
| hard | casual | 100 · 3.6 · 0.18 | 99 · 3.3 · 0.27 | 96 · 3.9 · 0.41 | 101 · 4.4 · 0.41 | 1 % | 1 % |

**Exploits — AFTER the patch** (real hearts, 50 rounds × ≤ 600 s)

| diff | player | survival s med (p10–p90) | score med (p10–p90) | max height med | falls/min | longest stall p90 s |
|---|---|---|---|---|---|---|
| easy | idle | 600+ (365–600) | 111 (17–235) | 36 | 0.24 | 570 |
| easy | holdLeft | 600+ (600–600) | 2 (2–5) | 6 | 0.02 | 599 |
| easy | holdRight | 600+ (600–600) | 2 (2–15) | 6 | 0.01 | 599 |
| easy | alt0.1 | 34 (19–53) | 112 (49–236) | 30 | 8.41 | 10 |
| easy | alt0.5 | 202 (61–600) | 172 (48–374) | 42 | 1.23 | 324 |
| easy | mash | 31 (23–47) | 94 (57–222) | 28 | 9.10 | 16 |
| easy | wallHug | 66 (43–97) | 571 (317–1038) | 104 | 6.72 | 7 |
| easy | fallFarm | 600+ (560–600) | 3831 (2–6001) | 462 | 1.95 | 599 |
| normal | idle | 353 (114–600) | 55 (34–148) | 18 | 0.31 | 572 |
| normal | holdLeft | 600+ (600–600) | 2 (2–14) | 6 | 0.00 | 599 |
| normal | holdRight | 600+ (600–600) | 3 (2–14) | 6 | 0.00 | 599 |
| normal | alt0.1 | 30 (13–47) | 63 (39–126) | 18 | 5.83 | 18 |
| normal | alt0.5 | 88 (35–308) | 90 (49–193) | 17 | 1.36 | 206 |
| normal | mash | 23 (13–46) | 69 (25–126) | 17 | 6.67 | 26 |
| normal | wallHug | 26 (14–45) | 164 (66–298) | 37 | 7.29 | 7 |
| normal | fallFarm | 231 (52–532) | 958 (146–3476) | 213 | 2.16 | 196 |
| hard | idle | 266 (77–600) | 54 (34–107) | 13 | 0.41 | 559 |
| hard | holdLeft | 600+ (600–600) | 2 (2–14) | 6 | 0.00 | 599 |
| hard | holdRight | 600+ (600–600) | 2 (2–14) | 6 | 0.00 | 599 |
| hard | alt0.1 | 27 (16–43) | 59 (42–115) | 17 | 6.36 | 21 |
| hard | alt0.5 | 61 (30–196) | 68 (42–162) | 15 | 1.88 | 99 |
| hard | mash | 21 (12–47) | 55 (35–110) | 14 | 7.32 | 29 |
| hard | wallHug | 23 (11–40) | 118 (45–206) | 32 | 8.21 | 8 |
| hard | fallFarm | 89 (32–441) | 247 (79–1047) | 58 | 1.87 | 179 |

**Human-like models — AFTER the patch**

| diff | player | n | survival s, med (p10–p90) | score med (p10–p90) | climb u/s | level 1: reached · med s | s per level med (p10–p90) | falls/min | gust share of falls | fireflies/min | 1st platform / 1st firefly s | unfair |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | kid4 | 200 | 57 (34–105) | 431 (231–919) | 1.35 | 20 % · – | 83 (72–88) | 6.68 | 24 % | 36 | 1.4 / 1.8 | 0/1416 |
| easy | kid5 | 200 | 104 (45–153) | 911 (319–1340) | 1.41 | 67 % · 85 s | 79 (70–90) | 5.46 | 26 % | 39 | 1.4 / 1.8 | 0/1830 |
| easy | kid6 | 200 | 247 (120–543) | 2513 (1126–6280) | 1.45 | 98 % · 76 s | 78 (68–91) | 3.52 | 41 % | 43 | 1.4 / 1.8 | 0/3411 |
| easy | casual | 200 | 900+ (900–900) | 16701 (16066–17198) | 1.93 | 100 % · 59 s | 67 (56–78) | 0.47 | 35 % | 57 | 1.4 / 1.7 | 0/1401 |
| easy | lagBot0.25 | 200 | 900+ (867–900) | 10901 (6426–13421) | 1.35 | 98 % · 80 s | 75 (61–121) | 1.94 | 30 % | 40 | 1.4 / 1.7 | 0/5591 |
| normal | kid4 | 200 | 25 (16–47) | 136 (73–278) | 1.13 | 0 % · – | – | 6.77 | 26 % | 26 | 1.4 / 2.4 | 0/650 |
| normal | kid5 | 200 | 34 (19–59) | 171 (91–360) | 1.16 | 1 % · – | 83 (83–83) | 5.67 | 26 % | 27 | 1.4 / 2.4 | 0/699 |
| normal | kid6 | 200 | 50 (22–107) | 306 (111–798) | 1.22 | 14 % · – | 96 (82–109) | 4.27 | 29 % | 29 | 1.4 / 2.3 | 0/815 |
| normal | casual | 200 | 350 (71–845) | 3740 (538–11009) | 1.67 | 88 % · 77 s | 77 (66–91) | 1.90 | 33 % | 38 | 1.4 / 1.5 | 0/2607 |
| normal | lagBot0.25 | 200 | 291 (49–900) | 1986 (274–8189) | 1.20 | 70 % · 122 s | 81 (66–128) | 1.63 | 31 % | 28 | 1.4 / 1.5 | 0/2058 |
| hard | kid4 | 200 | 22 (14–36) | 103 (53–173) | 1.08 | 0 % · – | – | 7.73 | 24 % | 22 | 2.2 / 2.8 | 0/614 |
| hard | kid5 | 200 | 24 (14–42) | 112 (62–240) | 1.10 | 0 % · – | – | 7.16 | 26 % | 24 | 1.4 / 2.4 | 0/627 |
| hard | kid6 | 200 | 30 (16–59) | 153 (74–346) | 1.17 | 0 % · – | – | 5.98 | 29 % | 26 | 1.4 / 2.3 | 0/684 |
| hard | casual | 200 | 75 (27–225) | 528 (163–1997) | 1.66 | 36 % · – | 90 (81–105) | 3.44 | 30 % | 34 | 1.3 / 1.5 | 0/1134 |
| hard | lagBot0.25 | 200 | 70 (21–288) | 530 (150–2269) | 1.40 | 34 % · – | 94 (77–154) | 2.80 | 29 % | 30 | 1.3 / 1.5 | 0/1159 |

**Bot matrix — AFTER the patch**

| diff | player | n | survival s, med (p10–p90) | score med (p10–p90) | climb u/s | level 1: reached · med s | s per level med (p10–p90) | falls/min | gust share of falls | fireflies/min | 1st platform / 1st firefly s | unfair |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | bot1 | 40 | 600+ (600–600) | 12144 (11834–12345) | 2.37 | 100 % · 48 s | 53 (47–59) | 0.00 | 100 % | 59 | 1.4 / 1.7 | 0/1 |
| easy | bot0.85 | 40 | 600+ (600–600) | 12225 (12009–12527) | 2.34 | 100 % · 48 s | 54 (47–59) | 0.00 | 0 % | 60 | 1.4 / 1.6 | – |
| easy | bot0.7 | 40 | 600+ (600–600) | 12513 (12130–12856) | 2.33 | 100 % · 49 s | 54 (47–60) | 0.01 | 20 % | 63 | 1.4 / 1.6 | 0/5 |
| easy | bot0.5 | 40 | 600+ (600–600) | 11189 (10424–11596) | 2.08 | 100 % · 54 s | 59 (51–69) | 0.38 | 40 % | 62 | 1.4 / 1.7 | 0/152 |
| easy | bot0.3 | 40 | 600+ (600–600) | 9141 (8053–9483) | 1.68 | 100 % · 68 s | 71 (59–86) | 1.23 | 35 % | 51 | 1.4 / 1.7 | 0/493 |
| normal | bot1 | 40 | 600+ (600–600) | 11822 (11484–12947) | 2.72 | 100 % · 48 s | 50 (48–53) | 0.01 | 100 % | 53 | 1.3 / 1.5 | 0/3 |
| normal | bot0.85 | 40 | 600+ (600–600) | 12089 (11838–13273) | 2.73 | 100 % · 48 s | 50 (47–53) | 0.00 | 100 % | 57 | 1.3 / 1.5 | 0/2 |
| normal | bot0.7 | 40 | 600+ (600–600) | 12219 (11974–12499) | 2.68 | 100 % · 49 s | 51 (48–55) | 0.02 | 88 % | 58 | 1.3 / 1.4 | 0/8 |
| normal | bot0.5 | 40 | 600+ (600–600) | 9432 (8961–9734) | 2.10 | 100 % · 61 s | 63 (55–73) | 0.77 | 42 % | 49 | 1.3 / 1.4 | 0/306 |
| normal | bot0.3 | 40 | 285 (95–600) | 3040 (885–8137) | 1.70 | 93 % · 81 s | 75 (64–88) | 1.82 | 35 % | 40 | 1.3 / 1.4 | 0/434 |
| hard | bot1 | 40 | 600+ (600–600) | 11297 (11094–11688) | 3.04 | 100 % · 54 s | 56 (53–60) | 0.01 | 100 % | 55 | 1.3 / 1.4 | 0/5 |
| hard | bot0.85 | 40 | 600+ (600–600) | 11484 (11293–11826) | 3.04 | 100 % · 55 s | 56 (53–60) | 0.01 | 75 % | 57 | 1.3 / 1.4 | 0/4 |
| hard | bot0.7 | 40 | 600+ (600–600) | 11551 (11300–11771) | 2.97 | 100 % · 56 s | 58 (55–62) | 0.08 | 67 % | 59 | 1.3 / 1.4 | 0/33 |
| hard | bot0.5 | 40 | 600+ (463–600) | 8137 (4891–9239) | 2.18 | 97 % · 72 s | 74 (64–86) | 1.26 | 42 % | 46 | 1.3 / 1.4 | 0/469 |
| hard | bot0.3 | 40 | 113 (29–345) | 907 (162–3478) | 1.71 | 53 % · 112 s | 89 (78–106) | 2.70 | 27 % | 36 | 1.3 / 1.4 | 0/280 |
