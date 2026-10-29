# Foxy's Reef Memory 🦊🐚🧁

Foxy the little diving fox explores a coral reef. Flip clam-shell cards to find matching sea friends. Every match pops a cupcake for Foxy and refills a little of her **air**. Clear the reef before her air runs out!

**Twist:** in each season the water pulls the cards a different way. After a match, the other cards gently slide into the gap, so keep your eye on them.

| Season | Pairs | Water gravity |
|---|---|---|
| 🌸 Spring Reef | 6 | cards float **up** |
| ☀️ Summer Shallows | 8 | calm water, cards stay put |
| 🍂 Autumn Kelp | 10 | a current pushes cards **sideways** |
| ❄️ Winter Deep | 12 | cards **sink down** |

After winter the reef starts again with less air.

## Controls
- **Mouse click / tap** a card, or **arrow keys** to move and **Space/Enter** to flip.
- <kbd>Esc</kbd>/<kbd>P</kbd> pause · <kbd>M</kbd> sound · <kbd>F11</kbd> full screen.
- **Settings:** sound, music, difficulty (Easy gives more air and slower slides), and a peek at the start (0–3 s).
- **Change Pictures:** swap Foxy, the cupcake, the card back or any season's background with your own pictures.

## Play
- **Windows 11:** double-click `FoxyReefMemory.exe`. It's portable, with nothing to install. Data is saved in `%APPDATA%\FoxyReefMemory\data`. SmartScreen may warn about an unsigned file: click **More info → Run anyway**.
- **Browser:** open `game/index.html`, or use GitHub Pages: `https://phanlinh86.github.io/claude-learning/projects/daily-game/foxy-reef-memory/game/`.

## Build & test
```bash
cd projects/daily-game/foxy-reef-memory
bash tools/build.sh                              # → dist/FoxyReefMemory.exe (Go 1.22+, Node+Playwright, Python+Pillow)
node tests/unit/run.js                           # simulation tests
(cd game && python3 -m http.server 8790) &
node tests/e2e/smoke.js http://127.0.0.1:8790/index.html
node tests/e2e/functional.js http://127.0.0.1:8790/index.html
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=42&mute=1&debug=1&level=N`; automation API is `window.RF.debug`.
