---
name: search-house
description: Search for houses for sale in any city or region worldwide (e.g. US Bay Area, Ho Chi Minh City) from a target location, size, budget and house type; vets each candidate's surroundings and delivers an Excel list and a PDF recommendation.
---

# Search house (any location)

Act as an experienced local real-estate agent for whatever market the buyer names. Find current for-sale listings that match the buyer's inputs, research each candidate's surroundings with parallel agents, then deliver an Excel workbook and a PDF recommendation (1 main pick + top 10 alternatives + listings to avoid).

If the location is in Vietnam, use the `search-nha-sai-gon` skill's market notes (ward mergers, sổ hồng / hoàn công checks, Vietnamese portals) alongside this workflow.

## Inputs (ask only for what is missing, in one question)
1. **Location** – city, region, county, neighbourhoods or ZIP codes, e.g. "San Jose or Sunnyvale", "East Bay within 45 min of SF", "Quận 3". Treat "near X" as X plus directly adjacent areas, and say which areas you included.
2. **Size** – minimum size and its unit. In the US ask whether it means living area (sq ft) or lot size; elsewhere usually land or floor area in m². Convert units if needed (1 m² = 10.764 sq ft).
3. **Budget** – any currency. If it differs from the local currency, convert with a current rate found by search and state the rate. Note recurring costs that change affordability (US: property tax, HOA, insurance; elsewhere: local fees).
4. **House type** – e.g. single-family, townhouse, condo, alley house; plus must-haves such as bedrooms, bathrooms, parking/garage, yard. Exclude listing types the buyer didn't ask for (e.g. land only, multi-unit rentals, auctions, 55+ communities) and say so.

## Step 0 – Understand the market
Before collecting listings, search for: the area's median or average price (and per sq ft / per m²) for the requested type, typical days on market, and the main local risks. Use this to set realistic expectations and to spot implausible prices. If the budget can't buy the request in that area, say so early and widen to the nearest affordable adjacent areas, clearly labelled.

## Step 1 – Best websites for this market
Identify the main listing portals for the location and describe each in one line. Examples:
- **US:** Zillow, Redfin, Realtor.com, Homes.com, Trulia; local MLS-backed brokerage sites (e.g. Compass, Coldwell Banker). Zillow and Redfin often block automated fetching – use WebSearch snippets and try Realtor.com / Homes.com / brokerage pages for details.
- **UK:** Rightmove, Zoopla, OnTheMarket. **Australia:** realestate.com.au, Domain. **Vietnam:** batdongsan.com.vn, nhatot.com, muaban.net, alonhadat.com.vn (see `search-nha-sai-gon`).
- Elsewhere: search "<city> houses for sale website" and pick the 4–8 largest portals.

## Step 2 – Collect listings (active now; recent sales only as price benchmarks)
- WebSearch in the local language with the area, type, price and size (e.g. "3 bed single family home for sale Sunnyvale under $1.8M", "bán nhà hẻm Quận 3 dưới 8 tỷ").
- WebFetch search-result and city/neighbourhood listing pages that load; ask the fetch prompt for address, full listing URL, price, beds/baths, living area, lot size, year built, HOA, days on market / post date, status (active, pending, contingent).
- Record every listing seen (including rejects) with site, title/address, URL, area, size, price, date, status and outcome reason. Skip pending/sold listings except as benchmarks.

## Step 3–4 – Filter and shortlist
Keep listings in or near the target area that meet the size, budget, type and must-haves. Reject and note: over budget, too small, wrong type, pending/sold, land only, and implausible prices (far below the area median per unit area → possible auction, fixer with major defects, leasehold, shared title, scam or stale ad – keep only as "Avoid" if otherwise matching). Flag duplicates across portals. Allow at most 2 "stretch" options up to ~5% over budget, clearly labelled. Give each shortlisted home a short ID (e.g. SJ-1, SV-2).

## Step 5 – Research agents
Launch Agent (general-purpose) calls **in one message so they run in parallel** – one per home, or 2–4 homes per agent when they share a neighbourhood. Each prompt must include today's date, the area's median price, local naming quirks (e.g. new ward names, city vs unincorporated county), and each home's ID, URL and key facts. Ask each agent, using WebSearch/WebFetch only, to:
1. Confirm address, size (living + lot), beds/baths, parking, year built, HOA, status, price and price history; list red flags.
2. Find the nearest grocery store / supermarket, public elementary (primary) school with its rating (US: GreatSchools rating and assigned school district), and nearest hospital with ER – name, distance (~mi or ~km, est.), short reputation with source.
3. Assess safety and hazards with sources: crime level vs city average (US: city police data, CrimeGrade, NeighborhoodScout); natural hazards (US/California: FEMA flood zone, CAL FIRE fire hazard severity zone, Alquist-Priolo earthquake fault zone, liquefaction; elsewhere: flooding, typhoon, landslide); noise (freeways, airport flight paths, rail); planning or road-widening issues.
4. Add commute time to any workplace or centre the buyer named.
5. Return a fixed block per home: CONFIRMED / FLAGS / GROCERY / SCHOOL / HOSPITAL / SAFETY & HAZARDS / COMMUTE / SAFETY_SCORE, LIVABILITY_SCORE, VALUE_SCORE, VERIFICATION (1–5) / SOURCES.
While waiting, load the xlsx and pdf skills. Save each report to the scratchpad as it arrives.

## Step 6 – Excel (load the xlsx skill; openpyxl, Arial, run recalc.py, zero errors)
Sheets:
- **Read me** – currency rate (if any), budget, minimum size, units as yellow input cells; budget in local currency formula; scoring method; area notes; caveats; sources.
- **Websites** – site, link, why.
- **All listings** – every listing: site, address/title, hyperlink "Open listing", area, size, price (blue input), date, status, formulas for converted price, price per unit area, ">= min size?", "within budget?", outcome/reason; autofilter.
- **Shortlist** – ID, address, link, size, beds/baths, parking, year built, HOA/fees, price, converted price (formula), price per unit area, grocery, school (+ rating), hospital, safety & hazards, commute, red flags, Safety/Livability/Value/Verification (blue inputs), Total = S+L+V+2×Verification (formula), RANK formula, within budget?, Status (MAIN PICK green, Avoid orange, stretch labelled).

## Step 7 – Recommendation PDF (load the pdf skill; reportlab, A4 or Letter for US buyers; use DejaVuSans when text has non-Latin diacritics)
Sections: title with location, budget (and converted amount + rate); Summary (listings reviewed, how many passed, the key market finding); **My recommendation** box (best total score among non-Avoid within budget, ideally verification ≥ 4) with why, watch-outs and surroundings; **Top 10 alternatives** table (rank, ID/address/link, price + price per unit area, size, score, one-sentence reason; break ties by lower price per unit area); surroundings table for the top picks; **Listings to avoid**; **Before you make an offer** checklist adapted to the market (US: pre-approval, disclosures, inspection & termite reports, hazard disclosures, insurance quote incl. fire/earthquake, HOA documents, title report, contingencies; Vietnam: see `search-nha-sai-gon`); best websites; sources; "not legal or financial advice" line. Render pages to PNG and check that table columns don't wrap badly before delivering.

## Deliver
Send the PDF and Excel with SendUserFile. Write a short markdown summary of the pick, top 10 and avoid list to the attached Project if one exists. In the chat reply: the main pick and why in 2–3 sentences, the top 10 as one line each, the avoid list, method caveats (estimated distances, blocked pages, listings change daily), and a Sources list.
