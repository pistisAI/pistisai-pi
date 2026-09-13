#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=== Pi 4-Pillar Agent Helper Setup ==="
echo ""

# --- Ask for agent name ---
echo "Configuring the agent name (used for monitoring, mesh topic, and IDs)"
echo "Press Enter to accept the default 'pistisai'"
read -p "Agent name [pistisai]: " AGENT_NAME_INPUT

AGENT_NAME="${AGENT_NAME_INPUT:-pistisai}"

# Confirm
echo ""
echo "You chose: $AGENT_NAME"
read -p "Is this correct? [Y/n] " CONFIRM
CONFIRM="${CONFIRM:-Y}"

if [ "$CONFIRM" != "Y" ] && [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "" ]; then
  echo "Aborted."
  exit 1
fi

# Update config.yaml
echo ""
echo "Updating config.yaml..."
# Replace agent_name and mesh_topic values using sed (portable approach)
sed -i.bak "s/^agent_name: .*/agent_name: ${AGENT_NAME}/" config.yaml
sed -i.bak "s/^agent_id: .*/agent_id: ${AGENT_NAME}-agent-001/" config.yaml
sed -i.bak "s/^mesh_topic: .*/mesh_topic: ${AGENT_NAME}\/focus/" config.yaml
rm -f config.yaml.bak

echo "✓ config.yaml updated (agent_name=$AGENT_NAME)"

# Install deps if missing
if [ ! -d "node_modules" ]; then
  echo ""
  echo "Installing Node dependencies..."
  npm install
else
  echo ""
  echo "✓ Dependencies already installed"
fi

# Build
echo ""
echo "Compiling TypeScript..."
npm run build
echo "✓ Build complete: ./dist/extensions/pillar-helper.js"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To run:"
echo "  ./run.sh"
echo ""
echo "To test the extension manually:"
echo "  pi --extension ./dist/extensions/pillar-helper.js --print 'pillar_status'"
