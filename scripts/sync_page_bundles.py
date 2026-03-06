#!/usr/bin/env python3
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path

from _sync_utils import ROOT_DIR, read_text, replace_marked_block, update_file


HTML_START = "  <!-- sync-page-bundles:start -->"
HTML_END = "  <!-- sync-page-bundles:end -->"
BOOTSTRAP_START = "  // sync-page-bundles:start"
BOOTSTRAP_END = "  // sync-page-bundles:end"
APP_BOOTSTRAP_PATH = ROOT_DIR / "js" / "app-bootstrap.js"

PAGE_BUNDLES = OrderedDict(
    [
        (
            "index",
            {
                "path": ROOT_DIR / "index.html",
                "scripts": [
                    "js/auto-resize.js",
                    "js/text-format.js",
                    "js/utils.js",
                    "js/store.js",
                    "js/inventory-utils.js",
                    "js/traits-utils.js",
                    "js/shared-toolbar.js",
                    "js/yrke-panel.js",
                    "js/tabell-popup.js",
                    "js/pdf-library.js",
                    "js/elite-utils.js",
                    "js/elite-req.js",
                    "js/entry-card.js",
                    "js/entry-xp.js",
                    "js/index-view.js",
                    "js/jszip.min.js",
                    "js/character-generator.js",
                    "js/main.js",
                    "js/exceptionellt.js",
                    "js/djurmask.js",
                    "js/beastform.js",
                    "js/kraftval.js",
                    "js/artifact-payment.js",
                    "js/bloodbond.js",
                    "js/monsterlard.js",
                    "js/elite-add.js",
                    "js/pwa.js",
                ],
            },
        ),
        (
            "character",
            {
                "path": ROOT_DIR / "character.html",
                "scripts": [
                    "js/auto-resize.js",
                    "js/text-format.js",
                    "js/utils.js",
                    "js/store.js",
                    "js/inventory-utils.js",
                    "js/traits-utils.js",
                    "js/shared-toolbar.js",
                    "js/yrke-panel.js",
                    "js/tabell-popup.js",
                    "js/pdf-library.js",
                    "js/elite-utils.js",
                    "js/elite-req.js",
                    "js/entry-card.js",
                    "js/entry-xp.js",
                    "js/character-view.js",
                    "js/jszip.min.js",
                    "js/character-generator.js",
                    "js/main.js",
                    "js/exceptionellt.js",
                    "js/djurmask.js",
                    "js/beastform.js",
                    "js/kraftval.js",
                    "js/artifact-payment.js",
                    "js/bloodbond.js",
                    "js/monsterlard.js",
                    "js/pwa.js",
                ],
            },
        ),
        (
            "notes",
            {
                "path": ROOT_DIR / "notes.html",
                "scripts": [
                    "js/text-format.js",
                    "js/utils.js",
                    "js/store.js",
                    "js/inventory-utils.js",
                    "js/traits-utils.js",
                    "js/shared-toolbar.js",
                    "js/yrke-panel.js",
                    "js/elite-utils.js",
                    "js/elite-req.js",
                    "js/pdf-library.js",
                    "js/auto-resize.js",
                    "js/entry-card.js",
                    "js/notes-view.js",
                    "js/jszip.min.js",
                    "js/character-generator.js",
                    "js/main.js",
                    "js/exceptionellt.js",
                    "js/djurmask.js",
                    "js/beastform.js",
                    "js/kraftval.js",
                    "js/artifact-payment.js",
                    "js/bloodbond.js",
                    "js/monsterlard.js",
                    "js/elite-add.js",
                    "js/pwa.js",
                ],
            },
        ),
        (
            "inventory",
            {
                "path": ROOT_DIR / "inventory.html",
                "scripts": [
                    "js/auto-resize.js",
                    "js/text-format.js",
                    "js/utils.js",
                    "js/store.js",
                    "js/inventory-utils.js",
                    "js/traits-utils.js",
                    "js/shared-toolbar.js",
                    "js/yrke-panel.js",
                    "js/tabell-popup.js",
                    "js/pdf-library.js",
                    "js/elite-utils.js",
                    "js/elite-req.js",
                    "js/entry-card.js",
                    "js/inventory-view.js",
                    "js/jszip.min.js",
                    "js/character-generator.js",
                    "js/main.js",
                    "js/exceptionellt.js",
                    "js/djurmask.js",
                    "js/beastform.js",
                    "js/kraftval.js",
                    "js/artifact-payment.js",
                    "js/bloodbond.js",
                    "js/monsterlard.js",
                    "js/elite-add.js",
                    "js/pwa.js",
                ],
            },
        ),
        (
            "traits",
            {
                "path": ROOT_DIR / "traits.html",
                "scripts": [
                    "js/auto-resize.js",
                    "js/text-format.js",
                    "js/utils.js",
                    "js/store.js",
                    "js/inventory-utils.js",
                    "js/traits-utils.js",
                    "js/summary-effects.js",
                    "js/shared-toolbar.js",
                    "js/yrke-panel.js",
                    "js/tabell-popup.js",
                    "js/pdf-library.js",
                    "js/elite-utils.js",
                    "js/elite-req.js",
                    "js/entry-card.js",
                    "js/jszip.min.js",
                    "js/character-generator.js",
                    "js/main.js",
                    "js/exceptionellt.js",
                    "js/djurmask.js",
                    "js/beastform.js",
                    "js/kraftval.js",
                    "js/artifact-payment.js",
                    "js/bloodbond.js",
                    "js/monsterlard.js",
                    "js/elite-add.js",
                    "js/pwa.js",
                ],
            },
        ),
    ]
)


def render_html_bundle(scripts: list[str]) -> str:
    return "\n".join(f'  <script src="{src}" defer></script>' for src in scripts)


def render_bootstrap_bundle() -> str:
    chunks = []
    total = len(PAGE_BUNDLES)
    for index, (role, config) in enumerate(PAGE_BUNDLES.items(), start=1):
        chunks.append(f"  {role}: [")
        chunks.extend(f"    '{src}'," for src in config["scripts"])
        suffix = "," if index < total else ""
        chunks.append(f"  ]{suffix}")
    return "\n".join(chunks)


def sync_html_page(path: Path, scripts: list[str]) -> bool:
    text = read_text(path)
    if HTML_START not in text or HTML_END not in text:
        return False
    updated = replace_marked_block(text, HTML_START, HTML_END, render_html_bundle(scripts))
    return update_file(path, updated)


def sync_app_bootstrap() -> bool:
    text = read_text(APP_BOOTSTRAP_PATH)
    if BOOTSTRAP_START not in text or BOOTSTRAP_END not in text:
        return False
    updated = replace_marked_block(text, BOOTSTRAP_START, BOOTSTRAP_END, render_bootstrap_bundle())
    return update_file(APP_BOOTSTRAP_PATH, updated)


def main() -> None:
    updates = []

    for role, config in PAGE_BUNDLES.items():
        path = config["path"]
        if sync_html_page(path, config["scripts"]):
            updates.append(path.relative_to(ROOT_DIR).as_posix())

    if sync_app_bootstrap():
        updates.append(APP_BOOTSTRAP_PATH.relative_to(ROOT_DIR).as_posix())

    if updates:
        for path in updates:
            print(f"updated {path}")
    else:
        print("No page bundle changes needed.")


if __name__ == "__main__":
    main()
