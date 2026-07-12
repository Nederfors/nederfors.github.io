import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const eliteUtilsPath = path.join(repoRoot, 'js', 'elite-utils.js');
const eliteReqPath = path.join(repoRoot, 'js', 'elite-req.js');
const eliteUtilsSource = fs.readFileSync(eliteUtilsPath, 'utf8');
const eliteReqSource = fs.readFileSync(eliteReqPath, 'utf8');

function createSandbox() {
  const sandbox = {
    JSON,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Intl,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadEliteRuntime() {
  const sandbox = createSandbox();
  vm.runInNewContext(eliteUtilsSource, sandbox, { filename: eliteUtilsPath });
  vm.runInNewContext(eliteReqSource, sandbox, { filename: eliteReqPath });
  return sandbox.window.eliteReq;
}

function makeEntry(name, type, level = 'Novis') {
  return {
    namn: name,
    nivå: level,
    taggar: {
      typ: [type]
    }
  };
}

function makeMigratedElite() {
  return {
    namn: 'Migrerat elityrke',
    taggar: { typ: ['Elityrke'] },
    elite_requirements: {
      total_xp: 90,
      stages: [
        {
          id: 'primary',
          kind: 'primary',
          counts_primary_baseline: true,
          min_xp: 60,
          min_count: 1,
          options: [
            { type: 'Förmåga', name: 'Krav A' },
            { type: 'Förmåga', name: 'Krav B' },
            { type: 'Förmåga', name: 'Krav C' },
            { type: 'Mystisk kraft', name: '*' }
          ]
        },
        {
          id: 'baseline_0',
          kind: 'specific_choice',
          min_xp: 10,
          min_count: 1,
          options: [{ type: 'Förmåga', name: 'Krav A' }]
        },
        {
          id: 'baseline_1',
          kind: 'specific_choice',
          min_xp: 10,
          min_count: 1,
          options: [
            { type: 'Förmåga', name: 'Krav B' },
            { type: 'Förmåga', name: 'Krav C' }
          ]
        },
        {
          id: 'baseline_2',
          kind: 'tag_pool',
          min_xp: 10,
          entry_type: 'Mystisk kraft',
          field: 'types',
          values: ['Mystisk kraft'],
          allowed_entry_types: ['Mystisk kraft']
        },
        {
          id: 'baseline_3',
          kind: 'specific_choice',
          min_xp: 10,
          min_count: 1,
          options: [{ type: 'Ritual', name: 'Ritual A' }]
        }
      ]
    }
  };
}

describe('elite requirement migration semantics', () => {
  it('requires all baseline requirements plus any one Master-level requirement', () => {
    const eliteReq = loadEliteRuntime();
    const elite = makeMigratedElite();

    const allNovice = [
      makeEntry('Krav A', 'Förmåga'),
      makeEntry('Krav B', 'Förmåga'),
      makeEntry('Mystik A', 'Mystisk kraft'),
      makeEntry('Ritual A', 'Ritual')
    ];

    const noviceResult = eliteReq.check(elite, allNovice);
    expect(noviceResult.ok).toBe(false);
    expect(noviceResult.profile.primary.missingErf).toBe(50);

    const masterResult = eliteReq.check(elite, [
      makeEntry('Krav A', 'Förmåga', 'Mästare'),
      makeEntry('Krav B', 'Förmåga'),
      makeEntry('Mystik A', 'Mystisk kraft'),
      makeEntry('Ritual A', 'Ritual')
    ]);

    expect(masterResult.ok).toBe(true);
    expect(masterResult.profile.specifikt_val[0].primaryCreditErf).toBe(10);
    expect(masterResult.profile.valfritt.selectedFromOverflow).toBe(0);
  });

  it('supports alternative baseline groups and wildcard mystic Master picks', () => {
    const eliteReq = loadEliteRuntime();
    const elite = makeMigratedElite();

    const result = eliteReq.check(elite, [
      makeEntry('Krav A', 'Förmåga'),
      makeEntry('Krav C', 'Förmåga'),
      makeEntry('Mystik A', 'Mystisk kraft', 'Mästare'),
      makeEntry('Ritual A', 'Ritual')
    ]);

    expect(result.ok).toBe(true);
    expect(result.profile.primary.name).toBe('Valfri mystisk kraft');
    expect(result.profile.valfri_inom_tagg[0].selectedFromPrimary).toBe(10);
  });

  it('migrates old Järnsvuren requirements instead of keeping the mismatched new profile', () => {
    const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'elityrke.json'), 'utf8'));
    const elite = payload.entries.find(entry => entry.id === 'elit1');
    const primaryNames = elite.elite_requirements.stages[0].options.map(option => option.name);

    expect(primaryNames).toEqual(['Lärd', 'Monsterlärd', 'Prickskytt', 'Stångverkan', 'Tvillingattack']);
    expect(primaryNames).not.toContain('Akrobatik');
    expect(elite.elite_requirements.total_xp).toBe(90);
  });
});
