import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/ for common.py
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(os.path.join(OUT_DIR, "img"), exist_ok=True)
from common import *
from reportlab.platypus import CondPageBreak
import numpy as np

OUT = os.path.join(OUT_DIR, "FA_Market_and_Competitor_Report.pdf")
IMG = os.path.join(OUT_DIR, "img", "img1_")
story = []

# ---------------- Cover ----------------
story += [Spacer(1, 30),
          P("Factory Automation: Market &amp; Competitor Report", "title"),
          P("Drivers, market size, competitors, technology and a 2026–2031 forecast<br/>Report 1 of 3 · Prepared 28 October 2026", "subtitle"),
          kpis([("~$215B", "Core factory automation<br/>vendor revenue 2025 [EST]"),
                ("~6.5%/yr", "Base-case growth 2026–31<br/>→ ~$315B in 2031 [EST]"),
                (">600k", "Industrial robots installed 2025<br/>(+11%; China 59%)"),
                ("53.0", "Global manufacturing PMI<br/>Sep-2026, 55-month high")]),
          Spacer(1, 14),
          P("Bottom line", "h1"),
          callout("<b>Factory automation is a healthy, growing industry (~6–7% a year), coming out of a 2023–25 destocking "
                  "downturn into a strong 2026 upcycle led by AI data centers, semiconductors and power equipment.</b> "
                  "The risks are both cyclical (a likely 2028–29 digestion after the AI-capex wave) and structural "
                  "(Chinese vendors already hold ~55% of their home market and set world prices for servos and small robots). "
                  "Profit is moving from hardware to software, AI and platforms — which is why incumbents are in the busiest "
                  "portfolio-reshaping period in the industry's history. <b>For a strategy professional that is the key fact: "
                  "demand for M&amp;A, integration, separation and software-business-model strategy is unusually high.</b>"),
          Spacer(1, 8),
          P("Key findings", "h2")]
story += bullets([
    "<b>Cycle:</b> the 2023–25 destocking cut revenue ~5–10% and margins 3–5 points at hardware-heavy leaders. Orders turned in "
    "Q4 2025; in 2026 Fanuc orders are +49%, ABB +40% (record), Siemens DI +9%, Rockwell organic sales +10%.",
    "<b>Drivers:</b> AI/data-center and electrical build-out (#1, named by every leader), labor scarcity, brownfield modernization, "
    "software-defined automation and industrial AI. US reshoring is slower than the politics: factory construction is −21% from its 2024 peak.",
    "<b>Competitors:</b> Chinese challengers (Inovance +36% in H1 2026) are the threat already happening. Software-defined control, "
    "Nvidia/hyperscalers and humanoids are slower and mainly squeeze hardware margins before 2031.",
    "<b>Portfolio reshaping:</b> Schneider–PTC ($23.7B EV, Oct 2026), Siemens–Altair/Dotmatics (~€14B), Emerson–AspenTech, "
    "ABB Robotics → SoftBank ($5.4B), Honeywell's three-way split (completed Jun 2026).",
])
story.append(P("Scope: PLC/DCS and control, motion and drives, industrial robots incl. cobots, sensors and machine vision, industrial "
               "software (MES, SCADA, PLM/simulation, digital twin, industrial AI). Sources: 2025–26 company results, IFR, Interact Analysis, Roland Berger and press. [R] reported, [D] derived, "
               "[EST] estimate. Not investment advice.", "small"))
story.append(PageBreak())

# ---------------- 1. Macro ----------------
story.append(P("1. The tech and economic drivers", "h1"))
story.append(P("Factory automation follows the manufacturing capex cycle, but the mix of demand has changed. Classic discrete "
               "demand (autos, machine tools, Europe) is recovering slowly; the upturn is led by the AI data-center chain — power and "
               "electrical equipment, servers, cooling and semiconductor tools — plus labor scarcity in Asia and the West."))

f, ax = plt.subplots(figsize=(7.2, 2.5))
names = ["Fanuc orders\n(Jul–Sep 26)", "ABB orders\n(Q3 26)", "Keyence sales\n(Apr–Jun 26)", "Siemens DI\nrevenue (Q3 FY26)", "Rockwell organic\nsales (Q3 FY26)", "Yaskawa\nFY26 guide"]
vals = [49, 40, 33, 10, 10, 7]
bars = ax.bar(names, vals, color=[C1, C1, C3, C3, C3, C4], width=0.55)
for b, v in zip(bars, vals):
    ax.text(b.get_x() + b.get_width() / 2, v + 1, f"+{v}%", ha="center", fontsize=8.5)
ax.set_ylabel("Year-on-year growth, %"); ax.set_ylim(0, 58); ax.grid(axis="x", visible=False)
ax.tick_params(axis="x", labelsize=7.5)
ax.set_title("2026 upcycle: leaders' order and sales growth", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "cycle.png", caption="Sources: company results releases (Fanuc 23 Oct 2026; ABB Q3 2026 via news summary — verify; "
                 "Keyence Jul 2026; Siemens Aug 2026; Rockwell Aug 2026; Yaskawa Apr 2026)."))

story.append(table([
    ["Driver (ranked)", "Evidence", "Impact / durability"],
    ["1. AI data centers, electrical, semis", "US DC construction $47B/yr (Jan-26, +31%); hyperscaler capex >$410B in 2025; named #1 by Fanuc, Yaskawa, Rockwell, ABB", "High; strong to ~2028, digestion risk after"],
    ["2. Labor scarcity and aging", "China robot installs +20% in 2025 despite weak factory demand; India robots 27%/yr 2020–25", "High; very durable"],
    ["3. Reshoring / China+1", "US factory construction −21% from Jun-2024 peak; US robots +12% to 38.5k (#2 globally)", "Medium; mostly brownfield, India and SE Asia"],
    ["4. Software-defined automation and industrial AI", "Siemens DI software +15%, ARR €5.7B; Rockwell Software &amp; Control +18% organic at 34.8% margin", "High for profit pools; durable"],
    ["5. Physical AI / humanoids", "~13–14k humanoids shipped in 2025; Morgan Stanley $28B by 2030", "Low today; component pull-through visible"],
    ["6. Energy transition; 7. EVs", "Grid/PV demand (Yaskawa); EVs positive in China, negative in the West", "Medium; volatile"],
], widths=[0.27, 0.48, 0.25]))
story.append(Spacer(1, 4))
story.append(P("Headwinds: US–China tariffs and supply-chain duplication; Chinese overcapacity and price competition; German and "
               "European industrial weakness (German robot installs −8% in 2025); Western EV slowdown; sticky inflation (PMI price "
               "indices at multi-year highs).", "body"))

# ---------------- 2. Market financials ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("2. Market size and financials", "h1"))
story.append(P("Published market sizes range from ~$170B to ~$256B because scope differs (some include process instrumentation, "
               "building automation, 3D printing and integration services). This report uses a core definition — vendor revenue "
               "from hardware and software — of <b>~$215B in 2025 [EST, ±20% by segment]</b>, triangulated from specialist trackers "
               "(Interact Analysis, IFR) and leader revenues."))

f, ax = plt.subplots(figsize=(7.2, 2.6))
seg = ["Software", "Sensors+vision", "DCS+SCADA", "PLC/HMI", "Drives", "Robots", "Network/edge", "Motion"]
size = [60, 32, 28, 22, 22, 20, 17, 14.6]
cagr = [10, 6.5, 4.5, 4.5, 5.5, 8, 6, 4.5]
x = np.arange(len(seg))
ax.bar(x, size, color=C1, width=0.55, label="2025 size, $B (left)")
ax.set_xticks(x); ax.set_xticklabels(seg, fontsize=7.5, rotation=20, ha="right"); ax.set_ylabel("$B, 2025"); ax.grid(axis="x", visible=False)
ax2 = ax.twinx(); ax2.plot(x, cagr, color=C2, marker="o", lw=0, ms=7, label="Growth 2025–31, %/yr (right)")
ax2.set_ylim(0, 12); ax2.spines["right"].set_visible(True); ax2.grid(False)
h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, fontsize=7.5, loc="upper right")
ax.set_title("Core factory automation by segment [EST]", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "segments.png", caption="Analyst synthesis; motion control $14.6B and machine vision $5.9B are Interact Analysis "
                 "figures [R]. Software grows roughly twice as fast as hardware."))

f, ax = plt.subplots(figsize=(7.2, 2.4))
yrs = ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026F", "2029F"]
inst = [422, 391, 394, 517, 553, 541, 542, 600, 655, 806]
china = [None, None, None, None, None, None, 295, 354, None, None]
x = np.arange(len(yrs))
ax.bar(x, inst, color=[C1] * 8 + [C3, C3], width=0.55, label="Global installs (k units)")
ax.bar([6, 7], [295, 354], color=C2, width=0.55, label="of which China")
for i, v in enumerate(inst):
    ax.text(i, v + 12, f"{v}", ha="center", fontsize=7.5)
ax.set_xticks(x); ax.set_xticklabels(yrs); ax.set_ylim(0, 900); ax.set_ylabel("Thousand robots"); ax.grid(axis="x", visible=False)
ax.legend(fontsize=7.5, loc="upper left")
ax.set_title("Industrial robot installations (IFR)", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "robots.png", caption="IFR World Robotics 2025/2026. 2018–21 and 2023 from earlier IFR releases (not re-verified); "
                 "2025 shown as 600k ('>600k'); 2026F and 2029F are IFR forecasts. Chinese suppliers hold 55% of China's installs."))

story.append(P("Profitability: a split industry", "h2"))
story.append(table([
    ["Company", "Pre-downturn", "Trough (2024–25)", "Latest 2026", "What it shows"],
    ["Keyence (sensors, vision)", "~51–55%", "~51%", "54.0% (Q1 FY26)", "Direct-sales, high-mix franchise barely dented"],
    ["Fanuc (CNC, robots)", "~25–27%", "~21%", "26.0% (Q2 FY26)", "Orders very cyclical, margins resilient"],
    ["Rockwell (segment)", "~21–22%", "19.3% FY24", "~23.8% (Q3 FY26)", "Software &amp; Control at 34.8%"],
    ["ABB (group)", "~18–19%", "—", "20.8% (Q3 26)", "Electrification-led; robots sold"],
    ["Siemens DI", "~21–22% FY23", "14.9% FY25", "18.7% (Q3 FY26)", "Severance, software integration"],
    ["Yaskawa (servo, robots)", "~10–11%", "~8.7% FY25", "~10% guide", "Commodity motion under China price pressure"],
], widths=[0.22, 0.14, 0.15, 0.17, 0.32]))
story.append(P("Sources: company results; pre-downturn levels partly [EST]. Margins are operating/segment margins as each company reports them.", "small"))

# ---------------- 3. Competitors ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("3. Competitors, substitutes and disruptors", "h1"))
story.append(table([
    ["Threat", "Scale / evidence", "P(erodes share by 2031)", "P(erodes margin)"],
    ["<b>Chinese challengers — in China</b> (Inovance, Estun, Hikrobot, Supcon)", "Domestic brands ~55% of robots, >55% of servo, ~41% of small PLC; Inovance automation RMB 16.9B (+23%), +36% H1-26, 41% gross margin", "~90%", "~70%"],
    ["<b>Chinese challengers — exports</b>", "China net exporter of robots in 2025; Inovance overseas +24%; follow-the-customer EV/battery plants", "~50% emerging mkts; ~25% EU/US", "~60%"],
    ["Software-defined / open control", "Siemens S7-1500V in production at Audi; ExxonMobil O-PAS since Nov-2024; ~25% of new PLC sales virtual by 2030 (single source)", "~15–20%", "~40% (hardware)"],
    ["Nvidia, hyperscalers, AI-native software", "Partners at Hannover Messe 2026 (Siemens, ABB, Dassault on Omniverse); AI-native MES/vision start-ups", "~15%", "~40% (software layers)"],
    ["Humanoids / general-purpose robots", "Figure $39B valuation; Unitree IPO, ~5,500 units 2025; Atlas 2026 output pre-sold", "~20–25% (robot arms)", "~25%"],
    ["In-house automation (Tesla, BYD, Foxconn)", "Concentrated in EV, battery, electronics", "~30%", "~30%"],
], widths=[0.27, 0.45, 0.14, 0.14]))
story.append(P("Probabilities are analyst estimates [EST].", "small"))

f, ax = plt.subplots(figsize=(7.2, 2.2))
cats = ["Large PLC", "Small PLC", "Robots", "Servo", "Core automation\n(total, 2030F)"]
share = [8, 41, 55, 55, 65]
bars = ax.barh(cats, share, color=[C3, C2, C2, C2, BAD.hexval().replace("0x", "#")], height=0.55)
for b, v in zip(bars, share):
    ax.text(v + 1, b.get_y() + b.get_height() / 2, f"{v}%", va="center", fontsize=8)
ax.set_xlim(0, 80); ax.set_xlabel("Chinese domestic brands' share of China's market, %"); ax.grid(axis="y", visible=False)
ax.set_title("China: domestic brands have won the low and mid tiers", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "china.png", caption="IFR (robots, 2025); single industry report for PLC/servo shares (±5 pts) and the 2030 forecast."))

story.append(P("Exposure ranking (most → least exposed by 2031) [EST]", "h2"))
story.append(P("Yaskawa → Mitsubishi Electric FA → Fanuc → Omron → ABB Robotics (now SoftBank) → Keyence → Schneider (discrete) → "
               "Rockwell → Siemens DI → Emerson / ABB Process Automation / Honeywell Technologies (least exposed: long DCS lifecycles, "
               "installed base, process software). Disruptors attack commoditizing hardware in China and emerging markets, not "
               "installed-base, safety-critical and software-heavy franchises in the West."))

# ---------------- 4. Technology ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("4. Technology roadmap and business-model shift", "h1"))
story.append(table([
    ["Technology", "Status Oct-2026", "Business-model impact"],
    ["Industrial AI / copilots", "Products: Siemens Industrial Copilot (9 new at CES 2026), Rockwell FactoryTalk Copilot / LogixAI, Schneider copilot", "AI sold as software add-ons; differentiates engineering tools"],
    ["AI-native digital twins (Omniverse)", "Siemens–Nvidia 'Industrial AI OS'; Erlangen first AI-driven site 2026", "Simulation as a platform; Nvidia captures compute rent"],
    ["Software-defined control / virtual PLC", "Very early; low single-digit share", "Splits PLC hardware margin from software — innovator's dilemma for Siemens/Rockwell"],
    ["Physical AI / humanoids", "Hype + pilots; SoftBank buys ABB Robotics; Fanuc–Nvidia, open ROS 2 driver", "Robot value moves from arm to AI software and data"],
    ["Cobots, AMRs, AI vision", "Mainstream, commoditizing", "Price pressure; software layer adds value"],
    ["OT cybersecurity, edge, OPC UA/MQTT", "Becoming standard", "Recurring services; open standards → ecosystems are the new lock-in"],
], widths=[0.25, 0.42, 0.33]))
story.append(Spacer(1, 6))
story.append(table([
    ["Software / recurring revenue", "Latest"],
    ["Siemens Digital Industries", "ARR €5.7B (+11%, Q3 FY26); software revenue +15%; 89% of customers on SaaS"],
    ["Schneider Electric", "~24% of group revenue software and services pro forma with PTC and Cognite"],
    ["Rockwell", "Recurring revenue growing high single digits; Software &amp; Control margin 34.8%"],
    ["Emerson", "Owns AspenTech (100%) and NI; Software &amp; Control backlog $4.1B"],
], widths=[0.3, 0.7]))
story.append(Spacer(1, 6))
story.append(callout("<b>Why this matters for a strategy professional:</b> each of these shifts is a portfolio decision, not just an "
                     "engineering one — subscription pricing and the revenue dip of a SaaS transition, whether to cannibalize the "
                     "PLC franchise with virtual control, build/partner/buy/exit choices in physical AI, ecosystem deals with Nvidia "
                     "and Microsoft, and integrating multi-billion software acquisitions. Rising skills: ARR/SaaS economics, large-deal "
                     "PMI and synergy delivery, separations and carve-outs, alliance strategy, China and India strategy."))

# ---------------- 5. Opportunities and risks ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("5. Opportunities and risks, 2026–2031", "h1"))
story.append(table([
    ["Opportunity", "Likelihood", "Size / impact"],
    ["AI data-center / electrical / semiconductor automation", "High (80%) to 2027; medium after", "Largest incremental source; drives, motion, robots"],
    ["Software-defined automation, digital twin, AI copilots (ARR)", "High (75%)", "Margin expansion"],
    ["India and SE Asia manufacturing build-out", "High (70%)", "Double-digit regional growth, price-sensitive"],
    ["Brownfield modernization and OT cybersecurity", "High (80%)", "Steady services and software"],
    ["Physical AI / humanoid components", "Medium (50%) at scale by 2030", "$28B humanoid market by 2030 (Morgan Stanley)"],
], widths=[0.45, 0.25, 0.30]))
story.append(Spacer(1, 6))
story.append(table([
    ["Risk", "Likelihood", "Impact"],
    ["Chinese vendors eroding share and price outside China", "High (65%)", "Structural margin pressure for mid-tier hardware"],
    ["Cyclical downturn ~2028–29 (current surge includes restocking)", "Medium-high (55%)", "−5 to −10% revenue, −3 to −5 pts margin"],
    ["Tariff escalation / supply-chain bifurcation", "Medium-high (60%)", "Duplicated footprints raise costs"],
    ["AI-capex digestion (hyperscaler cutback)", "Medium (40%)", "Hits hottest segments first"],
    ["European deindustrialization", "Medium (50%)", "Low growth for EU-centric vendors"],
    ["Rates stay high; humanoid hype deflates", "Medium (40–45%)", "Delays greenfield; valuation risk for robot pure plays"],
], widths=[0.45, 0.2, 0.35]))

# ---------------- 6. Forecast ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("6. Outlook: how much can the market grow?", "h1"))
f, ax = plt.subplots(figsize=(7.2, 2.6))
yy = [2025, 2026, 2027, 2028, 2029, 2030, 2031]
base = [215, 230, 247, 245, 255, 285, 315]
bull = [215, 232, 253, 276, 300, 327, 354]
bear = [215, 228, 236, 218, 212, 245, 267]
ax.plot(yy, base, color=C1, marker="o", lw=2.2, label="Base (6.5%/yr, 50%)")
ax.plot(yy, bull, color=C5, ls="--", marker="^", lw=1.6, label="Bull (9%/yr, 25%)")
ax.plot(yy, bear, color="#A33B3B", ls="--", marker="v", lw=1.6, label="Bear (3%/yr, 25%)")
for xx, v in [(2025, 215), (2031, 315)]:
    ax.text(xx, v + 9, f"${v}B", ha="center", fontsize=8, color=C1)
ax.set_ylabel("Core FA vendor revenue, $B"); ax.set_ylim(150, 380); ax.legend(fontsize=7.5, loc="upper left")
ax.set_title("Factory automation revenue forecast [EST]", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "forecast.png", caption="Analyst estimate. End points from 230×1.065⁵ (base), 230×1.09⁵ (bull), 230×1.03⁵ (bear); "
                 "intermediate years illustrate a 2028–29 digestion in base and bear cases."))
story.append(table([
    ["Scenario", "2031", "CAGR 2026–31", "Narrative"],
    ["Bull (25%)", "~$354B", "9%", "AI/electrical capex stays high to 2030; humanoid components >$25B; India/SE Asia 15%; software 12%+"],
    ["<b>Base (50%)</b>", "<b>~$315B</b>", "<b>6.5%</b>", "2026–27 upcycle; mild 2028–29 digestion; software outgrows hardware 2:1; China value muted by price deflation"],
    ["Bear (25%)", "~$267B", "3%", "AI-capex pause + tariff escalation → 2023–25-style destock; Chinese vendors take 5–10 pts outside China"],
], widths=[0.12, 0.1, 0.13, 0.65]))
story.append(Spacer(1, 6))
story.append(table([
    ["Other published views", "Figure", "Comment"],
    ["Roland Berger (Jan 2026)", "6–7% CAGR realistic to 2030, up to 9%", "Consistent with base case"],
    ["MarketsandMarkets", "$256B (2024) → $399B (2029), 9.3%", "Very broad scope; a ceiling"],
    ["ResearchAndMarkets", "$170B (2025) → $444B (2035), 9.1%", "Hardware + software + services"],
    ["Interact Analysis", "Motion $14.6B (2025), +3.9% 2026; vision $5.9B → $8.3B (2030)", "Specialist trackers; best for levels and cycles"],
    ["IFR", "Robots 655k (2026) → 806k (2029)", "Units, not value"],
], widths=[0.27, 0.4, 0.33]))
story.append(Spacer(1, 8))
story.append(callout("<b>Assessment.</b> Factory automation will keep growing at ~6–7% a year to 2031 (probability-weighted ~$313B), "
                     "with one cyclical dip likely around 2028–29. Value shifts toward software, AI and platforms (~10%/yr) while "
                     "commodity hardware faces Chinese price pressure. <b>For a 10–20-year strategy career this is a good industry:</b> "
                     "it is large, growing, highly profitable at the top, and in the middle of a structural reshaping that makes "
                     "corporate strategy, M&amp;A and integration central rather than a support function. Prefer employers that own "
                     "software and installed base over those that sell commodity hardware.", GOOD, colors.HexColor("#EAF4EE")))

# ---------------- Sources ----------------
story.append(PageBreak())
story.append(P("Sources", "h1"))
for s in [
    "IFR World Robotics 2026, 'Five Million Robots now Operate in Factories Globally' (24 Sep 2026): https://ifr.org/ifr-press-releases/news/five-million-robots-now-operate-in-factories-globally",
    "IFR World Robotics 2025: https://ifr.org/ifr-press-releases/news/global-robot-demand-in-factories-doubles-over-10-years",
    "IFR via CGTN, China robot market 2025: https://news.cgtn.com/news/2026-09-24/China-remains-world-s-largest-industrial-robot-market-report-1QHHXCQHdrq/p.html",
    "Siemens Q3 FY2026 earnings release: https://assets.new.siemens.com/siemens/assets/api/uuid:84d1a90b-542e-4775-a907-06f29940eb71/HQCOPR202608037434EN.pdf ; Q4 FY2025: https://assets.new.siemens.com/siemens/assets/api/uuid:3948cdd4-35e0-4c1d-8412-9aed4097b3d0/HQCOPR202511117277EN.pdf",
    "Rockwell Automation Q3 FY2026 results: https://www.rockwellautomation.com/en-au/company/news/press-releases/Rockwell-Automation-Reports-Third-Quarter-2026-Results.html",
    "ABB Q3 2026 (news summary): https://www.bluewin.ch/en/news/abb-sees-a-massive-increase-in-orders-in-the-third-quarter-li.3641751",
    "Fanuc H1 FY2026 presentation: https://2slides.com/de/gallery/fanuc-h1-fy2026-earnings-presentation ; Keyence results Jul 2026: https://www.keyence.co.jp/pdf/FinancialResults_202607_en.pdf ; Yaskawa FY2025: https://www.yaskawa-global.com/wp-content/uploads/2026/04/20260410_en.pdf",
    "J.P.Morgan Global Manufacturing PMI Sep 2026: https://www.australianmanufacturing.com.au/?p=196398",
    "Roland Berger, Industrial automation update 2026: https://www.rolandberger.com/en/Insights/Publications/Industrial-automation-update-2026.html",
    "Interact Analysis motion control: https://www.automation.com/article/motion-controls-market-grow-2026 ; machine vision: https://interact-analysis.prezly.com/machine-vision-industry-forecast-to-reach-83bn-in-2030.json",
    "MarketsandMarkets industrial automation: https://www.marketsandmarkets.com/Market-Reports/industrial-automation-market-129369486.html ; ResearchAndMarkets: https://www.businesswire.com/news/home/20250618310982/en",
    "IoT Analytics, US reshoring: https://iot-analytics.com/us-manufacturing-reshoring-boom-what-the-data-says/ ; virtual PLCs: https://iot-analytics.com/virtual-plcs/",
    "Morgan Stanley China humanoid forecast (The Next Web): https://thenextweb.com/news/china-humanoid-robot-forecast-morgan-stanley-50000",
    "China industrial automation 2026 report: https://faxiangongchang.com/en/reports/china-industrial-automation-2026 ; Inovance H1 2026: https://quartr.com/events/shenzhen-inovance-technology-co-ltd-300124-q2-2026_FLu90Bhl",
    "Siemens/Audi virtual PLC: https://www.siemens.com/de-ch/company/insights/factory-automation-virtual-plc-audi/ ; ExxonMobil O-PAS: https://www.controlglobal.com/control/distributed-control/article/55275126/plug-and-play-punches-in",
    "Nvidia at Hannover Messe 2026: https://blogs.nvidia.com/blog/ai-manufacturing-hannover-messe/ ; Figure Series C: https://www.therobotreport.com/figure-ai-raises-1b-in-series-c-funding-toward-humanoid-robot-development/ ; Unitree IPO: https://english.sse.com.cn/news/newsrelease/voice/c/c_20260811_10828578.shtml",
    "SoftBank–ABB Robotics: https://group.softbank/en/news/press/20251008 ; Emerson–AspenTech: https://www.emerson.com/en-us/news/2025/emerson-completes-acquisition-of-remaining-outstanding-shares-of-aspentech ; Honeywell Technologies launch: https://www.honeywell.com/us/en/news/press-releases/2026/06/honeywell-technologies-launches-independent-pure-play-automation-company-following-honeywell-aerospace-spin-off",
    "Schneider Electric to acquire PTC (Design News): https://www.designnews.com/automation/schneider-electric-nabs-ptc-for-22-6b-to-drive-industrial-ai ; (AFP): https://www.connaissancedesenergies.org/afp/schneider-electric-acquiert-ptc-pour-226-milliards-de-dollars-261005",
    "Siemens at CES 2026: https://secure.businesswire.com/news/home/20260106633962/en/Siemens-Unveils-Technologies-to-Accelerate-the-Industrial-AI-Revolution-at-CES-2026",
    "Full agent notes with all URLs: research/01_macro_market.md, 02_competitors_disruptors.md, 03_technology_strategy_roles.md.",
]:
    story.append(Paragraph(s, S["src"], bulletText="•"))

build(OUT, story, "Factory Automation: Market & Competitor Report", "Report 1 · Factory automation market & competitors · Oct 2026")
print("ok")
