# Mochi's Icing Bakery · Tiệm Bánh Quy Của Gấu Trúc Mochi

A learning game for children aged 3–7 (default 4). Mochi, a round little panda baker in a cream chef's hat, decorates
cookies at her kitchen counter. "Let's pipe a RED wave!" — the child taps the red icing bag, then **follows the glowing
dots on the big cookie with a finger**: glossy icing squeezes out of the bag right under the finger. Shapes ("Which cookie
is the TRIANGLE?" → pipe icing all around its edge), big & small, counting (find the numeral, trace it, then tap N
chocolate chips onto the cookie, counted aloud), animals ("Find the DOG cookie — woof!" → pipe an icing road to its kennel
and the dog walks home); letters, first letters, adding, taking away and odd / even for older children. Every finished
cookie sparkles, sprinkles rain, and it hops onto the cooling rack. Through the kitchen window the seasons turn: spring
blossoms, summer sun, autumn leaves, winter snow.

Made on 2026-11-19 with `/build-education-game random 4` (mechanic family *trace*: follow a path with a finger).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/panda-bakery-icing/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Mochi's voice, answering by talking. No losing, no timers. Tracing is never wrong: going off the dots only stops the
icing ("Follow the dots!"), lifting the finger keeps the progress, and after a while a ghost hand shows the way; a child
who keeps tapping instead of sliding gets "magic icing" (the path fills wherever the finger moves). A wrong icing bag or
cookie wobbles and Mochi names it kindly; after two misses the right one glows. Stars per cookie: 3 / 2 / 1 for 0 / 1 / 2+
wrong picks. Tap Mochi or the speech bubble to hear the question again. Nothing leaves the device. If nobody plays for
about 2 minutes the game pauses.

Four chapters per session (one per season, rotating between sessions), four cookies each, then one Talk-time question
(tap a picture or say the answer). Surprises: a little bird flutters past the window (tap: a sprinkle shower) or a mouse
peeks out of the flour sack (tap: a puff of flour). The session ends with every cookie the child decorated on the racks.

## Develop
```bash
cd projects/education-game/panda-bakery-icing
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: trace paths, content, world, weather, bot (33 tests)
node tests/unit/i18n_voice.test.js         # language + voice + input tests
node tests/unit/cookie_art.test.js         # cookie / icing / bag art
node tests/e2e/smoke.js                    # real touch tap + real finger drag along the dots, bot sessions ages 3/4/5/7
node tests/e2e/functional.js               # real touch on iPhone / iPad: boot, language, gate, persistence, pick, mistakes,
                                           #   trace, off-path, lift, chips, Talk, pause, visibility, HUD, rotation, audio, bots
node tests/visual/screens.js               # screenshots (4 devices × en / vi, dpr 1 JPEG) → docs/reports/visual/
node tests/sim/hs_playtest.js --n 100      # high-speed headless playtest (docs/MECHANICS.md §13)
node tools/render_icons.js                 # icon.svg → game/assets/icons/*.png
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.IB.debug` exposes the world, state and controls (`choiceScreen(id)`, `tracePoints()`, `chipScreen()`,
`cookieScreen()`, `mochiScreen()`, `answer()`, `setSpeed`, `setBot`, `gotoLevel`, `audio().gains()` …).

## Files
| path | what |
|---|---|
| `game/index.html`, `game/css/style.css`, `game/manifest.webmanifest` | the page, screens (title, settings, HUD, bubble, pause, Talk, done), PWA manifest |
| `game/js/rng.js trace.js content.js world.js weather.js bot.js` | mechanics: paths + tracking, rounds per topic, the headless world, seasons, autoplay |
| `game/js/i18n.js voice.js input.js` | EN / VI lines, speech + mic, the one-finger tap + trace input layer |
| `game/js/cookie_art.js` | tray, rack, cookies, icing bags, icing, guide dots, chips, sprinkles, Talk icons, ghost hand |
| `game/js/assets.js render.js ui.js audio.js storage.js main.js` | integration: SVG loading, the canvas renderer, DOM UI, synthesized sound, settings, the loop + event → voice |
| `game/assets/default/` | SVG art: Mochi frames, bird, sack, mouse, kitchen env per season, particles, icon |
| `tools/` | art generators (`art_mochi.py`, `art_env.js`), preview sheets (`env_scenes.js`, `cookie_sheet.js`), `render_icons.js` |
| `tests/unit`, `tests/e2e`, `tests/sim`, `tests/visual` | unit, Playwright touch tests, headless playtests, screenshots |

Design contract: `docs/DESIGN.md`; tuned numbers + events: `docs/MECHANICS.md`; voice table: `docs/VOICE.md`; art: `docs/art/`.
