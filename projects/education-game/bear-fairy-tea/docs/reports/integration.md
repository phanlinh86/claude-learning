# Integration report — Moka's Fairy Tea Party (integrator, 2026-11-16)

## What was wired
- `index.html` (title "Moka's Fairy Tea Party · Tiệc Trà Trong Rừng Của Gấu Moka", apple title "Fairy Tea", theme colour
  `#CFE6DA` = the breezy sky, description, logo, "Moka's voice"; script order per DESIGN §5 with `tea_art.js` instead of
  `parade_art.js`), `manifest.webmanifest`, `css/style.css` (forest retheme: cream panels, log-wood rims, bark-brown ink and
  logo outline, sage-moss chips / ▶ button, lantern-gold logo line, teal mic button = Moka's scarf stripe; every mobile /
  safe-area rule kept), `storage.js` (prefix `ft:`), `assets.js` (Moka frames, fairy, critters, 13 guests + `_hop`, env per
  mood, trunks, clouds, rainbow, 14 particles; every farm file removed), `audio.js` (rewritten), `render.js` (rewritten),
  `ui.js` (Talk pictures through `FT.TeaArt.drawIcon`), `main.js` (tea-party events → voice / sound / fx per VOICE §2),
  `README.md`, `CLAUDE.md`, `tests/e2e/{serve,smoke,functional}.js`.
- Deleted the parade-only `tests/qa/*` and `tests/visual/*` (they drove the barn / gate / parade and cannot work here); QA
  writes new ones. `tests/unit/load.js` and `tests/sim/*` (mechanics) kept.

## Decisions / deviations from DESIGN §7 and MECHANICS §5
1. **Garland ends vs trunk tie points.** `world.js` sets `garland.x0 / x1 = ins.left + 70 / W − ins.right − 70` (not the
   trunk ties), and the lanterns hang on THAT curve. To keep the world untouched, `render.js` computes the RECIPE
   `trunkGeom(...)` and then slides each trunk sideways by `garland.x0 − tieL.x` / `garland.x1 − tieR.x`, so the vine is tied
   exactly at the branch stubs (verified in screenshots on all four device shapes). No world change was needed.
2. **The env stack is anchored on a stable item size** (portrait since the QA fixes: the world's `envItem` / `envTableY` = the age's item cap; landscape: the age's base item × 1.12 on tall screens) instead of the
   per-round `layout.item`; otherwise `horizonY = table.y − 0.92·item` would jump up to 22 px between a 3-thing and a
   5-thing round.
3. **Rising things are drawn after Moka** (and before the fairy), so a thing floating up is never hidden; the snail is drawn
   before the table so it really slides out from behind the right toadstool leg (MECHANICS said "after the legs", which
   would put it in front of the leg).
4. **Fluffs**: the world's `(fluffX, fluffY)` is the hang point; the puff is drawn with its centre 1.3·r above it (TeaArt's
   stalk ends exactly on the hang point) and a thin string runs from there to the thing's (rotated) top while it falls.
5. **Moka's frames**: blink / talk mouth flap (≈ 2.7 Hz while the voice speaks) on idle; in the **rain chapter every mood
   except `cheer` uses `moka_umbrella`** (he only lowers the mushroom for "Cheers!"), and while he speaks the talk frame's
   mouth is clipped in on top (the head pose is identical), so his mouth still moves under the umbrella. DESIGN said main
   sets the umbrella frame; it is done in the renderer's frame choice instead (same effect, no world state touched).
6. **Stars fly from Moka's raised cup** at `cheers` (flushed at the next `round` / `talk` / `levelDone` if no cheers came).
7. **Lantern line** (`t('lantern')`) only in a chapter's round 0 or when nothing is speaking, queued; never on an `auto`
   lantern (chapter cut short).
8. **Weather**: `world.setBreeze(weather.ambient.wind)` before every world sub-step; `weather.resize(W, H, groundY,
   table.y)` + `setTable(plankX0, plankX1, table.y)` on every resize and round; the fairy leaves a gold dust trail
   (`addDust`, 1 mote / 0.09 s) while it circles / leads; `party(true)` on session done. Clouds come from `weather.clouds`,
   remapped into the RECIPE cloud band; the ambient tint goes over the env layers only.
9. **Title**: the real layout's table with 2–3 tea things (kept clear of the DOM ▶ / logo / tagline / star pill, measured
   every 0.5 s), the garland with one glowing lantern and the fairy looping around it; lanterns that would sit under the
   DOM logo are left out. **Done**: the session's lit lanterns (their thing icon + colour) float up through the clearing
   below the done panel, Moka alternates `sip` / `cheer`, the fairy flies, confetti + sparkles.
10. **Audio** (all synthesized): whoosh (fall), plop + table thunk pitched by thing kind (land), twinkle glissando + fairy
    chime (right), fairy flutter-chime (fairyFly), dust tinkle, rise shimmer, lantern bloom chord, boop-boop, berry pips up a
    pentatonic scale, chime wave = rising pentatonic bells, cheers = two-glass clink + music-box fanfare (music ducked to
    0.05 for 1.3 s), poof, garland cascade, critter sounds (ladybug tick + wing buzz on tap, butterfly flutter, snail bloop,
    fairy twinkles), Moka giggle on poke. Ambience: sunny birds, breezy leaf-rustle gusts, rain pitter-patter drips + roll,
    rainbow birds + shimmer. Music: music-box / celesta lullaby per mood, 0.22, ducked 0.07 under speech. Chain and gains
    exactly as the skill (`FT.debug.audio().gains()`).
11. **Test hooks**: `FT.debug` per DESIGN §5.5 with live getters (`Object.defineProperties`): `memberScreen`, `mokaScreen`,
    `critterScreen`, `answer`, `toScreen`, `getState` (incl. lit lantern count and critter state), `setSpeed`, `startGame`,
    `goTitle`, `setBot`, `setAutoRestart`, `gotoLevel`, `voiceLog`, `stats`, `events`, `world`, `weather`, `mode`, `audio()`.

## Fixes to other members' files
None were needed.

## Checks
`node tests/unit/run.js` (34) · `node tests/unit/i18n_voice.test.js` (55 759) · `node tests/unit/tea_art.test.js` (15 585) ·
`node tests/e2e/smoke.js` (one real touch tap → `right`, bot sessions to session done) · `node tests/e2e/functional.js`
(4 device shapes × real CDP touches: right / wrong / soft / slide / rotate mid-round and mid-rise / 4 critters / hint /
count / Moka + bubble repeat / Talk / pause / visibility / second finger / language / parent gate / settings + URL flags /
audio chain + volume / HUD release / URL age, and 10 bot sessions ages 3–7 × EN/VI). Screenshots of every mood, the title,
Talk time, the rise, critters and session done on iPhone portrait / landscape and iPad portrait / landscape were reviewed.

## Known / unverified
- Real-device TTS voices, the mic, and the iOS audio session can only be checked on a phone.
- ~~Portrait phones have a tall calm band of forest between the garland and the table~~ — fixed after QA (portrait layout
  centred, full-width table, env anchored on the item cap): see `fixes.md`.
