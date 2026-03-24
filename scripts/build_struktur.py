#!/usr/bin/env python3
import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from data_file_schema import load_json, normalize_payload, validate_catalog_payload

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / 'data'
OUTPUT_FILE = DATA_DIR / 'struktur.json'
MANIFEST_FILE = ROOT_DIR / 'scripts' / 'generated' / 'data_manifest.json'
EXCLUDED_FILES = {'ai-plugin.json', 'all.json', 'struktur.json', 'pdf-list.json'}


def parse_args():
    parser = argparse.ArgumentParser(
        description='Bygger data/struktur.json med representativa exempel per entry-typ.'
    )
    parser.add_argument(
        '--max-examples',
        type=int,
        default=3,
        help='Max antal exempel per typ (default: 3).'
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Avbryt om en källfil inte följer datafil-schemat.'
    )
    return parser.parse_args()


def split_tags(value):
    source = value if isinstance(value, list) else [value]
    out = []
    for item in source:
        for part in str(item or '').split(','):
            tag = part.strip()
            if tag:
                out.append(tag)
    return out


def get_entry_tags(entry):
    tags = entry.get('tags')
    if isinstance(tags, dict):
        return tags
    tags = entry.get('taggar')
    if isinstance(tags, dict):
        return tags
    return {}


def discover_data_files():
    if MANIFEST_FILE.exists():
        manifest = load_json(MANIFEST_FILE)
        names = manifest.get('entryDataFiles') or []
        files = []
        for name in names:
            path = DATA_DIR / str(name)
            if path.exists():
                files.append(path)
        if files:
            return files

    files = []
    for path in sorted(DATA_DIR.glob('*.json'), key=lambda p: p.name.casefold()):
        if path.name in EXCLUDED_FILES:
            continue
        files.append(path)
    return files


def build_structure(max_examples, strict=False):
    type_examples = defaultdict(list)
    type_counts = defaultdict(int)
    type_sources = defaultdict(set)
    processed_files = []
    skipped_files = []

    for path in discover_data_files():
        try:
            raw_payload = load_json(path)
            errors = validate_catalog_payload(raw_payload, source=path.name, strict=strict)
            if errors:
                if strict:
                    raise ValueError("; ".join(errors))
                skipped_files.extend(errors)
                continue
            payload = normalize_payload(raw_payload, source=path.name)
        except ValueError as err:
            msg = str(err)
            if strict:
                raise
            skipped_files.append(msg)
            continue

        processed_files.append(path.name)
        rel_source = f'data/{path.name}'
        for entry in payload.entries:
            if not isinstance(entry, dict):
                continue
            tags = get_entry_tags(entry)
            entry_types = split_tags(tags.get('types') or tags.get('typ'))
            if not entry_types:
                continue
            for entry_type in entry_types:
                type_counts[entry_type] += 1
                type_sources[entry_type].add(rel_source)
                if len(type_examples[entry_type]) < max_examples:
                    type_examples[entry_type].append(entry)

    out = {
        '_meta': {
            'beskrivning': (
                f'Ett representativt exempel med upp till {max_examples} poster '
                'för varje datatyp (tagg) hittad i källfilerna.'
            ),
            'språk': 'Svenska',
            'genererad': datetime.now(timezone.utc).isoformat(),
            'antal_typer_hittade': len(type_examples),
            'källfiler': [f'data/{name}' for name in processed_files]
        }
    }
    if skipped_files:
        out['_meta']['överhoppade_filer'] = skipped_files

    for entry_type in sorted(type_examples, key=lambda s: s.casefold()):
        out[entry_type] = {
            'antal': type_counts[entry_type],
            'källfiler': sorted(type_sources[entry_type], key=str.casefold),
            'exempel': type_examples[entry_type]
        }

    with OUTPUT_FILE.open('w', encoding='utf-8') as handle:
        json.dump([out], handle, ensure_ascii=False, indent=2)
        handle.write('\n')

    print(f'Skrev {OUTPUT_FILE.relative_to(ROOT_DIR)} med {len(type_examples)} typer.')
    return len(type_examples)


def main():
    args = parse_args()
    max_examples = max(1, int(args.max_examples))
    build_structure(max_examples=max_examples, strict=args.strict)


if __name__ == '__main__':
    main()
