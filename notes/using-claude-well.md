# Using Claude Well

Text extracted from `Claude_Usage_Guide.pptx` (33 slides) so it is searchable and diffable on GitHub.

## 1. Using Claude Well
- From writing a good prompt to settings, agents, workflows and plans
- prompt
- settings
- agents
- workflows
- A companion to “From Tokens to Teams of Agents”: that deck explains how it works, this one explains how to use it.

## 2. Five parts, from one prompt to a team of agents
- PART 1
- Prompting
- The colleague test, prompt anatomy, techniques, long documents
- PART 2
- The knobs
- Sampling, effort, context window, max_tokens, KV cache and prompt caching
- PART 3
- Where to set them
- Claude app, API, Claude Code, local open models
- PART 4
- Agents & multi-agent
- The agent loop, five workflow patterns, orchestrators, subagents
- PART 5
- Workflows & plans
- Plan mode, skills, hooks, long-running work, a worked example

## 3. PART 1
- Prompting
- Most of the quality you get from Claude is decided by what you write before you press Enter.
- Role
- Context
- Task
- Rules
- Format
- Examples

## 4. The golden rule: brief Claude like a brilliant new colleague
- The colleague test
- Could a smart person who knows nothing about your project do the task with only your prompt? If they would need to ask questions, add those answers to the prompt.
- Claude doesn’t know
- Who the output is for, and why you need it
- What “good” looks like to you
- Your files, data, past decisions and jargon
- What you have already tried
- LESS EFFECTIVE
- Write an email about the new policy.
- MORE EFFECTIVE
- Write a short email to our 40 support agents announcing that, from 1 Nov, refunds under $50 no longer need manager approval. They have asked for this for months, so keep it upbeat. Explain the one new step (log the reason in the ticket). Under 150 words, plain text, no bullet points, end by saying who to ask with questions (Mai, team lead).

## 5. Anatomy of a strong prompt
- Role
- Who Claude should act as
- Context
- Background, audience, why it matters
- Task
- The exact thing to do, as a verb
- Rules
- Constraints, what to avoid, edge cases
- Format
- Length, structure, tone, file type
- Examples
- 1–5 samples of what good looks like
- <role>You are a financial analyst who writes for busy executives.</role>
- <context>The attached Q3 report goes to the board on Friday.
- They care most about cash runway and churn.</context>
- <task>Summarise the report for the board.</task>
- <rules>Use only figures from the report. If a number is
- missing, say so; do not estimate.</rules>
- <format>5 bullets, max 20 words each, then one line:
- "Biggest risk: ..."</format>
- <example>• Revenue up 12% QoQ to $4.1M, led by enterprise.</example>

## 6. Six techniques that reliably improve results
- Be explicit
- Want more than the bare minimum? Ask for it. “Go beyond the basics, include X and Y.”
- Explain why
- “This is read aloud by text-to-speech, so never use ellipses” beats “NEVER use ellipses.”
- Show examples
- 3–5 varied examples in <example> tags are one of the strongest ways to steer format and tone.
- Use XML tags
- Separate instructions, documents and examples: <instructions>, <document>, <example>.
- Say what to do
- “Write in flowing paragraphs” works better than “Don’t use markdown.”
- Ask for a check
- “Before you finish, verify the answer against the test cases.” Catches its own mistakes.

## 7. Long documents: put them first, ask your question last
- System prompt: role, rules
- <documents> … 20k+ tokens of reports, contracts, code … </documents>
- Instructions: what to do with them
- Your question (at the very end)
- Top of prompt
- End of prompt
- up to 30%
- better answers on complex multi-document tasks when the query comes after the documents (Anthropic docs)
- Two more tricks
- Ask Claude to quote the relevant passages in <quotes> first, then answer from them. It cuts through the noise.
- Wrap each file in <document> with <source> and <document_content> tags so it can cite which file said what.

## 8. Treat a prompt like code: test it, change one thing, test again
- Write
- First draft using the anatomy
- Test
- Run on 5–20 real, varied inputs
- Read
- Find the failure pattern, not one bad output
- Fix
- Change one thing; add an example or rule
- Chain prompts for big tasks
- Draft → review against criteria → refine, as separate steps. You can inspect and fix each step, and each prompt stays simple.
- Let Claude help
- Ask: “Here is my prompt and an output I didn’t like. Rewrite the prompt so this doesn’t happen.” The Claude Console also has a prompt generator and improver.

## 9. PART 2
- The knobs
- Temperature, top-k, top-p, effort, context length, max tokens, KV cache: what each does and what you can actually change on Claude today.
- temp
- top_k
- top_p
- effort
- cache

## 10. Which knobs exist on Claude today (Opus 5.5 / Sonnet 5)
- Older models (Claude 4.5 and earlier) still accept temperature, top_p and top_k. The newest models moved these decisions inside the model.

## 11. Refresher: what temperature, top-k and top-p do
- Temperature
- Sharpens (low) or flattens (high) the whole distribution. Low = focused and repeatable; high = varied.
- Top-k
- Keep only the k most likely tokens. k = 3 → only mat, floor, sofa can be picked.
- Top-p
- Keep the fewest tokens whose probabilities add up to at least p. With p = 0.9: the 7 teal bars (92%).
- Illustrative numbers.

## 12. Sampling on Claude: from sliders to “just prompt it”
- Claude 3 – 4.5
- temperature 0–1 (default 1.0), top_p, top_k all accepted
- Later Claude 4.x
- Pick temperature or top_p, not both; defaults recommended
- Opus 4.7 (Apr 2026)
- Sampling params deprecated; adaptive thinking only; effort gains xhigh
- Opus 5.5 · Sonnet 5
- Sampling params return HTTP 400. Thinking always on; effort is the dial
- What to do instead
- Want consistent output? Give a fixed format, examples and structured outputs (a JSON schema). Even temperature 0 never guaranteed identical answers.
- Want variety? Ask for it: “Give 5 very different options”, or say who the audience is and what tone to take.

## 13. Effort: the dial that replaced the sampling sliders
- low
- Fast and cheap. Simple lookups, classification, chat
- medium
- Default on Opus 5.5. Most everyday work
- high
- Default on most other models. Harder reasoning
- xhigh
- Long exploration, tricky code, deep analysis
- max
- No limit on thinking. Hardest problems only
- client.messages.create(
- model="claude-opus-5-5",
- max_tokens=64000,
- output_config={"effort": "high"},
- messages=[{"role": "user",
- "content": "..."}],
- Rules of thumb
- Higher effort = more thinking tokens, billed as output
- Changing effort mid-conversation breaks the prompt cache
- Hitting max_tokens? Raise it, or lower effort if it overthinks
- Test on your own tasks; don’t copy settings between models

## 14. Context window vs max_tokens: one is fixed, one is yours
- Everything below must fit in the context window (1M tokens on current models)
- Tools
- System prompt
- Chat history + tool results
- Files / images
- Thinking + answer
- ↑ capped by max_tokens (up to 128k)
- Context window
- Set by the model, not by you. 1M tokens ≈ 750k words. Cached tokens still take up space.
- max_tokens
- Your hard cap on output, including thinking. Too low → stop_reason "max_tokens" and a cut-off answer.
- When it fills up
- Use compaction (server-side summary of old turns) or context editing (clear old tool results). Or start fresh from notes.

## 15. From KV cache to prompt caching
- What the KV cache is
- While reading your prompt, each layer stores keys and values for every token. Reusing them means the model doesn’t reprocess text it has already seen.
- On the Claude API
- You can’t size or tune the server’s KV cache
- You can mark a stable prefix with cache_control
- TTL 5 min (refreshed on each hit) or 1 hour
- Up to 4 breakpoints; min ~512 tokens on new models
- Prefix order: a change invalidates its level and everything after it
- tools
- system prompt + big docs
- old messages
- new msg
- cache_control here: cached prefix ←
- system=[{
- "type": "text",
- "text": LONG_STABLE_INSTRUCTIONS,
- "cache_control": {"type": "ephemeral",
- "ttl": "1h"},
- # or top-level cache_control for automatic
- Check usage: cache_read_input_tokens > 0 means it worked.

## 16. 10 questions on one 50k-token document: up to 83% cheaper
- Cache write
- 1.25× base price (5 min)
- 2× base price (1 hour)
- Cache read
- 0.1× base on most models
- 0.05× on Opus 5.5 / Sonnet 5.5
- Also faster
- Cached prefixes skip reprocessing, so long prompts answer sooner

## 17. PART 3
- Where to set them
- The same ideas show up in four places, each with different controls.
- app
- API
- Code
- local

## 18. Four places you use Claude, and the controls in each
- Claude app
- claude.ai, desktop, mobile
- Model picker
- Extended thinking / effort
- Projects: shared files and instructions
- Styles, custom instructions, memory
- No temperature or context sliders
- Claude API
- Console Workbench + SDKs
- model, max_tokens, effort
- system prompt, tools
- cache_control, structured outputs
- thinking display
- Sampling: older models only
- Claude Code
- terminal, IDE, desktop, web
- /model and /effort
- Shift+Tab → plan mode
- CLAUDE.md, settings.json
- /compact, /clear for context
- Subagents, skills, hooks
- Local open models
- llama.cpp, Ollama, vLLM
- temperature, top_k, top_p
- Context length
- KV cache type (f16, q8_0)
- GPU layers, batch size
- All knobs, all yours

## 19. Anatomy of an API request: every setting in one place
- import anthropic
- client = anthropic.Anthropic()
- resp = client.messages.create(
- model="claude-opus-5-5",          # 1 which model
- max_tokens=16000,                 # 2 output cap
- output_config={"effort": "medium"},  # 3 depth
- thinking={"type": "adaptive",
- "display": "summarized"},  # 4 see reasoning
- system=[{"type": "text", "text": RULES,
- "cache_control": {"type": "ephemeral"}}],  # 5
- tools=[search_tool],              # 6 what it can do
- messages=[{"role": "user", "content": question}],
- print(resp.usage)   # 7 tokens, cache hits, cost
- Model  Opus for hard work, Sonnet for balance, Haiku for speed
- max_tokens  Covers thinking + answer
- Effort  The quality / speed / cost dial
- Thinking  Adaptive; 'summarized' shows a readable summary
- Cached system prompt  Stable rules first, cached
- Tools  Functions, web search, code execution, MCP
- usage  Always check it

## 20. Running models yourself? Here the classic knobs are real
- KV bytes ≈ 2 × layers × KV heads × head dim × context × bytes per value  (Llama-3-8B: 128 KB per token at FP16)
- # llama.cpp
- llama-server -m model.gguf \
- --temp 0.7 --top-k 40 --top-p 0.9 \
- -c 32768 -fa on \
- --cache-type-k q8_0 --cache-type-v q8_0
- # Ollama (Modelfile)
- PARAMETER temperature 0.7
- PARAMETER top_k 40
- PARAMETER num_ctx 32768
- # env: OLLAMA_FLASH_ATTENTION=1
- #      OLLAMA_KV_CACHE_TYPE=q8_0
- Longer context costs memory linearly. Quantizing the KV cache to 8-bit roughly halves it with little quality loss.

## 21. PART 4
- Agents & multi-agent
- Give Claude tools and a loop, and it stops answering and starts doing. Then give it teammates.
- think
- act
- observe
- repeat
- lead
- team

## 22. An agent is Claude in a loop with tools
- Think
- Plan the next step
- Act
- Call a tool
- Observe
- Read the result
- …until the goal is met
- Tools
- Functions Claude can call: search, run code, edit files, send email
- MCP connectors
- A standard way to plug in apps: Drive, Slack, GitHub, databases
- Skills
- Folders of instructions and scripts Claude loads only when relevant
- Memory
- CLAUDE.md, project files, notes it writes for its future self

## 23. Five workflow patterns: start with the simplest
- Prompt chaining
- Fixed steps, each feeds the next
- Outline → draft → translate
- Routing
- Classify, then send to a specialist
- Support: billing vs tech vs refund
- Parallelization
- Same or split task run at once, then combine
- 3 reviewers vote on a risky change
- Orchestrator–workers
- A lead decides subtasks on the fly
- Research report, big code change
- Evaluator–optimizer
- One writes, one critiques, loop
- Translation, polishing a proposal

## 24. Multi-agent: a lead agent and parallel subagents
- Lead agent: plans, delegates, combines
- Subagent A
- Subagent B
- Subagent C
- Each has its own context window and returns only a short summary
- Good fit
- Wide research, many independent parts, too much for one context
- Poor fit
- Tightly linked steps, most coding, low-value tasks
- +90%
- better than a single agent on Anthropic’s internal research eval
- 15×
- the tokens of a normal chat (single agents use about 4×)
- −90%
- up to 90% less time on complex research, by searching in parallel

## 25. Subagents in Claude Code: a markdown file is all it takes
- # .claude/agents/code-reviewer.md
- ---
- name: code-reviewer
- description: Reviews code changes for bugs,
- security and readability. Use after edits.
- tools: Read, Glob, Grep
- model: sonnet
- effort: high
- ---
- You are a senior code reviewer. Look at the
- changed files only. Report concrete problems
- with file:line and a suggested fix. Rank by
- severity. Do not edit files.
- Built in
- Explore (read-only search), Plan (research for plan mode), general-purpose
- Where
- .claude/agents/ for the project (share via git), ~/.claude/agents/ for all your projects
- How to call
- Claude picks one from its description, or ask: “Use the code-reviewer subagent on my changes”
- Why
- Own context window, limited tools, cheaper model, reusable. They still count toward usage

## 26. How to brief a subagent (or any delegated agent)
- Objective
- One clear goal and why it matters
- Output format
- Exactly what to return, and how short
- Tools & sources
- What to use, what to avoid
- Boundaries
- What is out of scope; what others cover
- Effort budget
- Simple: 3–10 tool calls. Complex: more
- WEAK
- “Research the semiconductor shortage.”
- STRONG
- “Find how the 2021–23 chip shortage affected EU car makers’ output. Use industry reports and company filings, not news opinion. Another agent covers US and Asia, so skip those. Return 5 bullets with a figure and source URL each, max 150 words.”

## 27. PART 5
- Workflows & plans
- Plan before acting, write things down, and turn what works into something repeatable.
- explore
- plan
- build
- check
- repeat

## 28. Explore → Plan → Build → Check: the core loop for real work
- 1  Explore
- Have Claude read the relevant files or sources first. No changes yet.
- 2  Plan
- Plan mode (Shift+Tab): Claude researches read-only and proposes steps. You edit and approve.
- 3  Build
- Carry out the plan step by step. Small, reversible changes.
- 4  Check
- Run tests, open the file, compare to the plan. Then commit.
- Why planning pays off
- Fixing a wrong plan costs one message. Fixing wrong code or a wrong 20-page report costs an afternoon. For anything bigger than a quick edit, ask for the plan first: “Don’t write code yet. Propose a plan, list the files you’ll change and the risks.”

## 29. Turn what works into building blocks you can reuse
- CLAUDE.md
- Project memory: commands, style, gotchas. Loaded every session.
- Skills
- SKILL.md + scripts for a task you repeat (reports, decks, reviews). Loaded on demand.
- Subagents
- Specialists with their own prompt, tools and model.
- Hooks
- Shell commands that always run on events, like format after edit or block rm -rf. Rules, not suggestions.
- MCP
- Connect GitHub, Slack, Drive, databases once; every session can use them.
- Headless & scheduled
- claude -p in scripts and CI, the Agent SDK in your app, scheduled tasks for routines.

## 30. Long-running work: keep state in files
- plan.md
- The agreed plan and current step
- progress.txt
- What’s done, what’s next, open questions
- tests.json
- What “done” means, checked by running it
- git commits
- Checkpoints you can roll back to
- A fresh session can read these and carry on, even after the context window has been cleared or compacted.
- Let Claude do freely
- Read files, search, run tests
- Edit local files under git
- Draft documents and messages
- Ask before
- Deleting, force-pushing, rm -rf
- Sending, posting, paying, emailing
- Anything that touches shared systems

## 31. Worked example: a weekly competitor brief that runs itself
- Skill
- competitor-brief/SKILL.md: sources, format, tone
- Plan
- Lead agent picks 5 competitors to cover this week
- Parallel subagents
- One per competitor: news, pricing, releases
- Evaluator
- Checks every claim has a source; sends gaps back
- Deliver
- Doc saved, summary posted to Slack via MCP
- Patterns used
- skill
- orchestrator–workers
- parallelization
- evaluator–optimizer
- MCP
- scheduled task
- Start manual: run it once in chat, fix the prompt, then save it as a skill, then add subagents, then schedule it for Monday 8:00. Each step only after the previous one works.

## 32. Cheat sheet
- Prompt
- Brief it like a new colleague
- Say why, show examples, use XML tags
- Long docs first, question last
- Settings
- No temperature / top-k / top-p on newest models
- Effort is the dial; max_tokens covers thinking
- Cache stable prefixes, put changes last
- Agents
- Simplest workflow that works
- Multi-agent only for wide, parallel, valuable work
- Brief subagents fully
- Workflow
- Explore → plan → build → check
- State in files, checkpoints in git
- Repeat 3× → make it a skill, hook or subagent

## 33. Keep learning
- Settings change fast. These pages are the source of truth (as of Oct 2026).
- Prompting best practices: platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Opus 5.5 migration guide (sampling, effort, thinking): platform.claude.com/docs/en/models/opus-5-5/migration-guide
- Context windows: platform.claude.com/docs/en/build-with-claude/context-windows
- Prompt caching: platform.claude.com/docs/en/build-with-claude/prompt-caching
- Claude Code subagents: code.claude.com/docs/en/sub-agents
- Multi-agent research system: anthropic.com/engineering/multi-agent-research-system
- Building effective agents: anthropic.com/engineering/building-effective-agents
