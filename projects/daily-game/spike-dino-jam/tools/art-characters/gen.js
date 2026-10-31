// Generates Spike's Dino Jam character + item SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
// Technique: each silhouette is drawn twice — first as a fat stroke in the dark "line" tone
// (gives a clean ~3 px outline around the UNION of shapes), then the flat fills on top.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);
const f1 = n => Math.round(n * 10) / 10;
const rad = d => d * Math.PI / 180;

// 4-point sparkle (curved star)
const sparkle = (x, y, s, c = '#fffbe0', line = '#c7861a', sw = 1.2) =>
  `<path d="M${x},${y - s} C${f1(x + s * .18)},${f1(y - s * .2)} ${f1(x + s * .2)},${f1(y - s * .18)} ${x + s},${y} C${f1(x + s * .2)},${f1(y + s * .18)} ${f1(x + s * .18)},${f1(y + s * .2)} ${x},${y + s} ` +
  `C${f1(x - s * .18)},${f1(y + s * .2)} ${f1(x - s * .2)},${f1(y + s * .18)} ${x - s},${y} C${f1(x - s * .2)},${f1(y - s * .18)} ${f1(x - s * .18)},${f1(y - s * .2)} ${x},${y - s} Z" fill="${c}"${line ? ` stroke="${line}" stroke-width="${sw}"` : ''} ${R}/>`;

// generic primitives -> element strings with extra attrs
const el = {
  c: (s, a) => `<circle cx="${s[1]}" cy="${s[2]}" r="${s[3]}" ${a}/>`,
  e: (s, a) => `<ellipse cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"${s[5] ? ` transform="rotate(${s[5]} ${s[1]} ${s[2]})"` : ''} ${a}/>`,
  p: (s, a) => `<path d="${s[1]}" ${a}/>`,
};
const shp = (s, a) => el[s[0]](s, a);
const outline = (shapes, line, w = 6) => shapes.map(s => shp(s, `fill="${line}" stroke="${line}" stroke-width="${w}" ${R}`)).join('');
const fills = (shapes, fill) => shapes.map(s => shp(s, `fill="${fill}"`)).join('');
const clipDef = (id, shapes) => `<clipPath id="${id}">${shapes.map(s => shp(s, '')).join('')}</clipPath>`;
// thick outlined stroke (limbs, stems)
const limb = (d, fill, line, w = 5, ow = 3) =>
  `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w + ow * 2}" ${R}/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" ${R}/>`;

/* ============================== SPIKE ============================== */
const S = {
  spine: '#c8783a', spineDk: '#a65a24', spineHi: '#e9a061', line: '#6b3415',
  face: '#fbe2bb', faceSh: '#eec18f', tummy: '#fff0d6', skin: '#e2a468',
  eye: '#2d1a10', blush: '#ff8f9c', mouth: '#c2374f', tongue: '#ff9db0', nose: '#3b2316',
  cap: '#36a3dc', capSh: '#2380b8', capLine: '#1c5584', capHi: '#9fdcff',
  shoe: '#ec4a40', shoeSh: '#c4302b', shoeLine: '#7d1d1b', sole: '#ffffff',
};
const SP_C = [46, 51]; // spine fan centre
// soft teardrop spines: base near the fan centre, rounded tip swept backwards (never sharp)
function tufts(n, a0, a1, rb, rtMax, w, sweep) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = a0 + (a1 - a0) * u, at = a + sweep, rt = rtMax * (.72 + .28 * Math.sin(Math.PI * Math.min(1, u * 1.25)));
    const d = [Math.cos(rad(a)), Math.sin(rad(a))], pp = [-d[1], d[0]];
    const dt = [Math.cos(rad(at)), Math.sin(rad(at))], pt = [-dt[1], dt[0]];
    const bL = [SP_C[0] + rb * d[0] + w * pp[0], SP_C[1] + rb * d[1] + w * pp[1]];
    const bR = [SP_C[0] + rb * d[0] - w * pp[0], SP_C[1] + rb * d[1] - w * pp[1]];
    const T = [SP_C[0] + rt * dt[0], SP_C[1] + rt * dt[1]];
    const k = w * .75, P = q => f1(q[0]) + ',' + f1(q[1]);
    out.push(['p', `M${P(bL)} C${P([bL[0] + (T[0] - bL[0]) * .55 + pp[0] * w * .5, bL[1] + (T[1] - bL[1]) * .55 + pp[1] * w * .5])} ${P([T[0] + pt[0] * k, T[1] + pt[1] * k])} ${P(T)} ` +
      `C${P([T[0] - pt[0] * k, T[1] - pt[1] * k])} ${P([bR[0] + (T[0] - bR[0]) * .55 - pp[0] * w * .5, bR[1] + (T[1] - bR[1]) * .55 - pp[1] * w * .5])} ${P(bR)} Z`, `M${P([SP_C[0] + (rb + 6) * d[0] + pp[0] * w * .35, SP_C[1] + (rb + 6) * d[1] + pp[1] * w * .35])} L${P([SP_C[0] + (rt - 7) * dt[0] + pt[0] * w * .3, SP_C[1] + (rt - 7) * dt[1] + pt[1] * w * .3])}`]);
  }
  return out;
}
const TUFT_BACK = tufts(9, -142, 118, 13, 45, 8.8, -20);
const TUFT_FRONT = tufts(8, -128, 100, 11, 38, 8.2, -24);
const SPINE_CORE = [['e', 45, 52, 22, 24]];
const HEAD = [['c', 56, 41, 20.5]];
const SNOUT = [['e', 72.5, 47.5, 11.5, 8, -12]];
const TORSO = [['e', 51, 69, 15.5, 13.5]];
const HEAD_ALL = [...HEAD, ...SNOUT];

function sneaker(cx, dy = 0, rot = 0) {
  const y = 88 + dy;
  const d = `M${cx - 7},${y} L${cx + 6},${y} C${cx + 11},${y} ${cx + 11},${y - 6.5} ${cx + 5},${y - 7.5} L${cx - 5},${y - 8.5} C${cx - 9},${y - 8.5} ${cx - 10},${y} ${cx - 7},${y} Z`;
  const tr = rot ? ` transform="rotate(${rot} ${cx} ${y - 4})"` : '';
  return `<g${tr}>
<path d="${d}" fill="${S.shoe}" stroke="${S.shoeLine}" stroke-width="2.6" ${R}/>
<path d="M${cx - 8},${y - 2.2} L${cx + 8.6},${y - 2.2}" stroke="${S.sole}" stroke-width="2.4" ${R}/>
<path d="M${cx + 3},${y - 7.4} C${cx + 6.5},${y - 6.8} ${cx + 8.5},${y - 5.6} ${cx + 9},${y - 4}" fill="none" stroke="${S.shoeSh}" stroke-width="1.6" ${R}/>
<circle cx="${cx - 1}" cy="${y - 5.6}" r="1.3" fill="#fff"/></g>`;
}
function legs(jump) {
  if (jump) return `${limb('M44,78 L41,82', S.skin, S.line, 5, 2.6)}${limb('M57,78 L60,82', S.skin, S.line, 5, 2.6)}
${sneaker(40, -5, -12)}${sneaker(60, -4, 10)}`;
  return `${limb('M44,78 L42,82', S.skin, S.line, 5, 2.6)}${limb('M57,78 L58,82', S.skin, S.line, 5, 2.6)}
${sneaker(41, 0)}${sneaker(59, 0)}`;
}
function spikeBody(id, backArm = '') {
  const back = [...SPINE_CORE, ...TUFT_BACK];
  const tuftEl = (t, fill, hi) => `<path d="${t[1]}" fill="${fill}" stroke="${S.line}" stroke-width="2.4" ${R}/>`;
  return `<defs>${clipDef(id + 'h', HEAD)}${clipDef(id + 't', TORSO)}</defs>
${outline(back, S.line)}${fills(SPINE_CORE, S.spineDk)}
${TUFT_BACK.map(t => tuftEl(t, S.spineDk)).join('')}
${TUFT_FRONT.map(t => tuftEl(t, S.spine)).join('')}
${TUFT_FRONT.map(t => `<path d="${t[2]}" stroke="${S.spineHi}" stroke-width="2.2" ${R}/>`).join('')}
${backArm}
${outline(TORSO, S.line)}${fills(TORSO, S.face)}
<g clip-path="url(#${id}t)"><ellipse cx="57" cy="72" rx="10" ry="10" fill="${S.tummy}"/><path d="M34,74 C42,82 56,84 68,76 L68,90 L34,90 Z" fill="${S.faceSh}" opacity=".7"/></g>
`;
}
function spikeHead(id) {
  return `${outline(HEAD_ALL, S.line)}${fills(HEAD_ALL, S.face)}
<g clip-path="url(#${id}h)">
  <path d="M60,52 C66,58 72,60 78,58 L78,64 L40,64 Z" fill="${S.faceSh}" opacity=".8"/>
  <path d="M30,14 L64,14 C61,19 57,21 55,24 C58,27 54,30 50,31 C53,35 48,39 45,40 C48,44 44,48 41,50 C43,54 40,58 38,64 L30,64 Z" fill="${S.spine}" stroke="${S.line}" stroke-width="2.4" ${R}/>
  <path d="M44,22 C47,19 51,18 54,18.5" fill="none" stroke="${S.spineHi}" stroke-width="2.2" ${R}/>
</g>
<path d="M66,55.5 C71,57.4 78,56.6 82,53" fill="none" stroke="${S.faceSh}" stroke-width="2" ${R}/>
<circle cx="83.6" cy="45" r="3.8" fill="${S.nose}"/><circle cx="82.6" cy="43.8" r="1.2" fill="#fff" opacity=".9"/>
<!-- ear -->
<circle cx="66" cy="23.5" r="4.6" fill="${S.skin}" stroke="${S.line}" stroke-width="2.4"/><circle cx="66.4" cy="24" r="2.2" fill="${S.blush}"/>
<!-- backwards cap -->
<path d="M40,27 C34,26.6 27,28 24,31 C27,32.6 33,32.4 41,31 Z" fill="${S.capSh}" stroke="${S.capLine}" stroke-width="2.6" ${R}/>
<path d="M38.6,30 C38,20 46,14 54,14 C61,14 65.5,19 65,27 C57,30.5 46,31.5 38.6,30 Z" fill="${S.cap}" stroke="${S.capLine}" stroke-width="2.6" ${R}/>
<path d="M42.6,24 C44,19.4 48,17 52,16.6" fill="none" stroke="${S.capHi}" stroke-width="2.2" ${R}/>
<path d="M53,14.6 C53.6,20 53.4,25 52.4,30" fill="none" stroke="${S.capSh}" stroke-width="1.6" ${R}/>
<circle cx="53.6" cy="14.2" r="2" fill="${S.capSh}" stroke="${S.capLine}" stroke-width="1.4"/>`;
}
const EYE = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${S.eye}"/>
<circle cx="${f1(cx + rx * .32)}" cy="${f1(cy - ry * .42)}" r="${f1(rx * .5)}" fill="#fff"/><circle cx="${f1(cx - rx * .35)}" cy="${f1(cy + ry * .45)}" r="${f1(rx * .22)}" fill="#fff" opacity=".9"/>`;
const blush = (k = 1) => `<ellipse cx="70.5" cy="50" rx="${f1(4.2 * k)}" ry="${f1(2.5 * k)}" fill="${S.blush}" opacity=".8"/><ellipse cx="50.5" cy="49" rx="${f1(2.8 * k)}" ry="${f1(2 * k)}" fill="${S.blush}" opacity=".7"/>`;
function spiral(cx, cy, r, turns = 2.2) {
  let d = '';
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, a = t * turns * Math.PI * 2, rr = r * t;
    d += (i ? ' L' : 'M') + f1(cx + rr * Math.cos(a)) + ',' + f1(cy + rr * Math.sin(a));
  }
  return `<path d="${d}" fill="none" stroke="${S.eye}" stroke-width="1.9" ${R}/>`;
}
const SPIKE_FACE = {
  idle: `${EYE(55, 38.5, 3.7, 5.2)}${EYE(67, 38, 4.4, 5.9)}${blush()}
<path d="M72,52.4 C74.4,54.8 78,54.6 80,52" fill="none" stroke="${S.eye}" stroke-width="2.2" ${R}/>`,
  happy: `<path d="M51.5,39.5 C52.6,34.6 57.6,34.6 58.6,39.5" fill="none" stroke="${S.eye}" stroke-width="2.8" ${R}/>
<path d="M63,39 C64.2,33.4 70,33.4 71.2,39" fill="none" stroke="${S.eye}" stroke-width="3" ${R}/>${blush(1.15)}
<path d="M70.4,51 C71.5,58.6 79.6,58.6 81.4,50.4 C78,51.6 74,51.8 70.4,51 Z" fill="${S.mouth}" stroke="${S.eye}" stroke-width="1.8" ${R}/>
<path d="M73,54.6 C74.8,53.4 77.4,53.4 79,54.4 C77.6,56.4 74.6,56.6 73,54.6 Z" fill="${S.tongue}"/>`,
  ouch: `${spiral(55, 38.5, 4.4)}${spiral(67, 38, 5.2)}${blush(.9)}
<path d="M70.6,53.6 C72,51.6 73.4,51.6 74.6,53.4 C75.8,55.2 77,55.2 78.2,53.4 C79.2,52 80.2,51.8 81.2,52.8" fill="none" stroke="${S.eye}" stroke-width="2" ${R}/>
${sparkle(30, 15, 4.2, '#fff6b0', '#c7861a', 1.1)}${sparkle(78, 13, 3.4, '#fff6b0', '#c7861a', 1.1)}${sparkle(88, 26, 2.6, '#fff6b0', '#c7861a', 1)}`,
  jump: `${EYE(55, 38, 4, 5.6)}${EYE(67, 37.5, 4.8, 6.4)}${blush(1.1)}
<path d="M51,30.6 C53,29 56.6,28.8 58.6,30 M63.6,29.6 C66,28 69.6,28.2 71.6,30" fill="none" stroke="${S.line}" stroke-width="1.8" ${R}/>
<ellipse cx="76" cy="54" rx="3.6" ry="3.9" fill="${S.mouth}" stroke="${S.eye}" stroke-width="1.8"/>
<ellipse cx="76.2" cy="55.6" rx="2" ry="1.3" fill="${S.tongue}"/>`,
};
const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="3.9" fill="${S.skin}" stroke="${S.line}" stroke-width="2.6"/>`;
const arm = (d, hx, hy) => limb(d, S.skin, S.line, 4.6, 2.6) + hand(hx, hy);
// [behind body, in front]
const SPIKE_ARMS = {
  idle: [arm('M42,62 C38,65 36,68 35,71', 35, 71.5), arm('M60,62 C64,64 66,67 67,70', 67.4, 70.6)],
  happy: [arm('M42,61 C36,58 31,53 29,47', 28.5, 46), arm('M60,62 C66,63 72,61 76,57', 77, 56.5)],
  ouch: [arm('M42,62 C36,64 31,66 27,63', 26.5, 62.5), arm('M60,63 C66,66 70,70 72,75', 72.4, 75.6)],
  jump: [arm('M42,60 C35,56 31,50 29,43', 28.6, 42), arm('M60,61 C67,62 74,62 80,60', 81, 59.6)],
};
for (const f of Object.keys(SPIKE_FACE)) {
  const id = 'k' + f[0];
  const [back, front] = SPIKE_ARMS[f];
  write(`spike_${f}.svg`, svg(100, 100, `${spikeBody(id, back)}\n${legs(f === 'jump')}\n${spikeHead(id)}\n${SPIKE_FACE[f]}\n${front}`));
}
const spikeInner = (f) => { const [b, fr] = SPIKE_ARMS[f]; const id = 'i' + f[0]; return `${spikeBody(id, b)}${legs(f === 'jump')}${spikeHead(id)}${SPIKE_FACE[f]}${fr}`; };

/* ============================== BOARD (top view) ============================== */
const BD = { deck: '#7d5ce0', deckSh: '#6243bf', line: '#3a2479', stripe: '#ffd34d', grip: '#5a3cb0', wheel: '#ffe58a', wheelLine: '#9a7413', truck: '#c9cfdc' };
const DECK = 'M16,8 L80,8 C90,8 93,14 93,20 C93,26 90,32 80,32 L16,32 C6,32 3,26 3,20 C3,14 6,8 16,8 Z';
let grip = '';
for (let x = 14; x <= 82; x += 6) for (let y = 13; y <= 28; y += 5) grip += `<circle cx="${x + ((y / 5) % 2 ? 3 : 0)}" cy="${y}" r=".9" fill="${BD.grip}"/>`;
write('board.svg', svg(96, 40, `<defs><clipPath id="dk"><path d="${DECK}"/></clipPath></defs>
${[[22, 4.6], [74, 4.6], [22, 35.4], [74, 35.4]].map(([x, y]) => `<rect x="${x - 5}" y="${y - 3.6}" width="10" height="7.2" rx="3.2" fill="${BD.wheel}" stroke="${BD.wheelLine}" stroke-width="2"/>`).join('')}
<path d="${DECK}" fill="${BD.deck}" stroke="${BD.line}" stroke-width="3" ${R}/>
<g clip-path="url(#dk)">${grip}
  <path d="M0,26 L96,26 L96,40 L0,40 Z" fill="${BD.deckSh}" opacity=".7"/>
  <path d="M30,8 L40,8 L36,32 L26,32 Z M58,8 L68,8 L64,32 L54,32 Z" fill="${BD.stripe}"/>
  <path d="M10,14 C12,11 15,10.4 18,10.4 L44,10.4" fill="none" stroke="#b7a2ff" stroke-width="2" ${R}/>
</g>
<path d="M85,14 C88,17 88,23 85,26" fill="none" stroke="${BD.stripe}" stroke-width="2.4" ${R}/>
<path d="${DECK}" fill="none" stroke="${BD.line}" stroke-width="3" ${R}/>`));

/* ============================== NOTES ============================== */
const NC = [
  { fill: '#ff7fb0', sh: '#e9578f', line: '#a12a5d', hi: '#ffd6e7' }, // pink
  { fill: '#5ec2ff', sh: '#3a9ce2', line: '#1d5996', hi: '#d8f2ff' }, // sky
  { fill: '#5edfa6', sh: '#33b781', line: '#156b4a', hi: '#d6fbe9' }, // mint
  { fill: '#ffb23f', sh: '#f0891c', line: '#9a4e0b', hi: '#ffeab8' }, // orange
];
const GOLD = { fill: '#ffd23f', sh: '#eaa915', line: '#8f5c08', hi: '#fff7c8' };
// face drawn on a note head centred cx,cy (head tilt -20)
const noteFace = (cx, cy, C, s = 1) => `<g transform="rotate(-18 ${cx} ${cy})">
<ellipse cx="${f1(cx - 3.2 * s)}" cy="${f1(cy - 0.8 * s)}" rx="${f1(1.5 * s)}" ry="${f1(1.9 * s)}" fill="${C.line}"/><ellipse cx="${f1(cx + 3.2 * s)}" cy="${f1(cy - 0.8 * s)}" rx="${f1(1.5 * s)}" ry="${f1(1.9 * s)}" fill="${C.line}"/>
<circle cx="${f1(cx - 2.8 * s)}" cy="${f1(cy - 1.5 * s)}" r="${f1(.6 * s)}" fill="#fff"/><circle cx="${f1(cx + 3.6 * s)}" cy="${f1(cy - 1.5 * s)}" r="${f1(.6 * s)}" fill="#fff"/>
<path d="M${f1(cx - 1.8 * s)},${f1(cy + 2 * s)} C${f1(cx - .8 * s)},${f1(cy + 3.6 * s)} ${f1(cx + .8 * s)},${f1(cy + 3.6 * s)} ${f1(cx + 1.8 * s)},${f1(cy + 2 * s)}" fill="none" stroke="${C.line}" stroke-width="${f1(1.3 * s)}" ${R}/>
<ellipse cx="${f1(cx - 5.6 * s)}" cy="${f1(cy + 1.6 * s)}" rx="${f1(1.6 * s)}" ry="${f1(1 * s)}" fill="#ff5f8c" opacity=".55"/><ellipse cx="${f1(cx + 5.6 * s)}" cy="${f1(cy + 1.6 * s)}" rx="${f1(1.6 * s)}" ry="${f1(1 * s)}" fill="#ff5f8c" opacity=".55"/></g>`;
// a note = heads + stems (thick lines) + flags/beam; returns full inner markup
function note(C, heads, stems, extras, id) {
  const H = heads.map(([x, y, rx, ry]) => ['e', x, y, rx, ry, -20]);
  const stemD = stems.map(([x, y0, y1]) => `M${x},${y0} L${x},${y1}`).join(' ');
  const X = extras.map(d => ['p', d]);
  const all = [...H, ...X];
  return `<defs>${clipDef(id, H)}</defs>
<path d="${stemD}" stroke="${C.line}" stroke-width="10.5" ${R}/>
${outline(all, C.line, 6)}
<path d="${stemD}" stroke="${C.fill}" stroke-width="4.6" ${R}/>
${fills(all, C.fill)}
<g clip-path="url(#${id})">${heads.map(([x, y, rx, ry]) => `<ellipse cx="${x + rx * .45}" cy="${y + ry * .7}" rx="${rx}" ry="${ry * .7}" fill="${C.sh}" transform="rotate(-20 ${x} ${y})"/>`).join('')}</g>
${heads.map(([x, y, rx, ry]) => `<ellipse cx="${f1(x - rx * .45)}" cy="${f1(y - ry * .5)}" rx="${f1(rx * .32)}" ry="${f1(ry * .2)}" fill="${C.hi}" transform="rotate(-28 ${f1(x - rx * .45)} ${f1(y - ry * .5)})"/>`).join('')}
${stems.map(([x, y0, y1]) => `<path d="M${x - .9},${y1 + 3} L${x - .9},${y0 - 6}" stroke="${C.hi}" stroke-width="1.4" opacity=".8" ${R}/>`).join('')}
${heads.map(([x, y, rx]) => noteFace(x, y + .4, C, rx / 10)).join('')}`;
}
const FLAG_A = 'M27,7 C30,12 38,14.5 39,23 C39.4,26.6 37.6,29.6 35.6,31 C36.6,25.4 33,21.4 27,20 Z';
const FLAG_B = 'M27,7 C31,9 38,10 40,16.6 C41.4,21 39.6,25.6 36.6,27.6 C37.2,22 33.4,18.6 27,18.4 Z';
const NOTE_INNER = [
  (id, C) => note(C, [[17.5, 35, 10.4, 8.2]], [[27, 34, 7]], [FLAG_A], id),
  (id, C) => note(C, [[19, 35, 11, 8.6]], [[29, 33.4, 6]], [], id),
  (id, C) => note(C, [[12, 36.5, 8.6, 6.9], [34, 33, 8.6, 6.9]], [[19.8, 35, 11], [41.8, 31.5, 7.5]], ['M17,8.4 L44.6,4 L44.6,11 L17,15.4 Z'], id),
  (id, C) => note(C, [[17.5, 35, 10.4, 8.2]], [[27, 34, 7]], [FLAG_B, 'M27,15 C31,17 36,17.4 37.4,23 C37.8,25 37,27 35.6,28.2 C35.4,25 32,22.6 27,22.4 Z'], id),
];
NOTE_INNER.forEach((fn, i) => write(`note_${i}.svg`, svg(48, 48, fn('n' + i, NC[i]))));
write('note_gold.svg', svg(48, 48, `${NOTE_INNER[2]('ng', GOLD)}
${sparkle(6, 10, 4.6, '#fffbe6', GOLD.line, 1.1)}${sparkle(43, 41, 3.6, '#fffbe6', GOLD.line, 1.1)}${sparkle(30, 19.5, 2.4, '#ffffff', null)}`));

/* ============================== MUMBLES (pterodactyl) ============================== */
const M = {
  body: '#b996ec', sh: '#9a74d6', line: '#55388f', belly: '#f6eaff', bellySh: '#e2cdf7',
  wing: '#d6bdf8', wingSh: '#bf9eee', crest: '#ff9cc4', crestSh: '#ec74a6',
  beak: '#ffc77a', beakSh: '#f2a64b', beakLine: '#9e5f22', cheek: '#ff97bd', eye: '#2a1b48', foot: '#ffb85a',
};
const mx = x => f1(140 - x);
// wing: shoulder, wrist, tip, trailing points back to body; mirrored for the right side
const WINGS = {
  fly1: { S: [58, 55], W: [36, 30], T: [10, 13], trail: [[18, 33], [30, 42], [42, 56], [56, 68]] },
  fly2: { S: [57, 57], W: [33, 63], T: [9, 82], trail: [[22, 87], [35, 84], [46, 79], [57, 73]] },
  throw: { S: [57, 56], W: [33, 47], T: [20, 66], trail: [[28, 72], [38, 73], [48, 71], [57, 66]] },
};
function wingPath(w, flip) {
  const P = ([x, y]) => `${flip ? mx(x) : x},${y}`;
  const pts = [w.T, ...w.trail];
  let d = `M${P(w.S)} Q${P([(w.S[0] + w.W[0]) / 2, Math.min(w.S[1], w.W[1]) - 4])} ${P(w.W)} L${P(w.T)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    // scallop: control point pulled toward the wrist (membrane sags inward)
    const c = [(a[0] + b[0]) / 2 + (w.W[0] - (a[0] + b[0]) / 2) * .28, (a[1] + b[1]) / 2 + (w.W[1] - (a[1] + b[1]) / 2) * .28];
    d += ` Q${P(c)} ${P(b)}`;
  }
  return d + ' Z';
}
function wing(w, flip) {
  const d = wingPath(w, flip);
  const P = ([x, y]) => `${flip ? mx(x) : x},${y}`;
  const fingers = w.trail.slice(0, 3).map(t => `M${P(w.W)} L${P([(w.W[0] + t[0]) / 2 + (t[0] - w.W[0]) * .2, (w.W[1] + t[1]) / 2 + (t[1] - w.W[1]) * .2])}`).join(' ');
  return `<path d="${d}" fill="${M.wing}" stroke="${M.line}" stroke-width="3" ${R}/>
<path d="${fingers}" fill="none" stroke="${M.wingSh}" stroke-width="2.2" ${R}/>
${limb(`M${P(w.S)} Q${P([(w.S[0] + w.W[0]) / 2, Math.min(w.S[1], w.W[1]) - 4])} ${P(w.W)} L${P(w.T)}`, M.body, M.line, 4.4, 2.4)}
<circle cx="${flip ? mx(w.W[0]) : w.W[0]}" cy="${w.W[1]}" r="3.4" fill="${M.belly}" stroke="${M.line}" stroke-width="2"/>`;
}
const M_HEAD = [['c', 70, 38, 20], ['c', 55.5, 45, 8.5], ['c', 84.5, 45, 8.5]];
const M_BODY = [['e', 70, 64, 15, 14.5]];
const CREST = 'M64,21.6 C58,15 46,10.6 33,11.6 C36,17.4 45,23.6 58,27 Z';
const TAIL = 'M76,74 C82,80 86,84 92,84.6 C89.6,81 87,77 82,72 Z';
function mumbles(frame) {
  const w = WINGS[frame], fwd = frame === 'throw';
  const wings = wing(w, false) + wing(w, true);
  const body = `<path d="${TAIL}" fill="${M.sh}" stroke="${M.line}" stroke-width="2.6" ${R}/>
<path d="${CREST}" fill="${M.crest}" stroke="${M.line}" stroke-width="2.8" ${R}/>
<path d="M58,22 C52,18 44,15.6 37,14.6" fill="none" stroke="#ffd0e3" stroke-width="2" ${R}/>
<defs>${clipDef('mb' + frame, M_BODY)}${clipDef('mh' + frame, M_HEAD)}</defs>
${outline(M_BODY, M.line)}${fills(M_BODY, M.body)}
<g clip-path="url(#mb${frame})"><ellipse cx="70" cy="68" rx="10" ry="10.5" fill="${M.belly}"/><path d="M50,70 C58,80 82,80 90,70 L90,82 L50,82 Z" fill="${M.sh}" opacity=".55"/></g>
${['M64,77.4 L62,82.4 M64,77.4 L66.4,82.6', 'M76,77.4 L73.6,82.6 M76,77.4 L78,82.4'].map(d => limb(d, M.foot, M.line, 2.6, 2)).join('')}
${outline(M_HEAD, M.line)}${fills(M_HEAD, M.body)}
<g clip-path="url(#mh${frame})"><path d="M44,48 C52,60 88,60 96,48 L96,62 L44,62 Z" fill="${M.sh}" opacity=".6"/>
  <ellipse cx="70" cy="50" rx="13" ry="7" fill="${M.belly}" opacity=".9"/></g>
<path d="M58,23.6 C61,20.6 65,19.4 69,19.4" fill="none" stroke="#e6d6ff" stroke-width="2.4" ${R}/>`;
  const face = {
    fly1: `${eyeM(61.5, 37)}${eyeM(78.5, 37)}`,
    fly2: `${eyeM(61.5, 37.6)}${eyeM(78.5, 37.6)}`,
    throw: `<path d="M56.4,37.4 C58.6,40.4 64.6,40.4 66.6,37.4 M73.4,37.4 C75.4,40.4 81.4,40.4 83.6,37.4" fill="none" stroke="${M.eye}" stroke-width="2.8" ${R}/>`,
  }[frame];
  const brows = frame === 'throw'
    ? `<path d="M55,30 L66,33.6 M85,30 L74,33.6" stroke="${M.line}" stroke-width="3" ${R}/>`
    : `<path d="M55,28.4 C59,28.6 63,29.6 66,31.4 M85,28.4 C81,28.6 77,29.6 74,31.4" fill="none" stroke="${M.line}" stroke-width="2.8" ${R}/>`;
  const cheeks = `<circle cx="55.5" cy="46" r="${fwd ? 6 : 5}" fill="${M.cheek}" opacity=".75"/><circle cx="84.5" cy="46" r="${fwd ? 6 : 5}" fill="${M.cheek}" opacity=".75"/>
<path d="M51,43.6 C52,42 53.6,41.2 55.2,41 M89,43.6 C88,42 86.4,41.2 84.8,41" fill="none" stroke="#fff" stroke-width="1.5" opacity=".8" ${R}/>`;
  // small round beak, no teeth; pouty (throw = "hmph", pushed up and to the side)
  const beak = fwd
    ? `<path d="M64,46.4 C66,44.6 74,44.6 76,46.4 C76.6,50 73.6,52.4 70,52.4 C66.4,52.4 63.4,50 64,46.4 Z" fill="${M.beak}" stroke="${M.beakLine}" stroke-width="2.2" ${R}/>
<path d="M65.6,49 C68,48 72,48 74.4,49.4" fill="none" stroke="${M.beakLine}" stroke-width="1.6" ${R}/>
<g fill="#ffffff" stroke="${M.wingSh}" stroke-width="1.4"><circle cx="90" cy="54" r="3"/><circle cx="95.4" cy="51.6" r="3.6"/><circle cx="99.6" cy="55.6" r="2.6"/></g>`
    : `<path d="M63.4,45.6 C66,43.6 74,43.6 76.6,45.6 C77.4,50.4 74,54.6 70,54.6 C66,54.6 62.6,50.4 63.4,45.6 Z" fill="${M.beak}" stroke="${M.beakLine}" stroke-width="2.2" ${R}/>
<path d="M65.2,49.4 C67.6,50.8 72.4,50.8 74.8,49.4" fill="none" stroke="${M.beakLine}" stroke-width="1.6" ${R}/>
<ellipse cx="66.6" cy="46.4" rx="2" ry="1" fill="#fff" opacity=".7"/>`;
  return `${wings}\n${body}${face}${brows}${cheeks}${beak}`;
}
function eyeM(cx, cy) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="5" ry="6.2" fill="${M.eye}"/><circle cx="${f1(cx + 1.6)}" cy="${f1(cy - 2.4)}" r="2.3" fill="#fff"/><circle cx="${f1(cx - 1.6)}" cy="${f1(cy + 2.6)}" r="1" fill="#fff" opacity=".9"/>
<path d="M${cx - 5.6},${cy - 2.6} C${cx - 3},${cy - 4.8} ${cx + 3},${cy - 4.8} ${cx + 5.6},${cy - 2.6} L${cx + 5.6},${cy - 7} L${cx - 5.6},${cy - 7} Z" fill="${M.body}"/>
<path d="M${cx - 5.4},${cy - 2.6} C${cx - 3},${cy - 4.6} ${cx + 3},${cy - 4.6} ${cx + 5.4},${cy - 2.6}" fill="none" stroke="${M.line}" stroke-width="1.6" ${R}/>`;
}
for (const f of ['fly1', 'fly2', 'throw']) write(`ptera_${f}.svg`, svg(140, 100, mumbles(f)));

/* ============================== PILLOW ============================== */
const PL = { fill: '#bfe0ff', sh: '#98c4f2', line: '#4f72ad', dot: '#ffffff', stripe: '#ffc8dc', tuft: '#ffd6e6' };
const PILLOW = 'M11,7 C22,10.6 42,10.6 53,7 C58.6,5.4 60.6,9 58.6,13.6 C55.4,20 55.4,28 58.6,34.4 C60.6,39 58.6,42.6 53,41 C42,37.4 22,37.4 11,41 C5.4,42.6 3.4,39 5.4,34.4 C8.6,28 8.6,20 5.4,13.6 C3.4,9 5.4,5.4 11,7 Z';
let dots = '';
[[16, 16], [28, 14.6], [40, 16], [50, 15], [12, 26], [22, 24.6], [34, 25.4], [46, 24], [16, 33], [28, 33.6], [40, 32.4], [51, 32.6]].forEach(([x, y], i) => {
  dots += `<circle cx="${x}" cy="${y}" r="${i % 3 ? 2.2 : 2.7}" fill="${PL.dot}"/>`;
});
write('pillow.svg', svg(64, 48, `<defs><clipPath id="pl"><path d="${PILLOW}"/></clipPath></defs>
<path d="${PILLOW}" fill="${PL.fill}" stroke="${PL.line}" stroke-width="3" ${R}/>
<g clip-path="url(#pl)">
  <path d="M0,20 C20,18 44,18 64,20 L64,26 C44,24 20,24 0,26 Z" fill="${PL.stripe}"/>
  ${dots}
  <path d="M0,34 C20,30 44,30 64,34 L64,48 L0,48 Z" fill="${PL.sh}" opacity=".75"/>
  <path d="M13,12.6 C20,14 26,14.2 32,14" fill="none" stroke="#fff" stroke-width="2.2" opacity=".9" ${R}/>
</g>
<path d="M12,11.6 C22,14.4 42,14.4 52,11.6 C51,20 51,28 52,36.6 C42,33.6 22,33.6 12,36.6 C13,28 13,20 12,11.6 Z" fill="none" stroke="${PL.line}" stroke-width="1.1" stroke-dasharray="2 2.4" opacity=".55"/>
${[[6.4, 7.4], [57.6, 7.4], [6.4, 40.6], [57.6, 40.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${PL.tuft}" stroke="${PL.line}" stroke-width="2"/>`).join('')}
<path d="${PILLOW}" fill="none" stroke="${PL.line}" stroke-width="3" ${R}/>`));

/* ============================== HUD ============================== */
const HEART = 'M24,41 C14,34 5.4,27 5.4,17.6 C5.4,11 10.4,6.6 16,6.6 C19.6,6.6 22.4,8.6 24,11.4 C25.6,8.6 28.4,6.6 32,6.6 C37.6,6.6 42.6,11 42.6,17.6 C42.6,27 34,34 24,41 Z';
write('heart_full.svg', svg(48, 48, `<defs><clipPath id="hf"><path d="${HEART}"/></clipPath></defs>
<path d="${HEART}" fill="#ff5a78" stroke="#9b1f3e" stroke-width="3.4" ${R}/>
<g clip-path="url(#hf)"><path d="M0,28 C14,36 34,34 48,22 L48,48 L0,48 Z" fill="#e2385c"/></g>
<path d="${HEART}" fill="none" stroke="#9b1f3e" stroke-width="3.4" ${R}/>
<ellipse cx="14.6" cy="15.4" rx="4.6" ry="3" fill="#fff" opacity=".9" transform="rotate(-35 14.6 15.4)"/><circle cx="20.4" cy="12.4" r="1.5" fill="#fff" opacity=".85"/>`));
write('heart_empty.svg', svg(48, 48, `<path d="${HEART}" fill="#f4e4ea" fill-opacity=".85" stroke="#a88e98" stroke-width="3.4" ${R}/>
<path d="M24,35 C17,30 11,25 11,18.4 C11,14.4 13.6,12.2 16.4,12.2" fill="none" stroke="#d4bdc6" stroke-width="2.2" stroke-dasharray="2.6 3" ${R}/>`));

// kickflip button: side-view board tilted, with a curved "flip" arrow over it
const sideBoard = (wheel = BD.wheel) => `<path d="M6,24 C8,27.4 12,28.4 16,28.4 L32,28.4 C36,28.4 40,27.4 42,24" fill="none" stroke="${BD.line}" stroke-width="7.2" ${R}/>
<path d="M6,24 C8,27.4 12,28.4 16,28.4 L32,28.4 C36,28.4 40,27.4 42,24" fill="none" stroke="${BD.deck}" stroke-width="3.6" ${R}/>
<path d="M14,27 L14,30 M34,27 L34,30" stroke="${BD.line}" stroke-width="2.4" ${R}/>
${[14, 34].map(x => `<circle cx="${x}" cy="33" r="3.6" fill="${wheel}" stroke="${BD.wheelLine}" stroke-width="2"/>`).join('')}`;
write('flip.svg', svg(48, 48, `<g transform="rotate(-18 24 28) translate(0 4)">${sideBoard()}</g>
<path d="M9,18 C11,7 31,3 38,13" fill="none" stroke="#7a3f08" stroke-width="7.4" ${R}/>
<path d="M9,18 C11,7 31,3 38,13" fill="none" stroke="#ffb33f" stroke-width="3.8" ${R}/>
<path d="M33.4,10.4 L41.6,17.4 L42,7 Z" fill="#ffb33f" stroke="#7a3f08" stroke-width="2.6" ${R}/>
<path d="M13,12.8 C16,9.4 20,8 24,7.8" fill="none" stroke="#ffe6b8" stroke-width="1.4" ${R}/>`));

// song bar: a little paper scroll with a staff and a note
write('songbar.svg', svg(64, 64, `<path d="M14,10 L50,10 L50,54 L14,54 Z" fill="#fff4d8" stroke="#8f6326" stroke-width="3" ${R}/>
<path d="M14,40 L50,40 L50,54 L14,54 Z" fill="#f3dfb2"/>
<g stroke="#e0c08a" stroke-width="1.6">${[22, 27, 32, 37, 42].map(y => `<path d="M18,${y} L46,${y}"/>`).join('')}</g>
<path d="M14,10 L50,10 L50,54 L14,54 Z" fill="none" stroke="#8f6326" stroke-width="3" ${R}/>
${[10, 54].map(y => `<rect x="9" y="${y - 4.6}" width="46" height="9.2" rx="4.6" fill="#f1d49a" stroke="#8f6326" stroke-width="3"/><path d="M14,${y - 1.4} L48,${y - 1.4}" stroke="#fff4d8" stroke-width="1.6" ${R}/>`).join('')}
<g transform="translate(15.5 14) scale(.68)">${NOTE_INNER[0]('sb', NC[0])}</g>`));

/* ============================== APP ICON ============================== */
let leaves = '';
for (let i = 0; i < 18; i++) {
  const a = i * 20, x = 128 + 108 * Math.cos(rad(a)), y = 128 + 108 * Math.sin(rad(a));
  leaves += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="22" ry="13" transform="rotate(${a + 90 + 20} ${f1(x)} ${f1(y)})" fill="${i % 2 ? '#4fae4a' : '#3f9a3e'}" stroke="#23632a" stroke-width="4"/>`;
}
const dino = 'M40,196 C44,170 60,160 78,160 C86,160 92,150 92,132 C92,112 96,100 106,98 C116,96 120,104 116,110 C112,114 106,112 104,118 C102,128 104,146 104,164 C112,170 120,182 122,196 Z';
write('icon.svg', svg(256, 256, `<defs><clipPath id="badge"><circle cx="128" cy="128" r="104"/></clipPath></defs>
${leaves}
<circle cx="128" cy="128" r="104" fill="#a6e38a" stroke="#23632a" stroke-width="5"/>
<g clip-path="url(#badge)">
  <path d="M0,170 C60,150 190,150 256,172 L256,256 L0,256 Z" fill="#7dcb68"/>
  <g transform="translate(-14 52) scale(.72)"><path d="${dino}" fill="#58a94f"/><circle cx="101" cy="106" r="3.6" fill="#2f7a31"/></g>
  <path d="M0,200 C70,188 180,190 256,204 L256,256 L0,256 Z" fill="#62b653"/>
  <ellipse cx="132" cy="214" rx="62" ry="9" fill="#3f8f3c" opacity=".45"/>
</g>
<g transform="translate(130 199) scale(3.3) rotate(-4)"><g transform="translate(-24 -26)">${sideBoard()}</g></g>
<g transform="translate(36 38) scale(1.8)">${spikeInner('happy')}</g>
<g transform="translate(176 44) scale(1.3) rotate(12 24 24)">${NOTE_INNER[1]('ic1', NC[1])}</g>
<g transform="translate(30 40) scale(1.1) rotate(-14 24 24)">${NOTE_INNER[0]('ic0', NC[0])}</g>
${sparkle(214, 140, 9, '#fffbe0', '#c7861a', 2)}${sparkle(162, 34, 6, '#fffbe0', '#c7861a', 1.8)}`));

console.log('wrote SVGs to', OUT);
