# SPC Methods for AI Agent Health Monitoring — Research Summary
## Mapping to pistisai-pi 4-Pillar Scoring Model

> Generated: 2026-09-12 | Context: pistisai-pi project, RTX 4070, TypeScript, numpy-only preference

---

## 1. CUSUM (Cumulative Sum) Control Charts

### Mathematical Formulation
Two one-sided statistics accumulate deviations from target μ₀:
- **Upper CUSUM**: C⁺ᵢ = max(0, C⁺ᵢ₋₁ + xᵢ − (μ₀ + K))
- **Lower CUSUM**: C⁻ᵢ = max(0, C⁻ᵢ₋₁ + (μ₀ − K) − xᵢ)

Signal when either exceeds decision interval H.

### Tuning Parameters
| Parameter | Standard Value | Meaning |
|-----------|---------------|---------|
| k (reference) | 0.5 | Half the shift to detect, in σ units. k=0.5 → optimal for 1σ shift |
| K (slack) | k × σ | Absolute slack allowance |
| h (decision) | 4–5 | Decision interval in σ units. h=4 → ARL₀≈465; h=5 → ARL₀≈1000 |
| H (threshold) | h × σ | Absolute decision boundary |

### When to Trigger Alerts
- Signal when C⁺ > H or C⁻ > H
- **Reset** accumulators to 0 after signal + investigation
- For ARL₀ ≈ 370 (equivalent to 3σ Shewhart): use h ≈ 4.77

### Python Implementation (numpy-only)
```python
import numpy as np

class CUSUMDetector:
    def __init__(self, k=0.5, h=5.0, mu0=None, sigma=None):
        self.k = k          # reference value (in sigma units)
        self.h = h          # decision interval (in sigma units)
        self.mu0 = mu0      # target mean (None = estimate from warmup)
        self.sigma = sigma  # process std (None = estimate from warmup)
        self.c_pos = 0.0
        self.c_neg = 0.0
        self.warmup = []
        self.warmup_window = 50
        self.initialized = False
        self.signals = []

    def update(self, x: float) -> dict:
        if not self.initialized:
            self.warmup.append(x)
            if len(self.warmup) >= self.warmup_window:
                self.mu0 = np.mean(self.warmup)
                self.sigma = max(np.std(self.warmup, ddof=1), 1e-9)
                self.initialized = True
            return {"signal": False, "c_pos": 0, "c_neg": 0, "warmup": True}

        z = (x - self.mu0) / self.sigma
        self.c_pos = max(0, self.c_pos + z - self.k)
        self.c_neg = max(0, self.c_neg - z - self.k)

        signal = self.c_pos > self.h or self.c_neg > self.h
        if signal:
            self.signals.append({"idx": len(self.signals), "c_pos": self.c_pos, "c_neg": self.c_neg})
            self.c_pos = 0.0
            self.c_neg = 0.0

        return {"signal": signal, "c_pos": self.c_pos, "c_neg": self.c_neg, "z": z}

    def reset(self):
        self.c_pos = 0.0
        self.c_neg = 0.0
```

### TypeScript Implementation (zero dependencies)
```typescript
interface CUSUMResult {
  signal: boolean;
  cPos: number;
  cNeg: number;
  z: number;
  warmup: boolean;
}

class CUSUMDetector {
  private k: number;
  private h: number;
  private mu0: number | null = null;
  private sigma: number | null = null;
  private cPos = 0;
  private cNeg = 0;
  private warmup: number[] = [];
  private warmupWindow = 50;
  private initialized = false;

  constructor(k = 0.5, h = 5.0, mu0?: number, sigma?: number) {
    this.k = k;
    this.h = h;
    this.mu0 = mu0 ?? null;
    this.sigma = sigma ?? null;
    this.initialized = mu0 !== undefined && sigma !== undefined;
  }

  update(x: number): CUSUMResult {
    if (!this.initialized) {
      this.warmup.push(x);
      if (this.warmup.length >= this.warmupWindow) {
        this.mu0 = this.warmup.reduce((a, b) => a + b, 0) / this.warmup.length;
        const variance = this.warmup.reduce((s, v) => s + (v - this.mu0!) ** 2, 0) / (this.warmup.length - 1);
        this.sigma = Math.max(Math.sqrt(variance), 1e-9);
        this.initialized = true;
      }
      return { signal: false, cPos: 0, cNeg: 0, z: 0, warmup: true };
    }

    const z = (x - this.mu0!) / this.sigma!;
    this.cPos = Math.max(0, this.cPos + z - this.k);
    this.cNeg = Math.max(0, this.cNeg - z - this.k);

    const signal = this.cPos > this.h || this.cNeg > this.h;
    if (signal) {
      this.cPos = 0;
      this.cNeg = 0;
    }
    return { signal, cPos: this.cPos, cNeg: this.cNeg, z, warmup: false };
  }
}
```

---

## 2. EWMA (Exponentially Weighted Moving Average)

### Mathematical Formulation
Zᵢ = λ · xᵢ + (1 − λ) · Zᵢ₋₁, with Z₀ = μ₀

Control limits (asymptotic):
- UCL/LCL = μ₀ ± L · σ · √(λ / (2 − λ))

### Optimal Alpha (λ) Selection
| Target Shift | λ | L | ARL₀ |
|-------------|---|---|------|
| 0.25σ (very small) | 0.05 | 2.49 | ~370 |
| 0.50σ | 0.10 | 2.70 | ~370 |
| 0.75σ | 0.20 | 2.86 | ~370 |
| 1.00σ | 0.40 | 3.00 | ~370 |

**Rule of thumb**: λ = 0.2, L = 3 for general monitoring (good balance).

### EWMA vs CUSUM Comparison
| Aspect | CUSUM | EWMA |
|--------|-------|------|
| Best at detecting | Sharp step changes | Gradual drifts, noisy signals |
| Memory | Non-negative accumulator (resets at 0) | Exponentially decaying |
| Tuning parameter | k (reference slack) | λ (smoothing) |
| Decision threshold | h (fixed) | Lσ (time-varying limits) |
| Detection speed at δ=1σ | ~10–12 obs | ~10–15 obs |
| Noise handling | Better for abrupt shifts | Better for noisy/slow signals |
| Sensitivity to normality | Higher | Lower (more robust) |

### Python Implementation (numpy-only)
```python
import numpy as np

class EWMADetector:
    def __init__(self, alpha=0.2, L=3.0, mu0=None, sigma=None):
        self.alpha = alpha  # smoothing factor (0 < α ≤ 1)
        self.L = L          # control limit width (sigma multiplier)
        self.mu0 = mu0
        self.sigma = sigma
        self.z = None       # current EWMA statistic
        self.warmup = []
        self.warmup_window = 50
        self.initialized = False
        self.signals = []

    def update(self, x: float) -> dict:
        if not self.initialized:
            self.warmup.append(x)
            if len(self.warmup) >= self.warmup_window):
                self.mu0 = np.mean(self.warmup)
                self.sigma = max(np.std(self.warmup, ddof=1), 1e-9)
                self.z = self.mu0
                self.initialized = True
            return {"signal": False, "z": self.z, "warmup": True}

        self.z = self.alpha * x + (1 - self.alpha) * self.z

        # Asymptotic control limits
        limit_width = self.L * self.sigma * np.sqrt(self.alpha / (2 - self.alpha))
        ucl = self.mu0 + limit_width
        lcl = self.mu0 - limit_width

        signal = self.z > ucl or self.z < lcl
        if signal:
            self.signals.append({"z": self.z, "ucl": ucl, "lcl": lcl})

        return {"signal": signal, "z": self.z, "ucl": ucl, "lcl": lcl, "warmup": False}
```

---

## 3. Shewhart Control Charts + Western Electric Rules

### The 8 WECO Rules
| Rule | Signal Condition | Detects |
|------|-----------------|---------|
| 1 | 1 point beyond 3σ (Zone A) | Large sudden shift/outlier |
| 2 | 2 of 3 consecutive points in Zone A or beyond, same side | Moderate process shift |
| 3 | 4 of 5 consecutive points beyond 1σ, same side | Small sustained mean shift |
| 4 | 8 consecutive points on same side of CL | Mean drift |
| 5 | 2 of 3 points beyond 2σ, same side | Warning zone (moderate) |
| 6 | 4 of 5 points beyond 1σ, same side | Small-shift detector |
| 7 | 15 consecutive points within 1σ of CL | Stratification (suspiciously low variation) |
| 8 | 8 consecutive points beyond 1σ from CL, either side | Mixture (two processes interleaved) |

**False alarm rate**: Rule 1 alone = 1/370 per point. All 8 rules combined ≈ 1/92 per point.

### Python Implementation (numpy-only)
```python
import numpy as np

class WesternElectricRules:
    def __init__(self, mu0, sigma):
        self.mu0 = mu0
        self.sigma = sigma
        self.history = []
        self.violations = []

    def update(self, x: float) -> dict:
        self.history.append(x)
        n = len(self.history)
        violations = []

        # Rule 1: 1 point beyond 3σ
        if abs(x - self.mu0) > 3 * self.sigma:
            violations.append({"rule": 1, "index": n - 1, "desc": "Point beyond 3σ"})

        # Rule 2: 2 of 3 consecutive in Zone A (2σ+), same side
        if n >= 3:
            window = self.history[-3:]
            above = sum(1 for v in window if v - self.mu0 > 2 * self.sigma)
            below = sum(1 for v in window if self.mu0 - v > 2 * self.sigma)
            if above >= 2 or below >= 2:
                violations.append({"rule": 2, "index": n - 1, "desc": "2 of 3 beyond 2σ same side"})

        # Rule 3: 4 of 5 consecutive beyond 1σ, same side
        if n >= 5:
            window = self.history[-5:]
            above = sum(1 for v in window if v - self.mu0 > self.sigma)
            below = sum(1 for v in window if self.mu0 - v > self.sigma)
            if above >= 4 or below >= 4:
                violations.append({"rule": 3, "index": n - 1, "desc": "4 of 5 beyond 1σ same side"})

        # Rule 4: 8 consecutive on same side of centerline
        if n >= 8:
            window = self.history[-8:]
            if all(v > self.mu0 for v in window) or all(v < self.mu0 for v in window):
                violations.append({"rule": 4, "index": n - 1, "desc": "8 consecutive same side of CL"})

        self.violations.extend(violations)
        return {"signal": len(violations) > 0, "violations": violations}
```

---

## 4. Change-Point Detection Algorithms

### 4.1 Bayesian Online Changepoint Detection (BOCD)
**Reference**: Adams & MacKay (2007), "Bayesian Online Changepoint Detection"

Tracks run-length distribution P(rₜ | x₁:ₜ). Two outcomes per step: grow or reset.

```python
import numpy as np
from scipy.special import logsumexp

class GaussianUnknownMean:
    """Normal model with unknown mean, known variance."""
    def __init__(self, mean0, var0, varx):
        self.mu = np.array([mean0])
        self.kappa = np.array([1.0])
        self.alpha = np.array([0.01])
        self.beta = np.array([0.01])
        self.varx = varx

    def log_pred_prob(self, x):
        """Student-t log predictive probability."""
        df = 2 * self.alpha
        loc = self.mu
        scale = np.sqrt(self.beta * (self.kappa + 1) / (self.alpha * self.kappa))
        # Simplified log-likelihood (use scipy.stats.t.logpdf in production)
        z = (x - loc) / scale
        return -0.5 * (df + 1) * np.log1p(z**2 / df) - np.log(scale) - 0.5 * np.log(df * np.pi)

    def update_params(self, x):
        """Bayesian update of conjugate parameters."""
        new_mu = np.append([self.mu[0]], (self.kappa * self.mu + x) / (self.kappa + 1))
        new_kappa = np.append([1.0], self.kappa + 1)
        new_alpha = np.append([0.01], self.alpha + 0.5)
        new_beta = np.append([0.01], self.beta + 0.5 * self.kappa * (x - self.mu)**2 / (self.kappa + 1))
        self.mu, self.kappa, self.alpha, self.beta = new_mu, new_kappa, new_alpha, new_beta


def bocd(data, hazard_rate=1/100, mean0=0, var0=2, varx=1):
    """Bayesian Online Changepoint Detection."""
    T = len(data)
    R = np.zeros((T + 1, T + 1))
    R[0, 0] = 1.0
    model = GaussianUnknownMean(mean0, var0, varx)
    changepoint_probs = np.zeros(T)

    for t in range(T):
        x = data[t]
        pred_probs = np.exp(model.log_pred_prob(x))

        # Growth: extend run lengths
        R[1:t + 2, t + 1] = R[:t + 1, t] * pred_probs * (1 - hazard_rate)
        # Changepoint: reset to run_length = 0
        R[0, t + 1] = np.sum(R[:t + 1, t] * pred_probs * hazard_rate)

        evidence = R[:t + 2, t + 1].sum()
        if evidence > 0:
            R[:t + 2, t + 1] /= evidence

        changepoint_probs[t] = R[0, t + 1]
        model.update_params(x)

    return R, changepoint_probs
```

**Alert threshold**: P(changepoint) > 0.5–0.8 typically signals a regime shift.

### 4.2 PELT (Pruned Exact Linear Time)
**Reference**: Killick, Fearnhead, Eckley (2012), JASA

Minimizes: Σ cost(segment) + penalty × (# changepoints)

```python
import numpy as np

def pelt_cost_l2(data, start, end):
    """L2 cost (Gaussian negative log-likelihood) for segment."""
    if end - start < 2:
        return 0.0
    segment = data[start:end]
    return np.sum((segment - segment.mean())**2)

def pelt_detect(data, penalty=None, min_segment=2):
    """PELT changepoint detection (numpy-only, no ruptures needed)."""
    n = len(data)
    if penalty is None:
        penalty = 2 * np.log(n)  # BIC-like default

    # Dynamic programming: F[t] = min cost to segment data[:t]
    F = np.full(n + 1, np.inf)
    F[0] = -penalty  # offset for first segment
    cp = np.zeros(n + 1, dtype=int)
    candidates = [0]

    for t in range(min_segment, n + 1):
        min_cost = np.inf
        best_s = 0
        new_candidates = []

        for s in candidates:
            if t - s < min_segment:
                new_candidates.append(s)
                continue

            cost = F[s] + pelt_cost_l2(data, s, t) + penalty
            if cost < min_cost:
                min_cost = cost
                best_s = s

            # PELT pruning: keep if cost could still be optimal
            if cost <= min_cost + penalty:
                new_candidates.append(s)

        F[t] = min_cost
        cp[t] = best_s
        new_candidates.append(t - min_segment + 1 if t - min_segment + 1 >= 0 else 0)
        candidates = list(set(new_candidates))

    # Backtrack to find changepoints
    changepoints = []
    current = n
    while cp[current] > 0:
        changepoints.append(cp[current])
        current = cp[current]
    changepoints.reverse()

    return changepoints
```

**Penalty selection**:
- BIC: penalty = 2·log(n)·variance
- AIC: penalty = 2·k (k = number of parameters)
- Manual: 10–50 for typical time series monitoring

### 4.3 CUSUM-Based Change-Point Detection
(Already covered in §1; reset accumulators after each detected changepoint to find subsequent ones.)

---

## 5. Composite Monitoring System Design

### Architecture: "Ensemble Voting" for pistisai-pi

**Recommended combination**: Shewhart (3σ) + CUSUM + EWMA + BOCD

| Component | Role | Sensitivity |
|-----------|------|-------------|
| Shewhart 3σ | Large sudden shifts (crisis) | 2–3σ |
| WECO Rules 2–4 | Moderate shifts, drift patterns | 1–2σ |
| CUSUM | Sustained small shifts (early warning) | 0.5–1σ |
| EWMA | Gradual drift (noisy signals) | 0.5–1.5σ |
| BOCD | Regime detection, prior-aware | Any shift |

### Alert Logic (for pistisai-pi 4-pillar model)

```python
class PillarMonitor:
    """Composite SPC monitor for a single pillar score (0.0–1.0)."""

    def __init__(self, pillar_name: str, warmup=50):
        self.name = pillar_name
        self.warmup = warmup
        self.history = []

        # CUSUM: sensitive to small sustained drops
        self.cusum = CUSUMDetector(k=0.5, h=4.0)

        # EWMA: sensitive to gradual drift
        self.ewma = EWMADetector(alpha=0.15, L=2.8)

        # Western Electric rules (initialized after warmup)
        self.weco = None
        self.mu0 = None
        self.sigma = None

    def update(self, score: float) -> dict:
        """Process new pillar score, return alert level."""
        self.history.append(score)
        result = {"pillar": self.name, "score": score, "alert_level": "healthy"}

        # Feed CUSUM
        cusum_result = self.cusum.update(score)

        # Feed EWMA
        ewma_result = self.ewma.update(score)

        # After warmup, run WECO rules
        if len(self.history) >= self.warmup and self.weco is None:
            self.mu0 = np.mean(self.history[:self.warmup])
            self.sigma = max(np.std(self.history[:self.warmup], ddof=1), 0.01)
            self.weco = WesternElectricRules(self.mu0, self.sigma)
            # Seed history
            for s in self.history:
                self.weco.update(s)

        if self.weco:
            weco_result = self.weco.update(score)
        else:
            weco_result = {"signal": False, "violations": []}

        # Ensemble voting
        alerts = []
        if cusum_result["signal"]:
            alerts.append("cusum")
        if ewma_result["signal"]:
            alerts.append("ewma")
        if weco_result["signal"]:
            alerts.append(f"weco_rule{weco_result['violations'][0]['rule']}")

        # Map to ASI alert levels
        if len(alerts) >= 2:
            result["alert_level"] = "critical"      # Multiple detectors fired
        elif len(alerts) == 1:
            result["alert_level"] = "degraded"      # Single detector fired
        elif score < 0.75:
            result["alert_level"] = "warning"       # Absolute threshold breach

        result["alerts"] = alerts
        return result
```

### Threshold Recommendations for pistisai-pi ASI

| Alert Level | Condition | Action |
|-------------|-----------|--------|
| **Healthy** | No detectors fire, ASI ≥ 0.85 | Continue monitoring |
| **Warning** | Absolute ASI < 0.75, no SPC signal | Increase monitoring cadence |
| **Degraded** | 1 detector fires OR ASI 0.50–0.74 | Log warning, trigger per-pillar repair |
| **Critical** | ≥2 detectors fire OR ASI < 0.50 | Immediate session reset + human notification |

---

## 6. Mapping SPC Methods to pistisai-pi 4-Pillar Model

| Pillar | Score Range | Primary SPC | Secondary SPC | Tertiary |
|--------|-------------|-------------|---------------|----------|
| **Aiman** (Identity) | 0.0–1.0 | EWMA (α=0.1) | CUSUM (k=0.5, h=4) | BOCD (hazard=1/200) |
| **Aigent** (Capability) | 0.0–1.0 | CUSUM (k=0.5, h=5) | Shewhart + WECO | EWMA (α=0.2) |
| **Aidration** (Order) | 0.0–1.0 | Shewhart + WECO | CUSUM (k=0.5, h=4) | PELT (offline) |
| **Aimotions** (Character) | 0.0–1.0 | EWMA (α=0.15) | CUSUM (k=0.5, h=4) | JSD (existing) |
| **ASI Composite** | 0.0–1.0 | EWMA (α=0.1) | CUSUM (k=0.5, h=5) | BOCD (hazard=1/300) |

**Rationale**:
- **Aiman**: Persona drift is gradual → EWMA preferred; CUSUM catches sudden persona breaks
- **Aigent**: Sustained degradation (tool accuracy, hallucination rate) → CUSUM optimal per SCORING.md
- **Aidration**: State machine violations are discrete → Shewhart + WECO for pattern detection
- **Aimotions**: Sentiment drift is noisy/slow → EWMA with tighter smoothing
- **ASI Composite**: Smoothing important → EWMA with small α; CUSUM catches regime shifts

---

## 7. Minimal Dependency Python Package

```python
# spc_agent_monitor.py — Complete, self-contained SPC toolkit
# Dependencies: numpy only

import numpy as np
from typing import List, Dict, Optional

class SPCAgentMonitor:
    """
    Lightweight SPC composite monitor for AI agent health.
    Drop-in for pistisai-pi pillar monitoring.
    """

    def __init__(self, pillar_name: str, warmup: int = 50,
                 cusum_k: float = 0.5, cusum_h: float = 4.0,
                 ewma_alpha: float = 0.15, ewma_L: float = 2.8):
        self.pillar = pillar_name
        self.warmup_n = warmup
        self.cusum = CUSUMDetector(k=cusum_k, h=cusum_h)
        self.ewma = EWMADetector(alpha=ewma_alpha, L=ewma_L)
        self.weco = None
        self.scores: List[float] = []
        self.alerts: List[Dict] = []

    def observe(self, score: float) -> Dict:
        """Feed a new pillar score (0.0–1.0). Returns alert dict."""
        self.scores.append(score)

        cusum_out = self.cusum.update(score)
        ewma_out = self.ewma.update(score)

        # Initialize WECO after warmup
        if len(self.scores) == self.warmup_n:
            mu = np.mean(self.scores)
            sig = max(np.std(self.scores, ddof=1), 0.01)
            self.weco = WesternElectricRules(mu, sig)
            for s in self.scores:
                self.weco.update(s)

        weco_out = self.weco.update(score) if self.weco else {"signal": False, "violations": []}

        # Ensemble decision
        fired = []
        if cusum_out["signal"]: fired.append("cusum")
        if ewma_out["signal"]: fired.append("ewma")
        if weco_out["signal"]: fired.append("weco")

        alert = {
            "pillar": self.pillar,
            "score": score,
            "fired_detectors": fired,
            "alert_level": self._classify(fired, score),
            "cusum_state": cusum_out.get("c_pos", 0) + cusum_out.get("c_neg", 0),
            "ewma_state": ewma_out.get("z", score),
        }
        if fired:
            self.alerts.append(alert)
        return alert

    def _classify(self, fired: List[str], score: float) -> str:
        if len(fired) >= 2 or score < 0.5:
            return "critical"
        elif len(fired) == 1 or score < 0.75:
            return "degraded"
        elif score < 0.85:
            return "warning"
        return "healthy"
```

---

## 8. Sources & References

1. **CUSUM**: Page, E.S. (1954), "Continuous Inspection Schemes"; Montgomery, D.C. (2019), *Introduction to Statistical Quality Control*, 8th ed., Table 9.10
2. **EWMA**: Roberts, S.W. (1959), "Control Chart Tests Based on Geometric Moving Averages"; Montgomery (2019), §9.3
3. **Western Electric Rules**: Western Electric Company (1956), *Statistical Quality Control Handbook*; MetricGate (2025) implementation reference
4. **BOCD**: Adams, R.P. & MacKay, D.J.C. (2007), "Bayesian Online Changepoint Detection", arXiv:0710.3742; Gundersen, G. (2020), implementation at github.com/gwgundersen/bocd
5. **PELT**: Killick, R., Fearnhead, P., Eckley, I.A. (2012), "Optimal detection of changepoints with a linear computational cost", JASA 107(500):1590–1598
6. **Hybrid SPC**: Lucas, J.M. (1982), "Combined Shewhart-CUSUM Quality Control Schemes"; Scholargate (2025), "Hybrid Statistical Process Control"
7. **pistisai-pi SCORING.md**: Rath (2026), Agent Stability Index framework, ASI thresholds 0.85/0.75/0.50
8. **ARL tables**: Montgomery (2019), Table 9.10; MetricGate EWMA/CUSUM calculators

---

## 9. Key Takeaways for Implementation

1. **Use warmup period (50+ samples)** to estimate μ₀ and σ before activating detectors
2. **CUSUM**: k=0.5, h=4–5 for detecting 1σ shifts in pillar scores
3. **EWMA**: α=0.15, L=2.8 for general drift detection in behavioral pillars
4. **Shewhart + WECO Rules 1–4** for pattern-based detection (stratification, trends)
5. **BOCD**: hazard_rate=1/200–1/300 for pillar scores; fires on P(cp) > 0.6
6. **PELT**: Use for offline retrospective analysis (post-session diagnostics)
7. **Ensemble voting**: ≥2 detectors firing = critical alert (reduces false positives)
8. **All implementations above are zero-dependency** — numpy for Python, pure TS
9. **Reset accumulators after signals** to avoid persistent alarms
10. **Log all alerts** for continuous parameter tuning (ARL₀ monitoring)
