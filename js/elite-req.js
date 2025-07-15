(function(window){
  function splitComma(str){
    const out = [];
    let buf = '';
    let depth = 0;
    for(let i=0;i<str.length;i++){
      const ch = str[i];
      if(ch==='(') depth++;
      if(ch===')') depth--;
      if(ch===',' && depth===0){
        if(buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if(buf.trim()) out.push(buf.trim());
    return out;
  }

  function splitOr(str){
    const out = [];
    let buf = '';
    let depth = 0;
    const lower = str.toLowerCase();
    for(let i=0;i<str.length;){
      if(lower.startsWith(' eller ', i) && depth===0){
        if(buf.trim()) out.push(buf.trim());
        buf = '';
        i += 7; // length of ' eller '
        continue;
      }
      const ch = str[i];
      if(ch==='(') depth++;
      if(ch===')') depth--;
      buf += ch;
      i++;
    }
    if(buf.trim()) out.push(buf.trim());
    return out;
  }

  function parse(str){
    const groups = splitComma(str);
    return groups.map(g => {
      let arr = splitOr(g);
      return arr;
    });
  }

  // Expand a requirement into one or more variants.
  // Returned objects either specify a set of names that must all exist
  // or the special flags `anyMystic` / `anyRitual` for generic matches.
  function normalize(name){
    const m2 = name.match(/^Mystisk kraft\s*\(([^)]+)\)/i);
    if(m2){
      const inner = m2[1].trim();
      if(inner.toLowerCase()==='valfri')
        return [{anyMystic:true}];
      const opts = splitOr(inner);
      return opts.map(o => ({names:[o]}));
    }

    const r = name.match(/^Ritualist\s*\(([^)]+)\)/i);
    if(r){
      const inner = r[1].trim();
      if(inner.toLowerCase()==='valfri')
        return [{anyRitual:true}];
      const opts = splitOr(inner);
      return opts.map(o => ({names:[o]}));
    }

    if(/^Ritualist$/i.test(name.trim()))
      return [{anyRitual:true}];

    return [{names:[name]}];
  }

  function check(entry, list){
    const req = parse(entry.krav_formagor||'');
    if(!req.length) return {ok:true};
    const missing = [];
    let hasMaster = false;
    req.forEach(group => {
      const found = group.find(name => {
        const variants = normalize(name);
        // each requirement can expand into several variants
        // (e.g. "Mystisk kraft (A eller B)" or "Mystisk kraft (valfri)")
        return variants.some(v => {
          if(v.anyMystic){
            const item = list.find(x => (x.taggar?.typ||[]).includes('Mystisk kraft'));
            if(item && item.nivå === 'Mästare') hasMaster = true;
            return !!item;
          }
          if(v.anyRitual){
            const item = list.find(x => (x.taggar?.typ||[]).includes('Ritual'));
            if(item && item.nivå === 'Mästare') hasMaster = true;
            return !!item;
          }
          const okOne = v.names.every(nm => {
            const item = list.find(x => x.namn === nm);
            if(item && item.nivå === 'Mästare') hasMaster = true;
            return !!item;
          });
          return okOne;
        });
      });
      if(!found) missing.push(group.join(' eller '));
    });
    const ok = missing.length===0 && hasMaster;
    return {ok, missing, master: hasMaster};
  }

  function isElite(entry){
    return (entry.taggar?.typ || []).includes('Elityrke');
  }

  function canChange(list){
    const elites = list.filter(isElite);
    return elites.every(el => check(el, list).ok);
  }

  window.eliteReq = {check, canChange, parse, splitComma, splitOr};
})(window);
