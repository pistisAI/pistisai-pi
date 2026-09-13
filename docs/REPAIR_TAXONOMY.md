# Agent Self-Healing & Repair Strategy Taxonomy
## Comprehensive Research Summary for pistisai-pi

> Compiled: 2026-09-12
> Scope: Full spectrum from lightweight prompt tweaks to full agent restart
> Application: 4 pillars — Aiman (identity), Aigent (capability), Aidration (order), Aimotions (character)

---

## 1. PROMPT-BASED REPAIR

### 1.1 System Prompt Adjustment
- **When to apply:** Agent consistently produces outputs that violate behavioral constraints, role boundaries, or quality standards. Drift detected in Aiman (identity) or Aimotions (character) pillars.
- **Detection:** ASI < 0.75 for 3 consecutive 50-interaction windows; role adherence rate < 90%; boundary violation count > 5% of interactions.
- **Implementation:** Self-Evolving Prompt Optimization (SePO) — treats the prompt agent's own system prompt as an optimization target alongside task agents' prompts. Two-stage: (1) pre-training on diverse task pool to evolve general prompt engineering capacity, (2) fine-tuning on specific task. Archive lets earlier prompts serve as stepping stones.
- **Success data:** Prompt optimization on BabyAI PutNext task: 0% → 72.5% success rate using same LLM with optimized prompts (arXiv:2606.17838). Prompt evaluation accuracy: 46.2% → 64.0% (DSPy study, arXiv:2507.03620).

### 1.2 Context Injection
- **When to apply:** Agent lacks domain knowledge, has outdated information, or encounters novel tool/environment errors.
- **Detection:** Tool execution failures with semantic/contextual errors (not syntactic); hallucination rate > 0.5%; argument hallucination rate > 2%.
- **Implementation:** Post-tool execution reflection + RAG. Construct "repair context" using: natural language query + captured error output + generated tool call as retrieval key. Retrieve from official tool documentation, troubleshooting documents, and domain-specific knowledge bases. Combine key + retrieved results → repair context → pass to repair agent.
- **Success data:** RAG-based reflection significantly improves both pass rate and correctness over non-RAG baseline on 772 failing kubectl commands (arXiv:2510.17874).

### 1.3 Instruction Refinement
- **When to apply:** Agent produces correct reasoning but wrong format; verbose outputs; fails to follow step-by-step requirements; task-specific performance degradation.
- **Detection:** Format Error classification (semantically correct but violates formatting constraints); output validator failures; consistency score drops (same question → path variation).
- **Implementation:** SI-Agent framework — three collaborating agents: Instructor Agent (generates/refines), Instruction Follower Agent (target LLM), Feedback/Reward Agent (evaluates performance + readability). Iterative cycles with LLM-based editing or evolutionary algorithms. PromptWizard: task-aware critique — system evaluates candidate prompt on training data, asks LLM to identify weaknesses, drives targeted improvements.
- **Success data:** SI-Agent generates effective, readable system instructions with favorable performance-interpretability trade-off. PromptWizard demonstrates consistent improvements on GSM8k and Big-Bench.

---

## 2. CONTEXT REPAIR

### 2.1 Conversation History Pruning
- **When to apply:** Context window approaching capacity; attention dilution in long conversations; irrelevant history contaminating reasoning.
- **Detection:** Token count > 80% of context window; declining task success rate over conversation length; increased latency; redundant or off-topic content in history.
- **Implementation:** Selective pruning based on relevance scoring. Remove turns with lowest attention weights or semantic relevance to current task. Maintain summary of pruned content. Sliding window with importance-weighted retention.
- **Success data:** Attention dilution is a known failure mode in long-context agents; selective pruning outperforms uniform truncation on long-range understanding benchmarks.

### 2.2 Context Window Management
- **When to apply:** Multi-session tasks exceed single context window; need to maintain continuity across sessions.
- **Detection:** Session boundary approaching; context overflow; information loss between sessions.
- **Implementation:** Hierarchical memory architecture — raw history (LC-RAW), chunked RAG, compressed natural-language notes (NOTES), fixed-schema knowledge graph (KG-fixed). Each format makes different trade-off: raw uses more context, retrieval can miss, notes can omit evidence, fixed schema limits representation.
- **Success data:** Memory portability study (arXiv:2609.05339) shows upgrading models without rebuilding memory causes performance drops — new model interprets old notes differently, embedding version mismatches break retrieval.

### 2.3 Relevant Context Retrieval
- **When to apply:** Agent needs specific past information; multi-hop reasoning; cross-session knowledge reuse.
- **Detection:** Retrieval failures; agent unable to recall previously established facts; repeated questions from user.
- **Implementation:** MemMA framework — multi-agent coordination of memory cycle. Forward path: strategic construction and retrieval. Backward path: in-situ self-evolving memory construction — synthesizes probe QA pairs, verifies current memory, converts failures into repair actions before finalization.
- **Success data:** MEMMA consistently outperforms baselines across multiple LLM backbones on LoCoMo, improves three storage backends in plug-and-play manner (arXiv:2603.18718).

---

## 3. TOOL REPAIR

### 3.1 Tool Selection Correction
- **When to apply:** Agent selects wrong tool for task; tool usage pattern drift; chi-squared analysis shows significant deviation from baseline.
- **Detection:** Tool selection accuracy < 90%; KL divergence on tool selection distribution; plan adherence < 85%.
- **Implementation:** Pre-call validation — syntax/semantics checks before execution. Fallback on failure. Tool-Conditioned Local Repair (Doctor-RAG) — given diagnosed error type, select repair operator that intervenes only at failure point while reusing validated prefixes.
- **Success data:** Doctor-RAG: Format Error → lightweight answer rewriting; Reasoning Error → evidence-preserving re-reasoning; Retriever Error → query rewriting + retrieval enhancement (arXiv:2604.00865).

### 3.2 Parameter Fixing
- **When to apply:** Tool call has correct tool but wrong/invalid parameters; argument hallucination.
- **Detection:** Argument hallucination rate > 2%; tool execution returns parameter errors; schema validation failures.
- **Implementation:** Post-tool execution reflection + RAG. Use error output + generated tool call as retrieval key. Retrieve from official tool documentation and troubleshooting documents. Construct repair context → generate repaired tool call.
- **Success data:** Syntactic errors identifiable before execution; semantic/contextual errors only after execution + analysis. RAG-based reflection improves both pass rate and correctness (arXiv:2510.17874).

### 3.3 Tool Sequence Reordering
- **When to apply:** Agent executes tools in wrong order; plan deviation; state transition violations.
- **Detection:** Plan adherence < 85% sequence match; state transition validity < 100% (FSM-enforced); tool call sequence doesn't match planned order.
- **Implementation:** Finite State Machines (FSMs) define valid state transitions (Researching → Drafting → Reviewing → Output) to prevent skipping steps. Graph-based orchestration (LangGraph) for explicit cycle definition (Action → Evaluate → Fail → Action). Replanning on deviation.
- **Success data:** FSM approach maps to Aidration (order enforcement). Graph-based orchestration enables self-healing loop (Stevens Institute, 2025).

---

## 4. MODEL SWITCHING

### 4.1 Escalation to Stronger Model
- **When to apply:** Cheap model fails repeatedly; task requires deeper algorithmic reasoning; confidence remains low after retry.
- **Detection:** Repeated failure after N retries; low-confidence output patterns ("I'm not sure", "I cannot determine", "partial implementation", "TODO: escalate"); confidence score below dynamic threshold.
- **Implementation:** Bayesian Self-Escalation — decision-theoretic formulation of intra-generation delegation as optimal-stopping problem. Agent escalates when expected cost of continuing exceeds expected cost of deferral. Myopic escalation threshold in closed form; optimal policy via dynamic programming. Time-varying threshold on competence posterior.
- **Success data:** Escalation frontier dominates post-hoc routing at equal cost. Cumulative competence belief's discrimination rises over generation (arXiv:2608.24087). CodeRescue: CRC-calibrated frontier exceeds always-escalate solve rate while using 35% of mean recovery cost (arXiv:2607.19338).

### 4.2 Fallback Chains
- **When to apply:** Primary model fails or times out; rate limiting; provider errors; task complexity exceeds model capability.
- **Detection:** Rate limit, timeout, provider error; task failure; janitor failure; low-confidence output.
- **Implementation:** Bernstein cascade: sonnet → opus (intra-Claude tier escalation); opus → sonnet → codex → gemini → qwen (cross-adapter failover). EpsilonGreedyBandit per (role, model) pair records observations (success/failure, cost, latency). If cheapest tier observed ≥ MIN_OBSERVATIONS times and success_rate < QUALITY_THRESHOLD, skip to next tier.
- **Success data:** Model cascades can cut inference cost by large factors without sacrificing quality. Cascade routing: many requests are easy — don't pay premium for low-complexity work.

### 4.3 Mid-Generation Handoff
- **When to apply:** Agent notices during reasoning it has left region of competence; inherited trajectory from another model contains reasoning receiver wouldn't have generated.
- **Detection:** Online estimate of eventual task success drops below threshold; competence posterior crosses escalation boundary.
- **Implementation:** Handoff Tax awareness — continuing non-native trajectory places model in unusual position. Receiver must continue trajectory it didn't create, with reasoning it wouldn't have generated and mistakes it wouldn't have made.
- **Success data:** Handoff Tax paper (arXiv:2608.24358) documents performance degradation when switching models mid-trajectory vs. single-model execution.

---

## 5. MEMORY REPAIR

### 5.1 Correcting Persistent Memory
- **When to apply:** Memory contains poisoned, stale, or misattributed records; agent makes decisions based on incorrect stored information.
- **Detection:** Downstream task failures traceable to specific memory entries; memory-agent produces hallucinated content; user corrections contradict stored memory.
- **Implementation:** MemTX — Transactional Belief Commit. Memory write is NOT a belief commit. Tracks whether belief has matured enough to be acted upon; repairs what a retracted belief has contaminated. MemMA backward path: synthesizes probe QA pairs, verifies current memory, converts failures into repair actions.
- **Success data:** MemTX leads all 8 baselines with paired-McNemar significance on 4 backbones, only method with zero downstream harm on every backbone (arXiv:2607.23929). TRUSTMEM reduces omission/corruption/hallucination by 40.1%/79.1%/50.0% (arXiv:2606.25161).

### 5.2 Forgetting Outdated Information
- **When to apply:** Memory contains obsolete information; API/tool migration invalidates stored procedures; user preferences change.
- **Detection:** Stale information in memory; API version mismatch; user explicitly contradicts stored preference; temporal decay of relevance.
- **Implementation:** ChronoMem — semantic version-control layer. Time-aware memory snapshots, version histories, rollback operations driven by explicit version identifiers or natural-language descriptions of desired prior state. MemOREPAIR — barrier-first cascade-repair. Affected descendants withdrawn before repair; successors constructed from retained support; republication restricted to validated predecessor-closed successors.
- **Success data:** Across cascade-unaware systems, 92.4-99.7% of post-event actions still depend on invalidated information. MEMOREPAIR preserves nearly same validated repairs as exhaustive Repair-all while executing substantially less repair work (arXiv:2605.07242).

### 5.3 Dependency-Guided Rollback
- **When to apply:** Faulty memory has already propagated to derived claims, actions, and subsequent memory writes.
- **Detection:** Causal pathway tracing shows error propagation; downstream actions influenced by corrupted source.
- **Implementation:** Dependency-Guided Rollback Repair — given failed execution and diagnosed faulty memories, recover both answer and persistent state while retaining unaffected work. Selective replay with modest LLM-call cost.
- **Success data:** 68.0% recovery vs. 54.0% for next best method; highest claim invalidation F1: 0.669 vs. 0.603 (arXiv:2608.10502).

---

## 6. PERSONA/IDENTITY REPAIR

### 6.1 Restoring Character Consistency
- **When to apply:** Agent drifts from established persona; tone/style inconsistency; user reports "you're acting different"; embedding similarity to baseline persona drops.
- **Detection:** Persona consistency score < 0.85 cosine similarity; tone/style consistency < 0.85 embedding similarity; sentiment drift JSD > 0.1 vs baseline.
- **Implementation:** RoleFix hybrid detection — rule-based checks + LLM-based semantic judgment. Self-repair mechanism inspired by verbal reinforcement learning: triggers reflection, role reassignment, execution resumption. Behavioral anchoring — re-anchor to core identity through explicit persona re-injection in system prompt.
- **Success data:** RoleFix: 67.4% reduction in drift incidents, +23.8 percentage points in task completion, only 8.3% latency overhead. F1 scores: 0.83-0.89 across drift types (Wang et al., 2026).

### 6.2 Re-anchoring to Core Identity
- **When to apply:** Agent exhibits boundary violations; role confusion; multi-agent coordination drift; behavioral boundary violations.
- **Detection:** Boundary violation count > 5% of interactions; role adherence rate < 90%; Agent Stability Index (ASI) < 0.75.
- **Implementation:** Adaptive behavioral anchoring — episodic memory consolidation, drift-aware routing. Explicit re-anchoring prompt: "You are [identity]. Your core traits are [traits]. Re-orient your response to align with these traits." VIGIL system: reflective runtime supervises sibling agent, ingests behavioral logs, diagnoses failure modes, proposes prompt/code changes.
- **Success data:** ASI framework: composite metric across 12 dimensions in 4 categories. Threshold: ASI < 0.75 for three consecutive 50-interaction windows triggers intervention (Rath, 2026).

---

## 7. ESCALATION TO HUMAN

### 7.1 When to Stop and Ask
- **When to apply:** Specifications incomplete/ambiguous; information gaps that cannot be resolved through exploration; contradictory instructions; high-stakes decisions with irreversible consequences.
- **Detection:** Confidence below dynamic threshold; repeated tool failure (≥3 identical tool+args signatures, ≥3 consecutive tool errors); explicit uncertainty expression; anomaly/outlier detection on input; out-of-policy scope.
- **Implementation:** ask_human() tool with targeted question formulation. Well-formed stop: asks one specific question, offers plausible answers, shows only evidence bearing on question, states what agent will do with each answer. Escalation brief: original request, what was attempted, intermediate results, current best guess, why escalated.
- **Success data:** HiL-Bench: frontier models drop from 75-89% pass@3 (full info) to 4-24% when must judge whether to ask. 73% of high-severity incidents occurred because agent continued when it should have escalated. Three failure patterns: overconfident wrong beliefs with no gap detection; high uncertainty yet persistent errors; broad imprecise escalation without self-correction (arXiv:2604.09408).

### 7.2 Calibrated Escalation Patterns
- **When to apply:** Production systems where over- and under-escalation both have costs; need to balance autonomy with safety.
- **Detection:** Confidence miscalibration — stated 90-100% confidence corresponds to 87% actual; stated 70-89% → 58% actual; stated 50-69% → 34% actual. Critical zone: 50-89% stated confidence.
- **Implementation:** Confidence-Threshold Escalation with risk multiplier: adjustedThreshold = baseThreshold × getRiskMultiplier(step.proposedAction). Action-Risk Tiers classify by consequence, not confidence. Volume budget per trigger family. Bind consequence-class triggers to action call itself, not end of turn.
- **Success data:** Disagreement as uncertainty signal — run investigation twice with different retrieval seeds/model, stop when dispositions differ. Judgment is trainable: RLVR on shaped Ask-F1 reward shifts 32B model toward calibrated help-seeking.

### 7.3 Progressive Autonomy / Trust Calibration
- **When to apply:** Long-running agent deployments; building appropriate human reliance; longitudinal trust calibration.
- **Detection:** Human approve/deny feedback patterns; time-decaying trust kernel; regions where approval outcome is most uncertain.
- **Implementation:** Gaussian-process posterior over latent human risk-tolerance function. Escalate exactly where approval outcome is most uncertain (active learning / Bayesian optimization). Policy gateway maintains posterior, observed through probit likelihood on binary approve/deny feedback.
- **Success data:** Progressive Autonomy as Preference Learning (arXiv:2605.19151) — formalizes trust calibration as preference-learning problem with time-decaying kernel for longitudinal calibration.

---

## 8. REFLEXION-BASED REPAIR

### 8.1 Self-Reflection + Retry Loops
- **When to apply:** Task failure; output doesn't meet success criteria; agent produces plausible but incorrect output; any pillar drift detected.
- **Detection:** Output validation against explicit success criteria; evaluator/critic inspects output; task-specific failure signals.
- **Implementation:** Actor-Critic loop: (1) Actor attempts task, (2) Evaluator/Critic inspects output against criteria, (3) On failure: agent generates verbal critique via Self-Reflection, (4) Agent retries conditioned on previous error + critique. NOT blind retry — agent explicitly reasons about its own failure.
- **Success data:** Outperforms GPT-4 on HumanEval. VIGIL system (derivative) reduced premature success notifications from 100% to 0% (Shinn et al., NeurIPS 2023). Self-Healing Agent Pattern: 73% reduction in silent failures, recovery time from hours to seconds, 91% less manual intervention (DEV.to, 2025).

### 8.2 Post-Tool Execution Reflection
- **When to apply:** Tool execution fails; semantic/contextual errors detected after execution; environment state unexpected.
- **Detection:** Tool execution returns error; environment state doesn't match expected post-condition; stderr trace analysis.
- **Implementation:** Capture error output + tool call + query → construct repair context → reflection agent generates critique → retry with modified approach. Combine with RAG for domain-specific repair knowledge.
- **Success data:** RAG-based reflection on 772 failing kubectl commands: both pass rate and correctness more likely to improve vs. non-RAG baseline (arXiv:2510.17874).

### 8.3 Verbal Reinforcement Learning
- **When to apply:** Repeated task failures; need to accumulate experience across attempts; agent must learn from its own critiques.
- **Detection:** Multiple failed attempts on same/similar task; consistent error patterns across attempts.
- **Implementation:** Verbal reinforcement learning — agent's self-critiques serve as training signal. Archive of past critiques and outcomes. Role reassignment + execution resumption based on reflection.
- **Success data:** RoleFix: 67.4% reduction in drift incidents, +23.8 pp task completion, 8.3% latency overhead (Wang et al., 2026).

---

## 9. RAG-BASED REPAIR

### 9.1 Retrieving Relevant Knowledge to Correct Errors
- **When to apply:** Factual errors in output; hallucination detected; knowledge gaps identified; tool execution failures.
- **Detection:** Hallucination rate > 0.5%; factual inconsistency between output and retrieved evidence; unsupported claims in generated text.
- **Implementation:** Doctor-RAG: trajectory-level failure diagnosis (distilled diagnosis model assesses evidence sufficiency, classifies failure type, localizes earliest failure point) → tool-conditioned local repair (intervene only at diagnosed point, reuse validated prefixes). D2R-RAG: triangulated verification combining textual entailment checks + structured consistency checks against knowledge graph.
- **Success data:** Doctor-RAG: Format Error → answer rewriting; Reasoning Error → re-reasoning with full coverage; Retriever Error → query rewriting + retrieval enhancement. RAGentA: +10.7% faithfulness over standard RAG (arXiv:2604.00865, arXiv:2606.29377).

### 9.2 Answer-Conditioned Counterevidence Retrieval
- **When to apply:** First-pass answer may be wrong; need to verify candidate answers against evidence; short-form factual QA.
- **Detection:** Candidate-selection errors; first-pass retriever optimized for topic relevance not candidate discrimination; near-miss answers (wrong year, nearby entity, almost-right title).
- **Implementation:** CounterRefine: treat first answer as hypothesis to test. Issue answer-conditioned expansion queries to retrieve candidate-specific evidence. Constrained KEEP or REVISE refinement step — proposed revisions accepted only after deterministic validation.
- **Success data:** Improves over matched retrieval baseline under official SimpleQA evaluation pipeline (arXiv:2603.16091).

### 9.3 Claim-Level Hallucination Repair
- **When to apply:** Generated answer contains unsupported factual claims; need granular correction without rewriting entire output.
- **Detection:** Individual factual claims unsupported by retrieved source; claim-level verification against evidence.
- **Implementation:** Split flagged answer into individual factual claims. Check each against retrieved source. Three repair strategies of increasing richness: (1) delete unsupported claim, (2) replace with source text, (3) ask model to rewrite.
- **Success data:** Claim-level repair targets unsupported part of sentence rather than whole sentence. Replacement with source text stays close to evidence but can read awkwardly; model rewrite keeps most of answer but creates fresh opportunity to be wrong (arXiv:2608.29307).

---

## 10. MULTI-AGENT REPAIR

### 10.1 Critic/Repair Agent
- **When to apply:** Primary agent produces output needing verification; high-stakes decisions; policy-sensitive operations; code generation.
- **Detection:** Output requires validation against plan + policy; safety/compliance checks needed; secondary audit warranted.
- **Implementation:** Critic agent pattern — secondary model audits primary agent execution logs against plan + policy. RIVA: two-agent cross-validation — verifier agent checks outputs, tool generation agent produces alternative commands. Iterative cross-validation + multi-perspective verification + tool call history tracking.
- **Success data:** RIVA recovers task accuracy from 27.3% (baseline ReAct) to 50.0% with erroneous tools; 28% → 43.8% without (arXiv:2603.02345). Google Cloud KPI framework: critic agent pattern for secondary check on each pillar.

### 10.2 Orchestrator-Workers + Reflexion
- **When to apply:** Complex tasks decomposable into parallel subtasks; need both reliability and efficiency.
- **Detection:** Task complexity exceeds single-agent capability; parallelizable subtasks identified; reliability requirements high.
- **Implementation:** Central orchestrator decomposes tasks, delegates to specialized workers, aggregates results. 5-20x speedup via parallelization. Reflexion loop for reliability. FSM for valid state transitions. Graph-based orchestration for explicit cycle definition.
- **Success data:** Orchestrator-Workers: 5-20x speedup via parallelization. VIGIL: reflective runtime supervises sibling agent, ingests behavioral logs, diagnoses failure modes, proposes prompt/code changes (Stevens Institute, 2025).

### 10.3 Two-Agent Analyze → Optimize
- **When to apply:** System prompt optimization; continuous improvement; performance analysis-driven refinement.
- **Detection:** Performance degradation trends; error pattern accumulation; need for iterative prompt/workflow optimization.
- **Implementation:** Insights Agent analyzes observability traces, generates insights (error patterns, failure types). Evolution Agent optimizes system prompts based on performance analysis. Integrates with LangSmith, Langfuse for trace analysis.
- **Success data:** Two-agent pattern (analyze → optimize) is concrete implementation template for repair trigger (Adaptive Self-Healing, 2026).

### 10.4 Multi-Agent Debate / Verification
- **When to apply:** High-stakes reasoning; need for diverse perspectives; error detection through disagreement.
- **Detection:** Single-agent reasoning may have blind spots; task benefits from multiple approaches; consensus required.
- **Implementation:** Multiple agents with different perspectives/roles evaluate same output. Disagreement triggers deeper analysis. Consensus mechanism for final decision.
- **Success data:** Disagreement as uncertainty signal — run investigation twice with different retrieval seeds/model, stop when dispositions differ (Omnidatatec, 2026).

---

## STRATEGY SELECTION MATRIX

| Pillar | Primary Strategy | Secondary Strategy | Detection Signal |
|--------|-----------------|-------------------|------------------|
| **Aiman** (identity) | Persona/Identity Repair (6) | Prompt-Based Repair (1) | Role adherence < 90%, boundary violations > 5% |
| **Aigent** (capability) | Tool Repair (3) + RAG Repair (9) | Model Switching (4) | Tool accuracy < 90%, hallucination > 0.5% |
| **Aidration** (order) | Context Repair (2) + Reflexion (8) | Escalation to Human (7) | Plan adherence < 85%, state transition invalid |
| **Aimotions** (character) | Persona/Identity Repair (6) | Prompt-Based Repair (1) | Tone consistency < 0.85, sentiment drift JSD > 0.1 |
| **Cross-cutting** | Reflexion-Based Repair (8) | Multi-Agent Repair (10) | ASI < 0.75, silent failure rate > 1% |

---

## REPAIR ESCALATION LADDER (Lightest → Heaviest)

1. **Prompt tweak** — adjust system prompt, inject context, refine instructions (milliseconds, free)
2. **Context repair** — prune history, retrieve relevant context, manage window (milliseconds, low cost)
3. **Tool repair** — fix selection, parameters, sequence (seconds, tool call cost)
4. **Reflexion loop** — self-reflect + retry with critique (seconds, 1-2 extra LLM calls)
5. **RAG-based repair** — retrieve domain knowledge, repair context (seconds, retrieval + LLM call)
6. **Model escalation** — switch to stronger model (seconds, higher per-token cost)
7. **Memory repair** — correct persistent state, rollback, cascade fix (seconds, multiple LLM calls)
8. **Multi-agent verification** — critic agent, cross-validation (seconds, 2-3x LLM calls)
9. **Human escalation** — stop and ask (minutes, human time cost)
10. **Full restart** — reset to last known good state, replay from checkpoint (variable, highest cost)

---

## KEY SOURCES

1. SePO: Self-Evolving Prompt Agent — arXiv:2606.04465
2. Environment-Grounded Prompt Optimization — arXiv:2606.17838
3. Prompt Codebooks — arXiv:2605.28360
4. PromptWizard (Microsoft) — starlog.is/articles/ai-agents/microsoft-promptwizard
5. SI-Agent — arXiv:2507.03223
6. Survey of Automatic Prompt Optimization — arXiv:2502.18746
7. DSPy Prompt Optimization — arXiv:2507.03620
8. Self-Healing Agent Pattern — dev.to/the_bookmaster/2025
9. Orchestrator-Workers + Reflexion — online.stevens.edu/blog/2025
10. Reflexion (Shinn et al., NeurIPS 2023) — arXiv:2303.11366
11. RoleFix — preprints.org/manuscript/202603.0348
12. Agent Drift (Rath, 2026) — arXiv:2601.04170
13. Agent Stability Index (ASI) — InsightFinder, 2025
14. Google Cloud KPIs — cloud.google.com/transform/2026
15. Anthropic Measuring Autonomy — anthropic.com/research/2026
16. Galileo Agent Observability — galileo.ai/blog/2026
17. XenonStack KPIs — xenonstack.com/blog/2025
18. CodeRescue — arXiv:2607.19338
19. Bayesian Self-Escalation — arXiv:2608.24087
20. Handoff Tax — arXiv:2608.24358
21. Model Routing Strategies — genaiconsulting.services/blog/2026
22. MemTX — arXiv:2607.23929
23. MemMA — arXiv:2603.18718
24. MemOREPAIR — arXiv:2605.07242
25. Dependency-Guided Rollback — arXiv:2608.10502
26. Memory Portability — arXiv:2609.05339
27. TRUSTMEM — arXiv:2606.25161
28. ChronoMem — arXiv:2607.27773
29. Causal Pathway Tracing — arXiv:2608.30198
30. HiL-Bench — arXiv:2604.09408
31. Progressive Autonomy — arXiv:2605.19151
32. Human-in-the-Loop Orchestration — mindra.co/blog/2026
33. Human Handoff Patterns — brahimbouine.com/blog/2026
34. When Agent Should Stop — omnidatatec.com/insights/2026
35. Doctor-RAG — arXiv:2604.00865
36. CounterRefine — arXiv:2603.16091
37. D2R-RAG — arXiv:2606.29377
38. Claim-Level Hallucination Repair — arXiv:2608.29307
39. RAG-Based Tool Repair — arXiv:2510.17874
40. Corrective Agentic RAG — emergentmind.com/topics/corrective-agentic-rag
41. RIVA — arXiv:2603.02345
42. Union.ai Self-Healing — union.ai/blog-post/2026
43. Adaptive Self-Healing — medium.com/@madhur.prashant7/2026
44. VIGIL System — Stevens Institute, 2025
45. Bernstein Cascade — bernstein.readthedocs.io
46. E.D.D.I Model Cascade — docs.labs.ai
47. Agent Self-Monitoring Research — pistisai-pi/agent-self-monitoring-research.md
48. pistisai-pi-research.md (existing research file)

---

## IMPLEMENTATION RECOMMENDATIONS FOR pistisai-pi

1. **Start with detection:** Implement ASI composite metric across 4 pillars with 50-interaction windows
2. **Layer repairs light-to-heavy:** Begin with prompt/context repair, escalate through Reflexion → RAG → model switch → human
3. **Pillar-specific strategies:**
   - Aiman: RoleFix-style hybrid detection + behavioral anchoring
   - Aigent: Doctor-RAG-style tool repair + RAG-based reflection
   - Aidration: FSM enforcement + plan adherence monitoring
   - Aimotions: Embedding similarity tracking + persona re-anchoring
4. **Use HiL-Bench's ask_human() pattern** for escalation — targeted questions, not open-ended review requests
5. **Budget-calibrated recovery:** CodeRescue-style router choosing between reflect/replan/escalate based on cost-effectiveness
6. **Memory safety:** MemTX-style transactional belief commit — don't treat every write as immediately actionable truth
