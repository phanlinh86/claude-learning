/* SG.UI — DOM screens: title, parent settings, HUD, Lumi's speech bubble, pause, Talk time, celebration. */
(function (SG) {
  'use strict';
  const $ = id => document.getElementById(id);
  const T = (lang, key, p) => (SG.I18N ? SG.I18N.t(lang, key, p) : key);
  const NAME = (lang, kind, v) => (SG.I18N ? SG.I18N.name(lang, kind, v) : String(v));
  const SCREENS = ['scrTitle', 'scrSettings', 'scrPause', 'scrTalk', 'scrDone', 'loading'];

  const UI = {
    lang: 'en',
    show(id, on = true) { $(id).classList.toggle('hidden', !on); },
    only(...ids) { SCREENS.forEach(s => this.show(s, ids.includes(s))); },

    applyLang(lang) {
      this.lang = lang;
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n'), v = T(lang, k);
        if (v && v !== k) el.textContent = v;
      });
      document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
      const title = T(lang, 'ui.title');
      // split the title into two coloured words for the logo ("Owlet's | Snow Garden", "Vườn Hoa | Cú Tuyết")
      const parts = lang === 'vi' ? ['Vườn Hoa', 'Cú Tuyết'] : ["Owlet's", 'Snow Garden'];
      if (title && title !== 'ui.title') {
        const w = title.split(' ');
        const cut = lang === 'vi' ? 2 : 1;
        parts[0] = w.slice(0, cut).join(' '); parts[1] = w.slice(cut).join(' ');
      }
      $('logo1').textContent = parts[0]; $('logo2').textContent = parts[1];
      const sub = T(lang, 'ui.subtitle'); $('tagline').textContent = sub === 'ui.subtitle' ? '' : sub;
      document.title = title === 'ui.title' ? "Owlet's Snow Garden" : title;
      $('inpName').placeholder = T(lang, 'ui.namePlaceholder');
      $('btnPlay').setAttribute('aria-label', T(lang, 'ui.play'));
    },
    setTitleInfo(stars, age, lang) {
      $('titleStars').textContent = stars;
      const a = T(lang, 'ui.age');
      $('titleAge').textContent = `· ${a === 'ui.age' ? 'Age' : a} ${age >= 7 ? '7+' : age}`;
    },
    bindSettings(s, onChange) {
      const chips = document.querySelectorAll('#ageChips .chip');
      const refresh = () => {
        chips.forEach(c => c.classList.toggle('on', +c.dataset.age === Math.min(7, s.age)));
        $('optSfx').checked = s.sfx; $('optMusic').checked = s.music; $('optVoice').checked = s.voice; $('optMic').checked = s.mic;
        if (document.activeElement !== $('inpName')) $('inpName').value = s.name || '';
      };
      chips.forEach(c => c.addEventListener('click', () => { s.age = +c.dataset.age; refresh(); onChange('age'); }));
      [['optSfx', 'sfx'], ['optMusic', 'music'], ['optVoice', 'voice'], ['optMic', 'mic']].forEach(([id, k]) =>
        $(id).addEventListener('change', () => { s[k] = $(id).checked; onChange(k); }));
      $('inpName').addEventListener('input', () => { s.name = $('inpName').value.replace(/[<>{}]/g, '').slice(0, 16); onChange('name'); });
      $('inpName').addEventListener('keydown', e => { if (e.key === 'Enter') $('inpName').blur(); });
      this.refreshSettings = refresh;
      refresh();
    },
    setVoiceInfo(text) { $('voiceInfo').textContent = text || ''; },

    /* ---------- HUD ---------- */
    setStars(n, bump) {
      $('hudStars').textContent = n;
      if (bump) { const el = $('hudStars').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    },
    setDots(total, done) {
      const box = $('hudDots');
      if (box.childElementCount !== total) { box.innerHTML = ''; for (let i = 0; i < total; i++) box.appendChild(document.createElement('i')); }
      [...box.children].forEach((d, i) => { d.className = i < done ? 'done' : i === done ? 'now' : ''; });
    },
    hudStarPoint() { // centre of the HUD star icon, in CSS px
      const r = $('hudStars').parentElement.querySelector('img').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    /* ---------- bubble ---------- */
    say(text) {
      const b = $('bubble'), t = $('bubbleText');
      if (!text) { b.classList.add('hidden'); return; }
      t.textContent = text;
      b.classList.remove('hidden', 'say'); void b.offsetWidth; b.classList.add('say');
      this._fitBubble();
    },
    placeBubble(rect) { // CSS px rect
      const b = $('bubble');
      b.style.left = rect.x + 'px'; b.style.top = rect.y + 'px';
      b.style.width = rect.w + 'px'; b.style.minHeight = rect.h + 'px';
      this._bubbleRect = rect;
      this._fitBubble();
    },
    _fitBubble() {
      const r = this._bubbleRect; if (!r) return;
      const t = $('bubbleText');
      let fs = Math.max(15, Math.min(30, r.h * 0.3));
      t.style.fontSize = fs + 'px';
      const b = $('bubble');
      for (let i = 0; i < 8 && b.scrollHeight > r.h * 1.35 && fs > 14; i++) { fs *= 0.9; t.style.fontSize = fs + 'px'; }
    },

    /* ---------- Talk time ---------- */
    openTalk(talk, lang, onChoice, mic, age) {
      this._age = age || 4;
      $('talkTitle').textContent = T(lang, 'talk.intro').split(/[!.?]/)[0] + '!';
      $('talkQ').textContent = T(lang, talk.promptKey, talk.params || {});
      this.only('scrTalk');
      requestAnimationFrame(() => SG.Renderer.preview($('talkShow'), talk.show || {}));
      const box = $('talkChoices'); box.innerHTML = '';
      talk.choices.forEach(c => {
        const b = document.createElement('button');
        b.dataset.id = c.id;
        const visual = this._choiceVisual(c);
        if (visual) {
          const cv = document.createElement('canvas'); b.appendChild(cv);
          requestAnimationFrame(() => SG.Renderer.preview(cv, visual));
          const sm = document.createElement('small'); sm.textContent = NAME(lang, c.kind, c.value); b.appendChild(sm);
        } else {
          b.textContent = c.kind === 'parity' ? NAME(lang, c.kind, c.value) : String(c.value);
          if (c.kind === 'parity') b.style.fontSize = '26px';
        }
        b.addEventListener('click', () => onChoice(c.id));
        box.appendChild(b);
      });
      const mb = $('btnMic');
      mb.classList.toggle('hidden', !mic);
      mb.classList.remove('listening');
      $('micLabel').textContent = T(lang, 'ui.tapOrSay');
    },
    _choiceVisual(c) {
      switch (c.kind) {
        case 'color': return { flower: c.value };   // a little flower in that colour
        case 'shape': return { shape: c.value, color: 'blue' };
        case 'animal': return { sprite: 'animal_' + c.value };
        case 'size': return { sprite: 'seed_plain', scale: c.value === 'big' ? 1 : 0.55 };   // pictures, no reading needed
        case 'number': return this._age <= 5 && c.value >= 1 && c.value <= 10 ? { dots: +c.value, text: String(c.value) } : null;
        default: return null;
      }
    },
    glowTalk(answerId) {
      [...$('talkChoices').children].forEach(b => { if (b.dataset.id === String(answerId)) b.classList.add('glow'); });
    },
    markTalk(choiceId, answerId) {
      [...$('talkChoices').children].forEach(b => {
        if (b.dataset.id === String(answerId)) b.classList.add('right');
        else if (b.dataset.id === String(choiceId)) b.classList.add('wrongpick');
      });
      $('btnMic').classList.remove('listening');
    },
    setListening(on, text) {
      $('btnMic').classList.toggle('listening', !!on);
      if (text) $('micLabel').textContent = text;
    }
  };
  SG.UI = UI;
})(window.SG = window.SG || {});
