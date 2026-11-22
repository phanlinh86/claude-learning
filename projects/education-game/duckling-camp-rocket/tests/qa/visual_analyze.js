// Visual QA analysis (Nim's River Hop): reads tests/out/qa_visual/*.json written by visual_capture.js and prints
// overlaps, text-fit problems, safe-area problems, sizes and answer-colour distance (CIEDE2000 + WCAG contrast) vs the
// local water / banks / stone top / Nim's scarf, per season.   node tests/qa/visual_analyze.js [filter]
'use strict';
const fs = require('fs'), path = require('path');
const { de2000, contrast, median, PALETTE, hex, toHex } = require('./visual_lib');
const DIR = path.join(__dirname, '..', 'out', 'qa_visual');
const filt = process.argv[2] || '';
const SCARF = hex('#E3B65A'), GOLD = hex('#F4D27A');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f.includes(filt) && !f.startsWith('edges-')).sort();
const colourRows = {};   // season → colour → {water:[], stone:[], bank:[], behind:[]}
const seasonOf = lv => ['spring', 'summer', 'autumn', 'winter'][(lv | 0) % 4];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f)));
  console.log(`\n=== ${d.tag}  errors: ${(d.errors || []).length ? d.errors.join(' | ') : 'none'}`);
  for (const [shot, m] of Object.entries(d.shots)) {
    if (!m || m.err) { console.log(`  ${shot}: measure error ${m && m.err}`); continue; }
    const notes = [];
    if (m.nimUnderBubble) notes.push(`NIM under bubble ${m.nimUnderBubble.w}x${m.nimUnderBubble.h}px (nim top ${m.nim.y.toFixed(1)}, bubble bottom ${(m.bubble.y + m.bubble.h).toFixed(1)})`);
    if (m.nimUnderHud) notes.push(`NIM under HUD ${m.nimUnderHud.w}x${m.nimUnderHud.h}`);
    if (m.nimOutsideSafe && Object.values(m.nimOutsideSafe).some(v => v > 0)) notes.push(`NIM outside safe ${JSON.stringify(m.nimOutsideSafe)}`);
    if (m.nimOutsideScreen && Object.values(m.nimOutsideScreen).some(v => v > 0)) notes.push(`NIM off screen ${JSON.stringify(m.nimOutsideScreen)}`);
    for (const s of m.stones || []) {
      if (s.thingUnderBubble) notes.push(`thing ${s.id}(row ${s.row}) under bubble ${s.thingUnderBubble.w}x${s.thingUnderBubble.h}`);
      if (s.thingUnderHud) notes.push(`thing ${s.id} under HUD ${s.thingUnderHud.w}x${s.thingUnderHud.h}`);
      const os = s.stoneOutsideSafe; if (os && Object.values(os).some(v => v > 0.5)) notes.push(`stone ${s.id} outside safe ${JSON.stringify(os)}`);
      const ot = s.thingOutsideSafe; if (ot && Object.values(ot).some(v => v > 0.5)) notes.push(`thing ${s.id} outside safe ${JSON.stringify(ot)}`);
    }
    for (const t of (m.text || []).filter(t => t.sel !== '#btnPause')) notes.push(`TEXT ${t.sel} "${t.txt}" sw ${t.sw} sh ${t.sh}${t.off ? ' OFFSCREEN' : ''}${t.clip ? ' CLIP' : ''} fs ${t.fs} rect ${JSON.stringify(t.rect)}`);
    for (const u of m.unsafe || []) notes.push(`UNSAFE ${u.el}: ${u.bad}`);
    if ((m.talkChoices || []).length) notes.push(`talk choices: ${m.talkChoices.map(c => (c.canvas ? 'pic' : 'txt') + (c.text ? '"' + c.text + '"' : '') + (c.rect ? ` ${c.rect.w | 0}x${c.rect.h | 0}` : '')).join(', ')} q="${m.talkQ}"`);
    const st = (m.stones || [])[0];
    const sizes = st ? `thing ${Math.min(...m.stones.map(s => s.thingPx))}px stone ${st.stonePx}px nim ${m.nimPx}px` : (m.nimPx ? `nim ${m.nimPx}px` : '');
    console.log(`  ${shot} [${m.state}/${m.phase} lv${m.level} ${m.topic} age${m.age}] bubbleFs ${m.bubbleFs} ${sizes}${notes.length ? '\n     - ' + notes.join('\n     - ') : ''}`);
    // colours
    for (const s of m.stones || []) {
      if (!s.thing || !s.thing.color || s.gold > 0.5) continue;
      const se = seasonOf(m.level), c = s.thing.color;
      const R = (colourRows[se] = colourRows[se] || {}), r = (R[c] = R[c] || { water: [], stone: [], bank: [], far: [], behind: [] });
      const w = median(s.bg || []); if (w) r.water.push(w);
      if (s.stoneTop) r.stone.push(s.stoneTop);
      if (m.nearBank) r.bank.push(m.nearBank);
      if (m.farBank) r.far.push(m.farBank);
      for (const b of s.behind || []) r.behind.push(b);
    }
    for (const g of m.gold || []) { if (g.top && m.river) { const se = seasonOf(m.level); (colourRows[se] = colourRows[se] || {}); (colourRows[se]._gold = colourRows[se]._gold || []).push({ g: g.top, w: m.river }); } }
  }
  for (const [k, r] of Object.entries(d.rec || {})) console.log(`  REC ${k}: ${JSON.stringify(r)}`);
}
console.log('\n=== answer colour vs local background (CIEDE2000 ΔE / WCAG contrast); <15 ΔE = weak, <8 = confusable');
for (const [se, R] of Object.entries(colourRows)) {
  for (const [c, r] of Object.entries(R)) {
    if (c === '_gold') { const g = median(r.map(x => x.g)), w = median(r.map(x => x.w)); console.log(`  ${se} golden stone ${toHex(g)} vs water ${toHex(w)}: ΔE ${de2000(g, w).toFixed(1)} contrast ${contrast(g, w).toFixed(2)}`); continue; }
    const base = hex(PALETTE[c]), out = [];
    for (const k of ['water', 'behind', 'stone', 'bank', 'far']) { const md = median(r[k]); if (md) out.push(`${k} ${toHex(md)} ΔE ${de2000(base, md).toFixed(1)} c ${contrast(base, md).toFixed(2)}`); }
    out.push(`scarf ΔE ${de2000(base, SCARF).toFixed(1)}`, `gold ΔE ${de2000(base, GOLD).toFixed(1)}`);
    console.log(`  ${se} ${c.padEnd(6)} ${PALETTE[c]}: ${out.join(' | ')}`);
  }
}
