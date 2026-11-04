# Functional QA report — Lulu's Jungle Tower (2026-11-04)

Suite: `tests/e2e/functional.js` (rewritten for this game from the hide-and-seek suite). It uses real touch through CDP
`Input.dispatchTouchEvent` in Playwright Chromium contexts with `isMobile` and `hasTouch`: iPhone 393×852 and 852×393
at @3, iPad 820×1180 and 1180×820 at @2. It exits 1 on any FAIL and writes `tests/out/functional/results.json` plus screenshots.

```
node tests/e2e/functional.js                 # all 21 groups, ≈ 7 min on 2 cores (JOBS=2)
node tests/e2e/functional.js drag wrong      # some groups
```

## Result: 485 PASS / 0 FAIL (21 groups, 413 s)

| group | pass | what is covered |
|---|---|---|
| boot | 36 | 4 devices: title, loader gone, logo, Play ≥ 60 px, short side 720, no overflow, Play by touch, first ask (2+ blocks on screen, exactly one right, hit boxes ≥ 44 px), clean bubble, zero console errors |
| lang | 10 | EN logo "Lulu's / Jungle Tower" → VI "Hươu Lulu / Xếp Tháp", title, html lang, tagline/age with diacritics, VI welcome line, persists across reload, `?lang=vi` bubble + post-stack lines in VI, `?lang=en` |
| gate | 7 | short tap / 1 s hold / slide-off hold do NOT open settings; 2 s real-touch hold opens; progress shown |
| settings | 10 | age/name/music/lang/volume saved in `jt:settings`, persist across reload, panel restored, saved age played, child's name in praise, only `jt:` keys |
| flags | 7 | `?lang=vi&age=7&speed&seed` applied but never saved; saving another setting stores no flag values; only `jt:` keys |
| volume | 12 | ctx/master/user/sfx/music chain, compressor on the game context, user gain = volume×1.6, mute → master 0, slider 30 % → 0.48, persists, pause −/+ (50 %, clamps at 0 %), taps never reach the world |
| drag | 36 | 4 devices: real drag → `grab, drop(right), land, stack` in order, tower +1 holds that block, clean praise, landing ≤ 0.18·S, count 1…n bottom-up, monkey + bananas, 3 ★, next tower, HUD stars |
| wrong | 33 | 3 devices: `drop(right=false)` + `wrong`, press during the bounce → `locked`, block home, tower unchanged, no hint after the 1st, kind line with no negative words, 2nd wrong → hint (glow + `hintHand`), right drag still stacks, 1 ★ |
| miss | 24 | 3 devices: release on the grass → `miss`, block home, not a mistake, 3rd grass release → hint, tap on the hinted block → assisted stack |
| tap | 16 | EN/VI: tap → `tapPiece` only (no grab/drop/miss), the voice log has the block's name, no stack; tapping the right block before a hint does not stack it |
| poke | 24 | 3 devices: tap on Lulu → `pokeLulu`, the same prompt is spoken again; a long press is not a poke; tapping the bubble repeats it and never reaches the world; rapid taps are safe |
| multi | 12 | a 2nd finger dragging a wrong block is ignored (`pointerDown` called once) and the 1st finger still stacks; `touchcancel` mid-drag → block home, no event |
| talk | 38 | 3 devices EN/VI: Talk screen, 2–4 buttons ≥ 64 px, question spoken, hiding the page during Talk → pause → resume back to Talk with the question repeated, right tap → +1 ★, 2nd answer ignored, next chapter (weather 1), HUD = world stars, drag works |
| pause | 11 | frozen world, taps blocked, resume repeats the prompt, pause mid-fall → it lands, Home → title, fresh session |
| visibility | 8 | hidden → paused (stays paused when visible again), world frozen; hidden mid-drag → drag cancelled, block home after resume, no drop |
| rotate | 36 | 4 orientation pairs: rotate while dragging → drag cancelled, the lifted stale finger drops nothing, blocks/tower/Lulu inside, logical size flips, real drag on the new layout stacks, rotate during the fall → still lands, game continues to the next tower |
| idle | 7 | idle at 12 s then +18 s, 2nd idle hints, nudge repeats the prompt, ≈ 2 min → auto-pause, drag works after |
| countup | 24 | ages 4/5/6: count chapter towers 0 and 1 are `p.countUp` in order (1, 2, …; age 6 counts on from k), tower 2 is `p.count`, `?level=N` jumps to the chapter, never saved |
| bot | 111 | ages 3–7 × EN/VI at speed 20 (≈ 17–22 s each): mode `done`; 4 chapters, 4 talks; every tower done; one stack per ask; **every ask prompt and Talk question of every chapter is spoken** (matched to a wording of its key); count-up order; no raw keys or undefined; every line in the session language; no negative words; VI diacritics ≥ 80 %; done stars = world stars |
| done | 11 | party screen, buttons ≥ 44 px, Play again → fresh session with real drags, Home → total stars persist |
| layout | 12 | 4 devices × ages 3/5/6/7, ≥ 10 asks each: blocks drawn on screen, block centre on the canvas (not under the HUD or bubble), hit centre resolves to the block, drop point on the canvas |

Bot sessions (game time / stars): age 3 ≈ 271–292 s / 40 ★, age 4 ≈ 349–355 s / 37 ★, age 5 ≈ 325–343 s / 21 ★,
age 6 ≈ 361–365 s / 23 ★, age 7 ≈ 379–394 s / 23–24 ★. All of them are under 8 min.

## Bugs

No P1 or P2 functional bugs were found. Every contract behaviour checked above works with real touch on all four viewports.

### P3
1. **Stale project docs from the sister game.** `CLAUDE.md` and `README.md` in this folder still describe "Pip's Camp
   Hide & Seek". They mention the `window.FC` namespace, the `fc:` storage prefix, Pip the fox and the hiding places. The code
   itself uses `JT`, `jt:` and Lulu.
   *Repro:* `head -5 CLAUDE.md README.md`. *Fix:* rewrite both files for Lulu's Jungle Tower (storage prefix `jt:`, the
   drag-to-stack mechanic, the protected prompts rule). The `CLAUDE.md` rule "only a real peek resets the idle clock" should
   become "only a real grab resets the idle clock".
2. **Leftover names in code.** The i18n key `ui.tapPip` (`game/js/i18n.js:236,385`) has the right text but the old name.
   The comment at `game/js/render.js:442` says "while Pip counts". *Fix:* rename the key to `ui.tapLulu` (and every place
   that uses it) and fix the comment.
3. **Tap slop on iPhone portrait is small.** `tapMove: 24` is in logical px (`world.js:64`). On a 393-pt-wide iPhone in
   portrait (s = 0.546) that is only about 13 pt of finger travel. A toddler's tap that wobbles 15 pt counts as a grab: the
   block is named on `grab`, then let go on the grass (`miss`, plus the "lift it up" line). It is not a mistake, but it does
   not get the friendly tap hop either. *Suggestion:* the playtest team could try a tap threshold in CSS px (about 18–20 pt)
   or `max(24, 18 / view.s)` logical px.
4. **Test-hook note (not a bug):** `JT.Voice.log` / `JT.debug.voiceLog` is trimmed to 500 lines after 600
   (`voice.js:113`), so a full session cannot be checked from it. The suite wraps `JT.Voice.say` (`window.__vl`) instead.

## Notes for the team
- `pieceHit` boxes are padded by about 25 logical px around the block. On iPad landscape the right-most hit box reaches
  3 CSS px past the screen edge, while the drawn block is fully inside. The layout and rotate audits check the drawn block.
- At speed > 1 the voice is disabled but every line is still logged, so the voice checks are valid at high speed.
