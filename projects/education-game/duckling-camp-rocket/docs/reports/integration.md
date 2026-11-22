# Integration report — Mimi's Splash Rocket (integrator, 2026-11-22)

Files: `game/index.html`, `css/style.css`, `manifest.webmanifest`, `js/storage.js` (unchanged: prefix `dk:`), `js/assets.js`,
`js/audio.js`, `js/render.js`, `js/ui.js`, `js/main.js`, `tests/e2e/{smoke,functional,screens}.js`, `README.md`, `CLAUDE.md`.

## What was wired
- **index.html**: script order rng, i18n, content, mimi_points, world, weather, bot, storage, assets, audio, voice, input,
  mat_art, meadow_art, render, ui, main (nim_points / stone_art / river_art removed); titles, logo, meta, theme colour.
- **assets.js**: the new list — `characters/mimi_{idle … look, title}`, rocket, chute, chute_closed, marmot(_wave),
  goat(_hop), bird(_sing); the 12 animals; `env/far_*`, `mid_*` × 4 moods + sun, clouds (a, b, rain), rainbow, tents,
  campfire, pine, rock, flowers, windsock; the 15 particles of the art_env report; ui stars; icon. `DK.Assets.missing` is
  empty on every device (checked by smoke + functional).
- **audio.js**: the loud chain is unchanged (compressor −18 dB / knee 12 / 4:1 / 4 ms / 180 ms → volume × 1.6,
  `navigator.audioSession.type = 'playback'` in `unlock()`). New synthesized set (DESIGN §7): unfold, right, aim (ratchet),
  pump (pitch rises per stomp + bubbles), launch (water whoosh), chute ("fwap"), land ("pomf"), splash, wrong, squish, soft,
  fold, pennant (rope zip + ding), pip, fountain, hopBack (boing), whistle (marmot), bleat (goat), chirp (bird), gust, wipe,
  giggle-quack … Ambience per mood: sunny birds, breezy wind swells, rain = a patter bed + drips on the tents, rainbow chimes.
  Music bed per mood: ukulele (new `uke()` pluck) / marimba / marimba / bells, ducked under speech.
- **render.js**: rewritten for the meadow. The env RECIPE (`docs/reports/art_env.md`) is pasted verbatim; `drawEnv` + MeadowArt
  are drawn for both moods during a weather crossfade. Mats back-to-front with things (signed flap / squish, unfold overshoot,
  gold, glow, active ring, wet in rain), home badges, the flying thing, aim arc, pad + pump, Mimi (frames from
  `world.mimi.frame`, talk-flap while speaking, squash + lean about the feet, soft ground shadow), the rocket (rotated about
  the nozzle, × sx/sy, the drained part of the bottle cleared above the water line, fizz bubbles), the chute at
  `noseX/noseY` scaled `s·chute` with `chuteRot` (the packed bundle while `chuteFold`), drops, puddle rings, the fountain (a
  soft spray column + a 6-band pastel rainbow arc), marmot clipped above its burrow, goat on its rock, bird on the pole, hint
  hand, weather sweep (per-mood haze + bits), chapter banner (a wooden camp sign). All moving values interpolate `_p*` with
  `world.alpha`. Adaptive quality and the ≤ 3.2 MP touch cap come from main.js as before.
  - Title: Mimi in her title pose (waving, the rocket under her wing) by the camp; the flagpole with two pennants; 3 mats
    placed clear of the DOM title (`render.titleKeep`, measured by main) and the camp; a demo rocket sways down under its
    parachute onto the first mat every 9 s (only when it can start below every title box above that mat).
  - Session done: golden mats, the pole, a **garland of every pennant won** (≤ 12) strung from the pole top across the meadow
    below the done panel, the rocket shooting a fountain with a rainbow every 2.6 s, Mimi dancing, confetti.
- **ui.js**: Talk-time question card = the thing on a picnic mat (`Renderer.preview(…, {mat: true})`); names.
- **main.js**: state machine as the base, events per VOICE.md §3 (table followed line by line: `ask` / `next` protected,
  `right` queued behind a protected prompt else interrupting with tag `right`, `pumpAsk` shown + spoken only if nothing speaks
  1.2 s later and no stomp came, `pump` → `Voice.sayPump(n, {lang, auto})` only, `launch` → `Voice.resetPump()`, rare
  droppable `unfold` / `chute` / `land` / `wipe`, the countSel collect count as ONE `sayCountUp` line on `count i = 1`, the
  pennant line as the launch's praise (skipped in countSel and when a question waits), the camp as ONE `sayCamp` count line,
  idle in the pump phase = `pumpAsk`, resume in the pump phase = `pumpAsk`). `DK.Input.attach(…, { rapidTaps: () => mode ===
  'play' && world.phase === 'pump' })`. Every `DK.debug` hook of DESIGN §5.5 (`matScreen`, `mimiScreen`, `pumpScreen`,
  `marmotScreen`, `goatScreen`, `birdScreen`, `answer`, `targets`, `toScreen`, `events`, `voiceLog`, `setSpeed`, `startGame`,
  `goTitle`, `setBot`, `setAutoRestart`, `gotoLevel`, `audio`, `view`, `render`, `getState`) with live getters via
  `Object.defineProperties`.

## Decisions
1. **Layout adapter (no module change)**: world.js gives `layout.camp` / `layout.meadow` as `{x0, x1, y0, y1}`; MeadowArt and
   the RECIPE read `{x, y, w, h}` (the env report's fake layout). `Renderer.artLayout(L)` returns a shallow copy with both
   forms (cached per layout object); MeadowArt and `envLayout` always get that copy.
2. **The foot pump is drawn at 0.85 × MatArt's size** about its plunger top (`PUMP_K` in render.js), with the pad's hose
   end scaled to match: at full size (≈ 127 × 85 px with the base plate 78 px below the plunger) it ran off the bottom on
   every phone. The hit circle is the world's (r ≥ 80), so the target size is unchanged.
3. **The pump numeral** ("1", "2", "3" popping up per stomp) sits above Mimi's hat, not on her face.
4. **Bubble / HUD safety net**: while the rocket (+ its open canopy) flies under the DOM speech bubble or the real HUD box
   (measured from the DOM, `world.hudKeep[0]`), they step back to 30–35 % opacity (still tappable). The apex clamp
   (`play.y0 + 40`) keeps the rocket below the bubble band, but the canopy (≈ 100 px above the nose) can reach under it.
5. **Windsock keep-out**: MeadowArt stands the windsock on the meadow's far edge (outside the camp column, `edge: true`). In
   portrait the goat's rock landed on it. main.js appends the windsock's prop box (± 6 px) to `world.hudKeep`, so mats and the
   goat spot keep clear of it (the art report suggested this).
6. The DOM title boxes (logo, tagline, ▶, star line, language switch, gear) are measured into `render.titleKeep`; the
   celebration panel into `render.donePanel`.
7. `pumpAuto` speaks nothing itself: the "I'll help!" head is part of Mimi's first auto pump line (`Voice.sayPump` with
   `auto: true`, VOICE §2.1.6).

## Module fixes (small, documented)
- **world.js** `CONFIG.pumpUp` 40 → **66**: the pump's plunger top now sits 66 px above the safe bottom, so the whole pump
  (base plate + shadow) is on screen on iPhone landscape / portrait with the home-indicator inset (it was cut off by ≈ 35 px).
  Mimi's feet on the plunger follow `layout.pump` as before. `node tests/unit/run.js` re-run: 33/33 pass.
- No other module was edited.

## Tests (all exit 0)
- `node tests/unit/run.js` — 33/33 (≈ 85 s). `node tests/unit/i18n_voice.test.js` — 90 347 checks. `node tests/unit/mat_art.test.js`
  — 15 110 checks.
- `node tests/e2e/smoke.js` — iPhone portrait + landscape: boot, no console errors, no missing assets, ONE real
  `page.touchscreen.tap` on the right mat → `right`, then 3 real taps on `pumpScreen()` → `pump` ×3 (n 1, 2, 3, none auto),
  `launch`, `land` on the tapped mat; then a full bot session at speed 8 to the done screen (16 rounds, 32 launches / lands /
  pennants, 4 Talk times).
- `node tests/e2e/functional.js` — 4 devices (iPhone 393×852 @3 / 852×393, iPad 820×1180 / 1180×820 @2), every tap a real CDP
  touch: boot, right + pump ×3 + flight + land on the mat + pennant + voice lines, wrong (kind words, squish on a repeat, the
  round goes on, 2★), grass tap = soft, a full round by taps (camp counts every pennant, fountain, 3★, next round fresh),
  **two-finger pump drumming** (rapidTaps), **auto pump** after 3 s ("I'll help!"), rotation mid-round and **mid-flight** (the
  rocket still lands exactly on the re-laid mat), marmot / goat / bird taps, countSeq / countSel, 2 misses → hint hand, Mimi
  / bubble tap repeats the question, Talk time by tap, pause / resume, visibility pause, a second finger ignored in play, EN ↔ VI,
  parent gate, settings persistence (URL flags never saved), the audio chain + volume, release over the HUD, `?age=` shown =
  played, the voice policy with a fake `speechSynthesis` (the question heard in full, "One … Two … Three! Blast off!" never cut,
  the pennant praise spoken after the launch); + 10 bot sessions (ages 3–7 × EN / VI) with no raw keys and the right language.
- `node tests/e2e/screens.js` — visual QA shots of title, play, aim + pump, mid-flight with the chute, landing, pennant, camp
  fountain, Talk time, session done in all 4 moods on all 4 device shapes with notch insets (→ `tests/out/screens/`).

## Known issues / not done
- `tests/qa/*` are the base game's (river) QA scripts and do not run against this game; the QA team will replace them.
  `tests/sim/pt_*.js` (river speech-timing harness) and `tests/e2e/screens_edges.js` (river edge shots) were deleted as obsolete;
  `screens.js` now covers the notch insets itself; `tests/sim/hs_*.js` are the mechanics engineer's.
- Real-device TTS / mic behaviour is unverified here (Chromium has no voices; tests use the voice log and a fake synth).
- The open canopy can float briefly under the HUD / bubble on landscape phones (they fade, so it stays visible).

## Fixes after QA (fix engineer, 2026-11-22)
Inputs: `qa_functional.md`, `qa_visual.md`, `playtest_report.md`. Every proposal was applied (or replaced by an equivalent),
re-tested and re-shot. No git commit.

### Playtest (C1–C9)
| id | change | where |
|---|---|---|
| C1 | a short round keeps the age's mats; only the launches drop to 2 (`tableKM`); unit-test `wantKM` + the "short" test follow | `content.js`, `tests/unit/run.js` |
| C2 | a new picture per launch: shapes < 5 a colour per launch, size an obj + colour per launch, colours a new obj per launch from age 3; `validate` per row | `content.js` (= `tests/sim/patches/mats_vary.json`) |
| C3 | the right line only names the thing (`pump: false`); `'right'` out of `PUMP_CUTS` (the stomps wait + merge); `PUMP_RATE` 1.0 → **1.2**; the first stomp drops a name line that has not started; `aimTime` 0.45 → **0.8** | `main.js`, `voice.js`, `world.js`, voice unit test |
| C4 | a right tap clears the wrong / hint guard, so the name line cuts a moot wrong / hint line | `main.js` |
| C5 | no pennant line while another launch of the round follows | `main.js` |
| C6 | camp line = `sayCountUp(n, 'flags')` ("One, two, three! Three flags!") | `main.js` |
| C7 | `.first` prompts: the topic sentence dropped (home / countSeq / shapes5 kept), key word early | `i18n.js` (EN + VI) |
| C8 | `launchDelay` 0.25 → **0.6** | `world.js` |
| C9 | `assistAfter` 5 → **4** | `world.js` |

### Functional QA
- **P2-1** `resetNudges()` also restarts the pump window (`_pumpS.kid = time` in phase pump) → after Resume the first auto stomp
  comes 2.95–2.98 s later (was 0.11 s). Unit-tested.
- **P3-1** `hintCooldown` 6 → 5 (= the glow) **and** a miss-triggered hint ignores the cooldown → the probe now sees the hint
  (`hint_cooldown_gap`: "wrong, wrong, hint; right mat glowing"). Unit-tested.
- **P3-4** a finger resting still > 2 s (`idleRestHold`, < 24 px slide) no longer stops the idle nudges (`long_press`: `soft, idle`). Unit-tested.
- **P3-5** `functional.js auto_pump` accepts every `pumpAuto` wording (`/help|let me pump|giúp|để mimi bơm/i`).
- Found on the way: in iPad portrait a goat round can find no free goat spot (the bigger pole box + windsock) → the world falls
  back to the marmot, but `world.surprise` still said "goat" (the e2e `surprise_goat` then waited 25 s in vain). `world.surprise`
  now reports what really came; `surpriseTest` waits for the spawn before reading it.
- `qa_functional.js`: `assisted_round` taps `cfg.assistAfter` times; `unfold_taps` / `busy_phase_taps` tap in slow motion
  (they raced the next launch opening under CPU load).

### Visual QA
- **P1-1** the rocket lands **beside** the thing: `world.landPt(mat)` = `(x ± 0.30·S·ds, y + 0.04·S·ds)`, away from the pad (flight,
  arc end, rings, splash, `land.err` + new `land.tx/ty`); render draws the landed mat's thing and the flyer **after** the rocket.
  Landing stays exact (unit: err ≤ 2 px on every shape incl. resizes mid-flight; e2e checks against `landPt`).
- **P1-2** landscape camp at ins.left + 26 / **96 / 160 / 262** (pole / Mimi / pump / pad): Mimi on the plunger is clear of the bottle.
- **P1-3** phones: portrait S × 1.22 (208 / 196 / 180), itemH 0.70·S, horizon play.y0 + 150, depth 0.86–1.0; landscape S × 1.1
  (187 / 176 / 163), itemH 0.68·S. `matHomes` fit re-checked: all 11 viewports × 5 ages × m 2–3 × 40 seeds fit at the full phone
  size (unit-tested, `L.S` = the phone size). Sign glyphs bigger (disc 40 → 46, 2-char 33 → 38, wide sign 98 → 116 units with text
  34/30 → 40/36, numeral 27 → 30); with the bigger itemH a one-glyph sign is ≈ 0.45·itemH and a 4-glyph sum ≈ 0.30·itemH (a 4-glyph
  sum cannot reach 0.42 inside the 132-unit sprite box: not done).
- **P2-1** bubble font floor 14 px (`max(14, fs·0.92)`); phone bubble: portrait h 124 → 150, landscape w ≤ 700 → 960. The world's
  `hudBox()` now only takes top-anchored keep boxes (it had picked the windsock box, so the wide bubble ran under the HUD).
- **P2-2** swing soft wall ± 0.5 from the pop (k 180, ζ 0.8 outward; hard stop ± 0.6 after the opening), opening ζ 0.5, drive 0.35.
- **P2-3** the pump numeral pops on a cream disc (`#FBF3DD`, rim `#D9C59A`).
- **P2-4** pennants 72 × 56, pitch 56, top 20 (portrait pole 92 px from the right edge); MeadowArt's pennant keep box follows
  the layout; done garland ≤ 8 pennants at 0.8 × the pole size, hung between the panel and the topmost golden mat (portrait: as
  bunting under the panel, the pole top stands in the camp there).
- **P2-5** aim arc dots r 9 → 6 with a 2 px `#4E7560` ring, alpha floor 0.75, shadow 0.4.
- **P2-6** a cream halo behind objects / shapes on a wet mat (rain).
- **P2-7** the open canopy drawn × 1.3 (`chuteDrawK`, also in `rocket.top` for the bubble fade).
- **P3s**: mic label nowrap (VI "Chạm hoặc nói nhé!"), phone-landscape settings toggles nowrap (VI "Giọng của Mimi" fits in one
  line), an edge tent (landscape tent_b) is a keep box like the windsock, `pumpUp` 66 → 76, fountain rainbow × 0.6 and high in the
  spray, done mats keep ≥ 30 px (+ the garland's 150 px when they fit) below the panel (re-measured after the panel's pop-in), bird × 1.3.
- Re-shot with `tests/qa/visual.js` (iPhone portrait + landscape EN/VI, iPad portrait) and looked at: play, pump, flight + chute,
  land, collect, pennant, camp, Talk, settings, done.

### Before → after (re-run)
| measure | before (playtest baseline) | after |
|---|---|---|
| `hs_deep.js --n 80` (6 models, 1 680 sessions): NaN / stuck / off screen / 2-miss-no-hint / rounds > 120 s | 0 | **0** |
| typical age 4: session min mean (p90) · chapter s | 6.5 (6.9) · 94.6 | 6.7 (7.1) · 96.7 |
| typical: rounds with 3 mats, age 4 / 5 / 6 / 7 | 0 / 0 / 27 / 25 % | **31 / 60 / 91 / 91 %** |
| typical stars 3/2/1 age 4 · age 7 | 68/24/8 · 80/17/3 | 69/24/8 · 79/18/3 |
| same target picture as the previous launch, typical age 3 / 4 | 87 / 60 % | **32 / 27 %** (the rest: warm-up obj, inherent rules) |
| "nearest" child session p90, ages 3–7 | 8.0–8.7 min | 7.6–8.4 min |
| `hs_voice.js` (real page, toddler bot, 6 sessions EN portrait + landscape, ages 3 / 4 / 6): lines / min | 18.7–23.3 | 20.2–21.3 |
| Mimi talks % of the time | 83–96 | **71–79** |
| prompts heard to the end | 70 % | **97 %** (169 / 174; start delay 0.05–0.09 s) |
| right (naming) line heard to the end · said after the landing | 30 % · 80 / 304 | **95 %** (143 / 150) · **0** |
| pump count complete (1-2-3) | 96 % | **100 %** (0 stale) |
| "Blast off!" end after lift-off s mean · after the landing | 2.26 · 42 % | **1.89–2.02** · **27 %** (41 / 150; the proposal predicted 27 %) |
| wrong lines | spoken in full | cut by the child's right tap (C4, by design: the goal is moot) |

### Tests after the fixes (one sequential run, all exit 0)
- `node tests/unit/run.js` **33/33** (new checks: touchdown beside the thing, launch 0.6 s, assist 4, miss hint inside the old
  cooldown gap, idle under a resting finger, resume restarts the pump window, phone sizes fit at full size, pennant slots 20 + 56·j).
- `node tests/unit/i18n_voice.test.js` **90 350 passed, 0 failed** (the stomp waits for the name line, PUMP_RATE 1.2).
- `node tests/unit/mat_art.test.js` **15 110 passed**.
- `node tests/e2e/smoke.js` **PASS** iPhone portrait + landscape (real taps → right, 3 pumps, launch, land; bot session to done).
- `node tests/e2e/functional.js` **86/86** (875 s).
- `node tests/qa/qa_functional.js` **41/41** (incl. `pause_in_pump`: first auto stomp 2.95–2.98 s after Resume; `hint_cooldown_gap`:
  the hint comes; `long_press`: `soft, idle`).
- Sims: `node tests/sim/hs_deep.js --n 80 --models typical,kid0.6,botT0.8,slow3,tapper,nearest --tag after`,
  `node tests/sim/hs_voice.js --sessions 1 --ages 3,4,6 [--vp iphone-landscape]` (numbers above).

### Still open
- A 4-glyph sum sign ("10−6") reaches ≈ 0.30·itemH, not the 0.42 the visual report asked (it would need a sign wider than the
  thing's sprite box); one-glyph signs and numerals reach it.
- The pathological "always the nearest mat" child at ages 5–7 still has a session p90 of 8.3–8.4 min (target ≤ 8).
- Wrong lines are now nearly always cut by the child's next (right) tap (C4) — intended, but a child who answers fast hears only
  the start of the teaching line.
- Real-device TTS (iOS rate 1.2 for "Một! Hai! Ba!") still unverified.
