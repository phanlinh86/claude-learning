import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/ for common.py
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(os.path.join(OUT_DIR, "img"), exist_ok=True)
from common import *
from reportlab.platypus import CondPageBreak
import numpy as np

OUT = os.path.join(OUT_DIR, "HDD_Market_and_Competitor_Report.pdf")
IMG = os.path.join(OUT_DIR, "img", "img1_")
story = []

# ---------------- Cover / executive summary ----------------
story += [Spacer(1, 30),
          P("HDD Market &amp; Competitor Report", "title"),
          P("Demand drivers, market financials, competing technologies and a 2026–2031 value forecast<br/>"
            "Report 1 of 3 · Prepared 28 October 2026", "subtitle"),
          kpis([("~$36B", "2026E HDD industry revenue<br/>(vs $23.3B in 2025)"),
                ("~2.0 ZB", "2026E exabytes shipped<br/>(+25–30% YoY)"),
                ("~58%", "Seagate / WD gross margin<br/>Sep-2026 quarter (record)"),
                ("2028–2031", "Long-term supply agreements<br/>already signed out to")]),
          Spacer(1, 14),
          P("Bottom line", "h1"),
          callout("<b>HDD is not a dying business — it is the bulk-capacity layer of the AI data center, and it is in the "
                  "strongest period of its history.</b> Demand measured in exabytes is contracted through 2028 and, for some "
                  "customers, to 2030–31. Units are flat (~125M/yr) while capacity per drive and price per TB rise. "
                  "The 5-year risk is <b>cyclical, not technological</b>: an AI-capex digestion phase and a NAND oversupply "
                  "around 2028–29 could compress prices and margins, but no competing medium can absorb HDD's ~2 ZB/yr of "
                  "shipments at comparable cost before 2031."),
          Spacer(1, 8),
          P("Key findings", "h2")]
story += bullets([
    "<b>Macro driver:</b> Big-4 hyperscaler capex went ~$251B (2024) → ~$416B (2025) → ~$720–770B guided for 2026; "
    "Moody's sees ~$1T in 2027. AI training data, checkpoints, inference outputs and agent traces must be retained, and "
    "~80–90% of hyperscale data sits on HDD.",
    "<b>HDD market:</b> industry revenue $19.8B (2024) → $23.3B (2025) → ~$36B (2026E). Price per TB is <i>rising</i> "
    "(WD +28% YoY) for the first time in decades. Nearline is ~88–90% of exabytes and ~80–88% of revenue.",
    "<b>Main competitor — enterprise QLC SSD:</b> NAND is in an even bigger supercycle (Micron 87% gross margin, top-5 eSSD "
    "revenue $37.6B in 2Q26). But SSD $/TB rose ~6x in a year, so the SSD:HDD price gap widened from ~5–6x to ~16–23x. "
    "The shortage <i>helped</i> HDD.",
    "<b>Technology:</b> HAMR is in volume (Seagate 44TB since Mar-2026; WD 44TB HAMR in 1H27; Toshiba ~2028). Roadmaps "
    "point to 50–60TB in 2028 and ~100TB around 2029–31 — enough to grow exabytes ~20–25%/yr with flat unit output.",
    "<b>Forecast (my base case):</b> HDD revenue ~$54B by 2031 (~8% CAGR from 2026), exabytes ~5 ZB. Bear case ~$35B "
    "(flat), bull case ~$72B. Exabyte growth is near-certain; dollar growth after 2027 depends on pricing discipline.",
])
story.append(P("Method: eight research agents gathered 2025–2026 data from SEC filings, earnings calls, TrendForce, "
               "Gartner, Coughlin Associates, Furthur Market Research, Blocks &amp; Files and company roadmaps. "
               "Items marked <b>[EST]</b> are analyst estimates. Not investment advice.", "small"))
story.append(PageBreak())

# ---------------- 1. Tech market ----------------
story.append(P("1. The tech market and what it means for HDD", "h1"))
story.append(P("The single most important driver of HDD demand today is AI-related data-center construction. Most AI "
               "capex buys GPUs, networking, power and buildings — storage is a single-digit share — but every cluster "
               "creates data that has to be ingested and kept: training corpora, checkpoints, logs, evaluation sets, "
               "and (increasingly) inference outputs and agent traces retained for compliance and re-training."))

f, ax = plt.subplots(figsize=(7.2, 2.4))
yrs = ["2024", "2025", "2026 (guide)", "2027 (Moody's)"]
vals = [251, 416, 745, 1000]
bars = ax.bar(yrs, vals, color=[C1, C1, C1, C3], width=0.55)
for b, v in zip(bars, ["$251B", "$416B", "$720–770B", "~$1T"]):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 15, v, ha="center", fontsize=8.5, color="#1F2933")
ax.set_ylabel("US$ billions"); ax.set_ylim(0, 1150); ax.grid(axis="x", visible=False)
ax.set_title("Big-4 hyperscaler capex (Amazon, Microsoft, Alphabet, Meta)", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "capex.png", caption="Sources: company filings via Platformonomics; Moody's via DatacenterDynamics. "
                 "Citi projects $5.35T cumulative 2027–2030."))

story.append(table([
    ["Driver", "Latest data point", "Effect on HDD"],
    ["Hyperscaler capex", "~$720–770B in 2026; ~$1T 2027 (Moody's)", "Strong, 1–3 yr lag; drives nearline exabytes"],
    ["Cloud backlogs", "AWS $496B, Google Cloud $514B, Microsoft RPO $678B", "Supports at least 2 more years of build-out"],
    ["Gartner IT spend 2026", "$6.37T (+14.2%); data-center systems $822B (+62.5%)", "DC growing 4–5x faster than IT overall"],
    ["Devices (PCs, phones)", "+9.8% in 2026", "Legacy HDD (PC/consumer) keeps shrinking"],
    ["Data creation (IDC)", "~20–25% CAGR [approx.]; only ~2% is stored", "Retention policy, not creation, decides HDD demand"],
    ["Edge / physical AI", "Seagate Edge-IoT +52% YoY (Sep-26 qtr)", "Small share of exabytes; NAS/surveillance support"],
], widths=[0.22, 0.43, 0.35]))
story.append(Spacer(1, 6))
story.append(P("How the demand flows", "h2"))
story += bullets([
    "<b>AI training</b> → data lakes in object storage (S3 / GCS / Azure Blob) → nearline HDD as the bulk tier.",
    "<b>Inference and agents</b> → prompts, outputs, traces and generated media → retained on HDD for audit and re-training.",
    "<b>Hot data</b> → QLC SSD (GPU feeding). HDD keeps the 70–80% of data that is not hot.",
    "<b>Customer base is widening</b> from the top hyperscalers to neoclouds, AI labs, sovereign clouds and enterprise.",
])
story.append(CondPageBreak(3*inch))

# ---------------- 2a. HDD market financials ----------------
story.append(P("2. HDD market financials", "h1"))
story.append(P("Units collapsed from the PC era (~375M in 2018, ~600M+ at the 2010 peak) to ~124M and have now flattened. "
               "Exabytes and revenue have decoupled from units: capacity per drive has gone from ~2.3TB to ~16TB, and in "
               "2025–26 price per TB started rising."))

f, ax1 = plt.subplots(figsize=(7.2, 2.3))
y = ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026E"]
rev = [25.5, 22.5, 21.5, 23.5, 18, 13.4, 19.8, 23.3, 36]
units = [375, 325, 260, 259, 166, 122, 124, 124, 128]
eb = [0.87, 1.0, 1.05, 1.4, 1.25, 0.9, 1.34, 1.62, 2.05]
x = np.arange(len(y))
ax1.bar(x - 0.2, rev, 0.4, color=C1, label="Industry revenue ($B, left)")
ax1.set_ylabel("Revenue, $B"); ax1.set_xticks(x); ax1.set_xticklabels(y); ax1.grid(axis="x", visible=False)
ax2 = ax1.twinx()
ax2.plot(x, units, color=C2, marker="o", lw=2, label="Units (M, right)")
ax2.plot(x, [e * 100 for e in eb], color=C5, marker="s", lw=2, label="Exabytes ×100 (right; 2.05 ZB = 205)")
ax2.set_ylim(0, 420); ax2.spines["right"].set_visible(True); ax2.grid(False)
h1, l1 = ax1.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
ax1.legend(h1 + h2, l1 + l2, loc="upper center", ncol=3, fontsize=7.5, bbox_to_anchor=(0.5, 1.13))
story.append(fig(f, IMG + "market.png", caption="2018–2022 values approximate; 2023 derived; 2024–2025 Coughlin Associates; "
                 "2026E derived from Seagate/WD reported and guided quarters plus a Toshiba estimate."))

story.append(P("Market segments", "h2"))
story.append(table([
    ["Segment", "Share of exabytes", "Share of revenue", "Trend to 2031"],
    ["Nearline / mass capacity (cloud + enterprise, 3.5\" 20–44TB)", "~88–90%", "~80–88%", "Growing; the only engine"],
    ["PC / client (2.5\" and 3.5\")", "<3%", "~5%", "Structural decline (SSD boot drives)"],
    ["Consumer external / NAS", "~3–5%", "~4–6%", "Flat to down"],
    ["Surveillance / video / CE", "~4–6%", "~4–6%", "Flat; edge AI helps, China weak"],
    ["Mission-critical 10K/15K", "<1%", "~1–2%", "End of life (replaced by SSD)"],
], widths=[0.42, 0.16, 0.16, 0.26]))
story.append(Spacer(1, 8))
story.append(P("Profitability and cost structure (Seagate and WD as proxy)", "h2"))
story.append(table([
    ["Metric", "Seagate FY26", "Seagate Sep-26 qtr", "WD FY26", "WD Sep-26 qtr", "WD Dec-26 guide"],
    ["Revenue", "$12.20B", "$4.23B (+61%)", "$12.92B (+36%)", "$4.38B (+55%)", "$5.1B"],
    ["Gross margin (non-GAAP)", "45.6% (GAAP)", "57.8%", "49.1%", "58.1%", "60–61%"],
    ["Operating margin (non-GAAP)", "36.5%", "50.7%", "37.3%", "49.1%", "~52% [EST]"],
    ["Opex per quarter", "~$300M", "~7% of revenue", "—", "$391M (~9%)", "$400–410M"],
    ["Capex", "4.7% of revenue", "$211M (5%)", "4–6%", "4–6%", "4–6%"],
], widths=[0.22, 0.14, 0.17, 0.15, 0.16, 0.16]))
story.append(Spacer(1, 6))
story += bullets([
    "<b>Margins are at all-time highs</b> — well above the 2018–19 peak (~30–33% gross margin) and the 2023 trough (~18–25%). "
    "Price per TB is up 20–30% while cost per TB falls ~5–8%; that spread explains the jump.",
    "<b>Capex is only 4–6% of revenue.</b> Exabyte growth comes from areal density, not new factories. Neither Seagate nor WD "
    "is adding unit capacity. Toshiba is the exception (~$380M to double Philippine output by FY2027).",
    "<b>Supply is contracted:</b> nearline lead times exceeded 52 weeks in 2025. Seagate has most supply under long-term "
    "agreements into CY2028 (some to 2030), with prices fixed ~12 months ahead; WD has visibility through 2030–31 with its top 7 customers.",
])
story.append(CondPageBreak(3*inch))

# ---------------- 2b. Competitors ----------------
story.append(P("3. Competitors: SSD/NAND, tape and new media", "h1"))
story.append(P("The real competitor is high-capacity enterprise QLC SSD (122TB shipping, 245–256TB arriving, 512TB planned for "
               "2027). All-flash vendors — Everpure (formerly Pure Storage) claims no new HDDs will be sold after 2028, and VAST "
               "Data is valued at $30B — market directly against nearline HDD. Tape and new archive media only compete at the "
               "cold-archive edge."))
story.append(table([
    ["Competitor", "Scale (latest)", "Margin / economics", "Threat to nearline HDD by 2031"],
    ["NAND / enterprise SSD (Samsung, SK hynix-Solidigm, Micron, Kioxia, Sandisk, YMTC)",
     "Top-5 NAND revenue $68.9B in 2Q26 (+77% QoQ); eSSD $37.6B in 2Q26; 2026E NAND ~$300B+",
     "Micron 87% GM; Sandisk 84.6% GM; NAND capex only $22.2B (+5%) in 2026",
     "<b>Medium.</b> Takes hot/warm and power-limited tiers; may reach ~20–30% of DC capacity by 2030 [EST]"],
    ["Tape (LTO: IBM, HPE, Quantum; media Fujifilm, Sony)", "160 EB (compressed) in 2025, ~3% of HDD exabytes; LTO-10 40TB",
     "Media <$1–5/TB; slow access", "<b>Low.</b> Archive only"],
    ["Glass / ceramic / DNA (Project Silica, Cerabyte, Atlas)", "Pilots; Cerabyte 1PB rack 2026 → 100PB/rack 2030",
     "Not yet commercial", "<b>Very low</b> before 2030"],
], widths=[0.27, 0.27, 0.21, 0.25]))
story.append(Spacer(1, 8))

f, ax = plt.subplots(figsize=(7.2, 2.3))
lab = ["2023–24", "Mid-2025", "1Q 2026", "Aug 2026", "2031E\n(after NAND\nnormalizes)"]
mult = [6, 5.5, 22.6, 18.6, 5]
cols = [C4, C4, C2, C2, C3]
bars = ax.bar(lab, mult, color=cols, width=0.55)
for b, v in zip(bars, ["5–7x", "~5–6x", "~16–23x", "18.6x", "3–8x"]):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.5, v, ha="center", fontsize=8.5)
ax.set_ylabel("SSD $/TB ÷ HDD $/TB"); ax.set_ylim(0, 26); ax.grid(axis="x", visible=False)
ax.set_title("Price gap: enterprise SSD vs nearline HDD, per TB", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "gap.png", caption="Sources: Micron FMS 2025; VDURA Flash Volatility Index via Blocks &amp; Files and "
                 "Notebookcheck; 2031 range is an analyst estimate."))

story.append(P("Did the NAND shortage help HDD? Yes — strongly.", "h2"))
story += bullets([
    "Mid-2025: AI demand outran HDD supply; lead times passed 52 weeks. Hyperscalers (reportedly Microsoft, Meta) shifted orders to QLC SSD.",
    "That extra demand landed on a NAND industry with almost no new capacity. A 30TB QLC SSD went from ~$2,450 to ~$15,100; HDD prices rose only ~35%.",
    "SSD lost its cost case for bulk storage; HDD makers sold out and signed multi-year contracts. Seagate gross margin went from 40% to 57.8% in a year.",
    "<b>Risk ahead:</b> new NAND fabs arrive late 2027–2028 and contract price floors expire. A NAND glut around 2028–29 could shrink the gap back "
    "to ~3–5x and restart the substitution push.",
])
story.append(P("TCO argument, both sides", "h2"))
story.append(table([
    ["Flash camp says", "HDD camp says"],
    ["SSD is ~10x denser (TB per cm³); one 245TB module replaces 8–10 HDDs", "Purchase price dominates TCO; QLC's power saving is worth <$1/TB over 5 years"],
    ["~30% less power per TB stored (TrendForce); longer life, fewer failures", "Replacing ~2 ZB/yr of HDD would need several hundred billion $ of NAND fabs; NAND capex is ~$22B/yr"],
    ["Pure/Everpure: no new HDDs after 2028; real hyperscale win ('tens of EB' into 2028)", "No independent analyst supports 2028; Monroe, Coughlin and Micron all see HDD exabytes growing to ~2030–31"],
], widths=[0.5, 0.5]))
story.append(CondPageBreak(3*inch))

# ---------------- 2c/2d Technology ----------------
story.append(P("4. Technology: HDD roadmap vs competitors", "h1"))
story.append(P("2026–2031 is the strongest HDD technology cadence since helium. HAMR provides a credible path from ~3TB to ~10TB per "
               "platter (~3.3x), platter count adds 10 → 14 (~1.4x), and multi-actuator / multi-head designs attack HDD's "
               "weakest metric, IOPS per TB."))
story.append(table([
    ["Technology", "What it does", "Status Oct-2026", "Impact 2026–2031"],
    ["HAMR (heat-assisted)", "Laser + near-field transducer heat FePt media during write", "Seagate Mozaic 3+/4+ in volume (44TB); WD 1H27; Toshiba ~FY28", "<b>Main capacity engine</b> to ~100TB"],
    ["ePMR + UltraSMR (WD)", "Bias-current-assisted write; shingled tracks +15–20%", "WD 40TB shipping since mid-2026", "Bridge to 60TB (2028) at flat power"],
    ["MAMR / FC-MAMR (Toshiba)", "Microwave/flux-assisted write", "24TB CMR / 28TB SMR", "Toshiba's bridge to 40TB (2027)"],
    ["More platters", "10 → 11 → 12 (glass) → 14", "WD 11; Toshiba 12 verified; WD 14 planned", "~1.4x capacity; harder mechanics"],
    ["Multi-actuator / HBD", "Two actuators (MACH.2, Dual Pivot) or several heads active at once", "MACH.2 small volume; WD HBD sampling; Dual Pivot 2028", "Restores IOPS/TB; defends vs QLC"],
    ["OptiNAND, TDMR, triple-stage actuation", "On-drive flash metadata; 2D readers; VCM+PZT+thermal", "In production / on roadmap", "Enable ~800–1,000 kTPI"],
    ["HDMR / bit-patterned media", "HAMR on discrete magnetic dots", "Research", "2030s, beyond 100TB"],
], widths=[0.2, 0.3, 0.27, 0.23]))
story.append(Spacer(1, 8))

f, ax = plt.subplots(figsize=(7.2, 2.4))
yy = [2026, 2027, 2028, 2029, 2030, 2031]
ax.plot(yy, [44, 44, 50, 60, 69, 78], marker="o", color=C1, lw=2, label="Seagate (HAMR)")
ax.plot(yy, [40, 44, 60, 100, 100, 110], marker="s", color=C2, lw=2, label="WD (vendor claim)")
ax.plot(yy, [28, 40, 45, 50, 55, 60], marker="^", color=C4, lw=2, label="Toshiba")
ax.fill_between(yy, [44, 44, 50, 60, 70, 80], [44, 50, 60, 80, 100, 100], color=C3, alpha=0.18, label="Industry max, analyst range [EST]")
ax.set_ylabel("Max drive capacity, TB"); ax.set_ylim(0, 120); ax.legend(fontsize=7.5, ncol=2, loc="lower right")
ax.set_title("Nearline HDD capacity roadmaps", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "roadmap.png", caption="Vendor roadmaps (Seagate, WD Innovation Day Feb-2026, Toshiba slides via TechRadar). "
                 "Expect 6–18 months of slip on the boldest points."))

story.append(P("Competitor technology", "h2"))
story += bullets([
    "<b>NAND:</b> layer counts passing 300–400 (Samsung V10 400+, SK hynix 375, Kioxia BiCS10 332). QLC mainstream; PLC has no date. "
    "Cost per bit falls ~15–25%/yr historically, but each new layer generation adds etch, deposition and bonding cost.",
    "<b>Tape:</b> LTO-10 40TB native; roadmap was <i>cut</i> in Nov-2025 (LTO-14 now 365TB, from 576TB).",
    "<b>Glass / ceramic / DNA:</b> archive-only, write-once; commercial scale ~2030 at best.",
    "<b>Verdict [EST]:</b> no competitor closes the $/TB gap with nearline HDD by 2031. Expect ~5–8x at device level once NAND normalizes "
    "and ~3–5x on full TCO for read-heavy workloads. HDD keeps ~80–90% of hyperscale stored exabytes through 2031. The bigger threat "
    "is after 2031, and depends on whether HDD's parallelism architectures succeed.",
])
story.append(callout("<b>Why this matters for a servo engineer:</b> almost every remaining HDD scaling lever is a mechatronics problem — "
                     "~25nm track pitch (2.5–3nm 3σ position error), 12–14 thinner glass platters (flutter, lower arm modes), "
                     "triple-stage actuation, dual-pivot cross-coupling, multi-head simultaneous writing, and HAMR laser/protrusion "
                     "transients. Seagate is advertising servo architecture roles including AI/ML-in-control. Servo demand should stay "
                     "solid, though not grow fast, because only three companies employ it."))
story.append(CondPageBreak(3*inch))

# ---------------- 5. Opportunities & risks ----------------
story.append(P("5. Opportunities and risks, 2026–2031", "h1"))
story.append(table([
    ["Opportunity", "Why it matters", "Likelihood"],
    ["AI data retention", "Inference/agentic AI creates persistent data; vendors target >25%/yr exabyte growth", "High"],
    ["Pricing power", "3 suppliers, no greenfield capacity, LTAs with value-based pricing", "High to 2027; medium after"],
    ["Areal-density step-up (HAMR)", "~25% exabyte growth with flat units and low capex → high incremental margins", "High"],
    ["Broader customer base", "Neoclouds, AI labs, sovereign clouds, enterprise", "Medium-high"],
    ["NAND shortage", "Keeps SSD 13–22x more expensive per TB in 2026–27", "High to 2027, fades 2028+"],
], widths=[0.25, 0.55, 0.2]))
story.append(Spacer(1, 8))
story.append(table([
    ["Risk", "Mechanism", "Impact", "Probability (5 yr)"],
    ["AI capex digestion / bubble", "Capex outruns cash flow (Meta FCF $8.6B → $0.8B/qtr); 2–4 qtr lag to HDD, cushioned by LTAs", "High", "Medium (40–50%)"],
    ["Price normalization", "Toshiba doubling capacity; HAMR adds ~40% TB/drive; $/TB returns to −5–10%/yr after ~2028", "High on margins", "High"],
    ["NAND glut → QLC substitution", "New fabs 2028–29; gap back to 3–5x", "Medium", "Medium"],
    ["Customer concentration", "Cloud ~88% of WD revenue; top-10 = 73%", "Medium", "Ongoing"],
    ["HAMR execution", "WD/Toshiba slips change share, not total demand", "Company-level", "Medium"],
    ["Power constraints", "SSD watts/TB argument gains weight in power-limited DCs", "Low-medium", "Medium"],
    ["Tariffs / China", "Assembly in Thailand, Malaysia, Philippines, China", "Low-medium", "Medium"],
    ["Tape / new media", "Cold-archive tier only", "Low", "Low"],
], widths=[0.22, 0.46, 0.14, 0.18]))
story.append(Spacer(1, 6))
story.append(P("History is the best guide to downside: the 2023 cloud inventory correction cut industry revenue ~40% "
               "(to ~$13.4B) and pushed gross margins below 25%. The industry is better protected now (contracts, lean opex, "
               "net cash), but a similar-shaped correction in 2027–29 is the main scenario to plan around."))

# ---------------- 6. Forecast ----------------
story.append(P("6. Outlook: does HDD still have growth? How much?", "h1"))
story.append(P("<b>Yes, in capacity; probably yes in value, but more slowly and with a dip.</b> The forecast below is manufacturer "
               "revenue (comparable to Coughlin Associates' definition). Base case assumes exabytes grow ~20%/yr from 2.05 ZB to "
               "~5 ZB (between Furthur's 4.7 ZB in 2031 and Coughlin's 6.5 ZB in 2030), price per TB is flat through 2027 then "
               "falls ~10%/yr, and one digestion year occurs in 2028."))

f, ax = plt.subplots(figsize=(7.2, 2.3))
yrs = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]
hist = [13.4, 19.8, 23.3, 36]
base = [36, 43, 45, 47, 50, 54]
bull = [36, 46, 53, 60, 66, 72]
bear = [36, 40, 30, 31, 33, 35]
ax.plot(yrs[:4], hist, color=INK.hexval().replace("0x", "#"), marker="o", lw=2.2, label="Actual / 2026E")
ax.plot(yrs[3:], base, color=C1, marker="o", lw=2.2, label="Base")
ax.plot(yrs[3:], bull, color=C5, ls="--", marker="^", lw=1.6, label="Bull")
ax.plot(yrs[3:], bear, color=BAD.hexval().replace("0x", "#"), ls="--", marker="v", lw=1.6, label="Bear")
for xx, v in zip(yrs[3:], base):
    ax.text(xx, v + 2.3, f"${v}B", ha="center", fontsize=7.5, color=C1)
ax.set_ylabel("HDD industry revenue, $B"); ax.set_ylim(0, 80); ax.legend(fontsize=7.5, ncol=4, loc="upper left")
ax.set_title("HDD industry revenue forecast, 2026–2031 [EST]", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "forecast.png"))

story.append(table([
    ["Scenario", "2027", "2028", "2029", "2030", "2031", "CAGR 2026–31", "Assumptions"],
    ["Bull", "$46B", "$53B", "$60B", "$66B", "$72B", "~15%", "Pricing discipline holds; EB +25%/yr; QLC stays expensive"],
    ["<b>Base</b>", "<b>$43B</b>", "<b>$45B</b>", "<b>$47B</b>", "<b>$50B</b>", "<b>$54B</b>", "<b>~8%</b>",
     "EB ~20%/yr to ~5 ZB; $/TB −10%/yr from 2028; one soft year"],
    ["Bear", "$40B", "$30B", "$31B", "$33B", "$35B", "~0%", "AI capex correction 2027–28; $/TB −15%/yr; QLC takes 10–15% of nearline EB"],
], widths=[0.08, 0.07, 0.07, 0.07, 0.07, 0.07, 0.11, 0.46]))
story.append(Spacer(1, 8))
story.append(table([
    ["Other published forecasts", "Figure", "Comment"],
    ["Coughlin Associates (Dec 2025)", "$25–35B revenue by 2030; 6.5 ZB", "Revenue already exceeded in 2026; needs upward revision"],
    ["Furthur Market Research (Mar 2026)", "HDD peaks ~4.7 ZB/yr in 2031; end-of-life ~2043", "Long tail: HDD still significant into late 2030s"],
    ["Micron (FMS 2025)", "HDD storage bits +26% CAGR 2024–2030", "Even a flash maker expects HDD growth"],
    ["Mordor Intelligence", "$51.8B (2026) → $75.6B (2032), 6.6% CAGR", "Broader end-market definition (retail value)"],
], widths=[0.3, 0.37, 0.33]))
story.append(Spacer(1, 8))
story.append(callout("<b>Assessment.</b> HDD has a durable 5-year growth runway in exabytes (~20%/yr) underpinned by AI data retention, "
                     "a $/TB advantage that no competitor closes before 2031, and contracts into 2028–31. Value growth is likely "
                     "~8%/yr on average but uneven: 2026–27 is a peak-pricing period, and a 2028-ish price/margin reset is more likely "
                     "than not. The industry's structural end-point (Furthur: ~2040s) is beyond a 10-year horizon, which is relevant "
                     "for career planning: <b>HDD remains a viable industry for at least the next 10–15 years, but plan for one "
                     "downturn with layoffs in the next 5.</b>", GOOD, colors.HexColor("#EAF4EE")))
story.append(PageBreak())

# ---------------- Sources ----------------
story.append(P("Sources", "h1"))
srcs = [
    "Seagate FQ1 FY2027 press release (SEC 8-K, 27 Oct 2026): https://www.sec.gov/Archives/edgar/data/0001137789/000113778926000300/stxq12027pressreleasefinan.htm",
    "Western Digital FQ1 FY2027 press release (SEC 8-K, 22 Oct 2026): https://www.sec.gov/Archives/edgar/data/0000106040/000162828026066882/a4ex991-pressreleaseq127.htm",
    "Western Digital FQ4 FY2026 press release (SEC 8-K, 5 Aug 2026): https://www.sec.gov/Archives/edgar/data/0000106040/000162828026053305/a4ex991-pressreleaseq426.htm",
    "Tom Coughlin, C4Q 2025 and 2025 HDD industry update, Forbes (2 Feb 2026): https://www.forbes.com/sites/tomcoughlin/2026/02/02/c4q-2025-and-2025-hard-disk-drive-industry-update/",
    "Tom Coughlin, Digital storage projections for 2026, Forbes (19 Dec 2025): https://www.forbes.com/sites/tomcoughlin/2025/12/19/digital-storage-and-memory-projections-for-2026-part-1/",
    "Gartner, IT spending forecast (27 Jul 2026): https://www.gartner.com/en/newsroom/press-releases/2026-07-27-gartner-forecasts-worldwide-it-spending-to-grow-14-point-2-percent-in-2026-totaling-6-point-37-trillion",
    "Platformonomics, Follow the CAPEX Q2 2026: https://platformonomics.com/2026/07/follow-the-capex-q2-2026-scoreboard/",
    "DatacenterDynamics, Moody's hyperscaler capex near $1T by 2027: https://datacenterdynamics.com/en/news/moodys-hyperscaler-capex-forecasts-marked-up-by-85bn-to-close-in-on-1trn-by-2027/",
    "247wallst, Citi $5.35T hyperscaler capex 2027–2030 (21 Oct 2026): https://247wallst.com/investing/2026/10/21/citi-sees-amazon-microsoft-google-and-meta-spending-more-than-apple-is-worth-on-ai-by-2030/",
    "TrendForce, 2Q26 eSSD ranking: https://www.trendforce.com/presscenter/news/20260901-13210.html ; 2Q26 NAND ranking: https://www.trendforce.com/presscenter/news/20260818-13186.html",
    "TrendForce, 2026 memory capex: https://www.trendforce.com/presscenter/news/20251113-12780.html",
    "TrendForce, Toshiba to double AI DC HDD capacity by FY2027: https://trendforce.com/news/2026/10/02/news-toshiba-to-double-ai-data-center-hdd-capacity-by-fy2027-with-380m-expansion-as-ai-storage-demand-surges/",
    "Micron FQ4 FY2026 press release: https://www.sec.gov/Archives/edgar/data/0000723125/000072312526000018/a2026q4ex991-pressrelease.htm",
    "Sandisk FQ4 FY2026 results: https://www.sandisk.com/company/newsroom/press-releases/2026/2026-08-05-sandisk-reports-fiscal-fourth-quarter-2026-financial-results",
    "Blocks &amp; Files / VDURA, QLC 22.6x HDD: https://www.blocksandfiles.com/flash/2026/04/08/vdura-says-30-tb-qlc-ssd-capacity-now-costs-226x-more-than-hdd/5214761",
    "Notebookcheck, enterprise SSDs 18.6x HDD (Aug 2026): https://www.notebookcheck.net/Enterprise-SSDs-now-cost-18-6x-more-than-HDDs-prices-soar-6-5x-in-a-year.1374822.0.html",
    "John Monroe (Furthur), Library of Congress DSA (Mar 2026): https://www.digitalpreservation.gov/meetings/DSA2026/0107_monroe_Library%20of%20Congress_DSA_09%20March%202026%20V11.83-Final.pdf",
    "Micron, T. Grossi, FMS 2025: https://files.futurememorystorage.com/proceedings/2025/20250807_AIML-302-1_T.Grossi.pdf",
    "Blocks &amp; Files, Everpure Q2 FY27: https://www.blocksandfiles.com/flash/2026/08/27/everpure-the-artist-formerly-known-as-pure-storage-ramps-up-growth-rate/5292871",
    "Blocks &amp; Files, Seagate HAMR 40% of nearline EB (30 Jul 2026): https://www.blocksandfiles.com/disk/2026/07/30/seagate-hamring-customers-generating-more-and-more-/tb/5281058",
    "Tom's Hardware, Seagate 44TB Mozaic 4+ shipping: https://tomshardware.com/pc-components/hdds/seagate-begins-shipping-44tb-hard-drives-with-hamr-tech-to-data-centers-mozaic-4-platform-expands-to-10-platters",
    "StorageReview, WD 40TB UltraSMR, HBD, Dual Pivot, 100TB roadmap: https://www.storagereview.com/news/wd-bets-8x-bandwidth-beats-more-terabytes-as-40tb-ultrasmr-starts-shipping",
    "NAND Research, WD Innovation Day note (Feb 2026): https://nand-research.com/research-note-western-digital-innovation-day/",
    "TechRadar, Toshiba roadmap to 55TB: https://www.techradar.com/pro/toshiba-wants-to-launch-a-55tb-hard-drive-by-2030-40tb-model-set-to-appear-in-2026-new-slides-show",
    "TrendForce, race to 400-layer NAND: https://www.trendforce.com/news/2026/06/12/news-the-race-to-400-layer-nand-roadmaps-and-key-technologies-driving-samsung-sk-hynix-and-kioxia/",
    "Blocks &amp; Files, LTO roadmap cut: https://www.blocksandfiles.com/tape/2025/11/13/lto-10-bumped-to-40-tb-as-future-tape-capacities-get-cut/1711787 ; tape 2025/2026: https://www.blocksandfiles.com/tape/2026/09/04/tape-capacity-shipments-fell-in-2025-but-2026-could-be-a-boom-year-for-tape/5294464",
    "Blocks &amp; Files, Project Silica: https://blocksandfiles.com/2025/12/23/project-silicas-glass-storage-archive-tech-progress/ ; Cerabyte roadmap: https://www.blocksandfiles.com/data-management/2025/07/02/cerabyte-promises-fast-dense-low-cost-tape-alternative-by-2030/1595617",
    "Mordor Intelligence, HDD market: https://mordorintelligence.com/industry-reports/hard-disk-drive-market",
    "Glenn K. Lockwood, 2025–26 storage shortage notes: https://glennklockwood.com/garden/shortage",
]
for s in srcs:
    story.append(Paragraph(s, S["src"], bulletText="•"))

build(OUT, story, "HDD Market & Competitor Report", "Report 1 · HDD market & competitors · Oct 2026")
print("ok")
