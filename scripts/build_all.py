#!/usr/bin/env python3
import argparse
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

from catalog_files import load_catalog_files
from data_file_schema import build_payload, load_json, normalize_payload, validate_catalog_payload

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / 'data'
OUTPUT_FILE = DATA_DIR / 'all.json'
INDEX_CATALOG_FILE = DATA_DIR / 'index-catalog.json'
TABLES_FILE = DATA_DIR / 'tabeller.json'
RITUAL_LEVELS = ('Enkel', 'Ordinär', 'Avancerad')
MYSTIC_LEVELS = ('Novis', 'Gesäll', 'Mästare')
WILDCARD_REFERENCE_NAMES = {'*'}


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


def compact_tags(tags):
    if not isinstance(tags, dict):
        return {}
    aliases = {
        'types': 'typ',
        'traditions': 'ark_trad',
        'tests': 'test',
        'qualities': 'kvalitet',
        'hidden': 'dold',
        'max_count': 'max_antal',
    }
    keep = {}
    for key in ('typ', 'types', 'ark_trad', 'traditions', 'test', 'tests', 'dold', 'hidden', 'max_antal', 'max_count', 'kvalitet', 'qualities'):
        if key not in tags:
            continue
        keep[aliases.get(key, key)] = tags[key]
    return keep


def search_parts(value):
    parts = []
    if isinstance(value, dict):
        for item in value.values():
            parts.extend(search_parts(item))
    elif isinstance(value, list):
        for item in value:
            parts.extend(search_parts(item))
    elif value is not None:
        text = str(value).strip()
        if text:
            parts.append(text)
    return parts


def searchable_levels(levels):
    if not isinstance(levels, dict):
        return {}
    keep = {}
    allowed = {'description', 'beskrivning', 'actions', 'handling', 'tests', 'test', 'damage_type', 'skadetyp'}
    for level, data in levels.items():
        if isinstance(data, dict):
            keep[level] = {key: value for key, value in data.items() if key in allowed}
        else:
            keep[level] = data
    return keep


def summarize_entry(entry, source_file, source_index, table=False):
    if not isinstance(entry, dict):
        return {}
    tags = get_entry_tags(entry)
    summary_tags = compact_tags(tags)
    levels = get_entry_levels(entry, tags)
    level_keys = list(levels.keys()) if isinstance(levels, dict) else []
    search_text = ' '.join(search_parts([
        entry.get('namn'),
        entry.get('name'),
        summary_tags,
        level_keys,
        entry.get('beskrivning'),
        entry.get('description'),
        entry.get('extra'),
        searchable_levels(levels),
        entry.get('kolumner') if table else None,
        entry.get('rader') if table else None,
    ]))
    search_limit = 900 if table else 360
    if len(search_text) > search_limit:
        search_text = search_text[:search_limit].rsplit(' ', 1)[0]

    summary = {
        '__catalogSummary': True,
        '__sourceFile': f'data/{source_file}',
        '__sourceIndex': source_index,
        'id': entry.get('id'),
        'namn': entry.get('namn') or entry.get('name') or entry.get('id') or '',
        'taggar': summary_tags,
        'nivåer': {key: '' for key in level_keys},
        '__levelKeys': level_keys,
        '__searchText': search_text,
    }
    if table:
        summary['__catalogTable'] = True
        summary['kolumner'] = []
        summary['rader'] = []
    return summary


def get_level_data(tags):
    if not isinstance(tags, dict):
        return {}
    primary = tags.get('levels')
    if isinstance(primary, dict):
        return primary
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


def get_entry_levels(entry, tags):
    if isinstance(entry.get('levels'), dict):
        return entry.get('levels')
    return get_level_data(tags)


def get_entry_tags(entry):
    tags = entry.get('tags')
    if isinstance(tags, dict):
        return tags
    tags = entry.get('taggar')
    if not isinstance(tags, dict):
        return {}
    return tags


def validate_entry_schema(entry, source_file, index, warnings):
    if not isinstance(entry, dict):
        warnings.append(f'{source_file}[{index}] är inte ett objekt.')
        return

    tags = get_entry_tags(entry)
    if not isinstance(tags, dict):
        return

    name = entry.get('name') or entry.get('namn') or entry.get('id') or f'index {index}'
    types = split_tags(tags.get('types') or tags.get('typ'))
    level_data = get_entry_levels(entry, tags)

    if 'niva_data' in tags:
        warnings.append(f'{source_file}[{index}] ({name}) använder legacy-fältet "niva_data".')

    if 'Ritual' in types:
        simple = level_data.get('Enkel')
        if not isinstance(simple, dict):
            warnings.append(f'{source_file}[{index}] ({name}) ritual saknar levels.Enkel.')
        else:
            handling = str(simple.get('actions') or simple.get('handling') or '').strip()
            if handling.lower() != 'speciell':
                warnings.append(f'{source_file}[{index}] ({name}) ritual bör ha handling "Speciell" på nivå Enkel.')
            if 'tests' in simple or 'test' in simple:
                tests = simple.get('tests') if 'tests' in simple else simple.get('test')
                if not isinstance(tests, list):
                    warnings.append(f'{source_file}[{index}] ({name}) ritualtest måste vara en lista när det anges.')

    if 'Basförmåga' in types:
        if not level_data:
            warnings.append(f'{source_file}[{index}] ({name}) basförmåga saknar levels.')
        else:
            valid_levels = [lvl for lvl in level_data if lvl in RITUAL_LEVELS]
            if len(valid_levels) == 0:
                warnings.append(f'{source_file}[{index}] ({name}) basförmåga saknar Enkel/Ordinär/Avancerad i levels.')
            if len(valid_levels) > 1:
                warnings.append(f'{source_file}[{index}] ({name}) basförmåga har fler än en nivå i levels ({", ".join(valid_levels)}).')

    if 'Mystisk kraft' in types and level_data:
        invalid = [lvl for lvl in level_data if lvl not in MYSTIC_LEVELS]
        if invalid:
            warnings.append(f'{source_file}[{index}] ({name}) mystisk kraft har oväntade nivånycklar: {", ".join(invalid)}.')


def normalize_reference(value):
    return str(value or '').strip().casefold()


def validate_cross_catalog_integrity(entries_with_source):
    errors = []
    by_id = {}
    by_name = defaultdict(list)

    for entry, source_file, source_index in entries_with_source:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get('id') or '').strip()
        entry_name = str(entry.get('name') or entry.get('namn') or '').strip()
        if entry_id:
            previous = by_id.get(entry_id)
            if previous:
                errors.append(
                    f'duplicate id {entry_id!r}: {previous[0]}[{previous[1]}] and {source_file}[{source_index}]'
                )
            else:
                by_id[entry_id] = (source_file, source_index)
        if entry_name:
            by_name[normalize_reference(entry_name)].append((entry_name, entry_id, source_file, source_index))

        fixture_probe = f'{entry_id} {entry_name}'.casefold()
        if 'placeholder' in fixture_probe:
            errors.append(f'{source_file}[{source_index}] ({entry_name or entry_id}) contains a production placeholder')

    for rows in by_name.values():
        if len(rows) < 2:
            continue
        locations = ', '.join(f'{row[2]}[{row[3]}] ({row[1]})' for row in rows)
        errors.append(f'duplicate entry name {rows[0][0]!r}: {locations}')

    known_ids = set(by_id)
    known_names = set(by_name)

    def require_id(raw, path):
        entry_id = str(raw or '').strip()
        if entry_id and entry_id not in known_ids:
            errors.append(f'{path} references unknown entry id {entry_id!r}')

    def require_name(raw, path):
        name = str(raw or '').strip()
        if not name or name in WILDCARD_REFERENCE_NAMES:
            return
        if normalize_reference(name) not in known_names:
            errors.append(f'{path} references unknown entry name {name!r}')

    def validate_grant(rule, path):
        if not isinstance(rule, dict):
            return
        target = str(rule.get('target') or '').strip()
        if target == 'entry':
            names = rule.get('name')
            if isinstance(names, list):
                for index, name in enumerate(names):
                    require_name(name, f'{path}.name[{index}]')
            elif names is not None:
                require_name(names, f'{path}.name')
            if rule.get('id') is not None:
                require_id(rule.get('id'), f'{path}.id')
        if target == 'item':
            items = rule.get('foremal')
            if isinstance(items, list):
                for index, item in enumerate(items):
                    if isinstance(item, dict) and item.get('id') is not None:
                        require_id(item.get('id'), f'{path}.foremal[{index}].id')

    def walk_rules(value, path):
        if isinstance(value, list):
            for index, item in enumerate(value):
                walk_rules(item, f'{path}[{index}]')
            return
        if not isinstance(value, dict):
            return
        for key, child in value.items():
            child_path = f'{path}.{key}'
            if key == 'grant' and isinstance(child, list):
                for index, rule in enumerate(child):
                    validate_grant(rule, f'{child_path}[{index}]')
            walk_rules(child, child_path)

    for entry, source_file, source_index in entries_with_source:
        if not isinstance(entry, dict):
            continue
        base_path = f'{source_file}[{source_index}]'
        walk_rules(entry.get('rules'), f'{base_path}.rules')
        walk_rules(entry.get('levels'), f'{base_path}.levels')

        requirements = entry.get('elite_requirements')
        stages = requirements.get('stages') if isinstance(requirements, dict) else None
        if isinstance(stages, list):
            for stage_index, stage in enumerate(stages):
                options = stage.get('options') if isinstance(stage, dict) else None
                if not isinstance(options, list):
                    continue
                for option_index, option in enumerate(options):
                    if isinstance(option, dict):
                        require_name(
                            option.get('name'),
                            f'{base_path}.elite_requirements.stages[{stage_index}].options[{option_index}].name',
                        )

        elite_abilities = entry.get('elite_abilities')
        if isinstance(elite_abilities, list):
            for index, name in enumerate(elite_abilities):
                require_name(name, f'{base_path}.elite_abilities[{index}]')

    return errors


def validate_table_integrity(table_entries, entries_with_source):
    errors = []
    seen_ids = {
        str(entry.get('id')).strip(): f'{source_file}[{source_index}]'
        for entry, source_file, source_index in entries_with_source
        if isinstance(entry, dict) and str(entry.get('id') or '').strip()
    }
    for index, table in enumerate(table_entries):
        if not isinstance(table, dict):
            errors.append(f'tabeller.json[{index}] is not an object')
            continue
        table_id = str(table.get('id') or '').strip()
        if not table_id:
            errors.append(f'tabeller.json[{index}] is missing an id')
            continue
        previous = seen_ids.get(table_id)
        if previous:
            errors.append(f'duplicate id {table_id!r}: {previous} and tabeller.json[{index}]')
        else:
            seen_ids[table_id] = f'tabeller.json[{index}]'
    return errors


def payload_without_generated_at(payload):
    if not isinstance(payload, dict):
        return payload
    return {key: value for key, value in payload.items() if key != 'generatedAt'}


def stable_generated_at(bundle_body, index_body):
    try:
        existing_bundle = load_json(OUTPUT_FILE)
        existing_index = load_json(INDEX_CATALOG_FILE)
        if (
            payload_without_generated_at(existing_bundle) == bundle_body
            and payload_without_generated_at(existing_index) == index_body
        ):
            previous = existing_bundle.get('generatedAt')
            if isinstance(previous, str) and previous:
                return previous
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return datetime.now(timezone.utc).isoformat()


def parse_args():
    parser = argparse.ArgumentParser(description='Bygger data/all.json från datafiler.')
    parser.add_argument('--strict', action='store_true', help='Avbryt vid schema-, integritets- eller innehållsfel.')
    parser.add_argument('--check', action='store_true', help='Validera och bygg i minnet utan att skriva härledda filer.')
    parser.add_argument('--pretty', action='store_true', help='Skriv all.json med indentering.')
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        contract = load_catalog_files()
    except ValueError as error:
        print(error)
        raise SystemExit(1) from error

    data_files = list(contract.entry_data_files)
    entries = []
    entries_with_source = []
    sources = []
    source_payloads = []
    warnings = []
    schema_errors = []

    for filename in data_files:
        source_path = DATA_DIR / filename
        payload = load_json(source_path)
        current_schema_errors = validate_catalog_payload(payload, source=filename, strict=args.strict)
        schema_errors.extend(current_schema_errors)
        parsed = normalize_payload(payload, source=filename)
        data = parsed.entries
        for idx, entry in enumerate(data):
            validate_entry_schema(entry, filename, idx, warnings)
            entries_with_source.append((entry, filename, idx))
        entries.extend(data)
        sources.append({
            'file': f'data/{filename}',
            'count': len(data),
            'checksum': checksum(payload),
            'typeRuleCount': len(parsed.type_rules)
        })
        source_payloads.append(
            build_payload(
                data,
                type_rules=parsed.type_rules,
                extra=parsed.extra,
                as_object=parsed.is_object_format,
                schema_version=parsed.schema_version or 3,
            )
        )

    integrity_errors = validate_cross_catalog_integrity(entries_with_source)

    tables_payload = load_json(TABLES_FILE)
    table_catalog_entries = []
    if isinstance(tables_payload, list):
        table_source_entries = tables_payload
    elif isinstance(tables_payload, dict) and isinstance(tables_payload.get('entries'), list):
        table_source_entries = tables_payload.get('entries')
    else:
        table_source_entries = []
    integrity_errors.extend(validate_table_integrity(table_source_entries, entries_with_source))
    for idx, entry in enumerate(table_source_entries):
        table_catalog_entries.append(summarize_entry(entry, 'tabeller.json', idx, table=True))

    bundle_body = {
        'totalCount': len(entries),
        'sources': sources,
        'sourcePayloads': source_payloads,
        'tables': tables_payload,
    }

    index_body = {
        'totalCount': len(entries),
        'sources': sources,
        'entries': [
            summarize_entry(entry, filename, idx)
            for filename, payload in zip(data_files, source_payloads)
            for idx, entry in enumerate(payload.get('entries', []) if isinstance(payload, dict) else [])
        ],
        'tables': table_catalog_entries,
    }

    if schema_errors:
        print(f'Schemafel: {len(schema_errors)}')
        for row in schema_errors[:40]:
            print(f'  - {row}')
        if len(schema_errors) > 40:
            print(f'  ... samt {len(schema_errors) - 40} till.')
    if integrity_errors:
        print(f'Integritetsfel: {len(integrity_errors)}')
        for row in integrity_errors[:40]:
            print(f'  - {row}')
        if len(integrity_errors) > 40:
            print(f'  ... samt {len(integrity_errors) - 40} till.')
    if warnings:
        print(f'Innehållsvarningar: {len(warnings)}')
        for row in warnings[:40]:
            print(f'  - {row}')
        if len(warnings) > 40:
            print(f'  ... samt {len(warnings) - 40} till.')

    if args.strict and (schema_errors or integrity_errors or warnings):
        raise SystemExit(1)

    generated_at = stable_generated_at(bundle_body, index_body)
    bundle = {'generatedAt': generated_at, **bundle_body}
    index_catalog = {'generatedAt': generated_at, **index_body}

    if args.check:
        print(f'Validated {len(entries)} entries from {len(data_files)} catalog files; no derived files written.')
        return

    with OUTPUT_FILE.open('w', encoding='utf-8') as handle:
        if args.pretty:
            json.dump(bundle, handle, ensure_ascii=False, indent=2)
        else:
            json.dump(bundle, handle, ensure_ascii=False)
        handle.write('\n')

    with INDEX_CATALOG_FILE.open('w', encoding='utf-8') as handle:
        if args.pretty:
            json.dump(index_catalog, handle, ensure_ascii=False, indent=2)
        else:
            json.dump(index_catalog, handle, ensure_ascii=False, separators=(',', ':'))
        handle.write('\n')

    print(f'Wrote {len(entries)} entries to {OUTPUT_FILE.relative_to(ROOT_DIR)}')


if __name__ == '__main__':
    main()
