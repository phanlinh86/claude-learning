# Puppy Garden Catch — Voice, language and input

Files: `game/js/i18n.js` (`PG.I18N`), `game/js/voice.js` (`PG.Voice`), `game/js/input.js` (`PG.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 8 300 checks: keys, every name, every prompt, matcher, voice queue, input).

## 1. What integration must do
1. Boot: `PG.Voice.init({ lang, enabled })`, `PG.Input.kidProof()`, `PG.I18N.setChild(settings.name)`.
2. **First `touchend`/`click` anywhere** (same handler that resumes the AudioContext): `PG.Voice.unlock()`.
   Before that, `say()` keeps only the newest line and speaks it right after unlock (so the welcome line is not lost).
3. Round prompt: `PG.I18N.t(lang, e.promptKey, e.params)` with the world's `round` event **as is** — params are raw
   values (`{color:'red'}`, `{n:3, fruit:'pear'}` …) and `t()` names them (§1.1). The sister game's `fruitName`/`nName`
   helpers are not needed.
4. Feedback: `correct` → `PG.Voice.say(PG.I18N.sayCorrect(lang, ev), { interrupt: true })`;
   `wrong` → `PG.Voice.say(PG.I18N.sayWrong(lang, ev), { interrupt: true })`; `miss` → `t('miss')`; `hint`/`idle` → `t('hint')`,
   `t('idle') + ' ' + prompt`; `roundDone` → `t('great')`; `tap` → `PG.I18N.name(lang, e.nameKind, e.nameValue)`.
   Counting: on `land` say `PG.I18N.name(lang, 'number', e.count)`; when `count === need` say `sayCorrect` (it returns
   "Yes! 3 pears!"). Use `interrupt: true` for answers to the child's action; `priority: true` for lines that must not
   be dropped (round prompt, talk question).
5. `PG.Voice.onStart / onEnd` → Pip's talk frames and music ducking. `PG.Voice.onVoicesChanged(fn)` → refresh the
   "voice missing" hint in Settings (also called right away if the voices are already loaded; returns `off()`).
6. Talk time mic button: inside its tap handler call
   `PG.Voice.listen({ lang, choices: talk.choices.map(c => ({ id: c.id, kind: c.kind, value: c.value })), timeoutMs: 7000 })`.
   Hide the mic when `!PG.Voice.canListen()`; show `ui.micUnsupported` / `ui.micDenied` as appropriate. A missed answer:
   `PG.I18N.talkWrong(lang, kind, value)`.
7. Settings → language: `PG.Voice.setLang(l)`; voice toggle: `PG.Voice.setEnabled(b)`. If `!PG.Voice.hasVoice('vi')`,
   show `ui.voiceMissing` to the parent.
8. `?novoice=1` → `PG.Voice.setEnabled(false)` (lines are still logged in `PG.Voice.log` / `PG.debug.voiceLog`).
9. `PG.Input.attach(canvas, { toLogical, down, move, up, cancel })` — **handlers get `(x, y, ev)`**: two numbers in
   logical px, then the DOM event. Write `down: (x, y) => world.pointerDown(x, y)`, never `down: p => …p.x` (§6).
   `PG.Input.holdButton(gearBtn, 2000, openSettings, setRing)`.

### 1.1 Params contract (`PG.I18N.PARAMS` lists the required ones)
| key | params (raw values) | EN example | VI example |
|---|---|---|---|
| `p.colors` | `color` | Catch the red ball! | Bé ơi, hứng quả bóng màu đỏ nhé! |
| `p.shapes` | `shape` | Catch the star! | Bé ơi, hứng ngôi sao nhé! |
| `p.size` | `size` (`big`/`small`) | Catch the big ball! | Bé ơi, hứng quả bóng to nhé! |
| `p.count` | `n` (number), `fruit` | Catch 3 pears! | Hứng 3 quả lê nào! |
| `p.animals` | `animal` (sound added automatically if it has one) | Quack quack! Catch the duck! | Cạp cạp! Bé hứng con vịt nhé! |
| `p.animalsSound` | `animal` or `sound` (an animal id) | Moo moo! Who says that? Catch it! | Ụm bò! Con gì kêu thế? Bé hứng nhé! |
| `p.letters` | `letter` (capital) | Catch the letter B! *(spoken "bee")* | Bé ơi, hứng chữ B nhé! *(spoken "bờ")* |
| `p.lower` | `letter` (capital); `lower` defaults to `letter.toLowerCase()` | Big B, small b! Catch small b! | Bé ơi, hứng chữ b thường của chữ B nhé! |
| `p.initial` | `letter` | What starts with the letter C? Catch it! | Cái gì bắt đầu bằng chữ C? Bé hứng nhé! |
| `p.add` | `sum` `'2+3'` | What is 2 + 3? Catch the answer! | 2 + 3 bằng mấy? Bé hứng đáp số nhé! |
| `p.sub` | `diff` `'7−2'` (or `'7-2'`) | What is 7 − 2? Catch the answer! | 7 − 2 bằng mấy? Bé hứng đáp số nhé! |
| `p.oddeven` | `parity` (`odd`/`even`) | Catch an odd number! | Bé ơi, hứng số lẻ nhé! |
| `talk.animals` | `sound` or `animal` (id; never shown) | Who says moo moo? | Con gì kêu ụm bò nhỉ? |
| `talk.add` / `talk.sub` | `sum` / `diff` (optional) | What is 4 + 1? | 4 + 1 bằng mấy nhỉ? |
| other `talk.<topic>` | none | What color is this ball? | Quả bóng này màu gì nhỉ? |

Rules: an object `{kind, value}` is always replaced by `name()` (so `{n:{kind:'number',value:3}}` → "three"); `{fruit}`
is plural when `n ≠ 1`; `{sum}`/`{diff}` are shown as "2 + 3" and spoken "plus/cộng" by `speech()`; missing required
params never leave a hole: `p.*` falls back to `p.generic` ("Watch the bubbles and catch!"), `p.animalsSound` with a
silent animal → `p.animals`, `talk.animals` → `talk.animalsPlain`, `talk.add/sub` → `talk.answer`.
English "a" becomes "an" before a vowel ("an orange ball", "an odd number").

### 1.2 `sayCorrect(lang, ev)` / `sayWrong(lang, ev)`
`ev = { nameKind, nameValue, target: {kind, value}, count?, need?, sum?|diff?|params?, bySound? }` — the world's
`correct` / `wrong` events. Optional `sum`/`diff` (or `params:{sum}` — pass the round params) let Pip mention the sum;
`bySound: true` (age-5 sound rounds) makes `sayWrong` ask "Who says moo moo?" instead of naming the target.

| target.kind | sayCorrect | sayWrong |
|---|---|---|
| color | Yes! The red ball! / Đúng rồi! Quả bóng màu đỏ! | That’s a blue ball. Let’s find red! / Đó là quả bóng màu xanh dương. Mình tìm màu đỏ nhé! |
| shape | Yes! The star! / Đúng rồi! Ngôi sao! | That’s a square. Let’s find the star! |
| size | Yes! The big ball! | That one is small. Let’s find a big one! |
| fruit (count) | count < need → "Two!" · count ≥ need → "Yes! 3 pears!" | That’s a banana. Let’s catch pears! |
| animal | Yes! The duck! Quack quack! | That’s the cat. Let’s find the duck! |
| letter (nameKind letter) | Yes! The letter B! | That’s the letter C. Let’s find the letter B! |
| letter (nameKind word) | Apple starts with the letter A! | That’s an owl. What starts with the letter B? |
| number | Yes! 5! / with sum: Yes! 2 + 3 = 5! | That’s 4. Let’s look again! / with sum: That’s 4. What is 2 + 3? |
| parity | Yes! 7 is odd! | 4 is even. Let’s find an odd number! |

Unknown data → `praise` / `wrong` (generic, never negative). The test bans "no / wrong / not / bad / incorrect" and "sai".

### 1.3 Other keys
`ui.*` (title "Puppy Garden Catch" / "Cún Con Hứng Quà", `ui.voice` "Pip's voice" / "Giọng Cún Pip", `ui.welcome` with and
without `{child}`, `ui.listening`, `ui.tapOrSay`, `ui.micDenied`, `ui.micUnsupported`, `ui.voiceMissing`, `ui.tapPip` …),
`topic.<id>`, `weather.0–3`, `chapter.0–3` (garden chapter names), `sound.<animal>` for cow duck sheep cat hen frog bird
owl pig (`PG.I18N.sound(lang, id)`, '' for silent animals), `praise[] great[] wrong[] miss[] hint[] idle[]`,
`talk.intro talk.right[] talk.wrong talk.wrong.the talk.wrong.letter talk.wrong.parity`, `session.done {stars}`.
Names: Vietnamese fruit use "quả", the carrot is a vegetable → **"củ cà rốt"**; animals use "con"; `pig` = "con heo"
(the northern "lợn" is accepted by the mic). `PG.I18N.plural(lang, kind, value)` gives English plurals (cherries, sheep).

## 2. How voices are chosen
`speechSynthesis.getVoices()` is read at init, on `voiceschanged` (both `onvoiceschanged` and `addEventListener`) and by
polling every 250 ms for 6 s (iOS fills the list late and may never fire the event). Each voice whose `lang` starts with
the target language is scored:

| rule | score |
|---|---|
| language prefix matches (`en`, `vi`) | base 10 (others are excluded) |
| exact region (`en-US`, `vi-VN`) / `en-GB`, `en-AU` | +6 / +3 |
| preferred name (best first) — en: Samantha, Nicky, Karen, Ava, Allison, Susan, Zoe, Serena, Moira, Tessa, Kate, Google US English, Microsoft Aria/Jenny… · vi: **Linh**, Google Tiếng Việt, Microsoft HoaiMy, Microsoft An | +40 … +23 |
| name contains Enhanced / Premium / Natural / Neural | +12 |
| Google voice on a non-iOS browser | +8 |
| `localService` / `default` | +3 / +2 |
| Apple novelty or Eloquence voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma, Rocko, Sandy…) | −60 |

Utterances: `lang` `en-US` / `vi-VN`, rate **0.9**, pitch **1.2** (a puppy: a little brighter than Bo's 1.15; above ≈ 1.3
the iOS voices get squeaky), volume 1. If no voice matches, the utterance is still spoken with `lang` set (the system picks
its default voice for that language) and `hasVoice(lang)` is false so the UI can tell the parent.

Queue: one line speaking + at most **2** waiting; when full the oldest non-priority line is dropped; non-priority lines older
than 5 s are dropped when they reach the front. `interrupt` cancels everything and speaks after a 50–90 ms gap (`speak()`
straight after `cancel()` is silently dropped on Safari and sometimes Chrome). A watchdog ends a line after its estimated
duration + 4 s because iOS sometimes never fires `onend` (and historically fired nothing on `cancel()`, WebKit 211776 —
we finish the line ourselves). Desktop Chrome: 10 s `pause()/resume()` keep-alive against the ~15 s cut-off. Speech stops
when the page is hidden; when it becomes visible again the synthesizer is reset (`cancel()` + `resume()`), because iOS can
leave it paused/stuck after the app was in the background.

Text → speech: `PG.I18N.speech(lang, text)` (applied by `say`): EN `letter B` / `big B` / `small b` → "bee"; VI `chữ B` →
"chữ bờ" (phonics); `2 + 3` → "2 plus 3" / "2 cộng 3", `=` → "equals" / "bằng", `…` → `.`. The bubble shows the original.

## 3. Vietnamese letter names (convention)
Pip uses the **phonics names taught in Vietnamese kindergartens and grade 1** ("đọc theo âm") in speech; the screen
shows the capital letter ("chữ B"):

a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**
(non-Vietnamese letters: f→ép, j→gi, w→vê kép, z→dét). `name('vi','letter','B')` returns "bờ" (Talk-time labels).

When listening we also accept the alphabet names parents often use (bê, xê, dê, đê, giê, hát, ca, e-lờ, em-mờ, en-nờ, pê,
quy, e-rờ, ét-xì, tê, vê, ích-xì, i-cờ-rét) and "chữ …" forms. Vietnamese letters are matched with diacritics first, so
"ê" → Ê and "e" → E.

## 4. Speech recognition
`listen()` uses `SpeechRecognition || webkitSpeechRecognition`, `lang` `en-US`/`vi-VN`, `interimResults`, `maxAlternatives 5`,
`continuous false`. It stops TTS first (Pip must not talk into the mic). A **final** result that matches resolves at once;
an interim match waits 450 ms for more words ("mười" may become "mười hai"). Ends with `{id:null, reason}` on
`no-speech`, `nomatch`, `timeout` (default 7 s), `aborted`, errors. `not-allowed` / `service-not-allowed` turn
`canListen()` off for the session (no retry loops — the child just taps).
While the mic is open `navigator.audioSession.type` (Safari 16.4+) is set to `'play-and-record'` and put back to its previous
value afterwards — on iOS the record route otherwise leaves speech and WebAudio quiet / on the earpiece.

Matcher (`PG.Voice.match(transcripts, choices, lang)`, pure):
- lower-case, NFC, punctuation → spaces; tokens.
- per choice word (from `PG.I18N.words`): exact token sequence (with diacritics) scores 30+len; diacritic-free (`đ`→`d`)
  20+len; number words of **both** languages are also turned into digits ("three", "ba", "mười hai" → 3, 3, 12) 20+len;
  edit distance ≤1 (≤2 for 8+ letters) on single words of 5+ letters with the same first letter, 10+len.
- words written `=to` match only when they are the whole utterance (en "to"→2, "for"→4, vi "không"→0).
- best score wins; equal score → the word said **later** wins ("it's a B" → B); same score and position → ambiguous, try the
  next alternative. First transcript alternative with a match wins; no match → `null`.

## 5. iOS / Safari caveats (re-checked 30 Oct 2026, iOS 18 / iOS 26)
- **Only built-in voices reach the web.** Apple: Web Speech exposes pre-installed voices only; voices downloaded in
  Settings (many Enhanced/Premium ones) are often *not* in `getVoices()` in Safari on iOS 16–18
  ([Apple forum 723503](https://developer.apple.com/forums/thread/723503)). Linh (vi-VN) and Samantha (en-US) are
  built in, so the scoring still finds them; if a parent "adds a voice" and nothing changes, that is why. Setting `lang`
  as well as `voice` lets the system fall back to its default voice for the language.
- **iOS 26 voice-preference regression** (native `AVSpeechSynthesisVoice(language:)` returns the default voice instead of
  the one chosen in Settings, [Apple forum 804648](https://developer.apple.com/forums/thread/804648)). We never rely on
  the system preference: we always pick a voice object by name, which the thread confirms still works.
- **Ducking:** Safari ducks other audio (incl. WebAudio) while speaking and for ≈ 1 s after, and
  `navigator.audioSession.type` does not stop it ([WebKit 278598](https://bugs.webkit.org/show_bug.cgi?id=278598)).
  The game's own music duck should be gentle so the two don't stack into silence.
- **Speech recognition needs Siri / dictation** and fails on managed devices (Screen Time / MDM). Errors: `not-allowed`
  = permission/policy, `service-not-allowed` = service off, `no-speech` = silence. Start recognition directly from a tap
  ([WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298), [WebKit 239816](https://bugs.webkit.org/show_bug.cgi?id=239816)).
- **Home-screen web app:** recognition works in Safari tabs but still not in installed web apps
  ([What PWA Can Do Today](https://whatpwacando.today/speech-recognition)). `canListen()` returns false when
  `navigator.standalone` / `display-mode: standalone` on iOS, so the big choice buttons are used. TTS works in both.
- **First utterance must come from a gesture** (iOS, and Chrome autoplay rules): `unlock()` speaks a silent `' '` inside the
  first touchend (iOS ignores `volume`, a single space is silent anyway).
- **Voices load late:** `getVoices()` is often empty at load; we listen for `voiceschanged` and poll
  ([codersblock: TTS quirks](https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/)).
- **Silent switch:** the ring/silent switch mutes WebAudio (SFX/music) in Safari; TTS may or may not be muted depending on the
  iOS version and route — tell parents to turn the switch off and the volume up.
- **Vietnamese voice:** if Linh is missing, parents can add it in Settings › Accessibility › Spoken Content › Voices ›
  Vietnamese. Desktop Chrome has "Google Tiếng Việt" (network voice); Windows Edge has Microsoft HoaiMy/NamMinh (online).
- iOS fires `pointercancel` on system gestures (Control Centre, home swipe) — `PG.Input` turns that into `cancel()`.
- A Bluetooth headset changes the mic route; test with the built-in mic first.

## 6. Input and kid-proofing (`PG.Input`)
- `attach(canvas, h)`: Pointer Events, pointer capture, one finger at a time (a second finger is ignored), ignores targets
  matching `button, .screen, #hud, .no-game-input` (and their children); `pointercancel`, `lostpointercapture`, window blur
  and page hide → `h.cancel()`. Touch + mouse fallback when `PointerEvent` is missing. Optional `hover(x, y)` for a mouse.
- **Signature:** `h.down(x, y, ev)`, `h.move(x, y, ev)`, `h.up(x, y, ev)` — `x`, `y` are the numbers returned by
  `h.toLogical(clientX, clientY)` (logical px, see DESIGN §2). Points that are not finite are dropped (an `up` with a bad
  point becomes `cancel()`). The sister game had a bug where `main.js` treated the first argument as `{x, y}`; the unit
  test now pins `(x, y, ev)`.
- `kidProof()`: injects CSS (`touch-action: manipulation`, no callout/selection, `overscroll-behavior: none`), blocks
  `gesturestart/change/end`, multi-touch `touchstart/touchmove`, single-finger `touchmove` outside `.scroll` and range inputs
  (stops rubber-band and pull-to-refresh), fast double-tap zoom on non-interactive areas, `dblclick`, `contextmenu`,
  `selectstart`, `dragstart`, Ctrl/⌘+wheel, Ctrl/⌘ + `+ − = 0`, F5 and Ctrl/⌘+R. Form fields keep selection and menus.
- `holdButton(el, ms, onDone, onProgress)`: progress 0..1 via rAF; cancels on release, finger sliding > 24 px off the button,
  pointercancel, mouse leave or window blur; Enter/Space also work; a quick tap does nothing. Returns `off()`.

## 7. Adding a language
1. `i18n.js`: add the code to `LANGS`, a `NAMES[xx]` table (same kinds/values), `NUM[xx]` (0–20), optional `NUM_ALT[xx]`,
   letter names, `WORDS[xx]` (accepted spoken forms), `WORD_LIST[xx]` for the `initial` topic and a complete `STR[xx]`
   (the test requires identical key sets) plus `CHILD_FALLBACK[xx]`.
2. `voice.js`: add `LANG_TAG[xx]` (BCP-47, e.g. `fr-FR`) and `PREFERRED[xx]` voice names.
3. Plurals / articles: `plural()` and the a→an rule in `fill()` are English-only; add rules there if needed.
4. Run `node tests/unit/i18n_voice.test.js` and add prompt + matcher cases for the new language.
