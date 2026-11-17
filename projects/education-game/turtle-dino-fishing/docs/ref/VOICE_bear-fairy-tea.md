# Moka's Fairy Tea Party — Voice, language and input

Files: `game/js/i18n.js` (`FT.I18N`), `game/js/voice.js` (`FT.Voice`), `game/js/input.js` (`FT.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 55 700 checks, self-contained — the DESIGN §5.1 value lists are hard-coded in
the test): identical key sets **and identical `{params}`** in en / vi, every `ui.*` key that `index.html` / `ui.js` / `main.js`
use, parade-only keys removed, 3 wordings + a `.first` long form for every prompt, every prompt × value × topic × age rendered,
3 wordings for every right / wrong line, Vietnamese diacritics and a warm "Bé ơi, … nhé!/nhỉ?" wording per prompt, a
negative-word ban, tidy rendering of every key (no `{x}`, no "a oval", no "màu màu" / "bánh bánh", capital after a stop, child
name / no name), every name kind × value, `initial()` for every guest and tea thing in both languages, `words()` (name +
no-diacritic + digit forms; no form shared by two values) matched back by the matcher, DESIGN example lines exactly, a sweep of
≈ 7 000 rule × member × wording combinations, Talk lines + `talkWrong`, speech text, the input layer (fake DOM), parent gate,
voice queue / interrupt / unlock / volume / speed with a fake `speechSynthesis`, recognizer. When the tea-party `content.js`
exists (it does) it also renders the ask, the right line and every wrong line of 200 `makeRound` rounds (ages 3–7, EN + VI)
and every `makeTalk` question + choice.

## 0. Wording principles (Moka)
- **Moka** is a gentle little honey-brown bear cub who hosts the fairy tea party. EN "Moka"; VI lines "Moka", titles
  **"Gấu Moka"**. Title "Moka’s Fairy Tea Party" / "Tiệc Trà Trong Rừng Của Gấu Moka"; logo lines "Moka’s" / "Fairy Tea
  Party", "Gấu Moka" / "Tiệc Trà Trong Rừng".
- **TTS of "Moka" — no rewrite.** Two ordinary syllables in both languages (VI voices read "mô-ca").
- **The question is "not"** ("Which one is NOT red?" / "Bạn nào không phải màu đỏ?"); the capital NOT is display emphasis
  only. Banned (tested): no / nope / wrong / incorrect / bad / fail / mistake / oops / sorry / "no!" and sai / sai rồi / dở /
  tệ / hỏng / không đúng / chưa đúng / trật / nhầm / hư.
- **Things (VI)**: cái tách, ấm trà, hũ mứt, cái bát, **bánh cupcake** (what Vietnamese kindergarten kids say; "bánh nướng
  nhỏ" would collide with the size word → "bánh nướng nhỏ nhỏ"); cookies "bánh quy hình tròn …"; plates "đĩa có ba quả dâu"
  (berries = **quả dâu**, never "quả mâm xôi"); place cards "thẻ chữ B", "thẻ số bảy", "2 + 3". EN: cup, teapot, jam jar,
  bowl, cupcake; "the star cookie"; "the plate with three berries"; "letter B", "small b", "number seven".
- **Guests (VI)**: con thỏ, con cáo, con nai, con sóc, con cú, con gấu mèo, con chuột, con nhím, chim cánh cụt, con cua, con cá
  vàng, con lạc đà, con sư tử. Homes rừng, biển, xứ băng, sa mạc, đồng cỏ châu Phi. `homeAt` carries the preposition: EN "in
  the forest / in the sea / on the ice / in the desert / on the savanna", VI "trong rừng / dưới biển / ở xứ băng / ở sa mạc /
  ở đồng cỏ châu Phi" → lines say "sống {home}" ("Chim cánh cụt sống ở xứ băng.", "Con cua sống dưới biển.").
- **Colours**: `name('vi','color','red')` = "màu đỏ"; lines never write "màu {color}". VI shapes in lines are "hình ngôi sao".
- **Wrong lines** name what was tapped *without* the shared attribute, say it matches its friends, then the goal
  ("The teapot is red like its friends! Which one isn’t red?" / "Ấm trà màu đỏ giống các bạn! Bạn nào khác màu nhỉ?").
  **Right lines** name the odd one with its difference and why ("The blue cup! It’s not red."; forest: "The penguin! The
  penguin lives on the ice.").
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, "bé {child}" → "bé".
- **Initials (ages 6–7)**: first letter of the bare noun (no classifier), diacritics stripped. EN bunny B, fox F, deer D,
  squirrel S, owl O, raccoon R, mouse M, hedgehog H, penguin P, crab C, goldfish G, camel C, lion L; cup C, teapot T, jam jar J,
  bowl B, cupcake C. VI thỏ T, cáo C, nai N, sóc S, cú C, gấu mèo G, chuột C, nhím N, chim cánh cụt C, cua C, cá vàng C, lạc đà L,
  sư tử S; tách T, ấm trà A, hũ mứt H, bát B, bánh cupcake B (content.js skips VI digraph words: ch, nh, …).
- Content note: DESIGN puts the goldfish (in its bowl) in the **sea** ("The goldfish lives in the sea."). Goldfish are pond
  fish; if the team wants it exact, change `ANIMAL_HOME.goldfish` (content + i18n) to a pond/water home — i18n follows.

## 1. API (`FT.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).
`e` for `sayRight` / `sayWrong` = the world event **plus** `{ topic: world.topic, promptKey: round.promptKey, params:
round.params, rule: round.rule }`. `right` carries `thing`; for `wrong` add `world.memberById(e.id).thing` (else rebuilt
from `e.got {nameKind, nameValue}`); `e.want` also works as the rule.

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{animal:'fox'}`, `{size:'big'}`, `{parity:'odd'}`, `{home:'ice'}` (→ "on the ice"), `{n:3}` → `{num}` "three" + `{berries}` "berries"/"berry"; `{thing:{…}}` → its phrase |
| `ask(lang, promptKey, params, {first, rng})` | the question; `first:true` → "They’re all red… but one! Which one is NOT red?" (missing param → `p.any`) |
| `sayRight(lang, e, rng?)` | per rule kind; **n → the count run** "One, two, three, four berries! The others have two." / "Một, hai, ba, bốn quả dâu! Các đĩa kia có hai quả." |
| `sayWrong(lang, e, rng?)` / `sayWrongHint(lang, e, rng?)` | gentle miss line / the miss that brings the hint ("The cup, like its friends! Look at the glowing one!"; plates → plain `hint`) |
| `sayCount(lang, i)` / `sayCountRun(lang, n, othersN?)` | "One!" … "Twenty!" / the count run |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the blue cup", "bánh cupcake nhỏ màu hồng", "the star cookie", "đĩa có một quả dâu", "thẻ chữ b thường", "the little fox", "chim cánh cụt"; Talk icons colour / number / home / size. opts `{color, size, who, art}` |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapeH, obj, objWord, cookie, plate, berries, animal, guest, word, who, home, homeAt, number / n, letter, sum, diff, parity, size, text / card` (old `block, crate, apples, tile` still accepted) |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms: colour, shape (= cookie), size, number (= plate / n / berries: digits, "ba quả dâu", "ba quả", "three berries"), home ("trong rung", "the woods", "dessert"→desert, "xa mạc"), animal (= guest: "rabbit", "con hươu", "cú mèo", "gau meo"), obj ("teacup", "cái chén", "ấm", "bánh kem"), letter, parity, sum / diff |
| `initial(lang, kind, value)` / `initial(lang, thing)` / `bareWord` / `initialOf` | initials (above) |
| `talkWrong(lang, choice, talk?)` / `talkWrong(lang, kind, value, talk?)` | "It is blue! Good try!", "There are three berries! Good try!" (count), "The penguin lives on the ice! Good try!" (home + `talk.show.animal`), "Bạn ấy sống trong rừng đó! Bé cố gắng lắm!" |
| `speech(lang, text)` | TTS text: letter names, + − =, "…" → ", ", "NOT" → "not", vi "chữ B" → "chữ bờ"; "Moka" unchanged |
| helpers / constants | `homeOf, setChild, has, keys, raw, kindValue, numberName, stripMarks`; `langs, TOPICS, COLORS, SHAPES, OBJECTS, ANIMALS (= GUESTS), HOMES, ANIMAL_HOME, RULE_KINDS, MEMBER_KINDS ['obj','cookie','plate','card','guest'], PROMPTS, PARAMS, NAME_TABLE, LETTER_VI, MAX_COUNT` |

Rule kinds `color, shape, size, n, animal, home, letter, lower, initial, sum, diff, parity` (aliases count / number → n,
**forest → home**, add → sum, sub → diff, oddeven → parity; missing home value = 'forest').

### 1.1 Keys
- **ui.\***: every parade key kept (`title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings,
  holdForParents, age, years, language, name, namePlaceholder, sound, music, volume, quieter, louder, voice, mic, done, stars,
  chapter, allDone, welcome, micUnsupported, micDenied, voiceMissing, tapOrSay, listening, tapBo, tapHint, doorHint, skip,
  gallery, langName.*`) + new `ui.tapMoka`. `ui.tapBo` (same text as `tapMoka`) and `ui.doorHint` ("Tap the glowing one") are
  kept only for compatibility — use `ui.tapMoka`.
- **topic.\***: Colourful Tea Things / Đồ trà sắc màu, Cookie Shapes / Bánh quy đủ hình, Big and Little / To và nhỏ, Berry
  Counting / Cùng đếm dâu, Forest Friends / Bạn thú trong rừng, Letter Cards / Thẻ chữ cái, lower, initial, add, sub, oddeven.
- **weather.0..3** (first wording canonical): "What a sunny day for tea!", "Whoosh, a breezy day!", "Pitter-patter, it’s
  raining!", "Look, a rainbow!" / "Trời nắng đẹp quá, mình uống trà nào!", "Vù vù, gió thổi mát quá!", "Tí tách, tí tách, trời
  mưa rồi!", "Nhìn kìa, cầu vồng!".
- **Prompts** (3 wordings + `.first`): `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape}`, `p.size`, `p.sizeBig`,
  `p.count {n}`, `p.animal {animal}`, **`p.forest`**, `p.letters {letter}`, `p.lower {letter}`, `p.initial {letter}`,
  `p.add {n}`, `p.sub {n}`, `p.oddeven {parity}`; `p.any`.
- **Lines**: `right.*`, `countOthers`, `wrong.*`, `wrong.hint`, `lantern`, `cheers`, `garland`, `enter`, `praise`,
  `great {child}`, `party`, `hint`, `idle {child}`, `moka.poke`, `surprise.{ladybug,butterfly,snail,fairies}`,
  `critter.{ladybug,butterfly,snail,fairies}`, `session.done {stars}`, `count.0..20`.
- **Talk**: `talk.intro, talk.right`, `talk.colors / colorsAny / colorsWhich`, `talk.shapes / shapesAny / shapes5`,
  `talk.size / sizeAny / sizeWhich`, `talk.count` ("How many berries?"), `talk.animals | talk.forest | talk.home {animal}` →
  `talk.homeAny`, `talk.who`, `talk.letters`, `talk.lower`, `talk.initial`, `talk.add / sub {a, b}`, `talk.calc`,
  `talk.oddeven`; `talk.wrong(.a, .animal, .size, .letter, .small, .number, .berries, .home, .place, .any)`.
- **Removed / renamed** (parade only): `woof`, `gate`, `gateShort`, `door`, `march`, `bye`, `surprise.chick`, `chick.tap`,
  `surprise.rooster`, `rooster.tap`, `surprise.fireflies`, `firefly.tap`; `bo.poke` → **`moka.poke`**; `p.farm` →
  **`p.forest`**; `talk.wrong.apples` → **`talk.wrong.berries`**; param `{apples}` → **`{berries}`**.

## 2. World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (proven in the sister games): *prompts are protected* (`speakPrompt`: guard until the prompt has been spoken —
from its `onStart` 600 ms + 95 ms × chars); *the wrong line interrupts* unless the prompt is still protected (then queue);
*the right line always cuts the prompt* — the question has just been answered, so main lifts the guard (`promptUntil = 0`)
before the instant feedback (qa_playtest P2-5: the code's behaviour is the intended one); *the wrong line is protected the same way*; *the count run is never cut* (queued, protected; the world's `count`
events light the berries while it is said); *praise / cheers / lantern queue and are droppable, the hint is priority*; skip a
new praise if one started < 1.2 s ago. **Never the same words twice in a row**: `T()` re-rolls a key's variant; the composed
wrong / wrong-hint line is re-composed (≤ 3 ×) while it equals the last spoken line; the idle line re-rolls its `idle` prefix
(the question part stays word for word). **The child's name** (when set): `praise` / `great` use a `{child}` variant ≈ 1 in 3,
`ui.welcome` / `session.done` always (`CHILD_SHARE`, i18n.js). The long `.first` question only in a chapter's round 0; no line at `roundDone`.
**A question is repeated only while it can be answered** (`world.interactive`). Speech is log-only for `speed > 1`.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+weather)` | interrupt, weather queued |
| `round {round, surprise}` | bubble `t('enter')` ("Here come the tea things!"), not spoken | — |
| `land {id, i, x, y}` | — (plop + table thunk) | no line |
| `ask {promptKey, params, first}` | `ask(lang, promptKey, params, {first: first && round === 0})`; bubble + voice; remember for `pokeMoka` / `idle` | **protected prompt** (`priority: true`) |
| `right {id, thing, count?, home?, lantern}` | `sayRight(lang, e + {topic, promptKey, params, rule})` (plates: the count run; guests: "…lives on the ice.") | interrupt — **cuts the prompt** (the guard is lifted: answered); count run queued + protected |
| `fairyArrive`, `dust` | — (fairy chime, sparkle) | no line |
| `count {id, i}` | — (rising "pip"; do **not** also speak `sayCount(i)`) | — |
| `lantern {i, color}` | optional `t('lantern')` **only** in the chapter's round 0 or if nothing is speaking — never cuts the right line | queue, droppable |
| `wrong {id, got, want, streak}` | `sayWrong(lang, e + {thing: world.memberById(e.id).thing, topic, promptKey, params, rule})`; the miss that brings the hint → `sayWrongHint`; ≤ 1 wrong line per 1.5 s | interrupt unless protected; then **protected** |
| `wiggle` (same wrong thing again < 1 s) | — (wobble sound) | no line |
| `soft {x, y}` | — (dust sparkle) | no line |
| `hint {id}` | nothing if the wrong line already pointed at it; else `t('hint')` | **priority** |
| `idle {n}` | `t('idle') + ' ' + currentPrompt` while `n ≤ 4`; `n ≥ 5` → auto-pause (the world restarts n at every touch, so a playing child is never paused) | queue |
| `pokeMoka` | interactive: repeat the prompt (> 3 s after it was asked, not while still spoken); busy (enter / rise / chime): `t('moka.poke')` **only when nothing is speaking** | interrupt (prompt), queue (giggle) |
| `roundDone {round, stars, misses}` | **no line** | — |
| `chime {i, n}` | — (rising bell notes) | no line |
| `cheers {x, y}` | `t('cheers')` ("Cheers!" / "Cụng ly nào!") only if nothing is speaking; ONE praise `t('great')` (3★) / `t('praise')` only after a round with a miss or in the chapter's last round, queued after it | queue, droppable |
| `poof {id}` | — (sparkly burst) | no line |
| `garlandFull` | `t('garland')` ("All the lanterns are glowing!") | queue |
| `critter {kind}` | `t('surprise.'+kind)` | queue, never over a protected prompt |
| `critterTap {kind}` | `t('critter.'+kind)` (≤ 1 per 2 s) | interrupt only when no prompt is protected |
| pause → resume | play: the prompt; rise / count: the right line again (plates: the plate's name only); Talk: the question while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))`; **choice taps are ignored until this line has started + 1 s** (≤ 8 s if it never starts; the world also locks the first 1 s) | queued after the praise; protected |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` | interrupt |
| `levelDone` | `t('great')` | queue, then **protected** (the next chapter's name queues behind it — VI talkResult + great can outlast levelDoneTime) |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | interrupt, then queue |

## 3. Voice (`FT.Voice`) — the proven engine
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, **`setVolume(u.volume)`**
(main passes the settings volume in `applyAudio()`), `setSpeed(n)` / `getSpeed()` (n > 1 → **log only**, `say` resolves
`{spoken:false, reason:'speed'}`; `init` reads `?speed=`), `say(text, {interrupt, priority, rate, pitch, lang})`,
`sayKey(key, params, opts)` (promise `.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`, `voiceName(lang)`,
`onStart(display)` / `onEnd` (Moka's talk frame + music ducking), `onVoicesChanged(fn)`, `log` (+ `FT.debug.voiceLog`, every
line incl. muted / test speed), `spoken(lang, text)`, `RATE` **0.9** / `PITCH` **1.1** (a gentle bear cub: a little lower than
the puppy's 1.2; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped; non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s — the
  ~15 s cut-off); page hidden → stop; `voiceschanged` + polling (iOS fills the list late). Before `unlock()` only the newest line.
- Recognition: fresh recognizer per `listen()`, `maxAlternatives 5`, interim results; fuzzy matcher (exact tokens, no-diacritic
  tokens, number words → digits, edit distance 1–2 for longer words, ambiguous → no match, interim matches wait 450 ms). The mic
  button is hidden when `!canListen()` (unsupported, iOS Home-Screen app, or `not-allowed` this session).

## 4. iOS / Safari findings (re-checked 16 Nov 2026)
- **Audio session**: Web Audio is on the ambient channel (muted by the side switch) unless `navigator.audioSession.type =
  'playback'` (Safari 16.4+) — `Audio.unlock()` sets it; while listening `voice.js` switches to `'play-and-record'` and back.
- **First utterance inside a gesture**: `unlock()` speaks a silent `' '`; a `not-allowed` line is re-spoken on the next unlock;
  lines queued before the first tap are re-timestamped.
- **Voices**: Vietnamese "Linh" is built into iOS/iPadOS and set by name. iOS 26 still ignores the voice chosen in Spoken
  Content for speech APIs, and downloaded Enhanced voices are often missing from `getVoices()` (since iOS 18) — never rely on
  the default voice. Parents: Settings › Accessibility › Spoken Content › Voices › Vietnamese; `hasVoice('vi') === false` →
  `ui.voiceMissing`.
- **Recognition** (`webkitSpeechRecognition`) needs Siri & Dictation, usually a network, and is missing in Home-Screen mode.
  Safari iOS `interimResults` behaviour is inconsistent (interim results may be final-looking or arrive only at the end) — we
  accept a match from either and always resolve on a timeout. Recognition after audio playback can stop firing on the second
  cycle (reported 2025–2026): a fresh recognizer per `listen()`, `V.stop()` before listening, no `<audio>` elements. `vi-VN`
  transcripts often lack tones ("mầu đổ", "trong rung") — matched on stripped forms. Tap answers always work.
- After backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on return. iPadOS desktop UA detected via
  `MacIntel` + `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4).
Sources: Apple Developer Forums [804648](https://developer.apple.com/forums/thread/804648) (iOS 26 voice regression),
[775699](https://developer.apple.com/forums/thread/775699) (interimResults on Safari iOS),
[764438](https://developer.apple.com/forums/thread/764438) (voices missing since iOS 18);
[SpeechRecognition + playback loop on iOS Safari](https://chat.skool.com/quantum-quill-lyceum-1116/ios-safari-speechrecognition-audio-playback-loop-breaks-after-first-cycle);
[iOS Safari Web Speech API bug notes](https://www.technetexperts.com/ios-safari-web-speech-api-bug-fix/); MDN `AudioSession.type`.

## 5. Input (`FT.Input`) — one-finger TAP (a press that slides onto a thing within 0.25 s counts)
```js
const detach = FT.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y), // first contact judged at once
  move:   (x, y, ev) => world.pointerMove(x, y), // every move of that finger, in order (slide-on)
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: two NUMBERS in logical px, then the raw event — never a point object.** One active pointer (extra fingers ignored;
a stuck pointer is recovered: new primary touch, missing touch, silence ≥ 6 s); `down` synchronous inside `pointerdown`
(`touch-action: none`, `preventDefault`, pointer capture); `up` exactly once (also over the HUD); `pointercancel` /
lost capture / blur → `cancel()` once. Targets `button, .screen, #hud, .no-game-input` skipped. Touch + mouse fallback.
`kidProof()` blocks pinch, double-tap zoom, callout / selection, rubber-band, context menu, Ctrl/⌘ zoom and refresh keys.
`holdButton(el, 2000, onDone, onProgress)` → `off()`: the parent gate (a quick tap does nothing).

## 6. Adding a thing / a language
- New guest: `ANIMALS`, `ANIMAL_HOME`, `NAMES.*.animal | word`, `WORDS.*.animal`; new tea thing: `OBJECTS`, `NAMES.*.obj |
  objWord`, `WORDS.*.obj`; new home: `HOMES`, `NAMES.*.home | homeAt`, `WORDS.*.home`; update the test's hard-coded lists.
- New language: `LANGS`, every `NAMES[xx]`, `BERRY`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, a complete `STR[xx]` (same keys
  and params — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`.
