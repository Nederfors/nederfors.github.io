(function(window){
  const utils = window.eliteUtils || {};

  const fallbackSplitComma = (str) => {
    const out = [];
    let buf = '';
    let depth = 0;
    const input = String(str || '');
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  };

  const fallbackSplitOr = (str) => {
    const out = [];
    let buf = '';
    let depth = 0;
    const input = String(str || '');
    const lower = input.toLowerCase();
    for (let i = 0; i < input.length;) {
      if (lower.startsWith(' eller ', i) && depth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        i += 7;
        continue;
      }
      const ch = input[i];
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      buf += ch;
      i++;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  };

  const splitComma = utils.splitComma || fallbackSplitComma;
  const splitOr = utils.splitOr || fallbackSplitOr;

  const expandRequirement = utils.expandRequirement
    || utils.normalizeRequirement
    || function (raw) {
      const name = String(raw || '').trim();
      if (!name) return [];
      const mysticMatch = name.match(/^Mystisk kraft\s*\(([^)]+)\)/i);
      if (mysticMatch) {
        const inner = mysticMatch[1].trim();
        if (inner.toLowerCase() === 'valfri') return [{ anyMystic: true }];
        const variants = [].concat(...splitComma(inner).map(segment => splitOr(segment)));
        return variants
          .map(nm => nm.trim())
          .filter(Boolean)
          .map(nm => ({ names: [nm] }));
      }
      const ritualMatch = name.match(/^Ritualist\s*\(([^)]+)\)/i);
      if (ritualMatch) {
        const inner = ritualMatch[1].trim();
        if (inner.toLowerCase() === 'valfri') return [{ anyRitual: true }];
        const variants = [].concat(...splitComma(inner).map(segment => splitOr(segment)));
        return variants
          .map(nm => nm.trim())
          .filter(Boolean)
          .map(nm => ({ names: [nm] }));
      }
      if (/^Ritualist$/i.test(name)) return [{ anyRitual: true }];
      return [{ names: [name] }];
    };

  const parseRequirementGroups = (str) => {
    if (typeof utils.parseRequirements === 'function') {
      return utils.parseRequirements(str);
    }
    const raw = String(str || '');
    if (typeof window.eliteReq?.parse === 'function') {
      return window.eliteReq.parse(raw);
    }
    return splitComma(raw).map(seg => splitOr(seg));
  };
  function createPopup(){
    if(document.getElementById('masterPopup')) return;
    const div=document.createElement('div');
    div.id='masterPopup';
    div.className='popup popup-bottom';
div.innerHTML=`<div class="popup-inner"><h3 id="masterTitle">L\u00e4gg till elityrke med f\u00f6rm\u00e5gor; minst en m\u00e5ste vara p\u00e5 m\u00e4starniv\u00e5</h3><div id="masterOpts"></div><div id="masterBtns"><button id="masterAdd" class="char-btn">L\u00e4gg till</button><button id="masterCancel" class="char-btn danger">Avbryt</button></div></div>`;    document.body.appendChild(div);
  }

  function openPopup(groups, cb){
    createPopup();
    const pop=document.getElementById('masterPopup');
    const box=pop.querySelector('#masterOpts');
    const add=pop.querySelector('#masterAdd');
    const cls=pop.querySelector('#masterCancel');
    box.innerHTML = groups.map((g, i) => {
      const optsNormal = `<option value="Novis">Novis</option><option value="Ges\u00e4ll">Ges\u00e4ll</option><option value="M\u00e4stare">M\u00e4stare</option>`;
      const optsOr = `<option value="skip">Skippa</option>` + optsNormal;
      const optsRitOr = `<option value="Novis">V\u00e4lj</option><option value="skip">Skippa</option>`;
      const optsRitSingle = `<option value="Novis">V\u00e4lj</option>`;

      if(g.anyMystic || g.anyRitual){
        const list = (g.anyMystic ? allMystic() : allRitual()).map(e => e.namn).sort();
        const label = g.anyMystic ? 'Mystisk kraft' : 'Ritual';
        if (g.anyRitual) {
          // Valfri ritual: endast namnlista, ingen nivå och ingen Skippa
          const optsName = list.map(n => `<option>${n}</option>`).join('');
          return `<label>${label} <select data-ability data-group="${i}">${optsName}</select></label>`;
        }
        const optsName = `<option value="skip">Skippa</option>` + list.map(n => `<option>${n}</option>`).join('');
        return `<label>${label} <select data-ability data-group="${i}">${optsName}</select> <select data-name="" data-group="${i}" class="level">${optsNormal}</select></label>`;
      }

      const html = g.names.map((nm, j) => {
        const opts = g.allRitual ? (g.names.length > 1 ? optsRitOr : optsRitSingle) : (g.names.length > 1 ? optsOr : optsNormal);
        const sep = j > 0 ? '<div class="or-sep">eller</div>' : '';
        return sep + `<label>${nm}<select data-name="${nm}" data-group="${i}" class="level">${opts}</select></label>`;
      }).join('');
      return g.names.length > 1 ? `<div class="or-group">${html}</div>` : html;
    }).join('');
    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;
    const nameSels = box.querySelectorAll('select[data-ability]');
    const levelSels = box.querySelectorAll('select[data-name]');

    // Förval: anpassa nivåer efter vad rollpersonen redan har valt
    try {
      const list = storeHelper.getCurrentList(store);
      const LVL_IDX = { '':0, 'Novis':1, 'Ges\u00e4ll':2, 'M\u00e4stare':3 };

      // 1) Generiska grupper: anyMystic/anyRitual – välj bästa match i listan
      groups.forEach((g, i) => {
        if (!(g.anyMystic || g.anyRitual)) return;
        const nameSel = box.querySelector(`select[data-ability][data-group="${i}"]`);
        const lvlSel  = box.querySelector(`select[data-name][data-group="${i}"]`);
        if (!nameSel) return;
        const isMyst = !!g.anyMystic;
        // plocka kandidater ur karaktärslistan
        const candidates = list
          .filter(it => (it.taggar?.typ || []).includes(isMyst ? 'Mystisk kraft' : 'Ritual'))
          .filter(it => !isEliteSkill(it));
        if (!candidates.length) return;
        // välj bästa (högst nivå för mystik, godtycklig för ritual)
        let best = candidates[0];
        if (isMyst) {
          candidates.forEach(it => {
            const a = LVL_IDX[it.nivå || ''] || 0;
            const b = LVL_IDX[best.nivå || ''] || 0;
            if (a > b) best = it;
          });
        }
        // förvälj
        if ([...nameSel.options].some(o => o.value === best.namn || o.textContent === best.namn)) {
          nameSel.value = best.namn;
          if (isMyst && lvlSel) {
            lvlSel.dataset.name = best.namn;
            lvlSel.value = best.nivå || 'Novis';
          }
        }
      });

      // 2) Namngivna grupper – sätt nivå per namn om den redan finns
      groups.forEach((g, i) => {
        if (!g.names || !g.names.length) return;
        g.names.forEach(nm => {
          const sel = box.querySelectorAll(`select[data-group="${i}"][data-name]`);
          const s = Array.from(sel).find(x => (x.dataset.name || '') === nm);
          if (!s) return;
          const cur = list.find(it => it.namn === nm);
          if (!cur) return;
          if (isRitual(nm)) {
            s.value = 'Novis'; // markerar att ritualen uppfylls
          } else {
            s.value = cur.nivå || 'Novis';
          }
        });
      });
    } catch {}

    nameSels.forEach(sel => {
      sel.addEventListener('change', () => {
        const lvl = box.querySelector(`select[data-name][data-group="${sel.dataset.group}"]`);
        if (lvl) lvl.dataset.name = sel.value !== 'skip' ? sel.value : '';
        check();
      });
    });

    function close(){
      pop.classList.remove('open');
      box.innerHTML='';
      add.removeEventListener('click',onAdd);
      cls.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
      levelSels.forEach(s=>s.removeEventListener('change',check));
      nameSels.forEach(s=>s.removeEventListener('change',check));
    }
    function onAdd(){
      const sels=box.querySelectorAll('select[data-name]');
      const levels={};
      sels.forEach(s=>{
        if(!s.dataset.name || s.value==='skip') return;
        levels[s.dataset.name]=s.value;
      });
      // Val från valfri ritual-grupp (ingen nivå)
      const ablSels = box.querySelectorAll('select[data-ability]');
      ablSels.forEach(sel => {
        const grp = groups[Number(sel.dataset.group)];
        if (grp && grp.anyRitual) {
          const nm = sel.value;
          if (nm && nm !== 'skip') levels[nm] = 'Novis';
        }
      });
      close();
      cb(levels);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        close();
        cb(null);
      }
    }
    function check(){
      // 1) Varje grupp måste vara vald (ej "skippa")
      for(let i=0;i<groups.length;i++){
        const nameSel=box.querySelector(`select[data-ability][data-group="${i}"]`);
        if(nameSel){
          if(nameSel.value==='skip'){ add.disabled=true; return; }
          continue;
        }
        const sgs=box.querySelectorAll(`select[data-group="${i}"][data-name]`);
        if(sgs.length && Array.from(sgs).every(x=>x.value==='skip')){ add.disabled=true; return; }
      }
      // 2) Minst en vald nivå måste vara Mästare, om nivåval finns
      const levelSelsAll = box.querySelectorAll('select[data-name]');
      if(levelSelsAll.length){
        const hasMaster = Array.from(levelSelsAll).some(s=>s.value==='M\u00e4stare');
        if(!hasMaster){ add.disabled=true; return; }
      }
      add.disabled=false;
    }
    levelSels.forEach(s=>s.addEventListener('change',check));
    nameSels.forEach(s=>s.addEventListener('change',check));
    check();
    add.addEventListener('click',onAdd);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
  }

  function allMystic(){
    return DB.filter(x =>
      (x.taggar?.typ || []).includes('Mystisk kraft') &&
      !isEliteSkill(x));
  }

  function allRitual(){
    return DB.filter(x =>
      (x.taggar?.typ || []).includes('Ritual') &&
      !isEliteSkill(x));
  }
  function parseNames(str){
    const groups = parseRequirementGroups(str || '');
    const names = new Set();
    groups.forEach(group => {
      group.forEach(raw => {
        expandRequirement(raw).forEach(v => {
          if (v.anyMystic || v.anyRitual) return;
          (Array.isArray(v.names) ? v.names : []).forEach(nm => {
            const trimmed = String(nm || '').trim();
            if (!trimmed) return;
            names.add(trimmed);
          });
        });
      });
    });
    return Array.from(names);
  }

  function parseGroupRequirements(str){
    const raw = parseRequirementGroups(str || '');
    const out = [];
    raw.forEach(g => {
      let hasAnyMystic = false;
      let hasAnyRitual = false;
      const set = new Set();
      g.forEach(name => {
        expandRequirement(name).forEach(v => {
          if (v.anyMystic) {
            hasAnyMystic = true;
            return;
          }
          if (v.anyRitual) {
            hasAnyRitual = true;
            return;
          }
          (Array.isArray(v.names) ? v.names : []).forEach(nm => {
            const trimmed = String(nm || '').trim();
            if (!trimmed) return;
            set.add(trimmed);
          });
        });
      });
      if (hasAnyMystic) {
        out.push({ anyMystic: true });
        return;
      }
      if (hasAnyRitual && set.size === 0) {
        out.push({ anyRitual: true });
        return;
      }
      let names = Array.from(set);
      if(!names.length) return;
      const allRitual = names.every(isRitual);
      out.push({ names, allRitual });
    });
    out.sort((a, b) => {
      const ao = a.names && a.names.length > 1 ? 1 : 0;
      const bo = b.names && b.names.length > 1 ? 1 : 0;
      return ao - bo;
    });
    return out;
  }

  function isRitual(name){
    const entry=lookupEntry({ id: name, name });
    return (entry?.taggar?.typ||[]).includes('Ritual');
  }

  async function addReq(entry, levels){
    if(!store.current && !(await requireCharacter())) return;
    const names=parseNames(entry.krav_formagor||'');
    const listNames = new Set(names);
    if(levels && typeof levels==='object'){
      Object.keys(levels).forEach(n=>listNames.add(n));
    }
    if(!listNames.size) return;
    const list=storeHelper.getCurrentList(store);
    const isMap = levels && typeof levels === 'object';
    listNames.forEach(nm=>{
      if(isMap && !(nm in levels)) return;
      const lvl = isMap ? levels[nm] : (nm===levels ? 'Mästare' : 'Novis');
      if(!lvl || lvl==='skip') return;
      const item=lookupEntry({ id: nm, name: nm });
      if(!item) return;
      const cur=list.find(x=>x.namn===nm);
      if(cur){ cur.nivå=lvl; }
      else list.push({ ...item, nivå:lvl });
    });
    storeHelper.setCurrentList(store,list);
  }

  async function addElite(entry, opts = {}){
    if(!store.current && !(await requireCharacter())) return;
    const list = storeHelper.getCurrentList(store);
    if(list.some(x=>x.namn===entry.namn)) return;
    const skipDup = !!opts.skipDuplicateConfirm;
    if(list.some(isElityrke)){
      if(!skipDup){
        if(!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
      }
    }
    const res = eliteReq.check(entry, list);
      if(!res.ok){
      const msg = 'Krav ej uppfyllda:\n' +
        (res.missing.length ? 'Saknar: ' + res.missing.join(', ') + '\n' : '') +
        (res.master ? '' : 'Ingen av kraven på Mästare-nivå.\n') +
        'Lägga till ändå?';
      if(!(await confirmPopup(msg))) return;
    }
    list.push({ ...entry });
    storeHelper.setCurrentList(store, list);
  }

  async function handle(btn){
    const name=btn.dataset.eliteReq;
    const entry=lookupEntry({ id: name, name });
    if(!entry) return;
    if(!store.current && !(await requireCharacter())) return;
    const listPre = storeHelper.getCurrentList(store);
    if(listPre.some(x=>x.namn===entry.namn)) return;
    if(listPre.some(isElityrke)){
      if(!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
    }
    const groups=parseGroupRequirements(entry.krav_formagor||'');
    if(!groups.length){
      await addReq(entry); await addElite(entry, { skipDuplicateConfirm: true }); updateXP(); if (window.applyCharacterChange) applyCharacterChange(); return;
    }
    openPopup(groups, levels=>{
      if(!levels) return;
      addReq(entry, levels);
      addElite(entry, { skipDuplicateConfirm: true });
      updateXP();
      if (window.applyCharacterChange) applyCharacterChange();
    });
  }

  function onClick(e){
    const b=e.target.closest('button[data-elite-req]');
    if(!b) return;
    handle(b);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    if(document.body.dataset.role==='index'){
      document.getElementById('lista').addEventListener('click',onClick);
    }
  });

  window.eliteAdd={parseNames,parseGroupRequirements,addReq,addElite};
})(window);
