# Foxy's Reef Memory (daily game 2026-10-29)

## Goal
Family-friendly memory-match card game on a coral reef. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.1 adds the mobile layer for iPhone and iPad (2026-11-14). It uses the same approach as `puff-volcano-catch` and `kitten-gem-factory`.
- **Tests:** unit 33/33, functional 239/239 (the 4 Settings-fit failures caused by the extras Volume row are fixed), mobile 230/230 (`tests/e2e/mobile.js`), smoke clean, and `shared/daily-mobile/test_extras.js` passes.
- **Not yet verified:** a real iPhone or iPad. Touch was emulated in Chromium with real CDP touch events, and the safe areas were simulated.

## Mobile layout (render.js `resize` / `layoutHud`)
- **Canvas:** it fills the screen (`100dvh`). The 960×540 stage is fitted with "contain" and centred (portrait: 62 % of the spare height above). `OX`/`OY` are the band sizes. `toLogical()` and `stageRect()` map between client px and stage coordinates.
- **Bands:** they are filled with the reef itself, never black. The water and rays use mirrored tiles, the kelp and seabed are tiled, and particles near an edge are repeated in the side bands. Above the surface there is a per-season sky with waves on the waterline, and below the stage there is deeper sand. These band layers are cached per season and size, and they cross-fade with the season.
- **HUD and safe areas:** safe-area insets are read from `#safeProbe`. The ⏸/🔊 buttons go in the screen corner inside the safe area, at least 44 px. The air meter slides left or down to clear them. When the sky is tall, the canvas HUD moves up into it, just above the waves, and grows up to 1.3× on small screens.
- **Backing store:** at most 1920×1080 px on desktop and 3.2 MP on touch devices. Adaptive quality now runs before `draw()`, because a resize clears the canvas.
- **Input:** a card flips on pointerdown, from a mouse or any finger. UI buttons use `UI.tap()`, so they also answer a touch pointerup (a second finger), and a ghost-click guard swallows the delayed click.
- **Kid-proofing:** pinch, double-tap zoom and rubber-band scrolling are blocked, except in `.panel`. `visibilitychange` pauses the game and suspends the AudioContext.
- **Rotate prompt:** `#rotate` appears on phones held upright (short side < 600 px) while playing, and the game waits behind it. It has a "Play upright anyway" button.
- **Home-screen app:** `manifest.webmanifest`, `assets/icons/*` (from `tools/render_mobile_icons.js`), plus `viewport-fit=cover` and the apple-mobile-web-app metas.
- `js/extras.js` (Volume, Score Card) and the audio chain in `audio.js` (`setVolume`, `_iosKick`, `user` gain) are shared across the daily games; don't change them here.

## Stack
Same as `projects/daily-game/flappy`: HTML5 canvas + plain JS on `window.RF` in `game/`, Go + WebView2 wrapper in `app/` → `dist/FoxyReefMemory.exe`, original SVG art (generators in `tools/art-*`), WebAudio-synthesized sound, node unit tests + Playwright e2e tests.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules.
- Kid-friendly, original art and sound only.
- `app/web/`, `build/`, `dist/` are build outputs (gitignored).
