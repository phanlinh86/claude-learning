# High-speed playtest: Spike's Dino Jam (2026-10-31)

Everything here comes from headless simulation (`DJ.World` in a node vm, fast-forwarded at dt 1/60, the same chunking as `?speed=N` in the browser). About 4,600 games in total. No browser and no game/js edits: the changes were prototyped with `new DJ.World({ seed, config })` overrides.

| Run | Command | Output |
|---|---|---|
| Baseline: every model × difficulty × arena + exploit probes | `node tests/sim/players.js base 60 8` | `tests/sim/results/players-base.md` |
| Before/after, full games (8 min cap) | `node tests/sim/players.js tune 60 8` | `tests/sim/results/players-tune.md` |
| Config sweeps (kid, stop after biome 4) | `SWEEP=tests/sim/sweep-final.json node tests/sim/sweep.js 100 kid land` | `tests/sim/results/sweep-kid-land-*.md` |

## Player models (`tests/sim/players.js`)
All models play only through `setTarget` / `setDir` / `action`, the same way a finger does.
- **kid (5–6 years old)**: puts the finger on the nearest note. Reaction delay 350–600 ms, aim error ±25° (re-rolled every 0.6–1.2 s), re-decides every 0.18–0.32 s. About every 8 s the kid holds still for 1–2 s: half the time the finger rests where it was, half the time it drags off in one direction. The kid notices the tail coming only 35 % of the time and kickflips on 15 % of the bonks they see coming, plus a random tap every ~25 s. Half of the pillow shadows are ignored; for the other half the kid runs sideways (70 %) or taps flip as soon as they react (30 %).
- **adult (casual)**: 200 ms delay, ±6° aim. Picks the note by travel time and checks short look-aheads around its tail and noticed pillows. Kickflips 50 % of the time when every line bonks. Notices 85 % of the pillows.
- **bot0.4 / bot1**: `DJ.Bot` (sees everything), kept as the reference.
- **Exploit probes**:
  - `flipspam`: the adult, plus `action()` every frame.
  - `circle`: max turn forever.
  - `orbit`: the finger circles the arena centre.
  - `wallhug`: rides the bushes forever.
  - `edgedart`: never looks at the tail. Darts to the note, goes to the nearest bush, rides it to the next note.
  - `kid-oblivious`: the kid with no tail awareness at all.
- **Arenas**:
  - `land` 960×540: [28,76,932,516].
  - `ipad` 4:3: [28,76,932,696] + touch-button avoid circle.
  - `port` portrait: [28,88,532,1080] + avoid circle.
  - `wide` 1170×540 phone with notch insets: [93,76,1077,487] + avoid circle.

## 1. Key numbers: current tuning (60 games per cell, 8 min cap)

| Model | Diff | Arena | Clear biome 1 | Biome-1 s p10/p50/p90 | s per level (median): meadow / swamp / canyon / snow | 1st note s | Survival min p10/p50/p90 | Score p10/p50/p90 | Bonks/min | Pillow hits/min |
|---|---|---|---|---|---|---|---|---|---|---|
| kid | easy | land | **100 %** | 27 / 32 / 42 | 32 / 43 / 65 / 80 | 1.9 | 2 / 3 / 4 | 1680 / 2041 / 2816 | 1.96 | 0.33 |
| kid | easy | ipad | 100 % | 28 / 34 / 44 | 34 / 48 / 64 / 82 | 2.2 | 2 / 4 / 6 | 1620 / 2477 / 3803 | 1.70 | 0.30 |
| kid | easy | port | 100 % | 27 / 32 / 43 | 32 / 50 / 68 / 67 | 2.1 | 2 / 4 / 5 | 1679 / 2508 / 3716 | 1.78 | 0.32 |
| kid | easy | wide | 100 % | 26 / 31 / 42 | 31 / 48 / 66 / 68 | 1.9 | 3 / 3 / 6 | 1753 / 2383 / 4115 | 1.79 | 0.43 |
| kid | normal | land | **98 %** | 31 / 37 / 56 | 37 / 55 / – / – | 1.9 | 1 / 2 / 3 | 789 / 961 / 1622 | 1.77 | 0.38 |
| kid | normal | ipad | 100 % | 31 / 41 / 58 | 41 / 64 / 72 / – | 2.2 | 1 / 2 / 3 | 774 / 972 / 1621 | 1.66 | 0.33 |
| kid | normal | port | 100 % | 31 / 39 / 53 | 39 / 57 / 55 / – | 1.7 | 2 / 2 / 3 | 798 / 1268 / 1787 | 1.59 | 0.38 |
| kid | normal | wide | 100 % | 30 / 37 / 54 | 37 / 56 / 75 / – | 1.5 | 1 / 2 / 3 | 776 / 941 / 1607 | 1.75 | 0.35 |
| adult | easy / normal / hard | land | 100 / 100 / 98 % | 20 / 22 / 31 (median) | normal: 22 / 30 / 36 / 43 | 1.0–1.4 | 7 / 7 / 7 (deaths 0 / 0 / 5 of 60) | normal 9523 / 10861 / 11500 | 0.07 / 0.13 / 0.11 | 0.21–0.31 |
| adult | normal | port / wide | 100 % | 22 | 22 / 32 / 37 / 47 · 22 / 30 / 36 / 45 | 1.0–1.2 | 1 of 60 died in each | ≈ 10 k | 0.08 / 0.11 | 0.24 / 0.20 |
| bot0.4 | normal | land | 100 % | 25 | 25 / 32 / 41 / 49 | 1.2 | 1 of 60 died | 9534 | 0.11 | 0.07 |

What this shows:
- **Biome 1 is fine.** 98–100 % of kids clear it on Normal, so the ≥ 90 % target is met. Easy is 100 % on every screen shape. A kid clears it in about 37 s, which is a little under the 45–90 s target band. That is good for a first win.
- **The game ends far too soon for a kid.** All 60 of 60 simulated kids lose all hearts within 8 min on both Easy and Normal. On Normal only 28–53 % of kids clear biome 2 and almost none reach biome 3; the median game lasts 2 min. On Easy the median kid dies in biome 3–4 after 3–4 min. A kid bonks 1.6–2.0 times a minute, while each cleared biome heals only +1 heart and takes about a minute.
- Adults and bots never really lose on Easy or Normal. Hard still bites a little (5 of 60 adults and 6 of 60 bot0.4 games end within 8 min).
- Screen shape barely matters. Portrait and wide phones are within noise of landscape; portrait is slightly *safer* (1.59 bonks/min against 1.77).

### Where deaths come from (kid, Normal, landscape: 200 bonks)
- **80 % of bonks happen with a 10–15 note train.** The death is almost always in biome 2 (14 notes) or biome 3 (18 notes). The train is 24 px × n long, and once it reaches about 10 notes a kid's late turn meets it.
- **35 % of bonks come within 0.7 s after a bush bounce** (12 % on Easy). 41 % happen just outside the soft edge strip and 60 % in the open field. The pattern: Spike bounces, comes out of the strip, and runs into the train that the bounce folded next to him.
- 22 % of bonks happen during a kid "hold". That is about the share of time spent holding, so holding still is *not* extra dangerous: wall-slide works. 24 % happen during a Mumbles visit, again about his time share. Pillow-dizzy leads to a bonk in only 0–1 % of cases.
- Pillows: a kid is hit about 0.3–0.4 times a minute and loses about 1 note a minute that way. Pillows never cost hearts, so they are not a death source.

## 2. Exploits and fairness (≈ 40,000 pillows, ≈ 150,000 note spawns checked)

| Probe | Result | Verdict |
|---|---|---|
| **Airborne forever?** (`flipspam`) | Airborne at most **21 %** of the time on Normal (jumpTime / flipRecharge = 0.65 / 3; Easy can reach 33 %). Bonks/min 0.17 against 0.13 for the same adult without spam, and 0 dodges: the board is never charged when a pillow arrives. | **No exploit.** Spamming makes play slightly worse. |
| **Wall-hug makes the tail harmless?** (`wallhug`) | 98 % of the time in the strip and 0 bonks, but a score of ≤ 42 in 8 min: notes spawn ≥ `spawnEdge` 40 px inside, beyond reach. It takes the *most* pillow hits (2.2–2.9/min) because its line is predictable. | **No exploit.** Nothing can be collected there. |
| **Ignore the tail, ride the bushes** (`edgedart`) | Bonks/min 1.0–1.2 against 1.75 for `kid-oblivious`. The strip saves 0.35–0.48 contacts/min, and it still dies in every game on Normal (54–60 of 60). On Hard (edgeSafe 12) it dies even faster. With the proposed Normal it survives a median of 7 min (17 of 60 died). | **Mild, kid-friendly strategy.** Keep it: it is the "safe lane" a child can discover. |
| **Tight circle / orbit** | Never bonks and never gets pillow-hit (Mumbles' *linear* prediction misses a circling Spike), but collects 0 notes. | **No exploit.** It is a harmless stall. |
| **Unfair pillows** | **0** pillows (of all ≈ 40 k) were unescapable for a grounded Spike with a 0.4 s reaction and no charged flip. That still held at instant reaction, while dizzy, and on every arena. | Fair. |
| **Pillow under the touch kickflip button** | **3–4 % of pillows land inside the button's avoid circle** on touch layouts (port 24–61, wide 21–69 per 700–2600 throws). The shadow is hidden under the button. Loose notes also sometimes come to rest and vanish there (up to 10 per 60 games). Notes never *spawn* there (0 of ≈ 25 k). | **Bug (code, not CONFIG)**: see 4.3. |
| **Unreachable or bad note spawns** | 0 notes spawned under the button, on the train or on top of Spike, across ≈ 150 k spawns. | Fine. |
| **Orbit trap (finger on the note)** | Once Spike is fast (lap 3+, ≥ 190 px/s), his minimum radius v / turnRate ≥ 45 px is larger than the pick radius `spikeR + pickPad` = 30 px. A finger held *on* a note can then make Spike circle it forever. Finger-on-note with 0.2 s lag at level 12: stuck > 10 s in 2 of 30 games. The adult model got stuck in 2 of 60 games (one note idle for 132 s, another case 372 s). | **Real but late-game.** `targetDead 24 → 48` fixes it: 0 of 30 and 0 of 60 games stuck, worst wait 30 s, no change to notes/min. |
| High-speed mode | `main.js` splits `dt × speed` into ≤ 1/60 steps, the same as this sim, so results at `?speed=64` match. | OK |

## 3. Recommended changes (DIFFICULTY overrides only; CONFIG and Hard untouched)

```
DIFFICULTY.easy:
  speed0        120          → 105
  speedPerBiome 5            → 4
  safeNeck      6            → 7
  bonkR         14           → 12
  songTargets   [8,11,14,17] → [8,10,12,14]
  trailSpacing  (24)         → 22      (new key in easy)
DIFFICULTY.normal:   {} →
  safeNeck      (4)          → 6
  bonkR         (17)         → 14
  songTargets   ([10,14,18,22]) → [10,12,14,16]
  trailSpacing  (24)         → 22
  targetDead    (24)         → 48      (also worth putting into CONFIG so Easy and Hard get the orbit-trap fix)
```
Why:
- **Shorter songs** are the biggest lever: the train length is what kills.
- **trailSpacing 22** makes the same song about 8 % shorter on screen. Note sprites (30 px) already overlap at 24 px; the train just looks a little tighter.
- **A bigger safe neck and a smaller bonk radius** forgive the late turns of a 400–600 ms reaction.
- **Slower speed only on Easy.** On Normal, slowing to 135 alone made kids *worse* (biome 2: 43 % → 29 %), because every level lasts longer and the train is out for more time.
- Already tried and **dropped**:
  - `edgeSafe` 44 / 46: no measurable gain.
  - `invulnTime` 1.8 / 2.0 / 2.2: no gain.
  - `heartsMax` 4 on Normal: +14 points for biome 3 but more bonks/min.
  - `healOnClear` 2: no gain.
  - `pickPad` 24: a small notes/min gain, but it does not fully fix the orbit trap.

### Before → after evidence

**Kid, lap 1 progression** (`sweep.js`, 100 games per row, landscape, stops after biome 4 / game over / 8 min):

| Diff | Variant | Clear biome 1 / 2 / 3 / 4 | s per biome (median) | Bonks/min | Pillow hits/min | Survival min (median) |
|---|---|---|---|---|---|---|
| easy | current | 100 / 96 / 52 / **7 %** | 30 / 48 / 67 / 74 | 2.00 | 0.27 | 3.1 |
| easy | **proposed** | 100 / 100 / 99 / **79 %** | 33 / 43 / 52 / 66 | **0.95** | 0.39 | 3.3 (stops at biome 4) |
| normal | current | 99 / **43** / 2 / 0 % | 36 / 56 / 65 / – | 1.78 | 0.36 | 1.8 |
| normal | **proposed** | 100 / **96** / 69 / 22 % | 36 / 44 / 56 / 61 | **1.15** | 0.31 | 3.2 |

**Full games** (`players.js tune`, 60 games per cell, 8 min cap):

| Model | Diff | Arena | Survival min p10/p50/p90: current → proposed | Score p50: current → proposed | Bonks/min | Levels per kid (median) |
|---|---|---|---|---|---|---|
| kid | easy | land | 2/3/4 → **3/6/7** | 2041 → 4661 | 1.96 → 1.22 | 2 → 6 |
| kid | easy | port | 2/4/5 → 4/7/8 | 2508 → 4659 | 1.78 → 1.18 | 3 → 7 |
| kid | easy | wide | 3/3/6 → 4/7/8 | 2383 → 4705 | 1.79 → 1.23 | 3 → 7 |
| kid | normal | land | 1/2/3 → **2/3/6** | 961 → 2135 | 1.77 → 1.22 | 1 → 3 |
| kid | normal | port | 2/2/3 → 2/3/7 | 1268 → 2114 | 1.59 → 1.06 | 2 → 3 |
| kid | normal | wide | 1/2/3 → 2/3/6 | 941 → 2128 | 1.75 → 1.16 | 1 → 3 |
| adult | normal | land | 0 of 60 died → 0 of 60 died | 10880 → 10669 | 0.08 → 0.05 | 12 → 14 |
| bot1 | normal | land | 0 → 0 deaths | 10927 → 10716 | 0.03 → 0.01 | 12 → 14 |

- Proposed kid per-level time (median, lap 1): Easy 35 / 38–43 / 53–55 / 64–70 s; Normal 36–39 / 44–46 / 53–66 / 56–64 s.
- Biomes 2–4 now sit inside the 45–90 s band (a little under it on Easy biome 2). Biome 1 stays a quick first win of about 35 s.
- Biome-1 clear stays 100 % on every arena and difficulty.
- Adults lose nothing: Normal stays unlosable for them. Hard is unchanged for the challenge.
- Orbit trap (`targetDead 48`): adult model, 60 games on Normal. Games with a note idle > 40 s: 2 → 0. Worst wait: 132 s → 30 s. Levels: 11.9 → 11.7 (noise).

## 4. Code-level suggestions (outside CONFIG; prototyped in the sim only)
1. **Bounce grace (new key `bounceGrace`)**: no self-bonk for 0.8–1.0 s after a bush bounce. It targets the 35–44 % of Normal kid bonks that come right after a bounce. Prototype (monkey-patched `_collide` in `players.js`, `_bounceGrace` override), on top of the proposed Normal:

   | Variant | Clear biome 1 / 2 / 3 / 4 | Bonks/min |
   |---|---|---|
   | proposed | 100 / 96 / 69 / 22 % | 1.15 |
   | + 0.5 s | 100 / 94 / 65 / 22 % | 1.14 (too short: the bonks land 0.5–0.8 s after the bounce) |
   | + 0.8 s | 100 / **100 / 86 / 40 %** | 0.87 |
   | + 1.0 s | 100 / **100 / 86 / 48 %** | 0.78 |

   On Easy it is neutral (100 / 98 / 96 / 74 % against 100 / 100 / 99 / 79 %, which is noise; only 5 % of Easy bonks come after a bounce). Suggested values: Normal 0.8, Hard 0.
2. **Mumbles' throws circle-strafing Spike never hit** (linear prediction). This is harmless and arguably kind. If wanted, aim the "exact" pillow along the current turn arc instead.
3. **Touch-button avoid circle**:
   - In `_throw`, push a landing spot that falls inside `this.avoid` out radially to `a.r + pillowHitPad`.
   - In `_stepNotes`, keep loose notes out of `avoid` circles the same way they are kept out of the bushes.

   Today 3–4 % of pillow shadows and some loose notes are hidden under the kickflip button on phones and iPads.

## 5. Follow-ups if the changes are adopted
- `tests/unit/run.js:336` asserts `DJ.DIFFICULTY.easy.safeNeck === 6`. Change it to 7.
- Update the difficulty table in `docs/MECHANICS.md` §9 and re-run `node tests/sim/run.js 30 10` for §10.
- Calibration caveat: the kid model is deliberately unforgiving (35 % tail awareness, 15 % flip use). A real 5–6-year-old who learns "turn away from my tail" will do better. Treat the kid numbers as a floor, not an average.
