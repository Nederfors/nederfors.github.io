#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json


TYPE_RULES_KEYS = ("typ_regler", "type_rules")
CANONICAL_SCHEMA_VERSION = 3

ENTRY_KEYS = frozenset({
    "id",
    "name",
    "description",
    "tags",
    "levels",
    "rules",
    "elite_requirements",
    "key_traits",
    "elite_abilities",
    "possible_benefits",
    "possible_drawbacks",
    "requirement_abilities",
    "suggested_races",
    "suggested_abilities",
    "female_names",
    "male_names",
    "trait_summary",
    "stats",
    "base_price",
    "max_price",
    "qualities",
    "corruption",
    "effect",
    "negative",
    "bound",
    "boundLabel",
    "extra",
    "monsterjägarsällskap",
    "neutral",
    "traits",
})

TAG_KEYS = frozenset({
    "types",
    "traditions",
    "tests",
    "qualities",
    "max_count",
    "hidden",
    "race",
    "artifact_binding",
    "xp",
    "inventory",
    "arm_fast",
})

LEVEL_KEYS = frozenset({
    "description",
    "actions",
    "tests",
    "damage_type",
    "xp",
    "rules",
})

RULE_FAMILIES = frozenset({"modify", "require", "conflict", "grant", "choice"})
RULE_BLOCK_META_KEYS = frozenset({
    "kraver_logik",
    "kraver_typ_och_entry",
    "ignorera_typ_kraver",
    "ignorera_krav_popup",
})

CONDITION_LEAF_KEYS = frozenset({"field", "op", "value"})
CONDITION_BOOLEAN_KEYS = frozenset({"all", "any", "not"})
CONDITION_FIELD_EXACT = frozenset({
    "combat.after_move",
    "combat.has_advantage",
    "combat.is_melee",
    "combat.is_ranged",
    "entry.id",
    "entry.name",
    "entry.tags.tests",
    "entry.tags.traditions",
    "entry.tags.types",
    "item.id",
    "item.level",
    "item.mystic_quality_count",
    "item.name",
    "item.positive_quality_count",
    "item.qualities",
    "item.type",
    "item.types",
    "row.trait",
    "selected.names",
    "selected.types",
    "source.id",
    "source.is_selected",
    "source.level",
    "source.name",
    "source.tags.tests",
    "source.tags.traditions",
    "source.tags.types",
    "state.equipped.names",
    "state.equipped.qualities",
    "state.equipped.types",
    "state.equipped.weapons.count",
    "state.equipped.weapons.qualities",
    "state.equipped.weapons.types",
})
CONDITION_FIELD_PREFIXES = (
    "selected.levels.by_name.",
    "state.attributes.",
    "state.counts.by_name.",
    "state.counts.by_type.",
    "state.values.",
)
CONDITION_OPERATORS = frozenset({
    "exists",
    "equals",
    "not_equals",
    "includes",
    "includes_any",
    "includes_all",
    "gt",
    "gte",
    "lt",
    "lte",
})
NUMERIC_RULE_OPERATORS = frozenset({
    "add",
    "subtract",
    "multiply",
    "divide",
    "set",
    "min",
    "max",
})
CHOICE_DUPLICATE_POLICIES = frozenset({
    "allow",
    "reject",
    "confirm",
    "replace_existing",
})
ELITE_STAGE_KINDS = frozenset({
    "primary",
    "specific_choice",
    "tag_pool",
    "optional_pool",
    "named_count",
})
RULE_ALLOWED_KEYS = {
    "modify": frozenset({"rule_id", "message", "when", "target", "op", "value", "formula", "modifierare", "tillat", "snapshot"}),
    "require": frozenset({"rule_id", "message", "when", "value", "on_fail", "on_pass", "utrustning_typ", "utrustning_kvalitet"}),
    "conflict": frozenset({"rule_id", "message", "when", "name", "op", "value", "utrustning_typ"}),
    "grant": frozenset({
        "rule_id",
        "message",
        "when",
        "target",
        "op",
        "value",
        "formula",
        "name",
        "beviljad_niva",
        "id",
        "foremal",
        "daler",
        "gratis",
        "gratis_upp_till",
        "ignore_limits",
    }),
    "choice": frozenset({
        "rule_id",
        "when",
        "field",
        "options",
        "search",
        "source",
        "subtitle",
        "title",
        "duplicate_policy",
        "exclude_used",
    }),
}
CHOICE_SOURCE_KEYS = frozenset({
    "types",
    "when",
    "sort",
    "field",
    "value_field",
    "valueField",
    "label_field",
    "labelField",
    "only_selected",
    "onlySelected",
    "selected_only",
    "selectedOnly",
    "search",
})


@dataclass
class DataFilePayload:
    entries: list[Any]
    type_rules: dict[str, Any]
    extra: dict[str, Any]
    is_object_format: bool
    schema_version: int


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _join_path(base: str, key: str) -> str:
    return f"{base}.{key}" if base else key


def _add_error(errors: list[str], path: str, message: str) -> None:
    prefix = f"{path}: " if path else ""
    errors.append(f"{prefix}{message}")


def _validate_condition_field(field: Any, path: str, errors: list[str]) -> None:
    if not isinstance(field, str) or not field.strip():
        _add_error(errors, path, "condition field must be a non-empty string")
        return
    if field in CONDITION_FIELD_EXACT:
        return
    if any(field.startswith(prefix) for prefix in CONDITION_FIELD_PREFIXES):
        return
    _add_error(errors, path, f"unsupported condition field {field!r}")


def validate_condition_node(node: Any, path: str, errors: list[str]) -> None:
    if not _is_object(node):
        _add_error(errors, path, "condition must be an object")
        return

    keys = set(node.keys())
    is_leaf = "field" in node or "op" in node
    if is_leaf:
        unknown = keys - CONDITION_LEAF_KEYS
        for key in sorted(unknown):
            _add_error(errors, _join_path(path, key), "unknown condition key")
        _validate_condition_field(node.get("field"), _join_path(path, "field"), errors)
        op = node.get("op")
        if not isinstance(op, str) or op not in CONDITION_OPERATORS:
            _add_error(errors, _join_path(path, "op"), f"unsupported operator {op!r}")
        return

    boolean_keys = keys & CONDITION_BOOLEAN_KEYS
    if len(boolean_keys) != 1:
        _add_error(errors, path, "condition object must use exactly one of all/any/not")
        return

    key = next(iter(boolean_keys))
    unknown = keys - {key}
    for extra in sorted(unknown):
        _add_error(errors, _join_path(path, extra), "unknown condition key")

    if key == "not":
        validate_condition_node(node.get("not"), _join_path(path, "not"), errors)
        return

    values = node.get(key)
    if not isinstance(values, list) or not values:
        _add_error(errors, _join_path(path, key), f"{key} must be a non-empty array")
        return
    for index, item in enumerate(values):
        validate_condition_node(item, f"{path}.{key}[{index}]", errors)


def _validate_choice_source(source: Any, path: str, errors: list[str]) -> None:
    if not _is_object(source):
        _add_error(errors, path, "choice source must be an object")
        return
    for key in source.keys():
        if key not in CHOICE_SOURCE_KEYS:
            _add_error(errors, _join_path(path, key), "unknown choice source key")
    if "when" in source:
        validate_condition_node(source["when"], _join_path(path, "when"), errors)


def _validate_choice_options(options: Any, path: str, errors: list[str]) -> None:
    if not isinstance(options, list):
        _add_error(errors, path, "choice options must be an array")
        return
    for index, option in enumerate(options):
        option_path = f"{path}[{index}]"
        if isinstance(option, (str, int, float, bool)):
            continue
        if not _is_object(option):
            _add_error(errors, option_path, "choice option must be a scalar or object")
            continue
        if "rules" in option:
            validate_rule_block(option["rules"], _join_path(option_path, "rules"), errors)


def validate_rule(rule: Any, family: str, path: str, errors: list[str]) -> None:
    if not _is_object(rule):
        _add_error(errors, path, f"{family} rule must be an object")
        return

    allowed = RULE_ALLOWED_KEYS[family]
    for key in rule.keys():
        if key not in allowed:
            _add_error(errors, _join_path(path, key), f"unknown {family} rule key")

    rule_id = rule.get("rule_id")
    if not isinstance(rule_id, str) or not rule_id.strip():
        _add_error(errors, _join_path(path, "rule_id"), "rule_id is required")

    if "when" in rule:
        validate_condition_node(rule["when"], _join_path(path, "when"), errors)

    if family in {"modify", "grant", "conflict"} and "op" in rule:
        op = rule.get("op")
        if not isinstance(op, str) or op not in NUMERIC_RULE_OPERATORS:
            _add_error(errors, _join_path(path, "op"), f"unsupported operation {op!r}")

    if family == "choice":
        if "duplicate_policy" in rule:
            policy = rule.get("duplicate_policy")
            if not isinstance(policy, str) or policy not in CHOICE_DUPLICATE_POLICIES:
                _add_error(errors, _join_path(path, "duplicate_policy"), f"unsupported duplicate policy {policy!r}")
        if "options" in rule:
            _validate_choice_options(rule["options"], _join_path(path, "options"), errors)
        if "source" in rule:
            _validate_choice_source(rule["source"], _join_path(path, "source"), errors)


def validate_rule_block(block: Any, path: str, errors: list[str]) -> None:
    if not _is_object(block):
        _add_error(errors, path, "rules must be an object")
        return

    for key, value in block.items():
        if key in RULE_FAMILIES:
            if not isinstance(value, list):
                _add_error(errors, _join_path(path, key), "rule family must be an array")
                continue
            for index, rule in enumerate(value):
                validate_rule(rule, key, f"{path}.{key}[{index}]", errors)
            continue

        if key in RULE_BLOCK_META_KEYS:
            continue

        _add_error(errors, _join_path(path, key), "unknown rule block key")


def _validate_artifact_binding(binding: Any, path: str, errors: list[str]) -> None:
    if isinstance(binding, list):
        options = binding
    elif _is_object(binding):
        options = binding.get("options")
    else:
        _add_error(errors, path, "artifact_binding must be an object or options array")
        return
    if options is None:
        return
    if not isinstance(options, list):
        _add_error(errors, _join_path(path, "options"), "artifact_binding.options must be an array")
        return
    for index, option in enumerate(options):
        option_path = f"{path}.options[{index}]"
        if isinstance(option, (str, int, float, bool)):
            continue
        if not _is_object(option):
            _add_error(errors, option_path, "artifact binding option must be an object")
            continue
        if "rules" in option:
            validate_rule_block(option["rules"], _join_path(option_path, "rules"), errors)


def validate_level_object(level: Any, path: str, errors: list[str]) -> None:
    if isinstance(level, str):
        return
    if not _is_object(level):
        _add_error(errors, path, "level must be a string or object")
        return
    for key in level.keys():
        if key not in LEVEL_KEYS:
            _add_error(errors, _join_path(path, key), "unknown level key")
    if "rules" in level:
        validate_rule_block(level["rules"], _join_path(path, "rules"), errors)


def validate_levels(levels: Any, path: str, errors: list[str]) -> None:
    if not _is_object(levels):
        _add_error(errors, path, "levels must be an object")
        return
    for level_name, level_value in levels.items():
        if not isinstance(level_name, str) or not level_name.strip():
            _add_error(errors, path, "level names must be non-empty strings")
            continue
        validate_level_object(level_value, f"{path}.{level_name}", errors)


def validate_tags(tags: Any, path: str, errors: list[str]) -> None:
    if not _is_object(tags):
        _add_error(errors, path, "tags must be an object")
        return
    for key in tags.keys():
        if key not in TAG_KEYS:
            _add_error(errors, _join_path(path, key), "unknown tag key")
    if "artifact_binding" in tags:
        _validate_artifact_binding(tags["artifact_binding"], _join_path(path, "artifact_binding"), errors)


def validate_elite_requirements(raw: Any, path: str, errors: list[str]) -> None:
    if not _is_object(raw):
        _add_error(errors, path, "elite_requirements must be an object")
        return
    total_xp = raw.get("total_xp")
    if total_xp is not None and not isinstance(total_xp, (int, float)):
        _add_error(errors, _join_path(path, "total_xp"), "total_xp must be numeric")
    stages = raw.get("stages")
    if not isinstance(stages, list):
        _add_error(errors, _join_path(path, "stages"), "stages must be an array")
        return
    for index, stage in enumerate(stages):
        stage_path = f"{path}.stages[{index}]"
        if not _is_object(stage):
            _add_error(errors, stage_path, "stage must be an object")
            continue
        kind = stage.get("kind")
        if not isinstance(kind, str) or kind not in ELITE_STAGE_KINDS:
            _add_error(errors, _join_path(stage_path, "kind"), f"unsupported elite stage kind {kind!r}")
        stage_id = stage.get("id")
        if not isinstance(stage_id, str) or not stage_id.strip():
            _add_error(errors, _join_path(stage_path, "id"), "stage id is required")


def validate_type_rule_template(template: Any, path: str, errors: list[str]) -> None:
    if not _is_object(template):
        _add_error(errors, path, "type rule template must be an object")
        return
    for key in template.keys():
        if key not in {"tags", "levels", "rules"}:
            _add_error(errors, _join_path(path, key), "unknown type rule template key")
    if "tags" in template:
        validate_tags(template["tags"], _join_path(path, "tags"), errors)
    if "levels" in template:
        validate_levels(template["levels"], _join_path(path, "levels"), errors)
    if "rules" in template:
        validate_rule_block(template["rules"], _join_path(path, "rules"), errors)


def validate_entry(entry: Any, path: str, errors: list[str]) -> None:
    if not _is_object(entry):
        _add_error(errors, path, "entry must be an object")
        return
    for key in entry.keys():
        if key not in ENTRY_KEYS:
            _add_error(errors, _join_path(path, key), "unknown entry key")
    if not isinstance(entry.get("id"), str) or not entry["id"].strip():
        _add_error(errors, _join_path(path, "id"), "id is required")
    if not isinstance(entry.get("name"), str) or not entry["name"].strip():
        _add_error(errors, _join_path(path, "name"), "name is required")
    if "tags" not in entry:
        _add_error(errors, path, "entry must include tags")
    else:
        validate_tags(entry["tags"], _join_path(path, "tags"), errors)
    if "levels" in entry:
        validate_levels(entry["levels"], _join_path(path, "levels"), errors)
    if "rules" in entry:
        validate_rule_block(entry["rules"], _join_path(path, "rules"), errors)
    if "elite_requirements" in entry:
        validate_elite_requirements(entry["elite_requirements"], _join_path(path, "elite_requirements"), errors)


def validate_catalog_payload(payload: Any, source: str = "data file", strict: bool = False) -> list[str]:
    errors: list[str] = []

    if isinstance(payload, list):
        _add_error(errors, source, "top-level array payloads are legacy; use an object with schema_version/type_rules/entries")
        return errors

    if not _is_object(payload):
        _add_error(errors, source, "payload must be an object")
        return errors

    schema_version = payload.get("schema_version")
    if schema_version != CANONICAL_SCHEMA_VERSION:
        _add_error(errors, _join_path(source, "schema_version"), f"schema_version must be {CANONICAL_SCHEMA_VERSION}")

    type_rules = payload.get("type_rules", {})
    if not _is_object(type_rules):
        _add_error(errors, _join_path(source, "type_rules"), "type_rules must be an object")
    else:
        for type_name, template in type_rules.items():
            if not isinstance(type_name, str) or not type_name.strip():
                _add_error(errors, _join_path(source, "type_rules"), "type rule names must be non-empty strings")
                continue
            validate_type_rule_template(template, f"{source}.type_rules.{type_name}", errors)

    entries = payload.get("entries")
    if not isinstance(entries, list):
        _add_error(errors, _join_path(source, "entries"), "entries must be an array")
    else:
        for index, entry in enumerate(entries):
            validate_entry(entry, f"{source}.entries[{index}]", errors)

    if strict:
        legacy_top_level = [key for key in TYPE_RULES_KEYS if key in payload and key != "type_rules"]
        for key in legacy_top_level:
            _add_error(errors, _join_path(source, key), "legacy top-level key is not allowed in strict mode")

    return errors


def normalize_payload(payload: Any, source: str = "data file") -> DataFilePayload:
    if isinstance(payload, list):
        return DataFilePayload(
            entries=payload,
            type_rules={},
            extra={},
            is_object_format=False,
            schema_version=0,
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
        if key not in {"entries", "schema_version", *TYPE_RULES_KEYS}
    }

    return DataFilePayload(
        entries=entries,
        type_rules=type_rules,
        extra=extra,
        is_object_format=True,
        schema_version=int(payload.get("schema_version") or 0),
    )


def load_data_file(path: Path) -> DataFilePayload:
    return normalize_payload(load_json(path), source=path.name)


def build_payload(
    entries: list[Any],
    *,
    type_rules: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    as_object: bool = True,
    schema_version: int | None = None,
) -> Any:
    if not as_object:
        return entries

    out: dict[str, Any] = {}
    out["schema_version"] = int(schema_version or CANONICAL_SCHEMA_VERSION)
    out["type_rules"] = type_rules if isinstance(type_rules, dict) else {}

    if isinstance(extra, dict):
        for key, value in extra.items():
            if key in {"entries", "schema_version", *TYPE_RULES_KEYS}:
                continue
            out[key] = value

    out["entries"] = entries
    return out
