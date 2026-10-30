// Generates Puff's Volcano Catch character + item SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);
const f1 = n => Math.round(n * 10) / 10;

// 4-point sparkle (curved star)
const sparkle = (x, y, s, c = '#fffbe0', line = '#c7861a', sw = 1.2) =>
  `<path d="M${x},${y - s} C${f1(x + s * .18)},${f1(y - s * .2)} ${f1(x + s * .2)},${f1(y - s * .18)} ${x + s},${y} C${f1(x + s * .2)},${f1(y + s * .18)} ${f1(x + s * .18)},${f1(y + s * .2)} ${x},${y + s} ` +
  `C${f1(x - s * .18)},${f1(y + s * .2)} ${f1(x - s * .2)},${f1(y + s * .18)} ${x - s},${y} C${f1(x - s * .2)},${f1(y - s * .18)} ${f1(x - s * .18)},${f1(y - s * .2)} ${x},${y - s} Z" fill="${c}"${line ? ` stroke="${line}" stroke-width="${sw}"` : ''} ${R}/>`;
function star5(cx, cy, ro, ri = ro * 0.5, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * Math.PI / 180, r = i % 2 ? ri : ro;
    d += (i ? ' L' : 'M') + f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a));
  }
  return d + ' Z';
}

/* ============================== PUFF ============================== */
// Palette: white cloud with lilac-blue shading so it reads on a pale sky.
const P = {
  body: '#ffffff', shade: '#dfe2fb', shade2: '#c3c8f2', line: '#5d63b0', hi: '#ffffff',
  eye: '#252452', cheek: '#ff8fae', mouth: '#c8365c', tongue: '#ff9bb3',
};
// Body = union of round lumps (identical in every frame). Centre (60,50).
const LUMPS = [
  ['c', 60, 31, 19],   // top
  ['c', 38.5, 40, 15], // upper left
  ['c', 81.5, 40, 15], // upper right
  ['c', 24, 56, 12.5], // left
  ['c', 96, 56, 12.5], // right
  ['e', 60, 60, 36, 19], // round bottom
];
const lumpEl = (l, extra) => l[0] === 'c'
  ? `<circle cx="${l[1]}" cy="${l[2]}" r="${l[3]}" ${extra}/>`
  : `<ellipse cx="${l[1]}" cy="${l[2]}" rx="${l[3]}" ry="${l[4]}" ${extra}/>`;
// stubby cloud arms holding the ropes; hand centre ≈ rope attach (34,72) / (86,72)
const ARM_L = 'M21,63 C20,69 25,75.5 31.5,75.5 C36.5,75.5 38.6,71 37.2,67.6 C35.4,63.6 29,62.6 25,62.6 Z';
const ARM_R = 'M99,63 C100,69 95,75.5 88.5,75.5 C83.5,75.5 81.4,71 82.8,67.6 C84.6,63.6 91,62.6 95,62.6 Z';

function puffBody() {
  const ol = LUMPS.map(l => lumpEl(l, `fill="${P.line}" stroke="${P.line}" stroke-width="6"`)).join('');
  const fl = LUMPS.map(l => lumpEl(l, `fill="${P.body}"`)).join('');
  return `<defs><clipPath id="pc">${LUMPS.map(l => lumpEl(l, '')).join('')}</clipPath></defs>
${ol}${fl}
<g clip-path="url(#pc)">
  <path d="M8,62 C20,70 40,74 60,73 C80,74 100,70 112,62 L112,92 L8,92 Z" fill="${P.shade}"/>
  <path d="M14,70 C30,79 48,81 60,80.4 C72,81 90,79 106,70 L106,92 L14,92 Z" fill="${P.shade2}"/>
  <path d="M15,58 C17,64 22,67 28,68" fill="none" stroke="${P.shade}" stroke-width="3" ${R}/>
  <path d="M105,58 C103,64 98,67 92,68" fill="none" stroke="${P.shade}" stroke-width="3" ${R}/>
  <path d="M26,40.5 C29,36.5 34,34.5 38,35" fill="none" stroke="${P.shade}" stroke-width="2.4" opacity=".9" ${R}/>
  <path d="M68.5,33.5 C72,29 77,27.6 82,28.6" fill="none" stroke="${P.shade}" stroke-width="2.4" opacity=".9" ${R}/>
</g>
<path d="M47,22 C50,16.4 55.6,13.6 61,13.6" fill="none" stroke="${P.shade}" stroke-width="3.2" ${R}/>
<ellipse cx="51.5" cy="21" rx="4.2" ry="2.4" fill="#fff" transform="rotate(-28 51.5 21)"/>`;
}
const arms = (fill = P.body) => [ARM_L, ARM_R].map(d =>
  `<path d="${d}" fill="${fill}" stroke="${P.line}" stroke-width="3" ${R}/>`).join('') +
  `<path d="M26,72 C29,74 33,74.4 36,72.6 M94,72 C91,74 87,74.4 84,72.6" fill="none" stroke="${P.shade2}" stroke-width="2" ${R}/>`;

const EYE = (cx, cy, rx = 5.4, ry = 7.2) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${P.eye}"/>
<circle cx="${f1(cx + 1.6)}" cy="${f1(cy - 2.8)}" r="2.3" fill="#fff"/><circle cx="${f1(cx - 1.8)}" cy="${f1(cy + 2.8)}" r="1.1" fill="#fff" opacity=".9"/>`;
const cheeks = (r = 1, op = .75) => `<ellipse cx="37.5" cy="56.5" rx="${f1(5.6 * r)}" ry="${f1(3.4 * r)}" fill="${P.cheek}" opacity="${op}"/>
<ellipse cx="82.5" cy="56.5" rx="${f1(5.6 * r)}" ry="${f1(3.4 * r)}" fill="${P.cheek}" opacity="${op}"/>`;
const FACE = {
  idle: `${EYE(47, 47)}${EYE(73, 47)}${cheeks()}
<path d="M55.6,56.4 C57.6,59.4 62.4,59.4 64.4,56.4" fill="none" stroke="${P.eye}" stroke-width="2.6" ${R}/>`,
  happy: `<path d="M41,49.6 C42.6,42.4 51.4,42.4 53,49.6" fill="none" stroke="${P.eye}" stroke-width="3.4" ${R}/>
<path d="M67,49.6 C68.6,42.4 77.4,42.4 79,49.6" fill="none" stroke="${P.eye}" stroke-width="3.4" ${R}/>
${cheeks(1.1, .9)}
<path d="M53.4,55 C55,63.6 65,63.6 66.6,55 Z" fill="${P.mouth}" stroke="${P.eye}" stroke-width="2.2" ${R}/>
<path d="M56.4,59.8 C58.4,58.2 61.6,58.2 63.6,59.8 C62,61.4 58,61.4 56.4,59.8 Z" fill="${P.tongue}"/>
${sparkle(23, 24, 4.4, '#fffbe0', '#c7861a', 1.1)}${sparkle(98, 22, 3.6, '#fffbe0', '#c7861a', 1.1)}`,
  ouch: `<path d="M41.5,42.5 L51.5,47 L41.5,51.5" fill="none" stroke="${P.eye}" stroke-width="3.4" ${R}/>
<path d="M78.5,42.5 L68.5,47 L78.5,51.5" fill="none" stroke="${P.eye}" stroke-width="3.4" ${R}/>
${cheeks(1, .9)}
<path d="M53.2,59 C54.8,56.6 56.4,56.6 58,58.6 C59.4,60.4 60.6,60.4 62,58.6 C63.6,56.6 65.2,56.6 66.8,59" fill="none" stroke="${P.eye}" stroke-width="2.6" ${R}/>
<g stroke="${P.line}" stroke-width="2.4" fill="none" ${R}><path d="M17,26 L22,29"/><path d="M14,34 L19.6,34.4"/><path d="M103,26 L98,29"/><path d="M106,34 L100.4,34.4"/></g>`,
  blow: `${EYE(47, 45.5, 5, 6.4)}${EYE(73, 45.5, 5, 6.4)}
<path d="M40.6,37 C43.6,35 47.6,34.6 51,35.6 M79.4,37 C76.4,35 72.4,34.6 69,35.6" fill="none" stroke="${P.eye}" stroke-width="2" ${R}/>
<circle cx="38" cy="57" r="7" fill="${P.cheek}" opacity=".5"/><circle cx="82" cy="57" r="7" fill="${P.cheek}" opacity=".5"/>
<path d="M33.5,54.6 C34.6,52.6 36.6,51.6 38.6,51.6 M86.5,54.6 C85.4,52.6 83.4,51.6 81.4,51.6" fill="none" stroke="#fff" stroke-width="1.8" ${R}/>
<ellipse cx="60" cy="59" rx="3.6" ry="4.2" fill="${P.mouth}" stroke="${P.eye}" stroke-width="2.2"/>
`,
};
for (const f of Object.keys(FACE)) write(`puff_${f}.svg`, svg(120, 100, `${puffBody()}\n${FACE[f]}\n${arms()}`));

/* ============================== BASKET ============================== */
const B = { base: '#e2a356', light: '#f6cb85', dark: '#b06f2c', line: '#7a4316', inside: '#8c5321', insideDeep: '#6d3e17', rim: '#c98538' };
const BODY_B = 'M9,17 C10,38 15,56 22,64 C26,68.4 34,70 48,70 C62,70 70,68.4 74,64 C81,56 86,38 87,17 Z';
// weave rows (inside basket body, clipped)
function weave() {
  let s = '';
  for (let r = 0; r < 7; r++) {
    const y = 22 + r * 7.2, off = r % 2 ? 6 : 0;
    for (let x = -4 + off; x < 100; x += 12) {
      s += `<rect x="${x}" y="${f1(y)}" width="11" height="6" rx="3" fill="${B.light}" stroke="${B.dark}" stroke-width="1.2"/>`;
    }
  }
  // vertical stakes peeking between rows
  for (let x = 10; x < 92; x += 12) s += `<path d="M${x + 1},20 L${x + 1},70" stroke="${B.dark}" stroke-width="1.4" opacity=".55"/>`;
  return s;
}
const rimFront = `M8,17 C8,24 26,28 48,28 C70,28 88,24 88,17`;
const basketFront = (id) => `<defs><clipPath id="${id}"><path d="${BODY_B}"/></clipPath></defs>
<path d="${BODY_B}" fill="${B.base}"/>
<g clip-path="url(#${id})">${weave()}
  <path d="M60,16 C70,30 80,40 92,44 L92,74 L60,74 Z" fill="${B.dark}" opacity=".32"/>
  <path d="M4,10 C14,22 24,25 48,26 C72,25 82,22 92,10 L92,30 L4,30 Z" fill="${B.dark}" opacity=".25"/>
</g>
<path d="${BODY_B}" fill="none" stroke="${B.line}" stroke-width="3" ${R}/>
<path d="M16,34 C17,44 19,52 23,58" fill="none" stroke="#fff3d6" stroke-width="2.4" opacity=".8" ${R}/>
<path d="${rimFront}" fill="none" stroke="${B.line}" stroke-width="8" ${R}/>
<path d="${rimFront}" fill="none" stroke="${B.rim}" stroke-width="4.6" ${R}/>
<path d="${rimFront}" fill="none" stroke="${B.light}" stroke-width="4.6" stroke-dasharray="3 3.4" ${R}/>`;
const loops = [10, 86].map(x => `<circle cx="${x}" cy="16" r="4.6" fill="none" stroke="${B.line}" stroke-width="4.4"/><circle cx="${x}" cy="16" r="4.6" fill="none" stroke="${B.light}" stroke-width="1.8"/>`).join('');
write('basket.svg', svg(96, 72, `<ellipse cx="48" cy="17" rx="40" ry="10.5" fill="${B.inside}" stroke="${B.line}" stroke-width="3"/>
<ellipse cx="48" cy="20" rx="34" ry="7" fill="${B.insideDeep}"/>
<path d="M8,17 C8,10 26,6 48,6 C70,6 88,10 88,17" fill="none" stroke="${B.line}" stroke-width="8" ${R}/>
<path d="M8,17 C8,10 26,6 48,6 C70,6 88,10 88,17" fill="none" stroke="${B.rim}" stroke-width="4.6" ${R}/>
<path d="M8,17 C8,10 26,6 48,6 C70,6 88,10 88,17" fill="none" stroke="${B.light}" stroke-width="4.6" stroke-dasharray="3 3.4" ${R}/>
${basketFront('bk')}
${loops}`));
write('basket_front.svg', svg(96, 72, `${basketFront('bf')}\n${loops}`));

/* ============================== COINS ============================== */
const COIN = {
  copper: { rim: '#d9773f', face: '#f0965a', light: '#ffc49a', deep: '#b55a2a', line: '#6e2f12', emb: '#c4622c' },
  silver: { rim: '#b4c2d4', face: '#eef3f9', light: '#ffffff', deep: '#8293ad', line: '#2f3b55', emb: '#8e9fb8' },
  gold: { rim: '#f5b21c', face: '#ffd84a', light: '#fff4b0', deep: '#d68a08', line: '#7a4a02', emb: '#e09a10' },
};
function motif(kind, C) {
  const st = `stroke="${C.line}" stroke-width="1.6" ${R}`;
  if (kind === 'copper') { // scallop shell
    return `<path d="M24,33 L15.4,21.6 C15,15.6 19,12 24,12 C29,12 33,15.6 32.6,21.6 Z" fill="${C.emb}" ${st}/>
<path d="M24,32 L19.6,14.2 M24,32 L24,12.6 M24,32 L28.4,14.2" fill="none" stroke="${C.line}" stroke-width="1.3" opacity=".7" ${R}/>
<path d="M20.4,33.6 L27.6,33.6 L26.2,36 L21.8,36 Z" fill="${C.emb}" ${st}/>
<path d="M17.6,19 C18.4,15.6 20.6,13.8 23,13.4" fill="none" stroke="${C.light}" stroke-width="1.4" ${R}/>`;
  }
  if (kind === 'silver') { // palm tree on islet
    return `<path d="M15,35.4 C18,31.6 30,31.6 33,35.4 Z" fill="${C.emb}" ${st}/>
<path d="M24.6,32.4 C25.4,27 24.6,22 22.6,18" fill="none" stroke="${C.line}" stroke-width="4.2" ${R}/>
<path d="M24.6,32.4 C25.4,27 24.6,22 22.6,18" fill="none" stroke="${C.emb}" stroke-width="2" ${R}/>
<path d="M22.6,18 C19,14 14.6,14.6 13,18 C16.4,16.6 19.6,17 22.6,18 Z M22.6,18 C25,13.4 30,12.4 33,15.4 C29.4,15.4 25.6,16.4 22.6,18 Z M22.6,18 C20.4,19.6 18.6,22.6 18.4,25.4 C20.8,22.6 21.8,20.4 22.6,18 Z M22.6,18 C26.6,18 30,20 31.4,23.4 C28.4,21.2 25.6,19.6 22.6,18 Z" fill="${C.emb}" ${st}/>`;
  }
  return `<path d="${star5(24, 24.6, 11.4, 5.2)}" fill="${C.emb}" ${st}/>
<path d="M19.6,21 L22.6,20.6 L24,15.6" fill="none" stroke="${C.light}" stroke-width="1.5" ${R}/>`;
}
function coin(kind) {
  const C = COIN[kind];
  return `<circle cx="24" cy="24" r="20.5" fill="${C.rim}" stroke="${C.line}" stroke-width="3"/>
<path d="M7,28 C9,37 16,42.4 24,42.4 C32,42.4 39,37 41,28 C38,35 32,39.6 24,39.6 C16,39.6 10,35 7,28 Z" fill="${C.deep}"/>
<circle cx="24" cy="24" r="15" fill="${C.face}" stroke="${C.deep}" stroke-width="1.8"/>
<g fill="${C.line}" opacity=".35">${Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return `<circle cx="${f1(24 + 17.8 * Math.cos(a))}" cy="${f1(24 + 17.8 * Math.sin(a))}" r="1"/>`; }).join('')}</g>
${motif(kind, C)}
<path d="M9.4,18 C11,12.6 15.4,8.6 20.6,7.4" fill="none" stroke="${C.light}" stroke-width="2.8" ${R}/>
${kind === 'gold' ? sparkle(39, 8.6, 6.4, '#ffffff', '#c7861a', 1.1) + sparkle(8, 38, 3.4, '#ffffff', '#c7861a', 1) : ''}`;
}
for (const k of Object.keys(COIN)) write(`coin_${k}.svg`, svg(48, 48, coin(k)));

/* ============================== SIZZLY ROCKS ============================== */
const RK = { base: '#5b3a4e', light: '#7d5670', deep: '#3d2434', line: '#22121d', glow: '#ff8a2a', core: '#ffe07a' };
function rock(shape, cracks, shimmer, id) {
  return `<defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
<g fill="none" stroke="#ffb35a" stroke-width="2" opacity=".75" ${R}>${shimmer}</g>
<path d="${shape}" fill="none" stroke="#ff8a2a" stroke-width="6" opacity=".45" ${R}/>
<path d="${shape}" fill="${RK.base}"/>
<g clip-path="url(#${id})">
  <ellipse cx="30" cy="40" rx="22" ry="12" fill="${RK.deep}"/>
  <ellipse cx="18" cy="20" rx="9" ry="5" fill="${RK.light}" transform="rotate(-25 18 20)"/>
  <circle cx="33" cy="22" r="1.8" fill="${RK.deep}"/><circle cx="14" cy="32" r="1.5" fill="${RK.deep}"/>
</g>
<path d="${shape}" fill="none" stroke="${RK.line}" stroke-width="3" ${R}/>
<path d="${cracks}" fill="none" stroke="${RK.glow}" stroke-width="4" opacity=".55" ${R}/>
<path d="${cracks}" fill="none" stroke="${RK.glow}" stroke-width="2.4" ${R}/>
<path d="${cracks}" fill="none" stroke="${RK.core}" stroke-width="1" ${R}/>
<path d="M13,22 C14,18.6 16.6,16.4 19.6,15.6" fill="none" stroke="#a98199" stroke-width="2" ${R}/>`;
}
write('rock.svg', svg(48, 48, rock(
  'M10,22 C11,14 17,11.4 24,12 C31,11 38,14 40.6,21 C43.4,28 41,37 33.6,40.6 C27,43.4 16,43 10.6,38 C6.4,33.4 7.6,27 10,22 Z',
  'M17,25 L22,28.6 L20.4,33.6 M22,28.6 L28.6,27 L32,31.6 M28.6,27 L30,21.6',
  'M17,8.6 C15.6,6.4 18.4,4.4 17,2 M25,9 C23.6,6.4 26.4,4.4 25,1.6 M33,9.4 C31.6,7 34.4,5 33,2.6', 'r1')));
write('rock_2.svg', svg(48, 48, rock(
  'M8,27 C7,19 13,13.6 20,13 C25,10.4 33,11 37.6,16 C42.6,20.6 42,30 38.4,35.6 C35,41 26,42.4 19,41.4 C12,40.4 8.6,34 8,27 Z',
  'M14,30 L19.4,26 L24.6,29.4 L27.6,24 M24.6,29.4 L26,35.4 M27.6,24 L33.4,22.6',
  'M20,9.4 C18.6,7 21.4,5 20,2.6 M29,9 C27.6,6.6 30.4,4.6 29,2', 'r2')));

/* ============================== HUD ============================== */
const HEART = 'M24,42 C14,35 5,28 5,18 C5,11 10,6.5 16,6.5 C20,6.5 22.6,8.6 24,11.4 C25.4,8.6 28,6.5 32,6.5 C38,6.5 43,11 43,18 C43,28 34,35 24,42 Z';
write('heart_full.svg', svg(48, 48, `<path d="${HEART}" fill="#ff5a6e" stroke="#8a1a33" stroke-width="3" ${R}/>
<path d="M8,20 C9,30 18,36 24,40 C30,36 39,30 40,20 C37,28 30,33 24,36 C18,33 11,28 8,20 Z" fill="#e23a55"/>
<path d="M11,15 C12,12 14,10.6 17,10.4" fill="none" stroke="#fff" stroke-width="3" opacity=".95" ${R}/>
<circle cx="11" cy="19.4" r="1.6" fill="#fff" opacity=".9"/>`));
write('heart_empty.svg', svg(48, 48, `<path d="${HEART}" fill="#4a3550" fill-opacity=".45" stroke="#5a2a48" stroke-width="3" ${R}/>
<path d="M24,36.6 C16,31 9.6,25.6 9.6,18.4 C9.6,13.6 12.6,10.8 16.2,10.8 C19.6,10.8 21.6,13 24,16.6 C26.4,13 28.4,10.8 31.8,10.8 C35.4,10.8 38.4,13.6 38.4,18.4 C38.4,25.6 32,31 24,36.6 Z" fill="none" stroke="#f3dbe9" stroke-width="1.8" stroke-dasharray="2.4 3" opacity=".9" ${R}/>`));
const DROP = 'M24,4 C29,13 39,22 39,31 C39,39.4 32.4,45 24,45 C15.6,45 9,39.4 9,31 C9,22 19,13 24,4 Z';
write('drop.svg', svg(48, 48, `<defs><clipPath id="dc"><path d="${DROP}"/></clipPath></defs>
<path d="${DROP}" fill="#4fb4ff"/>
<g clip-path="url(#dc)"><ellipse cx="30" cy="40" rx="16" ry="10" fill="#2a86e0"/></g>
<path d="${DROP}" fill="none" stroke="#1b4f8f" stroke-width="3" ${R}/>
<path d="M15.4,30 C15.4,25 18,20.6 21,17" fill="none" stroke="#fff" stroke-width="3.2" ${R}/>
<circle cx="15.8" cy="35.4" r="1.8" fill="#fff"/>`));
// cloth pouch with drawstring
const POUCH = 'M22,22 C12,28 6,40 7,52 C8,63 18,69 32,69 C46,69 56,63 57,52 C58,40 52,28 42,22 Z';
write('pouch.svg', svg(64, 72, `<defs><clipPath id="pc2"><path d="${POUCH}"/></clipPath></defs>
<path d="${POUCH}" fill="#c88a52"/>
<g clip-path="url(#pc2)">
  <ellipse cx="40" cy="62" rx="26" ry="14" fill="#a56a38"/>
  <path d="M24,26 C20,38 20,52 24,66 M40,26 C44,38 44,52 40,66" fill="none" stroke="#a56a38" stroke-width="1.6" opacity=".8"/>
</g>
<path d="${POUCH}" fill="none" stroke="#5e3416" stroke-width="3" ${R}/>
<path d="M13,44 C13.6,37 16.4,32 20,28.6" fill="none" stroke="#f2c89a" stroke-width="2.6" ${R}/>
<path d="M20,22 C14,16 14,9 20,5.6 C25,3 29,7 32,12 C35,7 39,3 44,5.6 C50,9 50,16 44,22 Z" fill="#d89a60" stroke="#5e3416" stroke-width="3" ${R}/>
<path d="M24,14 L28,20 M32,13 L32,20 M40,14 L36,20" stroke="#a56a38" stroke-width="1.6" ${R}/>
<path d="M18,22.6 C26,25.6 38,25.6 46,22.6" fill="none" stroke="#5e3416" stroke-width="5" ${R}/>
<path d="M18,22.6 C26,25.6 38,25.6 46,22.6" fill="none" stroke="#ff6f6f" stroke-width="2.6" ${R}/>
<path d="M44,24 C48,28 47,33 44,36" fill="none" stroke="#5e3416" stroke-width="4.6" ${R}/>
<path d="M44,24 C48,28 47,33 44,36" fill="none" stroke="#ff6f6f" stroke-width="2.2" ${R}/>
<circle cx="44" cy="37" r="2.6" fill="#ffd84a" stroke="#7a4a02" stroke-width="1.6"/>
<circle cx="32" cy="47" r="9.4" fill="#ffd84a" stroke="#7a4a02" stroke-width="2.4"/>
<path d="${star5(32, 47.4, 5.6, 2.6)}" fill="#e09a10"/>
<path d="M26.4,44 C27.2,41.4 29,40 31,39.6" fill="none" stroke="#fff4b0" stroke-width="1.6" ${R}/>`));

/* ============================== ICON ============================== */
function inner(name, pre) {
  const s = fs.readFileSync(path.join(OUT, name + '.svg'), 'utf8');
  return s.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '')
    .replace(/id="(\w+)"/g, `id="${pre}_$1"`).replace(/url\(#(\w+)\)/g, `url(#${pre}_$1)`);
}
// Puff at (128,100) scale 1.25 => attach points; basket below; ropes in between
const PS = 1.2, PX = 128 - 60 * PS, PY = 86 - 50 * PS;
const BS = 1.0, BX = 128 - 48 * BS, BY = 86 + 50 - 16 * BS;
const att = (x, y) => [f1(PX + x * PS), f1(PY + y * PS)];
const hang = (x, y) => [f1(BX + x * BS), f1(BY + y * BS)];
const [a1, a2, h1, h2] = [att(34, 72), att(86, 72), hang(10, 16), hang(86, 16)];
const ROPE = `#8a5a2b`;
write('icon.svg', svg(256, 256, `<defs>
  <radialGradient id="ib" cx="0.5" cy="0.32" r="0.75">
    <stop offset="0" stop-color="#bff6ef"/><stop offset="0.55" stop-color="#4fd1c5"/><stop offset="1" stop-color="#1f9fa0"/>
  </radialGradient>
  <clipPath id="ic"><circle cx="128" cy="128" r="114"/></clipPath>
</defs>
<circle cx="128" cy="128" r="122" fill="#0f5d66"/>
<circle cx="128" cy="128" r="114" fill="url(#ib)"/>
<g clip-path="url(#ic)">
  <path d="M140,236 L184,140 C189,132 203,132 208,140 L256,236 Z" fill="#8a6a7e" stroke="#4a3046" stroke-width="4" ${R}/>
  <path d="M187,140 C193,147 199,147 205,140" fill="none" stroke="#ff9a3a" stroke-width="5" ${R}/>
  <g fill="#ffffff" opacity=".85"><circle cx="196" cy="124" r="6"/><circle cx="206" cy="113" r="8"/><circle cx="219" cy="100" r="6"/></g>
  <ellipse cx="128" cy="244" rx="160" ry="34" fill="#ffe2a4"/>
  <path d="M-10,214 C40,206 80,212 128,210 C180,208 220,204 270,212" fill="none" stroke="#fff" stroke-width="5" opacity=".55" ${R}/>
</g>
<g transform="translate(${PX},${PY}) scale(${PS})">${inner('puff_happy', 'ip')}</g>
<g stroke="${ROPE}" stroke-width="3.4" ${R}><path d="M${a1} L${h1}"/><path d="M${a2} L${h2}"/></g>
<g transform="translate(${BX},${BY}) scale(${BS})">${inner('basket', 'ib1')}</g>
<g transform="translate(${f1(128 - 21)},${f1(BY - 18)}) scale(.875)">${inner('coin_gold', 'ig')}</g>
<g transform="translate(${BX},${BY}) scale(${BS})">${inner('basket_front', 'ib2')}</g>
<circle cx="128" cy="128" r="118" fill="none" stroke="#e8fffb" stroke-width="5" opacity=".95"/>`));
console.log('wrote to', OUT);
