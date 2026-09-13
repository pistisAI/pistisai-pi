#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=== Pi 4-Pillar Agent Helper ==="

# Load agent_name from config.yaml
AGENT_NAME=$(grep '^agent_name:' config.yaml | cut -d' ' -f2)

# Ensure build is up to date
if [ ! -f "dist/extensions/pillar-helper.js" ]; then
  echo "No compiled extension found. Running setup..."
  ./setup.sh
fi

echo "Agent name: $AGENT_NAME"
echo "Starting Pi 4-pillar helper (press Ctrl+C to stop)..."

# Start Pi with the compiled extension
# Uses Pi's default provider (set in ~/.pi/agent/settings.json)
# For local Bionic inference, set OPENAI_API_KEY and AZURE_OPENAI_BASE_URL env vars manually
exec pi \
  --provider openai \
  --model gemma-4-E4B-it \
  --mode rpc \
  --extension ./dist/extensions/pillar-helper.js \
  --session-dir ./pi-sessions
