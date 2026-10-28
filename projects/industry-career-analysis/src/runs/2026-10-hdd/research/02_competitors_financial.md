# HDD Competitors: Financial and Market Analysis (SSD/NAND, Tape, Emerging Archive Media)

*Prepared: 28 October 2026. Storage-industry financial analysis for the "HDD Market Analysis" project (task 2b).*

**How to read the numbers**
- **[Reported]** means the figure comes from a company filing or a named research firm (TrendForce, Gartner, Counterpoint, LTO Program) and has a source below.
- **[Derived]** means I calculated it from reported figures.
- **[Estimate]** means it is my analyst judgement. Treat it as a range, not a fact.
- Research limit: the web-search budget ran out partway through this work. Two gaps remain. Full-year NAND revenue for 2018–2022 is not sourced from 2026 material. A dollar figure for the tape market is not available. Both are flagged where they appear.

---

## 0. Executive summary

1. **NAND flash is in a historic AI-driven supercycle.**
   - The top-5 suppliers' NAND revenue went from about $14.7B in 2Q25 to **$68.9B in 2Q26**, a 4.7x increase in one year. Growth was +77% quarter-on-quarter (QoQ) in 2Q26 and +84% QoQ in 1Q26 (TrendForce).
   - Gartner forecasts 2026 NAND revenue at **+372% year-on-year (YoY)**.
   - Sandisk management expects the NAND market to **exceed $300B in CY2026 and approach $500B in CY2027**.
2. **Enterprise SSD (eSSD) is the main growth engine.**
   - Top-5 eSSD revenue rose from about $9.9B in 4Q25 to about $18.5B in 1Q26 and **$37.6B in 2Q26**, up 104% QoQ.
   - Samsung leads with about 38% of the top-5 total. SK hynix/Solidigm is second at about 23%.
3. **NAND makers' margins are higher than at any point in memory history.**
   - Micron FQ4'26 (Sept 2026): 87.0% non-GAAP gross margin (GM), on $54.2B revenue.
   - Sandisk FQ4'26 (June 2026): 84.6% GM, with guidance of 83–85%.
   - These are well above the HDD makers, whose GM is about 58% and is also at a record.
4. **The 2025–26 shortage hit both HDD and NAND, and it widened the price gap in HDD's favour.**
   - Nearline HDD lead times went beyond 52 weeks, and output is sold out for 2026. This pushed hyperscalers toward QLC SSD in late 2025.
   - NAND prices then rose far faster than HDD prices:
     - TrendForce projected a +85–90% QoQ rise in overall NAND prices for 1Q26.
     - A 30TB QLC SSD went from $2,450 (2Q25) to about $15,100 (1Q26).
   - As a result, the QLC-to-HDD $/TB multiple went from **about 5–6x in mid-2025 to about 13–22x in 1H26**.
   - Net effect: **HDD makers benefited strongly.**
     - Seagate FQ1'27: revenue $4.23B vs $2.63B a year earlier; GM 57.8% vs 40.1%.
     - WD FQ1'27: revenue $4.4B (+55%); GM 58.1%, with guidance of 60–61%.
     - The TCO case for replacing nearline HDD with QLC was set back by at least 2–3 years.
5. **Structurally, flash keeps taking share at the margin, but HDD still holds most data-centre capacity.**
   - HDD makers shipped about 470 EB in a single quarter (Seagate 218 EB, WD 248 EB). About 89–90% of Seagate's EB is nearline.
   - Leading independent forecasts expect HDD exabyte shipments to keep growing into the early 2030s:
     - Furthur Market Research (John Monroe) sees HDD peaking at about 4.7 ZB/year in 2031.
     - Coughlin Associates sees "no sign" of SSDs significantly replacing nearline HDD.
   - Pure Storage (renamed **Everpure**) still claims "no new HDDs sold after 2028". Its large hyperscale DirectFlash win, reported to be at Meta, is real: commitments for "tens of exabytes" run into 2028. But the 2028 claim is not supported by HDD-maker volumes or by any independent analyst.
6. **Tape is a stable niche, not a threat to nearline HDD.**
   - LTO shipped 176.5 EB (compressed) in 2024, a record, and 160.3 EB in 2025 (−9%).
   - 1Q26 was up about 57% YoY on the LTO-10 ramp (40TB native cartridge from Jan 2026).
   - Tape competes with the cold end of HDD (archive), not with the active nearline tier.
7. **Emerging media (glass, ceramic, DNA) are not commercially relevant before 2028–2030.**
   - Microsoft Project Silica is in pilots, with enterprise availability expected 2027–2030.
   - Cerabyte targets more than 100 PB per rack by 2029–30. It is backed by WD, Pure and In-Q-Tel.
   - DNA storage remains at research and very early startup stage.

---

## 1. Who the competitors are

### 1.1 NAND/SSD manufacturers (vertically integrated)
| Company | Notes | 2Q26 NAND rev [Reported, TrendForce] | 2Q26 eSSD rev [Reported, TrendForce] |
|---|---|---|---|
| Samsung | NAND #1. Share fell to 29.3% in 2Q26. 3Q26 preliminary operating profit KRW 107.4T (record, +783% YoY), driven mostly by HBM/DRAM | ~$23.06B (+70.7% QoQ) | ~$14.35B |
| SK hynix + Solidigm | Solidigm (ex-Intel NAND) leads high-capacity QLC (61/122TB) | >$14.27B (+89.5%) | >$8.63B |
| Micron | Moved up to #3 in NAND in 2Q26. 6600 ION 245TB QLC began shipping May 2026 | $11.85B (+99.2%) | ~$6.98B (+126%) |
| Kioxia | JV with Sandisk (BiCS). Kitakami K2 fab ramping | ~$10.72B (+79.9%) | $4.64B |
| Sandisk | Spun off from WD in Feb 2025. UltraQLC 128TB (2025); roadmap 256TB (2026) and 512TB (2027) | ~$8.97B (+50.7%) | ~$2.98B (+103%) |
| YMTC (China) | **#3 by bit shipments in Q2 2026 (14%, tied with Kioxia)** per Counterpoint. Ranks lower by revenue because its mix is consumer-heavy. Expected to push into eSSD in 2H26 | n/a (not in TrendForce top 5) | small |

Counterpoint puts the **total** NAND market at **$46B in 1Q26**, 3.5x YoY. Samsung had 29% and YMTC 13%, up from 8%.

### 1.2 All-flash system vendors that market directly against HDD
- **Everpure (formerly Pure Storage).**
  - Uses its own DirectFlash Modules (DFM) built from raw NAND. Claims 75TB modules shipping, 150TB available, and a 300TB roadmap.
  - Long-standing claim: **"no new HDDs will be sold after 2028."**
  - Q2 FY27 (ended 2 Aug 2026): revenue $1.2B (+38% YoY). FY27 guidance raised to $5.05B.
  - GM was 68.4%, held at the low end of its range because of NAND cost inflation.
  - Free cash flow was −$238M because it stockpiled NAND.
  - Expects hyperscaler DirectFlash commitments to extend into calendar 2028, covering **"tens of exabytes"**. This is the hyperscaler deal widely reported as Meta.
- **VAST Data.** Raised $1B at a **$30B valuation** in March 2026. It is all-flash (QLC) and wins mainly at AI neoclouds such as CoreWeave. Its co-founder has argued that neoclouds stay all-flash. Seagate's CEO countered in July 2026 that neoclouds are adopting tiered HDD+flash designs.
- **Counter-position from the HDD camp: VDURA.** It argues for mixed fleets and publishes a "Flash Volatility Index" showing that the SSD price surge made all-flash about 4x more expensive than a mixed fleet over three years. It is a vendor with a commercial interest in this view.

### 1.3 Tape
- **LTO consortium.** The technology provider companies are HPE, IBM and Quantum. The only media makers are **Fujifilm and Sony**.
- **IBM** also sells the proprietary TS11xx (3592) enterprise tape format.
- LTO-10: 30TB native (June 2025), then a **40TB native / 100TB compressed** cartridge from January 2026. The roadmap runs to LTO-14 at about 365TB native.

### 1.4 Emerging archive media
- **Microsoft Project Silica** (laser-written glass): more than 7TB per DVD-size, 2mm-thick platter; write-once read-many. Pilots 2025–27, enterprise archive availability 2027–30 (Microsoft's own projection), wide data-centre use 2030–35. Femtosecond lasers are the main cost barrier.
- **Cerabyte** (ceramic on glass): pilot rack of 1 PB in 2025/26; target of more than 100 PB per rack and over 2 GB/s by 2029/30. Claims about $1/TB vs about $2/TB for tape and media life over 100 years. Investors include Western Digital, Pure Storage, In-Q-Tel and the EIC; it has raised about $14M plus grants.
- **DNA storage** (Atlas Data Storage, Catalog and others): research or early startup stage. Write cost and speed are still orders of magnitude away from competing with tape or HDD this decade [Estimate].
- Monroe estimates that all optical media accounted for less than 1 EB/year (under 0.5% of shipped EB in 2025).

---

## 2. NAND / SSD financials

### 2.1 NAND industry revenue, 2018 to 2026E

| Year | NAND revenue (USD) | Basis |
|---|---|---|
| 2018 | ~$57–63B | Approximate. Historical consensus, **not re-verified in this session** |
| 2019 | ~$45–47B | Approximate, not re-verified |
| 2020 | ~$55–57B | Approximate, not re-verified |
| 2021 | ~$66–69B (prior peak) | Approximate, not re-verified |
| 2022 | ~$61B | [Derived] from 2023 at −39.9% YoY |
| 2023 | **$36.7B** (the trough; Yole: "just under $40B", lowest since 2016, operating margins down to −30% to −50%) | [Reported] |
| 2024 | **~$67B** (TrendForce forecast of $67.4B, +77%) | [Reported forecast] |
| 2025 | **~$65B for the top 5 / ~$70–72B total market** (quarterly top-5: 1Q ~$12.0B, 2Q $14.67B, 3Q ~$17.1B, 4Q $21.17B) | [Derived] from TrendForce quarterlies, with the top 5 at about 91–93% share |
| 1H26 | Top 5: 1Q $38.9B, 2Q $68.9B, so **about $108B in six months** | [Reported] TrendForce |
| **2026E** | **About $300–340B** | Gartner +371.9% YoY. Sandisk: "exceed $300B". [Estimate] range |
| 2027E | Approaching $500B (Sandisk management). Gartner puts total memory at $1,075B, up from $837B in 2026 | [Reported forecast] |

The 2025–26 surge is driven almost entirely by price, not volume. About two-thirds of Sandisk's sequential growth came from price. Sellable bit growth is only in the mid-teens percent. TrendForce projected 1Q26 NAND prices at +85–90% QoQ, after +20–25% in 4Q25 and +5–10% in 4Q25 for eSSD contracts.

### 2.2 Enterprise SSD revenue

| Period | Top-5 eSSD revenue | QoQ change |
|---|---|---|
| 2Q25 | ~$5.1B | [Derived] |
| 3Q25 | ~$6.5B | +28% [Reported] |
| 4Q25 | >$9.9B | +51.7% [Reported] |
| 1Q26 | ~$18.5B | +86.1% [Reported] |
| 2Q26 | **$37.6B** | +103.6% [Reported] |
| 3Q26 / 4Q26 | TrendForce expects further increases. 4Q26 orders may exceed 3Q26 | n/a |
| **2025 full year** | **About $25–28B** | [Estimate] |
| **2026 full year** | **About $140–170B** | [Estimate]. Assumes 3Q/4Q at $45–55B each |

Allied Market Research's pre-AI forecast of $46.9B by 2030 has already been far exceeded in nominal dollars. Pre-2025 market-research CAGRs (about 10–15%) are obsolete.

### 2.3 Profitability, capex and supply

**Gross margins and operating results**
- **Micron FY26** (ended Sept 2026): revenue $133.2B, up from $37.4B in FY25. Non-GAAP GM 81.1%, rising to **87.0% in FQ4**. Operating margin 82.3% in FQ4. FQ1'27 guidance: revenue $61.5B and GM about 86%.
- **Sandisk FY26** (ended July 2026): revenue $20.25B (+175%), of which data centre $5.15B (+437%). GM 71.6% for the year and **84.6% in FQ4**. FQ1'27 revenue guidance is $10.3–10.8B.
  - Remaining performance obligations under long-term agreements (LTAs) are **$91B**, with at least $93.9B of revenue expected at floor prices.
  - LTAs will cover more than 50% of bits in FY27 and about two-thirds in FY28.
  - Data centre went from 12% of bits to 38% in one year.
- **Samsung 3Q26 preliminary:** revenue KRW 195T and operating profit KRW 107.4T. The full divisional breakdown is due 29 Oct 2026.
- **For comparison, HDD makers in the same period:**
  - Seagate FQ1'27: GM 57.8%, operating margin 50.7% (non-GAAP).
  - WD FQ1'27: GM 58.1%, guiding 60–61%.

**Capex (TrendForce, Nov 2025)**
- NAND capex: $21.1B in 2025 and **$22.2B in 2026 (+5%)**. DRAM capex: $53.7B rising to $61.3B.
- Kioxia/Sandisk spending is about $4.5B (+41%). Micron NAND capex is +63%.
- TrendForce says there will be **"virtually no new [NAND] production capacity in 2026."** New greenfield fabs arrive late 2027 to 2028. Samsung's V10 (430-layer) has slipped to 2027 or later.
- Sandisk expects capex of about 6% of revenue.

**Supply outlook**
- Sandisk says supply stays on allocation beyond CY2027.
- Samsung and Micron say tight through 2028.
- Phison's CEO talks of imbalance until about 2030.

### 2.4 Bit growth and long-run demand
- At FMS 2025, Micron (T. Grossi) put 2024–2030 CAGRs as follows:
  - NAND bit demand: about 21%.
  - Enterprise-storage eSSD bit demand: **54%**.
  - **Storage HDD bit demand: 26%.**
- Because flash starts from a much smaller base, both technologies grow capacity strongly.
- Monroe (Furthur Market Research, March 2026):
  - SSD exabyte shipments **never exceed about 8 ZB/year**. He cut this from 9.5 ZB.
  - **HDD rises to about 4.7 ZB/year in 2031**. He raised this from 4.3 ZB.
  - Vendor margins: SSD above 50%, HDD above 45%.
  - User storage spend: $224B in 2030, more than double his prior forecast.

---

## 3. Tape (LTO)

| Year | LTO shipped capacity (EB, compressed at 2.5:1) | YoY |
|---|---|---|
| 2018 | dip (Fujifilm–Sony patent dispute) | n/a |
| 2020 | dip (COVID) | n/a |
| 2021 | 148 | rebound |
| 2022 | about flat | ~0% |
| 2023 | ~153 [Derived from 2024 at +15.4%] | modest |
| 2024 | **176.5 (record)** | +15.4% |
| 2025 | **160.3** | −9.2% (trade-related procurement caution per Coughlin; buyers waiting for LTO-10) |
| 1Q26 | ~63 [Estimate, Blocks & Files] | **+57% YoY** (LTO-10 ramp, AI archive, cyber air-gap) |
| 2026E | ~200–250 if 1Q is representative [Estimate; Blocks & Files calls it "a big if"] | n/a |

- In native terms, 2025 was about 64 EB, against about 2 ZB/year of HDD shipments. **Tape is roughly 3% of HDD exabytes** [Derived/Estimate].
- Monroe puts tape user acquisition cost below $0.30/TB. That is about 50x cheaper than nearline HDD at the media level, but with slow access.
- Tape market size in USD: **no 2025–26 figure was sourced.** Industry estimates usually put it at roughly $4–6B per year for media, drives and libraries [Estimate, unverified]. That is a fraction of the HDD (about $25B+/yr run-rate) and NAND markets.
- Conclusion: tape takes cold archive data that might otherwise sit on high-capacity HDD. It is not a substitute for the online nearline tier. Its share of exabytes is small and broadly stable.

---

## 4. HDD vs SSD economics

### 4.1 $/TB and the price-gap multiple over time

| Date | Nearline HDD $/TB | Enterprise QLC/TLC SSD $/TB | Multiple | Source |
|---|---|---|---|---|
| Pre-shortage (2023–24) | ~$12–15 | ~$60–90 | ~5–7x | WD ("6–10x"); industry |
| Mid-2025 | ~$15 ($0.015/GB) | ~$90 ($0.09/GB) | **6x** | Micron, FMS 2025 |
| 2Q25 | ~$16.7 (implied) | QLC 30TB $2,450, about $82 | **4.9x** | VDURA via Blocks & Files |
| Oct 2025 | $15–16 ($0.015–0.016/GB, up from $12–13) | rising | n/a | TrendForce |
| 1Q26 | ~$22 (implied; HDD prices +35% since 2Q25) | QLC 30TB ~$15,121, about $504; TLC 30TB $11,000–17,500 | **~16x to 22.6x** | VDURA / TraxTech |
| 2026 peak (forecast) | >$15 vendor ASP | >$200 vendor ASP | **>13x** | Monroe (Furthur), Mar 2026 |
| Oct 2026 (retail, not hyperscale) | SATA $38.7 median; SAS $35.2 | NVMe $226 median | 5.8–6.4x | DatacenterDisk |
| Long-run floors | Never below $7.50 | Never below $15 | about 2x floor | Monroe |

**Takeaway**
- Before the shortage, the QLC-to-HDD gap had narrowed to about **5–6x**. Flash advocates (Pure, Solidigm) were arguing that TCO (power, density, rack space, longevity) closes a 5x purchase gap at hyperscale.
- The AI-driven NAND spike **reopened the gap to about 13–22x in 1H26.** At that level the TCO argument fails for bulk capacity.

### 4.2 TCO arguments from each side

**Flash camp (Pure/Everpure, Solidigm, VAST, Micron)**
- Density: about 1 TB/cm³ vs 0.1 TB/cm³ for HDD. A single 245–300TB module equals 8–10 HDDs.
- Power: SSD uses about 40–125 mW/TB vs about 200 mW/TB for HDD (Micron). TrendForce puts the saving at about 30% for QLC vs nearline.
- Pure claims a 10-year module life, fewer failures and less rack space. Its targets are about $0.10–0.15/GB for JBOD and $0.05–0.10/GB for deep capacity.
- 122TB drives are shipping (Solidigm, Samsung, Phison, Sandisk), and 245TB drives are shipping (Micron 6600 ION, May 2026). Sandisk targets 256TB in 2026 and 512TB in 2027. Everpure targets 300TB DFMs.

**HDD camp (Seagate, WD, Toshiba, VDURA)**
- Purchase price dominates TCO. At about 8W per drive, the QLC power saving is worth about $16 over 5 years, under $1/TB (DatacenterDisk calculation at $0.15/kWh).
- Seagate HAMR (Mozaic 4+, 40–44TB, ramping with the top-2 CSPs) and WD (40TB UltraSMR ePMR, HAMR in volume 1H27, 100TB by about 2029) keep cutting HDD $/TB.
- NAND fab capex to replace HDD exabytes would be prohibitive. Industry NAND capex is only about $22B in 2026, adding little capacity. Replacing about 2 ZB/year of HDD output would require multiples of today's NAND bit output [Estimate].
- Hyperscalers use tiered architectures: flash for hot data and HDD for the 70–80% of data that is "not hot" (Monroe).

### 4.3 Share of data-centre exabytes
- HDD industry shipments are roughly **470–500+ EB per quarter**: Seagate 218 EB (FQ4'26), WD 248 EB (FQ1'27, +22% YoY), plus Toshiba. That is about **2 ZB/year**, and about 85–90% of it is nearline/data-centre [Reported/Derived].
- The commonly cited "~90% of hyperscale/cloud data stored on HDD" is an HDD-vendor talking point. It is consistent with eSSD being only about 3–20% of enterprise storage exabytes, which is Micron's FMS 2025 chart range. I could not verify an independent 2026 measurement [Estimate: HDD holds about 80–90% of data-centre capacity exabytes].
- Gartner (2022) projected enterprise SSD would reach about 35% of HDD+SSD enterprise exabytes by 2026. The 2025–26 HDD and NAND shortages likely kept the real figure below that [Estimate].

### 4.4 Analyst views on QLC displacing nearline HDD by 2030

| Analyst | View |
|---|---|
| **TrendForce** (Sept–Oct 2025) | HDD shortage plus AI inference makes QLC "poised for breakout in 2026", with QLC at about 30% of eSSD. Later (Sept 2026) it warned the **widening SSD/HDD price gap could erode SSD's TCO advantage** |
| **Furthur / John Monroe** (Mar 2026) | HDD exabytes grow to about 4.7 ZB in 2031, then decline to end-of-life around 2043. SSD caps out below 8 ZB/year. **No displacement by 2030** |
| **Coughlin Associates** | "No sign" of SSDs significantly replacing mass-capacity nearline HDD. Forecasts rising HDD capacity shipments to 2030 |
| **Micron** (FMS 2025) | eSSD in storage grows 54% CAGR, but HDD storage bits still grow 26% CAGR to 2030. Coexistence |
| **Everpure** | HDD sales end after 2028. Real hyperscale win, but timeline not supported by data |
| **Investor commentary** (Oct 2026) | "Tiered collaboration rather than one medium completely replacing the other"; full replacement "uneconomical for the foreseeable future" |

**My view [Estimate]:** QLC will keep gaining in AI-adjacent warm tiers and at specific hyperscalers (Meta via Everpure). It may reach about 20–30% of data-centre capacity exabytes by 2030. Nearline HDD exabytes still grow about 15–25% a year through 2030, and **HDD keeps most data-centre capacity at least through 2030.** The biggest risk to HDD is a NAND oversupply crash in 2028–29, once the new fabs land and LTA pricing floors expire. That could take the gap back to about 3–5x.

---

## 5. Key question: when NAND became tight and expensive, did HDD benefit?

**Yes, strongly. It is the best period in HDD-industry history.**

**Sequence of events**
1. **Mid-2025:** AI inference and data retention drove up demand for nearline capacity. HDD makers had underinvested because they expected flash to erode demand.
   - Nearline lead times rose from weeks to **more than 52 weeks**. Drives of 32TB and above waited more than a year, and some were on backorder for up to about 2 years.
   - WD raised prices on all HDDs (Sept 2025). HDD $/GB went from $0.012–0.013 to $0.015–0.016.
2. **3Q–4Q25:** Hyperscalers (reportedly Microsoft and Meta) shifted orders to QLC SSD to cover the HDD gap. This was the near-term threat to HDD.
3. **4Q25–1H26:** This extra QLC demand landed on a NAND industry with almost no capacity growth.
   - NAND prices rose about 20–25% in 4Q25 and about 85–90% in 1Q26.
   - A 30TB QLC drive went up about 6x in price. HDD prices rose only about 35–46%.
   - **SSD lost much of its cost competitiveness.** The SSD/HDD multiple went from about 5x to about 16–22x.
4. **Result for HDD makers:**
   - WD is sold out for CY2026 with firm purchase orders from its top 7 customers. Seagate is fully allocated through 2026.
   - Multi-year LTAs run into 2028–29.
   - Seagate GM rose from about 40% to 57.8% YoY, and FQ2'27 revenue guidance is $4.8B.
   - WD GM is 58.1%, with guidance of 60–61% and FQ2'27 revenue of about $5.1B. WD shipped 248 EB (+22%) in the quarter.
   - Price per TB is rising (Seagate about +10–20% YoY), a reversal of decades of $/TB deflation.
5. **The relief is partial.**
   - NAND makers benefited even more. Their GM is about 85%, against about 58% for HDD makers.
   - Flash vendors locked in long-term hyperscaler commitments (Sandisk RPO about $91B; Everpure "tens of EB" to 2028).
   - HDD makers face higher DRAM/NAND costs for the cache and controller components inside HDDs. WD is offsetting this through value engineering.
   - When NAND supply catches up (2028+), the price gap will narrow again.

**Implication for the HDD outlook (input to Report 3):** The AI cycle proved that HDD is the only medium that can deliver bulk exabytes at scale and low $/TB. That proof buys the HDD industry a strong 2026–2028. The medium-term risk is cyclical, not technological: a NAND glut after 2028 could revive the QLC substitution push.

---

## Sources
- TrendForce, 2Q26 eSSD ranking (1 Sep 2026): https://www.trendforce.com/presscenter/news/20260901-13210.html
- TrendForce, 2Q26 NAND ranking (18 Aug 2026): https://www.trendforce.com/presscenter/news/20260818-13186.html
- Evertiq, 1Q26 NAND +84% (TrendForce): https://evertiq.com/news/2026-05-26-nand-flash-revenues-surge-84-in-q1-as-ai-demand-drives-shortage
- TrendForce, 4Q25 NAND ranking and 1Q26 price outlook: https://www.trendforce.com/presscenter/news/20260303-12943.html
- TrendForce, 4Q25 eSSD ranking: https://www.trendforce.com/presscenter/news/20260313-12967.html
- TrendForce, 3Q25 NAND ranking: https://www.trendforce.com/presscenter/news/20251203-12813.html
- Evertiq, 2Q25 NAND revenue: https://evertiq.com/news/2025-08-28-nand-flash-revenue-surged-over-20-in-2q25
- TrendForce, 2026 capex: https://www.trendforce.com/presscenter/news/20251113-12780.html
- TrendForce, Kioxia/Sandisk capex: https://www.trendforce.com/news/2026/06/01/news-japan-u-s-nand-alliance-steps-up-investment-as-kioxia-sandisk-capex-reportedly-rises-40-yoy/
- TrendForce, HDD shortage drives nearline SSD (Oct 2025): https://www.trendforce.com/presscenter/news/20251014-12744.html
- I-Connect007/TrendForce, nearline HDD shortage, QLC breakout: https://mail.iconnect007.com/article/146928/soaring-inference-ai-demand-triggers-severe-nearline-hdd-shortages-qlc-ssd-shipments-poised-for-breakout-in-2026/146925/pcb
- TechRadar, HDD lead times >52 weeks: https://www.techradar.com/pro/surging-ai-demand-for-hdd-means-that-you-may-have-to-wait-up-to-a-year-for-32-tb-hard-disk-drives-warns-research-and-yes-prices-are-also-going-up
- Xenospectrum, eSSD/QLC 4Q26: https://xenospectrum.com/en/enterprise-ssd-qlc-demand-4q26/
- Gartner semiconductor forecast (24 Aug 2026): https://www.gartner.com/en/newsroom/press-releases/2026-08-24-gartner-forecasts-worldwide-semiconductor-revenue-to-reach-1-trillion-dollars-in-2026
- Counterpoint via EMSNow, 1Q26 NAND $46B: https://www.emsnow.com/global-nand-memory-market-surges-to-a-record-46b-in-q1-2026-as-ai-demand-drives-massive-growth/
- Club386, YMTC #3 by shipments: https://club386.com/ymtc-overtakes-sandisk-micron/
- StorageNewsletter, 2023 NAND $36.7B: https://www.storagenewsletter.com/2024/04/05/2023-nand-flash-market-declining-y-y-at-40-on-36-7-billion/
- StorageNewsletter, TrendForce 2024/2025 NAND forecast: https://www.storagenewsletter.com/2024/07/30/dram-and-nand-flash-revenue-to-see-significant-increases-of-75-and-77-respectively-in-2024/
- Yole NAND Market Monitor: https://www.yolegroup.com/product/nand-market-monitor-/
- Blocks & Files, NAND 3Q24: https://www.blocksandfiles.com/flash/2024/11/28/nand-flash-revenue-rises-despite-bit-shipment-decline/1603215
- Micron FQ4'26 press release (SEC): https://www.sec.gov/Archives/edgar/data/0000723125/000072312526000018/a2026q4ex991-pressrelease.htm
- Sandisk FQ4'26 press release: https://www.sandisk.com/company/newsroom/press-releases/2026/2026-08-05-sandisk-reports-fiscal-fourth-quarter-2026-financial-results
- Sandisk FQ4'26 call highlights: https://www.marketbeat.com/instant-alerts/sandisk-q4-earnings-call-highlights-2026-08-06/
- TrendForce, Samsung 3Q26 preliminary: https://trendforce.com/news/2026/10/08/news-samsung-sees-3q26-operating-profit-soaring-783-to-record-krw-107-4-trillion-on-hbm4-memory-price-gains
- Seagate FQ1'27 press release (SEC): https://www.sec.gov/Archives/edgar/data/0001137789/000113778926000300/stxq12027pressreleasefinan.htm
- Blocks & Files, Seagate FQ4'26 EB and HAMR: https://www.blocksandfiles.com/disk/2026/07/30/seagate-hamring-customers-generating-more-and-more-/tb/5281058
- WD FQ1'27 call highlights: https://www.marketbeat.com/instant-alerts/transcript-western-digital-q1-earnings-call-highlights-2026-10-22/
- WD FQ1'27 press release: https://westerndigital.com/company/newsroom/press-releases/2026/2026-10-22-wd-reports-fiscal-first-quarter-2027-financial-results
- Mitrade, HDD vs SSD investment analysis (Oct 2026): https://www.mitrade.com/insights/news/live-news/article-8-2135221-20261003
- Blocks & Files, Everpure Q2 FY27: https://www.blocksandfiles.com/flash/2026/08/27/everpure-the-artist-formerly-known-as-pure-storage-ramps-up-growth-rate/5292871
- Computer Weekly, Pure "HDDs dead by 2028": https://www.computerweekly.com/feature/Pure-HDDs-dead-by-2028-and-our-flash-will-replace-it
- Blocks & Files, VAST $30B valuation: https://www.blocksandfiles.com/flash/2026/03/11/vast-data-raises-1b-at-30b-valuation-as-ai-storage-demand-surges/5208106
- Blocks & Files/VDURA, QLC 22.6x HDD: https://www.blocksandfiles.com/flash/2026/04/08/vdura-says-30-tb-qlc-ssd-capacity-now-costs-226x-more-than-hdd/5214761
- VDURA, hyperscaler HDD demand: https://www.vdura.com/2026/05/04/hyperscaler-hdd-demand/
- TraxTech, SSD/HDD price divergence: https://www.traxtech.com/ai-in-supply-chain/ssd-hdd-price-divergence-forces-datacenter-storage-architecture-reassessment-as-nand-shortage-persists
- DatacenterDisk, QLC vs HDD economics 2026: https://datacenterdisk.com/reports/qlc-vs-hdd-economics-2026
- Glenn Lockwood, storage shortage notes: https://glennklockwood.com/garden/shortage
- Micron (T. Grossi), FMS 2025: https://files.futurememorystorage.com/proceedings/2025/20250807_AIML-302-1_T.Grossi.pdf
- John Monroe (Furthur), Library of Congress DSA, Mar 2026: https://www.digitalpreservation.gov/meetings/DSA2026/0107_monroe_Library%20of%20Congress_DSA_09%20March%202026%20V11.83-Final.pdf
- Blocks & Files, Coughlin HDD forecast to 2030: https://www.blocksandfiles.com/container-storage/2025/05/17/disk-drive-capacity-shipments-out-to-2030-forecast-to-rocket-upwards/1610577
- Blocks & Files, Gartner eSSD 35% of EB by 2026 (2022): https://www.blocksandfiles.com/disk/2022/05/16/gartner-enterprise-ssds-will-hit-35-of-hdd/ssd-exabytes-shipped-by-2026/1615298
- TechRadar, Sandisk 256TB/512TB roadmap: https://www.techradar.com/pro/sandisk-plans-256tb-ssd-in-2026-and-512tb-ssd-in-2027-and-no-you-wont-be-able-to-install-it-in-your-desktop-computer
- Blocks & Files, tape 2025 decline / 2026 boom: https://www.blocksandfiles.com/tape/2026/09/04/tape-capacity-shipments-fell-in-2025-but-2026-could-be-a-boom-year-for-tape/5294464
- Xenospectrum, LTO rebound 2026: https://xenospectrum.com/en/lto-tape-shipments-rebound-2026/
- HPCwire, LTO 176.5 EB 2024: https://www.hpcwire.com/off-the-wire/lto-tape-shipments-reach-176-5-eb-in-2024-marking-15-4-growth/
- Fujifilm, LTO-10 40TB: https://www.fujifilm.com/am/en/news/Fujifilm-Launches-LTO-Ultrium-10_40TB-Data-Cartridge
- Blocks & Files, Project Silica: https://www.blocksandfiles.com/ai-ml/2025/12/23/project-silicas-glass-storage-archive-tech-progress/1718160
- Blocks & Files, Cerabyte roadmap: https://www.blocksandfiles.com/data-management/2025/07/02/cerabyte-promises-fast-dense-low-cost-tape-alternative-by-2030/1595617
- Blocks & Files, Cerabyte WD backing: https://www.blocksandfiles.com/storage-management/2025/05/12/cerabyte-gains-backing-from-western-digital/1589433
