# Using Claude Well

Text extracted from `Using Claude Well.pptx` (42 slides) so it is searchable and diffable on GitHub.

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

## 23. MCP gives Claude one standard plug for every app
- MCP stands for Model Context Protocol, an open standard Anthropic published in 2024
- Model is the AI, here Claude; context is the data and actions it can reach
- Protocol means shared rules, so any app that follows them works with any MCP client
- Claude
- MCP client
- Claude, Claude Code or an IDE. Shows the server's actions to Claude as tools.
- MCP server
- The connector
- Sits in front of one app. Lists its actions and runs them when Claude asks.
- Your app
- Drive, Slack, GitHub
- Does the work with your sign-in and permissions, then returns the result.
- MCP
- App API
- What a server can offer Claude
- Tools
- Actions to run: search files, post a message, open a ticket
- Resources
- Data to read: a document, a table, a customer record
- Prompts
- Ready-made templates for the app's common tasks
- A connector is a ready-made MCP server you switch on in Claude by signing in. Each app builds it once, and it works in any MCP client.

## 24. Five workflow patterns: start with the simplest
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

## 25. Multi-agent: a lead agent and parallel subagents
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

## 26. Subagents in Claude Code: a markdown file is all it takes
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

## 27. How to brief a subagent (or any delegated agent)
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

## 28. PART 5
- Workflows & plans
- Plan before acting, write things down, and turn what works into something repeatable.
- explore
- plan
- build
- check
- repeat

## 29. Explore → Plan → Build → Check: the core loop for real work
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

## 30. Explore: Claude reads first and changes nothing yet
- # Explore: read first, no edits yet
- Read src/billing/ and the failing test in
- tests/test_invoice.py. Don't change any
- files yet. Then tell me:
- 1. How an invoice total is calculated today
- 2. Which files a fix would touch
- 3. Anything that looks risky or unclear
- # For broad searches, keep the main
- # context clean:
- Use the Explore subagent to find every
- place that calls calculate_total().
- # Close the step with:
- Summarize what you found in five bullets.
- Goal
- Claude learns the code, data or sources before it decides anything. No edits.
- How
- Point it at specific files, folders, docs or URLs. Ask for a summary back, not a solution.
- Good sign
- The summary names the right files and spots what you would have flagged yourself.
- Avoid
- Opening with “fix the bug”. Claude guesses, and the guess carries into every later step.
- Note: Explore is a prompt you type in the Claude chat, not a file. Lines starting with # are labels for this slide; leave them out when you paste.

## 31. Plan: agree the steps in writing before any change
- # Plan mode: press Shift+Tab until it
- # shows plan mode, then ask:
- Plan how to add tax-exempt customers
- to invoicing. Include:
- - Files to change and why
- - Steps in order, each small enough to test
- - How we'll know it works (tests to add)
- - Questions you need me to answer
- # Then reply to correct it:
- Drop step 4, we'll do that later. Use
- the existing Customer table, no new one.
- # When it's right:
- Save the plan to plan.md, then do step 1.
- Goal
- A short written plan you can read in a minute and correct in one message.
- How
- Plan mode keeps Claude read-only. Answer its questions, cut scope, then approve.
- Good sign
- Each step is small and testable, in an order that makes sense to you.
- Avoid
- Approving a plan you only skimmed. A vague plan produces vague work.
- Note: Plan is a prompt you type in the Claude chat, not a file. Lines starting with # are labels; leave them out. plan.md is where Claude saves the plan.

## 32. Build: one step at a time, with a checkpoint after each
- # Work one step at a time
- Do step 1 of plan.md only. Run the tests
- when you're done, then stop and show me
- the diff.
- # Step looks right:
- Commit with a clear message, update
- progress.txt, then do step 2.
- # Going the wrong way? Press Esc, then:
- Stop. Keep the old function name;
- other services call it. Redo step 2.
- # Long task, fresh session:
- Read plan.md and progress.txt and
- continue from the next open step.
- Goal
- Turn the plan into working changes while you keep control of the direction.
- How
- Small steps, a commit after each, and progress.txt updated so a new session can resume.
- Good sign
- Each diff is small enough to read, and tests pass before the next step starts.
- Avoid
- “Do the whole plan” on large work. When it goes wrong, you can't see where.
- Note: Build is a series of prompts you type in the chat. Lines starting with # are labels; leave them out. plan.md and progress.txt are files in your project.

## 33. Check: prove the work is done before you accept it
- # Verify against the plan
- Run the full test suite and the linter.
- Then compare the result with plan.md and
- list anything missing or changed.
- # Second opinion, fresh context
- Use the code-reviewer subagent on this
- branch. Report bugs, security issues and
- untested paths. Don't fix anything yet.
- # Ask about gaps
- What did you not verify? List anything
- you assumed rather than checked.
- # Then ship
- Fix the review items, rerun the tests,
- and commit.
- Goal
- Evidence that it works: tests pass, the result matches the plan, nothing extra changed.
- How
- Run the tests, open the result yourself, and have a fresh subagent review it.
- Good sign
- Claude lists what it could not verify instead of just saying “done”.
- Avoid
- Trusting “all tests pass” without seeing the run, or letting Claude edit tests to pass.
- Note: Check is a prompt you type in the chat. Lines starting with # are labels; leave them out. code-reviewer is a subagent file in .claude/agents/ (slide 26).

## 34. One prompt for all four steps, two stops when it's risky
- # One prompt, two checkpoints
- Add tax-exempt customers to invoicing.
- 1. Explore src/billing/ and tests/.
- Don't edit anything.
- 2. Write the plan to plan.md.
- STOP and wait for my OK.
- 3. Build one step at a time. Run the
- tests after each, log progress.txt.
- 4. Run all tests and the linter, then
- use the code-reviewer subagent.
- 5. Report what passed and what you
- couldn't verify.
- STOP: don't commit until I confirm.
- One prompt is enough
- Small, clear task with good tests, on a branch. Delete both STOP lines.
- Keep the checkpoints
- Unclear requirements, no tests, or code that touches money, security or shared services.
- Why these two stops
- Reading the plan takes a minute and catches most wrong turns. Reading the diff catches the rest before it ships.
- Fully hands-off
- Tests and a subagent review are the gate. Claude works on a branch; a person approves the pull request.
- Note: type this once in the Claude chat. Claude pauses at each STOP until you reply; lines starting with # are labels.

## 35. Turn what works into building blocks you can reuse
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

## 36. Make a skill: one folder with a SKILL.md file
- # .claude/skills/weekly-brief/SKILL.md
- ---
- name: weekly-brief
- description: Builds the weekly competitor
- brief. Use when asked for the weekly
- brief or a competitor update.
- ---
- # Weekly competitor brief
- 1. Run scripts/fetch_news.py for each
- company in competitors.csv
- 2. Summarize launches, pricing, hiring
- 3. Fill template.docx, one page max
- 4. Flag anything you could not verify
- # Same folder: scripts/, template.docx,
- # competitors.csv
- 1  Create the folder
- .claude/skills/<name>/ in a project, or ~/.claude/skills/ for all projects. In the Claude apps, upload it as a zip.
- 2  Write SKILL.md
- A name and a description that says when to use it. Claude reads only these until a task matches.
- 3  Add scripts and files
- Templates, examples and scripts the steps call. Claude opens them only when needed.
- 4  Test and refine
- Ask for the task in plain words and check the skill triggers. The skill-creator skill can draft and test one.

## 37. Long-running work: keep state in files
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

## 38. Worked example: a weekly competitor brief that runs itself
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

## 39. Cheat sheet
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

## 40. Watch it in action: planning, skills and subagents
- Click a title to open the video in your browser. Community videos are third-party and may lag behind the newest features.
- Claude Code in an Hour: A Developer's Intro
- Why You Need Plan Mode in Claude Code
- Claude Agent Skills Explained
- Agent Skills with Anthropic (course)
- Advanced Patterns: Subagents, MCP and Scaling
- Claude Code Tutorial #8: Subagents

## 41. Example repos on GitHub: skills, subagents and MCP
- Click a repo to open it on GitHub. Community repos are third-party; read a file before you install it.
- anthropics/skills
- anthropics/claude-code
- anthropics/claude-cookbooks
- modelcontextprotocol/servers
- VoltAgent/awesome-claude-code-subagents
- hesreallyhim/awesome-claude-code

## 42. Keep learning
- Settings change fast. These pages are the source of truth (as of Oct 2026).
- Prompting best practices: platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Opus 5.5 migration guide (sampling, effort, thinking): platform.claude.com/docs/en/models/opus-5-5/migration-guide
- Context windows: platform.claude.com/docs/en/build-with-claude/context-windows
- Prompt caching: platform.claude.com/docs/en/build-with-claude/prompt-caching
- Claude Code subagents: code.claude.com/docs/en/sub-agents
- Multi-agent research system: anthropic.com/engineering/multi-agent-research-system
- Building effective agents: anthropic.com/engineering/building-effective-agents
