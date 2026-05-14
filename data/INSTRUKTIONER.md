# Catalog Schema V3 Authoring Guide

This repository now uses one canonical English authoring schema for gameplay catalogs in `data/*.json`.

Goals:
- Keep Swedish website text and level labels.
- Keep JSON structure, rule families, and condition syntax in English.
- Reuse the same rule DSL everywhere instead of inventing one-off keys.
- Make AI-generated additions default to the existing structure.

## Canonical File Shape

Every authored gameplay catalog file should use:

```json
{
  "schema_version": 3,
  "type_rules": {},
  "entries": []
}
```

Do not use top-level arrays.
Do not use `typ_regler`.

## Canonical Entry Shape

Minimum entry shape:

```json
{
  "id": "formX",
  "name": "Exempelförmåga",
  "description": "Svensk visningstext.",
  "tags": {
    "types": ["Förmåga"]
  }
}
```

Common structural keys:

| Canonical key | Purpose |
|---|---|
| `id` | Stable unique id |
| `name` | Display name |
| `description` | Swedish prose shown on site |
| `tags` | Shared metadata |
| `levels` | Level-specific content and rules |
| `rules` | Entry-level rules |
| `elite_requirements` | Elite builder requirement profile |

Common content keys that are now also canonical:

| Canonical key | Old key |
|---|---|
| `key_traits` | `viktiga_karaktarsdrag` |
| `elite_abilities` | `Elityrkesförmågor` |
| `possible_benefits` | `mojliga_fordelar` |
| `possible_drawbacks` | `tankbara_nackdelar` |
| `requirement_abilities` | `krav_formagor` |
| `suggested_races` | `forslag_pa_slakte` |
| `suggested_abilities` | `lampliga_formagor` |
| `female_names` | `namn_kvinna` |
| `male_names` | `namn_man` |
| `trait_summary` | `sardrag` / `särdrag` |
| `stats` | `stat` |
| `base_price` | `grundpris` |
| `max_price` | `maxpris` |
| `qualities` | `kvalitet` |
| `corruption` | `korruption` |
| `negative` | `negativ` |
| `effect` | `effekt` |

Keep Swedish prose and Swedish level labels such as `Novis`, `Gesäll`, and `Mästare`.

## Tags

Canonical `tags` keys:

| Key | Meaning |
|---|---|
| `types` | Entry types |
| `traditions` | Tradition tags |
| `tests` | Test labels |
| `qualities` | Static quality tags |
| `max_count` | Max stack count |
| `hidden` | Hidden entry marker |
| `race` | Race binding |
| `artifact_binding` | Artifact payment/binding config |
| `xp` | XP/ERF metadata |
| `inventory` | Inventory grouping flag |

`arm_fast` is still accepted as a domain tag because runtime behavior depends on it.

## Levels and Actions

Canonical level-specific data lives under `levels`.

Example:

```json
{
  "levels": {
    "Novis": {
      "description": "Svensk nivåtext.",
      "actions": ["Aktiv"]
    }
  }
}
```

Canonical level keys:
- `description`
- `actions`
- `tests`
- `damage_type`
- `xp`
- `rules`

Legacy `handling` is still read during migration, but new authoring must use `levels.<Level>.actions`.

## Rule Families

Canonical rule families:
- `modify`
- `require`
- `conflict`
- `grant`
- `choice`

Every rule must have `rule_id`.

Example:

```json
{
  "rules": {
    "modify": [
      {
        "rule_id": "robust__pain_bonus",
        "target": "pain.threshold_bonus",
        "op": "add",
        "value": 1
      }
    ]
  }
}
```

Do not author:
- `andrar`
- `kraver`
- `krockar`
- `ger`
- `val`
- `regel_id`

Those are legacy compatibility aliases only.

## The `when` DSL

`when` is the only canonical condition format.

Leaf form:

```json
{ "field": "selected.names", "op": "includes", "value": "Monster" }
```

Boolean forms:

```json
{ "all": [ ... ] }
{ "any": [ ... ] }
{ "not": { ... } }
```

Allowed operators:
- `exists`
- `equals`
- `not_equals`
- `includes`
- `includes_any`
- `includes_all`
- `gt`
- `gte`
- `lt`
- `lte`

Documented field roots:
- `entry.*`
- `source.*`
- `selected.*`
- `item.*`
- `combat.*`
- `state.*`
- `row.*`

Representative supported fields:
- `entry.name`
- `entry.id`
- `entry.tags.types`
- `entry.tags.tests`
- `source.level`
- `selected.names`
- `selected.types`
- `selected.levels.by_name.Robust`
- `item.type`
- `item.types`
- `item.qualities`
- `combat.is_melee`
- `state.counts.by_type.Elityrke`
- `state.equipped.weapons.count`

## Requirements

New `require` rules should be authored with `when`.

Simple requirement:

```json
{
  "rule_id": "raw_strength__requires_robust",
  "when": {
    "field": "selected.names",
    "op": "includes",
    "value": "Robust"
  },
  "message": "Kräver Robust."
}
```

Explicit OR:

```json
{
  "rule_id": "monster_trait__source_gate",
  "when": {
    "any": [
      { "field": "selected.names", "op": "includes", "value": "Monster" },
      { "field": "selected.names", "op": "includes", "value": "Andebesvärjare" }
    ]
  }
}
```

Level requirement:

```json
{
  "rule_id": "colossal__requires_master_robust",
  "when": {
    "field": "selected.levels.by_name.Robust",
    "op": "gte",
    "value": "Mästare"
  }
}
```

Do not author:
- `name`
- `min_level`
- `grupp`
- `grupp_logik`
- `nar`
- `nagon_av_namn`
- `har_namn`
- `saknar_namn`

These are normalized from legacy data during migration, but they are not canonical authoring keys.

Note:
- Block-level `kraver_logik`, `kraver_typ_och_entry`, and `ignorera_typ_kraver` still exist as transition metadata while legacy requirement sets are being phased out.
- Prefer expressing OR inside `when.any` whenever possible.

## Numeric Changes

Canonical numeric operations:
- `add`
- `subtract`
- `multiply`
- `divide`
- `set`
- `min`
- `max`

Example:

```json
{
  "rule_id": "forge_discount",
  "target": "price.factor",
  "op": "multiply",
  "value": 0.5
}
```

Do not use `satt`, `ersatt`, or custom operation spellings in new data.

## Artifact Binding

Use `tags.artifact_binding`.

Example:

```json
{
  "tags": {
    "artifact_binding": {
      "options": [
        {
          "value": "xp",
          "label": "−1 Erfarenhetspoäng",
          "effects": {
            "xp": 1
          },
          "rules": {
            "modify": [
              {
                "rule_id": "bind_snapshot_example",
                "target": "pain.threshold_bonus",
                "formula": {
                  "bas": "mal:permanent_korruption",
                  "faktor": -1
                },
                "op": "set",
                "snapshot": true
              }
            ]
          }
        }
      ]
    }
  }
}
```

Do not nest `regler` / `andrar` inside artifact binding options in new authoring.

## Elite Requirements

`data/elityrke.json` uses the specialized elite DSL under `elite_requirements`.

Canonical shape:

```json
{
  "elite_requirements": {
    "total_xp": 120,
    "stages": [
      {
        "id": "primary",
        "kind": "primary",
        "counts_primary_baseline": true,
        "min_xp": 60,
        "min_count": 1,
        "options": [
          { "name": "Primärförmåga" }
        ]
      }
    ]
  }
}
```

Allowed stage kinds:
- `primary`
- `specific_choice`
- `tag_pool`
- `optional_pool`
- `named_count`

Use `counts_primary_baseline: true` on migrated elite profiles where the Master-level pick is also one of the required Novis baseline requirements. Without this marker the primary stage remains isolated from other requirement pools.

Do not replace elite requirements with generic `require` rules. The elite builder depends on staged overflow logic and is intentionally separate.

## AI Authoring Rules

When adding or editing data:
- Reuse existing keys and patterns.
- Add a new `rule_id` for every new rule.
- Use `when` instead of creating new condition keys.
- Prefer `selected.names`, `selected.levels.by_name.*`, and other documented fields instead of inventing new field paths.
- Keep website prose in Swedish.
- Keep structural JSON keys in English.
- If a needed behavior does not fit the documented schema, update the schema and docs first instead of inventing ad hoc JSON.

Do not invent:
- new rule families
- new condition wrapper keys
- new operator names
- Swedish structural aliases
- one-off per-file rule syntaxes

## Migration Table

| Old key | Canonical key |
|---|---|
| `namn` | `name` |
| `beskrivning` | `description` |
| `taggar` | `tags` |
| `nivåer` / `nivå_data` | `levels` |
| `handling` | `actions` |
| `regler` | `rules` |
| `typ_regler` | `type_rules` |
| `krav` | `elite_requirements` |
| `andrar` | `modify` |
| `kraver` | `require` |
| `krockar` | `conflict` |
| `ger` | `grant` |
| `val` | `choice` |
| `nar` | `when` |
| `mal` | `target` |
| `varde` | `value` |
| `formel` | `formula` |
| `meddelande` | `message` |
| `satt` | `op` |

## Validation

Authoring files are validated by:
- `python3 scripts/build_all.py --strict`
- `node scripts/migrate_catalog_schema.mjs --check`

If strict validation fails, fix the data or the documented schema. Do not bypass it by introducing aliases.
