#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'db.json');

const DATA_FILES = [
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
];

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    err.message = `Could not parse JSON in ${path.relative(ROOT_DIR, filePath)}: ${err.message}`;
    throw err;
  }
}

async function build() {
  const sources = [];
  const entries = [];
  const seenIds = new Map();

  for (const fileName of DATA_FILES) {
    const absPath = path.join(DATA_DIR, fileName);
    const relPath = path.relative(ROOT_DIR, absPath);
    const json = await readJson(absPath);
    if (!Array.isArray(json)) {
      throw new Error(`${relPath} does not contain a top-level array.`);
    }
    const hash = crypto.createHash('sha256').update(JSON.stringify(json)).digest('hex');

    json.forEach((entry, index) => {
      entries.push(entry);
      if (entry && entry.id !== undefined && entry.id !== null) {
        const id = entry.id;
        if (!seenIds.has(id)) {
          seenIds.set(id, [relPath, index]);
        } else {
          const [prevFile, prevIndex] = seenIds.get(id);
          console.warn(`Duplicate id detected: ${id} in ${relPath} (index ${index}) and ${prevFile} (index ${prevIndex}).`);
        }
      }
    });

    sources.push({
      file: `data/${fileName}`,
      count: json.length,
      checksum: `sha256-${hash}`
    });
  }

  const db = {
    generatedAt: new Date().toISOString(),
    totalCount: entries.length,
    sources,
    entries
  };

  const serialized = JSON.stringify(db, null, 2);
  await fs.writeFile(OUTPUT_FILE, `${serialized}\n`);
  console.log(`Wrote ${entries.length} entries to ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);
}

build().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
