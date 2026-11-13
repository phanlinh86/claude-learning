# Integration report — Bao's Bubble Sky

Integrator-owned files: `game/js/{storage,assets,audio,render,ui,main}.js`, `game/index.html`,
`game/manifest.webmanifest`, `game/css/style.css`, `tests/e2e/*`. Everything else is a finished specialist module, called
but not rewritten (one one-line title fix in `rng.js`, noted below). This report records the decisions and the two small
fixes outside my files.

## What the integrator built
- **index.html / manifest / theme-color**: titles → "Bao's Bubble Sky · Gấu Trúc Bảo Thổi Bong Bóng", app title "Bubble
  Sky", new meta description, theme-color `#CFE6FA` (spring sky top), logo spans "Bao's / Bubble Sky". Script order per
  DESIGN §5 with `bao_points.js` after `content.js` and `bubble_art.js` in place of `parade_art.js`.
- **style.css**: kept the proven mobile CSS (safe areas, every QA-tuned breakpoint); re-tinted the farm palette to the
  pastel sky — periwinkle rims (`--rim #A9BEEB`), deep-lilac ink / logo outline (`--ink #3E3A5C`, `--lilac-d #5A5FA6`),
  cloud-white panels, a rainbow-glow logo.
- **assets.js**: preload list for this game — Bao's 12 frames + title, bird / bird_flap / kite, 12 animal stills (only the
  non-step frame is drawn inside a bubble), env per season (far/mid/ground/cushion) + sun/moon/cloud_a/b, all 16 particles
  incl. snow/blossom/glint, ui star + icon. Same sprite/exact/tinted raster cache as the parade.
- **audio.js**: kept the loud chain (audioSession 'playback', compressor −18/12/4/4 ms/180 ms, ×1.6 makeup, user volume,
  ducking, season beds) and wrote the new synth voices per DESIGN §7: blow (breathy swell), blup, bump (rate-limited, volume
  ∝ speed), pop (bright click + airy splash, varied pitch, quieter when soft), paint (rising glassy chime per piece),
  rainbow (shimmer arpeggio), squish (low rubbery boing), soft (tiny bubbling), count pip, whoosh, gust, tweet, flutter,
  twinkle, giggle; gentle marimba / kalimba / bell bed + bird / bee / wind / chime ambience per season. `A.SOUNDS` lists
  every effect so `functional.js` can play them all without throwing.
- **render.js**: env via the pasted `RECIPE` / `envLayout` / `tileXs` / `cushionRect` / `drawEnv` with a season crossfade;
  the bubble field back-to-front (`drawBubble` part:'back' → `drawThing` 1.2·r → part:'front'), growing bubbles on the wand,
  Bao by mood with blink / talk-flap + bounce, freed things (hop / count / badge / curved flight with a soft glow, count
  highlighting), rainbow + its mist, home badge, drops, minis, bird, kite (sagging string), snowflakes, hint hand, weather
  particles back/front, fx (sparkles, numerals, stars flying to the HUD), the chapter banner with a rainbow rim, a title
  screen with Bao waving and bubbles drifting up, a session-done scene where Bao dances / blows a sky of bubbles that pop
  into confetti. Interpolation with `world.alpha` (`ip()`), the adaptive-quality + DPR caches from the parade.
- **ui.js**: adapted to Bao / bubble; Talk-time pictures now draw the shown thing **inside a soap bubble** (`Renderer.preview`
  `{bubble:true}`), answer cards via `PB.BubbleArt.drawIcon`.
- **main.js**: event → voice/sound/fx per VOICE §1.1 and MECHANICS §6; prompt protection, countPop one-line-per-pop and the
  countSel run queued + protected (never cut), praise only at `rainbowDone` after a miss or the chapter's last round, the
  whoosh named rarely, surprises; `weather.windSource = world`; the test hooks exactly per DESIGN §5.5
  (`bubbleScreen/baoScreen/birdScreen/kiteScreen/snowScreen`, `answer()`, `targets()`, `audio()`, `voiceLog`, `stats`,
  `events`, `getState`, `setSpeed`, `startGame`, `goTitle`, `setBot`, `setAutoRestart`, `gotoLevel`, `toScreen`) via
  `Object.defineProperties(obj, Object.getOwnPropertyDescriptors({…}))` for live getters; URL flags session-only; the
  celebration plays a soft pop as each bubble bursts (`render.onDonePop`).
- **tests**: rewrote `tests/e2e/{smoke,functional}.js` for the bubble game (real CDP / page.touchscreen taps on the drifting
  bubbles at `debug.bubbleScreen(id)` — read right before the touch, since bubbles move). `serve.js` header updated. Deleted
  the parade-only `tests/qa/*` and `tests/visual/keep.txt`; `functional.js` (iPhone 393×852@3 + landscape, iPad 820×1180@2 +
  landscape) covers boot/title, language switch, the 2 s parent gate, settings persistence (URL flags never saved, keys
  under `pb:`), real taps for right / wrong / empty sky / swipe / countPop / countSel, surprises, two-miss hint, Talk by tap,
  pause/resume, visibility pause, rotate mid-round and mid-flight, second-finger-ignored, the volume chain, release-over-HUD,
  and a full bot session per age 3–7 × EN/VI, all with zero console errors.

## Deviations from DESIGN (two small fixes outside my files, both documented)
1. **Rainbow drawn over the cloud floor instead of behind it.** DESIGN §7 puts the rainbow between the mid layer and the
   ground. But the cloud floor's visible top (`floorY`) sits 150 px (landscape) / 250–300 px (portrait/tall) above
   `groundY`, while the arch centre is at `groundY + 30` — so the arch's lower pieces were buried in the clouds and the freed
   things flew *into* the floor to paint them; in portrait almost the whole arch was hidden. Fix, kept minimal:
   - `render.js` draws the rainbow **after** the ground (`_game`, `_titleScene`, `_doneScene`) and adds `_rainbowMist`, a soft
     cloud gradient that melts the arch's feet into the floor (landscape: a band from `floorY` to the bottom edge; portrait:
     a soft cloud band around the feet). No piece is ever cut hard.
   - `world.js computeLayout` lifts the arch in portrait to just above Bao's head: `rcy = min(groundY+30, bao.box.y +
     cfg.rainbowPortraitLift)` with new config `rainbowPortraitLift: 24`. **Landscape is unchanged** (DESIGN §2 / MECHANICS
     §3 exact). `rainbowPoint`, the flight target and the freed-thing retarget all read `rainbow.cy`, so they follow
     automatically; the unit test's rainbow assertion in `tests/unit/run.js` was updated to the same portrait rule. All 39
     mechanics unit tests still pass.
2. **`rng.js` header title** still said "Bo's Farm Parade" (a stale copy header, not code) → "Bao's Bubble Sky". One line, no
   behaviour change.

## Test results (2026-11-13)
- `node tests/unit/run.js` — 39 passed.
- `node tests/unit/i18n_voice.test.js` — 56 703 passed.
- `node tests/unit/bubble_art.test.js` — 11 015 passed.
- `node tests/e2e/smoke.js` — PASS iphone-portrait + iphone-landscape (real tap → right + pop + paint; full bot sessions
  age 3/4 reach the done screen, 0 console errors).
- `node tests/e2e/functional.js` — 68 per-device checks (4 shapes) + 10 bot sessions (ages 3–7 × EN/VI) all PASS, 0 console
  errors. Screenshots in `tests/out/functional/`.

## Known issues / notes
- The Vietnamese voice depends on the OS voice (Linh); `ui.voiceMissing` is shown when `hasVoice('vi')` is false. The mic
  (speech recognition) is unavailable in Add-to-Home-Screen mode — tap answers always work. These are platform limits
  carried over from the sister games (VOICE §3), not bugs.
- `tests/sim/*` are the mechanics engineer's headless playtest sims; `hs_browser.js` drives the real page via `?bot=1` and
  works now that `main.js` is wired, but the sims are not part of the required run command.

## Fix round 1 (QA reports qa_functional / qa_visual / qa_playtest)
- **Voice (VOICE §1.1 rules 1, 2, 4):** a right pop no longer lowers the prompt guard (feedback queues until the question was
  heard once); countPop counts and the countSel run go through `speakCount` with their own `countUntil` guard (priority, never
  interrupting, never lowered by a repeated question); Bao and speech-bubble taps use `askAgain()` — while a protected / count
  line plays they queue the question ONCE (`promptQueued`), never cut it (QA-F P2-2, P3-1). `ask.first` is passed straight
  through (count chapter's first countSel round). Praise at `rainbowDone` also after the chapter's 2nd round (playtest P2-5).
  Resume during the chapter intro re-says the chapter line (P3-3).
- **Held finger never clicks a new screen (QA-F P2-1):** `PB.UI.guardScreenClicks()` records each `.screen`'s open time and the
  last pointerdown; a click on a screen control is swallowed when its press began before that screen opened or outside it
  (keyboard clicks, `detail 0`, pass).
- **Audio:** partials ≥ 0.45 × sampleRate are skipped / slide targets clamped (P3-2). **Adaptive quality** steps back up after
  10 s of fast frames (P3-4). **`cleanName`** now removes tag content as documented (P3-5).
- **Render:** freed things drawn at `fs × thingSize` (count ×2.2, badge ×1.4); things in bubbles at 1.55·r (stars) / 1.45·r
  (tiles) / 1.2·r; the counting numeral sits above the enlarged star group; `field.archBehind` → arch alpha × 0.6; title
  arch alpha 0.55 on landscape phones; celebration: 2 of 3 bars, every 0.14 s, cap 26, life 2.4–4.5 s, some bubbles rise from
  the bottom (portrait: half, across the width), and the done-scene arch shrinks to stay under the `#scrDone` panel (main
  measures it into `render.donePanel`).
- **CSS:** `#logo2` nowrap (+ .8em for VI portrait), `text-wrap: balance` on `#bubbleText` / `#doneTitle`, Talk time 200 px
  picture column + centred question on landscape phones, a centred big Talk panel on iPad portrait.
- **world.js CONFIG:** `bubbleMaxW 560 → 700` (the only value changed there; all 40 unit tests pass). My earlier
  `rainbowPortraitLift` is superseded by the mechanics engineer's rewrite (now −6).
- **Tests:** stale `tests/visual/screens.js` deleted (the QA team's `tests/qa/visual_*.js` replace it); `swipe_right` runs the
  world at 0.2× during the swipe (load-proof); `bao_repeat` waits the 3 s rule before the bubble tap; surprise tests poll for a
  free tappable point. QA repros `held_into_talk` (also HOLD_MS=100), `held_release_menu`, `poke_during_count` (VIA=bao and
  bubble) now PASS.
- Results: unit 40 · i18n_voice 57 605 · bubble_art 11 021 · smoke PASS · functional iPhone portrait 24/24, iPhone landscape
  11/11, iPad portrait 24/24, iPad landscape 11/11, bots 10/10 — 0 console errors.
