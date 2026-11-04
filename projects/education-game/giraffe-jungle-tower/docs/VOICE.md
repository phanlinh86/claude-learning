# Lulu's Jungle Tower — Voice, language and input

Files: `game/js/i18n.js` (`JT.I18N`), `game/js/voice.js` (`JT.Voice`), `game/js/input.js` (`JT.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 53 000 checks: every key in both languages with identical key sets,
every prompt key × every value with all params filled, every name kind × value (name + spoken forms, digits,
no-diacritic forms), `sayStack` / `sayWrong` / `sayTap` exact lines and a sweep over all 11 topics, **every round and
Talk time the real `content.js` makes** (ages 3–7, both languages: 1 320 rounds, ≈ 19 000 lines), garbage events,
never-negative wording, Vietnamese diacritics present, matcher EN/VI, voice queue / interrupt with a fake
`speechSynthesis`, recognizer, drag input rules, parent hold gate).
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from Pip's Camp; the wording is new.

## 0. Wording principles (Lulu)
- **Lulu** is a cheerful baby giraffe in a seafoam neckerchief. Written **and spoken** "Lulu" in both languages (vi
  voices read it "lu lu"), no spoken-name substitution. Vietnamese introduces her as "hươu Lulu".
- **Short and concrete**: ≤ 13 words per key (tested), the key word last ("Stack the **red** block!").
- **Reaction lines are tiny** (playtest P1-1: long praise / wrong lines cut off the next prompt). A landing is the name
  plus one sound or praise word ("Red! Clonk!", ≤ 6 words EN / 8 VI, tested); a bounce is "Boing! That’s blue. Find
  red!" (≤ 10 / 13 words). The tower height is not spoken per block: the finished tower is counted once by
  `sayTowerDone`.
- **Tower vocabulary**: stack / block / tower / on top / bananas — vi **xếp / khối / tháp / lên trên / nải chuối**.
  Count tokens on blocks are **dots** — vi **chấm** ("khối có ba chấm"); stars are only the score ("ngôi sao").
- **Classifiers**: blocks are "khối" ("khối màu đỏ", "khối hình ngôi sao", "khối số năm", "khối con khỉ", "khối to"),
  animals always "con khỉ", colours carry "màu", shapes carry "hình", letters "chữ".
- **Never negative.** A wrong block bounces off: Lulu says the bounce word, names what bounced, then repeats the goal —
  "Boing! That’s blue. Find red!" / "Tưng! Khối màu xanh dương. Tìm màu đỏ nhé!". Maths and sound asks never give the answer away. The test bans no / not / wrong / bad / fail / incorrect /
  mistake / oops / fall / crash / broken and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã in every
  non-UI line and every generated line (the tower never falls, and Lulu never says it might).
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!", bounce word **"Tưng!"**,
  landing knock **"Cộp!"** (EN "Boing!", "Clonk!").

### Jungle animals (`animal` kind) and their sounds
| id | EN | VI | sound EN / VI | also accepted by the mic |
|---|---|---|---|---|
| monkey | monkey | con khỉ | ooh-ooh / khẹc khẹc | chimp · khỉ, khỉ con, chú khỉ |
| elephant | elephant | con voi | toot / tò te (its trumpet, "kèn tò te") | ellie · voi, voi con |
| tiger | tiger | con hổ | grr / gừ gừ | tiger cub · hổ, **con cọp, cọp** |
| parrot | parrot | con vẹt | squawk / két két | polly, bird · vẹt, **chim vẹt**, con két |
| lion | lion | con sư tử | roar / gào gào | lion cub · sư tử |
| frog | frog | con ếch | ribbit / ộp ộp | froggy, toad · ếch, con nhái |
| snake | snake | con rắn | hiss / xì xì | snakey · rắn |
| hippo | hippo | con hà mã | — (never asked by sound) | hippopotamus · hà mã |
VI tiger "gừ gừ" (growl) and lion "gào gào" (roar) are deliberately different words (two "gừm"-like sounds in one
choice set would be unfair). Every no-diacritic form ("con cop", "su tu", "ha ma") is accepted; "con" alone, "cub"
alone and sound words ("roar", "gào gào") match nothing. `p.sound` for the hippo falls back to `p.animals`.

## 1. API for main.js (exact event fields)
`JT.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `sound(lang, animal)` · `hasSound(animal)` ·
`words(lang, kind, value)` · `has(lang, key)` · `speech(lang, text)` · `setChild(name)` · `talkWrong(lang, kind, value)` ·
`phrase(lang, kind, value, block)` · `wordEntry(lang, id)`.
Name kinds: `color, shape, size, animal, number, dots, stars, letter, text, sum, diff, parity, word`.
Tower helpers (all `(lang, ev, rng?)`, never throw, never return '' or a raw `{x}`):
- `sayStack(lang, ev)` — ev `{ nameKind, nameValue, block?, topic, promptKey, params }` (`n` accepted, not spoken)
- `sayTowerDone(lang, n)` — "One, two, three, four! We reached the bananas!" / "Một, hai, ba, bốn! Tới chùm chuối rồi!"
  (`n` or `{n}`; no n → `t('towerDone')`). Use it with interrupt **instead of** the last praise + `towerDone` +
  per-block `count` lines (playtest P1-1 (c)(d)).
- `sayWrong(lang, ev)` — ev `{ nameKind, nameValue, want:{kind, value}, block?, topic, promptKey, params, streak }`
- `sayTap(lang, ev)` — ev `{ nameKind, nameValue, block? }` (also for `grab`)
- `sayCount(lang, i)` = `t('count.' + i)` ("One!" … "Twelve!")
- Aliases: `sayFound` / `sayGo` / `sayCorrect` = `sayStack`, `sayGrab` / `sayFlip` = `sayTap`, `sayMismatch` = `sayWrong`.
World events already carry `nameKind` / `nameValue` (DESIGN §5.2); main adds `topic`, `promptKey`, `params` of the
current ask (`ev2()`), and optionally `block` (the piece's block) — with it, content's `word` / `initial` are used.

| world event | line |
|---|---|
| `level` | `t('ui.chapter', {n}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)` (0 morning … 3 night) |
| `round` (+ `surprise`) | `t('surprise.breeze')` / `t('surprise.butterfly')` |
| `deal` (round start) | `t('deal')` "Let’s build up to the bananas!" (only on the first deal of a round) |
| `ask` | `t(promptKey, params)` — protected prompt |
| `grab` / `tapPiece` | `sayTap(lang, ev)` (short, never interrupts the prompt) |
| `miss` (released outside the drop zone) | `t('miss')` "Lift it up over the tower and let go!" (rate-limit it) |
| `stillDrag` (a drag held still 6 s, the world sent the block home) | `t('stillDrag')` "Let go over the tower!" / "Bé thả khối lên trên tháp nhé!" |
| `stack` | `sayStack(lang, ev)` — on the LAST block skip it and say `sayTowerDone(lang, n)` |
| `wrong` | `sayWrong(lang, ev)`; after 2 misses `hint` follows → `t('hint')` |
| `idle` | `t('idle') + ' ' + prompt` |
| `pokeLulu` | repeat the prompt (`ui.tapLulu` is the bubble hint) |
| `gust` | `t('gust')` "Whoa, a breeze! I’ve got it!" |
| `butterfly` / `butterflyTap` | `t('butterfly.land')` / `t('butterfly.tap')` |
| `towerDone {n}` | `sayTowerDone(lang, n)` (interrupt); `count.<i>` keys stay for a silent bubble or a slow count |
| `bloom` / `monkey` | optional `t('bloom')` / `t('monkey')` only when Lulu is quiet |
| `roundDone` | star chime only (the count line already praised); `t('great')` is available |
| `clearBlock` | optional `t('clear')` once |
| `talk` / `talkAsk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone` | `t('party')`, `t('session.done', {stars})` |
UI keys: every `ui.*` of the fox game (`ui.volume`, `ui.chapter`, `ui.welcome`, `ui.listening`, `ui.tapOrSay`,
`ui.micDenied`, `ui.micUnsupported`, `ui.holdForParents`, `ui.voice` "Lulu’s voice"…), plus `ui.tapLulu`, `ui.dragHint`;
`ui.tapPip` stays as an alias of `ui.tapLulu` (`ui.tapBim` removed). Logo `ui.logo1` / `ui.logo2`: "Lulu’s" / "Jungle Tower",
vi "Hươu Lulu" / "Xếp Tháp"; `ui.title`, `ui.tagline`.

### 1.1 Prompt keys and params (each has 3 wordings; a missing param falls back to `p.any`)
| key | params | example EN / VI |
|---|---|---|
| `p.colors` | `{color}` | Stack the red block! · Bé ơi, xếp khối màu đỏ nhé! |
| `p.shapes` | `{shape}` | Put the star block on top! · Bé ơi, đặt khối hình ngôi sao lên trên nhé! |
| `p.countUp` | `{n}` | Count up! Find number 2! · Đếm lên nào! Bé tìm số 3 nhé! (every wording says count) |
| `p.count` | `{n}` | Find the block with 3 dots! (1 → "1 dot") · Bé tìm khối có 3 chấm nhé! |
| `p.animals` | `{animal}` | Stack the monkey block! · Bé ơi, xếp khối con khỉ nhé! |
| `p.sound` | `{animal}` (→ `{sound}`) | Who says roar? Stack that block! · Con gì kêu ộp ộp? Bé xếp khối đó nhé! |
| `p.size` | `{size}` | Stack the big block! · Bé ơi, xếp khối nhỏ nhé! |
| `p.letters` | `{letter}` | Stack the letter B! · Bé ơi, xếp chữ B nhé! (TTS "chữ bờ") |
| `p.lower` | `{letter}` (capital) | Big letter B! Find its small letter! |
| `p.initial` | `{letter}` | Which one starts with the letter T? Stack it! |
| `p.add` / `p.sub` | `{a, b}` (+ `op` '−') / `{text}` / `{expr}` | What is 2 + 3? Stack the answer! |
| `p.oddeven` | `{parity}` | Find an odd number! · Bé ơi, tìm số chẵn nhé! |

### 1.2 What Lulu says when a block lands / bounces (short on purpose)
| topic | stack | wrong |
|---|---|---|
| colors | Red! Clonk! / Màu đỏ! Cộp! | Boing! That’s blue. Find red! / Tưng! Khối màu xanh dương. Tìm màu đỏ nhé! |
| shapes | Star! Clonk! / Hình ngôi sao! Cộp! | Boing! That’s an oval. Find the star! |
| count (dots) | Three dots! Clonk! / Ba chấm! Cộp! | Boing! That’s two dots. Find three dots! / Tưng! Hai chấm. Tìm ba chấm nhé! |
| count-up | Three! Clonk! / Số ba! Cộp! | Boing! That’s three. Find number two! |
| animals | Monkey! Ooh-ooh! / Con khỉ! Khẹc khẹc! | Boing! That’s the frog. Find the monkey! / Tưng! Con ếch. Tìm con khỉ nhé! |
| sound | Roar! The lion! / Gào gào! Là con sư tử! | Boing! That’s the frog. Who says roar? |
| size | Big block! Clonk! / Khối nhỏ! Cộp! | Boing! That’s the small one. Find the big one! / Tưng! Khối nhỏ. Tìm khối to nhé! |
| letters | Letter B! Clonk! / Chữ B! Cộp! | Boing! That’s letter C. Find letter B! |
| lower | Small b! Clonk! / Chữ b thường! Cộp! | Boing! That’s small d. Find small b! |
| initial | T is for tiger! / Chữ R, rắn! | Boing! S is for snake. Find letter T! / Tưng! Rắn, chữ R. Tìm chữ H nhé! |
| add / sub | 2 + 3 is five! / 2 + 3 bằng năm! | Boing! That’s six. What is 2 + 3? |
| oddeven | Seven is odd! / Tám là số chẵn! | Boing! Four is even. Find an odd one! |
Tower done: `sayTowerDone(lang, 4)` → "One, two, three, four! We reached the bananas!" / "Một, hai, ba, bốn! Tới chùm
chuối rồi!". In the age-7 odd/even chapter the sum asks (`p.add`) get the sum wording, not the parity one.
Talk time with small letters (age 6 `lower`): the choices are capitals, so `talkWrong` says "It is the letter B!"; a
lowercase answer would say "It is small letter b!" / "Là chữ b thường đó!" (`talk.wrong.small`).

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.9, pitch 1.2** (`JT.Voice.RATE` / `PITCH`; Lulu, a baby giraffe: young and bright; above ≈ 1.3 iOS
voices turn robotic, rate < 0.85 smears Vietnamese tones), `volume` = `Voice.setVolume()` (the game's volume slider).
Queue: one line + ≤ 2 waiting, oldest non-priority dropped, non-priority lines older than 5 s skipped; `interrupt`
flushes + cancels and speaks after 50–90 ms; `dropQueued()`; a watchdog ends lines iOS never ends; Chrome desktop
keep-alive; hidden page → stop. Spoken text = `Voice.spoken(lang, text)` = `I18N.speech` (letters, "big/small B",
+ − =, "…" → pause, "grr" → "grrr", "ooh-ooh" → "ooh ooh", "T is for tiger" → "tee is for tiger"). Every line is logged (`Voice.log`, `JT.debug.voiceLog`),
also when muted.

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("chữ B"), the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).
`initial` words — content.js owns the live list (`JT.WORDS`, jungle animals): en monkey M, elephant E, tiger T, parrot P,
lion L, frog F, snake S, hippo H; vi voi V, hổ H, vẹt V, sư tử S, ếch Ê, rắn R, hà mã H (khỉ is left out: Vietnamese
phonics teaches "kh" as its own sound). i18n has the same default and `name(lang, 'word', x)` works with **any** id
content uses: a word, an `id`, a `sprite`, an animal id, a word from the other language (mapped through the shared id),
or an `[{id, en, vi}]` list; an unknown id is shown readable ("banana_bunch" → "banana bunch").

## 4. Speech recognition (Talk time, optional)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; final match resolves at once, interim waits 450 ms; 7 s timeout. `not-allowed` turns `canListen()` off
for the session; `navigator.audioSession.type = 'play-and-record'` while listening, restored after. Matcher: exact
tokens > diacritic-free > number words as digits > edit distance on long words; `=word` forms match the whole utterance
only (en "to" → 2, vi "không" → 0); ties at the same position are ambiguous. Choices `{id, kind, value}` use `words()`;
`dots` choices accept "three dots" / "ba chấm" and plain numbers.

## 5. iOS / Safari notes (re-checked 4 Nov 2026 for iOS 17 / 18 / 26 Safari)
- `speechSynthesis` works in Safari tabs and Home-Screen web apps on iOS 17, 18 and 26; `webkitSpeechRecognition`
  exists since iOS 14.5 and works in Safari tabs (it uses Siri dictation, so Siri/Dictation must be on; it needs a
  network connection on most devices — we treat it as optional and always offer taps).
- Downloaded Enhanced/Premium voices are still mostly missing from `getVoices()` (WebKit bug 290497); Samantha and Linh
  are built in. `hasVoice('vi') === false` → show `ui.voiceMissing`.
- iOS 26 ignores the Settings voice preference for web speech: we always set `utterance.voice` by name.
- The first `speak()` must come from a gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`; a line
  refused with `not-allowed` is kept and spoken on the next `unlock()`. A `pointerdown` that starts a DRAG is not enough
  on every iOS version — call `unlock()` on `pointerup`/`touchend` (main's first-gesture handler) as before.
- After the app was in the background the synthesizer can be stuck paused: on `visibilitychange` back we `cancel()` +
  `resume()`.
- Speech recognition works in Safari tabs but not in Home-Screen web apps → `canListen()` false when standalone.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`JT.Input`) — built for dragging
- `attach(canvas, {toLogical, down, move, up, cancel, hover?})` returns `detach()` with **`detach.cancel()`** and
  **`detach.isActive()`**. Every handler gets **numbers** `(x, y, ev)` in logical px.
- `down` fires **synchronously in `pointerdown`** (the block lifts at once); **every** `pointermove` of the same finger
  fires `move` synchronously — no throttling or rAF batching (tested with 120 moves), so the spring-follow and the
  velocity the world measures for the drop / pendulum tilt see each point (60 Hz, 120 Hz on ProMotion). Coalesced
  sub-frame points are not replayed (same world time → zero dt → velocity spikes); `ev.timeStamp` is passed along.
- Pointer capture on the canvas: a drag that crosses the HUD, the speech bubble or leaves the canvas keeps flowing;
  without capture the window listeners deliver the active finger's moves/ups exactly once (tested).
- One active pointer: a second finger never steals a MOVING drag; a swallowed `pointerup` recovers on the next primary
  touch. **Still drag (playtest P1-2):** when the active finger moved < 20 px for 1.5 s (`Input.STILL_PX` /
  `STILL_MS`, e.g. an iPad thumb resting on a block), a new touch, even a second finger, takes over: `cancel()` for the
  old drag (block goes home), then `down()` for the new finger; the old finger's later moves/ups are ignored (tested).
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
