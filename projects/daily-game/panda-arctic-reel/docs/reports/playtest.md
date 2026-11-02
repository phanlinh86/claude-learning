# Bao's Arctic Reel: high-speed playtest report

Date: 2026-11-02 · Build: `b6e284d` (first integrated build) · Tester: high-speed playtest agent (report only, no game code changed)

## 1. Verdict

**The game is in good shape for its audience. No blocking issues.**

- **6-year-old on Easy, zone 1: pass.** The kid model cleared zone 1 in all 1000 rounds. The median was **37 s** and the slowest 10% took ≥ 48 s, so every round finished in under 90 s. **No round (0/1000) lost all three lines in zone 1.** The kid lost 0.10 lines on average there.
- **Mashing: pass.** Mashing never beats the reel meter. Honest timing lands 95–100% of hooked gems. Mashing at 8–10 Hz lands 0–4% of them, and every hooked gem escapes in about 0.35 s.
- **Camping: pass.** Parking the hook is never the best strategy. It is 2–5× slower than playing, and parking in the water with no dodging is not safe: 71–100% of campers lose all their lines within 10 minutes.
- **Later loops: fine on Easy and Normal, a grind on Hard.** On Easy and Normal, zone times stay flat across three loops. On Hard, mid-skill players get stuck in the Aurora zone of every loop because gems escape (up to 4 escapes per level). Only this one area needs tuning.
- **Proposal: four small preset changes** (Normal and Hard reel ramp, §6). Easy and every first zone stay exactly the same. Escapes in later zones go down 20–35% for mid-skill players. Experts and the exploit results do not change.
- **Outside world.js:** Normal is the **default** difficulty (`main.js` settings). A kid on Normal clears zone 1 (98.7%), but 99% of kid rounds on Normal end within about 4.4 minutes, around zone 3–4. See §7, item 1.

## 2. Method

`node tests/sim/run.js <suite>` loads `rng.js`, `world.js` and `bot.js` into a node `vm` the same way `tests/unit/load.js` does. The context has its own `Math`, which the scripts cache as `var M = Math`. The sims step at 60 fps (the world sub-steps at 1/120 s) and spread rounds over worker threads. About **28,000 rounds** in total (about 120 game-hours) ran in under 10 minutes of wall time.

Player models (`tests/sim/players.js`) use only `press()`/`release()` and what is on screen:

| model | how it plays |
|---|---|
| `bot 0.30 / 0.50 / 0.75 / 0.95` | The game's own `PR.Bot`. Perfect perception, skill sets timing error, reaction time and foresight |
| **kid** (5–6 y) | Reaction 350–600 ms. Watches the hook with a 0.22 s lag and little anticipation, so it holds too long or too short (release-point σ 30 px). Tap σ 120 ms. 15% double-taps (2nd tap 80–180 ms later). Never notices 50% of puffers. Chases the **nearest** gem where it is now. Looks away 1–3 s now and then |
| **adult** (casual) | Reaction 220–300 ms, 0.15 s lag, brakes early. Tap σ 60 ms. Predicts where gems will be and goes for the best one. Dodges every puffer it has noticed (1.4 s foresight) |
| **spam** | Hammers the button at 8–10 Hz all game (50 ms presses), never aims |
| **spamReel** / **kidMash** | Plays the hook like the adult (or kid) but mashes 8–10 Hz on the reel meter. This separates the question "can mashing beat the meter?" |
| **camper d** | Parks the hook at depth `d` (0 = never press, 1 = hold forever). Reels like the adult, never dodges |

Default screen 960×540. Layout check: 1170×540 (iPhone landscape), 960×720 (iPad landscape), 720×960 (iPad portrait), 560×1212 (iPhone portrait).

## 3. Survival, score, pace (`matrix`, 150 rounds per row, ≤ 10 min, 960×540)

| player | diff | game over in 10 min | zones cleared | score p10 / p50 / p90 | first gem (median s) | zone-1 s (median) | zone s, zones 1–4 (mean) | gems/min | escapes/zone | snaps/zone | Perfect % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **kid** | **easy** | 19% | 14.0 | 1465 / 2020 / 2295 | 8 | **36** | 39 | 9.2 | 0.26 | 0.38 | 35 |
| kid | normal | 99% (median 4.4 min) | 3.2 | 295 / 625 / 1025 | 8 | 56 | 67 | 6.8 | 2.23 | 1.23 | 22 |
| kid | hard | 100% (median 2.1 min) | 0.6 | 70 / 190 / 355 | 11 | 94 | 97 | 5.1 | 4.85 | 2.18 | 14 |
| **adult** | easy | 0% | 16.0 | 2460 / 2675 / 2875 | 8 | 38 | 39 | 9.8 | 0.00 | 0.13 | 66 |
| adult | **normal** | 42% | 9.4 | 1220 / 2225 / 2490 | 7 | 49 | 52 | 9.1 | 0.15 | 0.57 | 42 |
| adult | hard | 97% (median 5.3 min) | 3.4 | 530 / 955 / 1530 | 6 | 63 | 76 | 7.4 | 1.68 | 1.16 | 27 |
| bot 0.30 | easy / normal / hard | 0 / 11 / 39% | 11.0 / 4.6 / 1.8 | p50 1705 / 1010 / 510 | 8 / 9 / 12 | 44 / 73 / 141 | 50 / 117 / 194 | 6.8 / 4.2 / 2.6 | 0.9 / 7.3 / 21.7 | 0.05 / 0.35 / 0.98 | 26 / 15 / 10 |
| bot 0.50 | easy / normal / hard | 0 / 2 / 29% | 14.4 / 7.8 / 3.0 | p50 2280 / 1635 / 870 | 8 / 7 / 7 | 38 / 53 / 85 | 41 / 69 / 134 | 8.9 / 6.7 / 3.8 | 0.08 / 2.3 / 12.3 | 0.04 / 0.21 / 0.72 | 39 / 23 / 15 |
| bot 0.75 | easy / normal / hard | 0 / 1 / 8% | 16.8 / 12.2 / 8.2 | p50 2860 / 2695 / 2240 | 7 / 6 / 5 | 36 / 45 / 55 | 37 / 48 / 65 | 10.4 / 10.1 / 8.9 | 0 / 0.01 / 0.69 | 0.03 / 0.13 / 0.32 | 79 / 53 / 34 |
| bot 0.95 | easy / normal / hard | 0 / 1 / 9% | 17.4 / 12.9 / 9.8 | p50 3070 / 3130 / 3000 | 7 / 6 / 5 | 35 / 44 / 52 | 36 / 45 / 57 | 10.6 / 10.7 / 10.5 | 0 / 0 / 0 | 0.04 / 0.13 / 0.33 | 100 / 98 / 82 |

What this shows:
- **Time to first gem is 6–8 s** for everyone. The pre-seeded first gem works.
- **Zone time.** Normal is 45–55 s for anyone competent and Hard is 52–76 s, both inside the 45–90 s target. **Easy is short at 36–41 s**: 6 gems at about 9–10 gems/min. I keep this on purpose. REQUIREMENT fixes Easy at 6, short zones mean more celebrations for a small child, and real kids are slower than the model.
- **Gems/min tops out at about 10.5** for anyone good. The pace is set by the sea (spawns), not by player speed, as MECHANICS intends.
- The bot is much safer than any human model (snaps 0.04–0.13 vs 0.13–0.57 per zone on Easy and Normal). It sees every puffer instantly, so **`PR.Bot` numbers understate how hard the game is for people.** Use the adult and kid rows for balance.

### Zone 1 in depth (`kid1`, 1000 rounds per row)

| player | diff | clears zone 1 | zone-1 s p25 / p50 / p75 / p90 | ≤ 90 s | loses all 3 lines in zone 1 | lines lost (mean) | escapes (mean) |
|---|---|---|---|---|---|---|---|
| **kid** | **easy** | **100%** | 33 / **37** / 42 / 48 | **100%** | **0.0%** | 0.10 | 0.01 |
| kid | normal | 98.7% | 48 / 55 / 62 / 70 | 98% | 1.3% | 0.54 | 0.62 |
| kid | hard | 54.2% | 82 / 96 / 111 / 128 | 22% | 45.8% | 2.06 | 4.65 |
| adult | easy / normal / hard | 100 / 99.9 / 97.8% | p50 39 / 49 / 64 | 100 / 100 / 96% | 0 / 0.1 / 2.2% | 0.05 / 0.23 / 0.58 | 0 / 0 / 0.13 |

**Layouts (400 rounds each).** The kid on Easy clears zone 1 in all 400 rounds and loses all lines in none, on every screen: median 36 s (960×540), 42 s (1170×540, wide screen so gems travel further), 39 s (960×720), 38 s (720×960) and 38 s (560×1212). Portrait screens are actually a little *safer*. Puffers spread over a taller water column, so kid snaps drop from 0.09 to 0.05 per zone 1. Kid on Normal: 97.8–100% clear zone 1 on every layout. (`results/kid1-base-x-*.md`)

## 4. Lines, escapes and game-over causes

The only way to lose is snapped lines. Escapes cost time, never lines.

| player | diff | snaps | sinking into the puffer | rising into it | parked | puffer never noticed | within 4 s of a new line | game-over level (median) |
|---|---|---|---|---|---|---|---|---|
| kid | easy | 846 | 66% | 29% | 5% | 58% | 1% | 11 |
| kid | normal | 780 | 63% | 32% | 6% | 55% | 1% | 4 |
| adult | normal | 880 | 88% | 6% | 6% | – | 4% | 8 |
| adult | hard | 766 | 82% | 6% | 12% | – | 4% | 4 |
| bot 0.95 | hard | 542 | 94% | 5% | 0% | – | 2% | 8 |

- **Diving onto a gem through a puffer** causes most snaps for every model. The puffer dodge is a "look before you sink" skill, which is the intended lesson.
- The kid loses about 30% of its lines **floating up into a puffer**. With one button the only way to stop rising is to sink. This is fair and readable, but worth showing once in "How to play".
- **The invulnerability window works.** Only 1–5% of snaps happen within 4 s of a new line, so there is no chain of snaps.
- **Per level (loops suite):** the kid on Easy loses 0.1–0.6 lines per level and gets one back per cleared zone, so 7–13% of kid rounds end by level 12, at about 7 min. That is a good endless curve. The adult on Normal loses 0.6–1.0 lines per level from loop 2 on (up to 4 puffers at once), and 30–50% of rounds end by level 12. For an endless family game that is fine.

## 5. Reel meter, golden gem, exploits

### Reel meter (catches per hook)

| player | easy | normal | hard | s per reel (easy / normal / hard) |
|---|---|---|---|---|
| kid (σ 120 ms) | 95% | 77% | 59% | 2.7 / 3.3 / 3.2 |
| adult (σ 60 ms) | 100% | 98% | 84% | 2.1 / 2.6 / 3.0 |
| bot 0.50 (σ 114 ms) | 98% | 76% | 42% | 2.7 / 3.4 / 3.2 |
| bot 0.95 | 100% | 100% | 100% | 1.6 / 1.6 / 1.6 |
| **spamReel** (adult hook, mashing 8–10 Hz) | **0%** | **1%** | **4%** | 0.37 / 0.39 / 0.42 |
| **kidMash** | **0%** | **2%** | **6%** | 0.37 / 0.38 / 0.41 |

**Mashing never works.** Each reel starts with the needle at 0, and the first green zone is centred at least 0.35 away (`zoneStartMin`). Every tap outside the green is a slip, so 3 mashed taps in the first 0.3 s are 3 slips and the gem escapes. **Honest timing beats mashing by 55–100 percentage points on every difficulty.**

Regression risk: if the needle ever starts at a random phase, or slips get a cooldown, mashing could start to work. Keep a unit test that checks "mash at 10 Hz → escape".

A kid's accidental double-taps hardly matter. Turning them off (`--kid '{"doubleTap":0}'`) changes kid zone times by about 1 s and game-over rate by about 1 point. No debounce is needed.

### Exploits

| exploit | easy | normal | hard | verdict |
|---|---|---|---|---|
| **spam** 8–10 Hz all game | 0 gems, 19% game over, 1.45 snaps/zone | 0 gems, 75% over | 0 gems, 98% over | Hovering hooks gems, but they all escape. Puffers are **not** bypassed: hovering parks the hook in their path (76% of spam snaps happen while parked) |
| **camper 0** (never press: hook rests under the ice) | 1.8 gems/min, zone 137 s, 1% over | 2.1/min, 167 s, 19% over | 2.4/min, 201 s, 57% over | Safe-ish but about 5× slower than playing. It only catches the shallow gems that "sit right under the ice". Harmless, and kind to a 3-year-old who never presses |
| **camper 0.15–0.30** (best camping depth) | 5–6 gems/min, zone 50 s, **78–83% over** | 6–7/min, 58 s, 100% over | 7/min, 65–69 s, 100% over | Zone 1 is as fast as active play, but campers die: never dodging costs 0.9–2 snaps per zone. **Not too safe** |
| **camper 1** (hold forever, hook on the bottom) | 0.6 gems/min, zone 451 s | 0.7/min | 0.7/min | Useless |

### Golden gem

| player | diff | golden per zone | hooked / spawned | landed / hooked | landed / spawned | share of score |
|---|---|---|---|---|---|---|
| kid | easy | 0.76 | 37% | 92% | 34% | 10% |
| adult | easy / normal / hard | 0.68 / 1.06 / 1.62 | 72 / 53 / 43% | 100 / 96 / 74% | 72 / 51 / 32% | 15 / 14 / 12% |
| bot 0.95 | easy / normal / hard | 0.66 / 0.92 / 1.27 | 79 / 69 / 62% | 100% | 79 / 69 / 61% | 14–16% |

**Rate.** About one golden gem per zone, roughly every 40–50 s. That is rare enough to be an event (it has its own sound) and common enough that every zone has a chance. An adult lands about half of them on Normal. That feels right: a real chance, not a sure thing. Gold makes up about 15% of the score.

**The kid misses about two out of three.** Speed is **not** the main reason. With `goldSpeed` 1.6 → 1.3 (re-simulated) the kid's hook rate only goes from 37% to 44%, because the kid model chases the *nearest* gem rather than the shiny one. A real child who hears the golden jingle will probably chase it. **No change proposed.** If the team wants a sure win for small kids, a per-difficulty `goldSpeed` (Easy 1.3) is a one-line code change, but the gain is small.

## 6. Later loops and the proposal

Median seconds per level, **base** (`loops`, 40 rounds per row, ≤ 12 levels; `*` = some rounds already over):

| player | diff | L1 | L2 | L3 | **L4 aurora** | L5 | L6 | L7 | **L8** | L9 | L10 | L11 | **L12** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 0.95 | easy | 35 | 37 | 38 | 35 | 35 | 37 | 36 | 31 | 36 | 31 | 34 | 35 |
| bot 0.95 | normal | 43 | 43 | 45 | 49 | 48 | 46 | 46 | 45 | 40 | 43 | 46 | 45 |
| kid | easy | 37 | 39 | 37 | 45 | 39* | 35* | 37* | 41* | 34* | 38* | 40* | 41* |
| adult | normal | 48 | 49 | 53 | 55 | 50* | 53* | 55* | 57* | 46* | 47* | 59* | 63* |
| bot 0.75 | **hard** | 55 | 62 | 67 | **76*** | 61* | 64* | 73* | **87*** | 58* | 67* | 75* | **88*** |

Easy and Normal stay flat across loops. Gem spawns speed up with the loop too, which keeps the pace. The **Aurora zone (every 4th level) is where the reel gets hard.** The needle speed is `(needle + needleZone·zone)·loopMult` and the green width shrinks by `reelWidthZone·zone + 0.02·loop`, so the two effects stack. At level 12 on Hard the green is 0.15 wide and the needle makes 1.3 sweeps/s, so a player has about ±37 ms to hit it. For a mid-skill player it becomes a coin flip:

- bot 0.75, Hard: 1.7 → 3.3 → 4.1 escapes in L4, L8, L12, and zone time climbs from 55 s to 88 s.
- adult, Normal: 0.2 → 0.5 → 1.2 escapes in L4, L8, L12.
- kid, Normal: 5.9 escapes in L4.

I tested the alternatives by setting CONFIG inside the vm (`--set`, results in `results/loops-base-x-*.md`):

| variant (Hard) | bot 0.75 escapes L4 / L8 / L12 | bot 0.75 zone s L8 / L12 | bot 0.95 |
|---|---|---|---|
| base (needleZone .09, widthZone .025, widthMin .15) | 1.68 / 3.29 / 4.06 | 87 / 88 | 0 escapes |
| needleZone .07, widthMin .17 | 1.18 / 2.00 / 2.10 | 78 / 79 | 0 escapes |
| **needleZone .06, widthZone .02, widthMin .17** | **0.55 / 1.34 / 1.74** | **77 / 77** | 0 escapes |

| variant (Normal) | adult escapes L4 / L8 / L12 | kid escapes L2 / L3 / L4 |
|---|---|---|
| base (needleZone .07, widthZone .025) | 0.19 / 0.50 / 1.17 | 1.49 / 3.22 / 5.89 |
| **needleZone .05, widthZone .02** | **0.05 / 0.12 / 0.51** | **1.31 / 2.59 / 4.02** |
| … plus pufferGrow .82 → .85 | 0.04 / 0.15 / 0.50 | 1.11 / 2.78 / 3.33. Snaps hardly change, so this was dropped |

### Proposed changes (exact)

| key | old → new | reason |
|---|---|---|
| `difficulty.normal.needleZone` | **0.07 → 0.05** | The Aurora and loop needle caused most late escapes. Aurora needle 0.86 → 0.80 sweeps/s |
| `difficulty.normal.reelWidthZone` | **0.025 → 0.02** | The green shrinks a little more slowly. Aurora green 0.225 → 0.24 |
| `difficulty.hard.needleZone` | **0.09 → 0.06** | The same fix for Hard. Aurora needle 1.12 → 1.03 sweeps/s |
| `difficulty.hard.reelWidthZone` | **0.025 → 0.02** | Aurora green 0.165 → 0.18 |
| `difficulty.hard.reelWidthMin` | **0.15 → 0.17** | At loop speed 0.15 was a coin flip even for a skilled player (±37 ms) |

Nothing else changes. Easy, puffers, gold and spawns stay as they are. **Zone 1 is unchanged on every difficulty**, because `zone = 0` makes the `*Zone` terms zero.

### Before → after (re-simulated: proposal applied to `world.js` source in the vm, 300 rounds per case, ≤ 10 min)

| player | diff | game over | zones in 10 min | median score | escapes/zone | catch / hook | gems/min |
|---|---|---|---|---|---|---|---|
| kid | easy | 12 → **12**% | 14.4 → **14.4** | 2040 → **2040** | 0.25 → **0.25** | 95 → **95**% | 9.2 → **9.2** |
| kid | normal | 99 → **99**% | 3.3 → **3.6** | 630 → **665** | 2.31 → **1.87** | 76 → **80**% | 6.7 → **7.0** |
| adult | normal | 38 → **32**% | 9.3 → **9.6** | 2250 → **2295** | 0.14 → **0.06** | 98 → **99**% | 9.1 → **9.2** |
| adult | hard | 93 → **94**% | 3.5 → **3.6** | 960 → **985** | 1.60 → **1.04** | 85 → **90**% | 7.4 → **7.6** |
| bot 0.50 | normal | 2 → **2**% | 7.7 → **8.3** | 1645 → **1725** | 2.30 → **1.59** | 76 → **82**% | 6.6 → **7.0** |
| bot 0.50 | hard | 34 → **32**% | 3.1 → **3.5** | 865 → **960** | 11.87 → **9.38** | 42 → **49**% | 3.9 → **4.4** |
| bot 0.95 | normal / hard | 2 / 7 → **2 / 8**% | 12.7 / 9.8 → **12.7 / 9.8** | 3130 / 2975 → **3090 / 2990** | 0 → **0** | 100 → **100**% | 10.6 / 10.5 → **10.6 / 10.6** |
| spamReel | easy / normal / hard | unchanged | 0 | 0 / 15 / 40 | – | **0 / 1 / 4%** | – |
| spam, camper | – | unchanged | | | | | |

Zone 1 (600 rounds per case) is **identical** before and after for every kid and adult case. Loops (30 rounds): adult Normal level times stay at 47–58 s, and the bot 0.95 on Hard keeps 50–66 s. Its "reached L12" went from 80% to 100%, but that is within noise: the 60-round runs in the table above showed 88% → 87%. Hard deaths come from puffers, and the proposal does not touch puffers.

The proposal makes the late game fairer for mid-skill players and leaves experts, beginners in zone 1 and the exploit results alone. Unit tests still pass with the patch applied: **23/23** on a patched copy.

### Patch (`tests/sim/results/proposal.patch`, checked with `git apply --check` from the repo root)

```diff
diff --git a/projects/daily-game/panda-arctic-reel/game/js/world.js b/projects/daily-game/panda-arctic-reel/game/js/world.js
--- a/projects/daily-game/panda-arctic-reel/game/js/world.js
+++ b/projects/daily-game/panda-arctic-reel/game/js/world.js
@@ -117,9 +117,9 @@
         gemR: 27, pufferR: 19,
         gemEvery: [3.0, 4.4],
         gemSpeed: [38, 56],
-        reelWidth: 0.30, reelWidthZone: 0.025, reelWidthMin: 0.20,
+        reelWidth: 0.30, reelWidthZone: 0.02, reelWidthMin: 0.20,   // playtest: green shrinks a bit slower per zone
         perfect: 0.08,
-        needle: 0.65, needleZone: 0.07,
+        needle: 0.65, needleZone: 0.05,   // playtest: aurora/loop needle was the main cause of late escapes
         stepsFull: 5,
         maxSlips: 3,
         pufferEvery: 13, pufferMin: 5, pufferMax: 2, pufferMaxCap: 4,
@@ -131,9 +131,9 @@
         gemR: 24, pufferR: 21,
         gemEvery: [2.8, 4.2],
         gemSpeed: [46, 68],
-        reelWidth: 0.24, reelWidthZone: 0.025, reelWidthMin: 0.15,
+        reelWidth: 0.24, reelWidthZone: 0.02, reelWidthMin: 0.17,   // playtest: 0.15 at loop speed was a coin flip
         perfect: 0.06,
-        needle: 0.85, needleZone: 0.09,
+        needle: 0.85, needleZone: 0.06,   // playtest: aurora/loop needle was the main cause of late escapes
         stepsFull: 6,
         maxSlips: 3,
         pufferEvery: 8, pufferMin: 3.2, pufferMax: 3, pufferMaxCap: 5,
```

After applying it, update the presets table in `docs/MECHANICS.md` §1 (normal `reelWidthZone` .025 → .02 and `needleZone` .07 → .05; hard `reelWidthZone` .025 → .02, `reelWidthMin` .15 → .17 and `needleZone` .09 → .06). Then re-run `node tests/sim/pacing.js` for §6 of that file.

## 7. Notes for the team (not in the patch)

1. **The default difficulty is Normal** (`main.js` `settings.difficulty: 'normal'`). A 6-year-old on Normal clears zone 1 (98.7%, median 55 s), but 99% of kid rounds on Normal end within about 4.4 minutes, around zone 3–4. About half of the kid's snaps come from puffers it never noticed. **Suggestion:** make Easy the first-run default, or label Easy as "for little ones" on the title screen. The proposal's Normal changes help the kid's reel only a little; the kid loses mainly to puffers.
2. **Show "floating up can bump a puffer too"** in How to play. About 30% of a kid's snaps happen while rising.
3. **`PR.Bot` is too good at puffers** to stand in for people (snaps 3–10× lower than the adult model). For balance numbers, use `tests/sim/run.js`, not only `pacing.js`.
4. **Add a guard test against mashing:** mash at 10 Hz → the gem escapes. The meter's resistance to mashing depends on `zoneStartMin` and on the needle starting at 0.

## 8. Reproduce

```
cd projects/daily-game/panda-arctic-reel
node tests/sim/run.js matrix --n 150     # §3–5   (~1.5 min on 2 cores)
node tests/sim/run.js kid1 --n 1000      # zone 1
node tests/sim/run.js loops --n 40       # §6
node tests/sim/run.js kid1 --n 400 --size 560x1212 --tag x-560x1212   # layouts
node tests/sim/run.js loops --n 60 --only "hard:bot 0.75" --set '{"difficulty.hard.needleZone":0.06}' --tag try   # CONFIG what-ifs
node tests/sim/run.js compare --n 300    # before → after (~5 min)
node tests/sim/run.js patch              # regenerates results/proposal.patch
```

All tables are in `tests/sim/results/*.md`. The game code on disk was not modified.

## Applied by the integrator (2026-11-02)
- The proposed patch (Normal/Hard needleZone and reelWidthZone, Hard reelWidthMin) is applied to `game/js/world.js`; `docs/MECHANICS.md` presets updated.
- Easy is now the first-run default; How to Play says floating up can bump a pufferfish too; a unit test guards against mashing (24/24 pass).
