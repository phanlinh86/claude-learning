# Tuk's Ice Match — Voice, language and input

Files: `game/js/i18n.js` (`IM.I18N`), `game/js/voice.js` (`IM.Voice`), `game/js/input.js` (`IM.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 49 000 checks: every key in both languages, every name kind × value
including `home`, `sayFlip` / `sayMatch` / `sayMismatch` for ~3 000 synthetic pairs and every block/pair the real
`content.js` makes, garbage events, never-negative wording, the "Tuk" → "Túc" rule, polar-animal and home matcher EN/VI
with and without diacritics, voice queue with a fake `speechSynthesis`, recognizer, tap-or-rub input rules).
The engine (voice queue, iOS fixes, matcher, kid-proofing) comes from Dee's Forest Memory; the wording is new.

## 0. Wording principles (Tuk)
- **Tuk** is a round little penguin chick in a knitted hat, on a frozen lake. Written "Tuk" in both languages.
  A Vietnamese voice spells "Tuk" or cuts it short, so `Voice.spoken()` replaces the whole word `Tuk` with **"Túc"** in
  the text sent to TTS — only in Vietnamese, never in the bubble, the log or `onStart/onEnd` (tested; no line is ever
  *written* "Túc"). VI lines call him **"cánh cụt Tuk"** ("Mình là cánh cụt Tuk", "Cánh cụt Tuk đang chờ bé nè!").
- **Short and concrete**: ≤ 12 words per line (tested; block lines ≤ 14 rendered, two-block lines ≤ 15), key word last.
- **Ice vocabulary**: ice block / frost / crack / pair / match — vi **khối băng / sương giá / băng vỡ / cặp / ghép**.
  Reveal by tap or rub ("Tap or rub two blocks!", "Bé xoa một khối băng nào!"). The dots on count blocks are **fish** —
  vi **con cá** with the classifier ("Một, hai, ba con cá!"); also accepted by the mic: "ba cá", "three fishes".
- **Never negative.** Mismatch: "A seal and a snowy owl. Let’s look again!" / "Con hải cẩu và con cú tuyết. Mình nhìn
  lại nhé!". The test bans no / not / wrong / bad / fail / incorrect / mistake / oops and sai / dở / tệ / hỏng /
  không đúng / chưa đúng / trật in every non-UI line.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!"; animals with their classifier
  (con … / chim …). Colours carry "màu", shapes "hình". Variant lists have 5–8 entries and a `{child}` + a no-name form.
- No leftover Dee wording (duck, forest, cards/thẻ, butterflies, lanterns, acorns, seasons, lily pads) — tested.

### Polar animals (`animal` kind) — DESIGN §6
| id | EN | VI | also accepted by the mic |
|---|---|---|---|
| bear | polar bear | con gấu Bắc Cực | bear, white bear, bear cub · gấu, gấu trắng, gấu bắc cực |
| seal | seal | con hải cẩu | seal pup, baby seal · hải cẩu, chó biển |
| fox | arctic fox | con cáo tuyết | fox, white fox, snow fox · cáo, cáo trắng, cáo bắc cực |
| owl | snowy owl | con cú tuyết | owl, snow owl, owlet · cú, cú mèo, cú trắng |
| whale | whale | con cá voi | baby whale, blue whale · cá voi |
| puffin | puffin | chim hải âu cổ rụt | puffin bird · hải âu, chim hải âu, hải âu cổ rụt, puffin |
| penguin | penguin | chim cánh cụt | baby penguin, penguin chick · cánh cụt, chim cụt |
| hare | arctic hare | con thỏ tuyết | hare, bunny, rabbit · thỏ, thỏ trắng |
| walrus | walrus | con hải mã | walrus calf · hải mã |
EN plurals: polar bears, seals, arctic foxes, snowy owls, whales, puffins, penguins, arctic hares, walruses.
Short VI names for two-block lines (keep them ≤ 15 words): gấu Bắc Cực, hải cẩu, cáo tuyết, cú tuyết, cá voi, hải âu,
cánh cụt, thỏ tuyết, hải mã; mismatch phrases use "chim hải âu" for the puffin.
Every no-diacritic form is accepted; "con", "chim", "hải", "tuyết" alone are ambiguous → no match (tested).
`initial` words (default `IM.WORDS`, content.js may replace it): en bear B, seal S, fox F, owl O, whale W, puffin P,
penguin P, hare H, walrus W (the short word, so "Bear starts with B", never "polar bear"); vi gấu G, cáo C, cú C,
cá voi C, hải cẩu H, hải mã H — thỏ (th) and chim … (ch) are left out (Vietnamese phonics teaches th / ch as one sound).

### Homes (`home` kind, new) — `IM.HOMES` bear→den, seal→floe, fox→burrow, owl→nest, whale→sea, puffin→cliff, penguin→pebbles
| id | EN (phrase) | "lives …" | VI | "sống …" | also accepted |
|---|---|---|---|---|---|
| den | snow den (a) | in the snow den | hang tuyết | trong hang tuyết | den, snow cave, cave · hang băng, động tuyết |
| floe | ice floe (an) | on the ice floe | tảng băng trôi | trên tảng băng trôi | floe, ice, iceberg · tảng băng, băng trôi, băng |
| burrow | burrow (a) | in the burrow | hang đất | trong hang đất | hole, fox hole · hang cáo, lỗ |
| nest | nest (a) | in the nest | tổ chim | trong tổ chim | twig nest, bird nest · tổ, cái tổ |
| sea | the sea | in the sea | biển | dưới biển | sea, ocean, water, waves · nước biển, sóng, đại dương |
| cliff | cliff (a) | on the cliff | vách đá | trên vách đá | rock, cliffs · vách núi, đá, núi đá |
| pebbles | pebble nest (a) | in the pebble nest | tổ sỏi | trong tổ sỏi | pebbles, stones · sỏi, đá sỏi |
"hang" alone stays ambiguous (den / burrow); "tổ sỏi" beats "tổ", "đá sỏi" beats "đá" (longer match wins, tested).

## 1. API for main.js (exact event fields)
`IM.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `words(lang, kind, value)` · `speech(lang, text)` ·
`homeOf(animal)` · `animalOfHome(home)` · `HOMES` (default table; `IM.HOMES` from content.js wins).
Name kinds: `color shape size animal number dots letter text sum diff parity word home` (`I18N.NAME_KINDS`).

| world event | line | fields read |
|---|---|---|
| `level` | `t('ui.chapter', {n: level+1}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)` | — |
| `round` | `t(lang, e.promptKey, e.params)` — `p.homes` new; unknown `p.x` → `p.any` | `promptKey` |
| `round.surprise` | `t('surprise.' + e.surprise)` — `slide / aurora / floes` (old `shuffle / golden / pond` = same lines) | — |
| `golden` | `t('golden')` ("Wow! You found the golden pair!") | — |
| `peek` / `hide` | `t('peek')` ("Look inside the ice!") / `t('hide')` ("Brrr, the frost is back!") | — |
| `flip` (also `via:'rub'`), `tap` | `I18N.sayFlip(lang, e)` — a rub reveal is named exactly like a tap | `nameKind, nameValue, face{…}, size, topic?, word?` |
| `match` | `I18N.sayMatch(lang, e)` — homes: "The seal lives on the ice floe!" | `nameKind, nameValue, home?, animal?, parity, word, topic?` + both blocks `nameKindA/nameValueA/faceA/sizeA` + `…B` |
| `mismatch` | `I18N.sayMismatch(lang, e)` — animal + other home: "A seal and a nest! Let’s find the seal’s home." | the two blocks as above |
| `land` / `reward` (only when Tuk is quiet) | `t('reward.' + kind)` or `I18N.sayReward(lang, e)` — kinds `fish sculpture fishes animal star home` (old `butterfly lantern acorns` still answer) | `kind` |
| `homeArrive` (optional) | `I18N.sayHome(lang, e)` ("The seal is home!") | `home`, `animal?` |
| `hint` / `idle` | `t('hint')` / `t('idle') + ' ' + prompt` | — |
| `roundDone` | `t('great')` (queued) | — |
| `talk` / `talkAsk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)` | `talk.homes` needs `{animal}` ("Where does the seal live?"); choices are `{kind:'home', value}` pictures |
| `talkResult` wrong | `I18N.talkWrong(lang, kind, value)` — home: "It lives on the ice floe! Good try!" | answer choice `kind, value` |
| `sessionDone` | `t('session.done', {stars})` ("What a rainbow party!") | `stars` |
Also `I18N.cardPhrase(lang, block)` ("an ice floe" / "ba con cá"), `sayCount(lang, n, need)`, aliases `sayTap = sayFlip`,
`sayCorrect → sayFlip`, `sayWrong → sayMismatch`. `topic` on flip events is optional: it turns a capital in a `lower`
round into "Big letter B!", makes an `initial` animal say its word ("A bear!"), and makes a `homes` match work from the
pair name only. Every function copes with missing / junk fields (tested) and never returns '' or a raw `{x}`.
New params: `{fish}` (alias `{acorns}`), `{at}` (from `{home}` or the animal's home), `{home}` is auto-named.
Kept for main.js/render.js: `ui.tapDee` (= `ui.tapTuk`), `surprise.shuffle/golden/pond`, `reward.butterfly/lantern/acorns`.

### 1.1 What Tuk says
| topic | flip | match | mismatch |
|---|---|---|---|
| colors | Red! · A red fish! / Màu đỏ! · Cá màu đỏ! | Red and red! A pair! / Hai chú cá màu đỏ! Một cặp rồi! | Red and blue. Let’s look again! |
| shapes | A red heart! / Hình trái tim màu đỏ! | Two hearts! A pair! / Hai hình trái tim! Một cặp rồi! | A heart and a circle… |
| size | A big seal! · A little arctic fox! / Con gấu Bắc Cực nhỏ! | A big seal and a little seal! / Hải âu to và hải âu nhỏ! | A big seal and a little snowy owl… |
| count | One, two, three fish! (counted up to 5) · Three! / Một, hai, ba con cá! · Số ba! | Three and three fish! A match! / Số ba và ba con cá! Đúng một cặp! | Three and five fish… |
| animals | A seal! · Hello, arctic hare! / Con hải cẩu! · Chim cánh cụt nè! | Two seals! A pair! / Hai con hải cẩu! Một cặp rồi! | A seal and a snowy owl… |
| **homes** | A seal! · An ice floe! · The sea! / Con hải cẩu! · Tảng băng trôi! | The seal lives on the ice floe! / Con hải cẩu sống trên tảng băng trôi! | A seal and a nest! Let’s find the seal’s home. / Con hải cẩu và tổ chim! Tìm nhà cho hải cẩu nào. |
| letters / lower / initial / add / sub / oddeven | as Dee ("Bear starts with the letter B!", "Seven and seven fish! Seven is odd!") | | |
Weather: 0 "Sunny morning on the ice!" / "Buổi sáng nắng đẹp trên băng!", 1 "Whoosh, a snowy breeze!" / "Vù vù, gió thổi
tuyết bay!", 2 "Pitter-patter, a soft rain!" / "Lộp độp, mưa nhẹ rơi rồi!", 3 "Look, a rainbow!" / "Nhìn kìa, cầu vồng!".
Logo: "Tuk’s" / "Ice Match" — VI "Cánh Cụt Tuk" / "Lật Băng".

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.92, pitch 1.3** (a chick: bright and young; 1.3 is the top before iOS voices go squeaky; rate
< 0.85 smears Vietnamese tones), `volume` = `Voice.setVolume()` (follows the game's volume slider).
Queue: one line + ≤ 2 waiting, oldest non-priority dropped, non-priority lines older than 5 s skipped; `interrupt`
flushes + cancels and speaks after 50–90 ms; `dropQueued()`; a watchdog ends lines iOS never ends; Chrome desktop
keep-alive; hidden page → stop. Spoken text = `Voice.spoken(lang, text)` = `I18N.speech` (letters, + − =, "Brrr" →
"Brr") + "Tuk" → "Túc" (vi).

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
`dots` accept "three fish" / "ba con cá" / "ba cá" and plain numbers; `home` choices (Talk time for homes) accept the
names and forms in the table above ("tảng băng trôi", "ocean").

## 5. iOS / Safari notes (re-checked 11 Nov 2026)
- **Voices:** downloaded Enhanced/Premium voices are still mostly missing from `getVoices()` in Safari since iOS 18
  (WebKit bug 290497, Apple forum 764438 — no fix announced); the built-in **Samantha** and **Linh** (vi-VN) are listed.
  `hasVoice('vi') === false` → show `ui.voiceMissing`.
- **iOS 26 ignores the Settings voice choice** for speech synthesis (a reported AVSpeechSynthesisVoice regression, forum
  804648): we always set `utterance.voice` by name, so the game picks Linh/Samantha itself.
- The first `speak()` must come from a gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`.
- **Speech recognition:** `webkitSpeechRecognition` works in Safari tabs (it uses Siri dictation, so Siri/dictation must be
  on); it still fails in Home-Screen web apps ("service not available", WebKit bug 225298, forum 748048). **New in iOS 26:
  every site added to the Home Screen opens as a web app by default**, so more parents will run the game standalone →
  `canListen()` is false there (standalone check) and the mic button hides; tapping the pictures always works.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`IM.Input`) — tap OR rub
- `attach(canvas, {toLogical, down, move, up, cancel, moveStep?})`: every handler gets **two numbers `(x, y)` in logical
  px + the DOM event** (never a point object — the `p.x` pitfall). `down` fires **synchronously in `pointerdown`** (the
  frost cracks on touch-down). While that finger is down **every pointermove is delivered** to `move(x, y)`; to make a
  rub reliable it uses `getCoalescedEvents()` when present and fills jumps with points ≤ `moveStep` px apart (default 32;
  blocks are ≥ 104 px, so a fast swipe can never skip a block; `moveStep: 0` = one move per event). A new touch starts a
  new path. One active pointer, extra fingers ignored, a swallowed `pointerup` recovers on the next primary touch,
  `pointercancel`/blur/page hide → `cancel()`; targets `button, .screen, #hud, .no-game-input` ignored; touch + mouse
  fallback (touchmove/mousemove use the same path); a throwing handler is caught.
- main.js wiring (already in place): `down: (x, y) => onDown({x, y})` → `world.pointerDown(x, y)`,
  `move: (x, y) => world.pointerMove(x, y)`, `up: (x, y) => world.pointerUp(x, y)`; `cancel` must END the rub too
  (`world.pointerUp()` when `world.cancelDrag` is missing). `world.pointerDown` must mark the finger down even when it
  hits no block, so a rub that starts on the ice between blocks still works.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band, context menu, zoom/refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]` (incl. `home`), `HOME_AT[xx]`, `NUM[xx]`, letters, `WORDS[xx]`, `WORD_LIST[xx]`,
`FISH[xx]`, a complete `STR[xx]` (identical key set — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`,
`PREFERRED`, `NAME_SPOKEN` if the name needs a spoken spelling. Run the unit test.

Sources (iOS notes): https://bugs.webkit.org/show_bug.cgi?id=290497 · https://developer.apple.com/forums/thread/764438 ·
https://developer.apple.com/forums/thread/804648 · https://bugs.webkit.org/show_bug.cgi?id=225298 ·
https://developer.apple.com/forums/thread/748048 · https://www.macrumors.com/2025/06/18/safari-changes-on-ios-26/ ·
https://heise.de/-10749652
