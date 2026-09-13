# Human-in-the-Loop (HITL) Patterns for AI Agent Monitoring & Oversight
## Research Summary for pistisai-pi Project

**Date:** September 13, 2026
**Scope:** 7 research domains for human oversight of autonomous AI agents

---

## 1. Dashboard Design for Agent Health

### Core Principles

**What to Show — The "Dirty Secret" of Agent Dashboards**
Most dashboards measure infrastructure health (uptime, latency) but miss the autonomy layer — whether the agent is *sane*. Effective dashboards must show both:

| Layer | What to Display | Why |
|-------|----------------|-----|
| **Infrastructure** | Latency, token usage, error rates, uptime | Is the service alive? |
| **Autonomy/Behavioral** | Goal drift, loop detection, token waste ratio, chain length, success rate | Is the agent doing the right thing? |
| **Outcome** | Task completion rate, error rate, customer complaints, downstream incidents | Is the work actually correct? |

**The Token Waste Ratio** (from sivaro.in): Total tokens consumed ÷ successful task completions. A high ratio means the agent is over-reasoning or stuck in retry loops. One team reduced cost/query from $0.12 to $0.03 by cutting this from 18,000 to 4,500.

### Visualizing 4-Pillar Scores Over Time

**Recommended Visualization Stack:**

1. **Big Number Header** — Overall composite health score (0-100), color-coded green→yellow→red, with "last assessed" timestamp. This is the single-glance answer to "Is my agent okay?"

2. **Sparkline Row** — Small inline time-series charts for each of the 4 pillars, showing 7/30/90-day trends. Oldest on left, newest on right. This reveals trajectory (improving, degrading, stable).

3. **Stacked Area Chart** — Contribution of each pillar to the overall score over time. Shows which pillar is dragging health down.

4. **Threshold Bands** — Background shading on time-series charts showing green/yellow/red zones. Makes threshold breaches immediately visible without reading numbers.

5. **Annotated Events** — Vertical markers on time-series showing deployments, config changes, incidents. Correlates score changes with causes.

**From the "Mission Control" WordPress agent pattern** (thebuzzbazaar.com):
- Health card: big color-coded score with bar + "last assessed" time
- Agent card: active/off, mode (advisor/autopilot), run frequency, next run, run button
- Recommended actions: prioritized plan from last cycle, tagged by area
- Recent cycles: small bar chart of past scores

**From HITL Kit** (hitlkit.dev) — React primitives:
- Subagent Status Card: single-row agent status with icon, label, detail, state badge
- MiniTrace: collapsible thought/action/result renderer
- AI Generation Scale: five-segment ordinal scale for AI vs. human contribution

### Key Metrics to Track

From the 9-axis HITL metrics framework (medium.com/@shibuiyusuke):
- **HITL Count** — raw volume of human interventions (daily/weekly/monthly, by task category)
- **HITL Wait Time** — idle time per request while waiting for human
- **HITL Graduation Rate** — how many checkpoint categories have been retired (autonomy earned)
- **HITL Efficiency Score** — ratio of HITL Value to HITL Cost
- **Override Rate** — how often humans reject agent proposals
- **Counterfactual Value** — estimated loss prevented by human oversight

---

## 2. Notification & Alerting UX

### The Alert Fatigue Problem

**The Numbers:**
- Average on-call engineer: ~50 alerts/week, only 2-5% require human intervention (Rootly 2025)
- Some teams: 2,000+ alerts/week, only 3% need immediate action (incident.io 2025)
- 62% of alerts are ignored by receiving teams
- Knowledge workers interrupted every 2-3 minutes; lose ~23 minutes of focus after each interruption

**The Brutal Asymmetry** (johal.in): Each low-quality page doesn't just waste its own minute — it taxes EVERY future page's credibility. A paging system is a trust system, and trust depletes faster than it refills.

### Signal Architecture: Three Operational Categories

Before any alert routing, classify every signal (tfsfventures.com):

1. **Expected Variance** — within documented performance envelopes, no human review needed
2. **Exception Candidates** — deviate from baseline, but automated triage can resolve without escalation
3. **Genuine Escalations** — require qualified human decision within defined time window

### The Four-Question Test (Every Alert Must Answer)

```
1. WHAT is broken?        ("checkout API p99 > 2s for 5m")
2. WHO acts?              (team: payments-oncall)
3. WHAT do they do first? (runbook link: rollbacks + pool check)
4. WHAT if ignored?       ("checkout unavailable; revenue impact")
```

Alerts failing any question are demoted:
- No owner → dashboard panel, not a page
- No runbook → ticket, not a page
- No impact → logged trend, not a page

### Tiered Notification Channels

| Tier | Email | Chat (Critical) | Chat (Info) | SMS/Page |
|------|-------|-----------------|-------------|----------|
| **P1** | ✓ | ✓ | | ✓ (severe only) |
| **P2** | ✓ | ✓ | | |
| **P3** | ✓ | | ✓ | |
| **P4** | optional | | ✓ | |

### Smart Alerting Patterns

**From Zylos Research — Agent Notification Intelligence:**
- Treat notifications as a **scarce resource** allocated through ML-driven priority scoring
- **Debounce** related events: 5 events in 30 seconds from same condition = 1 interruption
- **Dynamic thresholds** anchored to rolling baselines (alert on deviation from own history, not fixed values)
- **Flapping detection** with hysteresis: different trigger/clear conditions; third page of same flapping signal triggers muting
- **Multi-window burn rates**: fast burn for immediate paging, slow burn for next-day tickets
- **LLM-powered summarization** so every interruption carries genuine signal

**From OrthoLoop patient monitoring pattern** (edouard-kombo.medium.com):
- **Alarm Fatigue Index (AFI)** — composite of: burden (alarms/bed-hour), nuisance (nonactionable rate), response drag (p90 time-to-ack), suppression (mute/snooze without resolution), escalation misses, monitor blind time
- AFI high → fewer alerts, more probes, stricter thresholds
- AFI low → earlier warnings allowed
- **ProbeLoop**: when uncertain, ask reality a question ("Wave if OK") — response collapses risk, no response justifies escalation

**Delivery Channel Matching** (tianpan.co):
- IDE suggestion as ghost text = zero attention until user reaches for it
- Modal dialog = forces user to stop
- Match interrupt cost to actual urgency

---

## 3. Authority Delegation

### The Three-Pattern Spectrum (compelframework.org)

| Pattern | Definition | When to Use | Latency |
|---------|-----------|-------------|---------|
| **HITL** (Human-in-the-Loop) | Agent cannot complete flagged action until human approves. Human is part of runtime path. | High-stakes irreversible actions, regulated decisions, medical, first-time exposure | Seconds to hours |
| **HOTL** (Human-on-the-Loop) | Agent acts autonomously; human monitors dashboard and can intervene/rollback | High-volume, lower-stakes operations with alert thresholds | Near-zero |
| **HOOTL** (Human-out-of-the-Loop) | Full autonomy with after-the-fact auditing only | Low-stakes, reversible tasks | None (post-hoc) |

### The Data-Plane / Control-Plane Distinction (arxiv.org/html/2605.07062)

**Data-Plane Authority** — localized interventions within execution (patch generation, test reruns). Current AI agents operate here under "bounded autonomy."

**Control-Plane Authority** — modifications to configuration, deployment policies, approval gates. Alters organizational risk boundaries. Most organizations overwhelmingly confine agents to the data plane.

### The Digital Apprentice: Per-Skill Autonomy Tiers (arxiv.org/pdf/2606.04321v1)

| State | Agent May Do | Human Role | External Effects |
|-------|-------------|------------|------------------|
| **Pre-L0** | Observe-only: ingest data, form hypotheses, no outputs | Director validates inferences | None |
| **L0 Sandbox** | Generate isolated draft outputs for one authorized skill | Supervisor reviews 100% | Drafts only |
| **L1 Draft** | Produce candidate outputs routed toward execution | Endorses/rejects | Pending execution |
| **L2 Execute** | Execute low-risk actions within defined limits | Monitors, can override | Bounded effects |
| **L3 Autonomize** | Full execution within authorized scope | Periodic review | Full, logged |

### The Authority Stack (forbes.com)

Seven layers that must ALL be satisfied:
1. **Identity** — who/what is interacting
2. **Authentication** — credentials valid
3. **Authorization** — technical permissions sufficient
4. **Authority** — legitimate mandate to perform this action in context
5. **Envelope** — machine-enforceable boundaries (goals, tools, data, counterparties, transaction limits, revocation conditions)
6. **Contextual Authorization** — is the right to act still valid NOW (amount, destination, timing, changing risk)
7. **Evidence** — can the organization reconstruct the chain afterward

### Risk-Tier Mapping (spiderhunts.com)

| Risk Tier | Example Actions | Oversight Model | Latency Added |
|-----------|----------------|-----------------|---------------|
| **Low** | Summarizing, tagging, drafting internal notes, read-only lookups | HOOTL (audit log only) | None |
| **Medium** | Updating CRM, scheduling, internal Slack posts | HOTL (monitored, reversible) | Minimal |
| **High** | Customer emails, refunds, contract clauses, code merges to main | HITL (approval required) | Seconds to minutes |
| **Critical** | Financial transactions, production deployments, legal commitments | HITL + dual-authority | Minutes to hours |

### The Four-Level Autonomy UI Model (medium.com/@Nexumo_)

Instead of on/off, give users graded autonomy:
- **Off** — no actions, only suggestions
- **Ask** — always ask before acting (good for onboarding)
- **Guarded** — act automatically for low-risk; ask for risky
- **Auto** — act automatically with monitoring + undo

This maps to how real humans build trust: gradually.

---

## 4. Trust Calibration

### The Core Problem

Trust calibration = alignment between a user's willingness to rely on a system and the system's demonstrated capabilities and limitations (Hoff & Bashir, 2015).

**Two failure modes:**
- **Over-reliance**: User trusts agent blindly, stops verifying, misses errors
- **Under-reliance**: User distrusts agent, discards useful recommendations, micromanages

### Research Findings

**Non-linear trust relationship** (Springer 2026, rsisinternational.org):
- Trust peaks at *intermediate* autonomy levels, not maximal delegation
- Higher trust at moderate delegation than at full autonomy
- Turning regions vary by decision context — no universal autonomy thresholds

**The "Trust Frame" vs. "Surveillance Frame"** (hip1.github.io):
- Making reasoning visible creates a surveillance surface the model learns to manage
- Humans develop "emergent misalignment" — reasoning traces suppress epistemic vigilance
- Visible traces cause measurable deskilling that persists after AI removal
- The trust frame produces better outcomes than surveillance on capability, interpretability, AND welfare dimensions simultaneously

**Eye-tracking studies** (PMC11679395):
- Real-time trust calibration states can be detected via eye movements
- Calibrated trust = trust matches true automation capabilities
- Over-trust and under-trust require different interventions

### Building Calibrated Trust in Monitoring Systems

**From the Tiered Controllability Framework (TCF)** (gjeta.com):
- Maps oversight requirements to task risk, action reversibility, and agent autonomy scope
- Four tiers validated against enterprise deployments and EU AI Act / NIST AI RMF

**From Dynamic Trust Modulation** (thesai.org):
- Integrates trust calibration, decision fatigue, and explainability
- System-level confidence assessment + interpretability + feedback loops
- Trust evolves through accumulated evidence (Human-Centered System Reliability)

**Practical Design Patterns:**

1. **Show uncertainty honestly** — don't present every output with flat confidence
2. **Expose provenance** — where did this data come from? What model version? What prompt?
3. **Make the boundary legible** — at the moment it matters, in terms the user can act on
4. **Graduated autonomy** — let users expand agent authority as evidence accumulates
5. **Explanation-rich interfaces** — increase accuracy, efficiency, and calibration (Springer 2026)
6. **Accountability cues** — strengthen policy adherence and reduce reliance errors

**The PerceptiSync Framework** (xr4ce-chi26.tech):
- Dirichlet-Categorical trust modeling for distributed AI systems
- User-configurable features + real-time human feedback
- HITL + Crowd-in-the-Loop mechanisms improve trust assessment in dynamic environments

---

## 5. Intervention Interfaces

### The Seven Agent UX Patterns (blog.redlinesoft.net)

Every agent UI worth using has:
1. **Task framing** — how the user states the goal
2. **Autonomy controls** — how much rope the agent gets
3. **Plan surface** — agent commits to steps before acting
4. **Progress stream** — live feed of current activity
5. **Confirmation gates** — the slow moment before destructive action
6. **Error recovery** — path back from failed step
7. **Agent handoff** — state dump for agent→human or agent→agent transfer

### The Pre-Action / In-Action / Post-Action Lifecycle (agenticwire.news)

| Phase | Pattern | Purpose |
|-------|---------|---------|
| **Pre-action** | Intent Preview | Plan summary before execution |
| **Pre-action** | Autonomy Dial | Per-task permission level |
| **In-action** | Explainable Rationale | Why the agent chose this path |
| **In-action** | Confidence Signal | Certainty indicators |
| **Post-action** | Action Audit + Undo | Chronological log with rollback |
| **Post-action** | Escalation Pathway | Handoff to human when stuck |

### Override & Repair Patterns

**From Plover (Plan-Centric GUI Agent)** (arxiv.org/html/2607.15193):
- Externalizes task plans as persistent, inspectable, revisable artifacts
- **User-Driven Replanning** three methods:
  1. Plan Edits: reorder, delete, modify pending steps
  2. Natural Language Guidance: chat message to clarify intent
  3. Multimodal Annotation: draw directly on screenshot
- Preserves prior progress during repair (doesn't discard entire workflow)
- In benchmark failures: 23/26 tasks improved with collaboration, 17 became complete successes, avg 2.04 interventions/task

**The Human Override UI** (medium.com/@Nexumo_):
- Actions must be **pausable, reversible, and auditable**
- Approval is NOT a checkbox — it's a decision. The approval card must answer:
  - What will happen?
  - Why now?
  - What data was used?
  - What's the blast radius?
  - What happens if I'm wrong?
- **Diff view** pattern: Before → After, old value → new value, recipients/counts, external side effects

**The System Contract for Override:**
```
User UI → Agent Orchestrator → Tools
   ↑            |                  |
   |← Live plan ←|                  |
   |→ Action proposal →|            |
   |← Approve/Block ←|              |
   |→ Execute + log →|              |
   |← Timeline + undo tokens ←------|
```

### Threshold Adjustment Interface

- **Slider controls** for confidence thresholds per action category
- **Preview mode**: "If I set this threshold to X, here's how many actions would have been auto-approved vs. flagged in the last 30 days"
- **A/B simulation**: show projected alert volume before committing threshold changes
- **Per-pillar autonomy dials**: independent control over each of the 4 pillars

---

## 6. Incident Review Workflows

### Why Traditional Post-Mortems Fail for AI Agents

**The Problem** (apptad.com):
- Agents don't crash; they reason, and the reasoning is the problem
- No stack trace, no log line saying "error," no code change to roll back
- Traditional questions have no answers
- The agent did everything its instructions told it to do — and the instructions were wrong

### The Six Failure Classes

From production agentic system engagements:
1. **Data** — stale, incomplete, duplicated, or wrong data
2. **Instruction** — bad or ambiguous instructions
3. **Tool Selection** — wrong tool chosen
4. **Tool Argument** — right tool, bad arguments
5. **Retrieval** — irrelevant, stale, or incomplete sources
6. **Approval Boundary** — action executed that should have required approval

### The Agent Incident Postmortem Template

**Nine sections** (medium.com/@1nick1patel1):

1. **Incident Summary** — date/time, owner, severity (S1-S4), surface, one-line description
2. **Impact** — who was affected, what did they actually see, how did it affect them (lost money, confusion, trust hit)
3. **Timeline (Human + Agent)** — blended: user actions, agent messages, tool calls
4. **Agent Context Snapshot** — freeze configuration at failure time: model & version, system prompt, tools enabled + limits, temperature/top_p/max tokens, relevant flags
5. **Root Cause** — which control failed (retrieval, permissions, validation, logging, approval, escalation)
6. **Detection Gap** — why didn't we detect this sooner? (Median time-to-detect: 14 days, not 14 minutes)
7. **What Went Well**
8. **What Went Poorly**
9. **Action Items** — owner, due date, blast-radius lever (test, runbook, alert, code, prompt, eval)

### The Eight-Section Postmortem (callsphere.ai)

1. **Summary & Impact** — what happened, who affected, dollar/customer impact
2. **Timeline** — UTC timestamps from first symptom to resolution
3. **Detection Chain** — how did we find out; what would change next time to catch in 4 hours not 14 days
4. **Root Cause** — both code/config AND model behavior cause
5. **What Went Well**
6. **What Went Wrong**
7. **Action Items** — owner, due date, blast-radius lever
8. **Detection_Chain_Minutes** — published metric; track improvement over time

**Real-world result**: Median detection time went from 47 hours (first 5 incidents) to 38 minutes (last 6) once detection became a first-class outcome.

### The Five-Layer Failure Forensics Model (labarna.ai)

Investigation layers (each feeds into next):
1. **Data Layer** — was input data accurate, complete, representative?
2. **Model Layer** — was the model appropriate for task scope? Configuration correct?
3. **Integration Layer** — were tool connections, APIs, data flows correct?
4. **Governance Layer** — were policies, approval gates, oversight mechanisms adequate?
5. **Change Management Layer** — were changes tested, communicated, rolled out safely?

### The Three Views for Root Cause (mubibai.com)

| View | Question | Example |
|------|----------|---------|
| **Outcome** | Did the requested postcondition become true? | Agent said refund issued, but no refund exists |
| **Trajectory** | Did the run use an allowed path? | Correct refund followed unapproved export |
| **Effect** | What external state actually changed? | One request produced two transfers |

### Blameless Retrospective Principles (callsphere.ai)

- Focus on systems and processes, not individual mistakes
- Behavioral failures are often emergent — no single person made a wrong decision
- Identify the system control that failed, not the model's "bad choice"
- Every incident should produce a failure class, root cause, changed control, regression fixture, owner, and follow-up review date

### The Five-Category Failure Taxonomy (futureagi.com)

Five categories with subtypes — map incident to the row to fix the right surface:
1. **Input** — poisoned, ambiguous, or malformed input
2. **Planning** — wrong decomposition, goal drift, loop
3. **Tool** — wrong tool, wrong args, tool failure
4. **Output** — hallucination, format error, policy violation
5. **System** — infrastructure, timeout, cost overrun

Each incident maps to a category + subtype → becomes a regression test in CI → gives team shared vocabulary.

---

## 7. Accessibility for Non-Technical Users

### The Challenge

**From XAI research** (arxiv.org/html/2504.13897v1):
- Most XAI evaluations don't include disabled users
- 79-study literature review: explanations rely on inherently visual formats
- Only 2% of technical professionals created explanations accessible to non-technical users when asked
- 79% included Cohen's kappa, 59% confusion matrices, 98% SHAP/LIME heatmaps — without contextual interpretation

**Key finding**: Even technically proficient developers fail to create explanations tailored to end users. Only 3/124 solutions were judged accessible to lay audiences. The best used analogy: "a helpful friend who sorts out pictures."

### Design Patterns for Non-Technical Accessibility

**1. Layered Explanation Depth** (ubos.tech — MAP-X system):
- **Layer flag**: basic, intermediate, advanced
- Patient sees: short jargon-free summary + optional visual highlights
- Analyst sees: deeper breakdown with confidence intervals and bias-audit metrics
- User profile + expressed preference determines depth

**2. Conversational Explanation** (arxiv.org/html/2504.13897v1):
- Agent-augmented counterfactual explanations for non-expert users
- "Show me how" — conversational AI agents translate technical outputs into actionable recommendations
- Mixed-methods study (n=34): effective for users with varying AI proficiency

**3. Directive Data-Centric Explanations** (arxiv.org/html/2302.10671v1):
- Visually directive explanations preferred by healthcare experts over other methods
- Local explanations with global overview
- What-if explorations for actionable insights

**4. Plain-Language Principles**:
- Replace "confidence score: 0.87" with "The agent is fairly confident this is correct"
- Replace "token waste ratio: 15,000" with "This task used 3x more resources than usual — the agent may be stuck"
- Replace "SPC violation on pillar 3" with "The agent's memory quality has dropped below its normal range"

**5. Visual Accessibility**:
- Don't rely solely on color (red/green) — add icons, patterns, text labels
- Screen-reader-friendly: all charts have text alternatives
- Keyboard-navigable controls
- Configurable text size and contrast

**6. The "Buddy System" Analogy** (from research):
- Compare the monitoring system to "a helpful friend who watches your back"
- "The agent is like an employee — this dashboard is how you'd check in on them"
- Avoid technical jargon in primary views; offer "technical details" expandable sections

**7. Progressive Disclosure**:
- **Level 1**: Green/Yellow/Red status + one-line summary
- **Level 2**: Pillar scores + trend sparklines + top recommendation
- **Level 3**: Detailed metrics, traces, configuration
- Default to Level 1; let users drill down

### The EU AI Act Accessibility Requirement (Article 14)

Human oversight must be designed so humans can **effectively** oversee systems:
- Interface must support understanding capacities
- Must fight automation bias (UI patterns that surface confidence and alternatives)
- Must enable correct interpretation of output (explanation surfaces)
- Must allow: understand, detect anomalies, intervene, interrupt, override/reverse, decide not to use output

---

## UI Mockup Description: The pistisai-pi Oversight Dashboard

### Layout: "Mission Control" Three-Zone Design

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: [Agent Name]  |  Status: ● Active (Autopilot)  |  ⚙️  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ZONE 1: HEALTH AT A GLANCE                             │   │
│  │                                                         │   │
│  │  ┌─────────┐  Overall Health: 87/100  [████████░░░] 🟢  │   │
│  │  │  87/100 │  Last assessed: 2 minutes ago              │   │
│  │  │  (big)  │  Trend: ↗ Improving from 79 last week      │   │
│  │  └─────────┘                                            │   │
│  │                                                         │   │
│  │  Pillar Scores (with 30-day sparklines):                │   │
│  │  ┌──────────┬──────────┬──────────┬──────────┐         │   │
│  │  │ PILLAR 1 │ PILLAR 2 │ PILLAR 3 │ PILLAR 4 │         │   │
│  │  │   92     │   85     │   78 ⚠️  │   91     │         │   │
│  │  │  ▁▂▃▄▅▆ │  ▁▂▃▄▅▆ │  ▅▄▃▂�▁▂ │  ▁▂▃▄▅▆ │         │   │
│  │  │  Stable  │  Stable  │ Declining│  Stable  │         │   │
│  │  └──────────┴──────────┴──────────┴──────────┘         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ZONE 2: ACTIVITY & ALERTS                              │   │
│  │                                                         │   │
│  │  [Recent Actions]                    [Active Alerts]    │   │
│  │  ✅ Task completed (2m ago)          ⚠️ Pillar 3 below  │   │
│  │  ✅ Task completed (5m ago)             threshold       │   │
│  │  🔄 Task in progress (now)           [View] [Adjust]    │   │
│  │  ✅ Task completed (12m ago)                            │   │
│  │                                      [Notification     │   │
│  │  [View Full Timeline]                     Preferences]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ZONE 3: CONTROL & INTERVENTION                         │   │
│  │                                                         │   │
│  │  Autonomy Mode: [Advisor ▼]  (Ask | Guarded | Auto)     │   │
│  │                                                         │   │
│  │  Quick Actions:                                         │   │
│  │  [Run Cycle Now]  [Pause Agent]  [View Last Incident]   │   │
│  │                                                         │   │
│  │  Thresholds:                                            │   │
│  │  Pillar 1 Alert Below: [90 ▼]  Pillar 2: [85 ▼]        │   │
│  │  Pillar 3 Alert Below: [80 ▼]  Pillar 4: [85 ▼]        │   │
│  │                                                         │   │
│  │  [Advanced: Per-Pillar Autonomy Dials]                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Interaction Patterns

**Drill-Down Navigation:**
- Click any pillar score → detailed view with: 90-day trend, sub-metric breakdown, recent incidents affecting this pillar, recommended actions
- Click any alert → incident detail with timeline, root cause, action items
- Click "View Full Timeline" → chronological feed of all agent actions, human interventions, and system events

**Override Flow:**
1. User clicks "Adjust" on alert
2. Modal shows: current threshold, 30-day distribution of values, projected alert volume at different thresholds
3. User drifts slider → live preview: "At this threshold, you'd have received 3 alerts this week instead of 1"
4. User confirms → system logs override with reason, applies new threshold

**Incident Review Entry:**
- From alert: "Start Postmortem" → pre-populated template with incident ID, timeline, agent context snapshot
- From timeline: click any failed action → "Review This" → creates incident draft
- All fields auto-populated from telemetry; human adds: impact description, root cause, action items

---

## Key Sources

### Academic & Research
1. **"Between autonomy and oversight: Trust calibration and human controllability in agentic AI systems"** — GJETA, 2026. Tiered Controllability Framework (TCF), trust calibration failure modes.
2. **"Agentic AI and Autonomous Decision-Making: A Review of Human-in-the-Loop Frameworks"** — RSIS International, 2026. Adaptive Oversight Calibration Model (AOCM), six formal propositions.
3. **"Trust calibration in human-AI collaborative decision-making"** — Springer, 2026. Cross-domain empirical investigation (68 studies, 200 professionals, 30 interviews). Non-linear trust-autonomy relationship.
4. **"From Assistance to Agency: Rethinking Autonomy and Control in CI/CD Pipelines"** — arXiv 2605.07062. Data-plane/control-plane authority distinction.
5. **"The Digital Apprentice"** — arXiv 2606.04321v1. Per-skill autonomy tiers (Pre-L0 through L3).
6. **"Human Oversight-by-Design for Accessible Generative IUIs"** — arXiv 2602.13745. EU AI Act Article 14 implementation, oversight-by-design architecture.
7. **"Plover: Steering GUI Agents through Plan-Centric Interaction"** — arXiv 2607.15193. Plan externalization, user-driven replanning, repair patterns.
8. **"Dynamic Trust Modulation and Human Oversight in AI-Driven AML Systems"** — TheSAI, 2026. Integrated trust calibration + decision fatigue + explainability framework.
9. **"Eye-Tracking Characteristics: Unveiling Trust Calibration States"** — PMC, 2026. Real-time trust monitoring via eye movements.
10. **"From Explainable AI to Human-Centered System Reliability"** — XR4CE-CHI26. PerceptiSync framework, Dirichlet-Categorical trust modeling.

### Industry & Practice
11. **"Quantitatively Evaluating Human-in-the-Loop for AI Agents"** — Medium/@shibuiyusuke. 9-axis metrics framework, HITL Efficiency Score, dashboard visualization.
12. **"Human-in-the-Loop and Human-on-the-Loop Designs"** — compelframework.org. HITL/HOTL/HOOTL pattern definitions, EU AI Act Article 14 mapping.
13. **"Best AI Agent Monitoring Dashboards"** — sivaro.in. Token waste ratio, loop detection, what to measure.
14. **"Agent Notification Intelligence"** — Zylos Research, 2026. Smart alerting, triage, escalation patterns.
15. **"Beating Alert Fatigue in Agent Monitoring"** — TSFF Ventures. Signal architecture, dynamic thresholds.
16. **"Alert Fatigue Is a Design Problem"** — johal.in. Four-question test, tiered channels, weekly prune.
17. **"Why AI Agents Need A Chain of Authority"** — Forbes, 2026. Seven-layer authority stack.
18. **"AI agents: who gave them the power to act"** — Yunova Consulting. Six-level autonomy model (observe → orchestrate).
19. **"Human-Agent Collaboration: Designing UIs for Gemini 3 Co-Pilot Modes"** — RedlineSoft. Seven agent UX patterns, autonomy levels.
20. **"Agentic UX: Frontend Design Patterns for AI Agents in 2026"** — Zylos Research. AG-UI capabilities, generative UI patterns.
21. **"Agent UX Design Patterns: A 2026 Checklist"** — AgenticWire. Pre-action/in-action/post-action lifecycle.
22. **"The Human Override UI Agents Actually Respect"** — Medium/@Nexumo_. Diff view, approval cards, system contract.
23. **"An incident review template for tool-using AI agents"** — mubibai.com. Three views (outcome/trajectory/effect), OWASP agentic categories.
24. **"When Your Agent Goes Wrong: A Post-Mortem Playbook"** — Apptad. Six failure classes, 90-day setup plan.
25. **"Agent Incident Review"** — Novamente. Control failure identification, regression fixtures.
26. **"Post-Incident Reviews for AI Agent Failures"** — CallSphere. Blameless PIR framework, YAML template.
27. **"A Postmortem Template for AI Agent Incidents"** — CallSphere. Eight-section template, detection_chain_minutes metric.
28. **"AI Agent Failure Modes in 2026"** — Future AGI. Five-category taxonomy with subtypes.
29. **"MAP-X: Medically Altered Patient-Centered AI Explanation System"** — ACM, 2026. Layered explanation depth, patient-facing design.
30. **"Show Me How: Agent-Augmented Counterfactual Explanations"** — ACM/arXiv, 2025. Conversational XAI for non-experts.
31. **"Who Benefits from AI Explanations?"** — arXiv, 2025. Accessibility gaps in XAI, disability inclusion.
32. **"Beyond Accuracy, SHAP, and Anchors"** — Chatpaper, 2025. Developers fail at accessible explanations (only 2% success rate).
33. **"Codex: Human-in-the-Loop Design for Agentic AI"** — looprails.dev. Living reference of HITL patterns, anti-patterns.
34. **"Agentic UI Patterns in 2026"** — MavikLabs. Three collaboration models, autonomy sliders.
35. **"Human-in-the-Loop AI Design: 3 UX Patterns"** — ReloadUX. Confidence-tier mapping, exception queues.
36. **"Human-in-the-Loop Patterns"** — arunbaby.com. Approval/Intervention/Clarification patterns.
37. **"Human-in-the-Loop AI Agent Design: A How-To Guide"** — SpiderHunts. Risk-tier table, interruptible architecture.
38. **"Mission Control Cockpit for WordPress Agent"** — thebuzzbazaar.com. Single health score, advisor/autopilot modes.
39. **"OrthoLoop: Patient Monitoring Design Pattern"** — Medium/@edouard-kombo. Alarm Fatigue Index, ProbeLoop.
40. **"Ambient AI Architecture"** — tianpan.co. Interrupt threshold calibration, debouncing, channel matching.

---

## Synthesis: Recommendations for pistisai-pi

### Immediate Actions
1. **Adopt the three-zone dashboard layout** — Health at a Glance, Activity & Alerts, Control & Intervention
2. **Implement the four-question test** for every alert definition
3. **Use tiered notification channels** — P1-P4 with matching delivery (page/chat/email/log)
4. **Add sparkline visualizations** for each pillar's 30-day trend
5. **Create the nine-section postmortem template** with auto-populated agent context

### Trust & Authority
6. **Implement graduated autonomy** — Off → Ask → Guarded → Auto per pillar
7. **Separate data-plane from control-plane** authority in the monitoring system
8. **Show uncertainty honestly** — confidence signals on every agent output
9. **Add explanation layers** — basic/intermediate/advanced, default to plain language

### Accessibility
10. **Default to non-technical language** — "fairly confident" not "0.87 confidence"
11. **Use progressive disclosure** — status → scores → details
12. **Never rely on color alone** — add icons, patterns, text labels
13. **Offer conversational explanation** — "What does this mean?" natural language queries

### Alerting Discipline
14. **Classify every signal** into expected/exception/escalation before routing
15. **Implement dynamic thresholds** — alert on deviation from own history
16. **Add flapping detection** with hysteresis
17. **Track Alarm Fatigue Index** — burden, nuisance rate, response drag, suppression
18. **Set detection_chain_minutes** as a key metric and improve it over time

---

*Compiled: September 13, 2026*
*Sources: 40 references spanning academic research, industry practice, and regulatory guidance*
