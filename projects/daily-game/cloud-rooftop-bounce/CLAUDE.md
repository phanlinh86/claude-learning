# Wisp's Rooftop Bounce (daily game, 2026-11-26)

## Goal
A family-friendly brick-breaker on city rooftops at night. Wisp the cloud sprite IS the paddle; the moon-pearl breaks glowing blocks; blocks drop gems to catch; the magnet power-up pulls gems to Wisp and makes the pearl stick so the child can aim and tap to let go. Wisp floats down through four depth zones: Cloud Deck, Skyscraper Spires, Rooftop Gardens, Lantern Lane. Requirement: `REQUIREMENT.md`. Made with `/build-game random`, forked from `../panda-fairy-bounce/`.

## Status
v1.0, built and tested on 2026-11-26.
- Unit tests 38/38, smoke test passes, functional suite passes (`tests/e2e/functional.js`), mobile layer `test_extras.js` passes.
- **Not yet verified:** a real iPhone or iPad, the music by ear, and the exe on Windows.

## Stack
- HTML5 canvas and plain JavaScript on `window.WRB` in `game/`.
- `world.js` has no pixels and is deterministic: units are u, y points up, the roof line is y 0, Wisp's bounce line is y 1.35, the field is x 0…16 with the ceiling at 8.6, fixed 1/120 s steps (no tunnelling).
- `render.js` turns units into pixels: landscape `unit = min(VH/9.1, VW/16.4)`, field centred, roof line 0.4 u above the bottom; the art was drawn for 60 px per u. Wisp's art (240×100) is drawn from its bounce line (art y 14, x 6…234 = the paddle width). Each zone's sky, far skyline and near roof are pre-rendered once per size into device-pixel canvases and blitted 1:1 (the far layer slides with Wisp by whole device pixels); a zone change is the 2.3 s "descend" (old scene slides up, new one rises and fades in), and the next zone is pre-warmed in idle time.
- The Go + WebView2 wrapper in `app/` builds `dist/WispsRooftopBounce.exe`. It uses port 48713, falling back to 48723, 48733 and 48743. JS bridge: `wrStoreAll/wrStoreSet/wrStoreDel/wrFullscreen/wrQuit`.
- Original SVG art from `tools/art-*`; sound synthesized with WebAudio; `extras.js` (volume + Score Card) and the loud-audio patch come from `shared/daily-mobile/apply.py`.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly content: a calm, glowing city at night; gems, clouds and lanterns; nothing scary; original art and sound only.
- Rotations in the world are counter-clockwise positive, so draw with `rotate(-rot)`.
- Storage keys use the `wrb:` prefix, because all the games share one GitHub Pages origin.
- Test URL flags (`?mute=1`, `?diff=`) are never saved into settings; bot runs never save a best score.
- The browser tests use `chromium.launch()` with no options and serve `game/` over http (`tests/e2e/serve.js`).
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
