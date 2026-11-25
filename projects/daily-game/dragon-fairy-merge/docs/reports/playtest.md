# Mossy's Egg Grove: high-speed playtest report (2026-11-25)

This report is for reading only. Nothing in `game/` was edited. Every proposed change was tried as a monkey-patch on a vm copy of the scripts, then re-simulated.

- Sim: `node tests/sim/deep_playtest.js --suite=all|bots|humans|spam|wind|physics|patch [--n=40] [--patch=none,rec2,…] [--players=…] [--diffs=…]`.
  It uses both cores. A 40-game row takes about 3–15 s, and the full baseline takes about 10 min.
- Physics detail: `node tests/sim/diag_physics.js`.
- Raw outputs are in `tests/sim/out/` (`base_*.txt` is the build as it is now, `patch_*.txt` and `final_rec2_*.txt` are the patched runs).
- Scale: about 2,900 simulated games, each run at 60 fps frames into the real fixed 1/120 s world step, capped at 1500 s.

## Player models
| model | what it does |
|---|---|
| bot 1 / 0.8 / 0.5 / 0.2 | `MEG.Bot` at pace 2 s per drop (a human tempo); `bot1-fast` = pace 0 (≈ 1.5 s per drop) |
| kid-tap (4–6 y) | waits 1.5–4 s between drops. Picks x 55 % middle-biased (triangular) and 45 % uniform. Ignores wind. **Quick tap** (press 0.08–0.25 s then release), so the egg drops wherever Mossy has reached |
| kid-drag | same kid, but lets go only once Mossy has arrived |
| adult-casual | bot skill 0.85, pace 2.2 s; aims at twins using the **no-wind** landing (ignores the windsock) |
| adult-aware | the same player, but aiming with the real wind |
| ignorer1 / aware1 / wise1 | skill 1 with no-wind planning / normal planning / re-plans just before letting go in a gust |
| spam-center / spam-wall / spam-alt / spam-alt-aim | drops the moment `canDrop` (0.55 s), at the centre / at the left wall / alternating walls mid-flight / alternating walls after arriving |

## 1. Key numbers (baseline, 40 games per row)
| player | diff | game length s p10/p50/p90 | drops p50 | score p10/p50/p90 | 1st merge s | s per season spring / summer / autumn | reached Summer / Autumn / Winter |
|---|---|---|---|---|---|---|---|
| bot 1 | easy | 289 / 390 / 622 | 193 | 1091 / 1567 / 2864 | 6.1 | 46 / 44 / 69 | 40/40/40 |
| bot 1 | normal | 198 / 256 / 305 | 127 | 832 / 1119 / 1366 | 6.1 | 53 / 52 / 76 | 40/40/37 |
| bot 1 | hard | 136 / 172 / 212 | 85 | 515 / 721 / 1025 | 6.1 | 60 / 57 / 91 | 40/38/6 |
| bot 0.8 | normal | 193 / 251 / 307 | 124 | 732 / 1065 / 1356 | 6.3 | 53 / 56 / 78 | 40/40/31 |
| bot 0.5 | normal | 178 / 217 / 275 | 108 | 600 / 879 / 1192 | 6.9 | 57 / 51 / 77 | 40/40/23 |
| bot 0.2 | easy | 267 / 315 / 393 | 156 | 911 / 1220 / 1606 | 8.1 | 50 / 49 / 67 | 40/40/40 |
| bot 0.2 | normal | 176 / 212 / 267 | 105 | 635 / 834 / 1142 | 8.1 | 56 / 55 / 84 | 40/40/22 |
| bot 0.2 | hard | 111 / 144 / 186 | 71 | 343 / 523 / 838 | 8.2 | 65 / 59 / — | 40/25/0 |
| kid-tap | easy | 373 / 447 / 575 | 148 | 879 / 1135 / 1597 | 12.8 | 77 / 73 / 98 | 40/40/40 |
| kid-tap | normal | 236 / 283 / 350 | 95 | 450 / 716 / 1031 | 12.3 | 91 / 82 / 109 | 40/39/12 |
| kid-drag | easy | 372 / 498 / 592 | 157 | 767 / 1151 / 1536 | 13.4 | 82 / 76 / 109 | 40/40/40 |
| adult-casual | normal | 213 / 278 / 362 | 125 | 741 / 1097 / 1552 | 6.6 | 60 / 57 / 81 | 40/39/33 |
| adult-aware | normal | 211 / 260 / 415 | 117 | 715 / 998 / 1829 | 6.6 | 58 / 60 / 92 | 40/40/29 |
| **spam-center** | normal | **48 / 58 / 73** | 106 | **635 / 898 / 1272** | 1.5 | **16 / 14 / 21** | 40/40/26 |
| **spam-wall** | easy | 78 / 91 / 106 | 166 | **1105 / 1405 / 1797** | 2.1 | **12 / 12 / 17** | 40/40/40 |
| **spam-wall** | normal | 52 / 64 / 76 | 117 | **781 / 1073 / 1362** | 2.1 | 14 / 13 / 20 | 40/39/34 |

What these numbers say:
- **Season pacing for decent players is on target.** Spring and summer take 44–60 s at a 2 s pace. Autumn is a bit long: 67–92 s for bots and adults, and 98–119 s for kids.
- **Skill gap.** The gap is modest, as is usual for Suika-style games. On Normal, skill 1 scores 1119 and skill 0.2 scores 834 (−25 %). Hard is the only mode that stops people before winter.
- **No endless games.** Not one game hit the 1500 s cap. The longest Easy game (p90, bot 1) lasted 622 s.
- **Kids on Easy.** The first vine warning comes after a median of 116 drops (min 72), well above the ≥ 40 target. A game lasts about 7.5 min. The first merge comes after about 12–13 s, which is roughly 4 drops.
- **Vine warnings** appear 3.3–3.7 times per game on Easy, 2.2–2.6 on Normal and 1.1–1.4 on Hard. Each count includes the final warning.

## 2. Rescues: are they fair?
| | Easy | Normal |
|---|---|---|
| drops survived after the 1st rescue, p50 (bots, kids, adults) | 27–39 | 11–15 |
| s from the last rescue to game over, p50 | 24–39 | 21–38 |
| the rescue removed the biggest egg in the nest | 0–3 % of rescues | 0–3 % |
| kind of egg removed, p50 (max) | 2–3 (6–8) | 3 (7) |

Rescues feel **fair**. The fairy takes small top eggs and almost never the big prize egg. On Normal, though, a rescue only buys about 12 drops (25–35 s).
- `RESCUE_N: 5` raises the kids' Normal reprieve from 10–12 to 14–18 drops and from 28–38 s to 45–51 s. The cost is that 7–10 % of rescues then remove the biggest egg.
- `RESCUE_N: 6` gives 20 drops, with 10–13 % losing the biggest egg.
- This change is optional (see R5). I would keep 4.

## 3. Does wind matter?
| player | diff | score p50 | landing miss vs intent: calm / gust (u) | drop merges within 2 s: calm / gust |
|---|---|---|---|---|
| aware1 | normal | 1119 | 0.10 / 0.32 | 49 % / 49 % |
| ignorer1 | normal | 1105 | 0.03 / **0.68** | 49 % / 47 % |
| ignorer1 | hard | 752 | 0.04 / **0.78** | 48 % / 43 % |
| aware1 | hard | 721 | 0.12 / 0.39 | 46 % / 47 % |
| either, no wind at all | normal | 1135 | — | 48 % |
| adult-casual (ignores the windsock) | normal | 1097 | 0.46 / 0.90 | 50 % / 45 % |
| kid-tap | easy, wind / no wind | 1135 / 1052 | 0.38 / 0.56 | 41 % / 43 % |

- **Noticeable.** About 29 % of drops happen in a gust. A player who ignores the wind lands 0.7–0.9 u (≈ one small egg width, ≈ 27 px) away from where they aimed, which is clearly visible.
- **Not punishing.** Ignoring the wind costs at most 2–5 points of merge rate during gusts and **≈ 0–2 % of final score**. On Hard the ignorer even scores slightly *more*, which is within noise. For kids, wind makes no measurable difference.
- **No skill reward either.** Stronger wind (`LEVELS` 2 / 3.5 / 6 / 8) was tried and changes nothing: aware scores 1082 and the ignorer 1061 on Normal, aware 756 and the ignorer 773 on Hard. All it does is roughly double how often an ignorer's pile pokes over the wall (24/40 games against 11/40).
- **Verdict:** keep the wind values. Wind is a feel and visual twist, which suits ages 4–6. Making it matter for adults would need a different rule (for example, wind also nudging eggs that are still rolling), and that is out of scope.

## 4. Exploits
1. **Spamming beats playing per minute and nearly matches it in total.** Spam-wall on Normal scores 1073 against 1119 for a careful skill-1 player and 716 for a real kid. On Easy it scores 1405 against 1135 for a kid. A season flies past in 12–21 s.
   So yes: a child mashing the screen out-scores a child who plays, and sees the seasons blink past.
2. **The pile grows far above the nest.** While spamming, the pile reaches **y ≈ 18.8 u**. The walls end at 11.2, Mossy is at 12.6 and the screen frame stops at 14.0, so eggs pile over Mossy and off the top of the screen.
   This happened in 40/40 spam games, and in 13/40 kid-tap Easy games the pile went over the wall top.
   New eggs **spawn inside the pile** (`spawn overlaps`: 20–49 per 40 spam games). The vine timer can't stop this: OVER_AGE 1 s plus OVER_T 2.5 s ≈ 6 drops at 0.55 s each.
3. **Infinite game:** none found. Every model eventually loses.
4. **Tap input** (from `main.js`, measured with the kid-tap model). A quick tap calls `moveTo(x)` and then `drop()` straight away, so the egg falls from wherever Mossy has got to, with Mossy's flight speed × 0.3 added sideways.
   A tapping kid lands **0.38 u** from the tapped spot on average, against 0.07 u when dragging. That is not game-breaking, but "my egg didn't go where I tapped" is exactly what a 4-year-old will notice.

## 5. Physics oddities (measured numerically on every 3rd frame of every game)
| check | result |
|---|---|
| eggs outside the nest or NaN | **0** in all ~2,900 games |
| falling eggs that never landed within 2.5 s (stuck above the vine while still falling) | **0** |
| touching twins still unmerged ≥ 0.1 s later (failed merges) | **0** |
| overlap between two landed eggs | over 0.15 u only on single impact frames (2 events in 32 games, each 1 frame long). Peaks of 0.3–0.6 u appear only in spam or Hard pile-ups, also as one-frame transients |
| settled pile jitter | piles of 15–60 drops left alone for 4.5 s: max speed **0.000 u/s**, drift 0. Apparent "drift" in the settle test was a just-dropped egg plus merge chains that settle within about 4.3 s. A lone egg rolling on the floor (single support) still moves at ≈ 0.2 u/s about 3 s after a merge. It rolls the way a ball does, which is fine |
| eggs spawned into the pile / pile above the wall | see Exploit 2 (the only real oddity) |

## 6. Recommended changes (proven by re-simulation: patch `rec2` in `deep_playtest.js`)
**R1 — Mossy can't drop into a pile that reaches his claws** (`world.js`, `P.drop`, right after `var x = clamp(m.x, r, C.NEST_W - r);`):
```js
for (var i = 0; i < this.eggs.length; i++) {
  var o = this.eggs[i], ox = o.x - x, oy = o.y - C.HOLD_Y;
  if (!o.falling && ox * ox + oy * oy < (o.r + r) * (o.r + r)) { this._emit('blocked', { x: x }); return false; }
}
```
The danger timer still runs, so rescue or game over follows normally. The renderer could play a little "no room!" wiggle on `blocked`.

**R2 — `CONFIG.DROP_COOLDOWN: 0.55 → 0.8`.** This only affects spam: kids (1.5–4 s), bots at 2 s and the fast bot at about 1.5 s are untouched.

**R3 — `GOALS = [150, 400, 800] → [150, 400, 750]`** (autumn is 50 points shorter). Also update MECHANICS §6: Easy becomes 115 / 300 / 565 and Hard 180 / 480 / 900.

**R4 — tap drops where the finger was** (`main.js`):
- In `up`, set `this.pendingDrop = true` instead of calling `this.dropNow()`.
- In the frame update, once `|mossy.x − mossy.tx| < 0.08 && |mossy.vx| < 0.6`, set `pendingDrop = false` and call `dropNow()`. That is at most about 0.35 s of flight.
- Clear `pendingDrop` in `clearInput()` and on pointerdown.

| player | diff | metric | before | after (rec2) |
|---|---|---|---|---|
| spam-center | normal | season length s (spring / summer / autumn) | 16 / 14 / 21 | 23 / 22 / 28 |
| spam-wall | easy | score p50 | 1405 | **875** |
| spam-wall | normal | score p50 | 1073 | **639** |
| spam-alt | normal | score p50 | 917 | 770 |
| spam (all) | both | max pile top u / games over 13.5 u | 17.9–19.1 / 31–40 of 40 | **12.1–12.8 / 0 of 40** |
| kid-tap | easy | landing miss vs tap, calm | 0.38 u | **0.07 u** |
| kid-tap | easy / normal | score p50, game length s | 1135 / 716, 447 / 283 s | 1099 / 671, 465 / 294 s |
| kid-tap | easy / normal | autumn s | 98 / 109 | **96 / 91** |
| bot 1 | normal | autumn s, score p50 | 76, 1119 | **67**, 1110 |
| bot 0.5 | normal | autumn s, score p50 | 77, 879 | **72**, 858 |
| adult-casual | normal | spring / summer / autumn s | 60 / 57 / 81 | 58 / 64 / 73 |
| bot 1 | hard | reached winter | 6 / 40 | 7 / 40 |
| all non-spam players | all | pile above 13.5 u | up to 1 of 40 | 0 of 40, except 1 merge-pop transient in bot1-fast Easy |

After rec2:
- Spam no longer out-scores a careful player, and on walls it falls below a real kid.
- The pile can no longer climb over Mossy or off-screen.
- Normal players are unchanged within noise (±4 % score), and autumn sits inside the 45–90 s window for decent players.

Remaining risks:
- Spam at the centre on Easy still scores about the same as before (1384), because merging there is easy.
- Kids on Normal play slightly longer seasons (about 91–95 s), since they drop every 1.5–4 s.

**Tried and rejected:**
- An "overflow" rule (eggs above the wall fill the vine timer 3× as fast) did not cap the pile: the maximum was still 18.8 u.
- Stronger wind (§3).
- **Optional R5:** `RESCUE_N: 4 → 5` for a longer Normal reprieve, at a cost of 7–10 % of rescues taking the biggest egg.
