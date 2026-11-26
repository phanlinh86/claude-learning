# Rio's Singing Eggs — Voice, language and input

Files: `game/js/i18n.js` (`SE.I18N`), `game/js/voice.js` (`SE.Voice`), `game/js/input.js` (`SE.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 21 000 checks; ≈ 58 000 once `content.js` has the baby animals — it is detected by
`'dino'` and no `'cow'`): every key in both languages with identical key sets **and identical `{params}`**, every key that
`index.html` / `ui.js` / `main.js` use, 3 wordings per instruction and reaction, short lines (EN ≤ 11 words, VI ≤ 15 syllables;
tune lines ≤ 6), Vietnamese diacritics and a warm "Bé ơi … nhé!" wording, every prompt × value, every name kind × value
(DESIGN §6 names and animal sounds exactly), `eggPhrase` for every egg kind, **every `sayDemo` nameKind × value, `sayNext`,
`sayTurn` (ages 3–7, beat / find / findAll)**, right / wrong (with and without replay) for every egg × topic, no unfilled
`{param}`, no "a egg", a negative-word ban, **no word of the drum game left** (drum / puppy / cymbal / cloud / lamb / boom /
"eggming" / cow … and trống / cún / cừu / xoảng / bùm / mây / con bò … — checked on every string; `drum|puppy|eggm|trống|cún` on the
source of all three files), no chime-game word, the child's name (empty → no dangling comma), `words()` matched back by the
matcher (sounds and no-diacritic forms too), Talk choices, speech text, the tap / swipe input layer, the parent hold gate,
voice queue / interrupt / unlock / volume / test speed with a fake `speechSynthesis`, the recognizer.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Rio)
- **Rio is a tiny round baby dragon** (mint-aqua, peach wings) in a dinosaur valley where the eggs sing. EN "Rio"; VI lines
  "Rio", titles **"Rồng Rio"** (the welcome: "Mình là Rio, chú rồng nhỏ."; tested: no "Rồng Rio" inside lines). Title "Rio’s
  Singing Eggs" / "Trứng Biết Hát Của Rồng Rio"; logo "Rio’s" / "Singing Eggs", "Rồng Rio" / "Trứng Biết Hát".
- **TTS of "Rio" — no rewrite.** EN and VI voices both read it naturally; `speech()` keeps it as written (tested).
- **Copy my tune**: Rio sings first ("Listen to my tune!" / "Bé nghe Rio hát nhé!"), naming each note with **just its name**
  ("Red!", "The star!", animals sound + name "Quack! The duckling!"), then "Your turn!" / "Đến lượt bé rồi!". Ages ≤ 5 hear a
  soft cue for each next note ("…and blue!" / "…rồi màu xanh dương!"); ages ≥ 6 do not (memory). A wrong egg: "That’s the
  yellow egg. Listen again!" / "Đây là quả trứng màu vàng. Bé nghe lại nhé!" and Rio replays the rest of the tune.
- **Egg vocabulary**: EN tap / sing / egg / "La la!" / "Yes!" / "Lovely!"; VI **gõ / chạm / hát / quả trứng** ("quả" is the
  natural classifier: "quả trứng màu đỏ") / "Đúng rồi!" / "Hay quá!"; seed pods on the vine bloom: "A flower opens!" / "Hoa nở
  rồi!"; the little volcano (internal `cymbal`) "Puff!" / "Phù!"; the baby triceratops (internal `lamb`) "Rawr! Hello!" / "Gừ!
  Chào bạn nhé!"; fireflies "đom đóm".
- **Things** (DESIGN §6): colour egg "the red egg" / "quả trứng màu đỏ"; size "the big egg" / "quả trứng to", "quả trứng nhỏ";
  shape egg "the star egg" / "quả trứng ngôi sao", "quả trứng hình tròn / hình vuông / hình tam giác / trái tim / hình chữ nhật /
  hình thoi / hình bầu dục" (Talk: "Hình ngôi sao là cái nào nhỉ?"); the big spotted egg "the big egg" / "quả trứng to"; dots
  "the egg with seven dots" / "quả trứng có bảy chấm"; glyph eggs "letter B", "number five" / "chữ B", "số năm".
- **Baby animals** (`SE.ANIMALS = duck, chick, owl, frog, dino, snake`): EN **duckling, chick, owlet, baby frog, baby dino, baby
  snake**; VI **vịt con, gà con, cú con, ếch con, khủng long con, rắn con** (no "quả trứng" before an animal: "trứng vịt" would
  be a duck egg to eat). Sounds EN quack, peep, hoot, ribbit, rawr, hiss / VI cạp cạp, chíp chíp, hù hù, ộp ộp, gừ gừ, xì xì.
  Prompt by the sound ("Who says quack? Tap the duckling!" / "Ai kêu cạp cạp? Bé gõ vịt con nhé!"); right and demo = sound +
  name ("Quack! The duckling!" / "Cạp cạp! Vịt con!"); a wrong animal says the TAPPED animal's sound ("The chick says peep!
  Listen again!"). Spoken answers: name, short word, sound, with or without diacritics ("vit", "khung long", "hu hu", "roar").
- **Initials** (`word`, age 6–7 'first letter' topic): EN duckling D, chick C, owlet O, frog F, dino D, snake S; VI vịt V,
  gà G, cú C, ếch **Ê** (not in the VI letter pool → content.js leaves it out), khủng long K, rắn R. Right "D is for
  duckling!" / "Chữ K, khủng long!".
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun and **never write "màu
  {color}"** (tested). Bare form (`hue`) "đỏ".
- **Counting (ages ≤ 4) = copy N taps**: Rio taps the big egg N times counting aloud ("One!", "Two!", "Three!" / "Một!" …), then
  "Your turn — tap the big egg three times!" / "Đến lượt bé — gõ quả trứng to ba cái nhé!" (classifier **cái** for taps; n = 1
  "once" / "một cái"); the child's taps are counted the same way; the last one: "Three! You tapped it three times!" / "Ba! Bé gõ
  đủ ba cái rồi!"; stopping halfway → "Two! One more!" / "Hai rồi! Thêm một cái nữa!".
- **Never negative**: name what was tapped, then "Listen again!" (or, with the hint glow on, the goal: "Let’s tap the red
  one!"). Brushes, taps during the demo, volcano taps and stage presses are never mistakes and have no line. Maths never gives
  the answer away. Word ban (tested): no / not / wrong / bad / fail / mistake / oops / fall / sorry … and sai / dở / tệ / hỏng /
  không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm.
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "hay quá!";
  `ask(…, {next:true})` drops a leading "Bé ơi," after a prefix and never doubles a particle.
- **Short**: every play line ≤ ~4.5 s spoken (EN ≤ 11 words, VI ≤ 15 syllables); tune lines ≤ 6 words; demo note names ≤ 5 words
  (they must finish inside `demoGap` 0.85–1.35 s).
- **Child's name**: `setChild(name)`; empty name → `{child}` variants skipped, "bé {child}" → "bé", ", {child}!" → "!".

## 1. API (`SE.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional. `e` = the world event **plus** `{ topic, params,
promptKey, mode, thing }` (main's `ev2(e)`). Missing `thing` → rebuilt from `{nameKind, nameValue}` + topic / promptKey.

| function | returns |
|---|---|
| **`sayDemoStart(lang, e, rng?)`** | `demoStart` → "Listen to my tune!" / "Bé nghe Rio hát nhé!"; `e.replay` → "Listen again!" / "Bé nghe lại nhé!"; beat demo (`e.mode === 'beat'`) → "Count with me!" / "Bé đếm cùng Rio nhé!" |
| **`sayDemo(lang, e)`** or `sayDemo(lang, nameKind, value, {thing, topic, promptKey, params}?)` | `demoNote` → just the name: "Red!", "Blue!", "The star!", "The blue star!" (p.shapes5), "The big egg!", "Seven dots!" (dots egg / p.count), "Five!", "Letter B!", "Small g!" · VI "Màu đỏ!", "Ngôi sao!", "Ngôi sao màu xanh dương!", "Quả trứng to!", "Bảy chấm!", "Năm!", "Chữ B!", "Chữ g thường!"; **animals = sound + name** "Quack! The duckling!" / "Cạp cạp! Vịt con!" (initial topic: the name only); '' when nothing to name |
| `demoName(lang, e \| nameKind, value?)` | the same name without "!" ("red", "the star", "vịt con") |
| **`sayTurn(lang, e, {age, cue?, rng?})`** | the `ask` line in the tune flow: beat step → "Your turn — tap the big egg three times!" / "Đến lượt bé — gõ quả trứng to ba cái nhé!"; `e.afterDemo` → "Your turn!" / "Đến lượt bé rồi!" + (cue) "First, red!" / "Đầu tiên là màu đỏ nhé!"; a later step → (cue) "…and blue!" / "…rồi màu xanh dương!", else **''** (say nothing). `cue` defaults to `age ≤ 5`; findAll steps never get a name |
| `sayNext(lang, e \| nameKind, value?, rng?)` | `turn.next`: "…and blue!", "…then the star!", "Now the duckling!" / "…rồi màu xanh dương!" ('' when nothing to name) |
| `ask(lang, promptKey, params, {next?, rng?})` | the full prompt (bubble text, idle help, `?nodemo=1`): "Tap the red egg!" / "Bé ơi, gõ quả trứng màu đỏ nhé!", "Who says quack? Tap the duckling!" / "Ai kêu cạp cạp? Bé gõ vịt con nhé!", `p.beat` "Tap the big egg three times!" / "Bé ơi, gõ quả trứng to ba cái nhé!" (never a `next` opener) |
| `sayRight(lang, e, rng?)` | `right` → the short name: "Yes! Red!", "Red! Lovely!", "La la! Red!" / "Đúng rồi! Màu đỏ!"; animals "Quack! The duckling!"; beat (`e.count {n}` or `params.n`) "Three! You tapped it three times!"; dots + `e.count` → "One, two, three dots!"; add/sub "Five! 2 + 3 is five!"; oddeven "Seven is odd!"; initial "D is for duckling!" |
| `sayWrong(lang, e, rng?)` | `wrong` → **replay (default)**: "That’s the yellow egg. Listen again!", "The chick says peep! Listen again!", "That egg has four dots. Listen again!", "Four is even! Listen again!", "Snake starts with S! Listen again!" / "Đây là quả trứng màu vàng. Bé nghe lại nhé!"; **no replay** (`e.replay === false`, or `e.streak ≥ 2` when `replay` is not given — the hint glow is on): the goal "That’s the blue egg. Let’s tap the red one!" / "… Mình gõ quả trứng màu đỏ nhé!", "The chick says peep! Let’s find the duckling!". An explicit boolean `e.replay` always wins |
| `sayCount(lang, i)` | "One!" … "Twenty!" — a tap counted aloud (Rio's `demoCount` and the child's `count`) |
| `sayCountRun(lang, n, kind?)`, `sayCountDone(lang, n, kind?)` | "One, two, three!" / "One, two, three dots!"; "Three taps! Hooray!" / "Ba cái! Hoan hô!" |
| `sayBeatNudge(lang, e)` | `beatNudge {i, n}` → "Two! One more!" / "Hai rồi! Thêm một cái nữa!" |
| `sayName`, `sayPickup`, `sayTap`, `sayPlaced` | "the red egg" / "quả trứng màu đỏ"; "The red egg!"; "Look, the red egg!"; = sayRight |
| `talkWrong(lang, choice)` | "It is blue! Good try!", "It is the duckling, quack! Good try!" / "Là ếch con đó, ộp ộp! Bé cố gắng lắm!" |
| `choiceWords(lang, choice)` | spoken forms for a Talk choice → `Voice.listen({choices:[{id, words}]})` |
| `eggPhrase(lang, thing, {art, color, size, egg, bare})` | "the red egg", "an egg with four dots", "an owlet", "a baby frog" / "quả trứng có năm chấm", "cú con" |
| `t`, `name`, `words`, `phrase`, `speech`, `initialOf`, `soundOf`, `setChild`, `has`, `keys`, `raw`, `kindValue` | as before; `speech` also drops a leading "…" (the cue) and turns " — " into ", " |
| constants | `langs, TOPICS, ANIMALS, SHAPES, COLORS, EGG_KINDS, NAME_KINDS, PROMPTS, PARAMS, NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT` |

## 2. World event → line — what main.js does (DESIGN §5.2)
**Speech policy**: *prompts are protected* (`speakPrompt`: from `onStart` 600 ms + 95 ms × chars); *feedback (right / wrong)
interrupts* unless a prompt is protected; *the wrong line is protected the same way*; **counts interrupt** (Rio's demo counts and
the child's: never queue a number); *demo note names queue and never interrupt anything*; round-done praise, hints and the song
ask queue; brushes (also every tap during the demo), soft taps, `land`, `eggIn`, `ring`, lanterns, `cymbal`, `songNote`, `demoEnd`
have **no line**; speech is log-only at `speed > 1`.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+w)` ("Good morning, dino valley!" / "Sunny noon!" / "Sunset in the valley!" / "Starry night!") | interrupt, weather queued |
| `round` | bubble `t('enter')` ("Here come the eggs!"), not spoken | — |
| **`demoStart {from, n, replay, mode}`** | `sayDemoStart(lang, e)` ("Listen to my tune!" / "Count with me!" / replay "Listen again!"). **Replay right after a wrong line** (wrong spoken < 3 s ago): **say nothing** — the wrong line already ended with "Listen again!". Replay from `pokeRio`: say it | first demo: `interrupt` + protected (it fills `demoLead` 1.3 s); replay: interrupt, not protected |
| **`demoNote {id, i, n, step, nameKind, nameValue, replay}`** | `sayDemo(lang, ev2(e))` ("Red!", "Quack! The duckling!") — Rio mood `talk` | **queued, never interrupts** (not `priority`); before queueing note i > 0 call `Voice.dropQueued()` so at most the current note waits (a late name behind the sparks is worse than none) |
| **`demoCount {i, n}`** (beat demo) | `sayCount(lang, i)` ("One!", "Two!", "Three!" — also for i === n: no right line follows a demo) | **interrupt** (like the child's counts) |
| **`demoEnd {replay}`** | — (the `ask` with `afterDemo` follows) | no line |
| **`ask {…, echo, afterDemo, replay}`** | bubble: `ask(lang, promptKey, params, {next})` (the full text, for parents). Voice: **`e.echo` → `sayTurn(lang, e, {age})`**: `afterDemo` → "Your turn!" (+ "First, red!" for age ≤ 5), beat → "Your turn — tap the big egg three times!", a later step → the cue "…and blue!" (age ≤ 5) or nothing. No `echo` (`?nodemo=1`) → `ask(...)` as before | `afterDemo` / beat: **protected prompt** (`priority`); the cue: queued, not protected (a quick child's `right` cuts it); `''` → don't speak |
| `count {i, n}` (child's beat) | `sayCount(lang, i)` for i < n; i === n → the `right` line starts with the number | interrupt |
| `right {id, thing, count?}` | `sayRight(lang, ev2(e))` ("Yes! Red!", "Quack! The duckling!", "Three! You tapped it three times!") | interrupt (beat: always); then protected |
| `beatNudge {i, n}` | `sayBeatNudge(lang, e)` | queue (counts as an idle nudge) |
| **`wrong {id, got, want, streak, replay?}`** | `sayWrong(lang, ev2(e + {thing}))` — with replay "That’s the yellow egg. Listen again!", then **the world replays** (`replayDelay` 1.6 s → `demoStart {replay:true}`); with the hint glow (2nd miss, no replay; pass `replay:false` if the world says so, else `streak ≥ 2` decides) "… Let’s tap the red one!" + the `hint` line queued | interrupt unless protected; then protected; ≤ 1 wrong line / 1.5 s |
| `hint` / `assist` | `t('hint')` ("Psst! Look at the shining egg!") | queue |
| `idle` | `t('idle') + ' ' + ask(...)` (the full prompt is the help after waiting; ≤ 4 times) | queue |
| `pokeRio` | in play the world **replays the tune** (`demoStart {replay}` → "Listen again!"); outside a round `t('rio.poke')` ("Puff puff! Hi there!") | interrupt |
| `cymbalTap` (the volcano) | `t('cymbal.tap')` ("Puff!" / "Phù!") at most once per 8 s, only when silent | no queue |
| `roundDone {stars}` | `t('great')` (0 misses, "Beautiful singing, {child}!") or `t('praise')` | queue |
| `songAsk` | `t('song')` ("Let’s sing it together — tap an egg!" / "Mình cùng hát nào! Bé gõ trứng nhé!") once per session, then `t('songShort')` ("Sing it!" / "Cùng hát nào!") | queue, protected; dropped once the song starts |
| `songNote`, `cymbal`, `songDone` | — (the wave + the volcano's sparkle ring are the reward; `songDone` "What a singer, {child}!" only before `levelDone`, never after the cymbal) | |
| `lamb` / `lambTap` | `t('surprise.lamb')` ("Look! A baby triceratops!") / `t('lamb.tap')` ("Rawr! Hello!") | queue / interrupt, never over a prompt |
| `bird` / `birdTap` | `t('surprise.bird')` / `t('bird.tap')` | same |
| `fireflies` / `fireflyTap` | `t('surprise.fireflies')` ("Fireflies came to listen!") / `t('firefly.tap')` (≤ 1 / 2 s) | same |
| `talk` / `talkAsk` / `talkResult` | `t('talk.intro') + ' ' + t(promptKey, params)` ("What colour is this egg?", "Who says quack?"); right `t('talk.right')`, else `talkWrong(lang, answerChoice)` | as before |
| `levelDone` / `sessionDone` | `t('great')` / `t('party')` ("Look at all our flowers!") then `t('session.done', {stars})` | queue / interrupt then queue |

**Sketch for main.js** (lead):
```js
case 'demoStart': if (!(e.replay && performance.now() - lastWrongSay < 3000)) { const s = I.sayDemoStart(lang, e); e.replay ? speak(s, {interrupt:true}) : speakPrompt(s, {priority:true}); } break;
case 'demoNote':  if (e.i > 0 && SE.Voice.dropQueued) SE.Voice.dropQueued(); speak(I.sayDemo(lang, ev2(e))); break;
case 'demoCount': speak(I.sayCount(lang, e.i), { interrupt: true }); break;
case 'ask': { SE.UI.say(askText(e)); const s = e.echo ? I.sayTurn(lang, e, { age: S.age }) : askText(e);
  if (s && (!e.echo || e.afterDemo || e.mode === 'beat')) speakPrompt(s, { priority: true }); else if (s) speak(s); break; }
```

### 2.1 Key list (new / changed for the tune)
- **Tune**: `demo.start[]`, `demo.replay[]`, `demo.beat[]`, `demo.note {thing}`, `demo.animal {sound, thing}`, `turn.first[]`,
  `turn.firstName {name}`, `turn.next {name}`, `turn.beat {times}` (from `{n}`), `wrong.again {got}`, `wrong.againAnimal {got,
  gotSound}`, `wrong.againCount {got}`, `wrong.againParity {num, parity}`, `wrong.againInitial {word, first}`, `wrong.againAny`.
- Kept (new text): `ui.*` (title, logo1/2, subtitle "Listen to Rio’s tune, then sing it back!", welcome, tapRio "Tap Rio to
  hear the tune again", tapHint, voice "Rio’s voice" …), `topic.*` ("Colour Eggs" / "Trứng sắc màu", animals "Baby Animals" /
  "Thú con trong trứng"), `weather.0..3`, `enter`, all `p.*` (p.beat = the child's turn after Rio's taps), `right*`, `wrong.*`
  (goal form), `countDone`, `beatNudge`, `lantern` (a seed pod blooms), `song`, `songShort`, `songDone`, `cymbal.tap`,
  `surprise.lamb` / `lamb.tap` (triceratops), `surprise.bird`, `bird.tap`, `surprise.fireflies`, `firefly.tap`, `rio.poke`,
  `praise`, `great`, `party`, `hint`, `idle`, `talk.*`, `session.done`, `count.0..20`.

### 2.2 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare đỏ … |
| shape (shapeH) | circle, square, triangle, star, heart, rectangle, diamond, oval | hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục (shapeH: hình ngôi sao, hình trái tim) |
| egg / big | red egg, big egg | quả trứng màu đỏ, quả trứng to |
| dots | one dot, five dots | năm chấm ("quả trứng có năm chấm") |
| animal | duckling, chick, owlet, baby frog, baby dino, baby snake | vịt con, gà con, cú con, ếch con, khủng long con, rắn con |
| word | duckling, chick, owlet, frog, dino, snake | vịt, gà, cú, ếch, khủng long, rắn |
| sound | quack, peep, hoot, ribbit, rawr, hiss | cạp cạp, chíp chíp, hù hù, ộp ộp, gừ gừ, xì xì |
| size | big, small | to, nhỏ |
| number, letter, sum, diff, parity | words; letters; "two plus three"; odd / even | words; phonics (b → bờ …); "hai cộng ba"; lẻ / chẵn |

Spoken extras (`words`): "ducky", "chicken", "owly", "froggy", "dinosaur", "roar", "snakey", "sss" … / "con vịt", "con gà",
"cú mèo", "con nhái", "khủng long", "con rắn", "quạc quạc", "hù" …; "baby" / "con" / "xanh" alone match nothing; "quả trứng
màu đỏ", "quả trứng to", "trứng nhỏ" match. No form shared by two values of one kind (tested).

## 3. Voice (`SE.Voice`) — the proven engine
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`setSpeed(n)` (n > 1 → log only), `say(text, {interrupt, priority, rate, pitch, lang})`, `sayKey(key, params, opts)`, `stop()`,
`dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart` / `onEnd`, `onVoicesChanged(fn)`, `log`,
`spoken(lang, text)`, **`RATE` 0.9 / `PITCH` 1.25**, `canListen()`, `listen({lang, choices, timeoutMs})`, `stopListening()`,
`isListening()`, `onListen`, `match(...)`, `matchDetail(...)`.
- Rio the tiny dragon: **pitch 1.25, rate 0.9** — young and bright; above ≈ 1.3 iOS voices go robotic, below rate 0.85
  Vietnamese tones smear.
- Voices: vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen / Google US English / Microsoft
  Aria; Enhanced/Premium preferred; novelty voices avoided. Lists read at init, on `voiceschanged`, polled 6 s (iOS fills late).
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped; non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s); page hidden → stop; before
  `unlock()` only the newest line is kept. Demo note names are tiny utterances queued behind each other; `dropQueued()`
  before each keeps them in step with the sparks. Counts use `interrupt` (cancel + speak after 50–90 ms).
- Music ducking on `onStart` / `onEnd`; the demo notes and the song wave are not ducked (they ARE the music).

## 4. iOS / Safari findings (re-checked 26 Nov 2026)
- No iOS 26 / Safari 26–27 change to `speechSynthesis` / `webkitSpeechRecognition` for web pages needs a code change (the iOS 26
  voice-selection regression is still open: the voice chosen in Spoken Content is ignored by web speech and downloaded
  Enhanced voices are often missing from `getVoices()` — we always set `utterance.voice` ourselves). Re-test on a device when
  iOS 27 ships widely.
- **Audio session**: Web Audio is on the *ambient* channel (muted by the side switch) unless `navigator.audioSession.type =
  'playback'` (Safari 16.4+) — `Audio.unlock()` sets it; while the mic listens `voice.js` switches to `'play-and-record'` and
  restores it after. The singing eggs are synthesized Web Audio, so this matters.
- **First utterance inside a gesture**: `unlock()` in the first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept for the next unlock; lines queued before the first tap are re-timestamped. The title's
  ▶ Play tap is that gesture, so the first "Listen to my tune!" is heard.
- **Short utterances back to back** (demo note names every 0.85–1.35 s): a 1–3 word name ("Red!", "Cạp cạp! Vịt con!") takes
  ≈ 0.5–1.1 s at rate 0.9, so it fits the gap. Demo notes are queued, not interrupted: the engine's interrupt path is cancel +
  a 50–90 ms restart delay, which is right for counts but would clip every note name; `dropQueued()` keeps at most one waiting.
  To verify on a device: names stay in step with the sparks at age 7 (`demoGap` 0.85 s) — if not, shorten the EN animal lines.
- **pitch 1.25** (was 1.2 for the puppy) stays below the ≈ 1.3 point where iOS voices start to sound robotic — re-listen on a
  device with Samantha and Linh. Onomatopoeia ("cạp cạp", "gừ gừ", "xì xì", "rawr", "hiss") are read as ordinary syllables.
  A leading "…" (the "…and blue!" cue) is removed before TTS so it is not turned into a leading full stop.
- **Vietnamese voice "Linh"** is built in (vi-VN); better: Settings › Accessibility › Spoken Content › Voices › Vietnamese.
  `hasVoice('vi') === false` → show `ui.voiceMissing`.
- **Speech recognition** works in Safari tabs only with Siri & Dictation on, is **missing in Home-Screen mode** (`canListen()`
  false), and `vi-VN` results often lack diacritics ("vit con", "khung long") — the matcher compares stripped forms. The mic
  is optional: tap answers always work.
- WebKit hang after an `<audio>` element played → we never use `<audio>`, a fresh recognizer per `listen()`, 7 s timeout.
- After backgrounding: `cancel()` + `resume()` on `visibilitychange`. iPadOS desktop UA detected via `MacIntel` +
  `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4).

## 5. Input (`SE.Input`) — one-finger TAP / SWIPE
```js
const detach = SE.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y), // press on an egg → it is struck at once (sings; judged first contact)
  move:   (x, y, ev) => world.pointerMove(x, y), // EVERY move of that finger, in order (swipe segments strike eggs)
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation
  hover:  (x, y)     => {}
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: two NUMBERS in logical px, then the raw event — never a point object** (tested). One active pointer; `down` fires
synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`, pointer capture) so an egg sings with no tap
delay and every fast copy-tap reaches the world; every `pointermove` reaches `move` unthrottled (the world tests segments);
`up` exactly once; extra fingers ignored (stale-finger recovery: new primary touch, mouse replacing touch, missing touch, ≥ 6 s
silence); `pointercancel` / lost capture / blur / hidden → one `cancel()`. `Input.IGNORE` targets (`button, .screen, #hud,
.no-game-input`) skipped. `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band, context menu, zoom keys.
`holdButton(el, 2000, onDone, onProgress)` = the parent gate. Taps during Rio's demo reach the world normally — the world
treats them as brushes. Functional QA must drive real CDP touch events.

## 6. Adding a language / a thing
- New animal: `ANIMALS`, `NAMES.*.animal|word|sound`, `WORDS.*.animal`, `WORD_LIST`, the test's lists.
- New egg kind: `EGG_KINDS`, `eggPhrase`, `shortName` (demo / right name), `kvRaw`, `thingFromName`, `sayRight` / `sayWrong`.
- New language: `LANGS`, `NAMES[xx]`, `ITEMS`, `RUN`, `timesWord`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, a
  complete `STR[xx]` (identical keys and params — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`.
