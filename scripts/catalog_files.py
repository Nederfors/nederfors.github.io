#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
CONTRACT_PATH = ROOT_DIR / "config" / "catalog-files.json"
CONTRACT_LIST_KEYS = ("entryDataFiles", "specialDataFiles", "derivedDataFiles")


@dataclass(frozen=True)
class CatalogFiles:
    entry_data_files: tuple[str, ...]
    special_data_files: tuple[str, ...]
    derived_data_files: tuple[str, ...]

    @property
    def classified_files(self) -> tuple[str, ...]:
        return (*self.entry_data_files, *self.special_data_files, *self.derived_data_files)

    def as_manifest(self) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "entryDataFiles": list(self.entry_data_files),
            "specialDataFiles": list(self.special_data_files),
            "derivedDataFiles": list(self.derived_data_files),
        }


def _read_list(payload: dict[str, Any], key: str, errors: list[str]) -> tuple[str, ...]:
    value = payload.get(key)
    if not isinstance(value, list):
        errors.append(f'{key} must be an array of JSON filenames')
        return ()

    out: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            errors.append(f'{key}[{index}] must be a non-empty string')
            continue
        name = item.strip()
        if name != Path(name).name or not name.endswith(".json"):
            errors.append(f'{key}[{index}] must be a bare .json filename: {name!r}')
            continue
        if name in seen:
            errors.append(f'{key} classifies {name!r} more than once')
            continue
        seen.add(name)
        out.append(name)
    return tuple(out)


def load_catalog_files(
    *,
    contract_path: Path = CONTRACT_PATH,
    data_dir: Path = DATA_DIR,
    require_complete: bool = True,
) -> CatalogFiles:
    try:
        payload = json.loads(contract_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Missing catalog contract: {contract_path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid catalog contract JSON: {contract_path}: {error}") from error

    if not isinstance(payload, dict):
        raise ValueError(f"Catalog contract must be an object: {contract_path}")

    errors: list[str] = []
    if payload.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")

    unknown_keys = set(payload) - {"schemaVersion", *CONTRACT_LIST_KEYS}
    for key in sorted(unknown_keys):
        errors.append(f"unknown catalog contract key: {key}")

    groups = {key: _read_list(payload, key, errors) for key in CONTRACT_LIST_KEYS}
    owners: dict[str, str] = {}
    for key, names in groups.items():
        for name in names:
            previous = owners.get(name)
            if previous:
                errors.append(f'{name!r} is classified by both {previous} and {key}')
            else:
                owners[name] = key

    if require_complete:
        discovered = {path.name for path in data_dir.glob("*.json") if path.is_file()}
        classified = set(owners)
        for name in sorted(discovered - classified, key=str.casefold):
            errors.append(f'unclassified data file: data/{name}')
        for name in sorted(classified - discovered, key=str.casefold):
            errors.append(f'classified data file does not exist: data/{name}')

    if errors:
        details = "\n".join(f"- {message}" for message in errors)
        raise ValueError(f"Invalid catalog classification contract:\n{details}")

    return CatalogFiles(
        entry_data_files=groups["entryDataFiles"],
        special_data_files=groups["specialDataFiles"],
        derived_data_files=groups["derivedDataFiles"],
    )
