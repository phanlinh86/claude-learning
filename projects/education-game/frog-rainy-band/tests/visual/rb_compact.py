"""Shrink the visual QA PNGs in place (256-colour palette, no dither) so the report folder stays small enough for git.
   python3 tests/visual/rb_compact.py [docs/reports/visual]   (contrast numbers come from the canvas, not from these PNGs)"""
import sys, os
from PIL import Image
root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'reports', 'visual')
before = after = 0
for d, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith('.png'):
            continue
        p = os.path.join(d, f); before += os.path.getsize(p)
        im = Image.open(p)
        if im.mode != 'P':
            im.convert('RGB').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(p, optimize=True)
        after += os.path.getsize(p)
print('%.1f MB -> %.1f MB' % (before / 1e6, after / 1e6))
