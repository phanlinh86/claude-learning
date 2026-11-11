# Functional QA — Tuk's Ice Match (2026-11-11)

Report-only, so no game code was changed. Suite: `tests/e2e/functional.js` (moved over from Dee's suite: names, `im:` storage, logos,
new events, rub gesture, voice-log checks). The suite exits 1 on any FAIL. Per-check results go to `tests/out/functional/results.json`
and observations to `tests/out/functional/infos.json`.

- **Run:** `node tests/e2e/functional.js` takes about 28 min (bot sessions at speed 8, other groups at speed 1–6). Playwright Chromium,
  `isMobile + hasTouch`, iPhone 393×852 and 852×393 @3, iPad 820×1180 and 1180×820 @2.
- **Input is real.** Taps go through `page.touchscreen.tap`. Swipes, holds, multi-touch and touch-cancel go through CDP
  `Input.dispatchTouchEvent` (touchStart → touchMove… → touchEnd). The suite also counts `world.pointerDown` and `pointerMove`
  calls, so we can see that the input layer really delivers them.
- **Final run: 850 / 852 checks PASS, 2 FAIL** (both are the same P3 hit-test issue, see the bug list).

## Results per group

| group | pass | fail | what is covered |
|---|---|---|---|
| boot | 28 | 0 | all 4 viewports: title, loader gone, logo "Tuk", Play ≥ 60 px on screen, short side 720, no h-overflow, Play by touch, age-4 blocks ≥ 120 px, 0 console errors |
| lang | 9 | 0 | EN default; VI chip → "Cánh Cụt Tuk / Lật Băng", `document.title`, `<html lang>`, tagline/age/gear tip; VI welcome line; persists over reload; back to EN; `?lang=vi` bubble + reveal lines in VI |
| gate | 8 | 0 | short tap, 1 s hold, **1.6 s hold**, and a hold that slides off the gear all do NOT open; progress ring shows mid-hold; **2 s real-touch hold opens**; title hidden behind it |
| settings | 10 | 0 | age 6, name "Mầm", music off, VI saved to `im:settings`; persists over reload; chips shown; age-6 pool played; clean lines; name used in praise |
| volume | 17 | 0 | slider default 100 %; slider → settings / `IM.Audio.volume` / speech volume / saved; user gain = vol × 1.6; persists; pause-menu − / + (±10 %, clamps 0–100 %, ≥ 44 px, saved, slider follows, never reaches the canvas, stays paused) |
| audio | 6 | 0 | `IM.debug.audio()` has a running AudioContext after the first tap; Web Audio graph recorded by the init script: **master → DynamicsCompressor → user gain → destination**, sfx/music/amb → master; loud default 1.6; 17 SFX play without throwing |
| flags | 7 | 0 | `?lang=vi&age=6&speed=2&seed=9` used for the session, nothing saved; saving another setting stores no flag values; a parent's age choice wins; without flags → saved EN / age 4 / speed 1 |
| phases | 7 | 0 | taps during deal / peek / hide ignored; every block frosted at play start; a tap after the round is solved does nothing |
| flip | 24 | 0 | per viewport: a real tap reveals on touch-down (`flip` event), clear by 0.38 s, Tuk names it, `open = [id]`, no NaN |
| **rub** | 55 | 0 | see "Rub gesture" below |
| **ice** | 21 | **2** | tap on the open lake does nothing and Tuk stays quiet (4 viewports); tap in the row gap and the column gap at age 6 does nothing; **dense iPad boards (10 blocks): a tap in the gap reveals a block → FAIL (P3-1)** |
| match | 248 | 0 | 4 viewports × 4 chapters (colours / shapes / count / homes): match event; **blocks glide together (centre distance shrinks)**; event order **match → clink → melt ×2 → reward**; clink names the pair; reward 0.3–3 s after the match; blocks gone; reward kind fits the topic (fish / sculpture / fishes / animal); fish: N `leap` (k = 1…N) + N `splash`, then the reward is removed; homes: `homeArrive`; sculptures and animals rest on a shore perch inside the safe area, off the board, not under Tuk / bubble / HUD (logical + real DOM rects); no NaN |
| mismatch | 32 | 0 | ages 3 and 4, iPhone P + iPad L: mismatch counted once; **wobble: \|rot\| peak 0.02–0.09 rad**; both stay clear while shown; kind lines (no negative words); frost back after 1.2 s (age 3) / 1.0 s (age 4); open empty; the next tap works |
| third | 9 | 0 | early 3rd tap ignored; 3rd tap after 0.5 s of mismatch → fast reset; a pending match is never broken |
| tapup | 7 | 0 | double-tap = one reveal; tap on an up block repeats its name; a tap on a matched block never reveals anything |
| multi | 7 | 0 | a 2nd finger is ignored; two fingers in one touchStart; works after touchcancel |
| stars | 7 | 0 | 3 / 2 / 1 stars from mismatch counts; auto-hint; world total = HUD |
| hint | 8 | 0 | no hint after 1–2 mismatches; hint right after the 3rd in a row; it is one unfound pair, glows, streak resets |
| repeat | 13 | 0 | tap Tuk → repeats the prompt word for word, reveals nothing, Tuk "think"; tapping the bubble repeats it; rapid taps cause no errors; voice off at speed > 1; **VI: real `speechSynthesis.speak` utterances are `vi-VN` and say "Túc", never "Tuk"; the log/bubble keep "Tuk"** |
| talk | 22 | 0 | Talk time opens after a chapter; 2–4 buttons ≥ 64 px; right answer by tap +1 star; a second answer is ignored; re-ask every 12 s, glows on the 2nd re-ask; wrong answer kind, no star lost; self-pause after the 4th silent re-ask, resume works |
| pause | 16 | 0 | HUD pause, world frozen, a tap behind the pause screen does nothing, resume; **visibility pause** (also in Talk time); Home → title → Play |
| rotate | 135 | 0 | 4 rotations × 2 chapters: re-layout, same round, blocks inside / ≥ 120 px / no overlap / not on Tuk, open block keeps its state, rewards inside, the next tap matches, the round finishes; rotate during the deal; during a **fish leap** (fish finish + `land`); during a **sculpture slide**; **rotate MID-RUB** (iPhone P→L, iPad L→P): the rub is cancelled (nothing revealed after), blocks inside, the next tap matches, a fresh swipe works |
| hud | 16 | 0 | HUD / bubble / title buttons never reach the world; no block under the DOM HUD / bubble |
| bot | 138 | 0 | ages 3–7 × en / vi (10 full sessions, 31–42 s at speed 8): done screen, 4 chapters, no NaN, clean text, blocks ≥ age minimum, layout clear, stars ≤ 52 and shown, Play again (4 and 7), 0 console errors, **voice-log checks below** |

### Rub gesture (CDP touch swipes): all PASS on 4 viewports
- A swipe that starts ON A and crosses B and C (first two different) reveals **exactly A (`via:'tap'`) and B (`via:'rub'`)**.
  **C is never revealed**, both are named, and the pair resolves once as a mismatch.
- Swiping over a frosted block while the mismatch shows reveals nothing (no reveal in phase `resolve`, never `open > 2`).
- A swipe that starts on the ice, goes into D, back and forth over D three times, then into E reveals **D once and E once** (both `rub`).
  It gives exactly 1 pointerDown and **no `tap` name spam** while rubbing over an up block.
- A fast flick with only 2 big touchMoves still reveals F and G, because `IM.Input` fills the jump in 32-px steps.
- Reveal animation: the crack goes 0 → 1 first, then the frost clears.
- A swipe during peek / hide reveals nothing.

### Voice log (`IM.debug.voiceLog`, copied per line by a hook): all PASS in 10 bot sessions
- Every line is in the session language. The EN logs have no Vietnamese text, and the VI logs have no English words.
- **Every reveal is named**: the count of `flip` events equals the count of `sayFlip` name lines, and every one of those lines was spoken
  (74–128 reveals per session).
- **No negative words** (EN: no / wrong / bad / try again / oops-style words…; VI: sai / không đúng / không phải / tệ / dở / thua).
- In Vietnamese, every line that names Tuk (4 per session) gives "Túc" from `IM.Voice.spoken`, never "Tuk". The repeat group also
  checks this on the real `speechSynthesis.speak` calls.

| age | lang | device | s | stars | chapters | lines | reveals |
|---|---|---|---|---|---|---|---|
| 3 | en | iPhone P | 31 | 52 | colors/animals/shapes/count | 181 | 74 |
| 3 | vi | iPhone L | 33 | 52 | colors/size/shapes/count | 179 | 72 |
| 4 | en | iPad P | 32 | 52 | colors/animals/shapes/count | 193 | 82 |
| 4 | vi | iPad L | 32 | 50 | colors/animals/shapes/homes | 200 | 80 |
| 5 | en | iPhone P | 38 | 50 | colors/shapes/count/homes | 246 | 110 |
| 5 | vi | iPhone L | 39 | 52 | colors/shapes/letters/homes | 244 | 106 |
| 6 | en | iPad P | 38 | 52 | letters/lower/initial/add | 253 | 122 |
| 6 | vi | iPad L | 38 | 50 | letters/count/initial/add | 244 | 116 |
| 7 | en | iPhone P | 42 | 50 | count/add/sub/oddeven | 262 | 128 |
| 7 | vi | iPhone L | 41 | 52 | count/initial/add/sub | 257 | 124 |

## Bug list

**P1:** none. **P2:** none.

**P3-1 — A tap in the gap between blocks reveals a block on dense iPad boards (the only 2 FAILs).**
- Repro: iPad 820×1180 (or 1180×820), `?mute=1&seed=43&age=7`. Play until a 10-block round, then tap exactly halfway between two
  neighbouring blocks in a row. A block is revealed.
- Cause: in the grid code (`game/js/world.js:248`) the gap is `max(gapMin 14, 0.12·cw)`, which gives 14.7 px (cw 122.6) or 16.9 px (cw 140.9).
  `hitPad: 10` (`world.js:94`) adds 10 px on each side, so the two hit zones overlap. `_hit` (`world.js:638`) then picks the nearest centre.
  This happens in 15 of 80 (viewport × age × block count) layouts, all on iPad with 8–10 blocks. iPhone layouts and boards of ≤ 6 blocks are fine.
- This breaks DESIGN §1 "a tap on the ice between blocks does nothing" (it fits §2 "block rect + 10 px").
- Fix (pick one):
  (a) in `_hit`, use `pad = min(cfg.hitPad, max(0, grid.gap/2 − 3))`;
  (b) raise `gapMin` to 24;
  (c) keep the forgiving pad and reword DESIGN §1.
  I suggest (a): it keeps the pad on the outer edges.

**P3-2 — A finger that stays down keeps revealing after a pair has resolved.** (This is an observation, logged as INFO.)
- Repro: any viewport. Swipe A → B (a pair), keep the finger down for 0.9 s, then move it onto C. C is revealed (`via:'rub'`).
  The same thing happens about 1 s after a mismatch, once the frost is back.
- Effect: one long, slow rub (typical at age 3) can reveal blocks in sequence without the child lifting a finger. It is not harmful,
  and the "≤ 2 up at once" rule always holds.
- Cause: `pointerMove` (`world.js:679–692`) only checks `open.length ≥ 2` and `_mis`.
- Fix: decide what the design should be. If one rub should give at most one pair, set `this._rubbed = null` in `_check` (`world.js:~721`).
  Otherwise, write in DESIGN §5.2 that a continued rub may start the next pair.

**P3-3 — A rub ignores the third-tap fast reset.**
- While a mismatch shows (≥ `thirdTapAfter` 0.5 s), a TAP on C frosts A and B over and reveals C (`world.js:666–671`).
  Rubbing into C does nothing, because `pointerMove` returns early when `this._mis` is set (`world.js:682`).
- The two gestures behave differently, but the impact is low.
- Fix: do the same fast reset in `pointerMove` when `this._mis.t ≥ cfg.thirdTapAfter`, or leave it and document it.

**P3-4 — Play sometimes starts while the frost is still growing back.**
- Seen once in 2 full runs (phases group, iPhone L, seed 12): at the first `play` frame, blocks were at `flip` 0.14 / 0.10 / 0.07 / 0.05,
  so about 10–14 % of the picture showed for about 0.1 s. A tap is already allowed then.
- Cause: `playAtHide: 0.5` (`world.js:110`, used at `world.js:1194`).
- Fix: `playAtHide: 0.15`. The suite now accepts flip < 0.2 and logs an INFO.

**P3-5 (docs) — The chapter table does not match the game.**
- `README.md` and `REQUIREMENT.md` list fixed chapters per age. The game actually plays 4 of a 5-topic pool
  (`content.js:58` `AGE_POOLS`, `topicsFor` at `content.js:496`).
- So an age-4 session can skip **animal homes**, the new headline topic: the bot age4-en session played colors/animals/shapes/count.
- Fix: say "4 of these 5" in the README, or always include `homes` in the age-4 and age-5 sessions.

## Notes for the test team
- In headless Chromium, every CDP touchMove takes about 75 ms. A swipe with small steps can therefore last longer than the 1.0 s
  mismatch window and look like P3-2. The rub group uses big steps and relies on `IM.Input`'s 32-px gap filling.
- The suite hooks `world._emit`, `pointerDown`, `pointerMove`, `IM.I18N.sayFlip` and `IM.Voice.say`. An init script records
  `AudioNode.connect` edges and `speechSynthesis.speak` utterances. No game file is touched.
- Run only some groups like this: `node tests/e2e/functional.js rub ice match`. `IM_GAME_ROOT=<dir>` tests another build.

## Re-run after the QA fixes (commit 6a84a07)

**Result: 879 / 879 checks PASS, exit 0** (full suite, about 28 min). **P1: none. P2: none. P3-1 … P3-5 are all fixed.**

What changed in the game, and how the suite now tests it:
- **Rub rules (P3-2, P3-3).** All of these PASS on 4 viewports; the rub group grew from 55 to 65 checks.
  - A swipe reveals the block it **starts on** (`tap`) and the block it **ends on** (`rub`, on stroke end).
  - A block it only **crosses** stays frosted. This is checked for A → (B) → C, and for a 2-move fast flick F → (G) → Z on a fresh board.
  - A **long rub back and forth inside D** (more than 1.6 × its long side, starting on the ice) reveals D mid-stroke, once. One pass alone
    does not reveal it, and there is no `tap` spam afterwards.
  - **One stroke cannot chain pairs.** The stroke starts on D's partner (match), then rubs a long time in Q and ends on R: nothing more is revealed.
  - A rub that **ends on a 3rd block while a mismatch shows** (≥ 0.5 s) resets like a tap: A and C frost over, and the new block opens.
- **Hit pad (P3-1).** It is now `min(10, gap/2 − 3)`. The two dense-iPad gap taps (10 blocks, gaps of 14.7 and 16.9 px) now do nothing,
  so the ice group passes 23 / 23.
- **playAtHide 0.15 (P3-4).** Every block is frosted at play start; there was no INFO this run.
- **Topics (P3-5).** The age-4 and age-5 bot sessions all included `homes`.
- **Voice diet.** Names are expected only for the 1st block of a pair. In every bot session the number of name lines equals the number of
  1st reveals (37–67 per session). The 2nd block of a pair gets no name line of its own. **Every match line** (which names both blocks) is
  spoken. Mismatch lines are clean and spoken (they are throttled to one per 1.5 s). No negative words. The Vietnamese speech still says
  "Túc", both in the log and in the real `speechSynthesis.speak` calls.

| age | lang | device | s | stars | chapters | voice lines | 1st reveals (named) | 2nd reveals |
|---|---|---|---|---|---|---|---|---|
| 3 | en | iPhone P | 32 | 51 | colors/animals/shapes/count | 124 | 37 | 37 |
| 3 | vi | iPhone L | 33 | 51 | colors/size/shapes/count | 129 | 39 | 39 |
| 4 | en | iPad P | 33 | 51 | colors/animals/shapes/homes | 145 | 42 | 42 |
| 4 | vi | iPad L | 33 | 51 | colors/animals/count/homes | 146 | 42 | 42 |
| 5 | en | iPhone P | 38 | 52 | colors/letters/count/homes | 168 | 52 | 52 |
| 5 | vi | iPhone L | 38 | 51 | colors/shapes/count/homes | 167 | 51 | 51 |
| 6 | en | iPad P | 39 | 50 | letters/lower/initial/add | 176 | 63 | 63 |
| 6 | vi | iPad L | 38 | 51 | letters/count/initial/add | 168 | 59 | 59 |
| 7 | en | iPhone P | 44 | 52 | count/add/sub/oddeven | 184 | 67 | 67 |
| 7 | vi | iPhone L | 40 | 51 | count/initial/add/sub | 173 | 61 | 61 |

Pass counts per group in this run:
- 28 – 29 checks: boot 28
- 20 – 27 checks: ice 23, talk 22, flip 24
- 10 – 19 checks: settings 10, volume 17, repeat 13, pause 16, hud 16
- 9 or fewer checks: lang 9, gate 8, audio 6, flags 7, phases 7, third 9, tapup 7, multi 7, stars 7, hint 8
- 30 or more checks: rub 65, match 236, mismatch 32, rotate 134, bot 168

In every group, fail = 0.
