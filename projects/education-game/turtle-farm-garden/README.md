# Tumi's Flower Farm · Nông Trại Hoa Của Rùa Tumi

A learning game for children aged 3–7 (default 4). Tumi, a little baby turtle in a straw sun hat, grows a flower garden
on a sunny farm. "Let's plant a RED wavy row!" — the child taps the red seed packet, then **follows the glowing dots across
the garden bed with a finger**: Tumi's watering can rides under the finger and sprouts pop up right behind it and open into
red flowers. Shapes ("Which sign is the TRIANGLE?" → plant flowers all around the triangle bed), big & small, counting
(find the sign with the numeral, trace it, then tap the soil to pull up N carrots, counted aloud), animals ("Find the COW —
moo!" → trace a pebble path to the barn and the cow walks home); letters, first letters, adding, taking away and odd / even
for older children. Every finished bed blooms in a wave, little butterflies flutter up and a prize rosette hops onto the
farm fence. The seasons turn: spring blossoms, summer sun, autumn leaves on the wind, winter snow.

Made on 2026-11-25 with `/build-education-game random 4` (mechanic family *trace*: follow a path with a finger).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/turtle-farm-garden/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Tumi's voice, answering by talking. No losing, no timers. Tracing is never wrong: going off the dots only stops the water
("Follow the dots!"), lifting the finger keeps the progress, after a while a ghost hand shows the way, and a child who keeps
tapping gets "magic water" (the row grows wherever the finger moves). A wrong packet or sign wobbles and Tumi names it
kindly; after two misses the right one glows. Stars per bed: 3 / 2 / 1 for 0 / 1 / 2+ wrong picks. Tap Tumi or the speech
bubble to hear the question again. Nothing leaves the device.

Four chapters per session (one per season), four beds each, then one Talk-time question (tap a picture or say the
answer). Surprises: a big butterfly flutters across the sky (tap: a petal shower) or a chick peeks out of the hay bale
(tap: "cheep!" and a puff of straw). The session ends with every rosette the child won on the fence.

## Develop
```bash
cd projects/education-game/turtle-farm-garden
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: trace paths, content, world, weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + input tests
node tests/unit/farm_art.test.js           # garden bed / signs / packets / can / rows / carrots / rosettes art
node tests/e2e/smoke.js                    # real touch tap + real finger drag along the dots, bot sessions
node tests/e2e/functional.js               # real touch on iPhone / iPad: boot, language, gate, persistence, pick, trace, …
node tests/visual/screens.js               # screenshots (ONLY=ip-p|ip-l|pad-p|pad-l, LANGS=en,vi) → docs/reports/visual/
node tests/sim/hs_playtest.js --n 100      # high-speed headless playtest
node tools/render_icons.js                 # icon.svg → game/assets/icons/*.png
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.FT.debug` exposes the world, state and controls.

## Files
| path | what |
|---|---|
| `game/index.html`, `game/css/style.css`, `game/manifest.webmanifest` | the page, screens, PWA manifest |
| `game/js/rng.js trace.js content.js world.js weather.js bot.js` | mechanics: paths + tracking, rounds per topic, the headless world, seasons + wind, autoplay |
| `game/js/i18n.js voice.js input.js` | EN / VI lines, speech + mic, the one-finger tap + trace input layer |
| `game/js/farm_art.js` | garden bed, fence, rosettes, signs, seed packets, watering can, planted rows, carrots, petals, Talk icons |
| `game/js/assets.js render.js ui.js audio.js storage.js main.js` | integration: SVG loading, the canvas renderer, DOM UI, synthesized sound, settings, the loop |
| `game/assets/default/` | SVG art: Tumi frames, butterfly, hay bale, chick, farm env per season, particles, icon |
| `tools/` | art generators (`art_tumi.py`, `art_env.js`), preview sheets (`env_scenes.js`, `farm_sheet.js`), `render_icons.js` |
| `tests/unit`, `tests/e2e`, `tests/sim`, `tests/visual` | unit, Playwright touch tests, headless playtests, screenshots |

Design contract: `docs/DESIGN.md`; tuned numbers: `docs/MECHANICS.md`; voice table: `docs/VOICE.md`; QA reports: `docs/reports/`.
