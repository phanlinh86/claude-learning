# Ollie's Lighthouse Flip: game of the day, 2026-11-20

Rolled by `/build-game random` with the seed date 2026-11-20 (America/Los_Angeles).
Ingredients (no re-rolls needed: the genre was last used 2026-11-05 and the theme 2026-11-02, both outside the 14-day window):
- genre: **gravity-flip runner**
- theme: **arctic**
- hero: **an otter**
- item: **leaves**
- twist: **a day-to-night cycle that changes visibility**
- levels: **floors of a building**

Nothing swapped. Leaves in the arctic looked odd at first, so they get a reason: the building is the **Snowcap Lighthouse**, whose keeper grows a big greenhouse; warm air from the radiators carries its leaves fluttering through every floor. Climbing the four floors also walks the day from dawn to night, which is where the visibility twist lives.

## Pitch
Ollie the sea otter is climbing the Snowcap Lighthouse to light the great lamp before the polar night. His magic snowflake scarf flips which way is "down": tap and Ollie swooshes up to run upside-down along the ceiling, tap again to drop back to the floor. Flip over open floor hatches and around snowball piles, hanging lamps and plant baskets, and catch the fluttering greenhouse leaves for the keeper. Each floor is later in the day: the windows go from dawn to noon to sunset to a starry aurora night, the halls get darker, and Ollie's headlamp and the wall lamps light the way.

## Core loop
- Each floor is a long corridor that scrolls right to left; Ollie runs at a fixed spot on screen (auto-run, gently speeding up).
- Two running surfaces: the **floor** below and the **ceiling beam** above. Both have gaps (open hatches).
- Tap → gravity flips; Ollie arcs to the other surface (real acceleration, eased turn-over), lands with a soft "fwump" squash.
- Leaves flutter in the warm draft along both surfaces and across the flip path, swaying like little pendulums. Each one caught scores and grows the combo.
- Visibility: the daylight from the windows fades through each floor and between floors. In the dim floors the wall lamps switch on, hazards get small warning lights, and Ollie's headlamp shines ahead, so the next hazard is always visible in time.

## Controls
- One input: tap anywhere / click / Space / ↑ / ↓ / Enter flips gravity.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Leaf: +10 × multiplier (×1 … ×5; +1 every 5 in a row). Each floor finished: bonus 100 × floor × round.
- 3 hearts (Easy 5). Bumping a snowball pile or a hanging prop, or falling through a hatch (Pip the puffin flies in and carries Ollie back), costs one heart, breaks the combo (Normal/Hard) and gives a short blink of safety. Each new floor gives one heart back.
- No hearts → game over. Best score saved per difficulty.

## Levels: floors of the lighthouse (and times of day)
1. **Boot Room** (dawn): pink-peach windows, coat hooks, skis and boots, light snow outside. Slow, few hatches (easy for a 6-year-old).
2. **Greenhouse** (noon): bright, sunny glass, potted plants and hanging baskets, ice sparkles outside.
3. **Map Library** (sunset): orange-violet windows, bookshelves and globes, wall lamps switch on, gentle snow.
4. **Lantern Deck** (night): dark halls, stars and a green-violet aurora outside, wall lamps and Ollie's headlamp, glowing leaves.
Each floor is about 60–80 s and ends at the stairway door; then the scene crossfades to the next floor. After the Lantern Deck the next day begins at the Boot Room, a bit faster (endless).

## Customisation
Change Pictures screen: Ollie (hero), the leaf, and each floor's background.

## Audience and platform
- Family-friendly: soft, round, smiling, nothing scary; bumps are soft "boing" bounces; the night is cosy, never spooky.
- Browser (GitHub Pages, iPhone/iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
