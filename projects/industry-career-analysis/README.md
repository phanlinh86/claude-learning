# Industry career analysis

A Claude skill that acts as a financial and technology analyst for a career decision: given an **industry** and your role, it sends parallel research agents to study the market, competing technologies, the technology roadmap, each company's finances, layoffs, employee feedback and pay, then delivers three PDF reports and a recommendation on which company to aim for over the next 10–20 years.

## Skill
| Skill | Use it for |
|---|---|
| `industry-career-analysis` | Any industry, e.g. HDD, semiconductor equipment, EV batteries |

## How to run
Open Claude Code in this folder (`projects/industry-career-analysis/`) so the project skill loads, then ask, for example:

```
Use the industry-career-analysis skill.
Industry: HDD (hard disk drives)
Role: servo developer, 15 years of experience
Location: US (Asia note welcome)
```

A run uses about 8 research agents and takes roughly 20–30 minutes.

## Outputs (per run)
1. `*_Market_and_Competitor_Report.pdf` – drivers, market financials, competitors, technology, 5-year value forecast
2. `*_Companies_Analysis.pdf` – each company's finances and technology, growth, downturn stress test
3. `Working_at_*_Companies.pdf` – layoffs, culture, compensation vs other hardware engineers, pay outlook, 10–20 year plan

## Files
- `.claude/skills/industry-career-analysis/SKILL.md` – the skill
- `src/` – Python build scripts for the PDFs, one folder per run (see `src/README.md`)
