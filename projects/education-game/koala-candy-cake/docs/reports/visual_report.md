# Visual QA — Koko's Cake Tower (2026-11-14)

Scope: every screen × 4 viewports (iPhone 393×852 / 852×393 @3x, iPad 820×1180 / 1180×820 @2x, `isMobile` + `hasTouch`)
× EN/VI, notch insets emulated (`--sa-*` overrides: iPhone 47 px top/bottom in portrait, 47 px left/right + 21 px bottom
in landscape; iPad 24/20 px; unsafe zones painted pale red, Dynamic Island + home bar drawn in black); the 4 chapter
weathers mid-round + breeze `hold` pose + bee; every topic of the age pools at ages 3–7 (ask frame of the last, tallest
round + its done frame with all candles lit); contrast of all 7 answer colours on every weather mood, sampled from the
real canvas. 3 300+ raw captures (kept out of git); 30 contact sheets / detail crops in `docs/reports/visual/` (9.4 MB).

Tools (ported from Lulu's `jt_*`, now Koko/cherry/candles aware): `tests/visual/ck_lib.js`, `ck_capture.js`
(`screens weather contrast topics`), `ck_analyze.js` (contrast tables, layout flags, tall-cake headroom), `ck_sheet.py`
(now with `--cols` grids), `ck_compact.py`. Run: `VQA_OUT=<scratch> node tests/visual/ck_capture.js && VQA_OUT=<scratch>
node tests/visual/ck_analyze.js`, then build sheets into `docs/reports/visual/`.

**Overall:** clean and polished. There are no P1 issues. No automatic layout flag fired on any of about 520 geometry
records: the speech bubble never overflows, and the cherry, cloud, candles and cake layers never sit under the bubble
or the HUD. All tray layers stay inside the safe area, and Koko never covers a resting tray layer. The real 2-second
gear hold opened Settings on all 8 device × language runs. Layer faces are readable at every age, including 9–10 candy
dots, numbers up to 19, lowercase letters and animal cookies.

## P1 — none

## P2

1. **The cherry hides the two middle candles** (all viewports, every done frame).
   - Screenshots: `visual/detail_candles_cherry.png`, `visual/topics_iphoneL_done.png`, `visual/detail_session_done_portrait.png`.
   - Measured (iPhone P, 4 layers, LW 161): candle x = 362 / 399 / 437 / 474 and cherry centre x = 418. The cherry is
     about 64 px wide, so it covers x 386–450. Candles 2 and 3 sit 19 px from the centre and are hidden apart from
     their flames. The child counts 4 candles but sees 2½.
   - Fix (`game/js/world.js` `_startDone`): leave out a centre band of ±0.2·LW. For example, spread the n candles over
     `[-0.44·LW, -0.2·LW] ∪ [0.2·LW, 0.44·LW]`, or for n ≥ 4 place them in two rows (back row raised by
     `candleBack·LH`). Another option is to move the cherry to `cherryX = +0.3·LW`, off-centre like a real topping.
2. **Sparkle bursts cover the cake top while the candles light.**
   - Viewports: iPhone L and iPad L most, also iPhone P.
   - Screenshots: `visual/screens_iphoneL_en.png` (11-candles-lit), `visual/screens_ipadL_en.png`, `visual/topics_iphoneL_done.png`.
   - Each `count` event fires `render.burst('hint', cx, cy-20, {size:40})` (8 sparkles of 22 px, ring r ≈ 24) on top
     of the candle. `cherryOn` adds `sparkles`, and the last stack's `pop` stars are still flying. At phaseTime ≈ 2.35 s
     (all 4 candles lit) the top 60 px of the cake is a cloud of sparkles. The lit candles, which are the reward moment,
     are not readable.
   - Fix (`game/js/main.js:299`): replace the per-candle `hint` burst with a single small flash (`size: 18`, or 3
     sparkles), and move the `cherryOn` sparkles up by `-60`. Alternatively, in `render.js`, draw candles + cherry
     after the `_fx` pass.
3. **Settings in iPhone landscape hide the 4th toggle and the voice note under the sticky Done button.**
   - Viewport: 852×393.
   - Screenshots: `visual/screens_iphoneL_en.png` (02-settings), `visual/detail_vi_text_fit.png`.
   - Panel scroll is 87 px (EN) / 97 px (VI). "Answer by voice / Trả lời bằng giọng nói" and the voice-info line are
     only visible after scrolling, and nothing hints that the panel scrolls. Only the faded top of "Answer by…" shows
     behind Done.
   - Fix (`game/css/style.css`, `@media (max-height: 500px)`): use `.set-grid { grid-template-columns: repeat(4, 1fr) }`
     (the panel is 640 px wide, so 4 × 150 fits) and `.toggle { font-size: 15px }`. Alternatively, put Age + Language
     on one row (`.set-row` side by side) to save about 45 px.
4. **VI Talk-time choices wrap to 2 rows on iPhone portrait.**
   - Screenshots: `visual/screens_iphoneP_vi.png` (13-talk), `visual/detail_vi_text_fit.png`.
   - Choice widths are 155 / 101 / 119 px ("màu xanh dương", "màu vàng", "màu xanh lá"), plus 2 × 8 px gap = 391 px.
     That is more than the content width of about 345 px, so the 3rd choice drops to its own row. The panel grows from
     482 to 604 px (y 124–728) and the layout is lopsided. EN is 90 / 90 / 90 on one row. The VI mic button also wraps
     to 2 lines ("Bé chạm hoặc nói đáp án / nhé!").
   - Fix: in `game/js/i18n.js`, drop "màu" from the VI talk choice labels ("xanh dương", "vàng", "xanh lá"). The
     question already says "màu gì"). Or in `style.css` `@media (max-width: 430px)` use
     `.talk-choices { flex-wrap: nowrap } .talk-choices button { min-width: 0; flex: 1 1 0; padding: 8px 6px } .talk-choices button small { font-size: 14px }`.
     Shorten the VI mic label to "Bé chạm hoặc nói nhé!".
5. **The VI logo wraps badly in portrait.**
   - Screenshots: `visual/screens_iphoneP_vi.png` (01-title), `visual/screens_ipadP_vi.png`, `visual/detail_title_logo_vi.png`.
   - iPhone P: 3 lines, "Koala Koko / Tháp Bánh / Kem". `.logo` is 125 px tall versus 84 px in EN, which pushes ▶
     down 62 px (Play button top at y 355 versus 293). iPad P: "Tháp Bánh / Kem", with `#logo2` 171 px tall (2 lines)
     and a one-word orphan. The tagline also leaves "nhé!" orphaned on iPhone P.
   - Fix (`style.css`): `:lang(vi) .logo { font-size: clamp(34px, 8.6 * var(--u), 96px) }` and
     `#logo2 { white-space: nowrap }`. "Tháp Bánh Kem" at 36 px is about 300 px wide, which fits 80vw = 314. For the
     tagline, use `text-wrap: balance`.

## P3

6. **Yellow and orange layers on the cream plaza rely on their outline alone.**
   - Screenshots: `visual/contrast_moods.png`; numbers from `ck_analyze`.
   - Yellow frosting `#fcd455` on plaza `#f0deba`: WCAG 1.04–1.09, ΔE00 15–17 (sunny / breezy / rainbow). Yellow
     sponge ΔE00 9–11. Orange sponge ΔE00 10–12.
   - Rain: orange and pink frosting are WCAG 1.00 against the grey-lilac ring `#b8b6af`, but still ΔE00 22–29 (hue).
   - Closest answer pair under colour-vision deficiency: yellow/orange ΔE00 7.3 (deutan), green/orange 8.0 (protan).
     The hex values are fixed by design, and the age < 5 pair rule already avoids these pairs.
   - Fix: in `render.js`, darken the soft contact shadow under tray layers (alpha +0.1), or in `env/ground_*.svg`
     make the calm middle band 4–5 % darker (`#E9D3A8`). Optionally give `block_art.js` 6 px outlines for yellow
     and orange.
7. **Narrow speech bubble in iPhone landscape.**
   - Screenshot: `visual/topics_iphoneL_done.png`.
   - The bubble is 371 logical = 203 CSS px wide (it is capped at `drop.x0 − 20`). Long lines fall back to 16.2 px
     font on 3 lines: EN "One, two, three, four, five! We reached the cherry!" and VI "Bé ơi, đặt tầng bánh có hình
     vuông lên trên nhé!". iPad L is 27 px and fine.
   - Fix (`world.js` CONFIG): `bubbleHLand 122 → 150` and a font floor of 18 px in `ui.js _fitBubble`
     (`fs > 18`). Or give landscape a shorter `towerDone` variant ("1, 2, 3, 4, 5! Cherry!").
8. **Koko's `hold` pose does not match the spec.**
   - Screenshots: `visual/detail_koko_hold_blow.png`, `visual/weather_landscape.png` (`*-hold`).
   - The drawn pose is one paw raised by the head, like a wave. DESIGN §4.1 asks for both paws forward to the right
     (palms at ≈ (285, 150)) steadying the cake. The paw ends about 100 px short of the layer, so "I've got it!" does
     not read.
   - Fix: `tools/art_koko.py` → regenerate `characters/koko_hold.svg`.
9. **On iPad portrait, Koko stands right on the left tray layer.**
   - Viewport: 820×1180. Screenshots: `visual/screens_ipadP_en.png` (04-ask, 10-landing).
   - Koko's feet are at y 861 and the left layer top is at 872: an 11 px gap (iPhone P has 71 px). His shadow touches
     the layer. During a wrong-bounce home arc the layer passes over his feet.
   - Fix (`world.js` `computeLayout`): for non-tall portrait (`!tall`) use `kokoDyPort` 40 (instead of 70), or shift
     Koko up by `LH·0.3`.
10. **Rainbow party in portrait.**
    - Screenshots: `visual/detail_session_done_portrait.png`, `visual/screens_iphoneP_en.png` (15).
    - The rainbow arc is almost entirely behind the done panel. Only a sliver shows at y ≈ 780 of 852, so the session
      party reads as "sunny + confetti". iPad L shows it well.
    - Fix (`render.js` / `weather.js` rainbow draw): in portrait, anchor the arc to about 45 % of H (behind Koko and
      the cake) instead of the ground line.
11. **The title cherry touches the logo on iPhone landscape (VI).**
    - Screenshot: `visual/detail_title_logo_vi.png`.
    - The cherry stem tip meets the baseline of "Kem". In EN it is 6 px below "Tower".
    - Fix: `.title-screen` landscape (`max-height: 500px`) `.logo { margin-bottom: 8px }`, or lower the title cake by
      12 px in `render.js` title drawing.
12. **Count numerals in portrait are pale.**
    - Screenshots: `visual/detail_candles_cherry.png`, `visual/screens_iphoneP_en.png` (11).
    - The fading pink numerals (life 0.85 s) overlap lollipops and sparkles to the right of the cake and are hard to
      read in their last half.
    - Fix (`render.js` `num` fx): add a 4 px white stroke, and hold alpha 1 until u = 0.7.
13. **Session done, iPad landscape:** Koko's raised paw sits within about 5 px of the orange layer, so they look like
    they touch. Screenshot: `visual/detail_session_done_landscape.png`. Fix: shift the done-scene cake +20 px right in
    `render.js`.
14. **Hygiene, not visible:** `render.js` still has a "Pip counts" comment and the `bfly` / butterfly fx branch from the
    template.

## Notches / safe areas — pass

- All tray layers, the bubble, the HUD and the panels stay inside the emulated insets.
- In iPhone landscape the tallest cake (5 layers, ages 5–7) has its cherry top at y 56 logical, about 31 CSS px below
  the screen top (top inset 0). It sits beside the bubble, not under it.
- iPad landscape: 80 px.
- Portrait headroom between the cherry and the bubble bottom is 137 px (iPad P) and 342 px (iPhone P).

## Sheets

- `screens_<dev>_<lang>.png`: title, gear holding, settings, banner, ask, drag, wrong, hint, pause, falling, landing,
  candles lit, blow, talk, chapter stars, session done.
- `weather_portrait.png`, `weather_landscape.png`.
- `topics_<dev>_{en,vi,done}.png`.
- `contrast_moods.png`.
- `detail_*.png`.
