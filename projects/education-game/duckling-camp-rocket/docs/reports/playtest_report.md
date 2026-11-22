# Mimi's Splash Rocket — high-speed playtest report (2026-11-22)

Role: high-speed playtester (report-only — no `game/` file was edited). Every proposed change below was re-simulated with the
change applied **in the sim only** (CONFIG overrides via `new DK.World({config})`, content experiments via an in-memory source
patch `DK_PATCH`, voice / main.js experiments via wrappers around `DK.I18N` / `DK.Voice` inside the real page).

## 0. Verdict

The core loop is good and robust: tap the mat → three stomps → a 2-second spray-and-parachute flight → the thing zips up the
flagpole. **8 370 headless sessions** (14 child models × ages 3–7 baseline + 4 experiments) and **34 real-page sessions** gave
**0 NaN, 0 stuck states, 0 objects off screen, 0 rounds > 120 s for an engaged child, 0 "2 misses without a hint", 0 console
errors**. A typical 4-year-old's chapter takes **94.6 s** (target 60–100 s) and a session **6.5 min (p90 6.9)** (target ≤ 8 min).
Nobody gets stuck at the pump (Mimi auto-pumps 6 % of a typical 4-year-old's launches and 25 % of a slow 3-year-old's).

Three things should be fixed before calling it done:

1. **P1 — the voice drowns the learning.** In the real page with a realistic TTS Mimi talks **83–96 % of the session**
   (19–23 lines/min). The right-answer line ("A purple mug! Now stomp the pump!"), which is the line that *names* the thing,
   is heard to the end only **30 %** of the time (the first stomp cuts it, or it waits and is said **after the rocket has
   landed**: 80 of 304 launches). Behind a long wrong / hint line the whole pump count can go stale (no "One, two, three" at
   all: 3 of 27 launches per session at age 6). The `next` reminder is not heard 30 % of the time (it queues behind the
   pennant praise).
2. **P1 — the age ramp never happens.** `shortBudget [∞, 22, 40, 56]` makes **every round after a chapter's first a short
   round**, and a short round is hard-wired to 2 launches × **2 mats**. Result: ages 3–5 *never* see 3 mats and ages 6–7 see
   them in 25 % of rounds (the chapter's first round only). The 3-mat tables for ages 4–7 are dead code.
3. **P2 — the second launch is often a copy of the first.** The second launch's target is the *same picture* as the first's in
   87 % of age-3 launches (shapes, size, colours, animals: 100 %) and 60 % at age 4 — "find the same picture again" instead of
   the concept.

All three have a tested fix that keeps the session ≤ 8 min (§6, §7): with the voice fixes the naming line is heard 30 → 83 %,
the prompts 70 → 99 %, the pump count is complete in 100 % of launches, and Mimi's talk time drops 83–96 → 72–85 %.

## 1. What was run

| run | tool | sessions | what |
|---|---|---|---|
| baseline | `node tests/sim/hs_deep.js --n 80` (new) | 4 080 | 14 models × ages 3–7 (slow3: 3–4), 1/30 s frames through the real input API on 5 viewports (iPhone portrait / landscape with notch, iPad 1036×720 / 720×1036, 1600×720), EN / VI alternating |
| experiments | `hs_deep.js` with `--config` / `DK_PATCH` | 1 410 + 810 + 810 + 1 260 | mats patch, assistAfter 4, assistAfter 4 + roundLongCut 55, everything combined |
| absent child | `hs_playtest.js --models absent` | 15 | idle back-off |
| content | `content_stats.js 150`, `content_repeat.js 200` (new) | 18 000 rounds | validity, same picture launch → launch |
| voice flow | `tests/sim/hs_voice.js` (new) | 12 base + 6 fix + 6 fixB + 6 fixC | the REAL page, game speed 1 on Playwright's fake clock (fast-forwarded), a fake `speechSynthesis` with realistic durations (250 ms + chars / 14.5 cps / rate + 180 ms per stop + 90 ms per comma), DK.Bot at toddler pace, iPhone 393×852 portrait EN and 852×393 landscape VI, ages 3 / 4 / 6 |
| speed 8 | `tests/sim/hs_browser.js --sessions 4 --ages 4 --vp iphone-portrait,iphone-landscape` | 4 | `?speed=8&bot=1&mute=1`, full sessions, voice log |

Models (`hs_deep.js`): `typical` (age profile of `lib.js`), `kid0.6 / kid0.8 / kid0.95` (typical pace, skill = p of the right
mat), `botT0.6 / 0.8 / 0.95` (DK.Bot, toddler pace), `slow3` (long delays, looks away 4–12 s, waits for the auto-pump 25 %),
`tapper` (random taps / slides everywhere), `flightTapper` (typical + taps the rocket / meadow every 0.25–0.7 s while the game
is not waiting for it), `pumpSpam` (drums the pump ≈ 10×/s from the aim until 1.5 s after the launch), `neverPump` (always
waits for Mimi's auto-pump), `nearest` (always taps the mat nearest the launch pad, ignores the glow), `sameSpot` (taps the mat
nearest to where the last right mat stood).

Reproduce: `node tests/sim/hs_deep.js --n 80 --tag base` · `DK_PATCH=tests/sim/patches/mats_vary.json node tests/sim/hs_deep.js --n 60
--models typical,kid0.6,botT0.8,slow3,tapper,nearest --config '{"aimTime":0.8,"launchDelay":0.6,"assistAfter":4}' --tag all` ·
`NODE_PATH=$(npm root -g) node tests/sim/hs_voice.js --sessions 2 --ages 3,4,6 --fix rate12,short,nocut,stale,pennant,wrongcut,camp
--cfg '{"aimTime":0.8,"launchDelay":0.6}' --tag fixC` · `[DK_PATCH=…] node tests/sim/content_repeat.js 200`. `DK_PATCH` files
(C1 = `patches/mats.json`, C2 = `patches/vary.json`, both = `patches/mats_vary.json`) are applied to the source in memory by
`tests/sim/lib.js` only. Outputs in `tests/sim/out/` (git-ignored).

## 2. Headless numbers (baseline, 4 080 sessions)

### 2.1 Durations and outcome (n = 80 per row for typical / kid / botT, 40 for the others)

| model | age | session min mean (p90, max) | chapter s mean [p10–p90] | round s mean (p90) | k × m per round | flight s | pump s · auto % | stars 3/2/1 % | rounds with a hint % · assists / session | wrong / round |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.8 (7.2, 7.8) | 98.2 [85.2–108.9] | 31.5 (38.6) | 2.00 × 2.00 | 1.96 | 3.1 · 10 | 53 / 28 / 19 | 19 · 0.0 | 0.70 |
| **typical** | **4** | **6.5 (6.9, 7.2)** | **94.6 [85.5–103.9]** | 29.2 (35.5) | 2.00 × **2.00** | 1.96 | 2.9 · 6 | 68 / 24 / 8 | 8 · 0.0 | 0.42 |
| typical | 5 | 6.5 (6.8, 7.1) | 93.2 [81.1–104.0] | 30.6 (40.3) | 2.27 × **2.00** | 1.98 | 2.7 · 6 | 71 / 23 / 7 | 7 · 0.0 | 0.37 |
| typical | 6 | 6.4 (6.7, 7.0) | 92.4 [80.8–102.8] | 30.0 (39.0) | 2.27 × 2.27 | 1.97 | 2.6 · 6 | 72 / 22 / 6 | 6 · 0.0 | 0.34 |
| typical | 7 | 6.4 (6.6, 6.8) | 92.0 [84.9–98.4] | 28.3 (36.8) | 2.25 × 2.25 | 1.97 | 2.6 · 7 | 80 / 17 / 3 | 3 · 0.0 | 0.23 |
| kid0.6 | 3–7 | 6.4–6.7 (≤ 7.2) | 92–98 | 32–34 | as typical | 1.96–1.97 | 2.6–3.1 · 6–12 | 31–35 / 25–30 / 36–41 | 36–41 · 0.0 | 1.1–1.3 |
| kid0.8 | 3–7 | 6.4–6.7 (≤ 7.0) | 92–97 | 29–31 | | 1.96–1.97 | 2.6–3.1 · 6–10 | 58–65 / 26–28 / 9–14 | 9–14 · 0.0 | 0.46–0.60 |
| kid0.95 | 3–7 | 6.3–6.6 (≤ 6.9) | 92–95 | 28–30 | | 1.96–1.97 | 2.6–3.1 · 5–13 | 86–90 / 9–13 / 1 | 1 · 0.0 | 0.10–0.16 |
| botT0.6 | 3–7 | 6.0–6.4 (≤ 6.7) | 87–93 | 25–29 | | 1.96–1.97 | 2.2–2.3 · 15 | 32–37 / 28–31 / 33–40 | 33–40 · 0.0 | 1.0–1.2 |
| botT0.8 | 3–7 | 6.0–6.3 (≤ 6.6) | 87–91 | 24–27 | | 1.96–1.97 | 2.2–2.3 · 14–16 | 61–67 / 24–26 / 9–13 | 9–13 · 0.0 | 0.43–0.53 |
| botT0.95 | 3–7 | 6.0–6.3 (≤ 6.5) | 86–91 | 24–26 | | 1.96–1.97 | 2.2–2.3 · 14–16 | 88–90 / 9–11 / 0–1 | 0–1 · 0.0 | 0.10–0.14 |
| slow3 | 3 / 4 | 7.1 / 7.1 (7.9 / 7.7, max 8.4) | 103.5 [86–123] | 45.7 (60–62) | 2.00 × 2.00 | 1.98 | 4.7 · 25 | 36–41 / 25–26 / 33–38 | 35–39 · 0.1 | 1.1–1.2 |
| tapper | 3–7 | 6.3–7.0 (≤ 7.4) | 91–102 | 37–44 | | 1.95–1.98 | 4.2 · 0 | 15–21 / 28–42 / 37–57 | 81–84 · 6–8 | 1.3–2.1 |
| flightTapper | 3–7 | 6.4–6.7 (≤ 7.1) | 92–97 | 28–32 | | 1.96–1.98 | 2.6–3.2 · 5–12 | 52–82 / 14–27 / 4–21 | = typical | = typical |
| pumpSpam | 3–7 | 6.0–6.3 (≤ 6.7) | 86–91 | 25–27 | | 1.96–1.98 | **1.0** · 0 | 51–78 / 17–29 / 5–20 | = typical | = typical |
| neverPump | 3–7 | 6.2–6.8 (≤ 7.3) | 90–99 | 32–35 | | 1.96–1.97 | 4.2 · **100** | 53–76 / 21–31 / 3–16 | = typical | = typical |
| nearest | 3–7 | 7.3–7.9 (**8.0–8.7**, max 9.5) | 106–115 [84–141] | 46–52 (66–78) | | 1.95–1.98 | 2.6–3.1 · 5–13 | 16–26 / 0 / 74–84 | 74–84 · 8–11 | 4.8–6.8 |
| sameSpot | 3–7 | 6.4–6.7 (≤ 7.3) | 92–98 | 35–38 | | 1.95–1.98 | 2.5–3.1 · 6–13 | 17–26 / 0–1 / 73–82 | 73–82 · 0.1–0.5 | 1.9–2.6 |

Robustness (every row): **0 NaN · 0 stuck states (no state change for 200 s) · 0 mats / Mimi / rocket / flyer off screen ·
0 rounds > 120 s · 0 "2 misses without a hint"**; all 4 080 sessions finished. Every chapter ends after 3 rounds (cut % = 100:
`chapterTimeLimit` 75 s ≥ 3 rounds always fires) — 11–12 rounds and ≈ 24 launches per session.

- **Flights**: 1.96–1.98 s mean, p10–p90 1.64–2.39 s, max 2.76 s (≈ 100 000 flights) — long enough to watch the parachute, short
  enough not to bore. Keep.
- **The pump** is understood by every model: a spammer launches 1.0 s after `pumpAsk`, a typical 4-year-old 2.9 s, a child who
  never pumps 4.2 s (Mimi helps after 3 s, then every 0.5 s). Taps during the flight (`flightTapper`) cost nothing (only `soft`).
- **Hints**: typical 4-year-old 0.09 per round (8 % of rounds); slow3 0.5 per round + 2.9 idle nudges / session. Absent child:
  idle nudges at 12, 30, 57, 87, 117, 147 s after the ask (× 1.5 back-off, capped 30 s); Talk time re-asks at 12 / 24 / 36 s,
  glows the answer from the 2nd re-ask and auto-answers 2 s after the 3rd (`talkResult {auto: true}` at 38 s).
- **Stars**: 3★ = no miss, 2★ = misses without a hint, 1★ = hinted / assisted. Typical 4-year-old 68 / 24 / 8 % — fair.
  The pathological `nearest` child is rescued (glow after 2 misses, assist after 5 presses) but its session p90 reaches 8.0–8.7 min.

### 2.2 Watching vs acting — is it too much watching for a 4-year-old?

"Can act" = phase `play`, phase `pump` before the 3rd stomp, Talk before the answer. Everything else is watching.

| model | age | act % / watch % | watch s per launch | longest watch stretch per round s mean (p90) | ask → first possible tap s | right → next possible tap s mean (p90) |
|---|---|---|---|---|---|---|
| typical | 3 | 57.5 / 42.5 | 7.6 | 7.8 (8.9) | 0.03 | 10.6 (21) |
| **typical** | **4** | **53.7 / 46.3** | **7.7** | **8.0 (8.9)** | **0.03** | 10.6 (21) |
| typical | 7 | 50.1 / 49.9 | 7.2 | 8.0 (9.1) | 0.03 | 9.7 |
| botT0.8 | 4 | 46.3 / 53.7 | 7.6 | 8.0 (8.9) | 0.03 | 9.8 |
| slow3 | 3 | 69.1 / 30.9 | 8.1 | 7.8 (8.9) | 0.03 | 13.4 |

Typical 4-year-old session (381 s): intro 10 · unfold 24 · **play 131** · aim 10 · **pump 68** · flight 46 · collect 28 · camp 23 ·
cheer + wipe 15 · Talk 24 · chapter end 14.

Verdict: **not too much watching.** The rhythm is ≈ 6 s of doing (find + three stomps) then ≈ 5 s of reward (lift-off, chute,
pennant), and the longest wait without anything to do is 8 s (p90 9 s: the last landing → pennant → camp count → fountain →
sweep → new mats), under the ≈ 10 s a 4-year-old waits happily. The ask is tappable at once (0.03 s; no forced listening), and
the right → next tap gap includes the child's own pumping. The real waiting problem is **Mimi's talking** (§3), not the
animations.

### 2.3 Content and layout repetition

| | age 3 | age 4 | age 5 | age 6 | age 7 |
|---|---|---|---|---|---|
| same target **picture** as the previous launch's target % (`content_repeat.js`) | **87** | **60** | 45 | 26 | 6 |
| — colours / shapes / size / animals | 100 / 100 / 100 / 100 (warm-up and later) | 33 / 100 / 100 / 33 | 47 / 4 / – / 47 | letters 100 · add / lower 0 | sub / add / oddeven 0 |
| same thing on the round's last launch → next round's first % | 0 | 0 | 0 | 0 | 0 |
| target within one mat of the last target's spot % | 7.7 | 7.4 | 6.6 | 6.2 | 4.9 |
| target = mat nearest the launch pad % (chance %) | 49.1 (50) | 52.3 (50) | 49.8 (50) | 43.9 (44.1) | 44.1 (44.4) |
| same ask as the previous round % / same set in a chapter % (`content_stats.js`) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

No layout or position bias (a `nearest` or `sameSpot` child gets 16–26 % 3★, i.e. chance + rescue). The repetition is in the
*pictures*: at ages 3–4 a shapes / size round shows the same blue heart (or the same big blue mug) on both launches, only the mat
order changes; the 2nd launch is solved by matching the picture the child just saw, not by the concept. Letters (5–6) and the
farm-animal rule are inherently the same picture (the rule *is* the picture) — fine.

## 3. Real page — the voice flow (`hs_voice.js`, game speed 1, fake clock, realistic TTS)

### 3.1 Baseline (12 sessions)

| age | viewport · lang | session min | lines / min (words / min) | Mimi talks % of the time | prompts not heard / n · start delay s mean (max) · prompt length s · child tapped before it ended | pump counts complete · "Blast off!" ended after the LANDING | right line heard to the end · said after the landing | max lines waiting |
|---|---|---|---|---|---|---|---|---|
| 3 | portrait EN | 5.8 | 22.7 (85) | 86 | 9 / 24 · 0.94 (2.5) · 3.0 · 6 | 24 / 24 · 7 | 6 / 24 · 5 | 3 |
| 3 | landscape VI | 5.6 | 21.5 (116) | 90 | 8 / 24 · 1.13 (2.8) · 4.1 · 12 | 23 / 24 · 7 | 4 / 24 · 4 | 3 |
| 4 | portrait EN | 5.8 | 23.3 (92) | 87 | 6 / 24 · 0.85 (2.6) · 2.9 · 9 | 23 / 24 · 6 | 3 / 24 · 2 | 3 |
| 4 | landscape VI | 5.8 | 19.9 (125) | 94 | 6 / 24 · 1.45 (4.0) · 4.0 · 16 | 24 / 24 · 12 | 11 / 24 · 11 | 3 |
| 6 | portrait EN | 6.4 | 20.3 (102) | 91 | 9 / 27 · 1.08 (2.5) · 3.8 · 13 | **24 / 27** · 16 | 9 / 27 · 6 | 4 |
| 6 | landscape VI | 6.2 | 18.7 (129) | 94 | 6 / 27 · 1.04 (4.9) · 4.7 · 19 | **24 / 27** · 12 | 8 / 27 · 8 | 3 |
| **all 12** | | 5.6–6.4 | **18.7–23.3** | **83–96** | **90 / 304 not heard (30 %)** | **292 / 304 · 127 (42 %)** | **90 / 304 (30 %) · 80** | 3–4 |

By tag (12 sessions): pump 912 requested / 690 spoken / 210 merged / 12 stale · prompt 352 / 225 spoken / 90 dropped / 37 cut ·
**right 304 / 90 spoken / 152 cut / 47 dropped / 15 stale** · pennant 288 / 101 / 172 dropped · count 162 / 157 · wrong 59 / 55
(start delay mean 1.85 s, p90 6.0 s) · flavour 96 / 48 (the weather line is cut by the ask, by design).

What a child hears (age 4, EN, from the log; s since the session start):
```
 8.95 right  "A purple mug! Now stomp the pump!"   cut after 0.7 s by the first stomp → the child hears "A pur—"
14.24 pennant "Hooray, the purple mug!"            2.3 s
14.61 next   "Next one: purple!"                   waits 2.0 s behind the pennant line
16.58 right  "Splash! A purple mug! Pump it up!"   waits 4.8 s, spoken 21.4–24.7 s … the rocket LANDED at 21.03 s
112.2 wrong  (age 6) "Look, a green ball. B is for ball. Look at the shiny mat!" 5.4 s, protected
116.3 right  "A pig! Pig starts with P! Now pump!" waits 4.3 s; the stomps at 117.2 / 117.7 / 118.1 merge into
             "One, two, three! Blast off!", which cannot start within 2.5 s → STALE: the launch has no count at all
```
Findings:
- **Too chatty**: Mimi speaks 83–96 % of the time, ≈ 21 lines a minute; there is almost no quiet moment to think.
- **The naming line is lost**: 70 % of right lines never finish (cut by the stomp, or dropped / stale), and 80 / 304 are
  said after the rocket landed ("Pump it up!" while the parachute is on the mat).
- **Pump counts**: complete in 96 % of launches (the merge policy works: "One, two!" / "Two, three! Blast off!"), but
  "Blast off!" ends 2.26 s after the lift-off on average (max 4.8 s) — after the landing in 42 % of launches; and a long
  wrong / hint line in front makes the whole count go stale (12 launches, 9 of them at age 6).
- **`next` reminders** wait behind the pennant line (start delay ≈ 2 s) and are dropped as moot when the child taps first
  (30 % of prompts not heard). The child can always answer from the first word (`interactive` 0.03 s after `ask`), and taps
  before the question ends in 25–70 % of cases (VI prompts are 1 s longer).
- **First prompts are long**: up to 7.9 s EN / 9.8 s VI (countSel), 7.0 / 9.2 s (lower), 7.0 / 9.1 s (initial) — the key
  word comes last, after "Let's launch the rocket!" and a topic sentence, and the chapter title + weather line came just before.
- The camp count "All our flags! One, two, three! Three flags!" (4.3 s) is longer than the camp (1.9 s + 0.4 s): the next
  round's ask waits behind it (1.9 s start delay seen).

### 3.2 Speed 8 (`hs_browser.js`, 4 full sessions, age 4, iPhone 393×852 portrait / 852×393 landscape, EN / VI)

| viewport | session min (game) | chapters s | rounds · launches · stars | voice log lines / game min | errors |
|---|---|---|---|---|---|
| portrait | 6.2 | 84, 85, 94, 94 | 16 · 32 · 41 | 36.9 | 0 |
| landscape | 5.9 | 86, 87, 78, 90 | 15 · 32 · 42 | 37.8 | 0 |
| portrait | 6.2 | 86, 94, 81, 93 | 15 · 32 · 36 | 36.9 | 0 |
| landscape | 5.7 | 82, 88, 76, 76 | 14 · 29 · 37 | 37.7 | 0 |

(DK.Bot at its default *quick* pace, so ≈ 2 rounds more per session than a toddler.) The page runs full sessions at speed 8 on
both shapes with 0 console errors; the voice **log** (every requested line, also merged / dropped ones, speech off at speed > 1)
has ≈ 37 lines per game minute — ≈ 21 of them are really spoken (§3.1).

## 4. Designer's evaluation

- **Fun**: yes. The pump → whoosh → parachute → pennant chain is a satisfying, physical reward for every answer, the
  marmot / goat / bird are tapped in ≈ 70 % of their rounds, and nothing ever punishes (wrong mats ripple, soft taps tick).
  The weakest part is the soundscape: Mimi never stops talking, so the sound effects (spray, "pomf", rope zip) and the
  child's own thinking get no room.
- **Pump gesture**: understood — "tap anywhere" × 3 with the count is the right toddler gesture; the spammer and the never-pumper
  both flow (1.0 s / 4.2 s). The count is the gesture's feedback, so it must arrive *with* the stomps (§3.1: it lags).
- **Flight length**: right (1.64–2.39 s). Don't shorten it — the reward is the float. Don't lengthen it — the longest watch
  stretch is already 8–9 s.
- **Reward**: the pennant on the pole + the camp count + fountain is satisfying; the spoken praise is the weak link (cut, late,
  or replaced by the next line). One clear naming line ("A purple mug!") per launch + the camp count is enough praise.
- **Difficulty ramp**: broken (P1-3). Ages 3–5 always get 2 mats, 6–7 get 3 mats only in a chapter's first round. A 7-year-old
  gets 80 % 3★ with 2 mats. The repetition (P2-3) makes the 2nd launch easier still at ages 3–4.
- **Session length / pacing**: on target for every engaged model; only the pathological "always the nearest mat" child goes
  over 8 min (p90 8.0–8.7).

## 5. Issue list

### P1
- **P1-1 The naming (right) line is cut by the first stomp or said after the landing** (30 % heard, 80 / 304 after the landing).
- **P1-2 A long wrong / hint line blocks the right line and the whole pump count** (right waits up to 4.4 s; 12 stale counts;
  the wrong line is moot once the child tapped the right mat).
- **P1-3 Short rounds kill the per-age difficulty** (`tableKM`: `if (short && ri > 0) return [2, 2]` + `shortBudget` 22 s that
  even a perfect child exceeds → 0 % 3-mat rounds at ages 3–5, 25 % at 6–7).

### P2
- **P2-1 The pennant praise collides with the next launch's `next` reminder** (next waits ≈ 2 s; 30 % of prompts not heard).
- **P2-2 Mimi talks 83–96 % of the time** (19–23 lines / min) — addressed mostly by P1-1, P2-1, P2-4, P2-5.
- **P2-3 The 2nd launch repeats the 1st launch's picture** (87 % at age 3, 60 % at age 4).
- **P2-4 First prompts up to 7.9 s EN / 9.8 s VI**; the key word comes last.
- **P2-5 Camp count line (4.3 s) longer than the camp**; the next ask waits behind it.
- **P2-6 "Blast off!" ends after the landing** in 42 % of launches with a quick pumper (2.26 s after lift-off on average).

### P3
- **P3-1 "Always the nearest mat" child: session p90 8.0–8.7 min** (> 8 min), 4.8–6.8 wrong lines per round.
- **P3-2 slow3 chapter p90 123 s** (> 100 s target): acceptable — the round waits for the child, `chapterHardLimit` 72 s
  already cuts the chapter after 2 rounds; no change proposed.
- **P3-3 Age 7 is easy** (80 % 3★ for a typical 7-year-old) — P1-3 gives it 3 mats in 91 % of rounds.

## 6. Exact proposed changes

**C1 (P1-3) `game/js/content.js` `tableKM`** — a short round keeps the age's mats; only the launches drop to 2:
```js
  function tableKM(age, ri, level, short) {
    if (ri === 0 && level === 0) return [2, 2];
    var T = /* unchanged */;
    var km = T[Math.min(Math.max(0, ri | 0), 3)].slice();
    if (short && ri > 0) km[0] = 2;   // a short round keeps the age's mats; only the launches drop to 2
    return km;
  }
```
(MECHANICS §8 / DESIGN: "a later round is 2 × 2" → "2 launches × the age's mats".) Layout already fits 3 mats on every viewport
(unit-tested); 0 off-screen in 2 670 sims with it. Two unit-test expectations follow the rule and must change with it:
`tests/unit/run.js` `wantKM` (same edit: `const km = (…)[ri].slice(); if (short && ri > 0) km[0] = 2; return km;`) and the
"rounds in a long chapter get short" test (`w.cur.short && w.cur.k === 2`, without `w.cur.m === 2`). With C1 + C2 and those two
edits on a scratch copy: `tests/unit/run.js` **33 / 33 pass**, `tests/unit/i18n_voice.test.js` **90 347 passed, 0 failed**.

**C2 (P2-3) `content.js` — vary the picture between launches** (the rule's feature stays, the other features change; still
no cue inside a launch, still no colour clash in the round):
- `shapes`, age < 5: one colour **per launch** instead of per round:
  `var cl = null; for (var tq = 0; tq < 60 && !cl; tq++) { var cq = rng.sample(colorPool(age), Math.min(k, colorPool(age).length)); if (!clash(cq, pairsFor(age))) cl = cq; } if (!cl) cl = [rng.pick(colorPool(age))];`
  then in the loop `c = cl[j % cl.length];` (all mats of launch j wear `c`).
- `size`: one obj + colour **per launch** (`obs = rng.sample(DK.OBJS, k)`, `cls` = non-clashing colour sample; launch j uses
  `obs[j]`, `cls[j]` for its target and its distractors).
- `colors`, rounds ≥ 1: `var tt = age >= 3 ? …` (was `age >= 4`) — a different obj per launch at age 3 too (the obj is still
  never a cue: a distractor of each launch wears that launch's target obj).
- `validate`: shapes age < 5 → "one colour **per row**"; size → "one obj + colour **per row**".
Tested: `content_stats.js` all 18 000 rounds valid; the unit suite as above.

**C3 (P1-1) the right line names the thing only, is never cut by a stomp, and never comes late**
- `main.js` `right` case: `const txt = line('sayRight', Object.assign(ev2(e), { pump: false }), 'praise');` — the "Now pump!"
  tail goes (the pump glows, the bubble shows `pumpAsk`, and `pumpAsk` is spoken when nothing speaks 1.2 s later — as today);
- `voice.js`: remove `'right'` from `PUMP_CUTS` — the stomps wait for the (now ≈ 1.5–2 s) name line and merge ("One, two!",
  "One, two, three! Blast off!"), VOICE §2.1 rule 4 changes accordingly (+ its case in `tests/unit/i18n_voice.test.js`);
- `voice.js`: `PUMP_RATE 1.0 → 1.2` (brisker numbers so the merged count catches up; check the Vietnamese "Một! Hai! Ba!" on
  a device);
- `main.js` `pump` case, before `Voice.sayPump`: `if (e.n === 1 && DK.Voice.dropTagged) DK.Voice.dropTagged(['right']);` (a
  name line that has not even started would only be said after the lift-off);
- `DK.CONFIG.aimTime 0.45 → 0.8` (the pump becomes stompable 0.35 s later, so the name line is mostly over before the first
  stomp and less of the count has to wait).

**C4 (P1-2) `main.js` `right` case** — the right tap makes a wrong / hint line moot:
```js
const cur = DK.Voice && DK.Voice.currentTag ? DK.Voice.currentTag() : null;
if (cur === 'wrong' || cur === 'hint') { lineUntil = 0; guarded.length = 0; }   // then speakRight() interrupts it
```

**C5 (P2-1) `main.js` `pennant` case** — no pennant line while another launch of the round follows (its mats are already
unfolding and its `next` reminder is due): add `&& !(world.cur && world.launch < world.cur.k)` to the condition. (On the last
launch the camp count already drops it, so in practice the pennant line becomes a sound + sparkle only; the right line is the
launch's praise.)

**C6 (P2-5) `main.js` `camp` case** — `const t = DK.I18N.sayCountUp(curLang(), n, 'flags');` ("One, two, three! Three flags!",
3.0 s EN / 2.6 s VI, instead of 4.3 s).

**C7 (P2-4) `i18n.js` `.first` prompts** — drop the middle topic sentence where it only introduces the topic (keep "Let's
launch the rocket!" and the ask; keep `p.home` and `p.countSeq`, whose middle sentence *is* the ask). Estimated longest first
prompt (EN / VI, s): size 6.2 → 4.1 / 7.2 → 5.2 · countSel 7.9 → 5.1 / 9.8 → 6.5 · animal 5.5 → 3.7 / 7.1 → 5.1 · letters
5.6 → 3.8 / 7.2 → 5.1 · lower 7.0 → 4.4 / 9.2 → 6.8 · initial 7.0 → 5.2 / 9.1 → 7.0 · add / sub 6.0–6.2 → 4.7 / 8.3–8.4 → 6.0 ·
oddeven 6.0 → 4.2 / 6.8 → 5.1. (The VOICE test's "tên lửa … đáp" and "land / fly / launch" rules still hold.)

**C8 (P2-6) `DK.CONFIG.launchDelay: 0.25 → 0.6`** — the bottle lifts off 0.6 s after the 3rd stomp, so "Three! Blast off!"
is heard as the rocket goes (with C3's `PUMP_RATE 1.2`; measured in §7.2).

**C9 (P3-1) `DK.CONFIG.assistAfter: 5 → 4`** — tested alone and with `roundLongCut 55` (no extra gain → leave `roundLongCut` 70).

## 7. Re-simulation, before → after

### 7.1 Headless: C1 + C2 + C3 (aimTime 0.8) + C8 (launchDelay 0.6) + C9 (assistAfter 4) together (1 260 sessions vs baseline)

| model | age | session min mean (p90) | chapter s | round s (p90) | mats per launch (3-mat rounds %) | stars 3/2/1 % | rounds with a hint % | wrong / round |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.8 → 6.8 (7.2 → 7.3) | 98.2 → 99.0 | 31.5 → 32.7 (38.6 → 38.9) | 2.00 → 2.00 (0 → 0) | 53/28/19 → 51/30/19 | 19.1 → 18.6 | 0.70 → 0.71 |
| **typical** | **4** | **6.5 → 6.7 (6.9 → 7.2)** | **94.6 → 97.3** | 29.2 → 30.8 (35.5 → 37.1) | **2.00 → 2.31 (0 → 31)** | 68/24/8 → 66/26/9 | 7.9 → 8.6 | 0.42 → 0.44 |
| typical | 5 | 6.5 → 6.4 (6.8 → 6.8) | 93.2 → 91.7 | 30.6 → 32.6 (40.3 → 42.5) | 2.00 → 2.61 (0 → 61) | 71/23/7 → 70/24/6 | 6.8 → 6.0 | 0.37 → 0.38 |
| typical | 6 | 6.4 → 6.4 (6.7 → 6.8) | 92.4 → 92.3 | 30.0 → 31.9 (39.0 → 41.0) | 2.27 → 2.90 (27 → 91) | 72/22/6 → 73/22/5 | 5.7 → 5.1 | 0.34 → 0.33 |
| typical | 7 | 6.4 → 6.5 (6.6 → 6.8) | 92.0 → 94.4 | 28.3 → 30.2 (36.8 → 38.6) | 2.25 → 2.91 (25 → 91) | 80/17/3 → 79/17/3 | 3.0 → 3.4 | 0.23 → 0.25 |
| kid0.6 | 4 | 6.6 → 6.8 (7.1 → 7.4) | 96.1 → 98.2 | 32.2 → 33.7 | 2.00 → 2.27 | 34/30/36 → 35/29/37 | 36.4 → 37.0 | 1.16 → 1.17 |
| botT0.8 | 4 | 6.0 → 6.0 (6.4 → 6.3) | 86.8 → 87.1 | 24.5 → 26.0 | 2.00 → 2.34 | 67/24/9 → 67/23/10 | 9.0 → 9.7 | 0.43 → 0.43 |
| botT0.8 | 7 | 6.1 → 6.5 (6.3 → 6.7) | 88.2 → 93.3 | 26.4 → 28.3 | 2.25 → 2.92 | 62/25/13 → 57/28/15 | 12.8 → 14.9 | 0.52 → 0.60 |
| slow3 | 3 | 7.1 → 7.2 (7.9 → 7.7) | 103.5 → 104.5 | 45.7 → 46.7 | 2.00 → 2.00 | 36/26/38 → 37/25/39 | 39.4 → 40.2 | 1.19 → 1.17 |
| slow3 | 4 | 7.1 → 7.2 (7.7 → 7.7) | 103.4 → 104.5 | 45.8 → 46.7 | 2.00 → 2.13 | 41/25/33 → 42/28/30 | 35.2 → 32.4 | 1.14 → 1.08 |
| tapper | 5 | 6.8 → 6.7 (7.2 → 7.1) | 97.7 → 97.0 | 42.7 → 43.5 | 2.00 → 2.51 | 15/38/47 → 8/39/53 | 82.3 → 92.2 | 1.58 → 1.68 |
| tapper | 7 | 6.7 → 6.7 (7.1 → 7.1) | 96.3 → 96.6 | 42.1 → 42.7 | 2.36 → 2.88 | 15/30/56 → 10/32/58 | 84.4 → 89.1 | 2.02 → 2.02 |
| nearest | 4 | 7.3 → 7.0 (8.0 → 7.7) | 105.8 → 101.8 | 45.5 → 43.8 (65.6 → 58.6) | 2.00 → 2.16 | 26/0/74 → 25/0/75 | 74.3 → 75.3 | 4.80 → 4.05 |
| nearest | 6 | 7.9 → 7.6 (8.7 → 8.2) | 115.0 → 109.8 | 51.6 → 49.1 (78.0 → 69.7) | 2.36 → 2.88 | 16/0/84 → 16/0/84 | 84.2 → 84.2 | 6.79 → 5.54 |

Robustness with all changes: 0 NaN / stuck / off screen / rounds > 120 s / 2-miss-no-hint in all 1 260 sessions.
Watching: typical 4-year-old act / watch 53.7 / 46.3 → 51.7 / 48.3 %, watch per launch 7.7 → 8.5 s, longest stretch 8.0 (8.9) →
8.3 (9.4) s — the price of C3 + C8 (≈ +0.7 s per launch, +0.2 min per session), still under 10 s.

Separately (C9 alone, 810 sessions): `nearest` session p90 8.0–8.7 → **7.5–7.9 min**, wrong / round 4.8–6.8 → 3.8–5.3; typical /
kid0.6 / slow3 unchanged (assists 0.0 → 0.1 per session). C1 + C2 alone (1 410 sessions): durations within ± 0.1 min for every
model; the random tapper's 3★ at ages 5–7 drops 15 → 10 % (3 mats are harder — the skill-based models pick right with a fixed
p, so they cannot show the difficulty change; a real child's accuracy at 3 mats will drop more than the table shows).

Content (C2), `content_repeat.js 200`: same picture as the previous launch **87 → 33 %** at age 3, **60 → 20 %** at age 4 (the
remaining repeats are the inherent ones: the warm-up round's one obj, "fly to the cow", countSel "4 pinecones"); ages 5–7 unchanged.

### 7.2 Real page voice flow, before → after

Same seeds, ages 3 / 4 / 6, iPhone portrait EN + landscape VI, DK.Bot toddler pace (6 sessions per variant):
**fix** = `--fix short,nocut,stale,pennant,wrongcut,camp` (C3 without aimTime / PUMP_RATE, C4, C5, C6) · **fixB** = `--fix
short,stale,pennant,wrongcut,camp --cfg '{"aimTime":0.8,"launchDelay":0.6}'` (the stomp still cuts the name line; + C8) ·
**fixC = the proposal** = `--fix rate12,short,nocut,stale,pennant,wrongcut,camp --cfg '{"aimTime":0.8,"launchDelay":0.6}'`
(C3 complete + C4 + C5 + C6 + C8).

| metric | baseline (12 sessions) | fix (6) | fixB (6) | **fixC = proposal (6)** |
|---|---|---|---|---|
| lines spoken / min | 18.7–23.3 | 18.4–21.4 | 20.0–21.2 | **19.0–21.1** |
| Mimi talks % of the time | 83–96 | 76–86 | 71–82 | **72–85** |
| prompts (ask + next) heard to the end | 214 / 304 (70 %) | 149 / 150 (99 %) | 148 / 150 (99 %) | **148 / 150 (99 %)** |
| prompt start delay s mean | 0.71–1.61 | 0.05–0.19 | 0.05–0.13 | **0.05–0.12** |
| right (naming) line heard to the end | 90 / 304 (30 %) | 123 / 150 (82 %) | 24 / 150 (16 %) ⚠ | **125 / 150 (83 %)** |
| right line said after the landing | 80 / 304 | 1 / 150 | 0 / 150 | **0 / 150** |
| pump count complete (1-2-3 all said) | 292 / 304 (96.1 %) | 148 / 150 (98.7 %) | 150 / 150 (100 %) | **150 / 150 (100 %)** |
| "Blast off!" ends … s after lift-off, mean (max) | 2.26 (4.83) | 2.66 (4.52) | 1.65 (3.52) | **1.86 (3.28)** |
| "Blast off!" ended after the landing | 127 / 304 (42 %) | 108 / 150 (72 %) ⚠ | 24 / 150 (16 %) | **41 / 150 (27 %)** |
| camp count lines spoken / camps | 157 / 162 count lines | 80 / 80 | 80 / 80 | **80 / 80** |
| max lines waiting | 3–4 | 2 | 2 | **2** |

Reading: *fix* rescues the name line and the prompts but makes the count later ("Blast off!" after the landing 42 → 72 %);
*fixB* puts the count back in step but the stomp cuts the name line again (16 % heard). **fixC** gets both: the name heard
**30 → 83 %** and never after the landing, prompts heard **70 → 99 %** (start delay ≈ 1 s → 0.05–0.12 s), the pump count
**complete in 100 %** of launches, "Blast off!" after the landing **42 → 27 %** (mean end 2.26 → 1.86 s after lift-off), at most
2 lines waiting, Mimi's talk time **83–96 → 72–85 %**, 0 console errors; sessions 5.6–6.4 → 6.2–6.7 min (the +0.35 s aim and
+0.35 s launch delay per launch). The remaining 27 % late "Blast off!" are with the bot's fast stomps (0.3–0.6 s apart), the worst
case; a typical 4-year-old stomps 0.4–0.8 s apart.

## 8. Caveats
- The TTS durations are modelled (≈ ± 15 % of iOS Samantha / Linh at rate 0.9); real-device timing of `onstart` (100–300 ms on
  iOS) is not modelled. The bot pumps quickly (0.3–0.6 s apart), which is the worst case for the count lagging.
- Skill models choose the right mat with a fixed probability, so they do not get harder with 3 mats; only the random tapper
  shows the real effect of C1. Re-check stars after C1 with real children.
- No real-device run (iOS Safari TTS, touch latency) — the functional / visual testers cover the device shapes.
