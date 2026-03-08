#!/usr/bin/env python3
from __future__ import annotations

import json
import re

from _sync_utils import ROOT_DIR, read_text, replace_marked_block, update_file


SW_PATH = ROOT_DIR / "sw.js"
MANIFEST_PATH = ROOT_DIR / "scripts" / "generated" / "data_manifest.json"
DATA_DIR = ROOT_DIR / "data"
ICONS_DIR = ROOT_DIR / "icons"
CSS_DIR = ROOT_DIR / "css"

SW_START = "  // build-sw-cache:start"
SW_END = "  // build-sw-cache:end"

HTML_EXCLUDES = {
    "google7c739dca0cd83ad1.html",
}
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


def normalize_local_path(raw: str) -> str:
    value = (raw or "").strip()
    if not value or value.startswith("#"):
        return ""
    if re.match(r"^(?:https?:)?//", value):
        return ""
    value = value.split("?", 1)[0].split("#", 1)[0]
    return value.lstrip("./")


def list_html_pages() -> list[str]:
    pages = []
    for path in ROOT_DIR.glob("*.html"):
        if path.name in HTML_EXCLUDES:
            continue
        pages.append(path.name)
    return sorted(pages, key=str.casefold)


def list_css_files() -> list[str]:
    files = [path.relative_to(ROOT_DIR).as_posix() for path in CSS_DIR.rglob("*.css")]
    return sorted(files, key=str.casefold)


def list_icon_files() -> list[str]:
    files = [path.relative_to(ROOT_DIR).as_posix() for path in ICONS_DIR.rglob("*") if path.is_file()]
    return sorted(files, key=str.casefold)


def list_script_files(html_pages: list[str]) -> list[str]:
    files = set()
    pattern = re.compile(r'<script\b[^>]*\bsrc="([^"]+)"', re.IGNORECASE)
    for name in html_pages:
        text = read_text(ROOT_DIR / name)
        for raw in pattern.findall(text):
            normalized = normalize_local_path(raw)
            if normalized:
                files.add(normalized)
    return sorted(files, key=str.casefold)


def load_entry_data_files() -> list[str]:
    if MANIFEST_PATH.exists():
        payload = json.loads(read_text(MANIFEST_PATH))
        files = payload.get("entryDataFiles") or []
        return [str(name) for name in files]

    files = [
        path.name
        for path in DATA_DIR.glob("*.json")
        if path.name not in ENTRY_DATA_EXCLUDES
    ]
    return sorted(files, key=str.casefold)


def list_data_files() -> list[str]:
    return [f"data/{name}" for name in [*load_entry_data_files(), *SPECIAL_DATA_FILES]]


def render_section(comment: str, paths: list[str]) -> list[str]:
    lines = [f"  // {comment}"]
    lines.extend(f"  '{path}'," for path in paths)
    return lines


def render_cache_block() -> str:
    html_pages = list_html_pages()
    sections = [
        render_section("Core pages and styles", [*html_pages, *list_css_files(), "manifest.json"]),
        render_section("Icons", list_icon_files()),
        render_section("JavaScript", list_script_files(html_pages)),
        render_section("Data JSON", list_data_files()),
    ]

    lines = []
    for section in sections:
        if lines:
            lines.append("")
        lines.extend(section)
    return "\n".join(lines)


def main() -> None:
    text = read_text(SW_PATH)
    updated = replace_marked_block(text, SW_START, SW_END, render_cache_block())
    changed = update_file(SW_PATH, updated)
    if changed:
        print(f"updated {SW_PATH.relative_to(ROOT_DIR).as_posix()}")
    else:
        print("No service worker cache changes needed.")


if __name__ == "__main__":
    main()
