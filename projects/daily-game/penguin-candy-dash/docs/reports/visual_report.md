# Pip's Candy Dash: Visual / Art-Direction QA Report

Date: 2026-10-29 · Build: `game/` as served on :8802 · Tester: visual QA agent
Captures: `tests/out/visual/` (re-create with `node tests/visual/capture.js http://127.0.0.1:8802/index.html [menus,biomes,motion,custom]` and `node tests/visual/edges.js`).
Motion sheets are deterministic: the loop is frozen (`speed 0`) and the world is stepped by hand at 1/120 s, with one frame every 40 ms of game time unless the file name says otherwise.

## Verdict
The art is strong and consistent: an original flat-cartoon candy style, four clearly different biomes, cute and grumpy (never scary) bears with accessory cues, gems with four different shapes, and crisp SVG rasterisation at every size, including 1.6× Pip. The menus look commercial. **Two P1 problems** (the HUD covers the playfield, and the gate isn't depth-sorted) and a group of P2 "juice/readability" gaps stop it feeling fully polished. Most fixes are 1–10 lines in `render.js`.

---

## P1: must fix

### P1-1 The HUD panels cover the walkable arena (Pip, gems and the POP hint get hidden)
- **Evidence:** `edge_top_bottom_l0.png`. Size-5 Pip at the top edge sits behind the jar panel and the pause/mute buttons, and a gem at (820,110) is hidden *inside* the jar panel. See also `menu_ingame_1280x720.png`.
- **Cause:** the arena starts at y=84 (gems from y=110, Pip's head reaches y≈20 at size 5), but `render.js:435-436` draws the jar panel at y 68–126 and `render.js:420` draws the SIZE pill at y 64–90.
- **Fix (render.js, `hud()`):**
  1. Move the jar into the HUD band, left of the DOM buttons: `render.js:435` → `const jx = 700, jy = 4, jar = A.sprite('jar', 44, 55);` (the panel then spans x 692–832, y 2–60, clear of the buttons at x≈844+).
  2. Put the SIZE pill on the hearts row: `render.js:420` → `this.roundRect(26 + 30 * (w.heartsMax || 3) + 8, 22, 82 + 20 * smax, 26, 13)`, and shift the pips/labels to match (`x0 = 34 + 30*heartsMax + 8`; label at `x0`, pips at `x0 + 38 + i*20`, y 35).
  3. Safety net: fade the HUD panels when Pip is under them. At the top of `hud()` add `const under = w.pip && w.pip.y - PIP * (w.pip.scale || 1) < 70;` and multiply each panel's fill alpha by `under ? 0.45 : 1`.

### P1-2 The gate isn't y-sorted: bears and Pip draw on top of the arch when they're behind it
- **Evidence:** `edge_gate_depth_l0.png` (a red bear at y=280, which is behind the gate foot at y=360, is painted over the arch), and `sheet_gate_walk.png`, where Pip walks *over* the left pillar instead of through the arch.
- **Cause:** `render.js:217` `drawGate()` runs before `drawEntities()` and never enters the sort.
- **Fix:** add the gate to the sort list. In `drawEntities` (`render.js:271-279`): `if (w.gate) O.push(this._gateObj || (this._gateObj = { isGate: true, get y() { return w.gate.y + 60; } }));`, then in the loop `if (o.isGate) this.drawGate(); else if (o === w.pip) …`. Remove the call at `render.js:217`. Draw the glow ellipse (`render.js:259-263`) separately before entities so it stays behind everything.

---

## P2: should fix (polish and readability)

| # | Issue | Evidence | Where | Exact change |
|---|---|---|---|---|
| P2-1 | The "+points" popup spawns on Pip's face/scarf. It is anchored at the gem's position minus 34, so at size ≥2 it sits on the sprite | `sheet_grow_anim.png`, `biome1_later.png`, `biome3_later.png` | `render.js:77` | `y: w.pip.y - PIP * (w.pip.scale || 1) - 8` (and `x: w.pip.x`). Do the same for 'Boing!' at `render.js:94`. |
| P2-2 | The default Pip has no body waddle: walk1/walk2 only move the feet, so walking reads as gliding (the custom hero *does* rock) | `sheet_waddle_right.png`, `sheet_waddle_size5.png` | `render.js:360-365` | Before `g.scale(-1,1)`: `const sp = Math.hypot(p.vx||0,p.vy||0), mv = Math.min(1, sp/60); if (!p.sliding) { g.rotate(Math.sin(this.time*14) * 0.07 * mv); g.translate(0, -Math.abs(Math.sin(this.time*14)) * 2 * mv * sc); }` (better: drive the phase from `p._stride * Math.PI` so it syncs with the foot frames). |
| P2-3 | Bump: the hurt ("oof" swirl eyes) pose is almost never seen, because the blink hides Pip 100 % on about 45 % of frames from the very first frame. Kids lose track of Pip | `sheet_bump.png` frames 2-5, 8-9 | `render.js:345` | Replace the hide with a translucent blink after a short hold: `const blink = p.invuln > 0 && p.invuln < (w.cfg.invulnTime||1.5) - 0.35 && Math.sin(this.time*24) > 0.3;` then `g.globalAlpha = blink ? 0.35 : 1` around the sprite (and don't `return`). |
| P2-4 | Gem telegraph is nearly invisible (a 10 px cream sparkle on mint/vanilla ground), and the gem then *pops* in with no scale-in | `sheet_gem_appear.png` | `render.js:291-297` | Telegraph: draw a gem-coloured ground ring `g.strokeStyle = GEM_COLORS[m.color]; g.globalAlpha = 0.35+0.4*ap; g.lineWidth=2.5; g.ellipse(m.x, m.y, 6+10*ap, (6+10*ap)*0.45, …)` under the sparkle, and set the sparkle size to `14 + 16*ap`. Appear: track `m._shown` and, for 0.25 s after `appear` hits 1, scale the gem by `easeOutBack(t/0.25)` around its centre and emit `this.sparks(m.x, m.y-14, 6, GEM_COLORS[m.color])` once. |
| P2-5 | Regular gems vanish with no warning after `gemLife` 14 s; only loose gems blink | code; `world.js:71` and the `gemgone` event | `render.js:298` and `onEvents` | `const fade = m.life != null && m.life < 1.5 ? (Math.sin(this.time*20) > 0 ? 0.35 : 1) : 1;` and add `case 'gemgone': this.puffs(e.x, e.y-10, 4, '#ffffff'); break;` |
| P2-6 | The gate opening is an instant sprite swap. `gate.t` (0..1) is ignored | `sheet_gate_open.png` (already open in frame 0, no motion) | `render.js:264-266` | While `gt.t < 1`: draw `gate_closed` with `globalAlpha = 1-gt.t` and its lollipop barrier sliding down `gt.t*30` px, cross-faded over `gate_open`. Scale the arch by `1 + 0.08*Math.sin(gt.t*Math.PI)` and burst 12 `p_sparkle` from (900,240) on `gateopen`. |
| P2-7 | No walk-through on clear: Pip stands in front of the arch cheering for the whole 2 s 'cleared' phase, then the scene hard-cuts | `sheet_transition.png` frames 0-9 | `drawPip`, `render.js:343-366` | When `w.state === 'cleared'`, let `k = clamp(w._stateT/0.6, 0, 1)`: draw Pip with `globalAlpha = 1-k` and scale `1-0.4*k` at `lerp(p.x, w.gate.x, k), lerp(p.y, w.gate.y, k)` (into the glow), and add a sparkle ring at k≈1. The world already walks Pip to `gate.x+6`. |
| P2-8 | Chocolate River slow has no visual feedback: Pip walks *on* the chocolate like dry ground, and his shadow disappears on the dark band | `sheet_river_slow.png`, `biome1_mid.png` | `drawPip` / `drawBear` | If `p.inSlow`: clip the sprite bottom `6*sc` px (`g.beginPath(); g.rect(-sz, -sz*1.2, sz*2, sz*1.2 - 6*sc); g.clip()`), draw two light `rgba(255,230,200,.55)` ripple ellipses at the feet expanding with `this.time`, and every 0.25 s while moving `this.fx.push({k:'circle', … color:'#e9c3a0', r0:6, r1:22, max:0.5})`. Do the same for bears via a world terrain check (or `b.inSlow` if mechanics expose it). |
| P2-9 | Puff bounce: Pip hops (good), but the puff itself doesn't react, and the `bounce` event is unhandled | `sheet_puff_bounce.png` | `onEvents` (`render.js:72-105`) and a new puff layer | `case 'bounce': this.ring(e.x, e.y, '#ffffff', 0.35); this.puffs(e.x, e.y, 6, '#ffd1ec'); this._puffHit = { x: e.x, y: e.y, t: 0 }; break;`. Then redraw a squash: overdraw a `rgba(255,255,255,.25)` ellipse at the puff zone centre with scale `1+0.08*sin(t*25)*exp(-6t)` for 0.4 s. |
| P2-10 | The max-size state (the core twist) reads weakly: 3 small 12 px sparkles and a 16 px "POP!" whose alpha pulses down to 0.5 | `sheet_waddle_size5.png`, `sheet_growth_hitbox.png` (size 5) | `render.js:368-376` | Add a pulsing gold ground ring under Pip (`g.strokeStyle='#ffd23c'; g.lineWidth=3; g.ellipse(p.x, p.y, sz*0.5*(1+0.08*Math.sin(this.time*8)), sz*0.18, …)`). Raise the sparkles to `16+6*sin`, make the label `'POP! (Space)'` at size 18, alpha `0.85+0.15*sin`, and use `'Tap ★ to POP!'` when touch. |
| P2-11 | The SIZE pill and hearts pill are 85 % opaque, so fence posts show through between the size pips (they look like extra pips) | `crop_hud_1920.png`, `crop_hud_800.png` | `render.js:416, 420, 436` | Use `'rgba(255,255,255,0.96)'`, and give empty pips a ring: `g.strokeStyle='rgba(168,64,126,.35)'; g.lineWidth=1.5; g.stroke()` after the fill. |
| P2-12 | Unhandled feedback events: `heal` (+1 heart on clear has no effect), `go` (no "Go!" after the banner), `shrink` (size loss is only seen in the HUD) | code | `render.js:72-105` | `case 'heal': this.texts.push({text:'+1 ♥', x:120, y:70, life:0, max:1.2, size:22, color:'#ff7ab8', big:true}); break;` · `case 'go': this.texts.push({text:'Go!', x:480, y:270, life:0, max:0.7, size:54, color:'#ffffff', big:true}); break;` · `case 'shrink': this.ring(w.pip.x, w.pip.y-20, '#ffd1e6', 0.3); break;` |
| P2-13 | Bump drops are hard to read: the 2 loose gems land about 30 px from Pip, get re-collected almost instantly, and show "+20" right after "Boing!" (it reads as being rewarded for a bump) | `sheet_bump.png` frames 11-23 | mechanics: `world.js:74` `looseSpeed` / `looseTelegraph` | *(For the mechanics team)* `looseSpeed: [240, 320]`, `looseTelegraph: 0.6`, plus no pickup of loose gems while `p.hurt > 0`. Render: give loose gems a 1-px white outline ring so they read as "your dropped gems". |

---

## P3: nice to have

1. **Dash trail is white on pale grounds**, so it's almost invisible in the meadow and fully invisible on the glacier (`sheet_dash_zoom.png`). In `render.js:93` and `:133`, use the biome dark colour at low alpha: `this.puffs(..., BIOME_INFO[w.biome].color)`, and add two speed-line strokes behind Pip while `p.sliding`.
2. **The hitbox is a foot-centred circle**, so it extends up to 26 px *below* the sprite at size 5, while the shadow is only 6–10 px tall (`sheet_growth_hitbox.png`). That is forgiving and fine for kids, but the shadow should show the footprint: `render.js:185` → `g.ellipse(x, y + 2, w * 0.5, Math.max(w * 0.16, (w/0.7) * 0.22), …)` for Pip (≈ radius-proportional).
3. **The custom bear kind ring is thin** (3 px, alpha 1) and gets lost on busy photo grounds (`custom_ingame.png`). At `render.js:328-329`, draw a 6 px white under-stroke and then a 4 px colour stroke; also tint the round sticker border with the kind colour.
4. **The custom hero has no state poses.** For dash, hurt and cheer the photo looks the same. At `render.js:351-359`: `if (p.sliding) g.rotate(0.35 * (p.facing||1))`; hurt adds `Math.sin(this.time*40)*0.12` rotation; cheer adds a hop `-Math.abs(Math.sin(this.time*10))*6`.
5. **Sprite cache churn while growing:** `A.sprite('pip_'+fr, sz, sz)` (`render.js:363`) is keyed on a continuously smoothed `sz`, which creates about 140 rasters per frame type per growth step. Rasterise once at `PIP*1.6` and draw scaled: `A.sprite('pip_'+fr, PIP*1.6, PIP*1.6)` with `drawImage(spr, -sz/2, -sz*PIP_FOOT, sz, sz)`. It stays crisp because the sprite only ever scales down. Same for `custom:hero` at `:352`.
6. **Stun stars ignore hop height:** at `render.js:338` use `b.y - (b.z||0) - BEAR - 4`. Also, the stun SVG already has stars, and the 3 orbiting code stars double them up (`sheet_pop_zoom.png`). Drop to 2 code stars, or use `p_sugar` for them.
7. **Game-over "NEW!" badge overlaps the last digit** of the best score (`menu_over_1280x720.png`, `menu_over_800x600.png`). In `style.css:98`, change `.new-best` to `right:calc(var(--u)*-5.5);top:calc(var(--u)*-1.2)`.
8. **Toast covers the Done/Reset-all buttons** on Change Pictures (`custom_screen.png`). In `style.css:145`, add `#scrCustom:not(.hidden) ~ .toast{bottom:auto;top:calc(var(--u)*3)}`, or position the toast at the top while `UI.current==='scrCustom'`.
9. **HUD pause/mute buttons** use a cool slate `rgba(40,60,90,.45)` (`style.css:74`) that is off-palette for candy biomes. Use `background:rgba(168,64,126,.55)` (berry) with a white border.
10. **How to Play doesn't explain the three bear behaviours or the terrain** (`menu_how_*.png`, `index.html:81`). Replace the single green bear icon with all three (`bear_red_1`, `bear_green_1`, `bear_orange_1` via `.how-ico.quad`) and append: "Red wanders, green follows you, orange guards gems. Chocolate is sticky, puffs go boing, ice is slippery!"
11. **Title screen:** demo Pip and bears wander under the tagline and buttons (`menu_title_1280x720.png`, 800×600). Add a soft backing: `.title-wrap{background:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.45),rgba(255,255,255,0) 65%);padding:calc(var(--u)*2) calc(var(--u)*6)}`.
12. **Small HUD at 800×600:** the "SIZE" label renders at about 9 px (`crop_hud_800.png`). Raise it to `13` and the ×N to `15` at `render.js:421, 426`.
13. **Colour-blind check** (`cb_deutan_biome3_mid.png`, `cb_protan_biome1_later.png`): red and green bears both become olive and are told apart only by the bow vs sprout (~8 px). Readable, but enlarging the accessory about 1.3× in `bear_red_*`/`bear_green_*` SVGs (or adding a white tummy heart vs leaf) would make it robust. Gems are fine (four distinct shapes).
14. **A bear can fade in right inside the gate arch** at level start (`menu_banner_1280x720.png`). Mechanics: exclude a 90 px radius around `gate` in `_spawnBear` (`world.js` ~318-325, alongside the existing `< 60` check, which is too small).

---

## What already looks great
- **Art direction:** original, cohesive flat-cartoon candy style, consistent outlines and cel shading. Pip is adorable and the bears are grumpy-cute, never scary.
- **Biomes** are instantly distinguishable: mint meadow with lollipop fence, cocoa river with wafer bridges, pastel clouds with rainbow corner, vanilla glacier with ice-cream hills and igloo (`biome*_mid.png`). Zone art matches the `world.js` zone rects and circles exactly (`biome*_mid_debug.png`).
- **Growth 1→5** stays crisp, stays anchored at the feet, and the squash wobble on grow, pop and bump is lovely (`sheet_growth_hitbox.png`, `sheet_grow_anim.png`).
- **Pop!** has a big, satisfying star burst, ring, white flash and "POP! +70" scale-in, and the bears visibly get dizzy (`sheet_pop_zoom.png`).
- **The belly-slide pose** and the ice coasting slide pose read immediately (`sheet_dash_zoom.png`, `sheet_ice_slide.png`). The puff hop separates sprite from shadow nicely.
- **Facing flips** pass through the front-facing idle pose, which feels like a real turn (`sheet_waddle_flip.png`).
- **Biome transition:** banner slide-in with easeOutBack, 1.2 s background crossfade, "Biome cleared! / Heart bonus" (`sheet_transition.png`).
- **Menus** are polished and consistent at 1280×720, 1920×1080 and 800×600: chunky candy buttons, a clear Change Pictures grid with live ground previews, nice medals on Game Over.
- **Custom pictures** stay readable even on a very busy photo ground: round sticker, orange feet so a photo still waddles, coloured kind rings for gems and bears (`custom_ingame.png`, `sheet_custom_hero_walk.png`).
- **Gems** use four distinct shapes (heart, round, star, square), so they're colour-blind safe. The jar fill is a nice rainbow gradient.
