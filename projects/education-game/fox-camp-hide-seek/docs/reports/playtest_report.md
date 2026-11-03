# Pip's Camp Hide & Seek — high-speed playtest report (2026-11-03)

Owner: high-speed playtester. Game code is untouched; every proposal below was measured by re-simulating with a `--config`
override or a sim-only code patch (`tests/sim/patches.js`, applied to the loaded `FC` in the sim process only).

## What was played

| run | sessions | what | output |
|---|---|---|---|
| `playtest.js --n 60 --fast` | 1 500 | ages 3–7 × bot 0.5 / 0.8 / 0.95 / typical child / random tapper | `tests/sim/out/playtest.md` |
| `hs_extra.js --n 24 --fast` (new) | 1 680 | typical, thoughtful (skill 0.97, think 3–5 s), guesser (`bot0`), bots 0.5 / 0.8 / 0.95, repeater; **2 sessions in a row** each (topic rotation) | `hsx_base.md` |
| `hs_playtest.js` edge | 720 | spammer (6 taps/s on places, also during count/peek), spammerAny, sloppy, absent, talkAbsent, tapper | `hs_edge.md` |
| patch / config A/B | ≈ 2 600 | realTap, emptyHint, noRepeat, partyTime/leaveMax, wrongLock, chapterMinRounds | `hsx_patch*.md`, `hs_g0/g1/g3.md`, `hs_paceA0/A1.md` |
| `hs_browser.js` (real page, Playwright) | 6 | `?speed=8&bot=1&mute=1`, ages 4 / 3 / 7, **iPhone portrait 393×852 and landscape 852×393** | `hs_browser.json` |

New child models (`tests/sim/hs_models.js`): **repeater** (taps the same screen point again and again for the whole round),
**repeaterSoft** (same, but taps a glowing place with p 0.5), **pipGrass** (40 % taps on Pip, 35 % on the grass, 25 % on a
place), **thoughtful**. `bot0` = a pure guesser (random untried hidden place). In total ≈ 6 500 sessions.

## Headline numbers (before changes)

| age | typical chapter mean / p90 (s) | typical session mean / max (s) | bot 0.5 / 0.8 / 0.95 chapter (s) | ★★★ / ★ % typical | wrong / ask typical |
|---|---|---|---|---|---|
| 3 | 70.5 / 79.0 | 289 / 324 | 58.8 / 54.8 / 53.1 | 47 / 13 | 0.46 |
| 4 | **79.6 / 91.7** | 325 / 372 | 69.8 / 63.7 / 61.1 | 49 / 17 | 0.35 |
| 5 | 89.1 / 99.1 | 364 / 395 | 89.1 / 78.9 / 74.7 | 50 / 20 | 0.24 |
| 6 | 95.8 / 104.5 | 390 / 428 | 101.0 / 91.6 / 86.6 | 49 / 17 | 0.18 |
| 7 | 92.0 / 101.3 | 375 / 406 | 101.6 / 92.1 / 87.0 | 64 / 8 | 0.11 |

- Targets: toddler chapter 60–100 s **PASS** (3: 70 s, 4: 80 s); typical session ≤ 8 min **PASS** (max 428 s); 1 500/1 500
  bot/typical/tapper sessions finish, no NaN, deterministic. The random tapper overruns at 5–7 (805–1 133 s, up to 25 min).
- **Watching vs asking** (typical 4): ask 36 %, show (gather/count/peek/found/swap/party) 45 %, leave 6 %, other 13 %.
  Round start → 1st tap possible: **3.9 s** (p90 4.3) at every age; party + leave: 3.7 s; longest stretch without a possible
  tap inside a round 6.4 s. From the last find to the next question: ≈ 8.6 s.
- **Help**: the 2nd miss glowed in **every** case (0 of 1 600+ 2nd misses without glow, all models). Typical children never
  needed an idle nudge after the 1st (12 s). Idle nudges fire at 12 · 30 · 57 · 87 · 117 s into an ask; the absent child is
  auto-paused at 123 s session time (5th idle), talkAbsent at 111–141 s (4th Talk re-ask).
- **Answer bias**: none. 2 places 47–53 %, 3 places 33/34/33, 4 places 25/25/25/26, 5 places 19–21 % each; back row 35 % (age 4).
- **Guessing vs thinking** (stars / round, age 4): thoughtful **2.94** · typical 2.33 · spammer 1.65 (55 % one-star) · random
  guesser 1.25. Thinking clearly wins on stars. On speed a spammer wins at age 3 (2 places: chapter 52.6 s vs 70 s) — fine
  for 3-year-olds, the stars still say "slow down". The tap lock fires 7–17× per ask for a spammer.
- **Talk time**: typical right 66 % (3) · 75 % (4) · 83 % (5) · 91–98 % (6–7), answered in 4.5 s, never needed a re-ask.
  Answer slots balanced (≤ 41 %).
- **Repeats**: topics rotate well (0.3–1.1 of 4 chapter topics equal to the previous session). Identical rounds inside a
  session: 6/768 at age 3, ≤ 6/768 elsewhere (OK). **But ≈ 9 % of rounds at ages 3–4 open with exactly the question that
  closed the previous round** (69–71 per 768 rounds, not counting count-up "find 1") — see change 3.
- **Real page = headless world**: 6/6 browser sessions finished with **0 console errors**; session times 249–402 s vs headless
  twins (same seed, bot seed 7) 236–397 s, identical stars / wrong / hints (40/11/0, 41/10/0, 34/21/2) — within 2–3 % on time.

## Bugs / weak spots found

1. **A child who keeps tapping an EMPTY place (or Pip) never gets help — the round never ends.** `pointerDown` calls
   `this._touch()` for a found place (`'empty'`) and for Pip, which resets the idle clock, so no idle nudge, no idle hint,
   no auto-pause. Only real peeks should count. repeater / repeaterSoft at ages 3–7: **0–3 of 48–60 sessions finish**; every
   one sits on an ask with **no hint at all** for > 60 s (up to the 600 s cap).
2. **The leftover friend's party reveal is silent**: `world` emits `reveal`, `main.js` has no `case 'reveal'` → the last
   friend pops out with no pop/rustle sound, no burst and no name. Every other reveal has a chime + flare + "Found you!".
3. Back-to-back identical question across a round boundary (above).
4. **Count line vs question**: `countNum.3` "Three! Ready? Here I come!" starts at 1.9 s; the ask (priority, queued, not
   interrupting) starts ≈ 2.6–2.9 s, so the question is heard ≈ 1 s after the tap window opens (≈ 1.8 s TTS at rate 0.9;
   Voice's fallback estimate is 3.1 s). Effective "watch" before the question ends is ≈ 6–7 s per round, not 3.9 s.
5. Random tapper / very slow child at 5–7: chapters 150–280 s, sessions up to 25 min — the 80 s chapter limit only applies
   after 3 rounds.
6. Spammer → `locked` boop up to 6×/s (one per locked tap).
7. Content skew: count answer "1" = 50 % (age 3) / 35 % (age 4) of count answers (warm-up count-up round asks only "1");
   colours age 4: yellow 33 %, orange 1–2 %; `initial` (6–7): pig 19–20 % of answers, dog 6–9 % of friends.
8. `?bot=1` always uses bot seed 7, so every bot session plays the same right/wrong pattern whatever `?seed=` is.

## Ranked changes for the team (before → after, sims)

| # | change (exact) | before → after |
|---|---|---|
| 1 **P0** | `world.js pointerDown`: drop `this._touch()` in the `p.found` (`'empty'`) branch and in the `'pip'` branch (Pip still repeats the prompt via `pokePip`; only a real peek or the squirrel resets the idle clock). Sim: `--patch realTap` | repeaterSoft sessions finished: age 3 **3/60 → 60/60**, age 4 **0/60 → 60/60**; asks > 60 s with no hint 57 / 60 → **0 / 0**; pipGrass idle hints/ask 0.00 → 0.08; typical 4 unchanged (session 324 → 323 s, ★★★ 50 → 50 %). Pure repeater (never follows the glow) now gets nudges at 12/30/57/87 s and auto-pauses at the 5th instead of looping forever |
| 1b optional | also glow the answer on the 3rd empty/Pip tap of one ask (`this._doHint(true)`). Sim: `--patch emptyHint` | vs 1: repeaterSoft 4 session 481 → **436 s**, ask p90 32 → 23 s; pipGrass hint/ask 0.08 → 0.51, session 536 → 510 s; typical unchanged |
| 2 **P1** | `main.js`: add `case 'reveal'`: `FC.Audio.play('rustle'); FC.Audio.play('pop');` + `render.burst('pop', p.x, placeTop(p).y, {size: p.w*0.6})` and a short giggle (`FC.Audio.play('giggle')`); no speech (the party line follows) | the 4th/5th/6th friend's appearance gets the same "boo!" moment as the others (not simulable; voice queue unchanged) |
| 3 **P1** | `content.js makeRound(o.avoid)`: reject an attempt whose `asks[0]` has the same `promptKey + params` as `o.avoid` (skip for `p.countUp`); `world._beginRound` passes the previous round's last ask. Sim: `--patch noRepeat` | same question twice in a row: age 3 **71 → 0**, age 4 **69 → 0** per 768 rounds; timing, stars, validate() unchanged |
| 4 **P2** | `i18n.js countNum.3`: drop the "Ready?" variant → `['Three! Here I come!', 'Three! Found you soon!']` (vi `'Ba! Pip tìm nè!'`), and `CONFIG.countAt [0.3, 1.1, 1.9] → [0.3, 1.0, 1.7]` | the question starts ≈ 0.6 s earlier (TTS estimate); sim timing identical (countTime 2.6 still governs) |
| 5 **P2** | `CONFIG.chapterMinRounds 3 → 2` (Talk after 2 rounds only when the chapter is already > 80 s) | typical 4 / 6 **unchanged** (78.0 / 96.0 s, 0 / 2 % cut); tapper 4 session 510 → 466 s (max 716 → 552); tapper 6 **1 142 → 640 s**; slow3 on age-6 content 594 → 467 s |
| 6 **P2** | `main.js case 'locked'`: play `boop` at most every 0.4 s | spammer boops 6/s → ≤ 2.5/s (not simulable) |
| 7 **P3** | count topic: round 0 = stars round (`p.count`), count-up only in round 1 (`content.js` line 329 `ri < 2` → `ri === 1`) | "1" share of count answers ≈ 35 % → ≈ 20 % (estimate from the round mix) |
| 8 **P3** | colours < 5: when several 3-sets fit, pick the ask order so the yellow hat is the leftover in half the rounds; `initial`: draw the leftover from the full animal list | yellow 33 % → ≈ 22 % of colour answers (estimate) |
| 9 **P3** | `main.js` bot seed: `seed: (FLAGS.seed != null ? FLAGS.seed : 7) + 1` | demo/bot sessions differ per seed |

**Rejected (measured):** `partyTime 2.2 → 1.8, leaveMax 2.0 → 1.6` — **no effect at all** (typical 4 chapter 78.3 → 78.3 s):
the party is bounded by the leftover friend hopping to its seat, and the leave finishes in ≈ 1.3 s. `wrongLock 0.8 → 1.2` —
slows the typical 4-year-old (chapter 78.0 → 81.5 s, ★★★ 46 → 41 %) and barely touches the spammer (★ 55 → 61 %).

## Playtester's verdict

- **Fun and variety for a 4-year-old: good.** 4 seasons × 4 topics, every round a fresh mix of 8 animals and clues, a surprise
  per chapter (swap or squirrel), no answer-position pattern a child could learn, topics rotate between sessions. Rounds
  ramp 2 → 3 → 4 → 4 places, so the warm-up is a near-certain win.
- **Is the count-and-hide too long?** No. 3.9 s (≈ 1.3 s hop-in + 2.6 s count) is the anticipation moment and doubles as
  counting practice; trimming it would save < 1 s/round. What drags is *after* the count: the question is spoken late
  (change 4). Watching 45 % of play is high but it is the show (friends running, ducking, popping) — keep it.
- **Does the reveal feel rewarding?** Each find: yes (pop overshoot, jump out, rising chime, fire flare, seat + dance).
  The party reveal of the last friend is the weak spot — silent (change 2).
- **Confusing?** The empty-place trap (change 1) is the one real risk: a 3-year-old who keeps tapping the bush where she just
  found the cow hears "Nobody there now — just a butterfly!" forever with no glow. Everything else (2nd-miss glow, idle
  nudges, Talk glow, auto-pause) works exactly as designed.
- Stars for typical children land at ≈ 50 % ★★★ for every age (good calibration); thinking beats guessing 2.9 vs 1.3 stars.

Re-run: `node tests/sim/hs_extra.js --n 24 --fast [--patch realTap,noRepeat]`, `node tests/sim/hs_playtest.js --n 24 --fast
--models … [--config '{"chapterMinRounds":2}']`, `NODE_PATH=$(npm root -g) node tests/sim/hs_browser.js --sessions 2 --ages 4
--vp iphone-portrait,iphone-landscape`.
