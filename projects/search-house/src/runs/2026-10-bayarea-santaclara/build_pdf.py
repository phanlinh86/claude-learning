import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/, for fonts.py
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "output", "BayArea_House_Recommendation.pdf")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
from data import *
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from fonts import FONT_REGULAR, FONT_BOLD, FONT_ITALIC
for n, f in (("DV", FONT_REGULAR), ("DVB", FONT_BOLD), ("DVI", FONT_ITALIC)):
    pdfmetrics.registerFont(TTFont(n, f))
addMapping("DV", 0, 0, "DV"); addMapping("DV", 1, 0, "DVB"); addMapping("DV", 0, 1, "DVI"); addMapping("DV", 1, 1, "DVB")

NAVY = colors.HexColor("#1F3A5F"); TEAL = colors.HexColor("#2E7D6B"); LIGHT = colors.HexColor("#EEF3F8"); GREEN = colors.HexColor("#E6F2EC"); ORANGE = colors.HexColor("#FCEBDD")
T = ParagraphStyle("t", fontName="DVB", fontSize=19, leading=23, textColor=NAVY)
ST = ParagraphStyle("st", fontName="DV", fontSize=9.5, leading=13, textColor=colors.HexColor("#555555"))
H1 = ParagraphStyle("h1", fontName="DVB", fontSize=13, leading=16, textColor=NAVY, spaceBefore=10, spaceAfter=5)
P = ParagraphStyle("p", fontName="DV", fontSize=9.2, leading=12.8)
PS = ParagraphStyle("ps", fontName="DV", fontSize=7.7, leading=9.8)
PSB = ParagraphStyle("psb", parent=PS, fontName="DVB")
BL = ParagraphStyle("bl", parent=P, leftIndent=10)

by = {r[0]: r for r in SL}
W = 186 * mm
def score(r): return r[18] + r[19] + r[20] + 2 * r[21]
def ppsf(r): return r[10] / r[3]
def link(r): return f'<link href="{r[11]}" color="#0563C1"><u>Open listing</u></link>'
grid = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8D3DF")), ("VALIGN", (0, 0), (-1, -1), "TOP")]

s = []
s += [Paragraph("Your House Shortlist – Santa Clara Area", T), Spacer(1, 3),
      Paragraph(f"Santa Clara · Sunnyvale · Mountain View · North San Jose · prepared 27 October 2026 · budget <b>${BUDGET:,}</b> · single-family, 3+ bd / 2+ ba, garage, {MINSQFT:,}+ sq ft · commute to Marvell (5488 Marvell Ln, Santa Clara) under 20 min", ST), Spacer(1, 6)]
s.append(Paragraph("Summary", H1))
s.append(Paragraph(SUMMARY.format(n_all=len(ALL), n_sl=len(SL)), P))

r = by[PICK]
s.append(Paragraph("My recommendation", H1))
rec = [[Paragraph(f"<b>{r[0]} · {r[2]}</b><br/><b>${r[10]:,}</b> (${ppsf(r):,.0f}/sq ft) · {r[3]:,} sq ft · lot {r[4]} · {r[5]} bd/ba · {r[6]} garage · built {r[7]} · HOA {r[8]} · {r[9]} · {link(r)}", P)],
       [Paragraph("<b>Why this one</b><br/>" + "<br/>".join("• " + w for w in WHY) + f"<br/>• <b>Nearby:</b> {r[12]}; {r[13]}; {r[14]}.", P)],
       [Paragraph("<b>" + WATCH.split(":")[0] + "</b>:" + WATCH.split(":", 1)[1], P)]]
t = Table(rec, colWidths=[W]); t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREEN), ("BOX", (0, 0), (-1, -1), 1, TEAL),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
s.append(t)

s.append(Paragraph("Top 10 alternatives", H1))
d = [[Paragraph(h, PSB) for h in ["#", "Home", "Price", "Size", "Commute", "Score", "Why consider it"]]]
for i, k in enumerate(ALT, 1):
    r = by[k]
    d.append([Paragraph(str(i), PS), Paragraph(f"<b>{r[0]}</b><br/>{r[2]}<br/>{link(r)}", PS),
              Paragraph(f"${r[10]/1e6:,.3f}M<br/>${ppsf(r):,.0f}/sq ft", PS), Paragraph(f"{r[3]:,} sq ft<br/>{r[5]}", PS),
              Paragraph(r[16], PS), Paragraph(f"{score(r)}/25", PS), Paragraph(REASON[k], PS)])
t = Table(d, colWidths=[8*mm, 43*mm, 21*mm, 20*mm, 21*mm, 13*mm, 60*mm], repeatRows=1)
t.setStyle(TableStyle(grid + [("BACKGROUND", (0, 0), (-1, 0), LIGHT), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")])]))
s.append(t)
s.append(Paragraph("Score = Safety + Livability + Value + 2 × Verification (each 1–5, max 25). Homes that meet the 20-minute commute are ranked first; NS-5 and NS-7 score well but are 20–25 minutes away. Full details for all homes are in the Excel file.", PS))

s.append(Paragraph("Surroundings of the top picks", H1))
d = [[Paragraph(h, PSB) for h in ["Home", "Grocery", "Elementary school", "Hospital (ER)", "Safety & hazards"]]]
for k in [PICK] + ALT[:5]:
    r = by[k]
    d.append([Paragraph(f"<b>{k}</b><br/>{r[16]}", PS)] + [Paragraph(x, PS) for x in (r[12], r[13], r[14], r[15])])
t = Table(d, colWidths=[20*mm, 34*mm, 42*mm, 38*mm, 52*mm], repeatRows=1)
t.setStyle(TableStyle(grid + [("BACKGROUND", (0, 0), (-1, 0), LIGHT)]))
s.append(t)
s.append(Paragraph("Distances and commute times are estimates – confirm on Google Maps at rush hour, and check school assignment by address with the district.", PS))

s.append(Paragraph("Listings to avoid", H1))
t = Table([[Paragraph(f"<b>{a}</b>", PS), Paragraph(b, PS)] for a, b in AVOID], colWidths=[40*mm, W - 40*mm])
t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORANGE), ("GRID", (0, 0), (-1, -1), 0.4, colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
s.append(t)

s.append(Paragraph("Before you make an offer", H1))
for b in ["Get a <b>mortgage pre-approval</b> (at $2M a jumbo loan is likely) and budget ~1.2% a year property tax (~$24K), insurance and any HOA / Mello-Roos.",
          "Read the <b>disclosure package</b> (TDS, SPQ, Natural Hazard Disclosure) before offering; many homes here have pre-inspections.",
          "Order <b>home and termite inspections</b>; for remodels and flips, pull city <b>permit history</b> and compare to the listing.",
          "Check the <b>FEMA flood zone</b> (msc.fema.gov), liquefaction maps, and get an insurance quote including earthquake cover.",
          "For ADUs, confirm the ADU is permitted and how it is metered; for new builds, confirm the final inspection / certificate of occupancy.",
          "Review the <b>preliminary title report</b>; decide which contingencies (loan, appraisal, inspection) you can keep – competitive homes here often go non-contingent.",
          "Drive the commute at rush hour and confirm the assigned elementary school by address."]:
    s.append(Paragraph(b, BL, bulletText="•"))

s.append(Paragraph("Best websites to keep searching", H1))
for n, u, w in WEBSITES:
    s.append(Paragraph(f'<b><link href="{u}" color="#0563C1">{n}</link></b> – {w}', BL, bulletText="•"))
s.append(Paragraph("Sources", H1))
for x in SOURCES: s.append(Paragraph(x, PS))
s.append(Spacer(1, 6))
s.append(Paragraph("This report is research support, not legal, tax or financial advice. Listings change daily – confirm status and price with the listing agent.", ParagraphStyle("d", parent=PS, fontName="DVI", textColor=colors.HexColor("#666666"))))

def footer(c, doc):
    c.saveState(); c.setFont("DV", 7.5); c.setFillColor(colors.HexColor("#888888"))
    c.drawString(15*mm, 9*mm, "House shortlist · Santa Clara area · Oct 2026"); c.drawRightString(letter[0] - 15*mm, 9*mm, f"Page {doc.page}"); c.restoreState()
SimpleDocTemplate(OUT, pagesize=letter, leftMargin=15*mm, rightMargin=15*mm, topMargin=13*mm, bottomMargin=15*mm,
                  title="House Shortlist – Santa Clara Area", author="Prepared with Claude").build(s, onFirstPage=footer, onLaterPages=footer)
print("ok")
