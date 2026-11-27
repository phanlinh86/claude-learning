# Tupi's Bakery Delivery · Voi Tupi Giao Bánh Ngọt (education game, 2026-11-27)

## Goal
"Maze ride" learning game (mechanic family *path*) for ages 3–7 (default 4): Tupi the baby elephant baker delivers treats
on a bakery-table cookie town; the child drags her cart along a branching icing road to the right gingerbread house.
Seasons spring → summer → autumn → winter through the bakery window, EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.BD` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../hedgehog-river-hop/` (namespace `NH → BD`, storage prefix `bd:`); the river world was replaced
  by a road-map delivery world.
- Modules by owner (DESIGN §5): mechanics `rng.js` / `content.js` / `world.js` (+ `BD.Roads` map generator) / `weather.js` /
  `bot.js`; voice & input `i18n.js` / `voice.js` / `input.js`; character artist A `characters/*`, `icon.svg`, `tupi_points.js`
  (`tools/art_tupi.py`); character artist B `house_art.js` (`BD.HouseArt`); environment artist `env/*`, `particles/*`,
  `table_art.js` (`BD.TableArt`: table, roads, wall + window, bakery); integrator `storage.js` / `assets.js` / `audio.js` /
  `render.js` / `ui.js` / `main.js` / `index.html` / `style.css` / `tests/e2e/*`.
- Script order: rng, i18n, content, tupi_points, world, weather, bot, storage, assets, audio, voice, input, house_art,
  table_art, render, ui, main.

## Rules
- `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the world's real API, `docs/VOICE.md` the
  event → line table main.js follows.
- No fail states; the cart never leaves the road; a wrong house shakes its head kindly and the cart backs up to the fork;
  taps on the cart honk (never a drive); every order matches exactly one house (content self-checks).
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange; no pink. Table, roads,
  Tupi, cart and bakery never use an answer colour.
- Every text key in both `en` and `vi` with identical `{params}`. URL test flags never saved. Loud audio chain + volume.
- Touches reach the world only through `BD.Input` (two numbers in logical px; HUD / bubble / menus never reach the canvas).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/house_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js`).
