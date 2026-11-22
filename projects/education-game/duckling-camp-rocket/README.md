# Mimi's Splash Rocket · Tên Lửa Nước Của Vịt Mimi

A gentle rocket-launch learning game for children aged 3–7 (default 4). Mimi, a fluffy cream duckling in a khaki bucket
hat, is camping in the mountains with her water-bottle rocket. Round picnic mats unroll on the meadow, each with something
on it: a red enamel mug, a blue lantern, a sign with 4 pinecones, a little cow. "Land on the RED one!" The child taps the
right mat — the launcher swings round, a dotted arc shows the way — then **pumps**: tap, tap, tap ("One! Two! Three! Blast
off!"). WHOOSH: the bottle shoots up on a spray of water, the parachute pops at the top and it sways down onto the mat
(the wind pushes it about on breezy days). The thing on the mat hops up and flies to the camp flagpole as a **pennant**,
collected in order. After the last launch the pennants are counted, Mimi dances and the rocket shoots a fountain with a
little rainbow in the spray. Sunny → breezy → rain → rainbow.

Made on 2026-11-22 with `/build-education-game random 4` (mechanic family *path*; see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/duckling-camp-rocket/game/

## Ages and topics (4 chapters per session, easiest first; one weather each)
| age | chapters |
|---|---|
| 3 | colours · shapes · big & small · animals |
| 4 (default) | colours · shapes · counting 1–5 (land on 1, then 2, then 3 — or "the sign with 4 pinecones") · animal homes |
| 5 | shapes with mixed colours · counting 1–10 · capital letters · animal homes |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

## How to play
- Listen to Mimi (or read the speech bubble) and **tap the picnic mat** with what she asks for. One right mat per launch;
  a round has 2–4 launches.
- Right → the launcher aims and Mimi hops onto the foot pump. **Tap anywhere 3 times to pump** (two fingers drumming work
  too); if nobody pumps, Mimi helps after 3 seconds. The rocket flies and lands on the mat; its thing becomes a pennant.
- A wrong mat just **ripples**; Mimi kindly names what it was and repeats the goal. A tap on the grass is a little tick.
  Tap Mimi and she giggles ("Quack!") and asks again.
- After two misses the right mat glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- After 4 rounds: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises (one round per chapter, never a mistake): a **marmot** pops out of a burrow, a **mountain goat** hops onto a far
  rock, and in the rainbow chapter a **little bird** perches on the flagpole. At the end Mimi dances under a garland of every
  pennant she won.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Works in portrait and landscape, respects the notch / safe areas.
4. Optional: **Share → Add to Home Screen** for a full-screen icon with no browser bars.

### Vietnamese voice
Mimi speaks English or Vietnamese (toggle on the title, or in the parent settings). On iPhone / iPad the Vietnamese voice is
**Linh**; if you hear no Vietnamese, turn it on in **Settings › Accessibility › Spoken Content › Voices › Vietnamese**. The
"answer by talking" mic needs Siri & Dictation on and a network, and is unavailable in Add-to-Home-Screen mode — tapping the
picture always works.

## Parent settings (hold the ⚙ gear for 2 seconds)
Age 3–7+, language English / Tiếng Việt, the child's name (Mimi uses it in praise), volume, sound effects, music, Mimi's
voice, answer by talking. Everything is saved on the device (`localStorage`, prefix `dk:`); nothing leaves it, and the game
needs no network after it loads.

## Developer notes
- Pure HTML5 canvas + plain JavaScript on `window.DK`, classic `<script>` files, no build step. Original SVG / canvas art
  and synthesized WebAudio sound only.
- The module contract is `docs/DESIGN.md`; tuned numbers, events and the render contract are in `docs/MECHANICS.md`; the
  voice / language / input contract is `docs/VOICE.md`; art notes in `docs/reports/art_*.md`; integration decisions in
  `docs/reports/integration.md`.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/mat_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`
  (the e2e suites need Chromium + Playwright). Screenshots for visual QA: `node tests/e2e/screens.js` (→ `tests/out/screens/`,
  every key moment × 4 moods × 4 device shapes with notch insets). `tests/sim/` holds the headless playtest simulations.
- App icons: `node tools/render_icons.js` renders `game/assets/default/icon.svg` to `game/assets/icons/*.png`.
