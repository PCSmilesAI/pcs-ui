#!/usr/bin/env python3
"""
test_buildlog.py - Integration test for the BuildLog system.

Simulates hook events, writes entries, generates reports, and validates output.
Backs up and restores any existing buildlog.json.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
LOG_FILE = REPO_ROOT / "build_audit" / "buildlog.json"
REPORTS_DIR = REPO_ROOT / "build_audit" / "reports"
APPEND_SCRIPT = SCRIPT_DIR / "append_log.py"
RENDER_SCRIPT = SCRIPT_DIR / "render_report.py"
INIT_SCRIPT = SCRIPT_DIR / "init_buildlog.py"

PYTHON = sys.executable

SAMPLE_EVENTS = [
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-001",
        "prompt": "Set up the project structure with a basic Flask app",
        "attachments": [{"type": "file", "file_path": "app.py"}],
        "hook_event_name": "beforeSubmitPrompt",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-001",
        "command": "pip install flask",
        "cwd": str(REPO_ROOT),
        "hook_event_name": "beforeShellExecution",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-001",
        "file_path": "app.py",
        "edits": [
            {
                "old_string": "",
                "new_string": "from flask import Flask\napp = Flask(__name__)\n",
            }
        ],
        "hook_event_name": "afterFileEdit",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-001",
        "command": "pip install flask",
        "output": "Successfully installed flask-3.0.0 werkzeug-3.0.0",
        "duration": 4500.123,
        "hook_event_name": "afterShellExecution",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-002",
        "tool_name": "browser_navigate",
        "tool_input": '{"url": "http://localhost:5000"}',
        "server": "cursor-ide-browser",
        "command": "browser",
        "hook_event_name": "beforeMCPExecution",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-002",
        "url": "cursor-ide-browser",
        "tool_name": "browser_navigate",
        "tool_input": '{"url": "http://localhost:5000"}',
        "tool_result": '{"title": "Flask App", "status": 200}',
        "duration": 1200,
        "hook_event_name": "afterMCPExecution",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-002",
        "text": "I'll set up the Flask application with the basic structure. Let me create the app.py file with the routing and configuration.\n\nHere's what I'm doing:\n1. Creating the main app entry point\n2. Setting up basic routes\n3. Adding error handlers",
        "hook_event_name": "afterAgentResponse",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-002",
        "text": "The user wants a Flask app. I need to consider the project structure carefully. Should I use blueprints or keep it simple? Given this is a basic setup, I'll start with a single module approach and add blueprints later if needed. I also need to think about whether to include a requirements.txt or use pyproject.toml.",
        "duration_ms": 3200,
        "hook_event_name": "afterAgentThought",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-002",
        "hook_event_name": "preCompact",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-001",
        "generation_id": "test-gen-002",
        "status": "completed",
        "hook_event_name": "stop",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-002",
        "generation_id": "test-gen-003",
        "hook_event_name": "sessionStart",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-002",
        "generation_id": "test-gen-003",
        "prompt": "Add error handling to the API endpoints",
        "attachments": [],
        "hook_event_name": "beforeSubmitPrompt",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-002",
        "generation_id": "test-gen-003",
        "status": "completed",
        "hook_event_name": "stop",
        "workspace_roots": [str(REPO_ROOT)],
    },
    {
        "conversation_id": "test-conv-002",
        "generation_id": "test-gen-003",
        "hook_event_name": "sessionEnd",
        "workspace_roots": [str(REPO_ROOT)],
    },
]


class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results: list[tuple[str, bool, str]] = []

    def check(self, name: str, condition: bool, detail: str = "") -> None:
        if condition:
            self.passed += 1
            self.results.append((name, True, detail))
            print(f"  PASS: {name}")
        else:
            self.failed += 1
            self.results.append((name, False, detail))
            print(f"  FAIL: {name} -- {detail}")

    def summary(self) -> None:
        total = self.passed + self.failed
        print()
        print("=" * 40)
        print(f"Results: {self.passed}/{total} passed", end="")
        if self.failed:
            print(f", {self.failed} FAILED")
        else:
            print(" -- ALL PASSED")
        print("=" * 40)


def pipe_event(event: dict) -> subprocess.CompletedProcess:
    """Pipe a JSON event into append_log.py via stdin."""
    return subprocess.run(
        [PYTHON, str(APPEND_SCRIPT)],
        input=json.dumps(event),
        capture_output=True,
        text=True,
        timeout=10,
        cwd=str(REPO_ROOT),
    )


def main() -> None:
    print("BuildLog Test Suite")
    print("=" * 40)
    print()

    t = TestResult()
    backup_path = None

    # Back up existing log and remove it so init creates a fresh one
    if LOG_FILE.exists():
        backup_path = LOG_FILE.with_suffix(".json.bak")
        shutil.copy2(str(LOG_FILE), str(backup_path))
        LOG_FILE.unlink()
        print(f"Backed up existing log to {backup_path.name}")

    try:
        # Initialize fresh
        print()
        print("[Phase 1] Initialize")
        result = subprocess.run(
            [PYTHON, str(INIT_SCRIPT)],
            capture_output=True, text=True, timeout=15, cwd=str(REPO_ROOT),
        )
        t.check("init_buildlog runs", result.returncode == 0, result.stderr)
        t.check("buildlog.json exists", LOG_FILE.exists())

        if LOG_FILE.exists():
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            t.check("log has correct schema", "entries" in data and "buildlog_version" in data)
            # Hooks may fire concurrently, so check entries are few rather than zero
            entry_count = len(data.get("entries", []))
            t.check("log starts empty or near-empty", entry_count <= 2,
                     f"got {entry_count} entries (hooks may fire concurrently)")

        # Simulate events
        print()
        print("[Phase 2] Simulate hook events")
        for i, event in enumerate(SAMPLE_EVENTS):
            result = pipe_event(event)
            event_name = event.get("hook_event_name", "unknown")
            t.check(
                f"event {i+1}/{len(SAMPLE_EVENTS)} ({event_name})",
                result.returncode == 0,
                result.stderr.strip() if result.returncode != 0 else "",
            )

            # Verify permission response for gating hooks
            if event_name in ("beforeShellExecution", "beforeMCPExecution"):
                try:
                    resp = json.loads(result.stdout.strip())
                    t.check(
                        f"  permission response for {event_name}",
                        resp.get("permission") == "allow",
                        f"got: {result.stdout.strip()}"
                    )
                except (json.JSONDecodeError, AttributeError):
                    t.check(f"  permission response for {event_name}", False, f"stdout: {result.stdout!r}")

        # Validate log contents -- filter to test entries by conversation_id
        # since live Cursor hooks may also be writing concurrently
        print()
        print("[Phase 3] Validate log entries")
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        all_entries = data.get("entries", [])
        test_conv_ids = {"test-conv-001", "test-conv-002"}
        entries = [e for e in all_entries if e.get("conversation_id") in test_conv_ids]
        t.check(
            f"correct test entry count ({len(entries)}/{len(SAMPLE_EVENTS)})",
            len(entries) == len(SAMPLE_EVENTS),
            f"total entries: {len(all_entries)}, filtered: {len(entries)}"
        )

        if entries:
            first = entries[0]
            t.check("entry has entry_id", "entry_id" in first and first["entry_id"] is not None)
            t.check("entry has timestamp", "timestamp" in first and first["timestamp"] is not None)
            t.check("entry has event_type", first.get("event_type") == "beforeSubmitPrompt")
            t.check("entry has conversation_id", first.get("conversation_id") == "test-conv-001")
            t.check("entry captured user_prompt", first.get("user_prompt") is not None)

            shell_entries = [e for e in entries if e.get("event_type") == "beforeShellExecution"]
            if shell_entries:
                t.check("shell entry has command", shell_entries[0].get("shell_command") == "pip install flask")

            after_shell = [e for e in entries if e.get("event_type") == "afterShellExecution"]
            if after_shell:
                t.check("afterShell has command", after_shell[0].get("shell_command") == "pip install flask")
                t.check("afterShell has duration_ms", after_shell[0].get("duration_ms") == 4500)
                t.check("afterShell has output summary",
                         after_shell[0].get("shell_output_summary") is not None
                         and "flask" in after_shell[0]["shell_output_summary"])
            else:
                t.check("afterShellExecution entry exists", False, "no afterShellExecution entries found")

            edit_entries = [e for e in entries if e.get("event_type") == "afterFileEdit"]
            if edit_entries:
                t.check("edit entry has files_touched", "app.py" in edit_entries[0].get("files_touched", []))

            mcp_entries = [e for e in entries if e.get("event_type") == "beforeMCPExecution"]
            if mcp_entries:
                t.check("MCP entry has tool_name", mcp_entries[0].get("tool_name") == "browser_navigate")

            after_mcp = [e for e in entries if e.get("event_type") == "afterMCPExecution"]
            if after_mcp:
                t.check("afterMCP has tool_name", after_mcp[0].get("tool_name") == "browser_navigate")
                t.check("afterMCP has duration_ms", after_mcp[0].get("duration_ms") == 1200)
                t.check("afterMCP has response summary",
                         after_mcp[0].get("agent_response_summary") is not None
                         and "browser_navigate" in after_mcp[0]["agent_response_summary"])
            else:
                t.check("afterMCPExecution entry exists", False, "no afterMCPExecution entries found")

            # --- Full Capture: new event types ---

            agent_resp = [e for e in entries if e.get("event_type") == "afterAgentResponse"]
            if agent_resp:
                t.check("afterAgentResponse has agent_response_text",
                         agent_resp[0].get("agent_response_text") is not None
                         and "Flask" in agent_resp[0]["agent_response_text"])
                t.check("afterAgentResponse stores full text (not truncated)",
                         "truncated" not in (agent_resp[0].get("agent_response_text") or ""))
                t.check("afterAgentResponse has summary",
                         agent_resp[0].get("agent_response_summary") is not None)
            else:
                t.check("afterAgentResponse entry exists", False, "no afterAgentResponse entries found")

            agent_thought = [e for e in entries if e.get("event_type") == "afterAgentThought"]
            if agent_thought:
                t.check("afterAgentThought has agent_response_text",
                         agent_thought[0].get("agent_response_text") is not None
                         and "blueprints" in agent_thought[0]["agent_response_text"])
                t.check("afterAgentThought has duration_ms",
                         agent_thought[0].get("duration_ms") == 3200)
                t.check("afterAgentThought stores full text (not truncated)",
                         "truncated" not in (agent_thought[0].get("agent_response_text") or ""))
            else:
                t.check("afterAgentThought entry exists", False, "no afterAgentThought entries found")

            session_starts = [e for e in entries if e.get("event_type") == "sessionStart"]
            t.check("sessionStart entry exists", len(session_starts) >= 1,
                     f"found {len(session_starts)}")

            session_ends = [e for e in entries if e.get("event_type") == "sessionEnd"]
            t.check("sessionEnd entry exists", len(session_ends) >= 1,
                     f"found {len(session_ends)}")

            compacts = [e for e in entries if e.get("event_type") == "preCompact"]
            if compacts:
                t.check("preCompact has summary",
                         compacts[0].get("agent_response_summary") == "Context compaction pending")
            else:
                t.check("preCompact entry exists", False, "no preCompact entries found")

            # --- Full Capture: verify NO truncation on raw payloads ---
            t.check("raw_payload is full (not truncated string)",
                     isinstance(first.get("raw_payload"), dict),
                     f"raw_payload type: {type(first.get('raw_payload')).__name__}")
            t.check("user_prompt is full (not truncated)",
                     first.get("user_prompt") is not None
                     and "truncated" not in first["user_prompt"])

            if after_shell:
                raw = after_shell[0].get("raw_payload", {})
                t.check("afterShell raw_payload stores full output",
                         isinstance(raw, dict) and raw.get("output") == "Successfully installed flask-3.0.0 werkzeug-3.0.0")

        # Generate reports
        print()
        print("[Phase 4] Generate reports")
        result = subprocess.run(
            [PYTHON, str(RENDER_SCRIPT)],
            capture_output=True, text=True, timeout=15, cwd=str(REPO_ROOT),
        )
        t.check("render_report runs", result.returncode == 0, result.stderr)

        timeline_path = REPORTS_DIR / "build_timeline.md"
        course_path = REPORTS_DIR / "course_outline.md"

        t.check("build_timeline.md exists", timeline_path.exists())
        t.check("course_outline.md exists", course_path.exists())

        if timeline_path.exists():
            content = timeline_path.read_text(encoding="utf-8")
            t.check("timeline has project name", "BuildLog" in content or "Build Timeline" in content)
            t.check("timeline has entries", "beforeSubmitPrompt" in content or "Prompt:" in content)

        if course_path.exists():
            content = course_path.read_text(encoding="utf-8")
            t.check("course outline has phases", "Phase" in content or "Lesson" in content)

    finally:
        # Restore backup
        if backup_path and backup_path.exists():
            shutil.copy2(str(backup_path), str(LOG_FILE))
            backup_path.unlink()
            print()
            print(f"Restored original log from backup.")

    t.summary()
    sys.exit(0 if t.failed == 0 else 1)


if __name__ == "__main__":
    main()
