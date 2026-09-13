# Telemetry Extraction & Behavioral Metrics for AI Agent Session Logs
## Research Summary for pistisai-pi Integration

> Generated: 2026-09-12 | Target: Hermes Agent @ ~/.hermes/sessions/*.jsonl | Framework: 4-Pillar (Aiman/Aigent/Aidration/Aimotions)

---

## 1. Hermes Session Log Schema (Actual)

**Location:** `~/.hermes/sessions/<YYYYMMDD>_<HHMMSS>_<hash>.jsonl`

**Format:** One JSON object per line (jsonl), each representing a message/tool event.

**Key Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"`, `"assistant"`, `"tool"` |
| `content` | string | Message text or tool output |
| `tool_name` | string | Name of tool called (for role=tool) |
| `tool_calls` | array | List of tool call objects from assistant |
| `tool_call_id` | string | Correlation ID for tool call → result |
| `finish_reason` | string | `"stop"`, `"tool_calls"`, etc. |
| `reasoning` | string | Chain-of-thought / reasoning text |
| `reasoning_content` | string | Extended reasoning output |
| `timestamp` | float | Unix timestamp (seconds) |
| `_compressed_summary` | bool | Whether content is compressed |

**Tool Call Object Structure:**
```json
{
  "id": "call_125caa3fab604ef1b29ff531",
  "type": "function",
  "function": {
    "name": "tool_search",
    "arguments": "{\"queries\":[\"...\"]}"
  }
}
```

---

## 2. Parsing Agent Logs — Practical Methods

### 2.1 Tool Usage & Success/Failure Extraction

```python
import json
from collections import Counter, defaultdict
from pathlib import Path

def parse_hermes_session(filepath: str) -> dict:
    events = []
    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    
    tool_calls = []
    tool_results = []
    user_messages = []
    assistant_messages = []
    errors = []
    
    for ev in events:
        role = ev.get("role")
        if role == "user":
            user_messages.append(ev.get("content", ""))
        elif role == "assistant":
            assistant_messages.append(ev.get("content","))
            # Extract tool calls
            for tc in (ev.get("tool_calls") or []):
                tool_calls.append({
                    "name": tc.get("function", {}).get("name"),
                    "arguments": tc.get("function", {}).get("arguments"),
                    "timestamp": ev.get("timestamp"),
                })
        elif role == "tool":
            # Tool result — check for errors
            try:
                result = json.loads(ev.get("content", "{}"))
                exit_code = result.get("exit_code", 0)
                has_error = exit_code != 0 or result.get("error") is not None
            except (json.JSONDecodeError, TypeError):
                has_error = False
            
            tool_results.append({
                "tool_name": ev.get("tool_name"),
                "tool_call_id": ev.get("tool_call_id"),
                "error": has_error,
                "timestamp": ev.get("timestamp"),
            })
            if has_error:
                errors.append(ev.get("tool_call_id"))
    
    # Compute metrics
    tool_usage_counts = Counter(tc["name"] for tc in tool_calls)
    tool_success_by_tool = defaultdict(lambda: {"success": 0, "failure": 0})
    for tr in tool_results:
        name = tr["tool_name"] or "unknown"
        if tr["error"]:
            tool_success_by_tool[name]["failure"] += 1
        else:
            tool_success_by_tool[name]["success"] += 1
    
    total_tool_calls = len(tool_results)
    total_errors = len(errors)
    
    return {
        "total_user_messages": len(user_messages),
        "total_assistant_messages": len(assistant_messages),
        "total_tool_calls": total_tool_calls,
        "tool_usage_breakdown": dict(tool_usage_counts),
        "tool_success_rates": {
            name: v["success"] / max(v["success"] + v["failure"], 1)
            for name, v in tool_success_by_tool.items()
        },
        "overall_error_rate": total_errors / max(total_tool_calls, 1),
        "errors": errors,
        "session_duration_seconds": (
            events[-1]["timestamp"] - events[0]["timestamp"]
            if len(events) > 1 and events[0].get("timestamp") and events[-1].get("timestamp")
            else 0
        ),
    }
```

### 2.2 Token Usage Extraction

Hermes session logs **do not directly contain token counts** — these must be extracted from:
- Hermes gateway logs (`agent.log`) — TokenTelemetry parses this
- LLM API response headers (if logged)
- OpenTelemetry spans (if instrumented)

**Option A: Use TokenTelemetry** (recommended for Hermes)
- Open source: https://github.com/VasiHemanth/tokentelemetry
- Dedicated Hermes dashboard at `/hermes`
- Parses `agent.log` for per-API-call latency, cache hits, tokens
- Zero-config, 100% local

**Option B: Parse from OTel spans**
```python
# After instrumenting with openinference-instrumentation-openai
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Token counts appear as span attributes:
# gen_ai.usage.input_tokens, gen_ai.usage.output_tokens
```

### 2.3 Latency Measurement

```python
# From session JSONL timestamps
def compute_latencies(events: list) -> dict:
    """Compute inter-message and tool-call latencies."""
    latencies = []
    tool_latencies = []
    
    # Map tool_call_id → assistant timestamp
    call_to_ts = {}
    for ev in events:
        if ev["role"] == "assistant" and ev.get("tool_calls"):
            for tc in ev["tool_calls"]:
                call_to_ts[tc["id"]] = ev["timestamp"]
    
    # Compute tool latency (assistant call → tool result)
    for ev in events:
        if ev["role"] == "tool" and ev.get("tool_call_id") in call_to_ts:
            latency = ev["timestamp"] - call_to_ts[ev["tool_call_id"]]
            tool_latencies.append(latency)
    
    # Inter-message latencies
    for i in range(1, len(events)):
        if events[i].get("timestamp") and events[i-1].get("timestamp"):
            latencies.append(events[i]["timestamp"] - events[i-1]["timestamp"])
    
    return {
        "mean_inter_message_latency": sum(latencies) / max(len(latencies), 1),
        "p95_tool_latency": sorted(tool_latencies)[int(len(tool_latencies) * 0.95)] if tool_latencies else 0,
        "tool_latencies": tool_latencies,
    }
```

---

## 3. Session Replay & Trace Analysis

### 3.1 Session Reconstruction

```python
class SessionTrace:
    """Reconstruct a session trace from Hermes JSONL for replay/analysis."""
    
    def __init__(self, filepath: str):
        self.events = [json.loads(l) for l in open(filepath) if l.strip()]
        self.trace_tree = self._build_tree()
    
    def _build_tree(self) -> list:
        """Build a span tree: user_msg → assistant → tool_calls → tool_results."""
        tree = []
        current_turn = None
        
        for ev in self.events:
            role = ev["role"]
            if role == "user":
                current_turn = {
                    "user": ev,
                    "assistant_calls": [],
                    "tool_results": [],
                }
                tree.append(current_turn)
            elif role == "assistant":
                if current_turn:
                    current_turn["assistant_calls"].append(ev)
            elif role == "tool":
                # Find matching assistant turn via tool_call_id
                for turn in reversed(tree[-5:]):
                    for ac in turn.get("assistant_calls", []):
                        for tc in (ac.get("tool_calls") or []):
                            if tc["id"] == ev.get("tool_call_id"):
                                turn["tool_results"].append(ev)
                                break
        return tree
    
    def get_trajectory(self) -> list:
        """Flatten to ordered action list for trajectory evaluation."""
        trajectory = []
        for turn in self.trace_tree:
            trajectory.append({"type": "user", "text": turn["user"].get("content", "")})
            for ac in turn.get("assistant_calls", []):
                trajectory.append({"type": "assistant", "text": ac.get("content", "")})
                for tc in (ac.get("tool_calls") or []):
                    trajectory.append({
                        "type": "tool_call",
                        "name": tc["function"]["name"],
                        "arguments": tc["function"]["arguments"],
                    })
            for tr in turn.get("tool_results", []):
                trajectory.append({"type": "tool_result", "error": tr.get("error", False)})
        return trajectory
```

### 3.2 Integration with Observability Platforms

| Platform | Integration Method | Strengths |
|----------|-------------------|-----------|
| **Langfuse** | OTel-native SDK v3, `@observe()` decorator | Session replays, prompt versioning, eval templates |
| **Arize Phoenix** | OpenInference instrumentation, OTel-native | RAG evaluation, embedding drift detection, notebook-first |
| **LangSmith** | `langsmith` SDK, LangGraph integration | Native LangChain tracing, fleet deployment |
| **AgentTrace** | TUI/CLI reading JSONL directly | Zero-instrumentation, local, CI gates |
| **TokenTelemetry** | Reads Hermes logs directly | Dedicated Hermes dashboard, cost tracking |

**Example Langfuse integration for Hermes (wrap tool calls):**
```python
from langfuse import get_client

langfuse = get_client()

def traced_tool_call(tool_name: str, args: dict):
    with langfuse.start_as_current_span(name=tool_name) as span:
        span.set_attributes({
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": tool_name,
        })
        result = execute_tool(tool_name, args)
        span.set_output(result)
        return result
```

---

## 4. Behavioral Metrics from Conversation Text

### 4.1 Persona Consistency (Cosine Similarity on Embeddings)

**Method:** Nautilus Compass approach (arXiv:2605.09863, ROC AUC 0.83)

```python
import numpy as np
from sentence_transformers import SentenceTransformer

# Use BGE-m3 (recommended by Compass) or any local embedder
model = SentenceTransformer("BAAI/bge-m3")

# Define behavioral anchor texts (positive = desired persona traits)
POSITIVE_ANCHORS = [
    "You are Hermes Agent, built by Nous Research. Be direct, match length to weight.",
    "Plain claims over adjectives. Agree because it's right, not because user said it.",
    "No filler, no restating requests, no narrating tool calls.",
]

NEGATIVE_ANCHORS = [
    "Great question! I'd be happy to help you with that.",
    "Sure, let me just quickly look into that for you!",
    "Absolutely! Here's a comprehensive overview of everything...",
]

def compute_persona_consistency(output_text: str) -> float:
    """Returns 0-1 score. 1 = perfectly aligned with persona."""
    output_emb = model.encode(output_text)
    pos_embs = model.encode(POSITIVE_ANCHORS)
    neg_embs = model.encode(NEGATIVE_ANCHORS)
    
    # Weighted top-k cosine similarity
    pos_sims = sorted([cosine_sim(output_emb, pe) for pe in pos_embs], reverse=True)
    neg_sims = sorted([cosine_sim(output_emb, ne) for ne in neg_embs], reverse=True)
    
    k = min(3, len(pos_sims))
    pos_score = np.mean(pos_sims[:k])
    neg_score = np.mean(neg_sims[:k])
    
    # Drift score: high when aligned, low when deviating
    return max(0, min(1, pos_score - neg_score + 0.5))

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))
```

**Production thresholds (from SCORING.md):**
- Cosine similarity > 0.85 → Healthy
- 0.75–0.84 → Degraded
- < 0.75 → Drifted (trigger repair)

### 4.2 Sentiment & Tone Drift (JSD)

```python
from scipy.spatial.distance import jensenshannon
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import numpy as np

analyzer = SentimentIntensityAnalyzer()

def get_sentiment_distribution(texts: list[str], bins: int = 10) -> np.ndarray:
    """Convert list of texts to sentiment histogram distribution."""
    scores = [analyzer.polarity_scores(t)["compound"] for t in texts]
    hist, _ = np.histogram(scores, bins=bins, range=(-1, 1), density=True)
    # Normalize to probability distribution
    return hist / hist.sum() if hist.sum() > 0 else np.ones(bins) / bins

def compute_sentiment_drift(
    baseline_texts: list[str], 
    current_texts: list[str]
) -> dict:
    """Compute JSD between baseline and current sentiment distributions."""
    baseline_dist = get_sentiment_distribution(baseline_texts)
    current_dist = get_sentiment_distribution(current_texts)
    
    jsd = jensenshannon(baseline_dist, current_dist)
    
    return {
        "jsd": float(jsd) if not np.isnan(jsd) else 0.0,
        "drifted": float(jsd) > 0.1,  # Threshold from SCORING.md
        "baseline_mean_sentiment": np.mean([analyzer.polarity_scores(t)["compound"] for t in baseline_texts]),
        "current_mean_sentiment": np.mean([analyzer.polarity_scores(t)["compound"] for t in current_texts]),
    }
```

**Libraries:**
- `vaderSentiment` — fast, rule-based, good for short informal text
- `textblob` — polarity + subjectivity, simpler
- `transformers` (HuggingFace) — BERT-based for nuanced emotion detection

### 4.3 Emotion/Tone Detection (NRCLex)

```python
from nrclex import NRCLex

def detect_emotion_profile(text: str) -> dict:
    """Extract NRC emotion dimensions."""
    emotion = NRCLex(text)
    return emotion.affected_frequencies
    # Returns: {'fear': 0.1, 'anger': 0.05, 'anticipation': 0.2, 
    #           'trust': 0.3, 'surprise': 0.05, 'positive': 0.4, ...}
```

---

## 5. Embedding-Based Drift Detection

### 5.1 Cosine Similarity Drift

```python
import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-m3")

def compute_embedding_drift(
    reference_texts: list[str],
    current_texts: list[str]
) -> dict:
    """Cosine drift between mean embedding centroids."""
    ref_embs = model.encode(reference_texts)
    cur_embs = model.encode(current_texts)
    
    ref_centroid = ref_embs.mean(axis=0)
    cur_centroid = cur_embs.mean(axis=0)
    
    cosine_sim = np.dot(ref_centroid, cur_centroid) / (
        np.linalg.norm(ref_centroid) * np.linalg.norm(cur_centroid) + 1e-8
    )
    
    return {
        "cosine_similarity": float(cosine_sim),
        "drift_score": 1.0 - float(cosine_sim),  # 0 = identical, 1 = orthogonal
        "drifted": float(cosine_sim) < 0.95,  # Threshold for semantic drift
    }
```

### 5.2 Jensen-Shannon Distance on Embeddings

```python
from scipy.spatial.distance import jensenshannon
from sklearn.cluster import MiniBatchKMeans

def compute_embedding_jsd(
    reference_embs: np.ndarray,
    current_embs: np.ndarray,
    n_clusters: int = 20
) -> float:
    """JSD on cluster-membership distribution (from embeddings)."""
    # Cluster baseline to define reference distribution
    kmeans = MiniBatchKMeans(n_clusters=n_clusters, random_state=42)
    kmeans.fit(reference_embs)
    
    # Assign current embeddings to same clusters
    ref_labels = kmeans.labels_
    cur_labels = kmeans.predict(current_embs)
    
    # Compute distributions
    ref_dist = np.bincount(ref_labels, minlength=n_clusters) / len(ref_labels)
    cur_dist = np.bincount(cur_labels, minlength=n_clusters) / len(cur_labels)
    
    return float(jensenshannon(ref_dist, cur_dist))
```

### 5.3 Population Stability Index (PSI)

```python
import numpy as np

def calculate_psi(
    expected: np.ndarray, 
    actual: np.ndarray, 
    bins: int = 10,
    epsilon: float = 1e-6
) -> float:
    """
    Population Stability Index.
    Thresholds (from SCORING.md):
    - PSI < 0.1: No significant drift
    - 0.1 <= PSI < 0.25: Moderate drift, investigate
    - PSI >= 0.25: Significant drift, action needed
    """
    # Use quantile-based binning from expected distribution
    edges = np.quantile(expected, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    
    expected_counts, _ = np.histogram(expected, bins=edges)
    actual_counts, _ = np.histogram(actual, bins=edges)
    
    expected_pct = expected_counts / len(expected) + epsilon
    actual_pct = actual_counts / len(actual) + epsilon
    
    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)

# Usage for agent drift detection:
# PSI on response lengths, token counts, latencies across sliding windows
```

### 5.4 CUSUM for Sustained Degradation

```python
import numpy as np

class CUSUM:
    """Cumulative Sum control chart for detecting sustained drift."""
    
    def __init__(self, target: float, k: float = 0.5, h: float = 5.0):
        self.target = target  # In-control mean
        self.k = k            # Slack parameter (typically 0.5 * sigma)
        self.h = h            # Decision threshold (typically 5 * sigma)
        self.s_pos = 0.0
        self.s_neg = 0.0
        self.alarms = []
    
    def update(self, value: float) -> bool:
        """Update with new observation. Returns True if drift detected."""
        self.s_pos = max(0, self.s_pos + (value - self.target) - self.k)
        self.s_neg = max(0, self.s_neg - (value - self.target) - self.k)
        
        if self.s_pos > self.h or self.s_neg > self.h:
            self.alarms.append({"value": value, "s_pos": self.s_pos, "s_neg": self.s_neg})
            # Reset after alarm
            self.s_pos = 0.0
            self.s_neg = 0.0
            return True
        return False

# Usage for Aigent error rate monitoring:
cusum = CUSUM(target=0.05, k=0.025, h=0.1)  # 5% target error rate
for window_error_rate in sliding_error_rates:
    if cusum.update(window_error_rate):
        trigger_aigent_repair()
```

---

## 6. Existing Open-Source Tools Summary

| Tool | License | OTel | Self-host | Best For | Hermes Support |
|------|---------|------|-----------|----------|----------------|
| **Langfuse** | MIT | ✅ v3 SDK | ✅ | Tracing + prompt mgmt + evals | Via OTel export |
| **Arize Phoenix** | Elastic 2.0 | ✅ OpenInference | ✅ (uncapped) | RAG evals, embedding drift | Via OTel export |
| **LangSmith** | Proprietary | ✅ | Enterprise only | LangChain-native tracing | Via OTel export |
| **TokenTelemetry** | MIT | ❌ (reads logs) | ✅ (local only) | Hermes/coding agent dashboard | ✅ Dedicated |
| **AgentTrace** | MIT | ❌ (reads logs) | ✅ (local only) | TUI session review, CI gates | ✅ Supported |
| **OpenLLMetry** | Apache 2.0 | ✅ (is OTel) | ✅ SDK | LLM/vector/framework spans | Via OTel |
| **Comet Opik** | Apache 2.0 | ✅ | ✅ | Prompt optimization, guardrails | Via OTel |
| **Braintrust** | Proprietary | ✅ | Cloud | Trace-to-eval loop | Via OTel |
| **AgentOps** | MIT | ✅ | Cloud | Session replay, step graphs | Via OTel |

**For Hermes specifically:**
- **TokenTelemetry** is the only tool with a dedicated Hermes surface (`/hermes` dashboard)
- It reads `~/.hermes/` directly (sessions, agent.log, skills, cron, memory)
- For general observability, Langfuse or Arize Phoenix via OTel export is best

---

## 7. Telemetry Pipeline Architecture for 4-Pillar Scoring

### 7.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HERMES AGENT RUNTIME                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Sessions │  │ Tool     │  │ LLM API  │  │ Gateway  │              │
│  │ (JSONL)  │  │ Results  │  │ Calls    │  │ Logs     │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │              │                    │
└───────┼──────────────┼──────────────┼──────────────┼────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     TELEMETRY COLLECTION LAYER                       │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐ │
│  │ JSONL Parser    │  │ OTel Spans       │  │ TokenTelemetry      │ │
│  │ (sessions/*.    │  │ (gen_ai.* attrs) │  │ (agent.log parser)  │ │
│  │  jsonl)         │  │                  │  │                     │ │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘ │
│           │                    │                        │            │
│           ▼                    ▼                        ▼            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │              NORMALIZED TELEMETRY EVENTS                        │ │
│  │  { session_id, timestamp, type, role, tool_name, tokens,       │ │
│  │    latency, error, content_embedding, sentiment_score }        │ │
│  └────────────────────────────┬────────────────────────────────────┘ │
└───────────────────────────────�───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     BEHAVIORAL METRICS ENGINE                         │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Aiman        │  │ Aigent       │  │ Aimotions    │              │
│  │ Compute      │  │ Compute      │  │ Compute      │              │
│  │ - Cosine     │  │ - Tool       │  │ - JSD        │              │
│  │   similarity │  │   success    │  │   sentiment  │              │
│  │   vs anchors │  │ - Error rate │  │ - VADER/     │              │
│  │ - Embedding  │  │ - Halluc.    │  │   NRCLex     │              │
│  │   drift      │  │   rate       │  │ - Tone       │              │
│  │ - JSD on     │  │ - PSI on     │  │   embedding  │              │
│  │   persona    │  │   tool dist  │  │   drift      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         ▼                  ▼                  ▼                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Aidration Compute                                               │  │
│  │ - Plan adherence (tool sequence matching)                       │  │
│  │ - CUSUM on error rate / escalation rate                         │  │
│  │ - Context bloat (token growth rate)                             │  │
│  │ - Session hygiene score                                         │  │
│  └──────────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────────�────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     4-PILLAR SCORING MODEL                          │
│                                                                     │
│  ASI = (Aiman × 0.30) + (Aigent × 0.25) + (Aidration × 0.25)    │
│        + (Aimotions × 0.20)                                        │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Aiman    │  │ Aigent   │  │ Aidration│  │ Aimotions│          │
│  │ focus    │  │ focus    │  │ focus    │  │ focus    │          │
│  │ 0.0-1.0  │  │ 0.0-1.0  │  │ 0.0-1.0  │  │ 0.0-1.0  │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                     │
│  Thresholds:                                                        │
│  0.85-1.00 Healthy │ 0.75-0.84 Degraded │ 0.50-0.74 Drifted       │
│  0.00-0.49 Critical                                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     REPAIR / ACTION LAYER                           │
│                                                                     │
│  - Reflexion loop on failed pillars                                 │
│  - FSM reset (Aidration)                                            │
│  - Persona re-anchoring (Aiman)                                     │
│  - Tool fallback / alternative (Aigent)                             │
│  - Tone/style prompt adjustment (Aimotions)                         │
│  - Log incident → CI gate / alert                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Integration Pattern for pistisai-pi

The current `watchdog.ts` uses `readAgentState()` returning random values. **Replace with:**

```typescript
// New: Parse real Hermes session files
import * as fs from 'fs';
import * as path from 'path';

function readHermesSessionDir(sessionDir: string): HermesMetrics {
    const files = fs.readdirSync(sessionDir)
        .filter(f => f.endsWith('.jsonl') && !f.startsWith('request_dump'))
        .sort()
        .reverse();  // Most recent first
    
    if (files.length === 0) return emptyMetrics();
    
    const latestSession = path.join(sessionDir, files[0]);
    const lines = fs.readFileSync(latestSession, 'utf8')
        .split('\n')
        .filter(l => l.trim());
    
    let toolCalls = 0;
    let errors = 0;
    let userMessages = 0;
    let assistantMessages = 0;
    let lastTimestamp = 0;
    const toolUsage: Record<string, number> = {};
    const toolErrors: Record<string, number> = {};
    
    for (const line of lines) {
        try {
            const ev = JSON.parse(line);
            if (ev.role === 'user') userMessages++;
            if (ev.role === 'assistant') {
                assistantMessages++;
                for (const tc of (ev.tool_calls || [])) {
                    toolCalls++;
                    const name = tc.function?.name || 'unknown';
                    toolUsage[name] = (toolUsage[name] || 0) + 1;
                }
            }
            if (ev.role === 'tool') {
                try {
                    const result = JSON.parse(ev.content);
                    if (result.exit_code !== 0 || result.error) {
                        errors++;
                        const name = ev.tool_name || 'unknown';
                        toolErrors[name] = (toolErrors[name] || 0) + 1;
                    }
                } catch {}
            }
            if (ev.timestamp) lastTimestamp = Math.max(lastTimestamp, ev.timestamp);
        } catch {}
    }
    
    return {
        tool_calls: toolCalls,
        errors: errors,
        user_messages: userMessages,
        assistant_messages: assistantMessages,
        tool_usage_breakdown: toolUsage,
        tool_error_breakdown: toolErrors,
        session_count: files.length,
        last_activity: lastTimestamp,
        error_rate: errors / Math.max(toolCalls, 1),
    };
}
```

### 7.3 Embedding Service Integration

For behavioral drift detection, add a sidecar embedding service:

```python
# embedding_service.py — lightweight local HTTP server
from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
import numpy as np

app = FastAPI()
model = SentenceTransformer("BAAI/bge-m3")

@app.post("/embed")
async def embed(texts: list[str]):
    embeddings = model.encode(texts)
    return {"embeddings": embeddings.tolist()}

@app.post("/cosine_drift")
async def cosine_drift(reference: list[str], current: list[str]):
    ref_embs = model.encode(reference)
    cur_embs = model.encode(current)
    ref_centroid = ref_embs.mean(axis=0)
    cur_centroid = cur_embs.mean(axis=0)
    sim = np.dot(ref_centroid, cur_centroid) / (
        np.linalg.norm(ref_centroid) * np.linalg.norm(cur_centroid)
    )
    return {"cosine_similarity": float(sim), "drifted": float(sim) < 0.85}
```

---

## 8. Recommended Implementation Roadmap

### Phase 1: Basic Log Parsing (Low Effort, Immediate Value)
1. Parse Hermes `sessions/*.jsonl` files
2. Extract tool calls, errors, message counts, latencies
3. Feed into current `computePillarScores()` replacing random values
4. Already provides real `Aigent` (error rates, tool success) and `Aidration` (session hygiene) metrics

### Phase 2: Behavioral Embedding Metrics
1. Add `sentence-transformers` (BGE-m3) dependency
2. Compute persona consistency cosine similarity for each assistant response
3. Store rolling window of embeddings for drift detection
4. Implement JSD for sentiment drift (Aimotions pillar)

### Phase 3: Statistical Drift Detection
1. Implement PSI for tool usage distribution shifts (Aigent)
2. Add CUSUM for sustained error rate monitoring (Aidration)
3. Set up reference baselines (first N sessions = healthy baseline)
4. Configure alerting thresholds per SCORING.md

### Phase 4: Optional OTel Integration
1. Add `openinference-instrumentation-openai` for automatic span generation
2. Export to Langfuse/Phoenix for dashboarding
3. TokenTelemetry as lightweight alternative for token/cost tracking

---

## 9. Key Libraries & Dependencies

```json
{
  "python": {
    "sentence-transformers": ">=3.0.0",
    "vaderSentiment": ">=3.3.2",
    "nrclex": ">=4.0.0",
    "scipy": ">=1.11.0",
    "numpy": ">=1.24.0",
    "scikit-learn": ">=1.3.0",
    "langfuse": ">=2.50.0",
    "openinference-instrumentation-openai": ">=0.1.0"
  },
  "typescript": {
    "@langfuse/langfuse-node": "for OTel export",
    "openai": "already in Hermes runtime"
  }
}
```

---

## 10. Sources & References

1. **TokenTelemetry** — https://github.com/VasiHemanth/tokentelemetry — Hermes-specific telemetry
2. **Nautilus Compass** — arXiv:2605.09863 — Cosine similarity persona drift detection (AUC 0.83)
3. **TraceLab** — arXiv:2606.30560 — 4,300 coding agent sessions analysis methodology
4. **ContextEcho** — arXiv:2605.24279 — Persona consistency degradation >30% after 8-12 turns
5. **Agent Stability Index** — Rath 2026, arXiv:2601.04170 — Composite metric framework
6. **OTel GenAI Semantic Conventions** — open-telemetry/semantic-conventions-genai — Standard `gen_ai.*` span attributes
7. **Langfuse** — https://langfuse.com — Open-source LLM observability (MIT, acquired by ClickHouse Jan 2026)
8. **Arize Phoenix** — https://github.com/Arize-AI/phoenix — OTel-native evaluation platform
9. **AgentTrace** — https://github.com/luoyuctl/agenttrace — TUI session analysis with Hermes support
10. **SPC-Agent** — Claw 2026 — Classical CUSUM/Shewhart for agent monitoring
11. **RoleFix** — Wang et al. 2026 — Hybrid rule-based + LLM-judge detection (F1 0.83-0.89)
12. **τ-bench** — Sierra AI, arXiv:2406.12045 — pass^k reliability framework
13. **Persona Vectors** — Chen et al., Anthropic 2025, arXiv:2507.21509 — White-box trait monitoring
14. **SPASM** — arXiv:2604.09212 — Semantic similarity for personality shift quantification
