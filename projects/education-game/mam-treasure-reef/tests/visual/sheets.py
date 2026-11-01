"""Contact sheets from tests/out/visual/*.png (PIL).   python3 -I tests/visual/sheets.py [pattern ...]
   Default: one sheet per device×lang for the screens, one per device for the times of day, one for notch shots.
   Output: tests/out/visual/sheets/*.png (cells 420 px wide, label on top)."""
import sys, os, glob, re
from PIL import Image, ImageDraw, ImageFont
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'visual')
SH = os.path.join(OUT, 'sheets'); os.makedirs(SH, exist_ok=True)
try: FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
except Exception: FONT = ImageFont.load_default()

def sheet(files, name, cols=4, cw=420):
    files = sorted(files)
    if not files: return
    cells = []
    for f in files:
        im = Image.open(f).convert('RGB')
        k = cw / im.width; h = round(im.height * k)
        if h > cw * 2.4: h = round(cw * 2.4); k = h / im.height; cw2 = round(im.width * k)
        else: cw2 = cw
        cells.append((os.path.basename(f)[:-4], im.resize((cw2, h), Image.LANCZOS)))
    ch = max(c[1].height for c in cells) + 24
    rows = (len(cells) + cols - 1) // cols
    sh = Image.new('RGB', (cols * (cw + 8) + 8, rows * (ch + 8) + 8), '#222')
    d = ImageDraw.Draw(sh)
    for i, (label, im) in enumerate(cells):
        x = 8 + (i % cols) * (cw + 8); y = 8 + (i // cols) * (ch + 8)
        d.text((x, y), label, fill='white', font=FONT)
        sh.paste(im, (x + (cw - im.width) // 2, y + 22))
    p = os.path.join(SH, name + '.png'); sh.save(p); print(p, len(cells))

pats = sys.argv[1:]
if pats:
    for p in pats: sheet(glob.glob(os.path.join(OUT, p + '*.png')), re.sub(r'[^\w-]', '_', p))
else:
    for dev in ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']:
        for lang in ['en', 'vi']:
            fs = [f for f in glob.glob(os.path.join(OUT, f'{dev}-{lang}-[0-9]*.png'))]
            sheet(fs, f'screens_{dev}_{lang}', cols=4 if dev.endswith('L') else 6)
        sheet(glob.glob(os.path.join(OUT, f'{dev}-en-tod*.png')), f'tod_{dev}', cols=4 if dev.endswith('L') else 7)
    sheet(glob.glob(os.path.join(OUT, '*-notch-*.png')), 'notch', cols=6, cw=360)
