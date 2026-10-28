import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/, for fonts.py
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "output", "HCMC_House_Recommendation.pdf")
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

PICK = "TD-14"
ALT = ["TD-11", "D10-1", "TD-09", "TD-02", "TD-13", "TD-18", "TD-04", "TD-16", "TD-12", "TD-07"]
REASON = {
 "TD-11": "Cheapest well-papered 3-storey house: sổ hồng + full hoàn công confirmed, 57 m², 4 bedrooms, on the Phạm Văn Đồng artery (fastest drive to the centre), seller reports no flooding, new 1,000-bed hospital ~3 km. Confirm alley width / car access.",
 "D10-1": "Only realistic District 10 option: 63.7 m², 3 bedrooms, 50 m off Lê Hồng Phong, walk to a top public primary school, Nhi Đồng 1 and Chợ Rẫy hospitals. But ~96 tr/m² is 40-55% below D10 prices with no title shown - buy only if sổ hồng and planning check are clean.",
 "TD-09": "Best land value: 70 m² with car to the door and sổ hồng for 3.9 tỷ, 1 km from Thủ Đức Hospital (Grade I). Old single-storey house - budget ~1.5-2 tỷ to rebuild; still within US$300k all-in. Confirm the ad is live.",
 "TD-02": "Largest family home: 100 m², 3 storeys, private garage, next to upscale Vạn Phúc City, title stated, fair 72 tr/m². Ad marked expired - call to check it is unsold; low-lying riverside, check flooding.",
 "TD-13": "Well-documented (SHR, hoàn công, no setback) 3-storey house in a planned phân lô cluster with car alley, near GigaMall. Downside: premium 131 tr/m² and Linh Đông roads flooded in 2025.",
 "TD-18": "Big 76 m² lot for 4.64 tỷ in established old District 9 with a 500-bed hospital 2.5 km away. Needs rebuild; Lã Xuân Oai is a known flood street; 40-50 min to District 10.",
 "TD-04": "84 m², 3 storeys, alleys front and back for light and air, fair 81 tr/m². Verify title and how close it is to the QL13 widening (works to 2028) and tidal flooding.",
 "TD-16": "59 m² with a wide 5.5 m frontage at a fair 85 tr/m², 1-1.5 km from the regional Thủ Đức hospital. Floors, title and alley unknown (only on batdongsan) - phone first.",
 "TD-12": "Cheap entry (4.7 tỷ) in central Linh Chiểu by Chợ Thủ Đức, Vincom and Metro Line 1. Old house, vague papers, area may be 48 m² not 52, and the Chợ Thủ Đức zone floods.",
 "TD-07": "4-storey street-frontage house near Hiệp Bình market and GigaMall for 5.62 tỷ. Six bedrooms suggests a rental layout; legal status unconfirmed; dense, busy area.",
}
AVOID = [
 ("TD-10", "136 m² for 3.3 tỷ (~24 tr/m², a third of market) with no title mentioned - classic vi bằng / shared-title / farmland bait."),
 ("TD-17", "7 bedrooms / 7 WC = rooming house, priced far below the Vincom area - likely title or planning problem."),
 ("D10-2", "'5xxx' teaser price, far below comparables, and the ad has disappeared from the site index."),
 ("TD-06", "Same house as TD-05 reposted with a different area (56 vs 60 m²) - ask for the title area."),
 ("TD-01 / TD-03 / TD-05", "Priced 118-131 tr/m² right on QL13, which is being widened to 60 m (1,091 households affected); flood-prone."),
 ("TD-19", "Above Long Bình average, far from full hospitals, 50-70 min to District 10."),
]

def ad_link(r): return f'<link href="{r[10]}" color="#0563C1"><u>Open ad</u></link>'

story = []
story += [Paragraph("Your House Shortlist – District 10 &amp; Thủ Đức", T), Spacer(1, 3),
          Paragraph(f"Ho Chi Minh City · prepared 27 October 2026 · budget US$300,000 ≈ <b>{BUDGET*RATE/1e9:.2f} tỷ VND</b> (Vietcombank buying rate {RATE:,} VND/USD) · land area &gt; 50 m² · single-family house, alley OK", ST), Spacer(1, 8)]

story.append(Paragraph("Summary", H1))
story.append(Paragraph(
 f"I reviewed {len(ALL)} current ads (posted Jul–Oct 2026) on muaban.net, alonhadat.com.vn and batdongsan.com.vn in old District 10 and Thủ Đức. "
 f"{len(SL)} passed the budget and size filter; a research agent checked each one's nearest market, supermarket, primary school, hospital, flooding and safety. "
 "The key finding: <b>District 10 is almost out of reach</b> – hẻm houses there average 155–220 million VND/m², so a 50 m² house costs 8–11 tỷ (US$310–430k). "
 "Only two D10 ads fit the budget, and both are priced so far below market that the title must be checked first. <b>Thủ Đức gives you a real, well-papered family home within budget.</b>", P))

r = by[PICK]
story.append(Paragraph("My recommendation", H1))
rec = [[Paragraph(f"<b>{r[0]} · {r[2]}</b><br/>{r[9]:.2f} tỷ ≈ <b>US${usd(r[9]):,.0f}</b> · {r[3]} m² land · {r[4]} · {r[5]} bed/WC · {r[6]} · {r[7]} · posted {r[8]} · {ad_link(r)}", P)]]
rec.append([Paragraph("<b>Why this one</b><br/>"
 "• <b>Highest overall score (20/25)</b> – the only house rated 4/5 on safety, livability, value <i>and</i> verification.<br/>"
 "• <b>Real, checkable ad:</b> exact address (131/46 Đường số 8), sổ hồng stated, car alley with a 7 m road nearby – you can verify it at the ward office before viewing.<br/>"
 "• <b>Fair price:</b> ~109 tr/m² for a 3-storey house with 146 m² of floor space; leaves ~US$74k headroom for taxes, notary and furniture.<br/>"
 "• <b>Quiet, family area:</b> next to a football field and the Linh Xuân cultural centre; no flood reports found (unlike Tam Bình, Hiệp Bình and Chợ Thủ Đức streets).<br/>"
 "• <b>Daily needs within 1 km:</b> " + f"{r[11]}; {r[12]}; {r[13]}. Hospital: {r[14]}.", P)])
rec.append([Paragraph("<b>Watch-outs</b>: confirm the hoàn công (completion certificate); the lot is shallow (11 m); it is the farthest option from District 10 (~45–60 min by car). If you need to be in District 10 daily, look at alternatives #1 and #2 below.", P)])
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
story.append(Paragraph("Distances are estimates from street layout – confirm on Google Maps. Full details for all 21 houses are in the Excel file.", PS))

story.append(Paragraph("Ads to avoid", H1))
data = [[Paragraph(f"<b>{a}</b>", PS), Paragraph(b, PS)] for a, b in AVOID]
t = Table(data, colWidths=[34 * mm, 146 * mm])
t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORANGE), ("GRID", (0, 0), (-1, -1), 0.4, colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(t)

story.append(Paragraph("Before you pay any deposit", H1))
for b in ["Ask for a photo of the <b>sổ hồng</b> and check the owner name, land area and plot number match the ad. Avoid 'vi bằng', 'sổ chung' or handwritten papers.",
          "Request a <b>planning certificate (thông tin quy hoạch)</b> from the ward or check the city planning map – important on QL13 (widening to 60 m), near Ring Road 2 (Tô Ngọc Vân / Tam Bình) and any 'lộ giới' setback.",
          "Check the <b>hoàn công</b> (completion certificate) – floors built without it are not on the title and hurt resale and bank loans.",
          "Visit in <b>heavy rain or at high tide</b> (Sep–Nov) to see flooding; ask neighbours.",
          "Pay through a bank, sign at a notary office, and confirm the property has no existing mortgage. Budget ~1–2% of price for taxes and fees.",
          "Note: ward names changed on 1 July 2025 – the title may show the old ward (e.g., Linh Xuân, Hiệp Bình Phước, Phường 10)."]:
    story.append(Paragraph(b, BL, bulletText="•"))

story.append(Paragraph("Best websites to keep searching", H1))
for n, u, w in WEBSITES:
    story.append(Paragraph(f'<b><link href="{u}" color="#0563C1">{n}</link></b> – {w}', BL, bulletText="•"))

story.append(Paragraph("Sources", H1))
for s in ["Exchange rate: webgia.com/ty-gia/vietcombank (27/10/2026); vnexpress.net/gia-usd-ngan-hang-dao-chieu-tang-5136932.html",
          "District price levels: alonhadat.com.vn ward averages (13/09/2026); muaban.net District 10 and Thủ Đức price tables (Oct 2026)",
          "QL13 widening: vneconomy.vn/tp-ho-chi-minh-chi-hon-12-400-ty-dong-giai-toa-hon-1-000-ho-dan-mo-rong-quoc-lo-13.htm; baodautu.vn/tphcm-khoi-cong-mo-rong-quoc-lo-13-vao-quy-iv2026-d414483.html",
          "Flooding: vnexpress.net/duong-ngap-ca-met-o-thu-duc-4641696.html; sggp.org.vn/cap-bach-giai-quyet-ngap-khu-vuc-cho-thu-duc-post812486.html; cafef.vn (Saigon River record tide, Oct 2026)",
          "Hospitals & schools: plo.vn (Thủ Đức regional hospital opening); pharmacity.vn/benh-vien-thu-duc.htm; hellobacsi.com (Quân dân y miền Đông); toplist.vn (top public primary schools District 10)",
          "Ring Road 2: vietnamplus.vn/thanh-pho-ho-chi-minh-dat-muc-tieu-khep-kin-vanh-dai-2-vao-cuoi-nam-2027-post1129689.amp"]:
    story.append(Paragraph(s, PS))
story.append(Spacer(1, 6))
story.append(Paragraph("This report is research support, not legal or financial advice. Listings change daily – confirm availability and price with the seller.", ParagraphStyle("d", parent=PS, fontName="DVI", textColor=colors.HexColor("#666666"))))

def footer(c, d):
    c.saveState(); c.setFont("DV", 7.5); c.setFillColor(colors.HexColor("#888888"))
    c.drawString(15 * mm, 10 * mm, "HCMC house shortlist · District 10 & Thủ Đức · Oct 2026"); c.drawRightString(195 * mm, 10 * mm, f"Page {d.page}")
    c.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                        title="HCMC House Shortlist", author="Prepared with Claude")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("ok")
