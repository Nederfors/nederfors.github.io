(function(window){
  function calcDefense(kvick){
    const inv = storeHelper.getInventory(store);
    const nameMap = invUtil.makeNameMap(inv);
    const list = storeHelper.getCurrentList(store);
    const rustLvl = storeHelper.abilityLevel(list, 'Rustmästare');

    const PEN = { Novis: 2, 'Gesäll': 3, 'Mästare': 4 };
    const robustPenalty = list
      .filter(x => x.namn === 'Robust')
      .reduce((sum, x) => sum + (PEN[x.nivå] || 0), 0);
    const hamRobustName = storeHelper.HAMNSKIFTE_NAMES['Robust'];
    const hamRobustPenalty = list
      .filter(x => x.namn === hamRobustName)
      .reduce((sum, x) => sum + (PEN[x.nivå] || 0), 0);

    let hasBalancedWeapon = false;
    let hasLongWeapon = false;
    let hasLongStaff = false;
    let hasShield = false;
    let weaponCount = 0;
    inv.forEach(row => {
      const entry = invUtil.getEntry(row.id || row.name);
      if (!entry) return;
      const types = entry.taggar?.typ || [];
      if (!types.includes('Vapen') && !types.includes('Sköld')) return;
      weaponCount += 1;
      if (types.includes('Sköld')) hasShield = true;
      const tagger = entry.taggar || {};
      const baseQ = [
        ...(tagger.kvalitet || []),
        ...splitQuals(entry.kvalitet)
      ];
      const removed = row.removedKval || [];
      const allQ = [
        ...baseQ.filter(q => !removed.includes(q)),
        ...(row.kvaliteter || [])
      ];
      if (allQ.includes('Balanserat')) hasBalancedWeapon = true;
      if (allQ.includes('L\u00e5ngt')) {
        hasLongWeapon = true;
        const lname = (row.name || '').toLowerCase();
        if ([
          'runstav',
          'vandringsstav',
          'tr\u00e4stav'
        ].includes(lname)) {
          hasLongStaff = true;
        }
      }
    });

    let res = inv.reduce((out,row)=>{
      const entry = invUtil.getEntry(row.id || row.name);
      if(!entry || !((entry.taggar?.typ||[]).includes('Rustning'))) return out;
      const tagger = entry.taggar || {};
      const baseQ = [
        ...(tagger.kvalitet || []),
        ...splitQuals(entry.kvalitet)
      ];
      const removed = row.removedKval || [];
      const allQ = [
        ...baseQ.filter(q=>!removed.includes(q)),
        ...(row.kvaliteter || [])
      ];
      let limit = entry.stat?.['begränsning'] || 0;
      let stonePen = 0;
      if(allQ.includes('Smidig') || allQ.includes('Smidigt')) limit += 2;
      if(allQ.includes('Otymplig') || allQ.includes('Otympligt')) limit -= 1;
      if(allQ.includes('Stenpansar')) stonePen -= 4;
      if(rustLvl >= 2) limit = 0;
      limit += stonePen;
      out.push({ name: nameMap.get(row), value: kvick + limit });
      return out;
    }, []);

    res = res.length ? res : [ { value: kvick } ];

    if (robustPenalty) {
      res.forEach(r => { r.value -= robustPenalty; });
    }

    const twinLvl = storeHelper.abilityLevel(list, 'Tvillingattack');
    if (twinLvl >= 1 && weaponCount >= 2) {
      res.forEach(r => { r.value += 1; });
    }

    if (hasBalancedWeapon) {
      res.forEach(r => { r.value += 1; });
    }

    if (hasShield) {
      res.forEach(r => { r.value += 1; });
      const shieldfightLvl = storeHelper.abilityLevel(list, 'Sköldkamp');
      if (shieldfightLvl >= 1) {
        res.forEach(r => { r.value += 1; });
      }
    }

    const stafffightLvl = storeHelper.abilityLevel(list, 'Stavkamp');
    if (stafffightLvl >= 1) {
      const bonus = hasLongStaff ? 2 : (hasLongWeapon ? 1 : 0);
      if (bonus) res.forEach(r => { r.value += bonus; });
    }

    const mantleLvl = storeHelper.abilityLevel(list, 'Manteldans');
    if (mantleLvl >= 1) {
      res.forEach(r => { r.value += 1; });
    }

    let hamRes = [];
    if (hamRobustPenalty) {
      hamRes = [ { name: hamRobustName, value: kvick - hamRobustPenalty } ];
      if (mantleLvl >= 1) {
        hamRes.forEach(r => { r.value += 1; });
      }
    }

    res.forEach(r => { r.value = Math.max(1, r.value); });
    hamRes.forEach(r => { r.value = Math.max(1, r.value); });

    return res.concat(hamRes);
  }

  function getDefenseTraitName(list) {
    const forced = storeHelper.getDefenseTrait(store);
    if (forced) return forced;

    const ABILITY_TRAITS = [
      { ability: 'Dansande vapen', level: 3, trait: 'Viljestark' },
      { ability: 'Fint', level: 2, trait: 'Diskret' },
      { ability: ['Sjätte Sinne', 'Sjätte sinne'], level: 2, trait: 'Vaksam' },
      { ability: 'Taktiker', level: 2, trait: 'Listig' },
      { ability: 'Pareringsmästare', level: 1, trait: 'Tr\u00e4ffs\u00e4ker' }
    ];

    for (const { ability, level, trait } of ABILITY_TRAITS) {
      const abilities = Array.isArray(ability) ? ability : [ability];
      const highest = abilities.reduce((max, a) => Math.max(max, storeHelper.abilityLevel(list, a)), 0);
      if (highest >= level) {
        return trait;
      }
    }

    return 'Kvick';
  }

  const TRAIT_KEYS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffs\u00e4ker','Vaksam','Viljestark','\u00d6vertygande'];

  // Map UI entry points that trigger trait re-renders and whether they need
  // a full refresh or allow partial updates. This doubles as documentation of
  // which user interactions hit renderTraits and what they change.
  const TRAIT_RENDER_EVENT_MAP = {
    init: {
      mode: 'full',
      triggers: ['Initial boot sequence (main.js boot)']
    },
    'character-change': {
      mode: 'full',
      triggers: ['Aktiv rollperson byts/importeras (main.js applyCharacterChange)']
    },
    'traits:adjust': {
      mode: 'partial',
      triggers: ['Knappjusteringar i panelen för karakt\u00e4rsdrag (traits-utils.js)']
    },
    'traits:reset': {
      mode: 'full',
      triggers: ['\u00c5terst\u00e4ll karakt\u00e4rsdrag via verktygsf\u00e4ltet (main.js)']
    },
    'inventory:update': {
      mode: 'full',
      triggers: ['Inventarie\u00e4ndringar, kvaliteter och artefakter (inventory-utils.js)']
    },
    'list:update': {
      mode: 'full',
      triggers: ['F\u00f6rtecknings- och f\u00f6rm\u00e5gejusteringar (character-view.js & index-view.js)']
    },
    'defense:change': {
      mode: 'full',
      triggers: ['Val av f\u00f6rsvarskarakt\u00e4rsdrag via popup (main.js)']
    },
    default: {
      mode: 'full',
      triggers: ['Okategoriserade anrop']
    }
  };

  const traitNodes = new Map();
  let lastTraitState = new Map();
  let lastTotals = { total: null, maxTot: null, className: '' };

  function uniqueValidTraits(arr) {
    const out = [];
    const seen = new Set();
    arr.forEach(key => {
      if (typeof key !== 'string') return;
      if (!TRAIT_KEYS.includes(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  }

  function normalizeRenderOptions(input) {
    if (!input) return { source: 'unknown', changedTraits: [], forceFull: false };
    if (typeof input === 'string') {
      return { source: input, changedTraits: [], forceFull: false };
    }
    if (typeof input !== 'object') {
      return { source: 'unknown', changedTraits: [], forceFull: false };
    }

    const list = [];
    if (Array.isArray(input.changedTraits)) list.push(...input.changedTraits);
    if (typeof input.changedTrait === 'string') list.push(input.changedTrait);
    if (typeof input.trait === 'string') list.push(input.trait);

    const source = typeof input.source === 'string' ? input.source : 'unknown';
    const changedTraits = uniqueValidTraits(list);
    const forceFull = Boolean(input.forceFull || input.full);

    return { source, changedTraits, forceFull };
  }

  function descriptorsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const da = a[i];
      const db = b[i];
      if (!da || !db) return false;
      if (da.type !== db.type) return false;
      if (da.type === 'extra' && da.text !== db.text) return false;
    }
    return true;
  }

  function isTraitStateEqual(prev, next) {
    if (!prev || !next) return false;
    if (prev.value !== next.value) return false;
    if (prev.count !== next.count) return false;
    if (!descriptorsEqual(prev.before, next.before)) return false;
    if (!descriptorsEqual(prev.extras, next.extras)) return false;
    if (!descriptorsEqual(prev.after, next.after)) return false;
    return true;
  }

  function computeTraitSnapshot() {
    const data = storeHelper.getTraits(store) || {};
    const list = storeHelper.getCurrentList(store) || [];
    const effects = storeHelper.getArtifactEffects(store) || {};
    const permBase = storeHelper.calcPermanentCorruption(list, effects);
    const hasEarth = list.some(p => p.namn === 'Jordnära');
    const bonus = window.exceptionSkill ? (exceptionSkill.getBonuses(list) || {}) : {};
    const maskBonus = window.maskSkill
      ? (maskSkill.getBonuses(storeHelper.getInventory(store)) || {})
      : {};

    const counts = {};
    const vals = {};
    TRAIT_KEYS.forEach(k => {
      counts[k] = list.filter(p => (p.taggar?.test || []).includes(k)).length;
      vals[k] = (data[k] || 0) + (bonus[k] || 0) + (maskBonus[k] || 0);
    });

    const hasKraftprov = list.some(p => p.namn === 'Kraftprov');
    const hasHardnackad = list.some(p => p.namn === 'Hårdnackad');
    const hasSjalastark = list.some(p => p.namn === 'Själastark');
    const strongGift = storeHelper.abilityLevel(list, 'Stark gåva') >= 1;
    const resistCount = list.filter(p => p.namn === 'Motståndskraft').length;
    const sensCount = list.filter(p => p.namn === 'Korruptionskänslig').length;

    const valWill = vals['Viljestark'] || 0;
    const baseMax = strongGift ? valWill + 5 : valWill;
    const threshBase = strongGift ? valWill : Math.ceil(valWill / 2);
    const maxCor = baseMax + (hasSjalastark ? 1 : 0);
    let thresh = threshBase + resistCount - sensCount;
    const darkPerm = storeHelper.calcDarkPastPermanentCorruption(list, thresh);
    const effectsWithDark = { ...effects, corruption: (effects.corruption || 0) + darkPerm };

    const defTrait = getDefenseTraitName(list);
    const defs = calcDefense(vals[defTrait] || 0);

    const states = new Map();

    const addExtra = (arr, text) => {
      const val = String(text || '').trim();
      if (!val) return;
      arr.push({ type: 'extra', text: val });
    };

    TRAIT_KEYS.forEach(key => {
      const val = vals[key] || 0;
      const before = [];
      const extras = [];
      const after = [];

      if (key === 'Stark') {
        before.push({ type: 'count' });
        const base = storeHelper.calcCarryCapacity(val, list);
        const hardy = hasHardnackad ? 1 : 0;
        const talBase = hasKraftprov ? val + 5 : Math.max(10, val);
        const tal = talBase + hardy;
        const pain = storeHelper.calcPainThreshold(val, list, effectsWithDark);
        addExtra(before, `Bärkapacitet: ${formatWeight(base)}`);
        addExtra(extras, `Tålighet: ${tal} • Smärtgräns: ${pain}`);
      } else {
        after.push({ type: 'count' });
      }

      if (key === 'Viljestark') {
        let perm = hasEarth ? (permBase % 2) : permBase;
        perm += darkPerm;
        addExtra(extras, `Permanent korruption: ${perm}`);
        addExtra(extras, `Maximal korruption: ${maxCor} • Korruptionströskel: ${thresh}`);
      }
      if (key === 'Diskret') {
        if (storeHelper.abilityLevel(list, 'Fint') >= 1) {
          addExtra(extras, 'Kan användas som träffsäker för attacker i närstrid med kort eller precist vapen');
        }
        if (storeHelper.abilityLevel(list, 'Lönnstöt') >= 1) {
          addExtra(extras, 'Kan användas som träffsäker för attacker med Övertag');
        }
      }
      if (key === 'Kvick' && storeHelper.abilityLevel(list, 'Koreograferad strid') >= 1) {
        addExtra(extras, 'Kan användas som träffsäker för attacker som utförs efter en förflyttning');
      }
      if (key === 'Listig' && storeHelper.abilityLevel(list, 'Taktiker') >= 3) {
        addExtra(extras, 'Kan användas som träffsäker för attacker med allt utom tunga vapen');
      }
      if (key === 'Vaksam') {
        const sjatteSinneLvl = Math.max(
          storeHelper.abilityLevel(list, 'Sjätte Sinne'),
          storeHelper.abilityLevel(list, 'Sjätte sinne')
        );
        if (sjatteSinneLvl >= 3) {
          addExtra(extras, 'Kan användas som träffsäker');
        } else if (sjatteSinneLvl >= 1) {
          addExtra(extras, 'Kan användas som träffsäker för attacker med avståndsvapen');
        }
      }
      if (key === 'Stark' && storeHelper.abilityLevel(list, 'Järnnäve') >= 1) {
        addExtra(extras, 'Kan användas som träffsäker för attacker i närstrid');
      }
      if (key === '\u00d6vertygande' && storeHelper.abilityLevel(list, 'Dominera') >= 1) {
        addExtra(extras, 'Kan användas som träffsäker för attacker i närstrid');
      }
      if (key === '\u00d6vertygande' && storeHelper.abilityLevel(list, 'Ledare') >= 1) {
        addExtra(extras, 'Kan användas istället för Viljestark vid användandet av mystiska förmågor och ritualer');
      }
      if (key === defTrait) {
        defs.forEach(d => {
          const label = d.name ? `Försvar (${d.name})` : 'Försvar';
          addExtra(extras, `${label}: ${d.value}`);
        });
      }

      states.set(key, {
        key,
        value: val,
        count: counts[key] || 0,
        before,
        extras,
        after
      });
    });

    const total = TRAIT_KEYS.reduce((sum, key) => sum + (vals[key] || 0), 0);
    const lvlMap = { Novis: 1, 'Ges\u00e4ll': 2, 'M\u00e4stare': 3 };
    let maxTot = 80;
    list.forEach(it => {
      if (it.namn === 'Exceptionellt karakt\u00e4rsdrag') {
        maxTot += lvlMap[it.niv\u00e5] || 0;
      }
    });
    const inv = storeHelper.getInventory(store) || [];
    inv.forEach(row => {
      if (row && row.id === 'l9' && row.trait) maxTot += 1;
    });

    let parentClass = '';
    if (total === maxTot) parentClass = 'good';
    else if (total < maxTot) parentClass = 'under';
    else parentClass = 'over';

    return { states, total, maxTot, parentClass };
  }

  function ensureTraitNode(key) {
    if (traitNodes.has(key)) return traitNodes.get(key);

    const wrapper = document.createElement('div');
    wrapper.className = 'trait';
    wrapper.dataset.key = key;

    const nameEl = document.createElement('div');
    nameEl.className = 'trait-name';
    nameEl.textContent = key;

    const controlsEl = document.createElement('div');
    controlsEl.className = 'trait-controls';
    const makeBtn = (delta, label) => {
      const btn = document.createElement('button');
      btn.className = 'trait-btn';
      btn.dataset.d = String(delta);
      btn.textContent = label;
      return btn;
    };
    const btnMinus5 = makeBtn(-5, '−5');
    const btnMinus1 = makeBtn(-1, '−1');
    const valueEl = document.createElement('div');
    valueEl.className = 'trait-value';
    const btnPlus1 = makeBtn(1, '+1');
    const btnPlus5 = makeBtn(5, '+5');
    controlsEl.append(btnMinus5, btnMinus1, valueEl, btnPlus1, btnPlus5);

    const anchor = document.createComment('trait-anchor');

    const countBtn = document.createElement('button');
    countBtn.className = 'trait-count';
    countBtn.dataset.trait = key;

    wrapper.append(nameEl, controlsEl, anchor);
    dom.traits.appendChild(wrapper);

    const entry = {
      key,
      wrapper,
      controlsEl,
      valueEl,
      anchor,
      countBtn,
      extraPool: []
    };

    traitNodes.set(key, entry);
    return entry;
  }

  function syncTraitNode(entry, state) {
    if (!entry || !state) return;

    entry.valueEl.textContent = String(state.value ?? 0);
    entry.countBtn.dataset.trait = state.key;
    entry.countBtn.textContent = `Förmågor: ${state.count}`;

    const desired = [];
    let extraIdx = 0;
    const useExtra = text => {
      let el = entry.extraPool[extraIdx];
      if (!el) {
        el = document.createElement('div');
        el.className = 'trait-extra';
        entry.extraPool[extraIdx] = el;
      }
      el.textContent = text;
      desired.push(el);
      extraIdx += 1;
    };
    const pushDescriptor = desc => {
      if (!desc) return;
      if (desc.type === 'count') {
        desired.push(entry.countBtn);
      } else if (desc.type === 'extra') {
        useExtra(desc.text);
      }
    };

    state.before.forEach(pushDescriptor);
    state.extras.forEach(pushDescriptor);
    state.after.forEach(pushDescriptor);

    const parent = entry.wrapper;
    const ref = entry.anchor;

    desired.forEach(node => {
      parent.insertBefore(node, ref);
    });

    const keep = new Set(desired);
    let cur = entry.controlsEl.nextSibling;
    while (cur && cur !== ref) {
      const next = cur.nextSibling;
      if (!keep.has(cur)) parent.removeChild(cur);
      cur = next;
    }
  }

  function updateTotals(total, maxTot, className) {
    if (dom.traitsTot && lastTotals.total !== total) {
      dom.traitsTot.textContent = String(total);
    }
    if (dom.traitsMax && lastTotals.maxTot !== maxTot) {
      dom.traitsMax.textContent = String(maxTot);
    }
    const parent = dom.traitsTot ? dom.traitsTot.closest('.traits-total') : null;
    if (parent && lastTotals.className !== className) {
      parent.classList.remove('good','under','over');
      if (className) parent.classList.add(className);
    }
    lastTotals = { total, maxTot, className };
  }

  function renderTraits(options){
    if (!dom.traits) return;

    const opts = normalizeRenderOptions(options);
    const config = TRAIT_RENDER_EVENT_MAP[opts.source] || TRAIT_RENDER_EVENT_MAP.default;
    const firstRender = traitNodes.size === 0;

    const partialCandidates = (config.mode === 'partial' && !opts.forceFull)
      ? opts.changedTraits
      : [];
    const hasPartialTargets = partialCandidates.length > 0;
    const needsFull = opts.forceFull || firstRender || config.mode !== 'partial' || !hasPartialTargets;

    if (firstRender) {
      while (dom.traits.firstChild) {
        dom.traits.removeChild(dom.traits.firstChild);
      }
    }

    TRAIT_KEYS.forEach(ensureTraitNode);

    const snapshot = computeTraitSnapshot();
    const states = snapshot.states;

    const changedKeys = new Set();
    if (needsFull) {
      TRAIT_KEYS.forEach(key => changedKeys.add(key));
    } else {
      partialCandidates.forEach(key => changedKeys.add(key));
    }

    TRAIT_KEYS.forEach(key => {
      const prev = lastTraitState.get(key);
      const next = states.get(key);
      if (!isTraitStateEqual(prev, next)) {
        changedKeys.add(key);
      }
    });

    TRAIT_KEYS.forEach(key => {
      if (!changedKeys.has(key)) return;
      const entry = ensureTraitNode(key);
      const next = states.get(key);
      if (next) syncTraitNode(entry, next);
    });

    lastTraitState = states;

    updateTotals(snapshot.total, snapshot.maxTot, snapshot.parentClass);

    if (dom.traitStats) {
      dom.traitStats.textContent = '';
    }
  }

  function bindTraits(){
    if(!dom.traits) return;
    dom.traits.addEventListener('click', e => {
      const countBtn = e.target.closest('.trait-count');
      if (countBtn) {
        const trait = countBtn.dataset.trait;
        if (dom.tstSel) {
          dom.tstSel.value = trait;
          dom.tstSel.dispatchEvent(new Event('change'));
        }
        storeHelper.setOnlySelected(store, true);
        if (typeof indexViewUpdate === 'function') indexViewUpdate({ reason: 'traits:only-selected' });
        return;
      }
      const btn = e.target.closest('.trait-btn');
      if(!btn) return;
      const key = btn.closest('.trait').dataset.key;
      const d   = Number(btn.dataset.d);

      const t   = storeHelper.getTraits(store);
      const bonusEx = window.exceptionSkill ? exceptionSkill.getBonus(key) : 0;
      const bonusMask = window.maskSkill ? maskSkill.getBonus(key) : 0;
      const bonus = bonusEx + bonusMask;
      const min   = bonus;
      const next  = Math.max(0, (t[key] || 0) + d);
      t[key] = Math.max(min - bonus, next);
      storeHelper.setTraits(store, t);
      renderTraits({ source: 'traits:adjust', changedTraits: [key] });
    });
  }

  window.renderTraits = renderTraits;
  window.bindTraits = bindTraits;
  window.calcDefense = calcDefense;
  window.getDefenseTraitName = getDefenseTraitName;
})(window);
