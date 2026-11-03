// Analyse the fc_capture.js records (Pip's Camp Hide & Seek): clues/peek boxes vs the HUD and the speech bubble (DOM),
// places vs each other / Pip / the campfire + tent / the bench, hidden friends' visible part and exposed clip line, seated
// friends covered (flames, other friends), hat colour contrast against what is right behind the hat, safe-area edges,
// bubble overflow.   node tests/visual/fc_analyze.js > tests/out/visual/analysis.txt
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const PAL = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'],
  orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'], pink: ['#FF8FC0', '#C9558A'] };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const relL = c => { const l = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const CR = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const { lab, de00 } = require('./colour');
const dE = (a, b, sim) => r1(de00(lab(a, sim), lab(b, sim)));
const box = (l, t, r, b) => ({ l, t, r, b });
const inter = (A, B) => { const w = Math.min(A.r, B.r) - Math.max(A.l, B.l), h = Math.min(A.b, B.b) - Math.max(A.t, B.t); return w > 0 && h > 0 ? { w: r1(w), h: r1(h) } : null; };
const fromRect = R => R ? box(R.x, R.y, R.x + R.w, R.y + R.h) : null;
const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const SEASON = ['spring', 'summer', 'autumn', 'winter'];

const issues = [], hats = {}, hidStats = [], seatStats = [];
const add = (sev, tag, msg) => issues.push({ sev, tag, msg });
for (const [sec, file] of [['screens', 'screens/screens.jsonl'], ['seasons', 'seasons/seasons.jsonl'], ['topics', 'topics/topics.jsonl'], ['short', 'short/short.jsonl']]) {
  for (const r of read(path.join(OUT, file))) {
    const g = r.g; if (!g || !g.places) continue;
    const tag = `${sec}/${r.tag}${r.screen ? '-' + r.screen : ''}`;
    const H = fromRect(g.hud), Bb = fromRect(g.bubble);
    const pr = {}; (r.pr || []).forEach(p => { pr[p.id] = p; });
    const live = g.places.filter(p => !p.leaving);
    const peek = p => box(p.x - p.fs * 0.5, p.clueTop, p.x + p.fs * 0.5, p.peekY), obj = p => box(p.x - p.w * 0.46, p.peekY, p.x + p.w * 0.46, p.y);
    const pip = box(g.pipHit.x - g.pipHit.w / 2, g.pipHit.y - g.pipHit.h / 2, g.pipHit.x + g.pipHit.w / 2, g.pipHit.y + g.pipHit.h / 2);
    const C = g.camp, cw = C.w, tw = cw * 1.25;
    const fire = box(C.x - cw * 0.22, C.y - cw * 0.85, C.x + cw * 0.22, C.y - cw * 0.2);   // the flames (power ≈ 0.6)
    const logs = box(C.x - cw / 2, C.y - cw * 0.35, C.x + cw / 2, C.y);                       // stones + logs
    const ph = g.pip.h, pipArt = box(g.pip.x - ph * 0.3, g.pip.y - ph * 0.95, g.pip.x + ph * 0.36, g.pip.y);   // Pip's drawn body + tail
    const tent = box(C.x + cw * 0.05 - tw / 2, C.y - tw * 200 / 260 - cw * 0.25, C.x + cw * 0.05 + tw / 2, C.y - cw * 0.25);
    const ask = /ask|L\d$|a\d-\w+$|seL/.test(tag) && !/party/.test(tag);
    for (const p of live) {
      const f = g.friends.find(x => x.id === p.friendId), P = f && pr[f.id];
      const realTop = P && P.drawnTop != null && f.state === 'hidden' ? P.drawnTop : p.clueTop;
      const pk = box(p.x - p.fs * 0.5, Math.min(realTop, p.clueTop), p.x + p.fs * 0.5, p.peekY);
      if (f && f.state === 'hidden') {
        for (const [nm, K] of [['HUD', H], ['bubble', Bb]]) { const o = inter(pk, K); if (o) add('P1', tag, `${p.kind}/${f.animal} clue under ${nm} by ${o.w}×${o.h}px (drawn top ${r1(realTop)}, ${nm} bottom ${r1(K.b)})`); }
        if (P && P.drawnTop != null && P.drawnTop < p.clueTop - 2) add('P3', tag, `${f.clue.kind} drawn top ${r1(P.drawnTop)} is ${r1(p.clueTop - P.drawnTop)}px above world clueTop ${r1(p.clueTop)} (cfg.clueFrac.${f.clue.kind} too small)`);
        if (pk.l < g.ins.left || pk.r > g.W - g.ins.right || pk.t < g.ins.top) add('P2', tag, `${p.kind}/${f.animal} peek box outside safe area ${JSON.stringify([r1(pk.l), r1(pk.t), r1(pk.r)])}`);
      }
      if (!ask) continue;
      for (const q of live) if (q !== p) {
        const a = inter(peek(p), peek(q)); if (a && p.id < q.id) add('P1', tag, `peek boxes of ${p.kind}#${p.id} and ${q.kind}#${q.id} overlap ${a.w}×${a.h}`);
        const b = inter(peek(p), obj(q)); if (b && q.y > p.y) add('P2', tag, `${q.kind}#${q.id} (front) object covers peek box of ${p.kind}#${p.id} by ${b.w}×${b.h}`);
      }
      for (const [nm, K, sev] of [['Pip art', pipArt, 'P2'], ['Pip hit box', pip, 'P3'], ['flames', fire, 'P2'], ['campfire logs', logs, 'P2'], ['camp tent', tent, 'P3']]) {
        const o = inter(obj(p), K) || inter(peek(p), K); if (o) add(sev, tag, `${p.kind}#${p.id} (x ${r1(p.x)}, y ${r1(p.y)}) overlaps ${nm} by ${o.w}×${o.h}`);
      }
      (g.bench || []).forEach((s, i) => { const sz = g.seatSize, sb = box(s.x - sz / 2, s.y - sz, s.x + sz / 2, s.y); const o = inter(obj(p), sb); if (o) add('P3', tag, `${p.kind}#${p.id} overlaps bench seat ${i} by ${o.w}×${o.h}`); });
    }
    for (const P of r.pr || []) {
      const f = g.friends.find(x => x.id === P.id); if (!f) continue;
      if (f.state === 'hidden') {
        hidStats.push(P.frac);
        if (P.frac != null && P.frac < 0.8) add('P2', tag, `hidden ${f.animal} (${f.clue.kind} ${f.clue.value}) only ${Math.round(P.frac * 100)}% of its peeking head+clue visible`);
        if (P.cut && P.cut.bad > 2) add('P2', tag, `hidden ${f.animal}: clip line exposed over ${P.cut.bad}/${P.cut.cols} columns, gap up to ${P.cut.maxGap}px (place art does not reach peekY)`);
      }
      if (f.state === 'seated' || f.state === 'dance') {
        seatStats.push([P.frac, f.seat]);
        if (P.frac != null && P.frac < 0.7) add('P2', tag, `seated ${f.animal} seat ${f.seat} only ${Math.round(P.frac * 100)}% visible (flames/friends in front)`);
      }
      if (f.clue && f.clue.kind === 'hat' && P.hatBg && f.state === 'hidden') {
        const col = f.clue.color || f.clue.value, pal = PAL[col]; if (!pal) continue;
        const bg = P.hatBg.slice(0, 3).map(Math.round), season = SEASON[g.level % 4];
        const k = `${season}|${col}`, cb = CR(hex(pal[0]), bg), cd = CR(hex(pal[1]), bg);
        const de = dE(hex(pal[0]), bg), dd = dE(hex(pal[0]), bg, 'deut');
        if (!hats[k] || de < hats[k].de) hats[k] = { cb: r2(cb), cd: r2(cd), de, dd, bg: '#' + bg.map(v => v.toString(16).padStart(2, '0')).join(''), tag };
      }
    }
    if (g.bubbleOverflow && (g.bubbleOverflow[0] > 1 || g.bubbleOverflow[1] > 1)) add('P2', tag, `bubble overflows ${JSON.stringify(g.bubbleOverflow)} font ${g.bubbleFont} "${g.bubbleText.slice(0, 60)}"`);
    if (g.bubble && parseFloat(g.bubbleFont) < 18) add('P3', tag, `bubble font shrunk to ${g.bubbleFont} "${g.bubbleText.slice(0, 50)}"`);
  }
}
// unique issues (same message across shots counted)
const seen = {};
for (const i of issues) { const k = i.sev + ' ' + i.msg.replace(/[\d.]+/g, '#'); (seen[k] = seen[k] || { sev: i.sev, n: 0, ex: [] }).n++; if (seen[k].ex.length < 3) seen[k].ex.push(`${i.tag}: ${i.msg}`); }
const keys = Object.keys(seen).sort();
console.log(`== issues (${issues.length} total, ${keys.length} kinds)`);
for (const k of keys) { const s = seen[k]; console.log(`${s.sev} ×${s.n}`); s.ex.forEach(e => console.log('    ' + e)); }
console.log('\n== hat vs the pixels right behind it (worst ΔE00 sample per season × colour): WCAG luminance CR of base / dark outline, ΔE00 normal / deuteranopia');
for (const k of Object.keys(hats).sort()) { const h = hats[k]; console.log(`${k.padEnd(16)} CR base ${String(h.cb).padStart(4)} dark ${String(h.cd).padStart(4)}  ΔE ${String(h.de).padStart(4)} deut ${String(h.dd).padStart(4)}  bg ${h.bg} ${h.de < 20 || h.dd < 10 ? '<-- LOW' : ''}  ${h.tag}`); }
const q = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? `min ${r1(a[0] * 100)}% median ${r1(a[a.length >> 1] * 100)}% (n ${a.length})` : 'n 0'; };
console.log('\n== hidden friends visible fraction (head + clue above peekY):', q(hidStats));
console.log('== seated friends visible fraction:', q(seatStats.map(s => s[0])));
const bySeat = {}; seatStats.forEach(([f, s]) => (bySeat[s] = bySeat[s] || []).push(f));
for (const s of Object.keys(bySeat).sort()) console.log(`   seat ${s}: ${q(bySeat[s])}`);
