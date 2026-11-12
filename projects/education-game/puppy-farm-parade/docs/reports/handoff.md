# Team hand-off notes (build phase, 2026-11-12)

## Character artist A — Bo, chick, rooster, icon (`tools/art_bo.py`, `tools/bo_sheet.js`)
- Bo frames `characters/bo_*.svg` 300×300, feet (150, 292), scale h/300. Bo SITS, 3/4 facing right.
- Head centre (150, 114), rx 72 ry 63, top y≈51. Mouth ≈ (209, 152) (think (213,160), oops (203,144)); per-frame points in `docs/art/bo_points.json`.
- Opaque box ≈ x 49–249, y 33–293 (bark wider: x 23–273, top 12; cheer x 27–289).
- Chick 120×120 feet (60,116) facing right (chick, chick_step, chick_flap). Rooster 160×180 feet (80,176) facing LEFT (rooster, rooster_crow).
- Icons rendered: `game/assets/icons/*.png` via `tools/render_icons.js` (header comment still mentions an old game).

## Character artist C — animals (`tools/art_animals.py`)
- `animals/<a>.svg` + `<a>_step.svg` 200×200, feet (100,194), facing right, white sticker outline, no ground shadow (code adds dust/shadow).
- Body-centre above feet ≈ 90 (viewBox) for most; sheep 77, crab 72.
- Fishbowl wheels do not take `opt.wheel` (frame swap only).

## Character artist B — `game/js/parade_art.js` → `FP.ParadeArt`
- API per DESIGN §4.3 + extras `bodyBox`, `stageDip(s, pop)` (add to y of the member standing on the stage), `appleLayout`, `thingKey`, `pal`, `clearCache`.
- Animal images are looked up via `FP.Assets.has` + `sprite(key, px)`, then `img(key)`, then `images[key]` with keys `animals/<a>` and `animals/<a>_step`. **assets.js must register/load those keys**, or a placeholder is drawn.
- `drawHintHand(ctx,x,y,press,alpha,size=96)`; `drawIcon` also accepts `{kind:'letter'}`; `opt.shake` has no effect; no letter flag for initial rounds.
- `dim` costs ≈ 3.3 ms/frame for 5 members (scratch canvas) — fine for fades only.
- Test: `node tests/unit/parade_art.test.js`.

## Environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
- Copy `envLayout`, `tileXs`, `drawPath`, `barnGeom` from `tools/env_scenes.js` RECIPE into render.js verbatim (pure).
- `L = RECIPE.envLayout(W, H, ins, world.layout.line.y)`; ground row 140 sits on line.y; horizon = line.y − 100·kg.
- Order: sky gradient SKY[m] to L.skyY1 (stars at night) → sun/moon (before far) → clouds (CLOUDS[m]) → far → mid → ground (tileXs) → fill below L.ground.fillY with GROUND_BOTTOM[m] → path `drawPath(ctx, W, L.path.y, L.path.h, PATH[m])` (cache per mood+size).
- Rooster feet at `L.fence.y` (top rail) — mechanics uses `layout.fenceY` (line.y − 170 landscape / − 190 portrait): reconcile (prefer the art's L.fence.y; feed it into the world or draw the rooster at L.fence.y).
- Barn: `g = barnGeom(layout.barn)`; s = barn.w/300; image at g.img; doorway g.doorway; doors g.doorL/g.doorR scale x by cos(θ) about hinge; night doors through DOOR_TINT.night (source-atop); vane pivot (40,64) at g.vane size 80s; g.roofTop for the burst.
- RIM[m] warm rim for members, GLOW[m]. Night: purple members weakest → keep the warm rim and a light outline at night. Vane: optional warm rim at night.
- Tall portrait has a lot of calm sky — maybe 1–2 more clouds.

## Mechanics engineer — content/world/weather/bot (`docs/MECHANICS.md` = render contract + events)
- Gate/march/out phases run in state `roundDone`; enter/play/hop in state `round`.
- Members draw: alpha, translate(x, y − bob)·rotate(rot)·scale(face·sx·scale, sy·scale) → drawMember(ctx, thing, size, {glow, dim, wheel, step, night, count}); clip to doorway when `clip`.
- Doors: k = cos(π/2·clamp(door,0,1.3)) (note: env says θ = door×80° — pick one, consistent). Vane: rotate by `w.barn.vane` around pivot (env says horizontal cos scale — pick one).
- Events: session, level, round, step {kind animal|wagon}, memberIn, ask, right, hop, land, gap, count, wrong, wiggle, soft, pokeBo, hint, gateHint, idle, assistArmed, assist, roundDone, gateAsk, doorOpen, marchStart, marchStep, inBarn, parade, leave, doorClose, chick, chickTap, rooster, roosterTap, fireflies, fireflyTap, talk, talkAsk, talkResult, levelDone, sessionDone.
- `ambient.glow` replaces `fire`; bursts: stars, sparkle, feathers, confetti, dust, dots.
- Sim: age-4 chapters ≈ 73 s, session ≈ 5.1 min, 0 stuck.

## Voice & input engineer (`docs/VOICE.md` §1.1 = event → line table)
- Pass `e + {topic, promptKey, params, rule}` to sayRight/sayWrong; for wrong also `thing: world.memberById(e.id).thing`.
- Crates: sayRight once (it is the count run). Don't speak `woof` over the right line (bark = synth sound).
- gateAsk → `gate` first time per chapter, then `gateShort`; parade → `march`. Rename `kiki.poke` → `bo.poke`, `ui.tapKiki` → `ui.tapBo`.
- talkWrong(lang, answerChoice, talk).
- Open question: fishbowl home = sea (goldfish are freshwater) → lead decision: drop `fishbowl` from the non-farm odd-one pools (crab already covers sea); keep the art.
