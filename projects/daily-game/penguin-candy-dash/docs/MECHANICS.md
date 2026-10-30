# Pip's Candy Dash: mechanics

Code: `game/js/rng.js` (CD.RNG), `world.js` (CD.CONFIG, CD.DIFFICULTY, CD.World), `weather.js` (CD.Weather), `bot.js` (CD.Bot).
Tests: `node tests/unit/run.js` from the project folder (30 tests, about 30 s).
Contract: `docs/DESIGN.md` §2 and §5. Every name there is kept. Additions are listed in section 4.

## 1. Research summary (what was used, and why)

| Topic | What the references say | What Pip's Candy Dash does |
|---|---|---|
| Top-down movement feel ([Game feel tips II](https://www.gamedeveloper.com/design/game-feel-tips-ii-speed-gravity-friction), [kinematic friction recipe](https://kidscancode.org/godot_recipes/3.x/physics/kinematic_friction/)) | Model velocity, not position. Accelerate toward input × max speed and brake with friction. Time to max speed of about 0.1–0.2 s feels responsive with weight; instant feels twitchy, and more than 0.3 s feels like ice. | Pip's velocity moves toward `input × maxSpeed` by at most `accel·dt`, a vector "approach", so turning and stopping share one rule. 90 % of top speed in 0.13 s when small and 0.17 s when big. Stopping from full speed drifts about 18 px: a little slide, never slippery. |
| Arrive steering ([Reynolds steering behaviours](https://www.red3d.com/cwr/steer/); lecture notes [1](https://imada.sdu.dk/u/rolf/Edu/DM842/E17/lec2.pdf), [2](https://diana.ms.mff.cuni.cz/pogamut_files/lectures/2015-2016/steeringBehaviors-slides.pdf)) | Seek overshoots. Arrive scales the desired speed down inside a slow radius. Separation pushes neighbours apart. Wander picks smoothly changing targets. | Pointer-follow uses a braking-aware arrive: `want = min(max, √(2·brake·0.85·dist))`, stopping inside 6 px. It never overshoots by more than 4 px, which a test checks. Bears use seek, arrive, wander and separation. |
| Fair, readable chasers ([Pac-Man Dossier](https://www.gamedeveloper.com/game-platforms/feature-the-i-pac-man-i-dossier), [ghost targeting](https://gamedesignskills.com/game-design/pac-man-pathfinding/)) | Each ghost has one simple, learnable targeting rule (chase, ambush, flank, shy). Personalities are readable because each is distinct and consistent. Ghosts slow in tunnels, and the player can outrun them. | Three bears, one rule each. **Red** wanders: random waypoints, 40 % of them near Pip. **Green** follows Pip's trail 0.8 s late, and seeks Pip directly only within 60 px, so turning shakes it off. **Orange** guards: it orbits its gem and charges only when Pip comes within 120 px of that gem, then gives up. Every bear is capped at 0.75 × Pip's current max speed, so Pip can always get away. |
| Growth as risk/reward ([agar.io](https://en.wikipedia.org/wiki/Agar.io)) | Bigger means more powerful but slower and an easier target, and you can split or shed mass to escape. | Each gem adds one size step: ×1 to ×5 points, but −21 % top speed, lazier turning and a 60 % bigger hitbox. **Pop!** is the "split": shed all size for a bonus plus a stun burst. Bumps shrink Pip by one step. |
| Slippery and bouncy terrain ([slippery surfaces devlog](https://itch.io/devlog/1040069/slippery-surfaces-arrive.amp), [frictionless ice trope](https://tropedia.fandom.com/wiki/Frictionless_Ice)) | Good ice lowers acceleration and friction but keeps the same top speed and some control; zero control frustrates. Bouncers should push predictably. | Ice: acceleration and braking × 0.25. A stop drifts about 4× farther, you can still steer, and Pip shows the slide frame while coasting. Puffs: an outward drift of 2.2 px/s per px of depth plus a kick and a little hop on entry. Small Pip can push through a puff; big Pip and bears get pushed round it. |
| Hit-stun and i-frames ([i-frames on Giant Bomb](https://giantbomb.com/wiki/Concepts/Invincibility_Frames), [Terraria](https://terraria.wiki.gg/wiki/Invincibility_frames), [i-frames how-to](https://bugnet.io/blog/how-to-implement-invincibility-frames)) | After a hit: a short stun with knock-back (0.2–0.5 s), then about 1–2 s of blinking invulnerability. Kids' games use the longer end. The attacker should back off so hits don't chain. | Hurt pose and no control for 0.35 s with a 280 px/s knock-back, then 1.5 s of invulnerability (Easy 2.0, Hard 1.2). The bear bounces back and rests 0.8 s. A guard never charges a blinking Pip. Bear hitboxes are 85 % of their size. |
| Sister-game playtest lessons (`foxy-reef-memory/docs/reports/playtest_report.md`) | Random input must not beat skill, endless modes must end, and the first level must be easy for a kid. | All three are checked in unit tests (section 5). |

## 2. Key tunables (`CD.CONFIG`, Normal)

| Group | Key | Value | Why |
|---|---|---|---|
| Timing | `step` | 1/120 s | Fixed sub-steps give determinism for any dt. |
| | `introDelay`, `clearTime` | 1.4 s, 2.0 s | Time for the banner and for the gate walk-out. |
| Pip | `speedSmall` → `speedBig` | 210 → 165 px/s | Linear in size; −21 % when big. |
| | `accelSmall/Big`, `brakeSmall/Big` | 1500/950, 1200/850 px/s² | A heavy Pip turns and stops more lazily. |
| | `scalePerSize`, `pipRadius` | 0.15, 16 px | Scale 1.0 → 1.6, so radius 16 → 25.6. |
| | `arriveStop`, `arriveSafety` | 6 px, 0.85 | Pointer-follow stops without overshoot. |
| | `facingHyst` | 25 px/s | No left/right flicker at low speed. |
| | `strideLen` | 22 px per frame | The waddle is tied to distance, so feet don't skate. |
| Dash | `dashTime`, `dashMul`, `dashCooldown` | 0.25 s, ×2.2, 1.2 s | Travels about 115 px when small, enough to clear one bear. |
| Pop! | `popBase`, `popPerBear`, `popRadius`, `stunTime` | 50, +10, 160 px, 2.5 s | Rewards popping near bears (risk). |
| Bump | `invulnTime`, `hurtTime`, `knockPip`, `bearRestTime`, `dropGems` | 1.5 s, 0.35 s, 280, 0.8 s, 2 | Readable, forgiving and never chains. |
| | `hitForgive` | 0.85 | The bear hitbox is smaller than the art. |
| Gems | `gemCount` | [3, 4, 4, 5], +1 per lap, max 6 | |
| | `gemTelegraph`, `gemRespawn`, `gemLife` | 0.6 s, 0.4 s, 14 s | A gem left in a bad spot moves on. |
| | `looseLife`, `looseTelegraph` | 6 s, 0.35 s | Dropped gems can be grabbed back, but not instantly. |
| Bears | `bearSpeed` red/green/orange | 88 / 100 / 92 px/s | Before multipliers. |
| | `bearBiomeMul`, `bearLapMul` | [0.85, 1, 1.05, 1.1], +12 % per lap | The meadow is gentle. |
| | `bearCapFrac` | **0.75 × Pip's current max speed** | A hard cap, re-applied every sub-step. |
| | `bearCounts`, `bearsPerLap`, `bearMax` | [2, 3, 3, 4], +1, 8 | Level 0 has one wanderer and one follower. |
| | `followLag` | 0.8 s, −0.15 per lap, min 0.35 | The follower gets keener on later laps. |
| | `guardOrbitR`, `guardAggro`, `guardGiveUp` | 62, 120, 210 px | |
| Zones | `slowMul` | 0.55 | River max speed, for everyone. |
| | `iceMul` | 0.25 | Glacier acceleration and braking. |
| | `bouncyPush`, `bouncyImpulse`, `hopVz` | 2.2 /s, 140 px/s, 150 px/s | A puff core pushes 154 px/s, less than Pip's speed. |
| Levels | `jarTargets` | [12, 15, 18, 20], +20 % per lap | |
| | `clearBonusPerHeart`, `healOnClear` | 100, +1 heart | |
| | `gateOpenBearMul` | 0.6 | A calm run to the gate. |

### Difficulty presets (`CD.DIFFICULTY`)

| Key | Easy | Normal | Hard |
|---|---|---|---|
| `heartsMax` | 5 | 3 | 3 |
| `bearSpeedMul` | 0.8 | 1 | 1.15 |
| `bearBiomeMul` | (normal) | [0.85, 1, 1.05, 1.1] | [1, 1.05, 1.1, 1.15] |
| `bearCounts` | [1, 2, 3, 3] | [2, 3, 3, 4] | [3, 3, 4, 5] |
| `jarTargets` | [8, 10, 12, 14] | [12, 15, 18, 20] | [15, 18, 22, 25] |
| `invulnTime` | 2.0 | 1.5 | 1.2 |
| `followLag` | 1.0 | 0.8 | 0.6 |
| `guardAggro` | 100 | 120 | 120 |
| `healOnClear` | 1 | 1 | 0 |

## 3. Zones exactly as exposed in `w.zones`

These match the environment art. The integrator asked for no slow area from x 850 on, because of the wafer landing under the gate.

- **River** (`biome` 1). Three `slow` rects with y 270–350: x 40–300, 360–640 and 700–850. There is no slow on the bridges (x 300–360, 640–700) or on the gate landing (x ≥ 850). `w.bridges` lists the three non-slow wafer rects: `{300,270,60,80}`, `{640,270,60,80}`, `{850,270,70,80}`.
- **Clouds** (2). Three `bouncy` circles: (300, 200, r 70), (640, 380, r 80), (760, 170, r 60).
- **Glacier** (3). Two `ice` rects: (160, 140, 260, 140) and (560, 320, 280, 150).
- **Meadow** (0). `[]`.

Terrain is sampled at the entity's ground point (its feet).

## 4. Contract additions (all new names, none renamed)

- **World fields:**
  - `w.steps` counts the sub-steps run.
  - `w.dashes` and `w.levelsCleared` are counters.
  - `w.gemsWanted` is the number of gems kept on the arena.
  - `w.bridges` lists the river's non-slow wafer rects.
  - `w.levelInfo(i)` returns `{biome, lap, jarTarget, bears, gems, bearMul, followLag}`.
  - `w.pipMaxSpeed(size)`, `w.bearCap()`, `w.terrainAt(x,y)` and `w.snapshot()` are helpers.
- **pip:**
  - `z` is the hop height in px. Draw the sprite at y − z; the shadow stays on the ground.
  - `dashT` is the dash time left; `hurt` and `cheer` are the time left in those poses.
  - `onIce`, `inSlow`, `inPuff` say what terrain Pip is on.
- **bear:** `z` (hop); `mode` (`idle`, `wander`, `follow`, `orbit`, `charge`, `rest` or `stun`, handy for a debug overlay or a "!" bubble on charge); `rest`.
- **gem:** `bob` is the bob height in px. Draw the gem centre at `(x, y − cfg.gemHover − bob)`, where `gemHover` = 14. `life` is the seconds until the gem vanishes, for both normal and loose gems; blink it when it is below 1.5.
- **Events:**
  - `go {level}`: the intro ends and play begins.
  - `heal {hearts}`: hearts refilled on a clear.
  - `bounce {x,y,who:'pip'|'bear',id}`: a puff boing.
  - `gemgone {id,x,y,loose}`: a gem expired (show a poof).
  - Extra fields on contract events: `biome.lap`, `gem.loose/id`, `dash.dx/dy`, `bump.bear/kind`, `dead.level`.
- **squash** is a signed wobble: draw scaleX × (1 + squash) and scaleY × (1 − squash). It is 0 at rest and peaks at about 0.16 on a grow, 0.3 on a Pop and 0.22 on a bump.
- **Weather:**
  - `CD.Weather.SPRITES` lists the sprite names: sparkle, sugar, floss, sprinkle_pink, sprinkle_blue, sprinkle_yellow, ripple, snowflake, star and dot.
  - `wx.biome` (with `wx.season` as an alias), `wx.wind`, `wx.fullCount(b)`, `wx.stats()`.
  - `update(dt, {wind})` takes an optional extra wind. The sister game called this `current`.
- **Integrator note:** `update(dt)` no longer clamps dt, so that `?speed=N` works. `main.js` should clamp a long frame gap (for example `min(dt, 0.1)`) **before** multiplying by speed.

## 5. Design decisions

1. **Dash gives no free invulnerability.** A dash into a bear is a normal bump. The dash is an escape tool, not an attack, so spamming it never protects you; this matters for the random-input check.
2. **The jar holds the bump drops.** A bump takes up to 2 gems out of the jar and scatters them as loose gems. Grabbing them back returns them to the jar, so a bump costs time but is recoverable. Once the gate is open the jar is locked: drops cost nothing and are worth points only.
3. **Size resets to 1 at each biome start,** so every biome begins fair.
4. **The collision radius follows `size` at once,** not the smoothed `scale`. Shrinking from a bump or a Pop helps on the same frame.
5. **The bear speed cap uses Pip's current size,** as DESIGN asks. A big Pip is slower, and so are the bears. The cap applies again every 1/120 s sub-step, plus the terrain multiplier. A knock-back can briefly reach 0.95 × Pip's slowest speed, which is still slower than Pip.
6. **Bears are harmless while fading in** (`spawnT` < 1, 0.8 s, during the intro) and while stunned. A guard won't charge a blinking Pip.
7. **Puffs push by an outward drift added to position,** not a spring added to velocity. With a spring, braking cancelled the push and a Pip standing in a puff never moved.
8. **Gems never spawn** under the hearts or the jar (`hudAvoid`), within 90 px of the gate, or in the inner half of a puff. They spawn ≥ 130 px from Pip and ≥ 80 px from bears. The rule relaxes after 40 failed tries, so a crowded late lap still spawns gems.
9. **Endless laps end.** Each lap adds +1 bear (up to 8), +1 gem, +20 % jar size, +12 % bear speed (still capped) and a shorter follower lag. A skill-1 bot dies in lap 4–5 on Normal.
10. **Healing on a clear** (+1 heart, not on Hard) keeps lap 1 kind. The clear bonus is counted **before** the heal.
11. **Weather** runs fixed 1/60 s sub-steps with an accumulator, so it gives the same particles for any dt partition. The sister game's variable sub-step did not. Ripples read the river rects from `CD.CONFIG`, so they never appear on the bridges or the landing.

## 6. Simulated balance (`CD.Bot` and a random masher, 12 seeds each, 40 min cap)

The random masher picks a new direction every 0.3–1 s and presses the action button 3 % of frames. The bot sees everything and reacts within 0–0.35 s, so a real child plays like the lower rows or below.

| Diff | Player | Clears Meadow | Clears lap 1 | Median death level | Median min | Median score | Median s per biome (lap 1) |
|---|---|---|---|---|---|---|---|
| easy | bot 1 | 100 % | 100 % | 27 | 14.3 | 33580 | 19 |
| easy | bot 0.6 | 100 % | 100 % | 23 | 11.7 | 27900 | 19 |
| easy | bot 0.3 | 100 % | 100 % | 18 | 8.8 | 20210 | 21 |
| easy | random | 33 % | 0 % | 0 | 2.9 | 530 | 190 |
| normal | bot 1 | 100 % | 100 % | 18 | 10.2 | 21860 | 26 |
| normal | bot 0.6 | 100 % | 100 % | 14 | 8.2 | 16650 | 26 |
| normal | bot 0.3 | 100 % | 92 % | 9 | 5.2 | 8810 | 31 |
| normal | random | 0 % | 0 % | 0 | 0.4 | 20 | – |
| hard | bot 1 | 100 % | 75 % | 7 | 4.2 | 7730 | 34 |
| hard | bot 0.6 | 100 % | 83 % | 4 | 3.0 | 4850 | 34 |
| hard | bot 0.3 | 100 % | 17 % | 2 | 1.6 | 2170 | 34 |
| hard | random | 0 % | 0 % | 0 | 0.3 | 0 | – |

- **Skill wins.** A random masher scores about 1/700 of the bot on Normal. Even on Easy it never clears lap 1, and it clears the Meadow on Easy only by luck (33 %).
- **Every run ends.** No bot survives 40 minutes on any difficulty.
- **Pacing.** The bot needs 20–35 s per biome. A human will take roughly 40–90 s, which hits the requirement's "clear goal every 60–90 s". If the playtest finds levels too short, raise `jarTargets` first.
- **For the playtest agent.** The bot is a strong "perfect-eyes" player. A child model with slower reactions (0.5–1 s), missed bears and pointer-follow input would give a more honest view of the kid experience on Normal.

## 7. Bot (`CD.Bot`)

1. **Target.** The open gate if there is one. Otherwise the gem with the lowest cost: travel time + 1.6 × danger + a penalty if a bear is near the path. Danger is bears predicted near the gem, with orange bears weighted × 1.3. Loose gems get a bonus. The bot switches target only if the new one is better by more than 0.35.
2. **Steering.** A unit vector to the target, plus repulsion from bears predicted 0.3 s ahead. The repulsion is quadratic inside 120 px and has a sideways component so the bot curves round on the target's side. Walls push it away so it isn't cornered, except when it heads for the gate. It ignores bears while invulnerable for more than 0.5 s.
3. **Dash** when a bear is within a 26 px gap and the dash is ready.
4. **Pop!** at max size when a bear is within 115 px, or 2 or more are within Pop range.
5. **Skill < 1:**
   - decisions refresh every (1 − skill) × 0.3 s plus a little jitter;
   - heading noise has an amplitude of (1 − skill) × 0.9 rad;
   - bears are noticed later (the avoid radius shrinks to 55 %);
   - escapes and Pops are sometimes missed.
6. **`bot.stats`** = `{decisions, gems, bumps, pops, dashes, levels, deaths, maxLevel}`. It counts from the world's counters, so it never drains the world's events.

## 8. Weather (`CD.Weather`, DESIGN §5.2)

Steady counts per biome: meadow 47, river 42, clouds 45, glacier 60. During a 2 s hand-over the old biome fades out over at most 2 s while the new one ramps in, so the total briefly reaches about 100.

| Biome | Emitters | Motion |
|---|---|---|
| Meadow | sparkle, sugar, dot glints (back); floss puffs (back and front); front sparkles | drift: velocity eases to a random target every 1–3 s, with a twinkle; floss: wind plus a bob |
| River | ripples on the band (back); sparkle, sugar, dots | ripple: born on the band, grows 0.4 → 1.6×, fades over 2–3 s, then is reborn |
| Clouds | floss (back and front); rainbow dots cycling 6 colours; sparkles; stars | floss drifts in a stronger wind; rainbow dots rise slowly |
| Glacier | sprinkles in 3 colours (tumbling: spin plus a flipX of cos); sugar snowflakes in 3 depth layers (far dots, mid, front); sugar | fall: terminal speed, pendulum sway, parallax-scaled wind |

Ambient tint per biome: warm cream, cocoa, pink, and icy blue with fog 0.12. The tint blends with the ramps during a hand-over.
