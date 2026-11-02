# Bao's Arctic Reel: game of the day, 2026-11-02

Rolled by `/build-game random` with the seed date 2026-11-02 (America/Los_Angeles).
Ingredients:
- genre: ~~catcher with a basket~~ → **fishing with a timing reel** (re-rolled with salt `r1`: the catcher was used on 2026-10-30)
- theme: ~~candy land~~ → ~~candy land~~ (`r1`) → **arctic** (salt `r2`: candy land was used on 2026-10-29)
- hero: **a panda**
- item: **gems**
- twist: **golden rare item worth 5**
- levels: ~~floors of a building~~ → **depth zones** (swapped: a building's floors make no sense for ice fishing on a frozen sea; depth zones fit a fishing line perfectly)

## Pitch
Bao the panda has come all the way to the frozen north on holiday, with a red scarf, a little fishing rod and a bucket. Under the ice, sparkly gems drift by inside air bubbles. Hold to let the hook sink, let go to let it float up, and touch a gem to hook it. Then reel it in with well-timed taps on the reel meter! Watch out for the puffy pufferfish: bump one and *poof*, the line snaps. Once in a while a **golden gem** shimmers past: it is worth 5 of the purple ones.

## Core loop
- Side view. Bao sits on the ice next to a fishing hole in the middle of the screen. The line goes from the rod tip down through the hole; the hook moves only up and down.
- Gems in bubbles, decorative fish and pufferfish swim across the water from the sides at different depths.
- **Roam:** hold to sink the hook (it speeds up as it sinks), let go and it floats back up. If the hook touches a gem, the gem is hooked.
- **Reel:** a reel meter appears with a swinging needle and a green zone. Tap while the needle is in the green: the gem is pulled up a step (Perfect, in the gold centre: two steps). Tap outside: the gem slips down a bit; three slips and it wriggles free. When the gem reaches the hole, Bao catches it and drops it into the bucket.
- Pufferfish: touching one while roaming snaps the line (lose one of three lines). They ignore the hook while you reel.

## Controls (one input)
- Keyboard: hold **Space** / **↓** / **S** to sink; press it to tap the reel. Mouse/touch: hold anywhere to sink; tap anywhere to reel.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Amethyst (purple, shallow) 10, emerald (green, middle) 20, ruby (red, deep) 30, **golden gem 50 (= 5 amethysts)**. +5 for each Perfect reel tap.
- Three fishing lines (shown as spools). A pufferfish bump snaps one; no lines left → game over. Clearing a depth zone gives a line back (max 3).
- Best score saved per difficulty.

## Levels: depth zones (distinct backgrounds and ambient animation)
Each zone needs 8 gems (Easy 6, Hard 10). The water gets deeper, darker and busier; the sky above moves through the day.
1. **Sunny Shallows**: bright morning sky, turquoise water with light rays; gentle snow above, bubbles below.
2. **Kelp Garden**: golden afternoon, green-teal water with swaying kelp; little fish schools and drifting kelp bits.
3. **Twilight Waters**: pink-purple dusk, deep blue water; glowing plankton motes.
4. **Aurora Deep**: night with green aurora ribbons and stars, navy water; glowing jellyfish and sparkles; gems glow.
After Aurora Deep the zones loop a bit faster (endless).

## Customisation
Change Pictures screen: replace Bao (hero), the gem, the pufferfish, and each zone's background.

## Audience and platform
- Family-friendly: nothing scary, nothing gets hurt. Pufferfish are grumpy-cute; a snapped line just goes "boing".
- Level 1 must be easy for a 6-year-old. Easy: wide green zone, slow needle, few puffers.
- Browser (GitHub Pages, iPhone / iPad touch) + portable Windows 11 exe. Original art and synthesized sound only.
