// Generates Otto's Playroom Dash character + item SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
// Contract: docs/DESIGN.md §3 (style) and §4.1 (files, viewBoxes, anchors).
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });

/* ================================ HELPERS ================================ */
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const f1 = n => Math.round(n * 10) / 10;
const rad = d => d * Math.PI / 180;
const pt = (cx, cy, r, deg) => [f1(cx + r * Math.cos(rad(deg))), f1(cy + r * Math.sin(rad(deg)))];
const files = [];
const write = (name, s) => { fs.writeFileSync(path.join(OUT, name), s); files.push(name); };
const E = (cx, cy, rx, ry, a = '') => `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" ${a}/>`;
const Ci = (cx, cy, r, a = '') => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" ${a}/>`;
const P = (d, a = '') => `<path d="${d}" ${a}/>`;
const poly = p => 'M' + p.map(q => q.map(f1).join(',')).join(' L') + ' Z';
const line = p => 'M' + p.map(q => q.map(f1).join(',')).join(' L');
const fs_ = (fill, stroke, w = 3) => `fill="${fill}" stroke="${stroke}" stroke-width="${w}" ${R}`;
const st = (stroke, w) => `fill="none" stroke="${stroke}" stroke-width="${w}" ${R}`;
// smooth path through points (Catmull-Rom → cubic Bézier)
function smooth(p, closed = true) {
  const n = p.length, g = i => p[(i + n) % n];
  let d = `M${f1(p[0][0])},${f1(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = closed ? g(i - 1) : p[Math.max(0, i - 1)], p1 = g(i), p2 = g(i + 1), p3 = closed ? g(i + 2) : p[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (closed ? ' Z' : '');
}
function sparkle(x, y, s, c = '#ffffff', k = 0.22) {
  const a = s * k;
  return `<path d="M${f1(x)},${f1(y - s)} Q${f1(x + a)},${f1(y - a)} ${f1(x + s)},${f1(y)} Q${f1(x + a)},${f1(y + a)} ${f1(x)},${f1(y + s)} ` +
    `Q${f1(x - a)},${f1(y + a)} ${f1(x - s)},${f1(y)} Q${f1(x - a)},${f1(y - a)} ${f1(x)},${f1(y - s)} Z" fill="${c}"/>`;
}
function starPts(cx, cy, ro, ri, n = 5, rot = -90) {
  const p = [];
  for (let i = 0; i < n * 2; i++) p.push(pt(cx, cy, i % 2 ? ri : ro, rot + i * 180 / n));
  return p;
}
// rounded star path (smooth through points with slight rounding)
const starPath = (cx, cy, ro, ri, rot = -90) => poly(starPts(cx, cy, ro, ri, 5, rot));
const heartPath = (cx, cy, s) => // heart of half-width s centred at (cx, cy)
  `M${f1(cx)},${f1(cy + s * 0.95)} C${f1(cx - s * 0.3)},${f1(cy + s * 0.62)} ${f1(cx - s * 1.05)},${f1(cy + s * 0.2)} ${f1(cx - s * 1.0)},${f1(cy - s * 0.32)} ` +
  `C${f1(cx - s * 0.95)},${f1(cy - s * 0.92)} ${f1(cx - s * 0.2)},${f1(cy - s * 1.0)} ${f1(cx)},${f1(cy - s * 0.48)} ` +
  `C${f1(cx + s * 0.2)},${f1(cy - s * 1.0)} ${f1(cx + s * 0.95)},${f1(cy - s * 0.92)} ${f1(cx + s * 1.0)},${f1(cy - s * 0.32)} ` +
  `C${f1(cx + s * 1.05)},${f1(cy + s * 0.2)} ${f1(cx + s * 0.3)},${f1(cy + s * 0.62)} ${f1(cx)},${f1(cy + s * 0.95)} Z`;
// a tapered blob along a centreline: c(t) → [x,y], hw(t) → half width; returns a smooth closed path
function taper(c, hw, N = 14) {
  const L = [], Rr = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = c(Math.max(0, t - 0.01)), b = c(Math.min(1, t + 0.01));
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, p = c(t), w = hw(t);
    L.push([p[0] + nx * w, p[1] + ny * w]); Rr.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return smooth([...L, ...Rr.reverse()]);
}
const qb = (a, b, c) => t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];

/* ================================ PALETTE ================================ */
const OT = {
  fur: '#7a4a2e', shade: '#5e3820', line: '#3b2414', hi: '#9a6442', cream: '#f4e1c1', creamD: '#dcc29a', bean: '#c99f86',
  mint: '#3ee0b0', mintD: '#22b48c', mintL: '#a6f5dc', coral: '#ff7a6b', coralD: '#d9574a', eye: '#2b2034', nose: '#e27a8a', blush: '#ff9fa8',
};

/* ================================ OTTO (back view) ================================ */
// Shared geometry (all frames): body ellipse (64,72) rx40 ry29, head (64,33) rx28 ry21; feet line y=120.
const BODY = [64, 72, 40, 29];
const BODYD = smooth([[64, 46], [86, 49], [100, 62], [104, 80], [96, 97], [64, 103], [32, 97], [24, 80], [28, 62], [42, 49]]);
const HEADG = [64, 34, 27, 18];

function limb(a, b, w) {
  // a soft rounded leg drawn as a thick outlined stroke
  const d = `M${f1(a[0])},${f1(a[1])} L${f1(b[0])},${f1(b[1])}`;
  return P(d, st(OT.line, w + 6)) + P(d, st(OT.fur, w));
}
function frontLeg(x, footY, sg) {
  // far (front) legs peeking out at the sides under the body; footY = bottom of the paw
  return limb([x - sg * 2, 84], [x, footY - 6], 11) + E(x + sg * 1.5, footY - 4, 8, 4.6, fs_(OT.cream, OT.line, 3)) +
    P(`M${x - 3 + sg * 1.5},${footY - 6} L${x - 3 + sg * 1.5},${footY - 3} M${x + 3 + sg * 1.5},${footY - 6} L${x + 3 + sg * 1.5},${footY - 3}`, st(OT.creamD, 1.6));
}
function hindLeg(x, o) {
  // o.y = centre of the paw, o.ry = how much of the sole faces the camera (lifted = bigger), o.rot tilt
  const { y, ry = 5, rot = 0 } = o;
  const k = ry / 7;
  let s = limb([x, 94], [x + rot * 0.15, y - 3], 15);
  s += `<g transform="translate(${x + rot * 0.15},${y}) rotate(${rot})">` + E(0, 0, 11, ry + 1.5, fs_(OT.cream, OT.line, 3));
  if (ry >= 5) s += E(0, 1.8 * k, 4.4, 3.2 * k, `fill="${OT.bean}"`) + Ci(-5.6, -2.6 * k, 1.9, `fill="${OT.bean}"`) + Ci(0, -4 * k, 1.9, `fill="${OT.bean}"`) + Ci(5.6, -2.6 * k, 1.9, `fill="${OT.bean}"`);
  else s += P('M-5,0 L-5,3 M0,0.5 L0,3.5 M5,0 L5,3', st(OT.creamD, 1.8));
  return s + '</g>';
}
function tail(tip, mid, base = [64, 86]) {
  // the long, thick otter tail: stays thick, tapers to a rounded tip, sweeps out to the side on the floor
  const c = qb(base, mid, tip);
  const hw = t => 11.5 * (1 - Math.pow(t, 2.2)) + 2.6;
  const d = taper(c, hw, 18);
  const tipD = taper(t => c(0.78 + t * 0.22), t => hw(0.78 + t * 0.22) + 0.2, 6);
  const hiD = taper(t => { const u = 0.08 + t * 0.6, p = c(u), q = c(u + 0.01), dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, k = (tip[0] < base[0] ? -1 : 1) * hw(u) * 0.45; return [p[0] + dy / l * k, p[1] - dx / l * k]; }, t => 2.4 * (1 - t) + 0.8);
  return P(d, fs_(OT.fur, OT.line, 3)) + P(tipD, `fill="${OT.shade}"`) + P(d, st(OT.line, 3)) + P(hiD, `fill="${OT.hi}"`) ;
}
function body(id) {
  const clip = `<clipPath id="${id}b"><path d="${BODYD}"/></clipPath>`;
  return `<defs>${clip}</defs>` + P(BODYD, fs_(OT.shade, OT.line, 3.2)) +
    `<g clip-path="url(#${id}b)">` + E(BODY[0] - 7, BODY[1] - 6, BODY[2] - 3, BODY[3] - 2, `fill="${OT.fur}"`) + '</g>' +
    P(BODYD, st(OT.line, 3.2)) +
    // fur tufts + highlight on the round back
    P('M40,74 q3,-3 6,0 M76,84 q3,-3 6,0 M56,90 q3,-3 6,0', st(OT.shade, 2.2)) +
    E(44, 60, 10, 5, `transform="rotate(-28 44 60)" fill="${OT.hi}"`);
}
function head(face, id, earsBack = false) {
  const [hx, hy, rx, ry] = HEADG;
  let s = '';
  // cheeks / whisker pads peeking out at the sides (otters have wide cream muzzles) + whiskers
  const cheekL = face === 'ouch' ? null : [39, 43], cheekR = face === 'happy' ? null : [89, 43];
  [cheekL, cheekR].forEach((c, i) => {
    if (!c) return;
    const sg = i ? 1 : -1;
    s += P(`M${c[0] + sg * 6},${c[1] - 2} L${c[0] + sg * 20},${c[1] - 7} M${c[0] + sg * 6},${c[1] + 2} L${c[0] + sg * 21},${c[1] + 2} M${c[0] + sg * 5},${c[1] + 5} L${c[0] + sg * 18},${c[1] + 10}`, st(OT.line, 1.6));
    s += E(c[0], c[1], 6.5, 5, fs_(OT.cream, OT.line, 3));
  });
  // small round ears
  const ear = (x, y, flip) => earsBack
    ? E(x, y + 5, 7.5, 4.2, `transform="rotate(${flip * 28} ${x} ${y + 5})" ${fs_(OT.fur, OT.line, 3)}`)
    : Ci(x, y, 5, fs_(OT.fur, OT.line, 3)) + Ci(x + flip * 0.6, y + 0.6, 2.3, `fill="${OT.shade}"`);
  s += ear(41, 24, -1) + ear(87, 24, 1);
  // muzzle sticking out when the head is turned
  if (face === 'ouch') s += E(37, 40, 13, 10, fs_(OT.cream, OT.line, 3));
  if (face === 'happy') s += E(91, 40, 13, 10, fs_(OT.cream, OT.line, 3));
  const clip = `<clipPath id="${id}h">${E(hx, hy, rx, ry)}</clipPath>`;
  s += `<defs>${clip}</defs>` + E(hx, hy, rx, ry, `fill="${OT.shade}"`) +
    `<g clip-path="url(#${id}h)">` + E(hx - 4, hy - 4, rx - 1, ry - 2, `fill="${OT.fur}"`) +
    (face === 'ouch' ? E(38, 42, 13, 10, `fill="${OT.cream}"`) : '') + (face === 'happy' ? E(90, 42, 13, 10, `fill="${OT.cream}"`) : '') + '</g>' +
    E(hx, hy, rx, ry, st(OT.line, 3.2)) +
    E(52, 20, 9, 4.5, `transform="rotate(-20 52 20)" fill="${OT.hi}"`) +
    P('M60,19 q2,-2.5 4.5,-0.5 M66,18.5 q2,-2.5 4.5,0', st(OT.shade, 1.8));
  if (face === 'ouch') {
    // squeezed eye ">" over the left shoulder, pink nose at the muzzle tip, blush, swirl star
    s += P('M42,27 L48,31 L42,35', st(OT.eye, 3)) + E(25.5, 38, 4.2, 3.2, fs_(OT.nose, OT.line, 1.6)) +
      E(45, 42, 3.4, 2.2, `fill="${OT.blush}" opacity="0.9"`) + P('M28,45 q4,2 8,0', st(OT.line, 2));
    s += P(starPath(98, 9, 7, 3.2), fs_('#ffd23f', '#b88a12', 1.6)) +
      P('M84,14 C82,6 92,2 96,8 C99,13 92,16 90,11', st('#ffffff', 1.8)) + P('M84,14 C82,6 92,2 96,8 C99,13 92,16 90,11', st(OT.line, 0.8) + ' opacity="0.5"');
  } else if (face === 'happy') {
    // ^ eye, pink nose, big smile looking back over the right shoulder
    s += P('M78,31 Q83,24 88,31', st(OT.eye, 3.2)) + E(102.5, 38, 4.2, 3.2, fs_(OT.nose, OT.line, 1.6)) +
      E(83, 41, 3.6, 2.4, `fill="${OT.blush}" opacity="0.9"`) +
      P('M87,44 Q94,52 102,44 Q95,48 87,44 Z', fs_(OT.eye, OT.eye, 2)) + P('M91,47.5 Q94,50 97,47.6', st('#ff9aa8', 1.6));
  }
  return s;
}
function scarfBand() {
  const d = 'M33,52 Q64,66 95,52 L97,61 Q64,78 31,61 Z';
  let s = P(d, fs_(OT.mint, OT.line, 3));
  s += P('M33,57 Q64,72 96,57', st(OT.coral, 3)); // coral stripe
  // knit ribs
  for (let x = 38; x <= 90; x += 6) {
    const yT = 52 + 14 * (1 - Math.pow((x - 64) / 31, 2)) * 0.5, yB = yT + 9;
    s += P(`M${x},${f1(yT + 1.5)} L${x + 1},${f1(yB - 1.5)}`, st(OT.mintD, 1.4) + ' opacity="0.75"');
  }
  s += P('M40,55 Q52,61 60,62', st(OT.mintL, 1.6));
  return s;
}
function scarfEnd(a, b, ph, w = 6.5) {
  // a knitted ribbon from knot a to tip b with a flapping wave; coral stripe near the tip + fringe
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const c = t => { const o = Math.sin(t * Math.PI * 1.6 + ph) * 3.2 * t; return [a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]; };
  const hw = t => w * (0.82 + 0.18 * t);
  const N = 10, Lp = [], Rp = [];
  for (let i = 0; i <= N; i++) { const t = i / N, p = c(t), h = hw(t); Lp.push([p[0] + nx * h, p[1] + ny * h]); Rp.push([p[0] - nx * h, p[1] - ny * h]); }
  const pathOf = (t0, t1) => {
    const l = [], r = [];
    for (let i = 0; i <= 6; i++) { const t = t0 + (t1 - t0) * i / 6, p = c(t), h = hw(t); l.push([p[0] + nx * h, p[1] + ny * h]); r.push([p[0] - nx * h, p[1] - ny * h]); }
    return line([...l, ...r.reverse()]) + ' Z';
  };
  let s = P(line([...Lp, ...Rp.slice().reverse()]) + ' Z', fs_(OT.mint, OT.line, 3));
  s += P(pathOf(0.62, 0.78), `fill="${OT.coral}"`);
  s += P(pathOf(0.05, 0.55).replace(/ Z$/, ''), 'fill="none"');
  s += P(line([0.15, 0.35, 0.55].map(t => c(t))), st(OT.mintD, 1.4) + ' opacity="0.7"');
  // fringe
  const e = c(1), h = hw(1);
  for (const k of [-0.7, 0, 0.7]) {
    const q = [e[0] + nx * h * k, e[1] + ny * h * k];
    s += P(`M${f1(q[0])},${f1(q[1])} L${f1(q[0] + ux * 5 + nx * k * 1.5)},${f1(q[1] + uy * 5 + ny * k * 1.5)}`, st(OT.mintD, 2.4));
  }
  return P(line([...Lp, ...Rp.slice().reverse()]) + ' Z', st(OT.line, 3)) + s;
}
function scarfKnot() {
  return E(78, 66, 8, 6.5, fs_(OT.mint, OT.line, 3)) + P('M73,64 Q78,62 83,64', st(OT.mintD, 1.6)) + E(76, 64, 2.6, 1.6, `fill="${OT.mintL}"`);
}

function otto(o) {
  const id = o.id, b = o.bob || 0;
  let lower = '';
  // far front legs first
  lower += frontLeg(30, o.fl, -1) + frontLeg(98, o.fr, 1);
  let up = body(id);
  if (o.wave) {
    // front paw waving up at the right side (behind head, over the body side)
    up += P('M94,70 Q108,62 112,46', st(OT.line, 15)) + P('M94,70 Q108,62 112,46', st(OT.fur, 9)) +
      E(113, 41, 8, 9, `transform="rotate(16 113 41)" ${fs_(OT.cream, OT.line, 3)}`) +
      P('M106,33 L104,29 M113,31 L113,27 M120,34 L123,31', st(OT.creamD, 2)) +
      P('M121,48 Q126,42 124,36', st(OT.line, 2) + ' opacity="0.55"');
  }
  // the rump is redrawn (clipped to a rounded rump ellipse) over the tail root and leg tops so they grow out from under the body
  const rump = `<defs><clipPath id="${id}r"><ellipse cx="64" cy="66" rx="46" ry="29"/></clipPath></defs>` +
    `<g clip-path="url(#${id}r)"><g clip-path="url(#${id}b)">` + P(BODYD, `fill="${OT.shade}"`) + E(BODY[0] - 7, BODY[1] - 6, BODY[2] - 3, BODY[3] - 2, `fill="${OT.fur}"`) +
    P('M40,74 q3,-3 6,0 M76,84 q3,-3 6,0', st(OT.shade, 2.2)) + '</g></g>' + P(BODYD, st(OT.line, 3.2) + ` clip-path="url(#${id}r)"`);
  let mid = hindLeg(44, o.hl) + hindLeg(84, o.hr) + tail(o.tail[1], o.tail[0]) + `<g transform="translate(0,${b})">` + rump + '</g>';
  const ends = scarfEnd([80, 66], o.scarf[0], o.ph, 6) + scarfEnd([78, 68], o.scarf[1], o.ph + 1.3, 5.5);
  const top = head(o.face, id, o.earsBack) + scarfBand() + (o.endsBehind ? '' : ends) + scarfKnot();
  // body/head bob is a translate of the upper group; legs stay planted on the feet line
  return lower + `<g transform="translate(0,${b})">` + (o.endsBehind ? ends : '') + up + `</g>` + mid + `<g transform="translate(0,${b})">` + top + `</g>`;
}

// Run cycle: frame 0 left hind planted / right hind kicked back; 2 mirrored; 1 & 3 passing (both mid) with a -2 px bob.
const RUN = [
  { fl: 112, fr: 106, hl: { y: 115, ry: 4 }, hr: { y: 107, ry: 7, rot: 8 }, tail: [[78, 124], [114, 108]], scarf: [[110, 76], [102, 88]], ph: 0 },
  { fl: 109, fr: 109, hl: { y: 111, ry: 5.5 }, hr: { y: 112, ry: 5.5 }, tail: [[70, 126], [100, 122]], scarf: [[112, 70], [104, 84]], ph: 1.6, bob: -2 },
  { fl: 106, fr: 112, hl: { y: 107, ry: 7, rot: -8 }, hr: { y: 115, ry: 4 }, tail: [[50, 124], [14, 108]], scarf: [[108, 80], [101, 91]], ph: 3.1 },
  { fl: 109, fr: 109, hl: { y: 112, ry: 5.5 }, hr: { y: 111, ry: 5.5 }, tail: [[58, 126], [28, 122]], scarf: [[113, 73], [105, 86]], ph: 4.7, bob: -2 },
];
RUN.forEach((r, i) => write(`otto_${i}.svg`, svg(128, 128, otto({ id: 'o' + i, ...r }))));
write('otto_jump.svg', svg(128, 128, otto({
  id: 'oj', fl: 100, fr: 100, hl: { y: 113, ry: 7.5, rot: 14 }, hr: { y: 113, ry: 7.5, rot: -14 },
  tail: [[66, 112], [70, 125]], scarf: [[104, 38], [112, 48]], ph: 0.6, endsBehind: true,
})));
write('otto_ouch.svg', svg(128, 128, otto({
  id: 'ou', fl: 110, fr: 110, hl: { y: 114, ry: 4.5 }, hr: { y: 110, ry: 6, rot: 10 }, tail: [[80, 122], [116, 104]],
  scarf: [[110, 84], [100, 94]], ph: 2, face: 'ouch', earsBack: true,
})));
write('otto_happy.svg', svg(128, 128, otto({
  id: 'oh', fl: 112, fr: 112, hl: { y: 115, ry: 4 }, hr: { y: 115, ry: 4 }, tail: [[48, 124], [14, 110]],
  scarf: [[110, 80], [102, 90]], ph: 1, face: 'happy', wave: true, endsBehind: true,
})));

/* ================================ ACORNS ================================ */
// centred (32,34), fit in r 26. Light rim = a pale halo stroke under the outline.
function acorn(kind, id) {
  const A = [
    { nut: '#d98a3d', nutD: '#a9611f', cap: '#6b3f22', capD: '#4a2914', capL: '#8f5a35', line: '#4a2914' },
    { nut: '#ffcc33', nutD: '#d49a12', cap: '#8a7a2a', capD: '#5f531a', capL: '#aea04a', line: '#5a4a10' },
    { nut: '#ff4f7b', nutD: '#cc2f58', cap: '#1fa7a0', capD: '#137a75', capL: '#5fd3cc', line: '#6a1a33' },
  ][kind];
  let nutD, capD, stem, capY;
  if (kind === 0) { // round classic: plump round nut, wide domed cap
    nutD = 'M12,30 C12,46 22,57 32,59 C42,57 52,46 52,30 Z';
    capD = 'M8,31 C8,18 19,11 32,11 C45,11 56,18 56,31 C49,35 15,35 8,31 Z';
    stem = 'M31,12 Q30,6 35,3'; capY = 31;
  } else if (kind === 1) { // long slim: narrow tall nut with pointed tip, small tight cap
    nutD = 'M19,26 C18,44 25,56 32,61 C39,56 46,44 45,26 Z';
    capD = 'M16,27 C16,17 23,12 32,12 C41,12 48,17 48,27 C42,31 22,31 16,27 Z';
    stem = 'M32,13 L32,4'; capY = 27;
  } else { // painted toy acorn: egg nut, scalloped teal beret cap with a knob stem
    nutD = 'M12,31 C12,47 21,57 29.5,59.5 Q32,62.5 34.5,59.5 C43,57 52,47 52,31 Z';
    capD = 'M8,32 C7,19 18,11 32,11 C46,11 57,19 56,32 C50,37 14,37 8,32 Z';
    stem = null; capY = 31;
  }
  let s = `<defs><clipPath id="${id}n"><path d="${nutD}"/></clipPath><clipPath id="${id}c"><path d="${capD}"/></clipPath></defs>`;
  // light rim halo
  s += P(nutD, fs_('#fff6dc', '#fff6dc', 8) + ' opacity="0.85"') + P(capD, fs_('#fff6dc', '#fff6dc', 8) + ' opacity="0.85"');
  if (stem) s += P(stem, st('#fff6dc', 9) + ' opacity="0.85"');
  else s += Ci(32, 8, 7, 'fill="#fff6dc" opacity="0.85"');
  // nut
  s += P(nutD, `fill="${A.nutD}"`) + `<g clip-path="url(#${id}n)">` + E(29, 36, kind === 1 ? 12 : 18, 22, `fill="${A.nut}"`);
  if (kind === 2) [[22, 42, 3.8], [40, 40, 4], [33, 52, 3.4]].forEach(([x, y, r]) => { s += Ci(x, y, r, 'fill="#ffffff"'); });
  if (kind === 1) s += P('M27,34 Q26,46 31,56', st('#ffe680', 2.2));
  s += '</g>' + P(nutD, st(A.line, 3));
  // highlight
  s += kind === 1 ? E(25.5, 40, 2.6, 7, `transform="rotate(8 25.5 40)" fill="#ffffff" opacity="0.9"`) : E(21, 41, 4, 7.5, `transform="rotate(20 21 41)" fill="#ffffff" opacity="0.85"`);
  // cap
  s += P(capD, `fill="${A.capD}"`) + `<g clip-path="url(#${id}c)">` + E(30, 18, 30, 15, `fill="${A.cap}"`);
  if (kind === 0) { // cross-hatch scales
    for (let x = 6; x <= 58; x += 7) s += P(`M${x},10 L${x + 10},36`, st(A.capD, 1.5)) + P(`M${x + 10},10 L${x},36`, st(A.capD, 1.5));
  } else if (kind === 1) {
    for (let y = 16; y <= 26; y += 4.5) s += P(`M14,${y} Q32,${y + 4} 50,${y}`, st(A.capD, 1.5));
  } else {
    s += P('M9,29 Q32,37 55,29', st('#ffffff', 2.6) + ' opacity="0.9"') + P('M11,24 Q32,31 53,24', st(A.capD, 1.6));
  }
  s += '</g>' + P(capD, st(A.line, 3));
  s += E(kind === 1 ? 25 : 21, kind === 1 ? 17 : 17, kind === 1 ? 5 : 7, 2.6, `transform="rotate(-18 21 17)" fill="${A.capL}" opacity="0.9"`);
  if (stem) s += P(stem, st(A.line, 6)) + P(stem, st(A.cap === '#8a7a2a' ? '#6e6120' : '#5a3520', 2.6));
  else s += Ci(32, 8, 4.6, fs_(A.cap, A.line, 2.6)) + Ci(30.6, 6.6, 1.4, 'fill="#ffffff"');
  return s;
}
[0, 1, 2].forEach(k => write(`acorn_${k}.svg`, svg(64, 64, acorn(k, 'a' + k))));

/* ================================ OBSTACLES ================================ */
const BL = { red: ['#e8453c', '#b8302a', '#ff8a7a', '#6e1a16'], sun: ['#f6b928', '#c98a12', '#ffe07a', '#6b4a08'], blue: ['#3b6fd8', '#2a50a8', '#8fb0ff', '#16285e'] };
function cube(x, y, w, h, c, shape, tilt = 0, depth = 12) {
  // wooden cube: front face x..x+w, y..y+h; top face (lighter) going up-right by depth; side face (darker)
  const [m, d, l, ln] = c;
  const cx = x + w / 2, cy = y + h / 2;
  let s = `<g transform="rotate(${tilt} ${cx} ${y + h})">`;
  const dx = depth * 0.55, dy = depth;
  s += P(poly([[x, y], [x + dx, y - dy], [x + w + dx, y - dy], [x + w, y]]), fs_(l, ln, 3));
  s += P(poly([[x + w, y], [x + w + dx, y - dy], [x + w + dx, y + h - dy], [x + w, y + h]]), fs_(d, ln, 3));
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" ${fs_(m, ln, 3)}/>`;
  // wood-grain edge bevel + highlight
  s += P(`M${x + 5},${y + 5} L${x + w - 8},${y + 5}`, st('#ffffff', 2.4) + ' opacity="0.45"');
  s += `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="4" fill="none" stroke="${d}" stroke-width="2" opacity="0.6"/>`;
  const sz = Math.min(w, h) * 0.3, cream = '#fff4dc';
  if (shape === 'star') s += P(starPath(cx, cy + 1, sz, sz * 0.45), fs_(cream, ln, 2));
  if (shape === 'dot') s += Ci(cx, cy, sz * 0.85, fs_(cream, ln, 2));
  if (shape === 'heart') s += P(heartPath(cx, cy, sz * 0.9), fs_(cream, ln, 2));
  if (shape === 'tri') s += P(poly([[cx, cy - sz], [cx + sz * 1.05, cy + sz * 0.75], [cx - sz * 1.05, cy + sz * 0.75]]), fs_(cream, ln, 2));
  return s + '</g>';
}
function tower0() {
  let s = E(64, 154, 54, 5, 'fill="#000000" opacity="0.18"');
  s += cube(14, 106, 88, 48, BL.blue, 'star', 0, 14);
  s += cube(22, 62, 78, 44, BL.sun, 'heart', -3, 12);
  s += cube(26, 22, 70, 40, BL.red, 'dot', 4, 12);
  return s;
}
function tower1() {
  // stacking-ring toy: wooden base disc, peg, 5 rainbow rings (big → small), a ball on top
  const W = ['#8a5a2e', '#5e3a1a', '#c48a52', '#3b2414'];
  let s = E(64, 154, 56, 5, 'fill="#000000" opacity="0.18"');
  // base
  s += P('M10,138 L10,146 Q64,162 118,146 L118,138 Z', fs_(W[1], W[3], 3)) + E(64, 138, 54, 10, fs_(W[2], W[3], 3)) +
    P('M22,136 Q40,131 58,130', st('#e8b886', 2.4));
  // peg
  s += `<rect x="58" y="14" width="12" height="124" rx="5" ${fs_(W[0], W[3], 3)}/>`;
  const rings = [['#e8453c', '#b8302a', '#ff8a7a'], ['#ff9f2e', '#cc7414', '#ffc98a'], ['#f6d02e', '#c9a012', '#fff08a'], ['#4cc35a', '#2e8f3c', '#9be8a3'], ['#3b6fd8', '#2a50a8', '#8fb0ff']];
  const ln = '#2a1a3a';
  let y = 132;
  rings.forEach(([m, d, l], i) => {
    const rx = 48 - i * 7.5, h = 22 - i * 1;
    const yc = y - h / 2;
    // ring as a squashed torus: side band + top ellipse
    s += P(`M${64 - rx},${f1(yc - 3)} L${64 - rx},${f1(yc + 3)} A${rx},${f1(h * 0.42)} 0 0 0 ${64 + rx},${f1(yc + 3)} L${64 + rx},${f1(yc - 3)} Z`, fs_(d, ln, 3));
    s += E(64, yc - 3, rx, h * 0.42, fs_(m, ln, 3));
    s += E(64 - rx * 0.38, yc - 5, rx * 0.3, h * 0.12, `fill="${l}" opacity="0.9"`);
    s += E(64, yc - 3.6, 9, 3.2, `fill="${d}"`);
    y -= h - 3;
  });
  // ball on top
  s += Ci(64, 28, 15, fs_('#b56cf0', '#4a2470', 3)) + P('M53,22 Q58,15 66,15', st('#e4c4ff', 3)) + Ci(58, 22, 2.6, 'fill="#ffffff"');
  return s;
}
function blocks() {
  // three squishy foam cubes in a row, slightly squashed (wider than tall, soft rounded corners); base y = 74
  const C = [['#b58cf0', '#8c62cc', '#dcc4ff', '#4a2a7a', 'star'], ['#6cc4f2', '#3f98c8', '#b8e6ff', '#1d4f70', 'dot'], ['#9bd44a', '#6fa62a', '#d2f29a', '#33520f', 'tri']];
  let s = E(80, 74, 76, 4, 'fill="#000000" opacity="0.18"');
  C.forEach(([m, d, l, ln, sh], i) => {
    const x = 4 + i * 50, w = 46, y0 = 73, h = 50, y = y0 - h, dx = 8, dy = 10;
    s += P(`M${x + 4},${y} L${x + dx + 4},${y - dy} L${x + w + dx - 2},${y - dy} Q${x + w + dx + 1},${y - dy + 1} ${x + w + dx},${y - dy + 4} L${x + w + dx},${y0 - dy - 4} L${x + w},${y0} L${x + w},${y + 2} Z`, fs_(d, ln, 3));
    s += P(`M${x + 4},${y} L${x + dx + 4},${y - dy} L${x + w + dx - 2},${y - dy} L${x + w - 2},${y} Z`, fs_(l, ln, 3));
    // squishy front: slightly bulging edges
    s += P(`M${x + 6},${y} Q${x + w / 2},${y - 2} ${x + w - 6},${y} Q${x + w},${y} ${x + w},${y + 6} Q${x + w + 2},${y + h / 2} ${x + w},${y0 - 6} Q${x + w},${y0} ${x + w - 6},${y0} Q${x + w / 2},${y0 + 1.5} ${x + 6},${y0} Q${x},${y0} ${x},${y0 - 6} Q${x - 2},${y + h / 2} ${x},${y + 6} Q${x},${y} ${x + 6},${y} Z`, fs_(m, ln, 3));
    s += P(`M${x + 7},${y + 6} Q${x + 16},${y + 4} ${x + 26},${y + 5}`, st('#ffffff', 2.6) + ' opacity="0.6"');
    const cx = x + w / 2, cy = y + h / 2 + 2, sz = 10;
    if (sh === 'star') s += P(starPath(cx, cy, sz * 1.15, sz * 0.5), fs_('#fff8ee', ln, 2));
    if (sh === 'dot') s += Ci(cx, cy, sz * 0.9, fs_('#fff8ee', ln, 2));
    if (sh === 'tri') s += P(poly([[cx, cy - sz], [cx + sz * 1.05, cy + sz * 0.75], [cx - sz * 1.05, cy + sz * 0.75]]), fs_('#fff8ee', ln, 2));
    // foam pores
    s += Ci(x + 8, y0 - 8, 1.5, `fill="${d}"`) + Ci(x + w - 9, y + 12, 1.3, `fill="${d}"`) + Ci(x + 10, y + 16, 1.2, `fill="${d}"`) + Ci(x + w - 8, y0 - 12, 1.2, `fill="${d}"`);
  });
  return s;
}
function ball() {
  const ln = '#2a1a4a';
  let s = `<defs><clipPath id="bc">${Ci(48, 48, 42)}</clipPath></defs>` + Ci(48, 48, 42, 'fill="#ffffff"');
  s += `<g clip-path="url(#bc)">`;
  // curved diagonal stripes red / white / blue / white / yellow (rotated so it never reads as a flag)
  s += `<g transform="rotate(-32 48 48)">` + P('M-10,-10 L106,-10 L106,22 Q48,10 -10,22 Z', 'fill="#e8453c"') +
    P('M-10,38 Q48,26 106,38 L106,58 Q48,46 -10,58 Z', 'fill="#3b6fd8"') + P('M-10,74 Q48,62 106,74 L106,110 L-10,110 Z', 'fill="#f6b928"') + '</g>';
  // cel shade (lower right)
  s += Ci(56, 56, 44, 'fill="none" stroke="#1a1040" stroke-width="18" opacity="0.16"');
  s += '</g>' + Ci(48, 48, 42, st(ln, 3.2));
  // star patch
  s += Ci(64, 60, 11, fs_('#f6d02e', ln, 2.4)) + P(starPath(64, 60.5, 8, 3.6), fs_('#ffffff', '#c9a012', 1.2));
  s += E(30, 26, 11, 6, 'transform="rotate(-35 30 26)" fill="#ffffff" opacity="0.85"') + Ci(42, 18, 2.4, 'fill="#ffffff" opacity="0.85"');
  return s;
}
write('tower_0.svg', svg(128, 160, tower0()));
write('tower_1.svg', svg(128, 160, tower1()));
write('blocks.svg', svg(160, 80, blocks()));
write('ball.svg', svg(96, 96, ball()));

/* ================================ HUD ================================ */
function heart(empty) {
  const d = heartPath(24, 25, 20);
  if (empty) return `<g opacity="0.5">` + P(d, fs_('none', '#ff6b6b', 3.5)) + P(heartPath(24, 25, 14), st('#ff6b6b', 1.6) + ' stroke-dasharray="2.5 3"') + '</g>';
  return P(d, fs_('#d9484a', '#8a2a30', 3)) + `<defs><clipPath id="hc"><path d="${d}"/></clipPath></defs>` +
    `<g clip-path="url(#hc)">${E(21, 20, 22, 19, 'fill="#ff6b6b"')}</g>` + P(d, st('#8a2a30', 3)) +
    P('M24,14 Q25,26 24,40', st('#fff0ea', 1.6) + ' stroke-dasharray="2.6 2.6" opacity="0.85"') +
    E(14, 17, 4.5, 3, 'transform="rotate(-35 14 17)" fill="#ffffff" opacity="0.9"');
}
write('heart.svg', svg(48, 48, heart(false)));
write('heart_empty.svg', svg(48, 48, heart(true)));

function badge(inner) {
  return Ci(24, 24, 21, fs_('#fff6e2', '#4a3a6a', 3)) + Ci(24, 24, 17.5, 'fill="none" stroke="#e8dcc0" stroke-width="2"') + inner;
}
const grav = [
  // 0 normal: a bouncing ball with a short arc
  P('M9,34 Q16,10 24,22', st('#6b5a8a', 2.2) + ' stroke-dasharray="2.5 3"') + E(24, 38, 8, 2, 'fill="#4a3a6a" opacity="0.25"') +
  Ci(29, 26, 8, fs_('#3b6fd8', '#1d3a7a', 2.4)) + P('M23.5,20.5 L33.5,31', st('#f6d02e', 3.2)) + P('M26.5,18.6 L35.8,28.3', st('#e8453c', 2.4)) +   // our own diagonal-striped toy ball (no red/white halves)
  P('M22,23.6 L31.6,33.4', st('#e8453c', 2.4)) + Ci(29, 26, 8, 'fill="none" stroke="#1d3a7a" stroke-width="2.4"') + Ci(25.6, 22.6, 1.5, 'fill="#ffffff"'),
  // 1 floaty: a white feather drifting
  `<g transform="rotate(-35 24 24)">` + P('M24,7 C33,13 33,30 24,40 C15,30 15,13 24,7 Z', fs_('#ffffff', '#6b7a9a', 2.2)) +
  P('M24,10 L24,43', st('#6b7a9a', 1.8)) + P('M24,18 L29,15 M24,24 L30,21 M24,30 L29,27 M24,18 L19,15 M24,24 L18,21 M24,30 L19,27', st('#b8c4dc', 1.4)) + '</g>' +
  P('M33,36 q3,-2 6,0', st('#6b7a9a', 1.6) + ' opacity="0.7"'),
  // 2 heavy: a wooden block with down motion lines
  P('M15,8 L15,14 M24,6 L24,12 M33,8 L33,14', st('#6b5a8a', 2.4)) +
  P(poly([[13, 21], [17, 17], [37, 17], [33, 21]]), fs_('#ffe07a', '#6b4a08', 2.2)) + P(poly([[33, 21], [37, 17], [37, 34], [33, 38]]), fs_('#c98a12', '#6b4a08', 2.2)) +
  `<rect x="13" y="21" width="20" height="17" rx="2" ${fs_('#f6b928', '#6b4a08', 2.2)}/>` + Ci(23, 29.5, 3.4, fs_('#fff4dc', '#6b4a08', 1.4)) +
  E(24, 41, 11, 1.8, 'fill="#4a3a6a" opacity="0.35"'),
  // 3 moon: crescent moon with a little hop arc
  P('M27,10 A14,14 0 1 0 38,32 A11,11 0 1 1 27,10 Z', fs_('#ffe58a', '#9a7a12', 2.2)) + Ci(21, 28, 1.6, 'fill="#e8c860"') + Ci(19, 20, 1.2, 'fill="#e8c860"') +
  P('M8,38 Q14,26 20,38', st('#6b5a8a', 2) + ' stroke-dasharray="2 2.6"') + sparkle(36, 12, 3.4, '#ffd23f'),
];
grav.forEach((g, i) => write(`grav_${i}.svg`, svg(48, 48, badge(g))));

/* ================================ ICON ================================ */
function icon() {
  let s = `<defs><linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4aa0"/><stop offset="1" stop-color="#1d2350"/></linearGradient>` +
    `<radialGradient id="igl" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffd36b"/></radialGradient></defs>`;
  s += `<rect width="256" height="256" fill="url(#ibg)"/>`;
  s += Ci(128, 132, 112, 'fill="#f4ead0" stroke="#3ee0b0" stroke-width="8"');
  // toy blocks in the badge corners + glow star
  s += cube(26, 168, 44, 40, BL.red, 'dot', -8, 10) + cube(186, 172, 42, 38, BL.blue, 'star', 6, 10);
  s += P(starPath(200, 54, 24, 11), fs_('#ffe58a', '#b88a12', 4)) + Ci(200, 54, 32, 'fill="#ffe58a" opacity="0.18"');
  s += sparkle(48, 70, 9, '#ffd23f');
  const L = OT.line;
  // ears
  [[76, 72], [180, 72]].forEach(([x, y]) => { s += Ci(x, y, 17, fs_(OT.fur, L, 6)) + Ci(x, y + 2, 8.5, `fill="${OT.nose}" opacity="0.7"`); });
  // head
  s += `<clipPath id="ih"><ellipse cx="128" cy="118" rx="72" ry="58"/></clipPath>`;
  s += E(128, 118, 72, 58, `fill="${OT.shade}"`) + `<g clip-path="url(#ih)">` + E(122, 110, 70, 55, `fill="${OT.fur}"`) +
    // cream lower face / muzzle
    P('M56,142 C62,112 96,112 128,124 C160,112 194,112 200,142 C196,180 60,180 56,142 Z', `fill="${OT.cream}"`) + '</g>' +
    E(128, 118, 72, 58, st(L, 6)) + E(92, 80, 18, 8, `transform="rotate(-22 92 80)" fill="${OT.hi}"`);
  // eyes
  [[100, 112], [156, 112]].forEach(([x, y]) => { s += E(x, y, 13, 15, `fill="${OT.eye}"`) + Ci(x - 4, y - 6, 5.2, 'fill="#ffffff"') + Ci(x + 4.6, y + 5, 2.4, 'fill="#ffffff"'); });
  // nose, mouth, whisker dots, blush, whiskers
  s += P('M114,132 Q128,124 142,132 Q140,143 128,145 Q116,143 114,132 Z', fs_(OT.nose, L, 3.5)) + E(123, 132, 4, 2, 'fill="#ffffff" opacity="0.8"');
  s += P('M128,145 L128,151 M114,150 Q121,159 128,151 Q135,159 142,150', st(L, 4));
  [[104, 146], [98, 140], [152, 146], [158, 140]].forEach(([x, y]) => { s += Ci(x, y, 2, `fill="${OT.creamD}"`); });
  s += E(80, 140, 10, 6, `fill="${OT.blush}" opacity="0.8"`) + E(176, 140, 10, 6, `fill="${OT.blush}" opacity="0.8"`);
  s += P('M62,138 L36,132 M62,146 L36,150 M194,138 L220,132 M194,146 L220,150', st(L, 3));
  // scarf
  s += P('M66,166 Q128,192 190,166 L194,184 Q128,214 62,184 Z', fs_(OT.mint, L, 5)) + P('M64,176 Q128,204 192,176', st(OT.coral, 5));
  s += P('M168,186 L190,232 L170,236 L156,192 Z', fs_(OT.mint, L, 5)) + P('M178,212 L186,229 L174,231 L168,214 Z', `fill="${OT.coral}"`) + E(166, 186, 14, 11, fs_(OT.mint, L, 5));
  // acorn held in two cream paws
  s += `<g transform="translate(96,180) scale(1.0)">` + acorn(0, 'ia') + '</g>';
  s += E(98, 222, 14, 11, fs_(OT.cream, L, 5)) + E(158, 222, 14, 11, fs_(OT.cream, L, 5));
  s += P('M92,218 L92,224 M100,216 L100,222 M152,218 L152,224 M160,216 L160,222', st(OT.creamD, 2.6));
  return s;
}
write('icon.svg', svg(256, 256, icon()));

console.log('wrote', files.length, 'files to', OUT);
