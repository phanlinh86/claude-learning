# Tupi's Bakery Delivery · Voi Tupi Giao Bánh Ngọt

A gentle "drive it there" learning game for children aged 3–7 (default 4). Tupi, a round little baby elephant baker in a
white hat, bakes treats for a cookie town built on a big bakery table. *Ding!* — a red cupcake hops out of the oven into her
cart. "Take it to the RED house!" The child holds the cart and **drives it with a finger along the chocolate-biscuit road** —
at the fork, which way? — to the right gingerbread house. The cart can never leave the road; it leans in the curves, bounces
over sugar bumps and turns round when it changes direction. The door opens, a friend pops out, Tupi hands over the treat with
her trunk, the windows light up and the chimney puffs little hearts. When every order is delivered Tupi trumpets and sprays a
sprinkle fountain from her trunk. Blossoms in the bakery window in spring, sunbeams in summer, leaves blowing in in autumn,
snow outside in winter.

Made on 2026-11-27 with `/build-education-game random 4` (mechanic family *path*, "maze ride"; see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/elephant-bakery-delivery/game/

## Ages and topics (4 chapters per session, easiest first; one season each)
| age | chapters |
|---|---|
| 3 | colours · shapes · big & little · animals (take the cow to her friend) |
| 4 (default) | colours · shapes · counting 1–5 (the cookies are counted aloud as they hop into the cart → the house with that number) · animal homes (take the penguin home) |
| 5 | shapes with mixed colours · counting 1–8 · capital letters · animal homes |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | first letter · adding within 20 · taking away within 10 · odd & even |

## How to play
- Listen to Tupi (or read the speech bubble), **hold the cart and drive it along the road** to the house she asks for. For
  the youngest, a tap on a house (or on the road) drives there too; a tap on the cart makes Tupi toot and ask again.
- Right house → the friend says thank you, the house lights up; the cart drives back to the bakery for the next order.
- A wrong house just **shakes its head kindly**; Tupi names the house, repeats the goal and the cart backs up to the fork.
- After two misses the right road glows and a ghost hand drives along it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- After 4 rounds: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises (one round per chapter, never a mistake): a **mouse** peeks out of a flour sack, a **bird** sings on the window
  sill, in winter big **snowflakes** float down.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Works in portrait and landscape, respects the notch / safe areas. In the pause menu, **hold** Home for 1 s to leave.
4. Optional: **Share → Add to Home Screen** for a full-screen icon with no browser bars.

### Vietnamese voice
Tupi speaks English or Vietnamese (toggle on the title, or in the parent settings). On iPhone / iPad the Vietnamese voice is
**Linh**; if you hear no Vietnamese, turn it on in **Settings › Accessibility › Spoken Content › Voices › Vietnamese**. The
"answer by talking" mic needs Siri & Dictation on, and is unavailable in Add-to-Home-Screen mode — tapping always works.

## Parent settings (hold the ⚙ gear for 2 seconds)
Age 3–7+, language English / Tiếng Việt, the child's name, volume, sound effects, music, Tupi's voice, answer by talking.
Everything is saved on the device (`localStorage`, prefix `bd:`); nothing leaves it, and the game needs no network after it loads.

## Developer notes
- Pure HTML5 canvas + plain JavaScript on `window.BD`, classic `<script>` files, no build step. Original SVG / canvas art
  and synthesized WebAudio sound only. Shell (state machine, voice, input, storage, loud audio, UI) from `../hedgehog-river-hop/`.
- Contracts: `docs/DESIGN.md` (modules), `docs/MECHANICS.md` (the world's real API, CONFIG, events, render contract,
  playtest numbers), `docs/VOICE.md` (voice / language / input, event → line table). Art notes in `docs/reports/art_*.md`;
  QA and playtest reports in `docs/reports/`.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/house_art.test.js && node tests/e2e/smoke.js`;
  full: `node tests/e2e/functional.js` (4 device shapes, real CDP touch drags, 10 bot sessions). Visual QA screenshots:
  `node tests/e2e/screens.js`. Headless playtests: `node tests/sim/hs_playtest.js`, `tests/sim/hs_feel.js`, real page `tests/sim/hs_touch.js`.
- App icons: `node tools/render_icons.js`.
