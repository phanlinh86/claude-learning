# Bao's Bubble Sky · Gấu Trúc Bảo Thổi Bong Bóng

A gentle bubble-popping learning game for children aged 3–7 (default 4). Bao, a little round baby panda in a cream bandana,
sits on a cloud with a bubble wand. He dips it, blows — and big shiny soap bubbles wobble out, each with something inside:
a red ball, a blue rubber duck, a star cookie, a little cow. "Pop the RED ones!" The child taps a bubble: *pop!* — droplets
sparkle, the thing inside zooms up and **paints a stripe of a rainbow** arching over the clouds. When the rainbow is done it
shimmers, stars fly to the score, and Bao goes **"whoosh!"** — the leftover bubbles sail away. The seasons turn in the
rainbow cloud land: blossoms in spring, sunshine in summer, leaves and wind in autumn, snow in winter.

Made on 2026-11-13 with `/build-education-game random 4` (mechanic family *pop*; see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/panda-bubble-sky/game/

## Ages and topics (4 chapters per session, easiest first; one season each)
| age | chapters |
|---|---|
| 3 | colours (2) · shapes (2) · big & little · animals (farm vs not, 2 homes) |
| 4 (default) | colours (3, "Pop the red ones!") · shapes (3) · counting 1–5 ("Pop 3 bubbles!" / "the bubble with 4 stars") · animal homes (farm / sea / ice-jungle-savanna) |
| 5 | shapes with mixed colours · counting 1–10 · capital letters · animal homes (4) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

## How to play
- Listen to Bao (or read the bubble) and **tap** the bubble(s) with the thing he asks for. A round can have more than one
  right bubble ("Pop all the red ones!") — a quick flick that starts just beside a bubble and slides onto it counts too.
- Right → *pop!* The thing flies up and paints the next piece of the rainbow; Bao names it ("A red ball!"). More to go →
  "One more!". Counting rounds count each pop aloud.
- A wrong bubble just **squishes like jelly and bounces away** (it never pops); Bao kindly names what it was and repeats
  the goal. A press on the empty sky puffs a few tiny bubbles. Tap Bao and he giggles and asks again.
- After two misses a right bubble glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- After 4 rounds: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises (one per chapter, never a mistake): a little **bird** flies by and perches on a bubble (tap → loop-the-loop +
  tweet), a **kite** drifts across (tap → it loops), in winter big **snowflakes** float down (tap → they twinkle into tiny
  bubbles). At the end Bao dances and blows a sky full of bubbles that pop into confetti.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Works in portrait and landscape, respects the notch / safe areas.
4. Optional: **Share → Add to Home Screen** for a full-screen icon with no browser bars.

### Vietnamese voice
Bao speaks English or Vietnamese (toggle on the title, or in the parent settings). On iPhone / iPad the Vietnamese voice is
**Linh**; if you hear no Vietnamese, turn it on in **Settings › Accessibility › Spoken Content › Voices › Vietnamese**. The
"answer by talking" mic needs Siri & Dictation on and a network, and is unavailable in Add-to-Home-Screen mode — tapping the
picture always works.

## Parent settings (hold the ⚙ gear for 2 seconds)
Age 3–7+, language English / Tiếng Việt, the child's name (Bao uses it in praise), volume, sound effects, music, Bao's
voice, answer by talking. Everything is saved on the device; nothing leaves it, and the game needs no network after it loads.

## Developer notes
- Pure HTML5 canvas + plain JavaScript on `window.PB`, classic `<script>` files, no build step. Original SVG / canvas art
  and synthesized WebAudio sound only.
- The module contract is `docs/DESIGN.md`; tuned numbers, events and the render contract are in `docs/MECHANICS.md`; the
  voice / language / input contract is `docs/VOICE.md`; integration decisions are in `docs/reports/integration.md`.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/bubble_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`
  (the e2e suites need Chromium + Playwright, both preinstalled). `tests/sim/` holds the headless playtest simulations.
