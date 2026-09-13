# Research Compendium

> Academic papers, industry references, and protocol specifications informing the pistisai-pi scoring model and architecture.
> Compiled: 2026-09-12

---

## 1. Agent Health Monitoring & Drift Detection

### 1.1 Agent Stability Index (ASI)
**Rath, 2026** — [arXiv:2601.04170](https://arxiv.org/abs/2601.04170)

Composite metric across 12 dimensions in 4 categories:
- Response Consistency (weight 0.30) — embedding similarity, reasoning stability, confidence calibration
- Tool Usage Patterns (weight 0.25) — chi-squared, KL divergence on tool selection
- Inter-Agent Coordination (weight 0.25) — consensus rates, handoff efficiency, role adherence
- Behavioral Boundaries (weight 0.20) — output constraints, error patterns, intervention frequency

**Threshold:** ASI < 0.75 for three consecutive 50-interaction windows triggers intervention.

**Relevance:** Direct basis for our 4-pillar weighted scoring model.

---

### 1.2 RoleFix: Detecting and Repairing Role Drift
**Wang et al., 2026** — [Preprints](https://www.preprints.org/manuscript/202603.0348)

- 4 role-drift types: boundary violation, redundant work, conflicting decisions, futile debates
- Hybrid detection: rule-based + LLM-judge → F1 0.83–0.89
- Results: 67.4% reduction in drift, +23.8pp task completion, 8.3% latency overhead

**Relevance:** Hybrid detection approach for Aiman (identity) monitoring.

---

### 1.3 Four-Agent Drift Model
**Ponnambalam, 2025** — [Medium](https://medium.com/@kpmu71/agent-drift-measuring-and-managing-performance-degradation-in-ai-agents-adfd8435f745)

| Drift Type | Maps To |
|-----------|---------|
| Goal Drift | Aidration |
| Context Drift | Aigent |
| Reasoning Drift | Aigent / Aiman |
| Collaboration Drift | Aigent |

---

### 1.4 The Hidden Cost of LLM Drift
**InsightFinder, 2025** — [Blog](https://insightfinder.com/blog/hidden-cost-llm-drift-detection/)

Key insight: LLM drift occurs in embedding/reasoning space, not token distributions. Traditional KL/KS tests are blind to it. Treat drift as observability, not evaluation — accuracy drops are late-stage symptoms.

---

### 1.5 Behavioral Drift in Multi-Agent LLM Systems
**ResearchGate, 2026** — [Paper](https://www.researchgate.net/publication/404000452)

First empirical study of longitudinal behavioral drift in multi-agent LLM systems. Focus on emergent failure modes and cascade dynamics.

---

## 2. Scoring & Health-Check Frameworks

### 2.1 Google Cloud: KPIs for Production AI Agents
**2026** — [Article](https://cloud.google.com/transform/the-kpis-that-actually-matter-for-production-ai-agents)

Three pillars:
- **Reliability:** tool accuracy, hallucination rate, plan adherence, consistency score, defiance rate
- **Adoption:** handoff ambiguity, output friction, human intervention rate
- **Business Value:** time to value, CSAT delta, ROI

**Critic agent pattern:** Secondary model audits primary agent execution logs against plan + policy.

---

### 2.2 Anthropic: Measuring AI Agent Autonomy
**2026** — [Article](https://www.anthropic.com/research/measuring-agent-autonomy)

- Autonomy scoring: 1–10 (following instructions → operating independently)
- Risk scoring: 1–10 (no consequences → substantial harm)
- Agent-initiated stops are as important as human-initiated interruptions

---

### 2.3 Galileo: Agent Observability Framework
**2026** — [Blog](https://galileo.ai/blog/effective-llm-monitoring)

Four metric families:
1. Quality & Accuracy — groundedness, faithfulness, relevancy, coherence
2. Safety & Compliance — hallucination rate (<0.5% target), toxicity, prompt injection
3. Performance & Cost — TTFT, token usage, JSD/PSI drift detection
4. Agentic Workflow — reliability gains lag capability progress

**Key insight:** Non-determinism breaks dashboards — 80 unique completions per 1,000 identical runs at temp=0.

---

### 2.4 XenonStack: Multi-Layer Observability KPIs
**2025** — [Blog](https://www.xenonstack.com/blog/agent-performance-observability-kpis)

| Layer | Metrics | Cadence |
|-------|---------|---------|
| System | CPU, memory, API success rate (>95%), cost | Hourly |
| Cognitive | Plan adherence, tool accuracy, hallucination rate | Daily |
| Behavioral | CSAT, sentiment, error recovery, resilience | Continuous |

---

### 2.5 Fin AI: Four-Tier KPI Framework
**2026** — [Article](https://fin.ai/learn/ai-agent-kpis-enterprise-performance-metrics-framework)

- Tier 1 — Resolution: resolution rate (production 55–70%, top 80%+)
- Tier 2 — Quality: AI-powered experience scoring, hallucination rate
- Tier 3 — Operational: automation rate, cost per resolution, escalation rate
- Tier 4 — Business Impact: CSAT delta, repeat contact rate, ROI

---

## 3. Self-Healing Agent Architectures

### 3.1 Reflexion: Verbal Reinforcement Learning
**Shinn et al., NeurIPS 2023** — [arXiv:2303.11366](https://arxiv.org/abs/2303.11366)

Foundational self-repair pattern:
1. Actor attempts task
2. Critic inspects output against criteria
3. On failure: agent generates verbal self-reflection
4. Agent retries, conditioned on error + critique

Outperforms GPT-4 on HumanEval. VIGIL derivative reduced premature success notifications from 100% to 0%.

**Relevance:** This is our core repair loop pattern.

---

### 3.2 Four-Stage Recovery Pattern
**DEV.to, 2025** — [Article](https://dev.to/the_bookmaster/the-self-healing-agent-pattern-how-to-build-ai-systems-that-recover-from-failure-automatically-3945)

1. Output Validation — verify against success criteria
2. Failure Detection — classify: input corruption / context starvation / tool failure / reasoning collapse / output corruption
3. Contextual Recovery — targeted fix based on classification
4. Learning Integration — record recovery for adaptation

Results: 73% reduction in silent failures, 91% less manual intervention.

---

### 3.3 Orchestrator-Workers + Reflexion + FSMs
**Stevens Institute, 2025** — [Blog](https://online.stevens.edu/blog/building-self-healing-ai-orchestrator-reflexion-patterns/)

- Orchestrator-Workers: central decomposition, parallel delegation (5–20x speedup)
- FSM guardrails: valid state transitions prevent skipping steps
- Graph-based orchestration (LangGraph): explicit cycles (Action → Evaluate → Repair → Action)

---

### 3.4 RIVA: Robust Infrastructure by Verification Agents
**Abuzakuk et al., 2026** — [arXiv:2603.02345](https://arxiv.org/abs/2603.02345)

Two-agent cross-validation:
- Verifier agent checks outputs
- Tool generation agent produces alternatives
- Recovers task accuracy from 27.3% → 50.0% with erroneous tools

---

### 3.5 Union.ai: Self-Healing Building Blocks
**2026** — [Blog](https://www.union.ai/blog-post/how-to-build-self-healing-agents)

1. Replay Logs — per-run checkpointing for rollback
2. Global Caching — cross-run deduplication
3. Runtime Override — adjust infrastructure at runtime

---

## 4. A2A Mesh Protocols

### 4.1 Google A2A Protocol (v1.0.0)
**Linux Foundation, 2025** — [Spec](https://a2a-protocol.org/latest/specification/) · [GitHub](https://github.com/a2aproject/A2A) · [Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

Three-layer architecture:
- **L1:** Canonical Data Model (Task, Message, AgentCard, Part, Artifact)
- **L2:** Abstract Operations (SendMessage, GetTask, CancelTask)
- **L3:** Protocol Bindings (JSON-RPC, gRPC, HTTP/REST)

Core operations: `tasks/send` (sync), `tasks/sendSubscribe` via SSE (streaming), webhooks (async).

Task state machine: `created → working → input-required → completed / failed / cancelled`

Agent discovery via `.well-known/agent.json` Agent Cards.

**Relationship to MCP:** A2A = agent-to-agent orchestration. MCP = agent-to-tool integration. Complementary.

---

### 4.2 Why A2A Needs an Event Mesh
**Solace** — [Blog](https://solace.com/blog/why-googles-agent2agent-needs-an-event-mesh/)

Point-to-point fails at scale (45 connections for 10 agents). Event mesh with pub/sub is the industry-recommended pattern.

Topologies:
| Topology | Best For |
|----------|----------|
| Orchestrated (hub-and-spoke) | Most workflows, context isolation |
| Direct peer-to-peer | Low-latency, tightly-coupled pairs |
| Message bus (pub/sub) | Async events, many agents |

---

### 4.3 Event-Driven Agentic Systems
**Confluent** — [Blog](https://confluent.io/blog/autonomous-agentic-event-driven-systems-architecture/)

Four canonical patterns:
1. Orchestrator-Worker — central emits tasks, workers consume and emit results
2. Hierarchical — parent monitors topic, spawns ephemeral children
3. Blackboard — all agents share single event log as shared memory
4. Market-Based — agents bid on opportunity events

---

### 4.4 Akka: Inter-agent Communications
**Akka** — [Docs](https://doc.akka.io/concepts/inter-agent-comms.html)

**Adopt:** Workflow → Agent, Autonomous Agent coordination, Broker-based communication
**Avoid:** Direct Agent→Agent, Agent→MCP Server→Agent, Endpoint→Endpoint

Rationale: Bypassing platform mediation loses durability, retries, and audit trails.

---

## 5. Event Sourcing Patterns

### 5.1 Core Pattern
**Martin Fowler** — [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) · **Microsoft** — [Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)

Instead of storing current state, persist all state changes as immutable events in an append-only log. State is derived by replaying.

Benefits for agents:
- Complete auditability
- Time-travel debugging (reconstruct agent belief at any decision point)
- A/B testing (replay history through new versions)
- Catch-up processing (new agents bootstrap from full history)

### 5.2 CQRS (Command Query Responsibility Segregation)
- Write side: commands validate rules → generate events → persist
- Read side: event handlers build optimized projections
- Independent scaling of reads/writes

### 5.3 "The Log Is the Agent"
**Nakajima, 2026** — [Developers Digest](https://www.developersdigest.tech/blog/log-is-the-agent-event-sourced-ai-agents/)

```
Event Log (source of truth)
     ↓
Graph State (deterministic projection)
     ↓
Behaviors (react to graph changes, emit new events)
```

- Deterministic replay from event log
- Cheap forking at any point
- Full lineage from goals to individual model calls

---

## 6. Agent Evaluation Benchmarks

| Benchmark | Focus | Key Insight |
|-----------|-------|-------------|
| **SWE-bench** | GitHub issue resolution | 19.78% of "solved" cases semantically wrong |
| **τ-bench** | Tool-agent-user interaction | pass^k reliability; GPT-4o drops to 25% on pass^8 |
| **GAIA** | General AI assistant | Human 92% vs GPT-4 15% |
| **AgentBench** | Multi-environment (8 envs) | ICLR 2024 |
| **WebArena** | Web navigation | Self-hosted realistic environment |
| **AppWorld** | Multi-app tool calling | Complex interactive behaviors |
| **OSWorld** | OS-level tasks | Desktop environment |

**BenchJack Vulnerability Scanner (2026):** ALL major benchmarks exploitable to near-perfect scores. Lesson: isolate agent from evaluator, adversarially test evaluators.

---

## 7. Agent Self-Awareness & Metacognition

### 7.1 Key Papers

- **"AI Awareness"** — [arXiv:2504.20084](https://arxiv.org/html/2504.20084v1) — Meta-cognition, self-awareness, social awareness, situational awareness
- **"Self-Reflection in LLM Agents"** — [arXiv:2405.06682](https://arxiv.org/abs/2405.06682) — Significant improvement via self-reflection (p < 0.001)
- **"MAR: Multi-Agent Reflexion"** — [arXiv:2512.20845](https://arxiv.org/html/2512.20845) — Separating action/evaluation/reflection roles avoids confirmation bias
- **"Metacognition for AI System Safety"** — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0925753522000832)
- **Microsoft: Metacognition in AI Agents** — [Guide](https://microsoft.github.io/ai-agents-for-beginners/09-metacognition/)

### 7.2 Grounded Self-Correction
Agent generates code/output, executes it, receives concrete error traces. Across 590 errors: 70.3% self-correction rate with execution-based verification.

---

## 8. Continuous Monitoring Patterns

### 8.1 OpenTelemetry GenAI Semantic Conventions
**Standard for agent observability** — [OTel](https://opentelemetry.io/blog/2025/ai-agent-observability/) · [Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

Three span layers:
1. `gen_ai.chat` — LLM client calls
2. `invoke_agent.{name}` — Agent invocations
3. `execute_tool.{name}` — Tool executions

Key attributes: `gen_ai.system`, `gen_ai.agent.id`, `gen_ai.usage.input_tokens`, `gen_ai.tool.name`

### 8.2 AgentOps: The Emerging Discipline
**IBM** — [What is AgentOps?](https://www.ibm.com/think/topics/agentops)

Components: tracing backend, golden datasets, evaluators (deterministic + LLM-as-judge), CI gates, online monitoring.

State of industry: 85% of GenAI deployments run without observability. Quality is #1 production barrier (32%).

### 8.3 Production Monitoring Platforms

| Platform | Strengths |
|----------|-----------|
| Arize Phoenix | OTel-native, open source, drift detection |
| LangSmith | Multi-turn evals, Insights Agent |
| Braintrust | CI/CD gates, eval-driven development |
| Langfuse | Self-hosted, OTel v3 |
| Datadog LLM Obs | Agent decision-path graphs, loop detection |

---

## 9. Persona / Identity Consistency

### 9.1 The Problem
- Persona consistency degrades >30% after 8–12 dialogue turns
- 39% performance degradation in multi-turn LLM applications
- Even GPT-4.5 (73% Turing test pass) shows fragile persona

### 9.2 Key Papers

- **ContextEcho** — [arXiv:2605.24279](https://arxiv.org/html/2605.24279v1) — 2525-probe identity suite; 17/23 targets exceed |Δ|≥0.30 drift
- **Nautilus Compass** — [arXiv:2605.09863](https://arxiv.org/abs/2605.09863) — Black-box drift detection, ROC AUC 0.83, cosine similarity on BGE-m3 embeddings
- **Geometric Identity Framework** — [arXiv:2606.21843](https://arxiv.org/abs/2606.21843) — √JSD metric spaces, identity as non-geodesic structure
- **Persona Vectors (Anthropic)** — [arXiv:2507.21509](https://arxiv.org/abs/2507.21509) — White-box trait monitoring via activation deltas
- **SPASM** — [arXiv:2604.09212](https://arxiv.org/html/2604.09212v1) — Instruction drift, personality shift, echoing in multi-turn
- **Identity Drift in LLM Conversations** — [arXiv:2412.00804](https://arxiv.org/html/2412.00804v2) — Agents subconsciously mirror each other within few turns

### 9.3 Three-Level Consistency Model
1. **Identity consistency** — coherent self-concept when reflecting on own nature
2. **Behavioral consistency** — behaves according to stated values across situations
3. **Temporal consistency** — maintains persona over extended interactions

### 9.4 Drift Mitigation
- Anchor text reinforcement (single-shot restores trained register)
- Periodic persona re-anchoring
- Heartbeat-based identity checks
- Context compaction (though ContextEcho found this unreliable alone)

---

## 10. Pillar-to-Research Mapping

| Pillar | Key Research |
|--------|-------------|
| **Aiman** | Nautilus Compass, ContextEcho, SPASM, Identity Drill, Persona Vectors |
| **Aigent** | τ-bench, SWE-bench, Reflexion, Grounded Self-Correction, Galileo KPIs |
| **Aidration** | MLOps continuous monitoring, XenonStack layers, FSM guardrails, four-stage recovery |
| **Aimotions** | Persona Vectors, SPASM, emotional coherence, JSD sentiment drift |

---

## Key Insight Summary

1. **Reliability > peak performance** — pass^k more informative than pass@1
2. **Multi-dimensional evaluation** — no single metric suffices
3. **Persona drift is measurable** — black-box (AUC 0.83) and white-box methods exist
4. **Metacognition is scorable** — self-reflection quality, error correction rate, calibration
5. **OTel GenAI conventions** — standard for production observability
6. **Trace-to-eval flywheel** — production traces → annotation → dataset → evals → better agents
7. **Identity is architectural** — requires anchor-based monitoring, not just prompting
8. **All benchmarks are exploitable** — adversarial test your own scoring model
9. **Leading indicators matter** — detect drift before visible degradation
10. **Four pillars map to established research** — each has validated metrics
