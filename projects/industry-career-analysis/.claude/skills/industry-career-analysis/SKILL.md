---
name: industry-career-analysis
description: Analyze an industry for a long-term career decision — market drivers, competitors, technology roadmap, each company's finances, layoffs, culture and pay — using parallel research agents, delivered as three PDF reports with a recommendation on which employer to aim for.
---

# Industry career analysis

Act as a financial and technology analyst who knows the industry well. The person is an experienced professional deciding whether to stay in an industry for the next 10–20 years and which company to aim for. Research the market, its competitors and its companies with parallel agents, then deliver **three PDF reports**:

1. **Market & competitor report** – is the industry still growing, and how much could it be worth in 5 years?
2. **Companies analysis** – each company's finances and technology, growth potential, and whether it survives a whole-market downturn.
3. **Working at these companies** – layoffs, employee feedback, culture, compensation vs a normal engineer in the same field, projected pay capacity, and a final employer ranking and 10–20 year plan.

First run: HDD (hard disk drive) industry for a 15-year HDD servo engineer, Oct 2026 – see `src/runs/2026-10-hdd/` for the agent notes, build scripts and finished PDFs. Copy that run as the template.

## Inputs (ask only for what is missing, in one question)
1. **Industry** (required) – e.g. "HDD", "semiconductor equipment", "EV batteries", "satellite communications". Define its boundary in one line (what is in, what is a competitor).
2. **The person's role and experience** – e.g. "15 years as an HDD servo developer". Used to judge which technology trends create demand for their skill and which companies employ it. If not given, assume a senior engineer in the industry's core technology and say so.
3. **Location / work region** (optional) – changes pay data, layoff exposure and offshoring risk. Default: US, with a short Asia/Europe note.
4. **Horizon** (optional) – default 5-year market forecast, 10–20-year career view.

If the person isn't watching, take the defaults, state them at the top of Report 1, and carry on.

## Step 0 – Plan and scope (no agents yet)
- Get today's date (use the date tool, never assume). All research must use the latest data: most recent fiscal year, latest quarter's earnings and guidance.
- Name the industry's companies (pure plays first, then major divisions of conglomerates, then key suppliers) and its competing technologies/substitutes. One or two quick searches are fine to get this right.
- Create a task list: research market → Report 1 → research companies → Report 2 → research people/pay → Report 3 → verify.
- Create a run folder: `src/runs/<yyyy-mm>-<industry-slug>/` with `research/` and `output/`.

## Step 1 – Launch the research agents (all in ONE message, so they run in parallel)
Use `Agent` (general-purpose, `run_in_background: true`). Every prompt must contain: today's date; "use WebSearch/WebFetch, latest 2-year data, do not rely on memory for numbers"; labels **[R] reported / [D] derived / [EST] estimate**; "write the full markdown report to `<run>/research/NN_topic.md` with a Sources section of URLs, then return a concise summary".

**Search budget warning:** all agents share one web-search budget (~200 searches per turn). With 8 agents, tell each one "use at most ~20 searches; prefer fetching primary sources (SEC filings, earnings releases, research-firm press releases) over many small searches; if the budget runs out, finish from what you have and flag gaps". Put the most important facts first in each prompt.

Agents (rename for the industry; merge or split by how many companies there are):

| # | File | Topic |
|---|---|---|
| 01 | `01_macro_market.md` | **Overall tech/economy drivers** of the industry (capex cycles, end-markets, AI, policy) + opportunities and risks for the next 5 years. **Industry financials**: revenue, units and the value metric (e.g. exabytes) history ~8 years, ASP/price trend, segments and their share, margins/cost structure of leaders, supply tightness, third-party forecasts (TrendForce, IDC, Gartner, analysts) and why they differ, and an own base/bear/bull forecast. |
| 02 | `02_competitors_financial.md` | **Competing technologies/substitutes**: who they are, their market size, growth, margins, capex, price-per-unit-of-value gap vs the industry over time, analyst views on displacement, and what happened in the latest shortage/glut. |
| 03 | `03_technology.md` | **Technology roadmap** of the industry (what drove growth, status now, what comes next 5 years, newer tech) and of the competitors; whether competitors close the gap within 5 years. **Include details specific to the person's role** (e.g. servo/control challenges) and evidence of hiring demand for that skill. |
| 04+ | `04_<company>.md` … | **One agent per major company**: financial analysis (revenue, gross/operating margin, R&D, SG&A, net income, FCF, debt/cash, buybacks — ~8 fiscal years + latest quarter and guidance), mix, customer concentration, contracts, headcount history, restructurings/layoffs, plant and R&D site locations (where the person's role sits), stock and credit rating, what happened in the last downturn. Technology position vs peers, R&D spend, vertical integration, who leads. |
| — | `NN_smaller_players_supplychain.md` | Smaller makers + key suppliers in one agent, and **which other industries value the person's skill** (exit options). |
| — | `NN_employee_feedback_layoffs.md` | Layoff history per company (layoffs.fyi, TheLayoff.com, TeamBlind, WARN notices, news), Glassdoor/Indeed/Comparably ratings and recurring themes (paraphrase, no long quotes), RTO/remote, offshoring, sentiment shift in the current cycle. |
| — | `NN_compensation.md` | H-1B/LCA base salary (h1bdata.info, Ellis.com, MyVisaJobs) by title and site, Levels.fyi total comp by level vs benchmark companies in neighbouring industries, BLS median/percentiles for the occupation, job-posting pay ranges, equity/ESPP/bonus programs and effect of recent stock moves, brief non-US pay. |

While waiting, don't duplicate agents' work. As each finishes, note its gaps.

## Step 2 – Report 1: Market & competitors
Read `01`–`03` in full. Then write the build script (copy `src/runs/2026-10-hdd/build_report1_market.py`; shared styles and helpers are in `src/common.py`: `P`, `bullets`, `table`, `callout`, `kpis`, `fig`, `build`). Sections:
1. Cover: 4 KPI tiles, **Bottom line** callout (is the industry growing; is the risk cyclical or structural), key findings, method line.
2. Tech market and its effect on the industry (driver chart + driver table + how demand flows).
3. Industry financials (revenue/units/value chart, segments table, margin/cost table).
4. Competitors (table, price-gap chart, "did the last shortage help or hurt?", TCO arguments both sides).
5. Technology roadmap vs competitors (table, capacity/performance roadmap chart, callout on **why it matters for the person's role**).
6. Opportunities and risks (two tables with likelihood/probability).
7. Outlook: base/bull/bear revenue forecast chart + table, other published forecasts, green assessment callout that ends with what it means for a 10–15-year career.
8. Sources.
Send the PDF as soon as it is built (`SendUserFile`, `display: attach`) so the person can redirect early.

## Step 3 – Report 2: Companies
Read the company files in full. Sections: cover with scorecard table (latest revenue, margins, R&D, balance sheet, tech position, integration, employees, survives downturn?, 5-yr outlook); industry structure (share pie charts); one section per company (financial table ~8 years + estimate, bullets, technology bullets); supply chain table; growth potential (revenue history chart + 5-year base-case table per company); **downturn stress test** (two scenarios from Report 1, e.g. revenue −35%/GM compressed and a repeat of the last trough; compute operating income with opex held flat; state likely company response) and a long-term ranking callout. Survival and jobs are separate questions — say so.

## Step 4 – Report 3: Working there + recommendation
Read the feedback and compensation files in full. Sections:
- Cover: KPI tiles (pay band, total comp, ratings, layoff probability), green **Recommendation** callout (stay or leave the industry, which company, for how long), employer ranking table for the person's role.
- Layoff history table by year × company + headcount chart.
- Employee feedback table and recurring themes (positive, negative, Blind anecdotes, RTO, offshoring, current mood).
- Compensation: base table by title/source, total-comp bar chart vs benchmark companies, staff-level breakdown (base/stock/bonus/equity share), where the person lands, location effect, stock windfall caveats, benefits, non-US pay.
- **Projection (pay capacity)**: operating-margin outlook chart and opex/revenue table (FY actual, base, bear), expected merit raises/bonus, probability of company-wide layoff rounds; "capacity to pay vs appetite to pay"; layoff-risk table by horizon for the person (US vs Asia-based).
- 10–20 year plan table (period → industry state → what to do), choosing between the top two employers, final-answer callout, sources.

## Step 5 – Verify, then deliver
- Re-check the 3–5 most important numbers (latest quarterly revenue, margins, guidance for each main company) against the primary source (SEC filing / earnings release) with WebFetch.
- Render every PDF page to PNG (`pdftoppm -r 60`) and look at a montage: no orphan headings, legends not covering data, tables not overflowing, no near-empty pages. Fix and rebuild.
- Every estimate carries **[EST]**; every chart has a source caption; not-investment-advice line on each report.
- Final reply: answer the career question in 2–3 sentences, then 3 short sections (market, companies, working there) with the key numbers, the data gaps that rest on estimates, one follow-up question (e.g. which region they work in), and a Sources list.

## Rules
- Use the latest data; search, don't recall. Give years and sources for every number.
- Separate **capacity** (exabytes, units) from **value** (revenue): growth in one is not growth in the other.
- Be balanced: give the bull and bear case for the industry and for each company; don't let vendor talking points stand unlabelled.
- Career advice is about the person's specific role, not the industry in general: map roadmap items to demand for their skill, and name transferable exit industries.
- Not financial advice; say so once per report.

## Files
- `src/common.py` – shared ReportLab styles and helpers (DejaVu fonts, colours, tables, KPI tiles, callouts, charts, page header/footer).
- `src/runs/<run>/build_report1_market.py`, `build_report2_companies.py`, `build_report3_career.py` – one script per PDF; data lives inline in each script.
- `src/runs/<run>/research/` – the agents' markdown reports (keep them; they are the evidence).
- `src/runs/<run>/output/` – the PDFs.
