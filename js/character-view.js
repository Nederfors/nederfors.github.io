(function (window) {
  const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';
  const uiPrefs = window.symbaroumUiPrefs || window.localStorage;
  const getUiPref = (key) => {
    try {
      return uiPrefs?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  };
  const setUiPref = (key, value) => {
    try {
      uiPrefs?.setItem?.(key, value);
    } catch {}
  };
  let characterInitController = null;
  let characterInitToken = 0;

  const quoteName = (value) => {
    const str = String(value ?? '').trim();
    return str ? `“${str}”` : '';
  };

  function makeHardStop(code, message, label = '', value = '') {
    return { code, message, label, value };
  }

  function getEntryMaxCount(entry) {
    if (typeof window.storeHelper?.getEntryMaxCount === 'function') {
      return Math.max(1, Number(window.storeHelper.getEntryMaxCount(entry)) || 1);
    }
    if (typeof window.rulesHelper?.getEntryMaxCount === 'function') {
      return Math.max(1, Number(window.rulesHelper.getEntryMaxCount(entry)) || 1);
    }
    const raw = Number(entry?.taggar?.max_antal);
    if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    return 1;
  }

  async function confirmRuleStopOverride(entryName, stopResult, action = 'add') {
    const messages = typeof window.rulesHelper?.formatEntryStopMessages === 'function'
      ? window.rulesHelper.formatEntryStopMessages(entryName, stopResult || {})
      : [];
    if (!messages.length) return true;
    const label = quoteName(entryName) || 'posten';
    const actionLine = action === 'level-change'
      ? `Vill du ändra nivån för ${label} ändå?`
      : `Vill du lägga till ${label} ändå?`;
    const text = `Karaktären möter inte följande krav:\n- ${messages.join('\n- ')}\n\n${actionLine}`;
    return !!(await confirmPopup(text));
  }

  async function resolveRuleStopDecision(entryName, candidateEntry, list, stopResult, action = 'add', options = {}) {
    const popup = window.requirementPopup;
    const popupLevel = options?.toLevel || options?.level || candidateEntry?.nivå || '';
    const skipRequirementPopup = typeof window.rulesHelper?.shouldSkipRequirementPopup === 'function'
      ? window.rulesHelper.shouldSkipRequirementPopup(candidateEntry, {
        action,
        level: popupLevel
      })
      : false;
    const preferDialogFallback = Array.isArray(window.__testDialogMessages);
    if (!skipRequirementPopup && !preferDialogFallback && popup && typeof popup.open === 'function' && candidateEntry && Array.isArray(list)) {
      const title = action === 'level-change'
        ? `Lås upp nivåändring för ${quoteName(entryName) || 'posten'}`
        : `Lås upp ${quoteName(entryName) || 'posten'}`;
      const subtitle = action === 'level-change'
        ? 'Välj krav som ska läggas till eller höjas för att låsa upp nivåändringen. Du kan också fortsätta med override.'
        : 'Välj krav som ska läggas till eller höjas för att låsa upp posten. Du kan också fortsätta med override.';
      const result = await popup.open({
        title,
        subtitle,
        entryName,
        candidate: candidateEntry,
        list,
        action,
        level: options?.level || candidateEntry?.nivå || '',
        fromLevel: options?.fromLevel || '',
        toLevel: options?.toLevel || candidateEntry?.nivå || '',
        replaceTargetUid: options?.replaceTargetUid || '',
        overrideLabel: action === 'level-change' ? 'Ändra ändå' : 'Lägg till ändå'
      });
      if (result && typeof result === 'object' && typeof result.action === 'string') {
        return result;
      }
    }

    const approved = await confirmRuleStopOverride(entryName, stopResult, action);
    return {
      action: approved ? 'override' : 'cancel',
      selectedKeys: [],
      state: null
    };
  }

  async function handleSnapshotEntryRemoval(entry, store) {
    if (!entry || typeof entry !== 'object') return true;
    const helper = window.snapshotHelper;
    const impacts = typeof helper?.getEntryRemovalImpacts === 'function'
      ? helper.getEntryRemovalImpacts(store, entry)
      : [];
    const decision = typeof helper?.confirmRemovalDecision === 'function'
      ? await helper.confirmRemovalDecision(impacts)
      : 'noop';
    if (decision === 'cancel') return false;
    if (decision === 'remove') {
      impacts.forEach(impact => window.storeHelper?.removeSnapshotRulesBySource?.(store, impact.sourceKey));
      return true;
    }
    if (decision === 'detach') {
      impacts.forEach(impact => window.storeHelper?.detachSnapshotRulesBySource?.(store, impact.sourceKey));
    }
    return true;
  }

  function initCharacter() {
    characterInitController?.abort();
    characterInitController = new AbortController();
    const { signal } = characterInitController;
    const initToken = String(++characterInitToken);
    const createEntryCard = window.entryCardFactory.create;
    dom.cName.textContent = store.characters.find(c => c.id === store.current)?.name || '';

    const F = { search: [], typ: [], ark: [], test: [] };
    const splitArkTags = (value) => {
      if (typeof window.splitTags === 'function') return window.splitTags(value);
      const source = Array.isArray(value)
        ? value
        : ((value === undefined || value === null) ? [] : [value]);
      return source
        .flatMap(v => String(v ?? '').split(',').map(t => t.trim()))
        .filter(Boolean);
    };
    const readEntryTests = (entry, level) => {
      if (!entry) return [];
      if (typeof window.getEntryTestTags === 'function') {
        return window.getEntryTestTags(entry, { level });
      }
      const tags = entry.taggar || {};
      const lvlData = tags.nivå_data || tags.niva_data || {};
      const normalizedLevel = String(level || '').trim();
      if (normalizedLevel && Array.isArray(lvlData[normalizedLevel]?.test)) {
        return lvlData[normalizedLevel].test;
      }
      if (Array.isArray(lvlData.Enkel?.test)) return lvlData.Enkel.test;
      return Array.isArray(tags.test) ? tags.test : [];
    };
    const ONLY_SELECTED_VALUE = '__onlySelected';
    const ONLY_SELECTED_LABEL = 'Endast valda';
    const bindCharacterMotionTargets = () => {
      const bind = window.daubMotion?.bindAutoAnimate;
      if (typeof bind !== 'function' || !dom.valda) return;
      dom.valda.querySelectorAll('.cat-group > details > ul').forEach(listEl => {
        bind(listEl, { duration: 100 });
      });
    };
    let sTemp = '';
    let union = storeHelper.getFilterUnion(store);
    if (typeof window.setDaubSwitchState === 'function') {
      window.setDaubSwitchState(dom.filterUnion, union);
    } else {
      dom.filterUnion.classList.toggle('active', union);
    }
    let compact = storeHelper.getCompactEntries(store);
    if (typeof window.setDaubSwitchState === 'function') {
      window.setDaubSwitchState(dom.entryViewToggle, !compact);
    } else {
      dom.entryViewToggle.classList.toggle('active', !compact);
    }
    // Open matching categories once after certain actions (search)
    let openCatsOnce = new Set();

    const charId = store.current || 'default';
    const STATE_KEY = `charViewState:${charId}`;
    let catState = {};
    const loadState = () => {
      try { return JSON.parse(getUiPref(STATE_KEY)) || {}; }
      catch { return {}; }
    };
    const saveState = () => {
      try { setUiPref(STATE_KEY, JSON.stringify({ filters: F, cats: catState })); }
      catch { }
    };
    const REMOVE_FLOW_CONTEXT_KEY = 'remove-item';
    const LEVEL_CHANGE_FLOW_CONTEXT_KEY = 'level-change';
    const shouldProfileRemoveActions = () => Boolean(window.__symbaroumPerfCaptureRemovals);
    const shouldProfileLevelChanges = () => Boolean(window.__symbaroumPerfCaptureLevelChanges);
    const getActiveRemoveScenarioId = () => window.symbaroumPerf?.getFlowContext?.(REMOVE_FLOW_CONTEXT_KEY) || null;
    const getActiveLevelScenarioId = () => window.symbaroumPerf?.getFlowContext?.(LEVEL_CHANGE_FLOW_CONTEXT_KEY) || null;
    const timeActiveRemoveStage = (name, callback, detail = {}) => {
      const scenarioId = getActiveRemoveScenarioId();
      const perf = window.symbaroumPerf;
      if (!scenarioId || typeof perf?.timeScenarioStage !== 'function') {
        return callback();
      }
      return perf.timeScenarioStage(scenarioId, name, callback, detail);
    };
    const timeActiveLevelStage = (name, callback, detail = {}) => {
      const scenarioId = getActiveLevelScenarioId();
      const perf = window.symbaroumPerf;
      if (!scenarioId || typeof perf?.timeScenarioStage !== 'function') {
        return callback();
      }
      return perf.timeScenarioStage(scenarioId, name, callback, detail);
    };
    const markActiveLevelCheckpoint = (name, detail = {}) => {
      const scenarioId = getActiveLevelScenarioId();
      const perf = window.symbaroumPerf;
      if (!scenarioId || !name || typeof perf?.markScenario !== 'function') return null;
      return perf.markScenario(scenarioId, name, detail);
    };
    const bindRemoveScenario = (scenarioId, detail = {}) => {
      if (!scenarioId) return null;
      const perf = window.symbaroumPerf;
      perf?.setFlowContext?.(REMOVE_FLOW_CONTEXT_KEY, scenarioId);
      perf?.markScenario?.(scenarioId, 'click-handler-start', detail);
      return scenarioId;
    };
    const bindLevelScenario = (scenarioId, detail = {}) => {
      if (!scenarioId) return null;
      const perf = window.symbaroumPerf;
      perf?.setFlowContext?.(LEVEL_CHANGE_FLOW_CONTEXT_KEY, scenarioId);
      perf?.markScenario?.(scenarioId, 'click-handler-start', detail);
      return scenarioId;
    };
    const cancelRemoveScenario = (scenarioId, detail = {}) => {
      if (!scenarioId) return null;
      const perf = window.symbaroumPerf;
      perf?.clearFlowContext?.(REMOVE_FLOW_CONTEXT_KEY, scenarioId);
      return perf?.cancelScenario?.(scenarioId, detail) || null;
    };
    const cancelLevelScenario = (scenarioId, detail = {}) => {
      if (!scenarioId) return null;
      const perf = window.symbaroumPerf;
      perf?.clearFlowContext?.(LEVEL_CHANGE_FLOW_CONTEXT_KEY, scenarioId);
      return perf?.cancelScenario?.(scenarioId, detail) || null;
    };
    const finishRemoveScenario = async (scenarioId, detail = {}) => {
      if (!scenarioId) return null;
      const perf = window.symbaroumPerf;
      if (window.__symbaroumPerfAwaitFlush && typeof perf?.timeScenarioStage === 'function') {
        await perf.timeScenarioStage(scenarioId, 'persistence-flush', () => (
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'remove-scenario' })
        ), {
          surface: 'character'
        });
      }
      if (typeof perf?.afterNextPaint === 'function') {
        await perf.afterNextPaint(2);
      }
      perf?.markScenario?.(scenarioId, 'post-render-paint-complete', detail);
      perf?.clearFlowContext?.(REMOVE_FLOW_CONTEXT_KEY, scenarioId);
      return perf?.endScenario?.(scenarioId, detail) || null;
    };
    const finishLevelScenario = async (scenarioId, detail = {}) => {
      if (!scenarioId) return null;
      const perf = window.symbaroumPerf;
      if (window.__symbaroumPerfAwaitFlush && typeof perf?.timeScenarioStage === 'function') {
        await perf.timeScenarioStage(scenarioId, 'persistence-flush', () => (
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'character-level-change' })
        ), {
          surface: 'character',
          branch: 'list'
        });
      }
      if (typeof perf?.afterNextPaint === 'function') {
        await perf.afterNextPaint(2);
      }
      perf?.markScenario?.(scenarioId, 'post-render-paint-complete', detail);
      perf?.clearFlowContext?.(LEVEL_CHANGE_FLOW_CONTEXT_KEY, scenarioId);
      return perf?.endScenario?.(scenarioId, detail) || null;
    };
    const runCurrentCharacterMutationBatch = (callback) => {
      if (typeof callback !== 'function') return undefined;
      if (typeof storeHelper?.batchCurrentCharacterMutation === 'function') {
        return storeHelper.batchCurrentCharacterMutation(store, {}, callback);
      }
      return callback();
    };
    const scheduleCharacterMutationRefresh = (options = {}) => {
      if (typeof window.symbaroumMutationPipeline?.scheduleCharacterRefresh === 'function') {
        window.symbaroumMutationPipeline.scheduleCharacterRefresh(options);
        return;
      }
      if (options.xp && typeof window.updateXP === 'function') {
        updateXP({
          afterPaint: false,
          source: options.source || 'character-mutation'
        });
      }
      if (options.traits && typeof window.renderTraits === 'function') {
        renderTraits();
      }
      const refreshOptions = {};
      ['summary', 'effects', 'name', 'filters', 'selection', 'inventory', 'notes', 'traits']
        .forEach((key) => {
          if (options[key]) refreshOptions[key] = true;
        });
      if (Object.keys(refreshOptions).length) {
        window.symbaroumViewBridge?.refreshCurrent({ ...refreshOptions, strict: true });
      }
    };
    const waitForCharacterMutationRefresh = () => (
      window.symbaroumMutationPipeline?.waitForCharacterRefresh?.() || Promise.resolve()
    );
    const waitForDeferredMutationTurn = async (options = {}) => {
      const afterPaint = options.afterPaint !== false;
      if (afterPaint && typeof window.requestAnimationFrame === 'function') {
        await new Promise(resolve => {
          window.requestAnimationFrame(() => {
            window.setTimeout(resolve, 0);
          });
        });
        return;
      }
      await new Promise(resolve => window.setTimeout(resolve, 0));
    };
    const runDeferredCurrentCharacterMutation = async (callback, options = {}) => {
      await waitForDeferredMutationTurn(options);
      return runCurrentCharacterMutationBatch(callback);
    };
    const withBusyInteraction = async (control, callback) => {
      if (typeof callback !== 'function') return undefined;
      if (!control || typeof control !== 'object') return callback();
      if (control.dataset?.mutationBusy === '1') return undefined;
      const card = typeof control.closest === 'function'
        ? control.closest('li.entry-card, li.db-card')
        : null;
      const restoreDisabled = 'disabled' in control ? Boolean(control.disabled) : null;
      if (control.dataset) control.dataset.mutationBusy = '1';
      if (card) {
        card.classList.add('entry-busy');
        card.setAttribute('aria-busy', 'true');
      }
      if (restoreDisabled !== null) {
        control.disabled = true;
      }
      try {
        return await callback();
      } finally {
        if (control.dataset) delete control.dataset.mutationBusy;
        if (card) {
          card.classList.remove('entry-busy');
          card.removeAttribute('aria-busy');
        }
        if (restoreDisabled !== null) {
          control.disabled = restoreDisabled;
        }
      }
    };
    {
      const saved = loadState();
      if (saved.filters) {
        ['search', 'typ', 'ark', 'test'].forEach(k => {
          if (Array.isArray(saved.filters[k])) F[k] = saved.filters[k];
        });
      }
      catState = saved.cats || {};
    }

    const applyQueryFilters = () => {
      if (typeof URLSearchParams !== 'function') return;
      try {
        const params = new URLSearchParams(window.location.search);
        const rawValues = params.getAll('test') || [];
        const collected = [];
        rawValues.forEach(val => {
          String(val || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
            .forEach(v => collected.push(v));
        });
        if (!collected.length) return;

        const deduped = [];
        const seen = new Set();
        collected.forEach(val => {
          if (seen.has(val)) return;
          seen.add(val);
          deduped.push(val);
        });

        F.search = [];
        F.typ = [];
        F.ark = [];
        F.test = deduped;
        storeHelper.setOnlySelected(store, true);
        openCatsOnce.add('Förmåga');
        saveState();
      } catch { }
    };
    applyQueryFilters();

    let catsMinimized = false;
    const updateCatToggle = () => {
      catsMinimized = [...document.querySelectorAll('.cat-group > details')]
        .every(d => !d.open);
      { const ci = dom.catToggle.querySelector('.chevron-icon'); if (ci) ci.classList.toggle('collapsed', catsMinimized); }
      dom.catToggle.title = catsMinimized
        ? 'Öppna alla kategorier'
        : 'Minimera alla kategorier';
    };

    const summaryBtn = document.getElementById('summaryToggle');
    const summaryPanel = document.getElementById('summaryPanel');
    const summaryClose = document.getElementById('summaryClose');
    const summaryContent = document.getElementById('summaryContent');
    const effectsBtn = document.getElementById('effectsToggle');
    const effectsPanel = document.getElementById('effectsPanel');
    const effectsClose = document.getElementById('effectsClose');
    const effectsContent = document.getElementById('effectsContent');

    const EFFECT_SECTION_LABELS = new Map([
      ['Fördel', 'Fördelar'],
      ['Nackdel', 'Nackdelar'],
      ['Förmåga', 'Förmågor'],
      ['Basförmåga', 'Förmågor'],
      ['Mystisk kraft', 'Mystiska krafter'],
      ['Ritual', 'Ritualer'],
      ['Särdrag', 'Särdrag'],
      ['Monstruöst särdrag', 'Monstruösa särdrag'],
      ['Yrke', 'Yrken'],
      ['Elityrke', 'Elityrken'],
      ['Ras', 'Raser'],
      ['Artefakt', 'Artefakter'],
      ['L\u00e4gre Artefakt', 'L\u00e4gre artefakter'],
      ['Närstridsvapen', 'Vapen'],
      ['Avståndsvapen', 'Vapen'],
      ['Vapen', 'Vapen'],
      ['Rustning', 'Rustningar'],
      ['Sköld', 'Sköldar'],
      ['Elixir', 'Elixir'],
      ['Specialverktyg', 'Specialverktyg'],
      ['Förvaring', 'Förvaring'],
      ['Instrument', 'Instrument'],
      ['F\u00e4rdmedel', 'F\u00e4rdmedel'],
      ['G\u00e5rdsdjur', 'G\u00e5rdsdjur'],
      ['Byggnad', 'Byggnader'],
      ['Anst\u00e4llning', 'Anst\u00e4llningar'],
      ['Tj\u00e4nst', 'Tj\u00e4nster'],
      ['Mat', 'Mat'],
      ['Dryck', 'Dryck'],
      ['Kuriositet', 'Kuriositeter'],
      ['Skatt', 'Skatter'],
      ['Diverse', 'Diverse'],
      ['F\u00e4lla', 'F\u00e4llor'],
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
      'L\u00e4gre artefakter',
      'Elixir',
      'Specialverktyg',
      'Förvaring',
      'Instrument',
      'F\u00e4rdmedel',
      'G\u00e5rdsdjur',
      'Byggnader',
      'Anst\u00e4llningar',
      'Tj\u00e4nster',
      'Mat',
      'Dryck',
      'Kuriositeter',
      'Skatter',
      'Diverse',
      'F\u00e4llor',
      'Kvaliteter',
      'Mystiska kvaliteter',
      'Neutrala kvaliteter',
      'Negativa kvaliteter',
      'Övrigt'
    ];

    const DOCK_TAG_TYPES = new Set(['Fördel', 'Nackdel', 'Särdrag', 'Monstruöst särdrag', 'Ritual', 'Mystisk kraft', 'Förmåga', 'Basförmåga']);

    const levelLetter = (lvl) => {
      const text = String(lvl || '').trim();
      if (!text) return '';
      if (text === 'Mästare') return 'M';
      if (text === 'Gesäll') return 'G';
      if (text === 'Novis') return 'N';
      return text.charAt(0).toUpperCase();
    };

    const renderFilterTag = (tag, extra = '') => `<span class="db-chip filter-tag" data-section="${tag.section}" data-val="${tag.value}"${extra}>${tag.label}</span>`;

    const renderDockedTags = (tags, extraClass = '') => {
      if (!Array.isArray(tags) || !tags.length) return '';
      const cls = ['entry-tags', extraClass].filter(Boolean).join(' ');
      return `<div class="${cls}">${tags.map(tag => renderFilterTag(tag)).join('')}</div>`;
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));

    const resolveDbEntry = (entry) => {
      if (!entry) return null;
      const hit = typeof lookupEntry === 'function' ? lookupEntry(entry) : null;
      return hit || null;
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

    const getEntryChoiceDisplay = (entry, context = {}) => {
      if (typeof window.rulesHelper?.getEntryChoiceDisplay !== 'function') return null;
      try {
        return window.rulesHelper.getEntryChoiceDisplay(entry, context) || null;
      } catch (_) {
        return null;
      }
    };

    const abilityDisplayName = (entry, context = {}) => {
      if (typeof window.rulesHelper?.formatEntryDisplayName === 'function') {
        try {
          const formatted = window.rulesHelper.formatEntryDisplayName(entry, {
            ...context,
            includeChoice: true,
            includeLevel: true
          });
          if (formatted) return formatted;
        } catch (_) {
          // Fall back to legacy formatting below.
        }
      }
      const base = entry?.namn ? String(entry.namn).trim() : 'Okänd post';
      const parts = [];
      if (entry?.trait) parts.push(String(entry.trait).trim());
      const lvl = String(entry?.nivå || '').trim();
      if (lvl) parts.push(lvl);
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
      let allQuals = [...baseQuals, ...extraQuals];
      if (typeof window.enforceArmorQualityExclusion === 'function') {
        allQuals = window.enforceArmorQualityExclusion(entry, allQuals);
      }
      const seenQuals = new Set();
      allQuals.forEach(name => {
        const clean = String(name || '').trim();
        if (!clean || seenQuals.has(clean)) return;
        seenQuals.add(clean);
        const qEntry = lookupEntry({ id: clean, name: clean });
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

      const currentEntries = storeHelper.getCurrentList(store) || [];
      const abilityMap = new Map();
      currentEntries
        .filter(entry => !isInv(entry)).
        forEach(entry => {
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
          const choiceMeta = getEntryChoiceDisplay(entry, {
            list: currentEntries,
            sourceEntry: baseEntry || entry,
            level: entry?.nivå || ''
          });
          if (choiceMeta?.field) {
            const choiceValueKey = String(choiceMeta.value ?? '').trim().toLowerCase();
            keyParts.push(`choice:${choiceMeta.field}:${choiceValueKey}`);
          } else if (entry?.trait) {
            keyParts.push(`trait:${entry.trait}`);
          }
          if (entry?.nivå) keyParts.push(`lvl:${entry.nivå}`);
          if (!keyParts.length) keyParts.push(`name:${baseName}`);
          const key = keyParts.join('|');
          let bucket = abilityMap.get(key);
          if (!bucket) {
            bucket = {
              section,
              label: abilityDisplayName(entry, {
                list: currentEntries,
                sourceEntry: baseEntry || entry,
                level: entry?.nivå || ''
              }),
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
          : (lookupEntry({ id: row?.id, name: row?.name }) || {});
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

      const result = [...sections.values()];
      result.sort((a, b) => sectionIndex(a.label) - sectionIndex(b.label) || a.label.localeCompare(b.label, 'sv'));
      result.forEach(section => {
        section.entries.sort((a, b) => a.label.localeCompare(b.label, 'sv'));
      });
      return result.filter(section => section.entries.length);
    };

    const renderEffects = () => {
      if (!effectsContent) return;
      const sections = collectEffectsData();
      if (!sections.length) {
        effectsContent.innerHTML = '<p>Inga effekter att visa för den här rollpersonen.</p>';
        return;
      }
      const html = sections.map(section => {
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
      effectsContent.innerHTML = html;
    };

    const refreshEffectsPanel = () => {
      if (effectsPanel?.classList.contains('open')) {
        renderEffects();
      }
    };

    // Rensa allt utom inventariet (suddgummi)
    const clearBtn = document.getElementById('clearNonInv');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!store.current && !(await requireCharacter())) return;
        const removeScenarioId = shouldProfileRemoveActions()
          ? window.symbaroumPerf?.startScenario?.('remove-item-from-character', {
            scope: 'character',
            entry: 'clear-non-inventory',
            branch: 'clear-non-inventory'
          })
          : null;
        if (removeScenarioId) {
          bindRemoveScenario(removeScenarioId, {
            scope: 'character',
            entry: 'clear-non-inventory',
            branch: 'clear-non-inventory'
          });
        }
        const ok = await confirmPopup('Detta tar bort Ras, Yrken, Elityrken, Förmågor, Mystisk kraft, Ritualer, Fördelar, Nackdelar, Särdrag och Monstruösa särdrag från karaktären. Inventariet lämnas orört. Vill du fortsätta?');
        if (!ok) {
          cancelRemoveScenario(removeScenarioId, {
            scope: 'character',
            entry: 'clear-non-inventory',
            branch: 'clear-non-inventory',
            cancelled: true
          });
          return;
        }
        const before = storeHelper.getCurrentList(store);
        const keep = before.filter(p => isInv(p));
        timeActiveRemoveStage('store-mutation', () => {
          storeHelper.setCurrentList(store, keep);
        }, {
          surface: 'character',
          branch: 'clear-non-inventory'
        });
        if (window.invUtil && typeof invUtil.renderInventory === 'function') {
          invUtil.renderInventory();
        }
        timeActiveRemoveStage('selection-render', () => {
          renderSkills(filtered());
        }, {
          surface: 'character',
          branch: 'clear-non-inventory'
        });
        timeActiveRemoveStage('derived-refresh', () => {
          updateXP();
          renderTraits();
        }, {
          surface: 'character',
          branch: 'clear-non-inventory'
        });
        updateSearchDatalist();
        await finishRemoveScenario(removeScenarioId, {
          scope: 'character',
          entry: 'clear-non-inventory',
          branch: 'clear-non-inventory'
        });
      }, { signal });
    }

    const conflictPanel = document.getElementById('conflictPanel');
    const conflictClose = document.getElementById('conflictClose');
    const conflictList = document.getElementById('conflictList');
    const conflictTitle = document.getElementById('conflictTitle');

    // Inline highlight for Info content (same normalization as index-view)
    const buildNormMap = (str) => {
      const low = String(str || '').toLowerCase();
      let norm = '';
      const map = [];
      for (let i = 0; i < low.length; i++) {
        const n = searchNormalize(low[i]);
        norm += n;
        for (let k = 0; k < n.length; k++) map.push(i);
      }
      return { norm, map };
    };
    const highlightTextNode = (node, termsNorm) => {
      const text = node.nodeValue;
      if (!text || !text.trim()) return;
      const { norm, map } = buildNormMap(text);
      const ranges = [];
      for (const term of termsNorm) {
        if (!term) continue;
        let start = 0;
        while (true) {
          const idx = norm.indexOf(term, start);
          if (idx === -1) break;
          const s = map[idx];
          const e = map[idx + term.length - 1] + 1;
          if (s != null && e != null && e > s) ranges.push([s, e]);
          start = idx + Math.max(1, term.length);
        }
      }
      if (!ranges.length) return;
      ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const merged = [];
      for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push(r.slice());
      }
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const [s, e] of merged) {
        if (pos < s) frag.appendChild(document.createTextNode(text.slice(pos, s)));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(s, e);
        frag.appendChild(mark);
        pos = e;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    };
    const highlightInElement = (el, termsNorm) => {
      if (!el || !termsNorm || !termsNorm.length) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = (p.nodeName || '').toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'mark') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => highlightTextNode(n, termsNorm));
    };

    const flashAdded = (name, trait) => {
      const selector = `li[data-name="${CSS.escape(name)}"]${trait ? `[data-trait="${CSS.escape(trait)}"]` : ''}`;
      const items = dom.valda?.querySelectorAll(selector);
      const li = items?.[items.length - 1];
      if (li) {
        li.classList.add('inv-flash');
        setTimeout(() => li.classList.remove('inv-flash'), 1000);
      }
    };

    const flashRemoved = li => {
      if (li) {
        li.classList.add('rm-flash');
        setTimeout(() => li.classList.remove('rm-flash'), 1000);
      }
    };

    const normalizeChoiceToken = (value) => String(value ?? '').trim().toLowerCase();

    const isSameChoiceSource = (left, right) => {
      if (!left || !right) return false;
      const leftId = left.id === undefined || left.id === null ? '' : String(left.id).trim();
      const rightId = right.id === undefined || right.id === null ? '' : String(right.id).trim();
      if (leftId && rightId) return leftId === rightId;
      const leftName = String(left.namn || left.name || '').trim();
      const rightName = String(right.namn || right.name || '').trim();
      return Boolean(leftName && rightName && leftName === rightName);
    };

    const getChoiceUsedValues = (list, entry, field, excludeEntry = null) => {
      if (!Array.isArray(list) || !field) return [];
      return list
        .filter(item => item && item !== excludeEntry && isSameChoiceSource(item, entry))
        .map(item => item?.[field])
        .filter(value => value !== undefined && value !== null && String(value).trim() !== '');
    };

    async function pickCharacterEntryChoice(entry, list, level, excludeEntry = null, options = {}) {
      const picker = window.choicePopup;
      if (!picker || typeof picker.getChoiceRule !== 'function' || typeof picker.pickForEntry !== 'function') {
        return { hasChoice: false, cancelled: false };
      }

      const candidate = level && entry?.nivå !== level
        ? { ...entry, nivå: level }
        : { ...entry };
      const context = {
        list: Array.isArray(list) ? list : [],
        entry: candidate,
        sourceEntry: candidate,
        level: level || candidate?.nivå || '',
        sourceLevel: level || candidate?.nivå || ''
      };
      const rule = picker.getChoiceRule(candidate, context, { fallbackLegacy: true });
      if (!rule) return { hasChoice: false, cancelled: false };

      const usedValues = getChoiceUsedValues(list, candidate, rule.field, excludeEntry);
      const currentValue = Object.prototype.hasOwnProperty.call(options || {}, 'currentValue')
        ? options.currentValue
        : candidate?.[rule.field];
      const hasCurrentValue = currentValue !== undefined
        && currentValue !== null
        && String(currentValue).trim() !== '';
      const isCurrentChoiceStillAvailable = () => {
        if (!hasCurrentValue) return false;
        if (typeof picker.resolveRuleOptions !== 'function') return true;
        try {
          const optionsForRule = picker.resolveRuleOptions(rule, {
            ...context,
            entry: candidate,
            usedValues,
            currentValue
          });
          const wanted = normalizeChoiceToken(currentValue);
          if (!wanted) return false;
          return optionsForRule.some(option =>
            !option?.disabled && normalizeChoiceToken(option?.value) === wanted
          );
        } catch (_) {
          // Fallback to legacy behavior if option resolution fails.
          return true;
        }
      };
      if (options?.promptIfMissingOnly && hasCurrentValue) {
        if (isCurrentChoiceStillAvailable()) {
          return {
            hasChoice: true,
            cancelled: false,
            skippedPrompt: true,
            rule,
            value: currentValue,
            usedValues
          };
        }
      }
      const picked = await picker.pickForEntry({
        entry: candidate,
        context,
        rule,
        usedValues,
        currentValue,
        fallbackLegacy: true
      });
      if (picked?.hasChoice && !picked.noOptions) {
        markActiveLevelCheckpoint('popup-close', {
          surface: 'character',
          entry: candidate?.namn || entry?.namn || '',
          promptIfMissingOnly: Boolean(options?.promptIfMissingOnly)
        });
      }
      if (!picked?.hasChoice) return { hasChoice: false, cancelled: false };
      if (picked.cancelled) {
        return {
          hasChoice: true,
          cancelled: true,
          noOptions: Boolean(picked.noOptions),
          rule,
          usedValues
        };
      }

      const duplicate = await picker.enforceDuplicatePolicy({
        rule,
        value: picked.value,
        usedValues,
        label: picked.value
      });
      if (!duplicate.ok) {
        return {
          hasChoice: true,
          cancelled: true,
          duplicateRejected: true,
          rule,
          usedValues
        };
      }

      return {
        hasChoice: true,
        cancelled: false,
        rule,
        value: picked.value,
        usedValues,
        duplicate
      };
    }

    const CHOICE_MATCH_FIELDS = ['trait', 'race', 'form'];

    const normalizeMatchValue = (value) => {
      if (value === undefined || value === null) return null;
      const normalized = String(value).trim().toLowerCase();
      return normalized || null;
    };

    const normalizeId = (value) => {
      const normalized = normalizeMatchValue(value);
      if (!normalized || normalized === 'undefined' || normalized === 'null') return '';
      return normalized;
    };

    const entryDiffKey = (entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const id = normalizeId(entry.id);
      const name = normalizeMatchValue(entry.namn || entry.name);
      const parts = [];
      if (id) parts.push(`id:${id}`);
      else if (name) parts.push(`name:${name}`);
      CHOICE_MATCH_FIELDS.forEach(field => {
        const value = normalizeMatchValue(entry[field]);
        if (value === null || value === '') return;
        parts.push(`${field}:${value}`);
      });
      const level = normalizeMatchValue(entry.nivå);
      if (level !== null && level !== '') parts.push(`level:${level}`);
      return parts.join('|');
    };

    const buildChoiceEntryMatchOptions = (entry) => {
      const matchOptions = {};
      CHOICE_MATCH_FIELDS.forEach(field => {
        const value = normalizeMatchValue(entry?.[field]);
        if (value === null || value === '') return;
        matchOptions[field] = value;
      });
      if (entry?.nivå !== undefined && entry?.nivå !== null && String(entry.nivå).trim() !== '') {
        matchOptions.level = entry.nivå;
      }
      return matchOptions;
    };

    const findMatchingCharacterListEntry = (list, entry, options = {}) => {
      if (!Array.isArray(list) || !entry || typeof entry !== 'object') return null;
      const hasOption = (key) => Object.prototype.hasOwnProperty.call(options, key);
      const hasEntry = (key) => Object.prototype.hasOwnProperty.call(entry, key);
      const wantsLevel = hasOption('level') || hasEntry('nivå');
      const wantsTrait = hasOption('trait') || hasEntry('trait');
      const wantsRace = hasOption('race') || hasEntry('race');
      const wantsForm = hasOption('form') || hasEntry('form');
      const desiredLevel = hasOption('level')
        ? normalizeMatchValue(options.level)
        : normalizeMatchValue(entry.nivå);
      const desiredTrait = hasOption('trait')
        ? normalizeMatchValue(options.trait)
        : normalizeMatchValue(entry.trait);
      const desiredRace = hasOption('race')
        ? normalizeMatchValue(options.race)
        : normalizeMatchValue(entry.race);
      const desiredForm = hasOption('form')
        ? normalizeMatchValue(options.form)
        : normalizeMatchValue(entry.form);

      let fallbackById = null;
      let fallbackByName = null;
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const sameId = entry.id != null && item.id != null
          && normalizeId(entry.id) === normalizeId(item.id);
        const sameName = String(entry.namn || entry.name || '').trim()
          && String(item.namn || '').trim()
          && String(entry.namn || entry.name || '').trim() === String(item.namn || '').trim();
        const levelMatches = !wantsLevel || normalizeMatchValue(item.nivå) === desiredLevel;
        const traitMatches = !wantsTrait || normalizeMatchValue(item.trait) === desiredTrait;
        const raceMatches = !wantsRace || normalizeMatchValue(item.race) === desiredRace;
        const formMatches = !wantsForm || normalizeMatchValue(item.form) === desiredForm;
        if ((sameId || sameName) && levelMatches && traitMatches && raceMatches && formMatches) {
          return item;
        }
        if (sameId && !fallbackById) {
          fallbackById = item;
          continue;
        }
        if (sameName && !fallbackByName) fallbackByName = item;
      }
      return fallbackById || fallbackByName || null;
    };

    const applyChoiceSelectionToCharacterEntry = (list, entry, choiceResult) => {
      if (!Array.isArray(list) || !entry || !choiceResult?.rule?.field) return false;
      const field = String(choiceResult.rule.field || '').trim();
      if (!field) return false;
      const pickedValue = choiceResult.value;
      if (pickedValue === undefined || pickedValue === null || String(pickedValue).trim() === '') {
        return false;
      }
      let changed = false;
      if (String(entry[field] ?? '') !== String(pickedValue)) {
        entry[field] = pickedValue;
        changed = true;
      }
      if (choiceResult.duplicate?.replaceExisting) {
        const wanted = normalizeChoiceToken(pickedValue);
        for (let i = list.length - 1; i >= 0; i--) {
          const item = list[i];
          if (!item || item === entry) continue;
          if (!isSameChoiceSource(item, entry)) continue;
          if (normalizeChoiceToken(item?.[field]) !== wanted) continue;
          list.splice(i, 1);
          changed = true;
        }
      }
      return changed;
    };

    async function resolvePendingChoiceEntries(entries) {
      const queue = Array.isArray(entries) ? entries.filter(Boolean).slice() : [];
      if (!queue.length) return { changed: false, summaries: [] };
      const summaries = [];
      let changed = false;
      const seen = new Set();

      while (queue.length) {
        const pendingEntry = queue.shift();
        const latestList = storeHelper.getCurrentList(store);
        if (!Array.isArray(latestList) || !latestList.length) break;
        const liveEntry = findMatchingCharacterListEntry(latestList, pendingEntry, buildChoiceEntryMatchOptions(pendingEntry));
        if (!liveEntry) continue;
        const seenKey = String(liveEntry?.__uid || entryDiffKey(liveEntry) || '');
        if (seenKey && seen.has(seenKey)) continue;
        if (seenKey) seen.add(seenKey);
        const choiceResult = await pickCharacterEntryChoice(liveEntry, latestList, liveEntry.nivå || '', liveEntry, {
          promptIfMissingOnly: true
        });
        if (!choiceResult?.hasChoice || choiceResult.cancelled) continue;
        if (!applyChoiceSelectionToCharacterEntry(latestList, liveEntry, choiceResult)) continue;
        const summary = storeHelper.setCurrentList(store, latestList) || null;
        summaries.push(summary);
        changed = true;
        (summary?.grantedEntriesAdded || []).forEach(entry => {
          const queueKey = String(entry?.__uid || entryDiffKey(entry) || '');
          if (!queueKey || !seen.has(queueKey)) queue.push(entry);
        });
      }

      return { changed, summaries };
    }

    function getActiveHandlingKeys(p) {
      const isActiveHandling = (value) => {
        const values = Array.isArray(value) ? value : [value];
        return values.some(item => {
          const raw = String(item ?? '').trim();
          if (!raw) return false;
          return raw
            .split(/[;,/|]+/)
            .map(part => part.trim().replace(/[.!?]$/g, '').toLowerCase())
            .some(part => part === 'aktiv' || part === 'hel runda');
        });
      };

      const meta = typeof window.getEntryLevelMeta === 'function'
        ? window.getEntryLevelMeta(p)
        : (p?.taggar?.nivå_data || {});
      const source = Object.keys(meta || {}).length ? meta : (p?.taggar?.handling || {});

      const availableLevels = LVL.filter(l => p?.nivåer?.[l]);
      const currentLevel = LVL.includes(p?.nivå || '')
        ? p.nivå
        : (availableLevels.length === 1 ? availableLevels[0] : null);
      const currentIdx = currentLevel ? LVL.indexOf(currentLevel) : -1;

      return Object.entries(source)
        .filter(([levelKey, v]) => {
          if (LVL.includes(levelKey)) {
            if (currentIdx < 0 || LVL.indexOf(levelKey) > currentIdx) return false;
          }

          const handlingVal = v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, 'handling')
            ? v.handling
            : v;
          return isActiveHandling(handlingVal);
        })
        .map(([k]) => k);
    }

    function handlingName(p, key) {
      if (!LVL.includes(key)) {
        const txt = p?.nivåer?.[key];
        if (typeof txt === 'string') {
          const idx = txt.indexOf(';');
          return idx >= 0 ? txt.slice(0, idx) : txt;
        }
      }
      return key;
    }

    function findConflictingEntries(entry, list) {
      const hasActiveHandling = getActiveHandlingKeys(entry).length > 0;
      if (!hasActiveHandling) return [];
      return (Array.isArray(list) ? list : [])
        .filter(item => {
          if (!item || item === entry) return false;
          if ((item.namn || '') === (entry?.namn || '')
            && (item.trait ?? null) === (entry?.trait ?? null)
            && (item.nivå ?? null) === (entry?.nivå ?? null)) {
            return false;
          }
          return getActiveHandlingKeys(item).length > 0;
        });
    }

    function conflictEntryHtml(p) {
      const activeKeys = getActiveHandlingKeys(p);
      const activeNames = activeKeys.map(k => handlingName(p, k));
      const lvlHtml = activeKeys
        .map(k => {
          const name = handlingName(p, k);
          let desc = p.nivåer?.[k] || '';
          if (!LVL.includes(k) && typeof desc === 'string') {
            const idx = desc.indexOf(';');
            desc = idx >= 0 ? desc.slice(idx + 1) : '';
          }
          if (!desc) return '';
          const body = formatText(desc);
          if (!body) return '';
          return `
          <details class="level-block">
            <summary>${name}</summary>
            <div class="level-content">${body}</div>
          </details>
        `.trim();
        })
        .filter(Boolean)
        .join('');
      const desc = lvlHtml
        ? `<div class="card-desc"><div class="levels">${lvlHtml}</div></div>`
        : '';
      const titleName = (!LVL.includes(p.nivå || '') && p.nivå)
        ? `${p.namn}: ${handlingName(p, p.nivå)}`
        : p.namn;
      return `<li class="db-card entry-card"><div class="card-title"><span>${titleName}</span></div>${desc}</li>`;
    }

    const charCategory = (entry, { allowFallback = true } = {}) => {
      const rawTypes = Array.isArray(entry?.taggar?.typ)
        ? entry.taggar.typ
        : [];
      const normalized = rawTypes
        .map(t => typeof t === 'string' ? t.trim() : '')
        .filter(Boolean);
      if (!normalized.length) {
        return allowFallback ? 'Övrigt' : undefined;
      }

      const primaryType = normalized[0];
      const firstNonCustomIdx = normalized.findIndex(t => t.toLowerCase() !== 'hemmagjort');
      const artifactIdx = normalized.findIndex(t => t.toLowerCase() === 'artefakt');

      if (artifactIdx > 0 && artifactIdx === firstNonCustomIdx && primaryType) {
        return primaryType;
      }

      if (firstNonCustomIdx >= 0) {
        return normalized[firstNonCustomIdx];
      }

      if (primaryType) return primaryType;
      return allowFallback ? 'Övrigt' : undefined;
    };

    function renderConflicts(list) {
      conflictList.innerHTML = buildConflictsHtml(list, { wrap: false });
    }

    function buildConflictsHtml(list, { wrap = true } = {}) {
      if (!list.length) {
        const emptyLi = '<li class="db-card entry-card">Inga konflikter.</li>';
        return wrap
          ? `<ul class="card-list entry-card-list" data-entry-page="conflict">${emptyLi}</ul>`
          : emptyLi;
      }

      const cats = {};
      list.forEach(p => {
        const cat = charCategory(p);
        (cats[cat] ||= []).push(p);
      });

      const catKeys = Object.keys(cats).sort(catComparator);
      const html = catKeys.map(cat => {
        const items = cats[cat].map(conflictEntryHtml).join('');
        return `
        <li class="cat-group">
          <details class="db-accordion__item" open>
            <summary class="db-accordion__trigger">${catName(cat)}</summary>
            <ul class="db-accordion__content card-list entry-card-list" data-entry-page="conflict">${items}</ul>
          </details>
        </li>`;
      }).join('');

      if (!wrap) return html;
      return `<ul class="card-list entry-card-list" data-entry-page="conflict">${html}</ul>`;
    }

    let summaryRenderSequence = 0;

    async function renderSummary() {
      if (!summaryContent) return;
      const sequence = ++summaryRenderSequence;
      summaryContent.innerHTML = '<section class="summary-section"><ul class="summary-list summary-text"><li>Beräknar…</li></ul></section>';
      const list = storeHelper.getCurrentList(store);
      const inv = storeHelper.getInventory(store);
      const traits = storeHelper.getTraits(store);
      const artifactEffects = storeHelper.getArtifactEffects(store);
      const manualAdjust = storeHelper.getManualAdjustments(store);
      const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
      const maskBonus = window.maskSkill ? maskSkill.getBonuses(inv) : {};
      const KEYS = ['Diskret', 'Kvick', 'Listig', 'Stark', 'Träffsäker', 'Vaksam', 'Viljestark', 'Övertygande'];
      const vals = {};
      KEYS.forEach(k => { vals[k] = (traits[k] || 0) + (bonus[k] || 0) + (maskBonus[k] || 0); });
      const computeLocalDerived = () => ({
        corruptionStats: storeHelper.calcCorruptionTrackStats(list, vals['Viljestark']),
        permanentCorruption: storeHelper.calcPermanentCorruption(list, {
          xp: (artifactEffects?.xp || 0) + (manualAdjust?.xp || 0),
          corruption: (artifactEffects?.corruption || 0) + (manualAdjust?.corruption || 0),
          korruptionstroskel: storeHelper.calcCorruptionTrackStats(list, vals['Viljestark']).korruptionstroskel
        }),
        carryCapacity: storeHelper.calcCarryCapacity(vals['Stark'], list)
          + Number(artifactEffects?.capacity || 0)
          + Number(manualAdjust?.capacity || 0),
        toughness: storeHelper.calcToughness(vals['Stark'], list)
          + Number(artifactEffects?.toughness || 0)
          + Number(manualAdjust?.toughness || 0),
        painThreshold: storeHelper.calcPainThreshold(vals['Stark'], list, {
          xp: (artifactEffects?.xp || 0) + (manualAdjust?.xp || 0),
          corruption: (artifactEffects?.corruption || 0) + (manualAdjust?.corruption || 0),
          korruptionstroskel: storeHelper.calcCorruptionTrackStats(list, vals['Viljestark']).korruptionstroskel
        })
          + Number(artifactEffects?.pain || 0)
          + Number(manualAdjust?.pain || 0),
        usedXp: storeHelper.calcUsedXP(list, {
          xp: (artifactEffects?.xp || 0) + (manualAdjust?.xp || 0),
          corruption: (artifactEffects?.corruption || 0) + (manualAdjust?.corruption || 0)
        }),
        totalXp: storeHelper.calcTotalXP(storeHelper.getBaseXP(store), list),
        freeXp: 0
      });
      let derived = null;
      try {
        derived = await window.symbaroumRulesWorker?.computeDerivedCharacter?.({
          list,
          baseXp: storeHelper.getBaseXP(store),
          traitValues: vals,
          artifactEffects,
          manualAdjust
        });
      } catch {}
      if (!derived) {
        derived = computeLocalDerived();
      }
      if (!Number.isFinite(Number(derived.freeXp))) {
        derived.freeXp = Number(derived.totalXp || 0) - Number(derived.usedXp || 0);
      }
      if (sequence !== summaryRenderSequence) return;

      const corruptionStats = derived.corruptionStats || { korruptionstroskel: 0, styggelsetroskel: 0 };
      const maxCor = Number(corruptionStats.styggelsetroskel || 0);
      const thresh = Number(corruptionStats.korruptionstroskel || 0);
      const permBase = Number(derived.permanentCorruption || 0);
      const hasEarth = list.some(p => p.namn === 'Jordnära');
      let perm = hasEarth ? (permBase % 2) : permBase;
      const capacity = Number(derived.carryCapacity || 0);
      const tal = Number(derived.toughness || 0);
      const pain = Number(derived.painThreshold || 0);

      const defTrait = getDefenseTraitName(list, vals);
      const kvickForDef = vals[defTrait];
      const defenseListStd = calcDefense(kvickForDef, { mode: 'standard' });
      const dancingTrait = getDancingDefenseTraitName(list);
      const defenseListDance = dancingTrait ? calcDefense(vals[dancingTrait], { mode: 'dancing' }) : [];
      const defenseList = [...defenseListStd, ...defenseListDance];
      const accuracyPreview = typeof window.getAccuracyPreview === 'function'
        ? window.getAccuracyPreview({ list, inv, traitValues: vals })
        : {
            entries: (typeof window.calcAccuracy === 'function'
              ? window.calcAccuracy({ list, inv, traitValues: vals })
              : []),
            value: Number.NEGATIVE_INFINITY
          };

      const cond = [];
      if (typeof window.getAttackTraitRuleNotes === 'function') {
        window.getAttackTraitRuleNotes(list).forEach(note => {
          if (typeof note?.summaryText === 'string' && note.summaryText.trim()) {
            cond.push(note.summaryText.trim());
          }
        });
      }
      if (!cond.length) cond.push('Inga särskilda ersättningar');

      const usedXP = Number(derived.usedXp || 0);
      const totalXP = Number(derived.totalXp || 0);
      const freeXP = Number(derived.freeXp || 0);

      const totalMoney = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));
      const moneyToOFn = typeof window.moneyToO === 'function' ? window.moneyToO : null;
      const oToMoneyFn = typeof window.oToMoney === 'function' ? window.oToMoney : null;
      const invUtil = window.invUtil || {};
      let unusedText = `${totalMoney.daler}D ${totalMoney.skilling}S ${totalMoney['örtegar']}Ö`;

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
      }

      const currentChar = (Array.isArray(store.characters) ? store.characters : [])
        .find(c => c && c.id === store.current);
      const charName = currentChar?.name ? String(currentChar.name).trim() : '';

      const dedupeList = (items) => {
        const seen = new Map();
        (Array.isArray(items) ? items : []).forEach(item => {
          let text = '';
          let count = 1;
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
          } else {
            seen.set(key, { text, count });
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
        const values = slice.map(item => item.text);
        const extra = Math.max(0, clean.length - slice.length);
        return { label: header, values, extra };
      };

      const gatherEntries = (types, options = {}) => {
        const wanted = Array.isArray(types) ? types : [types];
        const { annotateMultiples = false, multipleThreshold = 2 } = options;
        const matchesType = (entryTypes, type) => {
          if (entryTypes.includes(type)) return true;
          return type === 'Förmåga' && entryTypes.includes('Basförmåga');
        };
        const counts = new Map();
        list.forEach(entry => {
          const entryTypes = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
          if (!wanted.some(type => matchesType(entryTypes, type))) return;
          const display = abilityDisplayName(entry, {
            list,
            level: entry?.nivå || ''
          });
          if (!display) return;
          const key = display.toLocaleLowerCase('sv');
          const item = counts.get(key);
          if (item) {
            item.count += 1;
          } else {
            counts.set(key, { label: display, count: 1 });
          }
        });
        const entries = Array.from(counts.values());
        entries.sort((a, b) => a.label.localeCompare(b.label, 'sv'));
        return entries.map(entry => {
          const display = (annotateMultiples && entry.count >= multipleThreshold)
            ? `${entry.label} ×${entry.count}`
            : entry.label;
          return { label: display, count: entry.count };
        });
      };

      const summarySections = [];

      const profileRows = [];
      if (charName) profileRows.push({ label: 'Namn', value: charName, layout: 'stack' });
      const raceRow = createListRow('Ras', gatherEntries('Ras'), { max: 3, showCount: false });
      if (raceRow) profileRows.push(raceRow);
      const jobRow = createListRow('Yrken', gatherEntries('Yrke'), { max: 3 });
      if (jobRow) profileRows.push(jobRow);
      const eliteRow = createListRow('Elityrken', gatherEntries('Elityrke'), { max: 3 });
      if (eliteRow) profileRows.push(eliteRow);
      if (profileRows.length) {
        summarySections.push({ title: 'Profil', rows: profileRows, listClass: 'summary-pairs' });
      }

      const focusRows = [];
      const pushListRows = (label, values, options = {}) => {
        const row = createListRow(label, values, { max: 999, ...options });
        if (!row) return;
        focusRows.push({
          label: row.label,
          values: row.values,
          extra: row.extra
        });
      };

      pushListRows('Förmågor', gatherEntries('Förmåga'));
      pushListRows('Mystiska krafter', gatherEntries('Mystisk kraft'));
      pushListRows('Ritualer', gatherEntries('Ritual'));
      pushListRows('Fördelar', gatherEntries('Fördel', {
        annotateMultiples: true,
        multipleThreshold: 3
      }), { countMode: 'total' });
      pushListRows('Nackdelar', gatherEntries('Nackdel', {
        annotateMultiples: true,
        multipleThreshold: 3
      }), { countMode: 'total' });
      pushListRows('Särdrag', gatherEntries('Särdrag'));
      pushListRows('Monstruösa särdrag', gatherEntries('Monstruöst särdrag'));

      if (focusRows.length) {
        summarySections.push({ title: 'Nyckelval', rows: focusRows, listClass: 'summary-titles' });
      }

      const traitRows = KEYS.map(k => ({
        label: k,
        value: String(vals[k] ?? 0)
      }));
      if (traitRows.length) {
        summarySections.push({ title: 'Karaktärsdrag', rows: traitRows, listClass: 'summary-grid tight' });
      }

      const xpRows = [
        { label: 'Total XP', value: String(totalXP), align: 'right' },
        { label: 'Använt XP', value: String(usedXP), align: 'right' },
        { label: 'XP kvar', value: String(freeXP), align: 'right', valueClass: freeXP < 0 ? 'neg' : '' }
      ];
      summarySections.push({ title: 'Erfarenhet', rows: xpRows, listClass: 'summary-pairs' });

      const economyRows = [{ text: `Oanvänt: ${unusedText}` }];
      summarySections.push({ title: 'Ekonomi', rows: economyRows, listClass: 'summary-text' });

      const normalizedDefense = defenseList
        .map(d => ({
          name: d?.name ? String(d.name).trim() : '',
          value: Number(d?.value),
          source: d?.source || 'standard'
        }))
        .filter(d => Number.isFinite(d.value));
      const defenseStandard = normalizedDefense.filter(d => d.source !== 'dancing');
      const defenseDancing = normalizedDefense.filter(d => d.source === 'dancing');

      const defenseSetup = typeof storeHelper.getDefenseSetup === 'function'
        ? storeHelper.getDefenseSetup(store)
        : null;
      const combatAction = `<button type="button" class="db-btn db-btn--icon defense-action-btn${defenseSetup?.enabled ? ' active' : ''}" data-action="open-defense-calc" aria-pressed="${defenseSetup?.enabled ? 'true' : 'false'}">${icon('forsvar', { width: 24, height: 24 })}<span>Utrustning & strid</span></button>`;
      const defenseRows = [];
      if (defenseStandard.length) {
        const highestDefense = defenseStandard
          .reduce((max, d) => Math.max(max, d.value), Number.NEGATIVE_INFINITY);
        if (Number.isFinite(highestDefense)) {
          defenseRows.push({
            label: 'Försvarsvärde',
            value: String(highestDefense),
            align: 'right'
          });
        }

        defenseStandard.forEach(d => {
          const label = d.name ? `Försvar (${d.name})` : 'Försvar';
          defenseRows.push({
            label,
            value: String(d.value),
            align: 'right'
          });
        });
      }

      if (defenseDancing.length) {
        defenseDancing.forEach(d => {
          const label = d.name ? `Försvar (Dansande v. ${d.name})` : 'Försvar (Dansande v.)';
          defenseRows.push({
            label,
            value: String(d.value),
            align: 'right'
          });
        });
      }

      if (defenseRows.length) {
        summarySections.push({ title: 'Försvar', rows: defenseRows, listClass: 'summary-pairs', action: combatAction });
      }

      const normalizedAccuracy = (Array.isArray(accuracyPreview?.entries) ? accuracyPreview.entries : [])
        .map(entry => ({
          name: entry?.name ? String(entry.name).trim() : '',
          value: Number(entry?.value),
          trait: entry?.trait ? String(entry.trait).trim() : ''
        }))
        .filter(entry => Number.isFinite(entry.value));
      const highestAccuracyFromList = normalizedAccuracy
        .reduce((max, entry) => Math.max(max, entry.value), Number.NEGATIVE_INFINITY);
      const highestAccuracy = Number.isFinite(highestAccuracyFromList)
        ? highestAccuracyFromList
        : Number(accuracyPreview?.value);
      const accuracyRows = [];
      if (Number.isFinite(highestAccuracy)) {
        accuracyRows.push({
          label: 'Träffsäkerhet',
          value: String(highestAccuracy),
          align: 'right'
        });
      }
      normalizedAccuracy.forEach(entry => {
        const baseLabel = entry.name ? `Träffsäker (${entry.name})` : 'Träffsäker';
        const traitSuffix = entry.trait ? ` [${entry.trait}]` : '';
        accuracyRows.push({
          label: `${baseLabel}${traitSuffix}`,
          value: String(entry.value),
          align: 'right'
        });
      });
      cond.forEach(text => {
        accuracyRows.push({ text });
      });
      summarySections.push({ title: 'Träffsäkerhet', rows: accuracyRows, listClass: 'summary-pairs', action: combatAction });

      const healthRows = [
        { label: 'Tålighet', value: String(tal), align: 'right' },
        { label: 'Smärtgräns', value: String(pain), align: 'right' },
        { label: 'Bärkapacitet', value: formatWeight(capacity), align: 'right' }
      ];
      summarySections.push({ title: 'Hälsa', rows: healthRows, listClass: 'summary-pairs' });

      const corruptionRows = [
        { label: 'Maximal korruption', value: String(maxCor), align: 'right' },
        { label: 'Permanent korruption', value: String(perm), align: 'right' },
        { label: 'Korruptionströskel', value: String(thresh), align: 'right' }
      ];
      summarySections.push({ title: 'Korruption', rows: corruptionRows, listClass: 'summary-pairs' });

      const sectionHtml = summarySections
        .filter(section => Array.isArray(section.rows) && section.rows.length)
        .map(section => {
          const listClasses = ['summary-list'];
          if (section.listClass) listClasses.push(section.listClass);
          const headerHtml = section.action
            ? `<div class="summary-section-header"><h3>${escapeHtml(section.title)}</h3><div class="summary-action">${section.action}</div></div>`
            : `<h3>${escapeHtml(section.title)}</h3>`;
          const items = section.rows.map(row => {
            if (section.listClass === 'summary-titles') {
              const normalized = Array.isArray(row.values)
                ? row.values.map(val => val?.text ?? val ?? '')
                : [];
              const listItems = normalized
                .map(val => `<li class="summary-subitem">${escapeHtml(val)}</li>`)
                .join('');
              const extraItem = row.extra > 0
                ? `<li class="summary-subitem">+${row.extra} fler</li>`
                : '';
              return `<li class="summary-title-item"><div class="summary-sublist"><div class="summary-chip summary-chip-title">${escapeHtml(row.label)}</div><ul>${listItems}${extraItem}</ul></div></li>`;
            }

            if (row.text) {
              return `<li>${escapeHtml(row.text)}</li>`;
            }

            const buildValue = () => {
              if (Array.isArray(row.values)) {
                const normalized = row.values.map(val => val?.text ?? val ?? '');
                const chips = normalized
                  .map(val => `<span class="summary-chip">${escapeHtml(val)}</span>`)
                  .join('');
                const extraChip = row.extra > 0
                  ? `<span class="summary-chip summary-chip-more">+${row.extra} fler</span>`
                  : '';
                return `<span class="summary-values">${chips}${extraChip}</span>`;
              }
              const classNames = ['summary-value'];
              if (row.align === 'right') classNames.push('align-right');
              if (row.valueClass) {
                row.valueClass.split(/\s+/).filter(Boolean).forEach(cls => classNames.push(cls));
              }
              return `<span class="${classNames.join(' ')}">${escapeHtml(row.value ?? '')}</span>`;
            };

            const liClasses = [];
            if (row.layout) liClasses.push(`layout-${row.layout}`);
            const liClassAttr = liClasses.length ? ` class="${liClasses.join(' ')}"` : '';
            return `<li${liClassAttr}><span class="summary-key">${escapeHtml(row.label)}</span>${buildValue()}</li>`;
          }).join('');
          return `<section class="summary-section">${headerHtml}<ul class="${listClasses.join(' ')}">${items}</ul></section>`;
        }).join('');

      summaryContent.innerHTML = sectionHtml;
    }

    if (summaryBtn && summaryPanel) {
      summaryBtn.addEventListener('click', () => {
        renderSummary();
        const isOpen = summaryPanel.classList.toggle('open');
        if (isOpen) summaryPanel.scrollTop = 0;
      }, { signal });
    }
    summaryClose?.addEventListener('click', () => summaryPanel.classList.remove('open'), { signal });
    document.addEventListener('click', e => {
      if (summaryPanel && summaryPanel.classList.contains('open') &&
        !summaryPanel.contains(e.target) && e.target !== summaryBtn) {
        summaryPanel.classList.remove('open');
      }
    }, { signal });

    if (effectsBtn && effectsPanel) {
      effectsBtn.addEventListener('click', () => {
        renderEffects();
        const isOpen = effectsPanel.classList.toggle('open');
        if (isOpen) effectsPanel.scrollTop = 0;
      }, { signal });
    }
    effectsClose?.addEventListener('click', () => effectsPanel.classList.remove('open'), { signal });
    document.addEventListener('click', e => {
      if (effectsPanel && effectsPanel.classList.contains('open') &&
        !effectsPanel.contains(e.target) && e.target !== effectsBtn) {
        effectsPanel.classList.remove('open');
      }
    }, { signal });

    conflictClose.addEventListener('click', () => conflictPanel.classList.remove('open'), { signal });
    document.addEventListener('click', e => {
      if (conflictPanel.classList.contains('open') &&
        !conflictPanel.contains(e.target) &&
        !e.target.closest('.conflict-btn')) {
        conflictPanel.classList.remove('open');
      }
    }, { signal });

    /* Dropdowns baserat på karaktärslista */
    function refreshCharacterFilters() {
      const lst = storeHelper.getCurrentList(store).filter(p => !isInv(p));
      const sets = { typ: new Set(), ark: new Set(), test: new Set() };
      lst.forEach(p => {
        const taggar = p && typeof p === 'object' ? (p.taggar || {}) : {};
        const typTags = Array.isArray(taggar.typ) ? taggar.typ : [];
        typTags
          .filter(Boolean)
          .forEach(v => sets.typ.add(v));
        const arkSource = taggar.ark_trad;
        const arkTags = splitArkTags(arkSource);
        if (arkTags.length) {
          arkTags.forEach(v => sets.ark.add(v));
        } else if (Array.isArray(arkSource)) {
          sets.ark.add('Traditionslös');
        }
        const testTags = readEntryTests(p, p?.nivå);
        testTags
          .filter(Boolean)
          .forEach(v => sets.test.add(v));
      });
      const fill = (sel, set, label, extra = []) => {
        if (!sel) return;
        const opts = [`<option value="">Lägg till filter</option>`];
        extra.forEach(opt => {
          const text = String(opt?.label || '').trim();
          if (!text) return;
          const value = String(opt?.value ?? '');
          opts.push(`<option value="${value}">${text}</option>`);
        });
        opts.push(...[...set].sort().map(v => `<option>${v}</option>`));
        sel.innerHTML = opts.join('');
      };
      fill(dom.typSel, sets.typ, 'Typ', [{ value: ONLY_SELECTED_VALUE, label: ONLY_SELECTED_LABEL }]);
      fill(dom.arkSel, sets.ark, 'Arketyp');
      fill(dom.tstSel, sets.test, 'Karaktärsdrag');
    }
    refreshCharacterFilters();

    const tagSectionPriority = (section) => {
      if (section === 'test') return 0;
      if (section === 'typ') return 1;
      if (section === 'ark') return 2;
      return 9;
    };
    const sortTagsForDisplay = (tags) => [...tags].sort((a, b) => {
      const prio = tagSectionPriority(a?.section) - tagSectionPriority(b?.section);
      if (prio !== 0) return prio;
      return String(a?.label || '').localeCompare(String(b?.label || ''), 'sv');
    });
    const renderActiveFilterChip = ({ type, value, text, variant }) => {
      const chipClass = variant === 'search' ? 'tag-search-chip' : 'tag-filter-chip';
      const valAttr = value !== undefined
        ? ` data-val="${escapeHtml(value)}"`
        : '';
      return `<span class="db-chip removable ${chipClass}" data-type="${type}"${valAttr}>${escapeHtml(text)}<button class="db-chip__close" aria-label="Ta bort">✕</button></span>`;
    };
    const activeTags = () => {
      dom.active.innerHTML = '';
      const push = t => dom.active.insertAdjacentHTML('beforeend', t);
      if (storeHelper.getOnlySelected(store)) {
        push('<span class="db-chip removable" data-type="onlySel">Endast valda<button class="db-chip__close" aria-label="Ta bort">✕</button></span>');
      }
      F.search.forEach(v => push(renderActiveFilterChip({ type: 'search', value: v, text: v, variant: 'search' })));
      F.test.forEach(v => push(renderActiveFilterChip({ type: 'test', value: v, text: `Karaktärsdrag: ${v}`, variant: 'filter' })));
      F.typ.forEach(v => push(renderActiveFilterChip({ type: 'typ', value: v, text: `Typ: ${v}`, variant: 'filter' })));
      F.ark.forEach(v => push(renderActiveFilterChip({ type: 'ark', value: v, text: `Arketyp: ${v}`, variant: 'filter' })));
    };

    const filtered = () => {
      union = storeHelper.getFilterUnion(store);
      const onlySel = storeHelper.getOnlySelected(store);
      const terms = F.search
        .map(t => searchNormalize(t.toLowerCase()));
      const base = storeHelper.getCurrentList(store);
      const nameSet = onlySel ? new Set(base.map(x => x.namn)) : null;
      return base
        .filter(p => !isInv(p))
        .filter(p => {
          const meta = typeof window.ensureEntryMeta === 'function' ? window.ensureEntryMeta(p) : null;
          const levelText = Object.values(p.nivåer || {}).join(' ');
          const text = meta?.normText
            || searchNormalize(`${p.namn} ${(p.beskrivning || '')} ${levelText}`.toLowerCase());
          const hasTerms = terms.length > 0;
          const txt = hasTerms && (
            union ? terms.some(q => text.includes(q))
              : terms.every(q => text.includes(q))
          );
          const tags = p.taggar || {};
          const selTags = [...F.typ, ...F.ark, ...F.test];
          const hasTags = selTags.length > 0;
          const arkTags = splitArkTags(tags.ark_trad);
          const itmTags = [
            ...(tags.typ ?? []),
            ...(arkTags.length ? arkTags : (Array.isArray(tags.ark_trad) ? ['Traditionslös'] : [])),
            ...(tags.test ?? [])
          ];
          const tagOk = !hasTags || (
            union ? selTags.some(t => itmTags.includes(t))
              : selTags.every(t => itmTags.includes(t))
          );
          const txtOk = !hasTerms || txt;
          const selOk = !nameSet || nameSet.has(p.namn);
          return txtOk && tagOk && selOk;
        })
        .sort(createSearchSorter(terms));
    };

    const buildCharacterSelectionCard = (group) => {
      if (!group?.entry) return null;
      const p = group.entry;
      const currentList = storeHelper.getCurrentList(store);
      const compact = storeHelper.getCompactEntries(store);
      const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
      const availLvls = LVL.filter(l => p.nivåer?.[l]);
      const hasAnyLevel = availLvls.length > 0;
      const curLvl = p.nivå || (hasAnyLevel ? availLvls[0] : null);
      const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
      let desc = abilityHtml(p, p.nivå);
      let infoBodyHtml = desc;
      const infoMeta = [];
      const keyInfoMeta = [];
      let choiceInfo = '';
      if (isRas(p) || isYrke(p) || isElityrke(p)) {
        const extra = yrkeInfoHtml(p);
        if (extra) infoBodyHtml += extra;
      }
      const choiceMeta = getEntryChoiceDisplay(p, {
        list: currentList,
        level: p?.nivå || ''
      });
      if (choiceMeta?.valueLabel) {
        const label = escapeHtml(choiceMeta.label || 'Val');
        const value = escapeHtml(choiceMeta.valueLabel);
        keyInfoMeta.push({ label, value });
        choiceInfo = `<p><strong>${label}:</strong> ${value}</p>`;
      }
      let xpSourceMatch = null;
      if (Array.isArray(currentList) && currentList.length) {
        xpSourceMatch = currentList.find(item => {
          if (!item || typeof item !== 'object') return false;
          if (item === p) return true;
          const sameId = item.id && p.id && item.id === p.id;
          const sameName = item.namn && p.namn && item.namn === p.namn;
          const sameLevel = (item.nivå ?? null) === (p.nivå ?? null);
          const sameTrait = (item.trait ?? null) === (p.trait ?? null);
          if (sameId) return sameLevel && sameTrait;
          if (sameName) return sameLevel && sameTrait;
          return false;
        }) || null;
      }
      const xpHelper = window.entryXp?.buildDisplay || window.entryXp?.compute;
      const xpInfo = typeof xpHelper === 'function'
        ? xpHelper(p, currentList, {
          xpSource: xpSourceMatch,
          allowInventory: true,
          allowEmployment: true,
          allowService: true,
          forceDisplay: true
        })
        : null;
      const fallbackOpts = xpSourceMatch ? { xpSource: xpSourceMatch } : undefined;
      const xpVal = xpInfo ? xpInfo.value : storeHelper.calcEntryDisplayXP(p, currentList, fallbackOpts);
      let xpText = xpInfo ? xpInfo.text : storeHelper.formatEntryXPText(p, xpVal);
      if (!xpInfo && isElityrke(p)) {
        xpText = `Minst ${eliteReq.minXP ? eliteReq.minXP(p, currentList) : 50}`;
      }
      const effectiveXpInfo = xpInfo || {
        headerHtml: `<span class="entry-xp-value">Erf: ${xpText}</span>`,
        tagHtml: `<span class="db-chip xp-cost">Erf: ${xpText}</span>`,
        value: xpVal
      };
      const testList = readEntryTests(p, curLvl || p?.nivå).filter(Boolean);
      const activeKeys = getActiveHandlingKeys(p);
      const conflictPool = findConflictingEntries(p, currentList);
      const conflictsHtml = (activeKeys.length && conflictPool.length)
        ? buildConflictsHtml(conflictPool)
        : '';
      const infoSections = (isElityrke(p) && typeof buildElityrkeInfoSections === 'function')
        ? buildElityrkeInfoSections(p)
        : [];
      const resolvedForSkadetyp = (!Array.isArray(p.taggar?.typ) || !p.taggar.typ.includes('Hemmagjort'))
        ? (resolveDbEntry(p) || null)
        : null;
      const skadeEntry = (() => {
        if (typeof entryHasDamageType !== 'function') return null;
        if (entryHasDamageType(p)) return p;
        if (resolvedForSkadetyp && entryHasDamageType(resolvedForSkadetyp)) return resolvedForSkadetyp;
        return null;
      })();
      const skadeTabHtml = (typeof buildSkadetypPanelHtml === 'function' && skadeEntry)
        ? buildSkadetypPanelHtml(skadeEntry, { level: curLvl, tables: window.TABELLER })
        : '';
      const multi = getEntryMaxCount(p) > 1 && !p.trait;
      const total = currentList.filter(x => x.namn === p.namn && !x.trait).length;
      const limit = getEntryMaxCount(p);
      const hasCustomEdit = typesList.includes('Hemmagjort');
      const hasArtifactType = typesList.some(t => String(t).trim().toLowerCase() === 'artefakt');
      const editAction = hasCustomEdit ? 'editCustom' : (hasArtifactType ? 'editArtifact' : '');
      const idAttr = p.id ? ` data-id="${p.id}"` : '';
      const editBtn = editAction
        ? `<button data-act="${editAction}" class="db-btn" data-name="${p.namn}"${idAttr}>✏️</button>`
        : '';
      const buttonParts = [];
      if (editBtn) buttonParts.push(editBtn);
      const standardActionConfig = {};
      if (multi) {
        const isDisadv = typesList.includes('Nackdel');
        if (isDisadv) {
          if (total > 0) standardActionConfig.remove = { act: 'del' };
          if (total > 1) standardActionConfig.minus = { act: 'sub' };
          if (total < limit) {
            standardActionConfig.plus = {
              act: 'add',
              highlight: total === 0
            };
          }
        } else {
          if (total > 0) standardActionConfig.remove = { act: 'del' };
          if (total > 1) standardActionConfig.minus = { act: 'sub' };
          if (total < limit) {
            standardActionConfig.plus = {
              act: 'add',
              highlight: total === 0
            };
          }
        }
      } else {
        standardActionConfig.remove = { act: 'del' };
      }
      buttonParts.push(...(window.entryCardFactory?.buildStandardActionButtons?.(standardActionConfig, {
        buttonName: p.namn,
        buttonId: p.id !== undefined && p.id !== null ? String(p.id) : ''
      }) || []));
      const opts = entryCardBuilder.build(p, {
        compact,
        currentLevel: curLvl,
        availLvls,
        xpInfo: effectiveXpInfo,
        desc,
        infoBodyHtml,
        choiceInfo,
        keyInfoMeta,
        infoMeta,
        conflictsHtml,
        infoSections,
        skadetypHtml: skadeTabHtml,
        count: group.count,
        multi: group.count > 1,
        hideDetails,
        testList,
      });
      opts.buttonSections = buttonParts;
      return createEntryCard(opts);
    };

    const replaceCharacterSelectionCard = (cardEl, entry) => {
      if (!cardEl || !entry) return false;
      const currentList = storeHelper.getCurrentList(store);
      const count = getEntryMaxCount(entry) > 1 && !entry.trait
        ? currentList.filter(item => item?.namn === entry.namn && !item?.trait).length
        : 1;
      const nextCard = buildCharacterSelectionCard({ entry, count });
      if (!nextCard) return false;
      nextCard.classList.toggle('compact', cardEl.classList.contains('compact'));
      window.entryCardFactory?.syncCollapse?.(nextCard);
      cardEl.replaceWith(nextCard);
      const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
        .map(t => searchNormalize(t.toLowerCase()));
      if (terms.length) {
        const titleSpan = nextCard.querySelector('.card-title .entry-title-main');
        if (titleSpan) highlightInElement(titleSpan, terms);
        const descEl = nextCard.querySelector('.card-desc');
        if (descEl) highlightInElement(descEl, terms);
      }
      return true;
    };

    const matchesCharacterSelectionEntry = (candidate, name, trait = null) => {
      const wantedName = String(name || '').trim();
      if (!candidate || String(candidate?.namn || '').trim() !== wantedName) return false;
      const wantedTrait = String(trait || '').trim();
      const multi = getEntryMaxCount(candidate) > 1 && !candidate?.trait;
      if (multi && !wantedTrait) return true;
      if (wantedTrait) {
        return String(candidate?.trait || '').trim() === wantedTrait;
      }
      return !candidate?.trait;
    };

    const findCharacterSelectionEntry = ({ name, trait = null } = {}) => {
      const wantedName = String(name || '').trim();
      if (!wantedName) return null;
      const visibleMatch = filtered().find(candidate => matchesCharacterSelectionEntry(candidate, wantedName, trait));
      if (visibleMatch) return visibleMatch;
      return storeHelper.getCurrentList(store)
        .find(candidate => matchesCharacterSelectionEntry(candidate, wantedName, trait)) || null;
    };

    const canTargetCharacterSelectionAddMutation = (summary, entryName) => {
      if (!summary) return false;
      const removedEntries = Array.isArray(summary.removedEntries) ? summary.removedEntries : [];
      if (removedEntries.length) return false;
      const addedEntries = Array.isArray(summary.addedEntries) ? summary.addedEntries : [];
      const wantedName = String(entryName || '').trim();
      return addedEntries.every(entry => String(entry?.namn || '').trim() === wantedName);
    };

    const renderSkills = arr => {
      const sortMode = storeHelper.getEntrySort
        ? storeHelper.getEntrySort(store)
        : (typeof ENTRY_SORT_DEFAULT !== 'undefined' ? ENTRY_SORT_DEFAULT : 'alpha-asc');
      const entrySorter = typeof entrySortComparator === 'function'
        ? entrySortComparator(sortMode, { extract: g => g.entry })
        : ((a, b) => (typeof compareSv === 'function'
          ? compareSv(a?.entry?.namn || '', b?.entry?.namn || '')
          : String(a?.entry?.namn || '').localeCompare(String(b?.entry?.namn || ''), 'sv')));
      const groups = [];
      arr.forEach(p => {
        const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
        const multi = getEntryMaxCount(p) > 1 && !p.trait;
        if (multi) {
          const g = groups.find(x => x.entry.namn === p.namn);
          if (g) { g.count++; return; }
          groups.push({ entry: p, count: 1 });
        } else {
          groups.push({ entry: p, count: 1 });
        }
      });
      const compact = storeHelper.getCompactEntries(store);
      const cardKeyFromEl = el => {
        const id = el.dataset.id || el.dataset.name || '';
        const level = el.dataset.level || '';
        const trait = el.dataset.trait || '';
        return `${id}|${level}|${trait}`;
      };
      const prevCards = [...dom.valda.querySelectorAll('li.card.entry-card')];
      const openCardKeys = new Set(prevCards.filter(li => !li.classList.contains('compact')).map(cardKeyFromEl));
      const compactCardKeys = new Set(prevCards.filter(li => li.classList.contains('compact')).map(cardKeyFromEl));
      const openCats = new Set(
        [...dom.valda.querySelectorAll('.cat-group > details[open]')]
          .map(d => d.dataset.cat)
      );
      dom.valda.innerHTML = '';
      if (!groups.length) { dom.valda.innerHTML = '<li class="db-card entry-card">Inga träffar.</li>'; return; }
      const cats = {};
      const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
        .map(t => searchNormalize(t.toLowerCase()));
      const searchActive = terms.length > 0;
      const catNameMatch = {};
      groups.forEach(g => {
        const cat = charCategory(g.entry);
        (cats[cat] ||= []).push(g);
        if (searchActive) {
          const name = searchNormalize((g.entry.namn || '').toLowerCase());
          const union = storeHelper.getFilterUnion(store);
          const nameOk = union ? terms.some(q => name.includes(q))
            : terms.every(q => name.includes(q));
          if (nameOk) {
            catNameMatch[cat] = true;
          }
        }
      });
      const catKeys = Object.keys(cats);
      catKeys.sort((a, b) => {
        if (searchActive) {
          const aMatch = catNameMatch[a] ? 1 : 0;
          const bMatch = catNameMatch[b] ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
        }
        return catComparator(a, b);
      });
      catKeys.forEach(cat => {
        cats[cat].sort(entrySorter);
        const catLi = document.createElement('li');
        catLi.className = 'cat-group';
        catLi.dataset.aaKey = `cat:${cat}`;
        const shouldOpen = catState[cat] !== undefined ? catState[cat] : (openCats.has(cat) || openCatsOnce.has(cat));
        catLi.innerHTML = `<details class="db-accordion__item" data-cat="${cat}"${shouldOpen ? ' open' : ''}><summary class="db-accordion__trigger">${catName(cat)}</summary><ul class="db-accordion__content card-list entry-card-list"></ul></details>`;
        const detailsEl = catLi.querySelector('details');
        const listEl = detailsEl.querySelector('ul');
        detailsEl.addEventListener('toggle', () => {
          updateCatToggle();
          catState[cat] = detailsEl.open;
          saveState();
        }, { signal });
        cats[cat].forEach(g => {
          const p = g.entry;
          const availLvls = LVL.filter(l => p.nivåer?.[l]);
          const hasAnyLevel = availLvls.length > 0;
          const curLvl = p.nivå || (hasAnyLevel ? availLvls[0] : null);
          const hasLevelSelect = availLvls.length > 1;
          const levelOptionsHtml = hasLevelSelect
            ? availLvls.map(l => {
              const short = levelLetter(l);
              const selected = l === curLvl ? ' selected' : '';
              const shortAttr = short ? ` data-short="${short}"` : '';
              return `<option value="${l}"${shortAttr}${selected}>${l}</option>`;
            }).join('')
            : '';
          const lvlSel = hasLevelSelect
            ? `<select class="level" data-name="${p.namn}"${p.trait ? ` data-trait="${p.trait}"` : ''} aria-label="Välj nivå för ${p.namn}">
              ${levelOptionsHtml}
            </select>`
            : '';
          const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
          let desc = abilityHtml(p, p.nivå);
          let infoBodyHtml = desc;
          const infoMeta = [];
          const keyInfoMeta = [];
          let choiceInfo = '';
          if (isRas(p) || isYrke(p) || isElityrke(p)) {
            const extra = yrkeInfoHtml(p);
            if (extra) infoBodyHtml += extra;
          }
          const curList = storeHelper.getCurrentList(store);
          const choiceMeta = getEntryChoiceDisplay(p, {
            list: curList,
            level: p?.nivå || ''
          });
          if (choiceMeta?.valueLabel) {
            const label = escapeHtml(choiceMeta.label || 'Val');
            const value = escapeHtml(choiceMeta.valueLabel);
            keyInfoMeta.push({ label, value });
            choiceInfo = `<p><strong>${label}:</strong> ${value}</p>`;
          }
          let xpSourceMatch = null;
          if (Array.isArray(curList) && curList.length) {
            xpSourceMatch = curList.find(item => {
              if (!item || typeof item !== 'object') return false;
              if (item === p) return true;
              const sameId = item.id && p.id && item.id === p.id;
              const sameName = item.namn && p.namn && item.namn === p.namn;
              const sameLevel = (item.nivå ?? null) === (p.nivå ?? null);
              const sameTrait = (item.trait ?? null) === (p.trait ?? null);
              if (sameId) return sameLevel && sameTrait;
              if (sameName) return sameLevel && sameTrait;
              return false;
            }) || null;
          }
          const xpHelper = window.entryXp?.buildDisplay || window.entryXp?.compute;
          const xpInfo = typeof xpHelper === 'function'
            ? xpHelper(p, curList, {
              xpSource: xpSourceMatch,
              allowInventory: true,
              allowEmployment: true,
              allowService: true,
              forceDisplay: true
            })
            : null;
          const fallbackOpts = xpSourceMatch ? { xpSource: xpSourceMatch } : undefined;
          const xpVal = xpInfo ? xpInfo.value : storeHelper.calcEntryDisplayXP(p, curList, fallbackOpts);
          let xpText = xpInfo ? xpInfo.text : storeHelper.formatEntryXPText(p, xpVal);
          if (!xpInfo && isElityrke(p)) {
            xpText = `Minst ${eliteReq.minXP ? eliteReq.minXP(p, curList) : 50}`;
          }
          // ── XP fallback (character view always shows XP) ──
          const effectiveXpInfo = xpInfo || {
            headerHtml: `<span class="entry-xp-value">Erf: ${xpText}</span>`,
            tagHtml: `<span class="db-chip xp-cost">Erf: ${xpText}</span>`,
            value: xpVal
          };

          // ── Test tags (level-specific) ──
          const testList = readEntryTests(p, curLvl || p?.nivå).filter(Boolean);

          // ── Conflict detection ──
          const activeKeys = getActiveHandlingKeys(p);
          const currentList = storeHelper.getCurrentList(store);
          const conflictPool = findConflictingEntries(p, currentList);
          const conflictsHtml = (activeKeys.length && conflictPool.length)
            ? buildConflictsHtml(conflictPool)
            : '';

          // ── Info sections ──
          const infoSections = (isElityrke(p) && typeof buildElityrkeInfoSections === 'function')
            ? buildElityrkeInfoSections(p)
            : [];
          const resolvedForSkadetyp = (!Array.isArray(p.taggar?.typ) || !p.taggar.typ.includes('Hemmagjort'))
            ? (resolveDbEntry(p) || null)
            : null;
          const skadeEntry = (() => {
            if (typeof entryHasDamageType !== 'function') return null;
            if (entryHasDamageType(p)) return p;
            if (resolvedForSkadetyp && entryHasDamageType(resolvedForSkadetyp)) return resolvedForSkadetyp;
            return null;
          })();
          const skadeTabHtml = (typeof buildSkadetypPanelHtml === 'function' && skadeEntry)
            ? buildSkadetypPanelHtml(skadeEntry, { level: curLvl, tables: window.TABELLER })
            : '';

          // ── Count & multi ──
          const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
          const multi = getEntryMaxCount(p) > 1 && !p.trait;
          const total = storeHelper.getCurrentList(store).filter(x => x.namn === p.namn && !x.trait).length;
          const limit = getEntryMaxCount(p);

          // ── Buttons (view-specific) ──
          const hasCustomEdit = typesList.includes('Hemmagjort');
          const hasArtifactType = typesList.some(t => String(t).trim().toLowerCase() === 'artefakt');
          const editAction = hasCustomEdit ? 'editCustom' : (hasArtifactType ? 'editArtifact' : '');
          const idAttr = p.id ? ` data-id="${p.id}"` : '';
          const editBtn = editAction
            ? `<button data-act="${editAction}" class="db-btn" data-name="${p.namn}"${idAttr}>✏️</button>`
            : '';
          const buttonParts = [];
          if (editBtn) buttonParts.push(editBtn);
          const standardActionConfig = {};
          if (multi) {
            const isDisadv = typesList.includes('Nackdel');
            if (isDisadv) {
              if (total > 0) standardActionConfig.remove = { act: 'del' };
              if (total > 1) standardActionConfig.minus = { act: 'sub' };
              if (total < limit) {
                standardActionConfig.plus = {
                  act: 'add',
                  highlight: total === 0
                };
              }
            } else {
              if (total > 0) standardActionConfig.remove = { act: 'del' };
              if (total > 1) standardActionConfig.minus = { act: 'sub' };
              if (total < limit) {
                standardActionConfig.plus = {
                  act: 'add',
                  highlight: total === 0
                };
              }
            }
          } else {
            standardActionConfig.remove = { act: 'del' };
          }
          buttonParts.push(...(window.entryCardFactory?.buildStandardActionButtons?.(standardActionConfig, {
            buttonName: p.namn,
            buttonId: p.id !== undefined && p.id !== null ? String(p.id) : ''
          }) || []));

          // ── Build card via shared builder ──
          const opts = entryCardBuilder.build(p, {
            compact,
            currentLevel: curLvl,
            availLvls,
            xpInfo: effectiveXpInfo,
            desc,
            infoBodyHtml,
            choiceInfo,
            keyInfoMeta,
            infoMeta,
            conflictsHtml,
            infoSections,
            skadetypHtml: skadeTabHtml,
            count: g.count,
            multi: g.count > 1,
            hideDetails,
            testList,
          });
          opts.buttonSections = buttonParts;
          const li = createEntryCard(opts);

          listEl.appendChild(li);
          const entryKey = cardKeyFromEl(li);
          if (openCardKeys.has(entryKey)) {
            li.classList.remove('compact');
          } else if (compact && compactCardKeys.has(entryKey)) {
            li.classList.add('compact');
          } else if (!compact) {
            li.classList.remove('compact');
          }
        });
        dom.valda.appendChild(catLi);
      });
      bindCharacterMotionTargets();
      updateCatToggle();
      openCatsOnce.clear();
      saveState();
      refreshEffectsPanel();
    };

    /* custom suggestions handled globalt */
    const updateSearchDatalist = () => {
      window.globalSearch?.refreshSuggestions?.();
    };

    const refreshCharacterSelection = () => {
      renderSkills(filtered());
      activeTags();
      updateSearchDatalist();
    };
    const refreshCharacterTraits = () => {
      renderTraits();
    };
    const refreshCharacterName = () => {
      if (!dom?.cName) return;
      dom.cName.textContent = (store.characters || []).find(c => c.id === store.current)?.name || '';
    };
    bindCharacterMotionTargets();
    refreshCharacterSelection(); updateXP(); refreshCharacterTraits();
    window.symbaroumViewBridge?.registerViewHooks('character', {
      refresh: () => {
        refreshCharacterSelection();
        refreshCharacterTraits();
      },
      refreshName: refreshCharacterName,
      refreshFilters: () => {
        refreshCharacterFilters();
        updateSearchDatalist();
      },
      refreshSelection: refreshCharacterSelection,
      refreshTraits: refreshCharacterTraits,
      refreshSummary: renderSummary,
      refreshEffects: refreshEffectsPanel
    });

    dom.catToggle.addEventListener('click', () => {
      const details = document.querySelectorAll('.cat-group > details');
      if (catsMinimized) {
        details.forEach(d => { d.open = true; });
      } else {
        details.forEach(d => { d.open = false; });
      }
      updateCatToggle();
    }, { signal });

    /* --- filter-events */
    dom.sIn.addEventListener('input', () => {
      sTemp = dom.sIn.value.trim();
    }, { signal });

    const DROPDOWN_CONFIG = [
      ['typSel', 'typ'],
      ['arkSel', 'ark'],
      ['tstSel', 'test']
    ];
    const DROPDOWN_ID_MAP = {
      typSel: 'typFilter',
      arkSel: 'arkFilter',
      tstSel: 'testFilter'
    };

    const handleDropdownChange = (sel, key) => (event) => {
      const el = event?.currentTarget;
      if (!el) return;
      dom[sel] = el;
      const v = el.value;
      if (sel === 'tstSel' && !v) {
        F[key] = [];
        storeHelper.setOnlySelected(store, false);
        activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
        return;
      }
      if (sel === 'typSel' && v === ONLY_SELECTED_VALUE) {
        storeHelper.setOnlySelected(store, true);
        el.value = '';
        activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
        return;
      }
      if (v && !F[key].includes(v)) F[key].push(v);
      el.value = '';
      activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
    };

    const ensureDropdownChangeHandlers = () => {
      const toolbar = document.querySelector('shared-toolbar');
      if (toolbar && toolbar.dataset.characterDropdownWatcher !== initToken) {
        toolbar.addEventListener('toolbar-rendered', () => {
          ensureDropdownChangeHandlers();
        }, { signal });
        toolbar.dataset.characterDropdownWatcher = initToken;
      }
      const root = toolbar?.shadowRoot || null;
      let missing = false;
      DROPDOWN_CONFIG.forEach(([sel, key]) => {
        let el = dom[sel];
        if (!el || !el.isConnected) {
          const resolvedId = DROPDOWN_ID_MAP[sel] || sel;
          el = root?.getElementById(resolvedId) || document.getElementById(resolvedId) || null;
        }
        if (!el) {
          missing = true;
          return;
        }
        dom[sel] = el;
        if (el.dataset.characterDropdownBound === initToken) return;
        el.addEventListener('change', handleDropdownChange(sel, key), { signal });
        el.dataset.characterDropdownBound = initToken;
      });
      return !missing;
    };

    ensureDropdownChangeHandlers();
    dom.active.addEventListener('click', e => {
      const t = e.target.closest('.tag.removable, .db-chip.removable'); if (!t) return;
      const sec = t.dataset.type, val = t.dataset.val;
      if (sec === 'search') { F.search = F.search.filter(x => x !== val); }
      else if (sec === 'onlySel') { storeHelper.setOnlySelected(store, false); }
      else F[sec] = F[sec].filter(x => x !== val);
      if (sec === 'test') { storeHelper.setOnlySelected(store, false); dom.tstSel.value = ''; }
      activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
    }, { signal });

    // Treat clicks on tags anywhere as filter selections
    document.addEventListener('click', e => {
      const tag = e.target.closest('.filter-tag');
      if (tag && tag.classList.contains('conflict-flag')) return;
      if (!tag) return;
      const sectionMap = { ark_trad: 'ark', ark: 'ark', typ: 'typ', test: 'test' };
      const section = sectionMap[tag.dataset.section];
      if (!section) return;
      const val = tag.dataset.val;
      if (!F[section].includes(val)) F[section].push(val);
      if (section === 'typ') openCatsOnce.add(val);
      activeTags(); renderSkills(filtered()); renderTraits();
    }, { signal });

    function formatLevels(list) {
      if (list.length === 0) return '';
      if (list.length === 1) return list[0];
      if (list.length === 2) return `${list[0]} och ${list[1]}`;
      return `${list.slice(0, -1).join(', ')} och ${list[list.length - 1]}`;
    }

    function openConflictPanelFor(entryName) {
      if (!entryName) return false;
      const currentList = storeHelper.getCurrentList(store);
      const current = currentList.find(x => x.namn === entryName);
      const curKeys = getActiveHandlingKeys(current || {});
      const curNames = curKeys.map(k => handlingName(current || {}, k));
      let baseName = entryName;
      let levelsText = '';
      if (curKeys.length) {
        if (curKeys.every(k => !LVL.includes(k))) {
          baseName = `${entryName}: ${curNames.join(', ')}`;
        } else {
          const lvlWord = curNames.length === 1 ? 'nivån' : 'nivåerna';
          levelsText = ` på ${lvlWord} ${formatLevels(curNames)}`;
        }
      }
      conflictTitle.textContent = `${baseName}${levelsText} kan ej användas samtidigt som:`;
      const conflicts = findConflictingEntries(current || { namn: entryName }, currentList);
      renderConflicts(conflicts);
      conflictPanel.classList.add('open');
      conflictPanel.scrollTop = 0;
      return true;
    }

    function renderConflictTabButton() {
      return '<button class="info-tab" data-tab="conflict" type="button">Konflikter</button>';
    }

    /* ta bort & nivåbyte */
    dom.valda.addEventListener('click', async e => {
      const conflictFlag = e.target.closest('.conflict-flag');
      if (conflictFlag) {
        const liEl = conflictFlag.closest('li');
        const infoBtn = liEl?.querySelector('button[data-info]');
        if (infoBtn?.dataset.info) {
          let html = decodeURIComponent(infoBtn.dataset.info || '');
          const title = liEl?.querySelector('.card-title .entry-title-main')?.textContent || '';
          yrkePanel.open(title, html, { initialTab: 'conflict' });
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target.closest('.filter-tag')) return;
      if (e.target.closest('.entry-collapse-btn')) return;
      const header = e.target.closest('.card-header');
      if (header && !e.target.closest('button, a, select, input, textarea, [contenteditable="true"], [role="button"]')) {
        return;
      }
      const conflictBtn = e.target.closest('.conflict-btn');
      if (conflictBtn) {
        openConflictPanelFor(conflictBtn.dataset.name);
        return;
      }
      const infoBtn = e.target.closest('button[data-info]');
      if (infoBtn) {
        let html = decodeURIComponent(infoBtn.dataset.info || '');
        const liEl = infoBtn.closest('li');
        const title = liEl?.querySelector('.card-title .entry-title-main')?.textContent || '';
        const entryName = liEl?.dataset.name || title;
        if (infoBtn.dataset.tabell != null) {
          const terms = [...F.search, ...(sTemp ? [sTemp] : [])].map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
          if (terms.length) {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            highlightInElement(tmp, terms);
            html = tmp.innerHTML;
          }
          await window.openTablePopup?.(html, title);
          return;
        }
        {
          const terms = [...F.search, ...(sTemp ? [sTemp] : [])].map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
          if (terms.length) {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            highlightInElement(tmp, terms);
            html = tmp.innerHTML;
          }
        }
        yrkePanel.open(title, html);
        return;
      }
      const actBtn = e.target.closest('button[data-act]');
      if (!actBtn) return;
      const act = actBtn.dataset.act;
      const liEl = actBtn.closest('li');
      if (!liEl) return;
      const name = actBtn.dataset.name || liEl.dataset.name;
      const removeScenarioId = shouldProfileRemoveActions() && (act === 'sub' || act === 'del' || act === 'rem')
        ? window.symbaroumPerf?.startScenario?.('remove-item-from-character', {
          scope: 'character',
          entry: name
        })
        : null;
      const abortRemoveScenario = (detail = {}) => {
        cancelRemoveScenario(removeScenarioId, {
          scope: 'character',
          entry: name,
          branch: 'list',
          ...detail
        });
      };
      const idAttr = actBtn.dataset.id || liEl.dataset.id || null;
      const ref = { id: idAttr || undefined, name };
      const tr = liEl.dataset.trait || null;
      const before = storeHelper.getCurrentList(store);
      const disBefore = storeHelper.countDisadvantages(before);
      let pendingDisadvWarning = '';
      let p = idAttr ? before.find(x => String(x.id) === String(idAttr)) : null;
      if (!p && name) p = before.find(x => x.namn === name);
      if (!p) p = lookupEntry(ref);
      if (!p) {
        abortRemoveScenario({ cancelled: true, reason: 'missing-entry' });
        return;
      }
      if (removeScenarioId) {
        bindRemoveScenario(removeScenarioId, {
          scope: 'character',
          entry: name,
          branch: 'list'
        });
      }
      const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
      const handleEntryEdited = () => {
        refreshCharacterFilters();
        activeTags();
        renderSkills(filtered());
        renderTraits();
        updateSearchDatalist();
        if (window.invUtil && typeof window.invUtil.renderInventory === 'function') {
          window.invUtil.renderInventory();
        }
        updateXP();
      };
      if (act === 'editCustom') {
        if (!window.invUtil || typeof window.invUtil.editCustomEntry !== 'function') return;
        window.invUtil.editCustomEntry(p, handleEntryEdited);
        return;
      }
      if (act === 'editArtifact') {
        if (!window.invUtil || typeof window.invUtil.editArtifactEntry !== 'function') {
          if (typeof alertPopup === 'function') await alertPopup('Kan inte redigera artefakten just nu.');
          return;
        }
        const success = await window.invUtil.editArtifactEntry(p, { trait: tr }, handleEntryEdited);
        if (!success) {
          if (typeof alertPopup === 'function') await alertPopup('Föremålet hittades inte i inventariet.');
        }
        return;
      }
      const multi = getEntryMaxCount(p) > 1 && !p.trait;
      let list;
      let mutationSummary = null;
      let choiceResolution = null;
      let requirementAffectedEntries = [];
      if (act === 'add') {
        if (!multi) return;
        const lvlSel = liEl.querySelector('select.level');
        let lvl = lvlSel ? lvlSel.value : null;
        if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || p.nivå;
        if (!lvl) {
          const xpLevelTypes = new Set(['Förmåga', 'Basförmåga', 'Mystisk kraft', 'Särdrag', 'Monstruöst särdrag']);
          const types = Array.isArray(p?.taggar?.typ) ? p.taggar.typ : [];
          const shouldResolveLevel = types.some(type => xpLevelTypes.has(String(type || '').trim()));
          if (shouldResolveLevel && typeof storeHelper.resolveEntryLevel === 'function') {
            const resolved = storeHelper.resolveEntryLevel(p);
            if (resolved) lvl = resolved;
          }
        }
        const levelCandidate = { ...p, nivå: lvl };
        const stopResult = typeof window.rulesHelper?.evaluateEntryStops === 'function'
          ? window.rulesHelper.evaluateEntryStops(levelCandidate, before, {
            action: 'add',
            level: lvl
          })
          : (() => {
            const requirementReasons = (typeof window.rulesHelper?.getMissingRequirementReasonsForCandidate === 'function'
              ? window.rulesHelper.getMissingRequirementReasonsForCandidate(levelCandidate, before, { level: lvl })
              : []);
            const conflictRes = (typeof window.rulesHelper?.getConflictResolutionForCandidate === 'function'
              ? window.rulesHelper.getConflictResolutionForCandidate(levelCandidate, before, { level: lvl })
              : { blockingReasons: [], replaceTargetNames: [] });
            const blockingConflicts = conflictRes.blockingReasons;
            return {
              requirementReasons,
              blockingConflicts,
              replaceTargetNames: conflictRes.replaceTargetNames || [],
              grantedLevelStop: null,
              hardStops: [],
              hasStops: Boolean(requirementReasons.length || blockingConflicts.length)
            };
          })();
        const hasReplaceTargets = Array.isArray(stopResult.replaceTargetNames) && stopResult.replaceTargetNames.length > 0;
        let forceRuleOverride = false;
        let conflictBaseList = before;
        if (stopResult.hasStops || hasReplaceTargets) {
          const decision = await resolveRuleStopDecision(name, levelCandidate, before, stopResult, 'add', {
            level: lvl
          });
          if (decision?.action === 'cancel') return;
          forceRuleOverride = decision?.action === 'override';
          if (decision?.action === 'apply' && Array.isArray(decision?.state?.projectedRequirementList)) {
            conflictBaseList = decision.state.projectedRequirementList;
            requirementAffectedEntries = Array.isArray(decision?.state?.affectedEntries)
              ? decision.state.affectedEntries
              : [];
          }
        }
        if (stopResult.hasStops && !forceRuleOverride && conflictBaseList === before) return;

        if (!forceRuleOverride && hasReplaceTargets) {
          const replaceSet = new Set(
            stopResult.replaceTargetNames
              .map(value => String(value || '').trim())
              .filter(Boolean)
          );
          conflictBaseList = conflictBaseList.filter(entry => !replaceSet.has(entry?.namn || '') || entry?.manualRuleOverride);
        }
        const added = { ...p, nivå: lvl };
        const addChoice = await pickCharacterEntryChoice(added, conflictBaseList, lvl);
        if (addChoice.hasChoice && addChoice.cancelled) {
          if (addChoice.noOptions) {
            await alertPopup(`Inga val kvar för "${p.namn}".`);
          } else if (addChoice.duplicateRejected && addChoice.rule?.duplicate_policy === 'reject') {
            await alertPopup('Samma val är redan valt.');
          }
          return;
        }
        let replacedExisting = null;
        if (addChoice.hasChoice && addChoice.rule?.field) {
          const field = addChoice.rule.field;
          added[field] = addChoice.value;
          if (addChoice.duplicate?.replaceExisting) {
            const wanted = normalizeChoiceToken(addChoice.value);
            replacedExisting = conflictBaseList.find(item =>
              item
              && isSameChoiceSource(item, added)
              && normalizeChoiceToken(item?.[field]) === wanted
            ) || null;
            if (replacedExisting) {
              replacedExisting.nivå = lvl;
            }
          }
        }
        if (forceRuleOverride) added.manualRuleOverride = true;
        if (replacedExisting && forceRuleOverride) {
          replacedExisting.manualRuleOverride = true;
        }
        list = replacedExisting ? conflictBaseList : [...conflictBaseList, added];
        const cap = Number(storeHelper.getErfRules?.()?.disadvantageCap || 5);
        const disAfter = storeHelper.countDisadvantages(list);
        if (disAfter >= cap && disBefore < cap) {
          pendingDisadvWarning = 'cap';
        } else if (disAfter > cap && disBefore <= cap) {
          pendingDisadvWarning = 'over-cap';
        }
      } else if (act === 'sub' || act === 'del' || act === 'rem') {
        if (name === 'Mörkt förflutet' && before.some(x => x.namn === 'Mörkt blod')) {
          if (!(await confirmPopup('Mörkt förflutet hänger ihop med Mörkt blod. Ta bort ändå?'))) {
            abortRemoveScenario({ cancelled: true, reason: 'dark-past-confirm' });
            return;
          }
        }
        if (isMonstrousTrait(p)) {
          const missingBefore = window.rulesHelper?.getMissingRequirementReasonsForCandidate?.(p, before) || ['unknown'];
          if (missingBefore.length === 0) {
            if (!(await confirmPopup(name + ' är ett monstruöst särdrag. Ta bort ändå?'))) {
              abortRemoveScenario({ cancelled: true, reason: 'monstrous-trait-confirm' });
              return;
            }
          }
        }
        if (act === 'sub') {
          // Remove a single instance
          let removed = false;
          list = [];
          for (const it of before) {
            if (!removed && it.namn === name && !it.trait) {
              removed = true; continue;
            }
            list.push(it);
          }
        } else if (act === 'del' || act === 'rem') {
          // Remove all instances
          list = before.filter(x => !(x.namn === name && (tr ? x.trait === tr : !x.trait)));
        } else {
          return;
        }
        const removed = before.find(it => it.namn === name && (tr ? it.trait === tr : !it.trait));
        if (removed && !(await handleSnapshotEntryRemoval(removed, store))) {
          abortRemoveScenario({ cancelled: true, reason: 'snapshot-removal-confirm' });
          return;
        }
        const remDeps = storeHelper.getDependents(before, removed);
        if (name === 'Mörkt blod' && remDeps.length) {
          if (await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)) {
            list = list.filter(x => !remDeps.includes(x.namn));
          }
        } else if (remDeps.length) {
          if (!(await confirmPopup(`F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${remDeps.join(', ')}. Ta bort \u00e4nd\u00e5?`))) {
            abortRemoveScenario({ cancelled: true, reason: 'dependent-confirm' });
            return;
          }
        }
        if (eliteReq.canChange(before) && !eliteReq.canChange(list)) {
          const deps = before
            .filter(isElityrke)
            .filter(el => eliteReq.check(el, before).ok && !eliteReq.check(el, list).ok)
            .map(el => el.namn);
          const msg = deps.length
            ? `F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${deps.join(', ')}. Ta bort \u00e4nd\u00e5?`
            : 'F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r ett valt elityrke. Ta bort \u00e4nd\u00e5?';
          if (!(await confirmPopup(msg))) {
            abortRemoveScenario({ cancelled: true, reason: 'elite-requirement-confirm' });
            return;
          }
        }
        flashRemoved(liEl);
        await new Promise(r => setTimeout(r, 100));
      } else {
        return;
      }
      if ((act === 'sub' || act === 'del' || act === 'rem') && typeof storeHelper.getEntriesToBeCleanedByGrants === 'function') {
        const toClean = storeHelper.getEntriesToBeCleanedByGrants(store, list, before);
        if (toClean.length > 0) {
          const cleanNames = [...new Set(toClean.map(r => r.entry?.namn).filter(Boolean))].join(', ');
          if (await confirmPopup(`Att ta bort "${name}" tar även bort automatiskt tillagda förmågor: ${cleanNames}.\nVill du behålla dessa ändå?`)) {
            toClean.forEach(r => { if (r.entry) r.entry.manualRuleOverride = true; });
          }
        }
      }
      const isRemoveAction = act === 'sub' || act === 'del' || act === 'rem';
      if (isRemoveAction) {
        await runCurrentCharacterMutationBatch(async () => {
          mutationSummary = timeActiveRemoveStage('store-mutation', () => {
            return storeHelper.setCurrentList(store, list);
          }, {
            surface: 'character',
            branch: 'list'
          });
          await resolvePendingChoiceEntries(mutationSummary?.grantedEntriesAdded);
          if (p.namn === 'Besittning') {
            storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          }
          if ((p.taggar?.typ || []).includes('Artefakt')) {
            const inv = storeHelper.getInventory(store);
            const removeItem = arr => {
              for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i].id === p.id) arr.splice(i, 1);
                else if (Array.isArray(arr[i].contains)) removeItem(arr[i].contains);
              }
            };
            removeItem(inv);
            timeActiveRemoveStage('inventory-sync', () => {
              invUtil.saveInventory(inv, {
                source: 'character-artifact-remove',
                skipCharacterRefresh: true
              });
            }, {
              surface: 'character',
              branch: 'list'
            });
            storeHelper.removeRevealedArtifact(store, p.id);
          }
        });
      } else {
        mutationSummary = await withBusyInteraction(actBtn, () => (
          runDeferredCurrentCharacterMutation(() => (
            storeHelper.setCurrentList(store, list)
          ))
        ));
        const pendingChoiceEntries = []
          .concat(Array.isArray(mutationSummary?.addedEntries) ? mutationSummary.addedEntries : [])
          .concat(Array.isArray(requirementAffectedEntries) ? requirementAffectedEntries : [])
          .concat(Array.isArray(mutationSummary?.grantedEntriesAdded) ? mutationSummary.grantedEntriesAdded : []);
        choiceResolution = await resolvePendingChoiceEntries(pendingChoiceEntries);
      }
      if (p.namn === 'Privilegierad') {
        invUtil.renderInventory();
      }
      if (p.namn === 'Besittning') {
        if (act === 'add') {
          const amount = Math.floor(Math.random() * 10) + 11;
          storeHelper.setPossessionMoney(store, { daler: amount, skilling: 0, 'örtegar': 0 });
          await alertPopup(`Grattis! Din besittning har tjänat dig ${amount} daler!`);
        }
        invUtil.renderInventory();
      }
      if (!isRemoveAction && (p.taggar?.typ || []).includes('Artefakt')) {
        const inv = storeHelper.getInventory(store);
        const removeItem = arr => {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].id === p.id) arr.splice(i, 1);
            else if (Array.isArray(arr[i].contains)) removeItem(arr[i].contains);
          }
        };
        removeItem(inv);
        invUtil.saveInventory(inv);
        invUtil.renderInventory();
        storeHelper.removeRevealedArtifact(store, p.id);
      }
      if (isRemoveAction) {
        timeActiveRemoveStage('selection-render', () => {
          renderSkills(filtered());
        }, {
          surface: 'character',
          branch: 'list'
        });
        timeActiveRemoveStage('derived-refresh', () => {
          updateXP();
          renderTraits();
        }, {
          surface: 'character',
          branch: 'list'
        });
        updateSearchDatalist();
      } else {
        scheduleCharacterMutationRefresh({
          xp: true,
          traits: true,
          summary: true,
          effects: true,
          source: act === 'add' ? 'character-list-add' : 'character-list-mutate',
          afterPaint: true
        });
        let needsSelectionRefresh = !canTargetCharacterSelectionAddMutation(mutationSummary, name);
        (choiceResolution?.summaries || []).forEach(summary => {
          if (!canTargetCharacterSelectionAddMutation(summary, name)) {
            needsSelectionRefresh = true;
          }
        });
        let patchedInPlace = false;
        if (!needsSelectionRefresh) {
          const liveEntry = findCharacterSelectionEntry({ name, trait: tr });
          patchedInPlace = replaceCharacterSelectionCard(liEl, liveEntry);
        }
        if (needsSelectionRefresh || !patchedInPlace) {
          refreshCharacterSelection();
        }
        refreshCharacterFilters();
        if (pendingDisadvWarning === 'cap') {
          await new Promise(resolve => setTimeout(resolve, 120));
          await alertPopup('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
        } else if (pendingDisadvWarning === 'over-cap') {
          window.toast?.('Nackdelar över fem ger +0 Erf.');
        }
      }
      if (act === 'add') {
        void waitForCharacterMutationRefresh().then(() => {
          flashAdded(name, tr);
        });
      } else if (isRemoveAction) {
        await finishRemoveScenario(removeScenarioId, {
          scope: 'character',
          entry: name,
          branch: 'list'
        });
      }

    }, { signal });

    if (dom.valda) {
      dom.valda.addEventListener('entry-card-toggle', () => {
        updateCatToggle();
        refreshEffectsPanel();
      }, { signal });
    }
    dom.valda.addEventListener('change', async e => {
      if (!e.target.matches('select.level')) return;
      const select = e.target;
      window.entryCardFactory?.syncLevelControl?.(select);
      const name = select.dataset.name;
      const cardEl = select.closest('li');
      const tr = select.dataset.trait || cardEl?.dataset?.trait || null;
      const list = storeHelper.getCurrentList(store);
      const ent = list.find(x => x.namn === name && (tr ? x.trait === tr : !x.trait));
      if (ent) {
        const before = list.map(x => ({ ...x }));
        const old = ent.nivå;
        const nextLevel = select.value;
        const levelScenarioId = shouldProfileLevelChanges()
          ? window.symbaroumPerf?.startScenario?.('character-level-change', {
            scope: 'character',
            entry: name,
            branch: 'list',
            fromLevel: old || '',
            toLevel: nextLevel || ''
          })
          : null;
        if (levelScenarioId) {
          bindLevelScenario(levelScenarioId, {
            scope: 'character',
            entry: name,
            branch: 'list',
            fromLevel: old || '',
            toLevel: nextLevel || ''
          });
        }
        const previousChoiceRule = (() => {
          const picker = window.choicePopup;
          if (!picker || typeof picker.getChoiceRule !== 'function') return null;
          const prevCandidate = { ...ent, nivå: old };
          const prevContext = {
            list: Array.isArray(list) ? list : [],
            entry: prevCandidate,
            sourceEntry: prevCandidate,
            level: old || '',
            sourceLevel: old || ''
          };
          try {
            return picker.getChoiceRule(prevCandidate, prevContext, { fallbackLegacy: true });
          } catch (_) {
            return null;
          }
        })();
        const updatedEntry = { ...ent, nivå: nextLevel };
        const originalEntry = { ...ent };
        const originalMatchOptions = buildChoiceEntryMatchOptions(originalEntry);
        const levelChoice = await pickCharacterEntryChoice(updatedEntry, before, updatedEntry.nivå, ent, {
          promptIfMissingOnly: true
        });
        if (levelChoice.hasChoice) {
          if (levelChoice.cancelled) {
            select.value = old;
            window.entryCardFactory?.syncLevelControl?.(select);
            if (levelChoice.noOptions) {
              await alertPopup(`Inga val kvar för "${name}".`);
            } else if (levelChoice.duplicateRejected && levelChoice.rule?.duplicate_policy === 'reject') {
              await alertPopup('Samma val är redan valt.');
            }
            cancelLevelScenario(levelScenarioId, {
              scope: 'character',
              entry: name,
              branch: 'list',
              reason: levelChoice.noOptions ? 'no-options' : (
                levelChoice.duplicateRejected ? 'duplicate-rejected' : 'choice-cancelled'
              )
            });
            return;
          }
          const field = levelChoice.rule?.field;
          if (field) {
            updatedEntry[field] = levelChoice.value;
          }
        } else {
          const staleField = previousChoiceRule?.field;
          if (staleField && Object.prototype.hasOwnProperty.call(updatedEntry, staleField)) {
            delete updatedEntry[staleField];
          } else if (name === 'Monsterlärd' && updatedEntry.trait) {
            delete updatedEntry.trait;
          }
        }
        let nextList = before.map(item => ({ ...item }));
        const currentEntry = findMatchingCharacterListEntry(nextList, originalEntry, originalMatchOptions);
        const currentIndex = currentEntry ? nextList.indexOf(currentEntry) : -1;
        let finalEntry = { ...updatedEntry };
        if (currentIndex >= 0) {
          nextList[currentIndex] = finalEntry;
        } else {
          nextList.push(finalEntry);
        }
        if (levelChoice.hasChoice && levelChoice.rule?.field && levelChoice.duplicate?.replaceExisting) {
          const field = levelChoice.rule.field;
          const wanted = normalizeChoiceToken(levelChoice.value);
          for (let i = nextList.length - 1; i >= 0; i--) {
            const item = nextList[i];
            if (!item || item === finalEntry) continue;
            if (!isSameChoiceSource(item, finalEntry)) continue;
            if (normalizeChoiceToken(item?.[field]) !== wanted) continue;
            nextList.splice(i, 1);
          }
        }
        const stopResult = typeof window.rulesHelper?.evaluateEntryStops === 'function'
          ? window.rulesHelper.evaluateEntryStops(finalEntry, before, {
            action: 'level-change',
            fromLevel: old,
            toLevel: finalEntry.nivå,
            level: finalEntry.nivå,
            beforeList: before,
            afterList: nextList
          })
          : (() => {
            const requirementReasons = (typeof window.rulesHelper?.getMissingRequirementReasonsForCandidate === 'function'
              ? window.rulesHelper.getMissingRequirementReasonsForCandidate(finalEntry, before, { level: finalEntry.nivå })
              : []);
            const conflictRes = (typeof window.rulesHelper?.getConflictResolutionForCandidate === 'function'
              ? window.rulesHelper.getConflictResolutionForCandidate(finalEntry, before, { level: finalEntry.nivå })
              : { blockingReasons: [], replaceTargetNames: [] });
            const blockingConflicts = conflictRes.blockingReasons;
            return {
              requirementReasons,
              blockingConflicts,
              replaceTargetNames: conflictRes.replaceTargetNames || [],
              grantedLevelStop: null,
              hardStops: [],
              hasStops: Boolean(requirementReasons.length || blockingConflicts.length)
            };
          })();
        let forceRuleOverride = false;
        let requirementAffectedEntries = [];
        if (stopResult.hasStops) {
          const decision = await resolveRuleStopDecision(name, finalEntry, before, stopResult, 'level-change', {
            level: finalEntry.nivå,
            fromLevel: old,
            toLevel: finalEntry.nivå,
            replaceTargetUid: finalEntry?.__uid || ''
          });
          if (decision?.action === 'cancel') {
            select.value = old;
            window.entryCardFactory?.syncLevelControl?.(select);
            cancelLevelScenario(levelScenarioId, {
              scope: 'character',
              entry: name,
              branch: 'list',
              reason: 'requirements-blocked'
            });
            return;
          }
          forceRuleOverride = decision?.action === 'override';
          if (decision?.action === 'apply' && Array.isArray(decision?.state?.projectedList)) {
            nextList = decision.state.projectedList;
            requirementAffectedEntries = Array.isArray(decision?.state?.affectedEntries)
              ? decision.state.affectedEntries
              : [];
            finalEntry = findMatchingCharacterListEntry(
              nextList,
              finalEntry,
              buildChoiceEntryMatchOptions(finalEntry)
            ) || finalEntry;
          }
        }
        if (stopResult.hasStops && !forceRuleOverride) {
          select.value = old;
          window.entryCardFactory?.syncLevelControl?.(select);
          cancelLevelScenario(levelScenarioId, {
            scope: 'character',
            entry: name,
            branch: 'list',
            reason: 'requirements-blocked'
          });
          return;
        }
        if (forceRuleOverride) finalEntry.manualRuleOverride = true;
        if (typeof storeHelper.getEntriesToBeCleanedByGrants === 'function') {
          const toClean = storeHelper.getEntriesToBeCleanedByGrants(store, nextList, before);
          if (toClean.length > 0) {
            const cleanNames = [...new Set(toClean.map(r => r.entry?.namn).filter(Boolean))].join(', ');
            if (await confirmPopup(`Att ändra nivån på "${name}" tar bort automatiskt tillagda förmågor: ${cleanNames}.\nVill du behålla dessa ändå?`)) {
              toClean.forEach(r => { if (r.entry) r.entry.manualRuleOverride = true; });
            }
          }
        }
        const mutationSummary = await withBusyInteraction(select, () => (
          runDeferredCurrentCharacterMutation(() => (
            timeActiveLevelStage('store-mutation', () => (
              storeHelper.setCurrentList(store, nextList)
            ), {
              surface: 'character',
              branch: 'list'
            })
          ))
        ));
        const pendingChoiceEntries = []
          .concat(Array.isArray(mutationSummary?.addedEntries) ? mutationSummary.addedEntries : [])
          .concat(Array.isArray(requirementAffectedEntries) ? requirementAffectedEntries : [])
          .concat(Array.isArray(mutationSummary?.grantedEntriesAdded) ? mutationSummary.grantedEntriesAdded : []);
        const choiceResolution = await timeActiveLevelStage('pending-choice-resolution', () => (
          resolvePendingChoiceEntries(pendingChoiceEntries)
        ), {
          surface: 'character',
          branch: 'list'
        });
        scheduleCharacterMutationRefresh({
          xp: true,
          traits: true,
          summary: true,
          effects: true,
          source: 'character-level-change',
          afterPaint: true
        });
        let needsSelectionRefresh = Boolean(mutationSummary?.topologyChanged);
        (choiceResolution?.summaries || []).forEach(summary => {
          if (summary?.topologyChanged) needsSelectionRefresh = true;
        });
        let renderMode = 'targeted';
        const patchedInPlace = timeActiveLevelStage('targeted-ui-refresh', () => {
          if (needsSelectionRefresh) return false;
          const liveEntry = findMatchingCharacterListEntry(
            storeHelper.getCurrentList(store),
            finalEntry,
            buildChoiceEntryMatchOptions(finalEntry)
          ) || finalEntry;
          return replaceCharacterSelectionCard(cardEl, liveEntry);
        }, {
          surface: 'character',
          branch: 'list'
        });
        if (needsSelectionRefresh || !patchedInPlace) {
          renderMode = 'full';
          timeActiveLevelStage('selection-render', () => {
            refreshCharacterSelection();
          }, {
            surface: 'character',
            branch: 'list'
          });
        }
        refreshCharacterFilters();
        await waitForCharacterMutationRefresh();
        flashAdded(name, tr);
        await finishLevelScenario(levelScenarioId, {
          scope: 'character',
          entry: name,
          branch: 'list',
          renderMode,
          structural: needsSelectionRefresh
        });
        return;
      }
      window.entryCardFactory?.syncLevelControl?.(select);
    }, { signal });
  }

  window.initCharacter = initCharacter;
})(window);
