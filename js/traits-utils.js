(function(window){
  function renderTraits(){
    if(!dom.traits) return;
    const data = storeHelper.getTraits(store);
    const KEYS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffs\u00e4ker','Vaksam','Viljestark','\u00d6vertygande'];

    const list  = storeHelper.getCurrentList(store);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const counts = {};
    KEYS.forEach(k => { counts[k] = list.filter(p => (p.taggar?.test || []).includes(k)).length; });
    const hasKraftprov = list.some(p => p.namn === 'Kraftprov');

    dom.traits.innerHTML = KEYS.map(k => {
      const val = (data[k] || 0) + (bonus[k] || 0);
      const tal  = hasKraftprov && k === 'Stark'
        ? val + 5
        : Math.max(10, val);
      const pain = Math.ceil(val / 2);
      const extra = k === 'Stark'
        ? `<div class="trait-extra">T\u00e5lighet: ${tal} \u2022 Sm\u00e4rtgr\u00e4ns: ${pain}</div>`
        : '';
      return `
      <div class="trait" data-key="${k}">
        <div class="trait-name">${k}</div>
        <div class="trait-controls">
          <button class="trait-btn" data-d="-5">\u22125</button>
          <button class="trait-btn" data-d="-1">\u22121</button>
          <div class="trait-value">${val}</div>
          <button class="trait-btn" data-d="1">+1</button>
          <button class="trait-btn" data-d="5">+5</button>
        </div>
        ${extra}
        <div class="trait-count">F\u00f6rm\u00e5gor: ${counts[k]}</div>
      </div>`;
    }).join('');

    dom.traitsTot.textContent = KEYS.reduce((sum,k)=>sum+(data[k]||0)+(bonus[k]||0),0);

    if (dom.traitStats) {
      const traits = storeHelper.getTraits(store);
      let base = (traits['Stark'] || 0) + (bonus['Stark'] || 0);
      const hasPack = storeHelper.getCurrentList(store).some(e => e.namn === 'Packåsna');
      if (hasPack) base = Math.ceil(base * 1.5);
      dom.traitStats.textContent = 'Bärkapacitet: ' + base;
    }
  }

  function bindTraits(){
    if(!dom.traits) return;
    dom.traits.addEventListener('click', e => {
      const btn = e.target.closest('.trait-btn');
      if(!btn) return;
      const key = btn.closest('.trait').dataset.key;
      const d   = Number(btn.dataset.d);

      const t   = storeHelper.getTraits(store);
      const bonus = window.exceptionSkill ? exceptionSkill.getBonus(key) : 0;
      const min   = bonus;
      const next  = Math.max(0, (t[key] || 0) + d);
      t[key] = Math.max(min - bonus, next);
      storeHelper.setTraits(store, t);
      renderTraits();
    });
  }

  window.renderTraits = renderTraits;
  window.bindTraits = bindTraits;
})(window);
