# Nini's Sea Painting · Rùa Nini Tô Màu Đại Dương

A learning game for children aged 3–7 (default 4). Nini, a baby sea turtle in a cream painter's beret, paints pictures
on a big shell-framed canvas on the seabed. Each round a new line drawing floats in — a fish, a crab, a sailboat, a
submarine with funny-shaped windows, a whale blowing bubbles. Nini asks "Paint the tail BLUE!": the child taps the blue
paint shell (the brush flies over and dips), then taps the shining tail — the colour splashes and spreads inside the
lines. Shapes ("Paint the TRIANGLE!"), counting ("Paint 3 bubbles!", counted aloud), big & small and sea animals
("Paint the CRAB!"); letters, adding, taking away and odd/even for older children. When the picture is done, Nini
sweeps colour over the rest and the picture **comes alive** — the fish swims off the canvas, the crab scuttles away,
the boat sails. Above the water the seasons turn: spring petals, summer sun rays, autumn leaves, winter ice and snow.

Made on 2026-11-07 with `/build-education-game random 4` (mechanic family *trace*: tap-to-paint a line drawing).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/turtle-sea-paint/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Nini's voice, answering by talking. No losing, no timers. Tapping the picture before picking a paint, or another part,
is never a mistake (Nini just says what to do). After two taps without progress the right shell or part glows and a
ghost hand shows the way; a child who keeps tapping around gets the brush guided for them. Tap Nini or the speech
bubble to hear the question again. Nothing leaves the device. If nobody plays for about 2 minutes the game pauses.

Four chapters per session (one per season, rotating between sessions), four pictures each, then one Talk-time question
(tap or say the answer). Surprises: a little lilac fish swims by, or a clam on the sand hides a pearl (tap them!).
The session ends with a gallery of every picture the child painted.

## Develop
```bash
cd projects/education-game/turtle-sea-paint
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests (world, content, weather, bot)
node tests/unit/i18n_voice.test.js         # language + voice + input tests
node tests/unit/pictures.test.js           # line drawings + paint art
node tests/e2e/smoke.js                    # real touch taps (shell → part) + bot sessions per age, iPhone/iPad
node tests/e2e/functional.js               # real touch: boot, paint, mistakes, drag, count, talk, pause, HUD, rotate, audio, gate, surprise
node tests/visual/screens.js               # screenshots → docs/reports/integration/
node tests/sim/hs_playtest.js --n 100      # high-speed headless playtest
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.DD.debug` exposes the world, state and controls (`partScreen(id)`, `shellScreen(color)`, `answer()` …).

Design contract: `docs/DESIGN.md`; tuned numbers: `docs/MECHANICS.md`; voice: `docs/VOICE.md`; art sheets: `docs/art/`.
