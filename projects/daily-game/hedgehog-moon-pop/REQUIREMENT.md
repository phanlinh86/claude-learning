# Bristle's Moon Pop: game of the day, 2026-11-21

Rolled by `/build-game random` with the seed date 2026-11-21 (America/Los_Angeles).
Ingredients:
- genre: **balloon / bubble popper** (re-rolled `r4`: the first rolls — snake trail grower, stack tower, whack-a-critter, memory match — were all used in the last 14 days)
- theme: **outer space** (swapped, see below)
- hero: **a hedgehog on a skateboard**
- item: **cupcakes**
- twist: **a magnet power-up**
- levels: **times of day (dawn, noon, sunset, night)**

Re-roll + swap: the theme roll gave coral reef (2026-11-17), then castle, robots factory, arctic, cloud kingdom, volcano, pirate,
jungle, dino valley, farmyard (all inside the 14-day window) and then **rainy-day garden** at `r13`. Rainy-day garden is
outside the window, but *bubble popper + rainy-day garden* is exactly Nimbus's Bubble Garden (2026-11-06), so the game would
feel like a repeat. I swapped the theme to the next unused roll, **outer space** (`r24`), which also fits the hero: a hedgehog
skating on the Moon gets huge, floaty low-gravity jumps — perfect for popping bubbles in the air.

## Pitch
On a tiny friendly Moon, the Moon Bakery's bubble oven has hiccups: cupcakes come bubbling up out of the craters, wrapped in
shiny soap bubbles, and float away into space! Bristle, a little hedgehog on a skateboard, skates along the Moon and does
big floaty low-gravity jumps — curling into a spiky ball to **pop** the bubbles with his spikes and save the cupcakes.
Pop one in the air and you bounce up again: chain pops for big points. A **magnet bubble** turns Bristle's spikes magnetic
for a few seconds, so nearby bubbles drift right to him. Sleepy little moon pebbles sometimes drift down from the sky — don't
get bonked! The day goes from **dawn** (Earthrise) to **noon**, **sunset** (a ringed planet) and a starry **night**.

## Core loop
- Side view, static scene. Bristle skates left/right on the flat Moon floor (low friction, a little glide).
- A crater vent **puffs** (telegraph ~0.8 s), then a bubble with a cupcake comes up and floats upward with a wobble.
- Pop it: touch it with Bristle. Low (just out of the crater) = 10, mid-air = ×2, high in the sky = ×3.
- **Jump**: a big floaty Moon jump (≈1.4 s in the air). In the air Bristle curls into a spiky ball. Each pop in the air gives a
  little bounce, so you can chain pops before landing (+chain bonus).
- Streak of pops (no bubble escaped) → ×2 at 8, ×3 at 20. A bubble that floats out of the top only ends the streak.
- **Magnet bubble** (the twist, ~1 per 25 s): pop it → 7 s magnet: bubbles within reach are pulled toward Bristle.
- **Moon pebbles**: drift down slowly with a shadow ring on the floor; a bonk costs a heart (soft "boing", dizzy stars).
- Fill the **cupcake box** (20 / 24 / 28 / 32 on Normal) → level clear (bonus hearts × 100) → next time of day.
  After night it loops, a bit busier (endless).
- Lose: all hearts gone (Normal 3, Easy 5, Hard 3).

## Levels (times of day; distinct sky + ambient animation)
1. **Dawn — Earthrise:** pink-peach sky, the blue Earth rising, fading stars, soft drifting moon dust. Calm, slow bubbles, no pebbles for 20 s.
2. **Noon — Bright Moon:** pale lilac-blue sky, a small white sun, glittering dust, moon-base domes in the distance. More vents.
3. **Sunset — Ringed Planet:** orange → violet sky, a big ringed planet, long shadows, occasional shooting stars. More pebbles.
4. **Night — Starry Bakery:** deep blue starfield, twinkles, shooting stars, lit domes; bubbles glow softly so they stay readable.

## Controls
- **Move:** ← → / A D, or move the mouse / hold a finger where Bristle should skate.
- **Jump:** Space / ↑ / W / Enter / right-click / on-screen jump button / second finger.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Screens
Title (bot demo plays behind), how to play, Get Ready banner per level, HUD (hearts, score + streak, cupcake box, magnet
timer), pause, game over (score, best, medal, stats, Score Card), settings (sound, music, volume, difficulty, level length,
full screen), customise.

## Customisation
The player can swap the hero (Bristle), the cupcake, the moon pebble, and the background of each time of day.

## Audience and platform
Family-friendly (default player ~6; Easy works for a 4-year-old), original art and synthesized sound only. Plays in Safari on
iPhone and iPad (portrait and landscape), in any desktop browser, and as a portable Windows exe (Go + WebView2).
