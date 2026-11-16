# Moka's Fairy Tea Party · Tiệc Trà Trong Rừng Của Gấu Moka

A gentle odd-one-out learning game for children aged 3–7 (default 4). Moka, a little honey-brown bear cub in a cream
scarf, hosts a fairy tea party in a forest clearing. Tea things float down from the sky on dandelion fluff and land on leaf
placemats on a mossy log table — a red cup, a red teapot, a red jar… and one blue bowl. "They're all red… but one! Which one
is NOT red?" The child taps the different one — a tiny fairy swoops down from the garland, circles it with sparkly dust and
it floats up into the garland and **lights a flower lantern**. The others ring a chime wave, Moka raises his cup —
"Cheers!" — and a puff of fairy dust clears the table. A sunny morning, a breezy day, rain (Moka holds a mushroom umbrella)
and a rainbow.

Made on 2026-11-16 with `/build-education-game` (see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/bear-fairy-tea/game/

## Ages and topics (4 chapters per session, one weather each)
| age | chapters |
|---|---|
| 3 | colours · cookie shapes · big & little · forest friends ("Which one is not a bunny?") |
| 4 (default) | colours · cookie shapes · counting berries on plates · forest friends ("Who doesn't live in the forest?") |
| 5 | cookie shapes · counting berries · letter cards · forest friends |
| 6 | small letters · first letter of a word · adding · counting |
| 7+ | first letter · adding · taking away · odd & even |

## How to play
- Listen to Moka (or read the speech bubble) and **tap the one that is different**.
- Right → the fairy lifts it into a lantern and Moka says why ("The blue bowl! It's not red." · "The penguin lives on the
  ice!"); berry plates are counted aloud while each berry lights up.
- A matching thing just **wiggles "no-no"**; Moka kindly says it is like its friends and asks again. A tap on empty space
  makes a little sparkle. Tap Moka (or the bubble) to hear the question again.
- After two misses the right one glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- After 4 lanterns: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises (one round per chapter, never a mistake): a **ladybug** walks along the table (tap → it flies off), a
  **butterfly** lands on a friend, a **snail** peeks out from under the table leg, little **fairies** dance around the
  lanterns. At the end every lantern of the session floats through the forest.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume (even with the side switch on silent); adjust it in the
   settings or with − / + in the pause menu.
3. Works in portrait and landscape and respects the notch / safe areas.
4. Optional: **Share → Add to Home Screen** for a full-screen icon with no browser bars.

### Vietnamese voice
Moka speaks English or Vietnamese (toggle on the title, or in the parent settings). On iPhone / iPad the Vietnamese voice is
**Linh**; if you hear no Vietnamese, turn it on in **Settings › Accessibility › Spoken Content › Voices › Vietnamese**. The
"answer by talking" mic needs Siri & Dictation on and a network, and is unavailable in Add-to-Home-Screen mode — tapping the
picture always works.

## Parent settings (hold the ⚙ gear for 2 seconds)
Age 3–7+, language English / Tiếng Việt, the child's name (Moka uses it in praise), volume, sound effects, music, Moka's
voice, answer by talking. Everything is saved on the device (`localStorage`, prefix `ft:`); nothing leaves it, and the game
needs no network after it loads.

## Developer notes
- Pure HTML5 canvas + plain JavaScript on `window.FT`, classic `<script>` files, no build step. Original SVG / canvas art
  and synthesized WebAudio sound only.
- The module contract is `docs/DESIGN.md`; tuned numbers, events and the render contract are in `docs/MECHANICS.md`; the
  voice / language / input contract is `docs/VOICE.md`; integration decisions in `docs/reports/integration.md`.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/tea_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`
  (the e2e suites need Chromium + Playwright, both preinstalled; screenshots land in `tests/out/`). `tests/sim/` holds the
  headless playtest simulations. URL test flags: `?speed=8&bot=1&autostart=1&mute=1&age=5&lang=vi&seed=3&level=2&debug=1`.
- App icons: `node tools/render_icons.js` renders `game/assets/default/icon.svg` to `game/assets/icons/*.png`.
