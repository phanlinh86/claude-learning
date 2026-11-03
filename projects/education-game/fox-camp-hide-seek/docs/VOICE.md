# Pip's Camp Hide & Seek — Voice, language and input

Files: `game/js/i18n.js` (`FC.I18N`), `game/js/voice.js` (`FC.Voice`), `game/js/input.js` (`FC.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 17 000 checks: every key in both languages with identical key sets, every
prompt key × every value with all params filled, every name kind × value, `sayFound` / `sayWrong` for ~1 600 synthetic
clues of all 11 topics with and without a friend, every round the real `content.js` makes (once it makes hide-and-seek
rounds), garbage events, never-negative wording, animal matcher EN/VI with and without diacritics, voice queue /
interrupt with a fake `speechSynthesis`, recognizer, tap + drag input rules, parent hold gate).
The engine (voice queue, iOS fixes, matcher, kid-proofing) is unchanged from Bim's Rainbow Rocket; the wording is new.

## 0. Wording principles (Pip)
- **Pip** is a cheerful baby fox in a teal camping bandana. Written **and spoken** "Pip" in both languages (vi voices
  read it "píp"), so there is no spoken-name substitution. Vietnamese introduces him as "cáo Pip".
- **Short and concrete**: ≤ 13 words per key (tested), the key word last ("Where is the friend in the **red** hat?").
- **Hide-and-seek vocabulary**: hide / peek / found you / hiding place / hat / flag / sign / campfire — vi **trốn tìm /
  chỗ trốn / tìm thấy rồi / cái mũ / lá cờ / tấm biển / lửa trại**. Count tokens are **stars** — vi **ngôi sao**.
- **Classifiers**: "cái mũ màu đỏ" (worn: "con heo đội mũ màu xanh dương"), "lá cờ hình ngôi sao" (held: "con vịt cầm lá
  cờ hình tròn"), animals always "con bò", colours carry "màu", shapes carry "hình".
- **Never negative.** A wrong peek: the friend pops up giggling and Pip names what popped out, then repeats the goal —
  "Hee hee! That’s the pig in the blue hat. Let’s find the red hat!" / "Hì hì! Đây là con heo đội mũ màu xanh dương nè.
  Mình tìm cái mũ màu đỏ nhé!". Maths never gives the answer away. The test bans no / not / wrong / bad / fail /
  incorrect / mistake / oops and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật in every non-UI line and every
  generated line (that is why the count says "Three! Ready? Here I come!", not "ready or not").
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!", "Ú òa!" (peekaboo).

### Animal friends (`animal` kind) and their sounds
| id | EN | VI | sound EN / VI | also accepted by the mic |
|---|---|---|---|---|
| cat | cat | con mèo | meow / meo meo | kitty, kitten · mèo, mèo con |
| dog | dog | con chó | woof / gâu gâu | doggy, puppy · chó, **cún**, cún con |
| cow | cow | con bò | moo / ùm bò | calf · bò, bò sữa, con bê |
| pig | pig | con heo | oink / ụt ịt | piggy, piglet · heo, **lợn, con lợn** |
| sheep | sheep | con cừu | baa / be be | lamb · cừu, cừu non |
| duck | duck | con vịt | quack / cạp cạp | ducky, duckling · vịt, vịt con |
| lion | lion | con sư tử | roar / gừm gừm | lion cub · sư tử |
| frog | frog | con ếch | ribbit / ộp ộp | froggy, toad · ếch, con nhái |
Every no-diacritic form ("con lon", "su tu") is accepted; "con" alone and sound words ("moo") match nothing.

## 1. API for main.js (exact event fields)
`FC.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `sound(lang, animal)` · `words(lang, kind, value)` ·
`has(lang, key)` · `speech(lang, text)` · `setChild(name)` · `talkWrong(lang, kind, value)`.
Hide-and-seek helpers (all `(lang, ev, rng?)`, never throw, never return '' or a raw `{x}`):
- `sayFound(lang, ev)` — ev `{ topic, nameKind, nameValue, clue, animal | friend, promptKey, params, n }`
- `sayWrong(lang, ev)` — ev `{ topic, nameKind, nameValue, clue, animal | friend, want:{kind, value}, promptKey, params, streak }`
- `sayEmpty(lang, ev)` · `cluePhrase(lang, ev)` → "the pig in the blue hat" · `sayCount(lang, n, need)` · `phrase(…)`
- Back-compat: `sayGo` = `sayFound`, `sayCollect({topic, token})` → `sayFound`, `sayMatch/sayCorrect`, `sayMismatch`, `sayReward`, `sayFlip/sayTap`.
**main should add `clue` (the friend's clue object) and `animal` (the friend's animal) to `found` / `wrong` events** —
the world event only carries ids. Without them the line still works ("Found you! The red hat!"), but cannot name the
friend. `topic`, `promptKey`, `params` come from the current ask (`ev2()` in main).

| world event | line |
|---|---|
| `level` | `t('ui.chapter', {n}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)` (0 spring … 3 winter) |
| `round` (+ `surprise`) | `t('surprise.swap')` / `t('surprise.critter')` |
| `gather` | `t('gather')` |
| `countNum {n}` | `t('countNum.' + n)` (1 "One…", 2 "Two…", 3 "Three! Here I come!") |
| `ask` | `t(promptKey, params)` (`p.colors.night` exists for a dark/winter-night wording) |
| `found` | `sayFound(lang, ev)` |
| `wrong` | `sayWrong(lang, ev)`; after 2 misses `hint` follows |
| `empty` | `sayEmpty(lang, ev)` |
| `pokePip` | repeat the prompt (`ui.tapPip` is the bubble hint) |
| `hint` / `idle` | `t('hint')` / `t('idle') + ' ' + prompt`; a tap on grass may use `t('miss')` |
| `critterTap` | `t('critter.tap')` |
| `roundDone` | `t('party')` then `t('great')` |
| `talk` / `talkAsk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone` | `t('session.done', {stars})` |

### 1.1 Prompt keys and params (each has 3 wordings; a missing param falls back to `p.any`)
| key | params | example EN / VI |
|---|---|---|
| `p.colors` | `{color}` | Where is the friend in the red hat? · Bé ơi, bạn đội cái mũ màu đỏ đâu rồi nhỉ? |
| `p.shapes` | `{shape}` | Who has the star flag? · Bé ơi, ai cầm lá cờ hình ngôi sao nhỉ? |
| `p.countUp` | `{n}` | Let’s count! Find 2! · Giờ bé tìm số 3 nhé! |
| `p.count` | `{n}` | Who has 3 stars? (1 → "1 star") · Bé ơi, ai có 3 ngôi sao nhỉ? |
| `p.animals` | `{animal}` | Where is the cow hiding? · Bé ơi, con bò trốn ở đâu nhỉ? |
| `p.sound` | `{animal}` (→ `{sound}`) | Who says moo? Find them! · Con gì kêu ụt ịt? Bé tìm bạn ấy nhé! |
| `p.size` | `{size, animal}` | Find the big cow! / little pig · Bé ơi, tìm con bò nhỏ nhé! |
| `p.letters` | `{letter}` | Find the letter B! · Bé ơi, tìm chữ B nhé! (TTS "chữ bờ") |
| `p.lower` | `{letter}` (capital) | Big letter B! Find its small letter! |
| `p.initial` | `{letter}` | Who starts with the letter F? Find them! |
| `p.add` / `p.sub` | `{a, b}` (+ `op` '−') / `{text}` / `{expr}` | What is 2 + 3? Find the answer! |
| `p.oddeven` | `{parity}` | Find an odd number! · Bé ơi, tìm số chẵn nhé! |

### 1.2 What Pip says when a friend pops out
| topic | found | wrong |
|---|---|---|
| colors (hat) | Found you! The cow in the red hat! / Tìm thấy rồi! Con bò đội mũ màu đỏ! | Hee hee! That’s the pig in the blue hat. Let’s find the red hat! |
| shapes (flag) | Found you! The duck with the star flag! | Hee hee! That’s the duck with the circle flag. Let’s find the star flag! |
| count (sign) | One, two, three stars! Found you! (counted ≤ 5; "Eight stars!") | Hee hee! That’s the cat with two stars. Let’s find three stars! |
| animals (ears) | Found you, cow! Moo! / Tìm thấy con bò rồi! Ùm bò! | Hee hee! That’s the cat. Let’s find the cow! |
| sound | The cow says moo! Found you! | Hee hee! That’s the cat. Who says moo? |
| size | Found you, big cow! Moo! / Tìm thấy con heo nhỏ rồi! Ụt ịt! | Hee hee! That’s the little cow. Let’s find the big cow! |
| letters | Found you! The letter B! | Hee hee! That’s the letter C. Let’s find the letter B! |
| lower | Big B, small b! Found you! | Hee hee! That’s small letter d. Big letter B! Let’s find its small letter! |
| initial | Frog starts with the letter F! Found you! | Hee hee! Dog starts with the letter D. Who starts with the letter F? |
| add / sub | 2 + 3 is five! Found you! | Hee hee! That’s six. What is 2 + 3? |
| oddeven | Seven is odd! Found you! | Hee hee! That’s four, an even number. Let’s find an odd number! |
Other lines: `empty` "Nobody there now, just a butterfly!", `party` "Everybody found! Campfire dance!", `weather.0..3`
"Hello, spring!" · "Summer camp time!" · "Look at the autumn leaves!" · "Brr, it’s snowing!", `surprise.swap` "Whoa,
they switched!", `surprise.critter`, `critter.tap`, `session.done {stars}`.

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.9, pitch 1.2** (Pip, a baby fox: young and bright; above ≈ 1.3 iOS voices turn robotic, rate
< 0.85 smears Vietnamese tones), `volume` = `Voice.setVolume()` (follows the game's volume slider).
Queue: one line + ≤ 2 waiting, oldest non-priority dropped, non-priority lines older than 5 s skipped; `interrupt`
flushes + cancels and speaks after 50–90 ms; `dropQueued()`; a watchdog ends lines iOS never ends; Chrome desktop
keep-alive; hidden page → stop. Spoken text = `Voice.spoken(lang, text)` = `I18N.speech` (letters, "big/small B",
+ − =, "…" → pause).

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("chữ B"), the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).
`initial` words — en: cat C, dog D, cow C, pig P, sheep S, duck D, lion L, frog F; vi: mèo M, bò B, heo H, cừu C,
vịt V, sư tử S, ếch Ê (chó is left out: Vietnamese phonics teaches "ch" as its own sound). content.js owns the live
list (`FC.WORDS`); i18n has the same default and reads `token.word` / `token.initial` when present.

## 4. Speech recognition (Talk time, optional)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; final match resolves at once, interim waits 450 ms; 7 s timeout. `not-allowed` turns `canListen()` off
for the session; `navigator.audioSession.type = 'play-and-record'` while listening, restored after. Matcher: exact
tokens > diacritic-free > number words as digits > edit distance on long words; `=word` forms match the whole utterance
only (en "to" → 2, vi "không" → 0); ties at the same position are ambiguous. Choices `{id, kind, value}` use `words()`;
`stars` choices accept "three stars" / "ba ngôi sao" and plain numbers.

## 5. iOS / Safari notes (re-checked 3 Nov 2026 for iOS 17 / 18 / 26 Safari)
- `speechSynthesis` works in Safari tabs and Home-Screen web apps on iOS 17, 18 and 26; `webkitSpeechRecognition`
  exists since iOS 14.5 and works in Safari tabs (it uses Siri dictation, so Siri/Dictation must be on; it needs a
  network connection on most devices — we treat it as optional and always offer taps).
- Downloaded Enhanced/Premium voices still mostly missing from `getVoices()` (WebKit bug 290497); Samantha and Linh are
  built in. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- iOS 26 ignores the Settings voice preference for web speech: we always set `utterance.voice` by name.
- The first `speak()` must come from a gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`.
- Speech recognition works in Safari tabs but not in Home-Screen web apps → `canListen()` false when standalone.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`FC.Input`)
- `attach(canvas, {toLogical, down, move, up, cancel, hover?})`: every handler gets **numbers** `(x, y, ev)` in logical
  px. `down` fires **synchronously in `pointerdown`** (instant response); every move of the same finger fires `move`
  (a finger sliding off a hiding place: the world turns a long slide into no tap), lifting fires `up` at the release point. One active pointer: a second
  finger never steals a drag; a swallowed `pointerup` recovers on the next primary touch.
- `pointercancel` (canvas or window) / `lostpointercapture` / window `blur` / page hide → `cancel()` **once**, and later
  moves/ups of that finger are ignored. An `up` whose point cannot be mapped becomes `cancel()`.
- If pointer capture is unavailable, moves/ups of the active finger over other elements (the HUD lies over the
  canvas) still arrive through window listeners — each event handled once (tested).
- Targets `button, .screen, #hud, .no-game-input` are ignored on press; touch + mouse fallback; a throwing handler is caught.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band, context menu, zoom/refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]`, `SOUNDS[xx]`, `NUM[xx]`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, `STAR[xx]`, a complete
`STR[xx]` (identical key set — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`. Run the unit test.
