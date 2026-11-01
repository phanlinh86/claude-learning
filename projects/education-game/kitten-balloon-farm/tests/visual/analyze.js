// Numbers for the visual report, from the jsonl files written by capture.js.   node tests/visual/analyze.js
// 1. geometry: balloon bodies on screen / under the HUD or bubble / over Miu or the sign, sizes, hit-circle overlaps,
//    string ends, friends on the grass;  2. colour: ΔE2000 + WCAG contrast of every answer colour against the pixels
//    behind it (per balloon, and the worst pixel of the whole play band per time of day);  3. CVD pairs.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const rd = f => { try { return fs.readFileSync(path.join(OUT, f), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch (e) { return []; } };
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#9B6BE0', pink: '#FF8FC0', cream: '#FFF4DC' };
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const lin = c => c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
const lum = c => { const l = lin(c); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lab(c, M) {
  let l = lin(c);
  if (M) l = [0, 1, 2].map(i => Math.max(0, Math.min(1, M[i][0] * l[0] + M[i][1] * l[1] + M[i][2] * l[2])));
  const X = (0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2]) / 0.95047, Y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2], Z = (0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2]) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function de00(a, b) {   // CIEDE2000
  const [L1, a1, b1] = a, [L2, a2, b2] = b, rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (x, y) => { const v = Math.atan2(y, x) / rad; return v < 0 ? v + 360 : v; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2), dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh / 2 * rad), Lm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const CVD = { deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]] };
const r1 = v => Math.round(v * 10) / 10;
const L = [];
const log = s => { L.push(s); console.log(s); };

/* ---------- 1. geometry ---------- */
function checkGeom(tag, g) {
  const issues = [];
  if (!g || !g.balloons) return issues;
  const ins = g.ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const Miu = { l: g.miu.x - g.miu.h * 0.42, r: g.miu.x + g.miu.h * 0.42, t: g.miu.y - g.miu.h * 1.02, b: g.miu.y };
  const sg = g.sign, Sign = { l: sg.x - sg.w / 2, r: sg.x + sg.w / 2, t: sg.y - sg.h, b: sg.y };
  const ov = (a, b) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
  const live = g.balloons.filter(b => b.state === 'float' || b.state === 'rise');
  for (const b of live) {
    const box = { l: b.x - b.hw, r: b.x + b.hw, t: b.top, b: b.bot };
    if (box.l < ins.left || box.r > g.W - ins.right || box.t < ins.top) issues.push(`${tag} #${b.id} body off safe screen (l ${r1(box.l)} r ${r1(box.r)} t ${r1(box.t)}, W ${g.W}, ins ${JSON.stringify(ins)})`);
    if (g.hud && ov(box, g.hud)) issues.push(`${tag} #${b.id} body under HUD (body ${r1(box.l)}..${r1(box.r)} × ${r1(box.t)}..${r1(box.b)}, HUD ${r1(g.hud.l)}..${r1(g.hud.r)} × ..${r1(g.hud.b)})`);
    if (g.bubble && ov(box, g.bubble)) issues.push(`${tag} #${b.id} body under bubble by ${r1(Math.min(g.bubble.b - box.t, g.bubble.r - box.l))} px (body top ${r1(box.t)}, bubble ${r1(g.bubble.l)}..${r1(g.bubble.r)} × ${r1(g.bubble.t)}..${r1(g.bubble.b)})`);
    if (ov(box, Miu)) issues.push(`${tag} #${b.id} body overlaps Miu`);
    if (ov(box, Sign)) issues.push(`${tag} #${b.id} body overlaps the sign`);
    if (b.size < 100) issues.push(`${tag} #${b.id} size ${r1(b.size)} < 100 logical (${r1(b.size * g.s)} CSS px)`);
    if (b.strEnd) {
      const e = b.strEnd;
      if (e.x > Miu.l && e.x < Miu.r && e.y > Miu.t + 30) issues.push(`${tag} #${b.id} string end on Miu (${r1(e.x)},${r1(e.y)})`);
      if (e.x > Sign.l && e.x < Sign.r && e.y > Sign.t) issues.push(`${tag} #${b.id} string end on the sign (${r1(e.x)},${r1(e.y)})`);
      if (e.y > g.groundY + 50) issues.push(`${tag} #${b.id} string end ${r1(e.y - g.groundY)} px below groundY`);
    }
  }
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j], d = Math.hypot(a.x - b.x, a.y - b.y);
    const bodyGap = d - (a.hw + b.hw);
    if (d < (a.hitR + b.hitR) * 0.75) issues.push(`${tag} hit circles #${a.id}/#${b.id} overlap: centre distance ${r1(d)} < 0.75·(rA+rB) = ${r1((a.hitR + b.hitR) * 0.75)}`);
    if (bodyGap < -4) issues.push(`${tag} bodies #${a.id}/#${b.id} overlap by ${r1(-bodyGap)} px`);
  }
  for (const f of g.friends || []) {
    if (f.x - f.size / 2 < ins.left || f.x + f.size / 2 > g.W - ins.right || f.y > g.H - ins.bottom) issues.push(`${tag} friend ${f.sprite} outside (${r1(f.x)},${r1(f.y)})`);
    if (f.state === 'rest' && Math.abs(f.y - (g.groundY + 30)) > 30) issues.push(`${tag} friend ${f.sprite} not on the grass (y ${r1(f.y)} vs ${g.groundY + 30})`);
  }
  if (g.bubbleOverflow > 2) issues.push(`${tag} bubble text overflows by ${g.bubbleOverflow}px (font ${g.bubbleFont}px): "${g.bubbleText}"`);
  return issues;
}
log('## Geometry');
const geoms = [];
for (const o of rd('screens/screens.jsonl')) if (o.balloons) geoms.push([`screens/${o.tag}-${o.screen}`, o]);
for (const o of rd('moods/moods.jsonl')) geoms.push([`moods/${o.file}`, o.geom]);
for (const o of rd('topics/topics.jsonl')) geoms.push([`topics/${o.file}`, o.geom]);
for (const o of rd('hits/hits.jsonl')) geoms.push([`hits/${o.file}`, o.geom]);
for (const o of rd('notch/notch.jsonl')) if (o.balloons) geoms.push([`notch/${o.dev}-${o.lang}-round`, o]);
for (const o of rd('short/short.jsonl')) if (o.balloons) geoms.push([`short/${o.dev}-${o.lang}-play`, o]);
let minSize = 1e9, minSizeAt = '', minCss = 1e9, minCssAt = '';
for (const [tag, g] of geoms) {
  for (const s of checkGeom(tag, g)) log('- ' + s);
  for (const b of (g.balloons || [])) { if (b.size < minSize) { minSize = b.size; minSizeAt = tag; } if (b.size * g.s < minCss) { minCss = b.size * g.s; minCssAt = tag; } }
}
log(`- smallest balloon: ${r1(minSize)} logical (${minSizeAt}); smallest on screen: ${r1(minCss)} CSS px (${minCssAt})`);
for (const [tag, g] of geoms) if (g.shrink != null && g.shrink < 1) log(`- packing shrink ${g.shrink} (ok ${g.ok}) ${tag}, n=${g.balloons.length}`);
for (const [tag, g] of geoms) if (g.bubble && g.bubbleL) { const d = g.bubble.b - (g.bubbleL.y + g.bubbleL.h); if (d > 20) log(`- ${tag}: DOM bubble bottom ${r1(g.bubble.b)} is ${r1(d)} px lower than world.layout.bubble bottom ${r1(g.bubbleL.y + g.bubbleL.h)} (play band top centre ${r1(g.play.y)})`); }

/* ---------- 2. colour vs background ---------- */
log('\n## Balloon colour vs the pixels behind it (per balloon, worst sample)');
const worst = {};
for (const src of ['moods/moods.jsonl', 'topics/topics.jsonl']) for (const o of rd(src)) {
  const lv = o.lv;
  for (const b of o.bg.balloons) {
    const c = hex(PAL[b.color]), cl = lab(c);
    let mn = 1e9, mc = 1e9, at = null;
    for (const s of b.samples) { const d = de00(cl, lab(s)); if (d < mn) { mn = d; at = s; } mc = Math.min(mc, cr(c, s)); }
    const k = `${lv}:${b.color}`;
    if (!worst[k] || mn < worst[k].de) worst[k] = { de: mn, cr: mc, bg: at, file: o.file, x: b.x, y: b.y };
  }
}
const MOOD = ['morning', 'noon', 'sunset', 'night'];
for (const k of Object.keys(worst).sort()) { const w = worst[k], [lv, col] = k.split(':');
  log(`- ${MOOD[lv]} ${col}: min ΔE00 ${r1(w.de)}, min contrast ${w.cr.toFixed(2)}:1 vs rgb(${w.bg}) at (${Math.round(w.x)},${Math.round(w.y)}) ${w.file}${w.de < 15 ? '  <-- LOW' : ''}`); }

log('\n## Worst pixel of the whole play band per time of day (any balloon could float there)');
const band = {};
for (const o of rd('moods/moods.jsonl')) {
  const k = o.dev + ':' + o.lv; if (band[k]) continue; band[k] = 1;
  const row = [];
  for (const col of ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink']) {
    const c = hex(PAL[col]), cl = lab(c); let mn = 1e9, at = null, mc = 1e9;
    for (const s of o.bg.band) { const d = de00(cl, lab(s)); if (d < mn) { mn = d; at = s; } mc = Math.min(mc, cr(c, s)); }
    row.push(`${col} ${r1(mn)}/${mc.toFixed(2)}${mn < 15 ? '!' : ''}` + (mn < 15 ? ` (rgb ${at})` : ''));
  }
  log(`- ${o.dev} ${MOOD[o.lv]} (ΔE00 / contrast): ${row.join(', ')}`);
}

/* ---------- 3. text on balloons ---------- */
log('\n## Text colour on balloons (WCAG)');
const TC = { '#fff': [255, 255, 255], '#1A1210': hex('#1A1210') };
for (const col of Object.keys(PAL)) { const c = hex(PAL[col]); log(`- ${col}: white ${cr(c, [255, 255, 255]).toFixed(2)}:1, dark ${cr(c, TC['#1A1210']).toFixed(2)}:1`); }

/* ---------- 4. colour-vision deficiency (answer palette pairs) ---------- */
log('\n## CVD: ΔE00 between answer colours (normal / deut / prot)');
const ans = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
for (let i = 0; i < ans.length; i++) for (let j = i + 1; j < ans.length; j++) {
  const a = hex(PAL[ans[i]]), b = hex(PAL[ans[j]]);
  const n = de00(lab(a), lab(b)), d = de00(lab(a, CVD.deut), lab(b, CVD.deut)), p = de00(lab(a, CVD.prot), lab(b, CVD.prot));
  log(`- ${ans[i]}-${ans[j]}: ${r1(n)} / ${r1(d)} / ${r1(p)}${Math.min(d, p) < 10 ? '  <-- confusable' : ''}`);
}
// colour pairs that actually occurred together in colour rounds below age 5
log('\n## Colour rounds below age 5: pairs on screen together, worst CVD ΔE00');
const seen = {};
for (const src of ['moods/moods.jsonl', 'topics/topics.jsonl']) for (const o of rd(src)) {
  if (o.age >= 5 || o.topic !== 'colors') continue;
  const cols = [...new Set(o.geom.balloons.map(b => b.color))];
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    const k = [cols[i], cols[j]].sort().join('-'); if (seen[k]) continue;
    const a = hex(PAL[cols[i]]), b = hex(PAL[cols[j]]);
    seen[k] = { d: de00(lab(a, CVD.deut), lab(b, CVD.deut)), p: de00(lab(a, CVD.prot), lab(b, CVD.prot)), file: o.file };
  }
}
for (const [k, v] of Object.entries(seen)) log(`- ${k}: deut ${r1(v.d)} prot ${r1(v.p)} (${v.file})${Math.min(v.d, v.p) < 10 ? '  <-- confusable' : ''}`);

/* ---------- 5. DOM ---------- */
log('\n## DOM panels');
for (const o of rd('screens/screens.jsonl')) if (!o.balloons) log(`- ${o.tag} ${o.screen}: ${JSON.stringify(Object.assign({}, o, { tag: undefined, screen: undefined })).slice(0, 300)}`);
for (const o of rd('short/short.jsonl')) if (!o.balloons) log(`- short ${o.dev}-${o.lang} ${o.screen}: ${JSON.stringify(Object.assign({}, o, { dev: undefined, lang: undefined, screen: undefined }))}`);
for (const o of rd('notch/notch.jsonl')) if (!o.balloons) log(`- notch ${o.dev}-${o.lang} ${o.screen}: ${JSON.stringify(Object.assign({}, o, { dev: undefined, lang: undefined, screen: undefined }))}`);
fs.writeFileSync(path.join(OUT, 'analysis.txt'), L.join('\n') + '\n');
