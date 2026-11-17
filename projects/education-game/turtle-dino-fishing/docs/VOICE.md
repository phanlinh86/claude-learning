# Tibo's Dino Lake Fishing — Voice, language and input

Files: `game/js/i18n.js` (`TL.I18N`), `game/js/voice.js` (`TL.Voice`), `game/js/input.js` (`TL.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 64 000 checks, self-contained: the DESIGN §5.1 value lists are hard-coded in the
test). It checks: the same keys **and the same `{params}`** in en / vi, no empty strings, every `ui.*` / `talk.*` key that
`index.html` / `ui.js` use, Vietnamese diacritics in every VI string and a warm "Bé ơi, … nhé!" wording per prompt, a
negative-word ban, tidy rendering of every key (no `{x}`, "an orange fish", no "màu màu" / "con cá con cá", a capital after a
stop, with and without the child's name), 3 wordings + a `.first` form for every prompt × every value, DESIGN example lines
word for word, every name kind × value, `initial()` for every guest in both languages, `words()` (name + no-diacritic + digit
forms; no form shared by two values) matched back by the matcher, a sweep of ≈ 6 500 rule × member × wording combinations
(the wrong line must name **what was tapped** and **the goal**), the count run, Talk lines + `talkWrong`, the TTS text, the
input layer (fake DOM), the parent gate, the voice queue / interrupt / unlock / volume / speed with a fake `speechSynthesis`,
the recognizer. When the fishing `content.js` is present (it is) it also renders the ask (+ first form), the right line and
every wrong line of 200 `makeRound` rounds (ages 3–7, EN + VI) and every `makeTalk` question / choice.

## 0. Wording principles (Tibo)
- **Tibo** is a cheerful baby turtle in a straw sun hat. EN "Tibo"; VI lines "Tibo", titles **"Rùa Tibo"**. Title "Tibo’s Dino
  Lake Fishing" / "Rùa Tibo Câu Cá Hồ Khủng Long"; logo lines "Tibo’s" / "Dino Lake Fishing", "Rùa Tibo" / "Câu Cá Hồ Khủng Long".
- **TTS of "Tibo"**: EN as written (read /ˈtiːboʊ/, like "TiVo"); VI `speech()` sends **"Ti Bô"** (two Vietnamese syllables —
  a vi-VN voice may otherwise spell an unknown token). Display text keeps "Tibo". Constant `I18N.TIBO_VI`.
- **The question is "catch the X"** — exactly one target ("Catch the red fish!" / "Bé ơi, câu con cá màu đỏ nhé!"). Banned
  (tested): no / nope / wrong / incorrect / bad / fail / mistake / oops / sorry / "no!" and sai / sai rồi / dở / tệ / hỏng /
  không đúng / chưa đúng / trật / nhầm / hư.
- **Fish (VI classifiers)**: "con cá màu đỏ", "con cá có hình ngôi sao", "con cá có ba chấm", "con cá to / con cá nhỏ", "con cá
  có chữ B", "con cá có chữ b thường", "con cá có số bảy", "con cá có 3 + 2". EN: "the red fish", "the fish with the star",
  "the fish with three spots", "the little fish", "the fish with letter B / small b / number seven / 3 + 2".
  Spots: EN spot / spots, VI "chấm". VI colours always carry "màu" (`name('vi','color','red')` = "màu đỏ"); VI shapes in lines
  are "hình …" (`shapeH`).
- **Bubble friends (VI)**: con thỏ, con cáo, con nai, con sóc, con cú, con gấu mèo, con chuột, con nhím, chim cánh cụt, con cua,
  con cá vàng, con lạc đà, con sư tử. Homes biển, xứ băng, rừng, sa mạc, đồng cỏ châu Phi. `homeAt` carries the preposition:
  EN "in the sea / on the ice / in the forest / in the desert / on the savanna", VI "dưới biển / ở xứ băng / trong rừng / ở sa
  mạc / ở đồng cỏ châu Phi" → "Who lives in the sea?" / "Bạn nào sống dưới biển nhỉ?".
- **Right lines** name the caught one ("A red fish! Well done!"; homes: "The crab! The crab lives in the sea."; count: "You
  caught it! Let’s count the spots!" — the count run follows). **Wrong lines** name what was tapped kindly, then the goal
  ("That one is a blue fish. Let’s find the red fish!", "That’s the fox. The fox lives in the forest. Who lives in the sea?").
- **Child's name**: `setChild(name)`; with an empty name every `{child}` variant is skipped, "bé {child}" → "bé".
- **Initials (ages 6–7, bubbles)**: first letter of the bare noun (no classifier), diacritics stripped. EN bunny B, fox F, deer
  D, squirrel S, owl O, raccoon R, mouse M, hedgehog H, penguin P, crab C, goldfish G, camel C, lion L. VI thỏ T, cáo C, nai N,
  sóc S, cú C, gấu mèo G, chuột C, nhím N, chim cánh cụt C, cua C, cá vàng C, lạc đà L, sư tử S. The right line always says the
  word's real initial in the current language.
- `ANIMAL_HOME.goldfish = 'sea'` (DESIGN TL.GUESTS); content.js keeps the goldfish out of "who lives in the sea?" rounds.

## 1. API (`TL.I18N`) — for main.js
All helpers never throw and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function, or Math.random).
`e` for `sayRight` / `sayWrong` = the world event **plus** `{ topic: world.topic, promptKey: round.promptKey, params:
round.params, rule: round.rule }` (exactly what the old `ev2(e)` built). `right` carries `thing`; for `wrong` add
`world.memberById(e.id).thing` (else it is rebuilt from `e.got {nameKind, nameValue}`); `e.want` also works as the rule.
`rule = {kind, value}` describes the TARGET (kinds `color, shape, size ('big'|'small'), n, animal, home, letter, lower, initial,
sum, diff, parity`; aliases count / number / spots → n, add → sum, sub → diff, oddeven → parity, colors → color …). A missing
rule is derived from `promptKey` / `topic` + `params`. Sum / diff take `{a, b}` from `params` (or `rule.a/b`, or an
expression value "3+2").

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | the line (random variant). Raw params are named: `{color:'red'}`, `{shape:'star'}`, `{big:false}` / `{size:'small'}` → `{size}` "little", `{animal:'fox'}` (+ `{word}`), `{home:'ice'}` → "on the ice", `{parity:'odd'}`, `{n:3}` → `{num}` "three" + `{spots}` "spots", `{letter:'B'}` → + `{lower}` "b", `{a, b}` or `{expr:'3+2'}`, `{thing:{…}}` → its phrase |
| `ask(lang, promptKey, params, {first, rng})` | the question; `first:true` → the long first-time form that teaches the mechanic ("Tibo wants to catch a fish! Tap the red fish, and Tibo will catch it!"). Missing param → `p.any`; `p.add/sub` without `{a,b}` → `p.number`; old keys `p.colors, p.shapes, p.shapes5, p.sizeBig, p.letters, p.forest …` are aliased |
| `sayRight(lang, e, rng?)` | per rule kind (table above); count → `right.n` ("You caught it! Let’s count the spots!") |
| `sayWrong(lang, e, rng?)` / `sayWrongHint(lang, e, rng?)` | gentle miss line / the miss that brings the hint ("That’s the blue fish. Look at the glowing one!") |
| `sayCount(lang, i)` / `sayCountRun(lang, n)` | "One!" … "Twenty!" / **"1, 2, 3 — three spots!"** ("1, 2, 3 — ba chấm!"; TTS: "1, 2, 3, three spots!") |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the red fish", "con cá có ba chấm", "the little red fish", "chim cánh cụt"; Talk icons colour / number / home / size / letter. opts `{art:'the'|'a'|null, color, size, markColor}` |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapeH, animal, guest, word, who, home, homeAt, size, parity, number / n / count, spots, letter, lower, initial, sum, diff, text, fish / thing` (value = a thing) |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms: colour ("red fish", "con cá màu đỏ"), shape, size ("the little one", "con cá to"), number (digits, "ba chấm", "three spots", "số ba"), home ("trong rung", "the woods", "dessert"→desert, "xa mạc"), animal ("rabbit", "con hươu", "cú mèo", "gau meo"), letter, parity, sum / diff |
| `kindValue(choice)` | a Talk choice → `[kind, value]` (`nameKind` wins; a parity fish showing "16" → `['number', 16]`) |
| `initial(lang, kind, value)` / `initial(lang, thing)` / `bareWord` / `initialOf` | initials (above) |
| `talkWrong(lang, choice, talk?)` / `talkWrong(lang, kind, value, talk?)` | "It is blue! Good try!", "There are three spots! Good try!" (count topic), "The penguin lives on the ice! Good try!" (home + `talk.show`), "Bạn ấy sống trong rừng đó! Bé cố gắng lắm!" |
| `speech(lang, text)` | TTS text: letter names (en "letter bee", vi "chữ bờ"), + − = → plus / minus / equals (cộng / trừ / bằng), "…" and " — " → ", ", vi "Tibo" → "Ti Bô" |
| helpers / constants | `homeOf, ruleOf, thingFromName, spotsWord, setChild, has, keys, raw, numberName, stripMarks`; `langs, TOPICS, COLORS, SHAPES, ANIMALS (= GUESTS), HOMES, ANIMAL_HOME, RULE_KINDS, MEMBER_KINDS ['fish','bubble'], PROMPTS (raw params), PROMPT_ALIAS, PARAMS (derived needs), NAME_TABLE, LETTER_VI, MAX_COUNT, TIBO_VI` |

### 1.1 Keys (192 per language, identical sets and params)
- **ui.\***: `title, logo1, logo2, subtitle, tagline, play, playAgain, home, paused, resume, settings, holdForParents, age, years,
  language, name, namePlaceholder, sound, music, volume, quieter, louder, voice, mic, done, stars, chapter {n}, allDone {stars},
  welcome[] {child}, micUnsupported, micDenied, voiceMissing, tapOrSay, listening, tapTibo, tapHint, skip, gallery,
  langName.en, langName.vi`.
- **topic.\***: Colourful Fish / Cá sắc màu, Fish Shapes / Cá mang hình, Big Fish, Little Fish / Cá to, cá nhỏ, Counting
  Spots / Cùng đếm chấm, Bubble Friends / Bạn thú trong bong bóng, Letter Fish / Cá chữ cái, lower, initial, add, sub, oddeven.
- **weather.0..3** (first wording canonical): "Good morning, lake!", "The sun is high — sparkly water!", "What a pretty
  sunset!", "Look at the stars!" / "Chào buổi sáng, hồ ơi!", "Mặt trời lên cao rồi, nước lấp lánh quá!", "Hoàng hôn đẹp
  quá!", "Bé nhìn các ngôi sao kìa!".
- **Prompts** (3 wordings + `.first`): `p.color {color}`, `p.shape {shape}`, `p.size {big}`, `p.count {n}`, `p.animal {animal}`,
  `p.home {home}`, `p.letter {letter}`, `p.lower {letter}` (the capital; fish carry small letters), `p.initial {letter}`,
  `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}`; fallbacks `p.number {n}`, `p.any`.
- **Round lines**: `right.{color, shape, size, n, animal, home, letter, lower, initial, sum, diff, number, parity, any}`,
  `wrong.{color, shape, size, n, animal, home, letter, lower, initial, sum, diff, number, parity, hint, any}`, `count.run`,
  `count.0..20`, `cast[]` ("Swish!" / "Vút!"), `bite[]` ("Got it!" / "Dính rồi!"), `release[]` ("Bye bye, little fish!" /
  "Tạm biệt cá nhỏ!"), `releaseFriend[]` (bubbles), `lily[]`, `pond[]` ("Four lilies! The lake is so pretty!"), `joy[]`,
  `enter[]` ("Here come the fish!").
- **Others**: `praise[]`, `great[]` (both with `{child}` variants), `party[]`, `hint[]`, `idle[]` (`{child}`), `tibo.poke[]`,
  `surprise.{ptero, bronto, frog, fireflies}`, `critter.{ptero, bronto, frog, fireflies}`, `session.done[] {stars}`.
- **Talk**: `talk.intro, talk.right[]`, `talk.colors` ("What colour is this fish?") / `colorsAny` / `colorsWhich {color}`,
  `talk.shapes {shape}` ("Which fish has the star?") / `shapesAny`, `talk.size {size}` / `sizeAny`, `talk.count` ("How many
  spots?") / `countAny`, `talk.animals | talk.home {animal}` ("Where does the penguin live?") → `talk.homeAny`, `talk.who`
  ("Who is this?"), `talk.letters {letter}` / `lettersAny`, `talk.lower {letter}` / `lowerAny`, `talk.initial {word}` (or
  `{nameKind, nameValue}` of the shown animal) / `initialAny`, `talk.add / sub {a, b}`, `talk.calc`, `talk.oddeven {parity}` /
  `oddevenAny`; `talk.wrong(.a, .animal, .size, .letter, .small, .number, .spots, .home, .place, .any)`.
- **Renamed from the tea party (main.js must follow)**: `lantern` → **`lily`**, `garland` → **`pond`**, `cheers` → removed (the
  joy jumps carry the praise), `moka.poke` → **`tibo.poke`**, `ui.tapMoka / tapBo / doorHint` → **`ui.tapTibo`**,
  `surprise./critter.{ladybug, butterfly, snail, fairies}` → `{ptero, bronto, frog, fireflies}`, `countOthers` removed,
  `talk.wrong.berries` → **`talk.wrong.spots`**, `{berries}` → **`{spots}`**, `p.colors / p.shapes / p.forest …` → singular keys
  (aliased). main's count detection: `rule.kind === 'n'` (or `thing.mark && thing.mark.n != null`), never `kind === 'plate'`.

## 2. World event → line (DESIGN §5.2) — what main.js should do
**Speech policy** (proven in the sister games): *prompts are protected* (`speakPrompt`: guard until the prompt has been spoken —
from its `onStart` 600 ms + 95 ms × chars); *the wrong line interrupts* unless the prompt is still protected (then it queues),
and is then protected the same way; *the right line always cuts the prompt* — the question has just been answered, so main
lifts the guard (`promptUntil = 0`) before it; **the count run is never cut** (queued with `priority`, protected for
`900 + 650 × n` ms; the world's `count` events light the spots while it is said); *cast / bite / release / lily / joy / praise
are droppable*: spoken only when nothing is speaking (never over the right line, the count run or a prompt); the hint is
priority; skip a new praise if one started < 1.2 s ago. **Never the same words twice in a row**: `T()` re-rolls a variant; the
wrong line is re-composed (≤ 3 ×) while it equals the last spoken line; the idle line re-rolls its prefix (the question stays
word for word). **The child's name**: `praise` / `great` use a `{child}` variant ≈ 1 in 3, `ui.welcome` / `session.done`
always. The long `.first` question only in a chapter's round 0. **A question is repeated only while it can be answered**
(`world.interactive`). Speech is log-only for `speed > 1`.

Typical catch: `right` (line ≈ 2 s) → `plop` → `bite` → reel → `splash` → show (`count` × n) → `roundDone` → `dive` → `lily` →
`joy` × k → `leave` → next `enterSwim` / `ask`. The right line covers cast + reel; the count run covers the show; the lily /
praise fit in the release + joy.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+weather)` | interrupt (or priority-queue behind a protected `great`), weather queued |
| `round {round, surprise}` | bubble `t('enter')` ("Here come the fish!"), **not spoken** | — |
| `enterSwim {id}` | — (water swish) | no line |
| `ask {promptKey, params, first}` | `ask(lang, promptKey, params, {first: first && round === 0})`; bubble + voice; remember the text for `pokeTibo` / `idle` / resume | **protected prompt** (`priority: true`) |
| `right {id, thing, x, y}` | `sayRight(lang, ev2(e))` ("A red fish! Well done!", "The crab! The crab lives in the sea.", count: "You caught it! Let’s count the spots!") | `promptUntil = 0`, **interrupt**, then protect(lineMs) |
| `plop {x, y}` | — (pitched drop + ripple). `t('cast')` only if nothing is speaking (in practice never: the right line is on) | droppable |
| `bite {id}` | — (nibble pips). `t('bite')` only if nothing is speaking | droppable |
| `splash {x, y}` | — (splash sfx) | no line |
| `count {id, i, x, y}` | `i === 1` (first spot): speak `sayCountRun(lang, n)` with n = the caught fish's `mark.n` (or `rule.value`); every `count`: rising "pip" — do **not** also speak `sayCount(i)` | **queued + priority + protected** (`promptUntil = now + 900 + 650 × n`), never cut |
| `home {home, x, y}` | — (badge chime; the right line already said where it lives) | no line |
| `roundDone {round, stars, misses}` | **no line** | — |
| `dive {x, y}` | `t(thing.kind === 'bubble' ? 'releaseFriend' : 'release')` only if nothing is speaking and no prompt is protected | droppable |
| `lily {i, x, y, color}` | `t('lily')` **only** in the chapter's round 0 or if nothing is speaking — never cuts the right line / count run | queue, droppable |
| `joy {i, n, id}` | `i === 0`: ONE praise — `t('great')` (3★) / `t('praise')` — only after a round with a miss or in the chapter's last round, else `t('joy')` if nothing is speaking; later `joy` events: rising notes only | queue, droppable, ≥ 1.2 s since the last praise |
| `pondFull` | `t('pond')` ("Four lilies! The lake is so pretty!") | queue |
| `wrong {id, got, want, streak}` | `sayWrong(lang, ev2(e) + {thing: memberById(e.id).thing})`; the miss that brings the hint (`e.hint`) → `sayWrongHint`; ≤ 1 wrong line per 1.5 s | interrupt unless the prompt is protected; then **protected** |
| `wiggle` (same wrong fish again < 1 s) | — (bubble pops) | no line |
| `soft {x, y}` | — (ripple / bubble puff) | no line |
| `hint {id}` | nothing if the wrong line already pointed at it; else `t('hint')` | **priority** |
| `idle {n}` | `t('idle') + ' ' + currentPrompt` while `n ≤ 4`; `n ≥ 5` → auto-pause | queue |
| `pokeTibo` | interactive: repeat the prompt (> 3 s after it was asked, not while still spoken); busy (enter / cast / reel / show / joy): `t('tibo.poke')` **only when nothing is speaking** | interrupt (prompt), queue (giggle) |
| `critter {kind}` | `t('surprise.'+kind)` (ptero / bronto / frog / fireflies) | queue, never over a protected prompt |
| `critterTap {kind}` | `t('critter.'+kind)` (≤ 1 per 2 s) | interrupt only when no prompt is protected |
| pause → resume | play: the prompt; show (count): the count run again; cast / reel: the right line again; Talk: the question while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices = `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))`; **choice taps ignored until this line has started + 1 s** (≤ 8 s if it never starts) | queued after the praise; protected |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3), glow the answer from n ≥ 2 | interrupt |
| `talkResult {right, id}` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` | interrupt |
| `levelDone` | `t('great')` | queue, then **protected** (the next chapter's name queues behind it) |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | interrupt (if allowed), then queue |

## 3. Voice (`TL.Voice`) — the proven engine (unchanged except the pitch)
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST touchend/click), `setLang`, `setEnabled`, **`setVolume(u.volume)`**
(main passes the settings volume in `applyAudio()`), `setSpeed(n)` / `getSpeed()` (n > 1 → **log only**, `say` resolves
`{spoken:false, reason:'speed'}`; `init` reads `?speed=`), `say(text, {interrupt, priority, rate, pitch, lang})` → Promise
`{spoken, reason}`, `sayKey(key, params, opts)` (promise `.text`), `stop()`, `dropQueued()`, `isSpeaking()`, `hasVoice(lang)`,
`voiceName(lang)`, `onStart(display)` / `onEnd` (Tibo's talk frame + music ducking), `onVoicesChanged(fn)`, `log` (+
`TL.debug.voiceLog`, every line incl. muted / test speed), `spoken(lang, text)`, `RATE` **0.9** / `PITCH` **1.2** (a cheerful
baby turtle; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears Vietnamese tones).
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced/Premium +12; novelty voices (Fred, Albert, Zarvox …) −60.
- Queue: 1 speaking + ≤ 2 waiting (oldest non-priority dropped; non-priority lines > 5 s old skipped); `interrupt` flushes +
  cancels and speaks after 50–90 ms; watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s — the
  ~15 s cut-off); page hidden → stop; `voiceschanged` + polling (iOS fills the list late). Before `unlock()` only the newest
  line is kept (re-timestamped so a slow first tap does not make it stale).
- Recognition: fresh recognizer per `listen({lang, choices, timeoutMs})`, `maxAlternatives 5`, interim results; fuzzy matcher
  (exact tokens, no-diacritic tokens, number words → digits, edit distance 1–2 for longer words, ambiguous → no match, interim
  matches wait 450 ms); `canListen()` false when unsupported, iOS Home-Screen app, or `not-allowed` this session (hide the mic).

## 4. iOS / Safari findings (from the 16 Nov 2026 check for Moka's Fairy Tea Party; not re-verified on a device today)
- **Audio session**: Web Audio is on the ambient channel (muted by the side switch) unless `navigator.audioSession.type =
  'playback'` (Safari 16.4+) — `Audio.unlock()` sets it; while listening `voice.js` switches to `'play-and-record'` and back.
- **First utterance inside a gesture**: `unlock()` speaks a silent `' '`; a `not-allowed` line is re-spoken on the next unlock.
- **Voices**: Vietnamese "Linh" is built into iOS/iPadOS and set by name. iOS 26 still ignores the voice chosen in Spoken
  Content for speech APIs, and downloaded Enhanced voices are often missing from `getVoices()` (since iOS 18) — never rely on
  the default voice. Parents: Settings › Accessibility › Spoken Content › Voices › Vietnamese; `hasVoice('vi') === false` →
  `ui.voiceMissing`.
- **Unknown names**: a vi-VN voice may spell a non-Vietnamese token letter by letter — hence "Tibo" → "Ti Bô" in TTS only.
  To verify on a real iPhone: Tibo lines in EN (Samantha) and VI (Linh), "chữ bờ", "1, 2, 3, ba chấm".
- **Recognition** (`webkitSpeechRecognition`) needs Siri & Dictation, usually a network, and is missing in Home-Screen mode.
  Safari iOS `interimResults` is inconsistent (interim results may look final or arrive only at the end) — a match from either
  is accepted and `listen()` always resolves on a timeout. Recognition after audio playback can stop firing on the second cycle:
  a fresh recognizer per `listen()`, `V.stop()` before listening, no `<audio>` elements. `vi-VN` transcripts often lack tones
  ("mầu đổ", "trong rung", "ba cham") — matched on stripped forms. Tap answers always work.
- After backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on return. iPadOS desktop UA detected via
  `MacIntel` + `maxTouchPoints > 1`. No regex look-behind anywhere (iOS < 16.4; tested).
Sources: Apple Developer Forums [804648](https://developer.apple.com/forums/thread/804648) (iOS 26 voice regression),
[775699](https://developer.apple.com/forums/thread/775699) (interimResults on Safari iOS),
[764438](https://developer.apple.com/forums/thread/764438) (voices missing since iOS 18); MDN `AudioSession.type`.

## 5. Input (`TL.Input`) — one-finger TAP on a moving fish (a press that slides onto a fish within 0.25 s counts)
```js
const detach = TL.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),   // CSS client px → logical world px
  down:   (x, y, ev) => world.pointerDown(x, y), // first contact judged at once (the world hit-tests now AND 0.12 s ago)
  move:   (x, y, ev) => world.pointerMove(x, y), // every move of that finger, in order (slide-on; fish slow near a finger)
  up:     (x, y, ev) => world.pointerUp(x, y),
  cancel: ()         => world.cancelDrag(),      // pointercancel, blur, hidden, rotation
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: two NUMBERS in logical px, then the raw event — never a point object.** One active pointer (extra fingers ignored;
a stuck pointer is recovered: new primary touch, missing touch, silence ≥ 6 s); `down` synchronous inside `pointerdown`
(`touch-action: none`, `preventDefault`, pointer capture) — important for moving targets: no tap delay; `up` exactly once
(also over the HUD); `pointercancel` / lost capture / blur → `cancel()` once. Targets `button, .screen, #hud, .no-game-input`
skipped. Touch + mouse fallback. `kidProof()` blocks pinch, double-tap zoom, callout / selection, rubber-band, context menu,
Ctrl/⌘ zoom and refresh keys. `holdButton(el, 2000, onDone, onProgress)` → `off()`: the parent gate (a quick tap does nothing).

## 6. Adding a thing / a language
- New guest: `ANIMALS`, `ANIMAL_HOME`, `NAMES.*.animal | word`, `WORDS.*.animal`; new home: `HOMES`, `NAMES.*.home | homeAt`,
  `WORDS.*.home`; new mark: `phrase()` fish suffix + `kvOf()`; update the test's hard-coded lists.
- New language: `LANGS`, every `NAMES[xx]`, `SPOT`, `FISH`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, a complete `STR[xx]` (same
  keys and params — tested), `CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`.
