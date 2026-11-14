# Lulu's Jungle Tower · Hươu Lulu Xếp Tháp (education game, 2026-11-04)

## Goal
Tower-stacking learning game for ages 3–7 (default 4) with Lulu the baby giraffe in a jungle clearing, morning → noon →
sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *build* (rolled with the variety rule:
not seek/pop/trace/path/memory; container rationed).

## Stack
- HTML5 canvas + plain JS on `window.CK` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../fox-camp-hide-seek/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace → `CK`, storage prefix `ck:`. New: the tower world (`world.js`: tray pieces with spring-follow drag,
  tap-vs-drop, gravity fall with a magnet onto the tower top, wrong bounce-off, the stack as a damped inverted pendulum
  that never falls, bananas, monkey swing, count glow + bloom, clear, breeze/butterfly surprises), block `content.js`,
  `block_art.js` (wooden blocks drawn by code), time-of-day `weather.js`.
- Art: original SVG from generators in `tools/` (`art_lulu.py`, `art_animals.py`, `art_env.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real CDP touch), `tests/sim` (headless
  playtests, child models, voice model), `tests/visual` (`jt_*` capture/analyze).

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`CK.CONFIG`).
- Kid-friendly and original only; no fail states; every ask has exactly one matching block; the tower never falls.
- Every text key in both `en` and `vi`; the helper is "Lulu" in both languages.
- URL test flags never saved; storage prefix `ck:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken.
- Only a real grab resets the idle clock; a still drag (finger resting on a block) times out after 6 s.
