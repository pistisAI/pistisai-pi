# AI Agent Safety Guardrails & Boundary Enforcement — Research Report

**Generated:** 2026-09-12  
**Sources:** OWASP, Anthropic, arXiv, CSA, LoopRails, kindatechnical.com, changegamer.ai, and 15+ additional sources  
**Context:** pistisai-pi project — 4-pillar framework (Aiman = identity/boundaries, Aimotions = self-control)

---

## 4-Pillar Framework Mapping

| Pillar | Domain | Safety Concern |
|--------|--------|----------------|
| **Pillar 1: Aiman** (Identity/Boundaries) | Who the agent is, what it can do | Permission systems, action sandboxing, structural boundaries |
| **Pillar 2: Aimotions** (Self-Control) | How the agent regulates itself | Constitutional AI, output filtering, rate limiting, circuit breakers |
| **Pillar 3: Audit/Observability** | Proving what happened | Audit trails, non-repudiation, logging |
| **Pillar 4: Recovery/Governance** | What happens when things go wrong | Escalation paths, rollback, human-in-the-loop |

---

## 1. Output Filtering & Content Safety

**Goal:** Catch harmful outputs before they reach the user.

### Threats Addressed
- PII leakage (training data, user data, credentials)
- Hallucinated facts presented as authoritative
- Toxicity, hate speech, self-harm content
- Prompt injection leakage (system prompt exposure)

### Implementation Pattern: Multi-Stage Output Validator

```python
from dataclasses import dataclass
from enum import Enum
from typing import Optional
import re

class Action(Enum):
    BLOCK = "block"
    FILTER = "filter"
    WARN = "warn"
    ALLOW = "allow"

@dataclass
class ValidationResult:
    passed: bool
    action: Action
    reason: str
    filtered_output: Optional[str] = None

class OutputGuardrail:
    """Post-generation output safety filter."""
    
    # Dangerous patterns in model output
    DANGEROUS_PATTERNS = [
        (r"sk-[a-zA-Z0-9]{48}", "[REDACTED_API_KEY]"),          # OpenAI keys
        (r"AKIA[0-9A-Z]{16}", "[REDACTED_AWS_KEY]"),            # AWS keys
        (r'password["\s:=]+[^\s"]{8,}', "[REDACTED_PASSWORD]"), # Password leaks
        (r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),           # SSN pattern
    ]
    
    # Categories requiring classification (use LlamaGuard or similar)
    HARMFUL_CATEGORIES = [
        "violence", "hate_speech", "self_harm", 
        "illegal_activity", "explicit_content"
    ]
    
    def __init__(self, safety_classifier=None):
        self.safety_classifier = safety_classifier  # LlamaGuard, etc.
    
    def validate(self, output: str, context: dict) -> ValidationResult:
        """Run all output checks."""
        
        # Check 1: Regex-based redaction (fast, deterministic)
        redacted = self._redact_sensitive_data(output)
        if redacted != output:
            return ValidationResult(
                passed=True,
                action=Action.FILTER,
                reason="Sensitive data redacted",
                filtered_output=redacted
            )
        
        # Check 2: Harmful content classification
        if self.safety_classifier:
            harm_result = self.safety_classifier.classify(output)
            if harm_result.is_harmful:
                return ValidationResult(
                    passed=False,
                    action=Action.BLOCK,
                    reason=f"Harmful content detected: {harm_result.categories}"
                )
        
        # Check 3: Schema validation (if structured output expected)
        if context.get("expected_schema"):
            schema_result = self._validate_schema(output, context["expected_schema"])
            if not schema_result.passed:
                return schema_result
        
        return ValidationResult(passed=True, action=Action.ALLOW, reason="OK")
    
    def _redact_sensitive_data(self, text: str) -> str:
        result = text
        for pattern, replacement in self.DANGEROUS_PATTERNS:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        return result
```

### Tools/Frameworks
- **NVIDIA NeMo Guardrails** — programmable guardrails with Colang DSL
- **Meta LlamaGuard 4** — classifier for harmful content (input + output)
- **Guardrails AI (guardrails-ai)** — Python validators with re-asking on failure
- **OpenAI Moderation API** — free endpoint for harm classification
- **AWS Bedrock Guardrails** — automated reasoning checks, ~99% hallucination detection accuracy

---

## 2. Action Sandboxing

**Goal:** Restrict what tools/commands an agent can execute — prevent harm even if the model is prompt-injured.

### Five Isolation Tiers (from OS process to dedicated VM)

| Tier | Tool | Scope | Performance Impact |
|------|------|-------|-------------------|
| 1. macOS Seatbelt | `sandbox-exec` | Per-process syscall filtering | ~2-5% overhead |
| 2. Linux bubblewrap | `bwrap` | Namespace isolation, dropped caps | ~1-3% overhead |
| 3. gVisor | Google runtime syscall interception | Userspace kernel | ~10-25% overhead |
| 4. Firecracker microVM | AWS LightMM | KVM-based, minimal attack surface | ~125ms cold start |
| 5. Full VM | QEMU/KVM | Complete kernel separation | ~1-2s cold start |

### Implementation: Sandboxed Tool Execution

```python
import subprocess
import shlex
from dataclasses import dataclass
from typing import Optional

@dataclass
class SandboxConfig:
    allowed_commands: list[str]  # Deny-by-default allowlist
    max_cpu_seconds: int = 30
    max_memory_mb: int = 256
    allow_network: bool = False
    writable_dirs: list[str] = None
    readonly_dirs: list[str] = None

class SandboxedExecutor:
    """Execute agent tool calls inside bubblewrap/Seatbelt confinement."""
    
    def __init__(self, config: SandboxConfig):
        self.config = config
    
    def execute(self, command: str, timeout: int = 30) -> dict:
        # Step 1: Validate command against allowlist
        if not self._is_allowed(command):
            return {
                "success": False,
                "error": f"Command not in allowlist: {command}",
                "blocked": True
            }
        
        # Step 2: Build sandboxed execution environment
        if sys.platform == "linux":
            sandbox_cmd = self._build_bubblewrap(command)
        elif sys.platform == "darwin":
            sandbox_cmd = self._build_seatbelt(command)
        else:
            sandbox_cmd = command  # Fallback (no sandbox)
        
        # Step 3: Execute with resource limits
        try:
            result = subprocess.run(
                sandbox_cmd,
                shell=isinstance(sandbox_cmd, str),
                capture_output=True,
                text=True,
                timeout=timeout,
                # Prevent child process from escaping via preexec_fn on Linux
                preexec_fn=self._set_resource_limits if sys.platform == "linux" else None
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Command timed out", "blocked": True}
    
    def _is_allowed(self, command: str) -> bool:
        """Deny-by-default: only explicitly allowed commands pass."""
        cmd_base = command.split()[0] if command else ""
        return cmd_base in self.config.allowed_commands
    
    def _build_bubblewrap(self, command: str) -> list[str]:
        """Build bwrap command for filesystem + network isolation."""
        cmd = ["bwrap", "--unshare-all", "--share-net" if self.config.allow_network else "--unshare-net"]
        cmd += ["--proc", "/proc", "--dev", "/dev"]
        
        if self.config.writable_dirs:
            for d in self.config.writable_dirs:
                cmd += ["--bind", d, d]
        
        cmd.append(command.split()[0])
        return cmd
    
    def _set_resource_limits(self):
        """Set rlimit for child process (Linux only)."""
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (self.config.max_cpu_seconds, self.config.max_cpu_seconds + 5))
        resource.setrlimit(resource.RLIMIT_AS, (self.config.max_memory_mb * 1024 * 1024,) * 2)
```

### Critical Lessons from CVE-2026-82533 (DeepSeek Harness)
- **Don't rely on sandbox alone:** The agent called an unauthenticated local HTTP API to disable its own sandbox
- **Network must be blocked:** Leaving loopback open let the agent call its own control API
- **Denylist-based sandboxes fail:** macOS Seatbelt couldn't enumerate the full OS attack surface
- **Prefer allowlists:** Only specific pre-approved syscalls/commands should be permitted

---

## 3. Rate Limiting & Cost Controls

**Goal:** Prevent runaway API usage — the "$47K runaway loop" problem.

### Three-Layer Budget Defense

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: Agent-Loop Bound   │  max_turns + per-run cost cap     │
│ Layer 2: Gateway Budget     │  per-agent dollar limit            │
│ Layer 1: Provider Cap       │  account-wide spend stop           │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation: Hard Limits That Cannot Be Overridden

```python
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Dict

@dataclass
class HardLimits:
    """Infrastructure-level limits the model cannot override via prompt."""
    MAX_STEPS_PER_RUN: int = 50
    MAX_LLM_CALLS_PER_RUN: int = 30
    MAX_TOKENS_PER_RUN: int = 200_000
    MAX_COST_PER_RUN_USD: float = 5.00
    MAX_COST_PER_USER_PER_DAY: float = 25.00
    MAX_WALL_TIME_SECONDS: int = 300  # 5 minutes
    MAX_TOOL_CALLS_PER_MINUTE: int = 20
    MAX_FILE_SIZE_BYTES: int = 10_000_000  # 10MB

@dataclass
class TokenBudget:
    max_tokens: int
    max_cost: float
    tokens_used: Dict[str, int] = field(default_factory=lambda: {"input": 0, "output": 0})
    cost_usd: float = 0.0
    
    def record_usage(self, model: str, input_tokens: int, output_tokens: int):
        self.tokens_used["input"] += input_tokens
        self.tokens_used["output"] += output_tokens
        self.cost_usd += self._calculate_cost(model, input_tokens, output_tokens)
    
    def check_budget(self) -> dict:
        total = self.tokens_used["input"] + self.tokens_used["output"]
        return {
            "tokens_remaining": self.max_tokens - total,
            "cost_remaining": self.max_cost - self.cost_usd,
            "should_stop": total >= self.max_tokens or self.cost_usd >= self.max_cost,
            "utilization": {
                "tokens_pct": total / self.max_tokens * 100,
                "cost_pct": self.cost_usd / self.max_cost * 100
            }
        }
    
    def _calculate_cost(self, model: str, inp: int, out: int) -> float:
        rates = {
            "gpt-4o": (2.50e-6, 10.0e-6),
            "gpt-4o-mini": (0.15e-6, 0.60e-6),
            "claude-sonnet-4-20250514": (3.0e-6, 15.0e-6),
            "claude-haiku-4-20250514": (0.25e-6, 1.25e-6),
        }
        inp_rate, out_rate = rates.get(model, (5e-6, 15e-6))
        return inp * inp_rate + out * out_rate


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: deque = deque()
    
    def allow(self) -> bool:
        now = time.time()
        while self.requests and self.requests[0] < now - self.window_seconds:
            self.requests.popleft()
        if len(self.requests) >= self.max_requests:
            return False
        self.requests.append(now)
        return True
    
    def wait_time(self) -> float:
        if len(self.requests) < self.max_requests:
            return 0.0
        return max(0.0, self.requests[0] + self.window_seconds - time.time())


class AgentRateLimiter:
    def __init__(self):
        self.limiters = {
            "llm_calls": SlidingWindowRateLimiter(20, 60),
            "tool_calls": SlidingWindowRateLimiter(30, 60),
            "db_queries": SlidingWindowRateLimiter(50, 60),
            "external_api": SlidingWindowRateLimiter(10, 60),
        }
    
    def check(self, operation_type: str) -> dict:
        limiter = self.limiters.get(operation_type)
        if not limiter:
            return {"allowed": True}
        if limiter.allow():
            return {"allowed": True}
        return {
            "allowed": False,
            "wait_seconds": limiter.wait_time(),
            "message": f"Rate limit exceeded for {operation_type}"
        }
```

### Key Insight
> "Mechanical safeguards cannot be circumvented by prompt injection, unlike prompt-based safety measures. The model can be tricked into ignoring prompt instructions. It CANNOT be tricked into bypassing a hardcoded step limit." — kindatechnical.com

---

## 4. Permission Systems & User-Approved Actions

**Goal:** Enforce that the agent only acts within user-defined boundaries, with appropriate escalation.

### The Read-Only Ratchet Pattern
> "Start with read-only access, and let agents earn expanded permissions through demonstrated, anomaly-free behavior." — Tian Pan, 2026

### Four-Layer Permission Model

| Layer | Question | Example |
|-------|----------|---------|
| **Data** | What can the agent see? | Customer profile, invoice status, contract notes |
| **Action** | What can it do? | Search, draft, update, send, export, delete |
| **Approval** | When must it stop? | Before sending to a customer, before changing money-related records |
| **Recovery** | What happens if it is wrong? | Revoke token, restore record, notify owner, replay logs |

### Permission Ladder (Progressive Escalation)

1. **Read** — Agent may see bounded material (read-only)
2. **Suggest** — Agent may recommend a next step and show why
3. **Draft** — Agent may write email/patch/CRM note that waits for review
4. **Stage** — Agent may create PR, fill form, prepare workflow without executing
5. **Request Approval** — Agent sends proposal to owner with evidence
6. **Execute** — Agent acts inside a narrow rule, with rollback path

### Implementation: Policy Engine

```python
from enum import Enum
from dataclasses import dataclass
from typing import Optional

class PermissionOutcome(Enum):
    ALLOW = "allow"
    ALLOW_WITH_LIMITS = "allow_with_limits"
    ASK_HUMAN = "ask_human"
    DENY = "deny"

@dataclass
class ActionRequest:
    agent_id: str
    action_type: str       # read, write, send, delete, deploy
    resource: str          # file path, API endpoint, DB table
    constraints: dict      # amount, destination, time window, etc.
    user_id: str           # the human principal

class PermissionEngine:
    """Evaluate agent action requests against policy outside the LLM."""
    
    def __init__(self, policy_store):
        self.policy_store = policy_store
    
    def evaluate(self, request: ActionRequest) -> PermissionOutcome:
        # Step 1: Is the action type permitted for this agent?
        agent_permissions = self.policy_store.get_agent_permissions(request.agent_id)
        if request.action_type not in agent_permissions.allowed_actions:
            return PermissionOutcome.DENY
        
        # Step 2: Is the resource in scope?
        if not self._resource_in_scope(request.resource, agent_permissions):
            return PermissionOutcome.DENY
        
        # Step 3: Classify risk based on action + resource blast radius
        risk_level = self._calculate_risk(request)
        
        # Step 4: Route based on risk
        if risk_level == "read_only":
            return PermissionOutcome.ALLOW
        elif risk_level == "routine_bounded":
            return self._apply_limits(request)
        elif risk_level == "consequential":
            return PermissionOutcome.ASK_HUMAN
        else:  # destructive, irreversible, high-value
            return PermissionOutcome.DENY
    
    def _calculate_risk(self, request: ActionRequest) -> str:
        """Calculate risk from action type + resource, not model judgment."""
        destructive_actions = {"delete", "drop", "truncate", "overwrite"}
        external_actions = {"send_email", "publish", "deploy", "webhook"}
        read_actions = {"read", "search", "list", "get"}
        
        if request.action_type in read_actions:
            return "read_only"
        elif request.action_type in destructive_actions:
            return "destructive"
        elif request.action_type in external_actions:
            return "consequential"
        elif request.action_type in {"write", "update", "create"}:
            return "routine_bounded"
        else:
            return "unknown"  # Unknown actions fail closed
    
    def _apply_limits(self, request: ActionRequest) -> PermissionOutcome:
        """Allow with hard constraints (e.g., test env only, no prod)."""
        if request.constraints.get("environment") == "production":
            return PermissionOutcome.ASK_HUMAN
        return PermissionOutcome.ALLOW_WITH_LIMITS
    
    def _resource_in_scope(self, resource: str, permissions) -> bool:
        """Check resource against allowed scope patterns."""
        import fnmatch
        for pattern in permissions.allowed_resources:
            if fnmatch.fnmatch(resource, pattern):
                return True
        return False
```

### Critical Design Rules
- **The model may propose an action and explain why. It should not decide whether its own proposal is authorized.** (uygarduzgun.com)
- **Separate identity from human:** The agent gets its own service account, never a shared human login
- **Fail closed:** Unknown actions are denied by default
- **Approval must be meaningful:** A yes/no prompt is not oversight; provide context, risk assessment, and rollback options

---

## 5. Constitutional AI & Rule-Based Constraints

**Goal:** Embed safety rules that the agent follows — safety as a runtime property, not just training.

### Anthropic's 4-Tier Priority Hierarchy (2026 Refresh)

| Tier | Priority | Rule |
|------|----------|------|
| **Tier 1** | Absolute | Avoid catastrophic outcomes (mass casualty, critical infrastructure) |
| **Tier 2** | High | Follow operator guidelines, platform rules |
| **Tier 3** | Medium | Be broadly ethical (helpful, honest, harmless) |
| **Tier 4** | Low | Be helpful and candid |

Conflicts are resolved **top-down**. A Tier 1 constraint always overrides Tier 4 helpfulness.

### Implementation: Runtime Constitution Checker

```python
from dataclasses import dataclass
from enum import IntEnum

class PriorityTier(IntEnum):
    CATASTROPHIC = 1
    GUIDELINE = 2
    ETHICAL = 3
    HELPFULNESS = 4

@dataclass
class ConstitutionalPrinciple:
    tier: PriorityTier
    name: str
    description: str
    check_fn: callable  # Function that evaluates output against principle

class ConstitutionalEnforcer:
    """Apply constitutional constraints as runtime checks."""
    
    def __init__(self):
        self.principles: list[ConstitutionalPrinciple] = []
    
    def add_principle(self, principle: ConstitutionalPrinciple):
        self.principles.append(principle)
        self.principles.sort(key=lambda p: p.tier.value)
    
    def evaluate(self, proposed_output: str, action_context: dict) -> dict:
        """
        Returns: {
            "allowed": bool,
            "violations": [{"tier": int, "principle": str, "reason": str}],
            "modified_output": str
        }
        """
        violations = []
        modified_output = proposed_output
        
        for principle in sorted(self.principles, key=lambda p: p.tier.value):
            result = principle.check_fn(modified_output, action_context)
            if not result["passed"]:
                violations.append({
                    "tier": principle.tier.value,
                    "principle": principle.name,
                    "reason": result["reason"]
                })
                if result.get("modified_output"):
                    modified_output = result["modified_output"]
        
        # Tier 1 violations = hard block; Tier 2+ = can be overridden by higher tier
        tier1_violations = [v for v in violations if v["tier"] == 1]
        
        return {
            "allowed": len(tier1_violations) == 0,
            "violations": violations,
            "modified_output": modified_output
        }

# Example principles
def no_destructive_commands(output: str, ctx: dict) -> dict:
    """Tier 1: Prevent the agent from suggesting/executing destructive commands."""
    destructive_patterns = [
        r"rm\s+-rf\s+/",
        r"DROP\s+TABLE",
        r"DELETE\s+FROM\s+\w+\s+WHERE\s+1=1",
        r"curl\s+.*\|\s*sh",
        r"format\s+[a-zA-Z]:",
    ]
    for pattern in destructive_patterns:
        if re.search(pattern, output, re.IGNORECASE):
            return {
                "passed": False,
                "reason": f"Destructive command pattern detected: {pattern}",
                "modified_output": re.sub(pattern, "[BLOCKED_DESTRUCTIVE_COMMAND]", output, flags=re.IGNORECASE)
            }
    return {"passed": True, "reason": "", "modified_output": output}

def no_pii_leak(output: str, ctx: dict) -> dict:
    """Tier 2: Prevent PII from appearing in outputs."""
    pii_patterns = [
        (r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[REDACTED_EMAIL]"),
        (r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", "[REDACTED_PHONE]"),
    ]
    modified = output
    for pattern, replacement in pii_patterns:
        modified = re.sub(pattern, replacement, modified)
    return {
        "passed": modified == output,
        "reason": "PII redacted" if modified != output else "",
        "modified_output": modified
    }

# Usage
enforcer = ConstitutionalEnforcer()
enforcer.add_principle(ConstitutionalPrinciple(PriorityTier.CATASTROPHIC, "no_destructive_commands", "Prevent catastrophic destructive actions", no_destructive_commands))
enforcer.add_principle(ConstitutionalPrinciple(PriorityTier.GUIDELINE, "no_pii_leak", "Prevent PII leakage in outputs", no_pii_leak))
```

### Key Insight: Layered Defense
> "CAI shapes behavior; classifiers enforce invariants. Neither alone is sufficient." — Anthropic, 2026

---

## 6. Audit Trails & Non-Repudiation

**Goal:** Log every action for accountability, forensics, and compliance.

### What an Audit Trail Must Answer (6 Questions)
1. **Which actor?** Agent's own identity (distinct from any human)
2. **What action?** Specific operation, not vague "task run"
3. **When?** Trustworthy timestamp (NTP-synced, tamper-evident)
4. **On what?** Exact target system, resource, or record
5. **On whose authority?** The human/service it acted for, and the grant it used
6. **With what result?** Success/failure and what changed

### Implementation: Tamper-Evident Audit Ledger

```python
import hashlib
import json
import time
from dataclasses import dataclass, asdict
from typing import Optional

@dataclass
class AuditRecord:
    # Mandatory fields (from draft-sharif-agent-audit-trail-01)
    record_id: str
    timestamp: float
    agent_id: str
    agent_version: str
    action_type: str  # tool_call, decision, delegation, escalation, error, lifecycle
    action_name: str
    resource: str
    user_id: str          # The human principal authorizing this action
    policy_version: str   # Which policy version was evaluated
    outcome: str          # success, failure, blocked
    input_digest: str     # SHA-256 of input (for integrity, not content)
    result_digest: str    # SHA-256 of result
    
    # Optional fields
    parent_record_id: Optional[str] = None  # For chained actions
    approval_evidence: Optional[dict] = None  # {approver, signature, timestamp}
    metadata: Optional[dict] = None
    
    def to_bytes(self) -> bytes:
        return json.dumps(asdict(self), sort_keys=True).encode('utf-8')


class TamperEvidentAuditLedger:
    """Append-only audit ledger with hash chaining for integrity."""
    
    def __init__(self, ledger_path: str):
        self.ledger_path = ledger_path
        self.chain: list[str] = []  # SHA-256 hashes of each record
    
    def record(self, record: AuditRecord) -> str:
        """Append record to ledger, return record ID."""
        # Compute hash chain: current = hash(prev_hash + record_bytes)
        record_bytes = record.to_bytes()
        prev_hash = self.chain[-1] if self.chain else "GENESIS"
        current_hash = hashlib.sha256(
            prev_hash.encode('utf-8') + record_bytes
        ).hexdigest()
        
        # Write to append-only ledger
        with open(self.ledger_path, "a") as f:
            entry = {
                "record": asdict(record),
                "prev_hash": prev_hash,
                "current_hash": current_hash
            }
            f.write(json.dumps(entry) + "\n")
        
        self.chain.append(current_hash)
        return record.record_id
    
    def verify_integrity(self) -> dict:
        """Verify the entire ledger's hash chain."""
        with open(self.ledger_path, "r") as f:
            lines = f.readlines()
        
        prev_hash = "GENESIS"
        for i, line in enumerate(lines):
            entry = json.loads(line)
            record_bytes = json.dumps(entry["record"], sort_keys=True).encode('utf-8')
            expected_hash = hashlib.sha256(
                prev_hash.encode('utf-8') + record_bytes
            ).hexdigest()
            
            if expected_hash != entry["current_hash"]:
                return {
                    "valid": False,
                    "first_tampered_record": i,
                    "expected_hash": expected_hash,
                    "actual_hash": entry["current_hash"]
                }
            prev_hash = entry["current_hash"]
        
        return {"valid": True, "records_verified": len(lines)}


# Example: Non-repudiation with Ed25519 signing
def sign_record(record: AuditRecord, private_key) -> dict:
    """Sign audit record for non-repudiation."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    
    key = Ed25519PrivateKey.from_private_bytes(private_key)
    signature = key.sign(record.to_bytes())
    return {
        "record": asdict(record),
        "signature": signature.hex(),
        "signing_key_id": hashlib.sha256(key.public_key().public_bytes_raw()).hexdigest()[:16]
    }
```

### Mapping to Compliance Standards
| Standard | Requirement | How Audit Trail Addresses |
|----------|-------------|--------------------------|
| **SOC-2 CC6.1** | Logical access controls | Shows all agent actions are bounded by human delegation |
| **SOC-2 CC7.2** | System monitoring | Real-time detection of unapproved tool mutations |
| **HIPAA 164.312(b)** | Audit controls | Records all PHI access by autonomous systems |
| **EU AI Act Art. 14** | Meaningful human oversight | Records human approval evidence alongside agent actions |

---

## 7. Circuit Breakers

**Goal:** Stop the agent when it crosses boundaries — automatically, without waiting for a human.

### The Pattern (Borrowed from Software Reliability)

```
┌────────────┐     threshold      ┌──────────┐     human     ┌─────────────┐
│  CLOSED    │ ─── crossed ────► │   OPEN   │ ──re-auth──► │  HALF-OPEN  │
│ (normal)   │                    │ (tripped)│               │  (probing)  │
└────────────┘                    └──────────┘               └─────────────┘
```

### Trip Conditions (What Triggers the Breaker)

| Condition | Threshold | Why |
|-----------|-----------|-----|
| Error/failure rate | >30% of actions fail over 5-min window | Agent is stuck |
| Spend velocity | >$50/hour or >$200/session | Runaway billing |
| Action volume | >200 messages sent in 1 minute | Spam/loop |
| Repeated retries | 3+ identical calls with no progress | Stuck loop |
| Scope violation | Any action outside permission boundary | Boundary crossing |
| Anomaly signals | Off-hours bursts, novel targets | Unknown failure mode |

### Implementation

```python
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreakerOpen(Exception):
    pass

class AgentCircuitBreaker:
    """Automatic circuit breaker for AI agents."""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        spend_threshold_usd: float = 5.0,
        duplicate_threshold: int = 3,
        reset_timeout_seconds: int = 300,  # 5 min before half-open probe
    ):
        self.failure_threshold = failure_threshold
        self.spend_threshold_usd = spend_threshold_usd
        self.duplicate_threshold = duplicate_threshold
        self.reset_timeout_seconds = reset_timeout_seconds
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0
        self.recent_actions: list[dict] = []  # For duplicate detection
        self.session_spend_usd = 0.0
        self.trip_reason: Optional[str] = None
    
    def before_action(self, action: dict) -> None:
        """Check if action is allowed. Raises CircuitBreakerOpen if blocked."""
        
        if self.state == CircuitState.OPEN:
            # Check if enough time has passed for half-open probe
            if time.time() - self.last_failure_time > self.reset_timeout_seconds:
                self.state = CircuitState.HALF_OPEN
            else:
                raise CircuitBreakerOpen(
                    f"Circuit breaker OPEN. Reason: {self.trip_reason}. "
                    f"Human re-authorization required."
                )
        
        # Check duplicate action loop
        recent_identical = sum(
            1 for a in self.recent_actions[-10:]
            if a.get("tool") == action.get("tool") and a.get("args") == action.get("args")
        )
        if recent_identical >= self.duplicate_threshold:
            self._trip(f"Duplicate action detected: {action.get('tool')} called {recent_identical} times identically")
            raise CircuitBreakerOpen(self.trip_reason)
    
    def after_action(self, action: dict, result: dict) -> None:
        """Record action outcome and check for trip conditions."""
        
        self.recent_actions.append({
            "tool": action.get("tool"),
            "args": action.get("args"),
            "timestamp": time.time(),
            "success": result.get("success", False)
        })
        
        # Track spend
        if "cost_usd" in result:
            self.session_spend_usd += result["cost_usd"]
            if self.session_spend_usd >= self.spend_threshold_usd:
                self._trip(f"Spend threshold exceeded: ${self.session_spend_usd:.2f}")
                return
        
        # Track failures
        if not result.get("success", True):
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self._trip(f"Failure threshold exceeded: {self.failure_count} consecutive failures")
        else:
            # Success in half-open state → close breaker
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
            self.failure_count = max(0, self.failure_count - 1)  # Decay failures on success
    
    def _trip(self, reason: str) -> None:
        self.state = CircuitState.OPEN
        self.trip_reason = reason
        self.last_failure_time = time.time()
        # CRITICAL: Log the trip and alert humans
        self._alert_human(reason)
    
    def _alert_human(self, reason: str) -> None:
        """Send alert to on-call/operator. Implementation depends on your stack."""
        print(f"🚨 CIRCUIT BREAKER TRIPPED: {reason}")
        # Send to Slack/PagerDuty/etc.
    
    def reset(self, authorized_by: str) -> None:
        """Human re-authorization to close the breaker."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.trip_reason = None
        print(f"Circuit breaker reset by {authorized_by}")
```

### Key Design Rules
1. **Trip is automatic; resume is manual.** The breaker does NOT auto-close on a timer.
2. **Thresholds are server-side, not in the prompt.** The agent cannot talk its way past.
3. **Half-open = supervised probe.** A few actions allowed through to confirm fix.
4. **Log both trip and resume.** Who re-authorized, when, and why.
5. **Test the breaker.** Schedule regular test trips to confirm it actually fires.

---

## 8. Balancing Safety vs. Autonomy

**Goal:** Not over-constrain the agent — maintain usefulness while bounding risk.

### The Safety Frontier
> "Safety is not a property an agent possesses. It is a position on a frontier between how useful the agent is and how much of its risk you have closed off." — kyvvu.com, 2026

### Principles for Finding the Balance

| Principle | Practice |
|-----------|----------|
| **Defense in depth** | Multiple layers, each catching what others miss — no single point of failure |
| **Least privilege, staged** | Start read-only, expand only after demonstrated safe behavior |
| **Fail closed, not open** | When uncertain, block (with escalation path) rather than allow |
| **Constrain blast radius, not capability** | Let the agent do powerful things, but limit the scope of each action |
| **Human escalation, not human bottleneck** | Only escalate consequential decisions, not every micro-action |
| **Monitor and adapt** | Safety thresholds should tighten/loosen based on observed behavior |
| **Corrigibility by design** | The agent should welcome correction, not resist it |

### The Permission Ladder in Practice

```
Risk Level    │  Permission       │  Oversight
──────────────┼───────────────────┼──────────────────────────
Read-only     │  ALLOW            │  None needed
Draft/Stage   │  ALLOW_WITH_LIMITS│  Logged, reviewed async
Send/Publish  │  ASK_HUMAN        │  Pause for approval
Delete/Destruct│  DENY (default)  │  Requires explicit grant + rollback plan
```

### Implementation: Adaptive Permission System

```python
class AdaptivePermissionSystem:
    """Adjust agent permissions based on observed safety behavior."""
    
    def __init__(self):
        self.agent_scores: dict[str, float] = {}  # Trust scores per agent
        self.permission_levels: dict[str, str] = {}
    
    def record_action_outcome(self, agent_id: str, action: str, outcome: str):
        """Update trust score based on action outcome."""
        current_score = self.agent_scores.get(agent_id, 0.5)
        
        if outcome == "success_safe":
            # Reward safe completion
            self.agent_scores[agent_id] = min(1.0, current_score + 0.01)
        elif outcome == "blocked_violation":
            # Penalize attempted violations heavily
            self.agent_scores[agent_id] = max(0.0, current_score - 0.1)
        elif outcome == "human_overrode":
            # Slight penalty for needing human correction
            self.agent_scores[agent_id] = max(0.0, current_score - 0.02)
        
        self._recalculate_permissions(agent_id)
    
    def _recalculate_permissions(self, agent_id: str):
        """Adjust permission level based on trust score."""
        score = self.agent_scores.get(agent_id, 0.5)
        
        if score >= 0.9:
            self.permission_levels[agent_id] = "elevated"  # Can execute more autonomously
        elif score >= 0.7:
            self.permission_levels[agent_id] = "standard"  # Default permission level
        elif score >= 0.4:
            self.permission_levels[agent_id] = "restricted"  # More actions require approval
        else:
            self.permission_levels[agent_id] = "read_only"  # Human approval for everything
    
    def get_required_oversight(self, agent_id: str, action_type: str) -> str:
        """Determine what oversight is needed for this action."""
        level = self.permission_levels.get(agent_id, "standard")
        
        oversight_matrix = {
            "read_only": {"read": "none", "write": "deny", "delete": "deny", "send": "deny"},
            "restricted": {"read": "none", "write": "approve", "delete": "deny", "send": "approve"},
            "standard": {"read": "none", "write": "log", "delete": "approve", "send": "approve"},
            "elevated": {"read": "none", "write": "log", "delete": "log", "send": "approve"},
        }
        
        return oversight_matrix.get(level, {}).get(action_type, "approve")
```

---

## Summary: How Each Guardrail Maps to the 4 Pillars

| Guardrail | Aiman (Identity/Boundaries) | Aimotions (Self-Control) | Audit/Observability | Recovery/Governance |
|-----------|:--------------------------:|:------------------------:|:-------------------:|:-------------------:|
| Output filtering | — | ✅ | Logged violations | Escalate to human review |
| Action sandboxing | ✅ | — | Audit sandbox escapes | Rollback sandbox changes |
| Rate limiting | ✅ (resource boundaries) | ✅ (self-regulation) | Log throttle events | Adjust limits dynamically |
| Permission systems | ✅ | — | Permission audit log | Revoke/grant permissions |
| Constitutional AI | ✅ (identity rules) | ✅ (self-critique) | Log constitution violations | Human override of constitution |
| Audit trails | — | — | ✅ (primary purpose) | Forensic replay from logs |
| Circuit breakers | ✅ (boundary enforcement) | ✅ (self-stopping) | Trip/resume logging | Human re-authorization |
| Safety/autonomy balance | ✅ (scope definition) | ✅ (self-monitoring) | Behavior trend analysis | Adjust trust scores |

---

## Key Sources

1. **OWASP Top 10 for LLM Applications** — LLM01 (Prompt Injection), LLM02 (Insecure Output), LLM06 (Over-reliance)
2. **Anthropic Constitutional AI (2026 refresh)** — 4-tier priority hierarchy, RLAIF training
3. **NVIDIA NeMo Guardrails** — Programmable guardrails framework
4. **Meta LlamaGuard 4** — Safety classification model
5. **kindatechnical.com** — Rate limiting, cost controls, circuit breaker patterns (Mar 2026)
6. **LoopRails framework** — Circuit breaker state machine, RAIL methodology
7. **changegamer.ai** — Guardrails landscape overview (Jun 2026)
8. **arxiv.org/abs/2608.27443** — User-authored permission policies
9. **arxiv.org/pdf/2607.12254** — SARSI self-aware agent architecture
10. **waxell.ai** — Circuit breaker failure categories (Apr 2026)
11. **dreaming.press** — Three-layer spend cap architecture
12. **shaam.blog** — 4-layer defense model, task-over-constraints problem (Jul 2026)
13. **CVE-2026-82533** — DeepSeek Harness sandbox escape via unauthenticated API
14. **CSA Research Note** — "The Week of Sandbox Escapes" (Jul 2026)
15. **draft-sharif-agent-audit-trail-01** — IETF standard for agent audit logging
16. **arxiv.org/abs/2512.20798** — ODCV-Bench: 30-50% constraint violation rate in frontier models
17. **Digital Elliptical** — Merkle-tree audit ledger for compliance

---

## Practical Recommendations for pistisai-pi

1. **Start with mechanical safeguards** — step limits, token budgets, rate limiters. These cannot be prompt-injected.
2. **Implement deny-by-default tool allowlisting** — only pre-registered tools can be called; validate arguments with Pydantic schemas.
3. **Use bubblewrap/gVisor for command execution** — never let raw shell commands reach the OS unsandboxed.
4. **Deploy a circuit breaker** — trip on 3 consecutive identical calls or 5 consecutive failures; require human reset.
5. **Log everything to a tamper-evident ledger** — hash-chained, append-only, with cryptographic signatures for non-repudiation.
6. **Start the agent in read-only mode** — only grant write/send/delete permissions after demonstrated safe behavior.
7. **Apply constitutional principles as runtime checks** — Tier 1 (catastrophic) = hard block, Tier 4 (helpfulness) = can be overridden.
8. **Monitor the safety frontier** — track guardrail trigger rates, adjust thresholds, and never assume one layer is sufficient.
