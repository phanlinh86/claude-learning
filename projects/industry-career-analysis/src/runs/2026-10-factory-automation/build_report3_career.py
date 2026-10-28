import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/ for common.py
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(os.path.join(OUT_DIR, "img"), exist_ok=True)
from common import *
from reportlab.platypus import CondPageBreak
import numpy as np

OUT = os.path.join(OUT_DIR, "Working_at_FA_Companies.pdf")
IMG = os.path.join(OUT_DIR, "img", "img3_")
story = []

# ---------------- Cover ----------------
story += [Spacer(1, 26),
          P("Working in Factory Automation: A 10–20 Year Strategy Career View", "title"),
          P("Layoffs, culture, compensation by region, future pay capacity and an employer recommendation for a senior "
            "corporate-strategy professional<br/>Report 3 of 3 · Prepared 28 October 2026", "subtitle"),
          kpis([("$260–400k", "US director-level strategy<br/>total comp at FA majors [EST]"),
                ("2–3×", "Big tech / PE pay at the<br/>same seniority"),
                ("4.0–4.2", "Glassdoor: Schneider, Siemens,<br/>Honeywell, ABB (Rockwell 3.7)"),
                ("~50%", "Chance of a company-wide cut<br/>at your employer by 2029 [EST]")]),
          Spacer(1, 12),
          P("Recommendation", "h1"),
          callout("<b>Stay in factory automation, and aim for Siemens or Schneider Electric; ABB is the best-paid alternative.</b> "
                  "The industry is growing ~6–7% a year and is in its busiest portfolio-reshaping period ever, so senior "
                  "strategy, M&amp;A and integration skills are central rather than overhead. <b>Siemens</b> offers the largest, most durable "
                  "strategy organisation, the strongest franchise and German employment protection. <b>Schneider</b> is the most "
                  "strategy-intensive employer for the next five years (the $23.7B PTC integration, divestments, software pivot) with "
                  "the best employee sentiment and a multi-hub HQ (Paris, Boston, Hong Kong, Bangalore). <b>ABB</b> in Zurich pays the most "
                  "on a risk-adjusted basis but has a thin central HQ. Avoid HQ strategy roles at Japanese firms unless you are fluent "
                  "in Japanese, and treat Honeywell and Emerson as deal-experience employers rather than 20-year homes. "
                  "Your biggest pay lever is the step from Director to VP or business-unit GM, not the choice of company.",
                  GOOD, colors.HexColor("#EAF4EE")),
          Spacer(1, 8),
          P("Employer ranking for a senior strategy professional (10–20 year view) [EST]", "h2"),
          table([
              ["#", "Employer", "Why", "Main concern"],
              ["1", "<b>Siemens</b> (Munich; US software in Plano)", "Largest, durable strategy function; deepest internal mobility (DI, SI, Mobility, Advanta); "
               "global #1 franchise; no forced redundancies in Germany; Director of Strategy postings $169–328k base in the US", "Bureaucracy, slow promotion; DI cut 5,600 jobs in 2025; Healthineers spin"],
              ["2", "<b>Schneider Electric</b> (Paris, Boston, HK, Bangalore)", "Most strategy-intensive (PTC, India buyout, €1–1.5B divestments, software ~25% of revenue by 2030); "
               "best Glassdoor (4.2, 87% recommend); data-center tailwind", "CEO turnover (2024); PTC overlap cuts 2027–28; heavy matrix"],
              ["3", "<b>ABB</b> (Zurich)", "Best risk-adjusted pay (Swiss TDC ~$350–520k, low tax); record margins, net cash; strong process + electrification", "Thin central HQ ('ABB Way'): few senior central seats"],
              ["4", "<b>Emerson</b> (St. Louis)", "Highest margins; AspenTech/NI software; clear 2028 plan", "Lean post-integration center; tenure-based RIFs reported"],
              ["5", "<b>Rockwell</b> (Milwaukee)", "Pure-play automation; focused strategy agenda (software, partnerships)", "Most cyclical; HQ/SG&amp;A cut in 2024; lowest sentiment (3.7, 70% CEO approval)"],
              ["6", "<b>Honeywell Technologies</b> (Charlotte)", "Unmatched separation/M&amp;A experience; new standalone strategy function", "Least stable seat; activist on board; rolling repositioning"],
              ["—", "Japanese majors / Inovance", "Stable (Keyence, Fanuc) or growing (Inovance)", "HQ strategy closed to non-Japanese/Mandarin speakers; use US/EU subsidiaries (Omron Americas best)"],
          ], widths=[0.04, 0.22, 0.46, 0.28]),
          PageBreak()]

# ---------------- 1. Layoffs ----------------
story.append(P("1. Layoff and restructuring history", "h1"))
story.append(P("The 2023–25 downturn produced cuts at most leaders, and they fell disproportionately on SG&amp;A and headquarters "
               "functions. The newer, bigger risk for an HQ strategist is portfolio change: spins and sales first create strategy work, "
               "then shrink corporate centers 12–24 months later."))
story.append(table([
    ["Company", "2019–2023", "2024–2026", "Who was hit"],
    ["Siemens", "Energy spin (2020)", "<b>Mar 2025: ~5,600 DI jobs</b> (~2,600 Germany) by Sep 2027; 450 eMobility", "Automation capacity; no forced redundancies in Germany"],
    ["Schneider", "AVEVA integration cuts", "CEO removed Nov 2024; French plant consolidation (~145 jobs); €500M restructuring 2025–27", "Factories, not HQ; PTC overlap ahead"],
    ["ABB", "'ABB Way' removed group HQ layer (2019–20)", "Robotics (~7,000 staff) sold to SoftBank; 3-BA reorganisation", "Business-area staff"],
    ["Rockwell", "—", "<b>May 2024: ~870 (3%)</b>; headcount 29k → 26k by 2025", "<b>Sales, marketing, HQ Milwaukee</b>; acquired AMR unit"],
    ["Emerson", "<b>2020: ~2,900 salaried</b>", "NI and AspenTech integration; Charlottesville site closing (139)", "Acquired/overlapping units; tenure-based selection reported"],
    ["Honeywell", "Annual repositioning charges", "Three-way split (2025–26); PSS, Intelligrated, PPE sold", "Corporate functions duplicated, then rationalised"],
    ["Mitsubishi Electric", "—", "Early retirement for 53+: <b>~4,700</b> (despite record profit)", "Older white-collar staff"],
    ["Omron", "—", "<b>2024: ~2,000</b> (1,000 Japan, 1,000 overseas)", "Broad; second big cut in 90 years"],
    ["Keyence, Fanuc, Yaskawa", "None found", "None found (Yaskawa: Europe restructuring)", "—"],
], widths=[0.15, 0.2, 0.4, 0.25]))
story.append(P("Sources: Reuters via TrendForce, Control Global, company IR, Virginia WARN, Eurofound. TeamBlind and TheLayoff threads were not retrieved.", "small"))

f, ax = plt.subplots(figsize=(7.2, 2.4))
cos = ["Schneider", "Siemens", "Honeywell", "ABB", "Emerson", "Rockwell"]
rec = [87, 81, 84, 80, 75, 72]
ceo = [90, 90, 88, 86, 79, 70]
out = [77, 73, 75, 72, 68, 59]
x = np.arange(len(cos))
ax.bar(x - 0.27, rec, 0.27, color=C1, label="Recommend to a friend")
ax.bar(x, ceo, 0.27, color=C3, label="CEO approval")
ax.bar(x + 0.27, out, 0.27, color=C2, label="Positive business outlook")
rat = [4.2, 4.1, 4.1, 4.0, 3.7, 3.7]
for i, r in enumerate(rat):
    ax.text(i, 96, f"★ {r}", ha="center", fontsize=8, fontweight="bold")
ax.set_xticks(x); ax.set_xticklabels(cos); ax.set_ylim(40, 102); ax.set_ylabel("%"); ax.grid(axis="x", visible=False)
ax.legend(fontsize=7.2, ncol=3, loc="lower center", bbox_to_anchor=(0.5, -0.38))
ax.set_title("Glassdoor sentiment, mid-2026 (★ = overall rating)", loc="left", fontsize=10, fontweight="bold", pad=14)
story.append(CondPageBreak(4.2 * inch))
story.append(P("2. Employee feedback and culture", "h1"))
story.append(fig(f, IMG + "glassdoor.png", caption="Glassdoor pages fetched Oct 2026. Japanese firms and Inovance not covered on Glassdoor; "
                 "Keyence from one OpenWork review (~¥15M pay, ~60 h/month overtime)."))
story.append(table([
    ["Company", "What employees like", "What they complain about", "Note for a strategist"],
    ["Schneider", "Pay/benefits, hybrid work, culture, sustainability story", "Credential-driven progression, matrix", "Global hubs; HQ cuts rare (EU labor law)"],
    ["Siemens", "CEO, benefits, job security (Germany)", "Bureaucracy, slow decisions, middle-management politics", "Huge internal mobility, slow promotion"],
    ["ABB", "Culture, pace, fair pay", "Chaotic; many stakeholders", "Strategy sits mostly in business areas"],
    ["Honeywell", "Brand, performance focus", "Short-termism, cut-throat culture, turnover", "Metrics-heavy; 3 days/week in office"],
    ["Emerson", "Supportive managers, work-life balance", "Powerful HR, tenure-based RIFs, complacency", "Busy during deals, lean afterwards"],
    ["Rockwell", "People, collegial Milwaukee culture", "Layoff anxiety, limited opportunities", "Lowest outlook (59%)"],
    ["Japanese firms", "Stability (Keyence: very high pay)", "Seniority, Japanese-only decisions, 53+ early retirement", "HQ planning goes to long-tenured insiders"],
], widths=[0.14, 0.27, 0.3, 0.29]))
story.append(Spacer(1, 4))
story += bullets([
    "<b>Work arrangements:</b> Honeywell requires 3 office days a week; Rockwell runs a hybrid programme but stresses face-to-face; Siemens' 2–3 mobile days a week "
    "is long-standing [not re-verified]; Japanese firms are office-centric.",
    "<b>Mobility:</b> Siemens, Schneider and ABB have the deepest global-rotation and expatriate programmes — useful for a global strategy career.",
    "<b>Mood 2025–26:</b> improving with the upcycle, but companies are expanding margins through 'flat headcount, rising margin' rather than rehiring.",
])

# ---------------- 3. Compensation ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("3. Compensation: by region and against other careers", "h1"))
story.append(P("Factory-automation majors pay a 15-year strategy professional well by any normal standard — a US director sits near the "
               "BLS chief-executive median ($269.6k mean) — but at the low-to-mid end of what the same profile earns in big tech, "
               "PE or senior consulting. The gap is almost entirely equity."))

f, ax = plt.subplots(figsize=(7.2, 3.0))
labels = ["Japan (MELCO, Omron)", "China (MNC Shanghai)", "Japan office of Siemens/ABB", "Japan (Keyence)", "France (Schneider)",
          "Germany (Siemens)", "Singapore APAC HQ", "US FA major", "MBB Assoc. Partner", "Switzerland (ABB)", "PE Principal", "US big tech"]
lo = [87, 110, 125, 165, 170, 185, 190, 260, 318, 350, 470, 500]
hi = [113, 230, 185, 235, 265, 275, 300, 400, 483, 520, 940, 1000]
cols = [C4, C4, C4, C4, C1, C1, C1, C1, C2, C1, C2, C2]
y = np.arange(len(labels))
ax.barh(y, [h - l for l, h in zip(lo, hi)], left=lo, color=cols, height=0.55)
for i, (l, h) in enumerate(zip(lo, hi)):
    ax.text(h + 10, i, f"${l}–{h}k", va="center", fontsize=7)
ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=7.5); ax.set_xlim(0, 1150)
ax.set_xlabel("Director / head-of-strategy total direct compensation, US$ thousands"); ax.grid(axis="y", visible=False)
ax.set_title("Director-level strategy pay by region (blue/grey) vs alternatives (orange)", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "pay.png", caption="Synthesis of Siemens US pay-transparency postings, H-1B title data, Glassdoor, Levels.fyi, Michael Page 2026, "
                 "JAC Recruitment, Heidrick PE survey and Japanese securities filings. Most non-US figures are estimates [EST], ±20%."))

story.append(table([
    ["US ladder at FA majors [EST]", "Base", "Bonus target", "LTI (annual)", "Total at target"],
    ["Senior Manager, Strategy / Corp Dev", "$160–200k", "15–20%", "0–15% of base", "$185–250k"],
    ["<b>Director, Strategy / Corp Dev</b>", "<b>$190–260k</b>", "<b>25–30%</b>", "<b>20–50% of base</b>", "<b>$260–400k</b>"],
    ["Senior Director / Head of Strategy (BU)", "$240–310k", "30–40%", "50–100%", "$400–600k"],
    ["VP Strategy / Corp Dev (enterprise)", "$300–425k", "50–60%", "100–200%", "$600k–1.2M"],
], widths=[0.33, 0.14, 0.15, 0.18, 0.2]))
story.append(Spacer(1, 4))
story += bullets([
    "<b>Evidence:</b> Siemens US Director of Strategy postings $191–328k base + 25% bonus and $168.7–303.7k; Siemens M&amp;A Strategist $147.5–206.6k + 10–15%; "
    "H-1B 'Director, Corporate Strategy' median $214k base (2024, all employers); Glassdoor US Director of Strategy median ~$247k total.",
    "<b>Japan:</b> corporate-planning department head ~¥11.8M (~$79k), division head ~¥15.4M; Keyence average ¥20.4M at age 35 — but almost no strategy roles. "
    "Japanese firms grant essentially no equity below officer level.",
    "<b>Equity tailwind:</b> ABB, Schneider and Siemens hit record share prices in 2026 on data-center electrification, so 2023–24 grants vest 10–25% above target. "
    "Schneider has since fallen ~20% from its September high — new grants carry more risk.",
    "<b>Promotion economics:</b> Director → VP or BU general manager roughly doubles total pay through LTI. Staying in staff strategy usually tops out at Senior Director.",
])

# ---------------- 4. Projection ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("4. Projection: margins, opex and willingness to pay", "h1"))
story.append(P("Using Report 1's industry scenarios and Report 2's company assumptions, the leading Western employers should keep "
               "expanding margins through 2031. But their plans deliver that expansion mainly through <b>cost discipline</b> — flat "
               "headcount, SG&amp;A productivity and restructuring — not through higher pay. Capacity to pay is high; appetite is moderate."))
f, ax = plt.subplots(figsize=(7.2, 2.6))
yy = ["2025", "2026", "2027E", "2028E", "2029E", "2030E", "2031E"]
series = {
    "Emerson (adj. EBITA)": [27.6, 28.3, 29, 27.5, 29, 30, 30.5],
    "Rockwell (segment)": [20.4, 22.3, 23, 19.5, 21, 23, 23.5],
    "Siemens DI": [14.9, 18.0, 19.5, 16.5, 18.5, 20, 20.5],
    "Schneider (group)": [18.7, 19.8, 20.3, 19.5, 20.5, 21.3, 21.8],
    "ABB (group)": [19.0, 20.6, 21, 19.5, 20.5, 21, 21.5],
}
cc = [C5, C2, C1, C3, C4]
for (k, v), c in zip(series.items(), cc):
    ax.plot(yy, v, marker="o", lw=1.8, color=c, label=k)
ax.axvspan(2.6, 4.4, color="#A33B3B", alpha=0.07)
ax.text(3.5, 13.2, "likely 2028–29 dip", ha="center", fontsize=7, color="#A33B3B")
ax.set_ylim(12, 33); ax.set_ylabel("Margin, %"); ax.legend(fontsize=7, ncol=3, loc="upper left")
ax.set_title("Margin outlook, base case [EST]", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "margin.png", caption="2025 actual; 2026 = latest run-rate/guidance; 2027–31 analyst estimates anchored on company targets "
                 "(Emerson 30% by 2028; Schneider +250bp by 2030; ABB 18–22%; Siemens DI back to ~20%)."))
story.append(table([
    ["[EST]", "2026", "2028 (base, dip year)", "2031 (base)", "Bear 2028–29"],
    ["Industry revenue (Report 1)", "~$230B", "~$245B", "~$315B", "~$212–218B"],
    ["Leader margins", "18–28%", "16–27%", "20–30%", "12–22%"],
    ["SG&amp;A / opex growth", "+3–5%", "Flat to −3% (cost programmes)", "+3–4%/yr", "−5 to −8%"],
    ["Merit raises", "3–5%", "2–3%", "3–4%", "Freeze"],
    ["Bonus payout vs target", "100–130%", "60–90%", "~100%", "0–50%"],
    ["LTI realised vs grant", "+10–25% (record shares)", "Below target", "~Target", "Well below"],
    ["Company-wide cut (≥3% staff) at a given major", "Low (&lt;15%)", "Medium (35–45%)", "Low-medium", "High (70–80%)"],
], widths=[0.3, 0.16, 0.2, 0.15, 0.19]))
story.append(Spacer(1, 6))
story.append(P("Will a senior strategy role be safe from layoffs?", "h2"))
story.append(table([
    ["Horizon", "What drives the risk", "Risk for a senior HQ strategist [EST]"],
    ["2026–2027", "Upcycle; deal execution (PTC, Robotics sale, Rotork, Healthineers spin)", "Low; demand for strategy/M&amp;A/integration is high"],
    ["2027–2029", "Post-deal center slimming (Schneider–PTC, Honeywell post-split, Emerson integrations) + likely cyclical dip", "Medium (15–25%); highest at Honeywell, Emerson, Rockwell"],
    ["2030–2035", "Software/AI transition, possible China export pressure, further portfolio moves", "Medium; skills in software economics and M&amp;A protect best"],
    ["Japan HQ roles", "53+ early-retirement programmes even in record years", "High for older staff; low access for outsiders"],
    ["Germany / France HQ roles", "Co-determination, no forced redundancies, attrition-based cuts", "Lowest structural risk"],
], widths=[0.16, 0.5, 0.34]))
story.append(P("Your protection is not the employer's balance sheet (all are strong) but your position on the deal and software agenda: "
               "strategists who lead integrations, separations, partnerships and software monetisation are the last to be cut.", "body"))

# ---------------- 5. Plan ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("5. A 10–20 year plan", "h1"))
story.append(table([
    ["Period", "Industry state", "What to do"],
    ["2026–2028", "Upcycle; record deal activity; software and AI pivot",
     "Join Siemens or Schneider in a strategy/M&amp;A role tied to a live transformation (Schneider–PTC integration, Siemens software/AI, ABB portfolio). "
     "Negotiate LTI in currency terms; ask for a sign-on to replace forfeited equity."],
    ["2028–2030", "Probable cyclical dip; post-deal corporate-center slimming",
     "Be on the critical path (integration PMO, carve-outs, ARR strategy, Nvidia/Microsoft alliances). Push for a VP or BU-GM step — the largest pay jump available."],
    ["2030–2035", "~$300B+ market, software ~30%+ of profit; China export pressure",
     "Move from staff strategy into P&amp;L or enterprise VP strategy; or use the domain + deal record to exit to PE (industrial-tech operating roles) or software corp dev."],
    ["2035–2046", "Physical AI and software-defined control mature",
     "Senior leadership (CSO, BU head) or board/PE roles. Factory-automation domain knowledge stays valuable because the industry keeps growing."],
], widths=[0.13, 0.27, 0.6]))
story.append(Spacer(1, 6))
story.append(P("Choosing between Siemens and Schneider", "h2"))
story += bullets([
    "<b>Choose Siemens</b> for scale, stability and breadth: the largest strategy community, many internal moves (DI, Smart Infrastructure, Mobility, Advanta consulting), "
    "the clearest factory-automation franchise, and German employment protection if based in Munich. Accept slower promotion and bureaucracy.",
    "<b>Choose Schneider</b> for the most strategy-intensive 5 years — PTC is a once-in-a-decade integration — plus the best culture scores and a genuinely multi-hub "
    "organisation that suits a global career. Accept higher leadership volatility and possible overlap cuts in 2027–28.",
    "<b>By region:</b> US for the highest cash (US majors and US units of European firms); Zurich (ABB) for best risk-adjusted pay; Singapore for an APAC strategy-head role; "
    "Japan only via a foreign firm's Japan office or Omron's US/EU hubs.",
    "<b>Exit options ranked by growth:</b> data-center power and cooling (Vertiv, Eaton), robotics/physical-AI start-ups, industrial-software acquirers, PE portfolio roles; "
    "consulting is the weakest market now.",
])
story.append(callout("<b>Final answer:</b> Yes — factory automation is a good long-term home for a senior strategy professional: growing, profitable "
                     "and in the middle of a structural reshaping that puts strategy at the center. Aim for <b>Siemens</b> (stability and breadth) or "
                     "<b>Schneider Electric</b> (most strategy work, best culture), with <b>ABB</b> as the best-paid alternative. Expect at least one "
                     "restructuring cycle before 2030, protect yourself by owning deal and software work, and plan your pay growth around a VP or "
                     "business-unit leadership step rather than around the employer.", GOOD, colors.HexColor("#EAF4EE")))
story.append(P("[EST] = analyst estimate. Ratings and pay are self-reported, posted or from filings as labelled. Not financial or career advice.", "small"))

story.append(Spacer(1, 10))
story.append(P("Sources", "h1"))
for s in [
    "Siemens job cuts (Reuters via TrendForce): https://www.trendforce.com/news/2025/03/20/news-siemens-to-cut-6000-jobs-biggest-layoff-since-2017-amid-automation-ev-challenges/ ; Eurofound: https://apps.eurofound.europa.eu/restructuring-events/detail/202521",
    "Rockwell 2024 layoffs: https://www.controlglobal.com/industry-news/news/55090751/rockwell-plans-close-to-900-layoffs ; FY2025 10-K: https://www.sec.gov/Archives/edgar/data/1024478/000102447825000116/rok-20250930.htm",
    "Emerson Charlottesville closure: https://virginiabusiness.com/emerson-charlottesville-plant-closing-139-jobs/ ; 2020 cuts: https://sbj.net/stories/emerson-to-cut-2900-jobs,67654",
    "Omron NEXT 2025: https://www.omron.com/global/en/assets/file/ir/irlib/20240226_01e.pdf ; Mitsubishi Electric Next-Stage programme: https://www.mitsubishielectric.com/en/pr/2025/pdf/0908.pdf",
    "ABB Robotics to SoftBank: https://www.therobotreport.com/abb-group-sells-abb-robotics-softbank-5-3b/ ; Honeywell split (WFAE): https://www.wfae.org/business/2025-02-06/charlotte-based-honeywell-to-split-into-three-companies",
    "Schneider France reorganisation: https://www.optionfinance.fr/info-financiere-en-continu/d/2026-09-09-schneider-electric-rationalise-sa-production-en-france-et-investit-150-millions-deuros.html",
    "Glassdoor: Schneider https://clear.glassdoor.nl/Reviews/Schneider-Electric-Reviews-E3956.htm ; Siemens https://static.glassdoor.de/Reviews/Siemens-Reviews-E3510_P30.htm ; Honeywell https://static.glassdoor.sg/Reviews/Honeywell-Reviews-E28.htm ; ABB https://static.glassdoor.fr/Reviews/ABB-Reviews-E3076_P60.htm ; Emerson https://static.glassdoor.com.au/Reviews/Emerson-Reviews-E225.htm ; Rockwell https://static.glassdoor.ch/Reviews/Rockwell-Automation-Reviews-E567.htm",
    "Keyence OpenWork review: https://www.openwork.jp/user_answer.php?vid=a0ARC00000nz4iP",
    "Siemens Director of Strategy posting: https://jobs.siemens.com/es_ES/externaljobs/JobDetail/499441 ; DISW Director of Strategy: https://themuse.com/jobs/siemensdigitalindustriessoftware/director-of-strategy-di-sw-strategy-us-remote-df69a9 ; M&amp;A Strategist: https://jobs.siemens.com/en_US/externaljobs/JobDetail/494469",
    "H-1B title data: https://h1bdata.net/title/Director%2C%20Corporate%20Strategy/?year=2024 ; https://h1bdata.net/title/Director%2C%20Corporate%20Development/?year=2024 ; Ellis Rockwell: https://www.ellis.com/visa-sponsors/rockwell-automation-inc/salaries ; Ellis Siemens: https://www.ellis.com/visa-sponsors/siemens-corporation/salaries",
    "Glassdoor Director of Strategy (US): https://www.glassdoor.com/Salaries/director-of-strategy-salary-SRCH_KO0,20.htm ; Levels.fyi Amazon Director: https://www.levels.fyi/companies/amazon/salaries/product-manager/levels/director",
    "MBB salaries: https://www.myconsultingcoach.com/consulting-salaries ; PE (Heidrick 2025 via Uplevered): https://uplevered.com/private-equity-salary/ ; BLS OEWS May 2025: https://www.bls.gov/news.release/ocwage.t01.htm",
    "Michael Page Singapore 2026 (Vulcan Post): https://vulcanpost.com/908721/singapore-salary-guide-2026-michael-page/ ; JAC corporate planning salary: https://www.jac-recruitment.jp/market/administration/corporate-planning-salary/ ; Keyence average salary: https://plus.onecareer.jp/articles/1384",
    "Emerson 2025 Investor Conference (2028 targets): https://ir.emerson.com/_assets/_c9452fc8b238aaf7c54f4eca72b4ce32/emerson/news/2025-11-20_Emerson_Highlights_Strategy_for_Engineering_the_620.pdf ; ABB CMD 2025: https://www.marketscreener.com/news/abb-leaves-revenue-growth-target-unchanged-as-it-reshapes-portfolio-s-focus-update-ce7d5edbdb8df125",
    "Full agent notes with all URLs: research/08_employee_feedback_layoffs.md, 09_compensation_strategy.md, 03_technology_strategy_roles.md, 07_software_vision_pe_exits.md.",
]:
    story.append(Paragraph(s, S["src"], bulletText="•"))

build(OUT, story, "Working in Factory Automation", "Report 3 · Working in factory automation · Oct 2026")
print("ok")
