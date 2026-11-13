# Comet's Gem Factory — game of the day, 2026-11-13

Rolled by `/build-game random` (seed: the date in America/Los_Angeles).

| Table | Rolled | Note |
|---|---|---|
| genre | memory-match cards with a timer | re-rolled to `r11`: every genre in r0–r10 was used in the last 14 days (memory-match was last used on 2026-10-29, 15 days ago) |
| theme | friendly robots factory | re-rolled to `r1`: cozy kitchen was used on 2026-11-12 |
| hero | a rocket kitten | |
| item | ~~seashells~~ → **gems** | **swapped**: seashells have nothing to do with a robot factory; shiny gems (from the same table) are what the robots love and make great card faces (each gem has its own shape *and* colour) |
| twist | combo meter that grows the score multiplier | |
| levels | four seasons | seen through the factory's big windows: spring, summer, autumn, winter |

## Pitch
Comet is a little kitten with a rocket backpack who works at the friendliest factory in town. Gizmo the robot builds toys, but only from matching gems! Flip two cards, find the twin gems, and Comet zooms them into Gizmo's hopper. Match pairs in a row to grow the combo meter (×2, ×3 … ×5), beat the clock, and work through the seasons from a blossom spring to a snowy winter.

## Core loop
The cards slide in face up for a quick peek ("Remember!"), then flip face down. Tap a card to flip it, tap a second one. Same gem: a match, the gems fly into Gizmo, time is added. Different gems: they wiggle and flip back. Clear the board to finish the season.

## Controls
- **Touch / mouse:** tap or click a card.
- **Keyboard:** arrow keys / WASD move the highlight, Space or Enter flips; Esc/P pause; M sound; F11 full screen.

## Score and lose
- A match is worth 10 × the combo multiplier.
- Combo: every match in a row raises the multiplier (×1 → ×5). A miss lowers it, but **only if you had already seen one of the two cards** (an unlucky first look never costs anything). Easy: −1 step, Normal: −2, Hard: back to ×1.
- Every season has a clock (a fuel gauge). Each match adds a few seconds. Clearing the board gives 5 points per second left, and +50 for a perfect season (no combo-breaking miss).
- The clock runs out: Gizmo yawns and it's the end of the shift → game over.

## Levels
Spring 4×3 (6 pairs), Summer 4×4 (8), Autumn 5×4 (10), Winter 6×4 (12). Each season has its own view through the windows and ambient animation (blossoms, summer sun motes and butterflies, blowing leaves, snow in depth layers), plus factory life: spinning gears, a moving conveyor and steam puffs. After winter the year starts again a bit faster.

## Customisation
The player can swap Comet, one gem (their picture becomes a pair on every board) and the factory wall for their own pictures.

## Audience and platform
Family-friendly, first level easy for a 4–6-year-old. Browser (iPhone, iPad, desktop) + portable Windows exe.
