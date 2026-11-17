# QA high-speed playtest — Tibo's Dino Lake Fishing (2026-11-17)

Report-only (no game code changed). Owner: high-speed playtester. New files: `tests/sim/qa_playtest.js` (instrumented sessions +
child models + a speech model of main.js + sim-only patches for the proposed code changes), `tests/sim/qa_lagprobe.js` (lagged-aim
hit probe), `tests/sim/qa_browser.js` (Playwright). Raw results: `tests/out/qa_sim/*.json|txt`.

**Reproduce**
```
node tests/sim/qa_playtest.js run --tag base --n 100 --part 0 --parts 2 & node tests/sim/qa_playtest.js run --tag base --n 100 --part 1 --parts 2
node tests/sim/qa_playtest.js report --tag base                       # all tables below
node tests/sim/qa_playtest.js run --tag prop --n 40 --models bot0.6,bot0.2,typical,slow3,lag3,sloppy,random,spammer,spamfish,tibo \
  --config '{"hitPad":22,"chapterHardLimit":100,"wrongCooldown":0.6,"assistMaxStars":1}' --patch pokes,spam,stars --speech '{"releaseEvery":2}'
node tests/sim/qa_lagprobe.js --n 30 [--after 1] [--config '{"hitPad":22}']
node tests/sim/qa_browser.js
```

## 1. What was run
- **6 000 baseline sessions** (12 models × ages 3–7 × 100; 1 200 per age), 5 viewports (iPhone / iPad, portrait / landscape, with
  insets), EN / VI alternating, 1/30 s frames through the real input API (`pointerDown/Move/Up`, `talkAnswer`). + 2 000 sessions with
  the proposals, + 240 speech-rule sessions, + 2 × ≈ 23 000 lagged-aim probes.
- **Models**: `bot1 / bot0.6 / bot0.2` (TL.Bot) · `typical` · `slow3` (lib.js profiles) · **`lag3`** slow 3-year-old who aims where the
  fish WAS 0.3–0.6 s ago (own 1.2 s position memory; listen 3.2 s, think 2.5–6 s) · **`sloppy`** taps 40–90 px off the fish in a
  random direction · **`random`** taps random water every 0.8–2.5 s, ignores the question · **`spammer`** taps anywhere on screen
  every 0.15 s · **`spamfish`** taps a random fish every 0.15 s · **`idle`** typical, but 30 % of rounds starts with 40–150 s of no
  input · **`tibo`** taps only Tibo / critters every 1.5–4 s. (`slow3`/`lag3` at ages 5–7 = a toddler-like child on older content.)
- **Speech model** = main.js rules (VOICE §2): protected prompts, right/wrong interrupt, count run priority, droppables only when
  silent, wrong ≤ 1/1.5 s, critter ≤ 1/2 s, Talk gate = question start + 1 s; real EN/VI text from `i18n.js`; spoken length
  0.3 s + 75 ms/char (≈ 13 chars/s at rate 0.9), protection 600 + 95 ms/char as main.js.
- **Browser** (Playwright chromium, `isMobile/hasTouch`): `?speed=8&bot=1&autostart=1&mute=1` for ages 3, 4 (EN + VI), 5, 6 (VI),
  7 on iPhone L / P and iPad L / P; then 25 s at 1× (`?bot=1`) on iPhone landscape and iPad portrait measuring rAF intervals and the
  time inside `render.draw`.

## 2. Key numbers (baseline)
| | result | target |
|---|---|---|
| session length, typical child ages 3–7 | **5.1–5.4 min** median (p90 ≤ 5.9) | ≤ 8 min ✓ |
| session length, slow / lagging toddler | **6.4–6.7 min** median, p90 6.8–7.1, **max 7.6** | ≤ 8 min ✓ |
| chapter, typical ages 3–4 | 68–70 s [p10 64 – p90 78] | 60–100 s ✓ |
| chapter, slow3 / lag3 ages 3–4 | 84–86 s [77 – 98/100] (the 75 s / 110 s limits end ≈ 20 % of their chapters after 3 rounds: 15.2 rounds / session) | 60–100 s ✓ |
| round (round → roundDone) | typical 11.4–12.5 s; slow 16.8–17.2 s (p90 27 s); play (ask → catch) typical 4.2–5.6 s | — |
| stuck rounds (> 120 s), NaN, swimming fish off screen, two fish bodies overlapping, target past a screen edge / under the bubble or HUD | **0** in every model that touches fish (idle model: only while nobody touches; main pauses at 117 s) | 0 ✓ |
| **child who taps only Tibo / critters** | **100 % of rounds never end: no hint, no idle nudge, no assist, no auto-pause, 6–8 prompt repeats / min for the whole 11.7 min run** | ✗ **P1** |
| target speed in play | age 3: 36–40 px/s · 4: 43–47 · 5: 50–54 · 6: 56–60 · 7: 61–66 | — |
| tap aimed exactly where the target was 0.3 s ago | **100 % hit at every age**; 0.45 / 0.6 s ago: 96 / 94 % (all misses in the first second after the ask, while the fish still brake from their entry; ≥ 1 s after the ask: **100 %** even at age 7, 0.6 s lag) | fish are not too fast ✓ |
| lag3 child (real taps, aim ± 0.85 r, 0.3–0.6 s lag) | hit 97 % (age 3), 96 % (4), 87 % (7); misses go to empty water, never to another fish | ✓ |
| **sloppy tapper (40–90 px off)** | hit **74 % (age 3), 78 % (4)**, 61–62 % (6–7); 17–35 % of taps land on nothing | P2 |
| critter overlaps the target | the critter is tappable 3–14 % of play time; its circle touches the target's 1–7 % of that time; **0 taps aimed at a fish were stolen by a critter** (`critterK` 2) | ✓ |
| hints | typical 0.02–0.11 / round (2–10 % of rounds), slow 0.3 / round (≈ 30 %), bot0.2 0.65; assist almost only for random / spam taps | ✓ |
| idle backoff / auto-pause | idle lines at **12 / 30 / 57 / 87 s**, `idle n=5` (main auto-pauses) at **117 s** since the last touch; first idle also hints | skill ✓ |
| Talk time | typical answers in 3.5–4.8 s (p90 6 s); no answer → re-ask every 12 s, glow from the 2nd, auto give-up at **38.0 s** | skill ✓ |
| spammer anywhere (0.15 s) | wins every round, but **slower** than playing (play 6.4–8.1 s vs 4.2–5.6 s), stars 27–39 % 3★ (typical 70–90 %) | ✓ benign |
| **spam on fish (0.15 s)** | catches the target in **0.4–0.6 s** (fastest of all models, faster than bot1), 27–39 % 3★ | P3 (see §3) |
| **random tapper** | 62–71 % of rounds **assisted → 2★**, 21–29 % 3★: avg 2.1–2.2★/round — close to a trying 3-year-old (typical age 3 ≈ 2.6, slow3 ≈ 2.5) | P3 |
| speech load (typical) | **17 lines / min**, voice on **64–67 %** of the session (68–83 % of play time); longest silence while waiting p90 7–10 s (slow toddler 13–16 s); per session ≈ 16 asks, 16 rights, **16 "Bye bye, little fish!"**, 4 lily, 5–8 praise | busy, not broken (P3) |
| browser speed 8, ages 3–7, EN / VI | **6 / 6 sessions done, 0 console errors, 0 page errors, 0 HTTP ≥ 400**; 16 rounds, 16 casts, 16 lilies, 4 Talks each, 4.1–4.4 sim-min | ✓ |
| browser 1× frame time (headless swiftshader, 2 shared cores) | rAF p50 16.7 ms, p95 33.4 ms, 24–26 % of frames > 20 ms, 5–7 % > 33 ms; `render.draw` p50 0.9 ms, p95 1.9 ms (iPhone L) / 26.6 ms (iPad P), max 58 / 130 ms; **adaptive quality fell to 0.61 / 0.52 within 25 s and never comes back** | P2 (see §3) |

## 3. Findings
### P1
1. **A child who taps only Tibo (or the critter) is stuck forever.** Every press calls `_touch()` (idle clock reset), a Tibo poke is
   not "no progress", so no hint, no idle nudge, no assist, no `idle n=5` auto-pause ever fires; main repeats the question on every
   poke (> 3 s after the last ask) — ≈ 8 times a minute, indefinitely. 500 / 500 sessions never finished a single round. Toddlers do
   poke the character repeatedly. **Fix** (code, world.js; simulated with `--patch pokes`):
   - in `pointerDown`, when the result is `'tibo'` or `'critter'` during play, keep `_idleT/_idleGap/_idleN` (do not call `_touch`
     for those; `_pokeTibo` likewise);
   - every `CONFIG.pokeNoProgress` (2nd) Tibo poke in play calls `_noProgress(false)` (→ hint at the 6th poke, assist after 12 and ≥ 10 s);
   - `CONFIG.assistTibo: true`: while the assist is armed, a press on Tibo also catches the target (Tibo helps; ≤ 2★ / 1★).
   Re-sim: the Tibo-only child now finishes every round in **44 s median (p90 52 s)**, 2.5 hints + 1 idle hint per round, Talk
   gives up at 38 s; other models unchanged (typical / slow rows identical within noise).

### P2
2. **Imprecise taps miss a lot for 3–4-year-olds**: 40–90 px off → only 73–77 % hits (r = 0.6·104 + 14 = 76 px). Fish lanes are ≥ 1.0
   size (104 px) apart and nearest-centre wins, so the circle can grow safely. **`hitPad: 14 → 22`** (r 84 px at ages ≤ 4, 76 px at
   6–7). Re-sim: sloppy hits **74 → 86 % (age 3), 78 → 90 % (4), 70 → 84 % (5), 61 → 77 % (6–7)**; taps landing on ANOTHER fish unchanged
   (3.4 → 4.4 %, 5.2 → 5.4 %, 4.3 → 4.3 %); probe 40–90 px off at age 3: 75 → 88 %; exact / lagged aims unchanged (already 100 %); sloppy play time 6.3 → 5.6 s.
3. **Adaptive quality is one-way** (`main.js adapt`): 1.5 s of accumulated slow frames steps the render scale × 0.85 down to 0.5, and
   nothing ever steps it back. In the headless run (CPU contention) it reached 0.52–0.61 within 25 s; on a real iPhone a few hitches
   (TTS start, chapter `prewarm`, tab return) would leave the lake permanently soft for the rest of the session. Suggest: step back
   up (× 1/0.85, max 1) after 8 s with no slow frame, and skip `adapt` for 0.5 s after a chapter change / resume. (Integrator file;
   frame numbers from swiftshader are only a sanity check — `render.draw` itself is cheap, p50 0.9 ms.)

### P3
4. **Random / soft-tap spam earns 2★ via the assist** (62–71 % of its rounds), the same average as a 3-year-old who tries. Proposal
   **`assistMaxStars: 1`** (REQUIREMENT "assisted ≤ 2★" still holds; sim `--patch stars`): random tapper 2★ 63–65 % → **6–9 %**, avg
   2.2 → 1.6★; typical / slow3 / lag3 star mix unchanged (they are assisted in ≤ 0.7 % of rounds).
5. **Spamming the fish wins in < 1 s** (stars do drop to ≈ 35 % 3★). A judgement cooldown (`wrongCooldown` 0.6 s, simulated) only
   moves it to 0.8–1.6 s and raises misses — **not recommended**; the star mix + kind wrong lines are the right lever. No change.
6. **Repetitive release line**: "Bye bye, little fish!" is spoken in 99 % of rounds (16 / session) because droppable lines fill every
   silence. Thinning it alone does not help (sim `releaseEvery 2`: the lily line fills the gap, lines / min 17.3 → 17.0; a 2.5 s quiet
   gap + 1 droppable / round: 17.3 → 16.4). Suggest in main.js: `release` on alternate rounds and `lily` only in round 0 / the last
   round, so the joy notes carry the release. Overall speech load (≈ 1 line / 3.5 s, prompts and feedback dominate) is fine for a
   voice-first toddler game.
7. **Talk question is often cut by the answer** (`talk>talkResult` ≈ 3 per session): children answer ≥ 1 s after the question starts
   while it is still spoken. Harmless (the answer line follows); keep.
8. Pacing needs no change: `chapterHardLimit 110 → 100` moved the slow-toddler chapter p90 by ≈ 1 s only (98 → 98, 100 → 99) —
   **not recommended**. Swim speeds are fine for toddlers (100 % hit at 0.3–0.6 s lag once the fish swim) — **no speed change**.
9. Housekeeping: `CLAUDE.md` of this folder still describes "Moka's Fairy Tea Party" (FT namespace, `ft:` prefix, tea modules);
   `tests/e2e/serve.js` header says "Moka's Fairy Tea Party".

## 4. Exact CONFIG diff (game/js/world.js `TL.CONFIG`)
```diff
-    hitK: 0.6, hitPad: 14, littleHitK: 0.85, bubbleHitK: 0.65,
+    hitK: 0.6, hitPad: 22, littleHitK: 0.85, bubbleHitK: 0.65,          // P2: imprecise toddler taps 74–78 % → 86–90 % hits
@@ help
-    critterK: 2, critterSoftK: 1.5, histLag: 0.12, histKeep: 0.25, puffTime: 0.6,
+    critterK: 2, critterSoftK: 1.5, histLag: 0.12, histKeep: 0.25, puffTime: 0.6,
+    pokeNoProgress: 2,     // P1 (new, needs code): every 2nd Tibo poke in play = one "no progress" press; Tibo / critter presses do not reset the idle clock
+    assistTibo: true,      // P1 (new, needs code): while the assist is armed a press on Tibo also catches the target
+    assistMaxStars: 1,     // P3 (new, needs code in _roundDone: `st = Math.min(st, cfg.assistMaxStars)` instead of 2)
```
Unchanged on purpose: `speed`, `chapterTimeLimit 75`, `chapterHardLimit 110`, `idleTime 12 / idleBackoff 1.5 / idleMax 30`,
`talkAskTime 12 / talkMaxAsks 3`, `assistAfter 6 / assistMinPlay 10`, `critterK 2`, `sameWrongWindow 1`.
Reference code for the P1 change = `applyPatch('pokes')` in `tests/sim/qa_playtest.js` (≈ 15 lines).

## 5. Re-simulation with the proposals (`--tag prop`, 40 sessions per cell; config `{"hitPad":22,"assistMaxStars":1, …}` + patches)
| model | age | session min med (p90) | chapter s med [p10–p90] | play s med | hit % of aimed taps | stars 3/2/1 % | stuck | vs baseline |
|---|---|---|---|---|---|---|---|---|
| typical | 3 / 4 | 5.4 / 5.3 (5.6) | 69.9 / 68.4 [65–78] | 5.5 / 4.8 | 100 | 69/23/7 · 83/14/3 | 0 | unchanged |
| slow3 | 3 / 4 | 6.4 / 6.5 (6.9) | 84.2 / 84.7 [77–99] | 10.3 / 9.5 | 99 / 97 | 60/27/14 · 64/22/15 | 0 | unchanged |
| lag3 | 3 / 4 | 6.5 / 6.5 (6.9) | 85.0 / 86.0 [77–99] | 10.0 / 10.1 | 97 / 97 | 66/21/13 · 64/22/14 | 0 | unchanged |
| sloppy | 3 / 4 / 5 | 5.5 / 5.4 / 5.4 | 71.5 / 71.0 / 70.2 | 5.6 / 5.0 / 4.6 | **86 / 90 / 84** (was 74 / 78 / 70) | 71/19/10 · 76/19/6 · 84/13/3 | 0 | ↑ hits |
| random | 3 / 4 | 6.2 / 6.3 | 83.6 / 85.7 | 12.1 / 12.0 | — | **30/6/64 · 28/9/64** (was 28/65/6 · 29/63/8) | 0 | assisted → 1★ |
| tibo | 3–7 | (cap 11.7) | 141–144 | **37 s** | — | 0/0/100 | **0** (was 100 % stuck) | rounds finish |
| spamfish (+ wrongCooldown 0.6, not recommended) | 3 / 4 | 3.8 / 4.1 | 49 / 53 | 0.8 / 0.9 (was 0.4) | — | 40/34/26 · 36/31/34 | 0 | little effect |

## 6. Browser playtest (`tests/sim/qa_browser.js`)
| run | device | result |
|---|---|---|
| speed 8, age 3 EN | iPhone landscape 852×393 @3 | done in 31 s wall, 0 errors · 16 rounds / 16 casts / 16 lilies / 4 Talks, 1 wrong, 51★ |
| speed 8, age 4 EN | iPhone portrait 393×852 @3 | done, 0 errors · 10 count events, 49★ |
| speed 8, age 4 VI | iPad landscape 1180×820 @2 | done, 0 errors · 49★ |
| speed 8, age 5 EN | iPad portrait 820×1180 @2 | done, 0 errors · 22 count events, 1 hint, 48★ |
| speed 8, age 6 VI | iPhone landscape | done, 0 errors · 49★ |
| speed 8, age 7 EN | iPad landscape | done, 0 errors · 49★ |
| 1× 25 s bot | iPhone landscape | 1 184 frames, rAF p50 16.7 / p95 33.4 / max 100 ms, 24 % > 20 ms, 4.9 % > 33 ms; draw p50 0.9 / p95 1.9 / max 58 ms; quality → 0.61 |
| 1× 25 s bot | iPad portrait | 1 150 frames, rAF p50 16.7 / p95 33.4 / max 150 ms, 26 % > 20 ms, 7.0 % > 33 ms; draw p50 0.9 / p95 26.6 / max 130 ms; quality → 0.52 |
Headless chromium uses software GL on 2 cores shared with other test agents: the frame numbers are a sanity check (no runaway work
per frame), not an iPhone measurement.

## Appendix — baseline tables (6 000 sessions)

### Flow
| model | age | n | done | session min med (p90, max) | chapter s med [p10–p90] | round s med (p90) | play s med (p90) | rounds/session | misses/round | rounds w/ hint % | assisted % | stars 3/2/1 % | stuck >120 s | NaN |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot1 | 3 | 100 | 100 | 3.9 (4.0, 4.0) | 50.2 [47.9–52.0] | 8.3 (9.1) | 1.3 (1.8) | 16.0 | 0.00 | 0.0 | 0.0 | 100.0 / 0.0 / 0.0 | 0 | 0 |
| bot1 | 4 | 100 | 100 | 4.0 (4.2, 4.2) | 52.1 [49.6–57.2] | 8.6 (10.0) | 1.3 (1.8) | 16.0 | 0.00 | 0.0 | 0.0 | 100.0 / 0.0 / 0.0 | 0 | 0 |
| bot1 | 5 | 100 | 100 | 4.2 (4.4, 4.5) | 53.5 [51.2–63.4] | 8.6 (11.4) | 1.3 (1.8) | 16.0 | 0.00 | 0.0 | 0.0 | 100.0 / 0.0 / 0.0 | 0 | 0 |
| bot1 | 6 | 100 | 100 | 4.3 (4.4, 4.5) | 54.0 [51.6–65.3] | 8.7 (11.4) | 1.3 (1.8) | 16.0 | 0.00 | 0.0 | 0.0 | 100.0 / 0.0 / 0.0 | 0 | 0 |
| bot1 | 7 | 100 | 100 | 4.1 (4.2, 4.3) | 53.2 [51.4–55.5] | 8.4 (9.2) | 1.3 (1.8) | 16.0 | 0.00 | 0.0 | 0.0 | 100.0 / 0.0 / 0.0 | 0 | 0 |
| bot0.6 | 3 | 100 | 100 | 4.1 (4.3, 4.4) | 54.1 [50.8–57.4] | 9.2 (10.9) | 2.1 (3.9) | 16.0 | 0.56 | 13.4 | 0.0 | 56.8 / 30.1 / 13.1 | 0 | 0 |
| bot0.6 | 4 | 100 | 100 | 4.3 (4.5, 4.6) | 56.4 [52.2–61.6] | 9.5 (11.6) | 2.1 (3.9) | 16.0 | 0.54 | 14.8 | 0.0 | 59.9 / 25.8 / 14.3 | 0 | 0 |
| bot0.6 | 5 | 100 | 100 | 4.4 (4.6, 4.7) | 57.5 [54.1–66.9] | 9.6 (12.4) | 2.1 (3.8) | 16.0 | 0.54 | 13.6 | 0.0 | 59.6 / 26.9 / 13.4 | 0 | 0 |
| bot0.6 | 6 | 100 | 100 | 4.5 (4.7, 4.7) | 58.2 [54.2–69.2] | 9.6 (12.7) | 2.1 (3.9) | 16.0 | 0.54 | 15.5 | 0.0 | 61.0 / 23.8 / 15.2 | 0 | 0 |
| bot0.6 | 7 | 100 | 100 | 4.3 (4.5, 4.7) | 57.0 [54.1–60.6] | 9.3 (11.0) | 2.1 (3.8) | 16.0 | 0.56 | 13.7 | 0.0 | 57.9 / 28.6 / 13.5 | 0 | 0 |
| bot0.2 | 3 | 100 | 100 | 4.6 (4.7, 5.0) | 61.1 [56.7–64.9] | 11.2 (12.7) | 4.3 (5.7) | 16.0 | 1.42 | 63.4 | 0.0 | 20.2 / 17.4 / 62.4 | 0 | 0 |
| bot0.2 | 4 | 100 | 100 | 4.7 (4.9, 5.0) | 62.8 [58.3–68.5] | 11.5 (13.4) | 4.2 (5.6) | 16.0 | 1.38 | 60.9 | 0.0 | 21.6 / 18.6 / 59.8 | 0 | 0 |
| bot0.2 | 5 | 100 | 100 | 4.9 (5.1, 5.2) | 64.7 [59.5–74.2] | 11.6 (14.0) | 4.1 (5.6) | 16.0 | 1.41 | 63.1 | 0.0 | 21.2 / 16.2 / 62.6 | 0 | 0 |
| bot0.2 | 6 | 100 | 100 | 5.0 (5.2, 5.3) | 65.4 [60.7–75.5] | 11.7 (14.4) | 4.2 (5.7) | 16.0 | 1.44 | 62.9 | 0.0 | 18.8 / 18.8 / 62.4 | 0 | 0 |
| bot0.2 | 7 | 100 | 100 | 4.8 (4.9, 5.0) | 64.0 [60.3–67.3] | 11.2 (12.8) | 4.1 (5.6) | 16.0 | 1.43 | 63.1 | 0.0 | 19.8 / 17.9 / 62.3 | 0 | 0 |
| typical | 3 | 100 | 100 | 5.4 (5.6, 5.9) | 70.0 [65.2–77.5] | 12.5 (16.8) | 5.6 (9.8) | 16.0 | 0.38 | 10.3 | 0.0 | 70.0 / 22.1 / 7.8 | 0 | 0 |
| typical | 4 | 100 | 100 | 5.3 (5.5, 5.7) | 68.5 [64.2–77.2] | 12.2 (16.0) | 4.8 (8.5) | 16.0 | 0.20 | 5.9 | 0.0 | 83.2 / 13.5 / 3.3 | 0 | 0 |
| typical | 5 | 100 | 100 | 5.2 (5.5, 5.9) | 68.8 [63.8–77.0] | 11.8 (15.9) | 4.5 (6.9) | 16.0 | 0.15 | 3.3 | 0.0 | 86.9 / 11.3 / 1.8 | 0 | 0 |
| typical | 6 | 100 | 100 | 5.3 (5.5, 5.7) | 68.5 [64.0–78.8] | 11.8 (16.3) | 4.4 (6.6) | 16.0 | 0.14 | 1.8 | 0.0 | 87.2 / 11.6 / 1.2 | 0 | 0 |
| typical | 7 | 100 | 100 | 5.1 (5.2, 5.3) | 66.1 [63.2–71.9] | 11.4 (13.5) | 4.2 (6.4) | 16.0 | 0.12 | 1.8 | 0.0 | 89.5 / 9.3 / 1.3 | 0 | 0 |
| slow3 | 3 | 100 | 100 | 6.4 (6.8, 7.2) | 84.3 [77.1–95.5] | 16.8 (26.5) | 10.0 (19.7) | 15.2 | 0.55 | 30.0 | 0.5 | 61.9 / 24.4 / 13.7 | 0 | 0 |
| slow3 | 4 | 100 | 100 | 6.5 (7.0, 7.6) | 85.6 [77.6–98.2] | 16.8 (27.2) | 9.7 (19.8) | 15.2 | 0.52 | 29.0 | 0.0 | 63.0 / 23.3 / 13.7 | 0 | 0 |
| slow3 | 5 | 100 | 100 | 6.5 (6.9, 7.4) | 86.7 [78.1–98.8] | 17.6 (26.5) | 9.7 (18.7) | 14.9 | 0.51 | 27.1 | 0.1 | 63.3 / 25.0 / 11.7 | 0 | 0 |
| slow3 | 6 | 100 | 100 | 6.6 (7.0, 7.5) | 86.8 [78.3–100.6] | 17.9 (26.7) | 10.0 (19.0) | 14.9 | 0.54 | 29.4 | 0.3 | 61.2 / 25.0 / 13.8 | 0 | 0 |
| slow3 | 7 | 100 | 100 | 6.5 (6.9, 7.6) | 85.8 [77.9–98.0] | 16.8 (26.9) | 9.9 (20.1) | 15.1 | 0.53 | 29.9 | 0.1 | 63.4 / 23.3 / 13.3 | 0 | 0 |
| lag3 | 3 | 100 | 100 | 6.5 (7.0, 7.5) | 86.0 [76.9–100.2] | 17.0 (27.4) | 10.0 (20.5) | 15.2 | 0.50 | 29.5 | 0.1 | 65.5 / 21.2 / 13.3 | 0 | 0 |
| lag3 | 4 | 100 | 100 | 6.5 (6.8, 7.3) | 86.2 [78.0–97.7] | 17.2 (27.1) | 9.8 (19.7) | 15.1 | 0.49 | 28.3 | 0.1 | 65.8 / 21.7 / 12.5 | 0 | 0 |
| lag3 | 5 | 100 | 100 | 6.7 (7.1, 7.5) | 88.5 [79.2–101.6] | 18.1 (27.4) | 10.2 (20.1) | 14.9 | 0.52 | 30.0 | 0.4 | 63.1 / 24.5 / 12.4 | 0 | 0 |
| lag3 | 6 | 100 | 100 | 6.6 (7.0, 7.5) | 88.8 [78.6–99.6] | 18.6 (28.5) | 11.0 (21.0) | 14.4 | 0.54 | 32.5 | 0.3 | 61.3 / 25.7 / 13.0 | 0 | 0 |
| lag3 | 7 | 100 | 100 | 6.6 (7.0, 7.4) | 86.8 [78.8–100.0] | 17.6 (28.3) | 10.6 (21.3) | 14.8 | 0.51 | 32.2 | 0.3 | 64.4 / 23.2 / 12.5 | 0 | 0 |
| sloppy | 3 | 100 | 100 | 5.6 (6.0, 6.3) | 73.3 [66.8–84.2] | 13.2 (19.7) | 6.3 (12.8) | 16.0 | 0.42 | 18.2 | 1.2 | 67.8 / 23.3 / 8.9 | 0 | 0 |
| sloppy | 4 | 100 | 100 | 5.5 (5.7, 6.1) | 72.2 [65.6–80.4] | 12.9 (18.0) | 5.1 (10.5) | 16.0 | 0.28 | 10.5 | 0.3 | 76.8 / 18.7 / 4.6 | 0 | 0 |
| sloppy | 5 | 100 | 100 | 5.5 (5.8, 6.2) | 72.5 [65.3–81.8] | 12.6 (17.5) | 4.8 (9.3) | 16.0 | 0.20 | 8.6 | 0.4 | 82.4 / 14.9 / 2.6 | 0 | 0 |
| sloppy | 6 | 100 | 100 | 5.6 (5.9, 6.1) | 74.1 [66.9–84.9] | 12.9 (18.9) | 4.9 (10.7) | 16.0 | 0.22 | 12.8 | 1.2 | 81.6 / 15.5 / 2.9 | 0 | 0 |
| sloppy | 7 | 100 | 100 | 5.4 (5.6, 5.7) | 70.3 [65.1–78.6] | 11.9 (16.5) | 4.6 (9.3) | 16.0 | 0.16 | 10.7 | 0.8 | 86.6 / 11.4 / 2.0 | 0 | 0 |
| random | 3 | 100 | 100 | 6.3 (6.7, 7.0) | 85.1 [73.9–95.3] | 19.0 (20.7) | 12.2 (13.8) | 16.0 | 0.39 | 82.1 | 64.9 | 28.4 / 65.2 / 6.4 | 0 | 0 |
| random | 4 | 100 | 100 | 6.3 (6.7, 7.1) | 85.9 [73.6–95.9] | 19.1 (21.3) | 12.1 (13.7) | 15.8 | 0.47 | 81.1 | 61.9 | 29.2 / 62.8 / 8.0 | 0 | 0 |
| random | 5 | 100 | 100 | 6.5 (6.8, 7.2) | 88.7 [78.0–97.7] | 19.5 (22.0) | 12.3 (13.9) | 15.5 | 0.66 | 84.4 | 70.5 | 21.4 / 63.5 / 15.0 | 0 | 0 |
| random | 6 | 100 | 100 | 6.5 (6.8, 7.1) | 88.1 [77.7–98.0] | 19.5 (22.1) | 12.3 (13.9) | 15.4 | 0.62 | 83.9 | 69.5 | 22.1 / 63.9 / 14.0 | 0 | 0 |
| random | 7 | 100 | 100 | 6.5 (6.8, 7.2) | 89.2 [78.2–97.4] | 19.3 (21.0) | 12.3 (13.9) | 15.9 | 0.67 | 84.5 | 71.4 | 21.5 / 62.9 / 15.6 | 0 | 0 |
| spammer | 3 | 100 | 100 | 5.2 (5.7, 5.8) | 69.7 [59.7–79.0] | 13.3 (17.6) | 6.4 (10.6) | 16.0 | 0.86 | 91.8 | 33.9 | 38.6 / 39.2 / 22.2 | 0 | 0 |
| spammer | 4 | 100 | 100 | 5.4 (5.7, 6.1) | 72.3 [60.9–82.4] | 14.1 (18.1) | 6.7 (10.6) | 16.0 | 1.12 | 91.9 | 33.6 | 34.8 / 34.6 / 30.7 | 0 | 0 |
| spammer | 5 | 100 | 100 | 5.6 (5.9, 6.4) | 75.1 [62.9–86.4] | 14.6 (18.4) | 6.7 (10.6) | 16.0 | 1.44 | 91.7 | 37.0 | 30.3 / 30.6 / 39.1 | 0 | 0 |
| spammer | 6 | 100 | 100 | 5.7 (5.9, 6.2) | 77.2 [67.9–88.0] | 15.8 (18.7) | 8.0 (10.6) | 16.0 | 1.44 | 93.3 | 41.7 | 29.1 / 32.1 / 38.9 | 0 | 0 |
| spammer | 7 | 100 | 100 | 5.6 (5.9, 6.2) | 75.8 [65.3–83.8] | 15.0 (17.9) | 8.1 (10.6) | 16.0 | 1.53 | 93.3 | 41.1 | 26.6 / 32.7 / 40.7 | 0 | 0 |
| spamfish | 3 | 100 | 100 | 3.7 (3.8, 3.8) | 46.7 [44.4–49.0] | 7.4 (8.4) | 0.4 (1.2) | 16.0 | 0.86 | 25.6 | 0.0 | 38.8 / 43.0 / 18.3 | 0 | 0 |
| spamfish | 4 | 100 | 100 | 3.8 (3.9, 4.1) | 49.1 [46.5–54.5] | 7.8 (9.4) | 0.4 (1.4) | 16.0 | 1.10 | 32.9 | 0.0 | 35.8 / 35.7 / 28.5 | 0 | 0 |
| spamfish | 5 | 100 | 100 | 4.1 (4.2, 4.3) | 51.5 [48.7–61.3] | 8.0 (11.2) | 0.5 (1.9) | 16.0 | 1.66 | 44.9 | 0.0 | 29.4 / 29.3 / 41.3 | 0 | 0 |
| spamfish | 6 | 100 | 100 | 4.1 (4.3, 4.4) | 52.4 [49.1–64.1] | 8.1 (11.3) | 0.5 (2.0) | 16.0 | 1.84 | 45.9 | 0.0 | 29.8 / 27.7 / 42.5 | 0 | 0 |
| spamfish | 7 | 100 | 100 | 3.9 (4.1, 4.2) | 51.4 [49.0–54.6] | 7.8 (9.4) | 0.6 (2.1) | 16.0 | 1.88 | 46.1 | 0.0 | 27.4 / 30.0 / 42.6 | 0 | 0 |
| idle | 3 | 100 | 100 | 9.5 (11.8, 13.1) | 133.0 [68.9–196.9] | 14.1 (124.7) | 7.2 (117.9) | 12.0 | 0.35 | 37.4 | 0.0 | 73.9 / 18.4 / 7.8 | 127 | 0 |
| idle | 4 | 100 | 100 | 9.5 (12.4, 15.9) | 128.7 [69.5–198.2] | 13.4 (124.6) | 5.7 (117.1) | 12.0 | 0.21 | 33.9 | 0.1 | 83.2 / 13.5 / 3.3 | 134 | 0 |
| idle | 5 | 100 | 100 | 9.4 (11.6, 14.2) | 131.1 [66.8–206.0] | 12.9 (122.6) | 4.8 (115.1) | 11.9 | 0.15 | 32.8 | 0.0 | 87.4 / 10.5 / 2.2 | 128 | 0 |
| idle | 6 | 100 | 100 | 9.4 (11.6, 14.6) | 130.7 [67.3–195.9] | 12.8 (124.3) | 4.7 (116.3) | 11.7 | 0.12 | 32.6 | 0.0 | 89.4 / 9.8 / 0.9 | 129 | 0 |
| idle | 7 | 100 | 100 | 9.4 (12.0, 14.3) | 131.2 [65.5–196.1] | 11.6 (125.6) | 4.5 (118.8) | 11.7 | 0.11 | 31.9 | 0.0 | 90.5 / 8.0 / 1.5 | 140 | 0 |
| tibo | 3 | 100 | 0 | 11.7 (11.7, 11.7) | 0.0 [0.0–0.0] | 0.0 (0.0) | 0.0 (0.0) | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 / 0.0 / 0.0 | 100 | 0 |
| tibo | 4 | 100 | 0 | 11.7 (11.7, 11.7) | 0.0 [0.0–0.0] | 0.0 (0.0) | 0.0 (0.0) | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 / 0.0 / 0.0 | 100 | 0 |
| tibo | 5 | 100 | 0 | 11.7 (11.7, 11.7) | 0.0 [0.0–0.0] | 0.0 (0.0) | 0.0 (0.0) | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 / 0.0 / 0.0 | 100 | 0 |
| tibo | 6 | 100 | 0 | 11.7 (11.7, 11.7) | 0.0 [0.0–0.0] | 0.0 (0.0) | 0.0 (0.0) | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 / 0.0 / 0.0 | 100 | 0 |
| tibo | 7 | 100 | 0 | 11.7 (11.7, 11.7) | 0.0 [0.0–0.0] | 0.0 (0.0) | 0.0 (0.0) | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 / 0.0 / 0.0 | 100 | 0 |

### Aim, overlaps, screen (fish-aimed taps only; bots tap via TL.Bot and are not counted)
| model | age | target px/s (play) | target-aimed taps | hit % | lag-only hits % (outside r now, saved by 0.12 s history) | → other fish % | → water % | → critter % | assist picks % | critter tappable (% play) | critter overlaps target (% of its time) | 2 fish bodies overlap (% play) | target past screen edge (% play) | target under bubble/HUD (% play) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 40 | 1599 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 8.2 | 1.5 | 0.0 | 0.0 | 0.0 |
| typical | 4 | 48 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 5.2 | 3.2 | 0.0 | 0.0 | 0.0 |
| typical | 5 | 54 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 3.8 | 2.5 | 0.0 | 0.0 | 0.0 |
| typical | 6 | 60 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 4.0 | 2.5 | 0.0 | 0.0 | 0.0 |
| typical | 7 | 66 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 3.1 | 3.2 | 0.0 | 0.0 | 0.0 |
| slow3 | 3 | 36 | 1533 | 98.5 | 1.3 | 0.2 | 1.0 | 0.0 | 0.3 | 12.2 | 1.5 | 0.0 | 0.0 | 0.0 |
| slow3 | 4 | 43 | 1553 | 97.7 | 3.4 | 0.2 | 2.1 | 0.0 | 0.0 | 10.8 | 1.2 | 0.0 | 0.0 | 0.0 |
| slow3 | 5 | 50 | 1546 | 96.5 | 3.7 | 0.0 | 3.4 | 0.0 | 0.1 | 11.7 | 1.9 | 0.0 | 0.0 | 0.0 |
| slow3 | 6 | 56 | 1569 | 94.6 | 3.6 | 0.1 | 5.1 | 0.0 | 0.2 | 12.4 | 2.6 | 0.0 | 0.0 | 0.0 |
| slow3 | 7 | 62 | 1594 | 94.6 | 5.8 | 0.0 | 5.3 | 0.0 | 0.1 | 12.2 | 2.2 | 0.0 | 0.0 | 0.0 |
| lag3 | 3 | 36 | 1573 | 96.3 | 2.2 | 0.2 | 3.4 | 0.0 | 0.1 | 11.6 | 1.3 | 0.0 | 0.0 | 0.0 |
| lag3 | 4 | 43 | 1564 | 96.2 | 2.8 | 0.2 | 3.5 | 0.0 | 0.1 | 12.0 | 1.3 | 0.0 | 0.0 | 0.0 |
| lag3 | 5 | 50 | 1604 | 92.5 | 4.6 | 0.0 | 7.3 | 0.0 | 0.2 | 12.1 | 2.2 | 0.0 | 0.0 | 0.0 |
| lag3 | 6 | 56 | 1583 | 90.6 | 5.6 | 0.1 | 9.1 | 0.0 | 0.3 | 12.9 | 2.2 | 0.0 | 0.0 | 0.0 |
| lag3 | 7 | 62 | 1650 | 89.3 | 4.8 | 0.0 | 10.5 | 0.0 | 0.2 | 12.7 | 1.8 | 0.0 | 0.0 | 0.0 |
| sloppy | 3 | 38 | 2132 | 73.5 | 3.3 | 3.4 | 22.4 | 0.0 | 0.7 | 9.1 | 1.5 | 0.0 | 0.0 | 0.0 |
| sloppy | 4 | 46 | 2029 | 77.9 | 3.7 | 5.2 | 16.7 | 0.0 | 0.2 | 7.7 | 2.8 | 0.0 | 0.0 | 0.0 |
| sloppy | 5 | 53 | 2267 | 70.1 | 5.2 | 4.3 | 25.4 | 0.0 | 0.2 | 6.0 | 1.6 | 0.0 | 0.0 | 0.0 |
| sloppy | 6 | 57 | 2577 | 60.8 | 7.0 | 3.7 | 34.7 | 0.1 | 0.6 | 7.7 | 3.4 | 0.0 | 0.0 | 0.0 |
| sloppy | 7 | 63 | 2542 | 62.2 | 7.7 | 2.9 | 34.4 | 0.0 | 0.4 | 5.9 | 2.2 | 0.0 | 0.0 | 0.0 |
| random | 3 | 28 | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 12.9 | 2.0 | 0.0 | 0.0 | 0.0 |
| random | 4 | 33 | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 12.7 | 1.4 | 0.0 | 0.0 | 0.0 |
| random | 7 | 46 | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 13.3 | 3.0 | 0.0 | 0.0 | 0.0 |
| spammer | 3 | 26 | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 9.8 | 0.7 | 0.0 | 0.0 | 0.0 |
| spammer | 4 | 30 | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 10.0 | 3.6 | 0.0 | 0.0 | 0.0 |
| spammer | 7 | 38 | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 11.4 | 3.0 | 0.0 | 0.0 | 0.0 |
| spamfish | 3 | 82 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| spamfish | 4 | 77 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| spamfish | 5 | 66 | 1600 | 100.0 | 0.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.1 | 0.0 | 0.0 | 0.0 | 0.0 |
| spamfish | 6 | 65 | 1600 | 100.0 | 0.1 | 0.0 | 0.0 | 0.0 | 0.0 | 1.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| spamfish | 7 | 69 | 1600 | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.3 | 0.0 | 0.0 | 0.0 | 0.0 |

### Hints, idle, Talk (ages 3, 4, 7)
| model | age | hints/round | idle-hints/round | assist armed % rounds | idle events/session | idle n=1..5 at s since last touch (median) | auto-pause (n=5) per session | Talk s med (p90) | Talk auto give-up % | Talk right % |
|---|---|---|---|---|---|---|---|---|---|---|
| bot0.6 | 3 | 0.13 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.7 (3.2) | 0.0 | 57.3 |
| bot0.6 | 4 | 0.15 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.8 (3.3) | 0.0 | 61.8 |
| bot0.6 | 7 | 0.14 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.7 (3.3) | 0.0 | 60.3 |
| bot0.2 | 3 | 0.63 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.7 (3.3) | 0.0 | 17.5 |
| bot0.2 | 4 | 0.61 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.7 (3.3) | 0.0 | 21.3 |
| bot0.2 | 7 | 0.63 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.6 (3.3) | 0.0 | 21.3 |
| typical | 3 | 0.11 | 0.02 | 0.0 | 0.3 | 12 / – / – / – / – | 0.00 | 4.7 (6.0) | 0.0 | 72.8 |
| typical | 4 | 0.06 | 0.02 | 0.0 | 0.4 | 12 / – / – / – / – | 0.00 | 4.3 (5.7) | 0.0 | 79.5 |
| typical | 7 | 0.02 | 0.01 | 0.0 | 0.1 | 12 / – / – / – / – | 0.00 | 3.7 (5.5) | 0.0 | 88.5 |
| slow3 | 3 | 0.33 | 0.17 | 0.5 | 2.6 | 12 / 30 / – / – / – | 0.00 | 5.7 (7.0) | 0.0 | 62.0 |
| slow3 | 4 | 0.32 | 0.17 | 0.0 | 2.5 | 12 / 30 / – / – / – | 0.00 | 5.5 (7.4) | 0.0 | 58.0 |
| slow3 | 7 | 0.32 | 0.16 | 0.1 | 2.4 | 12 / 30 / – / – / – | 0.00 | 5.2 (6.8) | 0.0 | 58.0 |
| lag3 | 3 | 0.33 | 0.17 | 0.1 | 2.6 | 12 / 30 / – / – / – | 0.00 | 5.5 (7.7) | 0.0 | 62.8 |
| lag3 | 4 | 0.30 | 0.16 | 0.1 | 2.4 | 12 / – / – / – / – | 0.00 | 5.3 (7.2) | 0.0 | 59.0 |
| lag3 | 7 | 0.36 | 0.18 | 0.3 | 2.7 | 12 / 30 / – / – / – | 0.00 | 5.2 (6.8) | 0.0 | 63.0 |
| sloppy | 3 | 0.19 | 0.02 | 1.2 | 0.3 | 12 / – / – / – / – | 0.00 | 4.5 (5.9) | 0.0 | 68.8 |
| sloppy | 4 | 0.11 | 0.02 | 0.3 | 0.3 | 12 / – / – / – / – | 0.00 | 4.3 (5.8) | 0.0 | 82.3 |
| sloppy | 7 | 0.11 | 0.01 | 0.8 | 0.1 | 12 / – / – / – / – | 0.00 | 3.8 (5.4) | 0.0 | 91.0 |
| random | 3 | 0.82 | 0.00 | 64.9 | 0.0 | – / – / – / – / – | 0.00 | 4.3 (5.6) | 0.0 | 45.8 |
| random | 4 | 0.81 | 0.00 | 61.9 | 0.0 | – / – / – / – / – | 0.00 | 4.2 (5.4) | 0.0 | 32.0 |
| random | 7 | 0.85 | 0.00 | 71.4 | 0.0 | – / – / – / – / – | 0.00 | 3.9 (5.1) | 0.0 | 33.0 |
| spammer | 3 | 0.95 | 0.00 | 33.9 | 0.0 | – / – / – / – / – | 0.00 | 3.0 (4.0) | 0.0 | 45.3 |
| spammer | 4 | 0.95 | 0.00 | 33.7 | 0.0 | – / – / – / – / – | 0.00 | 2.8 (4.0) | 0.0 | 35.8 |
| spammer | 7 | 0.98 | 0.00 | 41.1 | 0.0 | – / – / – / – / – | 0.00 | 2.7 (3.7) | 0.0 | 30.5 |
| spamfish | 3 | 0.26 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.8 (4.0) | 0.0 | 47.3 |
| spamfish | 4 | 0.33 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.5 (3.3) | 0.0 | 34.5 |
| spamfish | 7 | 0.46 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 2.5 (3.0) | 0.0 | 29.8 |
| idle | 3 | 1.23 | 1.15 | 0.0 | 13.8 | 12 / 30 / 57 / 87 / 117 | 1.16 | 4.1 (5.8) | 0.0 | 70.5 |
| idle | 4 | 1.19 | 1.15 | 0.1 | 13.8 | 12 / 30 / 57 / 87 / 117 | 1.19 | 3.5 (5.5) | 0.0 | 77.5 |
| idle | 7 | 1.19 | 1.18 | 0.0 | 13.8 | 12 / 30 / 57 / 87 / 117 | 1.23 | 3.4 (5.2) | 0.0 | 88.0 |
| tibo | 3 | 0.00 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 0.0 (0.0) | 0.0 | 0.0 |
| tibo | 4 | 0.00 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 0.0 (0.0) | 0.0 | 0.0 |
| tibo | 7 | 0.00 | 0.00 | 0.0 | 0.0 | – / – / – / – / – | 0.00 | 0.0 (0.0) | 0.0 | 0.0 |

### Speech (ages 3, 4, 7; “other” = level, weather, release, pond, talk, talkResult, great, party, surprise, critter, bite)
| model | age | lines / min | spoken % of session | spoken % of play time | lines cut | lines dropped | longest silence in play s (p90) | per session: ask / right / wrong / hint / idle / repeat / praise / lily / count / other | most cut (cut>by, per session) |
|---|---|---|---|---|---|---|---|---|---|
| bot0.6 | 3 | 21.6 | 68 | 98 | 19.3 | 6.9 | 0.9 | 15.3 / 16.0 / 3.5 / 0.0 / 0.0 / 0.0 / 9.2 / 4.0 / 0.0 / 41.2 | ask>right 11.2, wrong>right 3.4, talk>talkResult 3.4 |
| bot0.6 | 4 | 21.4 | 70 | 99 | 19.8 | 6.9 | 0.3 | 15.5 / 16.0 / 2.7 / 0.0 / 0.0 / 0.0 / 8.7 / 4.0 / 4.0 / 41.1 | ask>right 12.6, talk>talkResult 3.7, wrong>right 2.7 |
| bot0.6 | 7 | 20.3 | 65 | 99 | 19.7 | 7.5 | 0.5 | 15.7 / 16.0 / 1.9 / 0.0 / 0.0 / 0.0 / 9.1 / 4.1 / 0.0 / 41.6 | ask>right 13.4, talk>talkResult 3.9, wrong>right 1.9 |
| typical | 3 | 17.2 | 64 | 68 | 11.8 | 0.8 | 9.8 | 16.0 / 16.0 / 5.4 / 0.1 / 0.3 / 0.0 / 7.7 / 4.0 / 0.0 / 42.9 | wrong>right 4.0, talk>talkResult 3.1, ask>right 2.9 |
| typical | 4 | 17.3 | 67 | 72 | 10.3 | 0.5 | 9.3 | 16.0 / 16.0 / 2.8 / 0.0 / 0.4 / 0.0 / 6.1 / 4.0 / 4.0 / 42.1 | ask>right 3.5, talk>talkResult 3.2, wrong>right 2.3 |
| typical | 7 | 16.7 | 64 | 83 | 10.9 | 0.5 | 8.0 | 16.0 / 16.0 / 1.4 / 0.0 / 0.1 / 0.0 / 5.3 / 4.1 / 0.0 / 41.6 | ask>right 6.0, talk>talkResult 3.0, wrong>right 1.3 |
| slow3 | 3 | 15.1 | 60 | 56 | 9.5 | 0.2 | 15.1 | 15.2 / 15.2 / 8.2 / 0.2 / 2.6 / 0.0 / 7.8 / 4.0 / 0.0 / 43.6 | wrong>right 3.5, talk>talkResult 2.0, idle>right 1.9 |
| slow3 | 4 | 15.2 | 63 | 58 | 9.6 | 0.2 | 14.9 | 15.2 / 15.2 / 7.7 / 0.3 / 2.5 / 0.0 / 7.6 / 4.0 / 3.7 / 42.8 | wrong>right 3.7, talk>talkResult 2.1, idle>right 1.7 |
| slow3 | 7 | 14.5 | 60 | 60 | 9.4 | 0.3 | 14.4 | 15.1 / 15.1 / 7.7 / 0.3 / 2.4 / 0.0 / 7.5 / 4.1 / 0.0 / 42.1 | wrong>right 3.5, talk>talkResult 1.9, idle>right 1.7 |
| lag3 | 3 | 14.7 | 58 | 53 | 8.7 | 0.1 | 16.6 | 15.2 / 15.2 / 7.5 / 0.3 / 2.6 / 0.0 / 7.4 / 4.0 / 0.0 / 43.7 | wrong>right 3.1, talk>talkResult 2.0, idle>right 1.8 |
| lag3 | 4 | 15.0 | 62 | 56 | 9.5 | 0.3 | 15.8 | 15.1 / 15.1 / 7.2 / 0.2 / 2.4 / 0.0 / 7.1 / 4.0 / 3.7 / 42.7 | wrong>right 3.6, talk>talkResult 2.4, idle>right 1.7 |
| lag3 | 7 | 14.1 | 59 | 57 | 9.1 | 0.2 | 16.6 | 14.8 / 14.8 / 7.3 / 0.6 / 2.7 / 0.0 / 7.1 / 4.1 / 0.0 / 41.8 | wrong>right 3.3, idle>right 2.0, talk>talkResult 2.0 |
| sloppy | 3 | 16.8 | 63 | 66 | 11.8 | 0.8 | 12.3 | 16.0 / 16.0 / 6.1 / 0.9 / 0.3 / 0.0 / 7.6 / 4.0 / 0.0 / 43.1 | wrong>right 3.9, talk>talkResult 3.2, ask>right 2.5 |
| sloppy | 4 | 17.1 | 67 | 70 | 10.8 | 0.8 | 9.9 | 16.0 / 16.0 / 3.9 / 0.4 / 0.3 / 0.0 / 6.6 / 4.0 / 4.0 / 42.4 | talk>talkResult 3.2, ask>right 3.1, wrong>right 2.9 |
| sloppy | 7 | 16.2 | 63 | 75 | 10.7 | 0.5 | 10.2 | 16.0 / 16.0 / 2.2 / 1.1 / 0.1 / 0.0 / 5.5 / 4.1 / 0.0 / 41.8 | ask>right 4.7, talk>talkResult 3.1, wrong>right 1.5 |
| random | 3 | 16.4 | 63 | 63 | 9.6 | 1.0 | 7.8 | 15.8 / 16.0 / 5.7 / 11.7 / 0.0 / 0.0 / 7.6 / 4.0 / 0.0 / 42.0 | talk>talkResult 3.4, wrong>right 2.1, ask>right 1.9 |
| random | 4 | 16.9 | 67 | 69 | 10.5 | 1.2 | 7.8 | 15.7 / 15.9 / 6.6 / 10.9 / 0.0 / 0.0 / 8.2 / 4.0 / 3.9 / 41.4 | talk>talkResult 3.5, wrong>right 2.6, ask>right 2.2 |
| random | 7 | 16.5 | 66 | 73 | 11.2 | 1.3 | 7.5 | 15.8 / 15.9 / 9.6 / 11.2 / 0.0 / 0.0 / 9.4 / 4.1 / 0.0 / 41.2 | wrong>right 3.6, talk>talkResult 3.4, ask>right 1.8 |
| spammer | 3 | 22.1 | 75 | 92 | 23.7 | 11.5 | 5.3 | 15.0 / 16.0 / 6.7 / 10.2 / 0.0 / 6.1 / 10.0 / 4.2 / 0.0 / 46.5 | ask>right 4.4, talk>talkResult 4.0, repeat>right 3.3 |
| spammer | 4 | 22.1 | 78 | 95 | 24.7 | 14.7 | 4.7 | 15.0 / 16.0 / 6.8 / 9.8 / 0.0 / 6.1 / 10.9 / 4.1 / 4.0 / 45.6 | ask>right 4.9, talk>talkResult 4.0, repeat>right 3.5 |
| spammer | 7 | 21.5 | 76 | 97 | 25.4 | 16.8 | 4.2 | 15.1 / 16.0 / 8.4 / 10.0 / 0.0 / 6.4 / 11.7 / 4.2 / 0.0 / 47.4 | ask>right 4.4, talk>talkResult 4.0, wrong>right 4.0 |
| spamfish | 3 | 22.8 | 65 | 96 | 20.0 | 19.5 | 0.0 | 11.2 / 16.0 / 0.2 / 0.1 / 0.0 / 0.0 / 10.2 / 4.1 / 0.0 / 41.6 | ask>right 11.0, talk>talkResult 4.0, weather>right 2.6 |
| spamfish | 4 | 23.1 | 68 | 96 | 20.0 | 19.9 | 0.0 | 12.3 / 16.0 / 0.0 / 0.2 / 0.0 / 0.0 / 10.9 / 4.0 / 4.0 / 41.2 | ask>right 12.1, talk>talkResult 4.0, weather>right 2.6 |
| spamfish | 7 | 22.0 | 63 | 97 | 20.0 | 23.9 | 0.0 | 12.9 / 16.0 / 0.2 / 0.4 / 0.0 / 0.0 / 12.0 / 4.1 / 0.0 / 41.5 | ask>right 12.3, talk>talkResult 4.0, weather>right 2.4 |
| idle | 3 | 9.1 | 42 | 33 | 9.4 | 0.6 | 57.3 | 12.0 / 12.0 / 3.6 / 0.0 / 12.4 / 0.0 / 4.3 / 4.0 / 0.0 / 38.5 | talk>talkResult 3.2, wrong>right 2.7, ask>right 2.1 |
| idle | 4 | 9.0 | 43 | 34 | 8.5 | 0.5 | 54.3 | 12.0 / 12.0 / 2.0 / 0.0 / 12.4 / 0.0 / 3.2 / 4.0 / 3.0 / 37.9 | talk>talkResult 3.2, ask>right 2.6, wrong>right 1.7 |
| idle | 7 | 8.5 | 43 | 35 | 8.3 | 0.3 | 55.1 | 11.7 / 11.7 / 1.0 / 0.0 / 12.4 / 0.0 / 2.3 / 4.1 / 0.0 / 37.1 | ask>right 3.5, talk>talkResult 3.2, wrong>right 0.9 |
| tibo | 3 | 8.6 | 80 | 79 | 0.0 | 0.0 | 4.1 | 1.0 / 0.0 / 0.0 / 0.0 / 0.0 / 97.2 / 0.0 / 0.0 / 0.0 / 2.0 |  |
| tibo | 4 | 8.6 | 80 | 79 | 0.0 | 0.0 | 4.0 | 1.0 / 0.0 / 0.0 / 0.0 / 0.0 / 97.8 / 0.0 / 0.0 / 0.0 / 2.0 |  |
| tibo | 7 | 6.5 | 84 | 84 | 0.0 | 0.0 | 4.0 | 1.0 / 0.0 / 0.0 / 0.0 / 0.0 / 72.5 / 0.0 / 0.0 / 0.0 / 2.0 |  |
