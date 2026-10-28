"""Shared styling and helpers for the HDD report PDFs."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Image, PageBreak, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DV-B", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DV-I", FD + "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("DV-BI", FD + "DejaVuSans-BoldOblique.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV-I", boldItalic="DV-BI")

INK = colors.HexColor("#1F2933")
MUTED = colors.HexColor("#5F6B7A")
ACCENT = colors.HexColor("#1D4E89")
ACCENT_LIGHT = colors.HexColor("#E8EEF6")
RULE = colors.HexColor("#C9D2DC")
GOOD = colors.HexColor("#2E7D4F")
WARN = colors.HexColor("#B26A00")
BAD = colors.HexColor("#A33B3B")

# matplotlib palette
C1, C2, C3, C4, C5 = "#1D4E89", "#E07B39", "#5B9BD5", "#8C8C8C", "#2E7D4F"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.spines.top": False,
    "axes.spines.right": False, "axes.edgecolor": "#8A96A3", "axes.labelcolor": "#1F2933",
    "xtick.color": "#3E4C59", "ytick.color": "#3E4C59", "axes.grid": True,
    "grid.color": "#E4E9EE", "grid.linewidth": 0.6, "axes.axisbelow": True,
    "legend.frameon": False, "figure.dpi": 200,
})

S = {}
S["title"] = ParagraphStyle("title", fontName="DV-B", fontSize=24, leading=29, textColor=INK, spaceAfter=10)
S["subtitle"] = ParagraphStyle("subtitle", fontName="DV", fontSize=12.5, leading=17, textColor=MUTED, spaceAfter=18)
S["h1"] = ParagraphStyle("h1", fontName="DV-B", fontSize=15, leading=19, textColor=ACCENT, spaceBefore=14, spaceAfter=7, keepWithNext=1)
S["h2"] = ParagraphStyle("h2", fontName="DV-B", fontSize=11.5, leading=15, textColor=INK, spaceBefore=10, spaceAfter=4, keepWithNext=1)
S["body"] = ParagraphStyle("body", fontName="DV", fontSize=9.4, leading=13.6, textColor=INK, spaceAfter=6)
S["bullet"] = ParagraphStyle("bullet", parent=S["body"], leftIndent=14, bulletIndent=3, spaceAfter=3)
S["small"] = ParagraphStyle("small", fontName="DV", fontSize=7.8, leading=10.5, textColor=MUTED, spaceAfter=4)
S["cell"] = ParagraphStyle("cell", fontName="DV", fontSize=8, leading=10.4, textColor=INK)
S["cellb"] = ParagraphStyle("cellb", fontName="DV-B", fontSize=8, leading=10.4, textColor=colors.white)
S["callout"] = ParagraphStyle("callout", fontName="DV", fontSize=9.6, leading=14, textColor=INK)
S["caption"] = ParagraphStyle("caption", fontName="DV-I", fontSize=7.8, leading=10, textColor=MUTED, spaceAfter=10, alignment=TA_LEFT)
S["src"] = ParagraphStyle("src", fontName="DV", fontSize=7.4, leading=9.6, textColor=MUTED, spaceAfter=2, leftIndent=10, firstLineIndent=-10)

W = letter[0] - 1.5 * inch  # usable width


def P(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items, style="bullet"):
    return [Paragraph(t, S[style], bulletText="•") for t in items]


def table(rows, widths=None, header=True, zebra=True, align_right_cols=()):
    data = []
    for i, r in enumerate(rows):
        st = S["cellb"] if (header and i == 0) else S["cell"]
        data.append([c if not isinstance(c, str) else Paragraph(c, st) for c in r])
    if widths:
        widths = [w * W for w in widths]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    if header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), ACCENT))
    if zebra:
        for i in range(1 if header else 0, len(rows)):
            if i % 2 == 0:
                cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F4F7FA")))
    t.setStyle(TableStyle(cmds))
    return t


def callout(text, color=ACCENT, bg=ACCENT_LIGHT):
    t = Table([[Paragraph(text, S["callout"])]], colWidths=[W])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, color),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def kpis(items):
    """items: list of (value, label). Renders a row of stat tiles."""
    n = len(items)
    cells = [[Paragraph(f'<font name="DV-B" size="15" color="#1D4E89">{v}</font><br/>'
                        f'<font size="7.6" color="#5F6B7A">{l}</font>',
                        ParagraphStyle("k", fontName="DV", fontSize=8, leading=13)) for v, l in items]]
    t = Table(cells, colWidths=[W / n] * n)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F4F7FA")),
                           ("LINEAFTER", (0, 0), (-2, -1), 2, colors.white),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def fig(fig_obj, path, width_frac=1.0, caption=None):
    fig_obj.savefig(path, bbox_inches="tight")
    plt.close(fig_obj)
    from PIL import Image as PILImage
    w, h = PILImage.open(path).size
    iw = W * width_frac
    out = [Image(path, width=iw, height=iw * h / w)]
    if caption:
        out.append(Paragraph(caption, S["caption"]))
    return KeepTogether(out)


def build(path, story, title, short):
    def on_page(c, doc):
        c.saveState()
        if doc.page > 1:
            c.setFont("DV", 7.5)
            c.setFillColor(MUTED)
            c.drawString(0.75 * inch, 0.5 * inch, short)
            c.drawRightString(letter[0] - 0.75 * inch, 0.5 * inch, f"{doc.page}")
            c.setStrokeColor(RULE)
            c.line(0.75 * inch, letter[1] - 0.55 * inch, letter[0] - 0.75 * inch, letter[1] - 0.55 * inch)
            c.drawString(0.75 * inch, letter[1] - 0.48 * inch, title)
        c.restoreState()
    doc = BaseDocTemplate(path, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                          topMargin=0.75 * inch, bottomMargin=0.75 * inch, title=title,
                          author="Prepared by Claude")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=on_page)])
    doc.build(story)
