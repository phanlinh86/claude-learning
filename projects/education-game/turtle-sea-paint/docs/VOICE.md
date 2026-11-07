# Nini's Sea Painting — Voice, language and input

Files: `game/js/i18n.js` (`SP.I18N`), `game/js/voice.js` (`SP.Voice`), `game/js/input.js` (`SP.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 15 000 checks, self-contained): every key in both languages with identical
key sets **and identical `{params}`**, every `ui.*` key that `index.html` / `ui.js` / `main.js` use, 3 wordings per
instruction, every prompt × part × colour / shape / animal × size / spot × n 1–12 (EN plurals), every name kind × value
(DESIGN §6 names), no `màu màu`, no unfilled `{param}`, a negative-word ban, `words()` (digits + no-diacritic forms) matched
back by the matcher, exact `sayPick / sayPaint / sayWrong / sayNeedPaint / sayNotThis` lines plus a sweep of every
thing × role × topic, garbage events, speech text, the tap input layer, parent hold gate, voice queue / interrupt / unlock
with a fake `speechSynthesis`, recognizer. **When `game/js/pictures.js` exists** the test adds every `SP.PART_NAMES` value
(and every `nameKind:'part'` value of every template) and fails on a part name without its own EN + VI entry; **when the sea
`content.js` exists** it renders every `promptKey` / Talk key + params `makeRound` / `makeTalk` produce for ages 3–7.
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from the sister games; the wording is new.

## 0. Wording principles (Nini)
- **Nini** is a cheerful baby sea turtle painter in a cream beret. EN "Nini"; VI lines "Nini", titles "Rùa Nini".
  Title "Nini’s Sea Painting" / "Rùa Nini — Tô Màu Đại Dương"; logo lines "Nini’s" / "Sea Painting", "Rùa Nini" /
  "Tô Màu Đại Dương". **TTS**: English voices say "Nini" as written; Vietnamese voices get **"Ni Ni"** (`I18N.speech`;
  the Latin "Nini" is read as one clipped syllable) — display text keeps "Nini".
- **Painting vocabulary**: paint / pick the paint / tap the shining … / beautiful — vi **tô / chọn màu / vỏ sò màu /
  chạm vào … đang lấp lánh / đẹp quá**.
- **Classifiers**: animals "con cá", shapes "hình tròn", letters "chữ B", numbers "số năm", parts with a kid word ("cái đuôi",
  "đôi càng", "mấy cái chân", "cánh buồm"), counted spots "3 viên ngọc trai / 3 vỏ sò / 3 bong bóng / 3 con sao biển".
- **Colours**: `name('vi','color','red')` = **"màu đỏ"**; VI lines put `{color}` right after the noun ("tô cái đuôi
  {color}" → "tô cái đuôi màu đỏ") and **never write "màu {color}"** (tested; no "màu màu"). The bare form
  (`name('vi','hue','red')` / `{bare:true}` / derived `{hue}`) is "đỏ".
- **Never negative**: a wrong tap names what was tapped, then the goal ("That’s yellow. Let’s find blue!"). Maths never gives
  the answer away. `notThis`, `needPaint`, `already` are not mistakes. Tested word ban: no / not / wrong / bad / fail /
  mistake / oops / fall / sorry … and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật / đổ / ngã / không phải / nhầm.
- **Vietnamese for a 4-year-old**: every prompt has a "Bé ơi, … nhé!" wording; "nào!", "nè", "nhỉ?", "giỏi quá!".
- EN keeps verbs out of part lines ("Lovely purple claws!", "Tap the shining legs!") so plural parts never read wrong.

## 1. API (`SP.I18N`) — for main.js
All helpers never throw and never return '' or a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (a random variant). Raw params are named: `{color:'red'}`, `{part:'tail'}`, `{animal:'crab'}`, `{spot:'pearl', n:3}`; objects `{kind,value}` / `{nameKind,nameValue}` are named / phrased |
| `name(lang, kind, value, opts?)` | kinds `color, hue, shape, size, animal ({size}), word, part, spot ({n}), number, dots, letter, text, sum, diff, parity` |
| `words(lang, kind, value)` | accepted spoken forms for Talk-time choices (lower-case, + no-diacritic forms, digits and "số năm" for numbers) |
| `phrase(lang, thing)` / `phrase(lang, kind, value)` | "the circle", "the big fish", "the claws", "letter D", "small b", "number five", "2 + 3", "yellow" · vi "hình tròn", "con cá to", "đôi càng", "chữ D", "chữ b thường", "số năm", "màu vàng" |
| `sayPick(lang, ev)` | `pick {color}` → "Blue!" / "Màu xanh dương!" |
| `sayPaint(lang, ev)` | `paint` → per role: part "Blue tail — beautiful!" / "Cái đuôi màu xanh dương, đẹp quá!"; shape "The triangle! Beautiful!"; animal "The crab! Hooray!" (sized: "The big fish!"); label "Letter B! Super!", "Small b!", "Five!"; topic `initial` "C is for crab!" / "Chữ B, bạch tuộc!"; `oddeven` "Seven is odd!"; `add`/`sub` with `ev.params {a,b}` "2 + 3 is five!"; **count** (`ev.count {i,n}`) → just "Three!" |
| `sayWrong(lang, ev)` | `wrong` → colour "That’s yellow. Let’s find blue!" / "Đây là màu vàng. Mình tìm màu xanh dương nhé!"; part "That’s the circle. Where is the triangle?"; size "That’s the small fish. Where is the big fish?"; maths "That’s number six. Let’s count again!"; parity "Four is even! Let’s look for another one!"; initial "Whale starts with W! Let’s look again!" |
| `sayNeedPaint(lang, {color})` | "First pick the blue paint!" (no colour → "First pick a paint!") |
| `sayNotThis(lang, {target})` | "Paint the shining tail!" (target = the glowing part `{nameKind:'part', nameValue}`) |
| `sayAlive(lang, kind)` | `alive {kind}` swim / scuttle / sail / bob / float → "Look, it’s swimming!" |
| `sayCount(lang, i)` | "Zero!" … "Twenty!" (= `count.<i>`; beyond 20 the digits) |
| `talkWrong(lang, kind, value)` | missed Talk answer: "It is an oval! Good try!", "It is the big one! Good try!", "Là số bảy đó! Bé cố gắng lắm!" |
| `speech(lang, text)` | TTS text (Voice.say calls it): letter names ("letter D" → "letter dee", "C is for", "starts with C", "Big B / small b"), + − =, " — " → ", ", vi "chữ B" → "chữ bờ", vi "Nini" → "Ni Ni" |
| `initialOf(lang, animal)` | `{word, first}` ("bạch tuộc", "B") |
| `setChild(name)`, `has`, `keys`, `raw` | `{child}` default for every `t()`; key checks |
| constants | `langs, TOPICS, SEA_ANIMALS, SPOTS, PART_NAMES (the parts i18n knows), NAME_KINDS, PROMPTS, PARAMS (required params per key), NAME_TABLE, LETTER_VI, WORD_LIST, MAX_COUNT (20)` |

### 1.1 Event fields the helpers read (main passes the world event, plus what it knows)
- **part info** — `ev.part` = the pic part `{role, nameKind, nameValue, size?, text?}` (main: `world.parts` /
  `world.round.pic.parts` by `e.partId`) or the event's own `role / nameKind / nameValue / size`.
- **`ev.topic`** (main's `ev2` adds `world.topic`) switches to the initial / oddeven / maths lines; `ev.params` = the step's
  params (for "2 + 3 is five!").
- **wrong** — `ev.kind 'color'|'part'`, `ev.got`, `ev.want` `{nameKind, nameValue, size?}`. **Size rounds: put `size` on
  `got` / `want`** (the same animal twice) — without it the line falls back to the neutral "Let’s look again!".
- **needPaint** — the world event has no colour: pass the current step's `color` (`round.steps[w.step].color`).
- **notThis** — pass `target` = the glowing part of the step (`{nameKind, nameValue}`), not the tapped one.

### 1.2 World event → line (suggested wiring)
| world event | line |
|---|---|
| `level {level, topic}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+level)` (spring / summer / autumn / winter under the sea) |
| `round {surprise}` / enter | `t('enter')`; surprise → `t('surprise.fishy')` / `t('surprise.pearl')` |
| `ask {promptKey, params, follow?}` | `t(promptKey, params)` — protected prompt; `follow` = `p.tapPart {part}` after the right shell |
| `pick {color}` | `sayPick` (short; interrupting is fine) |
| `paint {partId, color, count?}` | `sayPaint(lang, {…e, part, topic, params})`; count words queued, no interrupt |
| `stepDone` | `t('stepDone')` (or nothing when the next `ask` follows at once) |
| `wrong` | `sayWrong`; `hint` → `t('hint')` |
| `needPaint` / `notThis` / `already` | `sayNeedPaint(lang, {color})` / `sayNotThis(lang, {target})` / `t('already')` |
| `idle {n}` | `t('idle') + ' ' + prompt` |
| finish / `sweep` | `t('finish')` once |
| `alive {kind}` | `sayAlive(lang, kind)` |
| `fishyTap` / `pearlTap` | `t('fishy.tap')` / `t('pearl.tap')` |
| `roundDone` | `t('great')` / `t('praise')` (queued — never cut the last count) |
| `pokeNini` | repeat the prompt |
| `talk` / `talkResult` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; `t('talk.right')` / `talkWrong(lang, kind, value)` |
| `sessionDone {stars}` | `t('party')`, `t('session.done', {stars})` |

### 1.3 Key list
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age,
  years {n}, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice ("Nini’s voice"), mic, done,
  stars, chapter {n}, allDone {stars}, welcome ({child}), micUnsupported, micDenied, voiceMissing, tapOrSay, listening
  ("Nini is listening…"), tapNini, tapHint, skip, gallery, langName.en, langName.vi` (train-only `tapMomo`, `dragHint`,
  `whistle` removed).
- **topic.\*** (one banner each): colors "Colour Painting", shapes "Shape Painting", size "Big and Small", count "Counting
  Bubbles", animals "Sea Animals", letters "ABC Bubbles", lower, initial, add, sub, oddeven.
- **Prompts** (3 wordings; required params → else `p.any`): `p.colors {part, color}`, `p.tapPart {part}` (→ `notThis.any`),
  `p.shapes {shape, color?}`, `p.shapes5 {shape, color}` (→ `p.shapes`), `p.size {size, animal, color?}`, `p.animals
  {animal, color?}`, `p.count {n, spot?, color?}` (no spot → "spots"), `p.letters {letter}`, `p.lower {letter}` (capital
  shown, `{lower}` derived), `p.initial {letter}`, `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}`.
- **Lines**: `say.pick {color}` (+ `.any`), `say.paint.{part {part,color}, shape {shape,color}, spot {spot,color},
  animal {animal,color}, label {label}, parity {num,parity}, initial {letter,word}, sum {expr,ans}, any}`, `wrong.color
  {got,want}`, `wrong.part {got,want}`, `wrong.math {got}`, `wrong.parity {num,parity}`, `wrong.initial {word,first}`,
  `wrong.any`, `needPaint {color}` (+ `.any`), `notThis {part}` (+ `.any`), `already`, `stepDone`, `finish`, `enter`,
  `alive.{swim, scuttle, sail, bob, float}`, `surprise.fishy`, `fishy.tap`, `surprise.pearl`, `pearl.tap`, `hint`, `idle`,
  `praise`, `great {child}`, `party`, `session.done {stars}`, `weather.0..3`, `count.0..20`.
- **Talk**: `talk.intro, talk.right, talk.colors, talk.shapes, talk.size {size}` (→ `talk.sizeAny`), `talk.count {spot}`
  (always plural; → `talk.countAny`), `talk.animals, talk.letters, talk.lower, talk.initial, talk.add {a,b}, talk.sub {a,b}`
  (→ `talk.calc`), `talk.oddeven {n}` (→ `talk.oddevenAny`), `talk.wrong(.a, .animal, .size, .letter, .small, .number, .any)`.
  Questions never contain the answer (`talk.colors` ignores its `{color}` param).

### 1.4 Names (DESIGN §6)
| kind | EN | VI |
|---|---|---|
| color / hue | red blue yellow green orange purple pink | màu đỏ, màu xanh dương, màu vàng, màu xanh lá, màu cam, màu tím, màu hồng / bare: đỏ, xanh dương … |
| shape | circle, square, triangle, star, heart, rectangle, diamond, oval | hình tròn, hình vuông, hình tam giác, hình ngôi sao, hình trái tim, hình chữ nhật, hình thoi, hình bầu dục |
| animal | fish, crab, octopus, starfish, jellyfish, seahorse, whale, dolphin (+size "big fish") | con cá, con cua, con bạch tuộc, con sao biển, con sứa, con cá ngựa, con cá voi, con cá heo (+size "con cá to") |
| word (initial) | as animal | cá C, cua C, bạch tuộc B, sao biển S, sứa S, cá ngựa C, cá voi C, cá heo C (distinct sets are small: ≤ 3 initials) |
| size | big, small | to, nhỏ |
| spot | bubble(s), pearl(s), shell(s), starfish | bong bóng, viên ngọc trai, vỏ sò, con sao biển ("ngôi sao biển" would mean a star; the animal is "con sao biển") |
| part (main ones) | body, tail, fin, sail, boat (hull), flag, mast, shell, claws, legs, bell, tentacles, head, arms, hat, belly, tower, window, roof, rock, door, spots, star, wheel, cabin, wave, sun, cloud, light, porthole "round window" … (≈ 100 in `PARTS`) | phần thân, cái đuôi, cái vây, cánh buồm, thân thuyền, lá cờ, cột buồm, cái mai (crab) / `snailshell` vỏ ốc, đôi càng, mấy cái chân, đầu sứa, mấy cái tua, cái đầu, mấy cái xúc tu, cái mũ, cái bụng, cái tháp, ô cửa sổ, mái nhà, tảng đá, cánh cửa, mấy cái đốm, ngôi sao, bánh lái, khoang thuyền, con sóng, ông mặt trời, đám mây … |
Unknown part ids fall back to the id with `_` → space (never crashes) — but the test fails until each gets its own entry.
Vietnamese letter names use kindergarten phonics: b → bờ, c → cờ, k → ca, q → quờ, y → i dài … (`LETTER_VI`).

## 2. Voice (`SP.Voice`) — unchanged proven engine
`init({lang, enabled})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, `setVolume(0..1)`,
`say(text, {interrupt, priority, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)` (promise
`.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`,
`onVoicesChanged(fn)`, `log` (+ `SP.debug.voiceLog`, also when muted), `spoken(lang, text)`, `RATE` 0.9 / `PITCH` 1.2,
`canListen()`, `listen({lang, choices:[{id, words}|{id, kind, value}], timeoutMs}) → Promise<{id|null, transcript, reason?}>`,
`stopListening()`, `isListening()`, `onListen(bool)`, `match(transcripts, choices, lang)`, `matchDetail(...)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60. Lists are read
  at init, on `voiceschanged` and polled for 6 s (iOS fills late).
- Nini: **rate 0.9, pitch 1.2** (a small bright turtle; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped, non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s,
  Chrome cuts utterances at ~15 s); page hidden → stop. Before `unlock()` only the newest line is kept.
- Tips: count words queued (no interrupt) so fast children hear the newest numbers; `roundDone` praise and hints queue;
  feedback (`pick`, `wrong`, `needPaint`) may interrupt. Disable speech for `speed > 1` (log only).

## 3. iOS / Safari findings (re-checked 7 Nov 2026)
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+, still WebKit-only in 2026; W3C Audio Session draft) —
  `Audio.unlock()` (lead) sets it. While the mic listens `voice.js` switches to `'play-and-record'` and restores the
  previous type afterwards (otherwise speech goes to the earpiece / gets quiet).
- **First utterance inside a gesture**: iOS speaks nothing until a `speak()` happens inside a user gesture. `unlock()` in the
  first `pointerup`/`touchend`/`click` speaks a silent `' '`; a line refused with `not-allowed` is kept and spoken on the next
  `unlock()`; lines queued before the first tap are re-timestamped (not "stale").
- **iOS 26 voices**: the voice chosen in Settings › Spoken Content is ignored by AVSpeechSynthesis / web speech (Apple
  forums regression report, still open late 2025) and downloaded Enhanced voices are often missing from `getVoices()` →
  we always set `utterance.voice` by name (Samantha / Linh are built in). `hasVoice('vi') === false` → show `ui.voiceMissing`.
- **Speech recognition** (`webkitSpeechRecognition`) works in Safari tabs only when **Siri & Dictation** are enabled (it
  usually needs a network) and is **missing in Home-Screen (standalone) mode** → `canListen()` false there; `not-allowed`
  turns it off for the session. Apple's new on-device SpeechAnalyzer (iOS 26) is native-only, not exposed to the web. The
  mic is optional: **tap answers always work**; main hides the mic when `!canListen()`.
- Reported WebKit hang: `start()` after an `<audio>` element played may never fire events → we never use `<audio>`, create a
  fresh recognizer per `listen()`, and a 7 s timeout always resolves.
- After backgrounding, the synthesizer can stay paused: on `visibilitychange` back we `cancel()` + `resume()`.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`. No regex look-behind in these files (iOS < 16.4).
Sources: MDN `AudioSession.type`; W3C Audio Session WD (Nov 2024); Apple Developer Forums thread 804648 ("AVSpeechSynthesisVoice
ignores user-selected voices in iOS 26"); WebKit "Safari 26" release notes; addpipe "Apple SpeechAnalyzer API".

## 4. Input (`SP.Input`) — one-finger TAP (drag-safe)
```js
const detach = SP.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y),
  move:   (x, y, ev) => world.pointerMove(x, y),
  up:     (x, y, ev) => world.pointerUp(x, y),   // the world decides tap (< 0.6 s, < 40 px) vs ignored drag
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
  outside the canvas / over the HUD (capture + window fallback, no double delivery). Quick taps in a row each give down + up.
- **Extra fingers are ignored** (a resting second hand never paints by accident). Recovery when the active finger is known
  to be gone (iOS swallowed its `pointerup`): a new `isPrimary` touch, a mouse press replacing a touch, the touch-fallback's
  active touch missing from `e.touches`, or silence ≥ `Input.STALE_MS` (6 s) → `cancel()` for the old, `down()` for the new.
- `pointercancel` (canvas or window), `lostpointercapture` while down, window `blur`, page hidden → `cancel()` once.
- Targets `button, .screen, #hud, .no-game-input` (`Input.IGNORE`) are skipped on press. Touch + mouse fallback when
  `PointerEvent` is missing. A throwing handler is caught and logged.
- `kidProof()` (idempotent): blocks pinch (`gesturestart`), double-tap zoom, long-press callout / selection / image drag,
  rubber-band & pull-to-refresh, context menu, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms = Input.HOLD_MS (2000), onDone, onProgress(p 0..1))` → `off()`: the parent gate; a quick tap or
  sliding off does nothing.

## 5. Adding a language / a part
- New part in `pictures.js`: add `id: ['en name', 'vi name']` to `PARTS` in `i18n.js` and run the unit test.
- New language: `LANGS`, `NAMES[xx]` (all kinds), `PARTS` column, `SPOT_PLURAL`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`,
  `WORD_LIST[xx]`, `GENERIC_SPOT`, a complete `STR[xx]` (identical key set and params — tested), `CHILD_FALLBACK[xx]`;
  `voice.js`: `LANG_TAG`, `PREFERRED`.
