# Bop's Rainy Band · Ban Nhạc Mưa Của Ếch Bốp

A learning game for children aged 3–7 (default 4). Bop, a little aqua frog in a straw hat, leads a band in a rainy
garden. The band sits on flower-pot stools on a wooden stage and a song sheet with empty note circles hangs above them.
Bop asks "Play the RED drum!" and the child taps it: *boom!* — the drum squashes and bounces and a coloured note flies
up into the song sheet. A wrong drum just goes "boing" and wobbles ("That's the blue drum. Let's find red!"). When the
sheet is full, the band plays the child's own song back note by note while Bop drums along. Counting rounds use Bop's
big drum ("Drum three times!", or "Listen! How many booms?"); animal rounds put a duck, a cat, a cow… in the band
("Who says moo?"). The garden goes from spring rain with blossoms to a summer sun shower with a rainbow, autumn
drizzle with falling leaves and a snowy winter.

Made on 2026-11-05 with `/build-education-game random 4`. Mechanic family *music*: tap to play an instrument and tap a
rhythm on the big drum. No dragging, no hiding places, no rocket, no cards, no popping, no basket.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/frog-rainy-band/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Bop's voice, answering by talking. No losing, no timers. After two misses the right drum glows and a ghost hand taps
it. Nothing leaves the device. If nobody plays for about 1.5 minutes the game pauses itself.

Topics (four per session, one per season, rotating): colours (each colour is its own note), shapes, counting (drum N
times, then listen and pick the number), garden animals and their sounds, big & small drums (age 3); capital letters
(5); small letters, first letters, adding (6); taking away, odd & even (7+).

## Develop
```bash
cd projects/education-game/frog-rainy-band
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch tap + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js               # real touch, gate, settings, volume, taps, rotation, talk time
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.RB.debug` exposes the world, state and controls.

Reports from the test team are in `docs/reports/`.
