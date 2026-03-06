#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json


TYPE_RULES_KEYS = ("typ_regler", "type_rules")


@dataclass
class DataFilePayload:
    entries: list[Any]
    type_rules: dict[str, Any]
    extra: dict[str, Any]
    is_object_format: bool


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_payload(payload: Any, source: str = "data file") -> DataFilePayload:
    if isinstance(payload, list):
        return DataFilePayload(
            entries=payload,
            type_rules={},
            extra={},
            is_object_format=False,
        )

    if not isinstance(payload, dict):
        raise ValueError(f"{source} must contain either a top-level array or object")

    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise ValueError(f"{source} object payload must contain an entries array")

    type_rules = {}
    for key in TYPE_RULES_KEYS:
        candidate = payload.get(key)
        if candidate is None:
            continue
        if not isinstance(candidate, dict):
            raise ValueError(f"{source} field {key} must be an object when present")
        type_rules = candidate
        break

    extra = {
        key: value
        for key, value in payload.items()
        if key not in {"entries", *TYPE_RULES_KEYS}
    }

    return DataFilePayload(
        entries=entries,
        type_rules=type_rules,
        extra=extra,
        is_object_format=True,
    )


def load_data_file(path: Path) -> DataFilePayload:
    return normalize_payload(load_json(path), source=path.name)


def build_payload(
    entries: list[Any],
    *,
    type_rules: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    as_object: bool = True,
) -> Any:
    if not as_object:
        return entries

    out: dict[str, Any] = {}
    out["typ_regler"] = type_rules if isinstance(type_rules, dict) else {}

    if isinstance(extra, dict):
        for key, value in extra.items():
            if key in {"entries", *TYPE_RULES_KEYS}:
                continue
            out[key] = value

    out["entries"] = entries
    return out
