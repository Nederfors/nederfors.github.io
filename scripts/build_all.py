#!/usr/bin/env python3
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

DATA_FILES = [
    'diverse.json',
    'kuriositeter.json',
    'skatter.json',
    'elixir.json',
    'fordel.json',
    'formaga.json',
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
    'vapen.json',
    'mat.json',
    'dryck.json',
    'sardrag.json',
    'monstruost-sardrag.json',
    'artefakter.json',
    'lagre-artefakter.json',
    'fallor.json'
]

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / 'data'
OUTPUT_FILE = DATA_DIR / 'all.json'


def load_json(path: Path):
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def checksum(data) -> str:
    dumped = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    digest = hashlib.sha256(dumped.encode('utf-8')).hexdigest()
    return f'sha256-{digest}'


def main():
    entries = []
    sources = []

    for filename in DATA_FILES:
        source_path = DATA_DIR / filename
        data = load_json(source_path)
        if not isinstance(data, list):
            raise ValueError(f'{filename} does not contain an array at the top level')
        entries.extend(data)
        sources.append({
            'file': f'data/{filename}',
            'count': len(data),
            'checksum': checksum(data)
        })

    bundle = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'totalCount': len(entries),
        'sources': sources,
        'entries': entries
    }

    with OUTPUT_FILE.open('w', encoding='utf-8') as handle:
        json.dump(bundle, handle, ensure_ascii=False)
        handle.write('\n')

    print(f'Wrote {len(entries)} entries to {OUTPUT_FILE.relative_to(ROOT_DIR)}')


if __name__ == '__main__':
    main()
