# Visual QA — Puddle's Greenhouse Hop (2026-11-23)

Report-only. Captured with `node tests/visual/capture.js` (sections `screens,floors,fade,motion,grow,cvd,text,custom`) and
`node tests/visual/poses.js` (static leaf bends on both stem sides + basket at fixed swing angles). Output: `tests/out/visual/`
(138 PNGs; gitignored). Viewports: desk 1280×720, phoneL 844×390 @3× (touch, notch L/R 47 + home bar 21), phone 390×844 @3×
(Dynamic Island 47 + home bar 34), ipadL 1024×768 @2×, ipad 820×1180 @2×. The magenta frame in the touch shots is the
simulated unsafe area, not game art. No console errors in any run. No panel needed scrolling (How/Settings/Change Pictures fit
on all five viewports, including notched phone landscape).

## Overall verdict
Cute, warm and consistent. Puddle reads as an original round chick-penguin (coral hood, slate back, cream belly); she pops on every
floor and in all CVD simulations thanks to the dark outline. Pots, shelves, leaves, baskets, mushroom and umbrella share one
flat cel-shaded style with matching outlines. Squash/stretch on landing is lively. Leaves bend the right way about their stem
on BOTH sides (tip down for +bend, wobble back through negative bend and settle, `sheet_poses.png`, `sheet_*_leaf_*`). Basket
chains meet the rim eyelets exactly at every swing angle, and the basket rotates so it points at the pivot. Growth 1.0 / 1.3 / 1.6 is smooth
and the custom round sticker grows with it. The floor beam, banner, crossfade, white flash and the 0.8 s shrink-back all play
in order. The four floors are clearly different (warm glass, misty fern, rainy lilac houses, twilight rainbow) and the
column centre stays calm. The problems are a fork leftover string, the "+N" pop-ups, things that float without support
(leaf stalks and basket pivots), and crowding in portrait and 4:3.

---

## P1 (must fix)

### P1-1 Game-over medal hint is a farm-fork leftover: "Climb past the Sunny Meadow for a medal"
- Seen: `tests/out/visual/phone_over.png`, `desk_over.png` (every viewport).
- Where: `game/js/ui.js:128`. The comment on line 125 also still says "weather levels".
- Fix:
  ```js
  const c = info.cleared;   // floors finished: 1 bronze, 2 silver, 3 gold, 4+ platinum
  ...
  $('medalName').textContent = m === 'none' ? 'Climb past the Potting Shed for a medal' : m[0].toUpperCase() + m.slice(1) + ' medal';
  ```

---

## P2 (should fix)

### P2-1 "+10 / +20 …" firefly pop-ups are always drawn at 35 % alpha and sit on Puddle once she is bigger
- Seen: `desk_play.png` (pale "+40" touching her hood), `ipadL_f2_mid.png` ("+20" across her face), `sheet_desk_fireflies.png`
  (every "+N" is ghost-grey). The "Flick!" text is the same (`desk_f1_mid.png`).
- Why: render.js:371 places the text `0.75·hs·u + 18` px beside her: 53 px on desktop, 59 px in portrait. The "over Puddle" test at
  render.js:463 fades anything within 60 px horizontally and 0.9·u·hs+14 px vertically, so the "+N" text is always faded. The
  offset also ignores `size`: at 1.6× her half-width is 1.08 u, so the text lands on her body.
- Fix (render.js:371 and :463):
  ```js
  // 371
  const sz = w.hero.size || 1, side = w.hero.x < (PH.World.CONFIG.COLW / 2) ? 1 : -1,
        hx = this.sx(w.hero.x) + side * (0.68 * HERO_W * this.hs() * u * sz + 34);
  // 463 (pop-ups placed beside her on purpose are never faded)
  const over = !t.plus && H && Math.abs(t.x - H.x) < (t.big ? 200 : 60) && Math.abs(y - H.y) < 0.9 * this.unit * this.hs() + 14;
  ```
  And for "Flick!" (render.js:356) push it further down: `y: y + u * 1.1` instead of `u * 0.6`.

### P2-2 Leaf stalks dangle in mid-air, so leaves look like floating canoes, not attached leaves
- Seen: `sheet_poses.png` (rows 1–2), `desk_f1_mid.png`, `desk_f3_mid.png`, `ipadL_f2_mid.png`, `sheet_desk_cvd_f1.png`.
- Where: render.js:239-241. The stalk is a 0.55 u hook that curls down and away from the stem and ends in empty air.
- Fix: grow the stalk out of the nearer greenhouse pillar (that is the `side` the generator picked), with a small node leaf at the pillar:
  ```js
  const wallX = side < 0 ? this.colX : this.colX + this.colW;
  const sag = Math.min(1.2 * u, Math.abs(stx - wallX) * 0.25);
  g.strokeStyle = '#2f7a37'; g.lineWidth = Math.max(3, u * 0.09); g.lineCap = 'round';
  g.beginPath(); g.moveTo(wallX, sty - u * 0.35);
  g.quadraticCurveTo((wallX + stx) / 2, sty + sag, stx, sty + 2); g.stroke();
  this.drawSpr(g, 'p_leafbit', wallX + side * -u * 0.15, sty - u * 0.35, u * 0.5, u * 0.5, 0.5, 0.5, side * 0.6);
  ```
  Do not rotate the stalk with the bend. The leaf sprite already pivots at (stx, sty), so the joint stays closed.

### P2-3 Hanging-basket pivot is a grey dot floating in the sky
- Seen: `sheet_poses.png` row 3, `sheet_desk_cvd_f1.png` (top-left), `sheet_phone_fade_23.png`.
- Where: render.js:253.
- Fix: hang the pivot from the greenhouse roof by drawing a thin rod from the pivot up past the top of the screen, plus a little hook:
  ```js
  g.strokeStyle = 'rgba(90,95,115,0.9)'; g.lineWidth = Math.max(2, u * 0.05);
  g.beginPath(); g.moveTo(pxs, pys); g.lineTo(pxs, -10); g.stroke();
  g.beginPath(); g.arc(pxs, pys + Math.max(3, u * 0.08), Math.max(3, u * 0.1), Math.PI, TAU); g.stroke();   // hook
  ```
  This is drawn before the chains, so z-order is unchanged.

### P2-4 Floor-bonus text lands on Puddle in portrait
- Seen: `sheet_phone_fade_23.png` frames 9–12 and `sheet_phone_fade_01.png`. In portrait the camera keeps Puddle at about 80 % of the screen height, which is
  exactly where `VH*0.8` puts "Floor bonus +300 · size +103", so the text is faded across her for its whole 1.8 s life.
- Where: render.js:384.
- Fix: anchor it under the banner like the other big texts:
  ```js
  if (tot) this.texts.push({ x: this.VW / 2, y: 0, ay: this.portrait ? 0.30 : 0.80, s: ..., t: 0, col: '#fff3c4', big: true });
  ```
  Then move "Lantern full!" (render.js:378, `ay: 0.26`) to `ay: this.portrait ? 0.36 : 0.26` so in portrait it no longer touches the
  banner bottom (`sheet_phone_fade_23.png` frames 6–8).

### P2-5 Portrait: the height/floor pill covers the play column (platforms and fireflies vanish under it)
- Seen: `phone_play.png` (pot and two fireflies under "28 m Potting Shed"), `phone_f0_start.png`, `phone_start_hint.png`, `phone_over.png`.
- Where: render.js:507-509. In portrait the pill sits at `y0 + 100`, right of centre, inside the column. The left stack also reaches about 1.6 u into the column.
- Fix: make the HUD pills semi-transparent only in portrait, and stack the height pill into the left column under the size meter so the
  right side is clear:
  ```js
  const bw = this.portrait ? 168 - 16 : Math.min(250, this.VW * 0.28);
  const bx = this.portrait ? x0 + 8 : this.VW / 2 - bw / 2, by = this.portrait ? y0 + 46 + 48 + 44 : y0 + 4;
  ```
  Also give `_pill` an alpha of `.70` in portrait (render.js:478: `this.portrait ? 'rgba(255,253,245,.70)' : 'rgba(255,253,245,.82)'`).

### P2-6 Pots on Easy (and the title demo) are taller than the vertical gaps, so they overlap the platform below
- Seen: `phone_start_hint.png` (pots stacked into each other at y 670–860 and 1010–1100), `phone_play.png`, `desk_play.png` (the 25 m pot touches
  the shelf under it), `phoneL_play.png`.
- Why: the drawn height follows the width. On Easy a pot is 2.4·1.5 = 3.6 u wide, so it is 3.6·0.5·0.85 = 1.53 u tall, while Easy gaps are 1.3–2.0 u.
- Where: render.js:260.
- Fix: cap the pot height so wide pots become low troughs:
  ```js
  const Hd = p.kind === 'pot' ? Math.min(H * 0.85, 1.05 * u) : H;
  ```
  Do the same for the drop-shadow y at line 259: `y + Math.min(H * 0.85, 1.05 * u) + 3`.

### P2-7 iPad landscape (4:3): the left HUD stack sits on top of the play column
- Seen: `ipadL_f2_mid.png`, `ipadL_play.png`. With unit = 720/11.5 = 62.6 the column is 751 of 960 px wide and `colX` = 104, while the HUD pills run x 12–180.
- Where: render.js:79.
- Fix: in landscape, keep at least 186 px of side room for the HUD:
  ```js
  this.unit = this.portrait ? v.VW / (COLW + 0.8) : Math.min(v.VH / 11.5, (v.VW - 2 * 186) / COLW);
  ```
  This does not change 16:9 (1280×540 → 47 either way) or phone landscape. On 4:3 Puddle gets 22 % smaller but stays well over 60 px on an iPad.

### P2-8 Title icon and score-card hero show a square tile behind the round badge
- Seen: `desk_title.png`, `phone_title.png`, `phoneL_title.png`, `scorecard_image.png`. `icon.svg` is full-bleed (correct for the app
  icon), but on the title and the score card it shows as a tilted green square with grid lines.
- Fix CSS (`game/css/style.css:59`): add `border-radius:50%;` to `.title-icon` (the badge is r = 112/256, so a thin teal ring stays,
  which looks intended).
- Fix score card (`game/js/extras.js:151-155`): clip to the badge:
  ```js
  const hx = W / 2 - hw / 2 - 250, hy = cy + 70;
  g.save(); g.beginPath(); g.arc(hx + hw / 2, hy + hh / 2, hw * 0.4375, 0, Math.PI * 2); g.clip();
  g.drawImage(hero, hx, hy, hw, hh); g.restore();
  ```

### P2-9 Score-card background shows the in-game HUD behind the title ("26 m · Potting Shed" pill)
- Seen: `scorecard_image.png`, `phoneL_scorecard.png`.
- Where: `game/js/extras.js:126-131`. It copies the live canvas, and that canvas includes the HUD.
- Fix: redraw the frame without the HUD and blur it before copying:
  ```js
  const G = NS().Game; if (G && G.renderer) G.renderer.draw('title');   // no HUD/juice
  g.filter = 'blur(6px)'; g.drawImage(gc, (W - dw) / 2, (H - dh) / 2, dw, dh); g.filter = 'none';
  if (G && G.renderer) G.renderer.draw(G.mode);
  ```

### P2-10 Project CLAUDE.md still describes the frog fork
- `CLAUDE.md` says "Clover the frog … farm … 4 weather levels (sunny, rain, wind, snow) … wind gusts" with a 2026-11-08 status. This is
  not visual, but it is the first thing the next agent reads. Rewrite Goal/Status for Puddle, the 4 greenhouse floors and growth
  (outside my write scope).

---

## P3 (nice to have)

1. **HUD size meter jumps backward at ×2.** `sheet_desk_hud_size.png`: at size 1.29 the bar is 116 px wide, at 1.30 it shrinks to 76 px to make room
   for "×2", so the fill and the "big" tick jump left. render.js:522 → always reserve the space: `mW = mw - 92`.
2. **Landing squash compounds with the crouch pose.** At sq 0.9 the crouch sprite is squashed again (kx 1.22, ky 0.78), so Puddle becomes a pancake with her
   eyes almost under the hood (`sheet_desk_bounce.png` t6.75, `sheet_desk_grow.png` crouch). render.js:312 → when `h.mood === 'crouch'`
   use `0.14 * sq` instead of `0.24 * sq`.
3. **Floor beam is pale and thin.** It reads as a faint rail on all four floors (`sheet_desk_fade_01.png`, `sheet_desk_cvd_f1.png`). In `levels/beam.svg`, darken
   the edge strokes `#8b9ca0` → `#6f8285` (width 3) and raise the draw alpha in render.js:207 from 0.9 to 1.
4. **Colour-blind check.** Under deuteranopia/protanopia, pots, leaves, shelves and the mushroom cap all turn olive (`sheet_*_cvd_f*.png`). Shapes still tell them apart, and fireflies stay the
   brightest thing. Optional: give the mushroom cap's cream dots a darker outline (`#8a2a2e`, 2 px) so it stands out on the pot rim.
5. **How to Play icons are small in landscape phone.** The 40 px Puddle and a thin leaf sliver sit in a 150 px slot (`phoneL_how.png`). style.css:327 →
   `#scrHow .how-ico img{width:calc(var(--u)*4.4)}` and give the leaf `min-height:calc(var(--u)*2.2)`.
6. **Change Pictures label truncated.** It shows "Rooftop Rain Ga…" (`phoneL_custom.png`). Use the short slot name `'Rooftop'` in `game/js/assets.js:26`, or let the card title wrap.
7. **Fork comments.** render.js:217 says "farmyard ground"; audio.js:121 says "tok on the fence post"; the audio gust bed (`_wind`, audio.js:133-160) is unused.
   Only the comments are visible to players, but rename them for hygiene.
8. **Title demo shows full-strength "+N/BOING!" text.** The pop-ups are hidden on the title (good), but "BOING!" from mushrooms still appears in the
   portrait title demo (`phone_title.png` is clean; `phone_play.png` is fine). No action needed. Just check `mode !== 'title'` is also applied to
   onEvents texts if any show up.
9. **Custom photo background.** A busy, saturated photo (red block) sits directly behind Puddle (`desk_custom_start.png`). Puddle still reads thanks
   to her outline. Optional: a 15 % white veil over custom backgrounds inside the column (`drawPoles` already veils the sides).

## Checks that passed
- Every screen on 5 viewports: buttons inside the safe areas, hint pills above the home bar, HUD pause/mute clear of the notch, no
  panel overflow.
- Text never covers Puddle at full strength: in 1 minute of a bot run sampled every 4th frame (1,800 frames on desk and phone), no unfaded text
  overlapped her. The overlaps found were all the 35 % fades above (P2-1, P2-4).
- Fireflies: the plum backing disc with its bright rim reads on all four floors and in greyscale. The fly-to-jar arcs to the jar and the
  jar pulses.
- Mushroom squish and spring, umbrella rescue bubble, crossfade and banner timing, and the shrink-back from 1.5 to 1.0 in about 0.6 s all look right.
- Custom hero: the round sticker scales 1.0 → 1.3 → 1.6 (`sheet_*_custom_grow.png`), and the procedural feet and flippers stay attached. The custom
  floor background is cover-fitted with no seams.
- No frog, hay or wind art is left anywhere in the game's images.
