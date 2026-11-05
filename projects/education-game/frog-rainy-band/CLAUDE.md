# Bop's Rainy Band · Ban Nhạc Mưa Của Ếch Bốp (education game, 2026-11-05)

## Goal
Tap-to-play band game for ages 3–7 (default 4) with Bop the little frog in a rainy-day garden, spring → summer →
autumn → winter, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *music* (rolled with the variety rule:
not build/seek/pop/trace/path; container rationed). Swap: the rolled giraffe helper → a frog (giraffe was yesterday).

## Stack
- HTML5 canvas + plain JS on `window.RB` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../giraffe-jungle-tower/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace → `RB`, storage prefix `rb:`. New: the band world (`world.js`: members on stools that play when
  tapped, song sheet + flying notes, Bop's big drum for counting (drum N times / listen and pick), song playback, snail
  and shower surprises), band `content.js`, `band_art.js` (drums, stools, notes, number card drawn by code), season
  `weather.js` (rain, petals, sun shower + rainbow, leaves, snow).
- Art: original SVG from generators in `tools/`; icons via `tools/render_icons.js`; contact sheets in `docs/art/`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real CDP touch), `tests/sim` (headless
  playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`RB.CONFIG`).
- Kid-friendly and original only; no fail states; every ask has exactly one matching member.
- Every text key in both `en` and `vi`; the helper is "Bop" (EN) / "Bốp" (VI).
- URL test flags never saved; storage prefix `rb:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken.
- Music is ducked under speech and during the song playback (`RB.Audio.setSong`).
