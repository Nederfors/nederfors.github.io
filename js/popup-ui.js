(function(window){
  if (window.popupUi) return;

  const CHECK_ICON = window.DAUB_CHECK_ICON || '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 10.5L8.3 13.8L15 7" /></svg>';
  const DIALOG_TITLE_BY_ID = Object.freeze({
    advMoneyPopup: 'Varning',
    charPopup: 'Aktiv karaktar kravs',
    danielPopup: 'Daniel',
    deleteContainerPopup: 'Bekrafta borttagning',
    dialogPopup: 'Symbapedia',
    nilasPopup: 'Nilas',
    saveFreePopup: 'Bekrafta'
  });
  const REMOVE_BUTTON_IDS = Object.freeze({
    choicePopup: ['choiceCancel'],
    defenseCalcPopup: ['defenseCalcCancel'],
    folderManagerPopup: ['folderManagerDone'],
    qualPopup: ['qualCancel'],
    requirementPopup: ['requirementCancel']
  });
  const PROMOTE_BUTTON_IDS = Object.freeze({
    advMoneyPopup: 'advMoneyCancel',
    alcPopup: 'alcCancel',
    artPopup: 'artCancel',
    buyMultiplePopup: 'buyMultipleCancel',
    charPopup: 'charReqCancel',
    characterToolsPopup: 'characterToolsCancel',
    customPopup: 'customCancel',
    deleteContainerPopup: 'deleteContainerCancel',
    dialogPopup: 'dialogCancel',
    driveStoragePopup: 'driveStorageCancel',
    dupCharPopup: 'dupCharCancel',
    entrySortPopup: 'entrySortCancel',
    liveBuyPopup: 'liveBuyCancel',
    manualAdjustPopup: 'manualAdjustClose',
    masterPopup: 'masterCancel',
    moneyPopup: 'moneyCancel',
    newCharPopup: 'newCharCancel',
    pdfPopup: 'pdfCancel',
    pricePopup: 'priceCancel',
    qtyPopup: 'qtyCancel',
    renameCharPopup: 'renameCharCancel',
    renameFolderPopup: 'renameFolderCancel',
    rowPricePopup: 'rowPriceCancel',
    saveFreePopup: 'saveFreeCancel',
    smithPopup: 'smithCancel',
    vehicleMoneyPopup: 'vehicleMoneyCancel',
    vehiclePopup: 'vehicleCancel',
    vehicleQtyPopup: 'vehicleQtyCancel',
    vehicleRemovePopup: 'vehicleRemoveCancel'
  });
  const DISMISS_ID_RE = /(cancel|close)$/i;
  const BODY_ACTION_CLASS_RE = /\b(confirm-row|button-row|popup-footer|requirement-popup-actions|picker-popup-actions|qual-popup-actions|header-actions)\b/;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function iconMarkup() {
    if (typeof window.iconHtml === 'function') {
      const icon = window.iconHtml('cross', { className: 'btn-icon', alt: 'Stang' });
      if (icon) return icon;
    }
    return '&times;';
  }

  function renderCloseButton(options = {}) {
    const id = options.id ? ` id="${escapeHtml(options.id)}"` : '';
    const extraClass = String(options.className || '').trim();
    const className = ['db-modal__close', extraClass].filter(Boolean).join(' ');
    const title = escapeHtml(options.title || 'Stang');
    return `<button${id} class="${className}" type="button" aria-label="${title}" title="${title}">${iconMarkup()}</button>`;
  }

  function renderCheckboxRow({
    rowClass = '',
    labelAttrs = '',
    copyHtml = '',
    inputAttrs = '',
    checked = false,
    disabled = false
  } = {}) {
    return `
      <label class="db-checkbox popup-choice-row ${String(rowClass || '').trim()}"${labelAttrs}>
        ${copyHtml}
        <input class="db-checkbox__input" type="checkbox"${inputAttrs}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
        <span class="db-checkbox__box" aria-hidden="true">${CHECK_ICON}</span>
      </label>
    `.trim();
  }

  function renderRadioRow({
    rowClass = '',
    labelAttrs = '',
    copyHtml = '',
    inputAttrs = '',
    checked = false,
    disabled = false
  } = {}) {
    return `
      <label class="db-radio popup-choice-row popup-radio-option ${String(rowClass || '').trim()}"${labelAttrs}>
        <input class="db-radio__input" type="radio"${inputAttrs}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
        <span class="db-radio__circle"></span>
        ${copyHtml}
      </label>
    `.trim();
  }

  function setDaubSwitchState(el, checked) {
    if (!el) return;
    const isChecked = Boolean(checked);
    el.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    el.classList.toggle('active', isChecked);
  }

  function syncDaubRadioSelection(root, value) {
    if (!root) return;
    const expected = String(value ?? '');
    root.querySelectorAll('.popup-radio-option').forEach(option => {
      const input = option.querySelector('.db-radio__input');
      const isSelected = Boolean(input) && String(input.value ?? '') === expected;
      if (input) input.checked = isSelected;
      option.classList.toggle('is-selected', isSelected);
    });
  }

  function findModal(overlay) {
    if (!(overlay instanceof Element)) return null;
    return overlay.querySelector('.db-modal, .popup-inner') || null;
  }

  function findFirstHeading(modal) {
    return modal?.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > .popup-header h1, :scope > .popup-header h2, :scope > .popup-header h3, :scope > .master-header h1, :scope > .master-header h2, :scope > .master-header h3') || null;
  }

  function findHeaderCandidate(modal) {
    if (!modal) return null;
    return modal.querySelector(':scope > .db-modal__header, :scope > .popup-header, :scope > .master-header, :scope > .qual-popup-header, :scope > .inventory-hub-header, :scope > .defense-calc-header') || null;
  }

  function findFooterCandidate(modal) {
    if (!modal) return null;
    return modal.querySelector(':scope > .db-modal__footer, :scope > .confirm-row, :scope > .button-row, :scope > .popup-footer, :scope > #masterBtns, :scope > .manual-adjust-footer') || null;
  }

  function isDismissButton(button, overlayId) {
    if (!(button instanceof HTMLButtonElement)) return false;
    const buttonId = String(button.id || '').trim();
    if (buttonId && (REMOVE_BUTTON_IDS[overlayId] || []).includes(buttonId)) return true;
    if (buttonId && buttonId === PROMOTE_BUTTON_IDS[overlayId]) return true;
    if (buttonId && DISMISS_ID_RE.test(buttonId)) return true;
    const text = String(button.textContent || '').trim().toLowerCase();
    return text === 'stang' || text === 'avbryt' || text === 'nej' || text === 'klar';
  }

  function ensureTitleNode(header, modal, overlayId, options = {}) {
    let title = header.querySelector('.db-modal__title');
    if (title) return title;

    const heading = findFirstHeading(modal);
    if (heading) {
      heading.classList.add('db-modal__title');
      if (heading.parentElement !== header) {
        header.insertBefore(heading, header.firstChild || null);
      }
      return heading;
    }

    title = document.createElement('h2');
    title.className = 'db-modal__title';
    title.textContent = options.titleText || DIALOG_TITLE_BY_ID[overlayId] || 'Symbapedia';
    header.insertBefore(title, header.firstChild || null);
    return title;
  }

  function ensureHeader(overlay, modal, options = {}) {
    const overlayId = String(overlay.id || '').trim();
    let header = modal.querySelector(':scope > .db-modal__header');
    if (header) {
      header.classList.add('popup-modal-header');
      ensureTitleNode(header, modal, overlayId, options);
      return header;
    }

    const existing = findHeaderCandidate(modal);
    if (existing && existing.classList.contains('db-modal__header')) {
      existing.classList.add('popup-modal-header');
      ensureTitleNode(existing, modal, overlayId, options);
      return existing;
    }

    header = document.createElement('div');
    header.className = 'db-modal__header popup-modal-header';
    if (existing) {
      const extraClasses = String(existing.className || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter(className => className !== 'db-modal__header');
      if (extraClasses.length) {
        header.className = `${header.className} ${extraClasses.join(' ')}`;
      }
      while (existing.firstChild) header.appendChild(existing.firstChild);
      existing.remove();
    }
    modal.insertBefore(header, modal.firstChild || null);
    ensureTitleNode(header, modal, overlayId, options);
    return header;
  }

  function ensureBody(modal) {
    let body = modal.querySelector(':scope > .db-modal__body');
    if (body) {
      body.classList.add('popup-modal-body');
      return body;
    }

    body = document.createElement('div');
    body.className = 'db-modal__body popup-modal-body';

    const footer = modal.querySelector(':scope > .db-modal__footer');
    const nodes = Array.from(modal.childNodes).filter(node => node !== footer);
    nodes.forEach(node => {
      if (node === body) return;
      if (node instanceof Element && node.classList.contains('db-modal__header')) return;
      body.appendChild(node);
    });

    if (footer) modal.insertBefore(body, footer);
    else modal.appendChild(body);
    return body;
  }

  function ensureFooter(modal) {
    let footer = modal.querySelector(':scope > .db-modal__footer');
    if (footer) {
      footer.classList.add('popup-modal-footer');
      return footer;
    }

    const existing = findFooterCandidate(modal);
    if (existing && existing.classList.contains('db-modal__footer')) {
      existing.classList.add('popup-modal-footer');
      return existing;
    }

    const footerButtons = Array.from(modal.children).filter(child => (
      child instanceof HTMLButtonElement
      || (child instanceof Element && BODY_ACTION_CLASS_RE.test(child.className))
    ));
    if (!footerButtons.length) return null;

    footer = document.createElement('div');
    footer.className = 'db-modal__footer popup-modal-footer';
    footerButtons.forEach(node => footer.appendChild(node));
    modal.appendChild(footer);
    return footer;
  }

  function updateCloseButton(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.className = 'db-modal__close';
    button.type = 'button';
    button.setAttribute('aria-label', 'Stang');
    button.setAttribute('title', 'Stang');
    button.innerHTML = iconMarkup();
    button.style.width = 'auto';
    button.style.minWidth = '2.25rem';
    button.style.minHeight = '2.25rem';
    button.style.padding = '0.25rem';
    button.style.display = 'inline-grid';
    button.style.placeItems = 'center';
    button.style.background = 'transparent';
    button.style.border = '1px solid var(--db-color-border, rgba(255, 243, 228, 0.08))';
    button.style.borderRadius = 'var(--db-radius-2, 0.75rem)';
    button.style.color = 'var(--db-color-text-secondary, #c4a882)';
    button.style.boxShadow = 'none';
  }

  function findExistingCloseButton(root) {
    if (!(root instanceof Element)) return null;
    return Array.from(root.querySelectorAll('button')).find(button => {
      const buttonId = String(button.id || '').trim();
      const title = String(button.getAttribute('title') || '').trim().toLowerCase();
      const label = String(button.getAttribute('aria-label') || '').trim().toLowerCase();
      const text = String(button.textContent || '').trim();
      return /closex?$|close$/i.test(buttonId)
        || title === 'stäng'
        || title === 'stang'
        || label === 'stäng'
        || label === 'stang'
        || text === '✕'
        || text === '×';
    }) || null;
  }

  function applyFooterButtonStyles(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.style.width = 'auto';
    button.style.minWidth = '0';
  }

  function applyFooterLayout(footer) {
    if (!(footer instanceof Element)) return;
    footer.style.display = 'flex';
    footer.style.flexWrap = 'wrap';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '0.75rem';
    footer.style.padding = '0 1rem 1rem';
    footer.style.borderTop = '1px solid rgba(var(--db-color-border-rgb, 74, 54, 40), 0.55)';
    footer.style.alignItems = 'center';
    Array.from(footer.children).forEach(child => {
      if (!(child instanceof Element)) return;
      if (child.matches('.confirm-row, .button-row, .manual-adjust-footer, #masterBtns')) {
        child.style.display = 'flex';
        child.style.flexWrap = 'wrap';
        child.style.justifyContent = 'flex-end';
        child.style.gap = '0.75rem';
        child.style.width = '100%';
      }
      child.querySelectorAll?.('button').forEach(applyFooterButtonStyles);
      if (child instanceof HTMLButtonElement) applyFooterButtonStyles(child);
    });
  }

  function applyShellLayout(modal, header, body, footer) {
    if (modal instanceof HTMLElement) {
      modal.style.padding = '0';
      modal.style.gap = '0';
      modal.style.textAlign = 'left';
      modal.style.overflow = 'hidden';
      modal.style.background = 'var(--db-color-surface, rgba(49, 36, 26, 0.998))';
      modal.style.border = '1px solid var(--db-color-border, rgba(255, 243, 228, 0.08))';
      modal.style.boxShadow = 'var(--db-shadow-3, 0 28px 48px rgba(0, 0, 0, 0.3))';
      modal.style.borderRadius = 'var(--db-radius-3, 1rem)';
    }
    if (header instanceof HTMLElement) {
      header.style.display = 'flex';
      header.style.alignItems = 'flex-start';
      header.style.justifyContent = 'space-between';
      header.style.gap = '1rem';
      header.style.padding = '1rem 1rem 0.85rem';
      header.style.borderBottom = '1px solid rgba(var(--db-color-border-rgb, 74, 54, 40), 0.55)';
    }
    if (body instanceof HTMLElement) {
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.gap = '0.75rem';
      body.style.padding = '1rem';
      body.style.minHeight = '0';
      body.style.overflow = 'auto';
    }
    if (footer instanceof HTMLElement) {
      applyFooterLayout(footer);
    }
  }

  function ensureCloseButton(overlay, header) {
    const overlayId = String(overlay.id || '').trim();
    let closeButton = header.querySelector('.db-modal__close') || findExistingCloseButton(header);
    if (!closeButton) {
      const explicitId = PROMOTE_BUTTON_IDS[overlayId];
      if (explicitId) {
        closeButton = overlay.querySelector(`#${explicitId}`);
      }
    }
    if (!closeButton) {
      closeButton = overlay.querySelector('.db-modal__close') || findExistingCloseButton(overlay);
    }
    if (!closeButton) {
      const explicitId = PROMOTE_BUTTON_IDS[overlayId];
      const markup = renderCloseButton({ id: explicitId || '' });
      header.insertAdjacentHTML('beforeend', markup);
      closeButton = header.querySelector('.db-modal__close:last-of-type');
      updateCloseButton(closeButton);
      return closeButton;
    }

    updateCloseButton(closeButton);
    if (closeButton.parentElement !== header) {
      header.appendChild(closeButton);
    }
    return closeButton;
  }

  function pruneFooter(overlay, modal) {
    const overlayId = String(overlay.id || '').trim();
    const footer = modal.querySelector(':scope > .db-modal__footer');
    if (!footer) return;

    const removeIds = new Set(REMOVE_BUTTON_IDS[overlayId] || []);
    Array.from(footer.querySelectorAll('button')).forEach(button => {
      const buttonId = String(button.id || '').trim();
      if ((buttonId && removeIds.has(buttonId)) || isDismissButton(button, overlayId)) {
        button.remove();
      }
    });

    if (!footer.children.length) {
      footer.remove();
    }
  }

  function normalizeModal(overlay, options = {}) {
    if (!(overlay instanceof Element)) return null;

    overlay.classList.add('popup', 'db-modal-overlay');
    overlay.dataset.popupUnified = 'true';
    if (!overlay.hasAttribute('aria-hidden')) {
      overlay.setAttribute('aria-hidden', 'true');
    }

    const modal = findModal(overlay);
    if (!modal) return null;

    modal.classList.add('db-modal', 'popup-shell--daub');
    const header = ensureHeader(overlay, modal, options);
    ensureCloseButton(overlay, header);
    ensureFooter(modal);
    const body = ensureBody(modal);
    pruneFooter(overlay, modal);
    applyShellLayout(modal, header, body, modal.querySelector(':scope > .db-modal__footer'));
    return overlay;
  }

  function normalizeTree(root, config = {}) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('.popup[id]').forEach(overlay => {
      const popupOptions = config[overlay.id] || {};
      normalizeModal(overlay, popupOptions);
    });
  }

  window.DAUB_CHECK_ICON = CHECK_ICON;
  window.escapeDaubHtml = escapeHtml;
  window.renderDaubCheckboxRow = renderCheckboxRow;
  window.renderDaubRadioRow = renderRadioRow;
  window.setDaubSwitchState = setDaubSwitchState;
  window.syncDaubRadioSelection = syncDaubRadioSelection;
  window.popupUi = {
    escapeHtml,
    renderCloseButton,
    renderCheckboxRow,
    renderRadioRow,
    setDaubSwitchState,
    syncDaubRadioSelection,
    normalizeModal,
    normalizeTree
  };
})(window);
