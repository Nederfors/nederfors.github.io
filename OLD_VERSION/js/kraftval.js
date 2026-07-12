(function(window){
  function createPopup(){
    if(document.getElementById('powerPopup')) return;
    const div=document.createElement('div');
    div.id='powerPopup';
    div.innerHTML=`<div class="popup-inner"><h3 id="powerTitle"></h3><input id="powerSearch" type="text" placeholder="Sök..."><div id="powerOpts"></div><button id="powerCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(list,title,cb){
    createPopup();
    const pop=document.getElementById('powerPopup');
    const box=pop.querySelector('#powerOpts');
    const search=pop.querySelector('#powerSearch');
    const cls=pop.querySelector('#powerCancel');
    pop.querySelector('#powerTitle').textContent=title;
    let current=list;
    function render(f=''){
      const fl=f.trim().toLowerCase();
      current=list.filter(n=>n.toLowerCase().includes(fl));
      box.innerHTML=current.map((n,i)=>`<button data-i="${i}" class="char-btn">${n}</button>`).join('');
    }
    render();
    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop=0;
    function close(){
      pop.classList.remove('open');
      box.innerHTML='';
      search.value='';
      box.removeEventListener('click',onClick);
      cls.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
      search.removeEventListener('input',onSearch);
    }
    function onClick(e){
      const b=e.target.closest('button[data-i]');
      if(!b) return;
      const idx=Number(b.dataset.i);
      close();
      cb(current[idx]);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){ if(!pop.querySelector('.popup-inner').contains(e.target)){ close(); cb(null); } }
    function onSearch(){ render(search.value); }
    box.addEventListener('click',onClick);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
    search.addEventListener('input',onSearch);
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
