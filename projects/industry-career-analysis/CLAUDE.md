# Industry career analysis

## Goal
Decide whether to stay in an industry for the next 10–20 years and which company to aim for. Given an **industry** (plus the person's role and experience), research the market, competitors, technology and each company with parallel agents, and deliver three PDFs: market & competitors, companies analysis, and working at those companies (layoffs, culture, pay, recommendation).

## Status
Working as a Claude skill in this folder: `.claude/skills/industry-career-analysis/SKILL.md`. Build scripts live in `src/`, one folder per run (`src/runs/<yyyy-mm>-<industry>/`); new runs copy the latest one.

## Rules for this project
- Keep everything for this project inside `projects/industry-career-analysis/`.
- Every number needs a year and a source, or an **[EST]** label.
- Use the latest data (latest fiscal year, latest quarter and guidance) — search, don't recall.
- Keep the agents' raw research in the run's `research/` folder; it is the evidence behind the PDFs.
- Not financial advice; say so in each report.
- Record how to run it in `README.md`.
