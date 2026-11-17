# Playtest report: Dottie's Reef Parade (high-speed, headless)

Date: 2026-11-17. Tester: high-speed playtest agent. Report-only: nothing in `game/` was changed.

## How it was tested
- Harness: `tests/sim/playtest.js` (new). It loads `world.js` + `bot.js` in a Node vm (same as `tests/unit/load.js`), reuses the player models in `tests/sim/players.js` and adds four more. Suites: `pacing`, `bots`, `exploits`, `gold`, `stability`. `VARIANTS=<file.json>` re-runs a suite with CONFIG overrides, and `SEED0=<n>` picks a new seed set.
- About 9,900 simulated games in total: ≈ 1,000 game-hours of play at 60 steps/s.
- Player models (they only use `setTarget` / `setDir` / `action`, like a finger):
  - **toddler** (age 3–4, new): reacts in 0.6–1.0 s, aims ±40°, never looks at the parade, leaves the finger still for 1.5–3 s about every 5 s, taps flip at random, chases the golden star 90 % of the time.
  - **kid-oblivious** (age 4–6): heads straight for the nearest star and ignores the parade.
  - **kid** (age 5–6): like kid-oblivious, but notices the parade 35 % of the time.
  - **casual** (adult or older child): reacts in 0.2 s, aims ±6°, plans around the parade.
  - **bot0.3 / 0.5 / 0.7 / 1**: `RP.Bot` at each skill level.
  - **Exploit probes**: `spam` (presses flip every frame), `neverturn` (no input, new), `circle`, `flipcircle` (circle plus flip mashing, new), `orbit`, `wallhug`, `edgedart` (rides the soft edge strip), and `cornercamp` (presses into a corner, new).
- Arenas: landscape 960×540; iPad 4:3 and portrait phone, each with the touch flip-button avoid circle; wide phone with notch insets.
- Rule of thumb from `docs/MECHANICS.md`: the models play about 1.5–2× faster than real people, because they never look away. **A model time of 25–50 s per season means about 45–90 s for a real player.**
- Browser sanity check: `tests/sim/browser.js` serves `game/`, opens `?bot=1&speed=16&autostart=1` in headless Chromium (desktop, iPhone landscape with touch, iPad portrait with touch) and runs 25 s of real time each. It ran while other simulations were using the CPU.

## Verdict
The game is in good shape. It never gets stuck, has no profitable exploit, and is stable over 40-minute runs. Season 1 on Normal is easy for a 6-year-old: the kid models clear it in 100 % of games.

The "too fast" pacing worry mostly comes from the fast adult models. The child models already land in the target range:

| Model | Season length (model) | Season length (real child, estimated) |
|---|---|---|
| kid on Normal | 24 / 31 / 38 / 38 s | ≈ 40–75 s |
| toddler on Easy | 29 / 42 / 44 / 50 s | ≈ 50–90 s |

Every way I tried to make Normal longer (9 variants) traded a small time gain for **2–4× more bonks** for the kid models. The reason is that longer songs mean longer parades, and a child has more to crash into. So **I recommend no change to Normal**, and three small kindness changes for Easy.

For adults who want longer, more demanding seasons, Hard already gives 33–53 s (model) per season.

## Recommended changes (exact)

| Key | Easy: old → new | Normal | Hard | Why |
|---|---|---|---|---|
| `pickPad` | 16 (base) → **22** | 16 (unchanged) | 16 (unchanged) | A 3–5-year-old's wobbly aim still catches the star: Easy pick radius goes from 30 to 36 px. |
| `spawnMinDist` | 160 → **140** | 200 (unchanged) | 200 (unchanged) | The first star comes sooner (toddler p90 8.6 → 6.8 s). Less empty swimming for the youngest. |
| `songPerLap` | 2 (base) → **1** | 2 (unchanged) | 3 (unchanged) | The endless laps grow more slowly on Easy. Toddler lap-2 seasons get about 3 s shorter, with fewer late game-overs. |

New Easy preset:

```js
easy: {
  speed0: 105, speedPerBiome: 4, heartsMax: 5,
  songTargets: [8, 10, 12, 14], songPerLap: 1, trailSpacing: 22, spawnMinDist: 140, pickPad: 22,
  jumpTime: 0.8, flipRecharge: 2.4,
  safeNeck: 7, bonkR: 12, edgeSafe: 40,
  looseLife: 5, invulnTime: 1.8,
  goldLife: 11, goldSpeed: 0.32, goldFear: 140, goldPickPad: 24
},
```

**Keep the golden star's +5.** It does shorten seasons: on Normal, removing it makes the casual model's seasons 45 % longer. But it also keeps the parade short, because one parade slot carries 5 notes of the song. Without it, kid deaths on Normal rise from 3/40 to 26/40. For young players the +5 is a safety feature, not just a shortcut.

## Before / after: the recommended Easy change
Third, independent seed set (`SEED0=101`), 100 games per row, two laps (8 seasons) or game over. "Model" times are in seconds.

| Model (Easy, landscape) | Died in 2 laps | First star p50 / p90 s | Season s, lap 1 (median) | Season-1 s p10/p50/p90 | Season s, lap 2 | Bonks/min | Gold caught |
|---|---|---|---|---|---|---|---|
| toddler, before | 3/100 | 3.7 / 8.6 | 29 / 42 / 44 / 50 | 17 / 29 / 49 | 39 / 43 / 44 / 53 | 0.15 | 74 % |
| toddler, **after** | **2/100** | **3.3 / 6.8** | 26 / 38 / 44 / 46 | 15 / 26 / 49 | 31 / 41 / 44 / 51 | 0.13 | 73 % |
| kid, before | 0/100 | 2.6 / 4.8 | 18 / 26 / 34 / 39 | 14 / 18 / 30 | 27 / 33 / 38 / 40 | 0.12 | 83 % |
| kid, **after** | 0/100 | **2.2 / 3.9** | 17 / 24 / 30 / 38 | 14 / 17 / 30 | 20 / 26 / 36 / 37 | 0.13 | 84 % |
| casual, before | 0/100 | 1.7 / 2.7 | 14 / 16 / 21 / 26 | 12 / 14 / 17 | 16 / 20 / 25 / 29 | 0.00 | 98 % |
| casual, after | 0/100 | 1.6 / 2.7 | 14 / 16 / 20 / 25 | 12 / 14 / 17 | 14 / 17 / 22 / 25 | 0.00 | 97 % |
| kid, portrait phone, before | 0/100 | 2.7 / 4.8 | 19 / 28 / 36 / 41 | 14 / 19 / 38 | – | 0.06 | 83 % |
| kid, portrait phone, after | 0/100 | 2.3 / 3.9 | 17 / 26 / 34 / 39 | 13 / 17 / 34 | – | 0.09 | 83 % |

The same change held up on two other seed sets:
- Seed set 1 (40 games per row): toddler deaths 5/40 → 0/40, season-1 p90 64 → 49 s.
- Seed set 2 (60 games per row): toddler deaths 0/60 → 0/60, first star p50 4.6 → 3.5 s.

Easy also stays exploit-free with the change: the spam, circle, wallhug and cornercamp probes gain nothing. Bots of every skill still never die on Easy and clear about 2 more levels in 10 minutes.

## Why not lengthen Normal (all variants tested)
Seed set 2 (`SEED0=17`), 60 games per row, Normal, landscape. A death in 2 laps mostly happens in lap 2. "Lap-1 clear" means all 4 seasons were cleared.

| Variant (Normal overrides) | casual: season s | kid: season s | kid died / lap-1 clear | kid-oblivious died | kid bonks/min |
|---|---|---|---|---|---|
| **current** | 14 / 17 / 22 / 25 | 24 / 32 / 36 / 39 | 1/60 / 100 % | 0/60 | 0.05 |
| `speed0` 135 | 15 / 19 / 23 / 27 | 27 / 32 / 37 / 38 | 3/60 / 97 % | 3/60 | 0.10 |
| songs 12/14/16/18, `speed0` 140 | 19 / 23 / 26 / 30 | 35 / 39 / 40 / 44 | 9/60 / 98 % | 10/60 | 0.21 |
| songs 10/13/15/18, `speed0` 140 | 15 / 20 / 25 / 30 | 25 / 38 / 38 / 43 | 5/60 / 97 % | 7/60 | 0.17 |
| songs 12/14/16/18, `speed0` 140, `goldFirst` 12 | 20 / 23 / 26 / 29 | 35 / 37 / 42 / 42 | 11/60 / 93 % | 11/60 | 0.21 |
| songs 10/13/15/18, `speed0` 140, `safeNeck` 8, `bonkR` 13 | 15 / 20 / 25 / 30 | 25 / 38 / 38 / 42 | 3/60 / 100 % | 8/60 | 0.15 |
| songs 12/14/16/18, `speed0` 140, `safeNeck` 8, `bonkR` 12 | 19 / 23 / 26 / 30 | 35 / 38 / 41 / 41 | 9/60 / 90 % | 9/60 | 0.25 |
| songs 10/12/15/17, `speed0` 135, `safeNeck` 7 | 15 / 19 / 25 / 29 | 27 / 34 / 39 / 41 | 2/60 / 98 % | 10/60 | 0.15 |
| no golden star (reference) | 22 / 26 / 30 / 33 | 35 / 44 / 50 / 58 | 26/40 / 78 % (seed set 1) | 22/40 | – |

The best-balanced candidate (songs 10/13/15/18, `speed0` 140, `safeNeck` 7) was re-checked on seed set 3 with 100 games:
- casual seasons: 14 / 18 / 21 / 26 → 15 / 20 / 25 / 30 s
- kid seasons: 24 / 31 / 38 / 38 → 25 / 37 / 38 / 42 s
- kid deaths in 2 laps: 1 → 12 out of 100
- kid bonks per minute: 0.07 → 0.21

Rejected: it gives about 10–15 % more time and costs 3× more bonks for the 6-year-old models.

`spawnMinDist` is not a useful lever on Normal. `_findSpot` caps it at 0.4 × the short arena side + 40, which is 216 px on landscape, and Normal already uses 200.

Side effects for the team if a later decision does lengthen Normal:
- REQUIREMENT.md ("10 / 12 / 14 / 16 on Normal") and the MECHANICS table would need updating.
- `tests/unit/run.js:603` asserts `CONFIG.songTargets`, so a `DIFFICULTY.normal.songTargets` override would pass but be mislabelled.
- `tests/unit/run.js:338` pins `DIFFICULTY.easy.safeNeck === 7`.

None of these tests is affected by the recommended Easy change.

## Survival, scores and bots (current build)
`bots` suite: 25 games per row, 10 minutes of play each, landscape.

| Diff | Bot skill 0.3 / 0.5 / 0.7 / 1: died | Levels in 10 min (median) | Bonks/min | Gold caught | Score p50 |
|---|---|---|---|---|---|
| Easy | 0 / 0 / 0 / 0 of 25 | 18 / 19 / 19 / 19 | ≤ 0.01 | 98–100 % | 14.6k–15.9k |
| Normal | 0 / 0 / 0 / 0 of 25 | 18 / 18 / 20 / 20 | 0.00 | 93–99 % | 12.4k–14.2k |
| Hard | 7 / 2 / 0 / 0 of 25 | 9 / 10 / 11 / 11 | 0.21 / 0.09 / 0.03 / 0.00 | 78–88 % | 8.7k–11.7k |

Human models on the current build (`pacing` suite, 40 + 60 + 100 games per row across 3 seed sets):
- **Time to first star**: casual 1.5 s, kid 2.2–3.1 s, toddler 3.2–4.6 s (p90 under 10 s).
- **Normal season 1**: cleared in every game by every model, so it is easy for a 6-year-old. Kid median 24–26 s, p90 about 40 s. Kid bonks 0.05–0.10 per minute over 2 laps. Deaths are rare (1–3 %) and happen in lap 2.
- **Easy**: kid-oblivious and kid never die in 2 laps. Toddler 0–5 % deaths, all of them in long lap-2 seasons with 9–14 stars in the parade.
- **Hard**: casual adult 33 / 35 / 42 / 53 s per season (about 50–90 s for a real adult, so on target), 1–4 % deaths in 2 laps.
- **Scores** (2 laps, median): Easy ≈ 5.8k, Normal ≈ 4.7k, Hard ≈ 7.6k.

## Golden star
- **Catch rates**: bot1 99 %, casual 94–99 %, kid 74–80 % (it chases 80 % of them), toddler 70–74 % (it chases 90 %). Median catch time 3–5 s, p90 5–10 s (life is 9 s, or 11 s on Easy).
- **Never stuck or unreachable**:
  - It never left the arena, and was never still for more than 0.3 s.
  - It spends only 0.2–1.8 % of its time in a 70 px corner box, so the corner dart works.
  - Across iPad, portrait and wide phone layouts it was **never inside the flip-button avoid circle**, and no idle star ever spawned there.
  - It spends 1.5–7.4 % of its time near the button and was caught there 2–12 times per 12 runs, so it is still reachable there.
- **Circling the golden star** is not an exploit: `circle` and `flipcircle` catch 0–1 % of golden stars.
- **Optional, not recommended**: a kinder Easy golden star (`goldSpeed` 0.26, `goldPickPad` 28) moved toddler catches only from 73 % to 76 %. Not worth it.

## Exploits (8–12 games per probe and difficulty, 8 minutes each)

| Probe | Easy / Normal | Hard | Verdict |
|---|---|---|---|
| neverturn (no input) | never dies, clears 3 seasons in 8 min by drifting into stars | dies 8/12 | Good: a child who just watches still gets some joy, and nothing punishes it on Easy or Normal |
| flip spam | exactly the same as casual (flips do not help); 20–27 flips/min | same as casual | No exploit |
| circle / flipcircle | 0 points, no bonks (the safe neck covers a tight circle) | same | No exploit, no soft-lock |
| orbit (lawn-mower) | 0–3 seasons in 8 min | 0–1 | Slow, harmless |
| wallhug (ride the coral) | 0–1 seasons, no bonks | 0 | The edge strip makes bonks impossible, but you collect almost nothing, so no exploit |
| edgedart (dart to the star, hide in the edge strip) | 11–13 seasons vs casual 17; 0.03–0.10 bonks/min | (the probe never finds an edge strip because `edgeSafe` is 0) | A legitimate, slower, kid-safe style. The soft strip does not trivialise the game |
| cornercamp | 0 points, no stuck state | same | No exploit |

## Laps after season 4
- Song length rises by `songPerLap` and speed by × `speedLapMul` per lap. Normal lap-2 seasons are about 2–3 s longer than lap 1 for every model, which is a gentle and sensible ramp.
- Over 40 minutes (bot1): Easy reaches level 60, Normal 58, Hard 40. The speed cap (230 px/s, Hard 330) is reached around lap 5.
- Competent bots never die on Easy or Normal in 10 minutes. For a kids' game that is acceptable: the run ends when the child stops. No change needed.

## Long-run stability (bot1, 40 minutes of play, 5 games per difficulty, plus a coarse-dt run)
- No NaN or Infinity in 20 runs.
- Highest score 80,336 (Easy, 40 min). That is far below any overflow; the score grows roughly linearly.
- Longest parade 36 stars, which stays under `songMax` 40. A clear always ends the parade at the song target.
- The path ring buffer stays at `pathCap` 2048 points (about 6,100 px of history) against a parade of at most 40 × 22 = 880 px, so there is plenty of headroom.

## Browser sanity check (`?bot=1&speed=16&autostart=1`, headless Chromium, 25 s real time each)

| Viewport | Simulated min | Level reached | Bonks | Gold | Max particles / fx | Errors |
|---|---|---|---|---|---|---|
| Desktop 1280×720 | 6.8 | 14 | 0 | 16/16 | 51 / 49 | none |
| iPhone landscape 844×390, touch | 6.9 | 14 | 0 | 16/16 | 69 / 36 | none |
| iPad portrait 820×1180, touch | 6.7 | 13 | 0 | 16/16 | 80 / 37 | none |

The game advanced at the full ×16 in all three. Frame rates (47 / 28 / 15 fps) are not meaningful here: the browser used software rendering and shared the CPU with the simulation batches.

## Files
- `tests/sim/playtest.js`: harness (suites, variants, seeds).
- `tests/sim/browser.js`: real-browser bot run.
- `tests/sim/variants-v1.json`, `variants-v2.json`, `variants-v3.json`, `variants-rec.json`: the override sets tested above.
- `tests/sim/results/playtest-*.md` and `.json`, `results/browser.md`: raw tables.

Re-run the recommendation check with:

```
SEED0=101 VARIANTS=tests/sim/variants-rec.json node tests/sim/playtest.js pacing 100
```
