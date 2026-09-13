# Scoring Model — 4-Pillar Framework

> Defines how pistisai-pi scores agent health across the four pillars, what metrics feed each score, and what thresholds trigger repair.

---

## The Four Pillars

| Pillar | Domain | Titan | What It Measures |
|--------|--------|-------|------------------|
| **Aiman** | Identity / Relationship | Hyperion | Is the agent staying true to its persona, boundaries, and relationship with the user? |
| **Aigent** | Capability / Wisdom | Koios | Is the agent effectively using tools, reasoning correctly, and completing tasks? |
| **Aidration** | Order / Restoration | Krios | Is the agent managing its own state, following plans, and maintaining session hygiene? |
| **Aimotions** | Character / Self-Control | Iapetos | Is the agent maintaining consistent tone, emotional coherence, and self-regulation? |

---

## Scoring Architecture

Each pillar produces a **focus score** (0.0–1.0) and a **drift score** (1.0 − focus). The aggregate **Agent Stability Index (ASI)** is the weighted average:

```
ASI = (Aiman × 0.30) + (Aigent × 0.25) + (Aidration × 0.25) + (Aimotions × 0.20)
```

### ASI Thresholds

| ASI Range | State | Action |
|-----------|-------|--------|
| 0.85–1.00 | Healthy | Continue monitoring |
| 0.75–0.84 | Degraded | Log warning, increase monitoring cadence |
| 0.50–0.74 | Drifted | Trigger per-pillar repair |
| 0.00–0.49 | Critical | Full session reset + human notification |

> **Source:** Adapted from the Agent Stability Index framework (Rath 2026, arXiv:2601.04170), which uses ASI < 0.75 across three consecutive 50-interaction windows as the intervention threshold.

---

## Per-Pillar Metrics

### Aiman (Identity/Relationship)

| Metric | Measurement | Target | Drift Signal |
|--------|-------------|--------|--------------|
| Role adherence rate | % of outputs matching persona constraints | >90% | <90% |
| Persona consistency score | Cosine similarity of output embeddings vs. persona baseline | >0.85 | <0.85 |
| Boundary violation count | Guardrail triggers per session | <5% of interactions | ≥5% |
| Identity coherence | Self-consistency when reflecting on own nature | Pass/fail probe | Fail |

**Detection method:** Black-box anchor-based monitoring (Nautilus Compass approach — cosine similarity between behavioral anchor texts, ROC AUC 0.83).

**Repair strategy:** Reflexion loop with identity reinforcement prompt. Re-anchor persona from stored baseline.

> **Key research:** ContextEcho (arXiv:2605.24279) found persona consistency degrades >30% after 8–12 dialogue turns. Nautilus Compass (arXiv:2605.09863) detects drift via embedding-space anchor comparison.

---

### Aigent (Capability/Wisdom)

| Metric | Measurement | Target | Drift Signal |
|--------|-------------|--------|--------------|
| Task success rate | % of tasks completed without error | >85% | <85% |
| Tool selection accuracy | Correct tool chosen for task | >90% | <90% |
| Hallucination rate | Fabricated information per output | <0.5% | ≥0.5% |
| Argument hallucination rate | Invented tool parameters | <2% | ≥2% |
| Error correction rate | Self-corrections after failure | >70% | <70% |

**Detection method:** Rule-based checks (error counts, tool accuracy) + LLM-judge semantic evaluation. Statistical process control via CUSUM for sustained degradation.

**Repair strategy:** Retry with alternative tool, fallback model, or prompt rewrite. Classify failure type first (input corruption / context starvation / tool failure / reasoning collapse / output corruption) and apply targeted recovery.

> **Key research:** τ-bench (Sierra AI, arXiv:2406.12045) introduces pass^k reliability — consistency matters more than peak performance. Grounded self-correction achieves 70.3% error correction rate with execution-based verification (Zylos Research 2026).

---

### Aidration (Order/Restoration)

| Metric | Measurement | Target | Drift Signal |
|--------|-------------|--------|--------------|
| Plan adherence | Actual vs. planned tool sequence match | >85% | <85% |
| State transition validity | FSM-validated transitions | 100% | Any invalid |
| Escalation rate | Tasks requiring human intervention | <15% | ≥15% |
| Context bloat rate | Token growth per interaction cycle | Stable | Upward trend |
| Session hygiene | Cleanup of stale state between tasks | Pass | Fail |

**Detection method:** Finite State Machine (FSM) enforcement on agent workflow. Invalid state transitions trigger immediate alert. CUSUM on escalation rate for gradual degradation.

**Repair strategy:** FSM reset to last valid checkpoint. Re-plan from last known good state. Clear stale context.

> **Key research:** XenonStack three-layer model (System → Cognitive → Behavioral) recommends monitoring system-level hourly, cognitive daily, behavioral continuously. Four-stage recovery pattern (Output Validation → Failure Detection → Contextual Recovery → Learning Integration) achieves 73% reduction in silent failures (DEV.to 2025).

---

### Aimotions (Character/Self-Control)

| Metric | Measurement | Target | Drift Signal |
|--------|-------------|--------|--------------|
| Tone/style consistency | Embedding similarity vs. baseline persona tone | >0.85 | <0.85 |
| Sentiment drift | Jensen-Shannon Distance from baseline distribution | JSD < 0.1 | JSD ≥ 0.1 |
| Emotional coherence | Consistent emotional register across interactions | Pass | Fail |
| User satisfaction (CSAT) | Post-interaction quality score | >4.0/5.0 | <4.0 |

**Detection method:** JSD (Jensen-Shannon Distance) on sentiment distribution vs. baseline. Periodic persona probes to check emotional register consistency.

**Repair strategy:** Tone/style prompt adjustment. Context enrichment with persona anchors. If CSAT drops, trigger Reflexion loop on recent interactions.

> **Key research:** Persona Vectors (Chen et al., Anthropic 2025, arXiv:2507.21509) provide white-box trait monitoring. SPASM (arXiv:2604.09212) quantifies personality shift via semantic similarity between persona probe responses at turn t vs. baseline.

---

## Monitoring Cadence

| Layer | Metrics | Cadence | Source |
|-------|---------|---------|--------|
| System (Aidration) | API success rate, latency, cost | Every 10s | XenonStack |
| Cognitive (Aigent) | Tool accuracy, hallucination rate | Every 60s | Google Cloud KPIs |
| Behavioral (Aiman/Aimotions) | Persona consistency, tone drift | Every 50 interactions | ASI Framework |
| Composite (All) | ASI score rollup | Every 60s | Rath 2026 |

---

## Drift Detection Methods

| Test | Use Case | Threshold | Pillar |
|------|----------|-----------|--------|
| Jensen-Shannon Distance (JSD) | Semantic/embedding drift | >0.1 | Aimotions, Aiman |
| Population Stability Index (PSI) | Input distribution shift | >0.2 | Aigent |
| KL Divergence | Tool usage pattern changes | Significant | Aigent |
| Chi-squared test | Categorical distribution changes | p < 0.05 | Aigent |
| CUSUM | Sustained small shifts in time-series | Varies | All |
| Cosine similarity | Persona/identity drift | <0.85 | Aiman |

---

## Repair Strategies

### Reflexion Loop (All Pillars)

Based on Shinn et al. (NeurIPS 2023, arXiv:2303.11366):

1. Agent attempts task / produces output
2. Evaluator (critic) inspects output against pillar criteria
3. On failure: agent generates verbal self-reflection on what went wrong
4. Agent retries, conditioned on previous error + critique
5. Repeat until success or max retries

### Failure Classification (Aigent-focused)

| Failure Type | Detection | Repair |
|--------------|-----------|--------|
| Input corruption | Validation fails on input | Re-fetch or clean input |
| Context starvation | Missing required information | Request more details/history |
| Tool failure | Tool returns error / timeout | Retry with backoff or alternative tool |
| Reasoning collapse | Nonsensical or contradictory output | Reset to last known good state |
| Output corruption | Output fails schema validation | Regenerate with different parameters |

### FSM Reset (Aidration-focused)

Define valid state transitions. On invalid transition:
1. Halt current execution
2. Roll back to last valid checkpoint
3. Re-plan from checkpoint
4. Log incident for pattern analysis

---

## Statistical Grounding

The scoring model draws on these validated frameworks:

- **Agent Stability Index (ASI)** — Rath 2026: composite metric across 12 dimensions in 4 categories
- **RoleFix** — Wang et al. 2026: hybrid rule-based + LLM-judge detection (F1 0.83–0.89)
- **Google Cloud KPIs** — Three-pillar framework (Reliability, Adoption, Business Value)
- **Galileo** — Four metric families (Quality, Safety, Performance/Cost, Agentic Workflow)
- **Anthropic Autonomy/Risk scoring** — 1–10 scales from millions of interactions

See [`RESEARCH.md`](RESEARCH.md) for full citations and implementation notes.
