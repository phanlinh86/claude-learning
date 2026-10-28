# 01 — Factory Automation: Macro Drivers & Market Financials

*As of 28 October 2026. Prepared for a senior corporate-strategy professional choosing a long-term employer.*

*Research input for a career decision. Not financial or investment advice.*

**Labels:** [R] = reported by company / research firm; [D] = derived (my arithmetic on reported data); [EST] = analyst estimate (mine, or a figure not re-verified this run). Currency as reported.

**Scope:** PLCs/DCS, motion control & drives (servo, VFD), industrial robots incl. cobots, sensors & machine vision, industrial software (MES, SCADA, PLM/simulation, digital twin, industrial AI).

---

## Executive summary

1. **The 2023–25 destocking downturn is over. 2026 is a strong cyclical upswing, stronger than consensus expected in January.** The J.P.Morgan Global Manufacturing PMI hit **53.0 in Sep-2026**, a 55-month high and the 14th straight month above 50 [R]. Leaders' orders are surging: Fanuc Q2 FY26 orders were **+49% YoY** (FA +130%) [R], ABB Q3-26 orders **+40% comparable** [R], Siemens Group orders +14% with DI orders +9% [R], and Rockwell raised FY26 organic guidance to **7.5–9.5%** [R].
2. **The new demand engine is AI infrastructure, not classic factories.** Data centers, semiconductors, power and electrical equipment drive the upturn, and every leader cites them. Classic discrete demand (auto, machine tools, Europe) recovers more slowly. US factory construction is **down ~21% from its Jun-2024 peak** [R], so the "reshoring boom" is mostly a story of modernizing existing plants (brownfield), not building new ones (greenfield).
3. **Robots set a record in 2025:** **>600k installations (+11%)**, operational stock **5.0M** [R]. China alone took **354k (59%)** [R], while Japan fell 19% and Germany 8% [R]. IFR forecasts **655k in 2026 and 806k in 2029** [R].
4. **Margins are back to or above pre-downturn levels:** Keyence **54%** (Q1 FY26) [R], Fanuc **26%** (Q2) [R], Rockwell segment margin **~24%** (Q3) [D], ABB **20.8%** [R], Siemens DI **18.7%** [R]. Yaskawa (~9%) [D] shows how commoditized robot/motion players earn far less.
5. **Market size:** core factory-automation hardware + software is **~US$215bn in 2025** [EST]. My base case is **~6.5% CAGR from 2026 to 2031, reaching ~US$315bn** (bull $354bn, bear $267bn) [EST]. Software, vision and robotics grow fastest. PLC and drives grow GDP+.
6. **Structural risks:** Chinese vendors are taking share at home (55–57% of robots [R]; Inovance and peers in PLC and servo), with price deflation spreading to SE Asia. Tariff and trade fragmentation persist. Another cyclical air-pocket around 2028–29 is likely after the AI-capex wave, given that the current upcycle is partly restocking.

---

## PART 1 — Macro drivers and impact

### 1.1 Manufacturing cycle and PMI, 2023–2026

| Period | Global Mfg PMI (J.P.Morgan/S&P) | Notes |
|---|---|---|
| 2023 – mid-2024 | mostly ≤50 [EST, not re-verified] | Post-COVID overbuild; distributors and OEMs destock automation parts |
| Sep 2025 | **50.8** [R] | 14-month high in Aug-25 (50.9); US and China output PMIs 52.4 / 52.0 [R]; Japan contracting [R] |
| Jan 2026 | **50.9** [R] | 6th month >50; Eurozone returns to growth; US best since Apr-2022 [R] |
| Aug 2026 | **52.3** [R] | |
| Sep 2026 | **53.0** [R] | **55-month high**; 14 consecutive months >50; China one of its strongest readings since COVID; Japan's growth the largest in about 12 years; price pressure re-accelerating on supply disruption, transport and energy costs [R] |

*Gap:* country PMI levels for Germany and Japan in Sep-2026 were not retrieved. Germany is qualitatively the laggard (see the robot data below).

**Read-across:** a 53 PMI with rising prices is a late-recovery, mid-cycle signal. It typically supports another 12–18 months of automation order growth. The risk is that sticky input prices force rates to stay higher.

### 1.2 Destocking (2023–25) and recovery timing

- **Downturn depth.** Interact Analysis says the motion-control market fell **−6.5% in 2024 and −2.0% in 2025** to **$14.6bn**, with 2026 forecast at **+3.9%**, "the first year of positive growth since 2023" [R]. In 2025, EMEA fell −7.5%, Japan −1.8%, Americas −1.0% and APAC ex-Japan rose +1.9% [R].
- **Siemens DI** (the bellwether for short-cycle factory automation):
  - FY2025 (Oct-24–Sep-25) revenue fell **−4%** to €17.8bn, and margin dropped to **14.9%** from 18.9% [R].
  - Orders rose **+8%** to €18.4bn, so book-to-bill went above 1 [R/D].
  - Q4 FY25 orders jumped **+29% comparable**, "led by short-cycle factory automation from a low base", with strong growth contributions from China [R]. Siemens also took €224m of severance in Q4 for automation capacity cuts [R].
- **Roland Berger (Jan-2026).** "Destocking in 2025 went further than expected." It expected 2026 to be the first year of renewed growth, growing slightly in 2026 and more strongly afterwards, with a realistic 6–7% CAGR to 2030 and up to 9% with catch-up investment [R].
- **What actually happened in 2026 beat that view.**

| Company (period) | Orders | Revenue / sales | Margin | Guidance / drivers |
|---|---|---|---|---|
| Siemens DI (Q3 FY26, Apr–Jun) | €4.9bn, **+9%** [R] | €4.9bn, **+10%** [R] | **18.7%** vs 14.5% [R] | Software revenue +15% to €1.8bn; ARR €5.7bn (+11%) [R]. FY26 DI guide: revenue +5–10%, margin 15–19% [R] |
| Rockwell (Q3 FY26, Apr–Jun) | not reported | **+10% organic** [R] | Software & Control 34.8% [R]; total segment ~23.8% [D] | FY26 organic guide raised to **7.5–9.5%**; drivers "semiconductor, data center, warehouse automation", auto and life sciences improving [R] |
| ABB (Q3-26, Jul–Sep) | $12.06bn, **+40% comparable**, a record [R] | $9.7bn, +14% [R] | Op EBITA **20.8%** [R] | Data-center orders up triple digits [R]. *Note: the +40% figure comes from a secondary news source; check it against ABB's release* |
| Fanuc (Q2 FY26, Jul–Sep) | ¥306bn, **+49%** [R] | ¥242.7bn, +14.9% [R] | **26.0%** [R] | FA orders +130%, Robomachine +72%, Robots +12.6% [R]. China orders +80%, Asia ex-China +112%, Europe +5% [R]. FY guide raised to ¥1.01tn sales (+18%), 23.7% margin. Drivers: AI data centers, semis, **humanoid-robot parts**, NEV [R] |
| Yaskawa (FY25, Mar-25–Feb-26) | n/d | ¥542bn, +0.8% [R] | ~8.7% [D] | FY26 guide ¥580bn (+7%), OP +27% "driven by AI- and semiconductor-related" orders [R] |
| Keyence (Q1 FY26, Apr–Jun) | — | ¥346.6bn, **+32.8%** [R] | **54.0%** [R] | FY25 (to Mar-26): ~¥1.17tn sales, ~51% margin [D] |

**Conclusion:** the recovery started in **Q4 2025 in orders**, reached **revenue in H1 2026**, and is broadening in H2 2026. It is led by Asia (China and Asia ex-China) and the US, with AI/semiconductor/electrical as its core. **Europe and Germany still lag**: Fanuc Europe orders were only +5% and German robot installs fell −8% in 2025.

### 1.3 Structural drivers, ranked by impact on factory-automation revenue to 2031

| # | Driver | Evidence | Impact | Durability |
|---|---|---|---|---|
| 1 | **AI / data-center build-out and the electrical/power and semiconductor chain** | US data-center construction rose from ~$9.5bn annualized (Jan-2020) to **$47bn (Jan-2026)**, +31% YoY [R]. Hyperscaler capex was **>$410bn in 2025** vs $200bn in 2024 [R]. US utility capex is ~$1.3tn for 2026–30 (S&P, cited by IoT Analytics) [R]. Fanuc, Yaskawa, Rockwell and ABB all name AI/semis as the #1 order driver [R]. | High: pulls through drives, motion and robots for electrical-equipment, server, cooling and semiconductor-tool makers | Medium-high to ~2028; capex digestion risk after that |
| 2 | **Labor scarcity and aging** (Japan, Korea, China, Germany, US) | China's 2025 robot installs rose +20% to 354k even with weak demand from its own factories [R]. India robot installs grew at a 27% CAGR over 2020–25 [R] | High, secular | Very durable (demographics) |
| 3 | **Reshoring / nearshoring / "China+1"** | Total US manufacturing construction is **−21% from its $239bn peak (Jun-2024)**; electronics/semi construction is −44% [R]. Excluding CE&E it is +5.6% (Feb-25→Mar-26) [R]. Kearney Reshoring Index improved from −115 to −86 but is still negative [R]. Mexico robot installs fell for a 3rd straight year (<5.2k, −7%) [R]. US robot installs rose +12% to 38.5k, now #2 globally [R] | Medium. The greenfield wave of 2022–24 has passed. Now brownfield automation plus India and SE Asia | Durable, but slower than the political narrative suggests |
| 4 | **Software-defined automation and industrial AI** (digital twin, PLM, simulation, AI copilots) | Siemens DI software +15%, ARR €5.7bn +11% [R]. Rockwell Software & Control +18% organic, 34.8% margin [R] | High for profit pools: drives the mix toward recurring, high-margin revenue | Durable |
| 5 | **Physical AI / humanoids** | ~13–14k humanoids shipped in 2025, >80% by Chinese firms [R]. Morgan Stanley forecasts 50k in China in 2026 and **446k by 2030**; global market ~$3bn (2025) → $28bn (2030) [R] | Low today; a component pull-through (servos, reducers, sensors) is already visible in Fanuc's FA orders [R] | Option value; large but uncertain post-2028 |
| 6 | **Energy transition** (grid, renewables, batteries) | PV inverter and grid demand cited by Yaskawa [R]. Power construction growth rose from ~1% to ~6% in 2025 [R] | Medium | Durable, policy-sensitive |
| 7 | **EVs** | Chinese NEV investment is still a driver (Fanuc) [R]. Brazil auto robot installs +212%, linked to Chinese automakers [R]. Western EV capex has slowed: Roland Berger says auto "remains tough" [R] | Mixed: negative in the West, positive in China and emerging markets | Volatile |

### 1.4 Headwinds

- **US–China trade war and tariffs.** Tariffs push some reshoring but raise input costs, and the 2026 PMI shows prices re-accelerating [R]. US manufacturing jobs are −1% since the Apr-2025 tariffs [R]. Supply chains are fragmenting, so vendors duplicate footprints, which raises opex. *Gap: Section 232 actions on robotics/machinery were not verified this run.*
- **China overcapacity and price competition.**
  - Chinese suppliers held **57% (2024) → 55% (2025)** of China's robot market [R].
  - Chinese vendors (Inovance, Estun, Efort, etc.) dominate low/mid-end servo and small PLC. They are price-led, which compresses margins at Japanese mid-tier players: Yaskawa runs ~9% vs Fanuc's 24% [D].
  - The real risk is export expansion into SE Asia, India, LatAm and Europe.
  - *ARC's 2026 note ("rising revenue but thin profit margins in China") could not be read this run.*
- **German and European industrial weakness.** German robot installs fell −8% to <25k [R]; Italy −11%, France −8%, Spain −15% [R]. Interact puts EMEA motion at −7.5% in 2025 [R]. Siemens DI and the European mid-caps (Festo, Beckhoff, SEW, KUKA) carry the most exposure.
- **EV slowdown in the West.** It hit 2024–25 robot orders in the US and EU. Japan's −19% robot installs in 2025 also reflects weak auto and electronics demand [R].
- **Interest rates and inflation.** PMI price indices are at multi-year highs [R]. Stickier inflation means higher-for-longer rates, which weighs on greenfield projects and SME machine builders.
- **Cyclical concentration.** A large share of current growth rests on AI capex. A hyperscaler pause, as in 2027–28 bear scenarios, would hit semi/electrical OEM automation orders quickly.

### 1.5 IFR World Robotics: industrial robot installations

| Year | Global installs | YoY | Notes |
|---|---|---|---|
| 2018 | ~422k [EST, prior IFR] | | |
| 2019 | ~391k [EST, prior IFR] | | |
| 2020 | ~394k [EST, prior IFR] | | |
| 2021 | ~517k [EST, prior IFR] | | |
| 2022 | **~553k** [D: 2024 was "2% below the all-time high two years earlier"] | | record at the time |
| 2023 | ~541k [EST, prior IFR] | | |
| 2024 | **542k** [R] | ~0% | China 295k (54%); stock 4.66M (+9%) [R] |
| 2025 | **>600k** [R] | **+11%** [R] | China **354k (59%)**, +20%; stock **5.0M** (+9%) [R] |
| 2026F | **655k** [R, IFR forecast] | +9% | |
| 2029F | **806k** [R, IFR forecast] | ~7% CAGR 2026–29 [D] | Interact Analysis: >760k annual shipments by 2030 [R, headline] |

*Note: 2018–2021 and 2023 values come from earlier IFR releases and were not re-fetched this run. Verify before printing.*

**2025 by country:**

| Rank | Country | Installs | YoY |
|---|---|---|---|
| 1 | China | 354k | +20% |
| 2 | US | ~38.5k | +12% |
| 3 | Japan | 36.2k | −19% |
| 4 | Korea | 30.0k | −1% |
| 5 | Germany | <25k | −8% (41% of the EU) |
| 6 | India | ~10.5k | +15% |

Other markets [R]:
- Brazil ~4.3k (+38%)
- Mexico <5.2k (−7%)
- Canada ~4.0k (+5%)
- Italy ~7.8k (−11%)
- France ~4.5k (−8%)
- Spain ~4.3k (−15%)

**Chinese suppliers** installed 195k units at home (+15%), a 55% domestic share [R].

**Implication:** the robot unit market is now structurally China-centric, and China's market is majority-domestic. Western and Japanese robot OEMs grow mainly through the Americas, India and SE Asia, and through high-end segments such as semi/cleanroom, large payload and software.

---

## PART 2 — Market financials

### 2.1 Market size by segment: why sources disagree

| Segment | Size | Forecast | Source | Definition notes |
|---|---|---|---|---|
| **Industrial control & factory automation (broad)** | $255.9bn (2024) [R] | $399.1bn (2029), 9.3% CAGR [R] | MarketsandMarkets (Jan-2025) | Very broad: includes SCADA, DCS, HMI, MES, PAM, WMS, robotics, 3D printing, CNC, process analyzers, flow meters, predictive maintenance, safety |
| **Industrial automation** | $169.8bn (2025) [R] | $443.5bn (2035), 9.1% CAGR [R] | ResearchAndMarkets (Jun-2025) | Hardware + software + services; DCS, HMI, robots, MV, MES, PLC, SCADA |
| **Motion control** (servo motors, drives, motion controllers) | **$14.6bn (2025)**, −2.0% [R] | +3.9% (2026); ~4–5%/yr after [R] | Interact Analysis (Mar-2026) | Narrow, vendor-revenue based; excludes general-purpose LV drives (VFDs) |
| **Machine vision** | **$5.9bn (2025)** [R] | **$8.3bn (2030)**, 7.2% CAGR [R] | Interact Analysis (May-2026) | Vendor-revenue basis for products |
| Machine vision cameras | $6.73bn (2025) [R] | $10.19bn (2030) [R] | MarketsandMarkets | Camera-only, yet larger than Interact's whole-MV figure, which shows how much definitions differ |
| **Industrial robots** (units) | >600k units (2025) [R] | 806k (2029) [R] | IFR | Units, not value. Robot-only value is ~$18–20bn [EST]; with systems/integration it is ~3x [EST] |
| Intelligent robotics (incl. service/cobot) | $14.0bn (2025) [R] | $50.3bn (2030), 29.2% [R] | MarketsandMarkets | Hype-weighted definition |
| Humanoids | ~$3bn global (2025) [R] | $28bn (2030) [R] | Morgan Stanley | |
| **Automation total CAGR** (corridor) | — | 6–7% realistic; up to 9% to 2030 [R] | Roland Berger (Jan-2026) | Consultant view of vendor revenue |

**Why the numbers differ:**
1. **Scope.** Reports differ on including process instrumentation, DCS, building automation, 3D printing, WMS and services/integration. These items can double the total.
2. **Value basis.** Vendor revenue (Interact, ARC) differs from end-user spend including integration (many syndicated reports).
3. **Base-year inflation.** Retail syndicated reports (Mordor, Grand View, MarketsandMarkets, ResearchAndMarkets) often extrapolate generic ~9% CAGRs. Specialist trackers (Interact, IFR, ARC) report actual vendor shipments, which fell in 2024–25 (motion −6.5% / −2.0%).

**Weighting:** use specialist trackers for levels and cyclicality, and syndicated reports only as a ceiling.

**My synthesis: 2025 core factory automation, hardware + software, vendor revenue** [all EST unless noted]

| Segment | 2025 (US$bn) | 2025–31 CAGR (base) |
|---|---|---|
| PLC / PAC / I-O / HMI / safety | ~22 | 4–5% |
| DCS + SCADA (incl. hybrid process) | ~28 | 4–5% |
| Motion control (servo / motion) | 14.6 [R, Interact] | 4–5% |
| LV/MV drives (VFD) | ~22 | 5–6% (data-center and HVAC pull) |
| Industrial robots incl. cobots (robot units + controllers) | ~20 | 7–9% |
| Sensors (position, process, safety) + machine vision | ~32 (MV 5.9 [R]) | 6–7% |
| Industrial software (MES/MOM, PLM/sim/digital twin, SCADA software, industrial AI) | ~60 | 9–11% |
| Industrial networking / edge / misc | ~17 | 6% |
| **Total core FA** | **~215** | **~6.5%** |

### 2.2 Growth by region (2025 actuals → 2026–31 view)

| Region | 2025 | 2026 | 2026–31 base CAGR [EST] | Comment |
|---|---|---|---|---|
| China (~35% of FA demand [EST]) | Robots +20% [R]; motion APAC ex-Japan +1.9% [R] | Strong: Fanuc China orders +80% [R] | 6–7%, with heavy price deflation, so value grows slower than units; the foreign-vendor addressable market shrinks | Volume engine, profit trap for Western/Japanese vendors |
| US / Americas | Robots +12% [R]; motion −1% [R] | Rockwell +10% organic [R] | 6–7% | AI/electrical/semi, warehouse, life sciences; greenfield muted |
| Europe / Germany | Robots −8% (DE) [R]; motion EMEA −7.5% [R] | Gradual recovery (Fanuc Europe orders +5%) [R] | 3–4% | Structural cost and energy issues; defense automation a small upside [R, Roland Berger] |
| Japan | Robots −19% [R] | Fanuc Japan orders +54% [R] | 3–4% | Exports of capital goods matter more than the domestic market |
| India | Robots +15%, 27% CAGR 2020–25 [R] | Strong (Fanuc) [R] | 12–15% | Fastest growth, from a small base |
| SE Asia (Vietnam, Thailand) | ASEAN PMI strongest since 2023 (Jan-26) [R] | Thailand the strongest production growth (Sep-26) [R] | 8–10% | China+1 electronics; price-sensitive, open to Chinese vendors |

### 2.3 Profitability of leaders (industry proxy) and the downturn's effect

| Company | Pre-downturn / peak | Trough (2024–25) | Latest (2026) | Comment |
|---|---|---|---|---|
| Keyence | ~51–55% OPM [EST hist.] | ~51% FY25 [D] | **54.0%** Q1 FY26 [R] | Sensors/vision; direct-sales model; barely dented |
| Fanuc | ~25–27% [EST hist.] | ~21% (implied FY25: FY26 guide is +2.3pts to 23.7%) [D] | **26.0%** Q2 FY26 [R] | CNC/FA franchise; highly cyclical orders but resilient margin |
| Rockwell | Segment ~21–22% (FY22–23) [EST] | 19.3% FY24 → 20.4% FY25 [R] | **~23.8%** Q3 FY26 [D] | FY25 sales only +1%; cost-out plus Software & Control (29.7% → 34.8%) [R] |
| Siemens DI | **18.9%** FY24 (after FY23 peak ~21–22% [EST]) [R] | **14.9%** FY25 (revenue −4%, severance) [R] | **18.7%** Q3 FY26 [R] | Software mix (Altair, Dotmatics) dilutes near term via PPA/integration |
| ABB (group) | ~18–19% [EST] | — | **20.8%** Q3-26 [R] | Electrification/data-center led; Robotics being divested to SoftBank (announced Oct-2025) [EST, not re-verified this run] |
| Yaskawa | ~10–11% [EST] | ~8.7% FY25 [D] | Guide ~10.3% FY26 [D] | Commoditized motion/robots; China price pressure |

**Takeaways:**
- **In revenue, the 2023–25 downturn was a −5% to −10% event** (Siemens DI −4% in FY25 after a weaker FY24; motion −8% cumulative [D]). **In margin it cost 3–5 points** at the hardware-heavy leaders.
- **High-mix software and proprietary franchises** (Keyence, Rockwell Software & Control, Fanuc CNC) protected margins.
- **Industry profitability is healthy and bifurcated:**
  - Top quartile earns 20–55% operating margins.
  - Commoditized motion and robotics earn 8–12%.
  - Chinese competitors earn thinner margins still.
  - For a strategy career this matters: the profit pool favors software, sensing/vision and platform control franchises over unit hardware.

### 2.4 Forecast: factory-automation hardware + software revenue, 2026→2031 [EST]

Base year: **2025 ≈ US$215bn** (core FA, vendor revenue; see the 2.1 synthesis).

| Scenario | 2026 | 2026–31 CAGR | 2031 | Narrative | Probability |
|---|---|---|---|---|---|
| **Bull** | $232bn (+8%) | **9%** | **~$354bn** | AI/electrical capex stays high to 2030, the humanoid/physical-AI component market reaches >$25bn, India and SE Asia hit 15%, and software/AI grows at 12%+ | 25% |
| **Base** | $230bn (+7%) | **6.5%** | **~$315bn** | 2026–27 upcycle, a mild 2028–29 digestion (flat to −3%), then recovery. Software outgrows hardware 2:1. China value growth is muted by price deflation | 50% |
| **Bear** | $228bn (+6%) | **3%** | **~$267bn** | AI-capex pause in 2028 plus a tariff escalation produce a 2023–25-style destock (−8% to −10% over two years). Chinese vendors take 5–10 pts of share in non-China Asia and Europe, deflating prices | 25% |

[D] Base-case math: 230 × 1.065^5 = 315; bull 230 × 1.09^5 = 354; bear 230 × 1.03^5 = 267.

Probability-weighted 2031 ≈ **$313bn** [D], a 2025–31 CAGR of ≈ **6.5%** [D]. That sits inside Roland Berger's 6–7% corridor, below the syndicated 9%, and above Interact's 4–5% for motion alone.

### 2.5 Opportunities and risks, 2026–2031

| Opportunity | Likelihood | Size / impact |
|---|---|---|
| AI data-center / electrical / semiconductor equipment automation | High (80%) through 2027; Medium afterwards | Largest incremental growth source; benefits drives, motion, robots, electrical |
| Software-defined automation, digital twin, industrial AI copilots (recurring revenue, ARR) | High (75%) | Expands margins; Siemens and Rockwell ARR growing 6–11% [R] |
| India and SE Asia manufacturing build-out | High (70%) | Double-digit regional growth, though price-sensitive |
| Physical AI / humanoid components (actuators, reducers, sensors, vision) | Medium (50%) for material scale by 2030 | Morgan Stanley $28bn humanoid market by 2030 [R]; component suppliers benefit before system makers |
| Brownfield modernization (installed base of legacy PLC/DCS, cybersecurity) | High (80%) | Steady services and software pull-through |
| Defense / aerospace automation (Europe, US) | Medium (50%) | Niche today [R, Roland Berger] |

| Risk | Likelihood | Impact |
|---|---|---|
| Cyclical downturn / restocking unwind around 2028–29 (the current surge includes inventory rebuild; Fanuc +49% orders vs +15% sales) | **Medium-high (55%)** | −5% to −10% revenue, −3 to −5 pts margin (2023–25 analog) |
| AI-capex digestion (hyperscaler cutback) | Medium (40%) | Hits the hottest current segments first |
| Chinese vendor exports eroding share and price outside China | **High (65%)** | Structural margin pressure for mid-tier Japanese and European hardware |
| Tariff escalation / supply-chain bifurcation | Medium-high (60%) | Duplicated footprints raise opex; mixed demand effect |
| European deindustrialization (energy, autos) | Medium (50%) | Low growth for EU-centric vendors |
| Inflation / rates stay high (PMI prices at multi-year highs) | Medium (45%) | Delays greenfield and SME capex |
| Humanoid hype deflates | Medium (40%) | Limited core impact; valuation risk for robot pure-plays |

---

## Data gaps and caveats

- IFR 2018–2021 and 2023 installation figures are from prior releases and were not re-verified this run.
- ABB's +40% Q3-26 order growth comes from a secondary news summary. Its business-area split and the status of the robotics sale to SoftBank were not confirmed.
- Siemens Q4 FY26 and Rockwell Q4 FY26 results are not yet published (due in November 2026).
- Germany and Japan PMI levels for Sep-2026 were not retrieved.
- ARC's China-margin note could not be fetched.
- Segment sizes for PLC, DCS, drives, sensors and software in the §2.1 synthesis are my estimates, triangulated from leader revenues and syndicated totals. Treat them as ±20%.

---

## Sources

- IFR World Robotics 2026 press release, "Five Million Robots now Operate in Factories Globally" (24 Sep 2026): https://ifr.org/ifr-press-releases/news/five-million-robots-now-operate-in-factories-globally
- IFR World Robotics 2026 press PDFs (USA, China, EU): https://ifr.org/downloads/press_docs/EN-2026-SEP-24-IFR_Press_Release_WR-USA.pdf ; https://ifr.org/downloads/press_docs/EN-2026-SEP-24-IFR_Press_Release_WR-CHINA.pdf ; https://ifr.org/downloads/press_docs/EN-2026-SEP-14-IFR_Press_Release_WR-EU-27.pdf
- IFR World Robotics 2025 press release (Sep 2025): https://ifr.org/ifr-press-releases/news/global-robot-demand-in-factories-doubles-over-10-years
- Siemens Q4 FY2025 earnings release (Nov 2025): https://assets.new.siemens.com/siemens/assets/api/uuid:3948cdd4-35e0-4c1d-8412-9aed4097b3d0/HQCOPR202511117277EN.pdf
- CIMdata summary of Siemens Q4 FY2025: https://www.cimdata.com/de/industry-summary-articles/item/28853-siemens-earnings-release-and-financial-results-q4-fy-2025-record-results-for-fiscal-2025
- Siemens Q3 FY2026 earnings release (Aug 2026): https://assets.new.siemens.com/siemens/assets/api/uuid:84d1a90b-542e-4775-a907-06f29940eb71/HQCOPR202608037434EN.pdf
- Rockwell Automation FY2025 results (Nov 2025): https://www.businesswire.com/news/home/20251106761417/en/Rockwell-Automation-Reports-Fourth-Quarter-and-Full-Year-2025-Results-Introduces-Fiscal-2026-Guidance/
- Rockwell Automation Q3 FY2026 results (Aug 2026): https://www.rockwellautomation.com/en-au/company/news/press-releases/Rockwell-Automation-Reports-Third-Quarter-2026-Results.html
- ABB Q3 2026 (news summary, 20 Oct 2026): https://www.bluewin.ch/en/news/abb-sees-a-massive-increase-in-orders-in-the-third-quarter-li.3641751
- Fanuc H1 FY2026 earnings presentation (23 Oct 2026, via 2Slides): https://2slides.com/de/gallery/fanuc-h1-fy2026-earnings-presentation
- Keyence financial results, July 2026: https://www.keyence.co.jp/pdf/FinancialResults_202607_en.pdf
- Yaskawa FY2025 results (Apr 2026): https://www.yaskawa-global.com/wp-content/uploads/2026/04/20260410_en.pdf
- J.P.Morgan Global Manufacturing PMI, Sep 2026 (via Australian Manufacturing, 5 Oct 2026): https://www.australianmanufacturing.com.au/?p=196398
- J.P.Morgan Global Manufacturing PMI, Jan 2026 (S&P Global): https://www.pmi.spglobal.com/Public/Home/PressRelease/4a531e3974374ccbae5fb3f2c749a118
- J.P.Morgan Global Manufacturing PMI, Sep 2025: https://www.australianmanufacturing.com.au/?p=188680
- Roland Berger, "Industrial automation update 2026" (Jan 2026): https://www.rolandberger.com/en/Insights/Publications/Industrial-automation-update-2026.html
- Interact Analysis motion-control market (Mar 2026, via automation.com): https://www.automation.com/article/motion-controls-market-grow-2026
- Interact Analysis machine-vision forecast (May 2026): https://interact-analysis.prezly.com/machine-vision-industry-forecast-to-reach-83bn-in-2030.json
- Interact Analysis robot shipments >760k by 2030 (headline only; page not readable): https://www.automation.com/article/annual-industrial-robot-shipments-reach-more-than-760k-units-2030
- MarketsandMarkets industrial automation / industrial control & factory automation: https://www.marketsandmarkets.com/Market-Reports/industrial-automation-market-129369486.html
- MarketsandMarkets machine-vision camera market: https://www.bisinfotech.com/machine-vision-camera-market-set-to-grow-from-usd-6-73-billion-in-2025-to-usd-10-19-billion-by-2030-marketsandmarkets/
- ResearchAndMarkets industrial automation market (Jun 2025): https://www.businesswire.com/news/home/20250618310982/en
- IoT Analytics, "US manufacturing reshoring boom: what the data says" (May 2026): https://iot-analytics.com/us-manufacturing-reshoring-boom-what-the-data-says/
- MarketScale, "The reshoring boom that wasn't" (Jun/Sep 2026): https://www.marketscale.com/industries/engineering-and-construction/the-reshoring-boom-that-wasnt-us-factory-construction-keeps-falling-despite-tariff-push
- The Next Web, Morgan Stanley China humanoid forecast (Jun 2026): https://thenextweb.com/news/china-humanoid-robot-forecast-morgan-stanley-50000
- ARC Advisory, China automation margins 2026 (not readable this run): https://www.arcweb.com/node/164065
