#!/usr/bin/env python3
"""
render_report.py - Generate markdown reports from buildlog.json.

Produces:
  build_audit/reports/build_timeline.md   - chronological event log
  build_audit/reports/course_outline.md   - inferred lessons and phases
"""

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
LOG_FILE = REPO_ROOT / "build_audit" / "buildlog.json"
REPORTS_DIR = REPO_ROOT / "build_audit" / "reports"


def _load_log() -> dict | None:
    if not LOG_FILE.exists():
        return None
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading log: {e}", file=sys.stderr)
        return None


def _fmt_ts(iso_str: str | None) -> str:
    if not iso_str:
        return "unknown time"
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, TypeError):
        return iso_str


def _short_ts(iso_str: str | None) -> str:
    if not iso_str:
        return "??:??"
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%H:%M:%S")
    except (ValueError, TypeError):
        return iso_str


def _summarize_entry(entry: dict) -> str:
    """Build a one-line summary of what this entry represents."""
    event = entry.get("event_type", "unknown")

    if event == "beforeSubmitPrompt":
        prompt = entry.get("user_prompt", "")
        if prompt:
            preview = (prompt[:80] + "...") if len(prompt) > 80 else prompt
            return f"Prompt: {preview}"
        return "Prompt submitted"

    if event == "beforeShellExecution":
        cmd = entry.get("shell_command", "")
        if cmd:
            preview = (cmd[:100] + "...") if len(cmd) > 100 else cmd
            return f"Shell: `{preview}`"
        return "Shell command"

    if event == "afterShellExecution":
        cmd = entry.get("shell_command", "")
        exit_code = entry.get("exit_code")
        preview = (cmd[:80] + "...") if len(cmd) > 80 else cmd
        code_str = f" (exit {exit_code})" if exit_code is not None else ""
        output = entry.get("shell_output_summary", "")
        if preview:
            return f"Shell done: `{preview}`{code_str}"
        return f"Shell completed{code_str}"

    if event == "afterFileEdit":
        files = entry.get("files_touched", [])
        summary = entry.get("agent_response_summary", "")
        if files:
            return f"Edited: {', '.join(files[:3])}" + (f" (+{len(files)-3} more)" if len(files) > 3 else "")
        if summary:
            return f"Edit: {summary[:80]}"
        return "File edited"

    if event == "beforeMCPExecution":
        tool = entry.get("tool_name", "unknown tool")
        return f"MCP tool: {tool}"

    if event == "afterMCPExecution":
        tool = entry.get("tool_name", "unknown tool")
        duration = entry.get("duration_ms")
        dur_str = f" ({duration}ms)" if duration is not None else ""
        return f"MCP done: {tool}{dur_str}"

    if event == "afterAgentResponse":
        text = entry.get("agent_response_text") or entry.get("agent_response_summary", "")
        if text:
            preview = (text[:100] + "...") if len(text) > 100 else text
            return f"Response: {preview}"
        return "Agent response"

    if event == "afterAgentThought":
        text = entry.get("agent_response_text") or entry.get("agent_response_summary", "")
        duration = entry.get("duration_ms")
        dur_str = f" ({duration}ms)" if duration is not None else ""
        if text:
            preview = (text[:100] + "...") if len(text) > 100 else text
            return f"Thinking{dur_str}: {preview}"
        return f"Agent thinking{dur_str}"

    if event == "sessionStart":
        return "Session started"

    if event == "sessionEnd":
        return "Session ended"

    if event == "preCompact":
        return "Context compaction pending"

    if event == "stop":
        status = entry.get("status", "unknown")
        return f"Task {status}"

    return f"{event}"


def render_timeline(log_data: dict) -> str:
    """Generate a chronological build timeline in markdown."""
    entries = log_data.get("entries", [])
    project = log_data.get("project_name", "Unknown Project")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        f"# Build Timeline: {project}",
        "",
        f"Generated: {now}",
        f"Total events: {len(entries)}",
        "",
        "---",
        "",
    ]

    if not entries:
        lines.append("_No entries recorded yet._")
        return "\n".join(lines)

    # Group by conversation
    conversations: dict[str | None, list[dict]] = defaultdict(list)
    for entry in entries:
        cid = entry.get("conversation_id")
        conversations[cid].append(entry)

    conv_num = 0
    for cid, conv_entries in conversations.items():
        conv_num += 1
        conv_label = f"Session {conv_num}" + (f" (`{cid[:8]}...`)" if cid else "")
        lines.append(f"## {conv_label}")
        lines.append("")

        for entry in conv_entries:
            ts = _short_ts(entry.get("timestamp"))
            event = entry.get("event_type", "unknown")
            summary = _summarize_entry(entry)
            files = entry.get("files_touched", [])

            lines.append(f"- **{ts}** [{event}] {summary}")

            if files:
                for f in files[:5]:
                    lines.append(f"  - `{f}`")
                if len(files) > 5:
                    lines.append(f"  - _+{len(files) - 5} more files_")

        lines.append("")

    return "\n".join(lines)


def _infer_phases(entries: list[dict]) -> list[dict]:
    """Group entries into phases using stop events as phase boundaries."""
    phases = []
    current_phase: list[dict] = []
    phase_num = 0

    for entry in entries:
        current_phase.append(entry)
        if entry.get("event_type") == "stop":
            phase_num += 1
            start_ts = current_phase[0].get("timestamp", "")
            end_ts = current_phase[-1].get("timestamp", "")

            files_in_phase = set()
            prompts = []
            commands = []
            tools = []

            for e in current_phase:
                files_in_phase.update(e.get("files_touched", []))
                if e.get("user_prompt"):
                    prompts.append(e["user_prompt"])
                if e.get("shell_command"):
                    commands.append(e["shell_command"])
                if e.get("tool_name"):
                    tools.append(e["tool_name"])

            phases.append({
                "phase_num": phase_num,
                "start": start_ts,
                "end": end_ts,
                "entry_count": len(current_phase),
                "files": sorted(files_in_phase),
                "prompts": prompts,
                "commands": commands,
                "tools": tools,
                "status": current_phase[-1].get("status", "unknown"),
            })
            current_phase = []

    # Remaining entries without a stop event
    if current_phase:
        phase_num += 1
        phases.append({
            "phase_num": phase_num,
            "start": current_phase[0].get("timestamp", ""),
            "end": current_phase[-1].get("timestamp", ""),
            "entry_count": len(current_phase),
            "files": sorted({f for e in current_phase for f in e.get("files_touched", [])}),
            "prompts": [e["user_prompt"] for e in current_phase if e.get("user_prompt")],
            "commands": [e["shell_command"] for e in current_phase if e.get("shell_command")],
            "tools": [e["tool_name"] for e in current_phase if e.get("tool_name")],
            "status": "in_progress",
        })

    return phases


def _detect_patterns(entries: list[dict]) -> list[str]:
    """Detect repeated patterns in the build log."""
    patterns = []

    event_counts: dict[str, int] = defaultdict(int)
    for e in entries:
        event_counts[e.get("event_type", "unknown")] += 1

    if event_counts.get("afterFileEdit", 0) > 5:
        patterns.append(f"Heavy file editing ({event_counts['afterFileEdit']} edits) - iterative development pattern")

    shell_total = event_counts.get("beforeShellExecution", 0) + event_counts.get("afterShellExecution", 0)
    if shell_total > 5:
        patterns.append(f"Frequent shell usage ({shell_total} shell events) - build/test cycle pattern")

    mcp_total = event_counts.get("beforeMCPExecution", 0) + event_counts.get("afterMCPExecution", 0)
    if mcp_total > 3:
        patterns.append(f"MCP tool integration ({mcp_total} MCP events) - external tool pattern")

    shell_failures = sum(
        1 for e in entries
        if e.get("event_type") == "afterShellExecution" and e.get("exit_code", 0) != 0
    )
    if shell_failures > 0:
        patterns.append(f"Shell failures ({shell_failures} non-zero exits) - debugging iteration present")

    response_count = event_counts.get("afterAgentResponse", 0)
    thought_count = event_counts.get("afterAgentThought", 0)
    if thought_count > 0:
        patterns.append(f"Reasoning captured ({thought_count} thinking blocks, {response_count} responses)")
    elif response_count > 5:
        patterns.append(f"Active agent dialogue ({response_count} responses captured)")

    compact_count = event_counts.get("preCompact", 0)
    if compact_count > 0:
        patterns.append(f"Context compactions ({compact_count}) - long or complex session")

    stop_statuses = [e.get("status") for e in entries if e.get("event_type") == "stop"]
    error_count = sum(1 for s in stop_statuses if s == "error")
    if error_count > 0:
        patterns.append(f"Error recovery ({error_count} errors) - debugging and fix cycles present")

    return patterns


def render_course_outline(log_data: dict) -> str:
    """Generate a course outline inferred from the build log."""
    entries = log_data.get("entries", [])
    project = log_data.get("project_name", "Unknown Project")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        f"# Course Outline: {project}",
        "",
        f"Generated: {now}",
        "",
        "---",
        "",
        "## Project Purpose",
        "",
        f"This course is derived from the build log of **{project}**.",
        "Each lesson corresponds to a distinct build phase captured during development.",
        "",
    ]

    if not entries:
        lines.append("_No build data available yet. Run some work sessions first._")
        return "\n".join(lines)

    phases = _infer_phases(entries)
    patterns = _detect_patterns(entries)

    # Major build phases
    lines.append("## Build Phases")
    lines.append("")
    for phase in phases:
        status_icon = "completed" if phase["status"] == "completed" else phase["status"]
        lines.append(f"### Phase {phase['phase_num']} ({status_icon})")
        lines.append("")
        lines.append(f"- **Period**: {_fmt_ts(phase['start'])} to {_fmt_ts(phase['end'])}")
        lines.append(f"- **Events**: {phase['entry_count']}")

        if phase["files"]:
            lines.append(f"- **Files**: {', '.join(f'`{f}`' for f in phase['files'][:5])}")
            if len(phase["files"]) > 5:
                lines.append(f"  - _+{len(phase['files']) - 5} more_")

        if phase["prompts"]:
            lines.append("- **Key prompts**:")
            for p in phase["prompts"][:3]:
                preview = (p[:80] + "...") if len(p) > 80 else p
                lines.append(f"  - {preview}")

        lines.append("")

    # Teachable milestones
    lines.append("## Teachable Milestones")
    lines.append("")
    for phase in phases:
        if phase["status"] == "completed":
            lines.append(f"- **Phase {phase['phase_num']}**: {phase['entry_count']} steps across {len(phase['files'])} files")
    lines.append("")

    # Patterns
    if patterns:
        lines.append("## Observed Patterns")
        lines.append("")
        for p in patterns:
            lines.append(f"- {p}")
        lines.append("")

    # Suggested lesson breakdown
    lines.append("## Suggested Lesson Breakdown")
    lines.append("")
    for phase in phases:
        lines.append(f"### Lesson {phase['phase_num']}")
        lines.append("")

        if phase["prompts"]:
            lines.append(f"**Topic**: Based on prompt: _{phase['prompts'][0][:60]}_")
        else:
            lines.append(f"**Topic**: Build phase {phase['phase_num']}")

        lines.append(f"**Scope**: {phase['entry_count']} events, {len(phase['files'])} files")

        if phase["commands"]:
            lines.append("**Commands demonstrated**:")
            for cmd in phase["commands"][:3]:
                lines.append(f"  - `{cmd[:80]}`")

        lines.append("")

    # Mistakes and refinements
    error_entries = [e for e in entries if e.get("status") == "error"]
    if error_entries:
        lines.append("## Mistakes and Refinements")
        lines.append("")
        lines.append("The following error events were captured and can be used as teaching moments:")
        lines.append("")
        for e in error_entries[:10]:
            ts = _fmt_ts(e.get("timestamp"))
            summary = _summarize_entry(e)
            lines.append(f"- [{ts}] {summary}")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    log_data = _load_log()
    if log_data is None:
        print("No buildlog.json found. Run init_buildlog.py first.", file=sys.stderr)
        sys.exit(1)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    timeline_path = REPORTS_DIR / "build_timeline.md"
    timeline_content = render_timeline(log_data)
    timeline_path.write_text(timeline_content, encoding="utf-8")
    print(f"Generated: {timeline_path}")

    course_path = REPORTS_DIR / "course_outline.md"
    course_content = render_course_outline(log_data)
    course_path.write_text(course_content, encoding="utf-8")
    print(f"Generated: {course_path}")


if __name__ == "__main__":
    main()
