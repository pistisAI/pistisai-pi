"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = pillarHelper;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
const CONFIG_PATH = (0, path_1.join)(process.cwd(), 'config.yaml');
const DB_PATH = (0, path_1.join)(process.cwd(), 'focus_tracker.db');
const WATCHDOG_PID_FILE = (0, path_1.join)(process.cwd(), 'watchdog.pid');
const WATCHDOG_SCRIPT_PATH = (0, path_1.join)(process.cwd(), 'dist', 'src', 'watchdog.js'); // compiled watchdog
function loadConfig() {
    const configContent = (0, fs_1.readFileSync)(CONFIG_PATH, 'utf8');
    const config = {
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
            case 'agent_name':
                config.agent_name = val;
                break;
            case 'agent_id':
                config.agent_id = val;
                break;
            case 'focus_threshold':
                config.focus_threshold = parseFloat(val);
                break;
            case 'mesh_topic':
                config.mesh_topic = val;
                break;
            case 'session_dir':
                config.session_dir = val;
                break;
        }
    }
    return config;
}
function pillarHelper(pi) {
    const config = loadConfig();
    const focusTracker = new FocusTracker(DB_PATH);
    const meshClient = new A2AMeshClient(config.mesh_topic);
    // Initialize default pillar states
    const pillars = {
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
        parameters: { detail: { type: 'boolean', description: 'Include per-pillar issues', default: true } },
        async execute(_id, params) {
            const snapshot = JSON.parse(JSON.stringify(pillars));
            if (!params.detail) {
                for (const p of Object.values(snapshot))
                    p.issues = [];
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
            const recent = await focusTracker.getRecentEvents(60000); // last 60s
            const scores = computePillarScores(recent, config);
            for (const p of ['aiman', 'aigent', 'aidration', 'aimotions']) {
                pillars[p].focus = scores[p].focus;
                pillars[p].drift = scores[p].drift;
                pillars[p].issues = scores[p].issues;
                pillars[p].lastChecked = new Date().toISOString();
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
    // === TOOL: Start watchdog ===
    pi.registerTool({
        name: 'watcher_start',
        label: 'Start Watchdog',
        description: 'Start the Pi watchdog (runs in background)',
        async execute(_id) {
            try {
                const distDir = (0, path_1.join)(process.cwd(), 'dist');
                if (!(0, fs_1.existsSync)(distDir)) {
                    (0, fs_1.mkdirSync)(distDir, { recursive: true });
                }
                // Compile watchdog if needed (we assume it's already compiled)
                // Compile watchdog if needed (we assume it's already compiled)
                // Start the watchdog as a background process
                const watchdogPath = WATCHDOG_SCRIPT_PATH;
                if (!(0, fs_1.existsSync)(watchdogPath)) {
                    throw new Error('Watchdog script not found at ' + watchdogPath);
                }
                // Start the watchdog in the background
                const child = (0, child_process_1.spawn)('node', [watchdogPath], {
                    detached: true,
                    stdio: 'ignore',
                });
                // Save the PID to a file
                const pid = child.pid;
                (0, fs_1.writeFileSync)(WATCHDOG_PID_FILE, String(pid), 'utf8');
                pi_log(`[watcher] Started watchdog (PID ${pid})`);
                return { content: [{ type: 'text', text: `Watchdog started with PID ${pid}` }] };
            }
            catch (e) {
                return { content: [{ type: 'text', text: `Failed to start watchdog: ${e.message}` }] };
            }
        },
    });
    // === TOOL: Stop watchdog ===
    pi.registerTool({
        name: 'watcher_stop',
        label: 'Stop Watchdog',
        description: `Stop the Pi watchdog (if running)`,
        async execute(_id) {
            if (!(0, fs_1.existsSync)(WATCHDOG_PID_FILE)) {
                return { content: [{ type: 'text', text: 'Watchdog not running.' }] };
            }
            const pid = parseInt((0, fs_1.readFileSync)(WATCHDOG_PID_FILE, 'utf8'), 10);
            try {
                process.kill(pid, 'SIGTERM');
                await new Promise(resolve => setTimeout(resolve, 1000));
                (0, fs_1.unlinkSync)(WATCHDOG_PID_FILE);
                pi_log(`[watcher] Stopped watchdog (PID ${pid})`);
                return { content: [{ type: 'text', text: 'Watchdog stopped.' }] };
            }
            catch (e) {
                return { content: [{ type: 'text', text: 'Failed to stop watchdog: ' + (e?.message || String(e)) }] };
            }
        },
    });
    // === TOOL: Watchdog status ===
    pi.registerTool({
        name: 'watcher_status',
        label: 'Watchdog Status',
        description: `Check if the Pi watchdog is currently running`,
        async execute(_id) {
            if ((0, fs_1.existsSync)(WATCHDOG_PID_FILE)) {
                const pid = (0, fs_1.readFileSync)(WATCHDOG_PID_FILE, 'utf8').trim();
                const status = await new Promise((resolve) => {
                    const child = (0, child_process_1.spawn)('ps', ['-p', pid, '-o', 'status=']);
                    let output = '';
                    child.stdout.on('data', (data) => { output += data; });
                    child.on('close', () => resolve(output.trim()));
                });
                return { content: [{ type: 'text', text: `Watchdog PID: ${pid}, Status: ${status}` }] };
            }
            else {
                return { content: [{ type: 'text', text: 'Watchdog not running.' }] };
            }
        },
    });
    // Watchdog self-management tools register above
}
// ============================================================
// Focus Tracker — persists events and pillar states to SQLite
// ============================================================
class FocusTracker {
    constructor(dbPath) {
        // Real impl uses sqlite3 module
        if (!(0, fs_1.existsSync)(dbPath)) {
            // Create stub DB file (in actual deployment, init SQLite schema)
            (0, fs_1.writeFileSync)(dbPath, '');
        }
        this.db = { path: dbPath, initialized: true };
        pi_log(`FocusTracker initialized at ${dbPath}`);
    }
    async logEvent(type, payload, agent_name) {
        // INSERT INTO events (timestamp, event_type, payload, agent_id)
        pi_log(`[evt] ${type} | ${agent_name}`);
        // Placeholder for actual SQLite write
    }
    async getRecentEvents(since_ms) {
        // SELECT * FROM events WHERE timestamp > ?
        return []; // Placeholder — replaced by real query in prod
    }
    async updatePillarState(agent_name, pillar, state) {
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
    constructor(topic) {
        this.topic = topic;
        pi_log('[A2A] Mesh client initialized for topic: ' + topic);
    }
    async publish(message) {
        // Uses @bacnh85/pi-a2a extension under the hood
        pi_log('[A2A] Published: ' + JSON.stringify(message).slice(0, 200));
    }
    async subscribe(handler) {
        pi_log('[A2A] Subscribed to topic: ' + this.topic);
        // Handle incoming mesh messages
    }
}
// ============================================================
// Pillar Scoring Logic — maps events to 4 pillars
// ============================================================
function computePillarScores(events, config) {
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
function selectRepairDirective(pillars) {
    const drifted = Object.entries(pillars)
        .filter(([_, s]) => s.drift > 0.5)
        .map(([p, _]) => p);
    // Default repair: reset agent session + re-apply persona
    return {
        action: 'reset-session-with-persona',
        pillars: drifted.length > 0 ? drifted : ['aigent'],
        params: {
            reset_memory: true,
            reapply_traits: true,
            reset_idle_timeout: 300000, // 5 min
        },
    };
}
// ============================================================
// Pi Subagent Invocation — delegates repair to Pi headless mode
// ============================================================
async function invokePiSubagent(pi, config, directive) {
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
            timeout: 30000,
        });
        pi_log('[steer] Repair subagent invoked for: ' + directive.pillars.join(', '));
    }
    catch (err) {
        pi_log('[steer] Repair failed: ' + String(err));
    }
}
// Simple logger
function pi_log(msg) {
    console.log('[pillar-helper] ' + msg);
}
