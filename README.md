# Pi 4-Pillar Agent Helper — Ecosystem

Standalone Pi extension + watchdog for monitoring and steering the 4 PistisAI pillars (Aiman, Aigent, Aidration, Aimotions) for agent focus management.

## Status: ✅ Core Workflow Verified

- **Watchdog**: Detects drift (Focus 0.38 < 0.5 threshold) and triggers repair directives
- **Extension Tools**: All 10 tools verified working via mock harness
- **Self-Management**: watcher_start/stop/status working
- **Persistence**: JSON file (focus_tracker.json) working
- **Docs**: 19 files, 11130 lines (architecture, research, roadmap, scoring)

## Architecture

```
agent-state.json → watchdog.ts → FocusTracker → pillar-helper.ts → Pi Extension
                                                    ↓
                                              repair subagent
                                                    ↓
                                              focus_tracker.json (JSON persistence)
```

## Components

- `extensions/pillar-helper.ts` — Pi extension with 10 tools (registerTool API)
- `src/watchdog.ts` — Always-on loop with repair subagent calls
- `mesh/a2a-mesh.yaml` — A2A mesh configuration
- `systemd/pi-4pillar-helper.service` — systemd service file
- `config.yaml` — Ecosystem configuration

## Repair Subagent

The watchdog invokes `pi --provider openrouter --model gemma-4-E4B-it --print` for repair subagent calls. This requires:
- LM Studio running on port 38313 with gemma-4-E4B-it model
- OPENROUTER_API_KEY env var set to LM Studio API key
- OPENROUTER_BASE_URL env var set to http://127.0.0.1:38313/v1

## Testing

```bash
# Start watchdog (detects drift, triggers repairs)
BIONIC_API_KEY="<LM-Studio-Key>" AZURE_OPENAI_BASE_URL="http://127.0.0.1:38313/v1" node ./dist/src/watchdog.js

# Test extension tools
node test-tools.js
```

## Roadmap

L1 (structured logging) → L2 (per-pillar scoring + SPC signals) → L3 (CUSUM/EWMA detection, repair taxonomy) → L4 (adaptive thresholds, repair effectiveness) → L5 (predictive forecasting, causal inference)
