# Puff's Volcano Catch — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.VC`**. Classic scripts, no build step.
Sister game with proven integration code to reuse: `projects/daily-game/penguin-candy-dash` (storage, assets, audio, render, ui, main, Go wrapper, tests). Copies of its integration files are already in `game/js/` and are being adapted by the integrator.

## 1. Lessons from basket catchers (keep / change)
| Classic catcher (Kaboom!-style, fruit catchers) | Puff's Volcano Catch |
|---|---|
| Items drop straight down from a moving dropper | Items fly in **ballistic arcs** from the crater (real gravity): you read the arc and run to the landing spot |
| One miss = lose a life | Missing a coin only resets the combo; only catching a sizzly rock costs a heart (forgiving for kids) |
| Flat score | **Combo multiplier ×1 → ×5** (the twist): steady catching is the skill |
| Instant paddle | Puff has gentle momentum, tilts with speed; the basket swings on ropes like a pendulum (feel), but the catch zone is generous |
| No escape tool | **Cool Rain** turns rocks above Puff into steam (recharging), a panic button that rewards timing |
| Endless sameness | 4 island zones with their own sky/volcano look, eruption pattern and ambient life; clear goal (pouch) every ~60–90 s |

## 2. Screen & coordinates
- Logical **960 × 540**, letter-boxed; y down; px; seconds. Static scene (no scrolling).
- **HUD band** y 0–64: hearts top-left, score + combo top-centre, coin pouch + rain meter top-right under the HUD buttons (pause/sound at top-right corner).
- **Crater mouth** (eruption origin): `(480, 210)`. Same on every zone and for custom backgrounds.
- **Ground line** (items land): y = **492**. Ground art top edge ≈ y 470–500, varied.
- **Puff**: body centre at `(x, 392)` + bob; x clamped to **70 … 890**.
- **Basket rim**: centre `(rimX, 446)`, catch half-width **38** px (+ item radius × 0.5). `rimX` = Puff x + small pendulum offset.
- Draw order: sky → clouds layer → volcano → back particles (smoke, crater glow) → flying items (back of basket) → ropes + Puff + basket → ground → front particles → fx → HUD.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration; never copy or trace; no known characters/brands). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px in a dark tone of the fill (never pure black), saturated but warm tropical palette, kid-friendly: nothing scary, nothing burns, lava is "glowy jelly". No `<text>`, fonts, scripts, filters that depend on external refs, or external images. `width`/`height` = viewBox. Transparent background unless stated. Side view, characters facing the viewer (Puff faces front, eyes can glance left/right in code via flip — keep the face symmetric).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `puff_idle.svg`, `puff_happy.svg`, `puff_ouch.svg`, `puff_blow.svg` | 0 0 120 100 | 96 × 80 | body centre (60, 50). A chubby white cloud sprite (lilac-blue shading, 5–6 round lumps), big eyes, rosy cheeks, tiny smile, two little stubby cloud-arms at the sides at y≈66 holding the ropes. **Body geometry identical across frames**; only face/arms change. happy = closed ^^ eyes + open smile; ouch = squeezed `> <` eyes, wobbly mouth (not crying); blow = puffed cheeks, "o" mouth (raining). Rope attach points: (34, 72) and (86, 72) in the viewBox. |
| `basket.svg` | 0 0 96 72 | 76 × 57 | woven wicker basket, open top seen slightly from above (front rim + back rim ellipse). Rim centre (48, 16); hang points (10, 16) and (86, 16). |
| `basket_front.svg` | 0 0 96 72 | same | ONLY the front half of the rim + front weave (transparent elsewhere), drawn OVER items that are inside the basket so coins appear to drop in. |
| `coin_copper.svg`, `coin_silver.svg`, `coin_gold.svg` | 0 0 48 48 | 28 / 30 / 34 | round pirate coin face, centre (24,24), embossed simple original motif (copper: shell, silver: palm, gold: star + extra sparkle). Code spins coins by scaling x. |
| `rock.svg`, `rock_2.svg` | 0 0 48 48 | 34 | "sizzly rock": dark plum-brown rounded pebble with glowing orange cracks and a little heat shimmer; two shape variants. Readable vs coins at a glance (dark, not round-shiny). No face. |
| `heart_full.svg`, `heart_empty.svg` | 0 0 48 48 | 28 | HUD |
| `drop.svg` | 0 0 48 48 | 28 | raindrop icon for the Cool Rain meter / touch button |
| `pouch.svg` | 0 0 64 72 | 46 × 52 | cloth coin pouch with drawstring; code draws the fill bar beside it |
| `icon.svg` | 0 0 256 256 | app icon | Puff + basket + a gold coin on a round turquoise badge with a tiny volcano; readable at 32 px |

### 4.2 Zones (environment artist) — `zones/<beach|jungle|ash|crater>/`
| File | viewBox | Use |
|---|---|---|
| `sky.svg` | 0 0 960 540 | **opaque**: sky gradient + horizon (sea / far islands / dunes). Keep y 300–470 (Puff's band) calm and mid-toned so a WHITE cloud and gold/silver/copper coins pop. |
| `clouds.svg` | 0 0 960 220 | transparent, **horizontally tileable** soft cloud strip drawn at y 20, drifting left at 6 px/s (parallax). Low contrast, must not look like Puff (flat, wispy, no outline). |
| `volcano.svg` | 0 0 960 540 | transparent: the island volcano, same cone silhouette for all zones, crater mouth centred at **(480, 210)** about 90 px wide, base spanning ~x 180–780 down to y ≈ 480. Decorated per zone (beach: green-brown with palms at the foot; jungle: lush green slopes; ash: grey-lilac ash slopes; crater: dark with glowing lava ribbons). Optional sleepy, gentle face made of rock shapes is OK (friendly). |
| `ground.svg` | 0 0 960 540 | transparent above the shore: foreground ground strip, top edge around y 470–500 (avg 492), with beach sand / jungle ferns / ash dunes / dark rock + glow pools. Low detail in the strip under Puff. |

Palette per zone: beach = turquoise/sand/morning blue; jungle = greens/teal noon; ash = orange-peach sunset sky with lilac-grey ash; crater = navy night, warm orange lava glows. Avoid large flat white, gold or dark plum areas in y 280–480 (Puff, coins and rocks must read).

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, ~transparent edges)
`smoke.svg` (soft grey-white puff), `ember.svg` (warm glowing dot), `ash.svg` (grey flake), `leaf.svg` (green tropical leaf), `sparkle.svg` (4-point twinkle), `rain.svg` (one elongated raindrop), `steam.svg` (white curly wisp), `firefly.svg` (yellow-green glow), `butterfly.svg` (small, wings open), `star.svg` (small twinkle star for the night sky).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` **[integration]**

### 5.1 `VC.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
```js
VC.CONFIG = { ... }                  // all tunables with units + rationale comments
VC.DIFFICULTY = { easy:{...}, normal:{}, hard:{...} }   // overrides of CONFIG keys
const w = new VC.World({ seed, config });   // config overrides VC.CONFIG
w.reset();          // level 0 (beach), score 0, full hearts, state 'ready'
w.startLevel(i);    // zone = i % 4, lap = floor(i / 4); clears items, keeps score/hearts/combo
w.setMove(mx);      // keyboard axis −1..1 (call every frame; 0 = none)
w.setTarget(x);     // pointer-follow target x in logical coords, or null
w.action();         // Cool Rain if charged
w.update(dt); w.drainEvents();
// state
w.state            // 'ready' (~1.4 s intro, no eruptions) | 'playing' | 'cleared' (~2.2 s celebration) | 'dead'
w.level, w.zone /*0..3*/, w.lap, w.time, w.levelTime
w.score, w.hearts, w.heartsMax, w.combo, w.mult /*1..5*/, w.bestCombo
w.pouch, w.pouchTarget, w.coinsTotal, w.rocksCaught, w.steamed, w.missed
w.rain  { charge /*0..1*/, active /*s left, 0 = off*/, x /*column centre*/, w /*column width*/ }
w.volcano { rumble /*0..1 telegraph*/, glow /*0..1*/, shake /*px*/ }
w.puff  { x, y, vx, tilt /*rad*/, bob, swing /*basket pendulum angle rad*/, rimX, rimY, frame /*'idle'|'happy'|'ouch'|'blow'*/, invuln /*s*/, squash /*0..1 catch squish*/ }
w.items [{ id, kind /*'coin'|'rock'*/, metal /*'copper'|'silver'|'gold' for coins*/, value, x, y, vx, vy, rot, spin /*coin flip phase*/, r /*radius*/, state /*'fly'|'caught'|'ground'|'steam'*/, t /*time in state*/, alpha }]
w.cfg;  // and `_px,_py` on puff and items, saved at the start of each fixed step (render interpolation)
```
Events: `start`, `zone {zone, level}` (each level start incl. 0), `rumble {n}`, `erupt {x,y,n}`, `catch {x,y,metal,value,points,combo,mult}`, `multup {mult}`, `miss {x,y}` (coin hit the ground; combo reset if combo > 0), `ouch {x,y,hearts}`, `rockland {x,y}`, `rain {x}`, `steam {x,y,points}`, `raincharged`, `pouchfull`, `cleared {bonus,level}`, `dead {score}`.

Rules/feel:
- Puff: acceleration toward input (keys: accel ~2400 px/s², max ~400 px/s; pointer-follow: critically damped spring with max speed cap, stops within ~3 px, never overshoots badly). tilt eases toward −vx·k (lean into motion, max ±0.28 rad). Bob = gentle sine (2 px, 0.6 Hz) — rendering only, NOT used for catching. Basket swing = damped pendulum driven by Puff's acceleration (lag feel), `rimX = x + sin(swing)·L` with L≈50, swing clamped ±0.35.
- Eruptions: rumble telegraph (0.5–0.7 s) then launch 1–3 items. Choose a landing x in [90, 870] (spread, avoid making 2 coins in one burst impossible: if a burst has 2+ coins, they land ≤ 260 px apart or ≥ 0.6 s apart); solve launch velocity for apex height in a zone-dependent range and gravity `g` (≈ 520 px/s²). Flight time ~1.6–2.4 s on level 1 (readable), shorter later. Coins spin; rocks tumble.
- Catch test: item moving down crosses `rimY` within `catchHalfW + r·0.5` of `rimX` → state 'caught' (drops into the basket over 0.25 s, then removed). Items hitting the ground: coins bounce once (restitution ~0.35) then fade over 0.6 s; rocks thud + fizzle.
- Combo: +1 per coin caught; `mult` from thresholds `[0, 5, 12, 22, 35]` → ×1..×5. Coin miss → combo 0, mult 1 (`miss`). Rock caught → combo 0, hearts −1, `invuln` 1.2 s (rocks caught during invuln fizzle harmlessly), frame 'ouch'.
- Cool Rain: when `charge >= 1`, action starts rain for 1.2 s; column width 130 centred on Puff, following Puff; any rock in flight inside the column and above Puff turns to 'steam' (+5). charge refills over `rainRecharge` s (normal 7, easy 5).
- Mix per zone (normal): beach rocks 0% for first 20 s then 6%; jungle 14%; ash 22%; crater 28%; gold ≈ 6%, silver ≈ 25%. Burst interval shrinks per zone & lap (e.g. 1.9 s → 1.2 s). Pouch targets 20/25/30/35 (easy 14/18/22/26). Lap ≥ 1: +8% speed and more rocks, capped.
- Pouch full → `pouchfull`, eruptions stop, remaining rocks auto-steam, state 'cleared' (bonus hearts × 100, `cleared`), next level after ~2.2 s.
- Level 1 on Normal must be very winnable for a 6-year-old.

### 5.2 `VC.Weather` — `new VC.Weather({width,height,seed})`, `setZone(z,{instant})` (alias `setSeason`), `update(dt,{volcano, rain})`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front',color?}`, `ambient {tint,fog}`. Sprites from §4.3 (names without `.svg`) + `'dot'`. Always: soft smoke puffs rising from the crater (back), more and darker while `volcano.rumble` is high. Beach: sparkles on the sea band (y 300–380, back) + a few drifting sparkles; jungle: leaves tumbling (pendulum sway + rotation, front/back depth) + 2–3 butterflies; ash: ash flakes drifting with a sideways wind, depth layers; crater: embers rising from the volcano + fireflies + twinkling stars (back, y < 200). Bounded particle counts (< 160).

### 5.3 `VC.Bot` — `new VC.Bot(world, {skill, seed})`, `bot.step(dt)` drives `setMove`/`setTarget`/`action`: predicts each flying item's crossing of `rimY`, picks the best reachable coin plan (value, combo, time), avoids rock landing spots, uses Cool Rain when a rock will land within reach and can't be dodged; skill < 1 adds reaction delay + aim noise. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`; `window.VC.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i) }`.

## 6. Customisation slots
`hero` (Puff, all frames; procedural bob/squash keeps it alive), `coin` (all metals use it; metal shown by a coloured ring), `rock` (both variants; glow ring added by code), `bg_beach|bg_jungle|bg_ash|bg_crater` (replaces sky + clouds + volcano; crater glow and smoke still come from (480,210)). Same storage/processing rules as the sister games.

## 7. Performance rules (from day one)
Pixel-exact full-screen layer blits, render interpolation, pre-warm the next zone in idle time, backing store capped at 1920×1080 + adaptive quality + debounced resize, cached gradients, no per-frame allocations in hot loops where easy.
