# Integration notes (lead developer)

- **Swap:** the roll (stepping stones + bakery kitchen) had already produced Nim's River Hop (2026-11-15); the mechanic was
  swapped to the never-built *path* mechanic "maze ride" (drag a cart along a road). See `REQUIREMENT.md`.
- **render.js** is new: wall + window (TableArt, season crossfade) → outside particles clipped to the glass → table → light
  beams → roads → 'table' particles → bakery → houses / mouse / cart sorted by `z` (the cart sorts just behind the house it
  parks at) → puffs → flyers → sprinkles → bird → snowflakes → hint hand → front particles → fx → wipe → banner. The cart's
  cargo is drawn upright (never mirrored) over the front panel. Title: a small town from `World.genMap` (portrait: houses
  near the bottom, clear of the DOM title); done screen: houses lit, Tupi sprays sprinkles.
- **main.js** follows VOICE §1.1: count lines queued + protected while cookies hop into the tray; the first ask of a
  session queues the "hold the cart and drive" line (dropped on the first grab); a 2nd cart tap within 6 s teaches the drag;
  party / thanks / flavour lines are dropped before Talk time and a new round (playtest: the Talk question was cut).
- **Fix round 1** (QA + playtest): cart parks clear of the house, portrait map variety, chapterMinRounds 2, lift over a
  house drives there, no auto-roll after scribbling off the road, bigger sprinkles kept below the bubble, cargo visible,
  title layout, logo size, VI settings + Talk card sizes on landscape phones, Home in the pause menu is hold-to-confirm and
  stars of an unfinished session are banked, assist speaks the hint, "all delivered" said once, short weather lines.
- Known limit: portrait maps with 3–4 houses and one fork may park the cart closer to the house (`roads.parkK` fallback).
