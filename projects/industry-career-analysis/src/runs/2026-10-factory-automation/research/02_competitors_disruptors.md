# 02 — Competitive Threats, Substitutes & Disruptors: Factory Automation

*As of 28 Oct 2026. Labels: **[R]** reported by a source, **[D]** derived by this analyst from reported data, **[EST]** analyst estimate/judgement. FX assumption for [D] conversions: CNY 7.2 / USD. Search budget: ~20 searches used. Where items could not be re-verified this run they are flagged **[UNVERIFIED]**. Research input for a career decision — not financial advice.*

---

## 0. Executive summary

1. **The Chinese challenge is the threat that is already happening, and it is large.** In 2025 domestic suppliers held **55%** of China's industrial-robot installations (195k of 354k units) [R, IFR via CGTN]. That is up from 44% in H1 2023 [R, MIR via Yicai]. Domestic brands hold **>55% of China servo** (Inovance alone ~32%) and **~41% of small PLCs** [R, single industry report]. Inovance's general-automation revenue grew **+23% in FY2025 to RMB 16.9bn (~USD 2.3bn)** [R/D] and **+36% in H1 2026** [R], with segment gross margin ~41% [R]. The next phase is **exports**. China became a **net exporter of industrial robots in 2025** [R], and Inovance's overseas revenue rose +24% in H1 2026 [R].
2. **The domestic challengers grow fast but earn thin profits.** Inovance makes good money (FY2025 net margin ~11% [D]). The rest of the field is weak: Estun lost RMB 810m on RMB 4.0bn revenue in 2024 [R], and Supcon's FY2025 revenue fell ~12% [R]. The likely outcome is a lasting price war in the mid-tier market. It is less likely that one Chinese company becomes a broad global platform rival before ~2030. Inovance is the exception.
3. **Software-defined / open automation is real but slow.** Siemens' S7-1500V (the first TÜV-certified virtual fail-safe PLC) runs in production at Audi Neckarsulm [R]. ExxonMobil's O-PAS "lighthouse" (~100 loops / 1,000 I/O, Baton Rouge) has produced since Nov 2024 [R]. So far, incumbents have taken over the virtual-PLC concept themselves rather than been displaced by it. Through 2031 it squeezes hardware margins but does not threaten installed-base franchises.
4. **Nvidia/hyperscalers are working as partners that capture a share of value, not as substitutes.** At Hannover Messe 2026 Siemens, ABB and Dassault built on Omniverse/Isaac/Cosmos [R]. Value moves toward compute and AI-model layers, while incumbents keep the domain, safety and installed-base layers.
5. **Humanoids are a long-dated option, not a 2031 share-taker.** Funding is huge: Figure has a USD 39bn valuation [R], Unitree raised RMB 6.1bn in its Aug 2026 STAR IPO [R], and SoftBank paid USD 5.375bn for ABB Robotics [R]. Deployments are tiny: Unitree shipped ~5,500 humanoids in 2025 [R], and Atlas's 2026 output is all taken by Hyundai and DeepMind [R]. Tesla's targets (1m units/yr by end-2026) remain unverified claims [R as claim; EST: will be missed by a wide margin].
6. **The portfolio reshuffle of 2023–26** follows one pattern: pure-play automation plus industrial software. Examples: Emerson–AspenTech (Mar 2025) [R], Siemens–Altair (USD 10bn) and Dotmatics (USD 5.1bn) [R], Honeywell's Aerospace spin (29 Jun 2026) leaving "Honeywell Technologies" [R], and ABB's exit from robots [R].
7. **Exposure ranking (most to least exposed by 2031) [EST]:** Yaskawa > Mitsubishi Electric (FA) > Fanuc > Omron > ABB robotics (now SoftBank) > Keyence > Schneider (discrete) > Rockwell > Siemens DI > Emerson / ABB Process Automation (least exposed).

---

## 1. Chinese challengers

### 1.1 Market structure: China is the battlefield
| Metric | Value | Label / Source |
|---|---|---|
| China robot installations 2025 | 354,000 units, +20% YoY | [R] IFR via CGTN |
| China share of global installations | 59% | [R] |
| Implied global installations 2025 | ~600,000 | [D] |
| Domestic suppliers' installs 2025 | 195,000 (+15%) → **55% share** | [R] |
| Domestic share history | 44% H1 2023 (MIR); 55% 2025 (IFR) | [R] (different methodologies) |
| IFR China growth outlook to 2029 | 5–10% p.a. | [R] |
| China core automation market 2025 | RMB 300–320bn (~USD 42–44bn) | [R]/[D] industry report |
| Domestic share of core automation | ~30% (2020) → ~55% (2025) → ~65% (2030F) | [R] single report, unverified |
| Servo: domestic share | >55% (H1 2025); Inovance 32%; Yaskawa+Panasonic+Mitsubishi ~35% (vs 60%+ in 2019) | [R] single report |
| Small PLC: domestic share | 38% (2023) → 41% (2024); >60% by 2030F | [R] single report |
| Mid/large PLC: domestic share | **~8%**, the main remaining foreign stronghold (Siemens, Rockwell, Schneider, Mitsubishi) | [R] single report |
| DCS: Supcon share | 40.4% (No.1 for 14 yrs; chemicals 63%) | [R] single report |
| China robot exports | H1 2025: 94,200 units / USD 746m, +60% [R]; China a **net exporter in 2025** [R]; H1 2026 exports RMB 6.29bn, +18.6% [R] | KrASIA; SSE/China Daily |

**Interpretation [EST]:** Domestic brands have mostly won the low and mid tiers: servos, small PLCs, inverters, SCARA and the small six-axis robots that serve batteries, solar and electronics. The large-PLC, DCS-outside-chemicals, high-end motion and machine-tool CNC tiers are still foreign-held but are the next target. Foreign brands have answered with "targeted price reductions in the mid-tier" [R], which is a direct hit to margins.

### 1.2 Company scorecards
| Company | Scale | Growth | Profitability | Notes |
|---|---|---|---|---|
| **Inovance (汇川)** | FY2025 revenue RMB 45.1bn (~USD 6.3bn) [R/D]; general automation RMB 16.9bn (~USD 2.35bn) [R/D] | FY25 +21.8% total, GA +23% [R]; H1 2026 revenue RMB 24.7bn +20.3%, GA ~RMB 11.0bn **+36%** [R] | FY25 gross margin 29.0%, net margin ~11.2% [R/D]; GA segment gross margin **41.4%** [R]; H1 26 net profit −5.4% (EV drag, impairments) [R] | No.1 in China servo (32%), VFD (22%), SCARA (~20–25%), small PLC; ~9% of China robots (No.3 overall) [R]. Overseas revenue H1 26 RMB 1.64bn, +24% (~7% of sales) [R/D]. FY26 guidance +10–30% [R]. R&D RMB 2.23bn in H1 26, 8,149 R&D staff [R]. **The only Chinese challenger with Siemens/Mitsubishi-like breadth.** |
| **Estun** | 2024 revenue RMB 4.0bn [R] | 2023→24 −14% [D] | 2024 net loss RMB 810m incl. RMB 360m impairment [R]; gross margin 32.9% (2022) → 28.3% (2024) [R] | Overseas 34% of revenue (incl. Cloos, Germany) [R]; first Chinese firm to lead domestic robot shipments (Q1 2025) [R]; preparing HK IPO [R]. Share gains bought at the cost of profit. |
| **Efort / Siasun** | Not verified this run | — | Both historically marginal or loss-making [UNVERIFIED] | Efort reached MIR's top tier in H1 2023 [R]. |
| **Hikrobot (Hikvision)** | 2025 revenue >RMB 6.45bn (~USD 0.9bn) [R/D] | Not stated | Not stated | Machine vision + mobile robots; >10m vision units shipped cumulatively; >20,000 customers [R]. Spin-off IPO planned on the mainland [R, Yicai]; status not verified. **Direct threat to Keyence/Cognex in the mid tier.** |
| **Supcon (中控)** | FY2025 revenue RMB 8.07bn [R] | ~−12% [R] | Not verified | Leads China DCS (40%); blocks Emerson/Honeywell/Yokogawa/ABB in Chinese chemicals. |
| **Hollysys** | Not verified | — | — | Taken private (2024) [UNVERIFIED]; DCS / rail signalling. |
| **Unitree** (robots/humanoids) | 2025 revenue RMB 1.70bn [R] | ~4.3× YoY [D] | Net profit RMB 278m (16% net margin) [R/D] | STAR IPO Aug 2026: RMB 6.10bn raised at RMB 150.80/share; implied market cap ~RMB 61bn (~USD 8.5bn) [D]. Overseas 44% of revenue [R]. |

### 1.3 Threat assessment (Chinese challengers)
- **Size:** China is ~USD 40–45bn of core automation [D] and ~59% of world robot demand [R]. Domestic brands already hold ~55% of both.
- **Growth:** Leaders grow 20–35% [R]. The overall Chinese market grows 5–10% [R, IFR].
- **Margins:** Inovance's GA gross margin of ~41% [R] is competitive with Western peers. Most others are thin or loss-making.
- **Likelihood of eroding incumbents' share/margins by 2031 [EST]:**
  - **China share: very high (≈90%)**. Expect the domestic share of core automation to reach ~65% by 2030 [R forecast]. Japanese servo, robot and small-PLC vendors lose the most.
  - **Export markets (SE Asia, India, Middle East, LatAm, Eastern Europe): high (≈70%)**. Chinese battery, EV and solar plants abroad bring their Chinese automation suppliers with them ("follow-the-customer").
  - **EU / US core: low to moderate (≈25–35%)**. Barriers are safety certification, installed base, engineering tools (TIA Portal, Studio 5000), integrator ecosystems, and growing **tariff and security restrictions**. Estun's Cloos and Inovance's European subsidiaries are toeholds only.
  - **Global pricing: high (≈70%)**. China sets the floor price for servos and small robots worldwide. Expect a few points of gross-margin pressure in the commodity motion and robot lines of Yaskawa, Fanuc, Mitsubishi, Omron and ABB/SoftBank Robotics.

---

## 2. Software-defined / open automation

| Initiative | Status | Label |
|---|---|---|
| **Siemens S7-1500V** virtual PLC | First **TÜV-certified virtual fail-safe controller**; deployed via Industrial Edge. Production use at **Audi Böllinger Höfe, Neckarsulm (e-tron GT)** on Audi's Edge Cloud 4 Production; requirements and validation took ~3 years | [R] Siemens |
| **ExxonMobil O-PAS** (Open Process Automation) | Baton Rouge resin-finishing plant: legacy DCS fully removed; ~100 loops / 1,000 I/O; O-PAS v2.1; cutover Nov 2024 and in production since. Controller setup <20 min vs hours/days for PLC/DCS. Next: PLC upgrade at ExxonMobil Midstream. **No quantified cost savings published** | [R] Control Global, Mar 2025 |
| **Codesys virtual control / Software Defined Automation (startup) / containerised PLC runtimes** | Growing; used by OEMs and IPC vendors (Beckhoff, Wago etc.) | [UNVERIFIED this run]; qualitative |

**Mechanism of threat:** Decoupling control software from proprietary hardware weakens the "buy our PLC to run our tools" lock-in. It moves value to IT-grade servers and edge compute (Dell, HPE, Nvidia), to orchestration and containers (VMware, Red Hat), and to integrators.

**Why the threat is limited to 2031 [EST]:**
- Incumbents are **leading the virtualisation themselves**: Siemens S7-1500V, Rockwell's software-defined/virtual controller roadmap, Schneider's "EcoStruxure Automation Expert" (IEC 61499, a universal-automation stance), and ABB/Emerson/Yokogawa as O-PAS suppliers [EST/UNVERIFIED specifics]. Lock-in moves from hardware to **engineering software and lifecycle services** (subscription).
- O-PAS adoption is very slow. One mid-size lighthouse plant took ~8 years from the 2016 kickoff [EST]. Process plants replace their DCS every 20–30 years.
- Safety certification, determinism and liability favour established vendors.

**Likelihood of eroding share/margins by 2031 [EST]:** **Share: low (≈15–20%)**. **Hardware gross margin: moderate (≈40%)**. Hardware ASPs fall, partly offset by software and ARR growth. **Most exposed:** vendors whose economics rest on proprietary controller hardware and who lag on software: Mitsubishi, Omron, and to a degree Rockwell (Logix hardware is a big share of profit). **Least exposed:** Siemens (it owns the software stack) and Schneider/AVEVA.

---

## 3. Big tech & AI entrants

- **Nvidia** (Hannover Messe, Apr 2026) [R]:
  - **Siemens:** Digital Twin Composer built on Omniverse libraries; Erlangen "blueprint autonomous factory".
  - **ABB:** Omniverse + Azure inside the Genix IIoT/AI suite.
  - **Dassault:** virtual twins on Nvidia physical-AI libraries.
  - **Others:** Microsoft, SAP, Synopsys, Cadence.
  - **Products in use:** Isaac Sim/Lab, Jetson Thor (robot compute), Cosmos Reason 2 (vision agents), Metropolis.
  - **Customer result:** Terex expects ~3% yield gain and ~10% less rework from Tulip on Nvidia [R].
  - **Funding:** Nvidia is also an investor in Figure [R].
- **Hyperscalers:** Microsoft Azure appears in the ABB/Nvidia stack [R], and Deutsche Telekom runs an Nvidia-based "Industrial AI Cloud" in Europe [R]. AWS/Google industrial partnerships were not verified this run [UNVERIFIED]. Google DeepMind supplies Gemini Robotics models for Boston Dynamics Atlas [R].

**Who captures value [EST]:**
- Nvidia takes the **compute and simulation-toolchain** rent: GPUs, Jetson Thor modules, enterprise Omniverse licences.
- Hyperscalers take cloud and AI-model consumption.
- **Incumbents keep** the deterministic control layer, safety, domain data and models, the installed base and channel access.
- At-risk value pools: (a) **MES / analytics / quality-inspection software**, where AI-native start-ups (Tulip, Invisible AI, Instrumental) plus cloud can bypass legacy MES; (b) **machine-vision software**, where foundation vision models commoditise rule-based vision and threaten Keyence's and Cognex's software moat.

**Likelihood of eroding incumbents by 2031 [EST]:** **Share: low (≈15%)**. **Margin/value capture in software and analytics: moderate (≈40%)**. Incumbents that partner deeply (Siemens, ABB, Rockwell with Nvidia/Microsoft [Rockwell link UNVERIFIED]) turn the threat into an upsell. Pure hardware makers rent the AI layer and capture less.

---

## 4. Humanoid & general-purpose robot entrants

| Player | Funding / valuation | Deployment reality | Price point | Label |
|---|---|---|---|---|
| **Figure AI** | Series C >USD 1bn at **USD 39bn** post-money (16 Sep 2025); investors incl. Nvidia, Brookfield, Intel, Qualcomm, Salesforce | BotQ factory unveiled Mar 2025; target **100k units over 4 years** | n/a | [R] |
| **Tesla Optimus** | Internal | Pilot line at Fremont; Gen 3 line planned 2026; **company targets 1m/yr at Fremont by end-2026, 10m/yr in Texas 2027**. No verified external deployment numbers | target ~USD 20–30k | [R claims, secondary source]; [EST: targets will be missed by more than 10×] |
| **Unitree** | STAR IPO Aug 2026, RMB 6.1bn raised, ~RMB 61bn market cap [D] | **>5,500 humanoids shipped in 2025**; 33k quadrupeds 2023–25; profitable | H2 base ~USD 29.9k (China) | [R] |
| **UBTech** | USD 1bn strategic financing (2025); HK market cap ~USD 5.9bn (Sep 2025) | Walker S; record single order CNY 90.5m from MiYi Automotive; partners BYD, Foxconn; H1 2025 revenue +27.5% | n/a | [R] |
| **Boston Dynamics / Hyundai** | Hyundai USD 26bn US investment incl. a 30k-robot/yr robotics plant | Production Atlas (CES 2026); **2026 output sold out to Hyundai and Google DeepMind**; other customers from early 2027 | undisclosed | [R, secondary] |
| **Agility (Digit)** | Not verified | Logistics pilots (GXO etc.) | — | [UNVERIFIED] |
| **SoftBank + ABB Robotics** | USD 5.375bn for ABB Robotics (signed 8 Oct 2025; close **mid-to-late 2026**, pending EU/China/US approvals) | ABB Robotics revenue USD 2.28bn (2024), ~7,000 staff; to be combined with Skild AI, Agile Robots, AutoStore, Berkshire Grey | — | [R] SoftBank |
| **Market size** | China humanoid market forecast RMB 8bn ≈ 50% of global (year unspecified) | — | — | [R] The Asset |

**Assessment [EST]:**
- 2025 global humanoid shipments were probably **~10–20k units** [EST], against ~600k industrial robots [D]. That is a negligible share of factory automation spend through ~2028.
- Humanoid makers **consume** incumbent technology: servos, harmonic drives, sensors, vision, safety controllers. That makes them a **demand opportunity for component suppliers**: Inovance, Yaskawa, Harmonic Drive, Keyence, Omron and Chinese suppliers like Zhaowei [R exists].
- The **real threat is indirect**. AI-native robot software (foundation models for manipulation) could commoditise **robot-arm programming and integration**, which is where Fanuc, Yaskawa, KUKA and ABB earn their stickiness. A general-purpose robot that learns by demonstration reduces the need for brand-specific teach pendants and integrators.
- **Likelihood of material share erosion of incumbents' robot business by 2031: low to moderate (≈20–25%)**. The likelihood that AI-native robotics **resets the competitive basis** of the robot-arm market by 2035: moderate to high (≈50%). ABB judged it better to sell robots than fight. SoftBank is betting on exactly this reset.

---

## 5. In-house automation by large manufacturers & system integrators

- **Tesla** builds its own controls, robotics cells and Optimus. **BYD** has large in-house automation and equipment units and is a UBTech partner [R]. **Foxconn** has in-house robots ("Foxbots") and is a partner of Nvidia Omniverse/Mega and UBTech [R partner; rest UNVERIFIED].
- **Mechanism:** Mega-manufacturers (EV, battery, electronics) prefer **Chinese domestic or in-house** suppliers on cost and speed, and they now export that supply chain with their overseas plants. That raises the risk for incumbents in **SE Asia, Hungary, Mexico and Turkey**.
- **System integrators:** Software-defined control and AI-based programming shift value toward integrators that own the application know-how. Incumbents counter with integrator acquisitions and services.
- **Likelihood of material erosion by 2031 [EST]:** **moderate (≈30%)**, concentrated in EV, battery and electronics verticals. It is low in process industries, pharma and food & beverage, where incumbents' validated platforms dominate.

---

## 6. Consolidation & portfolio moves, 2023–2026 (verification status)

| Move | Status / terms | Label |
|---|---|---|
| **Emerson–AspenTech** (buy-in of remaining ~43%) | Completed **12 Mar 2025**, USD 265/share; ~USD 7.2bn implied for the minority [D]; AspenTech now in Control Systems & Software segment | [R]/[D] Emerson |
| **Siemens–Altair** | ~USD 10bn; completed Mar/Apr 2025 | [R] PharmTech citing Siemens |
| **Siemens–Dotmatics** | USD 5.1bn; completed **1 Jul 2025**; >USD 300m revenue FY25 | [R] |
| **ABB Robotics → SoftBank** | USD 5.375bn; signed 8 Oct 2025; expected close mid-to-late 2026 (replaced ABB's planned robotics spin-off) | [R] SoftBank. **Closing status as of Oct 2026 not confirmed** in sources found |
| **Honeywell break-up** | Aerospace spin distributed **29 Jun 2026**; remaining pure-play automation company named **"Honeywell Technologies"**; Solstice Advanced Materials spun earlier (Oct 2025) [Solstice date UNVERIFIED] | [R] Honeywell |
| **Rockwell–Clearpath/OTTO Motors** | Completed 2023 (AMRs) | [UNVERIFIED this run; widely reported] |
| **Schneider–AVEVA** (100% take-private) | Completed Jan 2023 | [UNVERIFIED this run; widely reported] |
| **Unitree STAR IPO; Estun / Zhaowei / RobotPhoenix HK IPO preparation; Hikrobot spin-off IPO** | China capital markets are funding challengers | [R] |

**Pattern [EST]:**
- Western incumbents are becoming **automation-plus-industrial-software pure plays**: Siemens is buying simulation and lab software, Emerson AspenTech, and Schneider AVEVA.
- They are **shedding commoditising hardware** (ABB robots) or non-core businesses (Honeywell aerospace and materials, Emerson climate and Copeland [UNVERIFIED]).
- Chinese challengers are **raising equity** to fund overseas expansion.

For a career, this favours employers that own software plus the installed base. Hardware-centric robot units carry ownership-change risk; ABB Robotics staff are now under SoftBank.

---

## 7. Threat matrix and incumbent exposure

### 7.1 Threat summary (to 2031) [EST unless noted]
| Threat | Size (2025) | Growth | Margin profile | P(erodes share) | P(erodes margin) |
|---|---|---|---|---|---|
| Chinese challengers (in China) | ~USD 23bn domestic-brand revenue in a ~USD 42–44bn market [D from ~55% share] | 20–35% leaders [R] | Inovance GA gross margin ~41% [R]; others thin or negative | ~90% | ~70% |
| Chinese challengers (export) | Robots exports ~USD 1.1bn 2024 [R] | +19% to +60% [R] | Price-aggressive | ~50% ex-China emerging; ~25% EU/US | ~60% |
| Software-defined/open control | Small (pilot-to-early production) | High from a low base | Shifts to software/ARR | ~15–20% | ~40% (hardware) |
| Big tech / AI platforms | n/a (embedded in partnerships) | High | Captures compute/AI rent | ~15% | ~40% (software layers) |
| Humanoids / general-purpose robots | Unitree RMB 1.7bn revenue; global humanoid market low single-digit USD bn [EST] | 3–4×/yr at early players [R/D] | Unitree 16% net [D]; most loss-making | ~20–25% (robots) | ~25% |
| In-house automation / integrators | n/a | Moderate | — | ~30% (EV/battery/electronics) | ~30% |

### 7.2 Incumbent exposure ranking (most → least exposed) [EST]
1. **Yaskawa:** servo and robot heavy, with high China exposure. Its servo share is being taken directly by Inovance; the foreign servo group fell from 60%+ to ~35% [R].
2. **Mitsubishi Electric (FA):** small PLC, servo and CNC in China and Asia. Faces domestic small-PLC substitution and the shift to software-defined control.
3. **Fanuc:** robots and CNC. China robot price war, plus long-term AI-native robot-programming risk. Its balance sheet and machine-tool CNC moat cushion this.
4. **Omron:** mid-tier PLCs, sensors and vision. Squeezed by Chinese vision (Hikrobot) and PLCs. Has already restructured [UNVERIFIED this run].
5. **ABB Robotics (now SoftBank):** commodity-robot pressure, but SoftBank's AI thesis adds upside and volatility. **ABB group ex-robots: low exposure.**
6. **Keyence:** premium sensors and vision with a direct-sales moat. Hikrobot and AI-vision models erode the mid tier, but its high-end franchise holds [EST].
7. **Schneider Electric (Industrial Automation):** discrete PLCs and drives are exposed in China. AVEVA and the energy-management mix dilute the risk.
8. **Rockwell Automation:** low China exposure, which acts as natural protection. The risk is software-defined control eroding the Logix hardware premium. Tariff and reshoring tailwinds.
9. **Siemens Digital Industries:** high China revenue at risk in mid-tier PLCs, but it holds the strongest moat in large PLCs (domestic share only ~8% [R]), plus TIA, simulation software (Altair) and leadership in virtual PLC and Nvidia partnerships.
10. **Emerson / ABB Process Automation / Honeywell Technologies (process):** least exposed. Long DCS lifecycles, a large installed base, and AspenTech-type software. Supcon blocks them only inside China.

**Bottom line for a career [EST]:** The disruptors mostly attack **commoditising hardware in China and emerging markets**. They do not attack **installed-base, safety-critical and software-heavy franchises in the West**. On a 20-year horizon the best-protected employers are Siemens DI, Emerson, Rockwell, and Schneider (AVEVA). The most structurally challenged are Yaskawa, Mitsubishi FA, Omron and the commodity-robot arms. Inovance is the most credible new global contender and is worth watching as an employer and as a benchmark, though its career relevance outside China is limited.

---

## 8. Data gaps / caveats
- **Single-source data:** China servo and PLC share figures come from one industry report (faxiangongchang.com) with generic sourcing. Treat ±5 pt.
- **Methodology mismatch:** Domestic robot share figures mix MIR (H1 2023, 44%) and IFR (2025, 55%).
- **Not re-verified this run:** Rockwell–Clearpath, Schneider–AVEVA, Hollysys take-private, Efort/Siasun financials, Codesys/SDA metrics, AWS/Google industrial deals, Agility deployments, ABB–SoftBank closing status.
- **Unconfirmed claims:** Tesla Optimus figures are company targets reported by secondary sources and are not confirmed.
- **Missing data:** Global humanoid funding totals for 2025–26 could not be retrieved (paywalled sources).

---

## Sources
- IFR via CGTN, China robot market 2025 (Sep 2026): https://news.cgtn.com/news/2026-09-24/China-remains-world-s-largest-industrial-robot-market-report-1QHHXCQHdrq/p.html
- Yicai Global, domestic robot share H1 2023 (MIR): https://yicaiglobal.com/news/chinese-industrial-robot-makers-share-of-domestic-market-climbs-to-record-in-first-half
- KrASIA, Chinese robot makers' IPOs/exports (Estun, Zhaowei, RobotPhoenix): https://kr-asia.com/chinas-industrial-robot-makers-turn-to-ipos-to-gear-up-for-global-expansion
- China industrial automation 2026 report (shares, market size): https://faxiangongchang.com/en/reports/china-industrial-automation-2026
- Inovance H1 2026 (Quartr): https://quartr.com/events/shenzhen-inovance-technology-co-ltd-300124-q2-2026_FLu90Bhl
- Inovance H1 2026 segment detail (Gelonghui): https://m.gelonghui.com/news/5305924
- Inovance FY2025 / Q1 2026 (Dongwu Securities via Eastmoney): https://data.eastmoney.com/report/info/AP202604281821656918.html
- Hikrobot 2025 revenue (36Kr): https://eu.36kr.com/en/p/3782137908403457
- Hikvision robotics spin-off IPO (Yicai): https://yicaiglobal.com/news/chinese-security-firm-hikvision-to-spin-off-robotics-unit-for-mainland-ipo
- Siemens/Audi virtual PLC: https://www.siemens.com/de-ch/company/insights/factory-automation-virtual-plc-audi/
- Siemens/Audi press release: https://assets.new.siemens.com/siemens/assets/api/uuid:2fe9ae6b-17a8-43fc-b80e-982888c48d52/HQDIPR202503257136EN.pdf
- ExxonMobil O-PAS (Control Global, Mar 2025): https://www.controlglobal.com/control/distributed-control/article/55275126/plug-and-play-punches-in
- Nvidia at Hannover Messe 2026: https://blogs.nvidia.com/blog/ai-manufacturing-hannover-messe/
- Figure Series C (The Robot Report): https://www.therobotreport.com/figure-ai-raises-1b-in-series-c-funding-toward-humanoid-robot-development/
- Unitree IPO (SSE / China Daily, Aug 2026): https://english.sse.com.cn/news/newsrelease/voice/c/c_20260811_10828578.shtml
- Humanoid 2026 overview (Tesla, Atlas, prices): https://timewell.jp/en/columns/humanoid-robot-2026
- UBTech financing (Dealroom/TMTPost): https://datacommons.dealroom.co/news/feed/ubtech-secures-1b-reports-growth
- China humanoid market (The Asset): https://www.theasset.com/article/55336/china-leads-global-embodied-intelligence-race
- SoftBank–ABB Robotics press release: https://group.softbank/en/news/press/20251008
- Emerson–AspenTech completion: https://www.emerson.com/en-us/news/2025/emerson-completes-acquisition-of-remaining-outstanding-shares-of-aspentech
- Siemens–Dotmatics/Altair completion (PharmTech): https://www.pharmtech.com/view/siemens-finalizes-dotmatics-acquisition
- Honeywell Aerospace spin approval (Jun 2026): https://www.honeywell.com/us/en/press/2026/06/honeywell-board-of-directors-approves-spin-off-of-honeywell-aerospace
