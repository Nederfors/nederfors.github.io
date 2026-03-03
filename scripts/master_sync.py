#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys

from _sync_utils import ROOT_DIR


SCRIPT_SEQUENCE = [
    ("Sync data manifest", "scripts/sync_data_manifest.py"),
    ("Sync page bundles", "scripts/sync_page_bundles.py"),
    ("Build service worker cache", "scripts/build_sw_cache.py"),
    ("Update lampliga formagor", "scripts/update_lampliga_formagor.py"),
    ("Build all.json", "scripts/build_all.py"),
    ("Build struktur.json", "scripts/build_struktur.py"),
]


def run_step(label: str, script_path: str) -> None:
    print(f"[master-sync] {label}", flush=True)
    subprocess.run([sys.executable, script_path], cwd=ROOT_DIR, check=True)


def main() -> None:
    for label, script_path in SCRIPT_SEQUENCE:
        run_step(label, script_path)
    print("[master-sync] done", flush=True)


if __name__ == "__main__":
    main()
