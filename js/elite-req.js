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

  const parse = (str) => {
    if (typeof utils.parseRequirements === 'function') {
      return utils.parseRequirements(str);
    }
    const groups = splitComma(str || '');
    return groups.map(g => splitOr(g));
  };

  const normalize = (name) => {
    if (typeof utils.expandRequirement === 'function') {
      return utils.expandRequirement(name);
    }
    if (typeof utils.normalizeRequirement === 'function') {
      return utils.normalizeRequirement(name);
    }
    const m2 = String(name || '').match(/^Mystisk kraft\s*\(([^)]+)\)/i);
    if (m2) {
      const inner = m2[1].trim();
      if (inner.toLowerCase() === 'valfri') return [{ anyMystic: true }];
      const normalized = inner.replace(/\boch\b/gi, ',');
      const opts = [].concat(...splitComma(normalized).map(h => splitOr(h)));
      return opts.map(o => ({ names: [o] }));
    }
    const r = String(name || '').match(/^Ritualist\s*\(([^)]+)\)/i);
    if (r) {
      const inner = r[1].trim();
      if (inner.toLowerCase() === 'valfri') return [{ anyRitual: true }];
      const normalized = inner.replace(/\boch\b/gi, ',');
      const opts = [].concat(...splitComma(normalized).map(h => splitOr(h)));
      return opts.map(o => ({ names: [o] }));
    }
    if (/^Ritualist$/i.test(String(name || '').trim())) return [{ anyRitual: true }];
    return [{ names: [name] }];
  };

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
            const hasAny = list.some(x => (x.taggar?.typ||[]).includes('Mystisk kraft'));
            if (hasAny && list.some(x => (x.taggar?.typ||[]).includes('Mystisk kraft') && x.nivå === 'Mästare')) {
              hasMaster = true;
            }
            return hasAny;
          }
          if(v.anyRitual){
            const hasAny = list.some(x => (x.taggar?.typ||[]).includes('Ritual'));
            if (hasAny && list.some(x => (x.taggar?.typ||[]).includes('Ritual') && x.nivå === 'Mästare')) {
              hasMaster = true;
            }
            return hasAny;
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

  // Minimal XP needed to qualify for an elityrke, considering current character list.
  // Grund:
  //  • 50 (elityrke)
  //  • +10 per krav-grupp (inkl. ritualer och grupper med "eller")
  // Avdrag om redan uppfyllt:
  //  • Förmåga/Mystisk kraft/Monstruöst särdrag: Novis -10, Gesäll -30, Mästare -60
  //  • Ritual: -10
  // Begränsning: Endast EN förmåga får räkna över Novis (dvs > -10); övriga stannar på -10.
  function minXP(entry, list){
    try {
      const req = parse(entry?.krav_formagor || '') || [];
      const groups = req.filter(g => Array.isArray(g) && g.some(n => String(n || '').trim().length > 0));
      const base = 50 + groups.length * 10;
      const pcList = Array.isArray(list) ? list : [];

      // Helper: deduce type/deduction for a concrete item name
      const deductionForItem = (item) => {
        if (!item) return { kind:'none', ded:0, adv:false };
        const types = (item.taggar?.typ || []);
        if (types.includes('Ritual')) {
          return { kind:'ritual', ded:10, adv:false };
        }
        const isAbility = types.includes('Förmåga') || types.includes('Mystisk kraft') || types.includes('Monstruöst särdrag');
        if (isAbility) {
          const lvl = item.nivå || '';
          const ded = lvl === 'Mästare' ? 60 : (lvl === 'Gesäll' ? 30 : 10);
          return { kind:'ability', ded, adv: ded > 10 };
        }
        // Fallback: treat as simple requirement worth 10
        return { kind:'other', ded:10, adv:false };
      };

      // Helper: best deduction for a variant (anyMystic/anyRitual or specific names)
      const bestForVariant = (v) => {
        if (v.anyMystic) {
          let best = { kind:'ability', ded:0, adv:false };
          pcList.forEach(it => {
            if ((it.taggar?.typ || []).includes('Mystisk kraft')) {
              const d = deductionForItem(it);
              if (d.ded > best.ded) best = d;
            }
          });
          return best;
        }
        if (v.anyRitual) {
          const has = pcList.some(it => (it.taggar?.typ || []).includes('Ritual'));
          return has ? { kind:'ritual', ded:10, adv:false } : { kind:'ritual', ded:0, adv:false };
        }
        // Specific names (usually single-name variants)
        const items = (v.names || []).map(nm => pcList.find(it => it.namn === nm)).filter(Boolean);
        if (!items.length) return { kind:'none', ded:0, adv:false };
        // If multiple names somehow, sum their deductions but keep kind='ability' if any ability
        let total = 0; let adv=false; let kind='other';
        items.forEach(it => {
          const d = deductionForItem(it);
          total += d.ded;
          adv = adv || d.adv;
          if (d.kind === 'ability') kind = 'ability';
          else if (d.kind === 'ritual' && kind !== 'ability') kind = 'ritual';
        });
        return { kind, ded: total, adv };
      };

      // Compute best match per group
      const groupBest = groups.map(g => {
        const variants = [].concat(...g.map(name => normalize(name)));
        let best = { kind:'none', ded:0, adv:false };
        variants.forEach(v => {
          const cur = bestForVariant(v);
          if (cur.ded > best.ded) best = cur;
        });
        return best;
      });

      // Enforce "only one advanced ability counts beyond Novis"
      const advancedIdx = groupBest
        .map((gb, i) => ({ i, gb }))
        .filter(o => o.gb.kind === 'ability' && o.gb.ded > 10)
        .sort((a,b) => b.gb.ded - a.gb.ded)
        .map(o => o.i);
      if (advancedIdx.length > 1) {
        for (let k = 1; k < advancedIdx.length; k++) {
          const idx = advancedIdx[k];
          // downgrade to Novis deduction (10)
          groupBest[idx] = { ...groupBest[idx], ded:10, adv:false };
        }
      }

      const totalDed = groupBest.reduce((sum, gb) => sum + (gb.ded || 0), 0);
      const res = base - totalDed;
      return res > 0 ? res : 0;
    } catch {
      return 50;
    }
  }

  function isElite(entry){
    return (entry.taggar?.typ || []).includes('Elityrke');
  }

  function canChange(list){
    const elites = list.filter(isElite);
    return elites.every(el => check(el, list).ok);
  }

  window.eliteReq = {check, canChange, parse, splitComma, splitOr, minXP};
})(window);
