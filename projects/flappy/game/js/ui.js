/* FF.UI — menus, settings and the "Change Pictures" screen (DOM overlay on top of the canvas). */
(function (FF) {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCREENS = ['scrTitle', 'scrPause', 'scrOver', 'scrHow', 'scrSettings', 'scrCustom'];

  const UI = {
    game: null,
    current: null,
    backTo: 'scrTitle',

    init(game) {
      this.game = game;
      const click = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); FF.Audio.unlock(); FF.Audio.play('click'); fn(e); });
      click('btnPlay', () => game.startGame());
      click('btnCustomize', () => this.open('scrCustom', 'scrTitle'));
      click('btnHow', () => this.open('scrHow', 'scrTitle'));
      click('btnSettings', () => this.open('scrSettings', 'scrTitle'));
      click('btnQuit', () => game.quit());
      click('btnResume', () => game.resume());
      click('btnRestart', () => game.startGame());
      click('btnPauseSettings', () => this.open('scrSettings', 'scrPause'));
      click('btnPauseMenu', () => game.toTitle());
      click('btnAgain', () => game.startGame());
      click('btnOverMenu', () => game.toTitle());
      click('btnPause', () => game.pause());
      click('btnMuteHud', () => game.toggleMute());
      click('btnResetAll', () => {
        FF.Assets.SLOTS.forEach(s => FF.Assets.clearCustom(s.id));
        this.renderSlots(); game.picturesChanged(); this.toast('All pictures reset to the originals');
      });
      click('btnResetBest', () => { game.resetBest(); this.toast('Best scores cleared'); });
      document.querySelectorAll('.btn-back').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); FF.Audio.play('click'); this.back(); }));

      // settings controls
      $('setSfx').addEventListener('change', e => game.setSetting('sfx', e.target.checked));
      $('setMusic').addEventListener('change', e => game.setSetting('music', e.target.checked));
      $('setFull').addEventListener('change', e => game.setFullscreen(e.target.checked));
      this.seg('setDifficulty', v => game.setSetting('difficulty', v));
      this.seg('setSeasonPts', v => game.setSetting('seasonPts', parseInt(v, 10)));

      // hidden file input used by the picture slots
      this.filePick = $('filePick');
      this.filePick.addEventListener('change', () => {
        const f = this.filePick.files && this.filePick.files[0];
        if (f && this._pickSlot) this.applyFile(this._pickSlot, f);
        this.filePick.value = '';
      });
      if (game.isApp) $('btnQuit').classList.remove('hidden');
      this.renderSlots();
      this.syncSettings();
    },

    seg(id, onPick) {
      $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation(); FF.Audio.play('click');
        onPick(b.dataset.v); this.syncSettings();
      }));
    },

    syncSettings() {
      const s = this.game.settings;
      $('setSfx').checked = s.sfx; $('setMusic').checked = s.music; $('setFull').checked = !!this.game.fullscreen;
      $('setDifficulty').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === s.difficulty));
      $('setSeasonPts').querySelectorAll('button').forEach(b => b.classList.toggle('on', parseInt(b.dataset.v, 10) === s.seasonPts));
      this.syncMute();
    },
    syncMute() {
      const m = this.game.settings.muted;
      $('btnMuteHud').innerHTML = m
        ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
    },

    hideAll() { SCREENS.forEach(id => $(id).classList.add('hidden')); this.current = null; },
    show(id) {
      this.hideAll();
      if (id) { $(id).classList.remove('hidden'); this.current = id; }
      if (id === 'scrSettings') this.syncSettings();
      if (id === 'scrCustom') this.renderSlots();
      if (id === 'scrTitle') $('bestTitle').textContent = this.game.best();
      // focus the main button so keyboard users can press Enter
      const first = id && $(id).querySelector('.btn-big, .btn');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    },
    open(id, backTo) { this.backTo = backTo; this.show(id); },
    back() {
      if (this.current === 'scrCustom') this.game.picturesChanged();
      this.show(this.backTo || 'scrTitle');
    },
    setHud(on) { $('hud').classList.toggle('hidden', !on); },

    showGameOver(info) {
      $('overScore').textContent = info.score;
      $('overBest').textContent = info.best;
      $('newBest').classList.toggle('hidden', !info.newBest);
      const medal = $('medal');
      const m = info.score >= 40 ? 'platinum' : info.score >= 30 ? 'gold' : info.score >= 20 ? 'silver' : info.score >= 10 ? 'bronze' : 'none';
      medal.className = 'medal ' + m;
      $('medalName').textContent = m === 'none' ? 'Medal at 10 points' : m[0].toUpperCase() + m.slice(1) + ' medal';
      const acc = info.drops ? Math.round(100 * info.hits / info.drops) : 0;
      $('overStats').innerHTML = `Turtles fed: <b>${info.hits}</b> · Best combo: <b>${info.bestCombo}</b><br>Treats dropped: <b>${info.drops}</b> · Aim: <b>${acc}%</b><br>Reached: <b>${info.seasonName}</b>`;
      this.show('scrOver');
    },

    toast(msg, ms = 2200) {
      const t = $('toast');
      t.textContent = msg; t.classList.remove('hidden');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.add('hidden'), ms);
    },

    // ---------- Change Pictures ----------
    renderSlots() {
      const A = FF.Assets, grid = $('slotGrid');
      grid.innerHTML = '';
      const defaultPreview = s => s.id === 'bird' ? A.files.bird_mid : s.id === 'drop' ? A.files.drop : s.id === 'turtle' ? A.files.turtle_walk1 : null;
      A.SLOTS.forEach(s => {
        const custom = A.hasCustom(s.id);
        const el = document.createElement('div');
        el.className = 'slot';
        const title = s.kind === 'bg' ? s.name + ' background' : s.name;
        el.innerHTML = `<h3>${title}</h3><div class="prev ${s.kind === 'bg' ? 'bg' : ''}"></div>
          <div class="tag ${custom ? 'custom' : ''}">${custom ? '★ Your picture' : 'Original'}</div>
          ${s.kind === 'char' ? `<div class="shape"><button data-shape="fit">Whole picture</button><button data-shape="circle">Round</button></div>` : ''}
          <div class="btns"><button class="btn btn-orange btn-tiny" data-act="pick">Choose…</button>
          <button class="btn btn-grey btn-tiny" data-act="reset" ${custom ? '' : 'disabled style="opacity:.45"'}>Reset</button></div>`;
        const prev = el.querySelector('.prev');
        if (custom) {
          const c = A.custom[s.id];
          const img = new Image(); img.src = c.toDataURL(); prev.appendChild(img);
        } else if (s.kind === 'bg') {
          const c = document.createElement('canvas'); c.width = 320; c.height = 180;
          c.style.width = '100%'; c.style.height = '100%';
          const g = c.getContext('2d'); const n = A.SEASONS[s.season];
          ['sky', 'clouds', 'far', 'mid'].forEach(l => { const im = A.img[n + '_' + l]; if (im) g.drawImage(im, 0, 0, 320, 180); });
          const gr = A.img[n + '_ground']; if (gr) g.drawImage(gr, 0, 153, 320, 27);
          prev.appendChild(c);
        } else {
          const img = new Image(); img.src = defaultPreview(s); prev.appendChild(img);
        }
        if (s.kind === 'char') {
          const shape = FF.Storage.get('shape_' + s.id, 'fit');
          el.querySelectorAll('.shape button').forEach(b => {
            b.classList.toggle('on', b.dataset.shape === shape);
            b.disabled = !custom; if (!custom) b.style.opacity = .5;
            b.addEventListener('click', e => { e.stopPropagation(); A.setShape(s.id, b.dataset.shape); this.renderSlots(); });
          });
        }
        el.querySelector('[data-act=pick]').addEventListener('click', e => { e.stopPropagation(); this._pickSlot = s.id; this.filePick.click(); });
        el.querySelector('[data-act=reset]').addEventListener('click', e => {
          e.stopPropagation(); A.clearCustom(s.id); this.renderSlots(); this.toast(title + ' reset');
        });
        prev.addEventListener('click', () => { this._pickSlot = s.id; this.filePick.click(); });
        prev.style.cursor = 'pointer';
        // drag & drop
        el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag'));
        el.addEventListener('drop', e => {
          e.preventDefault(); el.classList.remove('drag');
          const f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) this.applyFile(s.id, f);
        });
        grid.appendChild(el);
      });
    },

    async applyFile(slotId, file) {
      try {
        await FF.Assets.setCustom(slotId, file);
        this.renderSlots();
        this.toast('Picture saved!');
      } catch (e) {
        this.toast(e.message || 'Could not use that picture', 3200);
      }
    }
  };
  FF.UI = UI;
})(window.FF = window.FF || {});
