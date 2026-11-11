# Zippy's Jungle Boop — high-speed playtest report

Date: 2026-11-11 · Tester: high-speed playtest agent · Scope: report only (no changes to `game/js`).

**How it was run.** `node tests/sim/run.js` (≈ 5 min of CPU; `--quick` for a quarter of the seeds). The harness
(`tests/sim/harness.js`) loads `rng.js`, `world.js` and `bot.js` into a node `vm` with a fake `window`, the same way
`tests/unit/run.js` does. Players step at 60 fps and the world keeps its 1/120 s sub-steps. The recommended CONFIG is applied by
deep-merging a patch into `World.CONFIG` inside the vm before any world is created. In total there were about 23,000 rounds
(≈ 2,600 simulated hours). Raw numbers are in `tests/sim/out/{base,rec}.json`.

## 1. Player models

| model | what it does |
|---|---|
| `bot s` | the game's own `ZJB.Bot` at skill 0.3 / 0.5 / 0.8 / 1 |
| `kid4` | **a 4-year-old.** Reacts in 0.9–1.6 s, plus 0.4–1.0 s for critters far from where they look (gaze radius 260 px, and a new pop pulls the gaze 60 % of the time). Taps a matching critter 85 % of the time. **Taps a decoy near the gaze 55 % of the time (15 % when far).** Sees a colour change one reaction late. Stops for about 3 s once every 25 s on average. One tap every 0.6–1.0 s. Measured wrong-colour share of taps on the base build: **23 %** (target ≈ 25 %). |
| `parent` | a casual adult. Reacts in 0.5–0.9 s, taps decoys 6 % (near) / 2 % (far) of the time, looks at the phone 2–5 s about once a minute. Wrong share about 3 %. |
| `kidSpam` | the 4-year-old ignoring colour: same timing, taps everything it notices |
| `tapAll` | spam: taps **every** critter 0.15 s after it becomes tappable, whatever its colour |
| `mash` / `mash4` | spam: taps the burrows in turn at 8 / 4 taps per second, without looking |
| `preTap` | spam: hammers burrows that look empty (empty or still rising) at 8 per second, hoping to catch a pop |
| `smartSpam` | the honest player at the same speed: taps every matching critter instantly and also mashes the empty burrows |
| `idle` | never taps |

## 2. Results on the current build (`base`)

600 s cap. Survival and score are p10 / p50 / p90. L0 = Riverbank cleared. s/level = average seconds for levels L0 / L1 / L2 / L3+.

| player | diff | N | survival s | score | levels p50 | L0 cleared | 1st boop p50 | s/level | wrong share | pts/min |
|---|---|---|---|---|---|---|---|---|---|---|
| bot 0.3 | easy | 200 | 199/600/600 | 1450/5690/6150 | 14 | 97 % | 2.5 | 43/42/41/40 | 6 % | 548 |
| bot 1 | easy | 200 | 600/600/600 | 9100/9260/9430 | 18 | 100 % | 1.8 | 33/33/32/30 | 0 % | 926 |
| **kid4** | easy | 300 | **21/37/86** | 50/100/390 | **0** | **27 %** | 2.9 | 56/55/50/– | 23 % | 187 |
| parent | easy | 300 | 600/600/600 | 6160/6640/7030 | 15 | 100 % | 2.3 | **42/41/40/38** | 3 % | 660 |
| kidSpam | easy | 300 | 15/19/30 | 30/50/90 | 0 | 0 % | 2.8 | 47/– | 36 % | 158 |
| tapAll | easy | 300 | 91/120/175 | 860/1200/1790 | 3 | 100 % | 1.7 | 32/32/31/31 | 11 % | 599 |
| **mash (8/s)** | easy | 300 | **23/49/77** | 90/330/580 | 1 | **74 %** | 1.9 | 35/34/– | 17 % | **381** |
| mash4 | easy | 300 | 15/23/45 | 50/90/250 | 0 | 13 % | 2.3 | 37/– | 26 % | 240 |
| preTap | easy | 300 | 34/69/132 | 20/60/160 | 0 | 7 % | 8.5 | 138/– | 32 % | 59 |
| smartSpam | easy | 300 | 600/600/600 | 10400/10490/10610 | 21 | 100 % | 1.5 | 31/30/29/26 | 0 % | 1050 |
| bot 0.3 | normal | 200 | 27/70/163 | 90/440/1300 | 1 | 79 % | 2.5 | 40/40/39/40 | 7 % | 367 |
| bot 0.5 | normal | 200 | 133/351/464 | 950/3400/4920 | 9 | 99 % | 2.3 | 37/36/36/35 | 5 % | 583 |
| bot 0.8 | normal | 200 | 600/600/600 | 8350/8780/9230 | 19 | 100 % | 2.0 | 34/33/32/30 | 1 % | 878 |
| parent | normal | 300 | 31/125/329 | 130/1020/3190 | 3 | 85 % | 2.3 | 39/38/37/36 | 3 % | 440 |
| kid4 | normal | 300 | 10/15/23 | 10/30/70 | 0 | 0 % | 2.8 | – | 28 % | 127 |
| tapAll | normal | 300 | 10/16/22 | 40/80/120 | 0 | 3 % | 1.7 | 28/– | 29 % | 291 |
| bot 0.3 | hard | 200 | 13/22/46 | 30/80/270 | 0 | 17 % | 2.5 | 38/36 | 9 % | 232 |
| bot 0.5 | hard | 200 | 21/66/131 | 80/450/1270 | 1 | 76 % | 2.3 | 35/35/34/33 | 5 % | 421 |
| bot 0.8 | hard | 200 | 480/600/600 | 6380/8290/8950 | 20 | 100 % | 2.0 | 30/30/29/27 | 2 % | 844 |
| parent | hard | 300 | 18/51/118 | 60/330/1030 | 1 | 61 % | 2.3 | 36/34/33/33 | 5 % | 367 |
| tapAll / mash / preTap | normal + hard | 300 each | p50 8–16 s | ≤ 80 | 0 | ≤ 3 % | | | 29–44 % | |

On Normal and Hard every spam strategy is dead within 8–16 s, so spam is only a question on Easy.

**The 4-year-old on Riverbank (Easy), 2,000 seeds:** cleared **26 %**. Clear time p10/p50/p90 = 47/55/65 s. First boop p50/p90 = 2.9/6.0 s.

**Idle (never taps), 1,800 s cap:** Easy never ends: 0 % game over, 3 leaves kept, the colour changes 4.3 times a minute and
critters keep popping. Normal ends at 9 s and Hard at 8 s (missed matches cost leaves).

**Endless Easy, 1,800 s cap:** parent 100 % still alive after 48 levels; bot 1 100 % alive after 59 levels; bot 0.3 15 % alive; kid4 0 % (median 32 s).

**Colour-change fairness.** For each wrong tap the harness records the time since the last colour change and whether the
tapped critter had the *old* colour:

| player | wrong taps | < 1 s | 1–2 s | 2–3 s | > 3 s | old colour, within 4 s of the change |
|---|---|---|---|---|---|---|
| bot 0.3 | 2986 | 8 % | 7 % | 3 % | 82 % | **14 %** |
| bot 0.8 | 2328 | 7 % | 6 % | 7 % | 80 % | 12 % |
| parent | 2804 | 6 % | 3 % | 4 % | 86 % | **10 %** |
| kid4 | 1822 | 1 % | 3 % | 1 % | 95 % | 6 % |

With `GRACE = 0.8` s, any player whose reaction is slower than 0.8 s (that is, every child) still taps the old colour just
after grace ends, and loses a leaf for it. These taps are 10–14 % of all wrong taps for the bot 0.3 and the parent.

**Stall and softlock check (all runs):** the longest gap between pops was 3.2 s (3.8 s with the patch). The longest time with
no matching critter visible was 2.0 s, which is the `FAIR_T + FAIR_HURRY` bound. No NaN positions. Every run that was still
alive kept making progress through the levels. **No softlock found.**

## 3. Issues

### P1 — The default audience (a 4-year-old on Easy) almost never clears Riverbank: 26 % (target ≥ 70 %)
A child with a ~25 % wrong-colour rate makes about 5 wrong taps in the 15 boops a level needs. With 3 leaves and +1 leaf every
12 boops, the game is over before Riverbank is cleared (median session 37 s, p90 86 s). The default player loses in the first
minute, three times out of four.

The bot sweep in MECHANICS §7 ("skill 0.3 = a 4-year-old", 19/20 cleared) is far too optimistic. The bot taps a decoy only
`0.18·(1−s)^1.5 ≈ 11 %` of the time at skill 0.3. Real kids tap whatever pops up where they are looking.

### P2 — Mashing beats honest play for a young child (Easy)
Mashing the burrows at 8 taps/s, without looking, gives **49 s, 74 % Riverbank and 381 pts/min**. The honest 4-year-old gets
37 s, 27 % and 187 pts/min. A child who finds out that mashing works learns the wrong lesson.

Empty taps cost nothing, so mashing is free except for the decoys it catches as they rise. **No CONFIG key can fix this**: blind
tapping and the impulsive child both lose leaves on decoys, so any change to leaves or decoys moves both by the same factor. It
needs a small code rule, prototyped in the harness (`opts.guard`):

> **Mash guard:** 3 empty taps within 1.0 s → Zippy takes a 1.5 s nap (taps answer `'busy'`, no leaf lost, a gentle "zzz" plus
> a voice line: "Look for the coral friend!").

| player (Easy, recommended CONFIG) | survival p50 guard off → on | pts/min off → on |
|---|---|---|
| kid4 | 111 → 111 | 231 → 231 (never triggers) |
| parent | 600 → 600 | 646 → 646 (never triggers) |
| mash 8/s | 196 → **41** | 529 → **136** |
| mash 4/s | 84 → 51 | 349 → 134 |
| preTap | 120 → 567 | 57 → **13** (it lives longer because it naps all the time, but scores almost nothing) |

With the guard on, honest play beats every spam strategy for both the child and the adult.

`tapAll` (a very fast player who taps every critter whatever its colour) is *not* an exploit. It lives 2–6 min on Easy and
under 20 s on Normal/Hard. The honest player at the same speed (`smartSpam`) never dies and scores 30–40 % more per minute.
At the same speed, honest play always wins.

### P2 — Colour-change "gotcha" taps: `GRACE` 0.8 s is shorter than a child's reaction
These are the 10–14 % of wrong taps described in §2: taps on the old colour just after grace ends. With `GRACE = 1.5`, that
share falls to 6 % for both the bot 0.3 and the parent, and to 3 % for the kid. The 1 s `colourWarn` voice line already helps
real players, so 1.5 s of grace together with the warning covers a 4-year-old's reaction time.

### P2 — Idle on Easy runs forever with leaves intact
A child who walks away leaves the game running: critters pop, the colour cycles 4.3×/min, sounds and voice keep playing, and
the game never ends. **Do not make misses cost leaves on Easy.** Punishing a 4-year-old for a 3 s pause is the wrong fix (the
child model pauses for about 3 s every 25 s). Recommended change in `main.js`, which is outside the CONFIG:
- after **8 s with no tap**: a voice hint ("Tap the *sunny* friend!") and a glow on one matching critter;
- after **45 s with no tap**: auto-pause with a "Still playing?" card (and voice), which also saves battery on a tablet.

`world.sinceBoop` cannot drive this because it also resets on every colour change. `main.js` needs its own last-tap clock.

### P3 — Easy is endless for anyone competent
Every parent and bot ≥ 0.5 run was still alive after 1,800 s (45–59 levels). The speed-up stops at loop 4, so play becomes a
plateau. That is fine for a toy, but a 4-year-old's session has no natural end except a game over. Suggestion (code): after
round 1 (four biomes), show a "Jungle tour complete!" celebration with *Play again / Keep going*.

### P3 — Casual-adult biome time is just under the 45–90 s aim
On the base build the parent takes 42/41/40/38 s per biome; with the recommended patch, 44/44/43/40 s. The 4-year-old takes
about 59 s, which is inside the range. If longer adult levels are wanted, raise Easy `interval` from 3.0 to 3.4 (≈ 46 s). Do
**not** raise `LEVEL_GOAL`: that makes the child's clear rate worse.

### P3 — MECHANICS §7 overstates how good a 4-year-old is
Re-label the bot 0.3 row as "an attentive 5–6-year-old" and add the `kid4` row from this report.

## 4. Recommended CONFIG diff

```diff
-    START_LEAVES: 3, MAX_LEAVES: 5, LEAF_EVERY: 12,
+    START_LEAVES: 4, MAX_LEAVES: 5, LEAF_EVERY: 12,
-    GRACE: 0.8,               // s the previous colour is still accepted
+    GRACE: 1.5,               // s the previous colour is still accepted (covers a child's reaction)
-      easy:   { up: 2.6, interval: 2.4,  maxUp: [2, 3, 3, 3], missCosts: false, matchP: 0.65 },
+      easy:   { up: 2.8, interval: 3.0,  maxUp: [2, 3, 3, 3], missCosts: false, matchP: 0.75 },
```

In short: `START_LEAVES 3 → 4`, `GRACE 0.8 → 1.5`, `DIFFICULTY.easy.up 2.6 → 2.8`, `DIFFICULTY.easy.interval 2.4 → 3.0`,
`DIFFICULTY.easy.matchP 0.65 → 0.75`.

### Proof: re-simulation with the patch applied in the vm (`rec`)

| metric | base | rec |
|---|---|---|
| **kid4 clears Riverbank on Easy (2,000 seeds)** | **26 %** | **83 %** |
| kid4 Easy session p10/p50/p90 | 21/37/86 s | 47/111/197 s |
| kid4 Easy levels p50 · s per biome | 0 · 56 | 1 · 59/59/59/59 |
| kid4 Easy wrong share | 23 % | 17 % |
| kid4 first boop p50/p90 | 2.9/6.0 s | 2.9/6.1 s |
| kid4 honest vs kidSpam (survival p50) | 37 vs 19 s | 111 vs 40 s (honest is 2.8× longer) |
| mash 4/s (a child's mashing speed) vs kid4 | 23 vs 37 s | 84 vs 111 s (honest wins) |
| mash 8/s vs kid4 | 49 vs 37 s ✗ | 196 vs 111 s ✗ (fixed by the mash guard: 41 s) |
| parent Easy s per biome | 42/41/40/38 | 44/44/43/40 |
| parent Easy alive at 600 s | 99 % | 100 % |
| bot 0.3 Easy alive at 600 s | 80 % | 98 % |
| old-colour wrong taps within 4 s (bot 0.3 / parent) | 14 % / 10 % | 6 % / 6 % |
| Normal: bot 0.3 / 0.5 / 0.8 survival p50 | 70 / 351 / 600 s | 116 / 383 / 600 s |
| Normal: parent survival p50 | 125 s | 162 s |
| Hard: bot 0.3 / 0.5 / 0.8 survival p50 | 22 / 66 / 600 s | 32 / 87 / 600 s |
| Hard: parent survival p50 | 51 s | 73 s |
| spam on Normal/Hard (all kinds) survival p50 | 8–16 s | 9–21 s |
| idle Normal / Hard | game over at 9 / 8 s | game over at 9 / 8 s |
| stall (max pop gap / max no-match) | 3.2 / 2.0 s | 3.8 / 2.0 s |

**Side effect.** `START_LEAVES` and `GRACE` are global, so weak players on Normal and Hard get about one more leaf of life
(+20–45 s). Strong players (bot ≥ 0.8) are unchanged. That seems acceptable: Normal becomes a fair next step for 5–6-year-olds.
If Normal and Hard must stay exactly as they are, keep `START_LEAVES: 3` and add a one-line per-difficulty option instead:
`easy: { …, startLeaves: 4 }` with `this.leaves = this.preset.startLeaves || CONFIG.START_LEAVES` in `reset()`.

**Alternatives tried and rejected** (kid4 Riverbank clear % in brackets):
- `MAX_MATCH_STREAK 2 → 3` (45 %) and Easy `matchP 0.85` (78 %). These raise the clear rate, but they make colour matter less:
  `tapAll` reached 14 levels and outscored the parent.
- `START_LEAVES 5` (93 %). This halves the threat for everyone and stretches spam survival further.
- Easy `maxUp [2,2,2,2]`. No effect, because at these intervals `maxUp` almost never limits the field.
- `LEAF_EVERY 12 → 8` or `→ 10`. These help spammers, who boop more, as much as they help the child.

### Unit tests that must change with the patch
In `tests/unit/run.js`:
- line 100 (`leaves 3`), and lines 236 and 248 (`3 - cost`): use `C.START_LEAVES`;
- line 257 (the 0.8 s grace test): read `C.GRACE`;
- line 352 (`easy.matchP 0.65`).

Also update MECHANICS §2 and §7.

## 5. Summary for the team
- **P1:** the default player loses Riverbank 3 times out of 4. Apply the CONFIG diff above: 26 % → 83 %, and a session lasts
  about 2 min instead of 37 s.
- **P2:** add the mash guard (code), the idle hint and auto-pause (code), and `GRACE 1.5` (in the diff).
- **P3:** add a "tour complete" stop point after round 1, re-label bot 0.3 in MECHANICS, and optionally set Easy `interval 3.4`
  for longer adult biomes.
- No softlocks, no NaN positions, the fairness bound holds (≤ 2.0 s without a match), and Normal/Hard punish idling and spam
  within seconds.
