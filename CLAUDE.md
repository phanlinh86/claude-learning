# CLAUDE.md — repo-wide instructions

This repo is where I learn Claude and build small projects with it: programs, agents and skills.

## Layout
- `doc/` – learning material: `tutorials/` (decks), `notes/` (text extracted from the decks)
- `projects/<name>/` – one folder per program; each has its own `CLAUDE.md` with project-specific rules
- `projects/daily-game/<name>/` – games made with `/build-game` (index: `projects/daily-game/DAILY_GAMES.md`)
- `agents/` – standalone agents built with the Claude Agent SDK
- `.claude/skills/<name>/SKILL.md` – skills I build (one folder per skill)
- `.claude/agents/` – subagent definitions
- `shared/` – prompts and helpers reused across projects

## How to work here
- Stay inside the project folder you're asked about; don't edit other projects unless told to.
- Read that project's `CLAUDE.md` before starting.
- Work in steps: Explore → Plan → Build → Check. For anything non-trivial, show the plan before building.
- Keep each project self-contained (its own dependencies, README and tests) so it could be moved to its own repo later.
- Explain what you changed in plain language; I'm learning, so short reasons are welcome.
- Never commit secrets (API keys go in a `.env` file, which is gitignored).
