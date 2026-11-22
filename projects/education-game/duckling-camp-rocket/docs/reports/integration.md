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
