# Otto's Playroom Dash: game of the day, 2026-11-22

Rolled by `/build-game random` with the seed date 2026-11-22 (America/Los_Angeles).
Ingredients:
- genre: ~~gravity-flip runner~~ (used 2026-11-20; every other genre except merge was inside the 14-day window) → **lane runner (swipe/arrow lanes)** (salt `r13`)
- theme: ~~haunted-but-cute castle~~ (used 2026-11-19) → **toy room** (salt `r1`; last used 2026-11-01)
- hero: **an otter** (a new otter, Otto: chocolate-brown with a cream face and a mint scarf — not Ollie from 2026-11-20)
- item: **acorns** (wooden toy acorns from the toy-shop shelf, three kinds)
- twist: **gentle gravity changes per level**
- levels: **biomes** (four play-mat biomes of the toy room)

Nothing swapped: a toy room has natural "biomes" (the rug, the bed, the craft table, the ceiling with glow stars), and each one can
feel different underfoot — that is the gravity twist.

## Pitch
Otto the little otter is racing across the playroom at bedtime, collecting the wooden acorns that rolled out of the toy box. Swipe left
and right to change lanes, swipe up to jump over soft foam blocks and bouncy balls, and run around the tall block towers. Every biome of
the room has its own **gravity**: normal hops on the Felt Meadow rug, floaty bounces on the Pillow Mountains of the big bed, quick heavy
hops in the Crayon Jungle, and slow-motion moon jumps under the Glow-Star Galaxy ceiling.

## Core loop
- A pseudo-3D toy road with **3 lanes** runs into the distance; Otto runs automatically, the road flows towards the player and gently
  speeds up.
- Change lane and jump to collect rows and arcs of acorns and avoid obstacles: tall **block towers** and **stacking-ring toys** (go
  around), low **foam-block rows** (jump or change lanes), **bouncy balls** that roll and bounce across the lanes (later biomes).
- The jump arc follows the biome's gravity, so the acorn arcs and the obstacle spacing follow it too. A gravity badge in the HUD and the
  biome banner tell the player what's coming ("Floaty jumps!").

## Controls
- Touch: swipe left/right = change lane, swipe up = jump. Tap the left / right third of the screen = change lane, tap the middle = jump.
- Keyboard: ← → / A D change lane, ↑ / W / Space jump. Esc or P pauses, M mutes, F11 full screen.

## Score and lose
- Acorn +10; every 10 in a row = a combo chime. Each biome finished: bonus 100 × biome × round.
- 3 hearts (Easy 5). Bumping an obstacle costs one heart (a soft "boing", Otto tumbles, short blink). Each new biome gives one heart back.
- No hearts → game over ("Sleepy time… for now!"). Best score saved per difficulty.

## Levels: biomes of the playroom
1. **The Felt Meadow** (gravity 1.0, "Normal hops"): the green felt play rug, wooden toy trees, felt flowers, morning window light.
   Only towers and acorns, wide gaps (easy for a 6-year-old).
2. **Pillow Mountains** (gravity ≈ 0.7, "Floaty jumps!"): the big bed, patchwork quilt hills, pillow peaks, drifting feathers. Foam blocks appear.
3. **The Crayon Jungle** (gravity ≈ 1.25, "Quick heavy hops!"): the craft table, giant crayons as trees, paper-cut leaves and vines, afternoon. Bouncy balls roll across.
4. **The Glow-Star Galaxy** (gravity ≈ 0.5, "Moon jumps!"): bedtime, the ceiling glow stars, a nightlight moon, toy rockets and planets on strings.
Each biome is about 60–80 s of running and ends at a toy-block archway; the scene crossfades with a banner. After biome 4 the room loops a bit faster (endless).

## Customisation
Change Pictures screen: Otto (hero), the acorn, and each biome's background.

## Audience and platform
- Family-friendly: soft, round, smiling, nothing scary; bumps are soft and funny.
- Browser (GitHub Pages, iPhone/iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
