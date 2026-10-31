/* DJ.UI — menus, settings and the "Change Pictures" screen (DOM overlay on top of the canvas). */
(function (DJ) {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCREENS = ['scrTitle', 'scrPause', 'scrOver', 'scrHow', 'scrSettings', 'scrCustom'];

  const UI = {
    game: null,
    current: null,
    backTo: 'scrTitle',

    init(game) {
      this.game = game;
      // Buttons answer a touch on pointerup as well: iOS sends no 'click' for a second finger, so a child steering
      // with one thumb could not otherwise tap Pause. The click that follows a handled touch is skipped.
      const tap = (el, fn) => {
        el.addEventListener('pointerup', e => {
          if (e.pointerType !== 'touch') return;
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          if (!hit || !el.contains(hit)) return;   // finger slid off: cancelled
          el._tapAt = performance.now(); UI._ghostUntil = el._tapAt + 600; e.stopPropagation(); fn(e);
        });
        el.addEventListener('click', e => { if (el._tapAt && performance.now() - el._tapAt < 600) { e.stopPropagation(); return; } fn(e); });
      };
      this.tap = tap;
      // ghost click: after a touch tap opened a new screen, the browser's delayed 'click' would land on whatever
      // button is now under the finger (e.g. "OK" on How to Play). Swallow that one click, anywhere.
      document.addEventListener('click', e => {
        if (UI._ghostUntil && performance.now() < UI._ghostUntil) { UI._ghostUntil = 0; e.stopPropagation(); e.preventDefault(); }
      }, true);
      const click = (id, fn) => tap($(id), e => { e.stopPropagation(); DJ.Audio.unlock(); DJ.Audio.play('click'); fn(e); });
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
        DJ.Assets.SLOTS.forEach(s => DJ.Assets.clearCustom(s.id));
        this.renderSlots(); game.picturesChanged(); this.toast('All pictures reset to the originals');
      });
      click('btnResetBest', () => { game.resetBest(); this.toast('Best scores cleared'); });
      document.querySelectorAll('.btn-back').forEach(b => tap(b, e => { e.stopPropagation(); DJ.Audio.play('click'); this.back(); }));

      // settings controls
      $('setSfx').addEventListener('change', e => game.setSetting('sfx', e.target.checked));
      $('setMusic').addEventListener('change', e => game.setSetting('music', e.target.checked));
      $('setFull').addEventListener('change', e => game.setFullscreen(e.target.checked));
      this.seg('setDifficulty', v => game.setSetting('difficulty', v));

      // hidden file input used by the picture slots
      this.filePick = $('filePick');
      this.filePick.addEventListener('change', () => {
        const f = this.filePick.files && this.filePick.files[0];
        if (f && this._pickSlot) this.applyFile(this._pickSlot, f);
        this.filePick.value = '';
      });
      if (game.isApp) $('btnQuit').classList.remove('hidden');
      if (game.isTouch) document.body.classList.add('touch');
      if (!game.isApp && !document.fullscreenEnabled) $('rowFull').classList.add('hidden');
      this.renderSlots();
      this.syncSettings();
    },

    seg(id, onPick) {
      $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation(); DJ.Audio.play('click');
        onPick(b.dataset.v); this.syncSettings();
      }));
    },

    syncSettings() {
      const s = this.game.settings;
      $('setSfx').checked = s.sfx; $('setMusic').checked = s.music; $('setFull').checked = !!this.game.fullscreen;
      $('setDifficulty').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === s.difficulty));
      this.syncMute();
    },
    syncMute() {
      const m = this.game.settings.muted || this.game.urlMute;
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
      const first = id && ($(id).querySelector('.btn-big') || $(id).querySelector('.btn-back') || $(id).querySelector('.btn'));   // never a destructive button (Reset best) or a file picker
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    },
    open(id, backTo) { this.backTo = backTo; this.show(id); },
    back() {
      if (this.current === 'scrCustom') this.game.picturesChanged();
      this.show(this.backTo || 'scrTitle');
    },
    setHud(on) { $('hud').classList.toggle('hidden', !on); if (on && this.game.renderer) this.game.renderer._measureHud(); },

    showGameOver(info) {
      $('overScore').textContent = info.score;
      $('overBest').textContent = info.best;
      $('newBest').classList.toggle('hidden', !info.newBest);
      const c = info.cleared;   // biomes cleared: 1 bronze, 2 silver, 3 gold, 4+ platinum
      const m = c >= 4 ? 'platinum' : c >= 3 ? 'gold' : c >= 2 ? 'silver' : c >= 1 ? 'bronze' : 'none';
      $('medal').className = 'medal ' + m;
      $('medalName').textContent = m === 'none' ? 'Finish a song for a medal' : m[0].toUpperCase() + m.slice(1) + ' medal';
      $('overStats').innerHTML = `Notes collected: <b>${info.notes}</b> · Longest tail: <b>${info.longest}</b><br>Pillow dodges: <b>${info.dodges}</b> · Bonks: <b>${info.bonks}</b><br>Reached: <b>${info.zoneName}</b>`;
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
      const A = DJ.Assets, grid = $('slotGrid');
      grid.innerHTML = '';
      const defaultPreview = s => s.id === 'hero' ? A.files.spike_idle : s.id === 'note' ? A.files.note_0 : s.id === 'pillow' ? A.files.pillow : null;
      A.SLOTS.forEach(s => {
        const custom = A.hasCustom(s.id);
        const el = document.createElement('div');
        el.className = 'slot';
        const title = s.kind === 'bg' ? s.name : s.name;
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
          const gr = A.img[n + '_ground'], ed = A.img[n + '_edge'], dc = A.img[n + '_decor_3'];
          if (gr) { g.drawImage(gr, 0, 0, 180, 180); g.drawImage(gr, 180, 0, 180, 180); }
          if (ed) { g.drawImage(ed, 0, 0, 180, 25); g.drawImage(ed, 180, 0, 180, 25); }
          if (dc) g.drawImage(dc, 230, 80, 90, 90);
          prev.appendChild(c);
        } else {
          const img = new Image(); img.src = defaultPreview(s); prev.appendChild(img);
        }
        if (s.kind === 'char') {
          const shape = DJ.Storage.get('shape_' + s.id, 'fit');
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
        await DJ.Assets.setCustom(slotId, file);
        this.renderSlots();
        this.toast('Picture saved on this device!');
      } catch (e) {
        this.toast(e.message || 'Could not use that picture', 3200);
      }
    }
  };
  DJ.UI = UI;
})(window.DJ = window.DJ || {});
