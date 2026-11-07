# Pebble's Oasis Run: game of the day, 2026-11-07

Rolled by `/build-game random` with the seed date 2026-11-07 (America/Los_Angeles).
Ingredients:
- genre: ~~balloon / bubble popper~~ (used 2026-11-06) → **lane runner (swipe/arrow lanes)** (salt `r1`)
- theme: ~~arctic~~ (used 2026-11-02) → **desert oasis** (salt `r1`)
- hero: **a robot pup** (a new pup, Pebble: sand-coloured, not Bolt from 2026-11-05)
- item: **seashells** (kept: an oasis is a lake in the sand, and long ago the desert was a sea floor, so shells wash up along the oasis path)
- twist: **tiny boss that throws soft pillows every 30 s**
- levels: **chapters of a storybook**

## Pitch
Pebble the little robot pup is running home across the desert storybook, chapter by chapter, collecting pretty seashells for his grandma's oasis pond. Swipe left and right to change lanes, swipe up to jump. Every 30 seconds **Fizz**, a cheeky little fennec fox on a flying carpet, swoops in and tosses fluffy **pillows** onto the path: watch their shadows, then dodge or jump. Dodge all of Fizz's pillows and he flies off with a grumpy-cute "hmph!" (bonus).

## Core loop
- A pseudo-3D path with **3 lanes** runs into the distance; Pebble runs automatically, the path flows towards the player and gently speeds up.
- Change lane (left/right) and jump to collect rows and arcs of seashells and avoid obstacles: tall stacks of clay pots (change lanes), low palm logs (jump or change lanes), rolling tumbleweeds (later chapters).
- Fizz arrives every 30 s, hovers above the path ahead, and throws 3–6 pillows: each one flies in a real arc and lands with a puff on a lane ahead (its shadow appears first), then lies on the path like a low obstacle.

## Controls
- Touch: swipe left/right = change lane, swipe up = jump. Tap the left / right third of the screen = change lane, tap the middle = jump.
- Keyboard: ← → / A D change lane, ↑ / W / Space jump. Esc or P pauses, M mutes, F11 full screen.

## Score and lose
- Seashell +10. Dodging every pillow of one Fizz visit: +50 × chapter. Each chapter finished: bonus 100 × chapter × round.
- 3 hearts (Easy 5). Bumping an obstacle or a pillow costs one heart (a soft "boing", Pebble stumbles, short blink). Each new chapter gives one heart back.
- No hearts → game over ("The End… for now!"). Best score saved per difficulty.

## Levels: chapters of a storybook
1. **The Palm Grove**: morning, green palms, a sparkling pond, butterflies. Only pots, wide gaps (easy for a 6-year-old).
2. **The Singing Dunes**: bright noon, golden dunes, heat shimmer, drifting sand. Palm logs appear.
3. **The Lantern Bazaar**: sunset, striped market tents, hanging lanterns, floating petals. Tumbleweeds roll across lanes.
4. **The Starry Oasis**: night, a big moon over the water, fireflies, glowing lanterns.
Each chapter is about 60–80 s of running; it ends at a storybook page arch, the page turns (crossfade + banner "Chapter 2: The Singing Dunes"). After chapter 4 the book starts again, a bit faster (endless).

## Customisation
Change Pictures screen: Pebble (hero), the seashell, and each chapter's background.

## Audience and platform
- Family-friendly: soft, round, smiling, nothing scary; Fizz is mischievous but cute, pillows are fluffy.
- Browser (GitHub Pages, iPhone/iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
