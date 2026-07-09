#!/usr/bin/env python3
from __future__ import annotations

import shutil
from pathlib import Path

from _sync_utils import ROOT_DIR


STAGING_DIR = ROOT_DIR / ".generated-public"
STATIC_FILES = ("manifest.json", "sw.js", "google7c739dca0cd83ad1.html")
DATA_EXCLUDES = {"background.svg", ".DS_Store"}
ICON_EXCLUDES = {"background.svg", "grain.svg", "icon_DA", ".DS_Store"}
JS_FILES = (
    "js/vendor/daub.js",
    "js/vendor/ssr-window.js",
    "js/pdf-library.js",
    "js/character-generator.js",
    "js/tabell-popup.js",
)
JS_DIRS = ("js/legacy",)
STATIC_DIRS = ("data", "icons", "pdf")
SHADOW_CSS_SOURCES = (
    ("node_modules/daub-ui/daub.css", "daub"),
    "css/theme.css",
    "css/components.css",
    "css/daub-bridges.css",
    "css/overlays.css",
    "css/mobile.css",
    "css/motion.css",
)


def reset_staging_dir() -> None:
    if STAGING_DIR.exists():
        shutil.rmtree(STAGING_DIR)
    STAGING_DIR.mkdir(parents=True)


def copy_tree(name: str) -> None:
    source = ROOT_DIR / name
    if not source.is_dir():
        raise FileNotFoundError(f"Missing static directory: {source}")
    ignore = shutil.ignore_patterns(".DS_Store")
    if name == "data":
        ignore = shutil.ignore_patterns(*DATA_EXCLUDES)
    elif name == "icons":
        ignore = shutil.ignore_patterns(*ICON_EXCLUDES)
    shutil.copytree(
        source,
        STAGING_DIR / name,
        ignore=ignore,
    )


def copy_file(name: str) -> None:
    source = ROOT_DIR / name
    if not source.is_file():
        raise FileNotFoundError(f"Missing static file: {source}")
    destination = STAGING_DIR / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def copy_optional_tree(name: str) -> None:
    source = ROOT_DIR / name
    if not source.is_dir():
        return
    copy_tree(name)


def build_shadow_stylesheet() -> None:
    destination = STAGING_DIR / "css" / "shadow.css"
    destination.parent.mkdir(parents=True, exist_ok=True)
    chunks = []
    for item in SHADOW_CSS_SOURCES:
        name, layer = item if isinstance(item, tuple) else (item, "")
        source = ROOT_DIR / name
        if not source.is_file():
            raise FileNotFoundError(f"Missing stylesheet source: {source}")
        contents = source.read_text(encoding='utf-8').strip()
        if layer:
            contents = f"@layer {layer} {{\n{contents}\n}}"
        chunks.append(f"/* {name} */\n{contents}\n")
    destination.write_text("\n".join(chunks), encoding="utf-8")


def main() -> None:
    reset_staging_dir()
    for name in STATIC_DIRS:
        copy_tree(name)
    for name in JS_DIRS:
        copy_optional_tree(name)
    for name in JS_FILES:
        copy_file(name)
    build_shadow_stylesheet()
    for name in STATIC_FILES:
        copy_file(name)
    print(f"Rebuilt {STAGING_DIR.relative_to(ROOT_DIR).as_posix()} from root static assets.")


if __name__ == "__main__":
    main()
