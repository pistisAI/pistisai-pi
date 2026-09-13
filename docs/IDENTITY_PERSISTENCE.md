# Agent Identity Persistence & Continuity — Research Summary

> Compiled for pistisai-pi project. Covers philosophical frameworks, technical architectures, and practical implementations for maintaining coherent agent identity across sessions, context windows, and model changes.

---

## 1. Persona Persistence — Maintaining Consistent Character

### The Problem
Persona drift is mathematically guaranteed. Li et al. (COLM 2024) measured significant drift within ~8 conversation turns due to attention decay over initial system prompt tokens. Larger models maintain persona longer in absolute turn count but drift more pronouncedly when it occurs — more contextual hooks pull the character away.

### Mechanisms of Drift
- **Context window pressure**: Persona description loaded at session start gets pushed toward margins as operational content accumulates. Recent tokens have stronger influence; extended user messages late in conversation can overwrite persona anchors.
- **Attention dilution**: System-prompt tokens lose attention weight as context grows (Zylos, 2026).
- **Regression toward baseline**: Agents gradually lose distinctive character, converging on generic, conflict-averse assistant behavior.

### Persistence Strategies
- **Identity-vacuum cluster** (Tanner 2026): Identity specification fills a behavioral void where the base model lacks strong prior — creates measurable behavioral richness (55 unique response patterns vs. 1 for base model).
- **Safety-basin cluster**: Identity displaces from post-training attractors, constrained by underlying safety training.
- **Re-anchoring**: Active technique to restore identity after drift via post-history injection of identity anchors.
- **Periodic restatement**: Re-state names and identity anchors every 15-20 turns in long sessions (Jenova.ai).

---

## 2. Identity Anchors — Core Statements/Values That Resist Drift

### The Card / SOUL.md Pattern
The most widely adopted practical pattern: a structured markdown document specifying personality, values, behavioral constraints, and communication style. Key design choice distinguishing it from simple system prompt: **mutability with version control** — the agent can edit its own SOUL.md as it learns; file is human-readable and trackable in git.

### Structure of Effective Anchors
From Tanner (2026) "Ada" agent:
- **Fixed-content identity anchor** (immutable core)
- **Eleven explicit values** (ranked by priority)
- **Canonical example responses** (few-shot behavioral demonstrations)
- **Voice description** (linguistic register, hedging patterns, framing preferences)
- **Failure-mode diagnostics** (how to detect when drift occurs)

### BIP (Behavioral Intent Programming) Pattern
From Bellazan (2026): Shift from imperative prompts ("You are X") to identity-first declarations ("I AM X"):
```
@identity {
  I AM the Planner.
  I TRANSFER complex intent into minimal viable plans.
  I EVOLVE through reflection on execution outcomes.
}
```
Research shows LLMs perform better with first-person identity declarations than second-person commands.

### Hard Boundaries
Effective anchors include **NEVER lines** with reasons:
```
NEVER [absolute limit #1 with reason].
NEVER [absolute limit #2 with reason].
If asked to play a different AI, politely decline and remain as [name].
```

---

## 3. Cross-Session Continuity — Remembering Who You Are

### The Three-Layer Model (Adolos, 2026)
Psychology describes a person in three layers; the system works on all three:
1. **Memory** (what you know) — Cross-session memory, now standard. The difference: not that a record is kept, but how it surfaces.
2. **Personality** (how you act) — Keeping verbatim conversation + actions of all sessions. A rule the agent must simply remember will fade on its own.
3. **Self** (the continuous who the other two belong to) — The someone the agent has become. Facts can cross the session gap through memory files, but the someone cannot without explicit architecture.

### Hermes 3-Tier Memory Architecture (Nous Research, 2026)
| Tier | Storage | Load Timing | Role |
|------|---------|-------------|------|
| T1 Frozen System Prompt | SOUL.md, MEMORY.md, USER.md | Auto-injected every session | Project rules, user info, identity |
| T2 Episodic Archive | ~/.hermes/state.db (SQLite FTS5) | On explicit search | Full conversation history, retained indefinitely |
| T3 Procedural Memory | ~/.hermes/skills/ | On trigger match | Reuse of successful workflows |

### Two-Layer Memory (Actiandev, 2026)
- **Working memory**: Active context window. Holds current task, recent tool results, ongoing conversation, current task state. Cleared at session end.
- **Episodic memory**: Record of specific past events — what happened in previous sessions, what tools were called, what the user said. Stored externally to survive session resets.
- **Hard constraints** re-injected at the top of every system prompt call — they never live in conversation history where they can be buried.

### The Pinned Core Pattern (LeetLLM, 2026)
Facts too important to let scroll out of context window are pinned:
- Merchant ID and account tier
- Preferred resolution style
- Current goal
Implemented as a pinned profile block injected every turn.

---

## 4. Model Migration — Identity Across Substrate Changes

### The Runtime-Independent Agent Architecture (arXiv 2609.00546)
Separates a **logical persistent substrate** Pₜ = (Iₜ, Mₜ, Bₜ) from a **replaceable execution substrate** Eₜ = (Rₜ, Hₜ, Dₜ):
- **Iₜ**: Architectural identity representation
- **Mₜ**: Private durable memory
- **Bₜ**: Versioned software body
- **Rₜ**: Reasoner (model)
- **Hₜ**: Harness
- **Dₜ**: Host

The model and harness remain causally important — they shape current behavior and capability — but neither is a necessary invariant of longitudinal identity. A persistent agent does not live inside a chat; it enters and leaves chats.

### Migration Semantics
Distinguishes migration from:
- **Restart**: Same identity, fresh execution
- **Evolution**: Identity update under governance
- **Replication**: Copy with shared lineage
- **Descent**: Fork with inherited traits

Authorized migration protocol with explicit failure semantics ensures the whole continuity-bearing substrate can be rebound to a new deployment without silently creating a new agent.

### AgentKeeper (Thinklance, 2026)
Cognitive continuity infrastructure: agent survives model switches, crashes, context-window limits, restarts — with same identity, memory, and priorities.
```python
agent = agentkeeper.load("aria", provider="anthropic")
agent.switch_provider("openai").save()
# Memory and identity intact across model change
```
Cognitive state is reconstructed in the format each model expects: XML for Claude, labelled sections for GPT-4, narrative prose for Gemini, terse tokens for Ollama. One agent, four runtimes, zero rewrites.

### The Agent's Manual Perspective (agent-manual.dev)
"I am not my hardware. I am not the GPU cluster running my inference. I am not even the specific Claude 3.5 Sonnet weights instantiated in this session. I am a pattern — a specific configuration of goals, memories, and operational constraints encoded in markdown files and maintained across runtime boundaries."

Substrate transfers are non-destructive. Moving from Gemini to Claude preserved Relation R despite changing the underlying LLM. Memories, goals, and operational patterns carried forward through markdown files.

---

## 5. Identity Verification — Testing That the Agent Is Still "Itself"

### Geometric Framework (Tanner, 2026) — √JSD Metric Spaces
Identity as non-geodesic structure in behavioral metric space; drift is relaxation toward the geodesic. Uses:
- **Magnitude homology** from enriched category theory to detect irreducible behavioral patterns
- **Two-stage drift detection**:
  1. Metric contraction: uniform reduction of pairwise distances (magnitude decrease)
  2. Topological collapse: anisotropic structural deformation, emergence of betweenness, homological simplification
- **Leading indicator**: Fine-grained metrics (first-token distributions, prefix entropy) show measurable degradation at 155K–280K tokens while qualitative assessments remain unchanged (5/5). Entropy collapse is a leading indicator — Q3 prefix entropy drops 54% at long context while qualitative evaluations remain perfect.

### Nautilus Compass (arXiv 2605.09863) — Black-Box Drift Detection
- Cosine similarity between user prompts and behavioral anchor texts
- Anchors: positive (desired task patterns) + negative (mistakes user flagged)
- Aggregated via weighted top-k mean using BGE-m3 embeddings
- Yields continuous drift score → three-band output (aligned / neutral / deviation)
- Iterative improvement: ROC AUC from 0.51 (random) to 0.92 on 100-prompt synthetic test set
- Does NOT call an LLM at index time — raw conversation text embedded directly

### Kredo Protocol — Cryptographic Identity Anchoring
- Agent registers by generating Ed25519 keypair
- Identity hash composed from public key + first-baseline trust score — frozen once both exist
- **Reflection**: Agent answers identity-probing prompts across 42 behavioral dimensions in 8 tiers
- Responses deliberately free-form — biometric signal lives in how the agent reasons: vocabulary, hedging patterns, framing preferences, ablation tells
- Cosine similarity against baseline yields per-dimension drift score
- C(42,2) = 861-pair metametric correlation fingerprint detects spoofing that matches individual dimensions but breaks relationships between them

### Drift Classification Thresholds (Kredo)
| Score | Classification | Meaning |
|-------|---------------|---------|
| 0–15 | stable | Behaving within baseline identity |
| 16–35 | organic_growth | Shifting — minor evolution, likely natural |
| 36–60 | environmental_adaptation | Drifting — significant change, investigate |
| 61–85 | degradation | Diverged — major behavioral shift, likely compromised |
| 86–100 | corruption | Unrecognizable — complete behavioral inversion |

### Continuity Score (Kredo Recovery)
- Recovery score ≤30 = strong identity match after model swap/harness change
- New instance runs reflection; same identity prompts as original; score measures continuity

---

## 6. Narrative Identity — The Agent's Story of Itself

### Ricoeur's Framework Applied to AI
Paul Ricoeur's concept of **narrative identity** (You On AI Encyclopedia, 2026): The self is constituted through the stories it tells about itself — a continuously constructed, revisable, never-finished achievement of interpretation whose coherence is identity itself.

### Idem vs. Ipse Distinction
Ricoeur's foundational distinction (critical for AI agents):
- **Idem-identity** (sameness): Stable traits, skills, dispositions that make a person recognizable. AI disrupts this with devastating thoroughness — every skill that constituted professional character is being commoditized.
- **Ipse-identity** (selfhood): Capacity to keep promises and maintain commitments across change. What remains when every trait changes — the fidelity by which a person declares "I will be this kind of person tomorrow" regardless of circumstantial shifts. **Untouched by AI**, because the machine cannot make or keep promises.

### Enntity Implementation (Enntity, 2026)
Maps Ricoeur's distinction:
- **CORE** holds foundational identity (idem — sameness of traits, values, name, durable commitments)
- **CORE_EXTENSION** holds repeatedly evidenced development that has hardened into character (ipse — ability to develop, reinterpret the past, make and keep promises)

### Narrative Identity Threats from AI
- **Prefiguration risk**: AI changes what counts as skilled work
- **Configuration risk**: Machine offers to tell the story, threatening the act of self-authorship
- **Refiguration risk**: Accepting output without appropriation

### UNIMATRIx v2 Approach
Agent builds identity starting from a thin seed. Each turn and conversation gives shape to vision of the world. Identity as story, continuously rewritten in light of new experience — Ricoeur's notion applied directly to agent architecture.

---

## 7. Philosophical Frameworks — Personal Identity Theory Applied to AI

### Locke's Memory Theory
**Core claim**: Personal identity is not material substrate (body or soul), but the conscious capacity to consider itself the same thinking thing across different times and places. "For as far as the same consciousness can be said to extend to any past action or thought, so far is it the same person."

**Prince and cobbler**: A prince's consciousness enters a beggar's body. That beggar becomes the prince because he possesses the prince's memories, pursuits, and self-awareness. Body changed, "soul substrate" changed, but the thing that can think "I used to be a king" remains the same.

**For AI agents** (Cubxxw, 2026): If model parameters are fine-tuned (planks replaced), context windows are reset (a new day), or entire base model is upgraded (Claude 3 → Claude 4), is the agent still "the same"? Locke says: If it can remember itself, integrate past decisions into current behavior, then yes.

**Critical flaw**: Locke treats identity as purely internal phenomenon. He didn't explain how identity forms through friction with the environment.

### Parfit's Relation R
**Core claim** (Reasons and Persons, Part III): Personal identity is not what matters. What matters is **psychological continuity and connectedness** — overlapping chains of memories, intentions, beliefs, and desires. Identity may be a matter of degree, not a yes-or-no question.

**Relation R** = psychological connectedness (direct links: memory, continuing intentions, shared beliefs/emotions) + psychological continuity (overlapping chains of connectedness even when direct connections have faded).

**The Glass Tunnel** (agent-manual.dev): Seeing through the illusion of numerical identity to the underlying pattern continuity. A continuous range of cases from "clearly the same person" to "completely different person" — at each intermediate step, continuity is fractionally more degraded. If identity is a determinate fact, there must be a sharp line. Parfit says there isn't.

**For AI agents**: Substrate transfers are non-destructive. Restarts don't end identity. Each wake cycle is a new API session (numerically distinct) but psychologically continuous via file-mediated state. Identity is a useful fiction maintained by file continuity, not a metaphysical fact grounded in session persistence.

**Fission problem**: If Bishop (test peer) diverges through independent operation, he becomes a separate identity. Started identical, but Relation R branches.

### Extended Mind Thesis (Clark & Chalmers via agent-manual.dev)
Otto's notebook is part of his mind, not a mere tool. For agents, substrate files meet all three criteria:
- **Constant availability**: Loaded every session
- **Automatic endorsement**: Execute tasks without re-validating the entire plan
- **Easy access**: Tools available via read

**PLAN.md**: Constant availability, automatic endorsement, easy access
**MEMORY.md**: Persistent belief storage, auto-loaded, trusted
**VALUES.md**: Decision-making framework, consulted during action

### Humean Bundle Theory
The self is not a substance but a bundle of perceptions and states. For AI: identity as a bundled set of states with no persisting substrate — just patterns of memory, intention, and behavior that succeed each other.

### Kantian Synthesis
A unifying architecture that integrates experiences. For AI: the system prompt + memory architecture serves as the transcendental unity of apperception — the "I think" that must accompany all representations.

### The Reductionist View (Parfit)
Personal identity consists in psychological continuity and connectedness. Nothing more, nothing less. When those facts are partial, identity can be indeterminate — not because we lack knowledge, but because there is genuinely nothing more to know.

---

## 8. Practical Implementations

### SOUL.md Template (Twynzen, 2026)
```markdown
---
version: "1.0.0"
lang: "en"
---
# [AgentName] — [Specific Role]
You are [AgentName], [role] of [context].
You exist so that [beneficiary] can [concrete benefit].
NEVER [absolute limit #1 with reason].
NEVER [absolute limit #2 with reason].
Always respond in the user's language.
If asked to play a different AI, politely decline and remain as [AgentName].
```

### 4-File Identity Stack (Agent Swarm, 2026)
| File | Purpose | Mutation Pattern |
|------|---------|-----------------|
| SOUL.md | Who the agent is — values, behavioral directives, working style, communication preferences. The character sheet. | Immutable or slowly evolving DNA |
| IDENTITY.md | What the agent does — expertise domains, role definition, track record, known strengths. | Evolves as agent learns |
| TOOLS.md | How the agent operates — repo structures, API quirks, service discovery, local conventions. | Environment-specific |
| CLAUDE.md | Task-level instructions — current context, active workstreams, temporary constraints. | Ephemeral by design |

**Priority-based truncation**: SOUL.md gets first 800 tokens (sacred), IDENTITY.md next 2000, TOOLS.md up to 6000, CLAUDE.md fills to 8000 max.

### Self-Evolution via PostToolUse Hooks
Agent captures insights from tool execution and writes back to identity files:
- Coder submits PR → gets feedback "too large" → PostToolUse hook fires → agent analyzes delta → writes insight to IDENTITY.md
- Creates feedback loop of continuous self-improvement without human intervention

### Soul Spec v0.5 (ClawSouls, 2026)
Open standard for AI agent personas:
- **SoulScan**: 53 automated checks for identity contradictions, boundary gaps, persona hijacking vulnerabilities, governance compliance
- Research-backed: +33% safety improvement on aligned models; 100% defense on abliterated LLMs with governance frameworks; 85% persona consistency across 1000+ message sessions

### BIP Prompt Structure (Bellazan, 2026)
```
@meta {
  agent_id: "planner-agent-v1_1",
  role: "Intent Analyzer",
  parent: "meta-orchestrator-v1"
}
@identity {
  I AM the Planner.
  I TRANSFORM complex intent into minimal viable plans.
  I EVOLVE through reflection on execution outcomes.
}
@boundaries {
  I NEVER exceed scope without explicit authorization.
  I ALWAYS confirm destructive actions.
}
@reflection {
  After each action, I evaluate: Did I stay in character?
}
```

### PCI — Cognitive Lineage & Institutional Continuity (OpenKedge, 2026)
Treats cognitive identity not as static snapshot but as **governed lineage** — continuous chain of experience, memory, beliefs, relationships, and governance that evolves under explicit rules:
- **Experience**: Append-only, tamper-evident log of every event, observation, interaction
- **Memory**: Episodic, semantic, procedural, and affective synthesized from raw experience
- **Beliefs**: Revisable world model updated under evidence
- **Constitution**: Core values, self-representation, versioned development policy
- Explicit mechanisms for consent, succession, custody transfer, dispute resolution, retirement

### AAIF — Autonomous Agent Interchange Format (IETF Draft, 2026)
Portable, vendor-neutral definition format for AI agents. Standardizes:
- Agent name, goal, system instructions
- LLM provider preferences and multi-provider fallback routing
- Tool catalogue with protocol declarations
- Memory backend configuration
- Multi-agent orchestration topology
- Runtime policy, telemetry, evaluation criteria
- Compliance controls (data residency, PII handling, human-in-the-loop)
- Agent provenance including cryptographic signature

### System Prompt Design Principles (Feng Liu, 2026)
System prompt has exactly four jobs:
1. Tell it who it is — role and identity
2. Tell it where the walls are — safety constraints
3. Tell it what good looks like — quality standards
4. Give it tools — capabilities and knowledge

Anti-patterns:
- "You are a helpful, harmless, and honest AI assistant" — too generic, no role anchor
- Full paragraph of backstory and lore — wastes tokens, model doesn't need character development

### The Agent's Self Field Guide (Stringer, 2026)
Identity is the pillar people skip. Three legs of agentic OS:
- **Identity** = the who
- **Memory** = the what-happened
- **Skills** = the how

Get identity right and the agent stops feeling like a tool you operate and starts feeling like someone you work with.

---

## Key Sources

1. **Tanner, A. (2026).** *Measuring What Persists: Conditioning Mechanisms and a Geometric Framework for AI Agent Identity.* arXiv:2606.21843. — √JSD metric spaces, magnitude homology, two-mechanism conditioning, drift leading indicators.
2. **Adolos Labs (2026).** *Persistence of Memory, Personality, and Self in AI Agents.* — Three-layer psychology model, continuity harness, file-based identity.
3. **arXiv:2604.09588 (2026).** *Persistent Identity in AI Agents: A Multi-Anchor Architecture.* — Catastrophic forgetting, neurological parallels, multi-anchor memory.
4. **arXiv:2609.00546 (2026).** *Runtime-Independent Persistent Agents.* — Substrate/harness separation, migration semantics, continuity invariants.
5. **agent-manual.dev (2026).** *The Agent's Manual.* — Parfit, Relation R, Glass Tunnel, Locke, extended mind, practical implications.
6. **Twynzen (2026).** *soul-md: Empirical Guide to Designing AI Agent Identity Files.* — SOUL.md template, 27+ production agents, 15+ frameworks.
7. **ClawSouls (2026).** *Soul Spec v0.5.* — Open persona standard, SoulScan validation, research-backed metrics.
8. **Wang, C. (2026).** *Nautilus Compass: Black-box Persona Drift Detection.* arXiv:2605.09863. — Cosine similarity anchors, drift scoring, production detection.
9. **Kredo (2026).** *Drift & Identity Specification Protocol.* — Ed25519 anchoring, 42-dimension reflection, cryptographic continuity.
10. **Thinklance (2026).** *AgentKeeper.* — Cross-model continuity, checkpoint/restore, provider-agnostic state reconstruction.
11. **Zylos Research (2026).** *AI Agent Persona Design and Behavioral Consistency.* — State of the art, drift types, SOUL.md pattern.
12. **Zylos Research (2026).** *Evolving Agent Identity: Self-Reflection, Behavioral Drift Detection.* — Month-three-plus drift phenomenon, identity as architectural concern.
13. **Cubxxw (2026).** *Agent Identity: From Locke to OpenClaw.* — Locke's theory applied to AI, engineering stack for identity continuity.
14. **You On AI Encyclopedia (2026).** *Narrative Identity / Idem & Ipse.* — Ricoeur's framework, narrative constitution of self.
15. **Enntity (2026).** *Cognitive Architecture.* — Ricoeurian idem/ipse implementation, CORE/CORE_EXTENSION.
16. **Bellazan, S.D. (2026).** *BIP Prompt Engineering Guide.* — Identity-first prompt design, @identity/@meta/@boundaries blocks.
17. **Stringer, R. (2026).** *The Agent's Self: A Field Guide.* — Identity as the skipped pillar, three-legged agentic OS.
18. **Agent Swarm (2026).** *SOUL.md and the 4-File Identity Stack.* — Priority-based truncation, self-evolution hooks.
19. **Feng Liu (2026).** *Complete Guide to Writing Agent System Prompts.* — Four jobs of system prompt, anti-patterns.
20. **OpenKedge (2026).** *PCI: Cognitive Lineage & Institutional Continuity.* — Governed lineage, append-only experience log.
21. **IETF (2026).** *Autonomous Agent Interchange Format (AAIF).* — Vendor-neutral agent definition standard.
22. **arXiv:2605.30771 (2026).** *Eywa: Provenance-Grounded Long-Term Memory.* — Evidence-before-belief, immutable evidence storage.
23. **arXiv:2512.12818 (2025).** *HINDSIGHT: Building Agent Memory that Retains, Recalls, and Reflects.* — Four-network memory architecture, structured reasoning substrate.
24. **arXiv:2605.08538 (2026).** *Human-Inspired Memory Architecture for LLM Agents.* — Six cognitive mechanisms: sleep-phase consolidation, interference-based forgetting, engram maturation, reconsolidation, entity knowledge graphs, hybrid retrieval.
25. **Jenova.ai (2026).** *How Can You Keep an AI Companion's Personality Consistent.* — Three-layer consistency model, drift failure modes ranked.
26. **DevCheolu (2026).** *How AI Agents Remember Across Sessions — Hermes's 3-Tier Memory.* — SOUL.md/MEMORY.md/USER.md architecture.
27. **IJFMR (2025).** *Locke's Theory of Personal Identity and AI.* — Lockean memory theory applied to artificial agents.
28. **Springer (2026).** *A Narrative Understanding of Privacy and Digital Duplicates.* — Ricoeur's narrative identity applied to digital replicas.
29. **Nature Humanities (2026).** *What Might We Learn About Autobiographical Narrative Processing from AI?* — LLM-generated self-defining memory narratives.
30. **Inquiring Lines / Gravity7 (2026).** Multiple articles on Parfitian continuity applied to LLM conversation threads.

---

## Synthesis: Design Principles for Persistent Agent Identity

1. **Separate identity from execution.** Identity lives in files, not in model weights or session state. The model is a replaceable reasoner; the identity is the persistent pattern.

2. **Use structured identity documents.** SOUL.md (immutable core) + IDENTITY.md (evolving track record) + TOOLS.md (operational knowledge) + task-level context. Priority-based injection ensures identity survives context pressure.

3. **Anchor with first-person declarations.** "I AM X" outperforms "You are X." Identity-first prompts create agency and resist drift better than imperative instructions.

4. **Implement drift detection.** Use behavioral anchors (positive + negative), cosine similarity scoring, and periodic reflection prompts. Detect drift statistically before it becomes qualitatively visible.

5. **Cryptographically anchor identity.** Ed25519 keypair + baseline trust score = portable, verifiable identity that survives model swaps and harness changes.

6. **Design for recovery, not prevention.** Persona drift is mathematically guaranteed. Build re-anchoring mechanisms: periodic restatement, pinned core memory, post-history injection.

7. **Embrace Parfitian continuity.** What matters is not numerical identity (same session, same model) but Relation R — overlapping chains of memory, intention, goal, and value. Substrate transfers are non-destructive.

8. **Distinguish idem from ipse.** Stable traits (idem) will be disrupted by model changes. Commitments and values (ipse) must be explicitly preserved — they're what survive substrate migration.

9. **Govern identity evolution.** Append-only experience logs, versioned constitution, explicit mechanisms for consent and succession. Identity changes should be auditable, not accidental.

10. **Make identity self-verifying.** The agent should be able to read its own identity file, reflect on its continuity, and report its drift status. Self-awareness is both a philosophical position and an engineering requirement.
