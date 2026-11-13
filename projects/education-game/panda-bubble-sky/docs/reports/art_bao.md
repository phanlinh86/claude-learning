# Character artist A — Bao, surprises, icon (report)

Generator: `python3 tools/art_bao.py` (deterministic, 100 % original SVG) → `node tools/bao_sheet.js` (contact sheets + checks)
→ `node tools/render_icons.js` (home-screen PNGs).

## Files
- `game/assets/default/characters/bao_{idle,blink,talk,happy,cheer,think,oops,blow,wave,giggle,dance}.svg`, `bao_title.svg`
  (0 0 300 300), `bird.svg`, `bird_flap.svg` (0 0 120 100, centre (60,50), facing right), `kite.svg` (0 0 140 200, kite
  centre (70,70) = the bridle knot where the code string should attach).
- `game/assets/default/icon.svg` (512, full bleed: Bao blowing on a cloud under a pastel rainbow, bubbles with a red ball,
  a yellow rubber duck, a golden star) → `game/assets/icons/{apple-touch-icon,icon-192,icon-512}.png`.
- `game/js/bao_points.js` (node-safe, `window.PB` or `globalThis.PB`).
- `docs/art/bao_sheet.png` (all frames at 240 px on spring / summer / autumn / winter skies + 2.4× (720 px) with red
  crosses at feet / ring / blowRing and a magenta cross at the mouth), `docs/art/bao_overlay.png` (all 11 frames stacked —
  body crisp = identical), `docs/art/bao_surprise.png`, `docs/art/bao_icon.png`.

## PB.BAO_POINTS (viewBox 300 units)
```
{ feet: [150, 292], ring: [250, 120], blowRing: [214, 104], ringR: 26, mouth: [184, 148] }
```
- `mouth` is the rest mouth. In `blow` the head tilts −7° about the neck (140,180), so the pursed "o" is at ≈ (183, 142),
  just below-left of the blow ring — blow direction = up-right from the ring.
- Visible bottom (outline) = y 293 (the outline straddles the 292 anchor by ~1 px; sit Bao's cushion at feet as specified).

## Which frames move the wand
| frames | ring centre |
|---|---|
| idle, blink, talk, happy, think, oops, wave, giggle | (250,120) r 26 (rest, exact) |
| blow | (214,104) r 26 (exact) |
| cheer | (248,62) — wand held high |
| dance | (268,128) — arm out to the side |
| title | (256,74) + 6 small bubbles around |
If the integrator draws an animated wand film over the ring, use those centres; only rest + blow are in BAO_POINTS.

## Notes for the integrator
- Body (belly, charcoal shoulder band, legs, soles, tail, bandana) is pixel-identical in every frame (checked by
  `bao_sheet.js`: 0 differing px in the leg region); only head (eyes / mouth / brows / tilt: think +8°, oops −9°,
  blow −7°, giggle +5°, dance −6°, title −4°), arms and wand change — frames can be swapped without jumps.
- Blink = `bao_blink` (eyes closed only). Talk can alternate `bao_idle` / `bao_talk`.
- The ring film is drawn in the SVG (white 0.25 + iridescent rim); the world grows bubbles centred on `layout.bao.blowRing`.
- Palette is DESIGN §3 exact hex; no answer colour on Bao (tongue/cheeks are soft salmon `#EE9A92` / `#F4A7A0`).
- Bird back `#7F95B8` (muted slate), kite patches cream / peach `#F6C9A8` / mint `#BFE3CF` — none are answer colours.
- No `<text>`, fonts, scripts, filters or external refs; all SVGs validated as XML.

## Rounds
1. First pass: sheet showed a box-like bandana, V-shaped zigzag arms, a stray cheek outside the head, a puffed cheek that
   read as a pink ball.
2. Ribbon bandana tucked under the head with a small point; smoother, chubbier arms; think paw to the near chin; puffed
   cheek as a white bulge; bigger pupils.
3. Plumper body (wider), true charcoal legs / ears with a soft highlight, shorter lap arm; bird flap wing reshaped to a
   pointed swallow wing; icon fixed (duplicate attribute) and bubbles kept inside the frame.

References looked at (proportion / pose only, nothing copied): generic "how to draw a cute panda" guides (head ≈ half the
height, teardrop eye patches sloping down-outwards) and photos of children blowing soap bubbles (wand ring held in front
of the mouth, lips pursed, cheeks puffed).
