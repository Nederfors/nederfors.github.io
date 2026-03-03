#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def update_file(path: Path, text: str) -> bool:
    current = read_text(path)
    if current == text:
        return False
    write_text(path, text)
    return True


def extract_marked_block(text: str, start_marker: str, end_marker: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise ValueError(f"Missing start marker: {start_marker}")
    start += len(start_marker)
    end = text.find(end_marker, start)
    if end < 0:
        raise ValueError(f"Missing end marker: {end_marker}")
    return text[start:end]


def replace_marked_block(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise ValueError(f"Missing start marker: {start_marker}")
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise ValueError(f"Missing end marker: {end_marker}")

    normalized = replacement.rstrip("\n")
    return "".join(
        [
            text[: start + len(start_marker)],
            "\n",
            normalized,
            "\n",
            text[end:],
        ]
    )


def replace_regex_block(text: str, pattern: str, replacement: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise ValueError(f"Pattern did not match exactly once: {pattern}")
    return updated
