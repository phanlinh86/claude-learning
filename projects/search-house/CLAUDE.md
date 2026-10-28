# Search house

## Goal
Find, vet and rank houses for sale in any city or region for a given location, minimum size, budget and house type, and deliver an Excel list plus a PDF recommendation (1 main pick, top 10 alternatives, listings to avoid).

## Status
Working as two Claude skills in this folder. Build scripts for the Excel and PDF live in `src/`, one folder per run (`src/runs/<yyyy-mm>-<area>/`); new runs copy the latest one.
- `.claude/skills/search-house/SKILL.md` – any location worldwide (e.g. US Bay Area).
- `.claude/skills/search-nha-sai-gon/SKILL.md` – Ho Chi Minh City specialist with Vietnam-specific portals and title checks.

## Rules for this project
- Keep everything for this project inside `projects/search-house/`.
- Every price, average and distance claim needs a source or an "est." label.
- State units (sq ft vs m²) and currency conversions with the rate used.
- For Vietnam, use both old and new ward names (HCMC merged wards on 1 July 2025).
- Record how to run it in `README.md`.
