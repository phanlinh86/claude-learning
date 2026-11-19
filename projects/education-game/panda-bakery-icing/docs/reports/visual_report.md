# Visual QA report: Mochi's Icing Bakery (2026-11-19)

This report only describes problems. No game code was changed.

**What was covered:** 7 viewports, each in EN and VI:
- iPhone 393×852 and 852×393 (notch insets: top 59 / bottom 34 in portrait; left and right 47, bottom 21 in landscape)
- iPad 820×1180 and 1180×820 (insets 24 / 20)
- 390×844 (inset 47 / 34)
- 375×667 portrait and 667×375 landscape

Every screen was captured: title, settings, pause, chapter banner, pick, all 4 seasons, every topic of ages 3–7 mid-trace, chips, finish, hop, animal walking home, full rack, two Talk-time screens and session done. About 500 screenshots in total, plus a geometry probe on each shot. The probe records the tray, choice, Mochi, rack, bubble and HUD boxes, safe-area intrusions, bubble overflow and the distance between the bag nozzle and the finger.

**Scripts:**
- `tests/visual/qa_full.js` runs the full sweep. Usage: `VP=ip-p,ip-l LANGS=en,vi OUT=dir`. It writes `<vp>-<lang>-<name>.jpg` plus a `<vp>-<lang>.json` geometry file.
- `tests/visual/qa_layout_probe.js` prints whether the page picked the row or column layout.
- `tests/visual/qa_start_marker.js` captures the trace step before the first press.

The screenshots and zoomed crops used in this report are in `docs/reports/visual_qa/`. The `sheet_*.jpg` files are contact sheets.

**What passed (measured):**
- **Bag nozzle position:** the nozzle sits exactly under the finger. The distance was 0.4–0.8 logical px on every viewport.
- **Mochi:** never overlaps a choice. The only overlap with the tray box is her 10 px hit-pad and her feet on the rim.
- **HUD and bubble:** neither covers any choice. Nothing sits inside the emulated notch or home-indicator areas.
- **Text:** no bubble text overflowed. Vietnamese diacritics are crisp in the bubble, menus and Talk (`visual_qa/tall-p-vi-07-a5-letters.jpg`, `visual_qa/ip-p-vi-13-talk.jpg`).
- **Errors:** no console errors in any run.
- **Landscape seasons:** easy to tell apart (`visual_qa/sheet_ipl_a.jpg`).
- **Cookies:** rack cookies and the session-done gallery show their icing, chips and sprinkles.
- **Guide dots on dough:** visible, about 1.7:1 contrast plus a shadow.
- **Stroke badges:** the numbers on multi-stroke glyphs are readable.

---

## P1: fix before release

### P1-1 · iPhone landscape with a notch, and iPad landscape: the tray is about 27 % smaller than it could be
- **Screenshots:**
  - `visual_qa/ip-l-en-07-a4-colors.jpg`: 852×393. The tray is 292×201 CSS px and the big cookie only **156 px**.
  - `visual_qa/se-l-en-07-a4-colors.jpg`: the smaller 667×375 phone. The cookie there is **220 px**, so the bigger iPhone gets the smaller cookie.
  - `visual_qa/pad-l-en-06-season0.jpg`: iPad landscape uses the row layout with tray.s 0.84, against 1.05 for the column layout.
- **What happens:** `computeLayout` (world.js ~l.195) rejects `columnLayout` in both cases.
  - **iPhone landscape:** the HUD keep box (hudKeep 457×129 logical, top right) raises `colTop` to 137. `colBot` = 656 because of the bottom inset. That leaves 519 px for the column, but `choicesPlan` = 4 needs 4·116 + 3·24 = **536 px**.
  - **iPad landscape:** the *bubble* keep box (x 18–506) raises `colTop` to 168, although it is nowhere near the right-hand column.
  - Result: tray.s 0.84 where 1.15 (iPhone) or 1.05 (iPad) was available.
- **Fix:** in `columnLayout` (world.js l.206–246):
  - Apply a `hk[i]` box to `colTop` only if it overlaps the column horizontally: `hk[i].x < colX + r && hk[i].x + hk[i].w > colX - r`. Compute `colX` first.
  - When `colBot - colTop` is too small, retry with `choiceGap: 12`, or plan for `max(n, 3)` instead of `choicesPlan`.
  - I checked this headlessly with `IB.World.computeLayout` and the real hudKeep values. With `choiceGap 12`, the column is chosen at **s 1.15** on iPhone landscape and **1.07** on iPad landscape. With "HUD box only", iPad landscape reaches 1.05.

### P1-2 · Road guide dots and start ring are almost invisible on the parchment (animals topic)
- **Screenshots:**
  - `visual_qa/ip-p-start-animals.jpg` and the zoom `visual_qa/z_start2.png`
  - Mid-trace: `visual_qa/z_road.png`
- **What happens:** `drawGuide` (cookie_art.js l.720–731) fills the dots with `#FFF8EC`, which is **the same colour as the tray parchment** (`#FFF8EC`, contrast 1.00:1). Only the 35 %-alpha brown shadow shows. On iPhone the dots are about 8 px across. The white start ring also sits on the parchment at the edge of the animal cookie. Road rounds happen every chapter for ages 3–5, so a 4-year-old does not see where to go.
- **Fix:** in `drawGuide`, take a `bg` option, or detect road paths (`path.kind === 'road'`, or let render pass `{onParchment:true}` for the animals topic). Then draw:
  - dots in a mid-tone such as `#E9B872` with a `#9A6330` 1.5 px outline,
  - or a 2 px `#C98E4A` ring around the cream dots.
  
  Also give the start ring a gold fill (`#FFE7A8`) rather than only a white stroke. Rule: the guide must be ≥ 3:1 against whatever is under it.

### P1-3 · The season does not read at a glance in any portrait layout
- **Screenshots:**
  - `visual_qa/ip-p-en-06-season0.jpg` (spring) and `visual_qa/ip-p-en-06-season3.jpg` (winter): almost identical.
  - `visual_qa/se-p-en-04-pick.jpg`: the window is completely hidden.
  - `visual_qa/pad-p-en-12-rack.jpg`: the rack covers the window band.
- **What happens:** in portrait the window glass shows only as a strip about 40–60 CSS px high between the tray bottom and the counter (y ≈ 655–715 on 393×852), and the jars and lemonade jug cover most of it. The only seasonal clue left is a small prop (pumpkin or gingerbread house). On 375×667 the strip is 0 px. On iPad portrait the cooling rack (`layout.rack` 314×89 at y 877) sits right on it. Meanwhile there is an empty band of about 80 px between the bubble (bottom 206) and Mochi's hat (≈ 285) on 393×852.
- **Fix:** in render.js `_backdrop`, the portrait branch of `envLayout`:
  - Place one far-window tile *above* the tray, in the free band behind Mochi and the rack (y = bubble bottom → tray top), and/or
  - Tint the whole wall per season (`weather.ambient`): a slightly cooler and bluer wall plus frost corners in winter, a warmer wall in summer.
  - Add outside particles that drift across the full screen top: petals, leaves, snow. At the moment they are clipped to the glass.
  - On iPad portrait, move the rack into the band above the tray, to the right of the bubble tail, so it does not cover the window.

---

## P2: should fix

### P2-1 · Choices look small on phones
- **Screenshots:** `visual_qa/ip-p-en-04-pick.jpg`, `visual_qa/se-p-en-04-pick.jpg`
- **What happens:** with `choiceR` 58 logical and a view scale of 0.52–0.55, the drawn choice is **60–63 CSS px**. Icing bags are only about 35×60 px, because `drawIcingBag` uses `2.05·r` as the *length* and the bag is slim. The hit circle (`hitR` 76) is 79–83 px, which is below the 100 px target. iPad is fine: 132 px drawn, 173 px hit. Portrait phones have room to spare: with at most 4 choices, 4·144 + 3·24 = 648 < 680 usable.
- **Fix:**
  - Add `choiceRPort: 72` to `CONFIG` and use it in `rowLayout` when `portrait && n <= 4`, with `hitR = r + 18` giving 98 CSS px.
  - In render.js `_choices` (l.315), draw bags at `2.4·r` so they fill the slot visually.

### P2-2 · Unpicked choices stay bright during the trace and chip-counting steps
- **Screenshots:** `visual_qa/ip-p-en-08-chips.jpg` and every `07-*` shot. The "5" and "1" cookies, or a spare bag, sit at full opacity while the child should count chips or trace.
- **Why it matters:** a 4-year-old counting "how many chips" sees numerals 5 and 1 below and taps them.
- **Fix:** in world.js, after a correct pick, set `dim → 0.6` on the other choices (the `opt.dim` field already exists in `drawCookie` / `drawIcingBag`), or slide them down by 30 px. Restore them on the next pick step.

### P2-3 · Yellow and orange icing on dough are weak
- **Screenshots:** `visual_qa/z_yel.png` (yellow line on the cookie, iPad) and `visual_qa/pad-p-en-07-a4-shapes.jpg` (orange)
- **Measured contrast against dough `#E9B872`:**

  | Icing | Luminance contrast | ΔE |
  |---|---|---|
  | yellow `#FFD23F` | 1.26:1 | 33.7 |
  | orange `#FF9A2E` | 1.17:1 | 33.5 |
  | pink | 1.16:1 | 62 (separated by hue) |
  | green | 1.25:1 | 62 (separated by hue) |
  | red | 2.10:1 | 57 |
  | purple | 3.23:1 | 100 |
  | blue | — | 97 |

  The yellow dark edge `#C99A12` only reaches 1.43:1 against dough.
- **Fix:** in cookie_art.js `drawIcing`:
  - For yellow, orange and pink only, add a 2 px outer outline in the palette *dark* tone (`#C99A12` → use `#A87A0A` for yellow), or a thin white halo of 1.5 px at 70 % under the stroke.
  - Alternatively, use the lighter dough `#F6D59D` for the board cookie in colour rounds, which raises yellow's ΔE.

### P2-4 · Shape-outline icing hangs half off the cookie
- **Screenshot:** `visual_qa/z_sq.png` (square, iPad portrait)
- **What happens:** the icing (22 picture px wide) is centred on the cookie's cut edge, so about 11 px lies on the parchment and it covers the baked rim. It reads as a frame rather than icing on the cookie.
- **Fix:** in content.js `shapes` (path `size`), or in `IB.Trace.path({kind:'shape'})`, inset the outline by about 16 picture px. For example, path size = cookie size − 32, so the stroke sits fully on the dough. The `size` topic circle can stay where it is.

### P2-5 · Guide dots and start marker are small on phones
- **Screenshot:** `visual_qa/z_start.png`
- **What happens:** `DR = 7` and `SP = 22` picture px come out at **about 8 px dots** and a ring about 26 px across on 393-wide phones. The gold arrow (≈ 10 px) has little contrast against the dough.
- **Fix:** in cookie_art.js `drawGuide`, scale `DR` with `1/ctx scale` so it never drops below 5 CSS px radius, for example `opt.minDotPx`, which render can compute from `view.s * tray.s`. Make the start ring at least 18 CSS px radius with a pulsing gold fill. Give the arrow a `#9A6330` outline.

---

## P3: polish

1. **Bubble overlaps the tray on 667×375 in VI** (`visual_qa/se-l-vi-04-pick.jpg`).
   - The 3-line VI prompt "Mình vẽ đường thẳng màu xanh dương nào! Bé chọn túi kem…" grows the bubble to 64 px and overlaps the tray's top-left rim by 330 px² (rim only, not the cookie).
   - Fix: in `columnLayout`, use `top = max(bubble bottom measured from DOM)`. Or keep VI prompts on small landscape screens to 2 lines with a shorter variant.
2. **Title on small VI phones** (`visual_qa/se-p-vi-01-title.jpg`).
   - The logo wraps to 4 lines, "Gấu Trúc / Mochi / Tiệm Bánh / Quy", leaving "Quy" alone on the last line.
   - The star/age chip covers Mochi's hat (hat top y ≈ 480, chip y 490–520).
   - Fix in style.css: put `white-space: nowrap` on `.logo span` with `font-size: clamp(30px, 9vw, …)` for VI, and limit the title Mochi's height on short portrait screens (`@media (max-height: 700px)`).
3. **White logo text over the window is a little weak in landscape** (`visual_qa/ip-l-vi-01-title.jpg`). "Gấu Trúc Mochi" is white with a 2 px brown stroke over pale window glass.
   - Fix: `-webkit-text-stroke: 3px`, or a soft cream plate behind `.logo` in landscape.
4. **The chapter banner hides Mochi in portrait, leaving only her ears poking out** (`visual_qa/ip-p-vi-03-banner.jpg`).
   - Fix: in render.js, draw the banner lower (the tray centre) in portrait, or fade Mochi out while it shows.
5. **Session-done gallery label is tiny on phones** (`visual_qa/ip-p-en-15-done.jpg`, `visual_qa/se-p-vi-15-done.jpg`).
   - "Our cookies" / "Bánh của bé" is about 12 CSS px (`lh` clamp 22–34 logical). The gallery cookies are about 30 px on 375×667.
   - Fix: in render.js ~l.485, use `lh = clamp(..., 30, 40)`. In portrait, give the gallery the band under the panel (lower `nh` from 0.36 to 0.28).
6. **Rack cookies are about 35 px on iPhone landscape** (`visual_qa/ip-l-en-12-rack.jpg`, `visual_qa/z_rack.png`).
   - They are readable but small. P1-1 frees space that the rack can use.
   - Fix: `rackCookieMin` 50 → 60.
7. **The Talk-time chip question shows the cookie at about 90 px with chips about 10 px** (`visual_qa/ip-l-en-14-talk2.jpg`).
   - The `talkShow` canvas has free room.
   - Fix: in ui.js / `CookieArt.drawIcon('dots')`, draw the cookie at 85 % of the canvas height and the chips at 1.4×.
8. **The walk-home road starts mid-tray once the animal has passed** (`visual_qa/ip-l-en-11-walkhome.jpg`). The icing behind the walking dog is gone, so the finished road looks short.
   - Fix: keep the full road drawn during `hop` for animals.
9. **Mochi's resting bag nozzle pokes about 8 px into the tray's top-left parchment** on 375×667 (`visual_qa/se-p-en-04-pick.jpg`) and covers the rim corner.
   - Fix: `mochiHPortUp` or move the bag grip in portrait-up so the tip stays above `tray.y - frame`.

---

## Contact sheets
- `visual_qa/sheet_ipp_topics.jpg`: iPhone portrait, all age/topic mid-trace
- `visual_qa/sheet_padl7.jpg`: iPad landscape, all topics
- `visual_qa/sheet_ipl_a.jpg`: iPhone landscape title, settings, banner, pick, pause and 4 seasons
- `visual_qa/sheet_padp.jpg`: iPad portrait, every screen
- `visual_qa/sheet_sep_vi.jpg`: 375×667 VI, every screen
- `visual_qa/sheet_ipl_vi.jpg`: iPhone landscape VI

Note: the older `docs/reports/visual/` folder (from `screens.js`) holds 128 PNGs at about 11 MB. Consider not committing it, or converting it to JPEG.
