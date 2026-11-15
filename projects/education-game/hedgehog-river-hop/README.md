# Nim's River Hop · Nhím Nim Nhảy Đá Qua Suối

A gentle stepping-stone learning game for children aged 3–7 (default 4). Nim, a little round baby hedgehog in a mustard
scarf, wants to cross a woodland brook to reach the fruit on the far bank. Stepping stones rise out of the water, row by row,
each with something on it: a red flower, a blue mushroom, a star cookie, a little duck. "Hop on the RED ones!" The child taps
the right stone in the next row — *boing!* Nim leaps in a real arc, the stone dips, splash, ripples, and it turns golden.
On the far bank Nim curls into a spiky ball, rolls over an apple and it **sticks on his spines**. Blossoms in spring,
dragonflies in summer, leaves floating downstream in autumn, snow in winter.

Made on 2026-11-15 with `/build-education-game random 4` (mechanic family *path*; see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/hedgehog-river-hop/game/

## Ages and topics (4 chapters per session, easiest first; one season each)
| age | chapters |
|---|---|
| 3 | colours · shapes · big & little · animals |
| 4 (default) | colours · shapes · counting 1–5 (hop 1 → 2 → 3 in order, or "the stones with 4 dots") · animal homes |
| 5 | shapes with mixed colours · counting 1–10 · capital letters · animal homes |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | first letter · adding within 20 · taking away within 10 · odd & even |

## How to play
- Listen to Nim (or read the speech bubble) and **tap the stone in the next row** that has what he asks for. Only that row
  is active (a soft ring on the water); one right stone per row.
- Right → Nim hops on it, the thing twinkles away and the stone turns golden; Nim names it ("A red flower! Next one!").
  Counting rounds count aloud. After the last row he hops onto the far bank, rolls over the fruit and it sticks on his back.
- A wrong stone just **wobbles in the water**; Nim kindly names what it was and repeats the goal. A stone further ahead
  gets "One at a time!". A tap on the water makes a little ripple. Tap Nim and he giggles and asks again.
- After two misses the right stone glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- After 4 rounds: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises (one round per chapter, never a mistake): a **fish** leaps out of the brook (tap → it flips), a **frog** sits on
  a lily pad (tap → croak), in winter big **snowflakes** float down (tap → they twinkle). At the end Nim dances with his
  fruit by the golden stones.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Works in portrait and landscape, respects the notch / safe areas.
4. Optional: **Share → Add to Home Screen** for a full-screen icon with no browser bars.

### Vietnamese voice
Nim speaks English or Vietnamese (toggle on the title, or in the parent settings). On iPhone / iPad the Vietnamese voice is
**Linh**; if you hear no Vietnamese, turn it on in **Settings › Accessibility › Spoken Content › Voices › Vietnamese**. The
"answer by talking" mic needs Siri & Dictation on and a network, and is unavailable in Add-to-Home-Screen mode — tapping the
picture always works.

## Parent settings (hold the ⚙ gear for 2 seconds)
Age 3–7+, language English / Tiếng Việt, the child's name (Nim uses it in praise), volume, sound effects, music, Nim's
voice, answer by talking. Everything is saved on the device (`localStorage`, prefix `nh:`); nothing leaves it, and the game
needs no network after it loads.

## Developer notes
- Pure HTML5 canvas + plain JavaScript on `window.NH`, classic `<script>` files, no build step. Original SVG / canvas art
  and synthesized WebAudio sound only.
- The module contract is `docs/DESIGN.md`; tuned numbers, events and the render contract are in `docs/MECHANICS.md`; the
  voice / language / input contract is `docs/VOICE.md`; art notes in `docs/reports/art_*.md`; integration decisions in
  `docs/reports/integration.md`.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/stone_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`
  (the e2e suites need Chromium + Playwright, both preinstalled). Screenshots for visual QA: `node tests/e2e/screens.js`
  (→ `tests/out/screens/`). `tests/sim/` holds the headless playtest simulations.
- App icons: `node tools/render_icons.js` renders `game/assets/default/icon.svg` to `game/assets/icons/*.png`.
