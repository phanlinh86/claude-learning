/* FC.Render (Pip's Camp Hide & Seek) — draws the mountain campsite on one canvas: the sky and mountains of the season
 * (crossfaded), the meadow, the campfire with its bench and tent, the hiding places with friends tucked BEHIND them
 * (clipped at the place's peek line so only the clue — a hat, a flag, a sign, ears — shows), friends hopping in the open,
 * Pip the baby fox, the squirrel surprise, butterflies, weather particles and juice.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels. No camera: screen = world.
 * Clues, flames, glow and butterflies come from FC.CampArt; SVG art from FC.Assets (cached rasters). Missing art is
 * tolerated (simple placeholders) so the game boots while the artists are still drawing. */
(function (FC) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CA = () => FC.CampArt;
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const SKY = [['#CDEBFB', '#F6F0D8'], ['#8FD0F5', '#E3F4FF'], ['#F3D9B5', '#CFE3F0'], ['#C9D9EA', '#F2F6FA']];
  const GROUND = [['#C4E6A2', '#A9D68A'], ['#A8DA8C', '#8CC874'], ['#DCCB92', '#C9B57A'], ['#F1F6FA', '#DCE7F0']];
  const MOUNT = ['#9FB5CF', '#8FA8C6', '#A9A7BF', '#B9C9DC'];
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0'];
  const SPOT_VB = { w: 240, h: 200, ax: 120, ay: 196 };
  const PEEK_DEFAULT = { bush: 62, stump: 70, tent: 58, rock: 66, leaves: 78, log: 84, snowman: 46, drift: 70 };
  const HIDDEN_STATES = { hidden: 1, pop: 1, boo: 1, duck: 1 };
  const SEATED = { seated: 1, dance: 1, leave: 1, gone: 1 };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null ? o[k] : p + (o[k] - p) * a; };
  const PAL = c => (FC.PALETTE && FC.PALETTE[c]) || (CA() && CA().COLORS && CA().COLORS[c]) || { base: c || '#ccc', dark: '#555', light: '#eee' };

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

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._fwT = 0;
      this._season = 0; this._prevSeason = 0; this._fadeU = 1;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      FC.Assets.dropExact();
    }
    prewarm(layout, level) {   // rasterise the big tiles of a season ahead of time
      const s = SEASONS[clamp(level | 0, 0, 3)], H = this.H;
      this._L = (layout && layout.rows) ? layout : (this._L || this._fallbackLayout());
      for (const l of ['mountains', 'forest', 'meadow']) {
        const k = this._layerScale(l);
        FC.Assets.exact(l + '_' + s, Math.round(1200 * k * this.rs), Math.round(this._layerH(l) * k * this.rs));
      }
      void layout; void H;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt;
      const a = world.alpha == null ? 1 : world.alpha;
      const season = o.title ? 0 : o.done ? 3 : clamp(world.level | 0, 0, 3);
      if (season !== this._season) { this._prevSeason = this._season; this._season = season; this._fadeU = 0; }
      this._fadeU = Math.min(1, this._fadeU + dt / 1.6);
      this._L = (world.layout && world.layout.rows) ? world.layout : this._fallbackLayout();
      const amb = weather.ambient || {};
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
      const W = this.W, H = this.H, portrait = H > W, groundY = H - (portrait ? 40 : 28);
      return { W, H, portrait, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY, spotW: 220,
        pip: { x: 120, y: groundY - 6, h: portrait ? 250 : 230 }, camp: { x: W - 150, y: groundY - 10, w: 150 }, bench: [],
        rows: portrait ? [{ y: 0.47 * H, scale: 0.88 }, { y: groundY - 300, scale: 1 }] : [{ y: 0.58 * H, scale: 0.86 }, { y: groundY - 150, scale: 1 }] };
    }

    /* ---------- backdrop: sky, sun, clouds, mountains, forest, meadow (season crossfade) ---------- */
    _horizon() {   // screen y of the forest's foot (the meadow starts here)
      const L = this._L, H = this.H, back = L.rows && L.rows[0] ? L.rows[0].y : H * 0.58;
      const spot = (L.spotW || 220) * 0.8 * (L.rows && L.rows[0] ? L.rows[0].scale || 1 : 1);
      return Math.max(H * 0.28, back - spot * 0.55);
    }
    _layerH(l) { return l === 'mountains' ? 420 : l === 'forest' ? 360 : 300; }
    _layerScale(l) {
      const H = this.H, portrait = H > this.W;
      if (l === 'meadow') return Math.max(1, (H - this._horizon()) / 300 * 0.55);
      return portrait ? 1.25 : 1;
    }
    _backdrop(weather, amb) {
      const g = this.g, W = this.W, H = this.H, u = this._fadeU, s0 = this._prevSeason, s1 = this._season;
      const mix = (arr, i) => (u >= 1 || s0 === s1) ? arr[s1][i] : this._mixHex(arr[s0][i], arr[s1][i], u);
      const top = amb.skyTop || mix(SKY, 0), bot = amb.skyBottom || mix(SKY, 1);
      const sky = g.createLinearGradient(0, 0, 0, this._horizon());
      sky.addColorStop(0, top); sky.addColorStop(1, bot);
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const hz = this._horizon();
      // sun
      const sunA = amb.sun == null ? 1 : amb.sun;
      if (sunA > 0.01) {
        const sx = W * (amb.sunX == null ? 0.2 : amb.sunX), sy = Math.max((this._L.ins ? this._L.ins.top : 0) + 70, Math.min(hz - 180, H * (amb.sunY == null ? 0.14 : amb.sunY)));
        if (FC.Assets.has('sun')) this._sprite('sun', sx, sy, 170, 0, sunA);
        else { g.fillStyle = `rgba(255,226,120,${0.8 * sunA})`; g.beginPath(); g.arc(sx, sy, 50, 0, TAU); g.fill(); }
      }
      // clouds (weather supplies positions)
      for (const c of weather.clouds || []) {
        if (c.alpha <= 0.01 || c.y > hz) continue;
        const nm = FC.Assets.has(c.sprite) ? c.sprite : (FC.Assets.has('cloud_a') ? 'cloud_a' : null);
        const w = 320 * (c.scale || 1);
        if (nm) this._sprite(nm, c.x, c.y, w, 0, clamp(c.alpha, 0, 1) * 0.9);
      }
      // layers, crossfaded between seasons
      const layer = (l, bottomY) => {
        const k = this._layerScale(l), lw = 1200 * k, lh = this._layerH(l) * k;
        const one = (si, al) => {
          if (al <= 0.01) return false;
          const nm = l + '_' + SEASONS[si];
          const tile = FC.Assets.exact(nm, Math.round(lw * this.rs), Math.round(lh * this.rs));
          if (!tile) return false;
          g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = al;
          const y = Math.round((bottomY - lh) * this.rs), tw = tile.width;
          const x0 = -Math.round(((W * this.rs - tw) / 2 % tw + tw) % tw);
          for (let x = x0 - tw; x < W * this.rs; x += tw) g.drawImage(tile, x, y);
          g.restore();
          return true;
        };
        let ok;
        if (u < 1 && s0 !== s1) { ok = one(s0, 1); one(s1, u); } else ok = one(s1, 1);
        return ok;
      };
      if (!layer('mountains', hz - 20)) {   // placeholder range
        g.fillStyle = mix(MOUNT, 0) || MOUNT[s1];
        g.beginPath(); g.moveTo(0, hz);
        for (let i = 0; i <= 8; i++) g.lineTo(W * i / 8, hz - 120 - ((i * 37) % 5) * 26 - (i % 2 ? 0 : 60));
        g.lineTo(W, hz); g.closePath(); g.fill();
      }
      layer('forest', hz + 30);
      // ground base (under the meadow tile)
      const gr = g.createLinearGradient(0, hz, 0, H);
      gr.addColorStop(0, mix(GROUND, 0)); gr.addColorStop(1, mix(GROUND, 1));
      g.fillStyle = gr; g.fillRect(0, hz + 20, W, H - hz);
      layer('meadow', H + 4);
    }
    _mixHex(a, b, t) {
      const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      if (!a || !b || a[0] !== '#' || b[0] !== '#') return b || a;
      const x = p(a), y = p(b);
      return '#' + x.map((v, i) => Math.round(lerp(v, y[i], t)).toString(16).padStart(2, '0')).join('');
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L;
      this._camp(w, a, 'back');
      // depth order: everything sorted by its ground y (back row first)
      const items = [];
      const byPlace = {};
      for (const f of w.friends || []) {
        if (f.state === 'gone') continue;
        if (f.place != null && HIDDEN_STATES[f.state]) (byPlace[f.place] = byPlace[f.place] || []).push(f);
        else items.push({ y: ip(f, 'y', a), k: 'friend', o: f });
      }
      for (const p of w.places || []) items.push({ y: p.y, k: 'place', o: p, hid: byPlace[p.id] || [] });
      if (w.pip || L.pip) items.push({ y: (L.pip ? L.pip.y : this.H) + 1, k: 'pip' });
      if (w.critter) items.push({ y: w.critter.y - 0.5, k: 'critter', o: w.critter });
      items.sort((p, q) => p.y - q.y);
      for (const it of items) {
        if (it.k === 'place') this._place(w, it.o, it.hid, a);
        else if (it.k === 'friend') this._friend(w, it.o, a, false);
        else if (it.k === 'pip') this._pip(w, o);
        else if (it.k === 'critter') this._critter(it.o);
      }
      this._camp(w, a, 'front');
    }
    friendSize(w, f) {   // px of the 128-box sprite
      if (f.size) return f.size;
      const L = this._L, base = (L.spotW || 220) * (SEATED[f.state] ? 0.55 : 0.75);
      return base * (f.scale || 1);
    }
    _peekY(p) {
      if (p.peekY != null) return p.peekY;
      const meta = FC.Assets.spots && FC.Assets.spots[p.kind];
      const vy = meta && meta.peekY != null ? meta.peekY : (PEEK_DEFAULT[p.kind] || 64);
      return p.y - (SPOT_VB.ay - vy) * (p.w / SPOT_VB.w);
    }
    _place(w, p, hid, a) {
      const g = this.g, CAx = CA(), k = p.w / SPOT_VB.w;
      const ap = p.appear == null ? 1 : clamp(p.appear, 0, 1);
      if (ap <= 0.001) return;
      const sc = easeOutBack(ap);
      const x = p.x, y = p.y, sh = ip(p, 'shake', a) || 0, open = clamp(p.open || 0, 0, 1);
      // hint glow behind
      if ((p.glow || 0) > 0.01 && CAx && CAx.drawGlow) {
        g.save(); g.translate(x, y - p.w * 0.42); CAx.drawGlow(g, p.w * 1.35, p.w * 1.15, this.time, p.glow); g.restore();
      }
      // hidden friends, clipped at the peek line
      if (hid.length) {
        const py = this._peekY(p) + (open > 0.5 ? -p.w * 0.25 * (open - 0.5) * 2 : 0);   // an opened place lets more show
        g.save(); g.beginPath(); g.rect(-50, -400, this.W + 100, py + 400); g.clip();
        for (const f of hid) this._friend(w, f, a, true, p);
        g.restore();
      }
      // the place itself (rotation/squash about its bottom anchor)
      const pulse = Math.sin(open * Math.PI) * 0.08;
      g.save(); g.translate(x, y); g.rotate(sh); g.scale((p.sx || 1) * sc * (1 + pulse), (p.sy || 1) * sc * (1 - pulse * 0.6));
      const nm = 'spot_' + p.kind + (open > 0.5 && FC.Assets.has('spot_' + p.kind + '_open') ? '_open' : '');
      if (FC.Assets.has(nm)) this._img(nm, -SPOT_VB.ax * k, -SPOT_VB.ay * k, SPOT_VB.w * k, SPOT_VB.h * k);
      else this._placeholderSpot(g, p, k);
      g.restore();
    }
    _placeholderSpot(g, p, k) {
      const col = { bush: '#7FAE6A', stump: '#9C7653', tent: '#E9DCC0', rock: '#A4A8AE', leaves: '#C4955A', log: '#8E6A4A', snowman: '#FFFFFF', drift: '#F2F6FA' }[p.kind] || '#8BB070';
      const top = (this._peekY(p) - p.y);
      g.fillStyle = col; g.strokeStyle = 'rgba(60,60,60,.45)'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(0, (top) / 2, 110 * k, -top / 2 + 8, 0, 0, TAU); g.fill(); g.stroke();
    }
    _friend(w, f, a, hidden, place) {
      const g = this.g, CAx = CA();
      const s = this.friendSize(w, f);
      const x = ip(f, 'x', a), y = ip(f, 'y', a), rot = ip(f, 'rot', a) || 0;
      const L = this._L;
      let flip = false;
      if (f.flip != null) flip = !!f.flip;
      else if (SEATED[f.state] && L.camp) flip = x > L.camp.x;
      else if (f._px != null && f.x < f._px - 0.4) flip = true;
      const nm0 = 'animal_' + f.animal, nm = (f.wave || f.state === 'boo' || f.state === 'dance') && FC.Assets.has(nm0 + '_wave') ? nm0 + '_wave' : nm0;
      // shadow on the grass (not for hidden friends)
      if (!hidden) {
        const gy = f.groundY != null ? f.groundY : y;
        const lift = clamp((gy - y) / 120, 0, 1);
        g.fillStyle = `rgba(40,60,30,${0.18 * (1 - lift * 0.6)})`;
        g.beginPath(); g.ellipse(x, gy + 2, s * 0.32 * (1 - lift * 0.4), s * 0.07, 0, 0, TAU); g.fill();
      }
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(f.sx || 1, f.sy || 1);
      if (flip) g.scale(-1, 1);
      if (FC.Assets.has(nm)) this._img(nm, -s / 2, -s * 0.96, s, s);
      else { g.fillStyle = '#E0A060'; g.beginPath(); g.arc(0, -s * 0.45, s * 0.4, 0, TAU); g.fill(); }
      if (flip) g.scale(-1, 1);
      // the clue sits on the head top (≈ 14 % down the 128 box)
      const c = f.clue;
      if (c && CAx && CAx.drawClue && c.kind !== 'ears' && c.kind !== 'size') {
        const bob = (place && (place.glow || 0) > 0.3) ? Math.sin(this.time * 6) * 4 : 0;
        g.save(); g.translate(0, -s * 0.96 + s * 0.14 + bob);
        try { CAx.drawClue(g, c, s, { t: this.time, sway: Math.sin(this.time * 2 + (f.id | 0)) * 0.05 }); } catch (e) { /* art still in progress */ }
        g.restore();
      }
      g.restore();
    }
    _pipFrame(w, o) {
      const m = (w.pip && w.pip.mood) || 'idle';
      let f = 'pip_' + (['happy', 'cheer', 'think', 'oops', 'cover', 'peek', 'talk'].includes(m) ? m : 'idle');
      if (f === 'pip_idle' || (f === 'pip_happy' && o.speaking)) {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) f = 'pip_talk';
        else if (f === 'pip_idle' && this._blinking(o.dt)) f = 'pip_blink';
      }
      return FC.Assets.has(f) ? f : 'pip_idle';
    }
    _pip(w, o) {
      const L = this._L, P = L.pip; if (!P) return;
      const g = this.g, h = P.h, ww = h * 256 / 300;
      const m = (w.pip && w.pip.mood) || 'idle';
      const hop = m === 'cheer' ? Math.abs(Math.sin(this.time * 7)) * 14 : 0;
      const breathe = 1 + Math.sin(this.time * 2.4) * 0.012;
      g.fillStyle = 'rgba(40,60,30,.2)'; g.beginPath(); g.ellipse(P.x, P.y + 2, ww * 0.36, 12, 0, 0, TAU); g.fill();
      g.save(); g.translate(P.x, P.y - hop); g.scale(1 / breathe, breathe);
      const f = this._pipFrame(w, o);
      if (FC.Assets.has(f)) this._img(f, -ww / 2, -h * 292 / 300, ww, h);
      else { g.fillStyle = '#D27B4E'; g.beginPath(); g.ellipse(0, -h * 0.4, ww * 0.35, h * 0.38, 0, 0, TAU); g.fill(); g.fillStyle = '#2FA7A0'; g.fillRect(-ww * 0.25, -h * 0.5, ww * 0.5, 14); }
      g.restore();
    }
    _critter(c) {
      const t = c.t || 0, up = c.state === 'up' || c.state === 'tapped';
      const rise = c.state === 'in' ? clamp(t / 0.35, 0, 1) : c.state === 'out' ? 1 - clamp(t / 0.35, 0, 1) : 1;
      const nm = up && FC.Assets.has('critter_pop') && Math.floor(this.time * 2) % 2 ? 'critter_pop' : 'critter';
      const s = 96;
      const g = this.g;
      g.save(); g.beginPath(); g.rect(c.x - s, c.y - s * 1.6, s * 2, s * 1.6); g.clip();
      this._sprite(nm, c.x, c.y - s * 0.45 + (1 - rise) * s, s);
      g.restore();
    }
    _camp(w, a, layer) {
      const L = this._L, C = L.camp; if (!C) return;
      const g = this.g, cw = C.w || 150, k = cw / 200, power = clamp(w.fire ? w.fire.power || 0 : 0, 0, 1);
      if (layer === 'back') {
        // decorative tent behind the fire, a lantern on its pole, the log benches
        const tw = cw * 1.25;
        if (FC.Assets.has('tent_bg')) this._img('tent_bg', C.x + cw * 0.05 - tw / 2, C.y - tw * 200 / 260 - cw * 0.25, tw, tw * 200 / 260);
        if (FC.Assets.has('lantern')) {
          const lx = C.x - cw * 0.55, ly = C.y - cw * 1.05, sw = Math.sin(this.time * 1.8) * 0.06;
          g.save(); g.translate(lx, ly); g.rotate(sw); this._img('lantern', -16, 0, 32, 54); g.restore();
          g.strokeStyle = '#7A5C42'; g.lineWidth = 4; g.beginPath(); g.moveTo(lx, ly + 2); g.lineTo(lx, C.y - 4); g.stroke();
        }
        const seats = L.bench || [];
        const groups = [seats.slice(0, 3), seats.slice(3, 6)];
        for (const grp of groups) {
          if (!grp.length) continue;
          const x0 = Math.min(...grp.map(s => s.x)), x1 = Math.max(...grp.map(s => s.x)), yy = Math.max(...grp.map(s => s.y));
          const bw = (x1 - x0) + (L.spotW || 220) * 0.55, bx = (x0 + x1) / 2;
          if (FC.Assets.has('bench')) this._img('bench', bx - bw / 2, yy + 8 - bw * 84 / 360, bw, bw * 90 / 360);
          else { g.fillStyle = '#8E6A4A'; g.beginPath(); roundRect(g, bx - bw / 2, yy - 6, bw, 18, 9); g.fill(); }
        }
        // warm glow
        const gl = 0.25 + 0.25 * power + Math.sin(this.time * 9) * 0.03;
        const rg = g.createRadialGradient(C.x, C.y - cw * 0.3, 10, C.x, C.y - cw * 0.3, cw * 1.6);
        rg.addColorStop(0, `rgba(255,190,90,${gl})`); rg.addColorStop(1, 'rgba(255,190,90,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(C.x, C.y - cw * 0.3, cw * 1.6, 0, TAU); g.fill();
        return;
      }
      // front: stones + logs, then the flames
      if (FC.Assets.has('campfire')) this._img('campfire', C.x - cw / 2, C.y - 132 * k, cw, 140 * k);
      else { g.fillStyle = '#7d6a5a'; g.beginPath(); g.ellipse(C.x, C.y - 10, cw * 0.45, 16, 0, 0, TAU); g.fill(); }
      const CAx = CA();
      if (CAx && CAx.drawFlames) {
        g.save(); g.translate(C.x, C.y - (132 - 92) * k);
        try { CAx.drawFlames(g, 0.3 + 0.6 * power, this.time, cw * (0.4 + 0.1 * power)); } catch (e) { /* in progress */ }
        g.restore();
      }
      if (power > 0.5 && Math.random() < 0.25 * this.quality) {
        this.fx.push({ k: 'p', sprite: 'sparkle', tint: '#FFC86B', x: C.x + (Math.random() - 0.5) * 30, y: C.y - cw * 0.5, vx: (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 120, g: 0, t: 0, life: 0.8, size: 14, rot: 0, vr: 3 });
      }
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }

    /* ---------- title & celebration ---------- */
    _titleScene(w, o) {
      const g = this.g, L = this._L, W = this.W, H = this.H, portrait = H > W, ins = L.ins || {};
      const gy = H - (ins.bottom || 0) - (portrait ? 70 : 34);
      // a tent and a bush on the right with a friend peeking (red hat), Pip waving on the left
      const tw = portrait ? 300 : 280;
      const tx = portrait ? W * 0.7 : W - (ins.right || 0) - Math.max(200, W * 0.17);
      if (FC.Assets.has('tent_bg')) this._img('tent_bg', tx - tw / 2 + 40, gy - tw * 200 / 260 - 30, tw, tw * 200 / 260);
      const bw = portrait ? 250 : 230, bx = tx - (portrait ? 70 : 110), k = bw / SPOT_VB.w;
      const fake = { kind: 'bush', x: bx, y: gy, w: bw };
      const peek = this._peekY(fake);
      const cyc = this.time % 3.2, rise = cyc < 0.4 ? cyc / 0.4 : cyc < 2.4 ? 1 : cyc < 2.8 ? 1 - (cyc - 2.4) / 0.4 : 0;
      const fs = bw * 0.72, fy = peek + fs * 0.62 - rise * fs * 0.42;
      g.save(); g.beginPath(); g.rect(0, 0, W, peek); g.clip();
      this._friend(w, { id: 1, animal: 'cat', x: bx + 6, y: fy, size: fs, state: 'hidden', clue: { kind: 'hat', value: 'red', color: 'red' } }, 1, true);
      g.restore();
      const sh = Math.sin(this.time * 11) * 0.03 * (rise > 0 && rise < 1 ? 1 : 0);
      g.save(); g.translate(bx, gy); g.rotate(sh);
      if (FC.Assets.has('spot_bush')) this._img('spot_bush', -SPOT_VB.ax * k, -SPOT_VB.ay * k, SPOT_VB.w * k, SPOT_VB.h * k);
      else this._placeholderSpot(g, fake, k);
      g.restore();
      // Pip waving
      const ph = portrait ? 290 : 250, pw = ph * 256 / 300;
      const px = portrait ? W * 0.27 : (ins.left || 0) + Math.max(170, W * 0.16);
      const hop = (this.time % 2.4) < 0.5 ? Math.sin((this.time % 2.4) / 0.5 * Math.PI) * 18 : 0;
      g.fillStyle = 'rgba(40,60,30,.2)'; g.beginPath(); g.ellipse(px, gy + 2, pw * 0.36, 12, 0, 0, TAU); g.fill();
      const nm = FC.Assets.has('pip_full_wave') ? 'pip_full_wave' : 'pip_happy';
      if (FC.Assets.has(nm)) this._img(nm, px - pw / 2, gy - hop - ph * 292 / 300, pw, ph);
    }
    _doneScene(w, o, amb) {   // the winter-night campfire party: lanterns, fireworks and every friend met
      const g = this.g, L = this._L, W = this.W, H = this.H, t = this.time, portrait = H > W, ins = L.ins || {};
      // dusk over the snow
      const dk = amb.darkness != null ? Math.max(0.25, amb.darkness) : 0.3;
      g.fillStyle = `rgba(20,28,70,${dk})`; g.fillRect(0, 0, W, H);
      this._fwT -= o.dt || 0;
      if (this._fwT <= 0) { this._fwT = 0.7 + Math.random() * 0.6; this.burst('firework', W * (0.12 + Math.random() * 0.76), H * (0.12 + Math.random() * 0.28)); }
      const gy = portrait ? H * 0.38 : H - (ins.bottom || 0) - 50;
      const fxC = portrait ? W / 2 : (ins.left || 0) + Math.max(260, W * 0.27);
      // lantern string
      g.strokeStyle = 'rgba(90,70,50,.8)'; g.lineWidth = 3; g.beginPath();
      const ly = gy - (portrait ? 330 : 300);
      g.moveTo(fxC - 260, ly); g.quadraticCurveTo(fxC, ly + 50, fxC + 260, ly); g.stroke();
      for (let i = 0; i < 5; i++) {
        const u = (i + 0.5) / 5, lx = fxC - 260 + 520 * u, yy = ly + 50 * 2 * u * (1 - u) * 1 + 4;
        const rg = g.createRadialGradient(lx, yy + 22, 2, lx, yy + 22, 40);
        rg.addColorStop(0, 'rgba(255,214,120,.55)'); rg.addColorStop(1, 'rgba(255,214,120,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(lx, yy + 22, 40, 0, TAU); g.fill();
        if (FC.Assets.has('lantern')) this._img('lantern', lx - 14, yy, 28, 46);
      }
      // the big fire
      const cw = 190, k = cw / 200;
      const rg = g.createRadialGradient(fxC, gy - 60, 10, fxC, gy - 60, 300);
      rg.addColorStop(0, 'rgba(255,190,90,.55)'); rg.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(fxC, gy - 60, 300, 0, TAU); g.fill();
      if (FC.Assets.has('campfire')) this._img('campfire', fxC - cw / 2, gy - 132 * k, cw, 140 * k);
      if (CA() && CA().drawFlames) { g.save(); g.translate(fxC, gy - 40 * k); try { CA().drawFlames(g, 1, t, cw * 0.6); } catch (e) { } g.restore(); }
      // Pip cheering left of the fire, friends dancing on both sides
      const ph = Math.min(portrait ? 270 : 250, H * 0.4), pw = ph * 256 / 300, cyc = t % 1.1, hop = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) * 26 : 0;
      const pipX = portrait ? fxC - cw * 0.5 - pw * 0.3 : fxC - cw * 0.5 - pw * 0.42;
      const met = (w.met && w.met.length ? w.met : (FC.ANIMALS || [])).slice(0, 8);
      const n = met.length, gap = portrait ? 70 : 84;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, kk = Math.floor(i / 2);
        let fx = side > 0 ? fxC + cw * 0.55 + 40 + kk * gap : pipX - pw * 0.45 - 30 - kk * gap;
        let fyy = gy + 14;
        if (portrait) { fx = (ins.left || 0) + 40 + (W - (ins.left || 0) - (ins.right || 0) - 80) * (i + 0.5) / n; fyy = gy + 115 + (i % 2) * 18; }
        if (fx < (ins.left || 0) + 40 || fx > W - (ins.right || 0) - 40) continue;
        const hp = Math.max(0, Math.sin(t * 3.2 + i * 0.9)) * 16;
        this._friend(w, { id: i, animal: met[i], x: fx, y: fyy - hp + (portrait ? 0 : (kk % 2) * 10), size: portrait ? 80 : 92, state: 'dance', wave: hp > 8, flip: side > 0 }, 1, false);
      }
      const nm = FC.Assets.has('pip_cheer') ? 'pip_cheer' : 'pip_idle';
      if (FC.Assets.has(nm)) this._img(nm, pipX - pw / 2, gy + 30 - hop - ph * 292 / 300, pw, ph);
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((FC.CONFIG && FC.CONFIG.introTime) || 1.8) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * 0.42;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(60,50,30,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#D9C9A8'; g.stroke();
      const I = FC.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7a6a55', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#1E7A74', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7a6a55', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#1E7A74', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 260) fx.splice(0, fx.length - 260);
      const R = Math.random;
      const colOf = c => (c && FC.PALETTE && FC.PALETTE[c]) ? FC.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
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
        const s = this._season, sprites = [['petal', 'puff'], ['leaf_a', 'puff'], ['leaf_a', 'leaf_b'], ['snow', 'puff']][s] || ['puff'];
        const n = Math.round((opt.n || 8) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = 90 + R() * 160;
          const spr = sprites[i % sprites.length];
          fx.push({ k: 'p', sprite: FC.Assets.has(spr) ? spr : 'puff', tint: s === 1 && spr === 'leaf_a' ? '#7FAE6A' : null, x: x + (R() - 0.5) * (opt.size || 120) * 0.6, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
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
          if (CA() && CA().drawButterfly) { try { CA().drawButterfly(g, f.size, this.time + f.ph, f.color); } catch (e) { } }
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
          outlinedText(g, f.text, 0, 0, 84, '#FFD23F', '#7E3F25', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = FC.Assets.tinted ? FC.Assets.tinted(name, color, size * this.rs) : FC.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      const g = this.g;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || p.alpha <= 0.01 || p.kind === 'streak') continue;
        if (p.kind === 'butterfly' || p.sprite === 'butterfly') {
          if (CA() && CA().drawButterfly) { g.save(); g.globalAlpha *= p.alpha; g.translate(p.x, p.y); try { CA().drawButterfly(g, p.size || 30, this.time + (p.ph || 0), p.color || '#FFD23F'); } catch (e) { } g.restore(); }
          continue;
        }
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        if (p.color) this._tinted(nm, p.color, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = FC.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = FC.Assets.sprite(name, Math.max(w, h) * this.rs * 1.5);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      for (const p of w.places || []) {
        const b = w.placeHit && w.placeHit(p.id); if (b) g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        g.strokeStyle = 'rgba(0,160,0,.7)'; g.beginPath(); g.moveTo(p.x - p.w / 2, this._peekY(p)); g.lineTo(p.x + p.w / 2, this._peekY(p)); g.stroke(); g.strokeStyle = 'rgba(255,0,0,.6)';
      }
      const pb = w.pipHit && w.pipHit(); if (pb) g.strokeRect(pb.x - pb.w / 2, pb.y - pb.h / 2, pb.w, pb.h);
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
    }
    /* A Talk-time picture (or answer-button picture): colour = a ball of wool, shape, stars, number, letter, animal. */
    drawItemBody(g, it, s) {
      const tk = it.token || it.clue || it, kind = tk.kind === 'dots' ? 'stars' : tk.kind;
      g.save();
      g.lineJoin = 'round';
      if (kind === 'color' || kind === 'hat') {
        const c = PAL(tk.color || tk.value), r = s * 0.36;
        g.fillStyle = c.base; g.strokeStyle = c.dark; g.lineWidth = Math.max(3, s * 0.035);
        g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.stroke();
        g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
        g.strokeStyle = c.dark; g.globalAlpha = 0.45; g.lineWidth = Math.max(2, s * 0.02);
        for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(0, 0, r * 1.1, Math.abs(i) * r * 0.28 + r * 0.05, i * 0.5, 0, TAU); g.stroke(); }
        g.restore();
        g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, TAU); g.fill();
      } else if (kind === 'shape' || kind === 'flag') {
        const c = PAL(tk.color || 'blue'), r = s * 0.36;
        shapePath(g, tk.shape || tk.value, r);
        g.fillStyle = c.base; g.fill(); g.strokeStyle = c.dark; g.lineWidth = Math.max(3, s * 0.035); g.stroke();
      } else if (kind === 'stars' || kind === 'sign') {
        const n = Math.max(1, Math.min(10, +(tk.n != null ? tk.n : tk.value) || 1));
        const pos = DICE[n] || Array.from({ length: n }, (_, i) => [((i % 4) - 1.5) / 1.5, (Math.floor(i / 4) - (Math.ceil(n / 4) - 1) / 2) * 0.9]);
        const sp = s * 0.26, r = n > 6 ? s * 0.09 : s * 0.12;
        for (const [dx, dy] of pos) {
          g.save(); g.translate(dx * sp, dy * sp); starPath(g, r);
          g.fillStyle = '#FFD23F'; g.fill(); g.strokeStyle = '#C99A12'; g.lineWidth = Math.max(2, s * 0.022); g.stroke(); g.restore();
        }
      } else if (kind === 'animal' || kind === 'size' || kind === 'ears') {
        const a = tk.animal || (tk.sprite ? String(tk.sprite).replace('animal_', '') : tk.value);
        const sc = tk.scale || (tk.size === 'small' || tk.value === 'small' ? 0.6 : 1);
        const z = s * 0.9 * sc;
        this._sprite('animal_' + a, 0, s * 0.45 - z / 2, z, 0, 1, g);
      } else {
        const txt = String(tk.text != null ? tk.text : tk.value);
        g.fillStyle = '#F4E3C3'; g.strokeStyle = '#8A6E4E'; g.lineWidth = Math.max(3, s * 0.03);
        g.beginPath(); g.arc(0, 0, s * 0.38, 0, TAU); g.fill(); g.stroke();
        outlinedText(g, txt, 0, s * 0.02, s * 0.42, '#4A3426', null, s * 0.6);
      }
      g.restore();
    }
  }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = FC.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.95, cw * 0.95));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  FC.Renderer = Renderer;
})(window.FC = window.FC || {});
