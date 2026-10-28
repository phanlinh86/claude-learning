import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/ for common.py
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(os.path.join(OUT_DIR, "img"), exist_ok=True)
from common import *
from reportlab.platypus import CondPageBreak
import numpy as np

OUT = os.path.join(OUT_DIR, "FA_Companies_Analysis.pdf")
IMG = os.path.join(OUT_DIR, "img", "img2_")
story = []
G = "<font color='#2E7D4F'><b>%s</b></font>"
A = "<font color='#B26A00'><b>%s</b></font>"
Rr = "<font color='#A33B3B'><b>%s</b></font>"

# ---------------- Cover ----------------
story += [Spacer(1, 26),
          P("Factory Automation: Companies Analysis", "title"),
          P("Twelve leaders across Europe, the US, Japan and China — financials, strategy and portfolio moves, technology, "
            "growth potential and downturn survivability<br/>Report 2 of 3 · Prepared 28 October 2026", "subtitle"),
          kpis([("12", "Companies analysed<br/>(+ software &amp; vision players)"),
                ("$23.7B", "Schneider–PTC (Oct 2026), largest<br/>of a wave of software deals"),
                ("14–22%", "Automation margins at the<br/>2025 trough (most leaders)"),
                ("All survive", "A 2023–25-style downturn;<br/>jobs are the risk, not solvency")]),
          Spacer(1, 12),
          P("Bottom line", "h1"),
          callout("<b>Every major factory-automation company would survive a whole-market downturn; the question is which ones "
                  "keep growing and how much they restructure.</b> The strongest long-term businesses own software plus a large "
                  "installed base: <b>Siemens</b> (global #1 in PLCs and engineering software), <b>Schneider</b> (turning into an "
                  "industrial-software company with AVEVA and the $23.7B PTC deal), <b>Emerson</b> (process automation + AspenTech, "
                  "28% margins) and <b>ABB</b> (process automation + electrification, robots sold). <b>Keyence</b> and <b>Fanuc</b> "
                  "are financial fortresses but closed, Japanese-run organisations. The most exposed are commodity hardware makers "
                  "facing Chinese competition: <b>Yaskawa</b>, <b>Omron</b> and Mitsubishi Electric's FA unit."),
          Spacer(1, 8), P("Scorecard [EST where marked]", "h2"),
          table([
              ["Company (HQ)", "Automation revenue (latest FY)", "Margin trough → latest", "Balance sheet", "Strategy intensity", "Survives?", "5-yr outlook"],
              ["Siemens DI (Munich)", "€17.8B", "14.9% → 18.7%", "A+, €10.8B FCF", "Very high", G % "Yes", "Strong"],
              ["Schneider IA (Paris)", "~€7.0B (group >€40B)", "14.2% → recovering", "A/A2; debt rising for PTC", "Very high", G % "Yes", "Strong"],
              ["ABB Automation (Zurich)", "~$8.8B", "7.9% (RA) → 15.4%", "Net debt 0.3× EBITDA", "High", G % "Yes", "Strong"],
              ["Emerson (St. Louis)", "$18.0B (all automation)", "~23.5% → 28.5%", "~2× EBITDA after AspenTech", "High", G % "Yes", "Strong"],
              ["Rockwell (Milwaukee)", "$8.3B (FY26E ~$9.0B)", "19.3% → ~22%", "Moderate leverage", "Moderate", G % "Yes", "Good, cyclical"],
              ["Honeywell Technologies (Charlotte)", "~$20B (IA unit ~$4.5B)", "IA 17% → 18.4%", "Net debt ~$10.4B", "Very high (post-split)", G % "Yes", "Moderate; IA weak"],
              ["Keyence (Osaka)", "¥1,169B (~$7.8B)", "51.2% → 54.0%", "Net cash >¥2T [EST]", "Low", G % "Yes", "Strong"],
              ["Fanuc (Yamanashi)", "¥858B (~$5.7B)", "17.8% → 21.4%", "¥615B cash, no debt", "Low", G % "Yes", "Good"],
              ["Mitsubishi Electric FA (Tokyo)", "¥798B (~$5.3B)", "9.4% → 16.0% (Q1)", "Group-level, record profit", "Moderate", G % "Yes", "Good"],
              ["Omron IAB (Kyoto)", "¥410B (~$2.7B)", "~6–10% → 16% (Q1)", "Moderate", "Moderate", A % "Likely", "Moderate"],
              ["Yaskawa (Kitakyushu)", "¥542B (~$3.6B)", "8.7% → ~9.6% guide", "Thin cash (¥61B)", "Low", A % "Likely", "Weak-moderate"],
              ["Inovance (Shenzhen)", "CNY 45.1B (~$6.3B)", "Net margin ~11%", "HK IPO up to $2B", "Moderate", G % "Yes", "Strong (China)"],
          ], widths=[0.19, 0.17, 0.14, 0.17, 0.12, 0.10, 0.11]),
          P("FX approximations for comparison only [EST]: €1 ≈ $1.10, $1 ≈ ¥150, $1 ≈ CNY 7.2. Margins are segment/operating margins as each "
            "company reports them, so they are not strictly comparable. Not investment advice.", "small"),
          PageBreak()]

# ---------------- 1. Structure ----------------
story.append(P("1. Industry structure and where profit sits", "h1"))
story.append(P("No company dominates all of factory automation. Each leader owns a few franchises: Siemens and Rockwell in PLCs "
               "(Europe/Asia vs North America), Emerson, ABB and Honeywell in process control (DCS), Fanuc in CNC and robots, "
               "Keyence in sensors and vision, Yaskawa and Mitsubishi in servo. Software is the battleground everyone is buying into."))
f, ax = plt.subplots(figsize=(7.2, 3.0))
cos = ["Keyence", "Emerson", "Rockwell", "Fanuc", "Siemens DI", "Honeywell IA", "Mitsubishi FA", "Omron IAB", "ABB Automation", "Yaskawa"]
trough = [51.2, 23.5, 19.3, 17.8, 14.9, 17.0, 9.4, 8.0, 7.9, 8.7]
latest = [54.0, 28.5, 22.3, 21.4, 18.7, 18.4, 16.0, 16.2, 15.4, 9.6]
x = np.arange(len(cos))
ax.bar(x - 0.2, trough, 0.4, color=C4, label="Trough 2023–25")
ax.bar(x + 0.2, latest, 0.4, color=C1, label="Latest 2026")
for i, v in enumerate(latest):
    ax.text(i + 0.2, v + 1, f"{v:.0f}", ha="center", fontsize=7)
ax.set_xticks(x); ax.set_xticklabels(cos, fontsize=7.5, rotation=25, ha="right"); ax.set_ylabel("Operating / segment margin, %")
ax.grid(axis="x", visible=False); ax.legend(fontsize=7.5); ax.set_ylim(0, 62)
ax.set_title("Automation margins: trough vs latest", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "margins.png", caption="Company filings. Keyence/Fanuc/Yaskawa = company operating margin; others = automation "
                 "segment. ABB trough = Robotics &amp; Discrete Automation (Q4 2024); Omron trough approximate [EST]; Mitsubishi and "
                 "Omron latest = Apr–Jun 2026 quarter."))
story.append(P("<b>Reading the chart:</b> a sensing/vision franchise (Keyence) and process-plus-software portfolios (Emerson) earn "
               "the most and fell the least. Commodity motion and robots (Yaskawa, ABB robots) earn least and are the ones exposed "
               "to Chinese pricing — which is why ABB sold robots and why Japanese mid-tier players are restructuring.", "body"))

story.append(P("The 2024–26 portfolio reshuffle", "h2"))
story.append(table([
    ["Company", "Move", "Value", "Status"],
    ["Schneider", "Acquire PTC (CAD/PLM/IoT software)", "$23.7B EV", "Signed 5 Oct 2026; close ~Q3 2027"],
    ["Siemens", "Altair (simulation) + Dotmatics (life-science R&amp;D software)", "~€14B combined", "Closed 2025"],
    ["Emerson", "Buy remaining AspenTech shares; earlier NI ($8.2B), Copeland exit ($14B)", "$7.2B", "Closed Mar 2025"],
    ["Honeywell", "Three-way split: Solstice (Oct 2025), Aerospace (Jun 2026); JM Catalysts; sold PSS, Intelligrated", "—", "Done; Elliott on board"],
    ["ABB", "Sell Robotics to SoftBank; buy Rotork (actuators)", "$5.4B / $5.5B", "Robotics pending; Rotork H1 2027"],
    ["Schneider", "India JV minority buyout; Shelly; €1–1.5B divestments by 2030", "€5.5B / €1.2B", "2025–27"],
    ["Siemens", "Spin ~30% of Healthineers to shareholders", "—", "Vote Feb 2027"],
    ["Rockwell", "Dissolve Sensia JV with SLB", "—", "Done Apr 2026"],
    ["Omron", "Sell device unit to Carlyle; IAB M&amp;A top priority", "—", "Oct 2026"],
], widths=[0.13, 0.5, 0.15, 0.22]))

# ---------------- 2. Europe ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("2. European leaders", "h1"))
story.append(P("Siemens — Digital Industries", "h2"))
story.append(table([
    ["€B (FY ends Sep)", "FY21", "FY22", "FY23", "FY24", "FY25", "Q3 FY26", "FY26 guide"],
    ["DI revenue", "~16.5", "~19.5", "~21.6", "~18.5", "17.8", "4.9 (+10%)", "+7–10%"],
    ["DI profit margin", "~21%", "~20%", "~21.4%", "18.9%", "14.9%", "18.7%", "17–19%"],
    ["DI orders", "", "", "", "", "18.4 (+8%)", "4.9 (+9%)", "B/B >1"],
], widths=[0.2] + [0.114] * 7))
story.append(P("FY21–23 from prior reports (not re-verified); FY24 derived.", "small"))
story += bullets([
    "<b>Group:</b> revenue €78.9B FY25, record net income €10.4B and FCF €10.8B; Q3 FY26 orders +14%, backlog €132B; EPS guide raised; A+ rated; €6B buyback.",
    "<b>Software:</b> DI ARR €5.7B (+11%), software revenue +15%. 'ONE Tech Company' strategy targets up to 9% growth.",
    "<b>People:</b> ~6,000 job cuts announced Mar 2025, 5,600 in DI (~8% of ~70k); largest since 2017. Strategy and M&amp;A in Munich; software M&amp;A in the US (Plano).",
    "<b>Technology:</b> global #1 in PLCs + engineering software (TIA, NX, Teamcenter, Altair); first certified virtual fail-safe PLC; Industrial Copilot with Microsoft; 'Industrial AI OS' with Nvidia.",
    "<b>China:</b> domestic brands hold only ~8% of mid/large PLCs — Siemens' fortress — but ~41% of small PLCs.",
])
story.append(P("Schneider Electric — Industrial Automation", "h2"))
story.append(table([
    ["€B (FY Dec)", "2022", "2023", "2024", "2025", "9M 2026", "2026 group guide"],
    ["IA revenue", "7.73", "7.66", "7.02 (−3.7% org)", "~7.0 (+3%)", "5.43 (+7.9%)", "Org +12–14%"],
    ["IA adj. EBITA margin", "18.9%", "17.0%", "14.8%", "14.2%", "—", "Group ~19.8%"],
    ["Group revenue", "34.2", "35.9", "38.2", ">40", "Q3 +16.9% org", ""],
], widths=[0.2, 0.11, 0.11, 0.15, 0.13, 0.15, 0.15]))
story += bullets([
    "<b>Mix:</b> IA is now only ~16% of group revenue; Energy Management (+18.8% organic, data centers) is the growth engine. Software &amp; services 19% → target ~25% by 2030; AVEVA ~85% recurring.",
    "<b>Deals:</b> PTC ($23.7B EV, €250M cost / ~€800M revenue synergies), India buyout (€5.5B), Shelly; net debt €13.7B; A/A2 reaffirmed Oct 2026. CMD 2026–30: 7–10% organic growth, +250bp margin.",
    "<b>People:</b> ~150k staff; CEO Olivier Blum since Nov 2024 (predecessor removed after ~18 months). Plant consolidation in France, €500M restructuring 2025–27; PTC overlap likely 2027–28. Multi-hub HQ: Paris, Boston/Andover, Hong Kong, Bangalore.",
    "<b>Technology:</b> leader in open, software-defined control (EcoStruxure Automation Expert, IEC 61499); strong process software via AVEVA; trails Siemens in discrete PLC share.",
])
story.append(P("ABB — Automation (Process + B&amp;R); Robotics being sold", "h2"))
story += bullets([
    "<b>Group:</b> record 19.0% op. EBITA in 2025; Q3 2026 orders $12.06B (+40%, record), revenue $9.7B (+14%), margin 20.8%; ROCE ~30%; net debt only 0.3× EBITDA.",
    "<b>Automation BA:</b> ~$2.2B a quarter, 15.4% margin (target 14–18%). Robotics &amp; Discrete fell to 7.9% at the Q4 2024 trough.",
    "<b>Portfolio:</b> Robotics → SoftBank ($5.375B; not confirmed closed at Q3 2026); Rotork ($5.5B, 2027); long history of carve-outs (Power Grids, Dodge, Accelleron).",
    "<b>People:</b> ~110k; decentralised 'ABB Way' — strategy partly inside business areas; central Corporate Strategy &amp; M&amp;A in Zurich. No group-wide layoff 2024–26.",
])

# ---------------- 3. US ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("3. US leaders", "h1"))
story.append(table([
    ["$B", "FY18", "FY20", "FY22", "FY23", "FY24", "FY25", "FY26 guide", "Segment margin (latest)"],
    ["Rockwell (Sep FY)", "6.67", "6.33", "7.76", "9.06", "8.26 (−9%)", "8.34", "~9.0 (+7.5–9.5% org)", "~22%; S&amp;C 34.8%"],
    ["Emerson (Sep FY)", "—", "—", "~13.8*", "15.2", "17.5", "18.0", "~18.9", "28.5% adj. EBITA"],
    ["Honeywell Tech. (Dec FY)", "—", "—", "—", "—", "—", "—", "20.0–20.1", "21.3% (IA 18.4%)"],
], widths=[0.17, 0.07, 0.07, 0.08, 0.07, 0.1, 0.07, 0.17, 0.2]))
story.append(P("*Emerson continuing operations, restated. Honeywell Technologies only exists in this form since the June 2026 spin.", "small"))
story += bullets([
    "<b>Rockwell:</b> pure-play discrete/hybrid automation, dominant Logix installed base in North America. Most cyclical: FY24 sales −9%, Software &amp; Control −24%. "
    "FY26 adj. EPS $13.00–13.30, above the FY23 peak. ~870 layoffs (3%) in May 2024, headcount 29k → 26k. Partnerships with Microsoft and Nvidia; Plex, Clearpath, Verve acquisitions. Low China exposure.",
    "<b>Emerson:</b> transformed from conglomerate into automation + software (NI, AspenTech; sold Copeland, InSinkErator). Best margins and cash of the US three (FCF ~$3.6B). "
    "2028 targets: $21B sales, 30% margin, $8 EPS, $10B returned. Restructuring rising again ($141M in 9M FY26; Charlottesville PLC site closing).",
    "<b>Honeywell Technologies:</b> pure-play automation since 29 Jun 2026 (Building Automation 27% margin, Process Automation &amp; Technology 22%, Industrial Automation 18%). "
    "Activist Elliott on the board; continuous 'repositioning' charges; IA shrunk from ~$10B to ~$4.5B through divestitures and impairments ($768M in 2025).",
    "<b>Briefly:</b> Cognex Q2 2026 revenue $291M (+17%), margin back above 30%; Teradyne Robotics (Universal Robots/MiR) cut ~10% then ~14% of staff in 2025, now profitable.",
])

# ---------------- 4. Japan & China ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("4. Japanese and Chinese leaders", "h1"))
story.append(table([
    ["¥B (FY ends Mar unless noted)", "FY3/22", "FY3/23", "FY3/24", "FY3/25", "FY3/26", "Current-year guide / latest"],
    ["Keyence sales / OP margin", "755 / 55.4%", "922 / 54.1%", "967 / 51.2%", "1,059 / 51.9%", "1,169 / 51.0%", "Q1 +33%, 54.0%"],
    ["Fanuc sales / OP margin", "733 / 25.0%", "852 / 22.5%", "795 / 17.8%", "797 / 19.9%", "858 / 21.4%", "Raised to ~¥1,010B"],
    ["Yaskawa (Feb FY) revenue / margin", "479 / 11.0%", "556 / 11.4%", "576 / 11.3%", "538 / 9.3%", "542 / 8.7%", "600 / ~9.6% (OP cut)"],
    ["Mitsubishi Electric FA revenue / margin", "~750–800 / ~15%*", "", "", "", "798 / 9.4%", "900 / 13.3%; orders +42%"],
    ["Omron IAB revenue / OP", "", "", "", "365 / ~36", "410 / 42.8", "Q1 +37%; target 16% by FY3/31"],
    ["Inovance (CNY B, Dec FY) revenue / NP", "", "", "37.0 / 4.3 (2024)", "45.1 / 5.05 (2025)", "H1-26 24.7 (+20%)", "+10–30%"],
], widths=[0.27, 0.11, 0.11, 0.13, 0.13, 0.12, 0.13]))
story.append(P("*Approximate peak [EST]. Sources: company IR releases; Yaskawa H1 from summary (verify).", "small"))
story += bullets([
    "<b>Keyence:</b> the profit champion (op. profit ~3× Fanuc's); fabless, direct consultative sales, no M&amp;A, no guidance. Highest pay of any large Japanese company "
    "(~¥21.8M average) with intense, metrics-driven culture. Strategy is in Osaka; overseas subsidiaries are sales organisations.",
    "<b>Fanuc:</b> global #1 in CNC (~half the market [EST]), top-2 robots; ¥615B cash; 60% payout. Opening up (Nvidia physical-AI, open ROS 2 driver). "
    "Insular, centralised in Yamanashi; lifetime employment, no layoffs.",
    "<b>Mitsubishi Electric FA:</b> MELSEC PLC and servo strength in Asia; margin rebounding from 9.4% toward 13–16%. Group ran an early-retirement programme "
    "(~4,700 applicants aged 53+, ~¥100B) despite record profits; US hub in Vernon Hills, IL.",
    "<b>Omron:</b> restructured (NEXT 2025, ~2,000 roles), sold its device unit to Carlyle; new 2030 roadmap with IAB M&amp;A as top priority; "
    "the most internationally open Japanese FA firm (Hoffman Estates, IL; Europe).",
    "<b>Yaskawa:</b> most exposed to Inovance (6.2% vs 30.2% of China servo); thin cash; ERP execution problems in 2026 despite record orders.",
    "<b>Inovance:</b> China's only broad-line challenger (servo, PLC, drives, SCARA robots); R&amp;D ~9% of sales, 29k staff, Huawei-like intensity; "
    "HK IPO (up to $2B) to fund overseas expansion. Mandarin-run strategy.",
])

# ---------------- 5. Software & others ----------------
story.append(P("5. Industrial software, vision and other employers", "h1"))
story.append(table([
    ["Company", "Latest", "Note for a strategy career"],
    ["PTC", "FY26 revenue guide $2.69–2.75B; ~41% adj. margin; sold Kepware/ThingWorx to TPG", "Being acquired by Schneider — integration roles 2027–28, overlap risk"],
    ["Dassault Systèmes", "Revenue +4%; ~32% margin; 81% recurring", "Independent PLM leader; Paris-centric"],
    ["Hexagon / Octave", "Hexagon 8% organic, 26% margin; Octave spun May 2026, $2.1B write-down", "Octave a plausible take-private target"],
    ["Cognex, Zebra, KUKA (Midea)", "Cognex record $291M quarter; KUKA cutting 560 in Augsburg; Zebra exited robotics", "Specialists; smaller strategy teams"],
    ["Private/family: Beckhoff, Festo, Bosch Rexroth, Danfoss, SMC", "Festo €3.33B (third decline, ~1,300 cuts); Rexroth €6.45B, orders +8.9%", "Small strategy teams, little M&amp;A"],
], widths=[0.22, 0.43, 0.35]))

# ---------------- 6. Growth ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("6. Growth potential, 2026–2031", "h1"))
f, ax = plt.subplots(figsize=(7.2, 2.7))
cos2 = ["Siemens DI", "Emerson", "Honeywell T.", "Rockwell", "ABB Autom.", "Keyence", "Schneider IA", "Inovance", "Fanuc", "Mitsubishi FA", "Yaskawa", "Omron IAB"]
rev = [19.6, 18.9, 20.0, 9.0, 8.8, 7.8, 7.7, 6.3, 5.7, 5.3, 3.6, 2.7]
cg = [7, 6, 5, 6, 7, 8, 8, 12, 6, 6, 4, 5]
x = np.arange(len(cos2))
ax.bar(x, rev, color=C1, width=0.55, label="Latest annual automation revenue, $B (left)")
ax.set_xticks(x); ax.set_xticklabels(cos2, fontsize=7, rotation=30, ha="right"); ax.set_ylabel("$B"); ax.grid(axis="x", visible=False)
ax2 = ax.twinx(); ax2.plot(x, cg, color=C2, marker="o", lw=0, ms=7, label="Base-case growth 2026–31, %/yr (right) [EST]")
ax2.set_ylim(0, 14); ax2.spines["right"].set_visible(True); ax2.grid(False)
h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, fontsize=7, loc="lower center", bbox_to_anchor=(0.5, 1.02), ncol=2)
ax.set_title("Scale and expected growth", pad=22, loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "growth.png", caption="Revenue: latest FY or FY26 guidance converted at approximate FX; Honeywell Technologies includes "
                 "Building Automation; Schneider IA excludes PTC (adds ~$2.7B from 2027). Growth rates are analyst estimates."))
story.append(table([
    ["Growth tier [EST]", "Companies", "Why"],
    ["Above market (8–12%/yr)", "Inovance, Schneider (incl. PTC), Keyence", "Share gains in China; software mix; overseas expansion"],
    ["At market (6–7%)", "Siemens DI, ABB Automation, Emerson, Rockwell, Fanuc, Mitsubishi FA", "Installed base + software; AI/semis/electrical demand"],
    ["Below market (3–5%)", "Yaskawa, Omron IAB, Honeywell IA unit", "Commodity hardware, Chinese pricing, portfolio shrinkage"],
], widths=[0.22, 0.4, 0.38]))

# ---------------- 7. Downturn ----------------
story.append(CondPageBreak(4 * inch))
story.append(P("7. Can they survive a whole-market downturn?", "h1"))
story.append(P("Using Report 1's scenarios: <b>A — bear case</b> (2023–25-style destock: automation revenue −8 to −10% over two years) and "
               "<b>B — severe</b> (revenue −20%, a 2009-lite shock). Margin estimates apply each company's last-cycle decremental margin "
               "with opex largely held flat. [EST]"))
story.append(table([
    ["Company", "Latest margin", "Last trough", "Scenario A margin", "Scenario B margin", "Likely response in B"],
    ["Keyence", "54%", "51%", "~48–50%", "~40–45%", "Nothing visible; bonuses fall"],
    ["Emerson", "28.5%", "~23.5%", "~25%", "~20%", "Restructuring $200–300M; buybacks flex"],
    ["Fanuc", "21–26%", "17.8%", "~18%", "~12–14%", "No layoffs; bonuses and hiring cut"],
    ["Rockwell", "~22%", "19.3%", "~18%", "~13–15%", "3–5% headcount action (SG&amp;A first)"],
    ["Siemens DI", "18.7%", "14.9%", "~14–15%", "~10–12%", "Another 5–8% DI capacity cut"],
    ["Honeywell Tech. (IA)", "18.4%", "~17%", "~15%", "~10%", "Rolling repositioning, divestitures"],
    ["ABB Automation", "15.4%", "~8% (RA)", "~12–13%", "~9–10%", "Division-level cuts (B&amp;R)"],
    ["Schneider IA", "~15–16%", "14.2%", "~12%", "~8–10%", "PTC overlap cuts accelerate"],
    ["Mitsubishi FA", "13–16%", "9.4%", "~9%", "~4–6%", "Early-retirement programmes"],
    ["Omron IAB", "~16%", "~6–10%", "~8%", "~0–3%", "Another NEXT-style programme"],
    ["Yaskawa", "~9.6%", "8.7%", "~6%", "~1–3%", "Restructuring, Europe/US cuts"],
], widths=[0.19, 0.12, 0.12, 0.15, 0.15, 0.27]))
story.append(Spacer(1, 6))
story += bullets([
    "<b>Solvency is not in question for any of the twelve.</b> The Western leaders and Keyence/Fanuc stay solidly profitable even in scenario B; "
    "group diversification (electrification, data-center power, building automation) cushions Siemens, Schneider, ABB and Honeywell further.",
    "<b>Jobs are the real risk.</b> The 2023–25 downturn already produced cuts at Siemens (5,600), Rockwell (~870 and attrition to −10%), Omron (~2,000), "
    "Mitsubishi Electric (~4,700 early retirements) and Emerson (integration sites). Expect the same pattern next time, with HQ and SG&amp;A functions hit early.",
    "<b>Most fragile:</b> Yaskawa and Omron (thin margins, Chinese competition) and acquired/overlapping units during integrations (PTC inside Schneider, "
    "AspenTech/NI inside Emerson, ABB Robotics under SoftBank).",
])
story.append(callout("<b>Long-term ranking on business strength (10–20 years) [EST]:</b> 1. Siemens · 2. Schneider · 3. Emerson · 4. ABB · "
                     "5. Keyence · 6. Rockwell · 7. Fanuc · 8. Honeywell Technologies · 9. Mitsubishi Electric · 10. Inovance (global) · "
                     "11. Omron · 12. Yaskawa. Business strength is not the same as career fit for a strategy professional — Keyence and "
                     "Fanuc rank high here but offer almost no senior strategy roles to outsiders. Report 3 ranks employers for your role.",
                     GOOD, colors.HexColor("#EAF4EE")))

story.append(PageBreak())
story.append(P("Sources", "h1"))
for s in [
    "Siemens Q3 FY2026 press release: https://press.siemens.com/global/en/pressrelease/record-third-quarter-outlook-raised ; FY2025 release: https://assets.new.siemens.com/siemens/assets/api/uuid:3948cdd4-35e0-4c1d-8412-9aed4097b3d0/HQCOPR202511117277EN.pdf",
    "Siemens job cuts (Mar 2025): https://www.trendforce.com/news/2025/03/20/news-siemens-to-cut-6000-jobs-biggest-layoff-since-2017-amid-automation-ev-challenges/ ; Healthineers deconsolidation: https://assets.new.siemens.com/siemens/assets/api/uuid:5594e689-49ac-45a8-b559-c88af8e8bf70/HQCOPR202511127281EN.pdf",
    "Schneider Q3 2026 revenues: https://www.webdisclosure.com/press-release/third-quarter-revenues-2026-odiihfxJLgs ; FY2024: https://webdisclosure.com/press-release/schneider-electric-epa-su-full-year-2024-results-press-release-3LLakvRKH72 ; France reorganisation: https://www.connaissancedesenergies.org/afp/schneider-electric-annonce-une-reorganisation-en-france-une-usine-sera-fermee-dans-la-vienne-260909",
    "Schneider–PTC (Design News): https://www.designnews.com/automation/schneider-electric-nabs-ptc-for-22-6b-to-drive-industrial-ai",
    "ABB Q3 2026 results: https://www.webdisclosure.com/press-release/abb-ltd-q3-2026-results-5kMEGgmixHu ; Q2 2026 presentation: https://library.e.abb.com/public/307f74a362b0489986d5ed471457e662/ABB%20Q2%202026%20Group%20presentation.pdf ; Robotics to SoftBank: https://new.abb.com/news/detail/129685/abb-to-divest-robotics-division-to-softbank-group ; Rotork: https://new.abb.com/news/sv/detail/137469/abb-utokar-sitt-automationserbjudande-genom-forvarvet-av-rotork",
    "Rockwell Q3 FY26 8-K: https://www.sec.gov/Archives/edgar/data/0001024478/000102447826000028/q3fy26ex99.htm ; FY25 10-K: https://www.sec.gov/Archives/edgar/data/1024478/000102447825000116/rok-20250930.htm ; 2024 layoffs: https://www.controlglobal.com/industry-news/news/55090751/rockwell-plans-close-to-900-layoffs",
    "Emerson Q3 FY26: https://ir.emerson.com/sec-filings/all-sec-filings/content/0000032604-26-000042/a2026q3release_ex991.htm ; FY25 10-K: https://www.sec.gov/Archives/edgar/data/32604/000003260425000087/emr-20250930.htm ; 2025 Investor Conference: https://ir.emerson.com/_assets/_c9452fc8b238aaf7c54f4eca72b4ce32/emerson/news/2025-11-20_Emerson_Highlights_Strategy_for_Engineering_the_620.pdf",
    "Honeywell Q3 2026 8-K: https://www.sec.gov/Archives/edgar/data/0000773840/000077384026000141/exhibit99-q32026earningsre.htm ; 2026 Investor Day: https://www.honeywell.com/us/en/news/press-releases/2026/06/honeywell-technologies-hosts-2026-investor-day-provides-new-three-year-financial-framework",
    "Fanuc FY3/26: https://www.fanuc.co.jp/en/ir/announce/pdf/2026/financialresult202603_e.pdf ; H1 FY3/27: https://www.ajbell.co.uk/news/articles/fanuc-raises-outlook-record-highs-following-first-half-profit-jump",
    "Keyence Q1 FY3/27: https://www.keyence.co.jp/pdf/FinancialResults_202607_en.pdf ; Yaskawa FY2/26: https://www.yaskawa-global.com/wp-content/uploads/2026/04/20260410_en.pdf",
    "Mitsubishi Electric FY3/26: https://www.businesswire.com/news/home/20260427060797/en/Mitsubishi-Electric-Announces-Consolidated-Financial-Results-for-Fiscal-2026/ ; Q1 FY3/27: https://www.mitsubishielectric.com/en/pr/2026/pdf/0731_co2.pdf ; Next-Stage programme: https://www.mitsubishielectric.com/en/pr/2026/pdf/0203-b.pdf",
    "Omron Q1 FY3/27: https://www.omron.com/global/en/assets/file/ir/irlib/20260805_financial_results.pdf ; Inovance H1 2026: https://quartr.com/events/shenzhen-inovance-technology-co-ltd-300124-q2-2026_FLu90Bhl ; HK IPO: https://www.scmp.com/news/china-future-tech/robotics/article/3351738/chinese-industrial-robot-maker-inovance-joins-hong-kong-ipo-queue",
    "China servo white paper 2026: https://faxiangongchang.com/en/reports/china-general-servo-2026-white-paper",
    "Full agent notes with all URLs: research/04_europe_siemens_schneider_abb.md, 05_us_rockwell_emerson_honeywell.md, 06_japan_china_leaders.md, 07_software_vision_pe_exits.md.",
]:
    story.append(Paragraph(s, S["src"], bulletText="•"))

build(OUT, story, "Factory Automation: Companies Analysis", "Report 2 · Factory automation companies · Oct 2026")
print("ok")
