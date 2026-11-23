# Puddle's Greenhouse Hop — requirement (game of the day, 2026-11-23)

Rolled with `/build-game random` (seed = the date in America/Los_Angeles, 2026-11-23).
- Genre: **tiny platform hopper** (salt r14; slingshot, memory match, gravity flip, rhythm, flyer, bubble popper, whack-a-critter, catcher, brick-breaker and stack tower were all played in the last 14 days; the hopper was last played on 2026-11-08).
- Theme: **rainy-day garden** (salt r2; haunted castle 11-19 and arctic 11-20 were too recent).
- Hero: **a penguin** · Item: **fireflies** · Twist: **the hero slowly grows bigger** · Levels: **floors of a building**. Nothing swapped.
- Forked from `../frog-farm-hop/` (same hopper core, camera, input and mobile layer). The wind is gone; the new twist is growth with weight physics.

## Name and pitch
**Puddle's Greenhouse Hop.** On a rainy day, Puddle the little penguin in a coral rain hood bounces up the four floors of a tall glass greenhouse: off flower pots, potting shelves, bendy leaves and swinging hanging baskets. Every firefly makes Puddle a little bigger and rounder. Bigger means easier catching and deeper leaf bounces, but heavier, slower steering!

## Core loop
Puddle bounces automatically every time she lands on something. The player only steers left and right. The camera follows her up: the higher she climbs, the more points. Fireflies float between the platforms. Catch them for points and to fill the lantern jar (a full jar = one heart back).

## Controls
- Keyboard: hold ← / → (or A / D). Esc / P pause, M sound, F11 full screen.
- Mouse / touch: hold the left or right half of the screen.

## Score and lose
- +1 point per new metre climbed (×2 while Puddle is big, size ≥ 1.3), +10 per firefly, a floor bonus plus a size bonus at every new floor.
- Missing every platform and falling off the bottom costs a heart; an upside-down umbrella catches Puddle and throws her back up. No hearts left → game over. Easy has 5 hearts, Normal and Hard 3.

## Levels: floors of the Greenhouse Tower (distinct backgrounds and ambient animation)
1. **Potting Shed** (ground floor): warm wood, terracotta pots, rain running down the glass, drips from the roof. Pots and shelves only.
2. **Fern Floor**: misty green, hanging ferns, mist puffs from sprinklers. Bendy leaves and hanging baskets appear.
3. **Orchid Balcony**: an open balcony in steady rain, pink and violet orchids, splashes and umbrellas.
4. **Rooftop Rain Garden**: twilight, the rain thins to drizzle, a rainbow and soft lanterns.
After the roof the tower loops back to the Potting Shed, a little harder each time.

## The twist
**The hero slowly grows bigger.** Puddle grows a little all the time, and a bit more with every firefly (up to 1.6×). Bigger: wider feet (easier landings), a bigger catch reach, deeper leaf bends that flick her a bit higher, and ×2 metre points. But heavier: steering gets slower and she drifts further. At each new floor she shakes off the rain, shrinks back to normal and gets a size bonus.

## Customisation
The player can swap the pictures of the hero, the firefly and the four floor backgrounds (a pet, a family photo or a drawing).

## Audience and platform
Family-friendly, for young children (nothing scary; falling is a soft "boing" onto an umbrella). Browser (desktop, iPhone, iPad) + a portable Windows exe.
