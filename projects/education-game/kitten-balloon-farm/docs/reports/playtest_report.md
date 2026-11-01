# Kitten's Balloon Farm — high-speed playtest report

Playtester: high-speed playtest agent, 2026-11-01. Report-only: no file in `game/` was changed.
Scripts (all new, in `tests/sim/`): `pt_kids.js` (child models, extra metrics, a model of main.js speech, proposal rules),
`pt_run.js` (matrix on all cores → `out/pt_<name>.md`), `pt_compare.js` (before → after table), `pt_absent.js` (10 min with no touch),
`pt_browser.js` (real Chromium: speed-8 bot sessions + a session played with real touch taps).
Raw results: `tests/sim/out/pt_before.md`, `pt_recommended.md`, `pt_compare_recommended.md`, `pt_f_*.md` (one change at a time),
`pt_absent.md`, `pt_browser.md`. Re-run: `node tests/sim/pt_run.js --name before --n 8` (2 000 sessions, ≈ 3 min on 2 cores).

## 1. What was played

| | |
|---|---|
| Headless sessions | 3 000 (baseline n = 12) + 2 000 (baseline n = 8) + 2 000 (all proposals) + 2 000 (recommended set) + 1 940 (single-change runs) ≈ **10 900 sessions** |
| Matrix | 10 drivers × ages 3–7 × 5 viewports (iPhone portrait 720×1556 + insets, iPhone landscape 1556×720 + insets, iPad landscape/portrait, short landscape 1600×720) × EN/VI |
| Child models (only `pointerDown/Up`, `talkAnswer`, at the balloon's *current* position, finger travel time) | **careful4** (listens 2.8–4 s, taps the centre, 93 % right) · **typical** (lib.js per-age child) · **slow3b** (a tap every 3–6 s, 35 % of taps on a random balloon) · **string** (aims 0.7 × size *below* the centre ± a finger) · **eager** (taps the right balloon while it is still rising) · **random** (centre of a random balloon every 0.8–2 s) · **spam4** (anywhere on the screen 4×/s) · **bspam** (a random balloon 4×/s) · bots 0.6 / 0.9 · **absent** (10 min, nobody) |
| Speech model | main.js `onEvent` rules exactly (interrupt / priority / queue ≤ 2 / stale 5 s, praise ≥ 1.2 s apart, idle ≤ 4 per round, Talk re-ask n ≤ 3), the **real i18n lines** (EN/VI) and ≈ 14 chars/s at Miu's rate 0.92 |
| Real browser | 18 sessions at `?speed=8&bot=1&autostart=1&autorestart=1&mute=1` (ages 3/4/5 × iPhone P/L, iPad L) + 2 sessions played by **real `page.touchscreen.tap`** at speed 2 (iPhone portrait age 4, iPhone landscape age 3) with screenshots |

## 2. Results (baseline, `pt_before.md`)

Robustness: **0 stuck rounds, 0 errors, 0 NaN, 10 940 / 10 940 sessions finished; 0 answer balloons flew away unpopped**;
browser: 18 / 18 sessions finished, **0 console errors**; real touch: both sessions finished (`done`), 0 errors.

| child / age | session mean (p90) | chapter mean (p10–p90) | wrong / round | rounds with hint | ★3 rounds | stars / 52 | stars per min |
|---|---|---|---|---|---|---|---|
| careful4 · 3 / 4 / 5 | 220 / 253 / 280 s | 55 / **63** (52–76) / 70 s | 0.1 | 1 % | 90 % | 50 | 13.5 / 11.8 / 10.5 |
| typical · 3 / 4 / 5 | 246 / 252 / 257 s | 61 / 63 / 64 s | 0.47 / 0.28 / 0.19 | 10 / 6 / 3 % | 70–83 % | 44–48 | 11 |
| typical · 6 / 7 | 210 / 153 s | 52 / **38** s | 0.08 | 1 % | 93 % | 50 | 14 / 20 |
| slow3b · 3 / 4 / 5 | 325 / 367 / 384 s (p90 ≤ 414) | 81 / 92 / 96 s (16–44 % cut to Talk at 75 s) | 0.3–0.5 | 5–10 % | 70 % | 39–44 | 6–8 |
| **string · 3 / 4 / 5** | **311 / 349 / 362 s** | 78 / 87 / 91 s | 0.3 | 4–8 % | 76 % | 42–46 | 7–9 |
| eager · 3–5 | 120–138 s | 30–34 s | 0.3 | 5 % | 80 % | 47 | 20–23 |
| random · 3–5 | 165–224 s | 41–56 s | 1.9–3.2 | 42–49 % | 31–39 % | 31–32 | 8–12 |
| **bspam · 3–5** | **103–118 s** | 26–30 s | 1.5–3.2 | 30–47 % | 34–37 % | 31–33 | **16–19** |
| spam4 (anywhere) · 3–5 | 289–367 s (max 541) | 72–92 s | 2–3.4 | 42–52 % | 30–40 % | 29–31 | 5–6 |

Timing details: first balloon tappable **0.46 s** after the round starts, all tappable 0.7–1.0 s (iPhone portrait/age 5 slowest);
typical age-4 round 10.8 s (colours/shapes ≈ 9 s, count 12.3 s, animals 12.2 s); count rounds at age 6 are the longest (19–25 s,
up to 12 pops). Every count round sends 2.4 extra balloons away when N is reached; children never tap after N
(careful/typical/slow: 0.00 taps after N per count round; spam4 1.1 — silently ignored), so **counting never overshoots**.

Friends on the yard: friends are cleared every round, so at most 4 (age 5 animals) — no pile-up across rounds, never off-screen, never on
the sign. But **iPhone/iPad portrait has only 2 slots per row** (yard 265 px wide): a 3rd and 4th friend go to row 2, half a slot
offset and only 24 px higher → **1.2 overlapping friend pairs per animals round in portrait** (0 in every landscape incl. 1600×720).

Absent child (`pt_absent.md`, 10 min, iPhone portrait): in a round the world emits 20 `idle` events; main.js **speaks 4**
(15, 33, 60, 90 s after the round starts, ≈ 20 s of talking) and is then silent for 8.5 min — but the round never pauses: music
keeps playing and balloons bob forever. In Talk time: 50 `talkAsk`, **3 spoken** (12, 24, 36 s), the answer glows from the 2nd.
The "Talk re-asks stop after 3" rule holds; the idle backoff (12 → 18 → 27 → 30 s) holds.

Speech (model of main.js, real lines): Miu talks 66 % of a session. The instruction is cut off before it ends in
**15–23 % of rounds for careful/typical children** (they tap while Vietnamese "Bé ơi, bấm vào tất cả quả bóng màu đỏ nhé!" is
still playing → the praise line interrupts it) and **85–90 % for the eager child**. A balloon spammer hears **22 "That one is blue…
let's find the red one" lines per minute**, nearly all cut off by the next (`wrong>wrong` 14 649 cuts in 2 000 sessions).

Real browser: 37–55 fps headless (software GL, shared 2-core box at load ≈ 5, so a lower bound), adaptive quality stepped down to
0.52–0.72 as designed, worst frame 83–567 ms (box load). Real touch play: tap on balloon centre always worked; **a tap on a balloon at
40 % of its rise popped it (iPhone P), at 34 % it was ignored with no feedback (iPhone L)**; a tap exactly 0.7 × size below the
centre (the knot) popped it — but that is the edge of the hit circle, which is why the "string" child misses ~half its taps.

## 3. Kid-game designer's evaluation

- **Pacing** — good for 3–5: typical 4-year-old chapter 63 s (target 60–100 ✔), session 4.2 min (≤ 8 ✔), slow 3-year-old 5.4–6.4 min,
  p90 ≤ 6.9 min ✔. Reward rhythm ≈ one pop every 3–4 s, one star burst every 11 s, a sky change every minute — about right for 4.
  **Ages 6–7 are too short**: a typical 7-year-old finishes a chapter in 38 s and the whole session in 2.5 min (rounds of 4.8 s).
- **Difficulty** — 3–5: ★3 in 70–90 % of rounds, hints in 3–10 % → easy-but-not-trivial, right for the age. Toddler/random children
  get hints in 34–50 % of rounds; the hint gate (from the 2nd wrong, ≥ 6 s apart) works. 6–7: 93 % ★3, 1 % hints → easy; more rounds,
  not harder rounds, is the cheap fix (they still learn from repetition).
- **Repetition** — 4 different targets per chapter, no identical consecutive rounds (content_stats). Fine.
- **Is a spammer rewarded?** Yes, more than a careful child: hammering balloons gives **16–19 stars/min and finishes in < 2 min**
  vs 11–13.5 stars/min for a careful child, with a wall of interrupted wrong-tap sentences. No-fail must stay, but spamming should
  not be the fastest route to confetti.
- **Count rounds** — Miu counts every pop aloud and the sign fills a dot per pop: one-to-one counting is taught well. At N the extras
  fly away at once, so the child never practises *stopping* at N (cardinality); harmless for 3–4, a missed chance at 5–6. Extras do
  not confuse (they leave within 0.5 s). A minimum gap between count pops (to let Miu finish "Two!") was tested and is **not needed**:
  0.5 s gap changes nothing for real children (pt_f_count).
- **Wrong-tap feedback** — strong and kind (boing, 18 % squash, "no-no" shake, push, Miu's oops face, a sentence naming both colours).
  The visual part is gone within ~0.6 s (barely visible in a screenshot 150 ms later), so the voice carries it — which is exactly why the
  sentence must not be cut by the next tap.
- **Small things seen in screenshots** — after the round is solved the bubble still shows "Pop the balloon with the chick!" while the
  friends fade; the round-end "Great job, Mai!" is cut by the Talk intro ≈ 2× per session (`great>talk`); friends vanish after every
  round, so the "party on the grass" never grows (REQUIREMENT promises a night party with all the friends).

## 4. Recommended changes (re-simulated; before → after)

Evidence: `pt_compare_recommended.md` (baseline n = 8 vs the recommended set below, same seeds) and the single-change runs `pt_f_*.md`.

### P1 — do now

**P1-1 Taps on the knot / top of the string count (world.js `pointerDown`).** A child who points at the string misses **49 %** of taps
with no feedback at all; their session takes 349 s instead of 253 s.
Add `touchBelow: 0.95, touchBelowW: 0.35` to `KB.CONFIG` and, after the existing nearest-centre loop, a second pass only when no
circle was hit:
```js
if (!best) for (i = 0; i < this.balloons.length; i++) {
  b = this.balloons[i]; if (!this.canTap(b)) continue;
  var dx = x - b.x, dy = y - b.y;
  if (dy > 0 && dy <= cfg.touchBelow * b.size && Math.abs(dx) <= cfg.touchBelowW * b.size && hyp(dx, dy) < bestD) { best = b; bestD = hyp(dx, dy); }
}
```
| string child age 3 / 4 / 5 | before | after |
|---|---|---|
| missed taps | 51 / 49 / 43 % | **0 / 0 / 0 %** |
| session | 311 / 349 / 362 s | **226 / 258 / 284 s** (≈ careful child) |
| stars | 46 / 45 / 42 | 47 / 46 / 46 |
| random tapper wrong/round (side effect) | 1.94 / 2.80 / 3.24 | 2.03 / 2.63 / 3.42 (no change) |
Config-only fallback: `touchR 0.6 → 0.72` (misses 49 → 17 %, session 349 → 279 s) — weaker, and it widens the gaps between balloons.

**P1-2 Praise and wrong-tap lines never cut Miu's instruction (main.js).** Track the prompt: in `case 'round'` / first `ask`, set
`promptUntil = performance.now() + 300 + 72 * txt.length` (≈ the line's length at rate 0.92); in `case 'correct'` (non-count) and
`case 'wrong'` use `{ interrupt: performance.now() > promptUntil }` (else the line queues right after the prompt). Count numbers keep
interrupting (they must stay in sync with the pops).
| instruction cut off before its end | before | after |
|---|---|---|
| careful4 age 3 / 4 / 5 | 16 / 15 / 10 % | **0 / 2 / 2 %** |
| typical age 3 / 4 / 5 / 6 / 7 | 17 / 23 / 23 / 29 / 37 % | **0 / 5 / 7 / 8 / 0 %** (the rest = count numbers) |
| eager age 3 / 4 / 5 | 85 / 90 / 90 % | **1 / 26 / 26 %** |

**P1-3 Anti-spam: a short "boing lock" after a wrong tap (world.js) + fewer wrong sentences (main.js).**
`KB.CONFIG.wrongLock: 0.8` — in `_wrong()`: `this._lockT = this.time + cfg.wrongLock;`; in `pointerDown()` right after the idle reset:
`if (this.time < this._lockT) return null;` (no mistake counted, no event); reset `_lockT = 0` in `_beginRound`.
main.js `case 'wrong'`: always play the boing + burst, but speak only if `now - lastWrongSay >= 2500` (new `lastWrongSay`).
| | before | after |
|---|---|---|
| balloon spammer age 3 / 4 / 5: session | 103 / 112 / 118 s | **123 / 142 / 157 s** |
| … stars per minute (careful child: 13.5 / 11.8 / 10.5) | 19.0 / 16.9 / 15.8 | **15.6 / 13.3 / 11.7** |
| … wrong sentences per minute | 14 / 22 / 26 | **7 / 8 / 9** (`wrong>wrong` cuts 14 649 → 2 724) |
| impulsive toddler age 3: stars / hint rounds | 35 / 34 % | **38 / 29 %** (double-taps no longer count twice) |
| typical / careful children | — | **unchanged** (session ± 0 s, wrong/round ± 0.00) |

### P2 — next

**P2-4 Three friends per row in portrait (world.js CONFIG): `yardDx 120 → 95`, `yardSpacing 92 → 88`.** Portrait yard 265 → 290 px
(3 slots); first slot still clears the sign (0 friends on the sign / off-screen in 2 000 sessions).
Overlapping friend pairs per animals round, iPhone/iPad portrait: **1.21 → 0.48** (ages 3–4: 0.60 → **0.00**; age 5 with 4 animals:
0.90 → 0.60); landscape unchanged (0).

**P2-5 Pause when nobody is there (main.js).** `case 'idle'`: after the 4th spoken nudge, on the **5th idle** (≈ 2 min without a
touch) call `pause()`; `case 'talkAsk'`: on `e.n === 4` (48 s) call `pause()`. Today an absent child gets 4 nudges in 90 s, then
8.5 min of music and bobbing balloons with nothing to do (battery, and the parent finds a "stuck" game); with the change the pause
screen (big Resume button, music off) appears after ≈ 2 min / 48 s.

**P2-6 More rounds for ages 6–7 (world.js).** `KB.CONFIG.roundsByAge: { 6: 6, 7: 6 }`; in `startLevel`:
`this.roundsPerLevel = cfg.roundsByAge[this.age] || cfg.roundsPerLevel;` (main already reads `world.roundsPerLevel` for the dots;
the 75 s chapter limit still cuts slow children to Talk).
| | before | after (6 rounds) |
|---|---|---|
| typical age 6 / 7: chapter / session | 52 / 38 s · 210 / 153 s | **64 / 53 s · 254 / 211 s** |
| careful age 7: chapter / session | 45 s · 181 s | **63 s · 252 s** |
| slow age 6 / 7: session (≤ 8 min) | 329 / 280 s | 382 / 348 s ✔ |

**P2-7 Docs:** the project `CLAUDE.md` still describes *Owlet's Snow Garden* (namespace `SG`, storage prefix `sg:`, Lumi, pots) — rewrite
it for Kitten's Balloon Farm (`KB`, its storage prefix).

### P3 — nice to have

- **P3-8 Stuck-child glow:** from the **2nd idle nudge** of a round (≈ 30 s) also glow the target (`KB.CONFIG.idleGlowFrom: 2`; in the
  idle branch of `_step`: count nudges per round and call `this._glow(this._hintTarget())` when ≥ 2 and nothing glows). Rare in play
  (0.15 idle/round for the slowest child; no change in the totals), but gives a shy or lost child a picture clue, not only words.
- **P3-9 Feedback for a tap on a still-rising balloon:** keep `tapAtRise 0.6`. Lowering it to 0.3 halved ignored taps (45 → 21 %) but
  **doubled wrong taps** for the eager child (0.26 → 0.53/round, stars 47 → 43) because rising balloons are still bunched near the grass.
  Instead, in `pointerDown` when nothing was hit, give a rising balloon under the finger a tiny squash (`b._q = 0.08`) — no pop, no mistake.
- **P3-10 Talk intro must not cut the round's praise** (`great>talk` ≈ 2 per session): in `openTalk` speak with `{ priority: true }`
  only (no `interrupt`).
- **P3-11 Bubble on roundDone:** `KB.UI.say(T('great'))` (the same line Miu speaks) instead of leaving the solved instruction up.
- **P3-12 Friends stay for the chapter:** let the friends of a chapter remain on the yard (fade at `levelDone`, not at every `roundDone`)
  so the farm party grows; with P2-4 portrait holds 3 per row, so ≤ 9 friends need 3 rows — re-check overlap before adopting.
- **P3-13 Count rounds from age 5:** at N, keep the extras 0.6 s and let a tap on one say "We have five already!" (no mistake) so
  older children practise stopping at N. Not tested (design change).

Rejected after testing: `tapAtRise 0.3` (see P3-9), count-pop gap 0.5 s (no effect for real children), `touchR 0.72` alone (P1-1 is better).

## 5. Recommended set, all together (`pt_recommended.md`)
`config {"yardDx":95,"yardSpacing":88}` + rules `hitBelow 0.95, wrongLock 0.8, idleGlowFrom 2` + speech `wrongSayGap 2.5, protectPrompt`:
2 000 / 2 000 sessions finished, 0 stuck, 0 errors; careful/typical/slow children: session, chapter, wrong taps, stars **unchanged**
(typical 4: 252 s, chapter 63 s, 47 stars); string child −85 to −91 s per session; spammer +20 to +39 s and stars/min down to the
careful child's level; instruction cut-offs for typical children 17–23 % → 0–7 %; portrait friend overlap 1.21 → 0.48.

## Status after fixes (lead, 2026-11-01)
Applied: P1-1 touchBelow 0.95/0.35, P1-2 protected prompts (`speakPrompt` / `canInterrupt` in main.js), P1-3 wrongLock 0.8 +
wrong sentence at most every 2.5 s, P2-4 yardDx 95 / yardSpacing 88, P2-5 pause on the 5th idle nudge and the 4th Talk re-ask,
P2-6 roundsByAge {6:6, 7:6}, P3 idle glow from the 2nd nudge, squash on taps on still-rising balloons, Talk opens queued.
Not applied (P3): keeping friends for the whole chapter, practising "stop at N" in count rounds.
