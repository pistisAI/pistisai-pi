# Adaptive Learning & Feedback Loops for Agent Monitoring Systems
## Research Summary for pistisai-pi (4-Pillar Monitoring & Repair System)

**Date:** September 12, 2026  
**Sources:** 40+ papers and industry references (full citations at end)

---

## Executive Summary

This research covers 8 complementary learning mechanisms that create a **virtuous cycle** for agent monitoring: detection → diagnosis → repair → outcome tracking → learning → better detection. The key insight from current literature (2025-2026) is that modern agent monitoring systems must close the loop between observing behavior and improving future observations **without requiring GPU retraining** — through lightweight online learning, bandit algorithms, causal inference, and structured experience memory.

---

## 1. RLHF for Monitoring: Learning Which Alerts Matter

### Core Concept
Apply Reinforcement Learning from Human Feedback (RLHF) principles to alert triage — learn a reward model that predicts which alerts human operators consider actionable, then use that model to prioritize and filter alerts.

### How It Works
- **Feedback signal:** Human operators label alerts as "actionable" vs "noise" (implicit feedback: acknowledged, escalated, ignored)
- **Preference pairs:** Given two alerts from same context, which did the operator act on first?
- **Reward model:** Learns to score alert utility; updated online from operator behavior
- **Alert ranking:** Score × urgency = priority queue position

### Implementation Pattern

```python
class AlertRewardModel:
    """
    Lightweight online reward model for alert prioritization.
    Uses pairwise preference learning — no GPU required.
    """
    def __init__(self, feature_dim: int = 32):
        # Simple logistic regression updated online via SGD
        self.weights = np.zeros(feature_dim)
        self.bias = 0.0
        self.lr = 0.01
        self.preference_buffer = []  # (alert_a, alert_b, preferred_a)
    
    def score(self, alert_features: np.ndarray) -> float:
        """Predict alert utility score (higher = more actionable)."""
        z = np.dot(self.features, alert_weights) + self.bias
        return 1.0 / (1.0 + np.exp(-z))  # sigmoid
    
    def record_preference(self, alert_a, alert_b, preferred_a: bool):
        """Record pairwise preference from operator behavior."""
        self.preference_buffer.append((alert_a, alert_b, preferred_a))
        if len(self.preference_buffer) >= 10:
            self._update_from_preferences()
    
    def _update_from_preferences(self):
        """Bradley-Terry pairwise loss — O(n) update, no GPU."""
        for a, b, preferred_a in self.preference_buffer:
            s_a, s_b = self.score(a), self.score(b)
            # P(a preferred) = sigmoid(s_a - s_b)
            prob = 1.0 / (1.0 + np.exp(-(s_a - s_b)))
            target = 1.0 if preferred_a else 0.0
            grad = prob - target
            # SGD update
            self.weights -= self.lr * grad * (a - b)
            self.bias -= self.lr * grad
        self.preference_buffer.clear()
    
    def record_outcome(self, alert, was_actionable: bool):
        """Direct feedback signal when operator resolves alert."""
        target = 1.0 if was_actionable else 0.0
        pred = self.score(alert.features)
        error = pred - target
        self.weights -= self.lr * error * alert.features
        self.bias -= self.lr * error
```

### Sources & Evidence
- **MERIT (arXiv:2608.05906):** Uses dual-polarity memory (positive/negative repair outcomes) conditioned on failure type — 66.34% → 69.79% accuracy on Spider without parameter updates
- **RLHF Survey (arXiv:2312.14925):** Documents how implicit preference signals from operator overrides create training data for reward models
- **Learning from Disagreement (arXiv:2604.28010):** Clinician overrides of AI recommendations as implicit preference data — richer than standard RLHF because downstream outcomes are observable

---

## 2. Outcome Tracking: Did the Repair Actually Work?

### Core Concept
Every repair action produces measurable outcomes. Track: (a) immediate success/failure, (b) time-to-recovery, (c) regression detection (did the fix break something else?), (d) recurrence rate.

### Implementation Pattern

```python
@dataclass
class RepairOutcome:
    repair_id: str
    incident_id: str
    repair_action: str          # what was attempted
    agent_id: str
    timestamp: datetime
    # Immediate outcome
    immediate_success: bool     # did the post-repair check pass?
    time_to_recovery_seconds: float
    # Lagging indicators
    regression_detected: bool   # did something else break?
    recurrence_within_24h: bool  # did the same failure return?
    recurrence_within_7d: bool
    # Composite score
    @property
    def effectiveness_score(self) -> float:
        """0.0 = made things worse, 1.0 = perfect repair."""
        if self.regression_detected:
            return 0.0
        score = 1.0
        if not self.immediate_success:
            score -= 0.5
        if self.recurrence_within_24h:
            score -= 0.4
        elif self.recurrence_within_7d:
            score -= 0.2
        return max(0.0, score)


class RepairOutcomeTracker:
    """
    Tracks repair effectiveness and updates repair success rates.
    """
    def __init__(self, db_path: str):
        self.db = sqlite3.connect(db_path)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS repair_outcomes (
                repair_id TEXT PRIMARY KEY,
                incident_id TEXT,
                agent_id TEXT,
                repair_action TEXT,
                failure_type TEXT,
                immediate_success INTEGER,
                time_to_recovery REAL,
                regression_detected INTEGER,
                recurrence_24h INTEGER,
                recurrence_7d INTEGER,
                effectiveness REAL,
                timestamp TEXT
            )
        """)
        # In-memory rolling stats
        self.action_stats: dict[str, RollingStats] = defaultdict(
            lambda: RollingStats(window=100)
        )
    
    def record_outcome(self, outcome: RepairOutcome, failure_type: str):
        """Record repair outcome and update running statistics."""
        self.db.execute("""
            INSERT INTO repair_outcomes VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (...))
        self.db.commit()
        # Update online stats
        key = f"{failure_type}:{outcome.repair_action}"
        self.action_stats[key].add(outcome.effectiveness_score)
    
    def get_action_success_rate(self, failure_type: str, action: str) -> float:
        """Get EMA-smoothed success rate for a repair action given failure type."""
        key = f"{failure_type}:{action}"
        return self.action_stats[key].mean()
    
    def rank_repairs(self, failure_type: str) -> list[tuple[str, float]]:
        """Rank repair actions by historical success rate for this failure type."""
        rates = []
        for key, stats in self.action_stats.items():
            ft, action = key.split(":", 1)
            if ft == failure_type:
                # Wilson score interval lower bound (conservative estimate)
                n = stats.count
                if n < 5:
                    rates.append((action, 0.5))  # insufficient data
                else:
                    p = stats.mean
                    z = 1.96  # 95% CI
                    denominator = 1 + z*z/n
                    centre = (p + z*z/(2*n)) / denominator
                    margin = z * sqrt((p*(1-p) + z*z/(4*n)) / n) / denominator
                    rates.append((action, centre - margin))
        return sorted(rates, key=lambda x: x[1], reverse=True)
```

### Sources & Evidence
- **Safe Remediation (arXiv:2607.20005):** Risk-constrained intervention decision — reduces False Repair Rate by 39% while improving repair success by 2.5 points over runbook baseline. Learns full policy from historical incident logs
- **ADIAS (Bloss0m/2026):** Persistent issue state tracks repair interventions across candidate generations — 78.4 vs 62.6 for DGM-H by remembering which interventions worked
- **AgentTether (arXiv:2607.06273):** Repairs 59-65% of failed agent runs; tracks repair effectiveness through cross-iteration state to prevent regression

---

## 3. Automatic Threshold Tuning: Adapting Drift Thresholds

### Core Concept
Static thresholds are fundamentally suboptimal — different operational regimes need different sensitivity levels. Use Exponentially Weighted Moving Average (EWMA) with adaptive sigma bounds that self-tune based on false positive/negative feedback.

### Key Algorithm: DTD (Dynamic Threshold Determination)

The DTD algorithm (arXiv:2511.09953) proves that no single fixed threshold can be universally optimal and proposes:

1. When drift signal fires, run 3 models in parallel for K steps:
   - **EDM (Early Detection Model):** Assumes detection was too late
   - **RDM (Retrospective Detection Model):** Assumes detection was correct  
   - **PM (Passive Model):** Assumes false alarm, no adaptation
2. Compare cumulative performance of all 3
3. **EDM wins** → detection was too late → **lower threshold**
   - **RDM wins** → detection was timely → **keep threshold**
   - **PM wins** → false alarm → **raise threshold**

### Implementation Pattern

```python
class AdaptiveThreshold:
    """
    EWMA-based adaptive threshold with DTD-style feedback.
    O(1) per-point state update, no GPU required.
    """
    def __init__(self, 
                 alpha: float = 0.3,      # EWMA smoothing
                 k_initial: float = 3.0,   # initial sigma multiplier
                 adaptation_rate: float = 0.1,
                 min_threshold: float = 0.5,
                 max_threshold: float = 10.0):
        self.alpha = alpha
        self.k = k_initial
        self.adaptation_rate = adaptation_rate
        self.min_threshold = min_threshold
        self.max_threshold = max_threshold
        
        # EWMA state
        self.mean = None
        self.variance = None
        self.n = 0
        
        # DTD state
        self.pending_verification = None
        self.verification_window = []  # (predicted, actual) pairs
        
        # FP/FN tracking (for reward signal)
        self.false_positives = 0
        self.false_negatives = 0
        self.total_alerts = 0
        self.total_silences = 0
    
    def update(self, metric_value: float) -> tuple[bool, float]:
        """
        Process new metric point. Returns (is_anomaly, confidence).
        """
        self.n += 1
        
        # Initialize on first call
        if self.mean is None:
            self.mean = metric_value
            self.variance = 0.0
            return False, 0.0
        
        # EWMA update
        delta = metric_value - self.mean
        self.mean += self.alpha * delta
        self.variance = (1 - self.alpha) * (self.variance + delta * delta * self.alpha)
        std = sqrt(self.variance) if self.variance > 1e-10 else 1e-5
        
        # Adaptive threshold
        threshold = self.k * std
        is_anomaly = abs(metric_value - self.mean) > threshold
        
        confidence = min(abs(metric_value - self.mean) / threshold, 2.0) / 2.0
        
        return is_anomaly, confidence
    
    def report_false_positive(self):
        """Alert was raised but no real issue existed."""
        self.false_positives += 1
        self.total_alerts += 1
        # Raise threshold to be less sensitive
        self.k = min(self.k * (1 + self.adaptation_rate), self.max_threshold)
    
    def report_false_negative(self):
        """Real issue was missed — detection was too late."""
        self.false_negatives += 1
        self.total_silences += 1
        # Lower threshold to be more sensitive
        self.k = max(self.k * (1 - self.adaptation_rate), self.min_threshold)
    
    @property
    def false_positive_rate(self) -> float:
        if self.total_alerts == 0:
            return 0.0
        return self.false_positives / self.total_alerts
    
    @property  
    def false_negative_rate(self) -> float:
        if self.total_silences == 0:
            return 0.0
        return self.false_negatives / self.total_silences


class MultiDimensionalAdaptiveMonitor:
    """
    AMDM-style multi-axis monitor with Mahalanobis distance.
    From arXiv:2509.00115 — reduces FP rate from 4.5% to 0.9%.
    """
    def __init__(self, n_axes: int):
        self.n_axes = n_axes
        self.axis_monitors = [AdaptiveThreshold() for _ in range(n_axes)]
        self.covariance = np.eye(n_axes)
        self.cov_alpha = 0.01  # covariance EWMA rate
    
    def check(self, metrics: list[float]) -> tuple[bool, float]:
        """Joint anomaly detection across all axes."""
        # Per-axis check
        axis_anomalies = []
        axis_deviations = []
        for i, (m, value) in enumerate(zip(self.axis_monitors, metrics)):
            is_anom, conf = m.update(value)
            axis_anomalies.append(is_anom)
            deviation = abs(value - m.mean) / (sqrt(m.variance) + 1e-10)
            axis_deviations.append(deviation)
        
        # Update covariance matrix (online)
        diff = np.array(axis_deviations)
        self.covariance = (1 - self.cov_alpha) * self.covariance + \
                          self self.cov_alpha * np.outer(diff, diff)
        
        # Mahalanobis distance for joint anomaly
        try:
            cov_inv = np.linalg.inv(self.covariance + 0.001 * np.eye(self.n_axes))
            mahal = sqrt(diff @ cov_inv @ diff)
            joint_anomaly = mahal > sqrt(self.n_axes) * 2.0  # ~3 sigma equivalent
        except np.linalg.LinAlgError:
            joint_anomaly = any(axis_anomalies)
            mahal = 0.0
        
        return joint_anomaly, mahal
```

### Sources & Evidence
- **DTD (arXiv:2511.09953):** Proves dynamic threshold strictly dominates any fixed threshold. On Airline dataset: 36 alarms → 3 alarms, accuracy 48.6% → 58.3%
- **AMDM (arXiv:2509.00115):** EWMA + Mahalanobis distance. Cuts detection latency 12.3s → 5.6s, FP rate 4.5% → 0.9%
- **DriftGuard (arXiv:2606.28725):** Safety-aware multi-monitor drift detection with selective adaptation — toxic recall +0.14, FN prevalence -0.08
- **CALIBURN (arXiv:2605.24696):** Operationally calibrated streaming detection — derives threshold from FP/FN costs and alert budget, not post-hoc tuning

---

## 4. Pattern Mining: Recurring Failure Mode Discovery

### Core Concept
Repair logs contain structured patterns that can be mined automatically to build a failure mode taxonomy. Key techniques: sequential pattern mining, log template extraction, clustering of error embeddings.

### Implementation Pattern

```python
class FailurePatternMiner:
    """
    Mines recurring failure patterns from repair logs.
    Combines log templating + sequence mining + embedding clustering.
    """
    def __init__(self):
        self.log_templates: dict[str, str] = {}  # raw -> template
        self.template_counts = Counter()
        self.sequence_db: list[list[str]] = []  # ordered template sequences
        self.sequence_index: dict[str, list[int]] = defaultdict(list)  # template -> sequence ids
        
        # Embedding-based clustering for semantic patterns
        self.error_embeddings = []  # would use sentence-transformers or similar
        self.cluster_labels = []
    
    def extract_template(self, log_line: str) -> str:
        """
        Simple log templating (production: use Drain or Spell).
        Replaces variable parts with <*>.
        """
        # Remove timestamps, IDs, hex values, numbers
        template = re.sub(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', '<TIMESTAMP>', log_line)
        template = re.sub(r'0x[0-9a-fA-F]+', '<HEX>', template)
        template = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<UUID>', template)
        template = re.sub(r'\b\d+\.\d+\b', '<FLOAT>', template)
        template = re.sub(r'\b\d+\b', '<INT>', template)
        return template
    
    def mine_sequences(self, window_size: int = 10):
        """Mine frequent sequential patterns from failure sequences."""
        # Simplified PrefixSpan — production would use SPMF or custom implementation
        patterns = defaultdict(int)
        
        for seq in self.sequence_db:
            # Slide window across sequence
            for i in range(len(seq) - window_size + 1):
                window = tuple(seq[i:i+window_size])
                patterns[window] += 1
        
        # Filter by minimum support
        min_support = max(3, len(self.sequence_db) * 0.05)
        frequent = {k: v for k, v in patterns.items() if v >= min_support}
        
        # Rank by lift (observed / expected if independent)
        ranked = []
        for pattern, count in frequent.items():
            expected = len(self.sequence_db)
            for template in pattern:
                template_freq = self.template_counts[template] / sum(self.template_counts.values())
                expected *= template_freq
            lift = count / max(expected, 1)
            ranked.append((pattern, count, lift))
        
        return sorted(ranked, key=lambda x: x[2], reverse=True)
    
    def discover_failure_modes(self) -> list[FailureMode]:
        """
        Combine template frequency + sequence patterns + embedding clusters
        to discover and label recurring failure modes.
        """
        modes = []
        
        # 1. High-frequency templates = common error types
        for template, count in self.template_counts.most_common(20):
            if count < 5:
                continue
            modes.append(FailureMode(
                name=f"frequent_{hash(template) % 10000}",
                pattern_type="frequent_error",
                template=template,
                frequency=count,
                confidence=min(count / 100, 1.0)
            ))
        
        # 2. High-lift sequences = causal chains
        for pattern, count, lift in self.mine_sequences()[:10]:
            if lift > 2.0:  # at least 2x more likely than random
                modes.append(FailureMode(
                    name=f"chain_{hash(pattern) % 10000}",
                    pattern_type="causal_chain",
                    template=" -> ".join(pattern),
                    frequency=count,
                    confidence=min(lift / 10, 1.0)
                ))
        
        return sorted(modes, key=lambda m: m.confidence, reverse=True)
    
    def match_incident(self, incident_templates: list[str]) -> list[FailureMode]:
        """Match new incident to known failure modes."""
        matches = []
        for mode in self.discovered_modes:
            if mode.pattern_type == "causal_chain":
                # Check if chain is subsequence of incident
                pattern_list = mode.template.split(" -> ")
                if self._is_subsequence(pattern_list, incident_templates):
                    matches.append(mode)
            elif mode.pattern_type == "frequent_error":
                if mode.template in incident_templates:
                    matches.append(mode)
        return matches
    
    def _is_subsequence(self, pattern: list[str], sequence: list[str]) -> bool:
        """Check if pattern appears as subsequence in sequence."""
        it = iter(sequence)
        return all(any(p == s for s in it) for p in pattern)
```

### Sources & Evidence
- **ErrorAtlas (arXiv:2605.30628):** Across 83 models × 35 datasets, failures cluster into 17 named categories with long-tailed distribution — repetitive, not random
- **Log-Insight (arXiv:2607.08529):** Neuro-symbolic log analysis — template extraction + semantic interpretation for RCA
- **Incident Memory (arXiv:2609.01616):** Sequential pattern mining on repair logs — mines 39 playbooks covering 84.3% of incidents with 99.2% precision
- **AgentFixer (arXiv:2603.29848):** Parsing errors = 38% of all agent failures — pattern: malformed JSON, missing schema fields, instruction non-compliance
- **Active Learning for FMEA (PMC10007120):** NLP extraction of failure modes from maintenance records and repair verbatim data

---

## 5. Causal Inference: Correlation vs. Causation in Agent Degradation

### Core Concept
The fundamental attribution problem: correlation-based methods misidentify downstream symptoms as root causes. Causal inference constructs a Performance Causal Graph where edges point from root cause to effects.

### Key Technique: Performance Causal Inversion (PCI)

From arXiv:2509.08682 — the direction of **information flow** is opposite to the direction of **performance causality**:

- Information flows: upstream agent → downstream agent  
- Performance causality: downstream symptom ← upstream root cause  
- **Solution:** Reverse the edges of the data-dependency graph to get the performance causal graph

### Implementation Pattern

```python
class CausalFailureAttributor:
    """
    Multi-granularity causal inference for agent failure attribution.
    Uses Performance Causal Inversion + Shapley values for blame assignment.
    """
    def __init__(self, n_agents: int):
        self.n_agents = n_agents
        # Causal DAG: causes -> effects (edges reversed from data flow)
        self.causal_graph = np.zeros((n_agents, n_agents))
        # Observed transitions for learning structure
        self.co_occurrence = np.zeros((n_agents, n_agents))
    
    def build_causal_graph(self, execution_logs: list[ExecutionTrace]):
        """
        Build Performance Causal Graph from execution traces.
        Steps:
        1. Extract data dependencies (who fed data to whom)
        2. Reverse edges (data flow becomes performance causality)
        3. Validate with counterfactual reasoning
        """
        # Step 1: Extract data dependency edges
        data_dependency = np.zeros((self.n_agents, self.n_agents))
        for trace in execution_logs:
            for i, step_i in enumerate(trace.steps):
                for j, step_j in enumerate(trace.steps[i+1:], start=i+1):
                    if self._data_flows(step_i, step_j):
                        data_dependency[step_i.agent_id][step_j.agent_id] += 1
        
        # Step 2: Reverse edges for performance causality
        # If agent_i's output feeds agent_j, then j's failure may be caused by i
        self.causal_graph = data_dependency.T
        
        # Step 3: Prune using conditional independence tests
        self._prune_spurious_edges(execution_logs)
    
    def _data_flows(self, step_i, step_j) -> bool:
        """Check if step_i's output feeds into step_j's input."""
        # Heuristic: step_j's input contains step_i's output or derived data
        return (
            step_i.output_field in step_j.input_fields or
            step_i.step_id in step_j.dependency_ids
        )
    
    def _prune_spurious_edges(self, logs: list[ExecutionTrace]):
        """Remove edges that don't improve causal prediction."""
        # Simple heuristic: edge should predict failure propagation
        for i in range(self.n_agents):
            for j in range(self.n_agents):
                if self.causal_graph[i][j] > 0:
                    # Does i's failure predict j's failure more than j's failure predicts i's?
                    i_predicts_j = self._granger_cause(i, j, logs)
                    j_predicts_i = self._granger_cause(j, i, logs)
                    if i_predicts_j < j_predicts_i:
                        self.causal_graph[i][j] = 0
    
    def _granger_cause(self, cause: int, effect: int, logs: list[ExecutionTrace]) -> float:
        """Simple Granger causality: does cause's past predict effect's future?"""
        # Simplified: correlation of failure sequences
        cause_failures = []
        effect_failures = []
        for log in logs:
            steps_by_agent = {s.agent_id: s for s in log.steps}
            if cause in steps_by_agent and effect in steps_by_agent:
                cause_failures.append(1 if steps_by_agent[cause].failed else 0)
                effect_failures.append(1 if steps_by_agent[effect].failed else 0)
        if len(cause_failures) < 10:
            return 0.0
        return abs(np.corrcoef(cause_failures[:-1], effect_failures[1:])[0, 1])
    
    def attribute_failure(self, failed_trace: ExecutionTrace) -> dict[int, float]:
        """
        Given a failed execution, compute blame scores for each agent.
        Uses Shapley values over the causal graph.
        """
        failed_agents = {s.agent_id for s in failed_trace.steps if s.failed}
        
        if not failed_agents:
            return {}
        
        # Find root cause candidates (agents with failures that have causal paths to others)
        blame_scores = {}
        for agent in failed_agents:
            # Count downstream agents affected via causal graph
            affected = self._count_affected(agent, failed_agents)
            blame_scores[agent] = affected
        
        # Normalize to probabilities
        total = sum(blame_scores.values())
        if total > 0:
            blame_scores = {a: s / total for a, s in blame_scores.items()}
        
        return blame_scores
    
    def _count_affected(self, source: int, failed_agents: set[int]) -> int:
        """BFS from source in causal graph — count reachable failed agents."""
        visited = set()
        queue = [source]
        while queue:
            node = queue.pop(0)
            if node in visited:
                continue
            visited.add(node)
            for j in range(self.n_agents):
                if self.causal_graph[node][j] > 0 and j not in visited:
                    queue.append(j)
        return len(visited & failed_agents) - 1  # exclude self
    
    def counterfactual_analysis(self, 
                                failed_trace: ExecutionTrace,
                                root_cause_agent: int) -> dict:
        """
        Answer: "Would the task have succeeded if root_cause_agent had performed correctly?"
        """
        # Find actual failure patterns involving root_cause_agent
        actual_failures = sum(1 for s in failed_trace.steps if s.failed)
        
        # Simulate: if root_cause_agent had succeeded, which downstream failures would be prevented?
        prevented = set()
        for j in range(self.n_agents):
            if self.causal_graph[root_cause_agent][j] > 0:
                # j's failure might be prevented
                prevented.add(j)
        
        return {
            "root_cause_agent": root_cause_agent,
            "actual_failures": actual_failures,
            "prevented_failures": len(prevented),
            "counterfactual_success_rate": 1.0 - (actual_failures - len(prevented)) / max(actual_failures, 1),
            "affected_agents": list(prevented)
        }
```

### Sources & Evidence
- **SBSLocator/CPIdentifier (arXiv:2509.08682):** First multi-granularity causal inference framework for MAS failure attribution. Reverses data-dependency edges to build performance causal graph. Shapley values for blame assignment. Addresses <15% accuracy of correlation methods
- **AURORA (arXiv:2605.10718):** Bayesian network + Markov blanket inference for real-time causal RCA with bounded complexity. Uses do-calculus for counterfactual reasoning
- **TraceCausalNet (IJETCSIT):** Granger causality on distributed traces — 47min → 8min MTTRC (83% reduction), 91% top-3 accuracy
- **ADE-PRF (arXiv:2607.07689):** Predicts 8-hour forward-looking health trajectories. MAE 1.228 points, Direction Accuracy 76.8%
- **Augment RCA criteria:** Distinguishes causal RCA (PC algorithm, Granger, LiNGAM) from correlation-based methods (PageRank on correlation graphs)

---

## 6. Experience Replay: Past Incidents Improve Future Detection

### Core Concept
Store resolved incidents in a structured memory that can be retrieved during new incidents. Key insight from MERIT: organize by (failure_type, outcome, repair_action) — not just semantic similarity.

### Implementation Pattern

```python
class ExperienceReplayMemory:
    """
    Dual-polarity episodic memory for agent repair.
    Inspired by MERIT (arXiv:2608.05906).
    """
    def __init__(self, vector_db_path: str):
        self.positive_memory = []  # verified successful repairs
        self.negative_memory = []  # failed repair attempts
        self.vector_index = {}     # simple in-memory vector store
        self.failure_type_index: dict[str, list[int]] = defaultdict(list)
    
    def store_experience(self, 
                         incident: dict,
                         failure_type: str,
                         repair_action: str,
                         outcome: str,         # "success" or "failure"
                         repair_delta: str,    # what changed
                         context_embedding: np.ndarray):
        """Store a repair experience after episode finalization."""
        entry = {
            "id": str(uuid.uuid4()),
            "failure_type": failure_type,
            "repair_action": repair_action,
            "outcome": outcome,
            "repair_delta": repair_delta,
            "context_embedding": context_embedding,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": incident
        }
        
        if outcome == "success":
            self.positive_memory.append(entry)
            memory_list = self.positive_memory
        else:
            self.negative_memory.append(entry)
            memory_list = self.negative_memory
        
        # Index by failure type
        idx = len(memory_list) - 1
        self.failure_type_index[failure_type].append(idx)
        
        # Index embedding for similarity search
        self.vector_index[entry["id"]] = context_embedding
    
    def retrieve_relevant(self,
                          current_incident: dict,
                          current_failure_type: str,
                          context_embedding: np.ndarray,
                          top_k: int = 5) -> tuple[list[dict], list[dict]]:
        """
        Retrieve relevant positive (what worked) and negative (what didn't) memories.
        Uses hybrid lexical + dense ranking like MERIT.
        """
        # Get candidates from same failure type
        pos_candidates = [
            self.positive_memory[i] 
            for i in self.failure_type_index.get(current_failure_type, [])
        ]
        neg_candidates = [
            self.negative_memory[i]
            for i in self.failure_type_index.get(current_failure_type, [])
        ]
        
        # Dense similarity (cosine)
        def cosine_sim(a, b):
            return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10)
        
        # Score candidates
        pos_scored = [
            (entry, cosine_sim(context_embedding, entry["context_embedding"]))
            for entry in pos_candidates
        ]
        neg_scored = [
            (entry, cosine_sim(context_embedding, entry["context_embedding"]))
            for entry in neg_candidates
        ]
        
        # Sort by similarity, take top-k
        top_positive = sorted(pos_scored, key=lambda x: x[1], reverse=True)[:top_k]
        top_negative = sorted(neg_scored, key=lambda x: x[1], reverse=True)[:max(1, top_k // 2)]
        
        return (
            [entry for entry, _ in top_positive],
            [entry for entry, _ in top_negative]
        )
    
    def get_repair_recommendation(self,
                                   current_incident: dict,
                                   current_failure_type: str,
                                   context_embedding: np.ndarray) -> dict:
        """
        Based on experience, recommend the most likely successful repair.
        """
        positives, negatives = self.retrieve_relevant(
            current_incident, current_failure_type, context_embedding
        )
        
        # Count repair action frequencies in successful memories
        action_counts = Counter()
        for entry in positives:
            action_counts[entry["repair_action"]] += 1
        
        # Exclude actions that frequently failed
        failure_counts = Counter()
        for entry in negatives:
            failure_counts[entry["repair_action"]] += 1
        
        # Score: success_rate / (success_rate + failure_rate) with smoothing
        recommendations = []
        for action, success_count in action_counts.items():
            fail_count = failure_counts.get(action, 0)
            # Wilson score lower bound
            n = success_count + fail_count
            if n < 3:
                continue
            p = success_count / n
            z = 1.96
            denominator = 1 + z*z/n
            centre = (p + z*z/(2*n)) / denominator
            margin = z * sqrt((p*(1-p) + z*z/(4*n)) / n) / denominator
            score = centre - margin
            recommendations.append((action, score, success_count))
        
        recommendations.sort(key=lambda x: x[1], reverse=True)
        
        return {
            "recommended_repairs": recommendations[:3],
            "based_on_n_incidents": len(positives),
            "confidence": recommendations[0][1] if recommendations else 0.0,
            "negative_examples": [
                {"action": e["repair_action"], "reason": e.get("failure_reason", "unknown")}
                for e in negatives[:2]
            ]
        }
```

### Sources & Evidence
- **MERIT (arXiv:2608.05906):** Dual-polarity memory + failure-type-conditioned retrieval. +3.45% accuracy on Spider, +1.09% on BIRD. Negative memory contributes modestly but consistently
- **ER-EMU/DDM-ES (arXiv:2507.00042):** Discrepancy-weighted experience replay — prioritizes historical data most dissimilar to current domain. MK-MMD for domain distance
- **Reflexion (Shinn et al. 2023):** Verbal reflections from earlier trials — 51.24% on BIRD at higher inference cost
- **Incident Memory (arXiv:2609.01616):** Sequential pattern mining + velocity-stratified retrieval — 99.2% precision, 0% stale fact return, F1 0.876 conflict detection
- **CARAVAN (OSDI'24):** Experience replay for in-network ML — 30.3% F1 improvement, 61.3% less GPU compute via accuracy proxy + selective retraining

---

## 7. Repair Success Database: Improving Repair Selection Over Time

### Core Concept
A structured database that records every repair attempt, its context, and outcome — enabling the system to learn which repairs work for which failure types.

### Schema & Architecture

```sql
-- Core repair tracking schema
CREATE TABLE repair_incidents (
    incident_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    failure_type TEXT NOT NULL,        -- classified failure category
    severity INTEGER,                   -- 1=critical, 2=high, 3=medium, 4=low
    initial_metrics JSON,              -- metrics at time of detection
    root_cause TEXT,                   -- if determined
    detected_at TEXT,
    resolved_at TEXT
);

CREATE TABLE repair_attempts (
    attempt_id TEXT PRIMARY KEY,
    incident_id TEXT REFERENCES repair_incidents,
    repair_action TEXT NOT NULL,       -- what was done
    repair_category TEXT,              -- restart/reconfigure/rollback/escalate
    automated BOOLEAN,                 -- was this auto-executed?
    execution_time_ms INTEGER,
    cost_units REAL,                   -- compute/API cost
    
    -- Outcomes
    immediate_success BOOLEAN,         -- post-repair check passed?
    post_repair_metrics JSON,
    
    -- Effectiveness (measured retrospectively)
    effectiveness_score REAL,          -- 0.0-1.0 composite
    regression_detected BOOLEAN,       -- did something else break?
    recurrence_24h BOOLEAN,
    recurrence_7d BOOLEAN,
    recurrence_30d BOOLEAN,
    
    -- Context for matching
    context_embedding BLOB,            -- vector for similarity search
    agent_version TEXT,
    environment_hash TEXT,
    
    attempted_at TEXT,
    outcome_measured_at TEXT
);

-- Materialized success rates (refreshed periodically)
CREATE VIEW repair_success_rates AS
SELECT 
    failure_type,
    repair_action,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN immediate_success THEN 1 ELSE 0 END) as immediate_successes,
    AVG(effectiveness_score) as avg_effectiveness,
    SUM(CASE WHEN recurrence_24h THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as recurrence_rate_24h,
    -- Wilson score lower bound for conservative estimate
    -- (computation in application layer)
    MIN(attempted_at) as first_attempt,
    MAX(attempted_at) as last_attempt
FROM repair_attempts
GROUP BY failure_type, repair_action;

-- Index for fast lookup
CREATE INDEX idx_repair_outcomes ON repair_incidents(failure_type, detected_at);
CREATE INDEX idx_repair_attempts ON repair_attempts(incident_id, repair_action);
```

### Implementation

```python
class RepairSuccessDatabase:
    """
    Repair success database that learns optimal repair selection.
    Combines MAB for exploration with historical success rates for exploitation.
    """
    def __init__(self, db_path: str):
        self.db = sqlite3.connect(db_path)
        self.db.row_factory = sqlite3.Row
        self._init_schema()
        
        # In-memory cache for hot path
        self.success_rate_cache: dict[str, RepairStats] = {}
        self._warm_cache()
    
    def select_repair(self, 
                      failure_type: str,
                      context: dict,
                      available_actions: list[str],
                      exploration_rate: float = 0.1) -> tuple[str, dict]:
        """
        Select best repair using Upper Confidence Bound (UCB).
        Balances exploitation (known good repairs) with exploration (less-tried actions).
        """
        if random.random() < exploration_rate:
            # Explore: try under-sampled action
            action = self._least_tried_action(failure_type, available_actions)
            return action, {"strategy": "explore", "confidence": 0.0}
        
        # Exploit: UCB score for each action
        best_action = None
        best_score = -1
        
        total_attempts = sum(
            self.get_action_count(failure_type, a) 
            for a in available_actions
        )
        
        for action in available_actions:
            stats = self.get_action_stats(failure_type, action)
            if stats.count < 3:
                # Insufficient data — give it a chance
                ucb_score = 0.5 + sqrt(2 * log(total_attempts + 1) / 1)
            else:
                # UCB1 formula
                exploitation = stats.mean_effectiveness
                exploration = sqrt(2 * log(total_attempts) / stats.count)
                ucb_score = exploitation + exploration
            
            if ucb_score > best_score:
                best_score = ucb_score
                best_action = action
        
        stats = self.get_action_stats(failure_type, best_action)
        return best_action, {
            "strategy": "exploit_ucb",
            "confidence": stats.mean_effectiveness,
            "attempts": stats.count,
            "ucb_score": best_score,
            "alternatives": self._get_alternatives(failure_type, best_action)
        }
    
    def record_attempt(self, attempt: RepairAttempt):
        """Record a repair attempt and update statistics."""
        self.db.execute("""
            INSERT INTO repair_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (...attempt fields...))
        self.db.commit()
        
        # Invalidate cache
        cache_key = f"{attempt.failure_type}:{attempt.repair_action}"
        self.success_rate_cache.pop(cache_key, None)
    
    def get_action_stats(self, failure_type: str, action: str) -> RepairStats:
        """Get cached repair statistics."""
        key = f"{failure_type}:{action}"
        if key not in self.success_rate_cache:
            row = self.db.execute("""
                SELECT 
                    COUNT(*) as cnt,
                    AVG(effectiveness_score) as avg_eff,
                    SUM(CASE WHEN immediate_success THEN 1 ELSE 0 END) as successes
                FROM repair_attempts 
                WHERE failure_type=? AND repair_action=?
            """, (failure_type, action)).fetchone()
            
            self.success_rate_cache[key] = RepairStats(
                count=row["cnt"],
                mean_effectiveness=row["avg_eff"] or 0.5,
                success_count=row["successes"] or 0
            )
        return self.success_rate_cache[key]
    
    def generate_repair_report(self, 
                               agent_id: str = None,
                               time_window_days: int = 30) -> dict:
        """Generate analytics on repair effectiveness."""
        where_clause = "WHERE attempted_at > datetime('now', ?)"
        params = [f"-{time_window_days} days"]
        if agent_id:
            where_clause += " AND agent_id = ?"
            params.append(agent_id)
        
        rows = self.db.execute(f"""
            SELECT 
                failure_type,
                repair_action,
                COUNT(*) as attempts,
                AVG(effectiveness_score) as avg_effectiveness,
                AVG(CASE WHEN time_to_recovery IS NOT NULL THEN time_to_recovery END) as avg_ttr,
                SUM(CASE WHEN recurrence_24h THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as recurrence_rate
            FROM repair_attempts
            {where_clause}
            GROUP BY failure_type, repair_action
            ORDER BY avg_effectiveness DESC
        """, params).fetchall()
        
        return {
            "window_days": time_window_days,
            "total_attempts": sum(r["attempts"] for r in rows),
            "top_repairs": [
                {
                    "failure_type": r["failure_type"],
                    "repair_action": r["repair_action"],
                    "attempts": r["attempts"],
                    "effectiveness": r["avg_effectiveness"],
                    "avg_ttr_seconds": r["avg_ttr"],
                    "recurrence_rate": r["recurrence_rate"]
                }
                for r in rows[:20]
            ]
        }
```

### Sources & Evidence
- **EvoRepair (arXiv:2605.30105):** Experience bank with 5-dimensional schema (vulnerability analysis, repair rationale, trajectory analysis, experience summary, reflection). 93.47% success rate. Cross-language transfer confirmed
- **MemRepair (arXiv:2605.17444):** Hierarchical memory for repository-level repair. 58.0% SEC-Bench, 58.2% PatchEval. Outperforms OpenHands, SWE-agent
- **MERIT (arXiv:2608.05906):** Dual-polarity memory (positive/negative) with failure-type conditioning. Positive = verified corrections, negative = unsuccessful directions
- **MemoRepair (arXiv:2605.07242):** Cascade repair for agent memory. Min-cut optimization to select repairs — recovers 91-94% of validated successors with 57-76% of the cost of exhaustive repair
- **ADIAS:** Issue-centric repair state — 78.4 vs 62.6 DGM-H by persisting repair progress across optimization rounds

---

## 8. Lightweight Online Learning (No GPU Training)

### Key Techniques

**Summary of approaches that don't require GPU training:**

| Technique | Update Cost | State Size | Use Case |
|-----------|-------------|------------|----------|
| EWMA/CUSUM | O(1) | O(1) | Threshold adaptation |
| Online SGD (logistic) | O(d) | O(d) | Alert scoring |
| Multi-armed Bandit | O(K) | O(K) | Repair selection |
| Bayesian Online Changepoint | O(1) | O(1) | Drift detection |
| Online Random Forest | O(tree_depth) | O(n_trees) | Anomaly scoring |
| Kalman Filter | O(d²) | O(d²) | Metric forecasting |
| Experience Replay (memory) | O(1) amortized | O(N) | Repair memory |
| Online K-Means | O(K) | O(K) | Log clustering |
| River/scikit-multiflow | Various | Various | Streaming ML |

### Implementation: River-based Online Anomaly Detector

```python
from river import anomaly, preprocessing, stats
from river.drift import ADWIN

class LightweightAnomalyDetector:
    """
    Fully online anomaly detector using River library.
    No GPU, O(1) per-point updates, handles concept drift.
    """
    def __init__(self, n_features: int):
        self.n_features = n_features
        
        # Half-Space Trees — streaming anomaly detection
        self.detector = anomaly.HalfSpaceTrees(
            n_trees=25,
            height=10,
            window_size=250,
            seed=42
        )
        
        # Preprocessing: standardize online
        self.scaler = preprocessing.StandardScaler()
        
        # Drift detector per feature
        self.drift_detectors = [ADWIN() for _ in range(n_features)]
        
        # Running statistics
        self.feature_stats = [stats.Var() for _ in range(n_features)]
        self.prediction_stats = stats.Var()
    
    def update_and_score(self, features: dict) -> tuple[bool, float]:
        """
        Process new observation, return (is_anomaly, anomaly_score).
        All updates are O(1), no GPU.
        """
        # Update drift detectors
        drifted_features = []
        for i, (name, value) in enumerate(features.items()):
            self.drift_detectors[i].update(value)
            if self.drift_detectors[i].drift_detected:
                drifted_features.append(name)
            self.feature_stats[i].update(value)
        
        # If drift detected, partially reset detector
        if drifted_features:
            self._partial_reset(drifted_features)
        
        # Scale features online
        scaled = self.scaler.learn_one(features).transform_one(features)
        
        # Score anomaly
        anomaly_score = self.detector.score_one(scaled)
        
        # Learn (update model with this observation)
        self.detector.learn_one(scaled)
        
        # Threshold: typically 0.6-0.8 for HST
        is_anomaly = anomaly_score > 0.7
        
        self.prediction_stats.update(anomaly_score)
        
        return is_anomaly, anomaly_score
    
    def _partial_reset(self, drifted_features: list[str]):
        """Reduce detector sensitivity on drifted features."""
        # Simple approach: increase threshold temporarily
        # Production: could retrain on recent window
        pass


class LightweightOnlineEnsemble:
    """
    Ensemble of online learners with bandit-based weight selection.
    PB-OEL (arXiv:2503.15581): Performance-bounded Online Ensemble via MAB.
    """
    def __init__(self, n_models: int = 5):
        self.n_models = n_models
        self.models = [
            anomaly.HalfSpaceTrees(n_trees=10, height=8, seed=i)
            for i in range(n_models)
        ]
        # MAB weights for each model
        self.model_weights = np.ones(n_models) / n_models
        self.model_rewards = np.zeros(n_models)
        self.model_counts = np.zeros(n_models) + 1e-6
        self.learning_rate = 0.1
    
    def predict(self, features: dict) -> tuple[bool, float, int]:
        """
        Returns (is_anomaly, score, model_used).
        Uses weighted ensemble with MAB for model selection.
        """
        # Sample model according to weights (softmax)
        probs = self.model_weights / self.model_weights.sum()
        model_idx = np.random.choice(self.n_models, p=probs)
        
        score = self.models[model_idx].score_one(features)
        is_anomaly = score > 0.7
        
        return is_anomaly, score, model_idx
    
    def update(self, features: dict, true_label: int):
        """
        Update models and MAB weights based on true outcome.
        Reward = 1 if correct, 0 if incorrect.
        """
        for i, model in enumerate(self.models):
            pred = model.score_one(features)
            pred_label = 1 if pred > 0.7 else 0
            reward = 1.0 if pred_label == true_label else 0.0
            
            # Update MAB statistics
            self.model_rewards[i] += reward
            self.model_counts[i] += 1
            
            # Update model
            model.learn_one(features)
        
        # Update weights via EXP3 (weighted majority)
        avg_rewards = self.model_rewards / self.model_counts
        self.model_weights *= np.exp(self.learning_rate * avg_rewards)
        self.model_weights /= self.model_weights.sum()
```

### Sources & Evidence
- **River library:** Production-ready online ML — HalfSpaceTrees, ADWIN, StandardScaler, all O(1) updates
- **CARAVAN (OSDI'24):** Online learning for in-network ML — 30.3% F1 improvement, 61.3% less GPU time
- **PB-OEL (arXiv:2503.15581):** Performance-bounded online ensemble via MAB — theoretical accuracy bounds
- **MetaClaw (Substack 2026):** Opportunistic online RL without GPU — LoRA fine-tuning during idle time, immediate behavioral rule injection
- **ATLAS (arXiv:2511.01093):** Continual learning without GPU — GPT-5-mini 33.7% → 54.1% on ExCyTIn-Bench, -45% tokens
- **CLP-SNN (arXiv:2511.01553):** Online continual learning on Intel Loihi 2 — 113× lower latency, 6600× lower energy than GPU
- **VictoriaMetrics vmanomaly:** 150M series with O(1)-state statistical methods — EWMA, Bayesian Online Changepoint Detection, SPOT

---

## The Virtuous Cycle: How It All Fits Together

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PISTISAI-PI VIRTUOUS CYCLE                         │
│                                                                         │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐          │
│   │   PILLAR 1   │────▶│   PILLAR 2   │────▶│   PILLAR 3   │          │
│   │   SCORING    │     │  TELEMETRY   │     │     SPC      │          │
│   │              │     │              │     │  (Adaptive)  │          │
│   └──────┬───────┘     └──────┬───────┘     └──────┬───────┘          │
│          │                    │                    │                    │
│          │              ┌─────▼─────┐              │                    │
│          │              │ THRESHOLD │              │                    │
│          │              │  TUNING   │◀─────────────┘                    │
│          │              │  (DTD/    │                                   │
│          │              │  AMDM)    │                                   │
│          │              └─────┬─────┘                                   │
│          │                    │                                         │
│          │              ┌─────▼─────┐                                   │
│          └─────────────▶│  ALERT    │                                   │
│                         │ REWARD    │──── RLHF learns which             │
│                         │  MODEL    │     alerts matter                │
│                         └─────┬─────┘                                   │
│                               │                                         │
│   ┌──────────────┐     ┌─────▼─────┐     ┌──────────────┐              │
│   │   PILLAR 4   │◀────│ DIAGNOSE  │────▶│  EXPERIENCE  │              │
│   │  EVALUATION  │     │ (Causal)  │     │    REPLAY    │              │
│   │              │     │           │     │   MEMORY     │              │
│   └──────┬───────┘     └───────────┘     └──────┬───────┘              │
│          │                                       │                      │
│          │              ┌──────────────┐         │                      │
│          └─────────────▶│   REPAIR     │◀────────┘                      │
│                         │  SELECTION   │                                │
│                         │   (MAB/UCB)  │                                │
│                         └──────┬───────┘                                │
│                                │                                        │
│                         ┌──────▼───────┐                                │
│                         │    REPAIR    │                                │
│                         │   EXECUTION  │                                │
│                         └──────┬───────┘                                │
│                                │                                        │
│                         ┌──────▼───────┐                                │
│                         │   OUTCOME    │                                │
│                         │   TRACKING   │                                │
│                         └──────┬───────┘                                │
│                                │                                        │
│              ┌─────────────────┼─────────────────┐                      │
│              │                 │                 │                      │
│       ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐               │
│       │  REPAIR DB  │  │  PATTERN    │  │  THRESHOLD  │               │
│       │  UPDATE     │  │  MINING     │  │  FEEDBACK   │               │
│       │             │  │             │  │             │               │
       │ success_rate │  │ new failure │  │ FP/FN       │               │
│       │ → UCB       │  │ modes       │  │ → adjust k  │               │
│       └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                         │
│  RESULT: Each incident makes detection, diagnosis, and repair better   │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Feedback Loops

1. **Detection Loop:** Alert outcomes → RLHF reward model → better alert prioritization
2. **Threshold Loop:** FP/FN feedback → DTD/AMDM → adaptive thresholds
3. **Diagnosis Loop:** Repair outcomes → causal graph update → better root cause attribution
4. **Repair Selection Loop:** Repair DB → UCB/MAB → optimal repair choice
5. **Pattern Discovery Loop:** New incidents → pattern mining → updated failure mode taxonomy
6. **Experience Loop:** Stored incidents → similarity retrieval → faster/better repair of new incidents

### How the 4 Pillars Improve Together

| Pillar | Learning Mechanism | What Improves |
|--------|-------------------|---------------|
| Scoring (1) | Alert Reward Model (RLHF) | Which scores warrant action |
| Telemetry (2) | Adaptive Thresholds (DTD/AMDM) | Detection sensitivity per signal |
| SPC (3) | Online Anomaly Detection (River) | Anomaly detection with drift |
| Evaluation (4) | Causal Inference + Repair DB | Root cause accuracy + repair choice |

---

## Summary Table

| Topic | Key Algorithm | Complexity | GPU? | Reference |
|-------|--------------|------------|------|-----------|
| RLHF for alerts | Bradley-Terry pairwise + SGD | O(d) per update | No | MERIT, arXiv:2608.05906 |
| Outcome tracking | RollingStats + Wilson score | O(1) amortized | No | Safe Remediation, arXiv:2607.20005 |
| Threshold tuning | DTD (3-model comparison) | O(1) per step | No | arXiv:2511.09953 |
| EWMA + Mahalanobis | AMDM | O(d²) per step | No | arXiv:2509.00115 |
| Pattern mining | PrefixSpan + log templates | O(n log n) batch | No | Incident Memory, arXiv:2609.01616 |
| Causal inference | PCI + Shapley values | O(n²) build, O(n) query | No | arXiv:2509.08682 |
| Experience replay | Dual-polarity + BM25+dense | O(log n) retrieval | No | MERIT, arXiv:2608.05906 |
| Repair DB | UCB + SQLite + Wilson | O(log n) lookup | No | EvoRepair, arXiv:2605.30105 |
| Online anomaly detection | HalfSpaceTrees + ADWIN | O(trees × log(window)) | No | River library |
| Online ensemble | EXP3/PB-OEL | O(n_models) per step | No | arXiv:2503.15581 |

---

## Full Source Citations

1. **MERIT** — Hoang Vo et al., "Causal Episodic Memory for Feedback-Driven Agent Repair," arXiv:2608.05906, 2026
2. **DTD** — "Autonomous Concept Drift Threshold Determination," arXiv:2511.09953, 2025
3. **AMDM** — Shukla et al., "Adaptive Monitoring and Real-World Evaluation of Agentic AI Systems," arXiv:2509.00115, 2025
4. **AgentTether** — "Graph-Guided Diagnosis and Runtime Intervention for Reliable LLM Agent Operations," arXiv:2607.06273, 2026
5. **SBSLocator** — "Automatic Failure Attribution in Multi-Agent Systems Based on Causal Inference," arXiv:2509.08682, 2025
6. **EvoRepair** — "Experience-Based Self-Evolving Vulnerability Repair," arXiv:2605.30105, 2026
7. **MemRepair** — "Hierarchical Memory for Agentic Repository-Level Vulnerability Repair," arXiv:2605.17444, 2026
8. **MERIT-experience** — MERIT paper's dual-polarity memory with hybrid BM25+dense retrieval
9. **Safe Remediation** — Dai et al., "Safe Remediation as Risk-Constrained Intervention Decision," arXiv:2607.20005, 2026
10. **ADIAS** — "Turning Agent Self-Improvement into Traceable Issue Repair," Bloss0m, 2026
11. **ErrorAtlas** — "The Architecture of Errors: From Universal Impossibility to Patch-Local LLM Reliability," arXiv:2605.30628, 2026
12. **Log-Insight** — "Automating Microservice Incident Diagnosis via Neuro-Symbolic Log Analysis," arXiv:2607.08529, 2026
13. **AgentFixer** — "From Failure Detection to Fix Recommendations in LLM Agentic Systems," arXiv:2603.29848, 2026
14. **Incident Memory** — "Training-Free Operational Memory through Sequential Pattern Mining and Velocity-Stratified Retrieval," arXiv:2609.01616, 2026
15. **AURORA** — "Uncertainty-Aware Resilience Micro-Agent for Causal Observability," arXiv:2605.10718, 2026
16. **TraceCausalNet** — "Causal Inference in Distributed Tracing," IJETCSIT
17. **ADE-PRF** — "Agent Delivery Engineering Predictive Reliability Framework," arXiv:2607.07689, 2026
18. **ER-EMU/DDM-ES** — "Catastrophic Forgetting Mitigation via Discrepancy-Weighted Experience Replay," arXiv:2507.00042, 2025
19. **DriftGuard** — "Safety-Aware Multi-Monitor Detection and Selective Adaptation," arXiv:2606.28725, 2026
20. **CALIBURN** — "Operationally Calibrated Streaming Intrusion Detection," arXiv:2605.24696, 2026
21. **CARAVAN** — "Online Learning for In-Network ML," OSDI 2024
22. **PB-OEL** — "Performance-bounded Online Ensemble Learning via MAB," arXiv:2503.15581, 2025
23. **ATLAS** — "Continual Learning, Not Training: Online Adaptation For Agents," arXiv:2511.01093, 2025
24. **MetaClaw** — "Opportunistic Online Reinforcement Learning," Substack/2026
25. **RLHF Survey** — "A Survey of Reinforcement Learning from Human Feedback," arXiv:2312.14925, 2023
26. **RLHF Statistical** — "RLHF: A Statistical Perspective," arXiv:2604.02507, 2026
27. **Learning from Disagreement** — "Clinician Overrides as Implicit Preference Signals," arXiv:2604.28010, 2026
28. **FMEA Active Learning** — "Leveraging Active Learning for Failure Mode Acquisition," PMC10007120
29. **MemoRepair** — "Barrier-First Cascade Repair in Agentic Memory," arXiv:2605.07242, 2026
30. **LocalKin** — "Self-Evolving Multi-Agent Swarm," 2026
31. **Reflexion** — Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning," 2023
32. **Self-Repair Loop** — "Self-Healing AI Systems: Agents That Fix Their Own Bugs," jangwook.net
33. **VictoriaMetrics vmanomaly** — Scalable online anomaly detection for 150M series
34. **River ML** — Online machine learning library (riverml.xyz)
35. **Anthropic monitorability** — OpenAI/Anthropic work on chain-of-thought monitoring
