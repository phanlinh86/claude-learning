# Contact sheet: python3 tests/qa/sheet.py out.png WIDTH img1 img2 ...  (each image scaled to WIDTH px wide, in one row, labelled)
import sys
from PIL import Image, ImageDraw
out, W = sys.argv[1], int(sys.argv[2])
ims = []
for f in sys.argv[3:]:
    im = Image.open(f).convert('RGB'); h = round(im.height * W / im.width)
    ims.append((f.split('/')[-1], im.resize((W, h), Image.LANCZOS)))
H = max(i.height for _, i in ims) + 18
sheet = Image.new('RGB', (W * len(ims) + 6 * (len(ims) - 1), H), 'white')
d = ImageDraw.Draw(sheet)
for k, (n, im) in enumerate(ims):
    x = k * (W + 6); sheet.paste(im, (x, 18)); d.text((x + 2, 3), n[-40:], fill='black')
sheet.save(out)
