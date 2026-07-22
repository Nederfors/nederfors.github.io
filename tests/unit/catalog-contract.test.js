import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const dataDir = path.join(repoRoot, 'data');
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'catalog-files.json'), 'utf8'));

describe('catalog file contract', () => {
  it('classifies every data JSON exactly once', () => {
    const groups = [contract.entryDataFiles, contract.specialDataFiles, contract.derivedDataFiles];
    groups.forEach(group => expect(Array.isArray(group)).toBe(true));

    const classified = groups.flat();
    const discovered = fs.readdirSync(dataDir)
      .filter(name => name.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b, 'en'));

    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.slice().sort((a, b) => a.localeCompare(b, 'en'))).toEqual(discovered);
  });

  it('keeps generated and special payloads outside authored entry discovery', () => {
    const entries = new Set(contract.entryDataFiles);
    [
      'all.json',
      'index-catalog.json',
      'offline-manifest.json',
      'struktur.json',
      'legacy-import-map.json',
      'pdf-list.json',
      'tabeller.json'
    ].forEach(name => expect(entries.has(name), name).toBe(false));

    contract.entryDataFiles.forEach(name => {
      const payload = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
      expect(payload.schema_version, name).toBe(3);
      expect(Array.isArray(payload.entries), name).toBe(true);
    });
  });

  it('passes strict, non-writing catalog validation', () => {
    const result = spawnSync('python3', ['scripts/build_all.py', '--strict', '--check'], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('no derived files written');
  });

  it('reports a newly added, unclassified JSON file by name', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-contract-'));
    const tempData = path.join(tempRoot, 'data');
    const tempContract = path.join(tempRoot, 'catalog-files.json');
    fs.mkdirSync(tempData);
    fs.writeFileSync(path.join(tempData, 'authored.json'), '{}\n');
    fs.writeFileSync(path.join(tempData, 'rogue.json'), '{}\n');
    fs.writeFileSync(tempContract, JSON.stringify({
      schemaVersion: 1,
      entryDataFiles: ['authored.json'],
      specialDataFiles: [],
      derivedDataFiles: []
    }));

    try {
      const python = [
        'import sys',
        `sys.path.insert(0, ${JSON.stringify(path.join(repoRoot, 'scripts'))})`,
        'from pathlib import Path',
        'from catalog_files import load_catalog_files',
        'load_catalog_files(contract_path=Path(sys.argv[1]), data_dir=Path(sys.argv[2]))'
      ].join(';');
      const result = spawnSync('python3', ['-c', python, tempContract, tempData], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('unclassified data file: data/rogue.json');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
