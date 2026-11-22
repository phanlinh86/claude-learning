# Mimi's Splash Rocket — Mechanics (`DK.CONFIG`, layout, flight physics, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js` (+ `mimi_points.js` from character artist A, read at
runtime: `DK.MIMI_POINTS`, `DK.ROCKET_POINTS`, with defaults when missing). Contract: `docs/DESIGN.md` §2, §5.1–5.5; **this file wins
where they differ** (§0). Tests: `node tests/unit/run.js` (33 tests, ≈ 70 s; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 200] [--ages 3,4] [--models typical,slow3,botT0.8,…] [--jobs 4]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md` + `.json`, git-ignored; exit 1 on NaN / stuck state / off screen / a landing
> 2 px off / 2 misses without a hint / a round > 120 s for an engaged model), `node tests/sim/content_stats.js [chapters]`,
`hs_browser.js` (the real page in Playwright, `?bot=1`, once main.js is wired). `pt_*.js` are the base playtester's speech-timing
harness and still speak river (stones / hops): the playtester adapts them.

## 0. Deviations from DESIGN.md (read this first, integrator)
1. **Portrait pump**: `layout.pump = (W/2 − 120, H − ins.bottom − 40)`, i.e. between Mimi (ins.left + 120) and the pad (W/2), not
   W/2 + 110: **Mimi hops onto the plunger** at `aim` (0.3 s hop, `mimi.onPump = true`) and stomps it with her feet (the `pump` frame);
   she hops home at `launch`. While on the pump her feet are `(pump.x, pump.y + pump.press · 14)`. Landscape: pole / Mimi / pump / pad
   at ins.left + 26 / **96 / 160 / 262** (QA fix: Mimi on the plunger never overlaps the bottle; × campW / 272 when the camp column is
   squeezed), y = H − ins.bottom − 40 (pole base) / 70 / **76** / 60 (pump plate clear of the home indicator).
2. **Apex**: the apex height follows DESIGN (≥ max(220, 0.5·distance) above the higher of pad / mat, clamped to y ≥ play.y0 + 40, and
   ≥ 60 px above both ends). Its x is placed **before** the mat by the parachute's glide (`vx_apex / glideOmega`): when the canopy pops,
   the rocket still flies forward and the canopy's drag (a critically damped glide = linear air drag) brakes it to a stop exactly over
   the mat. A pure "apex straight above the mat" would need the rocket to stop in mid-air.
3. **Launcher angle**: `rocket.aim` (the tube) is the thrust angle clamped to ±0.6 rad; the thrust itself uses the true angle (far mats
   on a 1600-wide screen need ≈ 0.75 rad); the bottle's `rot` then turns with its velocity (spring), so nothing visibly jumps.
4. **Gravity on tall screens**: 900 px/s², but a flight whose climb would coast > 1.05 s (720 × 1561 portrait, mat far up) uses
   g = 2·Hh / 1.05² for that whole flight (one constant g: still a true parabola). Flights stay 1.5–2.8 s on every shape (1 014 bot flights on the 5 sim viewports).
5. **Exact landing**: under the chute the canopy point is integrated **relative to the mat** (height `hh` above it, `off` beside it), and
   the pendulum + wind offset fade out over the last 50 px (`fadeH`): touchdown is exact (`land.err` = 0 in 1 014 bot flights; ≤ 2 px unit-tested incl. wind and resizes) even when the mat
   glides after a rotation.
6. **Camp count order**: the pennants are counted in collection order (slot 0 at the TOP of the pole, as DESIGN §2's slot formula puts
   it), not bottom → top — so countSeq's pennants count "1, 2, 3" in the order they were won.
7. **Overlapping launches**: the next launch's mats unfold while the thing is still flying up to the pole (0.1 s after it leaves the mat)
   and the rocket may still be hopping home; a right tap then waits in `aim` until the rocket stands on the pad and Mimi on the pump.
8. **Pacing** (sim-tuned, §8): `shortBudget [∞, 22, 40, 56]` (a short round = **2 launches × the age's mats** since the QA fix round,
   so the per-age 3-mat rounds really happen); Talk time also when the chapter passed **72 s with ≥ 2 rounds**
   (`chapterHardLimit`; a slow / struggling child) besides DESIGN's 75 s with ≥ 3 rounds; a round that ran > 70 s goes to the camp after
   ≥ 2 launches (`roundLongCut`); camp 1.9 s (DESIGN ≈ 2.4); the hops home take 0.3–0.55 s each (≈ 0.9 s, DESIGN 0.8).
9. **Help values** (QA fix round): assist after **4** no-progress presses (DESIGN text: 6), hint glow 5 s, cooldown **5 s** (= the
   glow), and a hint triggered by the 2nd miss **ignores the cooldown** (it is never skipped); `resetNudges()` (resume) also restarts
   the child's full 3 s pump window; a finger resting still > 2 s (`idleRestHold`) no longer stops the idle nudges.
16. **Touchdown beside the thing** (QA fix, visual P1-1): the rocket lands at `world.landPt(mat)` = `(mat.x + side·0.30·S·ds, mat.y +
   0.04·S·ds)`, side = away from the pad (still on the mat ellipse, half-width 0.5·S·ds); every flight sum, the arc's end, the rings /
   splash and `land.err` use that point; render draws the landed mat's thing (and the flyer) AFTER the rocket.
17. **Phones get bigger mats** (QA fix, visual P1-3; `phone` = aspect > 1.9): portrait S × 1.22 (208 / 196 / 180), itemH 0.70·S,
   horizon play.y0 + 150, depth 0.86 → 1; landscape S × 1.1 (187 / 176 / 163), itemH 0.68·S. All 11 viewports × 5 ages × m 2–3 still fit
   at the full size (unit-tested). Phone bubble: portrait h 150, landscape w ≤ 960 (beside the measured HUD).
10. **Mats never overlap**: besides the hit-circle rule (≥ 20 px apart), the footprints (mat + thing) of two mats never overlap (a thing
    standing in front of another mat was hard to read).
11. `interactive` is true in `pump` only until the 3rd stomp; `answer()` in pump = `{pump: true, id: null, mat: null, x, y}`.
12. `setBreeze(w)` adds a **constant** wind in px/s² (tests); main.js does not need it: set `weather.windSource = world` (the world owns
    the wind: `world.wind` px/s², `world.gust` 0..1, breezy gusts → `gust` events).
13. Weather particles keep the **base's** schema (`type/sprite, x, y, size, rot, alpha, layer, kind, color, flipX?, flap?`), not the
    bear game's (`kind/s/a`): render.js's particle code stays as it is.
14. Content: `round.rows` is kept as an alias of `round.launches` (same array); `fruit` / `DK.FRUITS` are gone; 'initial' uses
    flower / mushroom / ball / mug / lantern (VI: hoa → H, nấm → N, bóng → B, cốc → C, đèn → Đ) + the animals (not the goldfish bowl).
15. Extra events / fields: `pumpAuto` (once, when Mimi starts helping), `hopBack {n}`, `unfold {launch, i}`, `land {err, flight}`,
    `count {camp: true}` in the camp, `wipe {weather}`, `next {count?}`, `roundDone {pennants, assisted}`; see §6.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise, **0 = nose up**. Screen space = world space (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of every
  sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content + the surprise round from the world's seeded `DK.RNG`; cosmetic randomness (bob phases, droplets, blinks,
  surprise spots, mat seeds) from a second generator; the wind from a third. Same seed + inputs → the same events (unit-tested).
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler); `World.kickFor(peak, ω, ζ)` = the initial velocity
  whose first spring peak is `peak` (every squish / flap / wiggle kick).
- The world never needs `mat_art.js`, `meadow_art.js` or the DOM.

## 2. Public API (`DK.World`)
`new DK.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `pointerDown/Move/Up(x, y)`, `cancelDrag()`, `hint()` → `{mat, id}` | null,
`talkAnswer(choiceId)` → bool, `prompt()` → `{promptKey, params, rule, nameKind, nameValue, k, left, mode, launch, row, count?}` in phase
`play` | null, `resetNudges()`, `skipTalk()`, `matById(id)`, `answer()`, `targets()`, `setBreeze(px/s²)`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur (the content round), roundsPerLevel, stars, levelStars, roundStars,
misses, streak, talk, talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), wind, gust, mats, launch (current
launch index; = k when done), chosen (the picked mat id), mimi, rocket, pump, pumpGlow (= pump.glow), arc, arcAlpha, flyer, pennants,
fountain, marmot, goat, bird, drops, rings, hintHand, assistId, wipe, surprise, finger`.
Static: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep)`, `World.matHomes(L, m, seed, cfg)`,
`World.matCandidates(L, cfg)`, `World.matFoot(L, x, y, ds)`, `World.depthAt(L, y)`, `World.hitRAt(L, ds)`,
`World.planFlight(cx, cy, tx, ty, L, cfg)`, `World.plan / planAt` (small hops), `World.kickFor`, `World.boxGap`, `World.mimiPoints()`,
`World.rocketPoints()` (the art points with defaults), `DK.WindModel`.

**States / phases.** `menu → intro (2.5 s) → round [unfold → play → aim → pump → flight → collect → (unfold → play → …) → camp] →
roundDone [camp (0.4 s more) → wipe] → … → talk → levelDone (3.6 s) → … → sessionDone`. At the wipe's half time the next round is
prepared (state `round`, phase `wipe`, its mats `hidden`, rocket on the pad, pennants cleared) and at wipe t = 0.75 phase `unfold` starts;
or Talk time starts (state `talk`; `w.wipe` keeps running to t = 1).

**Input (one active pointer; a gesture = down … up), logical px:** `pointerDown(x, y)` → `'mat'` (judged right / wrong) | `'squish'`
(the same wrong mat < 1 s, or any mat outside play) | `'pump'` (a stomp) | `'merged'` (< 0.22 s after the last stomp, or after the 3rd) |
`'marmot'` | `'goat'` | `'bird'` | `'mimi'` (the poke fires on release, < 24 px move) | `'soft'` (grass / pump / rocket / nothing) | null.
Order: a surprise wins where the finger is off every mat body (r = 0.5·S·ds around the hit point); phase `pump` → every other press is a
stomp; assist armed + a press on the meadow → the target; the nearest mat hit centre within its radius; Mimi's box; else soft.
`pointerUp` → `'pokeMimi'` | `'up'` | null.

## 3. Layout (`computeLayout`, DESIGN §2)
| field | landscape | portrait |
|---|---|---|
| `bubble` / `hud` / `play` | the base's (bubble y = ins.top + 18, h 134, w ≤ 700 (phones ≤ 960), never under the measured HUD; HUD 160 × (ins.top + 96); play.y0 = band bottom + 10) | bubble y = ins.top + 110, h 124 (phones 150), full width; play.y0 below bubble and HUD |
| `camp` | `{x0: 0, x1: ins.left + campW, y0: play.y0, y1: H}`, campW 272 (→ 230 in 14 px steps only when 3 mats do not fit) | `{x0: 0, x1: W, y0: H − ins.bottom − campH, y1: H}`, campH 280 (tall × 1.15) |
| `meadow` / `horizon` | `{x0: camp.x1, x1: W − ins.right, y0: play.y0, y1: play.y1}` / play.y0 + 0.30·(H − play.y0) | `{x0: ins.left, x1: W − ins.right, y0: play.y0, y1: camp.y0}` / play.y0 + 120 (phones 150) |
| `pole {x, y0, y1}` | x ins.left + 26, base H − ins.bottom − 40, top play.y0 + 30 | x W − ins.right − 92, top max(play.y0 + 30, camp.y0 − 160) |
| `mimiHome` / `pump {x, y, r}` / `pad` | (ins.left + 96, yb − 70) / (ins.left + 160, yb − 76) / (ins.left + 262, yb − 60) | (ins.left + 120, yb − 70) / (W/2 − 120, yb − 76) / (W/2, yb − 60) |
| `mimiH`, `rocketH` | 180, 120 | 170 (phone 200), 120 |
| `S` / `itemH` / `hitR` | age 3–4: 170, 5: 160, 6–7: 148 (phones × 1.1), −6 px steps to 130 until 3 mats fit for 3 test seeds / 0.62·S (phones 0.68·S) / 0.6·(S·0.8) + 14 (phones ≥ 92) at ds 1 | phones × 1.22, itemH 0.70·S |
| `slots[j]` | `{x: pole.x, y: pole.y1 + 20 + 56·j}` (the pennant's top-left corner), j < 4; `pennantW` 72, `pennantH` 56, `poleBox` (pole + 4 pennants, the keep box mats avoid) | same |
| extra | `fits`, `campW`/`campH`, `keep[]` (bubble, hud, hudKeep boxes), `safe`, `rocketS` (art scale = rocketH / (nozzle.y − nose.y)), `rocketL` (= rocketH), `rocketLc` (nozzle → COM), `rocketW`, `badgeR`, `mimiS` (= mimiH / 300), `dsMin`, `hudKeep` | |

**Depth**: `depthAt(L, y) = dsMin + (1 − dsMin)·(y − horizon)/(meadow.y1 − horizon)`, dsMin 0.82 (phone portrait 0.86); a mat's hit circle is centred 0.3·itemH·ds above its centre,
r = `hitRAt(L, ds)` = 0.6·(S·ds·0.8) + 14 (phones ≥ 92); nearest centre wins. **Footprint** (`matFoot`) = x ± 0.5·S·ds, y − itemH·ds …
y + 0.21·S·ds + 6.
**Mat homes** (`matHomes`, per launch, seed = round.seed + j·7919): candidates on a 12 px grid where the footprint is ≥ 44 px from the
side screen edges, the bubble / HUD / hudKeep boxes (box gap), ≥ 40 px from the pole box, above the camp band (portrait) or ≥ 44 px from
the bottom edge and ≥ 40 px right of the camp column (landscape), centre ≥ 90 + 0.5·S·ds from the pad, below the horizon. Then seeded
farthest-point sampling with jitter (score = min(clearance, hitR) + U(0, 0.5·hitR)), 14 tries, the last 3 pure farthest-point; every pair:
hit circles ≥ 20 px apart and footprints never overlap. **Unit-tested on 11 viewports (the 6 device shapes of the task: 393×852 and
852×393 with the notch, 820×1180 / 1180×820 with insets, 1600×720, 720×1600; + iPad 4:3 both ways with insets, iPad mini, iPhone SE both
ways) × 5 ages × m 2–3 × 40 seeds.** Every one fits at S = the age base (170 / 160 / 148).

## 4. `DK.CONFIG` (all tunable via `new DK.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s (≥ 3 rounds), **chapterHardLimit 72 s (≥ 2 rounds)**, **roundLongCut 70 s (≥ 2 launches)**, shortBudget [∞, 22, 40, 56] s (a later round is 2 launches × the age's mats), introTime 2.5, levelDoneTime 3.6, Talk: afterAnswer 1.6, re-ask 12 s, glow after the 2nd, give up 2 s after the 3rd |
| mats | unfold: lead 0.35 s (next launches 0.1) + 0.16 s per mat, 0.4 s back-out (c1 1.2 → ≈ 4 % overshoot), the thing drops from 46 px at 55 % (gravity 1800, one bounce × 0.35); ask 0.30 s / next 0.15 s after the last mat; bob ± 2 px at 0.42–0.58 Hz; springs flap ω 12 ζ 0.25, squish ω 14 ζ 0.3, wig ω 16 ζ 0.22; kicks: wrong flap 0.8 + wig 0.3, right squish 0.15, landing squish 0.55 + flap 0.45, early 0.12; gold 0.4 s; glide 0.3 s; fold 0.5 s (rolls up in the first 55 %, rises 160 px with a 0.9 rad spin from 35 %, fades from 55 %) |
| aim / pump | aim **0.8 s** (≥; waits for the rocket on the pad + Mimi on the pump), tube spring ω 14 ζ 0.6, ≤ 0.6 rad; 14 arc points (9 ascent + 5 straight to the mat), fade 0.3 s; Mimi hop 0.3 s, apex 26 px, land squash −0.14; pumpCount 3, merge 0.22 s, auto after 3.0 s without a kid press (or a resume) then every 0.5 s, launch **0.6 s** after the 3rd ("Three! Blast off!" is heard as it goes); stomp: Mimi sq −0.12 (sy 0.88), plunger held 0.09 s then spring ω 30 ζ 0.7, 14 px travel, `pump` frame 0.2 s |
| flight | g 900 (raised for climbs that would coast > 1.05 s); boost 0.25 s; apex ≥ max(220, 0.5·dist) above the higher end, ≥ play.y0 + 40, ≥ 60 above both; glide ω 3.0; rot follows the velocity ω 10 ζ 0.8 (above 30 px/s); spray 36 drops over the boost, 260–520 px/s back along −v, ± 0.35 rad, life 0.6 s; chute spring ω 12 ζ 0.4 (→ ≈ 1.25 peak at ≈ 0.3 s), quadratic drag → terminal 220 px/s; pendulum ω 4.5, ζ **0.5** while opening (0.3 s + 0.15) then 0.15, + 2.5·(1 − e) near the ground, drive **0.35**·a/L, wind torque 0.6·wind/L, **soft wall ± 0.5 from the pop** (k 180, ζ 0.8 outward; hard stop ± 0.6 after the opening) — the bottle hangs under the canopy instead of flying sideways; the canopy is drawn × 1.3 (`chuteDrawK`, also in `rocket.top`); wind offset 0.6·wind px; ground fade 50 px; safety 9 s |
| landing | bounce 12 px (g 1600, once), tip upright ω 12 ζ 0.5, chute drapes to 0.3 / tilts 1.1 rad (ω 8 ζ 0.7), squash −0.18; puddle rings 0.3 S → 0.9 S (0.8 s, flat 0.42; a 2nd 0.15 s later); 8 splash drops (up 150–300, out 40–140 px/s, gravity 900, life 0.5 s, r 3–6; a drop falling back makes a tiny ring with p 0.3) |
| collect | hold 0.2 s, the thing hops 20 px in 0.22 s (× 1.12), countSel counts (first 0.45 s, then every 0.4 s, 0.3 s tail), animals: home badge (r 0.42·itemH·ds, 6 /s) 1.0 s; flies 0.55 s on a quadratic Bézier (control 70 px above the higher end) shrinking to × 0.42 → pennant (pop spring ω 14 ζ 0.35); the rocket hops home from 0.4 s: 2 hops (0.3–0.55 s each by distance, apex max(36, 0.22·|dx|) / 2nd × 0.7), squash −0.16 on each touch, 0.06 s pause; refill 0.6 s |
| camp / wipe | counts 0.3 s + 0.35 s apart (each pennant waves, spring ω 10 ζ 0.3), fountain 0.15 s after the last count (40 drops in 0.6 s up to ≈ 260 px, rainbow 0..1), roundDone at max(1.9 s, fountain + 0.8 s), cheer 0.4 s; wipe 1.3 s, swap at 0.5, unfold from 0.75 |
| help | hint after 2 misses (ignores the cooldown) or 3 no-progress presses, assist after **4**, hint 5 s, cooldown **5 s**, hand cycle 1.6 s; idle 12 s × 1.5 up to 30 s (12, 30, 57, 87, 117 s; also under a finger resting still > 2 s), the 2nd idle hints; the same wrong mat < 1 s = squish (no miss) but no-progress at most once per 0.9 s; poke hop 0.3 s, 22 px; lean ω 10 ζ 0.45 (wrong 0.14 rad for 0.6 s, −0.06 watching the flight) |
| surprises | rounds [1, 2], chapters 0–2 marmot / goat (rotating, seeded start), chapter 3 (rainbow) bird; 2–5 s after the ask (any round phase but wipe / unfold). marmot: a burrow ≥ hitR + 40 from every mat of every launch (box gap ≥ 10), up 0.4 s, looks, waves at 2.5–4 s, stays 10 s, down 0.4 s; tap r 54 → jump 26 px in 0.45 s + wave 1 s; goat: a rock on the horizon line (y = horizon − 4) whose box keeps ≥ 20 px from every mat footprint (≥ 60 px where they share height), 3 hops of 0.36 s (26 px, 44 px apart) in, stands 10 s, 3 hops out; tap r 56 → a 0.4 s hop; bird: flies in 1.2 s on an arc to the pole top, perches 10 s, flies out 1.0 s; tap r 44 → sings 0.8 s. No spot → goat falls back to the marmot; no marmot spot → none |
| wind (`DK.WindModel`) | breeze 6 / 14 / 6 / 5 px/s² (two slow sines); breezy (mood 1) gusts: first after 3–6 s, then every 6–10 s, ± 40–60, 1.5 s sin² envelope, `gust {dir}` |
| Mimi | moods idle talk happy cheer think oops wave giggle dance look (`moodTime`), blink 2.2–5 s / 0.13 s |

## 5. Render contract (what render.js reads; use `_p*` + `alpha` for every moving value)
- **Layout**: `camp`, `meadow`, `horizon` (MeadowArt), `pole` + `slots`, `pad`, `pump`, `mimiHome`, `S`, `itemH`, `mimiH`, `rocketS`, `bubble`.
- **Rings** `w.rings[] {x, y, r, a, flat}` (on the ground, under the mats; skip a ≤ 0) → `MatArt.drawPuddleRing(ctx, x, y, r, a)`.
- **Mats** `w.mats[]` (skip `'hidden'` / `'gone'`), back-to-front by `y`: `translate(x, y)` → `rotate(rot)` → `MatArt.drawMat(ctx, S·ds,
  {seed, unfold, flap: |flap| (sign = wave direction), squish: max(0, squish), gold, glow, active, wet, alpha})`. `state` ∈ hidden |
  unfold | rest | landed | fold | gone. `x, y` already include the rotation glide and the fold flight (`foldY`).
- **The thing on a mat** (when `thingA > 0`): bottom-centre at `(x, y − thingHop)` (thingHop px already includes the drop bounce, the
  ± 2 px bob and the collect hop), `rotate(wig)`, `MatArt.drawThing(ctx, thing, itemH·ds·thingS, {glow, alpha: alpha·thingA, count})`
  (`count` = pinecones counted so far, −1 = none). Home badge `mat.badge {home, x, y, r, a}` → `drawHomeBadge(ctx, home, r, {alpha: a})`.
- **The flying thing** `w.flyer {thing, x, y (its centre), s (× itemH), rot, slot}` | null → `drawThing(ctx, thing, itemH·s)` with the
  origin at `(x, y + 0.5·itemH·s)`; draw it after the mats.
- **Pole + pennants**: `MatArt.drawPole(ctx, pole.x, pole.y0, pole.y1, {t})`; `w.pennants[] {thing, slot, x, y (top-left corner on the
  pole), w, h, flutter 0..1, t, pop (spring → 1, scale), wave (spring, the camp count's little wave)}` → `drawPennant(ctx, thing, w·pop,
  {flutter: flutter + |wave|, t})` at `(x, y)`.
- **Aim arc** `w.arc [{x, y} × 14]` | null + `w.arcAlpha` → `MatArt.drawArc(ctx, arc, {t, alpha: arcAlpha})` (from `right` until it
  fades 0.3 s after `launch`).
- **Pad / pump**: `drawPad(ctx, pad.x, pad.y, {aim: rocket.aim})`; `drawPump(ctx, pump.x, pump.y, {press: pump.press (0..1; may
  overshoot −0.1..1.05), glow: pump.glow, gauge: pump.gauge, count: pump.count})`.
- **Mimi** `w.mimi`: feet `(x, y)`, height `h` (art 300 × 300, feet (150, 290), scale h/300), frame `mimi_<frame>.svg` (idle blink talk
  happy cheer think oops pump wave giggle dance look), `scale(sx, sy)` about the feet, `rotate(lean)` about the feet, facing right
  (`face` 1). `state` stand | pump | look | dance, `onPump` (her feet are on the plunger). Draw her after the pad + pump.
- **Rocket** `w.rocket`: nozzle bottom `(x, y)`, `rot` (0 = nose up) about the nozzle, art `characters/rocket.svg` (120 × 240, anchor
  nozzle (60, 236)) at scale `s` (= layout.rocketS) × `(sx, sy)` (squash / stretch about the nozzle). `water` 0..1 (bottle fill),
  `fizz` 0..1 (bubbles after each stomp). `state` pad | aim | boost | coast | chute | landed | return | fountain. Nose point `(noseX,
  noseY)`. **Chute**: when `chute > 0.05` draw `chute.svg` (240 × 200, cords' attachment (120, 196)) at the nose, `rotate(chuteRot)`,
  scale `s · chute` (chute overshoots to ≈ 1.25 when it pops, drapes at 0.3 after landing, folds to 0 on the way home); else when
  `chuteFold > 0` draw `chute_closed.svg` at the nose with alpha `chuteFold` (the packed parachute). `swing` = the pendulum angle (= rot
  under the chute), `top` = the highest drawn y (rocket + open canopy: main.js may fade the DOM bubble while `top < bubble bottom`). In
  flight draw the rocket in front of everything except fx.
- **Drops** `w.drops[] {x, y, r, a, fountain}` → `MatArt.drawDrop(ctx, x, y, r, a)` (spray, splash, fountain). **Fountain** `w.fountain
  {x, y (its base = the rocket's nose), h (current height), a, rainbow 0..1}` → a soft spray column + a little rainbow arc (alpha
  `a·rainbow`) of height h.
- **Surprises**: `w.marmot {x, y (burrow centre on the ground), burrowR, rise 0..1, jump (px up), look −1..1, wave, frame 'marmot' |
  'marmot_wave', state up|look|wave|down}` → `drawBurrow(ctx, x, y, burrowR)`, then the marmot art (anchor (80, 156)) at `(x, y +
  (1 − rise)·84 − jump)` clipped to above the burrow line. `w.goat {x, y (feet), hop (px up), a, face (±1; the art faces LEFT: mirror
  when face = +1), frame 'goat' | 'goat_hop', rockX, rockY, rockW, state in|stand|out}` → `drawRock(ctx, rockX, rockY, rockW)` then the
  goat (feet (90, 174)) at `(x, y − hop)`, alpha a. `w.bird {x, y (feet), a, face, flap 0..1, sing 0..1, frame 'bird' | 'bird_sing',
  state in|perch|out}` (perch feet (50, 86)) — on the pole top while perched.
- **Hint hand** `w.hintHand {x, y, press, alpha}` → `drawHintHand` (it follows the mat).
- **Wipe** `w.wipe {t 0..1, dir {x, y}, mood, weather}`: the sweep covers the screen around t = 0.5 (swap); call
  `weather.wipeParticles(dir)` on the `wipe` event.
- **Weather** (`DK.Weather`, §7): `ambient` sky / tint / sun / rain / rainbow, `clouds`, `particles` (`layer 'back'` behind the mats,
  `'front'` over everything incl. the wipe sweep).

## 6. Events (`drainEvents()`; every event except session / talkAsk / talkResult / levelDone / sessionDone has `x, y` in logical px,
clamped on screen — unit-tested over 50 bot sessions)
| event | when / fields | main.js should |
|---|---|---|
| `session` | `{levels}` | — |
| `level` | `{level, topic, weather}` (x, y = meadow centre) | `weather.setWeather(weather)`, banner, `weather.N` line |
| `round` | `{round, topic, surprise, k, m, n, mode, short, key}` — the first unfold of a round starts | — |
| `unfold` | `{id, launch, i}` (x, y = its home) | soft cloth "fwump" |
| `ask` | `{promptKey, params, rule, first, modeFirst, round, k, m, mode}` (x, y = Mimi's bill) — only before a round's FIRST launch | `speakPrompt(I18N.ask(…))` |
| `next` | `{launch, left, k, mode, promptKey, params, rule, count?}` — before launch j ≥ 1 (mats unfolded) | `sayNext` |
| `right` | `{id, thing, rule, mode, launch, row (= launch), k, left (launches left after this one), misses, count? (countSeq: launch + 1), n? (countSel), home? (animals)}` | bright bloop + `sayRight` |
| `aim` | `{id, angle}` (x, y = pad) | ratchet click |
| `pumpAsk` | (x, y = pump) — phase pump starts | `pumpAsk[]` |
| `pump` | `{n 1..3, auto}` (x, y = pump) | squeaky "pff" (pitch up per n) + `sayPump(n)` |
| `pumpAuto` | once per launch, just before Mimi's first own stomp | `pumpAuto[]` ("I'll help!") |
| `launch` / `whoosh` | `{id}` / — (x, y = pad) | water WHOOSH |
| `chute` | `{id}` (x, y = the canopy point at the apex) | "fwap" (+ rarely `chute[]`) |
| `land` | `{id, launch, row, k, err (touchdown error px vs `landPt`, ≤ 0.1), flight (s since launch), tx, ty (the touchdown point)}` (x, y = the mat) | "pomf" + `land[]` |
| `splash` | `{id}` | splash |
| `fold` | `{id}` — the other mats of the launch at the landing, the landed mat when the next launch starts | cloth flap |
| `count` | `{id, i (1-based), n}` (countSel, 0.4 s apart while the sign sits on the mat) · `{i, n, camp: true, id}` (camp, 0.35 s apart, one per pennant in collection order) | pip + `sayCount(i)`; at i = n `sayCountRun(n, 'dots')` (countSel) |
| `homeBadge` | `{id, home}` | small pop |
| `pennant` | `{id, slot, thing}` (x, y = the slot) | rope zip + ding, `sayPennant` |
| `hopBack` | `{n 1..2}` (x, y = the take-off point) | boing |
| `camp` | `{n (pennants)}` (x, y = the pole) | `camp[]` |
| `fountain` | (x, y = the rocket's nose) | sparkling spray (+ `weather.burst(x, y, {kind: 'rainbow'})`) |
| `roundDone` | `{round, stars, misses, assisted, pennants}` (x, y above Mimi's head) | stars fly to the HUD |
| `wipe` | `{mood, weather, dir}` | whoosh, `weather.wipeParticles(dir)` |
| `wrong` | `{id, thing, got {nameKind, nameValue}, want {kind, value, nameKind, promptKey, params, left, count?}, rule, mode, launch, row, streak, misses, hint?}` | blub-wobble + `sayWrong` |
| `squish` | `{id, repeat? | early?}` | wobble only |
| `soft` | a press on grass / pump / rocket / nothing | grass tick |
| `hint` | `{id, want, idle?}` | `hint[]` |
| `assistArmed` / `assist` | `{id}` / `{id, from}` (a `right` follows) | — |
| `idle` | `{n, promptKey, params, rule, left, mode}` | `idle[]` / the question again |
| `pokeMimi` | `{promptKey, params, rule, left, mode}` in play, else `{busy: true}` | giggle "Quack!" (+ the question in play) |
| `marmot` / `marmotTap` | — | whistle; `surprise.marmot` / `marmot.tap` |
| `goat` / `goatTap` | — | bleat; `surprise.goat` / `goat.tap` |
| `bird` / `birdTap` | — | chirp; `surprise.bird` / `bird.tap` |
| `gust` | `{dir}` (breezy) | wind swell |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars}` | as the base | as the base (sessionDone: Mimi `dance`, `weather.setParty(true)`) |

**Debug / test helpers (logical px)** — DESIGN §5.5's `DK.debug.*Screen()` wrap these: `matHit(id)` → `{x, y, r, own}` (null when not
tappable) · `mimiHit()` → `{x, y, w, h, cx, cy}` · `pumpHit()` → `{x, y, r}` · `marmotHit() / goatHit() / birdHit()` → `{x, y, r, cx, cy}`
(a point off every mat body, the bubble / HUD and Mimi) or null · `answer()` → `{mat, id}` in play / `{pump: true, x, y}` in pump / null ·
`targets()` → `[id]` in play else `[]`.

## 7. `DK.Weather` (DESIGN §5.3)
`new DK.Weather({width, height, seed, layout, weather})`, `windSource = world`, `resize(W, H, layout)` (raindrops splash between
`layout.horizon` and `layout.play.y1`), `setWeather(i, {instant})` (0 sunny, 1 breezy, 2 rain, 3 rainbow; 2.5 s crossfade),
`setParty(on)`, `update(dt)` (1/60 steps), `burst(x, y, {kind: 'stars'|'sparkle'|'confetti'|'drops'|'rainbow'|'petals'|'leaves'|'dots',
n, color})`, `wipeParticles(dir)` (sun motes + sparkles / leaves + petals / rain streaks / rainbow sparkles), `wind`, `gust`.
`ambient {skyTop, skyMid, skyBottom, tint, light, sunX, sunY (px), sunA, dark (rain 0.12), wind 0..1, windPx, gust, rain, rainbow, party,
mood, moodIndex, env (= mood: env/far_<env>.svg, mid_<env>.svg), envFrom, envMix}`; skies exactly DESIGN §3. `clouds[] {type cloud_a |
cloud_b | cloud_rain, x, y, s, alpha, flipX}` (rain swaps 4 of 6 to rain clouds while invisible). Particles: sunny motes + butterflies,
breezy leaves + petals flying across (faster in gusts), rain streaks (≈ 54, slanted by the wind) + `splash` sprites on the meadow, rainbow
`rainbow_sparkle` + sparkles + butterflies; party = stars + confetti + rainbow sparkles. Cap 120 (+ 60 for the wipe sweep).

## 8. Playtest numbers (`hs_playtest.js`, after tuning)
`--n 80 --models typical,slow3,botT0.8,kid0.3,kid0.6,kid0.9` (2 200 sessions) + `--n 40 --models perfect,tapper,spammer,bot1,absent`
(815 sessions), 1/30 s frames through the real input API on 5 viewports (iPhone portrait / landscape with the notch, iPad 1036 × 720 and
720 × 1036 with insets, 1600 × 720), EN / VI alternating. **Every model, every age: 0 failed sessions, 0 stuck states, 0 NaN, 0 mats /
Mimi / rocket off screen, 0 landings > 2 px off the mat, 0 "2 misses without a hint", 0 % repeated sets; 0 rounds > 120 s except slow3
(1 of ≈ 900 rounds at age 3, 128 s: it looked away for 10–20 s at a time while the hints kept coming).**

| model | age | session min mean (p90) | chapter s mean [p10–p90] | round s | flight s mean [p10–p90] | pump s (auto %) | stars 3/2/1 % | hint rounds % |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.7 (7.2) | 97.2 [82.1–109.0] | 32.1 | 1.98 [1.64–2.41] | 3.1 (13) | 50 / 31 / 19 | 19 |
| **typical** | **4** | **6.6 (6.8)** | **94.9 [84.8–105.1]** | 29.6 | 1.97 [1.65–2.39] | 2.9 (6) | 67 / 25 / 8 | 8 |
| typical | 5 | 6.5 (6.9) | 93.2 [80.3–104.1] | 30.8 | 1.98 | 2.7 (7) | 70 / 23 / 7 | 7 |
| typical | 6 | 6.4 (6.7) | 92.0 [79.9–102.4] | 29.7 | 1.97 | 2.6 (6) | 76 / 19 / 5 | 5 |
| typical | 7 | 6.4 (6.6) | 92.3 [85.0–99.6] | 28.3 | 1.96 | 2.6 (7) | 78 / 19 / 3 | 3 |
| botT0.8 (toddler-paced DK.Bot) | 3–7 | 6.0–6.4 (≤ 6.7) | 86–92 | 24–27 | 1.96–1.97 | 2.2–2.3 (14–17) | 55–66 / 24–32 / 10–15 | 10–15 |
| kid0.3 | 3–7 | 6.4–6.6 (≤ 7.1) | 92–95 | 36–39 | 1.96 | 2.5–3.1 | 7–9 / 8–12 / 79–85 | 79–85 |
| kid0.6 | 3–7 | 6.3–6.7 (≤ 7.3) | 91–98 | 31–34 | 1.97 | 2.5–3.1 | 29–38 / 25–30 / 32–42 | 32–42 |
| kid0.9 | 3–7 | 6.4–6.7 (≤ 7.0) | 92–97 | 28–30 | 1.97 | 2.6–3.1 | 78–82 / 15–19 / 3–4 | 3–4 |
| slow3 | 3 | 7.2 (7.8) | 105.1 [87.4–125.9] | 46.0 | 1.96 | 4.8 (26) | 35 / 30 / 36 | 37 |
| slow3 | 4 | 7.0 (7.6) | 102.1 [85.4–120.9] | 45.1 | 1.97 | 4.8 (26) | 39 / 32 / 29 | 30 |
| perfect | 3–7 | 5.9–6.3 | 85–90 | 21–23 | 1.96–1.97 | 1.3 (0) | 100 / 0 / 0 | 0 |
| bot1 (quick) | 3–7 | 5.9–6.1 | 85–88 | 20–22 | 1.96–1.98 | 2.2–2.3 (14–16) | 100 / 0 / 0 | 0 |
| tapper | 3–7 | 6.3–6.8 (≤ 7.4) | 91–99 | 37–43 | 1.96–1.98 | 4.1–4.2 | 15–24 / 32–46 / 36–54 | 77–85 (assist 53–66 %) |
| spammer | 3–7 | 6.0–6.4 (≤ 6.6) | 86–92 | 23–24 | 1.96–1.97 | 0.9 | 19–25 / 41–50 / 25–39 | 49–59 |

- **Targets met**: a typical 4-year-old's chapter 94.9 s mean (target 60–100 s), session 6.6 min (p90 6.8; ≤ 8 min); every model's
  p90 session ≤ 7.8 min (slow3 at ages 3–4).
- A typical age-4 round (29.6 s, almost always 2 launches × 2 mats — the short rule) = first unfold 1.2 s + listening + thinking (first
  right 6.7 s after the ask) + per launch: aim 0.45 s, pump 2.9 s (the child's three stomps), 0.25 s, flight 2.0 s, collect → next mats
  ≈ 1.6 s, the child's next look ≈ 3 s; + camp 1.9 s + cheer 0.4 s + wipe to the next unfold 1.0 s.
- Flights: 1.64–2.41 s (p10–p90; DESIGN ≈ 1.9–2.3 s): boost 0.25 + coast 0.6–1.05 + chute 0.7–1.2 s.
- Auto-pump: 6 % of a typical 4-year-old's launches, 26 % for slow3 — never stuck at the pump.
- Surprises: ≈ 25–33 % of rounds; a typical child taps ≈ 70 % of them.
- Idle nudges for an absent child: 15.7, 33.7, 60.7, 90.7, 120.7, 150.7 s into the session = 12, 30, 57, 87, 117, 147 s after the ask
  (the 2nd and later also hint); a round waits for the child (no auto-play in play; the pump auto-pumps after 3 s).

## 9. QA fix round (2026-11-22) — what changed in the mechanics
C1 short rounds keep the age's mats · C2 a new picture per launch (shapes < 5: a colour per launch; size: an obj + colour per launch;
colours: a new obj per launch from age 3) · aim 0.8 s · launch 0.6 s · assist 4 · hint cooldown 5 s + miss hints forced · resume restarts
the pump window · resting finger → idle nudges · touchdown beside the thing (`landPt`) · landscape camp 26 / 96 / 160 / 262 · pump 76 px up ·
phone mats bigger · phone bubble bigger · pennants 72 × 56, pitch 56 (portrait pole 92 px from the right edge) · swing soft wall ± 0.5 from
the pop. Numbers before → after: `docs/reports/integration.md` "Fixes after QA".
