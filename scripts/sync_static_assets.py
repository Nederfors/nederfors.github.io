#!/usr/bin/env python3
from __future__ import annotations

import shutil
from pathlib import Path

from _sync_utils import ROOT_DIR


STAGING_DIR = ROOT_DIR / ".generated-public"
STATIC_DIRS = ("css", "js", "data", "icons", "pdf")
STATIC_FILES = ("manifest.json", "sw.js", "google7c739dca0cd83ad1.html")
VENDOR_FILES = (
    "node_modules/daub-ui/daub.css",
    "node_modules/daub-ui/daub.js",
)


def reset_staging_dir() -> None:
    if STAGING_DIR.exists():
        shutil.rmtree(STAGING_DIR)
    STAGING_DIR.mkdir(parents=True)


def copy_tree(name: str) -> None:
    source = ROOT_DIR / name
    if not source.is_dir():
        raise FileNotFoundError(f"Missing static directory: {source}")
    shutil.copytree(
        source,
        STAGING_DIR / name,
        ignore=shutil.ignore_patterns(".DS_Store"),
    )


def copy_file(name: str) -> None:
    source = ROOT_DIR / name
    if not source.is_file():
        raise FileNotFoundError(f"Missing static file: {source}")
    destination = STAGING_DIR / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def main() -> None:
    reset_staging_dir()
    for name in STATIC_DIRS:
        copy_tree(name)
    for name in STATIC_FILES:
        copy_file(name)
    for name in VENDOR_FILES:
        copy_file(name)
    print(f"Rebuilt {STAGING_DIR.relative_to(ROOT_DIR).as_posix()} from root static assets.")


if __name__ == "__main__":
    main()
