# Lolo's Jungle Leaf Match — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.LL`**, storage prefix `ll:`. Classic `<script>` files, no build step.
The code base is a **copy of `../giraffe-city-windows/`** (Gigi's Peekaboo Windows: memory world with windows, building,
scroll, critters, voice, input, storage, loud audio, ui, main, tests) with `GW → LL`, `Gigi → Lolo`, `GigiArt → LoloArt`,
`WindowArt → LeafArt` already renamed by sed (so the copied `docs/MECHANICS.md` / `docs/VOICE.md` / comments still describe
GIGI'S game with the names swapped — the true reference is `../giraffe-city-windows/docs/{DESIGN,MECHANICS,VOICE}.md`).
**Keep the world API names** (`cards`, `phase`, `open`, `light`, `bloom`, `bounce`, `wiggle`, `glow`, events `flip/tap/match/
mismatch/hint/idle/clack/bloom/cheer/scroll/critter/…`, `w.building`, `w.prevBuilding`, `layout.grid.building`) so main, render
and the tests carry over. Target: iPhone + iPad Safari first, portrait and landscape. Short side 720 logical px.

## 1. What changes versus Gigi's Peekaboo Windows
| Gigi | Lolo |
|---|---|
| windows of an apartment building | **big leaves hanging on vines** from a giant jungle tree; `w.building` is now the **tree** (`LeafArt.drawTree`), the grid is the leaves |
| two shutters swing open (`open` 0..1.12) | **the leaf flips over on its stem**: `open` 0 = top side (green) … 1 = turned over (pale underside with the picture), up to 1.12 overshoot. Drawn as a 3-D turn about the leaf's vertical axis: `sx = cos(open·π)`; `sx ≥ 0` → front scaled by sx, `sx < 0` → back scaled by −sx. **Plus a pendulum `swing`** (rad) about the stem top |
| Gigi stands on the pavement, neck stretches to the window | **Lolo the little monkey sits on a mossy log** bottom-left; she **leans** (body rotates about the feet) and **points** (code-drawn arm) at the leaf that turned; her head tilts to look; tail curls |
| match → window lights, flower box blooms | match → both leaves **glow in a sunbeam** (`light` 0..1: warm golden rim + halo), an **orchid blooms on each stem** (`bloom` 0..1.2, at the stem just above the leaf), a **butterfly** flutters off each (renderer particle on the `bloom` event), faces hop |
| round done → bunting + confetti → street scroll, Gigi trots | round done → leaves sway in a wave, petals drift down from the branch (`cheer`), **Lolo backflips**, then the **scroll**: Lolo leaps to a vine and **swings across** (real pendulum arc) while the camera pans to the next tree; she lands on the new log with a squash |
| sunny → breezy → rain → rainbow | **morning → noon → sunset → starry night** (one per chapter) |
| surprises pigeon / bus / balloon, cars | surprises **toucan** (lands on a row vine), **frog** (hops along the jungle floor), **butterfly** (flutters up past the leaves). **No traffic** (`w.traffic = []`) |
| animals ↔ homes (`homes`) | **animal ↔ favourite food** (topic `food`) |

## 2. Layout (logical px; as Gigi unless stated)
- `groundY = H − ins.bottom − 90` = top of the jungle floor. Floor band from `groundY` to the bottom (the frog hops at
  `groundY + 52`).
- **Lolo** (`layout.lolo = {x, y, h}` feet anchor = where she sits on the log): landscape `x = ins.left + 110, y = groundY + 10,
  h = 150`; portrait `x = ins.left + 100, y = groundY + 12, h = 140`. The log (`env/log.svg`) is drawn under her: its seat top at
  her feet. Keep-out / hit box `layout.loloRect` = 1.25·h wide × 1.15·h tall above the feet (centred on x), plus 16 px keep-out
  from every leaf. Her pointing arm may reach over the keep-out margin but never over a leaf (clamp its length). No neck, no
  head reach: the board rules for Gigi's head (D6) collapse to "keep out of loloRect + 16 px".
- Bubble, HUD, boards, grid fitting, hit test (leaf rect + 10 px): as Gigi. Leaf card aspect w:h = **0.78**, min width 120 px
  (ages ≤ 4) / 104 px (5+), cap 210 px, gap x = max(18, 0.16·cw); **gap y = max(30, 0.26·cw)** (a vine and a stem live in it).
- **Row vines:** each row hangs from a vine that drapes across the tree at `vineY = rowTop − 0.62·gapY` (sag 0.06 of its length);
  each leaf hangs on a **stem** from the vine to its top: pivot `(c.x, c.y − c.h/2 − c.stem)`, `c.stem = 0.62·gapY`.
- **Tree** (`layout.grid.building = {x, y, w, h, roofH, pad, rows:[{y, x0, x1}], door:null}`): rect = grid rect grown by
  `pad = max(26, 0.24·cw)` on the sides and top, down to `groundY + 4`; the branch band `roofH = 0.34·cw` above (may run under
  the HUD/bubble: purely visual). Trunks stand along the left and right pad (may be drawn up to 0.6·pad wider outward). There is
  no door.
- **Scroll:** as Gigi: `w.scroll` camera x (parallax far 0.15, mid 0.4, tree/floor 1.0); old tree at `−scrollT·W`, new at
  `(1 − scrollT)·W`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character (no Curious George, no Abu, no Diddy Kong, no
  brand mascots), brand or logo.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill, never pure black. One-step cel shading + one soft highlight upper-left.
- Stickers (animals, foods): white sticker border ≈ 6 px + faint drop shadow inside the SVG (opacity .18, +3 y).
- SVG: no `<text>`, fonts, scripts or external refs; ≤ 1 light `feGaussianBlur`; `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark)**: red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`,
  green `#4CC26B`/`#2A8343`, orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, pink `#FF8FC0`/`#C9558A` (pink from age 6).
  Answer faces are drawn ONLY on the leaf's pale underside, so they never sit on a green leaf.
- **Lolo** (little monkey, original): fur warm cocoa `#9A6A45`, shade `#7E5534`, outline `#5A3A22`; face mask, ears inside,
  belly, hands and feet peach `#F6D2A8` (shade `#E8B988`); eyes `#2F2622` + catch-light; cheeks `#F5AFB4`; a long curly tail;
  a small **cyan-teal leaf bow** on one ear `#5FC7C9` / dark `#2F8D90` (not an answer colour). Big round ears, a tuft of hair.
- **Leaves** (closed side identical on every leaf of a tree — no memory cue): front from the set jungle green `#3E9A5E`/dark
  `#286B40`, teal leaf `#3A9488`/`#23645B`, lime-olive `#7AA845`/`#52762A`, deep fern `#4F8F3C`/`#33622A`, with lighter veins
  (mix 40 % white) and a soft upper-left highlight; **underside** (picture side) pale cream-green `#F3F6DF`, rim `#C9D9A8`,
  midrib faint. Lit (matched): rim warm gold `#FFE08A` + halo. Stems and vines `#6E8F3A` / dark `#46612A`.
- **Tree** (calmer, darker and less saturated than answer colours): bark from warm brown `#8A6A4E`/`#5E4532`, grey-brown
  `#7D7266`/`#544B42`, reddish `#8E5E4A`/`#5E3C2F`; moss `#8DBA6A`; orchids on the branch/stems from soft lilac `#E3C6F0`,
  white `#FFF7FB`, blush `#F7C9D6` (pastel, clearly NOT the answer purple/pink) with a yellow-cream centre.
- **Background** (environment): muted greens/teals, misty and lighter with distance; yellower/warmer than the leaves, never as
  saturated as an answer colour. Night: deep blue `#1E2A4A` sky, but foreground leaves stay readable (see §6.5 `glow`).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Lolo, critters, UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/lolo_body_sit.svg` | 0 0 256 256 | ¾ view facing RIGHT, sitting (legs forward, feet together), LEFT arm resting on the knee, NO right arm (code draws it) and NO tail (code draws it), NO head. **Feet / seat anchor (128, 244). Neck socket (128, 118). Shoulder (152, 136)** = right-arm root. **Tail root (84, 220)** |
| `characters/lolo_body_hop.svg` | 0 0 256 256 | same anchors, crouched-jump pose (knees tucked), left arm up |
| `characters/lolo_body_hang.svg` | 0 0 256 256 | hanging from a vine: BOTH arms up holding the vine at the **hand point (128, 18)**, body below, legs dangling slightly; neck socket (128, 118); tail root (84, 200); used during the vine swing (the head svg goes on it too) |
| `characters/lolo_head_{idle,blink,talk,happy,cheer,think,oops}.svg` | 0 0 192 192 | head facing ¾ RIGHT, big round ears, tuft, leaf bow on the left ear; **neck joint (96, 172)**. happy = big smile, cheer = eyes ^ ^ + open mouth, think = eyes up + mouth to one side, oops = gentle "hm?" (never sad), talk = open "o" mouth, blink = closed eyes |
| `characters/lolo_title.svg` | 0 0 320 480 | full Lolo hanging by her tail from a vine, waving, for the title screen (one piece) |
| `characters/toucan.svg`, `toucan_flap.svg` | 0 0 128 128 | small friendly toucan (black-blue body, cream bib, big rounded orange-yellow beak), feet anchor (64, 120), facing right; flap = wings up |
| `characters/frog.svg`, `frog_jump.svg` | 0 0 128 128 | round lime tree-frog with big eyes (green `#7CCB5A`, softer than answer green, cream belly, orange toes), feet anchor (64, 118); jump = legs stretched |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | gold star / grey outline star |
| `icon.svg` | 0 0 512 512 | full-bleed: Lolo peeking from behind a big flipped leaf with a picture on it, jungle-green background |
Artist A also owns **`game/js/lolo_art.js`** (`LL.LoloArt`, §6.3): arm + tail drawn by code and the anchors.

### 4.2 Leaves, tree, faces — character artist B: **`game/js/leaf_art.js`** (`LL.LeafArt`, §6.4), all code-drawn.

### 4.3 Animals and foods — character artist C (0 0 128 128, centred, ≈ 110 px, sticker border, must read at 70 px)
`items/animal_<panda|elephant|rabbit|squirrel|bee|bird|hippo|mouse>.svg` (baby panda, small grey-blue elephant (`#9FB2C8`,
not `blue`), white-grey bunny, red-brown squirrel with big tail (`#C97A45`, browner than `orange`), round bee, little robin-like
songbird (brown with a peach chest — not an answer colour), pink-grey hippo (`#B9A3B6`), grey mouse) and
`items/food_<bamboo|peanut|carrot|acorn|honey|worm|watermelon|cheese>.svg` (two bamboo stalks with leaves, two peanuts in shell,
a carrot with leaves, an acorn with cap, a honey pot with drip (no text), a cute smiling pink earthworm, a watermelon slice, a
wedge of cheese with holes). Pairs: panda–bamboo, elephant–peanut, rabbit–carrot, squirrel–acorn, bee–honey, bird–worm,
hippo–watermelon, mouse–cheese. Foods must show no animal; distinct silhouettes.

### 4.4 Environment — environment artist (bottom-anchored, **horizontally tileable**, transparent above)
Moods `m ∈ morning|noon|sunset|night`: `env/far_<m>.svg` (0 0 1200 420, parallax 0.15: misty hills, silhouettes of giant
rainforest trees, a distant waterfall), `env/mid_<m>.svg` (0 0 1200 360, parallax 0.4: big ferns, palms, banana plants, hanging
lianas, monstera bushes, a few soft flowers), `env/ground_<m>.svg` (0 0 1200 260: jungle floor — top edge ≈ y 40, drawn at
`groundY − 30` — moss, roots, pebbles, little mushrooms, grass tufts). morning: soft gold-pink light, mist bands; noon: bright,
saturated-but-calm greens, sun patches on the floor; sunset: orange/pink sky light, warm rim on leaves, long shadows; night:
deep blue-teal, moonlight rims, a few glowing mushrooms. Plus `env/sun.svg` (0 0 200 200), `env/moon.svg` (0 0 200 200,
crescent + soft face-free glow), `env/cloud1..3.svg` (0 0 300 160), `env/log.svg` (0 0 320 140, a mossy log Lolo sits on: seat
top centre (160, 34), bottom at 140; tileable not needed). Particles (0 0 32 32): `petal_a`, `petal_b` (orchid petals), `leaf_a`,
`leaf_b`, `pollen` (soft glowing dot), `firefly` (yellow-green glow dot with halo), `sparkle`, `star`, `puff`, `confetti_a`,
`confetti_b` (neutral, tinted by code).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `lolo_art.js` + `characters/*`, `ui/*`, `icon.svg` (generator `tools/art_lolo.py`, sheet `tools/lolo_sheet.js`, test `tests/unit/lolo_art.test.js`) | character artist A |
| `leaf_art.js` (+ `tests/unit/leaf_art.test.js`, sheet `tools/leaf_sheet.js`) | character artist B |
| `items/*` (generator `tools/art_animals.py`, sheet `tools/animals_sheet.js`) | character artist C |
| `env/*`, `particles/*` (generator `tools/art_env.js`, composed scenes `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*`, `tests/visual/*` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, lolo_art, leaf_art, render, ui, main.
Contact sheets / art PNGs go to `docs/art/`.

## 6. Module APIs
### 6.1 Content (`LL.Content`) — as Gigi with:
- `LL.ANIMALS = ['panda','elephant','rabbit','squirrel','bee','bird','hippo','mouse']`, `LL.FOODS = {panda:'bamboo',
  elephant:'peanut', rabbit:'carrot', squirrel:'acorn', bee:'honey', bird:'worm', hippo:'watermelon', mouse:'cheese'}`,
  `LL.FOOD_LIST`. Remove `HOMES` (keep no alias).
- `LL.THINGS = ['butterfly','balloon','flower','kite','cup','boot']` (colour rounds; ages ≤ 4 one thing for the whole round).
- `LL.AGE_TOPICS = {3:['colors','shapes','size','animals'], 4:['colors','shapes','count','food'], 5:['shapes','count','letters','food'],
  6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven']}`; `AGE_POOLS` as Gigi with `homes → food`.
- **`food`**: pair key `f:panda`; faces `{kind:'animal', value:'panda', sprite:'animal_panda'}` + `{kind:'food', value:'bamboo',
  sprite:'food_bamboo', animal:'panda'}`; name kinds `animal` / `food`; `match` event carries `animal, food`. Warm-up 2 pairs.
- `initial` words: en panda P, elephant E, rabbit R, squirrel S, bee B, bird B, hippo H, mouse M; vi gấu trúc G, voi V, sóc S,
  ong O, hà mã H (thỏ, chim, chuột skipped: digraphs) — as Gigi D8 (≤ words − 1 pairs).
- Talk `food`: "What does the {animal} love to eat?" — `show` = the animal face, 3 `food` choices with `sprite`.

### 6.2 `LL.World` — Gigi's world with these changes
- **Leaves** = `w.cards[]`, every field kept. `open` spring: ω **12**, ζ 0.45, stop at `openMax` 1.12 (bounce 0.3) — the flip is a
  bit slower than a shutter so the turn reads; 0.95 reached in ≤ 0.2 s (keep the bot / tests fast). Turning back: crossing 0 →
  `open = 0`, v × −0.25, event `clack {id, v}` (now a soft leaf "fwip"). Hint = open to 0.3 (the leaf lifts and twists a little)
  and back. New per leaf: `stem` (px), `px, py` = pivot (stem top on the vine), `swing` (rad) + `_pswing` + `vswing`: damped
  pendulum ω 4.2 (≈ 0.67 Hz), ζ 0.12, driven by: a flip/turn-back impulse (±0.9 rad/s, sign alternating with the slot), the
  wind (`w.wind`) as a small torque, and the cheer wave; clamp |swing| ≤ 0.14 rad. Hit test stays on the unrotated rect.
- **Match**: as Gigi (hold 0.25 s, `light` 0 → 1 in 0.4 s, `bloom` spring ω 14 ζ 0.45 → 1, 2 `bloom {id, x, y}` events 0.15 s apart
  with x, y = the **stem point just above the leaf top** (where the orchid opens), faces hop twice 12 px).
- **Tree**: `w.building = {bark, barkDark, moss, leaf, leafDark, vine, flower, kind:'kapok'|'fig'|'palm', seed}` (palette §3),
  never the same `leaf` or `bark` as the previous tree; `layout.grid.building.rows = [{y, x0, x1}]` the row vines (§2).
  `rect.door = null` always (delete Gigi's door placement; keep the field).
- **Cheer** (1.2 s): `w.cheer = sin(π t/1.2)`; every leaf gets a swing kick in slot order 0.06 s apart (a wave) and its face
  hops 10 px; `cheer {x, y}` at the branch centre (petals); Lolo **backflips** (`lolo.flipRot` 0 → −2π over 0.7 s with a 70 px
  ballistic jump, landing squash; event `backflip`).
- **Lolo** `w.lolo = {mood, moodT, hop, _phop, lean, _plean, armA, _parmA, armExt, lookX, lookY, blink, flipRot, _pflipRot,
  squash, tail, hang, vine}`:
  - `lean` (rad, rotate the whole body about the feet, + = toward the right): spring ω 8, ζ 0.5 to ±0.16 toward the target leaf
    for 3 s after a `flip`/`tap`/hint (then 0).
  - `armA` (rad, screen angle of the right arm from the shoulder; 0 = right, −π/2 = up) spring ω 10 ζ 0.5 to the angle from the
    shoulder to the target leaf's centre (rest 1.0 rad = down-forward on the knee); `armExt` 0..1 (spring) = how far it is raised;
    the renderer clamps the arm length so the hand never crosses into a leaf rect.
  - `lookX/lookY` = the target point (eyes/head tilt); `blink` 0/1; `tail` = phase (rad) for the tail curl wave.
  - `hop` (px, up) for happy hops (14 px), cheer hops; `squash` (−0.15..0.15) landing squash (scale y 1 − s, x 1 + s about feet).
  - **Vine swing during the scroll** (`phase 'scroll'`, `scrollTime` 1.6 s, may grow to ≤ 1.9 s): `lolo.hang = true` and
    `lolo.vine = {px, py, len, ang, _pang, hx, hy, _phx, _phy}`: a liana pivot fixed to the jungle at tree/floor parallax (so it
    scrolls with the camera) above the screen top; Lolo leaps up (0.2 s ballistic) to grab it at `(hx, hy)` = her hand point,
    swings as a real pendulum (gravity 980, small damping) forward, lets go near the forward end, flies on a ballistic arc and
    lands on the NEW log at her seat with `squash`. Choose pivot/len so she stays on screen, under the HUD and above the floor.
    Events `swing {phase:'leap'|'grab'|'release'|'land'}`. While hanging, the renderer draws the vine from (px, py) to (hx, hy) and
    the `hang` body with its hand point at (hx, hy), rotated by `ang`.
  - Hit box `layout.loloRect` (+ the hang body box while hanging); `pointerDown` → `'lolo'`.
  - Remove Gigi's neck/head fields and the head-avoidance code (`loloHead` may return the head box from the body, for tests).
- **Surprises** (round index 2 of each chapter, type rotates per session): `w.critter = {type:'toucan'|'frog'|'butterfly', x, y,
  _px, _py, rot, _prot, state, t, flap, face, sx, sy, …}`:
  - toucan (was pigeon): flies in on an arc, lands **on a row vine** (on the vine line between two leaves, swaying with it), hops
    along the vine every 8–14 s, bobs; tap → `kraa`, flaps off up and away.
  - frog (was bus): hops in from the left along the floor (`y = groundY + 52`) in ballistic hops (60–80 px long, apex 34 px, a
    hop every 0.6–0.9 s, landing squash), sits mid-screen 2.5 s with a throat puff `croak` 0..1 every 0.8 s, hops off right;
    tap → a big jump (apex 120 px, `rot` spin 0) + ribbit; drawn in front of the tree, behind Lolo.
  - butterfly (was balloon): rises from the floor in front of the leaves at 45 px/s on a wavy path (±26 px, 0.5 Hz) with `flap`
    phase 9 Hz, `color` = a palette colour not on the round's faces; tap → spirals up fast (+ sparkle) → gone.
  - `pointerDown` priorities as Gigi D2 (toucan/butterfly box → leaf → Lolo → frog).
- **Traffic removed**: `w.traffic = []` always (keep the field).
- Events added/changed: `swing {phase}`, `backflip {}`; `walk` removed; `clack` kept (leaf settles), `critter {critter, action,
  x, y}` with critter ∈ toucan/frog/butterfly, actions `enter, land (toucan), stop (frog), tap, leave, hop (frog, each hop)`.

### 6.3 `LL.LoloArt` (artist A, `lolo_art.js`)
```
LL.LoloArt.ANCHORS = { body: {w:256, h:256, feet:[128,244], socket:[128,118], shoulder:[152,136], tail:[84,220]},
                       hang: {w:256, h:256, hand:[128,18], socket:[128,118], tail:[84,200]},
                       head: {w:192, h:192, joint:[96,172]} }
LL.LoloArt.drawArm(ctx, sx, sy, ang, len, opt)    // right arm from the shoulder (sx, sy) at screen angle ang, length len (px):
     // a soft-bent tapered brown arm (fur colour, outline) with a peach hand; opt.point (bool: index finger out), opt.scale
LL.LoloArt.drawTail(ctx, x, y, h, phase, opt)     // long curly tail from the root (x, y), body height h, curl animated by phase;
     // opt.side ±1 (curls behind / left), opt.hang (tail hangs down-curl while hanging)
LL.LoloArt.headTilt(lean, lookX, lookY, x, y) → rad (≤ 0.3)   // small tilt of the head toward the look point
```
The renderer draws: log → tail → body svg (feet anchor, rotated by lean / flipRot about the body centre for the backflip,
squash) → head svg at the socket (joint anchor, tilted) → right arm. The arm is drawn last (in front).

### 6.4 `LL.LeafArt` (artist B, `leaf_art.js`) — node-safe at load, caches bitmaps per (face, size bucket, dpr)
```
LL.LeafArt.COLORS                                     // answer palette (as Gigi's WindowArt.COLORS)
LL.LeafArt.drawLeaf(ctx, w, h, face, open, opt)       // centred at 0,0 (the renderer already translated to the leaf centre and
     // rotated by the swing about the pivot). Draws the stem from (0, −h/2 − opt.stem) to the leaf top, then the leaf: a big
     // rounded heart/teardrop leaf filling w × h (tip down, slight asymmetry, veins), flipped as §1 (sx = cos(open·π); edge-on:
     // a thin bright edge line so it never vanishes). Back side: pale underside + the face (centred, ≈ 0.68·w) when sx < −0.05.
     // opt: {leaf:'#hex', leafDark, vine, stem px, light 0..1 (golden rim + halo, warm underside), glow 0..1 (hint halo),
     // bloom 0..1.2 (an orchid at the stem just above the leaf top, petals scaled by bloom; colour opt.flower), bounce px (face y),
     // wiggle rad (face rot), sprite(name, x, y, size) renderer callback for animal/food faces, night 0..1 (moon rim + soft inner
     // glow so a leaf reads on the night sky), alpha}
LL.LeafArt.drawFace(ctx, w, h, face, opt)             // the face alone (Talk-time choices, title)
LL.LeafArt.drawTree(ctx, rect, tree, opt)             // two trunks (roots on the floor), the thick mossy branch along the top
     // band (roofH) with a few leaf clusters + orchids, and the row vines `rect.rows` (draped, sag) — vines are drawn here, stems by
     // drawLeaf. opt: {light 0..1 (cheer glow), t (seconds, for a gentle vine sway), night 0..1, sway px}
LL.LeafArt.drawThing(ctx, obj, colorKey, size)        // butterfly | balloon | flower | kite | cup | boot in an answer colour
LL.LeafArt.drawButterfly(ctx, colorKey, size, flap)   // surprise / reward butterfly, flap = phase (rad); colorKey may be a hex
LL.LeafArt.drawGarland(ctx, x0, y0, x1, y1, t)        // a draped flower garland along the branch for the cheer (pastel)
LL.LeafArt.drawStar(ctx, size, text?)                 // as Gigi
```
Face kinds: `color` (drawThing), `shape`, `dots` (round berries/dots), `number`, `letter`, `text`, `animal` / `food` (sprite
callback), parity frame colour (odd blue, even orange ring), `size` (as Gigi: card.size small/big).

### 6.5 Weather (`LL.Weather`) — Gigi's API, moods 0 morning, 1 noon, 2 sunset, 3 night (crossfade 2.5 s)
`ambient = {skyTop, skyBottom, horizon, tint, wind, gust, sway, sun, sunX, sunY, moon, moonX, moonY, stars 0..1, darkness 0..1
(background only), night 0..1 (leaf night rim), mist 0..1, rays 0..1 (noon sunbeams), cloudSpeed, mood, rain 0, rainbow 0, wet 0}`.
morning: pale gold → soft blue sky, low sun at (0.2, 0.32), mist 0.7, dew sparkles + slow pollen; noon: clear blue, sun high
(0.75, 0.12), rays 1, a few falling leaves (`leaf_a/b`) and 2 dragonfly-ish darting sparkles; sunset: orange → pink → lilac sky,
sun low (0.82, 0.42), warm tint, darkness 0.15, flocks of 3–5 birds (`wx.birds = [{x, y, flap, s}]`, drawn as simple dark V
silhouettes by the renderer) flying right to left; night: `#1E2A4A → #3A4F7A`, moon (0.78, 0.16), stars 1, darkness 0.45,
night 1, ≤ 40 `firefly` particles drifting with a glow pulse (`a` blink), a few `pollen`. Cap 140 particles.
`burst(x, y, {kind: confetti|puff|sparkle|petals})` (`petals` = petal_a/b falling and fluttering, for the cheer).

### 6.6 Bot, test hooks — as Gigi (`LL.debug`; `cardScreen(id)` → CSS px rect; `loloScreen()`, `critterScreen()`).

## 7. Voice, language — as Gigi §7 with helper **Lolo** (bubble "Lolo" in both languages; Vietnamese speech says "Lô Lô"),
a bright, giggly little monkey: pitch ≈ 1.25, rate ≈ 0.9. VI title "Khỉ Lolo" / "Lật Lá Tìm Đôi". Names: panda "panda"/"gấu
trúc" (accept "gấu trúc", "gau truc"), elephant/"con voi", rabbit (say "bunny")/"con thỏ", squirrel/"con sóc", bee/"con ong",
bird/"con chim", hippo/"hà mã" (accept "con hà mã"), mouse/"con chuột"; foods bamboo "bamboo"/"cây tre" (accept "tre", "lá tre"),
peanut "peanuts"/"củ lạc" (accept "đậu phộng"), carrot/"củ cà rốt", acorn/"hạt dẻ", honey/"mật ong", worm "worms"/"con sâu",
watermelon/"dưa hấu", cheese/"phô mai"; things butterfly/con bướm, balloon/quả bóng bay, flower/bông hoa, kite/con diều,
cup/cái cốc, boot/chiếc ủng. Leaves: "leaf"/"chiếc lá".
Lines: `p.<topic>` (food: "Who eats what? Find each animal's favourite food!"), flip names ("A red butterfly!", "Bamboo!"),
`sayMatch` (food: "The panda loves bamboo!" / "Bạn gấu trúc thích ăn tre!"; bee: "The bee loves honey!" / "Bạn ong thích mật
ong!"), `sayMismatch` (kind), `peek[]` ("Look carefully!"), `hide[]` ("Now they turn back!"), `hint[]`, `idle[]`, `praise[]`,
`great[]`, `cheer[]` (tree done: "Every leaf is glowing!"), `swing[]` ("Wheee! To the next tree!"), `critter.toucan/frog/butterfly`,
`weather.0..3` ("Good morning, jungle!", "The sun is high — it's noon!", "Look — the sun is setting!", "Good night, stars! The
fireflies are out."), `talk.*` (incl. `talk.food`), `ui.*`, logo "Lolo's" / "Jungle Leaf Match", VI "Khỉ Lolo" / "Lật Lá Tìm Đôi".

## 8. Integration (lead)
Title (Lolo hanging by her tail from a vine next to three leaves that flip on their own), settings with volume, HUD, bubble,
pause with −/+, chapter banner, Talk time, session done (night jungle, every leaf glowing, fireflies, Lolo backflips). Audio:
loud chain (kept); SFX: leaf flip "swish" (rising), soft "fwip" when it turns back, name chime (marimba), match two-note
marimba + orchid "bloop-bloop", mismatch soft "hmm-hmm", cheer jungle fanfare (marimba + shaker) + petals, vine swing "wheee"
whoosh + landing thump, backflip "boing", toucan "kraa", frog "ribbit", butterfly twinkle; ambience: morning birds chirps, noon
cicada-like soft buzz (very quiet), sunset coos, night crickets; music per mood (marimba / kalimba).

## 9. Performance — ≤ 12 leaves, cached faces and leaf bitmaps per (colour, size, side), ≤ 140 particles, adaptive quality as Gigi.
