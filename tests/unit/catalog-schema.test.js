import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'catalog-files.json'), 'utf8'));
const schemaNames = [
  'condition-v3.schema.json',
  'elite-requirements-v3.schema.json',
  'rule-v3.schema.json',
  'catalog-v3.schema.json'
];

describe('catalog JSON schemas', () => {
  it('compile in strict mode and validate every authored entry catalog', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    schemaNames.forEach(name => {
      const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'schemas', name), 'utf8'));
      ajv.addSchema(schema);
    });

    const validate = ajv.getSchema('https://rpg-db.local/schemas/catalog-v3.schema.json');
    expect(validate).toBeTypeOf('function');

    const failures = [];
    contract.entryDataFiles.forEach(name => {
      const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', name), 'utf8'));
      if (!validate(payload)) failures.push({ name, errors: validate.errors });
    });
    expect(failures).toEqual([]);
  });
});
