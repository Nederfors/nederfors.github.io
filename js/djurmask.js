(function(window){
  const TRAITS = ['Diskret','Kvick','Listig','Stark','Vaksam'];

  function createPopup(){
    if(document.getElementById('maskPopup')) return;
    const div=document.createElement('div');
    div.id='maskPopup';
    div.innerHTML=`<div class="popup-inner"><h3 id="maskTitle">V\u00e4lj karakt\u00e4rsdrag</h3><div id="maskOpts"></div><button id="maskCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(options, cb){
    createPopup();
    const pop=document.getElementById('maskPopup');
    const box=pop.querySelector('#maskOpts');
    const cls=pop.querySelector('#maskCancel');
    box.innerHTML=options.map((n,i)=>`<button data-i="${i}" class="char-btn">${n}</button>`).join('');
    pop.classList.add('open');
    function close(){
      pop.classList.remove('open');
      box.innerHTML='';
      box.removeEventListener('click',onClick);
      cls.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
    }
    function onClick(e){
      const b=e.target.closest('button[data-i]'); if(!b) return;
      const idx=Number(b.dataset.i); close(); cb(options[idx]);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){ if(!pop.querySelector('.popup-inner').contains(e.target)){ close(); cb(null); } }
    box.addEventListener('click',onClick);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
  }

  function pickTrait(used, cb){
    openPopup(TRAITS, trait=>{
      if(!trait) { cb(null); return; }
      if(used.includes(trait) && !confirm('Du har redan en Djurmask med detta karakt\u00e4rsdrag. L\u00e4gga till \u00e4nd\u00e5?')){
        cb(null); return;
      }
      cb(trait);
    });
  }

  function getBonuses(inv){
    const list = inv || storeHelper.getInventory(store);
    const res = {};
    list.forEach(row => {
      if(row.name === 'Djurmask' && row.trait){
        res[row.trait] = (res[row.trait]||0) + 1;
      }
    });
    return res;
  }

  function getBonus(trait, inv){
    return getBonuses(inv)[trait] || 0;
  }

  window.animalMask = { pickTrait, getBonuses, getBonus };
})(window);
