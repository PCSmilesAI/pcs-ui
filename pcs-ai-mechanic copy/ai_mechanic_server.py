#!/usr/bin/env python3
"""
AI Mechanic Server for PCS

Runs on the Mac Mini and exposes a small HTTP API that the PCS droplet can call.

Endpoints:
  - GET  /health    -> basic status + repo info
  - POST /auto_fix  -> ask DeepSeek Coder (via Ollama) to rewrite one or more Python files,
                       run syntax checks, commit to a new git branch, and push to GitHub.

This server is intentionally narrow:
  - It only works inside a single repo (PCS codebase)
  - It only edits an allow-listed set of Python files
  - It always works on a new git branch
  - It resets and returns to a clean state on any error
"""

import os
import json
import uuid
import logging
import subprocess
from typing import List, Dict, Any

import requests
from flask import Flask, request, jsonify


# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------

# Path to the PCS repo on the Mac Mini
REPO_PATH = os.environ.get(
    "PCS_MECHANIC_REPO",
    "/Users/braxtonellsworth/pcs-ai-mechanic/pcs-ui",
)

# Ollama endpoint and model names
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_CODER_MODEL = os.environ.get("PCS_MECHANIC_CODER_MODEL", "deepseek-coder:6.7b")

# Strict allow-list of files the mechanic is allowed to touch
ALLOWED_PY_FILES = {
    "general_invoice_parser.py",
    "vendor_router.py",
    "invoice_categorizer.py",
    "exodus_parser.py",
    # Extend this list *explicitly* as needed
}

# Basic logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)


# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

def run_cmd(
    args: List[str],
    cwd: str | None = None,
    check: bool = True,
    capture_output: bool = True,
    text: bool = True,
) -> subprocess.CompletedProcess:
    """
    Run a shell command and optionally raise on failure.
    """
    logger.debug("Running command: %s (cwd=%s)", " ".join(args), cwd or os.getcwd())
    return subprocess.run(
        args,
        cwd=cwd,
        check=check,
        capture_output=capture_output,
        text=text,
    )


def get_current_branch() -> str:
    """
    Return the current git branch name in REPO_PATH.
    """
    try:
        result = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=REPO_PATH)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def is_repo_clean() -> bool:
    """
    Return True if the git working tree is clean (no uncommitted changes).
    """
    try:
        result = run_cmd(["git", "status", "--porcelain"], cwd=REPO_PATH)
        return result.stdout.strip() == ""
    except subprocess.CalledProcessError:
        return False


def call_deepseek_coder(prompt: str) -> str:
    """
    Call DeepSeek Coder via Ollama and return the raw 'response' string.
    """
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {
        "model": OLLAMA_CODER_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    logger.info("Calling DeepSeek Coder at %s with model=%s", url, OLLAMA_CODER_MODEL)
    resp = requests.post(url, json=payload, timeout=600)
    resp.raise_for_status()
    data = resp.json()

    # Expected format: {"model": "...", "response": "...", ...}
    if "response" not in data:
        raise RuntimeError(f"Ollama response missing 'response' field: {data}")
    return data["response"]


def sanitize_model_output(raw: str) -> str:
    """
    Normalize the model output so we can safely write it as Python code.

    - Removes ``` fenced code blocks if present
    - Removes leading 'python' or 'py' language tag lines inside those fences
    - Trims whitespace
    """
    text = raw.strip()

    # If fenced blocks exist, extract the inner code
    if "```" in text:
        first = text.find("```")
        last = text.rfind("```")

        if first != -1 and last != -1 and last > first:
            inner = text[first + 3:last].lstrip()

            # Remove any language tag line
            lowered = inner.lower()
            if lowered.startswith("python"):
                inner = inner.split("\n", 1)[1] if "\n" in inner else ""
            elif lowered.startswith("py"):
                inner = inner.split("\n", 1)[1] if "\n" in inner else ""

            return inner.strip()

    return text.strip()


def build_rewrite_prompt(
    error_type: str,
    description: str,
    files: List[str],
    example_input: str,
    expected_output: str,
) -> str:
    """
    Build a single prompt instructing DeepSeek Coder to return *only* the full
    contents of a single Python file, no commentary, no backticks.

    For now, we treat the first file in `files` as the primary target.
    """
    primary = files[0] if files else "TARGET_FILE.py"

    header = (
        "You are a senior Python engineer helping maintain an invoice parsing system.\n"
        "You will receive:\n"
        f"- A description of an error or improvement request (type: {error_type})\n"
        f"- Context about what went wrong: {description}\n"
        f"- A target Python file to fully rewrite: {primary}\n"
        "- Optional example input and expected output behavior.\n\n"
        "Your job:\n"
        f"- Rewrite the ENTIRE file `{primary}` as high-quality, production Python.\n"
        "- Preserve the existing behavior unless the description explicitly asks for a change.\n"
        "- If the description says 'small comment only' or 'no behavior change', then do not change logic.\n"
        "- Handle invoices robustly and defensively; fail loudly and clearly on malformed data.\n\n"
        "CRITICAL OUTPUT RULES:\n"
        "- Return ONLY the raw Python source code for the file.\n"
        "- DO NOT wrap the code in ``` blocks.\n"
        "- DO NOT include any explanation, markdown, or commentary outside of Python comments.\n"
        "- The first line of your response must be a valid Python line (e.g., import or def), not text.\n\n"
    )

    example_section = ""
    if example_input or expected_output:
        example_section = (
            "Example runtime scenario:\n"
            f"- Example input: {example_input or '[none provided]'}\n"
            f"- Expected behavior/output: {expected_output or '[none provided]'}\n\n"
        )

    instructions = (
        "Implementation guidance:\n"
        "- Use clear structure, functions, and docstrings as appropriate.\n"
        "- Avoid external dependencies beyond the Python standard library unless they are already used in the file.\n"
        "- If you must change behavior, ensure it is consistent with the description.\n"
        "- If the request is a DRY RUN sanity check, only add a small explanatory comment near the top and keep logic identical.\n\n"
        "Again, OUTPUT FORMAT:\n"
        "- ONLY the full Python code for the rewritten file.\n"
        "- No backticks, no markdown, no explanation text.\n"
    )

    return header + example_section + instructions


def ensure_repo_ok() -> None:
    """
    Ensure that the repo exists and is a valid git repository with a clean working tree.
    Raises RuntimeError if anything is wrong.
    """
    if not os.path.isdir(REPO_PATH):
        raise RuntimeError(f"REPO_PATH does not exist or is not a directory: {REPO_PATH}")

    git_dir = os.path.join(REPO_PATH, ".git")
    if not os.path.isdir(git_dir):
        raise RuntimeError(f"REPO_PATH is not a git repository: {REPO_PATH}")

    if not is_repo_clean():
        raise RuntimeError(
            "Git working tree is not clean. Commit or stash your changes before using the AI mechanic."
        )


# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health() -> Any:
    """
    Basic status endpoint so the droplet can verify connectivity.
    """
    status = "ok"
    message = ""
    current_branch = ""
    head_hash = ""

    try:
        ensure_repo_ok()
        current_branch = get_current_branch()
        result = run_cmd(["git", "rev-parse", "HEAD"], cwd=REPO_PATH)
        head_hash = result.stdout.strip()
    except Exception as e:  # noqa: BLE001
        status = "error"
        message = str(e)

    return jsonify(
        {
            "status": status,
            "repo_path": REPO_PATH,
            "branch": current_branch,
            "head": head_hash,
            "message": message,
        }
    )


@app.route("/auto_fix", methods=["POST"])
def auto_fix() -> Any:
    """
    Main entry point for PCS error events.

    Expects JSON like:
    {
      "error_type": "string",
      "description": "string",
      "candidate_files": ["general_invoice_parser.py"],
      "example_input": "optional string",
      "expected_output": "optional string"
    }

    Behavior:
      - Validate candidate_files are in ALLOWED_PY_FILES
      - Build a rewrite prompt for DeepSeek
      - Ask DeepSeek for full file contents
      - Sanitize output (remove fences)
      - Create a new git branch
      - Overwrite the target file(s)
      - Run 'python3 -m py_compile' on them
      - Commit and push to origin
      - On any error, reset and return to original branch
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "error": "Missing or invalid JSON body"}), 400

    error_type = str(data.get("error_type", "")).strip()
    description = str(data.get("description", "")).strip()
    candidate_files = data.get("candidate_files", [])
    example_input = str(data.get("example_input", "")).strip()
    expected_output = str(data.get("expected_output", "")).strip()

    if not isinstance(candidate_files, list) or not candidate_files:
        return jsonify({"status": "error", "error": "candidate_files must be a non-empty list"}), 400

    # Enforce allow-list
    invalid = [f for f in candidate_files if f not in ALLOWED_PY_FILES]
    if invalid:
        return (
            jsonify(
                {
                    "status": "error",
                    "error": "Some candidate_files are not allowed",
                    "invalid_files": invalid,
                    "allowed_files": sorted(ALLOWED_PY_FILES),
                }
            ),
            400,
        )

    try:
        ensure_repo_ok()
    except RuntimeError as e:
        return jsonify({"status": "error", "error": str(e)}), 400

    logger.info(
        "Received auto_fix request: error_type=%s, description=%s, files=%s",
        error_type,
        description,
        candidate_files,
    )

    # Build prompt
    prompt = build_rewrite_prompt(
        error_type=error_type,
        description=description,
        files=candidate_files,
        example_input=example_input,
        expected_output=expected_output,
    )

    original_branch = get_current_branch() or "main"
    branch_name = f"ai-fix-{uuid.uuid4().hex[:10]}"
    applied_files: List[str] = []

    try:
        # 1) Ensure we're on main before branching
        run_cmd(["git", "checkout", "main"], cwd=REPO_PATH)

        # 2) Call model
        raw_source = call_deepseek_coder(prompt)
        new_source = sanitize_model_output(raw_source)

        if not new_source.strip():
            raise RuntimeError("Model returned empty source after sanitization.")

        # 3) Create sandbox branch
        run_cmd(["git", "checkout", "-b", branch_name], cwd=REPO_PATH)

        # 4) Overwrite target files
        for fname in candidate_files:
            target_path = os.path.join(REPO_PATH, fname)
            if not os.path.exists(target_path):
                raise RuntimeError(f"File does not exist in repo: {fname}")

            if not fname.endswith(".py"):
                raise RuntimeError(f"Only .py files are supported; got: {fname}")

            logger.info("Writing new source to %s", target_path)
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(new_source)
            applied_files.append(fname)

        # 5) Syntax check
        py_files = [f for f in candidate_files if f.endswith(".py")]
        if py_files:
            cmd = ["python3", "-m", "py_compile"] + py_files
            logger.info("Running syntax check: %s", " ".join(cmd))
            run_cmd(cmd, cwd=REPO_PATH)

        # 6) Commit & push
        run_cmd(["git", "add"] + applied_files, cwd=REPO_PATH)

        short_desc = description.replace("\n", " ")
        if len(short_desc) > 120:
            short_desc = short_desc[:117] + "..."

        commit_msg = f"AI mechanic fix ({error_type}): {short_desc or 'auto-fix'}"
        run_cmd(["git", "commit", "-m", commit_msg], cwd=REPO_PATH)
        run_cmd(["git", "push", "-u", "origin", branch_name], cwd=REPO_PATH)

        logger.info("AI mechanic success: branch=%s files=%s", branch_name, applied_files)

        return jsonify(
            {
                "status": "success",
                "branch": branch_name,
                "applied_files": applied_files,
                "commit_message": commit_msg,
            }
        )

    except subprocess.CalledProcessError as e:
        logger.error("Subprocess error during auto_fix: %s", e)
        try:
            run_cmd(["git", "reset", "--hard"], cwd=REPO_PATH, check=False)
            run_cmd(["git", "checkout", original_branch], cwd=REPO_PATH, check=False)
        except Exception as cleanup_err:  # noqa: BLE001
            logger.error("Error during cleanup: %s", cleanup_err)

        return jsonify(
            {
                "status": "error",
                "error": f"Command failed: {' '.join(e.cmd) if e.cmd else ''}",
                "stdout": e.stdout or "",
                "stderr": e.stderr or "",
            }
        )

    except Exception as e:  # noqa: BLE001
        logger.error("General error during auto_fix: %s", e)
        try:
            run_cmd(["git", "reset", "--hard"], cwd=REPO_PATH, check=False)
            run_cmd(["git", "checkout", original_branch], cwd=REPO_PATH, check=False)
        except Exception as cleanup_err:  # noqa: BLE001
            logger.error("Error during cleanup: %s", cleanup_err)

        return jsonify({"status": "error", "error": str(e)})


# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PCS_MECHANIC_PORT", "8001"))
    logger.info("Starting AI Mechanic server on 0.0.0.0:%d", port)
    logger.info("Repo path: %s", REPO_PATH)
    logger.info("Coder model: %s", OLLAMA_CODER_MODEL)
    app.run(host="0.0.0.0", port=port)
