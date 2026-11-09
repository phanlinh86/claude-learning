# Visual QA — Finn's Island Fling (2026-11-09)

Capture: `node tests/visual/capture.js` (optional `ONLY=screens|islands|motion|custom|deut`), ~4 min, 0 console errors.
Screenshots: `tests/out/visual/` (gitignored). Viewports: `desk` 1280×720 @1, `ipad` 1024×768 @2 (touch), `phoneP` 390×844 @3, `phoneL` 844×390 @3.
Motion: `sheet_*.png` contact sheets, 1/30 s per frame (sim frozen with `setSpeed(0)` and advanced by hand); single frames are `mo_<tag>_NN.png`.

**Overall:** the art is clean and on-style. Finn, the leaves and the raft read well on all four islands by day and at night. The night level feels right for a 5-year-old: atmospheric, with every gameplay object lit (verdict: keep `0.72·nk` in `drawDarkness`). The problems are layout and readability: the iPad landscape view, the phone portrait scale, the preview dots, and text pile-ups. These are listed below.

---

## P1 — fix before shipping

### P1-1 iPad landscape (any 4:3 / 16:10 screen) cuts off the right quarter of the world: the raft is off-screen
- Shots: `aim_ipad_0cove_day.png` (raft half cut, the arc runs off the edge), `island_ipad_3lantern_night.png` (only the raft's left logs are visible), `screen_ipad_how.png` background.
- Why: for 1 ≤ aspect < 16/9, `computeView` gives VW 960, VH 720, so `unit = VH/9 = 80` and only 960/80 = **12 u** of the 16 u field is visible. Rafts spawn at x 8–14.3 (+hw), so on Lagoon and Lantern Bay the raft is often fully invisible. iPad Air 1180×820 shows about 13 u, which is also cut.
- Fix, `game/js/render.js:76` (landscape branch of `resize`):
  ```js
  else {
    this.unit = Math.min(v.VH / 9, v.VW / 16.4);
    this.ox = v.VW / v.VH >= 16 / 9 ? 0 : 0.2 * this.unit;             // wide: rock flush left (as today); 4:3: 0.2 u margin like portrait
    const spare = v.VH - 9 * this.unit;                                // 4:3 → ≈190 px of extra height
    this.seaPx = Math.round(v.VH - 1.2 * this.unit - spare * 0.35);    // extra sky above, a bit more sea below
  }
  ```
  The rock's left-edge stretch at `render.js:171` already handles `rx > 0`. Add a regression assert to the smoke test: `R.sx(16) <= R.VW` for 1024×768 and 1180×820.

### P1-2 Phone portrait: the whole game is a thin strip and Finn is about 31 CSS px tall
- Shots: `screen_phoneP_play.png`, `aim_phoneP_2lagoon_night.png`, `aim_phoneP_3lantern_day.png`, `sheet_fling_portrait.png`.
- Why: `unit = VW/16.4` gives 34 logical px (≈24 CSS px on a 390 px phone), so Finn (1.3 u) is about 31 CSS px, a leaf is about 19 CSS px, and preview dots are about 2–3 CSS px. More than 60 % of the screen is empty sky and deep sea. A 5-year-old cannot see what to aim at. The only help is the "turn your device sideways" toast, which lasts 3.5 s (`main.js:94`).
- Fix:
  1. `game/js/main.js:94`: when `renderer.portrait && isTouch && Math.min(screen.width, screen.height) < 600` (phones only, not iPad portrait), show a persistent **rotate overlay**: a full-screen `.screen.dim` with an animated phone-rotating SVG and "Turn me sideways! ↻". Pause the game while it shows and hide it on `resize` to landscape. Keep the toast for iPad portrait.
  2. Fallback when the player keeps portrait anyway: at `render.js:26`, draw bigger sprites in portrait only (visual, hit radii unchanged): `const HERO = 1.3, LEAF = 0.8;` → use `this.heroS = this.portrait ? 1.6 : 1.3; this.leafS = this.portrait ? 1.0 : 0.8;` (set in `resize`) and use them in `drawHero`/`drawLeaves`/flyers. Also scale the preview dot radius `render.js:368` by `this.portrait ? 1.5 : 1`.

---

## P2 — should fix

### P2-1 Preview dots disappear against clouds, the sun and pale skies
- Shots: `aim_desk_1jungle_day.png` (the arc vanishes over the cloud and sun), `mo_fling_bull_00.png` (dots on the sun disc), `deut_0cove_day.png`.
- Why: the dots are `#ffffff` / `#fff3b0` with a 45 % dark shadow offset downwards, which is near-white on near-white. The dotted arc is the main teaching tool for a 5-year-old.
- Fix, `render.js:370-371`: draw a full dark ring instead of an offset shadow, and alternate warm/white:
  ```js
  g.fillStyle = 'rgba(31,60,80,0.75)'; g.beginPath(); g.arc(X, Y, r + 1.8 * this.k, 0, TAU); g.fill();
  g.fillStyle = i % 2 ? '#ffffff' : '#ffd23f'; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill();
  ```
  Also raise the base radius from `4.2 - 1.6*i/n` to `5.2 - 1.8*i/n` (same line 368).

### P2-2 Pop-up texts and hints pile up on top of Finn
- Shots: `custom_play_night_fly.png` ("Tap / Space to flutter!", "Night falls… follow the glowing leaves!", two "+2" all over Finn and the moon), `mo_fling_bull_24.png` / `mo_fling_bull_46.png` ("+1" sits on Finn's head), `mo_bonk_09.png` ("Bonk!" on the bandana).
- Fixes:
  - `render.js:409` leaf pop: `this.text('+' + e.value, X + 0.55 * u, Y - 1.0 * u, …)` (it was `X, Y - 0.5u`). Give these a shorter life of `0.9`.
  - `render.js:412` "Bonk!": `Y - 1.1 * u`.
  - `render.js:428-429` centre messages ("Night falls…", "Good morning!"): draw them at `this.VH * 0.86` (over the sea, below the flight band), or queue them until `w.phase === 'aim'`. Show "Night falls…" for 3 s at size 0.85.
  - `render.js:596` flutter hint: move from `VH * 0.2` (Finn's apex) to `this.VH * 0.88`.
  - `render.js:437`: the de-overlap only nudges up by 30 px. Also skip any centred text whose box would contain Finn's screen position (`foxPos`): push it to `VH*0.86` instead.

### P2-3 Finn dives nose-first, then snaps upright in one frame on landing
- Shots: `mo_bull_land_06.png` → `mo_bull_land_07.png` (about −110° to 0° in 1/30 s), `mo_night_land_03.png` (upside-down dive).
- Why: the world eases `rot` to the full velocity angle (up to about −100° on steep falls), but the renderer hard-sets `rot = 0` for `land` (`render.js:386`).
- Fix: `render.js:382`: for `fly`/`flutter`, `rot = clamp(-P.rot, -0.75, 0.75)` (±43°, still reads as flying). At `render.js:386`, remove `rot = 0` from the `land` branch so the world's eased decay (`fox.rot *= exp(-10h)`, `world.js:479`) shows, or blend it: `rot = clamp(-P.rot, -0.75, 0.75) * Math.exp(-t * 14)`.

### P2-4 Colour-blind: the bullseye red X disappears into the wood (deuteranopia)
- Shots: `deut_0cove_day.png`, `deut_1jungle_day.png`: the X becomes olive on olive-brown logs. Hearts (full or empty) still read by shape. Leaves and Finn both turn olive but read by shape and outline.
- Fix: in `tools/art-environment/gen.js` (raft X), give the X a 4 px `#fff6df` under-stroke plus the dark outline, so it reads as a light-outlined cross. Or in the renderer after `drawSpr('raft')` (`render.js:292`), stroke a cream X: `g.strokeStyle='#fff6df'; g.lineWidth=2.5*this.k` over the art X at deck centre. Make the pulsing bullseye ellipse (`render.js:302`) last for all of island 1 (drop `shots < 3`).

### P2-5 Custom photo backgrounds swamp the play field
- Shot: `custom_play_day_aim.png`: a busy holiday photo sits directly behind the flight band. Purple star leaves and the round dog-photo Finn have to compete with coloured blocks. The far and near island layers are skipped for custom pictures (`render.js:160`), so nothing calms it.
- Fix, `render.js:152`: after `cover(gs, custom, …)` add a calming veil:
  `gs.fillStyle = 'rgba(235,245,250,0.35)'; gs.fillRect(0, 0, W, sea);` (and optionally `gs.filter = 'saturate(0.7)'` before drawing the photo, then reset it).

### P2-6 Moon leaves are pale cyan on pale sky in the daytime
- Shots: `aim_desk_1jungle_day.png`, `deut_1jungle_day.png`. A moon leaf spawned at dusk stays a moon leaf into daylight, and white-on-light-blue loses contrast. (In this capture it is exaggerated by jumping `setDay`, but it happens naturally around dawn.)
- Fix, `render.js:313-317`: when `nk < 0.3` and the leaf is a moon leaf, draw the halo with normal compositing in `rgba(40,110,160,0.35)` (a darker ring) instead of `lighter`. Or darken the outline in `leaf_moon.svg` to `#2b7fae`.

### P2-7 How to Play: icons overflow the card and collide with text (iPad and phone portrait)
- Shots: `screen_ipad_how.png`, `screen_phoneP_how.png`. Finn's pull icon sticks out past the card's left edge, the sling and gull touch the first word, and the raft icon is tiny.
- Fix, `game/css/style.css:280`: `.how-ico img{width:calc(var(--u)*3.4)}`, then add
  `.how-ico{flex:0 0 calc(var(--u)*8);overflow:hidden}` and `.how-ico img:only-child{width:calc(var(--u)*7)}`.

### P2-8 Game-over numbers look hollow and Score/Best do not line up
- Shots: `screen_ipad_over.png`, `screen_phoneP_over.png`. White-filled digits on the `#eef6fb` panel read as outlines only. "NEW!" (`position:static` at `style.css:335`) pushes the Best digit left of the Score digit.
- Fix: `style.css:97`: `.sc b{color:#ffb43a;…}` (keep the dark stroke). Replace `style.css:335` with
  `.sc{padding-right:calc(var(--u)*6.5)} .new-best{position:absolute!important;right:0!important;top:50%!important;transform:translateY(-50%) rotate(8deg)}`.

---

## P3 — polish

1. **Ghost-hand hint covers Finn's belly** at the start of each loop (`screen_desk_play.png`, `screen_phoneL_play.png`). `render.js:583`: `hx = fx - (0.55 + k * 1.4) * this.unit, hy = fy + (0.2 + k * 1.0) * this.unit`, so it starts behind Finn. On desktop the keyboard hint text (`render.js:588-591`) runs across the top leaf: draw it at `VH * 0.56`.
2. **Sling band reads as a stick through Finn.** The front strand (`render.js:345`, `#8a4a26`, 5 k) cuts diagonally across his chest and the pouch is a dark blob at his belly (`aim_ipad_0cove_day.png`). Move the seat behind his back with `seat = [sx(sling.x+p.x) - 0.45*u, sy(sling.y+p.y) + 0.05*u]` (`render.js:337`), lighten the front strand to `#a65f33` and draw it at `lineWidth 4*k`, and make the pouch `ellipse(…, 9k, 6k)` in `#6b3a1f` with a `#3d1f0c` 1.5 k stroke.
3. **Sun or moon behind the HUD pill in portrait** (`aim_phoneP_3lantern_day.png`, `screen_phoneP_over.png`). `render.js:208`: cap the arc height with `Math.min(sea * 0.78, 8 * this.unit)`.
4. **Crescent moon looks like a dark eclipse disc** (`mo_fling_night_00.png`). The "bite" (`render.js:221`) is painted with `nightTop` at 0.85 over the 1.7 R glow ring, so a grey disc shows. Draw the bite with `globalCompositeOperation='destination-out'` on a small offscreen canvas, or lower the ring alpha to `0.12` and the ring radius to `1.35 R`.
5. **Gulls are unlit at night.** You can see them, but they get no glow, and kids can't anticipate a bonk (`island_ipad_3lantern_night.png`). `render.js:263`: add `for (const g of w.gulls) hole(lerp(g.px,g.x,a), lerp(g.py,g.y,a), 0.9, 0.6);`.
6. **Splash and flutter juice is faint.** Flutter puffs are tiny white wisps (`mo_flutter_03.png`), and the splash shows only a few small drops (`mo_splash_08.png`). Raise the burst counts in `render.js:411` (5 → 8) and `:422` (12 → 18), and in `weather.js` raise the `flutter`/`splash` sprite sizes by about 1.5×.
7. **Splash head appears to sit on the background sand island** (`mo_splash_08.png`). Draw a short teal water ellipse (`pal.sea`, alpha 0.8, `1.1 u × 0.18 u`) at `sy(0)` in front of `finn_splash` (`render.js:387`).
8. **Change Pictures layout:** the second row leaves a 3-column gap (`custom_screen_set.png`, `screen_phoneL_custom.png`). At `style.css:152` and `:224`, change `span 3` to `span 4`. On phone portrait, "Round" wraps under "Whole picture" (`screen_phoneP_custom.png`): `.slot .shape button{flex:1 1 0}`. The "Saved" toast covers the dialog title (`style.css:271`): use `top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 12px)`.
9. **Leaf counter bar** (`render.js:541`): the empty track (`rgba(255,255,255,0.25)` on a dark pill) almost vanishes. Use `0.4` and round the ends (`_pill`).
10. **Jungle near art** has a busy rock arch and waterfall in the y 1–3 band, right where Finn lands (`mo_land_edge_04.png`). Finn still reads thanks to his outline, but DESIGN §3 asks for a calm band. Lower the waterfall contrast in `tools/art-environment/gen.js` (jungle near) by about 20 %.

## Checked and OK
- Finn is readable on all four islands by day, at dusk and at night (warm orange against cool backgrounds, dark outline). Leaves are readable everywhere. The raft and lantern are clearly lit at night.
- Night darkness is right for ages 4–6: Finn's light hole, the lantern, the torch and the glowing leaves cover everything you need. It is not too dark, and the dark sky with lit islands reads as night.
- The HUD does not overlap play in landscape. In portrait the HUD is far from the play strip (the issue there is the strip's size, P1-2).
- Custom transparent PNG hero (`custom2_play_fly.png`) and Round-shaped photo hero (`custom_play_day_aim.png`) both read fine. Photo-as-leaf works.
- Landing squash, ring, "Landed! +2" and the bullseye flash plus "Bullseye! +5" (`sheet_bull_land.png`) look good. The bonk star burst (`mo_bonk_09.png`) reads well.
