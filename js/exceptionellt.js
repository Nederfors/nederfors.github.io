(function(window){
  const TRAITS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffsäker','Vaksam','Viljestark','\u00d6vertygande'];
  const BONUS = { Novis: 1, 'Ges\u00e4ll': 2, 'M\u00e4stare': 3 };

  function createPopup(){
    if(document.getElementById('traitPopup')) return;
    const div=document.createElement('div');
    div.id='traitPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 id="traitTitle" class="picker-popup-title">V\u00e4lj karakt\u00e4rsdrag</h3><button id="traitClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><p class="picker-popup-subtitle">V\u00e4lj vilket karakt\u00e4rsdrag som ska f\u00e5 bonus.</p><div id="traitOpts" class="picker-popup-options"></div><div class="picker-popup-actions"><button id="traitCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(options, cb){
    createPopup();
    const pop=document.getElementById('traitPopup');
    const inner=pop.querySelector('.popup-inner');
    const box=pop.querySelector('#traitOpts');
    const cancelBtn=pop.querySelector('#traitCancel');
    const closeBtn=pop.querySelector('#traitClose');
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
    const opts=TRAITS.slice();
    openPopup(opts, res=>cb(res));
  }

  function getBonuses(list){
    const cur=list||storeHelper.getCurrentList(storeHelper.load());
    const res={};
    cur.forEach(it=>{
      if(it.namn==='Exceptionellt karakt\u00e4rsdrag' && it.trait){
        res[it.trait]=BONUS[it.niv\u00e5]||0;
      }
    });
    return res;
  }

  function getBonus(trait){
    const list=storeHelper.getCurrentList(storeHelper.load());
    return getBonuses(list)[trait]||0;
  }

  window.exceptionSkill={pickTrait,getBonus,getBonuses};
})(window);
