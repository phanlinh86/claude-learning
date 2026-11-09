/* PZ.Renderer (Pom's Puzzle Town) — draws the little town street and the jigsaw on one canvas:
 * sky gradient (ambient colours crossfading spring → summer → autumn → winter), sun, clouds, far rooftops + clock tower
 * (moving hands), mid shopfronts, pavement (tools/env_scenes.js RECIPE), seasonal particles, Pom (mood frames, blink, talk
 * flaps, hop, lean towards the held piece), the picture board (slide-in, tilt, jiggle, page turn — MECHANICS §3) with its
 * shadows and placed pieces, the tray, resting pieces, surprises (pigeon, soap bubbles), the hint hand and the held / flying
 * piece LAST, then fx (sparkles, rings, stars to the HUD, confetti, count numerals) and the chapter banner. Title: Pom
 * waving with a puzzle piece beside a small board. Session done: the finished pictures parade in, every one alive.
 * Logical coordinates (short side 720) × render scale rs = device pixels. No camera. Missing art is tolerated. */
(function (PZ) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['spring', 'summer', 'autumn', 'winter'];
  // tools/art_env.js tables (RECIPE.SKY / PAVE_BOTTOM)
  const SKY = { spring: [[0, '#BFE3F5'], [1, '#FDEFF4']], summer: [[0, '#79C6EF'], [1, '#D3F0FB']],
    autumn: [[0, '#F3C08E'], [1, '#FCE7C8']], winter: [[0, '#B9C8DC'], [1, '#EDF1F6']] };
  const PAVE_BOTTOM = { spring: '#D3C8B7', summer: '#D6CBB8', autumn: '#CFC0AA', winter: '#E6EAF0' };
  // Pom: 300×300 frames, feet anchor (150, 292); the visible body is ≈ 236 tall (docs/art/pom_bbox.json y 58…293)
  const POM = { w: 300, h: 300, ax: 150, ay: 292, body: 236 };
  const PIGEON = { w: 160, h: 140, ax: 80, ay: 136 };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const PA = () => PZ.PuzzleArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1 };

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

  /* ---------- env recipe: copied verbatim from tools/env_scenes.js (pure) ---------- */
  function envLayout(W, H, ins) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    const streetY = Math.round(H * (portrait ? 0.74 : 0.56));
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.7 * kp, km = 0.86 * kp;
    const kg = Math.max(1, Math.min(1.8, (H - streetY) / 220));
    const cx = W / 2;
    // clock tower (far x 864) just left of the HUD in landscape, right third in portrait
    const towerX = portrait ? W * 0.8 : W - ins.right - 210;
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(towerX - 864 * kf), y: Math.round(streetY - 150 * km - 720 * kf) };
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(cx - 560 * km), y: streetY - 298 * km };
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(cx - 600 * kg), y: streetY - 40 * kg };
    ground.fillY = ground.y + 258 * kg;
    const hillTop = far.y + 470 * kf;                         // highest roof ridge of the far skyline (tower excluded)
    const skyY1 = Math.round(far.y + 560 * kf);               // sky gradient end: around the front-row roofs
    let sun;
    if (!portrait) {
      // in the free sky between the bubble's right edge (bx) and the clock tower, clear of the water tower
      // (far x 258 → towerX − 424·kf); on narrow screens it hides half behind the clock tower, which reads well.
      const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24), sx = d => Math.max(bx + 70, towerX - d);
      sun = {
        spring: { x: sx(250), y: ins.top + 96, size: 150 },
        summer: { x: sx(170), y: ins.top + 60, size: 160 },
        autumn: { x: sx(280), y: ins.top + 104, size: 156 },
        winter: { x: sx(210), y: ins.top + 84, size: 140 },
      };
    } else {
      const s = Math.min(130, Math.max(100, W * 0.17));
      sun = {
        spring: { x: W * 0.2, y: ins.top + 62, size: s },
        summer: { x: W * 0.36, y: ins.top + 50, size: s * 1.08 },
        autumn: { x: W * 0.26, y: ins.top + 66, size: s * 1.04 },
        winter: { x: W * 0.3, y: ins.top + 58, size: s * 0.94 },
      };
    }
    const clouds = portrait
      ? { y0: ins.top + 24, y1: ins.top + 96, s: 0.5 }
      : { y0: ins.top + 26, y1: ins.top + 104, s: 0.6 };
    const clock = tileXs(far.x0, far.w, W).map(x => ({ x: x + 864 * kf, y: far.y + 440 * kf, r: 24 * kf })).filter(p => p.x > -40 && p.x < W + 40);
    return { portrait, tall, streetY, sandY: streetY, kp, far, mid, ground, hillTop, skyY1, sun, clouds, clock, volcano: [], starsY1: hillTop };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this.gallery = []; this._galleryT = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      PZ.Assets.dropExact();
      this._envKey = '';
    }
    prewarm(layout, level) {   // rasterise the big tiles of a season ahead of time
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3) % 4];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
    }
    /** the session's finished pictures for the done screen (main passes sessionDone.pictures) */
    setGallery(list) { this.gallery = (list || []).slice(-8); this._galleryT = 0; }   // the last 8: big enough to recognise on a phone
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right)].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins);
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return PZ.Assets.exact(layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._season = amb.moodIndex != null ? amb.moodIndex : 0;
      this._envFor(this._L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }

    /* ---------- backdrop: sky → sun → clouds → far (+ clock hands) → mid → ground (+ fill); seasons crossfade ---------- */
    _backdrop(amb, weather) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const to = MOODS.includes(amb.env) ? amb.env : 'spring', from = MOODS.includes(amb.envFrom) ? amb.envFrom : to;
      const mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1), fading = from !== to && mix < 1;
      // sky: the weather's crossfaded ambient colours (top → mid → bottom) down to the skyline, the last stop below
      const gr = g.createLinearGradient(0, 0, 0, E.skyY1);
      if (amb.skyTop) { gr.addColorStop(0, amb.skyTop); if (amb.skyMid) gr.addColorStop(0.5, amb.skyMid); gr.addColorStop(1, amb.skyBottom || amb.skyTop); }
      else for (const [o, c] of SKY[to]) gr.addColorStop(o, c);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // the sun: glides between the seasons' spots
      const sunA = clamp(amb.sunA == null ? 1 : amb.sunA, 0, 1);
      const s1 = E.sun[to], s0 = fading ? E.sun[from] : s1;
      const sp = { x: lerp(s0.x, s1.x, mix), y: lerp(s0.y, s1.y, mix), size: lerp(s0.size, s1.size, mix) };
      if (sunA > 0.02) {
        const glow = g.createRadialGradient(sp.x, sp.y, sp.size * 0.2, sp.x, sp.y, sp.size * 1.25);
        const warm = to === 'autumn' ? '255,214,160' : '255,248,220';
        glow.addColorStop(0, `rgba(${warm},${0.42 * sunA})`); glow.addColorStop(1, `rgba(${warm},0)`);
        g.fillStyle = glow; g.beginPath(); g.arc(sp.x, sp.y, sp.size * 1.25, 0, TAU); g.fill();
        g.globalAlpha = sunA; this._img('sun', sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size); g.globalAlpha = 1;
      }
      const cs = E.clouds.s / 0.6;
      for (const c of weather.clouds || []) {
        if (!(c.alpha > 0.01)) continue;
        const w = 300 * (c.s || 0.6) * cs, h = 140 * (c.s || 0.6) * cs;
        g.save(); g.globalAlpha = c.alpha; g.translate(c.x, c.y); if (c.flipX) g.scale(-1, 1);
        this._img(c.type || 'cloud_a', -w / 2, -h / 2, w, h); g.restore();
      }
      const layer = l => {
        const Ly = E[l];
        const one = (m, al) => {
          if (al <= 0.01) return;
          const t = this._tile(l, m); if (!t) return;
          g.globalAlpha = al;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
          if (l === 'ground' && Ly.fillY < H) { g.fillStyle = PAVE_BOTTOM[m]; g.fillRect(0, Ly.fillY - 0.5, W, H - Ly.fillY + 0.5); }
          g.globalAlpha = 1;
        };
        if (fading) { one(from, 1); one(to, mix); } else one(to, 1);
      };
      layer('far'); this._clockHands(); layer('mid'); layer('ground');
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
    }
    /** the clock tower's two hands turn slowly (a big-hand lap every 60 s) */
    _clockHands() {
      const g = this.g, E = this._env;
      if (!E.clock || !E.clock.length) return;
      const t = this.time, aM = (t / 60) * TAU, aH = (t / 720) * TAU + 1.2;
      g.save(); g.strokeStyle = '#7D7468'; g.lineCap = 'round';
      for (const c of E.clock) {
        g.lineWidth = Math.max(1.5, c.r * 0.12);
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x + Math.sin(aM) * c.r * 0.78, c.y - Math.cos(aM) * c.r * 0.78);
        g.moveTo(c.x, c.y); g.lineTo(c.x + Math.sin(aH) * c.r * 0.5, c.y - Math.cos(aH) * c.r * 0.5); g.stroke();
      }
      g.restore();
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L; if (!L) return;
      this._pom(w.pom, L.pom);
      this._board(w, a);
      const P = PA();
      if (P && L.tray && (w.board.show || w.state === 'round' || w.state === 'roundDone')) {
        // one wooden shelf per tray row (pieces stand bottom-aligned on each row's ledge) — not one tall box
        const T = L.tray, rows = T.rows && T.rows.length ? T.rows : null, ms = L.maxSize || L.item;
        if (!rows) { try { P.drawTray(this.g, T, this._season, { item: L.item, t: this.time }); } catch (e) { /* skip */ } }
        else {
          // no empty shelf (visual P2-5): a shelf shows while one of this round's pieces rests on it (or is dropping / gliding home
          // to it); once its last piece is in the picture it fades away (0.25 s), and fades in again with the next round's pieces
          const sp = T.roundSpots || null, live = new Set();
          if (sp) for (const p of w.pieces || []) if (p.spot != null && sp[p.spot] && !['placed', 'gone', 'snap'].includes(p.state)) live.add(sp[p.spot].row);
          const SA = this._shelfA || (this._shelfA = {}), k = Math.min(1, (o.dt || 0.016) * 4);
          rows.forEach((r, i) => {
            const tgt = !sp || live.has(i) ? 1 : 0;
            SA[i] = SA[i] == null ? tgt : SA[i] + (tgt - SA[i]) * k;
            if (SA[i] < 0.01) return;
            const box = { x: r.x0 - 14, y: r.y - ms - 26, w: r.x1 - r.x0 + 28, h: ms + 26 + 22, spots: (sp || T.spots || []).filter(s => s.row === i) };
            if (box.y + box.h > this.H - 2) { box.h = this.H - 2 - box.y; }
            this.g.save(); this.g.globalAlpha *= SA[i];
            try { P.drawTray(this.g, box, this._season, { item: L.item, t: this.time }); } catch (e) { /* skip */ }
            this.g.restore();
          });
        }
      }
      const pieces = w.pieces || [];
      let held = null;
      for (const p of pieces) {
        if (p.state === 'placed') continue;                       // drawn on the board
        if (p.state === 'held') { held = p; continue; }
        this._piece(p, a, w);
      }
      this._pigeon(w.pigeon, a);
      for (const b of w.bubbles || []) this._bubble(b, a);
      this._hintHand(w.hintHand, w, a);
      if (held) this._piece(held, a, w);
    }
    /** the picture board with its shadows and placed pieces, in the board transform (MECHANICS §3) */
    _board(w, a) {
      const B = w.board, P = PA(), g = this.g, L = this._L;
      if (!B || !B.show || !P || !(B.w > 4)) return;
      const ox = ip(B, 'ox', a) || 0, jig = ip(B, 'jig', a) || 0, tilt = ip(B, 'tilt', a) || 0, turn = clamp(ip(B, 'turn', a) || 0, 0, 1);
      const shine = clamp(ip(B, 'shine', a) || 0, 0, 1), alive = clamp(ip(B, 'alive', a) || 0, 0, 1);
      const cx = B.x + B.w / 2, cy = B.y + B.h / 2, kx = Math.cos(turn * Math.PI / 2);
      if (kx < 0.02) return;
      g.save();
      g.translate(ox, jig);
      if (tilt) { g.translate(cx, cy); g.rotate(tilt); g.translate(-cx, -cy); }
      if (turn > 0) { g.translate(B.x - (L.frame || 22), 0); g.scale(kx, 1); g.translate(-(B.x - (L.frame || 22)), 0); }
      g.save(); g.translate(B.x, B.y);
      try { P.drawBoard(g, { w: B.w, h: B.h, r: B.r || 26 }, B.scene, B.season, { frame: L.frame || 22, shine, alive, t: this.time, flip: !!B.flip }); } catch (e) { /* skip */ }
      g.restore();
      const pulse = 0.55 + 0.45 * Math.sin(this.time * TAU * 1.6);
      for (const s of w.slots || []) {
        if (s.filled || !s.thing) continue;
        g.save(); g.translate(s.x, s.y);
        try { P.drawShadow(g, s.thing, s.size, { glow: (s.glow || 0) * pulse }); } catch (e) { /* skip */ }
        g.restore();
      }
      for (const p of w.pieces || []) if (p.state === 'placed') this._piece(p, a, w);
      if (turn > 0.01) {   // the page darkens a little as it turns away
        const F = L.frame || 22;
        g.fillStyle = `rgba(60,40,30,${0.28 * turn})`;
        g.beginPath(); roundRect(g, B.x - F, B.y - F, B.w + 2 * F, B.h + 2 * F, (B.r || 26) + F * 0.8); g.fill();
      }
      g.restore();
    }
    _piece(p, a, w) {
      const P = PA(); if (!P || p.state === 'gone') return;
      const pop = ip(p, 'pop', a); if (!(pop > 0)) return;
      const g = this.g;
      const x = ip(p, 'x', a) + (ip(p, 'ax', a) || 0), y = ip(p, 'y', a) + (ip(p, 'ay', a) || 0);
      const rot = (ip(p, 'rot', a) || 0) + (ip(p, 'arot', a) || 0);
      const sx = (ip(p, 'sx', a) || 1) * pop, sy = (ip(p, 'sy', a) || 1) * pop;
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(sx, sy);
      try {
        P.drawPiece(g, p.thing, p.size, { glow: p.glow || 0, lift: clamp(ip(p, 'lift', a) || 0, 0, 1), dim: p.dim || 0,
          count: p.count == null ? -1 : p.count, alive: p.alive || 0, season: w.board ? w.board.season : this._season, t: this.time });
      } catch (e) { /* skip */ }
      g.restore();
    }
    _pomFrame(mood, blink) {
      let nm = 'pom_' + (mood || 'idle');
      if (blink && (mood === 'idle' || !mood || mood === 'talk')) nm = 'pom_blink';
      if (this._speaking && (mood === 'idle' || mood === 'talk' || !mood) && Math.sin(this.time * 17) > -0.2) nm = 'pom_talk';
      return PZ.Assets.has(nm) ? nm : 'pom_idle';
    }
    /** Pom at feet (x, y), visible height h */
    _pom(b, box, opt = {}) {
      if (!box) return;
      b = b || {};
      const nm = opt.frame || this._pomFrame(b.mood, b.blink);
      const hop = clamp(b.hop || 0, 0, 1);
      const k = box.h / POM.body, bob = Math.sin(this.time * 2.1) * 2.5 - hop * 20, lean = clamp(b.look || 0, -1, 1) * 0.03;
      const st = 1 + hop * 0.05;
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.fillStyle = `rgba(60,50,40,${0.2 - hop * 0.08})`; g.beginPath(); g.ellipse(4 * k, -2, box.h * 0.36 * (1 - hop * 0.2), box.h * 0.05, 0, 0, TAU); g.fill();
      g.rotate(lean);
      g.translate(0, bob); g.scale(1 / Math.sqrt(st), st);
      if (opt.flip) g.scale(-1, 1);
      this._img(nm, -POM.ax * k, -POM.ay * k, POM.w * k, POM.h * k);
      g.restore();
    }
    _pigeon(p, a) {
      if (!p) return;
      const g = this.g, x = ip(p, 'x', a), y = ip(p, 'y', a), size = p.size || 120, k = size / PIGEON.w;
      if (!(x > -size && x < this.W + size)) return;
      const nm = (p.flap || 0) >= 0.5 && PZ.Assets.has('pigeon_flap') ? 'pigeon_flap' : 'pigeon';
      const walk = p.state === 'walk' ? Math.sin((p.step || 0) * TAU) : 0;
      g.save();
      if (p.state === 'walk' || p.state === 'flap') g.fillStyle = 'rgba(60,50,40,0.16)', g.beginPath(), g.ellipse(x, y + (p.hop || 0) + 2, size * 0.3 * (1 - Math.min(0.5, (p.hop || 0) / 120)), size * 0.05, 0, 0, TAU), g.fill();   // its contact shadow on the ledge (none in the air)
      g.translate(x, y - Math.abs(walk) * 3);
      if ((p.dir || 1) < 0) g.scale(-1, 1);
      g.rotate(walk * 0.07 + (p.peck || 0) * 0.22);
      this._img(nm, -PIGEON.ax * k, -PIGEON.ay * k, PIGEON.w * k, PIGEON.h * k);
      g.restore();
    }
    _bubble(b, a) {
      const P = PA(); if (!P) return;
      const g = this.g, x = ip(b, 'x', a), y = ip(b, 'y', a);
      g.save(); g.translate(x, y);
      try { P.drawBubble(g, b.r, { pop: b.pop || 0, t: this.time + (b.r || 0) }); } catch (e) { /* skip */ }
      g.restore();
    }
    _hintHand(H, w) {
      const P = PA(); if (!H || !P) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      g.save(); g.globalAlpha *= al; g.translate(H.x, H.y);
      try { P.drawGhostHand(g, Math.max(110, (this._L && this._L.item) || 112), H.press != null ? H.press : 0); } catch (e) { /* skip */ }
      g.restore();
    }

    /* ---------- a small board with pieces (title + gallery): origin = the board's top-left, size bw × bh ---------- */
    _miniBoard(pic, bw, bh, opt = {}) {
      const P = PA(); if (!P) return;
      const g = this.g, W0 = 440, k = bw / W0, H0 = bh / k;
      g.save(); g.scale(k, k);
      try { P.drawBoard(g, { w: W0, h: H0, r: 22 }, pic.scene || 'street', pic.season || 0, { frame: 20, alive: opt.alive || 0, shine: opt.shine || 0, t: this.time, flip: !!pic.flip }); } catch (e) { /* skip */ }
      const m = Math.min(W0, H0);
      for (const s of opt.shadows || []) {
        g.save(); g.translate(s.u * W0, s.v * H0);
        try { P.drawShadow(g, s.thing, (s.rs || 0.36) * m, { glow: s.glow || 0 }); } catch (e) { /* skip */ }
        g.restore();
      }
      (pic.pieces || []).forEach((q, i) => {
        if (!q || !q.thing) return;
        const hop = opt.alive ? Math.max(0, Math.sin(this.time * 4.2 - i * 0.9)) * 8 : 0;
        g.save(); g.translate(q.u * W0, q.v * H0 - hop);
        try { P.drawPiece(g, q.thing, (q.rs || 0.36) * m, { alive: opt.alive || 0, season: pic.season || 0, t: this.time + i }); } catch (e) { /* skip */ }
        g.restore();
      });
      g.restore();
    }

    /* ---------- title: Pom waving with a big puzzle piece beside a small board (2 shadows, 1 piece in, 1 hovering) ---------- */
    _titleScene(w, o) {
      const W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY;
      const blink = Math.sin(this.time * 1.3) > 0.985;
      const pic = { scene: 'street', season: this._season, pieces: [{ thing: { kind: 'obj', obj: 'car', color: 'red' }, u: 0.28, v: 0.62, rs: 0.42 }] };
      const shadows = [{ thing: { kind: 'obj', obj: 'balloon', color: 'yellow' }, u: 0.74, v: 0.4, rs: 0.42, glow: 0.5 + 0.5 * Math.sin(this.time * 4) }];
      let nh, px, bw, bx, by;
      if (portrait) {
        nh = Math.min(300, H * 0.21); px = (ins.left || 0) + 34 + nh * 0.42;
        bw = Math.min(330, W - (ins.right || 0) - (px + nh * 0.5) - 40); bx = W - (ins.right || 0) - 36 - bw; by = gy - 34 - bw * 0.68;
      } else {
        nh = Math.min(330, H * 0.46); px = (ins.left || 0) + 34 + nh * 0.44;
        bw = clamp(W * 0.25, 230, 340); bx = W - (ins.right || 0) - 44 - bw; by = gy - 40 - bw * 0.68;
      }
      const bh = bw * 0.68;
      this._pom({ blink }, { x: px, y: gy - 4, h: nh }, { frame: 'pom_full_wave' });
      this.g.save(); this.g.translate(bx, by + Math.sin(this.time * 1.4) * 3); this.g.rotate(-0.03);
      this._miniBoard(pic, bw, bh, { shadows, alive: 0.6 });
      this.g.restore();
      // a piece floating towards its shadow, bobbing
      const P = PA();
      if (P) {
        const u = (Math.sin(this.time * 1.1) + 1) / 2, s = bw / 440 * 0.42 * Math.min(440, bh / (bw / 440));
        const hx = bx + bw * 0.74 + 30 - u * 30, hy = by + bh * 0.4 - 46 - u * 14;
        this.g.save(); this.g.translate(hx, hy); this.g.rotate(0.12 * Math.sin(this.time * 1.7)); this.g.scale(1.1, 1.1);
        try { P.drawPiece(this.g, { kind: 'obj', obj: 'balloon', color: 'yellow' }, s, { lift: 1, glow: 0.3 }); } catch (e) { /* skip */ }
        this.g.restore();
      }
      this._sparkT = (this._sparkT || 0) - (o.dt || 0);
      if (this._sparkT <= 0) { this._sparkT = 1.1; this.burst('sparkles', bx + bw * (0.2 + Math.random() * 0.6), by + bh * 0.3, { n: 4 }); }
    }
    /* ---------- session done: the session's finished pictures pop in one by one and come alive; Pom cheers ---------- */
    _doneScene(w, o) {
      const W = this.W, H = this.H, t = this.time, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY;
      this._galleryT += o.dt || 0;
      const panel = o.boxes && o.boxes.done;
      const pics = this.gallery.length ? this.gallery : [{ scene: 'street', season: 0, pieces: [{ thing: { kind: 'obj', obj: 'car', color: 'red' }, u: 0.3, v: 0.6, rs: 0.4 }] }];
      const n = pics.length, AR = 0.66, gap = 14;
      // the grid (cols × rows) that gives the biggest cards in a free area
      const fit = (x0, x1, y0, y1) => {
        let best = { s: 0, c: 1, r: 1, x0, x1, y0, y1 };
        for (let c = 1; c <= n; c++) {
          const r = Math.ceil(n / c), cw = (x1 - x0 - gap * (c - 1)) / c, ch = (y1 - y0 - gap * (r - 1)) / r;
          const s = Math.min(cw, ch / AR);
          if (s > best.s) best = { s, c, r, x0, x1, y0, y1 };
        }
        return best;
      };
      let best;
      if (portrait) {   // above Pom across the full width, or down to the ground right of Pom — whichever gives bigger cards
        const xa = (ins.left || 0) + 20, xb = W - (ins.right || 0) - 20, ya = panel ? panel.y + panel.h + 20 : H * 0.4, PB = L.pomBox;
        const A = fit(xa, xb, ya, (PB ? PB.y : gy - 220) - 10), Bf = PB ? fit(PB.x + PB.w + 12, xb, ya, gy - 24) : A;
        best = Bf.s > A.s ? Bf : A;
      } else best = fit((ins.left || 0) + 250, (panel ? panel.x : W * 0.6) - 20, (ins.top || 0) + 24, gy - 24);
      const { x0, x1, y0, y1 } = best;
      const cw = Math.min(best.s, 300), ch = cw * AR;
      const tw = best.c * cw + (best.c - 1) * gap, th = best.r * ch + (best.r - 1) * gap;
      const ox = x0 + (x1 - x0 - tw) / 2, oy = y0 + (y1 - y0 - th) / 2;
      this._pom({ blink: false, hop: Math.max(0, Math.sin(t * 5)) * 0.6 }, L.pom, { frame: Math.sin(t * 3) > 0 ? 'pom_cheer' : 'pom_happy' });
      const g = this.g;
      pics.forEach((pic, i) => {
        const T = this._galleryT - 0.4 - i * 0.28; if (T <= 0) return;
        const s = easeOutBack(clamp(T / 0.45, 0, 1)), c = i % best.c, r = Math.floor(i / best.c);
        const cx = ox + c * (cw + gap) + cw / 2, cy = oy + r * (ch + gap) + ch / 2 + Math.sin(t * 1.6 + i * 0.8) * 4;
        g.save(); g.translate(cx, cy); g.rotate(Math.sin(t * 1.1 + i) * 0.025 + (i % 2 ? 0.02 : -0.02)); g.scale(s, s); g.translate(-cw / 2, -ch / 2);
        this._miniBoard(pic, cw, ch, { alive: clamp(T - 0.3, 0, 1) });
        g.restore();
        if (T > 0 && T - (o.dt || 0) <= 0.05) this.burst('sparkles', cx, cy, { n: 6 });
      });
      this._noteT = (this._noteT || 0) - (o.dt || 0);
      if (this._noteT <= 0) { this._noteT = 0.6; this.burst('sparkles', x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), { n: 6 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((PZ.CONFIG && PZ.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * (H > W ? 0.4 : 0.42);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(70,45,25,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#C98D52'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#8E5A2C'; g.stroke();
      g.fillStyle = '#FFF9EE'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#E6B47E'; g.stroke();
      const I = PZ.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7D6A4A', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#8E5A2C', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7D6A4A', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#8E5A2C', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && PZ.PALETTE && PZ.PALETTE[c]) ? PZ.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(110 * q);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {   // a big numeral floats up over the counted balloons / dots
        fx.push({ k: 'num', x, y, t: 0, life: 0.9, text: String(opt.n || '') });
      } else if (type === 'puff') {    // the poof of a leftover piece / a toot cloud
        const n = Math.round((opt.n || 7) * q);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + R() * 0.4, sp = 60 + R() * 70;
          fx.push({ k: 'p', sprite: 'dust', tint: opt.color || '#FFFFFF', x, y, vx: Math.cos(a) * sp + (opt.vx || 0), vy: Math.sin(a) * sp - 30, g: -20, drag: 2, t: 0, life: 0.6 + R() * 0.3, size: 26 + R() * 18, rot: R() * TAU, vr: 1 });
        }
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
          if (f.drag) { f.vx *= 1 - Math.min(0.9, f.drag * dt); f.vy = Math.min(f.vy, 200); if (f.sway != null) { f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; } }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#8E5A2C', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = PZ.Assets.tinted ? PZ.Assets.tinted(name, color, size * this.rs) : PZ.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = (p.sprite || p.type) === 'star' ? 'pstar' : (p.sprite || p.type);
        const tint = p.color && TINTABLE[nm] ? p.color : null;
        if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = PZ.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = PZ.Assets.sprite(name, Math.max(w, h) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.pomHit && w.pomHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h); }
      g.strokeStyle = 'rgba(255,140,0,.7)';
      for (const s of w.slots || []) { const z = w.slotZone && w.slotZone(s.id); if (z) g.strokeRect(z.x, z.y, z.w, z.h); }
      for (const p of w.pieces || []) {
        if (p.state !== 'rest') continue;
        const c = w.pieceHit && w.pieceHit(p.id); if (!c) continue;
        g.strokeStyle = 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke();
      }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with PuzzleArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !PA()) return;
    try { g.save(); g.translate(cw / 2, ch / 2); PA().drawIcon(g, thing, Math.min(ch, cw) * 0.94); g.restore(); } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  PZ.Renderer = Renderer;
})(window.PZ = window.PZ || {});
