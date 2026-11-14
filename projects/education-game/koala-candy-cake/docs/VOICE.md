# Koko's Cake Tower — Voice, language and input

Files: `game/js/i18n.js` (`CK.I18N`), `game/js/voice.js` (`CK.Voice`), `game/js/input.js` (`CK.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 54 000 checks). They cover:
- every key in both languages, with identical key sets
- every prompt key × every value, with all params filled
- every name kind × value: name, spoken forms, digits, no-diacritic forms
- every animal: a name, spoken forms and its sound word
- `sayStack` / `sayWrong` / `sayTap`: exact lines, plus a sweep over all 11 topics
- **every round and Talk time the real `content.js` makes** (ages 3–7, both languages: 1 320 rounds, ≈ 19 000 lines)
- **no old-theme word in either language** (Lulu, giraffe, jungle, banana, monkey, butterfly, firefly, morning…night,
  block/khối, tower words, jungle animals, "chấm")
- garbage events, never-negative wording, Vietnamese diacritics present
- the EN/VI matcher, the voice queue and interrupt with a fake `speechSynthesis`, the recognizer, the drag input
  rules and the parent hold gate

The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from Lulu's Jungle Tower and Pip's Camp.
All the wording is new.

## 0. Wording principles (Koko)
- **Koko** is a cheerful little koala baker (chef's hat, mint apron). Her name is written **and spoken** "Koko" in
  both languages (vi voices read it "cô-cô"), so no spoken-name substitution is needed. Vietnamese introduces her as
  "koala Koko" ("Mình là koala Koko"); the logo is "Koala Koko / Tháp Bánh Kem".
- **Short and concrete**: ≤ 13 words per key (tested), with the key word last ("Stack the **red** layer!").
- **Reaction lines are tiny**, so they never cut off the next prompt:
  - A landing is the name plus one sound or praise word: "Red! Plop!" (≤ 6 words EN / 8 VI, tested).
  - A bounce is "Boing! That’s blue. Find red!" (≤ 10 / 13 words).
  - The finished cake is counted once, by `sayTowerDone` (≤ 11 words for 6 layers).
- **Cake vocabulary**:
  - EN: stack / **layer** / **cake** / on top / **cherry** / **candles** / **sprinkles** / Candy Village.
  - VI: xếp / **tầng bánh** / **bánh kem** / lên trên / **quả anh đào** / **nến** / **cốm màu** / Làng Kẹo.
  - Count tokens on layers are chocolate **candy dots**, vi **hạt kẹo** ("tầng bánh có ba hạt kẹo").
  - Stars are only the score ("ngôi sao").
- **Classifiers**:
  - A layer is "tầng bánh": "tầng bánh màu đỏ", "tầng bánh có hình ngôi sao", "tầng bánh số năm", "tầng bánh to".
  - Animal cookies are "bánh quy con mèo" or "tầng bánh có hình con mèo".
  - Animals always take "con" ("con mèo"), colours take "màu", shapes "hình", letters "chữ".
- **Never negative.** A wrong layer bounces off. Koko says the bounce word, names what bounced, then repeats the goal:
  "Boing! That’s blue. Find red!" / "Tưng! Tầng bánh màu xanh dương. Tìm màu đỏ nhé!".
  - Maths and sound asks never give the answer away.
  - The test bans these words in every non-UI line and every generated line: no / not / wrong / bad / fail /
    incorrect / mistake / oops / fall / crash / broken, and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ /
    ngã / rơi mất. The cake never falls, and Koko never says it might. Rain is "Tí tách, mưa đường rồi!", never "đổ mưa".
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!". Every prompt key has a "Bé ơi /
  nhé! / nào!" wording (tested).
  - Bounce word: **"Tưng!"** (EN "Boing!"). Soft landing: **"Bụp!"** (EN "Plop!").
  - Praise uses **{child}** ("Bé Mai làm bánh giỏi quá!"). Every `great` / `idle` / `talk.right` / `session.done`
    list has a name variant and a no-name variant. With no name, the no-name variant is used, or "bé" / "friend".
- **3 wordings** for every prompt key, all different (tested).

### Animal cookies (`animal` kind) and their sounds
| id | EN | VI | sound EN / VI | also accepted by the mic |
|---|---|---|---|---|
| bunny | bunny | con thỏ | — (never asked by sound) | rabbit, bunny rabbit · thỏ, thỏ con, chú thỏ, thỏ trắng |
| bear | bear | con gấu | — (never asked by sound) | teddy, teddy bear, bear cub · gấu, gấu con, gấu bông |
| cat | cat | con mèo | meow / **meo meo** | kitty, kitten · mèo, mèo con, meo meo |
| dog | dog | con cún | woof / **gâu gâu** | puppy, doggy, bow wow · cún, **con chó, chó**, chó con, gâu gâu |
| duck | duck | con vịt | quack / **cạp cạp** | ducky, duckling · vịt, vịt con, cạp cạp, quạc quạc |
| pig | pig | con heo | oink / **ụt ịt** | piggy, piglet · heo, **con lợn, lợn** (northern), ụt ịt |
| cow | cow | con bò | moo / **ò ò** | calf · bò, bò sữa, ò ò, ụm bò |
| sheep | sheep | con cừu | baa / **be be** | lamb, little lamb · cừu, cừu non, be be |

Notes on the animal table:
- **vi cow "ò ò"**: picture books also say "ụm bò", but that contains the answer "bò", so the prompt says "ò ò". The mic
  accepts both.
- **Sounds as answers**: each animal's own sound is an accepted answer, because a 3-year-old often answers "meo meo!".
  This also fixes a matcher clash. "gâu gâu" (dog) and "gấu" (bear) are both "gau" without diacritics, so with the
  exact form listed, "gâu gâu" → dog and "gấu" → bear (tested).
- **No-diacritic forms** ("con meo", "con cho", "con lon") are all accepted. "con" alone and "cub" alone match nothing.
- **No sound**: `p.sound` / `talk.sound` for the bunny or the bear falls back to `p.animals` / `talk.animalsAny`.

## 1. API for main.js (exact event fields)
General API:
- `CK.I18N.t(lang, key, params, rng?)`
- `name(lang, kind, value)`, `sound(lang, animal)`, `hasSound(animal)`, `words(lang, kind, value)`
- `has(lang, key)`, `speech(lang, text)`, `setChild(name)`, `talkWrong(lang, kind, value)`
- `phrase(lang, kind, value, block)`, `wordEntry(lang, id)`

Name kinds: `color, shape, size, animal, number, dots, stars, letter, text, sum, diff, parity, word`.

Cake helpers, all `(lang, ev, rng?)`. They never throw, and never return '' or a raw `{x}`:
- `sayStack(lang, ev)`: ev `{ nameKind, nameValue, block?, topic, promptKey, params }` (`n` is accepted, not spoken).
- `sayTowerDone(lang, n)`: "One, two, three, four! We reached the cherry!" / "Một, hai, ba, bốn! Tới quả anh đào rồi!".
  Takes `n` or `{n}`; with no n it says `t('towerDone')`.
- `sayWrong(lang, ev)`: ev `{ nameKind, nameValue, want:{kind, value}, block?, topic, promptKey, params, streak }`.
- `sayTap(lang, ev)`: ev `{ nameKind, nameValue, block? }` (also used for `grab`).
- `sayCount(lang, i)` = `t('count.' + i)` ("One!" … "Twelve!"), used for the candle count.
- Aliases: `sayFound` / `sayGo` / `sayCorrect` = `sayStack`, `sayGrab` / `sayFlip` = `sayTap`, `sayMismatch` = `sayWrong`.

### Keys new in Koko (EN + VI) and aliases kept for the old main.js
| new key | EN [0] | VI [0] | old key kept as alias (same text) |
|---|---|---|---|
| `cherry` | Plop! The cherry is on top! | Bụp! Quả anh đào lên đỉnh rồi! | `monkey` |
| `candles` | Candles! Let’s count them! | Nến nè! Mình cùng đếm nến nhé! | — |
| `blow` | Make a wish… fffff! | Bé ước một điều nhé… phù! | — |
| `candlesOut` | Hooray! Happy cake day! | Hoan hô! Bánh kem đẹp quá! | — |
| `sprinkles` | Yay, sprinkles! | Oa, cốm màu rắc xuống nè! | `bloom` |
| `surprise.bee` | Bzzz! A honey bee is coming! | Vo ve! Có bạn ong bay tới! | `surprise.butterfly` |
| `bee` | A honey bee is visiting our cake! | Bạn ong ghé thăm bánh kem rồi! | `butterfly.land` |
| `bee.tap` | Bzzz! Bye-bye, bee! | Vo ve! Tạm biệt bạn ong! | `butterfly.tap` |
| `ui.tapKoko` | Tap Koko to hear it again | Chạm vào Koko để nghe lại nhé | `ui.tapLulu`, `ui.tapPip` |
The aliases only exist so the copied main.js keeps working. Once main.js uses the new keys they can go.

### 1.0 World event → line
World events already carry `nameKind` / `nameValue` (DESIGN §5.2). main adds `topic`, `promptKey` and `params` of the
current ask (`ev2()`), and optionally `block` (the piece's block). With `block`, content's `word` / `initial` are used.

| world event | line |
|---|---|
| `level` | `t('ui.chapter', {n}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)`: 0 "Sunny day in Candy Village!", 1 "Whoosh, it’s breezy! Hold on, cake!", 2 "Pitter-patter, sugar rain!", 3 "Look, a rainbow!" |
| `round` (+ `surprise`) | `t('surprise.breeze')` / `t('surprise.bee')` |
| `deal` (round start) | `t('deal')` "Let’s bake a cake up to the cherry!" (only on the first deal of a round) |
| `ask` | `t(promptKey, params)` (protected prompt) |
| `grab` / `tapPiece` | `sayTap(lang, ev)` (short, never interrupts the prompt) |
| `miss` | `t('miss')` "Lift it up over the cake and let go!" (rate-limited) |
| `stillDrag` | `t('stillDrag')` "Let go over the cake!" |
| `stack` | `sayStack(lang, ev)`; on the LAST layer, say `sayTowerDone(lang, n)` instead |
| `wrong` | `sayWrong(lang, ev)`; after 2 misses `hint` follows → `t('hint')` |
| `idle` | `t('idle') + ' ' + prompt` |
| `pokeKoko` | repeat the prompt (`ui.tapKoko` is the bubble hint) |
| `gust` | `t('gust')` "Whoa, a breeze! I’ve got it!" / "Ui, gió thổi! Koko giữ bánh nè!" |
| `bee` / `beeTap` | `t('bee')` / `t('bee.tap')` |
| `towerDone {n}` | `sayTowerDone(lang, n)` (interrupt) |
| `cherry` | `t('cherry')` when Koko is quiet |
| `count {i}` | optional `t('candles')` once before i = 1, then `sayCount(lang, i)` per candle (or chimes only, if the line before is still talking) |
| `blow` | `t('blow')` "Make a wish… fffff!" (TTS says "fooo") |
| `candlesOut` / `sprinkles` | optional `t('candlesOut')` / `t('sprinkles')` |
| `roundDone` | star chime only; `t('great')` is available |
| `clearBlock` | optional `t('clear')` once |
| `talk` / `talkAsk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone` | `t('party')` "Rainbow party time!", then `t('session.done', {stars})` |

UI keys: every `ui.*` key, including `ui.volume`, `ui.chapter`, `ui.welcome`, `ui.listening`, `ui.tapOrSay`,
`ui.micDenied`, `ui.micUnsupported`, `ui.holdForParents`, `ui.voice` ("Koko’s voice" / "Giọng của Koko"),
`ui.tapKoko` and `ui.dragHint`.
- Logo `ui.logo1` / `ui.logo2`: "Koko’s" / "Cake Tower", vi "Koala Koko" / "Tháp Bánh Kem".
- `ui.title`: "Koko’s Cake Tower" / "Tháp Bánh Kem của Koko".

### 1.1 Prompt keys and params (each has 3 wordings; a missing param falls back to `p.any`)
| key | params | example EN / VI |
|---|---|---|
| `p.colors` | `{color}` | Stack the red layer! · Bé ơi, xếp tầng bánh màu đỏ nhé! |
| `p.shapes` | `{shape}` | Put the star layer on top! · Bé ơi, đặt tầng bánh có hình ngôi sao lên trên nhé! |
| `p.countUp` | `{n}` | Count up! Find layer number 2! · Đếm lên nào! Bé tìm tầng số 3 nhé! (every wording says count) |
| `p.count` | `{n}` | Find the layer with 3 candy dots! (1 → "1 candy dot") · Bé tìm tầng bánh có 3 hạt kẹo nhé! |
| `p.animals` | `{animal}` | Stack the bunny cookie layer! · Bé ơi, xếp tầng bánh có hình con thỏ nhé! · Bé tìm bánh quy con bò nào! |
| `p.sound` | `{animal}` (→ `{sound}`) | Who says meow? Stack that layer! · Con gì kêu ụt ịt? Bé xếp tầng bánh đó nhé! |
| `p.size` | `{size}` | Stack the big layer! · Bé ơi, xếp tầng bánh nhỏ nhé! |
| `p.letters` | `{letter}` | Stack the letter B! · Bé ơi, xếp tầng bánh chữ B nhé! (TTS "chữ bờ") |
| `p.lower` | `{letter}` (capital) | Big letter B! Find its small letter! |
| `p.initial` | `{letter}` | Which one starts with the letter C? Stack it! · Bánh quy nào bắt đầu bằng chữ M? Bé xếp nhé! |
| `p.add` / `p.sub` | `{a, b}` (+ `op` '−') / `{text}` / `{expr}` | What is 2 + 3? Stack the answer! |
| `p.oddeven` | `{parity}` | Find an odd number! · Bé ơi, tìm số chẵn nhé! |

### 1.2 What Koko says when a layer lands / bounces (short on purpose)
| topic | stack | wrong |
|---|---|---|
| colors | Red! Plop! / Màu đỏ! Bụp! | Boing! That’s blue. Find red! / Tưng! Tầng bánh màu xanh dương. Tìm màu đỏ nhé! |
| shapes | Star! Yes! / Hình trái tim! Bụp! | Boing! That’s an oval. Find the star! |
| count (candy dots) | Three candy dots! Plop! / Ba hạt kẹo! Bụp! | Boing! That’s two candy dots. Find three candy dots! / Tưng! Hai hạt kẹo. Tìm ba hạt kẹo nhé! |
| count-up | Three! Plop! / Số ba! Bụp! | Boing! That’s three. Find number two! |
| animals | Cat! Meow! / Con mèo! Meo meo! · Bunny! Plop! | Boing! That’s the pig. Find the bunny! / Tưng! Con heo. Tìm con thỏ nhé! |
| sound | Moo! The cow! / Be be! Là con cừu! | Boing! That’s the duck. Who says woof? / Tưng! Con vịt. Con gì kêu gâu gâu? |
| size | Big layer! Plop! / Tầng bánh nhỏ! Bụp! | Boing! That’s the small one. Find the big one! / Tưng! Tầng bánh nhỏ. Tìm tầng bánh to nhé! |
| letters | Letter B! Plop! / Chữ B! Bụp! | Boing! That’s letter C. Find letter B! |
| lower | Small b! Plop! / Chữ b thường! Bụp! | Boing! That’s small d. Find small b! |
| initial | D is for duck! / Chữ V, vịt! | Boing! S is for sheep. Find letter C! / Tưng! Bò, chữ B. Tìm chữ H nhé! |
| add / sub | 2 + 3 is five! / 7 − 3 bằng bốn! | Boing! That’s six. What is 2 + 3? |
| oddeven | Seven is odd! / Tám là số chẵn! | Boing! Four is even. Find an odd one! |

## 2. How voices are chosen
The voice list is read with `getVoices()` at init, on `voiceschanged`, and every 250 ms for 6 s (iOS fills the list
late). Each voice gets a score:
- the language prefix must match
- exact `en-US`/`vi-VN`: +6
- preferred names: en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft Aria/Jenny; vi **Linh**, Google Tiếng
  Việt, Microsoft HoaiMy/An
- Enhanced/Premium/Natural: +12; Google off iOS: +8; local: +3
- Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…): −60

**Utterances**: **rate 0.9, pitch 1.2** (`CK.Voice.RATE` / `PITCH`). That makes Koko young and bright. Above ≈ 1.3
iOS voices sound robotic, and below rate 0.85 Vietnamese tones smear. `volume` = `Voice.setVolume()` (the game's volume
slider).

**Queue**:
- One line speaks, ≤ 2 wait. The oldest non-priority line is dropped, and non-priority lines older than 5 s are skipped.
- `interrupt` flushes + cancels, then speaks after 50–90 ms; `dropQueued()` drops the waiting lines.
- A watchdog ends lines iOS never ends. Chrome desktop gets a keep-alive. A hidden page stops speech.

**Spoken text** = `Voice.spoken(lang, text)` = `I18N.speech`:
- letters: "letter B" → "letter bee", vi "chữ B" → "chữ bờ"; "T is for" → "tee is for"
- + − =, and "…" → a pause
- animal sounds and effects that TTS would spell out or clip: "baa" → "baaah", "moo" → "mooo", "Bzzz" → "Buzz",
  "fffff" → "fooo"

Every line is logged (`Voice.log`, `CK.debug.voiceLog`), also when muted.

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("chữ B") and the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).

`initial` words: content.js owns the live list (`CK.WORDS`, animal cookies). i18n has the same default:
- en: bunny B, bear B, cat C, dog D, duck D, pig P, cow C, sheep S
- vi: gấu G, mèo M, cún C, vịt V, heo H, bò B, cừu C. **thỏ is left out**, because Vietnamese phonics teaches "th" as
  its own sound.

`name(lang, 'word', x)` works with **any** id content uses: a word, an `id`, a `sprite`, an animal id, a word from the
other language (mapped through the shared id), or an `[{id, en, vi}]` list. An unknown id is shown readable
("cherry_cloud" → "cherry cloud").

## 4. Speech recognition (Talk time, optional)
`listen()` creates a **new** `SpeechRecognition || webkitSpeechRecognition` each time:
- en-US/vi-VN, interim results, 5 alternatives; TTS is stopped first
- a final match resolves at once; an interim match waits 450 ms; 7 s timeout
- `not-allowed` turns `canListen()` off for the session
- `navigator.audioSession.type = 'play-and-record'` while listening, restored afterwards

Matcher order: exact tokens > diacritic-free > number words as digits > edit distance on long words.
- `=word` forms match the whole utterance only (en "to" → 2, vi "không" → 0).
- Ties at the same position are ambiguous and match nothing.
- Choices `{id, kind, value}` use `words()`.
- `dots` choices accept "three candy dots" / "three dots" / "three candies" / "ba hạt kẹo" / "ba chấm" / "ba hạt" and
  plain numbers.

## 5. iOS / Safari notes (re-checked 14 Nov 2026 for iOS 18 / 26 Safari and the Safari 27 notes)
**Speaking**
- `speechSynthesis` works in Safari tabs and Home-Screen web apps on iOS 17, 18 and 26.
- **iOS 26 regression**: the system ignores the voice the user picked in Settings for synthesized speech
  (`AVSpeechSynthesisVoice`, Apple forum thread 804648). We always set `utterance.voice` by name from `getVoices()`,
  so Koko's voice does not depend on that setting.
- **Safari 27 release notes**: Safari fixed a bug where `speechSynthesis.cancel()` also removed utterances queued by
  later `speak()` calls. Older Safari still has the bug, so we keep the 90 ms gap between `cancel()` and the next
  `speak()` on iOS for `interrupt`. Do not remove it.
- Downloaded Enhanced/Premium voices are still mostly missing from `getVoices()` (WebKit bug 290497). Samantha and Linh
  are built in. When `hasVoice('vi') === false`, show `ui.voiceMissing`.
- The first `speak()` must come from a gesture. `unlock()` in the first `touchend`/`click` speaks a silent `' '`, and a
  line refused with `not-allowed` is kept and spoken on the next `unlock()`. A `pointerdown` that starts a DRAG is not
  enough on every iOS version, so call `unlock()` on `pointerup`/`touchend` (main's first-gesture handler).
- After the app was in the background the synthesizer can be stuck paused. On `visibilitychange` back we `cancel()` +
  `resume()`.
- Safari ducks WebAudio while speaking, so keep the music duck gentle.

**Listening**
- `webkitSpeechRecognition` works in Safari tabs (it uses Siri dictation, so Siri/Dictation must be on, and most devices
  need a network connection). It is optional; taps always work.
- It does not work in Home-Screen web apps, so `canListen()` is false when standalone.
- **Known WebKit hang** (2025–2026 reports): after an HTML `<audio>` element has played, `start()` can show "listening"
  but never fire `onresult`, `onerror` or `onend`. Our protections:
  - the game's sound is Web Audio only (no `<audio>` elements)
  - each `listen()` uses a fresh recognizer
  - the 6–7 s timeout always resolves and aborts
  - the mic button stays tappable to try again

**General**
- iPadOS sends a desktop UA; we detect it via `MacIntel` + touch.
- These files use no regex look-behind (a SyntaxError on iOS < 16.4 would kill the script; tested).

Sources: [Apple forum: AVSpeechSynthesisVoice ignores user-selected voices in iOS 26](https://developer.apple.com/forums/thread/804648),
[Safari 27 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes.md),
[iOS Safari Web Speech API bug (recognition hang after `<audio>`)](https://www.technetexperts.com/ios-safari-web-speech-api-bug-fix/).

## 6. Input and kid-proofing (`CK.Input`) — built for dragging
- `attach(canvas, {toLogical, down, move, up, cancel, hover?})` returns `detach()` with **`detach.cancel()`** and
  **`detach.isActive()`**. Every handler gets **numbers** `(x, y, ev)` in logical px.
- `down` fires **synchronously in `pointerdown`** (the layer lifts at once); **every** `pointermove` of the same finger
  fires `move` synchronously — no throttling or rAF batching (tested with 120 moves), so the spring-follow and the
  velocity the world measures for the drop / pendulum tilt see each point (60 Hz, 120 Hz on ProMotion). Coalesced
  sub-frame points are not replayed (same world time → zero dt → velocity spikes); `ev.timeStamp` is passed along.
- Pointer capture on the canvas: a drag that crosses the HUD, the speech bubble or leaves the canvas keeps flowing;
  without capture the window listeners deliver the active finger's moves/ups exactly once (tested).
- One active pointer: a second finger never steals a MOVING drag; a swallowed `pointerup` recovers on the next primary
  touch. **Still drag (playtest P1-2):** when the active finger moved < 20 px for 1.5 s (`Input.STILL_PX` /
  `STILL_MS`, e.g. an iPad thumb resting on a block), a new touch, even a second finger, takes over: `cancel()` for the
  old drag (layer goes home), then `down()` for the new finger; the old finger's later moves/ups are ignored (tested).
  The world also cancels a drag held still for 6 s and emits `stillDrag`.
- `pointercancel` (canvas or window) / `lostpointercapture` / window `blur` / page hide → `cancel()` **once** (the world
  sends the block home), later moves/ups of that finger are ignored. An `up` whose point cannot be mapped → `cancel()`.
  **main should call `detach.cancel()` on resize / rotation / pause** (DESIGN §5.2: rotation cancels the drag) so a
  late `up` of the old finger can never arrive at a re-laid-out world.
- Targets `button, .screen, #hud, .no-game-input` are ignored on press; touch + mouse fallback; a throwing handler is caught.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band / pull-to-refresh, context menu,
  zoom/refresh keys; the canvas has `touch-action: none` (a drag never scrolls the page).
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]`, `SOUNDS[xx]`, `NUM[xx]`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, `DOT[xx]`, `STAR[xx]`,
a complete `STR[xx]` (identical key set — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`. Run the
unit test.
