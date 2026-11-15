# Shelly's Sky Catch: game of the day, 2026-11-15

Rolled by `/build-game random` with the seed date 2026-11-15 (America/Los_Angeles).
Ingredients:
- genre: **catcher with a basket**
- theme: **cloud kingdom**
- hero: **a snail with a jetpack**
- item: **stars**
- twist: **golden rare item worth 5**
- levels: **weather (sunny, rain, wind, snow)**

No re-roll and no swap: the catcher genre was last used on 2026-10-30 and the cloud kingdom has never been used, both outside the 14-day window. The mix is coherent: a snail is slow on the ground, but with a jetpack she can zip along the cloud floor under the falling stars.

## Pitch
High above the rain, the Cloud Kingdom's sleepy star-keepers are tidying the sky, and stars keep slipping out of the cloud bank. Shelly, a little snail with a tiny jetpack strapped to her shell and a woven basket on top, zooms along the fluffy cloud floor to catch them before they melt into the mist. Rare **golden stars** are worth 5. Grumpy little **thunder puffs** sneak down too: catch one and Shelly gets a fizzy zap. Every level brings new weather: sunny, rain, wind and snow, and each weather changes how the stars fall.

## Core loop
- Side view. Shelly hovers left/right just above the cloud floor; her basket rim is the catch zone.
- A twinkle peeks out of the cloud bank at the top (telegraph ~0.6 s), then a star drops. Stars are light: they fall with gravity and air drag, flutter and spin.
- Catch stars → streak +1; streak 8 → ×2, streak 20 → ×3 points. A star that reaches the cloud floor resets the streak (no heart lost).
- **Golden star** (rare, ~1 in 12): heavier, falls faster with a sparkle trail, worth 5 × 10 points.
- **Thunder puff**: catch one → lose a heart, the streak ends, Shelly is zapped (fizzy, never scary). They drift down slowly; let them land and they pop harmlessly.
- **Jet Hop** (action): a jetpack burst that hops Shelly up ~100 px for ~0.7 s, so she can grab a star early (before the wind steals it) and fly a bit faster sideways. Recharges in ~2.5 s.
- Fill the **star jar** (18 / 22 / 26 / 30 stars on Normal) → level clear (bonus = hearts × 100) → next weather. After snow the weather loops, a bit busier (endless).
- Lose: all hearts gone (Normal 3, Easy 5).

## Weather levels (distinct backgrounds + ambient animation + mechanic)
1. **Sunny:** bright blue sky, cloud castles, a rainbow bridge, sun sparkles. Calm, gentle falls. Thunder puffs very rare at first.
2. **Rain:** lavender-grey sky, raindrops and splashes on the cloud floor; wet stars fall a little faster; more thunder puffs; a rainbow fades in near the end.
3. **Wind:** peach-teal sky, windmills on cloud islands, flags and wind streaks. **Gusts** (telegraphed by streaks and a windsock in the HUD) push falling stars sideways and nudge Shelly a little; the direction changes.
4. **Snow:** twilight violet sky, snowy castles, snowflakes in depth layers. The cloud floor is icy: Shelly slides (less grip), stars flutter down slowly.

## Controls
- **Move:** ← → / A D, or move the mouse / hold a finger where Shelly should fly.
- **Jet Hop:** Space / ↑ / W / Enter / right-click / on-screen 🚀 button / second finger.
- Esc or P pauses, M mutes, F11 toggles full screen.

## Screens
Title (bot demo plays behind), how to play, Get Ready banner per level, HUD (hearts, score + streak, star jar, jet meter, windsock in wind), pause, game over (score, best, medal, stats, Score Card), settings (sound, music, volume, difficulty Easy/Normal/Hard, level length, full screen), customise.

## Customisation
The player can swap: the hero (Shelly), the star, the thunder puff, and the background of each weather.

## Audience and platform
Family-friendly, original art and synthesized sound only. Plays in Safari on iPhone and iPad (portrait and landscape), in any desktop browser, and as a portable Windows exe (Go + WebView2).
