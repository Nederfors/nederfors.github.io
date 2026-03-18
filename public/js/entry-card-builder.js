/* ===========================================================
   entry-card-builder.js — shared card-content builder
   Produces the options object for entryCardFactory.create(),
   unifying card structure across index, character & inventory
   views.  Views only provide buttonSections.
   =========================================================== */

(function (window) {
  'use strict';

  /* ── Utility functions (previously duplicated in views) ── */

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);

  const icon = (name, opts) => typeof window.iconHtml === 'function'
    ? window.iconHtml(name, opts)
    : '';

  const levelLetter = (lvl) => {
    const text = String(lvl || '').trim();
    if (!text) return '';
    if (text === 'Mästare') return 'M';
    if (text === 'Gesäll') return 'G';
    if (text === 'Novis') return 'N';
    return text.charAt(0).toUpperCase();
  };

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

  const renderFilterTag = (tag, extra = '') =>
    `<span class="db-chip filter-tag" data-section="${tag.section}" data-val="${tag.value}"${extra}>${tag.label}</span>`;

  const renderDockedTags = (tags, extraClass = '') => {
    if (!tags.length) return '';
    const cls = ['entry-tags', extraClass].filter(Boolean).join(' ');
    return `<div class="${cls}">${tags.map(tag => renderFilterTag(tag)).join('')}</div>`;
  };

  function renderConflictTabButton() {
    return '<button class="info-tab" data-tab="conflict" type="button">Konflikter</button>';
  }

  /* ── Constants ── */

  const QUAL_TYPE_MAP = {
    'Vapenkvalitet': 'Vapen',
    'Rustningskvalitet': 'Rustning',
    'Sköldkvalitet': 'Sköld',
    'Allmän kvalitet': 'Allmänt'
  };
  const QUAL_TYPE_KEYS = Object.keys(QUAL_TYPE_MAP);
  const DOCK_TAG_TYPES = new Set([
    'Fördel', 'Nackdel', 'Särdrag', 'Monstruöst särdrag',
    'Ritual', 'Mystisk kraft', 'Förmåga', 'Basförmåga'
  ]);

  /* ── Main builder ── */

  /**
   * Build card options for entryCardFactory.create().
   *
   * @param {Object} entry  — the raw entry object (p)
   * @param {Object} ctx    — pre-resolved context from the calling view
   *
   * ctx fields (all optional):
   *   compact          {boolean}   initial compact state
   *   currentLevel     {string}    resolved current level
   *   availLvls        {string[]}  available level names
   *   xpInfo           {Object}    { headerHtml, tagHtml, value } from XP computation
   *   desc             {string}    ability/description HTML
   *   infoBodyHtml     {string}    body HTML for info panel (defaults to desc)
   *   choiceInfo       {string}    choice display HTML appended to desc
   *   keyInfoMeta      {Array}     [{ label, value }] for info panel key facts
   *   infoMeta         {Array}     [{ label, value }] for price/weight/capacity
   *   conflictsHtml    {string}    conflict section HTML
   *   conflictTabHtml  {string}    override for conflict tab button
   *   infoSections     {Array}     extra info panel sections (elite etc.)
   *   skadetypHtml     {string}    damage-type panel HTML
   *   count            {number}    how many of this entry the character has
   *   multi            {boolean}   whether entry allows multiples
   *   hideDetails      {boolean}   hide desc/level (races/jobs)
   *   qualityHtml      {string}    quality chip HTML (inventory)
   *   extraClasses     {string[]}  additional CSS classes
   *   extraDataset     {Object}    additional data-* attributes
   *   infoBoxOverride  {string}    replace default info box HTML entirely
   *   extraBadgeParts  {string[]}  additional meta-badge HTML strings
   *   extraLeftSections {string[]} additional left-section HTML strings
   *   testList         {string[]}  override for test tags (level-specific)
   *   showInfo         {boolean}   override for whether info button appears
   */
  function build(entry, ctx = {}) {
    const p = entry;
    const meta = typeof window.ensureEntryMeta === 'function'
      ? window.ensureEntryMeta(p)
      : { typList: [], arkList: [], testList: [] };

    const {
      compact = false,
      currentLevel = null,
      availLvls = [],
      xpInfo = null,
      desc = '',
      infoBodyHtml: infoBodyHtmlOpt,
      choiceInfo = '',
      keyInfoMeta = [],
      infoMeta = [],
      conflictsHtml = '',
      conflictTabHtml: conflictTabHtmlOpt,
      infoSections = [],
      skadetypHtml = '',
      count = 0,
      multi = false,
      hideDetails = false,
      qualityHtml = '',
      extraClasses = [],
      extraDataset = {},
      infoBoxOverride,
      extraBadgeParts = [],
      extraLeftSections = [],
      testList: testListOpt,
      showInfo: showInfoOpt,
    } = ctx;

    const infoBodyHtml = infoBodyHtmlOpt !== undefined ? infoBodyHtmlOpt : desc;

    const hasAnyLevel = availLvls.length > 0;
    const hasLevelSelect = availLvls.length > 1;
    const curLvl = currentLevel || (hasAnyLevel ? availLvls[0] : null);

    /* ── 1. Tags ── */
    const filterTagData = [];
    const primaryTagParts = [];

    (meta.typList || []).forEach((t, idx) => {
      if (!t) return;
      const tag = { section: 'typ', value: t, label: QUAL_TYPE_MAP[t] || t, hidden: idx === 0 };
      filterTagData.push(tag);
      if (!tag.hidden) primaryTagParts.push(renderFilterTag(tag));
    });

    (meta.arkList || []).forEach(t => {
      if (!t) return;
      const tag = { section: 'ark', value: t, label: t, hidden: t === 'Traditionslös' };
      filterTagData.push(tag);
      if (!tag.hidden) primaryTagParts.push(renderFilterTag(tag));
    });

    const testTags = testListOpt || meta.testList || [];
    testTags.forEach(t => {
      if (!t) return;
      filterTagData.push({ section: 'test', value: t, label: t });
    });

    const primaryTagsHtml = primaryTagParts.join(' ');
    const visibleTagData = sortTagsForDisplay(filterTagData.filter(tag => !tag.hidden));
    const dockableTagData = sortTagsForDisplay(
      visibleTagData.filter(tag => tag.section !== 'typ' && tag.section !== 'ark')
    );
    const filterTagHtml = dockableTagData.map(tag => renderFilterTag(tag));
    const infoFilterTagHtml = visibleTagData.map(tag => renderFilterTag(tag));
    const tagsHtml = filterTagHtml.join(' ');

    /* ── 2. Level ── */
    const lvlBadgeVal = hasAnyLevel ? (curLvl || '') : '';
    const lvlShort = levelLetter(lvlBadgeVal);
    const singleLevelTagHtml = (!hasLevelSelect && lvlShort && lvlBadgeVal)
      ? `<span class="db-chip level-tag" title="${lvlBadgeVal}">${lvlShort}</span>`
      : '';

    const levelOptionsHtml = hasLevelSelect
      ? availLvls.map(l => {
        const short = levelLetter(l);
        const selected = l === curLvl ? ' selected' : '';
        const shortAttr = short ? ` data-short="${short}"` : '';
        return `<option value="${l}"${shortAttr}${selected}>${l}</option>`;
      }).join('')
      : '';
    const traitAttr = p.trait ? ` data-trait="${escapeHtml(p.trait)}"` : '';
    const lvlSel = hasLevelSelect
      ? `<select class="level" data-name="${escapeHtml(p.namn)}"${traitAttr} aria-label="Välj nivå för ${escapeHtml(p.namn)}">${levelOptionsHtml}</select>`
      : '';
    const levelHtml = hideDetails ? '' : (hasLevelSelect ? lvlSel : '');

    /* ── 3. XP ── */
    const xpTag = xpInfo?.tagHtml || '';
    const xpHtml = xpInfo?.headerHtml || '';
    const xpVal = xpInfo?.value ?? null;

    /* ── 4. Info box ── */
    const infoTagParts = [xpTag].concat(infoFilterTagHtml).filter(Boolean);
    if (singleLevelTagHtml) infoTagParts.push(singleLevelTagHtml);

    const infoBoxTagParts = [...infoFilterTagHtml].filter(Boolean);
    if (singleLevelTagHtml) infoBoxTagParts.push(singleLevelTagHtml);

    // Conflict warning chip
    if (conflictsHtml) {
      const conflictWarn = `<span class="db-chip filter-tag conflict-flag" title="Har konflikter med valda förmågor">${icon('active', { className: 'btn-icon conflict-icon', alt: 'Konflikt' }) || '⚠️'}</span>`;
      infoBoxTagParts.unshift(conflictWarn);
    }

    const infoBoxFacts = infoMeta.filter(m => {
      if (!m) return false;
      const value = m.value;
      if (value === undefined || value === null || value === '') return false;
      const label = String(m.label || '').toLowerCase();
      return label.includes('pris') || label.includes('dagslön') || label.includes('vikt');
    });
    const infoBoxFactParts = infoBoxFacts
      .map(f => {
        const label = String(f.label ?? '').trim();
        const value = String(f.value ?? '').trim();
        if (!label || !value) return '';
        return `<div class="card-info-fact"><span class="card-info-fact-label">${label}</span><span class="card-info-fact-value">${value}</span></div>`;
      })
      .filter(Boolean);

    let infoBoxHtml = '';
    if (infoBoxOverride !== undefined) {
      infoBoxHtml = infoBoxOverride || '';
    } else {
      const isInvEntry = typeof window.isInv === 'function' && window.isInv(p);
      let infoBoxContentHtml = '';
      if (isInvEntry && (infoBoxTagParts.length || infoBoxFactParts.length)) {
        const inlineTagsHtml = infoBoxTagParts.length
          ? `<div class="card-info-tags tags">${infoBoxTagParts.join(' ')}</div>`
          : '';
        const inlineFactsHtml = infoBoxFactParts.length
          ? `<div class="card-info-facts">${infoBoxFactParts.join('')}</div>`
          : '';
        const inlineParts = [inlineTagsHtml, inlineFactsHtml].filter(Boolean).join('');
        infoBoxContentHtml = inlineParts
          ? `<div class="card-info-inline">${inlineParts}</div>`
          : '';
      } else {
        const infoBoxTagsHtml = infoBoxTagParts.length
          ? `<div class="card-info-tags tags">${infoBoxTagParts.join(' ')}</div>`
          : '';
        const infoBoxFactsHtml = infoBoxFactParts.length
          ? `<div class="card-info-facts">${infoBoxFactParts.join('')}</div>`
          : '';
        infoBoxContentHtml = `${infoBoxTagsHtml}${infoBoxFactsHtml}`;
      }
      infoBoxHtml = infoBoxContentHtml
        ? `<div class="card-info-box">${infoBoxContentHtml}</div>`
        : '';
    }

    /* ── 5. Info panel + button ── */
    const conflictTab = conflictsHtml
      ? (conflictTabHtmlOpt || renderConflictTabButton())
      : '';
    const infoTagsHtml = infoTagParts.join(' ');
    const infoPanelHtml = typeof window.buildInfoPanelHtml === 'function'
      ? window.buildInfoPanelHtml({
        tagsHtml: infoTagsHtml,
        keyInfoMeta,
        bodyHtml: infoBodyHtml,
        meta: infoMeta,
        sections: infoSections,
        skadetypHtml,
        conflictTabHtml: conflictTab,
        conflictContentHtml: conflictsHtml
      })
      : '';
    const infoBtn = `<button class="db-btn db-btn--icon db-btn--icon-only info-btn" data-info="${encodeURIComponent(infoPanelHtml)}" aria-label="Visa info">${icon('info')}</button>`;

    const showInfo = showInfoOpt !== undefined ? showInfoOpt : (compact || hideDetails);
    const titleActions = [];
    if (showInfo) titleActions.push(infoBtn);

    /* ── 6. Docked tags ── */
    const dockPrimary = (p.taggar?.typ || [])[0] || '';
    const shouldDockTags = DOCK_TAG_TYPES.has(dockPrimary);
    const dockedTagsHtml = shouldDockTags ? renderDockedTags(dockableTagData) : '';
    const mobileTagsHtml = (!compact && !shouldDockTags && dockableTagData.length)
      ? renderDockedTags(dockableTagData, 'entry-tags-mobile')
      : '';

    /* ── 7. Meta badges ── */
    const badgeParts = [...extraBadgeParts];
    const isQualEntry = typeof window.isQual === 'function' && window.isQual(p);
    if (isQualEntry) {
      (p.taggar?.typ || [])
        .filter(t => QUAL_TYPE_KEYS.includes(t))
        .map(t => QUAL_TYPE_MAP[t])
        .forEach(lbl => badgeParts.push(`<span class="meta-badge">${lbl}</span>`));
    }
    infoMeta.forEach(m => {
      if (!m || m.value === undefined || m.value === null || m.value === '') return;
      const label = String(m.label || '').toLowerCase();
      if (label.includes('pris') || label.includes('dagslön')) {
        const short = label.includes('dagslön') ? 'Dagslön' : 'P';
        badgeParts.push(`<span class="meta-badge price-badge" title="${escapeHtml(String(m.label || ''))}">${short}: ${m.value}</span>`);
      } else if (label.includes('bärkapacitet') || label === 'kapacitet') {
        badgeParts.push(`<span class="meta-badge capacity-badge" title="Bärkapacitet">BK: ${m.value}</span>`);
      } else if (label.includes('vikt')) {
        badgeParts.push(`<span class="meta-badge weight-badge" title="Vikt">V: ${m.value}</span>`);
      }
    });
    const isInvEntry = typeof window.isInv === 'function' && window.isInv(p);
    if (isInvEntry && lvlShort) {
      badgeParts.push(`<span class="meta-badge level-badge" title="${lvlBadgeVal}">${lvlShort}</span>`);
    }
    const metaBadges = badgeParts.length
      ? `<div class="meta-badges">${badgeParts.join('')}</div>`
      : '';

    /* ── 8. Left sections ── */
    const leftSections = [...extraLeftSections];
    if (metaBadges) leftSections.push(metaBadges);
    if (shouldDockTags && dockedTagsHtml) leftSections.push(dockedTagsHtml);
    else if (mobileTagsHtml) leftSections.push(mobileTagsHtml);

    /* ── 9. Badge (count) ── */
    const badge = multi && count > 0
      ? `<span class="count-badge">×${count}</span>`
      : '';

    /* ── 10. Description block ── */
    const descContent = choiceInfo ? (desc + choiceInfo) : desc;
    const descBlock = (!hideDetails && descContent)
      ? `<div class="card-desc">${descContent}</div>`
      : '';

    /* ── 11. Dataset ── */
    const dataset = { name: p.namn };
    if (p.trait) dataset.trait = p.trait;
    if (xpVal != null) dataset.xp = xpVal;
    if (p.id) dataset.id = p.id;
    Object.assign(dataset, extraDataset);

    /* ── 12. Assemble options ── */
    return {
      compact,
      classes: extraClasses,
      dataset,
      nameHtml: p.namn,
      titleSuffixHtml: badge,
      xpHtml,
      primaryTagsHtml,
      tagsHtml: (!compact && !shouldDockTags && tagsHtml) ? tagsHtml : '',
      infoBox: infoBoxHtml,
      hasLevels: hasLevelSelect,
      levelHtml,
      levelShort: hasLevelSelect ? lvlShort : '',
      levelShortLabel: hasLevelSelect ? lvlBadgeVal : '',
      descHtml: descBlock,
      leftSections,
      titleActions,
      qualityHtml,
      collapsible: true
    };
  }

  /* ── Public API ── */

  window.entryCardBuilder = Object.freeze({
    build,

    // Exposed utilities — views may still need these for filtering, etc.
    escapeHtml,
    levelLetter,
    splitArkTags,
    readEntryTests,
    renderFilterTag,
    renderDockedTags,
    sortTagsForDisplay,
    tagSectionPriority,
    renderConflictTabButton,

    // Exposed constants
    DOCK_TAG_TYPES,
    QUAL_TYPE_MAP,
    QUAL_TYPE_KEYS,
  });

})(window);
