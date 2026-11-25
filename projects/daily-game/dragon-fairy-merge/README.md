# Mossy's Egg Grove

Game of the day for 2026-11-25, made with `/build-game random`. Mossy, a moss-green baby dragon, flaps above a twig nest in the fairy forest and drops magic eggs. Two eggs of the same kind that touch merge into a bigger, fancier egg, all the way up to the Golden Dragon Egg. Two golden eggs hatch a baby dragon friend! The forest wind gusts left and right, so watch the windsock and aim with the breeze.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/dragon-fairy-merge/game/ (iPhone, iPad, desktop browser; portrait or landscape). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Move and drop:** slide your finger (or move the mouse) to move Mossy, let go (or click) to drop the egg. A tap moves Mossy there and drops. The dotted guide shows where the egg will land, bent by the wind.
- **Merge:** two matching eggs that touch become the next kind: Dewdrop → Sky → Berry → Moon → Fern → Sunset → Starry → Golden Dragon. New kinds give 1, 3, 6, 10, 15, 21, 28, 36 points. Two Golden Dragon eggs hatch for +100.
- **Combo:** merges within 0.8 s of each other chain into a combo (+1 per step).
- **Wind:** the windsock flutters and an arrow shows the way 1.5 s before a gust. Gusts push eggs that are still falling (not the ones already resting). Each season is windier.
- **The vine line:** if eggs stay above the vine for 2.5 s the game ends. A fairy rescues you first (clears the top eggs): twice on Easy, once on Normal.
- **Seasons:** reach the score goal to move on: Blossom Glade → Mushroom Meadow → Lantern Woods → Frost Hollow, then winter loops with stronger wind. The eggs stay in the nest.
- **Keyboard:** `←` `→` move, `Space` / `↓` drop, `Esc` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Mossy, the eggs (each kind keeps its colour ring and size) or any of the four seasons. Pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/MossysEggGrove.exe` (Go, Node + Playwright, Python + Pillow; if the Go proxy is blocked use `GOPROXY=direct GOSUMDB=off`).
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (`--quick` for a shorter run)
- Mobile extras: `node shared/daily-mobile/test_extras.js projects/daily-game/dragon-fairy-merge` (from the repo root)
- Playtest simulations: `node tests/sim/playtest.js`
- Art generators: `node tools/art-characters/gen.js`, `node tools/art-environment/gen.js`

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`
These flags are never saved into the settings.

## Layout
- `game/` — the web game: plain JavaScript on `window.MEG`, no build step.
  - `world.js` — rules and physics (no drawing): circle eggs, merges, wind cycle, danger/rescue, seasons; `predictDrop()` shares the egg step physics.
  - `bot.js` — the autopilot; `weather.js` — season particles, wind streaks and bursts.
  - `render.js` — drawing; `main.js` — input and game modes; `ui.js` — menus; `audio.js` — WebAudio sounds and music; `extras.js` — volume slider + Score Card (shared daily-mobile layer).
- `app/` — the Go + WebView2 Windows wrapper (port 48613).
- `tools/` — build script, icon tools, art generators.
- `docs/` — `DESIGN.md` (contract), `MECHANICS.md`, QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
