#!/usr/bin/env python3
from __future__ import annotations

import json
import re

from _sync_utils import ROOT_DIR, read_text, replace_regex_block, update_file


SW_PATH = ROOT_DIR / "sw.js"
MANIFEST_PATH = ROOT_DIR / "scripts" / "generated" / "data_manifest.json"
DATA_DIR = ROOT_DIR / "data"
ICONS_DIR = ROOT_DIR / "icons"
CSS_DIR = ROOT_DIR / "css"

CORE_PRECACHE_PATTERN = r"(const CORE_PRECACHE_URLS = \[\n)(.*?)(\n\];)"
CORE_REFRESH_PATTERN = r"(const CORE_REFRESH_TARGETS = \[\n)(.*?)(\n\];)"

HTML_EXCLUDES = {
    "google7c739dca0cd83ad1.html",
    "ui-recreation.html",
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
]
BUNDLED_DATA_FILES = [
    "all.json",
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
    files = [
        path.relative_to(ROOT_DIR).as_posix()
        for path in ICONS_DIR.rglob("*")
        if path.is_file() and not path.name.startswith(".")
    ]
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
    return [f"data/{name}" for name in [*BUNDLED_DATA_FILES, *SPECIAL_DATA_FILES]]


def render_precache_block() -> str:
    html_pages = list_html_pages()
    paths = [*html_pages, "manifest.json", *list_css_files(), *list_data_files()]
    return "\n".join(f"  '{path}'," for path in paths)


def render_refresh_targets() -> str:
    return "\n".join(
        [
            "  { url: 'index.html', cacheName: CORE_CACHE },",
            "  { url: 'webapp.html', cacheName: CORE_CACHE },",
            "  { url: 'manifest.json', cacheName: CORE_CACHE },",
            "  { url: 'data/pdf-list.json', cacheName: JSON_CACHE },",
            "  { url: 'data/all.json', cacheName: JSON_CACHE }",
        ]
    )


def main() -> None:
    text = read_text(SW_PATH)
    updated = replace_regex_block(text, CORE_PRECACHE_PATTERN, r"\1" + render_precache_block() + r"\3")
    updated = replace_regex_block(updated, CORE_REFRESH_PATTERN, r"\1" + render_refresh_targets() + r"\3")
    changed = update_file(SW_PATH, updated)
    if changed:
        print(f"updated {SW_PATH.relative_to(ROOT_DIR).as_posix()}")
    else:
        print("No service worker cache changes needed.")


if __name__ == "__main__":
    main()
