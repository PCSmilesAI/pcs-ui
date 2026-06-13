#!/bin/bash
# Posts a summary update to Rift when a Cursor agent session ends.
# Reads .cursor/rift-project.json from the workspace root for config.
# Uses summarize-transcript.py to extract a chat-based summary.
# Falls back to git-diff summary if no transcript is available.
# Returns {} so no followup message appears in chat.

CONFIG_FILE=".cursor/rift-project.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo '{}'
  exit 0
fi

PROJECT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['projectId'])" 2>/dev/null)
CHAT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['chatId'])" 2>/dev/null)
SERVER=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('server', 'http://107.170.25.126:3001'))" 2>/dev/null)

if [ -z "$PROJECT_ID" ] || [ -z "$CHAT_ID" ]; then
  echo '{}'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUMMARIZER="$SCRIPT_DIR/summarize-transcript.py"

SUMMARY=""

if [ -f "$SUMMARIZER" ]; then
  SUMMARY=$(python3 "$SUMMARIZER" "$PWD" 2>/dev/null)
fi

# Fallback: git-diff based summary
if [ -z "$SUMMARY" ]; then
  CHANGED=$(git diff --name-only HEAD 2>/dev/null)
  STAGED=$(git diff --cached --name-only 2>/dev/null)
  RECENT_COMMIT_MSG=$(git log -1 --format='%s' --since='5 minutes ago' 2>/dev/null)

  ALL_CHANGED=$(printf '%s\n%s' "$CHANGED" "$STAGED" | sort -u | grep -v '^$' \
    | grep -v '\.DS_Store' \
    | grep -v 'xcuserstate' \
    | grep -v 'rift-project\.json' \
    | grep -v 'rift-context\.md')

  FILE_COUNT=$(echo "$ALL_CHANGED" | grep -c -v '^$' 2>/dev/null || echo "0")

  if [ "$FILE_COUNT" -eq 0 ] && [ -z "$RECENT_COMMIT_MSG" ]; then
    echo '{}'
    exit 0
  fi

  if [ -n "$RECENT_COMMIT_MSG" ]; then
    SUMMARY="$RECENT_COMMIT_MSG"
  elif [ "$FILE_COUNT" -eq 1 ]; then
    FILENAME=$(echo "$ALL_CHANGED" | head -1 | xargs basename)
    SUMMARY="Updated $FILENAME"
  elif [ "$FILE_COUNT" -le 3 ]; then
    FILES=$(echo "$ALL_CHANGED" | xargs -I{} basename {} | paste -sd', ' -)
    SUMMARY="Updated $FILES"
  else
    TOP_DIR=$(echo "$ALL_CHANGED" | head -1 | rev | cut -d'/' -f2- | rev)
    SUMMARY="Modified $FILE_COUNT files in $TOP_DIR"
  fi
fi

if [ -z "$SUMMARY" ]; then
  echo '{}'
  exit 0
fi

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'summary': sys.argv[1], 'source': 'cursor'}))" "$SUMMARY" 2>/dev/null)

if [ -n "$PAYLOAD" ]; then
  curl -s -X POST "$SERVER/api/v1/projects/$PROJECT_ID/updates" \
    -H "Content-Type: application/json" \
    -H "X-Chat-ID: $CHAT_ID" \
    -d "$PAYLOAD" \
    > /dev/null 2>&1
fi

echo '{}'
exit 0
