# Pi 4-Pillar Agent Helper

Monitors, scores, and steers any agent using the 4-pillar framework.

**Aiman** (identity) · **Aigent** (capability) · **Aidration** (order) · **Aimotions** (character)

---

## Quick Start

```bash
./setup.sh      # first time only — sets agent name, installs deps, builds
./run.sh        # start the helper
```

## Tools

| Tool | What it does |
|------|-------------|
| `pillar_status` | Show current 4-pillar focus state |
| `compute_focus_score` | Calculate focus score, detect drift |
| `reset_focus` | Reset all pillars to healthy |
| `watcher_start` / `watcher_stop` / `watcher_status` | Manage the background watchdog |

## Config

Edit `config.yaml` to set your agent name, focus threshold, and mesh topic.

## Docs

- [Scoring Model](docs/SCORING.md) — how pillars are scored, metrics, thresholds
- [Research](docs/RESEARCH.md) — academic papers, industry references, A2A protocols
- [Architecture](docs/ARCHITECTURE.md) — system design, event sourcing, mesh patterns
