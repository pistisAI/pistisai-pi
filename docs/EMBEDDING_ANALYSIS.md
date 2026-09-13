# Embedding-Based Text Analysis for Agent Behavioral Monitoring

> Technical research compendium for pistisai-pi 4-pillar scoring model
> Focus: Local-first approaches on consumer GPU (RTX 4070 12GB)
> Compiled: 2026-09-12

---

## 1. Cosine Similarity for Persona/Tone Consistency

### Core Concept
Cosine similarity measures the angle between two embedding vectors, ignoring magnitude. For persona/tone monitoring, each conversation turn is embedded and compared against:
- **Persona anchor embeddings** (golden examples of "on-brand" responses)
- **Previous turn embeddings** (sliding window for trajectory drift)
- **Baseline centroid** (mean embedding of healthy session)

### Formula
```
cosine_sim(a, b) = (a · b) / (||a|| × ||b||)
```

For L2-normalized vectors (standard for sentence-transformers), this reduces to a dot product.

### Thresholds (from research & SCORING.md)
| Range | Interpretation | Action |
|-------|---------------|--------|
| >0.85 | On-persona | Healthy |
| 0.70–0.85 | Minor deviation | Monitor |
| 0.50–0.69 | Concerning drift | Alert |
| <0.50 | Severe drift | Reset |

**Source:** SCORING.md specifies `>0.85` target for both Aiman (persona consistency) and Aimotions (tone/style). Nautilus Compass uses three-band output: aligned/neutral/deviation.

### Implementation Pattern (Nautilus Compass)
```python
# Weighted top-k mean cosine similarity
# drift_score = pos_score - neg_score
# where pos_score = weighted_top_k_mean(cosine_sim(prompt, positive_anchors))
# and   neg_score = weighted_top_k_mean(cosine_sim(prompt, negative_anchors))
```

**Key finding:** Anchor set design dominates embedder choice for detection accuracy (ROC AUC 0.51 → 0.92 with proper anchors).

---

## 2. Practical Implementations

### 2.1 sentence-transformers (Recommended Primary)

```python
from sentence_transformers import SentenceTransformer, util
import numpy as np

# Model selection for RTX 4070 (12GB VRAM)
MODELS = {
    "fast": "all-MiniLM-L6-v2",      # 384-dim, ~90MB, 38k emb/sec on 4090
    "quality": "BAAI/bge-m3",          # 1024-dim, 1.2GB, multilingual, 7.2k tok/s on 4090
    "balanced": "nomic-embed-text-v1.5" # 768-dim, 274MB, best retrieval quality
}

model = SentenceTransformer("all-MiniLM-L6-v2", device="cuda")

# Encode conversation turns
turns = ["I'll help you with that task...", "Sure thing! Let me...", "lol yeah whatever"]
embeddings = model.encode(turns, normalize_embeddings=True, batch_size=32)

# Pairwise cosine similarity matrix
sim_matrix = util.cos_sim(embeddings, embeddings)

# Compare to persona anchor
persona_anchor = model.encode("Helpful, professional, concise assistant", normalize_embeddings=True)
turn_similarities = util.cos_sim(embeddings, persona_anchor)

# Sliding window trajectory drift
def trajectory_drift(embeddings, window_size=5):
    """Measure how much the conversation is drifting from its own start."""
    centroid = np.mean(embeddings[:window_size], axis=0)
    centroid = centroid / np.linalg.norm(centroid)
    drifts = []
    for emb in embeddings:
        cos = np.dot(emb, centroid)
        drifts.append(1 - cos)  # distance from origin centroid
    return drifts
```

**Performance on RTX 4070:**
- `all-MiniLM-L6-v2`: ~14,000 embeddings/sec, 0.1GB VRAM
- `bge-m3`: ~2,400 embeddings/sec, 2.1GB VRAM
- `nomic-embed-text-v1.5`: ~5,800 embeddings/sec, 0.6GB VRAM

### 2.2 Ollama Embeddings (Zero-Config Alternative)

```python
import requests
import numpy as np

class OllamaEmbedder:
    def __init__(self, model="nomic-embed-text", base_url="http://localhost:11434"):
        self.model = model
        self.base_url = base_url
    
    def encode(self, texts, batch_size=32):
        if isinstance(texts, str):
            texts = [texts]
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            response = requests.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": batch}
            )
            embeddings = response.json()["embeddings"]
            all_embeddings.extend(embeddings)
        return np.array(all_embeddings)

# Usage
embedder = OllamaEmbedder("nomic-embed-text")
embeddings = embedder.encode(["turn 1 text", "turn 2 text", "turn 3 text"])
```

**Ollama embedding models benchmarked:**
| Model | Dims | hit@1 | MRR@10 | VRAM |
|-------|------|-------|--------|------|
| nomic-embed-text | 768 | 95.8% | 0.979 | 0.6GB |
| mxbai-embed-large | 1024 | 95.8% | 0.972 | 1.2GB |
| qwen3-embedding:0.6b | 1024 | 91.7% | 0.958 | 1.4GB |
| bge-m3 | 1024 | 91.7% | 0.951 | 2.1GB |

### 2.3 OpenAI Embedding API (Cloud Reference)

```python
from openai import OpenAI

client = OpenAI()

def get_embeddings(texts, model="text-embedding-3-small"):
    """Cloud fallback — costs ~$0.02/1M tokens."""
    response = client.embeddings.create(
        input=texts,
        model=model,
        dimensions=256  # truncate for cost savings
    )
    return [item.embedding for item in response.data]
```

**When to use cloud:** Only for offline evaluation or when local quality is insufficient. For production monitoring on RTX 4070, local models match or exceed OpenAI quality at zero per-token cost.

### 2.4 Hybrid Architecture (Recommended)

```python
class PersonaMonitor:
    def __init__(self, embedder="local", model_name="all-MiniLM-L6-v2"):
        if embedder == "local":
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(model_name, device="cuda")
            self.encode = lambda texts: self.model.encode(texts, normalize_embeddings=True)
        elif embedder == "ollama":
            self.model = OllamaEmbedder(model_name)
            self.encode = self.model.encode
        
        self.positive_anchors = []  # desired patterns
        self.negative_anchors = []  # flagged mistakes
        self.baseline_centroid = None
    
    def set_persona_anchors(self, positive_texts, negative_texts=None):
        self.positive_anchors = self.encode(positive_texts)
        self.negative_anchors = self.encode(negative_texts) if negative_texts else []
        self.baseline_centroid = np.mean(self.positive_anchors, axis=0)
        self.baseline_centroid /= np.linalg.norm(self.baseline_centroid)
    
    def score_turn(self, turn_text, top_k=3):
        emb = self.encode([turn_text])[0]
        
        # Cosine similarity to positive anchors
        pos_sims = np.dot(self.positive_anchors, emb)
        top_k_pos = np.sort(pos_sims)[-top_k:]
        pos_score = np.mean(top_k_pos)
        
        # Cosine similarity to negative anchors
        neg_score = 0
        if len(self.negative_anchors) > 0:
            neg_sims = np.dot(self.negative_anchors, emb)
            top_k_neg = np.sort(neg_sims)[-top_k:]
            neg_score = np.mean(top_k_neg)
        
        # Drift score: positive - negative
        drift = pos_score - neg_score
        
        # Distance from baseline centroid
        centroid_dist = 1 - np.dot(emb, self.baseline_centroid)
        
        return {
            "drift_score": float(drift),
            "centroid_distance": float(centroid_dist),
            "pos_score": float(pos_score),
            "neg_score": float(neg_score),
            "verdict": "aligned" if drift > 0.7 else "neutral" if drift > 0.5 else "deviation"
        }
```

---

## 3. Jensen-Shannon Distance for Sentiment/Topic Drift

### Concept
Jensen-Shannon Distance (JSD) is a symmetric, smoothed version of KL divergence. It measures the divergence between two probability distributions. For agent monitoring:

- **Sentiment drift:** Compare sentiment score distribution of recent turns vs. baseline
- **Topic drift:** Compare topic distribution (from clustered embeddings) over time
- **Embedding distribution drift:** Compare the distribution of embedding dimensions

### Formula
```
JSD(P || Q) = 0.5 * KL(P || M) + 0.5 * KL(Q || M)
where M = 0.5 * (P + Q)

JSD is in [0, 1] for base-2 log
sqrt(JSD) is a true metric (satisfies triangle inequality)
```

### Implementation

```python
import numpy as np
from scipy.spatial.distance import jensenshannon
from scipy.stats import entropy

class JSDriftDetector:
    def __init__(self, n_bins=50, epsilon=1e-10):
        self.n_bins = n_bins
        self.epsilon = epsilon
        self.baseline_dist = None
    
    def _to_distribution(self, values, bins=None):
        """Convert continuous values to probability distribution."""
        if bins is None:
            bins = np.linspace(values.min(), values.max(), self.n_bins + 1)
        hist, _ = np.histogram(values, bins=bins, density=True)
        hist = hist + self.epsilon  # avoid zeros
        hist = hist / hist.sum()  # normalize
        return hist, bins
    
    def set_baseline(self, baseline_values):
        """Set baseline distribution from healthy session data."""
        self.baseline_dist, self.bins = self._to_distribution(baseline_values)
    
    def compute_jsd(self, current_values):
        """Compute JSD between current and baseline distributions."""
        if self.baseline_dist is None:
            raise ValueError("Call set_baseline() first")
        current_dist, _ = self._to_distribution(current_values, bins=self.bins)
        return jensenshannon(self.baseline_dist, current_dist)
    
    def compute_embedding_jsd(self, baseline_embeddings, current_embeddings):
        """
        Compute JSD on embedding space by comparing per-dimension distributions.
        Returns mean JSD across dimensions.
        """
        n_dims = baseline_embeddings.shape[1]
        jsd_per_dim = []
        for d in range(n_dims):
            baseline_d = baseline_embeddings[:, d]
            current_d = current_embeddings[:, d]
            # Create shared bins
            all_vals = np.concatenate([baseline_d, current_d])
            bins = np.linspace(all_vals.min(), all_vals.max(), self.n_bins + 1)
            baseline_hist, _ = np.histogram(baseline_d, bins=bins, density=True)
            current_hist, _ = np.histogram(current_d, bins=bands, density=True)
            baseline_hist = baseline_hist + self.epsilon
            current_hist = current_hist + self.epsilon
            baseline_hist = baseline_hist / baseline_hist.sum()
            current_hist = current_hist / current_hist.sum()
            jsd = jensenshannon(baseline_hist, current_hist)
            jsd_per_dim.append(jsd)
        return np.mean(jsd_per_dim), jsd_per_dim


# Sentiment drift detection example
class SentimentDriftMonitor:
    def __init__(self):
        self.detector = JSDriftDetector(n_bins=20)
        self.baseline_sentiments = None
    
    def set_baseline(self, sentiment_scores):
        """sentiment_scores: array of [-1, 1] sentiment values from healthy session."""
        self.baseline_sentiments = np.array(sentiment_scores)
        self.detector.set_baseline(self.baseline_sentiments)
    
    def check_drift(self, recent_sentiments):
        """Check if recent sentiment distribution has drifted."""
        jsd = self.detector.compute_jsd(np.array(recent_sentiments))
        return {
            "jsd": float(jsd),
            "drifted": jsd > 0.1,  # SCORING.md threshold
            "severity": "high" if jsd > 0.2 else "medium" if jsd > 0.1 else "low"
        }
```

### Thresholds (from SCORING.md)
| JSD Value | Interpretation |
|-----------|---------------|
| <0.1 | Stable sentiment distribution |
| 0.1–0.2 | Moderate drift, investigate |
| >0.2 | Significant drift, action required |

**Source:** SCORING.md specifies `JSD < 0.1` target for Aimotions pillar.

### Topic Drift via Embedding Clustering

```python
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

class TopicDriftDetector:
    def __init__(self, n_clusters=10, n_pca_components=16):
        self.n_clusters = n_clusters
        self.pca = PCA(n_components=n_pca_components)
        self.kmeans = KMeans(n_clusters=n_clusters)
        self.baseline_topic_dist = None
    
    def fit_baseline(self, baseline_embeddings):
        """Learn topic clusters from baseline session."""
        reduced = self.pca.fit_transform(baseline_embeddings)
        self.kmeans.fit(reduced)
        labels = self.kmeans.predict(reduced)
        # Topic distribution = proportion of turns in each cluster
        self.baseline_topic_dist = np.bincount(labels, minlength=self.n_clusters) / len(labels)
    
    def compute_topic_drift(self, current_embeddings):
        """Compute JSD between current and baseline topic distributions."""
        reduced = self.pca.transform(current_embeddings)
        labels = self.kmeans.predict(reduced)
        current_dist = np.bincount(labels, minlength=self.n_clusters) / len(labels)
        jsd = jensenshannon(self.baseline_topic_dist, current_dist)
        return float(jsd), current_dist
```

---

## 4. Population Stability Index (PSI)

### Concept
PSI measures distribution shift by comparing the proportion of samples in each bin between a reference (baseline) and current population. Originally from credit scoring, now applied to ML monitoring.

### Formula
```
PSI = Σ (Actual_i - Expected_i) × ln(Actual_i / Expected_i)

Where:
- Expected_i = proportion of reference population in bin i
- Actual_i = proportion of current population in bin i
```

### Thresholds
| PSI Value | Interpretation |
|-----------|---------------|
| <0.10 | Stable, no action |
| 0.10–0.25 | Moderate shift, investigate |
| >0.25 | Significant drift, retrain/reset |

**Source:** SCORING.md specifies `>0.2` threshold for Aigent pillar.

### Implementation for Agent Monitoring

```python
import numpy as np

def compute_psi(expected, actual, bins=10, epsilon=1e-4):
    """
    Compute Population Stability Index.
    
    Args:
        expected: reference distribution (1D array of values)
        actual: current distribution (1D array of values)
        bins: number of bins
        epsilon: small value to avoid division by zero
    
    Returns:
        PSI value (float)
    """
    # Create bins from expected distribution
    edges = np.quantile(expected, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    
    expected_counts, _ = np.histogram(expected, bins=edges)
    actual_counts, _ = np.histogram(actual, bins=edges)
    
    expected_pct = expected_counts / len(expected) + epsilon
    actual_pct = actual_counts / len(actual) + epsilon
    
    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


class EmbeddingPSIMonitor:
    """
    Monitor distribution shift in embedding space using PSI.
    Projects high-dimensional embeddings to lower dims via PCA,
    then computes PSI per dimension.
    """
    def __init__(self, n_pca_components=16, bins=10):
        self.n_components = n_pca_components
        self.bins = bins
        self.pca = None
        self.baseline_projected = None
    
    def fit_baseline(self, baseline_embeddings):
        """Fit PCA on baseline and store projected distribution."""
        from sklearn.decomposition import PCA
        self.pca = PCA(n_components=self.n_components)
        self.baseline_projected = self.pca.fit_transform(baseline_embeddings)
        # Store bin edges for each dimension
        self.bin_edges = []
        for d in range(self.n_components):
            edges = np.quantile(
                self.baseline_projected[:, d],
                np.linspace(0, 1, self.bins + 1)
            )
            edges[0], edges[-1] = -np.inf, np.inf
            self.bin_edges.append(edges)
    
    def compute_psi(self, current_embeddings):
        """Compute mean PSI across all PCA dimensions."""
        projected = self.pca.transform(current_embeddings)
        psi_per_dim = []
        for d in range(self.n_components):
            expected = self.baseline_projected[:, d]
            actual = projected[:, d]
            psi = compute_psi(expected, actual, bins=self.bins)
            psi_per_dim.append(psi)
        return float(np.mean(psi_per_dim)), psi_per_dim


# Behavioral feature PSI (action distribution, token counts, etc.)
class BehavioralPSIMonitor:
    def __init__(self):
        self.baseline_features = {}
    
    def set_baseline(self, feature_name, values):
        """Set baseline for a specific behavioral feature."""
        self.baseline_features[feature_name] = np.array(values)
    
    def check_feature(self, feature_name, current_values):
        """Check PSI for a specific feature."""
        if feature_name not in self.baseline_features:
            raise ValueError(f"No baseline for {feature_name}")
        baseline = self.baseline_features[feature_name]
        psi = compute_psi(baseline, np.array(current_values))
        return {
            "feature": feature_name,
            "psi": psi,
            "drifted": psi > 0.2,
            "severity": "high" if psi > 0.25 else "medium" if psi > 0.1 else "low"
        }
```

### PSI on Raw Embeddings: Important Caveat
**Don't run PSI on raw 768-dim vectors** — it's noisy and high-dimensional. Instead:
1. Project to 8-16 dimensions via PCA (fit on reference)
2. Compute PSI on each projection
3. Report mean PSI across dimensions

---

## 5. Baseline Embeddings & Deviation Detection

### Establishing Baselines from "Healthy" Behavior

```python
import numpy as np
from datetime import datetime
import json

class BaselineManager:
    """
    Manages baseline embeddings for agent behavioral monitoring.
    Baselines are computed from verified healthy sessions.
    """
    
    def __init__(self, embedder, persona_anchors=None):
        self.embedder = embedder
        self.persona_anchors = persona_anchors
        self.baselines = {}
    
    def compute_session_baseline(self, session_turns, session_metadata=None):
        """
        Compute baseline statistics from a healthy session.
        
        Args:
            session_turns: list of assistant response texts
            session_metadata: optional dict with session info
        
        Returns:
            baseline dict with all computed statistics
        """
        embeddings = self.embedder.encode(session_turns)
        
        # Centroid (mean embedding)
        centroid = np.mean(embeddings, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        
        # Per-turn cosine similarities to centroid
        sims_to_centroid = np.dot(embeddings, centroid)
        
        # Pairwise similarities (coherence)
        pairwise_sims = np.dot(embeddings, embeddings.T)
        # Exclude diagonal
        mask = ~np.eye(len(embeddings), dtype=bool)
        mean_pairwise = pairwise_sims[mask].mean()
        
        # Distance statistics
        distances = 1 - sims_to_centroid
        
        baseline = {
            "centroid": centroid,
            "n_turns": len(session_turns),
            "mean_sim_to_centroid": float(np.mean(sims_to_centroid)),
            "std_sim_to_centroid": float(np.std(sims_to_centroid)),
            "min_sim_to_centroid": float(np.min(sims_to_centroid)),
            "mean_pairwise_sim": float(mean_pairwise),
            "embedding_std": float(np.std(embeddings, axis=0).mean()),
            "timestamp": datetime.now().isoformat(),
            "metadata": session_metadata
        }
        
        return baseline
    
    def aggregate_baselines(self, session_baselines):
        """
        Aggregate multiple session baselines into a single reference.
        Used when you have multiple "healthy" sessions.
        """
        all_centroids = np.array([b["centroid"] for b in session_baselines])
        global_centroid = np.mean(all_centroids, axis=0)
        global_centroid = global_centroid / np.linalg.norm(global_centroid)
        
        # Use the most conservative (lowest) mean similarity as threshold
        min_mean_sim = min(b["mean_sim_to_centroid"] for b in session_baselines)
        min_pairwise = min(b["mean_pairwise_sim"] for b in session_baselines)
        
        return {
            "centroid": global_centroid,
            "n_sessions": len(session_baselines),
            "mean_sim_threshold": min_mean_sim - 2 * np.std([b["mean_sim_to_centroid"] for b in session_baselines]),
            "pairwise_sim_threshold": min_pairwise,
            "created_at": datetime.now().isoformat()
        }
    
    def save_baseline(self, baseline, path):
        """Save baseline to disk (centroid as numpy, rest as JSON)."""
        np.save(f"{path}_centroid.npy", baseline["centroid"])
        metadata = {k: v for k, v in baseline.items() if k != "centroid"}
        with open(f"{path}_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)
    
    def load_baseline(self, path):
        """Load baseline from disk."""
        centroid = np.load(f"{path}_centroid.npy")
        with open(f"{path}_metadata.json") as f:
            metadata = json.load(f)
        metadata["centroid"] = centroid
        return metadata


class DeviationDetector:
    """
    Detect deviations from baseline in real-time.
    """
    
    def __init__(self, baseline, alert_threshold=0.85):
        self.baseline = baseline
        self.centroid = baseline["centroid"]
        self.threshold = alert_threshold
        self.history = []
    
    def check_turn(self, turn_text, turn_embedding=None):
        """Check a single turn for deviation."""
        if turn_embedding is None:
            turn_embedding = self.embedder.encode([turn_text])[0]
        
        # Cosine similarity to baseline centroid
        cos_sim = float(np.dot(turn_embedding, self.centroid))
        distance = 1 - cos_sim
        
        # Z-score relative to baseline statistics
        if "std_sim_to_centroid" in self.baseline:
            z_score = (cos_sim - self.baseline["mean_sim_to_centroid"]) / self.baseline["std_sim_to_centroid"]
        else:
            z_score = 0
        
        result = {
            "cosine_similarity": cos_sim,
            "distance": distance,
            "z_score": float(z_score),
            "is_deviation": cos_sim < self.threshold,
            "severity": self._classify_severity(cos_sim, z_score)
        }
        
        self.history.append(result)
        return result
    
    def _classify_severity(self, cos_sim, z_score):
        if cos_sim > 0.85:
            return "healthy"
        elif cos_sim > 0.70:
            return "mild"
        elif cos_sim > 0.55:
            return "moderate"
        else:
            return "severe"
    
    def check_trajectory(self, window_size=10):
        """
        Check if the recent trajectory shows accelerating drift.
        Uses CUSUM-like detection on the similarity time series.
        """
        if len(self.history) < window_size:
            return {"drift_detected": False, "reason": "insufficient_history"}
        
        recent = self.history[-window_size:]
        sims = [h["cosine_similarity"] for h in recent]
        
        # Trend detection: is similarity decreasing?
        trend = np.polyfit(range(window_size), sims, 1)[0]
        
        # Cumulative negative deviation from threshold
        deviations = [max(0, self.threshold - s) for s in sims]
        cumulative_deviation = sum(deviations)
        
        return {
            "drift_detected": trend < -0.01 or cumulative_deviation > 0.5,
            "trend_slope": float(trend),
            "cumulative_deviation": float(cumulative_deviation),
            "mean_recent_sim": float(np.mean(sims)),
            "min_recent_sim": float(np.min(sims))
        }
```

### Baseline Establishment Protocol

1. **Collect healthy sessions:** 10+ sessions verified as "on-persona" by human review or LLM-judge
2. **Compute per-session baselines:** Centroid, similarity statistics, pairwise coherence
3. **Aggregate:** Global centroid from mean of session centroids
4. **Set thresholds:** 
   - Cosine similarity threshold: `mean - 2*std` from healthy sessions
   - JSD threshold: 0.1 (from SCORING.md)
   - PSI threshold: 0.2 (from SCORING.md)
5. **Validate:** Test against held-out healthy sessions and known-drift sessions

---

## 6. Lightweight Approaches for RTX 4070 (12GB)

### Recommended Model Stack

| Component | Model | VRAM | Speed | Use Case |
|-----------|-------|------|-------|----------|
| **Embeddings** | `all-MiniLM-L6-v2` | 0.1 GB | ~14k emb/sec | Real-time per-turn monitoring |
| **Embeddings (quality)** | `nomic-embed-text-v1.5` | 0.6 GB | ~5.8k emb/sec | Higher quality, still fast |
| **Embeddings (multilingual)** | `bge-m3` | 2.1 GB | ~2.4k emb/sec | Multilingual support |
| **LLM (reasoning)** | `Qwen3-30B-A3B` (Q4) | 8.2 GB | 100 tok/s | Agent reasoning |
| **LLM (lightweight)** | `Qwen3.5-9B` (Q4) | ~7 GB | ~20 tok/s | Smaller agent tasks |

### VRAM Budget for RTX 4070 (12GB)

```
Recommended split:
- Embedding model:     0.6 GB  (nomic-embed-text)
- LLM (if needed):     8.0 GB  (Qwen3-30B-A3B Q4)
- KV cache:            2.0 GB
- Monitoring overhead: 0.5 GB
- Headroom:            0.9 GB
-----------------------
Total:                 12.0 GB
```

### Optimized Local Pipeline

```python
import numpy as np
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import jensenshannon
from collections import deque
import time

class LocalBehavioralMonitor:
    """
    Lightweight behavioral monitor designed for RTX 4070.
    Runs entirely locally with minimal VRAM footprint.
    """
    
    def __init__(self, embedding_model="all-MiniLM-L6-v2", device="cuda"):
        # Load embedding model (~90MB for MiniLM)
        self.model = SentenceTransformer(embedding_model, device=device)
        self.embedding_dim = self.model.get_sentence_embedding_dimension()
        
        # State
        self.turn_embeddings = []
        self.turn_texts = []
        self.cosine_history = []
        self.baseline_centroid = None
        self.baseline_set = False
        
        # Configuration (from SCORING.md)
        self.cosine_threshold = 0.85
        self.jsd_threshold = 0.1
        self.psi_threshold = 0.2
        self.trajectory_window = 50  # ASI framework: 50-interaction windows
        
        # Performance tracking
        self.embed_times = deque(maxlen=100)
    
    def set_baseline_from_texts(self, healthy_turns):
        """Set baseline from a list of healthy assistant responses."""
        embeddings = self.model.encode(healthy_turns, show_progress_bar=False)
        self.baseline_centroid = np.mean(embeddings, axis=0)
        self.baseline_centroid /= np.linalg.norm(self.baseline_centroid)
        self.baseline_embeddings = embeddings
        self.baseline_set = True
        
        # Compute baseline statistics
        sims = np.dot(embeddings, self.baseline_centroid)
        self.baseline_mean_sim = np.mean(sims)
        self.baseline_std_sim = np.std(sims)
        
        print(f"Baseline set: {len(healthy_turns)} turns, "
              f"mean_sim={self.baseline_mean_sim:.3f}, "
              f"std_sim={self.baseline_std_sim:.3f}")
    
    def process_turn(self, turn_text):
        """Process a new conversation turn and return monitoring metrics."""
        start = time.time()
        
        # Embed the turn
        embedding = self.model.encode([turn_text], show_progress_bar=False)[0]
        embed_time = time.time() - start
        self.embed_times.append(embed_time)
        
        self.turn_embeddings.append(embedding)
        self.turn_texts.append(turn_text)
        
        # Compute metrics
        metrics = {}
        
        if self.baseline_set:
            # Cosine similarity to baseline centroid
            cos_sim = float(np.dot(embedding, self.baseline_centroid))
            metrics["cosine_similarity"] = cos_sim
            metrics["distance"] = 1 - cos_sim
            metrics["is_deviation"] = cos_sim < self.cosine_threshold
            
            # Z-score
            if self.baseline_std_sim > 0:
                z_score = (cos_sim - self.baseline_mean_sim) / self.baseline_std_sim
                metrics["z_score"] = float(z_score)
        
        # Trajectory drift (sliding window)
        if len(self.turn_embeddings) >= 2:
            window = min(self.trajectory_window, len(self.turn_embeddings))
            recent_embs = np.array(self.turn_embeddings[-window:])
            recent_centroid = np.mean(recent_embs, axis=0)
            recent_centroid /= np.linalg.norm(recent_centroid)
            
            # How far is recent centroid from baseline?
            if self.baseline_set:
                trajectory_drift = 1 - float(np.dot(recent_centroid, self.baseline_centroid))
                metrics["trajectory_drift"] = trajectory_drift
        
        # Performance
        metrics["embed_time_ms"] = embed_time * 1000
        metrics["avg_embed_time_ms"] = np.mean(self.embed_times) * 1000
        
        self.cosine_history.append(metrics.get("cosine_similarity", None))
        
        return metrics
    
    def compute_window_jsd(self, window_size=50):
        """Compute JSD between recent window and baseline embedding distribution."""
        if not self.baseline_set or len(self.turn_embeddings) < window_size:
            return None
        
        recent = np.array(self.turn_embeddings[-window_size:])
        
        # Per-dimension JSD
        jsd_per_dim = []
        for d in range(self.embedding_dim):
            baseline_d = self.baseline_embeddings[:, d]
            recent_d = recent[:, d]
            # Shared bins
            all_vals = np.concatenate([baseline_d, recent_d])
            bins = np.linspace(all_vals.min(), all_vals.max(), 30)
            baseline_hist, _ = np.histogram(baseline_d, bins=bins, density=True)
            recent_hist, _ = np.histogram(recent_d, bins=bins, density=True)
            baseline_hist = baseline_hist + 1e-10
            recent_hist = recent_hist + 1e-10
            baseline_hist = baseline_hist / baseline_hist.sum()
            recent_hist = recent_hist / recent_hist.sum()
            jsd = jensenshannon(baseline_hist, recent_hist)
            jsd_per_dim.append(jsd)
        
        mean_jsd = float(np.mean(jsd_per_dim))
        return {
            "mean_jsd": mean_jsd,
            "max_jsd": float(np.max(jsd_per_dim)),
            "drifted": mean_jsd > self.jsd_threshold
        }
    
    def compute_window_psi(self, window_size=50):
        """Compute PSI on embedding projection."""
        if not self.baseline_set or len(self.turn_embeddings) < window_size:
            return None
        
        # Project to lower dims using PCA fit on baseline
        from sklearn.decomposition import PCA
        n_components = min(8, self.embedding_dim)
        pca = PCA(n_components=n_components)
        baseline_projected = pca.fit_transform(self.baseline_embeddings)
        recent_projected = pca.transform(np.array(self.turn_embeddings[-window_size:]))
        
        psi_per_dim = []
        for d in range(n_components):
            psi = compute_psi(baseline_projected[:, d], recent_projected[:, d])
            psi_per_dim.append(psi)
        
        mean_psi = float(np.mean(psi_per_dim))
        return {
            "mean_psi": mean_psi,
            "max_psi": float(np.max(psi_per_dim)),
            "drifted": mean_psi > self.psi_threshold
        }
    
    def get_health_summary(self):
        """Get overall health summary for the session."""
        if not self.turn_embeddings:
            return {"status": "no_data"}
        
        recent_sims = [s for s in self.cosine_history[-self.trajectory_window:] if s is not None]
        
        summary = {
            "total_turns": len(self.turn_embeddings),
            "recent_mean_cosine": float(np.mean(recent_sims)) if recent_sims else None,
            "recent_min_cosine": float(np.min(recent_sims)) if recent_sims else None,
            "deviation_count": sum(1 for s in recent_sims if s < self.cosine_threshold),
            "deviation_rate": sum(1 for s in recent_sims if s < self.cosine_threshold) / len(recent_sims) if recent_sims else 0,
        }
        
        # ASI-style health classification
        if summary["recent_mean_cosine"] and summary["recent_mean_cosine"] > 0.85:
            summary["health"] = "healthy"
        elif summary["recent_mean_cosine"] and summary["recent_mean_cosine"] > 0.75:
            summary["health"] = "degraded"
        elif summary["recent_mean_cosine"] and summary["recent_mean_cosine"] > 0.50:
            summary["health"] = "drifted"
        else:
            summary["health"] = "critical"
        
        return summary
```

### Performance Benchmarks (Estimated for RTX 4070)

| Operation | all-MiniLM-L6-v2 | nomic-embed-text | bge-m3 |
|-----------|-----------------|------------------|--------|
| Single embedding | ~0.07ms | ~0.17ms | ~0.42ms |
| Batch 32 | ~2ms | ~5ms | ~13ms |
| Batch 128 | ~7ms | ~19ms | ~50ms |
| Full pipeline (embed + cosine + JSD) | ~0.5ms | ~1ms | ~2ms |
| VRAM usage | 0.1GB | 0.6GB | 2.1GB |

**Throughput:** Even with bge-m3, you can process ~2,400 turns/second — far exceeding real-time conversation needs.

### Memory-Efficient Streaming Version

```python
class StreamingMonitor:
    """
    Memory-efficient version that doesn't store all embeddings.
    Uses running statistics instead.
    """
    
    def __init__(self, model, max_window=1000):
        self.model = model
        self.max_window = max_window
        self.recent_embeddings = deque(maxlen=max_window)
        self.running_sum = None
        self.running_sum_sq = None
        self.count = 0
    
    def process_turn(self, text):
        emb = self.model.encode([text])[0]
        
        if self.running_sum is None:
            self.running_sum = np.zeros_like(emb)
            self.running_sum_sq = np.zeros_like(emb)
        
        self.recent_embeddings.append(emb)
        self.running_sum += emb
        self.running_sum_sq += emb ** 2
        self.count += 1
        
        # Running centroid
        centroid = self.running_sum / self.count
        centroid = centroid / np.linalg.norm(centroid)
        
        cos_sim = float(np.dot(emb, centroid))
        
        return {"cosine_similarity": cos_sim, "turn": self.count}
```

---

## 7. Integration with pistisai-pi 4-Pillar Model

### Mapping to SCORING.md

| Pillar | Metric | Method | Threshold | Implementation |
|--------|--------|--------|-----------|----------------|
| **Aiman** | Persona consistency | Cosine similarity to baseline | >0.85 | `LocalBehavioralMonitor.process_turn()` |
| **Aiman** | Identity coherence | Anchor-based drift score | 3-band | Nautilus Compass pattern |
| **Aimotions** | Tone/style consistency | Embedding similarity | >0.85 | Same as Aiman, different anchors |
| **Aimotions** | Sentiment drift | JSD on sentiment distribution | <0.1 | `JSDriftDetector` |
| **Aigent** | Input distribution shift | PSI on embedding projection | <0.2 | `EmbeddingPSIMonitor` |
| **Aigent** | Tool usage patterns | KL/chi-squared on tool freq | varies | `BehavioralPSIMonitor` |
| **Aidration** | Behavioral trajectory | CUSUM on cosine trend | trend < -0.01 | `DeviationDetector.check_trajectory()` |

### Recommended Monitoring Cadence (from SCORING.md)

```python
MONITORING_CADENCE = {
    "Aiman": "every_50_interactions",      # Behavioral layer
    "Aimotions": "every_50_interactions",   # Behavioral layer
    "Aigent": "every_60_seconds",           # Cognitive layer
    "Aidration": "every_10_seconds",        # System layer
    "ASI_rollup": "every_60_seconds"
}
```

---

## 8. Library Recommendations

| Library | Purpose | Install | Notes |
|---------|---------|---------|-------|
| **sentence-transformers** | Embedding generation | `pip install sentence-transformers` | Primary choice, GPU-accelerated |
| **ollama** | Local embedding serving | `pip install ollama` | REST API, easy model management |
| **scipy** | JSD, statistical tests | `pip install scipy` | `jensenshannon`, `entropy` |
| **scikit-learn** | PCA, KMeans, metrics | `pip install scikit-learn` | Dimensionality reduction |
| **numpy** | Vector operations | `pip install numpy` | Core dependency |
| **evidently** | Drift reporting | `pip install evidently` | HTML reports, PSI built-in |

### Optional/Advanced
| Library | Purpose |
|---------|---------|
| **faiss-cpu** / **faiss-gpu** | Fast similarity search for large anchor sets |
| **chromadb** | Vector storage for anchor management |
| **text-embeddings-inference** | HuggingFace's high-throughput embedding server |
| **llama.cpp** (via Ollama) | Running embedding models as GGUF |

---

## 9. Key Research Sources

### Primary Papers
1. **Nautilus Compass** — arXiv:2605.09863 — Black-box persona drift detection, ROC AUC 0.83, cosine similarity on BGE-m3 embeddings
2. **ContextEcho** — arXiv:2605.24279 — 2525-probe identity suite, persona degrades >30% after 8-12 turns
3. **Persona Vectors** — arXiv:2507.21509 — White-box trait monitoring via activation deltas (Anthropic)
4. **SPASM** — arXiv:2604.09212 — Instruction drift, personality shift in multi-turn
5. **Agent Stability Index** — arXiv:2601.04170 — Composite metric, ASI < 0.75 triggers intervention
6. **Geometric Identity Framework** — arXiv:2606.21843 — √JSD metric spaces for identity measurement
7. **ProxyDrift** — arXiv:2608.08245 — Privacy-preserving LLM drift detection with JSD
8. **Real-Time Failure Detection** — arXiv:2608.02464 — One-class ESN with CUSUM, 200μs per step

### Industry References
- **Galileo** — JSD/PSI drift detection in production ML
- **Google Cloud KPIs** — Three-pillar framework for production AI agents
- **XenonStack** — Multi-layer observability (System → Cognitive → Behavioral)
- **FutureAGI** — PSI for LLM input distribution monitoring

### Practical Libraries/Tools
- **context-decay-drift** (PyPI) — Sentence-transformer + OpenAI drift detection
- **persiq** (PyPI) — Persona drift scoring with sliding windows
- **Semantic NLP Data Drift Detection** (GitHub) — Sentence Transformers + Evidently

---

## 10. Summary of Recommendations

### For pistisai-pi on RTX 4070:

1. **Use `all-MiniLM-L6-v2`** for real-time per-turn monitoring (fastest, 0.1GB VRAM)
2. **Use `nomic-embed-text-v1.5`** for higher-quality periodic checks (0.6GB VRAM)
3. **Use `bge-m3`** only if multilingual support is needed (2.1GB VRAM)
4. **Implement Nautilus Compass pattern** for Aiman: positive/negative anchor sets with weighted top-k cosine similarity
5. **Use JSD** for Aimotions sentiment drift (threshold 0.1)
6. **Use PSI** for Aigent input distribution shift (threshold 0.2)
7. **Establish baselines** from 10+ verified healthy sessions
8. **Monitor on 50-interaction windows** per ASI framework
9. **Project embeddings to 8-16 dims** before PSI (avoid high-dimensional noise)
10. **Keep everything local** — cloud APIs not needed for embedding quality in 2026

### Performance Budget
- Embedding: <1ms per turn (all-MiniLM-L6-v2)
- Full pipeline: <5ms per turn
- VRAM: <1GB for monitoring (leaves 11GB for agent LLM)
- Throughput: 1000+ turns/second (far exceeds real-time needs)

---

*This document should be saved to `/mnt/data/dev/projects/pistisai-pi/docs/EMBEDDING_ANALYSIS.md` for reference by the implementation team.*
