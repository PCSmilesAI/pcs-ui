#!/usr/bin/env python3
"""
append_log.py - Core BuildLog logger (full capture mode).

Called by Cursor lifecycle hooks. Reads JSON from stdin, enriches with git
state, and atomically appends an entry to build_audit/buildlog.json.

Full capture mode: NO truncation. Every payload field is stored in its
entirety. The log file will grow large -- this is intentional.

For beforeShellExecution and beforeMCPExecution hooks, prints a permission
response to stdout so the hook does not block the agent.

Can also be invoked manually with --event-type and --data CLI args for testing.
"""

import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
LOG_DIR = REPO_ROOT / "build_audit"
LOG_FILE = LOG_DIR / "buildlog.json"

BUILDLOG_VERSION = "2.0"
PROJECT_NAME = REPO_ROOT.name

PERMISSION_EVENTS = {"beforeShellExecution", "beforeMCPExecution"}

SHELL_EVENTS = {"beforeShellExecution", "afterShellExecution"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_entry_id() -> str:
    return str(uuid.uuid4())


def _safe_json_str(obj) -> str | None:
    """Convert an object to a JSON string for storage."""
    if obj is None:
        return None
    try:
        return json.dumps(obj, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(obj)


def _load_log() -> dict:
    """Load existing buildlog.json or create a fresh structure."""
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "entries" in data:
                return data
        except (json.JSONDecodeError, OSError):
            pass

    return {
        "buildlog_version": BUILDLOG_VERSION,
        "project_name": PROJECT_NAME,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "entries": [],
    }


def _save_log(data: dict) -> None:
    """Atomically write log data: write to temp file, then replace."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = _now_iso()

    fd, tmp_path = tempfile.mkstemp(
        dir=str(LOG_DIR), suffix=".tmp", prefix="buildlog_"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            f.write("\n")
        os.replace(tmp_path, str(LOG_FILE))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _read_stdin() -> dict | None:
    """Read JSON from stdin. Returns None if stdin is empty or not JSON."""
    if sys.stdin.isatty():
        return None
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return None
        return json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return None


def _parse_cli_args() -> dict | None:
    """Fallback: parse --event-type and --data CLI args for manual invocation."""
    event_type = None
    data_str = None
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--event-type" and i + 1 < len(args):
            event_type = args[i + 1]
            i += 2
        elif args[i] == "--data" and i + 1 < len(args):
            data_str = args[i + 1]
            i += 2
        else:
            i += 1

    if event_type:
        payload = {}
        if data_str:
            try:
                payload = json.loads(data_str)
            except json.JSONDecodeError:
                payload = {"raw": data_str}
        payload.setdefault("hook_event_name", event_type)
        return payload
    return None


def _extract_files_touched(payload: dict) -> list[str]:
    """Extract file paths from the hook payload depending on event type."""
    files = []

    file_path = payload.get("file_path")
    if file_path:
        files.append(file_path)

    attachments = payload.get("attachments", [])
    if isinstance(attachments, list):
        for att in attachments:
            if isinstance(att, dict) and att.get("file_path"):
                files.append(att["file_path"])

    return sorted(set(files))


def _summarize_edits(payload: dict) -> str | None:
    """For afterFileEdit, build a brief summary of what changed."""
    edits = payload.get("edits", [])
    if not isinstance(edits, list) or not edits:
        return None
    parts = []
    for edit in edits[:5]:
        old = edit.get("old_string", "")
        new = edit.get("new_string", "")
        old_preview = (old[:60] + "...") if len(old) > 60 else old
        new_preview = (new[:60] + "...") if len(new) > 60 else new
        parts.append(f"'{old_preview}' -> '{new_preview}'")
    summary = "; ".join(parts)
    if len(edits) > 5:
        summary += f" (+{len(edits) - 5} more edits)"
    return summary


def _summarize_shell_output(payload: dict) -> str | None:
    """For afterShellExecution, build a summary of the command result.

    Real Cursor payloads use a single 'output' field (combined stdout/stderr),
    not separate 'stdout'/'stderr'. We check both patterns defensively.
    """
    output = payload.get("output", "") or ""
    if not output:
        stdout = payload.get("stdout", "") or ""
        stderr = payload.get("stderr", "") or ""
        output = (stdout + "\n" + stderr).strip()

    exit_code = payload.get("exit_code")

    parts = []
    if exit_code is not None:
        parts.append(f"exit={exit_code}")
    if output.strip():
        preview = output.strip()[:400]
        if len(output.strip()) > 400:
            preview += "..."
        parts.append(preview)

    return "; ".join(parts) if parts else None


def _summarize_mcp_result(payload: dict) -> str | None:
    """For afterMCPExecution, summarize the tool result."""
    tool_name = payload.get("tool_name", "unknown")
    tool_result = payload.get("tool_result")
    duration = payload.get("duration")

    parts = [f"tool={tool_name}"]
    if duration is not None:
        parts.append(f"{duration}ms")
    if tool_result:
        result_str = str(tool_result)
        preview = result_str[:300]
        if len(result_str) > 300:
            preview += "..."
        parts.append(f"result: {preview}")

    return "; ".join(parts)


def _extract_duration(payload: dict) -> int | None:
    """Extract duration_ms from payload, handling float values."""
    raw = payload.get("duration") or payload.get("duration_ms")
    if isinstance(raw, (int, float)):
        return round(raw)
    return None


def build_entry(payload: dict) -> dict:
    """Build a log entry from a hook payload. Full capture -- no truncation."""
    try:
        from git_snapshot import snapshot
        git_info = snapshot(cwd=str(REPO_ROOT))
    except Exception:
        try:
            sys.path.insert(0, str(SCRIPT_DIR))
            from git_snapshot import snapshot
            git_info = snapshot(cwd=str(REPO_ROOT))
        except Exception:
            git_info = {"commit_hash": None, "changed_files": [], "repo_root": None}

    event_type = payload.get("hook_event_name", "unknown")
    workspace_roots = payload.get("workspace_roots", [])
    cwd = payload.get("cwd") or (workspace_roots[0] if workspace_roots else str(REPO_ROOT))

    # Fields populated by event-specific logic below
    user_prompt = payload.get("prompt")
    shell_command = None
    tool_name = payload.get("tool_name")
    tool_input = _safe_json_str(payload.get("tool_input"))
    agent_response_summary = None
    agent_response_text = None
    shell_output_summary = None
    exit_code = None
    duration_ms = None

    if event_type in SHELL_EVENTS:
        shell_command = payload.get("command")

    if event_type == "afterShellExecution":
        exit_code = payload.get("exit_code")
        duration_ms = _extract_duration(payload)
        shell_output_summary = _summarize_shell_output(payload)

    elif event_type == "afterFileEdit":
        agent_response_summary = _summarize_edits(payload)

    elif event_type == "afterMCPExecution":
        duration_ms = _extract_duration(payload)
        agent_response_summary = _summarize_mcp_result(payload)

    elif event_type == "afterAgentResponse":
        text = payload.get("text")
        agent_response_text = text
        if text:
            preview = text[:200] + "..." if len(text) > 200 else text
            agent_response_summary = f"Response: {preview}"

    elif event_type == "afterAgentThought":
        text = payload.get("text")
        agent_response_text = text
        duration_ms = _extract_duration(payload)
        if text:
            preview = text[:200] + "..." if len(text) > 200 else text
            agent_response_summary = f"Thinking: {preview}"

    elif event_type == "stop":
        status_val = payload.get("status", "unknown")
        agent_response_summary = f"Task {status_val}"

    elif event_type == "sessionStart":
        agent_response_summary = "Session started"

    elif event_type == "sessionEnd":
        agent_response_summary = "Session ended"

    elif event_type == "preCompact":
        agent_response_summary = "Context compaction pending"

    return {
        "entry_id": _make_entry_id(),
        "timestamp": _now_iso(),
        "event_type": event_type,
        "conversation_id": payload.get("conversation_id"),
        "session_id": payload.get("generation_id"),
        "model": payload.get("model"),
        "tool_name": tool_name,
        "tool_input": tool_input,
        "shell_command": shell_command,
        "shell_output_summary": shell_output_summary,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "files_touched": _extract_files_touched(payload),
        "user_prompt": user_prompt,
        "agent_response_summary": agent_response_summary,
        "agent_response_text": agent_response_text,
        "cwd": cwd,
        "git_commit_hash": git_info.get("commit_hash"),
        "status": payload.get("status", "ok"),
        "raw_payload": payload,
    }


def _send_permission_response(event_type: str) -> None:
    """For hooks that require a response, print permission JSON to stdout."""
    if event_type in PERMISSION_EVENTS:
        response = {"permission": "allow"}
        print(json.dumps(response), flush=True)


def main() -> None:
    payload = _read_stdin()
    if payload is None:
        payload = _parse_cli_args()
    if payload is None:
        sys.exit(0)

    event_type = payload.get("hook_event_name", "unknown")

    try:
        entry = build_entry(payload)
        log_data = _load_log()
        log_data["entries"].append(entry)
        _save_log(log_data)
    except Exception as e:
        sys.stderr.write(f"BuildLog error: {e}\n")

    _send_permission_response(event_type)


if __name__ == "__main__":
    main()
