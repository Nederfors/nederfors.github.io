#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from _sync_utils import ROOT_DIR, extract_marked_block, read_text, replace_marked_block, replace_regex_block, update_file


BUILD_ALL_PATH = ROOT_DIR / "scripts" / "build_all.py"
MAIN_JS_PATH = ROOT_DIR / "js" / "main.js"
MANIFEST_OUTPUT_PATH = ROOT_DIR / "scripts" / "generated" / "data_manifest.json"
DATA_DIR = ROOT_DIR / "data"

PY_START = "    # sync-data-manifest:start"
PY_END = "    # sync-data-manifest:end"
JS_START = "  // sync-data-manifest:start"
JS_END = "  // sync-data-manifest:end"

ENTRY_DATA_EXCLUDES = {
    "all.json",
    "pdf-list.json",
    "struktur.json",
    "tabeller.json",
    "vapen.json",
}
SPECIAL_DATA_FILES = [
    "pdf-list.json",
    "tabeller.json",
]


def discover_entry_data_files() -> list[str]:
    files = [
        path.name
        for path in DATA_DIR.glob("*.json")
        if path.name not in ENTRY_DATA_EXCLUDES
    ]
    return sorted(files, key=str.casefold)


def parse_existing_order() -> list[str]:
    text = read_text(BUILD_ALL_PATH)
    try:
        block = extract_marked_block(text, PY_START, PY_END)
    except ValueError:
        match = re.search(r"DATA_FILES = \[\n(.*?)\n\]", text, flags=re.MULTILINE | re.DOTALL)
        if not match:
            return []
        block = match.group(1)
    return re.findall(r"'([^']+\.json)'", block)


def merge_order(existing: list[str], discovered: list[str]) -> list[str]:
    ordered = []
    seen = set()

    for name in existing:
        if name in discovered and name not in seen:
            ordered.append(name)
            seen.add(name)

    for name in discovered:
        if name not in seen:
            ordered.append(name)
            seen.add(name)

    return ordered


def render_python_list(files: list[str]) -> str:
    return "\n".join(f"    '{name}'," for name in files)


def render_js_list(files: list[str]) -> str:
    return "\n".join(f"  '{name}'," for name in files)


def sync_build_all_text(text: str, ordered: list[str]) -> str:
    try:
        return replace_marked_block(text, PY_START, PY_END, render_python_list(ordered))
    except ValueError:
        pattern = r"(DATA_FILES = \[\n)(.*?)(\n\])"
        replacement = (
            r"\1"
            f"{PY_START}\n"
            f"{render_python_list(ordered)}\n"
            f"{PY_END}"
            r"\3"
        )
        return replace_regex_block(text, pattern, replacement)


def sync_main_js_text(text: str, ordered: list[str]) -> str:
    try:
        return replace_marked_block(text, JS_START, JS_END, render_js_list(ordered))
    except ValueError:
        pattern = r"(const DATA_FILES = \[\n)(.*?)(\n\]\.map\(f => `data/\$\{f\}`\);)"
        replacement = (
            r"\1"
            f"{JS_START}\n"
            f"{render_js_list(ordered)}\n"
            f"{JS_END}"
            r"\3"
        )
        return replace_regex_block(text, pattern, replacement)


def write_manifest(files: list[str]) -> bool:
    MANIFEST_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if MANIFEST_OUTPUT_PATH.exists():
        try:
            current_payload = json.loads(read_text(MANIFEST_OUTPUT_PATH))
        except json.JSONDecodeError:
            current_payload = {}
        if (
            current_payload.get("entryDataFiles") == files
            and current_payload.get("specialDataFiles") == SPECIAL_DATA_FILES
            and current_payload.get("excludedDataFiles") == sorted(ENTRY_DATA_EXCLUDES)
        ):
            return False

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "entryDataFiles": files,
        "specialDataFiles": SPECIAL_DATA_FILES,
        "excludedDataFiles": sorted(ENTRY_DATA_EXCLUDES),
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if MANIFEST_OUTPUT_PATH.exists():
        return update_file(MANIFEST_OUTPUT_PATH, text)
    MANIFEST_OUTPUT_PATH.write_text(text, encoding="utf-8")
    return True


def main() -> None:
    discovered = discover_entry_data_files()
    ordered = merge_order(parse_existing_order(), discovered)
    updates = []

    build_all_text = read_text(BUILD_ALL_PATH)
    next_build_all_text = sync_build_all_text(build_all_text, ordered)
    if update_file(BUILD_ALL_PATH, next_build_all_text):
        updates.append(BUILD_ALL_PATH.relative_to(ROOT_DIR).as_posix())

    main_js_text = read_text(MAIN_JS_PATH)
    next_main_js_text = sync_main_js_text(main_js_text, ordered)
    if update_file(MAIN_JS_PATH, next_main_js_text):
        updates.append(MAIN_JS_PATH.relative_to(ROOT_DIR).as_posix())

    if write_manifest(ordered):
        updates.append(MANIFEST_OUTPUT_PATH.relative_to(ROOT_DIR).as_posix())

    print(f"Entry data files: {len(ordered)}")
    if updates:
        for path in updates:
            print(f"updated {path}")
    else:
        print("No manifest changes needed.")


if __name__ == "__main__":
    main()
