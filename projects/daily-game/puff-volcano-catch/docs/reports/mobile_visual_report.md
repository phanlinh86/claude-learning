# Mobile visual QA — Puff's Volcano Catch (iPhone / iPad)

Date: 2026-10-31 · Report only (nothing under `game/` changed)
Capture: `node tests/visual/mobile_capture.js` → `tests/out/visual_mobile/` (91 PNGs, no console errors). Use `--icons` to redo only the icon sheet.
Devices (emulated in Chromium with isMobile + hasTouch): iPhone 393×852@3 (`iphone-p`), 852×393@3 (`iphone-l`), SE 375×667@2 (`se-p`), iPad 820×1180@2 (`ipad-p`), 1180×820@2 (`ipad-l`), iPad Pro 1366×1024@2 (`ipadpro-l`).
Each device has these shots: title, how, settings, custom, play_start, pause, over, banner, zone0–3. There are also extra shots: `iphone-p_crossfade(_night)`, `iphone-{p,l}_notch_{title,custom,play,zone3}` (59 px notch and a 34 px or 21 px home bar, drawn on the image), `iphone-p_custom_after_pick` / `iphone-p_custom_bg_play` (a JPEG chosen through #filePick) and `icons`.

Measured layout (logical canvas VW×VH, CSS scale): iPhone-p 560×1214 @0.70, iPhone-l 1171×540 @0.73, SE 560×996 @0.67, iPad-p 560×806 @1.46, iPad-l 960×667 @1.23, iPad Pro 960×720 @1.42.

## What works
- **Safe areas:** with the simulated notch, the HUD drops below the notch in portrait and moves inside the side insets in landscape. The 💧 button stays clear of the home bar, and Puff's shore range respects the insets.
- **Sky:** the extended daytime sky joins the 960×540 art with no visible line (contrast-boosted check on `ipad-l_zone0`). Ground mirroring on wide phones has no visible joins.
- **💧 button:** about 70–73 CSS px on phones and about 104 px on iPad Pro. It sits in empty sky in portrait and on iPad, and bottom-right on iPhone landscape, where it never covers Puff.
- **HUD layout:** hearts, rain meter, score/combo, pouch and the pause/sound buttons never overlap on any device.
- **Menus:** every menu panel fits on screen (SE portrait included). Main buttons are 44–52 px tall.
- The look matches the desktop version.

## P1 — fix before release

1. **A vertical seam in the drifting cloud strip, every frame, on every device.** Seen in `iphone-p_zone0` (x≈250 CSS, y≈240), `iphone-l_zone0` and `iphone-l_title` (x≈53 CSS, y≈55), and `iphone-p_crossfade`. It shows as a 1-device-px light hairline plus a visible step in the cloud shape where two 960-px tiles meet.
   - **Cause:** `render.js:279` draws each tile through `layer()`, which rounds `x*px` on its own (`render.js:209`). The tile sprite is `ceil(960*px)` wide (`assets.js:217`). At fractional scales such as iPhone px≈2.18 or SE 1.34, neighbouring tiles overlap by one device pixel, and the semi-transparent cloud edge is drawn twice.
   - **Fix:** step the tiles in whole device pixels using the sprite's own width. Replace the inner `for (let x = …)` loop at `render.js:279` with:
     ```js
     const cs = VC.Assets.sprite(n + '_clouds', W, 220);
     if (cs) {
       const sw = cs.width, g = this.ctx, x0 = off - W * Math.ceil(Math.max(0, this.SX) / W + 1);
       let xd = this._ox + Math.round(x0 * this.px); const yd = this._oy + Math.round(y * this.px), end = this._ox + Math.round((this.VW - this.SX) * this.px);
       g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a;
       for (; xd < end; xd += sw) g.drawImage(cs, xd, yd);
       g.globalAlpha = 1; g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
     }
     ```
   - The desktop build has the same seam because the strip scrolls through x=0, so this fixes both.

2. **Menu text is far too small on phones.** `--u` is about 6 px in portrait and 3.9 px in landscape, so the `calc(var(--u)*k)` sizes shrink to 7–10 CSS px on iPhone. Apple's minimum is 11 pt.

   Measured on iPhone portrait (SE is 4% smaller):

   | Element | Rule | Size on iPhone | Where it shows |
   |---|---|---|---|
   | Slot "Original" tag | `.slot .tag` (style.css:136) | 7.3 px | `iphone-p_custom`, `se-p_custom` |
   | "Whole picture" / "Round" buttons | `.slot .shape button` (style.css:141) | 7.3 px, buttons 13 px tall | `iphone-p_custom`, `se-p_custom` |
   | "Choose…" / "Reset" | `.btn-tiny` (style.css:51) | 8.5 px | Change Pictures, Settings › Best score |
   | How to Play body text | `.how p` (style.css:106) | 9.4 px | `iphone-p_how`; 10.8 px in `iphone-l_how` |
   | Difficulty segmented buttons | `.seg button` (style.css:120) | 9.7 px | `iphone-p_settings` |
   | Slot titles | `.slot h3` (style.css:154) | 9.7 px | `iphone-p_custom` |

   **Fix:** add px floors inside the existing `@media (pointer:coarse)` block at `style.css:224-228`:
   ```css
   .how p{font-size:max(14px,calc(var(--u)*1.55))}
   .small{font-size:max(13px,calc(var(--u)*1.55))}
   .btn-tiny,.slot .btn{font-size:max(14px,calc(var(--u)*1.4))}
   .seg button{font-size:max(14px,calc(var(--u)*1.6));min-width:56px}
   .slot h3{font-size:max(13px,calc(var(--u)*1.6))}
   .slot .tag{font-size:max(11px,calc(var(--u)*1.2))}
   .slot .shape button{font-size:max(12px,calc(var(--u)*1.2));min-height:32px}
   .set{font-size:max(15px,calc(var(--u)*2))}
   ```
   - Check after the change: in portrait the How-to grid is one column (style.css:217), so the extra height fits; the panel scrolls if needed (`max-height` + `overflow:auto`).
   - Check after the change: in the `max-height:430px` block (style.css:230), the floors make Change Pictures on iPhone landscape about 20 px taller. Re-check `iphone-l_custom`, and if it overflows, hide `.slot .shape` there.

## P2 — should fix

3. **The night sky extension shows vertical bands and a step at the join.** Seen in `ipad-l_zone3`: lighter columns at about x 240–330 and 790–860 CSS, running y 0–127 logical and stopping in a horizontal edge where the art begins. Phone portrait (`iphone-p_zone3`) is milder.
   - **Cause:** `render.js:247-250` averages the art's top rows into a 16×1 strip and stretches it. In the crater zone those rows contain stars and clouds, so some of the 16 samples are lighter.
   - **Fix:** average down to one colour. At `render.js:247` use `t.width = 1`. At `render.js:250` use `g.drawImage(t, 0, 0, 1, 1, 0, 0, c.width, dy + 1)`.
   - Optional: for z===3, add a soft darkening gradient so the top reads deeper: after line 250, `const gr=g.createLinearGradient(0,0,0,dy); gr.addColorStop(0,'rgba(8,10,40,.35)'); gr.addColorStop(1,'rgba(8,10,40,0)'); g.fillStyle=gr; g.fillRect(0,0,c.width,dy);`.

4. **The tall portrait sky looks empty.** In `iphone-p_zone0/1` and `se-p_zone2`, the top 55% of the screen (y≈90–480 CSS) has two faint cloud strips and nothing else, so the eye drops straight to the volcano band.
   - **Fix:** in `render.js:276-278`, use spacing `const y = 20 - 230 * k;` instead of 330, and alpha `Math.max(0.5, 0.85 - 0.12 * k)` instead of `Math.max(0.35, 0.8 - 0.2 * k)`.
   - **Fix:** in `skyExt` (`render.js:251`), add a few big soft daytime cloud puffs as well as night stars. For z≠3, draw 3–4 white ellipses at alpha 0.25 in the band `dy*0.15..dy*0.7` using the seeded rnd.
   - This also gives more depth when a coin flies high.

5. **Small canvas HUD labels on phones.** Seen in `iphone-p_zone0` and `iphone-l_zone0`. "combo N" and "×N" are 16–17 logical px (≈11–12 CSS px), and the zone name under the pouch is 16 logical px (≈11 CSS px).
   - **Fix:** in `hud()`, use `const k = this.cssScale < 0.8 ? 1.2 : 1;` and multiply:
     - `render.js:604`: combo size 16→`16*k`
     - `render.js:605`: ×m 17→`17*k`
     - `render.js:619`: zone name 16→`16*k`
     - `render.js:601-603`: widen the pill from `-80,62,160,22` to `-90,62,180,24*k`
   - On the night zone the combo pill (`rgba(40,25,70,.55)`, `render.js:601`) almost disappears (`iphone-p_zone3`, `ipad-l_zone3`). Add a 1.5 px `rgba(255,255,255,.35)` stroke to the pill.

6. **A custom background in portrait is cropped to a narrow middle slice.** In `iphone-p_custom_bg_play`, the 4:3 test photo is cover-scaled to the whole 560×1214 canvas (2.6× zoom), so only "MILY PH" of "FAMILY PHOTO" shows. The main subject also ends up behind the volcano.
   - **Fix** (`render.js:221-224`): in portrait (`this.VH > this.VW`), cover-fit the photo to the sky area instead of the full canvas, top-aligned, with the zone sky drawn first underneath:
     ```js
     const areaH = this.VH > this.VW ? this.SY + 330 : VH;
     k = Math.max(VW / c.width, areaH / c.height); y = this.VH > this.VW ? 0 : (VH - dh) / 2;
     ```
     Then fade the lower 80 px into the sky with a gradient mask.

7. **Phone-sized items.** On iPhone, copper coins are about 20 CSS px, gold about 24 px and rocks about 24 px (`iphone-p_zone1`, `iphone-l_zone0`). They read, but they are small for a family or kids' game, especially edge-on while spinning (`se-p_zone2`).
   - **Fix (visual only, hitboxes unchanged):** in `itemSprite()` (`render.js:424-433`), when `this.cssScale < 0.8`, multiply `s`/`ROCK` by 1.2.
   - **Also:** raise the coin spin minimum from 0.14 to 0.3 (`render.js:442`) so the edge-on coin stays visible.

## P3 — polish

8. **White focus ring on the first button of every screen on touch** (Play, Resume, OK, Choose…, Reset). It looks like a stuck "selected" state. Seen in `iphone-p_title`, `iphone-p_pause`, `iphone-p_how`, `iphone-p_custom` and `se-p_custom`. Fix at `style.css:48`: add `body.touch .btn:focus-visible{outline:none}`. Keyboard users keep the ring on desktop.

9. **"Move Puff : hold your finger…" has a stray space before the colon** (`iphone-p_how`, `iphone-l_how`). Fix at `index.html:89`: move the space into the kb-only span, `<b>Move</b> Puff<span class="kb-only"> with …</span><span class="touch-only">: hold …</span>`.

10. **The Pause panel overlaps the combo pill on iPhone landscape** (`iphone-l_pause`, y≈42 CSS). Fix: hide the canvas HUD while paused. At `render.js:370`, use `mode === 'playing'` only. Or, at `style.css:197`, give the paused `.panel` a smaller `padding-top` in `@media (max-height:430px)`.

11. **iPad portrait only shows the middle 560 px of the island** (`ipad-p_zone0`). Puff is about 140 CSS px, which is huge, the palms are cut off and the shore feels cramped compared with the desktop. Fix at `render.js:58`: `VW = ar >= 0.6 ? 720 : 560;`. This keeps phones at 560 and gives iPad 720×1036 with Puff at about 110 CSS px. The 💧 sky placement already adapts.

12. **The zone banner sits over the crater in portrait** (`iphone-p_crossfade`, scene y 104–214) while the sky above is empty. Fix in `drawBanner()` (`render.js:626`): when `this.SY >= 150`, translate by `-Math.min(this.SY * 0.5, 260)` in y so the banner shows in the sky and the volcano stays visible.

13. **On the title screen in landscape, the menu hides Puff** (`iphone-l_title`, `ipad-l_title`: the buttons sit right over Puff). Fix: on the title, steer the title bot or Puff away from x 380–580, or set `.title-wrap{margin-top:calc(var(--u)*-8)}` in landscape so the menu clears the shore.

14. **The home-screen icon is a badge inside a badge** (`icons.png`). The artwork is a circle with a white rim inside the rounded square, so about 20% of the icon is just teal and rim, and at 40–60 px Puff is tiny. Fix in `tools/render_mobile_icons.js`: render the scene full-bleed (drop the circular clip and white ring), scale the art about 1.25×, and keep Puff + basket inside the central 80% (the maskable safe zone).
   - Also give the maskable entry its own padded file (`icon-maskable-512.png`) instead of reusing `icon-512.png` (`manifest.webmanifest`).
