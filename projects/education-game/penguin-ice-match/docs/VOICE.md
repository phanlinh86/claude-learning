# Dee's Forest Memory — Voice, language and input

Files: `game/js/i18n.js` (`IM.I18N`), `game/js/voice.js` (`IM.Voice`), `game/js/input.js` (`IM.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 46 000 checks: every key in both languages, every name kind × value,
`sayFlip` / `sayMatch` / `sayMismatch` for ~3 000 synthetic pairs and every card/pair the real `content.js` makes,
garbage events, never-negative wording, the "Dee" → "Đi" rule, forest-animal matcher EN/VI with and without
diacritics, voice queue with a fake `speechSynthesis`, recognizer, input rules).
The engine (voice queue, iOS fixes, matcher, kid-proofing) comes from Kitten's Balloon Farm; the wording is new.

## 0. Wording principles (Dee)
- **Dee** is a playful little duckling in a leaf cape, by a pond in a fairy forest. Written "Dee" in both languages.
  The Vietnamese voice would read "Dee" as "đê"/"đi-i", so `Voice.spoken()` replaces the whole word `Dee` with **"Đi"**
  in the text sent to TTS — only in Vietnamese, never in the bubble, the log or `onStart/onEnd`.
  Because spoken "Đi đây" means "I'm leaving", VI lines say **"Mình là vịt Dee"**, **"Vịt Dee đang chờ bé nè!"**, never
  "Dee đây" (tested).
- **Short and concrete**: ≤ 12 words per line (tested; card lines ≤ 14 rendered), the key word last.
- **Memory vocabulary**: card / pair / match / flip / look again — vi **thẻ / cặp / ghép / lật / nhìn lại**. The dots
  on count cards are **acorns** — vi **hạt dẻ** (what Vietnamese children call an acorn; "quả sồi" is rarely heard).
- **Never negative.** Mismatch: "A fox and an owl. Let’s look again!" / "Con cáo và con cú. Mình nhìn lại nhé!".
  The test bans no / not / wrong / bad / fail / incorrect / mistake / oops and sai / dở / tệ / hỏng / không đúng /
  chưa đúng / trật in every non-UI line.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!"; animals with their classifier.
  Colours always carry "màu", shapes carry "hình". Variant lists have 5–8 entries and a `{child}` + a no-name form.

### Forest animals (`animal` kind)
| id | EN | VI | also accepted by the mic |
|---|---|---|---|
| fox | fox | con cáo | foxy, fox cub · cáo, cáo con |
| deer | deer | con hươu | fawn, baby deer · hươu, **con nai, nai**, hươu con, nai con |
| hedgehog | hedgehog | con nhím | hedgie · nhím |
| squirrel | squirrel | con sóc | chipmunk · sóc |
| bunny | bunny | con thỏ | rabbit · thỏ, thỏ con |
| frog | frog | con ếch | froggy, toad · ếch, con nhái |
| bear | bear | con gấu | teddy (bear), bear cub · gấu, gấu con, gấu bông |
| owl | owl | con cú | owlet · cú, **cú mèo** |
| mouse | mouse | con chuột | mice · chuột, chuột nhắt |
EN plurals for match lines: foxes, deer, hedgehogs, squirrels, bunnies, frogs, bears, owls, mice.
Every no-diacritic form ("con cao", "cu meo") is accepted; "con" alone matches nothing.

## 1. API for main.js (exact event fields)
`IM.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `words(lang, kind, value)` · `speech(lang, text)`.
Name kinds: `color shape size animal number dots letter text sum diff parity word` (`I18N.NAME_KINDS`).

| world event | line | fields read |
|---|---|---|
| `level` | `t('ui.chapter', {n: level+1}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)` | — |
| `round` | `t(lang, e.promptKey, e.params)` — prompts need no params; unknown `p.x` → `p.any` | `promptKey` |
| `peek` / `hide` | `t('peek')` / `t('hide')` | — |
| `flip`, `tap` | `I18N.sayFlip(lang, e)` | `nameKind, nameValue, face{kind,value,color,shape,sprite,n,text,scale,parity,dots}, size, topic?` |
| `match` | `I18N.sayMatch(lang, e)` | `nameKind, nameValue, parity, word, animal, topic?` + both cards: `nameKindA/nameValueA/faceA/sizeA` + `…B` (or `cardA/cardB`, `nameA/nameB {kind,value}`, `cards[]`) |
| `mismatch` | `I18N.sayMismatch(lang, e)` | the two cards as above; without them → a gentle `wrong[]` line |
| `reward` (optional, only when Dee is quiet) | `I18N.sayReward(lang, e)` | `kind` |
| `hint` / `idle` | `t('hint')` / `t('idle') + ' ' + prompt` | — |
| `roundDone` | `t('great')` (queued) | — |
| `talk` / `talkAsk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)` | `talk.animals` needs `{animal}` ("Where is the fox?"; also takes `{sound: id}`) |
| `talkResult` wrong | `I18N.talkWrong(lang, kind, value)` | answer choice `kind, value` |
| `sessionDone` | `t('session.done', {stars})` | `stars` |
Also `I18N.cardPhrase(lang, card)` ("an owl" / "bốn hạt dẻ"), `sayCount(lang, n, need)`, aliases `sayTap = sayFlip`,
`sayCorrect → sayFlip`, `sayWrong → sayMismatch`. `topic` on flip events is optional: it only turns a capital in a
`lower` round into "Big letter B!" (otherwise "The letter B!"); `size` rounds work from `size` / `face.scale`.
Every function copes with missing / junk fields (tested) and never returns '' or a raw `{x}`.

### 1.1 What Dee says
| topic | flip | match | mismatch |
|---|---|---|---|
| colors | Red! · A red butterfly! / Màu đỏ! · Bướm màu đỏ! | Red and red! A pair! / Màu đỏ và màu đỏ! Một cặp rồi! | Red and blue. Let’s look again! |
| shapes | A red heart! / Hình trái tim màu đỏ! | Two hearts! A pair! / Hai hình trái tim! Một cặp rồi! | A heart and a circle… |
| size | A big fox! · A little fox! / Con cáo to! | A big fox and a little fox! A pair! / Con cáo to và con cáo nhỏ! | A big owl and a big frog… |
| count | One, two, three acorns! (counted up to 5, "Seven acorns!" above) · Three! / Một, hai, ba hạt dẻ! · Số ba! | Three and three acorns! A match! / Số ba và ba hạt dẻ! Đúng một cặp! | Three and five acorns… |
| animals | A fox! · Hello, fox! / Con cáo! · Con cáo nè! | Two foxes! A pair! / Hai con cáo! Một cặp rồi! | A fox and an owl. Let’s look again! |
| letters | The letter B! (TTS "bee") / Chữ B! (TTS "chữ bờ") | Letter B and letter B! A pair! | Letter E and letter R… |
| lower | Small letter b! / Chữ b viết thường! | Big letter B and small letter b! / Chữ B in hoa và chữ b thường! | |
| initial | A deer! · The letter D! / Con hươu! · Chữ H! | Deer starts with the letter D! A pair! / Hươu bắt đầu bằng chữ H! | A deer and letter H… |
| add / sub | Two plus three! · Five! / Hai cộng ba! · Số năm! | Two plus three is five! A match! / Hai cộng ba bằng năm! Đúng rồi! | Ten minus two and seven… |
| oddeven | Seven! · Seven acorns! | Seven and seven acorns! Seven is odd! / … Bảy là số lẻ! | Twelve and eleven… |
The English "a → an" rule never touches the letter A ("Big letter A and small letter a").

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.92, pitch 1.3** (a duckling: bright and young; 1.3 is the top before iOS voices go squeaky; rate
< 0.85 smears Vietnamese tones), `volume` = `Voice.setVolume()` (follows the game's volume slider).
Queue: one line + ≤ 2 waiting, oldest non-priority dropped, non-priority lines older than 5 s skipped; `interrupt`
flushes + cancels and speaks after 50–90 ms; `dropQueued()`; a watchdog ends lines iOS never ends; Chrome desktop
keep-alive; hidden page → stop. Spoken text = `Voice.spoken(lang, text)` = `I18N.speech` (letters, + − =) + "Dee" → "Đi" (vi).

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("Chữ B!"), the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).
vi `initial` words: cáo C, hươu H, sóc S, ếch Ê, gấu G, cú C — nhím (nh), thỏ (th), chuột (ch) are left out because
Vietnamese phonics teaches nh / th / ch as their own sounds (content.js owns the live list; i18n has the same default).

## 4. Speech recognition (Talk time, optional)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; final match resolves at once, interim waits 450 ms; 7 s timeout. `not-allowed` turns `canListen()` off
for the session; `navigator.audioSession.type = 'play-and-record'` while listening, restored after. Matcher: exact
tokens > diacritic-free > number words as digits > edit distance on long words; `=word` forms match the whole utterance
only (en "to" → 2, vi "không" → 0); ties at the same position are ambiguous. Choices `{id, kind, value}` use `words()`;
`dots` choices accept "three acorns" / "ba hạt dẻ" and plain numbers.

## 5. iOS / Safari notes (re-checked 2 Nov 2026, unchanged since Kitten's Balloon Farm)
- Downloaded Enhanced/Premium voices still mostly missing from `getVoices()` (WebKit bug 290497); Samantha and Linh are
  built in. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- iOS 26 ignores the Settings voice preference for web speech: we always set `utterance.voice` by name.
- The first `speak()` must come from a gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`.
- Speech recognition works in Safari tabs but not in Home-Screen web apps → `canListen()` false when standalone.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`IM.Input`, unchanged)
- `attach(canvas, {toLogical, down, move, up, cancel})`: `down(x, y, ev)` fires **synchronously in `pointerdown`** with
  logical px numbers (the card flips on touch-down); one active pointer, extra fingers ignored, a swallowed `pointerup`
  recovers on the next primary touch, `pointercancel`/blur/page hide → `cancel()`; targets `button, .screen, #hud,
  .no-game-input` ignored; touch + mouse fallback; a throwing handler is caught.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band, context menu, zoom/refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]`, `NUM[xx]`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, `ACORN[xx]`, a complete `STR[xx]`
(identical key set — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`, `NAME_SPOKEN` if the name needs
a spoken spelling. Run the unit test.
