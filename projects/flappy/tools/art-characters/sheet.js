// Contact sheet: each asset at in-game size and 4x, light + dark bg, plus flip-book strips.
const fs = require('fs');
const { chromium } = require('playwright');
const DIR = process.argv[2] || '/home/claude/claude-learning/projects/flappy/game/assets/default';
const OUT = process.argv[3] || '/tmp/claude-0/art-chars/sheet.png';
const A = [
  ['bird_up', 78, 65], ['bird_mid', 78, 65], ['bird_down', 78, 65], ['drop', 32, 32],
  ['turtle_walk1', 132, 79], ['turtle_walk2', 132, 79], ['turtle_happy', 132, 79], ['heart', 24, 24], ['icon', 64, 64],
];
const uri = n => 'data:image/svg+xml;base64,' + Buffer.from(fs.readFileSync(`${DIR}/${n}.svg`)).toString('base64');
const icon32 = `<img src="${uri('icon')}" width="32" height="32">`;
function panel(bg, fg) {
  return `<div class="p" style="background:${bg};color:${fg}">` + A.map(([n, w, h]) => {
    const big = n.startsWith('turtle') ? 2.5 : n === 'icon' ? 2 : 4;
    return `<div class="c"><img src="${uri(n)}" width="${w}" height="${h}"> ${n === 'icon' ? icon32 : ''}
      <img class="b" src="${uri(n)}" width="${w * big}" height="${h * big}"></div>`;
  }).join('') + `</div>`;
}
const strip = (names, w, h, s, bg) => `<div class="p" style="background:${bg}">` +
  names.map(n => `<div class="c" style="position:relative"><img src="${uri(n)}" width="${w * s}" height="${h * s}" style="outline:1px dashed rgba(0,0,0,.3)">
  <div style="position:absolute;left:0;right:0;top:${(n.startsWith('bird') ? 52 / 100 : 1) * h * s}px;border-top:1px solid red"></div></div>`).join('') + '</div>';
const html = `<html><body style="margin:0;background:#888;font:12px sans-serif">
<style>.p{display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-items:flex-end}.c{display:flex;align-items:flex-end;gap:8px}</style>
${panel('#bfe8ff', '#000')}${panel('#23263a', '#fff')}
${strip(['bird_up', 'bird_mid', 'bird_down', 'bird_mid'], 120, 100, 3, '#bfe8ff')}
${strip(['turtle_walk1', 'turtle_walk2', 'turtle_happy'], 200, 120, 1.8, '#d9f0c8')}
<div class="p" style="background:#bfe8ff;position:relative;height:140px">
 <img src="${uri('bird_mid')}" width="78" height="65" style="position:absolute;left:120px;top:10px;transform:rotate(-15deg)">
 <img src="${uri('drop')}" width="32" height="32" style="position:absolute;left:260px;top:50px">
 <img src="${uri('turtle_happy')}" width="132" height="79" style="position:absolute;left:220px;top:61px">
 <img src="${uri('heart')}" width="22" height="22" style="position:absolute;left:330px;top:40px">
 <img src="${uri('heart')}" width="18" height="18" style="position:absolute;left:350px;top:60px">
 <img src="${uri('turtle_walk1')}" width="132" height="79" style="position:absolute;left:420px;top:61px">
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 400 } });
  await p.setContent(html); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close(); console.log(OUT);
})();
