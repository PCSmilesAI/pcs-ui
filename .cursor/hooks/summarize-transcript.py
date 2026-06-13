#!/usr/bin/env python3
"""
Reads the most recent Cursor agent transcript for a workspace and outputs
a 2-3 sentence summary of what was asked and what the agent did.

Usage: python3 summarize-transcript.py /path/to/workspace
"""

import json
import os
import re
import sys
import time


def workspace_to_cursor_folder(workspace_path):
    path = os.path.realpath(workspace_path).rstrip("/")
    return path.replace("/", "-").replace(" ", "-").lstrip("-")


def find_latest_transcript(cursor_folder):
    transcripts_dir = os.path.join(
        os.path.expanduser("~/.cursor/projects"),
        cursor_folder,
        "agent-transcripts",
    )
    if not os.path.isdir(transcripts_dir):
        return None

    folders = [
        f
        for f in os.listdir(transcripts_dir)
        if os.path.isdir(os.path.join(transcripts_dir, f))
    ]
    if not folders:
        return None

    folders.sort(
        key=lambda f: os.path.getmtime(os.path.join(transcripts_dir, f)),
        reverse=True,
    )
    latest = folders[0]
    jsonl = os.path.join(transcripts_dir, latest, latest + ".jsonl")
    return jsonl if os.path.isfile(jsonl) else None


def strip_markdown(text):
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)
    return text


def clean_text(text, max_len=200):
    text = re.sub(r"<[^>]+>", "", text)
    text = strip_markdown(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        cut = text[:max_len].rsplit(" ", 1)[0]
        text = cut + "..."
    return text


def extract_conversation(jsonl_path):
    user_texts = []
    assistant_texts = []

    with open(jsonl_path) as f:
        for line in f:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            role = obj.get("role", "")
            content = obj.get("message", {}).get("content", [])

            for block in content:
                if block.get("type") != "text":
                    continue
                text = (block.get("text") or "").strip()
                if not text:
                    continue

                if role == "user":
                    match = re.search(
                        r"<user_query>\s*(.*?)\s*</user_query>", text, re.DOTALL
                    )
                    if match:
                        user_texts.append(match.group(1).strip())
                elif role == "assistant":
                    assistant_texts.append(text)

    return user_texts, assistant_texts


def find_best_response(assistant_texts):
    """Find the last substantive assistant response, skipping short/meta replies."""
    skip_patterns = [
        r"^Let me (check|look|read|search|explore|find|verify)",
        r"^I'll ",
        r"^Now let me",
        r"^Good,",
        r"^Done\.",
        r"^OK",
        r"^Build succeed",
    ]
    skip_re = re.compile("|".join(skip_patterns), re.IGNORECASE)

    for text in reversed(assistant_texts):
        cleaned = re.sub(r"<[^>]+>", "", text)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if len(cleaned) < 30:
            continue
        if skip_re.match(cleaned):
            continue
        return text

    # Fallback: just take the last one with any substance
    for text in reversed(assistant_texts):
        cleaned = re.sub(r"\s+", " ", text).strip()
        if len(cleaned) > 15:
            return text
    return None


def build_summary(user_texts, assistant_texts):
    if not user_texts:
        return None

    last_ask = clean_text(user_texts[-1], 250)

    response = find_best_response(assistant_texts)
    if response:
        last_response = clean_text(response, 250)
        return f"{last_ask}\n\nResult: {last_response}"
    else:
        return last_ask


def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    workspace_path = sys.argv[1]
    cursor_folder = workspace_to_cursor_folder(workspace_path)
    jsonl_path = find_latest_transcript(cursor_folder)

    if not jsonl_path:
        sys.exit(1)

    age = time.time() - os.path.getmtime(jsonl_path)
    if age > 1800:
        sys.exit(1)

    user_texts, assistant_texts = extract_conversation(jsonl_path)
    summary = build_summary(user_texts, assistant_texts)

    if summary:
        print(summary)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
