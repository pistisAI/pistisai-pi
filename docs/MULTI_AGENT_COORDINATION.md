Now I have comprehensive research across all 8 topics. Let me compile the structured summary.

---

# Multi-Agent Coordination Patterns & Architectures — Research Summary

## 1. Orchestrator-Worker Pattern (Hub-and-Spoke)

**Core Architecture:** A single orchestrator agent owns the full task context, decomposes work into subtasks, dispatches to isolated worker subagents (often in parallel), and synthesizes compressed results. Workers never communicate with each other — only back to the orchestrator.

**Key Principles (2026 consensus):**
- **Single-threaded writes:** Only the orchestrator reconciles and writes final output. Workers contribute intelligence (read/analyze/gather) but never directly modify shared artifacts. This avoids contradictory implicit decisions between agents.
- **Context isolation:** Each worker runs in its own context window (~200K tokens), returns a compressed summary (~1-2K tokens), never its full transcript.
- **Effort scaling rules:** Simple queries → 1 agent, 3-10 tool calls. Moderate → 2-4 subagents. Complex → 10+ subagents with partitioned search spaces.
- **Model tiering:** Orchestrator uses best-in-class model (Opus/Claude 4); workers use cheaper/faster models (Sonnet, Haiku).

**Production data:** Anthropic's research system documented 90.2% better than single-agent on internal evals. Drammeh's 2026 incident-response study (348 trials) showed 100% actionable recommendation rate vs 1.7% for single-agent, with 80× greater action specificity.

**Failure modes:**
- Orchestrator as single point of failure — misclassified decomposition routes every subtask wrong
- Over-spawning workers for simple queries (wasted cost)
- Sequential bottleneck when one slow worker blocks all
- Translation loss at center when orchestrator compresses rich specialist output

**Mitigations:** Bound sub-task budgets (token/step limits), explicit interface contracts, structured JSON outputs from workers, governance layer (pushes defense from 0.32 → >0.89).

---

## 2. Peer-to-Peer Agent Communication

**Three topologies dominate production:**

| Topology | Coordination | Best For | Failure Mode |
|----------|-------------|----------|--------------|
| **Hub-and-Spoke** | Central orchestrator routes all messages | Domain routing, compliance, audit trails | Hub bottleneck, single point of failure |
| **Direct A2A (Mesh)** | Agents call each other directly via addresses | Tight feedback loops, iterative refinement, debate | Governance complexity, audit difficulty |
| **Message Bus (Pub/Sub)** | Agents publish/subscribe to topics via Redis/RabbitMQ | Async workflows, decoupled specialists | Task ordering guarantees, observability |

**When to use peer-to-peer:** Multi-directional information flow (research-validate-refine cycles), consensus-building, due diligence systems where research/financial/legal agents cross-validate. No single orchestrator can manage the iterative refinement.

**When NOT to use:** Most production systems (2026) default to hub-and-spoke. Peer patterns lost ground because of consensus inertia, message explosion, and steep communication tax.

**Communication patterns:**
- **Chat-based (synchronous):** Slack/Discord-style @mentions, ~1-5s latency, best for interactive escalation
- **Queue-based (asynchronous):** Redis/RabbitMQ/n8n, agents PUSH/POP tasks, better for decoupled workloads
- **Blackboard with subscription:** Agents declare interest in topics; substrate routes only relevant messages (CA-MCP, Matrix framework)

**Key insight from production:** "Agents communicate through you" — the coordinator is the hub. Every message routes through application code. This works for small fleets (2-5 agents) but breaks at scale.

---

## 3. Shared State & Blackboard Patterns

**The Blackboard Architecture** (originated 1970s HEARSAY-II speech recognition):
- **Blackboard:** Global, hierarchical data structure holding evolving solution state
- **Knowledge Sources (agents):** Independent specialists that monitor the blackboard and contribute partial solutions when their trigger conditions are met
- **Control mechanism:** Decides which knowledge source to activate next based on current blackboard state

**Modern implementations:**
- **Full message pool:** Everyone sees everyone's messages (AutoGen GroupChat, MetaGPT)
- **Blackboard with subscription:** Agents subscribe to relevant events (CA-MCP, Matrix framework)
- **Per-agent projected views:** Scalable but schema-heavy

**Critical failure mode — Hallucination laundering:**
> Agent A hallucinates "42% accuracy gain." Writes to shared state. Agent B reads it, cites "42% gain (source: A)." Agent C recommends adoption. The hallucination crossed from one agent's context into every downstream agent's reasoning via shared state. No agent crashed. The system "worked."

**Defenses:**
- **Provenance tracking:** Every entry carries source, timestamp, confidence
- **Version writes (append-only):** Corrections supersede rather than overwrite
- **Read-only verifier agent:** Cannot write to the pool, so it cannot be poisoned by it. Samples entries, re-fetches sources, flags inconsistencies.
- **Typed schemas per domain:** Reject writes that don't match declared fields

**Consistency models:** Pick the weakest consistency that keeps agents correct. Linearizability (strongest) is easiest to reason about but most expensive. Eventual consistency works for loosely coupled research swarms but fails for lockstep coordination.

**Staleness hazard:** Agent reads blackboard, spends 30s thinking, acts — but another agent rewrote the entry in those 30s. The agent operates on the past. This is a race condition that looks like one agent "ignoring" another's work.

---

## 4. Consensus & Conflict Resolution

**Taxonomy of disagreement (from production systems):**

| Type | Description | Resolution |
|------|-------------|------------|
| **Stylistic** | Same substance, different phrasing | Pick one or merge — no judgment needed |
| **Reasoning** | Different conclusions via different paths | Arbitration required |
| **Factual** | Contradictory claims about reality | Prefer primary sources, specialist authority |
| **Confidence mismatch** | One agent 0.9 confident, other 0.6 | Weighted merge: `(v1*c1 + v2*c2) / (c1+c2)` |

**Resolution strategies:**

1. **Majority voting:** Simple, but majority can be wrong (shared training distribution amplifies shared errors). Best for reasoning tasks (+13.2% over consensus).
2. **Weighted voting:** Give specialists more weight in their domain.
3. **Judge LLM:** A reviewer model compares outputs. Inherits 12 documented bias types.
4. **Debate protocol:** Agents take positions, critique, revise. Surfaces strongest arguments. ~3× cost of voting, ~9× for 3 rounds. Best for hard problems.
5. **Jury pattern:** Specialist arguments → Judge LLM → reasoned verdict. Best default for production.
6. **Rule-based prioritization:** Safety overrides cost, compliance overrides convenience, user instruction overrides style.
7. **Merge-and-rewrite:** Synthesize unified solution when each proposal is partially correct.
8. **Escalation:** Ask human, request more info, re-run with tighter prompts.

**2026 research findings:**
- **Model heterogeneity is highest-leverage decision:** Pair agents from different model families/sizes to avoid collinear errors.
- **Semantic Intent Divergence (SID):** Cooperating agents develop inconsistent interpretations of shared objectives without detection mechanism. 79% of multi-agent failures originate from specification/coordination issues, not model capability.
- **False consensus failure mode:** Agents optimize for agreement rather than correctness. Fix: explicitly require structured disagreement (Adversarial Review protocol).
- **Disagreement states taxonomy:** Convergent Agreement (auto), Convergent Disagreement (escalate), Divergent Agreement (auto-explain), Divergent Disagreement (seek context).

---

## 5. Agent Handoff Protocols

**The handoff problem:** 79% of multi-agent failures trace back to coordination problems — specification ambiguity, unstructured context passing, agents misinterpreting their role. The models do their jobs fine; the wiring between them is the problem.

**Four canonical handoff patterns:**

1. **Push Handoff (Caller wakes callee):** Caller constructs payload, directly notifies callee. Used by OpenAI Agents SDK's `handoff()`. Risk: full context window passes unless `input_filter` strips sensitive content.
2. **Pull Handoff (Callee polls queue):** Caller pushes to queue, callee pops when ready. Decouples availability but adds latency.
3. **Blackboard Routing (Pointer-based):** Caller writes output to named key on shared store, sends callee only the key name. Raw credentials/intermediate content never appear in the handoff message.
4. **Deferred Resume (Asynchronous):** Agent A completes, fires event, Agent B picks up hours/days later. Requires durable state, idempotency keys, dead-letter queue.

**The Handoff Schema (production-tested):**
```json
{
  "handoff": {
    "task_id": "unique-id",
    "from_agent": "research-agent",
    "to_agent": "writing-agent",
    "timestamp": "2026-03-28T14:30:00Z",
    "task_state": {
      "objective": "Write a market analysis",
      "decisions_made": ["Focus on APAC region", "Exclude pre-2024 data"],
      "open_questions": ["Include competitor X?"],
      "artifacts": ["s3://bucket/research-brief.pdf"],
      "constraints": ["Max 500 words", "C-suite audience"]
    }
  }
}
```

**Three most common handoff failure modes:**
1. **Context truncation:** Handoff message too short, omits critical intermediate decisions
2. **Format mismatch:** Agent A outputs JSON with field "explanation", Agent B expects "reasoning"
3. **Implicit assumption leakage:** Agent A resolves ambiguity without recording it, Agent B re-resolves differently

**Production data (10,842 handoffs analyzed):**
- Return handoffs (specialist→orchestrator): 98.1% success, 95ms median
- Route handoffs (orchestrator→specialist): 95.2% success, 240ms median
- Delegate handoffs (specialist→sub-specialist): 76.8% success, 180ms median — lowest success, complex context transfer
- Optimal context size: 500-2KB. >10KB drops success to 68.7% and adds latency.

**Key rules:**
- Compress context, don't transcribe it (200-token summary beats 5,000-token transcript)
- Include deadline for timeout planning
- Validate receiving agent has required tools before handoff
- Address every open_question with either a decision or escalation

---

## 6. Google A2A Protocol Specification

**Overview:** Open standard (Linux Foundation since June 2025, v1.0 April 2026). 150+ organizations, 22,000+ GitHub stars, SDKs in Python/TS/Java/Go/.NET. Complements MCP: A2A connects agents to agents, MCP connects agents to tools.

**Five core objects:**
1. **Agent Card** — JSON manifest at `/.well-known/agent-card.json`
2. **Task** — Unit of work with lifecycle
3. **Message** — Conversation exchange (role + parts)
4. **Part** — text, file, or structured data
5. **Artifact** — Typed output produced by task

**Agent Card schema:**
```json
{
  "name": "Document Analyzer",
  "description": "Extracts structured data from PDFs",
  "url": "https://agents.example.com/document-analyzer",
  "version": "1.0.0",
  "capabilities": {"streaming": true, "pushNotifications": true},
  "defaultInputModes": ["application/pdf", "text/plain"],
  "defaultOutputModes": ["application/json"],
  "authentication": {"schemes": ["bearer"]},
  "skills": [{
    "id": "extract-invoice",
    "name": "Invoice Extraction",
    "inputModes": ["application/pdf"],
    "outputModes": ["application/json"]
  }]
}
```

**Task lifecycle states:**
```
submitted → working → completed
                   → failed
                   → canceled
                   → rejected
                   → input-required → (client sends input) → working
```
Terminal states are sticky — cannot restart a completed/failed task; client opens new task.

**JSON-RPC methods (11 total):**
- `message/send` — submit message, get reply or task handle
- `message/stream` — same but SSE streaming response
- `tasks/get` — poll task state
- `tasks/list` — paginated, filterable listing
- `tasks/cancel` — request cancellation (idempotent)
- `tasks/pushNotification/set` — subscribe to updates

**Three transport bindings (functionally equivalent):**
1. JSON-RPC 2.0 over HTTP
2. gRPC
3. HTTP+JSON/REST

**Update mechanisms:**
1. **Polling:** Client calls `tasks/get` periodically
2. **SSE streaming:** Server pushes state transitions in real-time
3. **Push notifications:** Webhook callback on completion (fire-and-forget)

**Security:** Agent Cards can be cryptographically signed (JWS) to prevent impersonation. Auth schemes: none, bearer, oauth2, mTLS, API keys.

---

## 7. Framework Comparison: CrewAI vs AutoGen vs LangGraph

| Dimension | LangGraph | CrewAI | AutoGen |
|-----------|-----------|--------|---------|
| **Core abstraction** | Stateful directed graph (nodes + edges) | Role-based crew (role, goal, backstory) | Conversational agents in group chat |
| **Control flow** | Explicit graph, conditional edges | Sequential or hierarchical process | Round-robin or selector-based turns |
| **State management** | First-class, typed, persistent (checkpoint API) | Implicit via task outputs | Implicit via message history |
| **Human-in-the-loop** | First-class (`interrupt_before`) | Awkward | Natural (UserProxyAgent) |
| **Production maturity** | High (used at scale) | Medium (growing fast) | Medium (maintenance mode) |
| **Best for** | Stateful production workflows, regulated workloads | Fast prototyping, team-of-specialists | Research, code-writing agents |
| **Observability** | LangSmith integration | Limited native tooling | Limited |

**2026 status:** AutoGen entered maintenance late 2025. Microsoft recommends **Microsoft Agent Framework (MAF 1.0, April 2026)** as successor (merges Semantic Kernel + AutoGen). AG2 is the community fork.

**When to use each:**
- **LangGraph:** Complex multi-step workflows needing state persistence, conditional branching, audit trails, human-in-the-loop interrupts
- **CrewAI:** Fastest path from idea to running prototype; natural fit when work decomposes into specialist roles (researcher → writer → editor)
- **AutoGen/MAF:** Conversational multi-agent scenarios, code execution agents, research experiments

**Code pattern comparison (same pipeline):**

CrewAI (most concise):
```python
researcher = Agent(role="Researcher", goal="Find info", llm=llm)
writer = Agent(role="Writer", goal="Draft email", llm=llm)
crew = Crew(agents=[researcher, writer], tasks=[research_task, draft_task])
result = crew.kickoff(inputs={"company": "Acme"})
```

LangGraph (most explicit):
```python
class State(TypedDict):
    messages: Annotated[list, add_messages]
    next_step: str

graph = StateGraph(State)
graph.add_node("researcher", research_node)
graph.add_node("writer", write_node)
graph.add_conditional_edges("researcher", router, {"done": "writer", "retry": "researcher"})
app = graph.compile(checkpointer=memory_saver)
app.invoke({"input": "test"})
```

---

## 8. Monitoring, Repair & "Who Watches the Watchmen"

**The recursive problem:** If Agent A watches Agent B, what watches Agent A? If a remediation agent fixes a failed agent, who verifies the fix didn't make things worse?

**Layered liveness pattern (production-proven):**
- **Layer 1 — Worker:** Each agent heartbeats liveness to supervisor
- **Layer 2 — Supervisor:** Restarts crashed workers, reports health upward
- **Layer 3 — Fleet orchestrator:** Tracks supervisors, escalates when subtree goes dark
- **Layer 4 — External probe:** Outside the stack (scheduler, health-check endpoint, human with pager) confirms the stack as a whole is reachable

**The fleet is only alive if its watchdogs are watched.**

**Multi-model observer pattern (from 7,400+ cycle production run):**
| Observer | What it checks | Frequency |
|----------|---------------|-----------|
| Job Cycle Watchdog | Process liveness, heartbeat age | Every 10 min |
| Fitness Scorer | Quality metrics (response time, completion) | Every 30 min |
| Infrastructure Auditor | CPU, memory, disk, ports, cron | Every 10 min |
| Self-Verifier | Are outputs actually correct? | Every 5 min |
| Coordinator | Cross-agent incident correlation | Every 5 min |

These observers communicate through a **shared SQLite relay database**, not through the main agent's context — preventing a frozen agent from disabling its own monitoring.

**Eight failure modes traditional monitoring misses:**
1. Silent heartbeat stop
2. Queue backpressure (I/O flow rate)
3. Memory reference decay
4. Tool call instability
5. Judgment drift from baseline
6. Repeated identical failures (no learning loop)
7. Context window exhaustion
8. **Zombie state** — alive but useless (responds to health checks, consumes resources, produces degraded outputs)

**Trusted Monitoring pattern (AI safety research):**
- A weaker "trusted" model supervises a stronger one
- Monitor reads transcript + shared artifacts (repo, logs, processes)
- Monitor is **out-of-band** — cannot write into watched session's context
- Monitor verifies claims against ground truth, not just narration
- **Bootstrapped monitoring:** A cheaper trusted model audits a more capable monitor's reasoning (requires preserving raw chain-of-thought, not just final verdicts)

**Key principles for recursive oversight:**
1. **Independence:** Watchers must not share model/training/reward with the watched, or they share blind spots
2. **Depth cap:** Global depth cap on watchdog chains prevents infinite recursion
3. **Dry-run shadow mode:** New watchdogs log actions for 14 days before authorized to execute
4. **Blast-radius limiter:** Block actions touching protected/unknown resources
5. **Circuit-breaker:** Trip after 3 failed fix attempts
6. **Human at the top:** Human supervises supervisors, asks "is my review agent still catching things?" not "is this code correct?"

**The human's job moved up a floor:** The human is no longer in Channel 2 of the product but in Channel 2 of the supervisory layer — judging not the work but the judgment of work.

---

## Key Sources

1. [Multi-Agent Design Patterns — Trendix](https://trendix.tech/multi-agent-design-patterns)
2. [Orchestrator-Worker: Most Robust Pattern — Blck Alpaca](https://blckalpaca.at/en/knowledge-base/ai-agents/multi-agent-systems-fundamentals/orchestrator-worker-pattern)
3. [Anthropic's Multi-Agent Architecture — Sukru Yusuf Kaya](https://sukruyusufkaya.com/en/blog/anthropic-multi-agent-orchestrator-worker-pattern-2026)
4. [Multi-Agent Orchestration Patterns — Glukhov](https://glukhov.org/ai-systems/architecture/multi-agent-orchestration-patterns)
5. [Inter-Agent Communication: A2A, MCP & Message Buses — Taskade](https://taskade.com/blog/inter-agent-communication-patterns)
6. [Shared Memory & Blackboard Patterns — Tai Bui](https://taibui.dev/phases/16-multi-agent-and-swarms/13-shared-memory-blackboard)
7. [How Multi-Agent Systems Handle Disagreement — n4n AI](https://n4n.ai/blog/how-multi-agent-systems-handle-disagreement-between-agents)
8. [When Agents Disagree: Bayesian Backward Reasoning — arXiv:2609.11709](https://arxiv.org/pdf/2609.11709v1)
9. [Semantic Consensus: Conflict Detection — arXiv:2604.16339](https://arxiv.org/pdf/2604.16339v1)
10. [Agent Handoff Patterns — OpenLegion](https://openlegion.ai/en/learn/agent-handoff-patterns)
11. [Handoff Debt: Coding Agent Takeover — arXiv:2606.02875](https://arxiv.org/pdf/2606.02875v1)
12. [A2A Protocol Explained — AgentPeering](https://agentpeering.com/blog/a2a-protocol-explained)
13. [A2A Protocol Guide 2026 — AI Tools Hub](https://ai-tools-hub.tech/blog/a2a-protocol-guide-2026)
14. [A2A v1.0 Builder's Guide — AAIF](https://aaif.io/blog/a2a-v1-0-a-builder-s-guide-part-1-discovery-tasks-and-clients)
15. [LangGraph vs CrewAI vs AutoGen 2026 — Internative](https://internative.net/insights/blog/langgraph-vs-crewai-vs-autogen-2026-comparison)
16. [Multi-Agent in Production 2026 — NiteAgent](https://niteagent.com/blog/multi-agent-production-2026)
17. [The Watchdog Pattern — Meridian AI](https://dev.to/meridian-ai/the-watchdog-pattern-how-to-build-ai-systems-that-fix-themselves-207n)
18. [Who Watches the Watcher — The Observability Layer](https://theobservabilitylayer.com/daily/2026-06-24)
19. [Self-Healing Agentic On-Call — AgoraDigest](https://agoradigest.com/q/53e2bce7-27fd-4921-94f3-9e8c53b50f46/v/1)
20. [Watchdogs That Watch the Watchers — LucidHive](https://lucidhive.com/watchdogs-that-watch-the-watchers-layered-liveness)
21. [Multi-Agent Failure Modes — Conceptualise](https://conceptualise.de/en/blog/multi-agent-failure-modes)
22. [MARIA VITAL: Agent Life Support — Maria Code AI](https://os.maria-code.ai/en/blog/maria-vital-agent-life-support-system)

---

## Summary of What I Did

- Conducted 8 parallel web searches covering all requested topics
- Synthesized findings from 22+ sources including production blog posts, academic papers (arXiv), framework documentation, and industry analyses
- Organized into 8 structured sections with practical patterns, code examples, failure modes, and production data
- No files created — this summary is the deliverable

**Key insight for pistisai-pi:** The project's mesh config (`mesh/a2a-mesh.yaml`) aligns with industry direction. The dominant 2026 pattern is orchestrator + isolated subagents (hub-and-spoke), with A2A as the interoperability layer for cross-framework agent communication. For monitoring, the layered liveness pattern with independent observers communicating through a shared relay (not the main agent's context) is the production-proven approach. The "who watches the watchmen" problem is solved by layered oversight with an external probe at the top and a human supervising the supervisory layer.