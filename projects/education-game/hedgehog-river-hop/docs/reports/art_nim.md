# Character artist A — Nim, fish, frog, icon

Generator: `tools/art_nim.py` (deterministic; re-run gives byte-identical files). Contact sheets: `node tools/nim_sheet.js`
→ `docs/art/nim_frames.png` (all 14 frames at 190 px on light sky / grass `#9CC98A` / dark `#3A4048`, then 3× with apple
circles at the back slots, feet + mouth crosses, the hit box and the roll circle) and `docs/art/nim_extras.png` (fish, frog
on water / grass / dark, title at 190 px + 420 px, icon at 512 / 180 / 60). The sheet script also prints a pixel check.

## What I drew
- **Nim** (0 0 300 300, feet (150, 290), 3/4 view facing right): a round baby hedgehog. Spine coat = a base ellipse
  (c 128,168, r 92×90) plus 24 soft petal-shaped tufts from the forehead over the back to the rump (shorter towards the
  bottom), outlined as one union silhouette (`#4E2F1D`), one-step cel shade `#6B4229` lower-right, two inner rows of open
  tuft marks for texture, tip highlights `#B88760`, one soft highlight upper-left. A forehead fringe of 4 tufts over a cream
  face (`#F6E3C8`) with a pointy snout, nose `#5A3A2E` with shine, big dark eyes `#2A1E1A` with two catch-lights, rosy cheeks
  `#F4A7A0`, round cream ears with pink insides poking out of the spines, cream chest, mustard scarf `#E3B65A` (outline
  `#A9812E`) with a knot and tails fluttering back, 4 tiny paws `#D9B48F`, stubby front paws.
- Standing frames share the identical coat, face, chest, scarf, ears and feet (pixel check: coat region diff = 0 vs idle
  for blink/talk/happy/think/oops/giggle; cheer/dance 2 px; wave/title differ only where the waving paw / apple sit). Only
  face features (eyes, brows, mouth; ≤ 8° tilt of the features about (232,176)), the front paws and (dance) one lifted
  foot change. idle, blink (closed arcs), talk (open mouth + tongue), happy (wide eyes, big smile), cheer (^^ eyes, both
  paws up), think (features tilt, paw at chin, brows), oops ("hmm?" round mouth, tilt, one paw up — never sad), wave (near
  paw up + motion arcs), giggle (^^, paw at mouth), dance (^^, one paw up, one out, a foot lifted), title (wave + an apple
  drawn at backSlot 0).
- **crouch** = the idle body with determined face, squashed `scale(1.02, 0.88)` about the feet (feet stay at 290).
- **jump** = stretched (0.95 × 1.07) and tilted up 7°, tufts bent back (spines flowing), scarf tails streaming, paws tucked,
  wide eyes + big open smile. Its lowest pixel is y 287 (tucked paws).
- **roll** = a spiky ball centred (150, 200), outer radius 88 (20 tufts round a r 66 core), the face peeking lower-right with
  a little fringe, open eyes, smile, nose, two tiny paws hugging the ball.
- **fish / fish_flip** (0 0 140 100, centre (70,50), facing right): round coral-peach `#F2A68A` body, cream belly, fins,
  big eye, blush, smile; flip = tilted up 24°, ^^ eye, open "o" mouth, 4 droplets.
- **frog / frog_croak** (0 0 140 120, feet (70,112)): chubby sage `#9FBF7A` frog with cream belly on a notched lily pad
  `#7FA86A`; croak = puffed pale throat sac, ^^ eyes.
- **icon.svg** (512, full bleed, opaque, no text): woodland sky + tree line, far bank, a muted teal brook (`#7FB8B4 →
  #4E8E95`), a golden stone he just left (ripples, droplets), two grey stones, a dotted hop arc, Nim mid-hop (the jump art
  ×1.12) with an apple on his spines. Reads at 60 px.

## NH.NIM_POINTS (game/js/nim_points.js)
```
feet: [150, 290]
backSlots: [[143, 83, 0.17], [98, 87, -0.35], [61, 113, -0.87], [43, 147, -1.33]]   // [x, y, rot RADIANS (outward tilt)]
crouchDy: 22        // slots move down this much in nim_crouch (per-slot exact: 0.12 × (290 − y), 17…25)
jumpDy: 2           // slots move by this in nim_jump (the stretch and the tilt almost cancel at the back)
rollC: [150, 200], rollR: 88, rollSlots: [[144, 130], [89, 165], [207, 160], [84, 224]]   // rotate them with rollRot
mouth: [264, 198]
box: [14, 50, 296, 292]
```
Back slots sit on the coat ellipse scaled to 88×86 at angles −80°, −110°, −140°, −166°, i.e. a fruit 46 units wide is
centred ~10 units inside the tuft tips, so it looks pressed into the spines with its top poking above the outline (checked
with apple circles on the 3× sheet). The order goes from the top of the back towards the rump; the first one is the most
visible (used by the title / icon apple). Wrapper matches `bao_points.js` (`window.NH` or `globalThis.NH`, node-safe).

## Checks
- Every SVG parses with `xml.etree`; no `<text>`, `<script>`, fonts, `href`, external `url()`, filters (0 blurs) or pure
  black; `width`/`height` = viewBox. Nim frames 14–26 KB, fish/frog 2–3 KB, icon 30 KB.
- Lowest opaque pixel of every standing frame + crouch = 291 (paw outline half-stroke below 290 — feet sit on 290); roll
  bottom 292 (ball edge 288 + outline); jump 287.
- Two improvement rounds after reading the sheets: (1) softer cel shade (no dark band behind the face), ears moved out of
  the fringe so they read, stubbier/thicker front paws, slots pulled 9 units into the spines, crouch narrowed so the nose
  stays inside the box, feet bottom at 290, fish side fin redrawn, icon re-composed (Nim smaller, bigger stones); (2) mouth
  re-placed under the snout (it read as a moustache), far cheek moved, texture marks extended so no flat area remains,
  icon near bank removed (it peeked oddly from under the golden stone).

## References consulted (look only, nothing copied)
General searches for "cute flat vector baby hedgehog / curled ball" and "cartoon frog on a lily pad" (stock-illustration
listings and how-to-draw pages, e.g. colormadehappy.com/how-to-draw-a-hedgehog, easydrawingguides.com/how-to-draw-a-cute-frog).
Used only for general proportions (round body, pointy snout, spines as a cape, frog eye bumps). No Sonic, no Beatrix
Potter, no Hedgehog in the Fog look; the scarf, tuft shapes and colours are our own.

## Known compromises / notes for the integrator
- `backSlots` rot is in radians. The 4th slot (rump) is tilted −1.33 rad, so a fruit there lies on its side — intended.
- Extra field `jumpDy` (not in DESIGN) added; `crouchDy` is the mean over the 4 slots (the art is a squash, not a shift).
- In-game the world also applies `sx/sy` squash on top of the crouch / jump frames; both are mild, so the sum stays cute.
- The roll ball's face is part of the art, so when the renderer spins it by `rollRot` the face spins too (looks like rolling).
- Fruits are drawn by code over Nim; they cover a few tufts — no "behind the spines" masking.
