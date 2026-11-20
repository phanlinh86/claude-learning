# Functional QA — Pip's Reef Tower (2026-11-20)

Suite: `tests/e2e/functional.js` (Playwright Chromium, `isMobile` + `hasTouch`, real CDP `Input.dispatchTouchEvent` taps
and drags). Viewports: iPhone 393×852 @3 and 852×393 @3, iPad 820×1180 @2 and 1180×820 @2.
Run: `JOBS=4 node tests/e2e/functional.js` → **585 pass, 0 fail, 400 s, exit 0**. It exits 1 on any FAIL (the first run
exited 1 because of the stale test checks listed below).

## What changed in the test file (the only file edited)
- **Fixed stale checks from Koko's Cake Tower:** settings, flags, volume and countup read `localStorage['ck:settings']`
  and asserted "only `ck:` keys". The game correctly uses `rt:`, so this caused 6 false FAILs, and one TypeError that
  stopped the volume group early. All now use `rt:`. Labels that said "cake" now say "tower".
- **New group `tapx`** (3 devices: iPhone P→L, iPad L→P, iPhone L→P):
  - wrong-block tap #1: lift → fall → bounce → home → rest; `wrong` event; `askMisses` 1; tower unchanged; no hint yet.
  - gentle bounce, recorded every frame: the block stays on screen, gets home within 2.5 s, tower sway ≤ 0.12 rad, peak
    speed ≤ 1050 px/s.
  - wrong tap #2 → `hint` on the right block, `glow > 0`, ghost hand on it.
  - taps during the bubble lift (on the same block and on the other block) are ignored: one tapPiece/drop/stack, tower +1.
  - double tap (90 ms apart) on the right block → exactly one block sent.
  - rotate mid-lift (right block) → it still stacks, nothing off screen; rotate mid-lift (wrong block) → block home, phase
    `ask`, no stuck press; rotate mid-bounce → phase `ask`, on screen; a right tap afterwards stacks.
- **New group `words`**: every EN and VI i18n string (148 keys each) plus the title page text have no
  cake/cupcake/koala/Koko/cherry/candle/frosting/bee (EN) or bánh kem/nến/anh đào/gấu túi/con ong (VI) words. "bee" is
  allowed only when it is the spoken name of the letter B.
- **Bot group**: each of the 10 full sessions (ages 3–7 × EN/VI) also checks that the voice log has none of those words.

## PASS / FAIL by area
| Area | Group(s) | Result |
|---|---|---|
| Boot, title, Play by touch, 4 viewports, no overflow | boot | PASS 36/36 |
| Language switch (chip, persist, `?lang=`, VI diacritics) | lang | PASS 10/10 |
| Parent gate: short tap / 1 s / slide-off do NOT open, 2 s hold opens, progress ring | gate | PASS 7/7 |
| Settings persistence (age, name, music, lang, volume), only `rt:` keys | settings | PASS 10/10 |
| URL flags never saved (lang/age/speed/seed/mute/level/bot) | flags, countup | PASS |
| Audio chain (ctx, master, user gain, sfx, music, compressor, ×1.6 makeup), volume slider + pause −/+ | volume | PASS 12/12 |
| Real drag: correct → grab/drop/land/stack, done sequence, stars | drag | PASS 36/36 |
| Wrong drop: bounce home, kind words, lock, 2nd → hint + glow, 1 star | wrong | PASS 33/33 |
| Drag miss on the sand → home, soft-tap hint, tap assist | miss | PASS 24/24 |
| TAP to send: wrong tap bonks off, names the block (EN/VI), right tap stacks | tap | PASS 19/19 |
| Wrong tap ×2 → hint, gentle bounce, taps during lift, double tap, rotation mid-lift / mid-bounce | tapx (new) | PASS 39/39 |
| Pip / bubble repeat the prompt | poke | PASS 27/27 |
| Second finger, touchcancel | multi | PASS 12/12 |
| Talk time answered by tap, pause during Talk | talk | PASS 38/38 |
| Pause / resume / Home; visibility pause (also mid-drag) | pause, visibility | PASS 11/11, 8/8 |
| Rotation mid-drag and mid-fall (4 pairs) | rotate | PASS 36/36 |
| Count-up chapter order | countup | PASS 27/27 |
| Idle nudges, hint, auto-pause | idle | PASS 7/7 |
| Puffer: real tap → loop, 2nd tap ignored, not a miss | puffer | PASS 27/27 |
| Full bot sessions, ages 3/4/5/6/7 × EN/VI: 4 chapters, 4 Talk times, prompts spoken, no raw keys, no negative or Koko-era words | bot | PASS 131/131 |
| Party screen, Play again, Home, total stars persist | done | PASS 11/11 |
| Layout audit of every ask (≥ 10 per device) | layout | PASS 12/12 |
| Zero console errors / HTTP ≥ 400 | every group | PASS |

Bot sessions, per run: 28–45 s real time, 305–411 s game time, stars 28–44.

## Bugs (prioritised)
**P1:** none found.

**P2:** none found.

**P3**
1. **The wrong-tap bounce falls home fast in iPhone landscape.** Peak speed was 1044 px/s at 852×393 (865 iPhone
   portrait, 772 iPad landscape). That is about 2.5× the 420 px/s sinking speed, so the "drifts home" return looks like
   a dry-land drop, against the DESIGN rule "nothing falls fast" in the water.
   Repro: `node tests/e2e/functional.js tapx`, iPhone landscape, seed 37, age 4: tap a wrong block and read `peak` in
   the "bounce/home speed" line. The check limit is 1050, so this line is only just passing and may become flaky.
   Suspected cause: `game/js/world.js:868` `_arcHome(p, cfg.bounceApex)` is a ballistic arc with `gHome 1500`
   (`world.js:65`) from the high tower top down to the slot. A fix could be a drag-limited or slower home arc only for
   `_wrong` pieces (for example cap the arc's vertical speed near `vTerm`), then re-run `tapx` and `wrong`.
2. **A first session can skip a headline skill.** Default age 4, seed 104, clean storage played
   colors/animals/size/shapes, with no counting. Age 3 seed 103 played count instead of size. REQUIREMENT lists
   "counting 1–5" for age 4 (and "big & small" for age 3). Cause: `game/js/content.js:58-64` `AGE_POOLS` lets the 4
   chapters be drawn from 5 topics even on the very first session. Suggestion: the first session (no `rt:lastTopics`)
   should use `AGE_TOPICS[age]`.
3. **Koko-era words are still in code comments** (about 80 lines mention cake/cloud/stand/plate, for example
   `world.js:12-35`, `world.js:634`, `world.js:907`, `world.js:922`, `content.js:68`). The player never sees or hears
   them: the `words` group and the bot voice scan are clean. This is only code tidiness.

## Not covered (needs a real device)
iOS Safari TTS voices, mic answers, the 320 ms double-tap-zoom guard on real WebKit, the loudness of the audio chain on a
phone speaker, and Add-to-Home-Screen mode.
