# Nuka's Snow Dig — high-speed playtest report (2026-11-23)

Tester: high-speed playtester (report-only on `game/`; new / changed files only under `tests/sim/`).
Scope: headless sims of the real `rng/content/world/bot` code with 17 child models × ages 3–7, the real page in Playwright at
`?speed=8&bot=1&autostart=1`, a voice-log pass, a model of the speech queue (main.js policy + voice.js queue), screenshots at
speed 1, and a "4-year-old" judgement. Every proposed change was re-simulated (CONFIG overrides via `--config`; code proposals
as SIM-ONLY patches in `tests/sim/hs_snow.js`, never in `game/`).

**Verdict:** the game is in good shape. In 3 400 + 2 × 2 550 + ~3 000 extra sessions there were 0 failed sessions, 0 NaN,
0 stuck states and 0 rounds over 120 s (max 109 s, a slow-toddler profile on age-6 content). A typical 3–4-year-old plays
67 / 74 s chapters and a 4.6 / 5.1 min session (target 60–100 s, ≤ 8 min). Rubbing is about 2.8× faster per dig than one tap,
and tapping alone still always works. There is **one P1**: the spoken teaching of the rub gesture arrives after the ghost hand
has stopped in about half the sessions. All of Vietnamese is in that half, and at ages 5–7 the line is dropped in about 35 %
of sessions. There are four P2s: the belly-slide hidden behind the drifts on an iPhone in portrait, taps over a drift wasted,
gentle toddler "rubs" doing nothing, and the slide / fly lines never spoken on a device.

---

## 1. How it was tested

| run | what | sessions |
|---|---|---|
| `node tests/sim/hs_snow.js --n 40 --tag base` | 17 models × ages 3–7, 5 viewports, EN / VI, with the speech model (→ `tests/sim/out/snow_base.md`) | 3 400 |
| `hs_snow.js --n 30 --tag base30` vs `--tag rec …` (the recommended bundle, §4) | the same models, before / after | 2 × 2 550 |
| targeted experiments (`thingTopPad` 70 / 80 (+ clamp), `autoScoop` 0.7, `rubMinSeg` / `rubStroke`, the hold-digs patch, `nearBind`, the speech-policy variants) | 30–40 per model × age | ≈ 3 000 |
| `node tests/sim/hs_playtest.js --models absent,typical,bot0.8 --ages 3,4,7 --n 30` (regression, existing harness) | matches MECHANICS §11; absent child: idle at 15.5, 33.5, 60.5, 90.5, 120.5, 150.5 s | 192 |
| `node tests/sim/hs_browser_snow.js --ages 3,4,5,6,7 --sessions 3 --speed 8` (real page, built-in bot, iPhone portrait / iPad landscape / iPhone landscape) | full sessions | 15 |
| `node tests/sim/hs_voicelog.js --ages 3,4,7 --langs en,vi` (real page) | every line handed to `NK.Voice.say` | 6 |
| `node tests/sim/slide_cover.js --n 8` | how much of the belly-slide pose is behind front-row drifts | 960 |
| speed-1 screenshots (rub demo, float, belly-slide; iPhone portrait + iPad landscape) | judgement | — |

New child models (in `hs_snow.js`):
- **above**: taps 50–140 px above the peeking thing, like a child aiming at the drift from above. It does this in 65 % of its taps.
- **twoDrift**: rubs with swings wide enough to cross onto the next drift.
- **emptyRub**: 50 % of its rubs start on empty snow just beside the drift it means, and 1 in 4 of those start halfway to the
  next drift.
- **slowTap / slowRub**: the slow 3-year-old who never rubs, or always rubs.
- **shortRub**: a slow toddler who "rubs" with tiny 6–13 px wiggles for 0.5–1.2 s.

The other models are from `lib.js` and `hs_kids.js`: typical, taponly, rubber, slow3, slowOnce, tapper (random tapper), high,
spammer, sandOnly, perfect and bot0.8.

## 2. Numbers (baseline, `snow_base.md`, 40 sessions per row)

### 2.1 Chapter, session and round length

| model | age | session min (p90) | chapter s mean [p10–p90] | round s mean · p50 / p90 / p99 · max | 3★ / 2★ / 1★ % | wrong / round | hint rounds % | assist rounds % |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 4.6 (4.9) | 67.5 [57.8–80.3] | 11.7 · 9.9 / 17.2 / 26.8 · 31.6 | 72 / 26 / 2 | 0.29 | 3.1 | 0 |
| typical | 4 | 5.1 (5.5) | 74.1 [60.0–88.1] | 13.4 · 11.7 / 20.2 / 30.0 · 41.1 | 85 / 11 / 3 | 0.18 | 4.2 | 0 |
| typical | 5 / 6 / 7 | 5.8 / 5.7 / 5.4 | 84.8 / 84.0 / 79.2 | 16.0 / 15.8 / 14.6 · max 36.0 | 83–88 % 3★ | 0.14–0.20 | 0.5–2.5 | 0 |
| taponly | 3 / 4 | 4.7 / 5.2 | 68.5 / 76.6 | 12.0 / 14.0 · max 47.2 | 71 / 84 % 3★ | 0.32 / 0.19 | 4.7 / 3.9 | 0 |
| rubber | 3 / 4 | 4.5 / 4.9 | 66.1 / 72.0 | 11.4 / 12.8 · max 36.7 | 73 / 85 % 3★ | 0.31 / 0.17 | 4.1 / 3.0 | 0 |
| slow3 (slow 3-year-old) | 3 / 4 | 6.1 (6.7) / 6.6 (7.1) | 90.3 [78.6–104.5] / 97.7 [82.6–116.5] | 18.2 / 21.9 · max 70.1 | 54 / 67 % 3★ | 0.52 / 0.43 | 14.3 / 13.4 | 0 / 0.2 |
| slowTap / slowRub | 3 | 6.2 / 6.1 | 90.6 / 90.2 | 18.1 / 17.9 | 59 / 59 % 3★ | 0.45 / 0.47 | 10.7 / 10.7 | 0 |
| tapper (random) | 3 / 4 / 7 | 5.8 / 6.1 / 7.0 | 85.6 / 90.4 / 103.6 | 16.5 / 19.5 / 28.2 · max 78.4 | 72 / 68 / 35 % 3★ | 0.29–0.97 | 85–97 | 73–85 |
| above (taps over the drift) | 3 / 4 | 5.5 / 6.0 | **80.9 / 87.7** | 15.2 / 17.6 · max 67.0 | 80 / 85 % 3★ | 0.21 / 0.17 | **53.7 / 54.3** | **24.3 / 24.1** |
| high (taps the tip) | 3 / 4 | 4.9 / 5.4 | 71.1 / 79.2 | 12.6 / 14.7 | 72 / 84 % 3★ | 0.29 / 0.19 | 20.5 / 17.0 | 0.8 / 1.1 |
| twoDrift | 3 / 4 | 4.5 / 4.9 | 65.0 / 72.1 | 11.1 / 12.8 | 70 / 82 % 3★ | 0.33 / 0.20 | 4.5 / 3.0 | 0 |
| emptyRub | 3 / 4 | 4.7 / 5.1 | 68.3 / 75.0 | 11.9 / 13.6 | 70 / 82 % 3★ | 0.33 / 0.22 | 5.3 / 4.7 | 0 |
| shortRub (tiny slow wiggles) | 3 / 4 | 6.5 / 6.8 | **95.8 / 100.2** (p90 113 / 119) | 20.1 / 23.8 · max 77.7 | 54 / 67 % 3★ | 0.52 / 0.41 | 13.9 / 14.8 | 0 |
| spammer (6 taps/s) | 3 / 4 | 3.8 / 4.4 | 55.1 / 64.6 | 8.6 / 10.9 | 45 / 48 % 3★ | 0.67 / 0.82 | 29 / 35 | 6 / 8 |
| sandOnly (never hits a drift) | 3 / 4 | 6.3 / 6.7 | 93.4 / 98.8 | 19.0 / 22.9 · max 70.7 | 96 / 97 % 3★ | 0.04 | 98.5 / 99.3 | 97 / 99 |
| perfect / bot0.8 | 3–7 | 3.1–4.8 | 44–70 | 6.6–13.2 | 72–100 % 3★ | 0–0.37 | 0–6 | 0 |

Round-length histogram for typical age 4: 0–10 s 41.5 %, 10–15 s 24.3 %, 15–20 s 24.0 %, 20–30 s 9.1 %, 30–45 s 1.1 %,
over 45 s 0 %. For the slow3 model at age 4: 10–20 s 54 %, 20–30 s 25 %, 30–45 s 16 %, 45–60 s 3.2 %, 60–90 s 0.5 %.
There were 0 rounds over 120 s in every model and age. Full histograms are in `snow_base.md` §B.

The slow-toddler profiles run on ages 5–7 content (slow3, slowTap, slowRub, slowOnce, shortRub) have chapters of 112–123 s and a
session p90 of 8.1–9.4 min. That mismatch comes from the model: a 3-year-old's speed on sums and letters. A real 5–7-year-old
(typical) plays 79–85 s chapters and 5.4–5.8 min sessions. No CONFIG change is needed for this, and the bundle in §4 brings
those profiles to 8.0–8.7 min anyway.

### 2.2 Rub vs tap dig speed (dig start → reveal, s; assisted digs excluded)

| model | age | rub share of digs | one tap, then wait | tap + taps along | rub (p90) |
|---|---|---|---|---|---|
| typical | 3 (2 scoops) | 40 % | 1.33 (→ judged 1.80) | 0.82 | 0.71 (0.77) |
| typical | 4–6 | 50–52 % | 1.51–1.53 (→ 2.00) | 1.23–1.25 | 0.79 (0.93) |
| typical | 7 (3 scoops) | 50 % | 2.20 (→ 2.67) | 1.49 | 0.89 (0.93) |
| slow3 | 4 | 31 % | 1.85 (→ 2.31) | 1.54 | 1.29 (2.20) |
| shortRub | 4 | 59 % | 1.81 | 1.53 | **1.75 (2.20)** (the tiny rub barely counts) |

The tap columns at ages 4–6 mix in the 2-scoop counting rounds; a pure 3-scoop tap is 2.21 s. Rubbing is about 2.8× faster
than one tap and saves 2.4–5.9 s per chapter (rubber vs taponly: age 3 66.1 vs 68.5, age 4 72.0 vs 76.6, age 5 82.2 vs 88.1).
The tap fallback is fast enough. **`autoScoop` 0.85 → 0.7 was tested and gains only 0.1–1.4 s per chapter for taponly, slowTap
and slowOnce children**, and it would shrink the reward for rubbing. Keep 0.85.

### 2.3 Real page (Playwright, built-in bot, `?speed=8&bot=1&autostart=1&mute=1`)
- **15 full sessions** (ages 3–7 × iPhone portrait, iPad landscape and iPhone landscape; EN + VI):
  - all reached the session-done screen, with 0 page errors and 0 console errors;
  - sessions lasted 3.0–4.8 min of game time (bot), with chapters of 41–85 s and a longest round of 9.5–24 s;
  - there were 0 assists, 0–3 hints per session, 16 slides per session and 16–39 floats;
  - the rub demo started 0.91 s after the first ask in every session.

  `slowFrames` is high because of headless rendering at speed 8 on a shared CPU, not the game.
- **Voice log** (`hs_voicelog.js`, 6 sessions EN / VI, ages 3 / 4 / 7):
  - 0 broken lines (no undefined / null / NaN / {param}) and no English inside Vietnamese lines;
  - 24.5–26.6 lines per game minute, 63–88 distinct lines per session;
  - the only "VI without diacritics" hits are "Hai!" and "Ba!", which are correct Vietnamese, so they are false positives of the
    checker.
- At `speed > 1` main.js disables speech, so `NK.Voice.isSpeaking()` is always false in these runs. That makes the browser log
  show "slide" and "fly" lines being requested (5–10 slide and 4 fly lines per EN session). On a device they are not (P2-4).
  Speech timing therefore comes from the speech model in `hs_snow.js`: the main.js rules + the voice.js queue, 1 speaking +
  ≤ 2 waiting, a 5 s stale limit, interrupts, and ≈ 0.072 s per character at rate 0.9.

### 2.4 Speech (model, baseline)

| model | age | prompts heard fully | ask → prompt starts, s (p90) | first prompt of the session delayed by | rub line heard fully | rub line starts after the ask, s (p90) | rub line starts while the hand still rubs | rub line dropped | fly lines / session | slide line heard |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 97.5 % | 0.28 (1.57) | 1.25 s | 52.5 % | 4.06 (5.73) | **50 %** (EN yes, VI never) | 0 | 0.07 | **0 %** |
| typical | 4 | 96.3 % | 0.31 (1.57) | 1.25 s | 57.5 % | 4.02 (5.27) | 51 % | 1 / 40 | 0.05 | 0 % |
| typical | 5 / 6 / 7 | 94 / 88 / 91 % | 0.35–0.40 | 1.22–1.70 s | 48 / 15 / 13 % | 3.1–4.3 | 27–83 % | **16 / 14 / 10 of 40** | 0.05–0.15 | 0 % |
| slow3 | 3 / 4 | 99.9 / 99.6 % | 0.25–0.28 | 1.25 s | 93 / 100 % | 4.0 | 50 % | 0 | 0.00–0.03 | 0 % |

Other lines: a round-end praise is heard in 98–100 % of rounds. Prompts were cut only by the child's own actions: the found
line after a fast dig, a Talk answer, or a tap on Nuka. The `rub` line never cut a prompt.

---

## 3. Findings, ranked, with exact changes and the re-simulated effect

### P1-1 — The spoken rub lesson misses the ghost-hand demo (VI always), and at ages 5–7 it is often dropped
**What happens.** At chapter 1, `level` speaks "Chapter 1. Colourful Hats" (interrupt) and then **queues the weather line**
("Spring! The snow is melting!"). The first `ask` comes about 3.6 s later, while the weather line is still being spoken, so the
first prompt starts **1.25 s late**. The rub demo fires 0.9 s after the ask and the `rub` line is queued behind the prompt.
- The line starts **≈ 4.0 s after the ask** (p90 5.3–5.7 s).
- The hand rubs only from 0.9 to 4.1 s, so in **about 50 % of sessions the words come after the hand is gone**. That is every
  Vietnamese session, because the VI prompts are longer.
- At ages 5–7 (3 drifts in the warm-up) the queue is full and the `rub` line is **dropped in 25–40 % of sessions**.
- Overall it is heard fully in only 13–58 % of sessions for typical children, because the found line cuts it when the child
  digs first.

For a child seeing the gesture for the first time, the hand and the words "Rub the snow! Swish, swish!" need to happen together.

**Change (three parts, all re-simulated):**
1. `game/js/main.js`, `case 'level'`: do not speak the weather line in chapter 1 (the scene and the title already show spring):
   ```js
   if ((e.level | 0) > 0) speak(T('weather.' + ((e.weather != null ? e.weather : e.level) % 4)));   // chapter 1: the rub demo needs the voice
   ```
2. `NK.CONFIG` (`game/js/world.js`): **`rubDemoDelay: 0.9 → 2.0`**, **`rubDemoTime: 3.2 → 4.0`**. The hand then rubs from 2.0 to
   6.0 s after the ask, starting as the prompt ends and covering the whole spoken line.
3. `game/js/main.js`, `case 'rubDemo'`: `speak(T('rub'), { priority: true })`. A priority line is never dropped and never goes
   stale; it still queues behind the prompt.

**Effect.** `hs_snow.js --config '{"rubDemoDelay":2.0,"rubDemoTime":4.0}' --sv '{"rubPri":1,"noWeather0":1}'`, 40 sessions
per row:

| model | age | first prompt delay | rub line starts after the ask | starts while the hand still rubs | rub line heard fully | rub line dropped | prompts heard fully | mean prompt delay |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 1.25 → **0.00 s** | 4.07 → **2.87 s** | 50 → **100 %** | 50 → **75 %** | 0 → 0 | 97.6 → 97.8 % | 0.28 → 0.22 s |
| typical | 4 | 1.25 → 0.00 | 3.97 → 2.81 | 50 → 100 % | 60 → 85 % | 0 → 0 | 96.6 → 96.7 % | 0.31 → 0.25 |
| taponly | 3 / 4 | 1.25 → 0.00 | 4.0 → 2.9 | 50 → 100 % | 60 / 65 → 80 / 90 % | 0 → 0 | ≈ same | 0.29 → 0.23 |
| slow3 | 3 / 4 | 1.25 → 0.00 | 4.0 → 2.9 | 50 → 100 % | 95 / 98 → 100 % | 0 → 0 | ≈ same | 0.27 → 0.22 |
| typical | 5 / 7 | 1.22 / 1.30 → 0.00 | 3.4 / 4.2 → 3.1 / 3.3 | (window 6 s) | 48 / 20 → 57 / 55 % | **14 / 14 → 0 / 0** | ≈ same | ≈ same |

The weather change alone (part 1) already gives 88–98 % in the demo window and 78–93 % heard. The CONFIG change makes it 100 %.
Chapter length does not change (±0.6 s). The demo still showed in 100 % of sessions for every non-spamming model. A child who taps
within 2.0 s skips it, but that child is already digging. Spammer and bot0.8 rarely saw it, at the old 0.9 s too.

### P2-1 — Nuka's belly-slide is drawn BEHIND the front-row drifts (worst on iPhone portrait)
`render.js` `_game` draws the drifts with `m.y ≥ bun.y − 40` after Nuka. Nuka's feet are at `groundY − 4` and the front row at
`groundY − 18`, so he stands 14 px **in front** of that row. He is drawn behind it only because he usually stands to its left.
During the slide he moves through the front row, and any drift still there covers him. The screenshot on iPhone 393×852 at the
far end shows only his ear behind the spare blue drift. `node tests/sim/slide_cover.js --n 8` (bot0.8, ages 3 / 4 / 6,
384 slides per viewport) measures the share of the slide pose that is behind front-row heaps:

| viewport | mean, whole slide | at the far end (the pause pose) | far-end frames > 50 % hidden |
|---|---|---|---|
| iPhone portrait 720×1556 | 23.7 % | **36.2 %** | **29.0 %** |
| iPhone landscape | 12.8 % | 20.2 % | 14.4 % |
| iPad landscape / portrait / Air | 11.6–13.8 % | 15.5–17.6 % | 0–3.1 % |

**Change (render.js, code).** While sliding, draw Nuka after the front drifts. He is physically in front of them, so this is
also the correct depth:
```js
const sliding = w.bun && w.bun.slide > 0;
for (const m of ms) if (m.y < bunY - 40) this._mound(m, a, night);
this._seal(w.seal, a);
if (!sliding) this._bun(w.bun, L.bun);
for (const m of ms) if (!(m.y < bunY - 40)) this._mound(m, a, night);
if (sliding) this._bun(w.bun, L.bun);
```
With this the slide is 0 % hidden by construction; it is a render-only change. Nothing else draws between those two loops that
should sit above him. The open-hole "risen things" (`_riseOver`) are drawn after this anyway. The other option, sinking the
spare drifts before the slide, would change the timing of the round end, so it is not proposed.

### P2-2 — A child who taps just ABOVE the drift (the sky over the hat) gets hints and assists instead of a dig
In the **above** model, about 65 % of taps land 50–140 px over the peeking thing. With `thingTopPad: 40` those taps are
empty-snow taps:
- **hints in 54 % of rounds** and **assists in 24 %**;
- chapters **+13.6 s at age 4** compared with typical.

Children aim at what they see, and the pompom often sits near the top of the drift's area.

**Change.** **`thingTopPad: 40 → 80`** **plus a clamp**: the thing box top must never reach above the aurora ribbon. In
`World.prototype._moundAt`:
```js
var S = this.layout.shelf, top = Math.max(m.thingY - m.size - cfg.thingTopPad, S.y + S.h + 4);
```
The clamp is required. Measured over bot sessions on all 5 viewports × ages 3–7, the smallest gap between the
"thing top − 80" line and the ribbon bottom was:

| viewport | gap |
|---|---|
| iPhone landscape | **−37 px** (overlap) |
| iPad portrait | **−32 px** (overlap) |
| iPhone portrait | +27 px |
| iPad landscape | +15 px |
| iPad Air | +42 px |

Without the clamp, a tap on the ribbon over a back-row drift would dig that drift.

**Effect** (`--config '{"thingTopPad":80}' --patch padClamp`, 40 sessions per row):

| model | age | chapter s | hint rounds | assist rounds | wrong / round | seal / tern tapped when tried |
|---|---|---|---|---|---|---|
| above | 3 | 80.9 → **75.2** | 53.7 → 35.3 % | 24.3 → **7.2 %** | 0.21 → 0.29 | 67 / 60 → 57 / 73 % |
| above | 4 | 87.7 → **82.6** | 54.3 → 33.2 % | 24.1 → **5.1 %** | 0.17 → 0.19 | 50 / 58 → 54 / 67 % |
| above | 5 | 96.4 → 96.2 | 61.4 → 38.7 % | 20.4 → 3.9 % | 0.29 → 0.32 | ≈ same |
| high | 3 / 4 | 71.4 / 79.3 → 68.3 / 75.4 | 20.9 / 17.6 → 7.2 / 4.7 % | ≈ 1 → 0 % | ≈ same | ≈ same |
| typical | 3–5 | unchanged (67.5 / 74.1 / 84.6) | unchanged | 0 | unchanged | 55–62 / 63–67 % unchanged |
| spammer | 3–5 | unchanged | unchanged | 6.0–14.8 → 5.2–10.6 % | unchanged | — |

`thingTopPad: 70` gave about two thirds of the gain (above, age 4: 84.2 s, assists 11 %), so 80 is the recommended value.

The above model's wrong digs rise slightly (+0.02 to +0.08 per round). This is expected: its taps used to fall on empty snow and
now dig a drift, and its wrong rate becomes the same as a typical child's. The random tapper loses some stars for the same reason
(age 6: 56 → 49 % 3★). It finishes in the same time, and stars are never below 1.

### P2-3 — A gentle, slow toddler "rub" (tiny wiggles, finger down > 1 s) does nothing at all
A press that stays under `tapMovePx` and never reaches a stroke is a "hold" if it lasts more than `tapTime` 1.0 s. A hold is
`soft`: a 3 px wobble, no dig and no word. A 3-year-old who tries to rub gently, or presses and holds the drift, gets **0.36–0.65
"nothing happened" presses per round** (shortRub; slow3 0.13–0.35). The shortRub chapter is **95.8 / 100.2 s** at age 3 / 4,
with a p90 of 113 / 119 s.

**Change (world.js `pointerUp`, code).** A press that started on a drift, moved less than `tapMovePx`, did not rub and lasted
more than `tapTime` counts as a tap on that drift. A drag of 64 px or more is still `soft`. It is a SIM-ONLY patch
`--patch holdDigs` in `hs_snow.js`:
```js
if (p.id && !p.rubbed && mv < this._tapMove() && this.time - p.t > this.cfg.tapTime) {
  var m = this.moundById(p.id); if (m && m.pop >= 0.3) { var c = this._hitC(m); return this.tap(c.x, c.y); }
}
```
**Effect** (40 sessions per row):

| model | age | chapter s (p90) | soft / round | 3★ % | wrong / round |
|---|---|---|---|---|---|
| shortRub | 3 | 95.8 (113.1) → **90.9 (103.1)** | 0.36 → 0.02 | 54 → 59 | 0.52 → 0.46 |
| shortRub | 4 | 100.2 (119.4) → **97.8 (111.4)** | 0.46 → 0.03 | 67 → 66 | 0.41 → 0.46 |
| slow3 | 3 / 4 | 90.3 / 97.7 → 88.3 / 95.8 | 0.13 / 0.21 → 0.03 / 0.05 | ≈ same | ≈ same |
| typical / spammer | 3 / 4 | unchanged | ≈ 0 | unchanged | unchanged |

Optional extra (P3): **`rubMinSeg: 26 → 16`, `rubStroke: 70 → 56`** turns more tiny wiggles into real rub strokes. With
holdDigs, shortRub age 3 drops 90.9 → 88.5 s and rub share rises 46 → 66 %. Typical, twoDrift and emptyRub are unchanged
(± 0.5 s, same wrong rate), and normal taps are never split into strokes: a typical child's tap wobble stays below the stroke
threshold.

### P2-4 — The `slide` and `fly` lines are never spoken on a device
main.js speaks `slide` only `if (!NK.Voice.isSpeaking())`. The `slide` event comes 0.35 s after `roundDone`, and at that moment
the found line or the round-end praise is always being spoken. Model: **0 % of slides got a line** in 3 400 sessions.
- `fly` has the same gate at `hop`, 0.32–0.5 s after `found`, whose line was just spoken with interrupt: **0.00–0.20 fly lines
  per session** (of 4 possible).
- The speed-8 browser log hides this because voice is off there and `isSpeaking()` is always false.

**Change (main.js, code).** Gate on *nothing waiting*, not *nothing speaking*. Both lines are plain queued, non-priority lines,
so voice.js drops them when stale.
- `fly`: only for a round's last find step, so no prompt follows:
  ```js
  case 'hop': … const s = world.stepInfo, last = world.cur && world.step >= world.cur.steps.length - 1 && s && s.mode === 'find';
    if (!flySaid && last && !pendingPrompt && !(NK.Voice.queueLength && NK.Voice.queueLength())) { flySaid = true; speak(T('fly')); }
  ```
- `slide`: `if (!(NK.Voice.queueLength && NK.Voice.queueLength()) && Math.random() < 0.5) speak(T('slide'));`
- This needs a 1-line `NK.Voice.queueLength = () => queue.length` in voice.js.

**Effect** (`--sv '{"flyQ":1}'` / `'{"slideQ":1}'`, 40 sessions per row, typical, taponly and slow3 at ages 3–4):

| variant | fly lines heard / session | slide line heard (% of slides) | mean prompt delay | prompts heard fully |
|---|---|---|---|---|
| now | 0.00–0.13 | 0 % | 0.26–0.31 s | 96.1–100 % |
| flyQ | **3–4** (one per chapter) | 0 % | +0.08–0.10 s | ±1 pt |
| slideQ | 0.00–0.13 | **15–24 %** (≈ 2.5–4 per session) | +0.03 s | ±0.5 pt |

Both are cheap, and the slide line is heard during the slide itself. If the team does not want the extra talk (talk time goes
from 59–61 % to 62–64 % of the session), delete the dead `fly` / `slide` code instead, so nobody believes it plays.

### P3-1 — The "tap-teach" rub line in `case 'dig'` can never fire
`rubDemo` sets `rubTaught = true` in the very first round, so the second-tap teaching line in `case 'dig'` is dead code.

- **Option 1, an independent flag.** Speak `t('rub')` on the 2nd tap dig if the child never rubbed (`--sv '{"tapTeach":1}'`).
  It fires in 85–100 % of tap-only sessions, but it is heard fully only +0.07 to +0.25 times per session, because the found line
  interrupts it about 2 s later.
- **Option 2 (recommended), a second visual demo.** If the child has not rubbed by the first find ask of chapter 1, round 2,
  replay the rub demo once (`--patch rubDemo2` implements it). The hand does not need the voice. Discoverability itself cannot be
  measured by the models, so this rests on judgement.

### P3-2 — Rubbing that starts on empty snow sometimes digs the neighbour
**emptyRub:** 8–17 % of rubs that start on empty snow bind to a different drift than the one the child meant (47 of 430 at age
4). Its wrong rate is only +0.03 to +0.05 per round over typical, and the chapter length is the same. A "bind to the nearest
drift of the press point" patch (`--patch nearBind`) did not change this (31 vs 38 of 313 vs 322 at age 4), so **no change**.
**twoDrift** (swings across both drifts): the binding holds, with 0 busy events and the same wrong rate as rubber. This works as
designed.

### P3-3 — CONFIG values confirmed (no change)
- `autoScoop` 0.85: see §2.2.
- `assistAfter` 4: random tapper and sandOnly rounds max out at 78 / 88 s, 0 over 120 s.
- `cheerTime` 2.2: the slide takes 2.10 s and finishes 0.1 s before the clear.
- `floatTime` 0.9: one tap → the hat flies after 3.18 s at age 4 on the real page (speed 1).
- `hintAfterMisses` 2, `idleTime` 12: the absent child gets nudges at 15.5 / 33.5 / 60.5 / 90.5 / 120.5 / 150.5 s, the
  same as before.

### P3-4 — `CLAUDE.md` of this game still describes Bun's Dino Dig
`polar-bear-snow-dig/CLAUDE.md` still has the namespace `DD`, the storage prefix `dd:`, the helper "Bun", hatch, mole and
pterosaur. A future agent reading it first would be misled. Update it to the `NK` / `nk:` / Nuka / seal / tern facts in
`docs/DESIGN.md`.

---

## 4. The recommended bundle, re-simulated across every model (30 sessions per model × age, `snow_base30.md` → `snow_rec.md`)
```
hs_snow.js --n 30 --tag rec --config '{"thingTopPad":80,"rubDemoDelay":2.0,"rubDemoTime":4.0}' \
  --patch padClamp,holdDigs --sv '{"rubPri":1,"noWeather0":1,"flyQ":1,"slideQ":1}'
```

| model | age | chapter s | chapter p90 | session p90 min | max round s | > 120 s | hint rounds % | assist rounds % | soft / round | rub line heard % | first prompt delay s | prompts heard fully % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 67.1 → 66.7 | 78.7 → 75.3 | 4.9 → 4.9 | 31.6 → 34.5 | 0 → 0 | 3.3 → 4.8 | 0 → 0 | 0.05 → 0.01 | 53 → 87 | 1.25 → 0 | 96.3 → 96.2 |
| typical | 4 | 74.1 → 73.7 | 88.7 → 89.2 | 5.5 → 5.4 | 41.1 → 33.5 | 0 → 0 | 3.8 → 4.2 | 0 → 0 | 0.05 → 0.02 | 57 → 83 | 1.25 → 0 | 96.9 → 96.3 |
| typical | 7 | 78.9 → 78.9 | 88.1 → 86.7 | 5.7 → 5.8 | 34.8 → 34.8 | 0 → 0 | 0.6 → 1.0 | 0 → 0 | 0.04 → 0.01 | 17 → 47 | 1.30 → 0 | 92.2 → 91.2 |
| taponly | 3 / 4 | 68.7 / 76.1 → 67.7 / 75.5 | | 5.1 / 5.6 → 5.0 / 5.6 | 46.8 / 47.2 → 34.5 / 47.2 | 0 → 0 | ≈ same | 0 | 0.08 → 0.01 | 60 / 63 → 90 / 93 | 1.25 → 0 | ≈ same |
| slow3 | 3 / 4 | 91.1 / 97.3 → 88.7 / 96.3 | 107.7 / 118.6 → 102.1 / 111.0 | 6.8 / 7.1 → 6.3 / 7.3 | 61 / 61 → 44 / 66 | 0 → 0 | 15.7 / 13.0 → 12.7 / 12.3 | ≈ 0 | 0.15 / 0.20 → 0.03 / 0.05 | 93 / 97 → 100 | 1.25 → 0 | ≈ same |
| above | 3 / 4 | 80.8 / 87.9 → **73.6 / 82.2** | 93.8 / 105.8 → 86.3 / 100.7 | 5.9 / 6.3 → 5.5 / 6.0 | 46 / 67 → 41 / 64 | 0 → 0 | 53 / 57 → **32 / 32** | 24 / 26 → **6.5 / 7.1** | ≈ same | 80 / 83 → 97 / 93 | 1.25 → 0 | ≈ same |
| high | 3 / 4 | 71.4 / 79.3 → 67.3 / 75.1 | 84.9 / 97.3 → 78.8 / 91.6 | 5.3 / 5.7 → 4.9 / 5.5 | 29 / 51 → 31 / 33 | 0 → 0 | 21 / 18 → **5.4 / 4.8** | 1.0 / 1.3 → 0 | ≈ same | 60 / 63 → 83 / 77 | 1.25 → 0 | 97 → 95 |
| shortRub | 3 / 4 | 95.6 / 100.9 → **90.7 / 97.4** | 113.1 / 120.4 → 102.2 / 113.6 | 7.2 / 7.5 → 6.5 / 7.2 | 68 / 78 → 45 / 75 | 0 → 0 | 13.5 / 16.0 → 9.6 / 15.9 | 0 | **0.36 / 0.47 → 0.02 / 0.03** | 100 | 1.25 → 0 | ≈ same |
| shortRub | 6 / 7 | 123.5 / 121.7 → 113.7 / 115.9 | 154.2 / 149.8 → 138.0 / 138.1 | 9.3 / 9.4 → **8.6 / 8.6** | 109 / 106 → 103 / 80 | 0 → 0 | ≈ same | ≈ 0 | 0.60 / 0.65 → 0.04 | 73 / 77 → 100 | 1.70 / 1.30 → 0 | ≈ same |
| tapper | 3 / 6 | 85.8 / 105.0 → 85.3 / 105.5 | ≈ same | 6.2 / 7.9 → 6.1 / 7.7 | ≈ same | 0 → 0 | ≈ same | 77 / 82 → 71 / 78 | ≈ same | 73 / 53 → 83 / 83 | 1.25 → 0 | ≈ same (3★ 71 / 56 → 67 / 49: taps over drifts now dig) |
| spammer / twoDrift / emptyRub / sandOnly / perfect / bot0.8 | 3–7 | ± 1 s | ± 3 s | ± 0.1 | — | 0 → 0 | ≈ same | ≈ same | ≈ same | ↑ | → 0 | − 0 to 3 pt (the queued fly / slide lines) |

Every row, with stars, wrong digs, fly and slide per model × age, is in `tests/sim/out/snow_rec.md` (after) and
`snow_base30.md` (before). Across 2 550 bundle sessions there were 0 failures, 0 NaN, 0 stuck states and 0 rounds over 120 s.

## 5. Playing it as a 4-year-old (judgement, speed-1 screenshots on iPhone portrait and iPad landscape)
- **Is rubbing discoverable?** Mostly yes, once P1-1 is fixed.
  - The ghost hand is big and clear over the right drift: a pointing finger swishing ±46 px, with snow flicks.
  - The gesture is natural for a toddler; "rub the snow" maps to real play.
  - Today the hand stops before Nuka says "Rub the snow!", always in Vietnamese. A 4-year-old copies what moves *while* they hear
    it.
  - The demo is shown once per session, on the warm-up round, and it gives away that round's answer, which is fine for a warm-up.
  - A child who keeps tapping never sees it again (P3-1, option 2 recommended).
- **Is the tap fallback fast enough?** Yes. One tap and the paw keeps scooping: ≈ 2.0 s to the reveal at 3 scoops, 1.33 s at age 3.
  - The flying snow and the "shff" sound make the wait feel active. Tapping along shortens it to 0.8–1.2 s.
  - Rubbing is visibly faster (0.7–0.8 s), which gives the right "rubbing is better" feeling without punishing tappers.
- **Is the belly-slide too long or too short?** The length is right: 2.1 s, about 320–420 px, with friction easing out and back.
  - It is a joyful, readable reward and does not delay the next round. There are 16 slides per session, so a second cheer
    variant every few rounds would keep it fresh; that needs art, so it is only a nice-to-have.
  - Its real problem is P2-1: on an iPhone held upright Nuka slides *behind* the spare drifts and pauses with only his ear
    showing.
- **Are the finds floating to the aurora satisfying?** Yes. The 0.9 s ease with sway and the sparkle trail (screenshot: a column
  of glowing dots from the hole to the ribbon) look good.
  - The ribbon brightens per find and the bubble fades while the find passes. On iPhone portrait the hat lands at the left end
    of the ribbon, under the faded bubble: visible, but the visual team may want the first slot farther right in portrait.
- **Anything boring or confusing?**
  - (a) A tap just *above* a drift "does nothing" (a dust puff), and after two of those the hint hand comes (P2-2).
  - (b) A slow, gentle rub with the finger down too long also does nothing (P2-3).
  - (c) Nuka never says "Wheee!" on the slide or "Up to the northern lights!" on the float (P2-4); he is quieter at exactly the
    fun moments.
  - (d) A chapter's fixed non-play time (cheer 2.2 s + clear 0.7 s + drifts popping up ≥ 1.0 s ≈ 3.9 s per round) is about 30 %
    of a toddler round. That is acceptable because it is all celebration, but do not add more.
  - Pacing is good: typical 3–4-year-olds have no round over 41 s, and the p90 round is 17–20 s.

## 6. Files (all under `tests/sim/`, report-only; `tests/sim/out/*.json` is git-ignored)
- **`hs_snow.js` (new):** the rub-focused high-speed playtest. It contains:
  - the child models above, twoDrift, emptyRub, slowTap, slowRub and shortRub;
  - per-dig speed by tap alone / tap + taps along / rub;
  - empty-snow binding stats;
  - the speech model extended with the rubDemo / tap-teach / fly / slide lines;
  - SIM-ONLY proposal patches `--patch padClamp | holdDigs | nearBind | rubDemo2`;
  - speech proposals `--sv '{"rubPri","noWeather0","flyQ","slideQ","tapTeach"}'`.

  Output goes to `out/snow_<tag>.md` and `.json`.
- **`hs_browser_snow.js` (new):** the real page with the bot (`?speed=N&bot=1&autostart=1&mute=1`). It hooks `World._emit`
  and `Voice.say` before the game scripts run; `--shots` saves rub-demo, float and slide screenshots at speed 1. Line
  classification uses the EN key arrays only, so VI sessions show 0 rub, slide and fly lines there, which is a classifier
  limit; see `hs_voicelog.js` for VI.
- **`slide_cover.js` (new):** how much of the belly-slide pose is behind front-row drifts, per viewport.
- **Kept outputs:**
  - `out/snow_base.md` (3 400 sessions), `out/snow_base30.md` and `out/snow_rec.md` (2 × 2 550);
  - `out/hs_hs23.md` (existing-harness regression), `out/hs_browser_snow.json`, `out/voicelog.json`.
