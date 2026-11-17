# Tibo's Dino Lake Fishing · Rùa Tibo Câu Cá Hồ Khủng Long

A gentle fishing learning game for children aged 3–7 (default 4). Tibo, a baby turtle in a little straw sun hat, sits on a
mossy rock at a sparkling lake in a friendly dinosaur valley (a lazy volcano, a waterfall, tree ferns, long-necks far away)
and holds a bamboo fishing rod. Friendly fish swim back and forth under the water — red, blue and yellow fish, fish with a
star or a heart on their side, fish with spots, and soap bubbles with animal friends inside. "Catch the RED fish!" The child
taps it — swish, the line flies in an arc, plop, the hook sinks, the fish nibbles, the rod bends and Tibo reels it up out of
the water, where it wiggles and swings on the line. Then Tibo lets it go: the fish leaps home with a big splash and **a water
lily blooms**. The other fish jump for joy. Morning → noon → sunset → a starry night (the fish glow softly).

Made on 2026-11-17 with `/build-education-game` (see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/turtle-dino-fishing/game/

## Ages and topics (4 chapters per session, one time of day each)
| age | chapters (catch the fish that …) |
|---|---|
| 3 | colours · shapes · big & little · animal friends by name |
| 4 (default) | colours · shapes · counting spots 1–5 · animal homes ("Who lives in the sea?") |
| 5 | shapes in mixed colours · counting 1–10 · capital letters · animal homes |
| 6 | small letters · first letter of a word · adding · counting to 12 |
| 7+ | first letter · adding within 20 · taking away · odd & even |

## How to play
- Listen to Tibo (or read the speech bubble) and **tap the fish he asks for** — the fish keep swimming, and they slow down
  near a finger, so little hands can catch them.
- Right → the line flies out and Tibo reels the fish in ("A red fish! Well done!" · "The crab! The crab lives in the
  sea."); spotted fish are counted aloud while each spot lights up. Then the fish leaps home and a lily blooms.
- Another fish just darts away with a few bubbles; Tibo kindly says what it was and asks again. A tap on the water makes a
  ripple. Tap Tibo (or the bubble) to hear the question again.
- After two misses the right fish slows down, glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- After 4 lilies: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises (one round per chapter, never a mistake): a baby **pterosaur** glides over and dips its feet, a baby
  **long-neck** wades in and sprays water, a **frog** hops onto a lily pad, **fireflies** dance at night.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume (even with the side switch on silent); adjust it in the
   settings or with − / + in the pause menu.
3. Works in portrait and landscape and respects the notch / safe areas.
4. Optional: **Share → Add to Home Screen** for a full-screen icon with no browser bars.

### Vietnamese voice
Tibo speaks English or Vietnamese (toggle on the title, or in the parent settings). On iPhone / iPad the Vietnamese voice is
**Linh**; if you hear no Vietnamese, turn it on in **Settings › Accessibility › Spoken Content › Voices › Vietnamese**. The
"answer by talking" mic needs Siri & Dictation on and a network, and is unavailable in Add-to-Home-Screen mode — tapping the
picture always works.

## Parent settings (hold the ⚙ gear for 2 seconds)
Age 3–7+, language English / Tiếng Việt, the child's name (Tibo uses it in praise), volume, sound effects, music, Tibo's
voice, answer by talking. Everything is saved on the device (`localStorage`, prefix `tl:`); nothing leaves it, and the game
needs no network after it loads.

## Developer notes
- Pure HTML5 canvas + plain JavaScript on `window.TL`, classic `<script>` files, no build step. Original SVG / canvas art
  and synthesized WebAudio sound only. The shell (voice, input, storage, audio chain, UI) started as a copy of
  `../bear-fairy-tea/`; the world, art, content and sounds are new.
- The module contract is `docs/DESIGN.md`; tuned numbers, events and the render contract are in `docs/MECHANICS.md`; the
  voice / language / input contract is `docs/VOICE.md`; QA reports in `docs/reports/`.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/fish_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`
  (the e2e suites need Chromium + Playwright, both preinstalled; screenshots land in `tests/out/`). `tests/sim/` holds the
  headless playtest simulations. URL test flags: `?speed=8&bot=1&autostart=1&mute=1&age=5&lang=vi&seed=3&level=2&debug=1`.
- Art generators: `python3 tools/art_tibo.py && node tools/tibo_sheet.js` (Tibo + critters + icon), `node tools/art_env.js &&
  node tools/env_scenes.js` (lake layers), `node tools/fish_sheet.js` (fish contact sheets). App icons: `node tools/render_icons.js`.
