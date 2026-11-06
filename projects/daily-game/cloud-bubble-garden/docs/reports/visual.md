# Visual QA — Nimbus's Bubble Garden (2026-11-06)

Capture: `node tests/visual/capture.js [screens|zones|levelup|motion|custom|portrait]` → `tests/out/visual/*.png` (gitignored).
The script runs the game at speed 0 and steps it in-page (`NB.Game.step`), so contact sheets are deterministic.
Sizes: desk 1280×720, iPad landscape 1024×768, iPhone 390×844 @3× touch, iPad portrait 768×1024 @2× touch. 0 console errors.

**Overall:** the art is charming and on-model. Nimbus reads well in every light, the five gems differ by colour *and* shape (colour-blind safe), the bubbles are clear enough that the gem always reads, the bump (ouch face, star burst, knock-back, blink) and the level-up rainbow + crossfade are lovely. The main problems are **layering**: the HUD covers hanging burrs and Nimbus (badly in portrait), and floating text covers Nimbus, the HUD and the banner.

---

## P1 — must fix

### P1-1 Portrait: the 2nd HUD row sits inside the play area — hanging burrs and Nimbus go under it
Shots: `zone3_phone.png`, `zone1_phone.png`, `phone_play_night.png`, `phone_size5_top.png`, `ipadP_play_night.png`.
In portrait the jar panel is drawn at `top + 108 … top + 186` logical px (render.js:579), but `topY = 0.85·unit ≈ 79` (world.js:133). Burrs dangle at `topY + 0.15u ≈ 93`, i.e. **behind the score panel / jar panel** — the warning a kid needs is hidden (the brown burr at night is almost invisible there). Nimbus can float up to `topY + r`, so at size 5 her face sits under the jar panel (`phone_size5_top.png`). With the iPhone notch inset (≈ 67 logical px) it is worse.
**Fix** — let the renderer tell the world where the HUD ends:
```js
// world.js:130  computeLayout(w, h, topMin)
World.computeLayout = function (w, h, topMin) {
  var portrait = h > w;
  var unit = portrait ? M.min(w / 6, h / 8) : M.min(w / 9.6, h / 5.4);
  var groundY = h - 0.95 * unit, topY = M.max(0.85 * unit, topMin || 0);
  ...
};
// world.js setLayout(w, h, topMin) → pass topMin through to computeLayout (and store it so reset() reuses it)
// render.js:89 + :111  (resize/attach)
const topMin = this.ins.top + 12 + (v.VH > v.VW ? 108 + 78 : 98) + 10;   // under the HUD panels
this.world.setLayout(v.VW, v.VH, topMin);
// main.js makeWorld(): pass the same topMin into reset({..., topMin}) (expose it as renderer.hudBottom()).
```
Also draw **hanging burrs on top of the HUD** as a belt-and-braces fix (they are a warning, they must never be hidden):
```js
// render.js:328
this.drawBurrs(g, w, b => b.state !== 'hang');
// render.js:338, right after this.drawHud(g, w, mode):
this.drawBurrs(g, w, b => b.state === 'hang');
// render.js:416  drawBurrs(g, w, keep) { ... for (const b of w.burrs) { if (keep && !keep(b)) continue; ...
```

---

## P2 — should fix

### P2-1 "+N" points text lands on Nimbus's face and on the score digits
Shots: `phone_play_dawn.png` (+20 over her face), `edge_callout_top_a.png` / `_b.png` ("+40" written over "650" in the score panel), `motion_grow.png` ("+20" collides with the size pips).
The text is spawned once above her head (render.js:214-215) and rises at 60 px/s, but Nimbus keeps moving (often upward, faster than the text) and near the top it spawns inside the HUD.
**Fix** — make hero pops follow her and flip below her when there is no room above:
```js
// render.js:214-215
const H = w.hero, lift = H.r * NIM_K + 14 * u + (this.sizePulse > 0 ? 22 : 0);   // clear the size pips too
this.pop('+' + e.points, e.by === 'rain' ? x : H.x, e.by === 'rain' ? y - r - 10 * u : H.y - lift, c, 18 + Math.min(8, e.size * 1.5));
if (e.by !== 'rain') Object.assign(this.texts[this.texts.length - 1], { follow: true, dy: -lift });
// render.js:298 (update)
for (const t of this.texts) {
  t.t += dt;
  if (t.follow && this.world) {
    const h = this.world.hero, L = this.world.layout;
    let ty = h.y + t.dy - t.t * 60;
    if (ty < L.topY + 0.3 * L.unit) ty = h.y + h.r * NIM_K + 18 + t.t * 20;   // no room above: show it under her
    t.x = h.x; t.y = ty;
  } else { t.y += t.vy * dt; t.x += t.vx * dt; }
}
```
Also clamp the shower-bonus pop (render.js:237) the same way.

### P2-2 Landscape: Nimbus's head and hanging burrs tuck under the HUD panels
Shots: `edge_size5_tc.png` (curl + top of head under the jar panel), `edge_size5_tl.png`, `motion_burr.png` (burr's top half under the jar panel), `zone0_desk.png`.
The clamp uses the hit radius (`_box`, world.js:194) but the sprite is 1.25× bigger and has a curl on top; HUD panels end at y 110 (score) / 90 (jar) while `topY = 85`. P1-1 (`topMin = ins.top + 118`) fixes most of it; additionally clamp by the sprite size:
```js
// world.js:194
var rs = r * 1.2;            // drawn sprite half-size (arms/curl) — keep it fully on screen and under the HUD
var x0 = rs, x1 = L.width - rs, y0 = L.minY + rs, y1 = L.maxY - r;
```
(also fixes `edge_size5_tr.png` / `edge_size5_br.png`, where her arm is cut by the screen edge).

### P2-3 Night: the pale halo turns burrs into "bubbles"
Shots: `zone3_desk.png`, `zone3_phone.png`, `phone_size5_top.png`, `custom_play_night.png`.
`rgba(210,225,255,.20)` disc (render.js:436) behind the green burr looks exactly like a soap bubble with something inside — a 4-year-old will chase it. Burrs should read "avoid", never "bubble".
**Fix** — a warm rim glow instead of a pale disc:
```js
// render.js:436-438
const im = this.spr('burr_' + (b.variant || 0), S, S);
if (night) { g.shadowColor = 'rgba(255,150,60,.95)'; g.shadowBlur = 10 * this.px; }
if (im) g.drawImage(im, -S / 2, -S / 2, S, S);
g.shadowBlur = 0;
```
Optional (art): the green variant `burr_1.svg` blends into green foliage at noon (`zone1_desk.png`); darken shell `#7fa83a` → `#5f7f26` and spikes to `#3f5a18` so it stays the darkest thing in the play area per DESIGN §3.

### P2-4 Ripple / splash rings are drawn randomly rotated — they look like standing hoops/paper-clips on the lawn
Shots: `motion_shower_full_t050.png` (4 tilted loops at y≈610), `custom_gems_closeup.png`, `custom_play_night.png`.
`burst()` always sets `rot: r.range(0, 6.28)` and a random spin (weather.js:225), so the flat `ripple` ellipse (spawn, render.js:201) and `splash` (land, render.js:245) stand up on edge.
**Fix:**
```js
// weather.js:225
var flat = sprite === 'ripple' || sprite === 'splash';
... rot: flat ? 0 : r.range(0, 6.28), spin: flat ? 0 : r.range(-spin, spin), flipX: !flat && r.chance(0.5),
```
Also `opts.grow` (render.js:201 passes `grow: 1.2`) is ignored by `burst` — pass it to the particle so ripples widen.

### P2-5 The rain shower has almost no rain
Shots: `motion_shower.png`, `motion_shower_full_t050.png`. Nimbus turns blue and bubbles pop, but no visible drops fall from her — the moment that should feel like the big reward reads as "bubbles disappeared". **Fix** (render.js:284 `update`):
```js
const h = this.world && this.world.hero;
if (h && h.rainT > 0 && this.weather) {
  this._rainAcc = (this._rainAcc || 0) + dt;
  while (this._rainAcc > 0.04) {
    this._rainAcc -= 0.04;
    this.weather.burst('drop', h.x + (Math.random() - 0.5) * 1.4 * h.r, h.y + 0.7 * h.r, 1,
      { speed: 80, angle: Math.PI / 2, spread: 0.25, gravity: 1100, life: 0.7, size: 12, layer: 'front', spin: 0 });
  }
}
```
(with P2-4, make `drop` also non-rotated: add it to `flat`, or align `rot` to velocity.)

### P2-6 Level-up: "+100" lands on the banner; the banner covers Nimbus
Shot: `seq_levelup.png` (t 0.25–0.75 "+100" on the banner's top edge; t 2.25 Nimbus behind the banner).
**Fix:** render.js:259 → put the bonus under the banner:
`const by = L.portrait ? L.topY + 2.6 * L.unit : L.topY + 1.55 * L.unit; this.pop('+' + e.bonus, this.VW / 2, by + 62, '#ffe27a', 28);`
render.js:629-631 → fade the banner when she is under it:
`const fa = this._fadeFor(this.world, cx - w / 2, y - h / 2, w, h); g.globalAlpha = a * 0.85 * fa; ... g.globalAlpha = a * fa;`

### P2-7 Custom background photos are not calmed — busy, saturated, and ignore the time of day
Shots: `custom_play_dawn.png` (saturated confetti photo behind the play area: gems/bubbles fight it), `custom_play_night.png` (bright daytime photo with a night lawn).
**Fix** render.js:148-149:
```js
g.filter = 'saturate(0.65) brightness(0.96)';            // ignored on old Safari; the overlay below still works
g.drawImage(im, (VW - im.width * s) / 2, (VH - im.height * s) / 2, im.width * s, im.height * s);
g.filter = 'none';
g.fillStyle = ['rgba(201,180,230,.22)', 'rgba(255,255,255,.14)', 'rgba(255,150,90,.22)', 'rgba(16,24,70,.52)'][b];
g.fillRect(0, 0, VW, VH);
```

### P2-8 Game over: the "NEW!" badge sits on top of the score digits
Shots: `screen_over_desk.png`, `screen_over_ipadL.png`, `screen_over_phone.png`.
style.css:319 (`.new-best{right:0!important;top:calc(var(--u)*-1.4)!important}`) puts it over the Score number. Replace with an inline badge:
```css
.sc b{order:2}
.sc .new-best{position:static!important;order:1;margin-left:auto;align-self:center}
```

### P2-9 Tall portrait: ~55 % of the screen is empty flat sky
Shots: `phone_play_dawn.png`, `zone1_phone.png`, `zone3_phone.png`, `screen_title_phone.png`. The sky tile only covers the top 540·k px; below is a flat gradient for ≈ 650 logical px. Calm is good, but it looks unfinished. Add a few faint drifting clouds in the middle band (portrait only), render.js:191 after the sky tile loop:
```js
if (this.VH > this.VW * 1.3) {
  g.setTransform(this.px, 0, 0, this.px, 0, 0);
  g.globalAlpha = alpha * 0.22;
  const span = this.VW + 240;
  [[0.15, 0.36, 46], [0.62, 0.48, 60], [0.35, 0.60, 38]].forEach(([fx, fy, r], i) => {
    const x = ((fx * span + this.time * (4 + i)) % span) - 120;
    this._cloud(g, x, this.VH * fy, r, b === 3 ? '#8090c8' : '#ffffff');
  });
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha;
}
```

---

## P3 — polish

- **P3-1 Title logo touches the screen edges** (`screen_title_desk.png`, `screen_title_ipadL.png`: "Nimbus's … Garden" spans 10→1268 px). style.css:180 → `.logo{font-size:min(calc(var(--u)*8), 7.2vw)}`.
- **P3-2 Change Pictures on iPhone is lopsided** (`screen_custom_phone.png`: Nimbus/Gem buttons stack 4-high in narrow cards, Night sits alone with an empty half). style.css:222-224 → `.slot-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important} .slot,.slot:nth-child(n+4){grid-column:span 1!important}` (3 rows × 2).
- **P3-3 Toast covers the "Change Pictures" title** (`custom_screen_filled.png`). style.css:263 → `#scrCustom:not(.hidden) ~ #toast{top:auto!important;bottom:calc(env(safe-area-inset-bottom,0px) + 12px)!important}`.
- **P3-4 Purple/blue "+N" text is weak on lilac dawn and navy night** (`seq_levelup.png`, `motion_shower.png` t 1.75). Use lighter tints for text only: render.js:204 `c = ['#ff8fa3','#8fc0ff','#7ff0b0','#ffe07a','#d6b0ff'][e.gem]` for `this.pop`, keep `GEM_COL` for rings.
- **P3-5 Pop juice is a little thin** (`motion_pop_closeup.png`: shards barely visible). render.js:206 → shards `8 → 12`, `size: 10 → 14`; keep the drops.
- **P3-6 Custom gem: the shape badge is tiny** (`custom_gems_closeup.png`). render.js:404 → `gemPath(g, b.gem, gs * 0.48, gs * 0.42, gs * 0.27)` and `lineWidth = 2`, so colour-blind kids still see the 5 kinds.
- **P3-7 Every burr landing shakes the screen** (render.js:244 `shake 1.2`). With several burrs at night it feels jittery; drop to `0.6` or only when the burr lands within 2u of Nimbus.
- **P3-8 Night HUD panels nearly vanish** into the navy sky (only the outline shows; `zone3_desk.png`). Text is still legible. Optional: render.js:546 night fill `rgba(10,14,40,.72)` when `w.zone % 4 === 3`.

## What is good (keep)
- Gems inside bubbles read clearly in all 4 zones; shapes (round/drop/square/star/heart) make them colour-blind safe.
- Nimbus is on-model in every mood; squash on pop, tilt, bob and the 1→5 growth (`motion_sizes.png`) look great.
- Burr life cycle (`motion_burr.png`) and bump (`motion_bump.png`: ouch face, stars, knock-back, shrink, 0.45 blink) are clear and gentle.
- Level-up rainbow + 1.6 s crossfade (`seq_levelup.png`) is a lovely reward; the background stays soft behind the play area (except custom photos, P2-7).
- Menus (How to Play, Settings, Pause) are clean and finger-sized on iPhone.
