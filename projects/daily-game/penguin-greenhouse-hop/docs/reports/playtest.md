# Puddle's Greenhouse Hop — high-speed playtest (2026-11-23)

Report-only pass: nothing in `game/` was edited. All numbers come from the headless `PH.World` + player models in `tests/sim/` (node vm, fixed 1/120 s steps, 1/60 s frames). About **14 000 rounds ≈ 120 simulated hours** in total (baseline + patched run of `run.js`, `growth.js`, `candidates.js`, `kinds.js`, `stalls.js`).

## TL;DR

- **The game is fair and hits its pacing targets.** 0 unavoidable falls in **54 730 oracle-checked falls** (could *any* steering after the last or the previous take-off have saved her? always yes). A casual adult takes **52 / 61 / 75 s per floor** on Easy / Normal / Hard (target 45–90 s). Time to the first point is **0.7 s**, first platform 1.3–1.4 s, first firefly 1.4–1.8 s.
- **Floor 1 on Easy is easy for a 6-year-old:** the kid6 model clears it in a median **67 s**, falls about **1×/min**, and **100 %** of 200 runs are still alive after 15 min. kid5 is alive at 15 min in ≈ 54 % of runs. kid4 runs out of hearts after a median **187 s** (this was already an open item in the fork).
- **Growth is a pure power-up, not a trade-off.** Pinning Puddle at max size **halves** the falls of every model. Turning growth off **doubles** them. Turning the weight off (`steerK 0`) adds **40–200 %** falls. For impulsive players, slower steering means less overshooting, and her feet get wider too. So "heavier = harder" never shows up in the results: the weight changes how she feels, it never punishes. That suits a family game. But it means the hardest moment of every floor is **just after the shrink**: kids fall 2.5–3× more per minute while small than while big.
- **No exploits.** Holding one direction, never steering, or alternating slowly bounces forever on the ground for 2–10 points. Fast alternating or mashing loses hearts in 25–85 s. Deliberately falling to get the umbrella throw gives 54–419 points in 10 min. **Stalling to grow** (bouncing in place until she is max size) earns **3× fewer points per minute** and no more per floor. There is nothing to farm: metres only count new height, and every firefly can be caught once.
- **Leaves and baskets behave well.** A leaf landing hits the `maxBend` clamp in only 0–5 % of cases (at size 1.45+). The bend depth grows with size (0.27 → 0.53 of max), so "heavier bends deeper" reads clearly. Baskets are at their amplitude cap on 3–21 % of landings. No falls point to either one.
- **Recommended patch (2 keys): `growRate 0.004 → 0.006`, `difficulty.easy.widthK 1.5 → 1.6`.** It makes the post-shrink stretch shorter and Easy kinder, without changing adult pacing. Easy kid4 survival goes **187 → 369 s**, kid5 15-min survival **54 → 88 %**, Normal kid6 **235 → 287 s**, kid falls/min **−15 to −30 %**. Casual s/floor stays at **54 / 62 / 77 s**. Still 0 unfair falls in 27 604 checks.

## 1. Method

| model | what it is |
|---|---|
| `bot` 0.3 / 0.5 / 0.7 / 0.85 / 1 | `PH.Bot` (game/js/bot.js): reaction (1−s)·0.3 s, aim noise, bad picks |
| `kid4` / `kid5` / `kid6` | aims at the nearest higher platform's *current* centre (no basket lead), 0.4–0.6 s reaction, overshoots, holds too long, gets distracted |
| `casual` | adult, 250 ms reaction, highest reachable target with a size-aware reach estimate, leads baskets, release-point steering |
| `lagBot0.25` | PH.Bot planning + a fixed 250 ms hand lag (see §6: a model artifact, do not read it as difficulty) |
| exploits | `idle` (never steer), `holdLeft`/`holdRight`, `altFast` (flip every 0.1 s), `altSlow` (0.5 s), `mash` (random 0.2–0.7 s), `fallFarm` (drops on purpose while ≥ 3 hearts), `stallStart` / `stallEnd` (bounce in place until max size at the start / end of each floor) |

Fairness oracle (`lib.js`): for every fall, from the snapshot at the last take-off it tries all two-segment steerings (hold d1 for 0–1.8 s, then d2). If none of them lands, it tries the same from the previous take-off with a one-hop continuation. A fall counts as **unfair** only when both fail.

## 2. Baseline: survival, score, pacing (current CONFIG)

**Bots** (real hearts, 40 rounds × ≤ 600 s; "+" = most runs alive at the cap)

| diff | bot | survival | score med | floor 1 s | s/floor med (p10–p90) | falls/min | fireflies/min | unfair |
|---|---|---|---|---|---|---|---|---|
| easy | 1.0 | 600+ | 17 730 | 45 | 46 (39–53) | 0.00 | 79 | – |
| easy | 0.7 | 600+ | 17 790 | 45 | 46 (39–53) | 0.00 | 81 | 0/2 |
| easy | 0.5 | 600+ | 17 426 | 49 | 49 (41–56) | 0.07 | 79 | 0/28 |
| easy | 0.3 | 600+ | 13 962 | 57 | 53 (45–66) | 0.44 | 70 | 0/175 |
| normal | 1.0 | 600+ | 15 914 | 45 | 48 (44–52) | 0.00 | 64 | – |
| normal | 0.7 | 600+ | 16 346 | 47 | 48 (44–53) | 0.01 | 67 | 0/3 |
| normal | 0.5 | 600+ | 14 456 | 53 | 53 (48–59) | 0.18 | 63 | 0/72 |
| normal | 0.3 | 600+ | 11 480 | 63 | 61 (53–70) | 0.65 | 53 | 0/254 |
| hard | 1.0 | 600+ | 14 299 | 52 | 55 (52–61) | 0.00 | 66 | – |
| hard | 0.7 | 600+ | 14 462 | 53 | 56 (52–61) | 0.00 | 67 | – |
| hard | 0.5 | 600+ | 12 808 | 60 | 63 (57–69) | 0.33 | 60 | 0/131 |
| hard | 0.3 | 600+ (468–600) | 10 976 | 77 | 74 (66–85) | 1.06 | 49 | 0/400 |

**Human-like models** (real hearts, 200 rounds × ≤ 900 s)

| diff | player | survival s med (p10–p90) | score med (p10–p90) | floor 1: reached · med s | s/floor | falls/min | fireflies/min | unfair |
|---|---|---|---|---|---|---|---|---|
| easy | kid4 | 187 (54–431) | 2 467 (471–6 741) | 85 % · 73 | 68 | 4.46 | 48 | 0/3 409 |
| easy | kid5 | 900+ (225–900) | 17 034 | 98 % · 70 | 70 | 2.90 | 51 | 0/6 739 |
| easy | **kid6** | **900+ (900–900)** | 18 248 | **100 % · 67** | 68 | **0.99** | 55 | 0/2 952 |
| easy | casual | 900+ | 25 904 | 100 % · 54 | 55 | 0.07 | 74 | 0/214 |
| normal | kid4 | 34 (17–108) | 238 | 15 % · – | 83 | 5.23 | 33 | 0/822 |
| normal | kid5 | 67 (19–175) | 538 | 46 % · – | 82 | 3.86 | 36 | 0/1 106 |
| normal | kid6 | 235 (29–701) | 2 528 | 82 % · 82 | 79 | 2.16 | 39 | 0/2 168 |
| normal | casual | 900+ | 19 942 | 100 % · 61 | 63 | 0.33 | 54 | 0/994 |
| hard | kid4 | 23 (13–51) | 130 | 3 % · – | 108 | 6.94 | 28 | 0/676 |
| hard | kid5 | 28 (15–75) | 151 | 7 % · – | 101 | 5.83 | 30 | 0/732 |
| hard | kid6 | 65 (20–220) | 514 | 46 % · – | 98 | 3.33 | 34 | 0/1 072 |
| hard | casual | 900+ (650–900) | 16 507 | 99 % · 75 | 78 | 0.83 | 49 | 0/2 316 |

**Per floor** (unlimited hearts, 20 × 600 s; median s · falls/min · size at floor end)

| diff | player | potting | fern | balcony | roof |
|---|---|---|---|---|---|
| easy | kid5 | 76 · 2.7 · 1.50 | 65 · 3.0 · 1.50 | 66 · 2.9 · 1.50 | 67 · 2.9 · 1.50 |
| easy | kid6 | 76 · 0.8 · 1.50 | 61 · 1.0 · 1.50 | 63 · 1.0 · 1.50 | 63 · 1.1 · 1.50 |
| easy | casual | 61 · 0.0 · 1.50 | 50 · 0.1 · 1.50 | 50 · 0.0 · 1.50 | 50 · 0.1 · 1.50 |
| normal | kid6 | 84 · 1.8 · 1.60 | 81 · 2.3 · 1.60 | 80 · 2.4 · 1.60 | 77 · 2.7 · 1.60 |
| normal | casual | 63 · 0.2 · 1.58 | 60 · 0.4 · 1.56 | 59 · 0.2 · 1.55 | 59 · 0.2 · 1.55 |
| hard | kid6 | 102 · 3.0 · 1.60 | 102 · 3.5 · 1.60 | 104 · 5.0 · 1.60 | 102 · 4.7 · 1.60 |
| hard | casual | 76 · 0.8 · 1.60 | 78 · 0.9 · 1.60 | 76 · 0.8 · 1.60 | 74 · 1.0 · 1.60 |

Floor 1 (the potting floor: pots and shelves only) is the slowest floor for kids, because Puddle starts small and the first 20 m have no mushrooms. Floors 2–4 add leaves and baskets, which raises kid falls by about 10–70 %, most on Hard balcony and roof. For casual players the falls barely change between floors. Score is about **46–50 % fireflies**, 25–35 % floor bonuses, 8–17 % ×2 metres, 4–6 % ×1 metres and 7–10 % size bonus.

## 3. The twist: growth and weight

**When she is big and for how long** (`growth.js`, unlimited hearts, 24 × 600 s)

| diff | player | s/floor | big after s | big for s (share of floor) | size at floor end | time at max | falls/min small → big |
|---|---|---|---|---|---|---|---|
| easy | kid5 | 67 | 35 | 33 (49 %) | 1.50 | 17 % | 4.28 → 1.73 |
| easy | kid6 | 65 | 32 | 31 (50 %) | 1.50 | 18 % | 1.35 → 0.42 |
| easy | casual | 52 | 28 | 24 (47 %) | 1.50 | 15 % | 0.16 → 0.00 |
| normal | kid6 | 80 | 41 | 40 (50 %) | 1.60 | 6 % | 3.08 → 1.25 |
| normal | casual | 61 | 34 | 27 (45 %) | 1.56 | 1 % | 0.47 → 0.16 |
| hard | kid6 | 103 | 42 | 61 (59 %) | 1.60 | 20 % | 5.14 → 2.40 |
| hard | casual | 75 | 35 | 40 (53 %) | 1.60 | 9 % | 1.11 → 0.59 |

**What being big does** (variants; falls/min · s/floor)

| diff | player | as shipped | no weight (`steerK 0`) | no growth (size 1) | always max size |
|---|---|---|---|---|---|
| easy | kid5 | 3.06 · 67 | 4.34 · 72 | 5.70 · 80 | 1.43 · 62 |
| easy | kid6 | 0.90 · 65 | 1.95 · 68 | 2.45 · 79 | 0.33 · 59 |
| easy | casual | 0.09 · 52 | 0.15 · 54 | 0.23 · 63 | 0.01 · 48 |
| normal | kid6 | 2.20 · 80 | 3.47 · 91 | 4.25 · 96 | 0.73 · 72 |
| normal | casual | 0.33 · 61 | 0.94 · 69 | 0.66 · 69 | 0.09 · 56 |
| hard | kid6 | 3.56 · 103 | 5.71 · 118 | 6.76 · 125 | 1.72 · 93 |
| hard | casual | 0.84 · 75 | 1.99 · 88 | 1.59 · 82 | 0.35 · 71 |

Reading:
- **Heavy steering never causes unfair falls.** It *removes* falls, because the weight acts like an overshoot damper for 0.4–0.6 s-reaction players. Release drift stays 0.63 u at every size (MECHANICS §1.2), and the generator guarantees every gap at max-size steering. Falls per 100 take-offs are lower while big on every platform kind (for example Easy kid5: pot 5.8 → 1.9, shelf 7.0 → 3.6, leaf 5.6 → 1.9, basket 9.8 → 2.8).
- **"Easier catching but heavier steering" is effectively only "easier".** That is fine for kids. It is a design point, not a bug: if a real trade-off is wanted, it needs a change in code, not CONFIG (§7.3). Raising `steerK` makes it *easier* for kids, not harder.
- **The size bonus is a flat bonus.** Every model, kid4 included, ends almost every floor at `maxSize` (Easy 1.50 at the median, every model), so "size +100/+120" never varies. No skill shows in it, but it doesn't hurt.
- **The shrink starts each floor at the hardest size.** Kids fall 2.5–3× more per minute while small. This is the lever the patch pulls.

**Stalling to grow** (unlimited hearts, 24 × 600 s)

| diff | player | s/floor | pts/min | size at floor end | falls/min |
|---|---|---|---|---|---|
| easy | casual | 52 | 1 512 | 1.50 | 0.09 |
| easy | stallStart | 143 | 482 | 1.50 | 0.02 |
| easy | stallEnd | 53 | 1 501 | 1.50 | 0.10 |
| normal | casual | 61 | 1 169 | 1.56 | 0.33 |
| normal | stallStart | 186 | 335 | 1.60 | 0.06 |
| hard | casual | 75 | 1 018 | 1.60 | 0.84 |
| hard | stallStart | 210 | 363 | 1.60 | 0.23 |

Stalling at the start of a floor costs about 90–135 s per floor (the time growth alone takes 75–150 s) and gains only the ×2 on roughly 50 m. Points per minute drop **3×**, and points per floor do not rise (the pts/floor column in `growth.js` is lower only because stallers reach fewer of the later floors, whose bonuses grow with zone). Stalling at the end of a floor does nothing, because players are already at max size. **Not an exploit.** Stalling is safer (fewer falls/min), but a child doing it simply plays slowly.

## 4. Where falls happen

- **By take-off kind** (all falls, baseline humans): pot 41 %, shelf 33 %, leaf 16 %, basket 10 %. Per 100 take-offs, baskets are the riskiest for kids (Easy kid5 9.8, Normal kid5 12.3 while small), because the kid model aims at where the basket is *now*. Hard leaves come next (kid5 14.9 small / 10.8 big). No kind is out of line for the casual player (≤ 1.9 / 100).
- **While big:** 14–33 % of all falls, always under the big share of time (45–60 %).
- **After a rescue:** 0 % of falls come right after an umbrella throw (the umbrella aims under a reachable platform). After a mushroom: 0–9 %.
- **Leaf flicks:** falls in the hop after a flick are 0.1 (casual) to 12.6 (Hard kid5) per 100 flicks. That equals the leaf fall rate, so flicks add no risk.

**Leaf and basket feel** (`kinds.js`, casual, 12 × 300 s)

| diff | size band | leaf landings at the maxBend clamp | median predicted peak depth | landing on an already-bent leaf | basket amp/ampMax med | basket at cap |
|---|---|---|---|---|---|---|
| easy | 1.0–1.15 | 0 % | 0.30 | 0 % | 0.80 | 13 % |
| easy | 1.45+ | 0 % | 0.49 | 0 % | 0.78 | 21 % |
| normal | 1.0–1.15 | 0 % | 0.27 | 0 % | 0.77 | 5 % |
| normal | 1.45+ | 2 % | 0.53 | 0 % | 0.80 | 8 % |
| hard | 1.0–1.15 | 0 % | 0.27 | 0 % | 0.81 | 3 % |
| hard | 1.45+ | 5 % | 0.52 | 0 % | 0.80 | 14 % |

There is no leaf "slam" (≤ 5 % of landings reach the clamp, where `bendV` is zeroed). The depth roughly doubles from small to max size, so the weight reads clearly on leaves. Baskets settle around 80 % of their cap: the nudges add up but stay inside `ampMax`, which the generator already allows for.

## 5. Exploits and degenerate input (real hearts, 50 × ≤ 600 s)

| diff | player | survival | score med (p10–p90) | max height | falls/min |
|---|---|---|---|---|---|
| easy | idle / holdLeft / holdRight | 600+ | 10 / 2 / 2 | 6 m | 0 |
| easy | altFast (0.1 s) | 85 | 302 | 61 m | 4.02 |
| easy | altSlow (0.5 s) | 600+ | 46 | 18 m | 0.01 |
| easy | mash | 36 | 173 | 36 m | 7.73 |
| easy | fallFarm | 600+ | 54 (2–369) | 30 m | 0.10 |
| normal | altFast / mash | 32 / 27 | 111 / 93 | 22 m | 4.9 / 6.2 |
| hard | fallFarm | 600+ | 419 (5–2 672) | 150 m | 0.38 |

Holding one direction just pins her against a pillar on the ground (no points). Never steering bounces in place at the door. Neither scores. Fall-farming is a net loss: it costs hearts, and the umbrella throw (6.2 u) does not reach anything higher than normal play. A real casual player scores 20 000+ in the same time.

## 6. Other observations

- **Side-platform dead ends (P3).** The generator guarantees a hop *back* from a side platform to its row's path platform (`game/js/world.js:316-324`), but not a hop *up* from it. The casual model, which always looks for higher targets, got stuck 30–250 s on a side platform in 4 of 200 Hard runs (`node tests/sim/stalls.js hard casual`; for example seed 5077, where the side pot is at x 4.8 and the next path shelf is 2.9 u up, at the apex limit). The way out (sideways, back to the row) always exists (the oracle confirms it), and the kid models never stalled longer than 31 s. A real child might bounce there for a while, though. Possible code fix: also require the side platform to reach the *next* path platform, or place side platforms 0.2–0.35 u *below* their row so that going back looks like "down".
- **lagBot stalls (sim artifact, not a game issue).** PH.Bot plans for instant steering. With a 250 ms hand lag added outside it, the bot bounces in place for minutes (stall p90 ≈ 810 s) without falling. The casual model has the same 250 ms delay and never stalls more than 21 s. So ignore lagBot pacing.
- **"Flick!" on almost every leaf.** `flick > 1.001` whenever mass > 1 (`world.js:574-579`), so 99–100 % of leaf bounces count in `stats.leafFlicks`. The renderer pops "Flick!" when `flick > 1.04` (`render.js:356`), which is from size ≈ 1.11 on, i.e. on nearly every leaf after the first 15 s of a floor. Suggest showing it only from `bigAt` (flick ≥ 1.124), or making the two thresholds the same.
- **Idle growth.** Growth runs on every ground bounce (`world.js:406`), so an untouched game shows a max-size Puddle at the door after 2 min. This is harmless (0 points). Optionally, growth could wait until the first new metre.

## 7. Recommended CONFIG patch

```json
{
  "growRate": "0.004 → 0.006",
  "difficulty.easy.widthK": "1.5 → 1.6"
}
```
(as a sim patch: `tests/sim/patch.json` = `{"*": {"growRate": 0.006}, "easy": {"difficulty.easy.widthK": 1.6}}`)

Why:
1. **`growRate` 0.004 → 0.006.** Being big is when kids fall least, and growth over time is the part that does not depend on catching fireflies, so it helps exactly the players who catch fewer. With it, Puddle is big about 4–8 s earlier on every floor (easy 28–35 → 24–28 s) and big for 53–60 % of the floor instead of 45–50 %. It still grows visibly slowly: the 2.5 s e2e check gives +0.015.
2. **Easy `widthK` 1.5 → 1.6.** Pots go 3.6 → 3.84 u and shelves 2.55 → 2.72 u, on Easy only. This targets the 4–5-year-olds on the kids' mode. It does not change casual pacing.
3. Considered and rejected: `easy.gap [1.2, 1.9]` (a little faster, no fewer falls), `growPerFirefly 0.005` with `growRate 0.006` (no better than growRate alone), `bigAt 1.25` (only changes score), higher `steerK` (makes the twist *easier*, and `minVxK` 0.7 caps it anyway), Easy `maxSize` 1.6 (breaks a unit test, and the bigger change goes against the "Easy is a smaller hero" art).

### Before → after (real hearts; run.js, 200 runs × ≤ 900 s for humans, 40 × ≤ 600 s for bots)

| row | survival med s (p10–p90) | floor 1 reached | floor 1 med s | s/floor | falls/min | score med |
|---|---|---|---|---|---|---|
| easy/kid4 | 187 (54–431) → **369 (106–900)** | 85 → **95 %** | 73 → 71 | 68 → 67 | 4.46 → **3.77** | 2 467 → 5 758 |
| easy/kid5 | 900+ (225–900) → **900+ (506–900)** | 98 → 99 % | 70 → 68 | 70 → 68 | 2.90 → **2.33** | 17 034 → 17 848 |
| easy/kid6 | 900+ → 900+ | 100 → 100 % | 67 → **65** | 68 → 66 | 0.99 → **0.67** | 18 248 → 19 089 |
| easy/casual | 900+ → 900+ | 100 → 100 % | 54 → 52 | 55 → 54 | 0.07 → 0.06 | 25 904 → 26 579 |
| normal/kid5 | 67 → **93** | 46 → **55 %** | – → 91 | 82 → 80 | 3.86 → 3.67 | 538 → 979 |
| normal/kid6 | 235 (29–701) → **287 (87–900)** | 82 → **91 %** | 82 → 82 | 79 → 79 | 2.16 → **1.84** | 2 528 → 3 483 |
| normal/casual | 900+ → 900+ | 100 → 100 % | 61 → 61 | 63 → 62 | 0.33 → 0.31 | 19 942 → 20 426 |
| hard/kid6 | 65 → **112** | 46 → **58 %** | – → 108 | 98 → 98 | 3.33 → 3.08 | 514 → 1 189 |
| hard/casual | 900+ (650–900) → 900+ (858–900) | 99 → 98 % | 75 → 75 | 78 → 77 | 0.83 → 0.78 | 16 507 → 16 773 |
| easy/bot0.3 | 600+ → 600+ | 100 → 100 % | 57 → 56 | 53 → 51 | 0.44 → 0.37 | 13 962 → 15 395 |
| normal/bot0.3 | 600+ → 600+ | 97 → 100 % | 63 → 63 | 61 → 59 | 0.65 → 0.51 | 11 480 → 11 927 |
| hard/bot0.3 | 600+ (468–600) → 600+ (147–600) | 100 → 93 % | 77 → 75 | 74 → 73 | 1.06 → 0.95 | 10 976 → 11 148 |
| bots 0.5–1, all diffs | unchanged (600+, 45–63 s/floor, ≤ 0.33 falls/min, every row equal or better) | | | | | |

Independent seeds (`candidates.js`, 24 seeds, different seed range) confirm the direction: Easy kid4 survival 150 → 318 s, kid5 alive at 15 min 54 → 88 %, Normal kid6 242 → 425 s, Hard casual alive 83 → 96 %. The one worse cell, Hard bot0.3 p10 (468 → 147 s; 3 of 40 runs), is not supported by the 24-seed check (alive 67 → 79 %), so it is sample noise. Fairness after the patch: **0 unavoidable in 27 604 checked falls**. Growth after the patch: big after 24–34 s, time at max 19–35 % of a floor (it was 8–20 %), stallStart still earns 2–3× fewer points per minute.

### Tests and docs to update if the patch is applied
- `tests/unit/run.js:469` asserts `[easy, normal, hard].widthK` deep-equals `[1.5, 1.2, 0.95]` → change to `[1.6, 1.2, 0.95]`. This is the **only** unit failure: the other 36 tests pass on a scratch copy with the patch.
- `tests/e2e/functional.js:463`: the label says "growRate ≈ 0.004/s". The check (`+0.004 < Δ < +0.03` over 2.5 s) still passes (Δ ≈ 0.015). Only the label needs updating.
- `docs/MECHANICS.md` §1.2 (`growRate`) and §6 (pacing table), and `docs/DESIGN.md:94` ("≈ 0.004/s").

## 8. Reproduce

```
node tests/sim/run.js --out tests/sim/out/base.json                                   # ≈ 35 min (oracle on every fall)
node tests/sim/run.js --patch tests/sim/patch.json --out tests/sim/out/patched.json
node tests/sim/report.js tests/sim/out/base.json tests/sim/out/patched.json           # §2 / §7 tables
node tests/sim/growth.js 24 [--patch tests/sim/patch.json]                            # §3 (growth, variants, stalling)
node tests/sim/kinds.js 12                                                            # §4 leaf/basket feel
node tests/sim/candidates.js 24 base,rec                                              # §7 independent-seed check
node tests/sim/stalls.js hard casual 200 5000                                         # §6 side-platform dead ends
```
New scripts in this pass: `tests/sim/growth.js`, `tests/sim/kinds.js`, `tests/sim/candidates.js`, `tests/sim/stalls.js`, `tests/sim/patch.json`. `lib.js`, `run.js`, `report.js`, `pacing.js`, `sweep.js` and `probe.js` were already there and were used unchanged.
