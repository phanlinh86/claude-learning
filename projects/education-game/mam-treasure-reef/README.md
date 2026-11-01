# Mầm's Treasure Reef · Mầm Tìm Kho Báu

A learning game made for Mầm (and any child aged 3–7). Tutu, a sandy baby sea turtle, has found a reef full of buried
treasure. Tutu says — out loud, in English or Vietnamese — what to find: "Dig up the red shell!", "Put 3 pearls in the
chest!", "Find the crab!" The child **taps the sand mound** with the right treasure poking out (*poof!* — it pops out and
flies into the chest) or **drags treasures** into the matching chests. The two mechanics alternate chapter by chapter so
a quick, easily-bored child always has something new.

The reef is a **map of 6 lagoons** (Shell Beach → Coral Garden → Pearl Cave → Friends Bay → Sunken Ship → Rainbow Reef).
Each lagoon is 4 short chapters (morning, noon, sunset, starry night) of 4 rounds plus a Talk-time question — about 5–7
minutes — and finishing one opens the next and adds a trophy to the **Treasure Room**. All six together are 30–40 minutes.
Progress, stars and pearls are saved per **profile** (up to 4 children), and a lagoon left half-way resumes where it stopped.

No timers, no losing: wrong taps make the treasure peek out and Tutu names it kindly, the right mound glows after two
tries, and stars only go up. Funny sounds (boing, kazoo, slide whistle), a photobombing fish, a giggling crab under one
mound and Tutu's chapter-end dance keep it silly.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/mam-treasure-reef/game/

## On iPhone / iPad
1. Open the link in Safari. Tap once anywhere — iOS only allows sound and speech after the first tap.
2. Optional: **Share → Add to Home Screen** for a full-screen icon (speech answers only work in Safari itself).
3. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh". The game uses that
   voice for the child's name even in English mode, so "Mầm" is said properly.
4. Loud enough? The game is mastered loud; use the **+ / −** buttons in the pause menu or the volume slider in settings.

## How to play
- **Dig chapters:** tap the mound whose treasure matches what Tutu asked. A wrong mound just shows what was inside.
- **Drag chapters:** drag a treasure onto a chest. Drop it a little high — the chest catches it.
- Tap a treasure: Tutu says its name. Tap Tutu or the speech bubble: she repeats the task.
- The sign on each chest shows what goes in (a picture, so children who can't read know too).

## For parents
Hold the ⚙ button on the title screen for 2 seconds: language, volume, sound / music / voice / microphone, and the
**players** list — add up to 4 children with a name, a "say the name as" spelling for English voices (e.g. "Mum" for Mầm),
an age (3, 4, 5, 6, 7+) and a sea-creature picture. Nothing leaves the device.

| Age | What the lagoons teach |
|---|---|
| 3 | colours, big & small, shapes, sea friends |
| 4 | colours, shapes, counting 1–5, sea friends |
| 5 | shapes with mixed colours, counting 1–10, capital letters, sea friends |
| 6 | capital ↔ small letters, first letter of a word, adding within 10, counting to 12 |
| 7+ | first letter, adding within 20, taking away within 10, odd & even |

Sea friends: crab, octopus, seahorse, clownfish, dolphin, jellyfish, starfish, whale, pufferfish.

## Develop
```bash
cd projects/education-game/mam-treasure-reef
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/unit/progress.test.js           # profiles / progress tests
node tests/e2e/smoke.js                    # bot plays lagoons on iPhone/iPad viewports
node tests/e2e/functional.js               # real touch, profiles, map, settings, rotation, talk time, …
node tests/visual/capture.js               # screenshots into tests/out/visual
node tests/sim/playtest.js --quick         # headless child-model playtests (see docs/reports/playtest_report.md)
node tests/e2e/screens.js                  # quick screen tour → tests/out/screens
```
URL switches for testing: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&lagoon=2&level=1&novoice=1&skill=0.6&profile=test`
(never saved; `profile=test` keeps progress in memory). `window.TR.debug` exposes the world, state, progress and controls.

## Layout
```
game/     index.html, css/, js/ (rng, i18n, content, world, weather, bot, storage, progress, assets, audio, voice, input, render, ui, main),
          assets/default/ (SVG art), assets/icons/ (PNG home-screen icons), manifest.webmanifest
docs/     DESIGN.md (contract), MECHANICS.md, VOICE.md, art/ (contact sheets), reports/ (QA + playtest)
tests/    unit/, e2e/, sim/, visual/
tools/    art generators, icon renderer, scene composer
```
