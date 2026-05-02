#!/bin/bash
CONTEXT_FILE=".cursor/rules/rift-context.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo '{}'
  exit 0
fi

TIMESTAMP=$(date '+%B %-d, %Y — %-I:%M %p')

cat <<EOF
{
  "followup_message": "Before finishing: append a brief summary of what was discussed or changed in this session to the file .cursor/rules/rift-context.md. Use this exact format, appended at the end of the file:\n\n## [Mac] ${TIMESTAMP}\n<2-4 sentence summary of what was done>\n\nDo NOT remove existing entries. If nothing meaningful was done (e.g. just a quick question), skip this step."
}
EOF
exit 0
