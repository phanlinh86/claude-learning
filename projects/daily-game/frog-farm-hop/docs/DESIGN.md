# Clover's Farm Hop — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.FH`. Storage prefix `cfh:`. Exe `CloversFarmHop.exe`, port 47731 (fallbacks 47741/47751/47761).
Fantasy in one sentence: **it must FEEL like being a springy little frog — "boing, boing, BOING!" — bouncing up a farm into the sky, with the wind tugging you around.**

## 1. Lessons from vertical hoppers (keep / change)
| Reference idea (Doodle Jump, Mega Jump, Icy Tower) | Keep | Change for us |
|---|---|---|
| Auto-bounce on landing, player only steers left/right | ✔ | hold-left / hold-right halves of the screen + arrow keys; no tilt (works on desktop too) |
| One-way platforms (pass through from below, land from above) | ✔ | — |
| Camera only goes up; falling below the screen ends the run | ✔ / ✘ | falling costs a **heart**; a trampoline pops Clover back up (Easy 5 hearts, Normal/Hard 3) |
| Wrap-around screen edges | ✘ | soft fence-post walls at the column edges (clearer next to side scenery in landscape) |
| Enemies, holes, shooting | ✘ | nothing scary; challenge = gaps, moving carts, poof clouds and the wind |
| Moving / breaking / spring platforms | ✔ | hay cart (moves), puff cloud (poofs after one bounce), spring on a hay bale (big bounce) |
| Endless | ✔ | split into 4 **weather levels**; then loops a bit harder |
| — | twist | **wind gusts that change direction**, telegraphed by a weather vane |

## 2. Screen and world
- Logical view `VW×VH` from `Renderer.computeView` (same as the other daily games): landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall.
- **The world has no pixels.** Units: **u (1 u = 1 metre on the HUD)**, seconds. `x` grows to the right, `y` grows **upward**; the farmyard ground is `y = 0`.
- The play **column** is `x ∈ [0, COLW]`, `COLW = 12`. Hero centre is clamped to `[0.55, COLW − 0.55]` (soft walls: `vx *= −0.35`, event `wall`).
- **Camera** (in the world, so falls are deterministic): `world.camY` = the world `y` at the **bottom of the screen**. Target `max(camY, hero.y − CONFIG.camLead)` (`camLead` 4.2 u), eased up at rate `CONFIG.camRate` (6 /s); it never moves down. `prevCamY` kept for lerp.
- **Renderer mapping:** `unit` px per u = landscape `VH / 11.5`, portrait `VW / 12.8`. Column left edge on screen `colX = VW/2 − 6·unit`. `sx = colX + x·unit`, `sy = VH − ins.bottom·0 − (y − camY)·unit` (camY lerped). Visible height `VH / unit` (≈ 11.5 u landscape, ≈ 20 u portrait).
- Outside the column (landscape) the background continues; the column edges are drawn as tall fence posts (`pole.svg`).

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, logos or mascots — Clover must not look like Kermit, Frogger, Keroppi, Pepe, Tiana's frog, Froggy (Bluey) or any famous frog; no known tractor/farm brands).
Flat cartoon picture-book style, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in viewBox units) in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs; filters only for a tiny glow (`feGaussianBlur` ≤ 3). `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Clover: bright **lime-mint green** body `#7ed957`, shade `#4fae3b`, belly cream `#fff3c4`, outline `#2f6b2a`, pink cheeks `#ff9eb5`, a **sunny-yellow rain hat** `#ffd23f` (outline `#b8860b`) so she pops against grass and sky, big dark eyes `#2b2440` with white shines.
- Fireflies: **warm glowing yellow `#fff27a` → amber `#ffb627` abdomen**, tiny pale wings `#e8f6ff` (60 % alpha), dark plum body `#5a3d5c`; a soft round glow. They must be the brightest small things on screen (even on the sunny sky — use the halo).
- Platforms are **solid, warm and darker than the sky**: hay bale gold `#e8b84a` / shade `#c08a2a` / twine `#8a5a2a`; plank wood `#b97a45` / `#8a5530`; hay cart red `#d9534f` with wooden wheels; puff cloud white `#ffffff` with a lilac-blue underside `#c9d6ff` (clearly "soft"); spring = coiled metal `#9aa7b8` with a red cap `#ff5a5f`; trampoline = blue mat `#3b82c4` with a yellow frame `#ffd23f`.
- Backgrounds are **softer and less saturated** than characters and platforms; no gold/yellow in the play band behind platforms on the sunny level (use pale blue / white); keep the column centre calm.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `clover_idle.svg` | 0 0 128 128 | `1.35·unit` wide square | Clover sitting, facing **right** (¾ view), hat on, smiling. **Feet line y = 118, body centre (64, 74), body width ≈ 76.** |
| `clover_crouch.svg` | same | same | landing squash pose: legs folded wide, body a bit lower/wider (renderer adds squash too) — same head geometry. |
| `clover_up.svg` | same | same | rising: legs stretched down together, arms up, happy open mouth, hat brim lifted. |
| `clover_fall.svg` | same | same | falling: legs splayed out, arms out to the sides, "o" mouth, hat held by one hand. |
| `clover_ouch.svg` | same | same | squeezed eyes (> <), hat askew, a little star. |
| `clover_happy.svg` | same | same | eyes ^^, both arms up cheering, sparkles drawn by the renderer. |
| `firefly_0.svg`, `firefly_1.svg` | 0 0 64 64 | `0.75·unit` | firefly seen from the side with a big round glowing abdomen; frames = wings up / wings down; body geometry identical. Centre (32, 34). Includes its own soft glow circle (r ≈ 26, yellow at 35 % → 0). |
| `hay.svg` | 0 0 192 96 | width = platform width | a round-edged hay bale lying on its side, two twine bands, straw tufts. **Top surface y = 14** (feet land here), centre x 96. |
| `plank.svg` | 0 0 160 48 | width = platform width | a short wooden fence plank with two nails and a grain line. **Top y = 8.** |
| `cart.svg` | 0 0 224 128 | width = platform width × 1.0 | a small red hay cart full of hay, seen from the side, two wooden wheels (wheels drawn as separate `wheel.svg` so they can spin). **Top surface (hay top) y = 22**, wheel centres at (56, 104) and (168, 104). |
| `wheel.svg` | 0 0 48 48 | 0.38·platform width | wooden wheel with 6 spokes, centre (24, 24). |
| `puff.svg` | 0 0 192 96 | width = platform width | a soft puffy white cloud, flat-ish top, lilac underside, two tiny closed happy eyes. **Top y = 18.** |
| `spring.svg` | 0 0 64 80 | 0.55·unit wide | a coil spring with a red cap pad; **base y = 78** (sits on the hay top), cap top y = 6. |
| `spring_up.svg` | 0 0 64 80 | same | the same spring stretched up (used for 0.25 s after a bounce). |
| `trampoline.svg` | 0 0 256 96 | 3.0·unit wide | rescue trampoline: blue mat, yellow frame, little legs. **Top (mat) y = 26.** |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | lives: plump coral heart `#ff6b6b` with highlight; empty = outline only, grey at 50 %. |
| `jar.svg` | 0 0 64 64 | 40 (HUD) | a glass lantern jar with a lid and handle, empty (the renderer draws the fill glow inside: inner area x 16..48, y 20..56). |
| `vane.svg` | 0 0 96 96 | 64 (HUD) | a rooster-free weather vane: an arrow pointing **right** on a post with N/E/S/W-free little ball; the arrow part spins (draw the arrow centred at (48, 40), the renderer flips it). |
| `icon.svg` | 0 0 256 256 | app icon | Clover's face + hat (front ¾), a glowing firefly, on a round badge: green hill, red barn, blue sky. Readable at 32 px. |

### 4.2 Levels (environment artist) — `levels/<w>/`, w ∈ `sunny`, `rain`, `wind`, `snow`
| File | viewBox | Placement | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen, cover-fit, almost static (parallax 0.02 of camY) | **opaque**: vertical gradient + big soft sky shapes. sunny: clear blue `#8fd3ff`→`#e8f7ff`, a soft sun top-right; rain: grey-green `#9fb3b8`→`#dfe8e4`, heavy soft clouds; wind: golden-peach `#ffcf8a`→`#fff1d6`, streaky clouds; snow: lilac-pink dusk `#b7a6d9`→`#f6e3ec`, a pale moon. Horizontally tileable (left edge = right edge). |
| `far.svg` | 0 0 960 1080 | tiled **vertically and horizontally**, parallax 0.25 (scrolls down slowly as you climb) | **transparent** except floating far décor in the chapter mood: sunny — small clouds, birds; rain — drifting rain clouds; wind — kites with tails, swirls; snow — snow clouds, a few stars. Low contrast, mostly toward the left/right thirds; keep x 300–660 light. Top edge must match the bottom edge, left = right. |
| `ground.svg` (only `levels/ground.svg`, shared) | 0 0 1280 420 | the farmyard at the bottom: **ground line y = 330 sits on world y = 0**; centred on the column; seen only at the start | red barn with white trim, a silo, a wooden fence, a duck pond, green grass, a sunflower or two, a little windmill. Opaque below y ≈ 300 (grass/soil to the bottom), transparent sky above the roofs. Keep the column centre (x 400–880) low (only grass and fence ≤ 60 px above the ground line) so Clover reads. |
| `pole.svg` (shared, `levels/pole.svg`) | 0 0 48 256 | column edges, tiled vertically, parallax 1 | a tall wooden fence post with climbing ivy leaves; seamless top/bottom. |
| `palette.json` | — | — | `{ sunny: {skyTop, skyBottom, tint, snow:false}, rain: …, wind: …, snow: …}` hex colours used for fallbacks and the crossfade. |

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`petal` (pink), `butterfly` (small pastel, wings open), `raindrop` (thin blue-white streak, viewBox 0 0 8 32), `splash` (small crown of droplets), `leaf` (small orange/green leaf), `gust` (a white curved wind swoosh, viewBox 0 0 96 32), `snowflake` (soft 6-arm flake), `sparkle` (4-point star, white), `straw` (a hay stalk), `puff` (round white cloud puff), `glow` (round yellow glow, for firefly pickups), `dust`.

### 4.4 Level constants (renderer `ZONE_INFO`)
| zone | key | name | banner | hint |
|---|---|---|---|---|
| 0 | sunny | Sunny Meadow | "Sunny Meadow" | "Hold left or right to steer Clover!" |
| 1 | rain | Rainy Orchard | "Rainy Orchard" | "Puff clouds go poof after one bounce!" |
| 2 | wind | Windy Hill | "Windy Hill" | "Watch the weather vane — here comes the wind!" |
| 3 | snow | Snowy Rooftops | "Snowy Rooftops" | "Almost at the clouds, Clover!" |

## 5. Code architecture (`game/js/`, classic scripts on `window.FH`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `FH.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
- `new FH.World(opts)` calls `reset(opts)`; `reset({seed, difficulty:'easy'|'normal'|'hard', level:0})`. `FH.World.CONFIG` exported. `setLayout()` is a no-op.
- **Input:** `steer(dir)` with dir ∈ {−1, 0, +1} — the **held** direction (main.js calls it on key/pointer down/up). `setX(x)` test hook (instant).
- `update(dt)` accumulates and runs fixed steps of `CONFIG.step` (1/120). Hero, camera, platforms, fireflies store `prevX/prevY` (camera `prevCamY`) at the start of each step; `world.alpha` = leftover fraction for the renderer's lerp. `drainEvents()` → array, then cleared.
- `gotoLevel(i)` (emits `levelUp`, moves the level start to the current height), `getState()` → plain summary for tests, `spawn(kind, x, y, opts)` test hook (adds a platform / firefly), `gust(dir)` test hook (starts a warning now).
- **State:** `time, phase ('play'|'over'), level (0-based, endless), zone (= level % 4), loop (= ⌊level/4⌋), camY, prevCamY, maxY (highest hero y), levelY0 (height where this level began), goal (u of climb per level), progress (0..1), score, fireflies, lantern (0..CONFIG.lanternSize), hearts, maxHearts, difficulty,`
  `hero {x, prevX, y, prevY, vx, vy, dir (held input), face (−1|+1), squash (0..1), stretch (0..1), tilt (rad, + = leaning right), mood ('idle'|'up'|'fall'|'crouch'|'ouch'|'happy'), moodT, airT, lastPlat (id), invuln (s), rescueT (s)}`,
  `platforms[] {id, kind:'ground'|'hay'|'plank'|'cart'|'puff'|'rescue', x (centre), prevX, y (top surface), w (width u), spring (bool), springT (s since sprung), vx (cart), x0, x1 (cart range), state:'live'|'poof'|'gone', t, bounces}`,
  `fireflies[] {id, x, prevX, y, prevY, bx, by (home point), ph (phase), state:'live'|'taken'|'gone', t}`,
  `wind {state:'calm'|'warn'|'blow', dir (−1|+1), t (s in state), dur, strength (0..1 eased), next (s until the next warning), count}`,
  `stats {fireflies, bounces, springs, puffs, falls, rescues, gusts, levels, maxY, time, lanterns}`.
- **Events:** `{type:'bounce', p, kind, spring, x, y}`, `{type:'poof', p}`, `{type:'firefly', f, x, y, combo}`, `{type:'lantern', hearts}` (lantern full → +1 heart, lantern resets), `{type:'wall', side}`, `{type:'fall', hearts}` (heart lost), `{type:'rescue', x, y}`, `{type:'windWarn', dir}`, `{type:'windStart', dir}`, `{type:'windEnd'}`, `{type:'levelUp', level, zone, bonus}`, `{type:'heartGain', hearts}`, `{type:'gameOver'}`, `{type:'meter', m}` (every 25 m).
- **Rules:**
  - **Bounce physics:** gravity `g` ≈ 26 u/s², bounce `bounceV` ≈ 12.4 u/s → apex ≈ 3.0 u, rise ≈ 0.48 s; spring ×`springK` 1.6 (apex ≈ 7.6 u); rescue trampoline ×1.45. Terminal fall speed `maxFall` ≈ 16 u/s. `squash` set on bounce (decays ~0.18 s), `stretch` on takeoff, `tilt` eases toward `clamp(vx/maxVx, −1, 1)·0.22`. `mood`: 'crouch' 0.1 s on bounce → 'up' while vy > 0 → 'fall' when vy < −3.
  - **Steering:** `vx` accelerates toward `dir·maxVx` (`maxVx` ≈ 6.5 u/s, `accel` ≈ 34 u/s²); with `dir = 0` it decays (`drag` ≈ 8 /s). Air control is full (it's a hopper). `face` follows the last non-zero `dir` (or vx sign).
  - **Wind (the twist):** `next` counts down (first warning after `firstGust` s ≈ 6 s on sunny); `warn` for `warnT` (Easy 2.0, Normal 1.6, Hard 1.3 s; event `windWarn` with the coming `dir`) → `blow` for `dur` (zone range) with `strength` easing in over 0.4 s and out over the last 0.5 s → `calm`, `next` = random in the zone range. Direction: each gust flips the previous one with probability 0.7 (the vane shows it). While blowing: hero `vx += dir·windAx·strength·dt` and `vx` may exceed `maxVx` by up to `windAx·0.35`; fireflies drift with it (`x += dir·strength·0.8·dt`, wrapped back toward home softly). Zones: sunny `{every:[11,15], blow:[2.2,3.0], ax:5}`, rain `{every:[8,12], blow:[2.5,3.5], ax:7}`, wind `{every:[5,8], blow:[3.0,4.5], ax:10}`, snow `{every:[7,10], blow:[2.5,4.0], ax:8}`; difficulty × `windK` (Easy 0.6, Normal 1, Hard 1.25); loop × (1 + 0.1·loop).
  - **Platforms:** one-way; land when `vy ≤ 0`, the feet crossed the top between the previous and current step, and `|hero.x − p.x| < p.w/2 + 0.22`. Then `vy = bounceV` (spring ×springK when `p.spring` and `|hero.x − p.x| < 0.45`), event `bounce`. `puff` → state 'poof' after its first bounce (event `poof`, gone after 0.35 s). `cart` moves between `x0..x1` with an eased (sine) back-and-forth, speed by zone/difficulty; the hero does not ride it (bouncing is instant). `ground` is a full-width platform at y = 0 that is removed once `camY > 3`.
  - **Generation** (deterministic, `rng.fork('plat')`): platforms are generated upward while the highest one is below `camY + CONFIG.genAhead` (24 u). Vertical gap between consecutive "path" platforms ∈ `gap[d]` (Easy `[1.3, 2.0]`, Normal `[1.5, 2.4]`, Hard `[1.7, 2.6]`, +0.08 per loop, never above 2.7 — always reachable without a spring), horizontal offset from the previous ≤ `maxDx` (Easy 3.2, Normal 4.0, Hard 4.6 u) and the centre kept in `[w/2 + 0.3, COLW − w/2 − 0.3]`. About 35 % of rows get an extra side platform 3–6 u away. Widths: hay 2.4, plank 1.7, cart 2.3, puff 2.1 (× Easy 1.25 / Normal 1 / Hard 0.88). Kind weights per zone: sunny `{hay:.6, plank:.4}`; rain `{hay:.35, plank:.25, cart:.22, puff:.18}`; wind `{hay:.3, plank:.2, cart:.28, puff:.22}`; snow `{hay:.3, plank:.3, cart:.2, puff:.2}`. A puff is never two path platforms in a row; ~8 % of hay bales carry a spring (not on the first 20 m). Remove platforms below `camY − 2`.
  - **Fireflies:** groups of 3–5 placed on a gentle arc between two path platforms every ~6–9 u of height, hovering around home points (`bx, by`) with a slow figure-eight bob (amp 0.15 u, ~1.5 s). Caught when the distance to Clover's body centre (`hero.y + 0.55`) < `catchR` (0.8 u). +10 points each, `lantern += 1`; at `lanternSize` (20) → +1 heart (up to max; event `lantern`, `heartGain`), lantern resets.
  - **Score:** `+1` per new whole metre of `maxY`, fireflies `+10`, level bonus `100·(zone+1)·(loop+1)` at `levelUp`.
  - **Levels:** `goal = CONFIG.goal[d]·(1 + 0.1·loop)` (Easy 110, Normal 140, Hard 160 u). When `maxY − levelY0 ≥ goal` → `levelUp`: bonus, `+1` heart (up to max; event `heartGain`), `level++`, `levelY0 = maxY`, mood 'happy' 1.0 s. Aim for 50–80 s per level for a casual player.
  - **Falling:** when `hero.y < camY − 1.2` → `hearts--`, event `fall`; if hearts remain → a `rescue` trampoline platform is spawned at `y = camY + 0.6`, `x = clamp(hero.x, 1.6, COLW − 1.6)`, width 3.0, and the hero is placed at `y = camY − 0.4` with `vy = bounceV·1.45`, `rescueT = 1.2` (event `rescue`; the trampoline is removed after its bounce or 2 s). If hearts reach 0 → phase `over`, event `gameOver`; the world keeps falling gently for the game-over animation.
  - The first level must be easy for a 6-year-old: Easy has wide hay bales, short gaps, weak wind, 5 hearts and lots of fireflies.
- **CONFIG** (units and why, at the top of `world.js`): `step, COLW, g, bounceV, springK, rescueK, maxFall, maxVx, accel, drag, camLead, camRate, genAhead, catchR, lanternSize, firstGust, goal {easy, normal, hard}, difficulty {easy|normal|hard: {hearts, gap, maxDx, widthK, windK, warnT, cartSpeed}}, zones [{kinds: {name: weight}, wind: {every, blow, ax}, cartSpeed}]`.

### 5.2 `FH.Weather` (screen space) — `new FH.Weather({width, height, seed})`
`setLevel(zone, {instant})`, `resize(w, h)`, `setWind(dir, strength)` (called every frame from the world's wind), `update(dt, climbVy)` (climbVy = camera speed in px/s so falling things stream past faster while climbing), `burst(sprite, x, y, n, opts)`, `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'}`, `ambient {tint (css rgba or null)}`.
Sunny: a few `butterfly`s (sinusoidal flap path) + drifting `petal`s. Rain: `raindrop` streaks in two depth layers (slanted by the wind) + small `splash`es at random heights. Wind: `leaf`s streaming + `gust` swooshes. Snow: `snowflake`s in 3 depth layers (size/speed/alpha by depth). On every level while the wind blows: extra `gust` swooshes and leaves/petals pushed in `dir`; drifting things lean with the wind. Back-layer particles are faint; front-layer particles are small, sparse, pale and never look like fireflies (no yellow dots). Bounded counts (< 180). Burst opts `{speed, life, size, gravity, spread, up, spin, layer, drag}`.

### 5.3 `FH.Bot` — `new FH.Bot(world, {skill, seed})`, `bot.step(dt)`
Every ~0.08 s: when falling (or about to), picks the best landing platform among those Clover can still reach (top below her predicted apex, above the fall line, reachable horizontally given `maxVx`, time to reach the platform's height and the current wind), preferring higher ones, springs, and paths through fireflies; avoids puffs when an alternative exists; leads moving carts. Steers with `world.steer(-1|0|1)` toward the target x with a dead zone, compensating the wind. Skill: reaction delay `(1 − skill)·0.3 s`, aim noise `(1 − skill)·0.8 u`, a chance `(1 − skill)·0.1` per decision of a bad pick. skill 1 ≈ never falls; 0.5 ≈ casual player. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.FH.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), steer(dir), gust(dir) }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Clover: a custom picture drawn as a round sticker that squashes on bounce, stretches when rising, tilts with steering, with tiny procedural legs), `firefly` (a custom picture drawn round inside a warm glow), `bg_sunny`, `bg_rain`, `bg_wind`, `bg_snow` (a full-scene photo replaces `sky.svg` for that level; far décor, poles and platforms stay).

## 7. Audio (WebAudio, synthesized)
SFX: bounce "boing" (pitch rises a little with height in the level), spring "BOING-oing" (longer, higher), puff "poof" (soft noise), firefly "twinkle" (pentatonic step up within a group), lantern full chime, wall "tok", fall "wheee" (descending slide), rescue trampoline "boinggg", wind warn (a soft rising whistle), wind blowing (filtered noise swell, panned by dir), level up fanfare, heart gain, game over (gentle tune), best score, button click. Music: a soft loop per level: sunny banjo-ish plucks (100 bpm), rain gentle marimba (92), wind bouncy whistle (108), snow music-box bells (84); crossfade on level change; slightly faster each loop. Unlock on the first gesture.

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events on the stage (not on UI): **hold** the left half → steer −1, right half → +1; multiple pointers: the latest one wins; release → 0 (or the remaining pointer's side). Keys: ←/A, →/D held; releasing one key falls back to the other if still held.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection, `touch-action: none` on the stage).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
