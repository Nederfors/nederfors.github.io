#!/usr/bin/env python3
import argparse
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from data_file_schema import load_json, normalize_payload

DATA_FILES = [
    # sync-data-manifest:start
    'diverse.json',
    'kuriositeter.json',
    'skatter.json',
    'elixir.json',
    'fordel.json',
    'formaga.json',
    'basformagor.json',
    'kvalitet.json',
    'mystisk-kraft.json',
    'mystisk-kvalitet.json',
    'neutral-kvalitet.json',
    'negativ-kvalitet.json',
    'nackdel.json',
    'anstallning.json',
    'byggnader.json',
    'yrke.json',
    'ras.json',
    'elityrke.json',
    'fardmedel.json',
    'forvaring.json',
    'gardsdjur.json',
    'instrument.json',
    'klader.json',
    'specialverktyg.json',
    'tjanster.json',
    'ritual.json',
    'rustning.json',
    'mat.json',
    'dryck.json',
    'sardrag.json',
    'monstruost-sardrag.json',
    'artefakter.json',
    'lagre-artefakter.json',
    'fallor.json',
    'avstandsvapen.json',
    'narstridsvapen.json',
    # sync-data-manifest:end
]

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / 'data'
OUTPUT_FILE = DATA_DIR / 'all.json'
RITUAL_LEVELS = ('Enkel', 'Ordinär', 'Avancerad')
MYSTIC_LEVELS = ('Novis', 'Gesäll', 'Mästare')


def checksum(data) -> str:
    dumped = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    digest = hashlib.sha256(dumped.encode('utf-8')).hexdigest()
    return f'sha256-{digest}'


def split_tags(value):
    source = value if isinstance(value, list) else [value]
    out = []
    for item in source:
        for part in str(item or '').split(','):
            tag = part.strip()
            if tag:
                out.append(tag)
    return out


def get_level_data(tags):
    if not isinstance(tags, dict):
        return {}
    primary = tags.get('nivå_data')
    legacy = tags.get('niva_data')
    if isinstance(primary, dict) and isinstance(legacy, dict):
        merged = dict(legacy)
        merged.update(primary)
        return merged
    if isinstance(primary, dict):
        return primary
    if isinstance(legacy, dict):
        return legacy
    return {}


def validate_entry_schema(entry, source_file, index, warnings):
    if not isinstance(entry, dict):
        warnings.append(f'{source_file}[{index}] är inte ett objekt.')
        return

    tags = entry.get('taggar') or {}
    if not isinstance(tags, dict):
        return

    name = entry.get('namn') or entry.get('id') or f'index {index}'
    types = split_tags(tags.get('typ'))
    level_data = get_level_data(tags)

    if 'niva_data' in tags:
        warnings.append(f'{source_file}[{index}] ({name}) använder legacy-fältet "niva_data".')

    if 'Ritual' in types:
        simple = level_data.get('Enkel')
        if not isinstance(simple, dict):
            warnings.append(f'{source_file}[{index}] ({name}) ritual saknar nivå_data.Enkel.')
        else:
            handling = str(simple.get('handling') or '').strip()
            if handling.lower() != 'speciell':
                warnings.append(f'{source_file}[{index}] ({name}) ritual bör ha handling "Speciell" på nivå Enkel.')
            tests = simple.get('test')
            if not isinstance(tests, list):
                warnings.append(f'{source_file}[{index}] ({name}) ritual bör ha test-lista på nivå Enkel.')

    if 'Basförmåga' in types:
        if not level_data:
            warnings.append(f'{source_file}[{index}] ({name}) basförmåga saknar nivå_data.')
        else:
            valid_levels = [lvl for lvl in level_data if lvl in RITUAL_LEVELS]
            if len(valid_levels) == 0:
                warnings.append(f'{source_file}[{index}] ({name}) basförmåga saknar Enkel/Ordinär/Avancerad i nivå_data.')
            if len(valid_levels) > 1:
                warnings.append(f'{source_file}[{index}] ({name}) basförmåga har fler än en nivå i nivå_data ({", ".join(valid_levels)}).')

    if 'Mystisk kraft' in types and level_data:
        invalid = [lvl for lvl in level_data if lvl not in MYSTIC_LEVELS]
        if invalid:
            warnings.append(f'{source_file}[{index}] ({name}) mystisk kraft har oväntade nivånycklar: {", ".join(invalid)}.')


def parse_args():
    parser = argparse.ArgumentParser(description='Bygger data/all.json från datafiler.')
    parser.add_argument('--strict', action='store_true', help='Avbryt med felkod om schema-varningar hittas.')
    parser.add_argument('--pretty', action='store_true', help='Skriv all.json med indentering.')
    return parser.parse_args()


def main():
    args = parse_args()
    entries = []
    sources = []
    warnings = []
    duplicate_ids = []
    seen_ids = {}

    for filename in DATA_FILES:
        source_path = DATA_DIR / filename
        payload = load_json(source_path)
        parsed = normalize_payload(payload, source=filename)
        data = parsed.entries
        for idx, entry in enumerate(data):
            validate_entry_schema(entry, filename, idx, warnings)
            entry_id = entry.get('id') if isinstance(entry, dict) else None
            if entry_id is not None:
                if entry_id in seen_ids:
                    prev_file, prev_idx = seen_ids[entry_id]
                    duplicate_ids.append((entry_id, prev_file, prev_idx, filename, idx))
                else:
                    seen_ids[entry_id] = (filename, idx)
        entries.extend(data)
        sources.append({
            'file': f'data/{filename}',
            'count': len(data),
            'checksum': checksum(payload),
            'typeRuleCount': len(parsed.type_rules)
        })

    bundle = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'totalCount': len(entries),
        'sources': sources,
        'entries': entries
    }

    with OUTPUT_FILE.open('w', encoding='utf-8') as handle:
        if args.pretty:
            json.dump(bundle, handle, ensure_ascii=False, indent=2)
        else:
            json.dump(bundle, handle, ensure_ascii=False)
        handle.write('\n')

    print(f'Wrote {len(entries)} entries to {OUTPUT_FILE.relative_to(ROOT_DIR)}')
    if duplicate_ids:
        print(f'Varning: hittade {len(duplicate_ids)} dubblett-id:n.')
        for dup in duplicate_ids[:20]:
            entry_id, prev_file, prev_idx, cur_file, cur_idx = dup
            print(f'  id "{entry_id}" i {prev_file}[{prev_idx}] och {cur_file}[{cur_idx}]')
        if len(duplicate_ids) > 20:
            print(f'  ... samt {len(duplicate_ids) - 20} till.')
    if warnings:
        print(f'Schema-varningar: {len(warnings)}')
        for row in warnings[:40]:
            print(f'  - {row}')
        if len(warnings) > 40:
            print(f'  ... samt {len(warnings) - 40} till.')
        if args.strict:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
