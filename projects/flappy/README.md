# Family Flappy 🐦🍓🐢

A family-friendly, one-button flying game for Windows 11, inspired by Flappy Bird. There are no pipes.

- **Flap** with <kbd>Space</kbd>, <kbd>↑</kbd>, a mouse click or a tap. If you stop flapping, the bird lands on the ground and the round ends.
- **Every flap drops a treat** (a strawberry by default). The treat keeps some of the bird's forward speed, so drop it just *before* you reach a turtle.
- Score by landing a treat on a **turtle's shell**. Feeding turtles several times in a row gives a **combo bonus**.
- Every 10 points (you can change this) the **season changes**: Spring 🌸 → Summer ☀️ → Autumn 🍂 → Winter ❄️ → Spring… Each season has its own background, weather animation and music.
- **Change Pictures**: you can replace the bird, the treat, the turtle and each season's background with any picture from your computer, such as a pet or a family photo. Choose *Round* to turn a photo into a sticker. Pictures are saved on your PC.
- Settings: sound effects, music, difficulty (Easy for little kids, Normal, Hard), points per season, full screen (<kbd>F11</kbd>).
- Other keys: <kbd>Esc</kbd>/<kbd>P</kbd> pause, <kbd>M</kbd> mute.

## Play (Windows 11)
Double-click **`FamilyFlappy.exe`**. Nothing needs installing: it is one portable file.
It uses Microsoft Edge WebView2, which is built into Windows 11.

- Saved data (pictures, best scores, settings) is in `%APPDATA%\FamilyFlappy\data`. Delete that folder to start fresh.
- The first time you run a downloaded exe, Windows SmartScreen may say *"Windows protected your PC"*, because the file isn't code-signed. Click **More info → Run anyway**.

You can also play in any modern browser by opening `game/index.html`. In the browser, pictures are kept in browser storage instead.

## Build the exe
Requirements: Go 1.22+, Node 18+ with Playwright (to render the icon), Python 3 with Pillow.
```bash
cd projects/flappy
bash tools/build.sh          # → dist/FamilyFlappy.exe
```
The build cross-compiles from Linux, macOS or Windows (Git Bash) without cgo or a C compiler.

## Test
```bash
cd projects/flappy
node tests/unit/run.js                       # simulation / physics / weather / bot unit tests
(cd game && python3 -m http.server 8765) &   # serve the game
node tests/e2e/smoke.js                      # browser smoke test + screenshots in tests/out/
node tests/e2e/functional.js http://127.0.0.1:8765/index.html   # full functional test suite (menus, input, pictures, settings…)
node tests/e2e/playtest.js http://127.0.0.1:8765/index.html     # high-speed bot play-test report
```
URL switches for testing: `?speed=8` (time scale), `?bot=1` (autopilot), `?autostart=1`, `?autorestart=1`, `?seed=42`, `?mute=1`, `?debug=1` (hit boxes).
`window.FF.debug` exposes the world state to automation.

## Project layout
```
game/            the game (HTML5 canvas + plain JS, no build step)
  js/world.js    physics & rules simulation (headless, deterministic)
  js/weather.js  season particle systems
  js/bot.js      autopilot used for play-testing and the title-screen demo
  js/render.js   drawing: parallax seasons, sprites, effects, HUD
  js/audio.js    synthesized sound effects + seasonal music
  js/ui.js, main.js, assets.js, storage.js
  assets/default original SVG art
app/             Go WebView2 wrapper → FamilyFlappy.exe
tools/           build script, icon tools, art generators
tests/           unit + browser tests
docs/            DESIGN.md (module contracts), MECHANICS.md (physics tuning), art sheets, test reports
```
