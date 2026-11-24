# Nubi's Farm Fling — game of the day, 2026-11-24

Made with `/build-game random` (seed: 2026-11-24, America/Los_Angeles).

## Rolled ingredients
| Table | Roll | Note |
|---|---|---|
| genre | slingshot launcher | 1st roll and r1 were used in the last 14 days → r2 = slingshot launcher (last used 11-09, 15 days ago) |
| theme | farmyard | 1st roll and r1 were used in the last 14 days → r2 = farmyard (last used 11-08) |
| hero | a cloud sprite | Nubi, a fluffy little rain cloud with a green sprout on top |
| item | fireflies | farm fireflies drifting over the fields |
| twist | the hero slowly grows bigger | Nubi soaks up mist and fireflies and puffs up; raining on crops uses the water up again |
| levels | four seasons | Spring → Summer → Autumn → Winter (rain turns to snow) |

Nothing swapped. Forked from `../fox-island-fling/` (same slingshot core, same genre 15 days ago); the day-night twist is replaced by growth.

## Name and pitch
**Nubi's Farm Fling** — Nubi the little rain cloud is flung from a hay-bale slingshot across the farm, gulping fireflies in mid-air and puffing up bigger and bigger, then lands on the thirsty planter wagon to rain on the crops. Bigger Nubi rains wider but floats more: aim with that in mind!

## Core loop
1. Nubi sits in the wooden Y-fork slingshot on a hay bale. Drag back (anywhere on the screen) to stretch the band; the dotted arc shows where Nubi will fly (it already includes Nubi's current size).
2. Let go: Nubi flies a real ballistic arc. Fireflies he touches are gulped (each one makes him a little bigger). One tap in the air = a "puff" (a small lift, once per flight).
3. Land on the planter wagon: Nubi rains on it and the crops spring up (+points, the thirsty patch in the middle is the bullseye). Miss and Nubi plops softly onto the grass (lose a heart, lose a bit of puff). Nubi bounces back to the slingshot; new wagon spot and new fireflies every shot.

## Controls
- Touch / mouse: drag back and release; tap during flight to puff.
- Keyboard: ←/→ power, ↑/↓ angle, Space fire (Space again in flight = puff). Esc/P pause, M sound, F11 full screen.

## Scoring and losing
- Firefly +1 (rare golden firefly +3). Watering the wagon +2, thirsty-patch bullseye +3 more, streak bonus +1 per step (max +4), Big Shower +2 when Nubi is big (≥ 1.4×) on landing.
- A plop costs a heart (Easy 5, Normal 3, Hard 3). 0 hearts → game over. Every 12/20/25 fireflies (Easy/Normal/Hard) gives a heart back.

## Twist: Nubi slowly grows bigger
Nubi grows slowly by himself (soaking up morning mist) and a bit more with every firefly, up to 1.7×. Bigger Nubi:
- catches fireflies from further away and rains over a wider part of the wagon (easier landings);
- is more buoyant and catches more air: he floats and slows down, so the same pull flies a shorter, loftier arc.
Raining on the wagon uses up water (he shrinks back part of the way); a plop squeezes some puff out.

## Levels (5 waterings each, then loop slightly harder)
1. Spring Sprouts — big parked wagon, long aiming arc, blossom petals drifting.
2. Sunflower Summer — the wagon rolls slowly back and forth, butterflies.
3. Pumpkin Autumn — smaller rolling wagon, one friendly crow floating across (Nubi bonks off it), tumbling leaves.
4. Snowy Winter — smallest wagon, two crows, shorter arc, snow falls and Nubi snows instead of rains.

## Customisation
Change Pictures: hero, firefly and the four season backgrounds (photo or drawing; stored on the device).

## Audience and platform
Family-friendly (ages 4+), nothing scary: a plop is a soft "pfff", crows just bonk. Browser (iPhone / iPad / desktop, GitHub Pages) + portable Windows exe.
