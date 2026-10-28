import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # src/ for common.py
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(os.path.join(OUT_DIR, "img"), exist_ok=True)
from common import *
from reportlab.platypus import CondPageBreak
import numpy as np

OUT = os.path.join(OUT_DIR, "Working_at_HDD_Companies.pdf")
IMG = os.path.join(OUT_DIR, "img", "img3_")
story = []

story += [Spacer(1, 30),
          P("Working at HDD Companies: A 10–20 Year Career View", "title"),
          P("Compensation, layoffs, culture, future pay capacity and a recommendation for a 15-year HDD servo engineer<br/>"
            "Report 3 of 3 · Prepared 28 October 2026", "subtitle"),
          kpis([("$150–215k", "US base, Sr Staff / Principal<br/>servo & firmware (H-1B, postings)"),
                ("$200–300k", "US total comp in a normal year<br/>(1.5–3x below Big Tech HW)"),
                ("3.7–3.8", "Glassdoor rating<br/>Seagate / WD (Toshiba 3.5)"),
                ("~50%+", "Chance of a company-wide<br/>layoff round by 2031 [EST]")]),
          Spacer(1, 14),
          P("Recommendation", "h1"),
          callout("<b>Stay in HDD for the next 5–10 years, at Western Digital or Seagate — they are close to a tie; for a servo "
                  "specialist WD has a slight edge.</b> Both will exist and be profitable through 2040; both need servo talent "
                  "more than ever because the remaining capacity roadmap (HAMR, ~1,000 kTPI, 12–14 platters, multi-actuator, "
                  "multi-head) is largely a mechatronics problem. But treat HDD as a <b>10–15-year industry, not a 20-year guarantee</b>: "
                  "industry exabytes are forecast to peak around 2031–2035, both companies cut deeply in every downturn, and pay is "
                  "structurally below semiconductor and Big Tech. Use the next 5 years to build skills that transfer (HAMR/multi-actuator "
                  "control, ML-based control, embedded systems) so that precision motion control in semiconductor equipment remains a "
                  "credible plan B.", GOOD, colors.HexColor("#EAF4EE")),
          Spacer(1, 8),
          P("Employer ranking for a servo engineer (10–20 year view)", "h2"),
          table([
              ["Rank", "Employer", "Why", "Main concern"],
              ["1", "<b>Western Digital</b>", "Highest R&amp;D spend ($1.16B); most servo-intensive roadmap (HBD multi-head, Dual Pivot, triple-stage, "
               "14 platters); San Jose servo posting $158–210k base; Bay Area location keeps exit options open", "HAMR follower (1H27); top-3 customers 44% of revenue; weak 5% ESPP"],
              ["1b", "<b>Seagate</b>", "Technology leader (only volume HAMR); fully vertically integrated; better ESPP (15% + lookback), 200% FY26 bonus; "
               "Longmont/Minnesota low cost of living", "Deepest cuts in downturns (−25% headcount 2022–24, US R&amp;D sites shrunk); lowest R&amp;D intensity"],
              ["3", "Toshiba", "Investing to catch up; hybrid flexibility; stable Japanese employment", "~2 yrs behind; depends on TDK heads; PE-owned; tiny servo team outside Japan; 50+ early-retirement cuts"],
              ["4", "Marvell / Broadcom HDD groups", "Higher pay (equity)", "HDD is non-core; servo work limited to demod/SoC; wind-down risk"],
          ], widths=[0.07, 0.17, 0.46, 0.30]),
          ]
story.append(PageBreak())

# ---------------- 1. Layoffs ----------------
story.append(P("1. Layoff history: what actually happened", "h1"))
story.append(P("The pattern is clear across a decade: HDD companies cut quickly and deeply when demand falls, and US R&amp;D sites "
               "take a disproportionate share while Asian centers hold or grow. In good years (2025–26) there were no large rounds, "
               "only targeted reshaping."))
story.append(table([
    ["Year", "Seagate", "Western Digital", "Toshiba"],
    ["2016", "~14% workforce cut; Shakopee R&amp;D >1,000 → ~775; Longmont −70", "Irvine cuts (post-HGST integration)", "Accounting-scandal restructuring"],
    ["2018–20", "2020: ~500 jobs; Minnesota sites merged (Shakopee 140, Fremont 78 WARN)", "Closed Petaling Jaya HDD plant (2018)", "—"],
    ["2022–23", "<b>Oct-22: ~3,000 (8%)</b>; Mar-23: +480; <b>Apr-23: up to 12%</b>; CEO/CFO $0 base for 6 months; Derry ~300", "<b>65k → 53k</b>; CA WARN 543 (San Jose, Milpitas, Irvine); Israel twice; reported 1-week unpaid furlough", "—"],
    ["2024", "Headcount bottoms at ~30k", "Irvine 57; Milpitas 60", "<b>May-24: up to 4,000 in Japan</b> (early retirement 50+)"],
    ["2025–26", "No large round; restructuring charges ~$4–13M/qtr", "Jan-26: 134 San Jose roles (post-split); charges ~$43M in Q1 FY27", "None HDD-specific found"],
], widths=[0.09, 0.33, 0.33, 0.25]))
story.append(P("Sources: SEC 8-Ks, WARN notices (WARNTracker), Blocks &amp; Files, Shakopee Valley News, BizWest, The Register. "
               "TheLayoff.com threads could not be retrieved.", "small"))

f, ax = plt.subplots(figsize=(7.2, 2.3))
yrs = ["FY19", "FY22", "FY23", "FY24", "FY25", "FY26"]
ax.plot(yrs, [40.5, 40.0, 33.4, 30.0, 30.0, 30.0], marker="o", color=C1, lw=2, label="Seagate")
ax.plot(yrs, [None, 65, 53, 51, 40, 40], marker="s", color=C2, lw=2, label="WD (incl. flash before FY25)")
ax.set_ylabel("Employees, thousands"); ax.set_ylim(0, 72); ax.legend(fontsize=7.5, loc="lower left")
ax.set_title("Headcount: cut in the downturn, not rebuilt in the boom", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "hc.png", caption="Source: 10-K filings via StockAnalysis/Macrotrends. WD's drop to 40k in FY25 reflects the Sandisk spin-off."))

# ---------------- 2. Culture ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("2. Employee feedback and culture", "h1"))
story.append(table([
    ["", "Seagate", "Western Digital", "Toshiba"],
    ["Glassdoor overall", "3.8", "3.7", "3.5"],
    ["Recommend to a friend", "73–75%", "69%", "62%"],
    ["CEO approval", "72–74%", "75%", "88%"],
    ["Strong points", "Work-life balance (4.2); colleagues; strong drive engineering", "Ex-HGST engineering depth; benefits", "Hybrid flexibility; stability"],
    ["Weak points", "Senior management (3.5); job security lowest on Indeed (3.2)", "Culture diluted after SanDisk merger; repeated reorganizations", "Slow, seniority-based; limited growth"],
], widths=[0.22, 0.26, 0.26, 0.26]))
story.append(Spacer(1, 6))
story.append(P("Recurring themes across Glassdoor, Indeed and Blind", "h2"))
story += bullets([
    "<b>Positive:</b> reasonable hours, collegial teams, deep technical problems, good benefits; senior engineers are respected for rare domain knowledge.",
    "<b>Negative:</b> repeated layoff rounds; pay below semiconductor and Big Tech; bonuses and promotions frozen in downturns; growth depends on your manager; aging workforce.",
    "<b>Blind sentiment</b> (anecdotal): posters said the 2023 Seagate rounds hit some top performers; WD posters reported a forced one-week furlough in March 2023.",
    "<b>Office policy:</b> no published company-wide RTO mandate at Seagate or WD; hardware and servo work is mostly on-site because of labs; other functions hybrid.",
    "<b>Offshoring:</b> since 2016, every downturn cut US R&amp;D while Singapore, Thailand, Malaysia, India and China held. ~83–88% of staff are in Asia. "
    "This is a <i>risk</i> for US-based engineers and an <i>opportunity</i> for engineers based in Asia.",
    "<b>2025–26 mood:</b> clearly improved — record profits, 200% bonus funding at Seagate, Glassdoor compensation score up ~6%, no large layoffs. "
    "Employees with unvested stock saw windfalls.",
])

# ---------------- 3. Compensation ----------------
story.append(CondPageBreak(3 * inch))
story.append(P("3. Compensation vs typical hardware engineers", "h1"))
story.append(P("Base pay inside HDD is competitive for a hardware engineer; the gap to semiconductor and Big Tech is almost entirely <b>equity</b>. "
               "HDD companies grant roughly one-tenth to one-quarter of the stock that Qualcomm, Nvidia, Apple or Google grant at the same level."))
story.append(table([
    ["US base salary, ~15 YOE servo/firmware", "Range / median", "Source type"],
    ["Seagate Sr Staff Engineer", "median $151–155k (max $200k)", "H-1B LCA 2026"],
    ["Seagate Principal Engineer", "median $179k (max $214k)", "H-1B LCA 2026"],
    ["Seagate HDM Sr Staff (Shakopee/Longmont/Fremont)", "$147k – $214k", "Job posting 2026"],
    ["WD Principal Engineer, Firmware / Hardware", "median $141k / $151k", "H-1B LCA"],
    ["WD Technologist, Firmware", "median $168k (max $205k)", "H-1B LCA"],
    ["WD Servo Control Engineer (San Jose, 5+ yrs)", "$157.7k – $210.3k", "Job posting"],
    ["Sandisk Technologist, Firmware (flash, for comparison)", "median $198k", "H-1B LCA"],
    ["BLS computer hardware engineers (US, May 2025)", "median $161.7k; P90 $225.3k; San Jose median $209.9k", "Government"],
], widths=[0.45, 0.35, 0.2]))
story.append(Spacer(1, 8))

f, ax = plt.subplots(figsize=(7.2, 2.5))
names = ["AMD", "KLA", "WD", "Seagate*", "Lam", "Marvell", "Qualcomm", "Nvidia", "Google", "Apple", "Broadcom"]
vals = [170, 170, 183, 180, 232, 247, 248, 280, 341, 350, 475]
cols = [C4, C4, C2, C2, C4, C4, C4, C4, C4, C4, C4]
order = np.argsort(vals)
ax.barh([names[i] for i in order], [vals[i] for i in order], color=[cols[i] for i in order], height=0.6)
for i, k in enumerate(order):
    ax.text(vals[k] + 5, i, f"${vals[k]}k", va="center", fontsize=7.5)
ax.set_xlabel("Median total compensation, Hardware Engineer, all levels (US, $k)"); ax.set_xlim(0, 540); ax.grid(axis="y", visible=False)
ax.set_title("HDD makers pay at the low end of the hardware market", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "tc.png", caption="Source: Levels.fyi self-reported data, Sep–Oct 2026. *Seagate ≈ 6figr hardware average (thin Levels.fyi data). "
                 "At staff/principal level the gap widens to 1.5–3x."))

story.append(table([
    ["Staff-level TC breakdown (Levels.fyi)", "Base", "Stock/yr", "Bonus", "Total", "Equity share"],
    ["WD L4", "$152k", "$11k", "$13.5k", "$176k", "6%"],
    ["Seagate Staff", "$151k", "$27.5k", "—", "$179k", "15%"],
    ["Marvell T4 Sr Staff", "$194k", "$58.7k", "$25.3k", "$278k", "21%"],
    ["AMD SMTS", "$203k", "$55k", "$26.5k", "$284k", "19%"],
    ["Nvidia IC4", "$222k", "$100k", "$4.5k", "$326k", "31%"],
    ["Apple ICT5", "$258k", "$180k", "$41k", "$479k", "38%"],
], widths=[0.3, 0.12, 0.12, 0.12, 0.17, 0.17]))
story.append(Spacer(1, 6))
story += bullets([
    "<b>Where you land:</b> US Sr Staff / Principal / Technologist servo engineers earn ~$150–215k base and ~$200–300k total in a normal year — "
    "about the 70th–90th percentile of all US hardware engineers, above general controls engineering, below semiconductor and Big Tech.",
    "<b>Location matters:</b> Longmont CO and Minnesota pay slightly less but go further; WD Rochester MN medians (~$95k) are well below market.",
    "<b>The 2025–26 stock windfall was real but one-off.</b> A Seagate principal holding early-2025 RSUs and ESPP may have realized ~$530–660k in FY26 "
    "versus ~$256k at grant value [EST]. New grants are now priced 3–6x higher, so the same dollars buy far fewer shares; both stocks are already "
    "42–55% off their peaks.",
    "<b>Benefits:</b> Seagate ESPP = 15% discount + lookback (strong); WD = 5%. Seagate added a retirement-vesting rule (55+, 5+ years).",
    "<b>Asia:</b> HDD sites pay ~15–40% of US levels in USD (Singapore ~50–80%). E.g., Malaysia Technologist RM 13–19k/month; Singapore Principal "
    "~SGD 10–15k/month [EST except Malaysia].",
])

# ---------------- 4. Future margin / opex / pay capacity ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("4. Projection: margins, opex and willingness to pay (step 6c)", "h1"))
story.append(P("I projected operating margin and operating expenses for Seagate and WD using Report 1's industry scenarios and Report 2's company "
               "assumptions (share ~42–45% each, opex growing ~4–6%/yr). The key insight is that <b>labor cost is not what limits pay</b> — "
               "R&amp;D plus SG&amp;A is only 7–9% of revenue today. What limits pay is <b>policy</b>: both companies have chosen to return "
               "~75%+ of free cash flow to shareholders and to hold headcount flat."))

f, ax = plt.subplots(figsize=(7.2, 2.2))
yy = ["FY25", "FY26", "FY27E", "FY28E", "FY29E", "FY30E", "FY31E"]
stx = [23.4, 36.5, 51, 45, 39, 36, 34]
wd = [24.4, 37.3, 51, 44, 38, 35, 33]
bear = [None, None, 51, 22, 15, 18, 20]
ax.plot(yy, stx, marker="o", color=C1, lw=2, label="Seagate, base")
ax.plot(yy, wd, marker="s", color=C2, lw=2, label="WD, base")
ax.plot(yy, bear, ls="--", color="#A33B3B", lw=1.6, marker="v", label="Either, bear case")
ax.axhspan(12, 17, color=C4, alpha=0.15)
ax.text(6.05, 14.5, "2018–22 norm", fontsize=7, va="center", ha="right", color="#5F6B7A")
ax.set_ylabel("Non-GAAP operating margin, %"); ax.set_ylim(0, 60); ax.legend(fontsize=7.5, loc="upper right")
ax.set_title("Operating margin outlook [EST]", loc="left", fontsize=10, fontweight="bold")
story.append(fig(f, IMG + "margin.png"))

story.append(table([
    ["[EST]", "FY26 actual", "FY28E base", "FY31E base", "FY28–29 bear"],
    ["Seagate revenue", "$12.2B", "~$20B", "~$23B", "~$12–13B"],
    ["Seagate opex (R&amp;D + SG&amp;A)", "$1.33B (11%)", "~$1.45B (7%)", "~$1.65B (7%)", "~$1.3B (cut 5–10%)"],
    ["WD revenue", "$12.9B", "~$21B", "~$24B", "~$13B"],
    ["WD opex (R&amp;D + SG&amp;A)", "$1.71B (13%)", "~$1.85B (9%)", "~$2.1B (9%)", "~$1.6B (cut 5–10%)"],
    ["Operating margin (both)", "~37%", "~44–45%", "~33–34%", "~15–22%"],
    ["Merit raises / bonus", "Bonus 200% (Seagate)", "3–5% merit; bonus 100–150%", "3–4% merit; bonus ~100%", "Freeze; bonus 0–50%"],
    ["Probability of company-wide layoff round", "—", "Low (&lt;15%)", "—", "High (70–80%)"],
], widths=[0.28, 0.17, 0.19, 0.17, 0.19]))
story.append(Spacer(1, 6))
story.append(P("How much will they be willing to pay?", "h2"))
story += bullets([
    "<b>Capacity to pay is high; appetite is moderate.</b> A 20% raise for every US servo engineer would cost each company only tens of millions "
    "a year against $7–8B of FCF. But neither company has re-hired after the 2023 cuts; they manage to per-employee productivity (Seagate revenue "
    "per employee $257k → $407k → ~$560k run-rate).",
    "<b>Expect:</b> base bands rising ~3–5%/yr (WD's H-1B median already stepped up ~7–10% in FY26 after five flat years); bonuses that swing "
    "0–200% with the cycle; small equity grants. Real pay growth comes from promotion (Principal → Technologist) or from stock appreciation.",
    "<b>Your leverage is scarcity:</b> only three companies do HDD servo and the talent pool is aging. Servo/HAMR/multi-actuator specialists are "
    "among the last people cut, but not immune (2016 and 2023 both hit US R&amp;D).",
])
story.append(P("Will employees be safe from layoffs?", "h2"))
story.append(table([
    ["Horizon", "Company-wide round (≥5%)", "Risk for a senior US servo engineer", "Risk for a senior Asia-based servo engineer"],
    ["2027", "Low (10–15%)", "Low (&lt;5%)", "Low (&lt;5%)"],
    ["2028–2029 (likely price reset / digestion)", "Medium-high (50–60%)", "Medium (10–20%)", "Low-medium (5–10%)"],
    ["2030–2035 (HDD exabytes peak ~2031–35)", "Medium (40–50%)", "Medium (15–25%), rising with site consolidation", "Low-medium"],
    ["2035–2045 (HDD structural decline, Furthur end-of-life ~2043)", "High", "High", "Medium-high"],
], widths=[0.3, 0.2, 0.25, 0.25]))
story.append(P("[EST] throughout this report = analyst estimate; ratings and pay are self-reported or from filings. Not financial advice. All probabilities are analyst judgments derived from the downturn history (1 cyclical correction every ~4–5 years) and the "
               "scenarios in Reports 1–2.", "small"))

# ---------------- 5. Career plan ----------------
story.append(CondPageBreak(3.5 * inch))
story.append(P("5. A 10–20 year plan", "h1"))
story.append(table([
    ["Period", "Industry state", "What to do"],
    ["2026–2028", "Peak profits, contracts locked, HAMR and multi-actuator ramp",
     "Join/stay at WD or Seagate on the HAMR, multi-actuator or high-TPI servo team. Negotiate equity in <b>dollars</b> plus a sign-on to cover "
     "forfeited stock. Sell some vested stock — it fell 40–55% from peak within months."],
    ["2028–2030", "Probable price reset / digestion year; layoffs likely",
     "Be on the critical-path program (HAMR 2nd gen, 50–60TB, Dual Pivot / HBD). Build an external profile (papers, patents). Keep 12 months of savings."],
    ["2030–2035", "Exabytes near peak; 80–100TB drives; HDMR research",
     "Decide: stay as principal/technologist for HDD's final technical era, or move. Your skills map best to wafer/reticle stage control "
     "(ASML, KLA, Applied Materials, Lam, Nikon/Canon), camera OIS/autofocus actuators, robotics, IBM tape servo."],
    ["2035–2045", "Structural decline; consolidation to two makers likely", "Only the strongest specialists remain; plan to have transitioned or be in a leadership role."],
], widths=[0.13, 0.28, 0.59]))
story.append(Spacer(1, 8))
story.append(P("Choosing between WD and Seagate", "h2"))
story += bullets([
    "<b>Choose WD</b> if you want the most varied servo problems (multi-head simultaneous writing, dual pivot, triple-stage actuation, 14 platters, "
    "ePMR and HAMR on one firmware base), a Bay Area base with outside options, and the higher R&amp;D budget.",
    "<b>Choose Seagate</b> if you want to be at the HAMR technology leader, value lower cost of living (Longmont, Shakopee) and a better ESPP, "
    "and accept a leaner, cut-fast culture.",
    "<b>If you are based in Asia</b> (Singapore, Thailand, Malaysia), the offshoring trend works for you: Seagate Singapore and WD Thailand/Malaysia "
    "R&amp;D have been the most stable sites through downturns.",
    "<b>Avoid</b> Toshiba unless you are in Japan and value stability over growth; avoid HDD groups at Marvell/Broadcom for a 20-year horizon.",
])
story.append(callout("<b>Final answer:</b> Yes, stay in the HDD industry — it has at least 10 good years left and your skill set is at the "
                     "center of its roadmap. Aim for <b>Western Digital or Seagate</b> (slight edge to WD for a servo engineer; Seagate if "
                     "you prefer the HAMR leader and lower cost of living). Do not count on HDD alone for 20 years: expect at least one "
                     "layoff cycle before 2030, and deliberately build transferable precision-motion-control skills as insurance."))

story.append(Spacer(1, 10))
story.append(P("Sources", "h1"))
for s in [
    "SEC 8-K, Seagate October 2022 restructuring: https://www.sec.gov/Archives/edgar/data/1137789/000113778922000116/stx-20221026.htm ; April 2023: https://www.sec.gov/Archives/edgar/data/1137789/000113778923000025/stx-20230420.htm",
    "Blocks &amp; Files, Seagate 3,000 job cuts (Oct 2022): https://blocksandfiles.com/2022/10/26/seagate-revenues-tank-as-3000-job-losses-loom/",
    "Irish News, Seagate Derry 300 jobs: https://ie.irishnews.com/news/business/seagate-confirm-300-jobs-gone-at-derry-plant-as-annual-turnover-falls-by-25-VWG4VVI24VA4VMVQ5K7PHWCBOM",
    "WARNTracker, Seagate: https://www.warntracker.com/company/seagate-us ; Western Digital: https://www.warntracker.com/layoff/western-digital-2023-07-28",
    "Shakopee Valley News, Seagate Shakopee layoffs: https://swnewsmedia.com/shakopee_valley_news/news/business/seagate-lays-off-employees-in-shakopee/article_d46945dd-e74b-5654-adaf-b4d3f6ca69bc.html",
    "BizWest, Seagate Longmont cuts (2016): https://bizwest.com/2016/07/12/local-impact-seagates-14-workforce-cut-unclear/",
    "LayoffTracker, WD 2023: https://www.layofftracker.us/layoffs/company/western-digital/2023",
    "The Register, Toshiba to shed 4,000 jobs (May 2024): https://www.theregister.com/2024/05/17/toshiba_to_shed_4000_jobs/",
    "Glassdoor: Seagate https://www.glassdoor.com/Reviews/Seagate-Technology-Reviews-E1864.htm ; WD https://static.glassdoor.ch/Reviews/WD-Reviews-E1067_P9.htm ; Toshiba https://static.glassdoor.ca/Reviews/Toshiba-Reviews-E3543.htm",
    "Indeed, Seagate reviews: https://www.indeed.com/cmp/Seagate-Technology/reviews",
    "Blind: WD layoffs https://www.teamblind.com/company/Western-Digital/posts/western-digital-layoffs ; WD furlough https://www.teamblind.com/post/wd-workers-were-you-forced-to-take-past-week-off-quc8s1r0 ; WD salaries https://www.teamblind.com/company/Western-Digital/salaries/united-states",
    "Ellis.com H-1B data: Seagate https://www.ellis.com/visa-sponsors/seagate-us-llc/salaries ; WD https://www.ellis.com/visa-sponsors/western-digital-technologies-inc/salaries ; Sandisk https://www.ellis.com/visa-sponsors/sandisk-technologies-inc/salaries",
    "MyVisaJobs, WD: https://www.myvisajobs.com/employer/western-digital-technologies/ ; VisaVerge, WD FY2026: https://www.visaverge.com/h1b-sponsors/western-digital-technologies/",
    "Levels.fyi hardware engineer pages: WD https://www.levels.fyi/en-gb/companies/western-digital/salaries/hardware-engineer ; Marvell https://www.levels.fyi/en-gb/companies/marvell/salaries/hardware-engineer ; Nvidia https://www.levels.fyi/companies/nvidia/salaries/hardware-engineer ; Apple https://levels.fyi/companies/apple/salaries/hardware-engineer ; Qualcomm https://www.levels.fyi/companies/qualcomm/salaries/hardware-engineer ; AMD https://www.levels.fyi/companies/amd/salaries/hardware-engineer ; Lam https://www.levels.fyi/companies/lam-research/salaries/hardware-engineer ; Broadcom https://www.levels.fyi/companies/broadcom/salaries/hardware-engineer",
    "6figr, Seagate: https://6figr.com/us/salary/seagate",
    "WD Servo Control Engineer posting: https://jobs.smartrecruiters.com/WesternDigital/744000035258247 ; Seagate HDM Sr Staff posting: https://wellfound.com/jobs/4763117-hdm-sr-staff-engineer ; Seagate servo roles: https://seagatecareers.com/job/Shugart-Staff-Engineer-(Servo)/1354377400",
    "BLS, Computer Hardware Engineers: https://www.bls.gov/ooh/architecture-and-engineering/computer-hardware-engineers.htm ; OEWS percentiles (Wagedex): https://wagedex.com/jobs/computer-hardware-engineers",
    "Seagate ESPP: https://benefits.seagate.com/financial/employee-stock-purchase-plan ; WD ESPP: https://usbenefits.wdc.com/employee-stock-purchase-plan",
    "JobStreet Malaysia, Sandisk engineering salaries: https://my.jobstreet.com/companies/sandisk-174185706023469/salaries/engineering",
    "John Monroe (Furthur), HDD outlook to 2043: https://www.digitalpreservation.gov/meetings/DSA2026/0107_monroe_Library%20of%20Congress_DSA_09%20March%202026%20V11.83-Final.pdf",
    "Financial projections build on Reports 1 and 2 (company SEC filings and earnings calls, Oct 2026).",
]:
    story.append(Paragraph(s, S["src"], bulletText="•"))

build(OUT, story, "Working at HDD Companies", "Report 3 · Working at HDD companies · Oct 2026")
print("ok")
