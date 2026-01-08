#!/bin/bash
set -e

# Autonomous Agent - Single Run Test Mode
# Runs one iteration to test behavior before running AFK mode

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Autonomous Agent (Test Mode - Single Run)"
echo "📁 Working directory: $SCRIPT_DIR"
echo ""
echo "═══════════════════════════════════════"
echo "         Running Single Iteration"
echo "═══════════════════════════════════════"
echo ""

# Pipe prompt into Claude Code with --print for non-interactive output
# Output streams directly to terminal so you can see progress
cat "$SCRIPT_DIR/prompt.md" \
  | claude --dangerously-skip-permissions --print 2>&1 \
  | tee "$SCRIPT_DIR/last-run.log" || true

OUTPUT="check last-run.log"

echo ""
echo "═══════════════════════════════════════"

# Check for completion signal
if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
  echo "✅ Agent signaled completion"
  echo "💡 All tasks may be done - check prd.json"
else
  echo "▶️  Agent completed one iteration"
  echo "💡 More work remains - review progress.txt"
  echo "🚀 Ready for AFK mode: ./autonomous.sh"
fi

echo ""
exit 0
