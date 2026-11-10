# Mochi's Fairy Bounce — game of the day, 2026-11-10

Rolled by `/build-game random` (seed: the date in America/Los_Angeles).

| Table | Rolled | Note |
|---|---|---|
| genre | brick-breaker with a twist | re-rolled to `r4`: stack, fishing, gravity-flip and merge were used in the last 14 days |
| theme | fairy forest | re-rolled to `r6`: farmyard, pirate islands and toy room were used recently |
| hero | a panda | |
| item | stars | |
| twist | tiny boss that throws soft pillows every 30 s | |
| levels | ~~planets~~ → **four seasons** | swapped: planets don't fit a fairy forest; the forest changing through the seasons does |

## Pitch
Mochi the little panda holds a bouncy mushroom cap over his head and keeps a glowing fairy-light ball bouncing up into the flower-bud blocks of a magic forest. Break every block to bring the next season. Catch the falling stars. And watch out for Hoot, a sleepy little owl on a cloud, who throws a soft pillow every 30 seconds!

## Core loop
Move Mochi left and right → the ball bounces off the mushroom cap → it breaks blocks → stars fall out → catch them. When every block is broken, the season changes.

## Controls
- **Touch / mouse:** drag or move anywhere and Mochi follows your finger left and right. Tap to serve the ball.
- **Keyboard:** ← → (or A D) to move, Space or Enter to serve, Esc or P to pause, M for sound.
- Where the ball lands on the cap sets its angle: the middle sends it straight up, the edges send it sideways.

## Score and lose
- Block +10 (a tough block takes 2 hits: +10 each). Falling star caught +50. Ball hits Hoot +30, and 3 hits in one season "tickles" him for +100. Clearing a season gives +100, plus +20 for each heart left.
- A combo: every block after the 2nd one before the ball comes back to the cap gives +5 extra.
- If the ball falls past Mochi you lose a heart and serve again. You start with 3 hearts (max 5), and get +1 heart for every 10 stars and +1 for every season cleared. With 0 hearts the game is over.
- On Easy, a glowing fairy vine saves the ball twice per season (once on Normal, never on Hard).

## Levels: four seasons
1. **Spring Meadow:** blossom-bud blocks, falling petals, a pale morning sky.
2. **Summer Glade:** berry and mushroom blocks, fireflies and butterflies, a warm golden light.
3. **Autumn Hollow:** acorn and leaf blocks, tumbling leaves, an orange dusk.
4. **Winter Glow:** ice-crystal blocks, falling snow in depth layers, a starry blue night.

Each season has its own block layout, background (sky, far trees and near trees in parallax layers), ambient particles and music. After Winter the year starts again (round 2) a little faster, with more tough blocks.

## The twist
Hoot the owl floats on a small cloud above the blocks. Every 30 s (35 s on Easy, 25 s on Hard) he throws a soft pillow that drifts down. A shadow on the ground shows where it will land. If it bonks Mochi he gets sleepy for a moment and moves slowly (it never costs a heart). The ball can pop a pillow into feathers (+10), or bonk Hoot himself.

## Customisation
The player can swap the pictures of Mochi, the ball, the star and the four season backgrounds for their own (a photo, a pet, a drawing).

## Audience
Family-friendly, kids 5+ (Easy is the default). Nothing scary: pillows, giggles and feathers.

## Platform
Browser (iPhone, iPad, desktop) on GitHub Pages, plus a portable Windows exe.
