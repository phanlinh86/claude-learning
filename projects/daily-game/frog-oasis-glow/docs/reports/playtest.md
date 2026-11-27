# Pip's Oasis Glow: high-speed playtest

Date: 2026-11-27. Report only: no game code was changed.
Tools: `node tests/sim/playtest.js [patch ...] [--quick]` (new). It builds on `tests/sim/harness.js` and adds gold tracking, what caused each lost heart, double-tapping kids, a gold-only greedy player, an empty-hole fidgeter, mid-hop spam, late-game starts, and CONFIG A/B patches. The raw JSON and full tables are in `tests/sim/out/playtest-<patch>.json` and `pt-<patch>.md` (gitignored).
About 32,000 simulated rounds per patch: 1000 seeds per kid model for chapter 1, 80–150 seeds per cell on a 600 s cap, and 60 seeds per late-game cell. 12 patches were run.

## Verdict
The core loop is solid. Kids score fast, and chapter pacing for kids sits in the 45–90 s window. There are no stalls or softlocks, and every exploit loses to normal play. Three things are worth tuning, and all three can be fixed in CONFIG:
1. **The golden firefly is too rare to count on.** About 1 per chapter, and **34 %** of kid4 chapters have none. A 3-year-old catches only **63 %** of the ones that do appear.
2. **Easy ends too soon for the youngest players.** kid3 clears chapter 1 only **60 %** of the time. kid4's median game is **130 s** (about 2 chapters). On Easy, every lost heart comes from tapping a napper.
3. On Normal and Hard, chapters run **30–39 s** for adults, below the 45 s target. A single global `LEVEL_GOAL` can't fix this without hurting kids (see goal18 below).

## Recommended CONFIG changes (re-simulated)
| key | old → new | why |
|---|---|---|
| `GOLD_P` | 0.07 → **0.10** | gold per chapter 1.05 → 1.53; chapters with no gold 34 % → 20 % |
| `GOLD_UP_K` | 0.75 → **0.90** | gold up time on Easy ≈ 2.1 → 2.5 s; kid3 catch rate 63 → 69 % |
| `START_LEAVES` | 4 → **5** (= `MAX_LEAVES`) | kid3 clears chapter 1 60 → 81 %; kid4 91 → 99 % |

Optional: `LEAF_EVERY` 12 → 10 (patch `recLeaf`) gives longer kid sessions (kid4 161 → 183 s, kid5 370 → 452 s). It also makes Normal easier for adults (parent 295 → 338 s), so apply it only if Easy matters more than Normal.

### Before and after (`base` vs `rec` = the 3 changes above; same seeds)
| metric | base | rec |
|---|---|---|
| Ch. 1 Easy cleared: kid3 / kid4 / kid4 double-tapper / kid5 (1000 seeds) | 60 / 91 / 88 / 100 % | **81 / 99 / 98 / 100 %** |
| Ch. 1 clear time kid4 p10/p50/p90 | 50 / 58 / 70 s | 50 / 58 / 69 s (unchanged) |
| Gold per chapter (kid4) / chapters with 0 gold | 1.05 / 34 % | **1.53 / 20 %** |
| Gold catch rate kid3 / kid4 / kid5 | 63 / 80 / 92 % | **69 / 85 / 94 %** |
| Easy survival p50: kid3 / kid4 / kid4-mild / kid5 | 94 / 130 / 273 / 367 s | 120 / 161 / 312 / 370 s |
| Normal survival p50: parent / bot 0.3 / bot 0.5 | 281 / 122 / 441 s | 295 / 132 / 445 s |
| Hard survival p50: parent / bot 0.5 | 118 / 108 s | 141 / 124 s |
| Easy pts/min: parent / gold-only greedy | 804 / 101 | 861 / 175 |

Other patches I tried and rejected:

| patch | result |
|---|---|
| `GOLD_P` 0.12 | 1.82 gold per chapter: gold stops feeling rare |
| `LEAF_EVERY` 8 | Normal parent 281 → 411 s, too soft |
| Easy `fireflyP` 0.8 | kid3 only 60 → 65 % |
| `LEVEL_GOAL` 18 | adults' chapters reach 47 s, but kid4 ch. 1 drops 91 → 84 % and kid3 60 → 43 % |
| `MASH_N` 4 | not needed: double-tapping kids never trigger a nap |

## Key numbers (shipped CONFIG)
- **Time to first point:** p50 2.5 s (kid5) to 3.4 s (kid3). p90 is 3.6 s (kid5), 6.0 s (kid4) and 8.9 s (kid3). Bots and the parent model score at 1.8–2.5 s.
- **Chapter pacing (mean s, chapters 1/2/3/4+):**

  | player | difficulty | s per chapter |
  |---|---|---|
  | kid4 | Easy | 60 / 55 / 65 |
  | kid5 | Easy | 51 / 49 / 48 / 46 |
  | parent | Easy | 45 / 44 / 43 / 40 |
  | parent | Normal | 39 / 38 / 38 / 35 |
  | parent | Hard | 36 / 35 / 34 / 32 |
  | bot 1 | Hard | 30 / 29 / 28 / 25 |
  | late loops, adults | any | 23–37 |

  Kids are inside the 45–90 s target. Adults on Normal and Hard are under it.
- **Survival:**
  - Easy is endless for any competent player: bot 0.3 and parent are 100 % alive at 600 s, and the parent model was still alive after 1800 s and 47 chapters. Kids die only from nappers: kid4 p50 130 s, kid5 p50 367 s.
  - Normal: parent p50 281 s, bot 0.5 p50 441 s, bot 0.8 and up never die.
  - Hard: parent p50 118 s.
  - Kids on Normal and Hard last 11–34 s, so Easy has to stay the default for 3–5-year-olds.
- **Nappers:** sleeper share of pops is 30 / 37 / 47 % (Easy / Normal / Hard).
  - Wrong-tap share: kid3 22 %, kid4 16 %, kid5 9 %, parent 2 %. kid4 makes 2.8 wrong taps per minute but earns only about 1.25 hearts per minute, which is why its runs end.
  - Nappers create a real choice: the parent model avoids almost all of them (0.36 wrong taps per minute). For 3- and 4-year-olds the penalty is what ends the game; 5 starting hearts softens that without removing the rule.
- **Late game (starting at loop 2 / loop 4, which is the speed cap):**

  | difficulty | player | loop 2 | loop 4 |
  |---|---|---|---|
  | Easy | parent | 100 % alive at 300 s | 100 % alive at 300 s |
  | Normal | parent | p50 130 s | p50 66 s |
  | Hard | parent | p50 51 s | p50 32 s |

  bot 1 survives everything, with 23–28 s chapters. The ramp is real on Normal and Hard. On Easy only nappers ever cost a heart, so there is no late-game pressure.

## Exploits
All shipped CONFIG, 60 seeds, 600 s cap.

| exploit | result |
|---|---|
| Mash every burrow at 8 taps/s | Dead in 48 s on Easy (scores 157 pts/min vs 804 for the parent). Mostly naps and sleepers under the finger. |
| Tap every friend instantly (`tapAll`) | 897 pts/min on Easy but dies at about 375 s (sleepers). On Normal it dies in 19 s. |
| Instant perfect taps + mashing empty burrows (`smartSpam`) | 376 pts/min, well under an honest bot 1's 1052. The mash nap costs more than it gains. |
| Poke an empty burrow every ~1 s while playing well (`fidget`) | Never triggers a nap, score equal to the parent. Harmless, and not punished. |
| Hammer every burrow while Pip is mid-hop (`hopSpam`) | Taps while airborne are mostly `busy`/`empty`, and it hits 609 sleepers. 321 pts/min, dies. Re-aiming gives no free points, because hits are decided at tap time. |
| Only tap gold (`goldOnly`) | Easy: never dies (misses are free), 101 pts/min (175 with `rec`). Normal: dies in 13 s. Not a dominant strategy. |
| Kid double-tap (50 % of taps followed by a second tap 0.08–0.3 s later) | 0 naps; chapter 1 clear rate 88 % vs 91 %, within noise of the changed RNG draws. The mash guard does not punish double taps. |

## Stall / softlock check
Every model, difficulty and patch:
- Longest gap between pops: **3.8 s** (Easy).
- Longest stretch with no firefly visible: **2.0 s**.
- Longest stretch without a boop for bot 1: **3.1 s**.
- No NaN positions.

Idle player: Easy never ends (misses are free, and the run goes on with no prompt). Normal and Hard end in about 12 s and 10 s.

## Real game in Chromium (`?speed=8&bot=1&diff=easy&seed=5`, iPad 1024×768 and phone 844×390)
- 47 s real time ≈ 365 s of game (×7.7). 10 chapters cleared at 32–35 s each, which matches the simulation (bot 1 Easy: 35 s). 158 boops, 9 golds, 0 wrong, 0 missed.
- **0 console errors.** Frame rate: 44 fps on the iPad viewport at ×8 (headless, software rendering), 59.5 fps on the phone. At most 30 particles and 4 effects at once.
- Things that felt off:
  - **Phone landscape:** the firefly-jar progress ring at the top centre overlaps Pip's head while he sits on the lily pad (`tests/sim/out/browser_phone_ch3.png`).
  - **Starlit Oasis (night):** the ambient `glow` particles look a lot like the fireflies a child is told to boop. Some drift over the burrows. Consider dimming them, or keeping them above the back row.
  - The chapter-clear pause (1.2 s) shows an empty field. That's fine at ×1, and it's where both screenshots happened to land.

## Suggestions outside CONFIG (code, for the team)
- A per-difficulty chapter goal (for example `DIFFICULTY.*.goal`: Easy 15, Normal 18, Hard 20) would bring adult chapters to about 45 s without touching kids.
- Easy has no end for a competent player, and an idle child gets no prompt. The playtester before suggested an "end of tour" screen after loop 1 and an idle hint; both are still worth doing.
- This folder's `CLAUDE.md` still describes "Zippy's Jungle Boop" (the forked game). It should be updated.
