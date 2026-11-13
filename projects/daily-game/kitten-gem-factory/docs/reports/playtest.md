# Comet's Gem Factory — high-speed playtest report

Headless simulation, no rendering. Harness: `tests/sim/run.js` (loads `rng.js` + `world.js` + `bot.js`
in a `vm` with a fake `window`; the World sub-steps at 1/120 s but the sim raises the step to 1/30 s
for ~4× speed — `--exact` keeps 1/120 s and the numbers match within noise). 100 runs per model × difficulty,
each run played to 8 levels cleared (two full years, levels 0–7) or game over. Total runtime ≈ 6 min per set.

Reproduce:
```
node tests/sim/run.js --set baseline   --json tests/sim/out/baseline.json
node tests/sim/run.js --set proposed   --json tests/sim/out/proposed.json      # PROPOSED (needs the code tweaks below)
node tests/sim/run.js --set valuesonly  --json tests/sim/out/valuesonly.json    # same numbers, no code change
node tests/sim/run.js --compare tests/sim/out/baseline.json tests/sim/out/proposed.json
```

## 1. Player models

| model | tap cadence | memory | notes |
|---|---|---|---|
| Bot 0.2 / 0.5 / 0.8 / 1.0 | built-in `CGF.Bot` | `skill` | reference ceiling |
| **4-year-old** | 1.8–3.0 s | encode p 0.35, forget ~exp(mean 30 s), peek only sticks for ≤2 cards, 15 % distract, 12 % misplace, 10 % re-tap | the design target for Easy |
| **4-year-old (low memory)** | 1.8–3.0 s | the brief's literal version: p 0.35 but fast decay (12 s), 25 % distract, 15 % re-tap, peek sticks for ≤1 card | a pessimistic lower bound; plays close to random |
| **6-year-old** | 1.2–2.0 s | p 0.55, decay 25 s, peek ≤3 | older kid / casual adult band |
| **casual adult** | 0.7–1.2 s | p 0.80, decay 60 s, peek ≤4 | Normal's target |
| **spam (random)** | ~0.15 s | none | exploit check: taps any face-down card as fast as it can |
| **spam unseen-first** | ~0.15 s | none | only taps cards it has never flipped (abuses "an unseen miss never breaks combo") |
| **kid mashing** | 0.4–0.7 s | none | an impatient toddler who just pokes the board |

Human memory decays continuously (each memory has an exponential lifetime), so a card "remembered then
forgotten" behaves realistically. A **peek working-memory cap** is important: a 1.8 s peek over a 6×4 board
does not let anyone memorise 24 cards, so each model only banks a few peek sightings.

Calibration: these give the 4-year-old ≈ 3.9 flips per pair (the design note in `MECHANICS.md §6` assumed
2.2 — that is optimistic; pure random play on the 4×3 board needs ≈ 6, which brackets the model).

## 2. Baseline (shipped values) — the problem

`tests/sim/out/baseline.md` in full. The important rows:

| model / diff | clear Sp / Su / Au / Wi | levels p50 | score p50 | time left Sp / Wi |
|---|---|---|---|---|
| 4-year-old / easy | 94 / 69 / 32 / 14 % | 2 | 795 | 44 % / 21 % |
| 4-year-old (low mem) / easy | 55 / 12 / 2 / 0 % | 1 | 180 | 39 % / – |
| 6-year-old / normal | 97 / 90 / 80 / 53 % | 4 | 1620 | 53 % / 26 % |
| casual adult / normal | 100 / 100 / 100 / 100 % | 8 | 6245 | 99 % / 94 % |
| **spam (random) / easy** | **100 / 100 / 100 / 100 %** | **8** | **6245** | 100 % / 90 % |
| **kid mashing / easy** | 100 / 98 / 94 / 82 % | 8 | 3885 | 83 % / 42 % |

Two findings:

1. **Easy falls off far too fast for the target 4-year-old.** Spring is fine (94 %), but by Autumn the
   model clears only a third of the time and the shift ends in tears. Easy is supposed to be a gentle,
   relaxed ramp for a 4–6-year-old; today it is only gentle on level 1.
2. **The spam exploit beats real memory play.** Random 0.15 s tapping clears *every* Easy level and scores
   **6245 (p50) — higher than the 4-year-old's 795 and even the 6-year-old's 7065 on fewer, faster taps.**
   Why: a wrong pair auto-flips back after `missDelay`, but a spammer taps a 3rd card and the "3rd-tap
   closes a wrong pair at once" shortcut lets it skip the wait entirely, so misses are nearly free; and the
   clear bonus (`5 × secondsLeft`) rewards a fast board-sweep regardless of accuracy. `missLock` + a
   tidiness-scaled clear bonus are needed; **time values alone cannot fix this** (see §5 — longer timers
   make the spammer *stronger*).

The combo/time mechanics themselves are sound: the "unseen miss doesn't break combo" rule is not itself
exploitable (spam-unseen scores the same as spam, 6265 vs 6245), and ×5 is reached easily by any real
memory player (74–100 % of levels) but rarely by spam (3–10 %).

## 3. Recommended changes

### 3a. Two small code additions to `world.js` (≈ 15 lines)

These close the spam exploit and let Easy be generous without rewarding mashing. The sim applies them as
runtime patches (`patchRules` in `run.js`); the lead ports them to `game/js/world.js`.

1. **`diff.missLock` (seconds).** A wrong pair stays shown for at least `missLock` s; taps during that
   window are ignored. The 3rd-tap shortcut still helps a quick, *correct* player (it only fires after the
   lock), but a masher can no longer rattle through misses with no time cost.
   In `World.prototype.tap`, before the normal checks:
   ```js
   if (this._wrong && (this._wrongT0 - this._wrong.t) < this.diff.missLock) return false;
   ```
   and store `this._wrongT0 = this._wrong.t;` at the end of `_judge` when a wrong pair is created.
2. **`rules.tidyBonus` — scale the clear time-bonus by accuracy.** In `_clear`, multiply the time bonus by
   `accuracy = min(1, pairs / attemptsThisLevel)` (attempts = flips this level / 2). A clean clear is
   unchanged; a 9.6-flips-per-pair sweep keeps only ~`pairs/attempts` ≈ 25 % of its time bonus. The perfect
   bonus (+50) already requires no broken miss, so it is untouched.
   ```js
   var acc = Math.min(1, this.pairs / Math.max(1, (this.stats.flips - this._lvFlips0) / 2));
   var tb  = Math.round(c.clearPerSecond * Math.ceil(Math.max(0, this.timeLeft)) * acc);
   ```
   (track `this._lvFlips0 = this.stats.flips` at the top of `_loadLevel`).
3. **Make the next-year factor per-difficulty** (optional, used by the values): let `diff.loopMul` /
   `diff.loopMin` override `CONFIG.loopMul` / `CONFIG.loopMin` in `loopFactor`. This keeps Easy's year-2
   loop gentle while letting Hard's bite.

### 3b. New `CGF.DIFFICULTY` values

```js
var DIFFICULTY = {
  easy:   { time: [105, 160, 215, 275], matchBonus: 6,   missDelay: 1.0, peek: 2.5, peekPerPair: 0.25,
            missPenalty: 1,        missLock: 1.0,  loopMul: 0.9,  loopMin: 0.75 },
  normal: { time: [60, 80, 100, 120],   matchBonus: 1.5, missDelay: 0.8, peek: 1.8, peekPerPair: 0.15,
            missPenalty: 2,        missLock: 0.6,  loopMul: 0.6,  loopMin: 0.5 },
  hard:   { time: [22, 28, 35, 42],     matchBonus: 1,   missDelay: 0.6, peek: 1.2, peekPerPair: 0.10,
            missPenalty: Infinity, missLock: 0.45, loopMul: 0.85, loopMin: 0.6 }
};
// CONFIG.clearTime etc. unchanged. CONFIG.loopMul/loopMin become per-difficulty fallbacks.
```

Rationale for the key values:
- **Easy times up (+5 to +80 s), `matchBonus` 4 → 6.** Carries the 4-year-old through the whole year
  (Winter clear 14 % → 69 %) while keeping the clock *present* — the clock is never tense on Easy Spring
  (56 % fuel left on a clear) but Winter clears land at ~37 % left, so it is relaxed, not irrelevant.
- **Easy `loopMul` 0.88 → 0.9, `loopMin` 0.6 → 0.75.** Year 2 on Easy stays winnable for a kid who got
  there (4-year-old Y2 Spring 57 %, Y2 Winter 37 %).
- **Normal `matchBonus` 3 → 1.5, times nudged up but `loopMul` 0.88 → 0.6.** Year 1 stays comfortable for
  the casual adult (100 % with 80–88 % fuel left) and fair for the 6-year-old (70–99 % Sp–Wi); year 2 adds
  real tension — the casual adult still clears Y2 to level 7 at 100 % but with the clock visibly tighter.
- **Hard times down, `matchBonus` 2 → 1, `missPenalty` already ∞.** Hard is now genuinely an adult mode:
  casual adult 100/100/99/99 % in year 1 dropping to 79 % by year-2 Winter; weak play (Bot 0.2, 6-year-old)
  washes out quickly, as intended.

## 4. Before → after (100 runs each; `tests/sim/out/compare_proposed.md` in full)

**Easy — the 4-year-old is carried through the year; mashing is no longer rewarded**

| model / diff | clear Sp | Su | Au | Wi | Y2 Sp | Y2 Wi | score p50 | fuel left Sp / Wi |
|---|---|---|---|---|---|---|---|---|
| 4-year-old | 94 → **97 %** | 67 → **87 %** | 32 → **79 %** | 14 → **69 %** | 11 → **57 %** | 1 → **37 %** | 795 → **1647** | 44→**56 %** / 21→**37 %** |
| 4-year-old (low mem) | 55 → **64 %** | 12 → **31 %** | 2 → **12 %** | 0 → **3 %** | — | — | 180 → 215 | 39→47 % / –→30 % |
| 6-year-old | 100 → 100 % (all seasons) | | | | | | 6330 → 5016 | 81→**92 %** / 62→**82 %** |
| casual adult | 100 → 100 % (all) | | | | | | 9105 → 8095 | 100 % / 100 % |
| **spam (random)** | 100 → **97 %** | 100 → **96 %** | 100 → **92 %** | 100 → **91 %** | 100 → **91 %** | 100 → **78 %** | **6245 → 1622** | 100→86 % / 90→55 % |
| **kid mashing** | 100 → 95 % | 98 → 84 % | 94 → 68 % | 82 → 45 % | 80 → 40 % | 56 → **10 %** | **3885 → 709** | 83→75 % / 42→41 % |

The exploit is closed: **spam's p50 score drops from 6245 to 1622, now *below* the 4-year-old's 1647**
(and p90 1904 < 4yo p90 2792). Mashing collapses to 709. Both still *can* clear early Easy boards (a 3-year-old
poking the screen should not be hard-walled), but they can no longer out-score, or even match, a child who
is actually remembering.

**Normal — fair for the 6-year-old / casual adult; year-2 loop harder but not impossible**

| model | clear Sp | Su | Au | Wi | Y2 Sp | Y2 Wi | score p50 |
|---|---|---|---|---|---|---|---|
| 6-year-old | 97 → 99 % | 90 → 95 % | 80 → 86 % | 53 → **70 %** | 51 → 49 % | 17 → 1 % | 1620 → 1318 |
| casual adult | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 6245 → 5070 |
| spam (random) | 100 → 96 % | 100 → 84 % | 100 → **52 %** | 100 → **25 %** | — | 97 → **0 %** | 3225 → 432 |

The casual adult still clears Normal year 2 to level 7 100 % of the time, but fuel-left on clears falls from
94 % to 80 % by Winter and the Y2 loop (×0.6 time) is the first place a casual adult feels pressure — the
requested "harder but not impossible". Spam cannot get past mid-year on Normal.

**Hard — now an adult mode**

| model | clear Sp | Su | Au | Wi | Y2 Wi | score p50 |
|---|---|---|---|---|---|---|
| casual adult | 100 % | 100 % | 99 % | 99 % | **79 %** | 4240 → 3044 |
| 6-year-old | 66 → **3 %** | 24 → 0 % | — | — | — | 210 → 30 |
| spam (random) | 100 → **43 %** | 98 → **9 %** | 94 → 0 % | — | — | 1960 → 40 |

## 5. Why values alone are not enough (the `valuesonly` run)

Running the *same* time/`matchBonus` numbers with **no code change** (`--set valuesonly`,
`tests/sim/out/compare_valuesonly.md`):

| model / easy | clear Wi (base → values-only) | score p50 |
|---|---|---|
| spam (random) | 100 % → **100 %** | 6245 → **7745** |
| kid mashing | 82 % → **100 %** | 3885 → **5885** |
| 4-year-old | 14 % → ~55 % | 795 → ~1500 |

A longer, more generous Easy clock helps the **spammer most of all** (score *rises* to 7745, still far above
the 4-year-old). The exploit is a *mechanics* problem, not a tuning problem — hence the two small
`world.js` additions in §3a. If the lead does not want any code change, the fallback is to drop the
3rd-tap-closes shortcut's time benefit another way, but `missLock` is the cleaner fix and keeps the
shortcut's feel for real players.

## 6. Other measurements (proposed values)

- **Average time per level (target 45–90 s for the intended audience).**
  Easy / 4-year-old: Sp 82 s, Su 129 s, Au 189 s, Wi 244 s — longer than 90 s, but that is the *right*
  pace for a 4-year-old doing a 12-pair board at 2–3 s/tap; the brief's 45–90 s band fits the 6-year-old on
  Easy (43–121 s) and the casual adult on Normal (16–42 s). No level drags for its intended player.
- **Time to first match.** 4-year-old ≈ 26 s (peek + slow first attempts), 6-year-old ≈ 9 s, casual adult
  ≈ 3 s, Bot 1.0 ≈ 0.8 s — monotonic with skill, as expected.
- **Combo ×5.** Reached on 74 % of levels by the 6-year-old and 99 % by the casual adult on Easy, but only
  3 % by spam — the combo meter rewards memory, not speed.
- **Fuel tension.** Easy Spring clears leave ~56 % of the clock for the 4-year-old (relaxed); Easy Winter
  ~37 % (present but not scary). On Normal the casual adult drops from ~88 % (Spring) to ~80 % (Winter) and
  lower in year 2; Hard runs in the 30–50 % range — the clock means something at every difficulty without
  ever being a wall for the intended player.
- **Hurry banner** (`10 s left`) essentially never fires on Easy for a real player (0–3 %), fires
  occasionally for the 6-year-old on Normal Winter (19 %), and often on Hard — matching the intended feel.

## 7. Recommended action

1. Add `missLock` and `tidyBonus` (and per-difficulty `loopMul`/`loopMin`) to `world.js` — ~15 lines,
   see §3a. Add a unit test that a wrong pair cannot be tapped away before `missLock` and that a 100 %-flip
   sweep earns ≈ `pairs/attempts` of the time bonus.
2. Replace `CGF.DIFFICULTY` with the §3b values.
3. Re-run `node tests/unit/run.js` and `node tests/sim/run.js --set proposed` to confirm.

Targets met: Easy Spring 97 % ≥ 90 % for the 4-year-old; Easy Winter 69 % (in the 60–80 % band); Normal fair
for the 6-year-old/casual adult; year-2 Normal harder but 100 % clearable by a casual adult; **spam never
out-scores the 4-year-old** (p50 1622 < 1647, p90 1904 < 2792).
