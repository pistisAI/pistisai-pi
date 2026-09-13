No local repository found at `/home/rightguy` (no `.service` files or systemd configs present), so I'll provide comprehensive production deployment patterns based on industry research.

---

## Production Deployment Patterns for Long-Running AI Agent Monitoring Services

### 1. systemd Service Best Practices

**Restart Policies:**
| Policy | Behavior | Best For |
|--------|----------|----------|
| `on-failure` | Restarts on non-zero exit, signal kill, timeout, watchdog | **Most application services** (recommended default) |
| `always` | Restarts regardless of exit code | Critical infrastructure, health proxies |
| `on-abnormal` | Restarts only on signals, timeouts, watchdog failures | Services where clean exits are intentional |
| `on-success` | Restarts only on exit code 0 | Rarely used |

**Production systemd unit template for AI agent:**

```ini
# /etc/systemd/system/pistisai-pi.service
[Unit]
Description=Pistisai Pi AI Agent Monitoring Service
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/opt/pistisai-pi/bin/agent --config /etc/pistisai-pi/config.yaml
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
RestartSteps=8
RestartMaxDelaySec=300s

# Resource limits (cgroup v2)
CPUQuota=25%
MemoryMax=512M
MemoryHigh=384M
MemorySwapMax=0
TasksMax=64
LimitNOFILE=65536
LimitNPROC=512

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pistisai-pi

# Security hardening
User=pistisai-pi
Group=pistisai-pi
DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/pistisai-pi /var/log/pistisai-pi
PrivateTmp=yes
NoNewPrivileges=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

# Watchdog
WatchdogSec=30

[Install]
WantedBy=multi-user.target
```

**Key directives explained:**
- `Type=notify` — Application calls `sd_notify()` to signal `READY=1`; systemd knows exactly when startup completes
- `WatchdogSec=30` — Process must ping systemd every 30s via `sd_notify(WATCHDOG=1)`; kills process if silent
- `RestartSteps` + `RestartMaxDelaySec` (systemd 256+) — Exponential backoff with cap
- `CPUQuota=25%` — Hard cap to prevent CPU monopolization on desktop PC
- `MemoryMax=512M` — Hard OOM kill limit; `MemoryHigh=384M` is soft pressure threshold

---

### 2. Docker/Container Deployment vs Bare Metal

| Factor | Bare Metal (systemd) | Docker Container |
|--------|----------------------|------------------|
| **Best for** | Single-app desktop PC, direct HW access needed, minimal overhead | Multi-service isolation, frequent deployments, dev/prod parity |
| **Startup overhead** | Near-zero | ~1-3 seconds |
| **Memory overhead** | ~5-10MB for systemd itself | ~30-100MB (Docker daemon + container runtime) |
| **Isolation** | Process-level (cgroups via systemd) | Namespace isolation + optional image signing |
| **Rollback** | Manual (git checkout + restart) | `docker-compose down && docker-compose up -d` with image tags |
| **GPU access** | Native | Requires `--gpus all` or nvidia-container-toolkit |
| **State management** | Direct filesystem | Volumes required for persistent state |

**For a single desktop PC running one agent: Bare metal systemd wins.** Containers add operational complexity without benefit for single-tenant deployments.

**When containers make sense:**
- Running multiple isolated agent instances on one host
- Need to ship dev→staging→prod as identical artifacts
- Agent needs sandboxing (cap_drop, read-only rootfs, network isolation)
- Frequent updates (daily/weekly) with instant rollback

**If using Docker, production Compose pattern:**

```yaml
# docker-compose.yml
version: "3.8"
services:
  pistisai-pi:
    build: .
    image: pistisai-pi:${VERSION:-latest}
    container_name: pistisai-pi
    restart: unless-stopped
    env_file: .env
    volumes:
      - agent-data:/var/lib/pistisai-pi
      - ./config.yaml:/app/config.yaml:ro
    ports:
      - "8080:8080"  # Health endpoint
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 512M
        reservations:
          cpus: "0.10"
          memory: 64M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health/live"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE

volumes:
  agent-data:
```

---

### 3. Health Check Endpoints

**Three-probe model (Kubernetes-inspired, works with any orchestrator):**

| Endpoint | Purpose | Checks Included | Timeout Target |
|----------|---------|-----------------|----------------|
| `/health/live` | Liveness — is the process alive? | HTTP stack responsive, no deadlock | < 100ms |
| `/health/ready` | Readiness — can it serve? | DB, cache, queue, disk space, memory bounds | < 500ms |
| `/health/startup` | Startup — finished initialization? | All dependencies warm, config loaded | < 5s |

**Node.js/TypeScript implementation pattern:**

```typescript
// health.ts
import { Router } from 'express';
import { getReasonPhrase } from 'http-status-codes';

const router = Router();

// Liveness — fast, no I/O
router.get('/health/live', (req, res) => {
  res.json({
    status: 'alive',
    pid: process.pid,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Readiness — check critical dependencies
router.get('/health/ready', async (req, res) => {
  const checks = await Promise.allSettled([
    checkDatabase().timeout(2000),
    checkMemory().timeout(500),
    checkDiskSpace().timeout(500)
  ]);
  
  const allHealthy = checks.every(c => c.status === 'fulfilled');
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks: {
      database: checks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      memory: checks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      disk: checks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy'
    }
  });
});

// Startup — comprehensive initialization check
router.get('/health/startup', async (req, res) => {
  const initialized = await isFullyInitialized();
  if (!initialized) {
    return res.status(503).json({ status: 'starting', progress: getInitProgress() });
  }
  res.json({ status: 'started', version: process.env.VERSION });
});

export default router;
```

**For systemd integration (Type=notify):**

```typescript
// notify.ts
import { sdNotify } from 'sd-notify';

// Signal ready to systemd
await sdNotify.READY();
// Send watchdog ping every WatchdogSec/2
setInterval(() => {
  sdNotify.WATCHDOG();
}, 15000);
// Optional status update
sdNotify.STATUS('Monitoring active, last cycle: 2 min ago');
```

---

### 4. Log Rotation and Storage

**Option A: journald-native (recommended for systemd services)**

```ini
# /etc/systemd/journald.conf
[Journal]
Storage=persistent
SystemMaxUse=512M
SystemMaxFileSize=50M
MaxRetentionSec=14day
Compress=yes
RateLimitIntervalSec=30s
RateLimitBurst=10000
ForwardToSyslog=no
```

```bash
# Maintenance commands
journalctl --disk-usage                    # Check current usage
sudo journalctl --vacuum-size=256M          # Cap to 256MB
sudo journalctl --vacuum-time=14d           # Remove entries older than 14 days
sudo journalctl -u pistisai-pi -f           # Follow logs
sudo journalctl -u pistisai-pi --since "1 hour ago" --no-pager
```

**Option B: file-based with logrotate (for text logs)**

```conf
# /etc/logrotate.d/pistisai-pi
/var/log/pistisai-pi/*.log {
    daily
    rotate 14
    compress
    delaycompress
    dateext
    dateformat -%Y%m%d-%s
    missingok
    notifempty
    create 0640 pistisai-pi pistisai-pi
    sharedscripts
    postrotate
        systemctl kill -s HUP pistisai-pi.service
    endscript
}
```

**Capacity planning for 24/7 operation:**
- At moderate verbosity (~100 lines/min, ~500 bytes/line): ~72MB/day uncompressed
- With `compress=yes` in journald: ~10-15MB/day
- 14-day retention at compressed rate: ~210MB
- Set `SystemMaxUse=512M` headroom for burst scenarios

---

### 5. Configuration Management

**Layered configuration with hot-reload:**

```
Layer 1 (lowest priority): /etc/pistisai-pi/defaults.yaml — vendor defaults, version-controlled
Layer 2: /etc/pistisai-pi/config.yaml — site-wide config, version-controlled
Layer 3: ~/.config/pistisai-pi/config.yaml — user overrides
Layer 4 (highest): Environment variables (PISTISAI_PI__SECTION__KEY=value)
```

**TypeScript implementation using convict + chokidar:**

```typescript
// config.ts
import convict from 'convict';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

const schema = {
  env: {
    doc: 'Runtime environment',
    format: ['production', 'staging', 'development'],
    default: 'production',
    env: 'NODE_ENV'
  },
  logLevel: {
    doc: 'Logging level',
    format: ['debug', 'info', 'warn', 'error'],
    default: 'info'
  },
  watchdog: {
    intervalSec: { format: 'int', default: 300 },
    maxRestartsPerHour: { format: 'int', default: 5 }
  },
  agent: {
    model: { format: String, default: 'gpt-4o-mini' },
    maxContextTokens: { format: 'int', default: 128000 }
  },
  features: {
    selfHealing: { format: Boolean, default: true },
    autoUpdate: { format: Boolean, default: false }
  }
};

export function loadConfig() {
  const config = convict(schema);
  config.loadFile('/etc/pistisai-pi/config.yaml');
  config.validate({ allowed: 'strict' });
  return config;
}

export function watchConfig(config: convict.Config, emitter: EventEmitter) {
  const watcher = chokidar.watch('/etc/pistisai-pi/config.yaml', {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 }
  });
  
  watcher.on('change', () => {
    try {
      config.loadFile('/etc/pistisai-pi/config.yaml');
      config.validate({ allowed: 'warn' });
      emitter.emit('config:changed', config.getProperties());
    } catch (err) {
      emitter.emit('config:error', err);
    }
  });
  
  return watcher;
}

// In main.ts:
const emitter = new EventEmitter();
const config = loadConfig();
watchConfig(config, emitter);

emitter.on('config:changed', (props) => {
  // Safe to change at runtime: logLevel, watchdog interval, feature flags
  logger.level = props.logLevel;
  featureFlags.update(props.features);
  // NOT safe: listen port, database URL — log warning, require restart
});
```

**Feature flags with progressive rollout:**

```typescript
// feature-flags.ts
interface FeatureFlags {
  selfHealing: boolean;
  newModelProvider: boolean;
  autoUpdate: boolean;
  debugEndpoints: boolean;
}

class FeatureFlagManager {
  private flags: FeatureFlags;
  
  update(newFlags: Partial<FeatureFlags>) {
    const oldFlags = { ...this.flags };
    this.flags = { ...this.flags, ...newFlags };
    // Log only changed flags
    for (const [key, value] of Object.entries(newFlags)) {
      if (oldFlags[key as keyof FeatureFlags] !== value) {
        logger.info(`Feature flag changed: ${key} = ${value}`);
      }
    }
  }
  
  isEnabled(flag: keyof FeatureFlags): boolean {
    return this.flags[flag];
  }
}
```

---

### 6. Alerting Integrations

**Multi-channel alert system with deduplication:**

```typescript
// alerts.ts
import { EventEmitter } from 'events';

type AlertSeverity = 'info' | 'warning' | 'critical';
type AlertChannel = 'desktop' | 'telegram' | 'email' | 'webhook' | 'log';

interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  context: Record<string, unknown>;
}

class AlertManager extends EventEmitter {
  private channels: Map<AlertChannel, AlertSender> = new Map();
  private dedupCache: Map<string, number> = new Map();
  private dedupWindowMs = 10 * 60 * 1000; // 10 minutes
  
  registerChannel(name: AlertChannel, sender: AlertSender) {
    this.channels.set(name, sender);
  }
  
  async send(alert: Alert, channels: AlertChannel[] = ['log']) {
    const dedupKey = `${alert.severity}:${alert.title}`;
    const lastSent = this.dedupCache.get(dedupKey);
    
    if (lastSent && Date.now() - lastSent < this.dedupWindowMs) {
      logger.debug(`Alert suppressed (dedup): ${alert.title}`);
      return;
    }
    
    this.dedupCache.set(dedupKey, Date.now());
    
    const results = await Promise.allSettled(
      channels.map(ch => this.channels.get(ch)?.send(alert))
    );
    
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`Alert channel ${channels[i]} failed: ${r.reason}`);
      }
    });
  }
}

// Telegram sender (free, instant, mobile push)
class TelegramSender implements AlertSender {
  constructor(private botToken: string, private chatId: string) {}
  
  async send(alert: Alert) {
    const emoji = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }[alert.severity];
    await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: `${emoji} *${alert.title}*\n\n${alert.message}`,
        parse_mode: 'Markdown'
      })
    });
  }
}

// Desktop notification (Linux)
class DesktopSender implements AlertSender {
  async send(alert: Alert) {
    await execAsync(`notify-send -u ${alert.severity === 'critical' ? 'critical' : 'normal'} "${alert.title}" "${alert.message}"`);
  }
}

// Webhook sender (for external integrations)
class WebhookSender implements AlertSender {
  constructor(private url: string, private secret: string) {}
  
  async send(alert: Alert) {
    const body = JSON.stringify({
      event: 'agent.alert',
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      timestamp: alert.timestamp.toISOString(),
      context: alert.context
    });
    
    const signature = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
    
    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature
      },
      body
    });
  }
}
```

**Alert routing rules (example):**

```typescript
// Routing configuration
const alertRules: Record<string, AlertChannel[]> = {
  'agent.stuck': ['telegram', 'desktop'],
  'agent.context_overflow': ['telegram', 'desktop', 'email'],
  'agent.crash_loop': ['telegram', 'email', 'webhook'],
  'agent.dependency_down': ['telegram'],
  'agent.high_memory': ['desktop'],
  'agent.task_completed': ['log']  // Informational only
};
```

---

### 7. Update Strategies

**Blue-green style update for systemd services (preserving state):**

```bash
#!/bin/bash
# /opt/pistisai-pi/bin/self-update.sh
set -euo pipefail

STATE_DIR="/var/lib/pistisai-pi"
BACKUP_DIR="/opt/pistisai-pi/previous"
CURRENT_DIR="/opt/pistisai-pi/current"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE_TAG="${1:-latest}"

log() { echo "[$(date -Iseconds)] $*"; }

log "Starting update to ${RELEASE_TAG}..."

# 1. Pre-flight health check
if ! systemctl is-active --quiet pistisai-pi.service; then
    log "ERROR: Service not running, aborting update"
    exit 1
fi

# 2. Save state (checkpoint)
log "Saving agent state..."
curl -sf http://localhost:8080/api/checkpoint > "${STATE_DIR}/checkpoint-${TIMESTAMP}.json"

# 3. Download new version
log "Downloading ${RELEASE_TAG}..."
NEW_DIR="/opt/pistisai-pi/releases/${RELEASE_TAG}"
mkdir -p "${NEW_DIR}"
curl -sL "https://github.com/user/repo/releases/download/${RELEASE_TAG}/pistisai-pi.tar.gz" | tar xz -C "${NEW_DIR}"

# 4. Run pre-update migration scripts
log "Running pre-update migrations..."
cd "${NEW_DIR}" && ./scripts/migrate.sh

# 5. Swap symlinks atomically
log "Switching to new version..."
ln -sfn "${CURRENT_DIR}" "${BACKUP_DIR}"
ln -sfn "${NEW_DIR}" "${CURRENT_DIR}"

# 6. Restart and verify
log "Restarting service..."
systemctl restart pistisai-pi.service
sleep 5

# 7. Health check with rollback
for i in {1..12}; do
    if curl -sf http://localhost:8080/health/ready > /dev/null 2>&1; then
        log "Update successful — service healthy"
        # Clean up old releases (keep last 2)
        ls -dt /opt/pistisai-pi/releases/*/ | tail -n +3 | xargs rm -rf
        exit 0
    fi
    log "Waiting for service to become ready... (${i}/12)"
    sleep 5
done

# 8. Rollback on failure
log "ERROR: Service unhealthy, rolling back..."
ln -sfn "${BACKUP_DIR}" "${CURRENT_DIR}"
systemctl restart pistisai-pi.service
log "Rollback complete — service restored to previous version"
exit 1
```

**State preservation pattern:**

```typescript
// state-checkpoint.ts
import { writeFile, readFile } from 'fs/promises';
import { createHash } from 'crypto';

interface AgentState {
  loopCount: number;
  lastCompletedTask: string;
  pendingTasks: string[];
  errorLog: string[];
  configSnapshot: Record<string, unknown>;
  identity: string;
}

export async function writeCheckpoint(state: AgentState, path: string) {
  const data = JSON.stringify(state, null, 2);
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, data);
  // Atomic rename ensures we never have a half-written checkpoint
  await rename(tmpPath, path);
}

export async function readCheckpoint(path: string): Promise<AgentState | null> {
  try {
    const data = await readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Capsule pattern: compressed state summary for fast recovery
export function formatCapsule(state: AgentState): string {
  return `# Pistisai Pi Capsule
Identity: ${state.identity}
Loops: ${state.loopCount}
Last task: ${state.lastCompletedTask}
Pending: ${state.pendingTasks.length} items
Recent errors: ${state.errorLog.length}

## Recent Errors
${state.errorLog.slice(-5).join('\n')}

## Pending Tasks
${state.pendingTasks.join('\n')}
`;
}
```

---

### 8. Resource Efficiency (Desktop PC Budget)

**Target budget for background monitoring service:**

| Resource | Minimum | Comfortable | Maximum | Notes |
|----------|---------|-------------|---------|-------|
| **Memory** | 64MB | **128-256MB** | 512MB | Agent + runtime + state cache |
| **CPU** | 1% idle | **5-15% avg** | 25% burst | Spike during analysis, idle otherwise |
| **Disk I/O** | Negligible | **< 1MB/s write** | 5MB/s | Logs + state checkpoints |
| **Disk space** | 100MB | **500MB** | 2GB | Binary + logs + state + backups |
| **Network** | < 1KB/s | **< 10KB/s** | 1MB/s | API calls + health pings |

**Implementation for resource awareness:**

```typescript
// resource-governor.ts
import os from 'os';
import v8 from 'v8';

interface ResourceUsage {
  cpuPercent: number;
  memoryMB: number;
  memoryPercent: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
}

class ResourceGovernor {
  private lastCpuUsage = process.cpuUsage();
  private lastCheck = Date.now();
  
  getCurrentUsage(): ResourceUsage {
    const now = Date.now();
    const elapsedMs = now - this.lastCheck;
    const currentUsage = process.cpuUsage();
    
    // Calculate CPU percentage
    const userDelta = (currentUsage.user - this.lastCpuUsage.user) / 1000; // microseconds→ms
    const sysDelta = (currentUsage.system - this.lastCpuUsage.system) / 1000;
    const cpuPercent = ((userDelta + sysDelta) / elapsedMs) * 100;
    
    this.lastCpuUsage = currentUsage;
    this.lastCheck = now;
    
    const memUsage = process.memoryUsage();
    const totalMemMB = os.totalmem() / 1024 / 1024;
    
    return {
      cpuPercent,
      memoryMB: memUsage.rss / 1024 / 1024,
      memoryPercent: (memUsage.rss / os.totalmem()) * 100,
      heapUsedMB: memUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memUsage.heapTotal / 1024 / 1024,
      rssMB: memUsage.rss / 1024 / 1024
    };
  }
  
  isUnderPressure(): boolean {
    const usage = this.getCurrentUsage();
    return usage.memoryPercent > 80 || usage.cpuPercent > 50;
  }
  
  shouldThrottle(): boolean {
    const usage = this.getCurrentUsage();
    return usage.memoryPercent > 70 || usage.cpuPercent > 30;
  }
  
  // Adaptive sleep: longer pauses when system is busy
  getAdaptiveInterval(baseIntervalMs: number): number {
    const usage = this.getCurrentUsage();
    let multiplier = 1.0;
    
    if (usage.cpuPercent > 50) multiplier *= 2.0;
    if (usage.memoryPercent > 70) multiplier *= 1.5;
    
    // If other processes are consuming CPU, back off
    const loadAvg = os.loadavg()[0]; // 1-min load average
    const cpuCount = os.cpus().length;
    if (loadAvg > cpuCount * 0.8) multiplier *= 2.0;
    
    return baseIntervalMs * multiplier;
  }
}

// Usage in main loop
const governor = new ResourceGovernor();

async function mainLoop() {
  while (true) {
    const interval = governor.getAdaptiveInterval(300000); // 5 min base
    
    if (governor.shouldThrottle()) {
      logger.warn('System under pressure, throttling operations');
      await sleep(interval);
      continue;
    }
    
    try {
      await doWork();
    } catch (err) {
      logger.error('Work iteration failed', err);
    }
    
    await sleep(interval);
  }
}
```

**systemd resource limits for desktop:**

```ini
[Service]
# Don't starve desktop applications
CPUAccounting=yes
CPUQuota=25%
CPUWeight=50  # Lower than default 100, desktop apps get priority

MemoryAccounting=yes
MemoryMax=512M
MemoryHigh=384M
MemorySwapMax=0  # Never swap agent to disk (kills latency)

IOAccounting=yes
IOWeight=50  # Lower I/O priority

# Nice level: higher = lower priority (10-19 range)
Nice=10

# I/O scheduling class
IOSchedulingClass=idle
IOSchedulingPriority=7
```

---

### Monitoring Stack Recommendations

For a single desktop PC running the agent, the simplest robust stack:

| Component | Tool | Rationale |
|-----------|------|-----------|
| **Logs** | systemd-journald | Already running, structured queries, zero setup |
| **Metrics** | Node.js `prom-client` → Prometheus → Grafana | Optional; only if historical metrics needed |
| **Alerting** | Telegram bot API + `notify-send` | Free, instant, mobile + desktop |
| **Health** | `/health/*` endpoints checked by systemd `WatchdogSec` | Native systemd integration |
| **Uptime** | systemd `Restart=on-failure` + `StartLimitBurst` | Auto-recovery without external tools |
| **Dashboard** | Optional: Grafana on `http://localhost:3000` | Only if visualization needed |

**Minimal monitoring stack (for solo operator):**

```typescript
// built-in monitoring (no external dependencies)
setInterval(() => {
  const usage = governor.getCurrentUsage();
  const snapshot = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cpu: usage.cpuPercent.toFixed(1),
    memory: usage.memoryMB.toFixed(1),
    memoryPercent: usage.memoryPercent.toFixed(1),
    pendingTasks: taskQueue.size(),
    lastError: lastError?.message ?? null
  };
  
  // Write lightweight metrics to local file
  appendFileSync('/var/lib/pistisai-pi/metrics.jsonl', JSON.stringify(snapshot) + '\n');
  
  // Alert on anomalies
  if (usage.memoryPercent > 80) {
    alertManager.send({
      id: 'high-memory',
      severity: 'warning',
      title: 'Agent High Memory',
      message: `Memory at ${usage.memoryPercent.toFixed(1)}% (${usage.memoryMB.toFixed(0)}MB)`,
      timestamp: new Date(),
      context: snapshot
    }, ['telegram', 'desktop']);
  }
}, 60000); // Every 60 seconds
```

---

### Summary Checklist

1. **Use `Type=notify` + `WatchdogSec=30`** — systemd knows exactly when agent is ready and detects hangs
2. **`Restart=on-failure` with backoff** — `RestartSec=5s` + `RestartSteps=8` + `RestartMaxDelaySec=300s`
3. **Resource limits** — `CPUQuota=25%`, `MemoryMax=512M`, `Nice=10` to protect desktop usability
4. **Three health endpoints** — `/health/live` (fast), `/health/ready` (comprehensive), `/health/startup` (init check)
5. **journald with caps** — `Storage=persistent`, `SystemMaxUse=512M`, `MaxRetentionSec=14day`
6. **Hot-reload config** — File watch with safe/unsafe change distinction
7. **Multi-channel alerts** — Telegram (critical), desktop notification (warnings), email (digest)
8. **Atomic updates** — Checkpoint state → download → health check → rollback on failure
9. **Adaptive resource usage** — Sleep longer when system is under load
10. **Security hardening** — `DynamicUser=yes`, `ProtectSystem=strict`, `NoNewPrivileges=yes`, capability drop

**No local files modified** — No pistisai-pi repository found at `/home/rightguy`. The patterns above are ready to apply when the codebase is available.

**Sources consulted:**
- systemd 256+ documentation (restart policies, cgroup v2 limits, watchdog)
- Taler project systemd restart policy design document
- Kubernetes health check patterns (liveness/readiness/startup probes)
- Production incident reports (watchdog false positives, alert fatigue)
- systemd-journald retention best practices from multiple Linux distributions
- Configuration management patterns (convict, viper, layered config with hot-reload)