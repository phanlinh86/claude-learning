# Lolo's Jungle Leaf Match — voice, language and input (`i18n.js`, `voice.js`, `input.js`)

Owner: voice & input engineer. Contract: `DESIGN.md` §7. Tests: `node tests/unit/i18n_voice.test.js` (≈ 54 700 checks:
every key in both languages with identical `{params}`, every animal / food / thing / colour / shape / number / letter has a
name and accepted spoken forms in both languages, no city/giraffe leftovers in the lines or the source, no negative words,
≤ 12 words per line, exact lines for every topic, real rounds and Talk questions from `content.js`, the "Lolo" → "Lô Lô"
rule, the EN/VI matcher, the voice queue with a fake `speechSynthesis`, the recognizer, input and the parent gate).
The engine (voice queue, iOS fixes, matcher, kid-proofing) is the proven one from Gigi's Peekaboo Windows; the wording is new.

## 0. Wording principles
- **Lolo** is a bright, giggly little monkey who sits on a mossy log, flips the jungle leaves with the child, backflips
  and swings on vines. Written **"Lolo"** in both languages (VI title "Khỉ Lolo", self-introduction "Mình là khỉ con
  Lolo"). Vietnamese TTS reads "Lolo" as one clipped syllable, so `Voice.spoken()` replaces the whole word `Lolo` with
  **"Lô Lô"** in the text sent to TTS — only in Vietnamese, never in the bubble, the log or `onStart/onEnd` (tested).
  VI lines never put "gì" right after the name ("Lolo gì…" would sound like "Lô Lô what").
- **Leaf vocabulary**: leaf / turn over / flip / pair / look again — vi **chiếc lá / lật / một đôi (cặp for letters) /
  xem lại**. Count leaves show round dots/berries: spoken **dots** — vi **chấm tròn** (the mic also takes "berries",
  "spots", "chấm", "hạt", "quả").
- **Short and concrete**: ≤ 12 words per line (match lines ≤ 14, VI mismatch ≤ 18 syllables), the key word last.
- **Never negative.** "A butterfly and a kite. Let's look again!" / "Con bướm và con diều. Mình xem lại nhé!". Banned in
  every non-UI line: no / not / wrong / bad / fail / incorrect / mistake / oops and sai / dở / tệ / hỏng / không đúng /
  chưa đúng / trật.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?", "giỏi quá!", "Măm măm!"; every noun with its
  classifier (con bướm, quả bóng bay, bông hoa, con diều, cái cốc, chiếc ủng, chiếc lá, con gấu trúc, củ cà rốt, cây tre);
  mass foods without one (mật ong, dưa hấu, phô mai). Colours carry "màu", shapes "hình". Friendly "Bạn gấu trúc…" when
  an animal is the subject of a food line. Variant lists: 5–8 entries with a `{child}` and a no-name form; prompts 3;
  critters / weather 2.

## 1. Names (`name(lang, kind, value)`) and accepted spoken forms (`words(lang, kind, value)`)
Every form is also accepted without diacritics (`gấu trúc` → `gau truc`); numbers also as digits.
| kind | id | EN | VI | also accepted by the mic |
|---|---|---|---|---|
| animal | panda | panda | con gấu trúc | panda bear · **gấu trúc**, gấu trúc con, bạn gấu trúc |
| | elephant | elephant | con voi | ellie, baby elephant · voi, voi con, chú voi |
| | rabbit | **bunny** | con thỏ | rabbit, bunny rabbit · thỏ, thỏ con, thỏ trắng |
| | squirrel | squirrel | con sóc | squirrels · sóc, sóc con, chú sóc |
| | bee | bee | con ong | bumblebee, honey bee · ong, ong mật |
| | bird | bird | con chim | birdie, robin, songbird · chim, chim sẻ, chim non |
| | hippo | hippo | con hà mã | hippopotamus · **hà mã**, hà mã con |
| | mouse | mouse | con chuột | mice, mousey · chuột, chuột con, chú chuột |
| food | bamboo | bamboo | cây tre | bamboo leaves · **tre, lá tre**, cành tre, măng (tre) |
| | peanut | peanuts | củ lạc | peanut, nuts · lạc, hạt lạc, **đậu phộng** (south) |
| | carrot | carrot | củ cà rốt | carrots · cà rốt |
| | acorn | acorn | hạt dẻ | acorns · quả sồi, hạt sồi, quả dẻ |
| | honey | honey | mật ong | honey pot · hũ / lọ mật ong, mật |
| | worm | worms | con sâu | worm, earthworm · sâu, con giun, giun |
| | watermelon | watermelon | dưa hấu | melon, water melon · quả / miếng dưa hấu, dưa |
| | cheese | cheese | phô mai | cheesy, cheddar · pho mát, phô mát |
| thing | butterfly | butterfly | con bướm | butterflies · bướm, bươm bướm |
| | balloon | balloon | quả bóng bay | · bóng bay, bong bóng, trái bong bóng |
| | flower | flower | bông hoa | daisy · hoa, đóa hoa |
| | kite | kite | con diều | · diều, cánh diều |
| | cup | cup | cái cốc | mug · cốc, cái ly, ly, cái tách (south) |
| | boot | boot | chiếc ủng | welly · ủng, đôi ủng, giày ủng |
Colours (`màu đỏ` …, "xanh" alone is ambiguous on purpose), shapes, sizes, numbers 0–20, letters (VI phonics: B "bờ", K
"ca", Y "i dài"), sums, parity: unchanged from Gigi. A colour leaf with a thing is named "a red butterfly" / "con bướm màu
đỏ"; the mic accepts the colour alone or the whole phrase. Initial-letter words (default `LL.WORDS`, content.js may
override): en panda P, elephant E, rabbit R, squirrel S, bee B, bird B, hippo H, mouse M; vi gấu trúc G, voi V, sóc S,
ong O, hà mã H (thỏ, chim, chuột skipped: th/ch are their own sounds in VI phonics).
Food lines use two derived params: `{friend}` = animal without classifier ("gấu trúc", en "panda"/"bunny") and `{meal}` =
what it loves (en "bamboo", "carrots", "acorns", "worms"; vi "ăn tre", "ăn cà rốt", bee "mật ong" → "Bạn ong thích mật
ong!"). Both are filled from `{animal}` / `{food}` automatically. A food leaf never names its animal (that is the puzzle).

## 2. Event → line table (what main.js says)
| world event | line | fields read / notes | speaking rule |
|---|---|---|---|
| `level` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+level)` | 0 morning "Good morning, jungle!" / "Chào buổi sáng, khu rừng!"; 1 noon "The sun is high — it's noon!"; 2 sunset "Look — the sun is setting!" / "Mặt trời lặn rồi kìa!"; 3 night "Good night, stars! The fireflies are out." / "Chúc ngủ ngon, các vì sao! Đom đóm ra chơi rồi." | chapter name **interrupts**; weather line spoken **only if Lolo is quiet** (else bubble only) |
| `round` | `t(e.promptKey, e.params)` — `p.<topic>`; `p.food` "Who eats what? Find each animal's favourite food!" / "Ai thích ăn gì? Bé tìm món ăn cho các bạn nhé!"; unknown → `p.any` "Find two leaves that match!" | `promptKey` | `speakPrompt(…, {priority})` = **protected** until spoken |
| `peek` | `t('peek')` "Look carefully!" / "Bé nhìn kỹ nhé!" | — | **only when Lolo is quiet** |
| `hide` | `t('hide')` "Now they turn back!" / "Lá lật lại rồi!" | — | **only when quiet** |
| `flip` (open 1) | `sayFlip(lang, e)` "A red butterfly!", "Bamboo!", "A carrot!", "An elephant!", "One, two, three dots!" | `nameKind, nameValue, face{kind,value,color,obj,shape,sprite,n,text,scale,parity,dots,animal}, size, topic` | interrupts only after the prompt (`canInterrupt()`) and never within ≈ 2.6 s of a match / mismatch line (it queues) |
| `flip` (open 2) | no line — the match / mismatch line names both leaves | — | — |
| `tap` (turned leaf tapped again) | `sayFlip` | as flip | ≥ 0.9 s apart |
| `clack` (leaf settles back) | no line — soft "fwip" SFX | — | — |
| `match` | `sayMatch(lang, e)` "Two red butterflies — a pair!", food "The panda loves bamboo!" / "Bạn gấu trúc thích ăn tre!", bee "Bạn ong thích mật ong!", "Three — one, two, three! A pair!" | `nameKind, nameValue, parity, word, animal, food, topic` + both leaves `nameKindA/nameValueA/faceA/sizeA` + `…B` (or `cardA/cardB`, `nameA/nameB`, `cards[]`) | **interrupts** (feedback); then **protected ≈ 2.6 s** — the next flip name queues |
| `mismatch` | `sayMismatch(lang, e)` "A butterfly and a kite. Let's look again!", food "A panda and a carrot. What does the panda love to eat?" / "Con gấu trúc và củ cà rốt. Con gấu trúc thích ăn gì nhỉ?" | the two leaves; without them a gentle `wrong[]` | interrupts only after the prompt; ≥ 0.3 s apart; then **protected ≈ 2.6 s** like match |
| `bloom` | no line (orchid "bloop-bloop"); `reward.bloom` "Orchids! Pop, pop!" / `reward.light` exist for a quiet moment | — | only when quiet |
| `hint` | `t('hint')` "Psst! Look at the glowing leaves!" | not for idle hints | queued |
| `idle` | `t('idle') + ' ' + currentPrompt()` "Tap a leaf to turn it over! …" | max 4 per round | queued |
| `cheer` (tree done) | `t('cheer')` "Every leaf is glowing!" / "Lá nào cũng sáng rồi!" | last round of a chapter: always; else only when quiet | **queued** after the last match line |
| `backflip` **(new)** | `t('backflip')` "A backflip! Ta-da!" / "Lộn nhào nè! Ta-đa!" | spoken on the `backflip` event | **only when Lolo is quiet** (else SFX only) |
| `scroll` / `swing {phase:'leap'}` **(new)** | `t('swing')` "Wheee! To the next tree!" / "Vút! Sang cây tiếp theo nào!" (`walk` = same lines, alias) | spoken **once per scroll, on `swing {phase:'leap'}`** | **only when Lolo is quiet** (else nothing), non-priority |
| `roundDone` | `t('great')` "Great job, {child}!" | say `cheer` OR `great`, not both | queued (praise is never cut: the count is the lesson) |
| `critter {action:'enter'}` | `sayCritter(lang, critter)` toucan "Kraa! A toucan came to visit!" / "Nhìn kìa! Bạn chim mỏ to đậu trên dây leo!"; frog "Ribbit! Here comes a frog!" / "Ộp ộp! Bạn ếch đến rồi!"; butterfly "Look! A butterfly is fluttering up!" / "Nhìn kìa! Bạn bướm đang bay lên!" | `critter` ∈ toucan / frog / butterfly | queued after the prompt |
| `critter {action:'tap'}` | `sayCritter(lang, critter, 'tap')` "Kraa! Bye bye, toucan!", "Ribbit! What a big jump!" / "Ộp ộp! Ếch nhảy cao quá!", "Whee! Look at it twirl!" | never a mistake | interrupts only after the prompt, and not over a speaking line |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)` | `talk.food` {animal} "What does the panda love to eat?" / "Con gấu trúc thích ăn gì nhỉ?" (no animal → `talk.foodAny`); `talk.colors` {obj or thing} "What colour is this butterfly?" / "Con bướm này màu gì nhỉ?"; `talk.animals` {animal} | priority, queued after praise |
| `talkResult` right / wrong | `t('talk.right')` / `talkWrong(lang, kind, value)` — food: "The panda loves bamboo! Good try!" / "Bạn gấu trúc thích ăn tre đó! Bé cố gắng lắm!" | answer choice `kind, value` | interrupts |
| `sessionDone` | `t('session.done', {stars})` "The whole jungle is glowing! 12 stars!" | `stars` | interrupts |
| tap on Lolo / the bubble | repeat `currentPrompt()` word for word | — | priority |

### 2.1 New / renamed keys and functions (for the lead)
- **Topic** `homes` → **`food`**: `topic.food`, `p.food`, `talk.food`, `talk.foodAny`, `flip.food`, `match.food`
  ({friend},{meal}), `mismatch.food` ({A},{B},{animal}), `talk.wrong.food` ({friend},{meal}). Removed: `topic.homes`,
  `p.homes`, `talk.homes`, `talk.homesAny`, `flip.home`, `match.home`, `mismatch.home`, `talk.wrong.home`.
- **Name kind** `home` → **`food`** (`name/words(lang, 'food', 'bamboo' | 'food_bamboo')`). `I18N.HOMES/HOME_OF` →
  `I18N.FOODS`, `I18N.FOOD_OF`, `I18N.ANIMAL_OF_FOOD`. Things: umbrella/car → butterfly/flower.
- **New line keys**: `swing[]` (scroll / vine swing), `backflip[]` (cheer backflip). `walk[]` kept as an alias of `swing`.
- **Critters**: `critter.toucan`, `critter.toucan.tap`, `critter.frog`, `critter.frog.tap`, `critter.butterfly`,
  `critter.butterfly.tap` (removed pigeon / bus / balloon and all `surprise.*`, `golden`, `ui.tapDee`).
  `sayCritter(lang, 'toucan'|'frog'|'butterfly', 'tap'?)`; an unknown type (e.g. an old `pigeon`) → a praise line.
- `weather.0..3` now morning / noon / sunset / night. Logo `ui.logo1/2` "Lolo's" / "Jungle Leaf Match", VI "Khỉ Lolo" /
  "Lật Lá Tìm Đôi"; `ui.title`, `ui.subtitle`, `ui.welcome` rewritten.
- main.js wiring still to do (lead): `case 'scroll'` (or `swing` with `phase === 'leap'`):
  `if (!LL.Voice.isSpeaking()) speak(T('swing'))`; `case 'backflip'`: `if (!LL.Voice.isSpeaking()) speak(T('backflip'))`;
  the critter sound map needs toucan / frog / butterfly entries (names as in audio.js); the `bus`/`pigeon` branches can go.
  Every other call (`t`, `name`, `words`, `sayFlip`, `sayMatch`, `sayMismatch`, `sayCritter`, `talkWrong`, `setChild`)
  is unchanged.

### 2.2 Speaking rules (survived the sister games' playtests)
1. **Feedback interrupts**: match, Talk right/wrong, session done and the chapter name cut whatever Lolo is saying.
2. **The prompt is protected** from the moment it is queued until it has been spoken (`speakPrompt()` →
   `promptUntil = Infinity` until the promise resolves); flip / mismatch / critter-tap lines queue instead of cutting it
   (`canInterrupt()`).
2b. **Feedback is protected too**: after a match / mismatch line starts, the next flip name waits ≈ 2.6 s (queues)
   instead of cutting the pair line.
3. **Round-done praise and hints queue** (never interrupt): otherwise the final pair line — the lesson — is never heard.
   Skip a new praise if one started < 1.2 s ago.
4. **peek / hide / cheer / swing (once per scroll, on `leap`) / backflip / the chapter weather line only when Lolo is quiet** (`!Voice.isSpeaking()`), never a backlog of
   decoration lines; the SFX carries the moment.
5. Queue: one speaking + ≤ 2 waiting; the oldest non-priority line is dropped; non-priority lines older than 5 s are
   skipped. The same leaf name is not repeated within 3 s; taps ≥ 0.9 s apart.
6. After 4 idle nudges Lolo stays quiet; the 5th idle pauses the game (nobody is there). Talk: re-ask every 12 s, glow
   the answer after the 2nd re-ask, stop after 3.
7. Speech is disabled at `speed > 1` (bot / tests): every line is still logged in `LL.Voice.log` / `LL.debug.voiceLog`.

## 3. Voice engine (`LL.Voice`)
`getVoices()` at init, on `voiceschanged`, and polled every 250 ms for 6 s (iOS fills the list late). Score: language
prefix · exact `en-US`/`vi-VN` +6 · preferred names (en Samantha, Nicky, Karen, Ava…, Google US English, Microsoft
Aria/Jenny; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An) · Enhanced/Premium/Natural +12 · Google off iOS +8 ·
local +3 · Apple novelty voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma…) −60.
Utterances: **rate 0.9, pitch 1.25** — a bright, giggly little monkey; above ~1.3 iOS voices get squeaky, rate < 0.85
smears Vietnamese tones. `volume` = `Voice.setVolume()` (follows the game's volume setting). `interrupt` flushes +
cancels and speaks after 50–90 ms (speak() right after cancel() is dropped on Safari/Chrome); `dropQueued()`; a watchdog
ends lines iOS never ends; Chrome desktop 10 s pause/resume keep-alive; hidden page → stop. Spoken text =
`Voice.spoken(lang, text)` = `I18N.speech` (letter names, + − =, "—" → comma pause, "Ta-da" → "Ta da") + "Lolo" →
"Lô Lô" (vi only, whole word: "Lolo's" yes, "Lolos" no).

## 4. Speech recognition (Talk time, optional — tap always works)
A **new** `SpeechRecognition || webkitSpeechRecognition` per `listen()`, en-US/vi-VN, interim results, 5 alternatives,
TTS stopped first; a final match resolves at once, an interim one after 450 ms ("mười" may become "mười hai"); 7 s
timeout. `not-allowed` turns `canListen()` off for the session (main hides the mic); `navigator.audioSession.type =
'play-and-record'` while listening, restored after. Matcher: exact tokens > diacritic-free > number words as digits >
edit distance on long words; `=word` forms match the whole utterance only (en "to" → 2, vi "không" → 0); ties at the same
position are ambiguous (vi "xanh", "củ", "hạt" alone pick nothing). Joined Vietnamese syllables also match a multi-syllable form at a lower
score ("phomai" = "phô mai", "hama" = "hà mã", "xanhla" = "xanh lá"); "pho-mai" is split by the normaliser. Choices `{id, kind, value}` use `words()`.

## 5. iOS / Safari findings (from the sister games, Nov 2026; nothing new found for this game)
- The first `speak()` must come from a user gesture: `unlock()` in the first `touchend`/`click` speaks a silent `' '`;
  a line refused with `not-allowed` is kept and spoken on the next `unlock()`; lines queued before it are re-stamped so a
  slow first tap does not make the welcome "stale".
- Downloaded Enhanced/Premium voices are often missing from `getVoices()` in Safari; Samantha (en) and Linh (vi) are
  built in. `hasVoice('vi') === false` → show `ui.voiceMissing` (Settings › Accessibility › Spoken Content › Voices).
- Recent iOS ignores the system voice preference for web speech, so `utterance.voice` is always set by name.
- Speech recognition needs Siri / Dictation enabled; it works in Safari tabs but not in Home-Screen web apps →
  `canListen()` is false when standalone. Always keep tap answers.
- Safari ducks WebAudio while speaking; keep the music duck gentle. iPadOS reports a desktop UA: detected via
  `MacIntel` + touch points.
- Coming back from the background can leave the synthesizer paused: `visibilitychange` cancels + resumes it.
- No regex look-behind in these files (a SyntaxError on iOS < 16.4 would kill the script; tested).

## 6. Input and kid-proofing (`LL.Input`, unchanged)
- `attach(canvas, {toLogical, down, move, up, cancel})`: `down(x, y, ev)` fires **synchronously in `pointerdown`** with
  logical px numbers (the leaf starts turning on touch-down); one active pointer, extra fingers ignored, a swallowed
  `pointerup` recovers on the next primary touch, `pointercancel` / `lostpointercapture` / blur / page hide → `cancel()`;
  targets `button, .screen, #hud, .no-game-input` ignored; touch + mouse fallback; a throwing handler is caught.
  Taps on Lolo or a critter are resolved by `world.pointerDown` (returns `'lolo'` / `'critter'`), not by input.js.
- `kidProof()` blocks pinch, double-tap zoom, callout, selection, rubber-band, context menu, zoom/refresh keys.
- `holdButton(el, ms, onDone, onProgress)`: the parent gate (a quick tap does nothing; main uses 2 s).

## 7. Adding a language
`i18n.js`: `LANGS`, `NAMES[xx]` (color, shape, size, animal, food, thing, parity), `FRIEND[xx]`, `MEAL[xx]`, `NUM[xx]`,
letters, `WORDS[xx]`, `WORD_LIST[xx]`, `DOT[xx]`, a complete `STR[xx]` (identical key set and params — tested),
`CHILD_FALLBACK[xx]`; `voice.js`: `LANG_TAG`, `PREFERRED`, `NAME_SPOKEN` if "Lolo" needs a spoken spelling. Run the test.
