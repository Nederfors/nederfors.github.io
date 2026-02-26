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
    'primartagg',
    'sekundartagg',
    'valfri_inom_tagg',
    'specifika_formagor',
    'specifika_mystiska_krafter',
    'specifika_ritualer',
    'specifika_fordelar',
    'specifika_nackdelar'
  ]);

  function sourceOrderRank(source) {
    const normalized = String(source || '').trim();
    const key = normalized.startsWith('valfri_inom_tagg') ? 'valfri_inom_tagg' : normalized;
    const idx = POPUP_SOURCE_ORDER.indexOf(key);
    return idx >= 0 ? idx : POPUP_SOURCE_ORDER.length;
  }

  function valfriOrderIndex(source) {
    const match = String(source || '').trim().match(/^valfri_inom_tagg\[(\d+)\]$/);
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
      source.startsWith('valfri_inom_tagg') ||
      source === 'primartagg' ||
      source === 'sekundartagg'
    );
  }

  function entryTypes(entry) {
    return toArray(entry?.taggar?.typ).map(type => normalizeType(type)).filter(Boolean);
  }

  function entryHasType(entry, type) {
    const wanted = normalizeType(type);
    if (!wanted) return true;
    return entryTypes(entry).includes(wanted);
  }

  function entryUsesLevel(entry) {
    const types = entryTypes(entry);
    return types.some(type =>
      type === 'Förmåga' ||
      type === 'Mystisk kraft' ||
      type === 'Monstruöst särdrag' ||
      type === 'Särdrag'
    );
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

  function isRepeatableBenefitEntry(entry) {
    if (!entry) return false;
    if (typeof utils.isRepeatableBenefitEntry === 'function') {
      return utils.isRepeatableBenefitEntry(entry);
    }
    const multi = Boolean(entry?.kan_införskaffas_flera_gånger || entry?.taggar?.kan_införskaffas_flera_gånger);
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

  function countFloorForModel(model) {
    const type = normalizeType(model?.group?.type || model?.type || '');
    if (type === 'Nackdel') return 0;
    if (type === 'Fördel') return 5;
    return 10;
  }

  function countCreditForEntry(entry, model, level) {
    if (!entry) return 0;
    if (entryHasType(entry, 'Nackdel')) return 0;
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
    const pushBenefitGroup = (field, type) => {
      const row = normalized[field] || {};
      const names = toArray(row.namn).map(name => String(name || '').trim()).filter(Boolean);
      const min = Math.max(0, Number(row.min_antal) || 0);
      const minErf = Math.max(0, Number(row.min_erf) || 0);
      if (!names.length || (min <= 0 && minErf <= 0)) return;
      const allowRepeat = names.some(name => isRepeatableBenefitName(name));
      const slotByErf = minErf > 0 ? Math.ceil(minErf / 5) : 0;
      out.push({
        source: field,
        type,
        names,
        min_antal: min,
        min_erf: minErf,
        min_niva: 'Novis',
        dynamic_select: allowRepeat || min > names.length || minErf > 0,
        slot_count: Math.max(
          min,
          slotByErf,
          allowRepeat ? Math.max(min, slotByErf) : Math.min(names.length, Math.max(min, slotByErf))
        ),
        allow_repeat: allowRepeat
      });
    };
    pushBenefitGroup('specifika_fordelar', 'Fördel');

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
      if (isElityrke(item)) return;
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
    if (group?.isPrimary) return 'Primärförmåga';
    if (group?.anyMystic) return 'Valfri mystisk kraft';
    if (group?.anyRitual) return 'Valfri ritual';

    const tagLabel = toArray(group?.tagRule?.taggar)
      .map(tag => String(tag || '').trim())
      .filter(Boolean)
      .join(', ');

    const source = String(group?.source || '');
    if (source === 'specifika_formagor') return 'Specifika förmågor';
    if (source === 'specifika_mystiska_krafter') return 'Specifika mystiska krafter';
    if (source === 'specifika_ritualer') return 'Specifika ritualer';
    if (source === 'specifika_fordelar') return 'Specifika fördelar';
    if (source === 'specifika_nackdelar') return 'Specifika nackdelar';
    if (source === 'primartagg') return `Primärt taggkrav: ${tagLabel || 'Tagg'}`;
    if (source === 'sekundartagg') return `Sekundärt taggkrav: ${tagLabel || 'Tagg'}`;
    if (source.startsWith('valfri_inom_tagg')) return `Valfritt inom: ${tagLabel || 'Tagg'}`;
    return `Kravgrupp ${idx + 1}`;
  }

  function groupSummary(group, names, minCount) {
    const minErf = groupMinErf(group);
    const countFloor = countFloorForModel({ group });
    if (minErf > 0) {
      const parts = [`Minst ${minErf} ERF`];
      if (minCount > 0) parts.push(`Minst ${minCount} val (${countFloor}+ ERF/st)`);
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
          <button id="masterCancel" class="char-btn danger">Avbryt</button>
          <button id="masterAdd" class="char-btn">Lägg till</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
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
    if (group?.anyMystic) return allMystic().map(item => item.namn).sort((a, b) => a.localeCompare(b, 'sv'));
    if (group?.anyRitual) return allRitual().map(item => item.namn).sort((a, b) => a.localeCompare(b, 'sv'));
    return [];
  }

  const TAG_TYPE_META = Object.freeze([
    { key: 'ability', label: 'Förmåga' },
    { key: 'mystic', label: 'Mystisk kraft' },
    { key: 'ritual', label: 'Ritual' },
    { key: 'advantage', label: 'Fördel' },
    { key: 'drawback', label: 'Nackdel' }
  ]);

  function typeKeyForEntry(entry) {
    if (!entry) return '';
    if (entryHasType(entry, 'Mystisk kraft')) return 'mystic';
    if (entryHasType(entry, 'Ritual')) return 'ritual';
    if (entryHasType(entry, 'Fördel')) return 'advantage';
    if (entryHasType(entry, 'Nackdel')) return 'drawback';
    if (
      entryHasType(entry, 'Förmåga') ||
      entryHasType(entry, 'Monstruöst särdrag') ||
      entryHasType(entry, 'Särdrag')
    ) return 'ability';
    return '';
  }

  function isReservedGroup(group) {
    const source = String(group?.source || '');
    if (group?.isPrimary) return true;
    return source.startsWith('specifika_');
  }

  function groupPriority(model) {
    const source = String(model?.source || model?.group?.source || '');
    if (model?.group?.isPrimary) return 0;
    if (source.startsWith('specifika_')) return 1;
    if (model?.group?.tagRule) return 2;
    const minErf = Math.max(0, Number(model?.minErf ?? model?.group?.min_erf) || 0);
    if (minErf > 0) return 3;
    return 4;
  }

  function groupOptionCount(model) {
    if (!model) return 9999;
    if (model?.progressive) {
      const counts = TAG_TYPE_META
        .map(meta => toArray(model.typeBuckets?.[meta.key]).length)
        .filter(count => count > 0);
      if (counts.length) return Math.min(...counts);
    }
    return Math.max(1, Number(toArray(model.names).length) || 1);
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
        const repeatable = isRepeatableBenefitEntry(item);
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
      const repeatable = isRepeatableBenefitName(name);
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
        return storeHelper.getCurrentList(store);
      } catch {
        return [];
      }
    })();
    const extraNames = gatherEliteExtraNames(entry);
    const hasExtraChoices = extraNames.length > 0;
    const extraSlotCount = Math.max(1, extraNames.length || 1);
    let ownerByName = new Map();

    const models = groups.map((group, idx) => {
      const source = groupSource(group);
      const names = uniqueNames(candidateNamesForGroup(group));
      const minCount = Math.max(0, Number(group?.min_antal) || 0);
      const minErf = groupMinErf(group);
      const isPrimaryTag = source === 'primartagg' || source === 'sekundartagg';
      const isTagBased = minErf > 0 && isPrimaryTag;
      const repeatableNames = new Set(names.filter(name => isRepeatableBenefitName(name)));
      const allowRepeat = Boolean(group?.allow_repeat) || repeatableNames.size > 0;
      const minSlots = minCount > 0 ? minCount : (minErf > 0 ? 1 : 0);
      const baseSlotCount = Math.max(minSlots, Number(group?.slot_count) || 0, 1);
      const progressive = minErf > 0 && isPrimaryTag;
      const adaptiveSlots = Boolean(usesDynamicPicker(group));
      const rawSlotCount = adaptiveSlots
        ? Math.max(baseSlotCount + 1, minCount + 2, names.length + 1)
        : baseSlotCount;
      const slotCount = allowRepeat
        ? rawSlotCount
        : (names.length ? Math.min(rawSlotCount, names.length) : rawSlotCount);
      const typeBuckets = TAG_TYPE_META.reduce((acc, row) => ({ ...acc, [row.key]: [] }), {});
      names.forEach(name => {
        const entry = findEntry(name);
        const key = typeKeyForEntry(entry);
        if (!key || !typeBuckets[key]) return;
        typeBuckets[key].push(name);
      });
      Object.keys(typeBuckets).forEach(key => {
        typeBuckets[key] = toArray(typeBuckets[key]).sort((a, b) => a.localeCompare(b, 'sv'));
      });
      const typeKeys = TAG_TYPE_META.map(row => row.key);
      const typeOptions = TAG_TYPE_META.map(row => {
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
        allowRepeat,
        repeatableNames,
        progressive,
        typeBuckets,
        typeKeys,
        typeOptions,
        dynamicAllowSkip: slotCount > minCount,
        isTagBased,
        adaptiveSlots,
        hasBenefitQty: source === 'specifika_fordelar',
        noLevel: isNoLevelGroup(group),
        minLevel: groupMinLevel(group),
        dynamic: usesDynamicPicker(group)
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

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const allSels = Array.from(box.querySelectorAll('select'));

    function makeNameOwnerMap(states) {
      const map = new Map();
      models.forEach(model => {
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
          .map(sel => `${String(sel.dataset.slot || '')}:${String(sel.value || '').trim()}`)
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
        if (isRepeatableBenefitEntry(entry)) return true;
        return !blocked.has(name);
      });
    }

    function typeOptionsForSlot(model, slot) {
      return TAG_TYPE_META.map(meta => {
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
      if (typeKey === 'ability' || typeKey === 'mystic') {
        extraOptions = ['Novis', 'Gesäll', 'Mästare'].map(level => ({ value: level, label: level }));
      } else if (typeKey === 'advantage' || typeKey === 'drawback') {
        const maxCount = chosenEntry && isRepeatableBenefitEntry(chosenEntry) ? 3 : 1;
        extraOptions = Array.from({ length: maxCount }).map((_, idx) => ({ value: `x${idx + 1}`, label: `x${idx + 1}` }));
      } else {
        extraOptions = [{ value: 'x1', label: 'x1' }];
      }
      const prevExtra = String(extraSel.value || '').trim();
      extraSel.innerHTML = extraOptions.map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join('');
      if (prevExtra && extraOptions.some(opt => opt.value === prevExtra)) {
        extraSel.value = prevExtra;
      }
      extraSel.disabled = !chosenName || !names.length || extraOptions.length <= 1;
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
    }

    function syncDynamicLevelControl(model, slot) {
      if (model?.progressive) return;
      const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
      if (!lvlSel) return;
      const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
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
        return;
      }
      const entry = findEntry(picked);
      const max = isRepeatableBenefitEntry(entry) ? 3 : 1;
      const prev = String(qtySel.value || '').trim();
      qtySel.innerHTML = Array.from({ length: max }, (_, idx) => {
        const value = `x${idx + 1}`;
        return `<option value="${value}">${value}</option>`;
      }).join('');
      if (prev && [...qtySel.options].some(opt => opt.value === prev)) {
        qtySel.value = prev;
      } else {
        qtySel.value = 'x1';
      }
      qtySel.disabled = max <= 1;
    }

    function collectSelectionsByGroup() {
      const byGroup = new Map(models.map(model => [model.idx, []]));
      models.forEach(model => {
        if (!model.dynamic) {
          Array.from(box.querySelectorAll(`[data-group="${model.idx}"][data-static-name]`)).forEach(node => {
            const name = String(node.dataset.staticName || '').trim();
            const value = String(node.dataset.staticLevel || '').trim();
            if (!name || !value || value === 'skip') return;
            byGroup.get(model.idx).push({ name, level: value });
          });
          Array.from(box.querySelectorAll(`select[data-group="${model.idx}"][data-name]:not([data-dynamic="1"])`)).forEach(sel => {
            const name = String(sel.dataset.name || '').trim();
            const value = String(sel.value || '').trim();
            if (!name || !value || value === 'skip') return;
            byGroup.get(model.idx).push({ name, level: value });
          });
          return;
        }

        if (model.progressive) {
          const rows = Array.from(box.querySelectorAll(`.master-row[data-slot-row][data-group="${model.idx}"]`))
            .filter(row => !row.classList.contains('slot-hidden'));
          rows.forEach(row => {
            const slot = String(row.dataset.slot || '');
            const typeSel = box.querySelector(`select[data-choice-type][data-group="${model.idx}"][data-slot="${slot}"]`);
            const nameSel = box.querySelector(`select[data-ability][data-group="${model.idx}"][data-slot="${slot}"]`);
            const extraSel = box.querySelector(`select[data-choice-extra][data-group="${model.idx}"][data-slot="${slot}"]`);
            const typeKey = String(typeSel?.value || '').trim();
            const name = String(nameSel?.value || '').trim();
            if (!name) return;
            if (typeKey === 'ability' || typeKey === 'mystic') {
              byGroup.get(model.idx).push({ name, level: String(extraSel?.value || model.minLevel || 'Novis') });
              return;
            }
            if (typeKey === 'advantage' || typeKey === 'drawback') {
              const qtyRaw = String(extraSel?.value || 'x1').trim();
              const qty = Math.max(1, Math.min(3, Number(qtyRaw.replace('x', '')) || 1));
              for (let i = 0; i < qty; i += 1) {
                byGroup.get(model.idx).push({ name, level: 'pick' });
              }
              return;
            }
            byGroup.get(model.idx).push({ name, level: 'pick' });
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
              byGroup.get(model.idx).push({ name, level: 'pick' });
            }
            return;
          }
          if (model.noLevel || isNoLevelGroup(model.group)) {
            byGroup.get(model.idx).push({ name, level: 'pick' });
            return;
          }
          const lvlSel = box.querySelector(`select[data-name][data-group="${model.idx}"][data-slot="${slot}"][data-dynamic="1"]`);
          byGroup.get(model.idx).push({ name, level: String(lvlSel?.value || model.minLevel || 'Novis') });
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
          if (!item || !isRepeatableBenefitEntry(item)) return;
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
        if (isRepeatableBenefitEntry(item)) {
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
        const repeatable = isRepeatableBenefitEntry(token?.entry);
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
          const repeatable = isRepeatableBenefitEntry(entry);
          const existingPool = existingByKey.get(key) || [];
          if (!repeatable && existingPool.length) {
            const preferred = existingPool.find(token => token.lockedGroup === null || token.lockedGroup === model.idx)
              || existingPool[0];
            if (preferred.lockedGroup === null) preferred.lockedGroup = model.idx;
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
        const candidates = dedupeTokensForModel(model, tokens.filter(token => {
          if (consumed.has(token.id)) return false;
          if (token.lockedGroup !== null && token.lockedGroup !== model.idx) return false;
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
        const countedNames = new Set();
        for (let i = 0; i < rows.length; i += 1) {
          if ((!hasErfReq || selectedErf >= needErf) && (!hasCountReq || selectedCount >= needCount)) break;
          const row = rows[i];
          picked.push(row);
          selectedErf += row.cost || 0;
          if ((row.countCredit || 0) > 0) {
            const countKey = normalizeKey(row?.token?.name || row?.token?.entry?.namn || '');
            if (!countKey || !countedNames.has(countKey)) {
              if (countKey) countedNames.add(countKey);
              selectedCount += 1;
            }
          }
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

    function updateProgress(states) {
      const total = models.length;
      const done = states.filter(state => state.ok).length;
      const percent = total ? Math.round((done / total) * 100) : 100;
      progress.innerHTML = `
        <div class="master-progress-copy">
          <strong>${done}/${total}</strong> kravgrupper klara
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
              if (typeKey === 'ability' || typeKey === 'mystic') {
                const lvl = String(token?.level || model.minLevel || 'Novis');
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
            picks.forEach(row => {
              const key = String(row?.name || '').trim();
              if (!key) return;
              countByName.set(key, (countByName.get(key) || 0) + 1);
            });
            const compact = [];
            Array.from(countByName.entries()).forEach(([name, count]) => {
              const qty = Math.max(1, Math.min(3, Number(count) || 1));
              compact.push({ name, level: 'pick', qty });
            });
            picks = compact;
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

    function close(){
      pop.classList.remove('open');
      box.innerHTML = '';
      add.removeEventListener('click', onAdd);
      cls.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKeyDown);
      allSels.forEach(sel => sel.removeEventListener('change', onControlChange));
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
          const typeSel = box.querySelector(`select[data-choice-type][data-group="${idx}"][data-slot="${slot}"]`);
          const extraSel = box.querySelector(`select[data-choice-extra][data-group="${idx}"][data-slot="${slot}"]`);
          const typeKey = String(typeSel?.value || '').trim();
          if (typeKey === 'ability' || typeKey === 'mystic') {
            pushSelection(name, String(extraSel?.value || groupMinLevel(group) || 'Novis'));
            return;
          }
          if (typeKey === 'advantage' || typeKey === 'drawback') {
            const qtyRaw = String(extraSel?.value || 'x1').trim();
            const qty = Math.max(1, Math.min(3, Number(qtyRaw.replace('x', '')) || 1));
            for (let i = 0; i < qty; i += 1) pushSelection(name, 'pick');
            return;
          }
          pushSelection(name, 'pick');
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
      close();
      cb({ levels, selections });
    }

    function onCancel(){ close(); cb(null); }

    function onOutside(e){
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        close();
        cb(null);
      }
    }

    function onKeyDown(e){
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
      cb(null);
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

      const stateList = models.map(model => states.get(model.idx) || {
        ok: false,
        selected: 0,
        required: model.minErf > 0 ? model.minErf : model.minCount,
        metric: (model.minErf > 0 && model.minCount > 0) ? 'both' : (model.minErf > 0 ? 'erf' : (model.minCount > 0 ? 'count' : 'none')),
        selected_erf: 0,
        required_erf: model.minErf,
        selected_count: 0,
        required_count: model.minCount
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

      const allReqsOk = stateList.every(state => state.ok);
      const extraSection = box.querySelector('#masterExtraSection');
      if (extraSection) {
        extraSection.hidden = !allReqsOk;
      }

      updateProgress(stateList);
      add.disabled = stateList.some(state => !state.ok);
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
    pop.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKeyDown);
  }

  function allMystic(){
    return toArray(DB).filter(entry =>
      (entry.taggar?.typ || []).includes('Mystisk kraft') &&
      !isEliteSkill(entry));
  }

  function allRitual(){
    return toArray(DB).filter(entry =>
      (entry.taggar?.typ || []).includes('Ritual') &&
      !isEliteSkill(entry));
  }

  function isRitualEntry(entry) {
    return (entry?.taggar?.typ || []).includes('Ritual');
  }

  function isNoLevelEntry(entry) {
    const types = toArray(entry?.taggar?.typ);
    return types.includes('Ritual') || types.includes('Fördel') || types.includes('Nackdel');
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
          level: String(row?.level || row?.nivå || '').trim()
        }))
        .filter(row => row.name && row.level && row.level !== 'skip');
    }
    if (input && Array.isArray(input.selections)) {
      return input.selections
        .map(row => ({
          name: String(row?.name || row?.namn || '').trim(),
          level: String(row?.level || row?.nivå || '').trim()
        }))
        .filter(row => row.name && row.level && row.level !== 'skip');
    }
    const src = (input && typeof input === 'object')
      ? (input.levels && typeof input.levels === 'object' ? input.levels : input)
      : fallbackMap;
    return Object.keys(src || {}).map(name => ({
      name: String(name || '').trim(),
      level: String(src[name] || '').trim()
    })).filter(row => row.name && row.level && row.level !== 'skip');
  }

  function canStackRequirementEntry(entry) {
    return isRepeatableBenefitEntry(entry);
  }

  async function addReq(entry, levels){
    if(!store.current && !(await requireCharacter())) return;
    const groups = parseGroupRequirements(entry?.krav || {});
    const list = storeHelper.getCurrentList(store);
    const fallbackMap = autoPickLevels(groups, list);
    const rows = selectionRowsFromInput(levels, fallbackMap);
    if (!rows.length) return;

    const grouped = new Map();
    rows.forEach(row => {
      const item = findEntry(row.name);
      if (!item) return;
      const canonical = String(item?.namn || row.name).trim();
      if (!canonical) return;
      const key = normalizeKey(canonical);
      if (!grouped.has(key)) grouped.set(key, { item, name: canonical, levels: [] });
      grouped.get(key).levels.push(String(row.level || '').trim() || 'Novis');
    });

    grouped.forEach(({ item, levels: pickedLevels }, key) => {
      const existingRows = list.filter(row => normalizeKey(row?.namn) === key && !row?.trait);
      const existing = existingRows[0] || null;
      const ritual = isRitualEntry(item);
      const noLevel = isNoLevelEntry(item);
      const repeatable = canStackRequirementEntry(item);

      if (repeatable) {
        const selectedCount = pickedLevels.length;
        const desiredCount = Math.max(0, selectedCount);
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
            list.push({ ...item });
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

      if (existing) {
        if (ritual) {
          existing.nivå = existing.nivå || 'Novis';
        } else if (!noLevel) {
          existing.nivå = normalizeLevel(levelValue, 'Novis');
        }
        return;
      }

      if (ritual) {
        list.push({ ...item, nivå: 'Novis' });
      } else if (noLevel) {
        list.push({ ...item });
      } else {
        list.push({ ...item, nivå: levelValue || 'Novis' });
      }
    });

    storeHelper.setCurrentList(store, list);
  }

  async function addElite(entry, opts = {}){
    if(!store.current && !(await requireCharacter())) return;
    const list = storeHelper.getCurrentList(store);
    if(list.some(item => item.namn === entry.namn)) return;
    const skipDup = !!opts.skipDuplicateConfirm;
    if(list.some(isElityrke) && !skipDup){
      if(!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
    }
    const res = eliteReq.check(entry, list);
    if(!res.ok){
      const msg = 'Krav ej uppfyllda:\n' +
        (res.missing.length ? `Saknar: ${res.missing.join(', ')}\n` : '') +
        (res.primary ? '' : 'Primärförmågan uppfyller inte kravet.\n') +
        'Lägga till ändå?';
      if(!(await confirmPopup(msg))) return;
    }
    list.push({ ...entry });
    storeHelper.setCurrentList(store, list);
  }

  async function handle(btn){
    const name = btn.dataset.eliteReq;
    const entry = lookupEntry({ id: name, name });
    if(!entry) return;
    if(!store.current && !(await requireCharacter())) return;

    const listPre = storeHelper.getCurrentList(store);
    if(listPre.some(item => item.namn === entry.namn)) return;
    if(listPre.some(isElityrke)){
      if(!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
    }

    const groups = parseGroupRequirements(entry?.krav || {});
    if(!groups.length){
      await addReq(entry);
      await addElite(entry, { skipDuplicateConfirm: true });
      updateXP();
      if (window.applyCharacterChange) applyCharacterChange();
      return;
    }

    openPopup(entry, groups, levels => {
      if(!levels) return;
      addReq(entry, levels);
      addElite(entry, { skipDuplicateConfirm: true });
      updateXP();
      if (window.applyCharacterChange) applyCharacterChange();
    });
  }

  function onClick(e){
    const button = e.target.closest('button[data-elite-req]');
    if(!button) return;
    handle(button);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if(document.body.dataset.role === 'index'){
      document.getElementById('lista').addEventListener('click', onClick);
    }
  });

  window.eliteAdd = { parseNames, parseGroupRequirements, addReq, addElite };
})(window);
