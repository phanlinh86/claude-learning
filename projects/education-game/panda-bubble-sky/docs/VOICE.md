# Bao's Bubble Sky — Voice, language and input

Files: `game/js/i18n.js` (`PB.I18N`), `game/js/voice.js` (`PB.Voice`), `game/js/input.js` (`PB.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 56 700 checks, self-contained): identical key sets **and identical `{params}`**
in en / vi, every `ui.*` key that `index.html` / `ui.js` / `main.js` use (and every parade `ui.*` key kept), 3 wordings +
`.first` for every prompt and a `.many` plural (+ `.many.first`) where k can be > 1, every prompt × every value × k = 1/2/3 ×
first × 3 wordings, Vietnamese diacritics and a warm "bé … nhé / nhỉ / nào" per prompt, a negative-word ban (and no "not"
in any game line), tidy rendering of every key (no `{x}`, "undefined", "NaN", no "a orange", no "màu màu", capital after a
stop, with and without the child's name), every name kind × value, `thing` names, `initial()` for every animal and toy,
`words()` (no form shared by two values) matched back by the matcher, DESIGN example lines exactly, a sweep of ≈ 7 700
right / wrong lines (every topic thing kind × left 0/1/2 × streak × wording, also with only `got`), every countPop pop,
Talk lines + `talkWrong`, speech text, the input layer (fake DOM), the parent gate, voice queue / interrupt / log / unlock /
volume / speed with a fake `speechSynthesis`, recognizer. **When the bubble `content.js` exists** (it does) the test
renders the ask, the right line of every target and the wrong line of every other bubble of 160 `makeRound` rounds (ages
3–7, EN + VI) and every `makeTalk` question + choice.

## 0. Wording principles (Bao)
- **Bao** is a gentle little panda on a cloud with a bubble wand. EN "Bao"; VI lines **"Bảo"**, titles **"Gấu trúc Bảo"**.
  Title "Bao’s Bubble Sky" / "Gấu Trúc Bảo Thổi Bong Bóng"; logo lines "Bao’s" / "Bubble Sky", "Gấu Trúc Bảo" / "Thổi Bong
  Bóng"; `ui.voice` "Bao’s voice" / "Giọng của Bảo". **TTS: no rewrite** — "Bao" and "Bảo" are ordinary syllables.
- **The question is positive**: "Pop the red one(s)!" — no "not" in any game line (tested). Banned (tested): no / nope /
  wrong / incorrect / bad / fail / mistake / oops / sorry / don’t / "no!" and sai / sai rồi / dở / tệ / hỏng / không đúng /
  chưa đúng / không phải / trật / nhầm / hư.
- **Things (VI, classifier + noun, colour AFTER the noun)**: quả bóng, con vịt cao su, cái ô, con diều, chiếc xe ô tô
  ("quả bóng màu đỏ", "chiếc xe ô tô nhỏ màu xanh lá"); shapes hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim,
  hình chữ nhật, hình thoi, hình bầu dục ("ngôi sao màu xanh dương"); stars "3 ngôi sao"; tiles "chữ B", "chữ a thường",
  "3 + 2", "số 7"; animals con bò, con heo, con cừu, con vịt, con gà mái, con ngựa, con dê, con cua, bể cá vàng, chim cánh
  cụt, sư tử, con khỉ (home-line subject of the fishbowl: **"bạn cá vàng"**). EN: "a red ball", "an orange umbrella", "a
  little green car", "3 stars", "letter B", "small a", "the penguin". The EN toy duck is just "duck" (kids say duck; "rubber
  duck" is accepted by the mic) — VI "con vịt cao su" keeps it apart from the animal "con vịt".
- **Homes**: EN "on the farm / in the sea / on the ice / in the jungle / on the savanna"; VI "sống ở nông trại / biển / xứ
  băng / rừng rậm / đồng cỏ châu Phi" (`name('vi','homeAt','ice')` = "ở xứ băng"; lines write "sống {home}").
- **Right lines** name the popped thing (with colour; size in the size topic): "A red ball!" + "One more red one!" (colour
  rounds) / "One more!" / "Two more!" ("Còn một cái màu đỏ nữa!", "Còn một cái nữa!", animals "Còn một bạn nữa!").
- **Wrong lines** name what was tapped, then the goal: "That’s a blue duck. Find a red one!" / "Đây là con vịt cao su màu
  xanh dương. Mình tìm cái màu đỏ nhé!". Homes teach the home: "That’s a lion. It lives on the savanna. Who lives on the
  farm?"; initials say the letter: "That’s a pig. Pig starts with P. Find one that starts with B!"; maths: "5 + 3 makes 8.
  Find one that makes 10!"; parity "7 is odd. Find an even number!".
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, "bé {child}" → "bé".
- **Initials (age 6–7)**: first letter of the bare noun (no classifier), diacritics stripped. EN animals as the parade
  (cow C … goldfish G), toys ball B, duck D, umbrella U, kite K, car C. VI bò B, heo H, cừu C, vịt V, gà mái G, ngựa N, dê D,
  cua C, cá vàng C, chim cánh cụt C, sư tử S, khỉ K; toys bóng B, vịt cao su V, ô O, diều D, xe ô tô X.
- Numbers in prompts / thing names are **digits** ("Pop 3 bubbles!", "the bubble with 4 stars") — the numeral on screen
  matches; TTS reads them. Count runs use words ("One, two, three! Three bubbles!").

## 1. API (`PB.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | a random variant. Raw params are named: `{color:'red'}`, `{shape:'star'}` (+ `{shapes}` plural), `{animal:'cow'}` (+ `{animals}`), `{size:'big'}` / `{big:true}`, `{parity:'odd'}`, `{home:'ice'}` → "on the ice" / "ở xứ băng", `{season:2}`, `{who:'penguin'}` → "the penguin", `{n:3}` → `{n}` "3", `{num}` "three", `{starWord}`, `{bubbleWord}`; `{thing:{…}}` → "a red ball" |
| `ask(lang, promptKey, params, {first, rng})` | the question. `params.k > 1` → `.many` ("Pop the red ones!" / "Bé chọc các bong bóng màu đỏ nhé!"); `first` → `.first` / `.many.first` ("Look at the bubbles! Pop the red one!"). Missing param → `p.any`. `p.countPop {n}` "Pop 3 bubbles!" (toys only, talks about bubbles only), `p.countSel {n}` "Which bubble has 4 stars inside? Pop it!" / "Bé tìm bong bóng có 4 ngôi sao rồi chọc nhé!" (1 star; `.first` "Count the stars in each bubble! Which bubble has 4 stars inside? Pop it!"), `p.home {home, k}` k = 1 "Pop the one who lives on the ice!", k > 1 "Who lives on the farm? Pop them!" |
| `sayRight(lang, e, rng?)` | `e = {thing, left, k, i, home?, count?, mode, rule, topic, promptKey, params}`. toy / shape / tile / animal → "A red ball!", "Letter W!", "Small w!" (+ more line); **home rule** → "The penguin lives on the ice!" / "Chim cánh cụt sống ở xứ băng!"; initial → "A horse! Horse starts with H!"; sum / diff → "9 + 1 makes 10!"; parity → "8 is even!"; **countSel (stars thing)** → the count run "One, two, three, four! Four stars!"; **countPop** (`mode:'countPop'` or rule `count`) → `sayCount(count)` "Two!", the last pop (`left 0`) "Three! Three bubbles!" |
| `sayWrong(lang, e, rng?)` | `e = {got:{nameKind,nameValue}, thing?, want:{rule} \| want \| rule, streak, …}` → names it + the goal (see §0). Without `thing` the thing is rebuilt from `got`; without a rule it comes from promptKey + params |
| `sayWrongHint(lang, e, rng?)` | the miss that brings the hint: "That’s a little orange car. Look at the shiny one!" |
| `sayCount(lang, i)` | "One!" … "Twenty!" (= `count.<i>`) |
| `sayCountRun(lang, n, kind)` | kind `'bubbles'` (default) / `'stars'` → "Three bubbles!", "Four stars!", "One bubble!" / "Ba bong bóng!", "Bốn ngôi sao!" |
| `countList(lang, n)` | "One, two, three, four!" (the counting part alone) |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the red ball" (default art `the`); opts `{art: 'the' \| 'a' \| null, color, size, who}`; Talk icons color / number / home / size |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapes, toy (obj), toyWord, thing, stars, animal, animals, word, who, home, homeAt, lives, number / n, letter, sum, diff, parity, size, season, text / tile` |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms (lower-case + no-diacritic forms; numbers: digits, "số ba", "three stars"). Kinds as `name` + aliases `n, stars, obj, farm, tile` |
| `initial(lang, kind, value \| thing)`, `bareWord(…)`, `initialOf(lang, v)` | first letter / bare noun (content.js uses these or `name()` for the initial topic) |
| `talkWrong(lang, choice, talk?)` / `talkWrong(lang, kind, value, talk?)` | "It is blue! Good try!", "It is a circle!", "There are 4 stars! Good try!" (talk.topic `count`), "The penguin lives on the ice! Good try!" (home choice + `talk.show.animal`) |
| `speech(lang, text)` | TTS text (`Voice.say` calls it): letter names ("letter D" → "letter dee", "big A / small a", "D is for", "start(s) with C", "Listen: B"), + − =, "…" → ", ", ALL-CAPS display emphasis → lower-case, vi "chữ B" → "chữ bờ" |
| helpers | `homeOf(animal)`, `thingFromName(nk, nv)`, `ruleOf(e)`, `setChild`, `has`, `keys`, `raw`, `kindValue(choice)`, `numberName`, `stripMarks` |
| constants | `langs, TOPICS, COLORS, SHAPES, TOYS (OBJECTS alias), ANIMALS, HOMES, SEASONS, ANIMAL_HOME, RULE_KINDS, THING_KINDS (MEMBER_KINDS alias), PROMPTS, PARAMS, NAME_TABLE, LETTER_VI, MAX_COUNT` |

Rule kinds: `color, shape, size, count (countPop), n (countSel), animal, home, letter, lower, initial, sum, diff, parity`
(aliases number / stars → n, countPop → count, farm → home, add → sum, sub → diff, oddeven → parity). A `letter` rule
switches to the `lower` wording when topic is `lower` or promptKey `p.lower`.

**What main.js must call differently from the parade**
- `ask(lang, e.promptKey, e.params, {first})` — pass `params` with `k` (content puts it there) so plural forms are chosen.
- `sayRight(lang, e)` — pass the world `right` event as is (it carries `left`, `count`, `home`) **plus** `mode: round.mode`,
  `rule`, `topic`, `promptKey`, `params`. The parade's `count: {n}` object still works, but countPop now needs `count`
  (= i + 1) per pop: there is **one line per pop** ("One!" "Two!" "Three! Three bubbles!").
- `sayWrong(lang, e)` — add `thing: world.bubbleById(e.id).thing` (not `memberById`).
- `sayCountRun(lang, n, kind)` — the 3rd argument is now the noun kind (`'bubbles' | 'stars'`), not "othersN". There is
  no `countOthers` key.
- Keys gone: `woof, gate, gateShort, door, march, bye, enter`→(kept as an alias of `blow`), `surprise.chick / rooster /
  fireflies`, `chick.tap`, `rooster.tap`, `firefly.tap`, `bo.poke` (→ `poke`), `right.<kind>` / `wrong.<kind>`,
  `talk.wrong.apples` (→ `talk.wrong.stars` via `talkWrong`). New: `blow, rainbow, whoosh, poke, surprise.bird, bird.tap,
  surprise.kite, kite.tap, surprise.snow, snow.tap, ui.tapBao` (ui.tapBo kept).

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (proven in the sister games; restated after functional QA 13 Nov 2026 found main.js letting a right pop
cut the protected prompt and a Bao tap cut "One!"):
1. **Prompts are protected** (`speakPrompt`): the guard lasts until the prompt has been heard once — from its `onStart`
   600 ms + 95 ms × chars (if it never starts, 6 s after it was queued). While protected, **feedback queues behind it**
   (`interrupt: false`); a right pop never cuts the question. Only after the guard ends may feedback interrupt.
2. **Count lines are never cut**: every countPop count ("One!", "Two!", "Three! Three bubbles!") and the countSel run are
   spoken `priority: true`, `interrupt: false` and are themselves protected (600 ms + 95 ms × chars). The next pop's count
   queues behind the previous one (queue ≤ 2 — that is enough: ≥ 0.4 s between pops); nothing else interrupts them.
3. **The wrong line is protected** the same way once it starts; ≤ 1 wrong line per 1.5 s.
4. **Bao / bubble / surprise taps never cut a protected or count line**: while one is playing, `pokeBao` only giggles visually
   (no voice) and the question is **queued** (once, not repeated) to follow it; a tap line (`bird.tap`, `kite.tap`,
   `snow.tap`, `poke`) is spoken only when nothing is speaking.
5. The hint is priority; **praise rate limit**: skip a new praise if one started < 1.2 s ago, and say praise only where the
   table says; speech is log-only for `speed > 1`.
6. **A question is only repeated while it can be answered** (`world.interactive`, phase `play`). Sound-only events (no line):
   `blow`, `bubbleIn`, `pop`, `paint`, `squish`, `soft`, `away`, `gust`, `count`.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)`, then `t('weather.'+weather)` ("Spring in the clouds!" / "Sunny summer!" / "Windy autumn!" / "Snowy winter!") | interrupt, weather queued |
| `round {round, surprise}` | bubble text `t('blow')` (not spoken) | — |
| `blow {i}` (first bubble of a chapter's round 0 only, **rarely**) | `t('blow')` ("Here come the bubbles!") — at most once per chapter, only if nothing speaks; never in later rounds | queue, droppable |
| `ask {promptKey, params, first}` | `ask(lang, promptKey, params, {first: first && round === 0})`; bubble + voice; remember the text for `pokeBao` / `idle` | **protected prompt** (`priority`) |
| `right {id, thing, i, k, left, home?, count?}` | `sayRight(lang, e + {mode, rule, topic, promptKey, params})`. countPop: one count line per pop ("Two!"), last "Three! Three bubbles!"; countSel: the count run | interrupt (feedback) only once the prompt guard has ended — else queue; **countPop counts and the countSel run: priority, never interrupt, protected, never cut** (rule 2) |
| `count {id, i}` | — (rising pip; the run says the numbers — do **not** also speak `sayCount`) | |
| `wrong {id, got, want, streak, x, y}` | `sayWrong(lang, e + {thing: world.bubbleById(e.id).thing, rule, topic, promptKey, params})`; the miss that brings the hint (`e.hint` or the 2nd miss): `sayWrongHint`; ≤ 1 wrong line per 1.5 s (`squish` = same bubble again: no line) | interrupt unless protected; then protected |
| `soft {x, y}` | — (tiny bubbling) | no line |
| `hint {id}` | nothing when the wrong line already pointed at it; else `t('hint')` | **priority** |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, then pause after the 5th) | queue |
| `pokeBao` | play: repeat the current prompt (> 3 s after it was asked, not while it is still spoken); while a protected / count line plays: **queue** the prompt once (rule 4); otherwise (blow / rainbow / whoosh) `t('poke')` ("Hee hee! That tickles!") **only when nothing is speaking** | interrupt the prompt only when nothing protected plays; else queue |
| `roundDone {stars, misses}` | **no line** (the right line just named the last thing) | — |
| `rainbowDone {x, y}` | `t('rainbow')` **only** in the chapter's last round or after a round with a miss — and then it *is* the praise (rate limit 1.2 s); otherwise silent (the shimmer chime says it) | queue, droppable |
| `whoosh {}` | `t('whoosh')` **rarely**: chapter 1 round 0 (to name the gesture) and then ≤ 1 in 4 rounds, only when nothing speaks | queue, droppable |
| `bird` / `birdTap` | `t('surprise.bird')` / `t('bird.tap')` | queue (never over a protected prompt) / interrupt only if nothing protected; ≤ 1 tap line per 2 s |
| `kite` / `kiteTap` | `t('surprise.kite')` / `t('kite.tap')` | same |
| `snow` / `snowTap {x, y}` | `t('surprise.snow')` / `t('snow.tap')` | same |
| pause → resume | play: the prompt; Talk: the question while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | queued, protected |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | interrupt |
| `talkResult` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` (pass `talk`: home answers name the animal, count answers say stars) | interrupt |
| `levelDone` | `t('great')` | queue |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | interrupt, then queue |

### 1.2 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice, mic, done, stars, chapter {n},
  allDone {stars}, welcome {child}, micUnsupported, micDenied, voiceMissing, tapOrSay, listening ("Bao is listening…" /
  "Bảo đang nghe…"), tapBo (kept) = tapBao, tapHint, doorHint (kept, "Pop the bubbles"), skip, gallery, langName.en/vi`.
- **topic.\***: colors "Colour Bubbles" / "Bong bóng sắc màu", shapes "Shape Bubbles" / "Bong bóng hình khối", size "Big and
  Little" / "To và nhỏ", count "Counting Bubbles" / "Cùng đếm bong bóng", animals "Animal Homes" / "Nhà của các bạn thú",
  letters, lower, initial, add, sub, oddeven.
- **weather.0..3** (2 wordings, the first is canonical): spring / summer / autumn / winter.
- **Prompts** `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape}`, `p.size {big}`, `p.countPop {n}`, `p.countSel {n}`,
  `p.animal {animal}`, `p.home {home}`, `p.letters {letter}`, `p.lower {letter}`, `p.initial {letter}`, `p.add {n}`,
  `p.sub {n}`, `p.oddeven {parity}` — each with `.first`; all but countPop / countSel / lower with `.many` + `.many.first`;
  `p.any`.
- **Lines**: `right.thing {thing}`, `right.home {who, home}`, `right.initial {thing, word, first}`, `right.sum / diff {expr,
  ans}`, `right.parity {num, parity}`, `right.more1(.who|.color)`, `right.moreN(.who|.color) {num}`, `right.any`;
  `wrong.is {thing}`, `wrong.stars {thing}`, `wrong.livesAt {home}`, `wrong.starts {word, first}`, `wrong.expr {expr, ans}`,
  `wrong.parity {num, parity}`, `wrong.hint`, `wrong.any`; `goal.{color, shape, size, n {what}, animal, home, letter, lower,
  initial, sum, diff, parity, any}`; `blow`, `enter` (= blow), `rainbow {child}`, `whoosh`, `poke`, `surprise.bird`,
  `bird.tap`, `surprise.kite`, `kite.tap`, `surprise.snow`, `snow.tap`, `praise`, `great {child}`, `party`, `hint`,
  `idle {child}`, `session.done {stars}`, `count.0..20`.
- **Talk** (content.js `makeTalk`): `talk.intro, talk.right`; `talk.color(s)` "What colour is this?", `talk.colorsWhich`,
  `talk.shape(s) {shape}` "Which one is the circle?" / "Hình tròn là cái nào nhỉ?", `talk.size {size}`, `talk.count` "How
  many stars?", `talk.home / talk.animals {animal}` "Where does the penguin live?" / "Chim cánh cụt sống ở đâu nhỉ?",
  `talk.who` "Who is this?", `talk.letters`, `talk.lower {letter}`, `talk.initial {letter, nameKind, nameValue}` (the word
  comes from nameValue; the letter is never said), `talk.add / sub {a, b}`, `talk.oddeven {parity}`;
  `talk.wrong(.a, .animal, .size, .letter, .small, .number, .stars, .star1, .home, .place, .any)`.

## 2. Voice (`PB.Voice`) — the proven engine (unchanged behaviour)
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**), `say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken,
reason}>`, `sayKey(key, params, opts)` (promise `.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`,
`voiceName(lang)`, `onStart(display)` / `onEnd`, `onVoicesChanged(fn)`, `log` (+ `PB.debug.voiceLog`) — **every line**, also
when muted / at test speed, `spoken(lang, text)`, `RATE` 0.9 / **`PITCH` 1.15**, `canListen()`, `listen({lang, choices,
timeoutMs}) → Promise<{id|null, transcript, reason?}>`, `stopListening()`, `isListening()`, `onListen(bool)`,
`match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium preferred; novelty voices avoided.
- Bao: **rate 0.9, pitch 1.15** (a gentle little panda — a touch lower than Bo's 1.2; above ≈ 1.3 iOS voices go robotic,
  rate < 0.85 smears Vietnamese tones).
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms (feedback); watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume
  every 10 s — Chrome cuts utterances at ~15 s, matters for the 12-star count run); page hidden → stop. Before `unlock()`
  only the newest line is kept.
- Recognition: fuzzy matcher (exact tokens, no-diacritic tokens, number words → digits, edit distance 1–2 for longer words,
  ambiguous → no match, interim matches wait 450 ms). The mic is hidden when `!canListen()`.
- Ducking: duck the music bed on `onStart`, restore on `onEnd`.

## 3. iOS / Safari findings (carried over from the parade, re-checked 13 Nov 2026 — nothing new)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+) — `Audio.unlock()` sets it. While the mic listens `voice.js`
  switches to `'play-and-record'` and restores the previous type afterwards.
- **First utterance inside a gesture**: `unlock()` in the first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`; lines queued before the first tap are re-timestamped.
- **Vietnamese voice "Linh"** is built into iOS/iPadOS; `voice.js` sets `utterance.voice` by name. iOS 26 still ignores the
  voice chosen in Spoken Content for web speech and downloaded Enhanced voices are often missing from `getVoices()` (since
  iOS 18) — so we never rely on the default voice. Parents: **Settings › Accessibility › Spoken Content › Voices ›
  Vietnamese**. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) needs **Siri & Dictation** on, usually a network, and is **missing in
  Home-Screen mode** → `canListen()` false; `not-allowed` disables it for the session. `vi-VN` results often lack diacritics
  or tones — the matcher compares stripped forms. Tap answers always work.
- WebKit hang: `start()` after an `<audio>` element played may never fire events → no `<audio>`, a fresh recognizer per
  `listen()`, a timeout always resolves. After backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on
  return. iPadOS desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4) — tested.
Sources: Apple Developer Forums 804648 (iOS 26 voice regression) and 764438 (voices missing from Web Speech since iOS 18);
MDN `AudioSession.type`; W3C Audio Session WD; WebKit Bugzilla.

## 4. Input (`PB.Input`) — one-finger TAP, judged on pointer DOWN
```js
const detach = PB.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y), // bubbles move: the PRESS is judged at once (pop / squish / soft / Bao)
  move:   (x, y, ev) => world.pointerMove(x, y), // still delivered (the world ignores it in play)
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object.** `down` fires synchronously inside `pointerdown` (`touch-action: none`, `preventDefault`,
pointer capture) — no tap delay, so a drifting bubble is hit where the finger lands. **One active pointer**: extra fingers
are ignored (a resting second hand never pops a second bubble); a stuck pointer is recovered (new primary touch, missing
touch, silence ≥ `Input.STALE_MS` 6 s). Targets `button, .screen, #hud, .no-game-input` are skipped. Touch + mouse
fallback without `PointerEvent`.
- `kidProof()`: blocks pinch, double-tap zoom, long-press callout / selection, rubber-band & pull-to-refresh, context menu,
  Ctrl/⌘ zoom and refresh keys. `holdButton(el, ms = 2000, onDone, onProgress)` → `off()`: the parent gate (tested).
- Functional QA must drive **real CDP touch events** (a tap on a moving bubble at `debug.bubbleScreen(id)`).

## 5. Adding a thing / a language
- New toy: `TOYS`, `NAMES.*.toy | toyWord`, `WORDS.*.toy`, `TOY_INITIAL` in the test. New animal: `ANIMALS`, `ANIMAL_HOME`,
  `NAMES.*.animal | animals | word | who`, `WORDS.*.animal`. New home: `HOMES`, `NAMES.*.home | homeAt`, `WORDS.*.home`.
- New prompt: `PROMPTS` + `p.x`, `.first` (+ `.many`, `.many.first`) in both languages; the test's `PROMPT_VALUES`.
- New rule kind: `RULE_KINDS`, `goal.<kind>` in both languages, `sayRight` / `wrongIs` / `goalParams` branches.
- New language: `LANGS`, every `NAMES[xx]` table, `NOUN`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, a complete `STR[xx]`
  (identical key set and params — tested), `CHILD_FALLBACK[xx]`, phrase word order; `voice.js`: `LANG_TAG`, `PREFERRED`.
