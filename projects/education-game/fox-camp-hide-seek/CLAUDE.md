# Pip's Camp Hide & Seek · Cáo Pip Chơi Trốn Tìm (education game, 2026-11-03)

## Goal
Hide-and-seek learning game for ages 3–7 (default 4) with Pip the baby fox at a mountain campsite, spring → summer →
autumn → winter, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *seek* (rolled with the variety rule: not
pop/memory/trace/path; container rationed).

## Stack
- HTML5 canvas + plain JS on `window.FC` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../elephant-rainbow-rocket/` (state machine, voice, input, storage, loud audio with volume, ui,
  main, tests), namespace → `FC`, storage prefix `fc:`. New: the hide-and-seek world (`world.js`: places in 1–3 depth
  rows, friends that gather, run and hide while Pip counts, peek/boo/duck, jump-and-hop to the campfire bench, party,
  swap/critter surprises, tap lock), hide-and-seek `content.js` (clues: hat, flag, sign, badge, ears, size),
  `camp_art.js` (clues, flames, glow, butterflies by code), seasons `weather.js`.
- Art: original SVG from generators in `tools/` (`art_pip.py`, `art_spots.py`, `art_animals.py`, `art_env.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless
  playtests and child models), `tests/visual` (`fc_*` capture/analyze).

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`FC.CONFIG`).
- Kid-friendly and original only; no fail states; every ask has exactly one matching hidden friend.
- Every text key in both `en` and `vi`; the helper is "Pip" in both languages.
- URL test flags never saved; storage prefix `fc:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: praise / wrong lines never interrupt Pip's instruction (`speakPrompt` in main.js).
- Friends are drawn behind their place and clipped at `place.peekY`; `spots/spots.json` peekY values are the lowest
  leak-free lines (check with `tools/art_spots_sheet.js` before lowering them).
- Only a real peek resets the idle clock (taps on Pip, grass or empty places don't); the 3rd such tap glows the answer.
