# Dottie's Reef Parade (daily game, 2026-11-17)

## Goal
A family-friendly, snake-style parade grower on a coral reef: Dottie the puffin swims around collecting sea stars that follow her as a wiggly parade, with a rare golden sea star worth 5. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
QA done and fixes applied (2026-11-17). Started as a copy of `spike-dino-jam` (same engine, mobile layer, Go wrapper and tests), reskinned for the reef; the boss and pillows were removed and the golden sea star added.
- QA reports are in `docs/reports/` (functional, visual, playtest). Their fixes are applied and listed in `docs/DESIGN.md` under "QA fixes applied":
  - visual P2 1–4 and P3 6–13;
  - audio limiter (peak −0.4 → ≈ −5 dBFS, RMS ≈ −25);
  - kinder Easy preset;
  - Go wrapper cleanups.
- Skipped: the blurred Score Card backdrop. `extras.js` is overwritten by `shared/daily-mobile/apply.py`, so fix it in `shared/daily-mobile/extras.js`.
- Tests (all green):
  - unit 24/24
  - smoke PASS
  - functional 345/345
  - mobile 103/103
  - `test_extras.js` PASSED
  - Windows exe: `GOOS=windows go vet` and `go build` are clean.
- Play: https://phanlinh86.github.io/claude-learning/projects/daily-game/puffin-reef-parade/game/
- Not yet verified:
  - a real iPhone / iPad (touch is emulated in Chromium);
  - the exe on Windows;
  - the music and mix by ear (loudness was only measured).

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
