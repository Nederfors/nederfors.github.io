import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const contract = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config', 'catalog-files.json'), 'utf8')
);
const schemaNames = [
  'condition-v3.schema.json',
  'elite-requirements-v3.schema.json',
  'rule-v3.schema.json',
  'catalog-v3.schema.json'
];

const ajv = new Ajv2020({ allErrors: true, strict: true });
schemaNames.forEach(name => {
  const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'schemas', name), 'utf8'));
  ajv.addSchema(schema);
});

const validate = ajv.getSchema('https://rpg-db.local/schemas/catalog-v3.schema.json');
if (typeof validate !== 'function') {
  throw new Error('Catalog schema did not compile');
}

const failures = [];
contract.entryDataFiles.forEach(name => {
  const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', name), 'utf8'));
  if (!validate(payload)) {
    failures.push({ file: `data/${name}`, errors: structuredClone(validate.errors || []) });
  }
});

if (failures.length) {
  failures.forEach(failure => {
    console.error(failure.file);
    failure.errors.forEach(error => {
      console.error(`  ${error.instancePath || '/'} ${error.message || 'is invalid'}`);
    });
  });
  process.exitCode = 1;
} else {
  console.log(`Validated ${contract.entryDataFiles.length} authored catalogs against schema v3.`);
}
