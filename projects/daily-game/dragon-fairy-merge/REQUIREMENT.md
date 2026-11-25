# Mossy's Egg Grove — game of the day, 2026-11-25

Made with `/build-game random` (seed: 2026-11-25, America/Los_Angeles).

## Rolled ingredients
| Table | Roll | Note |
|---|---|---|
| genre | merge-the-same-items board | 1st roll (tiny platform hopper, 11-23) and r1–r20 all landed on genres used in the last 14 days → r21 = merge board (last used 11-03) |
| theme | fairy forest | 1st roll (dinosaur valley, 11-16) was used in the last 14 days → r1 = fairy forest (last used 11-10, 15 days ago) |
| hero | a baby dragon | Mossy, a moss-green baby dragon with leaf wings |
| item | eggs | magical forest eggs that merge into bigger, fancier eggs |
| twist | wind gusts that change direction | forest gusts push falling eggs sideways; the windsock warns first |
| levels | four seasons | Spring → Summer → Autumn → Winter (windier each season) |

Nothing swapped. Different from Ember's Glow Castle (11-03, column-grid merge): this one is a **physics drop-and-merge** (round eggs roll, stack and bump), and the wind twist bends every drop.

## Name and pitch
**Mossy's Egg Grove** — Mossy the baby dragon flaps above a mossy twig nest and drops magic eggs. Two eggs of the same kind that touch merge into a bigger, fancier egg — all the way up to the Golden Dragon Egg, and two golden eggs hatch a baby dragon friend! But the fairy-forest wind gusts left and right: watch the windsock and aim with the breeze.

## Core loop
1. Mossy hovers at the top holding the next egg. Move him left/right (drag anywhere, or tap where you want him), let go to drop.
2. The egg falls (a dotted guide shows where it will land, already bent by the wind), rolls and settles in the nest.
3. Two eggs of the same kind touching merge into the next kind (+points, a little pop, chain merges = combo).
4. The nest slowly fills. If eggs stay above the vine line at the top for 2.5 s, the game ends (Easy/Normal: a fairy rescue first clears the top eggs).

## Controls
- Touch / mouse: drag (or tap) to move Mossy, release to drop.
- Keyboard: ←/→ move, Space / ↓ drop. Esc/P pause, M sound, F11 full screen.

## Scoring and losing
- Making egg kind n gives 1, 3, 6, 10, 15, 21, 28, 36 points; two Golden eggs hatch for +100.
- Chain merges within 0.8 s: +1 per step on top.
- Lose: an egg rests above the vine line for 2.5 s. Fairy rescues: Easy 2, Normal 1, Hard 0.

## Twist: wind gusts that change direction
Calm → the windsock flutters and an arrow shows which way (1.5 s warning) → a gust blows for 3–5 s → calm again. The direction changes from gust to gust. Gusts push eggs that are still falling (not the ones already resting), so a drop curves. Wind gets stronger every season.

## Levels (by score; eggs stay in the nest across seasons)
1. Spring Blossom Glade — gentle breeze, petals.
2. Summer Mushroom Meadow — stronger gusts, glowing fireflies/sparkles.
3. Autumn Lantern Woods — gusty, tumbling leaves.
4. Winter Frost Hollow — strongest gusts, snow. Then winter loops with stronger wind.

## Customisation
Change Pictures: hero (Mossy), egg picture (all eggs; each kind keeps its own coloured ring and size) and the four season backgrounds.

## Audience and platform
Family-friendly (ages 4+), nothing scary. Browser (iPhone / iPad / desktop, GitHub Pages) + portable Windows exe.
