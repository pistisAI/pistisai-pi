# Pi 4-Pillar Agent Helper

A **standalone Pi ecosystem** for monitoring, scoring, and auto-steering any agent's focus using the **Pistisai 4-Pillar framework** (Aiman/Aigent/Aidration/Aimotions).

## Overview

- **Agent-agnostic**: The monitored agent name is configurable (`agent_name: pistisai` in `config.yaml`). No hardcoded identity.
- **4-Pillar Framework**: Every agent maps to four pillars:
  - **Aiman** (Hyperion / East) — Identity & focus presence
  - **Aigent** (Koios / North) — Tool execution & reasoning
  - **Aidration** (Krios / South) — Orchestration & continuity
  - **Aimotions** (Iapetos / West) — Personality & emotional core
- **Focus Score**: Aggregate 0–1 metric across pillars, with drift detection and auto-repair.
- **Inference**: Reuses existing **Bionic (LM Studio)** instance on `127.0.0.1:36093` — no new inference layer added.
- **Integration**: Later importable into pistisai as `pi_adapter.dart`.

## Quick Start

```bash
# 1. Configure agent name (default: pistisai)
cat config.yaml

# 2. Install Pi extensions
pi install npm:@bacnh85/pi-a2a
pi install npm:@agent-sh/computer-use-linux

# 3. Start the Pi 4-Pillar Helper
pi --provider llamacpp --model google_gemma-4-E4B-it \
  --mode rpc --extension ./extensions/pillar-helper.ts \
  --session-dir ./pi-sessions

# 4. Or run as systemd service
sudo cp systemd/pi-4pillar-helper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-4pillar-helper
```

## Tools Available (via `pi`)

- `pillar_status` — Show current 4-pillar focus state
- `compute_focus_score` — Calculate aggregate focus and detect drift
- `reset_focus` — Reset all pillar states to healthy

## Files

| File | Purpose |
|------|---------|
| `config.yaml` | Agent name, focus threshold, mesh topic, session directory |
| `extensions/pillar-helper.ts` | Pi extension: monitor, score, steer |
| `mesh/a2a-mesh.yaml` | A2A peer configuration |
| `systemd/pi-4pillar-helper.service` | Systemd unit for background operation |
| `focus_tracker.db` | SQLite DB (created on first run) |

## Architecture

```
Pi Extension (pillar-helper.ts)
  ├── FocusTracker (SQLite) — persists events per agent_name
  ├── A2AMeshClient — publishes pillar_state to mesh topic
  ├── computePillarScores — maps events → 4 pillars
  └── invokePiSubagent — auto-repair via pi --print
```

## Integration Path to Pistisai

The `pi_adapter.dart` in `pistisai-app/lib/services/providers/pi_adapter.dart` connects to this ecosystem via `llamacpp` provider pointing to Bionic's port `36093`. No changes to `pistisai-app` source required until integration.

## License

MIT
