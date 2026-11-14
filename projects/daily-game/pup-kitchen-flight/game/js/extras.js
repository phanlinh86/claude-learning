/* extras.js — drop-in for the daily games (shared source: shared/daily-mobile/extras.js; each game keeps its own copy in
 * game/js/extras.js so it stays self-contained). Load it LAST:
 *   <script src="js/extras.js" data-ns="PVM" data-prefix="pvm:"></script>
 * Adds, without touching the game's own code:
 *  1. A "Volume" slider in Settings (0–100 %, default 100 %, saved per game) → NS.Audio.setVolume(v).
 *  2. A "Score Card" button on the game-over screen: draws a shareable 1080×1350 picture (game name, hero, score, best,
 *     medal, stats, date, the play link) and opens the share sheet (iPhone / iPad: Messages, WhatsApp, Photos …),
 *     with "Save picture" and "Copy text" fallbacks for browsers without file sharing.
 * Relies on the shared DOM ids of the daily games: #scrOver #overScore #overBest #medal #medalName #overStats
 * #titleIcon #scrSettings .settings #btnAgain, and on NS.Storage (get/set) and NS.Audio when present. */
(function () {
  'use strict';
  const me = document.currentScript || document.querySelector('script[src$="extras.js"]');
  const NSNAME = (me && me.dataset.ns) || '';
  const PREFIX = (me && me.dataset.prefix) || 'game:';
  const NS = () => (NSNAME && window[NSNAME]) || {};
  const $ = id => document.getElementById(id);
  const TITLE = () => (me && me.dataset.title) || document.title || 'Daily game';
  const PLAY_URL = () => (me && me.dataset.url) || (location.origin + location.pathname).replace(/index\.html$/, '');
  const MEDAL = {
    none: ['#ead9b6', '#c9ad7c'], bronze: ['#f5c08a', '#9a5520'], silver: ['#ffffff', '#8f9aa5'],
    gold: ['#fff3b0', '#c9930a'], platinum: ['#ffffff', '#7fb6d6']
  };

  // ---------------- storage (the game's own store when it has one: the Windows app saves to files) ----------------
  function sget(k, d) {
    // the game's store loads asynchronously at boot: before that (and in a plain browser) read localStorage directly
    try { const S = NS().Storage; if (S && S.get) { const v = S.get(k); if (v != null) return v; } } catch (e) { /* fall through */ }
    try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : v; } catch (e) { return d; }
  }
  function sset(k, v) {
    try { const S = NS().Storage; if (S && S.set) { S.set(k, String(v)); return; } } catch (e) { /* fall through */ }
    try { localStorage.setItem(PREFIX + k, String(v)); } catch (e) { /* private mode */ }
  }

  // ---------------- 1. volume ----------------
  function volume() { const v = parseFloat(sget('volume', '1')); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; }
  function applyVolume(v) { const A = NS().Audio; if (A && A.setVolume) A.setVolume(v); }
  function addVolumeRow() {
    const box = document.querySelector('#scrSettings .settings');
    if (!box || $('setVolume')) return;
    const row = document.createElement('div');
    row.className = 'set set-volume';
    row.innerHTML = '<span>Volume</span><span class="vol-wrap"><button type="button" class="vol-step" data-d="-1" aria-label="Quieter">−</button>' +
      '<input type="range" id="setVolume" min="0" max="100" step="5" aria-label="Volume"><b id="setVolumeVal"></b>' +
      '<button type="button" class="vol-step" data-d="1" aria-label="Louder">+</button></span>';
    box.insertBefore(row, box.children[2] || null);   // under Sound effects / Music
    const r = $('setVolume'), out = $('setVolumeVal');
    const show = () => { r.value = Math.round(volume() * 100); out.textContent = r.value + '%'; };
    const set = v => { v = Math.max(0, Math.min(100, Math.round(v / 5) * 5)); sset('volume', (v / 100).toFixed(2)); applyVolume(v / 100); show(); };
    r.addEventListener('input', () => set(+r.value));
    row.querySelectorAll('.vol-step').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); set(+r.value + (+b.dataset.d) * 10);
      const A = NS().Audio; if (A && A.play) { try { A.unlock && A.unlock(); A.play('click'); } catch (err) { /* ignore */ } }
    }));
    ['pointerdown', 'touchstart'].forEach(ev => row.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    r.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
    show();
    // re-read when Settings opens (the Windows app's file store is only loaded after boot)
    const scr = $('scrSettings');
    if (scr && window.MutationObserver) new MutationObserver(() => { if (!scr.classList.contains('hidden')) show(); }).observe(scr, { attributes: true, attributeFilter: ['class'] });
  }

  // ---------------- 2. score card ----------------
  function addScoreButton() {
    const over = $('scrOver'); if (!over || $('btnScoreCard')) return;
    const again = $('btnAgain');
    const row = document.createElement('div');
    row.className = 'menu row sc-row';
    row.innerHTML = '<button id="btnScoreCard" class="btn btn-blue btn-small" type="button"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 5h16v11H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M7 13l3-3 3 3 2-2 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M12 21v-4M9 19l3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>&nbsp; Score Card</button>';
    const anchor = again && again.closest('.menu');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(row, anchor.nextSibling); else over.querySelector('.panel').appendChild(row);
    const b = $('btnScoreCard');
    let busy = false;
    const go = async e => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (busy) return; busy = true;
      try { await openCard(); } catch (err) { console.warn('score card', err); toast('Could not make the score card'); }
      busy = false;
    };
    b.addEventListener('click', go);
    ['pointerdown', 'touchstart'].forEach(ev => b.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
  }

  function toast(msg) {
    const UI = NS().UI; if (UI && UI.toast) { UI.toast(msg); return; }
    const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function readInfo() {
    const txt = id => { const el = $(id); return el ? (el.textContent || '').trim() : ''; };
    const medalEl = $('medal');
    const medal = medalEl ? (['platinum', 'gold', 'silver', 'bronze'].find(m => medalEl.classList.contains(m)) || 'none') : 'none';
    const statsEl = $('overStats');
    let stats = [];
    if (statsEl) {
      stats = (statsEl.innerText || statsEl.textContent || '').split(/\n|·/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6);
    }
    const newBest = $('newBest') && !$('newBest').classList.contains('hidden');
    return { score: txt('overScore') || '0', best: txt('overBest') || '0', medal, medalName: medal === 'none' ? '' : txt('medalName'), stats, newBest };
  }

  function loadImg(src) {
    return new Promise(res => { if (!src) { res(null); return; } const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fitText(g, text, max, size, weight, font) {
    let s = size; g.font = weight + ' ' + s + 'px ' + font;
    while (g.measureText(text).width > max && s > 14) { s -= 2; g.font = weight + ' ' + s + 'px ' + font; }
    return s;
  }

  async function makeCard() {
    const W = 1080, H = 1350, info = readInfo();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const FONT = (css.getPropertyValue('--font') || '').trim() || '"Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
    // background: the game itself (the canvas behind the game-over panel), cover-fitted, softly darkened
    const gc = $('game');
    g.fillStyle = '#2f6f8f'; g.fillRect(0, 0, W, H);
    if (gc && gc.width) {
      try {
        const k = Math.max(W / gc.width, H / gc.height), dw = gc.width * k, dh = gc.height * k;
        g.drawImage(gc, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } catch (e) { /* tainted canvas: keep the plain colour */ }
    }
    const sh = g.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, 'rgba(12,30,48,.55)'); sh.addColorStop(0.5, 'rgba(12,30,48,.35)'); sh.addColorStop(0.82, 'rgba(12,30,48,.7)'); sh.addColorStop(1, 'rgba(12,30,48,.92)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    // card
    const cx = 70, cy = 230, cw = W - 140, ch = 900;
    g.fillStyle = 'rgba(0,0,0,.25)'; rr(g, cx, cy + 14, cw, ch, 56); g.fill();
    g.fillStyle = '#fffaf0'; rr(g, cx, cy, cw, ch, 56); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#f2c46b'; rr(g, cx + 5, cy + 5, cw - 10, ch - 10, 52); g.stroke();
    // title
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const title = TITLE();
    const ts = fitText(g, title, W - 120, 88, '900', FONT);
    g.lineWidth = Math.max(8, ts * 0.16); g.lineJoin = 'round'; g.strokeStyle = 'rgba(10,40,60,.9)'; g.strokeText(title, W / 2, 120);
    g.fillStyle = '#ffffff'; g.fillText(title, W / 2, 120);
    g.font = '700 34px ' + FONT; g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText('My score card', W / 2, 190);
    // hero
    const icon = $('titleIcon');
    const hero = await loadImg(icon && (icon.currentSrc || icon.src));
    if (hero) {
      const hs = 250, k = Math.min(hs / (hero.naturalWidth || hs), hs / (hero.naturalHeight || hs));
      const hw = (hero.naturalWidth || hs) * k, hh = (hero.naturalHeight || hs) * k;
      g.drawImage(hero, W / 2 - hw / 2 - 250, cy + 70, hw, hh);
    }
    // medal
    const M = MEDAL[info.medal] || MEDAL.none, mx = W / 2 + 250, my = cy + 195;
    const mg = g.createRadialGradient(mx - 30, my - 35, 10, mx, my, 110);
    mg.addColorStop(0, M[0]); mg.addColorStop(1, M[1]);
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, 105, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(mx, my, 60, 0, Math.PI * 2); g.fill();
    if (info.medal === 'none') { g.font = '900 90px ' + FONT; g.fillStyle = '#c9ad7c'; g.fillText('★', mx, my + 4); }
    g.font = '800 32px ' + FONT; g.fillStyle = '#6b4a2b';
    g.fillText(info.medalName || (info.medal === 'none' ? 'Keep playing!' : ''), mx, my + 145);
    // score
    g.font = '800 40px ' + FONT; g.fillStyle = '#2f9fb5'; g.fillText('SCORE', W / 2, cy + 420);
    const ss = fitText(g, info.score, cw - 120, 190, '900', FONT);
    g.lineWidth = 14; g.strokeStyle = '#7a4a12'; g.strokeText(info.score, W / 2, cy + 540);
    const sg = g.createLinearGradient(0, cy + 540 - ss / 2, 0, cy + 540 + ss / 2); sg.addColorStop(0, '#ffe066'); sg.addColorStop(1, '#ff9f43');
    g.fillStyle = sg; g.fillText(info.score, W / 2, cy + 540);
    g.font = '800 44px ' + FONT; g.fillStyle = '#6b4a2b';
    g.fillText('Best: ' + info.best + (info.newBest ? '   ★ NEW BEST!' : ''), W / 2, cy + 660);
    // stats
    g.font = '600 32px ' + FONT; g.fillStyle = '#5a4030';
    const lines = []; let cur = '';
    for (const s of info.stats) { const t = cur ? cur + '   ·   ' + s : s; if (g.measureText(t).width > cw - 100 && cur) { lines.push(cur); cur = s; } else cur = t; }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((l, i) => { fitText(g, l, cw - 90, 32, '600', FONT); g.fillText(l, W / 2, cy + 740 + i * 46); });
    // footer
    const d = new Date();
    g.font = '700 34px ' + FONT; g.fillStyle = '#ffffff';
    g.fillText('Can you beat me? Play free on iPhone, iPad or computer', W / 2, H - 150);
    const url = PLAY_URL().replace(/^https?:\/\//, '');
    fitText(g, url, W - 100, 30, '600', FONT); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(url, W / 2, H - 100);
    g.font = '600 26px ' + FONT; g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillText(d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), W / 2, H - 55);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const text = 'I scored ' + info.score + ' in ' + title + '!' + (info.medal !== 'none' ? ' (' + info.medalName + ')' : '') + ' Can you beat me? ' + PLAY_URL();
    return { canvas: c, blob, text, info };
  }

  function ensureModal() {
    let m = $('scScreen'); if (m) return m;
    m = document.createElement('section');
    m.id = 'scScreen'; m.className = 'screen dim hidden sc-screen';
    m.innerHTML = '<div class="panel sc-panel"><h2>Score Card</h2><div class="sc-prev"><img id="scImg" alt="Score card"></div>' +
      '<div class="menu row sc-btns"><button id="scShare" class="btn btn-green" type="button">Share…</button>' +
      '<a id="scSave" class="btn btn-orange" download="score-card.png" role="button">Save picture</a>' +
      '<button id="scCopy" class="btn btn-blue" type="button">Copy text</button>' +
      '<button id="scClose" class="btn btn-grey" type="button">Close</button></div></div>';
    const stage = $('stage') || document.body;
    stage.appendChild(m);
    ['pointerdown', 'touchstart'].forEach(ev => m.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    m.addEventListener('click', e => { if (e.target === m) close(); });
    $('scClose').addEventListener('click', e => { e.stopPropagation(); close(); });
    document.addEventListener('keydown', e => { if (!m.classList.contains('hidden') && (e.code === 'Escape')) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
    return m;
  }
  let current = null;
  function close() {
    const m = $('scScreen'); if (m) m.classList.add('hidden');
    if (current && current.url) { try { URL.revokeObjectURL(current.url); } catch (e) { /* ignore */ } }
    current = null;
    const b = $('btnScoreCard'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 30);
  }

  async function openCard() {
    const card = await makeCard();
    const m = ensureModal();
    if (current && current.url) URL.revokeObjectURL(current.url);
    const url = URL.createObjectURL(card.blob);
    current = { url, card };
    const slug = TITLE().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
    const fname = slug + '-score-' + card.info.score + '.png';
    $('scImg').src = url;
    const save = $('scSave'); save.href = url; save.download = fname;
    const file = (typeof File === 'function') ? new File([card.blob], fname, { type: 'image/png' }) : null;
    const canFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    const share = $('scShare');
    share.classList.toggle('hidden', !(canFiles || navigator.share));
    share.onclick = async e => {
      e.stopPropagation();
      try {
        if (canFiles) await navigator.share({ files: [file], title: TITLE(), text: card.text });
        else await navigator.share({ title: TITLE(), text: card.text, url: PLAY_URL() });
      } catch (err) { if (err && err.name !== 'AbortError') toast('Sharing did not work — try Save picture'); }
    };
    $('scCopy').onclick = async e => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(card.text); toast('Copied! Paste it in a message'); }
      catch (err) { toast(card.text); }
    };
    m.classList.remove('hidden');
    setTimeout(() => { const f = share.classList.contains('hidden') ? save : share; f.focus({ preventScroll: true }); }, 30);
    window.__scoreCard = { text: card.text, info: card.info, w: card.canvas.width, h: card.canvas.height, bytes: card.blob ? card.blob.size : 0 };   // for tests
  }

  function addStyles() {
    if ($('extrasCss')) return;
    const s = document.createElement('style'); s.id = 'extrasCss';
    s.textContent = [
      '.sc-row{margin-top:calc(var(--u,1vmin)*1)}',
      '#btnScoreCard .i{width:1.1em;height:1.1em;vertical-align:-0.15em}',
      '.sc-screen{z-index:60}',
      '.sc-panel{display:flex;flex-direction:column;align-items:center;max-height:94vh;max-height:94dvh}',
      '.sc-prev{flex:1 1 auto;min-height:0;display:flex;justify-content:center}',
      '.sc-prev img{max-width:min(78vw,420px);max-height:min(62vh,62dvh);height:auto;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.3)}',
      '.sc-btns{flex-wrap:wrap}',
      '.sc-btns .btn{min-width:0;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}',
      '.set-volume .vol-wrap{display:flex;align-items:center;gap:8px}',
      '.set-volume input[type=range]{width:min(28vw,180px);accent-color:#5cc65a;touch-action:pan-x}',
      '.set-volume b{min-width:3.2em;text-align:right;font-variant-numeric:tabular-nums}',
      '.vol-step{font:900 20px/1 system-ui,sans-serif;width:36px;height:36px;border-radius:50%;border:none;background:#3fa0c8;color:#fff;cursor:pointer}',
      '@media (max-height:500px){.sc-prev img{max-height:58vh}.sc-panel h2{margin:0 0 4px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function init() {
    addStyles(); addVolumeRow(); addScoreButton();
    applyVolume(volume());
    // the game creates its AudioContext on the first gesture: apply the saved volume again then
    const again = () => applyVolume(volume());
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, again, { capture: true, passive: true, once: true }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.DailyExtras = { makeCard, openCard, volume, setVolume: v => { sset('volume', String(v)); applyVolume(v); } };
})();
