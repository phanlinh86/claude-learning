# Ziggy's Apple Castle — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.AC`. Storage prefix `kac:`. Exe `ZiggysAppleCastle.exe`, port 47627.
Scaffolded from `../fox-moon-stack` (same genre, proven code); everything below overrides it.
Fantasy in one sentence: **it must FEEL like dropping a heavy wooden crate that thunks onto a wobbly tower while the sky slowly turns to night — and every perfect drop lights a cosy lantern.**

## 1. Lessons from stack games (keep / change)
| Reference idea (Tower Bloxx, "Stack", crane drop games) | Keep | Change for us |
|---|---|---|
| A swinging crane / mover above the tower, one tap to release | ✔ | Ziggy's hover-rocket swings with smooth sine motion (eases at the edges like a pendulum) |
| The tower sways and leans | ✔ | real centre-of-mass rule + a damped spring sway; perfect drops never add lean |
| "Stack" trims the overhang each drop | ✘ | crates are never cut: they land whole, or tip off when their centre is past the edge |
| Instant game over on one miss | ✘ | 3 hearts (Easy 5); a miss costs one heart; 5 apples = a pie = +1 heart |
| Perfect-drop combo | ✔ | perfect snaps the crate to centre, ding pitch rises with combo, **and hangs a lantern** |
| Endless, same look | ✘ | four times of day with a crate goal each; light changes continuously (the twist) |

## 2. Screen, camera & coordinates
Unchanged from fox-moon-stack (see `World.computeLayout`): logical view `VW×VH` from `Renderer.computeView`; px, seconds, y down; world coords with `screenY = worldY − camY` (camY ≤ 0 as the tower rises). `layout {width, height, portrait, unit, groundY, saucerScreenY, topLine, crateW0, crateH0, swingA, cx}`. Base (stone plinth) at `cx`, width `2.4·unit`, height `0.64·unit`.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands or mascots — Ziggy must not resemble any famous cartoon cat (no Hello-Kitty bow-and-no-mouth, no Garfield, no Pusheen shape); Granny Boo must not resemble Casper or Boo from Mario). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (viewBox units given) in a dark tone of the fill (never pure black). **Haunted-but-cute** = cosy and silly: round smiling ghosts, bats with no fangs and rosy cheeks, smiling jack-o'-lanterns, crooked friendly turrets, nothing scary, no skulls, no blood, no spiders with many eyes. No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:** crates are warm honey wood `#d9a066` (shade `#a86a3a`, outline `#6b3f1f`) with one bright painted band per style; apples are red `#ff4d4d` with a green leaf; Ziggy is a cream-and-ginger kitten (`#ffb15c` patches on `#fff3e0`) in a mint-teal hover-rocket `#3fd6c0`. Backgrounds (castle stone lilac-grey `#8f86b8`, hedges, sky) stay **less saturated** than crates and apples; the column above the base (x = cx ± 1.5·unit) must stay calm in `far` (no bright props there). Night must still be readable: the night palette is deep blue-violet, never black.

## 4. Assets (paths relative to `game/assets/default/`; old fox-moon-stack files are replaced or deleted)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `ziggy_idle.svg`, `ziggy_drop.svg`, `ziggy_happy.svg`, `ziggy_oops.svg` | 0 0 160 160 | `1.55·unit` square | Ziggy: a round cream kitten with ginger patches (one ginger ear, a ginger patch over one eye), pink nose, big shiny eyes, rosy cheeks, whiskers, a tiny round brass explorer helmet with goggles pushed up. She sits in a chubby mint-teal hover-rocket seen from the front (barrel body, white rim stripe, 3 little round portholes/lights, two small side fins); her striped ginger tail curls over the rim on one side. A little **lantern-hook nozzle** under the rocket glows warm yellow. **Body centre (80, 78). Lantern emitter at (80, 140).** Frames: idle (smile, ears up); drop (paws on a lever, "o" mouth, emitter brighter); happy (^^ eyes, open smile, ears perked); oops (eyes squeezed, wavy mouth, sweat drop, ears down). Rocket geometry identical in all frames. |
| `beam.svg` | 0 0 80 120 | stretched from emitter to crate top, width ≈ crate width | Ziggy's warm "lantern glow" that holds the crate: translucent golden-yellow cone `#ffd98a`, narrow at the top (x 30–50 at y 0), wide at the bottom (x 0–80), 3 faint sparkle rings, alpha ≤ 0.45, no outline (drawn additive). |
| `crate_0.svg` … `crate_3.svg` | 0 0 120 80 | `crateW × crateH` (fills the viewBox) | wooden apple crates (honey planks with 2 plank lines, darker corner posts, rounded corners r ≤ 8, 3 px outline inset 1.5 px; the silhouette is the full box). One bright painted band + stencil per style: 0 red `#ff5a5a` band + apple stencil; 1 leaf green `#4ccf6a` + leaf; 2 sunflower `#ffc93c` + sun; 3 sky `#58b4ff` + moon. A row of 3 apple tops peeks over the top edge? **NO** — keep the top edge flat (crates stack on it). No faces. |
| `lantern.svg` | 0 0 48 64 | `0.34·unit × 0.45·unit` | a small round paper/brass lantern hanging from a short hook at (24, 0): warm glowing body `#ffcf5a` with a bright core, brass cap and base. Hung on the side face of perfect crates. |
| `apple_0.svg`, `apple_1.svg` | 0 0 64 64 | `0.42·unit` | floating apple, centre (32, 34): shiny red `#ff4d4d` (shade `#c22d3a`, outline `#7a1b26`), brown stem, green leaf `#5ccf5c`, a big highlight. Frame 1 = same apple, leaf flipped up (flutter). The renderer alternates the frames and bobs/rotates. |
| `apple_glow.svg` | 0 0 64 64 | `0.9·unit` | soft round warm-red/yellow halo (radial gradient, alpha ≤ 0.5, no outline) drawn under apples when it is dark. |
| `base.svg` | 0 0 240 64 | `2.4·unit × 0.64·unit` | a stone plinth / old well top: lilac-grey stones, moss tufts, a carved apple; its flat top is the line y = 4 (the first crate sits there). |
| `flag.svg` | 0 0 64 128 | `0.6·unit × 1.2·unit` | goal pennant: thin pole from (12,124) up to (12,14), a little round lantern on top, a triangular pennant (pink) with an apple mark. Base anchor (12, 124). |
| `ghost.svg`, `ghost_wave.svg` | 0 0 96 160 | `0.9·unit × 1.5·unit` | **Granny Boo**: a round, friendly white-lilac ghost `#f4f0ff` (shade `#cfc6f0`, outline `#7d70b3`) with a wavy hem, little round glasses, rosy cheeks, a kind smile, a tiny pink bonnet, holding a pie dish. Centre (48, 80), hem bottom ≈ y 152. `ghost_wave` = same body, one arm waving. Replaces rocket/flame. |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | full = pink-red `#ff5c8a` + highlight; empty = outline only, lilac at 50 %. |
| `pie.svg` | 0 0 64 48 | HUD icon 28 | a golden apple pie with a lattice top (used in the HUD apple counter and the pie toast). |
| `icon.svg` | 0 0 256 256 | app icon | Ziggy's face in her rocket holding an apple, above 2 crates, on a round deep-violet badge with a crescent moon and a cute castle turret. Readable at 32 px. |

### 4.2 Times of day (environment artist) — `levels/<zone>/` with zone ∈ `dawn`, `noon`, `sunset`, `night`
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen height (scaled VH/540), tiles horizontally, drifts 3 px/s, fixed vertically | **opaque**. dawn = peach→pink→pale lilac gradient, a rising sun glow at the horizon, soft clouds; noon = clear blue with fluffy white clouds and a small sun; sunset = orange→rose→violet with long cloud bands and a big low sun; night = deep blue-violet `#1b1e4a`→`#3a3478` with stars and a big friendly crescent moon (may smile). Tileable. Keep x 380–580 at y 150–540 calm. |
| `far.svg` | 0 0 960 540 | full height, tiles, sinks by `−camY·0.15` | transparent above ≈ y 300; the castle on a hill: rounded crooked turrets with cone roofs and pennants, battlements, little windows (dark in the day, **warm yellow lit at sunset and night**), a stone bridge; dawn also misty hedges, noon a flag-topped keep, sunset bats' perches, night a shy ghost peeking from one window. Low contrast, darker than the ground. Tileable. Opaque at y > 500. |
| `ground.svg` | 0 0 960 180 | width `960·unit/100`, height `180·unit/100`, repeated, centred (svg x 480 = `cx`), its line y = 40 at world `groundY` | courtyard: cobblestones / grass, surface line at **y = 40**, flat and clear for x 300–660; opaque below. Side props on the surface: dawn = apple tree with apples, sleepy smiling pumpkins, a hedge; noon = a well-bucket, apple baskets, a striped tent flag; sunset = a smiling jack-o'-lantern, a broom leaning on a barrel; night = lit jack-o'-lanterns, a lamp post, mushrooms. Props never above y 0. Report `groundBottom` hex per zone. |
Dominant palettes: dawn `#ffcfb0`/`#f7a6c0` (ground soft green `#8fbf7a`); noon `#7cc8ff`/`#d8f0ff` (ground `#7fc26a`); sunset `#ff9a5a`/`#a05a9a` (ground `#7a8a5a`); night `#1b1e4a`/`#3a3478` (ground `#3e4a6a`).

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`star`, `sparkle`, `puff` (soft white), `heart`, `spark` (tiny warm spark), `applebit` (tiny red apple chip / leaf for bursts), `petal` (pink blossom petal), `leaf` (orange-red autumn leaf), `mist` (very soft wide white blob), `bat_0`, `bat_1` (cute lilac-grey bat, wings up/down, rosy cheeks, no fangs), `firefly` (yellow-green glowing dot with halo), `wisp` (tiny friendly ghost wisp).

## 5. Code architecture (`game/js/`, classic scripts on `window.AC`)
`rng.js`, `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, css (integrator). `extras.js` is the shared mobile layer (do not edit).

### 5.1 `AC.World` — fox-moon-stack's World with these changes
Everything in fox-moon-stack DESIGN §5.1 still holds (phases, `saucer` object = Ziggy's hover-rocket, `held`, `crates`, `tower`, `predictLanding`, `swayOffset[Lerp]`, `setLayout`, `gotoLevel`, `setTower`, camera, sway, COM topples, assist, scoring for crates), except:
- **Removed: grow/shrink.** No `grow`, `growCoins`, `saucer.scale` stays 1 (keep the field = 1 so render code is simple). Events `grow`/`shrink` gone.
- **Coins → apples.** `world.apples` (total collected, number), `world.appleList[]` `{id, x, y, prevX, prevY, r, t, frame (0|1), rot, state:'float'|'collected'|'gone', glow (bool: collected/spawned while dark)}`. Event `{type:'apple', apple, x, y, total, points, glow}`. Points: `CONFIG.applePoints` 5, or `CONFIG.appleGlowPoints` 10 when `light < CONFIG.glowBelow` (0.5).
- **Pies:** `world.pieApples` (0..4); every `CONFIG.pieEvery` (5) apples → event `{type:'pie', hearts, gained (bool)}`, +1 heart up to `maxHearts`. (Replaces grow.) `stats.pies`.
- **Light (the twist):** zones `CONFIG.zones = [{key:'dawn', light:0.85, ...}, {key:'noon', light:1.0}, {key:'sunset', light:0.55}, {key:'night', light:0.3}]` (plus g, swingW, drag, appleChance, goal per zone, like the planets). `world.light` (0..1) = ambient light now: it eases from the current zone's `light` toward the **next** zone's light (night → `nightEnd` 0.24) with tower progress `placed/goal` (smoothstep), and eases (rate ≈1/s) rather than jumping. `world.dayT` = zone + progress (0..4, continuous, for the renderer's sky tint). `world.lightTint` = zone key whose tint applies.
- **Lanterns:** a perfect landing sets `crate.lantern = true`, `crate.lanternSide = ±1` (alternating) and emits `{type:'lantern', crate}`. `world.lights()` → array of `{x, y, r, a}` in **world** coords (pure, no RNG): Ziggy's lantern (at the emitter, r = `2.0·unit`, a 1), the held crate (r 1.1·unit, a 0.6), every lantern crate still in the tower (r `1.5·unit`, a 0.9; only the top 10 lanterns), floating apples when dark (r 0.55·unit, a 0.5), the goal flag lantern (r 1.2·unit). The renderer cuts these out of the darkness.
- **Visibility helps:** `predictLanding()` additionally returns `lit` (0..1: how much light is at the top crate = max over lights falloff, plus ambient). The bot's reaction noise grows when `lit` is low (`CONFIG.darkNoise`), so lanterns matter in sims too.
- **Goal:** `rocket` → `ghost {x, y, prevX, prevY, state:'in'|'hover'|'out', t, wave (bool)}`: Granny Boo floats in from the side (ease-out arc) to beside the tower top, hovers with a bob while waving (`wave` true in the middle of the show), then floats up out of view in `travel`. Events `{type:'ghost'}` (arrives) and `{type:'goal', x, y, bonus}`. Goal bonus `100 × (zone+1) × (loop+1)`.
- **State summary** `getState()` adds `light, dayT, apples, pieApples, lanterns` (count in tower).
- First level (dawn) is easy for a 6-year-old; Easy: slow swing, wide crates, big perfect zone, 5 hearts.

### 5.2 `AC.Weather` — same API as fox-moon-stack (`setLevel(zone,{instant})`, `resize`, `update(dt, camY)`, `burst`, `particles[]`, `ambient {tint}`), per zone: dawn = slow drifting mist puffs (back layer) + pink blossom petals falling with pendulum sway; noon = autumn leaves tumbling (rotation + side-to-side flutter), occasional sparkle glints; sunset = small bats flapping (2-frame `bat_0/bat_1`, sinusoidal flight paths left↔right in the back layer, a few cross the front band away from the tower column) + some leaves; night = fireflies (wander with smooth noise, blink alpha), twinkling sparkles, a shooting star every 6–10 s, an occasional `wisp` drifting up in the back. Particles may carry `glow: true` (fireflies, wisps): the renderer draws them **above** the darkness layer so they shine at night. Front-layer particles avoid `cx ± 1.6·unit`. Bounded counts (< 140).

### 5.3 `AC.Bot` — as before (`new AC.Bot(world, {skill, seed})`, `step(dt)`), apples instead of coins, `lit` adds noise.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.AC.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), drop() }`. Test flags are never saved.

## 6. Rendering of light (integrator)
- After drawing the scene (sky, far, ground, tower, apples, Ziggy, particles of layer `back`/`front`), draw a **darkness layer**: an offscreen canvas at the backing-store size, filled with the zone tint at alpha `(1 − light)·0.82` (dawn tint `rgba(70,30,80)`, noon none, sunset `rgba(80,30,60)`, night `rgba(12,14,48)`; blend the tint by `dayT`), then `destination-out` radial gradients for each `world.lights()` entry (screen coords via camY, soft falloff), then composite over the scene. Then draw glow things on top: lantern cores, apple glows (when dark), `glow` particles, castle-window glints. Then HUD.
- Keep it cheap: the darkness canvas can be rendered at ½ resolution and upscaled (it is blurry anyway); skip it entirely when `light > 0.97`.
- Sky tint: in addition, crossfade the next zone's `sky` with alpha = progress·0.5 late in a level (optional, only if cheap and pre-warmed).
- HUD: score, hearts, apple counter with a pie icon (`pieApples`/5), crates `placed/goal`, a small sun/moon dial showing `dayT`.

## 7. Customisation slots
`hero` (Ziggy + rocket: a custom picture drawn inside a procedural mint rocket ring with portholes, with bob), `crate`, `apple` (drawn round with a red rim; bob + rotate), `bg_dawn`, `bg_noon`, `bg_sunset`, `bg_night` (a full-scene photo replaces sky+far; the ground strip stays; the darkness layer still applies).

## 8. Audio (WebAudio, synthesized)
SFX: drop "whoop", wooden crate thunk, perfect "clunk-ding" rising with combo + a soft lantern "bloom" chime, edge creak, miss "boing-tumble", topple soft clatter, apple "crunch-pling" (brighter when glow), pie fanfare (oven ding), heart lost, goal: Granny Boo's "woo-hoo" (soft sine glide, friendly), level-up, game over gentle tune, best score, click. Music: cosy castle tunes per time of day (dawn music box + bird chirps, noon bouncy pizzicato/marimba, sunset warm accordion-like pad, night soft celesta lullaby with an owl hoot), crossfade on level change. iOS loudness via `shared/daily-mobile/apply.py` (already applied in the scaffold's audio.js — keep it).

## 9. Mobile (iPhone / iPad)
Same platform layer as the other daily games (already in the scaffold): viewport-fit, safe-area probe, rotate prompt, pointer events with capture, ghost-click guard, kid-proofing, visibilitychange pause, letterbox filled with scenery, home-screen icons from `tools/render_mobile_icons.js`.
