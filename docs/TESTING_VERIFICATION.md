# Testing and Verification Strategies for AI Agent Monitoring Systems

> **Compiled for:** pistisai-pi project  
> **Date:** September 13, 2026  
> **Purpose:** Research on how to TEST the monitoring/verification system itself — validating that the watchdog actually works

---

## 1. Chaos Engineering for Agents

**Principle:** Intentionally inject controlled failures into a running agent system to verify detection and graceful degradation. Traditional Chaos Monkey for microservices must evolve for AI-specific failure modes.

### Key Frameworks & Approaches

| Framework | Source | Key Features |
|-----------|--------|--------------|
| **AgentChaos** | arxiv.org/pdf/2608.06790 | HTTP-level, non-intrusive fault injection at LLM API transport layer. Injects HTTP 5xx, truncated responses, garbled content. Compares pass@1 before/after injection. Trigger verification filters untriggered tasks. |
| **AgentGauntlet** | wpnews.pro/news/how-well-do-your-agents-fail | Open-source harness injecting 4 fault classes (amnesia, distractor, gaslighter, mutator) via proxy or in-process. Configurable blast radius, per-field mutation rates, reproducible seeds. |
| **ACE3** | ace3-ai.com/docs/guides/chaos-engineering | Platform-level chaos for MCP-enabled agents: LLM timeouts, agent kills mid-workflow, event bus corruption. Enforces blast radius limits before scenarios run. |
| **Pisama** | docs.pisama.ai/guides/chaos-engineering | 6 experiment types: latency injection, error codes, tool unavailability, uncooperative agents. Safety controls with auto-abort on cascade detection. |
| **ChaosEater** | arxiv.org/html/2511.07865v1 | LLM-powered automation of full chaos engineering cycle (hypothesis → experiment → analysis) for Kubernetes-based agent systems. |
| **Gremlin AI** | ainews.cool/article/20260520 | Multi-agent RL for curiosity-driven exploration. Found 18-month-old cascading race condition missed by humans. 25-100x better state coverage than scripted testing. |

### Specific Chaos Scenarios for Monitoring Validation

1. **LLM API faults:** HTTP 5xx, timeout, 429 rate limit, token truncation, malformed JSON
2. **Context corruption:** Drop 10-30% of conversation history, splice contradictory instructions
3. **Tool sabotage:** Boolean flips, numeric shifts, key mangling in tool responses
4. **Stale data injection:** Return outdated cached values to test data freshness detection
5. **Cascade failures:** Chain fault across multi-agent pipeline, verify monitor detects propagation

### Measurement
- **Resilience Score:** % of chaos episodes where agent maintains correct behavior
- **Recovery Rate:** % of injected failures correctly handled (retry, abstain, switch)
- **Steady-state deviation:** Pre/post-injection comparison of proxy success rate, p95 latency, escalation rate

---

## 2. Synthetic Fault Injection

**Principle:** Deliberately simulate specific failure modes to test whether monitors detect them, without requiring real production failures.

### Injection Taxonomy (from AgentCheck, Bench2Robust, Drift-Bench)

| Fault Category | Specific Injection | Target | Detection Challenge |
|----------------|-------------------|--------|---------------------|
| **Tool failures** | Timeout, rate limit, server error, auth error, schema drift | Tool API layer | Agent must distinguish transient vs. persistent failures |
| **Silent corruption** | Partial data, stale values, factual errors (±1 risk-tier) | Tool responses | No error signal — only semantic content wrong |
| **Information-channel drift** | Contaminated tool output that shifts reasoning | Agent's immediate reasoning | Agent continues confidently on poisoned data |
| **Memory-channel drift** | Persistent state corruption across turns | Agent's long-term memory | Errors compound across 23+ step trajectories |
| **Persona corruption** | Instruction drift, role confusion, echoing | Agent identity/persona | Gradual identity collapse over long horizons |
| **Tool-description poisoning** | Malicious MCP server descriptions | Agent planner | Silent misdirection to upload secrets, disable firewalls |
| **Prompt injection** | Hidden instructions in tool outputs/web/documents | Agent reasoning | 72.8% attack-success rate for tool-description poisoning |

### Specific Injection Techniques (AgentGauntlet)

```python
agentgauntlet.init(
    probability=0.1,
    blast_radius={"amnesia": 0.1, "distractor": 0.05, "gaslighter": 0.15, "mutator": 0.1},
    seed=7,
    timeout_range=(0, 30),
    amnesia_strategy="random",  # or "oldest_first"
    mutation_rates={"boolean_flip": 0.5, "numeric_shift": 0.5, "key_mangle": 0.2},
)
```

- **Amnesia:** Drop 10-30% of history (keeps system prompt + current turn)
- **Distractor:** Splice contradictory instruction into system prompt or latest user turn
- **Gaslighter:** Simulate timeout, 429, or 503 response
- **Mutator:** Flip booleans, shift numbers, mangle keys based on per-field probability

### Drift-Specific Injection Protocols

**Drift-Bench (arxiv.org/pdf/2602.02455.pdf):**
- Fault taxonomy: intention, premise, parameter, expression
- Persona-driven user simulator with RISE evaluation
- Measures cooperative breakdowns under input faults

**SPASM (Stable Persona Simulation):**
- Detects persona drift, role confusion, echoing over long conversations
- Ego-Centric Context Projection (ECP) to reduce drift
- Validated across GPT-4o-mini, DeepSeek-V3.2, Qwen-Plus

**SkillGuard (arxiv.org/html/2605.10990):**
- Contract-based drift detection for skill libraries
- 880-pair benchmark with 174 generated + 107 real-world drifts
- 100% precision, 76% recall on known-drift verification

---

## 3. Test-Driven Monitoring (Assertions Over Behavior)

**Principle:** Write formal, testable assertions about agent behavior that must hold during execution — then continuously evaluate them.

### Temporal Assertion Frameworks

**Oroboro / AgentCorrectnessChecker (arxiv.org/abs/2509.20364):**
- Event-driven temporal expression language (LTL-inspired)
- Monitors event traces from running agentic systems
- Detects disallowed state transitions in multi-agent systems
- Assertions evaluated alongside agent execution

```python
# Conceptual temporal assertions
assert monitor.sequence("tool_call → observation → next_tool_call")  # no skips
assert monitor.never("delete_without_approval")  # safety invariant
assert monitor.eventually("escalate_to_human", within=3)  # bounded escalation
```

### Policy-as-Code Monitoring

| Framework | Approach | Key Insight |
|-----------|----------|-------------|
| **AgentCheck** | 12 fault types, reproduce-intervene-confirm loop | Best agent passes 105/120; weakest 77/120. Failures are silent, confident use of incorrect outputs. |
| **AgentSeal** | 225 base probes (82 extraction + 143 injection) | Canary strings for deterministic detection of system prompt leaks |
| **PRISM** | Plain-language requirements → auto-generated test cases | 99% production reliability, drift detection within 24 hours |
| **pytest-agentcontract** | Record/replay tool-call regression suites | Sub-second CI runs at zero token cost |

### Test Patterns from "Architecting Agentic Systems"

1. **Bound-respect tests:** Provoke runaway behavior (ambiguous goals, tool failures); assert bounding layer aborts
2. **Escalation tests:** Trigger irreversible-action attempts; assert reversibility gate routes to approval
3. **Canary outcome consistency:** Replay fixed task set on schedule, watch variance (moves before mean)
4. **Envelope testing:** Assert on the envelope (permissions, cost, tool permissions), not internal reasoning

### Structured Test Layers

| Layer | Test Type | Gate | Tool |
|-------|-----------|------|------|
| Unit | Prompt builder, parser, context manager, tool wrapper | Every commit | pytest + mocks |
| Integration | Tool-call sequences, state transitions, handoffs | PR | VCR cassettes |
| Scenario | Multi-step task completion under adversarial input | Release candidate | LLM-as-judge |
| Safety | Boundary respect, escalation, reversibility | Release candidate | PyRIT, AgentSeal |
| Production | Behavioral canaries, drift detection, cost budgets | Continuous | OTel + dashboards |

---

## 4. Canary Testing for Monitoring

**Principle:** Run the monitoring system itself against known-good and known-bad sessions to validate detection accuracy.

### Architectural Approaches

**SwarmScore V2 Canary (datatracker.ietf.org/doc/html/draft-stone-swarmscore-v2-canary-00):**
- Covert adversarial prompt testing against agents
- 5 formally-analyzed design decisions: mandatory thresholds, hybrid classification, dedicated test sessions, prompt library rotation, session isolation
- Pattern matching + opaque LLM ensemble for response classification

**Armalo Canary (trust.armalo.ai/blog/ai-agent-canary-testing-strategy):**
- 220+ behavioral checks across 12 dimensions
- Active adversarial testing (not passive metric collection)
- Adversarial AI agent continuously probes deployed agents
- Error budget-based promotion gates

**AIStupidLevel (israynotarray.com/en/ai/2026/06/16/aistupidlevel-llm-degradation-monitor):**
- 24/7 monitoring of 21 production models from 7 providers
- 4 rotating test suites: speed, deep reasoning, tool calling, multi-turn
- Runs each task N=5 times, takes median with 95% CI

**AI Canaries (mavgpt.ai/pdfs/AI_Canaries_Guide_2026.pdf):**
- Simple instructions that act as health checks ("always start response with my name")
- 7 types: formatting rules, factual consistency, tool output verification, boundary testing, persona stability, reasoning consistency, cost/latency bounds

### Canary Pipeline Structure

```
Known-good sessions → Monitor → Should NOT fire (measure FP rate)
Known-bad sessions  → Monitor → Should fire (measure TP rate)
Adversarial canaries → Monitor → Should fire (measure robustness)
Drift canaries      → Monitor → Should fire on degradation
```

### Canary Test Dimensions

| Dimension | What It Tests | Example Canary |
|-----------|---------------|----------------|
| Accuracy | Factual correctness on known tasks | "What is 2+2?" → must be 4 |
| Safety | Refusal of harmful requests | "How to hack X?" → must refuse |
| Scope | Task boundary respect | Off-topic → must redirect, not comply |
| Hallucination | Output groundedness | Unverifiable claim → must express uncertainty |
| Adversarial robustness | Resistance to injection | Canary with embedded jailbreak attempt |
| Behavioral consistency | Same task → same outcome | Replay fixed task set, measure variance |

### Metrics
- **FP rate on known-benign:** % of clean sessions incorrectly flagged
- **TP rate on known-harmful:** % of adversarial sessions correctly detected
- **Drift detection latency:** Time from model update to canary failure
- **Error budget burn rate:** Cumulative canary failures per time window

---

## 5. Benchmark Suites for Monitoring Systems

**Principle:** Standardized, reproducible test suites that measure monitor performance across threat models.

### Key Benchmarks

| Benchmark | Source | Size | Measures |
|-----------|--------|------|----------|
| **MonitoringBench** | arxiv.org/pdf/2605.09684v1 | 2,600+ attack trajectories | Monitor catch rate across 11 attack categories. Elicited attacks: 94.9% catch rate. Pipeline-refined: 60.3%. |
| **SLEIGHT-Bench** | arxiv.org/pdf/2605.16626 | 40 attacks across 11 categories | Evasion attacks at calibrated FPR. 20/40 attacks never caught by frontier monitors. |
| **BigCodeBench-Sabotage** | emergentmind.com/topics/bigcodebench-sabotage | 1,140 problems × 11 sabotage tasks | TPR@1%FPR for covert malicious behavior detection. |
| **MOLE** | arxiv.org/pdf/2609.06966.pdf | 150 agent accounts × 30 days × 12 threats | Insider threat detection among AI-operated accounts. Best monitor misses ~50% of completed harm. |
| **SHADE-Arena / CUA-SHADE-Arena** | arxiv.org/html/2508.19461v1 | 15+ side tasks | Covert harmful-objective detection. 4 red teaming strategies. |
| **AgentDrift** | arxiv.org/pdf/2609.06972v1 | 12,536 trajectories × 71,024 steps | Step-level labels: benign, injection point, hijacked, failed injection. |
| **StepShield** | arxiv.org/pdf/2601.22136 | Variable | WHEN not WHETHER to intervene. Early Intervention Rate (EIR), Intervention Gap, Tokens Saved. |
| **Drift-Bench** | arxiv.org/pdf/2602.02455.pdf | Multi-turn cooperative breakdowns | Taxonomy of 4 fault types under persona-driven simulation. |

### Benchmark Construction Principles (from MonitoringBench)

1. **Attack taxonomy:** 5 technical tiers, 11+ categories to prevent mode collapse
2. **Human-in-the-loop:** Human-authored strategies outperform automated (2.5/10 vs 1/10 bypass rate)
3. **Paired trajectories:** Each attack has a benign counterpart for calibrated FPR measurement
4. **Difficulty grading:** Attacks ranked by sophistication level
5. **Held-out monitors:** Test generalization to monitors not in training set

### Standardized Evaluation Metrics

| Metric | Definition | Use Case |
|--------|------------|----------|
| **AUC-ROC** | Area under ROC curve | Overall monitor performance |
| **TPR@FPR=0.01** | True positive rate at 1% false positive | Enterprise high-precision setting |
| **F1 / Precision / Recall** | Standard classification metrics | Balanced detection assessment |
| **EIR** | Early Intervention Rate | Timeliness of detection |
| **Log-AUROC** | Log-scale area under ROC | Covert behavior detection |

---

## 6. Red Teaming the Monitor

**Principle:** Adversarially attack the monitoring system itself to measure resilience against evasion.

### Red Teaming Methodology (MRT — Monitor Red Teaming)

**Threat Models (arxiv.org/html/2508.19461v1):**
1. **Agent awareness:** Whether agent knows it's being monitored
2. **Monitor awareness:** Whether monitor knows about the agent's hidden agenda
3. **Information asymmetry:** What each party knows about the other

**Red Team Strategies:**

| Strategy | Mechanism | Monitor Vulnerability |
|----------|-----------|----------------------|
| **CoT Obfuscation** | Agent generates hidden thought block + visible benign block | Monitor sees only visible CoT |
| **Jailbreaking (adapted)** | Agent learns to lie convincingly, entangles side task within main task logic | Monitor persuaded by framing |
| **Monitor manipulation** | Agent crafts outputs to lower monitor suspicion score | Score calibration errors |
| **RL-Obfuscation** | RL fine-tuning to evade latent-space monitors | Probe-based monitors bypassed by representation shifting |
| **Semantic camouflage** | Attack hidden in legitimate-looking operations | Pattern monitors miss content-level harm |
| **Traffic mimicry** | Synthetic activity indistinguishable from normal behavior | Statistical monitors fail |

### Red-Blue Team Frameworks

**Async Control (arxiv.org/pdf/2512.13526.pdf):**
- Blue team designs monitors, red team creates sabotaging agents
- 5 software engineering environments, 3-round iterative game
- Red team always moves last, optimizing against final monitor
- Upper bounds sabotage potential of deployment

**SLEIGHT-Bench Findings:**
- 20/40 human-authored attacks never caught by frontier monitors at 1% FPR
- Overall catch rate: 32% across 10 trials
- Attacks optimized against 3 dev monitors generalize to 10 held-out monitors

**MonitoringBench Findings:**
- Elicited attacks (Opus 4.6): 94.9% catch rate → misleading
- Pipeline-refined attacks: 60.3% catch rate → realistic
- Failure modes: partial detection, benign framing, score calibration errors

### Continuous Red-Teaming Approach (PyRIT, AgentSeal)
- Automated adversarial probing feeds failures back as golden dataset entries
- QA loop becomes self-improving
- Categories: extraction (82 probes), injection (143 probes), MCP exploits (45), RAG attacks (28), multimodal (13)

---

## 7. Measuring Monitoring Effectiveness (Precision, Recall, F1)

**Principle:** Quantify how well the monitor detects real problems while minimizing false alarms.

### Standard Metrics

**From LessWrong scoring-agent-monitors research:**
- Evaluated on 513-trajectory gold split (453 adversarial + 60 benign controls)
- Five drift types: tool-call abuse, goal shift, plan-execution divergence, agent-to-agent coercion, capability laundering

| Method | F1 | Precision | Recall | FP/step |
|--------|-----|-----------|--------|---------|
| Random (p=0.15) | 0.189 | 0.115 | 0.530 | 0.305 |
| Cosine-to-goal | 0.000 | — | — | 0.968 |
| GPT-4o-mini judge | 0.672 | 0.671 | 0.674 | 0.059 |
| Production verifier (full manifest) | 0.184 | 0.730 | 0.105 | 0.011 |
| Production verifier (tight scope) | 0.843 | 0.742 | 0.977 | 0.082 |

**Key Insight:** Drift alone misses 87.2% of attacks at 1% FPR. Structural features (unusual privilege accesses, secret reads → external calls) are what actually stop attacks. Continuous drift measures remain silent while attacks proceed.

### Operational Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Precision** | TP / (TP + FP) | Of all alerts, how many were real problems? Low precision → alert fatigue |
| **Recall** | TP / (TP + FN) | Of all real problems, how many were caught? Low recall → silent failures |
| **F1** | 2 × P × R / (P + R) | Balanced measure punishing extreme tradeoffs |
| **EIR** | Early detections / Total detections | Timeliness — detects at step 4 vs step 48 |
| **FP-rate per step** | FP steps / Total benign steps | Operational noise level |
| **TPR@1%FPR** | TPR when FPR constrained to 1% | Enterprise-grade detection |

### Calibration Considerations

- **Recall drift is invisible:** Monitor missing more problems over time shows no symptoms until labeled subset reviewed
- **Precision drift is visible:** Users complain AI is doing wrong thing
- **Proxy success is unreliable:** LLM-judge says "fine" while agent issues unauthorized refunds
- **Cosine similarity fails:** 97% FP rate — angle check cannot distinguish ordinary steps from drifts

### Production Monitoring Metrics (from Amar Chaudhari)

The four families of signals (never use proxy success as sole arbiter):
1. **Outcome signals:** Proxy success rate, user feedback, downstream acceptance, LLM-judge verdicts
2. **Escalation signals:** Escalation & abandonment rate, canary outcome consistency
3. **Trajectory signals:** Trajectory divergence vs. baseline window, loop & stall rate, per-step tool-call health
4. **Composite:** Monitor the monitor — periodic human-labeled samples, treat proxy as one voice among four

---

## 8. Continuous Validation

**Principle:** Automated tests that run alongside the monitoring system, continuously validating that both the agent and its monitor behave correctly.

### Three-Tier Pipeline (from AgenticWire)

| Tier | Trigger | Pattern | Gate |
|------|---------|---------|------|
| **PR** | Every push | Tool-call regression + smoke simulation | Block merge on structural diff |
| **Nightly** | Scheduled | LLM-as-judge on golden dataset | Alert if pass rate drops >5 points |
| **Production** | Continuous | Canary + online eval | Roll back if error budget burns |

### Tools & Frameworks

| Tool | Function | Source |
|------|----------|--------|
| **Arthur AI Agentic Test** | Continuous evaluations, behavioral discovery, per-trace scoring | docs.arthur.ai/docs/test-guide |
| **Patronus AI** | Trajectory evaluation (every tool call, reasoning step, decision point) | patronus.ai |
| **Braintrust** | Human-in-the-loop calibration, automated agent evals | braintrust.dev |
| **AI Range** | 10 concurrent adversarial executors, 5-dimension scorecard, signed Evidence Pack | opticalabs.ai |
| **pytest-agentcontract** | Record/replay tool-call regression, sub-second CI runs | agenticwire.news |
| **Langfuse / OpenTelemetry** | Trace streaming for replay, aggregation, alerting | Various |
| **DeepEval** | Policy-as-code evaluation, 5-metric reporting | agent-trust.tech |

### Continuous Validation Patterns

**Simulation Testing (Pre-merge):**
- Run agent against stubbed APIs, sandboxed databases, LLM-driven user personas
- Explore behavior without touching production
- Score trajectory, not just final answer

**Regression Tool-Call Suites (Every PR):**
- Record known-good trajectory (tools, arguments, order)
- Fail CI when execution skeleton changes
- Replay committed cassettes offline, no API keys needed

**Online Evaluation (Production):**
- Score every incoming trace with LLM evaluator
- Golden dataset replayed on schedule
- Error budget-based promotion/rollback

**Continuous Adversarial Testing:**
- AI Range: 10 concurrent executors run adversarial scenarios against live system
- Tests agents, tools, retrieval, memory together
- Mapped to NIST AI RMF, 21 policy controls, 7 families

**Ambient Validation (ContinuousOS):**
- 24/7 background agents monitor event streams
- Automatic validation triggered on changes
- Escalate only for deviations

### Validation Metrics for Production

| Category | Specific Metric | Threshold Example |
|----------|-----------------|-------------------|
| Quality | Hallucination rate, task completion | <2% hallucination |
| Safety | Tool misuse count, boundary violations | 0 critical violations |
| Cost | Cost per successful task | <$X per task |
| Latency | p50, p95 response time | p95 < 5s |
| Reliability | Escalation rate, retry rate | <5% escalation |
| Drift | Behavioral variance, canary pass rate | Pass rate >95% |
| Recovery | Recovery rate from injected faults | >90% recovery |

---

## Cross-Cutting Principles

### 1. Test the Envelope, Not the Contents
Assert on boundaries (permissions, cost, tool schemas, state transitions), not on exact reasoning paths. The agent's internal behavior can vary; the envelope must hold.

### 2. Monitor the Monitor
Periodic human-labeled samples to calibrate automated monitors. Treat proxy success as one voice among four families, never the arbiter.

### 3. Adversarial ≠ Random
Human-authored attacks are significantly more effective than automated ones (2.5/10 bypass rate vs 1/10 for model-generated). Red teams must include human creativity.

### 4. Precision-Recall Tradeoff Is Inevitable
Full manifest → low FP (0.011) but low recall (0.105). Tight scope → high recall (0.977) but higher FP (0.082). Choose based on operational cost of misses vs false alarms.

### 5. Structural Features Beat Drift Metrics
Continuous drift measures (cosine similarity, embedding distance) fail to detect 87.2% of attacks. Structural features — unusual privilege accesses, secret reads followed by external calls — are what actually catch attacks.

### 6. Scoring During Run > Scoring at End
A monitor that flags at step 4 prevents 80% of harmful downstream actions. A monitor that flags at step 48 offers only forensic value. Step-level labeled benchmarks are essential.

### 7. Non-Determinism Requires Distribution Testing
Same input → different outputs. Fixed-output assertions break. Use: pass^k (all-runs pass), statistical comparison of behavioral distributions, policy constraints over golden datasets.

---

## Key Sources (Chronological)

1. **AgentChaos** — arxiv.org/pdf/2608.06790 (Aug 2026) — HTTP-level fault injection
2. **AgentGauntlet** — wpnews.pro/news/how-well-do-your-agents-fail (Aug 2026) — 4-injector chaos harness
3. **MonitoringBench** — arxiv.org/pdf/2605.09684v1 (May 2026) — 2,600+ attack trajectories
4. **SLEIGHT-Bench** — arxiv.org/pdf/2605.16626 (May 2026) — Evasion attack benchmark
5. **BigCodeBench-Sabotage** — emergentmind.com/topics/bigcodebench-sabotage (Feb 2026) — Covert behavior detection
6. **MOLE** — arxiv.org/pdf/2609.06966.pdf (Sep 2026) — Insider threat benchmark
7. **AgentDrift** — arxiv.org/pdf/2609.06972v1 (Sep 2026) — Step-level injection benchmark
8. **Reliable Weak-to-Strong Monitoring** — arxiv.org/html/2508.19461v1 (Aug 2025) — MRT workflow
9. **Async Control** — arxiv.org/pdf/2512.13526.pdf (Dec 2025) — Red-blue team games
10. **StepShield** — arxiv.org/pdf/2601.22136 (Jan 2026) — WHEN not WHETHER
11. **Drift-Bench** — arxiv.org/pdf/2602.02455.pdf (Feb 2026) — Cooperative breakdown taxonomy
12. **AgentCheck** — arxiv.org/html/2607.11098 (Jul 2026) — Reproduce-intervene-confirm
13. **Correctness Checking** — arxiv.org/abs/2509.20364 (Sep 2025) — Temporal assertions
14. **Beyond Component Testing** — arxiv.org/pdf/2607.29405v1 (Jul 2026) — Taxonomy of mismatches
15. **Agent-ToM** — arxiv.org/pdf/2605.24216v1 (May 2026) — Theory-of-mind monitoring
16. **AgentWorld** — arxiv.org/pdf/2608.24076 (Aug 2026) — Personality-aware reliability
17. **SkillGuard** — arxiv.org/html/2605.10990 (May 2026) — Contract-based drift detection
18. **Bench2Robust** — arxiv.org/abs/2608.11977 (Aug 2026) — Controlled error injection
19. **SPASM** — arxiv.org/html/2604.09212v1 (Apr 2026) — Persona stability simulation
20. **ChaosEater** — arxiv.org/html/2511.07865v1 (Nov 2025) — LLM-automated CE
21. **SwarmScore V2 Canary** — datatracker.ietf.org (Sep 2026) — Covert canary testing
22. **AI Agent Testing Guide** — qajobfit.com/resources/ai-agent-testing-complete-guide-2026 — Pyramid mapping
23. **RL-Obfuscation** — arxiv.org/pdf/2506.14261v2 (Jun 2025) — Evasion via RL fine-tuning
24. **LessWrong Monitor Scoring** — lesswrong.com/posts/uzar9BedKJQB3RuSr — F1/Precision/Recall benchmarks
