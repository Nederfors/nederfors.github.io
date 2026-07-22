import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourcePath = path.join(repoRoot, 'js', 'projection-core.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadCore() {
  const sandbox = {
    JSON,
    Object,
    Array,
    Set,
    String,
    Number,
    Boolean
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return sandbox.linkedStateProjectionCore;
}

function makeInput(core, overrides = {}) {
  const input = {
    snapshot: {
      version: core.SNAPSHOT_VERSION,
      subject: {
        rowUid: 'row-hidden-stack',
        baseIdentity: 'id:hidden-stack',
        catalogId: 'hidden-stack',
        location: 'top-level',
        rowReferenceMatches: 1,
        rowUidMatches: 1,
        baseIdentityMatches: 1,
        rowQuantity: 2,
        ownedQuantity: 2
      },
      linkedState: {
        catalogReveal: {
          complete: true,
          ids: ['hidden-stack']
        }
      }
    },
    change: {
      version: core.CHANGE_VERSION,
      type: 'top-level-stack-quantity',
      location: 'top-level',
      rowUid: 'row-hidden-stack',
      baseIdentity: 'id:hidden-stack',
      catalogId: 'hidden-stack',
      delta: 1,
      beforeQuantity: 2,
      afterQuantity: 3,
      beforeOwnedQuantity: 2,
      afterOwnedQuantity: 3
    },
    capabilities: {
      version: 1,
      known: true,
      source: 'catalog',
      catalogId: 'hidden-stack',
      item: true,
      quantityMode: 'stack',
      topology: 'leaf',
      stateLinks: ['catalog-reveal-while-owned'],
      unknownStateLinks: []
    }
  };
  return {
    ...input,
    ...overrides,
    snapshot: { ...input.snapshot, ...(overrides.snapshot || {}) },
    change: { ...input.change, ...(overrides.change || {}) },
    capabilities: { ...input.capabilities, ...(overrides.capabilities || {}) }
  };
}

describe('linked-state Projection Core', () => {
  it('deterministically proves an owned-to-owned catalog reveal projection unchanged', () => {
    const core = loadCore();
    const input = makeInput(core);

    const first = core.evaluate(input);
    const second = core.evaluate(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: core.PROJECTION_VERSION,
      status: core.STATUS.UNCHANGED,
      reason: 'all-declared-links-proven-unchanged'
    });
    expect(first.evidenceKey).toBeTruthy();
    expect(first.links).toEqual([expect.objectContaining({
      link: 'catalog-reveal-while-owned',
      status: core.STATUS.UNCHANGED
    })]);
  });

  it('reports an ownership crossing as an actual projected linked-state change', () => {
    const core = loadCore();
    const input = makeInput(core, {
      change: {
        delta: -2,
        beforeQuantity: 2,
        afterQuantity: 0,
        beforeOwnedQuantity: 2,
        afterOwnedQuantity: 0
      }
    });

    expect(core.evaluate(input)).toMatchObject({
      status: core.STATUS.CHANGED,
      reason: 'catalog-reveal-ownership-transition',
      links: [expect.objectContaining({
        link: 'catalog-reveal-while-owned',
        status: core.STATUS.CHANGED
      })]
    });
  });

  it.each([
    ['snapshot version', input => { input.snapshot.version = 99; }, 'snapshot-version-unsupported'],
    ['change version', input => { input.change.version = 99; }, 'change-version-unsupported'],
    ['capability version', input => { input.capabilities.version = 99; }, 'capability-version-unsupported'],
    ['unknown declared link', input => {
      input.capabilities.unknownStateLinks = ['future-link'];
    }, 'capability-state-link-unknown'],
    ['missing linked state', input => {
      input.snapshot.linkedState = {};
    }, 'catalog-reveal-state-incomplete'],
    ['ambiguous identity', input => {
      input.snapshot.subject.baseIdentityMatches = 2;
    }, 'snapshot-identity-ambiguous']
  ])('fails closed for unknown or incomplete %s evidence', (_label, mutate, reason) => {
    const core = loadCore();
    const input = makeInput(core);
    mutate(input);
    expect(core.evaluate(input)).toMatchObject({
      status: core.STATUS.UNKNOWN,
      reason
    });
  });

  it('does not mutate the snapshot, change, or capability evidence', () => {
    const core = loadCore();
    const input = makeInput(core);
    const before = JSON.parse(JSON.stringify(input));

    core.evaluate(input);

    expect(input).toEqual(before);
  });

  it('requires every relevant declared link to be proven unchanged', () => {
    const core = loadCore();
    const input = makeInput(core, {
      capabilities: {
        stateLinks: [
          'catalog-reveal-while-owned',
          'artifact-binding-effects'
        ]
      }
    });

    const result = core.evaluate(input);
    expect(result.status).toBe(core.STATUS.UNKNOWN);
    expect(result.links).toEqual([
      expect.objectContaining({
        link: 'catalog-reveal-while-owned',
        status: core.STATUS.UNCHANGED
      }),
      expect.objectContaining({
        link: 'artifact-binding-effects',
        status: core.STATUS.UNKNOWN
      })
    ]);
  });
});
