# Family Flappy: visual and art-direction QA report (v1)

Tester: visual QA agent. Build: `game/` as served on 2026-10-28, Chromium (Playwright), `?mute=1&seed=42`.
Screenshots and contact sheets are in `tests/out/visual/`. Capture scripts are in `tests/visual/`:

| Script | What it captures |
|---|---|
| `menus.js` | Every panel at 1280×720, 1920×1080 and 800×600 (`menu_*`, `sheet_menus_*`) |
| `seasons.js` | Season banner, mid-crossfade and steady state for each season (`season_*`, `sheet_transition_*`), plus `debug_hitboxes.png` |
| `motion.js` + `motion_sheets.py` | 60 fps frame bursts with the game clock frozen and stepped by hand (`frames/`, `motion_*`) |
| `custom.js` | Uploads a photo, a cookie PNG, a dog photo and a landscape through `#filePick` (`custom_*`, `motion_custom_bird_*`) |
| `proposed_css.js` | Injects the CSS proposed below to check that it fits (`proposed_*`); no game files are changed |

Caveat: this Linux box has no Segoe UI Black or Segoe UI Emoji, so it falls back to Inter and Noto. I judged layout only.

---

## P1: clearly broken or ugly

### P1-1 "Change Pictures" overflows. The Done button is hidden and the 4th column is clipped
*Shots:* `menu_custom_1280x720.png`, `menu_custom_1920x1080.png`, `custom_panel_after_upload.png`. The fix is previewed in `proposed_custom_1280x720.png`.

Measured panel size as clientHeight / scrollHeight (and width the same way): 665/908 at 1280×720, 997/1351 at 1920×1080 and 710/971 at 1366×768. At every 16:9 size the player has to scroll to reach **Done** or **Reset all**. The grid is also about 50 px wider than the panel, so the "Spring background" card is cut off at the right edge. That happens because `1fr` columns default to a `min-width:auto` set by the widest content, here the "Whole picture | Round" row and the two-line titles.

*Code:* `game/css/style.css:126` (grid), `:130` (h3), `:131` (preview aspect ratio 16/10), `game/index.html:117` (two-line description), `game/js/ui.js:122` (" background" makes titles wrap).

*Fix.* I verified this at 1280×720 and 800×600: scrollHeight is now equal to clientHeight and there is no horizontal overflow.
```css
.slot-grid{grid-template-columns:repeat(12,minmax(0,1fr));gap:calc(var(--u)*1)}
.slot{grid-column:span 4;padding:calc(var(--u)*.8);gap:calc(var(--u)*.45)}   /* bird, treat, turtle: 3 per row */
.slot:nth-child(n+4){grid-column:span 3}                                       /* 4 season backgrounds on row 2 */
.slot:nth-child(n+4) .tag{display:none}
.slot h3{font-size:calc(var(--u)*1.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.slot .prev{aspect-ratio:auto;height:calc(var(--u)*7.5)}
.slot .shape button{white-space:nowrap}
#scrCustom .panel{padding-top:calc(var(--u)*1.6);padding-bottom:calc(var(--u)*1.6)}
#scrCustom .panel h2{margin-bottom:calc(var(--u)*.2);font-size:calc(var(--u)*3.4)}
#scrCustom .small{margin:calc(var(--u)*.4) 0}
#scrCustom .menu{margin-top:calc(var(--u)*.8)}
```
- `ui.js:122`: `const title = s.kind === 'bg' ? s.name + ' sky' : s.name;`
- `index.html:117`: shorten the text to one line: `Use a pet, a family photo or a drawing! Drag a picture onto a card or click <b>Choose…</b>`. The "saved on this computer" note can go into the toast after saving.

### P1-2 In-game HUD buttons (pause and sound) sit outside the game when the window is not 16:9
*Shot:* `sheet_menus_800x600.png`, bottom row. The two round buttons appear in the black letterbox bar above the canvas.

*Code:* `game/css/style.css:72` positions `#hud` against the window, not the canvas.

*Fix.* Anchor it to the canvas in `Renderer.resize()` (`game/js/render.js:36-47`):
```js
const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2, hud = document.getElementById('hud');
if (hud) { hud.style.top = (oy + 14 * s) + 'px'; hud.style.right = (ox + 14 * s) + 'px'; }
```
Remove `top` and `right` from `style.css:72`. The toast at `style.css:145` (`bottom:4u`) has the same issue; anchor it with `oy` the same way.

### P1-3 "Get Ready" prompt covers the bird
*Shot:* `menu_ready_1280x720.png`. The bird hovers at (260, 230) logical. The "Click, tap or press SPACE" pill spans x 270–690 at y 206–254, then pulses to ±6 %, so it sits right on top of the bird. The tap ripple is cut by the pill. This is the first thing a child sees.

*Code:* `game/js/render.js:470-476`.

*Fix.* Move the two pills under the bird's hover band: `g.translate(W / 2, 320)` (was 230) at :470, the tip `roundRect(W/2-260, 362, 520, 36, 18)` with text at y 380 (was 270/288) at :475-476. Optionally shift "Get Ready!" to y 140. Also draw `readyOverlay()` **before** `drawBird()`, or redraw the bird after it, so the bird is never covered.

---

## P2: noticeably improves polish

### P2-1 Season crossfade ghosts the scene: two sets of hills and trees at half alpha
*Shots:* `sheet_transition_summer.png` (1st tile), `sheet_transition_winter.png`. Each new layer (sky, clouds, far, mid) is drawn at alpha t on top of the old *finished* composite. At t≈0.3 the new opaque sky washes the old trees pale and the new trees appear as faint ghosts, so the frame looks muddy for about 1 s.

*Code:* `game/js/render.js:149-161` and `:208` / `:222`.

*Fix.* Composite the incoming season into an offscreen canvas at full alpha, then blit it once at alpha t:
```js
// in draw(): if (v.t < 1 && v.prev !== v.cur) { this.backdrop(v.prev,1); this.fadeLayer(() => this.backdrop(v.cur,1), v.t); }
fadeLayer(fn, a) { const o = this._off || (this._off = document.createElement('canvas'));
  if (o.width !== this.canvas.width) { o.width = this.canvas.width; o.height = this.canvas.height; }
  const g0 = this.ctx; this.ctx = o.getContext('2d'); this.ctx.setTransform(this.px,0,0,this.px,0,0); fn(); this.ctx = g0;
  g0.save(); g0.setTransform(1,0,0,1,0,0); g0.globalAlpha = a; g0.drawImage(o,0,0); g0.restore(); }
```
For a more "storybook" feel, use a soft left-to-right wipe instead of the alpha fade: draw the new season clipped to `x < easeInOut(t)*(W+200)-100` with a 100 px gradient edge. Either way, raise the duration to 2.2 s → 1.6 s (`render.js:102`).

### P2-2 Score popups and the season banner cover the bird during play
*Shots:* `menu_playing_1280x720.png`, `debug_hitboxes.png`, `motion_hit.png` (tiles 27-41), `motion_custom_bird_round.png` (the "Combo x2!" text sits on the bird for over 12 frames), `sheet_transition_*.png` (banner at y 172-262, where the bird usually flies).
- The popup text is `'+1  Combo x2!'`, which is 300 px wide at 26–30 px and is drawn over the bird. The HUD already shows "Combo x2" under the score (`render.js:448`), so the popup repeats it.
  *Fix:* at `render.js:74-75` set the label to only `'+' + e.points`, with size `combo>=3 ? 34 : 28`. If a combo word is wanted, push a second smaller text (size 18, `#ffe14d`) 24 px lower. Spawn it at `e.y - 30`. Move the `this.texts` loop (`render.js:428-435`) to *before* `drawBird()` (split `drawFx` into `drawFxBack` / `drawTexts`), so the bird always reads on top.
- Banner: `render.js:492-496`. Move it up and make it lighter so it does not block the play band. Use polygon y 96/88 → 160/170 (centre y 128), text at y 128 size 44, icons at y 104. Keep it on screen 1.6 s (change `2.1` → `1.6` at :489 and `2.6` → `2.1` at :103).

### P2-3 Default turtle "slides": only 2 leg frames, slow cadence, no body motion
*Shot:* `motion_turtle_walk.png`. At 15–45 px/s, `walk2` holds for about 20 frames (≈0.35–1 s) while the whole turtle glides with the ground, so it reads as skating. The custom-turtle path already has a bob and rock (`render.js:312-313`); the default path (`render.js:316-320`) has none.

*Fix:* in the default branch, before `drawImage`:
```js
const ph = (t.walkPhase || 0) * TAU;
const bobD = happy ? 0 : -Math.abs(Math.sin(ph * 2)) * 1.6;   // a small lift on each step
g.rotate(happy ? 0 : Math.sin(ph * 2) * 0.025);
g.drawImage(spr, -tw / 2, -th + bobD, tw, th);
```
Feet sit correctly on the grass line (red line in the sheet = `groundY`), and the shadow is right.

### P2-4 Wing poses alias at 10 Hz: "up" and "down" show for only about 1 frame each
*Shots:* `motion_flap_zoom.png`, `motion_flap.png`. Right after a flap, `wingPhase` advances 1/6 per frame at 60 fps. The 4-step mapping up/mid/down/mid means each extreme pose lasts about 1.5 frames, so some beats skip the down-stroke. The flap looks twitchy rather than powerful. There is no jitter between frames: body and eye stay aligned across `bird_up/mid/down`, which is good.

*Code:* `game/js/world.js:54` (`wingFastRate: 10`) and `:135` (`wingFrame`).

*Fix:* `wingFastRate: 7` so each pose holds ≥2 frames. Bias `wingFrame` toward the power stroke: `p < 0.2 ? 'up' : p < 0.4 ? 'mid' : p < 0.75 ? 'down' : 'mid'`.

### P2-5 Death pose: bird ends nose-down with its beak buried in the dirt
*Shot:* `motion_death.png` tiles 10-34. At death, `y = groundY - radius = 448` and the angle eases to `tiltDown` 70°. The 78×65 sprite then reaches about 40 px below centre, into the soil strip.

*Code:* `game/js/world.js:497-498`.

*Fix:* when dead, ease to a "plop on the belly" pose: `b.angle = approach(b.angle, 0.45, 8, h)` (≈26°). Optionally add a tiny bounce: on the dead event set `b.vy = -90` and let gravity land it once, clamping to `groundY - radius`. The dizzy stars (`render.js:368-374`) are cute and kid-friendly, so keep them.

### P2-6 A missed treat is almost invisible
*Shot:* `motion_miss.png`. The miss puff is 4 tan dots (`#d8c09a`), 6–12 px, at 0.4 s and alpha 0.7. They vanish against the spring and autumn grass, and the strawberry just fades over about 1 s.

*Code:* `render.js:78` and `:85-91`.

*Fix:* `this.puffs(e.x, e.y + 2, 7, this.vis.cur === 3 ? '#ffffff' : '#c9a777', 0.55, true)` with puff size `9 + Math.random()*8`. Add a little squash to the landed drop for 0.15 s, for example in `drawDrops` when `d.landed && d.life > 0.45`: `g.scale(1.25, 0.75)`.

### P2-7 Custom bird looks like a tilted photo card; the wing hides on the "Round" sticker
*Shots:* `custom_play_fit.png`, `motion_custom_bird_fit.png`, `motion_custom_bird_round.png`.
- An opaque photo uploaded as "Whole picture" (the default) becomes a rotated rectangle. Round looks much better for photos.
  *Fix:* `assets.js:123`. When the slot has no saved shape, pick `'circle'` if the image's four corner pixels are opaque, and `'fit'` if it has transparency. Do this inside `setCustom` after loading: sample a 1×1 canvas at each corner and check alpha.
- With "Round", the white wing over the white sticker border has almost no contrast. Its root (`-cw*0.05`) is inside the face, so the wing covers the cheek.
  *Fix:* `render.js:359-361`. Use roots at `(-cw*0.36, -ch*0.02)` for the back wing and `(-cw*0.30, ch*0.02)` for the front, `len = cw*0.62`. Use wing fill `#ffffff` with stroke `#6f8fb5`, `lineWidth 3`, and give the back wing fill `#dfe8f2`.
- Custom bird tilt: photos at 70° nose-down look like they are falling over. Scale the angle for custom birds: `g.rotate((b.angle||0) * (custom ? 0.55 : 1))` (`render.js:352`).

### P2-8 Custom background pans back and forth, so it fights the "flying forward" feel
*Shot:* `custom_play_fit.png`. `customBg` uses `x = -range*(0.5+0.5*sin(scroll*0.0009))`. About every 29 s of play, the photo reverses and drifts right while the ground scrolls left. The photo also has no depth.

*Code:* `render.js:134-148`.

*Fix:* use a one-way slow pan with mirrored tiling, so it never reverses:
`const off = (scroll * 0.05) % (2*dw); draw at x=-off (normal), x=-off+dw (scale(-1,1) mirrored), x=-off+2*dw (normal)`.
After the custom photo, keep the season's `clouds` layer at alpha 0.6, and optionally `far` at 0.35, so there is moving parallax over a still photo: in `backdrop()` (`:152`), do not `return` right after `customBg`; still call `this.tile(name+'_clouds', …, alpha*0.6)`.

### P2-9 Title screen: menu sits on the ground, "Best score" is low-contrast on the grass, and the tagline is thin on the light sky
*Shots:* `menu_title_1280x720.png` and `proposed_title_1280x720.png` (with the fix).

*Code:* `style.css:58-68`.

*Fix:*
```css
.title-icon{width:calc(var(--u)*9);height:calc(var(--u)*9)}
.title-wrap{margin-top:calc(var(--u)*-4)}
.best-line{display:inline-block;background:rgba(40,60,90,.55);padding:calc(var(--u)*.4) calc(var(--u)*1.6);border-radius:99px;text-shadow:none}
.tagline{font-weight:700;text-shadow:0 2px 0 #3a5a7a,0 0 calc(var(--u)*.6) #3a5a7a,0 0 calc(var(--u)*1.6) rgba(30,50,80,.6)}
```
Note on `proposed_title_*`: −7u, as tried there, is too much because the icon touches the top edge. Use −4u.

### P2-10 How to Play: emoji stacks wrap vertically and don't match the game art
*Shot:* `menu_how_1280x720.png`. `⌨️🖱️` and `🌸☀️🍂❄️` wrap into 2- and 4-high columns because `min-width:7u` is narrower than the emoji run (`style.css:105`). Emoji also look different from the game's own flat SVG style, and on Windows 11 they become Segoe Fluent 3D emoji.

*Fix:* replace the emoji with the game's own sprites (`assets/default/bird_mid.svg`, `drop.svg`, `turtle_walk1.svg`, and a 2×2 of `particles/blossom|butterfly_a|leaf_orange|snowflake.svg`) as `<img>`, sized `width:calc(var(--u)*6)`. Use `.how-ico{display:grid;grid-template-columns:repeat(2,auto);gap:2px;justify-content:center}` for the season quad (`index.html:79-82`).

---

## P3: nice-to-have

1. **Edge-on leaves look like scratches.** Autumn back-layer leaves at |flipX| ≈ 0.08 render as 1-px slivers (`season_autumn_after.png`, top-centre). In `render.js:285`, raise the floor from `0.08` to `0.22`.
2. **Speed lines cross the trees and hills.** These white strokes over the mid layer look like scratches (`season_autumn_after.png`, y≈450). In `render.js:30` and `:118`, keep the line y in `40 + Math.random()*260` (sky band only). Also fade each line in and out over its length with a gradient stroke.
3. **Hearts fade to brown on dark backgrounds.** Pink at partial alpha over dark green photo backgrounds looks muddy (`custom_play_fit.png`). Fade hearts with scale (shrink to 0.4) instead of alpha in `render.js:408-409`: `s *= k > .7 ? 1 - (k - .7) / .3 * .6 : 1`, and keep `globalAlpha` ≥ 0.85 until k > 0.9.
4. **Heart burst forms a straight row.** Seven hearts at a ±0.96 rad fan with similar speed read as a "necklace" in the first frames (`motion_hit.png` tiles 18-20). In `render.js:67-68`, use `a = -PI/2 + (Math.random()-.5)*1.9` and `sp = 90 + Math.random()*170`, and stagger spawn with `life: -i*0.025`.
5. **Glyph icons in buttons.** `⌂ Main Menu` / `⌂ Menu` / `↻` / `✖` / `✔` use symbol-font glyphs that render tiny or thin, and are font-dependent if Segoe UI Symbol is missing (`menu_pause_1280x720.png`) (`index.html:29-49,67-68,109,121`). Use small inline SVGs like the HUD icons (`index.html:16-18`).
6. **Medal is a plain disc.** Add a star in the middle and a ribbon (`style.css:84-92`): `.medal::before{content:"★";position:absolute;inset:0;display:grid;place-items:center;font-size:calc(var(--u)*5);color:rgba(255,255,255,.75);z-index:1}` plus two ribbon tails using `clip-path` above the disc.
7. **HUD pause and sound buttons stay visible behind the Pause dim.** Hide `#hud` while `scrPause` is open (`main.js` `pause()`/`resume()`: `FF.UI.setHud(false/true)`).
8. **Season pill has no lap indicator.** After lap 1, "Spring" at score 42 gives no sense of progress. Append `· Lap 2` in `render.js:459` when `w.seasonIndex >= 4`.
9. **Colour-blind check** (`cvd_deuteranopia.png`, simulated deuteranopia). Score, pill text, banner and hit/miss feedback all stay readable because they use shape and outline. The turtle becomes olive and is closest to the autumn and spring hills and ground; only its dark outline separates it. Consider a slightly stronger turtle ground shadow, `0.22 → 0.32` alpha (`render.js:300`). The Summer and Autumn pill colours (`#ffb52e` / `#ff7a33`) are near-identical under deuteranopia, but the icons and names carry the meaning, so this is OK.
10. **Summer dandelion seeds read as tiny grey umbrellas at 1×** (`zoom_particles_summer_autumn.png`). Make `seed.svg` fluff whiter and less stem-heavy, or reduce the summer seed count from 14+6 to 8+4 (`weather.js` summer emitters).
11. **Font fallback.** Every canvas and CSS font stack ends in system-ui and sans-serif, so nothing breaks if Segoe UI Black is missing. Labels in `.set` and `.sc span` rely on Segoe UI **Black** for weight. Add `font-weight:800` to `.set` (`style.css:110`) and `.sc span` (`style.css:96`) so they stay chunky on fallback fonts.

---

## What already looks great
- **Season art.** All four backgrounds are cohesive, flat-cartoon and clearly seasonal: cherry trees and fence; sunflowers, lake and sailboat; haystacks and pumpkins; snowy pines and a cosy cabin with a smoking chimney. The tileable ground strips have no seams in the parallax sheets (`motion_parallax_*`).
- **Parallax depth.** Clouds, far, mid and ground move at clearly different rates. Snow has 3 depth layers (tiny far dots, mid flakes, big near flakes) and reads as real depth (`motion_parallax_winter.png`). Summer sun rays (additive, slowly swaying) are lovely.
- **Characters.** Bird, strawberry and turtle are crisp, friendly and well outlined. They stand out against every season, including winter white, and they are kid-friendly. Bird wing frames share the same body and eye position, so there is no jitter. Tilt eases nicely up on a flap and noses down in a fall (`motion_fall.png`). The flap air-puffs and the stretch on flap add life.
- **Hit feedback.** The happy turtle face (closed eyes, blush), heart burst, sparkles, ring and score-pop bounce feel rewarding (`motion_hit.png`).
- **Ground contact.** Turtle feet sit exactly on `groundY`, the hit box matches the shell (`debug_hitboxes.png`), and shadows scale with height.
- **HUD.** The big white score with a brown outline is legible on all four skies. The season pill with icon, name and progress is clear. Particles are drawn under the HUD, so they never hide the score.
- **Menus.** Warm cream panels, chunky 3-D buttons and a consistent orange headline colour match the game's palette. Settings toggles and segmented controls are clear and big enough for kids. The Game Over panel with medal, score and best, NEW! tag and stats is well structured.
- **Custom pictures pipeline.** Uploads work through the file picker, previews update, "★ Your picture" tags show, and the Round sticker with a white border looks good for faces. Procedural wings still say "flying" on the round sticker once the contrast fix in P2-7 is applied.
- No page errors in any run.
