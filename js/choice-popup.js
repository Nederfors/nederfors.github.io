(function(window){
  const CHOICE_EMPTY_VALUE_KEY = '__empty__';

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  }

  function normalizeText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeValue(value) {
    if (value === undefined || value === null) return '';
    return String(value);
  }

  function normalizeOptionKey(value) {
    const token = normalizeText(normalizeValue(value));
    return token || CHOICE_EMPTY_VALUE_KEY;
  }

  function createPopup() {
    if (document.getElementById('choicePopup')) return;
    const div = document.createElement('div');
    div.id = 'choicePopup';
    div.className = 'popup picker-popup';
    div.innerHTML = `<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 id="choiceTitle" class="picker-popup-title">Välj alternativ</h3><button id="choiceClose" class="char-btn icon picker-popup-close" type="button" title="Stäng">✕</button></header><p id="choiceSubtitle" class="picker-popup-subtitle" hidden></p><label id="choiceSearchLabel" for="choiceSearch" class="picker-popup-search-label" hidden>Sök</label><input id="choiceSearch" class="picker-popup-search-input" type="search" placeholder="Sök..." autocomplete="off" spellcheck="false" hidden><div id="choiceOpts" class="picker-popup-options"></div><p id="choiceEmpty" class="picker-popup-empty" hidden>Inga alternativ matchar sökningen.</p><div class="picker-popup-actions"><button id="choiceCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function normalizeOption(raw, index) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const value = raw.value !== undefined
        ? raw.value
        : (raw.varde !== undefined ? raw.varde : raw.id);
      const normalizedValue = normalizeValue(value);
      const label = raw.label !== undefined
        ? String(raw.label)
        : (raw.namn !== undefined ? String(raw.namn) : normalizedValue);
      return {
        idx: index,
        value: normalizedValue,
        label: label || normalizedValue,
        searchText: normalizeText(raw.search || `${label} ${normalizedValue}`),
        disabled: Boolean(raw.disabled),
        disabledReason: raw.disabledReason ? String(raw.disabledReason) : ''
      };
    }
    const normalizedValue = normalizeValue(raw);
    return {
      idx: index,
      value: normalizedValue,
      label: normalizedValue,
      searchText: normalizeText(normalizedValue),
      disabled: false,
      disabledReason: ''
    };
  }

  function fallbackResolveOptions(rule, context = {}) {
    const out = [];
    const usedSet = new Set(
      toArray(context.usedValues)
        .map(normalizeValue)
        .filter(Boolean)
        .map(normalizeText)
    );

    const rawOptions = toArray(rule?.options)
      .map((raw, idx) => normalizeOption(raw, idx))
      .filter(Boolean);

    const source = rule?.source && typeof rule.source === 'object'
      ? rule.source
      : null;
    if (source) {
      const db = Array.isArray(window.DB) ? window.DB : [];
      const wantedTypes = toArray(source.typ).map(type => String(type || '').trim()).filter(Boolean);
      const valueField = String(source.value_field || source.field || 'namn').trim() || 'namn';
      const sortMode = String(source.sort || 'alpha').trim().toLowerCase();
      const sourceOptions = db
        .filter(entry => entry && typeof entry === 'object')
        .filter(entry => {
          if (!wantedTypes.length) return true;
          return wantedTypes.some(typeName => {
            if (typeof window.rulesHelper?.evaluateNar !== 'function') return false;
            try {
              return window.rulesHelper.evaluateNar({ typ: [typeName] }, { sourceEntry: entry });
            } catch (_) {
              return false;
            }
          });
        })
        .map((entry, idx) => {
          const rawValue = entry[valueField] !== undefined ? entry[valueField] : entry.namn;
          const value = normalizeValue(rawValue);
          if (!value && value !== '0') return null;
          return {
            idx,
            value,
            label: String(entry.namn || value),
            searchText: normalizeText(`${entry.namn || ''} ${value}`),
            disabled: false,
            disabledReason: ''
          };
        })
        .filter(Boolean);
      if (sortMode !== 'none') {
        sourceOptions.sort((a, b) => String(a.label).localeCompare(String(b.label), 'sv'));
      }
      out.push(...sourceOptions);
    }

    out.push(...rawOptions);

    const dedupe = new Set();
    const deduped = out.filter(option => {
      const key = normalizeOptionKey(option.value);
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });

    const excludeUsed = Boolean(rule?.exclude_used);
    const filtered = excludeUsed
      ? deduped.filter(option => {
        const token = normalizeText(option.value);
        if (!token) return true;
        return !usedSet.has(token);
      })
      : deduped;

    return filtered;
  }

  function resolveRuleOptions(rule, context = {}) {
    if (typeof window.rulesHelper?.resolveChoiceOptions === 'function') {
      try {
        const result = window.rulesHelper.resolveChoiceOptions(rule, context);
        if (Array.isArray(result)) {
          return result
            .map((raw, idx) => normalizeOption(raw, idx))
            .filter(Boolean);
        }
      } catch (_) {
        // Fall through to local fallback.
      }
    }
    return fallbackResolveOptions(rule, context);
  }

  function open(config = {}) {
    createPopup();
    const pop = document.getElementById('choicePopup');
    const inner = pop.querySelector('.popup-inner');
    const titleEl = pop.querySelector('#choiceTitle');
    const subtitleEl = pop.querySelector('#choiceSubtitle');
    const searchLabel = pop.querySelector('#choiceSearchLabel');
    const searchInput = pop.querySelector('#choiceSearch');
    const box = pop.querySelector('#choiceOpts');
    const emptyEl = pop.querySelector('#choiceEmpty');
    const cancelBtn = pop.querySelector('#choiceCancel');
    const closeBtn = pop.querySelector('#choiceClose');

    const title = String(config.title || 'Välj alternativ').trim();
    const subtitle = String(config.subtitle || '').trim();
    const searchEnabled = Boolean(config.search);
    const allOptions = toArray(config.options)
      .map((raw, idx) => normalizeOption(raw, idx))
      .filter(Boolean);

    let shown = allOptions.slice();
    let done = false;
    let currentResult = null;
    let resolvePromise = () => {};

    titleEl.textContent = title;
    if (subtitle) {
      subtitleEl.hidden = false;
      subtitleEl.textContent = subtitle;
    } else {
      subtitleEl.hidden = true;
      subtitleEl.textContent = '';
    }

    searchLabel.hidden = !searchEnabled;
    searchInput.hidden = !searchEnabled;
    if (searchEnabled) {
      searchInput.value = '';
    }

    function render() {
      const term = searchEnabled ? normalizeText(searchInput.value) : '';
      shown = allOptions.filter(option => !term || option.searchText.includes(term));
      box.innerHTML = shown.length
        ? shown.map((option, idx) => {
          const disabled = option.disabled ? ' disabled aria-disabled="true"' : '';
          const titleAttr = option.disabledReason ? ` title="${option.disabledReason.replace(/"/g, '&quot;')}"` : '';
          const cls = option.disabled ? 'char-btn disabled' : 'char-btn';
          return `<button data-i="${idx}" class="${cls}" type="button"${disabled}${titleAttr}>${option.label}</button>`;
        }).join('')
        : '<button class="char-btn" type="button" disabled>Inga val kvar</button>';
      emptyEl.hidden = shown.length !== 0;
    }

    let popupSession = null;
    const usingManager = Boolean(window.popupManager?.open && window.popupManager?.close && pop?.id);

    function cleanup() {
      box.innerHTML = '';
      if (searchEnabled) searchInput.value = '';
      box.removeEventListener('click', onClick);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      if (!usingManager) pop.removeEventListener('click', onOutside);
      if (searchEnabled) searchInput.removeEventListener('input', onSearch);
    }

    function finish(result, reason = 'programmatic') {
      if (done) return;
      done = true;
       currentResult = result;
      if (popupSession?.close) {
        popupSession.close(reason);
      } else {
        pop.classList.remove('open');
        cleanup();
        resolvePromise(currentResult);
      }
    }

    function onClick(e) {
      const btn = e.target.closest('button[data-i]');
      if (!btn || btn.disabled) return;
      const idx = Number(btn.dataset.i);
      const option = shown[idx];
      if (!option) return;
      resolver(option.value);
    }

    function onCancel() {
      resolver(null);
    }

    function onOutside(e) {
      if (e.target === pop) resolver(null);
    }

    function onSearch() {
      render();
    }

    let resolver = () => {};

    render();
    if (usingManager) {
      popupSession = {
        close: (reason = 'programmatic') => window.popupManager.close(pop, reason)
      };
      window.popupManager.open(pop, {
        type: 'picker',
        onClose: () => {
          if (!done) {
            done = true;
            currentResult = null;
          }
          cleanup();
          resolvePromise(currentResult);
        }
      });
    } else {
      pop.classList.add('open');
    }
    if (inner) inner.scrollTop = 0;
    if (searchEnabled) {
      searchInput.focus();
    }

    return new Promise(resolve => {
      resolvePromise = resolve;
      resolver = (value) => {
        finish(value, value === null ? 'cancel' : 'select');
      };
      box.addEventListener('click', onClick);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      if (!usingManager) pop.addEventListener('click', onOutside);
      if (searchEnabled) searchInput.addEventListener('input', onSearch);
    });
  }

  function getChoiceRule(entry, context = {}, options = {}) {
    const fallbackLegacy = options.fallbackLegacy !== false;
    if (!entry || typeof entry !== 'object') return null;
    const helper = window.rulesHelper;
    if (!helper || typeof helper.getEntryChoiceRule !== 'function') {
      return null;
    }

    const ruleContext = { ...(context || {}) };
    let rule = helper.getEntryChoiceRule(entry, ruleContext);
    if (!rule && fallbackLegacy && typeof helper.getLegacyChoiceRule === 'function') {
      rule = helper.getLegacyChoiceRule(entry, ruleContext);
    }
    return rule || null;
  }

  async function pickForEntry(payload = {}) {
    const entry = payload.entry;
    if (!entry || typeof entry !== 'object') {
      return { hasChoice: false, value: null, rule: null, options: [] };
    }
    const context = payload.context && typeof payload.context === 'object'
      ? { ...payload.context }
      : {};
    if (!context.entry) context.entry = entry;
    if (!context.sourceEntry) context.sourceEntry = entry;
    if (!context.sourceLevel && (context.level || entry?.nivå)) {
      context.sourceLevel = context.level || entry.nivå;
    }
    const usedValues = toArray(payload.usedValues).map(normalizeValue);
    const currentValue = payload.currentValue !== undefined
      ? normalizeValue(payload.currentValue)
      : '';
    const rule = payload.rule || getChoiceRule(entry, context, {
      fallbackLegacy: payload.fallbackLegacy !== false
    });
    if (!rule) {
      return { hasChoice: false, value: null, rule: null, options: [] };
    }

    const options = resolveRuleOptions(rule, {
      ...context,
      entry,
      usedValues,
      currentValue
    });
    if (!options.length) {
      return { hasChoice: true, value: null, rule, options, noOptions: true, cancelled: true };
    }

    const value = await open({
      title: rule.title || 'Välj alternativ',
      subtitle: rule.subtitle || '',
      search: Boolean(rule.search),
      options
    });

    return {
      hasChoice: true,
      value,
      rule,
      options,
      cancelled: value === null
    };
  }

  function normalizePolicy(policy) {
    const raw = normalizeText(policy || '');
    if (raw === 'reject') return 'reject';
    if (raw === 'confirm') return 'confirm';
    if (raw === 'replace_existing') return 'replace_existing';
    return 'allow';
  }

  async function enforceDuplicatePolicy(payload = {}) {
    const rule = payload.rule || {};
    const value = normalizeValue(payload.value);
    const usedValues = toArray(payload.usedValues).map(normalizeValue);
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return { ok: true, duplicate: false, replaceExisting: false, policy: 'allow' };
    }

    const isDuplicate = usedValues.some(used => normalizeText(used) === normalizedValue);
    const policy = normalizePolicy(rule.duplicate_policy);
    if (!isDuplicate || policy === 'allow') {
      return { ok: true, duplicate: isDuplicate, replaceExisting: false, policy };
    }
    if (policy === 'reject') {
      return { ok: false, duplicate: true, replaceExisting: false, policy };
    }
    if (policy === 'replace_existing') {
      return { ok: true, duplicate: true, replaceExisting: true, policy };
    }

    const label = String(payload.label || payload.value || 'det valet').trim();
    const message = String(rule.duplicate_message || `Samma val finns redan (${label}). Lägga till ändå?`);
    let approved = false;
    if (typeof payload.confirmFn === 'function') {
      approved = await payload.confirmFn(message);
    } else if (typeof window.confirmPopup === 'function') {
      approved = await window.confirmPopup(message);
    } else {
      approved = window.confirm(message);
    }
    return { ok: Boolean(approved), duplicate: true, replaceExisting: false, policy };
  }

  window.choicePopup = {
    open,
    getChoiceRule,
    resolveRuleOptions,
    pickForEntry,
    enforceDuplicatePolicy,
    normalizeValue
  };
})(window);
