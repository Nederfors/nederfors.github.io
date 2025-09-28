(function(window){
  const LVL = ['Novis','Gesäll','Mästare'];
  const EFFECT_SECTION_LABELS = new Map([
    ['Fördel', 'Fördelar'],
    ['Nackdel', 'Nackdelar'],
    ['Förmåga', 'Förmågor'],
    ['Mystisk kraft', 'Mystiska krafter'],
    ['Ritual', 'Ritualer'],
    ['Särdrag', 'Särdrag'],
    ['Monstruöst särdrag', 'Monstruösa särdrag'],
    ['Yrke', 'Yrken'],
    ['Elityrke', 'Elityrken'],
    ['Ras', 'Raser'],
    ['Artefakt', 'Artefakter'],
    ['Lägre Artefakt', 'Lägre artefakter'],
    ['Vapen', 'Vapen'],
    ['Rustning', 'Rustningar'],
    ['Sköld', 'Sköldar'],
    ['Elixir', 'Elixir'],
    ['Specialverktyg', 'Specialverktyg'],
    ['Förvaring', 'Förvaring'],
    ['Instrument', 'Instrument'],
    ['Färdmedel', 'Färdmedel'],
    ['Gårdsdjur', 'Gårdsdjur'],
    ['Byggnad', 'Byggnader'],
    ['Anställning', 'Anställningar'],
    ['Tjänst', 'Tjänster'],
    ['Mat', 'Mat'],
    ['Dryck', 'Dryck'],
    ['Kuriositet', 'Kuriositeter'],
    ['Skatt', 'Skatter'],
    ['Diverse', 'Diverse'],
    ['Fälla', 'Fällor'],
    ['Kvalitet', 'Kvaliteter'],
    ['Mystisk kvalitet', 'Mystiska kvaliteter'],
    ['Neutral kvalitet', 'Neutrala kvaliteter'],
    ['Negativ kvalitet', 'Negativa kvaliteter']
  ]);
  const EFFECT_SECTION_ORDER = [
    'Fördelar',
    'Nackdelar',
    'Förmågor',
    'Mystiska krafter',
    'Ritualer',
    'Särdrag',
    'Monstruösa särdrag',
    'Yrken',
    'Elityrken',
    'Raser',
    'Vapen',
    'Rustningar',
    'Sköldar',
    'Artefakter',
    'Lägre artefakter',
    'Elixir',
    'Specialverktyg',
    'Förvaring',
    'Instrument',
    'Färdmedel',
    'Gårdsdjur',
    'Byggnader',
    'Anställningar',
    'Tjänster',
    'Mat',
    'Dryck',
    'Kuriositeter',
    'Skatter',
    'Diverse',
    'Fällor',
    'Kvaliteter',
    'Mystiska kvaliteter',
    'Neutrala kvaliteter',
    'Negativa kvaliteter',
    'Övrigt'
  ];

  const EFFECT_STATE = {
    summaryRenderer: null,
    effectsRenderer: null
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const abilityDisplayName = (entry) => {
    const base = entry?.namn ? String(entry.namn).trim() : 'Okänd post';
    const parts = [];
    if (entry?.trait) parts.push(String(entry.trait).trim());
    const lvl = entry?.nivå || '';
    if (lvl && LVL.includes(lvl)) parts.push(lvl);
    if (!parts.length) return base;
    return `${base} (${parts.join(', ')})`;
  };

  const inventoryDisplayName = (row, entry) => {
    const base = entry?.namn || row?.name || 'Okänt föremål';
    const extras = [];
    if (row?.trait) extras.push(String(row.trait).trim());
    const lvl = row?.nivå || '';
    if (lvl) extras.push(String(lvl).trim());
    const detail = extras.length ? ` (${extras.join(', ')})` : '';
    return `${base}${detail}`;
  };

  const resolveDbEntry = (entry) => {
    if (!entry) return null;
    const hit = typeof window.lookupEntry === 'function' ? window.lookupEntry(entry) : null;
    return hit || null;
  };

  const effectTextsFrom = (source) => {
    if (!source || typeof source !== 'object') return [];
    const raw = source.effekt ?? source.Effekt ?? source.effect ?? source.effects;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map(v => String(v || '').trim())
        .filter(Boolean);
    }
    if (typeof raw === 'string') {
      const txt = raw.trim();
      return txt ? [txt] : [];
    }
    return [];
  };

  const mergeEffectGroups = (baseName, groups) => {
    const seen = new Set();
    const safeBase = baseName || '';
    const out = [];
    (Array.isArray(groups) ? groups : []).forEach(group => {
      if (!group) return;
      const label = String(group.label || safeBase || '').trim();
      const texts = Array.isArray(group.texts)
        ? group.texts
        : effectTextsFrom(group.texts || {});
      texts.forEach(raw => {
        const text = String(raw || '').trim();
        if (!text) return;
        const key = `${label.toLowerCase()}||${text.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ source: label || safeBase, text });
      });
    });
    return out;
  };

  const sectionIndex = (label) => {
    const idx = EFFECT_SECTION_ORDER.indexOf(label);
    return idx === -1 ? EFFECT_SECTION_ORDER.length : idx;
  };

  const getSectionLabel = (types, fallback) => {
    const arr = Array.isArray(types) ? types : [];
    for (const raw of arr) {
      const key = String(raw || '').trim();
      if (!key) continue;
      const label = EFFECT_SECTION_LABELS.get(key);
      if (label) return label;
    }
    return fallback || 'Övrigt';
  };

  const flattenInventoryRows = (rows) => {
    const out = [];
    const walk = (list) => {
      (Array.isArray(list) ? list : []).forEach(row => {
        out.push(row);
        if (Array.isArray(row?.contains) && row.contains.length) walk(row.contains);
      });
    };
    walk(rows);
    return out;
  };

  const extractInventoryEffects = (row, entry) => {
    const baseName = entry?.namn || row?.name || 'Föremål';
    const groups = [];
    const pushGroup = (label, texts) => {
      if (!texts || !texts.length) return;
      groups.push({ label: label || baseName, texts });
    };
    pushGroup(baseName, effectTextsFrom(entry));
    pushGroup(row?.name || baseName, effectTextsFrom(row));

    const removed = Array.isArray(row?.removedKval) ? row.removedKval : [];
    const splitFn = typeof window.splitQuals === 'function' ? window.splitQuals : (() => []);
    const baseQuals = [
      ...((entry?.taggar?.kvalitet ?? []).filter(Boolean)),
      ...splitFn(entry?.kvalitet).filter(Boolean)
    ].filter(q => !removed.includes(q));
    const extraQuals = Array.isArray(row?.kvaliteter) ? row.kvaliteter.filter(Boolean) : [];
    const allQuals = [...baseQuals, ...extraQuals];
    const seenQuals = new Set();
    allQuals.forEach(name => {
      const clean = String(name || '').trim();
      if (!clean || seenQuals.has(clean)) return;
      seenQuals.add(clean);
      const qEntry = resolveDbEntry({ id: clean, name: clean });
      const texts = effectTextsFrom(qEntry || {});
      pushGroup(clean, texts);
    });

    return mergeEffectGroups(baseName, groups);
  };

  const collectEffectsData = () => {
    const sections = new Map();
    const ensureSection = (label) => {
      const key = label || 'Övrigt';
      if (!sections.has(key)) sections.set(key, { label: key, entries: [] });
      return sections.get(key);
    };

    const abilityMap = new Map();
    (storeHelper.getCurrentList(store) || [])
      .filter(entry => !window.isInv?.(entry))
      .forEach(entry => {
        const baseEntry = resolveDbEntry(entry);
        const baseName = baseEntry?.namn || entry?.namn || 'Post';
        const sectionFromEntry = getSectionLabel(entry?.taggar?.typ, null);
        const section = sectionFromEntry && sectionFromEntry !== 'Övrigt'
          ? sectionFromEntry
          : getSectionLabel(baseEntry?.taggar?.typ, 'Förmågor');
        const effects = mergeEffectGroups(baseName, [
          { label: baseEntry?.namn || baseName, texts: effectTextsFrom(baseEntry) },
          { label: entry?.namn || baseName, texts: effectTextsFrom(entry) }
        ]);
        if (!effects.length) return;
        const keyParts = [];
        if (baseEntry?.id !== undefined) keyParts.push(`id:${baseEntry.id}`);
        else if (entry?.id !== undefined) keyParts.push(`id:${entry.id}`);
        else if (entry?.namn) keyParts.push(`name:${entry.namn}`);
        if (entry?.trait) keyParts.push(`trait:${entry.trait}`);
        if (entry?.nivå) keyParts.push(`lvl:${entry.nivå}`);
        if (!keyParts.length) keyParts.push(`name:${baseName}`);
        const key = keyParts.join('|');
        let bucket = abilityMap.get(key);
        if (!bucket) {
          bucket = {
            section,
            label: abilityDisplayName(entry),
            baseName,
            count: 0,
            effects
          };
          abilityMap.set(key, bucket);
        }
        bucket.count += 1;
      });

    abilityMap.forEach(bucket => {
      const section = ensureSection(bucket.section);
      section.entries.push({
        label: bucket.label,
        count: bucket.count,
        baseName: bucket.baseName,
        effects: bucket.effects
      });
    });

    const invRows = flattenInventoryRows(storeHelper.getInventory(store));
    const itemMap = new Map();
    invRows.forEach(row => {
      const entry = (window.invUtil && typeof window.invUtil.getEntry === 'function')
        ? window.invUtil.getEntry(row?.id || row?.name)
        : (resolveDbEntry({ id: row?.id, name: row?.name }) || {});
      const effects = extractInventoryEffects(row, entry || {});
      if (!effects.length) return;
      const section = getSectionLabel(entry?.taggar?.typ, 'Inventarie');
      const qty = Math.max(1, Number(row?.qty) || 1);
      const keyParts = [
        entry?.id !== undefined ? `id:${entry.id}` : `name:${entry?.namn || row?.name || ''}`,
        `trait:${row?.trait || ''}`,
        `lvl:${row?.nivå || ''}`,
        `effects:${effects.map(e => `${e.source}|${e.text}`).sort().join('||')}`
      ];
      const key = keyParts.join('|');
      let bucket = itemMap.get(key);
      if (!bucket) {
        bucket = {
          section,
          label: inventoryDisplayName(row, entry),
          baseName: entry?.namn || row?.name || '',
          count: 0,
          effects
        };
        itemMap.set(key, bucket);
      }
      bucket.count += qty;
    });

    itemMap.forEach(bucket => {
      const section = ensureSection(bucket.section);
      section.entries.push({
        label: bucket.label,
        count: bucket.count,
        baseName: bucket.baseName,
        effects: bucket.effects
      });
    });

    const result = [...sections.values()]
      .map(section => ({
        ...section,
        entries: section.entries.slice().sort((a, b) => a.label.localeCompare(b.label, 'sv'))
      }))
      .filter(section => section.entries.length)
      .sort((a, b) => sectionIndex(a.label) - sectionIndex(b.label) || a.label.localeCompare(b.label, 'sv'));

    return result;
  };

  const renderEffectsHtml = () => {
    const sections = collectEffectsData();
    if (!sections.length) {
      return '<p>Inga effekter att visa för den här rollpersonen.</p>';
    }
    return sections.map(section => {
      const rows = section.entries.map(entry => {
        const countTxt = entry.count > 1 ? ` <span class="count-badge">×${entry.count}</span>` : '';
        const base = entry.baseName || '';
        const lines = entry.effects.map(effect => {
          const source = String(effect.source || '').trim();
          const needsLabel = source && source !== base;
          const srcHtml = needsLabel ? `<span class="effect-source">${escapeHtml(source)}:</span> ` : '';
          const textHtml = escapeHtml(effect.text).replace(/\n/g, '<br>');
          return `<div class="effect-line">${srcHtml}<span class="effect-text">${textHtml}</span></div>`;
        }).join('');
        const title = `<strong class="effect-label">${escapeHtml(entry.label)}${countTxt}</strong>`;
        return `<li class="effect-entry">${title}${lines ? `<div class="effect-lines">${lines}</div>` : ''}</li>`;
      }).join('');
      return `<section class="summary-section"><h3>${escapeHtml(section.label)}</h3><ul>${rows}</ul></section>`;
    }).join('');
  };

  const dedupeList = (items) => {
    const seen = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      let text = '';
      let count = 1;
      let entryRef = item && typeof item === 'object' ? item.entry : undefined;
      let entryType = item && typeof item === 'object' ? item.entryType : undefined;
      if (typeof item === 'string') {
        text = item;
      } else if (item && typeof item === 'object') {
        if (item.label !== undefined) text = item.label;
        else if (item.text !== undefined) text = item.text;
        else if (item.display !== undefined) text = item.display;
        else if (item.value !== undefined) text = item.value;
        const parsed = Number(item.count ?? item.total ?? 1);
        if (Number.isFinite(parsed) && parsed > 0) count = parsed;
      }
      text = String(text || '').trim();
      if (!text) return;
      const key = text.toLocaleLowerCase('sv');
      if (seen.has(key)) {
        const existing = seen.get(key);
        existing.count += count;
        if (!existing.entry && entryRef) existing.entry = entryRef;
        if (!existing.entryType && entryType) existing.entryType = entryType;
      } else {
        seen.set(key, { text, count, entry: entryRef, entryType });
      }
    });
    return Array.from(seen.values());
  };

  const createListRow = (label, entries, options = {}) => {
    const { max = 5, showCount = true, countMode = 'unique' } = options;
    const clean = dedupeList(entries);
    if (!clean.length) return null;
    const totalCount = clean.reduce((sum, item) => sum + (item.count || 1), 0);
    const headerCount = countMode === 'total' ? totalCount : clean.length;
    const header = showCount && headerCount > 1 ? `${label} (${headerCount})` : label;
    const slice = clean.slice(0, max);
    const values = slice.map(item => ({
      text: item.text,
      entry: item.entry,
      entryType: item.entryType,
      entryName: item.entry?.namn || '',
      entryTrait: item.entry?.trait || '',
      entryId: item.entry?.id || '',
      entryLevel: item.entry?.nivå || ''
    }));
    const extra = Math.max(0, clean.length - slice.length);
    return { label: header, values, extra };
  };

  const gatherEntries = (types, options = {}) => {
    const wanted = Array.isArray(types) ? types : [types];
    const { annotateMultiples = false, multipleThreshold = 2 } = options;
    const counts = new Map();
    (storeHelper.getCurrentList(store) || []).forEach(entry => {
      const entryTypes = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      if (!wanted.some(type => entryTypes.includes(type))) return;
      const display = abilityDisplayName(entry);
      if (!display) return;
      const key = display.toLocaleLowerCase('sv');
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          label: display,
          count: 1,
          entry,
          entryType: entryTypes[0] || ''
        });
      }
    });
    const entriesOut = Array.from(counts.values());
    entriesOut.sort((a, b) => a.label.localeCompare(b.label, 'sv'));
    return entriesOut.map(entry => {
      const display = (annotateMultiples && entry.count >= multipleThreshold)
        ? `${entry.label} ×${entry.count}`
        : entry.label;
      return {
        label: display,
        count: entry.count,
        entry: entry.entry,
        entryType: entry.entryType
      };
    });
  };

  const renderSummaryHtml = () => {
    const list = storeHelper.getCurrentList(store) || [];
    const inv = storeHelper.getInventory(store) || [];
    const traits = storeHelper.getTraits(store) || {};
    const effects = storeHelper.getArtifactEffects(store) || {};
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(inv) : {};
    const formatNumber = (value, options = {}) => {
      const { decimals, fallback = '–' } = options;
      if (value === null || value === undefined) return fallback;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) return fallback;
        if (typeof decimals === 'number') {
          return value.toFixed(decimals);
        }
        if (Number.isInteger(value)) {
          return String(value);
        }
        return value.toFixed(2);
      }
      return String(value);
    };
    const KEYS = ['Diskret','Kvick','Listig','Stark','Träffsäker','Vaksam','Viljestark','Övertygande'];
    const vals = {};
    KEYS.forEach(k=>{ vals[k] = (traits[k]||0) + (bonus[k]||0) + (maskBonus[k]||0); });

    const valStark = vals['Stark'];
    const valWill = vals['Viljestark'];
    const strongGiftLevel = storeHelper.abilityLevel(list, 'Stark gåva');
    const strongGift = strongGiftLevel >= 1;
    const hasSjalastark = list.some(p=>p.namn==='Själastark');
    const resistCount = list.filter(p=>p.namn==='Motståndskraft').length;
    const sensCount = list.filter(p=>p.namn==='Korruptionskänslig').length;
    const permBase = storeHelper.calcPermanentCorruption(list, effects);
    const hasEarth = list.some(p=>p.namn==='Jordnära');
    const baseMax = strongGift ? valWill + 5 : valWill;
    const threshBase = strongGift ? valWill : Math.ceil(valWill / 2);
    const maxCor = baseMax + (hasSjalastark ? 1 : 0);
    let thresh = threshBase + resistCount - sensCount;
    const darkPerm = storeHelper.calcDarkPastPermanentCorruption(list, thresh);
    let perm = hasEarth ? (permBase % 2) : permBase;
    perm += darkPerm;
    const effectsWithDark = { ...effects, corruption: (effects.corruption || 0) + darkPerm };

    const hasHardnackad = list.some(p=>p.namn==='Hårdnackad');
    const hasKraftprov = list.some(p=>p.namn==='Kraftprov');
    const capacity = storeHelper.calcCarryCapacity(valStark, list);
    const hardy = hasHardnackad ? 1 : 0;
    const talBase = hasKraftprov ? valStark + 5 : Math.max(10, valStark);
    const tal = talBase + hardy;
    const pain = storeHelper.calcPainThreshold(valStark, list, effectsWithDark);

    const defTrait = window.getDefenseTraitName ? getDefenseTraitName(list) : 'Kvick';
    const kvickForDef = vals[defTrait];
    const defenseList = window.calcDefense ? calcDefense(kvickForDef) : [];
    const defenseEntries = (Array.isArray(defenseList) ? defenseList : [])
      .map(def => {
        if (!def || typeof def !== 'object') return null;
        const name = typeof def.name === 'string' ? def.name.trim() : '';
        const value = def.value;
        return { name, value };
      })
      .filter(entry => entry && (entry.name || (typeof entry.value === 'number' && Number.isFinite(entry.value))));
    const primaryDefense = defenseEntries.reduce((max, entry) => {
      const val = typeof entry.value === 'number' ? entry.value : Number(entry.value);
      if (!Number.isFinite(val)) return max;
      return Math.max(max, val);
    }, Number.NEGATIVE_INFINITY);
    const defenseDisplayValue = Number.isFinite(primaryDefense) && primaryDefense > Number.NEGATIVE_INFINITY
      ? formatNumber(primaryDefense)
      : formatNumber(typeof kvickForDef === 'number' ? kvickForDef : null);

    const cond = [];
    if(storeHelper.abilityLevel(list,'Fint') >= 1){
      cond.push('Diskret som träffsäker för kort eller precist vapen i närstrid');
    }
    if(storeHelper.abilityLevel(list,'Lönnstöt') >= 1){
      cond.push('Diskret som träffsäker vid attacker med Övertag');
    }
    if(storeHelper.abilityLevel(list,'Taktiker') >= 3){
      cond.push('Listig som träffsäker för allt utom tunga vapen');
    }
    const sjatte = Math.max(
      storeHelper.abilityLevel(list,'Sjätte Sinne'),
      storeHelper.abilityLevel(list,'Sjätte sinne')
    );
    if(sjatte >= 3){
      cond.push('Vaksam som träffsäker');
    } else if(sjatte >= 1){
      cond.push('Vaksam som träffsäker för avståndsattacker');
    }
    if(storeHelper.abilityLevel(list,'Järnnäve') >= 1){
      cond.push('Stark som träffsäker i närstrid');
    }
    if(storeHelper.abilityLevel(list,'Dominera') >= 1){
      cond.push('Övertygande som träffsäker i närstrid');
    }
    if(storeHelper.abilityLevel(list,'Ledare') >= 1){
      cond.push('Övertygande istället för Viljestark vid mystiska förmågor och ritualer');
    }
    if(!cond.length) cond.push('Inga särskilda ersättningar');

    const baseXP = storeHelper.getBaseXP(store);
    const usedXP = storeHelper.calcUsedXP(list, effects);
    const totalXP = storeHelper.calcTotalXP(baseXP, list);
    const freeXP = totalXP - usedXP;
    const totalXPText = formatNumber(totalXP);
    const usedXPText = formatNumber(usedXP);
    const freeXPText = formatNumber(freeXP);

    const totalMoney = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));
    const moneyToOFn = typeof window.moneyToO === 'function' ? window.moneyToO : null;
    const oToMoneyFn = typeof window.oToMoney === 'function' ? window.oToMoney : null;
    const invUtil = window.invUtil || {};
    const moneyToString = (money) => `${money.daler}D ${money.skilling}S ${money['örtegar']}Ö`;
    let unusedText = moneyToString(totalMoney);
    let unusedNegative = false;

    if (moneyToOFn && oToMoneyFn && typeof invUtil.calcRowCost === 'function') {
      const LEVEL_IDX = { '': 0, Novis: 1, 'Gesäll': 2, 'Mästare': 3 };
      const partyForge = LEVEL_IDX[storeHelper.getPartySmith(store) || ''] || 0;
      const skillForge = storeHelper.abilityLevel(list, 'Smideskonst');
      const forgeLevel = Math.max(partyForge, skillForge);
      const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
      const skillAlc = storeHelper.abilityLevel(list, 'Alkemist');
      const alcLevel = Math.max(partyAlc, skillAlc);
      const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
      const skillArt = storeHelper.abilityLevel(list, 'Artefaktmakande');
      const artLevel = Math.max(partyArt, skillArt);

      const calcSpentO = (rows) => {
        let sum = 0;
        (Array.isArray(rows) ? rows : []).forEach(row => {
          if (!row || typeof row !== 'object') return;
          const rowCost = invUtil.calcRowCost(row, forgeLevel, alcLevel, artLevel);
          sum += moneyToOFn(rowCost || {});
          if (Array.isArray(row.contains) && row.contains.length) {
            sum += calcSpentO(row.contains);
          }
        });
        return sum;
      };

      const totalCashO = moneyToOFn(totalMoney);
      const spentO = calcSpentO(inv);
      const diffO = totalCashO - spentO;
      const diff = oToMoneyFn(Math.abs(diffO));
      unusedText = `${diffO < 0 ? '-' : ''}${diff.d}D ${diff.s}S ${diff.o}Ö`;
      unusedNegative = diffO < 0;
    }

    if (!unusedNegative) {
      unusedNegative = /^\s*-/.test(unusedText);
    }

    const summarySections = [];

    summarySections.push({
      title: 'Karaktärsdrag',
      items: KEYS.map(key => ({
        label: key,
        value: formatNumber(vals[key] || 0)
      })),
      layout: 'grid'
    });

    summarySections.push({
      title: 'Erfarenhet',
      layout: 'grid',
      items: [
        { label: 'Total XP', value: totalXPText },
        { label: 'Använt XP', value: usedXPText },
        { label: 'XP kvar', value: freeXPText, valueClass: freeXP < 0 ? 'neg' : '' }
      ]
    });

    summarySections.push({
      title: 'Försvar',
      layout: 'grid',
      items: [
        { label: 'Försvar', value: defenseDisplayValue },
        { label: 'Försvarstärning', value: defTrait }
      ]
    });

    summarySections.push({
      title: 'Hälsa',
      items: [
        { label: 'Tålighet', value: formatNumber(tal) },
        { label: 'Smärtgräns', value: formatNumber(pain) },
        { label: 'Bärkapacitet', value: formatNumber(capacity, { decimals: 2 }) }
      ]
    });

    summarySections.push({
      title: 'Korruption',
      items: [
        { label: 'Maximal korruption', value: formatNumber(maxCor) },
        { label: 'Permanent korruption', value: formatNumber(perm) },
        { label: 'Korruptionströskel', value: formatNumber(thresh) }
      ]
    });

    summarySections.push({
      title: 'Ekonomi',
      items: [
        { label: 'Totalt innehav', value: moneyToString(totalMoney) },
        { label: 'Oanvänt kapital', value: unusedText, valueClass: unusedNegative ? 'neg' : '' }
      ]
    });

    const favorSections = [
      createListRow('Fördelar', gatherEntries('Fördel'), { max: Infinity }),
      createListRow('Nackdelar', gatherEntries('Nackdel'), { max: Infinity }),
      createListRow('Mystiska krafter', gatherEntries('Mystisk kraft'), { max: Infinity }),
      createListRow('Ritualer', gatherEntries('Ritual'), { max: Infinity }),
      createListRow('Artefakter', gatherEntries('Artefakt'), { max: Infinity }),
      createListRow(
        'Viktiga färdigheter',
        gatherEntries(['Yrke', 'Elityrke', 'Ras'], { annotateMultiples: true }),
        { max: Infinity }
      )
    ].filter(Boolean);

    if (favorSections.length) {
      summarySections.push({
        title: 'Snabböversikt',
        layout: 'stack',
        items: favorSections
      });
    }

    summarySections.push({
      title: 'Träffsäkerhet',
      layout: 'block',
      items: cond.map(text => ({ text }))
    });

    const sectionsHtml = summarySections.map(section => {
      const listClasses = ['summary-list', 'summary-pairs'];
      if (section.layout) listClasses.push(`layout-${section.layout}`);
      const showColon = section.layout !== 'grid';
      const items = (section.items || []).map(row => {
        if (row.text) {
          return `<li>${escapeHtml(row.text)}</li>`;
        }
        if (row.values) {
          const labelText = row.label ? `${row.label}${showColon ? ':' : ''}` : '';
          const chips = row.values
            .map(val => {
              const text = val?.text ?? '';
              if (!text) return '';
              const attrs = [];
              if (val.entryId) attrs.push(`data-entry-id="${escapeAttr(val.entryId)}"`);
              if (val.entryName) attrs.push(`data-entry-name="${escapeAttr(val.entryName)}"`);
              if (val.entryTrait) attrs.push(`data-entry-trait="${escapeAttr(val.entryTrait)}"`);
              if (val.entryLevel) attrs.push(`data-entry-level="${escapeAttr(val.entryLevel)}"`);
              if (val.entryType) attrs.push(`data-entry-type="${escapeAttr(val.entryType)}"`);
              return `<button type="button" class="summary-chip summary-chip-btn" ${attrs.join(' ')}>${escapeHtml(text)}</button>`;
            })
            .filter(Boolean)
            .join('');
          const extraChip = row.extra > 0
            ? `<span class="summary-chip summary-chip-more">+${row.extra} fler</span>`
            : '';
          return `<li><span class="summary-key">${escapeHtml(labelText)}</span><span class="summary-values">${chips}${extraChip}</span></li>`;
        }
        const classNames = ['summary-value'];
        if (row.valueClass) {
          row.valueClass.split(/\s+/).filter(Boolean).forEach(cls => classNames.push(cls));
        }
        const labelText = row.label ? `${row.label}${showColon ? ':' : ''}` : '';
        const valueText = row.value === null || row.value === undefined ? '–' : String(row.value);
        return `<li><span class="summary-key">${escapeHtml(labelText)}</span><span class="${classNames.join(' ')}">${escapeHtml(valueText)}</span></li>`;
      }).join('');
      return `<section class="summary-section"><h3>${escapeHtml(section.title)}</h3><ul class="${listClasses.join(' ')}">${items}</ul></section>`;
    }).join('');

    return sectionsHtml;
  };

  const escapeAttr = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

  const buildInfoTags = (entry, baseEntry, xpTag) => {
    const tags = [];
    if (xpTag) tags.push(xpTag);
    const typeSet = new Set([
      ...(baseEntry?.taggar?.typ || []),
      ...(entry?.taggar?.typ || [])
    ].filter(Boolean));
    typeSet.forEach(t => {
      tags.push(`<span class="tag filter-tag" data-section="typ" data-val="${escapeAttr(t)}">${escapeHtml(t)}</span>`);
    });
    const arkBase = explodeTags(baseEntry?.taggar?.ark_trad);
    const arkEntry = explodeTags(entry?.taggar?.ark_trad);
    const arkSet = new Set([...arkBase, ...arkEntry].filter(Boolean));
    arkSet.forEach(t => {
      if (t === 'Traditionslös') return;
      tags.push(`<span class="tag filter-tag" data-section="ark" data-val="${escapeAttr(t)}">${escapeHtml(t)}</span>`);
    });
    const testSet = new Set([
      ...(baseEntry?.taggar?.test || []),
      ...(entry?.taggar?.test || [])
    ].filter(Boolean));
    testSet.forEach(t => {
      tags.push(`<span class="tag filter-tag" data-section="test" data-val="${escapeAttr(t)}">${escapeHtml(t)}</span>`);
    });
    return tags.join(' ');
  };

  const openSummaryEntryInfo = (entry, fallbackName = '') => {
    if (!entry) return;
    const list = storeHelper.getCurrentList(store) || [];
    const baseEntry = resolveDbEntry(entry) || resolveDbEntry({ id: entry.id, name: entry.namn }) || entry;
    const merged = { ...baseEntry, ...entry };

    const infoMeta = [];
    if (merged.trait) {
      const label = merged.namn === 'Monsterlärd' ? 'Specialisering' : 'Karaktärsdrag';
      infoMeta.push({ label, value: escapeHtml(merged.trait) });
    }
    if (merged.race) {
      infoMeta.push({ label: 'Ras', value: escapeHtml(merged.race) });
    }

    const xpRaw = storeHelper.calcEntryXP(entry, list);
    let xpText = xpRaw;
    if (window.isElityrke?.(entry) && window.eliteReq?.minXP) {
      xpText = `Minst ${window.eliteReq.minXP(entry, list)}`;
    } else if (typeof xpRaw === 'number') {
      xpText = xpRaw < 0 ? `+${-xpRaw}` : xpRaw;
    } else if (entry.xp !== undefined && entry.xp !== null) {
      xpText = entry.xp;
    }
    const xpTag = xpText !== undefined && xpText !== null && xpText !== ''
      ? `<span class="tag xp-cost">Erf: ${escapeHtml(String(xpText))}</span>`
      : '';

    const bodyHtml = window.abilityHtml ? abilityHtml(merged, entry.nivå) : escapeHtml(merged.beskrivning || '');
    const tagsHtml = buildInfoTags(entry, baseEntry, xpTag);
    const html = buildInfoPanelHtml({
      tagsHtml,
      bodyHtml,
      meta: infoMeta
    });
    const title = abilityDisplayName(entry) || fallbackName || entry.namn || baseEntry?.namn || '';
    window.yrkePanel?.open(title, html);
  };

  const renderSummaryInto = (container) => {
    if (!container) return;
    container.innerHTML = renderSummaryHtml();
  };

  const renderEffectsInto = (container) => {
    if (!container) return;
    container.innerHTML = renderEffectsHtml();
  };

  const initSummaryPage = () => {
    const container = document.getElementById('summaryContent');
    if (!container) return;
    const render = () => renderSummaryInto(container);
    EFFECT_STATE.summaryRenderer = render;
    window.refreshSummaryPage = () => EFFECT_STATE.summaryRenderer && EFFECT_STATE.summaryRenderer();
    render();
    container.addEventListener('click', e => {
      const btn = e.target.closest('.summary-chip-btn');
      if (!btn) return;
      const data = btn.dataset || {};
      const list = storeHelper.getCurrentList(store) || [];
      let match = null;
      const id = data.entryId ? String(data.entryId) : '';
      if (id) match = list.find(item => String(item.id) === id);
      if (!match) {
        const name = data.entryName ? String(data.entryName) : '';
        const trait = data.entryTrait ? String(data.entryTrait) : '';
        const level = data.entryLevel ? String(data.entryLevel) : '';
        match = list.find(item => {
          if (name && String(item.namn) !== name) return false;
          if (trait && String(item.trait || '') !== trait) return false;
          if (level && String(item.nivå || '') !== level) return false;
          return true;
        });
        if (!match && (name || id)) {
          const fallback = resolveDbEntry({ id: id || undefined, name }) || null;
          if (fallback) {
            match = { ...fallback };
            if (trait) match.trait = trait;
            if (level) match.nivå = level;
          }
        }
      }
      openSummaryEntryInfo(match, data.entryName || '');
    });
  };

  const initEffectsPage = () => {
    const container = document.getElementById('effectsContent');
    if (!container) return;
    const render = () => renderEffectsInto(container);
    EFFECT_STATE.effectsRenderer = render;
    window.refreshEffectsPanel = () => EFFECT_STATE.effectsRenderer && EFFECT_STATE.effectsRenderer();
    render();
  };

  // Fallback no-ops so callers can safely invoke even innan init
  if (typeof window.refreshSummaryPage !== 'function') {
    window.refreshSummaryPage = () => {};
  }
  if (typeof window.refreshEffectsPanel !== 'function') {
    window.refreshEffectsPanel = () => {};
  }

  window.summaryEffects = {
    renderSummaryInto,
    renderEffectsInto,
    initSummaryPage,
    initEffectsPage,
    collectEffectsData,
    renderSummaryHtml,
    renderEffectsHtml
  };
})(window);
