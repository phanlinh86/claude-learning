# Finn's Island Fling — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.FIF`. Storage prefix `fif:`. Exe `FinnsIslandFling.exe`, port 47781 (fallbacks 47791/47801/47811).
Fantasy in one sentence: **it must FEEL like stretching a big rubber band and flinging a fox across the sea — "wheee… plop!"**

## 1. Lessons from slingshot games (keep / change)
| Reference (Angry Birds, Paper Toss, carnival slingshots) | Keep | Change for us |
|---|---|---|
| Drag back, release, ballistic arc | ✔ | drag ANYWHERE (small fingers), not only on the hero |
| Dotted trajectory preview | ✔ | long on Sunny Cove, shorter later and at night |
| Destroy structures, enemies | ✘ | nothing violent: you collect leaves and land on a raft |
| Limited birds per level | ✘ | hearts; only a splash costs one |
| One mid-air ability per shot | ✔ | tail-flutter: one small lift per flight |
| Level select / stars | ✘ | endless run through 4 islands, then loop a little harder |
| — | twist | day → night cycle; at night visibility shrinks to lights |

## 2. Screen and world (all world values in units u, seconds, y UP)
- World field: x ∈ [0, 16], y ∈ [0, 9]; sea surface at y = 0 (`CONFIG.SEA_Y = 0`). 1 u ≈ 1 m.
- Renderer: landscape `unit = VH / 9`; world x = 0 is at screen x `(VW − 16·unit)/2` (wider screens show extra sea/beach at the sides). Portrait: `unit = VW / 16.4`, the world band sits with sea level at 64 % of VH; sky above, sea below fill the rest.
- Screen y = `seaPx − y·unit` where `seaPx` = screen y of the sea surface (landscape: `VH − 1.2·unit`, i.e. world y 0 is 1.2 u above the screen bottom; the visible world goes up to y ≈ 7.8 — leaves never spawn above y 6.8).
- Slingshot anchor (`world.sling`): x 2.3, y 2.9 (standing on a beach rock whose top is at y ≈ 1.2).
- Rafts float with their deck top at y = 0.35 (bob ±0.06 u, visual only — collision uses `raft.top`).
- Logical canvas sizes come from the shared `computeView` (960×540 landscape baseline, up to 1280 wide; portrait 560/720 wide).

## 3. Art style guide (all SVG, 100 % original)
- Hand-written SVG from generator scripts in `tools/art-characters/gen.js` and `tools/art-environment/gen.js` (node, writes into `game/assets/default/`).
- Outline: 3 px at viewBox scale, colour = a darker shade of the fill (never pure black), round joins/caps.
- One-step shading: a flat darker shape on the lower/right side + one small highlight. No blurs/filters except one soft glow gradient where stated.
- No `<text>`, fonts, `<script>`, `<image>`, external refs; `xmlns` present; transparent background (except sky layers).
- Palette rule: hero is warm orange/cream; leaves are bright green (moon leaf: pale cyan-white glow); sea teal; sky light. Backgrounds lower saturation than characters; keep the band y ∈ [1, 7] calm (no busy detail behind the flight path).

## 4. Asset table (`game/assets/default/`)
| File | viewBox | Drawn size (u) | Anchor / notes |
|---|---|---|---|
| `finn_sit.svg`, `finn_pull.svg`, `finn_fly.svg`, `finn_flutter.svg`, `finn_land.svg`, `finn_splash.svg`, `finn_bonk.svg` | 0 0 128 128 | 1.3 × 1.3 | body centre (64, 64) = world fox position; feet line y = 112; hit circle r = 0.45 u. All frames share the same head/body geometry; facing RIGHT. `splash` = head + paws above a water line at y 84 (lower part cut off by the line). `pull` = braced/leaning back, `fly` = arms forward + tail streaming back, `flutter` = tail spun like a propeller, `land` = happy arms up, `bonk` = dizzy squint. Pirate bandana (red with white dots), no eyepatch, no weapon. |
| `leaf.svg` | 0 0 64 64 | 0.8 × 0.8 | centre (32, 32); bright tropical leaf |
| `leaf_moon.svg` | 0 0 64 64 | 0.8 × 0.8 | same leaf, pale glowing cyan/white with a soft glow ring |
| `raft.svg` | 0 0 256 112 | width = 2·hw + 0.3 u (height keeps aspect) | deck top at y 34, deck centre x 128, deck spans x 16–240; red X painted mid-deck; small lantern post on the right end (lantern centre at (222, 6)); bottom part below y 70 is underwater logs (renderer clips under the sea surface tint) |
| `sling.svg` | 0 0 160 256 | 1.6 × 2.56 | palm-trunk Y fork; anchor between prong tips at (80, 50) = world `sling`; band tie points at (34, 46) and (126, 46); base at y 256 sits on the rock; a small torch on the left prong at (20, 20) |
| `rock.svg` | 0 0 480 220 | 4.8 × 2.2 | beach rock + sand for the slingshot; top surface y 40, drawn with its left edge at world x 0 and top at world y 1.2 |
| `gull_0.svg`, `gull_1.svg` | 0 0 96 64 | 1.2 × 0.8 | centre (48, 32), wings up / down, friendly round seagull, facing RIGHT |
| `heart.svg`, `heart_empty.svg` | 0 0 64 64 | HUD | |
| `icon.svg` | 0 0 256 256 | | app icon: Finn's face + leaf, opaque rounded square |
| `levels/<zone>/sky.svg` | 0 0 960 540 | cover-fit, daytime | zones: `cove`, `jungle`, `lagoon`, `lantern`. Sky gradient only + soft clouds; NO sun/moon/stars (the renderer draws those for the day cycle) |
| `levels/<zone>/far.svg` | 0 0 960 300 | width = 16 u·k | distant islands silhouettes sitting on a horizon line at y 300; horizontally tileable; transparent above; parallax 0.3 |
| `levels/<zone>/near.svg` | 0 0 960 200 | | nearer island details (palms, huts, coral, lanterns) on the horizon at y 200; tileable; parallax 0.6; keep low (≤ 120 px tall over most width) |
| `levels/sea.svg` | 0 0 960 240 | full width tile | water body from the surface line at y 20 downwards (teal → deep), wave crest band; tileable |
| `levels/palette.json` | | | per zone `{ skyTop, skyBottom, sea, ink, bar, nightTop, nightBottom }` |
| `particles/*.svg` | 0 0 32 32 | ≤ 0.5 u | `sparkle`, `bubble`, `drop`, `ripple`, `star`, `firefly`, `petal`, `butterfly`, `puff`, `leafbit`, `glow` (soft radial white, the only gradient-alpha sprite) |

Animation frames that share one geometry: all `finn_*` (same head & body circles), `gull_0/1`.

## 5. Module contracts

### `FIF.RNG` (`js/rng.js`, exists): `new FIF.RNG(seed)`, `next() range(a,b) int(a,b) pick(arr) chance(p) sign() gauss() fork(salt)`.

### `FIF.World` (`js/world.js`) — headless, deterministic, pixel-free
`new FIF.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0 })`; `FIF.World.CONFIG` (units + rationale), `FIF.World.DIFF` (per-difficulty overrides).
Fixed sub-steps of `CONFIG.STEP = 1/120 s` with an accumulator; `alpha` = leftover fraction for render interpolation.
Methods:
- `aim(dx, dy)` — set the pull offset from the anchor (world u; fox sits at `sling + pull`). Clamped to `PULL_MAX` length; fox y ≥ `sling.y − 1.4`. Only in phase `'aim'`. First call emits `pull`.
- `release()` — if |pull| ≥ `PULL_MIN` launch with `v = −pull / PULL_MAX · VMAX(dir)` (emits `launch {power}`), else cancel (pull = null).
- `cancelAim()`; `flutter()` — once per flight: `vy = max(vy, 0) + FLUTTER_VY` (emits `flutter`).
- `launchVelocity(dx, dy)` → `{vx, vy}` that a pull would give (bot + preview use it).
- `preview(n, dt)` → array of `{x, y}` points of the predicted flight from the current pull (gravity only, stops at the sea).
- `previewCount()` → dots to show now (per level `PREVIEW` × night factor; 0 if no pull).
- `update(dt)`, `drainEvents()` → array, `getState()` → plain summary, `gotoLevel(i)`.
State fields:
- `phase`: `'aim'` (fox in sling) | `'fly'` | `'land'` (on raft, ~1 s) | `'splash'` (~1.2 s) | `'over'`; `phaseT` (s in phase).
- `fox { x, y, vx, vy, px, py, rot, prot, state }` — `state` one of `sit pull fly flutter land splash bonk` (renderer picks the frame from it); `px, py, prot` = previous step for lerp.
- `sling { x, y }`, `pull` = `{ x, y }` or `null`, `fluttered` (bool).
- `raft { x, px, top, hw, bull, baseX, amp, period, t }` — `bull` = half-width of the bullseye zone.
- `leaves []` of `{ id, x, y, px, py, kind: 'leaf'|'moon', value, taken: false, t }` (taken ones are removed and reported by an event).
- `gulls []` of `{ id, x, y, px, py, vx, r, flap }`.
- `score, hearts, maxHearts, leafCount, landings, levelLandings, shots, streak, bestStreak, level` (levels completed), `zone = level % 4`, `loop = floor(level / 4)`, `difficulty`.
- `dayT` ∈ [0, 1) (0 = dawn start; cycle length `DAY_LEN` s; a run starts at `DAY_START` = 0.12), `light` ∈ [`NIGHT_LIGHT`, 1] (smooth), `isNight` (light < 0.55).
- `stats { leaves, moonLeaves, landings, bulls, splashes, flutters, bumps, hearts, shots, maxStreak }`.
- `time` (s simulated), `alpha`.
Events (`{ type, ... }`): `pull`, `launch {power}`, `leaf {x, y, value, kind, count}`, `flutter`, `bump {x, y}` (gull bonk), `land {x, y, points, bull, streak}`, `splash {x, y}`, `heartLost {hearts}`, `heartGain {hearts}`, `newShot` (fox back in sling, new raft/leaves), `levelUp {zone, level, loop}`, `night`, `dawn`, `gameOver {score}`.
Rules: leaf pickup when distance fox→leaf < `R_FOX + R_LEAF`; landing when the fox's feet (y − `FOOT`) cross `raft.top` downwards with |x − raft.x| ≤ hw + `LAND_PAD`; a splash when feet < `SEA_Y` (outside the raft) or x < −1 or x > 17.5; gull bump = circle bounce (reflect velocity on the normal × `BUMP_E`, push out). New shot: raft placed per level ranges; leaves placed along a reachable "solution" arc that ends on the raft (+ a little jitter, 1–2 off-arc bonus leaves), so a perfect shot can collect them all. Level up after `LANDINGS_PER_LEVEL` landings. The first level must be easy for a 6-year-old (big raft, long preview, ~80 % of casual shots should land by shot 3).

### `FIF.Weather` (`js/weather.js`) — ambient + burst particles, deterministic with a seed
`new FIF.Weather({ width, height, seed })`, `resize(w, h)`, `setLevel(zone, {instant})`, `setLight(light)`, `update(dt)`, `burst(kind, x, y, n)` with screen-space (logical px) coordinates: kinds `splash` (drops + ripple), `leaf` (sparkles + leaf bits), `land` (puffs), `bump` (stars), `flutter` (puffs). Ambient per zone: cove → sea sparkles + far gull dots none (sprites only), jungle → butterflies + petals, lagoon → bubbles near the sea + sparkles, lantern → fireflies; at night (light < 0.6) every zone adds stars twinkling (layer `sky`) and fireflies. `particles []` each `{ sprite, x, y, size, rot, flipX, alpha, layer: 'sky'|'back'|'front' }` (px, logical). Bounded: ≤ 160 particles.

### `FIF.Bot` (`js/bot.js`)
`new FIF.Bot(world, { skill: 0..1, seed })`, `step(dt)`: while phase `'aim'`, after a short think time (0.4–0.9 s) chooses an angle that passes through the most leaves, solves the launch for the raft position predicted at landing time, adds error `∝ (1 − skill)`, animates `aim()` over ~0.5 s, then `release()`. Uses `flutter()` if it will fall short. skill 1 should land ≥ 95 %, skill 0.85 (title demo) ≈ 85 %.

### Renderer / main (integration — lead developer)
`FIF.Renderer` maps u → px, draws sky (+ day-cycle tint, sun/moon, stars), far/near parallax, sea, rock + sling + band, raft, leaves, gulls, fox, preview dots, darkness overlay with light holes (fox r 2.6 u, raft lantern r 2.2 u, torch r 1.6 u, every leaf r 0.7 u), juice, HUD (score, hearts, leaf count, island name, a small sun/moon day dial).

## 6. Test hooks
URL: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N&day=T` (`day` sets the starting `dayT`; flags never saved).
`window.FIF.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), setDay(t), aim(dx, dy), release(), flutter()`.
