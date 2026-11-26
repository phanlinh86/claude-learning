# Wisp's Rooftop Bounce — high-speed playtest report

2026-11-26 · report only (nothing in `game/` was changed) · simulator: `tests/sim/deep.js` (+ `tests/sim/cmp2.js` for before/after tables)

```
node tests/sim/deep.js --n 40 --exp all                       # baseline: 1 320 games of up to 600 s + experiments, ≈ 35 s wall
node tests/sim/deep.js --n 40 --exp all --patch REC_CFG+LAY   # recommended CONFIG + LAYOUTS changes
node tests/sim/deep.js --n 40 --exp all --patch REC+LAY       # … plus the optional world.js fix (release keeps the stall clock)
node tests/sim/cmp2.js out/deep_baseline.json out/deep_REC_CFG+LAY.json   # (with --out files written by the runs above)
```

Patches are applied to a fresh vm copy of `game/js` (`World.CONFIG`, `World.LAYOUTS`, or, for the two code ideas, a
`World.prototype._release` wrapper). The game files are never touched.

## 1. Player models

All models use only `setPaddleTarget(x)` and `serve()`, like a finger and a tap. Sim step 1/60 s; the world runs 1/120 s sub-steps.

| model | what it does |
|---|---|
| `bot0.2 … bot1.0` | the shipped `WRB.Bot` at skill 0.2 / 0.4 / 0.6 / 0.8 / 1.0 (predicts, aims, grabs items, aims and releases the stuck pearl) |
| `kid4` (4-year-old) | sees the pearl 0.75 s late, puts the finger where it *is*, overshoots 50 %, hand noise ±0.7 u plus jitter, looks away every ≈ 12 s for 1.5–4 s, serves late (40 % never: auto-serve), releases by hand only 40 % of the time, chases 25 % of the items |
| `kid56` (5–6-year-old) | 0.45 s late, overshoots 35 %, noise ±0.45 u plus jitter, stops moving every ≈ 15 s for 1–3 s, 70 % of releases by hand (no aiming), chases 45 % of the items |
| `adult` (casual) | 0.22 s late, predicts the landing once the pearl is below y 6 (σ 0.3 u), grabs low items, never aims, releases after ≈ 0.6 s |
| `spamTrack` | `adult` tracking plus `serve()` on **every frame**: instant serve, instant release, no aiming |
| `parkSpam8` | keeps Wisp still in the middle and spams `serve()` |
| `botSpam0.8` | the bot at skill 0.8, but it releases a stuck pearl at once (abuses "never lost while stuck") |

## 2. Baseline results (shipped CONFIG, n = 40 seeds per cell, cap 600 s)

### 2.1 Survival, score, first point

| model | diff | game over | survival p10 / p50 s | zones p10/p50/p90 | clears zone 1 | score p10/p50/p90 | points / min | first point p50 / p90 s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| bot0.2 | easy | 0 % | 600 / 600 | 6/7/7 | 100 % | 6070/6585/7035 | 655 | 1.4 / 1.9 |
| bot0.6 | easy | 0 % | 600 / 600 | 7/7/8 | 100 % | 7125/7565/8185 | 762 | 1.1 / 1.4 |
| bot1.0 | easy | 0 % | 600 / 600 | 7/8/8 | 100 % | 7375/7885/8395 | 787 | 0.9 / 1.0 |
| bot0.2 | normal | 100 % | 29 / 84 | 0/1/3 | 85 % | 305/1235/3230 | 783 | 1.2 / 1.7 |
| bot0.4 | normal | 80 % | 90 / 325 | 1/5/9 | 100 % | 1175/4725/8565 | 846 | 1.1 / 1.5 |
| bot0.6 | normal | 5 % | 600 / 600 | 9/10/10 | 100 % | 9270/9935/10495 | 990 | 1.0 / 1.3 |
| bot1.0 | normal | 0 % | 600 / 600 | 10/11/11 | 100 % | 10540/11280/12125 | 1121 | 0.8 / 0.9 |
| bot0.4 | hard | 100 % | 14 / 44 | 0/1/1 | 50 % | 195/515/1325 | 903 | 1.0 / 1.4 |
| bot0.8 | hard | 13 % | 498 / 600 | 10/12/13 | 100 % | 9295/12285/13175 | 1234 | 0.8 / 1.0 |
| **kid4** | **easy** | **100 %** | **57 / 76** | 0/0/1 | **38 %** | 380/485/1545 | 484 | 3.4 / 3.6 |
| **kid56** | **easy** | **100 %** | **171 / 259** | 1/2/3 | 98 % | 1415/2250/3835 | 530 | 2.5 / 3.6 |
| kid4 / kid56 | normal | 100 % | 13 / 16 and 14 / 19 | 0 | 0 % | ≈ 100–170 | — | — |
| adult | easy | 0 % | 600 / 600 | 4/5/5 | 100 % | 4310/5085/5655 | 501 | 1.3 / 1.4 |
| adult | normal | 10 % | 600 / 600 | 6/6/7 | 100 % | 5935/6495/7240 | 657 | 1.1 / 1.3 |
| adult | hard | 100 % | 48 / 75 | 1/1/2 | 95 % | 640/830/2160 | 748 | 1.1 / 1.2 |
| spamTrack | easy | 0 % | 600 / 600 | 4/5/5 | 100 % | 4570/5170/5520 | 513 | 0.6 / 0.6 |
| parkSpam8 | easy | 100 % | 36 / 44 | 0/0/0 | 3 % | 275/365/445 | 478 | 0.6 / 0.6 |
| botSpam0.8 | easy | 0 % | 600 / 600 | 7/7/8 | 100 % | 7210/7595/8160 | 764 | 1.0 / 1.3 |

The first point always comes within 4 s. For children it is mostly the 3 s auto-serve plus the flight up.

### 2.2 Zone pacing (target 45–90 s) and stalls

| model | diff | zone p10/p50/p90 s | round-1 p50 per zone (Cloud / Spires / Gardens / Lanes) | in 45–90 s | last 3 blocks p50/p90 s | last block p50/p90/max s | longest gap with no block hit (incl. stuck time) max s |
|---|---|---:|---:|---:|---:|---:|---:|
| bot0.2 | easy | 60/84/106 | 62 / **95** / 84 / **92** | 64 % | 13/23 | 5/11/19 | 20.0 |
| bot0.6 | easy | 54/73/91 | 55 / 77 / 70 / 85 | 87 % | 10/18 | 3/9/20 | 20.1 |
| bot1.0 | easy | 52/70/89 | 52 / 78 / 71 / 85 | 89 % | 8/16 | 2/7/21 | 18.3 |
| bot0.6 | normal | 39/55/70 | 40 / 59 / 56 / 57 | 77 % | 8/14 | 3/6/14 | 13.6 |
| bot1.0 | hard | 33/43/54 | 32 / 43 / 43 / 50 | 39 % | 5/7 | 1/3/10 | 10.3 |
| kid4 | easy | 58/72/96 | 71 / **102** / – / – | 88 % | **19/34** | 9/19/20 | 13.4 |
| kid56 | easy | 64/85/116 | 73 / **107** / 89 / **94** | 61 % | **17/32** | 7/15/30 | **28.2** |
| adult | easy | 75/110/161 | 81 / **132** / **110** / **142** | **30 %** | 16/26 | 6/12/26 | **26.3** |
| adult | normal | 61/85/111 | 67 / 93 / 92 / 92 | 59 % | 14/23 | 4/9/22 | 21.7 |
| spamTrack | easy | 73/110/151 | 80 / 126 / 110 / 147 | 32 % | 15/28 | 6/15/26 | 25.7 |

- **The Skyscraper Spires (zone 2) and Lantern Lane (zone 4) are the slow zones**: 8 and 10 tough blocks, 54 and 58 hits needed. Every non-bot player is over 90 s there on Easy.
- The last 3 blocks take 13–17 % of a zone for the bots, but **22–27 % for the children** (p90 32–34 s).
- The anti-stall keeps the worst gap with no block hit at about 18–28 s. The longest gaps happen to players who do not aim (adult, spamTrack, kid56). The cause is `_release()`: it sets `noBrickT = 0`, so **every magnet release restarts the 5 s anti-stall clock**. While the magnet is on, a player who does not aim never gets the anti-stall help.

### 2.3 Magnet, items, hearts

| model | diff | gems caught | bubbles caught | magnet on (time) | sticks / min | released by hand | lost / min | net saves / min | min hearts p10 | time at 5 hearts |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bot0.2 | easy | 64 % | 61 % | ≈ 19 % | 5.2 | 98 % | 0.0 | 0.8 | 3 | 83 % |
| bot1.0 | easy | 67 % | 66 % | ≈ 24 % | 7.5 | 99 % | 0.0 | 0.0 | 3 | 87 % |
| bot0.6 | normal | 63 % | 63 % | ≈ 22 % | 9.2 | 99 % | 0.7 | 0.7 | 1 | 61 % |
| bot1.0 | normal | 62 % | 61 % | | 10.2 | 99 % | 0.1 | 0.4 | 3 | 86 % |
| bot0.4 | normal | 62 % | 65 % | | 7.6 | 98 % | 1.8 | 0.9 | 0 | 15 % |
| kid4 | easy | 69 % | 70 % | ≈ 18 % | 2.1 | 33 % | **2.3** | **6.7** | 0 | 2 % |
| kid56 | easy | 69 % | 67 % | ≈ 18 % | 2.5 | 70 % | **1.5** | 4.7 | 0 | 21 % |
| adult | easy | 86 % | 85 % | ≈ 19 % | 4.3 | 97 % | 0.0 | 0.0 | 3 | 83 % |
| adult | normal | 74 % | 77 % | | 5.2 | 97 % | 0.6 | 0.5 | 1 | 50 % |
| parkSpam8 | easy | 40 % | 0 % | 0 % | 0 | – | 4.0 | 10.8 | 0 | 0 % |

**Hearts economy**
- **Easy: yes, children run out.** kid4 loses all its hearts in every game (p50 76 s; 38 % ever clear the Cloud Deck). kid56 loses them in every game too (p50 259 s, about 2 zones). Both look away for a few seconds now and then. The 8 net saves per zone last a 4-year-old only about 70 s (6.7 saves per minute). Bots and adults never lose a heart on Easy and sit at 5 hearts 83–87 % of the time.
- **Normal is not too generous.** Competent players (bot ≥ 0.6, adult) spend 50–86 % of the time at the 5-heart cap, so extra hearts are wasted there. But bot0.4 still ends 80 % of its games within 10 min, adult 10 %, and children last 16–19 s. Normal sorts players by skill as it should, so I recommend no change.

### 2.4 Does sticking help? (branch experiment)

Each seed is replayed with the bot until 3 blocks are left, then the game branches. The table shows the seconds from "3 left" to the clear, as p50/p90. `[n died]` means the game ended before the clear.

| diff | bot skill | A: bot, no magnet | B: magnet, **aimed** release | C: magnet, **instant** release (no aim) | D: kid56 + magnet | E: kid56, no magnet |
|---|---:|---:|---:|---:|---:|---:|
| easy | 0.4 | 9/18 | **6/11** | 18/25 | 20/33 | 17/25 |
| easy | 0.8 | 7/12 | **6/7** | 18/25 | 21/31 | 18/26 |
| normal | 0.4 | 10/13 | **5/7** | 14/23 | 13/20 [22 died] | 12/18 [24 died] |
| normal | 0.8 | 6/9 | **5/6** | 13/17 | 14/22 [22 died] | 11/19 [22 died] |
| hard | 0.8 | 5/8 | **4/5** | 10/14 | – | – |

- **Aiming with the stuck pearl works.** It cuts the last-3 time by 15–50 % and makes the p90 much tighter (Easy 0.4: 18 → 11 s).
- **Sticking without aiming is slower than having no magnet at all**, about twice as slow (C vs A). For a child who does not aim it is about +3 s at p50 and +7 s at p90 (D vs E). The released pearl goes straight back up the lane it came down. Every release also restarts the stall clock (§2.2), so the anti-stall never steps in.
- In natural play a magnet is running when the last 3 blocks are reached in only 10–20 % of zones.

### 2.5 Exploits and robustness

| check | result |
|---|---|
| NaN / non-finite state (pearl, Wisp, gems, score), every frame of 1 320 × 600 s games and 6 one-hour runs | **0** |
| Pearl trapped bouncing sideways between the top row and the ceiling | **No.** `MIN_VY_K` keeps \|vy\| ≥ 0.38·speed. The longest run above the top block is 5.4 s (kid56). Up to 34 ceiling hits in a row happen, but that is the intended "rattle along the top", which breaks a top block on most passes |
| Endless loop / no-score stall (one hour, bot 1.0 on E/N/H, bot 0.6, botSpam, kid56) | longest gap with no score 6–18 s; no loop |
| Stick + release for endless safe points | **No.** All points come from blocks, gems and clears. botSpam0.8 scores 764 points/min vs 762 for bot0.6, and spamTrack 513 vs 501 for adult, so the exploit gains nothing. The pearl can't be lost while stuck, but it auto-releases after 1.5 s and the magnet lasts 12/10/8 s, renewed only by the 2–3 magnet blocks per zone |
| Keeping Wisp still in the middle + spamming serve | loses: Easy 44 s p50, Normal 9 s; clears zone 1 in 3 % of games |
| Spamming serve while playing normally | first point 0.3–0.6 s, no other effect |

## 3. Recommended changes and their measured effect

### 3.1 CONFIG and LAYOUTS (data only)

| key | old → new | why |
|---|---|---|
| `DIFF.easy.netSaves` | **8 → 12** | children used up 8 saves in about 70 s (kid4) |
| `DIFF.easy.paddleW` | **3.6 → 4.2** | a wider Wisp for late, jittery hands. The art scales with w, so Wisp is drawn 17 % bigger |
| `ANTI_STALL` | **5 → 3** | the end of a zone drags for players who don't aim |
| `LAYOUTS[1]` (Spires) row 0 | `....tt....` → `....bb....` | 8 → 4 tough blocks, 54 → 48 hits |
| `LAYOUTS[1]` row 5 | `bgbbttbbgb` → `bgbbbbbbgb` | |
| `LAYOUTS[1]` row 6 | `bbbbbbbbbb` → `.bbbbbbbb.` | open ends let the pearl climb the side lanes, as in the other zones |
| `LAYOUTS[3]` (Lanes) row 5 | `tbt.tbt.tb` → `bbb.bbb.bb` | 10 → 5 tough blocks, 58 → 53 hits |

The new layouts still meet the unit-test rules: 7 × 10 grid, 2–3 magnet blocks, at least 2 gem blocks, and the Cloud Deck has no tough blocks.

The measured effect (`REC_CFG+LAY` vs. baseline, n = 40, cap 600 s):

| model | diff | game over | survival p50 s | clears zone 1 | zones p50 | zone p50 s | in 45–90 s | last 3 p50/p90 s | longest gap (incl. stuck) max s |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| kid4 | easy | 100 % → **95 %** | 76 → **283** | 38 % → **95 %** | 0 → 2 | 72 → 89 | 88 % → 53 % | 19/34 → 16/29 | 13 → 18 |
| kid56 | easy | 100 % → **0 %** | 259 → **600** | 98 % → 100 % | 2 → **6** | 85 → 87 | 61 % → 57 % | 17/32 → 16/27 | 28 → 22 |
| adult | easy | 0 % → 0 % | 600 | 100 % | 5 → 5 | **110 → 96** | 30 % → 41 % | 16/26 → 12/23 | 26 → 22 |
| adult | normal | 10 % → 10 % | 600 | 100 % | 6 → 7 | **85 → 74** | 59 % → **83 %** | 14/23 → 12/18 | 22 → 21 |
| spamTrack | easy | 0 % | 600 | 100 % | 5 → 6 | 110 → 94 | 32 % → 42 % | 15/28 → 12/23 | 26 → 23 |
| bot0.2 | easy | 0 % | 600 | 100 % | 7 | 84 → 76 | 64 % → **86 %** | 13/23 → 10/16 | 20 → 11 |
| bot0.6 | easy | 0 % | 600 | 100 % | 7 → 8 | 73 → 69 | 87 % → 92 % | 10/18 → 8/15 | 20 → 18 |
| bot1.0 | easy | 0 % | 600 | 100 % | 8 | 70 → 69 | 89 % → 94 % | 8/16 → 8/15 | 18 → 18 |
| bot0.6 | normal | 5 % → 0 % | 600 | 100 % | 10 | 55 → 52 | 77 % → 74 % | 8/14 → 7/12 | 14 → 13 |
| bot1.0 | hard | 5 % → 5 % | 600 | 100 % | 13 | 43 → 42 | 39 % → 35 % | 5/7 → 4/8 | 10 → 10 |
| parkSpam8 | easy | 100 % | 44 → 75 | 3 % → 43 % | 0 | 59 → 64 | – | – | – |

Round-1 zone times p50 (Cloud / Spires / Gardens / Lanes), before → after:
- adult Easy: 81/132/110/142 → 74/106/101/124
- adult Normal: 67/93/92/92 → 59/77/73/87
- kid56 Easy: 73/107/89/94 → 73/90/91/107
- bot0.2 Easy: 62/95/84/92 → 60/79/82/86

Trade-offs:
- A child who never moves (`parkSpam8`) now clears the Cloud Deck in 43 % of games, thanks to the extra net saves. For ages 4–6 I think that is fine, because the net is the rescue the design promises.
- Children's zone p50 rises a little (72 → 89 s). They now survive into the bigger zones instead of losing on the first or second. Their later zones still take 90–107 s.
- I also tried `netSaves` 14 and 16, `ballSpeed` 5.0 and `STICK_T` 2.5:
  - 14 and 16 help a little more, but idle players clear even more (58 % / 47 %).
  - `ballSpeed` 5.0 makes pacing worse (adult 121 s) for little survival gain.
  - `STICK_T` 2.5 changes nothing measurable.

### 3.2 Optional world.js fix (tested on the vm copy only, `REC+LAY`)

**The stall clock should keep running through a magnet release.** In `_release()`, stop resetting `noBrickT`. When `noBrickT > ANTI_STALL`, blend the release angle toward `_nearestBrickAngle` with the same 50 → 100 % ramp used for a Wisp bounce. Aimed releases happen almost only before a stall, so they are unaffected (branch B is unchanged).

| | baseline | `REC_CFG+LAY` | `REC+LAY` |
|---|---:|---:|---:|
| C: magnet + instant release, last 3 p50/p90 (Easy 0.8) | 18/25 | 16/22 | **10/15** |
| D: kid56 + magnet (Easy, bot-0.8 seeds) | 21/31 | 19/32 | **17/25** (now ≈ E, no magnet 15/23) |
| longest gap with no block hit, incl. stuck, max s (adult / spamTrack / botSpam Easy) | 26 / 26 / 17 | 22 / 23 / 19 | **16 / 12 / 12** |
| spamTrack Easy zone p50 / in 45–90 | 110 s / 32 % | 94 s / 42 % | **88 s / 53 %** |
| adult Normal zone p50 / in 45–90 | 85 s / 59 % | 74 s / 83 % | **72 s / 88 %** |

I also tested a variant where an *auto*-release (the child just waits) aims at the nearest block (`AUTOAIM`). On top of the fix above it adds little (kid4 game over 95 → 88 %, kid4 last 3 p90 28 → 24 s), so it is not needed.

### 3.3 Follow-ups if these are adopted

These are for the build team. The playtester did not edit any of these files.
- `tests/unit/run.js` checks "net 8/1/0 per zone" and an anti-stall at 5 s; both need the new values.
- Update `docs/MECHANICS.md` §2 and §4 (layout tables, `DIFF.easy`, `ANTI_STALL`) and DESIGN §1 ("8× per zone").
- Re-run `tests/sim/playtest.js` and the unit test "skill 0.9 and 0.3 clear Easy Cloud Deck in 30–120 s". In the sim, bot0.2 Easy Cloud Deck p50 is 60 s and bot1.0 is 53 s, both still inside the range.
