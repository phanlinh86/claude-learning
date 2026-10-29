// Visual QA: preview the CSS fixes proposed in docs/reports/visual_report.md (injected at runtime, game files untouched).
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const CSS = `
.slot-grid{grid-template-columns:repeat(12,minmax(0,1fr));gap:calc(var(--u)*1)}
.slot{grid-column:span 4}.slot:nth-child(n+4){grid-column:span 3}
.slot:nth-child(n+4) .tag{display:none}
.slot{padding:calc(var(--u)*.8);gap:calc(var(--u)*.45)}
.slot h3{font-size:calc(var(--u)*1.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.slot .prev{aspect-ratio:auto;height:calc(var(--u)*7.5)}
.slot .shape button{white-space:nowrap}
#scrCustom .panel{padding-top:calc(var(--u)*1.6);padding-bottom:calc(var(--u)*1.6)}
#scrCustom .panel h2{margin-bottom:calc(var(--u)*.2);font-size:calc(var(--u)*3.4)}
#scrCustom .small{margin:calc(var(--u)*.4) 0}
#scrCustom .menu{margin-top:calc(var(--u)*.8)}
.title-wrap{margin-top:calc(var(--u)*-7)}
.best-line{display:inline-block;background:rgba(40,60,90,.55);padding:calc(var(--u)*.4) calc(var(--u)*1.6);border-radius:99px;text-shadow:none}
.tagline{text-shadow:0 2px 0 #3a5a7a,0 0 calc(var(--u)*.6) #3a5a7a, 0 0 calc(var(--u)*1.6) rgba(30,50,80,.6)}
.how-ico{min-width:calc(var(--u)*8);font-size:calc(var(--u)*2.6);line-height:1.1;word-break:keep-all}
`;
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1280, 720], [800, 600]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:8772/index.html?mute=1&seed=42');
    await p.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => { document.querySelectorAll('.slot h3').forEach(h => h.textContent = h.textContent.replace(' background', '')); });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `proposed_title_${w}x${h}.png`) });
    await p.click('#btnCustomize'); await p.waitForTimeout(500);
    await p.evaluate(() => { document.querySelectorAll('.slot h3').forEach(h => h.textContent = h.textContent.replace(' background', ' sky')); document.querySelector('#scrCustom .small').innerHTML='Use a pet, a family photo or a drawing! Drag a picture onto a card or click <b>Choose…</b>'; });
    const r = await p.evaluate(() => { const pn = document.querySelector('#scrCustom .panel'); return [pn.clientWidth, pn.scrollWidth, pn.clientHeight, pn.scrollHeight]; });
    console.log(w, h, 'custom panel client/scroll', r);
    await p.screenshot({ path: path.join(OUT, `proposed_custom_${w}x${h}.png`) });
    await p.close();
  }
  await b.close();
})();
