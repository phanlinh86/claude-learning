# Kiki's Camp Chimes — Voice, language and input

Files: `game/js/i18n.js` (`CC.I18N`), `game/js/voice.js` (`CC.Voice`), `game/js/input.js` (`CC.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 39 000 checks, self-contained): every key in both languages with identical
key sets **and identical `{params}`**, every `ui.*` / `talk.*` / `topic.*` / surprise key that `index.html` / `ui.js` / `main.js`
use, 3 wordings per instruction and reaction, Vietnamese lines carry diacritics and a warm "Bé ơi … nhé!" wording, every
prompt × colour / shape / size / animal / n 1–12 (bell strings and dots, EN plurals), every name kind × value (DESIGN §6
names exactly), `chimePhrase` for every chime kind, no `màu màu` / `chuông chuông`, no unfilled `{param}`, no "a owl", a
negative-word ban, no jigsaw words left, the child's name (empty name → no dangling comma), `words()` (digits + no-diacritic
forms) matched back by the matcher, exact right / wrong / count-run lines plus a sweep of every chime × topic × wanted
answer, every Talk choice kind (`choiceWords`, `talkWrong`, spoken answer → right choice), speech text, the tap / swipe input
layer (fake DOM: a 60-move swipe, capture, extra fingers, cancel), parent hold gate, voice queue / interrupt / unlock / volume
/ test speed with a fake `speechSynthesis`, recognizer. **When the chimes `content.js` exists** (it does) the test renders
every `promptKey` / Talk key + params, the name of every chime, the right line of every target and the wrong line of every
other chime that `makeRound` / `makeTalk` produce for ages 3–7 in EN + VI, and checks that every `CC.ANIMALS / SHAPES /
COLORS` value has names. The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games
(last: Pom's Puzzle Town); the wording is new.

## 0. Wording principles (Kiki)
- **Kiki** is a little chestnut monkey with a cream camp bandana who hung wind chimes over the campfire. EN "Kiki"; VI lines
  "Kiki", titles **"Khỉ Kiki"**. Title "Kiki’s Camp Chimes" / "Chuông Gió Lửa Trại Của Khỉ Kiki"; logo lines "Kiki’s" /
  "Camp Chimes", "Khỉ Kiki" / "Chuông Gió Lửa Trại".
- **TTS of "Kiki" — decision: no rewrite.** English voices read /ˈkiːki/; "ki" is an ordinary Vietnamese syllable, Linh reads
  "Ki-ki" like a pet name. `speech()` keeps it as written (tested).
- **Chime vocabulary**: ring / chime / bell / Ding! / Ding-dong! / Lovely! — vi **rung / chuông / Đinh đoong! / Leng keng! /
  Hay quá!**; lantern "đèn lồng"; song "bài hát"; swipe "vuốt (tay) qua các chuông".
- **Things** (DESIGN §6): bell "chuông" ("chuông màu đỏ", "chuông to"); shape plate "chuông hình …" — the bare shape
  names are "hình tròn, hình vuông, hình tam giác, **ngôi sao, trái tim**, hình chữ nhật, hình thoi, hình bầu dục", and in
  shape prompts / Talk the VI `{shape}` becomes "hình ngôi sao", "hình trái tim" ("Bé ơi, rung chuông hình ngôi sao nhé!");
  bell string "chùm" + "n **cái chuông**" ("Bé ơi, rung chùm có ba cái chuông nhé!", count run "Một, hai, ba cái chuông!");
  dot plate "chuông có năm chấm"; animals "con gấu / con cáo / con cú / con hươu / con thỏ / con sóc / con ếch / con vịt",
  as a chime "chuông con gấu" (prompts and wrong lines), plain "Con gấu!" in the right line.
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("chuông {color}" →
  "chuông màu đỏ") and **never write "màu {color}"** (tested). Bare form (`hue`) "đỏ".
- **Never negative**: a wrong chime names what was rung, then the goal ("That’s the blue bell. Let’s ring the red one!" /
  "Đây là chuông màu xanh dương. Mình rung chuông màu đỏ nhé!"). Brushes and taps on the sky are never mistakes and have no
  line. Maths never gives the answer away. Tested word ban: no / not / wrong / bad / fail / mistake / oops / fall / sorry …
  and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm.
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "hay quá!".
  `ask(…, {next:true})` drops a leading "Bé ơi," after every VI prefix ("Thêm một chuông nữa nhé! Bé rung …", "Giờ thì bé rung
  chuông màu đỏ nào!") and never puts a prefix ending in "nhé!" / "nào!" before a prompt with the same particle.
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, and "bé {child}" → "bé",
  ", {child}!" → "!" (no dangling comma; tested over every key).
- **Initials (age 6–7)**: EN bear B, fox F, owl O, deer D, rabbit R, squirrel S, frog F, duck D; VI words without classifier
  gấu G, cáo C, cú C, hươu H, thỏ T, sóc S, ếch **Ê**, vịt V. content.js picks distinct initials per round.

## 1. API (`CC.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).
`e` = the world event **plus** `{ topic: world.topic, params: <current step's params>, promptKey: <current step's key>,
thing: <the chime's thing> }`. The world's `right` already carries `thing`; for `wrong` add the rung chime's thing
(`world.chimeById(e.id).thing`) — if it is missing, the chime is rebuilt from `e.got` {nameKind, nameValue} + topic.

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'bear'}`, `{size:'big'}` / `{big:true}`, `{n:3, kind:'string'|'dots'}`; `{thing:{…}}` → its chime phrase; `{kind,value}` / `{nameKind,nameValue}` objects are named |
| `ask(lang, promptKey, params, {next?, rng?})` | the step prompt; `next:true` → "Next one! Ring the red bell!" / "Now, ring the bear!" / "Giờ thì bé rung …" |
| `sayRight(lang, e, rng?)` | `right` → "Ding! The red bell!", "Ding-dong! The bear!", "Ding! The big bell!", "Ding! The blue star!" (p.shapes5 only), "Ding! Letter B!", "Ding! Small b!" · vi "Đinh đoong! Chuông màu đỏ!", "Đinh đoong! Con gấu!", "Chuông hình ngôi sao! Hay quá!"; **bell string → the count run** "One, two, three bells!" / "Một, hai, ba cái chuông!" (dots: count run only when `e.count` is passed, else "Ding! Seven dots!"); add/sub "Five! 2 + 3 is five!"; oddeven "Seven is odd!"; initial "B is for bear!" / "Chữ Ê, ếch!" |
| `sayWrong(lang, e, rng?)` | `wrong` → colours "That’s the blue bell. Let’s ring the red one!"; shapes "That’s the circle. Let’s ring the triangle!"; shapes5 "That’s the red star. Let’s ring the blue star!"; size "That’s the small bell. Let’s ring the big one!" / "Đây là chuông nhỏ. Mình rung chuông to nhé!"; animals "That’s the fox. Let’s ring the bear!" / "Đây là chuông con cáo. Mình rung chuông con gấu nhé!"; count "That one has four bells. Let’s ring the one with three bells!" / "Chùm này có bốn cái chuông. Mình rung chùm có ba cái chuông nhé!"; letters "That’s letter D. Let’s ring letter B!"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "Fox starts with F! Let’s look again!" |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `sayCountRun(lang, n, kind?)` | "One, two, three bells!" / "Một, hai, ba cái chuông!"; n = 1 "One bell!"; kind `'string'` (default) / `'dots'` / a thing |
| `sayCountDone(lang, n, kind?, rng?)` | "Three bells! Hooray!" / "Ba chấm! Hoan hô!" (optional) |
| `sayName(lang, thing \| e)` | a chime's plain name: "the red bell" / "chuông màu đỏ", "con hươu" (Talk aria, tests) |
| `sayPickup(lang, e)` / `sayTap(lang, e)` | kept aliases: "The red bell!" / "Look, the red bell!" (`name.say`, `tap`); `sayPlaced` = `sayRight` |
| `talkWrong(lang, choice)` / `talkWrong(lang, kind, value)` | missed Talk answer: "It is blue! Good try!", "It is an oval! Good try!", "It is the owl! Good try!", "It is the big one! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `choiceWords(lang, choice)` | spoken forms for a Talk choice `{id, thing}` (color / bell with colour → colour; bell with `big` / size → size; plate → shape; animal; number / string / dots → number; glyph → letter / number) — pass as `Voice.listen({choices:[{id, words}]})` |
| `chimePhrase(lang, thing, {art, color, size, chime, bare})` (alias `piecePhrase`) | "the red bell", "the big bell", "the triangle" (colour only with `color:true`), "three bells", "five dots", "the bear", "letter B", "small b", "number five" / "chuông màu đỏ", "chuông to", "chuông hình tam giác", "chùm ba cái chuông", "năm chấm", "con gấu" (`chime:true` → "chuông con gấu"), "chữ b thường", "số năm" |
| `phrase(lang, thing \| choice \| {nameKind, nameValue})` | the same for anything (ui.js aria labels) |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapeH, size, bell, plate, string, dots, animal, word, number, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` | accepted spoken forms (lower-case, + no-diacritic forms, digits and "số năm" for numbers) |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "B is for", "starts with F", "Big B / small b"), + − =, " — " → ", ", "…" → ".", vi "chữ B" → "chữ bờ"; "Kiki" unchanged |
| `initialOf(lang, animal)` | `{word, first}` ("ếch", "Ê") |
| `setChild(name)`, `has`, `keys`, `raw`, `kindValue(choice)` | `{child}` default for every `t()`; key checks; a choice → `[kind, value]` |
| constants | `langs, TOPICS, ANIMALS, SHAPES, COLORS, CHIME_KINDS, NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (skill rule, proven in the playtests): *prompts are protected* (the guard in `speakPrompt` lasts until the
prompt has actually been spoken: from its `onStart` **600 ms + 95 ms × chars**); *feedback (right / wrong) interrupts* unless
the prompt is still protected; *the wrong line is protected the same way* (a quick second ring then only rings); *the count
run is never cut* (queued, protected; light the little bells one by one with the words); *round-done praise, hints and the
song ask queue*; *skip a new praise if one started < 1.2 s ago*; brushes, soft taps, chimesIn and lanterns have **no line**
(sound only); speech is log-only for `speed > 1` (`Voice.setSpeed(n)`, also read from `?speed=` by `Voice.init`).

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)` (banner + voice), then `t('weather.'+weather)` ("Good morning, mountains!" / "Sunny noon!" / "Sunset time!" / "Starry night!") | interrupt (new chapter), weather queued |
| `round {round, surprise}` | `t('enter')` in the bubble ("New chimes!"), not spoken — the prompt follows | — |
| `chimeIn {id, i, x, y}` | — (soft cord "boing" per chime) | |
| `ask {promptKey, params, mode, step, first}` | `ask(lang, promptKey, params, {next: !first && step > 0})` — bubble + voice; remember it for `pokeKiki` / `idle` | **protected prompt** (`priority: true`) |
| `ring {id, thing, note, judged, brush?}` | — (the chime's note; a brush rings softer) | no line ever |
| `right {id, thing, x, y, count?}` | `sayRight(lang, e)` (counting strings: the count run) | interrupt (feedback), never over a protected prompt (then queue); a count run is queued + protected |
| `count {id, i, x, y}` | — (jingle; the count run says the numbers — do **not** also speak `sayCount(i)` per bell) | |
| `lantern {i, x, y}` | — (pop-glow sound; optional bubble `t('lantern')`) | no voice |
| `stepDone {step, last}` | — (the next `ask` follows `askGap` with the `next` wording; the right line is the praise) | |
| `wrong {id, got, want, streak, x, y}` | `sayWrong(lang, e + {thing})`; at most one wrong line per 1.5 s; after the 2nd miss the hint follows | interrupt unless protected (then queue); then **protected** for 600 + 95 ms × chars |
| `soft {x, y}` | — (beam knock + tiny wobble) | no line |
| `hint {id}` | `t('hint')` ("Psst! Look at the shining chime!") | **queue** (the wrong line goes first) |
| `assist {}` | `t('hint')` ("Kiki will help! Ring this one!") | queue |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, then stay quiet) | queue |
| `pokeKiki` | repeat the current prompt (> 3 s after it was asked, not while Kiki is still saying it); with no prompt (song / out) `t('kiki.poke')` ("Hee hee! That tickles!") | interrupt |
| `roundDone {round, stars, misses}` | ONE line: `t('great')` (0 misses, "Beautiful music, {child}!") or `t('praise')` | **queue** (never cut the count run); skip if a praise started < 1.2 s ago |
| `songAsk {}` | `t('song')` ("Now play our song — swipe across the chimes!" / "Giờ mình chơi bài hát nhé — vuốt qua các chuông nào!") + bubble | queue after the praise, protected like a prompt |
| `songNote {id, i, note}` | — (the cascade; duck the music) | |
| `songDone {auto}` | `t('songDone')` ("Beautiful music!" / "Bé chơi nhạc hay quá!") — skip if the round praise is still queued / < 1.2 s ago | queue |
| `chimesOut {}` | — (cords pulled up "fwip") | |
| `hedgehog` / `hedgehogTap` | `t('surprise.hedgehog')` / `t('hedgehog.tap')` | queue / interrupt (tap feedback), never over a protected prompt |
| `bird` / `birdTap {note}` | `t('surprise.bird')` / `t('bird.tap')` (the bird sings the note; line only if nothing is speaking) | same |
| `fireflies` / `fireflyTap {x, y}` | `t('surprise.fireflies')` / `t('firefly.tap')` (at most one tap line per 2 s; the twinkle sound does the rest) | same |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | queued after the praise; protected like a prompt |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice)` | interrupt |
| `levelDone` | `t('great')` (heard: the next chapter waits `levelDoneTime`) | queue |
| `sessionDone {stars, songs}` | `t('party')` ("Look at all our lanterns!"), then `t('session.done', {stars})` | interrupt, then queue |

### 1.2 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Kiki’s voice" / "Giọng của
  Kiki"), mic, done, stars, chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing,
  tapOrSay, listening ("Kiki is listening…"), tapKiki ("Tap Kiki to hear it again"), tapHint ("Tap a chime to ring it"),
  swipeHint ("Swipe across the chimes"), skip, gallery ("Our songs"), langName.en, langName.vi`. (`ui.tapPom` is gone →
  `ui.tapKiki`.)
- **topic.\*** (one banner each): colors "Colour Bells" / "Chuông sắc màu", shapes "Shape Chimes" / "Chuông hình khối",
  size "Big and Small" / "To và nhỏ", count "Let’s Count" / "Cùng đếm nào", animals "Forest Friends" / "Bạn thú rừng xanh",
  letters "Letter Chimes" / "Chuông chữ cái", lower, initial, add, sub, oddeven.
- **weather.0..3** (morning, noon, sunset, night): "Good morning, mountains!", "Sunny noon!", "Sunset time!", "Starry night!"
  / "Chào buổi sáng, núi ơi!", "Buổi trưa nắng đẹp quá!", "Hoàng hôn đến rồi!", "Đêm đầy sao lấp lánh!".
- **Prompts** (3 wordings; required params → else the fallback) — exactly what content.js sends: `p.colors {color}`
  ("Ring the red bell!" / "Bé ơi, rung chuông màu đỏ nhé!"), `p.shapes {shape}` (a `{color}` param is ignored),
  `p.shapes5 {shape, color}` (→ `p.shapes`), `p.size {size}` or `{big}` ("Ring the big bell!"; → `p.sizeAny`), `p.animals
  {animal}` ("Ring the bear!" / "Rung chuông con gấu nào!"), `p.count {n, kind 'string'|'dots'}` ("Ring the one with three
  bells!" / "… with seven dots!"; `{num}` number word, `{items}` plural-aware, `{holder}` one / chùm / chuông), `p.letters
  {letter}`, `p.lower {letter, small}`, `p.initial {letter, animal}`, `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}`
  ("Ring all the odd numbers!"); `p.any`; `p.next` ("Next one!", "One more!", "Now," / "Tiếp nào!", "Thêm một chuông nữa
  nhé!", "Giờ thì").
- **Lines**: `name.say {thing}`, `tap {thing}`, `right {thing}`, `right.label {label}`, `right.parity {num, parity}`,
  `right.initial {letter, word}`, `right.sum {expr, ans}`, `right.any` ("Ding! Lovely!" / "Đinh đoong! Hay quá!"),
  `countDone {n}`, `lantern`, `wrong.thing {got, want}`, `wrong.count {got, want, holder}`, `wrong.math {got}`,
  `wrong.parity {num, parity}`, `wrong.initial {word, first}`, `wrong.any`, `stepDone`, `song`, `songDone {child}`,
  `enter`, `surprise.hedgehog`, `hedgehog.tap`, `surprise.bird`, `bird.tap`, `surprise.fireflies`, `firefly.tap`,
  `kiki.poke`, `hint`, `idle {child}`, `praise`, `great {child}`, `party`, `session.done {stars}`, `count.0..20`.
- **Talk** (content.js `makeTalk` → `promptKey 'talk.<topic>'`): `talk.intro, talk.right`; `talk.colors` "What colour is
  this bell?" / "Chuông này màu gì nhỉ?" (a bell is shown; never says the colour), `talk.colorsWhich {color}`, `talk.shapes
  {shape}` "Which one is the triangle?" / "Hình tam giác là cái nào nhỉ?" (→ `talk.shapesAny`), `talk.shapes5`, `talk.size
  {size}` "Which bell is big?" (→ `talk.sizeAny`), `talk.count {kind}` "How many bells?" / "Có mấy cái chuông nào?" (never
  says n; `{itemsPl}` always plural; → `talk.countAny`), `talk.animals {animal}` "Where is the bear?" / "Con gấu ở đâu
  nhỉ?" (→ "Who is this?"), `talk.animalsWho`, `talk.letters`, `talk.lower`, `talk.initial {animal}`, `talk.add / sub
  {a, b}` (→ `talk.calc`), `talk.oddeven {parity}`; `talk.wrong(.a, .animal, .size, .letter, .small, .number, .any)`.

### 1.3 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape (shapeH) | circle, square, triangle, star, heart, rectangle (rect), diamond, oval | hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục (shapeH: hình ngôi sao, hình trái tim) |
| bell | red bell, big bell | chuông màu đỏ, chuông to |
| plate | star chime | chuông hình ngôi sao |
| string / dots | one bell, three bells / one dot, five dots | một cái chuông, ba cái chuông (phrase "chùm ba cái chuông") / năm chấm |
| animal | bear, fox, owl, deer, rabbit, squirrel, frog, duck | con gấu, con cáo, con cú, con hươu, con thỏ, con sóc, con ếch, con vịt |
| word (initial) | as animal | gấu G, cáo C, cú C, hươu H, thỏ T, sóc S, ếch Ê, vịt V |
| size | big, small | to, nhỏ |
| number 0–20, letter, sum, diff, parity | words; letters as written; "two plus three"; odd / even | words; kindergarten phonics (b → bờ, c → cờ, k → ca, q → quờ, y → i dài …); "hai cộng ba"; lẻ / chẵn |
Spoken extras (`words`): "teddy", "foxy", "hoot", "fawn", "bunny", "froggy", "quack" … / "gấu con", "cú mèo", "con nai",
"nai", "thỏ trắng", "sóc con", "con nhái", "cạp cạp" …; "xanh" alone is ambiguous (no match), "con" alone matches nothing;
"chuông con gấu", "chuông màu đỏ", "chuông to" all match. No spoken form is shared by two values of one kind (tested).

## 2. Voice (`CC.Voice`) — the proven engine
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**, `say` resolves `{spoken:false, reason:'speed'}`; `init` reads `?speed=`),
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `CC.debug.voiceLog`, also when muted or at test speed), `spoken(lang, text)`, `RATE` 0.9 /
`PITCH` 1.2, `canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null,
transcript, reason?}>`, `stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox, **Bells** …) −60. Lists are
  read at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Kiki: **rate 0.9, pitch 1.2** (a small bright monkey; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Volume: `setVolume(v)` → every utterance's `u.volume` (follows the game's volume setting; skill "Loud, clear sound"
  rule). TTS loudness itself is the phone's media volume.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s,
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.
- Music / chime ducking: duck the music bed on `onStart`, restore on `onEnd`; the cascade's own notes are not ducked (the song
  line is queued after it, or before it with the cascade waiting for the first touch).

## 3. iOS / Safari findings (re-checked 10 Nov 2026, unchanged since Pom's Puzzle Town)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+, still WebKit-only; W3C Audio Session draft) — `Audio.unlock()`
  (lead) sets it. While the mic listens `voice.js` switches to `'play-and-record'` and restores the previous type afterwards
  (otherwise speech goes to the earpiece / gets quiet). The chime notes are synthesized Web Audio, so this matters most here.
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **Vietnamese voice "Linh"**: built into iOS/iPadOS (vi-VN), so `getVoices()` lists it even when nothing was downloaded;
  `voice.js` sets `utterance.voice` by name. If a parent wants a better one: **Settings › Accessibility › Spoken Content ›
  Voices › Vietnamese** (download Linh Enhanced if offered). iOS 26 regression: the voice chosen in Spoken Content is ignored
  by web speech and downloaded Enhanced voices are often missing from `getVoices()` — so we never rely on the default voice.
  `hasVoice('vi') === false` (no vi voice at all, e.g. some Android / desktop browsers) → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network) and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. Vietnamese recognition (`vi-VN`) works but returns words often without diacritics or with the
  wrong tone ("mầu đổ", "con cao") — the matcher compares stripped forms too. Apple's on-device SpeechAnalyzer (iOS 26) is
  native-only. The mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).
Sources: MDN `AudioSession.type`; W3C Audio Session WD; Apple Developer Forums thread 804648 ("AVSpeechSynthesisVoice ignores
user-selected voices in iOS 26"); WebKit "Safari 26" release notes; Apple support "Hear iPhone speak the screen" (Spoken Content).

## 4. Input (`CC.Input`) — one-finger TAP / SWIPE
```js
const detach = CC.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y), // press on a chime → it is struck at once (ring + judged first contact)
  move:   (x, y, ev) => world.pointerMove(x, y), // EVERY move of that finger, in order (swipe segments strike chimes)
  up:     (x, y, ev) => world.pointerUp(x, y),   // end of the gesture
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation → the gesture ends, no more strikes
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel();    // main: on resize / rotation / pause → one cancel(), the rest of that finger is dropped
detach.isActive();  // a finger (or mouse button) is down
detach();           // remove all listeners
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object** (the Dino Nest Sort pitfall: `p => world.pointerDown(p.x, p.y)` rings nothing). It is
documented in a box at the top of `input.js` and tested. Non-finite points are dropped; an `up` without a mappable point
becomes `cancel()`.
- **One active pointer.** `down` fires synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`,
  **pointer capture**) — the chime rings with no tap delay; every `pointermove` of that finger reaches `move` synchronously and
  unthrottled (tested: a 60-move swipe arrives complete and in order, the release point far outside the canvas still reaches
  `up`), `up` arrives exactly once — also when lifted over the HUD / bubble (capture + window fallback, no double delivery).
  iOS sends one move per frame, so a fast strum jumps 40–80 px between moves: the world must test the **segment** from the
  previous point against each chime's hit circle (DESIGN §5.2), not just the new point.
- **Extra fingers are ignored** (a resting second hand never rings a second chime or restarts the gesture). Recovery when the
  active finger is known to be gone (iOS swallowed its `pointerup`): a new `isPrimary` touch, a mouse press replacing a touch,
  the touch-fallback's active touch missing from `e.touches`, or silence ≥ `Input.STALE_MS` (6 s; only checked when another
  finger presses) → `cancel()` for the old, `down()` for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.
- Functional QA must drive **real CDP touch events** (a tap on a chime, a ≥ 10-move swipe across the beam band for the song)
  — the bot calls `world.pointerDown/Move/Up` directly and proves nothing about fingers.

## 5. Adding a language / a thing
- New animal: `ANIMALS`, `NAMES.*.animal|word`, `WORDS.*.animal`, `WORD_LIST`, run the test.
- New chime kind: `CHIME_KINDS`, `chimePhrase`, `kvRaw`, `thingFromName`, `sayRight` / `sayWrong` branches, the test sweep.
- New language: `LANGS`, `NAMES[xx]` (all kinds), `ITEMS`, `HOLDER`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, `WORD_LIST[xx]`,
  a complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`, `chimePhrase` word order;
  `voice.js`: `LANG_TAG`, `PREFERRED`.
