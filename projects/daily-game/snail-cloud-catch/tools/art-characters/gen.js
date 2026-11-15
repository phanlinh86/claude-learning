// Generates Shelly's Sky Catch character + item SVGs. 100% original hand-written artwork.
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

// 5-point star with rounded ("puffy") tips and soft inner corners -> clean path usable for clipping.
function puffyStar(cx, cy, ro, ri, cutO, cutI, rot = -90) {
  const v = [];
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * Math.PI / 180, r = i % 2 ? ri : ro;
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  let d = '';
  for (let i = 0; i < 10; i++) {
    const p = v[i], pr = v[(i + 9) % 10], nx = v[(i + 1) % 10];
    const c = i % 2 ? cutI : cutO;
    const u = (q) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return [p[0] + dx / L * c, p[1] + dy / L * c]; };
    const a = u(pr), b = u(nx);
    d += `${i ? ' L' : 'M'}${f1(a[0])},${f1(a[1])} Q${f1(p[0])},${f1(p[1])} ${f1(b[0])},${f1(b[1])}`;
  }
  return d + ' Z';
}
function star5(cx, cy, ro, ri = ro * 0.5, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * Math.PI / 180, r = i % 2 ? ri : ro;
    d += (i ? ' L' : 'M') + f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a));
  }
  return d + ' Z';
}

/* ============================== SHELLY ============================== */
// Palette: mint/teal snail, coral shell with cream spiral, silver-blue jetpack with a red button.
const S = {
  body: '#86e3c6', shade: '#55c4a7', light: '#d6fff1', sole: '#c4f2e2', line: '#1f7a68',
  shell: '#ff8a5c', shellShade: '#e9683f', shellLight: '#ffb995', shellLine: '#9c3f26', spiral: '#fff1d6', groove: '#d65a33',
  jet: '#aecbe6', jetShade: '#7d9dc2', jetLight: '#eef6fd', jetLine: '#385276', button: '#ff4d5e', buttonLine: '#8f1c2b', strap: '#5b6f93',
  eye: '#23264f', white: '#ffffff', cheek: '#ff9db5', mouth: '#c8365c', tongue: '#ff9bb3',
};
// Body = foot along the bottom + neck rising to the head on the right. Identical in every frame.
const BODY = 'M31,91 C22,91 19,85 25,80.6 C31,76.4 42,74 56,73.6 L82,73 C82.6,60 85,48.6 94,44.2 C104.6,39.2 115,46.4 115,59 C115,71 113,83 107,89.6 C105,91 103,91.4 100,91.4 Z';
// Shell: broad dome, flat-ish top at y~24 between x~44..78 (the basket rests there).
const SHELL = 'M31,75 C26.4,62 27.4,44 37.6,33.6 C43,28 49,24.6 58,24 L70,24 C78,24.4 84,28.6 87.4,34.4 C93,44 93,62 88.6,75 C72,80.4 47,80.4 31,75 Z';
function spiralPath(cx, cy, turns, r0, r1, a0 = 0) {
  const n = 64; let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * 2 * Math.PI, r = r0 + (r1 - r0) * t;
    d += (i ? ' L' : 'M') + f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a) * 0.92);
  }
  return d;
}
const SPIRAL = spiralPath(60, 50, 2.25, 1.6, 17.5, -0.4);
// Jetpack: local coords, rotated so the nozzle points down-left; nozzle tip -> (22,78).
const JX = 32.2, JY = 56.2, JROT = 25;
function jetpack(glow) {
  const g = glow ? `<ellipse cx="0" cy="23.4" rx="5.4" ry="2.4" fill="#ffd34d"/><ellipse cx="0" cy="23.2" rx="3" ry="1.3" fill="#fff6c8"/>` :
    `<ellipse cx="0" cy="23.4" rx="5" ry="2.2" fill="#2c3f5c"/>`;
  return `<g transform="translate(${JX},${JY}) rotate(${JROT})">
  <path d="M-6.2,13 L-5,23.4 L5,23.4 L6.2,13 Z" fill="${S.jetShade}" stroke="${S.jetLine}" stroke-width="2.6" ${R}/>
  ${g}
  <rect x="-9" y="-19" width="18" height="33" rx="8.4" fill="${S.jet}" stroke="${S.jetLine}" stroke-width="3"/>
  <path d="M2.6,-16.6 C7,-14 7,-4 7,6 C7,10 5,12 2.4,12.4 C4.4,4 4.6,-8 2.6,-16.6 Z" fill="${S.jetShade}"/>
  <path d="M-5,-12 L-5,3" stroke="${S.jetLight}" stroke-width="2.6" ${R}/>
  <path d="M-9,5.4 L9,5.4" stroke="${S.jetLine}" stroke-width="2" ${R}/>
  <circle cx="0" cy="-10.6" r="3.4" fill="${S.button}" stroke="${S.buttonLine}" stroke-width="1.8"/>
  <circle cx="-1" cy="-11.6" r="1" fill="#fff"/>
</g>`;
}
function shellyBody(glow) {
  return `<defs>
  <clipPath id="sb"><path d="${BODY}"/></clipPath>
  <clipPath id="ss"><path d="${SHELL}"/></clipPath>
</defs>
<path d="${BODY}" fill="${S.body}"/>
<g clip-path="url(#sb)">
  <path d="M10,84 C40,87 80,87 120,82 L120,100 L10,100 Z" fill="${S.sole}"/>
  <path d="M10,86.4 C40,89.4 80,89.4 120,84.4" fill="none" stroke="${S.shade}" stroke-width="1.8"/>
  <path d="M108,46 C116,54 116,72 110,92 L122,92 L122,40 Z" fill="${S.shade}"/>
  <ellipse cx="110" cy="72" rx="4" ry="2.2" fill="${S.cheek}" opacity=".0"/>
</g>
<path d="${BODY}" fill="none" stroke="${S.line}" stroke-width="3" ${R}/>
<path d="M88.4,58 C89,52 91.4,48.6 95,47" fill="none" stroke="${S.light}" stroke-width="2.6" ${R}/>
<path d="${SHELL}" fill="${S.shell}"/>
<g clip-path="url(#ss)">
  <path d="M94,30 C90,56 74,72 40,80 L96,82 Z" fill="${S.shellShade}"/>
  <path d="${SPIRAL}" fill="none" stroke="${S.groove}" stroke-width="6" ${R}/>
  <path d="${SPIRAL}" fill="none" stroke="${S.spiral}" stroke-width="3.4" ${R}/>
  <path d="M26,69.6 C46,75 74,75 94,69.6 L94,82 L26,82 Z" fill="${S.strap}"/>
  <path d="M26,69.6 C46,75 74,75 94,69.6" fill="none" stroke="#8ea3c4" stroke-width="1.4"/>
</g>
<path d="${SHELL}" fill="none" stroke="${S.shellLine}" stroke-width="3" ${R}/>
<path d="M36.6,44 C38.6,37 43,31.6 49,28.8" fill="none" stroke="${S.shellLight}" stroke-width="3" ${R}/>
<circle cx="35.4" cy="50" r="1.6" fill="${S.shellLight}"/>
${jetpack(glow)}`;
}
// Face: two eye stalks (far one behind, slightly darker) + mouth on the head front.
const STALK = (d, far) => `<path d="${d}" fill="none" stroke="${S.line}" stroke-width="${far ? 6.4 : 7}" ${R}/><path d="${d}" fill="none" stroke="${far ? S.shade : S.body}" stroke-width="${far ? 3.4 : 4}" ${R}/>`;
const EYEBALL = (cx, cy, r, px = 1.6, py = 0.4, pr = 3.6) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${S.white}" stroke="${S.line}" stroke-width="2.4"/>
<circle cx="${f1(cx + px)}" cy="${f1(cy + py)}" r="${pr}" fill="${S.eye}"/>
<circle cx="${f1(cx + px + pr * .35)}" cy="${f1(cy + py - pr * .4)}" r="${f1(pr * .38)}" fill="#fff"/>`;
const KNOB = (cx, cy, r, far) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${far ? S.shade : S.body}" stroke="${S.line}" stroke-width="2.4"/>`;
const cheek = (op = .7, s = 1) => `<ellipse cx="103" cy="66" rx="${f1(4.4 * s)}" ry="${f1(2.8 * s)}" fill="${S.cheek}" opacity="${op}"/>`;
const STALKS = {
  calm: ['M95,47 C94,41.6 94,37 94.6,32.6', 'M104,44.6 C105.6,39 107.6,34 109.6,29.4'],
  happy: ['M95,47 C93.4,42 92.6,38 92.6,34', 'M104,44.6 C106.6,39.4 109.4,35 112,31'],
  zap: ['M95,47 L92.4,43.4 L96,40 L92.6,36.4 L94,32.4', 'M104,44.6 L107.4,40.6 L104,37 L108.6,33 L108.6,28.6'],
  jet: ['M95,47 C93,42.4 91,39 88.6,36.4', 'M104,44.6 C103.6,39.6 103,35 101.6,31'],
};
const FACE = {
  idle: () => `${STALK(STALKS.calm[0], 1)}${EYEBALL(94.6, 30.4, 6.2, 1.6, .6, 3.2)}
${STALK(STALKS.calm[1])}${EYEBALL(110, 26.4, 7.2, 1.8, .6, 3.8)}
${cheek()}
<path d="M106.6,61 C108.4,64.4 111.4,64.6 113.4,62.4" fill="none" stroke="${S.eye}" stroke-width="2.4" ${R}/>`,
  happy: () => `${STALK(STALKS.happy[0], 1)}${KNOB(92.6, 31.4, 6, 1)}
<path d="M89.4,33.2 C90.4,29.2 94.8,29.2 95.8,33.2" fill="none" stroke="${S.eye}" stroke-width="2.6" ${R}/>
${STALK(STALKS.happy[1])}${KNOB(112, 28, 6.8)}
<path d="M108.2,30.2 C109.4,25.4 114.6,25.4 115.8,30.2" fill="none" stroke="${S.eye}" stroke-width="3" ${R}/>
${cheek(.9, 1.15)}
<path d="M104.6,60 C106,68 112.6,68.6 114.6,61.4 C111,62.4 107.6,61.8 104.6,60 Z" fill="${S.mouth}" stroke="${S.eye}" stroke-width="2" ${R}/>
<path d="M107.4,64.4 C109,63.4 111,63.6 112.2,64.6 C110.8,66.2 108.6,66 107.4,64.4 Z" fill="${S.tongue}"/>
${sparkle(100, 15, 3.6, '#fffbe0', '#c7861a', 1)}`,
  zap: () => `${STALK(STALKS.zap[0], 1)}${EYEBALL(94, 28.6, 6.8, 0.6, 0, 1.8)}
${STALK(STALKS.zap[1])}${EYEBALL(109.4, 23.2, 7.8, 0.6, 0, 2.1)}
<path d="M87,22.4 L89.6,20.4 M101.6,15.4 L103.4,12.6 M116.6,15 L114.6,12.4" stroke="${S.line}" stroke-width="2" ${R}/>
${cheek(.8)}
<ellipse cx="110.4" cy="63" rx="2.6" ry="3.2" fill="${S.mouth}" stroke="${S.eye}" stroke-width="2"/>
<g fill="none" stroke-width="3.6" ${R}><path d="M114,44 L118,41.6 L115.4,39.6 L119,36.6" stroke="#b07a00"/><path d="M84,40 L80.6,37.6 L83.4,36 L80,33" stroke="#b07a00"/></g>
<g fill="none" stroke-width="1.8" ${R}><path d="M114,44 L118,41.6 L115.4,39.6 L119,36.6" stroke="#ffe14a"/><path d="M84,40 L80.6,37.6 L83.4,36 L80,33" stroke="#ffe14a"/></g>`,
  jet: () => `${STALK(STALKS.jet[0], 1)}${EYEBALL(88.6, 35, 6, 2, .6, 3.1)}
<path d="M82.6,32.4 C85,29.6 90.6,29 94.2,31.6" fill="none" stroke="${S.line}" stroke-width="2.6" ${R}/>
${STALK(STALKS.jet[1])}${EYEBALL(101.6, 28.6, 7.2, 2.2, .8, 3.7)}
<path d="M94.4,25.2 C97.4,21.6 104.8,21.2 108.8,24.2" fill="none" stroke="${S.line}" stroke-width="3" ${R}/>
${cheek(.7)}
<path d="M105.4,61 C108,65.6 112,65.6 114.4,61.6" fill="none" stroke="${S.eye}" stroke-width="2.6" ${R}/>
<path d="M105.4,61 L104.2,59.6" stroke="${S.eye}" stroke-width="2.2" ${R}/>`,
};
for (const f of Object.keys(FACE)) write(`shelly_${f}.svg`, svg(120, 100, `${shellyBody(f === 'jet')}\n${FACE[f]()}`));

/* ============================== BASKET ============================== */
// Rim centre (40,14). The basket base sits at y~39 (= Shelly's shell top when drawn at rimY = y - 46, see report).
const B = { base: '#e0a25a', light: '#f7cf8e', dark: '#b06f2c', line: '#76420f', inside: '#8c5321', insideDeep: '#6a3c16', rim: '#cc8a3e' };
const BODY_B = 'M6,14 C6.6,25 12,34.6 22,38.4 C30,41 50,41 58,38.4 C68,34.6 73.4,25 74,14 Z';
function weave() {
  let s = '';
  for (let r = 0; r < 4; r++) {
    const y = 17 + r * 6.2, off = r % 2 ? 5 : 0;
    for (let x = -2 + off; x < 84; x += 10) s += `<rect x="${x}" y="${f1(y)}" width="9.2" height="5.2" rx="2.6" fill="${B.light}" stroke="${B.dark}" stroke-width="1.1"/>`;
  }
  return s;
}
const rimFront = 'M6,14 C6,20.4 22,23.4 40,23.4 C58,23.4 74,20.4 74,14';
const rimBack = 'M6,14 C6,7.6 22,5.4 40,5.4 C58,5.4 74,7.6 74,14';
const basketFront = (id) => `<defs><clipPath id="${id}"><path d="${BODY_B}"/></clipPath></defs>
<path d="${BODY_B}" fill="${B.base}"/>
<g clip-path="url(#${id})">${weave()}
  <path d="M52,14 C62,24 68,32 80,34 L80,44 L50,44 Z" fill="${B.dark}" opacity=".35"/>
  <path d="M0,12 C10,22 22,25 40,25.6 C58,25 70,22 80,12 L80,28 L0,28 Z" fill="${B.dark}" opacity=".28"/>
</g>
<path d="${BODY_B}" fill="none" stroke="${B.line}" stroke-width="3" ${R}/>
<path d="M12.6,24 C14,30 17,34 21,36" fill="none" stroke="#fff3d6" stroke-width="2.2" opacity=".85" ${R}/>
<path d="${rimFront}" fill="none" stroke="${B.line}" stroke-width="7.4" ${R}/>
<path d="${rimFront}" fill="none" stroke="${B.rim}" stroke-width="4.2" ${R}/>
<path d="${rimFront}" fill="none" stroke="${B.light}" stroke-width="4.2" stroke-dasharray="2.8 3.2" ${R}/>`;
write('basket.svg', svg(80, 60, `<ellipse cx="40" cy="14" rx="34" ry="8.6" fill="${B.inside}"/>
<ellipse cx="40" cy="16.4" rx="27" ry="5.2" fill="${B.insideDeep}"/>
<path d="${rimBack}" fill="none" stroke="${B.line}" stroke-width="7.4" ${R}/>
<path d="${rimBack}" fill="none" stroke="${B.rim}" stroke-width="4.2" ${R}/>
<path d="${rimBack}" fill="none" stroke="${B.light}" stroke-width="4.2" stroke-dasharray="2.8 3.2" ${R}/>
${basketFront('bk')}`));
write('basket_front.svg', svg(80, 60, basketFront('bf')));

/* ============================== STARS ============================== */
const STAR = {
  yellow: { fill: '#ffd23f', shade: '#f2a91c', light: '#fff6c2', line: '#9a5a00' },
  pink: { fill: '#ff7cbc', shade: '#e8519a', light: '#ffd6ec', line: '#93245e' },
  blue: { fill: '#5cc6ff', shade: '#2f9be6', light: '#d4f1ff', line: '#1a5a96' },
};
function starFace(cx, cy, s, eye = '#3a2410') {
  return `<ellipse cx="${f1(cx - 4.4 * s)}" cy="${f1(cy)}" rx="${f1(1.9 * s)}" ry="${f1(2.5 * s)}" fill="${eye}"/>
<ellipse cx="${f1(cx + 4.4 * s)}" cy="${f1(cy)}" rx="${f1(1.9 * s)}" ry="${f1(2.5 * s)}" fill="${eye}"/>
<circle cx="${f1(cx - 3.8 * s)}" cy="${f1(cy - 1 * s)}" r="${f1(.75 * s)}" fill="#fff"/><circle cx="${f1(cx + 5 * s)}" cy="${f1(cy - 1 * s)}" r="${f1(.75 * s)}" fill="#fff"/>
<path d="M${f1(cx - 2.2 * s)},${f1(cy + 3.4 * s)} C${f1(cx - 1 * s)},${f1(cy + 5.2 * s)} ${f1(cx + 1 * s)},${f1(cy + 5.2 * s)} ${f1(cx + 2.2 * s)},${f1(cy + 3.4 * s)}" fill="none" stroke="${eye}" stroke-width="${f1(1.6 * s)}" ${R}/>
<ellipse cx="${f1(cx - 7.4 * s)}" cy="${f1(cy + 3 * s)}" rx="${f1(2 * s)}" ry="${f1(1.3 * s)}" fill="#ff6f91" opacity=".55"/>
<ellipse cx="${f1(cx + 7.4 * s)}" cy="${f1(cy + 3 * s)}" rx="${f1(2 * s)}" ry="${f1(1.3 * s)}" fill="#ff6f91" opacity=".55"/>`;
}
function star(C, id, cx = 24, cy = 24.6, ro = 21, ri = 11, sc = 1) {
  const d = puffyStar(cx, cy, ro, ri, 4.4 * sc, 2.4 * sc);
  return `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>
<path d="${d}" fill="${C.fill}"/>
<g clip-path="url(#${id})"><path d="M${cx + ro},${f1(cy - ro * .5)} C${f1(cx + ro * .3)},${f1(cy + ro * .5)} ${f1(cx - ro * .3)},${f1(cy + ro * .62)} ${cx - ro},${f1(cy + ro * .5)} L${cx - ro},${cy + ro} L${cx + ro},${cy + ro} Z" fill="${C.shade}"/></g>
<path d="${d}" fill="none" stroke="${C.line}" stroke-width="${f1(2.8 * sc)}" ${R}/>
<path d="M${f1(cx - 3.4 * sc)},${f1(cy - 11.6 * sc)} C${f1(cx - 2.4 * sc)},${f1(cy - 14.6 * sc)} ${f1(cx - 1 * sc)},${f1(cy - 16.4 * sc)} ${f1(cx)},${f1(cy - 17 * sc)}" fill="none" stroke="${C.light}" stroke-width="${f1(2.6 * sc)}" ${R}/>
<path d="M${f1(cx - 13 * sc)},${f1(cy - 4.6 * sc)} L${f1(cx - 8 * sc)},${f1(cy - 4.8 * sc)}" stroke="${C.light}" stroke-width="${f1(2.2 * sc)}" ${R}/>
${starFace(cx, cy + 1 * sc, sc, C.line === '#1a5a96' ? '#12345a' : C.line === '#93245e' ? '#5a1238' : '#4a2a00')}`;
}
for (const k of Object.keys(STAR)) write(`star_${k}.svg`, svg(48, 48, star(STAR[k], 's' + k[0])));
// Gold: bigger, deeper gold, white-cream halo ring and 4 sparkle points.
const GOLD = { fill: '#ffc21a', shade: '#e48a00', light: '#fff7c4', line: '#7a3f00' };
write('star_gold.svg', svg(64, 64, `<defs><radialGradient id="gh"><stop offset=".55" stop-color="#fffbe6" stop-opacity=".95"/><stop offset=".8" stop-color="#ffe9a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient></defs>
<circle cx="32" cy="32.6" r="31.6" fill="url(#gh)"/>
<circle cx="32" cy="32.6" r="26.6" fill="none" stroke="#ffffff" stroke-width="3.4" opacity=".95"/>
<circle cx="32" cy="32.6" r="26.6" fill="none" stroke="#ffd86a" stroke-width="1.2" stroke-dasharray="1 4.2" opacity=".9" ${R}/>
${star(GOLD, 'sg', 32, 33.4, 25, 13, 1.2)}
${sparkle(8, 9, 5.4, '#ffffff', '#c7861a', 1.1)}${sparkle(56.4, 10, 4.2, '#ffffff', '#c7861a', 1)}${sparkle(57, 54, 4.6, '#ffffff', '#c7861a', 1)}${sparkle(6.6, 52, 3.6, '#ffffff', '#c7861a', 1)}`));

/* ============================== THUNDER PUFF ============================== */
const T = { body: '#6f74b0', shade: '#565a96', light: '#a3a8dc', line: '#2e3066', eye: '#1b1c3e', cheek: '#c99bd8', zig: '#ffd93d', zigLine: '#a06a00' };
const TL = [['c', 32, 17, 11], ['c', 19.6, 23, 8.6], ['c', 44.6, 22, 9.4], ['c', 11.4, 31.4, 7], ['c', 52.6, 31, 7.4], ['e', 32, 32, 22, 10.6]];
const lump = (l, extra) => l[0] === 'c' ? `<circle cx="${l[1]}" cy="${l[2]}" r="${l[3]}" ${extra}/>` : `<ellipse cx="${l[1]}" cy="${l[2]}" rx="${l[3]}" ry="${l[4]}" ${extra}/>`;
function thunder(id, f2) {
  const zig = f2 ? 'M36,38 L27.6,46.6 L32.4,46.8 L28,54.6 L38.4,44 L33.4,43.8 L37.6,38 Z' : 'M28,38 L36.4,46.6 L31.6,46.8 L36,54.6 L25.6,44 L30.6,43.8 L26.4,38 Z';
  const ch = f2 ? 4.2 : 3.2;
  return `<path d="${zig}" fill="${T.zig}" stroke="${T.zigLine}" stroke-width="2.4" ${R}/>
<defs><clipPath id="${id}">${TL.map(l => lump(l, '')).join('')}</clipPath></defs>
${TL.map(l => lump(l, `fill="${T.line}" stroke="${T.line}" stroke-width="5.6"`)).join('')}
${TL.map(l => lump(l, `fill="${T.body}"`)).join('')}
<g clip-path="url(#${id})">
  <path d="M0,33 C14,39 50,39 64,33 L64,56 L0,56 Z" fill="${T.shade}"/>
  <path d="M24,11 C26,7.6 30,6.4 34,6.8 M12,17.4 C14.4,15 17.4,14.4 20,14.8 M41,14.6 C43.4,12.8 46.6,12.6 49,13.6" fill="none" stroke="${T.light}" stroke-width="2.6" ${R}/>
</g>
<path d="M22.6,24.4 C24.6,23.6 26.6,24 28,25.2 M41.4,24.4 C39.4,23.6 37.4,24 36,25.2" stroke="${T.eye}" stroke-width="2.4" ${R}/>
<ellipse cx="25.6" cy="29" rx="2.4" ry="2.9" fill="${T.eye}"/><ellipse cx="38.4" cy="29" rx="2.4" ry="2.9" fill="${T.eye}"/>
<circle cx="26.4" cy="28" r=".9" fill="#fff"/><circle cx="39.2" cy="28" r=".9" fill="#fff"/>
<ellipse cx="${f1(18.6 - (f2 ? .6 : 0))}" cy="33.4" rx="${ch}" ry="${f1(ch * .7)}" fill="${T.cheek}" opacity="${f2 ? .95 : .75}"/>
<ellipse cx="${f1(45.4 + (f2 ? .6 : 0))}" cy="33.4" rx="${ch}" ry="${f1(ch * .7)}" fill="${T.cheek}" opacity="${f2 ? .95 : .75}"/>
${f2 ? `<ellipse cx="32" cy="35" rx="3" ry="2.2" fill="${T.shade}" stroke="${T.eye}" stroke-width="1.8"/>`
    : `<path d="M28.6,36 C30.4,33.6 33.6,33.6 35.4,36" fill="none" stroke="${T.eye}" stroke-width="2" ${R}/>`}`;
}
write('thunder.svg', svg(64, 56, thunder('t1', false)));
write('thunder_2.svg', svg(64, 56, thunder('t2', true)));

/* ============================== HUD ============================== */
const HEART = 'M24,42 C14,35 5,28 5,18 C5,11 10,6.5 16,6.5 C20,6.5 22.6,8.6 24,11.4 C25.4,8.6 28,6.5 32,6.5 C38,6.5 43,11 43,18 C43,28 34,35 24,42 Z';
write('heart_full.svg', svg(48, 48, `<path d="${HEART}" fill="#ff5a6e" stroke="#8a1a33" stroke-width="3" ${R}/>
<path d="M8,20 C9,30 18,36 24,40 C30,36 39,30 40,20 C37,28 30,33 24,36 C18,33 11,28 8,20 Z" fill="#e23a55"/>
<path d="M11,15 C12,12 14,10.6 17,10.4" fill="none" stroke="#fff" stroke-width="3" opacity=".95" ${R}/>
<circle cx="11" cy="19.4" r="1.6" fill="#fff" opacity=".9"/>`));
write('heart_empty.svg', svg(48, 48, `<path d="${HEART}" fill="#ffffff" fill-opacity=".28" stroke="#5a4680" stroke-width="3" ${R}/>
<path d="M24,36.6 C16,31 9.6,25.6 9.6,18.4 C9.6,13.6 12.6,10.8 16.2,10.8 C19.6,10.8 21.6,13 24,16.6 C26.4,13 28.4,10.8 31.8,10.8 C35.4,10.8 38.4,13.6 38.4,18.4 C38.4,25.6 32,31 24,36.6 Z" fill="none" stroke="#efe0f6" stroke-width="1.8" stroke-dasharray="2.4 3" opacity=".9" ${R}/>`));

// Glass star jar with a cork.
const JAR = 'M16,20 C10,24 8,30 8,38 L8,58 C8,65 13,69 20,69 L44,69 C51,69 56,65 56,58 L56,38 C56,30 54,24 48,20 Z';
write('jar.svg', svg(64, 72, `<defs><clipPath id="jc"><path d="${JAR}"/></clipPath></defs>
<path d="${JAR}" fill="#e6f6ff" fill-opacity=".55"/>
<g clip-path="url(#jc)">
  <path d="M8,56 C20,52 44,52 56,56 L56,72 L8,72 Z" fill="#ffd23f" opacity=".5"/>
  <path d="${star5(22, 58, 6, 3, -80)}" fill="#ffd23f" stroke="#9a5a00" stroke-width="1.4" ${R}/>
  <path d="${star5(38, 60, 5.4, 2.7, -100)}" fill="#ff7cbc" stroke="#93245e" stroke-width="1.4" ${R}/>
  <path d="${star5(48, 54, 4.4, 2.2, -90)}" fill="#5cc6ff" stroke="#1a5a96" stroke-width="1.2" ${R}/>
  <path d="M46,24 C52,30 52,46 52,64 L60,64 L60,20 Z" fill="#9fc4dc" opacity=".35"/>
</g>
<path d="${JAR}" fill="none" stroke="#3c6a8c" stroke-width="3" ${R}/>
<path d="M14,34 C14,30 15.6,27 18.4,25" fill="none" stroke="#fff" stroke-width="3" ${R}/>
<path d="M14,40 L14,52" stroke="#fff" stroke-width="3" opacity=".8" ${R}/>
<rect x="13" y="15" width="38" height="8" rx="4" fill="#cfe8f6" stroke="#3c6a8c" stroke-width="2.6"/>
<path d="M18,15 L19,5.6 C19.2,3.8 20.6,3 22.4,3 L41.6,3 C43.4,3 44.8,3.8 45,5.6 L46,15 Z" fill="#c98a4e" stroke="#6b3d14" stroke-width="2.6" ${R}/>
<path d="M22,7 L42,7" stroke="#a86b34" stroke-width="1.6" ${R}/><circle cx="27" cy="11" r="1" fill="#8a5525"/><circle cx="37" cy="10" r="1" fill="#8a5525"/>
<path d="M23,6 C23,5 24,4.6 25,4.6" fill="none" stroke="#e8b885" stroke-width="1.6" ${R}/>`));

// Rocket / jetpack icon for the Jet Hop meter (tilted up-right).
write('rocket.svg', svg(48, 48, `<g transform="rotate(40 24 24)">
  <path d="M19.4,33 C17,37 17.6,42 24,46 C30.4,42 31,37 28.6,33 Z" fill="#ff9a3a" stroke="#a8431a" stroke-width="2" ${R}/>
  <path d="M21.6,34 C20.6,37 21.4,40 24,42 C26.6,40 27.4,37 26.4,34 Z" fill="#ffe46a"/>
  <path d="M17,24 L9.6,31 L10.6,35.4 L18,32 Z M31,24 L38.4,31 L37.4,35.4 L30,32 Z" fill="#ff4d5e" stroke="#8f1c2b" stroke-width="2.2" ${R}/>
  <path d="M24,3 C31,8 33,18 31.4,33 L16.6,33 C15,18 17,8 24,3 Z" fill="#e8f2fb" stroke="#385276" stroke-width="2.8" ${R}/>
  <path d="M26.6,6.6 C30,11 30.6,20 29.4,31 L26,31 C27,22 27,12 26.6,6.6 Z" fill="#aecbe6"/>
  <circle cx="24" cy="17" r="4.4" fill="#5cc6ff" stroke="#385276" stroke-width="2.2"/>
  <circle cx="22.8" cy="15.8" r="1.3" fill="#fff"/>
  <path d="M24,33 L24,38" stroke="#385276" stroke-width="2.2" ${R}/>
</g>`));

// Windsock on a pole (pole at x~6), pointing right.
const SOCK = 'M9,7 C24,8 42,10.6 58,13.4 C59.6,14 59.6,17.6 58,18.4 C42,21 24,23.6 9,25 Z';
const bands = [[9, 21], [21, 33], [33, 45], [45, 60]];
write('windsock.svg', svg(64, 48, `<defs><clipPath id="wc"><path d="${SOCK}"/></clipPath></defs>
<path d="${SOCK}" fill="#ffffff"/>
<g clip-path="url(#wc)">${bands.map(([a, b], i) => i % 2 ? '' : `<rect x="${a}" y="0" width="${b - a}" height="30" fill="#ff5a6e"/>`).join('')}
  <path d="M0,18 C24,20 44,18.6 64,16.4 L64,30 L0,30 Z" fill="#2a2a5a" opacity=".16"/>
</g>
<path d="${SOCK}" fill="none" stroke="#7a2a3e" stroke-width="2.6" ${R}/>
<ellipse cx="9" cy="16" rx="2.4" ry="9" fill="#ffd6dd" stroke="#7a2a3e" stroke-width="2.2"/>
<path d="M6,4 L6,46" stroke="#4d4a6e" stroke-width="5" ${R}/><path d="M6,4 L6,46" stroke="#b9b8d6" stroke-width="2.2" ${R}/>
<circle cx="6" cy="4" r="3.2" fill="#ffd23f" stroke="#8a5a00" stroke-width="1.8"/>
<path d="M12,10 C20,10.6 28,11.6 34,12.4" fill="none" stroke="#fff" stroke-width="1.8" opacity=".7" ${R}/>`));

/* ============================== ICON ============================== */
function inner(name, pre) {
  const s = fs.readFileSync(path.join(OUT, name + '.svg'), 'utf8');
  return s.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '')
    .replace(/id="(\w+)"/g, `id="${pre}_$1"`).replace(/url\(#(\w+)\)/g, `url(#${pre}_$1)`);
}
// Shelly (body centre at icon (124,160), scale SS). Basket uses the same scale; box->sprite offset (+20, -13.5).
const SS = 1.5, SX = 130 - 66 * SS, SY = 132 - 42 * SS; // Shelly + basket bounding box centred in the badge
const BXo = SX + 20 * SS, BYo = SY - 13.5 * SS;
write('icon.svg', svg(256, 256, `<defs>
  <radialGradient id="ib" cx="0.4" cy="0.28" r="0.8">
    <stop offset="0" stop-color="#e4f6ff"/><stop offset="0.55" stop-color="#8fd2f5"/><stop offset="1" stop-color="#4fa6e0"/>
  </radialGradient>
  <clipPath id="ic"><circle cx="128" cy="128" r="114"/></clipPath>
</defs>
<circle cx="128" cy="128" r="122" fill="#2a4f8a"/>
<circle cx="128" cy="128" r="114" fill="url(#ib)"/>
<circle cx="128" cy="128" r="118" fill="none" stroke="#ffffff" stroke-width="5" opacity=".95"/>
<g clip-path="url(#ic)">
  <g fill="#ffffff" opacity=".8"><circle cx="196" cy="78" r="14"/><circle cx="214" cy="70" r="17"/><circle cx="232" cy="80" r="12"/><rect x="190" y="78" width="46" height="12" rx="6"/></g>
  <g fill="#ffffff"><circle cx="30" cy="232" r="34"/><circle cx="84" cy="222" r="30"/><circle cx="140" cy="228" r="34"/><circle cx="196" cy="220" r="30"/><circle cx="244" cy="230" r="32"/></g>
  <path d="M-4,214 C30,206 60,206 84,208" fill="none" stroke="#d4ecfb" stroke-width="4" opacity=".9" ${R}/>
</g>
<g transform="translate(${f1(SX)},${f1(SY)}) scale(${SS})">${inner('shelly_happy', 'is')}</g>
<g transform="translate(${f1(BXo)},${f1(BYo)}) scale(${SS})">${inner('basket', 'ib3')}</g>
<g transform="translate(${f1(BXo + 40 * SS - 30)},${f1(BYo + 14 * SS - 46)}) scale(.94)">${inner('star_gold', 'ig')}</g>
<g transform="translate(${f1(BXo)},${f1(BYo)}) scale(${SS})">${inner('basket_front', 'ib2')}</g>
`));
console.log('wrote to', OUT);
