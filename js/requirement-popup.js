(function(window){
  const SECTION_ORDER = Object.freeze(['selected', 'available', 'locked', 'conflict', 'blocked']);
  const SECTION_LABELS = Object.freeze({
    selected: 'Valda',
    available: 'Tillgängliga',
    locked: 'Låsta bakom krav',
    conflict: 'Krockar',
    blocked: 'Övriga spärrar'
  });

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

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createPopup() {
    if (document.getElementById('requirementPopup')) return;

    const useDaub = typeof DAUB !== 'undefined' && DAUB.openModal;
    const div = document.createElement('div');
    div.id = 'requirementPopup';

    if (useDaub) {
      div.className = 'db-modal-overlay popup';
      div.setAttribute('aria-hidden', 'true');
      div.innerHTML = `
        <div class="db-modal requirement-popup-ui">
          <div class="db-modal__header requirement-popup-header">
            <div class="requirement-popup-copy">
              <div class="requirement-popup-kicker">Kravspärr</div>
              <h2 id="requirementTitle" class="requirement-popup-title">Lås upp krav</h2>
              <p id="requirementSubtitle" class="requirement-popup-subtitle"></p>
            </div>
            <button id="requirementClose" class="db-btn db-btn--icon requirement-popup-close" type="button" aria-label="Stäng">✕</button>
          </div>
          <div class="db-modal__body requirement-popup-body">
            <label id="requirementSearchLabel" for="requirementSearch" class="requirement-popup-search-label" hidden>Sök</label>
            <input id="requirementSearch" class="db-input requirement-popup-search-input" type="search" placeholder="Sök krav..." autocomplete="off" spellcheck="false" hidden>
            <div id="requirementStatus" class="requirement-popup-status" role="status" aria-live="polite"></div>
            <div id="requirementOptions" class="requirement-popup-options"></div>
            <p id="requirementEmpty" class="requirement-popup-empty" hidden>Inga krav matchar sökningen.</p>
          </div>
          <div class="db-modal__footer requirement-popup-actions">
            <button id="requirementApply" class="db-btn" type="button">Lägg till valda krav</button>
            <button id="requirementOverride" class="db-btn db-btn--danger" type="button">Lägg till ändå</button>
            <button id="requirementCancel" class="db-btn" type="button">Avbryt</button>
          </div>
        </div>
      `;
    } else {
      div.className = 'popup requirement-popup';
      div.innerHTML = `
        <div class="popup-inner requirement-popup-ui">
          <header class="requirement-popup-header">
            <div class="requirement-popup-copy">
              <div class="requirement-popup-kicker">Kravspärr</div>
              <h3 id="requirementTitle" class="requirement-popup-title">Lås upp krav</h3>
              <p id="requirementSubtitle" class="requirement-popup-subtitle"></p>
            </div>
            <button id="requirementClose" class="char-btn icon requirement-popup-close" type="button" title="Stäng">✕</button>
          </header>
          <div class="requirement-popup-body">
            <label id="requirementSearchLabel" for="requirementSearch" class="requirement-popup-search-label" hidden>Sök</label>
            <input id="requirementSearch" class="requirement-popup-search-input" type="search" placeholder="Sök krav..." autocomplete="off" spellcheck="false" hidden>
            <div id="requirementStatus" class="requirement-popup-status" role="status" aria-live="polite"></div>
            <div id="requirementOptions" class="requirement-popup-options"></div>
            <p id="requirementEmpty" class="requirement-popup-empty" hidden>Inga krav matchar sökningen.</p>
          </div>
          <div class="requirement-popup-actions">
            <button id="requirementApply" class="char-btn" type="button">Lägg till valda krav</button>
            <button id="requirementOverride" class="char-btn danger" type="button">Lägg till ändå</button>
            <button id="requirementCancel" class="char-btn" type="button">Avbryt</button>
          </div>
        </div>
      `;
    }

    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function getSectionKey(option) {
    if (option?.selected) return 'selected';
    if (!option?.disabled) return 'available';
    if (option?.status === 'locked') return 'locked';
    if (option?.status === 'conflict') return 'conflict';
    return 'blocked';
  }

  function getOptionSearchText(option) {
    return normalizeText([
      option?.name,
      option?.typeLabel,
      option?.level,
      option?.actionLabel,
      ...(Array.isArray(option?.reasons) ? option.reasons : []),
      ...(Array.isArray(option?.messages) ? option.messages : [])
    ].join(' '));
  }

  function renderOption(option, useDaub) {
    const key = String(option?.key || '').trim();
    if (!key) return '';

    const selected = Boolean(option?.selected);
    const disabled = Boolean(option?.disabled) && !selected;
    const buttonClass = useDaub ? 'db-btn requirement-option' : 'char-btn requirement-option';
    const stateClass = getSectionKey(option);
    const className = [
      buttonClass,
      `is-${stateClass}`,
      selected ? 'is-selected' : '',
      disabled ? 'is-disabled' : ''
    ].filter(Boolean).join(' ');
    const typeLabel = String(option?.typeLabel || '').trim();
    const currentLevel = String(option?.currentLevel || '').trim();
    const metaParts = [typeLabel, String(option?.actionLabel || '').trim()].filter(Boolean);
    if (option?.operation === 'upgrade' && currentLevel) {
      metaParts.push(`Nuvarande: ${currentLevel}`);
    }
    const reasonLine = Array.isArray(option?.reasons) && option.reasons.length
      ? option.reasons[0]
      : '';
    const statusLine = option?.disabled
      ? (Array.isArray(option?.messages) && option.messages.length ? option.messages[0] : String(option?.statusLabel || '').trim())
      : '';
    const tooltip = statusLine || reasonLine;

    return `
      <button
        data-key="${escapeHtml(key)}"
        data-aa-key="requirement:${escapeHtml(key)}"
        class="${className}"
        type="button"
        aria-pressed="${selected ? 'true' : 'false'}"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
        ${tooltip ? `title="${escapeHtml(tooltip)}"` : ''}
      >
        <span class="requirement-option-head">
          <span class="requirement-option-title">${escapeHtml(option?.name || '')}</span>
          <span class="requirement-option-chip">${escapeHtml(option?.actionLabel || '')}</span>
        </span>
        ${metaParts.length ? `<span class="requirement-option-meta">${escapeHtml(metaParts.join(' · '))}</span>` : ''}
        ${reasonLine ? `<span class="requirement-option-reason">${escapeHtml(reasonLine)}</span>` : ''}
        ${statusLine ? `<span class="requirement-option-status">${escapeHtml(statusLine)}</span>` : ''}
      </button>
    `;
  }

  function renderSection(sectionKey, options, useDaub) {
    const rows = Array.isArray(options) ? options : [];
    if (!rows.length) return '';
    const label = SECTION_LABELS[sectionKey] || sectionKey;
    return `
      <section class="requirement-popup-group" data-group="${escapeHtml(sectionKey)}">
        <header class="requirement-popup-group-head">
          <span class="requirement-popup-group-title">${escapeHtml(label)}</span>
          <span class="requirement-popup-group-count">${rows.length}</span>
        </header>
        <div class="requirement-popup-group-list">
          ${rows.map(option => renderOption(option, useDaub)).join('')}
        </div>
      </section>
    `;
  }

  function buildStatusMarkup(config, state) {
    const entryName = String(config?.entryName || config?.candidate?.namn || '').trim();
    const selectedCount = Array.isArray(state?.selectedKeys) ? state.selectedKeys.length : 0;
    const targetMessages = Array.isArray(state?.targetMessages) ? state.targetMessages : [];
    if (state?.unlocked) {
      return `
        <div class="requirement-popup-status-copy">
          <strong>${escapeHtml(entryName ? `Kraven för “${entryName}” är uppfyllda.` : 'Kraven är uppfyllda.')}</strong>
          <span>${escapeHtml(selectedCount > 0 ? `${selectedCount} krav valda.` : 'Inga extra krav behövs.')}</span>
        </div>
      `;
    }

    const summary = targetMessages.length
      ? targetMessages.slice(0, 3).join(' · ')
      : 'Välj krav för att låsa upp posten utan override.';
    return `
      <div class="requirement-popup-status-copy">
        <strong>${escapeHtml(entryName ? `“${entryName}” är fortfarande spärrad.` : 'Posten är fortfarande spärrad.')}</strong>
        <span>${escapeHtml(summary)}</span>
      </div>
    `;
  }

  function open(config = {}) {
    createPopup();
    const helper = window.rulesHelper;
    const candidate = config?.candidate && typeof config.candidate === 'object'
      ? { ...config.candidate }
      : null;
    if (!candidate || typeof helper?.getRequirementAssistOptions !== 'function' || typeof helper?.evaluateRequirementAssistState !== 'function') {
      return Promise.resolve({ action: 'cancel', selectedKeys: [], state: null });
    }

    const baseList = Array.isArray(config?.list) ? config.list : [];
    const assistOptions = {
      action: config?.action || 'add',
      level: config?.level || candidate?.nivå || '',
      fromLevel: config?.fromLevel || '',
      toLevel: config?.toLevel || candidate?.nivå || '',
      replaceTargetUid: config?.replaceTargetUid || ''
    };
    const optionSpecs = helper.getRequirementAssistOptions(candidate, baseList, assistOptions);

    const pop = document.getElementById('requirementPopup');
    const useDaub = pop.classList.contains('db-modal-overlay') && typeof DAUB !== 'undefined';
    const inner = pop.querySelector('.popup-inner') || pop.querySelector('.db-modal');
    const titleEl = pop.querySelector('#requirementTitle');
    const subtitleEl = pop.querySelector('#requirementSubtitle');
    const searchLabel = pop.querySelector('#requirementSearchLabel');
    const searchInput = pop.querySelector('#requirementSearch');
    const statusEl = pop.querySelector('#requirementStatus');
    const box = pop.querySelector('#requirementOptions');
    const emptyEl = pop.querySelector('#requirementEmpty');
    const applyBtn = pop.querySelector('#requirementApply');
    const overrideBtn = pop.querySelector('#requirementOverride');
    const cancelBtn = pop.querySelector('#requirementCancel');
    const closeBtn = pop.querySelector('#requirementClose');

    const title = String(config?.title || `Lås upp ${candidate?.namn || 'krav'}`).trim();
    const subtitle = String(config?.subtitle || 'Välj krav som ska läggas till eller uppgraderas för att låsa upp posten utan override.').trim();
    const overrideLabel = String(config?.overrideLabel || (assistOptions.action === 'level-change' ? 'Ändra ändå' : 'Lägg till ändå')).trim();

    let searchTerm = '';
    let done = false;
    let currentResult = null;
    let popupSession = null;
    let resolvePromise = () => {};
    let state = helper.evaluateRequirementAssistState(candidate, baseList, optionSpecs, [], assistOptions);

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    overrideBtn.textContent = overrideLabel;
    window.daubMotion?.bindAutoAnimate?.(box, { duration: 120 });

    function render() {
      const normalizedTerm = normalizeText(searchTerm);
      const filtered = state.options.filter(option => {
        if (!normalizedTerm) return true;
        return getOptionSearchText(option).includes(normalizedTerm);
      });
      const grouped = SECTION_ORDER.map(sectionKey => ({
        key: sectionKey,
        rows: filtered.filter(option => getSectionKey(option) === sectionKey)
      })).filter(group => group.rows.length > 0);

      searchLabel.hidden = optionSpecs.length < 6;
      searchInput.hidden = optionSpecs.length < 6;
      statusEl.innerHTML = buildStatusMarkup(config, state);

      applyBtn.hidden = optionSpecs.length === 0;
      applyBtn.disabled = !state.unlocked || state.selectedKeys.length === 0;
      applyBtn.textContent = state.selectedKeys.length > 0
        ? `Lägg till valda krav (${state.selectedKeys.length})`
        : 'Lägg till valda krav';

      if (!grouped.length) {
        box.innerHTML = '';
        emptyEl.hidden = false;
        emptyEl.textContent = optionSpecs.length
          ? (searchTerm.trim() ? `Inga träffar för "${searchTerm.trim()}".` : 'Inga krav matchar sökningen.')
          : 'Det finns inga krav som kan läggas till automatiskt här.';
      } else {
        box.innerHTML = grouped.map(group => renderSection(group.key, group.rows, useDaub)).join('');
        emptyEl.hidden = true;
      }
    }

    function cleanup() {
      box.innerHTML = '';
      statusEl.innerHTML = '';
      searchInput.value = '';
      box.removeEventListener('click', onOptionClick);
      applyBtn.removeEventListener('click', onApply);
      overrideBtn.removeEventListener('click', onOverride);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      searchInput.removeEventListener('input', onSearch);
      if (!useDaub) {
        pop.removeEventListener('click', onOutside);
        document.removeEventListener('keydown', onKeyDown);
      }
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

    function toggleOption(key) {
      const option = state.options.find(item => String(item?.key || '') === String(key || ''));
      if (!option || (option.disabled && !option.selected)) return;
      const nextSelected = option.selected
        ? state.selectedKeys.filter(value => value !== option.key)
        : [...state.selectedKeys, option.key];
      state = helper.evaluateRequirementAssistState(candidate, baseList, optionSpecs, nextSelected, assistOptions);
      render();
    }

    function onOptionClick(event) {
      const button = event.target.closest('button[data-key]');
      if (!button || button.disabled) return;
      toggleOption(button.dataset.key);
    }

    function onApply() {
      if (applyBtn.disabled) return;
      finish({
        action: 'apply',
        selectedKeys: state.selectedKeys.slice(),
        state
      }, 'apply');
    }

    function onOverride() {
      finish({
        action: 'override',
        selectedKeys: state.selectedKeys.slice(),
        state
      }, 'override');
    }

    function onCancel() {
      finish({
        action: 'cancel',
        selectedKeys: state.selectedKeys.slice(),
        state
      }, 'cancel');
    }

    function onSearch() {
      searchTerm = searchInput.value || '';
      render();
    }

    function onOutside(event) {
      if (event.target === pop) onCancel();
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    }

    render();

    const usingManager = Boolean(window.popupManager?.open && window.popupManager?.close && pop?.id);
    if (usingManager) {
      popupSession = {
        close: (reason = 'programmatic') => window.popupManager.close(pop, reason)
      };
      window.popupManager.open(pop, {
        type: 'picker',
        onClose: () => {
          if (!done) {
            done = true;
            currentResult = {
              action: 'cancel',
              selectedKeys: state.selectedKeys.slice(),
              state
            };
          }
          cleanup();
          resolvePromise(currentResult);
        }
      });
    } else {
      pop.classList.add('open');
    }

    if (inner) inner.scrollTop = 0;
    if (!searchLabel.hidden) searchInput.focus();

    return new Promise(resolve => {
      resolvePromise = resolve;
      box.addEventListener('click', onOptionClick);
      applyBtn.addEventListener('click', onApply);
      overrideBtn.addEventListener('click', onOverride);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      searchInput.addEventListener('input', onSearch);
      if (!useDaub) {
        pop.addEventListener('click', onOutside);
        document.addEventListener('keydown', onKeyDown);
      }
    });
  }

  window.requirementPopup = {
    open
  };
})(window);
