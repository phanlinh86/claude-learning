# Environment art report: Bao's Bubble Sky

Generator: `tools/art_env.js`. Recipe and previews: `tools/env_scenes.js`. All art is original flat SVG. The two web searches (pastel floating-island illustrations, seasonal pastel palettes) were used for mood reference only.

## Files
- `env/{far,mid,ground,cushion}_{spring,summer,autumn,winter}.svg`, plus `env/sun.svg`, `env/moon.svg`, `env/cloud_a.svg` and `env/cloud_b.svg`. Total size is about 260 KB.
- Particles: all 13 existing ones are kept. `leaf` is now a muted amber autumn leaf and `petal` is a pale blossom petal. Three are new: `snow`, `blossom` and `glint`.
- Every SVG passes the checks: no `<text>`, no script, no external refs, at most one blur.
- Previews in `docs/art/`:
  - `env_{1556x720,960x720,720x1556}_<season>.png` (12 scenes, each with the cushion, a placeholder Bao, a painted rainbow arch and 5 bubbles)
  - `env_seams.png`
  - `env_sheet.png`

## Look
- **far:** a hazy sea of clouds, a pale cloud castle on a cloud mound, 3 floating islands, and 7 tiny high islands. The islands have rock "carrot" undersides and tiny round trees. The high islands fill the tall-portrait sky; in landscape they sit behind the HUD.
- **mid:** a hazy back cloud bank and an outlined front bank, plus 3 small islands. One island has a waterfall, which becomes icicles in winter.
- **ground:** one row of round puffs with the top edge at about y 40–60. Rows 110–215 are plain and calm, and the bubbles float in front of them. Seasonal decoration sits only on the puff tops and below row 215.
- **cushion:** a puffy seat whose side puffs cradle Bao, on a smooth flat base, with a seasonal touch.
- **Seasons:** each season comes through the sky (exact DESIGN §3 colours), the cloud shade tint (lilac, blue, peach or cool grey), island tops and trees (blossom, green, amber/rust, snow/bare), and the decoration.

## RECIPE (copy into render.js from `tools/env_scenes.js`)
- **What to copy:** the `RECIPE` object literal, the pure functions `envLayout(W, H, ins, groundY)`, `tileXs`, `cushionRect(bao)` and `drawEnv(g, L, m, img, opt)`, and `const RECIPE_TABLES = RECIPE`.
- **Anchor:** everything hangs off the cloud floor. `L.floorY = groundY − 150` in landscape, `− 250` in portrait and `− 300` in tall portrait. Ground row 50 lands on `floorY`.
- **Layer placement:**
  - mid row 296 sits behind the floor: `mid.y = floorY + 24·kg − 296·km`.
  - far row 720 lands on mid row 236.
- **Scale:**
  - far: k = 0.9·kp; mid: k = kp. kp = 1.36 on tall portrait (H/W > 1.6), 1.15 on other portrait, 1 in landscape.
  - ground: kg = 1, 1.15 or 1.3 for the same three cases.
  - cushion: k = bao.h / 220.
- **Draw order** (`drawEnv`; `opt.part` 'back' draws steps 0–4, 'front' draws step 5):
  0. Sky: gradient `SKY[m]` from y 0 to `L.sky.y1`, filling the whole screen.
  1. Sun: `L.sun[m]` = {x, y, size, a} with a radial glow (warmer in autumn).
  2. Clouds: from `weather.clouds`, each cloud tinted with `CLOUDS[m].tint` via 'source-atop'. The band is `L.clouds.y0…y1`; portrait also uses a lower band `y1…y2`.
  3. far: tiled at `tileXs(L.far.x0, L.far.w, W)`.
  4. mid: tiled the same way.
  5. Then back particles and the rainbow, then ground. Fill `GROUND_BOTTOM[m]` below `L.ground.fillY` when it is less than H.
  6. Then the cushion at `cushionRect(layout.bao)` (anchor (150, 30) = Bao's feet), then Bao.
- **Season crossfade:** draw the old stack, then the new one at alpha = mix. Or cache each season's back stack offscreen.
- **Sun positions** (landscape; the x is pushed right of the speech bubble):

  | season | x | y | size | alpha |
  |---|---|---|---|---|
  | spring | 0.74 | 0.62 | 140 | 0.95 |
  | summer | 0.80 | 0.50 | 160 | 1 |
  | autumn | 0.86 | 0.95 (low, warm) | 170 | 0.95 |
  | winter | 0.68 | 0.70 | 120 | 0.8 (pale) |

  x is a fraction of the safe width; y is a fraction of the sky above `L.landY`. Portrait values are in `SUN.portrait`.
- **Particles per season** (`RECIPE.PARTICLES`):

  | season | back | front | n |
  |---|---|---|---|
  | spring | petal, blossom | petal, butterfly | 22 |
  | summer | mote, glint | glint, butterfly | 18 |
  | autumn | leaf (blown by the wind) | leaf | 20 |
  | winter | snow | snow, sparkle | 40 |

- **Numbers at the preview sizes:**

  | | groundY | floorY | far y | mid y | ground y | other |
  |---|---|---|---|---|---|---|
  | landscape H 720 | 706 | 556 | −128 | 284 | 506 | fillY 764 > H |
  | portrait 720×1556 | 1530 | 1230 | 299 (k 1.224) | 859 (k 1.36) | 1165 (k 1.3) | fill below 1500 |

## Checks (2 improvement rounds after the first render)
1. **Round 1:**
   - Calmed the cloud banks: fewer, bigger puffs, no highlights on the far sea, softer ground highlights.
   - Moved the portrait cloud band below the speech bubble and added high islands, so the 720×1556 sky has no empty band.
   - Raised the cushion's side puffs so the cushion shows around Bao. In landscape the cushion is mostly below the screen edge.
   - Contrast is now sampled on the environment alone, before the rainbow is drawn.
2. **Round 2:**
   - Kept the new high islands fully off-screen above the landscape top edge, so no fragments are cut at y 0.
   - Gave the cushion a smooth flat base. Before, its bottom read as a row of balls.
   - Cushion scale changed to h/220.
- **Seams:** all 12 layers are OK. The seam difference (0.2–1.3) is at or below the layer's own average change from one pixel column to the next.
- **Contrast** of each answer colour against the background behind the bubble field, at the 2nd percentile over all seasons and viewports. WCAG uses whichever of the fill or its dark outline contrasts more; the second figure is the RGB distance of the fill.

  | colour | WCAG | RGB distance |
  |---|---|---|
  | red, blue, purple | 3.8–4.7 | 124–196 |
  | green | 2.7–3.0 | ≥ 131 |
  | orange | 2.3–2.6 | ≥ 124 |
  | pink | 2.3–2.6 | 65–85 (closest: spring's blush clouds) |
  | yellow | 1.5–1.7 | ≥ 98 (closest: autumn peach) |

  Yellow and pink read by hue and their dark outline, not by lightness. Visually every colour pops in every scene.
- **Saturation:** the strongest background chroma is 104, which is autumn's own sky top `#F3C28F` from DESIGN. Otherwise the background stays at 33–86. No answer colours appear in the background.

## Notes for the integrator
- On a 1556×720 screen, Bao's cushion is anchored on his feet at groundY − 4 = 702. Only its top about 50 px shows, which is intended.
- The far layer's castle is right of centre (`far.x0` puts far x 860 at 0.66·W). The rainbow arch overlaps it, which looks good.
- `drawEnv` takes `opt.cloudImg(kind, m)` so render can keep its cached, tinted cloud copies.
