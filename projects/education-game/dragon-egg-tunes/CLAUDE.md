# Rio's Singing Eggs · Trứng Biết Hát Của Rồng Rio (education game, 2026-11-26)

## Goal
Listen-and-repeat music learning game for ages 3–7 (default 4) with Rio the tiny mint dragon in a dinosaur valley, morning →
noon → sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *music* ("copy my tune"): each
round Rio first plays the tune (phase `demo`: sparks fly from his mouth to the eggs, each sings, he names it), then the child
taps the eggs in the same order; a wrong egg → kind words + Rio replays the rest; counting = copy Rio's N taps on the big
egg; then the eggs sing the tune together and the little volcano puffs a sparkle ring.

## Stack
- HTML5 canvas + plain JS on `window.SE` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../puppy-cloud-drums/` (`CD → SE`, `drum → egg`, `bibi → rio`; its contract is in `docs/drums_ref/`).
  Internal names kept from it: `cushion` = floating mossy island + straw ring, `garland`/`lanterns` = vine + seed pods,
  `cymbal` = the little volcano, `lamb` = baby triceratops, `card` = stone number tablet, `beat` = counting taps.
- New: the `demo` phase in `world.js` (sparks, demoStart / spark / demoNote / demoCount / demoEnd events, replay after a wrong
  or a Rio poke), tune lengths + note contours in `content.js`, `egg_art.js` (eggs of every kind, islands with front/back
  straw ring, pods with icons, volcano, tablet, spark), sung egg voices in `audio.js`.
- Art: original SVG from generators in `tools/` (`art_rio.py` → Rio frames, triceratops, bird, icon; `art_env.js` →
  dino-valley layers + particles; `env_scenes.js` = the env RECIPE mirrored in the tables at the top of `render.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/`.
- Render order: sky → stars → sun / moon → clouds → far → mid → ground → back particles → volcano → Rio → vine + pods →
  islands (back) → eggs → straw ring fronts → sparks → tablet → notes → surprises → hint hand → front particles → fx → banner.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`SE.CONFIG`),
  events and render contract, `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; taps during the demo, brushes, soft taps and volcano taps are never
  mistakes. Exactly one matching egg per ask (content self-checks). Beat steps can't be wrong. An assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Rio" (VI titles "Rồng Rio").
- Speech: the first demo line and "Your turn!" are protected prompts; demo note names queue (dropQueued before each);
  counts interrupt; the replay line is skipped right after a wrong line (it already ends with "Listen again!"); "First, red!"
  only at age 3; "…and blue!" cues up to age 5.
- URL test flags never saved (`?nodemo=1` skips demos); storage prefix `se:`. Loud audio chain + volume setting; all sound
  synthesized.
- Touches reach the world only through `SE.Input`; HUD, bubble and menus never reach the canvas.
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/egg_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js`).
