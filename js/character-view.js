(function(window){
const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';
function initCharacter() {
  const createEntryCard = window.entryCardFactory.create;
  dom.cName.textContent = store.characters.find(c=>c.id===store.current)?.name||'';

  const F = { search:[], typ:[], ark:[], test:[] };
  const ONLY_SELECTED_VALUE = '__onlySelected';
  const ONLY_SELECTED_LABEL = 'Endast valda';
  let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', !compact);
  // Open matching categories once after certain actions (search)
  let openCatsOnce = new Set();

  const charId = store.current || 'default';
  const STATE_KEY = `charViewState:${charId}`;
  let catState = {};
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
    catch { return {}; }
  };
  const saveState = () => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ filters: F, cats: catState })); }
    catch {}
  };
  {
    const saved = loadState();
    if (saved.filters) {
      ['search','typ','ark','test'].forEach(k => {
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
    } catch {}
  };
  applyQueryFilters();

  let catsMinimized = false;
  const updateCatToggle = () => {
    catsMinimized = [...document.querySelectorAll('.cat-group > details')]
      .every(d => !d.open);
    dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
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
    ['Mystisk kraft', 'Mystiska krafter'],
    ['Ritual', 'Ritualer'],
    ['Särdrag', 'Särdrag'],
    ['Monstruöst särdrag', 'Monstruösa särdrag'],
    ['Yrke', 'Yrken'],
    ['Elityrke', 'Elityrken'],
    ['Ras', 'Raser'],
    ['Artefakt', 'Artefakter'],
    ['L\u00e4gre Artefakt', 'L\u00e4gre artefakter'],
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

  const DOCK_TAG_TYPES = new Set(['Fördel','Nackdel','Särdrag','Monstruöst särdrag','Ritual','Mystisk kraft','Förmåga']);

  const levelLetter = (lvl) => {
    const text = String(lvl || '').trim();
    if (!text) return '';
    if (text === 'Mästare') return 'M';
    if (text === 'Gesäll') return 'G';
    if (text === 'Novis') return 'N';
    return text.charAt(0).toUpperCase();
  };

  const renderFilterTag = (tag, extra = '') => `<span class="tag filter-tag" data-section="${tag.section}" data-val="${tag.value}"${extra}>${tag.label}</span>`;

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

    const abilityMap = new Map();
    storeHelper.getCurrentList(store).
      filter(entry => !isInv(entry)).
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
      const ok = await confirmPopup('Detta tar bort Ras, Yrken, Elityrken, Förmågor, Mystisk kraft, Ritualer, Fördelar, Nackdelar, Särdrag och Monstruösa särdrag från karaktären. Inventariet lämnas orört. Vill du fortsätta?');
      if (!ok) return;
      const before = storeHelper.getCurrentList(store);
      const keep = before.filter(p => isInv(p));
      storeHelper.setCurrentList(store, keep);
      if (window.invUtil && typeof invUtil.renderInventory === 'function') {
        invUtil.renderInventory();
      }
      renderSkills(filtered());
      updateXP();
      renderTraits();
      updateSearchDatalist();
    });
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
        if (s != null && e != null && e > s) ranges.push([s,e]);
        start = idx + Math.max(1, term.length);
      }
    }
    if (!ranges.length) return;
    ranges.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [s,e] of merged) {
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

  function getActiveHandlingKeys(p){
    return Object.entries(p?.taggar?.handling || {})
      .filter(([,v]) => Array.isArray(v) && v.includes('Aktiv'))
      .map(([k]) => k);
  }

  function handlingName(p, key){
    if (!LVL.includes(key)) {
      const txt = p?.nivåer?.[key];
      if (typeof txt === 'string') {
        const idx = txt.indexOf(';');
        return idx >= 0 ? txt.slice(0, idx) : txt;
      }
    }
    return key;
  }

  function conflictEntryHtml(p){
    const compact = storeHelper.getCompactEntries(store);
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
          <details class="level-block" open>
            <summary>${name}</summary>
            <div class="level-content">${body}</div>
          </details>
        `.trim();
      })
      .filter(Boolean)
      .join('');
    const tagHtml = compact && activeNames.length
      ? `<div class="tags">${activeNames.map(n=>`<span class="tag">${n}</span>`).join('')}</div>`
      : '';
    const desc = (!compact && lvlHtml)
      ? `<div class="card-desc"><div class="levels">${lvlHtml}</div></div>`
      : '';
    const titleName = (!LVL.includes(p.nivå || '') && p.nivå)
      ? `${p.namn}: ${handlingName(p, p.nivå)}`
      : p.namn;
    return `<li class="card entry-card${compact ? ' compact' : ''}"><div class="card-title"><span>${titleName}</span></div>${tagHtml}${desc}</li>`;
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

  function renderConflicts(list){
    if(!list.length){
      conflictList.innerHTML = '<li class="card entry-card">Inga konflikter.</li>';
      return;
    }

    const cats = {};
    list.forEach(p=>{
      const cat = charCategory(p);
      (cats[cat] ||= []).push(p);
    });

    const catKeys = Object.keys(cats).sort(catComparator);
    const html = catKeys.map(cat => {
      const items = cats[cat].map(conflictEntryHtml).join('');
      return `
        <li class="cat-group">
          <details open>
            <summary>${catName(cat)}</summary>
            <ul class="card-list entry-card-list" data-entry-page="conflict">${items}</ul>
          </details>
        </li>`;
    }).join('');

    conflictList.innerHTML = html;
  }

  function renderSummary(){
    const list = storeHelper.getCurrentList(store);
    const inv = storeHelper.getInventory(store);
    const traits = storeHelper.getTraits(store);
    const artifactEffects = storeHelper.getArtifactEffects(store);
    const manualAdjust = storeHelper.getManualAdjustments(store);
    const combinedEffects = {
      xp: (artifactEffects?.xp || 0) + (manualAdjust?.xp || 0),
      corruption: (artifactEffects?.corruption || 0) + (manualAdjust?.corruption || 0)
    };
    const manualToughness = Number(manualAdjust?.toughness || 0);
    const manualPain = Number(manualAdjust?.pain || 0);
    const manualCapacity = Number(manualAdjust?.capacity || 0);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(inv) : {};
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
    const permBase = storeHelper.calcPermanentCorruption(list, combinedEffects);
    const hasEarth = list.some(p=>p.namn==='Jordnära');
    const baseMax = strongGift ? valWill + 5 : valWill;
    const threshBase = strongGift ? valWill : Math.ceil(valWill / 2);
    const maxCor = baseMax + (hasSjalastark ? 1 : 0);
    let thresh = threshBase + resistCount - sensCount;
    const darkPerm = storeHelper.calcDarkPastPermanentCorruption(list, thresh);
    let perm = hasEarth ? (permBase % 2) : permBase;
    perm += darkPerm;
    const effectsWithDark = {
      xp: combinedEffects.xp || 0,
      corruption: (combinedEffects.corruption || 0) + darkPerm
    };

    const hasHardnackad = list.some(p=>p.namn==='Hårdnackad');
    const hasKraftprov = list.some(p=>p.namn==='Kraftprov');
    const capacity = storeHelper.calcCarryCapacity(valStark, list) + manualCapacity;
    const hardy = hasHardnackad ? 1 : 0;
    const talBase = hasKraftprov ? valStark + 5 : Math.max(10, valStark);
    const tal = talBase + hardy + manualToughness;
    const pain = storeHelper.calcPainThreshold(valStark, list, effectsWithDark) + manualPain;

    const defTrait = getDefenseTraitName(list);
    const kvickForDef = vals[defTrait];
    const defenseListStd = calcDefense(kvickForDef, { mode: 'standard' });
    const dancingTrait = getDancingDefenseTraitName(list);
    const defenseListDance = dancingTrait ? calcDefense(vals[dancingTrait], { mode: 'dancing' }) : [];
    const defenseList = [...defenseListStd, ...defenseListDance];

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
    const usedXP = storeHelper.calcUsedXP(list, combinedEffects);
    const totalXP = storeHelper.calcTotalXP(baseXP, list);
    const freeXP = totalXP - usedXP;

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
      const counts = new Map();
      list.forEach(entry => {
        const entryTypes = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
        if (!wanted.some(type => entryTypes.includes(type))) return;
        const display = abilityDisplayName(entry);
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
    const defenseAction = `<button type="button" class="char-btn icon defense-action-btn${defenseSetup?.enabled ? ' active' : ''}" data-action="open-defense-calc" aria-pressed="${defenseSetup?.enabled ? 'true' : 'false'}">${icon('forsvar', { width: 24, height: 24 })}<span>Beräkna försvar</span></button>`;
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
      summarySections.push({ title: 'Försvar', rows: defenseRows, listClass: 'summary-pairs', action: defenseAction });
    }

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

    const accuracyRows = cond.map(text => ({ text }));
    summarySections.push({ title: 'Träffsäkerhet', rows: accuracyRows, listClass: 'summary-text' });

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
    summaryBtn.addEventListener('click',()=>{
      renderSummary();
      const isOpen = summaryPanel.classList.toggle('open');
      if (isOpen) summaryPanel.scrollTop = 0;
    });
  }
  summaryClose?.addEventListener('click',()=>summaryPanel.classList.remove('open'));
  document.addEventListener('click',e=>{
    if (summaryPanel && summaryPanel.classList.contains('open') &&
        !summaryPanel.contains(e.target) && e.target!==summaryBtn) {
      summaryPanel.classList.remove('open');
    }
  });

  if (effectsBtn && effectsPanel) {
    effectsBtn.addEventListener('click',()=>{
      renderEffects();
      const isOpen = effectsPanel.classList.toggle('open');
      if (isOpen) effectsPanel.scrollTop = 0;
    });
  }
  effectsClose?.addEventListener('click',()=>effectsPanel.classList.remove('open'));
  document.addEventListener('click',e=>{
    if (effectsPanel && effectsPanel.classList.contains('open') &&
        !effectsPanel.contains(e.target) && e.target!==effectsBtn) {
      effectsPanel.classList.remove('open');
    }
  });

  conflictClose.addEventListener('click',()=>conflictPanel.classList.remove('open'));
  document.addEventListener('click',e=>{
    if(conflictPanel.classList.contains('open') &&
      !conflictPanel.contains(e.target) &&
      !e.target.closest('.conflict-btn')){
      conflictPanel.classList.remove('open');
    }
  });

  /* Dropdowns baserat på karaktärslista */
  function refreshCharacterFilters(){
    const lst = storeHelper.getCurrentList(store).filter(p=>!isInv(p));
    const sets = { typ:new Set(), ark:new Set(), test:new Set() };
    lst.forEach(p=>{
      const taggar = p && typeof p === 'object' ? (p.taggar || {}) : {};
      const typTags = Array.isArray(taggar.typ) ? taggar.typ : [];
      typTags
        .filter(Boolean)
        .forEach(v=>sets.typ.add(v));
      const arkSource = taggar.ark_trad;
      const arkTags = explodeTags(arkSource);
      if (arkTags.length) {
        arkTags.forEach(v => sets.ark.add(v));
      } else if (Array.isArray(arkSource)) {
        sets.ark.add('Traditionslös');
      }
      const testTags = Array.isArray(taggar.test) ? taggar.test : [];
      testTags
        .filter(Boolean)
        .forEach(v=>sets.test.add(v));
    });
    const fill = (sel, set, label, extra = []) => {
      if (!sel) return;
      const opts = [`<option value="">${label} (alla)</option>`];
      extra.forEach(opt => {
        const text = String(opt?.label || '').trim();
        if (!text) return;
        const value = String(opt?.value ?? '');
        opts.push(`<option value="${value}">${text}</option>`);
      });
      opts.push(...[...set].sort().map(v => `<option>${v}</option>`));
      sel.innerHTML = opts.join('');
    };
    fill(dom.typSel,sets.typ ,'Typ', [{ value: ONLY_SELECTED_VALUE, label: ONLY_SELECTED_LABEL }]);
    fill(dom.arkSel,sets.ark ,'Arketyp');
    fill(dom.tstSel,sets.test,'Test');
  }
  refreshCharacterFilters();

  const activeTags = ()=>{
    dom.active.innerHTML='';
    const push=t=>dom.active.insertAdjacentHTML('beforeend',t);
    if (storeHelper.getOnlySelected(store)) {
      push('<span class="tag removable" data-type="onlySel">Endast valda ✕</span>');
    }
    F.search.forEach(v=>push(`<span class="tag removable" data-type="search" data-val="${v}">${v} ✕</span>`));
    F.typ .forEach(v=>push(`<span class="tag removable" data-type="typ" data-val="${v}">${v} ✕</span>`));
    F.ark .forEach(v=>push(`<span class="tag removable" data-type="ark" data-val="${v}">${v} ✕</span>`));
    F.test.forEach(v=>push(`<span class="tag removable" data-type="test" data-val="${v}">${v} ✕</span>`));
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
        const levelText = Object.values(p.nivåer || {}).join(' ');
        const text = searchNormalize(`${p.namn} ${(p.beskrivning || '')} ${levelText}`.toLowerCase());
        const hasTerms = terms.length > 0;
        const txt = hasTerms && (
          union ? terms.some(q => text.includes(q))
                : terms.every(q => text.includes(q))
        );
        const tags = p.taggar || {};
        const selTags = [...F.typ, ...F.ark, ...F.test];
        const hasTags = selTags.length > 0;
        const arkTags = explodeTags(tags.ark_trad);
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

  const renderSkills = arr=>{
    const sortMode = storeHelper.getEntrySort
      ? storeHelper.getEntrySort(store)
      : (typeof ENTRY_SORT_DEFAULT !== 'undefined' ? ENTRY_SORT_DEFAULT : 'alpha-asc');
    const entrySorter = typeof entrySortComparator === 'function'
      ? entrySortComparator(sortMode, { extract: g => g.entry })
      : ((a, b) => (typeof compareSv === 'function'
          ? compareSv(a?.entry?.namn || '', b?.entry?.namn || '')
          : String(a?.entry?.namn || '').localeCompare(String(b?.entry?.namn || ''), 'sv')));
    const groups = [];
    arr.forEach(p=>{
        const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
        const multi = (p.kan_införskaffas_flera_gånger && typesList.some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
        if(multi){
          const g = groups.find(x=>x.entry.namn===p.namn);
          if(g) { g.count++; return; }
          groups.push({entry:p, count:1});
        } else {
          groups.push({entry:p, count:1});
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
    if(!groups.length){ dom.valda.innerHTML = '<li class="card entry-card">Inga träffar.</li>'; return; }
    const cats = {};
    const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
      .map(t => searchNormalize(t.toLowerCase()));
    const searchActive = terms.length > 0;
    const catNameMatch = {};
    groups.forEach(g=>{
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
    catKeys.sort((a,b)=>{
      if (searchActive) {
        const aMatch = catNameMatch[a] ? 1 : 0;
        const bMatch = catNameMatch[b] ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return catComparator(a,b);
    });
    catKeys.forEach(cat=>{
      cats[cat].sort(entrySorter);
      const catLi=document.createElement('li');
      catLi.className='cat-group';
      const shouldOpen = catState[cat] !== undefined ? catState[cat] : (openCats.has(cat) || openCatsOnce.has(cat));
      catLi.innerHTML=`<details data-cat="${cat}"${shouldOpen ? ' open' : ''}><summary>${catName(cat)}</summary><ul class="card-list entry-card-list"></ul></details>`;
      const detailsEl = catLi.querySelector('details');
      const listEl=detailsEl.querySelector('ul');
      detailsEl.addEventListener('toggle', () => {
        updateCatToggle();
        catState[cat] = detailsEl.open;
        saveState();
      });
      cats[cat].forEach(g=>{
        const p = g.entry;
        const availLvls = LVL.filter(l=>p.nivåer?.[l]);
        const hasAnyLevel = availLvls.length > 0;
        const hasLevelSelect = availLvls.length > 1;
        const levelOptionsHtml = hasLevelSelect
          ? availLvls.map(l => {
              const short = levelLetter(l);
              const selected = l === p.nivå ? ' selected' : '';
              const shortAttr = short ? ` data-short="${short}"` : '';
              return `<option value="${l}"${shortAttr}${selected}>${l}</option>`;
            }).join('')
          : '';
        const lvlSel = hasLevelSelect
          ? `<select class="level" data-name="${p.namn}"${p.trait?` data-trait="${p.trait}"`:''} aria-label="Välj nivå för ${p.namn}">
              ${levelOptionsHtml}
            </select>`
          : '';
        const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
        let desc = abilityHtml(p, p.nivå);
        let infoBodyHtml = desc;
        const infoMeta = [];
        let raceInfo = '';
        let traitInfo = '';
        if (isRas(p) || isYrke(p) || isElityrke(p)) {
          const extra = yrkeInfoHtml(p);
          if (extra) infoBodyHtml += extra;
        }
        if (p.namn === 'Blodsband' && p.race) {
          const race = escapeHtml(p.race);
          infoMeta.push({ label: 'Ras', value: race });
          raceInfo = `<p><strong>Ras:</strong> ${race}</p>`;
        }
        if (p.trait) {
          const label = p.namn === 'Monsterlärd' ? 'Specialisering' : 'Karaktärsdrag';
          const value = escapeHtml(p.trait);
          infoMeta.push({ label, value });
          traitInfo = `<p><strong>${label}:</strong> ${value}</p>`;
        }
        const curList = storeHelper.getCurrentList(store);
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
        const xpTag = xpInfo?.tagHtml || `<span class="tag xp-cost">Erf: ${xpText}</span>`;
        const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
        const filterTagData = [];
        const primaryTagParts = [];
        typesList
          .filter(Boolean)
          .forEach((t, idx) => {
            const tag = { section: 'typ', value: t, label: t, hidden: idx === 0 };
            filterTagData.push(tag);
            if (!tag.hidden) primaryTagParts.push(renderFilterTag(tag));
          });
        const trTags = explodeTags(p.taggar?.ark_trad);
        const arkList = trTags.length ? trTags : (Array.isArray(p.taggar?.ark_trad) ? ['Traditionslös'] : []);
        arkList.forEach(t => {
          const tag = { section: 'ark', value: t, label: t, hidden: t === 'Traditionslös' };
          filterTagData.push(tag);
          if (!tag.hidden) primaryTagParts.push(renderFilterTag(tag));
        });
        (p.taggar?.test || [])
          .filter(Boolean)
          .forEach(t => filterTagData.push({ section: 'test', value: t, label: t }));
        const primaryTagsHtml = primaryTagParts.join(' ');
        const visibleTagData = filterTagData.filter(tag => !tag.hidden);
        const dockableTagData = visibleTagData.filter(tag => tag.section !== 'typ' && tag.section !== 'ark');
        const tagHtmlParts = dockableTagData.map(tag => renderFilterTag(tag));
        const infoTagHtmlParts = visibleTagData.map(tag => renderFilterTag(tag));
        const tagsHtml = tagHtmlParts.join(' ');
        const lvlBadgeVal = hasAnyLevel ? (p.nivå || availLvls[0] || '') : '';
        const lvlShort = levelLetter(lvlBadgeVal);
        const singleLevelTagHtml = (!hasLevelSelect && lvlShort && lvlBadgeVal)
          ? `<span class="tag level-tag" title="${lvlBadgeVal}">${lvlShort}</span>`
          : '';
        const infoTagParts = [xpTag]
          .concat(infoTagHtmlParts)
          .filter(Boolean);
        if (singleLevelTagHtml) infoTagParts.push(singleLevelTagHtml);
        const infoTagsHtml = infoTagParts.join(' ');
        const infoBoxTagParts = infoTagHtmlParts.filter(Boolean);
        if (singleLevelTagHtml) infoBoxTagParts.push(singleLevelTagHtml);
        const infoBoxFacts = infoMeta.filter(meta => {
          if (!meta) return false;
          const value = meta.value;
          if (value === undefined || value === null || value === '') return false;
          const label = String(meta.label || '').toLowerCase();
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
        let infoBoxContentHtml = '';
        if (isInv(p) && (infoBoxTagParts.length || infoBoxFactParts.length)) {
          const inlineTagsHtml = infoBoxTagParts.length
            ? `<div class="card-info-tags tags">${infoBoxTagParts.join(' ')}</div>`
            : '';
          const inlineFactsHtml = infoBoxFactParts.length
            ? `<div class="card-info-facts">${infoBoxFactParts.join('')}</div>`
            : '';
          const inlineParts = [inlineTagsHtml, inlineFactsHtml]
            .filter(Boolean)
            .join('');
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
        const infoBoxHtml = infoBoxContentHtml
          ? `<div class="card-info-box">${infoBoxContentHtml}</div>`
          : '';
        const xpHtml = xpInfo?.headerHtml || `<span class="entry-xp-value">Erf: ${xpText}</span>`;
        const levelHtml = hideDetails ? '' : (hasLevelSelect ? lvlSel : '');
        const infoSections = (isElityrke(p) && typeof buildElityrkeInfoSections === 'function')
          ? buildElityrkeInfoSections(p)
          : [];
        const infoPanelHtml = buildInfoPanelHtml({
          tagsHtml: infoTagsHtml,
          bodyHtml: infoBodyHtml,
          meta: infoMeta,
          sections: infoSections
        });
        const infoBtn = `<button class="char-btn icon icon-only info-btn" data-info="${encodeURIComponent(infoPanelHtml)}" aria-label="Visa info">${icon('info')}</button>`;

        const multi = (p.kan_införskaffas_flera_gånger && typesList.some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
        const total = storeHelper.getCurrentList(store).filter(x=>x.namn===p.namn && !x.trait).length;
        const limit = storeHelper.monsterStackLimit(storeHelper.getCurrentList(store), p.namn);
        const badge = g.count > 1 ? `<span class="count-badge">×${g.count}</span>` : '';
        const activeKeys = getActiveHandlingKeys(p);
        const activeNames = activeKeys.map(k => handlingName(p, k));
        const conflictIcon = icon('active');
        const conflictBtn = activeKeys.length
          ? (conflictIcon
            ? `<button class="char-btn icon icon-only conflict-btn" data-name="${p.namn}" title="Aktiva nivåer: ${activeNames.join(', ')}">${conflictIcon}</button>`
            : `<button class="char-btn icon conflict-btn" data-name="${p.namn}" title="Aktiva nivåer: ${activeNames.join(', ')}">💔</button>`)
          : '';
        const showInfo = compact || hideDetails;
        const hasCustomEdit = typesList.includes('Hemmagjort');
        const hasArtifactType = typesList.some(t => String(t).trim().toLowerCase() === 'artefakt');
        const editAction = hasCustomEdit ? 'editCustom' : (hasArtifactType ? 'editArtifact' : '');
        const idAttr = p.id ? ` data-id="${p.id}"` : '';
        const editBtn = editAction
          ? `<button data-act="${editAction}" class="char-btn" data-name="${p.namn}"${idAttr}>✏️</button>`
          : '';
        const infoBtnHtml = showInfo ? infoBtn : '';
        const titleActions = [];
        const buttonParts = [];
        if (infoBtnHtml) titleActions.push(infoBtnHtml);
        if (editBtn) buttonParts.push(editBtn);
        if (multi) {
          const isDisadv = typesList.includes('Nackdel');
          if (isDisadv) {
            if (total > 0) {
              const delBtn = `<button data-act="del" class="char-btn danger icon icon-only" data-name="${p.namn}">${icon('remove')}</button>`;
              const subBtn = `<button data-act="sub" class="char-btn icon icon-only" data-name="${p.namn}" aria-label="Minska">${icon('minus')}</button>`;
              const addBtn = total < limit ? `<button data-act="add" class="char-btn icon icon-only" data-name="${p.namn}" aria-label="Lägg till">${icon('plus')}</button>` : '';
              buttonParts.push(delBtn, subBtn);
              if (addBtn) buttonParts.push(addBtn);
            } else {
              const addBtn = `<button data-act="add" class="char-btn icon icon-only add-btn" data-name="${p.namn}" aria-label="Lägg till">${icon('plus')}</button>`;
              buttonParts.push(addBtn);
            }
            if (conflictBtn) buttonParts.push(conflictBtn);
          } else {
            const remBtn = total > 0
              ? `<button data-act="rem" class="char-btn danger icon icon-only" data-name="${p.namn}">${icon('remove')}</button>`
              : '';
            const addBtn = total < limit
              ? `<button data-act="add" class="char-btn icon icon-only add-btn" data-name="${p.namn}" aria-label="Lägg till">${icon('plus')}</button>`
              : '';
            if (remBtn) buttonParts.push(remBtn);
            if (conflictBtn) buttonParts.push(conflictBtn);
            if (addBtn) buttonParts.push(addBtn);
          }
        } else {
          buttonParts.push(`<button class="char-btn danger icon icon-only" data-act="rem">${icon('remove')}</button>`);
          if (conflictBtn) buttonParts.push(conflictBtn);
        }
        const dockPrimary = (p.taggar?.typ || [])[0] || '';
        const shouldDockTags = DOCK_TAG_TYPES.has(dockPrimary);
        const dockedTagsHtml = shouldDockTags ? renderDockedTags(dockableTagData) : '';
        const mobileTagsHtml = (!compact && !shouldDockTags && dockableTagData.length)
          ? renderDockedTags(dockableTagData, 'entry-tags-mobile')
          : '';
        const leftSections = [];
        if (shouldDockTags && dockedTagsHtml) leftSections.push(dockedTagsHtml);
        else if (mobileTagsHtml) leftSections.push(mobileTagsHtml);
        const descBlock = (!hideDetails && (desc || raceInfo || traitInfo))
          ? `<div class="card-desc">${desc}${raceInfo}${traitInfo}</div>`
          : '';
        const dataset = { name: p.namn };
        if (p.trait) dataset.trait = p.trait;
        dataset.xp = xpVal;
        if (p.id) dataset.id = p.id;
        const li = createEntryCard({
          compact,
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
          buttonSections: buttonParts,
          collapsible: true
        });

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
    updateCatToggle();
    openCatsOnce.clear();
    saveState();
    refreshEffectsPanel();
  };

  /* custom suggestions handled globalt */
  const updateSearchDatalist = () => {
    window.globalSearch?.refreshSuggestions?.();
  };

  renderSkills(filtered()); activeTags(); updateXP(); renderTraits(); updateSearchDatalist();
  window.indexViewUpdate = () => { renderSkills(filtered()); renderTraits(); updateSearchDatalist(); };
  // expose for main.js to refresh dropdowns when switching character
  window.indexViewRefreshFilters = () => { refreshCharacterFilters(); updateSearchDatalist(); };
  window.refreshEffectsPanel = refreshEffectsPanel;

  dom.catToggle.addEventListener('click', () => {
    const details = document.querySelectorAll('.cat-group > details');
    if (catsMinimized) {
      details.forEach(d => { d.open = true; });
    } else {
      details.forEach(d => { d.open = false; });
    }
    updateCatToggle();
  });

  /* --- filter-events */
  dom.sIn.addEventListener('input', () => {
    sTemp = dom.sIn.value.trim();
  });

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
    if (toolbar && toolbar.dataset.characterDropdownWatcher !== '1') {
      toolbar.addEventListener('toolbar-rendered', () => {
        ensureDropdownChangeHandlers();
      });
      toolbar.dataset.characterDropdownWatcher = '1';
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
      if (el.dataset.characterDropdownBound === '1') return;
      el.addEventListener('change', handleDropdownChange(sel, key));
      el.dataset.characterDropdownBound = '1';
    });
    return !missing;
  };

  ensureDropdownChangeHandlers();
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const sec=t.dataset.type,val=t.dataset.val;
    if(sec==='search'){F.search=F.search.filter(x=>x!==val);} 
    else if(sec==='onlySel'){ storeHelper.setOnlySelected(store,false); }
    else F[sec]=F[sec].filter(x=>x!==val);
    if(sec==='test'){ storeHelper.setOnlySelected(store,false); dom.tstSel.value=''; }
    activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
  });

  // Treat clicks on tags anywhere as filter selections
  document.addEventListener('click', e => {
    const tag = e.target.closest('.filter-tag');
    if (!tag) return;
    const sectionMap = { ark_trad: 'ark', ark: 'ark', typ: 'typ', test: 'test' };
    const section = sectionMap[tag.dataset.section];
    if (!section) return;
    const val = tag.dataset.val;
    if (!F[section].includes(val)) F[section].push(val);
    if (section === 'typ') openCatsOnce.add(val);
    activeTags(); renderSkills(filtered()); renderTraits();
  });

  function formatLevels(list){
    if(list.length===0) return '';
    if(list.length===1) return list[0];
    if(list.length===2) return `${list[0]} och ${list[1]}`;
    return `${list.slice(0,-1).join(', ')} och ${list[list.length-1]}`;
  }

  /* ta bort & nivåbyte */
  dom.valda.addEventListener('click', async e=>{
    if (e.target.closest('.filter-tag')) return;
    if (e.target.closest('.entry-collapse-btn')) return;
    const header = e.target.closest('.card-header');
    if (header && !e.target.closest('button, a, select, input, textarea, [contenteditable="true"], [role="button"]')) {
      return;
    }
    const conflictBtn = e.target.closest('.conflict-btn');
      if(conflictBtn){
        const currentName = conflictBtn.dataset.name;
        const current = storeHelper.getCurrentList(store).find(x=>x.namn===currentName);
        const curKeys = getActiveHandlingKeys(current || {});
        const curNames = curKeys.map(k => handlingName(current || {}, k));
        let baseName = currentName;
        let levelsText = '';
        if (curKeys.length) {
          if (curKeys.every(k => !LVL.includes(k))) {
            baseName = `${currentName}: ${curNames.join(', ')}`;
          } else {
            const lvlWord = curNames.length === 1 ? 'nivån' : 'nivåerna';
            levelsText = ` på ${lvlWord} ${formatLevels(curNames)}`;
          }
        }
        conflictTitle.textContent = `${baseName}${levelsText} kan ej användas samtidigt som:`;
        const others = storeHelper.getCurrentList(store)
          .filter(x => x.namn !== currentName && getActiveHandlingKeys(x).length);
        renderConflicts(others);
        conflictPanel.classList.add('open');
        conflictPanel.scrollTop = 0;
        return;
      }
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      let html=decodeURIComponent(infoBtn.dataset.info||'');
      const liEl = infoBtn.closest('li');
      const title = liEl?.querySelector('.card-title .entry-title-main')?.textContent || '';
      if(infoBtn.dataset.tabell!=null){
        const terms = [...F.search, ...(sTemp ? [sTemp] : [])].map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
        if (terms.length) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          highlightInElement(tmp, terms);
          html = tmp.innerHTML;
        }
        tabellPopup.open(html, title);
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
    const actBtn=e.target.closest('button[data-act]');
    if(!actBtn) return;
    const act = actBtn.dataset.act;
    const liEl = actBtn.closest('li');
    if (!liEl) return;
    const name = actBtn.dataset.name || liEl.dataset.name;
    const idAttr = actBtn.dataset.id || liEl.dataset.id || null;
    const ref = { id: idAttr || undefined, name };
    const tr = liEl.dataset.trait || null;
    const before = storeHelper.getCurrentList(store);
    const disBefore = storeHelper.countDisadvantages(before);
    let p = idAttr ? before.find(x => String(x.id) === String(idAttr)) : null;
    if(!p && name) p = before.find(x=>x.namn===name);
    if(!p) p = lookupEntry(ref);
    if(!p) return;
    const typesList = Array.isArray(p.taggar?.typ) ? p.taggar.typ : [];
    const handleEntryEdited = () => {
      refreshCharacterFilters();
      activeTags();
      renderSkills(filtered());
      renderTraits();
      updateSearchDatalist();
      if (window.indexViewRefreshFilters) window.indexViewRefreshFilters();
      if (window.indexViewUpdate) window.indexViewUpdate();
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
    const multi = (p.kan_införskaffas_flera_gånger && typesList.some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
    let list;
    if(act==='add'){
          if(name==='Korruptionskänslig' && before.some(x=>x.namn==='Dvärg')){
            await alertPopup('Dvärgar kan inte ta Korruptionskänslig.');
            return;
          }
          if(!multi) return;
          const cnt = before.filter(x=>x.namn===name && !x.trait).length;
          const limit = storeHelper.monsterStackLimit(before, name);
          if(cnt >= limit){
            await alertPopup(`Denna fördel eller nackdel kan bara tas ${limit} gånger.`);
            return;
          }
        const lvlSel = liEl.querySelector('select.level');
        let   lvl = lvlSel ? lvlSel.value : null;
        if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || p.nivå;
        if(isMonstrousTrait(p)){
          const baseName = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
          const baseRace = before.find(isRas)?.namn;
          const trollTraits = ['Naturligt vapen', 'Pansar', 'Regeneration', 'Robust'];
          const undeadTraits = ['Gravkyla', 'Skräckslå', 'Vandödhet'];
          const bloodvaderTraits = ['Naturligt vapen','Pansar','Regeneration','Robust'];
          const hamLvl = storeHelper.abilityLevel(before, 'Hamnskifte');
          const bloodRaces = before.filter(x => x.namn === 'Blodsband' && x.race).map(x => x.race);
          let monsterOk = typesList.includes('Elityrkesförmåga') ||
            (before.some(x => x.namn === 'Mörkt blod') && storeHelper.DARK_BLOOD_TRAITS.includes(baseName)) ||
            (baseRace === 'Troll' && trollTraits.includes(baseName)) ||
            (baseRace === 'Vandöd' && undeadTraits.includes(baseName)) ||
            (baseRace === 'Rese' && baseName === 'Robust') ||
            (before.some(x => x.namn === 'Blodvadare') && bloodvaderTraits.includes(baseName)) ||
            ((baseRace === 'Andrik' || bloodRaces.includes('Andrik')) && baseName === 'Diminutiv') ||
            (hamLvl >= 2 && lvl === 'Novis' && ['Naturligt vapen','Pansar'].includes(baseName)) ||
            (hamLvl >= 3 && lvl === 'Novis' && ['Regeneration','Robust'].includes(baseName));
          if(!monsterOk){
            if(!(await confirmPopup('Monstruösa särdrag kan normalt inte väljas. Lägga till ändå?')))
              return;
          }
          if (storeHelper.hamnskifteNoviceLimit(before, p, lvl)) {
            await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
            return;
          }
        }
        if(name==='Råstyrka'){
          const robust=before.find(x=>x.namn==='Robust');
          const hasRobust=!!robust && (robust.nivå===undefined || robust.nivå!=='');
          if(!hasRobust){
            if(!(await confirmPopup('Råstyrka kräver Robust på minst Novis-nivå. Lägga till ändå?')))
              return;
          }
        }
        // Tidigare blockerades Mörkt förflutet om Jordnära fanns – inte längre.
        if(name==='Packåsna' && before.some(x=>x.namn==='Hafspackare')){
          await alertPopup('Karaktärer med Hafspackare kan inte ta Packåsna.');
          return;
        }
        if(name==='Hafspackare' && before.some(x=>x.namn==='Packåsna')){
          await alertPopup('Karaktärer med Packåsna kan inte ta Hafspackare.');
          return;
        }
        list = [...before, { ...p, nivå: lvl }];
        const disAfter = storeHelper.countDisadvantages(list);
        if (disAfter === 5 && disBefore < 5) {
          await alertPopup('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
        }
    }else if(act==='sub' || act==='del' || act==='rem'){
      if(name==='Mörkt förflutet' && before.some(x=>x.namn==='Mörkt blod')){
        if(!(await confirmPopup('Mörkt förflutet hänger ihop med Mörkt blod. Ta bort ändå?')))
          return;
      }
      const baseRem = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
      if(isMonstrousTrait(p) && storeHelper.DARK_BLOOD_TRAITS.includes(baseRem) && before.some(x=>x.namn==='Mörkt blod')){
        if(!(await confirmPopup(name+' hänger ihop med Mörkt blod. Ta bort ändå?')))
          return;
      }
      if (act === 'sub') {
        // Remove a single instance
        let removed=false;
        list=[];
        for(const it of before){
          if(!removed && it.namn===name && !it.trait){
            removed=true; continue;
          }
          list.push(it);
        }
      } else if (act === 'del' || (!multi && act === 'rem')) {
        // Remove all instances (or single non-multi)
        list = before.filter(x => !(x.namn===name && (tr?x.trait===tr:!x.trait)));
      } else if (act === 'rem') {
        // Backward compat: for multi, old 'rem' removed one
        let removed=false;
        list=[];
        for(const it of before){
          if(!removed && it.namn===name && !it.trait){
            removed=true; continue;
          }
          list.push(it);
        }
      } else {
        return;
      }
      const removed = before.find(it => it.namn===name && (tr?it.trait===tr:!it.trait));
      const remDeps = storeHelper.getDependents(before, removed);
      if(name==='Mörkt blod' && remDeps.length){
        if(await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)){
          list = list.filter(x => !remDeps.includes(x.namn));
        }
      } else if(remDeps.length){
        if(!(await confirmPopup(`F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${remDeps.join(', ')}. Ta bort \u00e4nd\u00e5?`))) return;
      }
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        const deps = before
          .filter(isElityrke)
          .filter(el => eliteReq.check(el, before).ok && !eliteReq.check(el, list).ok)
          .map(el => el.namn);
        const msg = deps.length
          ? `F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${deps.join(', ')}. Ta bort \u00e4nd\u00e5?`
          : 'F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r ett valt elityrke. Ta bort \u00e4nd\u00e5?';
        if(!(await confirmPopup(msg)))
          return;
      }
      flashRemoved(liEl);
      await new Promise(r => setTimeout(r, 100));
    } else {
      return;
    }
    storeHelper.setCurrentList(store, list);
    if (p.namn === 'Privilegierad') {
      invUtil.renderInventory();
    }
    if (p.namn === 'Besittning') {
      if (act === 'add') {
        const amount = Math.floor(Math.random() * 10) + 11;
        storeHelper.setPossessionMoney(store, { daler: amount, skilling: 0, 'örtegar': 0 });
        await alertPopup(`Grattis! Din besittning har tjänat dig ${amount} daler!`);
      } else {
        storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
      }
      invUtil.renderInventory();
    }
    if (p.namn === 'Välutrustad') {
      const inv = storeHelper.getInventory(store);
      if (act === 'add') {
        invUtil.addWellEquippedItems(inv);
      } else {
        invUtil.removeWellEquippedItems(inv);
      }
      invUtil.saveInventory(inv);
      invUtil.renderInventory();
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
      invUtil.saveInventory(inv);
      invUtil.renderInventory();
      storeHelper.removeRevealedArtifact(store, p.id);
    }
      renderSkills(filtered());
      updateXP();
      renderTraits();
      updateSearchDatalist();
    if (act === 'add') {
      flashAdded(name, tr);
    }

  });

  if (dom.valda) {
    dom.valda.addEventListener('entry-card-toggle', () => {
      updateCatToggle();
      refreshEffectsPanel();
    });
  }
  dom.valda.addEventListener('change', async e=>{
    if(!e.target.matches('select.level')) return;
    const select = e.target;
    window.entryCardFactory?.syncLevelControl?.(select);
    const name=select.dataset.name;
    const tr=select.dataset.trait || select.closest('li').dataset.trait || null;
    const list=storeHelper.getCurrentList(store);
    const ent=list.find(x=>x.namn===name && (tr?x.trait===tr:!x.trait));
    if(ent){
      const before=list.map(x=>({...x}));
      const old = ent.nivå;
      ent.nivå=select.value;
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        await alertPopup('Förmågan krävs för ett valt elityrke och kan inte ändras.');
        ent.nivå = old;
        select.value = old;
        window.entryCardFactory?.syncLevelControl?.(select);
        return;
      }
      if (storeHelper.hamnskifteNoviceLimit(list, ent, ent.nivå)) {
        await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
        ent.nivå = old;
        select.value = old;
        window.entryCardFactory?.syncLevelControl?.(select);
        return;
      }
      if(name==='Monsterlärd'){
        if(['Gesäll','Mästare'].includes(ent.nivå)){
          if(!ent.trait && window.monsterLore){
            monsterLore.pickSpec(spec=>{
              if(!spec){
                ent.nivå=old;
                select.value=old;
                window.entryCardFactory?.syncLevelControl?.(select);
                return;
              }
              ent.trait=spec;
                storeHelper.setCurrentList(store,list); updateXP();
                renderSkills(filtered()); renderTraits(); updateSearchDatalist();
            });
            return;
          }
        }else if(ent.trait){
          delete ent.trait;
          storeHelper.setCurrentList(store,list); updateXP();
          renderSkills(filtered()); renderTraits(); updateSearchDatalist();
          window.entryCardFactory?.syncLevelControl?.(select);
          return;
        }
      }
      storeHelper.setCurrentList(store,list); updateXP();
    }
      renderSkills(filtered()); renderTraits(); updateSearchDatalist();
      window.entryCardFactory?.syncLevelControl?.(select);
      flashAdded(name, tr);
  });
}

  window.initCharacter = initCharacter;
})(window);
