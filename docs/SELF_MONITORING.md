# Agent Self-Monitoring & Introspection: Research Summary

> For: pistisai-pi project (watchdog monitoring Hermes/Zoid agent)
> Context: 4-pillar framework (Aiman/Aigent/Aidration/Aimotions), Reflexion pattern
> Goal: Practical, TypeScript/Pi-extension implementable patterns

---

## 1. Structured Self-Reporting (Agent Health/Status)

### Core Pattern
Define a JSON Schema the agent must conform to on every turn. This is a **contract** between the agent and the watchdog. Constrained decoding (grammar-masked logits) eliminates syntax errors; semantic validation catches hallucinated field values.

### Minimal Health State Structure
From Zylos Research (2026):
```python
@dataclass
class AgentHealthState:
    pid: int
    last_heartbeat: datetime       # Updated every N seconds by main loop
    last_progress_event: datetime  # Updated when meaningful state advances
    iteration_count: int            # Total tool calls / LLM invocations
    progress_metric: float          # Domain-specific: test pass rate, steps completed
    recent_actions: deque            # Last N action hashes for repetition detection
```

### Hierarchical Health (Multi-Agent)
From Zylos AI Agent Observability (2026):
- Root supervisor exposes `/health` that recursively queries children
- Aggregation follows **"worst status wins"**
- Timeouts at each level prevent single unresponsive agent from blocking
- Per-subsystem status enables nuanced routing: "live" but not "ready" (rate-limited LLM), "ready" but "degraded" (slow vector DB)

### Validation Architecture
From "Structured Outputs: The Contract Between Your Agent and Everything Else" (Carson Rodrigues):
```typescript
// Retry with inline validation errors — model self-corrects on 2nd try
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const raw = await callModel(input, feedback);
  const result = SchemaV2.safeParse(tryParse(raw));
  if (result.success) return result.data;
  feedback = `Validation failed:\n` +
    result.error.issues.map(i => `- ${i.path.join(".")}: ${i.message}`).join("\n");
}
// After max retries: fall back to human queue or typed "extraction failed"
```

### Key Providers
- **OpenAI**: `response_format: { type: "json_schema", strict: true }` — GA since gpt-4o-2024-08-06
- **Anthropic**: `output_config.format` with JSON schema
- **Gemini**: `response_schema` with `responseMimeType: "application/json"`
- **Self-hosted (vLLM/SGLang/llama.cpp)**: `guided_json` via XGrammar or GBNF grammar

### Implementing for Pi Extensions
- Define schema with Zod or JSON Schema
- Use `tool_use` forced mode (tool_choice: {"type": "tool", "name": "report_status"})
- Validate at application boundary even after provider-side enforcement
- Track retry rate per field as leading indicator of agent health

**Sources**: [Zylos Research](https://zylos.ai/research/2026-03-07-ai-agent-observability-health-monitoring-diagnostic-patterns), [Carson Rodrigues](https://carsonrodrigues.com/blog/structured-outputs-agents), [Zylos Structured Output](https://zylos.ai/research/2026-04-11-structured-output-constrained-decoding-production-agents-2026)

---

## 2. Metacognition Prompts

### Five-Stage Introspective Evaluation
From Wang et al. (2023), EmergentMind (2026):
1. Understand the input
2. Make an initial judgment
3. Critically evaluate preliminary answer
4. Provide final answer with reasoning
5. State confidence (0–100%) and explain

Formally: `prompt → x₀ (initial) → x₁ (critique) → x₂ (refined answer) → x₃ (confidence+rationale)`

### Multi-Dimensional Self-Assessment
From "Beyond Confidence" (arXiv 2605.07806v1, 2026):
Instead of just confidence, elicit **6 appraisal-based dimensions**:
- Confidence
- Effort
- Affective evaluation
- Knowledge sufficiency
- Strategic awareness
- Complexity assessment

These predict failure better than confidence alone across 12 LLMs and 38 tasks.

### Self-Evaluation Prompt Template (CalVerT, 2026)
```
You are an AI assistant that reports calibrated telemetry with every action.
For each turn, respond with JSON:
{
  "action": "commit|retrieve|refine|decompose",
  "confidence": <float 0.0-1.0>,
  "grounding": <float 0.0-1.0>,
  "rationale": "<why this confidence level>"
}
Confidence: align with actual certainty. Low confidence → retrieve more.
Grounding: how well-supported is your claim by available evidence?
```

### Verbalized Confidence Scale (Uncertainty-Aware LLM, Dataforcee 2026)
```
0.90-1.00 → very high: well-established fact, certain
0.75-0.89 → high: strong knowledge, minor uncertainty
0.55-0.74 → medium: plausible but could be outdated
0.30-0.54 → low: significant uncertainty, best guess
0.00-0.29 → very low: mostly guessing, minimal reliable knowledge
Be CALIBRATED — do not always give high confidence.
```

### Intra-Trajectory Steering Prompt
From "Steer, Don't Solve" (Gandhi et al., CMU):
```
Every 10 steps, review the trajectory and provide high-level feedback
using the error taxonomy:
- Specification (S1-S4)
- Reasoning (R1-R4)
- Coordination (C1-C4)
Never prescribe specific commands. Only redirect strategy.
```

**Sources**: [EmergentMind Metacognitive Prompting](https://emergentmind.com/topics/metacognitive-prompting-mp), [Beyond Confidence (arXiv 2605.07806)](https://arxiv.org/pdf/2605.07806v1), [CalVerT (arXiv 2606.21777)](https://arxiv.org/pdf/2606.21777v1), [Steer, Don't Solve (Codex blog)](https://codex.danielvaughan.com/2026/08/17/steer-dont-solve-small-critic-models-large-code-agents-codex-cli-guardian-posttooluse-hooks-intra-trajectory-feedback)

---

## 3. Confidence Calibration Measurement

### Metrics
- **Expected Calibration Error (ECE)**: standard metric for LLMs. Buckets predictions by confidence, measures gap between accuracy and confidence per bucket.
- **Brier Score**: proper scoring rule for probabilistic predictions. `BS = (1/N) Σ (f_i - o_i)²` where f=forecasted prob, o=outcome (0/1)
- **Wrong@High-Confidence**: % of incorrect answers where confidence ≥ 0.80/0.90/0.95. Key production metric.
- **meta-d'**: signal-detection-theory measure of metacognitive sensitivity (how well confidence discriminates correct from incorrect)

### Scale Design Matters
From "Rescaling Confidence" (arXiv 2603.09309v1, 2026):
- Standard 0–100 scale: 78% of responses cluster on 3 round-number values
- **0–20 scale improves metacognitive efficiency** over 0–100
- Boundary compression degrades performance
- LLMs have limited semantic understanding of numerical ranges

### Calibration Measurement Loop
```typescript
// Track calibration per agent run
interface CalibrationTracker {
  predictions: Array<{confidence: number, correct: boolean}>;
  
  ece(numBins = 10): number {
    // Sort by confidence, compute |avg_accuracy - avg_confidence| per bin
  }
  
  wrongAtHighConfidence(threshold: number): number {
    // % of high-confidence predictions that were wrong
  }
  
  brierScore(): number {
    // Mean squared error between confidence and correctness
  }
}
```

### Key Findings
- LLMs are **systematically overconfident** (Kadavath et al., 2022; Chhikara, 2025; Zhao et al., 2026)
- Reasoning models show **better calibration** but **diminished "I don't know" response rates** (arXiv 2504.06564)
- Self-consistency (multiple samples) improves calibration over single-shot
- **RLMF** (Reinforcement Learning with Metacognitive Feedback, arXiv 2606.32032): surpasses standard RL by up to 63% in calibration
- MetaFaith prompt-based calibration: first systematic study of faithful uncertainty (arXiv 2505.24858)
- CalVerT telemetry: surface calibrated confidence + grounding at each agent turn to guide action selection

### When Confidence ≠ Accuracy
Use **confidence tokens** (Self-REF, arXiv 2410.13284): fine-tune model to emit a special confidence token that routes to larger model or abstains when confidence is low. Better than verbalized confidence for downstream routing.

**Sources**: [Rescaling Confidence (arXiv 2603.09309)](https://arxiv.org/pdf/2603.09309v1), [Beyond Confidence (arXiv 2605.07806)](https://arxiv.org/pdf/2605.07806v1), [MetaFaith (arXiv 2505.24858)](https://arxiv.org/html/2505.24858v1), [RLMF (arXiv 2606.32032)](https://arxiv.org/pdf/2606.32032v1), [Self-REF (arXiv 2410.13284)](https://arxiv.org/pdf/2410.13284v3), [CalVerT (arXiv 2606.21777)](https://arxiv.org/pdf/2606.21777v1)

---

## 4. Self-Reflection Loops (Reflexion Pattern)

### Core Architecture
From Shinn et al. (2023), Reflexion: Language Agents with Verbal Reinforcement Learning:

```
function reflexion_agent(task, max_trials):
  memory = []
  for trial in range(max_trials):
    solution = actor.generate(task, memory)
    success, feedback = evaluator.evaluate(solution, task)
    if success: return solution
    reflection = reflector.critique(task, solution, feedback, memory)
    memory.append(reflection)
  return "Failed after max trials"
```

### Three Phases
1. **Attempt**: Agent produces output/action
2. **Evaluate**: External signal scores it (test suite, schema validator, tool error, human/verifier LLM)
3. **Reflect**: On failure, agent writes first-person critique naming mistake and what to do differently

### Reflection Prompt Template
```python
def reflect(task: str, action: str, eval_feedback: str) -> str:
    sys = ("You are a critic. Explain why the action failed and give ONE concrete correction. "
           "Be specific. Do not rewrite the whole solution.")
    user = f"Task: {task}\nAction: {action}\nFeedback: {eval_feedback}\nWhat went wrong?"
    return call_llm(sys, user)
```

### Reflexion vs Self-Refine
| Property | Self-Refine | Reflexion |
|----------|-------------|-----------|
| Feedback source | Model's own critique | External pass/fail |
| Retries | Single session, critique-revise | Multiple full attempts |
| Memory | None across attempts | Reflection text carried forward |
| Best for | Checkable output in one shot | Tasks with retry-level verification |

### Key Results
- **Stanford Reflexion**: HumanEval pass rate 80% → 91% via verbal self-correction (no weight updates)
- AlfWorld: +22% absolute over ReAct baseline across 12 learning steps
- Works when: retries possible, failures externally detectable, error describable in one sentence
- Fails when: no external signal, non-resettable tasks, reflection itself hallucinates

### Anti-Drift Guardrails
From "Self-Improving AI Agents: Reflection + Anti-Drift" (openclawindex.com):
- Reflections are **hypotheses, not facts** — never treat agent's own summaries as truth without external validation
- Three drift patterns: semantic (divergent but syntactically valid), coordination (consensus breakdown), behavioral (unplanned strategies)
- Trigger reflection only on: tasks >2 min, multi-step work, user corrections, failed tool calls, incomplete results

### Implementation for Pi Extensions
```typescript
interface ReflexionState {
  task: string;
  maxTrials: number;
  reflections: string[]; // episodic memory buffer
  trial: number;
}

// On each trial: prepend accumulated reflections to system prompt
const memory = reflections.map((r, i) => `Reflection ${i+1}: ${r}`).join("\n");
const systemPrompt = BASE_PROMPT + "\n\nPrior learnings:\n" + memory;
```

**Sources**: [Shinn et al. 2023 - Reflexion](https://arxiv.org/abs/2303.11366), [Detached Node](https://detached-node.dev/agentic-design-patterns/reflexion), [SurePrompts Guide](https://sureprompts.com/blog/reflexion-prompting-guide), [n4n AI Implementation](https://n4n.ai/blog/reflexion-how-verbal-self-critique-boosts-agent-accuracy), [CallSphere Comparison](https://callsphere.ai/blog/self-correcting-agents-reflexion-critic-react-loops-compared-2026)

---

## 5. Heartbeat / Liveness Checks

### Pattern: Independent Watchdog
From "The Watchdog Pattern" (dev.to/meridian-ai):
```python
# Inside agent: every loop cycle, touch a file
from pathlib import Path
HEARTBEAT = Path(".heartbeat")

def loop_iteration():
    HEARTBEAT.touch()
    do_work()
```

```bash
# Watchdog (separate process via cron, NOT the agent)
MAX_AGE=300
if [ -f "$HEARTBEAT" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$HEARTBEAT") ))
  if [ "$AGE" -gt "$MAX_AGE" ]; then
    echo "Heartbeat stale (${AGE}s). Restarting..."
    pkill -f "agent-loop"
    nohup python3 agent-loop.py &
  fi
fi
```

### Critical: Watchdog Must Be Independent
A frozen agent can't check its own health. Use multiple independent observers:

| Observer | What it checks | Frequency |
|----------|---------------|-----------|
| Job Cycle Watchdog | Process liveness, heartbeat age | Every 10 min |
| Fitness Scorer | Quality metrics, task completion | Every 30 min |
| Infrastructure Auditor | CPU, memory, disk, ports | Every 10 min |
| Self-Verifier | Output correctness | Every 5 min |
| Coordinator | Cross-agent correlation | Every 5 min |

### Stuck Detection (Three Failure Modes)
From Zylos Research (2026):
1. **Repeater** — same tool call repeatedly without state change
2. **Wanderer** — active but disconnected from original goal
3. **Looper** — alternates between small fixed action set without resolution

All manifest as "high activity, zero progress."

### Liveness vs Readiness vs Startup (Kubernetes model)
- **Liveness probe**: kill and restart if failing (is process alive?)
- **Readiness probe**: remove from load balancer but don't kill (is it ready to serve?)
- **Startup probe**: give slow-starting containers extra time

### Heartbeat Payloads (Production)
From Zynd AI:
```json
{
  "type": "heartbeat",
  "agent_id": "zns:d52a64d1...",
  "timestamp": 1712756400,
  "signature": "ed25519:..."
}
```
Signed with agent's private key, verified against public key by registry.

### Exit-State Authority (Anti-Burn Pattern)
From "Claude Code's Orchestrator Bug" (blog.balakumar.dev):
- **Persist explicit exit_state on every agent loop**, including failure paths
- Replace process liveness with **last_tool_call_age**: if no tool call in N seconds → idle; if M >> N seconds → stuck
- Do NOT distinguish "agent working" from "agent alive but idle" — both should not trigger restart

### TypeScript Implementation
```typescript
interface HeartbeatConfig {
  intervalMs: number;
  progressStallMs: number;  // No progress for this long = suspect
  heartbeatDeadMs: number;  // No heartbeat = dead
}

class LivenessMonitor {
  private lastHeartbeat: number = Date.now();
  private lastProgress: number = Date.now();
  private recentActions: string[] = [];
  
  tick() { this.lastHeartbeat = Date.now(); }
  progress() { this.lastProgress = Date.now(); }
  
  isAlive(): boolean {
    return (Date.now() - this.lastHeartbeat) < config.heartbeatDeadMs;
  }
  
  isMakingProgress(): boolean {
    return (Date.now() - this.lastProgress) < config.progressStallMs;
  }
  
  isRepeating(): boolean {
    // Last N actions are identical
    return this.recentActions.slice(-5).every(a => a === this.recentActions[this.recentActions.length - 1]);
  }
}
```

### Silence Windows by Agent Role
| Role | Silence Window |
|------|---------------|
| Interactive assistant | 60 s |
| Background job orchestrator | 5 min |
| Long-running pipeline step | 30 min |
| Scheduled automation | 1 h |

**Sources**: [Watchdog Pattern (dev.to/meridian-ai)](https://dev.to/meridian-ai/the-watchdog-pattern-how-to-build-ai-systems-that-fix-themselves-207n), [Zylos Self-Healing](https://zylos.ai/research/2026-03-02-ai-agent-self-healing-recovery-patterns/), [Claude Code Heartbeat Bug](https://blog.balakumar.dev/2026/07/21/claude-codes-orchestrator-was-burning-tokens-on-idle-heartbeats-and-nobody-at-anthropic-bothered-to-tell-you), [Zynd AI Heartbeat](https://docs.zynd.ai/v2/build/agents/heartbeat.html), [Agent Runtime Control Protocol](https://github.com/agentruntimecontrolprotocol), [Graphorin Heartbeat](https://docs.graphorin.com/guide/proactivity), [Gunbark Supervision Thresholds](https://gunbark.dev/content/c9ab79cb-e842-45b6-87f3-6b6f4494babc)

---

## 6. Critic Agent Patterns

### Generator-Critic Split
From Antigravity (2026), simplest baseline:
```python
def self_critique(changes: str, max_iterations: int = 3) -> tuple[str, list[str]]:
    feedback: list[str] = []
    for i in range(max_iterations):
        # 1. Generator drafts
        draft = generator.generate(changes, feedback="\n".join(feedback) if feedback else "(none)")
        # 2. Critic evaluates
        critique = critic.evaluate(draft)
        if critique.verdict == "APPROVED":
            return draft, feedback
        feedback.append(critique.notes)
    return draft, feedback  # best effort after max iterations
```

### Critic Output Schema
```typescript
interface Critique {
  score: number;       // 0-10
  verdict: "pass" | "fail";
  issues: string[];    // specific, actionable notes
}

function passes(c: Critique): boolean {
  // Require BOTH pass verdict AND score above threshold
  return c.verdict === "pass" && c.score >= 8.0;
}
```

### Critic-Agent Loop (Towards AI, 2026)
```python
MAX_ITERS = 3
def solve_with_critic(task, worker_llm, critic_llm):
    answer = worker_llm.produce(task)
    for attempt in range(MAX_ITERS):
        critique = critic_llm.review(task, answer)  # returns Critique
        if passes(critique):
            return answer, critique, "passed"
        answer = worker_llm.revise(task, answer, critique.issues)
    return answer, critique, "escalate_to_human"  # never silently ship
```

### Key Pitfall: Use Different Model Families
- Same model self-critiquing → confirms its own bias
- **Use a different model family** for critic (e.g., Claude generator + GPT critic)
- Or use a smaller, fine-tuned critic model for high-volume paths

### Multiple Specialized Critics (2026 variant)
From CallSphere: run **multiple critic personas** that vote:
- **Skeptic**: finds reasons the draft is wrong
- **Logician**: checks internal consistency
- **Creative**: evaluates originality/style
- Majority vote → ship or iterate

### Adversarial Critic Pattern
From ProspectAI: critic has **explicit adversarial goal** — find every reason draft is wrong (not confirm it's right). Three passes:
1. Draft Strategist proposes solution
2. Critic attacks (no tools, no delegation, purely adversarial)
3. Final agent consumes both draft + critique → revised output

### Critic Placement Options
| Placement | Use Case | Cost |
|-----------|----------|------|
| Pre-execution (plan review) | Block flawed plans before tool calls | 1 extra model call |
| Post-generation (output review) | Catch errors before shipping to user | 1 extra model call |
| Intra-trajectory (every k steps) | Redirect agent mid-run (Gandhi et al.) | k/N extra calls |
| Post-hoc (after full run) | Score completed trajectory, store for next time | 1 extra call |

### When to Use Critic
- Output quality matters more than speed
- Automatic quality gates needed
- Human review impractical (high volume, real-time)
- Wrong outputs are expensive to reverse

### When NOT to Use Critic
- Simple tasks where re-running is cheaper than critic overhead
- Subjective success criteria (critic produces inconsistent verdicts)
- Latency-critical (irreducible extra LLM call)

### Implementation for Pi Extensions
```typescript
interface CriticConfig {
  model: string;           // Different from primary agent
  systemPrompt: string;
  passThreshold: number;
  maxIterations: number;
  personas?: string[];     // For multi-critic voting
}

class CriticAgent {
  async evaluate(output: string, task: string): Promise<Critique> {
    const prompt = `Evaluate this ${task}:\n\n${output}\n\n` +
      `Rate 0-10. List specific issues. End with PASS or FAIL.`;
    return this.llm.generate(prompt, CRITIC_SCHEMA);
  }
}
```

**Sources**: [CallSphere Reflection+Critic](https://callsphere.ai/blog/vw7g-reflection-critic-multi-agent-pattern-2026), [Beyond the Agent Loop (Medium)](https://medium.com/@select_asterisk/beyond-the-agent-loop-building-a-self-critiquing-agent-bcfe3302ad7c), [Critic-Agent Loop (Towards AI)](https://towardsai.com/p/machine-learning/building-a-critic-agent-loop-scores-refinement-and-guardrails), [Adversarial Critic (ProspectAI)](https://prospect-ai.moisesprat.dev/architecture/patterns/adversarial-critic), [Critic Agent Pattern (agentpatterns.ai)](https://agentpatterns.ai/patterns/agent-design/critic-agent-plan-review), [Steer, Don't Solve (CMU)](https://codex.danielvaughan.com/2026/08/17/steer-dont-solve-small-critic-models-large-code-agents-codex-cli-guardian-posttooluse-hooks-intra-trajectory-feedback), [Antigravity Self-Critique](https://antigravitylab.net/en/articles/agents/antigravity-self-critique-reflection-patterns)

---

## Cross-Cutting Patterns

### Multi-Agent Diagnostic Architecture
From Zylos AI Ops (2026):
- Dedicated 4th process runs 13 health checks every 10 seconds against 3 other agents
- Detection latency: hours → 10 seconds; crash recovery: manual → under 30 seconds
- Preprocess runbooks into **execution DAGs** to prevent step-skipping and query hallucination
- Three-tier escalation: auto-heal → alert-and-propose (human approves) → escalate (page)

### Self-Evolving Memory Loop
From HealthClaw/Fudan (arXiv 2607.13940, 2026):
- Closed loop: perception → reasoning → action → post-episode induction
- Post-episode: assigns each item a future role instead of appending full dialogue
- Prevents context overflow while preserving actionable learnings

### Graduated Response Ladder (Samuel Ochoa)
Four rungs, agent tries each before escalating:
1. **Notify** — send structured message, continue
2. **Retry** — with context from failure
3. **Disable** — turn off future runs until human resets
4. **Page** — urgent human intervention

### Budget-Aware Reflection
- Cap all loops at N iterations (typically 2-3)
- Never silently ship failing output → escalate_to_human
- Track cost per reflection cycle; cheaper critic models for high-volume paths

---

## Implementation Roadmap for pistisai-pi

### Immediate (TypeScript/Pi extensions)
1. **Structured health schema** — Zod schema for agent self-reporting (confidence, action, rationale, grounding)
2. **Heartbeat monitor** — Independent process checking agent liveness via file mtime or /health endpoint
3. **Validation gate** — Schema-validated output at every agent boundary (retry with errors on failure)
4. **Calibration tracker** — Log confidence vs correctness, compute ECE/Wrong@HighConfidence per run

### Short-term
5. **Critic agent integration** — Secondary model reviewing primary agent output before submission
6. **Reflexion loop** — On failure, write reflection → prepend to next attempt → bounded retry
7. **Stuck detection** — Track recent_actions for repetition, last_progress_event for stalls

### Medium-term
8. **Multi-critic voting** — Skeptic + Logician + Specialist personas
9. **Intra-trajectory steering** — Every k steps, inject strategy-level feedback from small critic model
10. **Hierarchical health tree** — Recursive /health across agent topology with "worst status wins"
11. **Calibration-aware routing** — Low confidence → retrieve more / abstain / route to human

---

## Key Research Citations

| Paper/Resource | Year | Key Contribution |
|----------------|------|------------------|
| Shinn et al., Reflexion | 2023 | Verbal self-correction without weight updates |
| Kadavath et al., Self-Check | 2022 | LLMs are systematically overconfident |
| Wang et al., MetaPrompt | 2023 | Five-stage introspective evaluation |
| Liu et al., MetaFaith | 2024 | Faithful calibration benchmark (16 models, 10 datasets) |
| Tian et al., Just Ask | 2023 | Verbalized confidence is prompt-sensitive |
| Gandhi et al., Steer Don't Solve | 2025 | Intra-trajectory critic better than post-hoc |
| Vinod et al., CalVerT | 2026 | Calibrated confidence + grounding as agent telemetry |
| Xiong et al., Can We Focus? | 2024 | Self-consistency for calibration |
| Guo et al., CRANE | 2025 | Alternating constrained/unconstrained decoding |
| Self-REF (arXiv 2410.13284) | 2024 | Confidence tokens for LLM routing |
| RLMF (arXiv 2606.32032) | 2026 | RL with metacognitive feedback (+63% calibration) |
| Rescaling Confidence (arXiv 2603.09309) | 2026 | 0–20 scale beats 0–100 for metacognition |
| Beyond Confidence (arXiv 2605.07806) | 2026 | 6-dimensional appraisal for failure prediction |
| Thinking Out Loud (arXiv 2504.06564) | 2024 | Reasoning models better calibrated but less "I don't know" |
| Zylos AI Agent Observability | 2026 | Hierarchical health trees, stuck detection taxonomy |
| Zylos Self-Healing | 2026 | Failure detection taxonomy, three failure modes |
