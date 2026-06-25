#!/bin/bash
# Starts both the config-monitor server and portal dev server.
# Prerequisites: connect-db.sh must already be running with the tunnel open.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[config-monitor] Starting backend on :3001 ..."
cd "$SCRIPT_DIR/server" && node index.js &
SERVER_PID=$!

echo "[config-monitor] Starting portal on :3000 ..."
cd "$SCRIPT_DIR/portal" && npm run dev &
PORTAL_PID=$!

trap "kill $SERVER_PID $PORTAL_PID 2>/dev/null; echo 'Stopped.'" EXIT INT TERM

echo ""
echo "  Backend:  http://localhost:3001"
echo "  Portal:   http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both."
wait
