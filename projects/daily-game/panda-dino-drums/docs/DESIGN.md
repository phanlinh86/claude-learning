# Momo's Dino Drums — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.DD`**. Classic `<script>` files, no build step. Storage prefix `pdd:`. Windows port 47624.
Scaffold: copied from the same-genre game `projects/daily-game/kit-toybox-beat` (storage, assets, audio, ui, main, render, mobile layer, Go wrapper, tests) and renamed `KB → DD`. The pillow boss is **removed** and replaced by **Pip the helper**; coins become **hopping gems**; the toy room becomes **the Dino Lookout tower floors**.

## 1. Lessons from rhythm-tap games (keep / change)
| Classic rhythm tap (lane highways, taiko drums) | Momo's Dino Drums |
|---|---|
| Notes scroll to a hit line, judged by timing | Keep: gems **hop** along two bamboo rails, one hop per beat, and land on the **drum** in front of Momo on the beat; Perfect / Good / Miss |
| 4–7 lanes, reading-heavy | **2 lanes** (upper bamboo rail, lower deck rail); **Easy = one button** |
| Fixed charts from a file | **Generated** seeded charts, always on the beat + WebAudio band; each catch plays the next melody note on a marimba |
| Health bar | **Groove meter** = Momo's drum energy; empty = "Momo is sleepy" |
| Combo counter | Keep; ×2/×3/×4 every 10 in a row |
| Static stage | Four tower floors (Riverbank → Fern Canopy → Nest Ledge → Sky Roof), beat-pulsing scenery |
| No friend | **Pip** the baby pterosaur flies in at combo 5: double points, and catches one missed gem for you (the twist) |
| Spamming beats the chart | Taps far too early consume the note as an early miss (anti-spam), kept from Kit |

The hop is the readability feature: a gem's height is `|sin(π · beatsLeft)| · hop`, so it touches the rail on every beat and its last landing is on the drum at the hit time. Players can "count the hops" (3, 2, 1, bonga!).

## 2. Screen & coordinates
- Logical canvas `VW × VH` (§8; desktop default **960 × 540**). y down; px; seconds.
- **The world is screen-independent**: lanes (0 = upper, 1 = lower) and times only. The renderer maps time to x.
- Layout (render.js `layout()`), unchanged from Kit: `ringX = 0.2·VW` (≥110), lane 0 y = `0.50·VH`, lane 1 y = `0.79·VH` (portrait 0.50 / 0.68), floor line = lane 1 y + 34, drum radius 34. Gem x: `ringX + (note.time − songTime) / approach × (VW + 40 − ringX)`; gem y = rail y − GEM_LIFT − hop height.
- Draw order: wall → arch with valley view → wall decor → beam + deck → deck decor → rails → drums → gems (lane 0, lane 1) → lift ropes + swing → Momo → Pip → front particles → fx → HUD.
- Overlays never cover the drums or Momo: judgement words above the drum of their lane, banners in the top third.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, or franchise dinosaurs). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (viewBox units) in a dark tone of the fill (never pure black), saturated but soft palette, kid-friendly: no teeth, no claws, nothing scary. No `<text>`, fonts, scripts, external refs or images. `width`/`height` = viewBox. Transparent background unless stated.
**View:** side view, slightly from the front. Characters face **right** (towards the incoming gems).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `momo_idle.svg`, `momo_reach.svg`, `momo_happy.svg`, `momo_dizzy.svg` | 0 0 120 120 | 96 × 96 | Momo the panda cub (white + soft charcoal `#3b3540`-ish patches, round ears, big shiny eyes in the eye patches, pink cheeks, a small leaf-green headband), sitting, holding two bamboo drumsticks. 3/4 side view facing right. **Body centre (58, 62)**, **seat line (bottom) y = 104** (sits on the swing seat), head top ≈ y 10. Body geometry identical across frames; only face, arms/sticks change. reach = stick-arm swung forward-right down to ~(106, 76) (drum hit), eager face; happy = ^^ eyes, open smile, both sticks up; dizzy = "oops" face: little swirl eyes, wobbly smile, one ear folded (cute, not hurt). |
| `swing.svg` | 0 0 120 40 | 96 × 32 | bamboo swing-lift seat: a short bamboo plank with two rope loops at x=14 and x=106 (rope tops at y=2), a little leaf tied on. Momo sits on it: seat top at y≈10 matches Momo's seat line. Code draws the ropes up to the top of the screen. |
| `gem.svg` | 0 0 64 64 | 40 × 40 | chunky faceted gem (teal/aqua, 6–8 facets, big highlight), centre (32, 32), bottom tip ≈ y 58. Reads well rotated a little. |
| `gem_gold.svg` | 0 0 64 64 | 44 × 44 | rare **rainbow gem**: same cut, pink-gold-violet facets and a sparkle. |
| `pip_fly1.svg`, `pip_fly2.svg`, `pip_cheer.svg` | 0 0 120 100 | 84 × 70 | Pip: a tiny round baby pterosaur (soft orange-peach body, cream belly, small rounded head crest, big eyes, little beak with a smile; **no teeth**), wings membrane in lilac. **Body centre (60, 56)**, feet at (60, 92). fly1 = wings up, fly2 = wings down (same body geometry), cheer = perched, wings open wide, happy ^^ eyes. |
| `ring.svg` | 0 0 96 96 | 72 × 72 | the catch drum seen from above-front: an elliptical bongo top (warm skin colour, wooden rim with lacing dots). It is drawn **under** gems; centre (48, 48). Keep the centre lighter so a gem reads on it. |
| `groove.svg` | 0 0 64 64 | 40 | HUD icon: a little hand drum with a music note. |
| `tap_up.svg`, `tap_down.svg` | 0 0 64 64 | 52 | touch hint chips: rounded leaf-green button with an up / down chevron. |
| `icon.svg` | 0 0 256 256 | app icon | Momo drumming with a gem bouncing above, on a round valley-green badge; opaque full-bleed background allowed; readable at 32 px. |

### 4.2 Dino Lookout floors (environment artist)
Per floor: `levels/<river|ferns|nests|sky>/`
| File | viewBox | Use |
|---|---|---|
| `wallpaper.svg` | 0 0 256 256 | **opaque**, seamless in **x and y**; low-contrast inside wall of the tower: river = warm sand-stone blocks; ferns = woven bamboo slats (soft green-tan); nests = pale stone with tiny fossil-free pebble dots; sky = dusky violet planks with tiny star dots. Calm. |
| `window.svg` | 0 0 320 260 | the **big arched opening** onto the valley: opaque inside the arch, transparent outside; bamboo/stone arch frame with a few vine leaves. View: river = morning river, green hills, a long-necked friendly dino silhouette drinking far away; ferns = giant fern fronds and treetops, dappled light; nests = clouds below, cliff with round nests and eggs, a distant pterosaur pair; sky = dusk gradient with stars, crescent moon, a sleepy far volcano with a small puff (no lava drama). |
| `floor.svg` | 0 0 512 192 | **opaque**, horizontally tileable deck (bamboo planks/ stone flags) seen from the front/above, top edge at y=0; tinted per floor (sky darker/bluish). |

Shared props in `room/` (folder name kept for code compatibility):
| File | viewBox | Use |
|---|---|---|
| `shelf.svg` | 0 0 512 56 | transparent, horizontally tileable bamboo beam seen from the front; **top surface y = 8..18** (upper rail sits on it), small rope lashings. |
| `track.svg` | 0 0 512 40 | transparent, horizontally tileable rail: two thin bamboo poles + short cross-sticks, slightly from above; rail centre line y = 20. Gems hop on it. |
| `decor_0.svg` … `decor_5.svg` | 0 0 160 160 | transparent props, base at y≈150: fern in a clay pot, nest with three spotted eggs, stack of round stone drums, glowing mushroom cluster, bamboo wind chime on a stand, a friendly baby long-neck dino figurine carved in wood. Placed on beam/deck edges and wall margins (never inside the lanes' play band). |
| `nightlight.svg` | 0 0 96 96 | a hanging firefly jar lantern (used on the Sky Roof, glows). |

Palette rule: walls low-contrast; avoid large teal/aqua areas near the rails (gems must read); Momo is black/white with a green headband; Pip warm orange with lilac wings.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`mote.svg` (pollen speck, warm), `leaf.svg` (small green leaf), `butterfly.svg` (two-wing butterfly, white so code can tint; wings drawn as one shape — code flaps by scaling x), `fluff.svg` (downy nest fluff), `firefly.svg` (yellow-green glow dot with soft halo), `star.svg`, `sparkle.svg`, `note.svg` (music note, ink-blue), `confetti.svg` (white rectangle, code tints).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` **[integration]**

### 5.1 `DD.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
```js
DD.CONFIG = { ... }                  // all tunables with units + rationale comments
DD.DIFFICULTY = { easy:{...}, normal:{densStart, emptyCost}, hard:{...} }   // overrides; easy has oneButton:true
DD.LEVELS = [{key:'river',name:'Riverbank',floor:1,bpm:84}, {key:'ferns',name:'Fern Canopy',floor:2,bpm:96}, {key:'nests',name:'Nest Ledge',floor:3,bpm:104}, {key:'sky',name:'Sky Roof',floor:4,bpm:112}]
const w = new DD.World({ seed, config });
w.reset(); w.startLevel(i);  // tod = i % 4 (floor index), lap = floor(i / 4)
w.tap(lane);   // 0 | 1 | -1 ("any"); with cfg.oneButton every tap is −1
w.update(dt); w.drainEvents();
w.state      // 'ready' (4-beat count-in) | 'playing' | 'cleared' (~2.6 s) | 'dead'
w.level, w.tod, w.lap, w.bpm, w.beatLen, w.songTime, w.beat, w.songLen, w.progress, w.approach
w.notes [{ id, lane, time, beat, kind /*'gem'|'gold'*/, pitch /*0..7*/, state /*'live'|'hit'|'miss'|'saved'*/, judge /*'perfect'|'good'|null*/, err, tDone }]
w.kit { lane, pos, frame /*'idle'|'reach'|'happy'|'dizzy'*/, reach, dizzy, happy }   // name kept: it is Momo
w.groove, w.combo, w.maxCombo, w.mult, w.score
w.stats { perfect, good, miss, early, gold, saved, helpers /*times Pip came*/, taps }
w.helper { state /*'away'|'enter'|'with'|'save'|'leave'*/, t /*s in state*/, x01, y01 /*0..1 in the upper-left play area near the drums, for the renderer*/, frame /*'fly'|'cheer'*/, left /*s of stay left*/, cool /*s of cooldown left*/, saveLane /*lane of the saved gem while 'save'*/ }
// render interpolation: kit._ppos and helper._px01/_py01 saved at the start of each fixed step
```
Events: `start`, `level {level, tod, name, bpm, lap}`, `count {n}` (3,2,1 then 0 = "Go!"), `beat {beat, bar, down}`, `tap {lane}`, `hit {id, lane, judge, err, points, kind, pitch, combo, mult, helper /*bool: Pip doubled it*/}`, `miss {id, lane, kind, early}`, `empty {lane}`, `multup {mult}`, `combobreak {combo}`, `helperin`, `helpersave {id, lane}`, `helperout`, `groovelow`, `songdone`, `cleared {bonus, level}`, `dead {score}`.

Rules / feel:
- **Chart**: unchanged from Kit (seeded 1-bar patterns, quarter notes then eighth pairs, `minGap`, sparse first 2 bars of level 1, ramp, ~6 % gold, end on a downbeat). No pillows any more.
- **Pip (helper, the twist)**: when combo reaches `helperCombo` (5) while `helper.state==='away'`, `cool<=0`, state 'playing' and ≥ 4 s of song left → `enter` (`helperEnter` 1.0 s, flies in from the away anchor just above the top edge to its perch), `with` for up to `helperStay` (20 s), then `leave` (1.0 s) → `away` with `cool = helperCooldown` (6 s; Hard 12 s). While 'enter' or 'with': hit points × `helperMult` (2) and `hit.helper = true`. While 'with' (and also 'enter' — fair to the child), the first note that would become a miss (late, or early miss) is instead `state 'saved'` (no groove loss, combo kept but not increased, `stats.saved++`, `helpersave`), helper → `save` (`helperSaveTime` 0.6 s: swoops to that lane's drum and back) → `leave`. Song end / death → helper leaves (`helperout`). Easy: helperCombo 4. Deterministic.
- **Judging**: windows perfect / good / early (s) normal 0.075 / 0.17 / 0.34, easy 0.10 / 0.22 / 0.34, hard 0.055 / 0.09 / 0.28 (playtest tuning); early-miss anti-spam; `wrongLaneMiss` rule kept. Easy accepts any tap and any letter / digit key.
- Groove: start 0.6; perfect +0.035, good +0.02, miss −`missCost` (normal 0.08 × 0.5 on floor 1, easy 0.04, hard 0.13). Normal floor 1 only: an empty tap costs `emptyCost` 0.02 × 0.5 (anti-metronome). Easy: never below 0.05 on level 1. 0 → `dead` (once).
- Chart density `densStart` per floor: normal [1.5, 1.8, 2.3, 2.9], easy [1.2, 1.6, 2.0, 2.4], hard [2.2, 2.8, 3.2, 3.6].
- Medal (UI): bronze = clear floor 1; silver / gold / platinum by score — easy 5k / 50k / 100k, normal 20k / 75k / 250k, hard 50k / 150k / 450k (MECHANICS.md).
- Combo: +1 per catch; every `comboStep` (10) mult +1 up to 4; a miss resets combo and mult (`combobreak` if ≥ 5). A save does not break.
- Kit/Momo: as Kit (lane of last tap, eased `pos` ~0.09 s, frames).
- Song end → `songdone`, 'cleared' (bonus = round(groove × 1000) × lapFactor), auto-advance after ~2.6 s.
- Score: perfect 100 × mult, good 50 × mult, gold ×3, Pip ×2.
- Level 1 on Normal very winnable for a 6-year-old; Easy level 1 cannot be lost.

### 5.2 `DD.Weather` — same API as Kit's: `new DD.Weather({width,height,seed})`, `setLevel(tod,{instant})`, `resize(w,h)`, `update(dt,{beat,kitX,kitY})`, `pulse()`, `burst(sprite,x,y,n,opts)`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer,color?,sx?}` (`sx` optional x-scale for butterfly flaps), `ambient {tint, glow}`. Sprites §4.3 + `'dot'`. River: pollen motes drifting in light + a few leaves tumbling (pendulum + rotation); Ferns: butterflies (flapping sx, wandering curved paths) + motes; Nests: downy fluff falling slowly with side-to-side sway, two depth layers; Sky: fireflies blinking with lazy wander + twinkling stars in the back. Bounded counts (< 140). Any canvas size (portrait up to 720×1600).

### 5.3 `DD.Bot` — as Kit's: `new DD.Bot(world,{skill,seed})`, `step(dt)`, `stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.DD.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), helperNow() }`.

## 6. Customisation slots
`hero` (Momo, all frames; the swing is still drawn under; procedural bob/lean/squash), `coin` (= the gem; key name kept; gold gets a rainbow ring), `pillow` slot renamed **`helper`** (Pip, all frames; procedural flap bob), `bg_river|bg_ferns|bg_nests|bg_sky` (replaces the wall, drawn as cover; arch, beam, deck and rails still on top).

## 7. Audio (rhythm critical)
- Audio clock is the master clock when running (as Kit).
- Backing band per floor: river = soft log drums + plucked bass; ferns = shakers + marimba chords; nests = airy pads + hand drums; sky = warm night groove with a soft bell. Count-in = 3 woodblock clicks + "go" chime. Each catch plays its `pitch` on a marimba voice + a little bongo "bonga" body; misses a soft muted "bonk"; Pip arrives with a cheerful two-note chirp + wing flutter; Pip's save = a "whoosh-chirp".
- Settings: **Timing offset** (−150…+150 ms).

## 8. Mobile (iPhone / iPad) — unchanged from Kit (same platform layer, `shared/daily-mobile/apply.py`)
- Logical size: landscape ≥ 16:9 → 540 tall, width up to 1280; other landscape → 960 wide, height up to 960; portrait → 560 wide (720 when aspect ≥ 0.6), height up to 1600.
- Pointer Events; upper half = lane 0, lower half = lane 1 (split midway between lanes); multi-touch ok; UI buttons fire on touch `pointerup`; ghost click swallowed; tap chips on touch for the first 2 levels.
- iOS audio unlock, `visibilitychange` pause + suspend, kid-proofing, home-screen manifest + 180/192/512 icons.
