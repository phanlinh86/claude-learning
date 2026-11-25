// Mossy's Egg Grove — character & item art generator (DESIGN.md §3, §4).
// Usage: node tools/art-characters/gen.js [outDir]
// Writes 100 % original, hand-written SVGs into game/assets/default/. No dependencies.
// Style: 3 px outlines (viewBox scale) in a darker shade of the fill, round joins,
// one flat darker shade on the lower/right + one highlight, no filters / text / images.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- helpers ----------
const n2 = v => +(+v).toFixed(2);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
const E = (cx, cy, rx, ry, a = '') => `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}"${a}/>`;
const Ci = (cx, cy, r, a = '') => `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}"${a}/>`;
const P = (d, a = '') => `<path d="${d}"${a}/>`;
const fillA = (f, o, sw) => ` fill="${f}" stroke="${o}" stroke-width="${n2(sw)}" stroke-linejoin="round" stroke-linecap="round"`;
const lineA = (o, sw, op) => ` fill="none" stroke="${o}" stroke-width="${n2(sw)}" stroke-linejoin="round" stroke-linecap="round"${op != null ? ` stroke-opacity="${op}"` : ''}`;
const pts2d = pts => pts.map((p, i) => (i ? 'L' : 'M') + n2(p[0]) + ',' + n2(p[1])).join('') + 'Z';
// closed Catmull-Rom spline through points → smooth cubic path
function smooth(pts, closed = true) {
  const n = pts.length, g = i => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${n2(pts[0][0])},${n2(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    d += `C${n2(p1[0] + (p2[0] - p0[0]) / 6)},${n2(p1[1] + (p2[1] - p0[1]) / 6)} ${n2(p2[0] - (p3[0] - p1[0]) / 6)},${n2(p2[1] - (p3[1] - p1[1]) / 6)} ${n2(p2[0])},${n2(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
function star(cx, cy, R, r, n = 5, rot = -90) {
  const p = [];
  for (let i = 0; i < 2 * n; i++) { const a = (rot + i * 180 / n) * Math.PI / 180, q = i % 2 ? r : R; p.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]); }
  return pts2d(p);
}
// 4-point sparkle with curved sides
function sparkle(cx, cy, R) {
  const k = R * 0.18;
  return `M${n2(cx)},${n2(cy - R)}Q${n2(cx + k)},${n2(cy - k)} ${n2(cx + R)},${n2(cy)}Q${n2(cx + k)},${n2(cy + k)} ${n2(cx)},${n2(cy + R)}` +
    `Q${n2(cx - k)},${n2(cy + k)} ${n2(cx - R)},${n2(cy)}Q${n2(cx - k)},${n2(cy - k)} ${n2(cx)},${n2(cy - R)}Z`;
}
// pointed leaf from base B to tip T, half-width w (as fraction of length)
function leaf(B, T, w = 0.3, bend = 0) {
  const dx = T[0] - B[0], dy = T[1] - B[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const m = [B[0] + dx * 0.45, B[1] + dy * 0.45];
  const a = [m[0] + nx * L * w * (1 + bend), m[1] + ny * L * w * (1 + bend)], b = [m[0] - nx * L * w * (1 - bend), m[1] - ny * L * w * (1 - bend)];
  return `M${n2(B[0])},${n2(B[1])}Q${n2(a[0])},${n2(a[1])} ${n2(T[0])},${n2(T[1])}Q${n2(b[0])},${n2(b[1])} ${n2(B[0])},${n2(B[1])}Z`;
}
const rotP = (p, c, deg) => { const a = deg * Math.PI / 180, x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; };
const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// A file-context: unique ids + stroke width (so nested scaled drawings keep 3 px outlines)
function ctx(prefix, sw = 3) { let k = 0; return { id: () => `${prefix}${++k}`, sw }; }
// one-step shading: shape in shade colour, then the same shape shifted up-left in the base colour clipped to it, then the outline
function shaded(c, shape, base, shade, out, dx = -6, dy = -6) {
  const id = c.id();
  return `<clipPath id="${id}">${shape}</clipPath>` +
    `<g fill="${shade}">${shape}</g>` +
    `<g clip-path="url(#${id})"><g fill="${base}" transform="translate(${dx} ${dy})">${shape}</g></g>` +
    `<g fill="none" stroke="${out}" stroke-width="${n2(c.sw)}" stroke-linejoin="round" stroke-linecap="round">${shape}</g>`;
}

// ---------- the egg shape (centre (64,64), inside a circle of radius 58) ----------
function eggPoints(cx = 64, cy = 64, H = 58, W = 52, n = 40) {
  const raw = [];
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n, s = -Math.cos(t);          // s = -1 top, +1 bottom
    raw.push([Math.sin(t) * (1 + 0.13 * s), s]);
  }
  const mx = Math.max(...raw.map(p => Math.abs(p[0])));
  let pts = raw.map(([x, s]) => [x / mx * W, s * H]);
  const rmax = Math.max(...pts.map(p => Math.hypot(p[0], p[1])));
  const k = rmax > H ? H / rmax : 1;                        // keep inside the 58 circle
  return pts.map(([x, y]) => [cx + x * k, cy + y * k]);
}
const EGG = smooth(eggPoints());

// ---------- palettes ----------
const EGGS = {
  1: { name: 'Dewdrop', base: '#c6f0da', pat: '#7fcfaa', out: '#3c8a68' },
  2: { name: 'Sky', base: '#8ccdf0', pat: '#3f86bd', out: '#2b6592' },
  3: { name: 'Berry', base: '#f585b2', pat: '#fff1f7', out: '#9a3363' },
  4: { name: 'Moon', base: '#b6a0ea', pat: '#fff7dc', out: '#5b4699' },
  5: { name: 'Fern', base: '#8fd665', pat: '#2f7a26', pat2: '#e2fbcc', out: '#356c24' },
  6: { name: 'Sunset', base: '#ff7d5c', pat: '#fff0e0', pat2: '#c2362a', out: '#a3361f' },
  7: { name: 'Starry', base: '#3d48a6', pat: '#ffffff', pat2: '#8fa0ff', out: '#1f2766' },
  8: { name: 'Golden Dragon', base: '#f6c445', pat: '#d8961f', pat2: '#fff4c4', out: '#946112' },
};
const M = { // Mossy
  body: '#6cbb4a', shade: '#55a03a', out: '#336628', belly: '#e2f6d1', bellyS: '#c4e7ae', bellyO: '#7fb466',
  snout: '#94d672', wing: '#a9df7e', wingS: '#88c862', wingO: '#3f7a2c', vein: '#5f9e43',
  horn: '#ffc9a3', hornO: '#b0704a', claw: '#fff0dc', clawO: '#a5774f',
  eye: '#21303a', cheek: '#ff97ac', mouth: '#7a2a3c', tongue: '#ff8a9a', sprout: '#7fd35a', sproutO: '#2f6b24',
};
const B = { // baby dragon: soft teal-blue, peach belly
  body: '#6cc3d6', shade: '#52a7bd', out: '#2a6b80', belly: '#ffd7b8', bellyS: '#f6bf98', bellyO: '#c48a63',
  snout: '#94d8e6', wing: '#b9ecf4', wingS: '#94d9e6', wingO: '#2f7489', vein: '#5aa9bd',
  horn: '#ffd0b0', hornO: '#b97a52', claw: '#fff3e4', clawO: '#a9805c',
  eye: '#1f2c3c', cheek: '#ff9fb2', mouth: '#7a2a3c', tongue: '#ff8a9a', shell: '#fff6e6', shellO: '#b59a72',
};

// ---------- eggs ----------
function eggFace(k, P_, c) {
  const f = 1.4 - (k - 1) * 0.065;           // small eggs get a relatively bigger face
  const ex = 15 * f, ey = 70, er = 6.2 * f, my = ey + 11 * f;
  const eye = mix(P_.out, '#140c24', 0.55);
  let s = '';
  const cheek = k === 7 ? '#ff8fb8' : '#ff7f9c';
  s += E(64 - ex - 7 * f, ey + 8 * f, 5.5 * f, 3.4 * f, ` fill="${cheek}" fill-opacity="${k === 3 ? 0.9 : 0.55}"`) +
       E(64 + ex + 7 * f, ey + 8 * f, 5.5 * f, 3.4 * f, ` fill="${cheek}" fill-opacity="${k === 3 ? 0.9 : 0.55}"`);
  if (k === 3) s = s.replace(/fill="#ff7f9c"/g, 'fill="#d84c84"');
  const eyeFill = k === 7 ? '#0d1030' : eye;
  for (const sx of [-1, 1]) {
    const x = 64 + sx * ex;
    s += Ci(x, ey, er, ` fill="${eyeFill}"`);
    s += Ci(x - er * 0.32, ey - er * 0.36, er * (k >= 5 ? 0.38 : 0.32), ' fill="#ffffff"');
    if (k >= 7) s += Ci(x + er * 0.35, ey + er * 0.35, er * 0.16, ' fill="#ffffff"');
  }
  if (k === 7) { // pale rim so the dark eyes read on the indigo shell
    s = s.replace(new RegExp(`<circle([^>]*)fill="${eyeFill}"/>`, 'g'), `<circle$1fill="${eyeFill}" stroke="#c9d0ff" stroke-width="2"/>`);
  }
  const mw = 7.5 * f, mcol = k === 7 ? '#dfe3ff' : eye;
  if (k <= 5) {
    s += P(`M${n2(64 - mw)},${n2(my)}Q64,${n2(my + mw * 0.95)} ${n2(64 + mw)},${n2(my)}`, lineA(mcol, 3.2 * Math.max(1, f * 0.85)));
  } else {
    const w = mw * 1.15, d = `M${n2(64 - w)},${n2(my - 1)}Q64,${n2(my + w * 1.5)} ${n2(64 + w)},${n2(my - 1)}Z`;
    const id = c.id();
    s += `<clipPath id="${id}"><path d="${d}"/></clipPath>` + P(d, ` fill="${k === 7 ? '#151a48' : '#7a2a3c'}"`) +
      `<g clip-path="url(#${id})">${E(64, my + w * 0.95, w * 0.6, w * 0.4, ' fill="#ff8a9a"')}</g>` + P(d, lineA(k === 7 ? '#dfe3ff' : eye, 2.6));
  }
  if (k === 8) { // tiny happy brows
    s += P(`M${n2(64 - ex - 4)},${n2(ey - er - 5)}Q${n2(64 - ex)},${n2(ey - er - 8)} ${n2(64 - ex + 4)},${n2(ey - er - 5)}`, lineA(eye, 2.4)) +
         P(`M${n2(64 + ex - 4)},${n2(ey - er - 5)}Q${n2(64 + ex)},${n2(ey - er - 8)} ${n2(64 + ex + 4)},${n2(ey - er - 5)}`, lineA(eye, 2.4));
  }
  return s;
}
function eggPattern(k, c) {
  const r = rng(k * 977 + 13);
  // keep patterns off the face box (x 34–94, y 56–96)
  const offFace = (x, y, pad = 0) => !(x > 34 - pad && x < 94 + pad && y > 54 - pad && y < 98 + pad);
  let s = '';
  if (k === 1) {
    [[40, 26, 3.6], [80, 20, 3], [98, 42, 4], [26, 52, 3.4], [102, 104, 3.2], [30, 100, 3.8], [64, 114, 3.6], [62, 38, 2.6]]
      .forEach(([x, y, q]) => { s += Ci(x, y, q, ` fill="${c.pat}"`); });
  } else if (k === 2) {
    let n = 0;
    while (n < 34) {
      const x = 12 + r() * 104, y = 8 + r() * 114;
      if (!offFace(x, y, 2)) continue;
      s += E(x, y, 1.6 + r() * 1.6, 1.3 + r() * 1.1, ` fill="${c.pat}" transform="rotate(${Math.round(r() * 180)} ${n2(x)} ${n2(y)})"`); n++;
    }
  } else if (k === 3) {
    [[38, 32, 11], [86, 22, 8], [104, 64, 10], [22, 74, 9], [64, 116, 12], [100, 104, 8], [30, 110, 7], [62, 44, 4.5]]
      .forEach(([x, y, q]) => { s += Ci(x, y, q, ` fill="${c.pat}"`); });
  } else if (k === 4) {
    const id = c.id(); // crescent = circle minus offset circle
    s += `<clipPath id="${id}"><path d="M0,0H128V128H0ZM39,27a14,14 0 1,0 28,0a14,14 0 1,0 -28,0Z" clip-rule="evenodd"/></clipPath>`;
    s += `<g clip-path="url(#${id})">${Ci(44, 33, 16, ` fill="${c.pat}" stroke="${mix(c.pat, c.out, 0.45)}" stroke-width="2"`)}</g>`;
    s += P(star(88, 28, 6.5, 2.8, 4, -90), ` fill="${c.pat}"`) + P(star(100, 46, 4.2, 1.8, 4, -90), ` fill="${c.pat}"`);
    s += Ci(26, 96, 3, ` fill="${c.pat}" fill-opacity="0.7"`) + Ci(98, 106, 2.4, ` fill="${c.pat}" fill-opacity="0.7"`) + Ci(56, 112, 2, ` fill="${c.pat}" fill-opacity="0.7"`);
  } else if (k === 5) {
    // a curling fern frond: stem up the right side ending in a fiddlehead spiral, leaflets on both sides
    const stem = [[66, 124], [86, 108], [100, 84], [102, 58], [94, 36]];
    const spiral = [];
    for (let i = 0; i <= 28; i++) { const t = i / 28, a = Math.PI * 0.15 - t * Math.PI * 2.1, rr = 16 * (1 - t * 0.78); spiral.push([78 + rr * Math.cos(a), 30 + rr * Math.sin(a)]); }
    s += P(smooth([...stem, ...spiral.slice(1)], false), lineA(c.pat, 6));
    // leaflets along the stem (outer side + inner side)
    const lf = [[[84, 110], [96, 120]], [[95, 94], [112, 98]], [[101, 76], [116, 72]], [[101, 60], [114, 50]], [[86, 110], [74, 104]], [[97, 90], [86, 84]]];
    lf.forEach(([b, t]) => { s += P(leaf(b, t, 0.36), ` fill="${c.pat}"`); });
    // a smaller pale frond on the left
    s += P(smooth([[30, 112], [22, 88], [26, 60], [38, 40], [48, 34], [50, 42], [42, 44]], false), lineA(c.pat2, 3.4));
    [[[24, 92], [14, 84]], [[25, 72], [16, 62]], [[31, 52], [26, 40]], [[23, 96], [33, 104]], [[25, 76], [35, 82]]].forEach(([b, t]) => { s += P(leaf(b, t, 0.3), ` fill="${c.pat2}"`); });
  } else if (k === 6) {
    const wave = (y, amp, ph) => { const p = []; for (let x = -4; x <= 132; x += 6) p.push([x, y + amp * Math.sin(x / 128 * Math.PI * 4 + ph)]); return smooth(p, false); };
    s += P(wave(20, 3.4, 0), lineA(c.pat, 9)) + P(wave(40, 3.4, 1.6), lineA(c.pat2, 9)) + P(wave(106, 3.4, 0.8), lineA(c.pat, 10));
    s += P(wave(118, 2.4, 2.2), lineA(c.pat2, 5));
  } else if (k === 7) {
    const st = [[34, 30, 7], [82, 18, 5], [100, 44, 6.5], [22, 62, 4.5], [106, 82, 5], [30, 100, 6], [88, 108, 7], [58, 112, 4], [58, 34, 4]];
    st.forEach(([x, y, q], i) => { s += P(star(x, y, q, q * 0.45, 5, -90 + i * 17), ` fill="${c.pat}" stroke="${c.pat}" stroke-width="1" stroke-linejoin="round"`); });
    let n = 0;
    while (n < 16) { const x = 14 + r() * 100, y = 10 + r() * 110; if (!offFace(x, y, 4)) continue; s += Ci(x, y, 1 + r() * 1.2, ` fill="${n % 3 ? c.pat2 : c.pat}"`); n++; }
  } else if (k === 8) {
    // overlapping dragon scales: rows of U-arcs, staggered
    for (let row = 0; row < 7; row++) {
      const y = 2 + row * 18, off = row % 2 ? 12 : 0;
      for (let x = -6 + off; x < 140; x += 24) {
        if (!offFace(x, y + 8, -2)) continue;
        const d = `M${n2(x - 12)},${n2(y)}Q${n2(x - 12)},${n2(y + 17)} ${n2(x)},${n2(y + 17)}Q${n2(x + 12)},${n2(y + 17)} ${n2(x + 12)},${n2(y)}`;
        s += P(d + 'Z', ` fill="#ffd970" fill-opacity="0.55"`) + P(d, lineA(c.pat, 3));
      }
    }
    s += P(sparkle(92, 30, 10), ` fill="${c.pat2}" stroke="#ffffff" stroke-width="1.2"`) + P(sparkle(104, 48, 4.5), ' fill="#ffffff"');
  }
  return s;
}
function eggBody(k, c, withFace = true) {
  const p = EGGS[k], clip = c.id();
  let s = `<clipPath id="${clip}"><path d="${EGG}"/></clipPath>`;
  s += P(EGG, ` fill="${p.base}"`);
  s += `<g clip-path="url(#${clip})">` + eggPattern(k, { ...p, id: c.id }) +
    // flat shade: the egg minus a copy shifted up-left → crescent on the lower right
    `<path d="${EGG}M0,0H200V200H0Z" transform="translate(-9 -8)" fill-rule="evenodd" fill="${p.out}" fill-opacity="0.2"/>` + `</g>`;
  // highlight
  s += E(38, 34, 7.5, 13, ` fill="#ffffff" fill-opacity="0.62" transform="rotate(32 38 34)"`) + Ci(29, 54, 3.2, ' fill="#ffffff" fill-opacity="0.62"');
  if (withFace) s += eggFace(k, p, c);
  s += P(EGG, ` fill="none" stroke="${p.out}" stroke-width="${n2(c.sw)}" stroke-linejoin="round"`);
  return s;
}
const eggSvg = k => svg(128, 128, eggBody(k, ctx('e' + k + '_')));

function crackSvg() {
  const zz = [[14, 62], [24, 54], [32, 64], [42, 52], [52, 63], [62, 50], [72, 62], [82, 51], [92, 63], [102, 53], [114, 60]];
  const d = zz.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('');
  const b1 = 'M62,50L58,40L64,32', b2 = 'M92,63L96,74L90,82', b3 = 'M32,64L28,74';
  const all = [d, b1, b2, b3];
  return svg(128, 128, all.map(x => P(x, lineA('#8a5a10', 7.5))).join('') + all.map(x => P(x, lineA('#fff6dc', 3.4))).join(''));
}
function shellSvg(right) {
  // a cup-shaped half shell with a zig-zag top edge, tilted outwards
  const pts = [[8, 30], [14, 22], [20, 30], [27, 20], [33, 29], [40, 19], [46, 28], [52, 21], [57, 30]];
  const top = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('');
  const d = top + 'C58,46 48,58 32,58C16,58 6,46 8,30Z';
  const inner = 'M12,30L16,26L20,32L27,24L33,31L40,23L46,30L52,25L54,31C50,36 16,36 12,30Z';
  const c = ctx('s' + (right ? 'r' : 'l'));
  const body = `<g transform="rotate(${right ? 18 : -18} 32 36)">` + P(inner, ` fill="#fff3cf"`) +
    shaded(c, `<path d="${d}"/>`, EGGS[8].base, '#dea533', EGGS[8].out, -5, -5) +
    P('M18,40Q20,48 27,51', lineA('#ffffff', 3, 0.7)) + `</g>`;
  return svg(64, 64, right ? `<g transform="translate(64 0) scale(-1 1)">${body}</g>` : body);
}

// ---------- dragons (Mossy and the baby) — drawn in a 160 × 160 box, body centre (80,70), claws (80,132) ----------
function dragon(c, C, o) {
  const sw = c.sw, wingSet = o.wings || 'up', arms = o.arms || 'hold', face = o.face || 'idle';
  let s = '';
  // tail (behind): curls to the right, a leaf tip
  const tail = 'M98,104C114,118 136,114 140,98C143,86 134,78 126,84';
  s += P(tail, lineA(C.out, 16)) + P(tail, lineA(C.body, 10));
  s += o.baby ? P(leaf([126, 84], [114, 70], 0.32), fillA(C.wing, C.wingO, sw)) : P(leaf([126, 84], [116, 66], 0.34), fillA(C.wing, C.wingO, sw)) + P('M125,82L118,71', lineA(C.vein, 1.6));
  // wings (behind the body): two leaves each side
  const tips = { up: [[24, 20], 34], mid: [[12, 60], 26], down: [[8, 98], -24] }[wingSet];
  for (const side of [-1, 1]) {
    const base = [80 + side * 20, 76];
    const T = [80 + side * (80 - tips[0][0]), tips[0][1]];
    const T2 = rotP(lerpP(base, T, 0.74), base, side * tips[1]);
    const mir = p => p; // geometry already mirrored via side
    s += P(leaf(base, mir(T2), 0.3), fillA(C.wingS, C.wingO, sw));
    s += P(leaf(base, T, 0.31), fillA(C.wing, C.wingO, sw));
    // veins on the big leaf
    const m1 = lerpP(base, T, 0.12), m2 = lerpP(base, T, 0.86);
    s += P(`M${n2(m1[0])},${n2(m1[1])}L${n2(m2[0])},${n2(m2[1])}`, lineA(C.vein, 2));
    const dx = T[0] - base[0], dy = T[1] - base[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    for (const t of [0.35, 0.58]) {
      const p = lerpP(base, T, t);
      for (const sd of [-1, 1]) {
        const q = [p[0] + nx * sd * L * 0.13 + dx * 0.1, p[1] + ny * sd * L * 0.13 + dy * 0.1];
        s += P(`M${n2(p[0])},${n2(p[1])}L${n2(q[0])},${n2(q[1])}`, lineA(C.vein, 1.5));
      }
    }
  }
  // feet (dangling)
  for (const side of [-1, 1]) {
    const fx = 80 + side * 16;
    s += E(fx, 113, 9, 7, fillA(C.body, C.out, sw));
    for (const t of [-4, 0, 4]) s += Ci(fx + t, 119, 1.9, fillA(C.claw, C.clawO, 1.2));
  }
  // body
  s += shaded(c, E(80, 90, 30, 27), C.body, C.shade, C.out, -6, -5);
  // belly
  s += E(80, 95, 18, 18, fillA(C.belly, C.bellyO, 2));
  s += P('M66,90Q80,95 94,90', lineA(C.bellyS, 2)) + P('M65,99Q80,104 95,99', lineA(C.bellyS, 2)) + P('M68,107Q80,111 92,107', lineA(C.bellyS, 2));
  // arms
  const armPath = (side) => {
    const sx = 80 + side * 20;
    if (arms === 'wave' && side === 1) return { d: `M${sx},86Q116,80 120,60`, hand: [120, 58] };
    if (arms === 'open') return { d: `M${sx},88Q${80 + side * 26},112 ${80 + side * 17},124`, hand: [80 + side * 17, 125] };
    return { d: `M${sx},88Q${80 + side * 22},116 ${80 + side * 6},125`, hand: [80 + side * 5.5, 126] };
  };
  for (const side of [-1, 1]) {
    const a = armPath(side);
    s += P(a.d, lineA(C.out, 6 + 2 * sw)) + P(a.d, lineA(C.body, 6));
    const [hx, hy] = a.hand;
    if (arms === 'wave' && side === 1) {
      s += Ci(hx, hy, 6, fillA(C.body, C.out, sw));
      for (const t of [-4, 0, 4]) s += Ci(hx + t, hy - 5, 1.8, fillA(C.claw, C.clawO, 1.2));
    } else {
      s += Ci(hx, hy, 5.5, fillA(C.body, C.out, sw));
      // two tiny claws pointing down; the inner one ends at y 132
      const spread = arms === 'open' ? 1 : 0;
      for (const t of [-2.6, 2.6]) {
        const cx0 = hx + t, cx1 = hx + t * (1 + spread * 0.8) + side * spread * 2;
        s += P(`M${n2(cx0 - 1.6)},${n2(hy + 3)}L${n2(cx1)},132L${n2(cx0 + 1.6)},${n2(hy + 3)}Z`, fillA(C.claw, C.clawO, 1.3));
      }
    }
  }
  // horns (peach) / baby: tiny nubs
  if (o.baby) {
    s += P('M60,28L57,18L67,24Z', fillA(C.horn, C.hornO, sw)) + P('M100,28L103,18L93,24Z', fillA(C.horn, C.hornO, sw));
  } else {
    s += P('M59,27Q51,19 53,8Q62,13 68,22Z', fillA(C.horn, C.hornO, sw)) + P('M101,27Q109,19 107,8Q98,13 92,22Z', fillA(C.horn, C.hornO, sw));
    s += P('M58,19Q61,18 63,16', lineA(C.hornO, 1.6)) + P('M102,19Q99,18 97,16', lineA(C.hornO, 1.6));
  }
  // head
  s += shaded(c, E(80, 50, 37, 31), C.body, C.shade, C.out, -6, -5);
  // top: Mossy has a two-leaf sprout; the baby wears a bit of egg shell
  if (o.baby) {
    s += P('M54,32C58,14 102,14 106,32L100,27L94,34L87,26L80,34L73,26L66,34L60,27Z', fillA(C.shell, C.shellO, sw));
    s += P('M64,22Q70,18 76,18', lineA('#ffffff', 2.4, 0.9));
  } else {
    s += P('M80,20Q79,14 80,10', lineA(C.sproutO, 3.2));
    s += P(leaf([80, 12], [66, 4], 0.36, 0.1), fillA(C.sprout, C.sproutO, sw * 0.9)) + P(leaf([80, 12], [95, 3], 0.36, -0.1), fillA(C.sprout, C.sproutO, sw * 0.9));
  }
  // snout
  s += E(80, 63, 20, 12, fillA(C.snout, C.out, 2.2));
  s += E(74, 59, 1.8, 1.4, ` fill="${C.out}"`) + E(86, 59, 1.8, 1.4, ` fill="${C.out}"`);
  // cheeks
  s += E(52, 61, 6.5, 4, ` fill="${C.cheek}" fill-opacity="0.85"`) + E(108, 61, 6.5, 4, ` fill="${C.cheek}" fill-opacity="0.85"`);
  // eyes
  const eyeOpen = (x) => E(x, 45, 8, 9.5, ` fill="${C.eye}"`) + Ci(x - 2.6, 41, 3.2, ' fill="#ffffff"') + Ci(x + 3, 49.5, 1.5, ' fill="#ffffff"');
  if (face === 'happy') {
    s += P('M57,48Q64,37 71,48', lineA(C.eye, 3.8)) + P('M89,48Q96,37 103,48', lineA(C.eye, 3.8));
  } else {
    s += eyeOpen(64) + eyeOpen(96);
  }
  // mouth
  const openMouth = (w, h) => {
    const d = `M${80 - w},66Q80,${66 + h} ${80 + w},66Z`, id = c.id();
    return `<clipPath id="${id}"><path d="${d}"/></clipPath>` + P(d, ` fill="${C.mouth}"`) +
      `<g clip-path="url(#${id})">${E(80, 66 + h * 0.62, w * 0.62, h * 0.32, ` fill="${C.tongue}"`)}</g>` + P(d, lineA(C.out, 2.4));
  };
  if (face === 'idle') s += P('M73,67Q80,73 87,67', lineA(C.out, 2.6));
  else if (face === 'drop') s += openMouth(6.5, 12);
  else if (face === 'happy') s += openMouth(9, 15);
  else if (face === 'worry') {
    s += E(80, 69, 3.4, 4, ` fill="${C.mouth}" stroke="${C.out}" stroke-width="2"`);
    s += P('M55,33Q61,28 70,31', lineA(C.out, 2.8)) + P('M105,33Q99,28 90,31', lineA(C.out, 2.8));
    s += P('M120,26Q125,34 120,37Q115,34 120,26Z', fillA('#bfe8ff', '#5c97c0', 2));
  }
  return s;
}
const mossySvg = (wings, arms, face) => svg(160, 160, dragon(ctx('mo'), M, { wings, arms, face }));
function babySvg() {
  const k = 0.8, c = ctx('bb', 3 / k);
  // body centre of the drawing ≈ (80,68) → (64,64)
  return svg(128, 128, `<g transform="translate(0 9.6) scale(${k})">${dragon(c, B, { baby: true, wings: 'up', arms: 'wave', face: 'happy' })}</g>`);
}

// ---------- fairy ----------
function fairySvg() {
  const wingF = '#dcf3ff', wingO = '#6d9cc2';
  let s = '';
  s += Ci(48, 50, 34, ' fill="#e9fff1" fill-opacity="0.22"') + Ci(48, 50, 25, ' fill="#f2fff6" fill-opacity="0.35"');
  const w = (cx, cy, rx, ry, a) => E(cx, cy, rx, ry, ` fill="${wingF}" fill-opacity="0.9" stroke="${wingO}" stroke-width="2.5" transform="rotate(${a} ${cx} ${cy})"`) +
    P(`M48,46L${n2(cx + (cx - 48) * 0.6)},${n2(cy + (cy - 46) * 0.6)}`, lineA('#a9cbe6', 1.3));
  s += w(28, 33, 17, 7, 35) + w(68, 33, 17, 7, -35) + w(31, 60, 13, 5.5, -25) + w(65, 60, 13, 5.5, 25);
  // wand
  s += P('M61,60L78,40', lineA('#9a5a3e', 6)) + P('M61,60L78,40', lineA('#e0a37a', 3));
  s += P(star(80, 37, 8.5, 4, 5, -90), fillA('#ffffff', '#d45d94', 2.6));
  // body
  s += shaded(ctx('fy'), Ci(48, 52, 17), '#fff3f8', '#f5d6e6', '#c2678f', -4, -4);
  // petal cap
  s += P(leaf([48, 38], [36, 28], 0.38), fillA('#ff9cc6', '#b5477a', 2.6)) + P(leaf([48, 38], [60, 28], 0.38), fillA('#ff9cc6', '#b5477a', 2.6)) +
       P(leaf([48, 38], [48, 22], 0.36), fillA('#ffb8d6', '#b5477a', 2.6));
  // hand holding the wand
  s += Ci(62, 59, 3.6, fillA('#fff3f8', '#c2678f', 2));
  // face
  s += Ci(42, 51, 2.8, ' fill="#4a2440"') + Ci(54, 51, 2.8, ' fill="#4a2440"') + Ci(41.2, 50, 1, ' fill="#ffffff"') + Ci(53.2, 50, 1, ' fill="#ffffff"');
  s += P('M44,57Q48,61 52,57', lineA('#8a3a5e', 2)) + E(38, 56, 3, 2, ' fill="#ff8fb4" fill-opacity="0.8"') + E(58, 56, 3, 2, ' fill="#ff8fb4" fill-opacity="0.8"');
  // sparkles
  s += P(sparkle(18, 76, 5), ' fill="#ffffff" stroke="#7fc8a6" stroke-width="1.2"') + P(sparkle(76, 76, 4), ' fill="#ffffff" stroke="#7fc8a6" stroke-width="1.2"') +
       P(sparkle(14, 26, 3.5), ' fill="#ffffff" stroke="#7fc8a6" stroke-width="1"');
  return svg(96, 96, s);
}

// ---------- windsock ----------
const WS = { pole: '#9a6a44', poleS: '#7d5233', poleO: '#4e311c', stripes: ['#fbf1d6', '#79c257', '#8e4f86'], stripeO: ['#b8a47a', '#3f7a2c', '#4e2550'], out: '#4e3a3a' };
function pole() {
  let s = '';
  s += P('M4,96Q8,86 12,92Q14,82 17,92Q20,86 24,96Z', fillA('#79c257', '#3f7a2c', 2.4));
  s += `<rect x="10" y="7" width="8" height="87" rx="3"${fillA(WS.pole, WS.poleO, 3)}/>` + P('M15.5,12L15.5,90', lineA(WS.poleS, 2));
  s += Ci(14, 6, 4.2, fillA('#e3b38a', WS.poleO, 2.6));
  s += P('M4,96Q8,88 12,93Q14,86 17,93Q20,88 24,96', lineA('#3f7a2c', 2.2));
  return s;
}
function sock(center, half, nSeg = 5) {
  // sample centre line, build the two edges, slice into stripes
  const N = 60, L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = center(t), q = center(Math.min(1, t + 0.01)), p0 = center(Math.max(0, t - 0.01));
    const dx = q[0] - p0[0], dy = q[1] - p0[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, h = half(t);
    L.push([p[0] + nx * h, p[1] + ny * h]); R.push([p[0] - nx * h, p[1] - ny * h]);
  }
  let s = '';
  for (let k = 0; k < nSeg; k++) {
    const a = Math.round(k * N / nSeg), b = Math.round((k + 1) * N / nSeg);
    const poly = [...L.slice(a, b + 1), ...R.slice(a, b + 1).reverse()];
    s += P(pts2d(poly), ` fill="${WS.stripes[k % 3]}"`);
  }
  // shade along the lower edge
  const shadeP = [...R, ...R.map((p, i) => lerpP(p, L[i], 0.28)).reverse()];
  s += P(pts2d(shadeP), ' fill="#3a2440" fill-opacity="0.16"');
  const outline = pts2d([...L, ...R.slice().reverse()]);
  s += P(outline, lineA(WS.out, 3));
  // mouth ring
  s += E(L[0][0] / 2 + R[0][0] / 2, (L[0][1] + R[0][1]) / 2, 3.6, Math.abs(L[0][1] - R[0][1]) / 2 + 1, fillA('#c9c0d8', WS.out, 3));
  return s;
}
const quad = (a, b, c) => t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
function windsockSvg() {
  const q = quad([20, 14], [70, 14], [120, 19]);
  const center = t => { const p = q(t); return [p[0], p[1] + 2 * Math.sin(t * Math.PI * 3) * t]; };
  return svg(128, 96, pole() + sock(center, t => 9.5 - 5 * t));
}
function windsockCalmSvg() {
  const q = quad([20, 14], [38, 18], [31, 84]);
  return svg(128, 96, pole() + sock(q, t => 9.5 - 5 * t));
}

// ---------- next bubble ----------
function bubbleSvg() {
  let s = '';
  s += Ci(64, 70, 52, ' fill="#e8f7ff" fill-opacity="0.16"');
  s += Ci(64, 70, 47, ' fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="6"');
  s += Ci(64, 70, 52, ' fill="none" stroke="#5f9cc0" stroke-width="3"');
  s += P('M26,56A40,40 0 0 1 54,30', lineA('#ffffff', 5, 0.85)) + Ci(25, 68, 3, ' fill="#ffffff" fill-opacity="0.85"');
  s += P('M96,104A40,40 0 0 1 82,114', lineA('#ffffff', 3.5, 0.45));
  // leaf on top
  s += P('M62,22Q61,16 64,12', lineA('#3f7a2c', 3));
  s += P(leaf([64, 14], [90, 4], 0.34, 0.05), fillA('#79c257', '#3f7a2c', 3)) + P('M66,13L86,6', lineA('#4f9a38', 1.6));
  s += P(leaf([63, 15], [46, 6], 0.3), fillA('#9ad576', '#3f7a2c', 2.6));
  return svg(128, 128, s);
}

// ---------- app icon ----------
function iconSvg() {
  const c = ctx('ic', 3);
  let s = `<rect x="0" y="0" width="256" height="256" rx="56" fill="#1d4a2c"/>`;
  s += Ci(128, 120, 104, ' fill="#24583a"') + Ci(128, 120, 74, ' fill="#2b6643"');
  // golden egg under Mossy's claws
  const ek = 0.7, c2 = ctx('ie', 3 / ek);
  s += `<g transform="translate(${n2(128 - 64 * ek)} ${n2(205 - 64 * ek)}) scale(${ek})">${eggBody(8, c2)}</g>`;
  const mk = 1.25, c3 = ctx('im', 3 / mk);
  s += `<g transform="translate(${n2(128 - 80 * mk)} 9) scale(${mk})">${dragon(c3, M, { wings: 'up', arms: 'hold', face: 'happy' })}</g>`;
  s += P(sparkle(36, 44, 9), ' fill="#ffffff" fill-opacity="0.9"') + P(sparkle(222, 70, 6), ' fill="#ffffff" fill-opacity="0.8"') + P(sparkle(214, 210, 7), ' fill="#c9f2dd"');
  void c;
  return svg(256, 256, s);
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (let k = 1; k <= 8; k++) files[`egg_${k}`] = eggSvg(k);
files.egg_crack = crackSvg();
files.shell_l = shellSvg(false);
files.shell_r = shellSvg(true);
files.mossy_0 = mossySvg('up', 'hold', 'idle');
files.mossy_1 = mossySvg('down', 'hold', 'idle');
files.mossy_drop = mossySvg('mid', 'open', 'drop');
files.mossy_happy = mossySvg('up', 'hold', 'happy');
files.mossy_worry = mossySvg('mid', 'hold', 'worry');
files.baby = babySvg();
files.fairy = fairySvg();
files.windsock = windsockSvg();
files.windsock_calm = windsockCalmSvg();
files.bubble = bubbleSvg();
files.icon = iconSvg();
for (const [n, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n + '.svg'), s);
console.log('wrote ' + Object.keys(files).length + ' files to ' + OUT);
