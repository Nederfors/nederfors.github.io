(function(window){
  const TRAITS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffsäker','Vaksam','Viljestark','\u00d6vertygande'];
  const BONUS = { Novis: 1, 'Ges\u00e4ll': 2, 'M\u00e4stare': 3 };

  function createPopup(){
    if(document.getElementById('traitPopup')) return;
    const div=document.createElement('div');
    div.id='traitPopup';
    div.innerHTML=`<div class="popup-inner"><h3 id="traitTitle">V\u00e4lj karakt\u00e4rsdrag</h3><div id="traitOpts"></div><button id="traitCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(options, cb){
    createPopup();
    const pop=document.getElementById('traitPopup');
    const box=pop.querySelector('#traitOpts');
    const cls=pop.querySelector('#traitCancel');
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
      const b=e.target.closest('button[data-i]');
      if(!b) return;
      const idx=Number(b.dataset.i);
      close();
      cb(options[idx]);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        close();
        cb(null);
      }
    }
    box.addEventListener('click',onClick);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
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
