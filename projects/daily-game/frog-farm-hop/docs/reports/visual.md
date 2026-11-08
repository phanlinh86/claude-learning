# Clover's Farm Hop — visual QA (art director), 2026-11-08

Capture: `node tests/visual/capture.js [only=screens,zones,fade,events,motion,cvd,custom]` → `tests/out/visual/`
(4 viewports: `desk` 1280×720, `ipad` 820×1180 @2x touch, `phone` 390×844 @3x touch, `phoneL` 844×390 @3x touch; the
touch devices get simulated notch / home-indicator safe areas, drawn as a magenta frame). Every screen, every weather
level (start with farmyard / mid / wind warning / gust), crossfade + banner sheets, event sheets (fall + rescue, spring,
puff, firefly pickups, lantern full), motion sheets (bounce, wall, steer, rescue), colour-blind sheets (normal /
deuteranopia / protanopia / grey) per level, and two custom-picture runs (opaque photo hero + transparent cut-out
firefly + photo / very busy backgrounds; then cut-out hero + photo firefly). No console errors in any run.

**What already works well:** the bounce reads beautifully (4-frame squash 0.91→0.49, stretch on take-off, crouch →
up → fall poses, `sheet_*_bounce`); all menus fit at all 4 sizes with no scrolling; safe areas are respected by the HUD,
hint pills and panels; the level crossfade is smooth (1.4 s); hearts read as full/empty by shape in deuteranopia /
protanopia; custom photo hero as a round sticker with little legs is charming and squashes correctly.

---

## P1 — fix before kids play

### P1-1 Floating texts ("+10", "BOING!", "Lantern full!") sit on top of Clover's face
Screens: `phone_play.png`, `phoneL_play.png`, `ipad_play.png`, `sheet_desk_fireflies.png` (rows 2–4: 3–4 stacked "+10"
cover her head for ~0.8 s), `sheet_desk_spring.png` (frame t10.33: "BOING!" across her body), `sheet_desk_lantern.png`
(frames t12.78–t12.90: the big lantern text crosses her head).
Why: texts are spawned at the catch / platform point (which *is* where Clover is) and are screen-fixed, so as the camera
follows her up they ride along on her. A firefly arc gives 3–5 catches in a row → a pile of "+10" on her face.
Files: `game/js/render.js:338` (firefly +10), `:324` (BOING!), `:326` (rescue), `:342` (lantern), `:420-426` (drawJuice).
Fix:
- `render.js:338` spawn the "+10" beside her, not on her, and smaller:
  `const side = (this._txtOff % 2 ? 1 : -1); this.texts.push({ x: x + side * 1.1 * u, y: y - 0.2 * u, s: '+10', t: 0, col: '#fff27a', small: true, off: this._txtOff });`
  and in `drawJuice` (`:422`) use `fs = t.big ? 28 : t.small ? 18 : 21` and drop the `(t.off || 0) * 16` vertical stack
  (the side offset already separates them).
- `render.js:324` BOING!: `y: y + 0.5 * u` (below the platform top, under her feet) instead of `y - u * 1.6`.
- `render.js:342` lantern text: `y: this.VH * (this.portrait ? 0.22 : 0.26)`.
- In `drawJuice` fade any text whose box overlaps the hero: before drawing, if `this._heroScr && Math.abs(t.x - this._heroScr.x) < 0.9 * this.unit && Math.abs(y - this._heroScr.y) < 0.9 * this.unit` then `g.globalAlpha *= 0.35`.

### P1-2 The level banner hides Clover at the top of her bounce for 3 s at every level change
Screens: `sheet_desk_fade_01.png` (frames t7.07, t9.07, t9.32: Clover and her fireflies behind the opaque banner),
`sheet_phone_fade_23.png`. Landscape: banner covers y 72–144 and Clover's apex reaches y ≈ 92–155.
File: `game/js/render.js:496-511` (`drawBanner`), banner fill `#fffdf5` at full alpha (`:503`).
Fix: fade the banner when Clover is under it, and move it a little higher in landscape:
```js
const topY = this.portrait ? this.ins.top + 190 : this.ins.top + 58;            // was +72
...
const hs = this._heroScr, under = hs && hs.y + 0.7 * this.unit > y && hs.y - 0.9 * this.unit < y + bh;
g.globalAlpha = a * (under ? 0.3 : 0.94);
```
Apply the same `under` test to the wind label (`:489-493`) and the vane disc (`:480-482`, alpha 0.85 → 0.3 when under).

## P2 — clearly worth fixing

### P2-1 Fireflies vanish over hay bales and on the pale lower sky
Screens: `zoom_phone_fireflies_on_hay.png`, `desk_play.png` (x 460–560, y 180–290), `phone_start.png`,
`sheet_desk_cvd_z0.png` (grey + both CVD panels: the glow merges with the near-white sky bottom `#e8f7ff`).
Why: the halo is drawn with `globalCompositeOperation = 'lighter'` (`render.js:261-263`), which adds nothing on gold hay
or a near-white sky; the amber abdomen `#ffb627` is the same hue/lightness as hay `#e8b84a`. The world also places arc
fireflies inside the body of the next bale (the hay sprite hangs ~1.28 u below its top surface).
Fix (`render.js:259-268`): draw a dark-edged warm disc *under* the sprite with normal compositing, keep the additive halo:
```js
g.globalAlpha = 0.55; g.fillStyle = 'rgba(90,61,92,0.35)';            // plum backing (DESIGN body colour)
g.beginPath(); g.arc(x, y, s * 0.42, 0, TAU); g.fill();
g.globalAlpha = 1; g.lineWidth = 2; g.strokeStyle = 'rgba(255,242,122,0.9)';
g.beginPath(); g.arc(x, y, s * 0.42, 0, TAU); g.stroke();             // bright rim reads on gold, grey and lilac
```
and raise `FLY_W` from `0.75` to `0.85` (`render.js:31`). Optional world-side: in `world.js:291` add `+ 0.3` to the arc
lift (`1.1` → `1.4`) so arcs clear the bale bodies.

### P2-2 Platforms visually overlap each other (bales into bales, a cart sitting on a puff cloud)
Screens: `phone_start.png` (bales at y≈750–940 overlapping), `phone_start_hint.png`, `sheet_phone_fade_23.png` (cart on a
puff, every frame), `desk_title.png`. For a young child an overlapped pile is not readable as "two places to land".
Files: `game/js/world.js:271` (side platform only checks horizontal distance to the *current* row, ±0.35 u jitter),
`game/js/render.js:221` (hay drawn `H = W·96/192` → 1.5 u tall on Easy, but path rows are only 1.3–2.0 u apart).
Fix: in `world.js:271` also reject a side platform if any platform in `this.platforms` with `|q.y − sy| < 1.5` has
`|q.x − sx| < (q.w + sw)/2 + 0.3`. Render-side, draw the hay bale 20 % flatter:
`const H = W * B[1] / B[0] * (p.kind === 'hay' ? 0.8 : 1);` (`render.js:221`; the anchor `B[3]/B[1]` stays, so the landing
line does not move).

### P2-3 Clover and fireflies are tiny on iPhone portrait
Screens: `phone_start.png`, `phone_z2_warn.png`, `phone_play.png` — Clover ≈ 41 pt tall, fireflies ≈ 22 pt, on a
screen showing ~28 u of height. A 4–6-year-old loses her among 15 bales.
File: `game/js/render.js:31` (`HERO_W`, `FLY_W`), `:283`, `:259`.
Fix: scale only the drawing in portrait (hit boxes unchanged):
`const S = HERO_W * u * (this.portrait ? 1.25 : 1);` (`:283`) and `const s = FLY_W * this.unit * (this.portrait ? 1.2 : 1) * …` (`:259`).

### P2-4 Wind warning chevrons are almost invisible on the rain and snow skies; label says "blowing" before it blows
Screens: `desk_z1_warn.png`, `desk_z3_warn.png` (grey-white chevrons on a grey-white sky), `phone_z2_warn.png`.
File: `game/js/render.js:484-488`, `:490`.
Fix: chevrons `fillStyle = warn ? 'rgba(255,210,63,' + (0.6 + 0.4 * blink) + ')' : '#ffd23f'`,
`strokeStyle = 'rgba(47,59,82,.85)'`, `lineWidth = 3`. Label during `warn`: `'Wind coming →'` / `'← Wind coming'`;
keep "Wind blowing" for `blow`.

### P2-5 The title screen shows "+10" pop-ups through the logo and the buttons
Screens: `desk_title.png` (three "+10" over "Clover's"), `phone_title.png` (over "Best score"), `phoneL_title.png`.
File: `game/js/render.js:313` (`onEvents` runs for the title bot demo too).
Fix: at the top of `onEvents`: `const demo = FH.Game && FH.Game.mode === 'title';` and skip every `this.texts.push(...)`
and `this.flyers.push(...)` when `demo`. Also give the landscape title a light veil like portrait already has:
`#scrTitle{background:rgba(40,30,70,.18)}` (style.css, next to `:304`).

### P2-6 Game over on iPhone portrait: stats wrap mid-phrase ("Falls:" / "1")
Screen: `phone_over.png`. File: `game/css/style.css:81` (`.over-body` is a row), `:100` (`.stats`).
Fix: `@media (orientation:portrait){ .over-body{flex-direction:column;gap:calc(var(--u)*1.2)} .scores{min-width:0;width:100%} .medal{width:calc(var(--u)*8);height:calc(var(--u)*8)} }`
and render each stat as its own non-breaking chip in `ui.js` (`white-space:nowrap` per item).

## P3 — polish

1. **Rescue bubble barely visible** (`sheet_desk_rescue.png`, `sheet_desk_fall_rescue.png`): white 3 px ring at 0.6
   alpha on a pale sky. `render.js:304`: `g.globalAlpha = 0.85 * k; g.strokeStyle = '#3b82c4'; g.lineWidth = 4;
   g.fillStyle = 'rgba(160,215,255,0.35)'`. (Note: "Boing! Up you go!" at `:326` almost never shows because Clover is
   thrown up *through* the mat, so there is no `bounce` on it; push that text on the `rescue` event instead, at
   `y: this.VH - 3.2 * u`.)
2. **Jar number = total fireflies, not lantern progress** (`desk_play.png`: "14" while the jar shows ~70 %). Kids read
   the number as "how full". `render.js:463`: show `w.lantern + '/' + lanternSize` in the 22 px slot, move the total into
   the right side with the points, or drop it.
3. **Clover overlaps the fence post at the wall** (`sheet_desk_wall.png`, last 8 frames): post half-width 0.31 u, Clover
   drawn 0.68 u wide each side, clamp at 0.55 u. Either draw the posts after the hero, or narrow the visual clamp: in
   `drawHero` offset `x` by `clamp(0.9 - h.x, 0, 0.35) * u` at the left and the mirror at the right.
4. **How to Play icons touch the text** (`desk_how.png`, firefly+jar and puff+spring cards): `.how-ico{min-width:calc(var(--u)*10);flex:none}` (style.css, after `:338`).
5. **Best score digits not aligned with Score when NEW! shows** (`desk_over.png`): `.new-best{position:absolute!important;right:calc(var(--u)*-1);top:calc(var(--u)*-2.2)!important}` and keep `.sc{position:relative}`.
6. **Busy custom backgrounds swallow the column** (`desk_custom_wind.png` with a confetti photo): add a calm veil over
   custom skies inside the column: in `drawScene` (`render.js:176`) after the sky blit, when `this._custom(b)`:
   `g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(colX·px, 0, colW·px, H)`.
7. **Custom firefly drawn smaller than the default one** (`sheet_desk_custom_bounce.png`): `render.js:267` `s * 0.8` → `s * 1.0`.
8. **Start-of-run hint pills sit at Clover's height on iPhone portrait** (`phone_start_hint.png`): `render.js:516`
   portrait offset `70` → `24` (just above the home indicator, over the grass, never beside her).
9. **Change Pictures on iPhone portrait**: "Sunny Mea…" truncated and the character cards stack 4 buttons tall
   (`phone_custom.png`). Portrait: first row `.slot:nth-child(-n+3){grid-column:span 3!important}` on a 6-col grid →
   2 + 1 + 2 + 2 layout, or shorten the slot titles to "Sunny"/"Rainy"/"Windy"/"Snowy" on narrow screens.
10. Non-visual, found while capturing: `FH.debug.getState()` throws (`main.js:332` reads `Game.renderer.fx.length`;
    the renderer has no `fx`). Use `st.fx = (Game.renderer.texts || []).length;`.

## Colour-blind summary (`sheet_*_cvd_z0..3.png`)
- Fireflies vs sky: OK in all four levels in deuteranopia/protanopia (the plum head + yellow stays a light/dark pair);
  weak in greyscale on the pale lower sky → P2-1 rim fixes it.
- Clover vs hay: in both CVD simulations Clover turns olive-yellow like the hay; she still reads thanks to the dark
  outline and hat, so no change needed beyond P2-1/P2-3.
- Hearts full/empty: shape differs (filled vs outline) → safe. Level progress bars rely on colour only but are decorative.
- HUD pills (`rgba(255,253,245,.82)` + `#2f3b52` ink) are legible over all four skies and over platforms.
