# Wisp's Rooftop Bounce (daily game, 2026-11-26)

## Goal
A family-friendly brick-breaker on city rooftops at night. Wisp the cloud sprite IS the paddle; the moon-pearl breaks glowing blocks; blocks drop gems to catch; the magnet power-up pulls gems to Wisp and makes the pearl stick so the child can aim and tap to let go. Wisp floats down through four depth zones: Cloud Deck, Skyscraper Spires, Rooftop Gardens, Lantern Lane. Requirement: `REQUIREMENT.md`. Made with `/build-game random`, forked from `../panda-fairy-bounce/`.

## Status
v1.0, built and tested on 2026-11-26.
- QA round (`docs/reports/`): functional 304/304 + probe found 2 P2 (Enter on game over started a game behind the Score Card; rotate card shown on portrait iPads) + 2 P3; visual 1 P1 (zone pill hid the top-left block) + 6 P2; playtest: kids 4–6 ran out of hearts on Easy (kid4 cleared the Cloud Deck only 38 %), magnet releases reset the anti-stall clock.
- Fixes applied: Easy Wisp 3.6 → 4.2 u and net saves 8 → 12, anti-stall 5 → 3 s, releases no longer reset the stall clock (and steer during a stall), fewer tough blocks in Spires/Lanes (kid4 clears zone 1 in 100 %); Score Card key guard; rotate card phones only; `debugClear(0)` clears the zone; storage `del()` rolls back; zone pill beside the score pill, bigger phone HUD, stuck hint away from the aim guide, popups refresh instead of stacking, faint empty hearts, darker grey buttons, sparkle/puff polish.
- After fixes: unit 41/41, smoke pass, functional 300/300, `test_extras.js` pass, exe builds (PE32+ GUI x86-64).
- Open: visual P3-5 (moon placement, needs art edit); probe soak only run at 20 s after fixes.
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
