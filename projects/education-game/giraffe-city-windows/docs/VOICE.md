# Gigi's Peekaboo Windows — Voice, language and input

Files: `game/js/i18n.js` (`GW.I18N`), `game/js/voice.js` (`GW.Voice`), `game/js/input.js` (`GW.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 55 000 checks: every key in both languages with identical `{params}`,
every name kind × value incl. animals / homes / colour things, `sayFlip` / `sayMatch` / `sayMismatch` for ~3 500 synthetic
pairs and every window/pair/Talk question the real `content.js` makes, garbage events, never-negative wording, no
forest/duckling leftovers, the "Gigi" → "Gi Gi" rule, EN/VI matcher for animals / homes / things with and without
diacritics, voice queue with a fake `speechSynthesis`, recognizer, input rules).
The engine (voice queue, iOS fixes, matcher, kid-proofing) is Dee's Forest Memory's (itself from Kitten's Balloon Farm);
the wording is new.

## 0. Wording principles (Gigi)
- **Gigi** is a cheerful giraffe calf in a mint scarf who stretches her neck to peek into the windows of Peekaboo Street.
  Written **"Gigi"** in both languages (VI title "Hươu Gigi", VI self-introduction "Mình là hươu cao cổ Gigi").
  A Vietnamese voice reads "Gigi" as one odd syllable, so `Voice.spoken()` replaces the whole word `Gigi` with
  **"Gi Gi"** in the text sent to TTS — only in Vietnamese, never in the bubble, the log or `onStart/onEnd` (tested).
  VI lines never put "gì" ("what") right after the name ("Gigi gì…") — spoken "Gi Gi gì" would be confusing.
- **Short and concrete**: ≤ 12 words per line (tested; match lines ≤ 14; VI mismatch ≤ 18 syllables), key word last.
- **Window vocabulary**: window / open / pair / look again — vi **cửa sổ / mở / một đôi (cặp for letters) / xem lại**.
  Count windows show round coloured lights: spoken **dots** — vi **chấm tròn** (the mic also takes "lights" / "chấm" / "đèn").
- **Never negative.** Mismatch: "A red umbrella and a blue kite. Let’s look again!" / "Cái ô màu đỏ và con diều màu xanh
  dương. Mình xem lại nhé!". Banned in every non-UI line: no / not / wrong / bad / fail / incorrect / mistake / oops and
  sai / dở / tệ / hỏng / không đúng / chưa đúng / trật.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!"; every noun with its classifier
  (con chó, cái ô, quả bóng bay, chiếc ô tô, con diều, cái cốc, chiếc ủng). Colours carry "màu", shapes "hình".
  Variant lists have 5–8 entries and a `{child}` + a no-name form; prompts 3, surprises / weather 2.

### Names
| kind | id | EN | VI | also accepted by the mic |
|---|---|---|---|---|
| animal | dog | dog | con chó | puppy, doggy · chó, **cún**, cún con |
| | cat | cat | con mèo | kitty, kitten · mèo, mèo con |
| | bird | bird | con chim | birdie · chim, chim sẻ, chim non |
| | fish | fish | con cá | goldfish · cá, cá vàng |
| | bee | bee | con ong | bumblebee · ong, ong mật |
| | rabbit | **bunny** | con thỏ | rabbit · thỏ, thỏ con |
| | duck | duck | con vịt | duckling · vịt, vịt con |
| | hen | hen | con gà | chicken, chick · gà, gà mái |
| | spider | spider | con nhện | · nhện |
| home | kennel | kennel | nhà chó | dog house · nhà cún, chuồng chó |
| | basket | basket | cái giỏ | cat bed · giỏ, ổ mèo |
| | nest | nest | tổ chim | bird nest · cái tổ chim |
| | bowl | fish bowl | bể cá | fish tank, aquarium · bể, hồ cá, bình cá |
| | hive | beehive | tổ ong | hive · nhà ong |
| | hutch | hutch | chuồng thỏ | bunny house · nhà thỏ |
| | pond | pond | cái ao | lake · ao, hồ nước |
| | coop | hen house | chuồng gà | coop, chicken coop · nhà gà |
| | web | web | mạng nhện | spider web, cobweb · lưới nhện, tơ nhện |
| thing | umbrella / balloon / car / kite / cup / boot | umbrella … | cái ô / quả bóng bay / chiếc ô tô / con diều / cái cốc / chiếc ủng | brolly, mug, welly · dù, bong bóng, xe hơi, diều, ly, ủng |
Bare "tổ", "chuồng", "nhà", "con" match nothing (ambiguous). Every no-diacritic form ("con cho", "to chim") is accepted.
EN plurals: dogs, cats, birds, fish, bees, bunnies, ducks, hens, spiders; umbrellas, balloons, cars, kites, cups, boots.
Initial words: en dog D, cat C, bird B, fish F, bee B, **rabbit R**, duck D, hen H, spider S; vi **mèo M, cá C, ong O,
vịt V, gà G** (chó, chim — ch; thỏ — th; nhện — nh are left out: Vietnamese phonics teaches ch / th / nh as their own
sounds). In the `initial` topic the picture window says the WORD ("A rabbit!", "Mèo!"), not "a bunny" / "con mèo".

## 1. API for main.js
`GW.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `words(lang, kind, value)` · `speech(lang, text)` ·
`sayFlip(lang, ev, rng?)` (= `sayTap`) · `sayMatch(lang, ev, rng?)` · `sayMismatch(lang, ev, rng?)` ·
`sayCritter(lang, type | {type, action}, action?, rng?)` · `talkWrong(lang, kind, value)` · `cardPhrase(lang, card)` ·
`sayCount(lang, n, need)` · `sayReward(lang, ev)` (legacy) · `setChild(name)` · `has / keys / raw / PARAMS`.
Name kinds (`I18N.NAME_KINDS`): `color shape size animal home thing number dots letter text sum diff parity word`.
`name(lang, 'color', {value:'red', obj:'umbrella'})` → "a red umbrella" / "cái ô màu đỏ" (also `'red:umbrella'`,
`'umbrella_red'`); plain `'red'` → "red" / "màu đỏ". Params named `color shape size animal home thing parity` are named
automatically (`{animal:'dog'}` → "con chó"); `{thing}` is also derived from `{obj}`.
Every function copes with missing / junk fields (tested) and never returns '' or a raw `{x}`.

### 1.1 Event → line
| world event | line (main.js) | fields read / notes | speaking rule |
|---|---|---|---|
| `level` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+level)` | weather 0 sunny "What a sunny day!", 1 windy "Whoosh — it’s windy!", 2 rain "Pitter-patter, rain!" / "Mưa rồi! Cửa sổ ấm áp ghê.", 3 rainbow "Look — a rainbow!" | chapter name **interrupts**; weather queued |
| `round` | `t(e.promptKey, e.params)` — `p.<topic>` incl. `p.homes` "Who lives where? Find each animal’s home!"; unknown → `p.any` | `promptKey` | `speakPrompt(…, {priority})` = **protected** for ≈ 72 ms/char |
| `peek` | `t('peek')` "Look carefully!" / "Bé nhìn kỹ nhé!" | — | queued after the prompt |
| `hide` | `t('hide')` "Now they hide!" / "Giờ chúng trốn rồi!" | optional (SFX alone is fine) | queued |
| `flip` | `sayFlip(lang, e)` "A red umbrella!", "The kennel!", "One, two, three dots!" | `nameKind, nameValue, face{kind,value,color,obj,shape,sprite,n,text,scale,parity,dots,animal}, size, topic` | interrupts only when the prompt is over (`canInterrupt()`) |
| `tap` (open window tapped again) | `sayFlip` | as flip | as flip, ≥ 0.9 s apart |
| `clack` (shutter closes) | **no line** — wooden clack SFX only | — | — |
| `match` | `sayMatch(lang, e)` "Two red umbrellas — a pair!", "The dog lives in the kennel!", "Three — one, two, three! A pair!" | `nameKind, nameValue, parity, word, animal, home, topic` + both windows `nameKindA/nameValueA/faceA/sizeA` + `…B` (or `cardA/cardB`, `nameA/nameB`, `cards[]`) | **interrupts** (feedback) |
| `mismatch` | `sayMismatch(lang, e)` "An umbrella and a kite. Let’s look again!", homes: "A dog and a nest. Where does the dog live?" | the two windows as above; without them a gentle `wrong[]` | interrupts only after the prompt; ≥ 1.5 s apart |
| `bloom` | no line (flower "pop-pop" SFX); `reward.bloom` / `reward.light` exist if the lead wants one when Gigi is quiet | — | only when quiet |
| `hint` | `t('hint')` "Psst! Look at the glowing windows!" | not for idle hints | queued |
| `idle` | `t('idle') + ' ' + currentPrompt()` | max 4 per round | queued |
| `cheer` (building done) | `t('cheer')` "The whole building is shining!" / "Cả ngôi nhà sáng rực rồi!" | — | **queued** after the last match line |
| `roundDone` | `t('great')` "What a bright building, {child}!" | say `cheer` OR `great`, not both | queued |
| `scroll` / `walk` | `t('walk')` "Let’s go to the next building!" / "Lóc cóc! Mình đi tiếp nào!" | once per scroll | queued, non-priority (stale after 5 s is fine) |
| `round` with `surprise` / `critter {action:'appear'}` | `sayCritter(lang, type)` or `t('critter.'+type)` (`surprise.<type>` is the same text) | type `pigeon` "Coo coo! A pigeon came to visit!", `bus` "Beep beep! Here comes the little bus!", `balloon` "Up, up, up goes the balloon!" | queued after the prompt |
| `critter {type, action:'tap'}` | `sayCritter(lang, type, 'tap')` "Coo coo! Bye bye, pigeon!", "Beep beep! Everyone is waving!", "Whee! Look at it twirl!" | never a mistake | interrupts only after the prompt |
| `talk` / `talkAsk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)` | `talk.homes` {animal} "Where does the bird live?" / "Con chim sống ở đâu nhỉ?"; `talk.colors` {obj or thing} "What colour is this umbrella?" (no thing → "What colour is this?"); `talk.animals` {animal} | priority, queued after praise |
| `talkResult` right / wrong | `t('talk.right')` / `talkWrong(lang, kind, value)` — home: "The dog lives in the kennel! Good try!" | answer choice `kind, value` | interrupts |
| `levelDone` | (stars banner; `ui.stars`) — `t('great')` optional | — | queued |
| `sessionDone` | `t('session.done', {stars})` "The whole street is shining! 12 stars!" | `stars` | interrupts |
| tap on Gigi / the bubble | repeat `currentPrompt()` word for word | — | priority |
Legacy keys kept so nothing breaks: `surprise.shuffle/golden/pond`, `golden`, `reward.star`, `ui.tapDee` (= `ui.tapGigi`).

### 1.2 Speaking rules
1. **Feedback interrupts**: match, Talk right/wrong, session done, the chapter name cut whatever Gigi is saying.
2. **The prompt is protected**: `speakPrompt()` marks the instruction; until it is over, flip / mismatch / critter-tap
   lines queue instead of cutting it (`canInterrupt()`).
3. **Praise and hints queue**: peek, weather, cheer / great, walk, hint, idle are added to the queue (one speaking + ≤ 2
   waiting; the oldest non-priority line is dropped; non-priority lines older than 5 s are skipped).
4. Names only when useful: the same window name is not repeated within 3 s; tap names ≥ 0.9 s apart.
5. After 4 idle nudges Gigi stays quiet; 2 unanswered Talk re-asks → the answer glows; afterwards the game pauses.

### 1.3 What Gigi says per topic
| topic | flip | match | mismatch |
|---|---|---|---|
| colors (≤ 4: same thing) | A red umbrella! / Cái ô màu đỏ! | Two red umbrellas — a pair! / Hai cái ô màu đỏ — một đôi! | A red umbrella and a blue umbrella. / An umbrella and a kite. (same colour) |
| colors (5+: two things) | A red balloon! / Quả bóng bay màu đỏ! | A balloon and a car — both red! / Quả bóng bay và chiếc ô tô — cùng màu đỏ! | |
| shapes | A red heart! / Hình trái tim màu đỏ! | Two hearts! A pair! / Hai hình trái tim! Một đôi rồi! | A heart and a circle… |
| size | A big dog! · A little dog! / Con chó to! | A big dog and a little dog! A pair! | A big dog and a little cat… |
| count | One, two, three dots! (counted to 5) · Three! / Một, hai, ba chấm tròn! · Số ba! | Three and three dots! A match! · Three — one, two, three! A pair! | Three and five dots… |
| animals | A dog! · Hello, dog! / Con chó! · Con chó nè! | Two dogs! A pair! / Hai con chó! Một đôi rồi! | A dog and a cat. Let’s look again! |
| homes | A dog! · The kennel! / Con chó! · Nhà chó! | The dog lives in the kennel! / Con chó sống trong nhà chó! · Con chó về nhà chó rồi! | A dog and a nest. Where does the dog live? / Con chó và tổ chim. Con chó sống ở đâu nhỉ? |
| letters / lower | The letter B! (TTS "bee") / Chữ B! (TTS "chữ bờ") | Big letter B and small letter b! / Chữ B in hoa và chữ b thường! | |
| initial | A rabbit! · The letter R! / Mèo! · Chữ M! | Rabbit starts with the letter R! / Mèo bắt đầu bằng chữ M! | |
| add / sub | Two plus three! · Five! | Two plus three is five! A match! | |
| oddeven | Seven! · Seven dots! | Seven and seven dots! Seven is odd! / … Bảy là số lẻ! | |
A home window never names its animal (that is the puzzle). The English "a → an" rule never touches the letter A.
TTS turns "—" into a comma pause.

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.9, pitch 1.25** (a cheerful, slightly breathy calf: young and warm, a touch lower than Dee's 1.3
duckling; above ~1.3 iOS voices get squeaky, rate < 0.85 smears Vietnamese tones), `volume` = `Voice.setVolume()`.
Queue: one line + ≤ 2 waiting, oldest non-priority dropped, non-priority lines older than 5 s skipped; `interrupt`
flushes + cancels and speaks after 50–90 ms; `dropQueued()`; a watchdog ends lines iOS never ends; Chrome desktop
keep-alive; hidden page → stop. Spoken text = `Voice.spoken(lang, text)` = `I18N.speech` (letters, + − =, dashes) +
"Gigi" → "Gi Gi" (vi only).

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("Chữ B!"), the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).

## 4. Speech recognition (Talk time, optional)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; final match resolves at once, interim waits 450 ms; 7 s timeout. `not-allowed` turns `canListen()` off
for the session; `navigator.audioSession.type = 'play-and-record'` while listening, restored after. Matcher: exact
tokens > diacritic-free > number words as digits > edit distance on long words; `=word` forms match the whole utterance
only (en "to" → 2, vi "không" → 0); ties at the same position are ambiguous. Choices `{id, kind, value}` use `words()`;
`home` choices accept "dog house" / "nhà cún", `color` choices also "a red umbrella" / "cái ô màu đỏ", `dots` choices
"three dots" / "ba chấm tròn" and plain numbers.

## 5. iOS / Safari notes (Dee's findings, re-checked 2 Nov 2026, still current)
- Downloaded Enhanced/Premium voices still mostly missing from `getVoices()` (WebKit bug 290497); Samantha and Linh are
  built in. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- iOS 26 ignores the Settings voice preference for web speech: we always set `utterance.voice` by name.
- The first `speak()` must come from a gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`; lines queued before it are re-stamped (no "stale").
- Speech recognition works in Safari tabs but not in Home-Screen web apps → `canListen()` false when standalone.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- Coming back from the background can leave the synthesizer paused: `visibilitychange` cancels + resumes it.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`GW.Input`, unchanged from Dee)
- `attach(canvas, {toLogical, down, move, up, cancel})`: `down(x, y, ev)` fires **synchronously in `pointerdown`** with
  logical px numbers (the shutters swing open on touch-down); one active pointer, extra fingers ignored, a swallowed
  `pointerup` recovers on the next primary touch, `pointercancel` / `lostpointercapture` / blur / page hide → `cancel()`;
  targets `button, .screen, #hud, .no-game-input` ignored; touch + mouse fallback; a throwing handler is caught.
  Taps on Gigi or a critter are resolved by `world.pointerDown` (returns `'gigi'` / `'critter'`), not by input.js.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band, context menu, zoom/refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing; main uses 2 s).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]` (color, shape, size, animal, home, thing, parity), `NUM[xx]`, letters, `WORDS[xx]`,
`WORD_LIST[xx]`, `DOT[xx]`, a complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`;
`voice.js`: `LANG_TAG`, `PREFERRED`, `NAME_SPOKEN` if "Gigi" needs a spoken spelling. Run the unit test.
