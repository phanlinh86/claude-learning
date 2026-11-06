// Contact sheets for TT.TrainArt + animal/home stickers (character artist B).
// Usage: node tools/train_sheet.js            → docs/art/train_*.png (train, cargo, animals, engine, tunnel, plates)
//        node tools/train_sheet.js fit        → measures every animal sticker and writes tools/animal_fit.json
//                                               (then re-run `python3 tools/art_animals.py`)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
let PAGE = '';   // served over a local http server (file:// would taint the canvas for the fit step)
const OUT = path.join(ROOT, 'docs', 'art');
const FIT = path.join(__dirname, 'animal_fit.json');
const DEFAULT_XF = [1.18, 4.5, 6];

async function render(page, sheet) {
  await page.goto(PAGE + '?sheet=' + sheet);
  await page.waitForFunction(() => window.done === true, null, { timeout: 30000 });
  const err = await page.evaluate(() => window.err);
  if (err) throw new Error(sheet + ': ' + err);
}

function serve() {
  const http = require('http');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  PAGE = 'http://127.0.0.1:' + srv.address().port + '/tools/train_sheet.html';
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  if (process.argv[2] === 'fit') {
    await render(page, 'fit');
    const boxes = await page.evaluate(() => window.fitResult);
    const old = fs.existsSync(FIT) ? JSON.parse(fs.readFileSync(FIT, 'utf8')) : {};
    const out = {};
    for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes)) {
      const [k, dx, dy] = old[name] || DEFAULT_XF;
      const X0 = (x0 - dx) / k, X1 = (x1 - dx) / k, Y0 = (y0 - dy) / k, Y1 = (y1 - dy) / k;   // design-space bounds
      const k2 = Math.min(1.3, 150 / (X1 - X0), 152 / (Y1 - Y0));
      out[name] = [+k2.toFixed(4), +(80 - (X0 + X1) / 2 * k2).toFixed(2), +(158.5 - Y1 * k2).toFixed(2)];
      console.log(name.padEnd(18), 'bbox', [x0, y0, x1, y1].map((v) => v.toFixed(1)).join(' '), '→ xf', out[name].join(' '));
    }
    fs.writeFileSync(FIT, JSON.stringify(out, null, 1) + '\n');
    console.log('wrote', FIT);
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    const only = process.argv.slice(2);
    for (const sheet of ['train', 'cargo', 'animals', 'engine', 'tunnel', 'plates']) {
      if (only.length && !only.includes(sheet)) continue;
      await render(page, sheet);
      const el = await page.$('#c');
      await el.screenshot({ path: path.join(OUT, 'train_' + sheet + '.png') });
      console.log('wrote docs/art/train_' + sheet + '.png');
    }
  }
  await b.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
