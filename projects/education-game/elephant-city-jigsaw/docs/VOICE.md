# Pom's Puzzle Town — Voice, language and input

Files: `game/js/i18n.js` (`PZ.I18N`), `game/js/voice.js` (`PZ.Voice`), `game/js/input.js` (`PZ.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 50 000 checks, self-contained): every key in both languages with identical
key sets **and identical `{params}`**, every `ui.*` / `talk.*` / `topic.*` key that `index.html` / `ui.js` / `main.js` use,
3 wordings per instruction and reaction, Vietnamese lines carry diacritics, every prompt × colour / shape / size × object /
animal / n 1–12 (balloons and dots, EN plurals), every name kind × value (DESIGN §6 names exactly), `piecePhrase` for every
piece kind, no `màu màu`, no unfilled `{param}`, no "a orange", a negative-word ban, no dig / Bun words left, `words()`
(digits + no-diacritic forms) matched back by the matcher, exact pickup / tap / placed / wrong / count-run lines plus a sweep
of every piece × topic × wanted answer, every Talk choice kind (`choiceWords`, `talkWrong`, spoken answer → right choice),
speech text, the drag input layer (fake DOM: a 60-move drag, capture, extra fingers, cancel), parent hold gate, voice
queue / interrupt / unlock / volume / test speed with a fake `speechSynthesis`, recognizer. **When the jigsaw `content.js`
exists** (it does) the test renders every `promptKey` / Talk key + params, the pickup line of every piece, the placed line
of every target and the wrong line of every other piece that `makeRound` / `makeTalk` produce for ages 3–7 in EN + VI.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Pom)
- **Pom** is a round baby elephant with a knitted scarf who loves jigsaw puzzles. EN "Pom"; VI lines "Pom", titles
  **"Voi Pom"**. Title "Pom’s Puzzle Town" / "Voi Pom Ghép Hình"; logo lines "Pom’s" / "Puzzle Town", "Voi Pom" / "Ghép Hình".
- **TTS of "Pom" — decision: no rewrite.** English voices read /pɒm/. In Vietnamese "om" is an ordinary rhyme ("bom",
  "lom khom") and "p" starts many everyday loan words ("pin", "pa-nô"), so Linh reads "Pom" as one syllable, like a name.
  `speech()` keeps "Pom" as written in both languages (tested).
- **Puzzle vocabulary**: piece / find / fits / Click! / Hooray! — vi **mảnh ghép / tìm / vừa khít / Cạch! / Hoan hô!**;
  shadow = "cái bóng"; picture = "bức tranh".
- **Things with classifiers** (DESIGN §6): car "chiếc ô tô", bus "chiếc xe buýt", balloon "quả bóng bay", kite "con diều",
  umbrella "chiếc ô", house "ngôi nhà", flower "bông hoa", hat "chiếc mũ"; animals "con vịt / con mèo / con chó / con bò /
  con heo / con ếch / con sư tử / con thỏ"; balloons in a bunch "quả bóng bay" (counting aloud: "quả bóng"); dots "chấm";
  shapes "hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục".
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("mảnh ghép {color}"
  → "mảnh ghép màu đỏ", "chiếc ô tô màu đỏ") and **never write "màu {color}"** (tested). Bare form (`hue`) "đỏ".
- **Never negative**: a wrong drop names what was dropped, then the goal ("That’s the blue kite. Let’s find the red one!" /
  "Đây là con diều màu xanh dương. Mình tìm mảnh màu đỏ nhé!"). The near miss is not a mistake ("It goes here — look at the
  shadow!"). Maths never gives the answer away. Tested word ban: no / not / wrong / bad / fail / mistake / oops / fall /
  sorry … and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm.
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "giỏi quá!".
  `ask(…, {next:true})` drops a leading "Bé ơi," after **every** VI prefix ("Thêm một mảnh nữa nhé! Bé tìm …", "Giờ thì bé tìm mảnh
  ghép màu đỏ nhé!"), and never puts a prefix ending in "nhé!" / "nào!" before a prompt that already says that particle (it takes
  the next prefix instead: "Tiếp nào! Bé tìm mảnh ghép màu xanh lá nhé!") — QA round 2, playtest P3-3.
- **Initials (age 6–7)**: VI words without classifier (vịt V, mèo M, chó C, bò B, heo H, ếch **Ê**, sư tử S, thỏ T); EN duck D,
  cat C, dog D, cow C, pig P, frog F, lion L, rabbit R. content.js picks distinct initials per round.

## 1. API (`PZ.I18N`) — for main.js
All helpers never throw and never return '' or a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).
`e` = the world event **plus** `{ topic: world.topic, params: <current step's params>, promptKey: <current step's key>,
thing: <the piece's thing> }` (the world events already carry `thing` for pickup / tapPiece / placed; for `wrong` add the
dropped piece's thing if it is missing).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'dog'}`, `{obj:'car'}`, `{n:3, kind:'dots'}`; `{thing:{…}}` → its piece phrase; `{kind,value}` / `{nameKind,nameValue}` objects are named |
| `ask(lang, promptKey, params, {next?, rng?})` | the step prompt; `next:true` → "Next one! Find the red piece!" / "Now, where is the dog?" / "Giờ thì bé tìm …" |
| `sayPickup(lang, e, rng?)` | `pickup` → "The red car!", "The triangle!" (shapes5 "The blue star!"), "Three balloons!", "Five dots!", "The dog!", "The big car!", "Letter B!", "Small b!", "Five!" · vi "Chiếc ô tô màu đỏ!", "Ngôi sao màu xanh dương!", "Ba quả bóng bay!", "Con chó!", "Chữ B!" |
| `sayTap(lang, e, rng?)` | `tapPiece` → "The red car!" / "Look, the red car!" / "This is the red car!" (vi "Nhìn nè, …", "Đây là … nè!") |
| `sayPlaced(lang, e, rng?)` | `placed` → "Click! The red car fits!" / "Cạch! Chiếc ô tô màu đỏ vừa khít rồi!"; **`e.named`** (Pom said the piece's name at pickup < 8 s ago; colours / shapes / size / animals) → `placed.any` "Click! It fits!" / "Cạch! Vừa khít rồi!"; **bunch / dots → the count run** "One, two, three balloons!" / "Một, hai, ba quả bóng!"; add/sub "Five! 2 + 3 is five!"; oddeven "Seven is odd!"; initial "D is for dog!" / "Chữ Ê, ếch!"; letters "Click! Letter B!" |
| `sayWrong(lang, e, rng?)` | `wrong` → colours "That’s the blue kite. Let’s find the red one!"; shapes "That’s the circle. Let’s find the triangle!"; shapes5 "That’s the red star. Let’s find the blue star!"; size "That’s the small car. Let’s find the big one!" (vi "… Mình tìm chiếc ô tô to nhé!"); animals "That’s the cat. Let’s find the dog!"; count "That one has four balloons. Let’s find three balloons!"; letters "That’s letter D. Let’s find letter B!"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "Pig starts with P! Let’s look again!" |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `sayCountRun(lang, n, kind?)` | "One, two, three balloons!" / "Một, hai, ba quả bóng!"; n = 1 "One balloon!"; kind `'bunch'` (default) / `'dots'` / a thing |
| `sayCountDone(lang, n, kind?, rng?)` | "Three balloons! Hooray!" / "Ba chấm! Hoan hô!" (optional) |
| `talkWrong(lang, choice)` / `talkWrong(lang, kind, value)` | missed Talk answer: "It is blue! Good try!", "It is an oval! Good try!", "It is the rabbit! Good try!", "It is the big one! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `choiceWords(lang, choice)` | spoken forms for a Talk choice `{id, thing}` (color → colour; obj with colour → colour, with `big` → size, else object; shape → shape; animal; number / bunch / dots → number; glyph → letter / number; size) — pass as `Voice.listen({choices:[{id, words}]})` |
| `piecePhrase(lang, thing, {art, color, size, bare})` | "the red car", "the triangle" (colour only with `color:true`), "three balloons", "five dots", "the dog", "the big car", "letter B", "small b", "number five" / "chiếc ô tô màu đỏ", "hình tam giác", "ba quả bóng bay", "con chó", "chiếc ô tô to", "chữ b thường", "số năm" |
| `phrase(lang, thing \| choice \| {nameKind, nameValue})` | the same for anything (ui.js aria labels) |
| `name(lang, kind, value, opts?)` | kinds `color, hue, shape, size, obj ({size}), animal ({size}), word, number, dots, bunch, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` | accepted spoken forms (lower-case, + no-diacritic forms, digits and "số năm" for numbers) |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "D is for", "starts with P", "Big B / small b"), + − =, " — " → ", ", "…" → ".", vi "chữ B" → "chữ bờ"; "Pom" unchanged |
| `initialOf(lang, animal)` | `{word, first}` ("ếch", "Ê") |
| `setChild(name)`, `has`, `keys`, `raw`, `kindValue(choice)` | `{child}` default for every `t()`; key checks; a choice → `[kind, value]` |
| constants | `langs, TOPICS, ANIMALS, OBJECTS, SHAPES, COLORS, PIECE_KINDS, NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (skill rule, proven in the playtests): *feedback interrupts* unless the prompt is still protected (the
guard in `speakPrompt` lasts until the prompt has actually been spoken: from its `onStart` **600 ms + 95 ms × chars**, voice.js's own
estimate at rate 0.9 — QA round 2, was 300 + 72); *the wrong / near-miss line is protected the same way* (the next pickup only
plips); *round-done praise and hints queue*; *the count run queues* (never cut); *skip a new praise if one started < 1.2 s ago*; speech is log-only for `speed > 1`
(`Voice.setSpeed(n)`, also read from `?speed=` by `Voice.init`).

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)` (banner + voice), then `t('weather.'+weather)` ("Spring flowers!" …) | interrupt (new chapter), weather queued |
| `round {round, surprise}` | `t('enter')` in the bubble ("A new picture!"), not spoken — the prompt follows | — |
| `boardIn {x, y}` | — (swoosh) | |
| `pieceLand {id, x, y}` | — (soft tap per piece) | |
| `ask {promptKey, params, mode, step, first}` | `ask(lang, promptKey, params, {next: !first && step > 0})` — bubble + voice; remember it for `pokePom` / `idle` | **protected prompt** (`priority: true`) |
| `pickup {id, thing, x, y}` | `sayPickup(lang, e)` — the piece's name | interrupt, but never over a protected prompt (then skip: the plip sound is enough); skip if the same piece was named < 2 s ago |
| `tapPiece {id, thing}` | `sayTap(lang, e)` | interrupt (not over a protected prompt) |
| `placed {id, slot, thing, x, y, count?}` | `sayPlaced(lang, e + {named})` (named → the short line, the name is not repeated; counting pieces: the count run; light the balloons / dots one by one in time with the words) | interrupt (feedback) |
| `stepDone {step, last}` | — (the next `ask` follows `askGap` 1.0 s later with the `next` wording; the placed line is the praise) | |
| `nearMiss {id, slot}` | `t('nearMiss')` ("It goes here — look at the shadow!") | interrupt unless protected (then queue); then **protected** for 600 + 95 ms × chars |
| `wrong {id, got, want, streak, x, y}` | `sayWrong(lang, e)`; at most one wrong line per 1.5 s; after the 2nd miss the hint follows | interrupt unless protected (then queue); then **protected** for 600 + 95 ms × chars |
| `home {id}` | — (whoosh; dropped outside the board, not a mistake) | |
| `soft {}` | — (pat sound + tiny board jiggle) | |
| `hint {id, slot}` | `t('hint')` | **queue** |
| `assist {}` | `t('hint')` ("Pom will help! This one goes here!") | queue |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, then pause) | queue |
| `pokePom` | repeat the current prompt (> 3 s after it was asked, not while Pom is still saying it) | interrupt |
| `roundDone {round, stars, misses}` | bubble only: `t('alive')` ("The picture is done — look, it moves!"); spoken: ONE line, `t('great')` (0 misses, with the child's name) or `t('praise')` (QA round 2: two queued lines made the praise go stale) | **queue** (never cut the last count run); skip a praise < 1.2 s after the previous |
| `toot {}` | `t('toot')` ("Toot toot!" / "Tò te tò te!") — only if nothing is speaking (the trumpet sound carries it) | queue, low priority |
| `poof {id, x, y}` | — (sparkle pop of a leftover distractor) | |
| `boardOut {}` | — (page-turn "fwip") | |
| `pigeon` / `pigeonTap` | `t('surprise.pigeon')` / `t('pigeon.tap')` | queue / interrupt (tap feedback), never over a protected prompt |
| `bubbles` / `bubblePop {x, y}` | `t('surprise.bubbles')` / `t('bubble.pop')` (at most one pop line per 2 s; the pop sound does the rest) | same |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | interrupt; protected like a prompt |
| `talkAsk {n}` | repeat the Talk question | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice)` | interrupt |
| `levelDone` | `t('great')` (heard: the next chapter waits `levelDoneTime` 3.6 s) | queue |
| `sessionDone {stars, pictures}` | `t('party')`, then `t('session.done', {stars})` | interrupt, then queue |

### 1.2 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Pom’s voice" / "Giọng của
  Pom"), mic, done, stars, chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing,
  tapOrSay, listening ("Pom is listening…"), tapPom ("Tap Pom to hear it again"), tapHint ("Drag a piece into its
  shadow"), skip, gallery ("Our pictures"), langName.en, langName.vi`. (The dig game's `ui.tapBun` is gone → `ui.tapPom`.)
- **topic.\*** (one banner each): colors "Colour Pieces" / "Mảnh ghép sắc màu", shapes "Shape Puzzles" / "Ghép hình khối",
  size "Big and Small" / "To và nhỏ", count "Let’s Count" / "Cùng đếm nào", animals "Animal Park" / "Công viên thú",
  letters "Letter Puzzles" / "Ghép chữ cái", lower, initial, add, sub, oddeven.
- **weather.0..3** (spring, summer, autumn, winter): "Spring flowers!", "Sunny summer!", "Autumn leaves!", "Snowy winter!" /
  "Mùa xuân hoa nở rồi!", "Mùa hè nắng đẹp quá!", "Mùa thu lá vàng bay!", "Mùa đông tuyết trắng xóa!".
- **Prompts** (3 wordings; required params → else the fallback) — exactly what content.js sends: `p.colors {color}`
  ("Find the red piece!" / "Bé ơi, tìm mảnh ghép màu đỏ nhé!"), `p.shapes {shape}`, `p.shapes5 {shape, color}` (→ `p.shapes`),
  `p.size {size, obj}` ("Find the big car!" / "Bé ơi, tìm chiếc ô tô to nhé!"; → `p.sizeAny {size}`), `p.animals {animal}`
  ("Where is the dog?" / "Con chó đâu rồi nhỉ?"), `p.count {n, kind 'bunch'|'dots'}` ("Find the piece with three balloons!"
  / "… with seven dots!"; `{num}` number word, `{items}` plural-aware), `p.letters {letter}`, `p.lower {letter, small}`,
  `p.initial {letter, animal}`, `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}` ("Put in all the odd numbers!"); `p.any`;
  `p.next` ("Next one!", "One more!", "Now," / "Tiếp nào!", "Thêm một mảnh nữa nhé!", "Giờ thì").
- **Lines**: `pickup {thing}`, `tap {thing}`, `placed {thing}`, `placed.label {label}`, `placed.parity {num, parity}`,
  `placed.initial {letter, word}`, `placed.sum {expr, ans}`, `placed.any`, `countDone {n}` (`{num} {items}`), `nearMiss`,
  `wrong.thing {got, want}`, `wrong.count {got, want}`, `wrong.math {got}`, `wrong.parity {num, parity}`, `wrong.initial
  {word, first}`, `wrong.any`, `stepDone`, `alive`, `toot`, `enter`, `surprise.pigeon`, `pigeon.tap`, `surprise.bubbles`,
  `bubble.pop`, `hint`, `idle`, `praise`, `great {child}` ("Great puzzling, {child}!"), `party`, `session.done {stars}`,
  `count.0..20`.
- **Talk** (content.js `makeTalk` → `promptKey 'talk.<topic>'`): `talk.intro, talk.right`; `talk.colors {obj}` "What colour
  is this car?" / "Chiếc ô tô này màu gì nhỉ?" (a piece is shown; never says the colour; → `talk.colorsAny` "What colour is
  this piece?"), `talk.colorsWhich {color}` (spare); `talk.shapes {shape}` "Which one is the triangle?" (→ `talk.shapesAny`),
  `talk.shapes5 {shape, color}`; `talk.size {size, obj}` "Which bus is big?" (→ `talk.sizeOne` → `talk.sizeAny`); `talk.count
  {n, kind}` "How many balloons?" / "How many dots?" (never says n; the noun is `{itemsPl}`, always plural; → `talk.countAny`); `talk.animals {animal}` "Where is the
  duck?" (no picture shown, animal choices; without `{animal}` → "Who is this?"), `talk.animalsWho` "Who is this?" (for a
  shown animal); `talk.letters {letter}`, `talk.lower {letter}`, `talk.initial {word|animal}` (→ `initialAny`),
  `talk.add / talk.sub {a, b}` (→ `talk.calc`), `talk.oddeven {parity}` (→ `oddevenAny`);
  `talk.wrong(.a, .animal, .size, .letter, .small, .number, .any)`.

### 1.3 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape | circle, square, triangle, star, heart, rectangle (rect), diamond, oval | hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục |
| obj | car, bus, balloon, kite, umbrella, house, flower, hat (+size "big car") | chiếc ô tô, chiếc xe buýt, quả bóng bay, con diều, chiếc ô, ngôi nhà, bông hoa, chiếc mũ (+size "chiếc ô tô to") |
| animal | duck, cat, dog, cow, pig, frog, lion, rabbit (+size) | con vịt, con mèo, con chó, con bò, con heo, con ếch, con sư tử, con thỏ (+size "con thỏ nhỏ") |
| word (initial) | as animal | vịt V, mèo M, chó C, bò B, heo H, ếch Ê, sư tử S, thỏ T |
| bunch / dots | one balloon, three balloons / one dot, five dots | ba quả bóng bay / năm chấm |
| size | big, small | to, nhỏ |
| number 0–20, letter, sum, diff, parity | words; letters as written; "two plus three"; odd / even | words; kindergarten phonics (b → bờ, c → cờ, k → ca, q → quờ, y → i dài …); "hai cộng ba"; lẻ / chẵn |
Spoken extras (`words`): "kitty", "doggy", "bunny", "auto", "brolly", "cap" … / "cún", "con lợn", "xe hơi", "bóng bay", "cây
dù", "nón", "căn nhà" …; "xanh" alone is ambiguous (no match), "con" alone matches nothing; "ô tô" beats "cái ô" (longer form wins).

## 2. Voice (`PZ.Voice`) — the proven engine
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**, `say` resolves `{spoken:false, reason:'speed'}`; `init` reads `?speed=`),
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `PZ.debug.voiceLog`, also when muted or at test speed), `spoken(lang, text)`, `RATE` 0.9 /
`PITCH` 1.2, `canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null,
transcript, reason?}>`, `stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60. Lists are read
  at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Pom: **rate 0.9, pitch 1.2** (a small bright baby elephant; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears
  Vietnamese tones).
- Volume: `setVolume(v)` → every utterance's `u.volume` (follows the game's volume setting; skill "Loud, clear sound"
  rule). TTS loudness itself is the phone's media volume.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s,
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.

## 3. iOS / Safari findings (re-checked 9 Nov 2026)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+, still WebKit-only; W3C Audio Session draft) — `Audio.unlock()`
  (lead) sets it. While the mic listens `voice.js` switches to `'play-and-record'` and restores the previous type afterwards
  (otherwise speech goes to the earpiece / gets quiet).
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **Vietnamese voice "Linh"**: built into iOS/iPadOS (vi-VN), so `getVoices()` lists it even when nothing was downloaded;
  `voice.js` sets `utterance.voice` by name. If a parent wants a better one: **Settings › Accessibility › Spoken Content ›
  Voices › Vietnamese** (download Linh Enhanced if offered). Note the iOS 26 regression: the voice chosen in Spoken Content
  is ignored by web speech and downloaded Enhanced voices are often missing from `getVoices()` — so we never rely on the
  default voice. `hasVoice('vi') === false` (no vi voice at all, e.g. some Android / desktop browsers) → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network) and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. Vietnamese recognition (`vi-VN`) works but returns words often without diacritics or with the
  wrong tone ("mầu đổ") — the matcher compares stripped forms too. Apple's on-device SpeechAnalyzer (iOS 26) is native-only.
  The mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).
Sources: MDN `AudioSession.type`; W3C Audio Session WD; Apple Developer Forums thread 804648 ("AVSpeechSynthesisVoice ignores
user-selected voices in iOS 26"); WebKit "Safari 26" release notes; Apple support "Hear iPhone speak the screen" (Spoken Content).

## 4. Input (`PZ.Input`) — one-finger DRAG
```js
const detach = PZ.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y), // press on a tray piece → it lifts at once (pickup)
  move:   (x, y, ev) => world.pointerMove(x, y), // EVERY move of that finger, in order (the spring follows it)
  up:     (x, y, ev) => world.pointerUp(x, y),   // release point → snap / nearMiss / wrong / home; quick tap → tapPiece
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation → the piece glides home
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel();    // main: on resize / rotation / pause → one cancel(), the rest of that finger is dropped
detach.isActive();  // a finger (or mouse button) is down
detach();           // remove all listeners
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object** (the Dino Nest Sort pitfall: `p => world.pointerDown(p.x, p.y)` grabs nothing). It is
documented in a box at the top of `input.js` and tested. Non-finite points are dropped; an `up` without a mappable point
becomes `cancel()`.
- **One active pointer.** `down` fires synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`,
  **pointer capture**), every `pointermove` of that finger reaches `move` synchronously and unthrottled (tested: a 60-move
  drag arrives complete and in order, the release point far outside the canvas still reaches `up`), `up` arrives exactly
  once — also when lifted over the HUD / bubble (capture + window fallback, no double delivery).
- **Extra fingers are ignored** (a resting second hand never drops the carried piece). Recovery when the active finger is
  known to be gone (iOS swallowed its `pointerup`): a new `isPrimary` touch, a mouse press replacing a touch, the
  touch-fallback's active touch missing from `e.touches`, or silence ≥ `Input.STALE_MS` (6 s; only checked when another
  finger presses) → `cancel()` for the old, `down()` for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.
- Functional QA must drive **real CDP touch events** (a press on a tray piece, ≥ 10 moves to the slot, release) — the bot
  calls `world.pointerDown/Move/Up` directly and proves nothing about fingers.

## 5. Adding a language / a thing
- New object / animal: `OBJECTS` / `ANIMALS`, `NAMES.*.obj|animal|word`, `WORDS.*`, `WORD_LIST`, run the test.
- New language: `LANGS`, `NAMES[xx]` (all kinds), `ITEMS` / `RUN`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, a
  complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`, `piecePhrase` word order;
  `voice.js`: `LANG_TAG`, `PREFERRED`.
