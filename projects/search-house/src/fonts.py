"""Find a TrueType font with Vietnamese diacritics for reportlab, on Linux, macOS or Windows."""
import os

_CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf"),
    ("/Library/Fonts/", "Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf"),
    ("/System/Library/Fonts/Supplemental/", "Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf"),
    ("C:/Windows/Fonts/", "arial.ttf", "arialbd.ttf", "ariali.ttf"),
]

for _d, _r, _b, _i in _CANDIDATES:
    if all(os.path.exists(os.path.join(_d, f)) for f in (_r, _b, _i)):
        FONT_REGULAR, FONT_BOLD, FONT_ITALIC = (os.path.join(_d, f) for f in (_r, _b, _i))
        break
else:
    raise SystemExit("No suitable font found - install DejaVu Sans or Arial and add its folder to fonts.py")
