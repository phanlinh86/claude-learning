/* TR.UI — DOM screens: title, profiles, reef map, treasure room, parent settings + profile editor, HUD, Tutu's speech
 * bubble, pause (with volume), Talk time, lagoon celebration. */
(function (TR) {
  'use strict';
  const $ = id => document.getElementById(id);
  const T = (lang, key, p) => (TR.I18N ? TR.I18N.t(lang, key, p) : key);
  const NAME = (lang, kind, v) => (TR.I18N ? TR.I18N.name(lang, kind, v) : String(v));
  const SCREENS = ['scrTitle', 'scrProfiles', 'scrMap', 'scrTreasure', 'scrSettings', 'scrProfileEdit', 'scrPause', 'scrTalk', 'scrDone', 'loading'];
  const LAGOON_KEYS = ['beach', 'coral', 'cave', 'bay', 'ship', 'rainbow'];
  // map badge positions (fractions of the map area) — landscape winding path / portrait zig-zag
  const POS_L = [[0.1, 0.7], [0.27, 0.28], [0.45, 0.68], [0.62, 0.28], [0.79, 0.68], [0.92, 0.3]];
  const POS_P = [[0.26, 0.84], [0.72, 0.7], [0.28, 0.55], [0.72, 0.4], [0.3, 0.25], [0.7, 0.1]];

  const UI = {
    lang: 'en',
    show(id, on = true) { $(id).classList.toggle('hidden', !on); },
    only(...ids) { SCREENS.forEach(s => this.show(s, ids.includes(s))); },
    txt(key, p) { const v = T(this.lang, key, p); return v === key ? '' : v; },

    applyLang(lang) {
      this.lang = lang;
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n'), v = T(lang, k);
        if (v && v !== k) el.textContent = v;
      });
      document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
      const title = T(lang, 'ui.title');
      const parts = lang === 'vi' ? ['Mầm', 'Tìm Kho Báu'] : ["Mầm's", 'Treasure Reef'];
      if (title && title !== 'ui.title') {
        const w = title.split(' ');
        parts[0] = w.slice(0, 1).join(' '); parts[1] = w.slice(1).join(' ');
      }
      $('logo1').textContent = parts[0]; $('logo2').textContent = parts[1];
      const sub = T(lang, 'ui.subtitle'); $('tagline').textContent = sub === 'ui.subtitle' ? '' : sub;
      document.title = title === 'ui.title' ? "Mầm's Treasure Reef" : title;
      $('inpName').placeholder = T(lang, 'ui.namePlaceholder');
      $('inpSayAs').placeholder = 'Mum';
      $('btnPlay').setAttribute('aria-label', T(lang, 'ui.play'));
      if (this._mapData) this.renderMap(this._mapData.profile, this._mapData.onPick, this._mapData.lang = lang);
    },
    setTitleInfo(p, lang) {
      $('titleStars').textContent = p ? p.totalStars || 0 : 0;
      $('titlePearls').textContent = p ? p.pearls || 0 : 0;
      $('titleWho').textContent = p ? '· ' + p.name : '';
    },

    /* ---------- profiles ---------- */
    renderProfiles(list, lang, onPick, canAdd, onAdd) {
      const box = $('profileCards'); box.innerHTML = '';
      list.forEach(p => {
        const b = document.createElement('button'); b.className = 'profile-card'; b.dataset.id = p.id;
        const img = document.createElement('img'); img.src = TR.Assets.url('avatar_' + p.avatar) || ''; img.alt = '';
        const nm = document.createElement('b'); nm.textContent = p.name;
        const sm = document.createElement('small'); sm.innerHTML = `<img src="${TR.Assets.url('star')}" alt=""> ${p.totalStars || 0} · ${T(lang, 'ui.age')} ${p.age >= 7 ? '7+' : p.age}`;
        b.append(img, nm, sm);
        b.addEventListener('click', () => onPick(p.id));
        box.appendChild(b);
      });
      if (canAdd && onAdd) {
        const b = document.createElement('button'); b.className = 'profile-card add'; b.textContent = '+';
        b.setAttribute('aria-label', T(lang, 'ui.newProfile'));
        b.addEventListener('click', onAdd); box.appendChild(b);
      }
    },

    /* ---------- reef map ---------- */
    renderMap(p, onPick, lang) {
      this._mapData = { profile: p, onPick, lang: lang || this.lang };
      lang = this._mapData.lang;
      const P = TR.Progress;
      $('mapAvatar').src = TR.Assets.url('avatar_' + p.avatar) || '';
      $('mapName').textContent = p.name;
      $('mapStars').textContent = p.totalStars || 0; $('mapPearls').textContent = p.pearls || 0;
      const box = $('lagoons'); box.innerHTML = '';
      const portrait = window.innerHeight > window.innerWidth;
      const pos = portrait ? POS_P : POS_L;
      let nextId = null;
      for (let i = 1; i <= 6; i++) {
        const unlocked = P.unlocked(p, i), lg = (p.lagoons || {})[i] || { stars: [0, 0, 0, 0], done: false };
        if (unlocked && !lg.done && nextId == null) nextId = i;
        const el = document.createElement('button');
        el.className = 'lagoon' + (unlocked ? '' : ' locked');
        el.style.left = pos[i - 1][0] * 100 + '%'; el.style.top = pos[i - 1][1] * 100 + '%';
        el.dataset.lagoon = i;
        const badge = document.createElement('img'); badge.className = 'badge'; badge.src = TR.Assets.url('lagoon_' + i); badge.alt = '';
        const name = document.createElement('b'); name.textContent = T(lang, 'lagoon.' + LAGOON_KEYS[i - 1] + '.name');
        el.append(badge, name);
        if (unlocked) {
          const st = document.createElement('span'); st.className = 'stars';
          const sum = (lg.stars || []).reduce((a, b) => a + b, 0);
          st.innerHTML = `<img src="${TR.Assets.url('star')}" alt=""> ${sum}`;
          el.appendChild(st);
          const tr = P.trophy(p, i);
          if (tr) { const t = document.createElement('img'); t.className = 'trophy'; t.src = TR.Assets.url('trophy_' + tr); t.alt = ''; el.appendChild(t); }
          el.addEventListener('click', () => onPick(i));
        } else {
          const lk = document.createElement('img'); lk.className = 'lock'; lk.src = TR.Assets.url('lock'); lk.alt = '';
          el.appendChild(lk);
          el.addEventListener('click', () => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); if (this.onLocked) this.onLocked(i); });
        }
        box.appendChild(el);
      }
      if (nextId != null) { const nx = box.querySelector(`[data-lagoon="${nextId}"]`); if (nx) nx.classList.add('next'); }
      // dotted path through the badges
      const svg = $('mapPath'); const r = svg.getBoundingClientRect();
      const w = r.width || 100, h = r.height || 100;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      let d = '';
      pos.forEach(([fx, fy], i) => {
        const x = fx * w, y = fy * h;
        if (i === 0) d += `M${x} ${y}`;
        else { const [px, py] = [pos[i - 1][0] * w, pos[i - 1][1] * h]; d += ` Q${(px + x) / 2} ${py + (y - py) * 0.1 + (i % 2 ? 40 : -40)} ${x} ${y}`; }
      });
      svg.innerHTML = `<path d="${d}"/>`;
      // resume ribbon
      const rs = p.resume;
      $('resumeBar').classList.toggle('hidden', !rs);
      if (rs) $('resumeText').textContent = T(lang, 'ui.resume') + ' · ' + T(lang, 'lagoon.' + LAGOON_KEYS[rs.lagoon - 1] + '.name') + ' · ' + T(lang, 'ui.chapter', { n: rs.level + 1 });
    },

    /* ---------- treasure room ---------- */
    renderTreasure(p, lang) {
      const P = TR.Progress, box = $('trophies'); box.innerHTML = '';
      for (let i = 1; i <= 6; i++) {
        const tr = P.trophy(p, i), lg = (p.lagoons || {})[i] || { stars: [0, 0, 0, 0] };
        const d = document.createElement('div'); d.className = 'trophy-slot';
        const img = document.createElement('img'); img.src = TR.Assets.url('trophy_' + (tr || 'bronze')); img.alt = ''; if (!tr) img.classList.add('dim');
        const b = document.createElement('b'); b.textContent = T(lang, 'lagoon.' + LAGOON_KEYS[i - 1] + '.name');
        const s = document.createElement('small'); s.textContent = '★ ' + (lg.stars || []).reduce((a, c) => a + c, 0) + ' / ' + (P.MAX_LAGOON_STARS || 52);
        d.append(img, b, s); box.appendChild(d);
      }
      const tot = P.totals(p), mins = Math.round((p.playSeconds || 0) / 60);
      $('treasureTotals').textContent = `${T(lang, 'ui.stars')}: ${tot.stars} · ${T(lang, 'ui.pearls')}: ${tot.pearls} · ${T(lang, 'ui.playTime')}: ${mins} ${lang === 'vi' ? 'phút' : 'min'}`;
    },

    /* ---------- settings ---------- */
    bindSettings(s, onChange) {
      const refresh = () => {
        $('optSfx').checked = s.sfx; $('optMusic').checked = s.music; $('optVoice').checked = s.voice; $('optMic').checked = s.mic;
        $('inpVolume').value = s.volume; $('volLabel').textContent = Math.round(s.volume) + '%';
        this.setVolumeMeter(s.volume);
      };
      [['optSfx', 'sfx'], ['optMusic', 'music'], ['optVoice', 'voice'], ['optMic', 'mic']].forEach(([id, k]) =>
        $(id).addEventListener('change', () => { s[k] = $(id).checked; onChange(k); }));
      $('inpVolume').addEventListener('input', () => { s.volume = +$('inpVolume').value; $('volLabel').textContent = s.volume + '%'; this.setVolumeMeter(s.volume); onChange('volume'); });
      this.refreshSettings = refresh;
      refresh();
    },
    setVolumeMeter(v) { $('volMeter').style.width = Math.max(0, Math.min(100, v)) + '%'; },
    setVoiceInfo(text) { $('voiceInfo').textContent = text || ''; },
    renderSettingsProfiles(list, lang, onEdit, onAdd, canAdd) {
      const box = $('settingsProfiles'); box.innerHTML = '';
      list.forEach(p => {
        const b = document.createElement('button');
        b.innerHTML = `<img src="${TR.Assets.url('avatar_' + p.avatar)}" alt=""> ${p.name.replace(/[<>&]/g, '')} <span>${T(lang, 'ui.age')} ${p.age >= 7 ? '7+' : p.age} · ★ ${p.totalStars || 0}</span>`;
        b.addEventListener('click', () => onEdit(p.id));
        box.appendChild(b);
      });
      if (canAdd) { const b = document.createElement('button'); b.textContent = '+ ' + T(lang, 'ui.newProfile'); b.addEventListener('click', onAdd); box.appendChild(b); }
    },
    /* profile editor: fills the form; returns a reader */
    openProfileEdit(p, lang, isNew) {
      $('profileEditTitle').textContent = T(lang, isNew ? 'ui.newProfile' : 'ui.editProfile');
      $('inpName').value = p.name || ''; $('inpSayAs').value = p.sayAs || '';
      this._edit = { age: p.age || 4, avatar: p.avatar || 'turtle' };
      const chips = document.querySelectorAll('#ageChips .chip');
      chips.forEach(c => { c.classList.toggle('on', +c.dataset.age === Math.min(7, this._edit.age)); c.onclick = () => { this._edit.age = +c.dataset.age; chips.forEach(x => x.classList.toggle('on', x === c)); }; });
      const av = $('avatarChips'); av.innerHTML = '';
      (TR.AVATARS || []).forEach(a => {
        const b = document.createElement('button'); b.className = 'chip' + (a === this._edit.avatar ? ' on' : '');
        b.innerHTML = `<img src="${TR.Assets.url('avatar_' + a)}" alt="${a}">`;
        b.addEventListener('click', () => { this._edit.avatar = a; [...av.children].forEach(x => x.classList.toggle('on', x === b)); });
        av.appendChild(b);
      });
      $('btnProfileDelete').classList.toggle('hidden', !!isNew);
      this.only('scrProfileEdit');
    },
    readProfileEdit() {
      return { name: $('inpName').value.replace(/[<>{}]/g, '').trim().slice(0, 16), sayAs: $('inpSayAs').value.replace(/[<>{}]/g, '').trim().slice(0, 16), age: this._edit.age, avatar: this._edit.avatar };
    },

    /* ---------- HUD ---------- */
    setStars(n, bump) {
      $('hudStars').textContent = n;
      if (bump) { const el = $('hudStars').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    },
    setPearls(n, bump) {
      $('hudPearls').textContent = n;
      if (bump) { const el = $('hudPearls').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    },
    setDots(total, done) {
      const box = $('hudDots');
      if (box.childElementCount !== total) { box.innerHTML = ''; for (let i = 0; i < total; i++) box.appendChild(document.createElement('i')); }
      [...box.children].forEach((d, i) => { d.className = i < done ? 'done' : i === done ? 'now' : ''; });
    },
    hudStarPoint() { const r = $('hudStars').parentElement.querySelector('img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
    hudPearlPoint() {
      const el = $('hudPearls').parentElement, r = el.querySelector('img').getBoundingClientRect();
      if (!r.width) return this.hudStarPoint();
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
    placeBubble(rect) {
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
      const sh = talk.show || {}, empty = !sh.sprite && !sh.shape && (sh.text == null || sh.text === '');
      $('talkShow').classList.toggle('hidden', empty);
      if (!empty) requestAnimationFrame(() => TR.Renderer.preview($('talkShow'), sh));
      const box = $('talkChoices'); box.innerHTML = '';
      talk.choices.forEach(c => {
        const b = document.createElement('button');
        b.dataset.id = c.id;
        const visual = this._choiceVisual(c);
        if (visual) {
          const cv = document.createElement('canvas'); b.appendChild(cv);
          requestAnimationFrame(() => TR.Renderer.preview(cv, visual));
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
        case 'color': return { sprite: 'shell_' + c.value };
        case 'shape': return { shape: c.value, color: 'blue' };
        case 'animal': return { sprite: 'animal_' + c.value };
        case 'size': return { sprite: 'shell_yellow', scale: c.value === 'big' ? 1 : 0.55 };
        case 'number': return this._age <= 5 && c.value >= 1 && c.value <= 10 ? { dots: +c.value, text: String(c.value) } : null;
        default: return null;
      }
    },
    glowTalk(answerId) { [...$('talkChoices').children].forEach(b => { if (b.dataset.id === String(answerId)) b.classList.add('glow'); }); },
    markTalk(choiceId, answerId) {
      [...$('talkChoices').children].forEach(b => {
        if (b.dataset.id === String(answerId)) b.classList.add('right');
        else if (b.dataset.id === String(choiceId)) b.classList.add('wrongpick');
      });
      $('btnMic').classList.remove('listening');
    },
    setListening(on, text) { $('btnMic').classList.toggle('listening', !!on); if (text) $('micLabel').textContent = text; },

    /* ---------- lagoon done ---------- */
    showDone(lang, { lagoon, stars, pearls, trophy, hasNext }) {
      $('doneTitle').textContent = T(lang, 'ui.lagoonDone') + ' ' + T(lang, 'lagoon.' + LAGOON_KEYS[lagoon - 1] + '.name');
      $('doneStars').textContent = stars; $('donePearls').textContent = pearls;
      $('doneTrophy').src = TR.Assets.url('trophy_' + (trophy || 'bronze'));
      $('btnNextText').textContent = T(lang, hasNext ? 'ui.nextLagoon' : 'ui.playAgain');
      this.only('scrDone');
    }
  };
  TR.UI = UI;
  TR.LAGOON_KEYS = LAGOON_KEYS;
})(window.TR = window.TR || {});
