#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Uppdaterar:
- yrke.json -> lampliga_formagor baserat på taggar.ark_trad i:
  - basformagor.json (basförmågor)
  - formaga.json (förmågor)
  - mystisk-kraft.json (mystiska krafter)
  - ritual.json (ritualer)
- elityrke.json -> Elityrkesförmågor baserat på poster i:
  - formaga.json
  - mystisk-kraft.json
  - ritual.json
  som har typ-taggen Elityrkesförmåga

Regler:
- Ett yrke (sub-yrke) får alla objekt vars taggar.ark_trad innehåller yrkets namn.
- För övergripande yrkena Tjuv/Jägare/Krigare/Mystiker ingår även allt som är taggat med deras sub-yrken.
- Arketyptaggar kan vara lista eller kommaseparerad sträng.
- Ett elityrke får alla objekt vars taggar.typ innehåller Elityrkesförmåga och
  vars taggar.ark_trad innehåller elityrkets namn.

Output:
- Skriver uppdaterad data direkt till data/yrke.json och data/elityrke.json
- Skriver en liten rapport till stdout (räknare + okända ark_trad-taggar)

Kör:
  python3 scripts/update_lampliga_formagor.py
"""

import json
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
YRKE_PATH = BASE / "data/yrke.json"
ELITYRKE_PATH = BASE / "data/elityrke.json"
BASFORMAGA_PATH = BASE / "data/basformagor.json"
FORMAGA_PATH = BASE / "data/formaga.json"
MK_PATH = BASE / "data/mystisk-kraft.json"
RITUAL_PATH = BASE / "data/ritual.json"
OUT_YRKE_PATH = BASE / "data/yrke.json"
OUT_ELITYRKE_PATH = BASE / "data/elityrke.json"

TOP_LEVELS = ["Tjuv", "Jägare", "Krigare", "Mystiker"]
YRKE_CATEGORY_ORDER = ["Basförmåga", "Förmåga", "Mystisk kraft", "Ritual"]
ELITYRKE_CATEGORY_ORDER = ["Förmåga", "Mystisk kraft", "Ritual"]
SUBS = {
    "Tjuv": {"Bedragare", "Ligist", "Skattletare", "Gillestjuv", "Sappör", "Före detta kultist"},
    "Jägare": {"Utbygdsjägare", "Prisjägare", "Monsterjägare", "Häxjägare"},
    "Krigare": {"Bärsärkare", "Duellant", "Kapten", "Säljsvärd", "Riddare", "Ristad krigare", "Runsmed", "Vapenmästare"},
    "Mystiker": {"Häxa", "Svartkonstnär", "Teurg", "Ordensmagiker", "Självlärd besvärjare", "Symbolist", "Trollsångare"},
}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def split_tags(value):
    source = value if isinstance(value, list) else [value]
    out = []
    for item in source:
        for part in str(item or "").split(","):
            tag = part.strip()
            if tag:
                out.append(tag)
    return out


def build_exact_index(names, categories):
    return {name: {category: set() for category in categories} for name in names}


def process_items(items, type_label, valid_names, exact, unknown_tags, required_type=None):
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("namn")
        if not name:
            continue
        taggar = item.get("taggar") or {}
        if required_type and required_type not in set(split_tags(taggar.get("typ"))):
            continue
        for tag in split_tags(taggar.get("ark_trad")):
            if tag in valid_names:
                exact[tag][type_label].add(name)
            else:
                unknown_tags[tag] += 1


def merged_names(exact, categories, targets):
    merged = {category: set() for category in categories}
    for target in targets:
        if target not in exact:
            continue
        for category in categories:
            merged[category] |= exact[target][category]

    out = []
    seen = set()
    for category in categories:
        for name in sorted(merged[category], key=lambda value: value.casefold()):
            if name in seen:
                continue
            seen.add(name)
            out.append(name)
    return out


def main():
    yrke_data = load_json(YRKE_PATH)
    elityrke_data = load_json(ELITYRKE_PATH)
    bas_data = load_json(BASFORMAGA_PATH)
    form_data = load_json(FORMAGA_PATH)
    mk_data = load_json(MK_PATH)
    ritual_data = load_json(RITUAL_PATH)

    yrke_names = [entry["namn"] for entry in yrke_data]
    elityrke_names = [entry["namn"] for entry in elityrke_data]
    valid_yrken = set(yrke_names)
    valid_elityrken = set(elityrke_names)

    exact_yrke = build_exact_index(yrke_names, YRKE_CATEGORY_ORDER)
    unknown_yrke_tags = defaultdict(int)
    process_items(bas_data, "Basförmåga", valid_yrken, exact_yrke, unknown_yrke_tags)
    process_items(form_data, "Förmåga", valid_yrken, exact_yrke, unknown_yrke_tags)
    process_items(mk_data, "Mystisk kraft", valid_yrken, exact_yrke, unknown_yrke_tags)
    process_items(ritual_data, "Ritual", valid_yrken, exact_yrke, unknown_yrke_tags)

    exact_elityrke = build_exact_index(elityrke_names, ELITYRKE_CATEGORY_ORDER)
    unknown_elityrke_tags = defaultdict(int)
    process_items(
        form_data,
        "Förmåga",
        valid_elityrken,
        exact_elityrke,
        unknown_elityrke_tags,
        required_type="Elityrkesförmåga",
    )
    process_items(
        mk_data,
        "Mystisk kraft",
        valid_elityrken,
        exact_elityrke,
        unknown_elityrke_tags,
        required_type="Elityrkesförmåga",
    )
    process_items(
        ritual_data,
        "Ritual",
        valid_elityrken,
        exact_elityrke,
        unknown_elityrke_tags,
        required_type="Elityrkesförmåga",
    )

    def merged_for(yrke_name: str):
        targets = {yrke_name}
        if yrke_name in TOP_LEVELS:
            targets |= SUBS[yrke_name]
        return merged_names(exact_yrke, YRKE_CATEGORY_ORDER, targets)

    def merged_elityrkesformagor_for(elityrke_name: str):
        return merged_names(exact_elityrke, ELITYRKE_CATEGORY_ORDER, {elityrke_name})

    updated_yrken = []
    for entry in yrke_data:
        updated_entry = dict(entry)
        updated_entry["lampliga_formagor"] = merged_for(entry["namn"])
        updated_yrken.append(updated_entry)

    updated_elityrken = []
    for entry in elityrke_data:
        updated_entry = dict(entry)
        updated_entry["Elityrkesförmågor"] = merged_elityrkesformagor_for(entry["namn"])
        updated_elityrken.append(updated_entry)

    dump_json(OUT_YRKE_PATH, updated_yrken)
    dump_json(OUT_ELITYRKE_PATH, updated_elityrken)

    print(f"Skrev: {OUT_YRKE_PATH}")
    for top in TOP_LEVELS:
        print(f"{top}: {len(merged_for(top))} total")

    print(f"\nSkrev: {OUT_ELITYRKE_PATH}")
    print(
        "Elityrken med kopplade Elityrkesförmågor: "
        f"{sum(1 for name in elityrke_names if merged_elityrkesformagor_for(name))}/{len(elityrke_names)}"
    )

    if unknown_yrke_tags:
        print("\nOkända ark_trad-taggar för yrken (finns ej i yrke.json):")
        for tag, count in sorted(unknown_yrke_tags.items(), key=lambda item: (-item[1], item[0])):
            print(f"  {tag}: {count}")

    if unknown_elityrke_tags:
        print("\nOkända ark_trad-taggar för Elityrkesförmågor (finns ej i elityrke.json):")
        for tag, count in sorted(unknown_elityrke_tags.items(), key=lambda item: (-item[1], item[0])):
            print(f"  {tag}: {count}")


if __name__ == "__main__":
    main()
