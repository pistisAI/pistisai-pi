# Agent Memory Systems & Knowledge Management: Research Summary

**Date:** 2026-09-12
**Scope:** Long-running AI agent memory architectures, consolidation, retrieval, corruption detection, forgetting, persistent implementations, OpenViking, and Aidration pillar mapping.

---

## 1. Memory Architectures

### Cognitive Taxonomy (stabilized across the 2024–2026 literature)

| Type | Holds | Lifetime | Implementation |
|------|-------|----------|----------------|
| **Working** | Current turn context: system prompt, recent messages, scratchpad | Seconds–minutes | Context window + structured scratchpad |
| **Episodic** | Specific past events with timestamps: "Last Tuesday we discussed the API redesign" | Days–forever | Vector store or knowledge graph |
| **Semantic** | Extracted, distilled facts: "User prefers Python, senior eng at 50-person startup" | Forever, updated | Extracted fact records, KB indexes |
| **Procedural** | How the agent works: system prompt, learned heuristics, skills | Updated rarely | Self-edited instructions, skill files |

**Key reference:** CoALA framework; Zhao et al. 2026 survey "Rethinking Memory Mechanisms of Foundation Agents" (arXiv 2602.06052) — provides unified view across three dimensions: substrate (internal/external), cognitive mechanism (episodic, semantic, sensory, working, procedural), and subject (agent- vs. user-centric).

### Production-Grade Multi-Layer Architectures

**ZenBrain** (arXiv 2604.23878) — 7-layer neuroscience-inspired architecture:
- Layers: working, short-term, episodic, semantic, procedural, core, cross-context
- 15 cognitive-neuroscience mechanisms: Two-Factor Synaptic Model, vmPFC-coupled FSRS, Simulation-Selection sleep, Bayesian confidence, etc.
- PMA (Predictive Memory Architecture) adds: NeuromodulatorEngine (DA/NE/5HT/ACh dynamics), ReconsolidationEngine, TripleCopyMemory, PriorityMap (NDCG@10 = 0.997 vs. 0.680 chronological), MetacognitiveMonitor
- On LongMemEval: 91.3% of long-context-oracle accuracy at same token budget

**AdMem** (arXiv 2606.06787) — Unified bi-level design:
- Short-term + long-term stores for semantic, episodic, procedural memory
- Multi-agent architecture: actor, memory, critic agents
- Long-term managed via reward-based evaluation, merging, pruning

**MemTier** (arXiv 2605.03675) — Tripartite architecture for OpenClaw:
- Structured episodic JSONL store → 5-signal weighted retrieval → async consolidation daemon
- LongMemEval-S: +33 pp improvement over full-context baseline on 6 GB GPU

**OS-Style Tiering** (MemGPT / Letta):
- Core (RAM) → Recall (scrollable/searchable) → Archival (vector store / disk)
- Agent explicitly calls `memory.insert()`, `memory.search()`, `memory.swap()`
- **93.4% on Deep Memory Retrieval** (MemGPT headline result)

---

## 2. Memory Consolidation

### Pattern: Compress Experience into Knowledge

The dominant pattern is **tiered consolidation** — promote from raw episodic records to distilled semantic facts:

**MemTier's approach:**
1. Episodic entries stored in JSONL with provenance chains
2. Asynchronous consolidation daemon promotes episodic → semantic tier
3. Heuristic + LLM fact extraction with Jaccard deduplication
4. LLM extraction reduces from 509 to 3.1 facts/question (164× reduction), +51 F1

**TiMem (Temporal-Hierarchical)** (arXiv 2601.02845):
- Temporal Memory Tree (TMT): raw observations → progressively abstracted persona
- Time as explicit structural constraint; consolidation across temporal granularities

**Theanine** (arXiv 2406.10996):
- Memory graph construction (directed graph of summarized memories)
- **Timeline augmentation** for response generation — preserves old memories rather than deleting them, links via temporal/cause-effect relations

**Salience-Weighted Consolidation (SWC)** (arXiv 2608.11775):
- Scores history by salience, partitions into priority tiers
- Structured gist abstraction on mid-priority content
- Outperforms truncation on multi-hop reasoning and single-hop

**Vigil** (github.com/KultMember6Banger/vigil) — practical open-source tool:
- NLI cross-encoder (DeBERTa) for contradiction detection
- Cosine similarity > 0.85 for duplicate detection
- Ebbinghaus-informed exponential decay with access-frequency
- `vigil fix` turns scans into resolution plans; archives stale/duplicate files (never deletes)

### Key Insight from MemTier
> *"LLM fact extraction reduces the semantic tier from 509 to 3.1 facts/question, producing a 51 F1 improvement — precision beats coverage in memory fact extraction."*

---

## 3. Memory Retrieval

### Production Retrieval Pipeline
Query formation → Candidate generation → Ranking (score) → Inject into prompt → LLM generation

### Scoring Formulas

**Generative Agents** (Park et al. 2023) — the canonical multi-factor score:
```
score = weighted_sum(recency, importance, relevance)
recency decays at 0.995 per hour since last access
```
- Fresh core preference (0.9 + 0.9 + 0.8 = 2.6) outranks week-old small talk (0.3 + 0.2 + 0.6 = 1.1)

**CAMeR** (arXiv 2607.20458) — Keyword-gated hybrid activation:
- Combines symbolic (word-level Jaccard) + sub-symbolic (embedding cosine) gating
- **1.6× larger retention gap** between high-frequency and never-referenced memories vs. embedding-only
- Top-5 retrieval saves **83.2% tokens** vs. full-context (39k vs. 231k cumulative)
- Solves the "pet Python vs. Python programming" problem: cosine 0.47 (crosses threshold), Jaccard 0.14 (correctly filtered)

**MemTier** — Five-signal retrieval:
- BM25 + exponential time decay + cognitive weight + tier boost
- Two-stage semantic→episodic scoping reduces retrieval pool
- Attention-attributed cognitive weight update loop links tool outcomes to memory quality

**Mem0** reports: median search latency 0.148 s, p95 1.44 s on LOCOMO vs. 17.1 s full-context baseline.

### Retrieval Best Practices (from cognilium.ai / ReFind paper)
1. **Cosine similarity ≠ relevance** — embedding models frequently fail to beat keyword search outside their training domain
2. **Top-k returns same fact 5 times** — fix with Maximal Marginal Relevance (MMR): score = relevance − redundancy penalty
3. **Hybrid search is essential** — combine vector + keyword + graph; each is blind where others see
4. **ReFind** (arXiv 2608.12888): agent-controlled keyword search over raw chat logs achieves 58.2 mean accuracy, above graph/tree systems (HippoRAG 2: 53.2)

---

## 4. Memory Corruption Detection

### Three Distinct Decay Modes (from InquiringLines / production research)

| Mode | Mechanism | Fix |
|------|-----------|-----|
| **Staleness** | Facts that were true once but aren't now | Deletion + recency-aware curation |
| **Drift** | Quietly accumulating distortion from compression/summarization | Gating + applicability-preserving consolidation |
| **Contamination** | Bad/irrelevant entries polluting retrieval | Write-side admission control |

### The Staleness Problem Is Structurally Hard

**MemStrata** (arXiv 2606.26511) — key finding:
- **Cosine AUROC for separating contradictions from duplicates is 0.59** (random = 0.50)
- Maximum achievable precision is only 0.67
- **Contradictions are MORE embedding-similar than duplicates** — a value-flip is a minimal edit
- **Deterministic supersession rule** (subject, relation, object triple replacement) drives stale-fact errors to ~0%

**STALE** (arXiv 2605.06527) — benchmark of 400 conflict scenarios:
- **Implicit conflict**: later observation invalidates earlier memory WITHOUT explicit negation
- Type I (co-referential): two observations update same attribute
- Type II (propagated): update cascades across attributes (bike commute + broken leg)
- Best models achieve only **55.2% accuracy** — pervasive gap between retrieving updated evidence and acting on it

**ScrubJay-MEM** (arXiv 2608.04746):
- Per-memory, type-conditioned temporal decay (What–Where–When tuples)
- Auto-classified perishability coefficient + utility horizon
- On TGT benchmark: only retrieval-based system with positive Generalization Gap

**Memory Trust Gap** (arXiv 2609.01852):
- Agents over-trust stored info without checking currency
- In Benefit suite, models answer with stale value **0.92–1.00 of the time** at every scale

### Practical Detection: Vigil
```bash
pip install vigil-memory
vigil index ./memory/
vigil scan ./memory/   # finds contradictions, duplicates, stale entries, orphans
vigil fix ./memory/ --apply  # archives (never deletes) stale/duplicate files
vigil serve  # daemon + git pre-commit hook for sub-second gating
```

---

## 5. Forgetting Mechanisms

### Taxonomy (FSFM, arXiv 2604.20300)

| Policy | Trigger | Use Case |
|--------|---------|----------|
| **Passive decay** | Time-based exponential decay | General memory lifecycle |
| **Active deletion** | Explicit signal (fact contradiction) | Superseded knowledge |
| **Safety-triggered** | Sensitive/malicious content detected | Security/privacy |
| **Adaptive reinforcement** | Access-frequency boost | High-value memories |

### Key Forgetting Systems

**Oblivion** (arXiv 2604.00131):
- Forgetting as decay-driven reduction in **accessibility**, not explicit deletion
- Read/write decoupling: Decayer (Ebbinghaus retention score) + Activator (uncertainty-triggered retrieval) + Recognizer (reinforce response-contributing memories)
- "Unused memory traces fade without explicit deletion yet remain reactivable"

**FadeMem** (arXiv 2601.18642):
- Dual-layer: Long-Term Memory (slow decay, β=0.8) + Short-Term (fast decay, β=1.2)
- `v(t) = v(0) * exp(-lambda * (t - tau)^beta)` — lambda adapts to importance

**FSFM** results (arXiv 2604.20300):
- **+8.49% access efficiency, +29.2% signal-to-noise ratio, 100% elimination of security risks**
- Synaptic pruning: eliminate weak/redundant entries to optimize retrieval

**MaRS** (Pfiffer 2025) — 6 forgetting policies:
- FIFO, LRU, Priority Decay (importance-weighted exponential), Reflection-Summary (consolidate before forgetting), Random-Drop, **Hybrid** (best performer)

### Critical Finding from Tianpan.co research
> *"Agents using 'add-all' strategy accumulated 2,400 records, accuracy dropped to 13%. With selective memory management (high-quality only + active deletion): 248 records, 39% accuracy. 3× improvement from storing **less**."*

---

## 6. Persistent Memory Implementations

### Local-First: Markdown + SQLite (dominant production pattern)

**sqlite-memory** (github.com/sqliteai/sqlite-memory):
- Markdown files as source of truth → indexed into SQLite
- Hybrid search: vector similarity (sqlite-vec) + FTS5 full-text
- Local embedding via llama.cpp (nomic-embed-text GGUF)
- Offline-first sync between agents via sqlite-sync (CRDTs)
- Transactional safety, embedding cache, content-hash change detection

**OpenClaw native** (PingCap analysis):
- All memory in `~/.openclaw/memory/{agentId}.sqlite`
- Markdown files chunked by line ranges → embeddings → top-K retrieval
- Falls back to brute-force cosine in pure JS if sqlite-vec unavailable

**vstash** (arXiv 2604.15484):
- Local-first hybrid retrieval with Reciprocal Rank Fusion (RRF)
- Adaptive per-query IDF weighting
- Single SQLite file, sqlite-vec + FTS5

**memweave** (towardsdatascience.com):
- Zero-infra: markdown + SQLite, no vector database required
- Database is derived cache — delete and rebuild from files

### Agent Memory SQLite + Knowledge Graph

**HyMem** (github.com/ClaudetteMedSer/HyMem):
- Local-first, embedded memory for Hermes
- SQLite knowledge graph extracted during idle "dreaming" cycles
- Search: keyword + vector + semantic graph + entity lookup
- Working-memory tier for current session before dreaming

**OpenViking** (ByteDance/Volcengine — the heavyweight):
- Context database, not just vector store
- viking:// URI filesystem: `resources/`, `user/`, `agent/`
- **3 root directories**: resources (docs/repos), user (preferences/memories), agent (skills/patterns)
- **Three-tier loading**: L0 (~50 tokens abstract) → L1 (~500 tokens overview) → L2 (full content)
- **Token savings: up to 91%** on retrieval; on LoCoMo Hermes jumps from 33.38% → 82.86% accuracy
- Session commit → async LLM extraction → categories: user (profile, preferences, entities, events) + agent (cases, patterns, tools, skills)
- Directory-recursive retrieval, visualized retrieval trajectories
- Multi-provider: Volcengine Doubao, OpenAI, Anthropic, DeepSeek, Gemini, Ollama

### Production Frameworks (2026)

| Framework | Best For | Backend |
|-----------|----------|---------|
| **LangMem** | LangGraph integration | Managed + local |
| **Letta** (MemGPT successor) | OS-style explicit memory management | Vector + archival tiers |
| **Mem0** | Fastest integration, managed service | Hybrid vector + graph (49,500 ★) |
| **Zep** | Temporal knowledge graph | Graph-native with time awareness |

### Emerging
- **TencentDB Agent Memory**: 4-tier pyramid (Conversation → Atom → Scenario → Persona), SQLite + sqlite-vec
- **MoltLifeKernel** (Crustafarian): append-only ledger + snapshot/rehydrate + coherence enforcement + witness-gated approval
- **Hindsight** (vectorize-io): fact extraction, entity resolution, reflect loop, merge/decay/eviction policy layer

---

## 7. Memory Quality & Agent Performance Over Time

### Key Findings

**Tool-execution degradation** (MemTier measurement):
- Success rates **drop 14 percentage points over 72-hour operation** in flat-file memory systems
- Four compounding failure modes: context collapse, compaction discontinuity, structural blindness, no attribution loop

**Add-all vs. selective** (arXiv 2505.16067):
- 2,400 records (add-all) → 13% accuracy
- 248 records (selective + active deletion) → 39% accuracy
- **More storage makes performance worse, not better**

**Stale-fact harm** (MERIT, arXiv 2609.05441):
- Controlled memory corruption (stale, contradictory, distractor records) measured
- Metrics: Memory Utilization Rate (MUR), Ignore Rate, Cost-Adjusted Marginal Utility (CAMU)

**Memory migration failures** (arXiv 2609.05339):
- Upgrading models can silently degrade memory performance
- 80% of NOTES accuracy deficit from information lost during initial construction
- Store-only repair of NOTES fails to reach 90% recovery target in all 48 test cases
- **Retaining raw source history enables successful recovery**

### Memory Health Metrics to Track
1. **Retrieval relevance** — % of retrievals that are actually useful
2. **Store growth rate** — faster than expected = bloat
3. **Contradiction ratio** — rising share of conflicting entries = consolidation failure
4. **Access-frequency distribution** — healthy: power-law; unhealthy: uniform (everything "equally important")
5. **Stale-fact rate** — % of retrieved facts superseded by newer information

### Vigil Health Score Formula
```
retention = e^(-t/s)
where s (strength) increases with each access (spaced repetition)
```
Frequently-accessed 90-day-old memory > never-accessed 14-day-old memory.

---

## 8. OpenViking Deep Dive

### Architecture

```
viking://
├── resources/           # Project docs, repos, web pages, source material
│   └── {project}/
│       ├── docs/
│       └── src/
├── user/
│   └── {user_id}/
│       ├── profile/     # User identity
│       ├── preferences/ # Coding habits, tools, languages
│       ├── entities/    # People, projects, orgs
│       └── events/      # Episodic memories
└── agent/
    └── {agent_id}/
        ├── cases/       # Past problem resolutions
        ├── patterns/    # Recognized patterns
        ├── tools/       # Tool usage patterns
        └── skills/      # Learned procedures
```

### Memory Extraction Pipeline (session commit)
```
Messages → LLM Extract → Candidate Memories
    ↓
Vector Pre-filter → Find Similar Memories
    ↓
Candidate(skip/create/none) + Item(merge/delete)
    ↓
Write to AGFS → Vectorize
```

### Key Innovations
1. **VikingFS**: virtual filesystem, Rust AGFS core with Python bindings
2. **HierarchicalRetriever**: fans out vector searches across directories, convergent narrowing, rerank with hotness weighting
3. **Tiered L0/L1/L2 loading** — token savings by progressive detail loading
4. **Visualized retrieval trajectory** — debuggable path showing why a result was selected
5. **Auto-recall + auto-capture** — ON by default; injects relevant memories before every prompt
6. **MCP + LangChain + LangGraph native integration**

### Benchmark Results (OpenViking 0.3.22)
| Agent | Native | With OpenViking | Δ |
|-------|--------|-----------------|---|
| Hermes | 33.38% | 82.86% | **+49.5 pp** |
| OpenClaw | 24.20% | 82.08% | +57.9 pp |
| Claude Code | 57.21% | 80.32% | +23.1 pp |

Plus: **34.3–91% input token reduction**, 58–66% query latency reduction.

### Current Limitations (Hermes plugin issue #5627)
- Plugin uses ~30% of OpenViking API surface
- No `viking_write` for direct exact-content storage
- No `viking_link` for knowledge relations (all memories siloed)
- Extraction is lossy — LLM rewrites can lose fidelity for precise technical content
- No mid-session persistence — crash before commit loses everything

---

## 9. Memory Health → Aidration (Order) Pillar Mapping

### How Memory Health Embodies "Order"

The **Aidration pillar** (order, restoration, structural integrity) maps directly to memory system health:

| Aidration Concept | Memory Equivalent | Metric | Tool/Method |
|-------------------|-------------------|--------|-------------|
| **Structural integrity** | Consistent memory schema, no orphaned entries | Orphan reference count | Vigil scan (`--fix`) |
| **Order from chaos** | Categorized, deduplicated, retrievable knowledge | Duplicate ratio, NDCG@10 | MemTier 5-signal ranking; CAMeR hybrid gating |
| **Restoration** | Recoverable from corruption/crash | Snapshot + ledger + rehydrate | MoltLifeKernel; OpenViking session commit |
| **Decay as order** | Principled forgetting maintains signal-to-noise | Staleness ratio, retrieval relevance | Oblivion decay-driven activation; FSFM selective forgetting |
| **Self-correction** | Detecting and resolving contradictions | Contradiction pair count | Vigil NLI cross-encoder; MemStrata supersession |
| **Temporal grounding** | Knowing what's current vs. historical | Stale-fact error rate | ScrubJay-MEM WWW tuples; STALE benchmark |
| **Auditability** | Explainable retrieval trajectories | Retrieval path logging | OpenViking visualized trajectory; ReFind session-aware rank fusion |
| **Boundary enforcement** | Agent-private vs. project-shared knowledge | Cross-agent contamination | MemTier two-tier isolation model |
| **Health monitoring** | Continuous cognitive health assessment | Composite health score | Vigil `health` trend history; MARIA VITAL 8-failure-mode model |

### Practical Health Checklist for Zoid/Hermes Memory

**Weekly:**
- [ ] Run `vigil scan` on MEMORY.md + skill directory; review contradiction/duplicate count trend
- [ ] Check OpenViking session commit completed (no lost mid-session memories)
- [ ] Review staleness: facts older than 30 days without access → flag for review
- [ ] Verify backup of SQLite index + markdown source

**Monthly:**
- [ ] Full memory audit: re-embed after model upgrades (arXiv 2609.05339: NOTES repair fails without raw source)
- [ ] Consolidation pass: promote high-access episodic → semantic tier
- [ ] Decay pass: archive entries below retrieval threshold for >60 days
- [ ] Benchmark: run LoCoMo-style evaluation on own memory store

**Quarterly:**
- [ ] Re-evaluate memory architecture against current framework versions
- [ ] Test memory portability (can a new model read old notes correctly?)
- [ ] Review procedural memory: skills still current? Confidence scores valid?

---

## Key Library & Tool Recommendations

| Need | Recommendation | Why |
|------|----------------|-----|
| **Local markdown + SQLite memory** | sqlite-memory / vstash / memweave | Zero-infra, local-first, single file |
| **Agent health + continuity** | MoltLifeKernel (Node) | Append-only ledger, crash recovery, coherence |
| **Memory corruption detection** | Vigil (Python) | NLI contradictions, duplicates, staleness, orphans |
| **Production managed memory** | Mem0 (fast) / Zep (temporal) / Letta (OS-style) | 2026 frameworks with proven deployments |
| **Full context database** | OpenViking | Best-in-class retrieval (82.86% on LoCoMo for Hermes) |
| **Hybrid retrieval scoring** | CAMeR approach (keyword Jaccard + embedding cosine) | 1.6× better retention discrimination |
| **Forgetting policy** | FSFM taxonomy (passive/active/safety/reinforcement) | Comprehensive framework with proven efficiency gains |
| **Temporal validity** | MemStrata supersession rule (S-R-O triples) | Drives stale-fact errors to ~0% |

---

## Primary Sources (Chronological)

1. **MemGPT** (Packer et al. 2023) — OS-style virtual memory for LLMs
2. **Generative Agents** (Park et al. 2023) — recency + importance + relevance scoring
3. **LoCoMo** (Maharana et al. 2024) — long-conversation memory benchmark
4. **A-MEM** (Xu et al. 2025) — Zettelkasten-style self-organizing memory
5. **ZenBrain** (arXiv 2604.23878, 2026) — 7-layer neuroscience architecture
6. **MemTier** (arXiv 2605.03675, 2026) — tripartite tiered memory for long-running agents
7. **Rethinking Memory** (Zhao et al. 2602.06052, 2026) — comprehensive survey
8. **Oblivion** (arXiv 2604.00131, 2026) — decay-driven memory control
9. **FSFM** (arXiv 2604.20300, 2026) — selective forgetting taxonomy
10. **CAMeR** (arXiv 2607.20458, 2026) — keyword-gated hybrid activation
11. **STALE** (arXiv 2605.06527, 2026) — implicit conflict detection benchmark
12. **MemStrata** (arXiv 2606.26511, 2026) — temporal validity architecture
13. **ScrubJay-MEM** (arXiv 2608.04746, 2026) — type-conditioned perishability
14. **MERIT** (arXiv 2609.05441, 2026) — memory utility cost-aware benchmark
15. **TiMem** (arXiv 2601.02845, 2026) — temporal-hierarchical consolidation
16. **AdMem** (arXiv 2606.06787, 2026) — unified bi-level multi-agent memory
17. **OpenViking** (ByteDance/Volcengine, 2026) — context database, 30,000+ ★
18. **sqlite-memory** (SQLite AI, 2026) — markdown-first hybrid search extension
19. **Vigil** (github.com/KultMember6Banger/vigil, 2026) — memory health monitor
20. **molt-life-kernel** (X-Loop3Labs, 2026) — agent continuity infrastructure

---

*Compiled for pistisai-pi Aidration pillar research. All findings applicable to local-first RTX 4070 desktop deployment with Zoid/Hermes agent.*