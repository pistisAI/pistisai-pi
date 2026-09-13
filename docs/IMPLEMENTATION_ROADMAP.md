# pistisai-pi: Agent Monitoring System Implementation Roadmap

> **Project**: pistisai-pi — comprehensive monitoring for the Zoid/Hermes agent ecosystem
> **Date**: September 13, 2026
> **Horizon**: 6 months, 5 phases
> **Stack**: TypeScript · OpenTelemetry · SQLite · Electron (desktop) · A2A mesh events
> **Source base**: 18 research docs + 25+ external sources (listed inline)

---

## Part 1 — Maturity Model for Agent Observability

Five levels synthesized from the industry (AWS Well-Architected Agentic AI Lens, WAF++, AgentOps, LogicMonitor, Siddhant Khare's Agentic Engineering Guide). Each level defines what the monitoring system can actually *do* at that stage, not just what it collects.

| Level | Name | What It Looks Like in pistisai-pi |
|-------|------|-----------------------------------|
| **L1** | **Foundational** | Structured logging of all agent actions to SQLite. Basic telemetry: latency, token counts, error rates. No correlation across sessions. Manual incident review. "Is the agent alive?" |
| **L2** | **Observable** | OpenTelemetry traces spanning every tool call, reasoning step, and session. Dashboards showing per-pillar scores (identity/capability/order/character). Behavioral baselines established. Traceable history. "What did the agent do and why?" |
| **L3** | **Detecting** | SPC-based anomaly detection (CUSUM, EWMA, Western Electric Rules) on all four pillars. Automated alerting with tiered channels (dashboard → chat → page). Golden dataset evaluation with pass^k consistency scoring. Incident postmortem workflow. "Is the agent degrading and where?" |
| **L4** | **Repairing** | Closed-loop repair: automated diagnosis → ranked repair selection → outcome tracking → repair effectiveness scoring. Adaptive thresholds that self-tune via false-positive/negative feedback. Pattern mining on repair logs. "Can the agent fix itself and learn from fixes?" |
| **L5** | **Self-Healing** | Predictive KPI forecasting flags degradation before thresholds. Causal failure attribution (root-cause vs symptom). RLHF-learned alert prioritization. Continuous evaluation pipeline feeds drift signals back into agent configuration and tool design. "Can the agent prevent its own failures?" |

**Sources**: AWS Well-Architected Agentic AI Lens (agentops05.html), WAF++ Maturity Model (waf2p.dev), AgentOps Maturity Model (agentopsplatform.com), LogicMonitor IT Ops Maturity (logicmonitor.com), Siddhant Khare's Agentic Engineering Guide Ch.22 (agents.siddhantkhare.com).

---

## Part 2 — Incremental Build Strategy (What First)

Based on research showing maximum value comes from structured observability before automated response. The "monitoring-first, repair-later" ordering.

### Priority Sequence (ROI-ranked)

1. **Structured logging + trace capture** (Month 1) — everything downstream depends on this. If you can't see it, you can't measure it. Single biggest ROI per engineering hour.
2. **Per-pillar scoring** (Month 2) — converts raw telemetry into the 4-pillar health model. Without scoring, you have data without meaning.
3. **SPC anomaly detection** (Month 2–3) — converts scores into alerts. This is where you answer "is the agent OK?" automatically.
4. **Golden dataset + evaluation pipeline** (Month 3) — ground truth for whether the agent is actually succeeding, not just active.
5. **Alert routing + HITL interfaces** (Month 3–4) — connects detection to human action. Prevents alert fatigue.
6. **Repair outcome tracking** (Month 4) — begins closing the loop between repair attempts and actual effectiveness.
7. **Adaptive thresholds + pattern mining** (Month 5) — learning from accumulated data.
8. **Causal inference + predictive forecasting** (Month 5–6) — full self-healing capability.

**Key insight from research**: The gap between L2 and L3 is where most value is captured (Khare). Most teams at L2/L3 in 2026; the gap between L3→L4 is where reliability compounds (AWS Lens). The monitoring system must be useful *before* automation is added — automated wrong actions are worse than manual right ones.

**Sources**: Khare Agentic Engineering Ch.22, AWS Agentic AI Lens, "AgentOps Is Not MLOps" (towardsdatascience.com), Raindrop Workshop debugging research (raindrop-workshop).

---

## Part 3 — Integration Patterns: Connecting Monitoring → Scoring → Repair → Learning

### Architecture Overview

```
                    ┌──────────────────────────────────────────────────┐
                    │              A2A MESH (port 9910)               │
                    │   Event bus: typed messages between subsystems   │
                    └──────────────────────────────────────────────────┘
                                          │
       ┌──────────────────────────────────┼──────────────────────────────┐
       │                                  │                              │
       ▼                                  ▼                              ▼
┌──────────────┐                ┌──────────────────┐             ┌──────────────┐
│  MONITORING  │──scores──────▶│     SCORING      │──alerts────▶│   REPAIR     │
│  Subsystem   │                │     Engine       │             │   Subsystem  │
│              │                │                  │             │              │
│ - OTel trace │                │ - 4-pillar calc  │             │ - Diagnosis  │
│ - Self-report│                │ - SPC detection  │             │ - Ranked fix │
│ - Health poll│                │ - pass^k eval    │             │ - Execution  │
└──────────────┘                └──────────────────┘             └──────┬───────┘
       │                                    │                           │
       │                                    │                           ▼
       │                                    │                  ┌──────────────────┐
       │                                    │                  │    LEARNING      │
       │                                    │                  │    Subsystem     │
       │                                    │                  │                  │
       │                                    │                  │ - Repair outcomes│
       │                                    │                  │ - Threshold adapt│
       │                                    │                  │ - Pattern mining │
       │                                    │                  │ - Causal graph   │
       │                                    │                  └────────┬─────────┘
       │                                    │                           │
       └────────────────────────────────────┴───────────────────────────┘
                                          │
                                          ▼
                              ┌──────────────────────┐
                              │   FEEDBACK EVENTS    │
                              │  (back to Scoring &  │
                              │   Monitoring)        │
                              └──────────────────────┘
```

### Event-Driven Integration (A2A Mesh)

Each subsystem communicates via typed events on the mesh. This follows the industry convergence on event-driven architecture for agent systems (Zylos Research 2026, LangGraph 1.0, AutoGen v0.4).

**Event types**:
- `monitoring.health_snapshot` — periodic agent health state (structured JSON per schema)
- `scoring.pillar_update` — new pillar score + SPC signal level
- `scoring.alert_fired` — SPC detector triggered, includes detector name and confidence
- `repair.proposed` — ranked repair actions with predicted effectiveness
- `repair.executed` — repair attempted, includes outcome
- `learning.threshold_adjusted` — adaptive threshold updated
- `learning.pattern_discovered` — new recurring failure mode identified
- `learning.repair_ranked` — repair success rates updated

### Data Flow Contract

```typescript
// Event envelope (A2A mesh)
interface PistisaiEvent {
  id: string;                    // UUID v7
  timestamp: string;             // ISO 8601
  source: "monitoring" | "scoring" | "repair" | "learning";
  type: string;                  // event type name
  agentId: string;               // target agent (Zoid/Hermes/etc)
  sessionId?: string;            // session-scoped if applicable
  traceContext: OTelContext;     // OpenTelemetry trace correlation
  payload: unknown;              // typed per event type
  schemaVersion: "1.0.0";        // for forward compatibility
}

// Health snapshot payload (from agent self-reporting)
interface HealthSnapshot {
  pid: number;
  lastHeartbeat: string;
  lastProgressEvent: string;
  iterationCount: number;
  progressMetric: number;
  recentActions: string[];       // last N action hashes
  pillarSignals: {
    identity: number;            // 0.0–1.0
    capability: number;
    order: number;
    character: number;
  };
  confidence: number;            // agent self-assessed
  grounding: number;             // evidence support level
}
```

### Integration Patterns from Research

**Nexus-Alive Pattern** (Adverant): Five specialized agent teams (Discovery, Analysis, Healing, Consensus, Learning) coordinate through a shared knowledge graph. For pistisai-pi, this maps to: Monitoring=Discovery+Analysis, Scoring=Consensus, Repair=Healing, Learning=Learning.

**VITAL Pattern** (MARIA OS): 4-layer biological model — vital signs, compensatory response, recovery orchestration, recursive improvement. Maps directly to pistisai-pi's monitoring→scoring→repair→learning pipeline.

**Event Sourcing**: Every state change is an immutable event. The event log IS the audit trail. Subsystems can replay events to rebuild state (Zylos EDA research 2026).

**Sources**: Zylos Research "Event-Driven Architecture for AI Agent Systems" (2026-03-02), Adverant Nexus-Alive (adverant.ai), MARIA OS VITAL (os.maria-code.ai), Google A2A Protocol (a2a-mesh-research.md local doc).

---

## Part 4 — Technology Stack Recommendations

### For TypeScript / Desktop Deployment

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Language** | TypeScript 5.x | Type safety across subsystems; Zod schemas enforce contracts at compile + runtime time |
| **Desktop shell** | Electron or Tauri | Tauri preferred for Rust-backed security, lower resource use; Electron for broader extension ecosystem. Either way, the UI runs as a local desktop app with no cloud dependency |
| **Telemetry** | OpenTelemetry JS SDK (v1.30+) | Industry-standard trace/metrics/logs. Vendor-neutral. OTLP export for future cloud integration |
| **Local storage** | SQLite (better-sqlite3 or libsql) | Embedded, zero-config, single-file. FTS5 for full-text search across logs. WAL mode for concurrent reads. Survives restarts |
| **State machine** | XState or Mastra TS | Durable state machines for repair workflows. Mastra provides native OTel + SQLite checkpoints |
| **Schema validation** | Zod v3 | Runtime validation of all event payloads, health snapshots, repair proposals. Generates TypeScript types from schemas |
| **SPC/Stats** | Custom (numpy-equivalent in TS) | Simple-statistics or custom CUSUM/EWMA implementations. No heavy deps needed — these are O(1) algorithms |
| **Event bus** | EventEmitter3 (local) + A2A mesh (inter-agent) | Local pub/sub for intra-process; A2A protocol for cross-agent on port 9910 |
| **Visualization** | D3.js or Recharts | Sparklines, time-series charts, threshold bands. Lightweight, no framework lock-in |
| **LLM judge** | Local model (Ollama/LM Studio) or API | For evaluation scoring. Local preferred for privacy; API for accuracy. Configurable |
| **Testing** | Vitest + Playwright | Unit tests for SPC algorithms; e2e for dashboard flows |

### Why Not the Heavy Stuff?

- **No Kafka/Pulsar** for desktop: overkill for single-machine. A2A mesh events + SQLite WAL handle local throughput.
- **No ClickHouse/Elasticsearch**: SQLite FTS5 handles thousands of traces. Only upgrade if you outgrow single-machine (months 5–6+).
- **No Langfuse/LangSmith dependency**: These are SaaS-coupled. Use OTel-native patterns; export to Langfuse later if needed.
- **No GPU required**: All learning algorithms (EWMA, CUSUM, Bradley-Terry reward model, DTD threshold adaptation) are O(1) per-point, CPU-only.

**Sources**: Inkeep AI Agent Monitoring with SigNoz (signoz.io), Mastra TS Durable State Machines (dailyaiworld.com), Raindrop Workshop local debugger (teqvolt.com), "Installing OpenTelemetry Won't Close Your AI Agent's Feedback Loop" (dev.to/gyu07), local research docs (spc_research_summary.md, a2a-mesh-research.md).

---

## Part 5 — Common Integration Pitfalls

### Pitfall 1: Per-Agent Reliability Does Not Compose

> "Each agent is 95% reliable, so the system is roughly fine" is exactly wrong. Failures live in the handoffs and coordination — the joints, not the parts.

**What breaks**: A pipeline of individually-strong agents fails systematically because errors propagate through coupling structure. Every agent reports success; every interface returns well-formed data; the system is confidently, traceably wrong.

**Fix**: Add explicit verification edges at subsystem boundaries. Pass uncertainty forward instead of laundering it into clean prose. Never let a subsystem's summary erase its own caveats. Track failure-propagation depth as a first-class metric.

### Pitfall 2: The Monitoring Stack Fails by Staying Green

Inherited signals from traditional DevOps (uptime, latency, error rates) report healthy on runs that actually failed. Agents don't crash; they reason, and the reasoning is the problem.

**What breaks**: No stack trace, no log line saying "error," no code change to roll back. The agent did everything its instructions told it to do — and the instructions were wrong.

**Fix**: Monitor the autonomy layer (behavioral), not just the infrastructure layer. Track: goal drift, loop detection, token waste ratio, chain length, success rate. These three metrics catch 80% of failure modes that uptime SLOs miss entirely.

### Pitfall 3: Retry Storms (Level-Triggered, No Cap)

An agent fails 69 out of 70 attempts on one ticket. Aggregate success rate barely moves. Each iteration is a paid model invocation.

**What breaks**: Level-triggering without a cap becomes an unbounded loop. The single most expensive failure mode, invisible on dashboards tracking only success rate.

**Fix**: Hard caps on fan-out factor and runtime limits (not prompt requests the model can ignore). A single shared budget that children draw down. A kill switch when joint spend crosses a ceiling — independent of whether the task "feels" almost done.

### Pitfall 4: Alert Fatigue Depletes Trust

Each low-quality page doesn't just waste its own minute — it taxes EVERY future page's credibility. A paging system is a trust system, and trust depletes faster than it refills.

**What breaks**: 62% of alerts are ignored. Knowledge workers interrupted every 2–3 minutes lose ~23 minutes of focus after each interruption.

**Fix**: Three operational categories before routing: Expected Variance (no human needed), Exception Candidates (auto-triage), Genuine Escalations (human decision required). Every alert must answer: WHAT is broken, WHO acts, WHAT do they do first, WHAT if ignored. Alerts failing any question are demoted.

### Pitfall 5: Feedback Loops Without Damping

Adaptive thresholds that react too aggressively to their own adjustments. Repair actions that create new anomalies that trigger more repairs.

**What breaks**: The monitoring system becomes the source of instability. Oscillation between over- and under-correction.

**Fix**: Hysteresis in all threshold adjustments (different trigger/clear conditions). DTD-style verification windows (run 3 models in parallel, compare cumulative performance). Rate-limit threshold changes. Shadow-mode new repairs before live execution.

### Pitfall 6: Binary Pass/Fail Monitoring

Per-agent logs show local success while the system fails at the seams. No stack trace across a message boundary. The order of distributed events must be reconstructed.

**What breaks**: You cannot debug what you cannot see across agents. Every subsystem reports healthy; the integrated system is broken.

**Fix**: A correlated trace that spans every subsystem and handoff. Joint cost attributed per run. Checkpoints so a corrupted run resumes rather than restarts. Event sourcing as the audit trail.

**Sources**: "Multi-Agent Failure Modes" (menuagentic.com), "AgentOps Is Not MLOps" (towardsdatascience.com), "Agent Observability: The Failure Modes Your Dashboard Misses" (codewithseb.com), "What Your Agent Harness Is Missing" (fiddler.ai), HITL Kit research (local pistisai-pi-hitl-research.md), "Your AI Agent Is Lying to You" (aidevdayindia.org).

---

## Part 6 — Meta-Metrics: Measuring the Monitoring System Itself

The monitoring system is itself a system that can fail. These meta-metrics tell you whether your monitoring is effective.

### Coverage Metrics

| Meta-Metric | Definition | Target |
|-------------|-----------|--------|
| **Signal coverage** | % of agent actions that produce a telemetry event | >95% |
| **Pillar coverage** | % of 4 pillars with active SPC monitoring | 100% (4/4) |
| **Trace completeness** | % of sessions with end-to-end trace (no missing spans) | >90% |
| **Golden set coverage** | % of failure classes represented in golden dataset | >80% of known classes |
| **Alert coverage** | % of genuine incidents that triggered an alert | >95% (recall) |

### Quality Metrics

| Meta-Metric | Definition | Target |
|-------------|-----------|--------|
| **False positive rate** | Alerts fired ÷ alerts that were genuine | <10% |
| **False negative rate** | Genuine incidents missed ÷ total genuine incidents | <5% |
| **Alert utility rate** | Alerts acted upon ÷ total alerts | >50% |
| **Mean time to detect (MTTD)** | Incident start → first alert fired | <5 minutes |
| **Mean time to repair (MTTR)** | Incident start → agent healthy again | <30 minutes (L4+) |
| **Mean time between failures (MTBF)** | Average time between incidents | Trending up |
| **Detection chain minutes** | Published metric; track improvement over time | Decreasing trend |

### Learning Effectiveness Metrics

| Meta-Metric | Definition | Target |
|-------------|-----------|--------|
| **Threshold adaptation rate** | How quickly thresholds converge to stable values | <2 weeks after deploy |
| **Pattern discovery rate** | New failure patterns identified per month | >0 (continuous) |
| **Repair success rate** | Repairs that fully resolve without recurrence | >70% |
| **Recurrence rate** | % of incidents that repeat within 7 days | <15% |
| **Graduation rate** | Checkpoint categories retired (autonomy earned) | Trending up |
| **Evaluation drift** | Shift in judge score distribution over time | <0.2 mean shift |

### The Monitoring Health Dashboard

A dashboard *for the monitoring system itself* should show:
- Big number: **Monitoring Effectiveness Score** (composite of coverage + quality + learning)
- Sparkline: MTTD trend (7/30/90-day)
- Sparkline: False positive rate trend
- Alert: "Monitoring system itself is degraded" if any meta-metric breaches threshold

**Sources**: "Everything You Need To Know About Agent Observability" (sean-weldon.com), "Your AI Agent Is Lying to You" (aidevdayindia.org), "Agent Observability: What to Monitor Beyond Uptime and Latency" (omnithium.ai), AWS Agentic AI Lens, local HITL research (pistisai-pi-hitl-research.md).

---

## Part 7 — Documentation Architecture for 18+ Research Docs

### The Karpathy LLM Wiki Pattern (Recommended)

Three-layer architecture for organizing research into a coherent, agent-consumable knowledge base:

```
pistisai-pi/
├── raw/                          # Immutable source documents (the 18+ research docs)
│   ├── agent-evaluation-frameworks-research.md
│   ├── adaptive-learning-feedback-loops-research.md
│   ├── spc_research_summary.md
│   ├── agent_memory_systems_research_summary.md
│   ├── agent-identity-persistence-research.md
│   ├── a2a-mesh-research.md
│   ├── pistisai-pi-hitl-research.md
│   ├── pistisai-pi-monitoring-failure-modes.md
│   ├── pistisai-agent-safety-research.md
│   ├── pistisai-pi-research.md
│   ├── pistisai-pi-research-findings.md
│   └── ... (remaining docs)
│
├── wiki/                         # LLM-generated, type-organized knowledge base
│   ├── index.md                  # Master catalog — updated on every ingest
│   │
│   ├── concepts/                 # Concept pages (the "what")
│   │   ├── spc-detectors.md      # CUSUM, EWMA, Shewhart, BOCD, PELT
│   │   ├── four-pillar-model.md  # Identity, Capability, Order, Character
│   │   ├── pass-k-metric.md      # Consistency scoring
│   │   ├── hitl-patterns.md      # HITL, HOTL, HOOTL, authority delegation
│   │   ├── adaptive-thresholds.md # DTD, EWMA-sigma, feedback-driven tuning
│   │   ├── causal-inference.md   # PCI, Shapley attribution
│   │   ├── trust-calibration.md  # Over/under-reliance, graduated autonomy
│   │   └── self-healing-loop.md  # Detection → diagnosis → repair → learning
│   │
│   ├── entities/                 # Entity pages (the "who")
│   │   ├── zoid-agent.md         # The monitored agent
│   │   ├── pistisai-pi.md        # The monitoring system itself
│   │   ├── hermes-agent.md       # Parent agent framework
│   │   └── human-operator.md     # HITL roles and responsibilities
│   │
│   ├── procedures/               # Procedure pages (the "how")
│   │   ├── incident-postmortem.md
│   │   ├── golden-set-maintenance.md
│   │   ├── threshold-tuning.md
│   │   ├── repair-execution.md
│   │   ├── alert-routing.md
│   │   └── dashboard-ux.md
│   │
│   ├── references/               # Reference pages (the "specs")
│   │   ├── spc-parameters.md     # k, h, λ, L values and tuning tables
│   │   ├── evaluation-benchmarks.md # SWE-bench, τ-bench, WebArena, etc.
│   │   ├── failure-taxonomy.md   # 5-category + 6-class failure models
│   │   ├── alert-thresholds.md   # P1–P4 routing matrix
│   │   └── data-schemas.md       # Event envelope, health snapshot schemas
│   │
│   ├── sources/                  # Source summaries (one per raw doc)
│   │   ├── agent-evaluation-frameworks.md
│   │   ├── adaptive-learning-feedback-loops.md
│   │   ├── spc-methods.md
│   │   └── ... (one per raw doc)
│   │
│   └── comparisons/              # Comparison pages
│       ├── langfuse-vs-langsmith.md
│       ├── cusum-vs-ewma.md
│       └── hitl-vs-hotl.md
│
├── CLAUDE.md                     # Schema + routing rules for the KB
└── docs/                         # Implementation docs (this roadmap, specs, etc.)
    ├── implementation-roadmap.md  # ← THIS FILE
    ├── architecture.md
    ├── data-model.md
    └── api-reference.md
```

### Three Operations (from Karpathy LLM Wiki)

1. **Ingest**: Process new raw docs → generate/update wiki pages → update index.md
2. **Query**: Ask questions → navigate via index.md → drill into relevant pages
3. **Lint**: Health checks → detect broken links, stale pages, contradictions → flag for update

### Design Rules

- **Index files contain pointers, not content**. If you're putting explanation in the index, it belongs in a separate file.
- **Reference format should be greppable**. Consistent headings, predictable structure, machine-parseable tables.
- **Every page states what it does NOT cover**. Prevents fruitless searching.
- **KnowledgeRefs are relative paths**. The agent reads the pointed-to index, then drills down.
- **Ontological organization**: Group by essential properties (what the thing IS), tag/filter by accidental properties (which phase it belongs to, which subsystem it feeds).

### Document Type Taxonomy (Diataxis + Research Extension)

For the 18+ raw docs, classify each by type:
- **Research synthesis** (multi-source analysis) → goes to `wiki/concepts/` or `wiki/references/`
- **Implementation guide** (how-to) → goes to `wiki/procedures/`
- **Benchmark/study** (data) → goes to `wiki/references/`
- **Pattern library** (reusable solutions) → goes to `wiki/concepts/`
- **Failure taxonomy** (classification) → goes to `wiki/references/`

**Sources**: Karpathy LLM Wiki pattern (blog.starmorph.com), "Kill the Wiki: Managing Knowledge at Scale" (reliabilitywhisperer.substack.com), Knowledge Base Design (lab.pollack.ai), Knowledge Architecture (lobehub.com), Diataxis framework (Daniele Procida via lab.pollack.ai).

---

## Part 8 — The 6-Month Phased Build Plan for pistisai-pi

### Phase 1: Foundation (Month 1) — L1 → L2

**Goal**: Structured observability. Every agent action is captured, queryable, and correlated.

**Deliverables**:
- [ ] OpenTelemetry JS SDK integrated into agent runtime
- [ ] SQLite schema for traces, spans, events (WAL mode)
- [ ] Health snapshot schema (Zod) + agent self-reporting contract
- [ ] A2A mesh event bus (local EventEmitter3 + port 9910 listener)
- [ ] Basic dashboard: raw trace viewer + health snapshot display
- [ ] Documentation: ingest all 18 raw docs into `raw/`, generate initial `wiki/index.md`

**Key metrics**: Signal coverage >80%, trace completeness >90%

**Risks**: Agent runtime may need modification to emit OTel spans. Mitigation: start with passive log parsing, migrate to active instrumentation.

### Phase 2: Scoring & Detection (Month 2) — L2 → L3

**Goal**: Convert telemetry into pillar scores and automated anomaly detection.

**Deliverables**:
- [ ] 4-pillar scoring engine (identity, capability, order, character)
- [ ] SPC detectors: CUSUM + EWMA + Western Electric Rules (TypeScript, zero-dep)
- [ ] Ensemble voting logic (≥2 detectors = critical, 1 = degraded)
- [ ] Pillar dashboard: sparklines, threshold bands, stacked area charts
- [ ] Alert routing: dashboard → chat → page (P1–P4 tiers)
- [ ] Documentation: populate `wiki/concepts/spc-detectors.md`, `wiki/procedures/threshold-tuning.md`

**Key metrics**: Pillar scores computed for 100% of sessions, SPC false positive rate <15% (initial)

**Risks**: Warmup period needed for SPC baselines. Mitigation: use first 50 data points for warmup, show "warming up" state in UI.

### Phase 3: Evaluation & HITL (Month 3) — L3 solid

**Goal**: Ground-truth evaluation and human-in-the-loop interfaces.

**Deliverables**:
- [ ] Golden dataset: 150–400 test cases (40% happy, 30% edge, 15% adversarial, 15% regression)
- [ ] Three-tier evaluation pipeline (smoke → regression → long-tail)
- [ ] LLM-as-judge with bias mitigations (position shuffle, ensemble, abstention)
- [ ] pass^k consistency scoring (k=5 for nightly, k=8 for weekly)
- [ ] HITL dashboard: approval cards, autonomy dials, threshold sliders
- [ ] Incident postmortem template + workflow
- [ ] Documentation: `wiki/procedures/golden-set-maintenance.md`, `wiki/procedures/incident-postmortem.md`

**Key metrics**: Golden set pass@1 >90%, pass^5 >70%, HITL override rate tracked

**Risks**: LLM judge stochastic instability. Mitigation: run 11+ trials for majority vote, temperature=0, separate judge model.

### Phase 4: Repair Loop (Month 4) — L3 → L4

**Goal**: Closed-loop repair with outcome tracking.

**Deliverables**:
- [ ] Repair proposal engine: rank repairs by historical success rate (Wilson score)
- [ ] Repair execution: shadow mode → live execution with rollback
- [ ] Repair outcome tracker: immediate success, time-to-recovery, regression, recurrence
- [ ] Adaptive thresholds: DTD algorithm with FP/FN feedback
- [ ] Pattern mining: log template extraction + sequence mining on repair logs
- [ ] Documentation: `wiki/procedures/repair-execution.md`, `wiki/concepts/adaptive-thresholds.md`

**Key metrics**: Repair success rate >60%, recurrence rate <20%, threshold convergence <2 weeks

**Risks**: Repair actions may cause regressions. Mitigation: shadow validation, human approval for high-risk repairs, automatic rollback on regression detection.

### Phase 5: Learning & Prediction (Month 5) — L4 → L5

**Goal**: The monitoring system learns from its own data.

**Deliverables**:
- [ ] Causal failure attribution: Performance Causal Inversion + Shapley values
- [ ] RLHF-learned alert prioritization: Bradley-Terry reward model from operator feedback
- [ ] Predictive KPI forecasting: flag degradation before thresholds
- [ ] Failure mode taxonomy: auto-mined from repair logs
- [ ] Monitoring health dashboard: meta-metrics for the monitoring system itself
- [ ] Documentation: `wiki/concepts/causal-inference.md`, `wiki/concepts/self-healing-loop.md`

**Key metrics**: Alert utility rate >50%, MTTD <5 min, pattern discovery rate >0/month, monitoring effectiveness score >80/100

**Risks**: Causal inference requires sufficient data volume. Mitigation: start with correlation-based, migrate to causal after 100+ incidents.

### Phase 6: Hardening & Autonomy (Month 6) — L5 solid

**Goal**: Full self-healing with graduated autonomy.

**Deliverables**:
- [ ] Graduated autonomy: per-skill autonomy tiers (L0–L3) earned via evidence
- [ ] Predictive remediation: act before threshold breach
- [ ] Full documentation wiki: all 18+ raw docs synthesized into `wiki/`
- [ ] Integration tests: end-to-end pipeline tests (monitoring → scoring → repair → learning)
- [ ] Performance optimization: SQLite query optimization, trace sampling for success paths
- [ ] Release: v1.0 of pistisai-pi monitoring system

**Key metrics**: All meta-metrics at target, monitoring effectiveness score >85/100, zero critical incidents undetected

---

## Appendix A: Source Index

### Local Research Docs (18+)
1. `pistisai-pi-research.md` — Core project research
2. `pistisai-pi-research-findings.md` — Research findings synthesis
3. `pistisai-agent-safety-research.md` — Safety frameworks
4. `pistisai-pi-hitl-research.md` — HITL patterns, dashboards, alerting, trust calibration
5. `pistisai-pi-monitoring-failure-modes.md` — Failure mode taxonomy
6. `pistisai-pi/agent-self-monitoring-research.md` — Self-reporting, metacognition
7. `agent-evaluation-frameworks-research.md` — Golden datasets, LLM-as-judge, pass^k
8. `adaptive-learning-feedback-loops-research.md` — RLHF for alerts, DTD, pattern mining, causal inference
9. `spc_research_summary.md` — CUSUM, EWMA, Shewhart, BOCD, PELT implementations
10. `agent_memory_systems_research_summary.md` — Memory architectures, consolidation, retrieval
11. `agent-identity-persistence-research.md` — Identity anchors, persona persistence, model migration
12. `a2a-mesh-research.md` — A2A protocol, event mesh, pub/sub topologies

### External Sources (25+)
- AWS Well-Architected Agentic AI Lens — Observability maturity levels
- WAF++ Documentation — Agentic Maturity Model (5 levels)
- AgentOps Platform — Maturity model, AgentOps definition
- LogicMonitor — Enterprise Agentic AI Maturity Roadmap (6 levels)
- Siddhant Khare's Agentic Engineering Guide Ch.22 — Team adoption model
- Zylos Research 2026-03-02 — Event-Driven Architecture for AI Agent Systems
- Zylos Research 2026-03-07 — AI Agent Observability Health Monitoring
- Adverant Nexus-Alive — Multi-model consensus self-healing architecture
- MARIA OS VITAL — Database-native decision intelligence for agentic orgs
- arXiv 2607.28802 — Model or Harness? Agent failure taxonomy
- arXiv 2511.09953 — DTD: Dynamic Threshold Determination
- arXiv 2509.00115 — AMDM: Multi-dimensional adaptive monitoring
- arXiv 2509.08682 — Performance Causal Inversion
- arXiv 2608.05906 — MERIT: Dual-polarity memory for repair
- arXiv 2607.20005 — Safe Remediation: Risk-constrained intervention
- arXiv 2605.30628 — ErrorAtlas: Failure clustering
- arXiv 2607.08529 — Log-Insight: Neuro-symbolic log analysis
- arXiv 2609.01616 — Incident Memory: Sequential pattern mining
- arXiv 2603.29848 — AgentFixer: Parsing error patterns
- Inkeep + SigNoz — TypeScript agent monitoring with OTel + ClickHouse
- Mastra TS — Durable state machines with SQLite + OTel
- Raindrop Workshop — Local AI agent debugger pattern
- Confident AI — Agent observability quality loop
- Galileo — Enterprise agent observability
- "AgentOps Is Not MLOps" (towardsdatascience.com) — What breaks in monitoring stacks
- "Multi-Agent Failure Modes" (menuagentic.com) — Error propagation
- "Your AI Agent Is Lying to You" (aidevdayindia.org) — 2026 observability fix
- Karpathy LLM Wiki pattern (blog.starmorph.com) — KB architecture
- "Kill the Wiki" (reliabilitywhisperer.substack.com) — Knowledge management at scale
- Knowledge Base Design (lab.pollack.ai) — Agent-consumption weighting
- HITL Kit (hitlkit.dev) — React primitives for agent oversight
- OrthoLoop patient monitoring pattern — Alarm Fatigue Index
- Plover (arxiv.org/html/2607.15193) — Plan-centric GUI agent repair

---

*This roadmap is a living document. Update after each phase completion with actual metrics, lessons learned, and adjusted timelines for subsequent phases.*
