/* RB.Render (Bop's Rainy Band) — draws the rainy garden on one canvas: sky, sun, rainbow and clouds, the far / mid / ground
 * garden of the season (crossfaded), the wooden stage on flower pots with the band on their stools (RB.BandArt drums and
 * animal stickers), Bop the frog with his big drum, the song sheet with its notes and flying notes, the counting card,
 * the snail, the ghost-hand hint, weather particles and juice. Logical coordinates (short side 720) × render scale rs =
 * device pixels. No camera. Missing art is tolerated (simple placeholders) so the game boots while the artists draw. */
(function (RB) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const PAL = c => (RB.PALETTE && RB.PALETTE[c]) || { base: c || '#ccc', dark: '#555', light: '#eee' };

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  }
  function fitText(g, text, maxW, px, weight) {
    let f = px;
    g.font = `${weight || 900} ${f}px ${FONT}`;
    const w = g.measureText(text).width;
    if (w > maxW) { f = Math.max(8, f * maxW / w); g.font = `${weight || 900} ${f}px ${FONT}`; }
    return f;
  }
  function outlinedText(g, text, x, y, px, fill, stroke, maxW) {
    fitText(g, text, maxW || 9999, px);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = Math.max(3, px * 0.16); g.strokeStyle = stroke; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
  }
  function shapePath(g, shape, r) {   // a simple vector shape of radius r centred at 0,0
    g.beginPath();
    switch (shape) {
      case 'square': roundRect(g, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.18); break;
      case 'rect': roundRect(g, -r, -r * 0.6, r * 2, r * 1.2, r * 0.16); break;
      case 'triangle': g.moveTo(0, -r); g.lineTo(r * 0.95, r * 0.75); g.lineTo(-r * 0.95, r * 0.75); g.closePath(); break;
      case 'diamond': g.moveTo(0, -r); g.lineTo(r * 0.75, 0); g.lineTo(0, r); g.lineTo(-r * 0.75, 0); g.closePath(); break;
      case 'oval': g.ellipse(0, 0, r, r * 0.66, 0, 0, TAU); break;
      case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); break;
      case 'heart':
        g.moveTo(0, r * 0.85);
        g.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.75, -r * 0.95, 0, -r * 0.35);
        g.bezierCurveTo(r * 0.75, -r * 0.95, r * 1.25, r * 0.05, 0, r * 0.85); g.closePath(); break;
      default: g.arc(0, 0, r, 0, TAU);
    }
  }
  function starPath(g, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
  const DICE = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const FARFILL = { spring: '#B9D3BE', summer: '#A9CDB3', autumn: '#CFC5A2', winter: '#D9E3EC' };
  const GROUNDFILL = { spring: '#9DC987', summer: '#94C47E', autumn: '#B4BE84', winter: '#E8EEF4' };
  const BOP = { w: 300, h: 300, ax: 150, ay: 292 };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null || o[k] == null ? o[k] : p + (o[k] - p) * a; };
  const BA = () => RB.BandArt;
  const imgOf = name => (RB.Assets && RB.Assets.images ? RB.Assets.images[name] || null : null);
  const seasonOf = amb => { const s = amb.season || amb.env; return SEASONS.includes(s) ? s : SEASONS[clamp(amb.level | 0, 0, 3)]; };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._noteT = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      RB.Assets.dropExact();
    }
    prewarm(layout, level) {   // rasterise the big tiles of a season ahead of time
      const m = SEASONS[clamp(level | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground']) { const d = this._layerDims(l); RB.Assets.exact(l + '_' + m, Math.round(d.w * this.rs), Math.round(d.h * this.rs)); }
      void layout;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt;
      this._dt = dt;
      this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : world.alpha;
      this._L = (world.layout && world.layout.stage) ? world.layout : this._fallbackLayout();
      const amb = weather.ambient || {};
      this._amb = amb;
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1;
      this._backdrop(weather, amb);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o, amb);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fallbackLayout() {
      const W = this.W, H = this.H, portrait = H > W, groundY = H - (portrait ? 36 : 24), S = 150;
      const stage = portrait ? { x0: 24, x1: W - 24, y: groundY - 330 } : { x0: 380, x1: W - 24, y: groundY - 74 };
      return { W, H, portrait, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY, S, stage, slots: [],
        bigDrum: portrait ? { x: 470, y: groundY - 100, r: 100 } : { x: 250, y: groundY - 92, r: 92 },
        bop: portrait ? { x: 150, y: groundY - 4, h: 320 } : { x: 100, y: groundY - 4, h: 300 },
        sheet: { x0: stage.x0, x1: stage.x1, y: portrait ? 300 : 200, slots: [] } };
    }

    /* ---------- backdrop: sky, sun, rainbow, clouds, far / mid / ground garden (season crossfade) ---------- */
    _layerDims(l) {   // bottom-anchored tiles, ×1.36 in portrait so the garden fills the tall sky
      const W = this.W, H = this.H, portrait = H > W, k = portrait ? 1.36 : 1;
      const vh = l === 'far' ? 420 : l === 'mid' ? 380 : 260;
      const bottom = l === 'far' ? (portrait ? 0.72 : 0.76) : l === 'mid' ? (portrait ? 0.80 : 0.86) : 1.0;
      return { w: 1200 * k, h: vh * k, bottom: bottom * H + (l === 'ground' ? 2 : 0) };
    }
    _layer(l, from, to, mix) {
      const g = this.g, d = this._layerDims(l), W = this.W;
      const one = (m, al) => {
        if (al <= 0.01) return false;
        const tile = RB.Assets.exact(l + '_' + m, Math.round(d.w * this.rs), Math.round(d.h * this.rs));
        if (!tile) return false;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = al;
        const y = Math.round((d.bottom - d.h) * this.rs), tw = tile.width;
        const x0 = -Math.round(((W * this.rs - tw) / 2 % tw + tw) % tw);
        for (let x = x0 - tw; x < W * this.rs; x += tw) g.drawImage(tile, x, y);
        g.restore();
        return true;
      };
      if (from && from !== to && mix < 1) { const ok = one(from, 1); one(to, mix); return ok; }
      return one(to, 1);
    }
    _backdrop(weather, amb) {
      const g = this.g, W = this.W, H = this.H, portrait = H > W;
      const to = seasonOf(amb), fr = amb.seasonFrom || amb.envFrom, from = SEASONS.includes(fr) ? fr : to;
      const mix = amb.envMix == null ? (amb.mix == null ? 1 : amb.mix) : amb.envMix;
      const sky = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.6 : 0.7));
      sky.addColorStop(0, amb.skyTop || '#CFE6F0');
      if (amb.skyMid) sky.addColorStop(0.55, amb.skyMid);
      sky.addColorStop(1, amb.skyBottom || '#F3F1E2');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      this._particles(weather.particles, 'sky');
      const ins = this._L.ins || {};
      const sunA = amb.sun || 0;
      if (sunA > 0.01) this._sprite('sun', W * (amb.sunX == null ? 0.2 : amb.sunX), Math.max((ins.top || 0) + 80, H * (amb.sunY || 0.2)), portrait ? 190 : 170, this.time * 0.05, sunA);
      const rb = amb.rainbow || 0;
      if (rb > 0.01) {
        const rw = portrait ? W * 1.1 : Math.min(W * 0.7, 900);
        if (RB.Assets.has('rainbow')) this._img2('rainbow', W * 0.58 - rw / 2, H * (portrait ? 0.2 : 0.12), rw, rw * 0.5, rb * 0.85);
        else { g.save(); g.globalAlpha = rb * 0.45; g.lineWidth = 14; CONF.slice(0, 6).forEach((c, i) => { g.strokeStyle = c; g.beginPath(); g.arc(W * 0.58, H * 0.62, rw * 0.5 - i * 14, Math.PI, TAU); g.stroke(); }); g.restore(); }
      }
      for (const c of weather.clouds || []) {
        if (c.alpha <= 0.01) continue;
        this._sprite(RB.Assets.has(c.sprite) ? c.sprite : 'cloud_a', c.x, c.y, 320 * (c.scale || 1), 0, clamp(c.alpha, 0, 1) * 0.92);
      }
      const farD = this._layerDims('far'), midD = this._layerDims('mid');
      if (!this._layer('far', from, to, mix)) { g.fillStyle = '#A9CDB3'; g.fillRect(0, farD.bottom - 160, W, 160); }
      g.fillStyle = FARFILL[to] || '#A9CDB3'; g.fillRect(0, farD.bottom - 1, W, H - farD.bottom + 1);
      for (const m of weather.mist || []) {
        if (!(m.alpha > 0.01)) continue;
        const spr = RB.Assets.sprite(m.sprite, 320 * (m.scale || 1) * this.rs);
        if (!spr) continue;
        const w = 320 * (m.scale || 1) * 1.6, h = 170 * (m.scale || 1) * 0.55;
        g.save(); g.globalAlpha = clamp(m.alpha, 0, 1) * 0.8; g.drawImage(spr, m.x - w / 2, m.y - h / 2, w, h); g.restore();
      }
      if (!this._layer('mid', from, to, mix)) { g.fillStyle = '#6FA370'; g.fillRect(0, midD.bottom - 200, W, 200); }
      g.fillStyle = GROUNDFILL[to] || '#9DC987'; g.fillRect(0, midD.bottom - 2, W, H - midD.bottom + 2);
      this._layer('ground', from, to, mix);
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
      if (amb.darkness > 0.01) { g.fillStyle = `rgba(40,50,80,${amb.darkness})`; g.fillRect(0, 0, W, H); }
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L, S = L.S || 150;
      this._stage(L.stage, S);
      const members = w.members || [];
      for (const m of members) if (m.state !== 'gone' && L.slots && L.slots[m.slot]) this._stool(L.slots[m.slot].x, L.stage.y, S);
      this._snail(w.snail, a);
      this._bop(w, o);
      this._bigDrum(w, a);
      for (const m of members) if (m.state !== 'gone') this._member(m, a, S);
      this._sheet(w, a);
      this._countCard(w);
      for (const n of w.flyNotes || []) this._flyNote(n, a);
      this._hintHand(w.hintHand, S);
      this._notesFx(w);
    }
    _shadow(x, y, w, al) {
      const g = this.g; g.fillStyle = `rgba(30,50,25,${0.22 * (al == null ? 1 : al)})`; g.beginPath(); g.ellipse(x, y, w / 2, Math.max(4, w * 0.09), 0, 0, TAU); g.fill();
    }
    _stage(st, S) {   // the wooden plank on two flower pots: stage.svg 9-sliced, or a plank drawn by code
      if (!st) return;
      const g = this.g, x0 = st.x0, x1 = st.x1, y = st.y, w = x1 - x0;
      const spr = RB.Assets.sprite('stage', 800 * this.rs);
      if (spr && w > 140) {
        const k = spr.width / 800, h = 140, top = y - 20;   // plank top surface at viewBox y = 20
        g.drawImage(spr, 0, 0, 60 * k, spr.height, x0, top, 60, h);
        g.drawImage(spr, 60 * k, 0, 680 * k, spr.height, x0 + 60, top, w - 120, h);
        g.drawImage(spr, 740 * k, 0, 60 * k, spr.height, x1 - 60, top, 60, h);
        return;
      }
      // pots
      for (const px of [x0 + Math.min(110, w * 0.18), x1 - Math.min(110, w * 0.18)]) {
        g.fillStyle = '#C8704A'; g.strokeStyle = '#8E4A2E'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(px - 46, y + 22); g.lineTo(px + 46, y + 22); g.lineTo(px + 34, y + 110); g.lineTo(px - 34, y + 110); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#DA875E'; g.beginPath(); roundRect(g, px - 54, y + 14, 108, 22, 8); g.fill(); g.stroke();
      }
      this._shadow((x0 + x1) / 2, y + 112, w * 0.9, 0.8);
      g.fillStyle = '#B9834F'; g.strokeStyle = '#7E5530'; g.lineWidth = 4;
      g.beginPath(); roundRect(g, x0, y, w, 26, 10); g.fill(); g.stroke();
      g.fillStyle = '#D9A86C'; g.beginPath(); roundRect(g, x0 + 4, y + 2, w - 8, 9, 5); g.fill();
      g.strokeStyle = 'rgba(126,85,48,.35)'; g.lineWidth = 2;
      for (let x = x0 + 70; x < x1 - 20; x += 120) { g.beginPath(); g.moveTo(x, y + 13); g.lineTo(x + 50, y + 15); g.stroke(); }
      void S;
    }
    _stool(x, stageY, S) {
      const g = this.g, w = S * 0.62, h = 38;
      g.save(); g.translate(x, stageY - h);
      if (BA() && BA().drawStool) { try { BA().drawStool(g, w, h); g.restore(); return; } catch (e) { } }
      g.fillStyle = '#C8704A'; g.strokeStyle = '#8E4A2E'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-w * 0.38, 6); g.lineTo(w * 0.38, 6); g.lineTo(w * 0.3, h); g.lineTo(-w * 0.3, h); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#DA875E'; g.beginPath(); roundRect(g, -w / 2, 0, w, 12, 6); g.fill(); g.stroke();
      g.restore();
    }
    _member(m, a, S) {
      const g = this.g, x = ip(m, 'x', a), y = ip(m, 'y', a), rot = ip(m, 'rot', a) || 0;
      const sx = m.sx == null ? 1 : m.sx, sy = m.sy == null ? 1 : m.sy;
      const al = m.alpha == null ? 1 : m.alpha;
      if (al <= 0.01) return;
      const item = m.item || {}, sizeK = item.size === 'small' ? 0.68 : 1, bottom = y + S / 2;
      if (m.state === 'rest') this._shadow(x, bottom - 36 + 40, S * 0.5, 0.5);
      g.save(); g.globalAlpha *= al;
      g.translate(x, bottom); g.rotate(rot); g.scale(sx, sy); g.translate(0, -S / 2);
      if ((m.glow || 0) > 0.01 && BA() && BA().drawGlow) { try { BA().drawGlow(g, S * 1.25, S * 1.25, this.time, m.glow); } catch (e) { } }
      const opt = { glow: m.glow || 0, hit: m.hit || 0, sing: (m.sing || 0) > 0.05, dpr: this.rs, img: imgOf };
      let ok = false;
      if (BA() && BA().drawMember) { try { BA().drawMember(g, item, S, opt); ok = true; } catch (e) { ok = false; } }
      if (!ok) this._placeholderMember(g, item, S * sizeK, opt);
      g.restore();
    }
    _placeholderMember(g, it, S, opt) {   // a simple drum (or the animal sticker) while band_art.js is missing
      if (it.kind === 'animal') {
        const nm = 'animal_' + (it.animal || it.value) + (opt.sing ? '_sing' : '');
        if (RB.Assets.has(nm)) { this._img(nm, -S / 2, -S / 2, S, S); return; }
      }
      const col = it.kind === 'color' || it.kind === 'size' ? PAL(it.color || it.value) : { base: '#E7C590', dark: '#A8743F', light: '#F5DDB2' };
      const w = S * 0.8, h = S * 0.62, top = -h / 2 + S * 0.08;
      g.fillStyle = col.base; g.strokeStyle = col.dark; g.lineWidth = 5;
      g.beginPath(); roundRect(g, -w / 2, top, w, h, 14); g.fill(); g.stroke();
      g.fillStyle = '#FFF6E4'; g.beginPath(); g.ellipse(0, top, w / 2, h * 0.18 * (1 - (opt.hit || 0) * 0.3), 0, 0, TAU); g.fill(); g.stroke();
      g.save(); g.translate(0, top + h * 0.5);
      if (it.kind === 'shape') { g.fillStyle = PAL(it.color).base; shapePath(g, it.shape || it.value, h * 0.3); g.fill(); g.strokeStyle = PAL(it.color).dark; g.lineWidth = 3; g.stroke(); }
      else if (it.kind === 'dots') { g.fillStyle = '#5A3A22'; const n = it.n || +it.value || 1, d = DICE[n]; if (d) d.forEach(([u, v]) => { g.beginPath(); g.arc(u * h * 0.22, v * h * 0.22, h * 0.08, 0, TAU); g.fill(); }); else outlinedText(g, String(n), 0, 0, h * 0.55, '#5A3A22', null, w * 0.8); }
      else if (it.kind === 'number' || it.kind === 'letter' || it.kind === 'text') outlinedText(g, String(it.text != null ? it.text : it.value), 0, 0, h * 0.55, '#5A3A22', '#FFF6E4', w * 0.8);
      else if (it.kind === 'animal') outlinedText(g, String(it.value).slice(0, 4), 0, 0, h * 0.3, '#5A3A22', null, w * 0.8);
      g.restore();
    }
    _bigDrum(w, a) {
      const L = this._L, D = w.bigDrum || L.bigDrum; if (!D) return;
      const g = this.g, x = ip(D, 'x', a) || L.bigDrum.x, y = ip(D, 'y', a) || L.bigDrum.y, r = D.r || L.bigDrum.r || 92;
      const sx = D.sx == null ? 1 : D.sx, sy = D.sy == null ? 1 : D.sy;
      this._shadow(x, y + r * 0.78, r * 2.1, 0.9);
      g.save(); g.translate(x, y + r * 0.75); g.scale(sx, sy); g.translate(0, -r * 0.75);
      if ((D.glow || 0) > 0.01 && BA() && BA().drawGlow) { try { BA().drawGlow(g, r * 2.6, r * 2.2, this.time, D.glow); } catch (e) { } }
      let ok = false;
      if (BA() && BA().drawBigDrum) { try { BA().drawBigDrum(g, r, { hit: D.hit || 0, glow: D.glow || 0, dpr: this.rs }); ok = true; } catch (e) { } }
      if (!ok) {
        g.fillStyle = '#C98B55'; g.strokeStyle = '#7E5530'; g.lineWidth = 5;
        g.beginPath(); roundRect(g, -r, -r * 0.5, r * 2, r * 1.25, 22); g.fill(); g.stroke();
        g.fillStyle = '#FFF6E4'; g.beginPath(); g.ellipse(0, -r * 0.5, r, r * 0.3 * (1 - (D.hit || 0) * 0.25), 0, 0, TAU); g.fill(); g.stroke();
      }
      g.restore();
    }
    _bopFrame(w) {
      const b = w.bop || {}; let mood = b.mood || 'idle';
      if (this._speaking && (mood === 'idle' || mood === 'talk')) mood = Math.sin(this.time * 18) > 0 ? 'talk' : 'idle';
      if (mood === 'idle' && this._blinking(this._dt)) mood = 'blink';
      const nm = 'bop_' + mood;
      return RB.Assets.has(nm) ? nm : 'bop_idle';
    }
    _bop(w, o) {
      const L = this._L, B = L.bop || { x: 100, y: L.groundY, h: 300 }, b = w.bop || {};
      const g = this.g, h = B.h || 300, k = h / BOP.h, mood = b.mood || 'idle';
      const hop = mood === 'cheer' ? Math.max(0, Math.sin(this.time * 7)) * 18 : mood === 'happy' ? Math.max(0, Math.sin(this.time * 9)) * 8 : 0;
      const breathe = 1 + Math.sin(this.time * 2.2) * 0.012;
      this._shadow(B.x, B.y + 2, BOP.w * k * 0.62, 1);
      const nm = this._bopFrame(w);
      // a leaf umbrella in a shower when the umbrella frame is missing
      const shower = w.shower || 0;
      if (RB.Assets.has(nm)) {
        g.save(); g.translate(B.x, B.y - hop); g.scale(1 / breathe, breathe);
        this._img(nm, -BOP.ax * k, -BOP.ay * k, BOP.w * k, h);
        g.restore();
      } else {   // placeholder frog
        g.fillStyle = '#62C7CF'; g.strokeStyle = '#2A6E78'; g.lineWidth = 4;
        g.beginPath(); g.ellipse(B.x, B.y - h * 0.32 - hop, h * 0.32, h * 0.3, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#fff'; [-1, 1].forEach(s => { g.beginPath(); g.arc(B.x + s * h * 0.13, B.y - h * 0.6 - hop, h * 0.08, 0, TAU); g.fill(); g.stroke(); });
      }
      if (shower > 0.05 && mood !== 'umbrella' && RB.Assets.has('umbrella_leaf')) {
        const uw = h * 0.85; this._img2('umbrella_leaf', B.x - uw / 2, B.y - h * 1.12 - hop, uw, uw * 160 / 220, clamp(shower * 2, 0, 1));
      }
      void o;
    }
    _sheet(w, a) {
      const L = this._L, SH = L.sheet; if (!SH) return;
      const sh = w.sheet || { n: 0, notes: [] }, n = sh.n || (sh.notes ? sh.notes.length : 0);
      if (!n) return;
      const g = this.g, slots = (sh.slots && sh.slots.length === n) ? sh.slots : (SH.slots && SH.slots.length === n ? SH.slots : this._sheetSlots(SH, n));
      const x0 = Math.min(SH.x0, slots[0].x - 60), x1 = Math.max(SH.x1, slots[n - 1].x + 60);
      const season = seasonOf(this._amb || {});
      let ok = false;
      if (BA() && BA().drawSheet) { try { BA().drawSheet(g, x0, x1, SH.y, n, season); ok = true; } catch (e) { } }
      if (!ok) { g.strokeStyle = '#5E9E6A'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, SH.y); g.quadraticCurveTo((x0 + x1) / 2, SH.y + 14, x1, SH.y); g.stroke(); }
      const nr = 34;
      for (let i = 0; i < n; i++) {
        const s = slots[i], note = sh.notes && sh.notes[i];
        const bob = Math.sin(this.time * 2.4 + i * 0.8) * 2;
        if (note) {
          const pop = note.pop || 0, sc = 1 + 0.4 * pop;
          const col = this._noteColor(note);
          this._note(s.x, s.y + bob, nr * 2 * sc, col, false, Math.sin(this.time * 3 + i) * 0.08);
        } else this._note(s.x, s.y + bob, nr * 2, null, true, 0);
      }
      void a;
    }
    _sheetSlots(SH, n) {
      const span = SH.x1 - SH.x0, gap = Math.min(110, span / Math.max(1, n));
      const cx = (SH.x0 + SH.x1) / 2, out = [];
      for (let i = 0; i < n; i++) out.push({ x: cx + (i - (n - 1) / 2) * gap, y: SH.y });
      return out;
    }
    _noteColor(note) {
      if (!note) return '#7C8BB5';
      if (note.color && RB.PALETTE && RB.PALETTE[note.color]) return RB.PALETTE[note.color].base;
      if (note.color && note.color[0] === '#') return note.color;
      const it = note.item || {};
      if (it.color && RB.PALETTE && RB.PALETTE[it.color]) return RB.PALETTE[it.color].base;
      return '#7C6BD0';
    }
    _note(x, y, size, color, empty, rot) {
      const g = this.g;
      g.save(); g.translate(x, y); if (rot) g.rotate(rot);
      let ok = false;
      if (BA() && BA().drawNote) { try { BA().drawNote(g, size, color || '#ffffff', { empty: !!empty, dpr: this.rs }); ok = true; } catch (e) { } }
      if (!ok) {
        const r = size * 0.32;
        if (empty) { g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,248,230,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, size * 0.42, 0, TAU); g.stroke(); g.setLineDash([]); }
        else {
          g.fillStyle = color; g.strokeStyle = 'rgba(40,40,60,.6)'; g.lineWidth = 3;
          g.beginPath(); g.ellipse(0, 0, r * 1.15, r * 0.85, -0.35, 0, TAU); g.fill(); g.stroke();
          g.fillRect(r * 0.9, -size * 0.55, 5, size * 0.55); g.beginPath(); g.moveTo(r * 0.9 + 5, -size * 0.55); g.quadraticCurveTo(r * 2.2, -size * 0.35, r * 1.6, -size * 0.12); g.lineWidth = 5; g.strokeStyle = color; g.stroke();
        }
      }
      g.restore();
    }
    _flyNote(n, a) {
      const x = ip(n, 'x', a), y = ip(n, 'y', a);
      this._note(x, y, 60, n.color && RB.PALETTE && RB.PALETTE[n.color] ? RB.PALETTE[n.color].base : (n.color && n.color[0] === '#' ? n.color : this._noteColor(n)), false, n.rot || 0);
    }
    _countCard(w) {
      const C = w.countCard, L = this._L; if (!C || !(C.show > 0.01)) return;
      const R = L.countCard || { x: L.bigDrum.x - 90, y: L.bigDrum.y - 340, w: 180, h: 150 };
      const g = this.g, s = easeOutBack(clamp(C.show, 0, 1));
      g.save(); g.translate(R.x + R.w / 2, R.y + R.h / 2); g.scale(s, s);
      let ok = false;
      if (BA() && BA().drawNumberCard) { try { BA().drawNumberCard(g, R.w, R.h, C.n, C.lit || 0); ok = true; } catch (e) { } }
      if (!ok) {
        g.fillStyle = '#FFFBF0'; g.strokeStyle = '#A8743F'; g.lineWidth = 5;
        g.beginPath(); roundRect(g, -R.w / 2, -R.h / 2, R.w, R.h, 22); g.fill(); g.stroke();
        outlinedText(g, String(C.n), 0, -R.h * 0.15, R.h * 0.5, '#5A3A22', null, R.w * 0.8);
        const n = C.n | 0, dw = Math.min(28, (R.w - 20) / Math.max(1, n));
        for (let i = 0; i < n; i++) { g.fillStyle = i < (C.lit || 0) ? '#FFC531' : 'rgba(90,58,34,.25)'; g.beginPath(); g.arc((i - (n - 1) / 2) * dw, R.h * 0.3, dw * 0.38, 0, TAU); g.fill(); }
      }
      g.restore();
    }
    _snail(S0, a) {
      if (!S0 || S0.state === 'gone') return;
      const x = ip(S0, 'x', a), y = ip(S0, 'y', a), nm = S0.state === 'ring' && RB.Assets.has('snail_ring') ? 'snail_ring' : 'snail';
      const wob = S0.state === 'ring' ? Math.sin(this.time * 20) * 0.08 : Math.sin(this.time * 3) * 0.02;
      const w = 130, h = 130 * 110 / 140;
      this._shadow(x, y, w * 0.7, 0.6);
      if (RB.Assets.has(nm)) { const g = this.g; g.save(); g.translate(x, y); g.rotate(wob); g.globalAlpha *= S0.alpha == null ? 1 : S0.alpha; this._img(nm, -w / 2, -h + 4, w, h); g.restore(); }
      else { const g = this.g; g.fillStyle = '#E7D6C6'; g.beginPath(); g.arc(x, y - 34, 30, 0, TAU); g.fill(); g.fillStyle = '#C7E0A8'; g.fillRect(x - 50, y - 12, 90, 12); }
    }
    _hintHand(H, S) {
      if (!H) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      g.save(); g.globalAlpha *= al; g.translate(H.x, H.y);
      let ok = false;
      if (BA() && BA().drawGhostHand) { try { BA().drawGhostHand(g, S * 0.8, H.t || (this.time % 1)); ok = true; } catch (e) { } }
      if (!ok) { const k = Math.sin(this.time * 6) * 8; g.fillStyle = 'rgba(255,255,255,.85)'; g.strokeStyle = '#5a6a8a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 30 + k, 22, 0, TAU); g.fill(); g.stroke(); }
      g.restore();
    }
    _notesFx(w) {   // during the song playback, little notes keep floating up from the band
      if (w.phase !== 'song') return;
      this._noteT -= this._dt || 0;
      if (this._noteT > 0) return;
      this._noteT = 0.22;
      const ms = (w.members || []).filter(m => m.state !== 'gone');
      const m = ms.length ? ms[(Math.random() * ms.length) | 0] : null;
      if (m) this.burst('notes', m.x, m.y - (this._L.S || 150) * 0.4, { n: 1, color: m.item && m.item.color });
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }

    /* ---------- title & celebration ---------- */
    _miniBand(cx, y, S, cols, t, glowWave) {   // three drums on stools on a small stage (title / done)
      const n = cols.length, gap = S + 22, x0 = cx - (n - 1) / 2 * gap;
      this._stage({ x0: x0 - S / 2 - 30, x1: x0 + (n - 1) * gap + S / 2 + 30, y }, S);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * gap, bounce = Math.max(0, Math.sin(t * 3.2 - i * 0.9));
        this._stool(x, y, S);
        const m = { x, y: y - 38 - S / 2 - bounce * 12, rot: Math.sin(t * 1.6 + i) * 0.04, sx: 1 + bounce * 0.05, sy: 1 - bounce * 0.05,
          glow: glowWave ? Math.max(0, Math.sin(t * 3 - i * 0.7)) * 0.5 : 0, hit: bounce > 0.95 ? 1 : 0, state: 'rest',
          item: typeof cols[i] === 'string' ? { kind: 'color', value: cols[i], color: cols[i] } : cols[i] };
        this._member(m, 1, S);
      }
    }
    _titleScene(w, o) {
      const L = this._L, W = this.W, H = this.H, portrait = H > W, ins = L.ins || {};
      const gy = H - (ins.bottom || 0) - (portrait ? 60 : 30);
      let S = portrait ? 140 : 120;
      const lg = o.boxes && o.boxes.logo;
      let cx = portrait ? W * 0.62 : W - (ins.right || 0) - Math.max(260, W * 0.24);
      let sy = gy - 40;
      // the band must not sit under the logo (iPad landscape)
      if (!portrait && lg && sy - 38 - S * 1.1 < lg.y + lg.h && cx + 1.5 * S > lg.x && cx - 1.5 * S < lg.x + lg.w) S = clamp((sy - 38 - (lg.y + lg.h + 10)) / 1.1, 80, 120);
      if (portrait) S = Math.min(S, (W - 360) / 3.2 + 20);
      this._miniBand(cx, sy, S, ['red', 'yellow', 'blue'], this.time, false);
      const bh = portrait ? 380 : Math.min(330, H * 0.5), k = bh / BOP.h;
      const bx = portrait ? (ins.left || 0) + 150 : (ins.left || 0) + Math.max(160, W * 0.15);
      const hop = (this.time % 2.4) < 0.45 ? Math.sin((this.time % 2.4) / 0.45 * Math.PI) * 16 : 0;
      this._shadow(bx, gy + 2, BOP.w * k * 0.62, 1);
      const nm = RB.Assets.has('bop_full_wave') ? 'bop_full_wave' : 'bop_happy';
      if (RB.Assets.has(nm)) this._img(nm, bx - BOP.ax * k, gy - BOP.ay * k - hop, BOP.w * k, bh);
      this._noteT -= this._dt || 0;
      if (this._noteT <= 0) { this._noteT = 0.7; this.burst('notes', cx + (Math.random() - 0.5) * 2 * S, sy - S, { n: 1 }); }
    }
    _doneScene(w, o, amb) {   // the winter party: snow, notes confetti, the band playing and Bop cheering
      const L = this._L, W = this.W, H = this.H, t = this.time, portrait = H > W, ins = L.ins || {};
      const dp = o.boxes && o.boxes.done;
      const gy = portrait ? Math.min(H * 0.64, dp ? dp.y - 20 : H) : H - (ins.bottom || 0) - 30;
      const S = portrait ? 110 : 104;
      const cx = portrait ? W * 0.6 : (ins.left || 0) + Math.max(470, W * 0.36);
      this._miniBand(cx, gy - 30, S, ['red', 'orange', 'yellow', 'green', 'blue'].slice(0, portrait ? 3 : 4), t, true);
      const bh = portrait ? Math.min(330, gy - 160) : Math.min(320, H * 0.5), k = bh / BOP.h;
      const bx = (ins.left || 0) + (portrait ? 120 : 150);
      const hop = Math.max(0, Math.sin(t * 4)) * 16;
      this._shadow(bx, gy + 2, BOP.w * k * 0.62, 1);
      const nm = RB.Assets.has('bop_cheer') ? (Math.sin(t * 4) > 0 ? 'bop_cheer' : (RB.Assets.has('bop_drum_up') ? 'bop_drum_up' : 'bop_cheer')) : 'bop_idle';
      if (RB.Assets.has(nm)) this._img(nm, bx - BOP.ax * k, gy - BOP.ay * k - hop, BOP.w * k, bh);
      this._noteT -= o.dt || 0;
      if (this._noteT <= 0) { this._noteT = 0.3; this.burst('notes', W * (0.1 + Math.random() * 0.8), H * (0.3 + Math.random() * 0.3), { n: 2 }); }
      void amb;
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((RB.CONFIG && RB.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * 0.42;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,60,30,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#BFD8EE'; g.stroke();
      const I = RB.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6a6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#2A6E78', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6a6a4a', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#2A6E78', '#ffffff', 160);
      }
      g.restore();
    }

    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 260) fx.splice(0, fx.length - 260);
      const R = Math.random;
      const colOf = c => (c && RB.PALETTE && RB.PALETTE[c]) ? RB.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'pop' || type === 'found' || type === 'collect') {
        const col = colOf(opt.color), size = opt.size || 110;
        fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size });
        const n = Math.round((type === 'pop' ? 10 : 22) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 160 + R() * 260;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: opt.color ? col : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
            g: 520, drag: 1.4, t: 0, life: 0.8 + R() * 0.5, size: 20 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 6; i++) {
          const a = R() * TAU, sp = 90 + R() * 140;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, t: 0, life: 0.5 + R() * 0.2, size: 20 + R() * 12, rot: R() * TAU, vr: 4 });
        }
      } else if (type === 'rustle' || type === 'leaves') {   // a puff of leaves / snow / petals off a hiding place
        const sprites = opt.petals ? ['petal', 'pollen'] : ['leaf_a', 'leaf_b', 'puff'];
        const n = Math.round((opt.n || 8) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = 90 + R() * 160;
          const spr = sprites[i % sprites.length];
          fx.push({ k: 'p', sprite: RB.Assets.has(spr) ? spr : 'puff', tint: null, x: x + (R() - 0.5) * (opt.size || 120) * 0.6, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            g: 260, drag: 1.6, t: 0, life: 0.7 + R() * 0.5, size: 16 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'land') {
        for (let i = 0; i < 5; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y - 4, vx: (R() < 0.5 ? -1 : 1) * (50 + R() * 70), vy: -10 - R() * 25, g: 0, drag: 2, t: 0, life: 0.45, size: 18 + R() * 10, rot: 0, vr: 0 });
      } else if (type === 'sparkles') {
        for (let i = 0; i < 26; i++) {
          const a = R() * TAU, sp = 120 + R() * 300;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 220, t: 0, life: 1 + R() * 0.6, size: 20 + R() * 16, rot: R() * TAU, vr: 5 });
        }
      } else if (type === 'butterfly') {
        const col = CONF[(R() * CONF.length) | 0];
        for (let i = 0; i < (opt.n || 1); i++) fx.push({ k: 'bfly', x: x + (R() - 0.5) * 30, y, vx: (R() < 0.5 ? -1 : 1) * (50 + R() * 40), vy: -90 - R() * 40, t: 0, life: 2.4, size: 34, color: i ? CONF[(R() * CONF.length) | 0] : col, ph: R() * TAU });
      } else if (type === 'firework') {
        const col = CONF[(R() * CONF.length) | 0];
        for (let i = 0; i < 28 * this.quality; i++) {
          const a = i / 28 * TAU, sp = 180 + R() * 60;
          fx.push({ k: 'p', sprite: 'sparkle', tint: col, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 90, drag: 1.2, t: 0, life: 1.1 + R() * 0.3, size: 18 + R() * 8, rot: 0, vr: 3 });
        }
        fx.push({ k: 'flash', x, y, t: 0, life: 0.3, size: 90 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(120 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.6;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 * 0.6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
      } else if (type === 'wrong') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.35, size: (opt.size || 110) * 1.1, color: '255,255,255' });
      } else if (type === 'notes') {   // music notes float up with a sway (tinted in the member's colour)
        const n = Math.round((opt.n || 6) * Math.max(0.5, this.quality));
        for (let i = 0; i < n; i++) {
          const spr = R() < 0.5 ? 'note_a' : 'note_b';
          fx.push({ k: 'p', sprite: RB.Assets.has(spr) ? spr : 'sparkle', tint: colOf(opt.color), x: x + (R() - 0.5) * 50, y, vx: (R() - 0.5) * 80, vy: -110 - R() * 90,
            g: -20, drag: 0.4, t: 0, life: 1.1 + R() * 0.5, size: 30 + R() * 14, rot: (R() - 0.5) * 0.6, vr: (R() - 0.5) * 2, sway: R() * TAU });
        }
      } else if (type === 'splash') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.4, size: opt.size || 40, color: '220,240,255' });
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2; fx.push({ k: 'p', sprite: 'drop', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 140, g: 600, t: 0, life: 0.4, size: 12, rot: 0, vr: 0 }); }
      } else if (type === 'puff') {
        for (let i = 0; i < (opt.n || 6); i++) { const a = R() * TAU; fx.push({ k: 'p', sprite: 'puff', x, y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 60 - 30, g: 0, drag: 2, t: 0, life: 0.5, size: 22 + R() * 14, rot: 0, vr: 0 }); }
      } else if (type === 'count') {   // a big numeral floats up while Pip counts
        fx.push({ k: 'num', x, y, t: 0, life: 0.85, text: String(opt.n || '') });
      }
    }
    _fx(dt) {
      const g = this.g, fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        if (f.t < 0) continue;
        const u = f.t / f.life;
        if (u >= 1) { if (f.onDone) f.onDone(); fx.splice(i, 1); continue; }
        if (f.k === 'p') {
          f.vy += (f.g || 0) * dt;
          if (f.drag) { f.vx *= 1 - f.drag * dt; f.vy = Math.min(f.vy, 200); if (f.sway != null) { f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; } }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'bfly') {
          f.ph += dt * 3; f.x += (f.vx + Math.sin(f.ph) * 60) * dt; f.y += (f.vy + Math.cos(f.ph * 1.3) * 40) * dt; f.vy *= 1 - 0.6 * dt;
          const al = u > 0.75 ? (1 - u) / 0.25 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y);
          if (RB.Assets.has('butterfly')) { this._sprite(Math.sin(this.time * 14 + f.ph) > 0 ? 'butterfly' : 'butterfly_up', 0, 0, f.size * 1.6, 0, 1); }
          else { g.fillStyle = f.color; g.beginPath(); g.ellipse(-8, 0, 9, 13 * Math.abs(Math.sin(this.time * 14)), 0, 0, TAU); g.ellipse(8, 0, 9, 13 * Math.abs(Math.sin(this.time * 14)), 0, 0, TAU); g.fill(); }
          g.restore();
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
          g.fillStyle = `rgba(255,255,240,${0.55 * (1 - u) * (1 - u)})`; g.beginPath(); g.arc(f.x, f.y, f.size * 0.35 * (1 - u * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 40); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#2A6E78', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = RB.Assets.tinted ? RB.Assets.tinted(name, color, size * this.rs) : RB.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      const g = this.g;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || p.alpha <= 0.01 || p.kind === 'streak') continue;
        if (p.glow) {   // firefly halo
          const r = (p.size || 10) * 1.6, rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          rg.addColorStop(0, `rgba(230,255,150,${0.45 * p.alpha * p.glow})`); rg.addColorStop(1, 'rgba(230,255,150,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
        }
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        if (p.color) this._tinted(nm, p.color, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = RB.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
      if (!spr) return;
      const k = size / Math.max(spr.width, spr.height);
      const w = spr.width * k, h = spr.height * k;
      const a0 = g.globalAlpha;
      if (alpha != null && alpha < 1) g.globalAlpha = a0 * alpha;
      if (rot || flipX) {
        g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
      } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
      g.globalAlpha = a0;
    }
    _img(name, x, y, w, h) {
      const spr = RB.Assets.sprite(name, Math.max(w, h) * this.rs * 1.5);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _img2(name, x, y, w, h, alpha) {
      const g = this.g, a0 = g.globalAlpha; g.globalAlpha = a0 * (alpha == null ? 1 : alpha); this._img(name, x, y, w, h); g.globalAlpha = a0;
    }
    _debug(w) {
      const g = this.g;
      g.lineWidth = 2;
      const box = (b, c) => { if (b) { g.strokeStyle = c; g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); } };
      for (const m of w.members || []) box(w.memberHit && w.memberHit(m.id), 'rgba(255,0,0,.6)');
      box(w.bigDrumHit && w.bigDrumHit(), 'rgba(0,160,0,.7)');
      box(w.bopHit && w.bopHit(), 'rgba(255,0,255,.6)');
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
    }
    /* A Talk-time picture (question or answer button): the same drum / animal sticker the band uses. */
    drawItemBody(g, it, s) {
      const b = Object.assign({}, it.token || it.item || it);
      if (b.kind === 'stars') b.kind = 'dots';
      if (b.kind === 'color' && !b.color) b.color = b.value;
      if (b.kind === 'animal' && !b.animal) b.animal = b.value;
      const S = s * 0.9;
      g.save();
      let ok = false;
      if (BA() && BA().drawMember) { try { BA().drawMember(g, b, S, { dpr: this.rs, img: imgOf, cache: false }); ok = true; } catch (e) { ok = false; } }
      if (!ok) this._placeholderMember(g, b, S, {});
      g.restore();
    }
  }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = RB.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.95, cw * 0.95));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  RB.Renderer = Renderer;
})(window.RB = window.RB || {});
