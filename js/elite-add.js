(function(window){
  function createPopup(){
    if(document.getElementById('masterPopup')) return;
    const div=document.createElement('div');
    div.id='masterPopup';
    div.innerHTML=`<div class="popup-inner"><h3 id="masterTitle">V\u00e4lj niv\u00e5</h3><div id="masterOpts"></div><div id="masterBtns"><button id="masterAdd" class="char-btn">L\u00e4gg till</button><button id="masterCancel" class="char-btn danger">Avbryt</button></div></div>`;
    document.body.appendChild(div);
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
      const optsRit = `<option value="Novis">V\u00e4lj</option><option value="skip">Skippa</option>`;

      if(g.anyMystic || g.anyRitual){
        const list = (g.anyMystic ? allMystic() : allRitual()).map(e => e.namn).sort();
        const optsName = `<option value="skip">Skippa</option>` + list.map(n => `<option>${n}</option>`).join('');
        const label = g.anyMystic ? 'Mystisk kraft' : 'Ritual';
        return `<label>${label} <select data-ability data-group="${i}">${optsName}</select> <select data-name="" data-group="${i}" class="level">${optsNormal}</select></label>`;
      }

      const html = g.names.map((nm, j) => {
        const opts = g.allRitual ? optsRit : (g.names.length > 1 ? optsOr : optsNormal);
        const sep = j > 0 ? '<div class="or-sep">eller</div>' : '';
        return sep + `<label>${nm}<select data-name="${nm}" data-group="${i}" class="level">${opts}</select></label>`;
      }).join('');
      return g.names.length > 1 ? `<div class="or-group">${html}</div>` : html;
    }).join('');
    pop.classList.add('open');
    const nameSels = box.querySelectorAll('select[data-ability]');
    const levelSels = box.querySelectorAll('select[data-name]');

    nameSels.forEach(sel => {
      const lvl = box.querySelector(`select[data-name][data-group="${sel.dataset.group}"]`);
      sel.addEventListener('change', () => {
        lvl.dataset.name = sel.value !== 'skip' ? sel.value : '';
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
      for(let i=0;i<groups.length;i++){
        const nameSel=box.querySelector(`select[data-ability][data-group="${i}"]`);
        if(nameSel){
          if(nameSel.value==='skip'){ add.disabled=true; return; }
          continue;
        }
        const sgs=box.querySelectorAll(`select[data-group="${i}"][data-name]`);
        if(sgs.length && Array.from(sgs).every(x=>x.value==='skip')){ add.disabled=true; return; }
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

  function splitComma(str){
    const out=[]; let buf=''; let depth=0;
    for(let i=0;i<str.length;i++){
      const ch=str[i];
      if(ch==='(') depth++;
      if(ch===')') depth--;
      if(ch===',' && depth===0){ if(buf.trim()) out.push(buf.trim()); buf=''; continue; }
      buf+=ch;
    }
    if(buf.trim()) out.push(buf.trim());
    return out;
  }
  function splitOr(str){
    const out=[]; let buf=''; let depth=0; const lower=str.toLowerCase();
    for(let i=0;i<str.length;){
      if(lower.startsWith(' eller ', i) && depth===0){ if(buf.trim()) out.push(buf.trim()); buf=''; i+=7; continue; }
      const ch=str[i]; if(ch==='(') depth++; if(ch===')') depth--; buf+=ch; i++; }
    if(buf.trim()) out.push(buf.trim());
    return out;
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
    const groups=splitComma(str||'');
    const arr=[];
    groups.forEach(g=>{ splitOr(g).forEach(n=>arr.push(n)); });
    const out=[];
    arr.forEach(name=>{
      const m=name.match(/^Mystisk kraft\s*\(([^)]+)\)/i);
      if(m){
        const inner=m[1].trim();
        if(inner.toLowerCase()==='valfri') return;
        splitComma(inner).forEach(g=>splitOr(g).forEach(n=>out.push(n.trim())));
      } else {
        const r=name.match(/^Ritualist\s*\(([^)]+)\)/i);
        if(r){
          const inner=r[1].trim();
          if(inner.toLowerCase()==='valfri') return;
          splitComma(inner).forEach(g=>splitOr(g).forEach(n=>out.push(n.trim())));
        } else if(!/^Ritualist$/i.test(name.trim())) {
          out.push(name.trim());
        }
      }
    });
    return Array.from(new Set(out));
  }

  function parseGroupRequirements(str){
    const raw = eliteReq.parse(str||'');
    const out = [];
    raw.forEach(g => {
      // Check for single-name groups that signal any mystic power/ritual.
      if(g.length===1){
        const name = g[0].trim();
        const mm = name.match(/^Mystisk kraft\s*\(([^)]+)\)/i);
        if(mm && mm[1].trim().toLowerCase()==='valfri'){
          out.push({anyMystic:true});
          return;
        }
        const rr = name.match(/^Ritualist\s*\(([^)]+)\)/i);
        if(rr && rr[1].trim().toLowerCase()==='valfri'){
          out.push({anyRitual:true});
          return;
        }
        if(/^Ritualist$/i.test(name)){
          out.push({anyRitual:true});
          return;
        }
      }

      let names = [];
      g.forEach(name => {
        const m=name.match(/^Mystisk kraft\s*\(([^)]+)\)/i);
        if(m){
          const inner=m[1].trim();
          if(inner.toLowerCase()==='valfri') return;
          eliteReq.splitComma(inner).forEach(h=>eliteReq.splitOr(h).forEach(n=>names.push(n.trim())));
        }else{
          const r=name.match(/^Ritualist\s*\(([^)]+)\)/i);
          if(r){
            const inner=r[1].trim();
            if(inner.toLowerCase()==='valfri') return;
            eliteReq.splitComma(inner).forEach(h=>eliteReq.splitOr(h).forEach(n=>names.push(n.trim())));
          }else if(!/^Ritualist$/i.test(name.trim())){
            names.push(name.trim());
          }
        }
      });
      names = Array.from(new Set(names));
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
    const entry=DB.find(x=>x.namn===name);
    return (entry?.taggar?.typ||[]).includes('Ritual');
  }

  function addReq(entry, levels){
    if(!store.current) return alert('Ingen rollperson vald.');
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
      const item=DB.find(x=>x.namn===nm);
      if(!item) return;
      const cur=list.find(x=>x.namn===nm);
      if(cur){ cur.nivå=lvl; }
      else list.push({ ...item, nivå:lvl });
    });
    storeHelper.setCurrentList(store,list);
  }

  function addElite(entry){
    if(!store.current) return alert('Ingen rollperson vald.');
    const list = storeHelper.getCurrentList(store);
    if(list.some(x=>x.namn===entry.namn)) return;
    if(list.some(isElityrke)){
      if(!confirm('Du kan bara välja ett elityrke. Lägga till ändå?')) return;
    }
    const res = eliteReq.check(entry, list);
    if(!res.ok){
      const msg = 'Krav ej uppfyllda:\n' +
        (res.missing.length ? 'Saknar: ' + res.missing.join(', ') + '\n' : '') +
        (res.master ? '' : 'Ingen av kraven på Mästare-nivå.\n') +
        'Lägga till ändå?';
      if(!confirm(msg)) return;
    }
    list.push({ ...entry });
    storeHelper.setCurrentList(store, list);
  }

  function handle(btn){
    const name=btn.dataset.eliteReq;
    const entry=DB.find(x=>x.namn===name);
    if(!entry) return;
    const groups=parseGroupRequirements(entry.krav_formagor||'');
    if(!groups.length){
      addReq(entry); addElite(entry); updateXP(); location.reload(); return;
    }
    openPopup(groups, levels=>{
      if(!levels) return;
      addReq(entry, levels);
      addElite(entry);
      updateXP();
      location.reload();
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
