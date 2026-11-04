# Visual QA report — Lulu's Jungle Tower (2026-11-04)

Tester: visual QA agent. No game code was changed; only `tests/visual/*` and this report + images.

## How it was captured
- `node tests/visual/jt_capture.js [screens tod topics contrast talk]` (default: all; ≈ 6 min, run in the background).
  Helpers: `tests/visual/jt_lib.js` (Playwright contexts with `isMobile/hasTouch`, notch emulation, a hand-stepped
  "frozen" world: `D.adv`, `D.toRound/toAsk`, `D.drag` through the real `world.pointerDown/Move/Up`, `D.finishTower`),
  `tests/visual/jt_analyze.js` (contrast + layout flags → `docs/reports/visual/analysis.md`),
  `tests/visual/jt_sheet.py` (contact sheets / real-size crops), `tests/visual/jt_compact.py` (re-saves the PNGs as
  256-colour palettes: 443 MB → 66 MB; the contrast numbers come from the live canvas, not from these files).
- Viewports: iPhone 393×852 @3 portrait + 852×393 landscape, iPad 820×1180 + 1180×820 @2.
  Safe areas emulated through `--sa-*` on `:root` (read by `#safeProbe`): iPhone portrait 47 px top/bottom, landscape
  47 px left/right + 21 px bottom, iPad 24 px top / 20 px bottom. The unsafe zones are painted light red, the island /
  home bar black in the shots.
- Output (`docs/reports/visual/`, 456 PNG):
  - `screens/` 104 — title, settings, chapter banner, ask, drag in progress, wrong bounce, hint (ghost hand), pause,
    count glow, monkey grab (flowers), Talk time, chapter stars, session done × 4 viewports × EN/VI;
  - `tod/` 24 — the 4 times of day (age 5 colours, round 4), night tower-done, the breeze **hold** pose, × 4 viewports;
  - `topics/` 240 — every topic of ages 3–7 at round 4 ask 2, × 4 viewports × EN/VI, + a tower-done frame (EN);
  - `talk/` 80 — Talk time for every topic/age (iPhone P/L, iPad L; VI everywhere, EN on iPhone L);
  - `contrast/` 8 + `contrast/contrast.jsonl` — every palette colour sampled from the real canvas on every mood.
- All 20 topic/age combinations reached their target ask (`ok: true`), no page errors, no bubble/Talk/DOM overflow.

## Verdict
The game looks polished: clean flat art, Lulu reads well at every size, block faces (dots, numerals, letters, shapes,
animal stickers) are crisp and legible at real size on every device, night is readable, Vietnamese fits everywhere
(bubbles wrap to ≤ 3 lines without overflow, buttons and Talk labels never clip). One P1 (iPad portrait hides the goal),
several P2 composition issues.

## P1 — must fix

**P1-1 · iPad portrait: the bananas (the goal) and the monkey are hidden under Lulu's speech bubble for the whole round.**
- Measured (820×1180, logical W 720 × H 1036, s 1.139): bubble y 131–255 (`layout.bubble` = ins.top + 110, h 124);
  bananas y 176–280 → 79 of 104 px (76 %) under the opaque bubble; in the ask frame they are invisible (only the stem
  above the bubble shows). At tower-done the monkey's head/body and the grab happen under the bubble too
  (`screens/ipadP-*-04-ask.png`, `…-10-monkey-grab.png`, all `topics/ipadP-*`, `tod/ipadP-*`; flagged 65× by the analyser).
- Cause: `world.js computeLayout()` portrait — `topRoomPort: 260` only keeps the *tower top* 260 px below ins.top, but
  the 104 px bananas (+ `goalGap` 8) hang above it, and the bubble ends at ins.top + 234.
  On iPhone portrait (tall) there is plenty of sky so it doesn't happen (bananas 618–722, bubble ends 346).
- Fix (keeps S = 91): for `portrait && !tall` put the bubble on the HUD row, left of the HUD:
  `bubble = { x: bx, y: ins.top + cfg.bubbleYLand /*18*/, w: hudLeft - 14 - bx, h: cfg.bubbleHPort }` where hudLeft is the
  real HUD left edge in logical px (iPad P: HUD measured at x 490–711, y 30–79 → w ≈ 452 logical = 515 CSS px; 30 px
  font fits the longest VI prompt in 2 lines). Bubble then ends at y 163, bananas start at 176.
  Also make the rule generic: `topRoomPort` must be ≥ bubble bottom − ins.top + 12 + goalH + goalGap
  (assert it in `tests/unit/run.js` for 820×1180, 768×1024, 1024×1366, 393×852, 375×667).
  Alternative if the bubble must stay full-width: for `!tall` portraits `baseDyPort` 150 → 90 and `topRoomPort` 260 → 358
  (S becomes 84 = blockMin; bananas 272–376 clear the bubble by 17 px).

## P2 — should fix

**P2-1 · Session done, portrait: the panel covers Lulu's body and the bottom half of the rainbow tower.**
iPhone P: panel (CSS 428–788) = logical 784–1443; `render._doneScene` puts the ground at `gy = H·0.62` = 968, so the stump,
3 of 6 blocks and everything of Lulu below her chin are behind the panel (`screens/iphoneP-*-13-done.png`). iPad P is the
same (panel 808–1136 CSS). Landscape compositions are good.
Fix in `render.js _doneScene`: portrait `gy = Math.min(H * 0.62, panelTopLogical - 20)` with
`panelTopLogical = (#scrDone .done-panel).getBoundingClientRect().top / view.s` (or pass it in `o`), i.e. ≈ 764 on iPhone:
tower top = 764 − 56 − 6·84 = 204 (below ins.top 86 + monkey room), Lulu's head at 364 — all visible above the panel.
Optionally make the portrait panel shorter (`#scrDone .menu.row` side by side + title on one line, ≈ 250 CSS px).

**P2-2 · iPad landscape title: the hanging bananas sit on top of the logo ("Tow**er**" / "Th**áp**").**
Bananas logical x 820–912, y 212–312 (`_titleScene`: tx = W − ins.right − max(170, 0.15·W) = 866, by = gy − 64 − 3S − 26);
logo CSS 128–1052 × 215–301 → logical 112–924 × 189–264: 92 × 52 px overlap, yellow fruit on the yellow `#logo2`
(`screens/ipadL-*-01-title.png`). Fix: in `_titleScene` read the `.logo` rect and use
`tx = Math.min(W - ins.right - 60, Math.max(tx, logoRight + 12 + 46))`, and/or shrink the landscape-iPad logo
(`@media (orientation: landscape) and (min-height: 700px) { .logo { font-size: clamp(44px, 8.5*var(--u), 84px) } }`).
Portrait titles are fine (bananas float right of the tower top, see P3-3).

**P2-3 · iPhone landscape, ages 5–7: blocks are only 47 CSS px (S = 87 logical).**
`S = (baseTop − ins.top − topRoomLand)/maxN = (720 − 38 − 28 − 64 − 150)/5 = 88 → 87`; stickers/dots on the tray are
≈ 30 CSS px, the smallest targets in the game (iPad L 99 CSS px, iPhone P 55 CSS px). Still legible (checked at real
size), but small to grab for 5-year-olds. Fix options: `baseDyLand` 64 → 52 and `topRoomLand` 150 → 116 on short
landscapes (`H_css < 430`) → S = 97 (53 CSS px, bananas still from y ≈ 14); or cap the tower at 4 blocks for that viewport
(S = 100).

**P2-4 · Hold pose (breeze) does not reach the tower on iPhone landscape.**
`render.js _lulu`: `want = clamp(tower.x − S/2 − 2 − (Q.x + (285 − LULU.ax)·k), 0, 260)`. Gap before the slide: iPhone L 333
logical px, iPad L 186, iPad P 134, iPhone P 130 → on iPhone L Lulu stops 73 logical px (≈ 40 CSS px) short and
"holds" thin air (`tod/iphoneL-hold.png`); elsewhere her head touches the top block correctly (`tod/iphoneP-hold.png`).
Also a 186–260 px glide with still legs reads as sliding. Fix: raise the clamp to 360 and add a walk bob (±4 px y at
6 Hz while |dx'| > 20 px/s), or in landscape place Lulu nearer the tower (`lulu.x = max(ins.left + 120,
tower.x − S/2 − 60 − 0.31·h − 140)`, i.e. a gap ≤ 140 px on every viewport).

**P2-5 · Blue vs purple are almost identical for deuteranopes (from age 5, when both can be in one choice set).**
Faces sampled on the canvas: ΔE00 blue/purple = 23.4 normal, **1.2 deutan**, 5.9 protan (`analysis.md`); the age-5
`colors` set in `contrast/` actually shows blue + purple + green together. Fix (`content.js JT.PALETTE.purple`):
base `#8E44AD`, dark `#5E2A78`, light `#C9A0DC` → blue/purple ΔE00 33.3 / **12.7** / 20.2 and ≥ 31.6 normal vs every other
answer colour (verified with `tests/visual/colour.js`). Or keep the hue and never pair blue+purple at any age.

**P2-6 · Talk time "big or small?" (age 3 `size`) shows ONE block with nothing to compare it to.**
`talk/*-a3-size.png`: a single orange block in the preview, "Is this big or small?". A lone square has no size. Fix in
`JT.Renderer.preview` for the size talk: draw a reference beside it — the other size as a dashed outline (or Lulu's
hoof / a banana) at the left, the asked block on the right.

## P3 — polish

1. **iPhone/iPad landscape: the branch the bananas hang from is off-screen**; the bunch hangs from a stub at the very top
   edge (goal top at logical y 46 iPhone L, 67 iPad L). When the monkey swings in, its head is cut by the top edge and it
   overlaps the bubble's right end (`screens/iphoneL-*-10-monkey-grab.png`). Draw the branch so at least 40 px of it is
   visible (`branchDy` from `ins.top + 16` to ≥ goal top − 30, or draw a short leafy stub on the stem).
2. **Count numerals overlap the block edges on iPhone landscape** (S 87): the "4"/"3" glyphs touch the dice's right side
   (`topics/iphoneL-en-a6-count-done.png`). Offset the numeral by `S/2 + 18` instead of a fixed offset.
3. **Title (portrait): bananas float in the air** next to the tower top with no stem/branch
   (`screens/iphoneP-*-01-title.png`, `ipadP-*`). Draw a short vine from the top edge or a little branch.
4. **Bubble tail points at nothing in portrait**: tail at the bubble's left edge, 54 % down, but Lulu's head is ≈ 500
   logical px lower (iPhone P). Move the tail to the bottom-left (`.bubble::before/::after` → `left: 60px; top: 100%`,
   pointing down) when `layout.portrait`.
5. **Firework fx in the done scene freeze into odd shapes**: the ring + rocket trail reads as a pink "caterpillar" in a
   circle in stills (`screens/ipadP-vi-13-done.png`); in motion it is fine. Consider dropping the trail dots or making
   them fade within 0.25 s.
6. **Sunset petals are drawn over block faces** ("3" with a pink petal, `topics/iphoneP-en-a6-add.png`): render the
   `front` weather particles before the tray, or skip particles inside piece rects.
7. **Talk preview is small on iPhone landscape** (block ≈ 64 CSS px inside the 170 px column, `talk/iphoneL-*`). Draw
   the preview at ~85 % of the canvas height.
8. **Talk `lower` (age 6) shows an uppercase letter and uppercase choices** (`talk/iphoneL-vi-a6-lower.png`: "C", N/C/G) —
   the chapter is about small letters; show lowercase. Ê/E side by side in the VI `initial` Talk is hard to tell apart at
   40 px (`talk/iphoneL-vi-a6-initial.png`) — avoid diacritic look-alike distractors.
9. **Green on grass is the weakest answer colour**: WCAG 1.2–1.3 and ΔE00 12–17 vs the day grass (`#AFCB92`/`#A7C789`);
   the dark outline `#2A8343` keeps it visible. If anything, darken the tray grass band a little or add a 2 px light
   rim (`light` colour) inside the outline of colour blocks.
10. **Chapter banner + bubble say the same thing** ("Colour Blocks" in both) during the intro; hide the bubble while the
    banner is up.
11. **Settings on iPhone landscape need a 62–72 px scroll** — "Answer by talking" sits under the sticky Done button
    (parents only). `.set-grid` → 4 columns at `(orientation: landscape) and (max-height: 430px)`.
12. **Lulu looks worried while the tower counts up** when the round had misses: the `think`/`oops` mood from the last
    wrong bounce is still on at the count glow (`screens/ipadL-en-09-count-glow.png`, `iphoneL-vi-09-count-glow.png`);
    she only cheers when the monkey comes. In `world.js _startDone()` call `this._mood('happy', 1.2)` (then cheer).
13. `CLAUDE.md` of this game still describes "Pip's Camp Hide & Seek" (`FC`, `fc:`) — copy-over leftover.

## What was checked and is fine
- Notch/home-bar: HUD sits under the island (iPhone P top 57 CSS px), bubble/Lulu/tray stay inside the 47 px landscape
  insets, the tray clears the home indicator on every viewport; no piece outside the safe area or under the HUD/bubble
  (analyser, all 456 frames).
- Tower + bananas fit on every viewport (5-block towers end just below the bunch; monkey grab lands on the bananas).
- Drag (lifted, tilted block above the stump), wrong bounce (spinning block above the tower), hint (glowing right block +
  ghost hand + ghost block), count glow 1…n with numerals, flowers blooming up the tower — all readable.
- Block faces at real size: dice 1–10, numerals 0–9, letters (upper/lower), 8 shapes, 8 animal stickers — crisp on @2/@3.
- Night: blocks keep full colour (tint is backdrop-only) and pop against the dark teal grass (WCAG 1.1–2.9 but ΔE00
  24–50 + dark outlines); fireflies don't cover faces.
- Vietnamese: longest prompts wrap to 3 lines in the iPhone-landscape bubble (174 logical px tall, no overflow, clears
  Lulu's head); buttons "Chơi tiếp / Trang chủ / Chơi lại", Talk labels ("màu xanh dương", "hình tam giác"), mic button
  (2 lines on iPhone P) all fit; no clipped text anywhere (DOM scroll/client checks).
- Talk time panels fit every viewport (iPhone P 124–728 of 852, iPhone L 57–316 of 393), choices ≥ 90×96 CSS px.
- Landscape done screens: panel right, Lulu + rainbow tower + monkey fully visible.
