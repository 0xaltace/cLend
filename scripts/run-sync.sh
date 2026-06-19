#!/usr/bin/env bash
# Rate-sync keeper. Runs from the main wallet (POPULATE_MNEMONIC account 0) via
# the Alchemy backend RPC. Loops until you Ctrl+C.
#
# Usage:
#   bash scripts/run-sync.sh           # default: every 5 min (300s)
#   bash scripts/run-sync.sh 300       # every 5 minutes (testing)
#   bash scripts/run-sync.sh 3600      # every hour (low-cost, post-test)
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh" 2>/dev/null
# Never block on Hardhat's interactive telemetry consent prompt.
export HARDHAT_DISABLE_TELEMETRY_PROMPT=true
cd "$(dirname "$0")/.."
INTERVAL="${1:-300}"
echo "keeper syncing every ${INTERVAL}s — Ctrl+C to stop"
npx hardhat --network sepolia clend:keeper --interval "$INTERVAL"
