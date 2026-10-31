/* Puppy Garden Catch — PG.Voice: Pip the puppy talks (Web Speech TTS) and listens (SpeechRecognition).
 *
 *   PG.Voice.init({ lang, enabled })      call once at boot (safe without speechSynthesis)
 *   PG.Voice.unlock()                     call inside the FIRST touchend/click (iOS + Chrome need a gesture)
 *   PG.Voice.setLang('en'|'vi')  setEnabled(bool)  stop()  isSpeaking()  hasVoice(lang)  voiceName(lang?)
 *   PG.Voice.say(text, { interrupt, priority, rate, pitch, lang }) → Promise<{ spoken, reason }>
 *   PG.Voice.sayKey(key, params, opts) → Promise (promise.text = the display text, for the speech bubble)
 *   PG.Voice.onStart = fn(text)  PG.Voice.onEnd = fn(text)   (Pip's talk frames, music ducking)
 *   PG.Voice.onVoicesChanged(fn) → off()   fn() runs whenever the voice list changes (iOS fills it late)
 *   PG.Voice.log  — every line Pip said (also when muted): { t, lang, text }; mirrored to PG.debug.voiceLog
 *
 *   PG.Voice.canListen()  → bool (false when unsupported, iOS home-screen app, or permission denied this session)
 *   PG.Voice.listen({ lang, choices:[{id, words} | {id, kind, value}], timeoutMs }) → Promise<{ id|null, transcript, reason? }>
 *     — call from a tap (mic button). Never rejects. reason: 'nomatch' | 'no-speech' | 'timeout' | 'not-allowed' |
 *       'service-not-allowed' | 'aborted' | 'unsupported' | 'busy' | 'error' | 'network' | 'audio-capture'
 *   PG.Voice.stopListening()  isListening()  onListen = fn(bool)
 *   PG.Voice.match(transcripts[], choices[], lang?) → id|null   (pure; unit-tested)
 *   PG.Voice.matchDetail(…) → { id, transcript, score } | null
 */
(function (PG) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};
  var nav = W.navigator || {};
  var UA = String(nav.userAgent || '');
  var IS_IOS = /iPad|iPhone|iPod/.test(UA) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
  var IS_ANDROID = /Android/i.test(UA);
  var IS_CHROME_DESKTOP = /Chrome\//.test(UA) && !IS_ANDROID && !IS_IOS && !/Edg\//.test(UA);
  var LANG_TAG = { en: 'en-US', vi: 'vi-VN' };

  // Preferred voices, best first (substring match on voice.name, case-insensitive).
  var PREFERRED = {
    en: ['samantha', 'nicky', 'karen', 'ava', 'allison', 'susan', 'zoe', 'serena', 'moira', 'tessa', 'kate', 'joelle',
      'google us english', 'google uk english female', 'microsoft aria', 'microsoft jenny', 'microsoft ana', 'microsoft zira'],
    vi: ['linh', 'google tiếng việt', 'google tieng viet', 'microsoft hoaimy', 'microsoft an', 'microsoft nammin']
  };
  // Apple novelty / Eloquence voices sound robotic or silly — avoid unless nothing else exists.
  var AVOID = ['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news', 'jester', 'organ',
    'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'fred', 'junior', 'ralph', 'kathy', 'grandma', 'grandpa',
    'eddy', 'flo', 'reed', 'rocko', 'sandy', 'shelley', 'deranged', 'hysterical', 'pipe organ'];

  // Pip is a puppy: a touch higher than the sister game's Bo (1.15). Above ~1.3 the iOS voices start to sound squeaky.
  var RATE = 0.9, PITCH = 1.2, MAXQ = 2, STALE_MS = 5000;

  var V = {
    log: [], onStart: null, onEnd: null, onListen: null,
    _lang: 'en', _enabled: true, _unlocked: false, _inited: false
  };
  var synth = null, voices = [], pickCache = {}, current = null, queue = [], keepAlive = null, kickTimer = null;
  var voiceListeners = [], voiceSig = '';

  function now() { return Date.now(); }
  function call(fn, a) { try { if (typeof fn === 'function') fn(a); } catch (e) { /* never break the game */ } }
  function I18N() { return PG.I18N; }
  function getSynth() {
    try { return W.speechSynthesis && typeof W.SpeechSynthesisUtterance === 'function' ? W.speechSynthesis : null; }
    catch (e) { return null; }
  }

  // ---------------------------------------------------------------- voices
  function loadVoices() {
    if (!synth) return;
    try {
      var v = synth.getVoices();
      if (v && v.length) {
        voices = Array.prototype.slice.call(v); pickCache = {};
        var sig = voices.length + ':' + voices.map(function (x) { return x.name + '|' + x.lang; }).join(',');
        if (sig !== voiceSig) {
          voiceSig = sig;
          voiceListeners.slice().forEach(function (fn) { call(fn); });
        }
      }
    } catch (e) { /* ignore */ }
  }
  function voiceLang(v) { return String(v.lang || '').replace('_', '-').toLowerCase(); }
  function scoreVoice(v, lang) {
    var vl = voiceLang(v), nm = String(v.name || '').toLowerCase();
    if (vl.indexOf(lang) !== 0) return -1;
    var s = 10;
    if (vl === LANG_TAG[lang].toLowerCase()) s += 6;
    else if (lang === 'en' && (vl === 'en-gb' || vl === 'en-au')) s += 3;
    var pref = PREFERRED[lang] || [];
    for (var i = 0; i < pref.length; i++) if (nm.indexOf(pref[i]) >= 0) { s += 40 - i; break; }
    if (/enhanced|premium|natural|neural/.test(nm)) s += 12;
    if (/google/.test(nm) && !IS_IOS) s += 8;
    if (v.localService) s += 3;
    if (v['default']) s += 2;
    for (var j = 0; j < AVOID.length; j++) if (nm.split(/[\s(]/)[0] === AVOID[j] || nm === AVOID[j]) { s -= 60; break; }
    return s;
  }
  function pick(lang) {
    lang = lang === 'vi' ? 'vi' : 'en';
    if (pickCache[lang] !== undefined) return pickCache[lang];
    if (!voices.length) loadVoices();
    var best = null, bs = -1;
    for (var i = 0; i < voices.length; i++) {
      var s = scoreVoice(voices[i], lang);
      if (s > bs) { bs = s; best = voices[i]; }
    }
    if (bs < 0) best = null;
    if (voices.length) pickCache[lang] = best;
    return best;
  }

  // ---------------------------------------------------------------- log
  function logLine(lang, text) {
    var e = { t: now(), lang: lang, text: String(text) };
    V.log.push(e);
    if (V.log.length > 600) V.log.splice(0, V.log.length - 500);
    var d = PG.debug;
    if (d && Array.isArray(d.voiceLog) && d.voiceLog !== V.log) d.voiceLog.push(e);
  }

  // ---------------------------------------------------------------- queue
  function canSpeakNow() {
    if (V._unlocked) return true;
    var ua = nav.userActivation;
    return !!(ua && ua.hasBeenActive && !IS_IOS);
  }
  function finishItem(item, reason) {
    if (!item || item.done) return;
    item.done = true;
    if (item.watch) clearTimeout(item.watch);
    if (item.startCheck) clearTimeout(item.startCheck);
    if (current === item) {
      current = null;
      if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
      if (item.started) call(V.onEnd, item.display);
    }
    try { item.res({ spoken: reason === 'end', reason: reason }); } catch (e) { /* ignore */ }
    scheduleKick(0);
  }
  function scheduleKick(ms) {
    if (kickTimer) return;
    kickTimer = setTimeout(function () { kickTimer = null; kick(); }, ms || 0);
  }
  function kick() {
    if (current || !synth || !V._enabled) return;
    if (!canSpeakNow()) return;              // waits for unlock()
    while (queue.length) {
      var it = queue.shift();
      if (!it.priority && now() - it.t > STALE_MS) { it.res({ spoken: false, reason: 'stale' }); continue; }
      speakItem(it);
      return;
    }
  }
  function speakItem(item) {
    var u;
    try { u = new W.SpeechSynthesisUtterance(item.text); } catch (e) { item.res({ spoken: false, reason: 'error' }); return; }
    current = item;
    item.u = u;                                    // keep a reference (Chrome GCs utterances → onend never fires)
    u.lang = LANG_TAG[item.lang];
    var v = pick(item.lang);
    if (v) u.voice = v;
    u.rate = item.rate; u.pitch = item.pitch; u.volume = 1;
    u.onstart = function () {
      if (item.started || item.done) return;
      item.started = true; call(V.onStart, item.display);
    };
    u.onend = function () { finishItem(item, 'end'); };
    u.onerror = function (e) {
      var r = e && e.error;
      finishItem(item, (r === 'interrupted' || r === 'canceled') ? 'interrupted' : (r || 'error'));
    };
    // iOS sometimes never fires onend (or onstart) — a watchdog keeps the queue moving.
    var est = 600 + item.text.length * 85 / Math.max(0.3, item.rate);
    item.watch = setTimeout(function () { finishItem(item, 'end'); }, est + 4000);
    item.startCheck = setTimeout(function () {
      if (item.done || item.started) return;
      if (synth.speaking) { item.started = true; call(V.onStart, item.display); }
    }, 700);
    if (IS_CHROME_DESKTOP) {                       // Chrome stops long utterances after ~15 s
      keepAlive = setInterval(function () {
        try { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } } catch (e) { /* ignore */ }
      }, 10000);
    }
    try {
      if (synth.paused) synth.resume();
      synth.speak(u);
    } catch (e) { finishItem(item, 'error'); }
  }
  function flushQueue(reason) {
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) q[i].res({ spoken: false, reason: reason });
  }
  function cancelCurrent(reason) {
    var c = current;
    try { if (synth) synth.cancel(); } catch (e) { /* ignore */ }
    if (c) finishItem(c, reason || 'interrupted');
  }

  // ---------------------------------------------------------------- public: speaking
  V.init = function (opts) {
    opts = opts || {};
    if (opts.lang) V._lang = opts.lang === 'vi' ? 'vi' : 'en';
    if (opts.enabled != null) V._enabled = !!opts.enabled;
    if (V._inited) return V;
    V._inited = true;
    synth = getSynth();
    if (synth) {
      loadVoices();
      try { synth.onvoiceschanged = loadVoices; } catch (e) { /* ignore */ }
      try { if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); } catch (e) { /* ignore */ }
      var tries = 0;                                // iOS: the list fills late and voiceschanged may never fire
      var poll = setInterval(function () { loadVoices(); if (voices.length || ++tries > 24) clearInterval(poll); }, 250);
      try { synth.cancel(); } catch (e) { /* stale speech from a previous page */ }
    }
    if (W.document && W.document.addEventListener) {
      W.document.addEventListener('visibilitychange', function () {
        if (W.document.hidden) { V.stop(); V.stopListening(); return; }
        // iOS can leave the synthesizer paused/stuck after the app was in the background: reset it on return.
        try { if (synth) { synth.cancel(); if (synth.paused) synth.resume(); } } catch (e) { /* ignore */ }
        loadVoices();
      });
    }
    if (W.addEventListener) W.addEventListener('pagehide', function () { V.stop(); });
    return V;
  };

  V.unlock = function () {
    if (!V._inited) V.init();
    if (!synth) { V._unlocked = true; return; }
    loadVoices();
    if (!V._unlocked) {
      try {
        var u = new W.SpeechSynthesisUtterance(' ');
        u.volume = 0; u.rate = 1; u.lang = LANG_TAG[V._lang];
        synth.speak(u);
      } catch (e) { /* ignore */ }
      V._unlocked = true;
    }
    try { if (synth.paused) synth.resume(); } catch (e) { /* ignore */ }
    scheduleKick(80);
  };

  V.setLang = function (l) { V._lang = l === 'vi' ? 'vi' : 'en'; };
  V.getLang = function () { return V._lang; };
  V.setEnabled = function (b) { V._enabled = !!b; if (!V._enabled) V.stop(); };
  V.isEnabled = function () { return V._enabled; };
  V.isSupported = function () { return !!(synth || getSynth()); };
  V.isSpeaking = function () { return !!current; };
  V.hasVoice = function (lang) { return !!pick(lang || V._lang); };
  V.voiceName = function (lang) { var v = pick(lang || V._lang); return v ? v.name : ''; };
  V.voices = function () { loadVoices(); return voices.slice(); };
  V.onVoicesChanged = function (fn) {
    if (typeof fn !== 'function') return function () {};
    voiceListeners.push(fn);
    if (voices.length) call(fn);                    // already loaded: tell the caller now
    return function off() { var i = voiceListeners.indexOf(fn); if (i >= 0) voiceListeners.splice(i, 1); };
  };

  V.say = function (text, opts) {
    opts = opts || {};
    if (!V._inited) V.init();
    var lang = opts.lang === 'vi' || opts.lang === 'en' ? opts.lang : V._lang;
    var display = String(text == null ? '' : text);
    logLine(lang, display);
    return new Promise(function (res) {
      if (!display.trim() || !synth || !V._enabled) { res({ spoken: false, reason: synth ? 'off' : 'unsupported' }); return; }
      var spoken = I18N() && I18N().speech ? I18N().speech(lang, display) : display;
      var item = { text: spoken, display: display, lang: lang, t: now(), res: res, priority: !!opts.priority,
        rate: opts.rate || RATE, pitch: opts.pitch || PITCH };
      if (opts.interrupt) {
        flushQueue('interrupted');
        cancelCurrent('interrupted');
        queue.push(item);
        if (kickTimer) { clearTimeout(kickTimer); kickTimer = null; }
        scheduleKick(IS_IOS ? 90 : 50);           // speak() right after cancel() is dropped on Safari/Chrome
        return;
      }
      queue.push(item);
      if (!canSpeakNow()) {                        // before the first gesture keep only the newest line
        while (queue.length > 1) queue.shift().res({ spoken: false, reason: 'dropped' });
        return;
      }
      while (queue.length > MAXQ) {
        var idx = -1;
        for (var i = 0; i < queue.length - 1; i++) if (!queue[i].priority) { idx = i; break; }
        if (idx < 0) idx = 0;
        queue.splice(idx, 1)[0].res({ spoken: false, reason: 'dropped' });
      }
      if (!current) scheduleKick(0);
    });
  };

  V.sayKey = function (key, params, opts) {
    var lang = opts && opts.lang ? opts.lang : V._lang;
    var text = I18N() ? I18N().t(lang, key, params) : key;
    var p = V.say(text, opts);
    p.text = text;
    return p;
  };

  V.stop = function () {
    flushQueue('stopped');
    cancelCurrent('stopped');
  };

  // ---------------------------------------------------------------- matcher (pure)
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function strip(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').normalize('NFC');
  }
  function toks(s) { return s ? s.split(' ') : []; }

  var NUMMAP = null;   // stripped number words (both languages) → digit string; 1- and 2-token keys
  function numMap() {
    if (NUMMAP) return NUMMAP;
    NUMMAP = {};
    var I = I18N();
    if (!I) return NUMMAP;
    ['en', 'vi'].forEach(function (l) {
      for (var n = 1; n <= 20; n++) NUMMAP[strip(norm(I.numberName(l, n)))] = String(n);
    });
    NUMMAP.zero = '0';
    NUMMAP['muoi lam'] = '15'; NUMMAP['muoi mot'] = '11'; NUMMAP['muoi tu'] = '14'; NUMMAP['hai chuc'] = '20';
    return NUMMAP;
  }
  function numberize(sTokens) {
    var m = numMap(), out = [], changed = false;
    for (var i = 0; i < sTokens.length; i++) {
      var two = i + 1 < sTokens.length ? sTokens[i] + ' ' + sTokens[i + 1] : null;
      if (two && m[two]) { out.push(m[two]); i++; changed = true; continue; }
      if (m[sTokens[i]]) { out.push(m[sTokens[i]]); changed = true; continue; }
      out.push(sTokens[i]);
    }
    return changed ? out : null;
  }
  function findSeq(hay, needle) {      // returns end index of the LAST occurrence, or -1
    if (!needle.length || needle.length > hay.length) return -1;
    for (var i = hay.length - needle.length; i >= 0; i--) {
      var ok = true;
      for (var j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
      if (ok) return i + needle.length - 1;
    }
    return -1;
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function prepChoices(choices, lang) {
    var out = [];
    (choices || []).forEach(function (c) {
      if (!c || c.id == null) return;
      var list = c.words;
      if (!list && c.kind && I18N()) list = I18N().words(lang || V._lang, c.kind, c.value);
      var forms = [];
      (list || []).forEach(function (w) {
        w = String(w);
        var solo = w.charAt(0) === '=';
        var a = norm(solo ? w.slice(1) : w);
        if (!a) return;
        forms.push({ solo: solo, a: toks(a), s: toks(strip(a)), len: a.replace(/ /g, '').length });
      });
      out.push({ id: c.id, forms: forms });
    });
    return out;
  }
  function scoreChoice(ch, A, S, N) {
    var best = { score: 0, pos: -1 };
    function take(sc, pos) { if (sc > best.score || (sc === best.score && pos > best.pos)) { best.score = sc; best.pos = pos; } }
    for (var k = 0; k < ch.forms.length; k++) {
      var f = ch.forms[k], p;
      if (f.solo) {
        if (A.join(' ') === f.a.join(' ')) take(40 + f.len, A.length - 1);
        else if (S.join(' ') === f.s.join(' ')) take(35 + f.len, S.length - 1);
        continue;
      }
      if ((p = findSeq(A, f.a)) >= 0) { take(30 + f.len, p); continue; }
      if ((p = findSeq(S, f.s)) >= 0) { take(20 + f.len, p); continue; }
      if (N && (p = findSeq(N, f.s)) >= 0) { take(20 + f.len, p); continue; }
      if (f.s.length === 1 && f.len >= 5) {        // small edit distance for longer single words
        var w = f.s[0], max = w.length >= 8 ? 2 : 1;
        for (var i = S.length - 1; i >= 0; i--) {
          var tk = S[i];
          if (tk.length < 3 || tk.charAt(0) !== w.charAt(0)) continue;
          if (lev(tk, w, max) <= max) { take(10 + f.len, i); break; }
        }
      }
    }
    return best;
  }
  function matchDetail(transcripts, choices, lang) {
    var list = Array.isArray(transcripts) ? transcripts : [transcripts];
    var prepared = (choices && choices.length && choices[0] && choices[0].forms) ? choices : prepChoices(choices, lang);
    if (!prepared.length) return null;
    for (var t = 0; t < list.length && t < 12; t++) {
      var raw = list[t];
      var A = toks(norm(raw));
      if (!A.length) continue;
      var S = A.map(strip), N = numberize(S);
      var ranked = [];
      for (var c = 0; c < prepared.length; c++) {
        var b = scoreChoice(prepared[c], A, S, N);
        if (b.score > 0) ranked.push({ id: prepared[c].id, score: b.score, pos: b.pos });
      }
      if (!ranked.length) continue;
      ranked.sort(function (x, y) { return (y.score - x.score) || (y.pos - x.pos); });
      if (ranked.length > 1 && ranked[1].score === ranked[0].score && ranked[1].pos === ranked[0].pos &&
          ranked[1].id !== ranked[0].id) continue;   // ambiguous
      return { id: ranked[0].id, transcript: String(raw), score: ranked[0].score };
    }
    return null;
  }
  V.matchDetail = matchDetail;
  V.match = function (transcripts, choices, lang) {
    var m = matchDetail(transcripts, choices, lang);
    return m ? m.id : null;
  };
  V._norm = norm;

  // ---------------------------------------------------------------- listening
  var denied = false, rec = null, listenFinish = null;
  // Safari 16.4+ exposes navigator.audioSession. While the mic is open iOS switches to a record route (speech and
  // WebAudio get quiet / go to the earpiece); putting the previous type back afterwards restores normal playback.
  function sessionFor(type) {
    var as = nav.audioSession, prev;
    if (!as || typeof as.type !== 'string') return function () {};
    try { prev = as.type; if (prev !== type) as.type = type; } catch (e) { return function () {}; }
    var restored = false;
    return function () {
      if (restored) return; restored = true;
      try { if (as.type !== prev) as.type = prev; } catch (e) { /* ignore */ }
    };
  }
  function SRClass() { return W.SpeechRecognition || W.webkitSpeechRecognition || null; }
  function standaloneIOS() {
    if (!IS_IOS) return false;
    try { return nav.standalone === true || (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches); }
    catch (e) { return false; }
  }
  V.canListen = function () { return !!SRClass() && !denied && !standaloneIOS(); };
  V.isListening = function () { return !!rec; };
  V.stopListening = function () { if (listenFinish) listenFinish({ id: null, transcript: '', reason: 'aborted' }); };

  V.listen = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var SR = SRClass();
      if (!SR || denied || standaloneIOS()) {
        resolve({ id: null, transcript: '', reason: denied ? 'not-allowed' : 'unsupported' }); return;
      }
      if (listenFinish) listenFinish({ id: null, transcript: '', reason: 'aborted' });
      V.stop();                                   // Pip must not talk into the mic
      var restoreSession = sessionFor('play-and-record');
      var lang = opts.lang === 'vi' || opts.lang === 'en' ? opts.lang : V._lang;
      var choices = prepChoices(opts.choices, lang);
      var heard = [], last = '', done = false, pending = null, timer = null, r;
      function finish(res) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (pending) clearTimeout(pending);
        try { r.onresult = r.onerror = r.onend = null; r.abort(); } catch (e) { /* ignore */ }
        if (rec === r) rec = null;
        if (listenFinish === finish) listenFinish = null;
        restoreSession();
        call(V.onListen, false);
        res.transcript = res.transcript || last || '';
        resolve(res);
      }
      try {
        r = new SR();
        r.lang = LANG_TAG[lang];
        r.interimResults = true;
        r.maxAlternatives = 5;
        r.continuous = false;
      } catch (e) { restoreSession(); resolve({ id: null, transcript: '', reason: 'error' }); return; }
      r.onresult = function (e) {
        var isFinal = false, batch = [];
        try {
          for (var i = e.resultIndex || 0; i < e.results.length; i++) {
            var res = e.results[i];
            if (res.isFinal) isFinal = true;
            for (var j = 0; j < res.length; j++) if (res[j] && res[j].transcript) batch.push(res[j].transcript);
          }
        } catch (err) { /* ignore */ }
        if (batch.length) { last = batch[0]; heard = batch.concat(heard).slice(0, 20); }
        var m = matchDetail(batch, choices, lang);
        if (pending) { clearTimeout(pending); pending = null; }
        if (m && isFinal) { finish({ id: m.id, transcript: m.transcript }); return; }
        if (m) {                                  // interim: wait a moment ("mười" might become "mười hai")
          pending = setTimeout(function () { finish({ id: m.id, transcript: m.transcript }); }, 450);
        }
      };
      r.onerror = function (e) {
        var why = (e && e.error) || 'error';
        if (why === 'not-allowed' || why === 'service-not-allowed') denied = true;
        if (pending) return;                       // a match is about to resolve
        finish({ id: null, transcript: last, reason: why });
      };
      r.onend = function () {
        if (pending) return;
        var m = heard.length ? matchDetail(heard, choices, lang) : null;
        if (m) finish({ id: m.id, transcript: m.transcript });
        else finish({ id: null, transcript: last, reason: last ? 'nomatch' : 'no-speech' });
      };
      timer = setTimeout(function () { finish({ id: null, transcript: last, reason: 'timeout' }); }, opts.timeoutMs || 7000);
      rec = r;
      listenFinish = finish;
      try { r.start(); call(V.onListen, true); }
      catch (e) { finish({ id: null, transcript: '', reason: 'busy' }); }
    });
  };

  V._env = { IS_IOS: IS_IOS, IS_CHROME_DESKTOP: IS_CHROME_DESKTOP, pick: pick, scoreVoice: scoreVoice };
  PG.Voice = V;
})(window.PG = window.PG || {});
