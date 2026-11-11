# Visual QA — Tuk's Ice Match (2026-11-11)

Report only; nothing under `game/` was changed. All values are **logical px** (short side 720) unless marked css.
Screenshots: `tests/out/visual/<section>/…` (paths below are relative to that folder).

## How it was run
```
node tests/visual/capture.js            # screens topics seasons rewards notch short flip phases surprise
node tests/visual/weather_live.js       # live weather particles per stage (new)
node tests/visual/measure.js            # bubble / banner / Talk fit, EN + VI
node tests/visual/analyze.js            # geometry, reward placement, ΔE00 contrast
```
Harness changes (tests/visual only): polar `AGE_TOPICS` (homes at 4/5), polar party rewards, `geom()` now records
shore/sea/board/badges, new sections `phases` (glide → clink → melt → emerge → fish/animal flight → settled, per topic) and
`surprise` (slide mid-glide, aurora golden, floes), `weather_live.js`, analyze.js uses ice colours (clear ice `#DDF1FB`,
frost `#F2F8FC`, Tuk hat `#C9454F`). Coverage: 4 viewports × EN/VI for every screen; 12 topics × ages 3–7 (6 device/lang
runs, 120 shots); 4 weather stages × 4 devices (frozen and live); 3 surprises × 4 devices × ages 4/7; notch insets
(Dynamic Island portrait 59/34, landscape 59/59/21, iPad 24/20); short phones (SE, mini).

## What passes
- **Block size:** 0 of 282 rounds undersized. Smallest: iPad P 122.6 (age 6, 5×2 = 139.7 css), iPhone P 169.4 (92.5 css),
  iPhone L 177.4, iPhone SE P 151.3. Ages ≤ 4 never below 169. Gap ≥ 14 everywhere.
- **Faces in the ice:** colours, shapes, numerals, sums, fish dice (to 12), parity rims and all 9 animals + 7 homes read well
  in every weather; the white animals (bear, fox, owl, hare) keep their grey outlines + sticker border on the ice
  (`topics/iphoneL-en-a3-1-size.png`, `topics/ipadL-en-a5-3-homes.png`). Answer colours vs clear ice ΔE00 30.5–47.4.
- **Notch / home indicator:** nothing in the red zones (`notch/*.png`); HUD drops below the island in portrait.
- **Vietnamese text:** bubble never overflows (min font 20 px iPhone, 30 px iPad), banner min 51.6 ("Tượng tuyết hình khối"
  = 28 css on iPhone), Talk / pause / done fit. Logo "Cánh Cụt Tuk / Lật Băng" clears Tuk on all titles.
- **Weather:** sunny / breezy / rain / rainbow skies look right; live particles ≤ 78 (rain 55 drops + splashes), faint, and
  never hide a block (`weather/*.png`). Rainbow arc sits behind the lake, not over the HUD.
- Frosted blocks are identical (mean channel Δ ≤ 1.8/255 between blocks, every stage).
- Settled rewards never land on blocks, under the HUD or under the bubble (0 cases in 66 late-chapter rounds).

## P1
1. **Talk time "homes" shows English text keys, no pictures, also in Vietnamese.** Choices read `sea` / `floe` /
   `pebbles` as plain words (`talk/iphoneL-vi-homes.png`, `talk/iphoneL-en-homes.png`); a 4-year-old cannot read and the VI
   child gets English. Cause: `ui.js _choiceVisual()` has no `case 'home'`, so it falls back to `String(c.value)`.
   Fix: add `case 'home': return { kind: 'home', value: c.value, sprite: c.sprite || 'home_' + c.value };` (the label then
   comes from `NAME(lang, 'home', value)` = "ice floe"/"tảng băng trôi"); check `IM.Renderer.preview` draws kind `home`
   through the sprite callback like `animal`.

## P2
2. **Blocks slide over Tuk during the deal.** Measured overlap (min side of block ∩ Tuk box): iPad L 132.8, iPhone L 154.0,
   iPad P 144.6, iPhone P 47.6 — Tuk is fully hidden for ~0.3 s every round (`deal/ipadL-deal-over-tuk.png`,
   `deal/iphoneL-deal-over-tuk.png`). Fix: `render.js _game()` draw cards with `state === 'deal'` *before* `this._dee()`
   (they come out from behind him), or in `world.js` start the slide for rows that cross `layout.tukRect` at
   `tukRect.x + tukRect.w` instead of `ins.left − 60`.
3. **Fish dive into the snow, not the sea.** `layout.sea` = (W − ins.right − 90, groundY + 34) is on the white snow bank; the
   visible open water of `mid_<s>.svg` is at ≈ groundY − 80 … groundY − 30 (iPhone L water 549–604, sea target 664;
   iPad L same; `phases/ipadL-a4-colors-splash.png`). Fix: `CONFIG.seaDy` ≈ −55 (and keep it clear of the board: x right of
   `grid.rect`), or draw a small open-water hole/ripple at `layout.sea` in `render.js` so the splash has water.
4. **Home badge half hidden behind its animal and tiny on phones.** `badgeDx −36` with animal 70 / badge 58 → 28 px overlap
   (48 % of the badge under the animal); badge = 32 css on iPhone (66 css iPad); floe/pebbles badges are white-on-white on the
   snow (`phases/iphoneL-a4-homes-z-late.png`). Fix: `CONFIG.badgeDx = −70` (35 + 29 + 6), `sizes.badge 58 → 72`, and in
   `render.js _badge()` add a blue-grey ring (`#6FA7C8`, 3 px) + shadow so it reads on snow.
5. **Lake panel runs off the screen edge.** `_panel()` pads the grid by max(20, 1.4·gap) = up to 35 px but the board is only
   24 px from the edge: iPhone L 6×1 +9.0 px past the right edge, iPad P 3×2 +10.8 both sides, iPad L 4×2 +5.7, iPhone SE L
   5×2 +7.2 (`topics/ipadL-en-a5-3-homes.png` right edge, `topics/iphoneL-en-a4-*.png`). Fix: in `render.js _panel()` clamp
   `x ≥ ins.left + 6`, `x + ww ≤ W − ins.right − 6`, or set `CONFIG.boardSide` 24 → 40.
6. **Floes surprise: floes cut by the screen edge.** Floe pad = block × 1.36 + 20 → 0.18·w + 10 px beyond each block (≈ 42 px at
   cw 178) vs 24 px board margin (`surprise/ipadL-a7-floes-peek.png` "8" floe cut, `surprise/iphoneL-a4-floes-*.png`,
   `screens/ipadP-*-05-peek.png` blocks touch both edges). Fix: `world.js floesLayout()` reserve `0.18·cw + 10` on each side of
   the board before centring (shrink `S`/x range), or clamp `rx` in `render.js _pads()`.
7. **Rainbow party hides half the friends (landscape) and Tuk (portrait).** Landscape: friends are spread over the full width,
   the done panel covers x > 448 css of 852 (iPhone) / 698 of 1180 (iPad) → 4 of 10 animals hidden
   (`screens/iphoneL-vi-14-done.png`). Portrait: panel top 321 css covers Tuk from the chest down (`screens/iphoneP-*-14-done.png`).
   Fix: `render.js _doneScene()` in compact mode use `x1 = panelLeft − 20` (pass the `.done-panel` rect via `o`), in portrait
   place Tuk with his feet ≤ panelTop − 10 (or shrink `hgt`).
8. **Sky stars clump (age 7 iPad L).** 15 stars packed between the bubble and the board, spread 0.14 × 0.24 of the screen,
   28 overlapping pairs; numbers like "12" covered (`rewards/ipadL-a7-add-late.png`). Portrait shore similar: 15 rewards,
   22 overlapping pairs, spread 0.61 × 0.02 (`notch/iphoneP-en-rewards.png`). Fix: `world.js _perch()` require
   centre distance ≥ 0.9·size for stars/animals (`perchMinGap` 24 → per-kind), add sky candidates right of the bubble /
   below the HUD, and in portrait use the shore band left of Tuk too.
9. **Talk answer buttons too small on iPhone landscape for text answers** (homes/letters/lower/add): 50 css = 92 logical min
   side (< 100 rule) (`measure.js` iphoneL "btn50"). Fix: `style.css` under `@media (max-height: 430px)` give
   `#talkChoices button` `min-width: 64px; min-height: 64px`.

## P3
10. Melt hole lands at the clink point between slots and pokes out as a dark navy crescent behind neighbouring frosted blocks
    (`phases/ipadL-a4-homes-e-fly1.png`, `-f-fly2.png`). Draw the hole at 0.7× or under the panel-coloured rim.
11. Bubble covers the top row by 0.7 px on iPhone P 2×5 (ages 6–7) and 9.6 px on iPhone SE P (`topics/iphoneP-en-a6-*.png`,
    `short/seP-*-peek-a7.png`): `boardTopGap` +10 in portrait.
12. Contrast: clear ice vs lake panel ΔE00 1.1 sunny / 1.9 rainbow, frost vs lake 4.1–5.9 — blocks rely on the `#6FA7C8`
    outline + side face (fine today; don't thin the outline). Red answer vs Tuk's hat ΔE 7.8 — keep the 40 px rule.
13. Settings on landscape phones: sticky "Done" covers the "Answer by speaking / Trả lời bằng giọng nói" toggle (panel scrolls
    41 px, VI label wraps) (`screens/iphoneL-vi-02-settings.png`). Parents only.
14. Size round: the little animal is ≈ 37 css on iPhone (`topics/iphoneL-en-a3-1-size.png`); party friends 41 css on iPhone.
15. iPhone SE landscape VI Talk "shapes" overflows 20 px (scrolls).
16. Aurora golden pair has no visible cue before it is matched (by design?); the rainbow reward arc draws over frosted blocks for
    ~1 s (`surprise/ipadL-a7-aurora-golden.png`).

## Re-check after commit 6a84a07 (QA fixes)
Re-ran `capture.js screens rewards notch phases surprise`, `measure.js`, `analyze.js` and the deal / talk / splash scripts
(`tests/out/visual/{deal,talk,phases,surprise,rewards,notch,screens}`) on the 4 viewports.

| # | Item | Result |
|---|---|---|
| 1 (P1) | Talk "homes" | **Fixed.** Each answer now shows the home badge picture and a translated label ("tổ sỏi / hang tuyết / biển", "pebble nest / snow den / the sea") (`talk/iphoneP-vi-homes.png`, `talk/iphoneL-*-homes.png`). |
| 2 | Blocks sliding over Tuk during the deal | **Fixed.** The block still crosses Tuk's area (130–154 px on landscape/iPad P) but is now drawn behind him, so he stays visible (`deal/*.png`). |
| 3 | Fish diving into the snow | **Fixed.** `layout.sea` y = 575 on iPhone L / iPad L, inside the visible water (549–604); 1416 / 891 in portrait. |
| 4 | Home badge | **Fixed.** Badge now sits fully beside the animal with a rim: 39 css on iPhone, 82 css on iPad (`phases/iphoneL-a4-homes-z-late.png`). |
| 5 | Lake panel edges | **Fixed.** Panel is inside the screen on iPad P 3×2 and iPhone L (the grid is now 3×2) (`screens/*-05-peek.png`). Smallest block is still ≥ the age minimum: 116.8 at age 7, iPad P. |
| 6 | Floes cut by the screen edge | **Fixed.** All 4 viewports stay on screen (`surprise/*-a7-floes-peek.png`). |
| 7 | Rainbow party | **Fixed.** In landscape the friends row stays left of the done panel; in portrait Tuk is above the panel (`screens/*-14-done.png`). |
| 8 | Crowded rewards | **iPad L age 7 fixed:** spread 0.84 × 0.32, 3 overlapping pairs (was 28). **Still P2 on iPhone portrait:** 15 shore rewards still pile up in one row, spread 0.61 × 0.02, 28 overlapping box pairs (`notch/iphoneP-en-rewards.png`: bear behind whale, owl over fox, puffin over penguin). Fix: in portrait also use the shore band left of / under Tuk and a second row (`groundPerchDy`), or shrink shore rewards to 0.8× when there are more than 10. |
| 9 | Talk buttons on short screens | **Fixed.** 96×64 css = 117 logical on iPhone L and iPhone SE L. `measure.js` "btn45" readings were taken during the button pop-in animation. |

Still open P3: a star particle passes over Tuk's hat in the late-round frames; the bubble overlaps the top row by 0.7 px on iPhone P 2×5 and by 9.6 px on iPhone SE P (the `topics` section was not re-run); items 10 and 12–16 above.
