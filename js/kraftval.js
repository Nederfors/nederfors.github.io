(function(window){
  function createPopup(){
    if(document.getElementById('powerPopup')) return;
    const div=document.createElement('div');
    div.id='powerPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 id="powerTitle" class="picker-popup-title"></h3><button id="powerClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><label for="powerSearch" class="picker-popup-search-label">S\u00f6k</label><input id="powerSearch" class="picker-popup-search-input" type="search" placeholder="S\u00f6k..." autocomplete="off" spellcheck="false"><div id="powerOpts" class="picker-popup-options"></div><p id="powerEmpty" class="picker-popup-empty" hidden>Inga alternativ matchar s\u00f6kningen.</p><div class="picker-popup-actions"><button id="powerCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(list,title,cb){
    createPopup();
    const pop=document.getElementById('powerPopup');
    const inner=pop.querySelector('.popup-inner');
    const box=pop.querySelector('#powerOpts');
    const search=pop.querySelector('#powerSearch');
    const empty=pop.querySelector('#powerEmpty');
    const cancelBtn=pop.querySelector('#powerCancel');
    const closeBtn=pop.querySelector('#powerClose');
    pop.querySelector('#powerTitle').textContent=title;
    let current=list;
    function render(f=''){
      const fl=f.trim().toLowerCase();
      current=list.filter(n=>n.toLowerCase().includes(fl));
      box.innerHTML=current.map((n,i)=>`<button data-i="${i}" class="char-btn" type="button">${n}</button>`).join('');
      empty.hidden = current.length !== 0;
    }
    render();
    pop.classList.add('open');
    if(inner) inner.scrollTop=0;
    let done=false;
    function finish(result){
      if(done) return;
      done=true;
      pop.classList.remove('open');
      box.innerHTML='';
      search.value='';
      box.removeEventListener('click',onClick);
      cancelBtn.removeEventListener('click',onCancel);
      closeBtn.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
      search.removeEventListener('input',onSearch);
      window.registerOverlayCleanup?.(pop, null);
      cb(result);
    }
    function onClick(e){
      const b=e.target.closest('button[data-i]');
      if(!b) return;
      const idx=Number(b.dataset.i);
      finish(current[idx]);
    }
    function onCancel(){
      finish(null);
    }
    function onOutside(e){
      if(e.target===pop){
        finish(null);
      }
    }
    function onOverlayClose(){
      finish(null);
    }
    function onSearch(){ render(search.value); }
    box.addEventListener('click',onClick);
    cancelBtn.addEventListener('click',onCancel);
    closeBtn.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
    search.addEventListener('input',onSearch);
    window.registerOverlayCleanup?.(pop, onOverlayClose);
    search.focus();
  }

  function pickKraft(used,cb){
    const list=(window.DB||[]).filter(ent=> (ent.taggar?.typ||[]).includes('Mystisk kraft')).map(ent=>ent.namn).sort();
    openPopup(list,'Välj formel',res=>cb(res));
  }

  function pickRitual(used,cb){
    const list=(window.DB||[]).filter(ent=> (ent.taggar?.typ||[]).includes('Ritual')).map(ent=>ent.namn).sort();
    openPopup(list,'Välj ritual',res=>cb(res));
  }

  window.powerPicker={pickKraft,pickRitual};
})(window);
