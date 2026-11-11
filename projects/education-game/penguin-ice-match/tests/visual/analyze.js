// Analyse tests/out/visual/**/*.jsonl from capture.js (Tuk's Ice Match): card size / gap / keep-out checks, rewards
// placement, bubble fit, ΔE00 contrast (card back + front vs the clearing, clearing vs forest, butterflies vs what is
// behind them, answer colours vs the cream card front, normal + deuteranopia + protanopia).   node tests/visual/analyze.js
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const read = f => { try { return fs.readFileSync(path.join(OUT, f), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };

const { hex, lab, de00 } = require('./colour');
const mean = s => [0, 1, 2].map(i => s.reduce((a, c) => a + c[i], 0) / s.length);
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#9B6BE0', pink: '#FF8FC0' };
const CREAM = '#DDF1FB', TEAL = '#F2F8FC', DEE = '#C9454F';   // clear ice, frost, Tuk's hat stripe
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

/* ---------- geometry ---------- */
const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const gap = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));
const MIN = { 3: 120, 4: 120, 5: 104, 6: 104, 7: 104 };
function checkGeom(tag, g, out) {
  if (!g.grid) return;
  const issues = [], gr = g.grid, s = g.s;
  if (gr.cw < MIN[g.age] - 0.5) issues.push(`card ${f1(gr.cw)} < ${MIN[g.age]}`);
  if (gr.gap < 14 - 0.01) issues.push(`gap ${f1(gr.gap)} < 14`);
  let minGap = 1e9; for (let i = 0; i < g.cards.length; i++) for (let j = i + 1; j < g.cards.length; j++) minGap = Math.min(minGap, gap(g.cards[i], g.cards[j]));
  const scr = { x: g.ins.left, y: g.ins.top, w: g.W - g.ins.left - g.ins.right, h: g.H - g.ins.top - g.ins.bottom };
  for (const c of g.cards) {
    if (c.x < scr.x || c.y < scr.y || c.x + c.w > scr.x + scr.w || c.y + c.h > scr.y + scr.h) issues.push(`card ${c.id} outside safe area`);
    if (g.hud && ov(c, g.hud) > 0) issues.push(`card ${c.id} under HUD by ${f1(Math.sqrt(ov(c, g.hud)))}`);
    if (g.bubble && ov(c, g.bubble) > 0) issues.push(`card ${c.id} under bubble (${f1(g.bubble.y + g.bubble.h - c.y)} px)`);
    if (ov(c, g.dee) > 0) issues.push(`card ${c.id} over Dee`);
  }
  const rw = { n: g.rewards.length, onCards: 0, offScreen: 0, overlapping: 0, underUI: 0, minGap: 1e9, kinds: {} };
  const boxes = g.rewards.filter(r => r.box).map(r => r.box);
  for (const r of g.rewards) { rw.kinds[r.perch] = (rw.kinds[r.perch] || 0) + 1; const b = r.box; if (!b) continue;
    if (g.cards.some(c => ov(b, c) > 0) || (gr && ov(b, gr.rect) > 0)) rw.onCards++;
    if (b.x < 0 || b.y < 0 || b.x + b.w > g.W || b.y + b.h > g.H) rw.offScreen++;
    if ((g.hud && ov(b, g.hud) > 0) || (g.bubble && ov(b, g.bubble) > 0)) rw.underUI++; }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { if (ov(boxes[i], boxes[j]) > 1) rw.overlapping++; rw.minGap = Math.min(rw.minGap, gap(boxes[i], boxes[j])); }
  // spread of rewards: bounding box of their centres as a share of the screen
  if (g.rewards.length > 2) { const xs = g.rewards.map(r => r.x), ys = g.rewards.map(r => r.y); rw.spreadX = +((Math.max(...xs) - Math.min(...xs)) / g.W).toFixed(2); rw.spreadY = +((Math.max(...ys) - Math.min(...ys)) / g.H).toFixed(2); }
  out.push({ tag, topic: g.topic, age: g.age, pairs: g.pairs, grid: `${gr.cols}×${gr.rows}`, cw: +gr.cw.toFixed(1), css: +(gr.cw * s).toFixed(1), gap: +gr.gap.toFixed(1), minGap: +minGap.toFixed(1),
    bubbleFont: g.bubbleFont, bubbleOverflow: g.bubbleOverflow, bubbleBottomVsGrid: g.bubble ? +(gr.rect.y - (g.bubble.y + g.bubble.h)).toFixed(1) : null, rewards: rw, issues });
}

const rows = [];
for (const r of read('screens/screens.jsonl')) if (r.screen === 'peek' || r.screen === 'rewards') checkGeom(`screens ${r.tag} ${r.screen}`, r, rows);
for (const r of read('topics/topics.jsonl')) checkGeom(`topics ${r.dev}-${r.lang} a${r.age} ${r.topic}`, r, rows);
for (const r of read('seasons/seasons.jsonl')) if (r.screen === 'peek') checkGeom(`season ${r.dev} s${r.season}`, r, rows);
for (const r of read('rewards/rewards.jsonl')) checkGeom(`rewards ${r.dev} a${r.age} ${r.topic}`, r, rows);
for (const r of read('notch/notch.jsonl')) checkGeom(`notch ${r.dev}-${r.lang} ${r.screen}`, r, rows);
for (const r of read('phases/phases.jsonl')) if (r.step === 'late' || r.step === 'h-settled') checkGeom(`phases ${r.dev} a${r.age} ${r.topic} ${r.step}`, r, rows);
for (const r of read('surprise/surprise.jsonl')) checkGeom(`surprise ${r.dev} a${r.age} ${r.sp} ${r.step}`, r, rows);
for (const r of read('short/short.jsonl')) if (r.cards) checkGeom(`short ${r.dev}-${r.lang} ${r.screen}`, r, rows);

console.log('== geometry (logical px; css = CSS px on the device) ==');
for (const r of rows) console.log(`${r.tag.padEnd(40)} ${r.grid.padEnd(4)} cw ${f1(r.cw).padStart(5)} css ${f1(r.css).padStart(5)} gap ${f1(r.gap)} bub ${r.bubbleFont}px ov ${r.bubbleOverflow} toGrid ${r.bubbleBottomVsGrid}` +
  (r.rewards.n ? ` | R ${r.rewards.n} on ${r.rewards.onCards} off ${r.rewards.offScreen} ovl ${r.rewards.overlapping} ui ${r.rewards.underUI} gapMin ${f1(r.rewards.minGap)} spread ${r.rewards.spreadX}×${r.rewards.spreadY} ${JSON.stringify(r.rewards.kinds)}` : '') +
  (r.issues.length ? '  !! ' + r.issues.join('; ') : ''));
const small = rows.filter(r => r.issues.some(i => i.startsWith('card') && i.includes('<')));
console.log(`\nrounds with an undersized card: ${small.length}/${rows.length}; smallest css width per device:`);
const byDev = {}; for (const r of rows) { const d = r.tag.split(' ')[1].split('-')[0]; if (!byDev[d] || r.css < byDev[d].css) byDev[d] = r; }
for (const [d, r] of Object.entries(byDev)) console.log(`  ${d.padEnd(8)} ${f1(r.css)} css px (${f1(r.cw)} logical, ${r.grid}, ${r.tag})`);

console.log('\n== contrast ΔE00 (clearing panel, cards, rewards) ==');
const probes = [...read('screens/screens.jsonl'), ...read('seasons/seasons.jsonl'), ...read('rewards/rewards.jsonl')].filter(r => r.probe);
const bySeason = {};
for (const r of probes) {
  const p = r.probe, s = p.season; if (!p.panel.length) continue;
  const P = mean(p.panel), A = mean(p.around), k = bySeason[s] || (bySeason[s] = { back: [], front: [], panel: [], bf: [] });
  k.back.push(de00(lab(hex(TEAL)), lab(P))); k.front.push(de00(lab(hex(CREAM)), lab(P))); k.panel.push(de00(lab(P), lab(A)));
  k.P = P;
  for (const q of p.rewards) if ((q.kind === 'fish' || q.kind === 'sculpture') && q.color) { const d = q.samples.map(c => de00(lab(hex(PAL[q.color])), lab(c))).sort((a, b) => a - b); k.bf.push({ c: q.color, med: d[d.length >> 1], min: d[0] }); }
}
const SN = ['sunny', 'breezy', 'rain', 'rainbow'];
for (const [s, k] of Object.entries(bySeason)) {
  const mn = a => Math.min(...a), avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`${SN[s].padEnd(7)} panel rgb(${k.P.map(Math.round)}) back↔panel ${f1(mn(k.back))} cream↔panel ${f1(mn(k.front))} panel↔forest ${f1(avg(k.panel))} (min ${f1(mn(k.panel))})` +
    (k.bf.length ? ` | butterflies median ΔE ${f1(avg(k.bf.map(b => b.med)))}, worst ${k.bf.sort((a, b) => a.med - b.med)[0].c} ${f1(k.bf[0].med)}` : ''));
}
console.log('\n== answer colours on the cream card front (ΔE00) and vs Dee ==');
for (const [n, h] of Object.entries(PAL)) console.log(`${n.padEnd(7)} vs cream ${f1(de00(lab(hex(h)), lab(hex(CREAM))))}  vs Dee ${f1(de00(lab(hex(h)), lab(hex(DEE))))}`);
console.log('\n== colour pairs, normal / deuteranopia / protanopia (ΔE00; < 10 weak) ==');
const names = Object.keys(PAL);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = hex(PAL[names[i]]), b = hex(PAL[names[j]]);
  const d = ['', 'deut', 'prot'].map(s => de00(lab(a, s || null), lab(b, s || null)));
  console.log(`${(names[i] + '-' + names[j]).padEnd(14)} ${d.map(f1).join(' / ')}${Math.min(d[1], d[2]) < 10 ? '   <-- weak for CVD' : ''}`);
}
const backs = read('seasons/seasons.jsonl').filter(r => r.screen === 'backs');
console.log('\n== card backs: mean |Δ| per channel vs card 0 (0–255) ==');
for (const r of backs) console.log(`${r.dev} s${r.season}: ${r.backs.join(' ')}`);
for (const r of [...read('screens/screens.jsonl'), ...read('short/short.jsonl')].filter(r => ['settings', 'talk', 'pause', 'done'].includes(r.screen))) {
  const { tag, dev, lang, screen, ...rest } = r; console.log(`${screen.padEnd(8)} ${(tag || dev + '-' + lang).padEnd(12)} ${JSON.stringify(rest).slice(0, 300)}`);
}
