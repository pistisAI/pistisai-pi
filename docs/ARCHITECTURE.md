# System Architecture

> How pistisai-pi is structured: components, data flow, event sourcing, and mesh communication.

---

## Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Pi Runtime (agent)                      │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           pillar-helper.ts (extension)                │  │
│  │                                                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │  Tools   │  │  Scorer  │  │  Repair Engine   │  │  │
│  │  │ registry │  │  (4-pillar)│  │  (Reflexion)    │  │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │  │
│  │       │              │               │               │  │
│  │  ┌────▼──────────────▼───────────────▼────────────┐  │  │
│  │  │              FocusTracker (SQLite)              │  │  │
│  │  └────────────────────┬───────────────────────────┘  │  │
│  └───────────────────────┼──────────────────────────────┘  │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │          A2AMeshClient (port 9910)                    │  │
│  │          pub/sub pillar state events                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │     watchdog.ts (standalone background process)       │  │
│  │     Always-on polling → scoring → repair trigger      │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### pillar-helper.ts — Pi Extension

The main extension loaded by Pi at runtime. Registers tools, runs the polling loop, and orchestrates scoring + repair.

**Responsibilities:**
- Load config from `config.yaml`
- Register Pi tools (`pillar_status`, `compute_focus_score`, `reset_focus`, `watcher_*`)
- Poll focus score every 15s via `pi.setInterval`
- Persist events and pillar state via `FocusTracker`
- Publish state changes to mesh via `A2AMeshClient`
- Trigger repair when ASI < threshold

### watchdog.ts — Standalone Background Process

Always-running monitor that operates independently of the Pi session. Polls agent state, computes scores, and triggers repairs.

**Why separate:** Survives Pi session restarts. Can monitor the agent even when the main session is idle.

**Responsibilities:**
- Read agent state (from Hermes logs, session files, or simulated data)
- Compute pillar scores every 10s
- Log all metrics to `watchdog.log`
- Trigger `pi --print` repair sub-agents on drift
- Graceful shutdown on SIGINT/SIGTERM

### FocusTracker — SQLite Persistence

Stores events and pillar state over time. Enables historical analysis and drift detection across sessions.

**Schema (planned):**
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  agent_name TEXT NOT NULL
);

CREATE TABLE pillar_states (
  agent_name TEXT NOT NULL,
  pillar TEXT NOT NULL,
  focus REAL NOT NULL,
  drift REAL NOT NULL,
  issues TEXT,
  timestamp TEXT NOT NULL,
  PRIMARY KEY (agent_name, pillar, timestamp)
);
```

> **Current status:** Stub implementation — logs to console but doesn't write to SQLite yet.

### A2AMeshClient — Mesh Communication

Publishes pillar state events to the A2A mesh for other agents/services to consume.

**Topic pattern:** `{agent_name}/focus` (e.g., `zoid/focus`)

**Event types:**
- `pillar_state` — full pillar snapshot + aggregate score
- `drift_alert` — published when any pillar exceeds drift threshold
- `repair_triggered` — published when repair is invoked

> **Current status:** Stub implementation — logs to console but doesn't actually publish yet.

---

## Data Flow

```
Agent Activity
     │
     ▼
┌─────────────────┐
│  Event Sources   │  Hermes logs, tool calls, session events
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  FocusTracker    │  Logs events to SQLite
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Scorer          │  Computes 4-pillar scores + ASI
│  (every 10-15s) │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌────────┐
│ Mesh  │  │ Repair │
│ Publish│  │ Engine │
└───────┘  └────────┘
```

---

## Event Sourcing Model

The system uses event sourcing as the persistence pattern (see [RESEARCH.md §5](RESEARCH.md#-5-event-sourcing-patterns)):

**Events are the source of truth.** Current pillar state is a projection derived from the event log.

```json
{
  "eventId": "uuid",
  "eventType": "FocusScoreComputed",
  "aggregateId": "zoid",
  "aggregateType": "Agent",
  "version": 42,
  "timestamp": "2026-09-12T23:00:00Z",
  "data": {
    "aiman": 0.92,
    "aigent": 0.88,
    "aidration": 0.95,
    "aimotions": 0.90,
    "asi": 0.91
  },
  "metadata": {
    "source": "watchdog",
    "sessionId": "..."
  }
}
```

**Benefits:**
- Reconstruct agent state at any point in time
- Replay events through improved scoring algorithms
- Full audit trail for debugging drift patterns
- New consumers can replay full history

---

## A2A Mesh Architecture

### Transport

Based on [Google A2A Protocol v1.0.0](https://a2a-protocol.org/latest/specification/):

| Transport | Use Case |
|-----------|----------|
| WebSocket (port 9910) | Real-time bidirectional mesh |
| SSE | Long-running task streaming |
| Webhooks | Async push for disconnected agents |

### Pub/Sub Topics

```
{agent_name}/focus          — pillar state snapshots
{agent_name}/drift          — drift alerts
{agent_name}/repair         — repair events
{agent_name}/health         — heartbeat / liveness
```

### Peer Discovery

Agent Cards at `.well-known/agent.json`:
```json
{
  "name": "pi-pillar-helper",
  "capabilities": ["monitoring", "scoring", "repair"],
  "endpoint": "ws://localhost:9910",
  "topics": ["zoid/focus", "zoid/drift"]
}
```

### Production Considerations

- **Heartbeats:** Agents ping mesh every 30s
- **Auth:** JWT handshake on WebSocket connection
- **Idempotency:** Events use `(agent_id, timestamp, event_type)` as dedup key
- **Dead letter queue:** Failed mesh deliveries retried 3x then DLQ'd
- **Backpressure:** Slow consumers use flow control, not unbounded queues

---

## Repair Flow

```
Drift Detected (ASI < threshold)
         │
         ▼
┌──────────────────┐
│ Classify Failure  │  Which pillar(s)? What type?
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Select Strategy   │  Reflexion / FSM Reset / Prompt Rewrite / Escalate
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌──────────�│
│ Local  │  │ Subagent │  (pi --print with repair prompt)
│ Repair │  │ Repair   │
└───┬───┘  └────┬─────┘
    │           │
    ▼           ▼
┌──────────────────┐
│ Verify Repair     │  Re-score pillar, confirm ASI improved
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌──────────┐
│ Log   │  │ Escalate │  (notify human if repair failed)
│ Success│  │ to Human │
└───────┘  └──────────┘
```

---

## Deployment

### Systemd (Linux)

The project includes a systemd unit at `systemd/pi-4pillar-helper.service`:
- `Restart=on-failure` with 10s delay
- Logs to journal
- Depends on network + optionally lmstudio
- Runs as `rightguy` user

### Configuration

`config.yaml`:
```yaml
agent_name: zoid
agent_id: zoid-agent-001
pillar_reference: 4-pillar
monitor_target: agent-runtime
inference_backend: bionic       # LM Studio / Bionic on port 36093
mesh_topic: zoid/focus
focus_threshold: 0.5
metrics_port: 9090
session_dir: ./pi-sessions
```

---

## Future Integration

### pistisai-app Adapter

A `pi_adapter.dart` will bridge this system into the Flutter-based pistisai-app, connecting to the same Bionic backend. The adapter will:
- Consume mesh events via WebSocket
- Render pillar state in the app UI
- Allow manual repair triggers from the app

### Multi-Agent Mesh

As the ecosystem grows, additional peers can join:
- **pi-watcher** — dedicated monitoring node
- **pi-orchestrator** — coordinates repairs across multiple agents
- **Custom agents** — any A2A-compliant agent can subscribe to pillar topics
