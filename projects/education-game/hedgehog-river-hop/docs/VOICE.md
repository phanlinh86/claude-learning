# Nim's River Hop — Voice, language and input

Files: `game/js/i18n.js` (`NH.I18N`), `game/js/voice.js` (`NH.Voice`), `game/js/input.js` (`NH.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 74 300 checks, self-contained, exits non-zero on failure): identical key
sets, **identical `{params}`** and the same number of wordings in en / vi; every `ui.*` key that `index.html` / `ui.js` /
`main.js` / `render.js` use; 3 wordings + `.first` for every prompt (no `.many`: one target per row); every prompt × every
value × first × 3 wordings × with / without the child's name (≈ 3 500 prompts); Vietnamese diacritics, a warm "bé … nhé /
nhỉ / nào" and "nhảy" in every prompt, classifiers; a negative-word ban and a **sister-game word ban** (bubble, pop,
rainbow, Bao, panda, wand, cloud, bong bóng, cầu vồng, gấu trúc, Bảo, chọc …) on every string, every rendered line and the
three source files; tidy rendering (no `{x}`, "undefined", "NaN", no "a orange", capital after a stop); every name kind ×
value; `initial()`; `words()` (no form shared by two values, with and without diacritics) matched back by the matcher +
20 noisy kid answers (numbers / colours / homes, EN + VI); DESIGN / REQUIREMENT example lines exactly; a sweep of ≈ 11 000
right / wrong lines (every thing kind × rule × left 0/1/2 × streak × wording, countSeq per row, also with only `got`);
`sayFruit` for every fruit; Talk lines + `talkWrong`; speech text; the input layer (fake DOM); the parent gate; voice queue /
interrupt / log / unlock / volume / speed with a fake `speechSynthesis`; the recognizer. **When the river `content.js`
exists** (it does) the test renders the ask, the fruit, the right line of every target and the wrong line of every other
stone of ≈ 160 `makeRound` rounds (ages 3–7, EN + VI) and every `makeTalk` question + choice (a round that content.js itself
refuses to build is reported as `WARN`, not counted against i18n).

## 0. Wording principles (Nim)
- **Nim** is a cheerful little hedgehog who hops across a woodland brook. EN "Nim"; VI lines **"Nim"** ("Mình là nhím Nim"),
  titles **"Nhím Nim"**. Title "Nim’s River Hop" / "Nhím Nim Nhảy Đá Qua Suối"; logo lines "Nim’s" / "River Hop", "Nhím Nim" /
  "Nhảy Đá Qua Suối"; `ui.voice` "Nim’s voice" / "Giọng của Nim". **TTS: no rewrite** — "Nim" is an ordinary syllable.
- **The question is positive and plural-neutral** (every row has ONE right stone, the question covers the whole crossing):
  "Hop on the red ones!", "Hop on the stars!", "Hop to the cow!" — no "not" in any game line (tested). Banned (tested): no /
  nope / wrong / incorrect / bad / fail / mistake / oops / sorry / don’t and sai / sai rồi / dở / tệ / hỏng / không đúng /
  chưa đúng / không phải / trật / nhầm / hư.
- **Things (VI: classifier + noun, colour AFTER the noun)**: bông hoa, cây nấm, chiếc lá, quả bóng, con vịt cao su ("bông hoa
  màu đỏ", "cây nấm nhỏ màu xanh lá"); shapes hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình
  thoi, hình bầu dục; dots **"4 chấm"** / "4 dots" ("1 dot"); tiles "chữ B", "chữ a thường", "3 + 2", "số 7"; animals con bò,
  con heo, con cừu, con vịt, con gà mái, con ngựa, con dê, con cua, bể cá vàng, chim cánh cụt, sư tử, con khỉ (home-line
  subject of the fishbowl: "bạn cá vàng"); stone **"hòn đá"**, brook **"suối"**. EN: "a red flower", "an orange leaf", "a
  little green mushroom", "4 dots", "letter B", "small a", "the penguin". The EN obj duck is "duck" (the mic also takes "rubber
  duck"); VI "con vịt cao su" keeps it apart from the animal "con vịt".
- **Fruits** (rewards on Nim's spines): apple / quả táo, pear / quả lê, strawberry / quả dâu tây, mushroom / cây nấm, acorn /
  hạt dẻ. `sayFruit` → "Yum, an apple!" / "Ôi, quả táo!" (+ a `{child}` variant "Yum, an apple! Great job, Mai!").
- **Homes**: EN "on the farm / in the sea / on the ice / in the jungle / on the savanna"; VI "sống ở nông trại / biển / xứ
  băng / rừng rậm / đồng cỏ châu Phi".
- **Right lines** name the thing, then where Nim goes: rows left > 0 → "Next one!" / "Next row!" / "On we go!" ("Hòn tiếp
  theo nào!", "Hàng tiếp theo nào!", "Nhảy tiếp nào!"); the last stone → "Last hop!" / "To the bank!" / "Last hop to the
  bank!" ("Nhảy lên bờ nào!", "Hòn cuối rồi!", "Lên bờ thôi!"). No `left` in the event → just the name.
- **Wrong lines** name what was tapped, then the goal: "That’s a blue mushroom. Find a red one!" / "Đây là cây nấm màu xanh
  dương. Mình tìm cái màu đỏ nhé!"; homes teach the home ("That’s a lion. It lives on the savanna. Who lives on the farm?");
  initials say the letter; maths "5 + 3 makes 8. Find one that makes 10!"; parity "7 is odd. Find an even number!";
  countSel "That’s 3 dots. Find the stone with 4 dots!"; **countSeq "That’s 4. Which one is 2?" / "Đây là số 4. Số 2 đâu nhỉ?"**.
- Numbers in prompts / thing names are **digits** ("Hop 1, 2, 3!", "the stones with 4 dots") — the signs show numerals; TTS
  reads them. Count runs use words ("One, two, three, four! Four dots!").
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, "bé {child}" → "bé".
- **Initials (age 6–7)**: first letter of the bare noun (no classifier), diacritics stripped. Animals EN cow C … goldfish G,
  VI bò B, heo H, cừu C, vịt V, gà mái G, ngựa N, dê D, cua C, cá vàng C, chim cánh cụt C, sư tử S, khỉ K; objs EN flower F,
  mushroom M, leaf L, ball B, duck D; VI hoa H, nấm N, lá L, bóng B, vịt cao su V.

## 1. API (`NH.I18N`) — for main.js
All helpers never throw (also with `null` events) and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function,
or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | a random variant. Raw params are named: `{color:'red'}` (+ `{COLOR}` "RED" / "màu ĐỎ"), `{shape:'star'}` (+ `{shapes}` "stars"), `{animal:'cow'}`, `{big:true}` / `{size}`, `{parity}`, `{home:'ice'}` → "on the ice" / "ở xứ băng", `{season:2}`, `{who:'penguin'}` → "the penguin", `{n:3}` → `{n}` "3", `{num}` "three", `{seq}` "1, 2, 3", `{dotWord}`, `{fruit:'apple'}` → "an apple" / "quả táo", `{thing:{…}}` → "a red flower" |
| `ask(lang, promptKey, params, {first, rng})` | the question; `first` → `.first` ("Let’s cross the brook! Hop on the RED stones!" / "Mình qua suối nào! Bé chọn hòn đá có màu ĐỎ nhé!"). `params.k` is ignored (plural-neutral). Missing param / unknown key → `p.any` ("Hop on a stone!") |
| `sayRight(lang, e, rng?)` | `e = {thing, row, k, left, home?, count?, mode, rule, topic, promptKey, params}`. obj / shape / tile / animal → "A red flower! Next one!"; **home** → "The penguin lives on the ice!" (+ next / last); initial → "A horse! Horse starts with H!"; sum / diff → "9 + 1 makes 10!"; parity → "8 is even!"; **countSel** (dots thing) → the count run "One, two, three, four! Four dots!" (no next line: the run is long enough); **countSeq** (`mode:'countSeq'`, rule `seq` or `p.countSeq`) → the number word "Two!" (from `e.count`, else `row + 1`, else `i + 1`, else `thing.n`) |
| `sayWrong(lang, e, rng?)` | `e = {got:{nameKind,nameValue}, thing?, want:{rule} \| want \| rule, streak, row?, need?, …}` → names it + the goal (see §0). Without `thing` it is rebuilt from `got`; without a rule it comes from mode / promptKey + params. **countSeq needed number** = `e.need` → `e.want.n` → `e.want.need` → `e.want.count` → `e.want.rule.n` → `e.count` → `e.row + 1` (round.rule.value is k, NOT the row's number); none → "That’s 5. Let’s count in order!" |
| `sayWrongHint(lang, e, rng?)` | the miss that brings the hint: "That’s a green ball. Look at the shiny one!" / countSeq "That’s 4. Look at the shiny one!" |
| `sayFruit(lang, fruit, rng?)` **new** | `fruit` = `'apple'` \| `{kind:'apple'}` \| `{fruit:'apple'}` (w.fruit works) → "Yum, an apple!", "Look, Nim got a pear!" / "Ôi, quả táo!", "Nim có quả lê rồi nè!"; unknown → "Yum!" |
| `sayCount(lang, i)` | "One!" … "Twenty!" (= `count.<i>`) |
| `sayCountRun(lang, n, kind)` | kind `'dots'` (default) / `'stones'` → "Four dots!", "One dot!", "Three stones!" / "Bốn chấm!", "Ba hòn đá!" |
| `countList(lang, n)` / `seqList(n)` | "One, two, three, four!" / "1, 2, 3" |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the red flower" (default art `the`); opts `{art: 'the' \| 'a' \| null, color, size, who}`; Talk icons color / number / home / size / fruit |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapes, obj (toy alias), objWord, fruit, thing, dots, animal, animals, word, who, home, homeAt, lives, number / n / seq, letter, sum, diff, parity, size, season, text / tile` |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms (lower-case + no-diacritic forms; numbers: digits, "số ba", "four dots", "4 chấm") |
| `initial`, `bareWord`, `initialOf` | first letter / bare noun (content.js uses these for the initial topic) |
| `talkWrong(lang, choice, talk?)` / `talkWrong(lang, kind, value, talk?)` | "It is blue! Good try!", "There are 4 dots! Good try!" (talk.topic `count`), "The penguin lives on the ice! Good try!" (home choice + `talk.show.animal`) |
| `speech(lang, text)` | TTS text (`Voice.say` calls it): letter names, + − =, "…" → ", ", ALL-CAPS emphasis → lower-case ("RED" → "red", "màu ĐỎ" → "màu đỏ"), vi "chữ B" → "chữ bờ" |
| helpers | `homeOf(animal)`, `thingFromName(nk, nv)`, `ruleOf(e)`, `setChild`, `has`, `keys`, `raw`, `kindValue(choice)`, `numberName`, `stripMarks` |
| constants | `langs, TOPICS, COLORS, SHAPES, OBJS (TOYS alias), FRUITS, ANIMALS, HOMES, SEASONS, ANIMAL_HOME, RULE_KINDS, THING_KINDS, PROMPTS, PARAMS, NAME_TABLE, LETTER_VI, MAX_COUNT` |

Thing kinds: `obj, shape, dots, tile, animal` (legacy `toy` / `stars` still accepted). Rule kinds: `color, shape, size, seq
(countSeq), n (countSel), animal, home, letter, lower, initial, sum, diff, parity` (aliases countSeq → seq, number / dots /
count → n, farm → home, add → sum, sub → diff, oddeven → parity; `mode` wins: countSeq → seq, countSel → n).

**What main.js must do differently from the bubble game**
- `ev2(e)`: thing from `world.stoneById(e.id).thing`; keep `mode`, `rule`, `topic`, `promptKey`, `params`; for countSeq
  `wrong` pass `row` (or `need`) — the world event's `want.rule.value` is k, not the needed number.
- Gone: `blow, enter, rainbow, whoosh, surprise.bird, bird.tap, surprise.kite, kite.tap, ui.tapBo, ui.tapBao`,
  `talk.wrong.stars / star1` (→ `talk.wrong.dots / dot1` via `talkWrong`), `p.countPop` and every `.many` form.
  New: `rise, wipe, ahead, bank, fruit / fruit.any (sayFruit), poke, surprise.fish, fish.tap, surprise.frog, frog.tap,
  ui.tapNim, right.next, right.last, wrong.dots, wrong.seq, goal.seq, goal.seqAny`.
- `sayCountRun(lang, n)` defaults to dots; pass `'stones'` only for a stone count.

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (proven in the sister games):
1. **Prompts are protected** (`speakPrompt`): the guard lasts until the prompt has been heard once — from its `onStart`
   600 ms + 95 ms × chars (if it never starts, 6 s after it was queued). While protected, feedback **queues behind it**
   (`interrupt: false`); a right hop never cuts the question. Only after the guard ends may feedback interrupt.
2. **Count lines are queued and never cut**: every countSeq number ("One!", "Two!", "Three!") and the countSel run ("One, two,
   three, four! Four dots!") are spoken `priority: true`, `interrupt: false` and are themselves protected (600 ms + 95 ms ×
   chars; the run + 400 ms). A hop takes ≥ 0.6 s, so queue ≤ 2 is enough; nothing else interrupts them.
3. **The wrong line is protected** the same way once it starts; ≤ 1 wrong line per 1.5 s; the same stone again (`squish`) is
   silent.
4. **Nim / surprise taps never cut a protected or count line**: while one plays, `pokeNim` only giggles visually and the
   question is queued once; tap lines (`fish.tap`, `frog.tap`, `snow.tap`, `poke`) only when nothing speaks; ≤ 1 per 2 s.
5. **Praise is rate-limited**: skip a praise if one started < 1.2 s ago; say it only where the table says. **"ahead" ≤ once
   per 6 s** (and never over a protected line). Speech is log-only for `speed > 1`.
6. **A question is only repeated while it can be answered** (`world.interactive`). Sound-only events (no line): `rise`
   (except the rare first one), `hop`, `land`, `splash`, `thingAway`, `soft`, `squish`, `curl`, `uncurl`, `gust`, `count`.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)`, then `t('weather.'+weather)` ("Spring by the brook!" / "Sunny summer!" / "Windy autumn!" / "Snowy winter!") | interrupt, weather queued |
| `round {round, surprise}` | speech-bubble text `t('rise')` (shown, not spoken) | — |
| `rise {id}` (first stone of a chapter's round 0, **rarely**) | `t('rise')` ("Look, stepping stones!") ≤ once per chapter, only if nothing speaks | queue, droppable |
| `ask {promptKey, params, first}` | `ask(lang, promptKey, params, {first})`; bubble + voice; remember the text for `pokeNim` / `idle` | **protected prompt** (`priority`) |
| `right {id, thing, row, k, left, home?, count?}` — match | `sayRight(lang, ev2(e))` → "A red flower! Next one!" / last "… Last hop!"; animals + home: "The penguin lives on the ice! …" | feedback: interrupt only once the prompt guard ended, else queue; then protect |
| `right` — countSeq | `sayRight` → "Two!" | **count line** (rule 2) |
| `right` — countSel | `sayRight` → "One, two, three, four! Four dots!" (say it on `right`, while the dots light up on `count`) | **count line**, +400 ms |
| `land {id, row}` | — (the right line already named it; "tok" + splash) | — |
| `count {i}` | — (rising pip + numeral; the run says the words — do **not** also `sayCount`) | — |
| `homeBadge {home}` | — (badge chime; the right line names the home) | — |
| `bankLand {x, y}` | `t('bank')` ("We crossed the brook!") **only** in a chapter's round 0 or after a round with a miss, and only when nothing speaks | queue, droppable |
| `stick {fruit}` | `sayFruit(lang, e.fruit)` ("Yum, an apple!") — this **is** the round's praise (rate limit 1.2 s) | queue, droppable |
| `roundDone {stars, misses}` | **no line** (stars fly) | — |
| `wipe {season}` | `t('wipe')` **rarely** (chapter 1 round 0, then ≤ 1 in 4 rounds), only when nothing speaks | queue, droppable |
| `wrong {id, got, want, streak}` | `sayWrong(lang, ev2(e))`; the miss that brings the hint (`e.hint` or the 2nd miss): `sayWrongHint`; countSeq "That’s 4. Which one is 2?" | interrupt unless protected; then protected; ≤ 1 per 1.5 s |
| `ahead {id}` | `t('ahead')` ("One at a time!" / "Từng hòn một thôi bé ơi!") **≤ once per 6 s**, never over a protected / count line | interrupt only if nothing protected, else drop |
| `soft {x, y}` | — (water "plink") | no line |
| `hint {id}` | nothing when the wrong line already pointed at it; else `t('hint')` | **priority** |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, pause after the 5th) | queue |
| `pokeNim` | play + interactive: repeat the current prompt (not while it is still spoken); while a protected / count line plays: queue the prompt once; otherwise (rise / air / bank / wipe) `t('poke')` ("Hee hee! That tickles!") only when nothing speaks | see rule 4 |
| `fish` / `fishTap` | `t('surprise.fish')` / `t('fish.tap')` | queue (never over a protected prompt) / tap rule 4 |
| `frog` / `frogTap` | `t('surprise.frog')` / `t('frog.tap')` | same |
| `snow` / `snowTap` | `t('surprise.snow')` / `t('snow.tap')` | same |
| pause → resume | play: the prompt; Talk: the question while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | queued, protected |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | interrupt |
| `talkResult` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` (pass `talk`: home answers name the animal, count answers say dots — "How many dots?" → "There are 4 dots! Good try!") | interrupt |
| `levelDone` | `t('great')` | queue |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | interrupt, then queue |

**Fix round 1 (integrator, after QA + playtest)** — what main.js / voice.js do now:
- `Voice.say` keeps at most 2 waiting NORMAL lines (oldest dropped); priority lines are never dropped for a normal one, only past 6
  waiting, and then never the prompt (`opts.prompt`). New: `opts.tag`, `Voice.dropTagged(tags)`, `queuedTags()`, `currentTag()`.
- Guards start when a line STARTS (`onStart`): count lines (countSeq numbers, the countSel run) and the wrong line (now `priority`).
  The prompt's guard holds from its start until its promise resolves (it really ended / was cut), +150 ms; the 600 + 95 ms × chars
  estimate is only a fallback (voice off / never started). A guarded line still waiting in the queue also blocks interrupts.
- `ask` drops still-queued chapter / weather lines (tag `flavour`) and stale right lines; the first `right` drops a question that has
  not started yet; a Nim / bubble tap never queues the question behind waiting count lines.
- Right lines are no longer protected; a new right line never cuts one that started < 1.5 s ago (it waits; only the newest waits).
  VI right lines mid-crossing are just the name ("Bông hoa màu đỏ!", ≲ 2.5 s); EN keeps "… Next one!". The last row keeps the tail.
- `stick` → `sayFruit` is queued (no `canInterrupt` gate), so the round's praise is heard after the last right line.

### 1.2 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice, mic, done, stars, chapter {n},
  allDone {stars}, welcome {child}, micUnsupported, micDenied, voiceMissing, tapOrSay, listening ("Nim is listening…" / "Nim
  đang nghe…"), tapNim, tapHint, doorHint, skip, gallery ("Our fruit"), langName.en/vi`.
- **topic.\***: colors "Colour Stones" / "Đá sắc màu", shapes "Shape Stones" / "Đá hình khối", size "Big and Little" / "To và
  nhỏ", count "Counting Hops" / "Vừa đếm vừa nhảy", animals "Animal Homes" / "Nhà của các bạn thú", letters "Letter Stones" /
  "Đá chữ cái", lower, initial, add, sub, oddeven.
- **weather.0..3** (2 wordings, the first is canonical).
- **Prompts** (3 wordings + `.first` each): `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape}`, `p.size {big}`,
  `p.countSeq {n}` ("Hop 1, 2, 3!" / "Nhảy 1, 2, 3 nào!"), `p.countSel {n}` ("Hop on the stones with 4 dots!" / "Bé nhảy lên
  hòn đá có 4 chấm nhé!"), `p.animal {animal}`, `p.home {home}` ("Who lives on the farm? Hop on them!" / "Ai sống ở nông
  trại? Bé nhảy lên nào!"), `p.letters {letter}`, `p.lower {letter}`, `p.initial {letter}`, `p.add {n}`, `p.sub {n}`,
  `p.oddeven {parity}`; `p.any`.
- **Lines**: `right.thing {thing}`, `right.home {who, home}`, `right.initial`, `right.sum / diff {expr, ans}`, `right.parity`,
  `right.next`, `right.last`, `right.any`; `wrong.is {thing}`, `wrong.dots {thing}`, `wrong.seq {got}`, `wrong.livesAt`,
  `wrong.starts`, `wrong.expr`, `wrong.parity`, `wrong.hint`, `wrong.any`; `goal.{color, shape, size, seq {want}, seqAny, n
  {what}, animal, home, letter, lower, initial, sum, diff, parity, any}`; `rise`, `wipe`, `ahead`, `bank`, `fruit {fruit}`,
  `fruit.any`, `poke`, `surprise.fish / frog / snow`, `fish.tap`, `frog.tap`, `snow.tap`, `praise`, `great {child}`, `party`,
  `hint`, `idle {child}`, `session.done {stars}`, `count.0..20`.
- **Talk** (content.js `makeTalk`): `talk.intro, talk.right`; `talk.color(s)`, `talk.colorsWhich`, `talk.shape(s) {shape}`,
  `talk.size {size}`, `talk.count` "How many dots?" / "Có mấy chấm nào?", `talk.home / talk.animals {animal}`, `talk.who`,
  `talk.letters`, `talk.lower {letter}`, `talk.initial {letter, nameKind, nameValue}` (the word comes from nameValue; the
  letter is never said), `talk.add / sub {a, b}`, `talk.oddeven {parity}`; `talk.wrong(.a, .animal, .size, .letter, .small,
  .number, .dots, .dot1, .home, .place, .any)`.

## 2. Voice (`NH.Voice`) — the proven engine (unchanged behaviour, Nim's pitch)
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**), `say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken,
reason}>`, `sayKey(key, params, opts)` (promise `.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`,
`voiceName(lang)`, `onStart(display)` / `onEnd`, `onVoicesChanged(fn)`, `log` (+ `NH.debug.voiceLog`) — **every line**, also
when muted / at test speed, `spoken(lang, text)`, `RATE` 0.9 / **`PITCH` 1.2**, `canListen()`, `listen({lang, choices,
timeoutMs}) → Promise<{id|null, transcript, reason?}>`, `stopListening()`, `isListening()`, `onListen(bool)`,
`match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium preferred; Apple novelty voices (Bubbles, Zarvox, Fred …) avoided.
- Nim: **rate 0.9, pitch 1.2** (a cheerful little hedgehog — young and bright; above ≈ 1.3 iOS voices go robotic, rate
  < 0.85 smears Vietnamese tones).
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50 ms (90 ms on iOS); watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume
  every 10 s — Chrome cuts utterances at ~15 s; matters for a 12-dot count run); page hidden → stop. Before `unlock()` only
  the newest line is kept.
- Recognition: fuzzy matcher (exact tokens, no-diacritic tokens, number words → digits, edit distance 1 (≥ 5 letters) / 2
  (≥ 8 letters) for single words with the same first letter, ambiguous → no match, interim matches wait 450 ms). The mic is
  hidden when `!canListen()`.
- Ducking: duck the music bed on `onStart`, restore on `onEnd`.

## 3. iOS / Safari findings (re-checked 15 Nov 2026 — nothing new since the sister games)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+) — `Audio.unlock()` sets it. While the mic listens `voice.js`
  switches to `'play-and-record'` and restores the previous type afterwards.
- **First utterance inside a gesture**: `unlock()` in the first `pointerup` / `touchend` / `click` speaks a silent `' '`; a
  line refused with `not-allowed` is kept and spoken on the next `unlock()`; lines queued before the first tap are
  re-timestamped (a slow first tap never makes the welcome "stale").
- **Vietnamese voice "Linh"** is built into iOS / iPadOS; `voice.js` sets `utterance.voice` by name. iOS 26 still ignores the
  voice chosen in Spoken Content for web speech, and downloaded Enhanced / Premium voices are often missing from
  `getVoices()` (since iOS 18) — so we never rely on the default voice. If Linh is missing, parents install it in
  **Settings › Accessibility › Spoken Content › Voices › Vietnamese › Linh**, then reload the page (`ui.voiceMissing`
  shows the path when `hasVoice('vi') === false`). The voice list fills late on iOS: `voice.js` polls `getVoices()` for 6 s
  and `onVoicesChanged` re-checks.
- **Speech recognition** (`webkitSpeechRecognition`) needs **Siri & Dictation** on, usually a network, and is **missing in
  Home-Screen mode** → `canListen()` false; `not-allowed` disables it for the session. `vi-VN` results often lack diacritics
  or tones ("xanh duong", "o nong trai", "bon") — the matcher compares stripped forms. Tap answers always work; the mic is
  only used in Talk time.
- WebKit hang: `start()` after an `<audio>` element played may never fire events → no `<audio>`, a fresh recognizer per
  `listen()`, a timeout always resolves. After backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on
  return. iPadOS desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4) — tested.

Sources: [Apple Developer Forums 804648 (iOS 26 voice regression)](https://developer.apple.com/forums/thread/804648),
[764438 (voices missing from Web Speech since iOS 18)](https://developer.apple.com/forums/thread/764438),
[723503 (not all installed voices listed)](https://developer.apple.com/forums/thread/723503),
[Readium: SpeechSynthesis in browsers and OSes](https://readium.org/speech/docs/WebSpeech.html),
[caniuse getVoices](https://caniuse.com/mdn-api_speechsynthesis_getvoices), MDN `AudioSession.type`.

## 4. Input (`NH.Input`) — one-finger TAP, judged on pointer DOWN
```js
const detach = NH.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y), // stones bob: the PRESS is judged at once (hop / wobble / ahead / soft / Nim)
  move:   (x, y, ev) => world.pointerMove(x, y), // still delivered (the world ignores it in play)
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object.** `down` fires synchronously inside `pointerdown` (`touch-action: none`, `preventDefault`,
pointer capture) — no tap delay. **One active pointer**: extra fingers are ignored (a resting second hand never taps a second
stone); a stuck pointer is recovered (new primary touch, missing touch, silence ≥ `Input.STALE_MS` 6 s). Targets `button,
.screen, #hud, .no-game-input` (HUD, speech bubble, menus) are skipped. Touch + mouse fallback without `PointerEvent`.
- `kidProof()`: blocks pinch, double-tap zoom, long-press callout / selection, rubber-band & pull-to-refresh, context menu,
  Ctrl/⌘ zoom and refresh keys. `holdButton(el, ms = 2000, onDone, onProgress)` → `off()`: the parent gate (tested).
- Functional QA must drive **real CDP touch events** (a tap on a bobbing stone at `debug.stoneScreen(id)`).

## 5. Adding a thing / a language
- New obj: `OBJS`, `NAMES.*.obj | objWord`, `WORDS.*.obj`, `OBJ_INITIAL` in the test. New fruit: `FRUITS`, `NAMES.*.fruit`,
  `WORDS.*.fruit`. New animal: `ANIMALS`, `ANIMAL_HOME`, `NAMES.*.animal | animals | word | who`, `WORDS.*.animal`. New home:
  `HOMES`, `NAMES.*.home | homeAt`, `WORDS.*.home`.
- New prompt: `PROMPTS` + `p.x` (3 wordings) and `p.x.first` in both languages; the test's `PROMPT_VALUES`.
- New rule kind: `RULE_KINDS`, `goal.<kind>` in both languages, `sayRight` / `wrongIs` / `goalParams` branches.
- New language: `LANGS`, every `NAMES[xx]` table, `NOUN`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, a complete `STR[xx]`
  (identical key set, params and wording count — tested), `CHILD_FALLBACK[xx]`, phrase word order; `voice.js`: `LANG_TAG`,
  `PREFERRED`.
