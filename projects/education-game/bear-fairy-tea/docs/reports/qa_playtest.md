# Moka's Fairy Tea Party — high-speed playtest (QA, 16 Nov 2026)

Report-only for game code: nothing in `game/` was edited. New sims (all in `tests/sim/`, outputs in the git-ignored `tests/sim/out/`):

| sim | what it does | run |
|---|---|---|
| `qa_playtest.js` | Headless world at 1/30 s frames. Each job is a chain of 6 sessions on one world, with topic rotation through `lastTopics`. Runs on 5 viewports, EN/VI alternating. Models touch the game only through `pointerDown/Move/Up` + `talkAnswer`:<br>• `bot0.5/0.8/0.95`: FT.Bot<br>• `kid0.5/0.8/0.95`: the lib.js child of that age, with skill overridden<br>• `rtap`: a tap every 0.15–0.6 s, in every phase, on Moka 20 %, the critter 15 %, a thing 30 %, anywhere else the rest<br>• `slow`: a slow 3-year-old. Waits 4–15 s before each try; on 20 % of tries looks away for 30 s<br>• `nbr`: aim error up to 1.2 × the hit radius<br>• `spam8`: 8 presses/s in every phase, including fall, rise, chime, cheers, clear and Talk<br>• `chaos`: a 2nd `pointerDown` while the 1st finger is still down, random lifts, `cancelDrag`<br>Options: `--config` patches FT.CONFIG. `--patch` monkey-patches a proposed **code** change onto the sim's world only (`assistMinPlay`, `talkLock`, `hardLimit`). | `node tests/sim/qa_playtest.js --n 96 --jobs 2` |
| `qa_voiceflow.js` | Runs the **real** `main.js` + `voice.js` + world / i18n / content / weather / bot in a node vm.<br>• Virtual clock: setTimeout, rAF, `Date.now`, `performance.now`. DOM, render, UI and audio are stubbed.<br>• Fake `speechSynthesis`: an utterance lasts 0.25 s + chars ÷ 14/s (EN) or 12/s (VI), divided by rate 0.9. `cancel()` → `interrupted`, like Safari.<br>So every line choice, protection window, queue (1 + 2), stale rule and interrupt rule is the game's own.<br>Kids: `listener` (waits until Moka is quiet, 25 % eager), `eager` (taps 0.4–1.2 s after every ask), `slow`. Every `say()` is tagged with the world event being handled. | `node tests/sim/qa_voiceflow.js --n 6 --ages 3,4 --langs en,vi` |
| `qa_content.js` | Talk answer position and value spread; odd-slot histogram per thing count (chained the way the world chains rounds); berry-gap difficulty per age × round | `node tests/sim/qa_content.js 2000` |
| `hs_browser.js` (existing) | The live page in Playwright at `?speed=8&bot=1&mute=1` | `node tests/sim/hs_browser.js --sessions 2 --ages 3,4` |

## 1. Headless world, current FT.CONFIG (5 280 sessions; 96 per row; the full table for every age is in `out/qa_base.md`)

Times are game seconds at speed 1. "play" = time the round could be answered. "non-play judged" = right or wrong judgements caused
by a press made while the world was **not** interactive (must be 0).

| model | age | session min med (p90, max) | chapter s med [p10–p90] | cut % | round s med (p90) | play s med (p90) | per round: enter / rise / chime / cheers / clear s | play > 60 s (max s) | ★ 3/2/1 % | hints per round (rounds with a hint %) | solved by assist % | non-play judged |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.5 | 3 | 3.7 (4.0, 4.1) | 51.7 [47.8–57.8] | 0.0 | 11.5 (13.9) | 2.4 (4.3) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (6.0) | 50.7/26.8/22.6 | 0.23 (22.6) | 0.0 | 0 |
| bot0.5 | 4 | 3.8 (4.0, 4.1) | 53.3 [49.0–58.5] | 0.0 | 11.8 (14.2) | 2.3 (4.3) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (6.2) | 50.1/26.6/23.4 | 0.23 (23.4) | 0.0 | 0 |
| bot0.8 | 3 | 3.5 (3.7, 3.9) | 48.4 [45.2–53.1] | 0.0 | 10.4 (12.7) | 1.6 (2.6) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (4.8) | 80.7/16.1/3.1 | 0.03 (3.1) | 0.0 | 0 |
| bot0.8 | 4 | 3.5 (3.8, 4.0) | 49.5 [46.4–54.4] | 0.0 | 10.8 (13.0) | 1.6 (2.6) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (4.7) | 80.3/16.3/3.3 | 0.03 (3.3) | 0.0 | 0 |
| bot0.95 | 3 | 3.4 (3.6, 3.7) | 46.9 [44.2–52.0] | 0.0 | 10.1 (12.3) | 1.4 (1.9) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (3.9) | 95.2/4.6/0.3 | 0.00 (0.3) | 0.0 | 0 |
| bot0.95 | 4 | 3.4 (3.7, 3.7) | 48.2 [45.3–52.8] | 0.0 | 10.4 (12.6) | 1.3 (1.9) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (3.6) | 95.2/4.8/0.0 | 0.00 (0.0) | 0.0 | 0 |
| kid0.5 | 3 | 5.2 (5.6, 5.9) | 73.8 [66.5–83.6] | 0.0 | 15.7 (21.3) | 6.5 (12.5) | 2.28 / 3.30 / 1.13 / 1.10 / 1.20 | 0 (29.3) | 48.6/25.7/25.8 | 0.28 (26.0) | 0.2 | 0 |
| kid0.5 | 4 | 5.1 (5.5, 5.9) | 72.6 [64.8–83.3] | 1.0 | 15.3 (21.1) | 5.8 (11.9) | 2.39 / 3.34 / 1.28 / 1.10 / 1.20 | 0 (32.1) | 50.8/24.9/24.3 | 0.26 (24.6) | 0.1 | 0 |
| kid0.8 | 3 | 4.9 (5.2, 5.5) | 68.2 [63.1–78.4] | 0.0 | 14.6 (18.8) | 5.4 (9.3) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (28.6) | 78.6/17.1/4.2 | 0.04 (4.3) | 0.0 | 0 |
| **kid0.8** | **4** | **4.8 (5.1, 5.4)** | **67.9 [62.3–75.6]** | 0.0 | **14.4 (18.2)** | 4.9 (8.3) | 2.41 / 3.35 / 1.29 / 1.10 / 1.20 | 0 (23.1) | 81.1/15.7/3.3 | 0.04 (3.3) | 0.0 | 0 |
| kid0.8 | 5 | 4.8 (5.1, 5.5) | 66.6 [61.8–76.6] | 0.0 | 14.4 (17.9) | 4.5 (6.2) | 2.51 / 3.56 / 1.44 / 1.10 / 1.20 | 0 (20.8) | 80.1/16.1/3.8 | 0.04 (3.9) | 0.0 | 0 |
| kid0.8 | 6 | 4.8 (5.1, 5.4) | 67.3 [62.5–77.7] | 0.0 | 14.4 (18.3) | 4.5 (5.9) | 2.62 / 3.64 / 1.59 / 1.10 / 1.20 | 0 (18.1) | 77.8/19.1/3.1 | 0.03 (3.1) | 0.0 | 0 |
| kid0.8 | 7 | 4.8 (5.0, 5.1) | 66.1 [62.2–76.2] | 0.0 | 14.2 (17.5) | 4.3 (5.7) | 2.62 / 3.56 / 1.59 / 1.10 / 1.20 | 0 (15.3) | 80.6/15.8/3.6 | 0.04 (3.6) | 0.0 | 0 |
| kid0.95 | 4 | 4.7 (5.0, 5.1) | 66.5 [61.5–74.6] | 0.0 | 14.1 (17.0) | 4.7 (6.6) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (26.4) | 94.5/5.1/0.4 | 0.00 (0.4) | 0.0 | 0 |
| nbr | 3 | 5.2 (5.6, 6.1) | 74.1 [65.9–86.0] | 0.3 | 15.6 (22.2) | 6.3 (12.7) | 2.28 / 3.30 / 1.13 / 1.10 / 1.20 | 0 (29.8) | 70.4/19.7/9.8 | 0.17 (16.5) | 0.8 | 0 |
| nbr | 4 | 5.1 (5.4, 5.8) | 72.0 [64.3–81.6] | 0.5 | 15.1 (20.8) | 5.2 (11.5) | 2.40 / 3.35 / 1.28 / 1.10 / 1.20 | 0 (22.7) | 76.7/17.9/5.5 | 0.13 (11.7) | 0.7 | 0 |
| rtap | 3 | 3.7 (4.0, 4.3) | 52.8 [46.5–59.7] | 0.0 | 11.7 (15.0) | 2.6 (5.3) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (9.4) | 29.6/32.7/37.6 | 0.60 (60.3) | **33.0** | 0 |
| rtap | 4 | 3.9 (4.2, 4.3) | 54.8 [48.5–61.2] | 0.0 | 12.2 (15.6) | 3.0 (5.5) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (9.5) | 27.2/29.0/43.8 | 0.64 (63.7) | **39.1** (age 7: 49.3) | 0 |
| spam8 | 3 | 3.0 (3.3, 3.3) | 41.4 [39.1–46.4] | 0.0 | 9.1 (11.5) | 0.4 (1.1) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (3.9) | 30.6/31.5/37.9 | 0.40 (40.5) | 3.0 | 0 |
| spam8 | 4 | 3.1 (3.4, 3.4) | 43.2 [40.3–47.8] | 0.0 | 9.6 (11.9) | 0.4 (1.2) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (4.5) | 28.0/29.9/42.1 | 0.44 (43.8) | 3.1 (age 7: 7.5) | 0 |
| chaos | 3 | 3.7 (4.0, 4.2) | 52.5 [45.5–58.8] | 0.0 | 11.2 (15.4) | 2.1 (6.0) | 2.29 / 3.30 / 1.14 / 1.10 / 1.20 | 0 (10.9) | 31.3/25.5/43.2 | 0.45 (44.3) | 10.5 | 0 |
| chaos | 4 | 3.9 (4.1, 4.4) | 54.1 [48.2–61.5] | 0.0 | 11.8 (15.9) | 2.2 (6.2) | 2.41 / 3.35 / 1.30 / 1.10 / 1.20 | 0 (10.9) | 26.6/23.2/50.1 | 0.51 (50.8) | 15.8 | 0 |
| **slow** | 3 | **8.7 (10.4, 13.4)** | **119.2 [91.0–179.3]** | 84.9 | 29.3 (66.4) | 20.4 (56.2) | 2.24 / 3.28 / 1.07 / 1.10 / 1.31 | **111 (150.2)** | 61.9/24.0/14.1 | 0.60 (31.7) | 0.6 | 0 |
| **slow** | 4 | **8.6 (10.4, 12.6)** | 119.2 [92.8–171.9] | 87.5 | 30.2 (66.0) | 21.1 (56.9) | 2.26 / 3.33 / 1.09 / 1.10 / 1.31 | 103 (160.5) | 59.2/24.4/16.4 | 0.60 (31.9) | 0.6 | 0 |
| slow | 5–7 | 8.7–8.8 (10.3–10.8) | 120–123 | 86–91 | 29.7–30.8 | 20–21 | — | 100–120 | ≈ 59/24/17 | 0.62–0.65 | 0.3–0.8 | 0 |

Per chapter: intro 2.5 s, Talk 6.1 s (kid) / 1.7 s (spam), levelDone 3.6 s. Every session finished (100 %) for every model.

**Rule checks (every model, every age, 5 280 sessions):**
- 0 judgements from presses outside play: spam / rtap / chaos during fall, rise, chime, cheers, clear, intro and Talk.
- 0 repeated sets and 0 repeated keys within a chapter.
- 0 "same odd slot twice in a row".
- 0 colour clash or pink below age 5, in rounds and in Talk choices.
- 0 stuck rounds (play > 60 s) for every competent model (bot*, kid*, nbr). The longest play was 32 s (kid0.5, age 4).

**Topic rotation (chains of 6 sessions):**
- 8 distinct chapter orders per age.
- The same order as the previous session: 0 %.
- The first chapter alternates between the two easiest topics: 100 %.
- The same topic left out twice in a row: 0 %.
- Each topic appears in 69–89 % of sessions.

**Talk answer position:** uniform within noise (2 000 seeds per age × topic: 30–36 % per position for 3 choices, 48–52 % for 2).
The most common single answer is ≤ 27 %, except `size`, which has only two values.

### Odd slot and count difficulty (`qa_content.js`, 2 000 seeds)
| age | n things | odd slot share % (left → right) | at an end % (uniform) |
|---|---|---|---|
| 3 | 3 / **4** | 33/33/34 · **22/23/22/32** | 66.6 (66.7) · **54.5 (50.0)** |
| 4 | 3 / 4 / **5** | 34/33/33 · 23/25/25/28 · **19/17/18/20/26** | 67.1 · 50.4 · **45.4 (40.0)** |
| 5 | 3 / **4** / 5 | 34/34/33 · **23/21/22/34** · 20/20/19/19/22 | 66.5 · **56.6 (50.0)** · 42.3 |
| 6–7 | 4 / 5 | 25 each · 19–21 each | ≈ uniform |

The rightmost slot is chosen too often (32–34 % instead of 25 %) whenever a round has **more** things than the round before
(age 3 round 4; age 5 round 2). The reason: the previous odd slot is excluded **by index**, and an n − 1-slot round can never
exclude slot n − 1. See P2-1.

| age | round | berry gap 1 / 2 / 3 / ≥ 4 % | max berries mean (max) |
|---|---|---|---|
| 3–4 | warm-up 0 | 0 / 100 / 0 / 0 | 3.5 (4) |
| 3–4 | 1–3 | 0 / 50 / 32 / 18 | 4.3 (5) |
| **5** | **warm-up 0** | **40.7** / 30.7 / 19.5 / 9.1 | 4.0 (5) |
| 5 | 1–3 | 10.3 / 20.3 / 16.9 / 52.4 | 7.2 (10) |
| 6–7 | warm-up 0 | 28–29 / 29–30 / 20–21 / 20–21 | 4.6 (6) |
| 6–7 | 1–3 | 6–7 / 16–18 / 15–16 / 61 | 8.7 (12) |

## 2. Voice flow (real main.js + voice.js; 72 sessions, ages 3–4, EN + VI)

| kid | age | lang | min | ask heard in full before solved % | first ask cut by | count runs heard in full | same line back-to-back | prompt start delay s med (p90, max) | praise full / requested | Moka talking % of session |
|---|---|---|---|---|---|---|---|---|---|---|
| listener | 3 | en | 5.1 | 84.2 | right 12, countRun 3 | 8 / 8 | 0 | 0.00 (0.00, 1.28) | 40 / 40 | 62.8 |
| listener | 3 | vi | 5.4 | 81.1 | right 15, countRun 3 | 8 / 8 | 0 | 0.00 (0.76, 2.02) | 39 / 39 | 71.2 |
| listener | 4 | en | 5.1 | 69.8 | right 19, countRun 10 | 24 / 24 | 0 | 0.00 (0.00, 1.28) | 41 / 41 | 63.2 |
| listener | 4 | vi | 5.6 | 75.0 | right 15, countRun 9 | 24 / 24 | 1 (wrong-hint line) | 0.00 (0.61, 1.86) | 40 / 40 | 71.2 |
| eager | 3–4 | en/vi | 3.9–4.1 | 0–10 | right 68–84 | 64 / 64 | 0 | 0.00 (≤ 0.61, ≤ 1.86) | 208 / 208 | 64–75 |
| slow | 3 | en/vi | 9.7 / 10.9 | **100** | — | 12 / 12 | 4 / 4 (idle line, see P2-4) | 0.00 (≤ 1.09, 2.02) | 63 / 63 | 42–46 |
| slow | 4 | en/vi | 8.4 / 8.6 | **100** | — | 38 / 38 | 5 / 3 | 0.00 (≤ 0.92, 1.86) | 65 / 65 | 48–58 |

- **The ask is heard every round unless the child answers before Moka finishes.** Every prompt that was cut was cut by the
  child's own right answer, which here means the right line or the count run. 100 % of prompts were heard for children who wait.
  No hint, wrong line, idle line, critter line or praise line ever cut a prompt. The hint line queues and is only flushed by the
  child's right answer.
- **The count run is never cut:** 162 / 162 heard in full.
- **The chapter greeting is never stomped:** 64 / 64. The weather line after it was cut 3 / 24 times for the eager child, by
  that child's first right answer.
- **Praise is never skipped once requested:** 100 % spoken in full; the 1.2 s rule never fired. Right lines: 100 % in full.
- **The prompt starts with no delay in the median.** At the p90 it is queued 0.6–1.1 s behind the lantern / praise / weather
  line (VI), at most 2.0 s.
- **Back-to-back repeats:** only the wrong-hint line (the same wrong thing tapped twice, more than 1.5 s apart) and the idle
  nudge (P2-3, P2-4).
- Lines that get cut are all low priority: `critter` / `critterTap` lines by the next right answer, the Talk re-ask by the
  answer, and `great` at levelDone (VI) once in 24 by the next chapter name.

## 3. Browser spot check (live page, `?speed=8&bot=1&mute=1`, bot skill 0.8)

| age | device / lang | session (game s) | chapters s | rounds / cut | stars | console errors |
|---|---|---|---|---|---|---|
| 3 | iPad landscape / EN | 208.6 (3.5 min) | 49.4 / 46.4 / 48.0 / 46.3 | 16 / 0 | 48 | 0 |
| 3 | iPhone portrait / VI | 229.2 (3.8 min) | 53.0 / 52.2 / 53.8 / 54.2 | 16 / 0 | 45 | 0 |
| 4 | iPad landscape / EN | 217.4 (3.6 min) | 50.0 / 48.0 / 54.1 / 47.5 | 16 / 0 | 48 | 0 |
| 4 | iPhone portrait / VI | 238.5 (4.0 min) | 54.9 / 54.7 / 58.5 / 53.6 | 16 / 0 | 46 | 0 |

The headless bot0.8 numbers match: session 3.5 min, chapter 48–50 s [45–54]. Zero page or console errors.

## 4. Game-design evaluation for a 4-year-old

- **Fun:** yes. One tap per round, and the payoff is big and readable every time: the fairy circles the thing, it floats up,
  and a lantern blooms with its colour or thing inside. The friends ring a chime wave, Moka toasts "Cheers!", and fairy dust
  sweeps the table. Other good touches:
  - one critter surprise per chapter;
  - the 4 lanterns are a visible progress bar;
  - Talk time breaks up the rhythm;
  - wrong taps are gentle: a wiggle plus a line that names what was tapped.
  - Stars: 81 % 3★ for a typical 4-year-old, and even a weak one (skill 0.5) gets about half its rounds at 3★. That is a good
    "I can do it" level.
- **Pace:** a typical round is 14.4 s, but only 4.9 s of it belongs to the child. The other 9.5 s is watching:
  - enter 2.4 s,
  - rise 3.35 s,
  - chime 1.3 s,
  - cheers 1.1 s,
  - clear 1.2 s (includes the garland twinkle on round 4).

  Over 16 rounds that is about 2.5 of the 4.8 minutes. The rise is the reward and carries the right line, so keep it. The tail
  after the lantern (chime + cheers + clear ≈ 3.6 s, then 2.4 s of falling before the next question) is what starts to drag by
  round 10. The trims below save ≈ 0.9 s per round without dropping a single line (§2 rerun: right lines and praise still 100 %).
- **Session length:** 4.8 min for a typical 4-year-old (8-min budget), with chapters of 68 s (target 60–100 s). After the trims:
  4.5 min and 63 s. A short session is right for this age.
- **Warm-up:**
  - Ages 3–4: easy enough. Same object in two clash-free colours; very different cookie shapes; 1 v 3 or 2 v 4 berries; 3 things.
  - Ages ≥ 5: the count warm-up allows a berry gap of 1 in 41 % (age 5) and 28 % (ages 6–7) of warm-ups, so it is harder than
    the rounds after it. See P2-2.
- **Difficulty curve:** sensible at every age.
  - Things per round: 3·3·3·4 at age 3, 3·4·4·5 at age 4 (3·3·4·4 in the first and counting chapters), 3·4·5·5 at age 5,
    4·5·5·5 at ages 6–7.
  - Chapters run easiest first.
  - The step from 5 to 10 berries at age 5 is the steepest jump: plates of 7–10 berries, and a gap of 1 allowed below 6 berries.
  - At age 7 the counting chapter is chapter 1. It is the longest chapter (72 s vs 66 s) because each berry is counted on the
    rise, 0.5 s apart.
  - The sim children have a fixed skill, so their stars do not measure intrinsic difficulty.
- **Help for the child who is stuck or slow** is the weak spot.
  - The hint glow lasts 3.2 s. A slow 3-year-old who looks back after 4–15 s has missed it.
  - The idle hint only comes on the 2nd idle, 30 s after the last touch.
  - Result: the slow 3-year-old's session runs 8.6–8.8 min median (p90 10.4, max 13.4), and 100–120 rounds per 96 sessions sit
    in play for more than 60 s.
- **Mashing:** the assist arms after 6 no-progress presses, and a press anywhere on the empty table counts as one. A random
  tapper therefore gets 33–49 % of its rounds solved for it by the assist after about 3 s, faster than a thinking child (4.9 s).
  An 8/s spammer answers the Talk question 0.1 s after it opens, before a word of it is spoken.
- **Voice:** Moka talks for 63 % (EN) and 71–74 % (VI) of the session. That is lively but very chatty. The optional `lantern`
  line could go (it fires in 44 % of rounds), which would leave more room for the chime and cheers sounds.

## 5. Recommended changes (each re-simulated, ages 3–7, 48 sessions per row)

### 5.1 FT.CONFIG
| key | old → new | why |
|---|---|---|
| `chimeGap` | 0.3 → 0.22 | The chime wave of 3–5 friends drags by round 10. chime phase 1.30 → 1.00 s |
| `chimeTail` | 0.4 → 0.25 | Same reason (the last ring still finishes; it lasts 0.5 s) |
| `cheersTime` | 1.1 → 0.85 | The cheers line is short, and only spoken when Moka is quiet anyway |
| `clearTime` | 0.8 → 0.65 | clear phase 1.20 → 1.05 s |
| `poofSweep` | 0.4 → 0.3 | The sweep fits inside the shorter clear |
| `enterStagger` | 0.22 → 0.16 | 5 things no longer trickle in one by one. enter 2.41 → 2.24 s |
| `fairyCircle` | 0.7 → 0.55 | rise 3.35 → 3.16 s. The right line still finishes inside the rise + chime (§2: 100 % in full) |
| `hintTime` | 3.2 → 10 | The glow and hand must still be there when a slow toddler looks back |
| `idleHintFrom` | 2 → 1 | The first idle nudge (12 s) also lights the hint, not only the 2nd (30 s) |
| `assistAfter` | 6 → 4 | Only together with the `assistMinPlay` code change below; a genuinely stuck child gets help sooner |

### 5.2 Code changes (the sim monkey-patches them; the numbers below include them)
1. **`assistMinPlay: 10`** (world `_noProgress`): arm the assist only once the round has been in play for ≥ 10 s.
   - rtap: solved by assist 33–50 % → 7–16 %.
   - spam8: 2–7 % → 0 %.
   - The careful children are unchanged; nbr goes 0.7 → 1.6–4.7 %.
2. **Talk-choice guard** (`ui.openTalk` / main): ignore choice taps until the Talk question has started plus 1 s, or until its
   `onEnd`. Sim proxy `talkLock: 1`: the spammer's answer moves from 0.1 s to 1.1 s; the guard tied to the end of speech is better.
3. **`chapterHardLimit: 110`** (world `_afterClear`): past 110 s in a chapter, go to Talk after ≥ 2 rounds. The 75 s / ≥ 3 rounds
   rule stays, so a typical child is never affected: no typical chapter reaches 110 s.

### 5.3 Before → after (current → all of 5.1 + 5.2)
| model | age | session min med (p90) | chapter s med [p10–p90] | round s med | 3★ % | rounds with a hint % | solved by assist % | play > 60 s rounds |
|---|---|---|---|---|---|---|---|---|
| bot0.8 | 3 | 3.4 (3.7) → 3.2 (3.5) | 47.5 [45.0–53.0] → 44.1 [41.2–49.2] | 10.4 → 9.6 | 81.3 → 81.8 | 2.7 → 2.6 | 0 → 0 | 0 → 0 |
| bot0.8 | 4 | 3.5 (3.8) → 3.2 (3.5) | 49.4 [46.3–54.3] → 45.2 [42.0–50.4] | 10.8 → 9.8 | 78.8 → 79.0 | 4.0 → 4.2 | 0 → 0 | 0 → 0 |
| kid0.5 | 3 | 5.3 (5.6) → 4.8 (5.1) | 73.8 [67.0–85.2] → 68.6 [61.0–77.3] | 15.6 → 14.4 | 48.6 → 52.5 | 27.5 → 27.5 | 0 → 0.3 | 0 → 0 |
| kid0.5 | 4 | 5.2 (5.4) → 4.7 (5.2) | 73.5 [64.9–83.3] → 67.4 [60.8–77.0] | 15.2 → 14.1 | 52.0 → 52.3 | 24.5 → 25.7 | 0 → 0.5 | 0 → 0 |
| kid0.8 | 3 | 4.9 (5.2) → 4.6 (4.9) | 68.0 [63.1–78.7] → 64.5 [58.7–73.4] | 14.5 → 13.6 | 78.4 → 81.6 | 3.9 → 6.1 | 0 → 0 | 0 → 0 |
| **kid0.8** | **4** | **4.8 (5.1) → 4.5 (4.8)** | **67.8 [62.3–75.1] → 63.4 [57.8–72.6]** | 14.3 → 13.4 | 81.0 → 81.5 | 2.6 → 6.6 | 0 → 0 | 0 → 0 |
| kid0.8 | 5 | 4.8 (5.1) → 4.5 (4.7) | 66.6 [61.3–76.1] → 62.3 [57.7–71.8] | 14.3 → 13.3 | 80.3 → 78.8 | 3.5 → 6.4 | 0 → 0 | 0 → 0 |
| kid0.8 | 6 | 4.8 (5.2) → 4.5 (4.7) | 66.8 [62.1–77.1] → 62.5 [57.7–72.6] | 14.3 → 13.3 | 79.9 → 79.3 | 3.1 → 3.4 | 0 → 0 | 0 → 0 |
| kid0.8 | 7 | 4.7 (4.9) → 4.5 (4.7) | 65.9 [62.0–75.9] → 62.2 [57.4–71.8] | 14.2 → 13.0 | 81.1 → 78.1 | 3.5 → 5.7 | 0 → 0 | 0 → 0 |
| rtap | 3 | 3.7 (4.0) → 3.8 (4.2) | 52.5 → 52.7 | 11.6 → 11.0 | 31.3 → 30.6 | 60.3 → 61.5 | **33.3 → 7.0** | 0 → 0 |
| rtap | 4 | 3.9 (4.1) → 4.0 (4.3) | 55.0 → 55.0 | 12.2 → 11.3 | 26.4 → 28.5 | 65.2 → 62.5 | **39.2 → 9.6** | 0 → 0 |
| rtap | 7 | 4.2 (4.4) → 4.3 (4.6) | 58.0 → 59.4 | 13.2 → 12.8 | 18.9 → 23.2 | 73.0 → 69.1 | **50.3 → 14.5** | 0 → 0 |
| spam8 | 3–7 | 3.0–3.4 → 2.8–3.2 | 41–45 → 38–42 | 9.1–10.4 → 8.2–9.2 | ≈ same | ≈ same | **2.2–7.2 → 0.0** | 0 → 0 |
| **slow** | **3** | **8.6 (10.2) → 7.7 (8.7)** | 119.8 [89.7–176.3] → 108.8 [89.1–143.3] | 29.3 → 24.6 | 61.0 → 70.9 | 30.4 → 63.7 | 0.8 → 0.8 | **54 → 33** |
| **slow** | **4** | **8.6 (10.2) → 7.8 (8.9)** | 116.8 [92.8–171.2] → 106.8 [90.3–147.1] | 29.8 → 25.2 | 60.0 → 66.7 | 33.3 → 65.5 | 0.5 → 1.1 | **44 → 33** |
| slow | 5 | 9.0 (10.9) → 7.9 (9.2) | 120.6 → 109.1 | 29.9 → 25.7 | 62.9 → 69.1 | 33.7 → 63.5 | 0.8 → 1.1 | 68 → 41 |
| slow | 6 | 8.9 (10.6) → 8.2 (9.0) | 122.5 → 115.3 | 30.0 → 26.9 | 58.9 → 66.7 | 31.9 → 69.4 | 0.2 → 0.5 | 54 → 35 |
| slow | 7 | 8.9 (10.9) → 8.0 (9.4) | 117.6 → 108.3 | 30.7 → 26.2 | 59.4 → 67.7 | 34.7 → 65.8 | 0.3 → 1.2 | 58 → 43 |

Talk answer time for the spammer: 0.1 → 1.1 s.

Intermediate steps, 48 sessions per row at ages 3–4 (`out/qa_cA … cG.md`):
- `hintTime` 6 alone: slow 8.6 → 8.4–8.6 min. Not enough on its own.
- The pace trims alone: kid0.8 chapter 67.8 → 63.9 s, slow unchanged.
- Adding `idleHintFrom` 1 is what takes the slow child under 8 min (median).

What stays:
- The slow child's p90 is 8.7–9.4 min. That is the child's own 4–15 s pauses and 30 s look-aways, not a game wait.
- The typical child's chapter p10 drops to 57–58 s. The median stays at 62–64 s, inside 60–100.

Voice re-run with the trimmed timings (`--config`, 48 sessions):
- Right lines 100 % in full; praise 100 % in full; count runs 64 / 64.
- Prompt start delay: median 0, p90 ≤ 1.06 s, max 2.14 s (VI). It was 2.02 s before.

### 5.4 Content
- **Odd slot:** apply the "never the same slot" exclusion only when `n` equals the previous round's `n`, and pick uniformly
  otherwise. This removes the rightmost-slot bias (32–34 % → 25 %, and 26 → 20 % at n = 5). The placemats are re-laid out when
  `n` changes, so index equality no longer means "the same place" anyway.
- **Count warm-up at ages ≥ 5:** require a gap ≥ 2 in round 0, for example `countPairOk(a, b, age, ri)`: `ri === 0 → g >= 2`.
  The share of warm-ups with a gap of 1 goes from 41 % (age 5) and 28 % (ages 6–7) to 0 %.
- **Optional, age 5 later rounds:** require a gap ≥ 2 at every size (`countPairOk` age 5 → `g >= 2`). It removes the 10 % of
  "4 vs 5 berries" style rounds, which is the steepest step of the curve.

## 6. Bugs

**P0:** none.
- 0 errors in 5 280 headless sessions, 120 voice sessions and 4 browser sessions.
- 0 judgements from presses outside play.
- 0 stuck states.
- 0 rule violations: colour pairs, repeated sets, odd slot twice in a row.

**P1**
1. **Talk choices accept a tap the instant Talk opens.** `ui.openTalk` binds `click → onChoice` with no guard; `blockInput` only
   covers the canvas.
   - Repro: `qa_playtest.js --models spam8`: Talk is answered 0.1 s after `talk` (rtap 1.5 s), before "Talk time! …" (2.5–3.5 s)
     has been spoken.
   - Live: keep tapping the middle of the screen through the 4th clear, and the finger lands on a choice as the panel appears.
   - Fix: ignore choice clicks until the question has started plus 1 s, or until its `onEnd` (§5.2-2).
2. **Mashing buys auto-solves through the assist.** Soft presses anywhere count toward the 6 no-progress presses, and then the
   next band press picks the odd one.
   - Repro: `qa_playtest.js --models rtap`: 33–50 % of rounds are solved by the assist, with play 2.6–3.4 s against 4.9 s for a
     thinking child.
   - Fix: §5.2-1 (`assistMinPlay` 10, then `assistAfter` 4).
3. **A slow toddler's session goes over the 8 min budget:** median 8.6–9.0 min, p90 10.2–10.9, max 13.4.
   - Causes: the hint glow lasts only 3.2 s, the idle hint waits for the 2nd idle (30 s), and there is no second chapter limit.
   - Repro: `qa_playtest.js --models slow`.
   - Fix: §5.1 `hintTime` / `idleHintFrom` + §5.2-3 → median 7.7–8.2 min.

**P2**
1. **Rightmost-slot bias after a round grows** (32–34 % instead of 25 %). Repro: `qa_content.js` (odd-slot table). Fix: §5.4.
2. **The count warm-up has a gap of 1 at ages ≥ 5** (41 % / 28 %), so it is harder than the warm-up rule intends.
   Repro: `qa_content.js` (berry-gap table). Fix: §5.4.
3. **The wrong / wrong-hint line can repeat word for word, back-to-back**, e.g. "The cup, like its friends! Watch the little hand!"
   twice, when the same wrong thing is tapped twice more than 1.5 s apart. `T()` re-rolls only for keys; `line('sayWrong…')` never
   re-rolls. Repro: `qa_voiceflow.js` (column "same line back-to-back"). Fix: in main.js re-call `sayWrong` / `sayWrongHint` (up to 3
   times) while the text equals `lastSpoken`.
4. **The idle nudge repeats the identical full sentence** (`T('idle') + ' ' + currentPrompt()`). The re-roll inside `T` compares
   only the prefix with `lastSpoken`, which is the whole earlier line, so it never matches. Repro: slow kid in `qa_voiceflow.js`, 3–5
   per 6 sessions. Fix: compose the line first, then re-roll the `idle` prefix while it equals `lastSpoken`.
5. **VOICE.md §2 doesn't match main.js.** The doc says the right line is "never over a protected prompt (then queue)", but
   main.js sets `promptUntil = 0` before `feedback()`, so a right answer always cuts the prompt (95 % of prompts for an eager child).
   The code's behaviour is the better one (instant feedback for a question that has been answered), so **update the doc, not the
   code**.
6. **`great` at levelDone is occasionally cut by the next chapter name** (VI, 1 in 24). The VI `talkResult` line + `great` can be
   longer than `levelDoneTime` 3.6 s. Optional: queue `great` only when nothing is speaking, or set `levelDoneTime` 4.0 for VI.
7. **Test only:** `tests/sim/hs_voiceflow.js` `child()` picks wrong things with `q.state === 'stand'`, a state left over from the
   parade game (the tea world uses `'sit'`). So that sim's child never taps a wrong thing and never exercises the wrong / hint lines.
