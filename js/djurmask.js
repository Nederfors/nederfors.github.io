(function(window){
  const TRAITS = ['Diskret','Kvick','Listig','Stark','Vaksam'];

  function createPopup(){
    if(document.getElementById('maskPopup')) return;
    const div=document.createElement('div');
    div.id='maskPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 id="maskTitle" class="picker-popup-title">V\u00e4lj karakt\u00e4rsdrag</h3><button id="maskClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><p class="picker-popup-subtitle">V\u00e4lj vilket karakt\u00e4rsdrag som ska f\u00e5 +1.</p><div id="maskOpts" class="picker-popup-options"></div><div class="picker-popup-actions"><button id="maskCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(options, cb){
    createPopup();
    const pop=document.getElementById('maskPopup');
    const inner=pop.querySelector('.popup-inner');
    const box=pop.querySelector('#maskOpts');
    const cancelBtn=pop.querySelector('#maskCancel');
    const closeBtn=pop.querySelector('#maskClose');
    box.innerHTML=options.map((n,i)=>`<button data-i="${i}" class="char-btn" type="button">${n}</button>`).join('');
    pop.classList.add('open');
    if(inner) inner.scrollTop = 0;
    let done=false;
    function finish(result){
      if(done) return;
      done=true;
      pop.classList.remove('open');
      box.innerHTML='';
      box.removeEventListener('click',onClick);
      cancelBtn.removeEventListener('click',onCancel);
      closeBtn.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
      window.registerOverlayCleanup?.(pop, null);
      cb(result);
    }
    function onClick(e){
      const b=e.target.closest('button[data-i]');
      if(!b) return;
      const idx=Number(b.dataset.i);
      finish(options[idx]);
    }
    function onCancel(){ finish(null); }
    function onOutside(e){
      if(e.target===pop){
        finish(null);
      }
    }
    function onOverlayClose(){ finish(null); }
    box.addEventListener('click',onClick);
    cancelBtn.addEventListener('click',onCancel);
    closeBtn.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
    window.registerOverlayCleanup?.(pop, onOverlayClose);
  }

  function pickTrait(used, cb){
    openPopup(TRAITS, res=>cb(res));
  }

  function resolveInventoryEntry(item){
    const ref = item?.id || item?.name || '';
    if (window.invUtil && typeof window.invUtil.getEntry === 'function') {
      return window.invUtil.getEntry(ref);
    }
    if (typeof window.lookupEntry === 'function') {
      return window.lookupEntry({ id: item?.id, name: item?.name }, { explicitName: item?.name });
    }
    return {};
  }

  function getTraitBonusForItem(item, entry){
    const trait = String(item?.trait || '').trim();
    if (!trait || !entry || typeof entry !== 'object') return 0;
    const helper = window.rulesHelper;

    if (helper && typeof helper.queryMal === 'function') {
      try {
        const sourceEntry = { ...entry };
        if (item?.nivå) sourceEntry.nivå = item.nivå;
        const value = Number(helper.queryMal([sourceEntry], 'karaktarsdrag_max_tillagg', { trait, row: item, sourceEntry }));
        if (Number.isFinite(value) && value !== 0) return value;
      } catch (_) {
        // Fall through to local fallback.
      }
    }

    if (Array.isArray(entry.traits) && entry.traits.includes(trait)) return 1;
    return 0;
  }

  function getBonuses(inv){
    const cur=inv||storeHelper.getInventory(storeHelper.load());
    const res={};
    cur.forEach(it=>{
      const trait = String(it?.trait || '').trim();
      if (!trait) return;
      const entry = resolveInventoryEntry(it);
      const bonus = getTraitBonusForItem(it, entry);
      if (!bonus) return;
      res[trait] = (res[trait] || 0) + bonus;
    });
    return res;
  }

  function getBonus(trait){
    const inv=storeHelper.getInventory(storeHelper.load());
    return getBonuses(inv)[trait]||0;
  }

  window.maskSkill={pickTrait,getBonuses,getBonus};
})(window);
