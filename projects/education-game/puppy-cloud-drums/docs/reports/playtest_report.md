# Bibi's Cloud Drums — high-speed playtest report (2026-11-21)

Playtester: high-speed play agent. Report-only: no game code (`game/js`) was changed. Tools that were changed: `tests/sim/*`.

## What was run
| run | what | size |
|---|---|---|
| `hs_playtest.js --n 60` (tag `base`) | all 14 models × ages 3–7, 5 viewports, EN/VI, 1/30 s frames | 3 380 sessions |
| `hs_playtest.js --n 120 --ages 3,4` (tag `A_base`) | typical, slow3, drummer, stopper, swiper, spammer | 1 440 sessions |
| A/B runs with `--config` / `--proto` (tags `B_*`, `C_*`, `D_*`, `E_*`, `F_*`, `G_*`, `H_*`) | each 60–120 sessions per model × age | ≈ 4 000 sessions |
| `hs_browser.js --sessions 2 --ages 3,4,5` | the real page in Playwright, `?speed=8&bot=1&mute=1` (iPad landscape + iPhone portrait) | 6 sessions |
| `hs_voiceflow.js --ages 4 --langs en,vi --minutes 5.5` + `--variant drummer` | the real page at real speed with a fake iOS TTS (300 ms + 75 ms × chars / rate, Safari-style cancel) and an in-page 4-year-old | 3 × 5–5.5 min |

**New in `tests/sim/`** (all report-only):
- `lib.js`: models **`drummer`** ("taps fast / drums wildly": in a beat round it drums bursts of 4–10 beats 0.09–0.3 s apart from 0.2–1 s after the
  ask, through the gap and the next ask, never waits for the number), **`stopper`** ("stops halfway through a count": p 0.7 stops after 1…n−1 beats,
  resumes only when Bibi speaks to it, p 0.75 per nudge), **`frozen`** (stops mid-count, never resumes: measures the nudge cadence), **`eager`**
  (typical, but acts while Bibi is still talking). `applyProto()` = **sim-only prototypes** of changes that have no CONFIG key yet (`--proto
  '{"beatListen":0.9}'`).
- `hs_playtest.js`: a **beat-mode table** (ask → done s, % of counts finished before the prompt could be heard, counted beats during the prompt,
  ignored taps, over-taps after the count, nudge %, first nudge after the last beat, hint / assist %), **answer repeats** (same answer as the
  previous ask, round opens with the last answer), `--prompt s` (how long the prompt / the number takes to be heard), `--proto`.
- `hs_voiceflow.js`: the in-page child now **beats the big drum** (it used to tap once per beat step and then wait for ever), `--variant drummer`,
  and **flow checks**: count words in order / never a late "Two!" after "Three!", praise lines per round, every line spoken after the cymbal;
  the old bell wording ("chuông", "One bell") removed. `hs_browser.js` has no beam / chime references (unchanged).

Health (every run): **0 failed sessions, 0 stuck states, 0 NaN, 0 standing drums off screen, 0 rounds > 120 s, 0 "2 wrong rings without a
hint"**, max hop 30 px. Real page: 0 page errors; session times match the headless `bot0.8` within 0.3 min (age 3: 3.3–3.4 min, age 4: 4.5–4.8,
age 5: 4.8–5.1).

## Findings (baseline numbers)

### Durations, stars, help
| model | age | session min (p90) | chapter s mean [p90] | round s | 3★ / 2★ / 1★ % | rounds with a hint % | assisted rounds % |
|---|---|---|---|---|---|---|---|
| typical | 3 | 6.0 (6.3) | 86.3 [94.9] | 18.7 | 65 / 24 / 11 | 12.0 | 1.2 |
| typical | 4 | 6.3 (6.6) | 91.4 [99.7] | 21.2 | 75 / 18 / 7 | 7.1 | 0.7 |
| typical | 5–7 | 5.9–6.4 (≤ 6.6) | 84.5–92.1 [≤ 100] | 18–22 | 73–81 / 16–19 / 3–8 | 2–6 | 0 |
| slow3 | 3 / 4 | 6.9 / 7.0 (7.4 / 7.5) | 100.2 / 100.9 [116.7 / 116.2] | 30 / 33 | 52–57 / 21–27 / 21 | 26 | 6.7 |
| stopper | 4 | 6.5 (6.8) | 93.6 [103.3] | 22.5 | 73 / 20 / 7 | 12.0 | 0.7 |
| drummer | 4 | 5.2 (5.4) | 74.3 [85.0] | 15.5 | 73 / 19 / 7 | 6.7 | 0.6 |
| swiper / tapper / spammer | 4 | 5.4–6.4 (≤ 6.8) | 77–93 | 16–26 | 14–45 / … | 45–92 | 38–83 |

- **Session** ≤ 8 min for every model (worst p90 7.5 min, slow3). **Chapters**: a typical 3–4-year-old is inside 60–100 s (86–91 s, p90 95–100);
  the slow 3-year-old sits on the edge (mean 100–101 s, p90 116–117 s) — fine for the session limit, see P3-3.
- **The count chapter is the longest for a 4-year-old**: typical 91.5 s (p90 104.2, 65 % of these chapters end after 3 rounds), slow3 102.7 s
  (p90 117.7), stopper 99.9 s (p90 114.5).
- Stars are well spread for real children; the count chapter is 100 % 3★ by design (no misses in beat mode). Hints / assists are rare for
  engaged children and do their job for the non-aiming ones (swiper / tapper / spammer always finish, no round > 120 s).
- **Idle** (absent child): nudges at 12 → 18 → 27 → 30 → 30 s after the ask; main.js speaks ≤ 4 and pauses after the 5th — kind and not naggy.
- **Song**: per-round overhead (song + float away) 4.6–4.9 s, the wave itself ≈ 1–2 s. Auto-played songs: typical 11 %, slow3 **39–41 %**
  (`songWait` 4 s; in Vietnamese the long song ask alone takes 4.7 s, so the wave can start before Bibi finishes asking).
- **Surprises**: exactly 1 per chapter (25 % of rounds), appear 3.7 s after the first ask in rounds that last ≈ 20 s of play; typical children
  tap 60–70 % of them, drummers 60 %.
- **Repeats**: never the same set twice in a chapter (0 %); age 4: the same answer as the previous ask 0 %, a round opening with the last answer 0 %.
  Age 3 **size** topic: 24 % of size rounds open with the answer asked last (allowed by the 2-in-a-row rule for 2-answer topics; seen in 73 of 80
  probe sessions). Beat numbers: n = 1 26 %, 2 23 %, 3 19 %, 4 15 %, 5 17 % of beat asks — **49 % are "once" or "two times"**, and 40 % of beat
  rounds open with "once".

### Beat mode (counting, age 4) — the main finding
| model | ask → done s (p90) | count finished before the 2.5 s prompt ended % | counted beats during the prompt % | ignored taps % | over-taps after the count / step | steps with a nudge % | 1st nudge after the last beat s | steps with a hint % |
|---|---|---|---|---|---|---|---|---|
| typical | 6.4 (9.6) | 0 | 0 | 0.4 | 0 | 5.4 | 4.2 | 0.2 |
| slow3 | 11.2 (17.7) | 0 | 0 | 0.1 | 0 | 20.5 | 4.4 | 3.8 |
| stopper | 9.5 (16.7) | 0 | 0 | 0 | 0 | 49.4 (0.61 nudges / step) | 5.0 | 11.1 |
| **drummer** | **1.3 (2.2)** | **94.5** | **97.3** | 2.4 | **4.4** | 0 | – | 0 |
| spammer | 5.0 (5.9) | 0 | 0 | 0 | 5.7 | 0 | – | 19.5 (assist 5.8) |

- **Wild drummers do not over-count and are not frustrated** — `beatGap` 0.2 s ignores only 2.4 % of their taps and every tap booms; extra beats
  after the count just boom (4.4 per step). **But they never hear the number**: 94.5 % of their counts are complete before Bibi has finished
  "Beat the big drum three times!", because beats count from the moment of the ask and every count word **interrupts the prompt**. Real page
  (voice flow, drummer): 18 of 32 prompts cut, e.g. *"One more! Let's count! Beat the big drum four times!"* cut after **0.1 s** by
  "One! Two! Three! Four! Super drumming!" (count words 0.2 s each); one beat prompt was never spoken at all. The number is the LAST word of the
  prompt in both languages ("…three times!", "…ba cái nhé!"), so even a 1 s head start loses it. For a 4-year-old this turns counting into
  random drumming with a happy ending.
- **A child who stops is nudged kindly and at the right time**: "Two! One more!" 4.2–5.0 s after the last beat, then 6, 9, 13.5 … s (frozen child:
  4.2, 10.2, 19.2, 32.7, 52.9, 82.9 s after the last beat); the 2nd nudge also shows the ghost hand (11 % of stopper steps). 0.61 nudges per
  stopped step → most children resume after one nudge.
- Voice flow (typical child, EN / VI): count words always in order, **0 late count words, 0 "Two!" after "Three!"** within a step; but 8 / 11
  (EN) and 5 / 8 (VI) count words are cut by the next beat (each heard 0.3–0.5 s) — by design ("never queue counts"), acceptable.

### Voice flow (real page, age 4, real speed)
| check | EN | VI | drummer EN |
|---|---|---|---|
| praise lines per round (want exactly 1) | 12 / 12 rounds ✔ | 11 / 11 ✔ | 12 / 13 (1 round none) |
| songDone line (only after a chapter's last song) | 0 ✔ | 0 ✔ | 0 ✔ |
| **lines spoken after the cymbal** (want none) | **6 in 12 rounds** | **4 in 11** | 3 |
| prompts cut (mostly by the child's own correct tap) | 7 / 31 | 8 / 27 | 18 / 32 |
| Bibi talking, % of play time (lines / min) | **73 %** (20.6) | **80 %** (19.6) | 77 % (25.2) |

- **The song ask is spoken after the song.** `songAsk` is queued behind the praise ("What a music star!" ≈ 2 s); a child who taps the drums
  during the praise plays the whole wave + cymbal, and *then* Bibi says "Song time! Tap or swipe the drums!" / "Giờ mình cùng chơi bài hát nhé,
  bé gõ các trống nào!" while the drums float away and the next round starts. Seen in 50 % (EN) / 36 % (VI) of rounds.
- Bibi talks 73–80 % of the time; per round the praise + song ask alone are 3.3–6.8 s of speech for a 1–2 s wave.

### Things that are fine (no change)
Round variety inside a chapter (never the same set, surprise in one round, the drum count grows from the warm-up), the hint / assist ladder,
stars spread, idle cadence, song wave length, gesture fairness (taps judged on the aimed drum 99.4–100 %, beats 99.5–100 %), layouts (0 off screen).

## Prioritized changes (with measured effect)

### P1
**P1-1 — Let the child hear the number before beats count** (fixes "count done before the number was said").
- `game/js/i18n.js` `p.beat` (EN + VI): put the number FIRST and drop the step prefixes for beat asks: "Beat the big drum three times!" →
  **"Three! Beat the big drum three times!"**; "Bé gõ trống to ba cái nhé!" → **"Ba cái nhé! Bé gõ trống to ba cái nhé!"** (n = 1: "Once! Beat the
  big drum once!" / "Một cái nhé! …"); no "Next one! / One more! / Let's count!" in front of a beat ask.
- `game/js/world.js` CONFIG new key **`beatListen: 0.9`** (s after a beat ask): a beat on the big drum inside it booms as a brush (`ring {judged:
  false, brush: true, beat: true}`), no `count`, no count word; nudge / hint timers unchanged. (Better still: main.js opens the count when the
  number word has been spoken; 0.9 s is the world-side fallback.)
- Measured (`--proto '{"beatListen":0.9}' --prompt 0.9`, n = 120, age 4):

| model | counts finished before the number was heard % | counted beats before the number % | ignored taps % | ask → done s | chapter s |
|---|---|---|---|---|---|
| drummer | 32.2 → **0** | 45.1 → **0** | 2.4 → 36.4 (they still boom) | 1.3 → 1.8 | 74.3 → 76.1 |
| eager / typical / slow3 / stopper | 0 → 0 | 0 → 0 | unchanged (0.1–0.4) | unchanged | unchanged |

  Rejected alternatives (measured): `beatGap` 0.2 → 0.3: drummer still 84.2 % done before the prompt ended, typical ignored taps 0.4 → 2.3 %.
  A long gate with the current number-last prompt (`beatListen` 2.5): drummer 94.5 → 0 % but an eager child would get 31 % of its beats ignored
  (2.0 s gate) — too blunt.

**P1-2 — Never say the song ask after the song** (`game/js/main.js`, `songAsk` / `songNote` handlers).
- On `songNote` with `i === 0` (the wave started) **drop the queued song line** if it has not started yet (and never speak a `song` /
  `songShort` line once `cymbal` has fired); better: speak ONE line at `songAsk` — the praise and the ask merged ("Beautiful drumming! Now our
  song!" / "Hay quá! Mình chơi nhạc nào!") — instead of praise + ask.
- Expected effect (voice-flow check `afterCymbal`): lines after the cymbal 6 / 12 (EN) and 4 / 11 (VI) rounds → 0; ≈ 2–4.7 s less speech per
  round (Bibi talking 73–80 % → ≈ 60–65 %). Not simulable headless (main.js); re-check with `node tests/sim/hs_voiceflow.js --ages 4`.

### P2
**P2-1 — `game/js/world.js` CONFIG `songWait` 4 → 6** (s before the auto wave). The VI song ask is 4.7 s long, so at 4 s the wave can start before
Bibi finishes asking. Measured (n = 120): slow3 auto-played songs 41.1 → 28.9 % (age 3) and 38.7 → 29.3 % (age 4) — the model's floor is 30 %
(children who never tap); typical 10.7 → 10.8 %; session +0.0 / +0.08 min, chapter +0.1–1.2 s.

**P2-2 — Shorter song-ask texts** (`game/js/i18n.js` `song`): VI "Giờ mình cùng chơi bài hát nhé, bé gõ các trống nào!" (4.7 s) → "Mình chơi
nhạc nào! Bé gõ trống nhé!" (≈ 2.5 s); EN "Song time! Tap or swipe the drums!" (3.1 s) is fine. Use the long ask once per **session**, not per
chapter (`songChapter` in main.js). Effect: ≈ 2 s less speech in 1 of 4 rounds; together with P1-2 the ask ends before `songWait`.

### P3
- **P3-1 Beat numbers** (`game/js/content.js`, beat steps after the warm-up): draw n from **2–5** (keep n = 1 for the warm-up only) and require one
  n ≥ 4. Now 49 % of beat asks are n ≤ 2 and 40 % of beat rounds open with "once"; estimate +1–1.5 s per affected step, count chapter ≈ +3 s.
- **P3-2 Size topic (age 3)**: 24 % of size rounds open with the answer asked last; consider shuffling which of big / small is asked first per
  round independently of the last answer only when the previous round did NOT end with it twice — or accept (it is allowed by the 2-in-a-row rule).
- **P3-3 `chapterTimeLimit` 75 → 70** only if the slow 3-year-old's chapter must stay ≤ 100 s: measured slow3 chapter 100.2 → 95.8 s (p90 116.7 →
  111.5), session 6.9 → 6.6 min; cost: typical age-4 chapters ending after 3 rounds 26 → 51 %. (65 s: slow3 92 s / p90 108, but 83 % of typical
  age-4 chapters lose a round.) Recommendation: keep 75 (session p90 7.5 min ≤ 8).
- **P3-4 `beatNudge` keep 4.** 3 s measured: stopper step 9.5 → 9.0 s (p90 16.7 → 14.3) but typical children (who just pause) are nudged in
  5.4 → 8.3 % of steps.
- **P3-5 `beatGap` keep 0.2** (0.3 measured: worse for typical, no real gain for drummers — see P1-1).
- **P3-6 Docs**: the game's `CLAUDE.md` still describes the old world (Bibi the little monkey, a mountain campsite, hanging drums that swing like
  pendulums, bells, beam, "Khỉ Bibi") — update it to the puppy / cloud-drum game.

## How to reproduce
```
node tests/sim/hs_playtest.js --n 120 --ages 4 --models typical,slow3,drummer,stopper,eager --tag base4
node tests/sim/hs_playtest.js --n 120 --ages 4 --models drummer,eager --prompt 0.9 --proto '{"beatListen":0.9}' --tag p1
node tests/sim/hs_playtest.js --n 120 --ages 3,4 --models typical,slow3 --config '{"songWait":6}' --tag p2
NODE_PATH=$(npm root -g) node tests/sim/hs_voiceflow.js --ages 4 --langs en,vi --minutes 5.5 [--variant drummer]
NODE_PATH=$(npm root -g) node tests/sim/hs_browser.js --sessions 2 --ages 3,4,5
```
(results land in `tests/sim/out/`, git-ignored)
