# Momo's Dino Drums: game of the day, 2026-11-16

Rolled by `/build-game random` with the seed date 2026-11-16 (America/Los_Angeles).
Ingredients:
- genre: ~~whack-a-critter reaction game~~ → **rhythm tap on the beat** (re-rolled with salt `r1`: whack-a-critter was used on 2026-11-11)
- theme: ~~desert oasis~~ → ~~toy room~~ → **dinosaur valley** (desert oasis was used on 2026-11-07, so re-rolled with `r1` → toy room. Toy room is outside the 14-day window, but *rhythm tap + toy room* is exactly Kit's Toybox Beat (2026-11-01), so I swapped this one element for the next valid re-roll, `r3`: dinosaur valley; `r2` pirate islands was used on 2026-11-09)
- hero: **a panda**
- item: **gems**
- twist: **a friendly helper that appears at combo 5**
- levels: **floors of a building** → the four floors of the Dino Lookout, a bamboo-and-stone tower in the valley

## Pitch
At the top of Dino Valley stands the Dino Lookout, a tall bamboo tower where the dinosaurs come to dance. Momo the panda rides a little bamboo swing-lift up and down between two drums. Shiny gems hop along two bamboo rails, landing on every beat of the valley band's song. Drum at the right moment to catch each gem with a happy "bonga!" and keep the dinos dancing. Get a 5-catch combo and **Pip**, a baby pterosaur, flies in to drum with you: while Pip is there every catch is worth double, and Pip saves one gem you miss. Clear a song and the lift carries Momo up to the next floor.

## Core loop
- Side view of a tower floor with a big arched opening onto the valley. Momo hangs on the left; two lanes (upper bamboo rail, lower deck rail) run to the right, each ending at a drum (the catch ring).
- Gems hop toward Momo along the rails, one hop per beat, and land on the drum exactly on a beat (or half-beat) of the music.
- Tap the matching lane when the gem lands: Perfect / Good / Miss. Momo swings to that lane and drums; each catch plays a melody note on top of the backing band.
- A **groove meter** (Momo's drum energy) rises with catches and falls with misses. Empty → Momo gets sleepy → game over.
- **Combo**: every 10 catches in a row raise the multiplier (×2, ×3, ×4). A miss resets it.
- Each floor is one song (about a minute). Finish the song → floor cleared, ride up to the next floor.

## Controls
- **Upper lane:** ↑ / W / F, or tap the upper half of the screen.
- **Lower lane:** ↓ / S / J, or tap the lower half of the screen.
- **Easy:** any key or tap catches whichever gem is next (one-button play for small kids).
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Perfect = 100 × multiplier, Good = 50 × multiplier. Rainbow gem = ×3. While Pip is with Momo: ×2 on top.
- Groove empty → game over. Song cleared → bonus = groove % × 10. Best score saved per difficulty.

## The twist: Pip the helper
- When the combo reaches 5 (and Pip is not on a short cooldown), Pip flaps in and perches on the top rail next to Momo, flapping on the beat.
- While Pip stays (20 s at most): catches score double, and the **first gem you miss is caught by Pip** instead (no groove loss, combo kept). Then Pip waves and flies off; reach combo 5 again to call Pip back.

## Levels (floors of the Dino Lookout, distinct backgrounds and ambient animation)
1. **Riverbank** (ground floor): morning light, the river sparkles through the arch, a long-necked dino drinks in the distance; pollen motes and a few leaves drift. 84 BPM.
2. **Fern Canopy** (2nd floor): treetop ferns at eye level, green dappled light; butterflies flutter by. 96 BPM.
3. **Nest Ledge** (3rd floor): above the trees, fluffy clouds, pterosaur nests on the cliffs; soft downy fluff drifts and sways. 104 BPM.
4. **Sky Roof** (top): dusk-to-night sky with stars, a sleepy faraway volcano puffing little clouds; fireflies glow. 112 BPM.
After the Sky Roof the lift goes back down and the day starts again a little faster (endless).

## Customisation
Change Pictures screen: replace Momo (hero), the gem, Pip (the helper), and each floor's wall picture.

## Audience and platform
- Family-friendly: nothing scary, nothing hurts. The dinosaurs are friendly plant-eaters; missing is "oops", game over is "Momo is sleepy".
- Easy: one-button play, wide timing window, slow-draining groove, first floor can't be lost.
- Browser (GitHub Pages, iPhone / iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
