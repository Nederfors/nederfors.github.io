import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const ROOT_DIR = path.resolve(
  __dirname,
  '..'
);

const CHARACTER_DIR = path.join(
  ROOT_DIR,
  'tests',
  'fixtures',
  'legacy'
);

const FIXTURE_FILES = [
  'Briost.json',
  'Rex.json',
  'Magnum.json',
  'Rollpersoner.json'
];

function readLegacyFixtures() {
  return FIXTURE_FILES.flatMap(file => {
    const payload = JSON.parse(
      fs.readFileSync(
        path.join(
          CHARACTER_DIR,
          file
        ),
        'utf8'
      )
    );

    return Array.isArray(payload)
      ? payload
      : [payload];
  });
}

async function readImportedParityState(page) {
  return page.evaluate(() => {
    const activeStore = window.storeHelper.load();

    const flattenInventory = rows => (
      Array.isArray(rows)
        ? rows
        : []
    ).flatMap(row => (
      [
        row,
        ...flattenInventory(
          row?.contains
        )
      ]
    ));

    const characters = (
      activeStore.characters || []
    ).map(char => {
      activeStore.current = char.id;

      const data = activeStore.data[
        char.id
      ] || {};

      const list = window.storeHelper
        .getCurrentList(
          activeStore
        );

      const artifactEffects = window.storeHelper
        .getArtifactEffects(
          activeStore
        );

      const manualAdjustments = window.storeHelper
        .getManualAdjustments(
          activeStore
        );

      const combinedEffects = {
        xp:
          Number(artifactEffects?.xp || 0)
          + Number(manualAdjustments?.xp || 0),

        corruption:
          Number(artifactEffects?.corruption || 0)
          + Number(manualAdjustments?.corruption || 0),

        toughness:
          Number(artifactEffects?.toughness || 0)
          + Number(manualAdjustments?.toughness || 0),

        pain:
          Number(artifactEffects?.pain || 0)
          + Number(manualAdjustments?.pain || 0),

        capacity:
          Number(artifactEffects?.capacity || 0)
          + Number(manualAdjustments?.capacity || 0)
      };

      const baseXp = window.storeHelper
        .getBaseXP(
          activeStore
        );

      const usedXp = window.storeHelper
        .calcUsedXP(
          list,
          combinedEffects
        );

      const totalXp = window.storeHelper
        .calcTotalXP(
          baseXp,
          list
        );

      return {
        name: char.name,

        xp: {
          baseXp,
          totalXp,
          usedXp,
          freeXp: totalXp - usedXp
        },

        selectedCount: list.length,

        catalogSummaryCount: list.filter(
          entry => entry?.__catalogSummary
        ).length,

        inventoryCount: flattenInventory(
          data.inventory
        ).length,

        selected: list.map(entry => [
          entry.id || '',
          entry.namn || '',
          entry.nivå || ''
        ]),

        defenseSetup:
          data.defenseSetup || null,

        custom: (
          data.custom || []
        ).map(entry => [
          entry.id || '',
          entry.namn || ''
        ]),

        inventory: flattenInventory(
          data.inventory
        ).map(row => [
          row?.id || '',
          row?.name || '',
          row?.qty || 1
        ])
      };
    });

    activeStore.current = (
      activeStore.characters.at(-1)?.id
      || ''
    );

    return {
      databaseMode:
        window.catalogLoader?.mode || '',
      characters
    };
  });
}

test(
  'legacy character imports canonicalize weapon ids in the browser app',
  async ({ page }) => {
    const fixtures = readLegacyFixtures();

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/#/index');

    await page.waitForFunction(
      () => (
        Boolean(
          window.__symbaroumBootCompleted
        )
        && Boolean(
          window.symbaroumPersistence?.ready
        )
      )
    );

    const result = await page.evaluate(
      async ({ fixtures }) => {
        await window.ensureFullDatabase?.();

        const activeStore =
          window.storeHelper.load();

        const importedIds = [];

        fixtures.forEach(payload => {
          const id =
            window.storeHelper
              .importCharacterJSON(
                activeStore,
                payload
              );

          if (id) {
            importedIds.push(id);
          }
        });

        const oldWeaponRef = /^v\d+$/;

        const oldRefs = [];
        const unresolved = [];

        const findCustom = (
          data,
          id,
          name
        ) => {
          const custom = Array.isArray(
            data?.custom
          )
            ? data.custom
            : [];

          return custom.find(entry => (
            String(
              entry?.id ?? ''
            ) === String(
              id ?? ''
            )
            || String(
              entry?.namn
              ?? entry?.name
              ?? ''
            ) === String(
              name ?? ''
            )
          )) || null;
        };

        const assertEntryRef = (
          charName,
          data,
          area,
          ref
        ) => {
          if (
            !ref
            || typeof ref !== 'object'
          ) {
            return;
          }

          const id = String(
            ref.id
            ?? ref.i
            ?? ''
          ).trim();

          const name = String(
            ref.namn
            ?? ref.name
            ?? ref.n
            ?? ''
          ).trim();

          if (oldWeaponRef.test(id)) {
            oldRefs.push(
              `${charName}:${area}:${id}`
            );
          }

          if (!id) {
            return;
          }

          const hit =
            findCustom(
              data,
              id,
              name
            )
            || window.lookupEntry?.({
              id,
              name
            });

          if (!hit) {
            unresolved.push(
              `${charName}:${area}:${id || name}`
            );
          }
        };

        const walkInventory = (
          charName,
          data,
          rows,
          prefix = 'inventory'
        ) => {
          (
            Array.isArray(rows)
              ? rows
              : []
          ).forEach((row, index) => {
            if (
              !row
              || typeof row !== 'object'
              || row.typ === 'currency'
            ) {
              return;
            }

            assertEntryRef(
              charName,
              data,
              `${prefix}[${index}]`,
              row
            );

            walkInventory(
              charName,
              data,
              row.contains,
              `${prefix}[${index}].contains`
            );
          });
        };

        importedIds.forEach(id => {
          const char =
            activeStore.characters.find(
              entry => entry.id === id
            );

          const data =
            activeStore.data[id] || {};

          const charName =
            char?.name || id;

          (
            Array.isArray(data.list)
              ? data.list
              : []
          ).forEach(
            (entry, index) => {
              assertEntryRef(
                charName,
                data,
                `list[${index}]`,
                entry
              );
            }
          );

          walkInventory(
            charName,
            data,
            data.inventory
          );

          (
            Array.isArray(
              data.defenseSetup?.weapons
            )
              ? data.defenseSetup.weapons
              : []
          ).forEach(
            (entry, index) => {
              assertEntryRef(
                charName,
                data,
                `defenseSetup.weapons[${index}]`,
                entry
              );
            }
          );

          assertEntryRef(
            charName,
            data,
            'defenseSetup.armor',
            data.defenseSetup?.armor
          );

          assertEntryRef(
            charName,
            data,
            'defenseSetup.dancingWeapon',
            data.defenseSetup?.dancingWeapon
          );

          (
            Array.isArray(
              data.revealedArtifacts
            )
              ? data.revealedArtifacts
              : []
          ).forEach(
            (artifactId, index) => {
              if (
                oldWeaponRef.test(
                  String(
                    artifactId || ''
                  )
                )
              ) {
                oldRefs.push(
                  `${charName}:revealedArtifacts[${index}]:${artifactId}`
                );
              }
            }
          );
        });

        const briost =
          activeStore.characters.find(
            entry => (
              entry.name === 'Briost'
            )
          );

        const briostData = briost
          ? activeStore.data[briost.id]
          : {};

        const briostShield = (
          briostData.inventory || []
        ).find(
          row => (
            row.id === 'nv14'
            && row.name === 'Sköld'
          )
        ) || null;

        const magnum =
          activeStore.characters.find(
            entry => (
              entry.name === 'Magnum'
            )
          );

        const magnumData = magnum
          ? activeStore.data[magnum.id]
          : {};

        const magnumRuinenIds = (
          magnumData.custom || []
        )
          .filter(
            entry => (
              entry.namn === 'Ruinen'
            )
          )
          .map(entry => entry.id)
          .sort();

        const exported = importedIds.map(
          id => (
            window.storeHelper
              .exportCharacterJSON(
                activeStore,
                id,
                false
              )
          )
        );

        const exportText =
          JSON.stringify(exported);

        return {
          imported:
            importedIds.length,
          oldRefs,
          unresolved,
          hasBriostShield:
            Boolean(briostShield),
          magnumRuinenIds,
          exportHasLegacyWeaponIds:
            /"(?:i|id)":"v\d+"/
              .test(exportText)
        };
      },
      { fixtures }
    );

    expect(
      result.imported
    ).toBe(
      fixtures.length
    );

    expect(
      result.oldRefs
    ).toEqual([]);

    expect(
      result.unresolved
    ).toEqual([]);

    expect(
      result.hasBriostShield
    ).toBe(true);

    expect(
      result.magnumRuinenIds
    ).toEqual([
      '4f280447-f9d7-4741-8d3c-1e1f4f996b55',
      '812d8166-e2fa-46f2-8623-d7092a5d6f89',
      'b7962a60-d324-4910-8ef5-16e48b52768d'
    ]);

    expect(
      result.exportHasLegacyWeaponIds
    ).toBe(false);
  }
);

test(
  'browser import maps ambiguous legacy elixir names to their canonical Novis variants',
  async ({ page }) => {
    await page.addInitScript(() => {
      for (
        const key of [
          'showOpenFilePicker',
          'showDirectoryPicker'
        ]
      ) {
        try {
          Object.defineProperty(
            window,
            key,
            {
              configurable: true,
              writable: true,
              value: undefined
            }
          );
        } catch {
          try {
            window[key] = undefined;
          } catch {}
        }
      }

      if (
        sessionStorage.getItem(
          '__legacyElixirImportSeeded'
        ) === '1'
      ) {
        return;
      }

      localStorage.clear();
      sessionStorage.clear();

      sessionStorage.setItem(
        '__legacyElixirImportSeeded',
        '1'
      );
    });

    await page.goto('/#/index');

    await page.waitForFunction(
      () => (
        Boolean(
          window.__symbaroumBootCompleted
        )
        && Boolean(
          window.symbaroumPersistence?.ready
        )
      )
    );

    const toolbar =
      page.locator(
        'shared-toolbar'
      );

    await toolbar
      .locator('#filterToggle')
      .click();

    await expect(
      toolbar.locator(
        '#filterPanel'
      )
    ).toHaveAttribute(
      'aria-hidden',
      'false'
    );

    const storageButton =
      toolbar.locator(
        '#driveStorageBtn'
      );

    if (
      !(await storageButton.isVisible())
    ) {
      await toolbar
        .locator(
          '#filterFormalCard .card-title'
        )
        .click();
    }

    await expect(
      storageButton
    ).toBeVisible();

    await storageButton.click();

    const storagePopup =
      toolbar.locator(
        '#driveStoragePopup'
      );

    await expect(
      storagePopup
    ).toBeVisible();

    await storagePopup
      .locator(
        '#driveStorageTab-import'
      )
      .click();

    await expect(
      storagePopup.locator(
        '#driveStorageTab-import'
      )
    ).toHaveAttribute(
      'aria-selected',
      'true'
    );

    const importButton =
      storagePopup
        .locator(
          '#driveStoragePanel-import button'
        )
        .filter({
          hasText:
            /^Importera till vald mapp$/
        });

    await expect(
      importButton
    ).toBeVisible();

    const chooserPromise =
      page.waitForEvent(
        'filechooser'
      );

    await importButton.click();

    const chooser =
      await chooserPromise;

    await chooser.setFiles({
      name:
        'legacy-elixir-aliases.json',
      mimeType:
        'application/json',

      buffer: Buffer.from(
        JSON.stringify({
          name:
            'Legacy elixir aliases',

          data: {
            inventory: [
              {
                n: 'Gryningsblod'
              },
              {
                n: 'Essensdrapa'
              }
            ]
          }
        })
      )
    });

    await expect.poll(
      () => page.evaluate(
        () => (
          window.storeHelper
            .load()
            .characters
            .find(
              char => (
                char.name
                === 'Legacy elixir aliases'
              )
            )?.id || ''
        )
      )
    ).not.toBe('');

    const importedId =
      await page.evaluate(
        () => (
          window.storeHelper
            .load()
            .characters
            .find(
              char => (
                char.name
                === 'Legacy elixir aliases'
              )
            )?.id || ''
        )
      );

    expect(
      importedId
    ).toBeTruthy();

    await expect.poll(
      () => page.evaluate(
        id => {
          const activeStore =
            window.storeHelper.load();

          return (
            activeStore.data[id]
              ?.inventory
            || []
          ).map(row => ({
            id: row.id || '',
            name:
              row.name
              || row.namn
              || ''
          }));
        },
        importedId
      )
    ).toEqual([
      {
        id: 'elix63',
        name:
          'Gryningsblod (Novis)'
      },
      {
        id: 'elix66',
        name:
          'Essensdrapa (Novis)'
      }
    ]);

    await expect(
      storagePopup
    ).toBeHidden();

    if (
      await toolbar
        .locator('#filterPanel')
        .getAttribute(
          'aria-hidden'
        )
      !== 'false'
    ) {
      await toolbar
        .locator('#filterToggle')
        .click();
    }

    await expect(
      toolbar.locator(
        '#filterPanel'
      )
    ).toHaveAttribute(
      'aria-hidden',
      'false'
    );

    const charSelect =
      toolbar.locator(
        '#charSelect'
      );

    if (
      !(await charSelect.isVisible())
    ) {
      await toolbar
        .locator(
          '#filterFormalCard .card-title'
        )
        .click();
    }

    await expect(
      charSelect
    ).toBeVisible();

    await expect(
      charSelect
    ).toHaveValue(
      importedId
    );

    await expect(
      charSelect.locator(
        'option:checked'
      )
    ).toHaveText(
      'Legacy elixir aliases'
    );

    await toolbar
      .locator(
        '#filterPanel aside button[data-close="filterPanel"]'
      )
      .click();

    await expect(
      toolbar.locator(
        '#filterPanel'
      )
    ).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    await toolbar
      .locator(
        '#inventoryLink'
      )
      .click();

    await page.waitForFunction(
      () => (
        document.body.dataset.role
          === 'inventory'
        && document
          .getElementById(
            'view-root'
          )
          ?.getAttribute(
            'aria-busy'
          ) === 'false'
      )
    );

    await expect(
      page.locator(
        '#invList li[data-name="Gryningsblod (Novis)"]'
      )
    ).toBeVisible();

    await expect(
      page.locator(
        '#invList li[data-name="Essensdrapa (Novis)"]'
      )
    ).toBeVisible();

    // Exercise the same persisted bootstrap path a user gets after importing a
    // file, instead of relying on the importing page's pre-import store object.
    await page.reload();

    await page.waitForFunction(
      () => (
        Boolean(
          window.__symbaroumBootCompleted
        )
        && Boolean(
          window.symbaroumPersistence?.ready
        )
      )
    );

    const afterReload =
      await page.evaluate(
        id => {
          const activeStore =
            window.storeHelper.load();

          return (
            activeStore.data[id]
              ?.inventory
            || []
          ).map(row => [
            row.id || '',
            row.name
              || row.namn
              || ''
          ]);
        },
        importedId
      );

    expect(
      afterReload
    ).toEqual([
      [
        'elix63',
        'Gryningsblod (Novis)'
      ],
      [
        'elix66',
        'Essensdrapa (Novis)'
      ]
    ]);
  }
);

test(
  'real legacy batch import hydrates the full catalog and survives reload',
  async ({ page }) => {
    test.setTimeout(60_000);

    const expected = {
      Briost: {
        xp: {
          baseXp: 260,
          totalXp: 285,
          usedXp: 285,
          freeXp: 0
        },
        selectedCount: 21,
        inventoryCount: 14
      },

      Brumhildemei: {
        xp: {
          baseXp: 300,
          totalXp: 320,
          usedXp: 280,
          freeXp: 40
        },
        selectedCount: 19,
        inventoryCount: 3
      },

      Hurley: {
        xp: {
          baseXp: 261,
          totalXp: 281,
          usedXp: 280,
          freeXp: 1
        },
        selectedCount: 18,
        inventoryCount: 21
      },

      Clemens: {
        xp: {
          baseXp: 300,
          totalXp: 325,
          usedXp: 330,
          freeXp: -5
        },
        selectedCount: 22,
        inventoryCount: 7
      },

      // Seven source rows carry Välutrustad ownership, but this legacy character no
      // longer has Välutrustad selected. Reconciliation removes six fully granted
      // rows and subtracts three granted copies from the four-copy rope stack.
      Testperson: {
        xp: {
          baseXp: 250,
          totalXp: 250,
          usedXp: 60,
          freeXp: 190
        },
        selectedCount: 1,
        inventoryCount: 7
      },

      Rex: {
        xp: {
          baseXp: 256,
          totalXp: 281,
          usedXp: 275,
          freeXp: 6
        },
        selectedCount: 30,
        inventoryCount: 36
      },

      Magnum: {
        xp: {
          baseXp: 268,
          totalXp: 293,
          usedXp: 276,
          freeXp: 17
        },
        selectedCount: 29,
        inventoryCount: 29
      }
    };

    await page.addInitScript(() => {
      for (
        const key of [
          'showOpenFilePicker',
          'showDirectoryPicker'
        ]
      ) {
        try {
          Object.defineProperty(
            window,
            key,
            {
              configurable: true,
              writable: true,
              value: undefined
            }
          );
        } catch {
          try {
            window[key] = undefined;
          } catch {}
        }
      }

      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/#/index');

    await page.waitForFunction(
      () => (
        Boolean(
          window.__symbaroumBootCompleted
        )
        && Boolean(
          window.symbaroumPersistence?.ready
        )
      )
    );

    expect(
      await page.evaluate(
        () => (
          window.catalogLoader?.mode
        )
      )
    ).toBe('catalog');

    const toolbar =
      page.locator(
        'shared-toolbar'
      );

    await toolbar
      .locator('#filterToggle')
      .click();

    const storageButton =
      toolbar.locator(
        '#driveStorageBtn'
      );

    if (
      !(await storageButton.isVisible())
    ) {
      await toolbar
        .locator(
          '#filterFormalCard .card-title'
        )
        .click();
    }

    await storageButton.click();

    const storagePopup =
      toolbar.locator(
        '#driveStoragePopup'
      );

    await storagePopup
      .locator(
        '#driveStorageTab-import'
      )
      .click();

    const importButton =
      storagePopup
        .locator(
          '#driveStoragePanel-import button'
        )
        .filter({
          hasText:
            /^Importera till vald mapp$/
        });

    const chooserPromise =
      page.waitForEvent(
        'filechooser'
      );

    await importButton.click();

    const chooser =
      await chooserPromise;

    await chooser.setFiles(
      path.join(
        CHARACTER_DIR,
        'Rollpersoner.json'
      )
    );

    await expect.poll(
      () => page.evaluate(
        () => (
          window.storeHelper
            .load()
            .characters
            .length
        )
      )
    ).toBe(7);

    await expect(
      toolbar.locator('#xpOut')
    ).toHaveText('17');

    const beforeReload =
      await readImportedParityState(
        page
      );

    expect(
      beforeReload.databaseMode
    ).toBe('full');

    expect(
      beforeReload.characters.map(
        char => char.name
      )
    ).toEqual(
      Object.keys(expected)
    );

    beforeReload.characters.forEach(
      char => {
        expect(
          {
            xp: char.xp,
            selectedCount:
              char.selectedCount,
            inventoryCount:
              char.inventoryCount
          },
          char.name
        ).toEqual(
          expected[char.name]
        );

        expect(
          char.catalogSummaryCount,
          `${char.name}: summary entries`
        ).toBe(0);
      }
    );

    const clemens =
      beforeReload.characters.find(
        char => (
          char.name === 'Clemens'
        )
      );

    expect(
      clemens.selected
    ).toContainEqual([
      'form71',
      'Krigarens skärpa',
      'Mästare'
    ]);

    const rex =
      beforeReload.characters.find(
        char => char.name === 'Rex'
      );

    expect(
      rex.inventory
    ).toContainEqual([
      'di10',
      'Flinta & stål',
      1
    ]);

    const testperson =
      beforeReload.characters.find(
        char => (
          char.name === 'Testperson'
        )
      );

    expect(
      testperson.inventory
    ).toEqual([
      [
        'di12',
        'Rep, 10 meter',
        1
      ],
      [
        'di10',
        'Flinta & stål',
        1
      ],
      [
        'di11',
        'Kokkärl',
        1
      ],
      [
        'di13',
        'Sovfäll',
        1
      ],
      [
        'di14',
        'Tändved',
        1
      ],
      [
        'di15',
        'Vattenskinn',
        1
      ],
      [
        'l9',
        'Djurmask',
        1
      ]
    ]);

    const magnum =
      beforeReload.characters.find(
        char => (
          char.name === 'Magnum'
        )
      );

    expect(
      magnum.custom.filter(
        ([, name]) => (
          name === 'Ruinen'
        )
      )
    ).toHaveLength(3);

    if (
      await toolbar
        .locator('#filterPanel')
        .getAttribute(
          'aria-hidden'
        )
      !== 'false'
    ) {
      await toolbar
        .locator('#filterToggle')
        .click();
    }

    const charSelect =
      toolbar.locator(
        '#charSelect'
      );

    if (
      !(await charSelect.isVisible())
    ) {
      await toolbar
        .locator(
          '#filterFormalCard .card-title'
        )
        .click();
    }

    await charSelect.selectOption({
      label: 'Clemens'
    });

    await expect(
      toolbar.locator('#xpOut')
    ).toHaveText('-5');

    await toolbar
      .locator(
        '#filterPanel aside button[data-close="filterPanel"]'
      )
      .click();

    await toolbar
      .locator(
        '#characterLink'
      )
      .click();

    await page.waitForFunction(
      () => (
        document.body.dataset.role
          === 'character'
        && document
          .getElementById(
            'view-root'
          )
          ?.getAttribute(
            'aria-busy'
          ) === 'false'
      )
    );

    const legacyAbility =
      page.locator(
        '#valda li[data-id="form71"]'
      );

    await expect(
      legacyAbility
    ).toHaveCount(1);

    await expect(
      legacyAbility
    ).toContainText(
      'Krigarens skärpa'
    );

    await expect(
      legacyAbility.locator(
        'select.level'
      )
    ).toHaveValue(
      'Mästare'
    );

    await legacyAbility.evaluate(
      element => {
        const group =
          element.closest(
            'details'
          );

        if (group) {
          group.open = true;
        }
      }
    );

    await expect(
      legacyAbility
    ).toBeVisible();

    await page.reload();

    await page.waitForFunction(
      () => (
        Boolean(
          window.__symbaroumBootCompleted
        )
        && Boolean(
          window.symbaroumPersistence?.ready
        )
      )
    );

    await expect.poll(
      () => page.evaluate(
        () => (
          window.storeHelper
            .load()
            .characters
            .length
        )
      )
    ).toBe(7);

    const afterReload =
      await readImportedParityState(
        page
      );

    expect(
      afterReload.characters
    ).toEqual(
      beforeReload.characters
    );
  }
);