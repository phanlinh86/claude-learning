# Momo's Toy Train — Voice, language and input

Files: `game/js/i18n.js` (`TT.I18N`), `game/js/voice.js` (`TT.Voice`), `game/js/input.js` (`TT.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 11 000 checks, self-contained — the value lists come from DESIGN, not
content.js): every key in both languages with identical key sets **and identical `{params}`**, every `ui.*` key that
`index.html` / `ui.js` / `main.js` use, 3 wordings per instruction, every prompt × cargo × n 1–12 (EN plurals), every name
kind × value (= DESIGN §6 names), `words()` matched back by the matcher for every value, exact `sayGrab` / `sayCorrect` /
`sayWrong` / `sayCarDone` lines plus a sweep of every item × every car label (> 10 000 lines, clean + never negative),
garbage events, speech text, the drag input layer (one finger, extra fingers ignored, cancel paths), parent hold gate,
voice queue / interrupt / unlock with a fake `speechSynthesis`, recognizer.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Momo)
- **Momo** is a cheerful little owl conductor in a striped cap. EN text says "Momo"; VI lines say "Momo", titles "Cú Momo".
  Title "Momo’s Toy Train" / "Cú Momo — Tàu Đồ Chơi"; logo lines "Momo’s" / "Toy Train", "Cú Momo" / "Tàu Đồ Chơi".
  **TTS**: English voices say "Momo" as written; Vietnamese voices get **"Mô Mô"** (`I18N.speech`) — display text keeps "Momo".
- **Train vocabulary**: load / car / train / whistle / all aboard / choo choo — vi **chất / xếp / toa / tàu / còi / lên tàu nào /
  xình xịch**. Wobble **"Boing!"** / **"Tưng!"**, whistle **"Toot toot!"** / **"Tu tu!"**.
- **Classifiers**: cars are "toa" ("toa màu đỏ", "toa hình ngôi sao", "toa chuồng", "toa số ba", "toa chữ B", "toa số lẻ"),
  animals "con bò", colours "màu", shapes "hình", letters "chữ", counted cargo "3 con gấu bông / 3 quả bóng / 3 chiếc thuyền".
- **Never negative**: a wrong drop names the car it hit, then the goal. Maths never gives the answer away. `full` is not a
  mistake ("This car is full! Try another one."). Tested word ban: no / not / wrong / bad / fail / mistake / oops / fall …
  and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã (all non-`ui.*` keys and every generated line).
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "giỏi quá!".

## 1. API (`TT.I18N`) — for main.js
All helpers never throw and never return '' or a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{animal:'cow'}`, `{cargo:'teddy', n:3}` |
| `name(lang, kind, value, opts?)` | display + spoken name. kinds `color, shape, size, animal, home, cargo, toy, number, dots, letter, text, sum, diff, parity, word`. `name('en','cargo','teddy',{n:3})` → "teddy bears"; `name('vi','cargo','teddy',{n:3})` → "con gấu bông" (counted form) |
| `words(lang, kind, value)` | accepted spoken forms for Talk-time choices (lower-case, + no-diacritic forms, digits for numbers) |
| `itemPhrase(lang, item, role?)` | role `'item'` (default) "the red block" / "khối gỗ màu đỏ"; `'grab'` "red block" |
| `carPhrase(lang, label)` | "the red car" / "toa màu đỏ"; label `{type, value}` or `{nameKind, nameValue}` |
| `phrase(lang, kind, value, role?)` | as above from a kind/value; role `'car'` → car phrase |
| `sayGrab(lang, ev, rng?)` | `grab` / `tap`: "Red block!", "The cow!", "Teddy bear!", "Star!", "Big block!", "Letter B!", "Small b!", "Five!", "2 + 3!" · vi "Khối gỗ màu đỏ!", "Con bò!", "Gấu bông!", "Số năm!" |
| `sayCorrect(lang, ev, label?, rng?)` | `correct`: see §1.2. **Count mode** (`ev.count {i, n}`) → just `count.<i>` ("Three!") |
| `sayWrong(lang, ev, rng?)` | `wrong`: "Boing! That’s the blue car. The red block wants the red car!" (§1.2) |
| `sayCarDone(lang, ev, label?, rng?)` | `carDone`: count car "That makes three teddy bears!" / "Đủ ba con gấu bông rồi!"; other cars `carDone` "This car is ready!" |
| `sayCount(lang, i)` | "One!" … "Twenty!" (= `t('count.'+i)`; beyond 20 the digits) |
| `talkWrong(lang, kind, value)` | missed Talk answer: "It lives in the barn! Good try!", "It is an oval! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D car" → "letter dee car", "C is for", "starts with C"), + − =, " — " → ", ", vi "chữ B" → "chữ bờ", vi "Momo" → "Mô Mô" |
| `sound(lang, animal)`, `hasSound(animal)`, `homeOf(animal)` | "moo" / "ò ò" ('' for fish, squirrel, butterfly, bunny, fox); `homeOf('duck')` → 'pond' |
| `setChild(name)`, `has(lang,key)`, `keys(lang)`, `raw(lang,key)` | `{child}` default for every `t()`; key checks |
| constants | `langs, TOPICS, ANIMALS, HOMES, CARGO, TOYS, NAME_KINDS, LABEL_TYPES, PROMPTS, PARAMS (required params per key), LETTER_VI, WORD_LIST, MAX_COUNT (20)` |
| aliases | `sayTap = sayGrab`, `sayPlay = sayCorrect` |

### 1.1 Event fields the helpers read (main passes the world event, plus what it knows)
- **item** — `ev.item` (the round item `{kind, toy?, shape?, color?, sprite?, text?, nameKind, nameValue}`) **or** the event's
  own `nameKind / nameValue` (`grab {id, nameKind, nameValue}`). With only `nameKind:'color'` (no `toy`) the grab line is
  "Red toy!" — pass `item` to get "Red block!" / "Red tube!". `sprite: 'animal_cow' / 'cargo_teddy'` is understood.
- **label** of a car — 3rd argument, or `ev.label`, or `ev.car` / `ev.car.label` (`{type, value, color?}` as in
  `round.cars[].label`; `{nameKind, nameValue}` also works).
- **wrong** — `ev.item {nameKind, nameValue}`, `ev.want {nameKind, nameValue}` (the right car), and **`ev.got`** (or
  `ev.car` / `ev.label`) = the label of the car it was dropped into (optional; adds "That’s the blue car."). Main:
  `sayWrong(lang, Object.assign({}, e, { got: world.cars.find(c => c.id === e.carId).label }))`.

### 1.2 What Momo says (examples, EN / VI)
| label type | `sayCorrect` | `sayWrong` |
|---|---|---|
| color | Yes! The red car! / Đúng rồi! Toa màu đỏ! | Boing! That’s the blue car. The red block wants the red car! / Tưng! Đây là toa màu xanh dương. Khối gỗ màu đỏ muốn lên toa màu đỏ cơ! |
| shape | Yes! The star car! | Boing! That’s the heart car. The star wants the star car! |
| size | Yes! The big car! / Đúng rồi! Toa to! | Boing! That’s the big car. The small block wants the small car! |
| home | Moo! The cow lives in the barn! / Ò ò! Con bò sống trong chuồng! (no sound word for quiet animals) | Boing! That’s the barn car. The duck wants the pond car! / Tưng! Đây là toa chuồng. Con vịt muốn lên toa ao cơ! |
| number (count) | One! Two! Three! (`ev.count.i`); car full → `sayCarDone` "That makes three teddy bears!" | — (`full`: "This car is full! Try another one.") |
| letter | Yes! Letter B! · lower: Small b, big B! Yes! · initial: C is for cow! / Chữ B, bò! | Boing! That’s the letter D car. Letter B wants the letter B car! · lower: Boing! Small b goes with big B! · initial: Boing! Cow starts with C. It wants the letter C car! |
| text (add/sub) | 2 + 3 is five! / 7 − 3 bằng bốn! | Boing! That’s the 3 + 4 car. Which car makes five? (never names the right sum) |
| parity | Seven is odd! / Tám là số chẵn! | Boing! Five is odd. It wants the odd car! |

### 1.3 World event → line (suggested wiring)
| world event | line |
|---|---|
| `level {level, topic}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+level)` (0 morning "Good morning, train!", 1 noon, 2 sunset, 3 night "Good night, stars! Lights on!") |
| `round {surprise}` / `arrive` | `t('deal')` "Here comes the train!"; surprise → `t('surprise.hitch')` / `t('surprise.balloon')` |
| `ask {promptKey, params}` | `t(promptKey, params)` — protected prompt. `p.count {n, cargo}`, `p.count2 {a, b, cargo}`, the others take no params |
| `grab` | `sayGrab(lang, {…e, item})` — short, interrupting is fine |
| `tap` (a tap is not a drop) | `sayGrab` now and then `t('dragHint')` "Hold it and drag it into a car!" (rate-limit) |
| `correct` | `sayCorrect(lang, {…e, item}, car.label)`; count mode gives the count word (queue, no interrupt) |
| `carDone` | `sayCarDone(lang, {…e, item: lastItem}, car.label)` (count cars) — or skip for sort cars |
| `full` | `t('full')` |
| `wrong` | `sayWrong(lang, {…e, got: car.label})`; `hint` → `t('hint')` |
| `miss` | optional `t('miss')` "Pop it into a car!" |
| `idle {n}` | `t('idle') + ' ' + prompt` |
| `loaded` | `t('loaded')` "All aboard! Tap the whistle!" |
| `whistleHint` / `whistle {auto}` | `t('whistleHint')` / auto: `t('whistleAuto')` "Toot toot! Off we go!" |
| `whistle` (child) / `depart` | `t('depart')` "Choo choo! Bye-bye!"; extra taps `toot` → `t('toot')` (rarely) |
| `hitchTap` / `balloonTap` | `t('hitch.tap')` / `t('balloon.tap')` |
| `roundDone` | `t('great')` / `t('praise')` (queued — never cut the last count) |
| `pokeMomo` | repeat the prompt |
| `talk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone {stars}` | `t('party')`, `t('session.done', {stars})` |

### 1.4 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Momo’s voice"), mic, done,
  stars, chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing, tapOrSay, listening
  ("Momo is listening…"), tapMomo, tapHint, dragHint, whistle, skip, langName.en, langName.vi` (every key the band's
  index.html / ui.js / main.js used is kept; `ui.tapBop` became `ui.tapMomo`).
- **topic.\*** (one banner each): colors "Colour Cars", shapes "Shape Cars", size "Big and Small", homes "Animal Homes",
  count "Counting Cargo", letters "ABC Blocks", lower, initial, add, sub, oddeven.
- **Prompts** (3 wordings): `p.colors, p.shapes, p.size, p.homes, p.count {n, cargo}, p.count2 {a, b, cargo}, p.letters,
  p.lower, p.initial, p.add, p.sub, p.oddeven`, fallback `p.any` (unknown `p.*` key or missing `n`). `p.count` without
  cargo says "toys" / "món đồ chơi"; `p.count2` without a/b falls back to `p.count`.
- **Item lines**: `say.grab.{block, shape, size, animal, cargo, letter, number, text, any}` `{it}`;
  `say.correct.{color {color}, shape {shape}, size {size}, home {animal, where}, number {num}, letter {letter},
  lower {letter, lower}, initial {letter, word}, text {expr, ans}, parity {num, parity}}`; `say.carDone.count {num, cargo}`,
  `carDone`, `full`; `wrong.boing`, `wrong.got {got}`, `wrong {item, want}`, `wrong.math {item}`, `wrong.parity {num,
  parity}`, `wrong.initial {word, first}`, `wrong.lower {lower, letter}`, `wrong.any`; `miss`, `dragHint`.
- **Train lines**: `deal, loaded, whistleHint, whistleAuto, depart, toot, surprise.hitch, hitch.tap, surprise.balloon,
  balloon.tap, hint, idle, praise, great {child}, party, session.done {stars}`, `weather.0..3`, `count.1..20`.
- **Talk**: `talk.intro, talk.right, talk.colors, talk.shapes, talk.size, talk.homes {animal}` ("Where does the cow
  live?" → home picture choices; fallback `talk.homesAny`), `talk.count {cargo}` ("How many teddy bears?"; fallback
  `talk.countAny`), `talk.letters, talk.lower, talk.initial, talk.add, talk.sub, talk.oddeven`, `talk.wrong(.a, .animal,
  .home {where}, .size, .letter, .small, .number)`.
- Derived params: `{where}` from `home` ("in the barn" / "trong chuồng", "dưới ao", "trên cây", "trong hang"), `{sound}`
  and `{word}` from `animal`, `{num}` from `n`, `{lower}` from `letter`, `{expr}` from `expr | text | sum | diff`,
  `{cargo}` plural-aware from `n` (or `a`).

### 1.5 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| animal | cow, pig, sheep, duck, frog, fish, bird, squirrel, butterfly, bunny, mouse, fox | con bò, con heo, con cừu, con vịt, con ếch, con cá, con chim, con sóc, con bướm, con thỏ, con chuột, con cáo |
| home | the barn, the pond, the tree, the burrow (car: "the barn car") | chuồng, cái ao, cái cây, cái hang (car: "toa chuồng / ao / cây / hang") |
| cargo | teddy bear(s), ball(s), rubber duck(s), toy rocket(s), toy boat(s), toy drum(s) | gấu bông, quả bóng, vịt cao su, tên lửa đồ chơi, thuyền đồ chơi, cái trống · counted: con gấu bông, quả bóng, con vịt cao su, chiếc tên lửa, chiếc thuyền, cái trống |
| toy | block, ball, cone, tube | khối gỗ, quả bóng, khối nón, khối trụ |
| sound (home line) | moo, oink, baa, quack, ribbit, tweet, squeak | ò ò, ụt ịt, be be, cạp cạp, ộp ộp, chíp chíp, chít chít |
Mic also accepts e.g. "rabbit", "piggy", "farm", "hole", "water"; vi "con lợn", "bươm bướm", "dưới ao", "trên cây",
"trong hang", with or without diacritics. "ball" is both a toy and a cargo — never offered together in one question.
`initial` default words (`TT.WORDS`, content may replace): en all 12 animals (cow C, pig P, sheep S, duck D, frog F, fish F,
bird B, squirrel S, butterfly B, bunny B, mouse M, fox F); vi bò B, heo H, cừu C, vịt V, cá C, sóc S, bướm B, cáo C
(chim / chuột / thỏ / ếch left out: ch, th digraphs and the tricky Ê).
Vietnamese letter names use kindergarten phonics: b → bờ, c → cờ, k → ca, q → quờ, y → i dài … (`LETTER_VI`).

## 2. Voice (`TT.Voice`) — unchanged proven engine
`init({lang, enabled})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `TT.debug.voiceLog`, also when muted), `spoken(lang, text)`, `RATE` 0.9 / `PITCH` 1.2,
`canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null, transcript, reason?}>`,
`stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60. Lists are read
  at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Momo: **rate 0.9, pitch 1.2** (a small bright owl; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s,
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.
- Tips: say `count.<i>` queued (no interrupt) so fast children hear the newest numbers; `roundDone` praise and hints queue;
  feedback (`grab`, `wrong`, `full`) may interrupt. Disable speech for `speed > 1` (log only).

## 3. iOS / Safari findings (re-checked 6 Nov 2026)
- **Audio session**: Web Audio is on the quiet *ambient* channel (and muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+) — `Audio.unlock()` (lead) sets it. While the mic listens,
  `voice.js` switches to `'play-and-record'` and restores the previous type afterwards (otherwise speech goes to the
  earpiece / gets quiet).
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network), and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. The mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- iOS 26: the voice picked in Settings is ignored for web speech and downloaded Enhanced voices are often missing from
  `getVoices()` → we always set `utterance.voice` by name (Samantha / Linh are built in). `hasVoice('vi') === false` →
  show `ui.voiceMissing`.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).

## 4. Input (`TT.Input`) — built for DRAG
```js
const detach = TT.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y),
  move:   (x, y, ev) => world.pointerMove(x, y),
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel();    // main: on resize / rotation / pause → one cancel(), the rest of that finger is dropped
detach.isActive();  // a finger (or mouse button) is down
detach();           // remove all listeners
```
**Callbacks receive two NUMBERS `(x, y)` in logical px, then the raw event — never a point object** (the Dino Nest Sort
bug: `p => world.pointerDown(p.x, p.y)` gets `undefined`). Non-finite points are dropped; an `up` without a mappable point
becomes `cancel()`.
- **One active pointer.** `down` fires synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`,
  **pointer capture**), every `pointermove` of that finger reaches `move` (unthrottled), `up` arrives exactly once — also
  when lifted outside the canvas / over the HUD (capture + window fallback, no double delivery).
- **Extra fingers are ignored** (no down/move/up for them; a resting second hand never steals or drops the cargo).
  Recovery when the active finger is known to be gone (iOS swallowed its `pointerup`): a new touch with `isPrimary` (iOS
  only marks a touch primary when no other touch is down), a mouse press replacing a touch, the touch-fallback's active
  touch missing from `e.touches`, or the active pointer silent ≥ `Input.STALE_MS` (6 s) → `cancel()` for the old, `down()`
  for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh (`touchmove` preventDefault except `.scroll` and range inputs), context menu, Ctrl/⌘ zoom
  and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.

## 5. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]` (all kinds), `CARGO_*`, `HOME_CAR`, `WHERE`, `SOUNDS`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`,
`WORD_LIST[xx]`, `GENERIC_CARGO`, a complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`;
`voice.js`: `LANG_TAG`, `PREFERRED`. Run the unit test.
