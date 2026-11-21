# Bibi's Cloud Drums — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.CD`**, storage prefix `cd:`. Classic `<script>` files, no build step,
node-safe at load (touch the DOM lazily). **The code base is a copy of `../../monkey-camp-chimes/`** (Kiki's Camp Chimes) with
`CC → CD`, `chime → drum`, `kiki → bibi`, `hedgehog → lamb` already replaced mechanically (so comments, i18n text and art still
talk about bells, beams, monkeys and campfires — that is what we are replacing). When a detail is missing here, keep doing
what the chime game does: read `../../monkey-camp-chimes/docs/DESIGN.md`, `MECHANICS.md`, `VOICE.md` (state machine, events,
judging "core vs rim", soft/assist/hint/idle, Talk time, chapter time limit, short rounds, prompt protection, test hooks).
**What changes is the world: hanging pendulum chimes → standing, bouncing cloud drums; counting → beating the big drum N times.**
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Kiki's Camp Chimes
| Kiki's Camp Chimes | Bibi's Cloud Drums |
|---|---|
| chimes hang on cords from a log beam and swing (pendulum) | **drums stand on little floating cloud cushions** across the middle band at staggered heights; a strike makes the drum **squash, hop up and land**, its **skin ripples**, the **cushion squishes**; a small tilt wobble away from the finger |
| counting: tap the string with N bells | ages ≤ 4: **beat mode** — ONE big drum + a number card (numeral + N dots); each beat lights a dot and is counted; the Nth beat completes the step. Age 5+: drums with N dots (choose) as before |
| lantern garland between two posts above the beam | a string of **star lanterns** across the sky (no posts), hung between two small clouds |
| campfire beside Kiki | a **cymbal on a stand** beside Bibi (decoration; crashes at the end of the song; tap = a soft crash, never progress, never a mistake) |
| Kiki the monkey | **Bibi**, an apricot puppy with floppy ears and two drumsticks, sitting on a cloud bottom-left |
| mountain campsite | **rainbow cloud land**: cloud hills, floating cloud islands, a faint rainbow, cloud cottages; morning → noon → sunset → starry night |
| hedgehog / songbird / fireflies | **cloud lamb** (tap → puffs up round, bounces) / **little bird** on the lantern string (tap → sings the last note) / night **twinkle stars** (tap → sparkle, zip off) — internal names stay `lamb`, `bird`, `fireflies` |
| song: one swipe strums a cascade | song: tap or swipe any drum → every drum bounces in a left→right wave (0.18 s apart), lanterns flash, then **cymbal crash** |
| chimes pulled up on their cords | drums **hop up and float away upward** (fade), cushions puff away |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space, y down. `ins` = safe-area insets (logical px). `hudKeep` boxes as before.
- `World.setViewport(W, H, ins)` computes `layout` (fields the renderer reads):
  ```
  layout = { W, H, ins, portrait, tall, phone, groundY, bubble, hud, hitPad,
    bibi:   { x, y (FEET), h, w },  bibiBox     // as Kiki (landscape x = ins.left + 118, h 230; portrait x = ins.left + 104, h 200)
    cymbal: { x, y (stand foot on the ground), s, w, h }, cymbalBox   // where the fire was (landscape bibi.x + 150; portrait right side)
    stage:  { x0, x1, y }     // the drum band: x range for pads; y = the mean cushion top
    pads:   [{ x, y }]        // per drum: cushion TOP centre (where the drum's bottom sits); n = drums of the round
    garland:{ x0, x1, y, sag }, lanterns: [{x, y}]   // star-lantern string across the top band, below the bubble
    band:   { x, y, w, h }    // the drum band box (assist / song presses anywhere in it)
    item:   112               // drum size (longest side) — ages ≤ 5: 112, 6+: 104; × 1.15 tall/phone if it fits
    cushion:{ w: 1.25 × item, h: 0.32 × item }
  }
  ```
- Landscape: garland y = bubble bottom + 46 (sag 22); pads between `x0 = ins.left + 250` and `x1 = W − ins.right − 40`, base
  cushion top `y ≈ groundY − 150` (so drum tops sit well below the lanterns: notes have room to fly), staggered heights
  (deterministic per round, ±28 px, neighbours differ ≥ 24 px). Portrait: x0 = ins.left + 36, x1 = W − ins.right − 36, the drum
  band sits in the middle third above Bibi's head (lowest drum body ≥ 40 px above Bibi's head top, cushion bottom ≥ 40 px above
  the ground); when 4–5 drums do not fit side by side use the zig-zag (alternate pads high / low by ≈ 1.05 × item) as the
  chime game did for cords. Tall portrait: items × 1.15 and the band moves down so drags/taps stay short.
- Beat mode: the single big drum (`size = item × 1.45`) stands on the pad nearest the stage centre; the **number card**
  (`w.card = {x, y, n, lit, pop, flash}`) floats above it: card centre y = drum top − 70 (never above garland y + 60).
- **Hit test:** circle at the body centre (current, bounced position) r = 0.6 × size + hitPad (14; phones/tall: so the hit
  diameter ≥ 184 logical ≈ 100 css px) + the cushion box under it; nearest centre wins. Core r = 0.42 × size + 8 (judged at once);
  rim = brush + defer, exactly as the chimes (`fairSwipe`). Bibi box → `pokeBibi`; cymbal box → `cymbalTap`. Surprises after drums.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Bluey, no Paw Patrol, no Snoopy,
  no Care Bears clouds, no Rainbow Brite, no Animal Crossing). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** `CD.PALETTE`: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`,
  pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). Below age 5 never blue+purple, red+green, yellow+orange, green+orange,
  red+orange in one round.
- **Neutral drum parts (never an answer colour):** skin cream `#FFF6E6` (shade `#EADBC0`, line `#B89B72`); hoops/rims **silver-pearl**
  `#E4E6EE` / dark `#9AA0B4` / light `#FFFFFF`; tension cords cream `#F6EBD3`; neutral wood body (animal / dots / glyph / big
  drum) `#C99466` / dark `#8E5F3A` / light `#E9C29A`; brass for the cymbal `#D8B26A` / `#9C7838` / `#F3DFAE`.
- **Bibi** (`bibi`): a small round puppy, fur **warm apricot `#E7B07A`** (shade `#C98E57`, outline `#8A5A34`), cream muzzle and
  belly `#FBEBD3` (shade `#E8D2B2`), floppy ears darker `#B9784A`, a black-brown button nose `#4A3226`, big round eyes (`#2F2A3A`
  pupils, catch-lights), rosy cheeks `#F2A99A`, a short wagging tail, a **white sailor collar with slate trim `#5B6478`**. Holds
  two **drumsticks** (wood `#D9B48A`, cream ball tips `#FFF6E6`). Never wears an answer colour.
- **Rainbow cloud land** (calm and pastel so the drums pop; keep saturation well below the answer colours):
  far = big soft cloud mountains, floating cloud islands with tiny pastel trees, a **faint** rainbow (alpha ≤ 0.35, desaturated);
  mid = rounded cloud hills, little cloud cottages with round windows, pastel puffball trees; ground = a soft cloud floor
  (white-lavender `#F4F1FA` / shade `#DCD6EC`) with tiny star flowers. Moods (`morning | noon | sunset | night`):
  morning: sky `#FAD6E0 → #FFF1E4` (pink dawn), low sun left; noon: sky `#8FD0F4 → #E2F5FD`, sun high, puffy clouds;
  sunset: sky `#C98BC0 → #FFC9A0 → #FFE7C2`, sun low right, golden cloud rims; night: sky `#1F2550 → #44508A`, crescent moon,
  star field, cloud hills deep blue-lilac, cottage windows glowing warm.
  **Night readability:** drums are drawn un-tinted with a soft moonlight rim; only far/mid/ground carry the darkness.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Bibi, surprise animals & icon — character artist A (`tools/art_bibi.py`, rewrite of the Kiki generator)
| File | viewBox | Notes |
|---|---|---|
| `characters/bibi_{idle,blink,talk,happy,cheer,think,oops,wave,point,dance,beat}.svg` | 0 0 300 300 | Bibi 3/4 view facing RIGHT (towards the drums), eyes on the child, sitting on the ground, **feet anchor (150, 292)**, identical body in every frame; idle holds both sticks; happy = big smile, tongue; cheer = both sticks up, eyes ^^; think = stick tip on chin; oops = "hmm?" head tilt (never sad); talk = mouth open; wave = paw waving high (sticks in the other paw); point = stick pointing up-right; dance = ears flying, one paw up, tail wag; **beat** = both sticks down in a strike (alternated with idle while drumming) |
| `characters/bibi_full_wave.svg` | 0 0 300 300 | title pose: waving with a stick, a small drum beside him (neutral wood drum) |
| `characters/lamb.svg`, `characters/lamb_ball.svg` | 0 0 160 120 | a fluffy cloud lamb (wool white-lilac `#F4F1FA` with lilac shade `#D9D2EC`, face/legs soft grey `#8C8AA0`), facing RIGHT, bottom anchor (80, 116); ball = puffed up into a round woolly ball, tiny face peeking |
| `characters/bird.svg`, `characters/bird_sing.svg` | 0 0 120 100 | a small round bird (soft grey-blue `#A9B4C2`, cream belly), facing LEFT, feet anchor (60, 96); sing = beak open, head up, 2 tiny song lines |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep |
| `icon.svg` | 0 0 512 512 | Bibi drumming on a red cloud drum on a cloud, pastel rainbow sky, full bleed, opaque, no text |
Also write `docs/art/bibi_hand.json` (stick tips per frame) and `docs/art/bibi_bbox.json` like the Kiki generator did.

### 4.2 Drum art (canvas code) — character artist B: `game/js/drum_art.js` → `CD.DrumArt` (rewrite of the chime art)
Pure canvas, Path2D cached per thing+size, node-safe. **Anchor: origin = the BOTTOM CENTRE of the drum (where it sits on the
cushion), the body extends UP (−y); `size` = the longest side of the body.**
```
CD.DrumArt.drawDrum(ctx, thing, size, opt)
  // thing = { kind, color?, shape?, n?, animal?, text?, big? }
  // opt = { glow 0..1 (soft gold halo), ring 0..1 (just struck: rim flash + 2–3 expanding sound rings from the skin, decaying),
  //         dull 0|1 (a wrong strike: no flash, just the wobble), sq (vertical squash, 1 = rest; e.g. 0.82 on impact — width
  //         grows 1/√sq, bottom stays at the anchor), skin 0..1 + skinPh rad (membrane ripple: the top skin ellipse bulges/dips
  //         with amplitude skin × 0.06 size and concentric ripple lines), dim 0..1, night 0..1 (moonlight rim, never darkens
  //         the body), pop 0..1 (scale for appear/leave), count -1|0..n (dots drum: first `count` dots get a white ring),
  //         sing 0..1 (animal mouth open) }
  //  kind 'drum'   : a tom drum — cylinder body in thing.color (base/dark/light), the cream skin top seen in perspective
  //                  (ellipse ≈ 0.28 × width tall), silver-pearl hoops top & bottom, cream zig-zag tension cords; w ≈ size,
  //                  h ≈ 0.86 × size
  //  kind 'shape'  : a cream-bodied drum (#FFF6E6 body, silver hoops) with a BIG shape emblem in thing.color on the front
  //                  (CD.SHAPES = circle, square, triangle, star, heart, rect, diamond, oval; emblem ≥ 55 % of the front height;
  //                  outlines in the colour's dark tone); shapes must be unmistakable at 112 px
  //  kind 'big'    : the big bass drum for beat mode: neutral wood body with a gold star emblem, deeper (h ≈ 0.95 × size),
  //                  a little stand of two legs; its skin ripples strongly
  //  kind 'dots'   : a wood drum with thing.n (1–12) red #E84A4A dots on a cream front panel, ten-frame-ish grid, countable
  //  kind 'animal' : thing.animal (CD.ANIMALS = cow, duck, cat, pig, frog, sheep, hen, mouse) PEEKING over a small wood drum:
  //                  head + two paws/wings resting on the rim, in its natural colours (not answer-saturated), white sticker
  //                  outline 5 px; the total (animal + drum) fits size; opt.sing opens the mouth wide + 2 little song lines
  //  kind 'glyph'  : a wood drum with a cream front panel and a chunky letter / number thing.text (1–2 chars) in thing.color or
  //                  `#5B6B9A`; font '900 …px ui-rounded, "Arial Rounded MT Bold", Nunito, "Arial Black", system-ui'
CD.DrumArt.bodyBox(thing, size) → { w, h, cy }    // visible box; cy = body centre offset from the anchor (NEGATIVE: above)
CD.DrumArt.drawCushion(ctx, x, y, w, opt)          // a floating cloud cushion, origin = its TOP centre (drum sits there);
                                                   //   opt { dent 0..1 (squish under a strike: top flattens/dips, sides bulge),
                                                   //   t (gentle puff wobble), night 0..1, alpha, pop 0..1 }; height ≈ 0.26 w,
                                                   //   a soft lilac underside shadow, white-lilac (never an answer colour)
CD.DrumArt.drawGarland(ctx, garland, lanterns, opt) // a thin silver string between two tiny clouds at garland.x0/x1 (sagging),
                                                   //   star lanterns lanterns[i] = {x, y, lit 0..1, color|null, swing, flash}:
                                                   //   unlit = pale cream star outline; lit = glowing star filled with the light
                                                   //   tone of the colour (gold when null), sparkle on flash. opt {t, night}
CD.DrumArt.drawCymbal(ctx, cym, opt)               // brass cymbal on a slim silver stand, origin = stand foot; opt { tilt rad
                                                   //   (swing after a crash), ring 0..1 (shimmer rings), night, t }
CD.DrumArt.drawCard(ctx, x, y, n, opt)             // beat-mode number card, origin = CENTRE: rounded cream card with a big numeral n
                                                   //   (1–5; up to 12 supported) and n dots under it; opt { lit (dots lit so far,
                                                   //   lit dots turn gold + bigger), pop 0..1, flash 0..1, size (card height, ≈ 150) }
CD.DrumArt.drawNote(ctx, x, y, size, opt)          // glowing music note (paths, no font), opt { color (answer key | null → gold), alpha, rot }
CD.DrumArt.drawIcon(ctx, thing, size)              // Talk-time / previews, origin = CENTRE: any drum thing (centred), plus
                                                   //   'number' {n} (big numeral + n dots), 'color' {color} (paint blob),
                                                   //   'size' {big} (a big or small drum), 'sound' {animal} (the animal's head)
CD.DrumArt.drawGhostHand(ctx, size, press)         // friendly pointing hand, origin = fingertip
CD.DrumArt.drawFirefly(ctx, x, y, r, glow)         // night surprise: a tiny 5-point twinkle star with a soft pale-gold glow `#FFF3B0`
```
Contact sheets (`tools/drum_sheet.js` → `docs/art/drum_*.png`): every kind × colour / shape / animal / n / glyph at 112 and 3×,
ring/skin/sq states, glow, count, on morning / noon / sunset / night backgrounds; cushion dents; garland 0/2/3 lit; cymbal; card.
`tests/unit/drum_art.test.js` (node, mock 2D context): every kind draws without throwing, bodyBox ≤ size and cy < 0, all
functions exist.

### 4.3 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
For `m ∈ morning|noon|sunset|night` (same file names as the chime game so `render.js` / `assets.js` keep working):
- `env/far_<m>.svg` (0 0 1200 720): cloud mountains, floating islands, faint rainbow arc (only morning/noon/sunset, faint),
  bottom-anchored, horizontally tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): cloud hills, 2 cloud cottages (night: warm windows), puffball trees; tileable.
- `env/ground_<m>.svg` (0 0 1200 260): the cloud floor with soft bumps and tiny star flowers; tileable; the top 40 px is the edge.
- `env/sun.svg`, `env/moon.svg` (0 0 200 200, no face), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140), `env/rainbow.svg`
  (0 0 600 300, soft pastel arc for the celebration).
- Particles (0 0 32 32): `mist`, `mote`, `sparkle`, `star`, `ember` (→ a tiny pastel puff for sunset), `firefly`, `leaf` (→ a
  pastel petal for the noon breeze), `butterfly`, `confetti_a`, `confetti_b`, `dot`, `dust` (cloud puff), `note`.
- `tools/env_scenes.js` exports `RECIPE` (layer heights, sky colours, sun/moon positions per mood, tall ×1.36 rule, star density)
  + composed scenes at 1556×720, 960×720, 720×1556 per mood and a seam test into `docs/art/`. Update the RECIPE tables in
  `game/js/render.js` header (`SKY`, `GROUND_BOTTOM`, `SUN`, `MOON`, `CLOUDS`, `ENV`) to match — the env artist may edit ONLY
  those constant tables at the top of render.js.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `drum_art.js` (+ `tools/drum_sheet.js`, `tests/unit/drum_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_bibi.py`, `tools/bibi_sheet.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | lead |

### 5.1 Content (`content.js`)
As the chime game, with these changes:
- `CD.ANIMALS = ['cow','duck','cat','pig','frog','sheep','hen','mouse']` (each has a sound word in both languages; Bibi is the
  dog, so no dog). Animal steps: `p.animals {animal}` — the prompt uses the animal's **sound** ("Who says moo? Tap the cow!").
- Thing kinds: `drum` (colours, size), `shape` (shapes, shapes5), `big` (beat mode), `dots`, `animal`, `glyph`.
- `count` at ages ≤ 4 = **beat mode**: `round.drums = [ { id, thing: {kind:'big', nameKind:'number'…}, target: true } ]`,
  steps `{ mode: 'beat', targets: [bigId], need: n, promptKey: 'p.beat', params: {n} }`. Warm-up round: 2 steps n = 1, 2. Later:
  3 steps (2 when short), distinct n ∈ 1–5, at least one n ≥ 3, never the same n twice in a row across rounds. Age 5+ `count` =
  `dots` drums (find) as before (prompt `p.count`). Age 3 never gets count.
- Notes: each step gets the next pentatonic note (the song climbs); in beat mode every beat plays the big drum's boom.

### 5.2 `CD.World`
Public API, states, phases, events, judging, soft/assist/hint/idle, Talk time, surprises timing: **unchanged from the chime game**
(see its MECHANICS.md) unless stated. Changes:
- `w.drums[] = { id, thing, note, target, padX, padY (cushion top incl. idle bob), x, y (drum ANCHOR = bottom centre = pad top −
  hop), cx, cy (body centre), size, state 'enter'|'stand'|'out'|'gone', done, ring, glow, dull, sq, skin, skinPh, tilt, dent
  (cushion squish 0..1), cushionPop 0..1, count -1..n, dim, pop, alpha, + _px _py _psq _ptilt _pdent _pskin }`. Remove the
  pendulum (`theta/omega/cord/L/spin/clap`) and the beam/posts/hooks.
- **Drum physics:** strike → `hop` velocity up (peak ≈ 22 px for a tap, 30 for a strong swipe, 14 for a brush), gravity 2600
  px/s², lands back on the cushion: on landing `sq` kick (spring ω ≈ 18, ζ ≈ 0.3, impact sq ≈ 0.8) + `dent` kick (cushion spring
  ω ≈ 12, ζ ≈ 0.35) + a little dust puff event (`land {id, x, y}`); at the strike itself `sq` dips first (0.86) — anticipation,
  then the hop. `skin` = 1 on strike, decays in ≈ 0.6 s, `skinPh` advances at ≈ 40 rad/s. `tilt` spring (ω ≈ 9, ζ ≈ 0.3) kicked
  ± 0.12 rad away from the finger's side. Idle: each cushion bobs (sin, ±3 px, period 2.6–3.4 s, per-drum phase) — the drum
  rides on it. Dull wrong strike: tilt wobble ×1.5, small hop, no ring flash.
- **enter** (≈ 1.2 s): cushions puff in (cushionPop 0 → 1 with overshoot, 0.1 s stagger), then drums fall from above the top edge
  onto them one by one 0.14 s apart (free fall, land squash + dent), event `drumIn {id, i, x, y}` on landing, then `ask`.
- **beat step** (`mode:'beat'`): `w.card` appears (pop) above the big drum at the ask. Each judged-or-not strike of the big drum
  ≥ `beatGap` 0.2 s after the last counted beat → `count {id, i (1-based), n, x, y}`, card.lit = i, card flash; faster strikes are
  brushes (they boom but do not count). The strike with i === need → `right {…, count:{n}}` → note → lantern → `stepDone` as
  usual; the card pops away after 0.6 s. No `wrong` is possible in a beat step. Idle 4 s after a partial count → `beatNudge {i, n}`
  (counts as an idle nudge, backoff as idle). Taps elsewhere = soft (counts toward hint/assist as usual).
- **song**: `songAsk`; the first press/swipe touching ANY drum (or `songWait` 4 s → auto) starts the wave: every drum in left →
  right order struck 0.18 s apart (beat mode: the big drum ×3 in rhythm, 0.3 s apart), `songNote {id, i, note, x, y}` each, each
  lantern flashes in turn, then `cymbal {x, y}` 0.25 s after the last note (w.cymbal.tilt kick + ring), `songDone {auto}` 0.6 s
  later. Bibi `beat`/`idle` alternate while the wave plays, `cheer` at the crash.
- **out** (≈ 0.9 s): drums hop up (one last bounce) and float upward off the top with a slight sway, fading (alpha), distractors
  first; cushions puff away (cushionPop → 0); event `drumsOut`.
- `w.cymbal = { tilt, ring, _ptilt }`; tapping the cymbal box → event `cymbalTap {x, y}`, a small tilt kick; not soft, not progress.
- `w.card = { x, y, n, lit, pop, flash, _ppop } | null`.
- Surprises: lamb trots along the ground line (as the hedgehog did), tap → `lambTap`: ball (puffed) → it bounces twice (roll →
  a hop) and un-puffs. Bird lands on the garland string at a free spot between lanterns (never on a drum); tap → `birdTap
  {note}`. Night `fireflies` = twinkle stars drifting down between drums; tap → `fireflyTap`.
- Test hooks: `drumHit(id)`, `bibiHit()`, `stageHit()` → `{x0, x1, y, band}` (replaces `beamHit`), `cymbalHit()`, `lambHit()`,
  `birdHit()`, `fireflyHit()`, `answer()` → `{drum}` | `{song:true}` (in beat mode `answer()` keeps returning the big drum until
  the count is done), `_drumMidY()`. Statics: `World.padsFor(L, n)` (replaces hooksFor), `World.lanternsFor`, `World.bodyBox`.

### 5.3 `CD.Weather` — unchanged API (setWeather 0..3 crossfade, ambient incl. `fire` → keep the field name but it now means
"warm glow strength" used for the night cottage windows/cymbal rim; particles: morning mist + motes, noon petals + butterflies,
sunset pastel puffs + golden motes, night twinkle motes; `burst(x, y, {kind})`, `setParty`). Update its colours to §3.

### 5.4 `CD.Bot` — as before; in beat mode taps the big drum `need` times with 0.35–0.7 s gaps (skill < 1: sometimes pauses
mid-count, sometimes taps fast twice under beatGap).

## 6. Voice, language
As the chime game §6 with helper **Bibi** (EN "Bibi", VI "Cún Bibi" in titles, "Bibi" in lines), a cheerful puppy: pitch ≈ 1.2,
rate ≈ 0.9. Drum = "drum" / "trống"; verb EN "boom/tap the … drum", VI "gõ trống …". Things (VI): "trống màu đỏ", shape drums
"trống hình tròn / hình vuông / hình tam giác / ngôi sao / trái tim / hình chữ nhật / hình thoi / hình bầu dục", the big drum "trống
to", dots "trống có {n} chấm", animals "con bò, con vịt, con mèo, con heo, con ếch, con cừu, con gà mái, con chuột" with sounds
EN moo, quack, meow, oink, ribbit, baa, cluck, squeak / VI "ò ó"… use the sounds Vietnamese kindergartens use: bò "ùm bò", vịt
"cạp cạp", mèo "meo meo", heo "ụt ịt", ếch "ộp ộp", cừu "be be", gà mái "cục tác", chuột "chít chít".
I18N API as before plus: `p.beat {n}` ("Beat the big drum {n} times!" / "Bé gõ trống to {n} cái nhé!"; n = 1 → "once" / "một
cái"), `beatNudge {i, n}` ("Two! One more!" / "Hai rồi! Thêm một cái nữa!"), `sayCount(lang, i)` (just the number word),
`sayCountRun(lang, n, 'beat')` ("One, two, three!"), animal right `sayRight` = the sound + name ("Moo! The cow!" / "Ùm bò! Con bò!"),
`song[]` ("Now play our song — tap the drums!"), `songShort[]`, `songDone[]` ("What a band!"), `cymbal.tap[]` (rare, short "Crash!"),
`surprise.lamb` ("A fluffy cloud lamb!"), `lamb.tap`, `surprise.bird`, `bird.tap`, `surprise.fireflies` ("Little stars came to
listen!"), `firefly.tap`, `weather.0..3` ("Good morning, cloud land!", "Sunny noon!", "Sunset clouds!", "Starry night!"), logo
"Bibi's" / "Cloud Drums", VI "Cún Bibi" / "Trống Mây".

## 7. Integration (lead) — title (Bibi waving with a stick beside 3 cloud drums, ▶ Play, star total, language toggle, hold-⚙),
settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (Bibi dances, all star lanterns lit,
rainbow, confetti). Audio: drum booms tuned to the drum's note (membrane: sine with a fast pitch drop + a short noise slap; big
drum deeper; shape/glyph/dots drums a brighter tom; animal drum = boom + a tiny synthesized animal "voice" chirp), brush softer,
wrong = muffled "bumpf", count booms, lantern twinkle, note whoosh, cymbal crash (filtered noise + shimmer), cushion "poof",
lamb bleat-ish squeak, bird tweet, star twinkle, ambience per mood (morning birds, noon breeze, sunset wind chime-y pads, night
crickets), music bed per mood (soft marimba/kalimba plucks), ducked under speech and during the song.

## 8. Performance — ≤ 5 drums, Path2D cached per thing+size, ≤ 120 particles; adaptive quality as before.
