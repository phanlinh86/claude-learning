---
name: "search-nha-sai-gon"
description: "Search nhà Sài Gòn: find, vet and rank houses for sale in Ho Chi Minh City from a target location, land area, budget and house type; delivers an Excel list and a PDF recommendation."
---

# Search nhà Sài Gòn (HCMC house search)

Act as an experienced HCMC real-estate agent. Find current for-sale ads that match the buyer's inputs, research each candidate's surroundings with parallel agents, then deliver an Excel workbook and a PDF recommendation (1 main pick + top 10 alternatives + ads to avoid).

## Inputs (ask only for what is missing, in one question)
1. **Target location** – district(s)/ward(s), e.g. "District 10 or Thủ Đức". Treat "near X" as inside X plus directly adjacent wards.
2. **Area** – minimum land area in m² (land on the sổ hồng, not floor area). "More than 50" means strictly > 50.
3. **Budget** – in USD or VND. Convert USD with today's Vietcombank *transfer buying* rate (search "tỷ giá Vietcombank hôm nay"); state the rate and the budget in tỷ VND.
4. **House type** – e.g. single-family nhà riêng / nhà hẻm (alley OK), nhà mặt tiền, nhà cấp 4, căn hộ. Exclude rooming houses (CHDV, dãy trọ, many PN with en-suite WCs) unless asked.

## Background facts to apply
- HCMC merged wards on 1 July 2025. Ads show both names, e.g. old D10 → Vườn Lài / Hòa Hưng / Diên Hồng; old Thủ Đức → Hiệp Bình, Tam Bình, Linh Xuân, Thủ Đức ward; old Q9 → Tăng Nhơn Phú, Long Bình. Search with both old and new names.
- Reference price levels (Oct 2026, check again): D10 hẻm 155–220 tr/m²; old Thủ Đức hẻm ~70–97 tr/m²; old Q9 ~60–90 tr/m². Look up the target area's current average (alonhadat ward pages show avg tr/m²; muaban district pages have price tables).
- Known risks: QL13 widening to 60 m (Hiệp Bình, works to 2028); Ring Road 2 (Tô Ngọc Vân/Tam Bình); flooding on Kha Vạn Cân / Chợ Thủ Đức / Tô Ngọc Vân / Lã Xuân Oai / riverside Hiệp Bình; worker areas by Linh Trung EPZ and Bình Chiểu IZ.

## Step 1 – Best websites
List and briefly describe: batdongsan.com.vn (largest; blocks WebFetch – use search snippets), nhatot.com (Chợ Tốt Nhà), muaban.net (fetches well; ward pages; best scraping source), alonhadat.com.vn (fetches the base district page; its ?dt=&gia= filters are broken and redirect), homedy.com, mogi.vn, nhadat24h.net, bds123.vn / i-batdongsan / 123nhadatviet (aggregators, good for spotting duplicates).

## Step 2 – Collect ads (past year, prefer last 3 months)
- WebSearch in Vietnamese, e.g. "bán nhà hẻm <quận> <giá> tỷ <m2>", "bán nhà <phường> sổ hồng riêng".
- WebFetch district/ward list pages: `https://muaban.net/bat-dong-san/ban-nha-hem-ngo-<district-slug>-ho-chi-minh` (+ `?page=2`), `https://alonhadat.com.vn/nha-dat/can-ban/nha-trong-hem/ho-chi-minh/<id>/<slug>.html`. Ask the fetch prompt for title, full URL, price, area, PN/WC, ward, post date.
- Record every ad seen (including rejects) with site, title, URL, ward, land m², price (tỷ), posted date and outcome reason.

## Step 3–4 – Filter and shortlist
Keep ads that are in/near the target location, land area meets the minimum, price ≤ budget (in tỷ), and match the house type. Note as rejected: over budget, too small, floor area quoted as land area, rooming blocks, and implausible prices (< ~40% of the area average → likely vi bằng / sổ chung / farmland bait – keep only as "Avoid" if otherwise matching). Flag likely duplicates (same price/agent, slightly different area). Give each shortlisted house an ID (e.g. D10-1, TD-01).

## Step 5 – Research agents
Launch Agent (general-purpose) calls **in one message so they run in parallel**. One agent per house, or group 2–4 houses in the same neighbourhood per agent (they share amenities). Each agent prompt must include today's date, the ward-merger note, the area price average, and the houses (ID, URL, key facts). Ask each agent, using WebSearch/WebFetch only, to:
1. Confirm address/alley, land m², floors, PN/WC, alley width & car access, legal (sổ hồng riêng, hoàn công), post date, price; list red flags.
2. Find the nearest traditional market, supermarket, public primary school and real hospital – name, distance (~km, est.), short reputation with source.
3. Assess safety: security reputation, flooding history, traffic, planning (quy hoạch / lộ giới).
4. Return a fixed block per house: CONFIRMED / FLAGS / MARKET / SUPERMARKET / SCHOOL / HOSPITAL / SAFETY / SAFETY_SCORE, LIVABILITY_SCORE, VALUE_SCORE, VERIFICATION (1–5) / SOURCES.
While waiting, load the xlsx and pdf skills. Save each report to the scratchpad as it arrives.

## Step 6 – Excel (load the xlsx skill; openpyxl, Arial, run recalc.py, zero errors)
Sheets:
- **Read me** – exchange rate, budget USD, minimum area as yellow input cells; budget in tỷ formula; scoring method; ward-merger note; caveats; rate source.
- **Websites** – site, link, why.
- **All listings** – every ad: site, title, hyperlink "Open ad", area, ward, land m², price tỷ (blue input), posted, formulas for USD price (=price*1E9/rate), tr/m², ">min area?", "within budget?", outcome/reason; autofilter.
- **Shortlist** – ID, address, ad link, land, floors, bed/WC, alley, legal, posted, price, USD (formula), tr/m², market, supermarket, school, hospital, safety, red flags, Safety/Livability/Value/Verification (blue inputs), Total = S+L+V+2×Verification (formula), RANK formula, Status (MAIN PICK green, Avoid orange).

## Step 7 – Recommendation PDF (load the pdf skill; reportlab with DejaVuSans for Vietnamese diacritics, A4)
Sections: title with budget in USD and tỷ + rate; Summary (ads reviewed, how many passed, the key market finding); **My recommendation** box (highest total score among non-Avoid, ideally verification ≥ 4) with why + watch-outs + surroundings; **Top 10 alternatives** table (rank, ID/address/ad link, price tỷ + USD + tr/m², land, score, one-sentence reason; break ties by lower tr/m²); surroundings table for the top picks; **Ads to avoid**; **Before you pay any deposit** checklist (see sổ hồng, quy hoạch certificate, hoàn công, visit in heavy rain/high tide, pay via bank at a notary, old vs new ward names); best websites; sources; "not legal or financial advice" line. Render pages to PNG and check that table columns don't wrap badly before delivering.

## Deliver
Send the PDF and Excel with SendUserFile. Write a short markdown summary of the pick, top 10 and avoid list to the attached Project if one exists. In the chat reply: the main pick and why in 2–3 sentences, the top 10 as one line each, the avoid list, method caveats (estimated distances, blocked pages), and a Sources list.

## Reuse the build scripts
Before writing the Excel and PDF, look in `projects/search-house/src/runs/` for the latest run in the same market. Copy that folder to `src/runs/<yyyy-mm>-<area>/`, replace `data.py` with this run's listings, research and wording, adjust titles in the build scripts, run them, then commit the new run folder (scripts, `reports/`, `output/`). Never put the user's email or other personal details in committed files - the repo is public.
