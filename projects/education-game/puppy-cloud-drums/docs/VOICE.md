# Bibi's Cloud Drums — Voice, language and input

Files: `game/js/i18n.js` (`CD.I18N`), `game/js/voice.js` (`CD.Voice`), `game/js/input.js` (`CD.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 34 500 checks, self-contained): every key in both languages with identical
key sets **and identical `{params}`**, every `ui.*` / `talk.*` / `topic.*` / surprise key that `index.html` / `ui.js` / `main.js`
use, 3 wordings per instruction and reaction, Vietnamese lines carry diacritics and a warm "Bé ơi … nhé!" wording, every
prompt × colour / shape / size / animal / n (beat 1–10, dots 1–12, EN plurals and "once"), every name kind × value (DESIGN §6
names and animal sounds exactly), `drumPhrase` for every drum kind, no `màu màu` / `trống trống`, no unfilled `{param}`, no
"a oval", a negative-word ban, **no word of the chime game left** (bell / chime / ring / campfire / monkey / mountain / Ding /
khỉ / chuông / lửa trại / núi / đèn lồng / nhím / rung — checked on every line of `i18n.js` and every string), the child's name
(empty name → no dangling comma), `words()` (digits, no-diacritic forms, animal sounds) matched back by the matcher, exact
right / wrong / beat / count-run / beat-nudge lines plus a sweep of every drum × topic × wanted answer, every Talk choice kind
(`choiceWords`, `talkWrong`, spoken answer — also the animal's sound — → right choice), speech text, the tap / swipe input
layer (fake DOM: a 60-move swipe, capture, extra fingers, cancel), parent hold gate, voice queue / interrupt / unlock / volume
/ test speed with a fake `speechSynthesis`, recognizer. **With the drums `content.js`** (detected by its new kinds) the test
renders every `promptKey` / Talk key + params, the name of every drum, the right line of every target (beat steps with their
count + a beat nudge) and the wrong line of every other drum that `makeRound` / `makeTalk` produce for ages 3–7 in EN + VI.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Bibi)
- **Bibi** is a small apricot puppy with floppy ears and two drumsticks who plays cloud drums in a rainbow cloud land.
  EN "Bibi"; VI lines "Bibi", titles **"Cún Bibi"** (the welcome introduces him: "Mình là cún Bibi"). Title "Bibi’s Cloud
  Drums" / "Trống Mây Của Cún Bibi"; logo lines "Bibi’s" / "Cloud Drums", "Cún Bibi" / "Trống Mây".
- **TTS of "Bibi" — no rewrite.** English voices read /ˈbiːbi/; "bi" is an ordinary Vietnamese syllable, Linh reads "Bi-bi"
  like a pet name. `speech()` keeps it as written (tested).
- **Drum vocabulary**: boom / tap / beat / drum / Boom! / Boom boom! / Lovely! — vi **gõ / trống / Bùm! / Bùm bùm! / Hay quá!**;
  star lantern "star lantern" / **"đèn ngôi sao"**; song "bài hát", "chơi nhạc"; cymbal "Tsss!" / "Crash!" — vi "Xoảng!",
  "Xủng xoẻng!"; band "ban nhạc".
- **Things** (DESIGN §6): colour drum "the red drum" / "trống màu đỏ"; size "the big drum" / "trống to", "trống nhỏ"; shape drum
  "the star drum" / "trống ngôi sao", "trống trái tim", "trống hình tròn / hình vuông / hình tam giác / hình chữ nhật / hình thoi
  / hình bầu dục" (Talk questions say "Hình ngôi sao là cái nào nhỉ?"); beat-mode drum "the big drum" / "trống to"; dots drum
  "the drum with seven dots" / "trống có bảy chấm"; animals "con bò, con vịt, con mèo, con heo, con ếch, con cừu, con gà mái, con
  chuột", as a drum "trống con bò" (prompts and wrong lines), plain "Con bò!" in the right line; glyph drums "letter B",
  "number five" / "chữ B", "số năm".
- **Animal sounds** (`name(lang, 'sound', a)`, `soundOf`): EN moo, quack, meow, oink, ribbit, baa, cluck, squeak; VI (the
  sounds Vietnamese kindergartens use) bò **"ùm bò"**, vịt "cạp cạp", mèo "meo meo", heo "ụt ịt", ếch "ộp ộp", cừu "be be", gà
  mái "cục ta cục tác", chuột "chít chít". The animal prompt asks by the sound ("Who says moo? Tap the cow!" / "Con gì kêu ùm
  bò? Bé gõ trống con bò nhé!"); right = sound + name ("Moo! The cow!" / "Ùm bò! Con bò!"); a wrong animal says the TAPPED
  animal's sound, then the goal ("The duck says quack! Let’s find the cow!" / "Con vịt kêu cạp cạp! Mình tìm trống con bò
  nhé!"). Spoken answers may be the sound ("moo", "ụt ịt", "ut it").
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("trống {color}" →
  "trống màu đỏ") and **never write "màu {color}"** (tested). Bare form (`hue`) "đỏ".
- **Counting by beating** (ages ≤ 4): "Beat the big drum three times!" (n = 1 "once") / "Bé gõ trống to ba cái nhé!" (classifier
  **cái** for strikes); each beat is counted aloud with the plain number word ("One!" / "Một!"); stopping halfway → "Two! One
  more!" / "Hai rồi! Thêm một cái nữa!". Age 5+ counting = drums with dots ("Boom the drum with seven dots!").
- **Never negative**: a wrong drum names what was tapped, then the goal ("That’s the blue drum. Let’s boom the red one!" /
  "Đây là trống màu xanh dương. Mình gõ trống màu đỏ nhé!"). Brushes, cymbal taps and taps on the sky are never mistakes and
  have no line. Maths never gives the answer away. Tested word ban: no / not / wrong / bad / fail / mistake / oops / fall /
  sorry … and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm ("crash" is allowed: it is
  the cymbal).
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "hay quá!".
  `ask(…, {next:true})` drops a leading "Bé ơi," after every VI prefix ("Thêm nữa nhé! Bé gõ …", "Giờ thì bé gõ trống màu đỏ
  nào!") and never puts a prefix ending in "nhé!" / "nào!" before a prompt with the same particle.
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, and "bé {child}" → "bé",
  ", {child}!" → "!" (no dangling comma; tested over every key).
- **Initials (age 6–7)**: EN cow C, duck D, cat C, pig P, frog F, sheep S, hen H, mouse M; VI words without classifier
  bò B, vịt V, mèo M, heo H, ếch **Ê**, cừu C, gà mái G, chuột C. content.js picks distinct initials per round.

## 1. API (`CD.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).
`e` = the world event **plus** `{ topic: world.topic, params: <current step's params>, promptKey: <current step's key>,
mode: <step mode>, thing: <the drum's thing> }` (main's `ev2(e)` does this). For `wrong` add the struck drum's thing — if it
is missing, the drum is rebuilt from `e.got` {nameKind, nameValue} + topic (+ `promptKey 'p.beat'` → the big drum).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'cow'}` (also gives `{sound}`, `{word}`), `{size:'big'}` / `{big:true}`, `{n:3}` (gives `{num}`, `{times}`, `{items}`), `{i, n}` (gives `{done}`, `{left}`); `{thing:{…}}` → its drum phrase; `{kind,value}` / `{nameKind,nameValue}` objects are named |
| `ask(lang, promptKey, params, {next?, rng?})` | the step prompt; `next:true` → "Next one! Boom the red drum!" / "Now, who says moo? …" / "Giờ thì bé gõ …" |
| `sayRight(lang, e, rng?)` | `right` → "Boom! The red drum!", "The red drum! Boom!", "Boom! The big drum!", "Boom! The blue star drum!" (p.shapes5 only), "Boom! Letter B!" · vi "Bùm! Trống màu đỏ!", "Trống ngôi sao! Bùm!"; **animals** "Moo! The cow!" / "Ùm bò! Con bò!"; **beat** (`e.count {n}` or the step's `params.n`) "Three! You beat it three times!" / "Ba! Bé gõ đủ ba cái rồi!"; dots: "Boom! The drum with seven dots!" (with `e.count` the run "One, two, … seven dots!"); add/sub "Five! 2 + 3 is five!"; oddeven "Seven is odd!"; initial "C is for cow!" / "Chữ Ê, ếch!" |
| `sayWrong(lang, e, rng?)` | `wrong` → colours "That’s the blue drum. Let’s boom the red one!"; shapes "That’s the circle drum. Let’s boom the triangle drum!"; shapes5 "That’s the red star drum. Let’s boom the blue star drum!"; size "That’s the small drum. Let’s boom the big one!" / "Đây là trống nhỏ. Mình gõ trống to nhé!"; animals "The duck says quack! Let’s find the cow!"; dots "That drum has four dots. Let’s boom the drum with six dots!" / "Trống này có bốn chấm. Mình gõ trống có sáu chấm nhé!"; letters "That’s letter D. Let’s boom letter B!"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "Cat starts with C! Let’s look again!"; a beat step never has a wrong (defensive: `wrong.any`) |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) — one beat counted aloud |
| `sayCountRun(lang, n, kind?)` | "One, two, three!" / "Một, hai, ba!" (kind `'beat'` / default / the big-drum thing); `'dots'` or a dots thing → "One, two, three dots!" / "Một, hai, ba chấm!"; n = 1 "One!" / "One dot!" |
| `sayCountDone(lang, n, kind?, rng?)` | "Three beats! Hooray!" / "Ba cái! Hoan hô!"; dots "Three dots! Hooray!" (optional) |
| `sayBeatNudge(lang, e, rng?)` | `beatNudge {i, n}` → "Two! One more!", "One! Three more!" / "Hai rồi! Thêm một cái nữa!", "Được hai cái rồi! Bé gõ thêm ba cái nữa nhé!" (= `t('beatNudge', {i, n})`; without i/n → an `idle` line) |
| `sayName(lang, thing \| e)` | a drum's plain name: "the red drum" / "trống màu đỏ", "con cừu" (Talk aria, tests) |
| `sayPickup(lang, e)` / `sayTap(lang, e)` | kept aliases: "The red drum!" / "Look, the red drum!" (`name.say`, `tap`); `sayPlaced` = `sayRight` |
| `talkWrong(lang, choice)` / `talkWrong(lang, kind, value)` | missed Talk answer: "It is blue! Good try!", "It is an oval! Good try!", "It is the cow, moo! Good try!" / "Là con heo đó, ụt ịt! Bé cố gắng lắm!", "It is the big one! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `choiceWords(lang, choice)` | spoken forms for a Talk choice `{id, thing}` (color / drum with colour → colour; drum with `big` / size → size; shape → shape; animal / sound → animal incl. its sound; number / dots / big {n} → number; glyph → letter / number) — pass as `Voice.listen({choices:[{id, words}]})` |
| `drumPhrase(lang, thing, {art, color, size, drum, bare})` (alias `piecePhrase`) | "the red drum", "the big drum", "the triangle drum" (colour only with `color:true`), "the drum with five dots", "the cow", "letter B", "small b", "number five" / "trống màu đỏ", "trống to", "trống hình tam giác", "trống có năm chấm", "con bò" (`drum:true` → "trống con bò"), "chữ b thường", "số năm" |
| `phrase(lang, thing \| choice \| {nameKind, nameValue})` | the same for anything (ui.js aria labels) |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapeH, size, drum, big, dots, animal, sound, word, number, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` | accepted spoken forms (lower-case, + no-diacritic forms, digits and "số năm" for numbers, sounds for animals) |
| `soundOf(lang, animal)` | "moo" / "ùm bò" |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "C is for", "starts with F", "Big B / small b"), + − =, " — " → ", ", "…" → ".", vi "chữ B" → "chữ bờ"; "Bibi" unchanged |
| `initialOf(lang, animal)` | `{word, first}` ("ếch", "Ê") |
| `setChild(name)`, `has`, `keys`, `raw`, `kindValue(choice)` | `{child}` default for every `t()`; key checks; a choice → `[kind, value]` |
| constants | `langs, TOPICS, ANIMALS, SHAPES, COLORS, DRUM_KINDS (drum shape big dots animal glyph), NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (skill rule, proven in the playtests): *prompts are protected* (the guard in `speakPrompt` lasts until the
prompt has actually been spoken: from its `onStart` **600 ms + 95 ms × chars**); *feedback (right / wrong) interrupts* unless
the prompt is still protected; *the wrong line is protected the same way*; **beat counts are the exception: the child is
already acting, so each count word interrupts** (also a protected prompt and the previous count word — never queue counts,
a late "Two!" after "Three!" is worse than none); *round-done praise, hints and the song ask queue*; *skip a new praise if one
started < 1.2 s ago*; brushes, soft taps, `land`, `drumIn`, lanterns, `cymbal` and `songNote` have **no line** (sound only);
speech is log-only for `speed > 1` (`Voice.setSpeed(n)`, also read from `?speed=` by `Voice.init`).

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + '. ' + t('topic.'+topic)` (banner + voice), then `t('weather.'+weather)` ("Good morning, cloud land!" / "Sunny noon!" / "Sunset clouds!" / "Starry night!") | interrupt (new chapter), weather queued |
| `round {round, surprise}` | `t('enter')` in the bubble ("Here come the drums!"), not spoken — the prompt follows | — |
| `drumIn {id, i, x, y}` | — (a soft cushion "poof" + boom per landing drum) | no line |
| `land {id, x, y}` | — (dust puff / cushion squish sound only) | no line |
| `ask {promptKey, params, mode, step, first}` | `ask(lang, promptKey, params, {next: !first && step > 0})` — bubble + voice ("Beat the big drum three times!", "Who says moo? Tap the cow!"); remember it for `pokeBibi` / `idle` | **protected prompt** (`priority: true`) |
| `ring {id, thing, note, judged, brush?}` | — (the drum's boom; a brush softer) | no line ever |
| `count {id, i, n, x, y}` (beat mode) | `sayCount(lang, i)` ("One!", "Two!" / "Một!", "Hai!") for **i < n**; for i === n say nothing — the `right` line that follows starts with that number | **interrupt** (cuts the previous count word / the prompt); no queue; light the card dot with it |
| `right {id, thing, x, y, count?}` | `sayRight(lang, e)` — beat: "Three! You beat it three times!"; animals "Moo! The cow!"; others "Boom! The red drum!" | interrupt (feedback), never over a protected prompt (then queue) — **except beat mode: interrupt always** (it follows the child's last beat); then protected |
| `beatNudge {i, n}` | `sayBeatNudge(lang, e)` ("Two! One more!" / "Hai rồi! Thêm một cái nữa!") — counts as an idle nudge (same ≤ 4 limit and backoff), **without** the prompt appended | queue |
| `lantern {i, x, y}` | — (twinkle sound; optional bubble `t('lantern')` "A star lantern lights up!") | no voice |
| `stepDone {step, last}` | — (the next `ask` follows `askGap` with the `next` wording; the right line is the praise) | |
| `wrong {id, got, want, streak, x, y}` | `sayWrong(lang, e + {thing})`; at most one wrong line per 1.5 s; after the 2nd miss the hint follows (never in a beat step) | interrupt unless protected (then queue); then **protected** for 600 + 95 ms × chars |
| `soft {x, y}` | — (a soft "bumpf" / cushion squish) | no line |
| `hint {id}` | `t('hint')` ("Psst! Look at the shining drum!") | **queue** (the wrong line goes first) |
| `assist {}` | `t('hint')` ("Bibi will help! Boom this one!") — in beat mode the ghost hand beats; the count words come from the `count` events | queue |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` (≤ 4 times, then stay quiet) | queue |
| `pokeBibi` | repeat the current prompt (> 3 s after it was asked, not while Bibi is still saying it); with no prompt (song / out) `t('bibi.poke')` ("Woof woof! Hi there!") | interrupt |
| `cymbalTap {x, y}` | `t('cymbal.tap')` ("Tsss!" / "Xoảng!") — **rarely**: at most once per 8 s and only when nothing is speaking; otherwise just the soft crash | never over a prompt; no queue |
| `roundDone {round, stars, misses}` | ONE line: `t('great')` (0 misses, "Beautiful drumming, {child}!") or `t('praise')` | **queue** (never cut the right line); skip if a praise started < 1.2 s ago |
| `songAsk {}` | `t('song')` ("Now play our song — tap the drums!" / "Giờ mình cùng chơi bài hát nhé — bé gõ các trống nào!") the first time in a chapter, then `t('songShort')` ("Now our song!") + bubble | queue after the praise, protected like a prompt |
| `songNote {id, i, note}` | — (the wave; duck the music) | |
| `cymbal {x, y}` | — (the crash at the end of the song: Bibi `cheer`) | no line |
| `songDone {auto}` | `t('songDone')` ("What a band!" / "Ban nhạc hay quá!") **only after the last song of a chapter** (before `levelDone`); otherwise no line — the wave + crash is the reward (playtest P1-2: less talk per round) | queue |
| `drumsOut {}` | — (drums hop up and float away, cushions "poof") | |
| `lamb` / `lambTap` | `t('surprise.lamb')` ("Look! A fluffy cloud lamb!") / `t('lamb.tap')` ("Puff! A round woolly ball!") | queue / interrupt (tap feedback), never over a protected prompt |
| `bird` / `birdTap {note}` | `t('surprise.bird')` / `t('bird.tap')` (the bird sings the note; line only if nothing is speaking) | same |
| `fireflies` / `fireflyTap {x, y}` | `t('surprise.fireflies')` ("Look! Little stars came to listen!") / `t('firefly.tap')` (at most one tap line per 2 s; the twinkle does the rest) | same |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)` ("Who says moo?", "How many dots?"); mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | queued after the praise; protected like a prompt |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice)` | interrupt |
| `levelDone` | `t('great')` (heard: the next chapter waits `levelDoneTime`) | queue |
| `sessionDone {stars, songs}` | `t('party')` ("Look at all our star lanterns!"), then `t('session.done', {stars})` | interrupt, then queue |

Note for main.js (lead): the copied handlers still treat `th.kind === 'string'` as a count run and give `count` a jingle only;
switch them to the beat rules above (`e.count` → beat right line; `count` → `sayCount(i)` for i < n).

### 1.2 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline ("Boom the cloud drums, light up the stars!" / "Bé gõ trống mây, thắp
  sáng đèn ngôi sao nhé!"), play, playAgain, home, paused, resume, settings, holdForParents, age, years {n}, language, name,
  namePlaceholder, sound, music, volume, quieter, louder, voice ("Bibi’s voice" / "Giọng của Bibi"), mic, done, stars,
  chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing, tapOrSay, listening ("Bibi is
  listening…"), tapBibi, tapHint ("Tap a drum to boom it"), swipeHint ("Swipe across the drums"), skip, gallery, langName.en,
  langName.vi`.
- **topic.\*** (one banner each): colors "Colour Drums" / "Trống sắc màu", shapes "Shape Drums" / "Trống hình dạng", size
  "Big and Small" / "To và nhỏ", count "Let’s Count" / "Cùng đếm nào", animals "Farm Band" / "Ban nhạc nông trại", letters
  "Letter Drums" / "Trống chữ cái", lower, initial, add, sub, oddeven.
- **weather.0..3** (morning, noon, sunset, night): "Good morning, cloud land!", "Sunny noon!", "Sunset clouds!", "Starry
  night!" / "Chào buổi sáng, xứ mây ơi!", "Buổi trưa nắng đẹp quá!", "Mây hoàng hôn đẹp quá!", "Đêm đầy sao lấp lánh!".
- **Prompts** (3 wordings; required params → else the fallback) — what content.js sends: `p.colors {color}` ("Boom the red
  drum!" / "Bé ơi, gõ trống màu đỏ nhé!"), `p.shapes {shape}` (a `{color}` param is ignored), `p.shapes5 {shape, color}` (→
  `p.shapes`), `p.size {size}` or `{big}` (→ `p.sizeAny`), `p.animals {animal}` (+ derived `{sound}`: "Who says moo? Tap the
  cow!"), **`p.beat {n}`** ("Beat the big drum three times!" / "… once!"; `{times}`; vi "Bé gõ trống to ba cái nhé!"),
  `p.count {n, kind 'dots'}` ("Boom the drum with seven dots!" / "Bé ơi, gõ trống có bảy chấm nhé!"), `p.letters {letter}`,
  `p.lower {letter, small}`, `p.initial {letter, animal}`, `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}`; `p.any`;
  `p.next` ("Next one!", "One more!", "Now," / "Tiếp nào!", "Thêm nữa nhé!", "Giờ thì").
- **Lines**: `name.say {thing}`, `tap {thing}`, `right {thing}`, `right.label {label}`, **`right.animal {sound, thing}`**,
  **`right.beat {num, times}`**, `right.parity {num, parity}`, `right.initial {letter, word}`, `right.sum {expr, ans}`,
  `right.any` ("Boom! Lovely!" / "Bùm! Hay quá!"), `countDone {num, items}`, **`beatNudge {done, left}`** (from `{i, n}`),
  `lantern`, `wrong.thing {got, want}`, **`wrong.animal {got, gotSound, want, sound}`**, `wrong.count {got, want}`,
  `wrong.math {got}`, `wrong.parity {num, parity}`, `wrong.initial {word, first}`, `wrong.any`, `stepDone`, `song`,
  `songShort`, `songDone {child}`, **`cymbal.tap`**, `enter`, `surprise.lamb`, `lamb.tap`, `surprise.bird`, `bird.tap`,
  `surprise.fireflies`, `firefly.tap`, `bibi.poke`, `hint`, `idle {child}`, `praise`, `great {child}`, `party`,
  `session.done {stars}`, `count.0..20`.
- **Talk** (content.js `makeTalk` → `promptKey 'talk.<topic>'`): `talk.intro, talk.right`; `talk.colors` "What colour is this
  drum?" / "Trống này màu gì nhỉ?" (never says the colour), `talk.colorsWhich {color}`, `talk.shapes {shape}` "Which one is
  the star?" / "Hình ngôi sao là cái nào nhỉ?" (→ `talk.shapesAny`), `talk.shapes5`, `talk.size {size}` "Which drum is big?",
  `talk.count {kind}` "How many dots?" / "Có mấy chấm nào?" (never says n), `talk.animals {animal}` → **"Who says moo?" / "Con
  gì kêu ùm bò nhỉ?"** (the sound is the clue; → "Who is this?"), `talk.animalsWho`, `talk.letters`, `talk.lower`,
  `talk.initial {animal}`, `talk.add / sub {a, b}` (→ `talk.calc`), `talk.oddeven {parity}`; `talk.wrong(.a, .animal {answer,
  sound}, .size, .letter, .small, .number, .any)`.

### 1.3 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape (shapeH) | circle, square, triangle, star, heart, rectangle (rect), diamond, oval | hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục (shapeH: hình ngôi sao, hình trái tim) |
| drum | red drum, big drum | trống màu đỏ, trống to |
| big | big drum | trống to |
| dots | one dot, five dots | năm chấm (phrase "trống có năm chấm") |
| animal | cow, duck, cat, pig, frog, sheep, hen, mouse | con bò, con vịt, con mèo, con heo, con ếch, con cừu, con gà mái, con chuột |
| sound | moo, quack, meow, oink, ribbit, baa, cluck, squeak | ùm bò, cạp cạp, meo meo, ụt ịt, ộp ộp, be be, cục ta cục tác, chít chít |
| word (initial) | as animal | bò B, vịt V, mèo M, heo H, ếch Ê, cừu C, gà mái G, chuột C |
| size | big, small | to, nhỏ |
| number 0–20, letter, sum, diff, parity | words; letters as written; "two plus three"; odd / even | words; kindergarten phonics (b → bờ, c → cờ, k → ca, q → quờ, y → i dài …); "hai cộng ba"; lẻ / chẵn |

Spoken extras (`words`): "kitty", "piggy", "froggy", "chicken", "mousey", "moo moo", "quack quack" … / "bò sữa", "ò ò", "con
lợn", "lợn", "ủn ỉn", "con nhái", "con gà", "gà", "cục tác", "chút chít" …; "xanh" alone is ambiguous (no match), "con" alone
matches nothing; "trống con bò", "trống màu đỏ", "trống to" all match. No spoken form is shared by two values of one kind
(tested).

## 2. Voice (`CD.Voice`) — the proven engine
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` / `getSpeed()` (n > 1 → **log only**, `say` resolves `{spoken:false, reason:'speed'}`; `init` reads `?speed=`),
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `CD.debug.voiceLog`, also when muted or at test speed), `spoken(lang, text)`, `RATE` 0.9 /
`PITCH` 1.2, `canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null,
transcript, reason?}>`, `stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox, Bells …) −60. Lists are
  read at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Bibi: **rate 0.9, pitch 1.2** (a small cheerful puppy; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese
  tones).
- Count words are tiny utterances ("One!"); with `interrupt` the engine cancels and speaks after 50–90 ms, so a beat every
  0.35 s still gets its number (the previous one is cut, never queued).
- Volume: `setVolume(v)` → every utterance's `u.volume` (follows the game's volume setting). TTS loudness itself is the
  phone's media volume.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s, Chrome cuts utterances at
  ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.
- Music / drum ducking: duck the music bed on `onStart`, restore on `onEnd`; the song wave's own booms are not ducked.

## 3. iOS / Safari findings (re-checked 21 Nov 2026)
- **2026 check**: a web search for iOS 26 / Safari 26–27 Web Speech changes turned up the Safari 27 release notes and the
  same iOS 26 voice-selection regression thread as before, plus native-only reports (SFSpeechRecognizer on iOS 26.4/26.5
  simulators, phonetic pronunciation in the iOS 27 beta). Nothing changes `speechSynthesis` / `webkitSpeechRecognition` for a
  web page in a way that needs a code change, so the engine stays as it is. Re-test on a real device when iOS 27 ships widely.
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+, still WebKit-only; W3C Audio Session draft) — `Audio.unlock()`
  (lead) sets it. While the mic listens `voice.js` switches to `'play-and-record'` and restores the previous type afterwards
  (otherwise speech goes to the earpiece / gets quiet). The drum booms are synthesized Web Audio, so this matters most here.
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **Vietnamese voice "Linh"**: built into iOS/iPadOS (vi-VN), so `getVoices()` lists it even when nothing was downloaded;
  `voice.js` sets `utterance.voice` by name. Better one: **Settings › Accessibility › Spoken Content › Voices › Vietnamese**
  (Linh Enhanced if offered). iOS 26 regression: the voice chosen in Spoken Content is ignored by web speech and downloaded
  Enhanced voices are often missing from `getVoices()` — so we never rely on the default voice. `hasVoice('vi') === false`
  (no vi voice at all, e.g. some Android / desktop browsers) → show `ui.voiceMissing`. Linh reads the onomatopoeia ("ùm bò",
  "ụt ịt", "cục ta cục tác") as ordinary syllables — fine; EN voices read "baa" / "ribbit" / "squeak" well.
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network) and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. Vietnamese recognition (`vi-VN`) works but often returns words without diacritics or with the
  wrong tone ("con bo", "ut it") — the matcher compares stripped forms too. Apple's on-device SpeechAnalyzer (iOS 26) is
  native-only. The mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).
Sources: MDN `AudioSession.type`; W3C Audio Session WD; Apple Developer Forums thread 804648 ("AVSpeechSynthesisVoice ignores
user-selected voices in iOS 26"), 840302 (SFSpeechRecognizer on iOS 26.4/26.5 simulators), 835921 (phonetic pronunciations
in iOS 27 beta 1); Safari 27 release notes (developer.apple.com/documentation/safari-release-notes); Apple support "Hear
iPhone speak the screen" (Spoken Content).

## 4. Input (`CD.Input`) — one-finger TAP / SWIPE
```js
const detach = CD.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y), // press on a drum → it is struck at once (boom + judged first contact)
  move:   (x, y, ev) => world.pointerMove(x, y), // EVERY move of that finger, in order (swipe segments strike drums)
  up:     (x, y, ev) => world.pointerUp(x, y),   // end of the gesture
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation → the gesture ends, no more strikes
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel();    // main: on resize / rotation / pause → one cancel(), the rest of that finger is dropped
detach.isActive();  // a finger (or mouse button) is down
detach();           // remove all listeners
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object** (the Dino Nest Sort pitfall: `p => world.pointerDown(p.x, p.y)` strikes nothing). It is
documented in a box at the top of `input.js` and tested. Non-finite points are dropped; an `up` without a mappable point
becomes `cancel()`.
- **One active pointer.** `down` fires synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`,
  **pointer capture**) — the drum booms with no tap delay, which matters for beat mode (a fast second tap is a new
  `pointerdown`, so every beat ≥ `beatGap` 0.2 s reaches the world; there is no double-tap zoom: `kidProof`). Every
  `pointermove` of that finger reaches `move` synchronously and unthrottled (tested: a 60-move swipe arrives complete and in
  order, the release point far outside the canvas still reaches `up`), `up` arrives exactly once — also when lifted over the
  HUD / bubble (capture + window fallback, no double delivery). iOS sends one move per frame, so a fast swipe jumps 40–80 px
  between moves: the world tests the **segment** from the previous point against each drum's hit circle, not just the point.
- **Extra fingers are ignored** (a resting second hand never strikes a second drum or restarts the gesture — and never adds
  a beat). Recovery when the active finger is known to be gone (iOS swallowed its `pointerup`): a new `isPrimary` touch, a
  mouse press replacing a touch, the touch-fallback's active touch missing from `e.touches`, or silence ≥ `Input.STALE_MS`
  (6 s; only checked when another finger presses) → `cancel()` for the old, `down()` for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.
- Functional QA must drive **real CDP touch events** (taps on a drum, N quick taps on the big drum for a beat step, a ≥ 10-move
  swipe across the drum band for the song) — the bot calls `world.pointerDown/Move/Up` directly and proves nothing about fingers.

## 5. Adding a language / a thing
- New animal: `ANIMALS`, `NAMES.*.animal|word|sound`, `WORDS.*.animal`, `WORD_LIST`, run the test.
- New drum kind: `DRUM_KINDS`, `drumPhrase`, `kvRaw`, `thingFromName`, `sayRight` / `sayWrong` branches, the test sweep.
- New language: `LANGS`, `NAMES[xx]` (all kinds incl. sounds), `ITEMS`, `RUN`, `timesWord`, `NUM`, `NUM_ALT`, letters,
  `WORDS[xx]`, `WORD_LIST[xx]`, a complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`,
  `drumPhrase` word order; `voice.js`: `LANG_TAG`, `PREFERRED`.
