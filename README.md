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

## Docs

- [Scoring Model](docs/SCORING.md) — how pillars are measured and weighted
- [Architecture](docs/ARCHITECTURE.md) — components, data flow, event sourcing
- [Research](docs/RESEARCH.md) — 70+ sources on drift detection, self-healing, evaluation
- [Telemetry](docs/TELEMETRY_RESEARCH.md) — extracting real metrics from Hermes session logs
- [Embedding Analysis](docs/EMBEDDING_ANALYSIS.md) — cosine similarity, JSD, PSI for persona drift (RTX 4070)
- [Self-Monitoring](docs/SELF_MONITORING.md) — metacognition prompts, calibration, critic agents, heartbeats
