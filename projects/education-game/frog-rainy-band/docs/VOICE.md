# Bop's Rainy Band — Voice, language and input

Files: `game/js/i18n.js` (`RB.I18N`), `game/js/voice.js` (`RB.Voice`), `game/js/input.js` (`RB.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 65 000 checks: every key in both languages with identical key sets **and
identical `{params}`**, every prompt key × every value, `p.listen` never says or shows the number, every name kind ×
value (name + spoken forms, digits, no-diacritic forms), `sayPlay` / `sayWrong` / `sayTap` / song lines exact and swept
over all 11 topics, **every round and Talk time the real `content.js` makes** (ages 3–7, both languages: 1 320 rounds,
≈ 17 700 lines), garbage events, never-negative wording, Vietnamese diacritics, matcher EN/VI, voice queue / interrupt with a
fake `speechSynthesis`, recognizer, tap input rules incl. two-hand hand-over, parent hold gate).
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Bop)
- **Bop** (vi **Bốp**) is a cheerful little aqua frog in a straw hat who leads the band. EN text says "Bop", VI text says
  "Bốp" (introduced as "ếch Bốp"); both are spoken as written, no substitution. Title "Bop’s Rainy Band" / "Ếch Bốp — Ban
  Nhạc Mưa"; logo lines "Bop’s" / "Rainy Band", "Ếch Bốp" / "Ban Nhạc Mưa".
- **Short and concrete**: ≤ 13 words per key (tested), the key word last ("Play the **red** drum!").
- **Reaction lines are tiny** (so the next prompt is heard): a right tap is the name plus one sound/praise word ("Red!
  Boom!", ≤ 6 words EN / 8 VI, tested); a wrong tap is "Boing! That’s the blue drum. Let’s find red!" (≤ 11 / 13 words).
- **Band vocabulary**: play / tap / drum / big drum / booms / band / song — vi **gõ / chạm / trống / trống to / tiếng trống /
  ban nhạc / bài hát**. Drum sounds **"Boom!"** / **"Bùm!"**, wobble **"Boing!"** / **"Tưng!"**.
- **Classifiers**: drums are "trống" ("trống màu đỏ", "trống hình ngôi sao", "trống số năm", "trống to"), animals always
  "con vịt", colours carry "màu", shapes "hình", letters "chữ". Count beats are "tiếng trống" ("ba tiếng trống"); taps on
  the big drum "cái" ("gõ ba cái").
- **Never negative.** A wrong member wobbles: Bop names what was tapped, then repeats the goal. Maths, sound and listen asks
  never give the answer away. The test bans no / not / wrong / bad / fail / incorrect / mistake / oops / fall / crash /
  broken and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã in every non-UI line and every generated line.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!".

### Garden animals (`animal` kind) and their sounds
| id | EN | VI | sound EN / VI | also accepted by the mic |
|---|---|---|---|---|
| duck | duck | con vịt | quack / cạp cạp | ducky, duckling · vịt, vịt con |
| cat | cat | con mèo | meow / meo meo | kitty, kitten · mèo, mèo con |
| dog | dog | con chó | woof / gâu gâu | doggy, puppy · chó, **con cún, cún** |
| cow | cow | con bò | moo / ò ò | calf · bò, bò sữa |
| sheep | sheep | con cừu | baa / be be | lamb · cừu, cừu con |
| hen | hen | con gà | cluck / cục tác | chicken, chick · gà, gà mái |
| bird | bird | con chim | tweet / chíp chíp | birdie · chim, chim sẻ |
| pig | pig | con heo | oink / ụt ịt | piggy, piglet · heo, **con lợn, lợn** (northern) |
Every sound word is different, so "Who says moo?" has exactly one answer. Every no-diacritic form ("con vit", "con lon")
is accepted; "con" alone and sound words ("moo", "gâu gâu") match no animal — except vi "meo meo", which matches the cat
(the Vietnamese name of the cat is its sound; harmless). TTS: "Baa" is sent as "Baaa" (a longer bleat).

## 1. API for main.js
`RB.I18N.t(lang, key, params, rng?)` · `name(lang, kind, value)` · `sound(lang, animal)` · `hasSound(animal)` ·
`words(lang, kind, value)` · `has(lang, key)` · `speech(lang, text)` · `setChild(name)` · `talkWrong(lang, kind, value)` ·
`phrase(lang, kind, value, item)` · `wordEntry(lang, id)`.
Name kinds: `color, shape, size, animal, number, dots, stars, letter, text, sum, diff, parity, word`.
Band helpers (never throw, never return '' or a raw `{x}`; `rng` optional):
- `sayPlay(lang, ev, rng)` — ev `{ nameKind, nameValue, item?, topic, promptKey, params, mode }`. For a finished **drum
  ask** pass `{ promptKey: 'p.drum', params: {n} }` (or `{ mode: 'drum', n }`) → "Three booms! Great drumming!"; a right
  **listen** answer (`p.listen`, number member) → "Yes! Three booms!" / "Đúng rồi! Ba tiếng trống!".
- `sayWrong(lang, ev, rng)` — ev `{ nameKind, nameValue, want:{kind, value}, item?, topic, promptKey, params, streak }`.
  Listen asks: "Boing! That’s two. Let’s count the booms again!" (never n). A member tapped during a drum ask: "…Let’s tap
  my big drum!".
- `sayTap(lang, ev, rng)` — just the name. `sayCount(lang, i)` = `t('count.' + i)` ("One!" … "Twelve!", beyond: the word).
- `saySongStart(lang, rng)`; `saySongEnd(lang, child?, rng)` — a `{child}` variant whenever a name is known
  (`child` argument, else `setChild`), otherwise a no-name variant.
- Aliases: `sayStack` / `sayFound` / `sayGo` / `sayCorrect` = `sayPlay`, `sayGrab` / `sayFlip` = `sayTap`, `sayMismatch` = `sayWrong`.
Main's `ev2()` adds `topic`, `promptKey`, `params` (and ideally `mode`) of the current ask; `item` (or `block`) of the
member lets content's `word` / `initial` be used.

| world event | line |
|---|---|
| `level` | `t('ui.chapter', {n}) + '. ' + t('topic.' + topic)`, then `t('weather.' + level)` (0 spring … 3 winter) |
| `round` (+ surprise) / `deal` | `t('deal')` "The band is here! Let’s make a song!" |
| `ask` | `t(promptKey, params)` — protected prompt |
| `beat {i}` (listen) / `drumTap {i}` (drum) | `sayCount(lang, i)` — short, queued, never interrupting the prompt |
| `play` | `sayPlay(lang, ev)`; when the drum ask's last tap lands: `sayPlay(lang, {promptKey:'p.drum', params:{n}})` |
| `wrong` | `sayWrong(lang, ev)`; after 2 misses `hint` → `t('hint')` (drum ask: `t('hint.drum')`) |
| `boom` (big drum outside a drum ask) | now and then `t('boom')` |
| `replayBeats` / `pokeBop` in a listen ask | `t('replay')` then the beats |
| `idle` | `t('idle') + ' ' + prompt` |
| `songStart` / `songEnd` | `saySongStart(lang)` / `saySongEnd(lang)` |
| `snail` / `snailTap` | `t('surprise.snail')` / `t('snail.tap')` |
| `shower` / `raindrop` | `t('surprise.shower')` / optional `t('raindrop')` once |
| `roundDone` | star chime; `t('great')` available |
| `clear` | optional `t('clear')` |
| `talk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone` | `t('party')`, `t('session.done', {stars})` |
| a hold / slide instead of a tap | optional `t('miss')` "Quick tap! Tap and let go!" (rate-limit) |
UI keys: `ui.title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
years, language, name, namePlaceholder, sound, music, volume, voice ("Bop’s voice" / "Giọng của Bốp"), mic, done, stars,
chapter {n}, allDone {stars}, welcome, micUnsupported, micDenied, voiceMissing, tapOrSay, listening ("Bop is listening…"),
tapBop, tapHint, skip, langName.en, langName.vi`. (The tower's `ui.tapLulu / tapPip / dragHint` are gone.)

### 1.1 Prompt keys and params (each has 3 wordings; a missing required param falls back to `p.any`)
| key | params | example EN / VI |
|---|---|---|
| `p.colors` | `{color}` | Play the red drum! · Bé ơi, gõ trống màu đỏ nhé! |
| `p.shapes` | `{shape}` | Play the drum with the star! · Bé ơi, gõ trống có hình ngôi sao nhé! |
| `p.size` | `{size}` | Play the big drum! · Bé ơi, gõ trống nhỏ nhé! |
| `p.animals` | `{animal}` | Let’s hear the cow! Tap it! · Con vịt đâu rồi? Bé chạm cho bạn ấy hát nhé! |
| `p.sound` | `{animal}` (→ `{sound}`) | Who says moo? Tap them! · Bạn nào kêu ụt ịt? Bé chạm nhé! (never names the animal) |
| `p.drum` | `{n}` (→ `{times}`) | Drum three times on my big drum! (1 → "one time") · Bé ơi, gõ trống to của Bốp ba cái nhé! |
| `p.listen` | `{n}` accepted, **never said** | Listen to my drum! How many booms? Tap that number! · Nghe trống của Bốp nhé! Mấy tiếng bùm? Bé chạm số đó nào! |
| `p.count` | `{n}` (dots) | Play the drum with 3 dots! · Bé gõ trống có 3 chấm nhé! |
| `p.letters` | `{letter}` | Play the letter B drum! · Bé ơi, gõ trống chữ B nhé! (TTS "chữ bờ") |
| `p.lower` | `{letter}` (capital) | Big letter B! Find its small letter! |
| `p.initial` | `{letter}` | Which one starts with the letter D? Tap it! · Bạn nào bắt đầu bằng chữ V? Bé chạm nhé! |
| `p.add` / `p.sub` | `{a, b}` (+ `op` '−') / `{text}` / `{expr}` | What is 2 + 3? Play the answer! |
| `p.oddeven` | `{parity}` | Find an odd number! · Bé ơi, tìm số chẵn nhé! |
Derived params: `{times}` = "three times" / "ba cái", `{booms}` = "three booms" / "ba tiếng trống", `{num}`, `{dotWord}`,
`{sound}`, `{expr}`, `{lower}`, `{word}`.

### 1.2 What Bop says on a right / wrong tap
| topic | play | wrong |
|---|---|---|
| colors | Red! Boom! / Màu đỏ! Bùm! | Boing! That’s the blue drum. Let’s find red! / Tưng! Trống màu xanh dương. Mình tìm màu đỏ nhé! |
| shapes | Star! Boom! / Hình trái tim! Bùm! | Boing! That’s the oval drum. Let’s find the star! |
| size | Big drum! Boom! / Trống nhỏ! Bùm! | Boing! That’s the small drum. Let’s find the big drum! / Tưng! Trống nhỏ. Mình tìm trống to nhé! |
| animals | Moo! The cow! / Ò ò! Con bò! | Boing! That’s the cat. Let’s find the dog! / Tưng! Con mèo. Mình tìm con chó nhé! |
| sound | Quack! It’s the duck! / Ụt ịt! Là con heo! | Boing! That’s the duck. Who says moo? |
| count (drum) | Three booms! Great drumming! / Ba tiếng trống! Bé gõ giỏi quá! | (a member tapped) …Let’s tap my big drum! |
| count (listen) | Yes! Four booms! / Đúng rồi! Bốn tiếng trống! | Boing! That’s two. Let’s count the booms again! |
| letters | Letter B! Boom! / Chữ B! Bùm! | Boing! That’s letter C. Let’s find letter B! |
| lower | Small b! Boom! | Boing! That’s small d. Find small b! |
| initial | D is for duck! / Chữ M, mèo! | Boing! P is for pig. Find letter D! / Tưng! Heo, chữ H. Tìm chữ V nhé! |
| add / sub | 2 + 3 is five! / 7 − 3 bằng bốn! | Boing! That’s six. What is 2 + 3? |
| oddeven | Seven is odd! | Boing! Four is even. Find an odd one! |
Song: `saySongStart` "Here’s your song!" / "Bài hát của bé đây!"; `saySongEnd(lang, 'Mai')` "What a song, Mai!" /
"Bài hát hay quá, bé Mai ơi!".

## 2. How voices are chosen
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.9, pitch 1.2** (`RB.Voice.RATE` / `PITCH`; Bop, a little frog: young and bright; above ≈ 1.3 iOS
voices turn robotic, rate < 0.85 smears Vietnamese tones), `volume` = `Voice.setVolume()` (the game's volume slider).
Queue: one line + ≤ 2 waiting, oldest non-priority dropped, non-priority lines older than 5 s skipped; `interrupt`
flushes + cancels and speaks after 50–90 ms; `dropQueued()`; a watchdog ends lines iOS never ends; Chrome desktop
keep-alive (pause/resume every 10 s: Chrome stops utterances after ~15 s); hidden page → stop. Spoken text =
`Voice.spoken(lang, text)` = `I18N.speech` (letters, "big/small B", + − =, "…" → pause, "D is for duck" → "dee is for
duck", "Baa" → "Baaa"). Every line is logged (`Voice.log`, `RB.debug.voiceLog`), also when muted; `onStart(display)`
fires with the display text (bubble + Bop's talk frames + music duck).
**Counting tip for main:** say `count.<i>` without `interrupt` and without `priority`, so a quick drummer gets the newest
numbers (the queue keeps ≤ 2), and the prompt guard still protects the instruction.

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**.
The screen shows the letter ("chữ B"), the voice says the phonics name. The mic also accepts alphabet names (bê, xê…).
`initial` words — the garden animals (their stickers are the pictures); content.js owns the live list (`RB.WORDS`, same as
i18n's default): en duck D, cat C, dog D, cow C, sheep S, hen H, bird B, pig P; vi vịt V, mèo M, bò B, cừu C, gà G, heo H
(chó / chim are left out: Vietnamese phonics teaches "ch" as its own sound). `name(lang, 'word', x)` works with any id
content uses (word, `id`, `sprite`, animal id, a word of the other language, or an `[{id, en, vi}]` list).

## 4. Speech recognition (Talk time, optional)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; final match resolves at once, interim waits 450 ms; 7 s timeout (also the watchdog against the iOS
hang below). `not-allowed` turns `canListen()` off for the session; `navigator.audioSession.type = 'play-and-record'`
while listening, restored after. Matcher: exact tokens > diacritic-free > number words as digits > edit distance on long
words; `=word` forms match the whole utterance only (en "to" → 2, vi "không" → 0); ties at the same position are ambiguous.

## 5. iOS / Safari notes (re-checked 5 Nov 2026)
- `speechSynthesis` works in Safari tabs and Home-Screen web apps on iOS 17 / 18 / 26; `webkitSpeechRecognition` works
  in Safari tabs (Siri dictation: Siri/Dictation must be on, usually needs a network) — optional, taps always work.
- iOS 26 ignores the voice the user picked in Settings for system speech (Apple forum regression report, thread 804648),
  and downloaded Enhanced/Premium voices are still mostly missing from `getVoices()` → we always set `utterance.voice` by
  name (Samantha / Linh are built in). `hasVoice('vi') === false` → show `ui.voiceMissing`.
- Reported WebKit hang: `SpeechRecognition.start()` after an HTML `<audio>` element played can stay "listening" without
  ever firing `onresult` / `onerror` / `onend`. We never use `<audio>` (all sound is WebAudio), create a fresh recognizer
  per `listen()`, and the 7 s timeout always resolves.
- The first `speak()` must come from a gesture: `unlock()` in the first `pointerup`/`touchend`/`click` speaks a silent
  `' '`; a line refused with `not-allowed` is kept and spoken on the next `unlock()`.
- After the app was in the background the synthesizer can be stuck paused: on `visibilitychange` back we `cancel()` +
  `resume()`. Speech recognition is off in Home-Screen web apps (`canListen()` false when standalone).
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS desktop UA detected via `MacIntel` + touch.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`RB.Input`) — built for TAPS
- `attach(canvas, {toLogical, down, move, up, cancel, hover?})` returns `detach()` with `detach.cancel()` and
  `detach.isActive()`. Every handler gets **numbers** `(x, y, ev)` in logical px. The world decides tap vs hold/slide
  (< 0.6 s, < 40 px); input guarantees **every touch = one `down` + one `up` (or `cancel`)**, in order.
- **No 300 ms delay**: the canvas has `touch-action: none`, `pointerdown` is `preventDefault`ed and `down` fires
  synchronously inside it (the drum squashes under the finger); the page has `touch-action: manipulation`; the touch
  fallback `preventDefault`s `touchend` (no ghost click).
- **Lifted outside the canvas**: pointer capture on the canvas, plus window listeners when capture is unavailable — the
  `up` arrives once, also over the HUD / bubble (tested). `lostpointercapture` right after `pointerup` is harmless; a
  capture lost while the finger is still down → `cancel()`.
- **Two-hand drumming (hand-over)**: one active pointer, but a new touch is never dropped. If a finger lands while
  another is down, the old one ends first — `up()` at its last point when it went down < `Input.TAP_MS` (600 ms) ago (its
  tap counts), `cancel()` when it was held longer (a resting thumb or palm) — then `down()` for the new finger; the old
  finger's later events are ignored. This also recovers from an iOS-swallowed `pointerup`.
- `pointercancel` (canvas or window) / window `blur` / page hide → `cancel()` once. An `up` whose point cannot be mapped →
  `cancel()`. **main should call `detach.cancel()` on resize / rotation / pause.**
- Targets `button, .screen, #hud, .no-game-input` are ignored on press; touch + mouse fallback; a throwing handler is caught.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band / pull-to-refresh (except inside `.scroll`
  and range inputs), context menu, zoom/refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]`, `SOUNDS[xx]`, `NUM[xx]`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, `DOT`, `STAR`, `BOOM`,
`TIMES`, a complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`,
`PREFERRED`. Run the unit test.
