#!/bin/bash
# Knowledge Base Organizer - File Operation Hook
#
# This hook is triggered after file operations to log organization activities.
# It creates an audit trail of all file movements for potential undo operations.
#
# Environment variables available:
#   FILE_PATH   - Path to the file being operated on
#   PROJECT_DIR - Root directory of the project
#   OPERATION   - Type of operation (write, move, etc.)

LOG_FILE="/home/user/agent/.claude/organize-log.jsonl"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Log the operation
if [[ -n "$FILE_PATH" ]]; then
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Get file info
    if [[ -f "$FILE_PATH" ]]; then
        FILE_SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null || echo "0")
        FILE_TYPE=$(file -b --mime-type "$FILE_PATH" 2>/dev/null || echo "unknown")
    else
        FILE_SIZE=0
        FILE_TYPE="unknown"
    fi

    # Create JSON log entry
    cat >> "$LOG_FILE" << EOF
{"timestamp":"$TIMESTAMP","operation":"${OPERATION:-file_write}","path":"$FILE_PATH","size":$FILE_SIZE,"type":"$FILE_TYPE"}
EOF

    echo "Logged: $FILE_PATH"
fi

# Optional: Notify about organization patterns
if [[ "$FILE_PATH" == *.md ]] || [[ "$FILE_PATH" == *.txt ]]; then
    echo "Tip: Consider using /organize to group similar documents"
fi
