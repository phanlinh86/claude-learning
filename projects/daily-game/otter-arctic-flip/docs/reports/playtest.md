# Ollie's Lighthouse Flip: high-speed playtest (2026-11-20)

Report only. No file in `game/` was changed. About 60,000 headless rounds were played with 4 bot skills, 4 human-like models and 9 exploit models, on 3 difficulties and 5 screen layouts. The real page was also played in Chromium at `?speed=8&bot=1`.

## TL;DR
- **The sim matches the game.** At ×8 speed the browser and the headless sim give the same score, floor, hearts, catches and flips (Easy and Normal, landscape and portrait). On Normal the score drifts by 0.3 % (150 points) after 400 s, because the browser's frame split differs slightly. There were no console errors.
- **Pacing is on target.** Floors take 62 / 68 / 72 / 76 s on every difficulty and loop, inside the 45–90 s aim. The first leaf comes at 0.6–1.0 s (p50) and by 1.5 s (p90).
- **The darkness is fair.** In the sim, the Sunset and Night floors are only harder because they are faster and denser, and only by about 10 %. The headlamp beam length has no measurable cost. Portrait is not measurably worse on Easy. It costs 0–20 % more hits on Normal's Lantern Deck.
- **The real problem is the first floor.** The Boot Room is meant to be "slow and calm", but per minute it is the **deadliest floor**, for kids and for casual adults. The struggling 4-year-old fails it in 1 run out of 3 on Easy. The fix is two zone-0 numbers.
- **Score inflation is structural, and raising `multEvery` does not fix it.** ×5 is reached after 8–19 s and is never lost by missing leaves, so it only means "no bump lately". With `multEvery` 10, kids lose 13–29 % of their points on Normal/Hard while experts lose only 1–2 %. That widens the adult–kid gap, which is wrong for a family game. Keep `multEvery` 5 and make the stairway doors worth something instead.
- **No exploit pays off.** Spamming, ping-pong and staying on one side all die within 33–43 s on Easy and 11–16 s on Normal/Hard. They score 2–3× less than a 4–6-year-old.

## CONFIG changes (proposal)
| key | old → new | why |
|---|---|---|
| `zones[0].extraK` (Boot Room) | **1.25 → 1.5** | more calm between hazards on the first floor, so it becomes the gentlest floor per minute, as intended |
| `zones[0].gapK` (Boot Room) | **0.8 → 1.0** | swaps a few props for hatches on floor 1. A late tap at a hatch is forgiven (coyote time), but at a prop it is not: see "Heart loss". So floor 1 gets kinder without getting emptier |
| `finishBonus` | **100 → 500** (optional) | doors were 2–4 % of the score and are now 9–17 %, so climbing floors counts as well as farming leaves. REQUIREMENT.md §Score says "bonus 100 × floor × round", so update that line if you take this change |

Unchanged on purpose: `multEvery` 5, `multMax` 5, `leafPoints` 10, `light.seeExtra` 0.8, every Easy/Normal/Hard preset, and the Sunset/Night zones.

How to apply: `tests/sim/results/proposal.patch` is the two-line diff of `game/js/world.js`, and `tests/sim/proposal-config.json` holds the same overrides. Unit tests: 27/27 pass on the current game **and** on a patched copy. To make that possible, two expectations in `tests/unit/run.js` were hardened. The door test now reads `C.finishBonus` instead of the hard-coded 100/400/800. The determinism test gives its fixed tap script 99 hearts, so a different track cannot end it in a game over. The MECHANICS §3 zone table and §8 density table would need the new numbers. The new Boot Room density (Easy / Normal / Hard) is 14.5 / 26.4 / 35.7 hazards per minute, against 15.8 / 29.6 / 37.9 before.

### Before → after (`node tests/sim/run.js --compare`, 100 rounds × ≤600 s, 960×540)
| diff · player | clear floor 1/2/3/4 % | Boot Room hits per round | surv p50 s | score p50 |
|---|---|---|---|---|
| easy · kid, struggling 4 y | 66/11/2/0 → **82/16/2/0** | 3.79 → **3.06** | 89 → 97 | 5,220 → 6,610 |
| easy · kid 4–6 | 88/48/20/4 → **93/54/19/6** | 2.63 → **2.19** | 128 → 143 | 9,010 → 11,500 |
| easy · kid, steady 6 y | 97/83/64/45 → **100/88/67/48** | 1.77 → 1.47 | 257 → 276 | 20,070 → 24,190 |
| easy · casual adult | 100 ×4 → 100 ×4 | 0.24 → 0.21 | 600 → 600 | 53,990 → 65,540 |
| normal · casual adult | 83/70/61/49 → **90/78/64/48** | 1.23 → 0.89 | 276 → 273 | 28,390 → 29,840 |
| normal · bot 0.5 | 76/57/38/21 → 87/68/44/28 | 1.48 → 1.22 | 171 → 193 | — |
| hard · casual adult | 82/50/26/16 → 86/63/42/24 | 1.37 → 1.28 | 144 → 181 | 14,780 → 19,820 |
| exploits (spam, ping-pong, never) | Easy ≤ 7 % floor 1 → ≤ 6 %; Normal/Hard 0 → 0 | — | 33–43 s → 39–43 s | still 2–3× below a kid |

A second check on fresh seeds (`playtest.js sweep --off 1000`, 200 rounds each, both vision models) agreed. The struggling 4-year-old's floor-1 clear rate went from 69 to 82 (v0) and from 69 to 75 (screen vision). A casual adult on Normal still clears all 4 floors in about half the runs (52 → 55 %), so later floors are not made easier.
Rejected alternatives:
- `extraK` 1.5 alone: it made Normal adults noticeably stronger in one seed set (floor 4: 49 → 61 %), with no extra gain for kids.
- `extraK` 1.4 + `gapK` 1.0: smaller gain.
- `easy.hitK` 0.5: +4 pts on floor 1 only, and a 40 % hit box would let kids see Ollie pass through props.
- `light.seeExtra` 1.2: no measurable effect (see "Darkness").
- `multEvery` 8 or 10: see "Score".

## Player models and the new vision model
- Bots: `OF.Bot` at skill 1 / 0.8 / 0.5 / 0.3.
- Humans: `players.js`, with the struggling 4-year-old (`kid4`), the base 4–6-year-old, the steady 6-year-old (`kid6`) and a casual adult.
- Exploits: spam taps every 80–1000 ms, a flip on every landing, never tapping, and one flip followed by staying on the ceiling. The last one is new: `oneFlip`.
- **Vision** (`tests/sim/playtest.js`, new opt-in fields `viewFn` / `notice` / `darkReact` in `humanPlayer`, defaults unchanged). The original model (`v0`) sees 7 u ahead everywhere, even past the right edge of a portrait screen (4.7 u), and acts on a hazard the moment it appears. Three new variants:
  - `screen`: sees `min(7 u, screenReachUnits())` and needs one reaction time to notice a hazard. This is daylight, or beacons in the dark.
  - `beam`: on lamp floors, sees only `world.beamUnits()` ahead and needs +0.15 s more to notice.
  - `beamOnly`: the beam limit without the extra delay.

## Survival and score (`results/playtest-matrix-base.md`, vision "screen", 100 rounds × ≤600 s)
| diff · player | surv p10/50/90 s | score p10/50/90 | clear floor 1/2/3/4 % | hits/min | pts/min |
|---|---|---|---|---|---|
| easy · bot 1.0 / 0.5 / 0.3 | 600 / 600 / 216–600 | 61.6k / 45.0k / 38.6k (p50) | 100 / 100 / 100–82 | 0 / 0.59 / 1.14 | 6,165 / 4,471 / 4,300 |
| easy · kid, struggling 4 y | 40/87/126 | 1,670/4,930/8,430 | 60/7/0/0 | 4.04 | 3,620 |
| easy · kid 4–6 | 57/114/258 | 3,150/7,570/19,320 | 87/34/14/5 | 2.90 | 4,170 |
| easy · kid, steady 6 y | 109/238/446 | 7,540/18,380/37,240 | 96/81/59/33 | 1.79 | 4,750 |
| easy · casual adult | 600/600/600 | 51.7k/54.0k/56.6k | 100 ×4 | 0.22 | 5,406 |
| normal · bot 0.5 | 46/171/408 | 2.5k/15.1k/39.7k | 76/57/38/21 | 1.42 | 5,480 |
| normal · kid 4–6 / steady 6 y | 30 / 39 (p50) | 1,410 / 2,240 | 5 / 17 (floor 1) | 5.66 / 4.23 | 3,384 / 4,129 |
| normal · casual adult | 53/276/600 | 3.8k/28.4k/65.6k | 83/70/61/49 | 1.00 | 6,170 |
| hard · casual adult | 43/146/401 | 3.0k/14.9k/48.9k | 81/51/28/16 | 1.50 | 6,593 |

Easy is right for 5–6 year-olds and generous for adults (0 game overs in 10 min). Normal/Hard are adult modes, where kids last 20–40 s. For a real 3–4-year-old, even Easy ends on floor 1 or 2 (see the proposal). An even gentler "Little" preset would be a code and UI change, so it is out of scope here.

## Pacing
- Seconds per floor (p50 for every player that cleared it): **62.2 / 68.2 / 72.2 / 76.2**, and 61.7 for the Boot Room of day 2. A floor's length scales with its speed, so floor time does not depend on skill or difficulty. p10–p90 spread: under 1 s.
- First leaf: p50 0.6 s (Hard) to 0.9 s (Easy), p90 at most 1.5 s.
- Time to ×5: p50 8–12 s for bots and adults, 13–20 s for kids.

## Heart loss
| diff · player | hatch % | prop % | on floor / ceiling % |
|---|---|---|---|
| easy · kids (3 models) | 23–25 | 75–77 | 50–51 / 49–50 |
| easy · casual adult | 23 | 77 | 50 / 50 |
| normal · kids | 26–30 | 70–74 | 48–51 / 49–52 |
| normal · casual adult | 14 | 86 | 55 / 45 |
| hard · kids / adult | 30–36 / 15 | 64–70 / 85 | ~50 / ~50 |
| bots (all) | 0 | 100 | ~50 / ~50 |

- **Floor vs ceiling is balanced (45–55 %)**, so neither surface is the hard one.
- **Props cause most hits.** On Easy the hatch share of hits (23–25 %) matches the hatch share of hazards (23–35 %), so `hitK` 0.6 equalises the two for kids. On Normal/Hard, adults hit props about **3–4× more often per hazard** than they fall through hatches. The timing table (`results/baseline.md`) shows why:
  - At a prop, the latest safe tap is 176–233 ms before the edge.
  - At a hatch, a tap still works up to 150–190 ms after the edge (coyote time + paw).

  That 0.35–0.4 s difference is why `gapK` up on floor 1 makes the floor kinder. Bots never fall at all: their coyote save always catches.
- Easy kid hit causes (`causes.js`, 200 rounds): random taps 33 %, misreads of the other surface 19 %, double taps 15 %, forgetting to tap 12 %, late notice 10 %, chasing leaves 6 %, a planned tap that was too late 6 %. This mix is unchanged with the proposal. The kid hurts himself mostly by tapping, not by being too slow.

## Darkness (Sunset / Night): harder only because of speed?
Single floors, starting with full hearts (`results/playtest-floors.md`, 80 rounds, hits/min). "Noon geometry" is Sunset/Night played with the Greenhouse's speed, alt, gapK and extraK, but with their own light.
| diff · player | Greenhouse | Map Library: screen · beam | same, noon geometry | Lantern Deck: screen · beam | same, noon geometry |
|---|---|---|---|---|---|
| easy · kid 4 y | 3.36 | 3.93 · 4.05 | 3.89 · 3.88 | 4.00 · 4.03 | 3.93 · 3.85 |
| easy · kid 4–6 | 2.61 | 3.08 · 3.06 | 2.80 · 2.82 | 2.93 · 3.06 | 2.78 · 2.84 |
| easy · kid 6 y | 1.75 | 1.86 · 2.02 | 1.80 · 1.84 | 1.83 · 2.18 | 1.76 · 1.88 |
| normal · adult | 0.99 | 0.87 · 0.93 | 1.11 · 0.98 | 0.81 · 0.95 | 1.01 · 0.97 |
| hard · kid 6 y | 5.36 | 5.11 · 5.52 | 5.32 · 5.29 | 5.12 · 5.13 | 5.09 · 5.84 |
| hard · adult | 1.46 | 1.36 · 1.58 | 1.39 · 1.70 | 1.53 · 1.37 | 1.39 · 1.64 |

- **Speed and density** add about 10 % for Easy kids: Map Library 3.08 against 2.80 with noon geometry. They add nothing measurable for adults, whose dark floors are even slightly *easier* per minute than the Boot Room.
- **Darkness itself** costs nothing in the sim when the hazard is visible on screen. Beacons glow beyond the beam, so that is the `screen` case. If a child really needs +0.15 s to notice things in the dim, the cost is 0–19 % on Easy and up to +20 % for Hard kids.
- **Beam length** is clamped to the screen edge on Easy, so it equals the screen. On Normal/Hard it is 5.7–6.5 u against 7.1 u of screen. `beamOnly` against `screen` is within noise (`results/playtest-beam.md`). `seeExtra` 1.2 gave no gain, so it stays at 0.8.
- **Portrait** (`results/playtest-portrait.md`, 150 rounds; reach 4.7 u against 7.1 u):
  - Easy: kid 2.74 → 2.61 and kid6 1.74 → 1.83 hits/min on the Boot Room, so no penalty. Easy night speed is 3.35 u/s, which still gives 1.4 s of preview.
  - Normal Lantern Deck: adult 0.84 → 0.98 and kid 5.54 → 6.82, so +17–23 %. 4.29 u/s leaves 1.1 s of preview.
  - Moving the portrait hero to 15 % of the width (a code change; reach 5.1 u) gave no gain.

  Nothing to change for kids. If Normal on iPhone portrait gets complaints, the lever is a smaller portrait unit, not the beam.

## Exploits (`results/playtest-exploits.md`, 100 rounds × ≤600 s)
| diff · player | surv p50 s | score p50 | clear floor 1 % | pts/min |
|---|---|---|---|---|
| easy · never taps (floor only) | 39 | 890 | 3 | 1,575 |
| easy · flip once, stay on ceiling | 37 | 850 | 3 | 1,634 |
| easy · flip on every landing | 33 | 2,040 | 2 | 3,674 |
| easy · spam 150 / 250 / 400 / 700 ms | 33–41 | 1,720–2,110 | 1–8 | 3,070–3,757 |
| easy · kid 4–6 (honest) | 114 | 7,570 | 87 | 4,170 |
| normal/hard · any exploit | 10–16 | 260–390 | 0 | 1,266–2,650 |

- Staying on one side loses: one surface always has hatches and props.
- Spamming catches the most leaves of anyone (82 %, against 62–67 % for honest play), so its points per minute are close to a kid's. But it dies about 3× sooner, so its total is 3–4× lower. That is not an exploit worth fixing.
- Pip's rescue never stalls. The longest rescue is 1.68 s, with 0 NaN, 0 out-of-corridor and 0 stall frames in every row.

## Score: is ×5 too easy to keep? (`results/playtest-score.md`, `playtest-score2.md`)
- A typical score is 4–7k/min for kids and adults and 6–9k/min for bots. About 97 % of it comes from leaves, because there are 130–290 leaves per minute and 55–77 % of them get caught. Doors contribute 2–4 %.
- ×5 is reached in 8–19 s (p50), and 79–99 % of all leaf points on Easy are earned at ×5. Missing a leaf never costs combo, so **×5 just means "no bump in the last ~15 s"**. That is a readable rule for a child, and it cannot be farmed.
- What each lever does:
  - `multEvery` 5 → 10: experts lose 1–2 % (bot 1: 7,459 → 7,359/min on Normal). Kids lose 13–29 % (kid 4–6 on Normal: 3,442 → 2,453). It punishes the wrong player.
  - "A missed leaf halves or resets the combo" (a code change): this cuts every score 2–3× and nearly removes ×5. But 25–45 % of the leaves sit on the other surface and cannot all be caught, so even "a miss keeps 75 %" leaves kids at ×5 0–47 % of the time. That is too harsh for a family game. Rejected.
  - `finishBonus` 100 → 500: score composition becomes 83–91 % leaves and 9–17 % doors. Points per minute rise 9–16 % for players who reach doors and 1–2 % for those who don't (`playtest-score2.md`). This is the only lever that rewards *progress*. Proposed, but optional.
- If smaller numbers are wanted only for looks, halving `leafPoints` (10 → 5) is a pure rescale with no balance effect. It is not recommended.

## Sim ≈ game (`tests/sim/browser.js`, `results/browser.md`)
| page | game s | browser score / floor / catches / flips | sim at 1/60 |
|---|---|---|---|
| `seed=7&diff=normal` 960×540, bot 1 | 406.9 | 49,890 / 5 / 983 / 149 | 49,740 / 5 / 980 / 149 |
| `seed=7&diff=easy` 960×540, bot 1 | 301.6 | 28,690 / 4 / 563 / 87 | 28,740 / 4 / 564 / 87 |
| `seed=5&diff=hard&skill=0.5`, bot 0.5 | 106.1 (game over) | 10,880 / 1 / 249 / 38, 4 hits | 10,930 / 1 / 250 / 38, 4 hits |
| `seed=3&diff=easy`, 390×844 portrait | 307.2 | 32,040 / 4 / 630 / 94 | identical |

Wall-clock speed was ×8.0 to ×8.1. There were no console or page errors.

## Files
- New:
  - `tests/sim/playtest.js` (sections matrix, floors, vision, beam, portrait, exploits, score, score2, sweep; `--seeds`, `--cfg`, `--off`)
  - `tests/sim/browser.js`
  - `tests/sim/results/playtest-*.md`, `browser.md`, `proposal.patch`
  - `baseline.*`, `proposal.*` and `compare.md` from `run.js`
- Changed:
  - `tests/sim/players.js`: opt-in vision fields and `oneFlip`. Defaults are unchanged, so earlier results reproduce exactly.
  - `tests/sim/proposal-config.json`: the proposal above.
  - `tests/unit/run.js`: the two hardened expectations. 27/27 pass before and after the patch.
- Screenshots: `tests/out/browser_*.png` (gitignored).
