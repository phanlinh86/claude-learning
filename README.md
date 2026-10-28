# Learning Claude

My notes, decks and prompt templates from learning how to use Claude well.

## Layout
- `CLAUDE.md` – standing instructions Claude reads in this repo
- `doc/tutorials/` – study decks (original .pptx files)
- `doc/notes/` – text extracted from each deck, so it's searchable and changes show up as diffs
- `projects/` – one folder per program: `flappy/`, `stock-briefing/`, `pdf-summarizer/`, `search-house/`, `industry-career-analysis/`
- `agents/` – standalone agents (Claude Agent SDK)
- `.claude/skills/` – skills I build, one folder each with a `SKILL.md`
- `.claude/agents/` – subagent definitions
- `shared/prompts/` – reusable prompt templates

## Learning log
| Date | What I learned / added |
|---|---|
| 2026-10-25 | **From Tokens to Teams of Agents** (39 slides): how LLMs work (tokens, attention, sampling, RAG), agents, multi-agent systems |
| 2026-10-25 | **Using Claude Well v1** (33 slides): prompting, effort & caching, where to use Claude, agents, Explore→Plan→Build→Check |
| 2026-10-25 | **Prompt template**: XML-structured prompt (role / context / task / rules / format) for a 4-slide HPQ equity briefing |
| 2026-10-25 | **Using Claude Well v2** (42 slides): added MCP, a slide per Explore/Plan/Build/Check step, making a skill, demo videos, example GitHub repos |
| 2026-10-25 | **Repo structure**: one repo sorted by kind; started projects `flappy`, `stock-briefing`, `pdf-summarizer` |
| 2026-10-28 | **industry-career-analysis** skill: multi-agent industry + employer research for a career decision; first run on the HDD industry (3 PDF reports) |
