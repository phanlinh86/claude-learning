# Gigi's Peekaboo Windows — Mechanics (rng · content · world · weather · bot)

Owner: mechanics engineer. Contract: `DESIGN.md` §1, §2, §6.1, §6.2, §6.5, §6.6. Built on Dee's Forest Memory (its MECHANICS
§1–§9 is the reference for every rule this file does not change). Every tuned number lives in `GW.CONFIG`
(`game/js/world.js`, commented) and can be overridden per world: `new GW.World({ config: { roundDoneTime: 1 } })`.
Tests: `node tests/unit/run.js` (39 tests, ≈ 25 s; `node tests/unit/run.js shutter` runs the tests whose name contains
"shutter"). Playtests: `node tests/sim/playtest.js [--n 6]` (2 400 sessions, ≈ 2 min on 2 cores), `node tests/sim/tune.js --config '{…}'`,
`node tests/sim/determinism.js`, `node tests/sim/content_stats.js`, `pt_kids.js / pt_variety.js / pt_absent.js / pt_idlepause.js`
(Dee's QA tools, adapted). Units: logical px (short side 720), seconds, radians, y down; rot > 0 = clockwise.

## 0. Deviations from DESIGN.md (read first)
| # | DESIGN says | the code does | why |
|---|---|---|---|
| D1 | `critter {type, action}` event | **`critter {critter, action, x, y}`** — the critter type is in `critter` (`'pigeon'│'bus'│'balloon'`), `action` ∈ `enter, land (pigeon), stop (bus), tap, leave (pigeon at the cheer)` | `type` is already the event name (`'critter'`) |
| D2 | `pointerDown` → `'critter'`, "window hits win" | the **pigeon and the balloon win inside their tight box** (they are drawn in front of the windows); outside it windows win. Order: pigeon/balloon box → window (+10 px) → Gigi (body or head box) → bus | a child tapping the pigeon on a sill expects the pigeon to react, not the window behind it; a tapped pigeon / balloon leaves at once, so it blocks at most one tap. The bus is below the windows and behind Gigi: lowest priority |
| D3 | bloom spring ω 14, ζ 0.35, range 0..1.2 | ω 14, **ζ 0.45** (peak 1.20) | ζ 0.35 overshoots to 1.31, outside the stated 0..1.2 |
| D4 | shutter spring ω 16, ζ 0.42, "overshoot ≤ 1.12 (≈ 1.1)" | ω 16, ζ 0.42 **plus a hinge stop at `openMax` 1.12** (hits it, bounces back with 0.3 of its speed) | ζ 0.42 alone peaks at 1.23; the stop is physical (the shutter hits the wall) and keeps 1.12 |
| D5 | (nothing on it) | the facade pad (`max(22, 0.22·cw)` sides + top) is fitted **inside the board** together with the grid; windows end ≥ 14 px above `groundY` (Dee: 10) | so the facade never runs under Gigi / off the board and keeps ≥ 0.5·gap below the bottom row |
| D6 | portrait board A "as Dee" (bottom ≤ head − 10) | board A bottom ≤ Gigi's **rest head box** top − 22 (16 px keep-out + 6); board B x ≥ max(body box right + 40, rest head right + 22) | the head must never come within 16 px of a window, even at rest |
| D7 | `homes` / colours as DESIGN | colours at ages ≤ 4: **one thing for the whole round** (every pair the same thing, e.g. all umbrellas) | the colour must be the only cue; with a different thing per pair the child could match by shape |
| D8 | vi initials M C O V G (5) | `initial` uses **≤ (words − 1) pairs**: vi ≤ 4, en ≤ 7 | with 5 words for 5 initials two 5-pair rounds in a row would be identical |
| D9 | first round of a chapter | **slides in via the scroll too** (`scroll.first = true`, `prevBuilding = null` for the very first building of a session; after a Talk time the last building of the previous chapter scrolls out) | one code path, Gigi always trots to her next building |
| D10 | `bounce` decays | face hops are exact ballistic arcs (`v0·t − ½gt²`, apex = the hop height), not a decaying value | exact 12 px apex at any frame rate |
| D11 | `w.gigi.headX/Y` | = the **neck joint** of the head svg (70, 160 in the 192 box), hop included; `GW.World.gigiHead(w, alpha?)` gives the head box | the renderer draws the neck to exactly this point |
| D12 | — | `w.rewards` is always `[]`; `w.collected` = every found pair `{topic, key, faceA, faceB}` (for the street-party ending); `sessionDone.rewards` = `.found` = its length | old code keeps working |
| D13 | — | `layout.dee`/`deeRect`, `w.dee`/`w.miu`, `c.flip`, `c.flipT`, `c.lift (0)`, `c.sx/sy (1)`, `c.rot (0)` stay as aliases / constants | Dee's main/render/tests |

## 1. API (DESIGN §6.2)
`setViewport(W, H, ins)`, `setAge`, `setLang`, `newSession({lastTopics}?)`, `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → window id │ `'critter'` │ `'gigi'` │ `null` (windows open **on touch-down**), `pointerMove`, `pointerUp`,
`cancelDrag()`, `hint()` → window id (manual hint; main does NOT call it on a Gigi / bubble tap — that repeats the prompt), `talkAnswer(choiceId)` → bool,
`skipTalk()`, `prompt()` → `{promptKey, params}`, `cardById(id)` (= `itemById`), `cardRect(c)`, `critterRect()` → tight box │ null.
Statics: `GW.World.logicalSize`, `computeLayout(W, H, ins)`, `chooseGrid(L, n, age)`, **`gigiHead(w, alpha?)`** → `{x, y, w, h, jx, jy}`,
`headBoxAt(jx, jy, h)`, `rectGap`, `overlapArea`, `FACADES / SHUTTERS / DOORS / ROOFS`.
Test hooks for main (`GW.debug`, DESIGN §6.6): `cardScreen(id)` = `cardRect(c)` (+ `buildingDx`) → CSS px; `gigiScreen()` =
`layout.gigiRect` ∪ `gigiHead(w)`; `critterScreen()` = `critterRect()` (logical → CSS via main's scale).

World fields: `layout, state, phase, phaseTime, stateTime, time, alpha, level, levels, topic, weather (= level = mood index), round,
roundsPerLevel, stars, levelStars, roundStars, mismatches, streak, found, pairs, open (ids of open unmatched windows ≤ 2), cur, talk,
talkAnswered, interactive, solved, wind (main copies weather.ambient.wind here), cards, building, prevBuilding, lastBuilding,
scroll, scrollT, buildingDx, prevDx, cheer (0..1 envelope in the cheer phase), critter, traffic, gigi, collected, surprise, pairsHeld`.
States: `menu → intro → round → roundDone → … → talk → levelDone → … → sessionDone`.
Phases inside `round`: **`scroll → peek → hide → play ⇄ resolve → cheer`** (roundDone: phase `'done'`).

### Events
| event | fields |
|---|---|
| `session` / `level` | `levels` / `level, topic` |
| `scroll` | `first` (no old building leaves), `building` — the camera starts panning (emitted just before `round`) |
| `round` | `round, topic, promptKey, params {n}, pairs, held, surprise ('pigeon'│'bus'│'balloon'│null), building` |
| `walk` | `foot` 0│1 — one per footfall while Gigi trots (≈ 4.4 /s, 7 per scroll): clip-clop |
| `peek` / `hide` / `play` | — (all windows open in a wave / close in a reverse wave / the child may tap) |
| `flip` | `id, nameKind, nameValue, face, size, obj, open` (the child opened a window; open = 1 or 2) |
| `tap` | `id, nameKind, nameValue, face, size, obj` (an open or matched window was tapped → say its name again) |
| `clack` | `id, v` — shutters hit shut with speed v (≈ 8–10 /s; ≥ 4): wooden clack, volume ∝ v. One per close (peek hide, mismatch) |
| `match` | `a, b, key, nameKind, nameValue, found, pairs, nameKindA/B, nameValueA/B, faceA/B, sizeA/B, objA/B` + `animal, home` (homes), `obj` (colours ≤ 4: both the same thing), `parity, word, text, lower` as Dee |
| `bloom` | `id, x, y` — a flower box pops (x, y = window bottom centre); twice per match, 0.15 s apart ("pop-pop") |
| `mismatch` | `a, b, streak, mismatches, nameKindA/B, nameValueA/B, faceA/B, sizeA/B, objA/B` |
| `hint` | `a, b, nameKind, nameValue` (+ `idle: true`) |
| `idle` | `n, promptKey, params` |
| `cheer` | `x, y` — roof centre (`building.x + w/2, building.y − roofH`): confetti + bunting + fanfare |
| `roundDone` | `round, stars, mismatches` |
| `critter` | `critter, action, x, y` (see D1) |
| `talk` / `talkAsk` / `talkResult` | `talk` / `talk, n, glowAnswer` / `correct, choiceId, answerId` |
| `levelDone` / `sessionDone` | `level, stars` / `stars, found, rewards` |
Removed: `deal`, `reward`, `land`, `shuffle`, `golden`.

### Renderer contract
Interpolate every value `v` with its `_v` partner: `v' = _v + (v − _v)·w.alpha` (`_px _py _popen _pflip _pbloom _pbounce` on windows,
`_px _py _prot` on the critter and cars, `_phx _phy _phop` on Gigi, `_pscroll _pscrollT` on the world).
- **Camera / street**: parallax offsets far `−scroll'·0.15`, mid `−scroll'·0.4`, ground `−scroll'·1.0` (mod the 1200 px tile).
  `sT = _pscrollT + (scrollT − _pscrollT)·alpha`; the **new building and its windows** are drawn shifted by `dx = (1 − sT)·W`
  (= `w.buildingDx`), the **old one** (`w.prevBuilding = {building, rect, grid, cards}`, frozen, lit) by `−sT·W` (= `w.prevDx`).
  Outside the scroll `scrollT = 1` (dx 0) and `prevBuilding = null`. Talk / levelDone / the next intro: `w.cards = []`,
  `layout.grid = null`, `w.lastBuilding` (same shape) is the lit building to draw in place (dx 0) behind the panel.
- **Building**: `GW.WindowArt.drawBuilding(ctx, layout.grid.building (+dx), w.building, {doorX: rect.doorX, light: w.cheer})`.
  `rect = {x, y, w, h, roofH, pad, door: {x (centre), y (bottom = groundY + 4), w, h} │ null, doorX, doorW}`; the facade runs from the
  top pad down to `groundY + 4`, the roof band `roofH` above `rect.y`. The door is always on free facade (never over a window, never
  behind Gigi); `null` (≈ 25 % of layouts) → draw none. `w.building = {facade, trim, shutter, door, roof 'flat'│'gable'│'arch', seed}`;
  facade and shutter always differ from the previous building's.
- **Window** `c` (all states are drawn; `matched` windows stay): `GW.WindowArt.drawWindow(ctx, c.w, c.h, c.face, open', opt)` centred
  at `(c.x + dx, c.y)` with `opt = {shutter: w.building.shutter, trim, light: c.light, glow: c.glow, bloom: bloom', bounce: bounce',
  wiggle: c.wiggle, rain: ambient.rain, sprite}`.
  `open'` 0 closed … 1 open, up to 1.12 while it swings past (draw the shutters a little further); the face shows when open > 0.05;
  a hint opens a **crack** (≈ 0.3). `light` 0..1: warm interior `#FFE9A8` + halo (lamp on, stays on). `bloom` 0..≈1.2: flowers in
  the box under the sill scaled by bloom about the box bottom (0 = no flowers). `bounce` px: draw the FACE `bounce` px higher;
  `wiggle` rad: rotate the face about its centre (mismatch "no-no"); the window itself never moves. `w.cheer` 0..1 in the cheer
  phase: extra glow on every window + bunting sway. `c.seed` (0..65535) for per-window variety (flower colours, curtains).
- **Gigi** (`w.gigi`, `layout.gigi = {x, y, h}` feet anchor): body svg at `(layout.gigi.x, layout.gigi.y − hop')`, size h × h with
  the feet anchor (128, 244)/256 — frame `walking ? (walk < 0.5 ? walk_a : walk_b) : (mood === 'cheer' && hop' > 4 ? hop : stand)`.
  Neck: `GW.GigiArt.drawNeck(ctx, neckBaseX, neckBaseY, hx', hy', thick)` — `neckBaseX/Y` already include the hop, `headX/Y` is the
  neck joint (hop included, it trails through the spring). Head svg (192 box, `0.62·h` wide) with its joint (70, 160) at
  `(hx', hy')`, rotated by `GigiArt.headAngle`; face by mood: `happy │ cheer │ oops │ think` (`moodT` > 0), `blink` 1 → blink frame,
  speaking → talk frame. Eyes look at `(lookX, lookY)`. `neckLen`, `tx/ty` (target) for debug.
  The head box never comes within 16 px of `layout.grid.rect`, stays inside `layout.safe`, joint y ≥ `ins.top + 0.35·h`.
- **Critter** `w.critter` (null when none): `pigeon` — `pigeon.svg` (sitting / pecking; `pigeon_flap.svg` while `flap > 0.5` in
  flight), feet anchor `(x, y)`, width 64, mirror by `face`, `rot`, squash `sx/sy` about the feet, `peck` 0..1 dips the head;
  `state fly → sit (on window sillId's bottom edge) ⇄ hop (to another sill every 8–14 s) → away → gone`.
  `bus` — `bus.svg` bottom-centre `(x, y)`, `w × h` 220 × 92, pitch `rot` about the wheels, squash `sx/sy` (honk), `honk` 0..1 (beep
  lines), `wave` 0..1 (passengers wave); `state in → stop → out → gone`; drawn on the road, behind Gigi.
  `balloon` — `GW.WindowArt.drawBalloon(ctx, color, 70, t)` centred `(x, y)` rotated by `rot`; the string hangs from the balloon's
  bottom `(x, y + 0.55·70)` at angle `swing` (rad, 0 = down, end x = top x + 50·sin(swing)); `state rise → away (twirls, tapped) → gone`.
  Draw the pigeon and the balloon in front of the windows.
- **Traffic** `w.traffic[] = {id, kind 'car_a'│'car_b', lane 0│1, face ±1, x, y, vx, w 150, h 75}`: sprite bottom-centre at `(x, y)`,
  mirrored when `face = −1` (sprites face right); lane 0 (far, leftward) at `groundY + 66`, lane 1 (near, rightward, the bus lane)
  at `groundY + 82`; draw far lane first, all behind Gigi and in front of the facade.
- `layout`: `{W, H, ins, portrait, groundY, gigi, gigiRect (body / hit box 1.2h × h), neckBase, headRest, headRestBox, neckMax, neckMin,
  bubble, hud, boards, board, safe, road {y0, y1}, grid}`; `grid = {cols, rows, cw, ch, gap, pad, x0, y0, slots, rect, board,
  boardIndex, minOk, building}`.

## 2. Content (DESIGN §6.1) — `GW.Content.makeRound(topic, {age, lang, rng, roundIndex, history, pairs?, pairsByAge?, peekByAge?})`
Pure and deterministic; `validate()` re-derives every pair from the faces alone (`facesMatch`) and rejects a round when a key is not on
exactly 2 windows, a pair does not match, **any window also matches a window of another pair**, a colour round below age 6 has a
confusable pair, or the colour-thing rule is broken; `makeRound` throws on a broken round (never in 96 000 test rounds).
`GW.ANIMALS` dog cat bird fish bee rabbit duck hen spider · `GW.HOMES` dog–kennel, cat–basket, bird–nest, fish–bowl, bee–hive,
rabbit–hutch, duck–pond, hen–coop, spider–web (`GW.HOME_LIST`) · `GW.THINGS` umbrella balloon car kite cup boot.
`GW.AGE_TOPICS` 3 colors/shapes/size/animals · 4 colors/shapes/count/homes · 5 shapes/count/letters/homes · 6 lower/initial/add/count ·
7 initial/add/sub/oddeven. `GW.AGE_POOLS` (rotation, Dee's `topicsFor`): 3 + count · 4 colors shapes count homes animals size · 5 + animals
colors · 6 + letters · 7 + count. `DIFFICULTY` colors < animals < size < shapes < letters < count < **homes** < lower < initial < add < sub < oddeven.

| topic | pair (key) | faces |
|---|---|---|
| colors | same colour (`c:red`) | 2 × `color {color, obj}`: ages ≤ 4 one thing for the whole round (D7), 5+ two different things per pair; ≤ 3 pairs below 6 (colour safety as Dee) |
| shapes / size / animals / count / letters / lower / add / sub / oddeven | as Dee | as Dee (count dots are round lights) |
| **homes** | animal ↔ its home (`h:dog`) | `animal {sprite 'animal_dog'}` + `home {value 'kennel', sprite 'home_kennel', animal 'dog'}`; name kinds `animal` / `home`; pairInfo `{nameKind 'animal', nameValue, animal, home}`; warm-up 2 pairs |
| initial | letter ↔ animal whose word starts with it (`I:D`) | en dog D cat C bird B fish F bee B rabbit R duck D hen H spider S (7 initials); vi mèo M cá C ong O vịt V gà G (chó chim thỏ nhện skipped); ≤ words − 1 pairs (D8) |

Window names: `color` (+ `card.obj`), `shape`, `animal` (+ `card.size`), `home`, `dots`, `number`, `letter`, `sum`, `diff`.
Talk (`makeTalk`): colours show a coloured thing (`params.obj`), **homes "Where does the {animal} live?"** (`show` = the animal face,
`params {animal, home}`, 3 `home` choices with `sprite`), animals "Where is the {animal}?" (show null), the rest as Dee.

## 3. Layout, grid, building (DESIGN §2)
`groundY = H − ins.bottom − 90`. Gigi feet landscape `(ins.left + 110, groundY + 22)`, h 150; portrait `(ins.left + 100, groundY + 24)`,
h 140. Body / hit box `gigiRect` = 1.2·h × h above the feet. Neck base = feet + ((172 − 128)/256·h, (96 − 244)/256·h); rest head joint =
base + (0.12·h, −0.6·h); head box = 0.62·h square with the joint at (70/192, 160/192) of it; reach `neckMax` 1.6·h, `neckMin` 0.45·h.
Bubble / HUD as Dee. **Boards**: from bubble bottom + 24 to groundY − 14. Landscape x ≥ gigi.x + 130 (the rest head + 16 px keep-out ends
at gigi.x + 119). Portrait **A** full width, bottom ≤ rest head box top − 22; **B** right of Gigi (D6).
**Grid**: every cols × rows with ≤ 1 empty slot (last row centred) on every board; window w:h 0.78, gap = max(18, 0.16·cw), the facade pad
p = max(22, 0.22·cw) left / right / top must fit the board too (bisection per shape); the largest window wins (cap 210), ties as Dee.
Hit test: window rect + 10 px, nearest centre wins. Colour rounds swap yellow windows to slots ≥ 40 px from Gigi's box.
**Building rect** = grid rect + p on the sides and the top, down to `groundY + 4`; `roofH = 0.32·cw`. Door (0.42·cw wide): (1) in the free
facade band under the windows when it is ≥ max(56, 0.4·ch) + gap/2 tall (portrait A: right of Gigi); (2) in the empty half-slot of an
incomplete last row; (3) in a bay added on the right (the whole grid shifts left inside its board if needed); else none.

Window widths (px) — worst viewports (age 6; ∅ = no door):

| viewport | 2 pairs | 3 | 4 | 5 |
|---|---|---|---|---|
| iPhone portrait notch 720×1556 | 2×2 210 (A) | 2×3 182 (B) | 3×3 179 (A) | 2×5 139 (B) |
| iPhone landscape notch 1556×720 | 4×1 210 ∅ | 6×1 149 | 4×2 140 | 5×2 140 |
| iPad landscape insets 960×720 | 4×1 141 | 3×2 133 | 4×2 133 ∅ | 5×2 114 ∅ |
| iPad portrait insets 720×960 | 2×2 180 (B) ∅ | 3×2 126 (B) | 3×3 121 (B) | 5×2 104 (A) |
| 16:9 1280×720 | 4×1 207 ∅ | 3×2 153 | 4×2 153 | 5×2 153 |

The tuned game deals ≤ 3 pairs at ages 3–4 (smallest 126 px ≥ 120) and ≤ 5 at 6–7 (smallest **104 px** = the 5+ minimum, iPad portrait
with insets). 6 pairs (DESIGN table) would go below 104 on iPads: CONFIG `pairsByAge` keeps it at 5.

## 4. Motion (fixed 1/120 s sub-steps, semi-implicit Euler)
| element | model and numbers |
|---|---|
| scroll | `scrollT` = smooth-step(t / 1.6 s); `scroll += W`; old building drawn at −scrollT·W, new at (1 − scrollT)·W; the critter and the cars shift with the street; 0.15 s after it ends → peek |
| Gigi trot | `walk` phase += 2.2 /s while `walking` (scroll), a `walk` event per footfall; body bob 4·│sin 2π·walk│ px added to `hop`; head leans 0.1·h forward |
| peek / hide | windows open in slot order every 0.05 s; hold `peek` s once all are ≥ 0.95; close in reverse; `play` once every window < 0.5 and closing |
| shutters | spring on `open` → `openT` (1 / 0): ω 16, ζ 0.42; hinge stop at 1.12 (v × −0.3); 0.95 reached in ≈ 0.12 s, peak 1.12, settles in ≈ 0.5 s. Closing: crossing 0 → `open = 0`, v × −0.25 (a small rebound ≈ 0.03), `clack` when it hits at ≥ 4 /s; < 0.6 /s just stops. Breeze: open shutters' target + 0.03·(wind/22)·sin(2π·0.7t + phase) |
| hint crack | the hinted closed windows open to 0.3 from 0.2 s to 0.65 s (spring, so they peek ≈ 0.37 then shut with a soft clack), glow 2.5 s (in 0.2, out 0.4) |
| match | check when both are ≥ 0.95; hold 0.25 s; `light` smooth-step 0 → 1 over 0.4 s; flower boxes pop at hold + 0.05 / + 0.2 s (bloom events), spring ω 14, ζ 0.45 → peak 1.20, settles 1; both faces hop twice (exact parabolas, 12 px apex, g 2000 → 0.22 s each); phase back to `play` 0.4 s after the check (other windows can be opened while the boxes bloom) |
| mismatch | faces wiggle `0.08·sin(2π·3u)·(1−u)²`, u = t/0.5 s; both stay open 1.0 s (age 3: 1.2 s), then close (clack) |
| cheer | 0.7 s after the last pair's check: phase `cheer` 1.2 s, `w.cheer = sin(π·t/1.2)`, every window's face hops 10 px in slot order 0.06 s apart, Gigi `cheer` (3 hops), the pigeon flies off |
| Gigi head | 2-D spring on the neck joint → target (ω 9, ζ 0.55: ≈ 12 % overshoot, measured 1.01–1.2 of the travel); target = rest, or after a `flip` / `tap` / hint on window c for 3 s the valid point nearest c (reach disc, then pushed out of grid rect + 16 px grown by the head box, on screen, joint y ≥ top + 0.35·h; nearest by projections + a 40 × 6 polar sample, cached per target), the roof centre in the cheer, rest + lean while walking. Hard limits every step: stretch ≤ 1.08·neckMax, ≥ neckMin, on screen, off the windows (slides along the keep-out). The hop lifts the target (the head trails) |
| pigeon | bezier arc in from off-screen (control point 0.25·d + 30 px above), 1.4 s, flap 8 Hz; lands on a random spot of a window's bottom edge (±0.25·w) with a squash; pecks every 1.2–2.8 s (0.3 s); every 8–14 s flutters to another sill (0.8 s); tap → flies off up and out in 1.2 s (accelerating) → gone |
| bus | enters at x = −w/2 − 20 on lane 1, cruise 120 px/s, brakes (160 px/s²) to stop at W/2, stops 2 s (+1 s per honk, ≤ +2), accelerates 120 px/s² out to the right; pitch ±0.05 rad from the acceleration; honk: squash 0.08 (spring ω 16 ζ 0.3), `honk` 1 → 0 in 0.5 s, `wave` 1 → 0 in 1.5 s; follows a car ahead (gap 40 px) |
| balloon | starts at the pavement in front of the windows (15–85 % of the grid width), rises 40 px/s, sways 18 px at 0.35 Hz (+0.4·wind·t); string = damped pendulum (g 980, L 50, damping 1.6 /s) driven by the balloon's sideways acceleration; tap → accelerates up to 380 px/s and twirls (9 rad/s) → gone off the top; colour = a palette colour not on the round's windows |
| cars | 0–2, one every 6–14 s (retry 1 s if the lane entry is busy), lane 0 leftward / lane 1 rightward at 140–200 px/s; car-following (target speed ≤ 3·(gap − 40) + leader speed, accel 300 px/s²) → never overlap; none spawn in talk / levelDone / sessionDone; deterministic (own ambient RNG) |

## 5. Rules (Dee's, unchanged)
Taps open windows only in `play` and while a mismatch shows; ≤ 2 open; open / matched → `tap`; just after a match (≤ 0.4 s) closed
windows wait. Third tap after ≥ 0.5 s of a shown mismatch closes both and opens the new one (counted once); a pending match is never
broken. 3 taps on the one open window (no idle reset) → auto hint. Stars: ≤ max(1, pairs − 1) mismatches → 3, ≤ 2·pairs → 2, else 1;
Talk right +1 (max 52). Hints: 3 mismatches in a row (cooldown 6 s); idle nudges 12, 30, 57, 87 … s (×1.5, ≤ 30 s gaps), hint from the
2nd. Chapter: 4 buildings, Talk after ≥ 3 once the chapter passed 80 s; talkAsk every 12 s, glowAnswer from the 2nd. Adaptive hold after a
hard round (1 star or > 40 s of play). Taps on Gigi (and on empty space in play) reset the idle timer; critter taps do not (they are not play).
**Surprise round**: round index 2 of every chapter, type `['pigeon','bus','balloon'][(level + offset) % 3]` (offset random per session),
appears 1.5–3.5 s after play starts (the bus waits for a free lane), never a mistake, never blocks play for more than one tap.

## 6. Timing (CONFIG; playtest-tuned)
`introTime 2.5`, `scrollTime 1.6` + `scrollSettle 0.15`, `peekByAge 2.8 / 2.2 / 2.0 / 1.5 / 1.5 × (0.6 + 0.1·windows)`,
`pairsByAge` 3: 2,2,2,3 · 4: 2,2,3,3 · 5: 2,3,4,4 · 6: 3,3,4,5 · 7: 3,4,4,5, `mismatchShow 1.0` (age 3: 1.2), `matchResolveTime 0.4`,
`matchCelebrate 0.7`, `cheerTime 1.2`, **`roundDoneTime 0.8`** (Dee 1.8: the stars can stay on screen during the scroll; it pays for the
scroll + cheer), `talkAfterAnswer 2.0`, `levelDoneTime 2.0`, `chapterTimeLimit 80`. Per round the fixed overhead is scroll 1.75 + celebrate
0.7 + cheer 1.2 + roundDone 0.8 = 4.45 s (Dee: deal ≈ 1.2 + burst 0.85 + end 0.4 + roundDone 1.8 = 4.25 s); the faster shutters
(0.12 s to the check vs Dee's 0.26 s flip) give back ≈ 0.15 s per turn.

## 7. Weather (`GW.Weather`, fixed 1/60 s steps; hard cap 140 particles, ambient ≤ 110)
| mood | sky top → bottom (horizon), tint | ambient | particles / extras |
|---|---|---|---|
| 0 sunny | `#8CCBF2 → #E2F3FB` (`#F4F1E4`) | wind 6 + gust 8, sun 1 at (0.78, 0.14), cloudSpeed 1 | 3 soft sky sparkles, 3 slow clouds |
| 1 breezy | `#9FD0EE → #E8F4F6` (`#F1F3E6`) | wind 22 + gust 16 (peaks 38–40), sway 0.45, sun 0.9, cloudSpeed 2.5 | 7 `leaf_a` + 7 `leaf_b` + 6 `paper` blown across (60 % re-enter from the left) + 2 front leaves; fast clouds; **kites** `wx.kites` (2 on screens > 1100 px, else 1) bobbing in a figure-8 on strings from below the screen, lifted by gusts |
| 2 rain | `#8E9FB3 → #C9D3DD` (`#D5DCE2`), `rgba(70,90,120,.10)` | wind 10 + gust 10, darkness 0.18, sun 0, `rain` 1, `wet` 1 | ≈ 90 `drop` streaks (750–950 px/s, slanted by `4·wind + 20` px/s, `rot = −atan2(vx, vy)`, 12 % front) + `splash` rings where they hit the pavement / road (≤ 22, 0.22–0.34 s); `rain_cloud` clouds |
| 3 rainbow | `#A7D3EE → #F0F1F4` (`#FBF3E6`), warm `.05` | wind 5 + gust 6, sun 0.8 | the rain fades linearly to 0 over 6 s, `rainbow` smooth-step 0 → 1 from 2 to 8 s, `wet` decays to 0.4 (τ 8 s); 10 + 3 sparkles |
`ambient = {skyTop, skyBottom, horizon, tint, wind, gust, windBase, sway, sun, sunX, sunY, darkness (= max(mood, 0.18·rain)), rain, rainbow,
wet, cloudSpeed, mood, season (= mood), moon 0, stars 0}`; `setWeather(i)` crossfades sky / numbers / emitter counts over 2.5 s (rain
ramps in over 2.5 s). `burst(x, y, {kind: confetti│puff│sparkle})` unchanged (cheer confetti from the roof: `burst(cheer.x, cheer.y)`).

## 8. Bot (`GW.Bot`, DESIGN §6.6)
As Dee (memory skill, reaction (0.9 − 0.5·skill)·U(0.8, 1.25) s, eased finger path), plays only via `pointerDown`. Sees a face when a
window is fully open or a hint crack is open (> 0.25). Aims ± 0.25·size but never on the critter's box (re-aims if the pigeon moved
there). Taps each new critter once with p = `critterTaps` (default 0.2). `stats {taps, flips, matches, mismatches, misses, talks,
talkRight, critters}`; skill 1 never mismatches and never misses (test).

## 9. Playtest results (`node tests/sim/playtest.js --n 6`: 2 400 sessions = 10 drivers × 5 ages × 2 langs × 4 viewports × 6; 118 s)
Child models (`tests/sim/lib.js`, Dee's, with memory): typical(age), careful4, toddler, slow3, tapper, spammer, bots 0.3 / 0.6 / 0.9 / 1.
New here: a child taps each critter once with p = 0.75 → 0.45 (typical 3 → 7; toddler 0.9, slow3 0.8, careful4 0.6), and a tap that
lands on the pigeon / balloon in front of a window just does not open it (the child tries again).

| driver / age | session mean (p90, max) | chapter mean (p10–p90) | round | mismatch / round | rounds with hint | stars (of 52) |
|---|---|---|---|---|---|---|
| typical 3 | 399 s (425, 457) | 100 s (88–113) | 21.7 s | 0.9 | 6.9 % | 48 |
| **typical 4** | **383 s (405, 447)** | **96 s (86–107)** | 20.8 s | 0.9 | 5.8 % | 49 |
| typical 5 / 6 / 7 | 393 / 396 / 377 s (p90 ≤ 416, max 435) | 98 / 99 / 94 s | 20–22 s | 0.6–0.9 | 0–3 % | 50–52 |
| careful4 3 / **4** / 5 | 439 / **429** / 443 s (p90 466 / **455** / 477) | 110 / 107 / 111 s (48 % of the age-4 chapters cut to 3 rounds) | 25–32 s | 1.1 / 1.4 / 2.0 | 10 / 14 / 22 % | 45 / 41 / 36 |
| toddler 3 / 4 | 388 / 394 s (p90 408 / 426) | 97 / 99 s | 21–22 s | 1.3 / 1.6 | 16 / 19 % | 45 / 44 |
| slow3 3 / 4 | 466 / 512 s (p90 511 / 586) | 116 / 128 s (90 / 97 % cut) | 33–37 s | 1.3 / 1.8 | 19 / 24 % | 35 / 33 |
| tapper 3 → 7 | 418 → 617 s | 104 → 154 s | 25–48 s | — | — | — |
| spammer 3 → 7 | 238 → 385 s | 59 → 96 s | 12–22 s | — | — | — |
| bot 0.3 / 0.6 / 1 | 297–408 / 258–328 / 240–288 s | 74–102 / 65–82 / 60–72 s | 12–24 s | ≤ 1.8 / ≤ 0.3 / 0 | — | — |

Typical-child round time by topic (age 4): colours 21.0, shapes 20.5, count 20.8, homes 20.9 s (5 windows on average).
**Verdict**: typical 4-year-old chapter **95.9 s ✔** (60–100); child models at their ages (typical 3–7, careful4 3–5, toddler 3–4)
session p90 **448 s ✔** (≤ 480); careful 4-year-old p90 **455 s ✔**; typical sessions max **457 s ✔**; 2 400 / 2 400 finished,
**0 stuck rounds, 0 NaN, 0 errors**, 1 round > 180 s (slow3 at age 7); Gigi's head on the windows / off-screen **0 / 760 932** checks;
smallest window 104 px, 0 grids below the age minimum; 9 507 critters appeared, 4 082 tapped. Slow dreamy 3-year-old (INFO): p90 567 s
at ages 3–4 even with 94 % of its chapters cut to 3 rounds (its 2.5–4.5 s between taps dominate, as in Dee).
Absent child: 11 idle nudges in 5 min (12, 30, 57, 87 … s), 10 Talk re-asks in 2 min. Determinism (`determinism.js`): 10 / 10 cases
replay identically at 1/30, 1/60, 1/120 s frames. Content (`content_stats.js`): 0 identical consecutive rounds in every cell; homes
values spread 10–12 % over the 9 animals. Where the time goes (typical age 4, `pt_kids.js`): play 52 %, peek 12 %, scroll 7 %,
resolve 5 %, cheer 5 %, roundDone 3 %, mismatch shown 3 %.
Tuning (`tune.js --n 6`, typical / careful4 at ages 3–5): with Dee's `roundDoneTime 1.8` plus the new scroll + cheer the chapters were
104 / 98 / 101 s (typical 3 / 4 / 5, two of them over 100) and careful4 age-5 p90 491 s (> 480); `roundDoneTime 0.8` (+ `matchCelebrate 0.7`)
brings them to 100 / 96 / 98 s and 477 s. Typical sessions p90 448 s (Dee 453 s).

## 10. Files
`game/js/rng.js` (unchanged mulberry32), `content.js`, `world.js`, `weather.js`, `bot.js`; `tests/unit/run.js` (+ `load.js`);
`tests/sim/lib.js` (harness + child models), `playtest.js`, `run_matrix.js`, `summarize.js`, `tune.js`, `determinism.js`,
`content_stats.js`, `pt_*.js` (Dee's QA tools; reward crowding is now always 0). `tests/sim/out/` holds generated reports (JSON ignored).
