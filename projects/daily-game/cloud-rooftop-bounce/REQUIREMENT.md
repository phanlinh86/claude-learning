# Wisp's Rooftop Bounce — game of the day, 2026-11-26

Rolled by `/build-game random` (seed: the date in America/Los_Angeles, 2026-11-26).

| Table | Rolled | Note |
|---|---|---|
| genre | brick-breaker with a twist | re-rolled to `r3`: the first roll, r1 and r2 hit genres used in the last 14 days (brick-breaker was last used 11-10) |
| theme | city rooftops at night | re-rolled to `r3` (last used 11-05) |
| hero | a cloud sprite | |
| item | gems | |
| twist | a magnet power-up | |
| levels | depth zones | read as a descent: Wisp floats down from above the clouds to the lantern-lit street, one zone per level |

Nothing swapped. "Depth zones" fit a city at night if the depth is height: each level is one step lower, from the cloud deck down to street level.

## Pitch
Wisp is a little cloud sprite who lives above the city. One night the moon drops its pearl! Wisp floats left and right and bounces the glowing moon-pearl up into the glowing blocks of the night city: cloud tiles, window panes, flower boxes and paper lanterns. Broken blocks drop sparkly gems for Wisp to catch. Grab the magnet and gems fly to Wisp, and the pearl sticks to the cloud so you can aim!

## Core loop
Move Wisp left and right → the pearl bounces off Wisp's fluffy top → it breaks blocks → gems fall out → catch them. Clear every block to float down to the next zone.

## Controls
- **Touch / mouse:** slide anywhere and Wisp follows your finger left and right. Tap to serve (and to let go of a stuck pearl during the magnet).
- **Keyboard:** ← → (or A D) to move, Space or Enter to serve or release, Esc or P to pause, M for sound.
- Where the pearl lands on Wisp sets its angle: the middle sends it straight up, the edges send it sideways.

## Score and lose
- Block +10 (a tough block takes 2 hits: +10 each). Gem caught +25. Clearing a zone gives +100 plus +20 per heart left.
- Combo: every block after the 2nd one before the pearl comes back to Wisp gives +5 extra.
- If the pearl falls past Wisp you lose a heart and serve again. Start with 3 hearts (max 5); +1 heart for every 10 gems and +1 per zone cleared. 0 hearts = game over.
- On Easy, a soft moonbeam net saves the pearl up to 8 times per zone (once on Normal, never on Hard).

## Levels: depth zones (from high to low)
1. **Cloud Deck:** above the clouds, the big moon, puffy star-cloud blocks, twinkles and drifting mist.
2. **Skyscraper Spires:** the tops of tall towers with blinking antenna lights, lit window-pane blocks, shooting stars.
3. **Rooftop Gardens:** water towers, rooftop gardens and string lights, flower-box blocks, fireflies and petals.
4. **Lantern Lane:** the cosy street-level night market, paper-lantern blocks, warm embers drifting up.

Each zone has its own layout, background (sky, far and near layers in parallax), ambient particles and music. After Lantern Lane, Wisp floats back up to the clouds (round 2), a little faster, with more tough blocks.

## The twist: magnet power-up
Magnet blocks drop a magnet in a bubble. Catch it and for 10 s (12 s Easy, 8 s Hard) Wisp holds a little magnet:
- gems (and other magnet bubbles) nearby curve toward Wisp;
- the pearl **sticks** to Wisp's top when it lands. Slide to aim, tap to let go (it lets go by itself after 1.5 s).
A ring around Wisp shows the time left.

## Customisation
The player can swap the pictures of Wisp, the pearl, the gem and the four zone backgrounds for their own (a photo, a pet, a drawing).

## Audience
Family-friendly, kids 5+ (Easy is the default). Nothing scary: a calm, glowing city at night.

## Platform
Browser (iPhone, iPad, desktop) on GitHub Pages, plus a portable Windows exe.
