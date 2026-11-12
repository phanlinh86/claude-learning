# Bo's Farm Parade — Voice, language and input

Files: `game/js/i18n.js` (`FP.I18N`), `game/js/voice.js` (`FP.Voice`), `game/js/input.js` (`FP.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 47 800 checks, self-contained): identical key sets **and identical `{params}`**
in en / vi, every `ui.*` key that `index.html` / `ui.js` / `main.js` use, 3 wordings + a `.first` long form for every prompt,
3 wordings for every right / wrong line, Vietnamese diacritics and a warm "Bé ơi, … nhé!/nhỉ?" wording per prompt, a negative-
word ban, tidy rendering of every key (no `{x}`, no "a oval", no "màu màu", capital after a stop, child name / no name), every
name kind × value, `initial()` for every animal and object in both languages, `words()` (name + no-diacritic + digit forms;
no form shared by two values) matched back by the matcher, DESIGN example lines exactly, a sweep of ≈ 7 000 rule × member ×
wording combinations (right names the odd one and why; wrong names the tapped one, says it matches its friends, then the goal),
Talk lines + `talkWrong`, speech text, the input layer (fake DOM), parent gate, voice queue / interrupt / unlock / volume /
speed with a fake `speechSynthesis`, recognizer. **When the parade `content.js` exists** (it does) the test renders the ask,
the right line of the odd member and the wrong line of every other member of 200 `makeRound` rounds (ages 3–7, EN + VI),
and every `makeTalk` question + choice.

## 0. Wording principles (Bo)
- **Bo** is a little caramel puppy, the farm's parade leader. EN "Bo"; VI lines "Bo", titles **"Cún Bo"**. Title "Bo’s Farm
  Parade" / "Cún Bo Tìm Bạn Lạc Đàn"; logo lines "Bo’s" / "Farm Parade", "Cún Bo" / "Tìm Bạn Lạc Đàn".
- **TTS of "Bo" — no rewrite.** English voices read /boʊ/, "bo" is an ordinary Vietnamese syllable. `speech()` keeps it.
- **The question is "not"**: odd-one-out is asked as "Which one is NOT red?" / "Bạn nào không phải màu đỏ?" — "not" and
  "không phải" are allowed; the capital NOT is display emphasis only (`speech()` sends "not"). Banned (tested): no / nope /
  wrong / incorrect / bad / fail / mistake / oops / sorry / "no!" and sai / sai rồi / dở / tệ / hỏng / không đúng / chưa đúng /
  trật / nhầm / hư.
- **Things (VI)**: cái xô, chiếc ủng, bình tưới, xe máy cày, chậu hoa; khối hình … (block: "khối hình ngôi sao"); thùng có
  ba quả táo (crate), quả táo (counted); con bò, con heo, con cừu, con vịt, con gà mái, con ngựa, con dê, con cua, bể cá vàng,
  chim cánh cụt, sư tử, con khỉ; homes nông trại, biển, xứ băng, đồng cỏ châu Phi, rừng rậm. In home lines the subject of
  the fishbowl is **"bạn cá vàng"** (the fish lives somewhere, not its bowl); EN the fishbowl is "the goldfish".
- **Colours**: `name('vi','color','red')` = "màu đỏ"; lines never write "màu {color}". Shapes in prompts / lines are VI
  "hình ngôi sao", "hình trái tim" (shapeH); the bare shape names stay "ngôi sao", "trái tim".
- **Wrong lines** name what was tapped *without* the shared attribute ("That’s the boot. It’s red, like its friends." — not
  "the red boot is red"), say it matches its friends, then the goal. **Right lines** name the odd one *with* its difference
  and why ("The blue bucket! It’s not red.").
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, "bé {child}" → "bé".
- **Initials (age 6–7)**: first letter of the bare noun (no classifier), diacritics stripped to the base letter.
  EN cow C, pig P, sheep S, duck D, hen H, horse H, goat G, crab C, penguin P, lion L, monkey M, goldfish G; bucket B, boot B,
  watering can W, tractor T, flower F. VI bò B, heo H, cừu C, vịt V, gà mái G, ngựa N, dê D, cua C, cá vàng C, chim cánh cụt C,
  sư tử S, khỉ K; xô X, ủng U, bình tưới B, xe máy cày X, chậu hoa C. (content.js additionally leaves out VI words that start
  with a digraph — ch, kh, ng, … — so "chim cánh cụt", "khỉ", "ngựa", "chậu hoa" never appear in a VI initial round.)

## 1. API (`FP.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).
`e` for `sayRight` / `sayWrong` = the world event **plus** `{ topic: world.topic, promptKey: round.promptKey, params:
round.params, rule: round.rule }`. The world's `right` carries `thing`; for `wrong` add the tapped member's thing
(`world.memberById(e.id).thing`) — if it is missing it is rebuilt from `e.got {nameKind, nameValue}`; `e.want` (= the rule)
also works when `rule` is missing, and as a last resort the rule comes from topic / promptKey / params.

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'cow'}`, `{size:'big'}`, `{parity:'odd'}`, `{home:'ice'}` (→ "on the ice"), `{n:3}` → `{num}` "three" + `{apples}` "apples"/"apple"; `{thing:{…}}` → its phrase |
| `ask(lang, promptKey, params, {first, rng})` | the parade question; `first:true` → the long form "They’re all red… but one! Which one is NOT red?" (missing param → `p.any` "Which one is different?") |
| `sayRight(lang, e, rng?)` | per rule kind — color "The blue bucket! It’s not red." / "Cái xô màu xanh dương! Nó không phải màu đỏ."; shape "The star! It’s not a circle." / "Khối hình ngôi sao! Nó không phải hình tròn."; size "The sheep! It’s the little one."; **n → the count run** "One, two, three, four apples! The others have two."; animal "The pig! It’s not a cow." / "Con heo! Bạn ấy không phải con bò."; home "The penguin! The penguin lives on the ice." / "Chim cánh cụt! Chim cánh cụt sống ở xứ băng."; letter "Letter B! It’s not letter A."; lower "Small m! It’s not big A or small a."; initial "The pig! Pig starts with P, not C." / "Con heo! Heo bắt đầu bằng chữ H, không phải chữ B."; sum / diff "2 + 4 makes six! The others make five."; parity "Seven! Seven is odd. The others are even." |
| `sayWrong(lang, e, rng?)` | color "That’s the boot. It’s red, like its friends. Find the one that’s not red!" / "Đây là chiếc ủng. Bạn này màu đỏ giống các bạn kia. Mình tìm bạn không phải màu đỏ nhé!"; shape "That’s the circle, just like its friends. Find the one that’s not a circle!"; size "That’s the cow. It’s big, like its friends. Find the little one!"; n "That crate has two apples, like its friends. Find the crate that doesn’t have two apples!"; animal "That’s the cow, like its friends. Find the one that’s not a cow!"; home "That’s the hen. The hen lives on the farm, like its friends. Who doesn’t live on the farm?"; letter / lower / initial / sum / diff / parity likewise ("Four is even, like its friends. Find the number that’s not even!") |
| `sayCount(lang, i)` | "One!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `sayCountRun(lang, n, othersN?)` | "One, two, three, four apples! The others have two." / "Một, hai, ba, bốn quả táo! Các thùng kia có hai quả."; n = 1 "One apple!" |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the blue bucket", "the orange watering can", "the star", "the crate with three apples", "letter B", "small b", "2 + 3", "the little sheep", "the penguin" / "cái xô màu xanh dương", "chiếc ủng nhỏ màu đỏ", "khối hình trái tim", "thùng có một quả táo", "chữ b thường", "số bảy"; Talk icons: colour, number, home, size. opts `{color, size, who, art}` |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapeH, obj, objWord, block, crate, apples, animal, word, who, home, homeAt, number / n, letter, sum, diff, parity, size, text` |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms (lower-case + no-diacritic forms; numbers: digits, "số ba", "three apples" / "ba quả táo"). Kinds as `name` plus aliases `n, crate, farm, block, tile`. Talk: colour blobs, shape blocks, numbers, **home words** ("on the ice", "dưới biển", "rung ram" …), animals ("piggy", "con lợn", "cá vàng" …) |
| `initial(lang, kind, value)` / `initial(lang, thing)` | first letter of the bare noun ("con bò" → "B", "chim cánh cụt" → "C", "ủng" → "U", watering can → "W") |
| `bareWord(lang, kind, value)` | that noun ("bò", "watering can"); `initialOf(lang, v)` → `{word, first}` (compat) |
| `talkWrong(lang, choice, talk?)` / `talkWrong(lang, kind, value, talk?)` | "It is blue! Good try!", "It is an oval! Good try!", "There are three apples! Good try!" (talk.topic 'count'), "The penguin lives on the ice! Good try!" (home choice + `talk.show.animal`), "It is the cow! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "big A / small a", "P is for", "start(s) with C", "not C"), + − =, "…" → ", " (final "…" → "."), "NOT" → "not", vi "chữ B" → "chữ bờ"; "Bo" unchanged |
| `homeOf(animal)`, `setChild`, `has`, `keys`, `raw`, `kindValue(choice)`, `numberName`, `stripMarks` | helpers |
| constants | `langs, TOPICS, COLORS, SHAPES, OBJECTS, ANIMALS, HOMES, ANIMAL_HOME, RULE_KINDS, MEMBER_KINDS, PROMPTS, PARAMS, NAME_TABLE, LETTER_VI, MAX_COUNT` |

Rule kinds: `color, shape, size, n, animal, home, letter, lower, initial, sum, diff, parity` (aliases count / number → n,
farm → home, add → sum, sub → diff, oddeven → parity). content.js sends the p.lower round's rule as `letter`; `sayRight` /
`sayWrong` switch to the `lower` wording when topic is `lower` or promptKey `p.lower`.

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (proven in the sister games): *prompts are protected* (`speakPrompt`: the guard lasts until the prompt has
been spoken — from its `onStart` 600 ms + 95 ms × chars); *feedback (right / wrong) interrupts* unless the prompt is still
protected (then queue); *the wrong line is protected the same way*; *the count run is never cut* (queued, protected; the
world's `count` events light the apples while it is said); *praise and gate queue, the hint is priority*; skip a new praise if one
started < 1.2 s ago. **Talk load (playtest P1-3, 2026-11-12):** the long `.first` question only in a chapter's round 0; no line
at `roundDone`; ONE praise at `parade` only after a round with a miss or in the chapter's last round; no `march` line; the gate is
spoken only in chapter 1 (`gate` at round 0, `gateShort` with the ghost hand) — later gates are silent (bubble + hand + creak).
**A question is only repeated while it can be answered** (`world.interactive`): Bo / bubble taps during enter, hop or the count
run never cut a line; `memberIn`, `land`, `soft`, `marchStep`, `inBarn`, `doorClose` have **no line** (sound only); speech is
log-only for `speed > 1`.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)` (banner + voice), then `t('weather.'+weather)` ("Good morning, farm!" / "Sunny noon!" / "Sunset time!" / "Starry night!") | interrupt, weather queued |
| `round {round, surprise}` | `t('enter')` in the bubble ("Here comes the parade!"), not spoken — the ask follows | — |
| `memberIn` | — (step "tok" / wagon rattle, settle) | no line |
| `ask {promptKey, params, first, round}` | `ask(lang, promptKey, params, {first: first && round === 0})` — the long "…but one!" form only in a chapter's first round; bubble + voice; remember it for `pokeBo` / `idle` | **protected prompt** (`priority: true`) |
| `right {id, thing, x, y, count?, home?}` | **`t('woof')` is NOT said separately**: say `sayRight(lang, e + {topic, promptKey, params, rule})` (crates: the count run); the bark is the synth sound | interrupt (feedback), never over a protected prompt (then queue); a count run is queued + protected |
| `count {id, i, x, y}` | — (rising "pip"; the count run says the numbers — do **not** also speak `sayCount(i)`) | |
| `land {id, x, y}` | — (thump; for animals the home badge shows; the home is in the right line) | |
| `wrong {id, got, want, streak, hint?, x, y}` | `sayWrong(lang, e + {thing: world.memberById(e.id).thing, topic, promptKey, params, rule})` — first wording ≤ ~55 chars ("The boot is red like its friends! Which one isn’t red?" / "Chiếc ủng màu đỏ giống các bạn! Bạn nào khác màu nhỉ?"); when `e.hint` (this miss brings the hint): `sayWrongHint` ("The boot, like its friends! Look at the glowing one!" / "Chiếc ủng giống các bạn kia! Bé nhìn bạn đang sáng nè!"); ≤ 1 wrong line per 1.5 s | interrupt unless protected; then **protected** 600 + 95 ms × chars |
| `soft {x, y}` | — (dust puff). 3 soft taps → the world's `hint` | no line |
| `hint {id}` | nothing when the wrong line already pointed at it; else (3 soft presses, or the wrong line was rate-limited) `t('hint')` ("Psst! Look at the glowing one!") | **priority** (never dropped as stale) |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, then quiet) | queue |
| `pokeBo` | play (`world.interactive`): repeat the current prompt (> 3 s after it was asked, not while it is still spoken); `{gate}` → `t('gateShort')` if nothing is speaking; `{busy}` (enter / hop / count run / march) → `t('bo.poke')` ("Woof! That tickles!") **only when nothing is speaking**, never a prompt | interrupt (prompt), queue (giggle) |
| bubble tap | play: repeat the prompt; gate (doors shut): `gateShort` + the door hand; otherwise nothing | interrupt |
| `roundDone {round, stars, misses}` | **no line** (the right line just said why) | — |
| `gateAsk {}` | bubble `t('gate')` / `t('gateShort')`; **spoken only in chapter 1 round 0** (`t('gate')` "Open the barn!" / "Bé mở cửa chuồng nào!") | queue after the right line, protected |
| `gateHint {}` (ghost hand, 2 s into the gate) | chapter 1 only: `t('gateShort')` if nothing is speaking | queue |
| `doorOpen {x, y, auto?}` | — (creak + clunk); optional bubble `t('door')` | no voice |
| `parade {round, grand, x, y}` | ONE praise `t('great')` (3★) / `t('praise')` — only after a round with a miss or when `grand` (round 3); **no `march` line**. `grand`: the long fanfare (`fanfareBig`), a 40-piece confetti burst, Bo dances | queue, droppable (only if nothing is speaking) |
| odd one hops off home | optional `t('bye')` bubble | no voice |
| `chick` / `chickTap` | `t('surprise.chick')` / `t('chick.tap')` ("Peep peep!") | queue / interrupt (tap), never over a protected prompt |
| `rooster` / `roosterTap` | `t('surprise.rooster')` / `t('rooster.tap')` ("Cock-a-doodle-doo!" / "Ò ó o!") | same |
| `fireflies` / `fireflyTap {x, y}` | `t('surprise.fireflies')` / `t('firefly.tap')` (≤ 1 tap line per 2 s) | same |
| pause → resume | play: the prompt; hop: the right line again (a count run → the crate's name only); gate (doors shut): `gateShort`; Talk: the question only while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | queued after the praise; protected |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3; Bo answers 2 s after the 3rd) | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` (pass `talk` so the home answer names the animal and count answers say apples) | interrupt |
| `levelDone` | `t('great')` | queue |
| `sessionDone {stars}` | `t('party')` ("Look at our big parade!"), then `t('session.done', {stars})` | interrupt, then queue |

### 1.2 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Bo’s voice" / "Giọng của Cún Bo"),
  mic, done, stars, chapter {n}, allDone {stars}, welcome {child}, micUnsupported, micDenied, voiceMissing, tapOrSay,
  listening ("Bo is listening…"), tapBo, tapHint, doorHint, skip, gallery, langName.en, langName.vi`.
  (Gone: `ui.tapKiki`, `ui.swipeHint` → `ui.tapBo`, `ui.doorHint`.)
- **topic.\***: colors "Colour Parade" / "Diễu hành sắc màu", shapes "Shape Parade" / "Khối hình vui nhộn", size "Big and
  Little" / "To và nhỏ", count "Apple Counting" / "Cùng đếm táo", animals "Farm Friends" / "Bạn thú nông trại", letters,
  lower, initial, add, sub, oddeven.
- **weather.0..3** (2 wordings each, the first is the canonical one).
- **Prompts** (3 wordings + `.first`): `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape}`, `p.size {}`, `p.sizeBig {}`
  ("Which one is the big one?" / "Bé ơi, bạn nào to nhất nhỉ?" — size rounds 1 and 3),
  `p.count {n}` (`{num} {apples}`), `p.animal {animal}`, `p.farm {}`, `p.letters {letter}`, `p.lower {letter}` (`{lower}`),
  `p.initial {letter}`, `p.add {n}`, `p.sub {n}`, `p.oddeven {parity}`; `p.any`.
- **Lines**: `right.{color, shape, size, animal, home, letter, lower, initial, sum, diff, parity, any}`, `countOthers {num}`,
  `wrong.{color, shape, size, n, animal, home, letter, lower, initial, sum, diff, parity, any}` (first wording short), `wrong.hint {thing}`
  (the miss that brings the hint; `sayWrongHint(lang, e)`), `woof`, `gate`, `gateShort`,
  `door`, `march {child}`, `bye`, `surprise.chick`, `chick.tap`, `surprise.rooster`, `rooster.tap`, `surprise.fireflies`,
  `firefly.tap`, `bo.poke`, `enter`, `praise`, `great {child}`, `party`, `hint`, `idle {child}`, `session.done {stars}`,
  `count.0..20`.
- **Talk** (content.js `makeTalk`): `talk.intro, talk.right`; `talk.colors` "What colour is this?" (never says the colour),
  `talk.colorsWhich {color}`, `talk.shapes {shape}` "Which one is the triangle?" / "Hình tam giác là khối nào nhỉ?",
  `talk.size {size}` (→ `talk.sizeAny`), `talk.count` "How many apples?" (never says n), `talk.animals {animal}` "Where does
  the penguin live?" / "Chim cánh cụt sống ở đâu nhỉ?" (aliases `talk.farm`, `talk.home`; → `talk.homeAny`), `talk.who`
  "Who is this?", `talk.letters`, `talk.lower {letter, small}`, `talk.initial {letter, nameKind, nameValue}` ("Which letter
  does cow start with?" — the word comes from nameValue, the letter is never said), `talk.add / sub {a, b}`, `talk.oddeven
  {parity}`; `talk.wrong(.a, .animal, .size, .letter, .small, .number, .apples, .home, .place, .any)`.

## 2. Voice (`FP.Voice`) — the proven engine (unchanged behaviour)
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**, `say` resolves `{spoken:false, reason:'speed'}`; `init` reads `?speed=`),
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `FP.debug.voiceLog`), `spoken(lang, text)`, `RATE` 0.9 / `PITCH` 1.2, `canListen()`,
`listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null, transcript, reason?}>`,
`stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox, Bells …) −60.
- Bo: **rate 0.9, pitch 1.2** (a small bright puppy; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s —
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.
- Recognition: fuzzy matcher (exact tokens, no-diacritic tokens, number words → digits, edit distance 1–2 for longer words,
  ambiguous → no match, interim matches wait 450 ms). The mic is hidden when `!canListen()`.
- Ducking: duck the music bed on `onStart`, restore on `onEnd`.

## 3. iOS / Safari findings (re-checked 12 Nov 2026 — nothing new since 10 Nov)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+) — `Audio.unlock()` sets it. While the mic listens `voice.js`
  switches to `'play-and-record'` and restores the previous type afterwards.
- **First utterance inside a gesture**: `unlock()` in the first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`; lines queued before the first tap are re-timestamped.
- **Vietnamese voice "Linh"** is built into iOS/iPadOS; `voice.js` sets `utterance.voice` by name. iOS 26 still ignores the
  voice chosen in Spoken Content for web speech and downloaded Enhanced voices are often missing from `getVoices()` (reported
  since iOS 18) — so we never rely on the default voice. Parents: **Settings › Accessibility › Spoken Content › Voices ›
  Vietnamese**. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) needs **Siri & Dictation** on, usually a network, and is **missing in
  Home-Screen mode** → `canListen()` false; `not-allowed` disables it for the session. `vi-VN` results often lack diacritics
  or tones ("mầu đổ", "o xu bang") — the matcher compares stripped forms. Tap answers always work.
- WebKit hang: `start()` after an `<audio>` element played may never fire events → no `<audio>`, a fresh recognizer per
  `listen()`, a timeout always resolves. After backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on
  return. iPadOS desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4).
Sources: Apple Developer Forums [804648](https://developer.apple.com/forums/thread/804648) (iOS 26 voice regression) and
[764438](https://developer.apple.com/forums/thread/764438) (voices missing from Web Speech since iOS 18); MDN `AudioSession.type`;
W3C Audio Session WD; WebKit Bugzilla.

## 4. Input (`FP.Input`) — one-finger TAP / FLICK
```js
const detach = FP.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y), // first contact judged at once (odd one hops / matching one wiggles / door)
  move:   (x, y, ev) => world.pointerMove(x, y), // every move of that finger, in order (a flick onto a member within 0.25 s)
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation → the gesture judges nothing more
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object** (`p => world.pointerDown(p.x, p.y)` taps nothing). Non-finite points are dropped; an `up`
without a mappable point becomes `cancel()`.
- **One active pointer**; `down` fires synchronously inside `pointerdown` (`touch-action: none`, `preventDefault`, pointer
  capture), every move reaches `move` unthrottled, `up` exactly once (also over the HUD / bubble). Extra fingers are ignored;
  a stuck pointer is recovered (new primary touch, missing touch, silence ≥ `Input.STALE_MS` 6 s).
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped. Touch + mouse fallback without `PointerEvent`.
- `kidProof()`: blocks pinch, double-tap zoom, long-press callout / selection, rubber-band & pull-to-refresh, context menu,
  Ctrl/⌘ zoom and refresh keys. `holdButton(el, ms = 2000, onDone, onProgress)` → `off()`: the parent gate.
- Functional QA must drive **real CDP touch events** (a tap on a member, a flick, a tap on the barn doors).

## 5. Adding a thing / a language
- New animal: `ANIMALS`, `ANIMAL_HOME`, `NAMES.*.animal | word | who`, `WORDS.*.animal`, run the test.
- New object: `OBJECTS`, `NAMES.*.obj | objWord`, `WORDS.*.obj`. New home: `HOMES`, `NAMES.*.home | homeAt`, `WORDS.*.home`.
- New rule kind: `RULE_KINDS`, `right.<kind>` / `wrong.<kind>` in both languages, `sayRight` / `sayWrong` branches, the sweep.
- New language: `LANGS`, every `NAMES[xx]` table, `APPLE`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, a complete `STR[xx]`
  (identical key set and params — tested), `CHILD_FALLBACK[xx]`, phrase word order; `voice.js`: `LANG_TAG`, `PREFERRED`.
