---
name: build-game-for-mam
description: Build a long-form (≈30–40 min) educational iPhone/iPad web game for Mầm — profiles with saved score and progress, EN/VI voice that pronounces "Mầm" properly, funny sounds, two alternating mechanics so a quick, easily-bored child stays engaged. Default input "random" rolls a game for age 4 (3–5); the age can be given. Deployed on GitHub Pages and listed in GAMES_FOR_MAM.md.
---

# Build Game for Mầm

Input: `random` (default), `random <age>`, `random <age> <hint>`, or a written requirement. Output: a touch-first browser
game for iPhone and iPad that is committed under `projects/education-game/<slug>/`, merged to main, served by GitHub
Pages and listed in `projects/education-game/GAMES_FOR_MAM.md` (and in `EDUCATION_GAMES.md`).

This skill **extends `build-education-game`** (read `.claude/skills/build-education-game/SKILL.md` first: team, phases,
education rules, mobile translation, voice approach, test team, delivery, pitfalls — all still apply). What this skill
adds is everything Mầm needs. Reference implementation: `projects/education-game/mam-treasure-reef/` (start the next
game as a copy of it, the way that one started as a copy of `owl-snow-garden`).

## Who the game is for
Mầm — a quick, extroverted Vietnamese girl, default age 4 (parents can set 3–7+). She gets bored fast, loves funny sounds
and faces, and loves to be encouraged by name. Her name must be pronounced properly: **"Mầm"**, never "Mam".

## Additional requirements (on top of build-education-game)
1. **Enough play for ≥ 30 minutes, saved as you go.** Not one 8-minute session: a **map of 6 lagoons/worlds**, each one a
   normal 4-chapter × 4-round session (+ Talk time). Finishing a world unlocks the next and awards a trophy (bronze /
   silver ≥ 20 / gold ≥ 32 of 52 stars). Lagoon 6 is a mixed review. Quitting mid-world saves a resume point (world,
   chapter, stars) and the map shows a "Keep playing" ribbon.
2. **Variety against boredom.** Two mechanics that alternate chapter by chapter (e.g. tap-to-dig and drag-to-sort; the rolled
   mechanic plus the proven drag-sort). Content must never repeat an identical round inside a chapter. Add free surprises:
   a photobombing creature every 3rd correct answer (≤ 2 per chapter), a giggling critter under one target per round that
   is never a mistake, a helper dance with a 2-bar kazoo tune at chapter end, confetti + fanfare per world.
3. **Profiles, score, progress.** `progress.js`: up to 4 profiles {name, sayAs, age, avatar}; a default profile
   **"Mầm", age 4** is created on first run so she can tap Play at once (one profile → straight to the map). Saved per
   profile: best stars per world/chapter, pearls score (+1 correct, +5 round, +10 chapter, +25 world), play time, resume.
   A Treasure Room shows the trophies and totals. Adding/editing players is behind the 2-second parent gate.
4. **Her name, spoken right.** `voice.js` splits every line at the child's name and speaks the name with the best **vi-VN**
   voice when the name has Vietnamese letters and a Vietnamese voice exists; otherwise it substitutes the parent-set
   "say the name as" spelling (default "Mum"). Praise lines (≥ 8 per language) all use `{child}`.
5. **Loud and adjustable.** Audio chain gain → compressor (−18 dB, 4:1) → user volume × 1.6 makeup; default 100 %; a volume
   slider in settings and big **+ / −** buttons in the pause menu (kid-reachable). Voice utterances follow the same volume.
6. **Funny sounds.** Synth boing (slide + vibrato), kazoo (saw through a nasal band-pass), slide whistle, bubbles, sand poof,
   rising counting chimes, bouncy swing-beat day music with shaker, music box at night.
7. Everything else from build-education-game stays: no fail state, voice + bubble, huge targets, tap ≠ drop, hint after 2
   misses, stars only up, chapters easiest first, 75 s chapter limit, Talk time with picture choices for ages ≤ 5,
   kid-proof input, safe areas, Add-to-Home-Screen icons, no network after load, no data leaves the device.

## Random mode
As in build-education-game (date seed, `roll.py`, avoid repeats of the last 14 days, swap ≤ 1 incoherent element), then
write `REQUIREMENT.md` with the lagoon × age topic table (see the reference game) and announce in 2–3 lines.

## Team and phases
Same agents as build-education-game, plus a **progress engineer** (`progress.js`, `storage.js`, node tests). Sub-agents for
web research may be unavailable inside agents — artists then research with WebSearch themselves (notes only, never copies).
Write `docs/DESIGN.md` first (the contract), including the **mound/target drawing contract** between world and render.
The lead owns `index.html`, `style.css`, `audio.js`, `assets.js`, `render.js`, `ui.js` (profiles, map, treasure room,
settings with players, pause with volume), `main.js` (title → profiles → map → world → done → map; resume; pearls HUD).
Check: functional QA with real CDP touch (profiles, map unlocks, resume, drag and dig by finger, volume persistence,
rotation), visual QA (every screen × 4 viewports × EN/VI, insets, contrast, colour-blind), high-speed playtester with child
models (typical 4-year-old, slow 3-year-old, tapper, spammer, idle, drops-high) reporting total minutes per age.

## Deliver
Branch `education-game/<slug>` → PR → merge to main with the REST API; verify the Pages URL; add rows to
`GAMES_FOR_MAM.md` and `EDUCATION_GAMES.md`; hand over the link with the Add-to-Home-Screen and Vietnamese-voice tips and
what is unverified on a real device (TTS, mic, loudness on the iPhone speaker).
