// Generates Nimbus's Bubble Garden character + item SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
// Contract: docs/DESIGN.md §3 (style) and §4.1 (files, viewBoxes, anchors).
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const f1 = n => Math.round(n * 10) / 10;
const rad = d => d * Math.PI / 180;
const pt = (cx, cy, r, deg) => [f1(cx + r * Math.cos(rad(deg))), f1(cy + r * Math.sin(rad(deg)))];
const files = [];
const write = (name, s) => { fs.writeFileSync(path.join(OUT, name), s); files.push(name); };

// 4-point curved sparkle
function sparkle(x, y, s, c = '#ffffff', k = 0.2) {
  const a = s * k;
  return `<path d="M${x},${f1(y - s)} Q${f1(x + a)},${f1(y - a)} ${f1(x + s)},${y} Q${f1(x + a)},${f1(y + a)} ${x},${f1(y + s)} ` +
    `Q${f1(x - a)},${f1(y + a)} ${f1(x - s)},${y} Q${f1(x - a)},${f1(y - a)} ${x},${f1(y - s)} Z" fill="${c}"/>`;
}
function starPts(cx, cy, ro, ri, n = 5, rot = -90) {
  const p = [];
  for (let i = 0; i < n * 2; i++) p.push(pt(cx, cy, i % 2 ? ri : ro, rot + i * 180 / n));
  return p;
}
const poly = p => 'M' + p.map(q => q.join(',')).join(' L') + ' Z';

/* =============================== NIMBUS =============================== */
// Body = union of 7 round puffs, identical in every frame. Body centre (64,66), fits r 50.
const PUFFS = [
  [64, 72, 36],  // big belly
  [64, 42, 22],  // top
  [40, 53, 18.5], // upper left
  [88, 53, 18.5], // upper right
  [33, 79, 13.5], // lower left
  [95, 79, 13.5], // lower right
  [64, 96, 17],  // bottom
  // every puff: dist(centre,(64,66)) + r ≤ 47.1, so with the 3 px outline the body fits r 50
];
const NC = {
  body: '#ffffff', shade: '#cfe3f7', line: '#5a7aa6', cheek: '#ff9fb8', eye: '#2b3a5c',
  mouth: '#2b3a5c', tongue: '#ff7f9f', mist: '#eaf3fd', sweat: '#8fd0ff',
};
const circ = (c, extra) => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" ${extra}/>`;

// little side puff-arm (an egg-shaped puff), drawn behind the body
function arm(x, y, rot, col) {
  return `<g transform="translate(${x},${y}) rotate(${rot})"><ellipse cx="0" cy="0" rx="12.5" ry="9" fill="${col.body}" stroke="${col.line}" stroke-width="3"/>` +
    `<path d="M-7,5.2 Q0,8.8 7,5.2" fill="none" stroke="${col.shade}" stroke-width="2.4" ${R}/></g>`;
}
// curl of mist under the body like a tail (3 shrinking puffs that curl right)
function tail(t, col) {
  // t = [tipX, tipY]: the wisp starts under the belly and curls out to the tip
  const [x, y] = t;
  const d = `M58,108 C60,121 74,125 84,120 C${x - 4},${y + 2} ${x + 2},${y - 3} ${x},${y - 7} C${x - 4},${y - 6} ${x - 6},${y - 2} ${x - 9},${y} C78,116 70,114 70,106 Z`;
  return `<path d="${d}" fill="${col.mist}" stroke="${col.line}" stroke-width="2.8" ${R}/>`;
}
// the dewdrop curl on top of the head: Nimbus's signature cowlick
function curl(col) {
  return `<path d="M58,23 C55,12 63,5 70,8 C76,11 74,19 68,18 C64,17.5 65,13 68,13.5" fill="none" stroke="${col.line}" stroke-width="7.5" ${R}/>` +
    `<path d="M58,23 C55,12 63,5 70,8 C76,11 74,19 68,18 C64,17.5 65,13 68,13.5" fill="none" stroke="${col.body}" stroke-width="3" ${R}/>`;
}
function body(col, id) {
  const ol = PUFFS.map(c => circ(c, `fill="${col.line}" stroke="${col.line}" stroke-width="6"`)).join('');
  const clip = `<clipPath id="${id}">${PUFFS.map(c => circ(c, '')).join('')}</clipPath>`;
  // one-step cel shade: shade colour, then the puffs again nudged up-left → crescent under every puff
  const lit = PUFFS.map(c => `<circle cx="${f1(c[0] - 2.5)}" cy="${f1(c[1] - 6)}" r="${f1(c[2] - 0.5)}" fill="${col.body}"/>`).join('');
  // seams where the upper puffs overlap the belly
  const seams = `<path d="M26,65 Q32,60 40,64" fill="none" stroke="${col.shade}" stroke-width="2.6" ${R}/>` +
    `<path d="M102,65 Q96,60 88,64" fill="none" stroke="${col.shade}" stroke-width="2.6" ${R}/>`;
  // one highlight: soft glossy oval on the top puff (pale sky tint so it shows on white)
  const hi = `<ellipse cx="52" cy="33" rx="7" ry="4.5" transform="rotate(-30 52 33)" fill="${col.hiFill || '#ffffff'}" stroke="${col.hiLine || '#e3effb'}" stroke-width="1.6"/>`;
  return `<defs>${clip}</defs>${ol}<g clip-path="url(#${id})"><rect x="0" y="0" width="128" height="128" fill="${col.shade}"/>${lit}${seams}</g>${hi}`;
}
// faces: eyes centred (51,68) & (77,68); mouth ≈ (64,82); cheeks (40,81) & (88,81)
const EYE_L = [51, 68], EYE_R = [77, 68];
function eyesOpen(col) {
  return [EYE_L, EYE_R].map(([x, y]) =>
    `<ellipse cx="${x}" cy="${y}" rx="7" ry="9" fill="${col.eye}"/>` +
    `<circle cx="${x - 2.3}" cy="${y - 3.6}" r="3" fill="#fff"/><circle cx="${x + 2.4}" cy="${y + 3.2}" r="1.4" fill="#fff"/>`).join('');
}
const cheeks = col => `<ellipse cx="38.5" cy="81" rx="6.5" ry="4" fill="${col.cheek}" opacity="0.85"/><ellipse cx="89.5" cy="81" rx="6.5" ry="4" fill="${col.cheek}" opacity="0.85"/>`;
const FACES = {
  idle: col => eyesOpen(col) + cheeks(col) +
    `<path d="M59,81 Q64,86.5 69,81" fill="none" stroke="${col.mouth}" stroke-width="2.8" ${R}/>`,
  happy: col => `<path d="M44,70 Q51,60 58,70" fill="none" stroke="${col.eye}" stroke-width="4" ${R}/>` +
    `<path d="M70,70 Q77,60 84,70" fill="none" stroke="${col.eye}" stroke-width="4" ${R}/>` + cheeks(col) +
    `<path d="M56,78 Q64,79.5 72,78 Q71,90 64,90 Q57,90 56,78 Z" fill="${col.mouth}" stroke="${col.mouth}" stroke-width="2" ${R}/>` +
    `<path d="M59.5,86.5 Q64,83 68.5,86.5 Q66.5,89 64,89 Q61.5,89 59.5,86.5 Z" fill="${col.tongue}"/>`,
  ouch: col => `<path d="M45,63 L56,68 L45,73" fill="none" stroke="${col.eye}" stroke-width="4" ${R}/>` +
    `<path d="M83,63 L72,68 L83,73" fill="none" stroke="${col.eye}" stroke-width="4" ${R}/>` + cheeks(col) +
    `<path d="M56,84 Q58,80.5 60,84 Q62,87.5 64,84 Q66,80.5 68,84 Q70,87.5 72,84" fill="none" stroke="${col.mouth}" stroke-width="2.8" ${R}/>`,
  rain: col => `<path d="M44,67 Q51,75 58,67" fill="none" stroke="${col.eye}" stroke-width="4" ${R}/>` +
    `<path d="M70,67 Q77,75 84,67" fill="none" stroke="${col.eye}" stroke-width="4" ${R}/>` + cheeks(col) +
    `<path d="M54,78 Q64,80 74,78 Q73,92 64,92 Q55,92 54,78 Z" fill="${col.mouth}" stroke="${col.mouth}" stroke-width="2" ${R}/>` +
    `<path d="M58,87.5 Q64,83.5 70,87.5 Q67.5,91 64,91 Q60.5,91 58,87.5 Z" fill="${col.tongue}"/>`,
};
// ouch extras: a sweat drop and three ruffled tufts sticking off the outline (body circles unchanged)
const sweat = col => `<path d="M104,22 C100,29 98,32 98,35 A6,6 0 0 0 110,35 C110,32 108,29 104,22 Z" fill="${col.sweat}" stroke="#3f7fb8" stroke-width="2.4" ${R}/>` +
  `<ellipse cx="101.6" cy="34" rx="1.6" ry="2.6" fill="#fff"/>`;
const ruffles = col => [[22, 42, -140], [108, 44, -40], [80, 20, -70]].map(([x, y, a]) => {
  const [x2, y2] = pt(x, y, 7, a);
  return `<path d="M${x},${y} L${x2},${y2}" stroke="${col.line}" stroke-width="2.8" ${R}/>`;
}).join('');

function nimbus(o) {
  const col = Object.assign({}, NC, o.col || {});
  const back = (o.arms || []).map(a => arm(a[0], a[1], a[2], col)).join('') + tail(o.tail, col);
  return svg(128, 128, back + body(col, 'nb' + o.name) + curl(col) + FACES[o.face](col) + (o.extra ? o.extra(col) : ''));
}
const TAIL0 = [97, 116];
const TAIL1 = [95, 121];
const NIMBUS = {
  nimbus_0: { face: 'idle', arms: [[16, 84, 28], [112, 84, -28]], tail: TAIL0 },
  nimbus_1: { face: 'idle', arms: [[15, 78, 8], [113, 78, -8]], tail: TAIL1 },
  nimbus_happy: { face: 'happy', arms: [[16, 42, -58], [112, 42, 58]], tail: TAIL0 },
  nimbus_ouch: { face: 'ouch', arms: [[17, 72, 40], [111, 72, -40]], tail: TAIL1, extra: c => sweat(c) + ruffles(c) },
  nimbus_rain: { face: 'rain', arms: [[14, 64, -12], [114, 64, 12]], tail: TAIL0,
    col: { body: '#d6e6fb', shade: '#a9c3e6', mist: '#c4d8f3', hiFill: '#eef5fe', hiLine: '#eef5fe', cheek: '#ff9fb8' } },
};
for (const [name, o] of Object.entries(NIMBUS)) write(name + '.svg', nimbus(Object.assign({ name }, o)));

/* =============================== BUBBLE =============================== */
// centre (64,64) r 60. Rim band 4.5 px (r 55.5..60), clear inside (tint ≤ 0.12).
function bubbleSvg(id = 'b') {
  return svg(128, 128, `<defs>
<radialGradient id="${id}in" cx="64" cy="64" r="58" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#e8f6ff" stop-opacity="0.02"/><stop offset="0.72" stop-color="#d9f0ff" stop-opacity="0.05"/><stop offset="1" stop-color="#c7e6ff" stop-opacity="0.12"/></radialGradient>
<linearGradient id="${id}rim" x1="12" y1="10" x2="116" y2="118" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ff9ccf"/><stop offset="0.28" stop-color="#ffc7e6"/><stop offset="0.5" stop-color="#8ff0c8"/><stop offset="0.75" stop-color="#7fcfff"/><stop offset="1" stop-color="#b59bff"/></linearGradient>
</defs>
<circle cx="64" cy="64" r="58" fill="url(#${id}in)"/>
<circle cx="64" cy="64" r="57.75" fill="none" stroke="url(#${id}rim)" stroke-width="4.5" opacity="0.95"/>
<circle cx="64" cy="64" r="60.2" fill="none" stroke="#5f86b8" stroke-width="1.3" opacity="0.55"/>
<circle cx="64" cy="64" r="55.2" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.55"/>
<path d="M22,52 A44,44 0 0 1 52,21" fill="none" stroke="#ffffff" stroke-width="7" ${R} opacity="0.92"/>
<path d="M19.5,64 A45,45 0 0 1 19.8,60" fill="none" stroke="#ffffff" stroke-width="5" ${R} opacity="0.85"/>
<path d="M62,18.5 A46,46 0 0 1 70,18.8" fill="none" stroke="#ffffff" stroke-width="3.5" ${R} opacity="0.7"/>
<path d="M104,82 A44,44 0 0 1 90,100" fill="none" stroke="#ffffff" stroke-width="3" ${R} opacity="0.55"/>
<circle cx="96" cy="97" r="4.2" fill="#ffffff" opacity="0.9"/>`);
}
write('bubble.svg', bubbleSvg());

/* ================================ GEMS ================================ */
// centred (32,32), fit r 26. Each: base shape (outlined) + 2-3 facet polygons + one white sparkle.
const GC = [
  { base: '#ff4d6d', lite: '#ff94a8', dark: '#d42550', line: '#8f1235' }, // ruby
  { base: '#3d8bff', lite: '#8cbcff', dark: '#1f5fd6', line: '#163d8f' }, // sapphire
  { base: '#2fd07a', lite: '#8cf0b8', dark: '#169a55', line: '#0d6136' }, // emerald
  { base: '#ffc531', lite: '#ffe48a', dark: '#e09200', line: '#9a5a00' }, // topaz
  { base: '#b26bff', lite: '#d7b0ff', dark: '#8638e0', line: '#541a9e' }, // amethyst
];
function gem(i) {
  const c = GC[i];
  let shape, facets;
  if (i === 0) { // round brilliant: 10-gon outline, octagon table, alternating crown facets
    const outer = [...Array(10)].map((_, k) => pt(32, 32, 25, -90 + k * 36));
    const table = [...Array(10)].map((_, k) => pt(32, 30, 12.5, -90 + k * 36));
    shape = poly(outer);
    facets = outer.map((p, k) => {
      const q = outer[(k + 1) % 10], t1 = table[k], t2 = table[(k + 1) % 10];
      const col = (k >= 6 && k <= 9) || k === 0 ? c.lite : (k >= 2 && k <= 4 ? c.dark : null);
      return col ? `<path d="${poly([p, q, t2, t1])}" fill="${col}"/>` : '';
    }).join('') + `<path d="${poly(table)}" fill="${c.base}" stroke="${c.line}" stroke-width="1.2" stroke-opacity="0.45"/>` +
      `<path d="${poly([table[7], table[8], table[9], table[0], [32, 30]])}" fill="${c.lite}" opacity="0.8"/>`;
  } else if (i === 1) { // drop: pointed top, round bottom
    shape = 'M32,6 C38,15 52,27 52,39 A20,19 0 0 1 12,39 C12,27 26,15 32,6 Z';
    facets = `<path d="M32,6 C26,15 12,27 12,39 A20,19 0 0 0 22,55.3 L27,40 Z" fill="${c.lite}"/>` +
      `<path d="M32,6 C38,15 52,27 52,39 A20,19 0 0 1 42,55.3 L37,40 Z" fill="${c.dark}"/>` +
      `<path d="M32,16 L37,40 L32,47 L27,40 Z" fill="${c.base}" stroke="${c.lite}" stroke-width="1.2" ${R}/>`;
  } else if (i === 2) { // square (emerald) cut: chamfered square + step table
    const o = [[16, 8], [48, 8], [56, 16], [56, 48], [48, 56], [16, 56], [8, 48], [8, 16]];
    const t = [[22, 18], [42, 18], [46, 22], [46, 42], [42, 46], [22, 46], [18, 42], [18, 22]];
    shape = poly(o);
    facets = `<path d="${poly([o[7], o[0], o[1], t[1], t[0], t[7]])}" fill="${c.lite}"/>` + // top + left-top
      `<path d="${poly([o[6], o[7], t[7], t[6]])}" fill="${c.lite}" opacity="0.75"/>` +
      `<path d="${poly([o[2], o[3], o[4], t[4], t[3], t[2]])}" fill="${c.dark}"/>` + // right
      `<path d="${poly([o[4], o[5], t[5], t[4]])}" fill="${c.dark}" opacity="0.7"/>` +
      `<path d="${poly(t)}" fill="${c.base}" stroke="${c.line}" stroke-width="1.2" stroke-opacity="0.4"/>` +
      `<path d="M22,18 L42,18 L46,22 L18,22 Z" fill="${c.lite}" opacity="0.6"/>`;
  } else if (i === 3) { // star
    const s = starPts(32, 33.5, 26, 12.5);
    shape = poly(s);
    facets = [0, 2, 4, 6, 8].map(k => {
      const tip = s[k], prev = s[(k + 9) % 10], next = s[k + 1], C = [32, 33.5];
      const left = k === 0 || k === 8 || k === 6;
      return `<path d="${poly([tip, prev, C])}" fill="${left ? c.lite : c.base}"/><path d="${poly([tip, next, C])}" fill="${left ? c.base : c.dark}"/>`;
    }).join('');
  } else { // heart
    shape = 'M32,55 C24,48 7,38 7,23 C7,13.5 14,8 21.5,8 C26.5,8 30,11 32,15 C34,11 37.5,8 42.5,8 C50,8 57,13.5 57,23 C57,38 40,48 32,55 Z';
    facets = `<path d="M32,15 C30,11 26.5,8 21.5,8 C14,8 7,13.5 7,23 C7,29 10,34 14,38.5 L25,27 Z" fill="${c.lite}"/>` +
      `<path d="M32,15 C34,11 37.5,8 42.5,8 C50,8 57,13.5 57,23 C57,29 54,34 50,38.5 L39,27 Z" fill="${c.base}"/>` +
      `<path d="M50,38.5 C45,44 37,50 32,55 C27,50 19,44 14,38.5 L25,27 L32,33 L39,27 Z" fill="${c.dark}"/>` +
      `<path d="M25,27 L32,15 L39,27 L32,33 Z" fill="${c.base}" stroke="${c.lite}" stroke-width="1.2" ${R}/>`;
  }
  const sp = [[22, 20, 7], [20, 30, 7], [21, 19, 7], [20, 22, 7.5], [19, 18, 7]][i];
  const id = 'g' + i;
  return svg(64, 64, `<defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>` +
    `<path d="${shape}" fill="${c.base}"/><g clip-path="url(#${id})">${facets}</g>` +
    `<path d="${shape}" fill="none" stroke="${c.line}" stroke-width="3" ${R}/>` +
    sparkle(sp[0], sp[1], sp[2]) + `<circle cx="${sp[0] + 9}" cy="${sp[1] - 3}" r="1.6" fill="#fff" opacity="0.9"/>`);
}
for (let i = 0; i < 5; i++) write(`gem_${i}.svg`, gem(i));

/* ================================ BURRS =============================== */
// centre (48,48); solid body r 26; soft rounded spikes out to r 44; stem nub on top.
function spikes(n, r0, r1, half, col, line, skip, phase = 0) {
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = -90 + phase + k * 360 / n;
    const d = ((a + 90) % 360 + 360) % 360;
    if (skip && skip(d)) continue;
    const b1 = pt(48, 48, r0, a - half), b2 = pt(48, 48, r0, a + half), tip = pt(48, 48, r1, a);
    const c1 = pt(48, 48, r1 - 4, a - half * 0.3), c2 = pt(48, 48, r1 - 4, a + half * 0.3);
    s += `<path d="M${b1} Q${c1} ${tip} Q${c2} ${b2} Z" fill="${col}" stroke="${line}" stroke-width="2.6" ${R}/>`;
  }
  return s;
}
function burr(v) {
  const C = v === 0
    ? { spike: '#6b4226', spike2: '#9a6740', body: '#8a5a3a', shade: '#6f4529', hi: '#b07a52', line: '#4a2c18', face: '#2e1a0e' }
    : { spike: '#7fa83a', spike2: '#93bd48', body: '#7fa83a', shade: '#62882a', hi: '#a9cf63', line: '#3d5a18', face: '#24360c' };
  const gap = v === 1 ? d => d > 325 || d < 35 : null; // open top on the green shell
  let s = '';
  // back row (longer), front row (shorter, offset)
  s += spikes(15, 22, 43, 7.5, C.spike, C.line, gap);
  s += spikes(15, 22, 35.5, 7, C.spike2, C.line, gap, 12);
  // stem nub (brown variant only; green one has its nut on top)
  if (v === 0) s += `<path d="M45,24 C44.5,17 46,12 49.5,9.5 C52.5,9 54,11 52.5,13.5 C51,16 51,20 51.5,24 Z" fill="#7a8a3a" stroke="${C.line}" stroke-width="2.6" ${R}/>`;
  if (v === 1) { // glossy brown nut peeking out of the split
    s += `<path d="M33,32 C32,22 40,13 48,11 C56,13 64,22 63,32 Z" fill="#8a4a24" stroke="#4a2c18" stroke-width="2.6" ${R}/>` +
      `<path d="M40,26 C41,20 44,16.5 47,15" fill="none" stroke="#c98a5a" stroke-width="3" ${R}/>` +
      `<path d="M48,11 L48,7" stroke="#4a2c18" stroke-width="3" ${R}/>`;
  }
  // body
  s += `<defs><clipPath id="bb${v}"><circle cx="48" cy="48" r="26"/></clipPath></defs>` +
    `<circle cx="48" cy="48" r="26" fill="${C.body}"/>` +
    `<g clip-path="url(#bb${v})">` +
    `<path d="M20,58 C30,70 52,76 76,58 L76,80 L20,80 Z" fill="${C.shade}"/></g>`;
  if (v === 1) // the shell lips curl back around the nut
    s += `<path d="M30,36 C33,30 38,27 42,28" fill="none" stroke="${C.line}" stroke-width="2.6" ${R}/>` +
      `<path d="M66,36 C63,30 58,27 54,28" fill="none" stroke="${C.line}" stroke-width="2.6" ${R}/>` +
      `<path d="M33,32 C37,30 40,31 42,33 M63,32 C59,30 56,31 54,33" fill="none" stroke="${C.hi}" stroke-width="2" ${R}/>`;
  s += `<circle cx="48" cy="48" r="26" fill="none" stroke="${C.line}" stroke-width="3"/>`;
  s += `<ellipse cx="37" cy="${v ? 42 : 36}" rx="7" ry="4" transform="rotate(-35 37 ${v ? 42 : 36})" fill="${C.hi}" opacity="0.9"/>`;
  // sleepy, slightly grumpy-cute face: heavy lids, dot pupils, small flat mouth
  s += [40, 56].map(x => `<path d="M${x - 3.8},49.5 L${x + 3.8},49.5 A3.8,3.8 0 0 1 ${x - 3.8},49.5 Z" fill="${C.face}" stroke="${C.face}" stroke-width="1.6" ${R}/>` +
    `<circle cx="${x + 1.2}" cy="51" r="0.9" fill="#fff" opacity="0.85"/>`).join('') +
    `<path d="M45.5,59.5 Q48,58 50.5,59.5" fill="none" stroke="${C.face}" stroke-width="2.4" ${R}/>` +
    `<ellipse cx="34.5" cy="57" rx="3.6" ry="2" fill="#ff9fb8" opacity="0.5"/><ellipse cx="61.5" cy="57" rx="3.6" ry="2" fill="#ff9fb8" opacity="0.5"/>`;
  return svg(96, 96, s);
}
write('burr_0.svg', burr(0));
write('burr_1.svg', burr(1));

/* ================================ HUD ================================= */
const HEART = 'M24,42 C19,37.5 6,29 6,18 C6,11 11,6.5 17,6.5 C20.5,6.5 23,8.5 24,11.5 C25,8.5 27.5,6.5 31,6.5 C37,6.5 42,11 42,18 C42,29 29,37.5 24,42 Z';
write('heart.svg', svg(48, 48, `<defs><clipPath id="h"><path d="${HEART}"/></clipPath></defs>` +
  `<path d="${HEART}" fill="#ff6f91"/><g clip-path="url(#h)"><path d="M44,16 C44,34 30,40 22,44 L48,48 L48,10 Z" fill="#e24c76"/></g>` +
  `<path d="${HEART}" fill="none" stroke="#b02a58" stroke-width="3" ${R}/>` +
  `<ellipse cx="14.5" cy="16" rx="4.6" ry="3" transform="rotate(-40 14.5 16)" fill="#fff" opacity="0.92"/><circle cx="20" cy="12.3" r="1.5" fill="#fff" opacity="0.85"/>`));
write('heart_empty.svg', svg(48, 48, `<g opacity="0.5"><path d="${HEART}" fill="#c9c2dd" fill-opacity="0.25" stroke="#8e86ad" stroke-width="3" ${R}/></g>`));

// Jar: glass body x 16..80, y 26..90; inner fill area x 22–74, y 30–84. Cork y 6..20.
const JAR = 'M30,24 L66,24 L66,28 C76,31 81,40 81,52 L81,78 C81,86 75,91 67,91 L29,91 C21,91 15,86 15,78 L15,52 C15,40 20,31 30,28 Z';
write('jar.svg', svg(96, 96,
  `<path d="${JAR}" fill="#dff1ff" fill-opacity="0.16"/>` +
  `<path d="${JAR}" fill="none" stroke="#5a7aa6" stroke-width="3" ${R}/>` +
  `<path d="${JAR}" fill="none" stroke="#eaf5ff" stroke-width="1.2" transform="translate(48 58) scale(0.94) translate(-48 -58)" opacity="0.8"/>` +
  `<path d="M21,50 C21,42 24,36 30,33" fill="none" stroke="#ffffff" stroke-width="3.6" ${R} opacity="0.9"/>` +
  `<path d="M21,58 L21,76" fill="none" stroke="#ffffff" stroke-width="3.6" ${R} opacity="0.75"/>` +
  `<path d="M75,62 L75,78 C75,82 73,84 70,85" fill="none" stroke="#ffffff" stroke-width="2.2" ${R} opacity="0.55"/>` +
  // cork lid
  `<path d="M31,8.5 C31,6.5 33,5.5 35,5.5 L61,5.5 C63,5.5 65,6.5 65,8.5 L64,22 L32,22 Z" fill="#d3a46c" stroke="#7a5530" stroke-width="3" ${R}/>` +
  `<path d="M36,12 L37,12 M44,16 L45,16 M54,10.5 L55,10.5 M58,17 L59,17" stroke="#9e7444" stroke-width="2.4" ${R}/>` +
  `<path d="M34,9.5 L50,9.5" stroke="#ecc995" stroke-width="2.4" ${R}/>` +
  // ribbon around the neck + bow
  `<path d="M29.5,23 L66.5,23 L66.5,29 L29.5,29 Z" fill="#ff9fb8" stroke="#c45a7e" stroke-width="2.4" ${R}/>` +
  `<path d="M66,26 C72,19 79,21 76.5,26 C79,31 72,33 66,26 Z" fill="#ff9fb8" stroke="#c45a7e" stroke-width="2.4" ${R}/>` +
  `<path d="M66,26 L70,37 L73,34 L75.5,37 L68,26" fill="#ff9fb8" stroke="#c45a7e" stroke-width="2.4" ${R}/>` +
  `<circle cx="66" cy="26" r="2.6" fill="#ff7f9f" stroke="#c45a7e" stroke-width="1.8"/>`));

/* ================================ ICON ================================ */
// Round rainy-garden badge, Nimbus big, popping a bubble with a pink (ruby) gem.
function inner(s) { return s.replace(/^<svg[^>]*>\n?/, '').replace(/\n?<\/svg>\n?$/, ''); }
const nimbusHappy = inner(nimbus(Object.assign({ name: 'icon' }, NIMBUS.nimbus_happy)));
const ruby = inner(gem(0)).replace(/id="g0"/g, 'id="ig0"').replace(/url\(#g0\)/g, 'url(#ig0)');
write('icon.svg', svg(256, 256, `<defs>
<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc3cf"/><stop offset="1" stop-color="#c8eee6"/></linearGradient>
<clipPath id="ibadge"><circle cx="128" cy="128" r="118"/></clipPath></defs>
<circle cx="128" cy="128" r="118" fill="url(#isky)"/>
<g clip-path="url(#ibadge)">
${[[40, 30], [84, 62], [176, 22], [214, 70], [30, 120], [222, 140], [120, 14]].map(([x, y]) => `<path d="M${x},${y} L${x - 6},${y + 20}" stroke="#ffffff" stroke-width="4" ${R} opacity="0.75"/>`).join('')}
<ellipse cx="128" cy="236" rx="160" ry="44" fill="#8fd17a"/><ellipse cx="128" cy="244" rx="160" ry="40" fill="#6dbb5e"/>
<ellipse cx="190" cy="216" rx="26" ry="6" fill="#9fd8f0" stroke="#5aa0c0" stroke-width="2.5"/>
<path d="M40,232 C42,212 44,200 44,190" fill="none" stroke="#3f8f3a" stroke-width="5" ${R}/>
<path d="M44,214 C34,206 28,208 26,214 C34,216 40,216 44,214 Z" fill="#5cb04f" stroke="#2f6e2b" stroke-width="2.5" ${R}/>
<path d="M30,176 C30,190 36,198 44,198 C52,198 58,190 58,176 L51,183 L44,172 L37,183 Z" fill="#ff7fa8" stroke="#b83a68" stroke-width="3" ${R}/>
</g>
<g transform="translate(138,40)">
<g transform="scale(0.82)">${inner(bubbleSvg('ib'))}</g>
<g transform="translate(26,26) scale(0.86)">${ruby}</g>
${[[-6, 18, 6], [110, 30, 5], [-4, 76, 4], [108, 86, 6]].map(([x, y, s]) => sparkle(x, y, s)).join('')}
</g>
<g transform="translate(12,76) scale(1.36)">${nimbusHappy}</g>
<circle cx="128" cy="128" r="118" fill="none" stroke="#3f7f8f" stroke-width="7"/>
<circle cx="128" cy="128" r="112.5" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.6"/>`));

console.log('wrote', files.length, 'files to', OUT);
