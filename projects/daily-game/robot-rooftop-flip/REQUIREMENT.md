# Bolt's Rooftop Flip: game of the day, 2026-11-05

Rolled by `/build-game random` with the seed date 2026-11-05 (America/Los_Angeles).
Ingredients:
- genre: **gravity-flip runner**
- theme: ~~candy land~~ (used 2026-10-29) → **city rooftops at night** (salt `r1`)
- hero: **a robot pup**
- item: **fireflies**
- twist: **colour matching: only collect your current colour**
- levels: **times of day (dawn, noon, sunset, night)**. Kept: the city runs from dawn through the day and arrives at its best moment, the glowing rooftops at night, which is where the theme lives (and where fireflies shine brightest).

## Pitch
Bolt the little robot pup has magnet paws. He races across the city rooftops from dawn until night, catching glowing fireflies for his lantern. Tap to **flip gravity**: Bolt springs up and clamps onto the overhead sky-rail, running upside-down, then tap again to drop back to the rooftops. Flip over the gaps between buildings and around chimneys and hanging signs. Bolt's chest light shows his colour: he can only catch fireflies of **his** colour. Run through a glowing paint arch to change colour.

## Core loop
- The city scrolls right to left; Bolt runs at a fixed spot on screen (auto-run, gently speeding up).
- Two running surfaces: the **rooftops** below and the **sky-rail** (a monorail girder) above. Both have gaps.
- Tap → gravity flips; Bolt arcs to the other surface (real acceleration, eased flip-over turn), clamps on with a "clank".
- Fireflies float in rows on both sides and in the flight path. Catching one of Bolt's colour scores and grows the combo; one of another colour just zips away (combo resets on Normal/Hard; on Easy it is simply ignored).
- Paint arches span from roof to rail: running through one changes Bolt's colour (pink heart, yellow star, cyan drop: shape + colour, so colour-blind players can play).

## Controls
- One input: tap anywhere / click / Space / ↑ / ↓ / Enter flips gravity.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Score and lose
- Matching firefly: +10 × multiplier (×1 … ×5; +1 every 5 in a row). Each level finished: bonus 100 × level × round.
- 3 batteries (Easy 5). Bumping a chimney or a hanging sign, or falling through a gap (a friendly rescue drone carries Bolt back), costs one battery and gives a short blink of safety. Each new time of day gives one battery back.
- No batteries → game over. Best score saved per difficulty.

## Levels: times of day
1. **Dawn**: pink-peach sky, soft morning mist, sleepy rooftops with water towers. Slow, few gaps (easy for a 6-year-old).
2. **Noon**: bright blue sky, puffy clouds, rooftop gardens, drifting dandelion seeds.
3. **Sunset**: orange-violet sky, long warm light, glowing windows switching on, floating warm motes.
4. **Night**: deep navy sky, stars and moon, neon-lit windows and signs, fireflies shining brightest, a shooting star now and then.
Each level is a stretch of about 60–80 s ending at a lit finish arch; then the sky crossfades to the next time of day. After Night it loops to Dawn, a bit faster (endless).

## Customisation
Change Pictures screen: Bolt (hero), the firefly, and each time of day's background.

## Audience and platform
- Family-friendly: soft, round, smiling, nothing scary; bumps are soft "boing" bounces.
- Browser (GitHub Pages, iPhone/iPad touch, portrait and landscape) + portable Windows 11 exe. Original art and synthesized sound only.
