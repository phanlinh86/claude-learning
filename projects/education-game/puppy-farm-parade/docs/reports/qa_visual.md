# Visual QA report — Bo's Farm Parade (2026-11-12, report-only)

Tester: visual QA agent. No game code or art was changed. All captures are in `tests/out/qa_visual/` (≈ 560 PNG + JSON geometry
per shot, logical px = world px, short side 720).

## How it was captured
| script | what |
|---|---|
| `tests/qa/visual_lib.js` | 6 devices with emulated notch insets via the game's own `--sa-t/r/b/l` CSS overrides → `#safeProbe` → `World.setViewport(ins)`; geometry dump from `FP.debug.world` (members, bubble/HUD DOM rects, Bo box, stage, badge, barn, hint hand) |
| `tests/qa/visual_flow.js` | per device × EN/VI: title, settings, then each mood (morning colours / noon shapes / sunset count / night animals, age 4): **enter mid-walk, play, wrong wiggle, hint hand, hop mid-air (time frozen at 0.1×), stage + home badge, gate + ghost hand, doors opening, march**, pause, Talk time, celebration (2 frames) → `flow-<dev>-<lang>-*.png` |
| `tests/qa/visual_ages.js` | every topic of ages 3–7 (round 1 and round 3 = largest round) on iPhone portrait, iPad landscape, small Android × EN/VI → `age<N>-<dev>-<lang>-<lv>-<topic>-r1/r3.png` |
| `tests/qa/visual_colors.js` | every answer colour re-painted onto a live round on all 4 moods + a yellow member on the hay stage; samples canvas pixels → `colors-*.png`, `colors.json` |
| `tests/qa/visual_contrast.js` | WCAG contrast of the palette vs the sampled path / hay / sky colours, Machado CVD ΔE between pairs, content sweep 6 400 rounds/age for forbidden pairs → `contrast.json` |

Devices: `ip-p` 393×852 @3 (insets 59/0/34/0) · `ip-l` 852×393 @3 (0/59/21/59) · `pad-p` 820×1180 @2 · `pad-l` 1180×820 @2 (24/0/20/0) ·
`and-p` 360×780 @3 (28/0/16/0) · `pro-p` 1024×1366 @2. Logical sizes: ip-p 720×1561, ip-l 1561×720, pad-p 720×1036, pad-l 1036×720, and-p 720×1560, pro-p 720×960.
≈ 45 screenshots were looked at by eye (list at the end); every shot's geometry was checked by script.

## Summary
The game looks polished and consistent: chunky outlined art, members clearly read on every mood (the white sticker outline of the
animals and the dark outline + highlight of the painted objects carry them, even purple at night), Vietnamese diacritics render
crisply in the bubble, Talk time, settings and title, the HUD and bubble never overlap (0 of 560 shots), no member ever sits under the
bubble or HUD while standing, and no forbidden colour pair appears below age 5 (0 / 12 800 rounds, 0 / 3 200 Talk choices).
The problems are in a few layout corners (iPad hop arc vs. the bubble, Bo vs. the first member on iPad landscape with 5 members,
small members in 5-member portrait rounds) and in one learning-relevant art detail (apple size depends on the count).

---

## P1 — fix before shipping

### P1-1 The hop arc flies behind the DOM speech bubble on iPad (the right answer vanishes at the reward moment)
- Shots: `flow-pro-p-vi-2n-e-hop.png` (star block hidden behind the bubble, only its wagon shows), `flow-pro-p-en-3s-e-hop.png`,
  `flow-pad-l-vi-4x-e-hop.png` (crab claws touch the bubble), `flow-ip-l-en-4x-e-hop.png`.
- Measured (logical px, member body top at apex vs bubble bottom where x-ranges overlap): iPad Pro portrait **−70** (2n), −58 (3s), −36 / −24 (EN);
  iPad landscape −12; iPhone landscape −1…−8. Body height 120 → on iPad Pro up to 58 % of the member is behind the text box for ≈ 0.25 s.
- Cause: `game/js/world.js` `layoutTier` → `hopMinY: Math.max(ins.top + item + 10, bb + 0.4 * item)` — `hopMinY` is a FEET limit, so
  `bb + 0.4·item` lets the body top reach `bb − 0.6·item`.
- Fix (`world.js` line ≈ 199): `hopMinY: Math.max(ins.top + item + 10, bb + item * 1.02 + 16)` (body top ≥ bubble bottom + 16). On pro-p this
  makes the apex feet y 393 vs stage y 416 → the arc becomes a short sideways hop; to keep a visible arc there, also lower the stage limit:
  in `layoutTier` portrait use `stage.y = Math.max(stage.y, bb + cfg.stageGap + item * stage.s + 40)` so there is ≥ 40 px of arc room.
  Add a geometry check to `tests/visual/screens.js` (hop frame: body top ≥ bubble bottom when x overlaps) — the current suite does not capture mid-hop.

### P1-2 Bo covers the first member on iPad landscape in 5-member rounds (ages 6–7)
- Shots: `age7-pad-l-vi-4-oddeven-r3.png` (Bo's ear and cheek over the "20" tile), all `age6-pad-l-*`, `age7-pad-l-*` (28 shots).
- Measured: W 1036, item 104, tier 0, sp 126.9, line.x0 = 232, m0.x = 238 → m0 box 186…290; Bo visible box 21…200 → **13 % of m0's body box under Bo**
  (the tile's left frame and part of the numeral). Also tight with 4 members at age 4: Bo's nose 20 px from the first wagon (`flow-pad-l-en-fail.png`, `flow-pad-l-vi-2n-a-enter.png`).
- Cause: landscape `x0 = bo.x + cfg.lineX0Land` (112 + 120) ignores the member half-width; the slot CENTRES fit but the first body overlaps Bo.
- Fix (`world.js` `layoutTier`): `var x0 = portrait ? … : Math.max(bo.x + cfg.lineX0Land, boBox.x + boBox.w + 0.62 * item);` → x0 ≈ 263 for item 104;
  4 × 1.22 × 104 = 507 > 751 − 263 = 488, so tier 0 fails and the existing compact tier (small barn, x1 grows by ≈ 55) takes over — no other change needed.
  Add "Bo covers member > 5 %" to the screens.js check (it uses 12 % today, which this 13 % barely passes in the 4-member shots it takes).

---

## P2 — should fix

### P2-1 Counting crates: apple size gives the answer away
- Shots: `flow-pad-l-en-fail.png` / `flow-ip-l-en-3s-g-gate.png` (2 big apples vs 4 smaller), `age4-and-p-en-3-count-r3.png` (four "2" crates with big apples, one "4" crate with small ones), `flow-pad-p-en-fail.png`.
- Measured (`FP.ParadeArt.appleLayout(n).r`, art units in a 82-wide crate): n = 1–2 → **15.5**, 3–6 → 11–12, 7–10 → 8–8.6. 2 vs 4 = +29 % diameter, 2 vs 8 (age 5) = +94 %.
  The odd crate is visible at a glance by apple size and fill, so the child does not need to count.
- Fix: `game/js/parade_art.js` `drawCrate` — draw every apple with one radius per round: accept `opt.appleR` (or `opt.appleN`) and use
  `r = opt.appleN ? appleLayout(opt.appleN).r : L.r`; in `game/js/render.js` pass `appleN: max n of world.members` for crate members (and in the Talk icon use its own n).
  Keep the positions from `appleLayout(n)`.

### P2-2 Portrait 5-member rounds shrink every member to the 100 floor while half the screen is empty
- Shots: `age5-ip-p-vi-1-shapes-r3.png`, `age6-ip-p-en-1-lower-r3.png`, `age4-and-p-en-3-count-r3.png`, `age6-ip-p-vi-2-initial-r3.png`.
- Measured: ip-p tall portrait, 3–4 members → item **134** (73 pt tall on iPhone); 5 members → tier 2, item **100** (55 pt iPhone, **50 pt** on the 360-wide Android).
  line.x0 = 70, line.x1 = barn.door.x − 40 = 575 (505 px for 5 slots); the 5th member stands fully in front of the barn doors. Above the line,
  bubble bottom ≈ 370–420 to the hill ridge ≈ 650 is plain sky (≈ 15–17 % of the screen) and the stage sits low on the fence.
  100 logical meets the "≥ 100 at short side 720" floor exactly, but crates/tiles at 50 pt with 12-px apples are small for a 4-year-old.
- Fix (`world.js` CONFIG / `layoutTier`): in portrait let the line use the barn front: `portX1Door: 40 → −40` (x1 = 655) and `linePortSide: 70 → 60`
  → 595 px → 5 slots fit at 1.22 × 120 (item 120, +20 %); the barn is behind the line anyway and the march still ends at `door.x`.
  Optionally on tall portrait (H/W > 2) raise `lineAbovePort` 70 → 120 and `stagePort.dy` 230 → 280 so the hop has a real arc in the empty sky band.

### P2-3 Landscape celebration panel hides the whole parade
- Shots: `flow-ip-l-vi-z-done.png` (barn and marching friends behind the panel, only a ghosted hen visible through it; left 45 % of the screen holds only Bo).
- Measured: iPhone landscape panel 1035…1830 × 75…765 of 2000×923 display → covers x ≥ 52 % and 8–83 % of the height, i.e. the barn (x 1198 ± 125 logical) and the path loop.
- Fix (`game/css/style.css` ≈ line 163, landscape `@media`): `#scrDone { justify-content: center; align-items: flex-start; padding-top: calc(var(--sa-t) + 2vh); }`
  `#scrDone .done-panel { max-width: min(560px, 60vw); display: grid; grid-template-columns: auto auto; gap: 8px 16px; }` with title + stars on row 1 and the two
  buttons side by side on row 2 → panel ≈ 40 % of the height, the path band (y ≥ 0.72 H) stays visible. (Integration report already lists this as known.)

### P2-4 Rooster stands on the barn roof / weathervane in small-phone portrait
- Shot: `flow-and-p-vi-3s-f-stage.png` (crop shows the rooster's feet on the vane, its body over the haystack and roof).
- Measured: and-p, rooster feet (640, 1002), barn box x 515…715, y 1006…1222 (top = 1006), vane above the roof to ≈ 990 → rooster centre cy = 922 is 84 px above the
  box top, outside `inBox(L.barn.box, x, cy, 40)`.
- Fix (`world.js` `_roosterSpot`): test the barn including roof + vane + the rooster's own height:
  `var bb = L.barn.box; if (x > bb.x - cfg.roosterR && x < bb.x + bb.w + cfg.roosterR && y > bb.y - 120) continue;` (y = fence top).

### P2-5 "first letter" rounds (ages 6–7) have no letter on the members
- Shots: `age6-ip-p-vi-2-initial-r3.png` (red bucket, red tractor, duck, orange bucket, pink tractor; "Tên các bạn đều bắt đầu bằng chữ X…"), `age7-pad-l-en-1-initial-r1.png`.
- DESIGN §5.1 asks for "a little letter flag on the sign"; `parade_art.js` has no flag (grep "flag" → none). Without it the child must recall VI/EN names, and VI
  classifier rules (cái xô → X, xe máy cày → X, con vịt → V) are invisible.
- Fix: `parade_art.js` `drawMember` — when `thing.initial` (set by `content.js` `initial` topic: `t3.initial = initialOf(...)`), draw a small cream pennant
  (r ≈ 0.16·size) on a stick at the wagon's back corner with the letter in `FONT`; for animals put it on a tiny sign at their feet.

### P2-6 Answer colours with low contrast against their background (mitigated, but thin margins)
Measured WCAG contrast, fill / dark-outline vs the background actually rendered (canvas samples: day paths `#DCC4A0`, `#D8BE95`, `#D9B790`, night path `#646C86`, hay `#E9C46A` on every mood):

| colour | path morning | path noon | path sunset | path night | hay |
|---|---|---|---|---|---|
| red `#E84A4A` | 2.26 / 4.14 | 2.13 / 3.90 | 2.02 / 3.70 | 1.37 / 1.34 | 2.28 / 4.18 |
| blue `#3C8DE8` | 2.02 / 3.99 | 1.90 / 3.76 | 1.80 / 3.57 | 1.53 / 1.29 | 2.04 / 4.03 |
| **yellow** `#FFD23F` | **1.17 / 1.53** | **1.24 / 1.44** | **1.31 / 1.37** | 3.61 / 2.01 | **1.16 / 1.55** |
| green `#4CC26B` | 1.35 / 2.81 | 1.27 / 2.65 | 1.20 / 2.51 | 2.29 / 1.10 | 1.36 / 2.84 |
| orange `#FF9A2E` | 1.26 / 2.39 | 1.18 / 2.25 | **1.12 / 2.13** | 2.46 / 1.29 | 1.27 / 2.41 |
| **purple** `#8E44AD` | 3.48 / 4.31 | 3.27 / 4.06 | 3.11 / 3.85 | **1.13 / 1.40** | 3.51 / 4.35 |
| pink `#FF8FC0` | 1.25 / 2.42 | 1.18 / 2.28 | 1.12 / 2.16 | 2.47 / 1.28 | 1.26 / 2.44 |

By eye every colour still reads (`colors-ip-l-*.png`, `colors-ip-p-*.png`): members stand on the wood wagon (`#B98552`) and have a light top highlight, and the
yellow block on the hay (`colors-ip-l-1-stage-yellow.png`) is separated by the wagon deck. The weak cases are yellow on the day path (outline 1.37–1.53) and purple at night
(fill 1.13, outline 1.40, ΔE 53 so the hue still differs). Fix (`parade_art.js`, objects + blocks only): add the same 3–4 px cream "sticker" outer stroke the animals have
(`#FFF8EA`, alpha 0.9) behind the dark outline — that gives ≥ 3:1 against the night path for every colour and ≥ 1.9 for yellow on day paths; at night use `RIM.night`
(`#FFD38A`) for it, which parade_art already receives as `opt.night`.

---

## P3 — polish

1. **Hay stage is un-lit at night** — canvas sample `#E9C46A` on all 4 moods (`colors.json`), so the bale glows like a lamp in `flow-ip-p-vi-4x-b-play.png`,
   `age7-pad-l-vi-4-oddeven-r3.png`. Fix: `parade_art.js` `drawStage` — when `opt.night > 0`, multiply the fill by `#B9A6A0` (`globalCompositeOperation='multiply'`,
   alpha `0.45·night`) and keep the warm rim; render.js already passes `night`.
2. **Hay stage floats** — its bottom sits on the mid-layer fence/pond (`flow-ip-p-vi-2n-e-hop.png`, `flow-pro-p-vi-2n-e-hop.png`: pond visible under it). Fix: draw
   a soft contact shadow ellipse (`rgba(60,40,20,.25)`, w = 0.9 × bale, h = 10) and two short wooden legs/a second bale under it in `drawStage`.
3. **Wagons flip** when a member closes the gap leftwards (`flow-pro-p-vi-2n-e-hop.png`, right diamond's tongue on the left): `world.js` ≈ line 972 sets
   `face = vx > 0 ? 1 : −1` for wagons too. Keep `face = 1` for `kind !== 'animal'` (wagons roll backwards) — the instant mirror reads as a glitch.
4. **Weathervane reads as a broken stick** when the cos squash is near the ±0.08 clamp (`flow-pad-l-en-fail.png` sunset, `colors-ip-l-3-1.png` night: almost invisible on the dark sky). Raise the clamp to ±0.25 and add the warm night rim to the vane in `render.js`.
5. **Monkey leg art glitch** — the front leg is a flat slanted parallelogram across the belly (`flow-pad-p-en-t-talk.png`, around x 700–800, y 640–800 of the 1640×2360 shot). Fix in `tools/art_animals.py` monkey legs (idle frame), regenerate `animals/monkey.svg`.
6. **Windmill head hidden behind the bubble on iPad portrait** (`flow-pad-p-vi-4x-f-stage.png`, `flow-pad-p-en-fail.png`): the wind pump (far x 840) sits at
   y ≈ the bubble bottom. In `render.js` `envLayout` portrait use `far.x0 = W*0.20 − 600*kf` (pump moves to x ≈ 560 logical, right of the stage) or drop the far layer by 40 px when `!tall`.
7. **Tall portrait sky** (all `flow-ip-p-*`, `flow-and-p-*`): the band between bubble bottom (≈ 370–420) and the hill ridge (≈ 650) holds only the sun and 1 cloud.
   Besides P2-2: add 2–3 slow birds / a kite / a hot-air balloon particle to `weather.js` for portrait, or raise `kp` 1.36 → 1.55 when H/W > 2 so the hills start ≈ y 560.
8. **One-line bubble in a 3-line box** on iPad portrait (`flow-pad-p-vi-4x-f-stage.png` "Cửa chuồng nè!" in a 124-tall bubble = 240 css px tall). The bubble is fixed
   to `layout.bubble.h`; let it shrink: `#bubble { height: auto; min-height: 0.55 × layout h }` with the text vertically centred — the layout keeps the reserved space.
9. **Bubble grows past its layout box** for long VI lines: up to **+52 logical px** (`flow-ip-p-vi-4x-c-wrong.png`, `age7-ip-p-vi-2-add-r3.png`, 3 lines). Nothing collides
   today (stage gap ≥ 37 px everywhere), but the world reserves 124 px. Raise `bubbleHPort` 124 → 176 or cap the font (`font-size: clamp(...)` by length) so layout = reality.
10. **Vietnamese wraps** — title on 360-wide Android leaves "Đàn" alone on a 3rd line (`flow-and-p-vi-00-title.png`): break the logo as "Cún Bo / Tìm Bạn / Lạc Đàn" with
    `#logo2 { text-wrap: balance }` or shrink with `font-size: min(13vw, …)`. Talk title "Mình cùng nói chuyện / nhé!" orphan on iPhone portrait (`flow-ip-p-vi-t-talk.png`):
    `text-wrap: balance` on `.talk-panel h2`. Settings age chips wrap "7+" to a 2nd row on 360-wide screens (`flow-and-p-vi-01-settings.png`): at `max-width: 380px`
    set `.chip { min-width: 52px; padding: 0 12px }`. "Giọng của Cún Bo" wraps in both settings layouts — acceptable.
11. **Done screen (portrait)**: the crab walks out of the barn drawn over the door frame (`flow-ip-p-vi-z-done.png`) — clip leavers to the doorway for the first 0.4 s as the march does.
12. **CVD margins for allowed pairs**: lowest deuteranopia ΔE among pairs allowed below age 5 is red+yellow 42.2, purple+red 83.6; tritanopia blue+green **20.5**
    (allowed, rare deficiency). Age 5+ mixed-colour shapes rounds contain red+green / orange+pink (tritan 12.5) by design — colour is not the rule there, fine.

## Checks that passed (with numbers)
- HUD vs bubble: 0 overlaps in 560 shots, every device incl. notch insets (bubble moves below the measured HUD in portrait: y 245 on iPhone, HUD bottom 229).
- Standing / stage members: never under bubble or HUD, never off-screen; stage member top to bubble bottom ≥ **37 px** (pro-p) … 550 (and-p).
- Hit circles ≥ 88 pt everywhere except the age-3 "little one" on the 360-wide Android: **82 pt** (`age3-and-p-*-3-size-*`) — acceptable (0.85 × by design), note for functional QA.
- Member body height (item × scale): min **50 pt** (Android, 5 members), 55 pt iPhone 5 members, 66 pt iPhone landscape, 137–171 pt iPads.
- Colour-blind rule below age 5: 0 forbidden pairs in 6 400 rounds per age (3, 4) and 0 in 1 600 Talk questions per age; colour pairs seen at age 4: blue+red, red+yellow,
  blue+orange, green+purple, blue+yellow, blue+green, green+yellow, orange+purple, purple+yellow, purple+red.
- Odd one at a glance: colours / shapes / animals / letters / numbers clearly distinguishable in every sampled shot; size round (age 3) little one = 0.62 × (`age3-ip-p-en-3-size-r3.png`).
- Animals: feet on the path, shadows under every member, consistent scale between animals and wagons (sheep ≈ flower-wagon height), sticker outline reads on all moods.
- Motion frames: enter (wagons lean, wheels mid-turn), wrong wiggle (+13…19 px hop, ±0.04–0.07 rad), hop (stretch + 0.21 rad spin, glow trail), doors mid-swing with the dark
  back face, march clipping at the door frame (`flow-pad-p-en-4x-i-march.png` sheep half inside) all look right.
- Talk panel fits on every device (iPhone landscape 88…350 of 393; Android 114…603 of 780); choices 95–140 css px.
- Bubble text never overflows its bubble (0 cases; the DOM box grows instead — see P3-9).

## Screenshots looked at
flow-ip-p-en-1m-b-play (debug overlay run), flow-ip-p-en-00-title, flow-ip-p-vi-2n-e-hop, flow-ip-p-vi-4x-b-play, flow-ip-p-en-fail, flow-ip-l-vi-1m-b-play,
flow-pad-p-en-fail (sunset count), flow-ip-l-en-4x-f-stage, flow-ip-l-en-3s-g-gate, flow-ip-l-en-3s-i-march, flow-ip-p-vi-t-talk, flow-ip-p-vi-z-done,
flow-ip-l-vi-01-settings, flow-ip-l-vi-00-title, flow-pad-l-en-fail, flow-pad-p-vi-4x-f-stage, flow-and-p-vi-3s-b-play, flow-ip-p-vi-1m-d-hint, flow-ip-l-vi-2n-c-wrong,
flow-pro-p-vi-2n-e-hop, flow-pad-l-vi-4x-e-hop, age3-ip-p-en-3-size-r3, age5-ip-p-vi-1-shapes-r3, age7-pad-l-vi-4-oddeven-r3, age6-ip-p-vi-2-initial-r3,
colors-ip-l-3-1, colors-ip-l-1-stage-yellow, flow-ip-l-vi-z-done, flow-and-p-vi-p-pause, flow-pad-p-en-4x-i-march, flow-pad-l-vi-2n-a-enter, flow-ip-l-vi-t-talk,
flow-pad-p-en-t-talk (+ monkey crop), docs/art/animals_ingame.png, rooster crops of flow-and-p-vi-3s-f-stage and flow-ip-l-en-1m-f-stage, flow-and-p-vi-00-title,
flow-and-p-vi-01-settings, age4-and-p-en-3-count-r3, age6-ip-p-en-1-lower-r3.

Re-run: `node tests/qa/visual_flow.js` (≈ 12 min, `DEV=` / `LANGS=` / `MOODS=` subsets), `node tests/qa/visual_ages.js` (≈ 15 min), `node tests/qa/visual_colors.js`,
`node tests/qa/visual_contrast.js`. Note: `visual_flow.js` / `visual_ages.js` occasionally miss a moment when the bot skips a round faster than the poll (a `*-fail.png`
is written and the run continues with the next device); that is a capture timing issue, not a game error — 0 page errors were logged.
