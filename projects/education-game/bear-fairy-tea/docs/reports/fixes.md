# Fixes after QA: Moka's Fairy Tea Party (lead fixer, 2026-11-16)

This report covers the findings from `qa_visual.md`, `qa_functional.md` and `qa_playtest.md`. For each one it gives what changed and in which file.
`MECHANICS.md` §3–§4 (layout + `FT.CONFIG`), `VOICE.md` §2 (speech policy + event table) and the tests were updated to match.

## Visual (qa_visual.md)

| finding | what changed | file |
|---|---|---|
| **P1-1** Portrait: play area at the bottom, ~500 px of empty forest, small things | New portrait branch (`portraitLayout` + `layoutTier`). The table now spans the full width (`x0/x1 = ins ± 30`, slot inset 24). The item is as big as the screen allows, one per round: `min(cap, ⌊span / ((n−1)·1.2)⌋, ⌊(W − 32) / ((n−1)·1.2 + 1)⌋)`. The cap is the age's base × 1.3 on tall screens and × 1.08 otherwise. The things sit centred in the band between the lanterns and Moka's head (≥ 90 px of rise room). Moka is 260 tall on tall screens. iPhone portrait things go from 139 / 139 / 100 to **161 / 149 / 118** for 3 / 4 / 5 things (88 / 81 / 64 CSS px), and the table moves up from y 1207 to **976–954** (things' centre ≈ 57 % of H). iPad portrait: 124 → **134** (5 things: 100 → 118). **Deviation from the drop-in:** its 5-thing item of 127 would put the outer things off screen (slot x 55 − 63 < 0, the unit fuzz caught it), so the item is also limited by the screen width with a 16 px edge (`portEdge`). | `game/js/world.js` |
| **P1-1** Horizon jumps between rounds | The layout exports `envTableY` / `envItem`: the table y and item the round would have at the age's cap. `render.js _envFor / _stableItem` anchors the environment on those, so the horizon is the same in 3- and 5-thing rounds. | `world.js`, `game/js/render.js` |
| **P1-2** The table leg's cap looks like a hat on Moka; the plank cuts his head; the umbrella covers a plate | Portrait legs sit at 27 % / 88 % of the table (the left one at x 208, right of Moka at 19…201). They end on the ground plane behind Moka: `legBottom = min(groundY, y + 46 + 150)`. The plank bottom is never closer than 24 px to Moka's head (iPhone: ≈ 185 px of gap, iPad: ≈ 45). Screenshots (iPhone + iPad portrait, sunny / rain / hint) show no overlap, and the umbrella stays below the plates. | `world.js` |
| **P2-5** Landscape phone things small | On landscape phones the item is × 1.15 (124 → **143**, 78 CSS px), as long as the things' tops stay ≥ 14 px below the lanterns (`lanternClear`). | `world.js` |
| **P2-1** Lanterns + their icon too small on phones | Lanterns are **1.3×** on portrait phones and **1.15×** on landscape phones (`garland.lanternS`, drawn by `render._garland`). The garland geometry (drop, `lanternH`, `bottom`, badge y) scales with them. Landscape gets 1.15× rather than 1.3× because 1.3× would have eaten the room the 143 px things need. Checked in screenshots: lanterns never touch the bubble or the things (iPhone landscape: lantern bottom 358, thing tops 375). | `world.js`, `render.js` |
| **P2-4** Green / orange / pink weak on sage moss | The cream sticker rim already existed (`#FFF8EA`, alpha 0.92, `LW + 6`). It is now opaque and wider (`LW + 9`): ≈ 4.5 design units (≈ 5 px at 124) of cream outside the ink line, on every obj / cookie / plate / card. | `game/js/tea_art.js` |
| **P2-2** 4-character cards ("10+5") unreadable | Cards with ≥ 4 glyphs are drawn as a 1.15× wider tent card (the rim follows). Glyphs auto-fit with a floor of 30 design units: past the floor the text is condensed horizontally instead of shrunk. iPhone portrait, age 7, 5 cards: glyphs ≈ 17 CSS px (was ≈ 12). | `tea_art.js` |
| **P3-1** Session done: empty lanterns on the garland | `_doneScene` fills the 4 lanterns with the last chapter's things (else the session's last 4). The floating gallery rises from the ground band in portrait (the table is mid-screen now) and stays to the right of Moka while low (**P3-2**). | `render.js` |
| (new) After a rotation, sitting things piled up at the screen edge for ≈ 0.8 s (QA `resize_extremes` 2400×600 → 600×2000 caught it with the wider portrait spacing) | `_snapAll` keeps only ±0.3·size of a sitting thing's old offset from its new placemat instead of clamping its old x to the screen | `world.js` |
| (new) Title: things past the edge on the full-width portrait table | Title slot spacing is limited to the screen width minus a 16 px margin. | `render.js` |

Not done (cheap but optional): P2-3 berry 4 × 3 grid (with 118 px plates the 12-berry plate reads, see `iphone-p-en-t-age7-plates12`), P2-6 `littleK`
(the bigger portrait item already brings the little ones at 4 things from ≈ 47 to ≈ 50 CSS px, 3 things ≈ 54), P3-3…P3-7 (title vine under the logo, title pill background,
VI settings chip, iPad Talk width, rainbow arc in portrait). The rainbow arc lives in the RECIPE `envLayout` copied verbatim from
`tools/env_scenes.js`, so it belongs to the environment artist.

## Functional (qa_functional.md)

| finding | what changed | file |
|---|---|---|
| **P1-1** Auto-pause 12 s after a returning child taps | `P._touch` also resets `_idleN`. main drops its own `idleSaid` counter and pauses on the world's count (`e.n >= 5`), so any touch restarts the 12 → 18 → 27 → 30 s cycle. New unit test (4 idles, a touch, then the next idle is n = 1 and the 5th comes ≈ 2 min later). QA `idle_after_touch` passes. | `world.js`, `game/js/main.js`, `tests/unit/run.js` |
| **P2-1** Hammering one wrong thing never brings help | The 1 s same-thing window now counts from the last **counted** miss: `_lastWrongT` is set only when a miss is counted, so the window no longer slides. Each repeat wiggle calls `_noProgress(false)`, so the 3-press hint and the assist (4 presses, ≥ 10 s of play) apply. New unit test (a tap every 0.4 s → hint within ≈ 1.5 s, assist after 10 s). QA `hammer_wrong` now expects 1–2 misses for 10 taps in ≈ 1–1.5 s; it used to expect exactly 1 because the window slid. | `world.js`, tests |
| **P3-1** Bubble font 12–13 px on iPhones | The font floor is **15 CSS px** (`ui._fitBubble`). Phones reserve more room instead of shrinking the text: portrait bubble 124 → 140 logical px tall, landscape bubble ≤ 720 px wide (was 560), and slimmer bubble padding on phones (CSS). | `game/js/ui.js`, `world.js`, `game/css/style.css` |
| **P3-2** A session can end without the child's name | `CHILD_SHARE` replaces `CHILD_PREFERRED`. With a name set, `praise` and `great` use a `{child}` variant ≈ 1 in 3, and `ui.welcome` / `session.done` always do. `praise` gained 3 `{child}` variants (EN + VI). A unit test measures the share (27–40 %). | `game/js/i18n.js`, `tests/unit/i18n_voice.test.js` |
| **P3-3** Tap-vs-move threshold in logical px | Moka's poke now uses `world.tapMoveMax() = max(24 logical, 24 CSS px / viewScale)`. main calls `world.setViewScale(view.s)` on every resize, which gives ≈ 44 logical px on an iPhone. Covered by a unit test and a QA `tap_jitter` check (a 20 CSS px wobble pokes, a 32 CSS px slide doesn't). | `world.js`, `main.js` |
| **P3-4** Soft presses near a moving critter count as "no progress" | A soft press within `critterSoftK` 1.5 × r of the critter (any state, fairies included) is not counted toward the hint or assist. Unit test. | `world.js` |

## Playtest (qa_playtest.md)

| finding | what changed | file |
|---|---|---|
| §5.1 pace + help | `FT.CONFIG`: chimeGap 0.3 → **0.22**, chimeTail 0.4 → **0.25**, cheersTime 1.1 → **0.85**, clearTime 0.8 → **0.65**, poofSweep 0.4 → **0.3**, enterStagger 0.22 → **0.16**, fairyCircle 0.7 → **0.55**, hintTime 3.2 → **10**, idleHintFrom 2 → **1**, assistAfter 6 → **4** | `world.js` |
| P1-2 / §5.2-1 Mashing buys auto-solves | New `assistMinPlay: 10`: the assist arms only after the round has been in play ≥ 10 s (`_playT0` is set when play starts). | `world.js` |
| P1-1 / §5.2-2 Talk answered before it is heard | The world ignores non-auto answers for the first `talkLock` 1 s (`talkOpen()`). main also ignores choice taps until the Talk question has **started speaking + 1 s**. That gate is capped at 8 s, and opens at once if the line is dropped or voice is off. QA `talk_lock` covers it. | `world.js`, `main.js` |
| P1-3 / §5.2-3 A slow toddler's session runs too long | New `chapterHardLimit: 110` / `chapterHardMinRounds: 2`: past 110 s the chapter goes to Talk once 2 rounds are done. The 75 s / 3-round rule is unchanged. Unit test. | `world.js` |
| P2-1 Rightmost-slot bias | The "never the same odd slot" rule only applies when the count is unchanged. The world passes `prevOddN`, and with a new count the pick is uniform. `qa_content`: age 3 n 4 is now 24/25/27/24 (was 22/23/22/32), age 4 n 5 is 19/21/18/22/21. | `game/js/content.js`, `world.js` |
| P2-2 Count warm-up gap of 1 at ages ≥ 5 | `countPairOk(a, b, age, ri)`: round 0 needs a gap ≥ 2 at every age (both in generation and in `validate`). Unit test over 1 500 seeds × ages 5–7. | `content.js` |
| P2-3 / P2-4 Word-for-word repeats | The wrong / wrong-hint line is re-composed (≤ 3 ×) while it equals the last spoken line. The idle line re-rolls only its `idle` prefix (the question part stays verbatim) while the whole line equals the last spoken one. | `main.js` |
| P2-5 VOICE.md vs main.js | Updated the doc, not the code: the right line always cuts the prompt (the guard is lifted, because the question was just answered). | `docs/VOICE.md` |
| P2-6 VI chapter-end "Great!" cut by the next chapter name | `levelDone` says `great` through `speakPrompt`, so it is guarded from its own start like a prompt. The chapter name interrupts only when nothing is protected; otherwise it queues as priority behind it. The session-end `party` line follows the same rule: the voice sim showed it cutting the last chapter's "Great!". | `main.js` |
| P2-7 `hs_voiceflow.js` child never taps a wrong thing | `'stand'` → `'sit'`. | `tests/sim/hs_voiceflow.js` |

Sim / test bookkeeping: `qa_playtest.js` counts "same slot twice" only for the same count, and `qa_content.js` passes `prevOddN`.

## Tests whose expectations changed (legitimately)
- `tests/unit/run.js`: the layout test now checks the new portrait rules (full-width table, rise room, plank clear of Moka, legs right of Moka, item ≤ cap, 16 px edge, phone lantern scale, landscape-phone item ≤ 1.15 × with lantern clearance). The timing tests read the new CONFIG (stagger 0.16, chimeGap 0.22, cheers 0.85, poof sweep 0.3). The hint-cooldown test runs at `hintTime 3.2` and a new block checks the 10 s default glow. Soft presses check the 10 s assist gate, Talk checks the 1 s lock, and the chained content test only forbids the same slot at the same count. Six new `fixes:` tests were added.
- `tests/qa/qa_functional.js`:
  - `openTalk` waits for `talkOpen()`.
  - `hammer_wrong`: counted misses must be ≥ 1 s apart in world time (the window no longer slides). A hint and the assist must arrive; if the assist answers the round, it is an assisted 1★ round.
  - `non_answers` / `stars_rules` arm the assist after 10 s of play with one press off the table band (a band press would use it up), and check that earlier mashing does not arm it.
  - The idle hint is expected at 12 s.
  - `tap_jitter` checks the CSS-px threshold.
  - `pause_speech` allows ≤ 1.5 s for the queued prompt to start after READY. The shorter enter means the ask can now land at the very end of the weather line.
  - New `talk_lock`.

## Results
- `node tests/unit/run.js`: **39 / 39** (was 34; 6 new `fixes:` tests). `i18n_voice.test.js`: **56 690 / 0**. `tea_art.test.js`: **15 585 / 0**.
- `node tests/e2e/smoke.js`: PASS (iPhone portrait + landscape). `node tests/e2e/functional.js`: **80 / 80**.
- `node tests/qa/qa_functional.js`:
  - 1st full run: 65 / 71. All 6 failures were test expectations the fixes changed (hammer, assist arming, a queued prompt); the tests were updated above.
  - 2nd full run: **70 / 71**. `resize_extremes` caught a real transient: after 2400×600 → 600×2000 the sitting things piled up at the right edge for ≈ 0.8 s. It is fixed in `_snapAll`.
  - After that fix, `resize_extremes` and `rotate_phases` (4 devices) pass, and so do the e2e `rotate_mid_round` / `rotate_mid_rise` (8 / 8) and the unit tests (39 / 39).
- Visual: `tests/qa/visual_capture.js` (screens + topics, 4 devices × EN / VI) ran with 0 script / page errors. I looked at these screenshots myself: iPhone portrait sunny / rain / lantern lit / done / age 7 cards / 12 berries, iPhone landscape rain / lantern lit, iPad portrait title / rain hint, iPad landscape done.
- Playtest sim `node tests/sim/qa_playtest.js --n 96 --jobs 2 --tag fixes` (5 280 sessions, the shipped CONFIG + code, no patches), compared with the QA's recommended "after" numbers:

| model | age | session min median (p90) | chapter s median | round s | 3★ % | rounds with a hint % | solved by assist % |
|---|---|---|---|---|---|---|---|
| kid0.8 | 4 | **4.5 (4.7)** (was 4.8) | 63.2 (was 67.9) | 13.3 | 79.0 | 6.1 | 0 |
| kid0.8 | 3 / 5 / 7 | 4.6 / 4.5 / 4.4 | 64.0 / 61.3 / 60.8 | 13.5 / 13.1 / 12.9 | 81 / 80 / 80 | 6.5 / 5.0 / 4.5 | 0 |
| bot0.8 | 3–7 | 3.2–3.4 | 44–46 | 9.4–10.2 | ≈ 80 | 3–4 | 0 |
| slow | 3 / 4 | **7.7 (9.0) / 7.7 (9.0)** (was 8.7 / 8.6) | 107.8 / 107.2 | 24.9 / 25.2 | 69 / 70 | 66 / 69 | 1.2 |
| rtap | 3 / 4 / 7 | 3.7 / 3.9 / 4.3 | 51–61 | 10.6–13.1 | 20–32 | 59–75 | **6.2 / 9.3 / 17.6** (was 33 / 39 / 50) |
| spam8 | 3–7 | 2.8–3.1 | 38–42 | 8.1–9.1 | 20–30 | 45–60 | **0.0** (was 3–7.5); Talk answered after 2.7 s (was 1.7) |

  Every model and age: 100 % of sessions done, 0 judgements from presses outside play, 0 repeated sets / keys, 0 same odd slot
  twice (same count), the odd slot at an end exactly at the uniform rate (e.g. age 4: 54.4 % vs 54.7 %), 0 colour clashes below age 5.
- `qa_content.js 2000`: odd-slot spread is uniform for every n (no rightmost bias). Count warm-ups at ages ≥ 5 have a gap ≥ 2.
- `qa_voiceflow.js --n 6 --ages 3,4 --langs en,vi` (72 sessions):
  - same line back-to-back: 0 (was up to 5 per 6 sessions). One slow VI run had the question itself said twice in a row, a deliberate prompt repeat.
  - `levelDone` "Great!": 24 / 24 in full in every row, and `sessionDone` in full.
  - right lines and praise: 100 % in full.
  - prompts: cut only by the child's own right answer or count run.
