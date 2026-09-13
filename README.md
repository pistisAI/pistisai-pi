# Pi 4-Pillar Agent Helper

Pi extension that monitors, scores, and steers any agent using the 4-pillar framework (Aiman/Aigent/Aidration/Aimotions).

## Setup (first time)

1. **Run the setup script** (interactive):
   ```bash
   ./setup.sh
   ```
   - Enter your agent name (default: `pistisai`)
   - Confirm the choice
   - The script will:
     * Set up the configuration file (`config.yaml`)
     * Install dependencies (if needed)
     * Compile the extension to `./dist/`

2. **Run the agent**:
   ```bash
   ./run.sh
   ```

## Configuration

See `config.yaml` for:
- `agent_name`: The name of the agent you're monitoring
- `focus_threshold`: Minimum focus score before auto-repair (default: 0.5)
- `mesh_topic`: A2A mesh topic for pillar events (default: `pistisai/focus`)
- `session_dir`: Directory for session persistence (default: `./pi-sessions`)

## Tools

- `pillar_status` - Show current 4-pillar focus state
- `compute_focus_score` - Calculate focus score and detect drift
- `reset_focus` - Reset all pillar states to healthy

## Integration

Later, you can import this into `pistisai-app` via a `pi_adapter.dart` that connects to the same Bionic backend.