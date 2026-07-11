#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys

from _sync_utils import ROOT_DIR


SCRIPT_SEQUENCE = [
    ("Sync data manifest", "scripts/sync_data_manifest.py", []),
    ("Build service worker cache", "scripts/build_sw_cache.py", []),
    ("Update lampliga formagor", "scripts/update_lampliga_formagor.py", []),
    ("Build all.json", "scripts/build_all.py", ["--strict"]),
    ("Build struktur.json", "scripts/build_struktur.py", ["--strict"]),
    ("Build offline manifest", "scripts/build_offline_manifest.py", []),
]


def run_step(label: str, script_path: str, args: list[str]) -> None:
    print(f"[master-sync] {label}", flush=True)
    subprocess.run([sys.executable, script_path, *args], cwd=ROOT_DIR, check=True)


def run_npm_build() -> None:
    print("[master-sync] npm run build", flush=True)
    subprocess.run(["npm", "run", "build"], cwd=ROOT_DIR, check=True)


def main() -> None:
    for label, script_path, args in SCRIPT_SEQUENCE:
        run_step(label, script_path, args)
    run_npm_build()
    print("[master-sync] done", flush=True)


if __name__ == "__main__":
    main()
