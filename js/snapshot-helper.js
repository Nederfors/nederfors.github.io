(function (window) {
  function normalizeSourceKey(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function normalizeCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.floor(numeric);
  }

  function quoteName(value) {
    const str = String(value ?? '').trim();
    return str ? `“${str}”` : '';
  }

  function normalizeImpact(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const sourceKey = normalizeSourceKey(raw.sourceKey);
    const count = normalizeCount(raw.count);
    if (!sourceKey || !count) return null;
    return {
      sourceKey,
      count,
      label: String(raw.label || '').trim()
    };
  }

  function readImpactMetadata(impacts) {
    if (!impacts || typeof impacts !== 'object') return {};
    return {
      messageVariant: String(impacts.__messageVariant || '').trim(),
      entryLabel: String(impacts.__entryLabel || '').trim(),
      totalCount: normalizeCount(impacts.__totalCount)
    };
  }

  function attachImpactMetadata(impacts, metadata = {}) {
    if (!Array.isArray(impacts)) return impacts;
    const entries = [
      ['__messageVariant', metadata.messageVariant],
      ['__entryLabel', metadata.entryLabel],
      ['__totalCount', metadata.totalCount]
    ];
    entries.forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      try {
        Object.defineProperty(impacts, key, {
          value,
          writable: true,
          configurable: true,
          enumerable: false
        });
      } catch (_) {
        impacts[key] = value;
      }
    });
    return impacts;
  }

  function normalizeImpacts(impacts) {
    const metadata = readImpactMetadata(impacts);
    const normalized = (Array.isArray(impacts) ? impacts : [impacts])
      .map(normalizeImpact)
      .filter(Boolean);
    return attachImpactMetadata(normalized, metadata);
  }

  function collectSnapshotRows(rows, includeChildren = true) {
    const out = [];
    const queue = Array.isArray(rows) ? [...rows] : [rows];
    while (queue.length) {
      const row = queue.shift();
      if (!row || typeof row !== 'object') continue;
      out.push(row);
      if (!includeChildren) continue;
      if (Array.isArray(row.contains) && row.contains.length) {
        row.contains.forEach(child => queue.push(child));
      }
    }
    return out;
  }

  function getActiveCountsBySource(store) {
    const recordsFn = window.storeHelper?.getSnapshotRuleRecords;
    if (typeof recordsFn !== 'function') return new Map();
    const counts = new Map();
    (recordsFn(store) || []).forEach(record => {
      if (!record || typeof record !== 'object' || record.detached) return;
      const key = normalizeSourceKey(record.sourceKey);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function getEntryRemovalImpacts(store, entry) {
    if (!entry || typeof entry !== 'object') return [];
    const impactFn = window.storeHelper?.getSnapshotSourceImpactForEntry;
    if (typeof impactFn !== 'function') return [];

    const impact = impactFn(store, entry) || {};
    const records = Array.isArray(impact.records) ? impact.records : [];
    const orderedSourceKeys = [];
    const seen = new Set();
    const addSourceKey = (value) => {
      const key = normalizeSourceKey(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      orderedSourceKeys.push(key);
    };

    (Array.isArray(impact.sourceKeys) ? impact.sourceKeys : []).forEach(addSourceKey);
    addSourceKey(impact.sourceKey);
    records.forEach(record => addSourceKey(record?.sourceKey));

    if (!orderedSourceKeys.length) return [];

    const countsBySource = new Map();
    records.forEach(record => {
      if (!record || typeof record !== 'object' || record.detached) return;
      const key = normalizeSourceKey(record.sourceKey);
      if (!key) return;
      countsBySource.set(key, (countsBySource.get(key) || 0) + 1);
    });

    const fallbackCount = normalizeCount(impact.count);
    const label = String(entry?.namn || entry?.name || '').trim();
    const impacts = orderedSourceKeys
      .map(sourceKey => normalizeImpact({
        sourceKey,
        count: countsBySource.get(sourceKey) || (orderedSourceKeys.length === 1 ? fallbackCount : 0),
        label
      }))
      .filter(Boolean);

    if (impacts.length) {
      return attachImpactMetadata(impacts, {
        messageVariant: 'entry',
        entryLabel: label,
        totalCount: fallbackCount || impacts.reduce((sum, item) => sum + item.count, 0)
      });
    }
    const fallbackImpact = normalizeImpact({
      sourceKey: orderedSourceKeys[0],
      count: fallbackCount,
      label
    });
    return fallbackImpact
      ? attachImpactMetadata([fallbackImpact], {
        messageVariant: 'entry',
        entryLabel: label,
        totalCount: fallbackCount
      })
      : [];
  }

  function getRowRemovalImpacts(store, rows, options = {}) {
    const countsBySource = getActiveCountsBySource(store);
    if (!countsBySource.size) return [];

    const includeChildren = options.includeChildren !== false;
    const seenSources = new Set();
    const impacts = [];
    collectSnapshotRows(rows, includeChildren).forEach(row => {
      const sourceKey = normalizeSourceKey(row?.snapshotSourceKey);
      if (!sourceKey || seenSources.has(sourceKey)) return;
      const count = normalizeCount(countsBySource.get(sourceKey));
      if (!count) return;
      seenSources.add(sourceKey);
      impacts.push({
        sourceKey,
        count,
        label: String(row?.name || row?.namn || '').trim()
      });
    });
    return attachImpactMetadata(normalizeImpacts(impacts), {
      messageVariant: 'rows'
    });
  }

  function buildRemovalMessage(impacts) {
    const metadata = readImpactMetadata(impacts);
    if (metadata.messageVariant === 'entry' && impacts.length) {
      const label = metadata.entryLabel || impacts[0].label || 'källan';
      const count = metadata.totalCount || impacts.reduce((sum, item) => sum + item.count, 0);
      return `${quoteName(label)} har ${count} snapshot-effekt${count === 1 ? '' : 'er'}.\nVälj om de ska tas bort eller behållas när posten tas bort.`;
    }

    if (impacts.length === 1) {
      const impact = impacts[0];
      const label = impact.label || 'källan';
      const count = impact.count;
      return `${quoteName(label)} har ${count} snapshot-effekt${count === 1 ? '' : 'er'}.\nVälj om de ska tas bort eller behållas när posten tas bort.`;
    }

    const totalCount = impacts.reduce((sum, item) => sum + item.count, 0);
    return `${impacts.length} poster har totalt ${totalCount} snapshot-effekter.\nVälj om de ska tas bort eller behållas när posterna tas bort.`;
  }

  async function confirmRemovalDecision(impacts) {
    const normalized = normalizeImpacts(impacts);
    if (!normalized.length) return 'noop';

    if (typeof window.openDialog === 'function') {
      const choice = await window.openDialog(buildRemovalMessage(normalized), {
        cancel: true,
        okText: 'Ta bort effekter',
        extraText: 'Behåll effekter',
        cancelText: 'Avbryt'
      });
      if (choice === false) return 'cancel';
      if (choice === true) return 'remove';
      if (choice === 'extra') return 'detach';
      return 'noop';
    }

    const fallback = await window.confirmPopup?.('Ta bort kopplade snapshot-effekter också?');
    return fallback ? 'remove' : 'cancel';
  }

  window.snapshotHelper = {
    getEntryRemovalImpacts,
    getRowRemovalImpacts,
    confirmRemovalDecision
  };
})(window);
