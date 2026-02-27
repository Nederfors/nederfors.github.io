#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Uppdaterar yrke.json -> lampliga_formagor baserat på taggar.ark_trad i:
- basformagor.json (basförmågor)
- formaga.json (förmågor)
- mystisk-kraft.json (mystiska krafter)
- ritual.json (ritualer)

Regler:
- Ett yrke (sub-yrke) får alla objekt vars taggar.ark_trad innehåller yrkets namn.
- För övergripande yrkena Tjuv/Jägare/Krigare/Mystiker ingår även allt som är taggat med deras sub-yrken.
- Arketyptaggar kan vara lista eller kommaseparerad sträng.

Output:
- Skriver uppdaterad data direkt till data/yrke.json
- Skriver en liten rapport till stdout (räknare + okända ark_trad-taggar)

Kör:
  python3 scripts/update_lampliga_formagor.py
"""

import json
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
YRKE_PATH = BASE / "data/yrke.json"
BASFORMAGA_PATH = BASE / "data/basformagor.json"
FORMAGA_PATH = BASE / "data/formaga.json"
MK_PATH = BASE / "data/mystisk-kraft.json"
RITUAL_PATH = BASE / "data/ritual.json"
OUT_PATH = BASE / "data/yrke.json"

TOP_LEVELS = ["Tjuv", "Jägare", "Krigare", "Mystiker"]
CATEGORY_ORDER = ["Basförmåga", "Förmåga", "Mystisk kraft", "Ritual"]
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

def main():
    yrke_data = load_json(YRKE_PATH)
    bas_data = load_json(BASFORMAGA_PATH)
    form_data = load_json(FORMAGA_PATH)
    mk_data = load_json(MK_PATH)
    ritual_data = load_json(RITUAL_PATH)

    yrke_names = [y["namn"] for y in yrke_data]
    valid_yrken = set(yrke_names)

    # exact[yrke][kategori] = set(namn)
    exact = {y: {category: set() for category in CATEGORY_ORDER} for y in yrke_names}
    unknown_tags = defaultdict(int)

    def process_items(items, type_label):
        for it in items:
            if not isinstance(it, dict):
                continue
            name = it.get("namn")
            if not name:
                continue
            tags = split_tags((it.get("taggar") or {}).get("ark_trad"))
            for tag in tags:
                if tag in valid_yrken:
                    exact[tag][type_label].add(name)
                else:
                    unknown_tags[tag] += 1

    process_items(bas_data, "Basförmåga")
    process_items(form_data, "Förmåga")
    process_items(mk_data, "Mystisk kraft")
    process_items(ritual_data, "Ritual")

    def merged_for(yrke_name: str):
        targets = {yrke_name}
        if yrke_name in TOP_LEVELS:
            targets |= SUBS[yrke_name]

        merged = {category: set() for category in CATEGORY_ORDER}
        for t in targets:
            if t in exact:
                for k in merged:
                    merged[k] |= exact[t][k]

        # Samma ordning varje gång: basförmågor, förmågor, krafter, ritualer.
        out = []
        seen = set()
        for category in CATEGORY_ORDER:
            for name in sorted(merged[category], key=lambda s: s.casefold()):
                if name in seen:
                    continue
                seen.add(name)
                out.append(name)
        return out

    updated = []
    for y in yrke_data:
        y2 = dict(y)
        y2["lampliga_formagor"] = merged_for(y["namn"])
        updated.append(y2)

    dump_json(OUT_PATH, updated)

    # Rapport
    print(f"Skrev: {OUT_PATH}")
    for top in TOP_LEVELS:
        print(f"{top}: {len(merged_for(top))} total")

    if unknown_tags:
        print("\nOkända ark_trad-taggar (finns ej i yrke.json):")
        for tag, cnt in sorted(unknown_tags.items(), key=lambda x: (-x[1], x[0])):
            print(f"  {tag}: {cnt}")

if __name__ == "__main__":
    main()
