import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/, for fonts.py
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "output", "Quan3_House_Recommendation.pdf")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
from data import *
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak

from fonts import FONT_REGULAR, FONT_BOLD, FONT_ITALIC
pdfmetrics.registerFont(TTFont("DV", FONT_REGULAR))
pdfmetrics.registerFont(TTFont("DVB", FONT_BOLD))
pdfmetrics.registerFont(TTFont("DVI", FONT_ITALIC))
from reportlab.lib.fonts import addMapping
addMapping("DV", 0, 0, "DV"); addMapping("DV", 1, 0, "DVB"); addMapping("DV", 0, 1, "DVI"); addMapping("DV", 1, 1, "DVB")

NAVY = colors.HexColor("#1F3A5F"); TEAL = colors.HexColor("#2E7D6B"); LIGHT = colors.HexColor("#EEF3F8"); GREEN = colors.HexColor("#E6F2EC"); ORANGE = colors.HexColor("#FCEBDD")
T = ParagraphStyle("t", fontName="DVB", fontSize=20, leading=24, textColor=NAVY)
ST = ParagraphStyle("st", fontName="DV", fontSize=10, leading=14, textColor=colors.HexColor("#555555"))
H1 = ParagraphStyle("h1", fontName="DVB", fontSize=13.5, leading=17, textColor=NAVY, spaceBefore=10, spaceAfter=5)
H2 = ParagraphStyle("h2", fontName="DVB", fontSize=11, leading=14, textColor=TEAL, spaceBefore=6, spaceAfter=3)
P = ParagraphStyle("p", fontName="DV", fontSize=9.3, leading=13)
PS = ParagraphStyle("ps", fontName="DV", fontSize=7.8, leading=10)
PSB = ParagraphStyle("psb", parent=PS, fontName="DVB")
BL = ParagraphStyle("bl", parent=P, leftIndent=10, bulletIndent=0)

by = {r[0]: r for r in SL}
def usd(ty): return ty * 1e9 / RATE
def score(r): return r[17] + r[18] + r[19] + 2 * r[20]
def ppm(r): return r[9] * 1000 / r[3]

def ad_link(r): return f'<link href="{r[10]}" color="#0563C1"><u>Open ad</u></link>'

story = []
story += [Paragraph(TITLE, T), Spacer(1, 3),
          Paragraph(f"Ho Chi Minh City · prepared 27 October 2026 · budget US$300,000 ≈ <b>{BUDGET*RATE/1e9:.2f} tỷ VND</b> (Vietcombank buying rate {RATE:,} VND/USD) · land area &gt; 50 m² · " + SUBTITLE_EXTRA, ST), Spacer(1, 8)]

story.append(Paragraph("Summary", H1))
story.append(Paragraph(SUMMARY.format(n_all=len(ALL)), P))

r = by[PICK]
story.append(Paragraph("My recommendation", H1))
rec = [[Paragraph(f"<b>{r[0]} · {r[2]}</b><br/>{r[9]:.2f} tỷ ≈ <b>US${usd(r[9]):,.0f}</b> · {r[3]} m² land · {r[4]} · {r[5]} bed/WC · {r[6]} · {r[7]} · posted {r[8]} · {ad_link(r)}", P)]]
rec.append([Paragraph("<b>Why this one</b><br/>" + "<br/>".join("• " + w for w in WHY) + "<br/>• <b>Daily needs:</b> " + f"{r[11]}; {r[12]}; {r[13]}. Hospital: {r[14]}.", P)])
rec.append([Paragraph("<b>" + WATCH.split(":")[0] + "</b>:" + WATCH.split(":", 1)[1], P)])
t = Table(rec, colWidths=[180 * mm])
t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREEN), ("BOX", (0, 0), (-1, -1), 1, TEAL), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
story.append(t)

story.append(Paragraph("Top 10 alternatives", H1))
data = [[Paragraph(h, PSB) for h in ["#", "House", "Price", "Land", "Score", "Why consider it"]]]
for i, k in enumerate(ALT, 1):
    r = by[k]
    data.append([Paragraph(str(i), PS),
                 Paragraph(f"<b>{r[0]}</b><br/>{r[2]}<br/>{ad_link(r)}", PS),
                 Paragraph(f"{r[9]:.2f} tỷ<br/>${usd(r[9])/1000:,.0f}k<br/>{ppm(r):.0f} tr/m²", PS),
                 Paragraph(f"{r[3]} m²", PS),
                 Paragraph(f"{score(r)}/25", PS),
                 Paragraph(REASON[k], PS)])
t = Table(data, colWidths=[9 * mm, 45 * mm, 20 * mm, 14 * mm, 15 * mm, 77 * mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), LIGHT), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8D3DF")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                       ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")])]))
story.append(t)
story.append(Paragraph("Score = Safety + Livability + Value + 2 × Verification (each 1–5, max 25). Verification counts double because unverified cheap listings are the main risk in this market.", PS))

story.append(Paragraph("Surroundings of the top picks", H1))
data = [[Paragraph(h, PSB) for h in ["House", "Market", "Supermarket", "Primary school", "Hospital", "Safety / flooding"]]]
for k in [PICK] + ALT[:5]:
    r = by[k]
    data.append([Paragraph(f"<b>{k}</b>", PS)] + [Paragraph(x, PS) for x in (r[11], r[12], r[13], r[14], r[15])])
t = Table(data, colWidths=[14 * mm, 28 * mm, 30 * mm, 30 * mm, 36 * mm, 42 * mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), LIGHT), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8D3DF")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(t)
story.append(Paragraph("Distances are estimates from street layout – confirm on Google Maps. Full details for all houses are in the Excel file.", PS))

story.append(Paragraph("Ads to avoid", H1))
data = [[Paragraph(f"<b>{a}</b>", PS), Paragraph(b, PS)] for a, b in AVOID]
t = Table(data, colWidths=[34 * mm, 146 * mm])
t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORANGE), ("GRID", (0, 0), (-1, -1), 0.4, colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(t)

story.append(Paragraph("Before you pay any deposit", H1))
for b in ["Ask for a photo of the <b>sổ hồng</b> and check the owner name, land area and plot number match the ad. Avoid 'vi bằng', 'sổ chung' or handwritten papers.",
          "Request a <b>planning certificate (thông tin quy hoạch)</b> from the ward or check the city planning map – especially for any 'lộ giới' (road-widening) setback and for houses near Metro Line 2 on Cách Mạng Tháng 8.",
          "Check the <b>hoàn công</b> (completion certificate) – floors built without it are not on the title and hurt resale and bank loans.",
          "Visit in <b>heavy rain</b> (Sep–Nov) to see flooding, especially canal-side streets (Rạch Bùng Binh, Trường Sa) and Nguyễn Kiệm; ask neighbours.",
          "Pay through a bank, sign at a notary office, and confirm the property has no existing mortgage. Budget ~1–2% of price for taxes and fees.",
          "Note: ward names changed on 1 July 2025 – the title may show the old ward (e.g., Phường 9 Quận 3 → Nhiêu Lộc; Phường 13 Phú Nhuận)."]:
    story.append(Paragraph(b, BL, bulletText="•"))

story.append(Paragraph("Best websites to keep searching", H1))
for n, u, w in WEBSITES:
    story.append(Paragraph(f'<b><link href="{u}" color="#0563C1">{n}</link></b> – {w}', BL, bulletText="•"))

story.append(Paragraph("Sources", H1))
for s in SOURCES:
    story.append(Paragraph(s, PS))
story.append(Spacer(1, 6))
story.append(Paragraph("This report is research support, not legal or financial advice. Listings change daily – confirm availability and price with the seller.", ParagraphStyle("d", parent=PS, fontName="DVI", textColor=colors.HexColor("#666666"))))

def footer(c, d):
    c.saveState(); c.setFont("DV", 7.5); c.setFillColor(colors.HexColor("#888888"))
    c.drawString(15 * mm, 10 * mm, FOOT); c.drawRightString(195 * mm, 10 * mm, f"Page {d.page}")
    c.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                        title="HCMC House Shortlist", author="Prepared with Claude")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("ok")
