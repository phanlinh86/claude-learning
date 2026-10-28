# 08 — Compensation Analysis: HDD Companies vs. Hardware Benchmarks

*Prepared October 28, 2026, for a 15-year HDD servo control and firmware engineer.*

**Data labels used throughout:**
- **[LCA]**: US Department of Labor H-1B Labor Condition Application filings, aggregated by Ellis.com, VisaVerge or MyVisaJobs. These are **base salary only**, from government filings. They are the most objective source, but they skew low because the wage only has to meet the prevailing wage.
- **[SR]**: self-reported total compensation (Levels.fyi, Blind, 6figr). These are unverified submissions, biased toward Bay Area and tech-savvy respondents.
- **[POST]**: pay-transparency ranges in employer job postings (base only).
- **[GOV]**: BLS OEWS statistics.
- **[EST]**: analyst estimate or an illustrative calculation. **Not sourced data.**

> Research limitation: the shared web-search budget ran out partway through. **Toshiba America, Broadcom and Marvell H-1B data**, **Glassdoor and Payscale servo pages** and **sourced non-US salary data** (beyond one Malaysian page) could not be retrieved. Those sections are marked [EST] where they appear.

---

## 1. Executive summary

| Question | Answer |
|---|---|
| What does a senior HDD servo or firmware engineer (~15 YOE, US) earn in base pay? | **About $145k to $215k base.** Seagate Sr Staff and Principal H-1B medians are $150k to $179k [LCA]. A Seagate HDM Sr Staff posting lists $147k to $214k [POST]. WDC Principal and Technologist firmware medians are $141k to $168k [LCA]. A WDC servo control engineer posting (5+ YOE) lists $157.7k to $210.3k [POST]. |
| Total compensation (TC) at that level? | **About $190k to $300k** in normal years [SR]. WDC Technologist and L5 submissions run $244k to $290k [SR]. In FY2026, stock and bonus pushed realized pay well above this (see section 5). |
| How does that compare with the typical US hardware engineer? | Base pay is **at or modestly above** the BLS median for computer hardware engineers ($161,740). TC sits around the **75th to 90th percentile** of the BLS range ($203k to $225k), which is mostly wages. |
| How does it compare with semiconductor and Big Tech hardware? | **HDD pay trails by a wide margin at the same seniority.** Medians for all hardware engineers: Seagate/WDC ~$175k to $183k vs. Marvell $247k, Qualcomm $248k, Nvidia $280k, Apple $350k, Google $341k, Broadcom $475k [SR]. At staff/principal level the gap is **1.5x to 3x**, almost all of it in equity. |
| What changed in 2025-26? | STX rose more than 685% in a year (to about $817 in May 2026, with a 52-week high of $1,145). WDC's 52-week range is $122 to $800. **Unvested RSUs granted in 2023-25 and ESPP shares became worth several times their grant value.** Seagate's FY2026 bonus pool funded at **200%**. FY2026 realized pay for HDD veterans was the best on record. That windfall does not reset base pay or future grant sizes. |

---

## 2. H-1B / LCA salary data (base salary)

### 2.1 Seagate (Seagate US LLC; Ellis.com, 2026 filings, updated Aug 2026) [LCA]

Overall: **median $110,011**, average $114,791, average prevailing wage $103,932.

| Job title | Positions | Min | Median | Max |
|---|---|---|---|---|
| Engineer | 49 | $73,590 | $85,904 | $95,160 |
| Engineer II | 93 | $77,480 | $86,653 | $132,018 |
| Sr. Engineer | 155 | $78,790 | $103,501 | $158,662 |
| Staff Engineer | 81 | $98,613 | $121,222 | $180,003 |
| **Sr. Staff Engineer** | 18 | $133,080 | **$150,665** | $190,148 |
| **Senior Staff Engineer** | 10 | $127,067 | **$154,554** | $200,013 |
| **Principal Engineer** | 6 | $160,722 | **$178,979** | $213,616 |
| Sr. Engineering Manager | 5 | $127,317 | $172,848 | $191,693 |
| Director | 2 | $163,072 | $163,072 | $163,072 |

| Location | Positions | Min | Median | Max |
|---|---|---|---|---|
| Shakopee, MN | 140 | $68,702 | $99,788 | $176,384 |
| Bloomington, MN | 175 | $67,018 | $107,598 | $151,819 |
| Longmont, CO | 118 | $68,058 | $108,410 | $212,638 |
| Fremont, CA | 94 | $86,008 | $130,113 | $213,616 |
| Cupertino, CA | 15 | $104,125 | $128,015 | $175,011 |
| Oklahoma City, OK | 17 | $82,410 | $108,160 | $164,362 |
| Rochester, MN | 3 | $78,104 | $81,328 | $90,293 |

*Note: Ellis's "positions" and "filings" counts don't reconcile (one LCA can cover several positions). Treat the counts as relative weights.*

### 2.2 Western Digital Technologies (Ellis.com, 2026, updated Aug 2026) [LCA]

Overall: **median $126,061**, average $129,556, average prevailing wage $120,062. (These counts include pre-split flash roles; Sandisk was spun off in Feb 2025.)

| Job title (relevant to servo/FW/HW) | Positions | Min | Median | Max |
|---|---|---|---|---|
| Senior Engineer, Firmware Engineering | 714 | $74,880 | $93,330 | $130,000 |
| Senior Engineer, Hardware Development Eng. | 446 | $68,536 | $102,500 | $120,750 |
| Staff Engineer, Hardware Development Eng. | 1,909 | $87,235 | $137,093 | $167,735 |
| Staff Engineer, R&D Engineering | 1,346 | $94,682 | $130,000 | $170,938 |
| Staff Engineer, Systems Design Eng. | 668 | $90,000 | $126,984 | $153,504 |
| Staff Engineer, Firmware Verification | 387 | $106,579 | $135,200 | $155,000 |
| **Principal Engineer, Firmware Engineering** | 914 | $102,655 | **$140,525** | $170,872 |
| **Principal Engineer, Hardware Development** | 632 | $110,000 | **$151,289** | $178,651 |
| **Principal Engineer, R&D Engineering** | 586 | $107,000 | **$141,669** | $186,472 |
| **Technologist, Firmware Engineering** | 528 | $125,236 | **$168,210** | $204,901 |

| Location | Positions | Median | Max |
|---|---|---|---|
| San Jose, CA (HQ, HDD) | 7,583 | $129,324 | $226,158 |
| Fremont, CA | 1,838 | $137,301 | $238,285 |
| Irvine, CA | 3,082 | $120,000 | $216,000 |
| **Longmont, CO** | 338 | **$139,434** | $206,731 |
| **Rochester, MN** | 433 | **$95,035** | $118,000 |
| Colorado Springs, CO | 263 | $112,421 | $142,700 |
| Milpitas, CA (mostly ex-flash) | 18,755 | $124,745 | $300,000 |

**WDC trend, MyVisaJobs average H-1B base [LCA]:** 2020 $147,149, 2021 $135,300, 2022 $145,146, 2023 $138,357, **2024 $140,549**. That is essentially **flat for five years in nominal terms**, which means a real (inflation-adjusted) decline. H-1B petitions fell from 230 in 2022 to 77 in 2025, reflecting the 2023-24 downturn and the spin-off.

**WDC FY2026 to date, VisaVerge (Oct 2025 to Jun 2026) [LCA]:** median **$150,051**, middle 50% $120k to $163k, 10th to 90th percentile $107k to $182k. San Jose median $150,051, Irvine $129,667. Staff Engineer, Firmware Engineering median $129,667. This suggests a **~7 to 10% step-up in FY2026 offers** compared with prior years.

### 2.3 Sandisk Technologies (Ellis.com, 2026) [LCA], flash competitor and WDC spin-off

Overall: **median $139,220**, average $142,979.

| Title | Median | Range |
|---|---|---|
| Senior Engineer, Firmware Verification | $94,162 | $94k to $130k |
| Staff Engineer, Product Development | $132,196 | $124k to $149k |
| Principal Engineer, Product Development | $178,006 | $135k to $186k |
| **Technologist, Firmware Engineering** | **$198,248** | $157k to $216k |
| Principal Engineer, SW Dev (Apps) | $213,512 | $205k to $230k |

A Sandisk Firmware Technologist's median base is **~$30k (18%) higher** than WDC's HDD Firmware Technologist ($168k). Flash and SSD pay more than HDD for comparable firmware seniority.

### 2.4 Other employers (not retrieved)
Toshiba America Electronic Components (Irvine/San Jose), Marvell and Broadcom LCA tables could not be fetched (search budget). Marvell and Broadcom pay is covered via Levels.fyi in section 3. **[EST]** Toshiba America's HDD application and engineering roles have historically filed LCAs in roughly the $110k to $170k band for senior and principal titles, and they run no meaningful US equity program. Verify on h1bdata.info before relying on this.

---

## 3. Levels.fyi total compensation [SR]

### 3.1 HDD companies

**Western Digital, Hardware Engineer (US), 217 submissions, updated Oct 14, 2026. Median TC $183k.**

| Level | Total | Base | Stock/yr | Bonus |
|---|---|---|---|---|
| L1 | $102k | $95.7k | $0.7k | $5.1k |
| L2 | $143k | $134k | $2.3k | $6.9k |
| L3 | $157k | $136k | $6.6k | $14.7k |
| L4 | $176k | $152k | $11k | $13.5k |
| L5 to L7 | up to **$247k** (L7 top of range); highest reported $280k | n/a | n/a | n/a |

**WDC Blind submissions (Jan 2026) [SR]:** company median $155,653, P25 ~$119k, P70 $187k, P90 $250k. Relevant individual data points:

| Role | Level | YOE | Location | TC | Base | Equity | Bonus |
|---|---|---|---|---|---|---|---|
| Technologist | L5 | 18 | San Jose | $290k | $200k | $50k | $40k |
| Technologist | L5 | 20 | SF (remote) | $259k | $214k | $25k | $20k |
| Hardware Engineering | L5 | 7 | San Jose | $244k | $180k | $40k | $24k |
| Principal Systems Engineer | L5 | 10 | Milpitas | $241k | $180k | $25k | $36k |

**Seagate [SR]:**
- Levels.fyi Electrical Engineer (US): typical TC **$184k to $218k**, range $162k to $230k (thin data).
- Software Engineer (US, 42 submissions, Oct 2026): median **$106k**. Staff Engineer TC $179k ($151k base + $27.5k stock). Sr Staff about $190k.
- Seagate's level ladder (Levels.fyi): Engineer I, Engineer II, Sr Engineer, Staff, Sr Staff, Principal, Technologist, Principal Technologist.
- 6figr (99 profiles, Nov 2025): median ~$117k, average $135k, top 10% above $200k, highest $291k. Hardware engineers average $175k.

The Seagate hardware-engineer page on Levels.fyi could not be retrieved. **[EST]** Based on LCA plus Levels data, a Seagate Sr Staff or Principal servo engineer's TC is about **$185k to $260k** in a normal year: base $150k to $200k, bonus 10 to 20% of base, and RSU about $15k to $50k/yr at grant value.

### 3.2 Benchmarks: Hardware Engineer, US (Levels.fyi, Sep to Oct 2026)

| Company | Median TC (all levels) | Data pts | Senior level (TC) | Staff level (TC) | Sr Staff / Principal (TC) |
|---|---|---|---|---|---|
| **Western Digital** | **$183k** | 217 | L3 $157k | L4 $176k | L5-7 ~$200k to $247k |
| **Seagate** | ~$175k [6figr HW avg] | small | Sr Eng ~$117k (SWE) | Staff $179k (SWE) | Sr Staff ~$190k; [EST] Principal $230k to $260k |
| Marvell | $247k | 363 | T2 $149k | T3 $207k | T4 $278k; T6 up to $409k |
| Qualcomm | $248k | 1,897 | Senior $207k | Staff $272k | Sr Staff $355k (P10 to P90 $314k to $420k) |
| AMD | $170k | 1,470 | Senior HW $184k | MTS $230k | SMTS $284k; Fellow up to $711k |
| Lam Research | $232k | 126 | n/a | Level 4 $232k | n/a |
| Applied Materials | n/a | n/a | n/a | HW Eng IV $212k (P10 to P90 $160k to $250k) | n/a |
| KLA (Embedded HW) | $170k | n/a | P2 $151k | P3 $182k | n/a |
| Nvidia | $280k | 1,140 | IC3 $263k | IC4 $326k | IC5+ up to $692k |
| Apple | $350k | 3,056 | ICT3 $260k | ICT4 $353k | ICT5 $479k; ICT6 up to $760k |
| Google | $341k | 749 | L4 $328k | L5 $395k | L6 $538k |
| Broadcom | $475k | 298 | ICB3 $218k | ICB4 $428k | ICB6 $843k (P10 to P90 $450k to $1.07M) |
| Intel | n/a | n/a | n/a | n/a | Grade 11 (Sr Principal) ~$500k (P10 to P90 $379k to $620k) |

*ASML US data was not retrieved. **[EST]** ASML San Diego/Wilton hardware engineers are typically in the KLA and Applied Materials band ($170k to $250k).*

**Component breakdown at the "staff" rung (closest match for 15 YOE, typical of HDD title inflation):**

| Company / level | Base | Stock/yr | Bonus | Total | Equity % of TC |
|---|---|---|---|---|---|
| WDC L4 | $152k | $11k | $13.5k | $176k | 6% |
| Seagate Staff (SWE) | $151k | $27.5k | $0 | $179k | 15% |
| Marvell T4 Sr Staff | $194k | $58.7k | $25.3k | $278k | 21% |
| Qualcomm Sr Staff | $211k | $112k | $32k | $355k | 32% |
| AMD SMTS | $203k | $55k | $26.5k | $284k | 19% |
| Nvidia IC4 | $222k | $100k | $4.5k | $326k | 31% |
| Apple ICT5 | $258k | $180k | $41k | $479k | 38% |
| Google L6 | $243k | $245k | $50k | $538k | 46% |
| Broadcom ICB6 | $198k | $595k | $50k | $843k | 71% |

**Key insight:** HDD **base salaries are within ~20 to 30%** of semiconductor peers. The large gap is **equity**: at grant value, HDD companies grant roughly **one tenth to one quarter of the stock** that Qualcomm, Nvidia, Apple or Google grant at a comparable level.

---

## 4. HDD pay vs. typical hardware or controls engineer (BLS, May 2025) [GOV]

| Occupation (BLS OEWS May 2025) | P10 | P25 | Median | P75 | P90 |
|---|---|---|---|---|---|
| Computer Hardware Engineers (17-2061) | $92,940 | $126,090 | **$161,740** | $202,990 | **$225,330** |
| Electrical Engineers (17-2071) | n/a | n/a | $120,630 (wagedex); May 2024 $111,910 | n/a | n/a |
| Controls engineers (Control Eng. survey 2024) | $74,670 | n/a | mean $114,770 | n/a | $175,460 |

| Hardware engineer median by area (BLS) | Median |
|---|---|
| San Jose-Sunnyvale-Santa Clara | $209,860 |
| San Francisco-Oakland-Fremont | $203,890 |
| California (state) | $185,180 |
| Semiconductor manufacturing industry | $166,150 |
| R&D in engineering sciences industry | $171,820 |

**Where a 15-YOE HDD servo engineer lands:**

| Location | Typical HDD Sr Staff/Principal base | vs. local benchmark |
|---|---|---|
| Fremont/San Jose | $150k to $215k [LCA/POST] | **Below to near** the San Jose metro HW median ($210k), well below Big Tech |
| Longmont, CO | $140k to $200k [LCA] | Above the national HW median, near P75; good value given cost of living |
| Shakopee/Bloomington, MN | $130k to $190k [LCA] | Around the national median to P75; strong value given cost of living |
| Rochester, MN (WDC) | $95k to $120k LCA median/max, all levels | **Below** the national HW median |

BLS figures are wages only (no equity). Senior HDD veterans are typically paid **at about the 70th to 90th percentile of all US computer hardware engineers** on wages, and roughly **at par with controls and electrical engineers in other industries** (automotive, industrial automation, medical devices), whose senior band is about $130k to $175k. HDD servo skill pays **better than general controls engineering**, but **worse than semiconductor and Big Tech hardware** once equity is counted.

**Job-posting reference points [POST]:**

| Posting | Location | Experience | Base range | Incentives |
|---|---|---|---|---|
| WDC Servo Control Engineer (Feb 2025) | San Jose | MS/PhD + 5 yrs servo | **$157,700 to $210,300** | STI bonus, possible LTI RSUs, new-hire RSUs |
| WDC Servo Control Engineer, early career (2026) | San Jose | 0-2 yrs, MS/PhD | $115,200 to $153,600 | STI, possible LTI |
| Seagate HDM Sr Staff Engineer (2026) | Shakopee / Longmont / Fremont | BS+12 / MS+8 / PhD+5 | **$147,035 to $214,316** | Discretionary bonus, ESPP |
| Seagate Servo Architecture Engineer, early career (2026) | Shakopee | MS EE | $74,610 to $106,689 | n/a |

---

## 5. Equity, ESPP and bonus programs, and the 2025-26 stock surge

### 5.1 Program terms

| Program | Seagate (STX) | Western Digital (WDC) |
|---|---|---|
| ESPP discount | **15%** off the lower of the offering-date or purchase-date close (lookback) | **5%** off the lower of the enrollment or purchase-date price |
| ESPP offering | 6-month offering periods (Jan/Jul), 1 to 10% of pay, max 1,000 shares per period | 24-month offering with 6-month purchases, auto-reset if price drops, 1 to 10% of pay |
| Annual bonus | Bonus pool funded on Revenue 40%, Adjusted Operating Margin 40%, Customer Experience 20%. **FY2026 funded at 200%**. Executive bonus paid in 1-yr-vesting RSUs with a 30% premium (cut to 15% in FY2027) | Short-Term Incentive (STI) Plan, performance-based |
| Long-term equity | RSUs for engineers ([EST] typically a 4-year vest; refresh grants are selective). New FY2026 retirement-vesting rule: age 55+, 5+ years of service, Rule of 65 | Annual LTI program of RSUs or cash equivalents, "not all roles eligible"; new-hire RSUs possible |
| Total stock-based comp expense | n/a | FY2023 $212M, FY2024 $202M, **FY2025 $167M** (RSU $151M, ESPP $16M) |

Seagate's ESPP (15% discount plus lookback) is a **meaningfully better benefit** than WDC's (5%). At 10% of a $180k salary, Seagate's ESPP alone yields at least ~$3.2k/yr of guaranteed gain before any price appreciation. In 2025-26 the lookback multiplied that several times over.

### 5.2 Stock surge (prices from StockAnalysis, Tikr)

| Ticker | ~Early-mid 2025 | Peak (52-wk high) | Latest | Notes |
|---|---|---|---|---|
| STX | ~$104 (May 2025, implied) | **$1,145** | **$659.76** (Oct 27, 2026) | More than 685% gain in a year to May 2026; still ~6x early-2025 levels after a ~42% drawdown from the peak |
| WDC | 52-wk low $121.85 | **$799.87** | **$356.13** (Oct 26, 2026) | Down ~55% from peak, still ~3x the 52-wk low |
| SNDK | 52-wk low $37.33 | $1,861 | $1,542.61 (Jun 5, 2026, stale) | Most extreme gain of the three |

### 5.3 Effect on employee TC: illustrative calculation [EST]

Assume a Seagate Principal servo engineer: base $185k, target bonus 15%, a **$40k/yr RSU grant priced at about $100/share** (an early-2025 grant; ~400 shares vesting per year).

| Component | "Grant-value" TC (normal year) | FY2026 realized at ~$650 to $800/share | At today's $660 |
|---|---|---|---|
| Base | $185k | $185k | $185k |
| Bonus (target 15%, 200% funding) | $28k | **$56k** | n/a |
| RSU vest (400 sh) | $40k | **$260k to $320k** | $264k |
| ESPP gain (10% of pay, 15% discount + lookback from ~$100 to $300 base price) | ~$3k | **$30k to $100k+** | variable |
| **Total** | **~$256k** | **~$530k to $660k** | n/a |

**Implications:**
1. FY2025-26 realized pay for HDD veterans who held unvested RSUs or ESPP shares was **temporarily comparable to Nvidia, Apple or Google staff levels**. It came from stock appreciation, not company generosity.
2. **New grants are now priced at $350 to $660+ per share**, so the same dollar grant buys 3 to 6x fewer shares. Future equity upside depends on further appreciation from a much higher base and is exposed to the high volatility shown (STX and WDC fell 42 to 55% from their peaks in a few months).
3. Grant **dollar budgets** at HDD companies remain small (WDC total SBC fell to $167M in FY2025 across ~40k employees, about $4k per head on average). The surge did not structurally raise HDD pay bands. Levels.fyi WDC L4 stock is still only ~$11k/yr.
4. **Retention risk for the companies, and leverage for you:** with stock up 3 to 6x, unvested balances are large "golden handcuffs" for current employees. For an outside hire, a sign-on equity grant must be negotiated in dollars. Levels.fyi notes a median WDC sign-on of ~$30k.

---

## 6. Non-US compensation (brief)

Sourced data was limited (search budget). All figures except the Malaysia row are **[EST]**, based on general market knowledge of HDD sites (Seagate Singapore, Penang and Korat/Teparuk; WDC Penang/Kuala Lumpur and Bangkok/Prachinburi; Toshiba Japan and Philippines). Verify on JobStreet, MyCareersFuture, Glassdoor (local) or OpenWork (Japan).

| Country / site | Senior or Staff engineer (monthly, local) | Principal / Technologist (monthly) | ≈ USD/yr | Source |
|---|---|---|---|---|
| Malaysia (Sandisk, Penang/KL) | Staff Engineer **RM 7.2k to 10k**; Tech Development Eng. RM 6.6k to 10k | Technologist **RM 13k to 19k** | Staff ~$20k to $28k; Technologist ~$37k to $55k (plus bonus 1 to 4 months) | JobStreet [SR/EST] |
| Malaysia (Seagate/WDC Penang, servo/FW) | RM 8k to 13k | RM 14k to 22k | ~$25k to $65k | [EST] |
| Singapore (Seagate R&D/Woodlands) | SGD 7k to 10k | SGD 10k to 15k | ~$75k to $150k (plus AWS 13th month, bonus, small RSUs) | [EST] |
| Thailand (Seagate Korat, WDC Bangkok) | THB 70k to 120k | THB 120k to 220k | ~$25k to $80k | [EST] |
| Japan (Toshiba HDD, Kawasaki/Ome) | JPY 650k to 800k (base) | JPY 800k to 1.0M (base) | ~JPY 9M to 13M/yr including bonus, ~$60k to $90k | [EST] |
| India (Seagate Staff Engineer, Pune) | n/a | n/a | Staff Engineer ₹3.9M TC (₹3.09M base, ₹0.43M stock, ₹0.37M bonus) ≈ $46k | Levels.fyi [SR] |

Asian HDD sites pay roughly **15 to 40% of US levels** in USD. Singapore is the closest to US pay, at roughly 50 to 80% of the Minnesota and Colorado bands. Equity eligibility in Asia is usually limited to senior and principal grades.

---

## 7. Conclusions for a 15-YOE HDD servo/firmware engineer

1. **Your market value inside HDD (US):** base **$150k to $215k**, TC at grant value **$200k to $300k** (Sr Staff, Principal or Technologist). The ceiling is the Technologist or Principal Technologist track (~$200k to $230k base). There is limited upside beyond that without moving into management.
2. **Your value outside HDD:** controls, mechatronics and embedded skill transfers well to semiconductor capital equipment (Lam, AMAT, KLA, ASML motion control and stages: TC ~$210k to $280k), SoC and storage silicon (Marvell, Broadcom, Microchip, Phison), and robotics and EV motion control. At the staff and senior-staff level, TC there is typically **20 to 60% higher** than HDD, and **1.5 to 3x higher** at Apple, Google or Nvidia, all driven by equity.
3. **HDD pay compression is structural.** The 5-year H-1B average at WDC was flat (~$135k to $147k), equity budgets are small, and pay is anchored to lower-cost sites (MN, CO, Asia). The 2025-26 AI-storage boom produced a **stock windfall, not a band reset**. The most reliable signals of real pay improvement are the FY2026 WDC LCA median rising to ~$150k and Seagate's 200% bonus funding, both cyclical.
4. **Best HDD employer on pay terms:** Seagate edges ahead on benefits (15% ESPP with lookback, 200% FY2026 bonus, new retirement-vesting rule) and has higher Principal LCA medians ($179k). WDC has higher base in San Jose and Longmont and a published Technologist track (median $168k). Sandisk (flash) pays ~15 to 20% more than either for firmware technologists.
5. **Negotiation note:** with share prices at $350 to $660, demand grants **denominated in dollars** and ask for a sign-on to offset any unvested equity you forfeit. Over a 3 to 4 year vest, HDD stock volatility (−40 to −55% from peak within months) can cut or multiply realized value.

---

## Sources

**H-1B / LCA**
- Ellis.com, Seagate US LLC salaries (updated Aug 2026): https://www.ellis.com/visa-sponsors/seagate-us-llc/salaries
- Ellis.com, Western Digital Technologies salaries: https://www.ellis.com/visa-sponsors/western-digital-technologies-inc/salaries
- Ellis.com, Sandisk Technologies salaries: https://www.ellis.com/visa-sponsors/sandisk-technologies-inc/salaries
- MyVisaJobs, Western Digital Technologies: https://www.myvisajobs.com/employer/western-digital-technologies/
- VisaVerge, Western Digital FY2026 H-1B: https://www.visaverge.com/h1b-sponsors/western-digital-technologies/

**Levels.fyi / Blind / 6figr (self-reported)**
- WDC Hardware Engineer: https://www.levels.fyi/en-gb/companies/western-digital/salaries/hardware-engineer ; L2: https://www.levels.fyi/companies/western-digital/salaries/hardware-engineer/levels/l2 ; L3: https://www.levels.fyi/hi-in/companies/western-digital/salaries/hardware-engineer/levels/l3
- Blind, Western Digital US salaries: https://www.teamblind.com/company/Western-Digital/salaries/united-states
- Seagate Software Engineer: https://www.levels.fyi/companies/seagate/salaries/software-engineer ; Electrical Engineer: https://www.levels.fyi/fil-ph/companies/seagate/salaries/electrical-engineer ; Levels and India: https://www.levels.fyi/companies/seagate/salaries/software-engineer/levels/staff-engineer/locations/india
- 6figr, Seagate: https://6figr.com/us/salary/seagate
- Marvell: https://www.levels.fyi/en-gb/companies/marvell/salaries/hardware-engineer ; Embedded: https://www.levels.fyi/companies/marvell/salaries/hardware-engineer/title/embedded-engineer
- Broadcom: https://www.levels.fyi/companies/broadcom/salaries/hardware-engineer ; ICB6: https://www.levels.fyi/en-gb/companies/broadcom/salaries/hardware-engineer/levels/icb-6/locations/united-states
- Nvidia: https://www.levels.fyi/companies/nvidia/salaries/hardware-engineer ; IC4: https://www.levels.fyi/companies/nvidia/salaries/hardware-engineer/levels/ic4/locations/united-states.md
- Apple: https://levels.fyi/companies/apple/salaries/hardware-engineer
- Google: https://www.levels.fyi/es-ar/companies/google/salaries/hardware-engineer
- Qualcomm: https://www.levels.fyi/companies/qualcomm/salaries/hardware-engineer ; Sr Staff: https://www.levels.fyi/da-dk/companies/qualcomm/salaries/hardware-engineer/levels/senior-staff-hardware-engineer
- AMD: https://www.levels.fyi/companies/amd/salaries/hardware-engineer
- Intel Grade 11: https://www.levels.fyi/companies/intel/salaries/hardware-engineer/levels/grade-11
- Lam Research: https://www.levels.fyi/companies/lam-research/salaries/hardware-engineer
- Applied Materials HW IV: https://www.levels.fyi/en-gb/companies/applied-materials/salaries/hardware-engineer/levels/hardware-engineer-iv
- KLA Embedded: https://www.levels.fyi/en-gb/companies/kla/salaries/hardware-engineer/title/embedded-engineer

**Job postings**
- WDC Servo Control Engineer (San Jose, 5+ yrs): https://jobs.smartrecruiters.com/WesternDigital/744000035258247
- WDC Servo Control Engineer (early career): https://wellfound.com/jobs/4694246-servo-control-engineer
- Seagate HDM Sr Staff Engineer: https://wellfound.com/jobs/4763117-hdm-sr-staff-engineer
- Seagate Servo Architecture Engineer (early career): https://www.monster.co.th/job/servo-architecture-engineer-early-career-lacie-seagate-thailand-49484374

**Government / benchmarks**
- BLS OOH, Computer Hardware Engineers: https://www.bls.gov/ooh/architecture-and-engineering/computer-hardware-engineers.htm
- Wagedex (BLS OEWS May 2025 percentiles and metros): https://wagedex.com/jobs/computer-hardware-engineers
- Controls engineer salary guide (BLS May 2024 and Control Engineering survey): https://resumegeni.com/blog/controls-engineer-salary-guide

**Equity, ESPP, bonus, stock**
- Seagate ESPP: https://benefits.seagate.com/financial/employee-stock-purchase-plan
- WDC ESPP: https://usbenefits.wdc.com/employee-stock-purchase-plan
- WDC 10-K SBC note (FY2025): https://www.sec.gov/Archives/edgar/data/106040/000010604025000038/R21.htm
- Seagate DEF 14A FY2025: https://www.sec.gov/Archives/edgar/data/1137789/000113778925000211/stx-20250909.htm
- Panabee, Seagate exec comp 2026 (AI-generated summary of the proxy; verify against the DEF 14A): https://www.panabee.com/news/seagate-executive-compensation-2026
- AFL-CIO Paywatch, STX: https://aflcio.org/paywatch/STX
- StockAnalysis STX: https://stockanalysis.com/stocks/stx ; WDC: https://stockanalysis.com/stocks/wdc ; SNDK: https://stockanalysis.com/stocks/sndk
- Tikr, "Seagate stock surged 685%" (May 14, 2026): https://www.tikr.com/blog/seagate-stock-surged-685-in-one-year-on-ai-storage-demand-is-it-still-worth-buying

**Non-US**
- JobStreet Malaysia, Sandisk engineering salaries: https://my.jobstreet.com/companies/sandisk-174185706023469/salaries/engineering
