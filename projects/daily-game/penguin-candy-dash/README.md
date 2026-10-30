# Pip's Candy Dash 🐧🍬

Pip the little penguin waddles through Candy Land scooping up **candy gems** while gentle, grumpy **jelly bears** waddle after him.

**Twist:** every gem makes Pip rounder: worth more points (up to ×5) but easier to bump. At full size, press **Pop!** to shrink back in a sparkle burst that stuns nearby bears.

Fill the gem jar to open the candy-cane gate to the next biome:
1. 🍬 Gumdrop Meadow
2. 🍫 Chocolate River (sticky: cross on the wafer bridges)
3. ☁️ Cotton Candy Clouds (bouncy puffs)
4. 🍦 Ice-Cream Glacier (slippery ice)

After the glacier the loop starts again with more bears.

## Controls
- **Move:** arrow keys / WASD, or hold the mouse or a finger where Pip should go.
- **Action:** <kbd>Space</kbd> belly-slides (dash). At max size it does **Pop!** instead. Right-click, a second finger or the ★ button on touch screens work too.
- <kbd>Esc</kbd>/<kbd>P</kbd> pause · <kbd>M</kbd> sound · <kbd>F11</kbd> full screen.
- **Settings:** sound, music, and difficulty. Easy has 5 hearts, slower bears and smaller jars.
- **Change Pictures:** swap Pip, the gem, the bear or any biome's ground for your own pictures.

## Play
- **Windows 11:** double-click `PipsCandyDash.exe`. It's portable, with nothing to install. Data is saved in `%APPDATA%\PipsCandyDash\data`.
- **Browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/penguin-candy-dash/game/ (once merged to `main`), or open `game/index.html`.

## Build & test
```bash
cd projects/daily-game/penguin-candy-dash
bash tools/build.sh                         # → dist/PipsCandyDash.exe
node tests/unit/run.js                      # simulation tests
(cd game && python3 -m http.server 8800) &
node tests/e2e/smoke.js http://127.0.0.1:8800/index.html
node tests/e2e/functional.js http://127.0.0.1:8800/index.html
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=42&mute=1&debug=1&level=N`; the automation API is `window.CD.debug`.
