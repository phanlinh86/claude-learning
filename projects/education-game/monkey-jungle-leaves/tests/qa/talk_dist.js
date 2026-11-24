// QA: distribution of the food Talk-time choices as the game really draws them (world._startTalk).
const { chromium } = require('playwright'); const serve = require('../e2e/serve');
(async () => { const srv = await serve(), b = await chromium.launch(); const page = await b.newPage();
  await page.goto(srv.url + '?mute=1&age=4'); await page.waitForFunction(() => window.LL && LL.debug && LL.debug.mode === 'title');
  const r = await page.evaluate(() => { const w = LL.debug.world, cnt = {}, ans = {}, pos = {}; w.topic = 'food';
    for (let i = 0; i < 400; i++) { w._startTalk(); const t = w.talk; t.choices.forEach((c, j) => { if (c.id === t.answerId) { ans[c.value] = (ans[c.value] || 0) + 1; pos[j] = (pos[j] || 0) + 1; } else cnt[c.value] = (cnt[c.value] || 0) + 1; }); }
    const nx = []; const R = new LL.RNG(12345); for (let i = 0; i < 3; i++) { const s = (R.next() * 4294967296) >>> 0; const q = new LL.RNG(s); nx.push([s, q.next().toFixed(4), q.next().toFixed(4), q.next().toFixed(4)]); }
    return { distractors: cnt, answers: ans, answerPos: pos, nx }; });
  console.log(JSON.stringify(r, null, 1)); await b.close(); srv.close(); })();
