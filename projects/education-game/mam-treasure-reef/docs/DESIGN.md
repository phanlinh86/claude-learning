# Mầm's Treasure Reef — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.TR`** (rename every `TR` in the copied code). Classic `<script>` files,
no build step. Storage prefix **`tr:`**. The code base is a copy of `../owl-snow-garden/` (read its `docs/DESIGN.md`,
`docs/MECHANICS.md`, `docs/VOICE.md` for anything not changed below — everything not mentioned here stays as there).
**Target: iPhone + iPad Safari first** (also desktop). Touch is the only required input. Age default 4 (3–7+).

## 1. What changes versus Owlet's Snow Garden
| Snow Garden | Treasure Reef |
|---|---|
| seeds → pots, flowers grow | **treasures** (shells, pearls, starfish, tags) → **treasure chests**; a landed item settles with a bounce and a sparkle (no growth) |
| one mechanic (drag) | **two mechanics**: `drag` (sort / count / ask, as before) and **`dig`** (tap a sand mound) — chosen per chapter by the lagoon plan |
| Lumi the owlet | **Tutu the baby sea turtle** (`tutu`), sandy tan skin + brown shell (never an answer colour) |
| arctic garden | **under the sea**: sand floor, coral, kelp, light shafts, bubbles; morning → noon → sunset → night (bioluminescence) |
| one session = 4 chapters | **6 lagoons** × 4 chapters × 4 rounds; a reef map, profiles, saved progress, pearls score, Treasure Room |
| name in settings | **profiles** (name, age, avatar, "say my name as"); the child's name is spoken with a Vietnamese voice |
| sound on/off | **volume** 0–100 (default 100) + compressor; +/− buttons in pause |
| arctic animals | **sea friends**: crab, octopus, seahorse, clownfish, dolphin, jellyfish, starfish, whale, pufferfish |

## 2. Screen and coordinates (as Snow Garden §2, renamed)
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
- `World.setViewport(W, H, ins)` → `layout`:
  ```
  layout = { W, H, ins,
    groundY,                   // H - ins.bottom - 70 (sand line; chests stand on it)
    chest: { y, w, h, xs[] },  // w = min(230, (W-ins.left-ins.right-40)/n - 24); h = 0.78*w (viewBox 256×200); bottom at groundY+8
                               // y = opening centre (chest_back opening centre is (128, 54) in the viewBox)
    tutu: { x, y, h },         // feet anchor; x = ins.left + 105; y = ins.top + 225 (landscape) / +245 (portrait); h = 175 / 190
    bubble: { x, y, w, h },    // x = tutu.x + 85, y = ins.top + 24, w = min(620, W - x - ins.right - 150), h = 104
    play: { x, y, w, h },      // resting items (drag) / mounds (dig) live here: ins.left+40 .. W-ins.right-40, tutu.y+10 .. chest top - 24
    moundGrid: [{x, y}]        // dig mode: 6 anchor points for mounds (2 rows × 3 landscape, 3 rows × 2 portrait), ≥ 190 px apart
  }
  ```
  Count rounds use one long chest (`kind:'long'`, viewBox 512×200) with N slots, `w = min(W-ins.left-ins.right-80, 120 + need*96)`.
- Tall portrait (H/W > 1.6): items ×1.2, background layers ×1.36, items kept in a band ≤ 0.85×W tall just above the chests.
- Item touch radius `0.6×size+14`; **mound tap rect = mound rect + 24 px all sides**. Chest drop zone: chest rect +30 px sides, +90 px up.
- HUD (DOM, top-right) occupies `x > W-ins.right-140, y < ins.top+90`; pearls counter sits next to the stars.

## 3. Art style guide (ALL artists)
- **Original only.** Web search is for reference (sea-turtle / sea-creature anatomy, toddler-app style); never copy a known
  character or brand (no Nemo/Dory/Squirt/Octonauts/Baby Shark likeness).
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px at viewBox 256
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- Badges / avatars: **white sticker border** ≈ 6 px + faint drop shadow inside the SVG (opacity .18, +3 y).
- No `<text>`, no fonts, no scripts, no external refs, at most one light `feGaussianBlur`. `width`/`height` = viewBox.
- Kid-friendly: no teeth, no sharp claws (crab claws are round mittens), nothing scary; pufferfish spikes are soft bumps.
- **Answer palette (exact hex, as before):** red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`,
  green `#4CC26B`/`#2A8343`, orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, cream (plain tag) `#FFF4DC`/`#C9A877`.
- **Tutu:** skin sandy tan `#E3CC9A`, shade `#C4A86F`, shell `#8E5B3A` with plates `#E8C27A` edged `#6B3F24`, belly cream
  `#F6E9CF`, outline `#6B4A2E`, eyes big dark `#3A2E2A` with white catch-light, iris warm `#5B8F7A` (muted, not the answer
  green), cheeks `#F7B6C2`, a tiny red-ish bandana knot is NOT allowed (red is an answer colour) → a **mint `#5FD3B4` bandana**.
- **Chests:** dark wood `#8A5A33`, shade `#6B4224`, bands/trim brass `#D9A441` (duller than answer yellow), outline `#4E2E16`,
  inside dark `#3B2414`. Long chest same wood. Sand mound: `#F2DFB3`, shade `#D9C18A`, outline `#B59A62`, a few darker specks.
- **Background:** water turquoise, lighter and greener than answer blue: top `#5FC9DD`-ish by day, sand `#F2DFB3`/`#E3C98E`,
  coral muted pink `#E9A3B8` / lilac `#C9A9E0` (desaturated, never like red/purple answers), kelp muted olive `#7FA66B`
  (never as saturated as `green`). Night: deep navy `#13305A` water with glowing plankton; the play band stays lit
  (darkness tint ≤ 0.28 over the background only, never over items, mounds, chests or Tutu).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Tutu, treasures, chests, UI — character artist A
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `characters/tutu_idle.svg` | 0 0 256 256 | h 175–190 | baby sea turtle standing on hind flippers, ¾ view facing RIGHT, front flippers at the sides, mint bandana. **Feet anchor (128, 244).** |
| `characters/tutu_blink.svg` | same | | identical body, eyes closed (happy arcs) |
| `characters/tutu_talk.svg` | same | | identical body, mouth open |
| `characters/tutu_happy.svg` | same | | small hop, flippers up, smile eyes |
| `characters/tutu_cheer.svg` | same | | flippers spread wide, sparkly star eyes, open-mouth cheer |
| `characters/tutu_think.svg` | same | | head tilt, flipper at chin, eyes up-right |
| `characters/tutu_oops.svg` | same | | gentle "hmm?" (brows up, small o-mouth) — NOT sad |
| `characters/tutu_dance_a.svg`, `tutu_dance_b.svg` | same | | two dance poses (lean left / lean right, flippers up) for chapter-end wiggle |
| `items/shell_<red|blue|yellow|green|orange|purple>.svg` | 0 0 128 128 | 100–130 | big scallop/clam shell, point down, centre (64, 66), ≈ 96 w × 92 h, palette colour + lighter ribs |
| `items/pearl.svg` | 0 0 128 128 | | glossy cream-white pearl `#FBF6EC` with a soft pink/blue sheen, in a half-open small shell base (muted tan) |
| `items/tag.svg` | 0 0 128 128 | | cream rounded treasure tag (coin-like) with a rope loop; **centre area plain** (code draws letters/numbers) |
| `items/mound.svg` | 0 0 160 96 | w = 150–180 | sand mound, base at y 92, item pokes out at the top centre (64..96 clear) |
| `items/mound_hole.svg` | 0 0 160 96 | | the same footprint after digging: shallow dark sand dip |
| `items/chest_back.svg` | 0 0 256 200 | w = layout.chest.w | back half: open lid (hinged at the back, leaning back) + inner back wall; opening centre (128, 54) |
| `items/chest_front.svg` | 0 0 256 200 | | front body of the chest (front lip y≈50–66, body to y≈196 with feet); drawn OVER items inside |
| `items/long_back.svg` / `long_front.svg` | 0 0 512 200 | long chest w | long low chest with open lid; opening line y≈60; same split |
| `items/sign.svg` | 0 0 128 112 | ≈0.55×chest w | driftwood sign on a stake with a tiny starfish; **blank board x 12–116, y 10–78**; stake bottom (64, 112) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | 28–120 | gold star / grey outline star |
| `ui/pearl_icon.svg` | 0 0 64 64 | 28 | pearl counter icon |
| `ui/trophy_<bronze|silver|gold>.svg` | 0 0 128 128 | 90–140 | treasure-chest trophy with 1/2/3 stars on the lid |
| `ui/lagoon_<1..6>.svg` | 0 0 160 160 | 120–150 | round map badges: shell beach, coral garden, pearl cave, friends bay, sunken ship (friendly, no skulls), rainbow reef |
| `ui/lock.svg` | 0 0 64 64 | | soft rounded padlock |
| `avatars/<turtle|crab|octopus|seahorse|clownfish|dolphin>.svg` | 0 0 128 128 | 110–160 | round sticker faces for profiles (face only, sticker border) |
| `icon.svg` | 0 0 512 512 | app icon | Tutu's face + an open treasure chest on turquoise water, full-bleed, no transparency |
Shapes (circle, square, triangle, star, heart, rectangle) are drawn **by code** (render.js) as flat "gem" treasures.

### 4.2 Sea friends — character artist B (all 0 0 128 128, centred, ≈110 px, sticker border, must read at 64 px)
`items/animal_<crab|octopus|seahorse|clownfish|dolphin|jellyfish|starfish|whale|puffer>.svg` — round orange-coral crab
(use `#F08A5D`, not the orange answer `#FF9A2E`) with mitten claws, lilac octopus (`#B48AD6`, lighter than purple answer), golden
seahorse (`#E9B949`, duller than yellow), clownfish (muted orange `#F2925A` + white bands), blue-grey dolphin (`#7FA8C9`, far from
answer blue), pink translucent jellyfish, pink-peach starfish, blue-grey whale, round pufferfish (soft bumps, yellow-green `#CFD36A`).
Also **`characters/fish_photobomb_a.svg`, `fish_photobomb_b.svg`** (0 0 256 128): a silly wide-eyed fish with big lips, facing RIGHT,
two frames (mouth closed / open), for the "photobomb" fly-by. And **`characters/crab_dance_a.svg`, `crab_dance_b.svg`**
(0 0 128 128): the giggling crab from under a mound, two dance poses.

### 4.3 Environment — environment artist (bottom-anchored, **horizontally tileable**, transparent above)
| File | viewBox | Parallax | Notes |
|---|---|---|---|
| `env/far.svg` | 0 0 1200 420 | 0.15 | distant reef silhouettes and a soft sunken-ship shape, pale blue-teal, very low contrast |
| `env/mid.svg` | 0 0 1200 360 | 0.35 | coral clusters (muted pink/lilac), kelp (muted olive), round rocks, a sleepy anemone |
| `env/ground.svg` | 0 0 1200 260 | 1 | sand floor; top edge ≈ y 40 drawn at `layout.groundY - 30`; ripples, a few tiny shells, down to 260 |
| `env/sun.svg` | 0 0 200 200 | — | sun seen through water: soft disc + wobbly rays (no face) |
| `env/moon.svg` | 0 0 200 200 | — | moon through water, soft glow |
| `env/cloud1..3.svg` | 0 0 300 160 | — | reused as **drifting surface light blobs / plankton clouds**, white-cyan, very soft |
Particles `particles/` (0 0 32 32, centred): `bubble1`, `bubble2`, `sparkle`, `star` (twinkle), `plankton` (glow dot), `sand`
(sand puff), `fishlet` (tiny fish silhouette), `confetti_a`, `confetti_b`.
Times of day (water gradient + light shafts drawn by code from `weather.ambient`): 0 morning (pink-peach shafts, calm), 1 noon
(bright turquoise, bubbles, a shoal of fishlets passing), 2 sunset (orange-pink top, violet bottom), 3 night (navy, moon, twinkling
`star` particles near the surface, glowing plankton, slow bubbles). `weather.ambient.aurora` is reused as **plankton glow 0..1**.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` | voice & input engineer |
| `progress.js`, `storage.js` | progress engineer |
| `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, progress, assets, audio, voice, input, render, ui, main.

### 5.1 Content (`content.js` → `TR.Content`)
```
TR.PALETTE, TR.ANIMALS = ['crab','octopus','seahorse','clownfish','dolphin','jellyfish','starfish','whale','puffer']
TR.LAGOONS = [ {id:1, key:'beach'}, {id:2, key:'coral'}, {id:3, key:'cave'}, {id:4, key:'bay'}, {id:5, key:'ship'}, {id:6, key:'rainbow'} ]
TR.Content.planFor(age, lagoon) → [{ topic, mech:'dig'|'drag', n? }, ×4]   // chapters of a lagoon (REQUIREMENT table; 'mixed' rows pick 4 distinct topics the age knows, deterministic)
TR.Content.topicsFor(age) → planFor(age, 1).map(c => c.topic)              // kept for old tests
TR.Content.makeRound(topic, { age, lang, rng, roundIndex, layout, mech, prev }) → round   // pure, deterministic, self-checks completable
TR.Content.makeTalk(topic, { age, lang, rng }) → talk
TR.Content.validate(round) → null | 'error'
TR.WORDS = { en:[{word, sprite, initial}], vi:[…] }   // sea-animal sprites only
```
Topics (`colors, shapes, size, count, animals, letters, lower, initial, add, sub, oddeven`) keep Snow Garden's content rules
(targets per age, colour-blind pairs, warm-up round, no identical rounds). Differences:
- `mech:'drag'` → modes `sort` / `count` / `ask` exactly as before; sprites `shell_<color>`, `pearl` (count rounds, one colour = pearls),
  `tag` (plain), procedural shapes (`sprite:null, shape, color`); `kind:'chest'|'long'`.
- `mech:'dig'` → **mode `'dig'`**: `round.mounds = [{ id, x, y, item }]` placed on `layout.moundGrid` (4–6 mounds; warm-up 4), each
  `item` as in the items array (same fields, `answer` = chest id or null). One chest (or 2–4 labelled chests for sort-like dig rounds
  where the prompt names one target at a time). `round.queue = [itemId, …]` = the targets in order (warm-up 1, then 2–3; count: N pearl
  ids, extra mounds hold pearls too but only N are needed → `need:N`). Optional `round.crab = moundId` (≤ 1 per round, never in the
  warm-up, never when mounds ≤ 4): a mound that hides the giggling crab instead of an item (free surprise). Prompts `p.dig.<topic>`
  ("Dig up the {color} shell!", "Dig up {n} pearls!", "Find the {animal}!", "Dig up the letter {letter}!").
- `initial` words: **en** crab C · octopus O · seahorse S · clownfish C → use "fish" F · dolphin D · jellyfish J · starfish S · whale W · puffer P;
  **vi** cua C · bạch tuộc B · cá ngựa C · cá hề C · cá heo C → keep distinct initials per round · sứa S · sao biển S · cá voi C · cá nóc C
  (vi rounds use at most one "cá" word; never ch/th/ng split).
Round object:
```
round = { topic, mech, mode:'sort'|'count'|'ask'|'dig', promptKey, params,
  baskets:[{ id, label:{type,value}, need?, kind:'chest'|'long', x, y, w, h, top, bottom }], queue?, crab?,
  mounds?:[{ id, x, y, w, item }],
  items:[{ id, sprite|null, shape?, color?, text?, scale, size, nameKind, nameValue, answer|null, gem /*palette key for sparkle*/ }] }
talk = { promptKey:'talk.<topic>', params, show:{ sprite|null, shape?, color?, text?, count? }, choices:[{id, kind, value}], answerId }
```
Talk time per topic as before; `animals` → "Where is the {animal}?" with 3 animal picture choices.

### 5.2 `TR.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s) — API as Snow Garden §5.2 plus:
- `new TR.World({ seed, age, lang })`; `setAge`, `setLang`; **`newSession({ lagoon, plan, startLevel })`** — `plan` from
  `Content.planFor`; `startLevel(i)`; `levels` = plan topics; `w.plan[i].mech` is the chapter mechanic; `w.lagoon`.
- `w.tutu { mood, moodT, lookX, lookY, hop, dance }` (was `w.lumi`); `dance` 0..1 during `levelDone`.
- **Landing (drag):** on `land` the item stays `state:'in'` with a settle bounce (`item.settle` spring 0→1, overshoot) and emits
  `sparkle {id, basketId}`; count rounds emit `count {n, need}` on each land (the helper counts aloud). Round end 0.5 s after the last land.
- **Dig mode:** `w.mounds[] = { id, x, y, w, h, state:'buried'|'peek'|'open'|'gone', item, wiggle, puff, crab }`; the item of a buried
  mound is drawn poking out (top `cfg.peekFrac`≈0.42 of the item visible above the mound top; the renderer clips the rest with the
  mound sprite in front). `pointerDown` on a mound with no drag → `tapMound(id)`:
  - target (`item.id === queue[0]`, or in count mode any pearl while `found < need`) → event `dig {moundId, itemId, correct:true}`, mound
    `open` + `puff` burst, item pops up (ballistic hop, apex ≥ 90 px) then arcs into the chest (`fly` → `land`), `correct`, queue shifts
    (event `ask`-like **`next {itemId, promptKey, params}`** when a new target starts; count: `count {n, need}`).
  - wrong → `dig {…, correct:false}`, mound `peek` (item rises fully for 1.1 s, `wiggle` shake), event `wrong {moundId, itemId}` with
    the item's name kind/value, then back to `buried`; `roundMistakes++`; after 2 misses in a round `hint()` glows the target mound.
  - crab mound → `crab {moundId}`: mound opens, the crab pops out and dances 1.6 s, then scuttles off (`gone`); not a mistake.
  - A finger that moves > 24 px before release does nothing (no drag in dig mode).
- Events (all with `type`): `session, level, round, next, ask, appear, grab, drop, correct, land, sparkle, count, wrong, miss, tap, dig,
  crab, hint, idle, roundDone, talk, talkAsk, talkResult, levelDone, sessionDone, photobomb {dir}` (world emits `photobomb` after
  every 3rd correct of a chapter, ≤ 2 per chapter; the renderer animates it).
- Motion as before: spring-follow drag (ω≈28) with pendulum tilt, ballistic arc into the slot (apex ≥ 60 px), landing squash + chest
  lid `squash`, wrong-drop chest `shake` + arc home, miss float home, staggered back-overshoot appear, idle bob + wiggle; mounds
  `breathe` ±2 % slowly so the scene is alive.
- `sessionDone` carries `{ stars, lagoon, levelStars:[4], pearls }`; `levelDone` carries `{ level, stars, mech }`.
- Pearls are computed in the world: `w.pearls` (+1 correct, +5 roundDone, +10 levelDone, +25 sessionDone), event `pearl {n, total}`.

### 5.3 `TR.Weather` — as Snow Garden §5.3 (`setWeather(0..3)`, `ambient {skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX,
sunY, moon, stars, aurora→plankton, darkness}`), underwater particle sets: morning sparkles rising slowly, noon bubbles + a fishlet
shoal (`layer:'back'`), sunset slow bubbles lit warm, night twinkle stars at the top + plankton glow dots. `weather.shafts[] {x, w,
alpha, phase}` light shafts for the renderer. Cap 140 particles.

### 5.4 `TR.Bot` — as before for drag; in dig mode it taps the target mound (skill → chance to tap a wrong mound first), and in
ask/dig-sort it follows `w.queue[0]` / `w.target`.

### 5.5 `TR.Progress` (`progress.js`, pure data over `TR.Storage`)
```
TR.Progress.load() / save()
profiles: [{ id, name, sayAs /*optional, how to pronounce the name in English*/, age, avatar, lang?, created,
            lagoons: { [lagoonId]: { stars:[s0,s1,s2,s3] /*best per chapter, 0..13*/, done:bool, best:int } },
            pearls, totalStars, playSeconds, resume: { lagoon, level, levelStars:[…], pearls } | null }]
current: profileId
API: list(), get(id), current(), setCurrent(id), create({name, age, avatar, sayAs}), update(id, patch), remove(id),
     ensureDefault()  // creates "Mầm", age 4, avatar 'turtle', sayAs 'Mum' when there are no profiles
     unlocked(p, lagoonId) → bool  (lagoon 1 always; k unlocked when k-1 done)
     recordChapter(p, lagoonId, level, stars, pearlsDelta), recordLagoon(p, lagoonId, levelStars), setResume(p, r|null),
     trophy(p, lagoonId) → null|'bronze'|'silver'|'gold'  (done & stars ≥ 20 → silver, ≥ 32 → gold /* of 52 */), addTime(p, s)
```
Settings (`tr:settings`): `{ lang, sfx, music, voice, mic, volume 0..100 }` — no name/age there any more (they live in the profile).
URL flags never saved.

### 5.6 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&lagoon=N&level=N&novoice=1&skill=x&profile=test`
(`profile=test` uses an in-memory profile so sims never touch saved progress). `window.TR.debug = { world, weather, mode, stats,
getState(), setSpeed(n), startGame(lagoon), goTitle(), goMap(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog,
progress }` (live getters via `Object.defineProperties`).

## 6. Voice, language, input
- Helper **Tutu** ("Tutu" in both languages), a bubbly baby turtle: pitch ≈ 1.2, rate ≈ 0.95 (she is quick — keep lines short).
- **Child's name:** `I18N.t` keeps `{child}`; `Voice.say(text)` splits the text at the child's name and speaks the name segment with
  the best **vi-VN** voice when the name contains Vietnamese letters (or `sayAs` is empty), else with the current voice using
  `sayAs`. Segments are one queue item (no gap > 120 ms; iOS: chain `onend`). `Voice.setChild({ name, sayAs })`.
- `Voice.setVolume(0..1)` applies to utterances; `Audio.setVolume(0..1)` to the master gain (see §7).
- Keys: `p.<topic>` (drag), `p.dig.<topic>`, `p.next.<topic>` ("Now the {color} one!"), `say.dig[]` ("Poof!", "Found it!"),
  `say.crab[]` ("Hehe, a crab!"), `say.photobomb[]` ("Hello fish!"), `say.correct.<labelType>`, `praise[]`, `great[]` (with `{child}`,
  ≥ 8 variants per language), `wrong[]` (never negative words), `miss[]`, `hint[]`, `idle[]`, `talk.*`, `weather.0..3`,
  `lagoon.<key>.name`, `lagoon.<key>.intro`, `ui.*` (profiles: `ui.whoPlays`, `ui.newProfile`, `ui.sayAs`, `ui.avatar`, `ui.map`,
  `ui.treasure`, `ui.locked`, `ui.resume`, `ui.volume`, `ui.louder`, `ui.quieter`, `ui.lagoonDone`, …).
- Vietnamese: warm "Mầm ơi, … nhé!", classifiers ("con cua", "quả ngọc trai", "cái vỏ sò"), counting "một, hai, ba…".
- `input.js`: kidProof, `attach` with (x, y, ev) logical px, `holdButton` (2 s parent gate), `tapOrHold` unchanged.

## 7. Integration (lead)
Screens (DOM): **title** (Tutu waving, ▶ Play, language toggle, hold-⚙) → **profiles** ("Who is playing?": avatar cards, + add
behind the gate) → **reef map** (6 lagoon badges on a winding path, stars under each, lock on the next ones, Resume ribbon,
Treasure Room button) → play (HUD: stars, pearls, dots, pause) → chapter banner → Talk time → **lagoon done** celebration
(trophy, stars, pearls, "Next lagoon" / "Map") → map. **Treasure Room**: 6 trophy slots, totals. **Settings** (gate): language,
volume slider, sfx/music/voice/mic, profiles (edit name, say-as, age, avatar, delete).
Audio: master `GainNode → DynamicsCompressor (threshold −18 dB, ratio 4, makeup) → destination`, default volume 1.0; funny synth
SFX: pop, boing (sine slide up with vibrato), kazoo (saw + formant), slide whistle, bubbles, sand poof (filtered noise), rising counting
chimes, star dings, chapter dance tune (fast, 2 bars), lagoon fanfare; music per time of day (bouncy marimba by day, music box at night);
bubbles ambience; ducking under speech.

## 8. Performance — as before; mound/item clipping uses sprite layering, not canvas clip paths (cheap on iPad).
