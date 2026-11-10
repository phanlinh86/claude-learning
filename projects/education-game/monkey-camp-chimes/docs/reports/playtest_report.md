# Kiki's Camp Chimes — high-speed playtest report (2026-11-10)

Playtester: report-only. No game code was changed. Only `tests/sim/*` was edited or added:
- `lib.js`: aimed-gesture bookkeeping (was the judged chime the one the finger aimed at?), a more realistic swipe start, a
  "taps the beam" model (`beam`), a "mostly swipes at the chime" model (`swipey`), and the **sim-only, opt-in** P1-1 fix
  (`config.fairSwipe`). It is a monkey-patch of `CC.World.prototype` that is off unless that config key is set.
- `hs_playtest.js`: new tables for gesture fairness, surprises, per-topic wrong / 3★ / hints, and "3★ if an assisted
  round is capped at 2★".
- `hs_voiceflow.js` (new): the real page at **speed 1** with a fake `speechSynthesis` that takes a realistic time to say
  each line (300 ms + 75 ms × chars / rate) and is cut by `cancel()` the way Safari cuts it. An in-page 4-year-old listens,
  thinks and taps. Option `--variant quiet` tests the P1-2 proposal.

Raw outputs are in `tests/sim/out/` (git-ignored): `hs_main34`, `hs_main57`, `hs_fair`, `hs_assist4`, `hs_minr3`,
`hs_cap`, `hs_surp*`, `hs_casc`, `voiceflow_base.json`, `voiceflow_quiet.json`, `hs_browser_vp.json` and `voicelog.json`.

## 0. Verdict for a 4-year-old
The game is pretty and calm, and the core feedback is clear. The chime swings away from the finger, rings, sends a note to
a lantern, and Kiki says its name. Session length is right: 6.4 min for a typical 4-year-old and 7.0 min (p90 7.6) for a
slow 3-year-old. The sims found nothing broken: 0 stuck rounds, 0 stuck states, 0 NaN, 0 chimes off screen, and 0 cases
of "2 wrong rings without a hint". There are three things to fix before it feels fair and rewarding:
1. **Swipes are judged on the chime's outer ring (P1-1).** For ages 5–7, 10 % of clean swipes "aimed" at a chime are
   judged on its neighbour. The fix below takes that to about 2 %.
2. **The song moment is buried in words (P1-2).** At the end of every round Kiki says praise, then the song request,
   then "Beautiful music!", which is about 6 s of talk around a 1 s cascade. Kiki talks for about 82 % of the wall-clock
   time.
3. **Stars do not measure much for a child who taps the beam or taps at random (P2-1).** The assist gives them 3★ in
   57–69 % of rounds.

## 1. Method
- **Headless:** 3 208 sessions for ages 3–4 (n = 200 per model × age) and 2 112 sessions for ages 5–7 (n = 100), on 5
  viewports (iPhone portrait and landscape, iPad landscape, iPad portrait, iPad Air), EN / VI alternating, 1/30 s frames,
  through the real `pointerDown / pointerMove / pointerUp` API. Then 6 config variants were re-simulated, about 4 000
  more sessions.
- **Models:** `typical` (skill 0.72–0.92 by age; 20–25 % of its touches are swipes *at* the chime), `slow3` (slow
  3-year-old), `swipey` (a typical child who swipes 80 % of the time), `tapper` (random presses and slides anywhere),
  `swiper` (strums the whole row and never aims), `spammer` (6 presses/s), `beam` (taps the log beam, 20 % random chimes),
  `absent`, and `bot0.8` (the game's own bot).
- **Swipe realism (changed in `lib.js`):** a swipe at a chime now starts 5–45 px beside the *visible body* (sloppy:
  45–100 px). Before, it started at 1.05–2.2 × the hit radius, which is often on the neighbour's body. The swiper /
  tapper numbers therefore differ a little from MECHANICS §11.
- **Browser, speed 8** (`hs_browser_vp.js`): ages 3, 4, 5 and 7 × iPhone portrait / landscape and iPad landscape /
  portrait, EN / VI, with `?bot=1&autostart=1&autorestart=1`. Then `hs_voicelog.js` ran ages 3–7 × EN / VI.
- **Browser, speed 1** (`hs_voiceflow.js`): age 4, EN and VI, about 7 min each, run twice (base and `quiet`).

## 2. Numbers

### 2.1 Durations, stars and help (headless, default CONFIG)
| model | age | session min mean (p90) | chapter s mean [p10–p90] | round s (p90) | rounds > 120 s | stars 3/2/1 % | wrong / round | hint rounds % | assist rounds % | song auto % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 5.9 (6.2) | 85 [78–95] | 18.3 (23.3) | 0 | 64/24/12 | 0.52 | 13 | 1.5 | 10 | 75 |
| typical | 4 | 6.4 (6.6) | 92 [85–100] | 20.9 (28.0) | 0 | 65/25/10 | 0.47 | 9 | 1.0 | 10 | 88 |
| typical | 5 | 6.3 (6.5) | 91 [84–98] | 21.4 (30.4) | 0 | 66/23/12 | 0.50 | 8 | 0 | 9 | 90 |
| typical | 6 | 6.3 (6.5) | 91 [85–97] | 22.0 (33.4) | 0 | 71/20/9 | 0.40 | 6 | 0 | 10 | 95 |
| typical | 7 | 5.8 (6.0) | 83 [59–95] | 18.1 (26.8) | 0 | 76/19/6 | 0.32 | 4 | 0.1 | 11 | 93 |
| slow3 | 3 | 6.9 (7.4) | 100 [87–115] | 29.1 (40.6) | 0 | 53/27/20 | 0.76 | 25 | 6.9 | 42 | 63 |
| slow3 | 4 | 7.0 (7.6) | 102 [87–116] | 32.7 (47.3) | 0 | 45/26/29 | 1.00 | 31 | 10.7 | 42 | 57 |
| swipey | 4 | 6.4 (6.6) | 92 [84–100] | 21.3 (29.2) | 0 | 60/24/16 | 0.65 | 15 | 4.4 | 10 | 88 |
| swipey | 6 | 6.3 (6.6) | 91 [84–98] | 22.4 (34.4) | 0 | 59/22/19 | 0.79 | 16 | 0.5 | 10 | 95 |
| tapper | 3 | 6.5 (6.9) | 94 [83–105] | 23.0 (28.3) | 0 | 51/31/18 | 0.73 | 85 | 74 | 23 | 77 |
| tapper | 4 | 6.4 (6.6) | 92 [84–101] | 25.7 (35.4) | 0 | 37/33/30 | 1.11 | 90 | 82 | 23 | 87 |
| tapper | 5–7 | 6.6–6.7 (≤ 7.1) | 95–97 | 30–34 (≤ 59) | 0 | 26–28 / 20–25 / 49–52 | 2.0–2.4 | 90 | 56–59 | 19–23 | 91–95 |
| swiper | 3 | 6.0 (6.4) | 87 [75–99] | 18.7 (24.3) | 0 | 38/17/45 | 1.66 | 44 | 36 | 0 | 77 |
| swiper | 4 | 6.3 (6.7) | 91 [83–102] | 22.8 (34.0) | 0 | 25/13/63 | 2.71 | 62 | 53 | 0 | 88 |
| swiper | 5–7 | 6.6–6.7 (≤ 7.1) | 95–97 | 29–32 (≤ 59) | 0 | 22–25 / 11–12 / 65–66 | 5.4–5.9 | 64 | 44–47 | 0 | 91–96 |
| spammer | 3 | 4.5 (4.6) | 64 [61–67] | 12.9 (14.2) | 0 | 40/26/34 | 1.17 | 50 | 35 | 10 | 78 |
| spammer | 4 | 5.2 (5.3) | 74 [69–82] | 15.5 (19.1) | 0 | 18/17/65 | 2.50 | 75 | 62 | 0 | 86 |
| beam | 3 | 6.3 (6.7) | 91 [83–104] | 25.0 (28.8) | 0 | **69**/26/5 | 0.37 | 96 | **92** | 48 | 76 |
| beam | 4 | 6.5 (6.7) | 94 [86–102] | 27.4 (36.5) | 0 | **57**/31/12 | 0.59 | 98 | **94** | 50 | 88 |
| beam | 5–7 | 6.8–6.9 (≤ 7.4) | 99–100 | 33–35 (≤ 57) | 0 | 41–43 / 29–31 / 27–30 | 1.0–1.1 | 96–97 | 81–82 | 47–49 | 89–96 |
| bot0.8 | 3 / 4 / 5 / 7 | 3.4 / 4.3 / 4.7 / 4.2 | 47 / 60 / 67 / 60 | 9–15 | 0 | 54–74 / 19–29 / 7–18 | 0.34–0.71 | 6–11 | 0 | 18–22 | 78–81 |
| absent | all | idle nudges at 15.9 → 33.9 → 60.9 → 90.9 → 120.9 → 150.9 s (12 → 18 → 27 → 30 → 30 s after the ask); the round waits; main pauses after the 5th nudge (not with the bot) | | | | | | | | | |

Targets: a toddler's chapter should take 60–100 s and a session ≤ 8 min. Both hold for every engaged model. The slow
3-year-old's mean chapter is right at the top (100–102 s, p90 115–116 s), which is fine for the slowest child. In all
models, 0 rounds were "no right note for > 60 s" except 1 of about 3 000 slow3 rounds (64.8 s). Chapter cut by the time
limit: typical age 4 has 19 % of chapters cut, 49 % in its chapter 3 (count, 23 s rounds); slow3 has 93–100 %. That is
by design.

Per topic for the typical model: rounds take 18–21 s, except **count** (23 s at age 4, 26–27 s at ages 5–6 with dots,
because of the count run) and **oddeven** at age 7 (12 s rounds, a **61 s chapter**: the short end of the range). Wrong
answers per round are flat across topics because the model is not content-aware, so per-topic difficulty has to come
from real children (§4).

### 2.2 Gesture fairness: was the judged chime the one the finger aimed at?
"Aimed" means the child model chose a chime. The table compares that with the chime the world *judged*. Taps are fine
(99–100 %). Swipes are not, and it gets worse with age because the chimes get closer: at age 5 the hit circles overlap by
24–30 px on iPad landscape / portrait and iPhone portrait (spacing 123–128 px, hit radius 76 px). The visible gap between
two bodies (19–49 px) is entirely hit area, belonging half to one chime and half to the other. A swipe starts in that gap.
| model | age | gesture | n | judged = aimed % | judged = neighbour % | unfair misses / 100 rounds | share of all wrong % |
|---|---|---|---|---|---|---|---|
| typical | 4 | swipe (starts 5–45 px beside the body) | 1 120 | 96.6 | 3.1 | 1.0 | 2.0 |
| typical | 4 | sloppy swipe (45–100 px beside) | 665 | 77.3 | 22.4 | 3.7 | 7.9 |
| typical | 5 | swipe / sloppy | 950 / 236 | 90.1 / 67.4 | 9.1 / 32.6 | 5.2 + 4.5 | 10.4 + 9.0 |
| typical | 6 | swipe / sloppy | 911 / 228 | 89.2 / 61.8 | 10.4 / 38.2 | 6.2 + 5.1 | 15.4 + 12.7 |
| typical | 7 | swipe / sloppy | 977 / 261 | 89.5 / 64.8 | 10.0 / 35.2 | 5.9 + 5.1 | 18.3 + 15.9 |
| swipey | 4 | swipe / sloppy | 4 710 / 2 584 | 94.7 / 72.1 | 3.8 / 26.7 | 5.3 + 19.0 | 8.0 + 28.9 |
| swipey | 5–7 | swipe / sloppy | ≈ 3 300 / 800 each | 87–90 / 61–65 | 10–13 / 35–39 | 20–27 + 16–20 | 30–35 + 21–29 |
| all models | all | tap | ≈ 50 000 | 96.6–100 (the rest are assisted) | 0.0 | 0 | 0 |

So for a typical 6–7-year-old, **28–34 % of all "wrong" rings are the game's fault** (swipe + sloppy rows). For a child
who learned "swipe" from the song, it is 50–65 %. Each one costs a star and plays "That's the blue bell…" when the child
was right.

### 2.3 Counting fairness (age 4, bell strings 1–5)
- The count run is never cut: 14/14 count runs were heard in full at speed 1 (EN 7, VI 7). Little bells light 0.5 s apart.
- Wrong strings get a good counting correction: "Mình đếm nhé: Một cái chuông! Mình cần ba cái chuông nè!".
- **Skew:** across 4 800 generated age-4 count asks, the asked number is 1 or 2 in **47 %** and 5 in only **11 %**
  (1: 24 %, 2: 24 %, 3: 16 %, 4: 16 %, 5: 11 %). The warm-up is always 1 vs 2, round 1 takes 3 of {1, 2, 3, 4}, and round 3
  (the only other source of 5) is cut in about half of the count chapters by the time limit. "Counting 1–5" is mostly
  subitizing 1–2. P2-3 below fixes this. The nearest other string always differs by 1 (or 2): fine, that is the counting
  challenge.
- "One more! Ring the one with two bells!" and "Thêm một chuông nữa nhé! Bé tìm chùm có bốn cái chuông…" put a number
  word in front of the counting ask (P2-4).

### 2.4 Voice flow at real speed (age 4, the in-page child waits for Kiki, about 7 min per run)
| run | game min | rounds | lines / min | Kiki talking % of time | prompt start delay mean (p90) s | prompts heard fully before the first touch | round-end talk per round | prompts cut by another line | count runs heard fully | silences > 8 s | same line twice in 10 s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EN base | 6.8 | 15 | 21.4 | **81.8** | 0.80 (1.66) | 16 / 27 | **2.5 lines / 6.0 s** | 0 | 7 / 7 | 0 | 0 |
| VI base | 7.0 | 13 | 18.1 | **85.4** | 1.41 (2.49) | 19 / 31 | **2.2 lines / 6.2 s** | 0 | 7 / 7 | 0 | 0 |
| EN quiet (P1-2) | 6.8 | 15 | 20.9 | 73.2 | 0.47 (1.13) | 21 / 31 | 1.1 lines / 1.9 s | 0 | 8 / 8 | 0 | 0 |
| VI quiet (P1-2) | 7.0 | 14 | 18.5 | 83.0 | 1.09 (2.28) | 22 / 35 | 1.1 lines / 2.3 s | 0 | 7 / 7 | 0 | 0 |

- Prompts are never cut by Kiki's own lines. The only prompts that get cut are cut by the child's own early answer: the
  eager child (25 %) taps while Kiki is still speaking. main.js does this on purpose (`right` sets `promptUntil = 0` and
  interrupts). It is good UX, but VOICE.md §1.1 says "never over a protected prompt": fix the doc (P3).
- Mean line length: EN prompt 2.5 s, **VI prompt 3.7 s**, VI wrong line 3.3–4.3 s (up to 5.7 s), VI song ask 4.7 s.
  Vietnamese lines are about 50 % longer, so VI rounds are slower than the headless sim assumes (it uses a fixed 2.4 s
  prompt). Real sessions are about 6.8–7.0 min.
- VI: 2 of 4 end-of-chapter praises ("Hoan hô! Bài hát xong rồi!") were cut by the next chapter's banner line, because
  `level` speaks with `interrupt: true` (P3).
- In a VI run, two wrong lines in a row repeat the same information 7 s apart: "Ồ, chuông màu tím nè! Chuông màu vàng ở
  đâu nhỉ?" then "Cái này là chuông màu tím! Bé tìm chuông màu vàng nào!". The 1.5 s limit on wrong lines lets the second
  through. Acceptable.
- Speed 8, `hs_voicelog.js` (ages 3–7 × EN / VI, 10 full sessions): 0 broken lines, 0 English words in VI, 0 VI lines
  without diacritics, 0 errors. 32–38 lines per game minute at bot pace; 87–141 distinct lines per session.

### 2.5 Browser speed runs (`?speed=8&bot=1&autostart=1&autorestart=1`)
Ages 3, 4, 5 and 7 × iPhone portrait / landscape and iPad landscape / portrait: **16 / 16 sessions finished**, 16 rounds
each, 0 page errors, 0 `{}` / undefined lines, 0 back-to-back repeated lines, 0 EN words in VI. Chapters rotate between
sessions. Game time per session matches the headless bot0.8 rows (age 3: 3.38 vs 3.4 min). The only console output is
Chrome's "AudioContext was not allowed to start" warning, which comes from `autostart` without a gesture (a test flag).

### 2.6 Surprises
One surprise round per chapter. It appears 5.4 s after the first ask (`*At [3, 8]`).
| model | age | surprises / chapter | shown but not tapped % |
|---|---|---|---|
| typical | 3–7 | 0.96–1.00 | 31–40 |
| bot0.8 (a fast child) | 3 / 5 / 7 | **0.42** / 0.99 / **0.80** | 94 / 49 / 53 |

A quick child often finishes the round before the hedgehog or bird arrives (age-3 rounds take 5 s of play). See P2-2.

## 3. Issues and exact changes (each re-simulated)

### P1-1: Judge the chime's core, brush its rim (swipe fairness)
**Problem:** §2.2. The first contact of a swipe is judged even when the finger only enters the outer rim of the hit
circle (r = 0.6·size + 14). The gap between two bodies is all rim, so a swipe that starts there is judged on the
neighbour.
**Change** (world.js; it is implemented sim-side in `tests/sim/lib.js` `patchFairSwipe`):
```js
// CONFIG
coreK: 0.42, corePad: 8,                 // core = the visible body (≈ 55 px at size 112); cores never overlap (spacing ≥ 113)
// helpers
P._coreR = function (c) { return this.cfg.coreK * c.size + this.cfg.corePad; };
P._coreSet = function (x, y) { var o = {}; for (var i = 0; i < this.chimes.length; i++) { var q = this.chimes[i];
  if (this._touchable(q) && hyp(x - q.cx, y - q.cy) <= this._coreR(q)) o[q.id] = true; } return o; };
// pointerDown, inside `if (c) {` before the judged contact (play, no assist):
if (play && !c.done && !this._stepDone && hyp(x - c.cx, y - c.cy) > this._coreR(c)) {
  // a press on the RIM: ring it now (brush), judge on release if it stays a tap, else the first core the slide enters
  var str = this._strike(c, dir * cfg.kTap * this._w0(c), 0.6, false);
  this._emit({ type: 'ring', id: c.id, thing: c.thing, note: c.note, x: c.cx, y: c.cy, strength: str, judged: false, brush: true });
  g.contacted = true; g.deferred = c.id; g.core = this._coreSet(x, y);
  return (g.result = 'chime');
}
g.core = this._coreSet(x, y);
// pointerMove: after updating g.maxD
if (g.deferred && g.maxD >= cfg.tapMovePx) g.deferred = null;          // it became a swipe
// … in the hits loop, while play && !g.judged && !q.done: judge only a CORE entry; a rim entry is a brush
var coreHit = segHit(g.x, g.y, x, y, q.cx, q.cy, this._coreR(q)) >= 0 && !g.core[q.id];
if (play && !g.judged && !q.done && !coreHit) { /* _contact as a brush: strike(…, 0.6) + ring {brush:true} */ continue; }
// … after the loop: g.core = this._coreSet(x, y);
// pointerUp AND cancelDrag (a slipped tap must still count), before the soft check:
if (g.deferred && !g.judged && this.state === 'round' && this.phase === 'play' && !this._stepDone) {
  var d0 = this.chimeById(g.deferred); if (d0 && !d0.done) this._contact(d0, g.x, g.y, 1e-6, g);
}
```
Unit tests to add: (1) a swipe that starts 10 px outside the left neighbour's body and runs through the asked chime →
`right`; (2) a rim tap (no move) → judged on release; (3) a strum across the whole row is still judged on the first core
it enters (not on the asked chime), so strumming does not earn more.

**Measured** (`--config '{"fairSwipe":1}'`, n = 150, ages 3–5, compare §2.2):
| model | age | swipe judged = aimed % | sloppy judged = aimed % | unfair misses / 100 rounds | 3★ % |
|---|---|---|---|---|---|
| typical | 4 | 96.6 → **99.6** | 77.3 → **91.9** | 4.7 → **1.2** | 65.3 → 66.9 |
| typical | 5 | 90.1 → **98.0** | 67.4 → **84.5** | 9.7 → **3.3** | 65.5 → 69.3 |
| swipey | 4 | 94.7 → **99.4** | 72.1 → **91.8** | 24.3 → **5.0** | 60.2 → 66.5 |
| swipey | 5 | 87.0 → **97.8** | 64.5 → **85.4** | 40.2 → **9.5** | 59.4 → 67.1 |
| swiper (strums, never aims) | 4 | – | – | – | 24.8 → 25.2 (strumming is **not** rewarded more) |
| typical / slow3 session | 3–5 | | | | unchanged (6.0 / 6.4 / 6.3 min; slow3 6.9–7.1 min) |
Side effect: a rim tap that is cancelled (touchcancel / slip) is not judged unless `cancelDrag` also resolves it as
shown above. Without that line, 3–4 % of slow3 taps rang without a judgement. Brushes per round go up (rim entries now
ring softly), which is sound only.

### P1-2: Let the song moment breathe (less talk at the end of a round)
**Problem:** §2.4. Every round ends with praise ("What a music star!", 1.8 s), then the song request ("Song time! Swipe
across all the chimes!", 3.7 s EN / 4.7 s VI), then "Beautiful music!" (1.9 s) on top of a 0.6–0.8 s cascade. That is
2.5 lines / 6 s per round, 15 times a session. Kiki talks 82–85 % of the time, and the next prompt starts 0.8 s (EN) /
1.4 s (VI) late on average because it queues behind those lines.
**Change** (main.js + i18n.js):
```js
// i18n.js en
'songShort': ['Swipe the chimes!', 'Song time!', 'Play our song!'],
// i18n.js vi
'songShort': ['Vuốt qua các chuông nào!', 'Đến giờ hát rồi!', 'Mình chơi nhạc nào!'],
// main.js — case 'songAsk': the full line only for the first song of each chapter
songWords = T(songAskedLevel === world.level ? 'songShort' : 'song'); songAskedLevel = world.level;
// main.js — case 'songDone': no line; the cascade, the lantern flash and Kiki's dance are the praise
//   delete:  if (now - lastPraise > 1200 && now - lastSongSay > 4000) { lastSongSay = now; speak(T('songDone')); }
//   (keep it only when e.auto is false and it is the chapter's last round, if one spoken line is wanted)
```
**Measured** (`hs_voiceflow.js --variant quiet`; the variant used "short after the first song of the session", which
is a bit quieter than "of each chapter"):
| | EN | VI |
|---|---|---|
| round-end talk | 2.5 lines / 6.0 s → **1.1 lines / 1.9 s** | 2.2 / 6.2 s → **1.1 / 2.3 s** |
| Kiki talking % | 81.8 → **73.2** | 85.4 → **83.0** |
| prompt start delay mean (p90) | 0.80 (1.66) → **0.47 (1.13)** s | 1.41 (2.49) → **1.09 (2.28)** s |
| prompts heard fully before the first touch | 59 % → **68 %** | 61 % → **63 %** |
Session length is unchanged (6.8 / 7.0 min). The child sets the pace, and the talk was mostly while the chimes were
being swapped.

Optional, to make the song itself feel more like a song: `cascadeGap: 0.16 → 0.28` and `songTail: 0.6 → 0.9` (a 4-chime
cascade lasts about 1.4 s instead of 0.8 s). Measured: typical age 3 5.9 → 6.1 min, age 4 6.4 → 6.4 min, slow3
6.9–7.0 min (p90 ≤ 7.5). Still within budget.

### P2-1: An assisted note caps the round at 2★
**Problem:** after 3 no-progress presses at ages ≤ 4 (soft presses count), any press in the beam band rings the right
chime. A child who only taps the log beam gets 3★ in 69 % (age 3) / 57 % (age 4) of rounds. A random tapper gets 3★ in
37–51 %. Stars then mean little.
**Change** (world.js): set `this._roundAssisted = true` where `assist` is emitted (in `_contact` when `from !== undefined`),
reset it in `_beginRound`, and in `_startSong` where `st` is computed (just before `this.roundStars = st`) add
`if (this._roundAssisted) st = Math.min(st, 2);`. Stars still
only go up, and no fail state is added.
**Measured** (n = 100, ages 3–5, "3★ % if an assisted round is capped at 2★"):
| model | age 3 | age 4 | age 5 |
|---|---|---|---|
| beam | 69 → **7** | 56 → **5** | 43 → **13** |
| tapper | 51 → **20** | 37 → **14** | 26 → **20** |
| spammer | 39 → 37 | 18 → 17 | 15 → 15 |
| typical | 64 → 64 | 66 → 66 | 66 → 66 |
| slow3 | 53 → 53 | 45 → 45 | 43 → 43 |
Real children who try are not affected.
Not recommended: `assistAfterYoung: 3 → 4`. Measured, it cut slow3's assist rounds from 6.9 / 10.7 % to 2.8 / 5.1 % but
made the beam child slower (6.3 → 6.6 min) without changing its stars much (69 → 63 %).

### P2-2: Surprises come a little earlier
**Problem:** §2.6. A quick child often finishes the surprise round before the visitor arrives (bot0.8 at age 3: 0.42
surprises per chapter).
**Change** (CONFIG): `hedgehogAt: [3, 8] → [3, 5]`, `birdAt: [3, 8] → [3, 5]`, `firefliesAt: [3, 7] → [3, 5]`. This
keeps the 3 s minimum, so the visitor does not walk in over the prompt. [2, 4.5] was also tested: 0.97 per chapter, but
it spawns during the prompt.
**Measured** (n = 60): surprises per chapter for bot0.8 at ages 3 / 5 / 7: 0.42 / 0.99 / 0.80 → **0.88 / 1.00 /
0.87**. Typical: 1.00 → 1.00, "shown but not tapped" 33 → 28 %. Durations unchanged.

### P2-3: Count chapter at age 4 should practise 3–5, not mostly 1–2
**Problem:** §2.3, 47 % of the asks are "1" or "2".
**Change** (content.js `case 'count'`, `age <= 4` branch, after `vals = rng.sample(range(1, hi), n + d);`):
```js
if (ri >= 1) vals.sort(function (a, b) { return b - a; });   // the targets are the bigger strings, the distractor the smallest
```
The step order stays random (hook order is shuffled), and the distractor still keeps the last ask from being free.
**Measured** (10⁵ simulated chapters with the same sampling): asked-number shares 1: 28 % → **10 %** (warm-up only), 2: 28
→ 30 %, 3: 17 → 23 %, 4: 17 → 23 %, 5: 10 → 13 %; 3–5 together go from 44 % to **59 %**. Run `content_stats.js` after the
change: the validator checks `count: too many bells for round ri`, which still holds.

### P2-4: No number words in the "next" prefix during a counting round, and shorter VI next-prompts
**Problem:** "One more! Ring the one with two bells!" and "Thêm một chuông nữa nhé! Bé tìm chùm có bốn cái chuông rồi
rung nào!" (6.1 s) put "one" in front of a number. VI next-prompts with this prefix are 3 sentences long (5–6.3 s).
**Change** (i18n.js `I18N.ask`): when `key === 'p.count'` (or the params carry `n`), drop the "One more!" / "Thêm một
chuông nữa nhé!" variants (use `'Next one!'` / `'Now,'` / `'Tiếp nào!'` / `'Giờ thì'`). Change VI `p.next[1]`
`'Thêm một chuông nữa nhé!'` → `'Thêm chuông nữa nè!'`. When a prefix is used, prefer the prompt variant without the
trailing "Bé rung nào!", for example "Tiếp nào! Chuông màu xanh dương đâu rồi nhỉ?".

### P2-5: The song should start from the beam too
**Problem:** in the song phase a press on the beam or the sky only wobbles the beam. The beam-tapper waits for the auto
cascade 48–50 % of the time (typical: 10 %). The song is the reward, so any press in `layout.band` should play it.
**Change** (world.js `pointerDown`, before the soft branch): `if (this.state === 'roundDone' && ph === 'song' && this._song
&& !this._song.started && inBox(L.band, x, y)) { this._beginCascade(null, false); return (g.result = 'song'); }`.
Expected: beam "song auto %" goes from 48 % to about 10 %, the same as typical.

### P3 (small)
1. **Docs vs code: `chapterMinRounds`.** CONFIG has 2. MECHANICS §6 / §11 and the skill say "after ≥ 3 rounds" and
   MECHANICS says "3 is kept". Measured with `{"chapterMinRounds":3}`: slow3 at age 4 goes from 7.0 (p90 7.6) to **7.7
   (p90 8.3) min**, which breaks the 8-min limit. Typical is unchanged. **Keep 2 and fix the docs**: MECHANICS §6 should
   say "after ≥ 2 rounds" and §11 should drop "3 is kept".
2. **VOICE.md §1.1, `right`** says "never over a protected prompt (then queue)", but main.js always lets `right` cut the
   prompt (`promptUntil = 0`). The code is right; the doc should say "the child's answer cuts the prompt".
3. **VI chapter change cuts the praise:** 2 of 4 `levelDone` praises were cut by the next `level` line. In main.js
   `case 'level'`, use `interrupt: !speaking()`, or raise `levelDoneTime` 3.6 → 4.2 s for `vi`.
4. **VI wording:** `'talk.intro': 'Giờ trò chuyện!'` sounds stiff → `'Mình cùng trò chuyện nhé!'`. Song:
   `'Giờ mình chơi bài hát nhé — vuốt qua các chuông nào!'` → `'Mình cùng chơi nhạc nhé — vuốt qua các chuông nào!'` ("chơi
   bài hát" is a calque). "Mình đếm nhé! Chùm nào có hai cái chuông? Bé rung nào!" → "Mình đếm nhé! Chùm nào có hai cái
   chuông?".
5. **Age 7 `oddeven` chapter is short:** 61 s chapter (p90 69 s), 12 s rounds, 83 % 3★. Give it 3 targets + 2 distractors
   from round 1.
6. **Project `CLAUDE.md` is stale:** it still describes "Pom's Puzzle Town" (jigsaw, `pz:` storage prefix, Pom). Rewrite
   it for Kiki's Camp Chimes.
7. **`autostart` test flag:** Chrome logs "AudioContext was not allowed to start" (no user gesture). Harmless, but
   `hs_browser_vp.js` counts warnings as errors, so filter it there or create the AudioContext lazily on the first unlock.

## 4. Game-design evaluation (as a 4-year-old's game)
- **Fun / feel:** strong. The pendulum swing that moves *away* from the finger, the clapper lag, the drop-in bounce and
  the note flying to a lantern are tactile and readable. The day cycle (morning mist → night fireflies) gives a sense of
  journey. On iPad the chimes (112 px) sit in the centre with clear gaps at age 4. On iPhone portrait they hang low over
  Kiki and the top half is sky, which is calm but leaves a long thumb reach to the pause button.
- **Feedback clarity:** good. A right ring gives a bright note, the chime's name, a note flying to a lantern and Kiki's
  hop. A wrong ring is dull and gives a kind correction that names both chimes. Hints come after 2 misses and assist after
  3 no-progress presses. 0 of all simulated rounds (≈ 80 000) had 2 wrong rings without a hint. Weakness: P1-1 makes some "wrong"
  feedback wrong, which teaches the child that swiping is risky right after the song taught them to swipe.
- **Difficulty per age:** the 3★ rate is 64–66 % for typical ages 3–5 and 71–76 % for ages 6–7. Wrong answers per round:
  0.52 (age 3) → 0.32 (age 7). Hints show up in 4–13 % of rounds. That is a gentle, well-sized curve. Age 3 (2 bells, then
  2 + 1) is easy enough. Age 4 colours / shapes with 3 + 1 are right. Count at age 4 is too easy as generated (P2-3).
  Ages 6–7 maths topics look fine in time (≈ 90 s chapters). The sims cannot measure content difficulty because the
  models are not content-aware: that needs real-child observation.
- **The song moment:** this is the right idea (a strum and a lantern flash as the reward for 2–3 notes), but it is short
  (0.8 s) and wrapped in about 6 s of talk. With P1-2 (and optionally the slower cascade) it becomes "finish → strum →
  hear your song → next". 90 % of typical rounds start the song by a touch (10 % auto). The slow 3-year-old relies on the
  auto cascade 42 % of the time: `songWait` 4 s is good. Replaying the notes in the order the child rang them (the
  climbing set) makes "our song" literal. A "listen to our songs" gallery at the end (the `w.songs` data exists) would be
  a nice closing.
- **Surprises:** well placed: never in the warm-up, one per chapter, spoken only when no prompt is protected, gone at the
  song. With P2-2 the fast child sees them too. About 30 % of typical children ignore them (by model), which is fine
  because they never block anything.
- **Different enough from Bop's Rainy Band (tap the member / drum N times)?** Yes in look, motion and reward: things
  hang from a beam, swipes are allowed, the physics is a pendulum, and lanterns plus a cascade replace the band. The *core
  verb* is still "tap the asked item", though, and the counting is weaker than the band's "drum N times": here the child
  picks a string and **Kiki** counts. A distinctive upgrade for the count chapter: after the right string rings, the child
  taps its little bells one by one, and each lights up and is counted aloud ("one… two… three!"). Active counting, unique
  to chimes, with no new layout. This is a design proposal, not tested in the sim.

## 5. How to reproduce
```
node tests/sim/hs_playtest.js --n 200 --ages 3,4 --models typical,slow3,swipey,tapper,swiper,spammer,beam,bot0.8,absent --jobs 2 --tag main34
node tests/sim/hs_playtest.js --n 100 --ages 5,6,7 --models typical,swipey,tapper,swiper,spammer,beam,bot0.8,absent --jobs 2 --tag main57
node tests/sim/hs_playtest.js --n 150 --ages 3,4,5 --models typical,swipey,swiper,slow3,tapper,bot0.8 --config '{"fairSwipe":1}' --tag fair
node tests/sim/hs_playtest.js --n 100 --ages 3,4,5 --models typical,slow3,tapper,beam,spammer --tag cap          # "3★ capped" table
node tests/sim/hs_playtest.js --n 60 --ages 3,5,7 --models typical,bot0.8 --config '{"hedgehogAt":[3,5],"birdAt":[3,5],"firefliesAt":[3,5]}'
node tests/sim/hs_playtest.js --n 150 --ages 3,4 --models typical,slow3 --config '{"chapterMinRounds":3}'
node tests/sim/hs_playtest.js --n 100 --ages 3,4 --models typical,slow3 --config '{"cascadeGap":0.28,"songTail":0.9}'
node tests/sim/hs_voiceflow.js --ages 4 --langs en,vi --minutes 7 --tag base     # + --variant quiet --tag quiet
node tests/sim/hs_browser_vp.js --ages 3,4,5,7 --sessions 1 ; node tests/sim/hs_voicelog.js
```
