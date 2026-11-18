/* GW.Render — draws Peekaboo Street: sky (sun, clouds, kites, rainbow), parallax city layers that scroll as Gigi walks,
 * traffic and the little bus, the apartment building whose windows are the memory cards (GW.WindowArt), Gigi the giraffe
 * calf with her springy neck (GW.GigiArt + SVG body/head), the pigeon and the balloon, weather particles and juice.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels. Positions interpolate with world.alpha. */
(function (GW) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const WA = () => GW.WindowArt;
  const GA = () => GW.GigiArt;
  const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
  const ROAD = { sunny: '#82858B', breezy: '#82858B', rain: '#737880', rainbow: '#7E8288' };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0'];
  const ip = (o, k, a) => { const p = o['_p' + k]; const v = o[k]; return p == null || v == null ? v : lerp(p, v, a); };

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

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._talkT = 0;
      this._wopt = {};
      this._spr = (n, x, y, s) => this._sprite(n, x, y, s);
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      GW.Assets.dropExact();
    }
    _k(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout, mood) {
      const rs = this.rs, k = this._k(layout), m = MOODS[clamp(mood | 0, 0, 3)];
      GW.Assets.exact('far_' + m, Math.round(1200 * k * rs), Math.round(420 * k * rs));
      GW.Assets.exact('mid_' + m, Math.round(1200 * k * rs), Math.round(360 * k * rs));
      GW.Assets.exact('ground_' + m, Math.round(1200 * k * rs), Math.round(260 * k * rs));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, W = this.W, H = this.H;
      this.lang = o.lang || 'en';
      this.time += o.dt || 0;
      const L = world.layout, a = world.alpha == null ? 1 : world.alpha;
      const amb = weather.ambient || {};
      const mood = o.title ? 0 : o.done ? 3 : clamp(world.level | 0, 0, 3);
      this._mood = mood; this._amb = amb;
      const scroll = o.title ? this.time * 6 : (ip(world, 'scroll', a) || 0);
      g.setTransform(rs, 0, 0, rs, 0, 0); g.globalAlpha = 1;
      this._sky(world, weather, amb, L);
      this._street(L, mood, scroll);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a, weather);
      this._particles(weather.particles, 'front');
      this._fx(o.dt || 0);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug) this._debug(world);
    }
    _sky(world, weather, amb, L) {
      const g = this.g, W = this.W, H = this.H, gy = L.groundY, k = this._k(L);
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, amb.skyTop || '#8CCBEF'); sky.addColorStop(1, amb.skyBottom || '#E4F3FA');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (amb.horizon) {
        const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
        hz.addColorStop(0, amb.horizon + '00'); hz.addColorStop(0.6, amb.horizon + '88'); hz.addColorStop(1, amb.horizon + 'CC');
        g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, gy);
      }
      const top = (L.ins ? L.ins.top : 0);
      if ((amb.sun || 0) > 0.01) {
        const sy = Math.max(top + 70, Math.min(H * (amb.sunY == null ? 0.14 : amb.sunY), gy - 420 * k));
        this._sprite('sun', W * (amb.sunX == null ? 0.7 : amb.sunX), sy, 170, 0, amb.sun);
      }
      if ((amb.rainbow || 0) > 0.01) {
        const rw = Math.min(1.1 * W, 1300 * k), rh = rw / 2, midY = gy - 26 - 360 * k;
        const spr = GW.Assets.sprite('rainbow', rw * this.rs);
        if (spr) { g.save(); g.globalAlpha = amb.rainbow * 0.9; g.drawImage(spr, W * 0.55 - rw / 2, midY + 250 * k - rh, rw, rh); g.restore(); }
      }
      for (const c of weather.clouds || []) this._sprite(c.sprite, c.x, c.y, 300 * (c.scale || 1), 0, c.alpha == null ? 1 : c.alpha);
      for (const kt of weather.kites || []) this._kite(kt);
      this._particles(weather.particles, 'sky');
    }
    _kite(kt) {
      if (!(kt.alpha > 0.01)) return;
      const g = this.g, s = kt.size || 64;
      g.save(); g.globalAlpha *= kt.alpha;
      g.strokeStyle = 'rgba(90,80,70,.55)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(kt.ax, kt.ay);
      g.quadraticCurveTo((kt.ax + kt.x) / 2 + 40 * (kt.side || 1), (kt.ay + kt.y) / 2 + 30, kt.x, kt.y); g.stroke();
      g.translate(kt.x, kt.y); g.rotate(kt.rot || 0);
      const spr = GW.Assets.sprite('kite', s * 1.33 * this.rs);
      if (spr) { const h = s * 1.33, w = h * 96 / 128; g.drawImage(spr, -w / 2, -h * 50 / 128, w, h); }
      g.restore();
    }
    _layer(name, w, h, y, off) {
      const rs = this.rs, tw = Math.round(w * rs), th = Math.round(h * rs);
      const tile = GW.Assets.exact(name, tw, th);
      if (!tile) return;
      const g = this.g;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      let x = -Math.round((((off % w) + w) % w) * rs);
      const yy = Math.round(y * rs);
      for (; x < this.canvas.width; x += tw) g.drawImage(tile, x, yy);
      g.restore();
    }
    _street(L, mood, scroll) {
      const g = this.g, gy = L.groundY, k = this._k(L), m = MOODS[mood];
      this._layer('far_' + m, 1200 * k, 420 * k, gy - 26 - 100 * k - 420 * k, scroll * 0.15);
      this._layer('mid_' + m, 1200 * k, 360 * k, gy - 26 - 360 * k, scroll * 0.4);
      this._layer('ground_' + m, 1200 * k, 260 * k, gy - 30 - 40 * k, scroll);
      const fillY = gy - 30 + 220 * k;
      if (fillY < this.H) { g.fillStyle = ROAD[m]; g.fillRect(0, fillY - 1, this.W, this.H - fillY + 1); }
    }

    /* ---------- the round ---------- */
    _game(w, o, a, weather) {
      const L = w.layout;
      // traffic + the bus on the road (behind the building's pavement edge? no: the road is in front of the facade's foot)
      const traffic = (w.traffic || []).slice().sort((p, q) => (p.lane || 0) - (q.lane || 0));
      // buildings
      const sT = w.phase === 'scroll' ? clamp(ip(w, 'scrollT', a), 0, 1) : 1;
      if (w.prevBuilding && w.phase === 'scroll') this._building(w.prevBuilding, -sT * this.W, true, a, w);
      if (L.grid && L.grid.building && w.building) {
        this._building({ building: w.building, rect: L.grid.building, grid: L.grid, cards: w.cards }, (1 - sT) * this.W, false, a, w);
      } else if (w.lastBuilding) this._building(w.lastBuilding, 0, true, a, w);
      for (const c of traffic) this._car(c, a);
      if (w.critter && w.critter.type === 'bus') this._bus(w.critter, a);
      this._particles(weather.particles, 'back');
      this._gigi(w, o, a);
      if (w.critter && w.critter.type === 'pigeon') this._pigeon(w.critter, a);
      if (w.critter && w.critter.type === 'balloon') this._balloon(w.critter, a);
    }
    _building(B, dx, frozen, a, w) {
      const art = WA(); if (!art || !B || !B.rect) return;
      const g = this.g, R = B.rect;
      const r = { x: R.x + dx, y: R.y, w: R.w, h: R.h, roofH: R.roofH };
      if (r.x > this.W + 40 || r.x + r.w < -40) return;
      const door = R.door;
      const opt = door ? { doorX: door.x + dx, doorW: door.w, doorH: door.h } : { doorX: r.x - 4000 };
      opt.light = frozen ? 0.5 : (w.cheer || 0);
      // soft contact shadow on the pavement
      g.fillStyle = 'rgba(60,55,50,.14)'; g.fillRect(r.x - 6, r.y + r.h - 3, r.w + 12, 8);
      art.drawBuilding(g, r, B.building, opt);
      const cheer = frozen ? 1 : (w.cheer || 0);
      if (cheer > 0.01 && art.drawBunting) {
        g.save(); g.globalAlpha = clamp(cheer * 1.5, 0, 1);
        art.drawBunting(g, r.x + 6, r.y + 4, r.x + r.w - 6, r.y + 4, this.time);
        g.restore();
      }
      const rain = (this._amb && this._amb.rain) || 0;
      for (const c of B.cards || []) this._window(c, B.building, dx, frozen, a, rain, cheer);
    }
    _window(c, building, dx, frozen, a, rain, cheer) {
      const g = this.g, art = WA();
      const x = (frozen ? c.x : ip(c, 'x', a)) + dx, y = frozen ? c.y : ip(c, 'y', a);
      if (x + c.w < -20 || x - c.w > this.W + 20) return;
      const open = frozen ? (c.state === 'matched' ? 1 : (c.open || 0)) : (ip(c, 'open', a) || 0);
      const O = this._wopt;
      O.shutter = building.shutter; O.trim = building.trim;
      O.light = clamp((c.light || 0) + (c.state === 'matched' ? cheer * 0.3 : 0), 0, 1);
      O.glow = c.glow || 0; O.glowColor = undefined;
      O.bloom = frozen ? (c.bloom || 0) : (ip(c, 'bloom', a) || 0);
      O.bloomColor = (c.face && c.face.color) || 'mixed';
      O.bounce = frozen ? 0 : (ip(c, 'bounce', a) || 0);
      O.wiggle = c.wiggle || 0; O.rain = rain; O.t = this.time; O.seed = c.seed || 0;
      O.sprite = this._spr; O.alpha = c.alpha == null ? 1 : c.alpha;
      g.save(); g.translate(x, y);
      art.drawWindow(g, c.w, c.h, c.face, open, O);
      g.restore();
    }
    _car(c, a) {
      const x = ip(c, 'x', a), y = c.y, w = c.w || 150, h = c.h || 75;
      const spr = GW.Assets.sprite(c.kind || 'car_a', w * this.rs);
      if (!spr) return;
      const g = this.g;
      g.save(); g.translate(x, y); if ((c.face || 1) < 0) g.scale(-1, 1);
      g.fillStyle = 'rgba(30,30,35,.18)'; g.beginPath(); g.ellipse(0, -2, w * 0.42, 5, 0, 0, TAU); g.fill();
      g.drawImage(spr, -w / 2, -h * 114 / 120, w, h);
      g.restore();
    }
    _bus(b, a) {
      const x = ip(b, 'x', a), y = ip(b, 'y', a), w = b.w || 220, h = b.h || 92;
      const spr = GW.Assets.sprite('bus', w * this.rs);
      if (!spr) return;
      const g = this.g;
      g.save(); g.translate(x, y); g.rotate(b.rot || 0); g.scale((b.sx || 1) * ((b.face || 1) < 0 ? -1 : 1), b.sy || 1);
      g.fillStyle = 'rgba(30,30,35,.2)'; g.beginPath(); g.ellipse(0, -2, w * 0.44, 6, 0, 0, TAU); g.fill();
      const top = -h * 197 / 200;
      g.drawImage(spr, -w / 2, top, w, h);
      // passengers in the three windows: little round heads that wave (sticker friends)
      const pass = ['animal_cat', 'animal_rabbit', 'animal_duck'];
      const wv = b.wave || 0;
      for (let i = 0; i < 3; i++) {
        const wx = -w / 2 + w * (102 + i * 112) / 480, wy = top + h * 92 / 200;
        const bob = Math.sin(this.time * 6 + i * 1.7) * 3 * wv;
        g.save(); g.beginPath(); g.rect(wx - w * 50 / 480, top + h * 56 / 200, w * 100 / 480, h * 58 / 200); g.clip();
        this._sprite(pass[i], wx, wy - bob, h * 0.5);
        g.restore();
      }
      if ((b.honk || 0) > 0.05) {   // beep lines in front of the bus
        g.strokeStyle = `rgba(255,255,255,${0.9 * b.honk})`; g.lineWidth = 4; g.lineCap = 'round';
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(w * 0.52, top + h * 0.45 + i * 14); g.lineTo(w * 0.52 + 22 * b.honk, top + h * 0.45 + i * 22); g.stroke(); }
      }
      g.restore();
    }
    _pigeon(p, a) {
      const x = ip(p, 'x', a), y = ip(p, 'y', a), s = 64;
      const spr = GW.Assets.sprite((p.state === 'fly' || p.state === 'away' || (p.flap || 0) > 0.5) && (p.flap || 0) > 0.5 ? 'pigeon_flap' : 'pigeon', s * this.rs);
      if (!spr) return;
      const g = this.g;
      g.save(); g.translate(x, y); g.rotate((p.rot || 0) + (p.peck || 0) * 0.25 * ((p.face || 1) < 0 ? -1 : 1));
      g.scale((p.sx || 1) * ((p.face || 1) < 0 ? -1 : 1), p.sy || 1);
      g.drawImage(spr, -s / 2, -s * 120 / 128, s, s);
      g.restore();
    }
    _balloon(b, a) {
      const art = WA(); if (!art) return;
      const x = ip(b, 'x', a), y = ip(b, 'y', a);
      const g = this.g;
      g.save(); g.globalAlpha *= b.alpha == null ? 1 : b.alpha; g.translate(x, y); g.rotate(b.rot || 0);
      art.drawBalloon(g, b.color || 'red', 70, this.time);
      g.restore();
    }

    _gigi(w, o, a) {
      const L = w.layout, G = w.gigi || {}, LG = L.gigi;
      if (!LG) return;
      const h = LG.h;
      const hop = ip(G, 'hop', a) || 0;
      const hx = ip(G, 'hx', a) != null ? ip(G, 'hx', a) : (G._phx == null ? G.headX : lerp(G._phx, G.headX, a));
      const hy = G._phy == null ? G.headY : lerp(G._phy, G.headY, a);
      this._drawGigi(LG.x, LG.y, h, hop, G.neckBaseX, G.neckBaseY, hx, hy, this._gigiBody(G, hop), this._gigiHead(G, o), 1);
    }
    _gigiBody(G, hop) {
      if (G.walking) return (G.walk || 0) % 1 < 0.5 ? 'gigi_body_walk_a' : 'gigi_body_walk_b';
      if (hop > 6) return 'gigi_body_hop';
      return 'gigi_body_stand';
    }
    _gigiHead(G, o) {
      const m = (G.moodT || 0) > 0 ? G.mood : 'idle';
      if (m === 'happy' || m === 'cheer' || m === 'think' || m === 'oops') return 'gigi_head_' + m;
      if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) return 'gigi_head_talk';
      if ((G.blink || 0) > 0.5) return 'gigi_head_blink';
      return 'gigi_head_idle';
    }
    _drawGigi(fx, fy, h, hop, bx, by, hx, hy, bodyFrame, headFrame, scaleX) {
      const g = this.g, ga = GA();
      // shadow on the pavement, smaller while she hops
      const shk = 1 / (1 + hop / 60);
      g.fillStyle = `rgba(50,45,40,${0.22 * shk})`;
      g.beginPath(); g.ellipse(fx, fy - 2, h * 0.36 * shk, h * 0.055 * shk, 0, 0, TAU); g.fill();
      const by0 = fy - hop;
      const body = GW.Assets.sprite(bodyFrame, h * this.rs) || GW.Assets.sprite('gigi_body_stand', h * this.rs);
      if (bx == null) { bx = fx + (172 - 128) / 256 * h; by = by0 + (96 - 244) / 256 * h; }
      if (hx == null) { hx = bx + 0.12 * h; hy = by - 0.6 * h; }
      if (body) g.drawImage(body, fx - h * 128 / 256, by0 - h * 244 / 256, h, h);
      if (ga && ga.drawNeck) ga.drawNeck(g, bx, by, hx, hy, ga.thickFor ? ga.thickFor(h) : 0.22 * h);
      const hs = 0.62 * h / 192;
      const head = GW.Assets.sprite(headFrame, 192 * hs * this.rs) || GW.Assets.sprite('gigi_head_idle', 192 * hs * this.rs);
      if (head) {
        g.save(); g.translate(hx, hy); g.rotate(ga && ga.headAngle ? ga.headAngle(bx, by, hx, hy) : 0);
        g.drawImage(head, -70 * hs, -160 * hs, 192 * hs, 192 * hs);
        g.restore();
      }
      void scaleX;
    }

    /* ---------- title & celebration ---------- */
    _miniBuilding(cx, groundY, cw, faces, opens, lights, building) {
      const art = WA(); if (!art) return;
      const ch = cw / 0.78, gap = Math.max(16, cw * 0.18), pad = Math.max(20, cw * 0.24);
      const n = faces.length, rowW = n * cw + (n - 1) * gap;
      const winY = groundY - ch * 1.25;
      const r = { x: cx - rowW / 2 - pad, y: winY - ch / 2 - pad, w: rowW + 2 * pad, h: groundY + 4 - (winY - ch / 2 - pad), roofH: cw * 0.32 };
      art.drawBuilding(this.g, r, building, { doorX: r.x - 4000, light: 0.3 });
      for (let i = 0; i < n; i++) {
        const O = { shutter: building.shutter, trim: building.trim, light: lights[i] || 0, bloom: lights[i] ? 1 : 0, bloomColor: 'mixed', sprite: this._spr, t: this.time };
        this.g.save(); this.g.translate(cx - rowW / 2 + cw / 2 + i * (cw + gap), winY);
        art.drawWindow(this.g, cw, ch, faces[i], opens[i], O);
        this.g.restore();
      }
      return r;
    }
    _titleScene(w, o) {
      const L = w.layout, W = this.W, H = this.H, portrait = H > W;
      // a little building whose windows open and close on their own
      const cw = portrait ? 96 : 84;
      const cx = portrait ? W * 0.62 : W - L.ins.right - Math.max(190, W * 0.17);
      const faces = [{ kind: 'color', value: 'red', color: 'red', obj: 'umbrella' }, { kind: 'animal', value: 'dog', sprite: 'animal_dog' }, { kind: 'shape', value: 'star', shape: 'star', color: 'blue' }];
      const opens = [0, 1, 2].map(i => {
        const ph = (this.time * 0.4 + i / 3) % 1;
        if (ph < 0.12) return easeOutBack(ph / 0.12) ;
        if (ph < 0.55) return 1;
        if (ph < 0.65) return 1 - (ph - 0.55) / 0.1;
        return 0;
      });
      this._miniBuilding(cx, L.groundY, cw, faces, opens, [0, 0, 0], { facade: 'cream', trim: '#FBF7EE', shutter: 'teal', roof: 'gable', seed: 3 });
      // Gigi waving
      const hgt = portrait ? Math.min(420, H * 0.3) : Math.min(380, H * 0.55);
      const gx = portrait ? W * 0.2 : L.ins.left + W * 0.13;
      const cyc = this.time % 2.6, hop = cyc < 0.45 ? Math.sin(cyc / 0.45 * Math.PI) * 16 : 0;
      g_shadow(this.g, gx, L.groundY + 20, hgt * 0.22);
      this._sprite2('gigi_title', gx, L.groundY + 22 - hop, hgt, 320 / 480);
    }
    _sprite2(name, cx, bottom, h, aspect) {   // bottom-anchored sprite with a known aspect (w/h)
      const spr = GW.Assets.sprite(name, h * this.rs);
      if (!spr) return;
      const w = h * aspect;
      this.g.drawImage(spr, cx - w / 2, bottom - h, w, h);
    }
    _doneScene(w, o) {   // the street party at rainbow time: a building full of lit windows with what the child found
      const L = w.layout, W = this.W, H = this.H, t = this.time, portrait = H > W;
      const col = (w.collected || []).slice(-6);
      const faces = col.length ? col.map(p => p.faceA) : [{ kind: 'color', value: 'red', color: 'red', obj: 'balloon' }, { kind: 'animal', value: 'cat', sprite: 'animal_cat' }, { kind: 'shape', value: 'heart', shape: 'heart', color: 'purple' }];
      const per = portrait ? 3 : Math.min(6, faces.length);
      const row = faces.slice(0, per);
      const cw = Math.min(portrait ? 150 : 120, (W - L.ins.left - L.ins.right - 120) / (row.length * 1.25));
      const cx = o && o.compact ? W * 0.6 : W / 2;
      const bump = row.map((_, i) => Math.max(0, Math.sin(t * 3 + i * 0.9)) * 6);
      this._miniBuilding(cx, L.groundY, cw, row.map((f, i) => Object.assign({}, f)), row.map(() => 1), row.map(() => 1), { facade: 'skygrey', trim: '#FBF7EE', shutter: 'terracotta', roof: 'arch', seed: 9 });
      void bump;
      const hgt = Math.min(H * (o && o.compact ? 0.5 : 0.3), 400);
      const cyc = t % 1.1, hop = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) * 30 : 0;
      const gx = o && o.compact ? L.ins.left + W * 0.14 : L.ins.left + 110;
      g_shadow(this.g, gx, L.groundY + 20, hgt * 0.22);
      this._sprite2('gigi_title', gx, L.groundY + 22 - hop, hgt, 320 / 480);
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((GW.CONFIG && GW.CONFIG.introTime) || 1.8) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp((L.board ? L.board.y + L.board.h * 0.45 : this.H * 0.45), L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,60,110,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFCF4'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#E8CFA2'; g.stroke();
      const I = GW.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7a6a5a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#3E8C84', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7a6a5a', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#3E8C84', '#ffffff', 160);
      }
      g.restore();
    }

    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random;
      if (type === 'pop') {   // a found window: warm flash + a few sparkles + confetti in the item's colour
        const C = WA() && WA().COLORS && WA().COLORS[opt.color];
        const col = C ? C.base : CONF[(R() * CONF.length) | 0], size = opt.size || 110;
        fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size });
        const n = Math.round(12 * this.quality);
        for (let i = 0; i < n; i++) {
          const an = R() * TAU, sp = 160 + R() * 260;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: col, x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 120,
            g: 520, drag: 1.4, t: 0, life: 0.8 + R() * 0.4, size: 18 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 5; i++) {
          const an = R() * TAU, sp = 80 + R() * 120;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 0, t: 0, life: 0.5 + R() * 0.2, size: 20 + R() * 12, rot: R() * TAU, vr: 4 });
        }
      } else if (type === 'bloom') {   // flowers pop out of the box
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'paper', tint: CONF[(R() * CONF.length) | 0], x: x + (R() - 0.5) * 60, y, vx: (R() - 0.5) * 120, vy: -120 - R() * 120, g: 500, t: 0, life: 0.7, size: 12 + R() * 6, rot: R() * TAU, vr: 8 });
      } else if (type === 'roof') {    // the building cheers: confetti from the roof
        const n = Math.round(50 * this.quality);
        for (let i = 0; i < n; i++) {
          const an = -Math.PI / 2 + (R() - 0.5) * 2.2, sp = 260 + R() * 360;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: x + (R() - 0.5) * (opt.w || 200), y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp,
            g: 420, drag: 1.2, t: 0, life: 1.6 + R() * 0.8, size: 20 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 12, sway: R() * TAU });
        }
      } else if (type === 'land') {
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y - 6, vx: (R() - 0.5) * 90, vy: -20 - R() * 30, g: 40, t: 0, life: 0.45, size: 20 + R() * 10, rot: R() * TAU, vr: 0, grow: 1.5, a0: 0.6 });
      } else if (type === 'sparkle') {
        for (let i = 0; i < 10; i++) { const an = R() * TAU, sp = 60 + R() * 160; fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 60, g: 60, t: 0, life: 0.8, size: 18 + R() * 12, rot: 0, vr: 4 }); }
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(120 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.75;
        for (let i = 0; i < 7; i++) { const an = i / 7 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(an) * r0, y: y + Math.sin(an) * r0, vx: Math.cos(an) * 30, vy: Math.sin(an) * 30 - 20, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
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
          if (f.drag) { f.vx *= 1 - f.drag * dt; f.vy = Math.min(f.vy, 160); f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const s = f.size * (f.grow ? 1 + (f.grow - 1) * u : 1);
          const al = (f.a0 || 1) * (u > 0.7 ? (1 - u) / 0.3 : 1);
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, s, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, s, f.rot, al);
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,246,210,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = GW.Assets.tinted ? GW.Assets.tinted(name, color, size * this.rs) : GW.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) if ((p.layer || 'back') === layer && p.alpha > 0.01) {
        if (p.sprite === 'dot') { this.g.fillStyle = `rgba(255,255,255,${p.alpha})`; this.g.beginPath(); this.g.arc(p.x, p.y, p.size / 2, 0, TAU); this.g.fill(); continue; }
        this._sprite(p.sprite === 'star' ? 'pstar' : p.sprite, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX === -1);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = GW.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
      if (!spr) return;
      const k = size / Math.max(spr.width, spr.height);
      const w = spr.width * k, h = spr.height * k;
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      if (rot || flipX) {
        g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
      } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
      if (alpha != null && alpha < 1) g.globalAlpha /= alpha;
    }
    _debug(w) {
      const g = this.g, L = w.layout;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const B = L.board; if (B) g.strokeRect(B.x, B.y, B.w, B.h);
      for (const c of w.cards || []) g.strokeRect(c.x - c.w / 2 - 10, c.y - c.h / 2 - 10, c.w + 20, c.h + 20);
      if (GW.World.gigiHead) { const hb = GW.World.gigiHead(w); if (hb) g.strokeRect(hb.x, hb.y, hb.w, hb.h); }
      const r = L.gigiRect; if (r) g.strokeRect(r.x, r.y, r.w, r.h);
    }
    /* A window face for Talk-time previews and choices. */
    drawItemBody(g, it, s) {
      const art = WA(); if (!art) return;
      const face = it.face || it;
      const cw = s * 0.62, ch = cw / 0.78;
      art.drawFace(g, cw, ch, face, { sprite: (n, sx, sy, sz) => this._sprite(n, sx, sy, sz, 0, 1, g === this.g ? null : g) });
    }
  }
  function g_shadow(g, x, y, r) { g.fillStyle = 'rgba(50,45,40,.2)'; g.beginPath(); g.ellipse(x, y - 4, r, r * 0.16, 0, 0, TAU); g.fill(); }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = GW.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.98, cw * 1.2));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  GW.Renderer = Renderer;
})(window.GW = window.GW || {});
