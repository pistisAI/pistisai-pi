// watchdog.ts – Always-running 4-pillar monitor and steer agent for any target agent
//
// Reads agent state from Hermes (or sim), computes 4-pillar focus score,
// and triggers Pi subagent repairs when drift is detected.
// Runs continuously in a loop.

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';

const CONFIG_PATH = join(process.cwd(), 'config.yaml');
const STATE_FILE = join(process.cwd(), 'agent-state.json'); // Simulated Hermes state file
const LOG_FILE = join(process.cwd(), 'watchdog.log');

const BIONIC_BASE_URL = process.env.BIONIC_BASE_URL || 'http://127.0.0.1:36093/v1';
const BIONIC_API_KEY = process.env.BIONIC_API_KEY || process.env.OPENAI_API_KEY || '';

if (!BIONIC_API_KEY) {
  console.error('[FATAL] BIONIC_API_KEY or OPENAI_API_KEY must be set in environment');
  process.exit(1);
}

type Pillar = 'aiman' | 'aigent' | 'aidration' | 'aimotions';
type PillarState = {
  name: string;
  titan: string;
  focus: number;       // 0.0 - 1.0
  drift: number;        // 0.0 - 1.0
  lastChecked: string;  // ISO timestamp
  issues: string[];
};

type AgentConfig = {
  agent_name: string;
  agent_id: string;
  focus_threshold: number;
  mesh_topic: string;
  session_dir: string;
  state_poll_interval_ms: number;
  inference_backend: string;
  metrics_port: number;
};

function loadConfig(): AgentConfig {
  const configContent = readFileSync(CONFIG_PATH, 'utf8');
  const config: AgentConfig = {
    agent_name: 'pistisai',
    agent_id: 'pistisai-agent-001',
    focus_threshold: 0.5,
    mesh_topic: 'pistisai/focus',
    session_dir: './pi-sessions',
    state_poll_interval_ms: 10_000, // 10s default
    inference_backend: 'bionic',
    metrics_port: 9090,
  };

  for (const line of configContent.split('\n')) {
    const [key, ...valParts] = line.trim().split(':');
    const val = valParts.join(':').trim();
    switch (key) {
      case 'agent_name': config.agent_name = val; break;
      case 'agent_id': config.agent_id = val; break;
      case 'focus_threshold': config.focus_threshold = parseFloat(val); break;
      case 'mesh_topic': config.mesh_topic = val; break;
      case 'session_dir': config.session_dir = val; break;
      case 'state_poll_interval_ms': config.state_poll_interval_ms = parseInt(val); break;
      case 'inference_backend': config.inference_backend = val; break;
      case 'metrics_port': config.metrics_port = parseInt(val); break;
    }
  }
  return config;
}

// Simulate reading agent state from Hermes (replace with real Hermes reads)
function readAgentState(): any {
  // In real implementation, this would:
  // - Query Hermes AgentIdentityService, AgentLifecycleService, etc.
  // - Read from Hermes SQLite DB (drift_local_brain)
  // - Or tail Hermes logs for tool usage, errors, sessions
  // For now, simulate with a file or random values for testing
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      // Fallback to simulation
    }
  }
  // Simulated state for testing
  return {
    tool_calls: Math.floor(Math.random() * 5),
    errors: Math.floor(Math.random() * 2),
    idle_gaps: Math.floor(Math.random() * 3),
    session_starts: 1, // Assume one active session
    timestamp: Date.now(),
  };
}

function computePillarScores(state: any, config: AgentConfig): {
  aggregate: number;
  aiman: { focus: number; drift: number; issues: string[] };
  aigent: { focus: number; drift: number; issues: string[] };
  aidration: { focus: number; drift: number; issues: string[] };
  aimotions: { focus: number; drift: number; issues: string[] };
} {
  const toolCalls = state.tool_calls ?? 0;
  const idleGaps = state.idle_gaps ?? 0;
  const errors = state.errors ?? 0;
  const sessionStarts = state.session_starts ?? 0;

  // Heuristic scoring (same as before)
  const aimanFocus = Math.max(0, 1.0 - (errors / Math.max(toolCalls + errors + 1, 1)) - 0.1 * idleGaps);
  const aigentFocus = Math.max(0, 1.0 - 0.05 * toolCalls - 0.2 * errors);
  const aidrationFocus = Math.max(0, 1.0 - 0.1 * Math.abs(sessionStarts - 1) - 0.1 * idleGaps);
  const aimotionsFocus = Math.max(0, 1.0 - 0.05 * errors);

  const aggregate = (aimanFocus + aigentFocus + aidrationFocus + aimotionsFocus) / 4;

  return {
    aggregate,
    aiman: { focus: aimanFocus, drift: 1 - aimanFocus, issues: errors > 0 ? [`${errors} errors`] : [] },
    aigent: { focus: aigentFocus, drift: 1 - aigentFocus, issues: toolCalls === 0 ? ['No tool activity'] : [] },
    aidration: { focus: aidrationFocus, drift: 1 - aidrationFocus, issues: sessionStarts !== 1 ? [`${sessionStarts} sessions`] : [] },
    aimotions: { focus: aimotionsFocus, drift: 1 - aimotionsFocus, issues: [] },
  };
}

type RepairDirective = {
  action: string;
  pillars: Pillar[];
  params: Record<string, any>;
};

function selectRepairDirective(pillars: Record<Pillar, PillarState>): RepairDirective {
  const drifted = (Object.entries(pillars) as [Pillar, PillarState][])
    .filter(([_, s]) => s.drift > 0.5)
    .map(([p, _]) => p);

  // Default repair: reset agent session + re-apply persona
  return {
    action: 'reset-session-with-persona',
    pillars: drifted.length > 0 ? drifted : ['aigent'],
    params: {
      reset_memory: true,
      reapply_traits: true,
      reset_idle_timeout: 300_000, // 5 min
    },
  };
}

function logMessage(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(logLine.trim());
  try {
    writeFileSync(LOG_FILE, logLine, { flag: 'a' });
  } catch (e) {
    // Ignore log errors
  }
}

async function invokePiSubagent(config: AgentConfig, directive: RepairDirective) {
  const prompt = `
You are ${config.agent_name}'s focus repair sub-agent.

Pillar drift detected: ${directive.pillars.join(', ')}.
Directive: ${directive.action}
Params: ${JSON.stringify(directive.params)}

Actions:
1. Reinitialize agent session for ${config.agent_name}
2. Re-apply base personality traits (from ~/.hermes/profiles/${config.agent_name}/)
3. Clear idle timeout state
4. Log repair completion with timestamp
5. Report back concise confirmation

Do NOT modify system prompts. Do NOT touch secrets.
`;

  logMessage(`🔧 Triggering repair: ${directive.action} for pillars ${directive.pillars.join(', ')}`);

  try {
    // Use pi's built-in subagent execution (equivalent to `pi --print`)
    // Use Bionic backend (LM Studio on port 36093)
    const result = execSync(`pi --provider openai --model gemma-4-E4B-it --print -- "${prompt.trim().replace(/\n/g, '\n')}"`, {
      env: {
        ...process.env,
        OPENAI_API_KEY: BIONIC_API_KEY,
        AZURE_OPENAI_BASE_URL: BIONIC_BASE_URL,
      },
      maxBuffer: 1024 * 1024, // 1MB buffer
      encoding: 'utf8',
    });
    logMessage(`✅ Repair completed: ${result.toString().trim()}`);
  } catch (err: any) {
    logMessage(`❌ Repair failed: ${err.message}`);
  }
}

async function main() {
  logMessage('🚀 Starting Pi 4-Pillar Watchdog...');
  const config = loadConfig();
  logMessage(`👀 Monitoring agent: ${config.agent_name}`);
  logMessage(`⏱️  Poll interval: ${config.state_poll_interval_ms}ms`);
  logMessage(`🎯 Focus threshold: ${config.focus_threshold}`);

  while (true) {
    try {
      const state = readAgentState();
      const scores = computePillarScores(state, config);

      // Update and persist pillar states (simplified for watchdog)
      // In full implementation, we'd update a DB or publish to mesh
      logMessage(`📊 Focus: ${scores.aggregate.toFixed(2)} | ` +
        `Aiman: ${scores.aiman.focus.toFixed(2)} | ` +
        `Aigent: ${scores.aigent.focus.toFixed(2)} | ` +
        `Aidration: ${scores.aidration.focus.toFixed(2)} | ` +
        `Aimotions: ${scores.aimotions.focus.toFixed(2)}`);

      // Check for drift → trigger repair
      if (scores.aggregate < config.focus_threshold) {
        const directive = selectRepairDirective({
          aiman: { ...scores.aiman, name: 'Aiman', titan: 'Hyperion' } as PillarState,
          aigent: { ...scores.aigent, name: 'Aigent', titan: 'Koios' } as PillarState,
          aidration: { ...scores.aidration, name: 'Aidration', titan: 'Krios' } as PillarState,
          aimotions: { ...scores.aimotions, name: 'Aimotions', titan: 'Iapetos' } as PillarState,
        });
        await invokePiSubagent(config, directive);
      }

      // Wait for next poll
      await new Promise(resolve => setTimeout(resolve, config.state_poll_interval_ms));
    } catch (err) {
      logMessage(`💥 Watchdog error: ${err instanceof Error ? err.message : String(err)}`);
      // Continue loop after error
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s on error
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logMessage('🛑 Watchdog stopped by user');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logMessage('🛑 Watchdog stopped by signal');
  process.exit(0);
});

// Start
main().catch(err => {
  logMessage(`💥 Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});