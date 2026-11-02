# Bim's Rainbow Rocket — Voice, language and input

Files: `game/js/i18n.js` (`RR.I18N`), `game/js/voice.js` (`RR.Voice`), `game/js/input.js` (`RR.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 27 000 checks: every key in both languages, every prompt key × every
value with all params filled, every name kind × value, `sayGo` / `sayWrong` / `sayCollect` for ~1 300 synthetic hops of
all 11 topics and for every hop the real `content.js` makes, garbage events, never-negative wording, sky-friend matcher
EN/VI with and without diacritics, voice queue with a fake `speechSynthesis`, recognizer, tap + drag input rules).
The engine (voice queue, iOS fixes, matcher, kid-proofing) comes from Kitten's Balloon Farm → Dee's Forest Memory;
the wording is new.

## 0. Wording principles (Bim)
- **Bim** is a cheerful baby elephant in pilot goggles and a mint scarf, flying a little rocket. Written **and spoken**
  "Bim" in both languages (a Vietnamese voice reads it correctly), so there is **no** spoken-name substitution
  (Dee's "Dee" → "Đi" rule is gone; tested: no line's spoken text contains "Dee"/"Đi").
- **Short and concrete**: ≤ 13 words per line (tested), the key word last ("Fly to the **red** cloud!").
- **Flight vocabulary**: cloud / planet (night) / fly / blast off / rocket / wagon — vi **đám mây / hành tinh / bay /
  phóng / tên lửa / xe mây**. Count tokens are **stars** — vi **ngôi sao**.
- **Never negative.** A wrong island: Bim names what was tapped, then repeats the goal — "That’s blue. Let’s find red!"
  / "Đây là màu xanh dương nè. Mình tìm màu đỏ nhé!". Maths never gives the answer away ("That’s six. What is 2 + 3?").
  The test bans no / not / wrong / bad / fail / incorrect / mistake / oops and sai / dở / tệ / hỏng / không đúng /
  chưa đúng / trật in every non-UI line and every generated line.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!"; animals with their classifier
  ("con bò"); colours always carry "màu", shapes carry "hình". Variant lists have 5–8 entries and a `{child}` + no-name form.

### Sky friends (`animal` kind) and their sounds
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
`RR.I18N.sound(lang, animal)` returns the sound ('' for an unknown animal). The vi cow sound "ùm bò" contains the word
"bò" — that is how Vietnamese children say it, so `p.sound` for the cow is an easier question in Vietnamese.

## 1. API for main.js (exact event fields)
`RR.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `sound(lang, animal)` · `words(lang, kind, value)` ·
`speech(lang, text)` · `setChild(name)`.
Name kinds: `color shape size animal number stars letter text sum diff parity word` (`I18N.NAME_KINDS`; `dots` = alias of `stars`).

| world event | line | fields read |
|---|---|---|
| `level` | `t('ui.chapter', {n: level+1}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)` | — |
| `ask` | `t(lang, promptKey, params)`; at night (stage 3) use `'p.colors.night'` instead of `'p.colors'` | `promptKey, params` |
| `go` | `I18N.sayGo(lang, {topic, nameKind, nameValue, token, promptKey, params})` | the hop's prompt is needed for sound / maths / initial lines |
| `wrong` | `I18N.sayWrong(lang, {topic, nameKind, nameValue, token, want, promptKey, params})` | `want` = `{kind, value}` of the right token (or derived from `params`) |
| `collect` | `I18N.sayCollect(lang, {topic, token})` (optional, keep it short / only when Bim is quiet) | `token` |
| `hint` / `idle` | `t('hint')` / `t('idle') + ' ' + prompt` | — |
| `tapPad` | `t('tapPad')` | — |
| `roundDone` | `t('great')` (queued) | — |
| `boostReady` / `boost` | `t('boost')` / `t('boostGo')` | — |
| `round` with `surprise` | `t('surprise.' + surprise)` (`drift` / `shooting`) | — |
| `shootingTap` | `t('shooting.tap')` | — |
| `talk` / `talkAsk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)` | `talk.animals {animal}`, `talk.sound {animal}` |
| `talkResult` right / wrong | `t('talk.right')` / `I18N.talkWrong(lang, kind, value)` | answer choice `kind, value` |
| `sessionDone` | `t('session.done', {stars})` | `stars` |
Back-compat (Dee API): `sayFlip/sayTap` (name of a token: "Red!", "The cow!"), `sayMatch/sayCorrect` = `sayGo`,
`sayMismatch` = `sayWrong`, `sayReward` = `sayCollect`, `cardPhrase(lang, token)`; plus `phrase(lang, kind, value, token)`
and `sayCount(lang, n, need)`. Every function copes with missing / junk fields (tested) and never returns '' or a raw `{x}`.

### 1.1 Prompt keys and params (each has 3 wordings; a missing param falls back to `p.any`)
| key | params | example EN / VI |
|---|---|---|
| `p.colors` / `p.colors.night` | `{color}` | Fly to the red cloud! / planet! · Bé ơi, bay tới đám mây màu đỏ nhé! |
| `p.shapes` | `{shape}` | Find the star! · Bé ơi, tìm hình ngôi sao nhé! |
| `p.countUp` | `{n}` | Let’s count up! Fly to 2! · Now 3! · Giờ tới số 3! |
| `p.count` | `{n}` | Find 3 stars! Fly there! (1 → "1 star") · Bé ơi, tìm 3 ngôi sao nhé! |
| `p.animals` | `{animal}` | Let’s pick up the cow! · Bé ơi, mình đón con bò nhé! |
| `p.sound` | `{animal}` (→ `{sound}`) | Who says moo? Fly to them! · Con gì kêu ụt ịt? Bé bay tới đó nhé! |
| `p.size` | `{size, animal}` | Fly to the big cow! / little pig · Bé ơi, bay tới con bò nhỏ nhé! |
| `p.letters` | `{letter}` | Fly to the letter B! · Bé ơi, bay tới chữ B nhé! (TTS "chữ bờ") |
| `p.lower` | `{letter}` (capital; `{lower}` derived) | Big letter B! Find its small letter! |
| `p.initial` | `{letter}` (fly to the animal whose word starts with it) | Who starts with the letter F? Fly there! |
| `p.add` / `p.sub` | `{a, b}` (+ `op` '−'), or `{text:'2 + 3'}`, or `{expr}` | What is 2 + 3? Fly to the answer! |
| `p.oddeven` | `{parity}` | Fly to an odd number! · Bé ơi, bay tới số lẻ nhé! |

### 1.2 What Bim says on a flight
| topic | go | wrong | collect |
|---|---|---|---|
| colors | Red! Blast off! / Màu đỏ! Bay nào! | That’s blue. Let’s find red! | Got it! / Vào xe mây nào! |
| shapes | Star! Let’s fly! | That’s a red circle. Let’s find the star! | Got it! |
| size | The big cow! Blast off! | That’s the little cow. Let’s find the big cow! | Hello, cow! Moo! |
| count | Three stars! · Two! (count-up) | That’s two stars. Let’s find three stars! | One, two, three stars! (counted ≤ 5, "Eight stars!") |
| animals | The cow! Blast off! | That’s the cow. Let’s find the duck! | Hello, cow! Moo! / Chào con bò! Ùm bò! |
| sound | The cow says moo! Blast off! | That’s the cat. Who says moo? | Hello, cow! Moo! |
| letters | Letter B! Blast off! | That’s the letter C. Let’s find the letter B! | Got it! |
| lower | Big B, small b! Blast off! (TTS "big bee, small bee") | That’s small letter f. Big letter B! Let’s find its small letter! | |
| initial | Duck starts with the letter D! | Frog starts with the letter F. Who starts with the letter D? | Hello, duck! Quack! |
| add / sub | 2 + 3 is five! Blast off! | That’s six. What is 2 + 3? | Ten! Into the wagon! |
| oddeven | Seven is odd! Blast off! | That’s four, an even number. Let’s find an odd number! | Seven! Got it! |
The English "a → an" rule never touches the letter A. No capital after "…" ("Three, two, one… whoosh!").

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.9, pitch 1.2** (a baby elephant: young and warm, a touch lower than Dee's duckling 1.3; rate
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
list (`RR.WORDS`); i18n has the same default and reads `token.word` / `token.initial` when present.

## 4. Speech recognition (Talk time, optional)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; final match resolves at once, interim waits 450 ms; 7 s timeout. `not-allowed` turns `canListen()` off
for the session; `navigator.audioSession.type = 'play-and-record'` while listening, restored after. Matcher: exact
tokens > diacritic-free > number words as digits > edit distance on long words; `=word` forms match the whole utterance
only (en "to" → 2, vi "không" → 0); ties at the same position are ambiguous. Choices `{id, kind, value}` use `words()`;
`stars` choices accept "three stars" / "ba ngôi sao" and plain numbers.

## 5. iOS / Safari notes (re-checked 2 Nov 2026, unchanged since Kitten's Balloon Farm)
- Downloaded Enhanced/Premium voices still mostly missing from `getVoices()` (WebKit bug 290497); Samantha and Linh are
  built in. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- iOS 26 ignores the Settings voice preference for web speech: we always set `utterance.voice` by name.
- The first `speak()` must come from a gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`.
- Speech recognition works in Safari tabs but not in Home-Screen web apps → `canListen()` false when standalone.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`RR.Input`)
- `attach(canvas, {toLogical, down, move, up, cancel, hover?})`: every handler gets **numbers** `(x, y, ev)` in logical
  px. `down` fires **synchronously in `pointerdown`** (instant response); every move of the same finger fires `move`
  (the flight line dragged from the rocket), lifting fires `up` at the release point. One active pointer: a second
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
