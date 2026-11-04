# Visual QA — Juno's Moon Stack (2026-11-04)

Capture: `node tests/visual/capture.js [only=screens,planets,goal,motion,guide,custom,particles]` → `tests/out/visual/` (gitignored).
Viewports: `desk` 1280×720, `ipadL` 1024×768 (dpr 2, touch), `phone` 390×844 (dpr 3, touch), `ipadP` 820×1180 (dpr 2, touch).
Contact sheets (`sheet_*.png`) are frames ~40–70 ms apart at speed 0.35, with the game time printed on each frame.

**Overall:** the art is strong and consistent. Crates read clearly on all four planets, and coins pop. The physics reads well: the fall tilt, landing puffs, edge sway, the slow pivot of a miss and the block topple all look right (`sheet_perfect`, `sheet_edge_sway`, `sheet_miss`, `sheet_topple`). There were no console errors and no seams, judder or stretched sprites. Every menu fits on every viewport, and on touch devices body text never drops below 13 px. The problems are mostly **overlaps in the drop lane** and a few **muddy sprites**.

## P1 — fix before shipping

| # | Screenshot | What's wrong | Fix |
|---|---|---|---|
| 1 | `phone_play`, `phone_goal`, `phone_newplanet`, `zoom_phone_sparkles`, `desk_title` (left edge) | **Grey "coin" discs behind the sky's 4-point stars.** Each star in `sky.svg` has a flat halo `<circle r="7–11" opacity="0.12">` with a hard edge. In portrait the sky tile is scaled ×2.25 (VH/540), so the halos become 25–50 px grey discs. They are the most noticeable ugly element on iPhone and iPad portrait. | In `levels/{moon,dunes,rings,comet}/sky.svg`, replace each halo (moon 9, dunes 7, rings 8, comet 7, all matching `<circle … opacity="0.12"/>`) with a soft gradient: add `<radialGradient id="sh"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` and use `fill="url(#sh)"` with no `opacity`. Simply deleting the halos also looks fine. |
| 2 | `desk_planet2` (dome under the score panel), `ipadL_play`, `sheet_goal` t=27.6 | **Juno's saucer swings under the translucent HUD panels.** At the left end of the swing, the saucer's left edge reaches x≈119 and the dome top y≈50, while the score panel covers 12–202 × 12–110. This happens even at grow 0 and gets worse as Juno grows. The hero ends up half-covered by a dark 72 %-opaque box. | Render-side (no gameplay change): in `drawHud` (render.js:557), take the lerped saucer box `{x±0.5·S, y−0.5·S … y+0.45·S}` (screen space, `S = unit·1.55·scale`). For each panel (score, then progress) ease an alpha `k` toward **0.3** while it intersects, else toward 1 (`k += (t−k)·min(1, dt·10)`). Wrap that panel's `_panel` and texts in `g.globalAlpha = k`. |
| 3 | `phone_newplanet`, `phone_banner`, `sheet_goal` t=29.6–30.8 | **The level banner covers the first held crate and the first landing.** The banner sits at `saucerScreenY + 1.75·unit` (render.js:612), which is exactly the hang height of the held crate. For 2.2 s the child can't see what they are about to drop. | render.js:612: `const y = L.groundY + (this.VH - L.groundY) * 0.5;`. This centres the banner on the empty ground strip (camera is 0 at level start; the strip is 140·u tall and the banner is 86). Also at :613 set `h = 76`. |

## P2 — should fix

| # | Screenshot | What's wrong | Fix |
|---|---|---|---|
| 4 | `g_guide` (`guide_{green,white,red}[_deutan].png`) | **The Easy drop guide is coded by hue only, and faintly.** At bar alpha 0.5 and line alpha 0.3–0.6, green `#9dffb0` and white are hard to tell apart even with normal vision. With deuteranopia, green, white and red all become the same grey-beige. | render.js:378: use `perfect '#ffe14d'` (bright, high luminance), `ok '#ffffff'`, `miss '#ff4d6d'`. render.js:385: bar alpha `easy ? 0.85 : 0.3`. Add a shape cue after :386: perfect → a 5-point `_star(g, p.x, ly-16, 7, col)`; miss → draw the bar dashed (`setLineDash([6,5])`, stroke only) and a small "✕" (two 8 px strokes) at its centre. render.js:382: `lineWidth = 3`. |
| 5 | `zoom_beam_dunes`, `desk_planet1/2/3`, `phone_play` | **The tractor beam reads as grey-black smoke with scanlines.** Translucent teal composited normally over maroon and violet skies turns grey. | render.js:462: inside the save, `g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55 + 0.15*Math.sin(this.time*9);`. Optionally, in `beam.svg`, drop the 3 ring ellipses' opacity 0.4 → 0.25. |
| 6 | `g_particles` (all four), `sheet_coin_grow` t=4.9–5.3 | **The first-play hint "Tap to drop the crate on the tower!" sits on the held crate's swing path.** It is placed at `tower.topY − 1.25·unit`, and the crate passes through the text on every swing. | render.js:601: draw it at `L.groundY - this.camY() + (this.VH - L.groundY) * 0.5` (on the ground strip, under the base), size `20*K`. |
| 7 | `sheet_coin_grow` t=5.24–5.31, `sheet_miss` t=23.3–23.5 | **"Juno grows bigger!" spawns on the falling crate.** It is placed at `saucerScreenY + 1.5·unit` (render.js:222), which is the fall lane, so it is drawn over the crate and the coin. | render.js:222: `x = clamp(s.x, 140, VW-140)` (follow the saucer), and `y = s.y - S*0.62` (just **above** the dome, where `S = L.unit*1.55*s.scale`). |
| 8 | `sheet_goal` t=25.95–26.4 | **Text pile-up at the goal.** "Perfect ×5!", "+100" and "Planet done!" overlap in the same 60 px for ~0.5 s. | render.js:228 (case 'goal'): first do `this.texts = this.texts.filter(t => t.key !== 'perfect' && !(!t.big && t.t < 0.3));`. At :231, put the bonus pop at `e.x + L.unit*0.9` and size 26. |
| 9 | `phone_goal`, `sheet_goal` t=27.1–27.6 | **The beacon flag (the goal moment) disappears under the HUD or off the top almost immediately.** The camera starts gliding down 0.75 s into the goal. In portrait, when the camera reaches the ground the flag (tower top − 1.2u) sits behind the progress panel. | world.js:83: `goalCamStart: 1.25`. Also fade both HUD panels to 0.35 alpha during `phase === 'goal' \|\| 'travel'`, reusing the P1-#2 alpha `k`. |
| 10 | `sheet_goal` t=28.7–29.2 | **Juno never boards the rocket.** The saucer stays on the left and blinks out at travel `phaseT > 0.5` (render.js:453) while the rocket leaves empty. This breaks the "rocket takes Juno to the next planet" story. | render.js:453–454: during `travel`, let `k = clamp(w.phaseT/0.5,0,1)`. Lerp the saucer x/y toward `w.rocket` (x, y − 0.2·u) with ease `k*k*(3-2k)` and scale `sc *= 1 - 0.75*k`, then hide it. |
| 11 | `desk_custom_play`, `phone_custom_filled` | **A custom crate photo is auto-set to "Round".** `isOpaque → circle` in assets.js:144 also applies to the crate slot. The crate then cover-crops a round sticker with a white ring, so you see arcs and a clipped "ABC". | assets.js:144: `if (slot.kind === 'char' && slot.id !== 'crate') …`. Default the crate to `'fit'`, because the renderer already frames it (render.js:339–346). |

## P3 — polish

| # | Screenshot | What's wrong | Fix |
|---|---|---|---|
| 12 | `phone_play` ("Juno grows bigger!" dark), `desk_planet1` ("+60" grey) | **Fading texts turn muddy.** The dark stroke and the fill fade together. | render.js:522–527: fill alpha `a`, stroke alpha `a*a` (set `g.globalAlpha` separately before `strokeText` and `fillText`). |
| 13 | `ipadL_play`, `desk_play`, `g_guide` | **Empty GROW coin pips look like brown/dark discs** (coin sprite at alpha 0.28). | render.js:591–593: when off, draw `g.beginPath(); g.arc(cx,cy,cs*0.42,0,TAU); g.strokeStyle='rgba(255,210,63,.45)'; g.lineWidth=1.5; g.stroke();` in place of the sprite. |
| 14 | `phone_play`, `phone_newplanet`, `ipadL_play`, `desk_planet1` | **Sky hero bodies sit behind the HUD panels** (moon behind the progress panel on phone, sun behind the score panel on iPad). The sky tile is scaled to VH and anchored at the top-left. | render.js:124: in portrait, render the sky tile at `k = VH/540` but offset it down by `(I.top + 200)` logical px, with the top filled by `info.dark`. Or move hero bodies in the portrait art. Low priority. |
| 15 | phone HUD (`phone_play`) | **"GROW" label is 9.6 css px and the zone name is 11 css px on iPhone.** | render.js:580 `13*K` → `15*K`; render.js:588 `11*K` → `13*K`. |
| 16 | `phone_over` / `zoom_over` | **The "NEW!" badge overlaps the last score digit, and white score digits on the lilac card are low contrast.** | style.css `.new-best`: `right:-0.6em; top:-0.9em`. `.sc b`: `color:#5b3fc4`, or keep white with a 2 px `#3a2a7a` text-stroke. |
| 17 | `phone_custom_filled` | **"Whole picture" and "Round" toggles have different widths and stack unevenly** in the 3-column slot cards. | style.css `.slot .seg` (or the toggle row): `display:grid;grid-template-columns:1fr 1fr;gap:4px`, `font-size:max(12px,…)`. |
| 18 | `desk_title`, `phone_title` | **The demo saucer drifts behind the logo**, and the phone tagline wraps with a lone "rocket!". | Title demo: offset the world's `saucerScreenY` by +0.25·VH while `mode==='title'`, or keep the demo in the lower third. Tagline: add `text-wrap: balance`. |
| 19 | `sheet_topple` t=25.75–26.4 | "Timber-r-r!" is clamped to x≥90 and drawn over the tumbling block. | render.js:211: place it at `L.cx ± 2·unit` on the side opposite the toppling crates (sign of their mean x − cx). |

## Checked and fine
- Crates vs every sky and ground, coins vs every planet: good separation. The base reads clearly against the moon ground (lighter value plus outline).
- Perfect: the ring, sparkles, combo text and squash are readable. Puffs are not dark (`puff.svg` is fine).
- Particle sprites at 26 px (`g_particles`) are clean; the disc problem is only in the sky art (P1-#1).
- Topple: the block rotates as one piece and comes apart naturally. Miss: a clear pivot on the corner, then the tumble.
- Coin flyer to the GROW meter, and Juno's grow pulse: smooth.
- Pause, Settings, How to Play and Change Pictures fit every viewport with no clipping. Touch fonts are ≥13 px thanks to the media-query floors.
- Custom hero (in the dome), custom coin (rim plus spin) and custom background (with vignette) all look fine.
- The planet crossfade at travel is clean. No seams in the sky/far tiles.
