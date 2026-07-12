#!/usr/bin/env python3
"""Build the deterministic rule-data manifest consumed by the service worker."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from _sync_utils import ROOT_DIR


CATALOG_PATH = ROOT_DIR / "data" / "index-catalog.json"
TABLES_PATH = ROOT_DIR / "data" / "tabeller.json"
OUTPUT_PATH = ROOT_DIR / "data" / "offline-manifest.json"


def digest_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    resources: list[dict[str, object]] = []
    seen: set[str] = set()

    for source in catalog.get("sources", []):
        url = str(source.get("file", "")).strip()
        if not url or url in seen:
            continue
        path = ROOT_DIR / url
        if not path.is_file():
            raise FileNotFoundError(f"Offline rule resource is missing: {url}")
        seen.add(url)
        resources.append({
            "url": url,
            # The service worker validates the exact HTTP response bytes, so
            # this must be the file digest rather than build_all's canonical
            # JSON checksum.
            "revision": f"sha256-{digest_path(path)}",
            "bytes": path.stat().st_size,
        })

    table_url = "data/tabeller.json"
    if table_url not in seen:
        resources.append({
            "url": table_url,
            "revision": f"sha256-{digest_path(TABLES_PATH)}",
            "bytes": TABLES_PATH.stat().st_size,
        })

    revision_source = "\n".join(
        f"{item['url']}:{item['revision']}" for item in resources
    ).encode("utf-8")
    payload = {
        "schemaVersion": 1,
        "revision": hashlib.sha256(revision_source).hexdigest(),
        "resources": resources,
        "totalBytes": sum(int(item["bytes"]) for item in resources),
    }
    next_text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    previous = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""
    if previous != next_text:
        OUTPUT_PATH.write_text(next_text, encoding="utf-8")
        print(f"Built {OUTPUT_PATH.relative_to(ROOT_DIR)} ({len(resources)} resources).")
    else:
        print("Offline manifest is up to date.")


if __name__ == "__main__":
    main()
