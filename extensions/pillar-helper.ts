// pillar-helper.ts – Generic 4-pillar agent monitor/steer extension for Pi
//
// Works with any agent_name configured in config.yaml (default: "pistisai")
// Maps agent activity to Aiman/Aigent/Aidration/Aimotions pillars, computes
// a focus score, and triggers repair via pi subagent if drift detected.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

type ExtensionAPI = {
  registerTool(tool: { name: string; label: string; description: string; parameters?: Record<string, any>; execute: (id: string, params: any) => Promise<any> }): void;
  sendMessage(message: { role: string; content: string }): Promise<void>;
  callTool(name: string, params?: any): Promise<any>;
  log(message: string): void;
};

const CONFIG_PATH = join(process.cwd(), 'config.yaml');
const DB_PATH = join(process.cwd(), 'focus_tracker.db');

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
};

function loadConfig(): AgentConfig {
  const configContent = readFileSync(CONFIG_PATH, 'utf8');
  // Simple YAML parse (real impl should use js-yaml)
  const config: AgentConfig = {
    agent_name: 'pistisai',
    agent_id: 'pistisai-agent-001',
    focus_threshold: 0.5,
    mesh_topic: 'pistisai/focus',
    session_dir: './pi-sessions',
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
    }
  }
  return config;
}

export default function pillarHelper(pi: ExtensionAPI) {
  const config = loadConfig();
  const focusTracker = new FocusTracker(DB_PATH);
  const meshClient = new A2AMeshClient(config.mesh_topic);

  // Initialize default pillar states
  const pillars: Record<Pillar, PillarState> = {
    aiman: { name: 'Aiman', titan: 'Hyperion', focus: 1.0, drift: 0.0, lastChecked: new Date().toISOString(), issues: [] },
    aigent: { name: 'Aigent', titan: 'Koios', focus: 1.0, drift: 0.0, lastChecked: new Date().toISOString(), issues: [] },
    aidration: { name: 'Aidration', titan: 'Krios', focus: 1.0, drift: 0.0, lastChecked: new Date().toISOString(), issues: [] },
    aimotions: { name: 'Aimotions', titan: 'Iapetos', focus: 1.0, drift: 0.0, lastChecked: new Date().toISOString(), issues: [] },
  };

  // === TOOL: Get current pillar states ===
  pi.registerTool({
    name: 'pillar_status',
    label: 'Pillar Status',
    description: `Show current 4-pillar focus state for agent: ${config.agent_name}`,
    parameters: {
      detail: { type: 'boolean', description: 'Include per-pillar issues', default: true },
    },
    async execute(_id, params: { detail?: boolean }) {
      const snapshot = JSON.parse(JSON.stringify(pillars));
      if (!params.detail) {
        for (const p of Object.values(snapshot) as PillarState[]) p.issues = [];
      }
      return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] };
    },
  });

  // === TOOL: Compute focus score ===
  pi.registerTool({
    name: 'compute_focus_score',
    label: 'Compute Focus',
    description: `Compute aggregate focus score for ${config.agent_name} based on recent activity.`,
    async execute(_id) {
      const recent = await focusTracker.getRecentEvents(60_000); // last 60s
      const scores = computePillarScores(recent, config);
      for (const p of ['aiman', 'aigent', 'aidration', 'aimotions'] as Pillar[]) {
        pillars[p].focus = scores[p].focus;
        pillars[p].drift = scores[p].drift;
        pillars[p].issues = scores[p].issues;
        pillars[p].lastChecked = new Date().toISOString();
        // Persist
        await focusTracker.updatePillarState(config.agent_name, p, pillars[p]);
      }

      // Publish state to mesh
      await meshClient.publish({
        type: 'pillar_state',
        agent_name: config.agent_name,
        agent_id: config.agent_id,
        timestamp: new Date().toISOString(),
        pillars: JSON.parse(JSON.stringify(pillars)),
        aggregateFocus: scores.aggregate,
      });

      // Check for drift → trigger repair
      if (scores.aggregate < config.focus_threshold) {
        const directive = selectRepairDirective(pillars);
        await pi.sendMessage({
          role: 'assistant',
          content: `⚠️ Focus score dropped to ${scores.aggregate.toFixed(2)} for ${config.agent_name}.\n` +
            `Pillars with issues: ${directive.pillars.join(', ')}\n` +
            `Applying repair: ${directive.action}`,
        });

        // Invoke Pi subagent for repair
        await invokePiSubagent(pi, config, directive);
      }

      return {
        content: [{
          type: 'text',
          text: `Focus score for ${config.agent_name}: ${scores.aggregate.toFixed(2)}\n` +
            Object.entries(pillars).map(([k, v]) => `${k}: ${v.focus.toFixed(2)}`).join('\n'),
        }],
      };
    },
  });

  // === TOOL: Manual focus reset ===
  pi.registerTool({
    name: 'reset_focus',
    label: 'Reset Focus',
    description: `Reset focus state for ${config.agent_name}.`,
    async execute(_id) {
      for (const p of Object.values(pillars)) {
        p.focus = 1.0;
        p.drift = 0.0;
        p.issues = [];
        p.lastChecked = new Date().toISOString();
      }
      await focusTracker.clearEvents();
      return { content: [{ type: 'text', text: `${config.agent_name} focus state reset.` }] };
    },
  });

}

// ============================================================
// Focus Tracker — persists events and pillar states to SQLite
// ============================================================

class FocusTracker {
  private db: any; // sqlite instance

  constructor(dbPath: string) {
    // Real impl uses sqlite3 module
    if (!existsSync(dbPath)) {
      // Create stub DB file (in actual deployment, init SQLite schema)
      writeFileSync(dbPath, '');
    }
    this.db = { path: dbPath, initialized: true };
    pi_log(`FocusTracker initialized at ${dbPath}`);
  }

  async logEvent(type: string, payload: any, agent_name: string) {
    // INSERT INTO events (timestamp, event_type, payload, agent_id)
    pi_log(`[evt] ${type} | ${agent_name}`);
    // Placeholder for actual SQLite write
  }

  async getRecentEvents(since_ms: number): Promise<any[]> {
    // SELECT * FROM events WHERE timestamp > ?
    return []; // Placeholder — replaced by real query in prod
  }

  async updatePillarState(agent_name: string, pillar: Pillar, state: PillarState) {
    // UPSERT pillar state
    pi_log(`[db] Updated ${pillar} state for ${agent_name}: focus=${state.focus.toFixed(2)}`);
  }

  async clearEvents() {
    // DELETE FROM events
    pi_log('[db] Cleared all events');
  }
}

// ============================================================
// A2A Mesh Client — publishes events to PI_A2A mesh
// ============================================================

class A2AMeshClient {
  private topic: string;

  constructor(topic: string) {
    this.topic = topic;
    pi_log('[A2A] Mesh client initialized for topic: ' + topic);
  }

  async publish(message: any) {
    // Uses @bacnh85/pi-a2a extension under the hood
    pi_log('[A2A] Published: ' + JSON.stringify(message).slice(0, 200));
  }

  async subscribe(handler: (msg: any) => void) {
    pi_log('[A2A] Subscribed to topic: ' + this.topic);
    // Handle incoming mesh messages
  }
}

// ============================================================
// Pillar Scoring Logic — maps events to 4 pillars
// ============================================================

function computePillarScores(events: any[], config: AgentConfig): {
  aggregate: number;
  aiman: { focus: number; drift: number; issues: string[] };
  aigent: { focus: number; drift: number; issues: string[] };
  aidration: { focus: number; drift: number; issues: string[] };
  aimotions: { focus: number; drift: number; issues: string[] };
} {
  // Count events by type
  const toolCalls = events.filter(e => e.event_type === 'tool_call').length;
  const idleGaps = events.filter(e => e.event_type === 'idle').length;
  const errors = events.filter(e => e.event_type === 'error').length;
  const sessionStarts = events.filter(e => e.event_type === 'session_start').length;

  // Heuristic scoring
  const aimanFocus = Math.max(0, 1.0 - (errors / Math.max(events.length, 1)) - 0.1 * idleGaps);
  const aigentFocus = Math.max(0, 1.0 - 0.05 * toolCalls - 0.2 * errors);
  const aidrationFocus = Math.max(0, 1.0 - 0.1 * (Math.abs(sessionStarts - 1)) - 0.1 * idleGaps);
  const aimotionsFocus = Math.max(0, 1.0 - 0.05 * errors);

  const aggregate = (aimanFocus + aigentFocus + aidrationFocus + aimotionsFocus) / 4;

  return {
    aggregate,
    aiman: { focus: aimanFocus, drift: 1 - aimanFocus, issues: errors > 0 ? [`${errors} errors detected`] : [] },
    aigent: { focus: aigentFocus, drift: 1 - aigentFocus, issues: toolCalls === 0 ? ['No recent tool activity'] : [] },
    aidration: { focus: aidrationFocus, drift: 1 - aidrationFocus, issues: sessionStarts !== 1 ? [`${sessionStarts || 0} sessions active`] : [] },
    aimotions: { focus: aimotionsFocus, drift: 1 - aimotionsFocus, issues: [] },
  };
}

// ============================================================
// Repair Directives — selected based on which pillar drifted
// ============================================================

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

// ============================================================
// Pi Subagent Invocation — delegates repair to Pi headless mode
// ============================================================

async function invokePiSubagent(pi: ExtensionAPI, config: AgentConfig, directive: RepairDirective) {
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

  try {
    // Use pi's built-in subagent execution (equivalent to `pi --print`)
    await pi.callTool('bash', {
      command: 'pi',
      args: [
        '--provider', 'llamacpp',
        '--model', 'google_gemma-4-E4B-it',
        '--print',
        '--',
        prompt.trim(),
      ],
      timeout: 30_000,
    });
    pi_log('[steer] Repair subagent invoked for: ' + directive.pillars.join(', '));
  } catch (err) {
    pi_log('[steer] Repair failed: ' + String(err));
  }
}

// Simple logger
function pi_log(msg: string) {
  console.log('[pillar-helper] ' + msg);
}
