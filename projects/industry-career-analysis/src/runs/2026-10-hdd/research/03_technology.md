# 03 — HDD Technology and Competitor Technology Assessment (Parts 2c and 2d)

*Prepared: October 28, 2026. Audience: a 15-year HDD servo control engineer. Facts from 2025–2026 sources are cited inline as [n] (see Sources). Statements marked **[EST]** are this analyst's estimates or inferences, not vendor statements. Statements marked **[ANALYSIS]** are engineering reasoning. Vendor roadmaps are forward-looking and have historically slipped. HAMR was "two years away" for about 15 years.*

*Research note: the web search budget for this session ran out before every planned query was done. Gaps are flagged where they matter, mainly the exact Mozaic 4+ component list, Micron and Samsung 245/256TB SSD shipping status, and PLC status.*

---

## Executive summary

1. **Energy-assisted recording is now in volume production. That is the main change from 2023–2024.** About 40% of Seagate's nearline exabytes shipped on HAMR as it exited FY2026 (June 2026). Its 44TB Mozaic 4+ (10 platters × 4.4TB) has shipped to hyperscalers since March 2026 [1][2]. WD started shipping its 40TB ePMR UltraSMR drive in mid-2026, and its 44TB HAMR drive (11 × 4TB) is on track for volume in 1H CY2027 [3][4]. Toshiba trails. It ships MAMR drives at 24TB CMR and 28TB SMR, and targets 40TB-class drives in 2027 (12-platter MAMR) and HAMR at volume around FY2028 [5][6][7].
2. **The industry has publicly committed to about 100TB drives by 2029–2032.**
   - WD: 100TB HAMR by 2029, using up to 10TB/platter and a 14-disk stack [3][4].
   - Seagate: 10TB/platter lab target around 2028 and 6.9TB/platter already shown in the lab. Product steps are 4, 5 and 6TB/platter in 2027, 2028 and 2029, then 7–15TB/platter after 2031 [2][8].
   - Capacity per drive should grow about 15–20%/yr **[EST]**, which is faster than in 2015–2023.
3. **The scaling is landing on the mechatronics and servo side.**
   - Track pitch is heading toward about 25nm (about 1,000 kTPI) **[EST]**.
   - Platter counts are going to 12–14 on thinner glass substrates [3][5][6].
   - WD has disclosed "triple actuation" on its ePMR roadmap [6].
   - New parallelism architectures are coming: WD's High-Bandwidth Drive with multiple heads active at once, WD's Dual Pivot in 2028, and Seagate MACH.2 [3][4][6][9].
   - HAMR adds laser and thermal protrusion transients that interact with fly-height and track-following control [10].
   - Seagate is posting servo roles that include an "AI/Machine Learning in Control System" internship [11].
   - **[ANALYSIS]** Demand for servo engineers holds up better than for most HDD disciplines, because every density, platter and actuator step is a servo problem.
4. **Competitors:**
   - **NAND:** layer counts are passing 300–400 (Samsung V10 at more than 400 layers, SK hynix 375, Kioxia BiCS10 332) [12][13]. 245–256TB QLC SSDs are due around late 2026 and 512TB about 2027 [14][15].
   - **The $/TB gap has widened.** A NAND price spike in 2025–26 pushed enterprise SSD $/TB to roughly 16–23× HDD [16][17]. NAND capex grew only about 5% in 2026 [18].
   - **Tape:** LTO-10 now comes in 40TB native, but the LTO roadmap was cut, and LTO-14 is now 365TB rather than 576TB [19][20].
   - **Glass, ceramic and DNA** are archive-only plays. Pilots run 2026–2027, with possible commercial scale around 2030 or later [21][22][23].
5. **Verdict [EST]:** Within five years (to 2031), no competitor closes the **$/TB** gap with nearline HDD. The ratio is likely 5–8× at the device level once NAND pricing normalizes (around 2028), and 3–5× on full TCO for read-heavy workloads. QLC will keep taking performance-sensitive and power- or space-constrained capacity tiers. HDD keeps the bulk-exabyte tier. The real threat to HDD comes after 2031: NAND cost-down and HDD IOPS/TB decline could combine to erode the warm tier. That is why the HDD vendors are investing so heavily in IOPS/TB architecture (HBD, Dual Pivot, MACH.2).

---

# PART c — HDD technology

## c.1 Technologies that drove capacity growth

| Technology | What it does | Vendors / status (2026) | Servo / mechatronics relevance |
|---|---|---|---|
| **PMR (perpendicular)** | Base recording since about 2006. Ran out of steam at about 1.1–1.3 Tb/in² because of the superparamagnetic / trilemma limit. | All. Conventional PMR described as "increasingly unreliable past ~3 TB/platter" [1] | Drove kTPI from about 150 to about 500+ **[EST]**. Dual-stage (PZT milli/micro) actuation became standard. |
| **Helium sealing** | Lower gas density gives less windage, less disk/arm flutter, lower power, and allows thinner and more disks | Universal in nearline since about 2016 (WD HelioSeal) | Big reduction in airflow-induced off-track (flutter / TMR). This is what enabled 8→9→10→11 platters. |
| **More platters** | 7→9→10→11 now. 12 verified (Toshiba, glass). 14 planned (WD, enabled by a new laser design) [3][5][6] | Seagate 10, WD 11, Toshiba 10→12 | Thinner disks and tighter spacing mean lower disk stiffness, more flutter, more heads per E-block, more arm modes, and tighter thermal-expansion budgets |
| **TDMR (two-dimensional magnetic recording)** | Two or three readers per head, with 2D signal processing to cancel inter-track interference | Standard in nearline | Reader-to-reader offset and skew must be calibrated across the stroke. Couples servo position with channel performance. |
| **SMR / host-managed (UltraSMR)** | Overlapping tracks add about 15–20% capacity | WD UltraSMR (40TB ePMR), Seagate Exos M, Toshiba MA11 (28TB) | Writes need tighter squeeze tolerance because the previous track is partially overwritten. WD targets about 60% of nearline EB on UltraSMR by end of FY2027 [3] |
| **ePMR (WD)** | Bias current in the write pole to improve writability. "Energy-assisted" but no laser or microwave | WD 26TB CMR / 32TB SMR (ePMR 2) and 40TB UltraSMR (2026). Roadmap to 60TB on 14 platters at flat power [3][4][6] | Conventional head, so no laser transients. Capacity gains come from TPI, platter count and triple actuation [6] |
| **OptiNAND (WD)** | iNAND embedded in the drive holds metadata (e.g. repeatable runout / ATI refresh tables), freeing the disk format and enabling more frequent ATI tracking | WD since 2021 | Lets servo and firmware store more per-track compensation data, such as RRO/WRRO tables. Cited as one contributor to WD's 2030 capacity [4] |
| **MAMR / FC-MAMR** | Microwave- or flux-control-assisted writing | Toshiba's current production technology (MG11 24TB, MA11 28TB). WD dropped "true" MAMR about 2021 [4][5][7] | Conventional thermal environment. Toshiba's 40TB in 2027 relies on MAMR plus 12 platters [5][7] |
| **HAMR** | A laser and near-field transducer (NFT) heat FePt-class media to about 400–500 °C during the write | Seagate Mozaic 3+ (30–36TB) and 4+ (44TB) shipping. WD 44TB volume 1H27. Toshiba HAMR 40TB small volume FY27, mass production 2H FY28 [1][3][7] | Laser-induced protrusion, NFT and laser-diode thermal transients, write-to-read offset that shifts with laser power, and new head–disk interface wear modes [10][24] |
| **Multi-actuator** | Two independent actuators doubling IOPS (Seagate MACH.2 / Exos 2X). WD Dual Pivot (2028) [6][9] | Seagate in production in small volume since about 2021. WD lab, introduction at 60TB | Two servo loops on a shared base and pivot area means cross-actuator coupling (reaction torque, structural modes). A large servo design topic in its own right |

### Mozaic platform (Seagate HAMR)
- Naming tracks TB per platter class on a 10-platter drive: **Mozaic 3+** gives 30+TB, **Mozaic 4+** gives 40+TB, and **Mozaic 5+** gives 50+TB [1].
- Mozaic 3+ is qualified at all major CSPs. Mozaic 4+ is ramping at the two largest CSPs and is expected to be about 50% of Seagate's HAMR EB by end of CY2026. Mozaic 5+ qualification shipments start late CY2027, with broader availability in 2028 [1][2].
- Seagate is *not* adding unit capacity. All exabyte growth comes from areal density, with a mid-20% exabyte CAGR target [1].
- Mozaic 3+ components (from Seagate's earlier disclosures; not re-verified this session because of the search limit):
  - iron-platinum superlattice media
  - plasmonic writer with NFT
  - 7th-generation spintronic reader
  - 12nm integrated controller

### WD's dual-track strategy (ePMR plus HAMR)
- Disclosed at Investor Day (Feb 2025) and Innovation Day (Feb 2026) [3][4][6].
- **ePMR:** 26/32TB, then 40TB UltraSMR (shipping since about Q2 2026), then **60TB ePMR on 14 platters in 2028** at flat power. Heads, materials and *triple actuation* are named as the levers [3][6].
- **HAMR:**
  - 44TB on 11 platters at 4TB/platter. Ramp pulled in to 1H27.
  - 60TB in 2028, and **100TB in 2029** at up to 10TB/platter on 14 disks.
  - Uses an in-house **vertical-cavity surface-emitting laser** in place of the usual edge-emitter. The smaller laser package is what allows 14 platters [3][6].
- ePMR and HAMR share mechanical platform, lines and firmware [6].
  - **[ANALYSIS]** This is good for servo engineers: one servo code base spans both technologies, and HAMR-specific compensation sits as a layer on top.

### Toshiba
- Shipping: MG11 24TB CMR and MA11 28TB SMR (10 platters, MAMR) [5].
- Verified 12-platter stacking on thinner glass substrates, about +20% capacity, shown at IDEMA Japan in Oct 2025. Toshiba says 13 platters could be feasible [5][7].
- Slides reported by PC Watch/TechRadar [7]:

  | Year | Product |
  |---|---|
  | 2026 | 40TB-class HAMR (11 platters, likely samples) |
  | 2027 | 40TB-class MAMR (11–12 platters) |
  | 2028 | 45TB HAMR on 12 platters |
  | After 2029 | 55TB+ |

- A separate report puts HAMR 40TB in small-volume production for customer evaluation in FY2027 and in mass production in 2H FY2028 [8b].
- Toshiba targets more than 20% unit share by 2030, up from about 17% [8b].
- **[EST]** Toshiba is about 18–24 months behind Seagate on areal density.

## c.2 Current shipping status (Oct 2026)

| Vendor | Highest CMR shipping | Highest SMR shipping | Recording technology | Platters | Next |
|---|---|---|---|---|---|
| Seagate | ~40–44TB Mozaic 4+ (44TB launched as the single SKU, Mar 2026; CMR/SMR split not fully disclosed) [2][25] | 44TB class (Exos M) **[EST: an SMR SKU above 44TB is possible]** | HAMR | 10 | Mozaic 5+ 50TB+: qualification late CY27, volume 2028 [1][2] |
| WD | 26TB (HC590) ePMR. 36TB HAMR CMR comes with the HAMR launch [4] | **40TB UltraSMR ePMR**, shipping [3] | ePMR (HAMR 1H27) | 11 | 44TB HAMR 1H27. 60TB (ePMR and HAMR) 2028. 100TB 2029 [3] |
| Toshiba | 24TB MG11 | 28TB MA11 | FC-MAMR | 10 | 40TB class 2027 (12-platter MAMR), HAMR FY27–28 [5][7] |

- **Areal density [EST]:**
  - 3.5" nearline with 3TB/platter is about 1.5 Tb/in² (two recording surfaces, roughly 2 in² usable each, and format overhead).
  - 4.4TB/platter is about 2.1–2.3 Tb/in². 10TB/platter is about 5 Tb/in².
  - IEEE work from Seagate and U. Minnesota describes HAMR reaching about 4 Tb/in², with the **reader** as the bottleneck at high kTPI. TDMR alone is insufficient, and "vector readers" are proposed [26].

## c.3 Capacity roadmap 2026–2031

| Year | Seagate (10 platters unless noted) | WD | Toshiba | Industry max shipping CMR **[EST]** |
|---|---|---|---|---|
| 2026 | 44TB (Mozaic 4+) | 40TB UltraSMR ePMR | 24/28TB | 44TB |
| 2027 | 44TB volume. 50TB qualification late 2027 | 44TB HAMR (1H) | 40TB class (MAMR, 12 platters). HAMR samples | 44–50TB |
| 2028 | 50TB+ (Mozaic 5+, 5TB/platter) | 60TB ePMR and HAMR (14 platters) | 45TB HAMR | 50–60TB |
| 2029 | ~60TB (6TB/platter) [8] | **100TB HAMR** (claimed) [3][6] | ~50TB | 60–80TB (assumes WD's 100TB slips about a year) |
| 2030 | ~69TB (6.9TB/platter in product) [8] | 100TB | 55TB+ | 70–100TB |
| 2031 | 70–80TB+ [2] | 100TB+ / HDMR research | HAMR 12-platter, 60TB+ | 80–100TB |

**[EST]** Expect slips of 6–18 months on the most aggressive points (WD 100TB in 2029). History favors Seagate-style incremental steps of about 1TB/platter per year. Even the conservative path gives an exabyte-per-drive CAGR of about 15–20%. That supports the vendors' mid-20% EB growth with roughly flat unit output [1].

## c.4 Servo and mechatronics trends

**1. Track density and track misregistration (TMR) budget [EST/ANALYSIS]**
- Today's nearline PMR/ePMR runs at roughly 500–600 kTPI, a track pitch of about 42–50nm.
- HAMR at 5–10TB/platter implies about 800–1,000+ kTPI, a track pitch of 25–30nm.
- With a typical TMR budget of about 10–12% of track pitch, 3σ PES must reach about 2.5–3nm. That pushes on:
  - higher servo sample rates and more servo wedges, which cost format efficiency
  - lower-noise PES demodulation
  - repeatable runout (RRO/WRRO) compensation stored per track (OptiNAND helps WD here)
  - rejection of rotational vibration from neighboring drives in 60–100+ drive JBODs
- Academic work already targets the "1,000 kTPI (25nm pitch) era." It evaluates triple-stage actuators (VCM + PZT milli-actuator + PZT micro-actuator + thermal actuator) for disturbance rejection under server vibration [27].
- WD has long credited multi-stage microactuation for TPI beyond 400k [28]. In 2026 it names **triple actuation** as a lever for 60TB ePMR [6].
- **Gap:** no public 2026 vendor kTPI numbers were found.

**2. Higher platter count (12–14)**
- Thinner (glass) disks have lower flexural stiffness, so disk flutter rises.
- More arms per E-block push arm and E-block modes lower in frequency, which squeezes the bandwidth of the VCM loop.
- Longer pivot stacks mean bigger pivot-bearing nonlinearity and friction effects.
- Thermal off-track between the top and bottom heads grows.
- Seek settling with more heads makes head switching (head-to-head offset learning) more frequent.
- WD's 14-platter plan depends on a smaller laser to save z-height [6], so every micron in the stack matters.

**3. HAMR-specific control**
- Laser-induced NFT and pole protrusion changes fly height when the laser turns on. The writer also shifts relative to the reader (write-to-read offset varies with laser power and temperature).
- Laser-diode cavity thermal transients cause mode hops and power drift during a write. Seagate patents cover managing these, measuring NFT protrusion with burst writes, and long-term spacing compensation [10][24].
- Practical consequences:
  - write-start transient compensation
  - laser power calibration loops
  - heater (TFC) and laser co-control
  - adaptive off-track write-fault thresholds
  - more on-drive calibration and health monitoring over life
- **[ANALYSIS]** Most of this is a servo/firmware problem rather than a channel problem.

**4. Parallelism and IOPS/TB (the HDD's main weakness as capacity rises)**
- **Seagate MACH.2:** two independent actuators, 480MB/s sustained, and 2× IOPS [9].
- **WD High-Bandwidth Drive:** multiple heads read and write *simultaneously*. Up to 2× now (500+MB/s, saturating SAS), with a target of 8× by 2030. Being sampled at five customers. Introduction at 50TB [3][6].
  - **[ANALYSIS]** Writing on several surfaces at once from one actuator needs microactuator-level independent fine positioning per head, or tolerance of residual head-to-head offset. That is a new servo architecture problem.
- **WD Dual Pivot:** two independent actuator sets, one logical drive, 2× IOPS, no added power. Lab today, customer testing late 2027–2028, introduction at 60TB [6].
  - Servo issues: reaction-torque coupling through the baseplate, seek-induced vibration rejection between the two actuators, and shared power budget for seeks.
- **Power-optimized drive (WD):** about 20% less power for a 5–10% sequential penalty, via changed spin characteristics. Qualification 2027 [3][6].
  - **[ANALYSIS]** Lower RPM changes the servo sample rate and the disturbance spectrum.

**5. AI/ML in servo**
- Seagate posts a "Servo Engineering Intern, AI Machine Learning in Control System" role (Shugart/Shakopee) along with Servo Architecture, Servo Integration and Staff Servo roles [11].
- Published work on data-driven H2/H∞ HDD controllers shows academic interest [29].
- **[ANALYSIS]** Likely uses: automated per-drive loop tuning in the factory, learned feedforward and RRO compensation, anomaly prediction (head degradation in HAMR), and vibration classification in the field.

**6. Demand for servo engineering [ANALYSIS]**
- Evidence of sustained demand:
  - Both leaders' roadmaps (14 platters, triple actuation, dual pivot, HBD, HAMR transients, about 1,000 kTPI) are mechatronics-heavy.
  - Seagate is actively hiring servo architecture and integration engineers at early-career and staff levels [11].
  - Vendor margins hit records in 2026 (Seagate gross margin 52.3% in the June 2026 quarter) [1], which funds R&D.
- Counter-evidence: HDD R&D headcount is concentrated in only three companies, and firmware/servo work is partly offshore (Singapore, Thailand, Malaysia, China, India). So demand stays solid but does not grow quickly.

## c.5 Does HDD technology still have impact in the next five years?
**Yes. 2026–2031 is the strongest HDD technology cadence since helium arrived.**
- HAMR alone has a credible path from 3TB to 10TB per platter, about 3.3×.
- Platter count adds 10 to 14, about 1.4×.
- Multi-actuator and HBD address IOPS/TB.
- Customer-level effects: Seagate says 44TB drives cut system power about 0.8M kWh/yr and give about 47% better system efficiency versus 30TB [25]. Price per EB *rose* 10% Y/Y in mid-2026 [1].

## c.6 Newer technology on the roadmap
- **HAMR generations:** Mozaic 5+ (2027–28), 6TB/platter (2029), 6.9TB in the lab now, and 7–15TB/platter after 2031 [8]. WD HAMR: 4 to 10TB/platter by 2028–29 [6].
- **HDMR (heated-dot magnetic recording):** HAMR on bit-patterned media (discrete dots). WD positions it after HAMR in the **2030s** for well beyond 100TB. It is expensive because of media nanopatterning [30].
  - **[ANALYSIS]** BPM brings write synchronization (timing the write to discrete islands). This servo/timing challenge is sometimes framed as "data-island tracking" and could be a major servo topic in the 2030s.
- **Higher platter counts:** 12 (Toshiba, glass), 13 feasible, and 14 (WD) [5][6][7].
- **Multi-actuator:** MACH.2, Dual Pivot and triple-stage actuation.
- **NVMe HDD:** Seagate demonstrated it and shipped engineering samples in 2021–22. The OCP Storage workstream is active, NVMe 2.0 recognizes rotational media, and multi-actuator drives would map actuators to namespaces [31]. No volume product was confirmed in 2026 sources found. **[EST]** Adoption is likely late in the decade, tied to all-NVMe hyperscale chassis.
- **Lower power per TB:** comes mostly from capacity per drive (watts flat while TB rises), helium, and power-optimized drives.

---

# PART d — Competitor technologies

## d.1 NAND flash

**Layer counts (2026)** [12][13][32]

| Vendor | Current | Next | Key process technology |
|---|---|---|---|
| Samsung | 286L (V9, since Apr 2024) | **V10 400+ layers** ("BV-NAND", bonded). Density +58% vs V9. Mass-production target was 2H 2026, but purchase orders were slow as of May 2026 | W2W hybrid bonding, cryogenic channel etch, molybdenum wiring |
| SK hynix (+ Solidigm) | 321L | **375L**, mass production targeted end-2026 (cut back from a 400L-class plan because of complexity) | Mo word lines. Solidigm uses floating-gate QLC from Dalian |
| Kioxia / Sandisk | BiCS8 218L | **BiCS10 332L**, samples summer 2026. +59% areal density, +33% interface speed | CBA (CMOS directly Bonded to Array) |
| Micron | G9 (276L) | G10 (not verified this session) | CuA. NAND capex +63% in 2026 [18] |
| YMTC | 267L (Xtacking 4.0) | 300+ | Xtacking (an early form of wafer bonding) [32] |

**Cell types**
- QLC is now mainstream for capacity SSDs. Solidigm has shipped more than 120EB of QLC [15], and Sandisk expects most of its products to move to QLC by 2028 [14].
- PLC: Solidigm demonstrated it in 2022 but has no date for it [15]. **[EST]** No volume PLC before 2028.

**Capacity SSDs** [14][15]
- Shipping: 122.88TB (Solidigm D5-P5336 and Sandisk SN670).
- Solidigm: **245TB+ by end of 2026**.
- Sandisk: **256TB in 2026, 512TB in 2027**, and 1PB "possibly within four years" of 2025.
- Kioxia, Huawei and SK hynix have shown 245TB-class drives.

**$/TB**
- Vdura index (Aug 2026), 30TB TLC enterprise SSD: about $22,600 (≈ $753/TB), up 6.5× in a year. 30TB HDD: about $1,216 (≈ $40/TB), up 2.5×. The ratio is **18.6×**, down from a 23.2× peak in Q1 2026 [17].
- TrendForce: NAND contract prices rose about 55–60% in Q1 2026, about 70–75% in Q2 and about 10–15% in Q3 [17].
- NAND capex is up only about 5% in 2026 ($22.2B) [18], and new fabs arrive late 2027 to 2028. Phison's CEO expects the imbalance to last until about 2030 [33].
- Hyperscalers (Microsoft, Meta) shifted some capacity to QLC *because* HDDs were sold out [33]. This substitution was supply-forced, not driven by cost.

**Endurance and power [ANALYSIS]**
- QLC endurance of about 0.3–1 DWPD is adequate for read-heavy object and AI data-lake tiers.
- SSD watts per TB is better at the device level.
- WD's counter-argument: HBD gives "QLC-like deployed performance at about 10× lower cost," and it targets a 6–10× cost advantage over QLC [3][6].

## d.2 Tape

**LTO-10**
- Launched at 30TB native. A **40TB native** cartridge (Aramid base film, no new drive needed) became available in Q1 2026 [19].
- The roadmap was **revised down** in Nov 2025 [20]:

  | Generation | Old native capacity | Revised native capacity | Revised compressed (2.5:1) |
  |---|---|---|---|
  | LTO-11 | 72TB | 70TB | |
  | LTO-12 | 144TB | 120TB | |
  | LTO-13 | 288TB | 210TB | |
  | LTO-14 | 576TB | 365TB | 913TB [19] |

**Shipments**
- 176.5EB compressed in 2024 (+15.4%) and 160.3EB in 2025 (−9%). Q1 2026 was +57% Y/Y [34].
- **[EST]** Tape's native EB is about 10–15% of HDD nearline EB. Tape stays the cheapest cold archive at about $2–5/TB media. It is not a substitute for online or nearline HDD because of access latency.

**IBM 3592 / TS11xx enterprise tape**
- Continues at 50TB-class native. Next-generation status was not verified this session.

## d.3 Emerging archival media

| Technology | Status 2026 | Claimed metrics | Commercial readiness **[EST]** |
|---|---|---|---|
| **Microsoft Project Silica** (femtosecond-laser voxels in quartz glass) | About 8 years of R&D. Moving to post-prototype pilot | More than 7TB per DVD-sized 2mm glass. Writes in the Mb/s range. 10,000-year life | Pilots 2025–27. Possible Azure archive service 2027–30 [21] |
| **Cerabyte** (laser-etched ceramic on glass) | Seed $10M plus $4M grants. Investors WD, Pure, In-Q-Tel | Pilot 1PB per rack in 2026 (90s time to first byte, 100Mb/s). 100PB per rack and about 2GB/s by 2030. ~$1/TB target [22] | Niche cold archive about 2029–31 |
| **DNA** (Atlas Data Storage / Twist spin-off, Biomemory, Catalog) | Prototypes at GB scale. Atlas targets TB scale in 2026. Biomemory targets a commercial end-to-end offer before end 2026 [23] | Very high volumetric density. Very slow and costly write | Deep archive only. Not cost-competitive before the mid-2030s |
| Holographic | Recurring research | — | Not before 2031 |

None of these targets HDD's online/nearline role. At most they compete with tape for "write once, read rarely" data.

## d.4 Will competitor technology close the $/TB gap with HDD within five years? [EST]

**No.**
1. **Cost curves.**
   - NAND $/GB historically falls about 15–25%/yr. Layer scaling is slowing in cost terms: more layers need more etch and deposition steps, and bonding adds a second wafer.
   - HDD $/TB should fall about 10–15%/yr through 2031 as capacity doubles (HAMR 4 to 10TB/platter) at roughly constant unit BOM.
   - Before the shortage, the enterprise QLC to nearline HDD ratio was about 5–7×. Even under optimistic NAND assumptions, it reaches roughly 3–5× by 2031.
2. **Supply physics.**
   - Global HDD shipments are about 1.3–1.5ZB/yr in 2026 **[EST]**. Total NAND bit output is about 1ZB-class **[EST]**, and most of it is consumed by phones, PCs and performance SSDs.
   - Replacing HDD exabytes would need several hundred billion dollars of new NAND fabs. NAND capex is about $22B/yr [18], so it is not happening.
3. **The 2025–26 shortage reset the gap wider**, to 16–23× [16][17]. Both HDD makers are sold out into 2027–28 [1][33].

**Where HDD *does* lose share**
- Performance-sensitive and capacity-tier deployments limited by power or rack space (AI training data staging), where 245–512TB QLC SSDs win on TB per rack U and watts.
- The IOPS/TB decline of 100TB HDDs if multi-actuator and HBD do not ship.

**Tape and new media** compress HDD only at the cold-archive edge.

**Net:** HDD holds the bulk capacity tier (about 80–90% of hyperscale stored EB) through 2031. The medium-term risk (2031–2035) depends on NAND cost-down and whether HDD parallelism architectures succeed. For a servo engineer, that is where the next ten years of work sits.

---

## Sources

1. Blocks & Files — Seagate Q4 FY2026: HAMR 40% of nearline EB, Mozaic 4+/5+ timing, financials (Jul 30, 2026): https://www.blocksandfiles.com/disk/2026/07/30/seagate-hamring-customers-generating-more-and-more-/tb/5281058
2. TweakTown — Seagate Mozaic 5 50TB on track for 2027, 100TB on roadmap: https://tweaktown.com/news/112955/seagate-says-mozaic-5-50tb-hard-drives-are-on-track-for-2027-with-100tb-already-on-the-roadmap/index.html ; Tom's Hardware: https://www.tomshardware.com/pc-components/hdds/seagate-to-start-qualifying-record-setting-50tb-hdds-in-2027-most-drives-are-sold-out-through-2028
3. StorageReview — WD 40TB UltraSMR shipping, HBD 8×, Dual Pivot, HAMR 1H27, 60TB/100TB roadmap (Aug 6, 2026): https://www.storagereview.com/news/wd-bets-8x-bandwidth-beats-more-terabytes-as-40tb-ultrasmr-starts-shipping
4. Tom's Hardware — WD Investor Day 2025: 36TB CMR / 44TB UltraSMR HAMR, 80/100TB ~2030: https://tomshardware.com/pc-components/hdds/western-digital-to-unveil-44tb-hamr-hdds-in-2026-100tb-in-2030 ; Blocks & Files: https://blocksandfiles.com/2025/02/13/wd-is-hamring-out-its-future/
5. Blocks & Files — Toshiba 12-platter glass demonstration (Oct 14, 2025): https://blocksandfiles.com/2025/10/14/toshiba-demonstrates-12-platter-disk-drive-technology/ ; Toshiba press release: https://toshiba.semicon-storage.com/eu/company/news/2025/10/storage-20251014-1.html
6. NAND Research — WD Innovation Day research note (Feb 9, 2026): https://nand-research.com/research-note-western-digital-innovation-day/ ; StorageReview: https://www.storagereview.com/news/wd-maps-out-100tb-hdd-roadmap-and-performance-breakthroughs-for-ai-storage
7. TechRadar — Toshiba roadmap 40TB (2026/27), 45TB (2028), 55TB+ (after 2029): https://www.techradar.com/pro/toshiba-wants-to-launch-a-55tb-hard-drive-by-2030-40tb-model-set-to-appear-in-2026-new-slides-show ; https://www.techradar.com/pro/toshiba-plans-40tb-hdd-in-2027-with-12-platters-but-i-fear-it-is-way-too-little-way-too-late
8. TechRadar — Seagate 6.9TB/platter lab demo, 4/5/6TB platters 2027/28/29 (Dec 2, 2025): https://www.techradar.com/pro/seagates-latest-breakthrough-ushers-in-the-age-of-55tb-or-even-69tb-hard-drives-and-it-isnt-stopping-there
8b. Mreport — Toshiba HAMR 40TB, FY2027 small volume, 2H FY2028 mass production: https://www.mreport.co.th/en/news/industry-movement/102-toshiba-hamr-hdd-40tb-mass-production-2028
9. Seagate blog — HAMR and MACH.2 multi-actuator (480MB/s, HAMR head 3.2PB/6,000h): https://blog.seagate.com/?p=109375 ; https://www.seagate.com/blog/mach2-and-hamr-breakthrough-ocp/
10. US patents — Managing laser diode cavity thermal transients in HAMR (US12170435): https://patents.google.com/patent/US12170435 ; NFT protrusion measurement (US12300285): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12300285 ; Long-term spacing compensation for HAMR (US11715493): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11715493
11. Seagate careers — Servo Engineering Intern, AI/ML in Control System; Servo Architecture Engineer; Staff Engineer (Servo): https://seagatecareers.com/job/Shakopee-Servo-Architecture-Engineer-Early-Career-MN/1371562800 ; https://seagatecareers.com/job/Shugart-Staff-Engineer-(Servo)/1354377400 ; https://wellfound.com/jobs/4830817-servo-integration-engineer-ii
12. TrendForce — The race to 400-layer NAND (Jun 12, 2026): https://www.trendforce.com/news/2026/06/12/news-the-race-to-400-layer-nand-roadmaps-and-key-technologies-driving-samsung-sk-hynix-and-kioxia/
13. Guru3D — Samsung 400-layer V10 BV-NAND (Aug 5, 2026): https://www.guru3d.com/story/samsung-unveils-400layer-v10-bvnand-and-vertically-stacked-zhbm/
14. TechRadar — Sandisk 256TB (2026), 512TB (2027): https://www.techradar.com/pro/sandisk-plans-256tb-ssd-in-2026-and-512tb-ssd-in-2027-and-no-you-wont-be-able-to-install-it-in-your-desktop-computer
15. TechRadar — Solidigm 245TB+ by end-2026: https://www.techradar.com/pro/solidigm-confirms-245-tb-ssds-set-to-launch-before-end-of-2026 ; Blocks & Files — Solidigm roadmap: https://blocksandfiles.com/2025/10/09/solidigm-speaks-about-its-ssd-roadmap/
16. Blocks & Files — VDURA: SSDs now 16× more expensive than disk (Jan 20, 2026): https://blocksandfiles.com/2026/01/20/vdura-sssds-now-16-times-more-expensive-than-disk-drives/
17. Notebookcheck — Enterprise SSDs now 18.6× HDD cost (Aug 2026): https://www.notebookcheck.net/Enterprise-SSDs-now-cost-18-6x-more-than-HDDs-prices-soar-6-5x-in-a-year.1374822.0.html
18. TrendForce — 2026 memory capex (Nov 13, 2025): https://trendforce.com/presscenter/news/20251113-12780.html
19. StorageReview — LTO-10 40TB, roadmap to 913TB compressed: https://www.storagereview.com/news/lto-program-unveils-lto-10-40tb-ultrium-cartridge-updates-roadmap-toward-913tb-archival-tape
20. Blocks & Files — LTO-10 bumped to 40TB as future tape capacities get cut (Nov 13, 2025): https://www.blocksandfiles.com/tape/2025/11/13/lto-10-bumped-to-40-tb-as-future-tape-capacities-get-cut/1711787
21. Blocks & Files — Project Silica progress (Dec 23, 2025): https://blocksandfiles.com/2025/12/23/project-silicas-glass-storage-archive-tech-progress/
22. HWBusters — Cerabyte 100PB-per-rack by 2030: https://hwbusters.com/news/lasers-ceramics-and-100pb-dreams-cerabyte-wants-to-ditch-tape-and-rewrite-data-storage-physics-by-2030/ ; DCD — WD invests in Cerabyte: https://www.datacenterdynamics.com/en/news/ceramic-long-term-storage-company-cerabyte-secures-investment-from-western-digital/
23. TechRadar — Atlas Data Storage DNA (Dec 29, 2025): https://www.techradar.com/pro/after-nearly-10-years-twist-bioscience-spin-off-plans-terabyte-scale-dna-storage-in-2026-intending-to-store-13tb-of-data-in-a-single-drop-of-water ; Biomemory: https://www.techradar.com/pro/we-intend-to-launch-our-first-end-to-end-commercial-dna-data-storage-solutions-before-the-end-of-2026-biomemory-outlines-its-dna-storage-roadmap-after-catalog-deal
24. UC Berkeley CML — HAMR head-disk interface dissertation (thermal protrusion, smear): https://cml.berkeley.edu/wp-content/uploads/gold-reports/G21001.pdf ; Patent US11587586 (laser-induced protrusion): https://patents.google.com/patent/US11587586
25. Tom's Hardware — Seagate ships 44TB Mozaic 4+ HAMR, 10 platters (Mar 3, 2026): https://tomshardware.com/pc-components/hdds/seagate-begins-shipping-44tb-hard-drives-with-hamr-tech-to-data-centers-mozaic-4-platform-expands-to-10-platters ; Seagate IR: https://investors.seagate.com/news/news-details/2026/Seagate-Delivers-Industrys-Highest-Capacity-Hard-Drives-with-Next-Generation-Mozaic-4/default.aspx
26. StorageNewsletter — Two R&D articles on HAMR (vector recording ~4 Tb/in²; WD HAMR media noise) (Nov 3, 2025): https://www.storagenewsletter.com/2025/11/03/rd-two-articles-on-hamr-technologies-2/
27. StorageNewsletter — Triple-stage actuators for the 1,000 kTPI era (IFAC paper): https://storagenewsletter.com/?p=234479 ; MDPI Actuators review: https://www.mdpi.com/2076-0825/8/3/65
28. Western Digital blog — Foundational technologies (multi-stage microactuation, more than 400k TPI): https://blog.westerndigital.com/?p=7553
29. arXiv — Mixed H2/H∞ data-driven control design for HDDs: https://arxiv.org/pdf/1804.03298
30. TechRadar — WD betting on heat-dot magnetic recording beyond 100TB: https://www.techradar.com/pro/beyond-100tb-heres-how-western-digital-is-betting-on-heat-dot-magnetic-recording-to-reach-the-storage-skies
31. StorageReview — NVMe HDD / OCP: https://www.storagereview.com/news/nvme-hdd-security-out-of-band-attestation-introduced-at-ocp ; SNIA SDC25 OCP storage update: https://www.snia.org/sites/default/files/2025-09/SNIA-SDC25-Stenfort-OCP-Storage-Project-Update.pdf
32. Borecraft — YMTC Xtacking 4.0, 267 layers: https://borecraft.com/2025/09/24/ymtc-closes-gap-with-global-rivals-xtacking-4-0-powers-267-layer-nand-eyes-300/
33. Glenn K. Lockwood — 2025–26 storage shortage notes (HDD sold out, QLC substitution, Phison outlook): https://glennklockwood.com/garden/shortage
34. XenoSpectrum — LTO shipments 2024–2025 and Q1 2026 rebound (Sep 3, 2026): https://xenospectrum.com/en/lto-tape-shipments-rebound-2026/ ; HPCwire (2024 shipments): https://www.hpcwire.com/aiwire/2025/07/23/lto-tape-shipments-reach-176-5-eb-in-2024-marking-15-4-growth/
