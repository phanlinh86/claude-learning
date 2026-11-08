# Bun's Dino Dig — Voice, language and input

Files: `game/js/i18n.js` (`DD.I18N`), `game/js/voice.js` (`DD.Voice`), `game/js/input.js` (`DD.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 21 000 checks, self-contained): every key in both languages with identical
key sets **and identical `{params}`**, every `ui.*` key that `index.html` / `ui.js` / `main.js` use, 3 wordings per
instruction, Vietnamese lines carry diacritics, every prompt × colour / shape / size × kind × animal / n 1–12 (EN plurals),
every name kind × value (DESIGN §6 names), `thingPhrase` for every thing kind, no `màu màu`, no unfilled `{param}`, no
"a orange", a negative-word ban, no paint / sea / Nini words left, `words()` (digits + no-diacritic forms) matched back by
the matcher, exact `sayFound / sayWrong / sayHatch / sayCountDone` lines plus a sweep of every thing × topic, every dig
Talk choice kind (`choiceWords`, `talkWrong`, spoken answer → right choice), garbage events, speech text, the tap input
layer (fake DOM), parent hold gate, voice queue / interrupt / unlock / volume with a fake `speechSynthesis`, recognizer.
**When the dig `content.js` exists** (it does) the test renders every `promptKey` / Talk key + params, the found line of
every target mound and the wrong line of every other mound that `makeRound` / `makeTalk` produce for ages 3–7 in EN + VI.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Bun)
- **Bun** is a cheerful round bunny explorer in a khaki hat. EN "Bun"; VI lines "Bun", titles **"Thỏ Bun"**.
  Title "Bun’s Dino Dig" / "Thỏ Bun Đào Kho Báu"; logo lines "Bun’s" / "Dino Dig", "Thỏ Bun" / "Đào Kho Báu".
- **TTS of "Bun" — decision: no rewrite.** English voices read /bʌn/. "Bun" is also a valid Vietnamese syllable (and a very
  common Vietnamese nickname for little kids), so Linh reads it "bun" (level tone, like bún without the tone) — it sounds
  like a name, not a spelled-out word. (Nini needed "Ni Ni" because the Latin "Nini" was clipped; "Bun" does not.)
  `speech()` keeps "Bun" as written in both languages (tested).
- **Dig vocabulary**: find / dig up / Let’s dig! / Hooray! — vi **tìm / đào / đào … lên / Hoan hô!**. Sand mound = "đống cát".
- **Things with classifiers** (DESIGN §6): egg "quả trứng", stone "hòn đá" (+ shape: "hòn đá hình tam giác", "hòn đá hình
  ngôi sao"), bone "khúc xương", toys "con vịt / con mèo / con chó / con bò / con heo / con ếch / con sư tử / con voi",
  tablet "tấm đá" (named by its text: "chữ B", "số năm"), baby dino "khủng long con". Shape names keep "hình" for star /
  heart ("hình ngôi sao", "hình trái tim") so "hòn đá hình …" always reads as a shape stone; the matcher still accepts
  bare "ngôi sao", "sao", "trái tim", "tim".
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("quả trứng {color}" →
  "quả trứng màu đỏ") and **never write "màu {color}"** (tested). The bare form (`hue`, `{bare:true}`) is "đỏ" — used in
  the found line "Quả trứng đỏ — sắp nở rồi!".
- **Never negative**: a wrong dig names what was dug, then the goal ("That’s a blue egg. Let’s find the red one!" / "Đây
  là quả trứng màu xanh dương. Mình tìm quả trứng màu đỏ nhé!"). Maths never gives the answer away. `already`, `busy`,
  `sandTap`, `soft` are not mistakes. Tested word ban: no / not / wrong / bad / fail / mistake / oops / fall / sorry … and
  sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm.
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "giỏi quá!".
- **Initials (age 6–7)**: VI words without classifier (vịt V, mèo M, chó C, bò B, heo H, ếch **Ê**, sư tử S, voi V) — the
  letter keeps its own marks (Ê) but never a tone mark; content.js's `DD.WORDS` agrees.

## 1. API (`DD.I18N`) — for main.js
All helpers never throw and never return '' or a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'duck'}`, `{kind:'bone'}`, `{n:3}`; objects `{kind,value}` / `{nameKind,nameValue}` are named / phrased |
| `ask(lang, promptKey, params, {next?, rng?})` | the step prompt; `next:true` → "Next one! Find the red egg!" (`p.next` + prompt) for the 2nd step |
| `sayFound(lang, {thing, topic, params, count?}, rng?)` | `found` → egg "A red egg — it’s hatching!" / "Quả trứng đỏ — sắp nở rồi!"; stone "The star stone!" (shapes5: "The blue star!"); toy "The duck! Hello!"; size "The big bone! Hooray!"; tablet "Letter B! Super!", "Small b!", "Five! Super!"; topic `initial` "D is for duck!" / "Chữ Ê, ếch!"; `oddeven` "Seven is odd!"; `add`/`sub` with `params {a,b}` "Five! 2 + 3 is five!"; **count** (`count {i,n}`) → just "Three!". Also accepts a bare thing |
| `sayWrong(lang, {thing, got, want, topic, params}, rng?)` | `wrong` → "That’s a blue egg. Let’s find the red one!", "That’s a circle. Let’s find the triangle!", shapes5 "That’s a red star. Let’s find the blue star!", "That’s the small bone. Let’s find the big one!", "That’s a cat. Let’s find the duck!", "That’s letter D. Let’s find letter B!"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "Pig starts with P! Let’s look again!" |
| `sayHatch(lang, {color}, rng?)` | `hatch` → "Hello, baby dino!", "Crack! A red baby dino!" / "Rắc! Khủng long con màu đỏ nè!" |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `sayCountDone(lang, n, rng?)` | "Three bones! Hooray!" / "Ba khúc xương! Hoan hô!" (optional, at `stepDone` of a count step) |
| `talkWrong(lang, choice)` / `talkWrong(lang, kind, value)` | missed Talk answer: "It is blue! Good try!", "It is an oval! Good try!", "It is the elephant! Good try!", "It is the big one! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `choiceWords(lang, choice)` | spoken forms for a Talk choice `{id, thing:{kind…}, value}` (egg/blob/dino → colour, stone → shape, toy → animal, number/dots → number, letter, size) — pass as `Voice.listen({choices:[{id, words}]})` |
| `name(lang, kind, value, opts?)` | kinds `color, hue, shape, size, animal ({size}), word, thing, number, dots, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` | accepted spoken forms (lower-case, + no-diacritic forms, digits and "số năm" for numbers) |
| `thingPhrase(lang, thing, {art, color, size, bare, noStone})` | "a red egg", "the star stone", "the big bone", "the duck" / "quả trứng màu đỏ", "hòn đá hình ngôi sao", "khúc xương to", "con vịt" |
| `phrase(lang, {nameKind, nameValue, kind?})` | "the circle", "the small bone", "letter D", "small b", "number five", "2 + 3" · vi "hình tròn", "khúc xương nhỏ", "chữ D", "chữ b thường", "số năm" |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "D is for", "starts with P", "Big B / small b"), + − =, " — " → ", ", "…" → ".", vi "chữ B" → "chữ bờ"; "Bun" unchanged |
| `initialOf(lang, animal)` | `{word, first}` ("ếch", "Ê") |
| `setChild(name)`, `has`, `keys`, `raw`, `kindValue(choice)` | `{child}` default for every `t()`; key checks; a choice → `[kind, value]` |
| constants | `langs, TOPICS, ANIMALS, THING_KINDS, NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

### 1.1 Event fields the helpers read (main passes the world event, plus what it knows)
- **`found {id, thing, count?}`** — pass `{...e, topic: world.topic, params: step.params}` (the step that was answered).
  `thing` is the mound's thing (`{kind, color?, shape?, animal?, text?, size?, nameKind, nameValue}`). The `params` matter
  for shapes5 (colour in the name) and add/sub ("2 + 3 is five!").
- **`wrong {id, kind:'thing', got, want, streak}`** — pass `{...e, thing: mound.thing, topic: world.topic, params:
  step.params}`. Without `thing` the line falls back to bare names ("That’s blue. Let’s find red!").
- **`hatch {id, color}`** — pass the event as is.

### 1.2 World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (skill rule, proven in the playtests): *feedback interrupts* unless the prompt is still protected (the
guard in `speakPrompt` lasts until the prompt has actually been spoken); *round-done praise and hints queue*; *count words
queue* (no interrupt — a fast child must hear the newest number, the queue keeps ≤ 2 waiting); *skip a new praise if one
started < 1.2 s ago*. Speech is disabled for `speed > 1` (log only).

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n:level+1}) + ' ' + t('topic.'+topic)` (banner + voice), then `t('weather.'+weather)` | interrupt (new chapter), weather queued |
| `round {round, surprise}` | `t('enter')` (not on round 0 of a chapter: the level line already speaks) | queue; dropped when the `ask` comes |
| `puff {x, y}` | — (sound only) | |
| `ask {promptKey, params, mode, step, first}` | `ask(lang, promptKey, params, {next: !first})` — bubble + voice; remember it for `pokeBun` / `idle` | **protected prompt**: `Voice.dropQueued()`, then say with interrupt; nothing may cut it until it started |
| `scoop {id, i, n}` | `t('scoop')` **only** on the first scoop of the first dig of a chapter (or ~1 in 5 first scoops), never while the prompt is protected | queue, low priority (drop if anything waits) |
| `reveal {id, thing}` | — (the "pop" sound; the line comes with `found` / `wrong`) | |
| `found {id, thing, count?}` | `sayFound(lang, {...e, topic, params})`; count steps → "One!", "Two!" … | interrupt (feedback); **count words queue** (no interrupt) |
| `hatch {id, color}` | `sayHatch(lang, e)` — only if the found line already finished (else skip; the chirp sound says it) | queue |
| `shelved {id, slot}` | — (shelf "clonk") | |
| `stepDone {step}` | count step: `sayCountDone(lang, step.need)`; otherwise nothing (the next `ask` follows 0.6 s later) | queue |
| `wrong {…}` | `sayWrong(lang, {...e, thing, topic, params})`; after the 2nd miss the hint follows | interrupt unless the prompt is protected (then queue) |
| `already {id}` | `t('already')` (not a mistake) | interrupt-free: queue, skip if the same line < 3 s ago |
| `busy {}` | — not spoken by default (`t('busy')` exists for the bubble if wanted) | |
| `sandTap {x, y}` | — (dust puff + soft "pat") | |
| `soft {}` (long press / drag) | — (`pat` sound + tiny wobble only) | |
| `pokeBun` | repeat the current prompt (> 3 s after it was asked and not still waiting to be spoken; the wait ends when it starts, when its `say` promise resolves without starting, or 6 s after the ask). When nothing is repeated Bun's mouth does not flap | interrupt |
| `hint {id}` | `t('hint')` | **queue** |
| `assist` | `t('hint')` (variant "Bun will help! This one!") | queue |
| `idle {n}` | `t('idle') + ' ' + currentPromptText` | queue |
| `mole` / `moleTap` | `t('surprise.mole')` / `t('mole.tap')` | queue / interrupt (tap feedback), never over a protected prompt |
| `ptero` / `pteroTap` | `t('surprise.ptero')` / `t('ptero.tap')` | same |
| `roundDone {round, stars, misses}` | `t('great')` (0 misses) or `t('praise')` | **queue** (never cut the last count word); skip if a praise started < 1.2 s ago |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | interrupt; protected like a prompt |
| `talkAsk {n}` | repeat the Talk question | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice)` | interrupt |
| `levelDone` | `t('great')` | queue |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | interrupt, then queue |

### 1.3 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Bun’s voice" / "Giọng của
  Bun"), mic, done, stars, chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing,
  tapOrSay, listening ("Bun is listening…"), tapBun, tapHint ("Tap a sand mound to dig"), skip, gallery ("Our treasures"),
  langName.en, langName.vi` (paint-only `tapNini` removed → `tapBun`).
- **topic.\*** (one banner each): colors "Colour Eggs" / "Trứng sắc màu", shapes "Shape Stones" / "Đá hình khối", size
  "Big and Small", count "Counting Bones" / "Đếm khúc xương", animals "Toy Animals" / "Thú đồ chơi", letters "Letter
  Stones", lower, initial, add, sub, oddeven.
- **weather.0..3**: "Good morning, valley!", "Sunny noon!", "Sunset colours!", "Starry night — fireflies!".
- **Prompts** (3 wordings; required params → else the fallback): `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape,
  color}` (→ `p.shapes`), `p.size {size, kind}` (kind = bone / egg / stone / toy; toy + `{animal}` names the animal; → `p.sizeAny
  {size}` "Find the big one!"), `p.animals {animal}`, `p.count {n}` ("Dig up 3 bones!", `{bones}` plural-aware), `p.letters
  {letter}`, `p.lower {letter}` (capital shown, `{lower}` derived), `p.initial {letter}`, `p.add {a, b}`, `p.sub {a, b}`,
  `p.oddeven {parity}`; `p.any`; `p.next` ("Next one!" / "Tiếp nào!", used by `ask(…, {next:true})`).
- **Lines**: `scoop`, `found.{egg, stone, bone, toy} {thing}`, `found.label {label}`, `found.parity {num, parity}`,
  `found.initial {letter, word}`, `found.sum {expr, ans}`, `found.any`, `hatch {color?}`, `countDone {n}` (`{num} {bones}`),
  `wrong.thing {got, want}`, `wrong.math {got}`, `wrong.parity {num, parity}`, `wrong.initial {word, first}`, `wrong.any`,
  `already`, `busy`, `stepDone`, `enter`, `surprise.mole`, `mole.tap`, `surprise.ptero`, `ptero.tap`, `hint`, `idle`,
  `praise`, `great {child}`, `party`, `session.done {stars}`, `count.0..20`.
- **Talk** (content.js `makeTalk` → `promptKey 'talk.<topic>'`): `talk.intro, talk.right`; `talk.colors` "What colour is
  this egg?" (an egg is shown; ignores `{color}`), `talk.colorsWhich {color}` "Which egg is red?" (spare, when no egg is
  shown); `talk.shapes {shape}` "Which one is the triangle?" (→ `talk.shapesAny` "What shape is this stone?"); `talk.size
  {size, kind}` "Which egg is small?" (→ `talk.sizeOne` → `talk.sizeAny`); `talk.count` "How many bones?" (never says n; →
  `talk.countAny`); `talk.animals {animal}` "Where is the frog?" (content shows no picture, the choices are toys; →
  `talk.animalsAny` "Who is this?" for a shown toy); `talk.letters {letter}` (→ `lettersAny`), `talk.lower {letter}`,
  `talk.initial {word|animal}` (→ `initialAny`), `talk.add / talk.sub {a, b}` (→ `talk.calc`), `talk.oddeven {parity}` (→
  `oddevenAny`); `talk.wrong(.a, .animal, .size, .letter, .small, .number, .any)`.

### 1.4 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape | circle, square, triangle, star, heart, rectangle (rect), diamond, oval | hình tròn, hình vuông, hình tam giác, hình ngôi sao, hình trái tim, hình chữ nhật, hình thoi, hình bầu dục |
| animal | duck, cat, dog, cow, pig, frog, lion, elephant (+size "big duck") | con vịt, con mèo, con chó, con bò, con heo, con ếch, con sư tử, con voi (+size "con vịt to") |
| word (initial) | as animal | vịt V, mèo M, chó C, bò B, heo H, ếch Ê, sư tử S, voi V |
| thing | egg, stone, bone, toy, stone tablet, baby dino | quả trứng, hòn đá, khúc xương, đồ chơi, tấm đá, khủng long con |
| size | big, small | to, nhỏ |
Spoken extras (`words`): "kitty", "doggy", "puppy", "piggy", "moo"… / "cún", "con lợn", "lợn", "bò sữa", "con nhái" …;
"xanh" alone is ambiguous (no match), "con" alone matches nothing. Vietnamese letter names use kindergarten phonics: b →
bờ, c → cờ, k → ca, q → quờ, y → i dài … (`LETTER_VI`).

## 2. Voice (`DD.Voice`) — unchanged proven engine
`init({lang, enabled})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `DD.debug.voiceLog`, also when muted), `spoken(lang, text)`, `RATE` 0.9 / `PITCH` 1.2,
`canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null, transcript, reason?}>`,
`stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60. Lists are read
  at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Bun: **rate 0.9, pitch 1.2** (a small bright bunny; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Volume: `setVolume(v)` → every utterance's `u.volume` (follows the game's volume setting; skill "Loud, clear sound"
  rule). TTS loudness itself is the phone's media volume.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s,
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.

## 3. iOS / Safari findings (re-checked 7–8 Nov 2026)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+, still WebKit-only; W3C Audio Session draft) — `Audio.unlock()`
  (lead) sets it. While the mic listens `voice.js` switches to `'play-and-record'` and restores the previous type afterwards
  (otherwise speech goes to the earpiece / gets quiet).
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **Vietnamese voice "Linh"**: built into iOS/iPadOS (vi-VN), so `getVoices()` lists it even when nothing was downloaded;
  `voice.js` sets `utterance.voice` by name. If a parent wants a better one: **Settings › Accessibility › Spoken Content ›
  Voices › Vietnamese** (download Linh Enhanced if offered). Note the iOS 26 regression: the voice chosen in Spoken Content
  is ignored by web speech and downloaded Enhanced voices are often missing from `getVoices()` — so we never rely on the
  default voice. `hasVoice('vi') === false` (no vi voice at all, e.g. some Android / desktop browsers) → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network) and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. Vietnamese recognition (`vi-VN`) works but returns words often without diacritics or with the
  wrong tone ("mầu đổ") — the matcher compares stripped forms too. Apple's on-device SpeechAnalyzer (iOS 26) is native-only.
  The mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).
Sources: MDN `AudioSession.type`; W3C Audio Session WD; Apple Developer Forums thread 804648 ("AVSpeechSynthesisVoice ignores
user-selected voices in iOS 26"); WebKit "Safari 26" release notes; Apple support "Hear iPhone speak the screen" (Spoken Content).

## 4. Input (`DD.Input`) — one-finger TAP (drag-safe)
```js
const detach = DD.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y),
  move:   (x, y, ev) => world.pointerMove(x, y),
  up:     (x, y, ev) => world.pointerUp(x, y),   // the world judges the tap AT RELEASE (< 1.0 s, < 64 px); long press / drag → soft
  cancel: ()         => world.cancelDrag(),
  hover:  (x, y)     => {}                       // optional, mouse without a button
});
detach.cancel();    // main: on resize / rotation / pause → one cancel(), the rest of that finger is dropped
detach.isActive();  // a finger (or mouse button) is down
detach();           // remove all listeners
```
**Callbacks receive two NUMBERS `(x, y)` in logical px, then the raw event — never a point object.** Non-finite points are
dropped; an `up` without a mappable point becomes `cancel()`.
- **One active pointer.** `down` fires synchronously inside `pointerdown` (canvas `touch-action: none`, `preventDefault`,
  **pointer capture**), every `pointermove` of that finger reaches `move`, `up` arrives exactly once — also when lifted
  outside the canvas / over the HUD (capture + window fallback, no double delivery). Quick taps in a row each give down + up
  (a child hammering a mound to dig faster gets every scoop).
- **Extra fingers are ignored** (a resting second hand never digs by accident). Recovery when the active finger is known
  to be gone (iOS swallowed its `pointerup`): a new `isPrimary` touch, a mouse press replacing a touch, the touch-fallback's
  active touch missing from `e.touches`, or silence ≥ `Input.STALE_MS` (6 s) → `cancel()` for the old, `down()` for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.

## 5. Adding a language / a thing
- New animal / thing kind: `ANIMALS` / `THING_KINDS`, `NAMES.*.animal|word|thing`, `WORDS.*`, `WORD_LIST` and run the test.
- New language: `LANGS`, `NAMES[xx]` (all kinds), `BONES`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, a
  complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`, `thingPhrase` word order;
  `voice.js`: `LANG_TAG`, `PREFERRED`.
