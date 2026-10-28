# 06 — Toshiba HDD, the HDD Supply Chain and Where Servo Skills Transfer

*Analyst report, compiled October 28, 2026. Written for a 15-year HDD servo control engineer who is evaluating employers.*

**How to read the labels**
- **[V]**: confirmed from a 2025–2026 source listed in the Sources section.
- **[E]**: analyst estimate or derived calculation.
- **[BK]**: background industry knowledge that was not re-checked against a 2026 source in this session. Check it before relying on it.

**Coverage gap:** this session's shared web-search budget ran out partway through. Resonac financials, Nidec/MinebeaMitsumi, Hutchinson, and the semiconductor-equipment hiring section therefore rely more on [BK] than the rest of the report.

---

## Executive summary

1. **Toshiba is the distant #3 HDD maker, but in 2026 it is expanding, not retreating.**
   - **Share:** about 17–18% of units [V], but only about 10–11% of exabytes and bits [V]. The gap exists because Toshiba sells more low-capacity drives and is roughly one capacity generation behind on nearline.
   - **Investment:** in October 2026 it announced a ¥60bn (about $380M) Philippine expansion to roughly double data-center HDD output by FY2027 (in storage-capacity terms). It also stated a medium-term goal of about 30% share [V]. This is its first major HDD investment in about five years. Seagate and WD stock fell 10–15% on the news [V].
   - **What this means:** there is no credible sign of an HDD exit in 2026. The old "Toshiba could sell HDD" story (2016) has been reversed by AI-driven nearline demand.
2. **Toshiba's main strategic weakness is that it has no in-house head business.** It buys 100% of its heads from TDK [V].
   - In October 2026 Bloomberg reported that **Seagate and Toshiba are competing to buy TDK's HDD head business**. The reported value is up to several billion dollars, and Seagate's offer is said to be higher [V].
   - TDK said nothing has been decided, and Toshiba denied the report [V].
   - A Seagate win would make Toshiba dependent on its rival. A Toshiba win would vertically integrate it, much like Seagate and WD.
   - This is the single most important event to watch when judging Toshiba's 10–20-year viability.
3. **Toshiba's technology roadmap:**
   - **Shipping today:** FC-MAMR / MAS-MAMR, with 24TB CMR and 28TB SMR (MG11) in the field [V].
   - **2026 sampling:** 30–34TB SMR on 11 platters (M12) since March 2026, and 28TB CMR M12 samples planned for Q3 2026 [V].
   - **Next steps:** 12-platter stacks on glass substrates, verified October 2025 [V]. A 40TB class drive in 2027 (MAMR or HAMR). HAMR with 12 platters at 45TB in 2028 and 55TB+ after 2029. About 65TB mass production by 2030 and 100TB later [V].
   - **Seagate is far ahead:** HAMR in volume at up to 44TB, with 100TB targeted by 2030 [V].
4. **The supply chain is in a demand super-cycle.** Every major component maker is adding capacity:
   - Resonac media: +31%, to 210M platters a year [V].
   - Hoya: about ¥50bn glass-substrate plant in Vietnam, starting in 2028 [V].
   - NHK Spring: suspension capex tripling in FY2026 [V].
   - TDK: head and suspension capacity, plus HAMR head mass production within about 2 years [V].
   - Nitto Denko: ¥43bn for suspension FPCs [V].

   These are mostly **process, materials and manufacturing engineering** jobs in Japan and Southeast Asia. Few of them are servo control roles.
5. **For a servo engineer:**
   - The employers that actually run HDD servo/control loops remain **Seagate, WD and Toshiba**, plus a small number of **SoC vendors (Broadcom, Marvell)** that do channel and servo-demodulation work.
   - The strongest external demand for HDD-servo skills is in **semiconductor equipment** (ASML, KLA, Applied Materials, Lam), precision motion-control firms, robotics, automotive/EV motor control, and consumer hardware (camera OIS and haptics) [BK].

---

## 1. Toshiba Electronic Devices & Storage Corp. (TDSC), HDD business

### 1.1 Corporate status
- **Ownership:** Toshiba Corp. was taken private by the Japan Industrial Partners (JIP) consortium in December 2023, in a deal worth about $13–15bn [V].
- **Mid-term plan:** a target of 10% return on sales (ROS) by FY2026 [V].
- **Restructuring:** in May 2024 Toshiba announced up to about 4,000 job cuts in Japan (about 6% of its workforce). It also moved head-office functions from central Tokyo to Kawasaki [V]. The units affected were not itemized publicly. These were mostly voluntary early retirements [BK].
- **HDD layoffs:** no HDD-specific layoffs were found in 2025–2026. Given the capacity expansion, near-term HDD cuts look unlikely [E].
- **Consolidated results (yen):**

| Fiscal year | Net sales | Operating income | ROS |
|---|---|---|---|
| FY2023 | ¥3,285.8bn | ¥39.9bn | 1.2% |
| FY2024 | ¥3,513.9bn | ¥198.5bn | 5.6% |
| 1H FY2025 | ¥1,613.8bn | ¥115.4bn (+60% YoY) | — |
| FY2026 target | ¥3,750bn | ¥380bn | 10.1% |

  - FY2024: sales and income rose partly on "good results in the HDD business" and a lower warranty provision [V].
  - FY2025 full-year results (May 2026) and Q1 FY2026 (June 2026) were reported as profit surges to record operating income. Exact figures sit behind paywalls in the sources reached here [V-headline].
- **Power-chip talks:** in March 2026 there were reports of talks to combine the power-semiconductor units of Mitsubishi Electric, Rohm and Toshiba [V]. These concern TDSC's semiconductor side, not HDD, but they show JIP is actively reshaping the devices portfolio.

### 1.2 HDD revenue and profitability
- **Revenue:**
  - 1Q 2025: $945M in one quarter (Coughlin/TRENDFOCUS data), out of an industry total of $5.24bn [V].
  - CY2025 run-rate: about $3.8–4.2bn [E].
  - CY2026: about $4.5–5.5bn, given nearline price rises of about 10% q/q in Q2 2026 and sold-out industry capacity [E].
- **Profitability:**
  - Segment profit is not disclosed separately. Toshiba reports HDDs inside "Electronic Devices & Storage Solutions" alongside power semiconductors.
  - Toshiba's HDD operating margin is likely mid-teens or better in 2026 [E]. It is structurally below Seagate and WD because Toshiba buys heads instead of making them, carries a heavier client and consumer mix, and has lower areal density per platter.
- **Mix:** a higher share of client, consumer (2.5"/3.5"), surveillance and NAS drives than its peers. That explains the gap between its unit share (~18%) and its exabyte share (~11%) [V/E].

### 1.3 Nearline capacity roadmap

| Timing | Product / milestone | Technology |
|---|---|---|
| 2024 | MG11: 24TB CMR / 28TB SMR, 10 platters [V] | FC-MAMR |
| May 2024 | Demonstrated 32TB HAMR (10-disk SMR) and 31TB MAMR (11-disk SMR), with TDK and Resonac [V] | HAMR / MAMR |
| Oct 2025 | 12-platter stack verified on glass substrates; 13 platters described as feasible [V] | Mechanical/media |
| Mar 2026 | M12: 30–34TB SMR, 11 platters, sampling [V] | MAS-MAMR |
| Q3 2026 | M12: 28TB CMR samples planned (not confirmed as of Oct 2026) [V] | MAS-MAMR |
| 2026–27 | 40TB class (slides show HAMR 11-platter in 2026; MAMR 11–12 platters in 2027) [V] | MAMR / HAMR |
| 2028 | 45TB [V] | HAMR + 12 platters |
| 2029+ | 55TB+ [V] | HAMR + 12 platters |
| 2030 | About 65TB class mass production, then 100TB class [V] | HAMR |

**Servo relevance:** 11–13 platter stacks on glass substrates mean thinner disks and arms, more actuator and suspension modes, tighter disk flutter budgets and more heads per actuator. Moving to HAMR adds thermal-protrusion and laser-power interactions with TFC (thermal fly-height control) and track-following, which raise the difficulty of the servo problem. Toshiba's catch-up roadmap needs **more** servo and mechanical-dynamics engineering, not less [E].

### 1.4 Sites and where it hires
- **Japan HDD R&D:**
  - Ome Operations (Tokyo) historically housed the HDD Advanced Technology Center and the HDD Manufacturing Technology Center (established 2011) [V].
  - In 2021 TDSC moved its Storage Products Division to the Yokohama Complex, and HQ/semiconductor functions to Kawasaki, with a new Kawasaki R&D complex [V].
  - Core HDD design (servo, firmware, mechanics) is mostly Japan-based (Yokohama/Kawasaki) [BK/E].
- **Manufacturing:** Toshiba Information Equipment (Philippines), TIP [V]:
  - Laguna Technopark (LTI), Biñan: newly expanded nearline line; first shipments October 2026.
  - Carmelray Industrial Park (CIP), Calamba: nearline and helium enterprise drives.
  - LTI-Annex: SSDs and PCBs.
  - The expansion automates inspection and clean-room processes, cutting the extra headcount the expansion would otherwise need by about 40% [V].
- **US:** Toshiba America Electronic Components (TAEC), San Jose, has an **HDD team that does servo work**.
  - A 2024 TAEC intern blog describes the "HDD SSW team" working on actuator system identification in a multi-rate system during self-servo-write, implemented in HDD control firmware and manufacturing-process firmware [V].
  - So **Toshiba does employ HDD servo/control engineers in San Jose**, but the team is small, likely a few dozen people across HDD engineering [E].
  - Irvine (TAEC HQ) is mostly sales, marketing and applications [BK].
- **Vietnam / other:** no evidence was found of a Toshiba HDD servo R&D presence in Vietnam. Toshiba Software Development Vietnam has historically done embedded and software work, but not confirmed HDD servo work [BK].

### 1.5 Exit or sale risk
- **2016:** Toshiba publicly said it "could stop or sell" HDD during its accounting crisis [V-headline].
- **2023:** the buyout commentary said it would not affect the storage businesses [V-headline].
- **2026:** the direction is the opposite, with new capex, a 30% share target, and reported interest in **buying** TDK's head business [V].
- **Long-term risk (10–20 years, [E]):**
  - Toshiba has no in-house heads or media and has the smallest R&D scale of the three.
  - If HAMR execution slips, or if Seagate gains control of TDK heads, a JIP exit (sale or JV) around 2029–2032 becomes plausible.
  - Precedents exist: the 2012 FTC remedy moved WD's 3.5" assets to Toshiba [V]; in 2009 Fujitsu sold its HDD business to Toshiba [BK].
  - JIP is a private-equity style owner that will eventually seek an exit, either a re-IPO or portfolio sales [BK].

---

## 2. Market share by vendor, 2024–2026

| Period | Metric | Seagate | WD | Toshiba | Industry total | Label |
|---|---|---|---|---|---|---|
| CY2024 | Units | ~41–43% | ~38–40% | ~18–20% | ~120–125M units | [E/BK] |
| CY2024 | Exabytes | ~44–46% | ~42–44% | ~11–12% | ~1.2–1.3 ZB | [E/BK] |
| 1Q 2025 | Units | 11.4M (40%) | 12.1M (42%) | 5.2M (18%) | 29.7M | [V] |
| 1Q 2025 | Exabytes | 143.6 EB (~40%) | 179.8 EB (~50%) | 41 EB (~11%) | 361.4 EB | [V; shares E] |
| 1Q 2025 | Revenue | $2.00bn (38%) | $2.29bn (44%) | $0.945bn (18%) | $5.24bn | [V; shares E] |
| FY Mar-2025 (TDK) | Industry units | — | — | — | 123M total / 61M nearline | [V] |
| FY Mar-2026 (TDK fcst) | Industry units | — | — | — | 124M base (118M risk) / 62M nearline | [V] |
| 2026 (TrendForce, July) | "Market" | >40% | >40% | ~17% | — | [V] |
| 2026 (TrendForce, Oct, bits) | Bits/EB | ~45% | ~45% | ~10% | — | [V] |
| 2026 (TrendForce projection) | Share (basis unstated, likely EB/revenue) | 42% | 48% | 10% | — | [V] |
| Toshiba capacity share | Industry manufacturing capacity (EB) | — | — | just over 10% → target ~30% | — | [V] |

**Takeaways**
- In **units**, Toshiba has roughly 1/6 of the market.
- In **exabytes and value**, it has only about 1/10.
- WD has led exabytes since 2025 thanks to its 11-platter ePMR/SMR strategy.
- Seagate's HAMR (Mozaic 3+/4+) gives it the per-platter density lead.
- The 30% Toshiba target refers to **production capacity** over 3–5 years. Reaching it would require heads (hence the TDK bid) and HAMR success [E].

---

## 3. Supply-chain companies

### 3.1 TDK: heads (SAE Magnetics, Headway) and suspensions (Hutchinson)
- **Segment:** HDD heads and suspensions sit in TDK's Magnetic Application Products segment, which also includes magnets.

| Period | Net sales | Operating profit | Notes |
|---|---|---|---|
| FY Mar-2025 | ¥223.6bn (+21%) | ¥3.4bn | Back to profit after a ¥35.6bn loss in FY24, helped by restructuring [V] |
| FY Mar-2026 | ¥262.9bn (+17.6%) | ¥27.0bn (~8×) | Nearline heads +14%, suspensions +35% [V] |
| First quarter, FY Mar-2027 | ¥81.6bn (+49.6%) | ¥9.6bn (~12% margin) | Head volume +36%, suspensions +31% [V] |

- **Position:** TDK is the **only independent HDD head maker**. It supplies Seagate HAMR heads, WD EAMR heads and Toshiba MAMR heads, and is Toshiba's sole source [V].
- **HAMR:** in April 2026 TDK said it would invest in HAMR equipment and mass-produce HAMR heads in about 2 years [V].
- **Weak returns:** the segment's ROIC is about 4%, TDK's lowest. TDK wants to redeploy capital into batteries, passives and sensors, which is why a sale is under discussion [V].
- **Entities:**
  - SAE Magnetics (Hong Kong/Dongguan) does head gimbal assembly (HGA) and head stack assembly (HSA).
  - Headway Technologies (Milpitas, CA) does head wafer design and R&D.
  - Hutchinson Technology (Hutchinson, MN, plus Thailand) makes suspensions, including dual- and tri-stage microactuated suspensions [BK].
- **Jobs:** mostly magnetics, wafer process, HGA test and mechanical engineering. Microactuator suspension design at Hutchinson and HGA dynamics at SAE are the closest to servo work [E].
- **Outlook:** demand is strong through 2027. Ownership is uncertain because of the possible sale to Seagate or Toshiba [V]. Headway staff in Milpitas could end up working for Seagate or Toshiba [E].

### 3.2 Resonac (formerly Showa Denko): media
- **Position:** the world's largest merchant HDD media supplier [V]. It is Toshiba's media partner and has supplied Seagate HAMR media since its 2021 second-source deal [V].
- **Capacity:** it is expanding its Singapore plant by about 31%, from 160M to 210M platters a year, for HAMR and MAMR [V].
- **Financials:** HDD media typically runs about ¥90–110bn in annual sales at double-digit margins [BK, not verified this session]. Resonac has at times considered media a non-core business [BK].
- **Jobs:** materials science and sputtering process work, in Japan and Singapore.

### 3.3 NHK Spring: suspensions
- **Disk Drive Suspension (DDS) segment:**

| Period | Net sales | Operating profit |
|---|---|---|
| FY Mar-2026 | ¥126.7bn (+13.6%) | ¥26.0bn (20.6% margin) [V] |
| FY Mar-2027 forecast | ¥144.0bn | ¥30.0bn (20.8% margin) [V] |

- **Capex:** ¥5.6bn in FY2025, rising to ¥15.4bn in FY2026 [V]. Management expects demand to exceed capacity from 2026 [V].
- **Margin trend:** pressured in 1H FY2025 by price cuts and the strong yen and baht [V].
- **Profit share:** DDS is by far NHK Spring's highest-margin segment (company-wide operating margin is about 5.6%). It generates over half of group operating profit [V/E].
- **Jobs:** mechanical design and FEA in Japan and Thailand. Microactuator and suspension-dynamics design is adjacent to servo work.

### 3.4 Hoya: glass substrates
- **Position:** 100% of the glass HDD substrate market and about 40% of nearline 3.5" substrates [V].
- **Outlook:** it expects share gains from HAMR (which needs glass) and from rising platter counts, including Toshiba's 12-platter glass design [V].
- **Capacity:** a new plant in Vietnam, about ¥50bn, starting in FY2028 [V].
- **Jobs:** materials and process engineering in Japan, Thailand, Vietnam and Laos. No servo roles.

### 3.5 Nidec and MinebeaMitsumi: spindle motors and FDB
- **Nidec:** historically the dominant fluid-dynamic-bearing (FDB) spindle motor supplier, with roughly 80%+ share. Its HDD motors are now a small part of a business focused on EV traction motors, AI-server cooling and industrial automation [BK].
- **MinebeaMitsumi:** the secondary spindle and pivot-bearing supplier [BK].
- **Relevance:** neither company was verified with 2026 data in this session. Both run **motor-control groups**, and Nidec's automotive, robotics and drive businesses use motor-control and servo engineers. They are a plausible bridge employer [E].

### 3.6 SoC and preamp vendors: Broadcom and Marvell
- **Marvell:** its FY2026 10-K (FY ended Jan 2026, revenue $8.19bn) says its Bravera HDD controllers, with read channel and preamps, are "used by all the current HDD makers" and target nearline [V]. No storage divestiture is noted. The only divestiture was auto Ethernet, sold to Infineon for $2.5bn in August 2025 [V].
- **Broadcom:** its FY2025 annual report still lists read-channel SoCs and preamplifiers for HDDs in Servers & Storage [V].
- **Servo jobs:**
  - Both vendors employ read-channel, DSP and SoC architects. Servo-related roles focus on servo demodulation, PES channel, and motor/VCM driver co-design rather than full control-loop design, which the drive makers own [BK/E].
  - Headcount for HDD-specific work is small, probably tens of people at each company [E].
  - For a servo engineer, these are niche roles with good pay, but Marvell's strategic focus is custom AI silicon and Broadcom tends to cost-cut mature units, so HDD teams there carry run-off risk [E].
- **Motor-driver ICs:** historically TI, Rohm and STMicro "combo" chips [BK].

---

## 4. HDD-adjacent employers for servo / precision-mechatronics expertise

| Industry / employers | What transfers from HDD servo | Demand (2026, [E/BK]) | Notes |
|---|---|---|---|
| **Semiconductor equipment:** ASML (Veldhoven, Wilton CT, San Diego), KLA, Applied Materials, Lam, Nikon/Canon, Onto, Zygo | Wafer and reticle stage control, nm-scale positioning, vibration isolation, multi-rate and feedforward control, system identification | **High.** These are the best fit and pay at or above HDD levels. ASML and KLA are known to have hired ex-HDD servo engineers | WFE spending is strong on AI-chip and HBM demand. Expect a cyclical risk, and export controls affect China revenue |
| Precision motion-control vendors: Aerotech, PI, ETEL/Heidenhain, Newport/MKS, Kollmorgen | Motion control, encoders, piezo actuators | Moderate | Smaller firms with lower pay |
| Robotics and humanoids: Tesla Optimus, Figure, Boston Dynamics, Intuitive Surgical, Agility | Actuator control, motor control, embedded real-time | High and growing | Requires broadening into robotics dynamics |
| Automotive and EV: motor control (Tesla, Rivian), steering-by-wire, ADAS actuators, Nidec, Bosch | Motor/VCM control, embedded firmware | Moderate | Automotive pay is generally lower except at top EV makers |
| Consumer hardware: Apple, Google, Meta (camera optical image stabilization (OIS) and autofocus VCMs, haptics, AR/VR display actuators) | VCM control, small-actuator servo | Moderate, with few seats | Apple camera OIS is a direct analog of HDD VCM control |
| Optical/laser systems, LiDAR, space and defense (gimbal pointing, fast-steering mirrors) | Precision pointing, disturbance rejection | Moderate | Defense roles may require US citizenship and clearance |
| Tape storage: IBM, Fujifilm/Sony media | Track-following servo is nearly identical | Small but stable | LTO drives use timing-based servo (TBS) track-following, a direct skills match |
| **HDD makers themselves:** Seagate (Longmont, Shakopee, Fremont, Singapore), WD (San Jose, Irvine, Rochester, Fujisawa), Toshiba (San Jose, Japan) | — | Hiring has reopened in 2025–26 on HAMR and high-platter programs | Hiring is concentrated at Seagate and WD |

**Bottom line for the reader [E]:**
- HDD servo expertise is valued most by **semiconductor equipment (lithography and metrology stage control)**, followed by robotics/actuation and camera/VCM consumer hardware.
- A 15-year HDD servo engineer with MATLAB/Simulink, system identification, multi-rate and repetitive control, and embedded firmware skills is very marketable to ASML and KLA in particular.
- **Toshiba is not the strongest place to build a 20-year career:**
  - Its servo team outside Japan is small.
  - It depends on buying heads from TDK.
  - It is behind on HAMR.
  - Its private-equity owner will eventually seek an exit.
- Toshiba could still be a reasonable 3–7 year role, especially while it is investing heavily, and more so if it secures TDK's head business.

---

## 5. Key watch items, 2026–2028
1. The outcome of the TDK head-business sale: Seagate vs Toshiba vs a JV vs no sale, plus the antitrust review [V].
2. Whether Toshiba's M12 28TB CMR qualification and its 40TB-class drive ship on schedule, and when Toshiba first ships HAMR in volume [V/E].
3. The Philippines ramp. Watch whether Toshiba's exabyte share moves from about 10% toward 15% or more by FY2027 [E].
4. JIP exit planning, either a re-IPO or carve-outs. The power-chip consolidation talks are a signal [V].
5. HAMR yields at Seagate and WD (WD's 40TB HAMR in 2H 2026), which set the competitive bar for Toshiba [V].

---

## Sources
- Blocks & Files: "Distant third HDD maker Toshiba spending $380 million to catch up" (Oct 6, 2026). https://www.blocksandfiles.com/disk/2026/10/06/distant-third-hdd-maker-toshiba-spending-380-million-to-catch-up/5301322
- Blocks & Files: "Seagate and Toshiba both want to acquire TDK's disk read/write head business" (Oct 2026). https://www.blocksandfiles.com/disk/2026/10/06/seagate-and-toshiba-both-want-to-acquire-tdks-disk-read/write-head-business/5301393
- NAND Research: "The fight for TDK's HDD head business". https://nand-research.com/the-fight-for-tdks-hdd-head-business/
- TrendForce: "Seagate, Toshiba reportedly vie for TDK's HDD head unit" (Oct 6, 2026). https://www.trendforce.com/news/2026/10/06/news-seagate-toshiba-reportedly-vie-for-tdks-hdd-head-unit-a-key-independent-supply-source/
- TrendForce: "AI data center demand revives HDD demand; TDK, Hoya, Resonac expand capacity" (Jul 22, 2026). https://www.trendforce.com/news/2026/07/22/news-ai-data-center-demand-revives-hdd-demand-japanese-component-makers-tdk-hoya-resonac-expand-capacity/
- Tom's Hardware: "Seagate and Toshiba battle for TDK's HDD head business". https://www.tomshardware.com/pc-components/hdds/seagate-and-toshiba-battle-for-tdks-hdd-head-business-a-critical-hard-drive-component-multi-billion-dollar-deal-threatens-sole-independent-supplier-as-shortages-intensify
- XenoSpectrum: "TDK HDD head supply competition". https://xenospectrum.com/en/tdk-hdd-head-supply-competition/
- Guru3D: "Toshiba plans to double datacenter HDD output as 65TB drives approach". https://www.guru3d.com/story/toshiba-plans-to-double-datacenter-hdd-output-as-65tb-drives-approach/
- Asianet Newsable: "WDC, STX stocks slide: the Toshiba connection". https://newsable.asianetnews.com/markets/wdc-stx-stocks-slide-up-to-10-what-s-the-toshiba-connection-articleshow-ko3x0he
- MarketScreener / MT Newswires: "Toshiba to invest 60 billion yen to double HDD production in Philippines" (Oct 1, 2026). https://www.marketscreener.com/news/toshiba-to-invest-60-billion-yen-to-double-hdd-production-in-philippines-ce785ddadd8ef222
- TechRadar: "Toshiba wants to launch a 55TB hard drive by 2030". https://www.techradar.com/pro/toshiba-wants-to-launch-a-55tb-hard-drive-by-2030-40tb-model-set-to-appear-in-2026-new-slides-show
- Blocks & Files: "Toshiba joins 24TB CMR and 28TB SMR club" (Sep 2024). https://www.blocksandfiles.com/disk/2024/09/10/toshiba-joins-24-tb-cmr-and-28-tb-smr-disk-drive-club/1588214
- Toshiba: "Announces 24TB CMR and 28TB SMR enterprise HDDs". https://toshiba.semicon-storage.com/eu/company/news/2024/09/storage-20240909-11.html
- Blocks & Files: "Disk drive capacity shipments out to 2030 forecast to rocket upwards" (1Q25 vendor data; May 2025). https://www.blocksandfiles.com/container-storage/2025/05/17/disk-drive-capacity-shipments-out-to-2030-forecast-to-rocket-upwards/1610577
- Toshiba Integrated Report 2025 (financial section). https://www.global.toshiba/content/dam/toshiba/ww/ir/corporate/finance/annual-report/pdf/ar2025/tir2025e_a3_03.pdf
- Wirth Consulting: "Toshiba sees big surges in operating income, net income" (1H FY2025). https://www.wirthconsulting.org/toshiba-sees-big-surges-in-operating-income-net-income/
- Wirth Consulting: "Revenue growth modest for Toshiba, but profit and net income soar" (May 2026). https://www.wirthconsulting.org/revenue-growth-modest-for-toshiba-but-profit-and-net-income-soar/
- Wirth Consulting: "Toshiba reports stellar first-quarter results" (Q1 FY2026). https://www.wirthconsulting.org/toshiba-reports-stellar-first-quarter-financial-results-soaring-profit-and-income/
- TechRadar: "Toshiba cutting thousands of jobs as restructuring continues" (May 2024). https://www.techradar.com/pro/toshiba-cutting-thousands-of-jobs-as-restructuring-continues
- Business Today: "Toshiba to cut 4,000 jobs". https://www.businesstoday.in/world/story/toshiba-to-cut-4000-jobs-in-restructuring-drive-429808-2024-05-16
- Toshiba Motif blog: "My 2024 summer internship at Toshiba America Electronic Components" (HDD SSW servo team, San Jose). https://storage.toshiba.com/corporateblog/post/2024/09/10/my-2024-summer-internship-at-toshiba-america-electronics-corporation-by-hyungyu-lee
- Toshiba: "HDD Technology Center" release (Ome, 2011). https://toshiba.semicon-storage.com/content/dam/toshiba-ss-v3/ncsa/en_us/news/assets/Toshiba_HDD_Technology_Center_Release.pdf
- TDSC: "Unify business unit operating bases" (2021). https://toshiba.semicon-storage.com/tw/company/news/news-topics/2021/06/corporate-20210622-1.html
- StorageNewsletter: "Toshiba could stop or sell HDD business" (2016). https://www.storagenewsletter.com/2016/01/26/toshiba-could-stop-or-sell-hdd-business/
- TechTarget: "Toshiba's $15B buyout won't affect storage businesses". https://www.techtarget.com/it-infrastructure/news/365534207/Toshibas-15B-buyout-wont-affect-storage-businesses
- TDK FY Mar-2025 results presentation. https://www.tdk.com/system/files/2025_4q00_09YwIctV_en.pdf
- NHK Spring FY Mar-2026 results presentation. https://www.nhkspg.co.jp/hubfs/nhkspg.co.jp/en/pdf/ir/library/meeting/2026/2026_03_en.pdf
- NHK Spring 1H FY2025 script. https://www.nhkspg.co.jp/hubfs/nhkspg.co.jp/en/pdf/ir/library/meeting/2026/2026_03_2_script_en.pdf
- Hoya Integrated Report 2026, IT Business review. https://www.hoya.com/ir/2026/en/review/it.html
- AnandTech: "Seagate signs HAMR deal with Showa Denko". https://www.anandtech.com/show/16755
- Marvell Form 10-K FY2026. https://www.sec.gov/Archives/edgar/data/1835632/000183563226000011/mrvl-20260131.htm
- Broadcom Annual Report FY2025. https://www.sec.gov/Archives/edgar/data/1730168/000119312526085733/d46845dars.pdf
