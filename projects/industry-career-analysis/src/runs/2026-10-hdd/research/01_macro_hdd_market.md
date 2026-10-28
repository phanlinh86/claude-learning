# HDD Market Research — Part 1 (Macro / Tech Market) and Part 2a (HDD Market Financials)

*Prepared: October 28, 2026. Analyst notes for the "HDD Market Analysis" project.*

**How to read this report.** The numbers come from company press releases and SEC filings, Gartner press releases, Moody's and Citi as reported by the press, TRENDFOCUS data via StorageNewsletter, and Tom Coughlin's Forbes industry updates. Figures marked **[EST]** are my own estimates or derivations. Figures marked **[approx., pre-2023]** are rough historical values that I could not re-verify in this session. Most data runs to the September 2026 quarter: Western Digital reported FQ1 FY27 on Oct 22, 2026, and Seagate reported FQ1 FY27 on Oct 27, 2026.

---

## Executive summary

1. **The HDD market is in an AI-driven supercycle.** The two leaders posted the highest margins in the industry's history in the September 2026 quarter:
   - **Seagate:** revenue $4.23B (+61% YoY), non-GAAP gross margin 57.8%, non-GAAP operating margin 50.7%.
   - **Western Digital:** revenue $4.38B (+55% YoY), non-GAAP gross margin 58.1%, non-GAAP operating margin 49.1%.
   - **December 2026 quarter guidance:** Seagate $4.8B; WD $5.1B with 60–61% gross margin.
2. **Industry revenue has roughly doubled in two years.**
   - 2023: about $13.4B (trough, derived).
   - 2024: $19.8B.
   - 2025: $23.3B, on 124.3M units and 1.62 ZB (Coughlin, Feb 2026).
   - **2026 [EST]: about $35–37B.** Seagate calendar 2026 revenue is about $15.8B and WD about $16.6B, both derived from reported and guided quarters. Toshiba adds an estimated $4–4.5B.
3. **Units are flat while exabytes and price rise.**
   - Units fell from about 375M in 2018 [approx.] to about 124M in 2023–2025 and have flattened there.
   - Exabytes grew 49% in 2024 and 22% in 2025. I estimate about +25–30% for 2026, to about 2.0–2.1 ZB [EST].
   - Price per TB is now *rising*. WD's ASP/TB was up 28% YoY in the September 2026 quarter. That reverses a decades-long trend of roughly 10%/yr declines.
4. **Demand is contracted years out.**
   - Seagate: most nearline supply is under long-term agreements (LTAs) through CY2028, and some cloud LTAs run through CY2030. Drives are build-to-order, with configurations and prices fixed about 12 months ahead.
   - WD: visibility "through 2030 and 2031" with its top 7 customers.
   - Seagate: "no evidence of demand destruction or product cancellations."
5. **The macro driver is real and still accelerating.**
   - Big-4 hyperscaler capex: about $251B in 2024, about $416B in 2025, and about $720–770B guided for 2026.
   - Moody's sees about $785B for hyperscalers in 2026, "close to $1T" in 2027.
   - Citi projects $5.35T cumulative for 2027–2030 across Amazon, Microsoft, Alphabet and Meta.
   - Gartner (July 2026) forecasts 2026 data center systems spending of $822B (+62.5%) and total IT spending of $6.37T (+14.2%).
6. **Key risks over 2026–2031:**
   - A pullback in AI capex. Meta's FCF has already compressed and the equity market is wary.
   - The pricing cycle normalizing as Toshiba doubles capacity and HAMR ramps.
   - QLC SSD substitution. This risk is currently *reduced* by NAND shortages.
   - Customer concentration. Cloud is about 88% of WD revenue.
   - Execution risk on HAMR.
   - Tariffs and China exposure.
   - Base-case structural exabyte growth is about 20–25% CAGR. Revenue growth is likely to slow sharply after 2027 as prices normalize.
7. **Market sizing differs widely by source** (detail in section 2a.7):
   - Mordor: $51.8B (2026) to $75.6B (2032), 6.6% CAGR. This uses a broader definition.
   - Coughlin (Dec 2025): $25–35B by 2030, already exceeded in 2026.
   - Coughlin: 6.5 ZB by 2030.
   - My base case: **about $45–55B of HDD revenue in 2030/2031**, assuming one digestion year. The bear case is about $28–35B and the bull case about $70B+.

---

# PART 1 — Overall tech market and its impact on HDD

## 1.1 Hyperscaler / cloud capex

**Capex by company ($B)**

| Company | 2024 (actual) | 2025 (actual) | 2026 guidance (latest) | 2027 signal |
|---|---|---|---|---|
| Amazon | ~83.7 | 131.8–134.7 | ~220 (raised from ~200; cites "higher cost of memory") | Most 2027 AI capacity already reserved; a meaningful part of 2028 committed |
| Microsoft | ~75.6 | ~118 incl. ~$29B finance leases (FY to Jun-26: $115.9B) | ~$175B CY26 (was ~$190B before a lease reclassification) | FY27 capex to grow YoY; Sept-qtr guide >$50B |
| Alphabet | ~52.6 | 91.4–91.5 | $195–205B (raised from $175–185B in Jan, then $180–190B in Apr) | Expected to "increase significantly" |
| Meta | ~39.2 | 69.7–72.2 | $130–145B | Compute to keep growing into 2028+ |
| **Big-4 total** | **~251** | **~416** | **~720–770** | Moody's: ~$1T in 2027 |
| Oracle | — | FY26 (to May-26): $55.7B | FY27 guide: up to $95B ($70B own + $20–25B customer-funded); RPO $638B | — |

**Sources and supporting data:**
- Platformonomics for 2025 and Q2-2026 figures; 247wallst/Citi; UncoverAlpha; Outlook Business for Oracle.
- Q2-2026 quarterly capex: Amazon $54.8B, Alphabet $44.9B, Microsoft $41B (incl. leases), Meta $31.1B.
- Big-4 capex growth for Q2-26 was +65% to +100% YoY.

**Cloud demand behind the capex:**
- AWS: +37% YoY, $496B backlog.
- Google Cloud: +82% YoY, $514B backlog.
- Azure: past $100B annual revenue, +43%. Microsoft commercial RPO is $678B.
- These backlogs underpin at least 2 more years of build-out.

**Third-party forecasts:**
- Moody's raised its hyperscaler capex forecast by $85B, to **$785B for 2026**, and sees it "closing in on $1T" by 2027.
- Citi: **$5.35T cumulative capex 2027–2030** for Amazon, Microsoft, Alphabet and Meta (Oct 21, 2026).

**What it means for HDD.** Most of this capex goes to GPUs, networking, power and shells. Storage is a single-digit percentage share. However, every AI cluster produces data that has to be ingested and retained: training corpora, checkpoints, logs, inference outputs and agent traces. Mass capacity at the lowest $/TB is still HDD. WD says about 80% of hyperscale data center data resides on HDD. Rising cloud backlogs directly support nearline exabyte demand 1–3 years out.

## 1.2 Enterprise IT spending (Gartner)

**Gartner forecasts (July 27, 2026 update)**

| Segment ($B) | 2025 | 2025 growth | 2026 | 2026 growth |
|---|---|---|---|---|
| Data center systems | 506 | +51.6% | 822 | **+62.5%** |
| Devices | 790 | +9.7% | 868 | +9.8% |
| Software | 1,271 | +13.9% | 1,468 | +15.5% |
| Services | 1,492 | +3.8% | 1,570 | +5.3% |
| IaaS | 222 | +25.3% | 287 | +29.3% |
| Communications services | 1,296 | +3.3% | 1,354 | +4.4% |
| **Total IT** | **5,577** | **+10.7%** | **6,369** | **+14.2%** |

- **Forecast revisions.** In April 2026 Gartner had forecast $6.31T (+13.5%) total and $788B (+55.8%) for data center systems. July revised both upward.
- **Gartner commentary:** "Building the compute capacity required for AI is the largest infrastructure project ever attempted by humanity." Gartner also flags "rising hardware and memory costs" and "semiconductor and memory supply constraints."
- **2027 outlook.** Press coverage of Gartner's later 2027 outlook says data centers account for about half of a roughly $961B 2027 IT spending increase. I could not fetch the source page, so treat this as unverified.

**Implication.** Data-center infrastructure is growing roughly 4–5x faster than overall IT. Devices are growing only about 10%, which supports the view that legacy HDD (PC and consumer) will not grow and nearline is the only engine.

## 1.3 Data growth (IDC Global DataSphere / StorageSphere)

- IDC publishes the *Worldwide IDC Global DataSphere Forecast, 2025–2029* and the *Global StorageSphere Forecast, 2025–2029*. Both are paywalled, and I could not retrieve current headline numbers in this session.
- **[Reference / approx.]** IDC's earlier published series put data created at about 120 ZB in 2023, about 147–180 ZB in 2025, and roughly 290–400 ZB by 2028–2029. That is a data-creation CAGR of about 20–25%. Only a small fraction of this, roughly 2%, is actually stored and retained.
- Coughlin (Dec 2025) projects HDD capacity shipments of about **6.5 ZB by 2030**. Tape capacity is projected at about 220 EB (2025), rising to more than 400 EB (2030).
- **The AI-specific shift.** WD and Seagate management now cite inference, agentic AI and physical AI as drivers: robotics, autonomous vehicles and factory automation generate sensor and video data. Customers are retaining data longer to re-train and audit. Seagate calls this "data creation, retention and reuse compounding storage demand."

## 1.4 Video / surveillance / edge

- **Surveillance and CE.** 3.5-inch surveillance HDD is part of the legacy and edge segment. In 4Q23, weakness in surveillance (notably China) pulled CE 3.5-inch drive volumes down. Seagate's CE average capacity was 8.2 TB.
- **Seagate Edge IoT** (its non-data-center business, including surveillance, NAS, client and consumer): $784M in the Sept-26 quarter, +52% YoY. Part of that growth is price and part is the NAS and edge-AI recovery.
- **WD client and consumer** (Sept-26 quarter): client $320M (+119%), consumer $193M (+19%).
- **Edge AI and physical AI.** Vision AI at the edge raises retention needs on NVR/NAS-class drives, but this is a small share of exabytes. More than 85–90% of exabytes are now nearline.

## 1.5 How the macro drivers flow into HDD demand

```
AI capex (GPUs) ──> training data lakes (object storage: S3/GCS/Azure Blob) ──> nearline HDD (bulk tier)
                 └─> checkpoints / logs / eval sets ─────────────────────────> nearline HDD (warm/cold)
Inference/agents ──> prompts, outputs, traces, multimodal generated content ─> retained on HDD for compliance/re-training
Cloud growth (AWS/Azure/GCP +37–82%) ──> general object storage growth ────> nearline HDD
Flash used for hot tier ───────────────> QLC SSD (hot/warm, AI feeding)  -- HDD keeps bulk capacity tier
```

- **Mass-capacity share.** Nearline was about 89–90% of WD and Seagate exabytes in 4Q25. In the Sept-26 quarter, Seagate data-center exabytes were 198 of 220 EB (90%). Nearline was about 65% of industry units in 2025 (80.8M of 124.3M), and Coughlin expects more than 90% of units by 2030.
- **Cost gap that keeps HDD as the bulk tier:**
  - Nikkei/TrendForce (Oct 2026): SSDs cost "around 20x" HDDs per unit of capacity.
  - Coughlin expects at least a 4x $/TB advantage for HDD through 2030 even on QLC.
  - TrendForce: QLC uses about 30% less power than nearline HDD. That is the argument flash makes in power-constrained data centers.

## 1.6 Opportunities and risks, 2026–2031

### Opportunities
1. **AI data retention.** Inference and agentic workloads create persistent data, not just compute. Management describes durable exabyte demand of more than 25%/yr: WD's long-term target is >25%, and Seagate guides to mid-20s% nearline exabyte CAGR.
2. **Pricing power from supply discipline.** Three suppliers, no greenfield capacity, and LTAs with value-based pricing. WD's ASP/TB was up 28% YoY. The industry has moved from roughly 10%/yr price declines to price *increases*.
3. **Areal-density step-up.** HAMR at 40–44 TB now, 50 TB+ in 2028, and 100 TB around 2030. This lets exabytes grow about 25% with minimal unit or capex growth, so incremental margins are very high.
4. **Customer base broadening.** Demand now extends beyond the top hyperscalers to neoclouds, AI labs, enterprises and sovereign clouds (WD commentary).
5. **NAND shortage protects HDD.** TrendForce: "2026 NAND Flash faces undersupply, ensuring sustained price increases." Enterprise SSD contract prices rose 5–10% QoQ in 4Q25. Gartner also flags memory cost inflation. This widens the HDD $/TB advantage in the near term.

### Risks
1. **AI capex digestion or bubble deflation (highest impact).** Capex is growing faster than cash flow. Meta's quarterly FCF fell to $0.8B from $8.6B, and hyperscaler shares fell in mid-October 2026. A 2027–2028 digestion phase would hit HDD with a 2–4 quarter lag, softened by LTAs. Historical precedent: the 2023 cloud inventory correction cut industry revenue about 30%+, to about $13.4B.
2. **Price normalization or cycle reversal.**
   - Toshiba is doubling its nearline capacity by FY2027 ($380M Philippines plant) and targets 30% share, up from about 11%.
   - HAMR adds about 40% capacity per drive at the same unit count.
   - Once supply catches up (my estimate: 2028+), $/TB could return to declining 5–10%/yr. Revenue growth would then fall to roughly the exabyte growth rate minus the price decline.
3. **QLC SSD substitution.** TrendForce expects "explosive" nearline QLC SSD growth from 2026, as hyperscalers consider SSD even for cold data where HDD is short. This is mitigated by NAND undersupply, a $/TB gap of 4–20x, and software, TCO and endurance issues. The risk rises if NAND enters oversupply around 2028–2029, the typical NAND cycle.
4. **Power constraints.** Data-center power is the binding constraint for AI build-outs, and SSD's watts-per-TB-of-throughput argument gains weight. Counterpoint: watts per TB *stored* favors high-capacity HAMR, and WD's high-bandwidth HDD project targets up to 8x throughput at the same power.
5. **Customer concentration.** Cloud is about 88% of WD revenue and data center about 81% of Seagate's. A handful of buyers have large negotiating leverage when LTAs reset.
6. **Technology execution.**
   - WD's HAMR qualification starts in 1H CY27, about 2 years behind Seagate.
   - Seagate's Mozaic 5 qualification is in late CY27.
   - Slips would change share, not total demand.
7. **Input costs.** Externally sourced components (DRAM and NAND cache, possibly lasers) are rising. WD says cost/TB reduction will be below its roughly 10%/yr goal in the near term.
8. **Tariffs, trade and China.** Assembly and components are concentrated in Thailand, Malaysia, the Philippines and China (Toshiba–TDK Guangdong). Seagate saw "minimal expected impact" from tariffs and Middle East conflict in July 2026. China demand for surveillance and cloud is subject to localization pressure.
9. **Tape for archive.** LTO-10 is 40 TB native, and tape shipments are expected to roughly double to more than 400 EB by 2030. This competes only at the deep-archive tier, about $2B+ of market. Over 2026–2031 tape is a minor risk.
10. **Recession and macro.** These matter mostly for legacy segments (PC, consumer, surveillance). Nearline is driven by capex.

---

# PART 2a — HDD market financials

## 2a.1 Industry revenue, units and exabytes history

**Industry totals by year**

| Year | Units (M) | Exabytes shipped | Avg capacity/drive (TB) | Industry revenue ($B) | Notes / source |
|---|---|---|---|---|---|
| 2010 | ~600–650 | — | — | — | Peak units (Statista / Coughlin) |
| 2018 | ~375 [approx., pre-2023] | ~870 EB [approx.] | ~2.3 | ~25–26 [approx.] | PC era still significant |
| 2019 | ~320–330 [approx.] | ~1,000 EB [approx.] | ~3.1 | ~22–23 [approx.] | 2Q19: 78M units/quarter (Trendfocus) |
| 2020 | ~260 [approx.] | ~1.0–1.1 ZB (first year >1 ZB) | ~4 | ~21–22 [approx.] | Business Wire / Trendfocus, Feb 2021 |
| 2021 | 259 | ~1.4 ZB [approx.] (2Q21: 350 EB on 67M units) | ~5.4 | ~23–24 [approx.] | Statista, StorageNewsletter |
| 2022 | ~166 | ~1.2–1.3 ZB [approx.] (2Q22: 319 EB) | ~7.5 | ~18 [approx.] | Statista (-36% units) |
| 2023 | ~122 [derived] | ~897 EB [derived] (4Q23: 214 EB on 28.9M) | ~7.4 | ~13.4 [derived] | **Cyclical trough** (cloud inventory digestion) |
| 2024 | 123.9 | 1,337 EB (+49%) | 10.8 | **19.8** (+48%) | Coughlin, Forbes Mar 2025 |
| 2025 | 124.3 (+0.4%) | 1,621 EB (+22%) | 13.0 | **23.3** (+18%) | Coughlin, Forbes Feb 2026 |
| **2026E** | **~125–132 [EST]** | **~2.0–2.1 ZB [EST], +25–30%** | **~16 [EST]** | **~35–37 [EST], +50–60%** | Derived from STX/WD quarterly results and guidance + Toshiba est. |

**Notes on the table:**
- **Alternative 2025 estimate.** Coughlin's Dec 2025 preliminary estimate was 1.79 ZB (+34%). The final Feb 2026 figure is 1.62 ZB. Sources differ by about 10%.
- **2025 vendor breakdown** (Coughlin):

| Vendor | Revenue | Exabytes | Units | Unit share |
|---|---|---|---|---|
| WD | $10.3B | 761 EB | 52.6M | 42.3% |
| Seagate | $9.4B | 678 EB | 50.6M | 40.8% |
| Toshiba | ~$3.5B est. | 182 EB | 21.1M | 17% |

- **Capacity share** (Coughlin Dec 2025): WD about 47%, Seagate about 42%, Toshiba about 11%. Blocks & Files (Oct 2026) puts revenue/market share at about 44/44/11.
- **Quarterly markers:**
  - 1Q24: 29.7M units.
  - 2Q24: 290 EB.
  - 3Q24: about 32M units, 325+ EB (nearline about 275 EB on 15.3M units).
  - 1Q25: 29.7M units, 361 EB.
  - 2Q25: 30.4M units, about $6.2B.
  - 3Q25: 418.7 EB.
  - 4Q25: 33.4M units, 456.9 EB, about $6.6B (nearline about 22.5M units).

**Calendar 2026 revenue derivation [EST]:**
- **Seagate** (fiscal quarters):
  - Mar-26 quarter: about $3.11B, derived from FY26 $12.195B minus the other three quarters.
  - Jun-26 quarter: $3.629B.
  - Sep-26 quarter: $4.233B.
  - Dec-26 quarter: $4.8B guide.
  - Total about **$15.8B**. A small part (about 5%) is non-HDD.
- **WD:**
  - Mar-26 quarter: about $3.33B, derived from FY26 $12.919B.
  - Jun-26 quarter: $3.747B.
  - Sep-26 quarter: $4.38B.
  - Dec-26 quarter: $5.1B guide.
  - Total about **$16.6B**.
- **Toshiba HDD:** about $4–4.5B [EST].
- **Industry total: about $36B.**

**Exabyte trajectory:**
- **Seagate:** 190 EB (4Q25), 218 EB (Jun-26 quarter, +34% YoY), 220 EB (Sep-26 quarter; 198 EB data center, +24% YoY).
- **WD:** 215 EB (4Q25), 231 EB (Jun-26 quarter, +22%), 248 EB (Sep-26 quarter, +22% YoY, +8% QoQ).
- **Combined STX+WD:** about 470 EB/quarter. Adding Toshiba gives an industry run-rate of roughly **520–540 EB/quarter (about 2.1 ZB annualized) [EST]**.

## 2a.2 ASP and $/TB

- **Revenue per TB shipped** (industry, derived):
  - 2024: about $14.8/TB.
  - 2025: about $14.4/TB.
  - Sep-26 quarter: Seagate about $19.2/TB (total revenue / EB, includes non-HDD); WD about $17.7/TB.
  - That implies an industry average of about $18/TB, **+20–30% YoY** [EST].
- **Company disclosures:**
  - WD's blended ASP per TB: up high single digits YoY (Mar-26 quarter), then high teens (Jun-26 quarter), then **+28% YoY (Sep-26 quarter)**.
  - Contract prices rose about 4% QoQ in 4Q25, the largest increase in 8 quarters (Castellano, Feb 2026).
- **Per-drive ASP:**
  - 4Q25: about $195 at Seagate and $207 at WD.
  - Coughlin notes industry ASPs are now about 25% above 1998 levels.
  - Mix (larger drives) plus price drive the increase.
- **Cost side.** WD cost/TB fell about 8% YoY in the Jun-26 quarter. The long-term goal is about 10%/yr, but near-term reductions will be smaller because DRAM and NAND component costs are rising.
- **Result:** price per TB up 20–30% while cost per TB is down about 5–8%. That spread explains the gross-margin expansion from about 40% to about 58–61%.
- **Pricing mechanics.** HAMR is priced on $/TB, not at a discount to ePMR (WD). LTAs fix configurations and prices about 12 months ahead, with all of CY2027 pricing fixed (Seagate). Non-LTA volumes and new LTAs carry flexible, i.e. higher, pricing. Some WD LTAs include periodic price adjustments.

## 2a.3 Market segments

| Segment | Share of exabytes | Share of revenue | Trend |
|---|---|---|---|
| **Nearline / mass capacity** (cloud + enterprise OEM, 3.5" 20–44 TB) | **~88–90%** (Seagate DC 198/220 EB; WD nearline ~89% in 4Q25) | **~80–88%** (Seagate DC 81% of rev; WD cloud 88%) | Growing; 80.8M units in 2025 (+13.6%) |
| **Legacy: PC / client 2.5" & 3.5"** | <3% | ~5% | Long-term structural decline (SSD replaced boot drives); WD client +119% YoY Sep-26 quarter (pricing/shortage effect) |
| **Legacy: Consumer / external, NAS** | ~3–5% | ~4–6% | Flat-to-down; WD consumer +19% |
| **Legacy: CE / surveillance / video (3.5")** | ~4–6% | ~4–6% | Edge AI supportive, China weakness |
| **Mission-critical 10K/15K 2.5" enterprise** | <1% | ~1–2% | End-of-life, replaced by SSD |

- **Segment sources and caveats.** Shares are derived from company disclosures and Coughlin. Segment splits for legacy are estimates.
- **Seagate's edge figures.** Seagate's "Edge IoT" segment (about 19% of revenue, $784M in the Sep-26 quarter) covers the legacy segments.
- **Mordor's 2026 segment shares** use a broader definition: 3.5" 67.5%; near-line/cold-data 45.5% of application; >5 TB 58%; cloud and hyperscale 50.4% of end users; Asia-Pacific 36.4%.

## 2a.4 Margins and cost structure (Seagate and WD as industry proxy)

| Metric | Seagate FY25 | Seagate FY26 (Jun) | Seagate Sep-26 quarter | WD FY25 | WD FY26 (Jun) | WD Sep-26 quarter | WD Dec-26 quarter guide |
|---|---|---|---|---|---|---|---|
| Revenue | $9.10B | $12.20B | $4.23B (+61%) | $9.52B | $12.92B (+36%) | $4.38B (+55%) | $5.1B (+66–72%) |
| Gross margin (non-GAAP) | ~36–37% [EST] | 45.6% (GAAP); Jun-26 quarter 52.7% | **57.8%** | 39.4% | 49.1% | **58.1%** | **60–61%** |
| Operating margin (non-GAAP) | — | ~Jun-26 quarter ~45%+ | **50.7%** (guide mid-50s for Dec quarter) | 24.4% | 37.3% | **49.1%** | ~52% [EST] |
| Opex | — | — | ~$300M/qtr (~7% rev) | — | — | $391M (~9% rev) | $400–410M |
| Net income | — | $3.18B | EPS $7.68 non-GAAP | — | — | Net income ~$1.78B; EPS $4.64 | EPS $5.80 |
| Capex | — | 4.7% of rev | $211M (5%) | — | Jun-26 quarter $108M | — | 4–6% of rev, "modestly above" for 2 yrs |
| FCF | — | — | ~$1.5B/qtr | — | — | $1.4B/qtr | — |

**Takeaways:**
- **Capex is low.** Both companies target 4–6% of revenue. Exabyte growth comes from areal density, not new factories, so capacity additions are disciplined.
- **The only notable capacity expansions:**
  - Toshiba: about $380M to double Philippine capacity by FY2027.
  - WD: about $1B in Japan through 2030.
  - Nitto Denko: +40% output of CISFLEX suspension circuits by FY2028.
- **Margin history.** Margins are at **all-time highs**, well above the 2018–2019 peak of about 30–33% gross margin and the 2023 trough of about 18–25%. History says margins mean-revert, but the current structure is unusually favorable: 3 players, LTAs, build-to-order, and high barriers to entry because of the HAMR head/media/laser supply chain.

## 2a.5 Supply tightness, lead times and allocation

- **Lead times.** Nearline lead times went from "a few weeks to over 52 weeks" in Sept 2025 (TrendForce). 32 TB+ drives had waits of more than a year.
- **Price increases.** WD announced gradual increases on "all HDD products, effective immediately" in Sept 2025.
- **Spillover into SSD.** The HDD shortage pushed hyperscalers toward QLC eSSD, contributing to enterprise SSD price rises of 5–10% QoQ in 4Q25.
- **Seagate allocation:**
  - Jan 2026: nearline capacity fully booked through 2026 (TrendForce).
  - Apr 2026: sold out through 2027 (Trefis).
  - Jul 2026: "vast majority of nearline exabytes allocated into CY2028 under LTAs"; 2029 negotiations ongoing; some customers want commitments through 2029+.
  - Oct 2026: some cloud LTAs extend to **CY2030**.
- **WD:**
  - Most 2027 supply is committed, with portions of 2028–2029 covered.
  - LTA discussions extend into CY2029–2031.
  - Oct 2026: visibility "through 2030 and 2031" with its top 7 customers.
- **Market structure.** Only 3 HDD makers remain: Seagate, WD and Toshiba. Head and media capacity is the bottleneck, and new head fabs could come about 2027 (Coughlin).

## 2a.6 Is HDD demand sustained for the next 5 years?

**Evidence for "yes" (base case through at least 2028):**
1. **Contracted demand.** Seagate's LTAs run to CY2028 for most volume and to CY2030 for some cloud customers. WD has visibility to 2030–2031 and is build-to-order. This kind of contractual visibility is unprecedented for the industry.
2. **Backlogs.** Hyperscaler cloud backlogs total more than $1.6T across AWS ($496B), Google Cloud ($514B) and Microsoft ($678B RPO). Capex guidance is still being raised as of Q2-2026, and Moody's and Citi see about $1T/yr by 2027.
3. **HDD's share of hyperscale data.** About 80% of hyperscale data sits on HDD (WD). HDD keeps a 4–20x $/TB advantage over QLC SSD.
4. **NAND tightness.** NAND undersupply in 2026 limits flash substitution.
5. **Management confidence.** Both companies guide mid-20s%+ exabyte CAGR. WD says the Sep-26 quarter "represented a floor" for exabyte growth.

**Caveats:**
- A sustained demand path does not mean sustained *price* increases. Revenue CAGR after 2027 likely converges toward exabyte growth (about 20–25%) minus $/TB decline (about 5–10%), giving **about 10–18% nominal growth** in a healthy market. A digestion year could see flat-to-down revenue.
- Unit shipments will keep **flat to slightly down** (about 115–135M/yr). Legacy units keep falling, while nearline units grow only modestly because capacity per drive rises from about 30 TB to 50–100 TB.

## 2a.7 Third-party market forecasts (and why they differ)

| Source | Metric | Base | Forecast | CAGR | Notes |
|---|---|---|---|---|---|
| **Coughlin Associates** (Forbes, Dec 2025) | HDD revenue | 2025: $23.3B | 2030: **$25–35B** | ~2–8% | Includes a correction scenario if AI spending slows from 2026. **Already exceeded in 2026 (~$36B EST)**, so it needs an upward revision |
| Coughlin | HDD exabytes | 2025: ~1.6–1.8 ZB | 2030: **~6.5 ZB** | ~28–30% | Nearline >90% of units by 2030 |
| Coughlin (2023 forecast) | Units | 2024: ~150M (incl. all form factors) | 2028: ~200M | — | Older and too optimistic on units; actual ~124M |
| **Mordor Intelligence** | HDD market value | 2026: **$51.8B** | 2027: $55.0B; 2032: **$75.6B** | **6.6%** (2027–32) | Broader definition (likely includes external/branded drives at retail value); HAMR segment +17.4% CAGR; >5 TB +13.5%; cloud/hyperscale +11.8% |
| **TrendForce** | Qualitative | — | — | — | 2025–26 severe nearline shortage; QLC nearline SSD "explosive growth" from 2026; NAND undersupply in 2026. Quantitative forecasts paywalled |
| **IDC / Gartner** | HDD-specific | — | — | — | Paywalled; Gartner's overall data center systems spending is +62.5% in 2026 |
| Company targets | Exabytes | — | — | Seagate mid-20s%; WD >25% | Cost/TB -10%/yr long term (WD) |

**Why the sources differ:**
- **Definition.** Some sources use manufacturer revenue (Coughlin, about $23B in 2025). Others use end-market value including branded external drives and channel markups (Mordor, about $50B).
- **Timing.** Most third-party models were built before the 2025–26 price spike, so they underestimate 2026 value.
- **Price assumption.** Forecasters who assume a return to -10%/yr $/TB get low revenue CAGRs. Those who assume supply discipline get higher ones.

### My forecast [EST]

These are manufacturer revenue estimates, comparable to Coughlin's definition.

**Base case.** Exabytes grow about 23% CAGR from about 2.05 ZB (2026) to about 5.8 ZB (2031). $/TB holds roughly flat through 2027, then falls about 7%/yr.

| Year | Exabytes (ZB) | $/TB | Revenue ($B) |
|---|---|---|---|
| 2026 | 2.05 | ~17.5 | **~36** |
| 2027 | 2.5 | ~17.5 | **~44** |
| 2028 | 3.1 | ~16.3 | **~50** |
| 2029 | 3.8 | ~15.1 | **~57** |
| 2030 | 4.7 | ~14 | **~65** (normalization would temper this to ~$45–55B) |
| 2031 | 5.8 | ~13 | **~75**, with the same caveat |

- **Tempering for cycles.** A digestion year is likely in the period: historically 1 in every 4–5 years shows exabyte growth at or below 0–10%. Including one, the realistic **2030/2031 base is about $45–55B** (about 5–9% CAGR from 2026).
- **Bear case.** AI capex correction in 2027–28, $/TB falling 15%/yr as Toshiba and HAMR capacity arrive, and QLC taking 10–15% of nearline exabytes: revenue falls back to **about $28–32B** in 2028 and recovers to about $35B by 2031.
- **Bull case.** Pricing holds and exabytes grow 28%+: **about $70B+ by 2031**.
- **Overall view.** Demand (exabytes) is highly likely to grow. Value growth after 2027 depends mainly on pricing discipline.

---

## Data gaps and limitations

- **Search budget.** The session's web-search budget ran out before additional queries on QLC/NAND $/TB pricing, IDC DataSphere headline numbers and pre-2023 industry revenue. Those figures are marked approximate or estimated. A follow-up session could verify them.
- **Pages I could not read:**
  - The Seagate Sept-26 quarter earnings call transcript on Motley Fool could not be fetched. I used the MarketBeat and Investing.com call summaries instead.
  - The Gartner 2027 IT spending figure (about $961B increase) comes from a headline only.
- **Seagate reporting change.** Seagate no longer reports HDD-only revenue (Data Center vs Edge IoT segments), and its unit disclosures have stopped. Industry units after 2025 are estimates.

---

## Sources

**Company results**
- [Seagate FQ1 FY2027 press release (SEC 8-K, Oct 27, 2026)](https://www.sec.gov/Archives/edgar/data/0001137789/000113778926000300/stxq12027pressreleasefinan.htm)
- [Seagate Q1 earnings call highlights — MarketBeat (Oct 27, 2026)](https://marketbeat.com/instant-alerts/transcript-seagate-technology-q1-earnings-call-highlights-2026-10-27/?amp=)
- [Seagate Q1 FY27 slides — Investing.com](https://www.investing.com/news/company-news/seagate-q1-fy27-slides-record-margins-as-data-center-demand-surges-93CH-4977159)
- [Seagate FQ4 FY2026 coverage — CNHI News](https://www.cnhinews.com/news/article_82849661-0332-5029-8e5d-a5207e52c29a.html)
- [Tom's Hardware — Seagate sold out through 2028, 50TB qualification in 2027 (Jul 29, 2026)](https://www.tomshardware.com/pc-components/hdds/seagate-to-start-qualifying-record-setting-50tb-hdds-in-2027-most-drives-are-sold-out-through-2028)
- [Trefis — Seagate sold out through 2027 (Apr 30, 2026)](https://www.trefis.com/articles/597921/seagate-is-sold-out-through-2027-as-ai-reshapes-hard-drive-demand/2026-04-30)
- [TrendForce — Seagate nearline capacity fully booked through 2026 (Jan 28, 2026)](https://www.trendforce.com/news/2026/01/28/news-seagate-q3-guidance-tops-estimates-nearline-hdd-capacity-fully-booked-through-2026/)
- [WD FQ1 FY2027 press release (SEC 8-K, Oct 22, 2026)](https://www.sec.gov/Archives/edgar/data/0000106040/000162828026066882/a4ex991-pressreleaseq127.htm)
- [WD Q1 earnings call highlights — MarketBeat (Oct 22, 2026)](https://www.marketbeat.com/instant-alerts/transcript-western-digital-q1-earnings-call-highlights-2026-10-22/)
- [WD FQ4/FY2026 press release (SEC 8-K, Aug 5, 2026)](https://www.sec.gov/Archives/edgar/data/0000106040/000162828026053305/a4ex991-pressreleaseq426.htm)
- [WD Q4 earnings call highlights — Nasdaq](https://www.nasdaq.com/articles/western-digital-q4-earnings-call-highlights)

**Toshiba and HDD industry data**
- [Blocks & Files — Toshiba spending $380M to catch up (Oct 6, 2026)](https://www.blocksandfiles.com/disk/2026/10/06/distant-third-hdd-maker-toshiba-spending-380-million-to-catch-up/5301322)
- [TrendForce — Toshiba to double AI data center HDD capacity by FY2027 (Oct 2, 2026)](https://trendforce.com/news/2026/10/02/news-toshiba-to-double-ai-data-center-hdd-capacity-by-fy2027-with-380m-expansion-as-ai-storage-demand-surges/)
- [Forbes / Tom Coughlin — C4Q 2025 and 2025 HDD industry update (Feb 2, 2026)](https://www.forbes.com/sites/tomcoughlin/2026/02/02/c4q-2025-and-2025-hard-disk-drive-industry-update/)
- [Forbes / Tom Coughlin — Digital storage projections for 2026, Part 1 (Dec 19, 2025)](https://www.forbes.com/sites/tomcoughlin/2025/12/19/digital-storage-and-memory-projections-for-2026-part-1/)
- [Forbes / Tom Coughlin — C4Q 2024 HDD industry update (Mar 9, 2025)](https://www.forbes.com/sites/tomcoughlin/2025/03/09/c4q-2024-hdd-industry-update/)
- [Blocks & Files — Disk drive capacity shipments to 2030 (May 17, 2025)](https://blocksandfiles.com/2025/05/17/disk-drive-capacity-shipment-out-to-2030-are-set-to-rocket-upwards/)
- [StorageNewsletter / Trendfocus — 4Q23 HDD capacity 214 EB](https://www.storagenewsletter.com/2024/02/06/4q23-hdd-capacity-rises-9-q-q-to-214eb)
- [StorageNewsletter / Trendfocus — 3Q24 325+ EB](https://www.storagenewsletter.com/?p=283108)
- [StorageNewsletter — 2Q21 67M HDDs, 350 EB](https://www.storagenewsletter.com/2021/08/13/67-million-hdds-5-q-q-for-350eb-shipped-in-2q21/)
- [StorageNewsletter — 2Q22 319 EB](https://www.storagenewsletter.com/?p=251741)
- [StorageNewsletter — 2Q19 78M HDDs](https://www.storagenewsletter.com/2019/07/12/78-million-hdds-shipped-worldwide-in-2q19-as-in-1q19/)
- [Statista — global HDD shipments](https://www.statista.com/statistics/398951/global-shipment-figures-for-hard-disk-drives)
- [Business Wire — HDD industry tops 1 ZB shipped annually (Feb 2021)](https://www.businesswire.com/news/home/20210209005341/en/HDD-Industry-Tops-1ZB-Shipped-Annually-for-the-First-Time-as-Toshiba-Leads-the-Nearline-HDD-Market-in-Average-Capacity-Growth-Again)
- [Let's Data Science — HDD shipments decline while capacity rises](https://letsdatascience.com/news/hard-disk-shipments-decline-while-capacity-rises-db1d8197)
- [Castellano Substack — The HDD industry's second act (Feb 4, 2026)](https://drrobertcastellano.substack.com/p/the-hdd-industrys-second-act-nearline)

**Supply, pricing and market forecasts**
- [StorageNewsletter / TrendForce — Severe nearline HDD shortages (Sep 24, 2025)](https://www.storagenewsletter.com/2025/09/24/soaring-inference-ai-demand-triggers-severe-nearline-hdd-shortages-says-trendforce/)
- [TechRadar via Yahoo — HDD prices and lead times (Sep 18, 2025)](https://tech.yahoo.com/computing/articles/prices-high-capacity-hdds-soar-213600239.html)
- [TrendForce — Nearline SSD rise report (Sep 2025)](https://www.trendforce.com/research/download/RP250922OB)
- [TrendForce — 2026 NAND Flash: AI & HDD shortage ignite price surge (Oct 2025)](https://www.trendforce.com/research/download/RP251007YE)
- [Mordor Intelligence — HDD market size and share](https://mordorintelligence.com/industry-reports/hard-disk-drive-market)

**Macro: IT spending, data growth and capex**
- [Gartner — IT spending to grow 14.2% in 2026, $6.37T (Jul 27, 2026)](https://www.gartner.com/en/newsroom/press-releases/2026-07-27-gartner-forecasts-worldwide-it-spending-to-grow-14-point-2-percent-in-2026-totaling-6-point-37-trillion)
- [Gartner — IT spending to grow 13.5% in 2026, $6.31T (Apr 22, 2026)](https://gartner.com/en/newsroom/press-releases/2026-04-22-gartner-forecasts-worldwide-it-spending-to-grow-13-point-5-percent-in-2026-totaling-6-point-31-trillion-dollars)
- [IDC Global DataSphere Forecast 2025–2029 (GII listing)](https://www.gii.co.jp/report/id1726448-worldwide-idc-global-datasphere-forecast.html)
- [Platformonomics — Follow the CAPEX: Q2 2026 scoreboard](https://platformonomics.com/2026/07/follow-the-capex-q2-2026-scoreboard/)
- [Platformonomics — Follow the CAPEX 2025 retrospective](https://platformonomics.com/?p=34926)
- [DatacenterDynamics — Moody's hyperscaler capex forecasts marked up to near $1T by 2027](https://datacenterdynamics.com/en/news/moodys-hyperscaler-capex-forecasts-marked-up-by-85bn-to-close-in-on-1trn-by-2027/)
- [247wallst — Citi: $5.35T hyperscaler capex 2027–2030 (Oct 21, 2026)](https://247wallst.com/investing/2026/10/21/citi-sees-amazon-microsoft-google-and-meta-spending-more-than-apple-is-worth-on-ai-by-2030/)
- [UncoverAlpha — Amazon, Google, Microsoft, Meta Q2 earnings](https://www.uncoveralpha.com/p/amazon-google-microsoft-meta-q2-earnings)
- [Outlook Business — Oracle forecasts $95B capex for FY27 (Jun 11, 2026)](https://www.outlookbusiness.com/corporate/oracle-forecasts-95-bn-in-capex-for-fy27-plans-to-raise-40-bn-in-debt-and-equity)
- [Yahoo Finance — Mag 7 hyperscaler capex $725B in 2026](https://finance.yahoo.com/markets/article/magnificent-7-earnings-rush-reveals-ai-spending-surge-with-hyperscaler-capex-set-to-reach-725-billion-in-2026-224901707.html)
