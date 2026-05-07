#!/bin/bash
# Silently logs a summary of changed files to rift-context.md on agent stop.
# Returns {} so no followup message appears in chat.

CONTEXT_FILE=".cursor/rules/rift-context.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo '{}'
  exit 0
fi

CHANGED=$(git diff --name-only HEAD 2>/dev/null)
STAGED=$(git diff --cached --name-only 2>/dev/null)
ALL_CHANGED=$(printf '%s\n%s' "$CHANGED" "$STAGED" | sort -u | grep -v '^$' | grep -v 'rift-context.md')

if [ -z "$ALL_CHANGED" ]; then
  echo '{}'
  exit 0
fi

TIMESTAMP=$(date '+%B %-d, %Y — %-I:%M %p')
FILE_COUNT=$(echo "$ALL_CHANGED" | wc -l | tr -d ' ')
FILE_LIST=$(echo "$ALL_CHANGED" | head -8 | sed 's/^/- /')

if [ "$FILE_COUNT" -gt 8 ]; then
  FILE_LIST="$FILE_LIST
- ...and $((FILE_COUNT - 8)) more files"
fi

printf '\n## [Mac] %s\nLocal Cursor session — %s file(s) touched:\n%s\n' \
  "$TIMESTAMP" "$FILE_COUNT" "$FILE_LIST" >> "$CONTEXT_FILE"

echo '{}'
exit 0
