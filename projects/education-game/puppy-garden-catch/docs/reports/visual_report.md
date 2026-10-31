# Puppy Garden Catch — Visual QA report

Reviewer: visual QA (report-only; no `game/` files changed).
Date: 2026-10-30.

**How to reproduce:** `node tests/visual/capture.js [screens moods topics pip notch measure extra]`. Screenshots go to
`tests/out/visual/<section>/`, and I built contact sheets in `tests/out/visual/sheets/`. The script also writes geometry dumps:
`measure.jsonl`, `topics/layout.jsonl` and `notch/insets.jsonl`. I ran colour-vision checks with
`python3 -I tests/visual/palette_cvd.py` and `python3 -I tests/visual/colorblind.py <png…>`, which writes to `tests/out/visual/cvd/`. Both scripts still work.

**Coverage:**
- **Devices:** iPhone 393×852 @3 and 852×393 @3, iPad 820×1180 @2 and 1180×820 @2, all with isMobile and hasTouch.
- **Screens:** EN and VI for every screen: title, settings, chapter banner, mid-round, hint, catch, pause, round done, Talk time, Talk right, level done and session done.
- **Chapters and topics:** all 4 weather chapters on every device. All 20 age/topic pairs (ages 3–7 × 4 chapters) on all 4 devices, each with a close-up of the basket tag.
- **Other:** all 7 of Pip's moods plus run frames, later rounds (after the warm-up) for colours, shapes, size and count with items in the basket, and notch insets in portrait and landscape.

---

## P1 — must fix

### P1-1 New bubbles are born *under* the speech bubble on iPhone portrait (every spawn)
- **Shots:** `topics/iphoneP-*` (e.g. `iphoneP-vi-a7-L2-initial.png`, where the pear is half hidden), `notch/iphoneP-vi-round.png` and `notch/iphoneP-en-round.png` (the "8" is under the box).
- **Numbers, no notch** (`topics/layout.jsonl`, s = 0.5458):
  - The HUD is 239 CSS px wide, which is 438 logical px. DESIGN §2 reserves only `hudW: 160`.
  - Because of that, `main.placeBubble()` moves the speech bubble under the HUD: CSS y 74–138, which is logical 136–252.
  - `spawnY` = 190 logical. A bubble with size 104 has diameter 140, so at birth it spans y 120–260. The ball and the "appear" pop are therefore fully hidden. The bubble needs ≈ 0.7 s of falling before it clears.
- **Numbers, with notch** (`notch/insets.jsonl`): the speech bubble is at CSS 133–188 (logical 244–344). `spawnY` = 298, so the bubble spans 228–368 and is fully hidden too.
- **Why it matters:**
  - The toddler never sees the item appear.
  - A tap on a fresh bubble lands on the DOM speech bubble, which only repeats the prompt.
  - It breaks the contract comment in `world.js` (`spawnDy: 40 // bubble top clears the speech bubble`).
- **Fix:**
  1. In `main.js placeBubble()`, after `r` is final, compute the bubble bottom in logical px: `const reserve = (r.y + r.h - view.top) / view.s + 8;` and pass it to the world with `world.setTopReserve(reserve)`.
  2. In `world.js`, store that value. In `computeLayout` use `spawnY = Math.max(skyTop + cfg.spawnDy, reserve + 0.5 * 1.35 * maxItemSize + 6)`, with maxItemSize ≈ 120 (or the pool max). Keep `sky.top` ≤ spawnY. Recompute `fallScale` from the new `fallDist`.
  3. Simpler alternative: in `computeLayout`, when `portrait && W·s < 560 css`, set `bubbleY` to `ins.top + hudH + 8` (i.e. treat the bubble as sitting under the HUD in logical space too) and add `bubbleH + 8` to `skyTopGap`.

## P2 — should fix

### P2-1 One blank frame (only the CSS sky colour) whenever adaptive quality steps down
- **Shot:** `moods/iphoneL-L2.png` (the whole canvas is empty and only `#8fd3ff` shows). I re-ran it 6 times: the canvas buffer changed size (2173×1002 to 1847×852) but the blank frame did not come back, so it is a one-frame flash.
- **Cause:** in `main.js frame()`, `adapt(raw)` runs *after* `render.draw()`. It calls `applySize()` → `render.resize()` → `canvas.width = …`, which clears the bitmap. The browser then presents that empty canvas for the frame. It also calls `PG.Assets.dropExact()`, so the next frame re-rasterises every layer, which causes a hitch.
- **Fix:** in `adapt()`, set a flag (`needResize = true`) instead of calling `applySize()`. At the top of `frame()`, before stepping or drawing, run `if (needResize) { needResize = false; applySize(); }`. A one-line alternative is to call `render.draw(...)` again right after `applySize()` inside `adapt`.

### P2-2 Title screen: decorative bubbles pass behind the logo, tagline and Play button
- **Shots:** `screens/iphoneP-en-01-title.png` (blue bubble behind "Puppy"; yellow bubble on the right end of the tagline), `screens/iphoneL-vi-01-title.png` (red bubble behind "Hứng Quà"; blue bubble touching the tagline), `notch/iphone*-title.png`.
- **Cause:** in `render.js _titleScene`, portrait lanes are at `W·(0.18, 0.50, 0.82)`. They fall from `ins.top+160` to `y − 1.25h`, straight through the column holding the logo and Play button. In `measure.jsonl` the logo spans CSS y 274–358, Play spans 414–541 and the tagline is 0.12–0.87 W wide. Landscape lanes are at `0.62–0.92 W` from `ins.top+120`, but the logo reaches x ≈ 0.75 W and the tagline reaches y ≈ 170 CSS.
- **Fix:**
  - **Landscape:** lanes `W·(0.80 … 0.94) − ins.right`, n = 3, with `top = (tagline.bottom − view.top)/view.s + 70`.
  - **Portrait:** keep the bubbles in the free band between the top bar and the logo. That is `top = ins.top + 130` to `bottom = logo.top(logical) − 70`, with 3 lanes at 0.15/0.5/0.85 W, and let them bob in place instead of falling through.
  - **Wiring:** `main.js` can pass the DOM rects once per resize as `render.titleAvoid = {logo, tagline, play, info}` (logical). The title must always win.

### P2-3 Notch portrait title: the "★ 0 · Age 6" pill overlaps Pip's ears
- **Shot:** `notch/iphoneP-en-title.png`. The pill bottom is ≈ 600 CSS px and Pip's head top ≈ 588 CSS px, so they overlap by about 12 px. Without the notch there is ≈ 45 px of gap (`screens/iphoneP-en-01-title.png`).
- **Cause:** the insets push the DOM column down by `--sa-t` (59 px). Meanwhile Pip moves *up* by `ins.bottom`, because `groundY = H − ins.bottom − 64`.
- **Fix** (`css/style.css`):
  ```
  @media (orientation: portrait) {
    .title-wrap { padding-bottom: calc(29vh + var(--sa-b)); }
    .btn-play { width: clamp(110px, 21 * var(--u), 170px); }
  }
  ```
  On a 393×852 phone, Pip's head top sits ≈ 27 % of the viewport height above the bottom without a notch and ≈ 31 % with one.

### P2-4 The maths tag on the basket is too small to read (add / sub / oddeven)
- **Shots:** `topics/iphoneL-en-a6-L2-add-basket.png`, `…a7-L0-add-basket.png`, `…a7-L1-sub-basket.png`, `…a7-L3-oddeven-basket.png`, and the `iphoneP` equivalents.
- **Numbers:** at age 6+ the basket is 190 logical wide, so `tw = 0.46·bw = 87`. "9 + 10 = ?" must fit in `0.9·tw = 79` px, so `outlinedText` shrinks it to a cap height of ≈ 15 logical. That is **≈ 8 CSS px on iPhone** (s = 0.546) and ≈ 14 px on iPad. The "1 3 5" line on oddeven is ≈ 6 CSS px and grey `#8a6a4a`.
- **Fix** (`render.js _tag`):
  - For `kind === 'number'` and `'parity'`, use a wider tag: `tw = bw*0.72` (it still fits inside the front wall).
  - Drop the ` = ?` suffix, so the tag shows "9 + 10", at `ih*0.66`.
  - For parity, show only the word at `ih*0.62`, or put the "1 3 5" hint in INK at `ih*0.42`.

### P2-5 Colour-blind weak pair yellow + orange is allowed at ages 3–4
- **Data:** `palette_cvd.py` gives yellow–orange ΔE 12.4 for deuteranopia and 20.0 for protanopia; it is flagged weak. `extra/extra.jsonl` shows the pool `green, yellow, orange` at age 4 (`extra/iphoneL-a4-L0-r2.png`). The simulation `sheets/cvd-yellow-orange.png` shows the two balls as near-identical yellows.
- **Fix:** in `content.js`, extend `clash()` with `|| (cs.indexOf('yellow') >= 0 && cs.indexOf('orange') >= 0)`. That gives three forbidden pairs below age 5, and the 2–3-colour pools still have enough combinations. Optionally apply the same rule to the per-shape colours at age ≤ 4.

### P2-6 Session-done in portrait: Pip floats mid-sky with a shadow on nothing
- **Shot:** `screens/iphoneP-vi-12-done.png` (feet at ≈ 49 % of the height, grass starts at ≈ 72 %).
- **Cause:** `render.js _donePup`: `y = min(groundY+6, H·0.5)` in portrait.
- **Fix:** in portrait, stand Pip on the grass with `y = groundY + 6` and `h = min(H·0.26, 360)`. Move the panel to the top half with `@media (orientation: portrait) { #scrDone { align-items: flex-start; padding-top: calc(var(--sa-t) + 8vh); } }`. At minimum, skip the ground-shadow ellipse when `y < groundY − 20`.

## P3 — polish

1. **Paws on the rim read as handle knobs** (`pip/ipadL-mood-idle.png`).
   - The rim paws sit at ±0.36·bw, which is wider than Pip's shoulders (collar ≈ 0.45·bw), and no arm connects them.
   - Pip's own sprite paws (y 135–170 in the SVG) peek out as cream blobs beside the collar, just above the rim.
   - **Fix** (`render.js _basket`): put the paws at `±0.29·bw`. Draw a short arm first: a 0.11·ph-wide `#D9A066` stroke with a `#8A5A2E` outline, from `(bx ± 0.15·bw, by − 0.05·bh)` to the paw. You could also nudge the basket 4–6 px higher so the sprite paws stay behind `basket_front`.
2. **Stale prompt during level done.** `screens/iphoneL-en-11-leveldone.png` still shows "Catch the blue ball!" beside the "Stars ×4" banner. **Fix:** in `main.js onEvent`, have `case 'levelDone'` also call `PG.UI.say('')`. During the chapter intro the bubble repeats the topic name, which is fine.
3. **Chapter banner touches Pip's ears in iPhone landscape** (`screens/iphoneL-vi-03-banner.png`). `cy` is clamped to `H − 300 = 420`, so the bottom is at 505 logical, which is where Pip's ear tops are. **Fix:** clamp `cy ≤ L.pup.y − L.pup.h·1.2 − bh/2 − 12`, or use `bh = 150` when `!portrait && H ≤ 720`.
4. **Size tag.** "small" is drawn at `ih·0.5` (≈ 14 CSS px on iPhone, `topics/iphoneL-en-a3-L2-size-basket.png`), and "big" has nothing to compare against. **Fix:** draw both balls side by side, the target in full colour and the other as a 35 % alpha ghost.
5. **Shapes tag at age ≥ 5** uses fill `#c9a877` on `#FFF6E2`, about 2.1:1 contrast (`topics/*-a5-L0-shapes-basket.png`). **Fix:** use fill `#a5743f` with a `#6b4a2a` outline.
6. **Speech bubble far wider than its text on iPad.** On iPad landscape it is 774 CSS px wide for a 20-character prompt (`screens/ipadL-en-05-hint.png`); on iPad portrait it is 536 px wide. **Fix:** in `ui.js placeBubble` / `style.css .bubble`, use `width: auto; max-width: <r.w>px`, so the box hugs the text.
7. **Talk time on iPhone portrait in VI** (`screens/iphoneP-vi-09-talk.png`). "màu xanh dương" forces a 2+1 layout, and the mic label "Bé chạm hoặc nói đáp án nhé!" wraps onto 2 lines. **Fix:**
   - `@media (max-width:430px) { .talk-choices button { flex: 1 1 0; min-width: 0; } .talk-choices button small { font-size: 14px; } }`
   - `.mic-btn { font-size: 17px }` on narrow screens.
8. **Settings in iPhone landscape (VI)** (`screens/iphoneL-vi-02-settings.png`). The 4th toggle, "Trả lời bằng giọng nói", wraps and sits half behind the sticky Done button, and you have to scroll to see it. **Fix:** inside `@media (max-height: 500px)`, use `.set-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .toggle { font-size: 15px; }`.
9. **Session done in iPhone landscape.** The panel covers Pip below the collar (`screens/iphoneL-en-12-done.png`). This is acceptable. Optionally, in landscape, put Pip at 0.22 W and the panel on the right (`#scrDone { justify-content: flex-end }`).
10. **Deuteranopia shifts green balls to khaki,** close to the hedge colour (`tests/out/visual/cvd/iphoneL-a4-L0-r2_deut.png`). The bubble rim keeps the item readable. Optionally give balls a 3 px darker outline (`dark` palette value) for extra separation.
11. **Tall portrait phones leave a large empty sky band.** Pip is 129 CSS px, about 15 % of 852. That is fine for falling time. Optionally raise `tallK` from 1.1 to 1.2 when H/W > 2.

## Checked and OK
- **Pip's face** is fully visible above the basket in every mood, device and chapter (`sheets/pip.png`). The moods idle, blink, talk, happy, cheer, think and oops are all distinct and none are scary. The run frames lean and mirror correctly.
- **Items sit inside the basket,** between the back and front walls, and are clipped at the bottom (`sheets/count-basket.png`, `sheets/size-basket.png`, `screens/*-06-catch.png`, `*-08-rounddone.png`).
- **Bubbles read clearly** in all 4 moods (sunny, breezy, rain, golden evening): see `moods/*.png` and `sheets/topics-*-full.png`. Animal and fruit stickers stand out on the peach evening sky thanks to the white border.
- **Hint glow** is visible on both phone and iPad, as a gold halo plus sparkles (`screens/*-05-hint.png`).
- **Target tags** for colours, shapes (age ≤ 4), count (fruit + N + progress dots), animals, sound (♪), letters, lower and initial are legible on every device (`sheets/topics-*-basket.png`). The exceptions are P2-4, P3-4 and P3-5.
- **Speech bubble vs HUD:** they never overlap in any of 48 measured rounds (`overlapHud: false`). No VI text overflows (`overflow: false`). The auto-fit font is 16.4 CSS px on phones and 30 px on iPad.
- **Talk time:** the choices are ≥ 90×96 CSS px on phones and 140×130 on iPad. The panel never scrolls, and the mic button is always visible.
- **Notch:** with notch insets (59 px top or sides, 34/21 px bottom), the HUD, bubble, Pip, basket, panels and buttons all stay out of the sensor housing and home-bar zones (`notch/*.png`). The only problems are P1-1 and P2-3.
- **Answer colours vs background and Pip:** every answer colour stands apart from the sage background, the honey basket and Pip's caramel fur (`#D9A066`). The CVD-weak pairs blue+purple and red+green are already excluded below age 5.
