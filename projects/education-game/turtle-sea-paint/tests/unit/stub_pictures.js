/* TEST-ONLY stand-in for game/js/pictures.js (SP.Pictures, DESIGN §4.2) — used by tests/unit/load.js ONLY while the real
 * file does not exist. Same API, 2 crude templates per kind (ellipses / polygons). Never shipped. */
(function (SP) {
  'use strict';
  SP.SHAPES = SP.SHAPES || ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  SP.SEA_ANIMALS = SP.SEA_ANIMALS || ['fish', 'crab', 'octopus', 'starfish', 'jellyfish', 'seahorse', 'whale', 'dolphin'];
  SP.PART_NAMES = SP.PART_NAMES || ['body', 'tail', 'fin', 'hull', 'sail', 'flag', 'shell', 'claws', 'legs'];

  function ell(cx, cy, rx, ry) { return { type: 'ellipse', cx: cx, cy: cy, rx: rx, ry: ry }; }
  function ellD(h) { return 'M' + (h.cx - h.rx) + ' ' + h.cy + 'A' + h.rx + ' ' + h.ry + ' 0 1 0 ' + (h.cx + h.rx) + ' ' + h.cy + 'A' + h.rx + ' ' + h.ry + ' 0 1 0 ' + (h.cx - h.rx) + ' ' + h.cy + 'Z'; }
  function polyD(pts) { return 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L') + 'Z'; }
  function area(h) {
    if (h.type === 'ellipse') return Math.PI * h.rx * h.ry;
    var a = 0, p = h.pts; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2;
  }
  function centre(h) {
    if (h.type === 'ellipse') return [h.cx, h.cy];
    var x = 0, y = 0; h.pts.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / h.pts.length, y / h.pts.length];
  }
  function mk(id, hit, role, nameKind, nameValue, def, extra) {
    var c = centre(hit), p = { id: id, d: hit.type === 'ellipse' ? ellD(hit) : polyD(hit.pts), hit: hit, area: area(hit), cx: c[0], cy: c[1], role: role,
      nameKind: nameKind, nameValue: nameValue, def: def || '#9FD8D0' };
    if (extra) for (var k in extra) p[k] = extra[k];
    return p;
  }

  var T = {
    fish: { kind: 'parts', alive: 'swim', build: function () {
      return [mk('tail', { type: 'poly', pts: [[60, 110], [190, 200], [60, 290]] }, 'part', 'part', 'tail'),
        mk('body', ell(330, 200, 150, 105), 'part', 'part', 'body'),
        mk('fin', { type: 'poly', pts: [[290, 100], [380, 30], [400, 110]] }, 'part', 'part', 'fin')];
    } },
    boat: { kind: 'parts', alive: 'sail', build: function () {
      return [mk('hull', { type: 'poly', pts: [[80, 280], [520, 280], [450, 380], [150, 380]] }, 'part', 'part', 'hull'),
        mk('sail', { type: 'poly', pts: [[300, 60], [300, 260], [130, 260]] }, 'part', 'part', 'sail'),
        mk('flag', { type: 'poly', pts: [[320, 30], [440, 70], [320, 110]] }, 'part', 'part', 'flag'),
        mk('sail2', { type: 'poly', pts: [[330, 130], [330, 260], [460, 260]] }, 'part', 'part', 'sail')];
    } },
    sub: { kind: 'shapes', alive: 'swim', slots: [[150, 200], [270, 200], [390, 200], [500, 210]], build: function (o) {
      var sh = (o && o.shapes) || [], out = [mk('body', ell(300, 210, 290, 150), 'part', 'part', 'body')];
      for (var i = 0; i < Math.min(sh.length, this.slots.length); i++) out.push(mk('s' + i, ell(this.slots[i][0], this.slots[i][1], 50, 50), 'shape', 'shape', sh[i]));
      return out;
    } },
    castle: { kind: 'shapes', alive: 'bob', slots: [[160, 160], [300, 160], [440, 160], [230, 300], [370, 300]], build: function (o) {
      var sh = (o && o.shapes) || [], out = [mk('body', { type: 'poly', pts: [[40, 390], [40, 60], [560, 60], [560, 390]] }, 'part', 'part', 'castle')];
      for (var i = 0; i < Math.min(sh.length, this.slots.length); i++) out.push(mk('s' + i, ell(this.slots[i][0], this.slots[i][1], 52, 52), 'shape', 'shape', sh[i]));
      return out;
    } },
    whale: { kind: 'count', alive: 'swim', spotName: 'bubble', build: function (o) { return spots(o, mk('body', ell(300, 320, 260, 70), 'part', 'part', 'body'), 0); } },
    chest: { kind: 'count', alive: 'bob', spotName: 'pearl', build: function (o) { return spots(o, mk('chest', { type: 'poly', pts: [[60, 300], [540, 300], [540, 395], [60, 395]] }, 'part', 'part', 'chest'), 1); } },
    reef: { kind: 'scene', alive: 'float', slots: [[110, 200], [250, 220], [390, 200], [520, 230]], build: function (o) { return scene(this, o); } },
    lagoon: { kind: 'scene', alive: 'scuttle', slots: [[140, 220], [300, 200], [460, 220]], build: function (o) { return scene(this, o); } },
    bubbles: { kind: 'labels', alive: 'float', slots: [[100, 200], [210, 120], [320, 210], [430, 120], [530, 220]], build: function (o) { return labels(this, o); } },
    buoy: { kind: 'labels', alive: 'bob', slots: [[130, 150], [260, 120], [390, 150], [500, 140]], build: function (o) { return labels(this, o); } }
  };
  function spots(o, main, salt) {
    var n = Math.min(12, (o && o.n) || 3), out = [main], seed = ((o && o.seed) || 1) + salt, k = 0;
    for (var i = 0; i < n; i++) {
      var col = i % 6, row = Math.floor(i / 6);
      out.push(mk('p' + i, ell(70 + col * 92 + ((seed + row) % 3) * 4, 80 + row * 100, 32, 32), 'spot', 'spot', i + 1));
      k++;
    }
    return out;
  }
  function scene(t, o) {
    var an = (o && o.animals) || [], sz = (o && o.sizes) || null, out = [];
    for (var i = 0; i < Math.min(an.length, t.slots.length); i++) {
      var k = sz ? (sz[i] === 'big' ? 1.6 : 1) : 1.2, s = t.slots[sz ? (i ? 2 : 0) : i];
      out.push(mk('a' + i, ell(s[0], s[1], 52 * k, 40 * k), 'animal', 'animal', an[i], null, sz ? { size: sz[i] } : null));
    }
    return out;
  }
  function labels(t, o) {
    var lb = (o && o.labels) || [], kind = (o && o.kind) || 'letter', out = [];
    for (var i = 0; i < Math.min(lb.length, t.slots.length); i++)
      out.push(mk('b' + i, ell(t.slots[i][0], t.slots[i][1], 54, 54), 'label', kind, kind === 'number' ? +lb[i] : lb[i], null, { text: String(lb[i]) }));
    return out;
  }

  function inHit(h, x, y, pad) {
    if (h.type === 'ellipse') { var a = (x - h.cx) / (h.rx + pad), b = (y - h.cy) / (h.ry + pad); return a * a + b * b <= 1; }
    var p = h.pts, inside = false, i, j;
    for (i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
    if (inside || !pad) return inside;
    for (i = 0, j = p.length - 1; i < p.length; j = i++) {
      var dx = p[i][0] - p[j][0], dy = p[i][1] - p[j][1], L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - p[j][0]) * dx + (y - p[j][1]) * dy) / L));
      var qx = p[j][0] + u * dx - x, qy = p[j][1] + u * dy - y;
      if (qx * qx + qy * qy <= pad * pad) return true;
    }
    return false;
  }

  SP.Pictures = {
    TEMPLATES: T,
    list: function (kind) { return Object.keys(T).filter(function (k) { return T[k].kind === kind; }); },
    build: function (id, opt) {
      var t = T[id]; if (!t) throw new Error('no template ' + id);
      return { id: id, kind: t.kind, alive: t.alive, w: 600, h: 400, spotName: t.spotName, parts: t.build(opt || {}), deco: [], under: [] };
    },
    hit: function (pic, x, y, pad) {
      var best = null;
      for (var i = 0; i < pic.parts.length; i++) { var p = pic.parts[i]; if (inHit(p.hit, x, y, pad || 0) && (!best || p.area < best.area)) best = p; }
      return best ? best.id : null;
    },
    validate: function (pic) { return pic && pic.parts && pic.parts.length ? null : 'empty'; },
    STUB: true
  };
})(window.SP = window.SP || {});
