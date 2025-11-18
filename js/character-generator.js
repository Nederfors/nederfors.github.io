(function(window){
  const ATTR_KEYS = [
    'Diskret','Kvick','Listig','Stark',
    'Träffsäker','Vaksam','Viljestark','Övertygande'
  ];

  const DEFAULT_OPTIONS = {
    name: 'Generator',
    xp: 100,
    attributeMode: '',
    abilityMode: '',
    traitFocus: '',
    race: '',
    yrke: '',
    elityrke: ''
  };

  const LEVEL_VALUE = { '': 0, Novis: 1, 'Gesäll': 2, 'Mästare': 3 };
  const MELEE_SCHOOLS = [
    'Sköldkamp',
    'Naturlig krigare',
    'Stavkamp',
    'Stångverkan',
    'Tvillingattack',
    'Tvåhandskraft',
    'Yxkonstnär',
    'Svärdshelgon',
    'Manteldans',
    'Knivgöra',
    'Stridsgisslare'
  ];
  const RANGED_SCHOOLS = ['Prickskytt','Stålkast'];
  const ALT_TRAFFSAKER = [
    'Fint',
    'Taktiker',
    'Järnnäve',
    'Sjätte sinne',
    'Dominera',
    'Knivgöra',
    'Koreograferad strid',
    'Pareringsmästare'
  ];
  const ALT_VILJESTARK = ['Ledare','Lärd','Kallsinne'];
  const STATIC_INCOMPATIBLE_GROUPS = [MELEE_SCHOOLS, RANGED_SCHOOLS, ALT_TRAFFSAKER, ALT_VILJESTARK];
  const dataCache = {
    abilityPool: null,
    mystic: null
  };
  const YRKE_TRADITION_PAIRS = [
    ['häxa', 'Häxkonst'],
    ['svartkonstnär', 'Svartkonst'],
    ['teurg', 'Teurgi'],
    ['ordensmagiker', 'Ordensmagi'],
    ['symbolist', 'Symbolism'],
    ['trollsångare', 'Trollsång']
  ];
  const TRADITION_BASE_ABILITY_PAIRS = [
    ['Häxkonst', 'Häxkonster'],
    ['Svartkonst', 'Svartkonst'],
    ['Teurgi', 'Teurgi'],
    ['Ordensmagi', 'Ordensmagi'],
    ['Symbolism', 'Symbolism'],
    ['Trollsång', 'Trollsång'],
    ['Stavmagiker', 'Stavmagi']
  ];
  const isEliteEntry = (entry) => {
    if (typeof window.isEliteSkill === 'function') return window.isEliteSkill(entry);
    return (entry?.taggar?.typ || []).includes('Elityrkesförmåga');
  };
  const mysticCanonicalKeys = () => Array.from(getMysticPools().canonicalTraditions.keys());

  const randIndex = (max) => Math.floor(Math.random() * max);
  class SymbaroumCharacter {
    constructor(options = {}) {
      const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
      this.namn = String(opts.name || '').trim() || DEFAULT_OPTIONS.name;
      const xp = Number(opts.xp);
      this.ERF = Number.isFinite(xp) ? Math.max(0, Math.floor(xp / 10) * 10) : DEFAULT_OPTIONS.xp;
      this.baseXP = this.ERF;
      this.totalXPBudget = this.ERF;
      this.ERFkvar = this.ERF;
      this.traitFocus = ATTR_KEYS.includes(opts.traitFocus) ? opts.traitFocus : '';
      this.extraPicks = [];
      this.autoAdded = [];
      this.advantagePicks = [];
      this.disadvantagePicks = [];
      this.selectedRace = resolveEntryByType(opts.race, 'Ras');
      this.selectedYrke = resolveEntryByType(opts.yrke, 'Yrke');
      this.selectedElityrke = resolveEntryByType(opts.elityrke, 'Elityrke');
      this.isMysticElite = isMysticElityrke(this.selectedElityrke);
      this.isMysticProfession = isMysticProfession(this.selectedYrke) || this.isMysticElite;
      this.isSelfTaughtMystic = isSelfTaughtMystic(this.selectedYrke);
      this.archetypePreferences = buildArchetypePreferenceSet(this.selectedRace, this.selectedYrke, this.selectedElityrke);
      this.traditionLock = this.deriveTraditionLock();
      if (this.selectedRace) this.registerExtraEntry(this.selectedRace.namn, 'race');
      if (this.selectedYrke) this.registerExtraEntry(this.selectedYrke.namn, 'yrke');
      if (this.selectedElityrke) this.registerExtraEntry(this.selectedElityrke.namn, 'elityrke');
      this.abilityPreferences = new Map();
      this.seedAbilityPreferences();
      this.Karaktarsdrag = this.skapaKaraktarsdrag(opts.attributeMode, this.traitFocus);
      const stats = this.ovrigaStats();
      this.maximalTalighet = stats.maximalTalighet;
      this.smartgrans = stats.smartgrans;
      this.korruptionstroskel = stats.korruptionstroskel;
      this.permanentKorruption = stats.permanentKorruption;
      this.Formagor = {};
      this.formagAlternativ = this.gynnsammaFormagor();
      this.applyMysticBiasToAlternatives();
      this.applyAbilityPreferences();
      this.applyTraditionLockToAlternatives();
      this.applyStatGateToAlternatives();
      this.krafter = [];
      this.ritualer = [];
      this.valdaRitualer = [];
      this.tradition = '';
      this.traditionTag = '';
      this.allaKrafter = [];
      this.allaRitualer = [];
      this.mojligaKrafterOchRitualer(this.traditionLock || 'ingen');
      this.applyTraditionLockToMysticPools();
      const abilityMode = opts.abilityMode === 'master' ? 'Mästare' : opts.abilityMode;
      this.abilityMode = abilityMode;
      this.forcedAbilities = this.buildForcedAbilities();
      this.valjNyaFormagor(this.ERF, abilityMode);
      this.ensureForcedAbilitiesAfterLoop();
      this.pickAdvantagesAndDisadvantages();
      this.reconcileXPGap(abilityMode);
    }

    skapaKaraktarsdrag(typ, focus) {
      const drag = {};
      ATTR_KEYS.forEach(key => { drag[key] = 5; });
      if (typ === 'specialist') {
        const T8 = randIndex(ATTR_KEYS.length);
        const Drag = ATTR_KEYS.slice();
        const dragName = Drag[T8];
        drag[dragName] = 15;
        Drag.splice(T8, 1);
        for (let i = 0; i < 30; i += 1) {
          let done = false;
          while (!done) {
            const T7 = randIndex(Drag.length);
            const pick = Drag[T7];
            if (drag[pick] === 14) continue;
            drag[pick] += 1;
            done = true;
          }
        }
      } else if (typ === 'minmax') {
        const Drag = ATTR_KEYS.slice();
        const T8 = randIndex(Drag.length);
        const first = Drag.splice(T8, 1)[0];
        drag[first] = 15;
        for (let i = 0; i < 3; i += 1) {
          const idx = randIndex(Drag.length);
          const name = Drag.splice(idx, 1)[0];
          drag[name] = 14;
        }
        const T4 = randIndex(Drag.length);
        drag[Drag[T4]] = 8;
      } else {
        for (let i = 0; i < 40; i += 1) {
          let done = false;
          while (!done) {
            const idx = randIndex(ATTR_KEYS.length);
            const name = ATTR_KEYS[idx];
            if (drag[name] === 15) continue;
            if (drag[name] === 14) {
              const maxReached = ATTR_KEYS.some(key => drag[key] === 15);
              if (maxReached) continue;
            }
            drag[name] += 1;
            done = true;
          }
        }
      }
      this.applyTraitFocus(drag, focus);
      return drag;
    }

    applyTraitFocus(drag, focus) {
      const preferred = ATTR_KEYS.includes(focus) ? focus : '';
      if (!preferred) return;
      drag[preferred] = drag[preferred] || 5;
      if (drag[preferred] >= 15) return;
      let needed = 15 - drag[preferred];
      const donors = ATTR_KEYS
        .filter(key => key !== preferred)
        .sort((a, b) => (drag[b] || 0) - (drag[a] || 0));
      donors.forEach(key => {
        while (needed > 0 && drag[key] > 5) {
          drag[key] -= 1;
          drag[preferred] += 1;
          needed -= 1;
        }
      });
    }

    ovrigaStats() {
      const stark = this.Karaktarsdrag.Stark;
      const vilje = this.Karaktarsdrag.Viljestark;
      const maximalTalighet = stark <= 10 ? 10 : stark;
      const smartgrans = Math.floor(stark / 2 + 0.5);
      const korruptionstroskel = Math.floor(vilje / 2 + 0.5);
      return {
        maximalTalighet,
        smartgrans,
        korruptionstroskel,
        permanentKorruption: 0
      };
    }

    gynnsammaFormagor() {
      const stats = this.Karaktarsdrag || {};
      const abilities = getAbilityPool();
      const tiers = {
        high: [],
        medium: [],
        low: [],
        general: []
      };
      abilities.forEach(item => {
        if (!this.isAbilityAllowedByStats(item.name)) return;
        const tests = item.tests || [];
        let best = 0;
        tests.forEach(test => {
          if (!ATTR_KEYS.includes(test)) return;
          best = Math.max(best, stats[test] || 0);
        });
        const weight = getArchetypeWeight(item.archetypes, this.archetypePreferences);
        const pushWithWeight = (bucket, name, baseCount) => {
          const copies = Math.max(1, baseCount * weight);
          for (let i = 0; i < copies; i += 1) bucket.push(name);
        };
        if (!tests.length || best <= 10) {
          pushWithWeight(tiers.general, item.name, 1);
        } else if (best >= 15) {
          pushWithWeight(tiers.high, item.name, 9);
        } else if (best >= 13) {
          pushWithWeight(tiers.medium, item.name, 3);
        } else {
          pushWithWeight(tiers.low, item.name, 1);
        }
      });
      const Alternativ = [];
      const pushCopies = (name) => Alternativ.push(name);
      tiers.high.forEach(name => pushCopies(name));
      tiers.medium.forEach(name => pushCopies(name));
      tiers.low.forEach(name => pushCopies(name));
      tiers.general.forEach(name => pushCopies(name));
      return Alternativ;
    }

    registerExtraEntry(name, source = 'manual') {
      if (!name) return;
      const key = normalizeName(name);
      if (!key) return;
      if (!Array.isArray(this.extraPicks)) this.extraPicks = [];
      if (this.extraPicks.some(val => normalizeName(val) === key)) return;
      this.extraPicks.push(name);
      if (source && source !== 'manual') {
        const already = (this.autoAdded || []).some(item => normalizeName(item?.name) === key);
        if (!already) {
          if (!Array.isArray(this.autoAdded)) this.autoAdded = [];
          this.autoAdded.push({ name, source });
        }
      }
    }

    deriveTraditionLock() {
      const resolveFromEntry = (entry) => {
        if (!entry) return '';
        const mappedTradition = getYrkeTraditionName(entry);
        if (mappedTradition) return mappedTradition;
        const candidates = getEntryTraditions(entry);
        if (candidates.length) {
          const resolved = resolveTraditionName(candidates[0]);
          if (resolved) return resolved;
        }
        const likelyFields = [
          entry.lampliga_formagor,
          entry.lampliga,
          entry.Elityrkesförmågor
        ];
        for (let i = 0; i < likelyFields.length; i += 1) {
          const names = toNameArray(likelyFields[i]);
          for (let j = 0; j < names.length; j += 1) {
            const found = resolveTraditionFromName(names[j]);
            if (found) return found;
          }
        }
        return '';
      };
      return resolveFromEntry(this.selectedYrke) || resolveFromEntry(this.selectedElityrke) || '';
    }

    getActiveTraditionLock() {
      return normalizeTraditionKey(this.traditionLock || this.traditionTag || '');
    }

    ensureTraditionLock(tag, sourceName) {
      if (!tag) return true;
      const key = normalizeTraditionKey(tag);
      if (!key) return true;
      const current = this.getActiveTraditionLock();
      if (current && current !== key) return false;
      const resolved = resolveTraditionName(tag) || tag;
      if (!this.traditionTag) this.traditionTag = resolved;
      if (!this.tradition && sourceName) this.tradition = sourceName;
      this.mojligaKrafterOchRitualer(resolved);
      this.applyTraditionLockToAlternatives();
      this.applyTraditionLockToMysticPools();
      return true;
    }

    applyTraditionLockToAlternatives() {
      const lock = this.getActiveTraditionLock();
      if (!lock) return;
      this.formagAlternativ = this.formagAlternativ.filter(name => this.isAllowedByTraditionLock(name));
    }

    applyTraditionLockToMysticPools() {
      const lock = this.getActiveTraditionLock();
      if (!lock) return;
      this.allaKrafter = this.allaKrafter.filter(name => this.isAllowedByTraditionLock(name));
      this.allaRitualer = this.allaRitualer.filter(name => this.isAllowedByTraditionLock(name));
    }

    isAllowedByTraditionLock(name) {
      const lock = this.getActiveTraditionLock();
      if (!lock) return true;
      const norm = normalizeName(name);
      if (!norm) return false;
      if (norm === 'mystisk kraft' || norm === 'ritualist') return true;
      const entry = lookupEntryByName(name);
      if (!entry) return true;
      const exclusive = entryIsTraditionExclusive(entry);
      if (!exclusive) return true; // additive: non-exclusive entries are always allowed
      const abilityTrad = getAbilityTraditionName(name);
      if (abilityTrad) {
        return normalizeTraditionKey(abilityTrad) === lock;
      }
      return entryMatchesTradition(entry, lock);
    }

    seedAbilityPreferences() {
      toNameArray(this.selectedYrke?.lampliga_formagor).forEach(name => this.addAbilityPreference(name, 4));
      toNameArray(this.selectedElityrke?.Elityrkesförmågor).forEach(name => this.addAbilityPreference(name, 5));
      if (this.traitFocus) {
        getAbilitiesMatchingTrait(this.traitFocus).forEach(name => this.addAbilityPreference(name, 2));
      }
      if (this.isMysticProfession || this.isSelfTaughtMystic) {
        this.addAbilityPreference('Mystisk kraft', 8);
        this.addAbilityPreference('Ritualist', 6);
        if (this.traditionLock && !this.isSelfTaughtMystic) {
          const key = normalizeTraditionKey(this.traditionLock);
          const pools = getMysticPools();
          const powers = key ? (pools.powersByTradition.get(key) || []) : [];
          powers.forEach(name => this.addAbilityPreference(name, 3));
        } else if (this.isSelfTaughtMystic) {
          getMysticPools().allPowers.forEach(name => this.addAbilityPreference(name, 1));
        }
      }
    }

    addAbilityPreference(name, weight = 1) {
      const key = normalizeName(name);
      if (!key || weight <= 0) return;
      const prev = this.abilityPreferences?.get(key) || { name, weight: 0 };
      prev.name = prev.name || name;
      prev.weight += weight;
      this.abilityPreferences.set(key, prev);
    }

    applyAbilityPreferences() {
      if (!this.abilityPreferences || !this.abilityPreferences.size) return;
      this.abilityPreferences.forEach(pref => {
        const copies = Math.max(0, Math.floor(pref.weight));
        for (let i = 0; i < copies; i += 1) {
          this.formagAlternativ.push(pref.name);
        }
      });
    }

    applyMysticBiasToAlternatives() {
      if (!this.isMysticProfession && !this.isSelfTaughtMystic) return;
      const pools = getMysticPools();
      const pushCopies = (name, count) => {
        if (!name || count <= 0) return;
        for (let i = 0; i < count; i += 1) {
          this.formagAlternativ.push(name);
        }
      };
      // Base access: always allow the entry points
      pushCopies('Mystisk kraft', 8);
      pushCopies('Ritualist', 6);

      const chosenTrad = normalizeTraditionKey(this.traditionLock || this.traditionTag || '');
      const preferAll = !chosenTrad;

      const biasList = (preferAll ? pools.allPowers : (pools.powersByTradition.get(chosenTrad) || []));
      const ritualBias = (preferAll ? pools.allRituals : (pools.ritualsByTradition.get(chosenTrad) || []));

      const defaultWeight = this.isSelfTaughtMystic ? 2 : (preferAll ? 1 : 3);
      const ritualWeight = this.isSelfTaughtMystic ? 2 : (preferAll ? 1 : 2);

      biasList.forEach(name => pushCopies(name, defaultWeight));
      ritualBias.forEach(name => pushCopies(name, ritualWeight));
    }

    applyStatGateToAlternatives() {
      this.formagAlternativ = this.formagAlternativ.filter(name => this.isAbilityAllowedByStats(name));
    }

    getTraditionBaseLevel(tradition) {
      const baseAbility = getTraditionBaseAbilityName(tradition);
      if (!baseAbility) return { ability: '', level: '' };
      const level = this.Formagor[baseAbility] || '';
      return { ability: baseAbility, level };
    }

    isMysticLevelAllowed(name, desiredLevel) {
      const abilityTrad = getAbilityTraditionName(name);
      if (!abilityTrad) return true;
      const baseAbility = getTraditionBaseAbilityName(abilityTrad);
      if (!baseAbility) return true;
      if (normalizeName(baseAbility) === normalizeName(name)) return true;
      const target = desiredLevel && LEVEL_VALUE[desiredLevel] ? desiredLevel : 'Novis';
      const baseLevel = this.Formagor[baseAbility] || '';
      return LEVEL_VALUE[baseLevel] >= LEVEL_VALUE[target];
    }

    isAbilityAllowedByStats(name) {
      const entry = lookupEntryByName(name);
      if (!entry) return true;
      const tests = toNameArray(entry?.taggar?.test);
      if (!tests.length) return true;
      const stats = this.Karaktarsdrag || {};
      return tests.every(test => {
        const attr = normalizeAttributeName(test);
        if (!attr) return true;
        const val = stats[attr];
        if (val === undefined || val === null) return true;
        return Number(val) >= 10;
      });
    }

    buildForcedAbilities() {
      const forced = [];
      const elite = this.selectedElityrke;
      if (!elite) return forced;

      const groups = parseElityrkeRequirementGroups(elite.krav_formagor);
      const used = new Set();
      const picks = [];
      groups.forEach(group => {
        const pick = this.pickRequirementForGroup(group, used);
        if (pick) picks.push(pick);
      });
      this.applyMasterPreference(picks);
      picks.forEach(req => {
        forced.push({
          ...req,
          done: this.isRequirementComplete(req)
        });
      });

      const eliteSkills = toNameArray(elite.Elityrkesförmågor);
      if (eliteSkills.length) {
        const pick = eliteSkills[randIndex(eliteSkills.length)];
        if (pick) {
          forced.push({
            name: pick,
            type: 'ability',
            targetLevel: 'Novis',
            done: Boolean(this.Formagor[pick])
          });
        }
      }
      return forced;
    }

    pickRequirementForGroup(group, used) {
      if (!group) return null;
      const pool = [];
      const pushEntry = (entry) => {
        if (!entry || !this.isRequirementEntryValid(entry)) return;
        pool.push(entry);
      };
      if (group.anyMystic) {
        getEntriesByType('Mystisk kraft').forEach(entry => {
          if (!isEliteEntry(entry)) pushEntry(entry);
        });
      } else if (group.anyRitual && !(group.names || []).length) {
        getEntriesByType('Ritual').forEach(entry => pushEntry(entry));
      } else {
        (group.names || []).forEach(name => pushEntry(lookupEntryByName(name)));
      }
      if (!pool.length) return null;
      const dedup = pool.filter(entry => entry?.namn && !used.has(normalizeName(entry.namn)));
      const preferred = dedup.filter(entry => this.isRequirementEntryAlreadySatisfied(entry));
      const list = preferred.length ? preferred : (dedup.length ? dedup : pool);
      const entry = list[randIndex(list.length)];
      if (!entry) return null;
      const name = entry.namn;
      used.add(normalizeName(name));
      const type = this.getRequirementEntryType(entry);
      return {
        name,
        type,
        targetLevel: type === 'ritual' ? 'Novis' : 'Novis'
      };
    }

    applyMasterPreference(picks) {
      if (!Array.isArray(picks) || !picks.length) return;
      const abilityReqs = picks.filter(req => req && req.type !== 'ritual');
      abilityReqs.forEach(req => {
        const current = this.Formagor[req.name] || '';
        if (LEVEL_VALUE[current] > LEVEL_VALUE[req.targetLevel || '']) {
          req.targetLevel = current;
        } else if (!req.targetLevel) {
          req.targetLevel = 'Novis';
        }
      });
      if (!abilityReqs.length) return;
      const existingMaster = abilityReqs.find(req => (this.Formagor[req.name] || '') === 'Mästare');
      if (existingMaster) {
        existingMaster.targetLevel = 'Mästare';
        return;
      }
      let choice = abilityReqs[0];
      let best = LEVEL_VALUE[this.Formagor[choice.name] || ''];
      abilityReqs.forEach(req => {
        const lvl = LEVEL_VALUE[this.Formagor[req.name] || ''];
        if (lvl > best) {
          choice = req;
          best = lvl;
        }
      });
      choice.targetLevel = 'Mästare';
    }

    isRequirementEntryValid(entry) {
      if (!entry || !entry.namn) return false;
      if (isEliteEntry(entry)) return false;
      const types = entry.taggar?.typ || [];
      if (!types.length) return false;
      return types.some(type =>
        type === 'Förmåga' ||
        type === 'Mystisk kraft' ||
        type === 'Ritual' ||
        type === 'Monstruöst särdrag'
      );
    }

    isRequirementEntryAlreadySatisfied(entry) {
      if (!entry) return false;
      const type = this.getRequirementEntryType(entry);
      if (type === 'ritual') return this.hasRitual(entry.namn);
      return Boolean(this.Formagor[entry.namn]);
    }

    getRequirementEntryType(entry) {
      const types = entry?.taggar?.typ || [];
      return types.includes('Ritual') ? 'ritual' : 'ability';
    }

    getPendingForcedAbility() {
      if (!Array.isArray(this.forcedAbilities)) return null;
      return this.forcedAbilities.find(req => req && !req.done && !req.failed && !this.isRequirementComplete(req));
    }

    ensureForcedAbilitiesAfterLoop() {
      (this.forcedAbilities || []).forEach(req => {
        if (!req || req.done) return;
        if (this.resolveForcedRequirement(req)) {
          req.done = true;
        }
      });
    }

    resolveForcedRequirement(req, handlers = {}) {
      if (!req || !req.name) return true;
      if (this.isRequirementComplete(req)) return true;
      if (req.type === 'ritual') {
        const ensureRitual = handlers.ensureRitual || (name => this.ensureRitualKnown(name));
        return ensureRitual(req.name);
      }
      const ensureAbility = handlers.ensureAbilityLevel || ((name, target) => this.forceEnsureAbilityLevel(name, target));
      return ensureAbility(req.name, req.targetLevel || 'Novis');
    }

    forceEnsureAbilityLevel(name, targetLevel) {
      if (!name) return false;
      const desired = LEVEL_VALUE[targetLevel] ? targetLevel : 'Novis';
      const abilityTrad = getAbilityTraditionName(name);
      if (abilityTrad) {
        const baseAbility = getTraditionBaseAbilityName(abilityTrad);
        if (baseAbility && normalizeName(baseAbility) !== normalizeName(name)) {
          if (!this.forceEnsureAbilityLevel(baseAbility, desired)) return false;
        }
        if (!this.isMysticLevelAllowed(name, desired)) return false;
      }
      if (!this.Formagor[name]) {
        if (this.ERFkvar < 10) return false;
        const paid = this.spendXP(10);
        if (paid < 10) return false;
        const abilityTrad = getAbilityTraditionName(name);
        if (abilityTrad) {
          this.mojligaKrafterOchRitualer(abilityTrad);
          this.tradition = name;
          this.traditionTag = abilityTrad;
        }
        this.Formagor[name] = 'Novis';
      }
      let guard = 0;
      while (LEVEL_VALUE[this.Formagor[name] || ''] < LEVEL_VALUE[desired] && guard < 5) {
        const current = this.Formagor[name] || 'Novis';
        const next = current === 'Novis' ? 'Gesäll' : 'Mästare';
        const cost = next === 'Gesäll' ? 20 : 30;
        if (this.ERFkvar < cost) return false;
        const paid = this.spendXP(cost);
        if (paid < cost) return false;
        this.Formagor[name] = next;
        guard += 1;
      }
      return true;
    }

    ensureRitualKnown(name) {
      const key = normalizeName(name);
      if (!key) return false;
      if (!Array.isArray(this.valdaRitualer)) this.valdaRitualer = [];
      if (this.valdaRitualer.some(rit => normalizeName(rit) === key)) return true;
      const entry = lookupEntryByName(name);
      if (entry && !(entry.taggar?.typ || []).includes('Ritual')) return false;
      if (this.ERFkvar < 10) return false;
      const paid = this.spendXP(10);
      if (paid < 10) return false;
      const displayName = entry?.namn || name;
      if (!displayName) return false;
      this.valdaRitualer.push(displayName);
      return true;
    }

    hasRitual(name) {
      const key = normalizeName(name);
      if (!key) return false;
      return (this.valdaRitualer || []).some(rit => normalizeName(rit) === key);
    }

    spendXP(amount) {
      const val = Math.max(0, Number(amount) || 0);
      if (!val) return 0;
      const spent = Math.min(this.ERFkvar, val);
      this.ERFkvar -= spent;
      return spent;
    }

    isRequirementComplete(req) {
      if (!req || !req.name) return true;
      if (req.type === 'ritual') return this.hasRitual(req.name);
      const current = this.Formagor[req.name] || '';
      const target = req.targetLevel || 'Novis';
      return LEVEL_VALUE[current] >= LEVEL_VALUE[target];
    }

    pickAdvantagesAndDisadvantages() {
      const advPrefs = this.buildBenefitPreferenceList('mojliga_fordelar');
      const disPrefs = this.buildBenefitPreferenceList('tankbara_nackdelar');
      const extraAdv = Math.random() > 0.65 ? (1 + randIndex(2)) : 0; // Occasionally grab a couple of extra boons
      const advCount = 5 + extraAdv;
      this.advantagePicks = this.selectEntriesByTag('Fördel', advCount, advPrefs, { weightByTrait: true, allowMultipleSame: true });
      this.disadvantagePicks = this.selectEntriesByTag('Nackdel', 5, disPrefs, { weightByTrait: false, allowMultipleSame: true });
      this.advantagePicks.forEach(name => this.registerExtraEntry(name));
      this.disadvantagePicks.forEach(name => this.registerExtraEntry(name));
    }

    reconcileXPGap(mode) {
      const abilityMode = mode || this.abilityMode || '';
      const maxAttempts = 4;
      let attempts = 0;
      const progressLimiter = () => Object.keys(this.Formagor || {}).length + (this.valdaRitualer || []).length;
      const xpContext = () => {
        const list = buildEntryList({
          abilities: this.Formagor,
          rituals: this.valdaRitualer,
          extraEntries: this.extraPicks
        });
        const calcUsed = window.storeHelper?.calcUsedXP;
        const calcTotal = window.storeHelper?.calcTotalXP;
        const base = this.baseXP || this.ERF || 0;
        if (typeof calcUsed === 'function' && typeof calcTotal === 'function') {
          const used = calcUsed(list, {});
          const total = calcTotal(base, list);
          return { total, used, remaining: Math.max(0, total - used) };
        }
        const LEVEL_XP = { Novis: 10, Gesäll: 30, Mästare: 60 };
        const advantageCost = Math.max(0, (this.advantagePicks || []).length * 5);
        const disBonus = Math.min(5, (this.disadvantagePicks || []).length) * 5;
        const abilityUsed = list.reduce((sum, entry) => {
          const types = entry?.taggar?.typ || [];
          if (types.includes('Ritual')) return sum + 10;
          if (['Mystisk kraft', 'Förmåga', 'Särdrag', 'Monstruöst särdrag'].some(t => types.includes(t))) {
            return sum + (LEVEL_XP[entry?.nivå] || LEVEL_XP.Novis);
          }
          return sum;
        }, 0);
        const used = abilityUsed + advantageCost;
        const total = base + disBonus;
        return { total, used, remaining: Math.max(0, total - used) };
      };

      while (attempts < maxAttempts) {
        const ctx = xpContext();
        this.totalXPBudget = ctx.total;
        this.ERFkvar = ctx.remaining;
        if (ctx.remaining < 10) break;
        const before = progressLimiter();
        this.valjNyaFormagor(ctx.remaining, abilityMode);
        attempts += 1;
        const after = progressLimiter();
        if (after <= before) break; // no progress, stop to avoid loops
      }
      const finalCtx = xpContext();
      this.totalXPBudget = finalCtx.total;
      this.ERFkvar = finalCtx.remaining;
    }

    buildBenefitPreferenceList(field) {
      const list = [];
      const collect = (entry) => {
        toNameArray(entry?.[field]).forEach(name => list.push(name));
      };
      if (this.selectedYrke) collect(this.selectedYrke);
      if (this.selectedElityrke) collect(this.selectedElityrke);
      return list;
    }

    selectEntriesByTag(tag, count, preferredNames, opts = {}) {
      const preferred = new Set((preferredNames || []).map(normalizeName).filter(Boolean));
      const picks = [];
      const used = new Set();
      const traitKey = this.traitFocus ? this.traitFocus.toLowerCase() : '';
      const basePoolOptions = { respectRace: true, respectStats: true };
      const buildPool = (poolOpts = {}) => {
        const respectRace = poolOpts.respectRace !== false;
        const respectStats = poolOpts.respectStats !== false;
        return getEntriesByType(tag)
          .filter(entry => !respectRace || entryMatchesRace(entry, this.selectedRace))
          .filter(entry => !respectStats || this.isAbilityAllowedByStats(entry?.namn))
          .map(entry => {
            let weight = 1;
            const nameKey = normalizeName(entry?.namn);
            if (preferred.has(nameKey)) weight += 4;
            const tests = toNameArray(entry?.taggar?.test).map(str => str.toLowerCase());
            if (opts.weightByTrait && traitKey && tests.some(test => test.includes(traitKey))) weight += 2;
            const archetypeMatch = getEntryArchetypes(entry).some(tag => this.archetypePreferences.has(tag));
            if (archetypeMatch) weight += 2;
            const allowMultiple = opts.allowMultipleSame && entryAllowsMultiple(entry);
            return { entry, weight: Math.max(1, weight), allowMultiple };
          })
          .filter(item => {
            const name = item?.entry?.namn;
            if (!name) return false;
            if (used.has(name) && !item.allowMultiple) return false;
            return true;
          });
      };

      let pool = buildPool(basePoolOptions);
      const pickEntry = () => {
        if (!pool.length) return null;
        const total = pool.reduce((sum, item) => sum + item.weight, 0);
        let roll = Math.random() * total;
        let chosenIndex = pool.length - 1;
        for (let i = 0; i < pool.length; i += 1) {
          roll -= pool[i].weight;
          if (roll <= 0) { chosenIndex = i; break; }
        }
        const item = pool[chosenIndex];
        if (!item) return null;
        // Remove non-repeatable entries from pool; keep repeatable ones for future draws
        if (!item.allowMultiple) pool.splice(chosenIndex, 1);
        return item;
      };

      const drawUntil = (targetCount) => {
        while (picks.length < targetCount) {
          const item = pickEntry();
          if (!item) break;
          const entry = item.entry;
          if (!entry) continue;
          const already = used.has(entry.namn);
          if (already && !item.allowMultiple) continue;
          if (!item.allowMultiple) used.add(entry.namn);
          picks.push(entry.namn);
        }
      };

      drawUntil(count);
      if (picks.length < count) {
        pool = buildPool({ ...basePoolOptions, respectRace: false });
        drawUntil(count);
      }
      if (picks.length < count) {
        pool = buildPool({ respectRace: false, respectStats: false });
        drawUntil(count);
      }

      return picks.slice(0, count);
    }

    mojligaKrafterOchRitualer(tradition) {
      const pools = getMysticPools();
      this.allaKrafter = pools.allPowers.slice();
      this.allaRitualer = pools.allRituals.slice();
      const key = normalizeTraditionKey(tradition);
      if (!key) {
        this.krafter = [];
        this.ritualer = [];
        return;
      }
      const mixLists = (listA, listB) => Array.from(new Set([...(listA || []), ...(listB || [])]));
      const baseKrafter = pools.powersByTradition.get(key) || [];
      const baseRitualer = pools.ritualsByTradition.get(key) || [];
      const genericKrafter = pools.powersByTradition.get('') || [];
      const genericRitualer = pools.ritualsByTradition.get('') || [];
      let krafter = mixLists(baseKrafter, genericKrafter);
      let ritualer = mixLists(baseRitualer, genericRitualer);
      this.krafter = krafter;
      this.ritualer = ritualer;
    }

    valjRitual(antal, inom) {
      const selectFromPool = (pool, removeFromKnown) => {
        while (pool.length) {
          const idx = randIndex(pool.length);
          const val = pool.splice(idx, 1)[0];
          const ritTrad = getAbilityTraditionName(val);
          if (ritTrad && !this.ensureTraditionLock(ritTrad, '')) {
            continue;
          }
          const allIdx = this.allaRitualer.indexOf(val);
          if (allIdx >= 0) this.allaRitualer.splice(allIdx, 1);
          if (removeFromKnown) {
            const ritIdx = this.ritualer.indexOf(val);
            if (ritIdx >= 0) this.ritualer.splice(ritIdx, 1);
          }
          this.valdaRitualer.push(val);
          return true;
        }
        return false;
      };
      if (inom === 'innanför') {
        const alt = this.ritualer.slice();
        for (let i = 0; i < antal && alt.length; i += 1) {
          if (!selectFromPool(alt, true)) break;
        }
      } else {
        const alt = this.allaRitualer.filter(rit => !this.ritualer.includes(rit));
        for (let i = 0; i < antal && alt.length; i += 1) {
          if (!selectFromPool(alt, false)) break;
        }
      }
    }

    valjNyaFormagor(ERF, typ) {
      let ERFkvar = ERF;
      let alt = this.formagAlternativ.slice();
      const removeFromAlternativ = (list, value) => list.filter(v => v !== value);
      const removeIncompatible = (value) => {
        getIncompatibleGroups().forEach(grupp => {
          if (grupp.includes(value)) {
            grupp.forEach(formaga => {
              this.formagAlternativ = removeFromAlternativ(this.formagAlternativ, formaga);
              alt = removeFromAlternativ(alt, formaga);
            });
          }
        });
      };

      const takeCorruption = (amount) => {
        if (this.permanentKorruption < this.Karaktarsdrag.Viljestark - amount) {
          this.permanentKorruption += amount;
          return true;
        }
        return false;
      };

      const addMysticChoiceCopies = (name) => {
        if (this.getActiveTraditionLock() && !this.isAllowedByTraditionLock(name)) return;
        const count = this.formagAlternativ.filter(v => v === 'Mystisk kraft').length;
        for (let i = 0; i < count; i += 1) {
          this.formagAlternativ.push(name);
          alt.push(name);
        }
      };

      const getRitualPoolSize = (mode) => {
        if (mode === 'innanför') return this.ritualer.length;
        const pool = this.allaRitualer.filter(rit => !this.ritualer.includes(rit));
        return pool.length;
      };

      const learnRandomRitual = () => {
        if (ERFkvar < 10) return false;
        const activeTradition = this.traditionTag || resolveTraditionName(this.traditionLock) || this.traditionLock || '';
        let mode = (!activeTradition) ? 'utanför' : (Math.random() > 0.7 ? 'utanför' : 'innanför');
        if (this.getActiveTraditionLock()) mode = 'innanför';
        if (mode === 'innanför' && !getRitualPoolSize('innanför')) mode = 'utanför';
        if (!getRitualPoolSize(mode)) return false;
        if (mode === 'utanför' && !takeCorruption(1)) return false;
        ERFkvar -= 10;
        this.valjRitual(1, mode);
        return true;
      };

      const learnNovis = (rawVal) => {
        if (!rawVal || ERFkvar < 10) return false;
        let val = rawVal;
        if (!this.isAbilityAllowedByStats(val)) return false;
        if (val === 'Mystisk kraft') {
          if (takeCorruption(1) && this.allaKrafter.length) {
            const allowed = this.allaKrafter.filter(name => this.isMysticLevelAllowed(name, 'Novis'));
            if (!allowed.length) return false;
            const idx = randIndex(allowed.length);
            val = allowed[idx];
            const poolIdx = this.allaKrafter.indexOf(val);
            if (poolIdx >= 0) this.allaKrafter.splice(poolIdx, 1);
            const powerTrad = getAbilityTraditionName(val);
            if (powerTrad && !this.ensureTraditionLock(powerTrad, '')) return false;
            addMysticChoiceCopies(val);
          } else {
            return false;
          }
        } else if (val === 'Ritualist') {
          return learnRandomRitual();
        } else {
          const abilityTrad = getAbilityTraditionName(val);
          if (abilityTrad) {
            if (!this.isMysticLevelAllowed(val, 'Novis')) return false;
            if (!this.ensureTraditionLock(abilityTrad, val)) return false;
            this.tradition = val;
            this.Formagor[val] = 'Novis';
            this.krafter.forEach(kraft => addMysticChoiceCopies(kraft));
            ERFkvar -= 10;
            removeIncompatible(val);
            return true;
          }
        }
        if (!this.isMysticLevelAllowed(val, 'Novis')) return false;
        const currentTradition = this.traditionTag || resolveTraditionName(this.traditionLock) || this.traditionLock || '';
        const isSvartkonst = normalizeName(currentTradition) === 'svartkonst';
        if (this.krafter.includes(val) && isSvartkonst) {
          if (!takeCorruption(1)) return false;
        }
        this.Formagor[val] = 'Novis';
        ERFkvar -= 10;
        removeIncompatible(val);
        return true;
      };
      const promoteAbility = (val, currentLevel) => {
        const nextLevel = currentLevel === 'Gesäll' ? 'Mästare' : 'Gesäll';
        const cost = currentLevel === 'Gesäll' ? 30 : 20;
        if (ERFkvar < cost) return false;
        if (!this.isMysticLevelAllowed(val, nextLevel)) return false;
        let kbk = true;
        if (this.allaKrafter.includes(val)) {
          const isSvartkonst = normalizeName(this.traditionTag) === 'svartkonst';
          if (!this.traditionTag || isSvartkonst) {
            if (takeCorruption(1)) {
              this.Formagor[val] = nextLevel;
              ERFkvar -= cost;
            } else {
              kbk = false;
            }
          } else if (this.krafter.includes(val)) {
            if (this.tradition && this.Formagor[this.tradition] === nextLevel) {
              this.Formagor[val] = nextLevel;
              ERFkvar -= cost;
            } else if (Math.random() > 0.7 && takeCorruption(1)) {
              this.Formagor[val] = nextLevel;
              ERFkvar -= cost;
            } else {
              kbk = false;
            }
          } else if (takeCorruption(1)) {
            this.Formagor[val] = nextLevel;
            ERFkvar -= cost;
          } else {
            kbk = false;
          }
        } else {
          this.Formagor[val] = nextLevel;
          ERFkvar -= cost;
        }
        if (kbk) removeIncompatible(val);
        return kbk;
      };

      const ensureAbilityLevel = (name, targetLevel) => {
        if (!name) return true;
        if (!this.Formagor[name]) {
          if (!learnNovis(name)) return false;
        }
        const desired = targetLevel && LEVEL_VALUE[targetLevel] ? targetLevel : 'Novis';
        let guard = 0;
        while (LEVEL_VALUE[this.Formagor[name] || ''] < LEVEL_VALUE[desired] && guard < 5) {
          const current = this.Formagor[name];
          if (!promoteAbility(name, current)) return false;
          guard += 1;
        }
        return LEVEL_VALUE[this.Formagor[name] || ''] >= LEVEL_VALUE[desired];
      };

      const ensureRitualWithLocalBudget = (name) => {
        const key = normalizeName(name);
        if (!key) return false;
        if (!Array.isArray(this.valdaRitualer)) this.valdaRitualer = [];
        if (this.valdaRitualer.some(rit => normalizeName(rit) === key)) return true;
        const entry = lookupEntryByName(name);
        if (entry && !(entry.taggar?.typ || []).includes('Ritual')) return false;
        if (ERFkvar < 10) return false;
        const displayName = entry?.namn || name;
        if (!displayName) return false;
        ERFkvar -= 10;
        this.valdaRitualer.push(displayName);
        return true;
      };

      const handleForcedRequirement = () => {
        const req = this.getPendingForcedAbility();
        if (!req) return false;
        const ok = this.resolveForcedRequirement(req, {
          ensureAbilityLevel,
          ensureRitual: ensureRitualWithLocalBudget
        });
        if (ok) {
          req.done = true;
          return true;
        }
        req.failed = true;
        return false;
      };

      const isAbilityCompatibleWithCurrent = (name) => {
        return getIncompatibleGroups().every(grupp => {
          if (!grupp.includes(name)) return true;
          return !grupp.some(val => this.Formagor[val]);
        });
      };

      const tryFallbackPromotion = () => {
        const options = Object.keys(this.Formagor)
          .filter(name => (this.Formagor[name] === 'Novis' && ERFkvar >= 20) || (this.Formagor[name] === 'Gesäll' && ERFkvar >= 30));
        if (!options.length) return false;
        const list = options.slice();
        while (list.length) {
          const idx = randIndex(list.length);
          const val = list.splice(idx, 1)[0];
          if (!val) continue;
          const ok = promoteAbility(val, this.Formagor[val]);
          if (ok) return true;
        }
        return false;
      };

      const tryFallbackNewAbility = () => {
        if (ERFkvar < 10) return false;
        const known = new Set(Object.keys(this.Formagor));
        const pool = getAbilityPool()
          .map(item => item.name)
          .filter(Boolean)
          .filter(name => !known.has(name))
          .filter(name => this.isAbilityAllowedByStats(name))
          .filter(name => this.isAllowedByTraditionLock(name))
          .filter(name => isAbilityCompatibleWithCurrent(name));
        if (!pool.length) return false;
        const picks = pool.slice();
        while (picks.length && ERFkvar >= 10) {
          const idx = randIndex(picks.length);
          const val = picks.splice(idx, 1)[0];
          if (!val) continue;
          if (learnNovis(val)) return true;
        }
        return false;
      };

      const forceFallbackSpending = () => {
        let guard = 0;
        while (ERFkvar >= 10 && guard < 200) {
          if (handleForcedRequirement()) continue;
          if (tryFallbackPromotion()) {
            guard += 1;
            continue;
          }
          if (!tryFallbackNewAbility()) break;
          guard += 1;
        }
      };

      const exhaustRemainingXP = () => {
        let guard = 0;
        while (ERFkvar >= 30 && guard < 50) {
          const list = Object.keys(this.Formagor).filter(name => this.Formagor[name] === 'Gesäll');
          if (!list.length) break;
          const val = list[randIndex(list.length)];
          if (!promoteAbility(val, 'Gesäll')) {
            guard += 1;
            continue;
          }
          guard += 1;
        }
        guard = 0;
        while (ERFkvar >= 20 && guard < 50) {
          const list = Object.keys(this.Formagor).filter(name => this.Formagor[name] === 'Novis');
          if (!list.length) break;
          const val = list[randIndex(list.length)];
          if (!promoteAbility(val, 'Novis')) {
            guard += 1;
            continue;
          }
          guard += 1;
        }
        if (ERFkvar >= 10) {
          forceFallbackSpending();
        }
      };

      if (typ === 'Mästare') {
        while (ERFkvar >= 10) {
          if (handleForcedRequirement()) continue;
          const alt1 = [];
          const alt2 = [];
          const alt3 = [];
          alt.forEach(formaga => {
            if (this.Formagor[formaga] === 'Gesäll') alt1.push(formaga);
            else if (this.Formagor[formaga] === 'Novis') alt2.push(formaga);
            else alt3.push(formaga);
          });
          const span1 = alt1.length;
          const span2 = alt2.length;
          const span3 = alt3.length;
          if (span1 && ERFkvar >= 30) {
            const val = alt1[randIndex(span1)];
            promoteAbility(val, 'Gesäll');
          } else if (span2 && ERFkvar >= 20) {
            const val = alt2[randIndex(span2)];
            promoteAbility(val, 'Novis');
          } else if (span3) {
            const val = alt3[randIndex(span3)];
            if (!learnNovis(val)) {
              alt = removeFromAlternativ(alt, val);
            }
          } else {
            break;
          }
        }
      } else {
        while (ERFkvar >= 10 && alt.length) {
          if (handleForcedRequirement()) continue;
          const idx = randIndex(alt.length);
          const val = alt[idx];
          let pushedBack = false;
          if (this.Formagor[val]) {
            if (this.Formagor[val] === 'Novis' && ERFkvar >= 20) {
              if (promoteAbility(val, 'Novis')) {
                pushedBack = true; // allow possible further promotion later
              }
            } else if (this.Formagor[val] === 'Gesäll' && ERFkvar >= 30) {
              if (promoteAbility(val, 'Gesäll')) {
                pushedBack = true;
              }
            }
          } else {
            if (learnNovis(val)) {
              pushedBack = true; // allow Novis->Gesäll in later passes
            }
          }
          alt = removeFromAlternativ(alt, val);
          if (pushedBack && ERFkvar >= 10) alt.push(val);
        }
      }

      exhaustRemainingXP();
      this.ERFkvar = ERFkvar;
      this.ensureForcedAbilitiesAfterLoop();
      ERFkvar = this.ERFkvar;
    }


    toPayload() {
      const xpBudget = this.totalXPBudget || this.ERF;
      const xpSpentOnPicks = xpBudget - this.ERFkvar;
      const autoAddedNames = Array.from(new Set((this.autoAdded || []).map(item => item.name)));
      return {
        traits: { ...this.Karaktarsdrag },
        abilities: { ...this.Formagor },
        rituals: [...this.valdaRitualer],
        advantages: [...(this.advantagePicks || [])],
        disadvantages: [...(this.disadvantagePicks || [])],
        xpBudget,
        xpSpentOnPicks,
        xpRemaining: this.ERFkvar,
        extraEntries: Array.from(new Set(this.extraPicks || [])),
        autoAdded: autoAddedNames,
        meta: {
          baseXp: this.baseXP || this.ERF,
          race: this.selectedRace?.namn || '',
          yrke: this.selectedYrke?.namn || '',
          elityrke: this.selectedElityrke?.namn || '',
          autoAddedSources: [...(this.autoAdded || [])]
        }
      };
    }
  }

  function lookupEntryByName(name) {
    if ((name === undefined || name === null) || typeof window.lookupEntry !== 'function') return null;
    let query = {};
    if (typeof name === 'object' && !Array.isArray(name)) {
      query = { ...name };
    } else {
      const str = String(name).trim();
      if (!str) return null;
      query = { id: str, name: str };
    }
    if (!query.name && query.id) query.name = query.id;
    try {
      const entry = window.lookupEntry(query);
      return entry ? { ...entry } : null;
    } catch {
      return null;
    }
  }

  function resolveEntryByType(name, type) {
    const entry = lookupEntryByName(name);
    if (!entry) return null;
    if (type) {
      const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      if (!types.includes(type)) return null;
    }
    return { ...entry };
  }

  function getEntriesByType(type) {
    const db = Array.isArray(window.DB) ? window.DB : [];
    return db.filter(entry => Array.isArray(entry?.taggar?.typ) && entry.taggar.typ.includes(type));
  }

  function normalizeName(name) {
    if (!name && name !== 0) return '';
    return String(name).trim().toLowerCase();
  }

  function isMysticProfession(entry) {
    if (!entry) return false;
    const names = toNameArray(entry?.lampliga_formagor).concat(toNameArray(entry?.lampliga));
    return names.some(str => {
      const norm = normalizeName(str);
      return norm.startsWith('mystisk kraft') || norm === 'ritualist';
    });
  }

  function isMysticElityrke(entry) {
    if (!entry) return false;
    const traditionTags = getEntryTraditions(entry).map(normalizeTraditionKey).filter(Boolean);
    const canonical = new Set(getMysticPools().canonicalTraditions.keys());
    const hasKnownTradition = traditionTags.some(tag => canonical.has(tag));
    if (hasKnownTradition) return true;
    const names = toNameArray(entry?.Elityrkesförmågor);
    return names.some(name => {
      const norm = normalizeName(name);
      if (norm.startsWith('mystisk kraft') || norm === 'ritualist') return true;
      return Boolean(getAbilityTraditionName(name));
    });
  }

  function isSelfTaughtMystic(entry) {
    if (!entry) return false;
    const name = normalizeName(entry?.namn);
    return name.includes('självlärd') || name.includes('självlar');
  }

  function getEntryTraditions(entry) {
    const raw = entry?.taggar?.ark_trad;
    if (raw === undefined || raw === null) return [];
    const explode = typeof window.explodeTags === 'function' ? window.explodeTags : null;
    if (explode) {
      const arr = Array.isArray(raw) ? raw : [raw];
      return explode(arr);
    }
    return toNameArray(raw).map(part => part.trim()).filter(Boolean);
  }

  function entryMatchesTradition(entry, tradition) {
    const target = normalizeTraditionKey(tradition);
    if (!target) return true;
    const list = getEntryTraditions(entry);
    if (!list.length) return false;
    return list.some(tag => normalizeTraditionKey(tag) === target);
  }

  function entryMatchesRace(entry, raceEntry) {
    const raceTags = toNameArray(entry?.taggar?.ras).map(normalizeName).filter(Boolean);
    if (!raceTags.length) return true;
    if (!raceEntry) return false;
    const candidates = [
      raceEntry.id,
      raceEntry.namn,
      ...(toNameArray(raceEntry?.taggar?.ras) || [])
    ].map(normalizeName).filter(Boolean);
    if (!candidates.length) return false;
    return raceTags.some(tag => candidates.includes(tag));
  }

  function getEntryArchetypes(entry) {
    return Array.from(new Set(
      getEntryTraditions(entry)
        .map(normalizeTraditionKey)
        .filter(Boolean)
    ));
  }

  function buildArchetypePreferenceSet(...entries) {
    const set = new Set();
    entries.forEach(entry => {
      getEntryArchetypes(entry).forEach(tag => set.add(tag));
    });
    if (set.has('mystiker')) {
      mysticCanonicalKeys().forEach(key => set.add(key));
    }
    return set;
  }

  function expandMysticArchetypes(sourceSet) {
    const result = new Set(sourceSet || []);
    if (result.has('mystiker')) {
      mysticCanonicalKeys().forEach(key => result.add(key));
    }
    return result;
  }

  function getArchetypeWeight(abilityArchetypes, preferredSet) {
    const abilitySet = expandMysticArchetypes(new Set(abilityArchetypes || []));
    if (!abilitySet.size) return 2; // No ark_trad: medium priority
    const prefs = expandMysticArchetypes(preferredSet || new Set());
    const hasMatch = Array.from(abilitySet).some(tag => prefs.has(tag));
    if (hasMatch) return 3; // Best: matches selected race/yrke/elityrke
    return 1; // Worst: differs from chosen archetype/tradition
  }

  function isMysticEntry(entry) {
    return (entry?.taggar?.typ || []).includes('Mystisk kraft');
  }

  function isRitualEntry(entry) {
    return (entry?.taggar?.typ || []).includes('Ritual');
  }

  function entryIsTraditionExclusive(entry) {
    if (!entry) return false;
    const tags = entry?.taggar || {};
    if (tags.exklusiv_tradition) return true;
    if (tags.traditionslås) return true;
    if (Array.isArray(tags.exklusiv)) {
      return tags.exklusiv.some(val => normalizeName(val) === 'tradition');
    }
    if (isMysticEntry(entry) || isRitualEntry(entry)) return true;
    if (getAbilityTraditionName(entry.namn)) return true;
    return false;
  }

  function entryAllowsMultiple(entry) {
    if (!entry) return false;
    if (entry.kan_införskaffas_flera_gånger) return true;
    const tags = entry.taggar || {};
    if (tags.kan_införskaffas_flera_gånger) return true;
    return false;
  }

  function filterNamesByTradition(list, tradition) {
    const key = normalizeTraditionKey(tradition);
    if (!key) return Array.isArray(list) ? list.slice() : [];
    const arr = Array.isArray(list) ? list : [];
    return arr.filter(name => {
      const entry = lookupEntryByName(name);
      if (!entry) return true;
      return entryMatchesTradition(entry, key);
    });
  }

  function toNameArray(value) {
    if (!value && value !== 0) return [];
    if (Array.isArray(value)) {
      return value.flatMap(item => toNameArray(item)).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .replace(/\beller\b/gi, ',')
        .replace(/\boch\b/gi, ',')
        .split(/[,;/]/)
        .map(part => part.replace(/[\*]/g, '').trim())
        .filter(Boolean);
    }
    return [];
  }

  function getYrkeTraditionName(entry) {
    const name = normalizeName(entry?.namn);
    if (!name) return '';
    const match = YRKE_TRADITION_PAIRS.find(pair => pair[0] === name);
    return match ? match[1] : '';
  }

  function getTraditionBaseAbilityName(tradition) {
    const key = normalizeTraditionKey(tradition);
    if (!key) return '';
    const match = TRADITION_BASE_ABILITY_PAIRS.find(pair => normalizeTraditionKey(pair[0]) === key);
    return match ? match[1] : '';
  }

  function getTraditionFromBaseAbility(name) {
    const norm = normalizeName(name);
    if (!norm) return '';
    const match = TRADITION_BASE_ABILITY_PAIRS.find(pair => normalizeName(pair[1]) === norm);
    return match ? resolveTraditionName(match[0]) || match[0] : '';
  }

  function parseElityrkeRequirementGroups(text) {
    const extParser = window.eliteAdd?.parseGroupRequirements;
    if (typeof extParser === 'function') {
      try {
        const res = extParser(text || '');
        if (Array.isArray(res)) return res;
      } catch {}
    }
    return fallbackRequirementGroups(text || '');
  }

  function fallbackRequirementGroups(rawText) {
    const rawGroups = splitRequirementComma(rawText).map(segment => splitRequirementOr(segment));
    const out = [];
    rawGroups.forEach(group => {
      let hasAnyMystic = false;
      let hasAnyRitual = false;
      const names = new Set();
      group.forEach(part => {
        expandRequirementPart(part).forEach(val => {
          if (val.anyMystic) {
            hasAnyMystic = true;
            return;
          }
          if (val.anyRitual) {
            hasAnyRitual = true;
            return;
          }
          (val.names || []).forEach(name => {
            const trimmed = String(name || '').trim();
            if (trimmed) names.add(trimmed);
          });
        });
      });
      if (hasAnyMystic) {
        out.push({ anyMystic: true });
        return;
      }
      if (hasAnyRitual && names.size === 0) {
        out.push({ anyRitual: true });
        return;
      }
      const list = Array.from(names);
      if (!list.length) return;
      const allRitual = list.every(name => {
        const entry = lookupEntryByName(name);
        return (entry?.taggar?.typ || []).includes('Ritual');
      });
      out.push({ names: list, allRitual });
    });
    return out;
  }

  function splitRequirementComma(str) {
    const result = [];
    let buf = '';
    let depth = 0;
    const input = String(str || '');
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';') && depth === 0) {
        if (buf.trim()) result.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) result.push(buf.trim());
    return result;
  }

  function splitRequirementOr(str) {
    const result = [];
    let buf = '';
    let depth = 0;
    const input = String(str || '');
    const lower = input.toLowerCase();
    for (let i = 0; i < input.length;) {
      if (lower.startsWith(' eller ', i) && depth === 0) {
        if (buf.trim()) result.push(buf.trim());
        buf = '';
        i += 7;
        continue;
      }
      const ch = input[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      buf += ch;
      i += 1;
    }
    if (buf.trim()) result.push(buf.trim());
    return result.length ? result : [''];
  }

  function expandRequirementPart(raw) {
    const name = String(raw || '').trim();
    if (!name) return [];
    const mysticMatch = name.match(/^Mystisk kraft\s*\(([^)]+)\)/i);
    if (mysticMatch) {
      const inner = mysticMatch[1].trim();
      if (inner.toLowerCase() === 'valfri') return [{ anyMystic: true }];
      return expandRequirementOptions(inner);
    }
    const ritualMatch = name.match(/^Ritualist\s*\(([^)]+)\)/i);
    if (ritualMatch) {
      const inner = ritualMatch[1].trim();
      if (inner.toLowerCase() === 'valfri') return [{ anyRitual: true }];
      return expandRequirementOptions(inner);
    }
    if (/^Ritualist$/i.test(name)) return [{ anyRitual: true }];
    return [{ names: [name] }];
  }

  function expandRequirementOptions(inner) {
    const opts = [];
    splitRequirementComma(inner).forEach(segment => {
      splitRequirementOr(segment).forEach(val => {
        const nm = String(val || '').trim();
        if (nm) opts.push({ names: [nm] });
      });
    });
    return opts;
  }

  function getAbilitiesMatchingTrait(trait) {
    const key = normalizeName(trait);
    if (!key) return [];
    return getEntriesByType('Förmåga')
      .filter(entry => toNameArray(entry?.taggar?.test).some(test => normalizeName(test).includes(key)))
      .map(entry => entry.namn)
      .filter(Boolean);
  }

  function normalizeAttributeName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    const match = ATTR_KEYS.find(attr => attr.toLowerCase() === lower);
    return match || raw;
  }

  function getAbilityPool() {
    if (dataCache.abilityPool) return dataCache.abilityPool;
    const pool = [];
    const seen = new Set();
    const pushEntry = (name, tests, archetypes) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const normalized = (tests || []).map(normalizeAttributeName).filter(Boolean);
      pool.push({ name, tests: normalized, archetypes: archetypes || [] });
    };
    getEntriesByType('Förmåga').forEach(entry => {
      const name = entry?.namn;
      if (!name) return;
      if ((entry?.taggar?.typ || []).includes('Elityrkesförmåga')) return;
      const tests = toNameArray(entry?.taggar?.test);
      const archetypes = getEntryArchetypes(entry);
      pushEntry(name, tests, archetypes);
    });
    pushEntry('Ritualist', ['Viljestark'], []);
    pushEntry('Mystisk kraft', ['Viljestark'], []);
    dataCache.abilityPool = pool;
    return pool;
  }

  function mapSetToArrayMap(source) {
    const out = new Map();
    source.forEach((set, key) => {
      out.set(key, Array.from(set));
    });
    return out;
  }

  function getMysticPools() {
    if (dataCache.mystic) return dataCache.mystic;
    const canonical = new Map();
    const registerTradition = (value) => {
      const norm = normalizeName(value);
      if (!norm) return '';
      if (!canonical.has(norm)) canonical.set(norm, value);
      return canonical.get(norm);
    };
    const powersByTrad = new Map();
    const ritualsByTrad = new Map();
    const allPowers = new Set();
    const allRituals = new Set();
    const assignEntry = (entry, targetMap, targetSet) => {
      const name = entry?.namn;
      if (!name) return;
      targetSet.add(name);
      const tags = getEntryTraditions(entry);
      if (!tags.length) {
        if (!targetMap.has('')) targetMap.set('', new Set());
        targetMap.get('').add(name);
        return;
      }
      tags.forEach(tag => {
        const canon = registerTradition(tag);
        const norm = normalizeName(canon);
        if (!norm) return;
        if (!targetMap.has(norm)) targetMap.set(norm, new Set());
        targetMap.get(norm).add(name);
      });
    };
    getEntriesByType('Mystisk kraft').forEach(entry => assignEntry(entry, powersByTrad, allPowers));
    getEntriesByType('Ritual').forEach(entry => assignEntry(entry, ritualsByTrad, allRituals));
    const abilityTraditions = new Map();
    const registerAbilityTrad = (entry) => {
      const name = entry?.namn;
      const id = normalizeName(entry?.id || name);
      if (!name || !id) return;
      const tags = getEntryTraditions(entry);
      tags.forEach(tag => {
        const canon = registerTradition(tag);
        const norm = normalizeName(canon);
        if (!norm) return;
        abilityTraditions.set(id, canon);
        const nameKey = normalizeName(name);
        if (nameKey && nameKey !== id) abilityTraditions.set(nameKey, canon);
      });
    };
    getEntriesByType('Mystisk kraft').forEach(registerAbilityTrad);
    getEntriesByType('Ritual').forEach(registerAbilityTrad);
    dataCache.mystic = {
      canonicalTraditions: canonical,
      abilityTraditions,
      powersByTradition: mapSetToArrayMap(powersByTrad),
      ritualsByTradition: mapSetToArrayMap(ritualsByTrad),
      allPowers: Array.from(allPowers),
      allRituals: Array.from(allRituals)
    };
    return dataCache.mystic;
  }

  function normalizeTraditionKey(name) {
    if (name === undefined || name === null) return '';
    const trimmed = String(name).trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower === 'ingen' || lower === 'none') return '';
    const norm = normalizeName(trimmed);
    if (!norm) return '';
    const meta = getMysticPools();
    if (meta.canonicalTraditions.has(norm)) return norm;
    if (meta.abilityTraditions.has(norm)) {
      const canon = meta.abilityTraditions.get(norm);
      return normalizeName(canon);
    }
    return norm;
  }

  function resolveTraditionName(name) {
    const key = normalizeTraditionKey(name);
    if (!key) return '';
    const meta = getMysticPools();
    return meta.canonicalTraditions.get(key) || '';
  }

  function resolveTraditionFromName(raw) {
    if (!raw && raw !== 0) return '';
    const cleaned = String(raw).replace(/\(.*?\)/g, '').trim();
    if (!cleaned) return '';
    const fromName = resolveTraditionName(cleaned);
    if (fromName) return fromName;
    return getAbilityTraditionName(cleaned);
  }

  function getAbilityTraditionName(name) {
    const meta = getMysticPools();
    const entry = lookupEntryByName(name);
    if (entry) {
      const tags = getEntryTraditions(entry);
      for (let i = 0; i < tags.length; i += 1) {
        const resolved = resolveTraditionName(tags[i]);
        if (resolved) return resolved;
      }
      if (isMysticEntry(entry) || isRitualEntry(entry)) {
        const key = normalizeName(entry.id || entry.namn);
        if (key) {
          const viaId = meta.abilityTraditions.get(key);
          if (viaId) return viaId;
        }
      }
    }
    const viaBaseAbility = getTraditionFromBaseAbility(name);
    if (viaBaseAbility) return viaBaseAbility;
    const norm = normalizeName(name);
    if (!norm) return '';
    const viaAbility = meta.abilityTraditions.get(norm);
    if (viaAbility) return viaAbility;
    return meta.canonicalTraditions.get(norm) || '';
  }

  function getTraditionAbilityNames() {
    return getAbilityPool()
      .map(item => item.name)
      .filter(name => Boolean(getAbilityTraditionName(name)));
  }

  function getIncompatibleGroups() {
    const groups = [];
    const tradNames = getTraditionAbilityNames();
    if (tradNames.length) groups.push(tradNames);
    STATIC_INCOMPATIBLE_GROUPS.forEach(group => groups.push(group));
    return groups;
  }

  function buildEntryList(payload) {
    const list = [];
    Object.entries(payload.abilities || {}).forEach(([name, level]) => {
      const entry = lookupEntryByName(name);
      if (!entry) return;
      entry.nivå = level;
      list.push(entry);
    });
    (payload.rituals || []).forEach(name => {
      const entry = lookupEntryByName(name);
      if (entry) list.push(entry);
    });
    (payload.extraEntries || []).forEach(name => {
      const entry = lookupEntryByName(name);
      if (entry) list.push(entry);
    });
    return list;
  }

  function generateCharacter(options = {}) {
    const char = new SymbaroumCharacter(options);
    const payload = char.toPayload();
    return {
      ...payload,
      list: buildEntryList(payload)
    };
  }

  window.symbaroumGenerator = {
    generate: generateCharacter,
    ATTR_KEYS
  };
})(window);
