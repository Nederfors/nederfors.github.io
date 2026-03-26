(function(window){
  const utils = window.eliteUtils || {};
  const LEVEL_VALUE = utils.LEVEL_VALUE || { '': 0, Novis: 1, 'Gesäll': 2, 'Mästare': 3 };

  const toArray = (value) => (Array.isArray(value) ? value : []);
  const normalizeType = (type) => (typeof utils.normalizeType === 'function'
    ? utils.normalizeType(type)
    : String(type || '').trim());
  const normalizeLevel = (level, fallback = 'Novis') => (typeof utils.normalizeLevel === 'function'
    ? utils.normalizeLevel(level, fallback)
    : String(level || '').trim() || fallback);
  const levelMeets = (actual, required = 'Novis') => (typeof utils.levelMeets === 'function'
    ? utils.levelMeets(actual, required)
    : (LEVEL_VALUE[normalizeLevel(actual, '')] || 0) >= (LEVEL_VALUE[normalizeLevel(required, 'Novis')] || 0));

  function getLookupOptions() {
    return {
      dbList: Array.isArray(window.DB) ? window.DB : (Array.isArray(window.DBList) ? window.DBList : []),
      lookupEntry: window.lookupEntry
    };
  }

  function isRitualGroup(group) {
    const type = normalizeType(group?.type);
    return type === 'Ritual' || group?.allRitual || group?.anyRitual;
  }

  function isNoLevelGroup(group) {
    const type = normalizeType(group?.type);
    return type === 'Ritual' || type === 'Fördel' || type === 'Nackdel' || group?.allRitual || group?.anyRitual;
  }

  function groupMinLevel(group) {
    if (isRitualGroup(group)) return 'Novis';
    return normalizeLevel(group?.min_niva || 'Novis', 'Novis');
  }

  function getGroupNames(group) {
    return toArray(group?.names).map(name => String(name || '').trim()).filter(Boolean);
  }

  function groupSource(group) {
    return String(group?.source || '').trim();
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  const POPUP_SOURCE_ORDER = Object.freeze([
    'primarformaga',
    'specifikt_val',
    'valfri_inom_tagg',
    'valfritt',
    'specifika_fordelar',
    'specifika_nackdelar'
  ]);

  function sourceOrderRank(source) {
    const normalized = String(source || '').trim();
    const key = normalized.startsWith('valfri_inom_tagg')
      ? 'valfri_inom_tagg'
      : (normalized.startsWith('specifikt_val')
        ? 'specifikt_val'
        : (normalized === 'valfritt' ? 'valfritt' : normalized));
    const idx = POPUP_SOURCE_ORDER.indexOf(key);
    return idx >= 0 ? idx : POPUP_SOURCE_ORDER.length;
  }

  function valfriOrderIndex(source) {
    const match = String(source || '').trim().match(/^valfri_inom_tagg\[(\d+)\]$/);
    if (!match) return 0;
    return Number(match[1]) || 0;
  }

  function specifiktValOrderIndex(source) {
    const match = String(source || '').trim().match(/^specifikt_val\[(\d+)\]$/);
    if (!match) return 0;
    return Number(match[1]) || 0;
  }

  function groupMinErf(group) {
    return Math.max(0, Number(group?.min_erf) || 0);
  }

  function usesDynamicPicker(group) {
    const source = groupSource(group);
    return Boolean(
      group?.dynamic_select ||
      group?.anyMystic ||
      group?.anyRitual ||
      source === 'valfritt' ||
      source.startsWith('valfri_inom_tagg') ||
      source.startsWith('specifikt_val')
    );
  }

  function entryTypes(entry) {
    return toArray(entry?.taggar?.typ ?? entry?.tags?.types).map(type => normalizeType(type)).filter(Boolean);
  }

  function entryHasType(entry, type) {
    const wanted = normalizeType(type);
    if (!wanted) return true;
    const types = entryTypes(entry);
    if (types.includes(wanted)) return true;
    if (wanted === 'Förmåga' && types.includes('Basförmåga')) return true;
    return false;
  }

  function entryUsesLevel(entry) {
    const types = entryTypes(entry);
    return types.some(type =>
      type === 'Förmåga' ||
      type === 'Basförmåga' ||
      type === 'Mystisk kraft' ||
      type === 'Monstruöst särdrag' ||
      type === 'Särdrag'
    );
  }

  const SIMPLE_TIERS = Object.freeze(['Enkel', 'Ordinär', 'Avancerad']);

  function entryDefinedLevels(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (window.storeHelper && typeof window.storeHelper.entryDefinedLevels === 'function') {
      try {
        const levels = window.storeHelper.entryDefinedLevels(entry);
        if (Array.isArray(levels) && levels.length) {
          return levels
            .map(level => normalizeLevel(level, ''))
            .filter(Boolean);
        }
      } catch {}
    }
    const raw = []
      .concat(Object.keys(entry?.nivåer || {}))
      .concat(Object.keys(entry?.nivaer || {}))
      .concat(Object.keys(entry?.taggar?.nivå_data || {}))
      .concat(Object.keys(entry?.taggar?.niva_data || {}));
    return Array.from(new Set(raw.map(level => normalizeLevel(level, '')).filter(Boolean)));
  }

  function resolveFixedTierLabel(entry, preferredLevel = '') {
    if (!entry) return '';
    const isFixedTierType = entryHasType(entry, 'Ritual') || entryHasType(entry, 'Basförmåga');
    if (!isFixedTierType) return '';

    let resolved = '';
    if (window.storeHelper && typeof window.storeHelper.resolveEntryLevel === 'function') {
      try {
        resolved = normalizeLevel(window.storeHelper.resolveEntryLevel(entry, preferredLevel || entry?.nivå), '');
      } catch {}
    }
    if (SIMPLE_TIERS.includes(resolved)) return resolved;

    const defined = entryDefinedLevels(entry);
    return SIMPLE_TIERS.find(level => defined.includes(level)) || '';
  }

  function isEliteSkillEntry(entry) {
    if (typeof window.isEliteSkill === 'function') {
      try {
        return Boolean(window.isEliteSkill(entry));
      } catch {}
    }
    return entryHasType(entry, 'Elityrkesförmåga');
  }

  function findEntry(name) {
    if (typeof utils.findEntryByName === 'function') {
      return utils.findEntryByName(name, getLookupOptions());
    }
    try {
      return typeof lookupEntry === 'function'
        ? (lookupEntry({ id: name, name }) || lookupEntry(name))
        : null;
    } catch {
      return null;
    }
  }

  function getActiveStore() {
    if (typeof window.getRuntimeStore === 'function') {
      try {
        const runtimeStore = window.getRuntimeStore();
        if (runtimeStore && typeof runtimeStore === 'object') return runtimeStore;
      } catch {}
    }
    if (window.storeHelper && typeof window.storeHelper.load === 'function') {
      try {
        const latest = window.storeHelper.load();
        if (latest && typeof latest === 'object') return latest;
      } catch {}
    }
    try {
      if (typeof store === 'object' && store) return store;
    } catch {}
    return null;
  }

  async function ensureActiveStore() {
    let activeStore = getActiveStore();
    if (activeStore?.current) return activeStore;
    if (!(await requireCharacter())) return null;
    activeStore = getActiveStore();
    return activeStore?.current ? activeStore : null;
  }

  function syncEliteMutationUi() {
    if (typeof window.applyCharacterChange === 'function') {
      window.applyCharacterChange();
      return;
    }
    if (typeof window.updateXP === 'function') {
      window.updateXP();
    }
  }

  function parsePositiveLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.floor(numeric);
    if (rounded <= 0) return null;
    return rounded;
  }

  function normalizeMaxCount(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 99;
    const rounded = Math.floor(numeric);
    if (rounded <= 0) return fallback;
    return rounded;
  }

  function getEntryMaxCount(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return 1;
    if (typeof utils.getEntryMaxCount === 'function') {
      return normalizeMaxCount(utils.getEntryMaxCount(entry, options), 1);
    }
    const tagLimit = parsePositiveLimit(entry?.taggar?.max_antal);
    if (tagLimit !== null) return tagLimit;
    const directLimit = parsePositiveLimit(entry?.max_antal);
    if (directLimit !== null) return directLimit;
    if (options.allowLegacy !== false) {
      const legacyMulti = Boolean(
        entry?.kan_införskaffas_flera_gånger === true
        || entry?.taggar?.kan_införskaffas_flera_gånger === true
      );
      if (legacyMulti) return 3;
    }
    return 1;
  }

  function isRepeatableBenefitEntry(entry) {
    if (!entry) return false;
    if (typeof utils.isRepeatableBenefitEntry === 'function') {
      return utils.isRepeatableBenefitEntry(entry);
    }
    const multi = getEntryMaxCount(entry) > 1;
    if (!multi) return false;
    return entryHasType(entry, 'Fördel') || entryHasType(entry, 'Nackdel');
  }

  function isRepeatableBenefitName(name) {
    return isRepeatableBenefitEntry(findEntry(name));
  }

  function estimateRequirementErf(entry, level) {
    if (!entry) return 0;
    if (typeof utils.requirementErf === 'function') {
      return Math.max(0, Number(utils.requirementErf(entry, level)) || 0);
    }
    const types = entryTypes(entry);
    if (types.includes('Nackdel')) return 0;
    if (types.includes('Fördel')) return 5;
    if (types.includes('Ritual')) return 10;
    const isLevelType = types.some(type =>
      type === 'Förmåga' ||
      type === 'Mystisk kraft' ||
      type === 'Monstruöst särdrag' ||
      type === 'Särdrag');
    if (isLevelType) {
      const lvl = normalizeLevel(level || entry?.nivå, 'Novis');
      if (lvl === 'Mästare') return 60;
      if (lvl === 'Gesäll') return 30;
      return 10;
    }
    const raw = Number(entry?.erf);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return 10;
  }

  function calcItemXP(entry, list) {
    if (!entry || typeof entry !== 'object') return 0;
    const sourceList = Array.isArray(list) ? list : [entry];
    if (window.storeHelper && typeof window.storeHelper.calcEntryXP === 'function') {
      try {
        const xp = Number(window.storeHelper.calcEntryXP(entry, sourceList));
        if (Number.isFinite(xp)) return Math.max(0, xp);
      } catch {}
    }
    return estimateRequirementErf(entry, entry?.nivå);
  }

  function countFloorForModel(model) {
    const type = normalizeType(model?.group?.type || model?.type || '');
    if (type === 'Nackdel') return 0;
    if (type === 'Fördel') return 5;
    return 10;
  }

  function countCreditForEntry(entry, model, level) {
    if (!entry) return 0;
    if (entryHasType(entry, 'Nackdel')) {
      return normalizeType(model?.group?.type || model?.type || '') === 'Nackdel' ? 1 : 0;
    }
    if (entryHasType(entry, 'Fördel')) {
      return normalizeType(model?.group?.type || model?.type || '') === 'Fördel' ? 1 : 0;
    }
    const cost = estimateRequirementErf(entry, level);
    return cost >= countFloorForModel(model) ? 1 : 0;
  }

  function matchesTagGroupEntry(group, entry) {
    if (!group?.tagRule || !entry) return false;
    if (typeof utils.matchesTagRule === 'function' && !utils.matchesTagRule(entry, group.tagRule)) {
      return false;
    }
    const xpTypes = toArray(group?.tagRule?.xp_kallor).map(type => normalizeType(type)).filter(Boolean);
    if (xpTypes.length && !xpTypes.some(type => entryHasType(entry, type))) return false;
    const groupType = normalizeType(group?.type);
    if (groupType && !entryHasType(entry, groupType)) return false;
    return true;
  }

  function parseGroupRequirements(krav){
    const out = [];
    if (typeof utils.getKravGroups === 'function') {
      out.push(...utils.getKravGroups(krav || {}, getLookupOptions()));
    }
    const normalized = typeof utils.normalizeKrav === 'function'
      ? utils.normalizeKrav(krav || {})
      : (krav || {});
    const optionalErf = Math.max(0, Number(normalized?.valfritt?.krav_erf) || 0);
    if (optionalErf > 0) {
      const names = resolveValfrittCandidateNames();
      out.push({
        source: 'valfritt',
        type: '',
        names,
        min_antal: 0,
        min_niva: 'Novis',
        min_erf: optionalErf,
        slot_count: Math.max(2, Math.ceil(optionalErf / 10) + 1),
        dynamic_select: true,
        allow_repeat: true,
        isOptional: true
      });
    }

    const seen = new Set();
    return out
      .filter(group => {
        const sig = JSON.stringify({
          source: group?.source || '',
          type: normalizeType(group?.type),
          names: getGroupNames(group),
          anyMystic: Boolean(group?.anyMystic),
          anyRitual: Boolean(group?.anyRitual),
          min: Math.max(0, Number(group?.min_antal) || 0),
          minLevel: normalizeLevel(group?.min_niva || 'Novis', 'Novis'),
          minErf: groupMinErf(group),
          slotCount: Math.max(0, Number(group?.slot_count) || 0),
          dynamic: Boolean(group?.dynamic_select),
          allowRepeat: Boolean(group?.allow_repeat)
        });
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      })
      .map((group, pos) => ({ group, pos }))
      .sort((a, b) => {
        const aSource = groupSource(a.group);
        const bSource = groupSource(b.group);
        const rankDiff = sourceOrderRank(aSource) - sourceOrderRank(bSource);
        if (rankDiff !== 0) return rankDiff;
        const specifiktDiff = specifiktValOrderIndex(aSource) - specifiktValOrderIndex(bSource);
        if (specifiktDiff !== 0) return specifiktDiff;
        const valfriDiff = valfriOrderIndex(aSource) - valfriOrderIndex(bSource);
        if (valfriDiff !== 0) return valfriDiff;
        return a.pos - b.pos;
      })
      .map(row => row.group);
  }

  function parseNames(krav){
    const names = new Set();
    parseGroupRequirements(krav).forEach(group => {
      getGroupNames(group).forEach(name => names.add(name));
    });
    return Array.from(names);
  }

  function uniqueNames(list) {
    const out = [];
    const seen = new Set();
    toArray(list).forEach(value => {
      const name = String(value || '').trim();
      if (!name) return;
      const key = normalizeKey(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
    return out;
  }

  function getEliteRequirementSource(entry) {
    if (!entry || typeof entry !== 'object') return {};
    return entry?.elite_requirements || entry?.krav || {};
  }

  function gatherEliteExtraNames(entry) {
    const eliteName = String(entry?.namn || '').trim();
    const eliteKey = normalizeKey(eliteName);
    if (!eliteKey) return [];
    const out = [];
    const seen = new Set();
    const add = (item) => {
      const canonical = String(item?.namn || '').trim();
      if (!canonical) return;
      const key = normalizeKey(canonical);
      if (key === eliteKey || seen.has(key)) return;
      seen.add(key);
      out.push(canonical);
    };

    const db = toArray(getLookupOptions().dbList);
    db.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (isElityrkeEntry(item)) return;
      const types = entryTypes(item);
      if (!types.includes('Elityrkesförmåga')) return;
      const traditions = toArray(item?.taggar?.ark_trad).map(value => normalizeKey(value)).filter(Boolean);
      if (!traditions.includes(eliteKey)) return;
      add(item);
    });

    return out.sort((a, b) => a.localeCompare(b, 'sv'));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char] || char));
  }

  function groupHeading(group, idx) {
    if (group?.isPrimary) {
      const names = toArray(group?.names).map(name => String(name || '').trim()).filter(Boolean);
      return names.length > 1 ? 'Primärförmåga (välj en)' : 'Primärförmåga';
    }
    if (String(group?.source || '').trim().startsWith('specifikt_val')) return 'Specifikt val';
    if (group?.anyMystic) return 'Valfri mystisk kraft';
    if (group?.anyRitual) return 'Valfri ritual';

    const tagLabel = toArray(group?.tagRule?.taggar)
      .map(tag => String(tag || '').trim())
      .filter(Boolean)
      .join(', ');

    const source = String(group?.source || '');
    if (source === 'specifika_fordelar') return 'Specifika fördelar';
    if (source === 'specifika_nackdelar') return 'Specifika nackdelar';
    if (source === 'valfritt') return 'Valfritt';
    if (source.startsWith('valfri_inom_tagg')) return `Valfritt inom: ${tagLabel || 'Tagg'}`;
    return `Kravgrupp ${idx + 1}`;
  }

  function groupSummary(group, names, minCount) {
    const minErf = groupMinErf(group);
    const countFloor = countFloorForModel({ group });
    const source = String(group?.source || '').trim();
    if (source === 'valfritt') {
      return minErf > 0 ? `Minst ${minErf} ERF` : 'Inget minimikrav';
    }
    if (minErf > 0) {
      const parts = [`Minst ${minErf} ERF`];
      if (minCount > 0) {
        parts.push(group?.isPrimary
          ? `Minst ${minCount} val`
          : `Minst ${minCount} val (${countFloor}+ ERF/st)`);
      }
      if (names.length) parts.push(`${names.length} alternativ`);
      return parts.join(' · ');
    }
    const parts = [];
    const type = normalizeType(group?.type);
    if (type) parts.push(type);
    if (!isNoLevelGroup(group)) {
      parts.push(`Minst ${groupMinLevel(group)}`);
    }
    if (minCount > 0) parts.push(`Kräver ${minCount} val`);
    if (names.length) parts.push(`${names.length} alternativ`);
    return parts.join(' · ') || 'Inget minimikrav';
  }

  function groupHint(group, names, minCount) {
    if (!names.length) return 'Inga valbara alternativ hittades i databasen för det här kravet.';
    return '';
  }

  function isStaticRequirementModel(model) {
    if (!model || model.dynamic) return false;
    const required = Math.max(0, Number(model.minCount) || 0);
    if (required <= 0) return false;
    return model.names.length > 0 && model.names.length <= required;
  }

  function createPopup(){
    if(document.getElementById('masterPopup')) return;
    const div=document.createElement('div');
    div.id='masterPopup';
    div.className='popup';
    div.innerHTML = `
      <div class="popup-inner">
        <div class="master-header">
          <h3 id="masterTitle">Lägg till elityrke med krav</h3>
          <p id="masterSubtitle">Välj vilka krav som ska läggas till. Varje kort visar vad som krävs för att gå vidare.</p>
          <div id="masterProgress" class="master-progress" role="status" aria-live="polite"></div>
        </div>
        <div id="masterOpts"></div>
        <div id="masterBtns">
          <button id="masterCancel" class="db-btn db-btn--danger">Avbryt</button>
          <button id="masterAdd" class="db-btn">Lägg till</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    window.popupUi?.normalizeModal?.(div);
  }

  function buildLevelOptions(minLevel, options = {}){
    const { allowSkip = false, allowBelowMin = false } = options || {};
    const min = normalizeLevel(minLevel || 'Novis', 'Novis');
    const all = ['Novis', 'Gesäll', 'Mästare'];
    const levels = allowBelowMin ? all : all.filter(level => levelMeets(level, min));
    const opts = levels.map(level => `<option value="${level}">${level}</option>`).join('');
    if (allowSkip) return `<option value="skip">Skippa</option>${opts}`;
    return opts;
  }

  function candidateNamesForGroup(group){
    const explicit = getGroupNames(group);
    if (explicit.length) return explicit;
    if (String(group?.source || '').trim() === 'valfritt') {
      return resolveValfrittCandidateNames();
    }
    if (group?.anyMystic) return allMystic().map(item => item.namn).sort((a, b) => a.localeCompare(b, 'sv'));
    if (group?.anyRitual) return allRitual().map(item => item.namn).sort((a, b) => a.localeCompare(b, 'sv'));
    return [];
  }

  function isElityrkeEntry(entry) {
    return entryHasType(entry, 'Elityrke');
  }

  const VALFRITT_XP_TYPES = ['mystisk kraft', 'förmåga', 'basförmåga', 'särdrag', 'monstruöst särdrag', 'ritual'];

  function hasPositiveXPType(entry) {
    const types = (entry.taggar?.typ || []).map(t => t.toLowerCase());
    return types.some(t => VALFRITT_XP_TYPES.includes(t));
  }

  let _valfrittCache = null;

  function resolveValfrittCandidateNames() {
    if (_valfrittCache) return _valfrittCache;
    const db = toArray(getLookupOptions().dbList);
    const names = db
      .filter(entry => entry && typeof entry === 'object')
      .filter(entry => !isEliteSkillEntry(entry))
      .filter(entry => !isElityrkeEntry(entry))
      .filter(entry => !entryHasType(entry, 'Fördel') && !entryHasType(entry, 'Nackdel'))
      .filter(entry => hasPositiveXPType(entry))
      .map(entry => String(entry?.namn || '').trim())
      .filter(Boolean);
    _valfrittCache = uniqueNames(names).sort((a, b) => a.localeCompare(b, 'sv'));
    return _valfrittCache;
  }

  function clearValfrittCache() {
    _valfrittCache = null;
  }

  const TAG_TYPE_META = Object.freeze([
    { key: 'ability', label: 'Förmåga' },
    { key: 'base_ability', label: 'Basförmåga' },
    { key: 'mystic', label: 'Mystisk kraft' },
    { key: 'ritual', label: 'Ritual' },
    { key: 'monster_trait', label: 'Monstruöst särdrag' },
    { key: 'trait', label: 'Särdrag' },
    { key: 'other', label: 'Övrigt' },
    { key: 'advantage', label: 'Fördel' },
    { key: 'drawback', label: 'Nackdel' }
  ]);

  function typeLabelForKey(typeKey) {
    const hit = TAG_TYPE_META.find(meta => meta.key === typeKey);
    if (hit) return hit.label;
    return String(typeKey || '').trim();
  }

  function typeKeyForEntry(entry) {
    if (!entry) return '';
    if (entryHasType(entry, 'Mystisk kraft')) return 'mystic';
    if (entryHasType(entry, 'Ritual')) return 'ritual';
    if (entryHasType(entry, 'Monstruöst särdrag')) return 'monster_trait';
    if (entryHasType(entry, 'Särdrag')) return 'trait';
    if (entryHasType(entry, 'Basförmåga')) return 'base_ability';
    if (entryHasType(entry, 'Förmåga')) return 'ability';
    if (entryHasType(entry, 'Fördel')) return 'advantage';
    if (entryHasType(entry, 'Nackdel')) return 'drawback';
    return 'other';
  }

  function isReservedGroup(group) {
    const source = String(group?.source || '');
    if (group?.isPrimary) return true;
    return source.startsWith('specifika_') || source.startsWith('specifikt_val');
  }

  function groupPriority(model) {
    const source = String(model?.source || model?.group?.source || '');
    if (model?.group?.isPrimary) return 0;
    if (source.startsWith('specifika_') || source.startsWith('specifikt_val')) return 1;
    if (model?.group?.tagRule) return 2;
    const minErf = Math.max(0, Number(model?.minErf ?? model?.group?.min_erf) || 0);
    if (minErf > 0) return 3;
    return 4;
  }

  function groupOptionCount(model) {
    if (!model) return 9999;
    if (model?.progressive) {
      const counts = toArray(model?.typeOptions)
        .map(meta => Number(meta?.count) || 0)
        .filter(count => count > 0);
      if (counts.length) return Math.min(...counts);
    }
    return Math.max(1, Number(toArray(model.names).length) || 1);
  }

  function buildBenefitCountPlan(names, minCount) {
    const list = toArray(names).map(value => String(value || '').trim()).filter(Boolean);
    const required = Math.max(0, Number(minCount) || 0);
    const rows = list.map(name => {
      const entry = findEntry(name);
      const max = isRepeatableBenefitEntry(entry) ? getEntryMaxCount(entry) : 1;
      return { name, key: normalizeKey(name), max };
    }).filter(row => row.key);
    const totalMax = rows.reduce((sum, row) => sum + row.max, 0);
    const byKey = new Map();
    rows.forEach(row => {
      const mandatory = Math.max(0, Math.min(
        row.max,
        required - (totalMax - row.max)
      ));
      byKey.set(row.key, {
        name: row.name,
        max: row.max,
        mandatory
      });
    });
    return { required, totalMax, byKey };
  }

  function benefitMandatoryQty(model, name) {
    if (!model?.hasBenefitQty) return 0;
    const key = normalizeKey(name);
    if (!key) return 0;
    return Math.max(0, Number(model?.benefitPlan?.byKey?.get(key)?.mandatory) || 0);
  }

  function benefitMaxQty(model, name) {
    const key = normalizeKey(name);
    if (!key) return 1;
    const fromPlan = Math.max(0, Number(model?.benefitPlan?.byKey?.get(key)?.max) || 0);
    if (fromPlan > 0) return fromPlan;
    const entry = findEntry(name);
    return isRepeatableBenefitEntry(entry) ? getEntryMaxCount(entry) : 1;
  }

  function benefitMinQtyFloor(model, name) {
    const max = Math.max(1, benefitMaxQty(model, name));
    const mandatory = Math.max(0, benefitMandatoryQty(model, name));
    if (mandatory <= 0) return 1;
    return Math.max(1, Math.min(max, mandatory));
  }

  function buildErfRequirementPlan(names, minErf, minCount, minLevel = 'Novis') {
    const requiredErf = Math.max(0, Number(minErf) || 0);
    const requiredCount = Math.max(0, Number(minCount) || 0);
    const rows = toArray(names).map(raw => {
      const name = String(raw || '').trim();
      if (!name) return null;
      const key = normalizeKey(name);
      if (!key) return null;
      const entry = findEntry(name);
      const noLevel = isNoLevelEntry(entry);
      let options = [];
      if (noLevel) {
        const cost = Math.max(0, estimateRequirementErf(entry, 'pick'));
        options = [{ value: 'pick', cost }];
      } else {
        const levels = ['Novis', 'Gesäll', 'Mästare'].filter(level => levelMeets(level, minLevel || 'Novis'));
        options = levels.map(level => ({
          value: level,
          cost: Math.max(0, estimateRequirementErf(entry, level))
        }));
      }
      if (!options.length) return null;
      const maxErf = options.reduce((best, opt) => Math.max(best, Number(opt.cost) || 0), 0);
      return {
        name,
        key,
        noLevel,
        maxCount: 1,
        maxErf,
        options
      };
    }).filter(Boolean);

    const totalMaxCount = rows.reduce((sum, row) => sum + row.maxCount, 0);
    const totalMaxErf = rows.reduce((sum, row) => sum + row.maxErf, 0);
    const byKey = new Map();

    rows.forEach(row => {
      const mandatoryCount = Math.max(0, requiredCount - (totalMaxCount - row.maxCount));
      const mandatoryErf = Math.max(0, requiredErf - (totalMaxErf - row.maxErf));
      let floorValue = '';
      let floorCost = 0;
      if (mandatoryCount > 0 || mandatoryErf > 0) {
        const floorOption = row.options.find(opt => (Number(opt.cost) || 0) >= mandatoryErf) || row.options[row.options.length - 1];
        floorValue = String(floorOption?.value || row.options[0]?.value || '').trim();
        floorCost = Math.max(0, Number(floorOption?.cost) || 0);
      }
      byKey.set(row.key, {
        name: row.name,
        mandatory: mandatoryCount > 0 || mandatoryErf > 0,
        mandatoryCount,
        mandatoryErf,
        floorValue,
        floorCost,
        maxErf: row.maxErf,
        maxCount: row.maxCount,
        noLevel: row.noLevel
      });
    });

    return {
      requiredErf,
      requiredCount,
      totalMaxErf,
      totalMaxCount,
      byKey
    };
  }

  function abilityMandatoryInfo(model, name) {
    const key = normalizeKey(name);
    if (!key) return null;
    return model?.erfPlan?.byKey?.get(key) || null;
  }

  function abilityMandatoryValueFloor(model, name) {
    const info = abilityMandatoryInfo(model, name);
    return String(info?.floorValue || '').trim();
  }

  function setLockedField(node, locked) {
    if (!node) return;
    node.classList.toggle('master-locked-field', Boolean(locked));
  }

  function matchesGroupEntry(group, entry, levelOverride) {
    if (!group || !entry) return false;
    if (group?.tagRule) {
      if (!matchesTagGroupEntry(group, entry)) return false;
      const min = groupMinLevel(group);
      if (!isNoLevelGroup(group) && entryUsesLevel(entry)) {
        const lvl = levelOverride || entry?.nivå;
        if (!levelMeets(lvl, min)) return false;
      }
      return true;
    }
    if (group?.anyMystic) {
      if (!entryHasType(entry, 'Mystisk kraft')) return false;
      return levelMeets(levelOverride || entry?.nivå, groupMinLevel(group));
    }
    if (group?.anyRitual) {
      return entryHasType(entry, 'Ritual');
    }
    const names = new Set(getGroupNames(group).map(normalizeKey));
    if (names.size && !names.has(normalizeKey(entry?.namn))) return false;
    const type = normalizeType(group?.type);
    if (type && !entryHasType(entry, type)) return false;
    if (isNoLevelGroup(group) || !entryUsesLevel(entry)) return true;
    return levelMeets(levelOverride || entry?.nivå, groupMinLevel(group));
  }

  function defaultPicksForGroup(group, list, limit = 1, options = {}){
    const { fillFallback = true } = options || {};
    const names = candidateNamesForGroup(group);
    const max = Math.max(1, Number(limit) || 1);
    if (!names.length || max <= 0) return [];
    const noLevel = isNoLevelGroup(group);
    const minLevel = groupMinLevel(group);
    const pool = toArray(list);
    const used = new Set();
    const picks = [];
    const allowedNames = new Set(names.map(normalizeKey));

    pool
      .filter(item => allowedNames.has(normalizeKey(item?.namn)))
      .filter(item => matchesGroupEntry(group, item))
      .forEach(item => {
        if (picks.length >= max) return;
        const name = String(item?.namn || '').trim();
        if (!name) return;
        const repeatable = canStackRequirementEntry(item);
        if (!repeatable && used.has(normalizeKey(name))) return;
        const level = noLevel
          ? 'pick'
          : (levelMeets(item?.nivå, minLevel) ? item.nivå : minLevel);
        picks.push({ name, level });
        if (!repeatable) used.add(normalizeKey(name));
      });

    if (!fillFallback) return picks;

    names.forEach(name => {
      if (picks.length >= max) return;
      const key = normalizeKey(name);
      const repeatable = canStackRequirementEntry(findEntry(name));
      if (!repeatable && used.has(key)) return;
      const level = noLevel ? 'pick' : minLevel;
      picks.push({ name, level });
      if (!repeatable) used.add(key);
    });

    return picks;
  }

  function defaultPickForGroup(group, list){
    const pick = defaultPicksForGroup(group, list, 1, { fillFallback: true })[0];
    if (pick) return pick;
    return { name: '', level: '' };
  }

  function openPopup(entry, groups, cb){
    createPopup();
    const pop = document.getElementById('masterPopup');
    const box = pop.querySelector('#masterOpts');
    const progress = pop.querySelector('#masterProgress');
    const add = pop.querySelector('#masterAdd');
    const cls = pop.querySelector('#masterCancel');
    const currentList = (() => {
      try {
        const activeStore = getActiveStore();
        return activeStore ? storeHelper.getCurrentList(activeStore) : [];
      } catch {
        return [];
      }
    })();
    const extraNames = gatherEliteExtraNames(entry);
    const hasExtraChoices = extraNames.length > 0;
    const extraSlotCount = Math.max(1, extraNames.length || 1);
    let ownerByName = new Map();

    const entryCache = new Map();
    function cachedFindEntry(name) {
      if (entryCache.has(name)) return entryCache.get(name);
      const result = findEntry(name);
      entryCache.set(name, result);
      return result;
    }

    const models = groups.map((group, idx) => {
      const source = groupSource(group);
      const names = uniqueNames(candidateNamesForGroup(group));
      const minCount = Math.max(0, Number(group?.min_antal) || 0);
      const minErf = groupMinErf(group);
      const isPrimaryGroup = Boolean(group?.isPrimary);
      const isValfrittGroup = source === 'valfritt';
      const isPrimaryTag = source.startsWith('valfri_inom_tagg');
      const isTagBased = minErf > 0 && isPrimaryTag;
      const hasBenefitQty = source === 'specifika_fordelar' || source === 'specifika_nackdelar';
      const repeatableNames = new Set(names.filter(name => canStackRequirementEntry(cachedFindEntry(name))));
      const allowRepeat = Boolean(group?.allow_repeat) || repeatableNames.size > 0;
      const benefitPlan = hasBenefitQty ? buildBenefitCountPlan(names, minCount) : null;
      const minSlots = minCount > 0 ? minCount : (minErf > 0 ? 1 : 0);
      const baseSlotCount = Math.max(minSlots, Number(group?.slot_count) || 0, 1);
      const progressive = minErf > 0 && (isPrimaryTag || isValfrittGroup);
      const dynamic = Boolean(usesDynamicPicker(group));
      const erfPlan = (dynamic && !hasBenefitQty && !isValfrittGroup)
        ? buildErfRequirementPlan(names, minErf, minCount, groupMinLevel(group))
        : null;
      const adaptiveSlots = dynamic && !isPrimaryGroup;
      const rawSlotCount = adaptiveSlots
        ? (isValfrittGroup
          ? Math.max(baseSlotCount, Math.ceil(minErf / 10) + 2, 3)
          : Math.max(baseSlotCount + 1, minCount + 2, names.length + 1))
        : baseSlotCount;
      const slotCount = isPrimaryGroup
        ? 1
        : (allowRepeat
          ? rawSlotCount
          : (names.length ? Math.min(rawSlotCount, names.length) : rawSlotCount));
      const typeMeta = isValfrittGroup
        ? TAG_TYPE_META.filter(row => row.key !== 'advantage' && row.key !== 'drawback')
        : TAG_TYPE_META.slice();
      const typeBuckets = typeMeta.reduce((acc, row) => ({ ...acc, [row.key]: [] }), {});
      names.forEach(name => {
        const entry = cachedFindEntry(name);
        const key = typeKeyForEntry(entry);
        if (!key || !typeBuckets[key]) return;
        typeBuckets[key].push(name);
      });
      Object.keys(typeBuckets).forEach(key => {
        typeBuckets[key] = toArray(typeBuckets[key]).sort((a, b) => a.localeCompare(b, 'sv'));
      });
      const typeKeys = typeMeta.map(row => row.key);
      const typeOptions = typeMeta.map(row => {
        const count = toArray(typeBuckets[row.key]).length;
        return {
          key: row.key,
          label: row.label,
          count,
          enabled: count > 0
        };
      });
      return {
        idx,
        group,
        source,
        names,
        minCount,
        minErf,
        slotCount,
        isPrimary: isPrimaryGroup,
        isValfritt: isValfrittGroup,
        allowRepeat,
        repeatableNames,
        progressive,
        typeBuckets,
        typeKeys,
        typeOptions,
        dynamicAllowSkip: slotCount > minCount,
        isTagBased,
        adaptiveSlots,
        hasBenefitQty,
        benefitPlan,
        noLevel: isNoLevelGroup(group),
        minLevel: groupMinLevel(group),
        dynamic,
        erfPlan
      };
    });

    const renderFixedRows = (model) => {
      if (isStaticRequirementModel(model)) {
        return model.names.map(name => {
          const rawName = String(name || '').trim();
          const label = escapeHtml(rawName);
          const inferredLevel = model.minErf >= 50
            ? 'Mästare'
            : (model.minErf >= 25 ? 'Gesäll' : (model.minLevel || 'Novis'));
          const levelValue = model.noLevel
            ? 'pick'
            : inferredLevel;
          const valueLabel = levelValue === 'pick'
            ? 'Läggs till'
            : `Läggs till (${levelValue})`;
          return `
            <div class="master-row">
              <label class="master-row-name">${label}</label>
              <div class="master-row-controls single">
                <span
                  class="master-static-value"
                  data-group="${model.idx}"
                  data-static-name="${escapeHtml(rawName)}"
                  data-static-level="${escapeHtml(levelValue)}"
                >${escapeHtml(valueLabel)}</span>
              </div>
            </div>
          `;
        }).join('');
      }

      const allowSkip = model.names.length > model.minCount;
      return model.names.map(name => {
        const rawName = String(name || '').trim();
        const label = escapeHtml(rawName);
        const dataName = escapeHtml(rawName);
        if (model.noLevel) {
          const opts = allowSkip
            ? '<option value="skip">Skippa</option><option value="pick">Välj</option>'
            : '<option value="pick">Välj</option>';
          return `
            <div class="master-row">
              <label class="master-row-name">${label}</label>
              <div class="master-row-controls single">
                <select data-name="${dataName}" data-group="${model.idx}" class="level">${opts}</select>
              </div>
            </div>
          `;
        }
        const opts = buildLevelOptions(model.minLevel, {
          allowSkip,
          allowBelowMin: true
        });
        return `
          <div class="master-row">
            <label class="master-row-name">${label}</label>
            <div class="master-row-controls">
              <select data-name="${dataName}" data-group="${model.idx}" class="level">${opts}</select>
            </div>
          </div>
        `;
      }).join('');
    };

    const renderDynamicRows = (model) => {
      const slotCount = Math.max(1, Number(model.slotCount) || model.minCount || 1);
      if (model.progressive) {
        const typeOptions = toArray(model.typeOptions).map(opt => {
          const dis = opt.enabled ? '' : ' disabled';
          return `<option value="${escapeHtml(opt.key)}"${dis}>${escapeHtml(opt.label)}</option>`;
        }).join('');
        return Array.from({ length: slotCount }).map((_, slotIdx) => `
          <div class="master-row${slotIdx > 0 ? ' slot-hidden' : ''}" data-slot-row data-group="${model.idx}" data-slot="${slotIdx}">
            <label class="master-row-name">Val ${slotIdx + 1}</label>
            <div class="master-row-controls triple">
              <select data-choice-type data-group="${model.idx}" data-slot="${slotIdx}">${typeOptions}</select>
              <select data-ability data-group="${model.idx}" data-slot="${slotIdx}"><option value="">Välj...</option></select>
              <select data-choice-extra data-group="${model.idx}" data-slot="${slotIdx}"></select>
            </div>
          </div>
        `).join('');
      }
      if (model.group?.isPrimary) {
        const names = uniqueNames(model.names);
        const hasChoices = names.length > 0;
        const hasSingleChoice = names.length === 1;
        const nameOptions = !hasChoices
          ? '<option value="">Inga val</option>'
          : (hasSingleChoice
            ? `<option value="${escapeHtml(names[0])}">${escapeHtml(names[0])}</option>`
            : `<option value="">Välj...</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`);
        return `
          <div class="master-row">
            <label class="master-row-name">Val 1</label>
            <div class="master-row-controls">
              <select data-ability data-group="${model.idx}" data-slot="0"${hasSingleChoice || !hasChoices ? ' disabled' : ''}>${nameOptions}</select>
              <select data-name="" data-dynamic="1" data-group="${model.idx}" data-slot="0" class="level" disabled>
                <option value="Mästare">Mästare</option>
              </select>
            </div>
          </div>
        `;
      }
      const optsName = `<option value="">Välj...</option>${
        model.dynamicAllowSkip ? '<option value="skip">Skippa</option>' : ''
      }${
        model.names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')
      }`;
      const allowBelowMin = true;
      const levelOptions = buildLevelOptions(model.minLevel, { allowSkip: false, allowBelowMin });
      return Array.from({ length: slotCount }).map((_, slotIdx) => `
        <div class="master-row${model.adaptiveSlots && slotIdx > 0 ? ' slot-hidden' : ''}"${model.adaptiveSlots ? ` data-slot-row data-group="${model.idx}" data-slot="${slotIdx}"` : ''}>
          <label class="master-row-name">Val ${slotIdx + 1}</label>
          <div class="master-row-controls ${model.noLevel ? (model.hasBenefitQty ? 'benefit' : 'single') : ''}">
            <select data-ability data-group="${model.idx}" data-slot="${slotIdx}">${optsName}</select>
            ${model.noLevel
              ? (model.hasBenefitQty
                ? `<select data-benefit-qty data-group="${model.idx}" data-slot="${slotIdx}"><option value="x1">x1</option></select>`
                : '')
              : `<select data-name="" data-dynamic="1" data-group="${model.idx}" data-slot="${slotIdx}" class="level">${levelOptions}</select>`}
          </div>
        </div>
      `).join('');
    };

    const renderExtraRows = () => {
      const levelsForExtra = (name) => {
        const item = findEntry(name);
        if (!item || !entryUsesLevel(item)) return ['pick'];
        const rawKeys = []
          .concat(Object.keys(item?.nivåer || {}))
          .concat(Object.keys(item?.nivaer || {}))
          .concat(Object.keys(item?.taggar?.nivå_data || {}))
          .concat(Object.keys(item?.taggar?.niva_data || {}));
        const normalized = new Set(rawKeys.map(level => normalizeLevel(level, '')).filter(Boolean));
        const ordered = ['Novis', 'Gesäll', 'Mästare'];
        const fromData = ordered.filter(level => normalized.has(level));
        return fromData.length ? fromData : ordered;
      };
      return extraNames.map((name, slotIdx) => {
        const levels = levelsForExtra(name);
        const optionHtml = levels[0] === 'pick'
          ? '<option value="skip">Skippa</option><option value="pick">Lägg till</option>'
          : `<option value="skip">Skippa</option>${levels.map(level => `<option value="${level}">${level}</option>`).join('')}`;
        return `
          <div class="master-row" data-extra-row data-slot="${slotIdx}" data-extra-name="${escapeHtml(name)}">
            <label class="master-row-name">${escapeHtml(name)}</label>
            <div class="master-row-controls single">
              <select data-extra-pick data-name="${escapeHtml(name)}" data-slot="${slotIdx}">
                ${optionHtml}
              </select>
            </div>
          </div>
        `;
      }).join('');
    };

    const initialGroupCountLabel = (model) => {
      if (model.minErf > 0 && model.minCount > 0) {
        return `0/${model.minErf} ERF · 0/${model.minCount}`;
      }
      if (model.minErf > 0) return `0/${model.minErf} ERF`;
      if (model.minCount > 0) return `0/${model.minCount}`;
      return '0/0';
    };

    box.innerHTML = models.map(model => {
      const title = groupHeading(model.group, model.idx);
      const summary = groupSummary(model.group, model.names, model.minCount);
      const hint = groupHint(model.group, model.names, model.minCount);
      const hintMarkup = hint ? `<p class="master-group-hint">${escapeHtml(hint)}</p>` : '';
      const rows = model.dynamic ? renderDynamicRows(model) : renderFixedRows(model);
      return `
        <section class="master-group" data-group-card="${model.idx}" data-group-source="${escapeHtml(model.source)}" data-state="missing">
          <div class="master-group-head">
            <div class="master-group-title-wrap">
              <h4 class="master-group-title">${escapeHtml(title)}</h4>
              <p class="master-group-meta">${escapeHtml(summary)}</p>
            </div>
            <div class="master-group-state-wrap">
              <span class="master-group-count" data-group-count="${model.idx}">${initialGroupCountLabel(model)}</span>
              <span class="master-group-state" data-group-state="${model.idx}">Saknas</span>
            </div>
          </div>
          ${hintMarkup}
          <div class="master-group-body">
            ${rows}
          </div>
        </section>
      `;
    }).join('') + (hasExtraChoices ? `
      <section class="master-group master-group-extra" id="masterExtraSection" data-state="missing" hidden>
        <div class="master-group-head">
          <div class="master-group-title-wrap">
            <h4 class="master-group-title">Lägg till elityrkesförmågor?</h4>
          </div>
          <div class="master-group-state-wrap">
            <span class="master-group-state ok">Valfritt</span>
          </div>
        </div>
        <div class="master-group-body" id="masterExtraBody">
          ${renderExtraRows()}
        </div>
      </section>
    ` : '');

    const usingManager = Boolean(window.popupManager?.open && window.popupManager?.close && pop?.id);
    let popupSession = null;
    let cleaned = false;
    let resolved = false;
    const allSels = Array.from(box.querySelectorAll('select'));

    function closeInternal(){
      if (cleaned) return;
      cleaned = true;
      clearValfrittCache();
      pop.classList.remove('open');
      box.innerHTML = '';
      add.removeEventListener('click', onAdd);
      cls.removeEventListener('click', onCancel);
      if (!usingManager) pop.removeEventListener('click', onOutside);
      if (!usingManager) document.removeEventListener('keydown', onKeyDown);
      allSels.forEach(sel => sel.removeEventListener('change', onControlChange));
    }

    function close(reason = 'programmatic'){
      if (popupSession?.close) {
        popupSession.close(reason);
      } else {
        closeInternal();
      }
    }

    function finish(result, reason = 'programmatic') {
      if (resolved) return;
      resolved = true;
      close(reason);
      cb(result);
    }

    if (usingManager) {
      popupSession = {
        close: (reason = 'programmatic') => window.popupManager.close(pop, reason)
      };
      window.popupManager.open(pop, {
        type: 'picker',
        onClose: () => {
          closeInternal();
          if (!resolved) {
            resolved = true;
            cb(null);
          }
        }
      });
    } else {
      pop.classList.add('open');
    }
    pop.querySelector('.popup-inner').scrollTop = 0;

    function makeNameOwnerMap(states) {
      const map = new Map();
      models.forEach(model => {
        if (String(model?.source || '') === 'valfritt') return;
        const state = states.get(model.idx);
        toArray(state?.picked).forEach(token => {
          const key = normalizeKey(token?.name || token?.entry?.namn || '');
          if (!key || map.has(key)) return;
          map.set(key, model.idx);
        });
      });
      return map;
    }

    function isNameOwnedByOtherGroup(name, modelIdx) {
      const key = normalizeKey(name);
      if (!key) return false;
      if (!ownerByName.has(key)) return false;
      return ownerByName.get(key) !== modelIdx;
    }

    function selectionSignature() {
      return models.map(model => {
        const fixed = Array.from(box.querySelectorAll(`select[data-group="${model.idx}"][data-name]:not([data-dynamic="1"])`))
          .map(sel => `${String(sel.dataset.name || '').trim()}:${String(sel.value || '').trim()}`)
          .join('|');
        const dyn = Array.from(box.querySelectorAll(`select[data-ability][data-group="${model.idx}"]`))
          .map(sel => {
            const slot = String(sel.dataset.slot || '');
            const name = String(sel.value || '').trim();
            const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
            const lvl = String(lvlSel?.value || '').trim();
            const choiceExtraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
            const choiceExtra = String(choiceExtraSel?.value || '').trim();
            const qtySel = box.querySelector(`select[data-benefit-qty][data-group="${model.idx}"][data-slot="${slot}"]`);
            const qty = String(qtySel?.value || '').trim();
            return `${slot}:${name}:${lvl}:${choiceExtra}:${qty}`;
          })
          .join('|');
        return `${model.idx}#${fixed}#${dyn}`;
      }).join('||');
    }

    function visibleSlotCount(model) {
      if (!model.adaptiveSlots) return model.slotCount;
      const rows = Array.from(box.querySelectorAll(`.master-row[data-slot-row][data-group="${model.idx}"]`));
      return rows.filter(row => !row.classList.contains('slot-hidden')).length;
    }

    function setVisibleSlots(model, count) {
      if (!model.adaptiveSlots) return;
      const target = Math.max(1, Math.min(model.slotCount, Number(count) || 1));
      Array.from(box.querySelectorAll(`.master-row[data-slot-row][data-group="${model.idx}"]`)).forEach((row, idx) => {
        const hide = idx >= target;
        row.classList.toggle('slot-hidden', hide);
        if (!hide) return;
        const slot = String(row.dataset.slot || '');
        const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
        if (nameSel) nameSel.value = '';
        const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
        if (lvlSel) lvlSel.value = model.minLevel || 'Novis';
        const qtySel = box.querySelector(`select[data-benefit-qty][data-group="${model.idx}"][data-slot="${slot}"]`);
        if (qtySel) qtySel.value = 'x1';
        const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
        if (extraSel) extraSel.value = 'x1';
      });
    }

    function visibleExtraRows() {
      return Array.from(box.querySelectorAll('.master-row[data-extra-row]'));
    }

    function setVisibleExtraSlots(count) {
      const target = Math.max(0, Math.min(extraSlotCount, Number(count) || 0));
      Array.from(box.querySelectorAll('.master-row[data-extra-row]')).forEach((row, idx) => {
        row.classList.toggle('slot-hidden', idx >= target);
      });
    }

    function collectExtraSelections() {
      const section = box.querySelector('#masterExtraSection');
      if (!section || section.hidden) return [];
      const rows = visibleExtraRows();
      const out = [];
      rows.forEach(row => {
        const name = String(row.dataset.extraName || '').trim();
        if (!name) return;
        const pickSel = row.querySelector('select[data-extra-pick]');
        const pickValue = String(pickSel?.value || 'skip').trim();
        if (!pickValue || pickValue === 'skip') return;
        const item = findEntry(name);
        if (!item) return;
        if (pickValue === 'pick') {
          out.push({ name, level: isNoLevelEntry(item) ? 'pick' : 'Novis' });
        } else {
          out.push({ name, level: entryUsesLevel(item) ? normalizeLevel(pickValue, 'Novis') : 'pick' });
        }
      });
      return out;
    }

    function visibleAdaptiveRows(model) {
      if (!model?.adaptiveSlots) return [];
      return Array.from(box.querySelectorAll(`.master-row[data-slot-row][data-group="${model.idx}"]`))
        .filter(row => !row.classList.contains('slot-hidden'));
    }

    function selectedNamesOtherSlots(model, slot) {
      const other = new Set();
      visibleAdaptiveRows(model).forEach(row => {
        const rowSlot = String(row.dataset.slot || '');
        if (rowSlot === String(slot || '')) return;
        const rowNameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${rowSlot}"]`);
        const value = String(rowNameSel?.value || '').trim();
        if (value) other.add(value);
      });
      return other;
    }

    function visibleAbilitySelects(model) {
      let sels = Array.from(box.querySelectorAll(`select[data-ability][data-group="${model.idx}"]`));
      if (model?.adaptiveSlots) {
        sels = sels.filter(sel => !sel.closest('.master-row')?.classList.contains('slot-hidden'));
      }
      return sels;
    }

    function selectedNamesAcrossOtherGroups(model, slot) {
      const taken = new Set();
      models.forEach(otherModel => {
        if (!otherModel) return;
        if (otherModel.idx === model.idx) {
          visibleAbilitySelects(otherModel).forEach(sel => {
            const rowSlot = String(sel.dataset.slot || '');
            if (rowSlot === String(slot || '')) return;
            const value = String(sel.value || '').trim();
            if (!value || value === 'skip') return;
            taken.add(value);
          });
          return;
        }
        if (otherModel.dynamic) {
          visibleAbilitySelects(otherModel).forEach(sel => {
            const value = String(sel.value || '').trim();
            if (!value || value === 'skip') return;
            taken.add(value);
          });
          return;
        }
        Array.from(box.querySelectorAll(`select[data-group="${otherModel.idx}"][data-name]:not([data-dynamic="1"])`)).forEach(sel => {
          const value = String(sel.value || '').trim();
          if (!value || value === 'skip') return;
          const name = String(sel.dataset.name || '').trim();
          if (name) taken.add(name);
        });
      });
      return taken;
    }

    function availableNamesForType(model, typeKey, slot) {
      const names = uniqueNames(toArray(model.typeBuckets?.[typeKey]));
      if (!names.length) return [];
      const blocked = selectedNamesOtherSlots(model, slot);
      const blockedGlobal = selectedNamesAcrossOtherGroups(model, slot);
      return names.filter(name => {
        if (isNameOwnedByOtherGroup(name, model.idx)) return false;
        if (blockedGlobal.has(name)) return false;
        const entry = findEntry(name);
        if (canStackRequirementEntry(entry)) return true;
        return !blocked.has(name);
      });
    }

    function typeOptionsForSlot(model, slot) {
      const rows = toArray(model?.typeOptions).length ? toArray(model.typeOptions) : TAG_TYPE_META;
      return rows.map(meta => {
        const available = availableNamesForType(model, meta.key, slot);
        const enabled = available.length > 0;
        return {
          key: meta.key,
          label: meta.label,
          enabled
        };
      });
    }

    function syncProgressiveRow(model, slot) {
      if (!model.progressive) return;
      const typeSel = box.querySelector(`select[data-choice-type][data-group="${model.idx}"][data-slot="${slot}"]`);
      const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
      const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
      if (!typeSel || !nameSel || !extraSel) return;

      const currentType = String(typeSel.value || '').trim();
      const rowTypeOptions = typeOptionsForSlot(model, slot);
      const enabledKeys = rowTypeOptions.filter(opt => opt.enabled).map(opt => opt.key);
      const typeHtml = rowTypeOptions.map(opt => {
        const dis = opt.enabled ? '' : ' disabled';
        const sel = opt.key === currentType ? ' selected' : '';
        return `<option value="${escapeHtml(opt.key)}"${dis}${sel}>${escapeHtml(opt.label)}</option>`;
      }).join('');
      typeSel.innerHTML = typeHtml;

      if (!enabledKeys.length) {
        nameSel.innerHTML = '<option value="">Inga val</option>';
        nameSel.disabled = true;
        extraSel.innerHTML = '<option value="x1">x1</option>';
        extraSel.disabled = true;
        typeSel.disabled = true;
        return;
      }
      typeSel.disabled = false;
      const typeKey = enabledKeys.includes(currentType) ? currentType : enabledKeys[0];
      typeSel.value = typeKey;

      const names = availableNamesForType(model, typeKey, slot);
      const prevName = String(nameSel.value || '').trim();
      if (!names.length) {
        nameSel.innerHTML = '<option value="">Inga val</option>';
        nameSel.disabled = true;
      } else {
        nameSel.innerHTML = `<option value="">Välj...</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
        nameSel.disabled = false;
      }
      if (prevName && names.includes(prevName)) nameSel.value = prevName;

      const chosenName = String(nameSel.value || '').trim();
      const chosenEntry = chosenName ? findEntry(chosenName) : null;
      let extraOptions = [];
      const fixedTier = chosenEntry ? resolveFixedTierLabel(chosenEntry, chosenEntry?.nivå) : '';
      const hasFixedTier = Boolean(fixedTier);
      if (hasFixedTier) {
        extraOptions = [{ value: fixedTier, label: fixedTier }];
      } else if (chosenEntry && entryUsesLevel(chosenEntry) && !isNoLevelEntry(chosenEntry)) {
        extraOptions = ['Novis', 'Gesäll', 'Mästare'].map(level => ({ value: level, label: level }));
      } else {
        const maxCount = chosenEntry ? Math.max(1, getEntryMaxCount(chosenEntry, { list: currentList })) : 1;
        extraOptions = Array.from({ length: maxCount }).map((_, idx) => ({ value: `x${idx + 1}`, label: `x${idx + 1}` }));
      }
      const prevExtra = String(extraSel.value || '').trim();
      extraSel.innerHTML = extraOptions.map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join('');
      if (hasFixedTier) {
        extraSel.value = fixedTier;
      } else if (prevExtra && extraOptions.some(opt => opt.value === prevExtra)) {
        extraSel.value = prevExtra;
      }
      if (hasFixedTier) {
        extraSel.disabled = true;
        extraSel.dataset.fixedTier = '1';
        setLockedField(extraSel, true);
      } else {
        extraSel.disabled = !chosenName || !names.length || extraOptions.length <= 1;
        extraSel.dataset.fixedTier = '';
        setLockedField(extraSel, false);
      }
    }

    function progressiveSlotHasChoices(model, slot) {
      const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
      if (!nameSel || nameSel.disabled) return false;
      return Array.from(nameSel.options).some(opt => {
        const value = String(opt.value || '').trim();
        return value && value !== 'skip';
      });
    }

    function syncDynamicOptions(groupIdx) {
      const model = models[Number(groupIdx)];
      if (!model) return;
      const options = visibleAbilitySelects(model);
      if (!options.length) return;

      if (model?.progressive) {
        visibleAdaptiveRows(model).forEach(row => {
          const slot = String(row.dataset.slot || '');
          syncProgressiveRow(model, slot);
        });
        syncProgressiveLocks(model);
        return;
      }
      if (model?.group?.isPrimary) {
        const nameSel = options[0];
        if (!nameSel) return;
        const slot = String(nameSel.dataset.slot || '0');
        const own = String(nameSel.value || '').trim();
        const takenByOtherGroups = selectedNamesAcrossOtherGroups(model, slot);
        const visibleNames = uniqueNames(model.names).filter(name => {
          if (name === own) return true;
          if (isNameOwnedByOtherGroup(name, model.idx)) return false;
          if (takenByOtherGroups.has(name)) return false;
          return true;
        });
        if (!visibleNames.length) {
          nameSel.innerHTML = '<option value="">Inga val</option>';
          nameSel.value = '';
          nameSel.disabled = true;
          setLockedField(nameSel, true);
          syncDynamicLevelControl(model, slot);
          return;
        }
        if (visibleNames.length === 1) {
          const only = visibleNames[0];
          nameSel.innerHTML = `<option value="${escapeHtml(only)}">${escapeHtml(only)}</option>`;
          nameSel.value = only;
          nameSel.disabled = true;
          setLockedField(nameSel, true);
          syncDynamicLevelControl(model, slot);
          return;
        }
        nameSel.innerHTML = `<option value="">Välj...</option>${visibleNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
        if (own && visibleNames.includes(own)) {
          nameSel.value = own;
        } else {
          nameSel.value = '';
        }
        nameSel.disabled = false;
        setLockedField(nameSel, false);
        syncDynamicLevelControl(model, slot);
        return;
      }

      const pickedBySlot = new Map(
        options.map(sel => [String(sel.dataset.slot || ''), String(sel.value || '').trim()])
      );
      if (model.hasBenefitQty) {
        const seen = new Set();
        options.forEach(sel => {
          const slot = String(sel.dataset.slot || '');
          const own = String(pickedBySlot.get(slot) || '').trim();
          if (!own || own === 'skip') return;
          if (seen.has(own)) {
            pickedBySlot.set(slot, '');
            return;
          }
          seen.add(own);
        });
      }
      options.forEach(sel => {
        const slot = String(sel.dataset.slot || '');
        const own = pickedBySlot.get(slot) || '';
        const takenByOthers = new Set(
          Array.from(pickedBySlot.entries())
            .filter(([otherSlot]) => otherSlot !== slot)
            .map(([, value]) => value)
            .filter(Boolean)
            .filter(value => value !== 'skip')
        );
        const takenByOtherGroups = selectedNamesAcrossOtherGroups(model, slot);
        const visibleNames = uniqueNames(model.names).filter(name => {
          if (isNameOwnedByOtherGroup(name, model.idx)) return false;
          if (takenByOtherGroups.has(name)) return false;
          if (model.hasBenefitQty) {
            return name === own || !takenByOthers.has(name);
          }
          if (name === own) return true;
          if (!takenByOthers.has(name)) return true;
          return model?.repeatableNames?.has(name);
        });
        sel.innerHTML = `<option value="">Välj...</option>${
          model.dynamicAllowSkip ? '<option value="skip">Skippa</option>' : ''
        }${visibleNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
        if (own && [...sel.options].some(opt => opt.value === own)) {
          sel.value = own;
        } else {
          sel.value = '';
        }
        if (model) {
          syncDynamicLevelControl(model, slot);
          syncBenefitQtyControl(model, slot);
        }
      });
      syncBenefitLocks(model);
      syncAbilityLocks(model);
    }

    function syncDynamicLevelControl(model, slot) {
      if (model?.progressive) return;
      const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
      if (!lvlSel) return;
      const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
      if (model?.group?.isPrimary) {
        const pickedPrimary = String(nameSel?.value || '').trim();
        lvlSel.innerHTML = '<option value="Mästare">Mästare</option>';
        lvlSel.value = 'Mästare';
        lvlSel.disabled = true;
        lvlSel.dataset.name = pickedPrimary && pickedPrimary !== 'skip' ? pickedPrimary : '';
        setLockedField(lvlSel, true);
        return;
      }
      const picked = String(nameSel?.value || '').trim();
      const entry = picked && picked !== 'skip' ? findEntry(picked) : null;
      const disable = !picked || picked === 'skip' || !entry || isNoLevelEntry(entry);
      lvlSel.disabled = disable;
      if (disable) lvlSel.value = 'Novis';
      lvlSel.dataset.name = disable ? '' : picked;
    }

    function syncBenefitQtyControl(model, slot) {
      if (!model?.hasBenefitQty) return;
      const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
      const qtySel = box.querySelector(`select[data-benefit-qty][data-group="${model.idx}"][data-slot="${slot}"]`);
      if (!nameSel || !qtySel) return;
      const picked = String(nameSel.value || '').trim();
      if (!picked || picked === 'skip') {
        qtySel.innerHTML = '<option value="x1">x1</option>';
        qtySel.value = 'x1';
        qtySel.disabled = true;
        setLockedField(qtySel, false);
        return;
      }
      const entry = findEntry(picked);
      const max = isRepeatableBenefitEntry(entry) ? getEntryMaxCount(entry) : 1;
      const floor = Math.max(1, Math.min(max, benefitMinQtyFloor(model, picked)));
      const prev = String(qtySel.value || '').trim();
      qtySel.innerHTML = Array.from({ length: Math.max(1, (max - floor) + 1) }, (_, idx) => {
        const value = `x${floor + idx}`;
        return `<option value="${value}">${value}</option>`;
      }).join('');
      if (prev && [...qtySel.options].some(opt => opt.value === prev)) {
        qtySel.value = prev;
      } else {
        qtySel.value = `x${floor}`;
      }
      qtySel.disabled = max <= floor;
      const qtyHardLocked = benefitMandatoryQty(model, picked) > 0 && max <= floor;
      setLockedField(qtySel, qtyHardLocked);
    }

    function syncBenefitLocks(model) {
      if (!model?.hasBenefitQty) return;
      const abilitySels = Array.from(box.querySelectorAll(`select[data-ability][data-group="${model.idx}"]`));
      abilitySels.forEach(sel => {
        const name = String(sel.value || '').trim();
        const mandatory = benefitMandatoryQty(model, name);
        const lock = mandatory > 0;
        sel.disabled = lock;
        sel.dataset.lockedMandatory = lock ? '1' : '';
        setLockedField(sel, lock);
      });
    }

    function syncAbilityLocks(model) {
      if (!model?.dynamic || model?.hasBenefitQty || model?.progressive) return;
      const abilitySels = Array.from(box.querySelectorAll(`select[data-ability][data-group="${model.idx}"]`));
      abilitySels.forEach(sel => {
        const slot = String(sel.dataset.slot || '');
        const picked = String(sel.value || '').trim();
        const info = abilityMandatoryInfo(model, picked);
        const lockName = Boolean(info?.mandatory);
        sel.disabled = lockName;
        sel.dataset.lockedMandatory = lockName ? '1' : '';
        setLockedField(sel, lockName);

        const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
        if (!lvlSel) return;
        const entry = picked && picked !== 'skip' ? findEntry(picked) : null;
        if (!entry || isNoLevelEntry(entry)) {
          setLockedField(lvlSel, false);
          return;
        }

        const floor = abilityMandatoryValueFloor(model, picked);
        const orderedLevels = ['Novis', 'Gesäll', 'Mästare'];
        const baseMin = normalizeLevel(model.minLevel || 'Novis', 'Novis');
        let allowed = orderedLevels.filter(level => levelMeets(level, baseMin));
        if (floor) allowed = allowed.filter(level => levelMeets(level, floor));
        if (!allowed.length) allowed = orderedLevels.filter(level => levelMeets(level, baseMin));
        if (!allowed.length) allowed = ['Novis'];

        const prev = String(lvlSel.value || '').trim();
        lvlSel.innerHTML = allowed.map(level => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`).join('');
        if (prev && allowed.includes(prev)) {
          lvlSel.value = prev;
        } else if (floor && allowed.includes(floor)) {
          lvlSel.value = floor;
        } else {
          lvlSel.value = allowed[0];
        }

        const top = allowed[allowed.length - 1] || '';
        const lockLevel = lockName &&
          Boolean(floor) &&
          normalizeLevel(top, '') === normalizeLevel(floor, '');
        lvlSel.disabled = lockLevel;
        setLockedField(lvlSel, lockLevel);
      });
    }

    function syncProgressiveLocks(model) {
      if (!model?.progressive) return;
      const rows = visibleAdaptiveRows(model);
      if (!rows.length) return;

      const mandatoryByKey = new Map();
      toArray(model.names).forEach(rawName => {
        const name = String(rawName || '').trim();
        const key = normalizeKey(name);
        if (!name || !key || mandatoryByKey.has(key)) return;
        const info = abilityMandatoryInfo(model, name);
        if (!info?.mandatory) return;
        mandatoryByKey.set(key, { name, info });
      });

      const resetLock = (sel, canEnable = true) => {
        if (!sel) return;
        const wasLocked = sel.dataset.lockedMandatory === '1';
        if (wasLocked && canEnable) sel.disabled = false;
        sel.dataset.lockedMandatory = '';
        setLockedField(sel, false);
      };

      if (!mandatoryByKey.size) {
        rows.forEach(row => {
          const slot = String(row.dataset.slot || '');
          const typeSel = box.querySelector(`select[data-choice-type][data-group="${model.idx}"][data-slot="${slot}"]`);
          const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
          const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
          resetLock(typeSel, true);
          resetLock(nameSel, true);
          resetLock(extraSel, Boolean(nameSel && String(nameSel.value || '').trim() && extraSel && extraSel.options.length > 1));
        });
        return;
      }

      const alreadyPickedMandatory = new Set();
      rows.forEach(row => {
        const slot = String(row.dataset.slot || '');
        const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
        const key = normalizeKey(nameSel?.value);
        if (!key || !mandatoryByKey.has(key)) return;
        alreadyPickedMandatory.add(key);
      });

      const pendingMandatory = Array.from(mandatoryByKey.entries())
        .filter(([key]) => !alreadyPickedMandatory.has(key));

      rows.forEach(row => {
        if (!pendingMandatory.length) return;
        const slot = String(row.dataset.slot || '');
        const typeSel = box.querySelector(`select[data-choice-type][data-group="${model.idx}"][data-slot="${slot}"]`);
        const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
        if (!typeSel || !nameSel) return;
        if (String(nameSel.value || '').trim()) return;

        const [key, payload] = pendingMandatory[0];
        const entry = findEntry(payload.name);
        const typeKey = typeKeyForEntry(entry);
        if (typeKey && [...typeSel.options].some(opt => opt.value === typeKey && !opt.disabled)) {
          typeSel.value = typeKey;
        }
        syncProgressiveRow(model, slot);
        if (![...nameSel.options].some(opt => opt.value === payload.name)) return;

        nameSel.value = payload.name;
        syncProgressiveRow(model, slot);

        const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
        if (extraSel && entryUsesLevel(entry) && !isNoLevelEntry(entry)) {
          const floor = String(payload.info?.floorValue || '').trim();
          if (floor) {
            const allowed = Array.from(extraSel.options)
              .map(opt => String(opt.value || '').trim())
              .filter(value => levelMeets(value, floor));
            if (allowed.length) {
              const prev = String(extraSel.value || '').trim();
              extraSel.innerHTML = allowed.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
              if (prev && allowed.includes(prev)) {
                extraSel.value = prev;
              } else if (allowed.includes(floor)) {
                extraSel.value = floor;
              } else {
                extraSel.value = allowed[0];
              }
            }
          }
        }

        alreadyPickedMandatory.add(key);
        pendingMandatory.shift();
      });

      rows.forEach(row => {
        const slot = String(row.dataset.slot || '');
        const typeSel = box.querySelector(`select[data-choice-type][data-group="${model.idx}"][data-slot="${slot}"]`);
        const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
        const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
        const pickedName = String(nameSel?.value || '').trim();
        const info = abilityMandatoryInfo(model, pickedName);
        const lockName = Boolean(info?.mandatory);

        if (typeSel) {
          const wasLocked = typeSel.dataset.lockedMandatory === '1';
          if (lockName) {
            typeSel.disabled = true;
            typeSel.dataset.lockedMandatory = '1';
          } else {
            if (wasLocked) typeSel.disabled = false;
            typeSel.dataset.lockedMandatory = '';
          }
          setLockedField(typeSel, lockName);
        }

        if (nameSel) {
          const wasLocked = nameSel.dataset.lockedMandatory === '1';
          if (lockName) {
            nameSel.disabled = true;
            nameSel.dataset.lockedMandatory = '1';
          } else {
            if (wasLocked) nameSel.disabled = false;
            nameSel.dataset.lockedMandatory = '';
          }
          setLockedField(nameSel, lockName);
        }

        if (!extraSel) return;
        const pickedEntry = pickedName ? findEntry(pickedName) : null;
        const fixedTier = pickedEntry ? resolveFixedTierLabel(pickedEntry, String(extraSel.value || '').trim()) : '';
        if (fixedTier) {
          const hasTierOption = Array.from(extraSel.options).some(opt => String(opt.value || '').trim() === fixedTier);
          if (!hasTierOption) {
            extraSel.innerHTML = `<option value="${escapeHtml(fixedTier)}">${escapeHtml(fixedTier)}</option>`;
          }
          extraSel.value = fixedTier;
          extraSel.disabled = true;
          extraSel.dataset.lockedMandatory = '';
          extraSel.dataset.fixedTier = '1';
          setLockedField(extraSel, true);
          return;
        }
        extraSel.dataset.fixedTier = '';
        if (lockName && pickedEntry && entryUsesLevel(pickedEntry) && !isNoLevelEntry(pickedEntry)) {
          const floor = String(info?.floorValue || '').trim();
          if (floor) {
            const currentValues = Array.from(extraSel.options).map(opt => String(opt.value || '').trim()).filter(Boolean);
            let allowed = currentValues.filter(value => levelMeets(value, floor));
            if (!allowed.length) allowed = currentValues;
            if (allowed.length && allowed.length !== currentValues.length) {
              const prev = String(extraSel.value || '').trim();
              extraSel.innerHTML = allowed.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
              if (prev && allowed.includes(prev)) {
                extraSel.value = prev;
              } else if (allowed.includes(floor)) {
                extraSel.value = floor;
              } else {
                extraSel.value = allowed[0];
              }
            } else if (!levelMeets(String(extraSel.value || '').trim(), floor) && allowed.length) {
              extraSel.value = allowed.includes(floor) ? floor : allowed[0];
            }

            const top = allowed[allowed.length - 1] || '';
            const lockLevel = normalizeLevel(top, '') === normalizeLevel(floor, '');
            const wasLocked = extraSel.dataset.lockedMandatory === '1';
            if (lockLevel) {
              extraSel.disabled = true;
              extraSel.dataset.lockedMandatory = '1';
            } else {
              if (wasLocked && extraSel.options.length > 1) extraSel.disabled = false;
              extraSel.dataset.lockedMandatory = '';
            }
            setLockedField(extraSel, lockLevel);
            return;
          }
        }

        const wasLocked = extraSel.dataset.lockedMandatory === '1';
        if (wasLocked && nameSel && String(nameSel.value || '').trim() && extraSel.options.length > 1) {
          extraSel.disabled = false;
        }
        extraSel.dataset.lockedMandatory = '';
        setLockedField(extraSel, false);
      });
    }

    function collectSelectionsByGroup() {
      const byGroup = new Map(models.map(model => [model.idx, []]));
      models.forEach(model => {
        const source = String(model?.source || '').trim();
        if (!model.dynamic) {
          Array.from(box.querySelectorAll(`[data-group="${model.idx}"][data-static-name]`)).forEach(node => {
            const name = String(node.dataset.staticName || '').trim();
            const value = String(node.dataset.staticLevel || '').trim();
            if (!name || !value || value === 'skip') return;
            byGroup.get(model.idx).push({ name, level: value, source });
          });
          Array.from(box.querySelectorAll(`select[data-group="${model.idx}"][data-name]:not([data-dynamic="1"])`)).forEach(sel => {
            const name = String(sel.dataset.name || '').trim();
            const value = String(sel.value || '').trim();
            if (!name || !value || value === 'skip') return;
            byGroup.get(model.idx).push({ name, level: value, source });
          });
          return;
        }

        if (model.progressive) {
          const rows = Array.from(box.querySelectorAll(`.master-row[data-slot-row][data-group="${model.idx}"]`))
            .filter(row => !row.classList.contains('slot-hidden'));
          rows.forEach(row => {
            const slot = String(row.dataset.slot || '');
            const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
            const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
            const name = String(nameSel?.value || '').trim();
            if (!name) return;
            const chosenEntry = findEntry(name);
            const fixedTier = chosenEntry ? resolveFixedTierLabel(chosenEntry, String(extraSel?.value || '').trim()) : '';
            if (fixedTier) {
              byGroup.get(model.idx).push({ name, level: fixedTier, source });
              return;
            }
            if (chosenEntry && entryUsesLevel(chosenEntry) && !isNoLevelEntry(chosenEntry)) {
              byGroup.get(model.idx).push({ name, level: String(extraSel?.value || model.minLevel || 'Novis'), source });
              return;
            }
            const maxCount = chosenEntry ? Math.max(1, getEntryMaxCount(chosenEntry, { list: currentList })) : 1;
            const qtyRaw = String(extraSel?.value || 'x1').trim();
            const qty = Math.max(1, Math.min(maxCount, Number(qtyRaw.replace('x', '')) || 1));
            for (let i = 0; i < qty; i += 1) byGroup.get(model.idx).push({ name, level: 'pick', source });
          });
          return;
        }

        let dynamicRows = Array.from(box.querySelectorAll(`select[data-ability][data-group="${model.idx}"]`));
        if (model.adaptiveSlots) {
          dynamicRows = dynamicRows.filter(sel => !sel.closest('.master-row')?.classList.contains('slot-hidden'));
        }
        dynamicRows.forEach(sel => {
          const slot = String(sel.dataset.slot || '');
          const name = String(sel.value || '').trim();
          if (!name || name === 'skip') return;
          if (model.hasBenefitQty) {
            const qtySel = box.querySelector(`select[data-benefit-qty][data-group="${model.idx}"][data-slot="${slot}"]`);
            const qtyRaw = String(qtySel?.value || 'x1').trim();
            const qty = Math.max(1, Math.min(3, Number(qtyRaw.replace('x', '')) || 1));
            for (let i = 0; i < qty; i += 1) {
              byGroup.get(model.idx).push({ name, level: 'pick', source });
            }
            return;
          }
          if (model.noLevel || isNoLevelGroup(model.group)) {
            byGroup.get(model.idx).push({ name, level: 'pick', source });
            return;
          }
          const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
          byGroup.get(model.idx).push({ name, level: String(lvlSel?.value || model.minLevel || 'Novis'), source });
        });
      });
      return byGroup;
    }

    function desiredRepeatableCounts(selectionsByGroup) {
      const counts = new Map();
      selectionsByGroup.forEach(rows => {
        toArray(rows).forEach(row => {
          const name = String(row?.name || '').trim();
          if (!name) return;
          const item = findEntry(name);
          if (!item || !canStackRequirementEntry(item)) return;
          const key = normalizeKey(name);
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      });
      return counts;
    }

    function collapseExistingTokens(list, repeatableCaps = new Map()) {
      const out = [];
      const nonRepeatIndex = new Map();
      const repeatableSeen = new Map();
      toArray(list).forEach((item, idx) => {
        const name = String(item?.namn || '').trim();
        if (!name) return;
        const key = normalizeKey(name);
        if (!key) return;
        const token = {
          id: `pc:${idx}`,
          entry: item,
          name,
          key,
          level: String(item?.nivå || '').trim() || 'Novis',
          lockedGroup: null
        };
        if (canStackRequirementEntry(item)) {
          const cap = repeatableCaps.has(key) ? Math.max(0, Number(repeatableCaps.get(key)) || 0) : null;
          const used = repeatableSeen.get(key) || 0;
          if (cap !== null && used >= cap) return;
          repeatableSeen.set(key, used + 1);
          out.push(token);
          return;
        }
        const existingIdx = nonRepeatIndex.get(key);
        if (existingIdx === undefined) {
          nonRepeatIndex.set(key, out.length);
          out.push(token);
          return;
        }
        const prev = out[existingIdx];
        if (levelMeets(token.level, prev.level || '')) {
          out[existingIdx] = { ...prev, entry: item, level: token.level };
        }
      });
      return out;
    }

    function dedupeTokensForModel(model, list) {
      const allowRepeat = Boolean(model?.allowRepeat);
      const out = [];
      const seen = new Set();
      toArray(list).forEach(token => {
        const key = String(token?.key || '').trim();
        if (!key) return;
        const repeatable = canStackRequirementEntry(token?.entry);
        if (!allowRepeat || !repeatable) {
          if (seen.has(key)) return;
          seen.add(key);
        }
        out.push(token);
      });
      return out;
    }

    function allocationStates() {
      const selectionsByGroup = collectSelectionsByGroup();
      const repeatableCaps = desiredRepeatableCounts(selectionsByGroup);
      const reservedNames = new Set();
      models.forEach(model => {
        if (!isReservedGroup(model.group)) return;
        model.names.forEach(name => reservedNames.add(normalizeKey(name)));
      });

      const tokens = collapseExistingTokens(currentList, repeatableCaps);
      const existingByKey = new Map();
      tokens.forEach(token => {
        if (!existingByKey.has(token.key)) existingByKey.set(token.key, []);
        existingByKey.get(token.key).push(token);
      });
      models.forEach(model => {
        const rows = toArray(selectionsByGroup.get(model.idx));
        rows.forEach((row, idx) => {
          const entry = findEntry(row.name);
          const name = String(entry?.namn || row.name || '').trim();
          if (!entry || !name) return;
          const key = normalizeKey(name);
          const repeatable = canStackRequirementEntry(entry);
          const existingPool = existingByKey.get(key) || [];
          if (!repeatable && existingPool.length) {
            const preferred = existingPool.find(token => token.lockedGroup === null || token.lockedGroup === model.idx)
              || existingPool[0];
            preferred.lockedGroup = model.idx;
            if (row.level) preferred.level = String(row.level || '').trim() || preferred.level;
            return;
          }
          const unlockedExisting = existingPool.find(token => token.lockedGroup === null);
          if (unlockedExisting) {
            unlockedExisting.lockedGroup = model.idx;
            if (row.level) unlockedExisting.level = String(row.level || '').trim() || unlockedExisting.level;
            return;
          }
          const token = {
            id: `sel:${model.idx}:${idx}:${name}`,
            entry,
            name,
            key,
            level: String(row.level || '').trim() || 'Novis',
            lockedGroup: model.idx
          };
          tokens.push(token);
          if (!existingByKey.has(key)) existingByKey.set(key, []);
          existingByKey.get(key).push(token);
        });
      });

      const states = new Map();
      const consumed = new Set();
      const ordered = models
        .slice()
        .sort((a, b) => {
          const p = groupPriority(a) - groupPriority(b);
          if (p !== 0) return p;
          if (a.group?.tagRule && b.group?.tagRule) {
            const aCount = groupOptionCount(a);
            const bCount = groupOptionCount(b);
            if (aCount !== bCount) return aCount - bCount;
          }
          if (a.minErf !== b.minErf) return b.minErf - a.minErf;
          return a.idx - b.idx;
        });

      ordered.forEach(model => {
        const modelSelectedRows = toArray(selectionsByGroup.get(model.idx)).filter(row => {
          const name = String(row?.name || '').trim();
          const level = String(row?.level || '').trim();
          return Boolean(name && level && level !== 'skip');
        });
        const hasExplicitSelection = modelSelectedRows.length > 0;
        const candidates = dedupeTokensForModel(model, tokens.filter(token => {
          if (consumed.has(token.id)) return false;
          if (hasExplicitSelection) {
            if (token.lockedGroup !== model.idx) return false;
          } else if (token.lockedGroup !== null && token.lockedGroup !== model.idx) {
            return false;
          }
          if (!isReservedGroup(model.group) && reservedNames.has(token.key)) return false;
          return matchesGroupEntry(model.group, token.entry, token.level);
        }));

        const needErf = Math.max(0, Number(model.minErf) || 0);
        const needCount = Math.max(0, Number(model.minCount) || 0);
        const hasErfReq = needErf > 0;
        const hasCountReq = needCount > 0;
        const rows = candidates
          .map(token => ({
            token,
            cost: estimateRequirementErf(token.entry, token.level),
            countCredit: countCreditForEntry(token.entry, model, token.level)
          }))
          .sort((a, b) => {
            const countDiff = (b.countCredit || 0) - (a.countCredit || 0);
            if (countDiff !== 0) return countDiff;
            return (b.cost || 0) - (a.cost || 0);
          });
        const picked = [];
        let selectedErf = 0;
        let selectedCount = 0;
        for (let i = 0; i < rows.length; i += 1) {
          if ((!hasErfReq || selectedErf >= needErf) && (!hasCountReq || selectedCount >= needCount)) break;
          const row = rows[i];
          picked.push(row);
          selectedErf += row.cost || 0;
          selectedCount += row.countCredit || 0;
        }
        picked.forEach(row => consumed.add(row.token.id));
        const metric = hasErfReq && hasCountReq
          ? 'both'
          : (hasErfReq ? 'erf' : (hasCountReq ? 'count' : 'none'));
        states.set(model.idx, {
          ok: (!hasErfReq || selectedErf >= needErf) && (!hasCountReq || selectedCount >= needCount),
          selected: metric === 'count' ? selectedCount : selectedErf,
          required: metric === 'count' ? needCount : needErf,
          metric,
          selected_erf: selectedErf,
          required_erf: needErf,
          selected_count: selectedCount,
          required_count: needCount,
          picked: picked.map(row => row.token)
        });
      });

      models.forEach(model => {
        if (states.has(model.idx)) return;
        const needErf = Math.max(0, Number(model.minErf) || 0);
        const needCount = Math.max(0, Number(model.minCount) || 0);
        const metric = needErf > 0 && needCount > 0
          ? 'both'
          : (needErf > 0 ? 'erf' : (needCount > 0 ? 'count' : 'none'));
        states.set(model.idx, {
          ok: metric === 'none',
          selected: 0,
          required: metric === 'count' ? needCount : needErf,
          metric,
          selected_erf: 0,
          required_erf: needErf,
          selected_count: 0,
          required_count: needCount,
          picked: []
        });
      });

      return { states, selectionsByGroup };
    }

    function collectRowsForPreview() {
      const byGroup = collectSelectionsByGroup();
      const rows = [];
      models.forEach(model => {
        rows.push(...toArray(byGroup.get(model.idx)));
      });
      rows.push(...collectExtraSelections());
      return rows
        .map(row => ({
          name: String(row?.name || '').trim(),
          level: String(row?.level || '').trim() || 'Novis',
          source: String(row?.source || '').trim()
        }))
        .filter(row => row.name && row.level && row.level !== 'skip');
    }

    function projectedInvestmentErf(rows) {
      const list = toArray(currentList);
      if (!rows.length) return 0;
      const grouped = new Map();
      rows.forEach(row => {
        const item = findEntry(row.name);
        if (!item) return;
        const canonical = String(item?.namn || row.name).trim();
        if (!canonical) return;
        const key = normalizeKey(canonical);
        if (!grouped.has(key)) grouped.set(key, { item, key, levels: [] });
        grouped.get(key).levels.push(String(row.level || '').trim() || 'Novis');
      });

      let addedErf = 0;
      grouped.forEach(({ item, key, levels }) => {
        const existingRows = list.filter(row => normalizeKey(row?.namn) === key && !row?.trait);
        const existing = existingRows[0] || null;
        const ritual = isRitualEntry(item);
        const noLevel = isNoLevelEntry(item);
        const repeatable = canStackRequirementEntry(item);

        if (repeatable) {
          const desiredCount = Math.max(0, levels.length);
          const toAdd = Math.max(0, desiredCount - existingRows.length);
          if (toAdd > 0) {
            const unitCost = estimateRequirementErf(item, 'pick');
            addedErf += toAdd * unitCost;
          }
          return;
        }

        const chosenLevel = levels.reduce((last, cur) => {
          const lvl = String(cur || '').trim();
          if (!lvl || lvl === 'pick') return last;
          return normalizeLevel(lvl, 'Novis');
        }, '');
        const levelValue = chosenLevel || 'Novis';
        const nextCost = ritual
          ? estimateRequirementErf(item, 'Novis')
          : (noLevel ? estimateRequirementErf(item, 'pick') : estimateRequirementErf(item, levelValue));
        if (!existing) {
          addedErf += nextCost;
          return;
        }
        const currentCost = estimateRequirementErf(existing, existing?.nivå);
        addedErf += Math.max(0, nextCost - currentCost);
      });

      return Math.max(0, addedErf);
    }

    function updateProgress(states, investmentErf = 0) {
      const total = models.length;
      const done = states.filter(state => state.ok).length;
      const percent = total ? Math.round((done / total) * 100) : 100;
      progress.innerHTML = `
        <div class="master-progress-copy">
          <strong>${done}/${total}</strong> kravgrupper klara · <strong>${Math.max(0, Number(investmentErf) || 0)}</strong> ERF investeras
        </div>
        <div class="master-progress-bar"><span style="width:${percent}%"></span></div>
      `;
    }

    function recalcWithOwnership() {
      let calc = allocationStates();
      ownerByName = makeNameOwnerMap(calc.states);
      const before = selectionSignature();
      models.forEach(model => {
        if (!model.dynamic) return;
        syncDynamicOptions(model.idx);
      });
      const after = selectionSignature();
      if (after !== before) {
        calc = allocationStates();
        ownerByName = makeNameOwnerMap(calc.states);
      }
      return calc.states;
    }

    try {
      models.forEach(model => {
        if (!model.dynamic || !model.adaptiveSlots) return;
        setVisibleSlots(model, 1);
        if (model.progressive) {
          Array.from({ length: model.slotCount || 0 }).forEach((_, slotIdx) => {
            syncProgressiveRow(model, String(slotIdx));
          });
        } else {
          syncDynamicOptions(model.idx);
        }
      });

      const baseline = allocationStates();
      ownerByName = makeNameOwnerMap(baseline.states);
      models.forEach(model => {
        const state = baseline.states.get(model.idx);
        const picked = dedupeTokensForModel(model, toArray(state?.picked));
        if (model.dynamic && model.progressive) {
          const initialVisible = Math.max(
            1,
            Math.min(model.slotCount, (picked.length || 1) + (model.isTagBased ? 1 : 0))
          );
          setVisibleSlots(model, initialVisible);
          let filled = 0;
          picked.slice(0, model.slotCount).forEach((token, slotIdx) => {
            const typeSel = box.querySelector(`select[data-choice-type][data-group="${model.idx}"][data-slot="${slotIdx}"]`);
            const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slotIdx}"]`);
            const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slotIdx}"]`);
            const typeKey = typeKeyForEntry(token?.entry) || model.typeKeys?.[0] || '';
            if (typeSel && typeKey) typeSel.value = typeKey;
            syncProgressiveRow(model, String(slotIdx));
            let assigned = false;
            if (nameSel && token?.name && [...nameSel.options].some(opt => opt.value === token.name)) {
              nameSel.value = token.name;
              assigned = true;
            }
            syncProgressiveRow(model, String(slotIdx));
            if (extraSel) {
              const fixedTier = resolveFixedTierLabel(token?.entry, token?.level);
              if (fixedTier && [...extraSel.options].some(opt => opt.value === fixedTier)) {
                extraSel.value = fixedTier;
              } else if (typeKey === 'ability' || typeKey === 'mystic' || typeKey === 'base_ability') {
                const lvl = normalizeLevel(String(token?.level || model.minLevel || 'Novis'), 'Novis');
                if ([...extraSel.options].some(opt => opt.value === lvl)) extraSel.value = lvl;
              } else {
                extraSel.value = 'x1';
              }
            }
            if (assigned) filled += 1;
          });
          let extraSlot = 0;
          const nextSlot = Math.max(0, filled);
          if (model.isTagBased && nextSlot < model.slotCount) {
            syncProgressiveRow(model, String(nextSlot));
            if (progressiveSlotHasChoices(model, String(nextSlot))) {
              extraSlot = 1;
            }
          }
          const finalVisible = Math.max(
            1,
            Math.min(model.slotCount, filled + extraSlot)
          );
          setVisibleSlots(model, finalVisible);
          syncDynamicOptions(model.idx);
          return;
        }

        if (model.dynamic) {
          const abilitySels = Array.from(box.querySelectorAll(`select[data-ability][data-group="${model.idx}"]`));
          let picks = picked.length
            ? picked.map(token => ({ name: token.name, level: token.level }))
            : defaultPicksForGroup(model.group, currentList, abilitySels.length, { fillFallback: false });
          if (model.hasBenefitQty) {
            const countByName = new Map();
            const canonicalByKey = new Map();
            toArray(model.names).forEach(name => {
              const rawName = String(name || '').trim();
              const key = normalizeKey(rawName);
              if (!rawName || !key) return;
              canonicalByKey.set(key, rawName);
              const mandatory = benefitMandatoryQty(model, rawName);
              if (mandatory <= 0) return;
              const current = countByName.get(key) || 0;
              if (current < mandatory) countByName.set(key, mandatory);
            });
            const compact = [];
            const emitted = new Set();
            toArray(model.names).forEach(name => {
              const rawName = String(name || '').trim();
              const key = normalizeKey(rawName);
              if (!rawName || !key || emitted.has(key)) return;
              const count = countByName.get(key) || 0;
              if (count <= 0) return;
              const max = Math.max(1, benefitMaxQty(model, rawName));
              const qty = Math.max(1, Math.min(max, Number(count) || 1));
              compact.push({ name: rawName, level: 'pick', qty });
              emitted.add(key);
            });
            Array.from(countByName.entries()).forEach(([key, count]) => {
              if (emitted.has(key) || count <= 0) return;
              const name = canonicalByKey.get(key) || key;
              const max = Math.max(1, benefitMaxQty(model, name));
              const qty = Math.max(1, Math.min(max, Number(count) || 1));
              compact.push({ name, level: 'pick', qty });
              emitted.add(key);
            });
            picks = compact;
          } else if (model.erfPlan?.byKey) {
            const mandatoryPicks = [];
            const used = new Set();
            model.names.forEach(name => {
              const rawName = String(name || '').trim();
              const key = normalizeKey(rawName);
              if (!rawName || !key || used.has(key)) return;
              const info = abilityMandatoryInfo(model, rawName);
              if (!info?.mandatory) return;
              const existing = picks.find(row => normalizeKey(row?.name) === key);
              const fallbackLevel = model.noLevel
                ? 'pick'
                : (String(info.floorValue || model.minLevel || 'Novis').trim() || 'Novis');
              mandatoryPicks.push({
                name: rawName,
                level: String(existing?.level || fallbackLevel).trim() || fallbackLevel
              });
              used.add(key);
            });
            if (mandatoryPicks.length) {
              const rest = picks.filter(row => {
                const key = normalizeKey(row?.name);
                return key && !used.has(key);
              });
              picks = mandatoryPicks.concat(rest);
            }
          }
          let assigned = 0;
          abilitySels.forEach((nameSel, slotIdx) => {
            const pick = picks[slotIdx];
            if (!pick?.name) return;
            if (![...nameSel.options].some(opt => opt.value === pick.name)) return;
            nameSel.value = pick.name;
            assigned += 1;
            if (model.hasBenefitQty) {
              syncBenefitQtyControl(model, String(slotIdx));
              const qtySel = box.querySelector(`select[data-benefit-qty][data-group="${model.idx}"][data-slot="${slotIdx}"]`);
              const qtyValue = `x${Math.max(1, Math.min(3, Number(pick.qty) || 1))}`;
              if (qtySel && [...qtySel.options].some(opt => opt.value === qtyValue)) qtySel.value = qtyValue;
              return;
            }
            const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slotIdx}"][data-dynamic="1"]`);
            if (lvlSel) {
              lvlSel.dataset.name = pick.name;
              lvlSel.value = pick.level || model.minLevel;
            }
            syncDynamicLevelControl(model, String(slotIdx));
          });
          if (model.adaptiveSlots) {
            const visible = Math.max(1, Math.min(model.slotCount, assigned + 1));
            setVisibleSlots(model, visible);
          }
          syncDynamicOptions(model.idx);
          if (model.adaptiveSlots) {
            const trailing = String(Math.max(0, visibleSlotCount(model) - 1));
            if (!progressiveSlotHasChoices(model, trailing)) {
              const reduced = Math.max(1, Math.min(model.slotCount, assigned));
              setVisibleSlots(model, reduced);
            }
            syncDynamicOptions(model.idx);
          }
          abilitySels.forEach((_, slotIdx) => {
            syncDynamicLevelControl(model, String(slotIdx));
            syncBenefitQtyControl(model, String(slotIdx));
          });
          return;
        }

        model.names.forEach(name => {
          const ownedLevels = toArray(currentList)
            .filter(item => normalizeKey(item?.namn) === normalizeKey(name))
            .filter(item => matchesGroupEntry(model.group, item, item?.nivå))
            .map(item => String(item?.nivå || '').trim())
            .filter(Boolean);
          const all = Array.from(box.querySelectorAll(`select[data-group="${model.idx}"][data-name]`));
          const sel = all.find(node => String(node.dataset.name || '') === name);
          if (!sel) return;
          if (model.noLevel) {
            const hasPick = picked.some(token => normalizeKey(token?.name) === normalizeKey(name));
            if (hasPick || ownedLevels.length) sel.value = 'pick';
            return;
          }
          const best = picked
            .filter(token => normalizeKey(token?.name) === normalizeKey(name))
            .map(token => String(token?.level || '').trim())
            .filter(Boolean)
            .concat(ownedLevels)
            .sort((a, b) => {
              const order = ['Novis', 'Gesäll', 'Mästare'];
              return order.indexOf(b) - order.indexOf(a);
            })[0];
          if (!best) return;
          sel.value = best;
        });
      });

      setVisibleExtraSlots(extraSlotCount);
      extraNames.forEach((name, slotIdx) => {
        const pickSel = box.querySelector(`select[data-extra-pick][data-slot="${slotIdx}"]`);
        if (!pickSel) return;
        const ownedRows = toArray(currentList).filter(item => normalizeKey(item?.namn) === normalizeKey(name));
        if (!ownedRows.length) {
          pickSel.value = 'skip';
          return;
        }
        const dbItem = findEntry(name) || ownedRows[0];
        if (!dbItem) return;
        if (!entryUsesLevel(dbItem)) {
          if ([...pickSel.options].some(opt => opt.value === 'pick')) pickSel.value = 'pick';
          return;
        }
        const bestLevel = ownedRows
          .map(row => normalizeLevel(row?.nivå, 'Novis'))
          .sort((a, b) => (LEVEL_VALUE[b] || 0) - (LEVEL_VALUE[a] || 0))[0] || 'Novis';
        if ([...pickSel.options].some(opt => opt.value === bestLevel)) {
          pickSel.value = bestLevel;
        } else if ([...pickSel.options].some(opt => opt.value === 'Novis')) {
          pickSel.value = 'Novis';
        }
      });
    } catch {}

    function onControlChange(e){
      const sel = e.currentTarget;
      if (sel?.matches('select[data-choice-type]')) {
        const groupIdx = String(sel.dataset.group || '');
        const slot = String(sel.dataset.slot || '');
        const model = models[Number(groupIdx)];
        if (model?.progressive) {
          syncProgressiveRow(model, slot);
          syncDynamicOptions(groupIdx);
        }
      } else if (sel?.matches('select[data-extra-pick]')) {
        // no-op, handled by check()
      } else if (sel?.matches('select[data-ability]')) {
        const groupIdx = String(sel.dataset.group || '');
        const slot = String(sel.dataset.slot || '');
        const model = models[Number(groupIdx)];
        if (model?.progressive) {
          syncProgressiveRow(model, slot);
          syncDynamicOptions(groupIdx);
        } else {
          const lvlSel = box.querySelector(`select[data-name][data-group="${groupIdx}"][data-slot="${slot}"][data-dynamic="1"]`);
          if (lvlSel) lvlSel.dataset.name = String(sel.value || '').trim();
          if (model) {
            syncDynamicLevelControl(model, slot);
            syncBenefitQtyControl(model, slot);
          }
          syncDynamicOptions(groupIdx);
        }
      }
      check();
    }

    allSels.forEach(sel => sel.addEventListener('change', onControlChange));

    function aggregateOverflowSources(rawList) {
      const byKey = new Map();
      toArray(rawList).forEach(row => {
        const name = String(row?.name || '').trim();
        const usedErf = Math.max(0, Number(row?.usedErf) || 0);
        const appliedErf = Math.max(0, Number(row?.appliedErf ?? row?.usedErf) || 0);
        if (!name || usedErf <= 0) return;
        const key = normalizeKey(name) || name;
        const prev = byKey.get(key) || { name, usedErf: 0, appliedErf: 0 };
        prev.usedErf += usedErf;
        prev.appliedErf += Math.min(appliedErf, usedErf);
        byKey.set(key, prev);
      });
      return Array.from(byKey.values())
        .sort((a, b) => (b.appliedErf - a.appliedErf) || (b.usedErf - a.usedErf) || a.name.localeCompare(b.name, 'sv'));
    }

    function syncOverflowSourceRows(model, sources = []) {
      const card = box.querySelector(`.master-group[data-group-card="${model.idx}"]`);
      const body = card?.querySelector('.master-group-body');
      if (!body) return;
      const oldBlock = body.querySelector(`[data-overflow-block="${model.idx}"]`);
      if (oldBlock) oldBlock.remove();

      const rows = aggregateOverflowSources(sources);
      if (!rows.length) return;

      const block = document.createElement('div');
      block.className = 'master-overflow-block';
      block.dataset.overflowBlock = String(model.idx);
      block.innerHTML = `
        <div class="master-overflow-title">Uppfylls även av:</div>
        <div class="master-overflow-chips">
          ${rows.map(row => {
            const applied = Math.max(0, Number(row?.appliedErf ?? row?.usedErf) || 0);
            return `<span class="master-overflow-chip">${escapeHtml(`${row.name} (${applied} ERF)`)}</span>`;
          }).join('')}
        </div>
      `;
      body.appendChild(block);
    }

    function onAdd(){
      const levels = {};
      const selections = [];
      const storeLevel = (name, value) => {
        const key = String(name || '').trim();
        const val = String(value || '').trim();
        if (!key || !val || val === 'skip') return;
        const existing = levels[key];
        if (!existing) {
          levels[key] = val;
          return;
        }
        if (val === 'pick') {
          return;
        }
        levels[key] = normalizeLevel(val, 'Novis');
      };
      const pushSelection = (name, value) => {
        const key = String(name || '').trim();
        const val = String(value || '').trim();
        if (!key || !val || val === 'skip') return;
        selections.push({ name: key, level: val });
        storeLevel(key, val);
      };

      box.querySelectorAll('[data-static-name]').forEach(node => {
        const name = String(node.dataset.staticName || '').trim();
        const value = String(node.dataset.staticLevel || '').trim();
        pushSelection(name, value);
      });
      box.querySelectorAll('select[data-name]:not([data-dynamic="1"])').forEach(sel => {
        const name = String(sel.dataset.name || '').trim();
        const value = String(sel.value || '').trim();
        pushSelection(name, value);
      });
      box.querySelectorAll('select[data-ability]').forEach(sel => {
        const idx = Number(sel.dataset.group);
        const slot = String(sel.dataset.slot || '');
        const model = models[idx];
        const group = model?.group;
        const name = String(sel.value || '').trim();
        if (!group || !name || name === 'skip') return;
        if (model?.progressive) {
          const extraSel = box.querySelector(`select[data-choice-extra][data-group="${idx}"][data-slot="${slot}"]`);
          const chosenEntry = findEntry(name);
          const fixedTier = chosenEntry ? resolveFixedTierLabel(chosenEntry, String(extraSel?.value || '').trim()) : '';
          if (fixedTier) {
            pushSelection(name, fixedTier);
            return;
          }
          if (chosenEntry && entryUsesLevel(chosenEntry) && !isNoLevelEntry(chosenEntry)) {
            pushSelection(name, String(extraSel?.value || groupMinLevel(group) || 'Novis'));
            return;
          }
          const maxCount = chosenEntry ? Math.max(1, getEntryMaxCount(chosenEntry, { list: currentList })) : 1;
          const qtyRaw = String(extraSel?.value || 'x1').trim();
          const qty = Math.max(1, Math.min(maxCount, Number(qtyRaw.replace('x', '')) || 1));
          for (let i = 0; i < qty; i += 1) pushSelection(name, 'pick');
          return;
        }
        if (model?.hasBenefitQty) {
          const qtySel = box.querySelector(`select[data-benefit-qty][data-group="${idx}"][data-slot="${slot}"]`);
          const qtyRaw = String(qtySel?.value || 'x1').trim();
          const qty = Math.max(1, Math.min(3, Number(qtyRaw.replace('x', '')) || 1));
          for (let i = 0; i < qty; i += 1) pushSelection(name, 'pick');
          return;
        }
        if (model?.noLevel || isNoLevelGroup(group)) {
          pushSelection(name, 'pick');
          return;
        }
        const lvlSel = box.querySelector(`select[data-name][data-group="${idx}"][data-slot="${slot}"][data-dynamic="1"]`);
        pushSelection(name, String(lvlSel?.value || groupMinLevel(group) || 'Novis'));
      });
      collectExtraSelections().forEach(row => {
        pushSelection(row.name, row.level);
      });
      finish({ levels, selections }, 'confirm');
    }

    function onCancel(){ finish(null, 'cancel'); }

    function onOutside(e){
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        finish(null, 'cancel');
      }
    }

    function onKeyDown(e){
      if (e.key !== 'Escape') return;
      e.preventDefault();
      finish(null, 'escape');
    }

    function check(){
      let states = recalcWithOwnership();

      let expanded = false;
      models.forEach(model => {
        if (!model.adaptiveSlots) return;
        const visible = visibleSlotCount(model);
        if (visible >= model.slotCount) return;
        const last = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${Math.max(0, visible - 1)}"]`);
        const hasChoice = String(last?.value || '').trim();
        if (!hasChoice) return;
        const nextSlot = String(visible);
        setVisibleSlots(model, visible + 1);
        syncDynamicOptions(model.idx);
        if (!progressiveSlotHasChoices(model, nextSlot)) {
          setVisibleSlots(model, visible);
          syncDynamicOptions(model.idx);
          return;
        }
        expanded = true;
      });

      if (expanded) {
        states = recalcWithOwnership();
      }

      const compactBefore = selectionSignature();
      let compacted = false;
      models.forEach(model => {
        if (!model.adaptiveSlots) return;
        const rows = Array.from(box.querySelectorAll(`.master-row[data-slot-row][data-group="${model.idx}"]`));
        const visible = visibleSlotCount(model);
        if (!rows.length || visible <= 0) return;
        let lastFilled = -1;
        rows.slice(0, visible).forEach((row, idx) => {
          const slot = String(row.dataset.slot || '');
          const sel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
          const value = String(sel?.value || '').trim();
          if (value && value !== 'skip') lastFilled = idx;
        });
        let target = Math.max(1, Math.min(model.slotCount, lastFilled + 2));
        let applied = visible;
        if (target !== visible) {
          setVisibleSlots(model, target);
          applied = target;
          compacted = true;
        }
        if (applied > 0) {
          const trailingSlot = String(Math.max(0, applied - 1));
          syncDynamicOptions(model.idx);
          if (!progressiveSlotHasChoices(model, trailingSlot)) {
            const reduced = Math.max(1, Math.min(model.slotCount, lastFilled + 1));
            if (reduced !== applied) {
              setVisibleSlots(model, reduced);
              syncDynamicOptions(model.idx);
              compacted = true;
              applied = reduced;
            }
          }
        } else {
          syncDynamicOptions(model.idx);
        }
      });
      if (compacted || compactBefore !== selectionSignature()) {
        states = recalcWithOwnership();
      }

      const defaultStateForModel = (model) => ({
        ok: false,
        selected: 0,
        required: model.minErf > 0 ? model.minErf : model.minCount,
        metric: (model.minErf > 0 && model.minCount > 0) ? 'both' : (model.minErf > 0 ? 'erf' : (model.minCount > 0 ? 'count' : 'none')),
        selected_erf: 0,
        required_erf: model.minErf,
        selected_count: 0,
        required_count: model.minCount
      });

      const sourceIndex = (source, prefix) => {
        const match = String(source || '').trim().match(new RegExp(`^${prefix}\\[(\\d+)\\]$`));
        return match ? (Number(match[1]) || 0) : -1;
      };

      const profileStateForModel = (model, profile, fallback) => {
        const source = String(model?.source || '');
        const base = { ...(fallback || defaultStateForModel(model)) };

        if (source === 'primarformaga') {
          const row = profile?.primary || {};
          const requiredErf = Math.max(0, Number(row?.requiredErf ?? model.minErf) || 0);
          const selectedErf = Math.max(0, Number(row?.selectedErf) || 0);
          return {
            ...base,
            metric: 'erf',
            selected: selectedErf,
            required: requiredErf,
            selected_erf: selectedErf,
            required_erf: requiredErf,
            selected_count: 0,
            required_count: 0,
            ok: Boolean(row?.ok)
          };
        }

        if (source.startsWith('specifikt_val')) {
          const row = toArray(profile?.specifikt_val)[sourceIndex(source, 'specifikt_val')] || {};
          const requiredCount = Math.max(0, Number(row?.requiredCount ?? model.minCount) || 0);
          // row.requiredErf/model.minErf is already the total ERF requirement for this group.
          const requiredErf = Math.max(0, Number(row?.requiredErf ?? model.minErf) || 0);
          const selectedErf = Math.max(0, Number(row?.selectedErf) || 0);
          const selectedCount = Math.max(0, Number(row?.qualifiedCount ?? row?.selectedCount) || 0);
          const metric = requiredCount > 0 ? 'both' : 'erf';
          return {
            ...base,
            metric,
            selected: selectedErf,
            required: requiredErf,
            selected_erf: selectedErf,
            required_erf: requiredErf,
            selected_count: selectedCount,
            required_count: requiredCount,
            ok: Boolean(row?.ok)
          };
        }

        if (source.startsWith('valfri_inom_tagg')) {
          const row = toArray(profile?.valfri_inom_tagg)[sourceIndex(source, 'valfri_inom_tagg')] || {};
          const requiredErf = Math.max(0, Number(row?.requiredErf ?? model.minErf) || 0);
          const selectedErf = Math.max(0, Number(row?.selectedErf) || 0);
          return {
            ...base,
            metric: 'erf',
            selected: selectedErf,
            required: requiredErf,
            selected_erf: selectedErf,
            required_erf: requiredErf,
            selected_count: 0,
            required_count: 0,
            ok: Boolean(row?.ok)
          };
        }

        if (source === 'valfritt') {
          const row = profile?.valfritt || {};
          const requiredErf = Math.max(0, Number(row?.requiredErf ?? model.minErf) || 0);
          const selectedErf = Math.max(0, Number(row?.selectedErf) || 0);
          return {
            ...base,
            metric: 'erf',
            selected: selectedErf,
            required: requiredErf,
            selected_erf: selectedErf,
            required_erf: requiredErf,
            selected_count: 0,
            required_count: 0,
            ok: Boolean(row?.ok)
          };
        }

        if (source === 'specifika_fordelar' || source === 'specifika_nackdelar') {
          const row = source === 'specifika_fordelar'
            ? (profile?.specifika_fordelar || {})
            : (profile?.specifika_nackdelar || {});
          const requiredCount = Math.max(0, Number(row?.required ?? model.minCount) || 0);
          const selectedCount = Math.max(0, Number(row?.count) || 0);
          return {
            ...base,
            metric: 'count',
            selected: selectedCount,
            required: requiredCount,
            selected_erf: 0,
            required_erf: 0,
            selected_count: selectedCount,
            required_count: requiredCount,
            ok: Boolean(row?.ok)
          };
        }

        return base;
      };

      const previewRows = collectRowsForPreview();
      const projectedList = projectRequirementList(currentList, previewRows);
      const reqResult = (window.eliteReq && typeof window.eliteReq.check === 'function')
        ? window.eliteReq.check(entry, projectedList)
        : null;
      const profile = reqResult?.profile || {};

      const stateList = models.map(model => {
        const fallback = states.get(model.idx) || defaultStateForModel(model);
        return profileStateForModel(model, profile, fallback);
      });

      stateList.forEach((state, idx) => {
        const model = models[idx];
        const card = box.querySelector(`.master-group[data-group-card="${model.idx}"]`);
        const stateEl = box.querySelector(`[data-group-state="${model.idx}"]`);
        const countEl = box.querySelector(`[data-group-count="${model.idx}"]`);
        if (card) card.dataset.state = state.ok ? 'ok' : 'missing';
        if (stateEl) {
          stateEl.textContent = state.ok ? 'Klar' : 'Saknas';
          stateEl.classList.toggle('ok', state.ok);
        }
        if (countEl) {
          if (state.metric === 'both') {
            const shownErf = Math.max(0, Number(state.selected_erf) || 0);
            const reqErf = Math.max(0, Number(state.required_erf) || 0);
            const shownCount = Math.max(0, Number(state.selected_count) || 0);
            const reqCount = Math.max(0, Number(state.required_count) || 0);
            countEl.textContent = `${shownErf}/${reqErf} ERF · ${shownCount}/${reqCount}`;
          } else if (state.metric === 'erf') {
            const shown = Math.max(0, Number(state.selected) || 0);
            countEl.textContent = `${shown}/${state.required} ERF`;
          } else if (state.metric === 'count') {
            const shown = Math.max(0, Math.min(state.selected, state.required));
            countEl.textContent = `${shown}/${state.required}`;
          } else {
            countEl.textContent = '0/0';
          }
        }
      });

      models.forEach(model => {
        const source = String(model?.source || '');
        let overflowSources = [];
        if (source.startsWith('specifikt_val')) {
          const row = toArray(profile?.specifikt_val)[sourceIndex(source, 'specifikt_val')] || {};
          overflowSources = toArray(row?.overflowSources);
        } else if (source.startsWith('valfri_inom_tagg')) {
          const row = toArray(profile?.valfri_inom_tagg)[sourceIndex(source, 'valfri_inom_tagg')] || {};
          overflowSources = toArray(row?.overflowSources);
        } else if (source === 'valfritt') {
          const row = profile?.valfritt || {};
          overflowSources = toArray(row?.overflowSources);
        }
        syncOverflowSourceRows(model, overflowSources);
      });

      const allReqsOk = reqResult ? Boolean(reqResult.ok) : stateList.every(state => state.ok);
      const extraSection = box.querySelector('#masterExtraSection');
      if (extraSection) {
        extraSection.hidden = !allReqsOk;
      }

      const investmentErf = projectedInvestmentErf(previewRows);
      updateProgress(stateList, investmentErf);
      add.disabled = !allReqsOk;
    }

    models.forEach(model => {
      if (model.progressive) {
        setVisibleSlots(model, Math.max(1, visibleSlotCount(model)));
        Array.from({ length: model.slotCount || 0 }).forEach((_, slotIdx) => {
          syncProgressiveRow(model, String(slotIdx));
        });
      }
      syncDynamicOptions(model.idx);
      if (!model.dynamic) return;
      Array.from({ length: model.slotCount || 0 }).forEach((_, slotIdx) => {
        syncDynamicLevelControl(model, String(slotIdx));
        syncBenefitQtyControl(model, String(slotIdx));
      });
    });
    setVisibleExtraSlots(extraSlotCount);
    check();
    add.addEventListener('click', onAdd);
    cls.addEventListener('click', onCancel);
    if (!usingManager) pop.addEventListener('click', onOutside);
    if (!usingManager) document.addEventListener('keydown', onKeyDown);
  }

  function allMystic(){
    return toArray(DB).filter(entry =>
      (entry.taggar?.typ || []).includes('Mystisk kraft') &&
      !isEliteSkillEntry(entry));
  }

  function allRitual(){
    return toArray(DB).filter(entry =>
      (entry.taggar?.typ || []).includes('Ritual') &&
      !isEliteSkillEntry(entry));
  }

  function isRitualEntry(entry) {
    return (entry?.taggar?.typ || []).includes('Ritual');
  }

  function isNoLevelEntry(entry) {
    const types = toArray(entry?.taggar?.typ);
    if (types.includes('Ritual') || types.includes('Fördel') || types.includes('Nackdel')) return true;
    return !entryUsesLevel(entry);
  }

  function mergeLevel(current, incoming) {
    const cur = normalizeLevel(current, '');
    const next = normalizeLevel(incoming, 'Novis');
    return levelMeets(cur, next) ? cur : next;
  }

  function autoPickLevels(groups, list){
    const levels = {};
    groups.forEach(group => {
      const pick = defaultPickForGroup(group, list);
      if (!pick.name || !pick.level) return;
      levels[pick.name] = pick.level;
    });
    return levels;
  }

  function selectionRowsFromInput(input, fallbackMap = {}) {
    if (Array.isArray(input)) {
      return input
        .map(row => ({
          name: String(row?.name || row?.namn || '').trim(),
          level: String(row?.level || row?.nivå || '').trim(),
          source: String(row?.source || row?.krav_source || '').trim()
        }))
        .filter(row => row.name && row.level && row.level !== 'skip');
    }
    if (input && Array.isArray(input.selections)) {
      return input.selections
        .map(row => ({
          name: String(row?.name || row?.namn || '').trim(),
          level: String(row?.level || row?.nivå || '').trim(),
          source: String(row?.source || row?.krav_source || '').trim()
        }))
        .filter(row => row.name && row.level && row.level !== 'skip');
    }
    const src = (input && typeof input === 'object')
      ? (input.levels && typeof input.levels === 'object' ? input.levels : input)
      : fallbackMap;
    return Object.keys(src || {}).map(name => ({
      name: String(name || '').trim(),
      level: String(src[name] || '').trim(),
      source: ''
    })).filter(row => row.name && row.level && row.level !== 'skip');
  }

  function canStackRequirementEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    return Math.max(1, Number(getEntryMaxCount(entry)) || 1) > 1;
  }

  function applySelectionRowsToList(baseList, rowsInput) {
    const list = toArray(baseList).map(item => (item && typeof item === 'object' ? { ...item } : item));
    const rows = selectionRowsFromInput(rowsInput, {});
    if (!rows.length) return list;

    const grouped = new Map();
    rows.forEach(row => {
      const item = findEntry(row.name);
      if (!item) return;
      const canonical = String(item?.namn || row.name).trim();
      if (!canonical) return;
      const key = normalizeKey(canonical);
      if (!grouped.has(key)) grouped.set(key, { item, levels: [], source: '' });
      grouped.get(key).levels.push(String(row.level || '').trim() || 'Novis');
      const source = String(row?.source || '').trim();
      if (source && !grouped.get(key).source) grouped.get(key).source = source;
    });

    grouped.forEach(({ item, levels: pickedLevels, source }, key) => {
      const existingRows = list.filter(row => normalizeKey(row?.namn) === key && !row?.trait);
      const existing = existingRows[0] || null;
      const ritual = isRitualEntry(item);
      const noLevel = isNoLevelEntry(item);
      const repeatable = canStackRequirementEntry(item);

      if (repeatable) {
        const maxCount = Math.max(1, Number(getEntryMaxCount(item)) || 1);
        const desiredCount = Math.max(0, Math.min(maxCount, pickedLevels.length));
        if (existingRows.length > desiredCount) {
          let toRemove = existingRows.length - desiredCount;
          for (let i = list.length - 1; i >= 0 && toRemove > 0; i -= 1) {
            const row = list[i];
            if (normalizeKey(row?.namn) !== key || row?.trait) continue;
            list.splice(i, 1);
            toRemove -= 1;
          }
        } else {
          const toAdd = Math.max(0, desiredCount - existingRows.length);
          for (let i = 0; i < toAdd; i += 1) {
            const nextRow = { ...item };
            if (source) nextRow.__elite_source = source;
            list.push(nextRow);
          }
        }
        return;
      }

      const chosenLevel = pickedLevels.reduce((last, cur) => {
        const lvl = String(cur || '').trim();
        if (!lvl || lvl === 'pick') return last;
        return normalizeLevel(lvl, 'Novis');
      }, '');
      const levelValue = chosenLevel || 'Novis';
      const fixedTierLevel = resolveFixedTierLabel(item, levelValue || item?.nivå);

      if (existing) {
        if (source) existing.__elite_source = source;
        if (ritual) {
          existing.nivå = fixedTierLevel || existing.nivå || 'Novis';
        } else if (!noLevel) {
          existing.nivå = normalizeLevel(levelValue, 'Novis');
        }
        return;
      }

      if (ritual) {
        const nextRow = { ...item, nivå: fixedTierLevel || 'Novis' };
        if (source) nextRow.__elite_source = source;
        list.push(nextRow);
      } else if (noLevel) {
        const nextRow = { ...item };
        if (source) nextRow.__elite_source = source;
        list.push(nextRow);
      } else {
        const nextRow = { ...item, nivå: levelValue || 'Novis' };
        if (source) nextRow.__elite_source = source;
        list.push(nextRow);
      }
    });
    return list;
  }

  function projectRequirementList(baseList, selectionInput) {
    return applySelectionRowsToList(baseList, selectionRowsFromInput(selectionInput, {}));
  }

  function checkProjectedRequirements(entry, baseList, selectionInput) {
    const projectedList = projectRequirementList(baseList, selectionInput);
    if (!window.eliteReq || typeof window.eliteReq.check !== 'function') return null;
    return window.eliteReq.check(entry, projectedList);
  }

  async function addReq(entry, levels){
    const activeStore = await ensureActiveStore();
    if(!activeStore) return false;
    const groups = parseGroupRequirements(getEliteRequirementSource(entry));
    const list = storeHelper.getCurrentList(activeStore);
    const fallbackMap = autoPickLevels(groups, list);
    const rows = selectionRowsFromInput(levels, fallbackMap);
    if (!rows.length) return false;
    const nextList = applySelectionRowsToList(list, rows);
    storeHelper.setCurrentList(activeStore, nextList);
    return true;
  }

  async function addElite(entry, opts = {}){
    const activeStore = await ensureActiveStore();
    if(!activeStore) return false;
    const list = storeHelper.getCurrentList(activeStore);
    if(list.some(item => item.namn === entry.namn)) return false;
    const skipDup = !!opts.skipDuplicateConfirm;
    if(list.some(isElityrke) && !skipDup){
      if(!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return false;
    }
    const res = eliteReq.check(entry, list);
    if(!res.ok){
      const msg = 'Krav ej uppfyllda:\n' +
        (res.missing.length ? `Saknar: ${res.missing.join(', ')}\n` : '') +
        (res.primary ? '' : 'Primärförmågekravet uppfylls inte.\n') +
        'Lägga till ändå?';
      if(!(await confirmPopup(msg))) return false;
    }
    list.push({ ...entry });
    storeHelper.setCurrentList(activeStore, list);
    return true;
  }

  async function handle(btn){
    const name = btn.dataset.eliteReq;
    const entry = lookupEntry({ id: name, name });
    if(!entry) return;
    const activeStore = await ensureActiveStore();
    if(!activeStore) return;

    const listPre = storeHelper.getCurrentList(activeStore);
    if(listPre.some(item => item.namn === entry.namn)) return;
    if(listPre.some(isElityrke)){
      if(!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
    }

    const groups = parseGroupRequirements(getEliteRequirementSource(entry));
    if(!groups.length){
      await addReq(entry);
      await addElite(entry, { skipDuplicateConfirm: true });
      syncEliteMutationUi();
      return;
    }

    openPopup(entry, groups, async levels => {
      if(!levels) return;
      await addReq(entry, levels);
      await addElite(entry, { skipDuplicateConfirm: true });
      syncEliteMutationUi();
    });
  }

  function onClick(e){
    if (document.body?.dataset?.role !== 'index') return;
    const button = e.target.closest('button[data-elite-req]');
    if(!button) return;
    handle(button);
  }

  function bindIndexEliteClickHandler() {
    if (typeof document === 'undefined' || !document?.addEventListener) return;
    if (document.body?.dataset?.eliteReqBound === '1') return;
    if (document.body) document.body.dataset.eliteReqBound = '1';
    document.addEventListener('click', onClick);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindIndexEliteClickHandler, { once: true });
    } else {
      bindIndexEliteClickHandler();
    }
  }

  function getValfrittTypeOptions() {
    const buckets = new Map();
    resolveValfrittCandidateNames().forEach(name => {
      const entry = findEntry(name);
      const key = typeKeyForEntry(entry);
      if (!key || key === 'advantage' || key === 'drawback') return;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    return Array.from(buckets.entries())
      .map(([key, count]) => ({ key, label: typeLabelForKey(key), count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'sv'));
  }

  window.eliteAdd = {
    parseNames,
    parseGroupRequirements,
    addReq,
    addElite,
    handle,
    bindIndexEliteClickHandler,
    projectRequirementList,
    checkProjectedRequirements,
    getValfrittTypeOptions
  };
})(window);
