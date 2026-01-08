#!/bin/bash
set -e

# Autonomous Agent - AFK Multi-Iteration Mode
# Runs Claude Code in a loop until all tasks complete or max iterations reached

MAX_ITERATIONS=${1:-25}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🤖 Starting Autonomous Agent (AFK Mode)"
echo "📊 Max iterations: $MAX_ITERATIONS"
echo "📁 Working directory: $SCRIPT_DIR"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo "═══════════════════════════════════════"
  echo "    Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════"
  echo ""

  # Pipe prompt into Claude Code with --print for visible output
  LOG_FILE="$SCRIPT_DIR/iteration-$i.log"
  cat "$SCRIPT_DIR/prompt.md" \
    | claude --dangerously-skip-permissions --print 2>&1 \
    | tee "$LOG_FILE" || true

  OUTPUT=$(cat "$LOG_FILE")

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "✅ All tasks complete!"
    echo "🎉 Autonomous agent finished successfully"
    exit 0
  fi

  echo ""
  echo "⏳ Waiting 3 seconds before next iteration..."
  sleep 3
done

echo ""
echo "⚠️  Maximum iterations ($MAX_ITERATIONS) reached"
echo "📝 Check progress.txt for status"
echo "💡 Run with higher limit: ./autonomous.sh 50"
exit 1
