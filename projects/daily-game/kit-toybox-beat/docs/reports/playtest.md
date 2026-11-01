# Kit's Toybox Beat: high-speed playtest

Date: 2026-11-01. Report only: no game code was changed.

- Simulator: `tests/sim/players.js` (player models) and `tests/sim/run.js` (runner).
- Command: `node tests/sim/run.js --runs 80` takes about 9 minutes on 2 cores.
- Each run is headless and deterministic. It uses dt 1/60 s (the world sub-steps at 1/120 s, and players fire with exact offsets) and plays up to 8 levels (Dawn→Night twice).
- Run counts: 80 runs per bot cell and 160 per human or exploit cell, about 7,000 runs (≈ 25 hours of play) per variant. There are 3 variants: baseline, proposal and proposal-code.
- Full tables are in `tests/sim/results/`:
  - `baseline.md`, `proposal.md`, `proposal-code.md`: overview, survival per level, distribution of levels cleared, accuracy per level, chart analysis.
  - `compare.md`: every cell as baseline → proposal → proposal-code.

## 1. Player models
| model | how it plays |
|---|---|
| bot 0.2 … 1 | `KB.Bot`: σ = 0.10·(1−skill) s, skips, wrong lane 0.12·(1−skill) |
| **kid 4–6** | Reacts to the coin instead of anticipating it: it notices a coin 0.7 s out and taps at note + bias U(30–80 ms) + N(0, σ), with σ U(90–140 ms), scaled by 1 + 0.5·(bpm−84)/84 (×1.17 at Night, since reaction play can't lock to the beat). Wrong lane 15–25 %. Skips 5 %. Attention lapses: one per ≈ 30 s, each 2–5 s with no taps. It can't re-tap within 0.3 s (drops the tap 40 % of the time). Excited double-tap 8 %. Plays Easy and Normal. |
| casual adult | σ 40–60 ms, bias 0–20 ms, wrong lane 5 %, skips 2 %, rare 1–2 s lapses |
| pillow ignorer / kid pillow ignorer | Casual or kid, but never taps a pillow |
| one-lane camper | Casual timing, but only taps the coins in lane 1 |
| spam | Taps every U(60–120 ms): `spamBoth` (both lanes each tick), `spamAlt` (alternating), `spamOne` (one button). `spamFast` is 40–60 ms, both lanes. |
| slow mash | Taps every U(200–330 ms) without looking: `mashSlow` (one button), `mashSlowBoth` (both lanes). This is what a toddler really does. |
| metronome | Ignores the coins and taps on every beat with σ 30 ms: `beatOne` (one lane), `beatBoth` (both lanes at once). |
| idle | Never taps |

## 2. Baseline findings
### Targets
| target | result | verdict |
|---|---|---|
| Easy level 1 can't be lost | idle: 100 % clear (groove floor 0.05); spam/mash: 100 % clear | ✅ |
| Kid on Easy reaches level 3 (≥ 60 %) | **100 %** (and 100 % clear all 8, accuracy 74 %) | ✅ |
| Kid on Normal clears level 1 (≥ 85 %) | **53 %** (accuracy 49 %) | ❌ |
| Spam not a winning strategy on Normal/Hard | fast spam: 0 % L1 ✅; **metronome both lanes: Normal 100 % clear all 8, score p50 203k vs honest casual 120k** ❌; Hard 61 % clear all 8, score 125k vs 107k ❌ | ❌ |
| Easy one-button spam no better than honest tapping | fast spam: dies on level 2 ✅; **slow mash (3–5 taps/s, eyes closed): clears all 8 levels with 100 % reliability, 70 % accuracy, score 44k vs kid 51k** | ⚠️ survives as well as honest play |
| Level length ≈ 45–90 s | 63–64 s on lap 1 (count-in + about 58 s of song + 2.6 s cleared); 71–74 s on lap 2 | ✅ |

### Other observations
- **Time to first catch**: median 2.9 s for every honest model. That is the 4-beat count-in, then the first coin on "Go!". The camper takes 7.1 s (the first coin is in the other lane half the time). There is no dead time at the start.
- **The difficulty ramp is in density, not survival.**
  - Notes per second (Normal): 0.69 → 0.96 → 1.20 → 1.44 across Dawn→Night, then 0.86 → 1.23 → 1.47 → 1.77 on lap 2. Lap 2 Dawn is a deliberate breather and feels right.
  - Quarter-note lane jumps per minute: 3.9 → 10.3 → 16.4 → 19.7 (lap 2: 9 → 27).
  - Survival only ramps for weak players. Normal bot 0.2 clears 99 / 71 / 57 / 53 / 65 / 55 / 33 / 0 % per level, and Hard bot 0.4 clears 81 / 65 / 50 / 67 %.
  - Anyone with about 80 % accuracy never dies: Normal bot 0.4 and the casual adult clear all 8 levels 100 % of the time, and Hard casual 92 %. The groove is a health bar with gains roughly equal to costs, so it is binary. That is fine for a kids' game. If the ending feels too easy for grown-ups, look at the score, not at death.
- **The boss costs very few runs.** Each visit removes the coins within ±1 beat of each pillow, so a visit makes a stretch easier for a player who taps the pillows.
  - Normal kid: 53 % L1 clear with Baron Fluff vs **44 % without him**.
  - Casual and bots: identical with or without him.
  - Ignoring pillows is what hurts:
    - kid on Normal: 53 % → 21 % L1 clear
    - casual on Hard: 92 % → 60 % clear all 8
    - Easy: costs nothing (98–100 % clear all 8), which matches the requirement "never a game over by itself on Easy".
  - About 12 % of Normal kid runs end on a poof, and about 30 % of kid deaths happen while he is on screen.
- **One-lane camper**: Easy 86 % reach L3 (half the coins with good timing are enough on Easy), Normal 31 % L1, Hard 0 %. That is fair.
- **Difficulty table (levels cleared)**:
  - Easy: every honest model clears 8/8.
  - Normal: bot 0.2 → median 2, bot ≥ 0.4 → 8.
  - Hard: bot 0.2 → 0, bot 0.4 → 2, bot ≥ 0.6 → 8.

## 3. Recommended changes
### 3a. Config only (`KB.DIFFICULTY`, key: old → new)
| key | old → new | why |
|---|---|---|
| `normal.firstLevelCostMul` | 0.75 → **0.5** | A miss on Normal Dawn costs 0.04 (the same as Easy). This is the main lever for the kid. |
| `normal.goodWin` | 0.15 → **0.17** | Kids tap late because they react instead of anticipating. 0.18 was tested and lets alternating spam clear L1 in 24–29 % of runs, so stop at 0.17. |
| `normal.earlyWin` | 0.30 → **0.34** | Keeps the "too early" band 0.17 s wide. Without it the wider goodWin lets two-lane slow mashing clear Normal L1 in 96 % of runs; with it, 27 %. Kid unchanged. |
| `easy.earlyWin` | 0.30 → **0.34** | The early-miss band becomes 0.22–0.34. Blind slow mashing drops from clearing all 8 levels to median 2. The kid is unaffected. |
| `easy.maxDensity` | (6, by accident) → **4** | **Bug:** in `world.js` line 112, `maxDensity: 4,` sits *inside* the `// DESIGN said 0.55…` comment, so Easy uses CONFIG's 6. It has almost no effect today, because there are no eighths on Easy and the cap is 4 quarters per bar, but fix it: move it before the comment. |

### 3b. Small code change (recommended): `wrongLaneMiss` on Normal and Hard
Rule: if a lane tap judges as `empty` while the **other** lane has a live note within ±goodWin, that note is missed (Kit flew to the wrong track).

- This kills the "tap both lanes on every beat" chord, the only exploit that beats honest play. Every note sits on the beat grid, so chording both lanes catches about 95 % of Normal notes with no reading at all.
- It costs honest players nothing: a wrong-lane tap already meant that coin would be missed, and now the miss comes immediately, which is also clearer feedback.
- It is simulated in `tests/sim/run.js` → `patchWrongLaneMiss()`.

Suggested code in `World.prototype.tap`, just before `var e = { type: 'empty' … }`:
```js
if (c.wrongLaneMiss && lane >= 0) {
  for (i = this._first; i < notes.length; i++) {
    n = notes[i];
    if (n.time - t > c.goodWin) break;
    if (n.state === 'live' && n.lane !== lane && Math.abs(t - n.time) <= c.goodWin + 1e-9) return this._miss(n, false, t);
  }
}
```
Add these config keys:
- CONFIG `wrongLaneMiss: true`
- DIFFICULTY.easy `wrongLaneMiss: false` (it is irrelevant there, since one-button play has no lanes)

### Before → after (`compare.md`; config-only = proposal, with code = proposal-code)
| cell | metric | baseline | config only | config + wrongLaneMiss |
|---|---|---|---|---|
| **kid, Normal** | clear L1 | 53 % | **98 %** | **98 %** |
| kid, Normal | reach L3 | 1 % | 14 % | 14 % |
| kid, Normal | accuracy / score p50 | 49 % / 2.5k | 55 % / 4.6k | 55 % / 4.6k |
| kid ignoring pillows, Normal | clear L1 | 21 % | 85 % | 85 % |
| kid, Easy | reach L3 / clear all 8 | 100 % / 100 % | 100 % / 99 % | 100 % / 99 % |
| bot 0.2, Normal | reach L3 / L5 | 70 % / 21 % | 91 % / 48 % | 91 % / 48 % |
| casual, Normal / Hard | clear all 8 | 100 % / 92 % | 100 % / 92 % | 100 % / 92 % |
| **metronome both lanes, Normal** | clear all 8 / score p50 | **100 % / 203k** | 100 % / 204k | **0 % (median 1 level) / 4.5k** |
| metronome both lanes, Hard | clear all 8 / score p50 | 61 % / 125k | 61 % / 125k | **0 % (L1 0 %) / 1.0k** |
| slow mash both lanes, Normal | clear L1 | 14 % | 27 % | **0 %** |
| **slow mash one button, Easy** | median levels / score p50 | **8 / 43.7k** | **2 / 6.0k** | 2 / 6.0k |
| fast spam (all kinds), Normal / Hard | clear L1 | 0 % | 0 % | 0 % |
| idle, Easy | clear L1 | 100 % | 100 % | 100 % |

Notes:
- With the config only, the Normal metronome chord stays a winning strategy. That is why 3b is recommended.
- With 3b, the chord still clears Normal Dawn in 98 % of runs, because Dawn is forgiving by design, but it dies on Noon (reach L3 4 %) with a score 1/27 of honest play.

Things that stayed as they were:
- Normal camper L1 31 % → 95 %, a side effect of the forgiving Dawn. It dies on Noon in 99 % of runs, and its score is 3k vs 122k for honest play.
- Easy metronome on one button gets 100 % accuracy. That is not an exploit: tapping on the beat *is* the game on Easy.

## 4. Event-stream / chart oddities (code-level, for the integrator)
1. **Cross-lane eighths on Normal despite `crossEighths: false`.**
   - Patterns that end with an eighth on beat 3.5 (`[3.5,'A']` / `[3.5,'B']`) are followed by a bar whose first coin can be in the other lane. That is a 0.25 s lane jump across the bar line.
   - Rate: 0.8 per song on Normal Night² (120 BPM), about 0.02 per song on lap-1 Sunset/Night. All 233 cases found over 200 seeds were at beat 3.5 → next downbeat.
   - Fix in `_genChart`: when `!allowX` and the previous kept note is at offset 3.5, force the next bar's `laneA` to that note's lane, or drop the 3.5 note.
2. **Coins close to pillows at Night.** `pillowClear` is 1 beat, so at 112–120 BPM a coin can sit 1.5 beats (0.75–0.8 s) before or after a pillow, and the pillow lane is random.
   - Rate: 21 % of pillows on Normal Night and 46–54 % on Hard Night.
   - This is readable, so no change is needed. If you want pillows to stand alone at Night, raise `pillowClear` to 1.5 on Hard only.
3. **The pillow lane is independent of the surrounding coins.** The analysis found no "lane switch into a pillow within 1 beat", because pillowClear guarantees it, so this is fair.
4. **The first coin lands exactly on "Go!".** All models catch it (median first catch 2.9 s), so it's fine. A kid who taps *along with* the count-in can't early-miss it, because the beat −1 tap is 0.71 s early, outside earlyWin.
5. **No wall of quarter-note lane jumps at Night for Easy players**, because one-button play makes lanes irrelevant. On Normal, Night has 19.7 lane jumps per minute (lap 2: 27), each ≥ 0.5 s apart, which is fine.
6. Test hygiene: once the world is `dead`, `w.boss.state` is forced to `'away'`. Sample it before `update()` if you need "died during a visit" (the simulator does this).

## 5. Summary for the team
- Easy is safe and kind:
  - Level 1 can't be lost.
  - A 4–6-year-old clears every level.
  - Raising `easy.earlyWin` to 0.34 makes blind slow mashing clearly worse than honest tapping (median 2 levels vs 8).
- Normal Dawn is too hard for a 4–6-year-old today (53 %). `firstLevelCostMul` 0.5 + `goodWin` 0.17 + `earlyWin` 0.34 bring it to **98 %** with no new spam route.
- The only real exploit is the **both-lanes-on-every-beat chord** on Normal/Hard: it beats honest play by 70 % in score and clears everything. It needs the 6-line `wrongLaneMiss` rule. Config alone can't fix it.
