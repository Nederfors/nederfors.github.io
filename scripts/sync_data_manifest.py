#!/usr/bin/env python3
from __future__ import annotations

import json

from _sync_utils import ROOT_DIR, read_text, replace_marked_block, replace_regex_block, update_file
from catalog_files import load_catalog_files


MAIN_JS_PATH = ROOT_DIR / "js" / "main.js"
MANIFEST_OUTPUT_PATH = ROOT_DIR / "scripts" / "generated" / "data_manifest.json"

JS_START = "  // sync-data-manifest:start"
JS_END = "  // sync-data-manifest:end"


def render_js_list(files: list[str]) -> str:
    return "\n".join(f"  '{name}'," for name in files)


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


def write_manifest(payload: dict) -> bool:
    MANIFEST_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if MANIFEST_OUTPUT_PATH.exists():
        return update_file(MANIFEST_OUTPUT_PATH, text)
    MANIFEST_OUTPUT_PATH.write_text(text, encoding="utf-8")
    return True


def main() -> None:
    contract = load_catalog_files()
    ordered = list(contract.entry_data_files)
    updates = []

    main_js_text = read_text(MAIN_JS_PATH)
    next_main_js_text = sync_main_js_text(main_js_text, ordered)
    if update_file(MAIN_JS_PATH, next_main_js_text):
        updates.append(MAIN_JS_PATH.relative_to(ROOT_DIR).as_posix())

    if write_manifest(contract.as_manifest()):
        updates.append(MANIFEST_OUTPUT_PATH.relative_to(ROOT_DIR).as_posix())

    print(f"Entry data files: {len(ordered)}")
    if updates:
        for path in updates:
            print(f"updated {path}")
    else:
        print("No manifest changes needed.")


if __name__ == "__main__":
    main()
