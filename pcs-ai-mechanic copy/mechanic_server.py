import os
import subprocess
import tempfile
import textwrap
import sqlite3
import json
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request
import requests
import yaml

app = Flask(__name__)

# ------------------------------------------------------------
# AUDIT DATABASE
# ------------------------------------------------------------

AUDIT_DB_PATH = Path(
    os.environ.get(
        "AUDIT_DB_PATH",
        "/Users/braxtonellsworth/pcs-ai-mechanic/mechanic_audit.db",
    )
).resolve()


def init_audit_db():
    """Initialize the audit database with the runs table."""
    conn = sqlite3.connect(str(AUDIT_DB_PATH))
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mechanic_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            error_type TEXT,
            description TEXT,
            invoice_id TEXT,
            vendor TEXT,
            parser TEXT,
            candidate_files TEXT,
            original_fields TEXT,
            corrected_fields TEXT,
            status TEXT NOT NULL,
            files_touched TEXT,
            diff_text TEXT,
            commit_hash TEXT,
            revert_commit TEXT,
            error_message TEXT
        )
    """)
    conn.commit()
    conn.close()
    app.logger.info(f"Audit database initialized at {AUDIT_DB_PATH}")


def log_run(
    error_type: str,
    description: str = None,
    invoice_id: str = None,
    vendor: str = None,
    parser: str = None,
    candidate_files: list = None,
    original_fields: dict = None,
    corrected_fields: dict = None,
    status: str = "pending",
    files_touched: list = None,
    diff_text: str = None,
    commit_hash: str = None,
    error_message: str = None,
) -> int:
    """Log a mechanic run to the audit database. Returns the run ID."""
    conn = sqlite3.connect(str(AUDIT_DB_PATH))
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO mechanic_runs
        (timestamp, error_type, description, invoice_id, vendor, parser,
         candidate_files, original_fields, corrected_fields, status,
         files_touched, diff_text, commit_hash, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.utcnow().isoformat(),
        error_type,
        description,
        invoice_id,
        vendor,
        parser,
        json.dumps(candidate_files) if candidate_files else None,
        json.dumps(original_fields) if original_fields else None,
        json.dumps(corrected_fields) if corrected_fields else None,
        status,
        json.dumps(files_touched) if files_touched else None,
        diff_text,
        commit_hash,
        error_message,
    ))
    run_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return run_id


def update_run(run_id: int, **kwargs):
    """Update a mechanic run in the audit database."""
    conn = sqlite3.connect(str(AUDIT_DB_PATH))
    cursor = conn.cursor()

    updates = []
    values = []
    for key, value in kwargs.items():
        if key in ("files_touched", "candidate_files", "original_fields", "corrected_fields"):
            value = json.dumps(value) if value else None
        updates.append(f"{key} = ?")
        values.append(value)

    values.append(run_id)
    cursor.execute(f"UPDATE mechanic_runs SET {', '.join(updates)} WHERE id = ?", values)
    conn.commit()
    conn.close()


def get_run(run_id: int) -> dict:
    """Get a single run by ID."""
    conn = sqlite3.connect(str(AUDIT_DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM mechanic_runs WHERE id = ?", (run_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    return _row_to_dict(row)


def get_runs(limit: int = 100) -> list:
    """Get recent runs from the audit database."""
    conn = sqlite3.connect(str(AUDIT_DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM mechanic_runs ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()

    return [_row_to_dict(row) for row in rows]


def _row_to_dict(row) -> dict:
    """Convert a database row to a dictionary."""
    d = dict(row)
    # Parse JSON fields
    for key in ("files_touched", "candidate_files", "original_fields", "corrected_fields"):
        if d.get(key):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                pass
    # Add diff preview (first 500 chars)
    if d.get("diff_text"):
        d["diff_preview"] = d["diff_text"][:500] + ("..." if len(d["diff_text"]) > 500 else "")
    return d


# Initialize audit DB on startup
init_audit_db()

# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------

# Path to your PCS repo on the Mac mini
REPO_PATH = Path(
    os.environ.get(
        "PCS_REPO_PATH",
        "/Users/braxtonellsworth/pcs-ai-mechanic/pcs-ui",
    )
).resolve()

# Ollama / DeepSeek endpoint
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
CODER_MODEL = os.environ.get("CODER_MODEL", "deepseek-coder:6.7b")

# Master mechanic rules file
MECHANIC_RULES_PATH = Path(
    os.environ.get(
        "MECHANIC_RULES_PATH",
        "/Users/braxtonellsworth/pcs-ai-mechanic/mechanic_rules.md",
    )
).resolve()

# HARD ALLOWLIST: ONLY THESE FILES MAY EVER BE MODIFIED
# (relative to REPO_PATH)
ALLOWED_PARSER_FILES = {
    "general_invoice_parser.py",
    "exodus_parser.py",
    "henry_parser.py",
    "patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py",
    "multi_invoice_detector.py",
    "multipage_invoice_processor.py",
    "invoice_categorizer.py",
    "vendor_router.py",
    "enhanced_vendor_router.py",
}

# Python files to compile-check after changes
PY_COMPILE_FILES = [
    "exodus_parser.py",
    "general_invoice_parser.py",
    "vendor_router.py",
    "invoice_categorizer.py",
]


def load_mechanic_rules() -> str:
    if not MECHANIC_RULES_PATH.exists():
        return "PCS AI Mechanic rules file not found; operate in ultra-conservative mode."
    return MECHANIC_RULES_PATH.read_text(encoding="utf-8")


MASTER_RULES_TEXT = load_mechanic_rules()


# ------------------------------------------------------------
# UTILS
# ------------------------------------------------------------

def run(cmd, cwd=None, check=True, capture_output=True, text=True):
    """Helper to run shell commands."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        check=check,
        capture_output=capture_output,
        text=text,
    )
    return result


def ensure_repo_is_clean():
    """Optional: ensure you don't accidentally stack changes on top of uncommitted edits."""
    try:
        status = run(["git", "status", "--porcelain"], cwd=REPO_PATH, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"git status failed: {e.stderr}") from e

    if status.stdout.strip():
        # You can decide if you want to hard fail here or just log.
        # For now we just warn in logs; the API still proceeds.
        app.logger.warning("Repository is not clean. Uncommitted changes exist.")


def validate_candidate_files(candidate_files):
    """Enforce hard allowlist: only parser files may be touched."""
    normalized = []
    for f in candidate_files:
        # normalize to posix-style path relative to REPO_PATH
        rel = Path(f).name  # we only allow top-level file names in allowlist
        normalized.append(rel)

    disallowed = [f for f in normalized if f not in ALLOWED_PARSER_FILES]
    if disallowed:
        return False, disallowed, normalized
    return True, [], normalized


def build_deepseek_prompt(payload, normalized_candidate_files):
    """Compose the full instruction DeepSeek sees."""
    description = payload.get("description", "")
    error_type = payload.get("error_type", "")
    example_input = payload.get("example_input", "")
    expected_output = payload.get("expected_output", "")

    # Make the file list explicit for the model
    parser_file_list = "\n".join(f"- {name}" for name in normalized_candidate_files)

    task_block = f"""
    You are operating as the PCS AI Mechanic.

    TASK CONTEXT
    ------------
    Error type: {error_type}

    Description:
    {description}

    Candidate parser files (you are ONLY allowed to modify these):
    {parser_file_list}

    Example input (if provided):
    {example_input}

    Expected output behavior:
    {expected_output}

    OUTPUT REQUIREMENTS
    -------------------
    - Respond ONLY with a unified diff (git diff style) that can be applied with `git apply`.
    - Do NOT include explanations, markdown fences, or commentary.
    - The diff must:
      - Only touch the files listed above.
      - Respect the master mechanic rules you were given.
    """

    full_prompt = MASTER_RULES_TEXT + "\n\n" + textwrap.dedent(task_block).strip()
    return full_prompt


def call_deepseek_for_diff(prompt: str) -> str:
    """Call Ollama / DeepSeek and return the diff text."""
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": CODER_MODEL,
            "prompt": prompt,
            "stream": False,
        },
        timeout=600,
    )
    resp.raise_for_status()
    data = resp.json()
    # Ollama /generate returns `response` with the whole text when stream=false
    diff_text = data.get("response", "")
    return diff_text.strip()


def parse_diff_touched_files(diff_text: str):
    """Extract the list of files from a unified diff."""
    touched = []
    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            filename = line[len("+++ b/") :].strip()
            touched.append(filename)
    return touched


def is_diff_too_destructive(diff_text: str, max_deletions_per_file: int = 50):
    """
    Simple heuristic:
    - count lines starting with '-' (excluding diff metadata)
    - if more than max_deletions_per_file in any file, treat as too destructive.
    """
    deletions_per_file = {}
    current_file = None

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[len("+++ b/") :].strip()
            deletions_per_file.setdefault(current_file, 0)
        elif line.startswith("--- "):
            continue
        elif line.startswith("@@"):
            continue
        elif line.startswith("-") and not line.startswith("--- "):
            if current_file is not None:
                deletions_per_file[current_file] += 1

    too_big = {
        f: count for f, count in deletions_per_file.items() if count > max_deletions_per_file
    }
    return bool(too_big), too_big


def apply_diff(diff_text: str):
    """Apply the diff using git apply with safety checks."""
    # Write diff to a temp file
    with tempfile.NamedTemporaryFile("w", delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(diff_text)

    try:
        # Check that the patch applies cleanly
        run(["git", "apply", "--check", tmp_path], cwd=REPO_PATH, check=True)

        # Apply the patch
        run(["git", "apply", tmp_path], cwd=REPO_PATH, check=True)

    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def compile_check():
    """Run python -m py_compile on key parser files."""
    files = [str(REPO_PATH / f) for f in PY_COMPILE_FILES if (REPO_PATH / f).exists()]
    if not files:
        return

    cmd = ["python3", "-m", "py_compile"] + files
    run(cmd, cwd=REPO_PATH, check=True)


# ------------------------------------------------------------
# ROUTES
# ------------------------------------------------------------

@app.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "repo_path": str(REPO_PATH),
            "allowed_parser_files": sorted(ALLOWED_PARSER_FILES),
        }
    )


@app.post("/auto_fix")
def auto_fix():
    try:
        payload = request.get_json(force=True)
    except Exception as e:
        return jsonify({"status": "error", "error": f"Invalid JSON: {e}"}), 400

    candidate_files = payload.get("candidate_files") or []
    if not candidate_files:
        return jsonify({"status": "error", "error": "candidate_files is required"}), 400

    # Log the run to audit database
    run_id = log_run(
        error_type=payload.get("error_type", "unknown"),
        description=payload.get("description"),
        invoice_id=payload.get("invoice_id"),
        vendor=payload.get("vendor"),
        parser=payload.get("parser"),
        candidate_files=candidate_files,
        original_fields=payload.get("original_fields"),
        corrected_fields=payload.get("corrected_fields"),
        status="pending",
    )
    app.logger.info(f"[AUDIT] Started run #{run_id}")

    ok, disallowed, normalized = validate_candidate_files(candidate_files)
    if not ok:
        update_run(run_id, status="failed", error_message=f"Files not in allowlist: {disallowed}")
        return jsonify({"status": "error", "error": f"Requested files not in parser allowlist: {disallowed}", "run_id": run_id}), 400

    # Build DeepSeek prompt
    prompt = build_deepseek_prompt(payload, normalized)

    try:
        ensure_repo_is_clean()
    except RuntimeError as e:
        app.logger.warning(str(e))

    # Remember current HEAD so we can roll back if needed
    try:
        pre_hash = run(["git", "rev-parse", "HEAD"], cwd=REPO_PATH, check=True).stdout.strip()
    except subprocess.CalledProcessError as e:
        update_run(run_id, status="failed", error_message=f"Failed to read repo HEAD: {e.stderr}")
        return jsonify({"status": "error", "error": f"Failed to read repo HEAD: {e.stderr}", "run_id": run_id}), 500

    # Call DeepSeek and get diff
    try:
        diff_text = call_deepseek_for_diff(prompt)
    except Exception as e:
        update_run(run_id, status="failed", error_message=f"Error calling DeepSeek: {e}")
        return jsonify({"status": "error", "error": f"Error calling DeepSeek: {e}", "run_id": run_id}), 500

    if not diff_text.strip():
        update_run(run_id, status="failed", error_message="Model returned empty diff text")
        return jsonify({"status": "error", "error": "Model returned empty diff text.", "run_id": run_id}), 500

    # Check that diff only touches allowed files
    touched = parse_diff_touched_files(diff_text)
    unexpected = [f for f in touched if Path(f).name not in ALLOWED_PARSER_FILES]
    if unexpected:
        update_run(run_id, status="failed", diff_text=diff_text, error_message=f"Diff touches files outside allowlist: {unexpected}")
        return jsonify({"status": "error", "error": f"Diff touches files outside parser allowlist: {unexpected}", "run_id": run_id}), 400

    # Destructiveness guard
    too_big, details = is_diff_too_destructive(diff_text)
    if too_big:
        update_run(run_id, status="failed", diff_text=diff_text, error_message=f"Diff too destructive: {details}")
        return jsonify({"status": "error", "error": f"Diff too destructive (too many deletions): {details}", "run_id": run_id}), 400

    # Try applying the diff and compiling
    try:
        apply_diff(diff_text)
        compile_check()
    except subprocess.CalledProcessError as e:
        run(["git", "reset", "--hard", pre_hash], cwd=REPO_PATH, check=False)
        update_run(run_id, status="failed", diff_text=diff_text, error_message=f"Patch or compile failed: {e.stderr}")
        return jsonify({"status": "error", "error": f"Patch or compile failed: {e.stderr}", "run_id": run_id}), 500
    except Exception as e:
        run(["git", "reset", "--hard", pre_hash], cwd=REPO_PATH, check=False)
        update_run(run_id, status="failed", diff_text=diff_text, error_message=f"Unexpected error: {e}")
        return jsonify({"status": "error", "error": f"Unexpected error while applying patch: {e}", "run_id": run_id}), 500

    # Commit the changes
    try:
        commit_msg = f"[AI-MECHANIC] Auto-fix for {payload.get('error_type', 'unknown')} (run #{run_id})"
        run(["git", "add", "-A"], cwd=REPO_PATH, check=True)
        run(["git", "commit", "-m", commit_msg], cwd=REPO_PATH, check=True)
        commit_hash = run(["git", "rev-parse", "HEAD"], cwd=REPO_PATH, check=True).stdout.strip()
    except subprocess.CalledProcessError as e:
        app.logger.warning(f"Failed to commit: {e.stderr}")
        commit_hash = None

    # Update audit log with success
    update_run(
        run_id,
        status="success",
        files_touched=touched,
        diff_text=diff_text,
        commit_hash=commit_hash,
    )
    app.logger.info(f"[AUDIT] Completed run #{run_id} successfully. Commit: {commit_hash}")

    return jsonify({
        "status": "success",
        "run_id": run_id,
        "applied_files": touched,
        "commit_hash": commit_hash,
        "allowlist": sorted(ALLOWED_PARSER_FILES),
    })


# ------------------------------------------------------------
# AUDIT ROUTES
# ------------------------------------------------------------

@app.get("/audit")
def get_audit_trail():
    """Get the list of recent mechanic runs."""
    limit = request.args.get("limit", 100, type=int)
    runs_list = get_runs(limit=limit)
    return jsonify(runs_list)


@app.get("/audit/<int:run_id>")
def get_audit_run(run_id: int):
    """Get details of a specific run."""
    run_data = get_run(run_id)
    if not run_data:
        return jsonify({"error": "Run not found"}), 404
    return jsonify(run_data)


@app.post("/audit/<int:run_id>/revert")
def revert_run(run_id: int):
    """Revert a specific mechanic run by reversing its commit."""
    run_data = get_run(run_id)
    if not run_data:
        return jsonify({"error": "Run not found"}), 404

    if run_data.get("status") != "success":
        return jsonify({"error": "Can only revert successful runs"}), 400

    if run_data.get("revert_commit"):
        return jsonify({"error": "Run has already been reverted"}), 400

    commit_hash = run_data.get("commit_hash")
    if not commit_hash:
        return jsonify({"error": "No commit hash found for this run"}), 400

    try:
        # Revert the commit
        run(["git", "revert", "--no-edit", commit_hash], cwd=REPO_PATH, check=True)
        revert_hash = run(["git", "rev-parse", "HEAD"], cwd=REPO_PATH, check=True).stdout.strip()

        # Update the run status
        update_run(run_id, status="reverted", revert_commit=revert_hash)
        app.logger.info(f"[AUDIT] Reverted run #{run_id}. Revert commit: {revert_hash}")

        return jsonify({
            "status": "reverted",
            "run_id": run_id,
            "original_commit": commit_hash,
            "revert_commit": revert_hash,
        })

    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Failed to revert: {e.stderr}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001, debug=True)
