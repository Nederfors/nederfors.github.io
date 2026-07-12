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
    "js/elite-add.js",
    "js/pdf-library.js",
    "js/character-generator.js",
    "js/tabell-popup.js",
)
CSS_FILES = ("css/toolbar-shadow.css", "css/popup-shell.css")
JS_DIRS = ("js/legacy",)
STATIC_DIRS = ("data", "icons", "pdf")


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


def main() -> None:
    reset_staging_dir()
    for name in STATIC_DIRS:
        copy_tree(name)
    for name in JS_DIRS:
        copy_optional_tree(name)
    for name in JS_FILES:
        copy_file(name)
    for name in CSS_FILES:
        copy_file(name)
    for name in STATIC_FILES:
        copy_file(name)
    print(f"Rebuilt {STAGING_DIR.relative_to(ROOT_DIR).as_posix()} from root static assets.")


if __name__ == "__main__":
    main()
