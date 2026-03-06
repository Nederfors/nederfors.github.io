# Data README: JSON Entry Schema and Rule Authoring

This document explains how to structure entries in `data/*.json`, how rule definitions drive calculations, and how to keep generated data files up to date.

## 1) Scope and Data Flow

Source-of-truth files are the entry arrays in `data/*.json` (except generated files).

Generated/derived files:
- `data/all.json` (built aggregate bundle)
- `data/struktur.json` (sample structure overview)
- `scripts/generated/data_manifest.json` (entry file manifest)
- `sw.js` cache list, plus sync markers in `js/main.js`, HTML pages, and `js/app-bootstrap.js`
- Derived content fields in some files (`lampliga_formagor`, `Elityrkesförmågor`)

Do not hand-edit generated files. Edit source entry files, then run the sync workflow (see section 12).

## 2) File-Level Rules

Each source data file must:
- Be valid UTF-8 JSON.
- Have a top-level array (`[]`).
- Contain entry objects as array items.

The build pipeline expects source files from `scripts/generated/data_manifest.json` / `scripts/build_all.py`.

## 3) Canonical Entry Shape

Minimal entry:

```json
{
  "id": "unique-id",
  "namn": "Entry name",
  "taggar": {
    "typ": ["Förmåga"]
  }
}
```

Typical full entry:

```json
{
  "id": "form4",
  "namn": "Dominera",
  "beskrivning": "Lore/rules text",
  "taggar": {
    "typ": ["Förmåga"],
    "ark_trad": ["Krigare", "Teurg"],
    "test": ["Övertygande"],
    "nivå_data": {
      "Novis": { "handling": "Passiv", "skadetyp": "Ingen" },
      "Gesäll": { "handling": "Fri", "skadetyp": "Ingen" },
      "Mästare": { "handling": "Aktiv", "skadetyp": "Ingen" }
    },
    "regler": {
      "andrar": [
        {
          "mal": "anfall_karaktarsdrag",
          "satt": "ersatt",
          "varde": "Övertygande",
          "nar": { "narstrid": true }
        }
      ]
    }
  },
  "nivåer": {
    "Novis": "Text",
    "Gesäll": "Text",
    "Mästare": "Text"
  },
  "effekt": "Short summary"
}
```

## 4) Core Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Must be globally unique across all source files. |
| `namn` | string | Yes | Display name and lookup key. |
| `taggar` | object | Yes | Main metadata/rule container. |
| `taggar.typ` | array or comma string | Yes | Entry type tags. Arrays are preferred. |
| `beskrivning` | string | Recommended | Full descriptive text shown in UI. |
| `nivåer` | object | Optional | Level text by level name (`Novis`, `Gesäll`, etc). |
| `taggar.nivå_data` | object | Optional | Structured per-level metadata/rules. |
| `taggar.regler` | object | Optional | Data-driven rule blocks (`andrar`, `kraver`, `krockar`, `ger`, `val`). |
| `taggar.ark_trad` | array/string | Optional | Archetype/tradition tags. |
| `taggar.test` | array/string | Optional | Trait/check tags used in filters and UX. |
| `stat` | object | Optional | Numeric/mechanical values (ex: `skada`, `skydd`, `begränsning`, `vikt`, `bärkapacitet`). |
| `grundpris` | object | Optional | Money object: `daler`, `skilling`, `örtegar`. |
| `maxpris` | object | Optional | Optional max price cap for specific items. |
| `kvalitet` | array/string | Optional | Built-in qualities, combined with `taggar.kvalitet`. |
| `kan_införskaffas_flera_gånger` | boolean | Optional | Repeatable entry flag (especially relevant for Fördel/Nackdel behavior). |
| `taggar.dold` | boolean | Optional | Hidden from normal list results until explicitly searched. |
| `effekt` | string | Optional | Short summary text. |
| `krav` | object | Elityrke entries | Legacy elityrke requirement model (section 10). |

Specialized inventory/artefact fields also exist (`taggar.inventory`, `bound`, `boundLabel`, `traits`) and are consumed by inventory UI logic.

## 5) Levels and Level Data

Use:
- `nivåer` for display text.
- `taggar.nivå_data` for machine-readable metadata and per-level rules.

Preferred key is `nivå_data`. Legacy `niva_data` is still read, but should not be authored in new/updated entries.

### Level rule merge behavior

For Novis/Gesäll/Mästare entries:
- Rules inherit cumulatively from lower levels to selected level.

For levels outside that progression (for example Enkel/Ordinär/Avancerad):
- Exact-level rules are used.

## 6) Rule System (`taggar.regler` / `taggar.nivå_data.<level>.regler`)

Allowed rule block keys:
- `andrar`
- `kraver`
- `krockar`
- `ger`
- `val`

Unknown top-level rule keys are ignored by rule normalization.

Each rule block key accepts an array (or single object that is normalized as array).

Common rule fields:
- `mal`: target/calculation key.
- `varde`: numeric or string value depending on `mal`.
- `satt`: operation mode (typically `add` or `ersatt`).
- `nar`: condition object.
- `formel`: formula string or object.

### `satt`

- `add` (or omitted): additive.
- `ersatt` (and `satt` alias in numeric application): replace/override current value.

## 7) Condition Grammar (`nar`)

Supported condition keys are context-sensitive. Commonly used keys:

List/presence conditions:
- `har_namn`
- `saknar_namn`
- `nagon_av_namn`

Source-level gate:
- `kalla_niva_minst`

Armor/weapon conditions:
- `har_utrustad_typ`
- `antal_utrustade_vapen_minst`
- `har_utrustad_vapen_typ`
- `ej_utrustad_vapen_typ`
- `har_utrustad_vapen_kvalitet`
- `ej_utrustad_vapen_kvalitet`

Item conditions:
- `foremal.typ`
- `foremal.ingen_typ`
- `foremal.nagon_kvalitet`

Combat flags:
- `narstrid`
- `avstand`
- `overtag`
- `efter_forflyttning`

Inventory/row conditions:
- `trait`

Target filters in rule matching flows:
- `namn`
- `typ`
- `ark_trad`

Advanced computed-value conditions (only where computed values are passed):
- `mal_minst`
- `mal_saknas`
- `har_mal`

## 8) `mal` Catalog (What Rules Can Modify/Grant)

Common `andrar` targets:
- `forsvar_modifierare`
- `traffsaker_modifierare_vapen`
- `anfall_karaktarsdrag`
- `forsvar_karaktarsdrag`
- `dansande_forsvar_karaktarsdrag`
- `mystik_karaktarsdrag`
- `barkapacitet_stark`
- `barkapacitet_faktor`
- `barkapacitet_tillagg`
- `barkapacitet_bas`
- `talighet_bas`
- `talighet_faktor`
- `talighet_tillagg`
- `smartgrans_faktor`
- `smartgrans_tillagg`
- `korruptionstroskel`
- `styggelsetroskel`
- `permanent_korruption_faktor`
- `begransning_modifierare`
- `begransning_modifierare_fast`
- `nollstall_begransning_modifierare`
- `karaktarsdrag_max_tillagg`

Common `ger` targets:
- `post` (grant entries by `id`/`namn`; supports `gratis_upp_till`, `beviljad_niva`)
- `foremal` (grant inventory items with quantities)
- `pengar` (`daler`, `skilling`, `ortegar`)
- `permanent_korruption`
- `skydd_permanent_korruption`

Requirement/conflict blocks:
- `kraver`: hard requirements.
- `krockar`: incompatibilities/replacements.

If you add a new `mal`, update both runtime logic (`js/rules-helper.js`) and this document.

## 9) Formula Authoring (`formel`)

`formel` can be:

1) String formula:
- `viljestark`
- `hel_viljestark`
- `halv_viljestark_uppat`
- `halv_viljestark_nedat`
- `stark_plus_3`
- `stark_x_1_5_plus_3`
- `stark_x_0_5_plus_3`
- `halv_permanent_korruption_nedat`
- `fjardedel_aktuell_smartgrans_nedat`
- `fjardedel_korruptionstroskel_uppat`
- `niva`

2) Object formula:

```json
{
  "bas": "stark",
  "faktor": 1.5,
  "division": 2,
  "tillagg": 3,
  "avrunda": "uppat"
}
```

Object formula fields:
- `bas`: base source (`niva`, `mal:<name>`, `attribut:<name>`, or direct option key)
- `faktor`: multiply
- `division`: divide
- `tillagg`: add offset
- `avrunda`: `uppat`, `nedat`, or `narmast`

## 10) Elityrke `krav` Model (Legacy but Active)

Elityrke entries still use `krav` and are normalized by `js/elite-utils.js`.

Main keys:
- `primarformaga`
- `primartagg`
- `sekundartagg`
- `valfri_inom_tagg`
- `specifika_formagor`
- `specifika_mystiska_krafter`
- `specifika_ritualer`
- `specifika_fordelar`
- `specifika_nackdelar`

Minimal example:

```json
{
  "krav": {
    "primarformaga": { "namn": "Häxkonster" },
    "valfri_inom_tagg": [
      { "typ": "Mystisk kraft", "min_antal": 1, "min_erf": 10 }
    ],
    "specifika_formagor": {
      "namn": ["Medicus", "Naturlig krigare"],
      "min_erf": 20,
      "min_antal": 0
    }
  }
}
```

## 11) Type-Specific Validation Rules Enforced in Build

`scripts/build_all.py` validates additional constraints:

- Ritual entries:
  - Should have `taggar.nivå_data.Enkel`.
  - `handling` on `Enkel` should be `Speciell`.
  - `test` on `Enkel` should be a list.

- Basförmåga entries:
  - Should have `taggar.nivå_data`.
  - Should define exactly one of `Enkel`, `Ordinär`, `Avancerad`.

- Mystisk kraft entries:
  - If level data exists, level keys should be `Novis`, `Gesäll`, `Mästare`.

- Legacy field warning:
  - `taggar.niva_data` is allowed but warned as legacy.

- Duplicate IDs:
  - Duplicate `id` values across files are reported.

## 12) Mandatory Keep-Up-To-Date Workflow

Run this every time you change anything in `data/*.json`:

```bash
python3 scripts/master_sync.py
python3 scripts/build_all.py --strict
osascript -l JavaScript scripts/verify_rules_helper.js
```

What this does:
- Syncs manifest and page bundle references.
- Rebuilds `data/all.json` and `data/struktur.json`.
- Refreshes derived yrke/elityrke ability lists.
- Validates schema warnings as errors (`--strict`).
- Verifies rules-helper behavior against regression tests.

Then:
- Review `git diff`.
- Ensure generated files are committed with source changes.
- Update this README if you introduced new fields, new `mal`, new `nar` keys, or new formula patterns.

This documentation must always reflect the live data model and rule engine.

## 13) Authoring Guidelines

- Keep `id` stable forever once published.
- Prefer arrays over comma-separated strings for tag lists.
- Keep keys consistent (`nivå_data`, not `niva_data`).
- Keep rule changes small and explicit; prefer one concern per rule object.
- Use `krockar` for incompatibilities and `kraver` for prerequisites.
- Put numeric/stat-driving logic in rules, not only in free-text `nivåer`.
- Avoid hidden coupling: if a rule depends on another entry name, verify spelling exactly.
- When adding a new source data file, run `python3 scripts/sync_data_manifest.py` (or full `master_sync`) immediately.

