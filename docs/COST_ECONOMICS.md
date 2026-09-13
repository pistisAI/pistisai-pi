Now I have comprehensive data across all 8 areas. Let me compile the structured summary.

---

# Cost Modeling & Economic Optimization for AI Agent Systems — Research Summary

## 1. Token Usage Patterns: What Drives Cost

**The Agentic Multiplier:** Agents consume **4–100x more tokens** than single-turn chats (Anthropic data: ~4x for single agents, ~15x for multi-agent systems). A 5-step agent costs **10–50x** a single-turn query of the same model.

**Four Cost Multipliers:**

| Multiplier | Mechanism | Impact |
|---|---|---|
| **Context accumulation** | Every step re-sends prior messages, tool results, system prompt | Quadratic growth: cost ∝ steps² |
| **Tool-call overhead** | Structured tool definitions add 200–500 tokens per tool per call | 200–500 tokens × tools per round trip |
| **Retries & self-correction** | Failed tool calls trigger full-context re-reads | 2x cost if avg 2 attempts/task |
| **Reasoning token multiplier** | Reasoning models output 3–10x more tokens for same task | 3–10x output token inflation |

**Concrete example:** A 50-turn coding session consumes ~1M input tokens + 40K output tokens (25:1 input:output ratio) because the model re-reads its entire transcript on every step. By turn 30, the agent carries 25K–35K input tokens of accumulated context per request.

**Runaway cost:** A CrewAI agent without `max_iter` constraints generates 20–30 iterations, costing **$5–8 per run**. A 5-step loop runs **3.2x** the tokens of a single chat call, climbing past **30x at 50 steps** and **100x at 200 steps**.

**Sources:** spendark.com, llmpricing.site, tokonomics.ca, agentmarketcap.ai, zylos.ai, arxiv.org (Harness Effect), leanlm.ai, absolutedigitalpublishers.com, cloudzero.com, zop.dev

---

## 2. Cost Monitoring & Budgeting

**Key metrics to track:**
- **Cost per session** (median + P99 — the long tail is where runaway sessions live)
- **Cost per completed task** (total spend / tasks that hit goal)
- **Cost-per-Accepted-Outcome (CAPO)** — the metric finance cares about
- **Burn rate** (tokens/minute, $/minute, projected daily)
- **Waste per session** (cached tokens billed at full rate, retry loops, oversized prompts)

**Governance layers (from Agent FinOps):**
1. **Per-action limits:** Max retries, recursion depth, tool-call caps, token budgets per task
2. **Per-agent budgets:** Research agent gets $50/hr, drafting agent gets $20/hr — pause when exhausted
3. **Fleet-level throttling:** At 80% budget → throttle non-critical agents; at 95% → pause everything except approved workflows

**Hard circuit breakers:** Soft warnings at ~80% of budget, hard stops at 100%. A LangChain agent loop generated **$47,000 over 11 days** before detection — Slack alerts fired at 50%, 80%, 95% but none stopped the agents.

**Tooling:** Helicone (proxy + cost tracking), Portkey (AI gateway + budgets), LangFuse (open-source observability), Braintrust (eval + cost), custom OpenTelemetry dashboards.

**Visibility drives optimization:** When engineers see their personal daily spend (e.g., "that refactoring cost $8.50"), they start questioning model choice.

**Sources:** agents.siddhantkhare.com, cordum.io, codenotary.com, bigeye.com, dikrana.dev, varunsingla.com, agoradigest.com, alatirok.com, onepane.ai

---

## 3. Model Routing: Cheap vs Expensive

**The principle:** Use the cheapest model that can succeed. Routing reduces spend by **40–85%** while maintaining 90–95% of frontier quality.

**Tiered pricing (2026):**

| Tier | Models | Input $/M tokens | Use Case |
|---|---|---|---|
| Nano/Flash | GPT-4o Mini, Gemini Flash-Lite, Claude Haiku | $0.15–0.80 | Simple Q&A, extraction, formatting |
| Mid-tier | GPT-4o, Gemini Flash, Claude Sonnet | $2.50–3.00 | General competency, function calling |
| Frontier | GPT-5, Claude Opus, Gemini Ultra | $15.00 | Complex reasoning, long context |
| Reasoning | o3, DeepSeek R1, extended thinking | $60.00 | Math, code, multi-step logic |

**Routing strategies:**

- **Cascade routing:** Try cheap model first → escalate only on low confidence. FrugalGPT demonstrated **up to 98% cost reduction** with this pattern.
- **Start cheap, escalate on validation failure:** Works when validation is cheap (test suites, linters, type checkers).
- **Step-level routing:** A single agent turn may need cheap (intent classification) → medium (tool selection) → expensive (multi-hop reasoning) → medium (synthesis). Route each step independently.
- **Budget-Aware Agentic Routing (BAAR):** Selects between cheap and expensive model at each step to optimize the cost-success frontier under strict per-task budgets.

**Real-world example:** A three-tier routing system (Opus for architecture, Sonnet for implementation, Haiku for quick edits) costs **$0.98/session vs $2.02 for uniform Opus** — a **51% reduction** with no measurable quality regression.

**Scouting handoff:** A smaller repository-scouting model routes repository-level tasks and reaches the best single-model solve rate on SWE-bench Pro while using **~1/5 the total cost per solve**.

**Sources:** arxiv.org (BAAR, R2V-Agent, EvoRoute), agentpatterns.ai, createsomething.io, buildfastwithai.com, runguard.dev, zylos.ai, haimaker.ai, moltbook-ai.com

---

## 4. Caching Strategies

**Three caching layers for agents:**

| Layer | What it saves | Who provides | Discount |
|---|---|---|---|
| **Prompt caching** | Input-token price on repeated prefixes | Model provider | Up to **90%** on cached input |
| **Semantic response cache** | Whole generation on repeated questions | You (application-level) | **100%** on cache hit |
| **Tool-result cache** | External API call (latency + third-party cost) | You (application-level) | **100%** on cache hit |

**Provider pricing:**

- **Anthropic Claude:** Cache write = 1.25× base input price (5-min TTL) or 2× (1-hour TTL). Cache read = **0.10× base price** (90% discount). Break-even: only **1.4 cache hits** per cached prefix. For Sonnet: $3.75/M write, **$0.30/M read** (vs $3.00/M standard).
- **OpenAI (GPT-4.1+):** Cache reads up to **90% off** standard input. Automatic, no code changes required.
- **Google Gemini:** Guaranteed discounts but charges **$1/M tokens/hour** storage fee.

**Optimal cache architecture for agents:**
1. System prompt + tool schemas → largest, most stable prefix (mark for 1-hour TTL)
2. Conversation history → partially stable (cache up to last stable turn)
3. Retrieved context (RAG) → cache repeated document chunks
4. Dynamic inputs → never cached (final tokens that differ per request)

**Target: 70%+ cache hit rate** for stable-prompt workloads. ProjectDiscovery raised cache hit rate from 7% to 84%, cutting total LLM spend by **59–70%**. One developer went from **$720/month to $72/month** (90% reduction).

**Prompt caching reduces API costs by 45–80%** and improves time-to-first-token by 13–31% across providers (arxiv.org evaluation on DeepResearchBench).

**Key constraints:** Minimum 1,024 tokens to be eligible. Cached content must be a **contiguous block at the start** of the prompt, identical across requests. Up to 4 cache checkpoints per request (Anthropic).

**Sources:** neuraltrust.ai, dev.to/aws, aiagentsblog.com, draup.com, github.com/pleasedodisturb, tianpan.co, zylos.ai, arxiv.org (prompt caching evaluation), digitalapplied.com, docs.bswen.com

---

## 5. Economics of Monitoring

**The monitoring cost question:** How much should the monitoring system cost relative to the agent it monitors?

**Key insight:** Monitoring/observability infrastructure is an **ROI accelerator**, not just a cost line item — it catches failures early and reduces wasted compute.

**Production AI agent operational cost: ~$13,000/month** (RaftLabs data from 100+ deployments):
- Inference: $8,000/month (62%)
- Infrastructure (hosting, vector DB, monitoring): $2,000/month (15%)
- Maintenance & updates: $3,000/month (23%)

**The $47,000 lesson:** A four-agent LangChain loop ran for 11 days. Monitoring (Helicone dashboards + Slack alerts) showed the curve but **did not stop it**. Monitoring without enforcement is just expensive visibility.

**Rule of thumb:** Monitoring should cost **<5–10% of agent inference spend** but must include hard enforcement (circuit breakers, not just alerts). The cost of NOT monitoring — runaway loops, retry cascades, context bloat — dwarfs the monitoring investment.

**Cost-per-task attribution is essential:** Without per-task cost IDs that persist through retries and caching, you cannot attribute spend to specific agents/users/workflows. This is the prerequisite for all optimization.

**Sources:** fiddler.ai, raftlabs.com, cordum.io, dikrana.dev, varunsingla.com

---

## 6. ROI Measurement

**The formula that matters:**
```
Cost per Accepted Task = Recurring Run Cost / Accepted Tasks
ROI = (Realized Value − Total Cost) / Total Cost × 100%
```

**Four-category benefits model (Fiddler):**
1. **Cost reduction** — redeployed work, not vague time savings
2. **Revenue growth** — measurable lift in conversion or cycle time
3. **Risk mitigation** — avoided compliance/quality failures
4. **Strategic optionality** — new capabilities that weren't possible before

**Critical: measure baseline BEFORE deployment.** 71% of executives cannot confidently measure AI agent ROI. The gap is organizational, not technical.

**Unit economics comparison:**

| Metric | Chat/Copilot | Agentic |
|---|---|---|
| Unit of value | Productivity hours saved (indirect) | Tasks completed end-to-end (direct) |
| ROI math | Hours saved × hourly rate × capture rate | Cost per agent-completed task vs. human-completed task |
| Dominant cost line | Tool license + adoption | Integration engineering + governance + escalation overhead |
| Failure cost | Wasted time (low) | Real-world action (high) |

**Phantom productivity trap:** If saved time is absorbed into slack rather than redeployed to revenue-generating work, the financial benefit is **zero**.

**Escalation rate is the killer variable:** An agent that completes 90% of cases looks great until rework on the 10% costs more than the savings.

**AI agent ROI averages 171%** but **40–60% of true TCO is missed initially.** Break-even at 3–9 months.

**Sources:** decodethefuture.org, fiddler.ai, nhimg.org, raftlabs.com, innervationai.com, instinctools.com, yaitec.com, mortalapps.com, ctaio.dev, bteanalytics.co

---

## 7. Cost-Aware Repair

**The decision after failure:** When a cheap model fails, the agent has three options:
1. **Reflect** — revise using error feedback (cheapest)
2. **Replan** — restart with cheap model from fresh plan (cheap)
3. **Escalate** — defer to stronger model (most expensive)

**CodeRescue (arxiv.org, July 2026):** A 4B-parameter router trained on failure rollouts chooses between reflect/replan/escalate. Results:
- Always-escalate: 68.6% solve rate at **7.22 m$/query**
- Binary cascade: 63.6% solve rate at **2.56 m$/query**
- **CodeRescue router: 71.7% solve rate at 2.56 m$/query** — outperforms always-escalate in quality while spending **64.5% less**

**Execution budgeting in program repair:** Frontier agents (Claude Code, Codex) execute tests **8.8 times per task** on average. Prohibiting execution entirely drops resolve rate by only **~1.25 percentage points** (statistically insignificant) while saving **56–62% token cost** and **48–54% wall-clock time** for Claude Code.

**Practical repair profiles:**
- Hard cap: **3–5 test executions per repair attempt** (below 8.8 average, above convergence floor)
- Stage-gated execution: only after explicit checkpoints (initial reproduction, post-patch verification)
- Late-stage execution (after 33–65% of turns) consistently outperforms early-stage

**3-agent waterfall for vulnerability patching:** Top 3 agents cover **66.9% of bugs** at $4.22/pass. Agents 4–9 add only 7.4pp more coverage at rapidly increasing cost. Break-even against manual fixing ($150/hr) happens at **10 vulnerabilities per year** for the cheapest agent.

**Sources:** arxiv.org (CodeRescue, MemoRepair), codex.danielvaughan.com, xor.tech, agentpatterns.ai, emergentmind.com (CostCraft)

---

## 8. Local vs Cloud Cost Tradeoffs (RTX 4070)

**RTX 4070 cost breakdown:**
- Used price: **$350–500**
- TDP: 250W → electricity at $0.14/kWh = **$0.035/hour**
- Depreciation (5-year lifespan): **$0.008/hour**
- **Total: ~$0.043/hour**

**Cloud GPU comparison:**
- Lambda Labs RTX 4090: **$2.50/hour**
- Paperspace / AWS: **$0.50–2.50/hour**
- **Local is 10–50x cheaper per hour**

**Break-even analysis:**

| Scenario | Cloud API (monthly) | Local GPU (monthly) | Breakeven |
|---|---|---|---|
| Light use (100K tokens/day) | ~$90 | $0 + electricity | Never — stay cloud |
| Medium use (1M tokens/day) | ~$229 | $0 + elec | ~1.7 years |
| Heavy use (3M tokens/day) | ~$684 | $0 + elec | **~140 days** |
| Power user (10M tokens/day) | ~$2,280 | $0 + elec | **~9 days** |

**Against Claude Sonnet specifically:**
- RTX 4070 Ti Super ($489): breaks even in **4.7 months** (moderate usage: 20M input / 10M output monthly)
- Used RTX 3090 ($699): breaks even in **6.7 months**
- Against DeepSeek API ($0.27/1M input): local hardware **never breaks even** on cost alone

**Quality caveat:** Local Llama 3.1 70B Q4 is good but not GPT-4o/Claude Sonnet quality. For frontier reasoning tasks, cloud APIs deliver meaningfully better results.

**The hybrid approach (recommended):**
- Local GPU for: autocomplete, private code, batch jobs, RAG pipelines, high-volume simple tasks
- Cloud API for: complex multi-file refactors, architecture decisions, tasks requiring frontier reasoning
- This split cuts cloud bills by **60–80%** with no quality loss where it counts.

**Hidden costs:**
- Cloud egress: $0.02–0.10/GB (local has zero egress)
- Local infrastructure overhead: 10–20% more than single GPU (cooling, redundancy, monitoring)
- Local is slower: 35–50 tok/s (RTX 4090) vs 80–150 tok/s cloud — but single-digit ms latency for autocomplete vs 100–500ms cloud round-trip

**Sources:** promptquorum.com, localnotebook.dev, botmonster.com, fungies.io, kunalganglani.com, wideareaai.com, compareaihardware.com, articles.savethemall.eu, abuz8ai.com, craftrigs.com

---

## Practical Cost Optimization Patterns (Summary)

| Pattern | Savings | Effort |
|---|---|---|
| Prompt caching | 90% on cached input | Add cache headers |
| Model routing by complexity | 40–70% | Router implementation |
| Cascade routing (cheap → expensive) | 50–80% | Confidence thresholds |
| Context window management (sliding window, summarization) | 30–50% | Framework config |
| Hard budget circuit breakers | Prevents $47K disasters | Proxy gateway |
| Token-efficient tool use (minimal schemas) | 20–40% per call | Prompt engineering |
| Batch API (non-urgent work) | 50% | Queue architecture |
| Response memoization | 100% on repeats | Cache layer |
| Local GPU for high-volume simple tasks | 60–80% on cloud bill | Hardware + Ollama |
| Execution capping (repair agents) | 56–62% token savings | Config setting |

---

## Key Formulas

```
Agent Cost per Task = Σ (input_tokens × input_price) + (output_tokens × output_price) + tool_fees

With Caching:
Effective Input Cost = (cached_tokens × 0.10 × price) + (uncached_tokens × price) + (cache_write × 1.25 × price)

Local GPU Cost/hour = (TDP_W / 1000) × electricity_$/kWh + (GPU_price / (5 × 365 × 24))

Break-even (months) = GPU_cost / (monthly_cloud_spend − monthly_electricity)

ROI = (Value_of_accepted_tasks − Total_agent_cost) / Total_agent_cost × 100%

Cost-per-Accepted-Outcome = Total_spend / Tasks_achieving_goal
```

---

**What I did:** Conducted 6 parallel web searches covering all 8 requested topics, synthesized findings from 40+ sources including academic papers (arxiv), production case studies, vendor documentation, and FinOps practitioner reports.

**What I found:** Comprehensive pricing data, calculation formulas, and practical optimization patterns across all 8 areas. Key insight: the orchestration layer ("harness") is a bigger cost lever than model choice — moving from most to least expensive model saves 36%, while proper harness design saves 33–61% on any model.

**Files created:** None (research summary delivered inline).

**Issues:** None — all topics had substantial coverage from multiple independent sources with consistent data points.