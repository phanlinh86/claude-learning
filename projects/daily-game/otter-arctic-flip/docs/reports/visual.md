# Visual QA / art direction: Ollie's Lighthouse Flip (2026-11-20)

How the screenshots were made (both write to `tests/out/visual/`, which is gitignored, so re-run them to see the images):
- `node tests/visual/capture.js` (about 7 min): every screen at 6 viewports, every floor in play plus greyscale, crossfades, motion contact sheets, leaf line-ups in colour, greyscale and deuteranopia, and custom pictures.
- `node tests/visual/night_check.js [part=night,overlap,screens,banner]` (new): night hazards at the worst light (0.32), on Easy and Normal, in landscape and portrait. The game is frozen and stepped one frame at a time. Each shot is taken when a hazard enters the screen and when it enters the reaction window, with a luminance number for the hazard against what surrounds it. The script also checks whether popups or callouts overlap Ollie and whether the floor banner overlaps hazards (in real bot play), measures the HUD against the play band, and captures every screen on iPad Pro 1366×1024. Results are in `tests/out/visual/night/summary.json`.

I opened every image listed below myself.

## Verdict
The art is consistent across all four floors and Ollie reads well everywhere. The night feels **cosy, not scary**: the dark navy stops at alpha 0.7, warm sconces and the headlamp cone light the hall, the leaves glow and an aurora shows in the portholes. The darkness twist works in landscape. The main problem is in **portrait**: the screen is too narrow to show hazards in time. There are also three P2 layout and art issues.

---

## P1

### P1-1: Portrait shows hazards too late (every floor, worst at night). The "seen in time" rule does not hold.
- Screens: `tests/out/visual/night/phone_easy_0*_enter_*.png`, `phone_normal_0*_enter_*.png`, `ipadP_*_enter_*.png`, `tests/out/visual/phone_zone2.png`
- Code: `game/js/world.js:173` (`unit = portrait ? min(w/6, h/8)`), `world.js:177` (`heroX: portrait ? 0.22*w`), `world.js:342` (`beamUnits` is clamped to the screen), `game/js/render.js:330` (`_forBeacons` only covers hazards that are on screen).
- What I measured: in portrait (390×844 and 768×1024) the screen shows only **4.68 units** ahead of Ollie. `seeAhead` needs 8.07 units (Easy, night) and 6.48 units (Normal, night). A hazard therefore appears at the screen edge already well inside its reaction window, and there is nothing a beam or beacon could light any earlier. Reaction time left after the hazard appears, computed as `(min(seeAhead, reach) − 0.8)/S − flightTime`:

| layout | Easy, dawn | Easy, night | Normal, dawn | Normal, night |
|---|---|---|---|---|
| 960×540 landscape | 2.01 s (target 1.8) | **1.69 s** | 1.08 s (target 0.95) | 1.08 s |
| 390×844 portrait | **1.28 s** | **0.90 s** (half the target) | 0.92 s | **0.62 s** |

  Easy is the mode for small children, and on a phone held upright it gives half the reaction time it promises.
- Fix (three parts):
  1. Use a wider view in portrait. In `world.js:173`: `unit = portrait ? M.min(w / 7, h / 8) : …`. In `world.js:177`: `heroX: portrait ? 0.15 * w : 0.26 * w`. Reach becomes 7 × 0.85 = **5.95 units**. Ollie gets 14 % smaller on a phone (≈ 54 → 47 CSS px), which still reads well.
  2. Cap the speed when the screen is too short. In `_capFor` (`world.js:318`), after S is computed: `var reach = this.screenReachUnits(), u = this.layout.unit; var Smax = (reach - CONFIG.light.seeExtra) / (this.D.reaction + this.flightTime()) * u; if (S > Smax) S = Smax;`. With part 1 in place, this slows only Easy at night in portrait, to about ×0.77, and leaves Normal almost untouched (×0.98).
  3. Add an edge warning in `render.js`. Draw it after `drawTexts` and above the darkness. For each hazard with `x0 − hero.x ≤ seeAheadUnits()·u` and `x0 − camX > VW − 0.2u`, draw a pulsing amber chevron "›" at `x = VW − ins.right − 0.32u`. Put it at `y = floorY − 0.32u` for floor hazards and `y = ceilY + 0.32u` for ceiling hazards. Size 0.3u, colour `#ffb43c`, outline `#6a3a14`, alpha `0.6 + 0.4·sin(t·8)`. This cue also covers the 0.1 s shortfall on Easy at night in 960×540 landscape.

## P2

### P2-1: The floor banner covers hatches ahead of Ollie
- Screens: `tests/out/visual/night/banner_small_start.png` (Boot Room, run start, seed 4), `banner_small_door.png` (Greenhouse, right after the stairway door, seed 5), `tests/out/visual/sheet_fade_23.png` (last row)
- Code: `game/js/render.js:963` (`_lowY`), `render.js:974-988` (`drawBanner`, h = 76)
- What I measured: in real bot play, **30 of 162** banner frames at 960×540 and **20 of 74** at 844×390 had a floor hatch under the banner, 1.1–1.9 s into the banner and about 3.9 units ahead of Ollie. The banner's top edge is at y 442 and the floor line at 431. Only an 11 px strip of the dark hole stays visible, so the hatch reads as a thin crack. Portrait and iPad were not affected (0 frames).
- Fix: in landscape, make the banner slimmer and push it lower. In `drawBanner`, use `h = L.portrait ? 76 : 52`, title `fs ≤ 20`, subtitle 13 px, and `y = L.portrait ? this._lowY() : this.VH - this.ins.bottom - h/2 - 6`. At 960×540 the banner then starts at y 482, which leaves 0.51 unit of each hole visible. Also set the panel alpha to `a * 0.78` (currently 0.88) so the edges of the hole show through. Another fix on the world side: extend `gen.breather` (world.js gen) so no floor gap is placed within 2.6 s (the banner's life) after a door or the run start.

### P2-2: The "NEW!" badge covers the score on Game Over (every viewport)
- Screens: `tests/out/visual/night/ipadPro_over.png`, `tests/out/visual/phone_over.png`, `tests/out/visual/small_over.png`
- Code: `game/css/style.css:319` (`.new-best{right:0!important;top:calc(var(--u)*-1.4)!important}`). The badge belongs to the *Best* row (`index.html:72`), and that rule moves it up onto the **Score** digits. On the phone it hides the bottom half of "1234".
- Fix: put the badge inline beside the Best label. Replace line 319 with
  `.new-best{position:static!important;align-self:center;margin-left:calc(var(--u)*.8);margin-right:auto}`
  `.sc span{display:inline-flex}` and in `index.html:72` move `<i id="newBest">` directly after `<span>Best</span>`. Alternatively keep the absolute badge and use `top:auto!important;bottom:calc(var(--u)*-1.9)!important;right:0!important`, which places it below the Best digits in the gap before the stats line.

### P2-3: Boot Room decoration boots look like a hazard
- Screens: `tests/out/visual/desk_obstacles.png` (the purple boot next to the skis, right of the crate with boots), `small_banner.png`, `sheet_bump_vent.png`
- Code: `tools/art-environment/gen.js:285-286` (boots drawn on the floor line y 431 in `levels/dawn/mid.svg`)
- Problem: the hazard `vent_1` is a crate stack **with blue boots on top**. The back wall also has boots standing on the floor line. Children learn "boots = bump", but these boots are harmless. They also slide against the floorboards, because the wall scrolls at 0.6 parallax while the floor scrolls at 1.0.
- Fix: delete the boots loop at gen.js:285-286, or hang the pair on the coat-hook rail (`y 330–360`, 60 % opacity, colour `#8e88a0`), so nothing small and prop-like stands on the floor line. Re-run `tools/art-environment` and `tools/build.sh`.

## P3

1. **The flip turn-over looks paper-thin.** `render.js:761-762` lets the vertical scale drop to 0.42. In `sheet_desk_flip_up.png` (ft 0.38–0.70) Ollie becomes a sliver for about 0.1 s. Fix: raise the floor to `0.62` and increase the tilt (`render.js:764`) from `0.45` to `0.6`. He then reads as a roll instead of a squash.
2. **"+50" popups stack on top of each other.** In `phone_zone2.png`, `small_play.png` and `night/phone_easy_05_*.png` the "+50" texts overlap. The de-overlap loop (`render.js:417`) only shifts x. Add a vertical step as well: `if (collide) { x = t.x + size*2.6; y = t.y - size*0.9*(h.grav<0?-1:1); }`.
3. **In portrait, the ceiling hatch is a dark shaft up to the top of the screen.** In `phone_zone2.png` the shaft is about 600 px tall and runs behind the HUD. At night its colour matches the dark ceiling above, so only the end of the beam and the beacons mark it (`night/phone_normal_07_enter_ceil_gap.png`). Fix at `render.js:521`: fill only `ceilY − 1.6u … ceilY`, use a fade on the 0.4u above that, and add a 2 px lighter rim `shade(P.slab, +0.25)` on both hole edges (`render.js:522`, also 518 for floor holes).
4. **At night the beacons look like the red leaves.** Amber beacons (`render.js:588`, `#ffb43c` → `#e0761e`) are close in colour to the orange glow of the red leaves (`small_normal_04_enter_ceil_sign.png`). Make beacons a different signal: core `#ff5a6e`, rim `#fff2f4` (1.5 px), and a 2 Hz on/off pulse (`0.55 + 0.45·step(sin(t·12.6))`) instead of the soft 4 rad/s pulse at `render.js:640` and `render.js:306`. Sconces and leaves stay warm and steady.
5. **The How to Play leaf icons overlap the text.** In `phone_how.png` and `phoneL_how.png` the maple-leaf icon touches "Catch" / "Many". At `style.css:316-317` (3 leaf icons at 3u), add `.how-ico{min-width:calc(var(--u)*10)}` to that card, or reduce the icons to `2.4u` with `gap:2px`.
6. **On a landscape phone the Pause panel covers the floor HUD panel.** In `phoneL_pause.png` the panel top covers the "22 / 34 m" row. In `@media (max-height:430px)`, add `#scrPause .panel{margin-top:calc(var(--u)*5)}` or reduce the button padding.
7. **During a ceiling-fall rescue Ollie hangs into the HUD row.** In `sheet_gap_rescue_rail.png` he sits beside or under the score panel (HUD alpha 0.3). Either cap the rescue hold height at `ceilY − 0.55u` in the world, or set `_fadeFor` (`render.js:902`) to return `0.15` while `h.state === 'rescue'`.
8. **On a bump Ollie sinks into the snowball pile.** In `sheet_bump_vent.png`, frames t 3.27–3.50 draw Ollie on top of and inside the pile. Raise the hop (`render.js:766`) from `0.22u` to `0.4u` and draw a short horizontal recoil (`x − 0.15u·sin`) so the "boing" reads as bouncing off the pile.
9. **The Change Pictures grid at 960×540 has an empty slot.** In `small_custom.png` the second row holds 3 cards, left-aligned, with the right quarter empty. At `style.css:150` (12-column grid), centre the second row (`justify-content:center` with `grid-template-columns:repeat(auto-fit,minmax(…))`) or make the three floor cards span 4 columns each.
10. **One noon leaf blends into the plant pots for colour-blind players.** In `leaves_zone1_deutan.png` the maple leaf in front of the potted plants (also greenish-grey) loses some separation. The outline is fine elsewhere. Optionally raise the outline at `render.js:677` from `rgba(36,40,30,.55)` to `.7` at noon only.

## Checked and OK
- **Popups and callouts never cover Ollie:** 0 overlapping frames out of about 6 400 sampled across 5 viewports (`night_check.js part=overlap`). Callouts sit beside him on the open side of the corridor.
- **HUD never covers the play band:**
  - 960×540: HUD bottom 110 / ceilY 141
  - 844×390: 110 / 141
  - 390×844: 198 / 434
  - 768×1024: 198 / 277
  - 1366×1024: 110 / 237

  The hint line sits in the storey below the floor.
- **Night hazards in landscape:** at the moment a hazard enters its reaction window it is lit, either by the beam or by the beacons. Floor and ceiling hatches read clearly as dark holes (hatch luminance 0.09–0.15 against 0.25–0.55 around them). Props carry a beacon and sit inside the cone. The ceiling props are the weakest (luminance 0.24 against 0.22), but their beacon and outline still read (`night/small_normal_0*`, `night/phoneL_*`).
- **Leaves** read in colour, greyscale and deuteranopia on all four floors. Shape (ovate or maple) and the dark outline carry them. At sunset and night they glow.
- **Crossfades** (`sheet_fade_01/23.png`) are smooth, with no pop. Lamps fade on over about 1 s (`sheet_lamps_on.png`) with a "Lamps on!" callout.
- **Landing** squash and puffs, the Pip rescue on the floor, the stairway door with its +100 and banner, and the leaf spiral and burst all read clearly.
- **Custom pictures** (hero ring, leaf ring, full-scene backgrounds) work in play and at night. Darkness still applies to them (`small_custom_night.png`).
- **Every screen** fits at 960×540, 844×390, 390×844, 768×1024, 1024×768 and 1366×1024. Nothing is cut off and the buttons are large.
