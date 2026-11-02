# Bim's Rainbow Rocket — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.RR`**. Classic `<script>` files, no build step. The code base started as
a copy of `../duckling-forest-memory/` (state machine, voice, input, storage, loud audio with volume, ui, main, tests) with
the namespace renamed `DM → RR` and the storage prefix `rr:`. **The card world is replaced by a rocket-hop world.** When a
detail is missing here, do what `../duckling-forest-memory/docs/DESIGN.md` does (layout rules, i18n/voice API, hooks, Talk time,
topic rotation between sessions, surprise round, idle auto-pause). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Dee's Forest Memory
| Dee's Forest Memory | Bim's Rainbow Rocket |
|---|---|
| tap two cards to find a pair | **tap the right cloud island (or drag a flight line from the rocket to it)**; the rocket flies there |
| Dee the duckling standing bottom-left | **Bim the baby elephant** (`bim`) sitting in the cockpit of a little rocket that moves around the screen |
| fairy forest, seasons | **rainbow cloud land**, **time of day = altitude**: morning → noon → sunset → starry night (islands become tiny planets) |
| static screen | **vertical journey**: the camera climbs one row per correct hop; a BOOST through a cloud bank between rounds |
| rewards perch in the forest | the collected token jumps into a **cloud wagon** towed by the rocket on a springy rope; at round end the wagon's items turn into the round's stars |

## 2. Screen, coordinates, camera
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
- **World space**: x as screen, y DOWN, unbounded upwards (negative). `w.camY` = world y of the screen top; screen y = world y − camY
  (render interpolates `_pcamY`). Every world object has world coordinates; the layout gives **screen-space** anchors.
- `World.setViewport(W, H, ins)` computes `layout` (screen space):
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, scale /* 1, or 1.2 when tall */,
    bubble: { x, y, w, h },     // landscape: x = ins.left + 24, y = ins.top + 20, h = 122, w = min(640, W - x - ins.right - 440)
                                // portrait: under the HUD: x = ins.left + 24, y = ins.top + 96 + 24, h = 124, w = W - x - ins.right - 24
    padY,                       // screen y of the launch pad's top surface: H - ins.bottom - (portrait ? 150 : 118)
    rowY,                       // screen y of the next row's island surface: landscape max(bubbleBottom + 175, 0.42·H) → ≈ 330 at 720;
                                // portrait ≈ 0.47·H (never closer than 0.30·H to padY)
    field: { x0, x1 },          // x range for island centres: ins.left + islandW·0.6 … W − ins.right − islandW·0.6
    islandW,                    // cloud width: 200 (age ≤ 4), 180 (5+), × scale; planet diameter = 0.8·islandW
    rocket: { h },              // rocket height 190 × scale (Bim's head inside the canopy)
    boost: { x, y, r }          // the BOOST button (canvas-drawn) centred on the rocket, r = 78
  }
  ```
- `world.hudKeep = {x, y, w, h}` (screen, set by main from the real DOM HUD + bubble): no island's token may sit under it.
- Islands of one row: centres spread across `field` (farthest-point/zig-zag), min centre distance `islandW + 28`, y jitter ±26
  (portrait: rows of ≥ 4 islands zig-zag ±70); a row never puts the answer straight above the rocket twice in a row.
- Hit test: island = ellipse (islandW/2 + 24, islandH/2 + 24) around the cloud **plus** the token's box + 24 px. Rocket = its
  box + 30 px. Islands are ≥ 28 px apart so hit areas never overlap.
- HUD buttons (DOM, top-right) occupy `x > W - ins.right - 160, y < ins.top + 96`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no patchwork elephant, no flying-ears
  elephant, no famous rocket designs).
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- Stickers: white sticker border (≈ 6 px) + faint drop shadow inside the SVG (opacity .18, +3 y).
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark)**: red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`,
  green `#4CC26B`/`#2A8343`, orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, pink `#FF8FC0`/`#C9558A` (answer from age 5).
- **Bim**: soft grey-lilac skin `#B8BED3`, shade `#9AA1BA`, outline `#6B7290`, inner ears and cheeks `#F6B8C8`, eyes `#2F2A3A`
  with catch-light, a short trunk curling up, tiny tusk-less, **mint scarf `#8FDCC6`/`#4FA88E`**, brown leather goggles
  `#B98552` with sky-tinted lenses `#DDF2FF` pushed up on the forehead. Bim never uses an answer colour.
- **Rocket**: cream body `#FFF4E2`, shade `#E9D7B9`, outline `#8A6E4E`; teal fins and nose band `#2FA7A0`/`#1E7A74`; gold rivets
  and canopy rim `#E8B44A`; glass canopy `#CFEFFF` at 55 % alpha drawn OVER Bim. Not red, not blue, not purple.
- **Clouds (islands)**: white `#FFFFFF`, shade lavender `#DCE2F6`, outline `#9AA6D1`, rosy rim light at sunset, cool at night.
  In a colour question the **whole cloud is the answer colour** (base + lighter puff highlights + dark outline).
  At night (stage 3) islands are **tiny round planets** (pastel `#F1E6FF` / `#DDEBFF` / `#FFE9D6` with a soft ring and two craters;
  in colour questions the planet is the answer colour).
- **Sky**: calm, pale, lower saturation than every answer colour: morning `#FFE3C9 → #A9DBF7`, noon `#7EC8F2 → #CDEBFB`,
  sunset `#FFB38A → #E7A2C4 → #9E8BD6`, night `#1D2556 → #3A2F6E`. Answer colours must keep ≥ 3:1 contrast against the sky
  behind them or carry their dark outline (they always do).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Bim, rocket & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/bim_{idle,blink,talk,happy,cheer,think,oops}.svg` | 0 0 256 256 | head + shoulders + arms of Bim as seen in the cockpit; identical head position in every frame; **neck anchor (128, 236)**; happy = trunk up + smile, cheer = both arms up + star eyes, think = trunk tip to chin, oops = "hmm?" one ear up (never sad) |
| `characters/bim_full_{wave,cheer}.svg` | 0 0 256 300 | whole Bim standing (title + party), feet anchor (128, 288) |
| `characters/rocket_back.svg` | 0 0 200 300 | rocket body seen from the side, nose up, two fins, small legs; cockpit hole; **nozzle centre (100, 286)**, **cockpit neck point (100, 118)** where Bim's neck anchor goes (Bim drawn at 0.55 scale) |
| `characters/rocket_front.svg` | 0 0 200 300 | only the canopy glass + rim (drawn over Bim), same frame |
| `items/wagon_back.svg`, `items/wagon_front.svg` | 0 0 160 110 | a small puffy cloud wagon (cloud basket with a teal rim), back and front halves; **hitch point (80, 18)** where the rope ties; items sit between halves |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | gold star / grey outline star |
| `icon.svg` | 0 0 512 512 | Bim waving from the rocket among rainbow clouds, full-bleed sky background |
Artist A also owns **`game/js/sky_art.js`** (§5.6): islands, tokens, rainbow ribbon, flame, smoke, boost button drawn by code.

### 4.2 Animal friends — character artist B (0 0 128 128, centred, ≈ 110 px, sticker border, must read at 70 px)
`items/animal_<cat|dog|cow|pig|sheep|duck|lion|frog>.svg` — sitting/waving full body facing right, distinct silhouettes:
orange-brown tabby kitten (use `#E0954F`, browner than `orange`), floppy-eared puppy (tan `#C99A6B`), black-and-white calf
with pink nose, pink piglet (`#F7B3B8`, softer than the `pink` answer), fluffy cream sheep with grey face, yellow duckling
(`#FFE07A`, paler than `yellow`) with orange bill, lion cub with a tawny mane, light green frog (`#8CCB5E`, yellower than `green`).
Each also as `items/animal_<x>_wave.svg` (same body, one paw up) for the moment it is picked up.

### 4.3 Environment — environment artist
- `env/hills_<t>.svg` (0 0 1200 420, bottom-anchored, horizontally tileable, transparent above): Rainbow Cloud Land's ground seen
  at take-off — round pastel hills, candy-floss trees, a tiny launch tower. `t ∈ morning|noon|sunset|night`. Only visible at
  the start of the session (the camera climbs away from it).
- `env/cloud_{a,b,c,d,e}.svg` (0 0 320 170): background puffs (white, soft lavender shade, no outline or a very light one),
  tinted by code per time of day; used in 3 parallax layers (0.15, 0.35, 0.6) placed procedurally, endlessly in y.
- `env/cloudbank.svg` (0 0 1200 300, horizontally tileable): a dense cloud wall the rocket boosts through.
- `env/rainbow.svg` (0 0 600 320): a soft 6-band rainbow arc (bands muted, 70 % alpha), `env/sun.svg` (0 0 200 200, smiling-free,
  soft rays), `env/moon.svg` (0 0 200 200, crescent with a gentle glow), `env/planet_{a,b,c}.svg` (0 0 160 160, distant decorative
  planets for night, desaturated).
- Particles (0 0 32 32): `sparkle`, `star`, `puff` (smoke), `dust`, `confetti_a`, `confetti_b` (neutral, tinted by code).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `sky_art.js` | character artist A |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, sky_art, render, ui, main.

### 5.1 Content (`content.js` → `RR.Content`)
```
RR.PALETTE, RR.ANIMALS = ['cat','dog','cow','pig','sheep','duck','lion','frog'], RR.SHAPES = ['circle','square','triangle','star','heart','rect','diamond','oval']
RR.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
RR.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise }) → round   // pure, deterministic, self-checks solvable
RR.Content.makeTalk(topic, { age, lang, rng }) → talk
```
```
round = { topic, hops:[ hop ], surprise:null|'drift'|'shooting' }
hop   = { promptKey:'p.<topic>' | 'p.countUp' | 'p.sound', params:{…}, answer /*index into tokens*/,
          tokens:[ { kind:'color'|'shape'|'stars'|'number'|'animal'|'size'|'letter'|'text', value, color?, shape?, n?, scale?, text?,
                     nameKind, nameValue } ] }
```
- Islands per row (= tokens per hop): age 3: 2,2,2,3 per round; age 4: 2,3,3,3; age 5: 3,3,4,4; 6–7: 3,4,4,4.
  Hops per round: warm-up round 2, then 3 (count-up rounds: the count, see below). Tokens within a hop are all distinct.
- `colors`: tokens kind `color` (the whole island is that colour); below age 5 never blue+purple, red+green, yellow+orange or
  green+orange in one row. Prompt params `{color}`.
- `shapes`: a shape gem on a white cloud; age ≤ 4 every gem in a row has a different colour; age 5 colours mixed and repeated.
- `count`: rounds 0–1 **count up**: hop k asks for number k (k = 1…N, N = 3 then 4 at age 4; 2 then 3 at age 3; 4, 5 at 5+);
  tokens are kind `number` (numeral badge **and** that many little stars); prompt `p.countUp {n}`. Rounds 2–3: kind `stars`
  (stars only, dice-like layout), prompt `p.count {n}`; at age 4 n ∈ 1–5 with distinct values ≥ 2 apart when possible.
- `animals`: one animal per island; prompt `p.animals {animal}`; from round 2 at age ≥ 4 half the hops ask by sound `p.sound {animal}`.
- `size` (age 3): the same animal big and small (`scale` 1 / 0.6) — "Fly to the BIG cow!" `p.size {size, animal}`.
- `letters`, `lower`, `initial`, `add`, `sub`, `oddeven`: as Dee's content but one answer among the row's tokens (e.g. `add`: prompt
  "2 + 3" → islands show numbers; `oddeven`: "Fly to an ODD number" with exactly one odd token).
- Every round self-checks: exactly one token per hop matches the prompt; no two consecutive hops share the same answer value.

### 5.2 `RR.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` interpolation with `alpha`)
Public API/fields as Dee (`setViewport, setAge, setLang, newSession({lastTopics}), levels, startLevel, update, drainEvents,
pointerDown/Move/Up, cancelDrag, hint, talkAnswer, prompt(), layout, hudKeep, state, level, topic, round, roundsPerLevel, stars,
levelStars, talk, alpha, stateTime, wind`), states `intro | round | roundDone | talk | levelDone | sessionDone`, plus:
- `w.phase` inside a round: `'appear' | 'ask' | 'ignite' | 'fly' | 'land' | 'climb' | 'boostReady' | 'boost'`.
- `w.islands[]`: `{ id, x, y /*world, island surface centre*/, _px, _py, w, h, rot, _prot, sx, sy, style:'cloud'|'planet',
  token /*see hop.tokens*/, state:'appear'|'idle'|'pad'|'leave'|'gone', t, wob, glow, alpha, collected }`.
- `w.rocket`: `{ x, y /*world, bottom-centre = feet on the pad*/, _px, _py, rot, _prot, sx, sy, vx, vy, flame /*0..1*/,
  phase:'rest'|'ignite'|'fly'|'land'|'boost', shake, pad /*island id*/ }`.
- `w.aim` = null | `{ x, y, target /*island id or null*/ }` while a finger drags from the rocket (screen-free world coords).
- `w.wagon`: `{ x, y, _px, _py, rot, _prot, items:[token], rope:[{x,y,_px,_py}×6] }` — spring rope from the rocket's base.
- `w.trail[]`: `{ x, y, a /*0..1 age fade*/ }` world points of the rainbow ribbon (≤ 140), drawn as a 6-band ribbon.
- `w.flyers[]`: tokens flying from an island into the wagon `{ token, x, y, _px, _py, rot, _prot, s, t }`.
- `w.camY, w._pcamY`; `w.bim { mood, moodT, lookX, lookY }`; `w.shooting` = null | `{ x, y, _px, _py, vx, vy, t, caught }`.
- Interaction (`pointerDown(x, y)` takes SCREEN logical px; world adds camY): in phase `ask` a tap on an island answers it
  (returns the island id); a press on the rocket starts an aim (returns `'rocket'`); a tap (< 24 px, < 0.35 s) on the rocket =
  event `pokeBim` (main repeats the prompt). `pointerMove` updates `w.aim`; `pointerUp` over an island (hit test) answers it,
  elsewhere cancels quietly. In `boostReady` a tap anywhere on the rocket, the boost button or the open sky → `boost`.
  Taps during ignite/fly/land/climb are ignored (return null). One active pointer.
- Answer right → event `go {id, nameKind, nameValue}`; `ignite` 0.35 s (rocket shakes, flame builds), `fly` along a smooth
  curve (cubic, apex 60–120 px above the straight line, side bulge away from screen edges) with **thrust-like speed profile**
  (accelerate, cruise, retro-decelerate), rotation = velocity heading (spring-limited, ≤ 0.9 rad), flame 1 → 0.3 on retro,
  trail points every 12 px; `land`: squash (sy 0.82 → overshoot 1.06 → 1), the island dips 14 px on a spring and rebounds;
  the token leaves the island on an arc into the wagon (event `collect {id, token}` when it arrives); `climb`: camera springs up so
  the landed island sits at `padY` (≈ 0.8 s), old islands slide off below (`leave` → `gone`), the next row `appear`s from above
  with staggered back-overshoot (scale 0 → 1.12 → 1, 0.09 s stagger) → event `ask`.
- Answer wrong → event `wrong {id, nameKind, nameValue, want:{kind,value}, streak}`; the island wobbles (damped rotation ±0.12 rad,
  squash) and the rocket does a tiny hop (12 px); after the 2nd miss on the same hop → `hint {id}` (the right island glows and
  bobs) — hint cooldown 6 s. Idle nudges after 12 s without a tap, backoff ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
- After the last hop of a round: `roundDone {round, stars, misses}` (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses), wagon items burst
  into stars (render), then phase `boostReady` (event `boostReady`): the rocket glows and bounces; tap → `boost` (or auto after
  `CONFIG.autoBoost` = 5 s): the rocket blasts straight up (flame 1, shake), the camera follows it through a cloud bank for 1.4 s
  (`w.boostT` 0..1 for speed lines), then it decelerates onto a fresh pad island (event `boostEnd`) and the next round starts.
- Chapter: 4 rounds (time limit 80 s after ≥ 3 rounds → Talk), Talk time, `levelDone`, next chapter = next time of day. The world keeps
  climbing across chapters (camY never resets in a session); stage 3 islands are planets.
- Surprise (one round per chapter, rotating): `drift` — islands of that round drift sideways slowly (± 25 px/s, bounce in field);
  `shooting` — once during the round a shooting star crosses the sky in 3 s; a tap on it → `shootingTap {x, y}` (sparkle shower,
  no score effect).
- Events: `level {level, topic}`, `round {round, topic, hops, surprise}`, `appear {id}`, `ask {hop, hops, promptKey, params}`,
  `go`, `ignite`, `liftoff`, `land {id}`, `collect {id, token}`, `climb`, `wrong`, `hint {id}`, `idle {n}`, `pokeBim`, `tapPad`,
  `roundDone`, `boostReady`, `boost`, `boostEnd`, `shooting`, `shootingTap`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`, `sessionDone`.

### 5.3 `RR.Weather` — as Dee's API (`setWeather(i)` 0 morning, 1 noon, 2 sunset, 3 night; crossfade 2.5 s), `resize(W,H)`,
`update(dt, {camDY})` (particles shift by the camera move so they feel like they are in the sky), `ambient` (`skyTop, skyMid, skyBottom,
tint /*for clouds*/, cloudShade, rimLight, sun, sunX, sunY, moon, stars 0..1, rainbow 0..1, darkness, wind`), particles: morning floating
dust motes + a few birds-free sparkles, noon rainbow glints, sunset glowing dust, night twinkling stars (fixed field, parallax) + falling star
streaks every ~8 s. Cap 120.

### 5.4 `RR.Bot` — answers through `world.pointerDown/Up` (taps, and 30 % drags from the rocket via pointerMove) with p = skill,
human-ish delays (1.0–2.4 s), taps the boost after 0.6–2 s, answers Talk right with p = skill.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.RR.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, islandScreen(id) → {x, y, w, h} CSS px (centre of the hit area), rocketScreen() → {x, y, w, h},
answerId() → id of the right island in the current hop, audio() }`.

### 5.6 `RR.SkyArt` (artist A, `sky_art.js`) — classic script, node-safe at load (touch DOM lazily); every function draws centred
at the current transform origin unless noted.
```
RR.SkyArt.drawIsland(ctx, w, opt)      // opt: { style:'cloud'|'planet', color /*null = white*/, mood /*0..3 time of day tint*/, glow 0..1, t }
                                       // cloud: puffy island, flat-ish top surface at y = 0 (origin = surface centre), body below, height ≈ 0.55·w
                                       // planet: circle of diameter 0.8·w whose top is at y = 0, soft ring, 2 craters
RR.SkyArt.drawToken(ctx, token, size, opt)   // origin = token BOTTOM centre (sits on the surface). kinds:
                                       //  shape (glossy gem in token.color), stars (n little gold stars in a dice-like pattern on a soft card),
                                       //  number (round badge with numeral + n tiny stars under it), letter/text (badge), color (nothing: the island is coloured),
                                       //  animal/size → calls opt.sprite(name, x, y, size, wave) supplied by the renderer
RR.SkyArt.drawRibbon(ctx, pts /*[{x,y,a}] screen*/, width)   // 6-band rainbow ribbon, fading tail
RR.SkyArt.drawFlame(ctx, power /*0..1*/, t)    // origin = nozzle, pointing down (+y), flickering layered teardrops
RR.SkyArt.drawBoostButton(ctx, r, t, pressed)  // big round pulsing button with a rocket glyph
RR.SkyArt.drawSpark(ctx, size, color), RR.SkyArt.drawStar(ctx, size, color)
RR.SkyArt.COLORS = { key: {base, dark, light} }
```
Cache static parts (islands per colour/size bucket/dpr) in offscreen canvases. Numerals/letters: bold rounded font, ≥ 4.5:1 contrast.

## 6. Voice, language — as Dee §6 with helper **Bim** (written and spoken "Bim" in both languages), a cheerful baby elephant:
pitch ≈ 1.2, rate ≈ 0.9.
- Animal names/sounds: cat "cat"/"con mèo" (meow / meo meo), dog "dog"/"con chó" (woof / gâu gâu), cow "cow"/"con bò" (moo / ùm bò),
  pig "pig"/"con heo" (accept "lợn"; oink / ụt ịt), sheep "sheep"/"con cừu" (baa / be be), duck "duck"/"con vịt" (quack / cạp cạp),
  lion "lion"/"con sư tử" (roar / gừm gừm), frog "frog"/"con ếch" (ribbit / ộp ộp).
- Prompts (3 wordings each): `p.colors` "Fly to the {color} cloud!" (night: planet → `p.colors.night` "Fly to the {color} planet!"),
  `p.shapes` "Find the {shape}!", `p.countUp` "Let's count up! Fly to {n}!" / "Now {n}!", `p.count` "Fly to the cloud with {n} stars!",
  `p.animals` "Let's pick up the {animal}!", `p.sound` "Who says {sound}? Fly to them!", `p.size`, letters etc. as Dee.
- `sayGo(lang, ev)` ("Red! Blast off!"), `sayWrong(lang, ev)` ("That's blue. Let's find red!" — names what was tapped, repeats the goal,
  never negative), `sayCollect(lang, ev)` (count in count chapters: "Three stars!"; animals: "Hello, cow! Moo!"), `boost[]`
  ("Tap the rocket! Blast off!"), `boostGo[]` ("Three, two, one… whoosh!"), `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`,
  `talk.*`, `weather.0..3` ("Good morning, sky!", "Hello, sunshine!", "What a pretty sunset!", "Look at all the stars!"),
  `surprise.drift`, `surprise.shooting`, `shooting.tap`, `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo lines
  "Bim's" / "Rainbow Rocket", VI "Voi Bim" / "Tên Lửa Cầu Vồng".

## 7. Integration (lead) — title (Bim waving beside the rocket on a cloud, rainbow), settings with volume, HUD, bubble, pause with −/+,
chapter banner, Talk time, session done (moon party: fireworks + every animal friend met). Audio: loud chain; SFX: rumble (ignite),
whoosh/thrust, landing boing, island puff-in, collect chime (rising per hop), wrong soft "boing-hmm", boost roar + wind, star dings,
shooting-star twinkle, fanfare; music per time of day.

## 8. Performance — ≤ 6 islands alive, cached island art, ribbon ≤ 140 points, ≤ 160 particles; adaptive quality as Dee.
