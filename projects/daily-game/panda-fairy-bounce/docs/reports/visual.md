# Visual QA: Mochi's Fairy Bounce (2026-11-10)

**How it was captured:** `node tests/visual/capture.js` (you can run only some parts, e.g. `ONLY=bursts,hoot,cb`). The output is in `tests/out/visual/`: 112 PNGs, no console or page errors.
- **Screens:** title, how to play, settings, change pictures, play + banner, pause and game over, each at 4 sizes:
  - `desk` 1280×720
  - `ipad` 1024×768, DPR 2, touch
  - `phone` 844×390, DPR 3, touch
  - `port` 390×844, DPR 3, touch
- **Seasons:** all 4 in play at desk, phone and iPad. Also crossfade frames (`desk_xfade*`), banners (`*_banner`) and the clear celebration (`*_clear_a/b/c`).
- **Slow-motion contact sheets** (game at 0.1× speed, one frame every ~50 ms of game time): `sheet_cap_squash`, `sheet_block_break`, `sheet_star_catch`, `sheet_pillow_sleepy`, `sheet_hoot_hit`, `sheet_hoot_tickle`, `sheet_vine_save`, `sheet_ball_lost`.
- **HUD crops per season:** `{desk,phone,port}_hud0..3`, with a 5-digit score and 5 hearts.
- **Hoot at both ends of his drift band:** `{desk,phone,ipad}_hoot_x2 / _x14`, with a 6-digit score.
- **Colour blindness:** `cb_bricks.png` (normal, deuteranopia matrix, greyscale) and `cb_season0..3_{norm,deut,grey}`.
- **Custom pictures:** generated test images (an opaque "pet photo" for Mochi, a cut-out ball, a very tall star, a busy background on spring and winter): `{desk,phone}_custom_screen/_play/_winter`.
- **"Turn sideways" card:** `port_play_banner.png`. Upright play after dismissing it: `port_play_upright.png` and `port_play.png`.

## What passes
- **Colour-blind safety of the block types: PASS.** Bud, tough, cracked and star blocks differ in shape as well as colour (rounded pill / square riveted plate / plate with cracks / gold frame with a star), so they stay clear in deuteranopia and greyscale (`cb_bricks.png`). The crack lines on the cracked block are the weakest cue, but still readable.
- **HUD readability on all 4 seasons: PASS** (`*_hud0..3`). The pale pill (`pal.bar`, alpha 0.86) with plum text works on the night-time winter sky too.
- **Juice that reads well:**
  - Block chips plus "+10" (`sheet_block_break`)
  - Pillow → sleepy face with "z" particles and a purple haze (`sheet_pillow_sleepy`)
  - Mochi's cheer face on the star catch (`sheet_pillow_sleepy`, frames +192…)
  - Hoot's giggle frame (`sheet_hoot_hit`)
  - "Oops!" with shake (`sheet_ball_lost`)
  - Vine save: ring and sparkles (`sheet_vine_save`)
  - Cap squash, visible at +208 ms (`sheet_cap_squash`)
- **Menus at all 4 sizes:** nothing is cut off, every button is at least 44 px, and Settings and How to Play fit the 390 px-tall phone.
- **Rotate card:** clear and centred, with a big "Play upright anyway" button.

---

## P1: fix before release

### P1-1. Hoot hides under the HUD score pill (left) and under the Pause button (right)
- **What's wrong:** Hoot drifts across x 2…14 u at y 8.0. That is the same strip as the canvas HUD pill (top-left) and the DOM pause/mute buttons (top-right).
  - At x ≈ 2 his head and wings are drawn *under* the score pill, so he looks cut in half.
  - At x ≈ 14 the Pause button sits on top of his face.
  - It happens on desktop and on the phone. iPad is fine, because on a 4:3 screen the field is lower.
  - A child loses track of him, and of his "pillow coming" glow, right when it matters. It also looks broken.
- **Screenshots:** `desk_hoot_x2.png`, `desk_hoot_x14.png`, `phone_hoot_x2.png` (and `phone_hoot_x14.png`).
- **Code:** `game/js/world.js:70` (`BOSS_X: [2, 14]`), `game/js/render.js:302` (the HUD is drawn after Hoot), `game/js/render.js:468-495` (`drawHud`).
- **Fix** (render-side; it keeps the mechanics as they are):
  1. In `drawHud`, just before `g.restore()` (line 494), remember the pill's rectangle:
     ```js
     this._hudRect = { x: x0, y: y0, w: W, h: h };
     ```
  2. In `draw()`, replace line 302 with:
     ```js
     if (w && mode !== 'title') {
       this.drawHud(g, w); this.drawHints(g, w, mode);
       const b = w.boss, r = this._hudRect;
       if (b) {
         const a = w.alpha || 0, bx = this.sx(lerp(b.px, b.x, a)), by = this.sy(lerp(b.py, b.y, a));
         const hw = OWL_W * this.unit / 2, hh = OWL_H * this.unit / 2;
         // Hoot is under the score pill → draw him again on top of it
         if (r && bx - hw < r.x + r.w && by - hh < r.y + r.h) { g.setTransform(P, 0, 0, P, shx * P, shy * P); this.drawBoss(g, w, a); g.setTransform(P, 0, 0, P, 0, 0); }
         // Hoot is under the DOM pause/mute buttons → make them see-through
         const btnW = 2 * 44 / this.cssScale + 16, right = this.VW - this.ins.right - 8;
         const hud = document.getElementById('hud');
         if (hud) hud.classList.toggle('ghost', bx + hw > right - btnW && by - hh < this.ins.top + 8 + 50 / this.cssScale);
       }
     }
     ```
  3. In `style.css` (append at the end): `#hud{transition:opacity .2s} #hud.ghost{opacity:.35}`. The buttons stay tappable.
- **Cheaper alternative** (one line, but it changes the play area): `world.js:70` `BOSS_X: [3.4, 12.6]`. At 1280×720 that keeps a 6-digit score pill and the buttons clear. Note that `BOSS_PUSH` can still shove him past this band for about 0.5 s.

### P1-2. The season banner is drawn on top of the "Tap to serve!" hint at every season start (two lines of text mashed together); the spring banner also gives touch wording on desktop
- **What's wrong:** Both texts are drawn in the same place.
  - The banner title is at `sy(3.0)` and its hint line at `sy(3.0) + 0.7u`, which is about world y 2.3.
  - The serve hint is at `sy(paddle.y + 1.25)` = world y 2.6.
  - So "Spring Meadow / Slide to move Mochi · tap to serve!" lands right on top of "Click or Space to serve!" (or "Tap to serve!"). This happens for the first 2.6 s of every season, at every size: two lines of mashed text.
  - On desktop the spring hint also says "Slide… tap" (`render.js:16`).
- **Screenshots:** `desk_play_banner.png`, `phone_play_banner.png`, `ipad_play_banner.png`, `desk_custom_play.png`.
- **Code:** `game/js/render.js:499-506` (serve hint), `render.js:525-535` (banner), `render.js:16`.
- **Fix:**
  1. In `drawHints` (line 499), don't draw the serve line while the banner is still up:
     ```js
     if (w.phase === 'serve' && w.ball && !(this.banner && this.banner.t < 2.2)) {
     ```
     The banner's own hint already says how to serve.
  2. Make the spring hint fit the device. At line 534 replace `z.hint` with:
     ```js
     (b.s % 4 === 0 && !(MFB.Game && MFB.Game.isTouch) ? 'Move the mouse · click to serve!' : z.hint)
     ```

---

## P2: should fix

### P2-1. Score pop-ups pile on top of each other and on Hoot's face, so the tickle reward can't be read
- **What's wrong:**
  - "+30", "Tickled! +100", "Combo ×N!" and the "+15" brick pop-ups all start near the same point and overlap into a pile you can't read.
  - "+30" is drawn *on* Hoot (`sy(e.y − 0.7)` with Hoot's centre at e.y), so it covers the giggle animation, which is the payoff.
  - "Sleepy…" lands on top of "+50" in the same way.
- **Screenshots:** `sheet_hoot_hit.png`, `sheet_hoot_tickle.png` (both runs), `sheet_pillow_sleepy.png` (frames +533…).
- **Code:** `game/js/render.js:200`, `206-211`, `214`, `228`.
- **Fix:**
  1. Line 228: stack each new pop-up below any recent one nearby, and keep it under the HUD strip:
     ```js
     popup(x, y, s, col, sc) {
       const u = this.unit;
       for (const t of this.texts) if (t.t < 0.6 && Math.abs(t.x - x) < 1.8 * u && Math.abs(t.y - y) < 0.5 * u) y = t.y + 0.55 * u;
       y = Math.max(y, this.ins.top + 64);
       if (this.texts.length > 30) this.texts.shift();
       this.texts.push({ x, y, s, col, sc: sc || 1, t: 0, life: 1.1 });
     }
     ```
  2. Line 207: put the pop-up *below* Hoot (`this.sy(e.y - 1.25)`), and skip it on the 3rd hit (`if (e.hits < 3)`), because `bossTickled` follows straight after.
  3. Line 210: `this.sy(e.y - 1.8)`.

### P2-2. After a lost ball, the two serve hints collide
- **What's wrong:** "← move the mouse or use the arrow keys →" is centred at `sy(2.9)`. "Click or Space to serve!" follows the paddle at `sy(2.6)`. When Mochi stands right of centre, they run into each other: "…arrow keys →Click or Space to serve!".
- **Screenshot:** `sheet_ball_lost.png`, frames +308 to +467.
- **Code:** `game/js/render.js:505-510`.
- **Fix:** At line 510, draw the second line at the same clamped x as the first, one line above it:
  ```js
  const hx = clamp(x, 3 * u, this.VW - 3 * u), hy = y + bob - size * 1.15;
  g.strokeText(m2, hx, hy); g.fillStyle = '#fff6c8'; g.fillText(m2, hx, hy);
  ```

### P2-3. The banner keeps covering the ball after the child serves
- **What's wrong:** The banner title is big (0.75 u, white with a thick stroke) and stays up for 2.6 s at about world y 2.3–3.3. That is exactly where the ball travels right after a quick tap-to-serve. In `sheet_block_break.png` (first run) the ball disappears behind "Spring Meadow".
- **Code:** `game/js/render.js:249`, `525-527`.
- **Fix:** At line 249, once play starts, jump the banner to its fade-out:
  ```js
  if (this.banner) { if (this.world && this.world.phase === 'play' && this.banner.t < 2.1) this.banner.t = 2.1; this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
  ```

### P2-4. Portrait (upright phone after "Play upright anyway"): the bottom 35 % of the screen is flat brown, and the field is only 26 % of the height
- **What's wrong:** `groundPx = VH/2 + 4.6u` puts the ground at about 65 % of the height. Below that, `pal.ground` is one flat colour. The play area is a thin band in the middle with large empty areas above and below.
- **Screenshots:** `port_play.png`, `port_play_upright.png`, `port_title.png`, `port_over.png`.
- **Code:** `game/js/render.js:72` and `render.js:173`.
- **Fix:**
  1. Line 72, portrait branch: `this.groundPx = Math.round(this.VH - Math.max(0.4 * this.unit, this.VH * 0.14));`. Mochi then stands about 14 % above the bottom, the extra height becomes sky (it is already cover-fit), and the ground strip is a normal size.
  2. Line 173: replace the flat fill with a soft gradient:
     ```js
     const gg = g.createLinearGradient(0, gy + 40 * k, 0, H); gg.addColorStop(0, pal.ground); gg.addColorStop(1, '#3a2a3a'); g.fillStyle = gg;
     ```

### P2-5. Title screen: the logo and tagline sit on the demo's brick wall, so the tagline is hard to read
- **What's wrong:** The white 2.2u tagline runs across pink and gold bricks and a "+10" pop-up. On the phone and in portrait the logo straddles the bricks too. The radial veil (`style.css:341`, white 0.42→0) is too weak against busy bricks.
- **Screenshots:** `desk_title.png`, `phone_title.png`, `port_title.png`.
- **Code:** `game/css/style.css:341` and `:302`.
- **Fix:** Append to `style.css`:
  ```css
  #scrTitle{background:radial-gradient(ellipse 62% 48% at 50% 38%,rgba(40,24,80,.42),rgba(40,24,80,.2) 65%,rgba(40,24,80,0) 100%)}
  .tagline{display:inline-block;background:rgba(60,36,110,.6);border-radius:99px;padding:.25em .9em}
  ```

### P2-6. How to Play: the "dark blocks need 2 hits" card shows a normal block, and the icons are clipped
- **What's wrong:**
  - Card 2 shows `bricks/spring.svg` (pink bud) and `bricks/star.svg`. The tough block the text describes isn't shown.
  - `.how-ico` has `overflow:hidden` with a width of 8u, but the later rule `.how-ico img{width:6u}` (line 337) makes two icons 12u wide. So the ball, the star block and the pillow are cut in half on desktop.
  - On the phone the brick icons shrink to about 10 px.
- **Screenshots:** `desk_scrHow.png`, `phone_scrHow.png`, `ipad_scrHow.png`.
- **Code:** `game/index.html:90`, `game/css/style.css:280, 337`.
- **Fix:**
  1. `index.html:90`: `bricks/spring.svg` → `bricks/spring_tough.svg`.
  2. Append to `style.css`:
     ```css
     .how-ico{flex:0 0 calc(var(--u)*10);overflow:visible;gap:calc(var(--u)*.4)}
     .how-ico img{width:calc(var(--u)*4.4)!important;height:auto}
     .how-ico img[src*="bricks/"]{width:calc(var(--u)*4.8)!important}
     ```

### P2-7. A custom busy photo background swallows the bricks, the ball and the HUD
- **What's wrong:** The pale veil over a custom background is only `rgba(250,245,255,0.38)`. A colourful photo still competes with the pink bricks and the cream (or custom) ball.
- **Screenshots:** `desk_custom_play.png`, `phone_custom_winter.png`.
- **Code:** `game/js/render.js:167`.
- **Fix:** Make the veil `0.55`. Also add a slight blur when drawing the photo: set `g.filter = 'blur(2px) saturate(.8)'` before `cover(...)` on line 166 and `g.filter = 'none'` after it. This runs once per pre-render, so it costs nothing per frame.

---

## P3: polish

1. **HUD star with a custom picture becomes a sliver.** A tall custom star shows as "|" in the HUD (`desk_custom_play.png`, `phone_custom_winter.png`). At `render.js:491` always use the default sprite in the HUD: `this.drawSpr(g, 'star', hx + 10 * s, y0 + h / 2, ss, ss, 0.5, 0.5)`.
2. **Feathers are invisible on pale skies.** White feathers on spring and summer skies (`sheet_hoot_hit.png`, `sheet_pillow_sleepy.png`). In `assets/default/particles/feather.svg`, give the feather a `#9a8ac0` 1.5 px stroke and a `#efe9ff` fill (or draw it at 1.3× size, `render.js:235`, `size: (0.4 + …)`).
3. **The vine safety net is green on green grass,** so children won't notice it (`sheet_vine_save.png`, `desk_play.png`). At `render.js:321/324` use glow `rgba(220,255,180,0.55)` with `lineWidth 0.26u`, and core `#e4ffc4` with `lineWidth 0.08u`.
4. **The cap-hit ring is almost invisible** (`sheet_cap_squash.png`). At `render.js:201` use `col: '#ffffff'`, and at line 444 use a minimum line width of `0.09 * this.unit * (1 - k)`.
5. **Hoot's cloud overlaps the top row of blocks.** The owl sprite is 1.25 u tall at y 8.0, so its bottom (7.38) dips below the top row's top edge (7.75) (`desk_play.png`, `desk_season2.png`). At `render.js:383` draw him 0.2 u higher: `y - 0.2 * u`. The hit circle stays where it is.
6. **The ball blends into the big pale sun** in the summer and spring skies (`desk_season1.png`). After `render.js:411` add a thin rim: `g.save(); g.globalAlpha = .7; g.strokeStyle = '#b8801c'; g.lineWidth = Math.max(1, .035 * u); g.beginPath(); g.arc(x, y, .25 * u, 0, TAU); g.stroke(); g.restore();`.
7. **"Season cleared!" fades in over 0.3 s,** and its first frames look muddy khaki over the summer sky (`desk_clear_a.png` vs `_b`). At `render.js:516` start the alpha at 0.5: `0.5 + 0.5 * k`.
8. **The toast covers the "Change Pictures" heading** (`desk_custom_screen.png`). At `style.css:271` use `top:calc(env(safe-area-inset-top,0px) + 4px)` with `font-size:max(13px,calc(var(--u)*1.4))`, or move it into the panel above the buttons.
9. **The "NEW!" badge touches the Best number** in portrait (`port_over.png`). Append `@media (orientation:portrait){.sc{padding-right:calc(var(--u)*9)}}`.
10. **Disabled "Reset" buttons** on Change Pictures have white text on light grey, about 1.6:1 contrast (`desk_scrCustom.png`). Fine for a disabled state, but `.slot .btn:disabled{color:#8c867b;text-shadow:none}` reads better.
