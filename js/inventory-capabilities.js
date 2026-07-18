/* ===========================================================
   inventory-capabilities.js – data-driven inventory behavior
   =========================================================== */

(function(window) {
  const CAPABILITY_VERSION = 1;
  const QUANTITY_MODES = new Set(['stack', 'instance']);
  const TOPOLOGIES = new Set(['leaf', 'container', 'vehicle', 'bundle']);
  const STATE_LINKS = new Set([
    'catalog-reveal-while-owned',
    'selection-mirror-while-owned',
    'artifact-binding-effects',
    'snapshot-sources'
  ]);

  const normalizeToken = value => String(value || '')
    .trim()
    .toLocaleLowerCase('sv-SE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const toArray = value => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
  };

  const getTypes = entry => toArray(
    entry?.taggar?.typ
    ?? entry?.tags?.types
    ?? entry?.typ
    ?? entry?.types
  ).map(value => String(value || '').trim()).filter(Boolean);

  const getInventoryTag = container => {
    const value = container?.inventory;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };

  const getAttachedTypeRules = entry => {
    const value = entry?.__typ_regler
      || entry?.__type_rules
      || entry?.typ_regler
      || entry?.type_rules;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };

  function mergeInventoryConfig(entry) {
    const types = new Set(getTypes(entry).map(normalizeToken));
    const typeRules = getAttachedTypeRules(entry);
    const merged = {};
    Object.entries(typeRules).forEach(([typeName, template]) => {
      if (!types.has(normalizeToken(typeName))) return;
      Object.assign(merged, getInventoryTag(template?.taggar || template?.tags));
    });
    Object.assign(merged, getInventoryTag(entry?.taggar || entry?.tags));
    return merged;
  }

  function getCatalogEntry(entry) {
    if (!entry || !Array.isArray(window.DB)) return null;
    const id = String(entry.id || '').trim();
    if (id) {
      const byId = window.DB.find(candidate => String(candidate?.id || '').trim() === id);
      if (byId) return byId;
    }
    return window.DB.includes(entry) ? entry : null;
  }

  function hasHiddenRule(entry) {
    const helper = window.rulesHelper;
    if (!helper || typeof helper.getRuleList !== 'function') return false;
    let rules = [];
    try {
      rules = helper.getRuleList(entry, 'andrar', { level: entry?.nivå || '' }) || [];
    } catch (_) {
      return false;
    }
    return rules.some(rule => {
      const target = normalizeToken(rule?.target ?? rule?.mal);
      const value = rule?.value ?? rule?.varde;
      return target === 'hidden' && (
        value === true
        || value === 1
        || ['true', 'yes', 'ja', '1'].includes(normalizeToken(value))
      );
    });
  }

  function hasBundleRules(entry) {
    const helper = window.rulesHelper;
    if (!helper || typeof helper.getRuleList !== 'function') return false;
    let rules = [];
    try {
      rules = helper.getRuleList(entry, 'ger', { level: entry?.nivå || '' }) || [];
    } catch (_) {
      return false;
    }
    return rules.some(rule => {
      const target = normalizeToken(rule?.target ?? rule?.mal);
      return ['item', 'foremal'].includes(target);
    });
  }

  function resolve(entry) {
    const config = mergeInventoryConfig(entry);
    const catalogEntry = getCatalogEntry(entry);
    const version = Number(config.capability_version ?? config.capabilityVersion);
    const explicitlyVersioned = Number.isInteger(version) && version === CAPABILITY_VERSION;
    const isCustom = getTypes(entry).some(type => normalizeToken(type) === 'hemmagjort');
    const known = explicitlyVersioned && Boolean(catalogEntry || isCustom);
    const stateLinks = new Set(toArray(config.state_links ?? config.stateLinks)
      .map(value => String(value || '').trim())
      .filter(value => STATE_LINKS.has(value)));
    if (hasHiddenRule(entry)) stateLinks.add('catalog-reveal-while-owned');

    const rawQuantityMode = String((config.quantity_mode ?? config.quantityMode) || '').trim();
    const quantityMode = typeof config.stackbar === 'boolean'
      ? (config.stackbar ? 'stack' : 'instance')
      : (QUANTITY_MODES.has(rawQuantityMode) ? rawQuantityMode : '');
    const declaredTopology = String(config.topology || '').trim();
    const topology = hasBundleRules(entry)
      ? 'bundle'
      : (TOPOLOGIES.has(declaredTopology) ? declaredTopology : '');
    const derivedDomains = [...new Set(toArray(config.derived_domains ?? config.derivedDomains)
      .map(value => String(value || '').trim())
      .filter(Boolean))];

    let fallbackReason = '';
    if (!known) {
      fallbackReason = isCustom
        ? 'custom-capabilities-missing'
        : (catalogEntry ? 'catalog-capabilities-missing' : 'legacy-capabilities-missing');
    } else if (config.item === true && (!quantityMode || !topology)) {
      fallbackReason = 'inventory-capabilities-incomplete';
    }

    return Object.freeze({
      version: explicitlyVersioned ? version : 0,
      known: known && !fallbackReason,
      source: catalogEntry ? 'catalog' : (isCustom ? 'custom' : 'legacy'),
      fallbackReason,
      item: config.item === true,
      purchasable: config.purchasable === true,
      quantityMode,
      topology,
      stateLinks: Object.freeze([...stateLinks]),
      derivedDomains: Object.freeze(derivedDomains)
    });
  }

  const hasStateLink = (entryOrCapabilities, link) => {
    const capabilities = entryOrCapabilities?.stateLinks
      ? entryOrCapabilities
      : resolve(entryOrCapabilities);
    return Array.isArray(capabilities?.stateLinks) && capabilities.stateLinks.includes(link);
  };

  window.inventoryCapabilities = Object.freeze({
    CAPABILITY_VERSION,
    QUANTITY_MODES: Object.freeze([...QUANTITY_MODES]),
    TOPOLOGIES: Object.freeze([...TOPOLOGIES]),
    STATE_LINKS: Object.freeze([...STATE_LINKS]),
    resolve,
    isInventoryItem(entry) {
      const capabilities = resolve(entry);
      return capabilities.known ? capabilities.item : null;
    },
    isStackable(entry) {
      const capabilities = resolve(entry);
      return capabilities.known ? capabilities.quantityMode === 'stack' : null;
    },
    isIndividual(entry) {
      const capabilities = resolve(entry);
      return capabilities.known ? capabilities.quantityMode === 'instance' : null;
    },
    hasStateLink
  });
})(window);
