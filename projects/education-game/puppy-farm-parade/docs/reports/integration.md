# Integration report (lead integrator, 2026-11-12)

Rewritten for this game: `game/js/{assets,render,main,ui,audio}.js`, `game/index.html`, `game/css/style.css`,
`game/manifest.webmanifest`, `tests/e2e/{smoke,functional,serve}.js`, `tests/visual/screens.js`, `README.md`, `CLAUDE.md`.
`storage.js` unchanged (prefix `fp:`).

## Decisions on the open hand-off conflicts
| conflict | decision | why |
|---|---|---|
| **Barn doors**: mechanics `k = cos(π/2·door)` vs env `θ = door × 80°` | env: `θ = clamp(door, 0, 1.25) · 80°`, horizontal scale `cos θ` about each hinge; past flat (`cos < 0`) the door shows its darker back (`rgba(40,26,20,.45)` source-atop). At night / sunset the doors go through `DOOR_TINT[m]`. | At `door = 1` a sliver of each door stays visible at the frame (reads as "open towards you"); the world's door spring overshoots to ≈ 1.3, which gives a small swing past flat and back — it looks like real hinges. |
| **Weathervane**: rotate vs horizontal cos scale | horizontal scale `cos(barn.vane)` about the pivot (40, 64), clamped to ±0.25 (was ±0.08: edge-on it read as a broken stick); warm rim + glow at night. | The rooster vane spins about a vertical axis; seen from the front that *is* a cos squash. The world's angle integrates the spin kick (16 rad/s) + a gentle wind sway, so it flips a few times after the parade and then barely moves. |
| **Rooster feet y**: world `layout.fenceY = line.y − 170 / − 190` vs art `L.fence.y` | **world.js fixed** (see below): `fenceY` now uses the art's formula. | Landscape both gave line.y − 170; tall portrait the art fence is at line.y − 226 → the rooster floated 36 px below the rail. Hit test and drawing now agree. |
| Fishbowl home = sea | already resolved by the mechanics engineer: `fishbowl` is not in the non-farm pool (`WILD`), art kept. | — |
| `pokeBo` in the gate | repeats the short gate line ("Tap the barn doors!") instead of `bo.poke`. | It is the current instruction; VOICE §1.1 allows "repeat the question"; MECHANICS lists `pokeBo {gate:true}` as "Open the barn!". |
| Speech bubble during the gate | shows the gate line; fades (`.fade`) once the doors open; a bubble tap in the gate repeats it and shows the ghost hand. | The bubble always shows what was last said. |
| Round stars | fly from the barn roof at `parade` (REQUIREMENT: "stars burst from the barn roof and fly to the HUD"); flushed from the stage if no parade comes (next round / Talk / level end). | — |

## Small fixes outside my files
- `game/js/world.js` — `layoutTier`: `fenceY: fenceTop(W, H, lineY)` with a new pure helper `fenceTop()` = the
  `tools/env_scenes.js` envLayout fence formula (horizon = line.y − 100·kg, mid.y = horizon + 4 − 296·km, fence =
  mid.y + 214·km). `CONFIG.fenceLand / fencePort` are now unused (kept so `config` overrides don't break). Unit test 
  "surprises" (rooster on `L.fenceY`) still passes.
- No changes to `content.js` / `i18n.js` were needed.

## What render.js does beyond the contract
- Bo is drawn 6 % larger than `layout.bo.h` (visible body 260/300 of the frame → `k = 1.06·h/260`), in front of the line,
  with a soft breathing squash, a hop lift of 14 px × `bo.hop`, a tiny head-tilt from `bo.look`, the blink frame on
  `bo.blink` and a mouth flap (talk ↔ idle at ≈ 2.7 Hz) while the voice speaks.
- Member shadows shrink and fade with the bob; the stage member gets `ParadeArt.stageDip`; the world's stage `pop`
  (peak 0.12) is normalised to 0..1 for `drawStage`. Marchers (`clip`) and the chick in the barn are clipped to
  "everything left of the door frame ∪ the doorway" so they disappear behind the wall, not into thin air.
- Night: `opt.night = (1 − ambient.light) / 0.45` → parade_art's warm rim light (sunset ≈ 0.33, night 1); the barn
  loft / lamp get an extra pulsing warm glow from `ambient.glow`.
- Clouds: the weather's drifting set, re-placed into the RECIPE cloud band; one extra cloud on tall portrait.
- Title: the little parade (sheep, star block, bucket wagon) marches in place by the barn; it measures the DOM ▶ and star
  pill (`o.boxes.title`) and shrinks / steps onto the grass below them when they reach the path (iPhone + iPad landscape).
- Done: the session's friends (one of each kind, animals first, ≤ 8) loop out of the open barn along the path while Bo
  alternates dance / cheer frames; sparkles + confetti.

## Audio (all synthesized, `audio.js`)
Animal step "tok" / wagon rattle, settle, hop boing, landing thump, right = ding-ding + formant bark (saw 560→680→290 Hz
through 480 / 1050 / 2400 Hz band-passes + a breathy onset, second shorter "wuf"), wrong boop-boop, wiggle, dust puff,
rising apple pips, door creak + clunk, clip-clop march steps, fanfare (brass + mallets, music bed ducked to 0.04 via
`setFanfare`), vane whirr, chick peep + flap, rooster crow (four sung sweeps), firefly twinkle, party (fanfare + bells +
woofs). Ambience: morning birds, noon breeze + bees, sunset first crickets + far bird, night crickets + a rare owl.
Music: oom-pah bed per mood (marimba / ukulele / marimba / soft bells, light swing), 0.22, ducked 0.07 under speech.
Chain: sfx / music / amb → master → compressor (−18 dB, knee 12, 4:1, 4 ms, 180 ms) → user volume × 1.6 → out;
`navigator.audioSession.type = 'playback'` in `unlock()`.

## Test results (2026-11-12)
- `node tests/unit/run.js` 34/34 · `node tests/unit/i18n_voice.test.js` 47 773 checks · `node tests/unit/parade_art.test.js` 12 052 checks.
- `node tests/e2e/smoke.js`: PASS iPhone portrait + landscape (real touch tap on the odd one → right, real tap on the
  doors → doorOpen, bot sessions age 4 / 3 to the done screen, 0 console errors).
- `node tests/e2e/functional.js`: 4 devices (iPhone 393×852 @3 portrait + landscape, iPad 820×1180 / 1180×820 @2) × 12–25
  tests with real CDP touches + 10 full bot sessions (ages 3–7 × EN / VI): **84/84 passed** (606 s), 0 console errors.
  Bot sessions: 16 rounds, 16 parades, 4 Talk times each, ≈ 0–4 auto-opened gates, every prompt reached the voice in
  the right language.
- `node tests/visual/screens.js`: 4 devices × EN / VI × title, 4 moods in play, stage, march, Talk, settings with notch
  insets; geometry checks (bubble vs HUD, Bo vs members, members / barn on screen, bubble overflow, hit size ≥ 88 pt):
  **no geometry issues**. Visual fixes made after looking: the title parade collided with the ▶ / star pill in landscape
  (now measured and avoided); a false "bubble overflow" from the bubble tail in landscape (the check now measures the text).

## Known issues / not verified
- Real-device TTS, mic and audio loudness are unverified (headless Chromium only).
- Portrait 5-member rounds: the 5th member stands in front of the barn doors while the round is played (needed for 120 px
  members on a 720-wide screen); once the odd one hopped off, the 4 friends close the gap LEFT of the doorway, so the doors
  are free in the gate (fixes 2026-11-12).
- `CONFIG.fenceLand / fencePort` are dead config keys now.

## QA fix round (2026-11-12) — see `docs/reports/fixes.md` for every finding → change → verification
- Voice policy (main.js): question repeated only while `world.interactive`; `world.prompt()` null otherwise; `pokeBo {busy}`
  outside play; long `.first` prompt only in round 0; no line at `roundDone`; one praise at `parade` (after a miss / round 3);
  no march line; the gate spoken only in chapter 1; the hint-triggering miss says one short pointer line (`sayWrongHint`), the
  hint line is priority; resume re-says the right line in the hop (count → the crate's name) and never re-asks an answered Talk;
  canvas presses ignored 250 ms after Play / Play again / Resume.
- World: `talkGiveUp 2`, `gateHandAfter 2.0`, `gateWaitAfterAuto 2.5`; grand parade in round 3 (`parade {grand}`, Bo dances,
  main: `fanfareBig` + 40 confetti); hop apex bounded on the BODY; landscape x0 clears Bo's box; portrait line to door.x + 40
  (5 members at 120) with door-clear slots for fewer members; rooster never on the barn / vane; wagons keep face 1.
- Content: uniform odd slot (never 3 in a row), no wild animal / odd colour twice per chapter, odd colour first (balanced),
  age-4 shapes without oval / diamond, age-4 counting 3 3 4 4, opening chapter rotates between the two easiest topics, size
  rounds 1 / 3 ask for the BIG one (`p.sizeBig`).
- Art: one apple radius per round (`appleN`), letter pennants in first-letter rounds, cream sticker outline on painted members
  (warm at night), hay bale dimmed at night + trestle legs + contact shadow, monkey near leg drawn behind the belly.
- CSS / UI: compact top-centre celebration panel in landscape; bubble shrinks to short lines and fits long VI lines into its
  reserved box; balanced VI logo / Talk title; small-screen age chips; the name filter drops tags with their content.
