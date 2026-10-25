# From Tokens to Teams of Agents

Text extracted from `LLM_to_MultiAgent.pptx` (39 slides) so it is searchable and diffable on GitHub.

## 1. From Tokens to Teams of Agents
- A visual guide to LLMs, AI agents and multi-agent systems
- From
- ␣tokens
- ␣to
- ␣teams
- ␣of
- ␣agents
- Each chip is one token. By the end of this deck you'll know why that matters.

## 2. The journey in four parts
- PART 1
- How LLMs work
- Tokens, embeddings, transformers, attention, training, sampling, context, quantization, RAG
- PART 2
- AI agents
- The agent loop, tool calling, MCP, memory, workflow patterns
- PART 3
- Multi-agent systems
- Why split the work, architectures, a worked example, pitfalls
- BONUS
- Using Claude well
- Prompting tips, how the concepts map to Claude features, glossary, next steps

## 3. PART 1
- How LLMs work
- From raw text to a model that can predict the next word — and why that simple trick is so powerful.
- The
- cat
- sat
- the
- mat

## 4. An LLM is a next-token predictor
- “The cat sat on the …”
- LLM
- Autoregressive generation
- Pick a token (e.g. “mat”) → append it to the text → predict again. Every answer, essay or line of code is produced one token at a time. Trained on trillions of tokens, this “autocomplete” learns grammar, facts, reasoning patterns and style.

## 5. Tokens: the units an LLM reads and writes
- Text is split into sub-word pieces, and each piece maps to an ID in the model's vocabulary
- “Tokenization isn't magic!”
- Token
- ization
- ␣isn
- ␣magic
- 6 tokens · IDs are illustrative · ␣ = a space
- Common words are one token; rare words split into pieces
- Non-English text (e.g. Vietnamese) often needs more tokens per word
- Models “see” tokens, not letters — why counting letters can be hard
- ≈ 4
- characters per token in English
- ≈ 750
- words ≈ 1,000 tokens
- $ / ⏱
- price, speed and context limits are all counted in tokens

## 6. Embeddings: meaning as coordinates
- A 2-D sketch of embedding space (real models use thousands of dimensions)
- man
- woman
- king
- queen
- apple
- banana
- mango
- car
- truck
- bus
- same “gender” direction
- fruit
- vehicles
- Each token ID becomes a long list of numbers (a vector)
- Similar meanings land close together
- Directions carry relationships: king − man + woman ≈ queen
- Embeddings are learned during training, not hand-written
- Also used for semantic search: find documents whose vectors are close to your question (→ RAG)

## 7. The transformer: the engine inside every LLM
- Input tokens
- Token
- ization
- ␣is
- ␣un
- believ
- able
- Token embeddings + position
- Self-attention
- Feed-forward network
- × N layers
- Probabilities for the next token
- e.g. 32–120+ layers in large models
- Self-attention
- Every token looks at every other token and decides which ones matter for its meaning. This is how context flows.
- Feed-forward
- Each token's vector is transformed independently — where much of the model's stored knowledge lives.
- Stacking layers
- Early layers capture syntax; deeper layers capture meaning, facts and reasoning patterns.
- Parallel training
- Unlike older RNNs, all positions are processed at once on GPUs — the key to scaling. (“Attention Is All You Need”, 2017)

## 8. Layers run in sequence, tokens run in parallel
- Layer 1
- Syntax: word pieces, grammar
- Layer 2
- Phrases: which words go together
- Layer 3
- Meaning: who did what to whom
- Layer N
- Facts and reasoning patterns
- ⋮  32–120+ layers in large models
- Input: “Tokenization is unbelievable” → 6 tokens enter Layer 1 together
- Why transformers train fast
- Older RNN: one token after another
- 6 tokens = 6 steps in a row
- step 1 → 2 → 3 → 4 → 5 → 6
- Transformer: every token at once
- 6 tokens = 1 step per layer
- GPU: one matrix multiply
- Token
- ization
- ␣is
- ␣un
- believ
- able
- step 1 for all positions
- Depth is sequential: Layer 2 waits for Layer 1.
- Width is parallel: all tokens in a layer run together, so training scales with GPUs.

## 9. Self-attention: which words matter for “it”?
- The
- animal
- didn't
- cross
- the
- street
- because
- was
- tired
- Query
- What am I looking for?
- Key
- What do I contain?
- Value
- What do I pass along if chosen?
- Score = how well a Query matches each Key → softmax → weighted mix of Values

## 10. Training: learning to predict the next token
- Training text
- “The cat sat on the mat”
- Tokenize
- Text → token IDs
- Transformer
- N layers, all tokens in parallel
- Predicted odds
- “mat” 40%, “floor” 25%…
- Loss
- Real next token was “mat”: how wrong?
- Backpropagation: adjust every weight so “mat” scores higher next time
- Every token is a lesson
- Each position predicts the token after it, so one sentence gives many examples at once.
- Repeated trillions of times
- Pre-training runs for weeks on thousands of GPUs; fine-tuning repeats the loop on a small dataset.
- The result is fixed weights
- The trained model is a file of numbers: 8B parameters is about 16 GB at 16-bit.

## 11. How a model is trained: three stages
- 1  Pre-training
- Predict the next token on trillions of tokens of web text, books and code.
- Result: a base model that knows language and facts — but just continues text.
- 2  Fine-tuning
- Train on curated examples of instructions and good answers (SFT).
- Result: a model that follows instructions and holds a conversation.
- 3  Alignment
- Reinforcement learning from human or AI feedback (RLHF / RLAIF, Constitutional AI).
- Result: an assistant that is more helpful, honest and harmless.
- Cost reality: pre-training uses by far the most compute (thousands of GPUs for months); later stages are smaller but shape behavior the most.

## 12. LoRA fine-tuning trains under 1% of the weights
- How LoRA works on one weight layer
- frozen
- Trainable B, A
- rank 8: 65K weights, 0.4% of W
- 4,096 × 4,096 = 16.8M weights
- Output = W·x + B·A·x. After training, merge B·A into W, or keep it as a small add-on file to swap per task.
- Approximate; memory depends on sequence length and batch size. Popular tools: Unsloth, Hugging Face PEFT, Axolotl.
- LoRA = Low-Rank Adaptation: freeze the model and train two small matrices that add a correction to each layer.
- QLoRA = Quantized LoRA: the same idea, with the frozen model stored as 4-bit numbers to use about 4× less memory.

## 13. Inference: writing one token at a time
- Your prompt
- “The cat sat on the”
- Tokenize
- Text → token IDs
- Transformer
- Same layers, weights frozen
- Next-token odds
- “mat” 40%, “floor” 25%…
- Sampling
- Temperature and top-p pick one: “mat”
- Append “mat” to the input and run again, one token per pass
- Nothing is learned
- Weights stay frozen and are only read. Chat memory is just the earlier text in the prompt.
- One pass per token
- Each new token needs a full pass; a KV cache reuses the work already done on earlier tokens.
- Stops at an end token
- Generation ends when the model samples an end-of-text token or hits the length limit.

## 14. Sampling: temperature controls creativity
- Low (0–0.3)
- Picks the most likely token almost every time. Best for facts, code, extraction.
- Medium (~0.7–1)
- Some variety. Good default for writing and conversation.
- High (>1)
- Flattens the distribution; more surprising — and more errors.
- Top-p / top-k
- Only sample from the most likely tokens, cutting off the long tail.

## 15. The context window is the model's working memory
- Everything the model can “see” on a single call — measured in tokens
- System prompt
- Chat history
- Documents / files
- Tool results
- Your message
- Output
- Stateless
- The model remembers nothing between calls. Apps re-send the conversation every time.
- Finite
- Frontier models hold hundreds of thousands of tokens — but not unlimited. Old turns get trimmed or summarized.
- Curate it
- More tokens = more cost and latency, and key facts can get lost in the noise. Give relevant context, not everything.

## 16. Quantization: smaller numbers, smaller models
- Memory ≈ parameters × bits ÷ 8   (70B × 4 ÷ 8 = 35 GB)
- Same idea as rounding
- 3.14159265
- 32-bit
- 3.1416
- 16-bit
- 3.14
- 8-bit
- 4-bit
- Pros: 4–8× less memory, faster and cheaper; big models fit on a laptop GPU
- Cons: small quality loss, larger at very low bits (≤3-bit)
- Where you'll see it: local open-weight models (GGUF, llama.cpp, Ollama)

## 17. Local models: biggest that fits, Q4 or better
- Memory for model weights, GB (add 2–4 GB for context)
- Avoid
- Floor
- Best balance
- If room
- Q3_K_M
- Q4_K_M
- Q5_K_M
- Q6_K
- Q8_0
- 7–8B
- ~3.9
- ~4.9
- ~5.7
- ~6.6
- 8 GB GPU
- ~8.5
- 14B
- ~6.8
- ~8.4
- ~10
- 16 GB GPU
- ~12
- ~15
- 32B
- ~16
- ~19
- 24 GB GPU
- ~23
- ~26
- ~34
- Best pick for that GPU, leaving room for context
- Set a floor by task
- Chat: Q4_K_M is fine. Coding and file agents: Q5_K_M or higher; never below Q4.
- Take the biggest model that fits
- A 14B model at Q4 usually codes better than a 7B model at Q8.
- Leave 2–4 GB for context
- Agents read many files; budget for 16–32K tokens on top of the weights.
- Approximate GGUF sizes for weights only; exact size varies by model and file.

## 18. What LLMs get wrong — and why
- Hallucination
- The model produces the most plausible text, not verified truth — so it can state fiction confidently.
- Fix → Ask for sources; ground it in documents (RAG)
- Knowledge cutoff
- It only knows what was in its training data up to a certain date.
- Fix → Give it web search or current documents
- Tokens ≠ letters
- Exact counting, spelling tricks and long arithmetic are awkward at the token level.
- Fix → Let it use a code tool to compute
- Sensitivity to prompts
- Vague or ambiguous instructions produce vague or inconsistent results.
- Fix → Be specific, give examples and context

## 19. RAG: give the model the right pages before it answers
- 1 Question
- “What's our refund policy?”
- 2 Retrieve
- Embed the question; find the closest document chunks
- 3 Augment
- Paste top chunks + question into the prompt
- 4 Generate
- LLM answers from the sources, with citations
- Vector store of your documents
- Why it works: the model doesn't need to memorize your data — it reads it at question time. Cheaper than retraining, always up to date, and answers can cite their sources.

## 20. RAG keeps your documents outside the LLM
- Retrieval system: your code + a database
- LLM: weights never change
- Your documents
- split into chunks
- Question
- “Refund policy?”
- Embedding model
- same model for both
- Vector store
- vectors + text
- Ahead of time
- At question time
- Top 3 chunks, as text
- Prompt (text only)
- Sources: “Refunds within 30 days…” “How to return an item…”  Question: Refund policy?
- LLM
- attention reads the sources, plus its own knowledge
- Answer
- citing the sources it was given
- Weak match? Use a cut-off
- If the best score is low, pass no chunks and say the documents don’t cover it.
- Agentic RAG: the LLM decides
- The LLM gets a search tool and calls search_docs(“refund policy”) only when it needs to.

## 21. Retrieve: find the chunks closest in meaning
- Embedding space, simplified to 2D
- Refunds within 30 days  0.91
- How to return an item  0.87
- Store credit rules  0.82
- Careers
- Shipping
- Pricing
- Your question
- Top-3 chunks
- Other chunks
- 0.91 = cosine similarity
- Ahead of time: index your documents
- Split documents into chunks of ~200–500 words
- Embed each chunk into a vector of numbers
- Store vectors with their text and source
- At question time: search
- Embed the question with the same model
- Score every chunk by cosine similarity
- Keep the top 3–5 and paste them into the prompt
- Better retrieval: hybrid search adds keyword matching (BM25) for names and product codes, and a reranker re-scores the top ~20 hits and keeps 5.

## 22. PART 2
- AI agents
- When an LLM can take actions, see the results and keep going until the job is done.
- Think
- Act
- Observe
- Repeat

## 23. Agent = LLM + tools + memory + a loop
- LLM
- The reasoning engine
- Tools
- Search, code, APIs, files
- Memory
- Context, notes, knowledge
- Loop
- Repeat until the goal is met
- Chatbot
- One prompt in, one answer out
- You do the steps; it gives advice
- Knows only what's in the chat
- Agent
- Given a goal, not just a question
- Plans, calls tools, checks results, retries
- Works for many steps, often unattended

## 24. The agent loop: think → act → observe
- Think
- plan next step
- Act
- call a tool
- Observe
- read the result
- Goal
- Done → answer
- “Am I finished?” is decided in the Think step
- Example trace: “Which of my files mention budget, and what's the total?”
- Think
- I should search the folder first
- Act
- search_files(“budget”)
- Observe
- 3 files found
- Think
- Open each and extract the amounts
- Act
- read_file × 3
- Observe
- $1,200 · $850 · $2,400
- Think
- Sum them → $4,450. Done.

## 25. The Act step: the model asks, your app does
- User
- App / harness
- LLM
- Tool (e.g. weather API)
- “Weather in Hanoi?”
- prompt + tool list
- tool_call: get_weather(“Hanoi”)
- call the API
- {temp: 27°C, rain}
- tool result
- “27°C and rainy”
- show answer
- Key idea
- This zooms in on one turn of the slide 24 loop. The model never runs anything itself: it writes a structured request (name + JSON arguments); your code executes it and pastes the result back.
- MCP
- Model Context Protocol: an open standard “USB-C port” for plugging tools and data (Drive, Slack, GitHub…) into any AI app.
- Think
- Act
- Observe
- Think

## 26. Three kinds of agent memory
- Short-term
- WORKING MEMORY
- The current context window: the conversation, tool results, scratch notes.
- Lost when the session ends
- Long-term
- FACTS & HISTORY
- Files, databases, vector stores, saved memories — retrieved when relevant.
- Persists across sessions
- Procedural
- KNOW-HOW
- System prompts, instructions and skills: how to do a kind of task well.
- Loaded when the task calls for it

## 27. Where agent memory lives on your PC
- Short-term
- WORKING MEMORY
- Long-term
- FACTS & HISTORY
- Procedural
- KNOW-HOW
- VRAM
- GPU · fastest · 8–24 GB
- KV cache of the current conversation
- Only the retrieved chunks, as prompt tokens
- System prompt + skill, as prompt tokens
- RAM
- System · 16–64 GB
- Conversation text and tool results
- Vector index, cached for fast search
- Skill text, once loaded
- SSD
- Disk · 3–7 GB/s
- Saved sessions, if you keep them
- Main home: files, databases, vector store
- Main home: skill and prompt files
- HDD
- Disk · ~150 MB/s
- Archive only: old logs, backups
- Rule: anything the model uses right now must be tokens in VRAM, next to the model weights. When the session ends, VRAM and RAM clear; only what was saved to SSD carries over.

## 28. Five building-block patterns
- Prompt chaining
- Fixed steps; each output feeds the next
- e.g. Outline → draft → translate
- Routing
- Classify input, send to a specialist
- e.g. Support ticket → billing / tech
- Parallelization
- Run sub-tasks at once, then combine
- e.g. Review code for 3 issues at once
- Orchestrator–workers
- workers
- A lead LLM splits work on the fly
- e.g. Edit many files in a codebase
- Evaluator–optimizer
- draft
- critic
- One drafts, one critiques, repeat
- e.g. Polish a translation

## 29. Start simple: climb the ladder only when it pays
- Single prompt
- + retrieval & tools
- Workflow (fixed steps)
- Autonomous agent
- Multi-agent system
- more capability, but also more cost, latency and ways to fail  →
- Rules of thumb
- Try the simplest version first and measure it
- Use a workflow when steps are known in advance
- Use an agent when the path can't be predicted
- Give tools clear names, descriptions and examples
- Add a human checkpoint before irreversible actions

## 30. PART 3
- Multi-agent systems
- Splitting a big job across several agents — each with its own role, tools and context window.
- Lead
- Agent A
- Agent B
- Agent C
- Review

## 31. Why use several agents instead of one?
- Specialization
- Each agent gets a focused role, prompt and toolset (researcher, coder, reviewer).
- Parallelism
- Independent sub-tasks run at the same time, so broad tasks finish faster.
- Context isolation
- Each sub-agent has a fresh context window; only its summary goes back to the lead.
- The trade-off: Anthropic's multi-agent research system beat a single agent by 90% on its internal research eval — while using ~15× the tokens of chat. Worth it only for high-value, parallelizable tasks.

## 32. Three common ways to organize agents
- Orchestrator – workers
- A lead agent plans, delegates to sub-agents and merges results.
- Best for: research, large coding tasks
- Pipeline (hand-offs)
- Agents work in sequence, each passing its output to the next.
- Best for: content production, data processing
- Peer network / debate
- Agents talk to each other, critique and converge on an answer.
- Best for: brainstorming, verification
- Lead
- Draft
- Edit
- Check

## 33. Worked example: a multi-agent research system
- User: “Compare the top 3 open-source vector databases”
- Lead agent: plan & split into sub-questions
- Sub-agent 1: features & performance
- searches web · reads pages · writes summary
- Sub-agent 2: pricing & licensing
- searches web · reads pages · writes summary
- Sub-agent 3: community & docs
- searches web · reads pages · writes summary
- Lead agent: synthesize findings
- Citation check
- Report
- run in parallel
- Lessons Anthropic reported: teach the lead to delegate clearly, scale effort to the query, and let sub-agents start broad then narrow down.

## 34. What goes wrong — and how to prevent it
- Failure mode
- What you'll see
- Fix
- Vague delegation
- Sub-agents duplicate work or wander off
- Brief each one: goal, scope, tools, output format
- Telephone game
- Details lost passing summaries around
- Share files/artifacts, not just chat messages
- Error cascades
- One bad result poisons the final answer
- Add a verifier or evaluator step
- Runaway cost
- Too many agents, too many tool calls
- Budget effort to the task; cap steps
- Irreversible actions
- An agent sends, deletes or buys by mistake
- Human approval before anything permanent

## 35. BONUS
- Using Claude well
- Turning the concepts into everyday habits — and where each idea shows up in Claude.
- specific
- Give
- context
- Iterate

## 36. Six prompting habits that make the biggest difference
- Be clear and specific
- Say the goal, audience, length and format you want.
- Explain the why
- Context about purpose helps Claude make good judgment calls.
- Show examples
- One or two good (and bad) examples beat paragraphs of rules.
- Structure long prompts
- Separate instructions, data and examples, e.g. with <document> tags.
- Ask it to think first
- For hard problems, ask for reasoning or a plan before the answer.
- Iterate
- Treat the first answer as a draft: give feedback, refine, repeat.

## 37. Where each concept shows up when you use Claude
- Concept
- In Claude
- Try this
- Context window
- Projects & file uploads
- Put reference docs and instructions where every chat can see them
- RAG / grounding
- Web search, Project knowledge
- Ask Claude to cite sources so you can check its work
- Tools & MCP
- Connectors (Drive, Gmail, GitHub…)
- Let Claude read and act in the apps you already use
- Procedural memory
- Skills & Project instructions
- Save a repeatable way of working once, reuse it every time
- Agent loop
- Longer tasks, Claude Code
- Hand over a goal; review the result instead of every step
- Multi-agent
- Research, sub-agents in Claude Code / Agent SDK
- Use for broad, parallel tasks — they cost more tokens

## 38. Cheat sheet: key terms
- Token
- A chunk of text (~¾ of a word) the model reads and writes
- Embedding
- A vector of numbers that represents meaning
- Transformer
- Neural-network architecture built on attention
- Attention
- Mechanism that lets tokens weigh each other's relevance
- Parameters
- The learned numbers (weights) inside a model
- Context window
- Maximum tokens the model can consider at once
- Temperature
- Setting that controls randomness of output
- Quantization
- Storing weights in fewer bits to save memory
- Hallucination
- Confident output that isn't true
- RAG
- Retrieving documents and adding them to the prompt
- Tool call
- Structured request from the model for your app to run
- MCP
- Open standard for connecting tools and data to AI apps
- Agent
- LLM in a loop that uses tools to reach a goal
- Orchestrator
- Lead agent that plans and delegates to sub-agents

## 39. WRAP-UP
- Key takeaways
- An LLM predicts the next token — everything else is built on that
- The context window is its only working memory: curate what goes in
- An agent = LLM + tools + memory + a loop
- Multi-agent systems buy speed and breadth with many more tokens
- Start simple; add complexity only when it clearly helps
- Your learning path
- WEEK 1
- Practice the six prompting habits on real tasks
- WEEK 2
- Set up a Project with your docs and instructions
- WEEK 3
- Connect one app and save one Skill
- WEEK 4
- Read “Building effective agents”; try a small agent with the Claude API
