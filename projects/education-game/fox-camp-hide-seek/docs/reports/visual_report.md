# Visual QA — Pip's Camp Hide & Seek (2026-11-03)

Report-only for `game/` (nothing under `game/` was edited). Tools: `tests/visual/fc_capture.js` (Playwright, isMobile + hasTouch,
notch insets emulated through the `--sa-*` CSS overrides and painted red in the shots), `tests/visual/fc_lib.js` (hand-stepped
world + a pixel probe: every friend is redrawn with/without itself → visible fraction, real drawn top, colour behind each hat,
exposed clip line), `tests/visual/fc_analyze.js` → `tests/out/visual/analysis.txt`.

Coverage: 4 viewports (iPhone 393×852 @3 / 852×393 @3, iPad 820×1180 @2 / 1180×820 @2) × EN + VI × 17 screens (title, settings,
chapter banner, gather, count, count-run, ask, boo, peek-right, found-jump, ask-2 + seated, party, pause, Talk, chapter stars,
next-chapter banner, session done) = 136 shots; 4 seasons × colours (age 4 and 5) / shapes / count = 64 shots; every topic at ages
3–7 (ask + party frame of round 4, iPhone P/L in EN+VI, iPads EN) = 240 shots; iPhone SE landscape 8 shots. ~25 representative
shots: `docs/reports/visual/`.

**What passed** — no clue/peek box under the HUD or the bubble in any ask frame (0 / 750 hidden friends; the world's keep-out is
conservative: real drawn clue tops are 5–14 px *below* `clueTop`); hidden friends never show anything below `peekY` (clip by
construction, probe confirms), peeking head + clue visible median 94 %; peek boxes never overlap each other; bubble never overflows
(EN/VI, min font 19.98 px on iPhone L, never shrunk < 18 px); Talk choices / pause / done buttons never clip in VI; HUD and
buttons always inside the safe area; banner and chapter-stars cards fit every viewport.

## P1
1. **Seated friends behind the flames.** Bench seat 4 is visible only 5–41 % (median 27 %, n 56), seat 5 42–64 % (median 56 %).
   `CONFIG.seats[4] = [0.08, -0.4]` (× seatSize 121 px = 10 px right of / 48 px above `camp`) sits in the flame column, and
   `render._game` draws `_camp(…, 'front')` (flames ≈ ±0.22·campW wide, up to ≈ 0.85·campW tall) after every friend. With 5–6
   friends (ages 5–7, and age 4 in rounds 3–4) one friend disappears completely — only its badge pokes out of the fire
   (`visual/24-party-seat4-behind-flames-iphoneL.png`). Fix: move seats 4/5 out of the fire, e.g. a second row behind the left
   bench `seats[4] = [-1.28, -0.42]`, `seats[5] = [-1.93, -0.42]` (between the heads of seats 0–2), or keep `[0.62,-0.12]`-style
   seats right of the fire only when `camp.x + 0.62·seat + 0.3·seat < W − ins.right`.
2. **Size topic: the small friend is unrecognisable.** Small friends (`scale 0.62`) peek only 37 px above `peekY` (leaves, n 6) and
   the leaves dome covers ~13 px of it → a 24 px tuft; at age 3 "find the small pig" shows just a pink ear tip
   (`visual/22-size-small-pig-invisible-iphoneP.png`, visible 68 % of an already tiny head). Fix: small friends need the same
   peek height as big ones (`peekRise` for scale < 1 → `≥ 0.42·place.fs`, i.e. raise the small friend so eyes clear the line),
   plus item P2-1. (Side note for mechanics: that round had big pig, small pig and big lion — DESIGN §5.1 says one animal per size round.)
3. **Session done on iPhone portrait hides the whole party.** `#scrDone .done-panel` is css 288–648 px; `_doneScene` portrait puts
   the fire/Pip ground at `gy = 0.38·H` (css 324) and the 8 friends at `gy + 115` (css 387) → Pip's body, the fire and all friends
   are under the panel, while css 650–818 is empty snow (`visual/15-done-iphoneP-panel-covers-party.png`). Fix: `style.css`
   portrait `#scrDone { padding-bottom: calc(var(--sa-b) + 20vh) }` → `+ 2vh` (panel top ≈ css 440), and/or `gy = H·0.30` when
   `layout.tall`.

## P2
1. **Dome-shaped places cover the peeking faces.** Art top over the central 50 % (viewBox y, min/median) vs `spots.json peekY`:
   drift 46/52 vs **62**, leaves 48/53 vs **62**, rock 47/49 vs **58**, tent 41(pole)/56 vs 59, stump 44/45 vs 50, bush 46/50 vs 53.
   For `ears`/`animals` rounds only 36–46 px of head shows above `peekY`, so the 10–15 px dome hides the eyes (cow behind a drift
   shows only its ears — `visual/23-animals-drift-hides-face-iphoneP.png`). Fix: `peekY` = median top: drift 52, leaves 53,
   rock 50, tent 56, stump 46, bush 50 (or `peekRiseFrac` 0.42 → 0.5 for ears/size clues).
2. **The found friend's jump goes under the speech bubble (portrait, back row).** iPad P: drawn top 126 vs bubble bottom 265
   (139 px — the whole cow is hidden for ~0.2 s, `visual/10-found-jump-under-bubble-ipadP.png`); iPhone P 332 vs 377; iPad L
   127 vs 163 at x 557 (bubble x 24–596). `CONFIG.jumpApex 90` + pop rise from a back-row place at `0.47·H`. Fix in `_toFire`/jump:
   `apex = min(cfg.jumpApex, f.y − f.size − (bubble.y + bubble.h) − 8)` or jump forward/down from back-row places.
3. **Landscape front row touches Pip and the camp.** `fieldLeft 250` / `fieldRight 260` are place *centres*; with half width
   0.46·w (101 px) the first place's left edge is ins.left + 149 while Pip's ear/tail reach ins.left + 203 → 16–54 px overlap
   (Pip's ear over the bush, `visual/18-spring-5places-pip-overlap-iphoneL.png`); the last place's right edge W − ins.right − 159
   overlaps the camp tent (from W − ins.right − 265) by 92–106 px, bench seats 4/5 by up to 110×27 px and the flame box by 21–35 px
   (24 frames iPhone L + iPad L). Fix: `fieldLeft ≥ pipX + 0.36·pipH + 0.46·spotW + 8 ≈ 330`, `fieldRight ≈ 300` and let the solver
   shrink (iPad L W = 1036 needs ≥ 488 px for 3 front places; the solver already has `shrink`).
4. **Green (and autumn yellow) hats blend into the meadow.** Worst ΔE00 hat base vs the pixels right behind it: green 11.7 summer
   (#a8d88b), 13.9 spring (#afcc98), 18.1 autumn; deuteranopia ΔE 5.6–8.9. Autumn yellow ΔE 14.8 vs #cdc086 (luminance CR 1.27,
   dark outline only 1.41). Every other colour/season ≥ ΔE 22 (blue/purple ≥ 33). Fix in `camp_art.js paintHat`: a 3 px cream rim
   `#FFF8E8` around the hat (like the friends' sticker outline) or a darker green outline `#1E6B35`; full table in `analysis.txt`.
5. **Portrait gather line runs through the campfire.** `gather.x1 = W − ins.right − 0.55·fs` (629 on W 720) while `camp.x` = 570:
   the rightmost friend (x 616) stands in the flames/tent for the whole gather + count (~3 s every round,
   `visual/06-gather-over-fire-iphoneP.png`). Fix: portrait `gather.x1 = camp.x − 0.5·campW − 0.45·fs` (≈ 405) or put the line above
   the front row. (Landscape `gather.x1 = camp.x − 0.6·spotW` = 754 on iPad L leaves the pig in front of the tent — P3.)
6. **Session done does not show "every friend met" in landscape.** iPad L: 4 of 8 friends (left side culled by
   `fx < ins.left + 40` because `pipX − 0.45·pw − 30` is already < 70 px); iPhone L: 2 of 8 (right-side friends at logical 673/757/841
   = css 367/413/459 are under the panel, css 389–781). `visual/16-…`, `visual/17-done-ipadL-4of8-friends.png`. Fix: in landscape
   put all friends in one/two rows left of `panel.left` (`fxC` ≈ 0.25·W, gap 64) or shrink to 72 px.

## P3
1. Title on iPhone portrait: logo breaks into 3 lines with an orphan word — "Camp Hide &" / "Seek", VI "Chơi Trốn" / "Tìm"
   (`.logo` 44 px min of `clamp(44px, 11·--u, 108px)`, css 167–292). Use `font-size: min(…, 9vw)` in portrait or explicit spans
   "Camp Hide" / "& Seek", "Chơi" / "Trốn Tìm".
2. Snowman: its head (art top y 18) stands over the left part of the peek area and covers ~¼ of the peeking face
   (`visual/21-winter-iphoneL.png`).
3. Clip line exposed: ≤ 10 columns, ≤ 6 px gap (bush/stump edges with sheep/duck/dog) — barely visible.
4. Pip's hit box (0.66·h wide) overlaps front-row place boxes in landscape (the world gives places priority, so only cosmetic).
5. iPhone L settings: panel scrolls 62 px (the "Answer by voice" toggle is below the fold); checkboxes are 26×26 (rows are the targets).
6. Talk mic button wraps to 2 lines in VI on iPhone P ("Bé chạm hoặc nói đáp án nhé!"), still fits.
7. Empty areas: iPhone P title has a ~130 css px empty meadow between the star pill (508) and the scene; iPad P done has css
   924–1160 empty snow below the panel. Game layout on tall phones is balanced (no big holes).

Re-run: `node tests/visual/fc_capture.js [screens seasons topics short]` (~35 min all) then `node tests/visual/fc_analyze.js`.
