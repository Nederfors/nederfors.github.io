(function (window) {
  function splitComma(str) {
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
  }

  function splitOr(str) {
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
  }

  function parseRequirements(str) {
    return splitComma(str || '')
      .map(group => splitOr(group || '').map(item => item.trim()).filter(Boolean))
      .filter(group => group.length > 0);
  }

  function expandRequirement(rawName) {
    const name = String(rawName || '').trim();
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
  }

  function formatRequirementGroup(group) {
    const items = (Array.isArray(group) ? group : [])
      .map(item => String(item || '').trim())
      .filter(Boolean);
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    return items.join(' eller ');
  }

  window.eliteUtils = Object.freeze({
    splitComma,
    splitOr,
    parseRequirements,
    parseElityrkeRequirements: parseRequirements,
    expandRequirement,
    normalizeRequirement: expandRequirement,
    formatRequirementGroup
  });
})(window);
