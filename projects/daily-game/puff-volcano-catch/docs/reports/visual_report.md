# Visual QA report: Puff's Volcano Catch

Date: 2026-10-30 · Reviewer: visual QA / art director (report only, nothing under `game/` was changed)
Capture script: `tests/visual/capture.js` (run `node tests/visual/capture.js`, about 3 min). It writes 100+ PNGs to `tests/out/visual/`. There were no console errors.
Logical space is 960×540. Coordinates below are logical px unless marked "css px".

## What was captured
- **Screens** (title, how to play, settings, change pictures, pause, game over) at `1280`, `1920` and `iphone` (844×390 at DPR 3, touch): `screen_<name>_<vp>.png`, plus `play_banner_<vp>`, `play_zone0_<vp>`.
- **Gameplay with the bot**, all 4 zones: `zone<0-3>_play_{1280,iphone}[_b].png`, and `zone2_debug_1280.png`.
- **Crossfade** at t=0.5: `crossfade_0to1/1to2/2to3_1280.png`.
- **Contact sheets**, built with deterministic stepping at speed 0: `burst_catch`, `burst_catch_mult`, `burst_rain`, `burst_ouch`, `burst_miss`, `burst_rockland`, `burst_erupt`, `burst_move`, `burst_stop`.
- **Readability lineups** (3 coins + 2 rocks in Puff's band, in the sky and on the sand) in each zone, shown normal, greyscale, deuteranopia and protanopia: `lineup_zone<z>_{normal,grey,deut,prot}.png`.
- **Custom pictures**: a transparent PNG hero, an opaque JPEG coin (auto round), a PNG rock, and photo JPEGs for beach and crater: `custom_*.png`. Fixtures are in `tests/out/visual/fixtures/`.

## Overall verdict
The default art is strong and on-model. Puff, the basket, the coins, the volcano face and the 4 zones all share one cartoon outline and cel-shading language. The motion is good: tilt, the pendulum lag on a dash and the overshoot settle on a stop all read well (`burst_move`, `burst_stop`). The catch payoff is good too: happy face, squash, gold ring, "+50".
Coins and rocks stay distinguishable in greyscale and in deuteranopia/protanopia because they differ in brightness (dark rock vs mid/light coin) and in shape.
The problems are the **touch/iPhone layout**, **leftover Candy Dash theme styling**, **the catch moment hidden behind Puff**, **rock contrast at night** and **ring colours with custom pictures**.

---

## P1: must fix

### P1-1. The touch Cool Rain button covers Puff and the basket at the right side of the shore (iPhone)
- **Screenshots:** `play_zone0_iphone.png`, `zone3_play_iphone.png`. The pink 💧 button is bottom-right.
- **Where:** `render.js:57` places it at `right = ox + 24*s`, `bottom = oy + 24*s`. Its size is `11*--u` (`style.css:184`), which is 76 css px on iPhone. That covers logical **x 830–936, y 410–516**. Puff is clamped to x ≤ 890 and the rim line is y 446, so Puff and the basket go **under** the button whenever Puff is at x > ~790.
- **Fix:** put the button in the pillar-box, which is 75 css px each side on iPhone. Replace `render.js:57` with:
  ```js
  if (act) {
    const u = Math.min(vw / 100, vh * 0.0178), side = ox - 8;
    const bw = side >= 56 ? Math.min(11 * u, side) : 11 * u;
    act.style.width = act.style.height = bw + 'px';
    if (side >= 56) { act.style.right = Math.round((ox - bw) / 2) + 'px'; act.style.bottom = Math.round(oy + 24 * s) + 'px'; act.style.opacity = ''; }
    else { act.style.right = (ox + 24 * s) + 'px'; act.style.bottom = (oy + 24 * s) + 'px'; act.style.opacity = '0.6'; }  // iPad 4:3: no side bars
  }
  ```
  On iPad (4:3) there are no side bars. There, also fade the button to `opacity:.3` while `world.puff.x > 780`, for example in `main.js` `frame()`: `act.style.opacity = puff.x > 780 ? '.3' : '.6'`. Add `padding-right: env(safe-area-inset-right)` so the button stays clear of the notch and home indicator.

### P1-2. The catch moment happens behind Puff's body: coins and rocks vanish for the last ~80 px
- **Screenshots:** `burst_catch.png` frames #0–#3: the gold coin is hidden behind Puff, and only a sliver shows at #3. `burst_ouch.png` #0–#3: the rock is invisible until it pops out under Puff at #4.
- **Where:** `render.js:234-235` draws `drawItems(false)` **before** `drawPuff`. Puff's body spans y ≈ 352–432, right above the rim (446), so every item that lands in the basket passes behind him. A child loses track of the coin at the exact moment it matters. A rock that is about to hurt is hidden, so the child can't react.
- **Fix:** draw items in flight **after** Puff. In `render.js:234-235`, swap to `this.drawPuff(mode); this.drawItems(false);`. Caught items are still drawn between the basket back and front inside `drawPuff`, so the drop-in effect stays.

### P1-3. With custom pictures, rocks and copper coins get almost the same orange ring
- **Screenshots:** `custom_lineup_zone0_1280.png`. The copper "dog" coin at x 400 and the rock at x 773 both have orange rings. `custom_play_zone3_1280.png` shows the same.
- **Where:** `render.js:25` copper ring is `#f0965a`. `render.js:309` rock ring is `#ff8a2a`. With a user photo for both, the ring is the only "danger" cue.
- **Fix:** give the rock a clearly different danger marker. In `render.js:309` set `ring: '#e8253a'`. In `render.js:324`:
  ```js
  if (d.ring) { const rock = it.kind === 'rock';
    if (rock) { g.fillStyle = 'rgba(232,37,58,0.22)'; g.beginPath(); g.arc(0, 0, d.s * 0.62, 0, TAU); g.fill(); g.setLineDash([5, 4]); }
    g.strokeStyle = d.ring; g.lineWidth = rock ? 4 : 3; g.beginPath(); g.arc(0, 0, d.s * 0.55, 0, TAU); g.stroke(); g.setLineDash([]); }
  ```
  Coins keep solid metal rings. Rocks get a red dashed ring and a soft red halo.

---

## P2: should fix

### P2-1. Leftover "Pip's Candy Dash" theme: pink and purple clash with the volcano-island palette
- **Screenshots:** every `screen_*`, and `play_*_iphone` (purple side bars `#3b2340`, pink 💧 button).
- **Where:** `style.css:176-185` overrides the island theme. It sets `html,body{background:#3b2340}` (:177), a blue/pink logo (:179), pink headings `#e0569a` (:182) and a pink action button `rgba(255,120,190,.75)` (:184-185). DESIGN §3 asks for a warm tropical palette, and `index.html` `theme-color` is `#1f9fa0`.
- **Fix:**
  - `:177` → `html,body{background:#145a72}` (the beach `dark`, matches the sea).
  - `:179` → delete it, so `:65` gold `#ffd23f` and orange `#ff8a3d` apply again.
  - `:182` → `.panel h2{color:#e0662b}` (the original warm orange).
  - `:185` → `background:rgba(42,134,224,.8)`, which matches the rain meter `#2a86e0`.
  - Rename the comment to "Puff's Volcano Catch theme".

### P2-2. Sizzly rocks have low contrast on the night zone (Crater Rim) and are nearly invisible on the ground there
- **Screenshots:** `zone3_play_1280.png` (rocks at (545,60) and (850,70)), `zone3_play_1280_b.png` (rocks resting at (403,638) and (1148,644) css), `lineup_zone3_normal.png`. The dark plum rock on navy has a luminance contrast of only about 1.3:1.
- **Fix:** add a warm "sizzly" halo under every rock in every zone. This is on theme ("warm rocks") and also helps on the lilac Ash zone. In `drawItem`, before `g.drawImage` (`render.js:325`):
  ```js
  if (it.kind === 'rock') { const k = 0.75 + 0.25 * Math.sin(this.time * 10 + it.id);
    g.globalAlpha = a * 0.55 * k; g.fillStyle = this._rockGlow || (this._rockGlow = (() => { const r = g.createRadialGradient(0, 0, 6, 0, 0, 26);
      r.addColorStop(0, 'rgba(255,150,60,0.9)'); r.addColorStop(1, 'rgba(255,110,40,0)'); return r; })());
    g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill(); g.globalAlpha = a; }
  ```
  The gradient is centred at 0,0 after `translate`, so it can be cached.

### P2-3. iPhone: HUD text and HUD buttons are too small for a 6-year-old
- **Screenshots:** `play_zone0_iphone.png`, `zone3_play_iphone.png`. At scale s = 0.722:
  - "combo 1" (13 logical) is **9.4 css px**.
  - The zone name (13) is **9.4 css px**.
  - "RAIN!" (15) is **10.8 css px**.
  - The pause/sound buttons are `5*--u` = **34.7 css px**, below Apple's 44 pt minimum.
- **Fix:**
  - `render.js:462`: size 13 → **16**.
  - `render.js:473`: size 13 → **16**, `lw` 4 → 5.
  - `render.js:450`: size 15 → **17**.
  - `style.css:73`: `.icon-btn{width:max(44px,calc(var(--u)*5));height:max(44px,calc(var(--u)*5))}`.
  - With the bigger buttons, the pouch pill (x 692–828) would collide with them on iPhone. Move it left: `render.js:465` `jx = 700` → `jx = 680`.

### P2-4. The combo label is white text on a white fill, which is unreadable once the bar fills
- **Screenshots:** `zone3_play_1280_b.png`: "combo 3" sits on the light 55% white fill. `custom_play_zone3_1280.png` shows the same.
- **Where:** `render.js:460-462`. The fill colour at ×1 is `#ffffff` at alpha .55, and the text is `#ffffff` with no stroke.
- **Fix:** `render.js:462` → `this.text('combo ' + (w.combo || 0), W / 2 - 70, 73, 16, '#ffffff', '#3a2550', 'left', 4);`. Also change the ×1 fill in `render.js:460` from `'#ffffff'` to `'#bfe6ff'`.

### P2-5. The Cool Rain column is almost invisible on bright zones
- **Screenshots:** `burst_rain.png`. On the beach only the falling drops read. The column itself is a barely-there rectangle, so the child can't see the "safe zone".
- **Where:** `render.js:296`, gradient from `rgba(150,210,255,0)` to `rgba(150,210,255,0.32)`.
- **Fix:** use stops `0 → 'rgba(150,210,255,0.12)'` and `1 → 'rgba(110,190,255,0.45)'`. After `g.fill()` at `render.js:298`, add an edge: `g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.setLineDash([10, 8]); g.lineDashOffset = -this.time * 60; g.stroke(); g.setLineDash([]);`. The dashes scroll downward like rain.

### P2-6. The eruption telegraph is too subtle
- **Screenshots:** `burst_erupt.png`. Frames #0–#7 (0.56 s of rumble) look almost the same: the glow barely grows and the 2.5 px shake can't be seen. The launch at #8 comes as a surprise.
- **Fix:**
  - `render.js:280` → `k = clamp(0.2 + 0.4 * (v.glow || 0) + 1.0 * (v.rumble || 0), 0, 1)`.
  - `render.js:287` → `g.scale(1 + 0.6 * (v.rumble || 0), 0.62 * (1 + 0.6 * (v.rumble || 0)))`, so the glow swells up to 1.6×.
  - Mechanics owner: `world.js:402` change `v.rumble * 2.5` → `v.rumble * 4`.

### P2-7. The "NEW!" badge covers the Best score digits
- **Screenshots:** `screen_over_iphone.png` (it covers the "0" of 20) and `screen_over_1280.png`.
- **Where:** `style.css:98` `.new-best{right:calc(var(--u)*-3.2);top:0}`.
- **Fix:** `right:calc(var(--u)*-5.6);top:calc(var(--u)*-1.6)`. This fits inside the over-body padding plus the panel padding.

### P2-8. Touch devices are shown keyboard instructions
- **Screenshots:** `screen_how_iphone.png` (← → / A D, Space, Esc/P, M, F11), `screen_settings_iphone.png` ("Full screen (F11)"; iPhone Safari has no Fullscreen API), `screen_over_iphone.png` ("Press Enter"), `screen_custom_iphone.png` ("Drag a picture").
- **Fix:** add `document.body.classList.toggle('touch', VC.Game.isTouch)` in `UI.init` (ui.js), then:
  - CSS: `.touch .kbd-only{display:none}` and `.touch .hint.small{display:none}`.
  - Wrap the key texts in `<span class="kbd-only">`. Add touch alternatives with `<span class="touch-only">`, hidden on non-touch: "Hold your finger where Puff should float" and "Tap 💧 (or a second finger) for Cool Rain".
  - Hide the Full screen row when `!document.fullscreenEnabled`.

### P2-9. A custom background removes the volcano, so coins and smoke appear from nowhere in mid-sky
- **Screenshots:** `custom_play_zone0_1280.png`, `custom_play_zone3_1280.png`. The crater glow and smoke float over the clouds or the city at (480,210) with nothing under them.
- **Where:** `render.js:174` returns right after `customBg`.
- **Fix:** keep the eruption source visible. After `customBg(...)` succeeds, still draw the volcano layer: `if (this.customBg('bg_' + n, alpha)) { this.layer(n + '_volcano', alpha); return; }`. If the full volcano on a photo is too much, draw only its top: clip to `y < 330` and draw at `alpha * 0.9`.

### P2-10. The rock smoke trail draws grey dots on Puff's face
- **Screenshots:** `burst_ouch.png` #1–#4: grey specks on Puff's forehead and between the eyes, like dirt.
- **Where:** `render.js:331-333`. The trail puffs go into `this.fx`, which `drawFx` paints after Puff.
- **Fix:** skip trail spawns near Puff: add `&& !(Math.abs(it.x - w.puff.x) < 56 && it.y > w.puff.y - 50)` to the condition, with `const w = this.world`. P1-2 makes the rock itself visible there anyway.

---

## P3: polish

1. **"Combo lost" sits on top of the missed coin** (`burst_miss.png` #3–#7). `render.js:91`: `y: e.y - 30` → `e.y - 64`, size 18 → 20.
2. **Rock trail reads as separate dots, not smoke** (`burst_rockland.png` #1–#3). `render.js:332`: `size: 5` → `size: 8`, `max: 0.4` → `0.55`, colour `rgba(150,130,140,0.45)`, and spawn every 2nd frame instead of every 3rd (`% 2`).
3. **Custom hero: the white "cloud hands" look like buttons stuck on a non-cloud picture** (`custom_lineup_zone0_1280.png`, the pink cat). `render.js:384-385`: use the rope colour for the hands, `fillStyle '#c99a5e'`, `strokeStyle '#7a4a22'`, radius 6 → 4.5, so they read as rope knots.
4. **Change Pictures: the rock and coin previews are tiny** (`screen_custom_1280.png`, about 34 px in an 80 px box). In `ui.js` `renderSlots`, for the char slots set `img.style.height = '80%'` (or in CSS: `.slot .prev img{min-height:70%}`).
5. **Title: the demo Puff plays behind the menu buttons** (`screen_title_1280.png`; the basket peeks under "Best score"), and demo coins fly through the logo. Optional: shift `.title-wrap` up (`style.css` `margin-top:calc(var(--u)*-6)`), or give the title demo bot's world a puff y offset. This is cosmetic only.
6. **iPhone pillar-box bars** are 75 css px of flat colour. After the P2-1 colour fix they are fine. A nicer option: set `body` background to a vertical gradient `linear-gradient(#7cc8f0 0 55%, #35b8c8 55% 88%, #f0d79a 88%)`, so the bars continue sky, sea and sand.
7. **Ouch flash:** with `globalAlpha .45` blinking, Puff turns into a see-through blue ghost (`burst_ouch.png` #6–#7). Prefer blinking between 1.0 and 0.7 (`render.js:348/371/376`: `0.45` → `0.7`) so Puff never looks like he disappeared.
8. **Gold coin vs the moon in greyscale** (`lineup_zone3_grey.png`, the gold coin near the moon glow) is a minor point. The gold twinkle helps. No action needed unless the moon moves into the item band.

## Checked and OK
- **HUD band:** hearts, rain meter, score and pouch stay in y 0–64. The combo pill (y 62–84) and zone name (y ~70) sit just below it and overlap no gameplay at any viewport. The pause/sound buttons hug the canvas edge at 1280, 1920 and iPhone.
- **Zone banner:** y 104–214, during the 1.4 s "ready" state with no eruptions. It never covers Puff (y ≥ 352).
- **Pause and Game Over panels** cover Puff by design. These are modal screens, so this is acceptable.
- **Crossfades** (`crossfade_*`) blend cleanly. The ground layers fade with the sky, and particles from the old zone fade out.
- **Colour-blind and greyscale lineups:** coins (light/mid, round, embossed) vs rocks (dark, irregular, cracks) vs Puff (white, outlined) stay distinct in all 4 zones under grey, deuteranopia and protanopia.
- **Outline and shading** are consistent between characters and environments. The art is kid-friendly: sleepy smiling volcano, soft "Ouch!", nothing scary.

Note: the small dark pill at the bottom of `custom_screen_filled_1280.png` comes from the capture script, which cleared the toast text. It is not a game bug.
