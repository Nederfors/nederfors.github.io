#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Uppdaterar yrke.json -> lampliga_formagor baserat på taggar.ark_trad i:
- formaga_fixed.json (förmågor)
- mystisk-kraft.json (mystiska krafter)
- ritual.json (ritualer)

Regler:
- Ett yrke (sub-yrke) får alla objekt vars taggar.ark_trad innehåller yrkets namn.
- För övergripande yrkena Tjuv/Jägare/Krigare/Mystiker ingår även allt som är taggat med deras sub-yrken.

Output:
- yrke_updated_auto.json
- skriver även en liten rapport till stdout (räknare + okända ark_trad-taggar)

Kör:
  python update_lampliga_formagor.py
"""

import json
from collections import defaultdict
from pathlib import Path

BASE = Path(".")
YRKE_PATH = BASE / "yrke.json"
FORMAGA_PATH = BASE / "formaga_fixed.json"   # byt till formaga.json om du vill
MK_PATH = BASE / "mystisk-kraft.json"
RITUAL_PATH = BASE / "ritual.json"
OUT_PATH = BASE / "yrke_updated_auto.json"

TOP_LEVELS = ["Tjuv", "Jägare", "Krigare", "Mystiker"]
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

def main():
    yrke_data = load_json(YRKE_PATH)
    form_data = load_json(FORMAGA_PATH)
    mk_data = load_json(MK_PATH)
    ritual_data = load_json(RITUAL_PATH)

    yrke_names = [y["namn"] for y in yrke_data]
    valid_yrken = set(yrke_names)

    # exact[yrke]["Formåga"/"Mystisk kraft"/"Ritual"] = set(namn)
    exact = {y: {"Formåga": set(), "Mystisk kraft": set(), "Ritual": set()} for y in yrke_names}
    unknown_tags = defaultdict(int)

    def process_items(items, type_label):
        for it in items:
            name = it.get("namn")
            tags = it.get("taggar", {}).get("ark_trad", [])
            if not isinstance(tags, list):
                continue
            for t in tags:
                if t in valid_yrken:
                    exact[t][type_label].add(name)
                else:
                    unknown_tags[t] += 1

    process_items(form_data, "Formåga")
    process_items(mk_data, "Mystisk kraft")
    process_items(ritual_data, "Ritual")

    def merged_for(yrke_name: str):
        targets = {yrke_name}
        if yrke_name in TOP_LEVELS:
            targets |= SUBS[yrke_name]

        merged = {"Formåga": set(), "Mystisk kraft": set(), "Ritual": set()}
        for t in targets:
            if t in exact:
                for k in merged:
                    merged[k] |= exact[t][k]

        # Samma ordning varje gång: förmågor, krafter, ritualer (var för sig sorterade)
        return sorted(merged["Formåga"]) + sorted(merged["Mystisk kraft"]) + sorted(merged["Ritual"])

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
