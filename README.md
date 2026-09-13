# Pi 4-Pillar Agent Helper

Monitors, scores, and steers any agent using the 4-pillar framework.

**Aiman** (identity) · **Aigent** (capability) · **Aidration** (order) · **Aimotions** (character)

---

## Quick Start

```bash
./setup.sh
./run.sh
```

## Tools

| Tool | Purpose |
|------|---------|
| `compute_focus_score` | Returns current 4-pillar health score |
| `get_pillar_status` | Detailed per-pillar breakdown |
| `run_self_check` | Triggers introspection + Reflexion loop |
| `get_repair_log` | History of triggered repairs |

## Config

Edit `config.yaml` to set polling cadence, drift thresholds, and repair policies.

## Documentation

### Core
- [Scoring Model](docs/SCORING.md) — how pillars are measured and weighted
- [Architecture](docs/ARCHITECTURE.md) — components, data flow, event sourcing
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md) — 6-month phased build plan (L1→L5)

### Research
- [Research Compendium](docs/RESEARCH.md) — 70+ sources on drift detection, self-healing, evaluation
- [Telemetry](docs/TELEMETRY_RESEARCH.md) — extracting real metrics from Hermes session logs
- [Embedding Analysis](docs/EMBEDDING_ANALYSIS.md) — cosine similarity, JSD, PSI for persona drift
- [Self-Monitoring](docs/SELF_MONITORING.md) — metacognition prompts, calibration, critic agents
- [Statistical Process Control](docs/STATISTICAL_PROCESS_CONTROL.md) — CUSUM, EWMA, Shewhart, BOCD
- [Evaluation Frameworks](docs/EVALUATION_FRAMEWORKS.md) — LLM-as-judge, trajectory scoring, pass^k
- [Repair Taxonomy](docs/REPAIR_TAXONOMY.md) — 10-category self-healing ladder
- [Memory Systems](docs/MEMORY_SYSTEMS.md) — episodic/semantic/procedural, consolidation, corruption
- [Multi-Agent Coordination](docs/MULTI_AGENT_COORDINATION.md) — orchestrator-worker, A2A, consensus
- [Safety Guardrails](docs/SAFETY_GUARDRAILS.md) — sandboxing, circuit breakers, constitutional AI
- [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md) — systemd, health checks, alerting
- [Adaptive Learning](docs/ADAPTIVE_LEARNING.md) — repair outcome tracking, threshold auto-tuning
- [Human-in-the-Loop](docs/HUMAN_IN_THE_LOOP.md) — dashboards, authority delegation, trust
- [Monitoring Failure modes](docs/MONITORING_FAILURE_MODES.md) — 40+ failure patterns, Goodhart's Law
- [Cost & Economics](docs/COST_ECONOMICS.md) — pricing, model routing, caching, ROI
- [Identity Persistence](docs/IDENTITY_PERSISTENCE.md) — persona anchors, model migration, narrative identity
- [Testing & Verification](docs/TESTING_VERIFICATION.md) — chaos engineering, fault injection, red teaming
- [Event Streaming](docs/EVENT_STREAMING.md) — CDC, message queues, CEP, time-series DBs
