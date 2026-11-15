# Montage helper for visual QA: python3 -I visual/montage.py out.png width cols img1 img2 ...
import sys
from PIL import Image, ImageDraw
out, W, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
cw = W // cols
th = [int(im.height * cw / im.width) for im in ims]
rows = [max(th[i:i+cols]) for i in range(0, len(ims), cols)]
M = Image.new('RGB', (W, sum(rows) + 18 * len(rows)), (34, 34, 34)); d = ImageDraw.Draw(M)
y = 0
for r, rh in enumerate(rows):
    for c in range(cols):
        i = r * cols + c
        if i >= len(ims): break
        M.paste(ims[i].resize((cw - 4, th[i])), (c * cw, y + 16)); d.text((c * cw + 4, y + 2), files[i].split('/')[-1], fill=(255, 255, 255))
    y += rh + 18
M.save(out)
