# Mimi's Splash Rocket — Voice, language and input

Files: `game/js/i18n.js` (`DK.I18N`), `game/js/voice.js` (`DK.Voice`), `game/js/input.js` (`DK.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 90 000 checks, self-contained, exits non-zero on failure): identical key
sets, **identical `{params}`** and the same number of wordings in en / vi; every `ui.*` key that `index.html` / `ui.js` /
`main.js` / `render.js` use (legacy `ui.tapNim` excepted while main.js is rewritten); 3 wordings + `.first` for every
prompt (one target per launch); every prompt × value × first × wording × with / without the child's name (≈ 3 500);
Vietnamese diacritics, a warm "bé … nhé / nhỉ / nào" + "tên lửa … đáp / bay / phóng" in every VI prompt, "land / fly /
launch" in every EN wording; classifiers; a negative-word ban and a **base-game word ban** (Nim, hedgehog, nhím, brook,
suối, stone, hòn đá, spines, fruit, trái cây, Bim, outer space …) on every string, every rendered line and the three source
files; tidy rendering (no `{x}`, "undefined", "NaN", no "a orange", capital after a stop); every name kind × value
(incl. mug, lantern, pinecones, flags, moods, marmot / goat / bird); `words()` (no form shared by two values, with and
without diacritics) matched back by the matcher + 25 noisy kid answers; DESIGN §6 example lines exactly; a sweep of ≈ 20 000
right / next / pennant / wrong lines (every thing kind × rule × launch × streak × wording); the **pump-count policy** with a
fake `speechSynthesis`; the input layer (fake DOM, rapid taps, two-finger pumping); the parent gate; voice queue /
interrupt / log / unlock / volume / speed; the recognizer. When the rocket `content.js` exists (rounds with `launches`) the
test renders the ask, every right / next / pennant line of every target and the wrong line of every other mat of ≈ 160
`makeRound` rounds (ages 3–7, EN + VI) + every `makeTalk` question; a river `content.js` or one that does not load is
skipped with a note (content.js is never edited from here).

## 0. Wording principles (Mimi)
- **Mimi** is a cheerful fluffy duckling camping in the mountains with her water-bottle rocket. EN "Mimi"; VI lines
  **"Mimi"** ("Mình là vịt Mimi"), titles **"Vịt Mimi"** (only `ui.title`, `ui.logo1` — tested). Title "Mimi’s Splash
  Rocket" / "Tên Lửa Nước Của Vịt Mimi"; logo lines "Mimi’s" / "Splash Rocket", "Vịt Mimi" / "Tên Lửa Nước"; `ui.voice`
  "Mimi’s voice" / "Giọng của Mimi". **TTS: no rewrite** — "Mimi" is two ordinary syllables in both voices. Mimi quacks
  ("Quack!" / "Cạp cạp!") in `poke`, `party`, `idle`.
- **Positive only**, no "not" in any game line (tested). Banned: no / nope / wrong / incorrect / bad / fail / mistake /
  oops / sorry / don’t and sai / sai rồi / dở / tệ / hỏng / không đúng / chưa đúng / không phải / trật / nhầm / hư.
- **Things (VI: classifier + noun, colour AFTER the noun)**: bông hoa, cây nấm, quả bóng, **cái cốc** (mug), **chiếc đèn
  lồng** (lantern) — "cái cốc màu đỏ", "cây nấm nhỏ màu xanh lá"; shapes hình tròn, hình vuông, hình tam giác, ngôi sao,
  trái tim, hình chữ nhật, hình thoi, hình bầu dục; pinecones **"4 quả thông"** / "4 pinecones" ("1 pinecone"); signs
  "chữ B", "chữ a thường", "3 + 2", "số 7"; animals as the base (con bò … chim cánh cụt, sư tử, bể cá vàng; home-line
  subject "bạn cá vàng"); mat **"tấm thảm"**, sign **"tấm biển"**, rocket "tên lửa", parachute "dù", pump "bơm",
  flagpole "cột cờ", pennant / flag "lá cờ". EN: "a red mug", "an orange lantern", "4 pinecones", "letter B", "small a".
- **Moods** (weather 0..3): sunny / breezy / rain / rainbow → name kind `mood` ("sunny", "windy", "rainy", "rainbow" /
  "trời nắng", "trời gió", "trời mưa", "cầu vồng").
- **Surprises** (name kind `surprise`): marmot "marmot" / **"bạn sóc đất"** (a marmot is a big ground squirrel; Vietnamese
  has no everyday word — "mác-mốt" is unknown to a 4-year-old, so the kid-friendly "sóc đất"; the mic also accepts "mác mốt",
  "marmot"), goat "mountain goat" / "bạn dê núi", bird "little bird" / "bạn chim nhỏ".
- **Right lines** name the thing, then the pump cue: "A red mug! Now pump!" / "Cái cốc màu đỏ! Giờ bé bơm nhé!"; homes
  teach the home ("The penguin lives on the ice! Now pump!"); countSeq "Number 2! Now pump!"; countSel "4 pinecones! Now
  pump!" (the pinecones are counted aloud later, at collect). `e.pump === false` → no tail.
- **Wrong lines** name what was tapped, then the goal: "That’s a blue mushroom. Find a red one!" / "Đây là cây nấm màu xanh
  dương. Mình tìm cái màu đỏ nhé!"; countSel "That’s 3 pinecones. Find the sign with 4 pinecones!"; countSeq "That’s 4.
  Which one is 2?" / "Đây là số 4. Số 2 đâu nhỉ?".
- Numbers in prompts / names are **digits** (the signs show numerals; TTS reads them). Count runs use words.
- **Child's name**: `setChild(name)`; empty → `{child}` variants skipped, "bé {child}" → "bé".
- **Initials (age 6–7)**: objs EN flower F, mushroom M, ball B, **mug M**, lantern L; VI hoa H, nấm N, bóng B, **cốc C**,
  **đèn lồng D** (Đ → D). Note for content.js: EN mushroom and mug share **M** — never both in one initial-letter launch.

## 1. API (`DK.I18N`) — for main.js
All helpers never throw (also with `null` events) and never return a raw `{x}`; `rng` is optional (`rng.next()`, a
function, or Math.random). Events = the world event + main's context `{topic, promptKey, params, rule, mode}` (`ev2(e)`:
thing from `world.matById(e.id).thing`). **countSeq: the number of a launch is `e.need | e.count | e.launch + 1 | e.row + 1`
— never `params.n` / `rule.value` (that is k).** `row` is still accepted as an alias of `launch`.

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | a random variant; raw params are named (`{color:'red'}` → "red" + `{COLOR}` "RED" / "màu ĐỎ", `{shape}`, `{animal}`, `{home}` → "on the farm", `{n}` + `{num}` "three" + `{seq}` "1, 2, 3" + **`{seqThen}` "1, then 2, then 3" / "1, rồi 2, rồi 3"** + `{dotWord}` "pinecones" / "quả thông", `{mood}`, `{thing:{…}}` → "a red mug") |
| `ask(lang, promptKey, params, {first, rng})` | the question, **once per round before launch 0**. `first` → "Let’s launch the rocket! Land on the RED one!" / "Mình phóng tên lửa nào! Bé cho tên lửa đáp xuống thứ màu ĐỎ nhé!". Unknown / missing → `p.any` "Land on a mat!" |
| **`sayNext(lang, e, rng?)`** | `next {launch, left}` → "Next one: red!" / "Tiếp nè: màu đỏ nhé!"; countSeq "Now 2!" / "Giờ tới số 2 nào!"; home "Next one: who lives on the farm?"; countSel "Next one: 4 pinecones!"; no rule → `next.any` "Next one!" |
| `sayRight(lang, e, rng?)` | `right {thing, launch, k, left, home?, count?}` → name + pump cue (§0) |
| **`sayPump(lang, n, from?)`** | "One!", "Two!", "Three! Blast off!" / "Một!", "Hai!", "Ba! Bay nào!"; `from < n` merges: `sayPump('en', 3, 2)` → "Two, three! Blast off!". Voice.sayPump uses it (§2.1) |
| **`sayPennant(lang, e, rng?)`** | `pennant {thing, slot}` → "The red mug on the flagpole!" / "Hooray, the red mug!" / "Cái cốc màu đỏ lên cột cờ rồi!" (+ `{child}` variant); no thing → `pennant.any` |
| **`sayCountUp(lang, n, kind)`** | the whole count as ONE line: "One, two, three, four! Four pinecones!" / "Một, hai, ba, bốn! Bốn quả thông!" (kind `pinecones` default, `flags`, `mats`) |
| **`sayCamp(lang, n, rng?)`** | "All our flags! One, two, three! Three flags!" / "Cờ của mình nè! Một, hai, ba! Ba lá cờ!" |
| `sayWrong(lang, e, rng?)` / `sayWrongHint` | names it + the goal / + "Look at the shiny mat!" |
| `sayCount(lang, i)` | "One!" … "Twenty!" |
| `sayCountRun(lang, n, kind)` | "Four pinecones!", "Three flags!" / "Bốn quả thông!", "Ba lá cờ!" (`pinecones`, legacy `dots`, `flags` / `pennants`, `mats`) |
| `countList(lang, n)` / `seqList(n)` / **`seqThen(lang, n)`** | "One, two, three, four!" / "1, 2, 3" / "1, then 2, then 3" |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the red mug"; opts `{art, color, size, who}` |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapes, obj (toy), objWord, thing, dots / pinecones, flags, mats, animal, animals, word, who, home, homeAt, lives, number / n / seq, letter, sum, diff, parity, size, mood / weather / season, surprise, text / tile` |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms (lower-case + no-diacritic; numbers: digits, "số ba", "four pinecones", "4 quả thông"; obj aliases cup / ly / tách → mug, lamp / đèn / lồng đèn → lantern) |
| `talkWrong(lang, choice, talk?)` | "It is blue! Good try!", "There are 4 pinecones! Good try!", "The penguin lives on the ice! Good try!" |
| `speech(lang, text)` | TTS text: letter names, + − =, "…" → ", ", ALL-CAPS → lower-case, vi "chữ B" → "chữ bờ" |
| constants | `langs, TOPICS, COLORS, SHAPES, OBJS (TOYS alias), ANIMALS, HOMES, MOODS, SURPRISES, ANIMAL_HOME, RULE_KINDS, THING_KINDS, PROMPTS, PARAMS, NAME_TABLE, NOUN, LETTER_VI, MAX_COUNT, PUMP_COUNT (3)` |

Gone (base game): `FRUITS`, `sayFruit`, keys `rise, ahead, bank, fruit, fruit.any, right.next, right.last,
surprise.fish / frog / snow, fish.tap / frog.tap / snow.tap, ui.tapNim`. Renamed: `ui.tapNim → ui.tapMimi`; `SEASONS →
MOODS`. Kept: every Talk key, `wrong.*`, `goal.*`, `hint`, `idle`, `praise`, `great`, `party`, `session.done`, `count.0..20`.

### 1.1 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice, mic, done, stars, chapter {n},
  allDone {stars}, welcome {child}, micUnsupported, micDenied, voiceMissing, tapOrSay, listening, tapMimi, tapHint,
  pumpHint ("Tap anywhere to pump!"), doorHint, skip, gallery ("Our flags" / "Lá cờ của bé"), langName.en/vi`.
- **topic.\***: colors "Colour Landing" / "Đáp xuống sắc màu", shapes "Shape Landing" / "Đáp xuống hình khối", size,
  count "Pinecone Counting" / "Đếm quả thông", animals "Animal Homes", letters "Letter Landing", lower, initial, add, sub,
  oddeven.
- **weather.0..3** (2 wordings, the first canonical): "A sunny day at camp!", "Whoosh, it’s windy!", "Pitter-patter, rain!
  Ducks love rain!", "Look, a rainbow!" / "Một ngày nắng đẹp ở khu cắm trại!", "Vù vù, trời gió rồi!", "Lộp độp, trời mưa!
  Vịt thích mưa lắm!", "Nhìn kìa, cầu vồng!".
- **Prompts** (3 wordings + `.first`): `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape}`, `p.size {big}`,
  `p.countSeq {n}` ("Land on 1, then 2, then 3!"), `p.countSel {n}` ("Land on the sign with 4 pinecones!"), `p.animal
  {animal}` ("Fly to the cow!"), `p.home {home}` ("Who lives on the farm? Land there!"), `p.letters`, `p.lower`,
  `p.initial {letter}`, `p.add`, `p.sub {n}`, `p.oddeven {parity}`; `p.any`.
- **Launch lines**: `next {what}`, `next.home {home}`, `next.seq {n}`, `next.any`; `right.thing / home / initial / sum /
  diff / parity / seq {n} / pump / any`; `pumpAsk` ("Pump, pump, pump!" / "Bé bơm đi nào!"), `pumpAuto` ("I’ll help!" /
  "Mimi giúp bé nhé!"), `pump.blast` ("Blast off!" / "Bay nào!"), `chute` ("Parachute!" / "Bung dù!"), `land`
  ("Touchdown!" / "Đáp rồi!"), `pennant {thing}`, `pennant.any`, `camp` ("All our flags!" / "Cờ của mình nè!"),
  `unfold` ("Look, picnic mats!"), `wipe` ("Swoosh! New mats!").
- **Feedback**: `wrong.is / dots / seq / livesAt / starts / expr / parity / hint / any`, `goal.*`, `hint`, `idle {child}`,
  `poke` ("Quack! That tickles!" / "Cạp cạp! Nhột quá!"), `praise`, `great {child}`, `party`, `session.done {stars}`.
- **Surprises**: `surprise.marmot`, `marmot.tap`, `surprise.goat`, `goat.tap`, `surprise.bird`, `bird.tap`.
- **Talk**: as the base; `talk.count` "How many pinecones?" / "Có mấy quả thông nào?".

## 2. Voice (`DK.Voice`) — the proven engine, Mimi's pitch, + the pump count
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**), `say(text, {interrupt, priority, prompt, tag, rate, pitch, lang}) →
Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise `.text`), **`sayPump(n, {lang, auto, from})`** (promise
`.text`), **`resetPump()`**, `stop()`, `dropQueued()`, `dropTagged(tags)`, `queuedTags()`, `currentTag()`, `isSpeaking()`,
`hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`, `onVoicesChanged(fn)`, `log` (+ `DK.debug.voiceLog`) —
**every line**, also when muted / at test speed, `spoken(lang, text)`, `RATE` 0.9 / **`PITCH` 1.25**, `PUMP_RATE` 1.0,
`PUMP_STALE_MS` 2500, `PUMP_CUTS`, `canListen()`, `listen({lang, choices, timeoutMs})`, `stopListening()`,
`isListening()`, `onListen(bool)`, `match(…)`, `matchDetail(…)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium preferred; Apple novelty voices (Bubbles, Zarvox, Fred …) avoided.
- Mimi: **rate 0.9, pitch 1.25** (a little duckling: brighter than Nim's 1.2; above ≈ 1.3 iOS voices go robotic, rate
  < 0.85 smears Vietnamese tones).
- Queue: 1 speaking + ≤ 2 waiting normal lines (oldest dropped; > 5 s old skipped); priority lines kept up to 6 waiting,
  never the prompt; `interrupt` flushes + cancels and speaks after 50 ms (90 ms on iOS); watchdog for a missing `onend`;
  Chrome desktop keep-alive (pause/resume every 10 s); page hidden → stop. Before `unlock()` only the newest line is kept;
  a `not-allowed` refusal waits for the next `unlock()`.
- Recognition: fuzzy matcher (exact / no-diacritic tokens, number words → digits, edit distance 1–2 for long single words,
  ambiguous → no match, interim matches wait 450 ms). Talk time only; the mic is hidden when `!canListen()`.

### 2.1 The pump count policy (`sayPump`) — tested
The child stomps 3 times (any tap); each stomp is `pump {n, auto?}`. main calls `DK.Voice.sayPump(e.n, {lang, auto: e.auto})`
**instead of** `say` for these:
1. Pump lines are **priority**, tag **`'pump'`**, rate 1.0 (brisker, so the count keeps up with the stomps), Mimi's pitch.
2. **A pump line never cuts another pump line** — "One!" always finishes.
3. **Fast pumpers: merge, never lag, never skip.** A new number while an older pump line still *waits* (not started)
   replaces it with ONE line covering both: "Two!" waiting + pump 3 → **"Two, three! Blast off!"**. At most one pump line
   ever waits, so the voice is never more than one short line behind; every number is said once; **"Blast off!" is always
   said with the 3rd number** (`I18N.sayPump(lang, n, from)`).
4. A pump line **cuts** a current line whose tag is in `PUMP_CUTS` (`right` — its "Now pump!" is moot once the child pumps
   — `pumpAsk, pumpAuto, flavour, tap, idle, hint, next, poke, pennant, land, chute, unfold, wipe, surprise`, untagged); it
   **never cuts** `prompt`, `wrong`, `count` or `pump`: then it waits at the **front** of the queue (after a waiting prompt).
5. A pump line that could not start within **2.5 s** is dropped (`stale`: the rocket is already flying).
6. `auto: true` (Mimi pumps by herself after 3 s): the first auto pump of a sequence gets the `pumpAuto` head ("I’ll help!
   Two!"); if that line is merged before it started, the merged line keeps the head.
7. `n === 1` (or a number ≤ the last one) starts a new sequence and drops the old sequence's waiting line; `resetPump()`
   does it explicitly (e.g. on `launch`).
8. Speed > 1 / voice off: logged only (`DK.debug.voiceLog`), like every line.
main must treat a playing / waiting `'pump'` line like a count line: no `interrupt: true` from other feedback during the pump
phase (nothing else should speak then anyway — the world is not interactive except for pumping).

## 3. World event → line (DESIGN §5.2) — what main.js must do
**Speech policy** (proven in the sister games, carried over):
1. **Prompts are protected** (`speakPrompt`: `priority, prompt, tag 'prompt'`): the guard lasts from its start until its
   promise resolves (+150 ms); fallback 600 ms + 95 ms × chars. While protected, feedback queues behind it. The `next`
   reminder is spoken the same way (it is the question for that launch).
2. **Count lines are queued and never cut**: the countSel collect run and the camp run are `priority, tag 'count'`,
   guarded from their start (600 ms + 95 ms × chars + 400 ms). The pump count follows §2.1 (tag `'pump'`).
3. **The wrong line** is `priority, tag 'wrong'`, protected from its start; ≤ 1 per 1.5 s; the same mat again (`squish`)
   is silent.
4. **Mimi / surprise taps never cut a protected / count / pump line**: tap lines only when nothing speaks; ≤ 1 per 2 s.
5. **Praise is rate-limited** (≥ 1.2 s apart). **The pennant line is the launch's praise.** Rare lines (`unfold`, `chute`,
   `land`, `wipe`) are droppable and only when nothing speaks.
6. **A question is repeated only while it can be answered** (`world.interactive && phase === 'play'`). Speech is log-only
   for `speed > 1`.

Flags: **I** interrupt · **Q** queue · **P** protected (guarded from its start) · **D** droppable (only when nothing speaks /
dropped by the next ask) · tag in `code`.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+weather)` | I, then Q; `flavour` (dropped by `ask`) |
| `round {round, surprise}` | bubble text `t('unfold')` (shown, not spoken) | — |
| `unfold {id}` | — (cloth "fwump"); the chapter's very first unfold of round 0: `t('unfold')` rarely (≤ 1 per chapter, 40 %) | D `flavour` |
| `ask {promptKey, params, first}` | `ask(lang, promptKey, params, {first})`; bubble + voice; remember it for `pokeMimi` / `idle` | **P** prompt; drops `flavour`, `right`, `pennant` |
| `next {launch, left}` | `sayNext(lang, ev2(e))` ("Next one: red!", countSeq "Now 2!"); remember it as the current prompt text | **P** (as a prompt, tag `prompt`); drops `pennant` if not started |
| `right {id, thing, launch, k, left, home?, count?}` | `sayRight(lang, ev2(e))` → "A red mug! Now pump!" | Q behind a protected prompt, else I; tag `right` (the first pump cuts it) |
| `aim {id}` | — (ratchet click) | — |
| `pumpAsk` | bubble `t('pumpAsk')`; spoken only if nothing speaks 1.2 s later and no pump came yet | D `pumpAsk` |
| `pump {n, auto?}` | `Voice.sayPump(n, {lang, auto})` → "One!" "Two!" "Three! Blast off!" (merged when fast) | **§2.1** tag `pump` |
| `launch {id}` | — (water WHOOSH); `Voice.resetPump()` | — |
| `whoosh` | — | — |
| `chute` | `t('chute')` **rarely** (chapter's round 0, first launch only), only when nothing speaks | D `chute` |
| `land {id}` | `t('land')` **rarely** (≤ 1 per round, 30 %, never in countSel), only when nothing speaks | D `land` |
| `splash` | — ("pomf" + splash) | — |
| `fold {id}` | — (cloth flap) | — |
| `count {i}` (collect, countSel) | on `i === 1` only: `sayCountUp(lang, n, 'pinecones')` ("One, two, three, four! Four pinecones!") — n = the thing's pinecones; later `count` events: pip only | **P** count, Q |
| `homeBadge {home}` | — (badge chime; the right line named the home) | — |
| `pennant {id, slot, thing}` | `sayPennant(lang, ev2(e))` ("The red mug on the flagpole!") — the launch's praise; **skipped in countSel** (the count run was the praise) and when a `next` / `ask` is already waiting | Q, D `pennant` |
| `hopBack` | — (boing) | — |
| `camp` | `sayCamp(lang, pennants.length)` ("All our flags! One, two, three! Three flags!"); the camp `count {i}` events (0.35 s) are pips only | **P** count, Q |
| `fountain` | — (sparkling spray) | — |
| `roundDone {stars}` | **no line** (stars fly) | — |
| `wipe {mood}` | `t('wipe')` rarely (chapter 1 round 0, then ≤ 1 in 4), only when nothing speaks | D `wipe` |
| `wrong {id, got, want, streak}` | `sayWrong(lang, ev2(e))`; the miss that brings the hint: `sayWrongHint`; countSeq "That’s 4. Which one is 2?" (pass `launch`) | I unless protected, then **P** `wrong`; ≤ 1 per 1.5 s |
| `squish` | — (same mat again within 1 s) | — |
| `soft {x, y}` | — (grass tick) | — |
| `pokeMimi` | phase play + interactive: repeat the current prompt / next line (not while it is still spoken); during a protected / count / pump line: queue it once; otherwise `t('poke')` ("Quack! That tickles!") only when nothing speaks | rule 4, tag `poke` |
| `hint {id}` | nothing when the wrong line already pointed at it; else `t('hint')` | Q priority `hint` |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, pause after the 5th); in the pump phase: `t('pumpAsk')` | Q `idle` |
| `marmot` / `marmotTap` | `t('surprise.marmot')` / `t('marmot.tap')` | Q `surprise` (never over a protected prompt) / tap rule 4 `tap` |
| `goat` / `goatTap` | `t('surprise.goat')` / `t('goat.tap')` | same |
| `bird` / `birdTap` | `t('surprise.bird')` / `t('bird.tap')` | same |
| `gust {dir}` | — (wind whoosh sfx) | — |
| pause → resume | play: the prompt / next line; pump phase: `t('pumpAsk')`; Talk: the question while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | Q, P |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | I |
| `talkResult` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` | I |
| `levelDone` | `t('great')` | Q |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | I, then Q |

**Headline rules for main.js**: one question per round (`ask`), a short `next` before every later launch; the right line
ends with "Now pump!" and is cut by the first stomp; stomps go through `Voice.sayPump` only; the pennant line is the
launch's praise; counts (countSel collect, camp) are ONE line each, never one line per `count` event; everything decorative
(`unfold`, `chute`, `land`, `wipe`, surprises) is rare and droppable.

**Input wiring**: `DK.Input.attach(canvas, { …, rapidTaps: () => world.state === 'round' && world.phase === 'pump' })` so a
child drumming two fingers on the pump gets every stomp (§4).

## 4. iOS / Safari findings (re-checked 22 Nov 2026)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+) — `Audio.unlock()` sets it. While the mic listens `voice.js`
  switches to `'play-and-record'` and restores the previous type afterwards.
- **First utterance inside a gesture**: `unlock()` in the first `pointerup` / `touchend` / `click` speaks a silent `' '`; a
  line refused with `not-allowed` is kept and spoken on the next `unlock()`; lines queued before the first tap are
  re-timestamped.
- **Voices (iOS 18 → 26)**: iOS 26 still ignores the voice the user picked in Spoken Content for web speech /
  AVSpeechSynthesizer (reported as a regression on the Apple forums), and downloaded Enhanced / Premium voices are often
  missing from `getVoices()` since iOS 18 — so `voice.js` always sets `utterance.voice` by name and never relies on the
  default. Vietnamese **Linh** is built in; if missing, parents install it in **Settings › Accessibility › Spoken Content ›
  Voices › Vietnamese**, then reload (`ui.voiceMissing`). The list fills late: `voice.js` polls `getVoices()` for 6 s.
  iOS 26 betas also misread some languages (Mandarin as Cantonese) with the default voice — another reason to pin
  `utterance.lang` + `utterance.voice`.
- **Short lines back to back** (the pump count): each `speak()` after `cancel()` needs a 50–90 ms gap on Safari or it is
  dropped (kept); a burst of one-word utterances queues fine, but iOS can delay `onstart` ~100–300 ms per utterance — the
  merge policy (§2.1) keeps the count in step instead of queueing three lines.
- **Speech recognition** (`webkitSpeechRecognition`) needs **Siri & Dictation** on, usually a network, and is **missing in
  Home-Screen mode** → `canListen()` false; `not-allowed` disables it for the session. `interimResults` on iOS Safari behave
  inconsistently (finals may repeat the interim text) — the matcher takes any final / the 450 ms-settled interim. After
  audio playback a recognizer may stop delivering results on the next cycle (reported again for 2025 Safari) and iOS
  26.1 betas had broken web audio input → a fresh recognizer per `listen()`, `Voice.stop()` before listening, a timeout
  always resolves, tap answers always work (the mic is only used in Talk time). `vi-VN` results often lack diacritics
  ("xanh duong", "den long") — the matcher compares stripped forms.
- WebKit: after backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on return. iPadOS desktop UA:
  `MacIntel` + `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4) — tested.

Sources: [Apple Developer Forums 804648 (iOS 26 voice regression)](https://developer.apple.com/forums/thread/804648),
[764438 (voices missing from Web Speech since iOS 18)](https://developer.apple.com/forums/thread/764438),
[792744 (iOS 26 beta reads Mandarin as Cantonese)](https://developer.apple.com/forums/thread/792744),
[775699 (unclear interimResults in iOS Safari)](https://developer.apple.com/forums/thread/775699),
[802555 (iOS 26.1 beta Safari audio input broken)](https://developer.apple.com/forums/thread/802555),
[SpeechRecognition + audio playback loop breaks after first cycle](https://chat.skool.com/quantum-quill-lyceum-1116/ios-safari-speechrecognition-audio-playback-loop-breaks-after-first-cycle),
[Readium: SpeechSynthesis in browsers and OSes](https://readium.org/speech/docs/WebSpeech.html), MDN `AudioSession.type`.

## 5. Input (`DK.Input`) — one-finger TAP, judged on pointer DOWN; every pump tap counts
```js
const detach = DK.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y), // the PRESS is judged at once (mat / Mimi / grass / a stomp in pump)
  move:   (x, y, ev) => world.pointerMove(x, y),
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation
  rapidTaps: () => world.state === 'round' && world.phase === 'pump',   // NEW: an extra finger = a new tap
  hover:  (x, y)     => {}
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event.** `down` fires synchronously inside `pointerdown` (`touch-action: none`, `preventDefault`, pointer capture) — no tap
delay, so **every quick tap is its own down/up** (tested: 12 taps on one spot → 12 downs + 12 ups, each preventDefault-ed:
no double-tap zoom, no merging; the world merges presses < 0.22 s itself). **One active pointer**: extra fingers are ignored
(a resting hand never taps a second mat) — **except with `rapidTaps` on**: then the old finger ends with `up()` at its last
point and the new finger begins with `down()` (two-finger drumming on the pump). A stuck pointer is recovered (new primary
touch, missing touch, silence ≥ `Input.STALE_MS` 6 s). Targets `button, .screen, #hud, .no-game-input` are skipped. Touch +
mouse fallback without `PointerEvent` (rapidTaps works there too).
- `kidProof()`: blocks pinch, double-tap zoom (CSS `touch-action: manipulation` + a < 320 ms touchend guard + `dblclick`),
  long-press callout / selection, rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
  `holdButton(el, ms = 2000, onDone, onProgress)` → `off()`: the parent gate (tested).
- Functional QA must drive **real CDP touch events** (a tap on a mat at `debug.matScreen(id)`, 3 fast taps on
  `debug.pumpScreen()`).

## 6. Adding a thing / a language
- New obj: `OBJS`, `NAMES.*.obj | objWord`, `WORDS.*.obj`, the test's `OBJS` / `VI_NAMES.obj` / `OBJ_INITIAL`. New animal:
  `ANIMALS`, `ANIMAL_HOME`, `NAMES.*.animal | animals | word | who`, `WORDS.*.animal`. New surprise: `SURPRISES`,
  `NAMES.*.surprise`, `WORDS.*.surprise`, keys `surprise.<x>` + `<x>.tap`.
- New prompt: `PROMPTS` + `p.x` (3 wordings) and `p.x.first` in both languages; the test's `PROMPT_VALUES`; a `nextWhat`
  branch for `sayNext`.
- New rule kind: `RULE_KINDS`, `goal.<kind>` in both languages, `sayRight` / `wrongIs` / `goalParams` / `nextWhat` branches.
- New language: `LANGS`, every `NAMES[xx]` table, `NOUN`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, a complete `STR[xx]`
  (identical key set, params and wording count — tested), `CHILD_FALLBACK[xx]`, `seqThen` joiner; `voice.js`: `LANG_TAG`,
  `PREFERRED`.
