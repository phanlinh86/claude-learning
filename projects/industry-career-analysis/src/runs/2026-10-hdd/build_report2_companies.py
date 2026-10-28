import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/ for common.py
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(os.path.join(OUT_DIR, "img"), exist_ok=True)
from common import *
from reportlab.platypus import CondPageBreak
import numpy as np

OUT = os.path.join(OUT_DIR, "HDD_Companies_Analysis.pdf")
IMG = os.path.join(OUT_DIR, "img", "img2_")
story = []

story += [Spacer(1, 30),
          P("HDD Companies Analysis", "title"),
          P("Seagate, Western Digital, Toshiba and the HDD supply chain — financials, technology, growth potential "
            "and downturn survivability<br/>Report 2 of 3 · Prepared 28 October 2026", "subtitle"),
          kpis([("3", "HDD makers left<br/>(Seagate, WD, Toshiba)"),
                ("44/44/11%", "Revenue share 2026<br/>WD / Seagate / Toshiba"),
                ("Net cash", "Seagate (by end-2026) and WD<br/>both investment-grade or near"),
                ("Survive", "All three survive a 2023-style<br/>downturn; layoffs likely")]),
          Spacer(1, 14),
          P("Bottom line", "h1"),
          callout("<b>Seagate and Western Digital are both strong, long-lived businesses and would stay profitable even in a "
                  "severe downturn.</b> They are a near-duopoly in data-center HDD, each with ~44% revenue share, net cash, "
                  "~50% operating margins today and contracts out to 2028–31. <b>Seagate</b> leads in HAMR by ~1.5–2 years and "
                  "is fully vertically integrated; <b>WD</b> spends more on R&amp;D ($1.16B vs $0.76B), has the broadest "
                  "mechatronics roadmap (14 platters, triple actuation, dual pivot, multi-head) and is the share leader in exabytes. "
                  "<b>Toshiba</b> is investing to catch up but is ~2 years behind, depends on TDK for heads and is owned by private "
                  "equity — a weaker 20-year bet."),
          Spacer(1, 8), P("Scorecard", "h2"),
          table([
              ["", "Seagate (STX)", "Western Digital (WDC)", "Toshiba (HDD unit)"],
              ["Latest qtr revenue (Sep-26)", "$4.23B (+61%)", "$4.38B (+55%)", "~$1.1–1.4B [EST]"],
              ["Gross / operating margin", "57.8% / 50.7%", "58.1% / 49.1%", "Not disclosed (group target 10% op.)"],
              ["FY2026 R&amp;D", "$755M (6% of rev.)", "$1,161M (9% of rev.)", "Not disclosed"],
              ["Balance sheet", "Debt ~$1.6B, net cash by end-2026", "Net cash +$0.5B; investment grade", "Private (JIP consortium)"],
              ["Technology position", "HAMR leader (44TB shipping)", "ePMR/SMR leader; HAMR 1H27", "MAMR; HAMR ~FY28; ~2 yrs behind"],
              ["Vertical integration", "Full (heads, media, lasers, SoC)", "Heads + media in-house; own laser", "Buys 100% of heads from TDK"],
              ["Employees", "~30,000 (83% Asia)", "~40,000 (88% Asia)", "HDD share of ~100k group"],
              ["Survives severe downturn?", "<font color='#2E7D4F'><b>Yes — clearly</b></font>", "<font color='#2E7D4F'><b>Yes — clearly</b></font>", "<font color='#B26A00'><b>Likely; less certain</b></font>"],
              ["5-yr growth outlook", "<b>Strong</b>", "<b>Strong</b>", "Moderate (share gains from low base)"],
          ], widths=[0.25, 0.25, 0.25, 0.25]),
          P("Sources: company SEC filings and earnings calls (Oct 2026), TrendForce, Coughlin Associates, Blocks &amp; Files. "
            "[EST] = analyst estimate. Not investment advice.", "small"),
          PageBreak()]

# ---------------- Market share ----------------
story.append(P("1. Industry structure", "h1"))
story.append(P("Consolidation finished a decade ago: from 9+ makers in 2000 to three. Seagate and WD split the data-center "
               "market almost evenly; Toshiba is a distant third in exabytes because it sells more low-capacity drives and is a "
               "generation behind in nearline."))
f, axs = plt.subplots(1, 3, figsize=(7.4, 2.3))
data = [("Units, 1Q25", [40, 42, 18]), ("Exabytes, 1Q25", [40, 50, 11]), ("Revenue, 2026", [44, 44, 11])]
for ax, (t, v) in zip(axs, data):
    ax.pie(v, labels=[f"Seagate\n{v[0]}%", f"WD\n{v[1]}%", f"Toshiba\n{v[2]}%"], colors=[C1, C2, C4],
           startangle=90, counterclock=False, wedgeprops=dict(width=0.42, edgecolor="white"), textprops=dict(fontsize=7.5))
    ax.set_title(t, fontsize=9, fontweight="bold")
story.append(fig(f, IMG + "share.png", caption="Sources: TRENDFOCUS via StorageNewsletter (1Q25 units), derived exabyte share, "
                 "Blocks &amp; Files (Oct 2026). Rounded."))

# ---------------- Seagate ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("2. Seagate Technology (STX)", "h1"))
story.append(P("Ireland-domiciled, run from Fremont/Cupertino, California. Pure-play mass-capacity storage; no NAND fabs. "
               "Strategy: no new unit capacity — grow exabytes ~25%/yr through areal density (HAMR) with capex held at 4–6% of revenue."))
story.append(P("Financial analysis", "h2"))
story.append(table([
    ["$M (GAAP)", "FY19", "FY20", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26", "FY27E"],
    ["Revenue", "10,390", "10,509", "10,681", "11,661", "7,384", "6,551", "9,097", "12,195", "~18,500"],
    ["Gross margin", "28.2%", "27.0%", "27.3%", "29.7%", "18.3%", "23.4%", "35.2%", "45.6%", "~57%"],
    ["R&amp;D", "991", "973", "903", "941", "797", "654", "724", "755", "~820"],
    ["Operating margin", "14.3%", "12.4%", "14.0%", "16.8%", "−4.6%", "6.9%", "20.8%", "33.6%", "~50%"],
    ["Net income", "2,012", "1,004", "1,314", "1,649", "−529", "335", "1,469", "3,184", "~8,000"],
    ["Employees (k)", "40.5", "~40", "~40", "40.0", "33.4", "30.0", "30.0", "30.0", "—"],
], widths=[0.17] + [0.0922] * 9))
story.append(P("FY ends around 30 June. FY23 operating loss includes a $300M export-control penalty. FY27E = analyst estimate "
               "from Q1 actual ($4.23B) and Q2 guidance ($4.8B).", "small"))
story += bullets([
    "<b>Mix:</b> Data Center ~81% of revenue ($3.4B in Sep-26 qtr); Edge-IoT ~19%. FY26 nearline exabytes 695 EB (+40%). "
    "Revenue per TB ~$19 (+~30% YoY).",
    "<b>Contracts:</b> most nearline exabytes allocated under LTAs through CY2028, some to 2030; CY2027 prices fixed. One customer = 14% of revenue.",
    "<b>Balance sheet:</b> debt cut from ~$5.0B to ~$1.6B; net leverage 0.2x; net cash expected by end-2026. Returns ~75% of FCF; dividend $0.76/qtr.",
    "<b>Opex is very lean:</b> ~$300M/qtr (~7% of revenue). R&amp;D was cut 34% between FY19 and FY24 and has barely recovered — record profit, flat headcount.",
    "<b>Stock:</b> $668 (27 Oct 2026), ~$150B market cap; 52-week range $218–$1,145, so ~40% below the peak. ~17–18x run-rate EPS.",
])
story.append(P("Technology analysis", "h2"))
story += bullets([
    "<b>Only maker shipping HAMR in volume.</b> Mozaic 3+ (30–36TB) qualified at all major clouds; Mozaic 4+ (44TB) shipping since March 2026 "
    "to the two largest; HAMR ~50% of nearline EB exiting 2026, target ~70% by mid-2027. Mozaic 5+ (50TB+) qualification late 2027.",
    "<b>Lab:</b> 6.9–8TB per platter demonstrated; target 10TB/platter → 100TB drives. Product steps ~4/5/6 TB per platter in 2027/28/29.",
    "<b>Vertical integration:</b> head wafer fabs (Northern Ireland, Minnesota), media (Singapore), in-house HAMR lasers/NFT and SoC; bought "
    "Intevac (media deposition tools) in 2025. Bloomberg reports interest in buying TDK's head business (not confirmed).",
    "<b>MACH.2</b> dual-actuator drives exist in small volume; relevance rises at 50TB+.",
    "<b>Risks:</b> HAMR scrap/yield is slowing cost-per-TB declines; lowest R&amp;D intensity of the three.",
])

# ---------------- WD ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("3. Western Digital (WDC, branded \"WD\")", "h1"))
story.append(P("San Jose, California. Spun off its flash business as Sandisk in February 2025, making WD a pure-play HDD company "
               "(~88% of revenue from cloud). Built on the HGST (Hitachi/IBM) and legacy WD engineering organizations."))
story.append(P("Financial analysis", "h2"))
story.append(table([
    ["$M", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26", "Q1 FY27", "Q2 FY27 guide", "FY27E"],
    ["HDD revenue", "8,216", "9,040", "6,255", "6,316", "9,520", "12,919", "4,381", "5,100", "~19,500"],
    ["Gross margin (non-GAAP)", "27.0%", "29.4%", "24.1%", "29.8%", "39.4%", "49.1%", "58.1%", "60–61%", "~59%"],
    ["R&amp;D (GAAP)", "—", "—", "—", "—", "994", "1,161", "283", "—", "~1,200"],
    ["Operating margin (non-GAAP)", "—", "—", "—", "—", "24.4%", "37.3%", "49.1%", "~52%", "~51%"],
    ["Free cash flow", "—", "—", "—", "—", "1,432", "3,511", "1,377", "—", "~7,000"],
    ["Employees (k)", "—", "65*", "53*", "51*", "~40", "~40", "", "", ""],
], widths=[0.19] + [0.09] * 9))
story.append(P("FY21–FY24 = HDD segment (non-GAAP segment gross margin). *Headcount before FY25 includes flash. FY27E = analyst estimate.", "small"))
story += bullets([
    "<b>Exabytes:</b> 248 EB in Sep-26 qtr (+22% YoY), largest in the industry; price per TB +28% YoY. Cloud $3.9B (88%).",
    "<b>Concentration:</b> top-3 customers = 44% of FY26 revenue (16/15/13%), top-10 = 73%. Top 7 customers have visibility to 2030–31.",
    "<b>Balance sheet transformed:</b> debt $7.4B (2024) → $0.79B; net cash ~$0.5B; Sandisk stake fully monetized; S&amp;P and Fitch investment grade.",
    "<b>Targets already beaten:</b> Feb-2026 model (>50% GM, >40% op. margin, EPS >$20) is being met at run-rate. Buybacks $2.6B in FY26.",
    "<b>Stock:</b> ~$354 (22 Oct 2026), ~$132B market cap, ~15x forward run-rate EPS.",
    "<b>Layoffs during the boom:</b> 134 San Jose roles cut in Jan 2026 (post-split reshaping); restructuring charges ~$43M in Q1 FY27.",
])
story.append(P("Technology analysis", "h2"))
story += bullets([
    "<b>Leader in conventional/SMR:</b> ePMR + OptiNAND + UltraSMR + 11 platters → 40TB UltraSMR drive in volume since mid-2026 "
    "(~50% of nearline shipments by early 2027). WD targets ~60% of exabytes on UltraSMR.",
    "<b>HAMR follower:</b> 44TB HAMR finishes qualification with 2 hyperscalers in Q1 2027, volume 1H27; 2nd generation (~5TB/platter) in 2H27. "
    "Roadmap 60TB (ePMR and HAMR, 14 platters) 2028 → 100TB HAMR 2029, using an in-house surface-emitting laser that saves z-height.",
    "<b>Broadest mechatronics roadmap:</b> High-Bandwidth Drive (multiple heads active at once, 2x now → 8x by 2030, sampling at 5 customers), "
    "Dual Pivot (two actuators, 2028), triple-stage actuation, power-optimized drive (−20% power), HDMR in the 2030s.",
    "<b>R&amp;D intensity is the highest</b> of the three in dollars ($1.16B FY26). Key risk: 2027–28 HAMR execution versus Seagate.",
])

# ---------------- Toshiba ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("4. Toshiba Electronic Devices &amp; Storage (HDD)", "h1"))
story.append(P("Toshiba was taken private by the JIP consortium in December 2023. HDD results are not reported separately; "
               "group operating income rose from ¥39.9bn (FY2023) to ¥198.5bn (FY2024), partly on HDD."))
story += bullets([
    "<b>Share:</b> ~17–18% of units but only ~10–11% of exabytes and revenue. 1Q25: 5.2M drives, 41 EB, $945M. HDD revenue [EST] ~$3.8–4.2B in 2025, $4.5–5.5B in 2026.",
    "<b>Expanding, not exiting:</b> Oct-2026 announced ~¥60bn (~$380M) for Philippine plants to roughly double data-center output by FY2027; "
    "medium-term goal ~30% of industry production capacity. Seagate/WD shares fell 10–15% on the news.",
    "<b>Technology:</b> MAMR 24TB CMR / 28TB SMR shipping; 30–34TB SMR samples on 11 platters; 12-platter glass stack verified (Oct 2025). "
    "40TB-class 2027, 45TB HAMR 2028, ~55–65TB around 2030. ~18–24 months behind Seagate.",
    "<b>Key dependency:</b> buys 100% of heads from TDK. Bloomberg (Oct 2026) reports Seagate and Toshiba competing to buy TDK's head "
    "business; if Seagate wins, Toshiba would source heads from its main rival.",
    "<b>People:</b> ~4,000 Japan job cuts in May 2024 (early retirement for staff 50+). Core HDD design in Yokohama/Kawasaki; a small "
    "San Jose team (self-servo-write, actuator system ID) — likely a few dozen HDD engineers outside Japan [EST].",
])

# ---------------- Supply chain ----------------
story.append(P("5. Other HDD employers: the supply chain", "h1"))
story.append(table([
    ["Company", "Role in HDD", "Latest data", "Relevance for a servo engineer"],
    ["TDK / SAE Magnetics / Headway / Hutchinson", "Only independent head maker; suspensions with microactuators",
     "Segment sales ¥262.9bn (+17.6%), op. profit ~¥27bn (~8x); head unit may be sold", "Low–medium: head/HGA, microactuator; mostly Asia"],
    ["Resonac (ex-Showa Denko)", "Largest merchant media supplier", "Singapore plant 160M → 210M disks/yr for HAMR/MAMR", "Low: materials/process"],
    ["NHK Spring", "Suspensions", "FY3/26 sales ¥126.7bn, 20.6% margin; capex nearly triples", "Low"],
    ["Hoya", "Glass substrates (100% of glass; ~40% of 3.5\" DC)", "~¥50bn Vietnam plant for FY2028", "Low"],
    ["Marvell / Broadcom", "HDD SoC, read channel, preamps", "Still supply all HDD makers; small HDD teams", "Medium: servo demodulation, SoC — but wind-down risk"],
], widths=[0.22, 0.24, 0.3, 0.24]))
story.append(P("Real servo control-loop work stays inside Seagate, WD and Toshiba. Suppliers mostly hire materials and process engineers in Japan and Southeast Asia.", "small"))

# ---------------- Growth & downturn ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("6. Growth potential, 2026–2031", "h1"))
f, ax = plt.subplots(figsize=(7.2, 2.7))
yrs = ["FY19", "FY20", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26", "FY27E"]
stx = [10.39, 10.51, 10.68, 11.66, 7.38, 6.55, 9.10, 12.20, 18.5]
wdc = [9.0, 8.6, 8.22, 9.04, 6.26, 6.32, 9.52, 12.92, 19.5]
x = np.arange(len(yrs))
ax.bar(x - 0.2, stx, 0.4, color=C1, label="Seagate")
ax.bar(x + 0.2, wdc, 0.4, color=C2, label="WD (HDD only)")
ax.set_xticks(x); ax.set_xticklabels(yrs); ax.set_ylabel("Revenue, $B"); ax.grid(axis="x", visible=False)
ax.legend(fontsize=8, loc="upper left")
ax.set_title("Revenue history: the 2023 trough and the AI-driven surge", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "rev.png", caption="WD FY19–20 approximate. FY27E = analyst estimate based on Q1 actual and Q2 guidance."))
story.append(table([
    ["Base case [EST]", "Seagate", "WD", "Toshiba HDD"],
    ["Revenue 2026 (calendar)", "~$15.8B", "~$16.6B", "~$4.5–5.5B"],
    ["Revenue 2031", "~$22–25B", "~$23–26B", "~$6–8B"],
    ["CAGR 2026–31", "~7–9%", "~7–9%", "~6–9% (share gains, lower price)"],
    ["Operating margin 2031", "~30–40% (from ~50%)", "~30–40% (from ~49%)", "Low double digits"],
    ["Biggest swing factor", "Keeping HAMR lead; 2028 LTA price reset", "HAMR execution 2027–28; customer concentration", "Head supply (TDK); catch-up on HAMR"],
], widths=[0.25, 0.25, 0.25, 0.25]))
story.append(P("Company forecasts apply Report 1's base case (industry ~$54B in 2031) with Seagate and WD holding ~42–45% share each "
               "and Toshiba rising toward ~13%. Margins are assumed to mean-revert as prices normalize, but remain well above the 2018–19 "
               "peak (~15% operating margin) because opex is so lean."))

story.append(CondPageBreak(4.5 * inch))
story.append(P("7. Can they survive a whole-market downturn?", "h1"))
story.append(P("I stress-tested Seagate and WD against two scenarios from Report 1, starting from the FY27 run-rate. "
               "<b>Scenario A</b> (Report 1 bear case): revenue −35%, gross margin compresses to 35%. "
               "<b>Scenario B</b> (a repeat of 2023): revenue −45%, gross margin falls to 22%."))
story.append(table([
    ["[EST]", "Seagate — A", "Seagate — B", "WD — A", "WD — B"],
    ["Revenue", "$12.0B", "$10.2B", "$12.7B", "$10.7B"],
    ["Gross profit", "$4.2B", "$2.2B", "$4.4B", "$2.4B"],
    ["Opex (held flat)", "$1.25B", "$1.25B", "$1.6B", "$1.6B"],
    ["Operating income", "<b>~$2.9B (24%)</b>", "<b>~$1.0B (10%)</b>", "<b>~$2.8B (22%)</b>", "<b>~$0.8B (7%)</b>"],
    ["Balance sheet entering", "Net cash", "Net cash", "Net cash", "Net cash"],
    ["Likely company response", "Pause buybacks; hiring freeze", "Restructuring 10–15%; plant underutilization", "Pause buybacks; hiring freeze", "Restructuring 10–15%; R&amp;D trims"],
], widths=[0.2, 0.2, 0.2, 0.2, 0.2]))
story.append(Spacer(1, 6))
story += bullets([
    "<b>Survival is not in question for Seagate or WD.</b> Even a 2023-repeat leaves both profitable — in FY2023 they lost money because "
    "they carried $5–7B of debt, higher opex and a PC/consumer-heavy mix. Today both are net cash with opex at 7–9% of revenue.",
    "<b>Jobs are a different question.</b> In 2022–23 Seagate cut ~25% of headcount (40k → 30k) and executives took zero salary for six months; "
    "WD cut 65k → 53k. Both trimmed US R&amp;D sites (Shakopee, Irvine) while Asian centers held. Expect a 10–15% restructuring in scenario B.",
    "<b>Toshiba</b> is private, so finances are opaque. It would likely survive inside the Toshiba group, but a downturn while it is spending to "
    "catch up — plus a private-equity owner looking for an exit — raises the risk of a sale or retreat of the HDD unit.",
    "<b>Suppliers</b> (TDK heads, Marvell/Broadcom HDD chips) are the most exposed: HDD is a non-core unit for their parents, so a downturn "
    "could accelerate divestiture or wind-down.",
])
story.append(callout("<b>Long-term ranking (10–20 years) on business strength:</b> <b>1. Seagate</b> and <b>1. WD</b> (tie — Seagate stronger in "
                     "HAMR and integration, WD stronger in R&amp;D spend and roadmap breadth), <b>3. Toshiba</b>, then supply-chain firms. "
                     "If the industry ever consolidates to two, the two will almost certainly be Seagate and WD.", GOOD, colors.HexColor("#EAF4EE")))

story.append(PageBreak())
story.append(P("Sources", "h1"))
for s in [
    "Seagate FQ1 FY2027 press release (SEC, 27 Oct 2026): https://www.sec.gov/Archives/edgar/data/0001137789/000113778926000300/stxq12027pressreleasefinan.htm",
    "Seagate FQ4 FY2026 press release: https://www.sec.gov/Archives/edgar/data/0001137789/000113778926000153/stxq42026pressreleasefinan.htm",
    "Seagate FY2026 10-K: https://www.sec.gov/Archives/edgar/data/0001137789/000113778926000159/stx-20260703.htm ; FY2023 10-K: https://www.sec.gov/Archives/edgar/data/1137789/000113778923000049/stx-20230630.htm",
    "Seagate 8-K, October 2022 restructuring: https://www.sec.gov/Archives/edgar/data/1137789/000113778922000116/stx-20221026.htm",
    "Seagate FQ1 FY27 call highlights (MarketBeat): https://www.marketbeat.com/instant-alerts/transcript-seagate-technology-q1-earnings-call-highlights-2026-10-27/",
    "Finboard STX income statement history: https://finboard.net/companies/STX/income-statement ; StockAnalysis STX employees: https://www.stockanalysis.com/stocks/stx/employees/",
    "Blocks &amp; Files, Seagate layoffs 2023: https://blocksandfiles.com/2023/05/24/seagate-lays-off-staff-as-it-refinances-for-debt-repayment/",
    "Shakopee Valley News, Seagate layoffs in Shakopee: https://swnewsmedia.com/shakopee_valley_news/news/business/seagate-lays-off-employees-in-shakopee/article_d46945dd-e74b-5654-adaf-b4d3f6ca69bc.html",
    "WD FQ1 FY2027 press release: https://westerndigital.com/company/newsroom/press-releases/2026/2026-10-22-wd-reports-fiscal-first-quarter-2027-financial-results",
    "WD FQ4 FY2026 press release (SEC): https://www.sec.gov/Archives/edgar/data/0000106040/000162828026053305/a4ex991-pressreleaseq426.htm",
    "WD FQ1 FY27 call highlights (MarketBeat): https://www.marketbeat.com/instant-alerts/transcript-western-digital-q1-earnings-call-highlights-2026-10-22/",
    "StorageReview, WD 40TB UltraSMR, HBD, Dual Pivot: https://www.storagereview.com/news/wd-bets-8x-bandwidth-beats-more-terabytes-as-40tb-ultrasmr-starts-shipping",
    "NAND Research, WD Innovation Day (Feb 2026): https://nand-research.com/research-note-western-digital-innovation-day/",
    "OCBJ, WD Irvine job cuts: https://www.ocbj.com/technology/western-digital-plans-62-job-cuts-in-irvine/",
    "Blocks &amp; Files, Toshiba spending $380M to catch up (6 Oct 2026): https://www.blocksandfiles.com/disk/2026/10/06/distant-third-hdd-maker-toshiba-spending-380-million-to-catch-up/5301322",
    "TrendForce, Toshiba to double AI DC HDD capacity: https://trendforce.com/news/2026/10/02/news-toshiba-to-double-ai-data-center-hdd-capacity-by-fy2027-with-380m-expansion-as-ai-storage-demand-surges/",
    "Toshiba 12-platter demonstration: https://toshiba.semicon-storage.com/eu/company/news/2025/10/storage-20251014-1.html",
    "TechRadar, Toshiba roadmap: https://www.techradar.com/pro/toshiba-wants-to-launch-a-55tb-hard-drive-by-2030-40tb-model-set-to-appear-in-2026-new-slides-show",
    "Tom's Hardware, Seagate 44TB Mozaic 4+: https://tomshardware.com/pc-components/hdds/seagate-begins-shipping-44tb-hard-drives-with-hamr-tech-to-data-centers-mozaic-4-platform-expands-to-10-platters",
    "Tom Coughlin, 2025 HDD industry update (Forbes): https://www.forbes.com/sites/tomcoughlin/2026/02/02/c4q-2025-and-2025-hard-disk-drive-industry-update/",
    "Full agent research notes with all URLs are in the project working files (04_seagate.md, 05_western_digital.md, 06_toshiba_supplychain.md).",
]:
    story.append(Paragraph(s, S["src"], bulletText="•"))

build(OUT, story, "HDD Companies Analysis", "Report 2 · HDD companies · Oct 2026")
print("ok")
