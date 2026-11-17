# Dottie's Reef Parade (daily game, 2026-11-17)

## Goal
A family-friendly, snake-style parade grower on a coral reef: Dottie the puffin swims around collecting sea stars that follow her as a wiggly parade, with a rare golden sea star worth 5. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
In progress (2026-11-17). Started as a copy of `spike-dino-jam` (same engine, mobile layer, Go wrapper and tests), reskinned for the reef; the boss and pillows were removed and the golden sea star added.
- Integration (render, UI, audio, tests) done; smoke, functional (`--quick`) and `test_extras.js` pass.
- Still to do: QA reports (functional, visual, playtest) in `docs/reports/`, play link in `DAILY_GAMES.md`.
- Not yet verified: real iPhone / iPad (touch is emulated in Chromium), and the exe on Windows.

## Stack
Same as the other games in `projects/daily-game/`:
- HTML5 canvas + plain JS on `window.RP` in `game/`.
- A Go + WebView2 wrapper in `app/` that builds `dist/DottiesReefParade.exe` (port 47625, saves in `%APPDATA%\DottiesReefParade`).
- Original hand-written SVG art in `game/assets/default/` (characters, stars, four season folders `biomes/spring|summer|autumn|winter`, particles).
- Sound synthesized with WebAudio (kalimba plucks, bubbles, airy pads). Every sea star plays the next note of the season's tune.
- Node unit tests + Playwright e2e and visual tests.

## Layout notes
- `docs/DESIGN.md` is the contract between modules. Internal names were kept from the scaffold: `w.hero` = Dottie, `w.notes` / `note` events = sea stars, `w.trail` = the parade, `biome` = season.
- World coordinates = logical canvas coordinates. The renderer computes the arena from the screen, the safe areas and the HUD band, and calls `World.setArena()` on every relayout.
- The static background (tiled sand, rotated reef strips, decor, depth tint and vignette) is pre-rendered once per season and size, then blitted pixel-exact. Light caustics are a small pre-rendered tileable pattern scrolled on top with `lighter` blending.
- `game/js/extras.js` and the iOS audio patch in `audio.js` come from `shared/daily-mobile/apply.py` (re-run it after big audio changes; it is idempotent).

## Rules
- Keep all code inside this folder.
- Kid-friendly content, and original art and sound only.
- Storage keys use the `prp:` prefix, because every game shares one GitHub Pages origin.
- `app/web/`, `build/` and `dist/` are build outputs and are gitignored.
