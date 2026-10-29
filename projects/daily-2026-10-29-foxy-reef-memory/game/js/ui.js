/* RF.UI — menus, settings and the "Change Pictures" screen (DOM overlay on top of the canvas). */
(function (RF) {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCREENS = ['scrTitle', 'scrPause', 'scrOver', 'scrHow', 'scrSettings', 'scrCustom'];

  const UI = {
    game: null,
    current: null,
    backTo: 'scrTitle',

    init(game) {
      this.game = game;
      const click = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); RF.Audio.unlock(); RF.Audio.play('click'); fn(e); });
      click('btnPlay', () => game.startGame());
      click('btnCustomize', () => this.open('scrCustom', 'scrTitle'));
      click('btnHow', () => this.open('scrHow', 'scrTitle'));
      click('btnSettings', () => this.open('scrSettings', 'scrTitle'));
      click('btnQuit', () => game.quit());
      click('btnResume', () => game.resume());
      click('btnRestart', () => game.startGame());
      click('btnPauseSettings', () => this.open('scrSettings', 'scrPause'));
      click('btnPauseMenu', () => game.toTitle());
      click('btnAgain', () => { if (game.canRestart()) game.startGame(); });
      click('btnOverMenu', () => game.toTitle());
      click('btnPause', () => game.pause());
      click('btnMuteHud', () => game.toggleMute());
      click('btnResetAll', () => {
        RF.Assets.SLOTS.forEach(s => RF.Assets.clearCustom(s.id));
        this.renderSlots(); game.picturesChanged(); this.toast('All pictures reset to the originals');
      });
      click('btnResetBest', () => { game.resetBest(); this.toast('Best scores cleared'); });
      document.querySelectorAll('.btn-back').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); RF.Audio.play('click'); this.back(); }));

      // settings controls
      $('setSfx').addEventListener('change', e => game.setSetting('sfx', e.target.checked));
      $('setMusic').addEventListener('change', e => game.setSetting('music', e.target.checked));
      $('setFull').addEventListener('change', e => game.setFullscreen(e.target.checked));
      this.seg('setDifficulty', v => game.setSetting('difficulty', v));
      this.seg('setPeek', v => game.setSetting('peek', v === 'auto' ? 'auto' : parseInt(v, 10)));

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
        e.stopPropagation(); RF.Audio.play('click');
        onPick(b.dataset.v); this.syncSettings();
      }));
    },

    syncSettings() {
      const s = this.game.settings;
      $('setSfx').checked = s.sfx; $('setMusic').checked = s.music; $('setFull').checked = !!this.game.fullscreen;
      $('setDifficulty').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === s.difficulty));
      $('setPeek').querySelectorAll('button').forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(s.peek)));
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
      // medals by seasons cleared: 1 bronze, 2 silver, 3 gold, 4+ platinum
      const c = info.cleared;
      const m = c >= 4 ? 'platinum' : c >= 3 ? 'gold' : c >= 2 ? 'silver' : c >= 1 ? 'bronze' : 'none';
      medal.className = 'medal ' + m;
      $('medalName').textContent = m === 'none' ? 'Clear a season for a medal' : m[0].toUpperCase() + m.slice(1) + ' medal';
      const tries = info.matches + info.mistakes;
      const acc = tries ? Math.round(100 * info.matches / tries) : 0;
      $('overStats').innerHTML = `Pairs found: <b>${info.matches}</b> · Best combo: <b>${info.bestCombo}</b><br>Cupcakes eaten: <b>${info.cupcakes}</b> · Memory: <b>${acc}%</b><br>Reached: <b>${info.seasonName}</b>`;
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
      const A = RF.Assets, grid = $('slotGrid');
      grid.innerHTML = '';
      const defaultPreview = s => s.id === 'hero' ? A.files.fox_swim1 : s.id === 'treat' ? A.files.cupcake : s.id === 'cardback' ? A.files.card_back : null;
      A.SLOTS.forEach(s => {
        const custom = A.hasCustom(s.id);
        const el = document.createElement('div');
        el.className = 'slot';
        const title = s.kind === 'bg' ? s.name + ' sea' : s.name;
        el.innerHTML = `<h3>${title}</h3><div class="prev ${s.kind === 'bg' ? 'bg' : ''}"></div>
          <div class="tag ${custom ? 'custom' : ''}">${custom ? '★ Your picture' : 'Original'}</div>
          ${s.kind === 'char' ? `<div class="shape"><button data-shape="fit">Whole picture</button><button data-shape="circle">Round</button></div>` : ''}
          <div class="btns"><button class="btn btn-orange btn-tiny" data-act="pick">Choose…</button>
          <button class="btn btn-grey btn-tiny" data-act="reset" ${custom ? '' : 'disabled style="opacity:.45"'}>Reset</button></div>`;
        const prev = el.querySelector('.prev');
        if (custom) {
          const c = A.custom[s.id];
          const img = new Image(); img.src = A.thumb(s.id); prev.appendChild(img);
        } else if (s.kind === 'bg') {
          const c = document.createElement('canvas'); c.width = 320; c.height = 180;
          c.style.width = '100%'; c.style.height = '100%';
          const g = c.getContext('2d'); const n = A.SEASONS[s.season];
          ['water', 'far', 'mid'].forEach(l => { const im = A.img[n + '_' + l]; if (im) g.drawImage(im, 0, 0, 320, 180); });
          const gr = A.img[n + '_floor']; if (gr) g.drawImage(gr, 0, 150, 320, 30);
          prev.appendChild(c);
        } else {
          const img = new Image(); img.src = defaultPreview(s); prev.appendChild(img);
        }
        if (s.kind === 'char') {
          const shape = RF.Storage.get('shape_' + s.id, 'fit');
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
        this.toast('Saving picture…', 4000);
        await RF.Assets.setCustom(slotId, file);
        this.renderSlots();
        this.toast('Picture saved on this computer!');
      } catch (e) {
        this.toast(e.message || 'Could not use that picture', 3200);
      }
    }
  };
  RF.UI = UI;
})(window.RF = window.RF || {});
