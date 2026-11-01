# Kit's Toybox Beat: game of the day, 2026-11-01

Rolled by `/build-game random` with the seed date 2026-11-01 (America/Los_Angeles).
Ingredients:
- genre: ~~top-down collector with gentle chasers~~ → **rhythm tap on the beat** (re-rolled with salt `r1`: the collector was used on 2026-10-29)
- theme: ~~coral reef~~ → **toy room** (re-rolled with salt `r1`: coral reef was used on 2026-10-29)
- hero: **a rocket kitten**
- item: **coins**
- twist: **tiny boss that throws soft pillows every 30 s**
- levels: **times of day (dawn, noon, sunset, night)**

No element was swapped: a rocket kitten zipping between two toy-train tracks and catching coins on the beat is a coherent one-day rhythm game, and a toy room lit by the window at dawn, noon, sunset and night gives each level its own look and song. (The pillow boss also appeared yesterday; the no-repeat rule only covers genre and theme, and here it works differently: pillows arrive on the beat and can be bopped back.)

## Pitch
When the grown-ups go to sleep, the toy room starts to play music! Kit, a little kitten with a toy rocket on her back, hovers next to two toy-train tracks. Shiny coins roll in along the tracks, right on the beat of the toy band's song. Tap at the right moment to catch each coin with a happy "ding!" and keep the groove going. Every 30 seconds Baron Fluff, a tiny grumpy teddy bear in a patched toy balloon, floats in and lobs soft pillows down the tracks. Tap them on the beat to bop them straight back at him!

## Core loop
- Side view of a toy room. Kit hovers on the left; two lanes (an upper shelf track and a lower floor track) run to the right.
- Coins roll toward Kit along the lanes; each arrives at Kit's catch ring exactly on a beat (or half-beat) of the music.
- Tap the matching lane when the coin reaches the ring: Perfect / Good / Miss. Kit zips to that lane and grabs it; each catch plays a melody note on top of the backing track.
- A **groove meter** (Kit's rocket fuel) rises with catches and falls with misses. Empty meter → game over.
- **Combo**: every 10 catches in a row raise the multiplier (×2, ×3, ×4). A miss resets it.
- Each level is one song (about a minute). Finish the song → level cleared, next time of day.

## Controls
- **Upper lane:** ↑ / W / F, or tap the upper half of the screen.
- **Lower lane:** ↓ / S / J, or tap the lower half of the screen.
- **Easy:** any key or tap catches whichever lane's coin is next (one-button play for small kids).
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Perfect = 100 × multiplier, Good = 50 × multiplier. Golden coin = ×3. Bopping a pillow back = 250.
- A pillow that isn't bopped poofs on Kit: feathers, a dizzy moment and a small groove loss. Never a game over by itself on Easy.
- Groove empty → game over. Song cleared → bonus = groove % × 10. Best score saved per difficulty.

## Levels (distinct backgrounds and ambient animation)
1. **Dawn**: pink-peach light through the window, sun rising; dust motes float in the light shafts. 84 BPM.
2. **Noon**: bright blue sky with clouds; soap bubbles drift up. 96 BPM.
3. **Sunset**: orange-gold light, long shadows; dandelion fluff drifts in the breeze. 104 BPM.
4. **Night**: moon and stars outside, the star night-light projects twinkling stars on the walls, coins glow. 112 BPM.
After Night the day starts again a little faster (endless).

## Customisation
Change Pictures screen: replace Kit (hero), the coin, the pillow, and each time of day's wallpaper.

## Audience and platform
- Family-friendly: nothing scary, nothing hurts. Pillows are soft; Baron Fluff is grumpy-cute.
- Easy: one-button play, wide timing window, slow-draining groove.
- Browser (GitHub Pages, iPhone / iPad touch) + portable Windows 11 exe. Original art and synthesized sound only.
