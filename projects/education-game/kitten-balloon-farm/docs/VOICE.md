# Kitten's Balloon Farm — Voice, language and input

Files: `game/js/i18n.js` (`KB.I18N`), `game/js/voice.js` (`KB.Voice`), `game/js/input.js` (`KB.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 18 700 checks: every key in both languages, every name kind × value,
every prompt/feedback line built from the real `content.js` rounds and talks, never-negative wording, farm-animal and
sound matcher EN/VI with and without diacritics, voice queue with a fake `speechSynthesis`, recognizer, input rules).
The engine (voice queue, iOS fixes, matcher, kid-proofing) comes from Owlet's Snow Garden; the wording is new.

## 0. Wording principles (Miu)
- **Miu** is a playful little kitten having a balloon party on the farm. Same name in both languages; speaks in the
  first person ("I am Miu" / "Miu đây"), uses the child's name when the parent set one, otherwise "friend" / "bé".
- **Short and concrete**: ≤ 12 words per spoken line (tested), one action per prompt, the key word last
  ("Pop the **red** balloon!", "Pop the balloon with the **pig**!").
- **Balloon vocabulary**: pop / balloon / farm friends — vi **quả bóng / bấm vào / bóng bay / bạn thú**. A Vietnamese
  preschool teacher with a tablet says *"Bé ơi, bấm vào quả bóng màu đỏ nhé!"*; several targets: *"…bấm vào **tất cả**
  quả bóng màu đỏ nhé!"* (Vietnamese has no plural, "tất cả" carries it). The pop itself is *"Bụp!"*.
- **Never negative.** Wrong taps: "That’s the blue one. Where is the red one?" / "Quả này màu xanh dương. Quả bóng màu
  đỏ đâu nhỉ?", "Boing! Try a different one!", "Không sao đâu, thử lại nhé!". The test bans no / not / wrong / bad /
  fail / incorrect / mistake and sai / dở / tệ / hỏng / không đúng / chưa đúng / trật in every feedback line.
  Number targets (add/sub/odd-even) never reveal the answer on a wrong tap ("That one is four. Let’s try again!").
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!"; animals with their classifier.
- Colours: EN "colour" on screen; VI colours always carry "màu" (màu đỏ, màu hồng); VI shapes carry "hình"
  (hình tròn, hình trái tim, hình ngôi sao) so "quả bóng hình trái tim" reads naturally.
- Variant lists have 5–8 entries and both a `{child}` and a no-name form.

### Farm animals (`animal` kind) and their sounds (`sound` kind, value = animal id)
| id | EN | VI | sound EN / VI | Miu after the pop | also accepted by the mic |
|---|---|---|---|---|---|
| cow | cow | con bò | moo / ụm bò | Moo! / Ụm bò! | calf · bò, bò sữa, con bê |
| pig | pig | con lợn | oink / ụt ịt | Oink oink! / Ụt ịt! | piggy, piglet · lợn, **heo, con heo**, con ỉn |
| sheep | sheep | con cừu | baa / be be | Baa baa! / Be be! | lamb · cừu, cừu non |
| duck | duck | con vịt | quack / cạp cạp | Quack quack! / Cạp cạp! | ducky, duckling · vịt |
| horse | horse | con ngựa | neigh / hí hí | Neigh! / Hí hí! | pony, foal · ngựa |
| goat | goat | con dê | maa / — | Maa! / — | billy goat · dê |
| chick | chick | gà con | cheep / chíp chíp | Cheep cheep! / Chíp chíp! | chicken · **con gà**, gà |
| bunny | bunny | con thỏ | — / — | — | rabbit · thỏ |
| puppy | puppy | cún con | woof / gâu gâu | Woof woof! / Gâu gâu! | dog, doggy · cún, **con chó**, chó |

`KB.I18N.sound(lang, id)` / `hasSound(lang, id)`: bunny has no sound in either language and goat none in Vietnamese —
content never asks them in "Which animal says …?" (the test checks every generated Talk). Every no-diacritic form
("con lon", "con ga", "cun con") is accepted; "con" alone matches nothing. TTS: "baa"/"maa" are sent as "bah"/"mah"
(some voices spell them out).

## 1. What integration (main.js) must do
1. Boot: `KB.Voice.init({ lang, enabled })`, `KB.Input.kidProof()`, `KB.I18N.setChild(settings.name)`.
2. **First `touchend`/`click` anywhere** (with the AudioContext resume): `KB.Voice.unlock()`. Before that `say()` keeps
   only the newest line and speaks it right after unlock (its age is reset, so a slow first tap does not drop the welcome).
   Call `unlock()` on later taps too — cheap, and it re-arms speech if Safari refused a line (`not-allowed`, §5).
3. Round prompt: `KB.I18N.t(lang, e.promptKey, e.params)` with the `round` / `ask` event **as is** (raw params).
   Ask mode: first ask = the full `p.animals`; following asks may use `t(lang, 'p.animalsNext', e.params)`.
4. Feedback (use `interrupt: true` for answers to the child's tap):
   - `pop` / `correct` in **count** rounds → `KB.I18N.sayCount(lang, e.n, e.need)`: "One!" "Two!" … last
     "Three! Three balloons!" / "Ba! Ba quả bóng!" (then skip the `great` line for that round or queue it).
   - `correct` otherwise → `KB.I18N.sayCorrect(lang, e)`; optionally add `word: round.params.word` (initial),
     `expr: round.params.text` (add/sub), `parity: round.params.parity` (odd/even) to the event for a richer line.
   - `wrong` → `KB.I18N.sayWrong(lang, e)` (reads `nameKind/nameValue` + `targetNameKind/targetNameValue`; `sprite`
     / `targetSprite` also work for animals). Missing target → a gentle generic line.
   - Plain decoration pops → `KB.I18N.sayPop(lang)` ("Pop!" / "Bụp!") only when Miu is not already talking.
   - `hint` → `t('hint')`; `idle` → `t('idle') + ' ' + current prompt`; `roundDone` → `t('great')` (queued);
     `level` → `t('ui.chapter', {n}) + '. ' + t('topic.' + topic)` and `t('weather.' + level)`; `sessionDone` →
     `t('session.done', {stars})`. `miss` (tap on empty sky) → `t('miss')` every other time.
   `priority: true` for lines that must not be dropped (round prompt, ask prompt, Talk question).
5. `KB.Voice.onStart / onEnd` → Miu's talk frames + music ducking; `onVoicesChanged(fn)` → refresh `ui.voiceMissing`.
6. Talk time: question `t(lang, talk.promptKey, talk.params)` (`talk.animals` takes `{sound: animalId}` or
   `{animal}` → "Which animal says moo?" / "Con gì kêu ụm bò nhỉ?"). Mic: `KB.Voice.listen({ lang, choices:
   talk.choices.map(c => ({ id: c.id, kind: c.kind, value: c.value })), timeoutMs: 7000 })`; hide the mic when
   `!KB.Voice.canListen()`. Missed answer: `KB.I18N.talkWrong(lang, kind, value)` ("The cow says moo! Good try!").
7. Settings: `KB.Voice.setLang(l)`, `setEnabled(b)`; `!hasVoice('vi')` → show `ui.voiceMissing`. Title: `ui.logo1` /
   `ui.logo2` ("Kitten’s" / "Balloon Farm", "Bóng Bay" / "Nông Trại Mèo Con"), `ui.tagline`; `ui.tapMiu` hint label.
8. `?novoice=1` / speed > 1 → `KB.Voice.setEnabled(false)` (lines still logged in `KB.Voice.log` / `KB.debug.voiceLog`).
9. `KB.Input.attach(canvas, { toLogical, down, move, up, cancel })` — `down(x, y, ev)` → `world.pointerDown(x, y)`.

### 1.1 Prompts (`KB.I18N.PARAMS` = required params; missing → generic key, never "the !")
| key | params (from content.js) | EN | VI |
|---|---|---|---|
| `p.colors` | `color, n` (n = targets; 1 → `.one`) | Pop the red balloon(s)! | Bé ơi, bấm vào (tất cả) quả bóng màu đỏ nhé! |
| `p.shapes` | `shape, n` | Pop the heart balloon(s)! | Bé ơi, bấm vào quả bóng hình trái tim nhé! |
| `p.size` | `size, n` | Pop the big balloon(s)! | Bé ơi, bấm vào quả bóng to nhé! |
| `p.count` | `n` | Pop 3 balloons! Let’s count! | Bé ơi, bấm 3 quả bóng nhé! Mình cùng đếm nào! |
| `p.animals` / `p.animalsNext` | `animal` | Pop the balloon with the pig! / Now the pig! | Bé ơi, bấm vào quả bóng có con lợn nhé! / Giờ đến con lợn nhé! |
| `p.letters` / `p.lower` | `letter` or `text` | Pop the letter B! / Find the small letter b! | Bé ơi, bấm vào quả bóng chữ B nhé! / Bé tìm chữ b viết thường nhé! |
| `p.initial` | `word` or `animal` | What does pig start with? Pop it! | Lợn bắt đầu bằng chữ gì? Bé bấm nhé! |
| `p.add` / `p.sub` | `text:'2 + 3'` or `a, b` | What is 2 + 3? Pop the answer! | 2 + 3 bằng mấy? Bé bấm vào đáp số nhé! |
| `p.oddeven` | `parity, n` | Pop the odd numbers! | Bé ơi, bấm vào các số lẻ nhé! |
| `talk.animals` | `sound` (animal id) or `animal` | Which animal says moo? | Con gì kêu ụm bò nhỉ? |

Plural rule: keys `p.colors p.shapes p.size p.oddeven` switch to their `.one` variant when `k` (else `n`) is 1.
Derived placeholders: `{sound} {letter} {lower} {word} {expr} {balloons} {N}`. Raw `color shape size animal parity`
(and `name`/`target` with animal ids) are named automatically; `{kind, value}` objects are always named.

### 1.2 Feedback by kind
| kind | `sayCorrect` EN / VI | `sayWrong` (tapped → wanted) EN / VI |
|---|---|---|
| color | Red! · A red balloon! / Màu đỏ! · Quả bóng màu đỏ! | That’s the blue one. Where is the red one? / Quả này màu xanh dương. Quả bóng màu đỏ đâu nhỉ? |
| shape | A heart! / Hình trái tim! | That’s a circle. Where is the heart? / Đây là hình tròn. Còn hình trái tim đâu nhỉ? |
| size | Big! · The big balloon! / Quả bóng to! | That one is small. Where is the big one? / Quả này nhỏ. Quả bóng to đâu nhỉ? |
| animal (or `sprite`) | The pig! Oink oink! / Con lợn đây rồi! Ụt ịt! | That’s the cow. Where is the pig? / Đây là con bò. Con lợn đâu nhỉ? |
| number | Seven! · (expr) Two plus three is five! / Số bảy! | That one is four. Let’s try again! / Đây là số bốn. Mình thử lại nhé! |
| letter | The letter B! · (word) Pig starts with the letter P! / Chữ B! (spoken "chữ bờ") | That’s the letter C. Where is B? / Đây là chữ C. Chữ B đâu nhỉ? |
| balloon (count) | = `sayCount(n, need)` when `ev.mode === 'count'`, else "Pop!" | — |

## 2. How voices are chosen
`getVoices()` is read at init, on `voiceschanged` (property and listener) and by polling every 250 ms for 6 s (iOS fills
the list late). Score: language prefix (base 10) · exact region `en-US`/`vi-VN` +6 (`en-GB/AU` +3) · preferred names
(en Samantha, Nicky, Karen, Ava, Allison, Susan, Zoe…, Google US English, Microsoft Aria/Jenny; vi **Linh**, Google Tiếng
Việt, Microsoft HoaiMy/An) +40…+23 · Enhanced/Premium/Natural/Neural +12 · Google on non-iOS +8 · local +3 · default +2 ·
Apple novelty/Eloquence voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma, Rocko…) −60.
Utterances: `lang` en-US / vi-VN, **rate 0.92, pitch 1.25** (Miu: bright and kitten-young but unhurried; > 1.3 the
iOS voices get squeaky, rate < 0.85 smears Vietnamese tones), volume 1. No matching voice → still spoken with `lang`.

Queue: one line speaking + ≤ 2 waiting; when full the oldest non-priority line is dropped; non-priority lines older than
5 s are skipped. `interrupt` flushes + cancels and speaks after 50–90 ms (`speak()` straight after `cancel()` is dropped
by Safari/Chrome). `dropQueued()` drops waiting lines (the current one finishes). Watchdog ends a line after its estimated
length + 4 s (iOS sometimes never fires `onend`). Desktop Chrome: 10 s `pause()/resume()` keep-alive. Hidden page →
stop; visible again → `cancel()` + `resume()` (iOS can leave the synth paused after backgrounding).
Text → speech: `KB.I18N.speech` (EN "letter B" → "bee", VI "chữ B" → "chữ bờ", `2 + 3` → "2 plus 3"/"2 cộng 3").

## 3. Vietnamese letter names (kindergarten phonics, "đọc theo âm")
a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**
(f→ép, j→gi, w→vê kép, z→dét). The screen shows the letter ("Chữ B!"), the voice says the phonics name. The mic also
accepts alphabet names parents use (bê, xê, dê, giê, hát, ca, e-lờ, pê, quy, ét-xì, tê, vê, ích-xì, i-cờ-rét).
vi `initial` words: bò B, lợn L, cừu C, vịt V, dê D, gà con G — thỏ (th), ngựa (ng), chó (ch) are left out because
Vietnamese phonics teaches th / ng / ch as their own sounds.

## 4. Speech recognition
`listen()` makes a **new** `SpeechRecognition || webkitSpeechRecognition` each time, `lang` en-US/vi-VN,
`interimResults`, `maxAlternatives 5`, `continuous false`; stops TTS first. A final match resolves at once; an interim
match waits 450 ms ("mười" → "mười hai"). Ends `{id:null, reason}` on `no-speech`, `nomatch`, `timeout` (7 s), errors.
`not-allowed`/`service-not-allowed` turn `canListen()` off for the session. While the mic is open
`navigator.audioSession.type = 'play-and-record'`, restored afterwards.
Matcher (`KB.Voice.match`, pure): exact token sequence 30+len > diacritic-free 20+len > number words of both languages
as digits 20+len > edit distance ≤ 1 (≤ 2 for 8+ letters) on long single words 10+len; `=word` forms only match the
whole utterance (en "to"→2, vi "không"→0); later words win ties; same score and position → ambiguous → next alternative.

## 5. iOS / Safari notes (re-checked 1 Nov 2026)
- **Downloaded voices are still missing from `getVoices()`.** WebKit [bug 290497](https://bugs.webkit.org/show_bug.cgi?id=290497)
  (Safari 18, status NEW, in Radar) and [Apple forum 723503](https://developer.apple.com/forums/thread/723503): only the
  built-in (often compact) voices reach the web; Enhanced/Premium voices a parent downloads usually do not. Samantha and
  Linh are built in, so the scoring finds them; `hasVoice()`/`ui.voiceMissing` covers devices without Vietnamese.
- **iOS 26 voice-preference regression** ([Apple forum 804648](https://developer.apple.com/forums/thread/804648)): the
  system ignores the voice chosen in Settings for a language. We always set `utterance.voice` by name, which still works.
- **Gesture rule:** the first `speak()` must come from a user gesture. `unlock()` speaks a silent `' '` in the first tap.
  If Safari still refuses a line (`onerror 'not-allowed'`, e.g. after a long background), voice.js now keeps that line,
  marks itself locked and speaks it on the next `unlock()` instead of losing it.
- **Speech recognition**: works in Safari tabs on iOS/iPadOS, still **not in Home-Screen web apps**
  ([What PWA Can Do Today](https://whatpwacando.today/speech-recognition)) → `canListen()` is false when standalone.
  It needs Siri/Dictation and fails on managed devices; start it from a tap
  ([WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)). Reports of recognition hanging (no result, no
  error, no end) after media playback ([technetexperts](https://www.technetexperts.com/ios-safari-web-speech-api-bug-fix/))
  are covered by a fresh recognizer per listen and the 7 s watchdog timeout. Our sound is WebAudio, not `<audio>`.
- **Ducking:** Safari ducks WebAudio while speaking and ≈ 1 s after ([WebKit 278598](https://bugs.webkit.org/show_bug.cgi?id=278598)); keep the
  game's own music duck gentle. The ring/silent switch mutes WebAudio; TTS may still play.
- iPadOS reports a desktop UA: detected via `MacIntel` + `maxTouchPoints > 1`.
- iOS fires `pointercancel` on system gestures → `KB.Input` turns it into `cancel()`; a lost `pointerup` no longer blocks input (§6).

## 6. Input and kid-proofing (`KB.Input`)
- `attach(canvas, h)`: Pointer Events + pointer capture; **`h.down(x, y, ev)` fires synchronously inside `pointerdown`**
  (no tap-vs-drag wait, no click delay — the world pops on touch-down), with `x, y` = `h.toLogical(clientX, clientY)`
  in logical px; non-finite points are dropped. `move`/`up` follow for the same pointer; `pointercancel`,
  `lostpointercapture`, window blur, page hide → `h.cancel()`.
- **One finger:** non-primary touches are ignored (they never become active, even after the first finger lifts). If a
  new *primary* pointer of the same type arrives while one is still marked active (its `pointerup` was swallowed by iOS),
  input recovers (`cancel()` then a fresh `down`) instead of ignoring every later tap.
- Ignores targets matching `button, .screen, #hud, .no-game-input` and their children; right mouse button ignored.
  Touch + mouse fallback without `PointerEvent` (same one-finger rule). A throwing handler is caught and logged.
- `kidProof()`: CSS (`touch-action: manipulation`, no callout/selection, `overscroll-behavior: none`), blocks pinch,
  multi-touch, rubber-band, double-tap zoom, context menu, selection, drag, Ctrl/⌘ zoom and refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: parent gate; progress 0..1; cancels on release, sliding off, cancel, blur;
  a quick tap does nothing.

## 7. Adding a language
`i18n.js`: add to `LANGS`, `NAMES[xx]`, `SOUND/CALL[xx]`, `NUM[xx]`, letters, `WORDS[xx]`, `WORD_LIST[xx]`, a complete
`STR[xx]` (identical key set — tested), `CHILD_FALLBACK[xx]`, `BALLOON[xx]`. `voice.js`: `LANG_TAG[xx]`, `PREFERRED[xx]`.
Plurals: the `.one` keys and `{balloons}` are the only number rules. Run the unit test.
